/**
 * background.js — Handles OpenRouter API calls.
 * Content script sends messages here; we return completions.
 */

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const DEFAULT_MODEL = "google/gemini-2.0-flash-001";
const DEFAULT_SYSTEM_PROMPT = `You are an inline text autocomplete engine. Given the text the user has typed so far, predict what they would type next. 

Rules:
- Output ONLY the continuation text, nothing else.
- Keep suggestions short: 1-2 sentences max.
- Match the tone and style of the existing text.
- If the text appears to be code, suggest code completions.
- If the text appears to be natural language, suggest natural language completions.
- Do not repeat what the user has already written.
- Do not wrap your response in quotes or add explanations.`;

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
  // Cancel any in-flight request
  handleCancel();
  abortController = new AbortController();

  try {
    const settings = await getSettings();

    if (!settings.apiKey) {
      return { error: "No API key configured. Open settings to add your OpenRouter key." };
    }

    const messages = buildMessages(text, pageContext, contextMode);

    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${settings.apiKey}`,
        "HTTP-Referer": "https://github.com/sudopositon/firefox-ai-autocomplete",
        "X-Title": "AI Text Autocomplete"
      },
      body: JSON.stringify({
        model: settings.model || DEFAULT_MODEL,
        messages,
        max_tokens: settings.maxTokens || 150,
        temperature: settings.temperature ?? 0.3,
        stop: ["\n\n", "</s>"],
        stream: false
      }),
      signal: abortController.signal
    });

    if (!response.ok) {
      const err = await response.text();
      return { error: `API error (${response.status}): ${err}` };
    }

    const data = await response.json();
    const completion = data.choices?.[0]?.message?.content?.trim();

    if (!completion) {
      return { error: "Empty response from model." };
    }

    return { completion };

  } catch (err) {
    if (err.name === "AbortError") {
      return { error: "cancelled" };
    }
    return { error: err.message };
  }
}

function handleCancel() {
  if (abortController) {
    abortController.abort();
    abortController = null;
  }
}

function buildMessages(text, pageContext, contextMode) {
  const systemPrompt = `You are an inline text autocomplete engine. Given the text the user has typed so far, predict what they would type next. 

Rules:
- Output ONLY the continuation text, nothing else.
- Keep suggestions short: 1-2 sentences max.
- Match the tone and style of the existing text.
- If the text appears to be code, suggest code completions.
- If the text appears to be natural language, suggest natural language completions.
- Do not repeat what the user has already written.
- Do not wrap your response in quotes or add explanations.
- Never add a closing quote unless the user text started with an unmatched opening quote.`;

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
    apiKey: "",
    model: DEFAULT_MODEL,
    contextMode: "textbox",
    maxTokens: 150,
    temperature: 0.3,
    debounceMs: 400,
    shortcutKey: "Tab",
    enabled: true
  };

  const stored = await browser.storage.local.get(defaults);
  return stored;
}
