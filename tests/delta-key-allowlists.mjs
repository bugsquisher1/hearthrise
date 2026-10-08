#!/usr/bin/env node
// ============================================================================
// tests/delta-key-allowlists.mjs — EVERY DELTA-KEY ALLOWLIST COVERS EVERY KEY
//                                   THE ENGINE CAN PROPOSE.
//
//   node tests/delta-key-allowlists.mjs            the guard (one chain replay)
//   node tests/delta-key-allowlists.mjs --mutate   every mutant must turn its arm red
//
// THE CLASS (P1, found 2026-10-13 by lane/b567-companion-frac). The engine grew
// two delta keys — `xp_frac` (2026-10-09-xp-frac-carry.sql) and
// `companion_xp_frac` (2026-10-12-companion-xp-frac.sql). hr_apply learnt both.
// hr_party_tick_settle's own `c_delta_ok` did not, so every party window would
// have been refused `unknown_delta_key` the day M4 arms combat. Nothing compared
// the allowlists with what the engine proposes; this does, and it DERIVES the
// proposable set from the engine's source rather than from a list somebody has
// to remember to edit.
//
// THE ALLOWLISTS (the sweep, 2026-10-13 — every refusal-by-key-name on a delta):
//   hr_apply            c_delta_keys   SQL, installed body   refuses unknown_delta_key
//   hr_party_tick_settle c_delta_ok    SQL, installed body   refuses unknown_delta_key
//                       c_stamp        SQL                   refuses delta_would_stamp
//                                                            (BY DESIGN, invariant 8)
//   foldDeltas          tick-contract.js classification      throws "unclassified"
// Not allowlists, and why: hr_tick_settle (solo) names no key and forwards the
// delta to hr_apply; FOLD_CHAIN_KEYS (tick.js) ENDS a fold chain on any other
// key, it refuses nothing; STAMPING_DELTA_KEYS (intents.js) is a deny list.
//
// THE PROPOSABLE SETS, derived from supabase/functions/hr-accrue/accrual.js:
// every `delta.<key> =` and every top-level key of a `const delta = {…}` inside
// computeAccrual (COMBAT — the only engine a party runs), accrueGather and
// accrueArtisan, plus tick-gather.js's own `p_delta.<key> =` rewrites.
//
// THE ARMS
//   K0  the derivation is not vacuous (known keys of each engine are found),
//       AND it is complete: every use of the engine's `delta` is its literal
//       declaration (no computed key, no spread), a dotted `delta.<key>`, or the
//       whole object handed back — a bracket write, Object.assign, a helper, an
//       alias or a reassignment is RED by itself (Security 2026-10-13 #5), as
//       is a bracket write / Object.assign on a delta in the tick layer
//   KR  c_delta_ok is referenced only by its declaration and the key check, so
//       no party-settle code reads a key name out of it (Security #4)
//   KA  hr_apply's c_delta_keys covers every proposable key but the DORMANT ones
//   KB  hr_party_tick_settle's c_delta_ok, plus its c_stamp, covers every COMBAT
//       key but the dormant ones; c_stamp is STAMPING_DELTA_KEYS exactly
//   KC  c_delta_ok is a subset of hr_apply's c_delta_keys (Security S-1)
//   KD  foldDeltas classifies every proposable key
//   KE  a DORMANT key is dormant for a reason the replay can see: hr_apply does
//       not accept it AND the column the engine's self-configuring switch reads
//       does not exist, so the engine cannot propose it
//   KW  the two frac files' single-writer scans, as narrowed 2026-10-13, are one
//       predicate; on the chain they name nothing, and they still name a
//       planted body that mentions xp_frac and a party settle that mentions it
//       OUTSIDE its allowlist
//   P   ★ party-split parity, ARMED, as hr_engine: a two-member party window
//       whose two (different) member deltas carry xp, xp_frac, a pet XP op and
//       companion_xp_frac PAYS, and each member's gold, skill XP + remainders
//       and pet XP + remainder equal a solo twin's after hr_apply of the same
//       delta — and equal the proposed values
//   PS  the same keys in SHADOW are accepted, journalled, nothing paid
//   P0  CONTROL: with the pre-fix body (party-drop's, verbatim) P is refused
//       unknown_delta_key — the regression this lane fixes, reproduced
//   PI  2026-10-13-party-settle-frac-keys.sql re-applies byte-identically
//
// Exit: 0 green (or, under --mutate, every mutant caught) · 1 red · 2 harness.
// ============================================================================

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { bootReplay, ROOT } from './schema-replay.mjs';
import { STAMPING_DELTA_KEYS } from '../supabase/functions/hr-accrue/intents.js';

