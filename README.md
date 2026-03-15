# AI Text Autocomplete for Firefox

BYOK AI-powered inline text completions for any text field on the web.

## Install (Development)

1. Open Firefox and go to `about:debugging`
2. Click "This Firefox"
3. Click "Load Temporary Add-on"
4. Select `manifest.json` from this folder

## Setup

1. Click the extension icon in the toolbar
2. Click "Settings"
3. Paste your [OpenRouter API key](https://openrouter.ai/keys)
4. Pick a model (defaults to Gemini 2.0 Flash — cheap and fast)
5. Save

## Usage

- Start typing in any text field — ghost text appears after you pause
- **Tab** to accept the completion
- **Escape** to dismiss
- Click the ghost text to accept it

## Context Modes

- **Textbox** (default) — only sends what you've typed in the current field
- **Full page** — sends page text too (more context, costs more per call)

## System Prompt

Customize the completion behavior in Settings → System Prompt. Leave empty for the default, or write your own to control tone, style, and output format.

## Models

Use any model on [OpenRouter](https://openrouter.ai/models). Recommended for completions:

- `google/gemini-2.0-flash-001` — fast, cheap, good quality (default)
- `anthropic/claude-3.5-haiku` — slightly slower, very good completions
- `openai/gpt-4o-mini` — solid all-rounder

## Architecture

```
content.js     → Detects input, manages ghost text overlay
background.js  → Handles OpenRouter API calls
ghost.css      → Ghost text styling
options.html   → Settings page
popup.html     → Toolbar popup with quick toggle
```

## License

MIT
