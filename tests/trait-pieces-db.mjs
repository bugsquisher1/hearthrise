#!/usr/bin/env node
// tests/trait-pieces-db.mjs — THE TRAIT PIECE IS THE SERVER'S: WHAT A HERO WEARS, WHAT ITS KILLS ROLL, BOTH PATHS (1071-trait-pieces.sql,
// lane/t1-traits-drop, backend-architect, 2026-11-26; 20-v030-the-roads.md T1, CLAUDE.md §1, §4 both paths, §6).
//
//   node tests/trait-pieces-db.mjs            the guard
//   node tests/trait-pieces-db.mjs --mutate   the proof: each planted SQL or edge defect turns its case red
//
// THE MEASURE: the replayed chain (PGlite), the shipped world tick (browser closed, the `fire` door) and the viewed hello (hunt viewed,
// the `viewed` door) through tools/settle-cost.mjs, the real engine, a Level 60 four of steel on Muster Barrows on Steady (danger-db's).
//   TP-1 DARK: with the switches as applied (off) the read hands no worn piece, no pity and no roll, the edge proposes no `traits`, and a
//        settled hunt writes no piece, no pity and no Trait journal row; a commit that carries `traits` anyway is refused traits_dark.
//   TP-2 THE ROLL, BOTH PATHS: with trait_drops lit, on an edge whose Rare hours are planted short (the server cannot re-prove an hour, so
//        the guard plants the rate and proves the bounds), the closed and the viewed hunt from one anchor store the SAME pieces for the
//        same seats (base, Traits, step, depth, the kill, its instant) and the same pity; every piece is a Muster cell's at rank I (its
//        entry Level opens rank I only), its base a Muster piece of its slot at item Level 60, its depth the server's reading of its step,
//        its session the hero's; one `trait` journal row a piece; more than one hero found (personal loot); the read hands each hero the
//        pity the server holds; the viewer's answers name every piece its kills made (the drop moment); the `pieces` section lists them
//        with their session (the return card's line).
//   TP-3 THE WORN PIECE, BOTH PATHS: with trait_pieces lit, the leader wears a First Rank III piece on its steel body: the read and the
//        plan hand it to that hero alone, the viewer's live start point carries it, the closed and the viewed hunt store the same world,
//        and the world differs from the same four with the switch off (the Trait played); a base that left its slot plays nothing.
//   TP-4 THE BOUNDS, THROUGH THE REAL COMMIT: a found piece the edge proposes, tampered (a rank over the ground's, a base off the ground's,
//        more pieces than kills, a pity past the kills), refuses the whole settle with its code and lands nothing; the untampered proposal
//        then lands and answers what it found.
//
// mutant-anchors: supabase/migrations/1071-trait-pieces.sql supabase/functions/hr-accrue/hunt-settle.js
// ci-step: db-replay | Trait pieces - the worn projection and the settle's Trait roll, both paths, the bounds through the real commit (1071)
// ci-run: node tools/gen-trait-pieces.mjs --check
// ci-run: node tools/mutant-gate.mjs node tools/gen-trait-pieces.mjs --selftest
// ci-run: node tests/trait-pieces-db.mjs
// ci-run: node tools/mutant-gate.mjs node tests/trait-pieces-db.mjs --mutate
import { isMain } from './_is-main.mjs';
import { bootReplay } from './schema-replay.mjs';
import { prepare } from '../tools/settle-cost.mjs';
import { plant } from './hunt-core/fixtures/h1.js';
import { decodeStored } from '../src/core/hunt/world-state.js';

const MUSTER = 'muster_barrows';
const ANCHOR = Date.UTC(2026, 10, 1, 12, 0, 0);
const HELD = 20;
const WINDOWS = 4;
const GEAR = Object.freeze({ helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots', weapon: 'steel_sword', shield: 'coppercap_shield' });
const FLAGS = ['trait_pieces', 'signatures', 'trait_drops'];
const idem = () => crypto.randomUUID();
const one = async (db, sql, params) => { const r = await db.query(sql, params); const row = r.rows[0]; return row ? row[Object.keys(row)[0]] : null; };
const exec = (db) => async (text, params) => { await db.exec('set role hr_engine'); try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); } };

