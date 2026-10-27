/*
 * AgentMon UI — the pets that walk along the bottom of the page, their status
 * capsules and the click-to-open card. Framework-free; renders inside a shadow
 * root so page CSS can't touch it. Used by content.js and by the demo page.
 *
 *   var ui = AgentMonUI.create({ onAction: function (msg) {...} });
 *   ui.update(state);   // state = what the daemon's /state returns, plus { online: true }
 */
(function (root) {
  'use strict';
  var C = root.AgentMonCreatures;
  var SIZES = [54, 66, 80];
  var ATTENTION = { permission: 1 };
  var SOFT = { your_turn: 1 };

  var CSS = [
    ':host{all:initial}',
    '*{box-sizing:border-box}',
    '.stage{position:absolute;left:0;bottom:0;width:100%;height:0;pointer-events:none;font:600 12px/1.3 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;color:#fff}',
    '.pet{position:absolute;left:0;bottom:6px;width:var(--size);height:var(--size);will-change:transform;pointer-events:none}',
    '.hit{all:unset;position:absolute;inset:6% 10% 0;cursor:pointer;pointer-events:auto;border-radius:45%}',
    '.hit:focus-visible{outline:2px solid #7c6cff;outline-offset:3px}',
    '.flip{position:absolute;inset:0}',
    '.left .flip{transform:scaleX(-1)}',
    '.sprite{position:absolute;inset:0;transform-origin:50% 92%}',
    '.sprite svg{width:100%;height:100%;display:block;overflow:visible;filter:drop-shadow(0 2px 1.5px rgba(0,0,0,.2))}',
    '.ground{position:absolute;left:20%;right:20%;bottom:-3px;height:6px;border-radius:50%;background:rgba(0,0,0,.2);filter:blur(1.5px)}',
    '.foot-l,.foot-r,.eyes,.arm-l,.arm-r,.flick,.zap,.orb,.bub,.twinkle{transform-box:fill-box;transform-origin:center}',
    '.flick{transform-origin:50% 100%;animation:flick 1.1s ease-in-out infinite alternate}',
    '.zap{animation:zap 1.6s steps(2,end) infinite}',
    '.twinkle{animation:twinkle 2.2s ease-in-out infinite}',
    '.bub{animation:bub 3s ease-in-out infinite}',
    '.orb{animation:orb 2.8s ease-in-out infinite}',
    '.blink{animation:blink 5s infinite;animation-delay:var(--blink,0s)}',
    '.walking .sprite{animation:bob .42s ease-in-out infinite alternate}',
    '.walking .foot-l{animation:step .42s ease-in-out infinite alternate}',
    '.walking .foot-r{animation:step .42s ease-in-out infinite alternate-reverse}',
    '.walking .arm-l,.walking .arm-r{animation:swing .42s ease-in-out infinite alternate}',
    '.floaty .sprite{animation:float 2.6s ease-in-out infinite}',
    '.attn .sprite{animation:hop .8s cubic-bezier(.3,0,.3,1) infinite}',
    '.soft .sprite{animation:hop2 2.6s ease-in-out infinite}',
    '.sleeping .sprite{animation:breathe 3.6s ease-in-out infinite}',
    '.evolving .sprite{animation:evo 1.8s ease-in-out}',
    '.fx{position:absolute;inset:-35%;border-radius:50%;pointer-events:none;opacity:0;background:radial-gradient(circle,rgba(255,255,255,.95) 0 18%,rgba(255,226,140,.65) 34%,rgba(255,255,255,0) 64%)}',
    '.evolving .fx{animation:burst 1.8s ease-out}',
    '.zz{position:absolute;right:-2px;top:-4px;font:800 11px/1 ui-sans-serif,system-ui,sans-serif;color:#6b6890;text-shadow:0 1px 0 #fff;animation:zz 2.6s ease-in-out infinite;pointer-events:none}',
    '.zz[hidden]{display:none}',
    '.cap{position:absolute;left:50%;bottom:calc(100% + 4px);transform:translateX(-50%);display:flex;align-items:center;gap:6px;white-space:nowrap;padding:4px 10px 4px 8px;border-radius:999px;background:rgba(20,19,28,.92);color:#fff;font-size:11.5px;font-weight:650;letter-spacing:.01em;box-shadow:0 4px 14px rgba(0,0,0,.22);pointer-events:auto;cursor:pointer;max-width:230px}',
    '.cap[hidden]{display:none}',
    '.cap .lbl{overflow:hidden;text-overflow:ellipsis}',
    '.cap .dot{width:7px;height:7px;border-radius:50%;background:#a9a6c2;flex:none}',
    '.cap.st-working .dot{background:#5ab0ff}',
    '.cap.st-permission{background:#FFB020;color:#2a1d00}',
    '.cap.st-permission .dot{background:#2a1d00;animation:pulse 1s infinite}',
    '.cap.st-your_turn .dot,.cap.st-done .dot{background:#38d17a}',
    '.cap.st-error .dot{background:#ff5a5a}',
    '.cap.st-evo{background:linear-gradient(90deg,#ff7ab6,#ffcf5a,#6ee7b7,#7cc4ff);color:#1b1530}',
    '.cap.st-evo .dot{background:#1b1530}',
    '.dots{display:inline-flex;gap:2px;margin-left:1px}',
    '.dots i{width:3px;height:3px;border-radius:50%;background:currentColor;animation:dot 1.2s infinite}',
    '.dots i:nth-child(2){animation-delay:.2s}.dots i:nth-child(3){animation-delay:.4s}',
    '.tag{position:absolute;left:50%;bottom:calc(100% + 6px);transform:translateX(-50%);font-size:11px;font-weight:700;color:#fff;background:rgba(20,19,28,.78);padding:2px 7px;border-radius:7px;opacity:0;transition:opacity .15s;white-space:nowrap;pointer-events:none}',
    '.hascap .tag{bottom:calc(100% + 32px)}',
    '.pet:hover .tag{opacity:1}',
    '.hp{position:absolute;left:24%;right:24%;bottom:-6px;height:3px;border-radius:2px;background:rgba(0,0,0,.18);overflow:hidden}',
    '.hp[hidden]{display:none}',
    '.hp i{display:block;height:100%;background:#ff5a5a}',
    // card
    '.card{position:fixed;width:330px;max-width:calc(100vw - 16px);pointer-events:auto;background:var(--bg);color:var(--fg);border-radius:16px;box-shadow:0 18px 50px rgba(16,12,40,.3),0 0 0 1px var(--line);font:400 13px/1.45 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;overflow:hidden;animation:pop .16s ease-out;--bg:#fff;--fg:#1c1a29;--muted:#6c6a80;--line:rgba(20,16,50,.1);--soft:#f4f3f9;--code:#f6f5fa;--primary:#5b4bd6;--primary-fg:#fff}',
    '@media (prefers-color-scheme:dark){.card{--bg:#1e1c28;--fg:#f2f1f7;--muted:#a6a3bb;--line:rgba(255,255,255,.1);--soft:#2a2837;--code:#16151e;--primary:#8f80ff;--primary-fg:#120f24}}',
    '.card[hidden]{display:none}',
    '.card header{display:flex;gap:11px;padding:14px 12px 10px 14px;align-items:flex-start}',
    '.avatar{width:54px;height:54px;flex:none;border-radius:14px;background:var(--tint);display:grid;place-items:center}',
    '.avatar svg{width:50px;height:50px}',
    '.who{flex:1;min-width:0}',
    '.name-row{display:flex;align-items:center;gap:4px}',
    '.name{font-size:15.5px;font-weight:750;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.rename-in{all:unset;font-size:15px;font-weight:700;border-bottom:2px solid var(--primary);width:150px}',
    '.species{font-size:12px;color:var(--muted);display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:1px}',
    '.type{font-size:10.5px;font-weight:700;padding:1px 7px;border-radius:999px}',
    '.meta{font-size:11.5px;color:var(--muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    '.icon{all:unset;cursor:pointer;color:var(--muted);width:26px;height:26px;display:grid;place-items:center;border-radius:8px;font-size:15px;flex:none}',
    '.icon:hover{background:var(--soft);color:var(--fg)}',
    '.icon:focus-visible,.btn:focus-visible,.link:focus-visible{outline:2px solid var(--primary);outline-offset:2px}',
    '.status{margin:0 14px;padding:7px 10px;border-radius:10px;background:var(--soft);font-weight:650;font-size:12.5px;display:flex;align-items:center;gap:7px}',
    '.status .dot{width:8px;height:8px;border-radius:50%;background:#a9a6c2;flex:none}',
    '.status.st-working .dot{background:#5ab0ff}.status.st-permission{background:rgba(255,176,32,.18)}.status.st-permission .dot{background:#FFB020}',
    '.status.st-your_turn .dot,.status.st-done .dot{background:#38d17a}.status.st-error .dot{background:#ff5a5a}',
    '.perm{margin:10px 14px 2px}',
    '.perm-title{font-weight:700;font-size:13px;margin-bottom:6px}',
    'pre{margin:0;background:var(--code);border:1px solid var(--line);border-radius:10px;padding:8px 10px;font:12px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;white-space:pre-wrap;word-break:break-word;max-height:140px;overflow:auto;color:var(--fg)}',
    'pre.preview{margin-top:6px;color:var(--muted);font-size:11.5px;max-height:110px}',
    '.note{font-size:11.5px;color:var(--muted);margin-top:5px}',
    '.actions{display:grid;grid-auto-flow:column;grid-auto-columns:1fr;gap:8px;margin-top:10px}',
    '.btn{all:unset;text-align:center;padding:9px 0;border-radius:10px;font-weight:700;font-size:13px;cursor:pointer;background:var(--soft);color:var(--fg)}',
    '.btn:hover{filter:brightness(.96)}',
    '.btn.always{background:transparent;box-shadow:inset 0 0 0 1px var(--line)}',
    '.btn.allow{background:var(--primary);color:var(--primary-fg)}',
    '.btn[disabled]{opacity:.5;pointer-events:none}',
    '.label{font-size:10.5px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);font-weight:700;margin:11px 14px 4px}',
    '.prompt{margin:0 14px;color:var(--fg);font-size:12.5px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}',
    '.reply{margin:0 14px;background:var(--soft);border-radius:10px;padding:8px 10px;font-size:12.5px;max-height:150px;overflow:auto;white-space:pre-wrap;word-break:break-word}',
    '.stats{padding:12px 14px 2px;display:grid;gap:7px}',
    '.stat{display:grid;grid-template-columns:26px 1fr auto;gap:8px;align-items:center;font-size:11.5px;color:var(--muted);font-weight:700}',
    '.bar{height:7px;border-radius:4px;background:var(--soft);overflow:hidden}',
    '.bar i{display:block;height:100%;border-radius:4px;background:var(--barc,#7c6cff);transition:width .4s}',
    '.num{font-variant-numeric:tabular-nums;font-weight:600}',
    '.evo{font-size:11.5px;color:var(--muted);margin-top:-2px}',
    '.card footer{display:flex;justify-content:space-between;align-items:center;padding:10px 14px 12px;gap:8px}',
    '.link{all:unset;cursor:pointer;color:var(--muted);font-size:12px;font-weight:650;border-radius:6px}',
    '.link:hover{color:var(--fg)}',
    '.hint{font-size:11px;color:var(--muted)}',
    '@keyframes bob{from{transform:translateY(0) rotate(-2deg)}to{transform:translateY(-2.5px) rotate(2deg)}}',
    '@keyframes step{from{transform:translateY(0)}to{transform:translateY(-2.2px)}}',
    '@keyframes swing{from{transform:rotate(-8deg)}to{transform:rotate(8deg)}}',
    '@keyframes blink{0%,93%,100%{transform:scaleY(1)}95%{transform:scaleY(.1)}}',
    '@keyframes flick{from{transform:scale(1,1)}to{transform:scale(1.07,.93)}}',
    '@keyframes zap{0%{opacity:1}50%{opacity:.75}}',
    '@keyframes twinkle{0%,100%{transform:scale(.6);opacity:.4}50%{transform:scale(1.15);opacity:1}}',
    '@keyframes bub{0%,100%{transform:translateY(0)}50%{transform:translateY(-3px)}}',
    '@keyframes orb{0%,100%{transform:translateY(0)}50%{transform:translateY(-4px)}}',
    '@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}',
    '@keyframes hop{0%,100%{transform:translateY(0) scale(1,1)}15%{transform:translateY(0) scale(1.08,.9)}45%{transform:translateY(-15px) scale(.95,1.06)}70%{transform:translateY(0) scale(1.05,.95)}}',
    '@keyframes hop2{0%,72%,100%{transform:translateY(0)}82%{transform:translateY(-8px)}91%{transform:translateY(0)}}',
    '@keyframes breathe{0%,100%{transform:scale(1,1)}50%{transform:scale(1.03,.97)}}',
    '@keyframes evo{0%{filter:none;transform:scale(1)}20%{filter:brightness(2.6) saturate(0);transform:scale(1.14)}38%{transform:scale(.9)}50%{filter:brightness(3.2) saturate(0);transform:scale(1.18)}72%{filter:brightness(2) saturate(.3)}100%{filter:none;transform:scale(1)}}',
    '@keyframes burst{0%{opacity:0;transform:scale(.4)}45%{opacity:1;transform:scale(1)}100%{opacity:0;transform:scale(1.7)}}',
    '@keyframes zz{0%,100%{transform:translate(0,0);opacity:.4}50%{transform:translate(3px,-5px);opacity:1}}',
    '@keyframes dot{0%,80%,100%{opacity:.25}40%{opacity:1}}',
    '@keyframes pulse{50%{transform:scale(1.5);opacity:.6}}',
    '@keyframes pop{from{transform:translateY(6px) scale(.98);opacity:0}to{transform:none;opacity:1}}',
    '@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}'
  ].join('\n');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function hash(str) { var h = 0; str = String(str); for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return Math.abs(h); }
  function ago(ms) {
    var s = Math.max(0, Math.round(ms / 1000));
    if (s < 45) return 'now';
    var m = Math.round(s / 60); if (m < 60) return m + 'm';
    var h = Math.round(m / 60); if (h < 24) return h + 'h';
    return Math.round(h / 24) + 'd';
  }
  function moodFor(s) {
    switch (s.status) {
      case 'permission': case 'error': return 'alert';
      case 'done': case 'your_turn': return 'happy';
      case 'sleeping': return 'sleep';
      case 'thinking': return 'think';
      default: return 'normal';
    }
  }
  function capText(s) {
    switch (s.status) {
      case 'thinking': return { text: 'Thinking', dots: true };
      case 'working': return { text: s.statusText || 'Working', dots: false };
      case 'permission': return { text: s.statusText || 'Needs approval' };
      case 'your_turn': return { text: s.statusText || 'Your turn' };
      case 'done': return { text: 'Done' };
      case 'error': return { text: s.statusText || 'Error' };
      default: return null; // idle & sleeping: no capsule
    }
  }

  function create(opts) {
    opts = opts || {};
    var onAction = opts.onAction || function () {};
    var mountPoint = opts.mount || document.documentElement;
    var reduced = !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);

    var host = document.createElement('agentmon-root');
    host.style.cssText = 'all:initial;position:fixed;left:0;right:0;bottom:' + (opts.bottom || '0') + ';height:0;z-index:2147483646;pointer-events:none;display:block;';
    var shadow = host.attachShadow({ mode: opts.shadowMode || 'closed' });
    shadow.innerHTML = '<style>' + CSS + '</style><div class="stage"></div><div class="card" hidden role="dialog" aria-label="AgentMon pet"></div>';
    var stageEl = shadow.querySelector('.stage');
    var card = shadow.querySelector('.card');
    mountPoint.appendChild(host);

    var pets = {};           // sessionId -> pet
    var data = null;         // last state
    var skew = 0;            // server clock - local clock
    var openSid = null;
    var renaming = false;
    var busy = {};           // requestId -> true while a decision is in flight
    var raf = 0, last = 0, destroyed = false;

    function now() { return Date.now() + skew; }
    function viewW() { return Math.max(200, document.documentElement.clientWidth || root.innerWidth || 800); }

    function makePet(s) {
      var el = document.createElement('div');
      el.className = 'pet';
      el.innerHTML = '<div class="cap" hidden><span class="dot"></span><span class="lbl"></span></div>' +
        '<div class="tag"></div><div class="flip"><div class="ground"></div><div class="sprite"></div><div class="fx"></div></div>' +
        '<span class="zz" hidden>z</span><div class="hp" hidden><i></i></div><button class="hit" type="button"></button>';
      stageEl.appendChild(el);
      var w = viewW();
      var size = SIZES[(s.stage || 1) - 1];
      var p = {
        sid: s.id, el: el, s: s,
        cap: el.querySelector('.cap'), lbl: el.querySelector('.lbl'), tag: el.querySelector('.tag'),
        sprite: el.querySelector('.sprite'), zz: el.querySelector('.zz'), hp: el.querySelector('.hp'),
        x: 20 + (hash(s.id) % Math.max(1, w - size - 40)), dir: hash(s.id + 'd') % 2 ? 1 : -1,
        speed: 26 + (hash(s.id + 's') % 14), mode: 'idle', until: 0, stage: s.stage || 1, key: '',
        evolving: false, frozen: false
      };
      p.sprite.style.setProperty('--blink', (hash(s.id) % 40) / 10 + 's');
      el.querySelector('.hit').addEventListener('click', function () { toggleCard(p.sid); });
      p.cap.addEventListener('click', function () { toggleCard(p.sid); });
      return p;
    }

    function renderSprite(p, mood) {
      var key = p.s.family + ':' + p.stage + ':' + mood;
      if (key === p.key) return;
      p.key = key;
      p.sprite.innerHTML = C.render(p.s.family, p.stage, { mood: mood, uid: 'p' + hash(p.sid) + p.stage + mood.charAt(0) });
      var size = SIZES[p.stage - 1];
      p.el.style.setProperty('--size', size + 'px');
    }

    function setCap(p, info, cls) {
      if (!info) { p.cap.hidden = true; p.el.classList.remove('hascap'); return; }
      p.capW = 0;
      p.cap.hidden = false;
      p.el.classList.add('hascap');
      p.cap.className = 'cap ' + cls;
      p.lbl.textContent = info.text;
      var dots = p.cap.querySelector('.dots');
      if (info.dots && !dots) { dots = document.createElement('span'); dots.className = 'dots'; dots.innerHTML = '<i></i><i></i><i></i>'; p.cap.appendChild(dots); }
      if (!info.dots && dots) dots.remove();
    }

    function apply(p, s) {
      p.s = s;
      var fam = C.family(s.family);
      var target = s.stage || 1;
      if (!p.evolving && target > p.stage) {
        if (now() - (s.evolvedAt || 0) < 20000 && !reduced) return evolve(p, s);
        p.stage = target;
      } else if (!p.evolving && target < p.stage) {
        p.stage = target;
      }
      if (p.evolving) return;
      var mood = moodFor(s);
      renderSprite(p, mood);
      var cls = p.el.classList;
      cls.toggle('attn', !!ATTENTION[s.status]);
      cls.toggle('soft', !!SOFT[s.status]);
      cls.toggle('sleeping', s.status === 'sleeping');
      cls.toggle('floaty', fam.shape === 'ghost' && !ATTENTION[s.status] && !SOFT[s.status]);
      p.zz.hidden = s.status !== 'sleeping';
      setCap(p, capText(s), 'st-' + s.status);
      p.tag.textContent = s.petName + ' · ' + s.project;
      var hp = typeof s.hp === 'number' ? s.hp : null;
      p.hp.hidden = !(hp != null && hp < 0.25);
      if (hp != null) p.hp.firstChild.style.width = Math.round(hp * 100) + '%';
      var hit = p.el.querySelector('.hit');
      hit.setAttribute('aria-label', s.petName + ' the ' + C.stageName(s.family, p.stage) + ', ' + s.project + ': ' + ((capText(s) || {}).text || 'idle'));
    }

    function evolve(p, s) {
      p.evolving = true;
      var from = C.stageName(s.family, p.stage);
      setCap(p, { text: s.petName + ' is evolving!' }, 'st-evo');
      p.el.classList.remove('attn', 'soft', 'walking', 'sleeping');
      p.el.classList.add('evolving');
      setTimeout(function () {
        p.stage = s.stage;
        p.key = '';
        renderSprite(p, 'happy');
      }, 880);
      setTimeout(function () {
        p.el.classList.remove('evolving');
        setCap(p, { text: from + ' → ' + C.stageName(s.family, s.stage) + '!' }, 'st-evo');
      }, 1800);
      setTimeout(function () {
        p.evolving = false;
        p.key = '';
        apply(p, p.s);
        if (openSid === p.sid) renderCard(true);
      }, 4600);
    }

    // ---------------- movement ----------------
    function tick(t) {
      raf = 0;
      if (destroyed) return;
      if (!host.isConnected) mountPoint.appendChild(host);
      var dt = Math.min(0.05, last ? (t - last) / 1000 : 0.016);
      last = t;
      var w = viewW();
      var gather = data && data.settings && data.settings.mode === 'gather';
      var list = Object.keys(pets).map(function (k) { return pets[k]; }).sort(function (a, b) { return (a.s.startedAt || 0) - (b.s.startedAt || 0); });
      var gx = w - 16;
      var T = now();
      for (var i = 0; i < list.length; i++) {
        var p = list[i];
        var size = SIZES[p.stage - 1];
        var maxX = Math.max(8, w - size - 8);
        var walking = false;
        var still = p.frozen || p.evolving || ATTENTION[p.s.status] || p.s.status === 'sleeping';
        if (gather) {
          gx -= size + 4;
          var tx = Math.max(8, gx);
          if (!still && Math.abs(tx - p.x) > 2) {
            p.dir = tx > p.x ? 1 : -1;
            p.x += p.dir * Math.min(Math.abs(tx - p.x), 150 * dt);
            walking = true;
          } else if (!still) { p.dir = -1; }
        } else if (!still && !reduced) {
          if (T > p.until) {
            var r = (hash(p.sid + Math.floor(T / 1000)) % 100);
            if (SOFT[p.s.status] || r < 42) { p.mode = 'idle'; p.until = T + 2000 + r * 40; }
            else { p.mode = 'walk'; p.until = T + 3000 + r * 50; if (r % 3 === 0) p.dir = -p.dir; }
          }
          if (p.mode === 'walk') {
            p.x += p.dir * p.speed * dt;
            if (p.x < 8) { p.x = 8; p.dir = 1; }
            if (p.x > maxX) { p.x = maxX; p.dir = -1; }
            walking = true;
          }
        }
        if (p.x > maxX) p.x = maxX;
        p.walk = walking;
      }
      // keep roaming pets from standing on top of each other
      if (!gather) {
        var byX = list.slice().sort(function (a, b) { return a.x - b.x; });
        for (var j = 1; j < byX.length; j++) {
          var a = byX[j - 1], b = byX[j];
          var gap = (SIZES[a.stage - 1] + SIZES[b.stage - 1]) * 0.42;
          if (b.x - a.x < gap) {
            var push = Math.min(gap - (b.x - a.x), 60 * dt) / 2;
            if (!a.frozen && !a.evolving && !ATTENTION[a.s.status]) { a.x = Math.max(8, a.x - push); if (a.walk) a.dir = -1; }
            if (!b.frozen && !b.evolving && !ATTENTION[b.s.status]) { b.x = Math.min(w - SIZES[b.stage - 1] - 8, b.x + push); if (b.walk) b.dir = 1; }
          }
        }
      }
      // place capsules: clamp to the viewport and stack them when they would overlap
      var caps = list.filter(function (p) { return !p.cap.hidden; }).sort(function (a, b) { return a.x - b.x; });
      var placed = [];
      caps.forEach(function (p) {
        if (!p.capW) p.capW = p.cap.offsetWidth || 80;
        var size = SIZES[p.stage - 1], cw = p.capW;
        var center = p.x + size / 2, left = center - cw / 2, shift = 0;
        if (left < 6) shift = 6 - left;
        if (left + cw + shift > w - 6) shift = (w - 6) - (left + cw);
        left += shift;
        var lvl = 0, y;
        for (; lvl < 4; lvl++) {
          y = size + lvl * 27;
          var clash = placed.some(function (q) { return left < q.r + 4 && left + cw > q.l - 4 && Math.abs(y - q.y) < 26; });
          if (!clash) break;
        }
        if (lvl > 3) { lvl = 3; y = size + 3 * 27; }
        placed.push({ l: left, r: left + cw, y: y });
        p.cap.style.transform = 'translate(calc(-50% + ' + Math.round(shift) + 'px), ' + (-lvl * 27) + 'px)';
      });
      list.forEach(function (p) {
        p.el.classList.toggle('walking', !!p.walk && !p.el.classList.contains('floaty'));
        p.el.classList.toggle('left', p.dir < 0);
        p.el.style.transform = 'translate3d(' + Math.round(p.x) + 'px,0,0)';
      });
      if (openSid && pets[openSid]) placeCard();
      schedule();
    }
    function schedule() {
      if (!raf && !destroyed && !document.hidden && Object.keys(pets).length) raf = requestAnimationFrame(tick);
    }
    document.addEventListener('visibilitychange', function () { last = 0; schedule(); });

    // ---------------- card ----------------
    function toggleCard(sid) {
      if (openSid === sid) return closeCard();
      if (openSid && pets[openSid]) pets[openSid].frozen = false;
      openSid = sid;
      renaming = false;
      if (pets[sid]) pets[sid].frozen = true;
      renderCard(true);
      card.hidden = false;
      placeCard();
      var first = card.querySelector('.btn.allow') || card.querySelector('.close');
      if (first) try { first.focus({ preventScroll: true }); } catch (_) {}
    }
    function closeCard() {
      if (openSid && pets[openSid]) pets[openSid].frozen = false;
      openSid = null;
      renaming = false;
      card.hidden = true;
      card.innerHTML = '';
    }
    function placeCard() {
      var p = pets[openSid];
      if (!p) return;
      var w = viewW();
      var cw = Math.min(330, w - 16);
      var size = SIZES[p.stage - 1];
      var left = Math.max(8, Math.min(w - cw - 8, p.x + size / 2 - cw / 2));
      card.style.left = left + 'px';
      card.style.bottom = 'calc(' + (size + 44) + 'px + ' + (opts.bottom || '0px') + ')';
      card.style.maxHeight = 'calc(100vh - ' + (size + 60) + 'px)';
      card.style.overflowY = 'auto';
    }

    var cardKey = '';
    function renderCard(force) {
      var p = pets[openSid];
      if (!p) return closeCard();
      if (renaming) return;
      var s = p.s, fam = C.family(s.family), tc = C.TYPE_COLORS[fam.type];
      var key = JSON.stringify([s.id, s.status, s.statusText, s.pending && s.pending.id, s.pending && busy[s.pending.id], s.xp, s.hp, s.lastPrompt,
        s.lastMessage, s.petName, p.stage, p.evolving, Math.floor((now() - (s.updatedAt || 0)) / 60000)]);
      if (!force && key === cardKey && card.firstChild) return;
      cardKey = key;
      var stage = p.stage, species = C.stageName(s.family, stage), next = C.nextStageXp(stage);
      var stInfo = capText(s) || { text: s.status === 'sleeping' ? 'Napping' : 'Idle' };
      var h = '';
      h += '<header><div class="avatar" style="--tint:' + fam.colors.light + '55">' + C.render(s.family, stage, { mood: moodFor(s), uid: 'c' + hash(s.id) }) + '</div>';
      h += '<div class="who"><div class="name-row"><span class="name">' + esc(s.petName) + '</span>' +
        '<button class="icon rename" type="button" title="Rename" aria-label="Rename pet">✎</button></div>';
      h += '<div class="species">' + esc(species) + ' <span class="type" style="background:' + tc.bg + ';color:' + tc.fg + '">' + esc(fam.type) + '</span> Stage ' + stage + '</div>';
      h += '<div class="meta">' + esc(s.project) + ' · ' + esc(s.agent || 'Claude Code') + ' · ' + ago(now() - (s.updatedAt || now())) + '</div></div>';
      h += '<button class="icon close" type="button" aria-label="Close">✕</button></header>';
      h += '<div class="status st-' + esc(s.status) + '"><span class="dot"></span>' + esc(stInfo.text) + '</div>';
      if (s.pending) {
        var pd = s.pending, dis = busy[pd.id] ? ' disabled' : '';
        h += '<div class="perm"><div class="perm-title">' + esc(pd.title) + '</div>';
        if (pd.code) h += '<pre class="code">' + esc(pd.code) + '</pre>';
        if (pd.preview) h += '<pre class="preview">' + esc(pd.preview) + '</pre>';
        if (pd.note) h += '<div class="note">' + esc(pd.note) + '</div>';
        h += '<div class="actions"><button class="btn deny" type="button" data-d="deny"' + dis + '>Deny</button>' +
          (pd.canAlways ? '<button class="btn always" type="button" data-d="always"' + dis + '>Always</button>' : '') +
          '<button class="btn allow" type="button" data-d="allow"' + dis + '>Allow</button></div></div>';
      } else {
        if (s.lastPrompt) h += '<div class="label">You asked</div><div class="prompt">' + esc(s.lastPrompt) + '</div>';
        if (s.lastMessage) h += '<div class="label">Latest reply</div><div class="reply">' + esc(s.lastMessage) + '</div>';
      }
      h += '<div class="stats">';
      var prev = C.XP_STAGES[stage - 1], pct = next ? Math.min(100, Math.round((s.xp - prev) / (next - prev) * 100)) : 100;
      h += '<div class="stat"><span>XP</span><div class="bar" style="--barc:' + tc.bg + '"><i style="width:' + pct + '%"></i></div><span class="num">' + s.xp + (next ? ' / ' + next : '') + '</span></div>';
      h += '<div class="evo">' + (next ? 'Evolves into ' + esc(C.stageName(s.family, stage + 1)) + ' at ' + next + ' XP' : 'Fully evolved ✨') + '</div>';
      if (typeof s.hp === 'number') {
        var hpPct = Math.round(s.hp * 100), hpc = s.hp > 0.5 ? '#38c172' : s.hp > 0.25 ? '#f0a020' : '#ef4444';
        h += '<div class="stat" title="Context window left (approx.)"><span>HP</span><div class="bar" style="--barc:' + hpc + '"><i style="width:' + hpPct + '%"></i></div><span class="num">' + hpPct + '%</span></div>';
      }
      h += '</div><footer><button class="link despawn" type="button">Despawn</button><span class="hint">Returns on your next prompt</span></footer>';
      card.innerHTML = h;

      card.querySelector('.close').addEventListener('click', closeCard);
      card.querySelector('.rename').addEventListener('click', startRename);
      card.querySelector('.despawn').addEventListener('click', function (e) {
        if (!e.isTrusted) return;
        onAction({ type: 'pet', action: 'despawn', sessionId: s.id });
        closeCard();
      });
      var btns = card.querySelectorAll('.btn[data-d]');
      for (var i = 0; i < btns.length; i++) btns[i].addEventListener('click', onDecide);
    }

    function onDecide(e) {
      if (!e.isTrusted) return; // never let page scripts approve anything
      var p = pets[openSid];
      if (!p || !p.s.pending) return;
      var pd = p.s.pending;
      busy[pd.id] = true;
      var btns = card.querySelectorAll('.btn[data-d]');
      for (var i = 0; i < btns.length; i++) btns[i].disabled = true;
      onAction({ type: 'decide', sessionId: p.s.id, requestId: pd.id, decision: e.currentTarget.getAttribute('data-d') });
    }

    function startRename() {
      var p = pets[openSid];
      if (!p) return;
      renaming = true;
      var nameEl = card.querySelector('.name');
      var input = document.createElement('input');
      input.className = 'rename-in';
      input.value = p.s.petName;
      input.maxLength = 18;
      input.setAttribute('aria-label', 'New name');
      nameEl.replaceWith(input);
      input.focus();
      input.select();
      function finish(save) {
        if (!renaming) return;
        renaming = false;
        var v = input.value.trim();
        if (save && v && v !== p.s.petName) {
          p.s.petName = v;
          onAction({ type: 'pet', action: 'rename', sessionId: p.s.id, name: v });
        }
        renderCard(true);
      }
      input.addEventListener('keydown', function (e) {
        e.stopPropagation();
        if (e.key === 'Enter') finish(true);
        if (e.key === 'Escape') finish(false);
      });
      input.addEventListener('blur', function () { finish(true); });
    }

    function onKey(e) {
      if (e.key === 'Escape' && openSid && !renaming) closeCard();
    }
    function onDown(e) {
      if (!openSid) return;
      var path = e.composedPath ? e.composedPath() : [];
      if (path.indexOf(host) === -1) closeCard();
    }
    root.addEventListener('keydown', onKey, true);
    root.addEventListener('pointerdown', onDown, true);

    // ---------------- public ----------------
    function update(next) {
      data = next || null;
      if (data && data.now) skew = data.now - Date.now();
      var visible = !!(data && data.online !== false && (!data.settings || data.settings.showPets !== false));
      var list = visible ? (data.sessions || []).filter(function (s) { return !s.hidden; }) : [];
      var keep = {};
      var live = {};
      list.forEach(function (s) {
        keep[s.id] = 1;
        if (s.pending) live[s.pending.id] = 1;
        if (!pets[s.id]) pets[s.id] = makePet(s);
        apply(pets[s.id], s);
      });
      Object.keys(busy).forEach(function (k) { if (!live[k]) delete busy[k]; });
      Object.keys(pets).forEach(function (id) {
        if (!keep[id]) { pets[id].el.remove(); delete pets[id]; if (openSid === id) closeCard(); }
      });
      if (openSid && pets[openSid]) renderCard();
      schedule();
    }

    function destroy() {
      destroyed = true;
      if (raf) cancelAnimationFrame(raf);
      root.removeEventListener('keydown', onKey, true);
      root.removeEventListener('pointerdown', onDown, true);
      host.remove();
    }

    return { update: update, destroy: destroy, open: toggleCard, _pets: pets };
  }

  root.AgentMonUI = { create: create };
})(typeof self !== 'undefined' ? self : this);
