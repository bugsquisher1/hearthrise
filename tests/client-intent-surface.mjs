#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/client-intent-surface.mjs — WHAT THE CLIENT CAN SAY TO THE SERVER, WHOLE.
//
//   node tests/client-intent-surface.mjs             the guard
//   node tests/client-intent-surface.mjs --selftest  planted shapes must go RED / stay GREEN
//
// mutant-anchors: none — the proof plants into in-memory file maps, never the tree
//
// CLAUDE.md §1: the client sends INTENTS and renders what the server returns.
// The old client's write censuses (gold/gem/inventory sites, farm gestures,
// settle-first callers, per-feature RPC callers) retired with it on 2026-10-17;
// this pins the rebuilt client's WHOLE surface instead, so a new intent is a
// deliberate edit to the list below, never a line that slipped in:
//   IS-1  every RPC the client names (`rpc('<name>'`) is on CLIENT_RPCS;
//   IS-2  the edge is called with the character's slot and nothing else
//         (`accrue({ slot: this.slot })`) — no amount, item, price or count;
//   IS-3  ONE server link: `fetch(` appears only in src/session/server.js, and no
//         client module reaches PostgREST tables or RPCs through supabase-js
//         (`.from(`, `.rpc(`) — the client's only use of supabase-js is auth and
//         the push channel;
//   IS-4  non-vacuity: the client tree is read, and each allowed RPC is named.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT_DIRS = ['src/app', 'src/session', 'src/shell', 'src/net', 'src/world', 'src/platform', 'src/render', 'src/hunt-view'];
const LINK = 'src/session/server.js';

/* The client's whole RPC surface, each with what it is for. */
export const CLIENT_RPCS = Object.freeze({
  hr_load: 'the full read of one character (CharacterSession.load)',
  hr_create_character: 'make the character in an owned slot (AccountSession.create)',
  hr_put_client_state: 'the allowlisted display residue (CharacterSession.flushResidue)',
  hr_action_set_options: 'the per-hero hunt settings intent, catalogue-validated and refused not clamped (CharacterSession.setHuntOptions)',
  hr_hunt_leave: 'leave the running hunt; the server settles and ends it (CharacterSession.leaveHunt)',
});

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

function walk(dir, out = {}) {
  if (!existsSync(join(ROOT, dir))) return out;
  for (const n of readdirSync(join(ROOT, dir)).sort()) {
    const p = dir + '/' + n;
    if (statSync(join(ROOT, p)).isDirectory()) walk(p, out);
    else if (p.endsWith('.js')) out[p] = readFileSync(join(ROOT, p), 'utf8');
  }
  return out;
}

export function check(files) {
  const problems = [];
  const named = new Set();
  for (const [f, raw] of Object.entries(files)) {
    const code = strip(raw);
    for (const m of code.matchAll(/\brpc\(\s*'([a-z0-9_]+)'/g)) {
      named.add(m[1]);
      if (!Object.prototype.hasOwnProperty.call(CLIENT_RPCS, m[1])) problems.push(`IS-1 ${f} calls ${m[1]}, which is not on CLIENT_RPCS — a new intent is a reviewed edit to this list`);
    }
    for (const m of code.matchAll(/\.accrue\(([^)]*)\)/g)) {
      if (f === LINK) continue;
      if (m[1].replace(/\s+/g, '') !== '{slot:this.slot}') problems.push(`IS-2 ${f} sends the edge ${m[1].trim()} — the client may name its slot and nothing else`);
    }
    if (f !== LINK && /\bfetch\s*\(/.test(code)) problems.push(`IS-3 ${f} calls fetch — the client has ONE server link (${LINK})`);
    if (/\.from\(\s*['"`]/.test(code)) problems.push(`IS-3 ${f} reads or writes a table through supabase-js (.from) — every value comes from an RPC answer`);
    if (/\.\s*rpc\s*\(\s*['"`]/.test(code.replace(/\bserver\.rpc\(|this\._server\.rpc\(/g, '('))) problems.push(`IS-3 ${f} calls an RPC through supabase-js — RPCs go through ${LINK}`);
  }
  const n = Object.keys(files).length;
  if (n < 10 || !files[LINK]) problems.push(`IS-4 only ${n} client module(s) read — the scan is reading the wrong tree`);
  for (const r of Object.keys(CLIENT_RPCS)) if (!named.has(r)) problems.push(`IS-4 CLIENT_RPCS lists ${r} and no client module calls it — a stale entry is a standing permission`);
  return problems;
}

const files = () => CLIENT_DIRS.reduce((acc, d) => walk(d, acc), {});

if (process.argv.includes('--selftest')) {
  const real = files();
  const plant = (f, extra) => ({ ...real, [f]: (real[f] || '') + '\n' + extra + '\n' });
  const cases = [
    ['clean tree', real, null],
    ['a new RPC the list does not name', plant('src/app/boot.js', "server.rpc('hr_vendor_sell', { p_item: 'ore', p_qty: 9 });"), 'IS-1'],
    ['the edge sent an amount', plant('src/session/character-session.js', 'this._server.accrue({ slot: this.slot, gold: 500 });'), 'IS-2'],
    ['a second fetch', plant('src/app/world-pane.js', "fetch('/rest/v1/rpc/hr_load');"), 'IS-3'],
    ['a table read through supabase-js', plant('src/app/boot.js', "client.from('player_state').select('*');"), 'IS-3'],
    ['an RPC through supabase-js', plant('src/app/boot.js', "client.rpc('hr_load', { p_slot: 0 });"), 'IS-3'],
    ['a stale allow entry (the reader of hr_create_character gone)', { ...real, 'src/session/account-session.js': real['src/session/account-session.js'].split("'hr_create_character'").join("'hr_create_characterX'") }, 'IS-'],
    ['negative control: an RPC named in a comment', plant('src/app/boot.js', "// server.rpc('hr_vendor_sell')"), null],
  ];
  let bad = 0;
  for (const [name, f, want] of cases) {
    const got = check(f);
    const ok = want === null ? got.length === 0 : got.some((g) => g.startsWith(want));
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'} ${name} → ${got[0] || 'GREEN'} (want ${want || 'GREEN'})`);
  }
  if (bad) { console.error(`✗ client-intent-surface --selftest: ${bad} case(s) wrong`); process.exit(1); }
  console.log('✓ client-intent-surface --selftest: all ' + cases.length + ' cases behave');
  process.exit(0);
}
const problems = check(files());
for (const p of problems) console.error('✗ ' + p);
if (problems.length) process.exit(1);
console.log(`✓ client-intent-surface: the client names ${Object.keys(CLIENT_RPCS).length} RPCs (${Object.keys(CLIENT_RPCS).join(', ')}), sends the edge its slot only, through one link`);