/* THE PLANTED RATE: a Rare every 0.005 hunted hours, a Very Rare every 0.05 (src/data/drop-hours.js says 40 and 400), so four short windows
   find pieces. `more`: a mutant's own edge edits on the same plant. */
function fastEdge(more = []) {
  return plant([
    ['src/data/drop-hours.js', 'rare: Object.freeze({ everyHours: 40, band', 'rare: Object.freeze({ everyHours: 0.005, band'],
    ['src/data/drop-hours.js', 'very_rare: Object.freeze({ everyHours: 400, band', 'very_rare: Object.freeze({ everyHours: 0.05, band'],
    ...more], ['supabase/functions/hr-accrue']);
}

/* the plan and held steps (danger-db's planWith), the switches, and `wear`: a piece the leader wears */
const fixture = ({ flags = [], wear = null }) => async ({ db, uids, asUser, one: q, idem: id }) => {
  for (const uid of uids) {
    await db.query('insert into public.hunt_density (user_id, slot, hunt_id, density, danger_held) values ($1, 0, $2, 0, $3) on conflict (user_id, slot, hunt_id) do update set danger_held = excluded.danger_held', [uid, MUSTER, HELD]);
  }
  await asUser(uids[0]);
  const r = await q(db, 'select public.hr_hunt_risk_set(0, $1, $2::uuid)', ['steady', id()]);
  if (!r || r.ok !== true) throw new Error('the stance was refused: ' + JSON.stringify(r).slice(0, 200));
  await db.query('update public.hr_flags set enabled = (key = any ($1::text[])) where key = any ($2::text[])', [flags, FLAGS]);
  if (wear) {
    await db.query(`insert into public.trait_pieces (user_id, found_slot, base, slot, item_level, rarity, traits, hunt_id, step, depth, instance_id, kill_unit, at_ms,
                      worn_slot, worn_equip_slot, worn_at) values ($1, 0, $2, $3, 60, 'rare', $4::jsonb, $5, 600, 3, gen_random_uuid(), 1, 1, 0, $3, now())`,
      [uids[0], wear.base, wear.slot, JSON.stringify(wear.traits), MUSTER]);
  }
};

const trace = (...a) => { if (process.env.TP_TRACE) console.log('  .', new Date().toISOString().slice(11, 19), ...a); };
/* what each case measured, printed under the verdict (evidence, not only a green word) */
const EVIDENCE = [];
async function door(db, which, o = {}) {
  trace(which, 'prepare');
  const run = await prepare({ heroes: 4, windows: WINDOWS, hunt: MUSTER, door: which, db, level: 60, anchorMs: ANCHOR, gear: GEAR,
    edgeRoot: o.edgeRoot, beforeEnter: fixture(o) });
  trace(which, 'warm');
  await run.warm();
  for (let w = 2; w <= WINDOWS + 1; w++) { trace(which, 'window', w); await run.step(w); }
  const inst = (await db.query('select id, refusals, world::text as world from public.hunt_instances where hunt_id = $1', [MUSTER])).rows[0];
  return { run, db, inst, users: run.users, sessions: run.sessions, evidence: which === 'viewed' ? await run.evidence() : null };
}

const piecesOf = async (db) => (await db.query(`select s.seat, p.id, p.user_id, p.rarity, p.slot, p.base, p.traits, p.signature, p.step, p.depth, p.kill_unit,
      p.at_ms::text as at_ms, p.item_level, p.hunt_id, p.found_slot, (p.session_id = s.id) as own_session,
      public.hr_piece_depth_of(p.hunt_id, p.step) as server_depth,
      exists (select 1 from public.hr_piece_bases b where b.hunt_id = p.hunt_id and b.slot = p.slot and b.item_id = p.base) as known_base,
      exists (select 1 from public.hr_piece_traits t where t.trait_id = p.traits->0->>'id' and t.source = p.hunt_id and t.slot = p.slot) as home_trait
    from public.trait_pieces p join public.hunt_sessions s on s.user_id = p.user_id and s.slot = p.found_slot and s.hunt_id = $1
    order by s.seat, p.at_ms, p.kill_unit`, [MUSTER])).rows;
