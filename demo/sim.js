/*
 * AgentMon demo simulator — fakes a few Claude Code sessions so the pets can be
 * tried without the daemon. Feeds the same state shape the daemon serves.
 */
(function (root) {
  'use strict';
  var C = root.AgentMonCreatures;

  var WORK = {
    checkout: { prompt: 'Fix the rounding bug in the cart total', reply: 'Fixed. Totals now round once, after tax, so 3 x $19.99 shows $59.97. Added a test for it.',
      tools: [['Read', 'src/cart/Summary.tsx'], ['Grep', 'roundPrice'], ['Edit', 'src/cart/Summary.tsx'], ['Bash', 'npm test -- cart']] },
    api: { prompt: 'Add rate limiting to the login route', reply: 'Done. Login now allows 5 attempts per minute per IP and answers 429 after that. Tests pass.',
      tools: [['Read', 'src/routes/auth.ts'], ['Edit', 'src/routes/auth.ts'], ['Write', 'src/middleware/rateLimit.ts'], ['Bash', 'npm test']] },
    landing: { prompt: 'Make the hero section responsive', reply: 'The hero now stacks under 640px, the headline uses clamp() and the CTA stays above the fold on phones.',
      tools: [['Read', 'app/page.tsx'], ['Edit', 'app/globals.css'], ['Edit', 'app/page.tsx']] },
    'mobile-app': { prompt: 'Add pull-to-refresh on the feed', reply: 'Pull-to-refresh is wired to the feed query and shows the spinner only while the request is in flight.',
      tools: [['Read', 'lib/feed/feed_screen.dart'], ['Edit', 'lib/feed/feed_screen.dart'], ['Bash', 'flutter test']] },
    docs: { prompt: 'Document the new webhook events', reply: 'Added a Webhooks page with the 4 event types, payload examples and retry rules.',
      tools: [['Read', 'docs/api.md'], ['Write', 'docs/webhooks.md']] },
    infra: { prompt: 'Bump the Node version in CI', reply: 'CI now runs on Node 22. Cache keys were updated so the first run will be a little slower.',
      tools: [['Read', '.github/workflows/ci.yml'], ['Edit', '.github/workflows/ci.yml']] }
  };
  var PROJECTS = Object.keys(WORK);
  var FAMS = ['ember', 'tide', 'sprout', 'volt', 'stone', 'shade'];
  var NAMES = ['Mochi', 'Pip', 'Nova', 'Biscuit', 'Juno', 'Tofu', 'Ziggy', 'Olive'];
  var VERB = { Read: 'Reading', Edit: 'Editing', Write: 'Writing', Grep: 'Searching code', Bash: 'Running' };

  function start(opts) {
    var ui = opts.ui, log = opts.onLog || function () {};
    var state = { app: 'agentmon', online: true, version: 1, now: Date.now(), settings: { mode: 'roam', showPets: true, notifyDone: false }, dex: {}, sessions: [] };
    var seq = 0;

    function push() {
      state.version++;
      state.now = Date.now();
      ui.update(JSON.parse(JSON.stringify(state)));
      if (opts.onChange) opts.onChange(state);
    }
    function find(id) { for (var i = 0; i < state.sessions.length; i++) if (state.sessions[i].id === id) return state.sessions[i]; return null; }
    function label(tool) { var v = VERB[tool[0]] || 'Using'; return tool[0] === 'Grep' ? v : v + ' ' + tool[1].split('/').pop(); }

    function add(project, family, name, xp, hp) {
      var s = {
        id: 'demo-' + (++seq), agent: 'Claude Code', family: family, petName: name, xp: xp || 0, stage: C.stageForXp(xp || 0), evolvedAt: 0,
        status: 'thinking', statusText: 'Thinking', project: project, cwd: '~/code/' + project,
        lastPrompt: WORK[project].prompt, lastMessage: '', hp: hp == null ? 0.9 : hp, pending: null, hidden: false, demo: true,
        startedAt: Date.now() + seq, updatedAt: Date.now(), step: 0, wait: 0
      };
      state.sessions.push(s);
      state.dex[family] = Math.max(state.dex[family] || 0, s.stage);
      return s;
    }
    function xp(s, amount) {
      s.xp += amount;
      var st = C.stageForXp(s.xp);
      if (st > s.stage) {
        var from = C.stageName(s.family, s.stage);
        s.stage = st; s.evolvedAt = Date.now();
        state.dex[s.family] = Math.max(state.dex[s.family] || 0, st);
        log(s.petName + ' evolved from ' + from + ' into ' + C.stageName(s.family, st) + '.');
      }
    }

    // one simulation step every ~1.6s
    function step() {
      var t = Date.now();
      state.sessions.forEach(function (s) {
        if (s.pending || t < s.wait) return;
        var w = WORK[s.project];
        if (s.status === 'done' || s.status === 'your_turn') {
          s.hidden = false;
          s.status = 'thinking'; s.statusText = 'Thinking'; s.lastPrompt = w.prompt; s.step = 0;
          s.wait = t + 1500; s.updatedAt = t;
          return;
        }
        if (s.status === 'working') { s.status = 'thinking'; s.statusText = 'Thinking'; s.wait = t + 900 + Math.random() * 900; s.updatedAt = t; return; }
        if (s.step < w.tools.length) {
          var tool = w.tools[s.step++];
          s.status = 'working'; s.statusText = label(tool); xp(s, 1);
          s.hp = Math.max(0.05, s.hp - 0.03);
          s.wait = t + 1600 + Math.random() * 1400; s.updatedAt = t;
        } else {
          finish(s);
        }
      });
      push();
    }

    function finish(s) {
      var w = WORK[s.project];
      s.pending = null;
      s.status = 'done'; s.statusText = 'Done'; s.lastMessage = w.reply; xp(s, 3);
      s.wait = Date.now() + 14000 + Math.random() * 8000; s.updatedAt = Date.now();
      log(s.petName + ' finished in ' + s.project + '.');
    }

    function onAction(msg) {
      var s = find(msg.sessionId);
      if (!s) return;
      if (msg.type === 'decide' && s.pending && s.pending.id === msg.requestId) {
        var what = s.pending.code;
        s.pending = null;
        if (msg.decision === 'deny') { s.status = 'thinking'; s.statusText = 'Denied'; log('You denied ' + s.petName + ': ' + what); }
        else { s.status = 'working'; s.statusText = 'Running ' + what; xp(s, 1); log('You ' + (msg.decision === 'always' ? 'always allowed' : 'allowed') + ' ' + s.petName + ': ' + what); }
        s.wait = Date.now() + 1800; s.updatedAt = Date.now();
      } else if (msg.type === 'pet' && msg.action === 'rename') {
        s.petName = String(msg.name).slice(0, 18); log('Renamed to ' + s.petName + '.');
      } else if (msg.type === 'pet' && msg.action === 'despawn') {
        s.hidden = true; log(s.petName + ' despawned. It returns on the next prompt.');
      }
      push();
    }

    var api = {
      state: state,
      onAction: onAction,
      askPermission: function () {
        var s = state.sessions.filter(function (x) { return !x.pending && !x.hidden; })[0];
        if (!s) return;
        var cmds = { checkout: 'npm run deploy', api: 'npx prisma migrate deploy', landing: 'vercel --prod', 'mobile-app': 'flutter build ipa', docs: 'git push origin docs', infra: 'terraform apply' };
        s.pending = { id: 'req' + Date.now(), toolName: 'Bash', title: 'Wants to run Bash', code: cmds[s.project] || 'npm run deploy', preview: '', note: '', canAlways: true, createdAt: Date.now() };
        s.status = 'permission'; s.statusText = 'Allow Bash?'; s.updatedAt = Date.now();
        log(s.petName + ' asked to run ' + s.pending.code + '. Tap it to answer.');
        push();
        return s;
      },
      finishTask: function () {
        var s = state.sessions.filter(function (x) { return !x.pending && (x.status === 'working' || x.status === 'thinking'); })[0];
        if (s) { finish(s); push(); }
      },
      feed: function () {
        var list = state.sessions.filter(function (x) { return x.stage < 3 && !x.hidden; });
        var s = list.sort(function (a, b) { return b.xp - a.xp; })[0];
        if (!s) { log('Every pet is fully evolved.'); return; }
        var need = C.nextStageXp(s.stage) - s.xp;
        xp(s, need);
        push();
      },
      newSession: function () {
        if (state.sessions.length >= 6) { log('The demo keeps at most 6 pets.'); return; }
        var used = state.sessions.map(function (x) { return x.project; });
        var project = PROJECTS.filter(function (p) { return used.indexOf(p) === -1; })[0];
        var fam = FAMS.filter(function (f) { return !state.sessions.some(function (x) { return x.family === f; }); })[0] || 'volt';
        var name = NAMES.filter(function (n) { return !state.sessions.some(function (x) { return x.petName === n; }); })[0] || 'Pixel';
        var s = add(project, fam, name, 0, 0.95);
        log('New session in ' + project + '. Say hi to ' + name + ' the ' + C.stageName(fam, 1) + '.');
        push();
        return s;
      },
      toggleMode: function () {
        state.settings.mode = state.settings.mode === 'roam' ? 'gather' : 'roam';
        push();
        return state.settings.mode;
      }
    };

    add('checkout', 'ember', 'Mochi', 4, 0.82);
    add('api', 'tide', 'Pip', 16, 0.55).status = 'working';
    var nova = add('landing', 'sprout', 'Nova', 33, 0.18);
    nova.status = 'done'; nova.statusText = 'Done'; nova.lastMessage = WORK.landing.reply; nova.wait = Date.now() + 9000;
    push();
    setInterval(step, 1600);
    if (opts.autoAsk !== false) setTimeout(api.askPermission, 4500);
    return api;
  }

  root.AgentMonSim = { start: start };
})(typeof self !== 'undefined' ? self : this);
