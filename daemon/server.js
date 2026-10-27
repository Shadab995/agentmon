#!/usr/bin/env node
/*
 * AgentMon daemon — a tiny local server on 127.0.0.1.
 *
 *   Claude Code hooks  --POST /event, /permission-->  daemon  <--GET /state, POST /decide--  Chrome extension
 *
 * No dependencies, no cloud. Every request needs the token from ~/.agentmon/config.json,
 * so a random website cannot talk to it (custom header => CORS preflight => rejected).
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// The installed copy lives in ~/.agentmon/daemon, so its parent folder is the AgentMon home.
const HOME = process.env.AGENTMON_HOME || path.join(__dirname, '..');
const CONFIG_PATH = path.join(HOME, 'config.json');
const STATE_PATH = path.join(HOME, 'state.json');
const PID_PATH = path.join(HOME, 'daemon.pid');

let Creatures = null;
try { Creatures = require(path.join(__dirname, '..', 'extension', 'creatures.js')); } catch (_) { /* optional */ }
const FAMILY_IDS = Creatures ? Creatures.FAMILIES.map((f) => f.id) : ['ember', 'tide', 'sprout', 'volt', 'stone', 'shade'];
const XP_STAGES = Creatures ? Creatures.XP_STAGES : [0, 20, 60];
const PET_NAMES = ['Mochi', 'Pip', 'Nova', 'Biscuit', 'Juno', 'Tofu', 'Ziggy', 'Olive', 'Comet', 'Momo',
  'Kiwi', 'Bean', 'Luna', 'Sprocket', 'Noodle', 'Pixel', 'Waffle', 'Echo', 'Fig', 'Rumi'];

const XP_PER_TOOL = 1;
const XP_PER_TURN = 3;
const EXTENSION_GRACE_MS = 8000;      // extension counts as "online" this long after its last poll
const SESSION_TTL_MS = 12 * 3600e3;   // forget sessions idle for 12h
const SLEEP_AFTER_MS = 20 * 60e3;     // pets nap after 20 min without activity

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return fallback; }
}

const config = readJson(CONFIG_PATH, null);
if (!config || !config.token) {
  console.error('[agentmon] No config found at ' + CONFIG_PATH + '. Run `agentmon init` first.');
  process.exit(1);
}
const PORT = Number(process.env.AGENTMON_PORT || config.port || 47333);
const TOKEN = String(config.token);
const HOLD_MS = Math.max(5, Number(config.permissionHoldSeconds || 570)) * 1000;
const CONTEXT_WINDOW = Number(config.contextWindow || 0); // 0 = guess (200k, or 1M if usage exceeds 200k)

// ---------------- state ----------------
const saved = readJson(STATE_PATH, {});
const sessions = new Map();
const settings = Object.assign({ mode: 'roam', showPets: true, notifyDone: false }, saved.settings || {});
const dex = Object.assign({}, saved.dex || {}); // familyId -> highest stage seen
let version = 1;
const bootId = crypto.randomBytes(6).toString('hex');

for (const s of saved.sessions || []) {
  if (!s || !s.id || Date.now() - (s.updatedAt || 0) > SESSION_TTL_MS) continue;
  s.pending = null;
  s.status = 'idle';
  s.statusText = '';
  sessions.set(s.id, s);
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const out = {
      settings, dex,
      sessions: [...sessions.values()].filter((s) => !s.demo).map((s) => Object.assign({}, s, { pending: null }))
    };
    try { fs.writeFileSync(STATE_PATH, JSON.stringify(out, null, 2)); } catch (e) { log('save failed', e.message); }
  }, 800);
}

function log(...a) { console.log(new Date().toISOString(), '[agentmon]', ...a); }

// ---------------- helpers ----------------
function trunc(str, max) {
  if (str == null) return '';
  str = String(str);
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}
function base(p) { return p ? path.basename(String(p)) : ''; }
function rel(file, cwd) {
  if (!file) return '';
  try {
    const r = cwd ? path.relative(cwd, file) : file;
    return r && !r.startsWith('..') && !path.isAbsolute(r) ? r : file;
  } catch (_) { return String(file); }
}

function hash(str) { let h = 0; for (const ch of String(str)) h = (h * 31 + ch.charCodeAt(0)) | 0; return Math.abs(h); }

