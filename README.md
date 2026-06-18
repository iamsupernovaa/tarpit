# Tar Pit v3.6.7

Context-window meter for **Claude** and **ChatGPT**, with source labels, diagnostics, short-lived count caching, and a customizable one-click handoff prompt.

## Context Resolution

1. **User override** from the popup, per site: `override`
2. **Live endpoint value** from ChatGPT `/backend-api/models` or Claude org/conversation JSON scan: `live`
3. **Estimated table** when fallback is enabled: `estimated`
4. **Unknown** when nothing resolves or fallback is disabled: `unknown`

Label examples:

`GPT-5.4: 42k/1.05M (4%) live`
`Claude: 142k/200k (71%) override`
`ChatGPT: 40k/128k (31%) estimated`
`ChatGPT: 40k/unknown`

## Popup

Toolbar icon settings:

- Claude manual context limit
- ChatGPT manual context limit
- estimated fallback toggle
- diagnostics toggle
- editable handoff prompt with reset-to-default

Settings are saved to `chrome.storage.sync` and apply live. Latest diagnostics are saved to `chrome.storage.local` so the popup can show what the content script detected.

## Behavior

- Bar appears above the composer once the chat has at least one message.
- The bar mounts outside the composer form when possible, so it is less likely to collide with extensions that live inside the textbox/composer.
- Model + tier are read from the composer toolbar, not the sidebar.
- Measures once per chat and remeasures only on meaningful changes: new turn, model/tier change, edit, regenerate, or branch switch.
- Uses each site's conversation API for full-chat counting. If ChatGPT's huge-chat API count fails or times out, it falls back to a rendered-chat estimate labeled `rendered` instead of showing a dead-end unavailable state.
- Caches the last API count for a chat briefly so reload/back-forward navigation can render quickly while a fresh API count runs.
- Diagnostics mode asks the active tab for live status and shows site, conversation id, model slug, context source, token source, full-count trust, API message/node counts, selectors, cache hit, last measure time, and last error.
- Handoff button unlocks at 85% usage and inserts the configured prompt into the composer without submitting the form. If composer insertion fails, it tries to copy the prompt to the clipboard.
- Fill: blue -> amber at 70% -> orange at 90% -> red at 100%.

## Notes

- Token counts are estimates; neither site exposes exact live usage in the web UI.
- Claude live context is best-effort. If no live context field is found, the fallback is 200k unless disabled or overridden.
- ChatGPT live context is preferred when reachable. The fallback context table is in `defaults.js` and has a review date comment.
- The extension only calls same-origin Claude/OpenAI endpoints using your existing browser session. There are no external servers and no API keys.

## Install

chrome://extensions -> Developer mode -> Load unpacked -> this folder -> refresh Claude/ChatGPT.
