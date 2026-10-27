#!/usr/bin/env node
/*
 * AgentMon hook bridge. Claude Code runs this for each hook event and pipes the
 * event JSON on stdin. We forward it to the local daemon.
 *
 * - Normal events: fire-and-forget, never print anything, always exit 0.
 * - PermissionRequest: wait for the pet's answer and print Claude Code's decision JSON.
 *   No answer (daemon down, Chrome closed, timeout) => print nothing, so the normal
 *   terminal prompt handles it.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

const T0 = Date.now();
const HOME = process.env.AGENTMON_HOME || path.join(__dirname, '..');
let cfg;
try { cfg = JSON.parse(fs.readFileSync(path.join(HOME, 'config.json'), 'utf8')); } catch (_) { process.exit(0); }
const PORT = Number(process.env.AGENTMON_PORT || cfg.port || 47333);

function done(out) {
  if (out) process.stdout.write(JSON.stringify(out), () => process.exit(0));
  else process.exit(0);
}

// Keep payloads small: drop tool output and cap long strings (we only display previews).
function slim(v, depth) {
  if (typeof v === 'string') return v.length > 6000 ? v.slice(0, 6000) + '…' : v;
  if (!v || typeof v !== 'object' || depth > 4) return v;
  if (Array.isArray(v)) return v.slice(0, 50).map((x) => slim(x, depth + 1));
  const o = {};
  for (const k of Object.keys(v)) o[k] = slim(v[k], depth + 1);
  return o;
}

function post(route, body, timeoutMs) {
  return new Promise((resolve) => {
    const data = Buffer.from(JSON.stringify(body));
    const req = http.request({
      host: '127.0.0.1', port: PORT, path: route, method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': data.length, 'x-agentmon-token': cfg.token }
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch (_) { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null); });
    req.end(data);
  });
}

async function main(raw) {
  let input;
  try { input = JSON.parse(raw); } catch (_) { return done(); }
  const event = input.hook_event_name;
  const payload = slim(Object.assign({}, input, { tool_response: undefined, _ts: T0, _agent: 'Claude Code' }), 0);

  if (event !== 'PermissionRequest') {
    await post('/event', payload, 1500);
    return done();
  }

  const holdSec = Math.max(5, Number(cfg.permissionHoldSeconds || 570));
  const answer = await post('/permission', payload, (holdSec + 20) * 1000);
  const decision = answer && answer.decision;
  if (!decision) return done();

  if (decision === 'deny') {
    return done({
      hookSpecificOutput: {
        hookEventName: 'PermissionRequest',
        decision: { behavior: 'deny', message: 'The user denied this from AgentMon in the browser.' }
      }
    });
  }
  const allow = { behavior: 'allow' };
  if (input.tool_input && typeof input.tool_input === 'object') allow.updatedInput = input.tool_input;
  if (decision === 'always' && Array.isArray(input.permission_suggestions) && input.permission_suggestions.length) {
    allow.updatedPermissions = input.permission_suggestions;
  }
  return done({ hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: allow } });
}

let buf = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { buf += c; });
process.stdin.on('end', () => { main(buf).catch(() => done()); });
process.stdin.on('error', () => done());
setTimeout(() => { if (!buf) done(); }, 5000).unref();
