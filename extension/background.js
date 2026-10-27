/*
 * AgentMon background service worker.
 * Long-polls the local daemon, mirrors its state into chrome.storage.local (content
 * scripts in every tab listen to that), keeps the toolbar badge in sync and shows
 * desktop notifications with Allow / Deny buttons.
 */
'use strict';
importScripts('creatures.js');
var C = self.AgentMonCreatures;

var CFG = null;
var version = 0;
var bootId = '';
var looping = false;
var lastState = { online: false, sessions: [] };
var notified = {};      // notification id -> true
var lastStatus = {};    // session id -> status (for "done" notifications)

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

async function cfg() {
  if (CFG) return CFG;
  var r = await fetch(chrome.runtime.getURL('config.json'), { cache: 'no-store' });
  if (!r.ok) throw new Error('config.json missing. Run `agentmon init` again.');
  CFG = await r.json();
  return CFG;
}

async function api(path, opts) {
  var c = await cfg();
  opts = opts || {};
  var headers = { 'x-agentmon-token': c.token };
  if (opts.body) headers['content-type'] = 'application/json';
  return fetch('http://127.0.0.1:' + c.port + path, { method: opts.method || 'GET', headers: headers, body: opts.body, signal: opts.signal, cache: 'no-store' });
}

async function loadMemory() {
  try {
    var m = await chrome.storage.session.get(['notified', 'lastStatus']);
    notified = m.notified || {};
    lastStatus = m.lastStatus || {};
  } catch (_) {}
}

async function publish(state) {
  lastState = state;
  await chrome.storage.local.set({ agentmon: state });
  updateBadge(state);
  await updateNotifications(state);
}

function waitingCount(state) {
  if (!state.online) return 0;
  return (state.sessions || []).filter(function (s) { return s.pending || s.status === 'your_turn' || s.status === 'done'; }).length;
}

function updateBadge(state) {
  var n = waitingCount(state);
  var anyPerm = state.online && (state.sessions || []).some(function (s) { return s.pending; });
  chrome.action.setBadgeText({ text: state.online ? (n ? String(n) : '') : '!' });
  chrome.action.setBadgeBackgroundColor({ color: !state.online ? '#9AA0AE' : anyPerm ? '#F59E0B' : '#22A861' });
  chrome.action.setTitle({ title: !state.online ? 'AgentMon: daemon not running' : n ? 'AgentMon: ' + n + ' waiting on you' : 'AgentMon' });
}

function iconFor(s) {
  return chrome.runtime.getURL('img/' + s.family + '-' + (s.stage || 1) + '.png');
}

async function updateNotifications(state) {
  var live = {};
  var settings = state.settings || {};
  if (state.online) {
    for (var i = 0; i < (state.sessions || []).length; i++) {
      var s = state.sessions[i];
      if (s.pending) {
        var id = 'perm|' + s.id + '|' + s.pending.id;
        live[id] = true;
        if (!notified[id]) {
          notified[id] = true;
          chrome.notifications.create(id, {
            type: 'basic', iconUrl: iconFor(s), priority: 2, requireInteraction: true,
            title: s.petName + ' needs your approval',
            message: (s.pending.title || 'Wants to use a tool') + (s.pending.code ? '\n' + s.pending.code.slice(0, 140) : ''),
            contextMessage: s.project + ' · ' + (s.agent || 'Claude Code'),
            buttons: [{ title: 'Allow' }, { title: 'Deny' }]
          });
        }
      }
      if (settings.notifyDone && s.status === 'done' && lastStatus[s.id] && lastStatus[s.id] !== 'done') {
        chrome.notifications.create('done|' + s.id + '|' + Date.now(), {
          type: 'basic', iconUrl: iconFor(s), priority: 0,
          title: s.petName + ' finished',
          message: (s.lastMessage || 'Your turn.').slice(0, 180),
          contextMessage: s.project + ' · ' + (s.agent || 'Claude Code')
        });
      }
      lastStatus[s.id] = s.status;
    }
  }
  Object.keys(notified).forEach(function (id) {
    if (!live[id]) { chrome.notifications.clear(id); delete notified[id]; }
  });
  try { await chrome.storage.session.set({ notified: notified, lastStatus: lastStatus }); } catch (_) {}
}

async function loop() {
  if (looping) return;
  looping = true;
  await loadMemory();
  var failures = 0;
  while (true) {
    try {
      var ctrl = new AbortController();
      var t = setTimeout(function () { ctrl.abort(); }, 27000);
      var r = await api('/state?since=' + version + '&wait=20&boot=' + bootId, { signal: ctrl.signal });
      clearTimeout(t);
      if (r.status === 401) throw new Error('Token mismatch. Run `agentmon init` again and reload the extension.');
      if (!r.ok) throw new Error('Daemon answered ' + r.status);
      var s = await r.json();
      failures = 0;
      version = s.version;
      bootId = s.bootId;
      s.online = true;
      await publish(s);
    } catch (e) {
      failures++;
      if (lastState.online !== false || failures === 1) {
        await publish({ online: false, sessions: [], error: String((e && e.message) || e) });
      }
      version = 0;
      await sleep(Math.min(10000, 1000 * failures));
    }
    chrome.runtime.getPlatformInfo(function () {}); // an extension API call keeps the worker alive between polls
  }
}

async function decide(sessionId, requestId, decision) {
  var r = await api('/decide', { method: 'POST', body: JSON.stringify({ sessionId: sessionId, requestId: requestId, decision: decision }) });
  return r.ok ? { ok: true } : { ok: false, error: (await r.json().catch(function () { return {}; })).error || ('HTTP ' + r.status) };
}

chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
  // Only our own pages and content scripts can reach this listener (no externally_connectable).
  if (sender.id !== chrome.runtime.id) return false;
  (async function () {
    loop();
    switch (msg && msg.type) {
      case 'hello': return { ok: true, state: lastState };
      case 'decide': return decide(msg.sessionId, msg.requestId, msg.decision);
      case 'pet': {
        var r = await api('/pet', { method: 'POST', body: JSON.stringify({ sessionId: msg.sessionId, action: msg.action, name: msg.name }) });
        return { ok: r.ok };
      }
      case 'settings': {
        var r2 = await api('/settings', { method: 'POST', body: JSON.stringify(msg.settings || {}) });
        return { ok: r2.ok };
      }
      case 'retry': version = 0; return { ok: true };
      default: return { ok: false, error: 'unknown message' };
    }
  })().then(sendResponse, function (e) { sendResponse({ ok: false, error: String((e && e.message) || e) }); });
  return true;
});

chrome.notifications.onButtonClicked.addListener(function (id, index) {
  var parts = id.split('|');
  if (parts[0] !== 'perm') return;
  decide(parts[1], parts[2], index === 0 ? 'allow' : 'deny').finally(function () { chrome.notifications.clear(id); });
});
chrome.notifications.onClicked.addListener(function (id) { if (id.indexOf('done|') === 0) chrome.notifications.clear(id); });

chrome.alarms.create('agentmon-keepalive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener(function () { loop(); });
chrome.runtime.onStartup.addListener(function () { loop(); });
chrome.runtime.onInstalled.addListener(function () { loop(); });
loop();