const pityOf = async (db) => (await db.query(`select s.seat, h.rarity, h.misses::text as misses from public.hero_pity h
    join public.hunt_sessions s on s.user_id = h.user_id and s.slot = h.slot and s.hunt_id = $1 order by s.seat, h.rarity`, [MUSTER])).rows;
const canon = (rows) => JSON.stringify(rows.map((p) => [p.seat, p.rarity, p.slot, p.base, p.traits, p.step, p.depth, p.kill_unit, p.at_ms]));

async function dark(boot) {
  const problems = [];
  const r = await door((await boot()).db, 'fire', {});
  if (Number(r.inst.refusals) !== 0) problems.push('TP-1 ' + r.inst.refusals + ' window(s) refused');
  const read = await one(r.db, 'select public.hr_hunt_instance_read($1::uuid, 0)', [r.users[0]]);
  if (!read || read.open !== true) return [...problems, 'TP-1 CONTROL: the hunt is not open (' + JSON.stringify(read).slice(0, 120) + ')'];
  if (read.instance.trait_drops !== false) problems.push('TP-1 the read says trait_drops ' + JSON.stringify(read.instance.trait_drops));
  for (const m of read.members) if (m.worn_traits !== null || m.worn_signature !== null || m.drops !== null) problems.push('TP-1 a dark read hands ' + JSON.stringify({ t: m.worn_traits, s: m.worn_signature, d: m.drops }));
  const counts = (await r.db.query(`select (select count(*) from public.trait_pieces)::int as pieces, (select count(*) from public.hero_pity)::int as pity,
      (select count(*) from public.player_ledger where kind = 'trait')::int as journal`)).rows[0];
  if (counts.pieces || counts.pity || counts.journal) problems.push('TP-1 a dark hunt wrote ' + JSON.stringify(counts));
  /* the edge proposes no traits on a dark read, and a commit that carries them is refused */
  const M = await (await import('./hunt-sessions-settle.mjs')).HARNESS.loadEdge((await import('./hunt-sessions-settle.mjs')).HARNESS.ROOT);
  const nowMs = Number(await one(r.db, 'select floor(extract(epoch from now()) * 1000)::bigint'));
  const plan = await M.HS.readHuntSettle({ exec: exec(r.db), user: r.users[0], slot: 0, atMs: nowMs }, 'tick');
  if (plan.answer) return [...problems, 'TP-1 CONTROL: no window to propose (' + plan.answer.reason + ')'];
  const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
  if (!p.commit) return [...problems, 'TP-1 CONTROL: nothing proposed (' + p.out.reason + ')'];
  if (p.commit.members.some((m) => 'traits' in m)) problems.push('TP-1 the edge proposed traits on a dark read');
  const forged = { ...p.commit, members: p.commit.members.map((m, i) => (i ? m : { ...m, traits: { found: [], pity: { rare: 0 } } })) };
  const res = await M.HS.commitHuntSettle(exec(r.db), { ...forged, project: null });
  if (!res || res.ok !== false || res.error !== 'traits_dark') problems.push('TP-1 a dark commit carrying traits answered ' + JSON.stringify(res).slice(0, 160));
  return problems;
}

