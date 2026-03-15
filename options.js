const PROVIDERS = {
  openrouter: {
    name: "OpenRouter",
    defaultModel: "google/gemini-2.0-flash-001",
    apiKeyHint: 'Get one at <a href="https://openrouter.ai/keys" target="_blank">openrouter.ai/keys</a>',
    modelHint: 'Any model on <a href="https://openrouter.ai/models" target="_blank">OpenRouter</a>. Cheaper/faster = better for completions.',
    modelPlaceholder: "google/gemini-2.0-flash-001",
    keyPlaceholder: "sk-or-v1-..."
  },
  inception: {
    name: "Inception (Mercury)",
    defaultModel: "mercury-coder-small",
    apiKeyHint: 'Get one at <a href="https://docs.inceptionlabs.ai" target="_blank">Inception Labs</a>',
    modelHint: 'Models: <code>mercury-coder-small</code>, <code>mercury-2</code>. Built for speed — 1000+ tok/s.',
    modelPlaceholder: "mercury-coder-small",
    keyPlaceholder: "ina-..."
  },
  openai: {
    name: "OpenAI",
    defaultModel: "gpt-4o-mini",
    apiKeyHint: 'Get one at <a href="https://platform.openai.com/api-keys" target="_blank">platform.openai.com</a>',
    modelHint: 'e.g. <code>gpt-4o-mini</code>, <code>gpt-4o</code>, <code>gpt-3.5-turbo</code>',
    modelPlaceholder: "gpt-4o-mini",
    keyPlaceholder: "sk-..."
  },
  custom: {
    name: "Custom",
    defaultModel: "",
    apiKeyHint: "Your API key for this provider.",
    modelHint: "The model name as expected by your API.",
    modelPlaceholder: "model-name",
    keyPlaceholder: "your-api-key"
  }
};

const DEFAULTS = {
  provider: "openrouter",
  apiKey: "",
  customUrl: "",
  model: "",
  contextMode: "textbox",
  debounceMs: 400,
  maxTokens: 150,
  temperature: 0.3,
  enabled: true,
  systemPrompt: ""
};

function updateProviderUI(providerId) {
  const p = PROVIDERS[providerId] || PROVIDERS.openrouter;
  const isCustom = providerId === "custom";

  document.getElementById("customUrlField").style.display = isCustom ? "block" : "none";
  document.getElementById("apiKeyHint").innerHTML = p.apiKeyHint;
  document.getElementById("modelHint").innerHTML = p.modelHint;
  document.getElementById("model").placeholder = p.modelPlaceholder;
  document.getElementById("apiKey").placeholder = p.keyPlaceholder;
}

document.addEventListener("DOMContentLoaded", async () => {
  const settings = await browser.storage.local.get(DEFAULTS);

  document.getElementById("provider").value = settings.provider;
  document.getElementById("apiKey").value = settings.apiKey;
  document.getElementById("customUrl").value = settings.customUrl;
  document.getElementById("model").value = settings.model;
  document.getElementById("contextMode").value = settings.contextMode;
  document.getElementById("debounceMs").value = settings.debounceMs;
  document.getElementById("maxTokens").value = settings.maxTokens;
  document.getElementById("temperature").value = settings.temperature;
  document.getElementById("systemPrompt").value = settings.systemPrompt;

  updateProviderUI(settings.provider);

  document.getElementById("provider").addEventListener("change", (e) => {
    updateProviderUI(e.target.value);
  });

  const form = document.getElementById("settings");
  const savedMsg = document.getElementById("savedMsg");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const provider = document.getElementById("provider").value;
    const providerDefaults = PROVIDERS[provider] || PROVIDERS.openrouter;

    await browser.storage.local.set({
      provider,
      apiKey: document.getElementById("apiKey").value.trim(),
      customUrl: document.getElementById("customUrl").value.trim(),
      model: document.getElementById("model").value.trim() || providerDefaults.defaultModel,
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
    document.getElementById("provider").value = DEFAULTS.provider;
    document.getElementById("apiKey").value = "";
    document.getElementById("customUrl").value = "";
    document.getElementById("model").value = "";
    document.getElementById("contextMode").value = DEFAULTS.contextMode;
    document.getElementById("debounceMs").value = DEFAULTS.debounceMs;
    document.getElementById("maxTokens").value = DEFAULTS.maxTokens;
    document.getElementById("temperature").value = DEFAULTS.temperature;
    document.getElementById("systemPrompt").value = "";
    updateProviderUI(DEFAULTS.provider);
  });

  document.getElementById("resetPromptBtn").addEventListener("click", () => {
    document.getElementById("systemPrompt").value = "";
  });
});
