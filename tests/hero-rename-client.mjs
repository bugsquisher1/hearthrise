#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hero-rename-client.mjs — THE CLIENT HALF OF A PAID NAME CHANGE
// (Tyler 2026-10-22; server: supabase/migrations/2026-12-04-hero-rename.sql).
//
//   node tests/hero-rename-client.mjs            the rules
//   node tests/hero-rename-client.mjs --mutate   every planted defect must turn a rule RED
//
// mutant-anchors: src/session/character-session.js src/session/item-sections.js src/session/refusal.js src/shell/intent-words.js
//
// Node, no browser: a fake server link records every RPC.
//   RC-1  renameHero sends ONE hr_hero_rename naming the slot, the cleaned name,
//         the QUOTED price and a fresh key, nothing else, then re-reads the hero
//   RC-2  it sends nothing for a name outside 3-20 or a price that is not a
//         positive whole number (the server would refuse; no free call)
//   RC-3  renameOf reads the `rename` section {price, level, available, why} and
//         answers null for a missing or malformed one (Rename stays off)
//   RC-4  the refusals read in plain words: same_name, renamed_today,
//         already_named, not_named, hunt_open, insufficient_gold, quote_changed,
//         and bad_name with reason reserved / blocked says the name is not allowed
//   RC-5  the free first-name path is gone from the client: no module sends
//         hr_character_name_set
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync, cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const UID = '11111111-2222-3333-4444-555555555555';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MUTANTS = [
  ['price-dropped', 'src/session/character-session.js',
    "this._server.rpc('hr_hero_rename', { p_slot: this.slot, p_name: n, p_price: quotedPrice, p_idem: newIdem() })",
    "this._server.rpc('hr_hero_rename', { p_slot: this.slot, p_name: n, p_idem: newIdem() })"],
  ['price-unchecked', 'src/session/character-session.js',
    "    if (!Number.isSafeInteger(quotedPrice) || quotedPrice < 1) return { ok: false, error: 'bad_intent' };\n    return this._ask('hero_rename'",
    "    return this._ask('hero_rename'"],
  ['why-trusted', 'src/session/item-sections.js',
    "    why: q.available ? null : (RENAME_WHY.includes(q.why) ? q.why : 'unavailable') };",
    "    why: q.available ? null : q.why };"],
  ['section-unchecked', 'src/session/item-sections.js',
    "  if (!isObj(q) || !count(q.price) || !count(q.level) || typeof q.available !== 'boolean') return null;\n  return { price: q.price, level",
    "  if (!isObj(q)) return null;\n  return { price: q.price, level"],
  ['reason-dropped', 'src/session/refusal.js',
    "    reason: typeof b.reason === 'string' && /^[a-z_]{1,24}$/.test(b.reason) ? b.reason : null };",
    "    reason: null };"],
];

function fakeServer(env, answer) {
  const calls = [];
  const wrap = (body) => ({ ok: true, status: 200, body, closed: false });
  return {
    calls,
    rpc: async (name, args) => {
      calls.push([name, args]);
      if (name === 'hr_load') return wrap(env);
      if (name === 'hr_hero_rename') return wrap(answer);
      return wrap({ ok: false, error: 'unknown' });
    },
    accrue: async () => wrap(env),
  };
}

function clientFiles(base) {
  const out = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (f.endsWith('.js')) out.push(p); } };
  for (const d of ['src/app', 'src/session', 'src/shell', 'src/net', 'src/social', 'src/world', 'src/hunt-view', 'src/render']) {
    try { walk(join(base, d)); } catch { /* absent dir */ }
  }
  return out;
}