const MUTATE = process.argv.includes('--mutate') || process.argv.includes('--selftest');
const MIG = '2026-10-13-party-settle-frac-keys.sql';
const MIG_PRE = '2026-10-08-world-tick-party-drop.sql';
const FRAC_FILES = ['2026-10-09-xp-frac-carry.sql', '2026-10-12-companion-xp-frac.sql'];
const FN = 'supabase/functions/hr-accrue';
const SETTLE_SIG = 'public.hr_party_tick_settle(text,uuid,timestamptz,timestamptz,uuid,jsonb)';
const APPLY_SIG = 'public.hr_apply(uuid,int,bigint,uuid,jsonb)';

/* DORMANT: proposable in source, never proposed today, and refused by hr_apply
   if it were. Each names the column the engine's self-configuring switch reads
   (accrual.js: `if (ammoCarry0) delta.ammo_carry = …`, `ammoCarry0` from
   `st.ammo_carry ?? null`). KE proves the column is really absent. Adding a key
   here is a reviewable diff, never a way to quiet KA/KB. */
const DORMANT = Object.freeze({ ammo_carry: { table: 'player_state', column: 'ammo_carry' } });

const readText = async (rel) => (await readFile(join(ROOT, rel), 'utf8')).replace(/\r\n/g, '\n');

// ── SOURCE DERIVATION ───────────────────────────────────────────────────────
/** Comments blanked (same length, newlines kept), strings and templates kept. */
function stripComments(src) {
  let out = ''; let i = 0; const n = src.length;
  while (i < n) {
    const c = src[i]; const d = src[i + 1];
    if (c === '/' && d === '/') { while (i < n && src[i] !== '\n') { out += ' '; i++; } continue; }
    if (c === '/' && d === '*') {
      out += '  '; i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { out += src[i] === '\n' ? '\n' : ' '; i++; }
      out += '  '; i += 2; continue;
    }
    if (c === '\'' || c === '"' || c === '`') {
      out += c; i++;
      while (i < n && src[i] !== c) { if (src[i] === '\\') { out += src[i++]; } out += src[i++]; }
      out += src[i++] || ''; continue;
    }
    out += c; i++;
  }
  return out;
}
/** The body of `function NAME(` — from its opening brace to the matching one. */
function fnBody(src, name) {
  const at = src.search(new RegExp(`(?:^|\\n)(?:export\\s+)?function\\s+${name}\\s*\\(`));
  if (at < 0) throw Object.assign(new Error(`accrual.js: function ${name} not found`), { harness: true });
  const open = src.indexOf('{', src.indexOf(')', at));
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(open, i + 1);
  }
  throw Object.assign(new Error(`accrual.js: function ${name} is unbalanced`), { harness: true });
}
/** Top-level keys of every `const delta = {…}` literal in `body`. A COMPUTED
    key (`[k]:`) or a SPREAD (`...x`) at the top level is a key nobody can read
    off the source, so it is a violation, never a guess. */
