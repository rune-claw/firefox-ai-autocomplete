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

    const computed = getComputedStyle(activeElement);
    syncGhostFont(computed);

    if (activeElement.tagName === "TEXTAREA" || activeElement.tagName === "INPUT") {
      const rect = activeElement.getBoundingClientRect();
      ghostEl.style.position = "fixed";
      ghostEl.style.left = `${rect.left + parseFloat(computed.paddingLeft) + parseFloat(computed.borderLeftWidth)}px`;

      // For single-line inputs, text is vertically centered — match it
      const fontSize = parseFloat(computed.fontSize) || 14;
      const paddingTop = parseFloat(computed.paddingTop) || 0;
      const borderTop = parseFloat(computed.borderTopWidth) || 0;
      const contentHeight = rect.height - borderTop - (parseFloat(computed.borderBottomWidth) || 0) - paddingTop - (parseFloat(computed.paddingBottom) || 0);
      const verticalOffset = paddingTop + borderTop + Math.max(0, (contentHeight - fontSize) / 2);

      ghostEl.style.top = `${rect.top + verticalOffset}px`;
      ghostEl.style.maxWidth = `${rect.width - parseFloat(computed.paddingLeft) - parseFloat(computed.paddingRight) - 8}px`;
    } else if (activeElement.isContentEditable) {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0).cloneRange();
        range.collapse(true);
        const rect = range.getBoundingClientRect();
        if (rect.top === 0 && rect.left === 0) return; // no visible cursor
        ghostEl.style.position = "fixed";
        ghostEl.style.left = `${rect.left}px`;
        ghostEl.style.top = `${rect.top}px`;
        ghostEl.style.maxWidth = "400px";
      }
    }
  }

  function syncGhostFont(computed) {
    if (!ghostEl) return;
    ghostEl.style.fontFamily = computed.fontFamily;
    ghostEl.style.fontSize = computed.fontSize;
    ghostEl.style.fontWeight = computed.fontWeight;
    ghostEl.style.fontStyle = computed.fontStyle;
    ghostEl.style.letterSpacing = computed.letterSpacing;
    ghostEl.style.lineHeight = computed.lineHeight;
    ghostEl.style.textIndent = computed.textIndent;
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

    activeElement.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // ─── DOM helpers ─────────────────────────────────────────────────────────

  function isEditable(el) {
    if (!el) return false;
    const tag = el.tagName?.toLowerCase();
    if (tag === "textarea") return true;
    if (tag === "input" && (!el.type || ["text", "search", "url", "email", "tel", "number", "password"].includes(el.type))) {
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
    const body = document.body?.cloneNode(true);
    if (!body) return "";
    body.querySelectorAll("script, style, noscript, [hidden], .ai-autocomplete-ghost").forEach(el => el.remove());
    const text = body.innerText || body.textContent || "";
    return text.slice(0, 3000);
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

})();