function pickFamily(sid) {
  const used = new Set([...sessions.values()].map((s) => s.family));
  const free = FAMILY_IDS.filter((f) => !used.has(f));
  const pool = free.length ? free : FAMILY_IDS;
  return pool[hash(sid) % pool.length];
}
function pickName(sid) {
  const used = new Set([...sessions.values()].map((s) => s.petName));
  const free = PET_NAMES.filter((nm) => !used.has(nm));
  const pool = free.length ? free : PET_NAMES;
  return pool[hash(sid + 'n') % pool.length];
}
function stageForXp(xp) { return xp >= XP_STAGES[2] ? 3 : xp >= XP_STAGES[1] ? 2 : 1; }

function toolLabel(name, input, cwd) {
  input = input || {};
  const file = rel(input.file_path || input.notebook_path || input.path, cwd);
  switch (name) {
    case 'Bash': case 'PowerShell': return 'Running ' + trunc((input.command || '').split('\n')[0], 28);
    case 'Edit': case 'MultiEdit': return 'Editing ' + trunc(base(file), 24);
    case 'Write': return 'Writing ' + trunc(base(file), 24);
    case 'Read': return 'Reading ' + trunc(base(file), 24);
    case 'NotebookEdit': return 'Editing ' + trunc(base(file), 24);
    case 'Glob': case 'Grep': return 'Searching code';
    case 'WebFetch': return 'Reading the web';
    case 'WebSearch': return 'Searching the web';
    case 'Task': case 'Agent': return 'Sending a helper';
    case 'TodoWrite': case 'TaskCreate': case 'TaskUpdate': return 'Planning';
    default:
      if (String(name).startsWith('mcp__')) return 'Using ' + trunc(String(name).split('__')[1] || 'MCP', 22);
      return 'Using ' + trunc(name, 24);
  }
}

// What the permission card shows: a title, the main thing (command/file/url) and an optional preview.
function permissionSummary(name, input, cwd) {
  input = input || {};
  const file = rel(input.file_path || input.notebook_path || input.path, cwd);
  if (name === 'Bash' || name === 'PowerShell') {
    return { title: 'Wants to run ' + name, code: trunc(input.command, 2000), note: trunc(input.description, 200) };
  }
  if (name === 'Edit' || name === 'MultiEdit') {
    const edits = Array.isArray(input.edits) ? input.edits : [input];
    const e = edits[0] || {};
    const preview = (e.old_string != null || e.new_string != null)
      ? ('- ' + trunc(e.old_string, 300).split('\n').join('\n- ') + '\n+ ' + trunc(e.new_string, 300).split('\n').join('\n+ '))
      : '';
    return { title: 'Wants to use Edit', code: file, preview: trunc(preview, 900), note: edits.length > 1 ? edits.length + ' edits' : '' };
  }
  if (name === 'Write') return { title: 'Wants to use Write', code: file, preview: trunc(input.content, 700) };
  if (name === 'NotebookEdit') return { title: 'Wants to edit a notebook', code: file, preview: trunc(input.new_source, 600) };
  if (name === 'WebFetch') return { title: 'Wants to fetch a page', code: trunc(input.url, 500) };
  if (name === 'WebSearch') return { title: 'Wants to search the web', code: trunc(input.query, 300) };
  if (name === 'Read') return { title: 'Wants to read a file', code: file };
  if (String(name).startsWith('mcp__')) {
    const parts = String(name).split('__');
    return { title: 'Wants to use ' + (parts[1] || 'MCP') + ' → ' + (parts.slice(2).join('__') || ''), code: trunc(JSON.stringify(input, null, 2), 1200) };
  }
  return { title: 'Wants to use ' + name, code: trunc(JSON.stringify(input, null, 2), 1200) };
}

// Approximate context usage from the transcript tail (last assistant message usage).
function readContextUsage(transcriptPath) {
  if (!transcriptPath) return null;
  let fd;
  try {
    const st = fs.statSync(transcriptPath);
    const len = Math.min(st.size, 600000);
    const buf = Buffer.alloc(len);
    fd = fs.openSync(transcriptPath, 'r');
    fs.readSync(fd, buf, 0, len, st.size - len);
    const lines = buf.toString('utf8').split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line || line.indexOf('"usage"') === -1) continue;
      let obj; try { obj = JSON.parse(line); } catch (_) { continue; }
      if (obj.isSidechain) continue;
      const u = obj.message && obj.message.usage;
      if (!u) continue;
      return (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.output_tokens || 0);
    }
  } catch (_) { /* ignore */ } finally { if (fd !== undefined) try { fs.closeSync(fd); } catch (_) {} }
  return null;
}

