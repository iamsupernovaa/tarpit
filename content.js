// v3.6.7 - context meter for Claude + ChatGPT
(() => {
  "use strict";
  if (window.__TARPIT_V3__) return;
  window.__TARPIT_V3__ = true;

  const D = window.TarPitDefaults || {};
  const VERSION = D.VERSION || "3.6.7";
  const DEFAULT_PROMPT = D.DEFAULT_PROMPT || "";
  const CACHE_TTL_MS = D.CACHE_TTL_MS || 5 * 60 * 1000;
  const CACHE_VERSION = D.CACHE_VERSION || 2;
  const SETTINGS_KEYS = D.SETTINGS_KEYS || ["ovClaude", "ovChatgpt", "useFallback", "showDiagnostics", "handoffPrompt"];

  const CLAUDE = /(^|\.)claude\.ai$/i.test(location.hostname);
  const OPENAI = /(^|\.)(chatgpt\.com|chat\.openai\.com)$/i.test(location.hostname);
  if (!CLAUDE && !OPENAI) return;

  const SITE = CLAUDE
    ? {
        key: "claude",
        name: "Claude",
        messageSelectors: [
          { name: "claude-user", selector: '[data-testid="user-message"]' },
          { name: "claude-response", selector: ".font-claude-response, .font-claude-message" },
        ],
        composerSelectors: [
          { name: "claude-prosemirror", selector: 'div.ProseMirror[contenteditable="true"]' },
          { name: "role-textbox", selector: '[contenteditable="true"][role="textbox"]' },
          { name: "textarea", selector: "main textarea, form textarea" },
        ],
        convId: () => (location.pathname.match(/\/chat\/([0-9a-f-]{8,})/i) || [])[1] || null,
        context: 200000,
        modelRe: /\b(opus|sonnet|haiku|fable)\b[\sa-z0-9.\-]*/i,
        effortRe: /\b(low|medium|high|max|extra)\b/i,
      }
    : {
        key: "chatgpt",
        name: "ChatGPT",
        messageSelectors: [
          { name: "chatgpt-primary", selector: "[data-message-author-role]" },
          { name: "chatgpt-turn", selector: 'main [data-testid^="conversation-turn"]' },
        ],
        composerSelectors: [
          {
            name: "chatgpt-prompt",
            selector:
              '#prompt-textarea, textarea#prompt-textarea, div[contenteditable="true"][id="prompt-textarea"], div[contenteditable="true"][data-testid="composer-input"]',
          },
          { name: "role-textbox", selector: '[contenteditable="true"][role="textbox"]' },
          { name: "textarea", selector: "main textarea, form textarea" },
        ],
        convId: () => (location.pathname.match(/\/c\/([0-9a-f-]{8,})/i) || [])[1] || null,
        context: 128000,
        modelRe: /\b(gpt[-\s]?\d(?:\.\d)?|4o|4\.1|o3|o4)\b[\sa-z0-9.\-]*/i,
        effortRe: /\b(instant|thinking|pro|low|medium|high)\b/i,
      };

  const ENABLE_AT = 0.85;
  const MIN_VISIBLE = 1.5;
  const ICON =
    '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">' +
    '<rect x="3" y="3" width="18" height="18" rx="3" fill="#0a0a0a" stroke="#39ff14" stroke-width="2"/>' +
    '<rect x="6" y="12" width="12" height="7" fill="#39ff14"/>' +
    '<circle cx="11" cy="16" r="1.3" fill="#0a0a0a"/></svg>';

  const OV = { claude: null, chatgpt: null, useFallback: true, showDiagnostics: false };
  const MEM_CACHE = {};
  const S = {
    tokens: 0,
    haveValue: false,
    measuredConv: null,
    sig: "",
    pending: null,
    obsTimer: null,
    diagTimer: null,
    model: SITE.name,
    context: SITE.context,
    ctxSource: "estimated",
    estKey: "",
    apiSlug: "",
    org: null,
    gptTok: null,
    claudeLive: null,
    lastUrl: location.href,
    tokenSource: "none",
    lastMeasureAt: null,
    lastError: "",
    lastApi: "none",
    cacheHit: false,
    countTrusted: false,
    apiMessageCount: 0,
    apiNodeCount: 0,
    lastAction: "",
    prompt: DEFAULT_PROMPT,
    composerSelector: "none",
    messageSelector: "none",
    root: null,
    fill: null,
    label: null,
    btn: null,
    diag: null,
  };

  // ---------- storage/settings ----------
  function storageGet(area, keys) {
    return new Promise((resolve) => {
      try {
        const target = chrome && chrome.storage && chrome.storage[area];
        if (!target) return resolve({});
        target.get(keys, (r) => resolve(r || {}));
      } catch (_) {
        resolve({});
      }
    });
  }
  function storageSet(area, obj) {
    return new Promise((resolve) => {
      try {
        const target = chrome && chrome.storage && chrome.storage[area];
        if (!target) return resolve(false);
        target.set(obj, () => resolve(true));
      } catch (_) {
        resolve(false);
      }
    });
  }
  async function loadSettings() {
    const r = await storageGet("sync", SETTINGS_KEYS);
    OV.claude = +r.ovClaude || null;
    OV.chatgpt = +r.ovChatgpt || null;
    OV.useFallback = r.useFallback !== false;
    OV.showDiagnostics = r.showDiagnostics === true;
    S.prompt = typeof r.handoffPrompt === "string" && r.handoffPrompt.trim() ? r.handoffPrompt : DEFAULT_PROMPT;
  }
  try {
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      if (!Object.keys(changes).some((k) => SETTINGS_KEYS.includes(k))) return;
      loadSettings().then(() => {
        buildUI();
        render();
      });
    });
  } catch (_) {}

  // ---------- utilities ----------
  const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  const fmt = (n) =>
    n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1000 ? Math.round(n / 1000) + "k" : String(Math.max(0, Math.round(n)));
  const shortId = (id) => (id ? id.slice(0, 8) : "none");
  const clip = (s, n) => (s && s.length > n ? s.slice(0, n - 1) + "..." : s || "");
  function visible(el) {
    if (!el) return false;
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
  }
  function recordError(source, err) {
    S.lastError = source + ": " + clip((err && (err.message || String(err))) || "failed", 120);
  }
  function clearError(source) {
    if (!source || S.lastError.startsWith(source + ":")) S.lastError = "";
  }
  function estTokens(t) {
    if (!t) return 0;
    const code = (t.match(/[{}()[\];=<>]|\b(function|const|let|var|class|import|return|def|if|else|for|while)\b/g) || []).length;
    return Math.ceil(t.length / (code > Math.max(20, t.length / 120) ? 3.25 : 4.05));
  }

  // ---------- selectors ----------
  function queryFirst(list) {
    for (const item of list) {
      const el = document.querySelector(item.selector);
      if (el && visible(el)) return { el, name: item.name };
    }
    return { el: null, name: "none" };
  }
  function composerEl() {
    const found = queryFirst(SITE.composerSelectors);
    S.composerSelector = found.name;
    return found.el;
  }
  function isPlaceholderMessageNode(node, itemName) {
    if (!CLAUDE || itemName === "claude-user") return false;
    const txt = (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (!txt) return true;
    if (/^how can i help( you)?( today)?\??$/.test(txt)) return true;
    if (/^(what|how) can i help you( with)?\??$/.test(txt)) return true;
    if (/^(ask anything|message claude)$/.test(txt)) return true;
    return false;
  }
  function messageInfo() {
    const composer = composerEl();
    for (const item of SITE.messageSelectors) {
      const nodes = Array.from(document.querySelectorAll(item.selector)).filter((n) => {
        if (composer && (n === composer || composer.contains(n) || n.contains(composer))) return false;
        return !isPlaceholderMessageNode(n, item.name);
      });
      if (nodes.length) {
        S.messageSelector = item.name;
        return { nodes, name: item.name };
      }
    }
    S.messageSelector = "none";
    return { nodes: [], name: "none" };
  }
  const msgNodes = () => messageInfo().nodes;
  const hasConversation = () => !!SITE.convId();
  const hasRenderedMessages = () => msgNodes().filter(visible).length > 0;
  const hasChat = () => hasConversation() && hasRenderedMessages();

  // ---------- model/context parsing ----------
  function openaiContext(key) {
    key = (key || "").toLowerCase();
    const table = D.OPENAI_CTX || [];
    const hit = table.find((x) => x.re.test(key));
    return hit ? hit.t : 128000;
  }
  function parseModelDisplay(value) {
    const raw = (value || "").trim();
    if (!raw) return "";
    const s = raw.toLowerCase();
    let m = s.match(/claude[-\s_]*(opus|sonnet|haiku|fable)[-\s_]*([\d.\-]*)/);
    if (!m) m = s.match(/\b(opus|sonnet|haiku|fable)\b([\sa-z0-9.\-]*)/i);
    if (m) {
      const v = ((m[2] || "").match(/\d+(?:[.\-]\d+)*/) || [])[0];
      return (cap(m[1]) + (v ? " " + v.replace(/-/g, ".").replace(/\.$/, "") : "")).trim();
    }
    m = s.match(/gpt[-\s]?(\d(?:\.\d)?)/i);
    if (m) return "GPT-" + m[1];
    m = s.match(/\b(4o|4\.1)\b/i);
    if (m) return m[1].toUpperCase();
    m = s.match(/\b(o\d)\b/i);
    if (m) return m[1];
    return raw.length < 32 ? raw : raw.slice(0, 29) + "...";
  }
  function appendTier(base, tier) {
    if (!tier) return base;
    return new RegExp("\\b" + tier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", "i").test(base) ? base : base + " " + cap(tier);
  }
  function toolbarScope() {
    const c = composerEl();
    if (!c) return [];
    const a = c.closest("form") || c.parentElement;
    return [a, a && a.parentElement].filter(Boolean);
  }
  function scopedMatch(re) {
    let best = "";
    for (const sc of toolbarScope()) {
      sc.querySelectorAll('button, [role="button"], [data-testid*="model"]').forEach((el) => {
        if (!visible(el)) return;
        const txt = (el.textContent || "").trim();
        if (txt && txt.length < 50 && re.test(txt) && (!best || txt.length < best.length)) best = txt;
      });
    }
    return best;
  }
  function modelSelection() {
    const modelText = scopedMatch(SITE.modelRe);
    const effortText = scopedMatch(SITE.effortRe);
    const effort = (effortText.match(SITE.effortRe) || [])[0] || "";
    return { modelText, effort };
  }
  function modelKey() {
    const s = modelSelection();
    return [s.modelText, s.effort].join("|");
  }
  function resolveContext() {
    const ov = CLAUDE ? OV.claude : OV.chatgpt;
    if (ov && ov > 0) return { value: ov, source: "override" };
    const live = CLAUDE ? S.claudeLive : gptCtxForSlug(S.apiSlug);
    if (live && live > 0) return { value: live, source: "live" };
    if (OV.useFallback) {
      const est = CLAUDE ? SITE.context : openaiContext(S.estKey);
      if (est && est > 0) return { value: est, source: "estimated" };
    }
    return { value: null, source: "unknown" };
  }
  function updateModel() {
    const sel = modelSelection();
    if (CLAUDE) {
      S.model = appendTier(parseModelDisplay(sel.modelText || S.apiSlug) || SITE.name, sel.effort);
      S.estKey = "";
    } else {
      S.model = appendTier(parseModelDisplay(sel.modelText || S.apiSlug) || SITE.name, sel.effort);
      S.estKey = [S.apiSlug, sel.modelText, sel.effort].filter(Boolean).join(" ");
    }
    const r = resolveContext();
    S.context = r.value;
    S.ctxSource = r.source;
  }

  // ---------- diagnostics ----------
  function diagnosticSnapshot() {
    return {
      version: VERSION,
      site: SITE.name,
      url: location.href,
      conversationId: SITE.convId() || "",
      model: S.model,
      apiSlug: S.apiSlug,
      contextSource: S.ctxSource,
      contextTokens: S.context || null,
      tokenEstimate: S.tokens || 0,
      tokenSource: S.tokenSource,
      countTrusted: S.countTrusted,
      lastMeasureAt: S.lastMeasureAt,
      lastApi: S.lastApi,
      apiMessageCount: S.apiMessageCount,
      apiNodeCount: S.apiNodeCount,
      lastError: S.lastError,
      cacheHit: S.cacheHit,
      composerSelector: S.composerSelector,
      messageSelector: S.messageSelector,
      lastAction: S.lastAction,
    };
  }
  function diagLine() {
    const id = SITE.convId();
    const last = S.lastMeasureAt ? new Date(S.lastMeasureAt).toLocaleTimeString() : "never";
    const ctx = S.context ? `${S.ctxSource}:${fmt(S.context)}` : "unknown";
    const err = S.lastError ? " error=" + S.lastError : " error=none";
    const action = S.lastAction ? " action=" + S.lastAction : "";
    return `${SITE.name} id=${shortId(id)} model=${clip(S.apiSlug || S.model, 24)} ctx=${ctx} tokens=${fmt(S.tokens)} via=${S.tokenSource} full=${
      S.countTrusted ? "yes" : "no"
    } api=${S.apiMessageCount || 0}/${S.apiNodeCount || 0} cache=${
      S.cacheHit ? "yes" : "no"
    } composer=${S.composerSelector} messages=${S.messageSelector} last=${last}${action}${err}`;
  }
  function renderDiagnostics() {
    if (S.root) S.root.dataset.debug = OV.showDiagnostics ? "true" : "false";
    if (S.diag) S.diag.textContent = diagLine();
  }
  function queueDiagnosticsWrite() {
    clearTimeout(S.diagTimer);
    S.diagTimer = setTimeout(() => storageSet("local", { tarpitDiag: diagnosticSnapshot() }), 150);
  }
  try {
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || msg.type !== "tarpit:getDiagnostics") return false;
      updateModel();
      sendResponse(diagnosticSnapshot());
      return false;
    });
  } catch (_) {}

  // ---------- cache ----------
  const cacheKey = (id) => `tarpitCache:${SITE.key}:${id}`;
  async function readChatCache(id) {
    if (!id) return null;
    if (
      MEM_CACHE[id] &&
      MEM_CACHE[id].version === CACHE_VERSION &&
      MEM_CACHE[id].tokenSource === "api" &&
      Date.now() - MEM_CACHE[id].timestamp < CACHE_TTL_MS
    ) {
      return MEM_CACHE[id];
    }
    const r = await storageGet("local", [cacheKey(id)]);
    const cached = r[cacheKey(id)];
    if (!cached || Date.now() - cached.timestamp > CACHE_TTL_MS) return null;
    if (cached.version !== CACHE_VERSION || cached.tokenSource !== "api") return null;
    MEM_CACHE[id] = cached;
    return cached;
  }
  async function writeChatCache(id) {
    if (!id || !S.haveValue || S.tokens <= 0 || S.tokenSource !== "api") return;
    const entry = {
      version: CACHE_VERSION,
      tokens: S.tokens,
      apiSlug: S.apiSlug,
      tokenSource: S.tokenSource,
      apiMessageCount: S.apiMessageCount,
      apiNodeCount: S.apiNodeCount,
      timestamp: Date.now(),
    };
    MEM_CACHE[id] = entry;
    await storageSet("local", { [cacheKey(id)]: entry });
  }

  // ---------- live model context ----------
  let gptModelsMap = null;
  let gptModelsPromise = null;
  let gptModelsFailAt = 0;
  function collectModels(d) {
    const out = [];
    const walk = (x) => {
      if (!x) return;
      if (Array.isArray(x)) return x.forEach(walk);
      if (typeof x === "object") {
        if (x.slug || x.id) out.push(x);
        walk(x.models);
        walk(x.categories);
        walk(x.tags);
      }
    };
    walk(d.models);
    walk(d.categories);
    walk(d);
    return out;
  }
  function modelCtx(m) {
    const c = m.capabilities || {};
    return m.max_context_window_tokens || m.context_window || c.context_window || c.max_context_window_tokens || (c.limits && c.limits.context_window) || null;
  }
  async function ensureGptModels() {
    if (!OPENAI) return null;
    if (gptModelsMap) return gptModelsMap;
    if (gptModelsPromise) return gptModelsPromise;
    if (Date.now() - gptModelsFailAt < 60000) return null;
    gptModelsPromise = (async () => {
      try {
        if (!S.gptTok) {
          const s = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" }).then((r) => r.json());
          S.gptTok = s && s.accessToken;
        }
        const h = S.gptTok ? { Authorization: "Bearer " + S.gptTok } : {};
        const res = await fetch("/backend-api/models?history_and_training_disabled=false", {
          credentials: "include",
          cache: "no-store",
          headers: h,
        });
        if (!res.ok) throw new Error("models " + res.status);
        const d = await res.json();
        const map = {};
        collectModels(d).forEach((m) => {
          const slug = (m.slug || m.id || "").toLowerCase();
          const ctx = modelCtx(m);
          if (slug && ctx) map[slug] = ctx;
        });
        if (!Object.keys(map).length) throw new Error("no context fields");
        gptModelsMap = map;
        S.lastApi = "models";
        clearError("models");
        render();
        return map;
      } catch (e) {
        gptModelsFailAt = Date.now();
        gptModelsPromise = null;
        recordError("models", e);
        renderDiagnostics();
        queueDiagnosticsWrite();
        return null;
      }
    })();
    return gptModelsPromise;
  }
  function gptCtxForSlug(slug) {
    if (!gptModelsMap || !slug) return null;
    slug = slug.toLowerCase();
    if (gptModelsMap[slug]) return gptModelsMap[slug];
    const k = Object.keys(gptModelsMap).find((x) => slug.startsWith(x) || x.startsWith(slug));
    return k ? gptModelsMap[k] : null;
  }

  // ---------- conversation APIs ----------
  function scanCtx(obj, depth) {
    if (!obj || depth > 4 || typeof obj !== "object") return null;
    for (const k in obj) {
      const v = obj[k];
      if (typeof v === "number" && v > 1000 && /(context.*token|max.*context|context.?window)/i.test(k)) return v;
      if (v && typeof v === "object") {
        const f = scanCtx(v, depth + 1);
        if (f) return f;
      }
    }
    return null;
  }
  async function withTimeout(p, ms) {
    let t;
    const to = new Promise((_, r) => (t = setTimeout(() => r(new Error("timeout")), ms)));
    try {
      return await Promise.race([p, to]);
    } finally {
      clearTimeout(t);
    }
  }
  function extractText(value, depth) {
    if (!value || depth > 7) return "";
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "boolean") return "";
    if (Array.isArray(value)) return value.map((x) => extractText(x, depth + 1)).filter(Boolean).join("\n");
    if (typeof value !== "object") return "";
    const keys = ["text", "content", "parts", "result", "summary", "value", "input", "output", "transcript"];
    return keys
      .map((k) => extractText(value[k], depth + 1))
      .filter(Boolean)
      .join("\n");
  }
  function messageText(msg) {
    if (!msg) return "";
    return [extractText(msg.content, 0), extractText(msg.text, 0)].filter(Boolean).join("\n");
  }
  function shouldCountRole(role) {
    return !role || /^(user|assistant|tool)$/i.test(role);
  }
  async function claudeApi(id) {
    if (!S.org) {
      const o = await fetch("/api/organizations", { credentials: "include" }).then((r) => r.json());
      const orgs = Array.isArray(o) ? o : o.organizations || [];
      const org = orgs.find((x) => x && x.uuid) || orgs[0] || {};
      S.org = org.uuid;
      if (!S.org) throw new Error("no organization");
      if (S.claudeLive == null) S.claudeLive = scanCtx(o, 0);
    }
    const d = await fetch(`/api/organizations/${S.org}/chat_conversations/${id}?rendering_mode=raw`, {
      credentials: "include",
      cache: "no-store",
    }).then((r) => r.json());
    if (S.claudeLive == null) S.claudeLive = scanCtx(d, 0);
    let tok = 0;
    (d.chat_messages || []).forEach((m) => {
      tok += estTokens(messageText(m));
    });
    S.apiMessageCount = (d.chat_messages || []).length;
    S.apiNodeCount = S.apiMessageCount;
    if (d.model) S.apiSlug = d.model;
    S.lastApi = "claude-conversation";
    clearError("conversation");
    return tok;
  }
  async function gptApi(id) {
    if (!S.gptTok) {
      const s = await fetch("/api/auth/session", { credentials: "include", cache: "no-store" }).then((r) => r.json());
      S.gptTok = s && s.accessToken;
    }
    const h = S.gptTok ? { Authorization: "Bearer " + S.gptTok } : {};
    let res = await fetch(`/backend-api/conversation/${id}`, { credentials: "include", cache: "no-store", headers: h });
    if (!res.ok) {
      S.gptTok = null;
      res = await fetch(`/backend-api/conversation/${id}`, { credentials: "include", cache: "no-store" });
    }
    if (!res.ok) throw new Error("conversation " + res.status);
    const d = await res.json();
    const map = d.mapping || {};
    const nodeIds = Object.keys(map);
    S.apiSlug = d.default_model_slug || d.model_slug || S.apiSlug;
    function countNodeList(nodes) {
      let tokens = 0;
      let messages = 0;
      nodes.forEach((n) => {
        const msg = n && n.message;
        if (!msg || !shouldCountRole(msg.author && msg.author.role)) return;
        const text = messageText(msg);
        if (!text) return;
        messages += 1;
        tokens += estTokens(text);
        if (msg.metadata && msg.metadata.model_slug) S.apiSlug = msg.metadata.model_slug;
      });
      return { tokens, messages };
    }
    function latestLeaf() {
      const parents = new Set();
      nodeIds.forEach((k) => {
        if (map[k] && map[k].parent) parents.add(map[k].parent);
      });
      return nodeIds
        .filter((k) => !parents.has(k))
        .sort((a, b) => {
          const am = (map[a] && map[a].message) || {};
          const bm = (map[b] && map[b].message) || {};
          return (bm.create_time || 0) - (am.create_time || 0);
        })[0];
    }
    let node = map[d.current_node] ? d.current_node : latestLeaf();
    const seen = new Set();
    const pathNodes = [];
    while (node && map[node] && !seen.has(node)) {
      seen.add(node);
      pathNodes.push(map[node]);
      const msg = map[node].message;
      if (msg && msg.metadata && msg.metadata.model_slug) S.apiSlug = msg.metadata.model_slug;
      node = map[node].parent;
    }
    const path = countNodeList(pathNodes);
    const all = countNodeList(nodeIds.map((k) => map[k]));
    let chosen = path;
    let mode = "path";
    if (all.tokens > path.tokens * 1.25 && all.messages > path.messages + 2) {
      chosen = all;
      mode = "all";
    }
    if (!chosen.tokens && all.tokens) {
      chosen = all;
      mode = "all";
    }
    S.apiMessageCount = chosen.messages;
    S.apiNodeCount = nodeIds.length;
    if (d.moderation_results && d.moderation_results.length) {
      const latest = d.moderation_results[d.moderation_results.length - 1];
      if (latest && latest.model_slug) S.apiSlug = latest.model_slug;
    }
    S.lastApi = "chatgpt-conversation:" + mode;
    clearError("conversation");
    return chosen.tokens;
  }
  function domTokens() {
    return msgNodes()
      .filter(visible)
      .reduce((tok, el) => tok + estTokens(el.innerText || ""), 0);
  }
  function applyRenderedFallback(source) {
    const tok = domTokens();
    if (tok <= 0) return false;
    S.tokens = tok;
    S.tokenSource = source || "rendered";
    S.haveValue = true;
    S.countTrusted = false;
    S.measuredConv = SITE.convId();
    return true;
  }

  // ---------- measurement ----------
  async function applyCache(id) {
    const cached = await readChatCache(id);
    if (!cached) return false;
    S.tokens = cached.tokens || 0;
    S.apiSlug = cached.apiSlug || S.apiSlug;
    S.tokenSource = cached.tokenSource ? "cache:" + cached.tokenSource : "cache";
    S.haveValue = true;
    S.countTrusted = true;
    S.measuredConv = id;
    S.lastMeasureAt = cached.timestamp;
    S.apiMessageCount = cached.apiMessageCount || 0;
    S.apiNodeCount = cached.apiNodeCount || 0;
    S.cacheHit = true;
    updateModel();
    buildUI();
    render();
    rememberSignature();
    return true;
  }
  async function measure(opts) {
    const force = !!(opts && opts.force);
    buildUI();
    S.cacheHit = false;
    const id = SITE.convId();
    if (!id) {
      S.tokens = 0;
      S.tokenSource = "none";
      S.haveValue = false;
      S.countTrusted = false;
      S.measuredConv = null;
      S.apiMessageCount = 0;
      S.apiNodeCount = 0;
      render();
      return;
    }
    const modelsP = ensureGptModels();

    if (!force && !S.haveValue) await applyCache(id);

    if (!S.haveValue && hasRenderedMessages()) {
      applyRenderedFallback("rendered-pending");
      render();
    }
    try {
      const tok = await withTimeout(CLAUDE ? claudeApi(id) : gptApi(id), OPENAI ? 20000 : 5000);
      if (tok > 0) {
        S.tokens = tok;
        S.tokenSource = "api";
        S.haveValue = true;
        S.countTrusted = true;
        S.measuredConv = id;
      } else if (!S.countTrusted) {
        if (!applyRenderedFallback("rendered")) {
          S.tokens = 0;
          S.tokenSource = "api-empty";
          S.haveValue = false;
        }
      }
    } catch (e) {
      recordError("conversation", e);
      if (!S.countTrusted) {
        if (!applyRenderedFallback("rendered-api-error")) {
          S.tokens = 0;
          S.tokenSource = "api-error";
          S.haveValue = false;
        }
      }
    }
    S.lastMeasureAt = Date.now();
    if (modelsP) await modelsP.catch(() => {});
    updateModel();
    buildUI();
    render();
    rememberSignature();
    await writeChatCache(id);
  }
  function scheduleMeasure(force) {
    clearTimeout(S.pending);
    S.pending = setTimeout(() => measure({ force: force === true }), 1200);
  }
  function rememberSignature() {
    try {
      S.sig = signature();
    } catch (_) {}
  }

  // ---------- UI ----------
  const findMount = () => {
    const c = composerEl();
    if (!c) return null;
    const form = c.closest("form");
    if (form && form.parentElement) return { parent: form.parentElement, before: form, mode: "outside-form" };
    if (c.parentElement) return { parent: c.parentElement, before: c, mode: "before-composer" };
    return null;
  };
  function buildUI() {
    const mount = findMount();
    const ex = document.getElementById("tarpit-root");
    if (!mount || !mount.parent) {
      if (ex) ex.remove();
      queueDiagnosticsWrite();
      return;
    }
    const shouldMount = OV.showDiagnostics || hasChat() || (hasConversation() && S.haveValue && S.countTrusted);
    if (!shouldMount) {
      if (ex) ex.remove();
      S.root = null;
      S.fill = null;
      S.label = null;
      S.btn = null;
      S.diag = null;
      queueDiagnosticsWrite();
      return;
    }
    const target = mount.parent;
    if (ex && ex.parentElement === target) {
      if (mount.before && ex.nextSibling !== mount.before) target.insertBefore(ex, mount.before);
      S.root = ex;
      S.fill = ex.querySelector("#tarpit-fill");
      S.label = ex.querySelector("#tarpit-label");
      S.btn = ex.querySelector("#tarpit-btn");
      S.diag = ex.querySelector("#tarpit-diag");
      renderDiagnostics();
      return;
    }
    if (ex) ex.remove();
    const root = document.createElement("div");
    root.id = "tarpit-root";
    root.dataset.version = VERSION;
    root.innerHTML =
      '<div id="tarpit-main">' +
      '<div id="tarpit-bar"><div id="tarpit-fill" data-zone="ok"></div><span id="tarpit-label">measuring...</span></div>' +
      '<button id="tarpit-btn" type="button" title="Insert handoff prompt (does not send)" aria-label="Insert handoff prompt" disabled>' +
      ICON +
      "</button></div>" +
      '<div id="tarpit-diag" aria-live="polite"></div>';
    target.insertBefore(root, mount.before || target.firstChild);
    S.root = root;
    S.fill = root.querySelector("#tarpit-fill");
    S.label = root.querySelector("#tarpit-label");
    S.btn = root.querySelector("#tarpit-btn");
    S.diag = root.querySelector("#tarpit-diag");
    S.btn.addEventListener(
      "mousedown",
      (e) => {
        e.preventDefault();
        e.stopPropagation();
      },
      true
    );
    S.btn.addEventListener("click", handoff, true);
    renderDiagnostics();
    if (S.haveValue) render();
  }
  function render() {
    if (!S.fill || !S.root) {
      queueDiagnosticsWrite();
      return;
    }
    const id = SITE.convId();
    const chatReady = !!id && (hasRenderedMessages() || S.haveValue);
    if (!id && !OV.showDiagnostics) {
      S.root.style.display = "none";
      queueDiagnosticsWrite();
      return;
    }
    if (!chatReady && !OV.showDiagnostics) {
      S.root.style.display = "none";
      queueDiagnosticsWrite();
      return;
    }
    S.root.style.display = "flex";
    updateModel();
    if (!chatReady) {
      S.fill.style.setProperty("width", "0%", "important");
      S.fill.dataset.zone = "ok";
      S.label.textContent = `${SITE.name}: waiting for chat messages`;
      S.btn.disabled = true;
      renderDiagnostics();
      queueDiagnosticsWrite();
      return;
    }
    if (!S.countTrusted && S.tokenSource === "rendered-pending") {
      S.fill.style.setProperty("width", "0%", "important");
      S.fill.dataset.zone = "ok";
      S.label.textContent = `${SITE.name}: measuring full chat...`;
      S.btn.disabled = true;
      renderDiagnostics();
      queueDiagnosticsWrite();
      return;
    }
    if (!S.countTrusted && (!S.haveValue || S.tokens <= 0)) {
      S.fill.style.setProperty("width", "0%", "important");
      S.fill.dataset.zone = "ok";
      S.label.textContent = `${SITE.name}: full chat unavailable`;
      S.btn.disabled = true;
      renderDiagnostics();
      queueDiagnosticsWrite();
      return;
    }
    const used = Math.max(0, S.tokens);
    if (S.ctxSource === "unknown" || !S.context) {
      S.fill.style.setProperty("width", "0%", "important");
      S.fill.dataset.zone = "ok";
      S.label.textContent = `${S.model}: ${fmt(used)}/unknown`;
      S.btn.disabled = true;
      renderDiagnostics();
      queueDiagnosticsWrite();
      return;
    }
    const limit = Math.max(1, S.context);
    const pct = Math.min(used / limit, 1);
    S.fill.style.setProperty("width", (used > 0 ? Math.max(MIN_VISIBLE, pct * 100) : 0) + "%", "important");
    S.fill.dataset.zone = pct >= 1 ? "full" : pct >= 0.9 ? "hot" : pct >= 0.7 ? "warn" : "ok";
    const countLabel = S.countTrusted ? "" : " rendered";
    S.label.textContent = `${S.model}: ${fmt(used)}/${fmt(limit)} (${Math.round(pct * 100)}%) ${S.ctxSource}${countLabel}`;
    S.btn.disabled = pct < ENABLE_AT;
    renderDiagnostics();
    queueDiagnosticsWrite();
  }

  // ---------- handoff insertion ----------
  function textNodesForComposer(text) {
    const frag = document.createDocumentFragment();
    const lines = String(text || "").split("\n");
    lines.forEach((line, i) => {
      if (i) frag.appendChild(document.createElement("br"));
      frag.appendChild(document.createTextNode(line));
    });
    return frag;
  }
  function setComposer(text) {
    const c = composerEl();
    if (!c) return false;
    c.focus();
    if (c.tagName === "TEXTAREA" || c.tagName === "INPUT") {
      const proto = c.tagName === "TEXTAREA" ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(proto, "value").set.call(c, text);
      c.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    }
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(c);
    sel.removeAllRanges();
    sel.addRange(range);
    try {
      const r = sel.rangeCount ? sel.getRangeAt(0) : range;
      r.deleteContents();
      r.insertNode(textNodesForComposer(text));
      r.collapse(false);
      sel.removeAllRanges();
      sel.addRange(r);
    } catch (_) {
      c.textContent = text;
    }
    c.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    return true;
  }
  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(S.prompt);
      return true;
    } catch (e) {
      recordError("clipboard", e);
      return false;
    }
  }
  async function handoff(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    }
    if (S.btn.disabled) return;
    if (setComposer(S.prompt)) {
      S.lastAction = "handoff inserted";
    } else if (await copyPrompt()) {
      S.lastAction = "prompt copied";
    } else {
      S.lastAction = "handoff failed";
    }
    S.btn.title = S.lastAction;
    renderDiagnostics();
    queueDiagnosticsWrite();
  }

  // ---------- triggers ----------
  function onRoute() {
    buildUI();
    const id = SITE.convId();
    if (location.href !== S.lastUrl || id !== S.measuredConv) {
      S.lastUrl = location.href;
      if (id !== S.measuredConv) {
        S.haveValue = false;
        S.tokens = 0;
        S.sig = "";
        S.tokenSource = "none";
        S.countTrusted = false;
        S.apiMessageCount = 0;
        S.apiNodeCount = 0;
      }
      measure({ force: false });
    }
  }
  function signature() {
    const nodes = msgNodes();
    let total = 0;
    nodes.forEach((n) => (total += (n.innerText || "").length));
    return nodes.length + ":" + total + ":" + modelKey();
  }
  function onMutate() {
    clearTimeout(S.obsTimer);
    S.obsTimer = setTimeout(() => {
      buildUI();
      if (location.href !== S.lastUrl) {
        onRoute();
        return;
      }
      const sig = signature();
      if (sig !== S.sig) {
        S.sig = sig;
        render();
        if (hasChat()) scheduleMeasure(true);
      }
    }, 300);
  }
  const CTRL_RE = /regenerate|edit|previous|next response|switch|branch|retry|try again|response \d+\/\d+/i;
  function isCtrlClick(t) {
    const el = t && t.closest && t.closest('button, [role="button"], [aria-label]');
    if (!el) return false;
    const lbl = ((el.getAttribute && el.getAttribute("aria-label")) || el.textContent || "").toLowerCase();
    return CTRL_RE.test(lbl);
  }
  document.addEventListener(
    "click",
    (e) => {
      if (hasChat() && isCtrlClick(e.target)) scheduleMeasure(true);
    },
    true
  );
  ["pushState", "replaceState"].forEach((m) => {
    const o = history[m];
    if (!o || o.__tp) return;
    const p = function (...a) {
      const r = o.apply(this, a);
      queueMicrotask(onRoute);
      return r;
    };
    p.__tp = true;
    history[m] = p;
  });
  window.addEventListener("popstate", onRoute);

  async function start() {
    await loadSettings();
    buildUI();
    measure({ force: false });
    new MutationObserver(() => {
      try {
        onMutate();
      } catch (e) {
        recordError("observer", e);
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
    [300, 1200, 2500].forEach((t) =>
      setTimeout(() => {
        buildUI();
        if (!S.haveValue) measure({ force: false });
      }, t)
    );
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
