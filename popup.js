const $ = (id) => document.getElementById(id);
const DEFAULTS = window.TarPitDefaults || {};
const DEFAULT_PROMPT = DEFAULTS.DEFAULT_PROMPT || "";
const SETTINGS_KEYS = DEFAULTS.SETTINGS_KEYS || ["ovClaude", "ovChatgpt", "useFallback", "showDiagnostics", "handoffPrompt"];

function storageGet(area, keys, cb) {
  try {
    const target = chrome && chrome.storage && chrome.storage[area];
    if (!target) return cb({});
    target.get(keys, (r) => cb(r || {}));
  } catch (_) {
    cb({});
  }
}

function activeDiagnostics(cb) {
  try {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) return storageGet("local", ["tarpitDiag"], (local) => cb(local.tarpitDiag));
      chrome.tabs.sendMessage(tab.id, { type: "tarpit:getDiagnostics" }, (response) => {
        if (chrome.runtime.lastError || !response) {
          storageGet("local", ["tarpitDiag"], (local) => cb(local.tarpitDiag));
          return;
        }
        cb(response);
      });
    });
  } catch (_) {
    storageGet("local", ["tarpitDiag"], (local) => cb(local.tarpitDiag));
  }
}

function refreshDiag() {
  activeDiagnostics((diag) => renderDiag(diag));
}

function setStatus(text) {
  $("saved").textContent = text;
  if (text) setTimeout(() => ($("saved").textContent = ""), 1600);
}

function formatDiag(d) {
  if (!d || !d.site) return "No page diagnostics yet. Open Claude or ChatGPT and refresh.";
  const last = d.lastMeasureAt ? new Date(d.lastMeasureAt).toLocaleTimeString() : "never";
  const limit = d.contextTokens ? Math.round(d.contextTokens).toLocaleString() : "unknown";
  return [
    `site: ${d.site}`,
    `conversation: ${d.conversationId ? d.conversationId.slice(0, 8) : "none"}`,
    `model: ${d.model || "unknown"}`,
    `slug: ${d.apiSlug || "none"}`,
    `context: ${limit} (${d.contextSource || "unknown"})`,
    `tokens: ${Math.round(d.tokenEstimate || 0).toLocaleString()} via ${d.tokenSource || "none"}`,
    `full count: ${d.countTrusted ? "yes" : "no"}`,
    `api: ${d.lastApi || "none"}`,
    `api messages/nodes: ${d.apiMessageCount || 0}/${d.apiNodeCount || 0}`,
    `cache: ${d.cacheHit ? "yes" : "no"}`,
    `composer: ${d.composerSelector || "none"}`,
    `messages: ${d.messageSelector || "none"}`,
    `last measure: ${last}`,
    `last action: ${d.lastAction || "none"}`,
    `error: ${d.lastError || "none"}`,
  ].join("\n");
}

function renderDiag(d) {
  const enabled = $("showDiagnostics").checked;
  $("diag").classList.toggle("visible", enabled);
  $("diag").textContent = enabled ? formatDiag(d) : "";
}

function load() {
  storageGet("sync", SETTINGS_KEYS, (r) => {
    if (r.ovClaude) $("ovClaude").value = r.ovClaude;
    if (r.ovChatgpt) $("ovChatgpt").value = r.ovChatgpt;
    $("useFallback").checked = r.useFallback !== false;
    $("showDiagnostics").checked = r.showDiagnostics === true;
    $("handoffPrompt").value = typeof r.handoffPrompt === "string" ? r.handoffPrompt : DEFAULT_PROMPT;
    refreshDiag();
  });
}

$("save").addEventListener("click", () => {
  const ovClaude = parseInt($("ovClaude").value, 10) || null;
  const ovChatgpt = parseInt($("ovChatgpt").value, 10) || null;
  const useFallback = $("useFallback").checked;
  const showDiagnostics = $("showDiagnostics").checked;
  const handoffPrompt = $("handoffPrompt").value.trim() || null;
  chrome.storage.sync.set({ ovClaude, ovChatgpt, useFallback, showDiagnostics, handoffPrompt }, () => {
    setStatus("saved");
    setTimeout(refreshDiag, 150);
  });
});

$("resetPrompt").addEventListener("click", () => {
  $("handoffPrompt").value = DEFAULT_PROMPT;
  setStatus("default prompt restored - save to apply");
});

$("showDiagnostics").addEventListener("change", () => {
  refreshDiag();
});

load();
