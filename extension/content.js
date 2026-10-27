/* AgentMon content script: mounts the pets on the page and relays clicks to the background worker. */
(function () {
  'use strict';
  if (window.top !== window || window.__agentmonMounted) return;
  window.__agentmonMounted = true;

  var ui = null;
  var dead = false;

  function alive() {
    try { return !!(chrome.runtime && chrome.runtime.id); } catch (_) { return false; }
  }
  function teardown() {
    if (dead) return;
    dead = true;
    if (ui) ui.destroy();
  }
  function send(msg) {
    if (!alive()) return teardown();
    try {
      chrome.runtime.sendMessage(msg, function () { void chrome.runtime.lastError; });
    } catch (_) { teardown(); }
  }

  function start() {
    if (!document.documentElement) return;
    ui = window.AgentMonUI.create({ onAction: send });
    chrome.storage.local.get('agentmon', function (r) { if (!dead && r && r.agentmon) ui.update(r.agentmon); });
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (!alive()) return teardown();
      if (area === 'local' && changes.agentmon && !dead) ui.update(changes.agentmon.newValue);
    });
    send({ type: 'hello' }); // wakes the worker so it starts polling
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