function updateContext(s, force) {
  if (s.demo) return;
  const now = Date.now();
  if (!force && now - (s.contextCheckedAt || 0) < 15000) return;
  s.contextCheckedAt = now;
  const used = readContextUsage(s.transcript);
  if (used == null) return;
  const win = CONTEXT_WINDOW || (used > 200000 ? 1000000 : 200000);
  s.contextUsed = used;
  s.contextWindow = win;
  s.hp = Math.max(0, Math.min(1, 1 - used / win));
}

// ---------------- sessions ----------------
function getSession(ev, create) {
  const sid = ev.session_id;
  if (!sid) return null;
  let s = sessions.get(sid);
  if (!s && create) {
    s = {
      id: sid,
      agent: ev._agent || 'Claude Code',
      family: ev._family && FAMILY_IDS.includes(ev._family) ? ev._family : pickFamily(sid),
      petName: ev._petName || pickName(sid),
      xp: 0, stage: 1, evolvedAt: 0,
      status: 'idle', statusText: '',
      cwd: ev.cwd || '', project: base(ev.cwd) || 'session',
      transcript: ev.transcript_path || '',
      lastPrompt: '', lastMessage: '',
      hp: null, contextUsed: null, contextWindow: null,
      pending: null, hidden: false, demo: !!ev._demo,
      startedAt: Date.now(), updatedAt: Date.now(), lastTs: 0
    };
    sessions.set(sid, s);
    dex[s.family] = Math.max(dex[s.family] || 0, 1);
    log('new pet', s.petName, '(' + s.family + ') for', s.project);
  }
  return s;
}

function addXp(s, amount) {
  s.xp += amount;
  const st = stageForXp(s.xp);
  if (st > s.stage) {
    s.stage = st;
    s.evolvedAt = Date.now();
    dex[s.family] = Math.max(dex[s.family] || 0, st);
    log(s.petName, 'evolved to stage', st);
  }
}

function setStatus(s, ts, status, text) {
  if (ts < s.lastTs) return; // async hooks can arrive out of order; keep the newest status
  s.lastTs = ts;
  s.status = status;
  s.statusText = text || '';
}

