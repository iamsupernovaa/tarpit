# Tar Pit - Build Notes (v3.6.4)

A Chrome extension that shows a context-window usage meter above the composer on **Claude** and **ChatGPT**, with diagnostics and a one-click handoff prompt for starting a fresh chat.

## What it does

- Thin bar above the composer: `Model Tier: used/total (%) source`
  - e.g. `Opus 4.8 Max: 142k/200k (71%) live`, `GPT-5.4 Instant: 40k/128k (31%) estimated`.
- Model + tier are read from the composer's model selector, not the sidebar.
- Context window resolution, in priority order:
  1. **User override** from the popup, per site -> `override`
  2. **Live endpoint** from ChatGPT `/backend-api/models` or Claude org/conversation scan -> `live`
  3. **Estimated table** when fallback is enabled -> `estimated`
  4. **Unknown** when fallback is off or nothing resolves -> `unknown` with empty bar and disabled button
- Token count from each site's own conversation API. For ChatGPT, the active path is compared with the full mapping and the larger API-derived count wins when the active path is suspiciously small.
- On-page text is first used as a pending signal. If ChatGPT's API count fails or times out on a huge chat, rendered text becomes a labeled fallback rather than blocking the meter.
- Popup settings:
  - per-site context overrides
  - estimated fallback toggle
  - diagnostics toggle
  - editable handoff prompt with reset-to-default
- Handoff button unlocks at 85% used -> injects the configured prompt into the composer, never sends it.
- If composer insertion fails, the button tries a clipboard fallback.
- The injected handoff button is `type="button"` and stops the click event so it cannot submit the site's composer form.
- Fill colors: blue -> amber at 70% -> orange at 90% -> red at 100%.

## How it measures

- Measures once per chat.
- Remeasures only on real changes: new turn, edited/branch-switched reply, or model/tier change.
- Change detection uses a signature: message count + total message text length + model key.
- Branch/edit/regenerate clicks force a recount in capture phase so equal-length swaps are less likely to be missed.
- No polling loop. Scrolling does not intentionally trigger API calls.
- Driven by a debounced MutationObserver, history `pushState`/`replaceState` patch, and `popstate`.
- Meter is hidden until the chat has at least one message, unless diagnostics mode is enabled.
- Claude empty-chat greeting/placeholder nodes are filtered because they use message-like classes.
- The meter mounts before the composer form when possible, not inside it, to avoid interfering with other composer extensions.
- Short-lived per-chat cache in `chrome.storage.local` renders recent API counts after reload/back-forward navigation while a fresh API count runs. Entries have a 5 minute TTL and are versioned so old DOM-derived counts are ignored.

## Diagnostics

Diagnostics mode shows an in-page line and a popup summary with:

- site and conversation id
- display model and API slug
- context source and context token limit
- token estimate and token source (`api`, `rendered-pending`, `rendered`, `rendered-api-error`, `api-error`, `api-empty`, or `cache:api`)
- whether the count is trusted as a full-chat count
- API message/node counts
- last API touched
- cache hit status
- composer/message selector that matched
- last measure time
- last action and last error

The popup asks the active tab for live diagnostics. The latest diagnostics snapshot is still saved as `tarpitDiag` in `chrome.storage.local` as a fallback.

## Context numbers we use

- **Claude (Pro):** 200k for all models (Fable / Opus / Sonnet / Haiku). Live scan attempted first; 200k is the estimate fallback.
- **ChatGPT:** live per-account window when reachable; otherwise the fallback table in `defaults.js`.
- The fallback table has a `Last reviewed` comment so stale model/context assumptions are easy to find.

## Key technical fixes along the way

- CSS `width: 0% !important` blocked JS-set width -> fill never moved. Fixed by setting width inline with `!important` and avoiding `!important` on the base width.
- Polling every few seconds caused "Too many requests" (429) and a fill/unfill flicker -> switched to once-per-chat + change-triggered, debounced.
- Generic fallback selectors (`article`, `[role=listitem]`) counted the chat-history list on ChatGPT project/new-chat pages -> selector strategy is now strict first, with small scoped fallbacks and diagnostics.
- ChatGPT model-context fetch: one failure no longer permanently disables it; it retries with a 60s cooldown and is awaited once before the value locks.
- Replaced legacy `document.execCommand` insertion with Range-insert fallback.
- Removed synthetic paste for the handoff prompt and made the Tar Pit button non-submit so it cannot send the prompt.
- Async override load no longer races first render; startup waits for settings before building/measuring.
- Handoff prompt is configurable through the popup and falls back to the shared default in `defaults.js`.
- Model display parsing and context-key parsing are centralized so weird model labels are easier to adjust.

## Tradeoffs

- **Token counts are estimates** (chars divided by roughly 4, heavier for code). Neither site exposes exact live context usage.
- **Strict selectors first:** safer because it avoids sidebar/history miscounts, but site DOM changes can still require selector updates.
- **Fallback selectors:** scoped to `main` where possible. Diagnostics labels which selector matched.
- **Branch detection is heuristic:** signature + click triggers, not a guaranteed active-node observer.
- **Claude window is a fixed 200k fallback:** live scan is best-effort; there is no reliable public per-account endpoint.
- **ChatGPT fallback table is a guess:** the label says `estimated` so confidence is visible.
- **Short-lived cache can be briefly stale:** accepted for quick first paint, but a fresh API measurement now runs after opening a cached chat.
- **Rendered fallback is explicit:** if the full API count fails, the bar can show a rendered estimate, but the label and diagnostics mark it as not a trusted full count.
- **Handoff injects, never sends:** deliberate, so the user can review/edit before sending.
- **Privacy:** all API calls are same-origin to each site's own API using the user's existing session; no external servers, no API keys.

## Install

chrome://extensions -> Developer mode -> Load unpacked -> the unzipped folder -> refresh Claude/ChatGPT.