async function roll(boot, o = {}) {
  const problems = [];
  const edge = fastEdge(o.edits || []);
  try {
    const closed = await door((await boot()).db, 'fire', { flags: ['trait_drops', 'trait_pieces'], edgeRoot: edge.root });
    const viewed = await door((await boot()).db, 'viewed', { flags: ['trait_drops', 'trait_pieces'], edgeRoot: edge.root });
    for (const [name, r] of [['browser closed', closed], ['hunt viewed', viewed]]) if (Number(r.inst.refusals) !== 0) problems.push('TP-2 ' + name + ': ' + r.inst.refusals + ' window(s) refused');
    const a = await piecesOf(closed.db), b = await piecesOf(viewed.db);
    if (a.length < 3) problems.push('TP-2 CONTROL: the closed hunt found ' + a.length + ' pieces on the planted hours');
    EVIDENCE.push('TP-2 ' + a.length + ' pieces (' + a.filter((p) => p.rarity === 'very_rare').length + ' Very Rare) on seats ' + [...new Set(a.map((p) => p.seat))].join('/') + ', ' + new Set(a.map((p) => p.base)).size + ' bases, both doors ' + (canon(a) === canon(b) ? 'identical' : 'DIFFER'));
    if (new Set(a.map((p) => p.seat)).size < 2) problems.push('TP-2 personal loot: only seat(s) ' + [...new Set(a.map((p) => p.seat))].join(',') + ' found anything');
    if (canon(a) !== canon(b)) problems.push('TP-2 the doors stored different pieces:\n      closed ' + canon(a).slice(0, 300) + '\n      viewed ' + canon(b).slice(0, 300));
    const pa = await pityOf(closed.db), pb = await pityOf(viewed.db);
    if (JSON.stringify(pa) !== JSON.stringify(pb)) problems.push('TP-2 the doors stored different pity: ' + JSON.stringify(pa) + ' / ' + JSON.stringify(pb));
    if (!pa.some((x) => Number(x.misses) > 0)) problems.push('TP-2 CONTROL: no hero holds a missed roll (' + JSON.stringify(pa) + ')');
    for (const p of a) {
      const bad = [p.hunt_id !== MUSTER && 'ground', p.item_level !== 60 && 'item Level', !p.known_base && 'base', !p.home_trait && 'first Trait',
        p.traits.some((t) => t.rank !== 1) && 'rank', p.depth !== p.server_depth && 'depth', !p.own_session && 'session', p.found_slot !== 0 && 'hero',
        p.traits.length !== (p.rarity === 'rare' ? 1 : 2) && 'Trait count'].filter(Boolean);
      if (bad.length) { problems.push('TP-2 a piece breaks its ' + bad.join(', ') + ': ' + JSON.stringify(p)); break; }
    }
    const journal = (await closed.db.query(`select meta->>'piece' as piece from public.player_ledger where kind = 'trait' and intent = 'trait_piece'`)).rows.map((x) => x.piece).sort();
    if (JSON.stringify(journal) !== JSON.stringify(a.map((p) => p.id).sort())) problems.push('TP-2 the journal names ' + journal.length + ' pieces, the table holds ' + a.length);
    /* the read hands each hero the pity the server holds */
    const read = await one(closed.db, 'select public.hr_hunt_instance_read($1::uuid, 0)', [closed.users[0]]);
    const seatOf = new Map((await closed.db.query('select user_id, seat from public.hunt_sessions where hunt_id = $1', [MUSTER])).rows.map((x) => [x.user_id, x.seat]));
    for (const m of (read && read.members) || []) {
      const held = Object.fromEntries(pa.filter((x) => x.seat === seatOf.get(m.user)).map((x) => [x.rarity, Number(x.misses)]));
      for (const rar of ['rare', 'very_rare']) if (((m.drops || {}).pity || {})[rar] !== (held[rar] || 0)) { problems.push('TP-2 the read hands seat ' + seatOf.get(m.user) + ' pity ' + JSON.stringify(m.drops) + ', the server holds ' + JSON.stringify(held)); break; }
    }
    if (read && read.instance.trait_drops !== true) problems.push('TP-2 a lit read says trait_drops ' + JSON.stringify(read.instance.trait_drops));
    /* the drop moment: the viewer's answers name every piece its kills made in the measured windows */
    const viewerPieces = b.filter((p) => p.user_id === viewed.users[0]);
    const named = new Set((viewed.evidence.answers || []).flatMap((x) => ((x.hunt_settle && x.hunt_settle.found) || []).map((f) => f.id)));
    const warmIds = new Set((await viewed.db.query(`select p.id from public.trait_pieces p where p.at_ms < $1`, [viewed.run.fromMs + 90000])).rows.map((x) => x.id));
    const owed = viewerPieces.filter((p) => !warmIds.has(p.id));
    if (owed.some((p) => !named.has(p.id))) problems.push('TP-2 the viewer\'s answers named ' + named.size + ' of its ' + owed.length + ' pieces');
    /* the return card: the section lists the account's pieces with their session */
    const sec = (await one(viewed.db, 'select public.hr_state_of($1::uuid, 0)', [viewed.users[0]])).pieces;
    if (!sec || !Array.isArray(sec.pieces) || sec.pieces.length !== viewerPieces.length
        || sec.pieces.some((x) => x.session !== viewed.sessions[0] || !viewerPieces.some((p) => p.id === x.id))) {
      problems.push('TP-2 the pieces section reads ' + JSON.stringify(sec).slice(0, 200) + ' for ' + viewerPieces.length + ' pieces');
    }
  } finally { edge.done(); }
  return problems;
}