function handleEvent(ev) {
  const name = ev.hook_event_name;
  if (name === 'SessionEnd') {
    const s = sessions.get(ev.session_id);
    if (s) { clearPending(s, null); sessions.delete(s.id); log('session ended', s.petName); }
    return bump();
  }
  const s = getSession(ev, true);
  if (!s) return;
  const ts = Number(ev._ts) || Date.now();
  s.updatedAt = Date.now();
  if (ev.cwd) { s.cwd = ev.cwd; s.project = base(ev.cwd) || s.project; }
  if (ev.transcript_path) s.transcript = ev.transcript_path;
  if (ev._demo && typeof ev._hp === 'number') s.hp = ev._hp;

  switch (name) {
    case 'SessionStart':
      setStatus(s, ts, 'idle', ev.source === 'compact' ? 'Fresh memory' : '');
      if (ev.source === 'compact' || ev.source === 'resume') updateContext(s, true);
      break;
    case 'UserPromptSubmit':
      s.hidden = false; // a despawned pet comes back when you talk to it again
      s.lastPrompt = trunc(ev.prompt, 400);
      clearPending(s, null);
      setStatus(s, ts, 'thinking', 'Thinking');
      break;
    case 'PreToolUse': {
      if (s.pending && ev.tool_use_id && s.pending.toolUseId && s.pending.toolUseId !== ev.tool_use_id) clearPending(s, null);
      if (ev.tool_name === 'AskUserQuestion') setStatus(s, ts, 'your_turn', 'Has a question');
      else if (ev.tool_name === 'ExitPlanMode') setStatus(s, ts, 'your_turn', 'Plan ready');
      else if (!s.pending) setStatus(s, ts, 'working', toolLabel(ev.tool_name, ev.tool_input, s.cwd));
      break;
    }
    case 'PostToolUse':
    case 'PostToolUseFailure':
      // The tool ran, so its pending approval was answered somewhere else (e.g. the terminal).
      if (s.pending) {
        const p = s.pending;
        const sameId = p.toolUseId && ev.tool_use_id && p.toolUseId === ev.tool_use_id;
        const noIds = !p.toolUseId || !ev.tool_use_id;
        if (sameId || (noIds && ev.tool_name === p.toolName && ts >= p.createdAt)) clearPending(s, null);
      }
      addXp(s, name === 'PostToolUse' ? XP_PER_TOOL : 0);
      if (!s.pending) setStatus(s, ts, 'thinking', 'Thinking');
      updateContext(s, false);
      break;
    case 'Notification': {
      const type = ev.notification_type || '';
      if (type === 'idle_prompt') setStatus(s, ts, 'your_turn', 'Your turn');
      else if (type === 'permission_prompt') { if (!s.pending) setStatus(s, ts, 'your_turn', 'Needs approval'); }
      else if (type === 'elicitation_dialog' || type === 'agent_needs_input') setStatus(s, ts, 'your_turn', 'Needs your input');
      break;
    }
    case 'Stop':
      clearPending(s, null);
      if (ev.last_assistant_message) s.lastMessage = trunc(ev.last_assistant_message, 1500);
      addXp(s, XP_PER_TURN);
      setStatus(s, ts, 'done', 'Done');
      s.doneAt = Date.now();
      updateContext(s, true);
      break;
    case 'StopFailure':
      clearPending(s, null);
      setStatus(s, ts, 'error', 'Hit an error');
      break;
    case 'SubagentStart':
      if (!s.pending) setStatus(s, ts, 'working', 'Sending a helper');
      break;
    case 'PreCompact':
      setStatus(s, ts, 'working', 'Tidying memory');
      break;
    default:
      break;
  }
  if (ev._demo && typeof ev._xp === 'number') addXp(s, ev._xp);
  bump();
}

// ---------------- permission holds ----------------
const waiters = new Map(); // requestId -> { res, sid, timer }

function clearPending(s, decision) {
  if (!s || !s.pending) return;
  resolvePermission(s.pending.id, decision, 'cleared');
}

function resolvePermission(id, decision, why) {
  const w = waiters.get(id);
  if (w) {
    waiters.delete(id);
    clearTimeout(w.timer);
    try { if (!w.res.writableEnded) sendJson(w.res, 200, { decision: decision || null }); } catch (_) {}
  }
  for (const s of sessions.values()) {
    if (s.pending && s.pending.id === id) {
      s.pending = null;
      if (decision === 'deny') { s.status = 'thinking'; s.statusText = 'Denied'; }
      else if (decision) { s.status = 'working'; s.statusText = 'Allowed'; }
      else if (s.status === 'permission') { s.status = 'thinking'; s.statusText = 'Thinking'; }
      s.lastTs = Date.now();
    }
  }
  if (why) log('permission', id, '->', decision || 'none', '(' + why + ')');
  bump();
}

function handlePermission(ev, res) {
  const s = getSession(ev, true);
  if (!s) return sendJson(res, 200, { decision: null });
  s.updatedAt = Date.now();
  if (ev.cwd) { s.cwd = ev.cwd; s.project = base(ev.cwd) || s.project; }
  const tool = ev.tool_name || 'Tool';

  // Questions and plan approvals need the real terminal UI, so we only flag them.
  if (tool === 'AskUserQuestion' || tool === 'ExitPlanMode') {
    setStatus(s, Date.now(), 'your_turn', tool === 'ExitPlanMode' ? 'Plan ready' : 'Has a question');
    bump();
    return sendJson(res, 200, { decision: null });
  }
  if (!extensionOnline()) {
    if (!s.pending) setStatus(s, Date.now(), 'your_turn', 'Needs approval');
    bump();
    return sendJson(res, 200, { decision: null });
  }
  if (s.pending) clearPending(s, null);

  const id = crypto.randomBytes(8).toString('hex');
  const sum = permissionSummary(tool, ev.tool_input, s.cwd);
  s.pending = {
    id, toolName: tool, toolUseId: ev.tool_use_id || null,
    title: sum.title, code: sum.code || '', preview: sum.preview || '', note: sum.note || '',
    canAlways: Array.isArray(ev.permission_suggestions) && ev.permission_suggestions.length > 0,
    createdAt: Date.now()
  };
  s.hidden = false;
  s.status = 'permission';
  s.statusText = 'Allow ' + (tool.startsWith('mcp__') ? 'tool' : tool) + '?';
  s.lastTs = Date.now();
  const timer = setTimeout(() => resolvePermission(id, null, 'timeout'), HOLD_MS);
  waiters.set(id, { res, sid: s.id, timer });
  // If Claude Code cancels the hook (you answered in the terminal), the socket closes.
  res.on('close', () => { if (waiters.has(id)) resolvePermission(id, null, 'hook closed'); });
  log('permission requested', s.petName, tool);
  bump();
}

