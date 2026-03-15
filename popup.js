document.addEventListener("DOMContentLoaded", async () => {
  const settings = await browser.storage.local.get({ apiKey: "", enabled: true, model: "" });
  
  const status = document.getElementById("status");
  const toggle = document.getElementById("toggle");
  const optionsBtn = document.getElementById("optionsBtn");

  toggle.checked = settings.enabled;

  if (!settings.apiKey) {
    status.className = "status missing";
    status.textContent = "⚠️ No API key — click Settings to add one.";
  } else if (!settings.enabled) {
    status.className = "status disabled";
    status.textContent = "⏸ Autocomplete is disabled.";
  } else {
    status.className = "status ok";
    status.textContent = `✓ Active — ${settings.model || "google/gemini-2.0-flash-001"}`;
  }

  toggle.addEventListener("change", async () => {
    await browser.storage.local.set({ enabled: toggle.checked });
  });

  optionsBtn.addEventListener("click", () => {
    browser.runtime.openOptionsPage();
    window.close();
  });
});
