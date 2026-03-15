/**
 * background.js — Handles API calls to multiple providers.
 * Content script sends messages here; we return completions.
 */

const PROVIDERS = {
  openrouter: {
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1/chat/completions",
    defaultModel: "google/gemini-2.0-flash-001",
    // OpenRouter uses nested reasoning.effort
    reasoningFormat: "nested",
    buildHeaders: (apiKey) => ({
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      "HTTP-Referer": "https://github.com/rune-claw/firefox-ai-autocomplete",
      "X-Title": "AI Text Autocomplete"
    })
  },
  inception: {
    name: "Inception (Mercury)",
    url: "https://api.inceptionlabs.ai/v1/chat/completions",
    defaultModel: "mercury-2",
    // Inception uses top-level reasoning_effort (OpenAI-style)
    reasoningFormat: "topLevel",
    buildHeaders: (apiKey) => ({
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    })
  },
  openai: {
    name: "OpenAI",
    url: "https://api.openai.com/v1/chat/completions",
    defaultModel: "gpt-4o-mini",
    reasoningFormat: "topLevel",
    buildHeaders: (apiKey) => ({
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    })
  },
  custom: {
    name: "Custom (OpenAI-compatible)",
    url: "",
    defaultModel: "",
    reasoningFormat: "topLevel",
    buildHeaders: (apiKey) => ({
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    })
  }
};

const DEFAULT_SYSTEM_PROMPT = `You are an inline text autocomplete engine. Given the text the user has typed so far, predict what they would type next.

Rules:
- Output ONLY the continuation text, nothing else.
- Keep suggestions short: 1-2 sentences max.
- Match the tone and style of the existing text.
- If the text appears to be code, suggest code completions.
- If the text appears to be natural language, suggest natural language completions.
- Do not repeat what the user has already written.
- Do not wrap your response in quotes or add explanations.
- Never add a closing quote unless the user text started with an unmatched opening quote.`;

let abortController = null;

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "complete") {
    return handleComplete(message);
  }
  if (message.type === "cancel") {
    handleCancel();
    return Promise.resolve({ ok: true });
  }
});

async function handleComplete({ text, pageContext, contextMode }) {
  handleCancel();
  abortController = new AbortController();

  try {
    const settings = await getSettings();
    const provider = PROVIDERS[settings.provider] || PROVIDERS.openrouter;

    if (!settings.apiKey) {
      return { error: `No API key configured. Open settings to add your ${provider.name} key.` };
    }

    const url = settings.provider === "custom" ? settings.customUrl : provider.url;
    if (!url) {
      return { error: "No API endpoint configured. Set a custom URL in settings." };
    }

    const messages = buildMessages(text, pageContext, contextMode, settings.systemPrompt);
    const headers = provider.buildHeaders(settings.apiKey);
    const model = settings.model || provider.defaultModel;

    // Build request body
    const body = {
      model,
      messages,
      max_tokens: settings.maxTokens || 150,
      temperature: settings.temperature ?? 0.3,
      stop: ["\n\n", "</s>"],
      stream: false
    };

    // Add reasoning effort based on provider format
    const effort = settings.reasoningEffort || "low";
    if (effort !== "none") {
      if (provider.reasoningFormat === "nested") {
        // OpenRouter format: { reasoning: { effort: "low" } }
        body.reasoning = { effort };
      } else {
        // OpenAI/Inception format: { reasoning_effort: "low" }
        body.reasoning_effort = effort;
      }
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: abortController.signal
    });

    if (!response.ok) {
      let errMsg = `HTTP ${response.status}`;
      try {
        const errData = await response.json();
        errMsg = errData.error?.message || errData.message || errMsg;
      } catch (_) {
        try {
          const errText = await response.text();
          if (errText) errMsg = errText.slice(0, 200);
        } catch (_) {}
      }
      return { error: errMsg };
    }

    const data = await response.json();

    console.log("[AI Autocomplete] Response:", JSON.stringify(data).slice(0, 500));

    const completion = data.choices?.[0]?.message?.content?.trim();

    if (!completion) {
      if (data.error) {
        return { error: data.error?.message || JSON.stringify(data.error).slice(0, 100) };
      }
      if (!data.choices || data.choices.length === 0) {
        return { error: "Model returned no choices. Try a different model." };
      }
      return { error: "Model returned empty content." };
    }

    return { completion };

  } catch (err) {
    if (err.name === "AbortError") {
      return { error: "cancelled" };
    }
    return { error: err.message || "Network error" };
  }
}

function handleCancel() {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}

function buildMessages(text, pageContext, contextMode, customPrompt) {
  const systemPrompt = customPrompt || DEFAULT_SYSTEM_PROMPT;

  let userMessage = text;

  if (contextMode === "page" && pageContext) {
    userMessage = `Page context:\n${pageContext}\n\n---\n\nText so far:\n${text}`;
  }

  return [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage }
  ];
}

async function getSettings() {
  const defaults = {
    provider: "openrouter",
    apiKey: "",
    customUrl: "",
    model: "",
    contextMode: "textbox",
    maxTokens: 150,
    temperature: 0.3,
    reasoningEffort: "low",
    debounceMs: 400,
    shortcutKey: "Tab",
    enabled: true,
    systemPrompt: ""
  };

  const stored = await browser.storage.local.get(defaults);
  return stored;
}