// ---------------- extension long-poll ----------------
const pollers = new Set(); // { res, timer }
let lastPollEnd = 0;

function extensionOnline() {
  return pollers.size > 0 || Date.now() - lastPollEnd < EXTENSION_GRACE_MS;
}

function publicState() {
  const now = Date.now();
  const list = [...sessions.values()].map((s) => {
    let status = s.status, statusText = s.statusText;
    if (!s.pending && (status === 'idle' || status === 'done' || status === 'your_turn') && now - s.updatedAt > SLEEP_AFTER_MS) {
      status = 'sleeping'; statusText = 'Napping';
    }
    return {
      id: s.id, agent: s.agent, family: s.family, petName: s.petName,
      xp: s.xp, stage: s.stage, evolvedAt: s.evolvedAt,
      status, statusText, project: s.project, cwd: s.cwd,
      lastPrompt: s.lastPrompt, lastMessage: s.lastMessage,
      hp: s.hp, contextUsed: s.contextUsed, contextWindow: s.contextWindow,
      pending: s.pending, hidden: s.hidden, demo: s.demo,
      startedAt: s.startedAt, updatedAt: s.updatedAt
    };
  }).sort((a, b) => a.startedAt - b.startedAt);
  return { app: 'agentmon', bootId, version, now, settings, dex, sessions: list };
}

function bump() {
  version++;
  if (pollers.size) {
    const state = publicState();
    for (const p of pollers) { clearTimeout(p.timer); sendJson(p.res, 200, state); }
    pollers.clear();
    lastPollEnd = Date.now();
  }
  save();
}

// Wake pets up to "napping" etc. and release holds if the extension vanished.
setInterval(() => {
  if (waiters.size && !extensionOnline()) {
    for (const id of [...waiters.keys()]) resolvePermission(id, null, 'extension offline');
  }
  const now = Date.now();
  let changed = false;
  for (const s of sessions.values()) {
    if (now - s.updatedAt > SESSION_TTL_MS) { sessions.delete(s.id); changed = true; }
  }
  if (changed) bump();
}, 2000);

let lastNapCheck = 0;
setInterval(() => { // nudge pollers once a minute so napping shows up without an event
  if (Date.now() - lastNapCheck > 60000) { lastNapCheck = Date.now(); if (sessions.size) bump(); }
}, 15000);

// ---------------- http ----------------
function sendJson(res, code, obj) {
  if (res.writableEnded) return;
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(body);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (e) { reject(e); }
    });
    req.on('error', reject);
  });
}