async function worn(boot) {
  const problems = [];
  const wear = { base: GEAR.body, slot: 'body', traits: [{ id: 'first_rank', rank: 3 }] };
  const closed = await door((await boot()).db, 'fire', { flags: ['trait_pieces'], wear });
  const viewed = await door((await boot()).db, 'viewed', { flags: ['trait_pieces'], wear });
  const off = await door((await boot()).db, 'fire', { flags: [], wear });
  for (const [name, r] of [['browser closed', closed], ['hunt viewed', viewed], ['switch off', off]]) if (Number(r.inst.refusals) !== 0) problems.push('TP-3 ' + name + ': ' + r.inst.refusals + ' window(s) refused');
  const read = await one(closed.db, 'select public.hr_hunt_instance_read($1::uuid, 0)', [closed.users[0]]);
  for (const m of (read && read.members) || []) {
    const want = m.user === closed.users[0] ? JSON.stringify(wear.traits) : 'null';
    if (JSON.stringify(m.worn_traits) !== want) problems.push('TP-3 the read hands ' + (m.user === closed.users[0] ? 'the wearer' : 'another hero') + ' ' + JSON.stringify(m.worn_traits));
  }
  if (!read || read.members.length !== 4) problems.push('TP-3 CONTROL: the read holds ' + (read && read.members.length) + ' members');
  /* the plan hands it to that hero alone; the viewer's live start point carries it */
  const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
  const M = await H.loadEdge(H.ROOT);
  const nowMs = Number(await one(closed.db, 'select floor(extract(epoch from now()) * 1000)::bigint'));
  const plan = await M.HS.readHuntSettle({ exec: exec(closed.db), user: closed.users[0], slot: 0, atMs: nowMs }, 'tick');
  if (plan.answer) problems.push('TP-3 CONTROL: no plan (' + plan.answer.reason + ')');
  else for (const m of plan.members) {
    const got = JSON.stringify(m.hero.wornTraits || null), want = m.user === closed.users[0] ? JSON.stringify(wear.traits) : 'null';
    if (got !== want) problems.push('TP-3 the plan hands ' + m.key + ' ' + got);
  }
  const live = (viewed.evidence.answers || []).map((x) => x.hunt_live).find(Boolean);
  const self = live && live.members.find((m) => m.self);
  if (!self || JSON.stringify(self.hero && self.hero.wornTraits) !== JSON.stringify(wear.traits)) problems.push('TP-3 the viewer\'s live start point carries ' + JSON.stringify(self && self.hero && self.hero.wornTraits));
  if (closed.inst.world !== viewed.inst.world) problems.push('TP-3 the two doors stored different worlds');
  if (closed.inst.world === off.inst.world) problems.push('TP-3 the worn Trait changed nothing: the lit hunt stored the dark hunt\'s world');
  EVIDENCE.push('TP-3 worn First Rank III: doors ' + (closed.inst.world === viewed.inst.world ? 'store one world' : 'DIFFER') + ', ' + (closed.inst.world === off.inst.world ? 'SAME' : 'a different') + ' world from the switch off');
  const w = closed.inst.world ? decodeStored(JSON.parse(closed.inst.world)) : null;
  if (!w || !w.risk) problems.push('TP-3 CONTROL: the stored world is not on the scale');
  /* a base that left its slot plays nothing */
  await closed.db.query(`update public.player_equipment set item_id = (select min(i.item_id) from public.hr_item_slots i where i.equip_slot = 'body' and i.item_id <> $2)
                          where user_id = $1 and slot = 0 and equip_slot = 'body'`, [closed.users[0], GEAR.body]);
  if ((await one(closed.db, 'select public.hr_worn_traits_of($1::uuid, 0)', [closed.users[0]])) !== null) problems.push('TP-3 a piece whose base left its slot still plays');
  return problems;
}

