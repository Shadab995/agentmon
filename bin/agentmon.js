#!/usr/bin/env node
/*
 * AgentMon CLI
 *   agentmon init [--port 47333] [--autostart]   install hooks + helper + extension files
 *   agentmon start | stop | restart | status
 *   agentmon demo [--keep]                        spawn fake sessions to see the pets
 *   agentmon uninstall [--purge]                  remove our hooks (and ~/.agentmon with --purge)
 *   agentmon run                                  run the helper in the foreground (debugging)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { spawn, spawnSync } = require('child_process');

const major = Number(process.versions.node.split('.')[0]);
if (major < 18) { console.error('AgentMon needs Node.js 18 or later (you have ' + process.version + ').'); process.exit(1); }

const HOME = path.resolve(process.env.AGENTMON_HOME || path.join(os.homedir(), '.agentmon'));
const PKG = path.resolve(__dirname, '..');
const CLAUDE_SETTINGS = process.env.AGENTMON_CLAUDE_SETTINGS || path.join(os.homedir(), '.claude', 'settings.json');
const CONFIG = path.join(HOME, 'config.json');
const SERVER = path.join(HOME, 'daemon', 'server.js');
const HOOK = path.join(HOME, 'daemon', 'hook.js');
const LOG = path.join(HOME, 'daemon.log');
const LABEL = 'com.agentmon.daemon';
const PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', LABEL + '.plist');
const UNIT = path.join(os.homedir(), '.config', 'systemd', 'user', 'agentmon.service');
const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

// [event, matcher, async]. PermissionRequest must be synchronous: it waits for your answer.
const HOOK_EVENTS = [
  ['SessionStart', null, true],
  ['UserPromptSubmit', null, true],
  ['PreToolUse', '*', true],
  ['PostToolUse', '*', true],
  ['PermissionRequest', '*', false],
  ['Notification', null, true],
  ['Stop', null, true],
  ['PreCompact', null, true],
  ['SessionEnd', null, true]
];

const args = process.argv.slice(2);
const cmd = args[0] || 'help';
const flag = (name) => args.includes('--' + name);
const opt = (name, dflt) => { const i = args.indexOf('--' + name); return i > -1 && args[i + 1] ? args[i + 1] : dflt; };

const c = process.stdout.isTTY && !process.env.NO_COLOR
  ? { g: (s) => '\x1b[32m' + s + '\x1b[0m', y: (s) => '\x1b[33m' + s + '\x1b[0m', d: (s) => '\x1b[2m' + s + '\x1b[0m', b: (s) => '\x1b[1m' + s + '\x1b[0m', r: (s) => '\x1b[31m' + s + '\x1b[0m' }
  : { g: String, y: String, d: String, b: String, r: String };
const ok = (m) => console.log(c.g('✓ ') + m);
const warn = (m) => console.log(c.y('! ') + m);
const tilde = (p) => p.startsWith(os.homedir()) ? '~' + p.slice(os.homedir().length) : p;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fwd = (p) => p.split(path.sep).join('/');

function readJson(p, fallback) { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return fallback; } }
function writeJsonAtomic(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp-' + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2) + '\n');
  fs.renameSync(tmp, p);
}

// ---------------- http helpers ----------------
function request(method, route, body, timeoutMs) {
  const cfg = readJson(CONFIG, {});
  return new Promise((resolve) => {
    const data = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request({
      host: '127.0.0.1', port: cfg.port || 47333, path: route, method,
      headers: Object.assign({ 'x-agentmon-token': cfg.token || '' }, data ? { 'content-type': 'application/json', 'content-length': data.length } : {})
    }, (res) => {
      const chunks = [];
      res.on('data', (x) => chunks.push(x));
      res.on('end', () => { let j = null; try { j = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) {} resolve({ status: res.statusCode, body: j }); });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeoutMs || 3000, () => { req.destroy(); resolve(null); });
    req.end(data || undefined);
  });
}
async function health() { const r = await request('GET', '/health'); return r && r.status === 200 && r.body && r.body.app === 'agentmon' ? r.body : null; }

// ---------------- install ----------------
function copyRuntime() {
  if (fs.existsSync(HOME) && fs.realpathSync(HOME) === fs.realpathSync(PKG)) return false;
  fs.mkdirSync(HOME, { recursive: true });
  for (const dir of ['bin', 'daemon', 'extension']) {
    fs.rmSync(path.join(HOME, dir), { recursive: true, force: true });
    fs.cpSync(path.join(PKG, dir), path.join(HOME, dir), { recursive: true, filter: (src) => path.basename(src) !== 'config.json' });
  }
  for (const f of ['package.json', 'README.md']) if (fs.existsSync(path.join(PKG, f))) fs.copyFileSync(path.join(PKG, f), path.join(HOME, f));
  return true;
}

function writeConfig() {
  const prev = readJson(CONFIG, {});
  const cfg = {
    port: Number(opt('port', prev.port || 47333)),
    token: prev.token || crypto.randomBytes(24).toString('hex'),
    permissionHoldSeconds: prev.permissionHoldSeconds || 570,
    contextWindow: prev.contextWindow || 0
  };
  writeJsonAtomic(CONFIG, cfg);
  try { fs.chmodSync(CONFIG, 0o600); } catch (_) {}
  writeJsonAtomic(path.join(HOME, 'extension', 'config.json'), { port: cfg.port, token: cfg.token });
  return cfg;
}

function isOurs(h) {
  if (!h || typeof h !== 'object') return false;
  const text = [h.command].concat(Array.isArray(h.args) ? h.args : []).join(' ');
  return /hook\.js/.test(text) && (text.includes(fwd(HOOK)) || text.includes(HOOK) || /agentmon/i.test(text));
}

function stripOurHooks(settings) {
  if (!settings.hooks || typeof settings.hooks !== 'object') return 0;
  let removed = 0;
  for (const ev of Object.keys(settings.hooks)) {
    const groups = Array.isArray(settings.hooks[ev]) ? settings.hooks[ev] : [];
    const kept = [];
    for (const g of groups) {
      const hooks = Array.isArray(g && g.hooks) ? g.hooks : [];
      const mine = hooks.filter(isOurs);
      removed += mine.length;
      const rest = hooks.filter((h) => !isOurs(h));
      if (rest.length) kept.push(Object.assign({}, g, { hooks: rest }));
      else if (!mine.length) kept.push(g);
    }
    if (kept.length) settings.hooks[ev] = kept; else delete settings.hooks[ev];
  }
  if (!Object.keys(settings.hooks).length) delete settings.hooks;
  return removed;
}

function loadClaudeSettings() {
  if (!fs.existsSync(CLAUDE_SETTINGS)) return {};
  const raw = fs.readFileSync(CLAUDE_SETTINGS, 'utf8');
  if (!raw.trim()) return {};
  try { return JSON.parse(raw); } catch (e) {
    throw new Error(tilde(CLAUDE_SETTINGS) + ' is not valid JSON (' + e.message + '). Fix it, then run init again.');
  }
}

function installHooks() {
  const settings = loadClaudeSettings();
  if (fs.existsSync(CLAUDE_SETTINGS)) {
    const backup = CLAUDE_SETTINGS + '.agentmon-backup';
    if (!fs.existsSync(backup)) fs.copyFileSync(CLAUDE_SETTINGS, backup);
  }
  stripOurHooks(settings);
  settings.hooks = settings.hooks || {};
  const node = fwd(process.execPath);
  for (const [ev, matcher, async] of HOOK_EVENTS) {
    const handler = IS_WIN
      ? { type: 'command', command: node, args: [fwd(HOOK)] }
      : { type: 'command', command: '"' + node + '" "' + fwd(HOOK) + '"' };
    handler.timeout = ev === 'PermissionRequest' ? 600 : 10;
    if (async) handler.async = true;
    const group = { hooks: [handler] };
    if (matcher) group.matcher = matcher;
    settings.hooks[ev] = (Array.isArray(settings.hooks[ev]) ? settings.hooks[ev] : []).concat([group]);
  }
  writeJsonAtomic(CLAUDE_SETTINGS, settings);
}

// ---------------- daemon control ----------------
function plistXml() {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0"><dict>\n' +
    '  <key>Label</key><string>' + LABEL + '</string>\n' +
    '  <key>ProgramArguments</key><array><string>' + esc(process.execPath) + '</string><string>' + esc(SERVER) + '</string></array>\n' +
    '  <key>EnvironmentVariables</key><dict><key>AGENTMON_HOME</key><string>' + esc(HOME) + '</string></dict>\n' +
    '  <key>RunAtLoad</key><true/>\n  <key>KeepAlive</key><true/>\n' +
    '  <key>StandardOutPath</key><string>' + esc(LOG) + '</string>\n  <key>StandardErrorPath</key><string>' + esc(LOG) + '</string>\n' +
    '</dict></plist>\n';
}
const uid = () => (typeof process.getuid === 'function' ? process.getuid() : 0);

function startDetached() {
  const out = fs.openSync(LOG, 'a');
  const child = spawn(process.execPath, [SERVER], { detached: true, stdio: ['ignore', out, out], windowsHide: true, env: Object.assign({}, process.env, { AGENTMON_HOME: HOME }) });
  child.unref();
}

async function start() {
  if (!fs.existsSync(CONFIG)) throw new Error('Not set up yet. Run `agentmon init` first.');
  if (await health()) { ok('Helper already running on 127.0.0.1:' + readJson(CONFIG, {}).port); return true; }
  let how = 'background process';
  if (IS_MAC && !flag('no-launchd')) {
    fs.mkdirSync(path.dirname(PLIST), { recursive: true });
    fs.writeFileSync(PLIST, plistXml());
    spawnSync('launchctl', ['bootout', 'gui/' + uid() + '/' + LABEL], { stdio: 'ignore' });
    const r = spawnSync('launchctl', ['bootstrap', 'gui/' + uid(), PLIST], { stdio: 'ignore' });
    if (r.status === 0) how = 'launchd (starts at login)';
    else startDetached();
  } else if (fs.existsSync(UNIT) && !IS_WIN) {
    const r = spawnSync('systemctl', ['--user', 'restart', 'agentmon.service'], { stdio: 'ignore' });
    if (r.status === 0) how = 'systemd user service'; else startDetached();
  } else {
    startDetached();
  }
  for (let i = 0; i < 30; i++) { await sleep(150); if (await health()) { ok('Helper running on 127.0.0.1:' + readJson(CONFIG, {}).port + c.d(' (' + how + ')')); return true; } }
  warn('The helper did not come up. Check ' + tilde(LOG));
  return false;
}

async function stop() {
  if (IS_MAC && fs.existsSync(PLIST)) spawnSync('launchctl', ['bootout', 'gui/' + uid() + '/' + LABEL], { stdio: 'ignore' });
  if (fs.existsSync(UNIT)) spawnSync('systemctl', ['--user', 'stop', 'agentmon.service'], { stdio: 'ignore' });
  const h = await health();
  const pid = (h && h.pid) || readJson(path.join(HOME, 'daemon.pid'), null);
  if (pid) { try { process.kill(pid, 'SIGTERM'); } catch (_) {} }
  for (let i = 0; i < 20; i++) { if (!(await health())) { ok('Helper stopped'); return; } await sleep(150); }
  warn('Helper still answering; kill pid ' + pid + ' manually.');
}

function installSystemd() {
  if (process.platform !== 'linux') return;
  const unit = '[Unit]\nDescription=AgentMon helper\n\n[Service]\nExecStart=' + process.execPath + ' ' + SERVER +
    '\nEnvironment=AGENTMON_HOME=' + HOME + '\nRestart=on-failure\n\n[Install]\nWantedBy=default.target\n';
  fs.mkdirSync(path.dirname(UNIT), { recursive: true });
  fs.writeFileSync(UNIT, unit);
  spawnSync('systemctl', ['--user', 'daemon-reload'], { stdio: 'ignore' });
  const r = spawnSync('systemctl', ['--user', 'enable', 'agentmon.service'], { stdio: 'ignore' });
  if (r.status === 0) ok('Autostart enabled (systemd user service)');
  else { warn('systemd user services are not available here; start the helper with `agentmon start` after each reboot.'); fs.rmSync(UNIT, { force: true }); }
}

// ---------------- commands ----------------
async function init() {
  console.log(c.b('\nAgentMon setup\n'));
  if (await health()) await stop();
  if (copyRuntime()) ok('Files copied to ' + tilde(HOME));
  const cfg = writeConfig();
  ok('Config written (port ' + cfg.port + ', private token)');
  if (!flag('no-hooks')) {
    installHooks();
    ok('Claude Code hooks added to ' + tilde(CLAUDE_SETTINGS) + c.d(' (backup: settings.json.agentmon-backup)'));
  }
  if (flag('autostart')) installSystemd();
  await start();
  const ext = path.join(HOME, 'extension');
  console.log('\n' + c.b('Next: load the extension in Chrome (once)'));
  console.log('  1. Open ' + c.b('chrome://extensions') + ' and turn on ' + c.b('Developer mode'));
  console.log('  2. Click ' + c.b('Load unpacked') + ' and pick ' + c.b(ext));
  console.log('  3. Pin AgentMon, then start Claude Code. Your first pet hatches on the next prompt.');
  console.log('\n  Want a preview first?  ' + c.b('node ' + tilde(path.join(HOME, 'bin', 'agentmon.js')) + ' demo'));
  if (!IS_MAC) console.log(c.d('\n  Tip: after a reboot run `node ' + tilde(path.join(HOME, 'bin', 'agentmon.js')) + ' start`' + (process.platform === 'linux' ? ' (or re-run init with --autostart)' : '') + '.'));
  console.log('');
}

async function status() {
  const h = await health();
  if (!h) { warn('Helper is not running. Start it with `agentmon start`.'); return; }
  ok('Helper running on 127.0.0.1:' + h.port + ' (pid ' + h.pid + ')');
  const r = await request('GET', '/state');
  if (!r || r.status !== 200) { warn('Could not read state (token mismatch? run init again).'); return; }
  const list = r.body.sessions || [];
  if (!list.length) console.log(c.d('  No sessions yet.'));
  for (const s of list) {
    console.log('  ' + c.b(s.petName.padEnd(10)) + ' ' + (s.family + ' st' + s.stage).padEnd(10) + ' ' + String(s.xp + ' XP').padEnd(7) + ' ' + s.project.padEnd(18) + ' ' + (s.pending ? c.y(s.statusText) : s.statusText || s.status));
  }
}

async function demo() {
  if (!(await health())) throw new Error('Helper is not running. Start it with `agentmon start`.');
  const ev = (id, name, extra) => request('POST', '/event', Object.assign({ session_id: id, hook_event_name: name, _demo: true, _ts: Date.now() }, extra || {}));
  const S = [
    { id: 'demo-checkout', cwd: path.join(os.homedir(), 'code', 'checkout'), _family: 'ember', _petName: 'Mochi', _hp: 0.82, prompt: 'Fix the rounding bug in the cart total' },
    { id: 'demo-api', cwd: path.join(os.homedir(), 'code', 'api'), _family: 'tide', _petName: 'Pip', _hp: 0.55, prompt: 'Add rate limiting to the login route' },
    { id: 'demo-landing', cwd: path.join(os.homedir(), 'code', 'landing'), _family: 'sprout', _petName: 'Nova', _hp: 0.2, prompt: 'Make the hero responsive' }
  ];
  console.log(c.b('\nAgentMon demo') + c.d(' — watch any Chrome tab\n'));
  await request('POST', '/demo/clear', {});
  for (const s of S) { await ev(s.id, 'SessionStart', { cwd: s.cwd, source: 'startup', _family: s._family, _petName: s._petName, _hp: s._hp }); await sleep(500); }
  ok('Three pets hatched: Mochi, Pip and Nova');
  for (const s of S) await ev(s.id, 'UserPromptSubmit', { cwd: s.cwd, prompt: s.prompt });
  const tools = [['Read', { file_path: S[1].cwd + '/src/routes/auth.ts' }], ['Edit', { file_path: S[1].cwd + '/src/routes/auth.ts' }], ['Bash', { command: 'npm test' }]];
  for (let i = 0; i < tools.length; i++) {
    await ev(S[1].id, 'PreToolUse', { tool_name: tools[i][0], tool_input: tools[i][1], tool_use_id: 'd' + i });
    await ev(S[2].id, 'PreToolUse', { tool_name: 'Edit', tool_input: { file_path: S[2].cwd + '/app/page.tsx' }, tool_use_id: 'e' + i });
    await sleep(1600);
    await ev(S[1].id, 'PostToolUse', { tool_name: tools[i][0], tool_input: tools[i][1], tool_use_id: 'd' + i, _xp: i === 2 ? 17 : 0 });
    await ev(S[2].id, 'PostToolUse', { tool_name: 'Edit', tool_input: {}, tool_use_id: 'e' + i, _xp: i === 2 ? 60 : 0 });
    await sleep(700);
  }
  ok('Pip and Nova earned enough XP to evolve');
  await ev(S[2].id, 'Stop', { last_assistant_message: 'The hero now stacks under 640px and the CTA stays above the fold on phones.' });
  ok('Nova finished its task');
  await sleep(1200);
  console.log('\n' + c.y('Mochi is asking to run `npm run deploy`.') + ' Click the bouncing pet in Chrome and pick Allow, Always or Deny…');
  const t0 = Date.now();
  const r = await request('POST', '/permission', {
    session_id: S[0].id, hook_event_name: 'PermissionRequest', cwd: S[0].cwd, tool_name: 'Bash', tool_input: { command: 'npm run deploy', description: 'Deploy to production' },
    tool_use_id: 'perm1', _demo: true, permission_suggestions: [{ type: 'addRules', rules: [{ toolName: 'Bash', ruleContent: 'npm run deploy' }], behavior: 'allow', destination: 'session' }]
  }, 600000);
  const d = r && r.body && r.body.decision;
  if (!d && Date.now() - t0 < 1500) warn('No Chrome extension connected, so the request fell back to the terminal. Load the extension and run the demo again.');
  else if (!d) warn('No answer (timed out or cleared).');
  else ok('You answered: ' + c.b(d) + (d === 'always' ? ' (Claude Code would also save the rule)' : ''));
  if (flag('keep')) { console.log(c.d('\nDemo pets stay until the helper restarts or you run `agentmon demo --clear`.\n')); return; }
  console.log(c.d('\nDemo pets leave in 20 seconds… (use --keep to keep them)'));
  await sleep(20000);
  await request('POST', '/demo/clear', {});
  ok('Demo cleaned up\n');
}

async function uninstall() {
  await stop();
  if (IS_MAC && fs.existsSync(PLIST)) { fs.rmSync(PLIST, { force: true }); ok('Removed launchd agent'); }
  if (fs.existsSync(UNIT)) { spawnSync('systemctl', ['--user', 'disable', 'agentmon.service'], { stdio: 'ignore' }); fs.rmSync(UNIT, { force: true }); ok('Removed systemd unit'); }
  if (fs.existsSync(CLAUDE_SETTINGS)) {
    const settings = loadClaudeSettings();
    const n = stripOurHooks(settings);
    writeJsonAtomic(CLAUDE_SETTINGS, settings);
    ok('Removed ' + n + ' AgentMon hooks from ' + tilde(CLAUDE_SETTINGS));
  }
  if (flag('purge')) { fs.rmSync(HOME, { recursive: true, force: true }); ok('Deleted ' + tilde(HOME)); }
  console.log('\nLast step: remove AgentMon from chrome://extensions.\n');
}

function help() {
  console.log([
    '', c.b('AgentMon') + ' — Claude Code sessions as pocket creatures in Chrome', '',
    '  init [--port N] [--autostart]   set up hooks, helper and extension files',
    '  start | stop | restart          control the local helper',
    '  status                          show the helper and your pets',
    '  demo [--keep] [--clear]         hatch fake sessions to try the pets',
    '  uninstall [--purge]             remove the hooks (and ~/.agentmon with --purge)',
    '  run                             run the helper in the foreground', ''
  ].join('\n'));
}

(async () => {
  try {
    switch (cmd) {
      case 'init': await init(); break;
      case 'start': await start(); break;
      case 'stop': await stop(); break;
      case 'restart': await stop(); await start(); break;
      case 'status': await status(); break;
      case 'demo':
        if (flag('clear')) { await request('POST', '/demo/clear', {}); ok('Demo pets removed'); }
        else await demo();
        break;
      case 'uninstall': await uninstall(); break;
      case 'run': process.env.AGENTMON_HOME = HOME; require(SERVER); break;
      default: help();
    }
  } catch (e) {
    console.error(c.r('✗ ') + (e && e.message ? e.message : e));
    process.exit(1);
  }
})();
