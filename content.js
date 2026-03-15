/**
 * content.js — Detects text input, sends to background, renders ghost text.
 * Supports cursor-aware completions with edit suggestions.
 */

(function () {
  "use strict";

  let ghostEl = null;
  let activeElement = null;
  let debounceTimer = null;
  let currentCompletion = null; // { fullText, cursorPos, editStart, editEnd }
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

  // ─── Scroll tracking — keep ghost aligned ────────────────────────────────

  document.addEventListener("scroll", () => {
    if (currentCompletion && activeElement) {
      updateGhostPosition();
    }
  }, true); // capture phase to catch scroll on any ancestor

  // Also update on resize
  window.addEventListener("resize", () => {
    if (currentCompletion && activeElement) {
      updateGhostPosition();
    }
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
        // Parse cursor marker: text before <|cursor|> is prefix, after is suffix
        const marker = "<|cursor|>";
        let fullText, cursorPos;

        if (response.completion.includes(marker)) {
          const parts = response.completion.split(marker);
          // Model returned full text with cursor position marker
          fullText = parts[0] + parts[1];
          cursorPos = parts[0].length;
        } else {
          // Simple append (no cursor marker — backward compatible)
          fullText = text + response.completion;
          cursorPos = fullText.length;
        }

        // Compute the edit region (what changed)
        const { editStart, editEnd } = computeEditRegion(text, fullText, cursorPos);

        currentCompletion = { fullText, cursorPos, editStart, editEnd };
        showGhost(text, fullText, editStart, editEnd, cursorPos);
      }
    } catch (err) {
      console.error("[AI Autocomplete]", err);
    }
  }

  // ─── Diff / edit region detection ────────────────────────────────────────

  function computeEditRegion(oldText, newText, cursorPos) {
    // Find longest common prefix
    let prefixLen = 0;
    while (prefixLen < oldText.length && prefixLen < newText.length && oldText[prefixLen] === newText[prefixLen]) {
      prefixLen++;
    }

    // Find longest common suffix (not overlapping with prefix)
    let suffixLen = 0;
    while (
      suffixLen < (oldText.length - prefixLen) &&
      suffixLen < (newText.length - prefixLen) &&
      oldText[oldText.length - 1 - suffixLen] === newText[newText.length - 1 - suffixLen]
    ) {
      suffixLen++;
    }

    const editStart = prefixLen;
    const editEnd = newText.length - suffixLen;

    return { editStart, editEnd };
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

  function showGhost(oldText, fullText, editStart, editEnd, cursorPos) {
    if (!ghostEl || !activeElement) return;
    updateGhostPosition();

    const isAppend = editStart >= oldText.length;
    const inserted = fullText.slice(editStart, editEnd);

    ghostEl.innerHTML = "";

    if (!isAppend) {
      // Show a badge indicating this is an edit, not just append
      const badge = document.createElement("span");
      badge.className = "ai-autocomplete-edit-badge";
      badge.textContent = "edit";
      ghostEl.appendChild(badge);
    }

    const label = document.createElement("span");
    label.className = "ai-autocomplete-text";
    label.textContent = isAppend ? inserted : fullText;
    ghostEl.appendChild(label);

    const hint = document.createElement("span");
    hint.className = "ai-autocomplete-hint";
    hint.textContent = "Tab";
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
        if (rect.top === 0 && rect.left === 0) return;
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
    currentCompletion = null;
    if (ghostEl) {
      ghostEl.className = "ai-autocomplete-ghost";
      ghostEl.innerHTML = "";
    }
  }

  function dismissCompletion() {
    currentCompletion = null;
    clearGhost();
    browser.runtime.sendMessage({ type: "cancel" }).catch(() => {});
  }

  // ─── Accept completion ───────────────────────────────────────────────────

  function acceptCompletion() {
    if (!currentCompletion || !activeElement) return;

    const { fullText, cursorPos } = currentCompletion;

    setValue(activeElement, fullText);

    // Position cursor
    if (activeElement.isContentEditable) {
      // For contenteditable, move cursor to position
      setCursorPosition(activeElement, cursorPos);
    } else if (activeElement.setSelectionRange) {
      // For input/textarea
      activeElement.setSelectionRange(cursorPos, cursorPos);
    }

    currentCompletion = null;
    clearGhost();

    // Re-trigger input event for frameworks
    activeElement.dispatchEvent(new Event("input", { bubbles: true }));
    activeElement.focus();
  }

  function setCursorPosition(el, pos) {
    // For contenteditable: walk text nodes to find position
    const range = document.createRange();
    const sel = window.getSelection();
    let remaining = pos;

    function walkNodes(node) {
      if (node.nodeType === Node.TEXT_NODE) {
        if (remaining <= node.textContent.length) {
          range.setStart(node, remaining);
          range.collapse(true);
          return true;
        }
        remaining -= node.textContent.length;
      } else {
        for (const child of node.childNodes) {
          if (walkNodes(child)) return true;
        }
      }
      return false;
    }

    if (walkNodes(el)) {
      sel.removeAllRanges();
      sel.addRange(range);
    }
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
