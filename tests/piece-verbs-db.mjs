#!/usr/bin/env node
// tests/piece-verbs-db.mjs — A TRAIT PIECE IS WORN, TAKEN OFF AND SOLD AS ITSELF, ON EVERY DOOR, BOTH PATHS (1072-piece-verbs.sql,
// lane/t1b-piece-verbs, backend-architect, 2026-11-26; 12-targets.md 8.6, 20-v030-the-roads.md 1.2, CLAUDE.md §1, §4 both paths, §6).
//
//   node tests/piece-verbs-db.mjs            the guard
//   node tests/piece-verbs-db.mjs --mutate   the proof: each planted SQL defect turns its case red
//
// THE MEASURE: the replayed chain (PGlite). Every press goes in as the CLIENT ROLE (`authenticated`, the JWT subject), so the grants are
// exercised, not assumed; the edge's equip verb is the real hr-accrue/equip.js file as hr_engine; the hunt is the shipped world tick
// (browser closed, the `fire` door) and the viewed hello (hunt viewed, the `viewed` door) through tools/settle-cost.mjs.
//   PV-1 DARK: with trait_pieces off (as applied) the wear and the sale answer pieces_dark and move nothing, the section is null, and the
//        edge's unequip of a slot a (planted) piece is worn in still frees the piece and puts no copy of its base in the bag.
//   PV-2 THE EQUIP DOORS NEVER MAKE A COPY (b362's class): a Level 60 hero wears a piece through hr_piece_wear (the slot's plain item to
//        the bag, nothing debited, the answer is the envelope, a replay moves nothing); another hero is refused piece_worn; then the
//        edge's equip verb taking it off, swapping it for a plain item and naming its own base, and a setup switch (hr_hunt_preset_apply)
//        to a setup of other gear: each frees the piece or keeps it on, and the plain copies of its base (bag plus every slot no piece
//        holds) never rise.
//   PV-3 THE SALE: every piece's `sell` in the section is the core's twin (src/core/piece-value.js pieceStoreBid); a worn piece is refused,
//        a wrong price is quote_changed and moves nothing; the sale deletes the row, pays the purse exactly the twin, journals one shop row
//        holding the piece, and answers an envelope without it; a replay pays nothing; another account's piece is unknown; the day fuse
//        refuses past sell_day and the section's sell_left counts down.
//   PV-4 BOTH PATHS: the leader of a four wears a First Rank III piece through hr_piece_wear before the hunt: the read hands it to that hero
//        alone, the closed and the viewed hunt from one anchor store one world, and that world differs from the same four with the piece
//        left in the bag (the Trait played); a wear while the hunt is open is refused hunt_open.
//   PV-5 A SETUP REMEMBERS ITS PIECE, BOTH PATHS (1074-setup-pieces.sql, lane/piece-gear-fixes): the setup in use follows a piece put on, a
//        setup saved while it is worn keeps it; switched off to a plain setup and back, THE PIECE goes on again, never the plain copy of
//        its base the bag holds, and the hunt reads its Trait for that hero: the player's own Use then the page's enter (hunt viewed), and
//        the company's Start switching the ground's setup itself (browser closed). The piece sold, the setup's line says so (gone) and Use
//        refuses piece_gone by slot, moving nothing.
//   --case=<name> runs one case; --mutate --mutant=<part of a name> those mutants only.
//
// mutant-anchors: supabase/migrations/1072-piece-verbs.sql supabase/migrations/1074-setup-pieces.sql
// ci-step: db-replay | Trait piece verbs - the wear, the equip doors that never copy a piece, the store sale, both paths (1072)
// ci-run: node tools/gen-piece-value.mjs --check
// ci-run: node tools/mutant-gate.mjs node tools/gen-piece-value.mjs --selftest
// ci-run: node tests/piece-verbs-db.mjs
// ci-run: node tools/mutant-gate.mjs node tests/piece-verbs-db.mjs --mutate
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { isMain } from './_is-main.mjs';
import { bootReplay, closeReplays, ROOT } from './schema-replay.mjs';
import { prepare } from '../tools/settle-cost.mjs';
import { pieceStoreBid } from '../src/core/piece-value.js';

const MUSTER = 'muster_barrows';
const ANCHOR = Date.UTC(2026, 10, 1, 12, 0, 0);
const HELD = 20;
const WINDOWS = 4;
const GEAR = Object.freeze({ helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots', weapon: 'steel_sword', shield: 'coppercap_shield' });
const OTHER_BODY = 'bronze_platebody';
const FLAGS = ['trait_pieces', 'signatures', 'trait_drops'];
const idem = () => crypto.randomUUID();
const one = async (db, sql, params) => { const r = await db.query(sql, params); const row = r.rows[0]; return row ? row[Object.keys(row)[0]] : null; };
const engine = (db) => async (text, params) => { await db.exec('set role hr_engine'); try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); } };

/* ONE PRESS AS THE CLIENT: the JWT subject and the `authenticated` role, as PostgREST runs it */
async function asClient(db, uid, sql, params) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false), set_config('request.jwt.claims', $2, false)", [uid, JSON.stringify({ sub: uid, role: 'authenticated' })]);
  await db.exec('set role authenticated');
  try { const r = (await db.query(sql, params)).rows[0]; return r ? Object.values(r)[0] : undefined; }
  finally {
    await db.exec('reset role');
    await db.query("select set_config('request.jwt.claim.sub', '', false), set_config('request.jwt.claims', '', false)");
  }
}
const wear = (db, uid, slot, piece, equipSlot = null, key = idem()) => asClient(db, uid, 'select public.hr_piece_wear($1, $2::uuid, $3, $4::uuid)', [slot, piece, equipSlot, key]);
const sell = (db, uid, slot, piece, gold, key = idem()) => asClient(db, uid, 'select public.hr_piece_sell($1, $2::uuid, $3::bigint, $4::uuid)', [slot, piece, gold, key]);

