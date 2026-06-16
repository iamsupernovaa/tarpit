# Contributing to Tar Pit

Thanks for helping! Tar Pit is a small Manifest V3 extension with **no build step and no dependencies** — plain HTML/CSS/JS you can edit and reload. That keeps the barrier low; please keep it that way unless there's a strong reason to add tooling.

## Local development

1. Clone the repo.
2. `chrome://extensions` → enable **Developer mode**.
3. **Load unpacked** → select the project folder.
4. Edit files, click **Reload** on the extension card, then **refresh** any open Claude/ChatGPT tab.

No npm, no bundler, no transpile. If you open a PR that adds a build step, explain the payoff in the description.

## Project layout

- `defaults.js` — **single source of truth** for shared constants (`VERSION`, default handoff prompt, OpenAI context table, cache TTL/version, settings keys). It loads before `content.js` and is also imported by the popup. Put anything shared here.
- `content.js` — everything on-page: site detection, selector arrays, API + DOM token counting, model/tier parsing, bar rendering, change detection, handoff insertion, diagnostics. ~1k lines, organized into labeled sections.
- `popup.html` / `popup.js` — settings + diagnostics UI.
- `styles.css` — bar/label/button/diagnostics. `!important` is intentional (host pages have aggressive CSS).
- `TESTING.md` — manual checklist; this extension depends on external web UIs, so this is more valuable than mocked unit tests.

## Conventions

- **Vanilla JS, IIFE-wrapped, `"use strict"`.** No frameworks.
- **No external/CDN imports** in the content script. Same-origin calls only (see Privacy).
- **Strict selectors first.** When a site's DOM changes, add a new entry to the relevant `messageSelectors` / `composerSelectors` array rather than loosening an existing one into something that could match the sidebar/history. Keep the most specific selector first.
- **Centralize parsing.** Display-name parsing and context-key parsing must stay in their shared helpers so the visible label and the context lookup can't drift apart. Don't inline new model regexes in two places.
- **Context table edits** go in `defaults.js` and must bump the `Last reviewed:` date.
- **Diagnostics over silence.** If you add a new failure path, set a `lastError` / token-source label so diagnostics can show it. Don't fail silently.

## Versioning

Bump the version in **all** of these together, or CI/reviewers will flag it:

- `defaults.js` → `VERSION`
- `manifest.json` → `version`
- `content.js` → header comment
- `README.md` / `tarpit-notes.md` → title

Use semver: patch for fixes, minor for features, major for breaking UX/permission changes. If you change `chrome.storage` shapes or the cache format, bump `CACHE_VERSION` in `defaults.js`.

## Before opening a PR

1. Run through `TESTING.md` on **both** Claude and ChatGPT (empty chat, existing chat, override/fallback, custom prompt, change detection, cache, failure visibility).
2. Confirm versions match across the files above.
3. `node -c content.js && node -c popup.js && node -c defaults.js` for a quick syntax check.
4. Confirm no new network calls to non-site origins and no logging of conversation content/ids.
5. Note in the PR which selectors/endpoints you touched and on what date you verified them against the live sites.

## Privacy & security rules (non-negotiable)

- **Same-origin only.** No external servers, API keys, analytics, or telemetry.
- **Never store or transmit conversation content.** Diagnostics may include a conversation id for debugging, but PRs/issues should redact it, and we don't log it anywhere persistent beyond the local diagnostics snapshot.
- New permissions in `manifest.json` need justification in the PR.

## Reporting bugs

Open an issue with:

- Site (Claude / ChatGPT) and approximate model/tier.
- What you expected vs. saw (a screenshot of the bar helps).
- The **diagnostics line** with `Show diagnostics` enabled — **redact the conversation id**.
- Whether reloading or toggling fallback changed anything.

If the meter vanished after a site update, the diagnostics line usually identifies whether the composer or message selector failed — include it.

## Good places to help

- **Selector resilience**: add/verify `messageSelectors` and `composerSelectors` entries as the sites change; improve the "not detected" diagnostics.
- **Editable prompt presets**: multiple saved handoff styles.
- **Cache polish**: tune TTL, surface cache state more clearly.
- **Context accuracy**: keep the `defaults.js` table current; improve the Claude live-context scan.
- **Popup UX**: show current resolved state per site.

Keep changes small and focused. When in doubt, prefer **showing nothing + a clear diagnostic** over guessing.
