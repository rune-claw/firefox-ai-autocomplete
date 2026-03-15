const DEFAULTS = {
  apiKey: "",
  model: "google/gemini-2.0-flash-001",
  contextMode: "textbox",
  debounceMs: 400,
  maxTokens: 150,
  temperature: 0.3,
  enabled: true,
  systemPrompt: ""
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

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await browser.storage.local.get(DEFAULTS);

  document.getElementById("apiKey").value = settings.apiKey;
  document.getElementById("model").value = settings.model;
  document.getElementById("contextMode").value = settings.contextMode;
  document.getElementById("debounceMs").value = settings.debounceMs;
  document.getElementById("maxTokens").value = settings.maxTokens;
  document.getElementById("temperature").value = settings.temperature;
  document.getElementById("systemPrompt").value = settings.systemPrompt;

  const form = document.getElementById("settings");
  const savedMsg = document.getElementById("savedMsg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    await browser.storage.local.set({
      apiKey: document.getElementById("apiKey").value.trim(),
      model: document.getElementById("model").value.trim() || DEFAULTS.model,
      contextMode: document.getElementById("contextMode").value,
      debounceMs: parseInt(document.getElementById("debounceMs").value) || DEFAULTS.debounceMs,
      maxTokens: parseInt(document.getElementById("maxTokens").value) || DEFAULTS.maxTokens,
      temperature: parseFloat(document.getElementById("temperature").value) || DEFAULTS.temperature,
      systemPrompt: document.getElementById("systemPrompt").value.trim(),
      enabled: true
    });

    savedMsg.classList.add("show");
    setTimeout(() => savedMsg.classList.remove("show"), 2000);
  });

  document.getElementById("resetBtn").addEventListener("click", () => {
    document.getElementById("apiKey").value = "";
    document.getElementById("model").value = DEFAULTS.model;
    document.getElementById("contextMode").value = DEFAULTS.contextMode;
    document.getElementById("debounceMs").value = DEFAULTS.debounceMs;
    document.getElementById("maxTokens").value = DEFAULTS.maxTokens;
    document.getElementById("temperature").value = DEFAULTS.temperature;
    document.getElementById("systemPrompt").value = "";
  });

  document.getElementById("resetPromptBtn").addEventListener("click", () => {
    document.getElementById("systemPrompt").value = "";
  });
});