/* a piece row planted as the settle's land would write it (the land has its own guard, trait-pieces-db TP-4) */
async function plant(db, uid, o) {
  return one(db, `insert into public.trait_pieces (user_id, found_slot, base, slot, item_level, rarity, traits, hunt_id, step, depth, instance_id, kill_unit, at_ms)
                  values ($1, 0, $2, $3, $4, $5, $6::jsonb, $7, 600, 3, gen_random_uuid(), $8, $9) returning id`,
    [uid, o.base, o.slot, o.il || 60, o.rarity || 'rare', JSON.stringify(o.traits || [{ id: 'first_rank', rank: 1 }]), MUSTER, o.kill || 1, o.at || Date.now()]);
}
const flags = (db, on) => db.query('update public.hr_flags set enabled = (key = any ($1::text[])) where key = any ($2::text[])', [on, FLAGS]);
const bagOf = async (db, uid, item, slot = 0) => Number(await one(db, 'select coalesce((select qty from public.player_inventory where user_id = $1 and slot = $3 and item_id = $2), 0)', [uid, item, slot]));
/* the plain copies of an item a hero holds: its bag stack plus every slot that holds it with no piece worn there */
const copiesOf = async (db, uid, item) => Number(await one(db, `select (select coalesce(sum(qty), 0) from public.player_inventory where user_id = $1 and slot = 0 and item_id = $2)
    + (select count(*) from public.player_equipment e where e.user_id = $1 and e.slot = 0 and e.item_id = $2
        and not exists (select 1 from public.trait_pieces p where p.user_id = e.user_id and p.worn_slot = e.slot and p.worn_equip_slot = e.equip_slot and p.base = e.item_id))`, [uid, item]));
const wornOf = async (db, piece) => (await db.query('select worn_slot, worn_equip_slot from public.trait_pieces where id = $1', [piece])).rows[0] || null;
const slotOf = (db, uid, k) => one(db, 'select item_id from public.player_equipment where user_id = $1 and slot = 0 and equip_slot = $2', [uid, k]);

/* a Level 60 hero (two for an account where `second`), its kit the steel set, a plain bronze body in the bag */
async function heroes(db, { second = false } = {}) {
  const H = (await import('./hunt-sessions-settle.mjs')).HARNESS;
  const M = await H.loadEdge(H.ROOT);
  const [a, b] = H.UIDS;
  /* the harness's character() signs in transaction-locally: the fixture is one committed transaction */
  await db.query('begin');
  for (const uid of [a, b]) {
    await H.character(db, M, uid, { level: 60, inv: { [OTHER_BODY]: 1 }, gold: 1000 });
    for (const [k, item] of Object.entries(GEAR)) {
      await db.query('insert into public.player_equipment (user_id, slot, equip_slot, item_id) values ($1, 0, $2, $3) on conflict (user_id, slot, equip_slot) do update set item_id = excluded.item_id', [uid, k, item]);
    }
  }
  if (second) {
    const c = await asClient(db, a, 'select public.hr_create_character(1)');
    if (!c || (c.ok !== true && c.created !== true)) throw new Error('HARNESS: a second hero refused ' + JSON.stringify(c).slice(0, 160));
    await db.query("update public.player_state set active_kind = 'idle', active_id = null where user_id = $1", [a]);
    await db.query('update public.player_state p set level_xp = q.level_xp from public.player_state q where p.user_id = $1 and p.slot = 1 and q.user_id = $1 and q.slot = 0', [a]);
  }
  await db.query('commit');
  return { a, b, M };
}

