/* AgentMon toolbar popup. */
(function () {
  'use strict';
  var C = window.AgentMonCreatures;
  var $ = function (id) { return document.getElementById(id); };
  var state = null;
  var STATUS = { thinking: 'Thinking', working: 'Working', permission: 'Needs approval', your_turn: 'Your turn', done: 'Done', error: 'Error', idle: 'Idle', sleeping: 'Napping' };

  $('logo').innerHTML = C.render('volt', 1, { uid: 'logo' });

  function send(msg) {
    return new Promise(function (resolve) { chrome.runtime.sendMessage(msg, function (r) { void chrome.runtime.lastError; resolve(r); }); });
  }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  function render() {
    var on = !!(state && state.online);
    $('conn').textContent = on ? 'Connected' : state ? 'Not running' : 'Connecting…';
    $('conn').className = 'conn ' + (on ? 'on' : state ? 'off' : '');
    $('offline').hidden = on || !state;
    $('online').hidden = !on;
    $('err').textContent = state && state.error ? state.error : '';
    if (!on) return;

    var list = state.sessions || [];
    var ul = $('sessions');
    ul.textContent = '';
    $('count').textContent = list.length ? '· ' + list.length : '';
    $('empty').hidden = list.length > 0;
    list.forEach(function (s) {
      var li = el('li', 'sess');
      var art = el('div', 'art');
      art.innerHTML = C.render(s.family, s.stage, { uid: 'pp' + s.id.replace(/\W/g, '') });
      var main = el('div', 'main');
      var l1 = el('div', 'line1');
      l1.appendChild(el('b', null, s.petName));
      l1.appendChild(el('span', null, C.stageName(s.family, s.stage) + ' · ' + s.xp + ' XP' + (s.hidden ? ' · despawned' : '')));
      var l2 = el('div', 'line2');
      l2.appendChild(document.createTextNode(s.project + ' · '));
      l2.appendChild(el('span', 'st ' + s.status, s.pending ? (s.statusText || 'Needs approval') : (s.status === 'working' && s.statusText) || STATUS[s.status] || s.status));
      main.appendChild(l1); main.appendChild(l2);
      li.appendChild(art); li.appendChild(main);
      if (s.pending) {
        if (s.pending.code) main.appendChild(el('code', null, s.pending.code));
        var acts = el('div', 'acts');
        [['allow', 'Allow', 'btn'], ['deny', 'Deny', 'btn ghost']].forEach(function (a) {
          var b = el('button', a[2], a[1]);
          b.type = 'button';
          b.addEventListener('click', function () { b.disabled = true; send({ type: 'decide', sessionId: s.id, requestId: s.pending.id, decision: a[0] }); });
          acts.appendChild(b);
        });
        li.appendChild(acts);
      } else if (s.hidden) {
        var acts2 = el('div', 'acts');
        var show = el('button', 'btn ghost', 'Bring back');
        show.type = 'button';
        show.addEventListener('click', function () { send({ type: 'pet', action: 'show', sessionId: s.id }); });
        acts2.appendChild(show);
        li.appendChild(acts2);
      }
      ul.appendChild(li);
    });

    var st = state.settings || {};
    $('showPets').checked = st.showPets !== false;
    $('notifyDone').checked = !!st.notifyDone;
    $('modeRoam').setAttribute('aria-pressed', String(st.mode !== 'gather'));
    $('modeGather').setAttribute('aria-pressed', String(st.mode === 'gather'));

    var dex = state.dex || {}, grid = $('dex'), seen = 0;
    grid.textContent = '';
    C.FAMILIES.forEach(function (f) {
      for (var i = 1; i <= 3; i++) {
        var got = (dex[f.id] || 0) >= i;
        if (got) seen++;
        var cell = el('div', 'cell' + (got ? '' : ' locked'));
        cell.title = got ? f.stages[i - 1] + ' (' + f.type + ')' : '???';
        cell.innerHTML = C.render(f.id, i, { uid: 'dx' + f.id + i });
        grid.appendChild(cell);
      }
    });
    $('dexcount').textContent = '· ' + seen + ' / 18';
  }

  $('showPets').addEventListener('change', function (e) { send({ type: 'settings', settings: { showPets: e.target.checked } }); });
  $('notifyDone').addEventListener('change', function (e) { send({ type: 'settings', settings: { notifyDone: e.target.checked } }); });
  $('modeRoam').addEventListener('click', function () { send({ type: 'settings', settings: { mode: 'roam' } }); });
  $('modeGather').addEventListener('click', function () { send({ type: 'settings', settings: { mode: 'gather' } }); });
  $('retry').addEventListener('click', function () { send({ type: 'retry' }); });

  chrome.storage.local.get('agentmon', function (r) { state = r.agentmon || null; render(); });
  chrome.storage.onChanged.addListener(function (ch, area) { if (area === 'local' && ch.agentmon) { state = ch.agentmon.newValue; render(); } });
  send({ type: 'hello' });
})();
