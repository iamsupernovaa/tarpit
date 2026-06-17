# 🟢 Tar Pit

A privacy-first Chrome extension that shows a **context-window usage meter** above the composer on **Claude** and **ChatGPT**, plus a one-click **handoff prompt** to spin up a fresh chat before you run out of room.

No API keys. No external servers. No chat content leaves your browser — every call is same-origin to the site you're already logged into.

> Status: public beta · Manifest V3 · vanilla JS, zero dependencies, no build step

---

## Features

- **Live usage bar** above the composer: `Model Tier: used/total (%) source`
  - e.g. `Opus 4.8 Max: 142k/200k (71%) live` · `GPT-5.4 Instant: 40k/128k (31%) estimated`
- **Model + tier detection** read from the composer's model selector (not the sidebar).
- **Context window resolution** with a visible confidence label:
  1. `override` — your manual per-site limit (popup)
  2. `live` — read from the site's own endpoint (ChatGPT `/backend-api/models`, Claude org/conversation scan)
  3. `estimated` — fallback table (toggleable)
  4. `unknown` — nothing resolved / fallback disabled (bar empty, button disabled)
- **Accurate token counting** via each site's own conversation API (active branch), with a clearly-labeled rendered-text fallback if the API is blocked or times out.
- **One-click handoff**: at 85% usage the button unlocks and **injects** (never sends) a detailed summary prompt so you can continue in a new chat. Falls back to copying the prompt to your clipboard if insertion fails.
- **Customizable prompt** via the popup, with reset-to-default.
- **Diagnostics mode**: surfaces site, conversation id, model slug, context source, token source, full-count trust, API message/node counts, matched selectors, cache hits, last measure time, and last error — on-page and in the popup.
- **Stable by design**: measures once per chat and only re-measures on real changes — no polling loop, scrolling doesn't spam the API.
- Color zones: blue → amber (70%) → orange (90%) → red (100%).

---

## Install (unpacked)

1. Download/clone this repo.
2. Open `chrome://extensions`.
3. Enable **Developer mode** (top-right).
4. Click **Load unpacked** and select the project folder.
5. Open or refresh a Claude or ChatGPT tab.

Works on `claude.ai`, `chatgpt.com`, and `chat.openai.com`.

---

## Usage

The bar appears above the composer once a chat has at least one message. As the conversation grows, the bar fills and the percentage climbs. When usage crosses **85%**, the handoff button (the Tar Pit icon) activates — click it to drop a thorough "summarize this whole chat as a markdown handoff" prompt into the composer, review it, and send it yourself. Paste the result into a new chat and keep going.

### Popup settings (toolbar icon)

| Setting | What it does |
| --- | --- |
| Claude manual limit | Override Claude's context window (tokens). Blank = auto. |
| ChatGPT manual limit | Override ChatGPT's context window (tokens). Blank = auto. |
| Use estimated fallback | When off and no live value resolves, the bar shows `unknown` instead of guessing. |
| Show diagnostics | Reveals the diagnostics line on-page and in the popup. |
| Handoff prompt | Edit the injected prompt; **Reset Prompt** restores the default. |

<img width="342" height="686" alt="ss_3" src="https://github.com/user-attachments/assets/dd5b7d21-fc64-4f99-ad1f-a4c83d9b4eeb" />

Settings save to `chrome.storage.sync` and apply live.

---

## How it works

**Measurement.** Counts tokens once per chat (estimate: characters ÷ ~4, heavier for code). It re-measures only on a meaningful change — new turn, model/tier switch, edit, regenerate, or branch switch — detected via a signature (message count + total message length + model key) and debounced into a single API call. Branch/edit/regenerate clicks also force a recount. Navigation is tracked via a `history` patch + `popstate`; the meter remounts via a debounced `MutationObserver`. There is no interval-based polling.

**Counting source.** Tokens come from the site's own conversation API for the active branch. If that fails or times out (e.g., a very large ChatGPT chat), the meter falls back to counting rendered text and labels it `rendered` so you know it isn't a trusted full-chat count.

**Caching.** The last API count per chat is cached briefly in `chrome.storage.local` (5-minute TTL, versioned) so reload/back-forward paints fast while a fresh count runs.

**Context numbers.**
- Claude (Pro): 200k for all models; a best-effort live scan runs first, 200k is the fallback.
<img width="771" height="197" alt="ss_5" src="https://github.com/user-attachments/assets/81638cac-c4c0-4e01-ba64-251e2a672532" />
<img width="767" height="307" alt="ss_4" src="https://github.com/user-attachments/assets/0ae35671-38ea-496d-9219-02f3a9e743ca" />

- ChatGPT: live per-account window when reachable; otherwise the fallback table in `defaults.js` (which carries a `Last reviewed` date).
<img width="802" height="246" alt="ss_2" src="https://github.com/user-attachments/assets/1b3aaa61-b9cf-47e7-b1a4-c659f731934a" />
<img width="790" height="137" alt="ss_1" src="https://github.com/user-attachments/assets/240e0c6d-168c-4fa4-a3d7-c51ad270fdca" />

---

## Privacy

- All network calls are **same-origin** to Claude/OpenAI using your existing logged-in session.
- **No external servers, no API keys, no telemetry.**
- Diagnostics are kept in memory / the popup and the latest snapshot in `chrome.storage.local`; conversation **content** is never stored or transmitted.
  
---

## Limitations & tradeoffs

- Token counts are **estimates** — neither site exposes exact live context usage in the web UI.
- **Strict selectors first**: avoids miscounting the sidebar/history, but a site DOM change can require a selector update (diagnostics will tell you which one failed).
- **Branch detection is heuristic** (signature + click triggers), not a guaranteed read of the active node.
- **Claude window is a 200k fallback** — no reliable public per-account endpoint.
- **ChatGPT fallback table is a best guess** when the live endpoint is unavailable; the `estimated` label makes that visible.

---

## Project structure

```
manifest.json     Manifest V3; registers defaults.js + content.js, the popup, and styles
defaults.js       Shared constants: VERSION, default prompt, OpenAI context table, cache + settings config
content.js        Site detection, selectors, API/DOM counting, model parsing, rendering, handoff, diagnostics
styles.css        Bar / label / button / diagnostics styling (uses !important to survive host CSS)
popup.html        Settings + diagnostics UI
popup.js          Loads/saves settings; pulls live diagnostics from the active tab
icons/            16 / 48 / 128 px neon icons
README.md         This file
CONTRIBUTING.md   Dev setup, conventions, and how to help
TESTING.md        Manual test checklist (this extension rides external web UIs)
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Manual testing steps live in [TESTING.md](TESTING.md). Bug reports are most useful with the diagnostics line attached (redact the conversation id).

## License

MIT — see `LICENSE`. (Add a `LICENSE` file if one isn't present yet.)