async function dark(boot) {
  const problems = [];
  const { db } = await boot();
  const { a } = await heroes(db);
  const p = await plant(db, a, { base: GEAR.body, slot: 'body' });
  await flags(db, []);
  for (const [name, r] of [['wear', await wear(db, a, 0, p)], ['sale', await sell(db, a, 0, p, 1)]]) {
    if (!r || r.error !== 'pieces_dark') problems.push('PV-1 a dark ' + name + ' answered ' + JSON.stringify(r).slice(0, 120));
  }
  if (await one(db, 'select public.hr_trait_pieces_view($1::uuid, 0)', [a]) !== null) problems.push('PV-1 the dark section answered');
  if (!(await one(db, 'select exists (select 1 from public.trait_pieces where id = $1)', [p]))) problems.push('PV-1 a dark sale deleted the piece');
  /* the class holds dark: a piece worn in the slot (planted), taken off through the edge's verb */
  await db.query("update public.trait_pieces set worn_slot = 0, worn_equip_slot = 'body', worn_at = now() where id = $1", [p]);
  const before = await copiesOf(db, a, GEAR.body);
  const { runEquip } = await import(pathToFileURL(join(ROOT, 'supabase/functions/hr-accrue/equip.js')).href);
  const r = await runEquip({ exec: engine(db), user: a, slot: 0, intentId: idem(), equip: { body: null } });
  if (r.status !== 200) problems.push('PV-1 CONTROL: the dark unequip answered ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 120));
  if ((await wornOf(db, p)).worn_slot !== null) problems.push('PV-1 a dark unequip left the piece worn');
  if (await copiesOf(db, a, GEAR.body) > before) problems.push('PV-1 a dark unequip put the piece\'s base in the bag: ' + before + ' -> ' + await copiesOf(db, a, GEAR.body) + ' (DUPLICATION)');
  return problems;
}

async function doors(boot) {
  const problems = [];
  const { db } = await boot();
  const { a, b } = await heroes(db, { second: true });
  await flags(db, ['trait_pieces']);
  const p = await plant(db, a, { base: GEAR.body, slot: 'body' });
  const { runEquip } = await import(pathToFileURL(join(ROOT, 'supabase/functions/hr-accrue/equip.js')).href);
  const edge = async (equip) => runEquip({ exec: engine(db), user: a, slot: 0, intentId: idem(), equip });
  const copies0 = await copiesOf(db, a, GEAR.body);
  const held = async (label) => { const n = await copiesOf(db, a, GEAR.body); if (n > copies0) problems.push('PV-2 ' + label + ' made a copy of the piece\'s base: ' + copies0 + ' -> ' + n + ' (DUPLICATION)'); };

  /* (1) the wear: the plain body goes to the bag, nothing is debited, the answer is the envelope */
  const key = idem();
  const w = await wear(db, a, 0, p, null, key);
  if (!w || w.ok !== true) return [...problems, 'PV-2 the wear refused ' + JSON.stringify(w).slice(0, 200)];
  const at = await wornOf(db, p);
  if (!at || at.worn_slot !== 0 || at.worn_equip_slot !== 'body' || await slotOf(db, a, 'body') !== GEAR.body) problems.push('PV-2 the piece is not worn where it was put: ' + JSON.stringify(at));
  if (await bagOf(db, a, GEAR.body) !== 1) problems.push('PV-2 the slot\'s plain body is not back in the bag (' + await bagOf(db, a, GEAR.body) + ')');
  if (!w.pieces || !Array.isArray(w.pieces.pieces) || !w.pieces.pieces.some((x) => x.id === p && x.worn && x.worn.equip_slot === 'body')) problems.push('PV-2 the wear did not answer the envelope with the piece worn');
  await held('the wear');
  const v0 = Number(await one(db, 'select version from public.player_state where user_id = $1 and slot = 0', [a]));
  const again = await wear(db, a, 0, p, null, key);
  if (!again || again.replayed !== true || Number(await one(db, 'select version from public.player_state where user_id = $1 and slot = 0', [a])) !== v0) problems.push('PV-2 a replayed wear moved something: ' + JSON.stringify(again).slice(0, 120));
  const other = await wear(db, a, 1, p);
  if (!other || other.error !== 'piece_worn') problems.push('PV-2 another hero put on a worn piece: ' + JSON.stringify(other).slice(0, 120));
  if (JSON.stringify(await wornOf(db, p)) !== JSON.stringify({ worn_slot: 0, worn_equip_slot: 'body' })) problems.push('PV-2 the worn piece moved to another hero');
  const stranger = await wear(db, b, 0, p);
  if (!stranger || stranger.error !== 'unknown_piece') problems.push('PV-2 another account put on the piece: ' + JSON.stringify(stranger).slice(0, 120));

  /* (2) the edge's unequip */
  let r = await edge({ body: null });
  if (r.status !== 200) problems.push('PV-2 CONTROL: the unequip answered ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 120));
  if ((await wornOf(db, p)).worn_slot !== null) problems.push('PV-2 the unequip left the piece worn');
  await held('the edge\'s unequip');
  /* (3) the edge's press naming the worn base keeps the piece on */
  if (!(await wear(db, a, 0, p) || {}).ok) problems.push('PV-2 CONTROL: the piece would not go back on');
  r = await edge({ body: GEAR.body });
  if ((await wornOf(db, p)).worn_slot !== 0) problems.push('PV-2 naming the worn base took the piece off');
  await held('a press naming the base');
  /* (4) the edge's swap to a plain item */
  r = await edge({ body: OTHER_BODY });
  if (r.status !== 200) problems.push('PV-2 CONTROL: the swap answered ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 120));
  if ((await wornOf(db, p)).worn_slot !== null || await slotOf(db, a, 'body') !== OTHER_BODY) problems.push('PV-2 the swap to a plain body left the piece on');
  await held('the edge\'s swap');
  /* (5) a setup switch to a setup of other gear (the bronze body), from one wearing the piece */
  if (!(await wear(db, a, 0, p) || {}).ok) problems.push('PV-2 CONTROL: the piece would not go on again');
  const gear1 = { ...GEAR, body: OTHER_BODY };
  await db.query(`insert into public.player_hunt_presets (user_id, slot, preset, name, action_set, gear) values ($1, 0, 1, 'Bronze', 0, $2::jsonb)
                  on conflict (user_id, slot, preset) do update set gear = excluded.gear`, [a, JSON.stringify(gear1)]);
  const s = await asClient(db, a, 'select public.hr_hunt_preset_apply(0, 1, $1::uuid)', [idem()]);
  if (!s || s.ok !== true) problems.push('PV-2 CONTROL: the setup switch refused ' + JSON.stringify(s).slice(0, 160));
  if ((await wornOf(db, p)).worn_slot !== null || await slotOf(db, a, 'body') !== OTHER_BODY) problems.push('PV-2 the setup switch left the piece on');
  await held('the setup switch');
  return problems;
}

async function sale(boot) {
  const problems = [];
  const { db } = await boot();
  const { a, b } = await heroes(db);
  await flags(db, ['trait_pieces']);
  const pieces = [
    await plant(db, a, { base: GEAR.body, slot: 'body', kill: 1 }),
    await plant(db, a, { base: GEAR.body, slot: 'body', kill: 2, traits: [{ id: 'first_rank', rank: 3 }] }),
    await plant(db, a, { base: GEAR.weapon, slot: 'weapon', kill: 3, il: 80, rarity: 'very_rare', traits: [{ id: 'file_breaker', rank: 1 }, { id: 'worrier', rank: 2 }] }),
  ];
  const theirs = await plant(db, b, { base: GEAR.body, slot: 'body', kill: 4 });
  const view = async () => one(db, 'select public.hr_trait_pieces_view($1::uuid, 0)', [a]);
  const sec = await view();
  const max = Number(await one(db, 'select sell_day from public.hr_piece_value_rules'));
  if (!sec || sec.sell_left !== max) problems.push('PV-3 the section\'s sales left read ' + JSON.stringify(sec && sec.sell_left) + ', want ' + max);
  for (const x of (sec && sec.pieces) || []) {
    const twin = pieceStoreBid({ rarity: x.rarity, il: x.il, traits: x.traits });
    if (x.sell !== twin) problems.push('PV-3 the section prices ' + x.rarity + ' ' + JSON.stringify(x.traits) + ' at ' + x.sell + ', the core at ' + twin);
  }
  if (!sec || sec.pieces.length !== 3) return [...problems, 'PV-3 CONTROL: the section holds ' + JSON.stringify(sec).slice(0, 120)];
  const price = (id) => sec.pieces.find((x) => x.id === id).sell;
  /* a worn piece is refused */
  await wear(db, a, 0, pieces[0]);
  const worn = await sell(db, a, 0, pieces[0], price(pieces[0]));
  /* a worn piece sold would leave its base in the slot as a plain item no row stands behind: the rest of the case reads nothing past it */
  if (!worn || worn.error !== 'piece_worn') return [...problems, 'PV-3 a worn piece sold: ' + JSON.stringify(worn).slice(0, 120)];
  /* a wrong price moves nothing */
  const g0 = Number(await one(db, 'select public.hr_purse_of($1)', [a]));
  const wrong = await sell(db, a, 0, pieces[1], price(pieces[1]) + 1);
  if (!wrong || wrong.error !== 'quote_changed' || Number(wrong.gold) !== price(pieces[1])) problems.push('PV-3 a wrong price answered ' + JSON.stringify(wrong).slice(0, 120));
  if (Number(await one(db, 'select public.hr_purse_of($1)', [a])) !== g0) problems.push('PV-3 a refused sale moved the purse');
  /* the sale */
  const key = idem();
  const ok = await sell(db, a, 0, pieces[1], price(pieces[1]), key);
  if (!ok || ok.ok !== true) return [...problems, 'PV-3 the sale refused ' + JSON.stringify(ok).slice(0, 200)];
  const g1 = Number(await one(db, 'select public.hr_purse_of($1)', [a]));
  if (g1 !== g0 + price(pieces[1])) problems.push('PV-3 the sale paid ' + (g1 - g0) + ', the price is ' + price(pieces[1]));
  if (await one(db, 'select exists (select 1 from public.trait_pieces where id = $1)', [pieces[1]])) problems.push('PV-3 a sold piece is still a row');
  if (ok.pieces && ok.pieces.pieces.some((x) => x.id === pieces[1])) problems.push('PV-3 the sale\'s envelope still lists the piece');
  const led = (await db.query(`select gold, meta from public.player_ledger where user_id = $1 and kind = 'shop' and intent = $2`, [a, 'piece_sell:' + pieces[1]])).rows;
  if (led.length !== 1 || Number(led[0].gold) !== price(pieces[1]) || led[0].meta.piece !== pieces[1] || JSON.stringify(led[0].meta.traits) !== JSON.stringify([{ id: 'first_rank', rank: 3 }])) {
    problems.push('PV-3 the journal holds ' + JSON.stringify(led).slice(0, 200));
  }
  const replay = await sell(db, a, 0, pieces[1], price(pieces[1]), key);
  if (!replay || replay.replayed !== true || Number(await one(db, 'select public.hr_purse_of($1)', [a])) !== g1) problems.push('PV-3 a replayed sale paid again: ' + JSON.stringify(replay).slice(0, 120));
  const stranger = await sell(db, a, 0, theirs, price(pieces[1]));
  if (!stranger || stranger.error !== 'unknown_piece') problems.push('PV-3 another account\'s piece sold: ' + JSON.stringify(stranger).slice(0, 120));
  /* the day fuse: one sale made today; at a fuse of 2 the next sells and the one after is refused */
  if ((await view()).sell_left !== max - 1) problems.push('PV-3 the section\'s sales left did not count the sale (' + (await view()).sell_left + ')');
  await db.query('update public.hr_piece_value_rules set sell_day = 2 where id');
  const second = await sell(db, a, 0, pieces[2], price(pieces[2]));
  if (!second || second.ok !== true) problems.push('PV-3 the second sale refused ' + JSON.stringify(second).slice(0, 120));
  const off = await runEquipOff(db, a, 'body');
  if (off.status !== 200 || (await wornOf(db, pieces[0])).worn_slot !== null) problems.push('PV-3 CONTROL: the piece would not come off (' + off.status + ')');
  const third = await sell(db, a, 0, pieces[0], price(pieces[0]));
  if (!third || third.error !== 'sell_day_cap' || !(await one(db, 'select exists (select 1 from public.trait_pieces where id = $1)', [pieces[0]]))) {
    problems.push('PV-3 a sale past the day fuse answered ' + JSON.stringify(third).slice(0, 120));
  }
  return problems;
}

/* the edge's unequip (the client's own path to take a piece off) */
async function runEquipOff(db, uid, k) {
  const { runEquip } = await import(pathToFileURL(join(ROOT, 'supabase/functions/hr-accrue/equip.js')).href);
  return runEquip({ exec: engine(db), user: uid, slot: 0, intentId: idem(), equip: { [k]: null } });
}

/* PV-4: the hunt (danger-db's plan and held steps, trait-pieces-db's four) with the leader's piece worn through the verb, or left free */
const hunt = ({ worn }) => async ({ db, uids, asUser, one: q, idem: id }) => {
  for (const uid of uids) {
    await db.query('insert into public.hunt_density (user_id, slot, hunt_id, density, danger_held) values ($1, 0, $2, 0, $3) on conflict (user_id, slot, hunt_id) do update set danger_held = excluded.danger_held', [uid, MUSTER, HELD]);
  }
  await asUser(uids[0]);
  const r = await q(db, 'select public.hr_hunt_risk_set(0, $1, $2::uuid)', ['steady', id()]);
  if (!r || r.ok !== true) throw new Error('HARNESS: the stance was refused: ' + JSON.stringify(r).slice(0, 200));
  await flags(db, ['trait_pieces']);
  const p = await plant(db, uids[0], { base: GEAR.body, slot: 'body', traits: [{ id: 'first_rank', rank: 3 }] });
  if (worn) {
    const w = await wear(db, uids[0], 0, p);
    if (!w || w.ok !== true) throw new Error('PV-4 the wear before the hunt refused ' + JSON.stringify(w).slice(0, 200));
  }
  await asUser(uids[0]);
};
async function door(db, which, o) {
  const run = await prepare({ heroes: 4, windows: WINDOWS, hunt: MUSTER, door: which, db, level: 60, anchorMs: ANCHOR, gear: GEAR, beforeEnter: hunt(o) });
  await run.warm();
  /* the world stored after every window (lane/refhero-recut, 2026-11-27): the last one alone can sit between pulls, the party whole and the
     packs as they spawned, so a worn piece that played read the same last world on the re-cut Muster (4 and 8 windows; 6 differed) */
  const worlds = [];
  for (let w = 2; w <= WINDOWS + 1; w++) {
    await run.step(w);
    worlds.push((await db.query('select world::text as world from public.hunt_instances where hunt_id = $1', [MUSTER])).rows[0].world);
  }
  const inst = (await db.query('select id, refusals, world::text as world from public.hunt_instances where hunt_id = $1', [MUSTER])).rows[0];
  return { db, inst, users: run.users, worlds };
}
async function bothPaths(boot) {
  const problems = [];
  const closed = await door((await boot()).db, 'fire', { worn: true });
  const viewed = await door((await boot()).db, 'viewed', { worn: true });
  const free = await door((await boot()).db, 'fire', { worn: false });
  for (const [name, r] of [['browser closed', closed], ['hunt viewed', viewed], ['piece in the bag', free]]) if (Number(r.inst.refusals) !== 0) problems.push('PV-4 ' + name + ': ' + r.inst.refusals + ' window(s) refused');
  const read = await one(closed.db, 'select public.hr_hunt_instance_read($1::uuid, 0)', [closed.users[0]]);
  if (!read || read.members.length !== 4) return [...problems, 'PV-4 CONTROL: the read holds ' + (read && read.members.length) + ' members'];
  for (const m of read.members) {
    const want = m.user === closed.users[0] ? JSON.stringify([{ id: 'first_rank', rank: 3 }]) : 'null';
    if (JSON.stringify(m.worn_traits) !== want) problems.push('PV-4 the read hands ' + (m.user === closed.users[0] ? 'the wearer' : 'another hero') + ' ' + JSON.stringify(m.worn_traits));
  }
  const freeRead = await one(free.db, 'select public.hr_hunt_instance_read($1::uuid, 0)', [free.users[0]]);
  if (!freeRead || freeRead.members.some((m) => m.worn_traits !== null)) problems.push('PV-4 a piece left in the bag plays');
  if (closed.inst.world !== viewed.inst.world) problems.push('PV-4 the two doors stored different worlds');
  if (closed.worlds.join('|') === free.worlds.join('|')) problems.push('PV-4 the worn piece changed nothing: every window stored the world of the piece left in the bag');
  console.log('  PV-4 worn through the verb: doors ' + (closed.inst.world === viewed.inst.world ? 'store one world' : 'DIFFER') + ', ' + (closed.worlds.join('|') === free.worlds.join('|') ? 'SAME' : 'different') + ' windows from the piece left in the bag');
  /* setups change in town: a wear while the hunt is open is refused */
  const p2 = await plant(closed.db, closed.users[1], { base: GEAR.body, slot: 'body', kill: 9 });
  const mid = await wear(closed.db, closed.users[1], 0, p2);
  if (!mid || mid.error !== 'hunt_open') problems.push('PV-4 a wear mid-hunt answered ' + JSON.stringify(mid).slice(0, 120));
  return problems;
}

/* PV-5: a setup remembers its piece (1074-setup-pieces.sql). `door` 'viewed': the player's own Use, then the hunt entered by the page;
   'closed': the company's Start (hr_carry_on, the ground pointed at the setup) switches the setup itself, nobody watching. */
const PRESETS = (db, uid) => one(db, 'select public.hr_hunt_presets_view($1::uuid, 0)', [uid]);
const setupOf = async (db, uid, n) => ((await PRESETS(db, uid)) || []).find((x) => x.preset === n) || null;
async function setupDoor(boot, which) {
  const problems = [];
  const { db } = await boot();
  const { a, M } = await heroes(db);
  await flags(db, ['trait_pieces']);
  const p = await plant(db, a, { base: GEAR.body, slot: 'body', traits: [{ id: 'first_rank', rank: 3 }] });
  const { runEquip } = await import(pathToFileURL(join(ROOT, 'supabase/functions/hr-accrue/equip.js')).href);
  const press = (sql, params) => asClient(db, a, sql, params);
  const tag = 'PV-5 (' + which + ') ';
  /* 'Bronze' (setup 2) wears the plain other body; 'Rare' (setup 1), saved from it, then puts the piece on: the setup in use follows */
  let r = await runEquip({ exec: engine(db), user: a, slot: 0, intentId: idem(), equip: { body: OTHER_BODY } });
  if (r.status !== 200) return [tag + 'CONTROL: the swap to a plain body answered ' + r.status];
  for (const [n, name] of [[2, 'Bronze'], [1, 'Rare']]) {
    r = await press('select public.hr_hunt_preset_save(0, $1, $2, $3::uuid)', [n, name, idem()]);
    if (!r || r.ok !== true) return [tag + 'CONTROL: saving ' + name + ' answered ' + JSON.stringify(r).slice(0, 160)];
  }
  if (!(await wear(db, a, 0, p) || {}).ok) return [tag + 'CONTROL: the piece would not go on'];
  const rare = await setupOf(db, a, 1);
  if (!rare || !rare.pieces || rare.pieces.body !== p || JSON.stringify(rare.gone) !== '[]') problems.push(tag + 'the setup in use did not follow the piece: ' + JSON.stringify(rare));
  /* a save over a setup not in use while the piece is on keeps it (Use equipped) */
  r = await press('select public.hr_hunt_preset_save(0, 3, $1, $2::uuid)', ['Copy', idem()]);
  const copy = await setupOf(db, a, 3);
  if (!r || r.ok !== true || !copy || !copy.pieces || copy.pieces.body !== p) problems.push(tag + 'a setup saved wearing the piece reads ' + JSON.stringify(copy));
  r = await press('select public.hr_hunt_preset_apply(0, 1, $1::uuid)', [idem()]);
  /* off: Bronze frees the piece; a plain copy of its base now waits in the bag (the steel body the first swap took off) */
  r = await press('select public.hr_hunt_preset_apply(0, 2, $1::uuid)', [idem()]);
  if (!r || r.ok !== true || (await wornOf(db, p)).worn_slot !== null) return [...problems, tag + 'CONTROL: Bronze answered ' + JSON.stringify(r).slice(0, 160)];
  const bag0 = await bagOf(db, a, GEAR.body);
  if (bag0 < 1) problems.push(tag + 'CONTROL: no plain copy of the base waits in the bag (' + bag0 + '): the case cannot tell the piece from a copy');
  /* back to Rare: the player's Use, or the company's Start */
  if (which === 'viewed') {
    r = await press('select public.hr_hunt_preset_apply(0, 1, $1::uuid)', [idem()]);
    if (!r || r.ok !== true) problems.push(tag + 'Use refused ' + JSON.stringify(r).slice(0, 160));
    r = await press(`select public.hr_hunt_enter(0, $1, '[]'::jsonb, 1, null, $2::uuid)`, [MUSTER, idem()]);
  } else {
    r = await press('select public.hr_hero_plan_set(0, $1, $2::uuid)', [MUSTER, idem()]);
    if (!r || r.ok !== true) return [...problems, tag + 'CONTROL: the plan answered ' + JSON.stringify(r).slice(0, 160)];
    r = await press('select public.hr_ground_setup_set(0, $1, 1, $2::uuid)', [MUSTER, idem()]);
    if (!r || r.ok !== true) return [...problems, tag + 'CONTROL: the ground\'s setup answered ' + JSON.stringify(r).slice(0, 160)];
    const plan = await press('select public.hr_carry_on_plan(null::int[])', []);
    r = await press('select public.hr_carry_on(null::int[], $1::bigint, $2::uuid)', [plan && plan.gold, idem()]);
  }
  if (!r || r.ok !== true) problems.push(tag + 'the hunt did not open: ' + JSON.stringify(r).slice(0, 200));
  const at = await wornOf(db, p);
  if (!at || at.worn_slot !== 0 || at.worn_equip_slot !== 'body' || await slotOf(db, a, 'body') !== GEAR.body) problems.push(tag + 'the setup did not put the piece back on: ' + JSON.stringify(at) + ', the body slot holds ' + await slotOf(db, a, 'body'));
  if (await bagOf(db, a, GEAR.body) !== bag0) problems.push(tag + 'the setup wore the plain copy of the base from the bag (' + bag0 + ' -> ' + await bagOf(db, a, GEAR.body) + ')');
  /* the hunt reads the piece's Trait for this hero */
  const read = await one(db, 'select public.hr_hunt_instance_read($1::uuid, 0)', [a]);
  const me = read && Array.isArray(read.members) ? read.members.find((m) => m.user === a) : null;
  if (!me || JSON.stringify(me.worn_traits) !== JSON.stringify([{ id: 'first_rank', rank: 3 }])) problems.push(tag + 'the hunt reads ' + JSON.stringify(me && me.worn_traits) + ' for the hero, not the piece\'s Trait');
  void M;
  return problems;
}
async function setupGone(boot) {
  const problems = [];
  const { db } = await boot();
  const { a } = await heroes(db);
  await flags(db, ['trait_pieces']);
  const p = await plant(db, a, { base: GEAR.body, slot: 'body' });
  const press = (sql, params) => asClient(db, a, sql, params);
  const { runEquip } = await import(pathToFileURL(join(ROOT, 'supabase/functions/hr-accrue/equip.js')).href);
  await runEquip({ exec: engine(db), user: a, slot: 0, intentId: idem(), equip: { body: OTHER_BODY } });
  for (const [n, name] of [[2, 'Bronze'], [1, 'Rare']]) await press('select public.hr_hunt_preset_save(0, $1, $2, $3::uuid)', [n, name, idem()]);
  await wear(db, a, 0, p);
  await press('select public.hr_hunt_preset_apply(0, 2, $1::uuid)', [idem()]);
  const bid = ((await one(db, 'select public.hr_trait_pieces_view($1::uuid, 0)', [a])).pieces.find((x) => x.id === p) || {}).sell;
  const s = await sell(db, a, 0, p, bid);
  if (!s || s.ok !== true) return ['PV-5 CONTROL: the sale refused ' + JSON.stringify(s).slice(0, 160)];
  const line = await setupOf(db, a, 1);
  if (!line || JSON.stringify(line.gone) !== '["body"]') problems.push('PV-5 the setup line of a sold piece reads ' + JSON.stringify(line));
  const v0 = Number(await one(db, 'select version from public.player_state where user_id = $1 and slot = 0', [a]));
  const bag0 = await bagOf(db, a, GEAR.body);
  const r = await press('select public.hr_hunt_preset_apply(0, 1, $1::uuid)', [idem()]);
  if (!r || r.error !== 'piece_gone' || r.equip_slot !== 'body' || r.item !== GEAR.body) problems.push('PV-5 Use of a setup whose piece was sold answered ' + JSON.stringify(r).slice(0, 160));
  if (Number(await one(db, 'select version from public.player_state where user_id = $1 and slot = 0', [a])) !== v0 || await slotOf(db, a, 'body') !== OTHER_BODY || await bagOf(db, a, GEAR.body) !== bag0) {
    problems.push('PV-5 a refused Use moved something: the body slot holds ' + await slotOf(db, a, 'body') + ', the bag ' + bag0 + ' -> ' + await bagOf(db, a, GEAR.body));
  }
  return problems;
}
const setups = async (boot) => [...await setupDoor(boot, 'viewed'), ...(await closeReplays(), await setupDoor(boot, 'closed')), ...(await closeReplays(), await setupGone(boot))];

/* --mutate: a SQL defect planted in a replayed function body (trait-pieces-db's harness) */
const APPLY = 'public.hr_apply(uuid,integer,bigint,uuid,jsonb)';
const SELL = 'public.hr_piece_sell(integer,uuid,bigint,uuid)';
const WEAR = 'public.hr_piece_wear(integer,uuid,text,uuid)';
const PRESET_APPLY = 'public.hr_hunt_preset_apply(integer,integer,uuid)';
const MUTANTS = [
  { name: 'the unequip credits a worn piece\'s base to the bag', fn: APPLY,
    find: '              if v_was.id is null or v_was.base is distinct from v_cur then', repl: '              if true then', want: /^PV-[12] .*(DUPLICATION|copy)/, test: doors },
  { name: 'the swap credits a worn piece\'s base to the bag', fn: APPLY,
    find: 'if v_cur is not null and (v_was.id is null or v_was.base is distinct from v_cur) then', repl: 'if v_cur is not null then', want: /^PV-2 .*copy/, test: doors },
  { name: 'the unequip leaves the piece worn', fn: APPLY,
    find: '            if v_was.id is not null then\n              update public.trait_pieces set worn_slot = null, worn_equip_slot = null, worn_at = null where id = v_was.id;\n            end if;\n            if v_cur is not null then',
    repl: '            if v_cur is not null then', want: /^PV-2/, test: doors },
  { name: 'a piece worn by another hero goes on', fn: APPLY,
    find: 'if v_put.worn_slot is not null and (v_put.worn_slot <> v_slot or v_put.worn_equip_slot <> k) then', repl: 'if false then', want: /^PV-2/, test: doors },
  { name: 'the wear debits a bag copy of the base', fn: APPLY,
    find: '          if v_put.id is null then\n            -- DEBIT one from the bank.', repl: '          if true then\n            -- DEBIT one from the bank.', want: /^PV-2/, test: doors },
  { name: 'the wear never marks the piece worn', fn: APPLY,
    find: 'update public.trait_pieces set worn_slot = v_slot, worn_equip_slot = k, worn_at = now() where id = v_put.id;', repl: 'perform 1;', want: /^PV-4/, test: bothPaths },
  { name: 'a wear mid-hunt is let through to the equip path', fn: WEAR,
    find: "  if v_s.id is not null then\n    return public.hr_note_rejection('piece_wear', p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open'",
    repl: "  if false then\n    return public.hr_note_rejection('piece_wear', p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open'", want: /^PV-4/, test: bothPaths },
  { name: 'the sale skips the quote', fn: SELL, find: 'if v_bid <> p_gold then', repl: 'if false then', want: /^PV-3/, test: sale },
  { name: 'the sale keeps the row', fn: SELL, find: '    delete from public.trait_pieces where id = v_p.id;', repl: '    perform 1;', want: /^PV-3/, test: sale },
  { name: 'the sale has no day fuse', fn: SELL, find: 'if v_max is null or v_n >= v_max then', repl: 'if false then', want: /^PV-3/, test: sale },
  { name: 'the sale sells a worn piece', fn: SELL, find: '  if v_p.worn_slot is not null then', repl: '  if false then', want: /^PV-3/, test: sale },
  { name: 'the sale runs dark', fn: SELL,
    find: "if not public.hr_flag_on('trait_pieces') then return jsonb_build_object('ok', false, 'error', 'pieces_dark'); end if;", repl: '', want: /^PV-1/, test: dark },
  { name: 'the section prices nothing', fn: 'public.hr_trait_pieces_view(uuid,integer)',
    find: "'sell', public.hr_piece_store_bid(p.rarity", repl: "'sell', 0 * public.hr_piece_store_bid(p.rarity", want: /^PV-3/, test: sale },
  /* 1074-setup-pieces.sql */
  { name: 'a setup asks for its piece\'s base, not the piece', fn: PRESET_APPLY,
    find: "case when jsonb_typeof(v_p.pieces->s.equip_slot) = 'string' then jsonb_build_object('piece', v_p.pieces->>s.equip_slot)",
    repl: 'case when false then null', want: /^PV-5 \(viewed\) .*(piece back on|plain copy)/, test: setups },
  { name: 'a setup whose piece was sold is let through', fn: PRESET_APPLY, find: '  if v_gone.equip_slot is not null then', repl: '  if false then', want: /^PV-5 Use of a setup whose piece was sold/, test: setups },
  { name: 'the setup in use never follows a piece', fn: 'public.hr_setup_gear_write(uuid,integer)', find: 'filter (where tp.id is not null)', repl: 'filter (where false)',
    want: /^PV-5 \(viewed\) the setup in use did not follow/, test: setups },
  { name: 'a piece put on re-writes no setup', fn: 'public.hr_setup_piece_follow()',
    find: 'if new.worn_slot is not null and new.worn_slot is distinct from old.worn_slot then', repl: 'if false then', want: /^PV-5 \(viewed\) the setup in use did not follow/, test: setups },
  { name: 'a save forgets the worn pieces', fn: 'public.hr_hunt_preset_save(integer,integer,text,uuid)',
    find: 'join public.trait_pieces tp on tp.user_id = e.user_id', repl: 'join public.trait_pieces tp on false and tp.user_id = e.user_id', want: /^PV-5 \(viewed\) a setup saved wearing the piece/, test: setups },
  { name: 'the setup line never says a piece is gone', fn: 'public.hr_hunt_presets_view(uuid,integer)',
    find: 'where not exists (select 1 from public.trait_pieces tp where tp.id = e.value::uuid and tp.user_id = p_user)', repl: 'where false', want: /^PV-5 the setup line of a sold piece/, test: setups },
];

async function main() {
  if (process.argv.includes('--mutate')) {
    let escaped = 0;
    /* --mutant=<part of a name>: those mutants only (a lane's own; the gate runs them all) */
    const pick = (process.argv.find((x) => x.startsWith('--mutant=')) || '').slice(9);
    const list = MUTANTS.filter((m) => !pick || m.name.includes(pick));
    for (const m of list) {
      const boot = async () => {
        const b = await bootReplay();
        const def = (await one(b.db, 'select pg_get_functiondef($1::regprocedure)', [m.fn])).replace(/\r/g, '');
        if (!def.includes(m.find)) throw new Error('HARNESS: ' + m.fn + ' has no ' + JSON.stringify(m.find.slice(0, 60)));
        await b.db.exec(def.replace(m.find, () => m.repl));
        return b;
      };
      let got = [];
      try { got = await m.test(boot); } catch (e) { got = [(/HARNESS/.test(String(e && e.message)) ? '' : 'THREW ') + String(e && e.message).slice(0, 200)]; }
      await closeReplays();
      if (got.some((p) => /HARNESS/.test(p))) { console.log('  HARNESS ' + m.name + ': ' + got[0]); process.exitCode = 2; return; }
      const hit = got.some((p) => m.want.test(p));
      if (!hit) escaped++;
      console.log('  ' + (hit ? 'caught ' : 'ESCAPED') + ' ' + m.name + ': ' + (got.find((p) => m.want.test(p)) || got[0] || 'every check held').slice(0, 160));
    }
    console.log(escaped ? 'piece-verbs-db --mutate: ' + escaped + ' ESCAPED' : 'piece-verbs-db --mutate: ' + list.length + '/' + list.length + ' caught');
    process.exitCode = escaped ? 1 : 0;
    return;
  }
  const boot = () => bootReplay();
  const problems = [];
  /* --case=<name>: one case (dark, doors, sale, bothPaths, setups) */
  const only = (process.argv.find((x) => x.startsWith('--case=')) || '').slice(7);
  for (const c of [dark, doors, sale, bothPaths, setups]) { if (only && c.name !== only) continue; problems.push(...await c(boot)); await closeReplays(); }
  for (const p of problems) console.log('FAIL  ' + p);
  console.log(problems.length ? 'piece-verbs-db: ' + problems.length + ' FAILED' : 'piece-verbs-db: green (dark, the equip doors never copy a piece, the store sale, the worn piece both paths)');
  process.exitCode = problems.length ? 1 : 0;
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(1); });
