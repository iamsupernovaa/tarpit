// Shared Tar Pit defaults for the popup and content script.
(() => {
  "use strict";

  const DEFAULT_PROMPT =
    "Summarize this ENTIRE conversation as a detailed handoff document I can paste into a brand-new chat to continue seamlessly. " +
    "Output ONLY a downloadable markdown (.md) file as an artifact. Be thorough - long is good. " +
    "Include: overall goal/context, every key decision and why, current state, open threads, important code/snippets verbatim, and next steps.";

  // Estimated OpenAI API context windows. Last reviewed: 2026-06-16.
  const OPENAI_CTX = [
    { re: /5\.5.*pro/, t: 1050000 },
    { re: /5\.5/, t: 1050000 },
    { re: /5\.4.*pro/, t: 1050000 },
    { re: /5\.4.*(mini|nano)/, t: 400000 },
    { re: /5\.4/, t: 1050000 },
    { re: /5\.3.*codex/, t: 400000 },
    { re: /5\.3/, t: 128000 },
    { re: /5\.2.*pro/, t: 400000 },
    { re: /5\.2/, t: 400000 },
    { re: /5\.1/, t: 400000 },
    { re: /gpt[-\s]?5(?!\s*\.\d)/, t: 400000 },
    { re: /o3/, t: 200000 },
    { re: /o4/, t: 200000 },
  ];

  window.TarPitDefaults = Object.freeze({
    VERSION: "3.6.4",
    DEFAULT_PROMPT,
    OPENAI_CTX,
    CACHE_TTL_MS: 5 * 60 * 1000,
    CACHE_VERSION: 2,
    SETTINGS_KEYS: ["ovClaude", "ovChatgpt", "useFallback", "showDiagnostics", "handoffPrompt"],
  });
})();