function tokenOk(req) {
  const got = Buffer.from(String(req.headers['x-agentmon-token'] || ''));
  const want = Buffer.from(TOKEN);
  return got.length === want.length && crypto.timingSafeEqual(got, want);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const host = String(req.headers.host || '');
  // Block DNS-rebinding: only accept our own host names.
  if (host !== '127.0.0.1:' + PORT && host !== 'localhost:' + PORT) return sendJson(res, 403, { error: 'bad host' });
  // Web pages may never talk to us. Only the extension (chrome-extension://) and local CLIs (no Origin).
  const origin = String(req.headers.origin || '');
  if (origin && !origin.startsWith('chrome-extension://')) return sendJson(res, 403, { error: 'bad origin' });
  if (req.method === 'OPTIONS') return sendJson(res, 403, { error: 'no cors' });

  if (url.pathname === '/health') return sendJson(res, 200, { app: 'agentmon', ok: true, port: PORT, pid: process.pid });
  if (!tokenOk(req)) return sendJson(res, 401, { error: 'bad token' });

  try {
    if (req.method === 'GET' && url.pathname === '/state') {
      const since = Number(url.searchParams.get('since') || 0);
      const wait = Math.min(25, Math.max(0, Number(url.searchParams.get('wait') || 0)));
      const boot = url.searchParams.get('boot') || '';
      if (!wait || since !== version || (boot && boot !== bootId)) { lastPollEnd = Date.now(); return sendJson(res, 200, publicState()); }
      const p = { res, timer: null };
      p.timer = setTimeout(() => { pollers.delete(p); lastPollEnd = Date.now(); sendJson(res, 200, publicState()); }, wait * 1000);
      pollers.add(p);
      res.on('close', () => { if (pollers.delete(p)) { clearTimeout(p.timer); lastPollEnd = Date.now(); } });
      return;
    }
    if (req.method === 'POST' && url.pathname === '/event') {
      const ev = await readBody(req, 4 * 1024 * 1024);
      handleEvent(ev);
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/permission') {
      const ev = await readBody(req, 4 * 1024 * 1024);
      return handlePermission(ev, res);
    }
    if (req.method === 'POST' && url.pathname === '/decide') {
      const b = await readBody(req, 64 * 1024);
      const s = sessions.get(b.sessionId);
      if (!s || !s.pending || s.pending.id !== b.requestId) return sendJson(res, 409, { error: 'no such request' });
      const d = b.decision === 'always' && !s.pending.canAlways ? 'allow' : b.decision;
      if (!['allow', 'always', 'deny'].includes(d)) return sendJson(res, 400, { error: 'bad decision' });
      resolvePermission(b.requestId, d, 'answered from pet');
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/pet') {
      const b = await readBody(req, 64 * 1024);
      const s = sessions.get(b.sessionId);
      if (!s) return sendJson(res, 404, { error: 'no such session' });
      if (b.action === 'rename') s.petName = trunc(String(b.name || '').replace(/\s+/g, ' ').trim(), 18) || s.petName;
      else if (b.action === 'despawn') s.hidden = true;
      else if (b.action === 'show') s.hidden = false;
      else if (b.action === 'forget' && s.demo) sessions.delete(s.id);
      bump();
      return sendJson(res, 200, { ok: true });
    }
    if (req.method === 'POST' && url.pathname === '/settings') {
      const b = await readBody(req, 16 * 1024);
      if (b.mode === 'roam' || b.mode === 'gather') settings.mode = b.mode;
      if (typeof b.showPets === 'boolean') settings.showPets = b.showPets;
      if (typeof b.notifyDone === 'boolean') settings.notifyDone = b.notifyDone;
      bump();
      return sendJson(res, 200, { ok: true, settings });
    }
    if (req.method === 'POST' && url.pathname === '/demo/clear') {
      for (const s of [...sessions.values()]) if (s.demo) { clearPending(s, null); sessions.delete(s.id); }
      bump();
      return sendJson(res, 200, { ok: true });
    }
    return sendJson(res, 404, { error: 'not found' });
  } catch (e) {
    return sendJson(res, 400, { error: String(e && e.message || e) });
  }
});

server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') console.error('[agentmon] Port ' + PORT + ' is busy — is the daemon already running?');
  else console.error('[agentmon]', e);
  process.exit(1);
});

server.listen(PORT, '127.0.0.1', () => {
  try { fs.writeFileSync(PID_PATH, String(process.pid)); } catch (_) {}
  log('listening on http://127.0.0.1:' + PORT, 'sessions:', sessions.size);
});

function shutdown() {
  for (const id of [...waiters.keys()]) resolvePermission(id, null, 'shutdown');
  try { if (readJson(PID_PATH, null) === process.pid) fs.unlinkSync(PID_PATH); } catch (_) {}
  clearTimeout(saveTimer);
  try {
    fs.writeFileSync(STATE_PATH, JSON.stringify({ settings, dex, sessions: [...sessions.values()].filter((s) => !s.demo).map((s) => Object.assign({}, s, { pending: null })) }, null, 2));
  } catch (_) {}
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
