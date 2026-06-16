# Tar Pit Manual Test Checklist

Use this after loading the unpacked extension or changing selectors/API behavior.

## Install/Reload

- Open `chrome://extensions`.
- Enable Developer mode.
- Click **Load unpacked** and select this folder.
- After edits, click reload on the extension card.
- Refresh any open Claude/ChatGPT tabs.

## Empty Chat

- Open a new Claude chat.
- Open a new ChatGPT chat.
- Confirm the meter is hidden while there are no messages.
- Confirm Claude's greeting/placeholder does not cause a `measuring...` bar to appear inside the composer.
- Enable diagnostics in the popup and confirm a small diagnostics line can appear without starting API polling.

## Existing Chat

- Open an existing Claude chat with messages.
- Open an existing ChatGPT chat with messages.
- Confirm the bar appears above the composer.
- Confirm label shape: `Model Tier: used/total (%) source`.
- Confirm the popup diagnostics show site, conversation id, selectors, token source, full-count trust, API message/node counts, and last measure time.
- For a large old ChatGPT chat, confirm the final token source is usually `api`. If the API fails, confirm the label says `rendered` instead of `full chat unavailable`.

## Overrides/Fallback

- Set a Claude manual limit in the popup and save.
- Confirm the Claude bar label changes to `override`.
- Clear the override and save.
- Disable estimated fallback and save.
- If no live context is available, confirm the label shows `/unknown` and the handoff button is disabled.
- Re-enable fallback.

## Custom Handoff Prompt

- Put a short custom prompt in the popup and save.
- Use a chat near or above the 85% threshold, or temporarily lower the manual limit for testing.
- Click the Tar Pit handoff button.
- Confirm the custom prompt appears in the composer and is not sent automatically.
- Confirm the prompt stays editable in the textbox and does not appear as a sent user message.
- Click **RESET PROMPT**, save, and confirm the default prompt is used again.

## Change Detection

- Send a new message and wait about 1-2 seconds.
- Confirm the estimate updates once after the content settles.
- Switch model/tier if available and confirm the label updates.
- Regenerate, edit, or branch-switch a response.
- Confirm diagnostics show a fresh `last measure` time.

## Cache

- Open a measured chat and note the token estimate.
- Reload the page.
- Confirm the bar can render quickly from `cache:api` in diagnostics.
- Confirm a fresh measurement switches back to `api` after load.
- Make a real chat change and confirm the next measurement switches back to `api`.

## Failure Visibility

- With diagnostics enabled, verify the line reports:
  - `composer=...`
  - `messages=...`
  - `via=api`, `via=rendered-pending`, `via=rendered`, `via=rendered-api-error`, `via=api-error`, `via=api-empty`, or `via=cache:api`
  - active-tab site changes when switching between Claude and ChatGPT before opening the popup
  - `error=none` on a healthy page
- If the meter disappears after a site update, diagnostics should identify whether the composer or message selector failed.