async function rules(base) {
  const u = (p) => pathToFileURL(join(base, p)).href;
  const C = await import(u('src/session/character-session.js'));
  const IS = await import(u('src/session/item-sections.js'));
  const IW = await import(u('src/shell/intent-words.js'));
  const { REFUSAL_FALLBACK } = await import(u('src/data/refusal-words.js'));
  const fails = [];
  const t = async (id, fn) => { try { const r = await fn(); if (r !== true) fails.push(id + ': ' + r); } catch (e) { fails.push(id + ': threw ' + (e && e.message)); } };
  const RENAME = { price: 27500, level: 15, per_day: 1, today: 0, available: true, why: null };
  const env = { ok: true, version: 3, state: { gold: 30000 }, name: 'Wren Ashby', rename: RENAME };
  const timers = { setTimer: () => 0, clearTimer: () => {} };
  const mk = async (answer) => {
    const srv = fakeServer(env, answer);
    const cs = new C.CharacterSession({ slot: 2, uid: UID, server: srv, ...timers });
    await cs.load();
    srv.calls.length = 0;
    return { cs, srv };
  };

  await t('RC-1', async () => {
    const { cs, srv } = await mk({ ok: true, version: 4, name: 'Wren Tallow' });
    const r = await cs.renameHero('  Wren   Tallow ', 27500);
    const sent = srv.calls.filter((c) => c[0] === 'hr_hero_rename');
    if (!r || r.ok !== true) return 'answered ' + JSON.stringify(r);
    if (sent.length !== 1) return sent.length + ' hr_hero_rename calls';
    const a = sent[0][1];
    if (JSON.stringify(Object.keys(a).sort()) !== JSON.stringify(['p_idem', 'p_name', 'p_price', 'p_slot'])) return 'sent keys ' + Object.keys(a);
    if (a.p_slot !== 2 || a.p_name !== 'Wren Tallow' || a.p_price !== 27500 || !UUID.test(a.p_idem)) return 'sent ' + JSON.stringify(a);
    return srv.calls.some((c) => c[0] === 'hr_load') || 'the hero was not re-read after the rename';
  });
  await t('RC-2', async () => {
    const { cs, srv } = await mk({ ok: true });
    for (const [n, p] of [['Wb', 27500], ['W'.repeat(21), 27500], ['Wren Tallow', 0], ['Wren Tallow', 27500.5], ['Wren Tallow', '27500'], ['Wren Tallow', null]]) {
      const r = await cs.renameHero(n, p);
      if (!r || r.ok !== false) return JSON.stringify([n, p]) + ' answered ' + JSON.stringify(r);
    }
    return srv.calls.length === 0 || 'a bad name or price still reached the server: ' + JSON.stringify(srv.calls);
  });
  await t('RC-3', async () => {
    const { cs } = await mk({ ok: true });
    const q = IS.renameOf(cs);
    if (!q || q.price !== 27500 || q.level !== 15 || q.available !== true || q.why !== null) return 'renameOf read ' + JSON.stringify(q);
    const read = (sec) => IS.renameOf({ read: (k) => (k === 'rename' ? sec : undefined), record: { data: { rename: sec } } });
    for (const bad of [undefined, null, [], { price: -1, level: 1, available: true }, { price: 100, level: 1 }, { price: '100', level: 1, available: true }, { price: 100, available: true }]) {
      if (read(bad) !== null) return 'a malformed section ' + JSON.stringify(bad) + ' read as ' + JSON.stringify(read(bad));
    }
    const hunting = read({ price: 100, level: 1, available: false, why: 'hunt_open' });
    const odd = read({ price: 100, level: 1, available: false, why: '<b>x</b>' });
    if (!hunting || hunting.why !== 'hunt_open') return 'hunt_open read as ' + JSON.stringify(hunting);
    return (!!odd && odd.why === 'unavailable') || 'an unknown why was passed through: ' + JSON.stringify(odd);
  });
  await t('RC-4', async () => {
    for (const code of ['same_name', 'renamed_today', 'already_named', 'not_named', 'hunt_open', 'insufficient_gold', 'quote_changed', 'name_taken']) {
      const w = IW.refusalText({ ok: false, error: code });
      if (!w || w === REFUSAL_FALLBACK) return code + ' reads as the fallback';
    }
    const { cs } = await mk({ ok: false, error: 'bad_name', reason: 'reserved' });
    const r = await cs.renameHero('Admin', 27500);
    const w = IW.refusalText(r, cs);
    if (r.reason !== 'reserved') return 'the session dropped the server\'s reason: ' + JSON.stringify(r);
    if (!/not allowed/.test(w)) return 'a reserved name reads ' + JSON.stringify(w);
    return /3 to 20/.test(IW.refusalText({ ok: false, error: 'bad_name', reason: 'short' })) || 'a short name lost its length words';
  });
  await t('RC-5', () => {
    const hit = clientFiles(base).filter((f) => /rpc\(\s*'hr_character_name_set'/.test(readFileSync(f, 'utf8')));
    return hit.length === 0 || 'still sent by ' + hit.join(', ');
  });
  return fails;
}

const argv = process.argv.slice(2);
if (argv.includes('--mutate')) {
  let slipped = 0;
  for (const [id, file, from, to] of MUTANTS) {
    const dir = mkdtempSync(join(tmpdir(), 'hr-rename-'));
    try {
      cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true });
      const p = join(dir, file);
      const src = readFileSync(p, 'utf8').replace(/\r/g, '');
      if (src.split(from).length !== 2) { console.log(`  STALE   ${id}: the anchor is not in ${file} exactly once`); slipped++; continue; }
      writeFileSync(p, src.replace(from, to));
      const f = await rules(dir);
      if (f.length) console.log(`  CAUGHT  ${id}: ${f[0]}`); else { slipped++; console.log(`  SLIPPED ${id}`); }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  console.log(slipped ? `hero-rename-client --mutate: ${slipped} SLIPPED` : `hero-rename-client --mutate: all ${MUTANTS.length} caught`);
  process.exit(slipped ? 1 : 0);
}
const fails = await rules(ROOT);
if (fails.length) { console.log('hero-rename-client: RED\n  ' + fails.join('\n  ')); process.exit(1); }
console.log('hero-rename-client: RC-1..RC-5 green (one priced intent, nothing sent for bad input, the section read safely, refusals in words, no free rename path)');
process.exit(0);