async function bounds(boot) {
  const problems = [];
  const edge = fastEdge();
  try {
    const { db } = await boot();
    const run = await prepare({ heroes: 4, windows: 12, hunt: MUSTER, door: 'pieces', db, level: 60, anchorMs: ANCHOR, gear: GEAR, edgeRoot: edge.root,
      beforeEnter: fixture({ flags: ['trait_drops', 'trait_pieces'] }) });
    const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
    const M = await H.loadEdge(edge.root);
    const ex = exec(db);
    let found = null;
    for (let w = 1; w <= 12 && !found; w++) {
      const plan = await M.HS.readHuntSettle({ exec: ex, user: run.users[0], slot: 0, atMs: run.fromMs + w * 90000 }, 'tick');
      if (plan.answer) return ['TP-4 CONTROL: window ' + w + ' skipped (' + plan.answer.reason + ')'];
      const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
      const i = p.commit.members.findIndex((m) => m.traits && m.traits.found.length);
      if (i >= 0) { found = { p, i }; break; }
      const res = await M.HS.commitHuntSettle(ex, { ...p.commit, project: null });
      if (!res || res.ok !== true) return ['TP-4 CONTROL: window ' + w + ' refused ' + JSON.stringify(res).slice(0, 160)];
    }
    if (!found) return ['TP-4 CONTROL: no proposal found a piece in 12 windows'];
    const before = Number(await one(db, 'select count(*) from public.trait_pieces'));
    EVIDENCE.push('TP-4 a proposal of ' + found.p.commit.members[found.i].traits.found.length + ' piece(s) tampered four ways');
    const tamper = (fn) => ({ ...found.p.commit, project: null, members: found.p.commit.members.map((m, j) => (j === found.i ? fn(JSON.parse(JSON.stringify(m))) : m)) });
    for (const [want, fn] of [
      ['piece_rank', (m) => { m.traits.found[0].traits[0].rank = 2; return m; }],
      ['piece_base', (m) => { m.traits.found[0].base = 'rune_sword'; return m; }],
      /* forty pieces of forty different kills: only the kill bound (and the fuse) stands between them and the table */
      ['traits_over', (m) => { m.traits.found = Array.from({ length: 40 }, (_, k) => ({ ...m.traits.found[0], kill: 900000 + k })); return m; }],
      ['pity_over', (m) => { m.traits.pity.rare = 1000000; return m; }]]) {
      const res = await M.HS.commitHuntSettle(ex, tamper(fn));
      if (!res || res.ok !== false || res.error !== want) problems.push('TP-4 a forged ' + want + ' answered ' + JSON.stringify(res).slice(0, 160));
    }
    if (Number(await one(db, 'select count(*) from public.trait_pieces')) !== before) problems.push('TP-4 a refused commit landed a piece');
    const res = await M.HS.commitHuntSettle(ex, { ...found.p.commit, project: null });
    const own = res && res.ok === true && (res.members || []).find((x) => String(x.user) === String(found.p.commit.members[found.i].user));
    if (!own || !Array.isArray(own.hunt_settle && own.hunt_settle.found) || own.hunt_settle.found.length !== found.p.commit.members[found.i].traits.found.length) {
      problems.push('TP-4 the untampered proposal answered ' + JSON.stringify(res).slice(0, 200));
    }
    if (Number(await one(db, 'select count(*) from public.trait_pieces')) !== before + found.p.commit.members.reduce((n, m) => n + ((m.traits && m.traits.found.length) || 0), 0)) {
      problems.push('TP-4 the untampered proposal landed ' + (Number(await one(db, 'select count(*) from public.trait_pieces')) - before) + ' pieces');
    }
  } finally { edge.done(); }
  return problems;
}