function literalKeys(body, varName, bad) {
  const keys = new Set();
  const re = new RegExp(`(?:const|let)\\s+${varName}\\s*=\\s*\\{`, 'g');
  let m;
  while ((m = re.exec(body))) {
    let depth = 0; let expectKey = true;
    for (let i = m.index + m[0].length - 1; i < body.length; i++) {
      const c = body[i];
      if (depth === 1 && expectKey && (c === '[' || body.startsWith('...', i))) {
        bad.push(`a ${c === '[' ? 'computed key' : 'spread'} in the \`${varName}\` literal: ${body.slice(i, i + 40).split('\n')[0]}`);
        expectKey = false;
      }
      if ('{(['.includes(c)) { depth++; if (depth === 1) expectKey = true; continue; }
      if ('})]'.includes(c)) { if (--depth === 0) break; continue; }
      if (depth !== 1) continue;
      if (c === ',') { expectKey = true; continue; }
      if (expectKey && /[A-Za-z_]/.test(c)) {
        const k = /^([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(body.slice(i));
        if (k) keys.add(k[1]);
        else bad.push(`a shorthand or non-literal entry in the \`${varName}\` literal: ${body.slice(i, i + 40).split('\n')[0]}`);
        expectKey = false;
      } else if (!/\s/.test(c)) expectKey = false;
    }
  }
  return keys;
}
function assignedKeys(body, varName) {
  const keys = new Set();
  for (const m of body.matchAll(new RegExp(`\\b${varName}\\.([a-z_][a-z0-9_]*)\\s*=(?!=)`, 'g'))) keys.add(m[1]);
  return keys;
}
/** EVERY use of the engine's `delta` must be one the derivation can read
    (Security, 2026-10-13 #5): its `const delta = {` declaration, a dotted
    `delta.<key>` (read or write — a write's key is collected), or the bare
    `delta` handed back whole in the result object (a line that is `delta,`).
    Anything else — `delta[k] =`, `Object.assign(delta, …)`, a helper called
    with `delta`, an alias, a spread, a reassignment, `delta: …` — could add a
    key this guard cannot see, and is RED by itself. */
function escapes(body, varName, where, bad) {
  for (const m of body.matchAll(new RegExp(`\\b${varName}\\b`, 'g'))) {
    const i = m.index;
    if (i > 0 && body[i - 1] === '.') continue;          // `x.delta` is another object's property
    const after = body.slice(i + varName.length);
    const lineStart = body.lastIndexOf('\n', i) + 1;
    const lineEnd = body.indexOf('\n', i);
    const line = body.slice(lineStart, lineEnd < 0 ? undefined : lineEnd).trim();
    if (/^\s*\.\s*[A-Za-z_]/.test(after)) continue;                         // dotted
    if (/(?:const|let)\s+$/.test(body.slice(lineStart, i)) && /^\s*=\s*\{/.test(after)) continue; // declaration
    if (line === `${varName},` || line === varName) continue;              // handed back whole
    bad.push(`${where}: a non-literal use of \`${varName}\`: ${line.slice(0, 80)}`);
  }
}
export function proposable({ accrual, ticks }) {
  const src = stripComments(accrual);
  const bad = [];
  const of = (name) => {
    const b = fnBody(src, name);
    escapes(b, 'delta', name, bad);
    return new Set([...literalKeys(b, 'delta', bad), ...assignedKeys(b, 'delta')]);
  };
  const combat = of('computeAccrual');
  const gather = of('accrueGather');
  const artisan = of('accrueArtisan');
  /* THE TICK LAYER rewrites a settled delta in place in two shapes —
     `it.args.p_delta.<key> = ` (tick-gather's progress coalesce) and a local
     copy's `delta.<key> = ` (tick-party's journal). Both keys are collected
     into every set (conservative: a party is combat). A bracket write on
     either is RED. foldDeltas, the only whole-delta builder there, throws on
     an unclassified key (KD). */
  for (const [file, text] of Object.entries(ticks)) {
    const t = stripComments(text);
    for (const k of [...assignedKeys(t, 'p_delta'), ...assignedKeys(t, 'delta')]) {
      combat.add(k); gather.add(k); artisan.add(k);
    }
    for (const m of t.matchAll(/\b(?:p_)?delta\s*\[[^\]]*\]\s*=(?!=)|Object\.assign\(\s*[A-Za-z_.]*\b(?:p_)?delta\b/g)) {
      bad.push(`${file}: a non-literal delta write: ${m[0].slice(0, 60)}`);
    }
  }
  return { combat, gather, artisan, all: new Set([...combat, ...gather, ...artisan]), bad };
}
/** foldDeltas' classification, read from tick-contract.js's own source. */
export function foldClassified(contract) {
  const out = new Set(['journal']);           // folded separately, by name, in foldDeltas
  for (const name of ['ADDITIVE_SCALAR', 'ADDITIVE_MAP', 'ABSOLUTE', 'APPEND', 'ABSOLUTE_MAP']) {
    const m = new RegExp(`export const ${name} = Object\\.freeze\\(\\[([^\\]]*)\\]\\)`).exec(contract);
    if (!m) throw Object.assign(new Error(`tick-contract.js: ${name} not found`), { harness: true });
    for (const q of m[1].matchAll(/'([a-z_]+)'/g)) out.add(q[1]);
  }
  if (!/if \(k === 'journal'\) continue;/.test(contract)) out.delete('journal');
  return out;
}
/** A PL/pgSQL `NAME constant text[] := array[…]` declaration's quoted words,
    comments stripped first (hr_apply's list carries prose with quotes and
    semicolons, so "every quoted word to the first semicolon" reads it wrong). */
export function sqlArray(def, name) {
  const code = def.replace(/--[^\n]*/g, '');
  const m = new RegExp(`${name}\\s+constant\\s+text\\[\\]\\s*:=\\s*array\\[([^\\]]*)\\]`).exec(code);
  if (!m) return null;
  return new Set([...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]));
}

// ── THE STATIC ARMS ─────────────────────────────────────────────────────────
function staticArms({ src, applyDef, settleDef, columns }) {
  const red = [];
  const fail = (id, msg) => red.push(`${id}: ${msg}`);
  const P = proposable(src);
  const fold = foldClassified(src.contract);
  const apply = sqlArray(applyDef, 'c_delta_keys');
  const ok = sqlArray(settleDef, 'c_delta_ok');
  const stamp = sqlArray(settleDef, 'c_stamp');
  if (!apply || !ok || !stamp) { fail('K0', 'an allowlist could not be read out of an installed body'); return { red, P }; }
  const need = { combat: ['gold', 'xp', 'items', 'hp', 'accrued_to', 'journal', 'fight', 'deaths', 'xp_frac', 'companion_xp_frac'],
                 gather: ['items', 'xp', 'xp_frac', 'tool_carry', 'progress'], artisan: ['items', 'xp', 'xp_frac'] };
  for (const [eng, keys] of Object.entries(need)) {
    const miss = keys.filter((k) => !P[eng].has(k));
    if (miss.length) fail('K0', `the ${eng} derivation found no ${miss.join(', ')} — the parser is blind, not the engine`);
  }
  for (const b of P.bad) fail('K0', `${b} — a key written that way cannot be derived; write it as delta.<key> = …`);
  /* KR (Security, 2026-10-13 #4): c_delta_ok is used in EXACTLY two places,
     its declaration and the key check. A body that reads a name out of it
     (`format('%I', c_delta_ok[n])`) is a writer the single-writer scan's
     carve-out would otherwise hide. */
  const code = settleDef.replace(/--[^\n]*/g, '');
  const refs = (code.match(/c_delta_ok/g) || []).length;
  if (refs !== 2 || !code.includes('k = any (c_delta_ok)') || !/c_delta_ok\s+constant\s+text\[\]\s*:=\s*array\[/.test(code)) {
    fail('KR', `c_delta_ok is referenced ${refs} time(s); it may appear only in its declaration and the key check`);
  }
  const live = (k) => !(k in DORMANT);
  const missA = [...P.all].filter((k) => live(k) && !apply.has(k));
  if (missA.length) fail('KA', `hr_apply's c_delta_keys does not accept ${missA.join(', ')} — every settle proposing it 409s unknown_delta_key`);
  const missB = [...P.combat].filter((k) => live(k) && !ok.has(k) && !stamp.has(k));
  if (missB.length) fail('KB', `hr_party_tick_settle's c_delta_ok does not accept ${missB.join(', ')} — every party window proposing it is refused whole`);
  if ([...stamp].sort().join() !== [...STAMPING_DELTA_KEYS].sort().join()) {
    fail('KB', `c_stamp {${[...stamp]}} is not STAMPING_DELTA_KEYS {${STAMPING_DELTA_KEYS}}`);
  }
  const extraC = [...ok].filter((k) => !apply.has(k));
  if (extraC.length) fail('KC', `c_delta_ok accepts ${extraC.join(', ')} which hr_apply refuses (S-1: shadow evidence for an unpayable payload)`);
  const missD = [...P.all].filter((k) => !fold.has(k));
  if (missD.length) fail('KD', `foldDeltas does not classify ${missD.join(', ')} — a tick fold throws on it`);
  for (const [k, { table, column }] of Object.entries(DORMANT)) {
    if (apply.has(k)) fail('KE', `${k} is listed DORMANT but hr_apply accepts it — take it off the dormant list`);
    if (columns.has(`${table}.${column}`)) fail('KE', `${table}.${column} exists, so the engine proposes ${k} — it is not dormant`);
  }
  return { red, P, sets: { apply, ok, stamp, fold } };
}

// ── THE DATABASE ARMS ───────────────────────────────────────────────────────
const ZERO = '00000000-0000-0000-0000-000000000000';
const HOLDER = 'guard:delta-key-allowlists';
let RUN = 0;

async function dbArms(db, { log = () => {} } = {}) {
  RUN += 1;
  const red = [];
  const q = async (sql, p) => (await db.query(sql, p)).rows;
  const one = async (sql, p) => (await q(sql, p))[0];
  const asEngine = async (sql, p) => {
    await db.exec('begin; set local role hr_engine;');
    try { return await one(sql, p); } finally { await db.exec('commit;'); }
  };
  const uid = (n) => `00000000-0000-4000-8000-${RUN.toString(16).padStart(4, '0')}0f13${n.toString(16).padStart(4, '0')}`;
  const [A, B, SA, SB] = [1, 2, 3, 4].map(uid);
  const cact = (await one("select activity_id from public.hr_activities where kind = 'combat' order by activity_id limit 1"))?.activity_id;
  if (!cact) throw Object.assign(new Error('no combat activity'), { harness: true });
  const cfg0 = await one('select enabled, channels, armed_channels from public.hr_tick_config where id');
  await db.exec("update public.hr_tick_config set enabled = true, channels = array['combat','gather','artisan'], armed_channels = array['combat'] where id");
  try {
    const nowMs = new Date((await one("select date_trunc('second', now()) t")).t).getTime();
    const mark = new Date(nowMs - 300000).toISOString();
    const to = new Date(nowMs - 210000).toISOString();
    const to2 = new Date(nowMs - 120000).toISOString();
    for (const u of [A, B, SA, SB]) {
      await q('insert into auth.users (id) values ($1) on conflict do nothing', [u]);
      await q(`insert into public.player_state (user_id, slot, gold, gems, hp, max_hp, version, accrued_to,
                 active_kind, active_id, active_since, consec_falls, companion_equipped)
               values ($1, 0, 500, 0, 10, 10, 1, $2, 'combat', $3, '2000-01-01 00:00:00+00', 0, 'fox')`, [u, mark, cact]);
      await q(`insert into public.player_skills (user_id, slot, skill_id, xp, xp_frac) values ($1, 0, 'attack', 40, 0.9)`, [u]);
    }
    const pid = (await one('insert into public.party (leader_user, leader_slot) values ($1, 0) returning id', [A])).id;
    await q(`insert into public.party_member (party_id, user_id, slot, role, joined_at)
             values ($1, $2, 0, 'leader', now() - interval '2 hours'), ($1, $3, 0, 'member', now() - interval '1 hour')`, [pid, A, B]);
    const hunt = (await one('insert into public.party_hunt (party_id, active_id, accrued_to) values ($1, $2, $3) returning id',
      [pid, cact, mark])).id;
    await q(`insert into public.party_tick_lease (party_id, owned, lease_holder, lease_until)
             values ($1, true, $2, now() + interval '30 minutes')
             on conflict (party_id) do update set owned = true, lease_holder = $2, lease_until = now() + interval '30 minutes'`,
      [pid, HOLDER]);
    const journal = () => ({ kind: 'combat', intent: 'accrue', meta: { src: 'tick', ticks: 1 } });
    /* Two DIFFERENT shares, as splitParty hands each member their own. */
    const dA = { gold: 9, accrued_to: to, xp: { attack: 7, strength: 3 }, xp_frac: { attack: 0.125, strength: 0.5 },
      progress: [{ kind: 'stat', key: 'companion_xp:fox', period: '', add: 2, state: 'active' }],
      companion_xp_frac: { fox: 0.5 }, journal: journal() };
    const dB = { gold: 4, accrued_to: to, xp: { attack: 3 }, xp_frac: { attack: 0.75 },
      progress: [{ kind: 'stat', key: 'companion_xp:fox', period: '', add: 1, state: 'active' }],
      companion_xp_frac: { fox: 0.25 }, journal: journal() };
    const withParty = (d, bp, toIso, version) => ({
      version,
      delta: Object.assign({}, d, { accrued_to: toIso, journal: Object.assign({}, d.journal, {
        meta: Object.assign({}, d.journal.meta, { party: { id: pid, hunt, dmg_bp: bp, xp_bp: bp, floor: 0, fellow_bp: 1500, roll: 7 } }) }) }),
    });
    const members = (toIso, vA, vB) => [Object.assign({ user: A, slot: 0 }, withParty(dA, 6000, toIso, vA)),
                                        Object.assign({ user: B, slot: 0 }, withParty(dB, 4000, toIso, vB))];
    const settle = (from, toIso, ms) => asEngine(`select public.hr_party_tick_settle($1, $2::uuid, $3::timestamptz,
        $4::timestamptz, gen_random_uuid(), $5::text::jsonb) as r`, [HOLDER, pid, from, toIso, JSON.stringify(ms)]);
    const snap = async (u) => (await one(`select jsonb_build_object(
        'gold', ps.gold,
        'skills', (select jsonb_object_agg(sk.skill_id, jsonb_build_array(sk.xp, sk.xp_frac::text))
                     from public.player_skills sk where sk.user_id = ps.user_id and sk.slot = 0),
        'pet', (select jsonb_build_array(pp.value, pp.xp_frac::text) from public.player_progress pp
                 where pp.user_id = ps.user_id and pp.slot = 0 and pp.kind = 'stat'
                   and pp.key = 'companion_xp:fox' and pp.period_key = '')) s
      from public.player_state ps where ps.user_id = $1 and ps.slot = 0`, [u])).s;

    // ── P ARMED
    const r = (await settle(mark, to, members(to, 1, 1))).r;
    if (!(r && r.ok === true && r.paid === true)) {
      red.push(`P: an armed party window carrying xp_frac + companion_xp_frac was refused: ${JSON.stringify(r)}`);
      return red;
    }
    const sa = (await asEngine('select public.hr_apply($1::uuid, 0, 1, gen_random_uuid(), $2::text::jsonb) as r', [SA, JSON.stringify(dA)])).r;
    const sb = (await asEngine('select public.hr_apply($1::uuid, 0, 1, gen_random_uuid(), $2::text::jsonb) as r', [SB, JSON.stringify(dB)])).r;
    if (!sa?.ok || !sb?.ok) throw Object.assign(new Error(`the solo twins were refused: ${JSON.stringify([sa, sb])}`), { harness: true });
    const [pa, pb, ta, tb] = await Promise.all([snap(A), snap(B), snap(SA), snap(SB)]);
    const want = {
      [A]: { gold: 509, skills: { attack: [47, '0.125'], strength: [3, '0.5'] }, pet: [2, '0.5'] },
      [B]: { gold: 504, skills: { attack: [43, '0.75'] }, pet: [1, '0.25'] },
    };
    const eq = (x, y) => JSON.stringify(x) === JSON.stringify(y);
    if (!eq(pa, ta) || !eq(pb, tb)) red.push(`P: a party member and their solo twin differ: party ${JSON.stringify([pa, pb])} solo ${JSON.stringify([ta, tb])}`);
    const norm = (s) => ({ gold: Number(s.gold), skills: Object.fromEntries(Object.entries(s.skills).sort()
      .map(([k, v]) => [k, [Number(v[0]), String(Number(v[1]))]])), pet: [Number(s.pet[0]), String(Number(s.pet[1]))] });
    if (!eq(norm(pa), want[A]) || !eq(norm(pb), want[B])) {
      red.push(`P: the party credit is not the proposed one: ${JSON.stringify([norm(pa), norm(pb)])}`);
    }
    if (!red.length) log('  ✓ P — an armed two-member window carrying both remainder keys paid each member exactly what a solo hr_apply of the same delta paid their twin, and what was proposed');

    // ── PS SHADOW
    await db.exec("update public.hr_tick_config set armed_channels = '{}' where id");
    const vers = Object.fromEntries((await q('select user_id, version from public.player_state where user_id = any($1::uuid[])', [[A, B]]))
      .map((x) => [x.user_id, Number(x.version)]));
    const l0 = Number((await one('select count(*)::int n from public.player_ledger where user_id = any($1::uuid[])', [[A, B]])).n);
    const rs = (await settle(to, to2, members(to2, vers[A], vers[B]))).r;
    const l1 = Number((await one('select count(*)::int n from public.player_ledger where user_id = any($1::uuid[])', [[A, B]])).n);
    if (!(rs && rs.ok === true && rs.mode === 'shadow' && rs.journalled === 2 && l1 === l0)) {
      red.push(`PS: a SHADOW window carrying both remainder keys was not accepted, journalled and unpaid: ${JSON.stringify(rs)} ledger ${l0}->${l1}`);
    } else log('  ✓ PS — the same keys in SHADOW: accepted, journalled for both members, nothing paid');
  } finally {
    await q('update public.hr_tick_config set enabled = $1, channels = $2, armed_channels = $3 where id',
      [cfg0.enabled, cfg0.channels, cfg0.armed_channels]);
  }
  return red;
}

/** The narrowed single-writer scan, cut out of each frac file's §4(b). */
async function scanArm(db, fracSql) {
  const red = [];
  const preds = fracSql.map((s) => {
    const m = /select string_agg\(distinct p\.proname[\s\S]*?and p\.proname not in \('hr_apply', 'hr_state_of'\);/.exec(s);
    return m && m[0].replace(/ into v_names/, '');
  });
  if (preds.some((p) => !p)) { red.push('KW: a frac file\'s single-writer scan could not be found'); return red; }
  if (preds[0] !== preds[1]) red.push('KW: the two frac files\' single-writer scans are no longer the same predicate');
  const scan = async () => (await db.query(preds[0].replace(/;$/, ''))).rows[0].string_agg;
  if ((await scan()) !== null) red.push(`KW: on the chain the scan names ${await scan()}`);
  await db.exec("create function public.zz_frac_probe() returns int language sql as $f$ select 1 /* xp_frac */ $f$;");
  const planted = await scan();
  await db.exec('drop function public.zz_frac_probe();');
  if (planted !== 'zz_frac_probe') red.push(`KW: a planted body naming xp_frac was not caught (${planted})`);
  const def = (await db.query(`select pg_get_functiondef('${SETTLE_SIG}'::regprocedure) d`)).rows[0].d;
  const bent = def.replace("  v_role     text;", "  v_role     text; -- xp_frac");
  if (bent === def) { red.push('KW: harness anchor v_role missing'); return red; }
  await db.exec(bent);
  const outside = await scan();
  await db.exec(def);
  if (outside !== 'hr_party_tick_settle') red.push(`KW: a party settle naming xp_frac OUTSIDE its allowlist was not caught (${outside})`);
  /* Security 2026-10-13 #4: a writer that never SPELLS the key but reads it
     out of the allowlist. The carve-out must not hold for that body. */
  const dyn = def.replace("  v_role     text;", "  v_role     text; v_dyn_scan text := format('%I', c_delta_ok[14]);");
  await db.exec(dyn);
  const dynamic = await scan();
  await db.exec(def);
  if (dynamic !== 'hr_party_tick_settle') red.push(`KW: a party settle reading a name out of c_delta_ok (format %I) was not caught (${dynamic})`);
  return red;
}

async function readSources() {
  return {
    accrual: await readText(`${FN}/accrual.js`),
    ticks: Object.fromEntries(await Promise.all(
      (await readdir(join(ROOT, FN))).filter((f) => /^tick.*\.js$/.test(f)).sort()
        .map(async (f) => [f, await readText(`${FN}/${f}`)]))),
    contract: await readText(`${FN}/tick-contract.js`),
  };
}
async function installed(db) {
  const d = async (sig) => (await db.query(`select pg_get_functiondef('${sig}'::regprocedure) d`)).rows[0].d.replace(/\r/g, '');
  const cols = new Set((await db.query(`select table_name || '.' || column_name c from information_schema.columns
                                         where table_schema = 'public'`)).rows.map((r) => r.c));
  return { applyDef: await d(APPLY_SIG), settleDef: await d(SETTLE_SIG), columns: cols };
}
function fnSource(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  const as = sql.indexOf('\nas $$', start);
  const end = sql.indexOf('$$;', as + 6);
  if (start < 0 || as < 0 || end < 0) throw Object.assign(new Error(`${name} not found`), { harness: true });
  return sql.slice(start, end + 3);
}
const settleMd5 = async (db) => (await db.query(
  `select md5(replace(prosrc, chr(13), '')) m from pg_proc where oid = '${SETTLE_SIG}'::regprocedure`)).rows[0].m;

async function everything(db, src, fracSql, { log = () => {} } = {}) {
  const st = staticArms(Object.assign({ src }, await installed(db)));
  const red = [...st.red];
  if (!st.red.length) {
    log(`  ✓ K0 — derived: combat {${[...st.P.combat].sort()}}; gather+artisan add {${[...st.P.all].filter((k) => !st.P.combat.has(k)).sort()}}`);
    log('  ✓ KA/KB/KC/KD/KE — hr_apply, the party settle (c_delta_ok + c_stamp), and foldDeltas cover every proposable key; c_delta_ok ⊆ hr_apply; ammo_carry is dormant (no column, no hr_apply key)');
  }
  red.push(...await scanArm(db, fracSql));
  red.push(...await dbArms(db, { log }));
  return red;
}

async function main() {
  const src = await readSources();
  const fracSql = await Promise.all(FRAC_FILES.map((f) => readText(`supabase/migrations/${f}`)));
  const migSql = await readText(`supabase/migrations/${MIG}`);
  const preSettle = fnSource(await readText(`supabase/migrations/${MIG_PRE}`), 'hr_party_tick_settle');
  let db;
  try {
    const r = await bootReplay({});
    if (r.failures && r.failures.length) throw Object.assign(new Error(`the chain does not replay: ${r.failures.map((f) => f.file).join(', ')}`), { harness: true });
    db = r.db;
  } catch (e) { console.error(`harness: ${e.message}`); process.exit(2); }

  if (!MUTATE) {
    console.log('\ndelta-key-allowlists: every allowlist covers every key the engine can propose');
    const red = await everything(db, src, fracSql, { log: (s) => console.log(s) });
    // PI
    const m0 = await settleMd5(db);
    try { await db.exec(migSql); } catch (e) { red.push(`PI: a re-apply RAISED: ${String(e.message).split('\n')[0]}`); }
    if ((await settleMd5(db)) !== m0) red.push('PI: a re-apply moved the body');
    else console.log(`  ✓ PI — ${MIG} re-applied byte-identically (§0 accepted its own body, §4 passed twice)`);
    // P0 CONTROL: the pre-fix body.
    await db.exec(preSettle);
    const pre = await dbArms(db);
    await db.exec(migSql);
    if (!pre.some((x) => x.startsWith('P:') && x.includes('unknown_delta_key'))) {
      red.push(`P0: with party-drop's body P was not refused unknown_delta_key (${pre.join(' | ') || 'green'}) — the arm cannot see the bug`);
    } else console.log('  ✓ P0 — CONTROL: with the pre-fix body the same window is refused unknown_delta_key (the regression, reproduced)');
    for (const x of red) console.log(`  ✗ ${x}`);
    await db.close();
    console.log(red.length ? `\nRED (${red.length})` : '\nGREEN: no delta-key allowlist can lag the engine again without this going red');
    process.exit(red.length ? 1 : 0);
  }

  console.log('\ndelta-key-allowlists --mutate: every mutant must turn its named arm red');
  const control = await everything(db, src, fracSql);
  if (control.length) { console.error(`harness: the unmutated control is red (${control.join(' | ')})`); process.exit(2); }
  const settleDef = (await installed(db)).settleDef;
  const applyDef = (await installed(db)).applyDef;
  const bodyMutant = (def, from, to) => async () => {
    if (def.split(from).length !== 2) throw Object.assign(new Error(`anchor matched ${def.split(from).length - 1}x: ${from}`), { harness: true });
    await db.exec(def.replace(from, () => to));
    return async () => { await db.exec(def); };
  };
  const MUTANTS = [
    { name: 'party allowlist lacks xp_frac', arms: /^(KB|P):/,
      plant: bodyMutant(settleDef, "'xp_frac','companion_xp_frac'];", "'companion_xp_frac'];") },
    { name: 'party allowlist lacks companion_xp_frac', arms: /^(KB|P):/,
      plant: bodyMutant(settleDef, "'xp_frac','companion_xp_frac'];", "'xp_frac'];") },
    { name: 'party allowlist accepts a key hr_apply refuses', arms: /^KC:/,
      plant: bodyMutant(settleDef, "'xp_frac','companion_xp_frac'];", "'xp_frac','companion_xp_frac','wealth'];") },
    { name: 'hr_apply allowlist lacks companion_xp_frac', arms: /^KA:/,
      plant: bodyMutant(applyDef, "    'companion_xp_frac',\n", '') },
    { name: 'a NEW combat key the allowlists do not know', arms: /^(KA|KB|KD):/,
      src: { accrual: src.accrual.replace('  if (goldDelta > 0) delta.gold = goldDelta;', '  if (goldDelta > 0) delta.gold = goldDelta;\n  delta.zz_new_key = 1;') } },
    /* Security 2026-10-13 #5: every way to write a key the source does not spell. */
    ...[
      ['a bracket write', "  delta['zz' + 'k'] = 1;"],
      ['Object.assign onto the delta', '  Object.assign(delta, { zz_key: 1 });'],
      ['a helper handed the delta', '  addExtras(delta);'],
      ['an alias of the delta', '  const d2 = delta; d2.zz_key = 1;'],
      ['the delta reassigned', '  delta = Object.assign({}, delta, extras);'],
    ].map(([what, line]) => ({ name: `non-literal key write: ${what}`, arms: /^K0:/,
      src: { accrual: src.accrual.replace('  if (goldDelta > 0) delta.gold = goldDelta;', `  if (goldDelta > 0) delta.gold = goldDelta;\n${line}`) } })),
    { name: 'non-literal key write: a computed key in the literal', arms: /^K0:/,
      src: { accrual: src.accrual.replace('  const delta = {\n', "  const delta = {\n    ['zz' + 'k']: 1,\n") } },
    { name: 'non-literal key write: a spread in the literal', arms: /^K0:/,
      src: { accrual: src.accrual.replace('  const delta = {\n', '  const delta = {\n    ...extras,\n') } },
    { name: 'non-literal key write: a bracket write in the tick layer', arms: /^K0:/,
      src: { ticks: Object.assign({}, src.ticks, { 'tick-gather.js': src.ticks['tick-gather.js'].replace(
        '    it.args.p_delta.progress = coalesceProgress(it.args.p_delta.progress);',
        "    it.args.p_delta.progress = coalesceProgress(it.args.p_delta.progress);\n    it.args.p_delta['zz'] = 1;") }) } },
    { name: 'a party settle reads a name out of c_delta_ok (format %I)', arms: /^(KR|KW):/,
      plant: bodyMutant(settleDef, '  v_role     text;', "  v_role     text; v_dyn text := format('%I', c_delta_ok[14]);") },
    { name: 'foldDeltas stops classifying companion_xp_frac', arms: /^KD:/,
      src: { contract: src.contract.replace("export const ABSOLUTE_MAP = Object.freeze(['xp_frac', 'companion_xp_frac']);", "export const ABSOLUTE_MAP = Object.freeze(['xp_frac']);") } },
    { name: 'a dormant key\'s column appears', arms: /^KE:/,
      plant: async () => { await db.exec('alter table public.player_state add column ammo_carry numeric'); return async () => { await db.exec('alter table public.player_state drop column ammo_carry'); }; } },
    { name: 'the single-writer scan is narrowed to nothing', arms: /^KW:/,
      frac: fracSql.map((s) => s.replace("then regexp_replace(p.prosrc, 'c_delta_ok\\s+constant\\s+text\\[\\]\\s*:=\\s*array\\[[^]]*\\];', '')", "then ''")) },
  ];
  let survived = 0;
  for (const m of MUTANTS) {
    const s2 = Object.assign({}, src, m.src || {});
    if (m.src && Object.keys(m.src).some((k) => m.src[k] === src[k])) { console.error(`harness: ${m.name}: source anchor missed`); process.exit(2); }
    if (m.frac && m.frac.every((t, i) => t === fracSql[i])) { console.error(`harness: ${m.name}: scan anchor missed`); process.exit(2); }
    let undo = null; let red;
    try {
      if (m.plant) undo = await m.plant();
      red = await everything(db, s2, m.frac || fracSql);
    } catch (e) { if (e.harness) { console.error(`harness: ${m.name}: ${e.message}`); process.exit(2); } red = [`threw: ${e.message}`]; }
    finally { try { await db.exec('rollback;'); } catch { /* no open transaction */ } if (undo) await undo(); }
    const hit = red.some((x) => m.arms.test(x));
    if (hit) console.log(`  ✓ ${m.name}: RED via ${red.filter((x) => m.arms.test(x)).map((x) => x.split(':')[0]).join(', ')}`);
    else { survived++; console.log(`  ✗ ${m.name}: ${red.length ? `red only via ${red.join(' | ')}` : 'SURVIVED'}`); }
  }
  const after = await everything(db, src, fracSql);
  if (after.length) { console.error(`harness: the restored chain is red (${after.join(' | ')})`); process.exit(2); }
  await db.close();
  console.log(survived ? `\n${survived} mutant(s) survived` : `\nall ${MUTANTS.length} mutants red on their named arm`);
  process.exit(survived ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
