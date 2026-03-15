/**
 * content.js — Detects text input, sends to background, renders ghost text.
 */

(function () {
  "use strict";

  let ghostEl = null;
  let activeElement = null;
  let debounceTimer = null;
  let currentCompletion = "";
  let isEnabled = true;
  let settings = {};

  // ─── Init ────────────────────────────────────────────────────────────────

  loadSettings();

  browser.storage.onChanged.addListener(() => loadSettings());

  async function loadSettings() {
    settings = await browser.storage.local.get({
      contextMode: "textbox",
      debounceMs: 400,
      enabled: true
    });
    isEnabled = settings.enabled;
  }

  // ─── Focus tracking ──────────────────────────────────────────────────────

  document.addEventListener("focusin", (e) => {
    const el = e.target;
    if (isEditable(el)) {
      activeElement = el;
      createGhost();
    } else {
      clearGhost();
      activeElement = null;
    }
  });

  document.addEventListener("focusout", (e) => {
    // Small delay so clicking the ghost or other extension UI doesn't kill it
    setTimeout(() => {
      if (document.activeElement !== ghostEl) {
        clearGhost();
        activeElement = null;
      }
    }, 100);
  });

  // ─── Input handling ──────────────────────────────────────────────────────

  document.addEventListener("input", (e) => {
    if (!isEnabled || !activeElement) return;
    scheduleCompletion();
  });

  document.addEventListener("keydown", (e) => {
    if (!activeElement) return;

    // Tab to accept
    if (e.key === "Tab" && currentCompletion) {
      e.preventDefault();
      e.stopPropagation();
      acceptCompletion();
      return;
    }

    // Escape to dismiss
    if (e.key === "Escape" && currentCompletion) {
      e.preventDefault();
      dismissCompletion();
      return;
    }

    // Any other key dismisses and lets it through
    if (currentCompletion && e.key !== "Shift" && e.key !== "Control" && e.key !== "Alt" && e.key !== "Meta") {
      dismissCompletion();
    }
  }, true);

  // ─── Completion logic ────────────────────────────────────────────────────

  function scheduleCompletion() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(requestCompletion, settings.debounceMs);
  }

  async function requestCompletion() {
    if (!activeElement || !isEnabled) return;

    const text = getValue(activeElement);
    if (!text || text.trim().length < 3) {
      clearGhost();
      return;
    }

    const pageContext = settings.contextMode === "page" ? getPageContext() : null;

    // Show loading state
    showGhostLoading();

    try {
      const response = await browser.runtime.sendMessage({
        type: "complete",
        text,
        pageContext,
        contextMode: settings.contextMode
      });

      if (response.error) {
        if (response.error !== "cancelled") {
          showGhostError(response.error);
        }
        return;
      }

      if (response.completion) {
        currentCompletion = response.completion;
        showGhost(response.completion);
      }
    } catch (err) {
      // Extension context invalidated or other error
      console.error("[AI Autocomplete]", err);
    }
  }

  // ─── Ghost text rendering ────────────────────────────────────────────────

  function createGhost() {
    if (ghostEl) return;

    ghostEl = document.createElement("div");
    ghostEl.className = "ai-autocomplete-ghost";
    ghostEl.addEventListener("mousedown", (e) => {
      e.preventDefault();
      acceptCompletion();
    });
    document.body.appendChild(ghostEl);
  }

  function showGhost(text) {
    if (!ghostEl || !activeElement) return;
    updateGhostPosition();

    const label = document.createElement("span");
    label.className = "ai-autocomplete-text";
    label.textContent = text;

    const hint = document.createElement("span");
    hint.className = "ai-autocomplete-hint";
    hint.textContent = "Tab";

    ghostEl.innerHTML = "";
    ghostEl.appendChild(label);
    ghostEl.appendChild(hint);
    ghostEl.className = "ai-autocomplete-ghost ai-autocomplete-visible";
  }

  function showGhostLoading() {
    if (!ghostEl || !activeElement) return;
    updateGhostPosition();
    ghostEl.innerHTML = '<span class="ai-autocomplete-text ai-autocomplete-loading">thinking…</span>';
    ghostEl.className = "ai-autocomplete-ghost ai-autocomplete-visible ai-autocomplete-fading";
  }

  function showGhostError(msg) {
    if (!ghostEl) return;
    ghostEl.innerHTML = `<span class="ai-autocomplete-text ai-autocomplete-error">${escapeHtml(msg.slice(0, 100))}</span>`;
    ghostEl.className = "ai-autocomplete-ghost ai-autocomplete-visible";
    setTimeout(() => clearGhost(), 3000);
  }

  function updateGhostPosition() {
    if (!ghostEl || !activeElement) return;

    if (activeElement.tagName === "TEXTAREA" || activeElement.tagName === "INPUT") {
      const rect = activeElement.getBoundingClientRect();
      ghostEl.style.position = "fixed";
      ghostEl.style.left = `${rect.left + 4}px`;
      ghostEl.style.top = `${rect.top + getLineHeight(activeElement)}px`;
      ghostEl.style.maxWidth = `${rect.width - 8}px`;
      ghostEl.style.font = getComputedStyle(activeElement).font;
    } else if (activeElement.isContentEditable) {
      // For contenteditable, try to position near the cursor
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0).cloneRange();
        range.collapse(true);
        const rect = range.getBoundingClientRect();
        ghostEl.style.position = "fixed";
        ghostEl.style.left = `${rect.left}px`;
        ghostEl.style.top = `${rect.top + 20}px`;
        ghostEl.style.maxWidth = "400px";
        ghostEl.style.font = getComputedStyle(activeElement).font;
      }
    }
  }

  function clearGhost() {
    currentCompletion = "";
    if (ghostEl) {
      ghostEl.className = "ai-autocomplete-ghost";
      ghostEl.innerHTML = "";
    }
  }

  function dismissCompletion() {
    currentCompletion = "";
    clearGhost();
    browser.runtime.sendMessage({ type: "cancel" }).catch(() => {});
  }

  // ─── Accept completion ───────────────────────────────────────────────────

  function acceptCompletion() {
    if (!currentCompletion || !activeElement) return;

    const text = getValue(activeElement);
    setValue(activeElement, text + currentCompletion);

    currentCompletion = "";
    clearGhost();

    // Re-trigger input event for frameworks that need it
    activeElement.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // ─── DOM helpers ─────────────────────────────────────────────────────────

  function isEditable(el) {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    if (tag === "textarea") return true;
    if (tag === "input" && (!el.type || ["text", "search", "url", "email", "tel"].includes(el.type))) {
      return true;
    }
    if (el.isContentEditable) return true;
    return false;
  }

  function getValue(el) {
    if (el.isContentEditable) {
      return el.innerText || el.textContent || "";
    }
    return el.value || "";
  }

  function setValue(el, val) {
    if (el.isContentEditable) {
      el.innerText = val;
    } else {
      el.value = val;
    }
  }

  function getPageContext() {
    // Strip down to readable text, max ~3000 chars to keep costs sane
    const body = document.body?.cloneNode(true);
    if (!body) return "";
    // Remove scripts, styles, hidden elements
    body.querySelectorAll("script, style, noscript, [hidden], .ai-autocomplete-ghost").forEach(el => el.remove());
    const text = body.innerText || body.textContent || "";
    return text.slice(0, 3000);
  }

  function getLineHeight(el) {
    const style = getComputedStyle(el);
    return parseInt(style.lineHeight) || parseInt(style.fontSize) * 1.2 || 20;
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

})();