/* --mutate: a SQL defect planted in a replayed function body (danger-db's harness), or an edge defect planted on the fast edge */
const MUTANTS = [
  { name: 'the land skips the rank', fn: 'public.hr_trait_pieces_land(text,uuid,integer,uuid,uuid,jsonb,jsonb,timestamp with time zone,timestamp with time zone)',
    find: 'if v_top < 1 or v_rank > v_top or v_rank < greatest(1, v_top - 1) then', repl: 'if false then', want: /^TP-4/, test: bounds },
  { name: 'the land trusts the pity', fn: 'public.hr_trait_pieces_land(text,uuid,integer,uuid,uuid,jsonb,jsonb,timestamp with time zone,timestamp with time zone)',
    find: 'if v_after > v_before + v_kills or (v_rar = any (v_found) and v_after > v_kills) then', repl: 'if false then', want: /^TP-4/, test: bounds },
  { name: 'the land counts no kills', fn: 'public.hr_trait_pieces_land(text,uuid,integer,uuid,uuid,jsonb,jsonb,timestamp with time zone,timestamp with time zone)',
    find: 'if v_n > v_kills or v_n > r.found_max then', repl: 'if false then', want: /^TP-4/, test: bounds },
  { name: 'the settle never lands the pieces', fn: 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)',
    find: "      if v_m ? 'traits' and jsonb_typeof(v_m->'traits') <> 'null'", repl: "      if false and v_m ? 'traits' and jsonb_typeof(v_m->'traits') <> 'null'", want: /^TP-2/, test: roll },
  { name: 'the read hands no pity', fn: 'public.hr_trait_drops_of(uuid,integer)',
    find: "'rare', coalesce((select misses from public.hero_pity where user_id = p_user and slot = p_slot and rarity = 'rare'), 0)", repl: "'rare', 0", want: /^TP-2/, test: roll },
  { name: 'the read hands no worn Traits', fn: 'public.hr_worn_traits_of(uuid,integer)',
    find: "if not public.hr_flag_on('trait_pieces') then return null; end if;", repl: 'return null;', want: /^TP-3/, test: worn },
  { name: 'a worn piece plays with its base gone', fn: 'public.hr_worn_traits_of(uuid,integer)',
    find: 'and e.equip_slot = p.worn_equip_slot and e.item_id = p.base\n', repl: 'and e.equip_slot = p.worn_equip_slot\n', want: /^TP-3/, test: worn },
  { name: 'the dark switch is ignored', fn: 'public.hr_trait_pieces_land(text,uuid,integer,uuid,uuid,jsonb,jsonb,timestamp with time zone,timestamp with time zone)',
    find: "if not public.hr_flag_on('trait_drops') then perform public.hr_reject('traits_dark'); end if;", repl: '', want: /^TP-1/, test: dark },
  /* an edge defect: the edge never carries pity back, so the server holds none and the read hands none */
  { name: 'the edge drops the pity', edits: [['supabase/functions/hr-accrue/hunt-settle.js', '  return found.length || moved ? { found, pity: after } : null;', '  return found.length ? { found, pity: {} } : null;']], want: /^TP-2/, test: roll },
];

async function main() {
  if (process.argv.includes('--mutate')) {
    let escaped = 0;
    for (const m of MUTANTS) {
      const boot = async () => {
        const b = await bootReplay();
        if (m.fn) {
          const def = await one(b.db, 'select pg_get_functiondef($1::regprocedure)', [m.fn]);
          if (!def.replace(/\r/g, '').includes(m.find)) throw new Error('HARNESS: ' + m.fn + ' has no ' + JSON.stringify(m.find.slice(0, 60)));
          await b.db.exec(def.replace(/\r/g, '').replace(m.find, () => m.repl));
        }
        return b;
      };
      let got = [];
      try { got = await m.test(boot, { edits: m.edits || [] }); } catch (e) { got = ['THREW ' + String(e && e.message).slice(0, 200)]; }
      if (got.some((p) => /HARNESS/.test(p))) { console.log('  HARNESS ' + m.name + ': ' + got[0]); process.exitCode = 2; return; }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + (got[0] || 'every check held').slice(0, 160));
    }
    console.log(escaped ? 'trait-pieces-db --mutate: ' + escaped + ' ESCAPED' : 'trait-pieces-db --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' caught');
    process.exitCode = escaped ? 1 : 0;
    return;
  }
  const boot = () => bootReplay();
  const problems = [...await dark(boot), ...await roll(boot), ...await worn(boot), ...await bounds(boot)];
  for (const e of EVIDENCE) console.log('  ' + e);
  for (const p of problems) console.log('FAIL  ' + p);
  console.log(problems.length ? 'trait-pieces-db: ' + problems.length + ' FAILED' : 'trait-pieces-db: green (dark, the roll both paths, the worn piece both paths, the bounds through the real commit)');
  process.exitCode = problems.length ? 1 : 0;
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
