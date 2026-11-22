#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/setup-slots.mjs — A HERO'S SETUPS: FREE, UP TO THE LIMIT (redesign direction 9, Tyler approved 2026-11-22: "Plans are free";
//   supabase/migrations/1049-setups-free.sql and 1050-setups-free-gold-sinks-catalogue.generated.sql; lane/c-company FB-6). It replaced the
//   priced slots of 2027-02-28-setup-slots.sql (three free, then 15,000 and 40,000 gold).
//
//   node tests/setup-slots.mjs             the guard
//   node tests/setup-slots.mjs --list      the mutation catalogue
//   node tests/setup-slots.mjs --selftest  every planted defect must turn its arm red
//   node tests/setup-slots.mjs --mutate=<id>
//
// mutant-anchors: supabase/migrations/1049-setups-free.sql supabase/migrations/2027-05-04-setup-swap-mid-hunt.sql src/shell/setup-words.js src/session/item-sections.js src/session/refusal.js src/shell/intent-words.js src/shell/windows/hunt-prep/setups.js
//
// The real chain replayed (PGlite), real client roles, the real client modules; production untouched:
//   SS-FREE    SAVING A SETUP IS FREE: no sink row and no verb sells a slot; a brand-new hero with NO GOLD saves a setup on every number under
//              the limit through the player's own verb; the purse and the shop journal never move; a second hero holds the same
//   SS-NEW     past the limit every verb that can open a number refuses it (bad_preset) and leaves no row; the shared check opens every number
//              under the limit and names the count past it, with no price
//   SS-KEEP    a saved setup is the player's: used, renamed, deleted, and its number saved again
//   SS-HUNT    a hunting hero: Save keeps its hunt_open refusal
//   SS-COPY    copying bars to another hero brings every number and keeps the bar of a setup the target saved
//   SS-WRITERS every function that can write a new setup number asks hr_setup_locked: a new writer can't slip past the limit
//   SS-GRANT   no helper is a client's; nothing a client can call sells a slot and the baseline names none; the section is registered
//   SS-AGAIN   a second apply of 1049-setups-free.sql is byte-identical
//   SS-PARITY  EVERY ENVELOPE BUILDS THE SECTION: it reads no table, it equals the verbs' count (the limit) for every hero, a rung bought in the
//              priced days moves nothing, and it carries no price
//   SS-CLIENT  the reader keeps { count, max } (null with no count), the full line and the refusal say the server's count and offer nothing,
//              and no client module words or sends a purchase
// SETUPS SWITCH MID-HUNT, BAR ONLY (Tyler 2026-11-17 "Bar only, keep gear"; 2027-05-04-setup-swap-mid-hunt.sql), on the REAL engine
// (tests/hunt-sessions-settle.mjs's harness), one hero with Tank (sword and shield, offensive), Guard (sword, shield and boots, defensive)
// and Bow (a bow), hunting on Tank:
//   SS-SWAP-CLOSED / SS-SWAP-VIEWED  the same, through the world tick's door (the browser closed) and the player's own (the hunt viewed):
//              ten minutes behind, Use Guard is settle_first and moves nothing; settled through the door, Use Guard answers bar_only,
//              the session plays set 1, Guard is in use, the worn set and all three setups' saved gear are byte-equal, the gear stays
//              Tank's; the door's next read gives the engine Guard's stance and its commit stores the hero on it (Tank's before: the
//              control); the envelope's rows say what each fights as and whose gear is on; Use Bow is setup_needs_weapon and moves nothing
//   SS-SWAP-PARTY  a party seat swaps on its own session: the instance's next settle hands that seat Guard's stance, the leader's unmoved
//   SS-SWAP-GEAR  after that swap the hunt ends: an equip goes to Tank (whose gear it is), never Guard; a town Use of Guard wears its
//              boots and leaves Tank alone; in a second hunt Use Tank swaps the bar onto Guard's worn gear, and Use equipped on Tank
//              takes that gear (hr_setup_gear_owner): the next equip goes to Tank, Guard keeps its boots
//   SS-SWAP-AGAIN  a second apply of the swap file (the chain's last) is byte-identical: bodies, grants, triggers, the CHECK, the columns
//   SS-SWAP-CLIENT  the reader keeps fights_as / discipline / wearing (null when absent); midHuntUse: the worn type swaps, the setup in
//              use and an unknown do not, another type says "Town only: needs ..."; the refusal has its own words
// TRUE CONCURRENCY is unverified here (PGlite is one backend); two presses on one hero are ordered by hr_hunt_lock (the migration's header).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { ownHeroSlots } from './_slots.mjs';
import { sourceQuery } from '../tools/lib/version-stamp.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = '000000c0-0000-4000-a000-0000901d7b01';
const idem = () => crypto.randomUUID();
const MIG = (f) => readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n');
const FILE = '1049-setups-free.sql';
const BUY = 'public.hr_setup_slot_buy(integer,bigint,uuid)';
const LOCKED = 'public.hr_setup_locked(uuid,integer,integer)';
const OF = 'public.hr_setups_of(uuid,integer)';
const VIEW = 'public.hr_setup_slots_view(uuid,integer)';
const SAVE = 'public.hr_hunt_preset_save(integer,integer,text,uuid)';
const COPY = 'public.hr_action_set_copy(integer,integer,uuid)';
const APPLY = 'public.hr_hunt_preset_apply(integer,integer,uuid)';
const FOLLOW = 'public.hr_setup_gear_follow()';
const PRESETS_VIEW = 'public.hr_hunt_presets_view(uuid,integer)';
const SWAP_FILE = '2027-05-04-setup-swap-mid-hunt.sql';

/* ── THE PLANTED DEFECTS ─────────────────────────────────────────────────────
   db: a live body edited inside the arm's transaction (fn, find, replace). ddl: a statement in it. sql: an edit of the migration's TEXT
   the arm re-applies. js: a client module, copied and edited. Each names the arm that must go red. */
export const MUTANTS = {
  /* SAVING A SETUP IS FREE (1049-setups-free.sql) */
  count_reads_row: { arm: 'SS-FREE', why: 'the count is three again, so the fourth save is refused', db: [OF, "  return public.hr_hunt_limit('presets');", '  return 3;'] },
  row_sold_again: { arm: 'SS-FREE', why: 'a setup slot row is back in the catalogue',
    ddl: `insert into public.hr_sink_rules (sink_id, scope, prices, free) values ('setup_slot', 'hero', array[15000, 40000]::bigint[], 3)` },
  save_charges: { arm: 'SS-FREE', why: 'a save takes gold from the purse',
    db: [SAVE, "  v_r := jsonb_build_object('ok', true, 'preset', p_preset, 'hunt_presets', public.hr_hunt_presets_view(v_uid, p_slot));",
      "  update public.account_wallet set gold = gold - 1 where user_id = v_uid;\n  v_r := jsonb_build_object('ok', true, 'preset', p_preset, 'hunt_presets', public.hr_hunt_presets_view(v_uid, p_slot));"] },
  locked_no_numbers: { arm: 'SS-NEW', why: 'the refusal drops the count its words say', db: [LOCKED, "'setup_locked', 'slots', v_count)", "'setup_locked')"] },
  locked_price_back: { arm: 'SS-NEW', why: 'the refusal quotes a price again', db: [LOCKED, "'setup_locked', 'slots', v_count)", "'setup_locked', 'slots', v_count, 'price', 15000)"] },
  copy_takes_saved_bar: { arm: 'SS-COPY', why: 'a copy deletes the bar of a saved setup',
    db: [COPY, "\n     and (exists (select 1 from public.player_action_sets a where a.user_id = v_uid and a.slot = p_from and a.preset = t.preset)\n          or not exists (select 1 from public.player_hunt_presets p where p.user_id = v_uid and p.slot = p_to and p.preset = t.preset));", ';'] },
  buy_back: { arm: 'SS-GRANT', why: 'a verb a client can call sells a slot again',
    ddl: `create function public.hr_setup_slot_buy(p_slot int, p_price bigint, p_idem uuid) returns jsonb language sql security definer set search_path = public, pg_catalog as $fn$ select '{}'::jsonb $fn$; grant execute on function public.hr_setup_slot_buy(int, bigint, uuid) to authenticated` },
  helper_open: { arm: 'SS-GRANT', why: 'a client role can call a helper', ddl: `grant execute on function public.hr_setups_of(uuid, integer) to authenticated` },
  no_section: { arm: 'SS-GRANT', why: 'the section is not registered', ddl: `delete from public.hr_state_sections where key = 'setup_slots'` },
  new_writer: { arm: 'SS-WRITERS', why: 'a new verb writes a setup number and never asks',
    ddl: `create function public.hr_zz_writer(p_user uuid, p_slot int, p_n int) returns void language sql as $fn$ insert into public.player_action_sets (user_id, slot, preset, name, slots, options) values (p_user, p_slot, p_n, 'x', '[]'::jsonb, '{}'::jsonb) $fn$` },
  section_price_back: { arm: 'SS-PARITY', why: 'the section quotes a price again', db: [VIEW, "return jsonb_build_object('count', v_lim, 'max', v_lim);", "return jsonb_build_object('count', v_lim, 'max', v_lim, 'price', 15000);"] },
  section_reads_rung: { arm: 'SS-PARITY', why: 'the section counts a rung bought in the priced days',
    db: [VIEW, "return jsonb_build_object('count', v_lim, 'max', v_lim);",
      "return jsonb_build_object('count', least(v_lim, 3 + coalesce((select p.value::int from public.player_progress p where p.user_id = p_user and p.slot = p_slot and p.key = 'setup_slots_bought'), 0)), 'max', v_lim);"] },
  pin_forgets_itself: { arm: 'SS-AGAIN', why: 'a second apply refuses because a restated body lost the mark its pin looks for',
    sql: [FILE, '-- SETUPS-FREE (1049-setups-free.sql): saving a setup is free, so every hero holds the whole limit. Nothing bought, nothing read.',
      '-- (1049-setups-free.sql): saving a setup is free, so every hero holds the whole limit. Nothing bought, nothing read.'] },
  words_buy_back: { arm: 'SS-CLIENT', why: 'the full line offers a purchase again',
    js: ['src/shell/setup-words.js', [["return held + ' Delete one to save a new setup.';", "return held + ' Delete one, or buy a sixth for 15,000 gp.';"]]] },
  words_full_lost: { arm: 'SS-CLIENT', why: 'the refusal drops the server\'s count', js: ['src/shell/intent-words.js', [['return setupFullWords(r.figures.slots);', 'return setupFullWords(5);']]] },
  figures_dropped: { arm: 'SS-CLIENT', why: 'the session drops the refusal\'s numbers', js: ['src/session/refusal.js', [["'min_skill_level', 'slots', 'price', 'per_day']", "'min_skill_level', 'price', 'per_day']"]]] },
  reader_invents: { arm: 'SS-CLIENT', why: 'a section with no count reads as the limit', js: ['src/session/item-sections.js', [["if (!isObj(s) || count(s.count) === null || count(s.max) === null) return null;", "if (!isObj(s)) return { count: 5, max: 5 };"]]] },
  /* SETUPS SWITCH MID-HUNT, BAR ONLY (2027-05-04-setup-swap-mid-hunt.sql) */
  swap_town_only: { arm: 'SS-SWAP-CLOSED', why: 'Use is refused hunt_open again, as before the ruling',
    db: [APPLY, "  if v_s.id is not null then\n    -- THE BAR ONLY, MID-HUNT.", "  if v_s.id is not null then\n    return public.hr_note_rejection('hunt_preset_apply', p_slot, jsonb_build_object('ok', false, 'error', 'hunt_open', 'session', v_s.id));\n    -- THE BAR ONLY, MID-HUNT."] },
  swap_any_weapon: { arm: 'SS-SWAP-CLOSED', why: 'a setup of another weapon type swaps mid-hunt',
    db: [APPLY, 'is distinct from (select r.discipline from public.hr_hunt_weapon_roles r where r.weapon_type = v_wears) then', 'is distinct from (select r.discipline from public.hr_hunt_weapon_roles r where r.weapon_type = v_needs) then'] },
  swap_unsettled: { arm: 'SS-SWAP-VIEWED', why: 'the bar swaps over a hunt ten minutes behind (a retroactive bar)',
    db: [APPLY, '    if public.hr_hunt_gap_ms(v_s) > c_slack_ms then\n', '    if false then\n'] },
  swap_bar_unread: { arm: 'SS-SWAP-VIEWED', why: 'the session keeps its set: the engine plays the old bar',
    db: [APPLY, '      update public.hunt_sessions set preset = v_p.action_set, version = version + 1 where id = v_s.id;\n', ''] },
  swap_whole_party: { arm: 'SS-SWAP-PARTY', why: 'a seat\'s swap moves every seat of the instance onto its set number',
    db: [APPLY, 'update public.hunt_sessions set preset = v_p.action_set, version = version + 1 where id = v_s.id;', 'update public.hunt_sessions set preset = v_p.action_set, version = version + 1 where instance_id = v_s.instance_id and ended_at is null;'] },
  swap_owner_lost: { arm: 'SS-SWAP-GEAR', why: 'the mid-hunt swap forgets whose gear is worn, so the next equip lands on the setup in use',
    db: [APPLY, 'set gear_set = nullif(coalesce(a.gear_set, a.action_set), excluded.action_set), action_set = excluded.action_set,', 'set gear_set = null, action_set = excluded.action_set,'] },
  follow_in_use: { arm: 'SS-SWAP-GEAR', why: 'an equip writes the setup in use, not the setup whose gear it is', db: [FOLLOW, 'p.preset = public.hr_hunt_gear_set(v_u, v_s)', 'p.preset = public.hr_hunt_active_set(v_u, v_s)'] },
  town_owner_kept: { arm: 'SS-SWAP-GEAR', why: 'a town Use keeps the old owner, so the setup it wears writes another setup\'s gear',
    db: [APPLY, 'do update set action_set = excluded.action_set, gear_set = null, updated_at = now();', 'do update set action_set = excluded.action_set, updated_at = now();'] },
  owner_trigger_off: { arm: 'SS-SWAP-GEAR', why: 'Use equipped leaves the old owner, so the next equip writes another setup', ddl: 'drop trigger hr_setup_gear_owner on public.player_hunt_active' },
  section_no_discipline: { arm: 'SS-SWAP-VIEWED', why: 'the envelope stops saying what each setup fights as',
    db: [PRESETS_VIEW, "'fights_as', f.k, 'discipline', r.discipline, 'wearing', p.preset = v_own)", "'fights_as', f.k, 'wearing', p.preset = v_own)"] },
  reader_drops_discipline: { arm: 'SS-SWAP-CLIENT', why: 'the reader drops a setup\'s discipline (no mid-hunt Use at all)',
    js: ['src/session/item-sections.js', [['discipline: str(r.discipline, 32) && ID.test(r.discipline) ? r.discipline : null,', 'discipline: null,']]] },
  swap_repin_lost: { arm: 'SS-SWAP-AGAIN', why: 'a second apply refuses because the pin forgot this file\'s own image',
    sql: [SWAP_FILE, /('public\.hr_hunt_presets_view\(uuid,integer\)', '3559cd09f0d4b233ab4d7d833a3d7dcf', ')[0-9a-f]{32}'/, '$100000000000000000000000000000000\''] },
  swap_words_lost: { arm: 'SS-SWAP-CLIENT', why: 'a setup of another weapon type says nothing on its row',
    js: ['src/shell/windows/hunt-prep/setups.js', [["return { ok: false, why: t(hasText('prep.needs_' + p.discipline) ? 'prep.needs_' + p.discipline : 'prep.needs_weapon') };", "return { ok: false, why: '' };"]]] },
};

const q = async (db, sql, params) => (await db.query(sql, params)).rows;
const one = async (db, sql, params) => { const r = await q(db, sql, params); return r[0] ? Object.values(r[0])[0] : undefined; };
const claims = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true), set_config('request.jwt.claims', $2, true), set_config('request.headers', $3, true)`,
  [uid || '', uid ? JSON.stringify({ sub: uid, role: 'authenticated' }) : '', JSON.stringify({ 'cf-connecting-ip': '198.51.100.' + (uid ? parseInt(uid.slice(-2), 16) % 200 + 10 : 1) })]);
/* A verb as a signed-in player presses it: its session, its role. */
async function as(db, uid, sql, params) {
  await claims(db, uid);
  await db.exec('set local role authenticated');
  try { return await one(db, sql, params); } finally { await db.exec('reset role'); await claims(db, null); }
}
const VERBS = {
  save: (db, slot, n, name) => as(db, A, 'select public.hr_hunt_preset_save($1::int, $2::int, $3, $4::uuid)', [slot, n, name || 'Setup', idem()]),
  put: (db, slot, n) => as(db, A, `select public.hr_action_set_put($1::int, $2::int, 'Bar', '[]'::jsonb, $3::uuid)`, [slot, n, idem()]),
  options: (db, slot, n) => as(db, A, `select public.hr_action_set_options($1::int, $2::int, '{"slots": []}'::jsonb, $3::uuid)`, [slot, n, idem()]),
  rename: (db, slot, n) => as(db, A, `select public.hr_action_set_rename($1::int, $2::int, 'Bar', $3::uuid)`, [slot, n, idem()]),
};
async function hero(db, slot, name) {
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [A]);
  await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'setup-slots guard') on conflict (user_id) do nothing`, [A]);
  if (slot > 0) await ownHeroSlots((sql, p) => db.query(sql, p), A, slot);   // one slot to start (2027-03-25-hero-slots-one.sql)
  const dye = await one(db, 'select min(idx) from public.hr_outfit_dyes');
  const r = await as(db, A, 'select public.hr_create_hero($1::int, $2, $3::jsonb, $4::uuid)', [slot, name, JSON.stringify({ head: dye, body: dye, legs: dye, feet: dye }), idem()]);
  if (!r || r.ok !== true) throw Object.assign(new Error(`hr_create_hero(${slot}, ${name}): ` + JSON.stringify(r)), { harness: true });
  await db.query(`insert into public.account_wallet (user_id, gold) values ($1, 100000000) on conflict (user_id) do update set gold = excluded.gold`, [A]);
}
const purse = (db) => one(db, 'select gold from public.account_wallet where user_id = $1', [A]).then(Number);
const section = (db, slot) => one(db, 'select public.hr_state_of($1::uuid, $2::int)', [A, slot]).then((e) => e.setup_slots);
const held = async (db, slot, n) => ({
  setup: await one(db, 'select count(*)::int from public.player_hunt_presets where user_id = $1 and slot = $2 and preset = $3', [A, slot, n]),
  bar: await one(db, 'select count(*)::int from public.player_action_sets where user_id = $1 and slot = $2 and preset = $3', [A, slot, n]),
});
const limit = (db) => one(db, `select public.hr_hunt_limit('presets')`).then(Number);

/* ── SETUPS SWITCH MID-HUNT, BAR ONLY: the real engine, from tests/hunt-sessions-settle.mjs's harness ── */
let SWAP_HARNESS = null;
async function swapHarness() {
  if (!SWAP_HARNESS) { const { HARNESS: H } = await import('./hunt-sessions-settle.mjs'); SWAP_HARNESS = { H, M: await H.loadEdge(ROOT) }; }
  return SWAP_HARNESS;
}
const DOORS = Object.freeze({
  'SS-SWAP-CLOSED': { name: 'the browser closed', mode: 'tick', project: false },
  'SS-SWAP-VIEWED': { name: 'the hunt viewed', mode: 'settle', project: true },
});
const harnessError = (m) => Object.assign(new Error(m), { harness: true });
const clearRate = (db, uid) => db.query('delete from public.hr_rate_counters where user_id = $1', [uid]);
/* An equip as the engine's equip intent lands it (hr_apply under hr_engine, the harness's exec). */
const equip = async (db, uid, delta) => {
  const { H } = await swapHarness();
  const v = await one(db, 'select version from public.player_state where user_id = $1 and slot = 0', [uid]);
  const [row] = await H.makeExec(db)('select public.hr_apply($1::uuid, 0, $2::bigint, $3::uuid, $4::text::jsonb) as r',
    [uid, v, idem(), JSON.stringify({ equip: delta, journal: { kind: 'equip', intent: 'equip' } })]);
  return row && row.r;
};
const useSetup = (db, uid, n) => as(db, uid, 'select public.hr_hunt_preset_apply(0, $1::int, $2::uuid)', [n, idem()]);
/* Everything a Use may move, and nothing else: the open session's set and clock, the setup in use and the gear's owner, every setup's
   saved gear, the worn set, the bag, the version, the receipts and the ledger. */
const swapState = (db, uid) => one(db, `select jsonb_build_object(
    'session', (select jsonb_build_object('preset', h.preset, 'version', h.version, 'settled_to', h.settled_to) from public.hunt_sessions h
                 where h.user_id = $1 and h.slot = 0 and h.ended_at is null),
    'active', (select jsonb_build_object('set', a.action_set, 'owner', a.gear_set) from public.player_hunt_active a where a.user_id = $1 and a.slot = 0),
    'gear', (select jsonb_object_agg(p.name, p.gear) from public.player_hunt_presets p where p.user_id = $1 and p.slot = 0),
    'worn', (select jsonb_object_agg(e.equip_slot, e.item_id) from public.player_equipment e where e.user_id = $1 and e.slot = 0),
    'bag', (select jsonb_object_agg(i.item_id, i.qty) from public.player_inventory i where i.user_id = $1 and i.slot = 0),
    'version', (select ps.version from public.player_state ps where ps.user_id = $1 and ps.slot = 0),
    'intents', (select count(*) from public.player_intents i where i.user_id = $1),
    'ledger', (select count(*) from public.player_ledger l where l.user_id = $1))`, [uid]);
const SWORD = 'practice_sword', SHIELD = 'practice_shield', BOOTS = 'leather_boots', BOW = 'practice_bow';
const TANK_GEAR = { shield: SHIELD, weapon: SWORD }, GUARD_GEAR = { boots: BOOTS, shield: SHIELD, weapon: SWORD }, BOW_GEAR = { weapon: BOW };
const sameJson = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}

/* In town, by the hero's own verbs: Tank (0: sword and shield, offensive), Guard (1: sword, shield and boots, defensive), Bow (2: a bow),
   then a town Use of Tank (the worn set exactly Tank's). */
async function seedSetups(db, uid) {
  const need = (what, r) => { if (!r || r.ok !== true) throw harnessError(what + ' answered ' + JSON.stringify(r)); return r; };
  await clearRate(db, uid);
  need('saving Tank', await as(db, uid, `select public.hr_hunt_preset_save(0, 0, 'Tank', $1::uuid)`, [idem()]));
  need('saving Guard', await as(db, uid, `select public.hr_hunt_preset_save(0, 1, 'Guard', $1::uuid)`, [idem()]));
  need('the boots on', await equip(db, uid, { boots: BOOTS }));
  need('saving Bow', await as(db, uid, `select public.hr_hunt_preset_save(0, 2, 'Bow', $1::uuid)`, [idem()]));
  need('the bow on', await equip(db, uid, { weapon: BOW, shield: null, boots: null }));
  await clearRate(db, uid);
  need('Tank\'s stance', await as(db, uid, `select public.hr_action_set_options(0, 0, '{"stance": "offensive"}'::jsonb, $1::uuid)`, [idem()]));
  need('Guard\'s stance', await as(db, uid, `select public.hr_action_set_options(0, 1, '{"stance": "defensive"}'::jsonb, $1::uuid)`, [idem()]));
  need('the town Use of Tank', await useSetup(db, uid, 0));
  const s = await swapState(db, uid);
  if (!sameJson(s.gear, { Tank: TANK_GEAR, Guard: GUARD_GEAR, Bow: BOW_GEAR }) || !sameJson(s.worn, TANK_GEAR)) throw harnessError('the seeded setups are ' + JSON.stringify(s));
  await clearRate(db, uid);
}

/* Settle the hunt through a door up to `toMs` (the slices a backlog takes); the last plan and commit. */
async function settleVia(H, M, db, uid, toMs, door) {
  const exec = H.makeExec(db);
  let last = null;
  for (let i = 0; i < 30; i++) {
    const plan = await M.HS.readHuntSettle({ exec, user: uid, slot: 0, grounds: H.groundsOf(M), atMs: toMs, minWindowMs: 0 }, door.mode);
    if (plan.answer) return { last, answer: plan.answer };
    const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
    if (!p.out.accrued) return { last, skipped: p.out.reason };
    const res = await M.HS.commitHuntSettle(exec, { ...p.commit, project: door.project ? { user: uid, slot: 0 } : null });
    if (!res || res.ok !== true) return { last, refused: res };
    last = { plan, res, out: p.out };
    if (!(p.out.settledTo < toMs && plan.toMs < toMs)) return { last };
  }
  return { last };
}
/* THE SEED HORIZON PASSES (1005-lever-horizon.sql): the server clock pinned a minute on (hr.test_now, the arm's transaction; main
   installs the harness's pinnable now()), so a settle may run past the horizon a mid-hunt swap waits out. `at(ms)`: an instant
   that far past the moment of the swap. */
function horizonPassed() {
  const t0 = Date.now();
  return {
    at: (ms) => t0 + ms,
    pin: (db) => db.query(`select set_config('hr.test_now', $1, true)`, [new Date(t0 + 60000).toISOString()]),
  };
}
/* The stance the stored world holds the hero on (the engine's own output). */
async function worldStance(M, db, inst) {
  const text = await one(db, 'select world::text from public.hunt_instances where id = $1', [inst]);
  const w = text ? M.WS.decodeStored(JSON.parse(text)) : null;
  const hero = w && w.units.find((u) => u.side === 'hero');
  return hero ? hero.stance : null;
}

/* One hero hunting on Tank, ten minutes in; the bar-only swap to Guard through `door`. Returns its findings and the hunt. */
async function swapThrough(db, door) {
  const { H, M } = await swapHarness();
  const uid = H.UIDS[0];
  const out = [];
  const h = await H.hunter(db, M, { ...H.STRONG, minutesAgo: 10, keepKit: true, inv: { cooked_shrimp: 30, [BOOTS]: 1 }, beforeEnter: () => seedSetups(db, uid) });
  /* (1) SETTLED FIRST: ten minutes behind, Use Guard is settle_first and moves nothing */
  let was = await swapState(db, uid);
  let r = await useSetup(db, uid, 1);
  if (!r || r.error !== 'settle_first' || !(Number(r.unsettled_ms) > 500000)) out.push(door.name + ': Use ten minutes behind answered ' + JSON.stringify(r));
  if (!sameJson(await swapState(db, uid), was)) out.push(door.name + ': a settle_first Use moved ' + JSON.stringify(was) + ' -> ' + JSON.stringify(await swapState(db, uid)));
  /* (2) the hunt settled through the door to 12 s ago, on Tank's bar */
  const first = await settleVia(H, M, db, uid, Date.now() - 12000, door);
  if (!first.last || first.refused) return { out: out.concat(door.name + ': the hunt would not settle: ' + JSON.stringify(first).slice(0, 300)), h, uid };
  const before = await worldStance(M, db, h.inst);
  if (before !== 'offensive') out.push(door.name + ': CONTROL: on Tank\'s bar the world holds the hero ' + before + ', not offensive');
  /* (3) THE SWAP: the bar only */
  await clearRate(db, uid);
  was = await swapState(db, uid);
  r = await useSetup(db, uid, 1);
  if (!r || r.ok !== true || r.bar_only !== true || !sameJson(r.worn, {}) || r.action_set !== 1 || !r.session || r.session.id !== h.sid) {
    return { out: out.concat(door.name + ': the mid-hunt Use of Guard answered ' + JSON.stringify(r)), h, uid };
  }
  const now = await swapState(db, uid);
  if (now.session.preset !== 1 || now.session.version !== was.session.version + 1 || now.session.settled_to !== was.session.settled_to) out.push(door.name + ': the session reads ' + JSON.stringify(now.session) + ' (was ' + JSON.stringify(was.session) + ')');
  if (!sameJson(now.active, { set: 1, owner: 0 })) out.push(door.name + ': the setup in use and the gear\'s owner read ' + JSON.stringify(now.active));
  if (!sameJson(now.gear, was.gear) || !sameJson(now.worn, was.worn) || !sameJson(now.bag, was.bag) || now.version !== was.version || now.ledger !== was.ledger)
    out.push(door.name + ': the bar-only swap moved gear, bag, version or ledger: ' + JSON.stringify(was) + ' -> ' + JSON.stringify(now));
  if (Number(now.intents) !== Number(was.intents) + 1) out.push(door.name + ': the swap kept ' + (now.intents - was.intents) + ' receipts');
  const env = await one(db, 'select public.hr_state_of($1::uuid, 0)', [uid]);
  const row = (n) => (env.hunt_presets || []).find((p) => p.name === n) || {};
  if (env.hunt_settings.preset !== 1 || row('Tank').fights_as !== 'shield' || row('Guard').discipline !== 'shield' || row('Bow').discipline !== 'ranged'
      || row('Tank').wearing !== true || row('Guard').wearing !== false || row('Bow').wearing !== false) {
    out.push(door.name + ': the envelope reads setup ' + env.hunt_settings.preset + ' and rows ' + JSON.stringify((env.hunt_presets || []).map((p) => [p.name, p.fights_as, p.discipline, p.wearing])));
  }
  /* (4) LEVER-HORIZON (1005-lever-horizon.sql): the swap plays from the first window STARTING past the seed horizon (since
     1049-settle-flush.sql the later of the settled point and the clock + one 2 s swing, + 32 s: under the swap's now() + 34 s, so the
     window inside it runs to 36 s on), never over swings the browser was already shown. The window inside it keeps Tank's bar; then the server clock moves on
     (pinned, main) and THE ENGINE'S NEXT SETTLE PAST IT PLAYS GUARD'S BAR: the door's read hands it Guard's stance, and its commit
     stores the hero on it */
  const later = horizonPassed();
  await later.pin(db);
  const inside = await settleVia(H, M, db, uid, later.at(36000), door);
  const kept = inside.last && inside.last.plan.members[0] && inside.last.plan.members[0].hero;
  if (!kept || kept.settings.stance !== 'offensive') out.push(door.name + ': the window inside the seed horizon read ' + JSON.stringify(kept && kept.settings) + ' (want Tank\'s offensive: a swap never plays inside the look-ahead)');
  const next = await settleVia(H, M, db, uid, later.at(60000), door);
  const hero = next.last && next.last.plan.members[0] && next.last.plan.members[0].hero;
  if (!hero || hero.settings.stance !== 'defensive') out.push(door.name + ': the next settle read ' + JSON.stringify(hero && hero.settings) + ' (want Guard\'s defensive): ' + JSON.stringify(next).slice(0, 200));
  else if (await worldStance(M, db, h.inst) !== 'defensive') out.push(door.name + ': after the next settle the world holds the hero ' + await worldStance(M, db, h.inst));
  /* (5) ANOTHER WEAPON TYPE STAYS IN TOWN */
  await clearRate(db, uid);
  was = await swapState(db, uid);
  r = await useSetup(db, uid, 2);
  if (!r || r.error !== 'setup_needs_weapon' || r.needs !== 'ranged' || r.wears !== 'shield' || r.session !== h.sid) out.push(door.name + ': Use of Bow mid-hunt answered ' + JSON.stringify(r));
  if (!sameJson(await swapState(db, uid), was)) out.push(door.name + ': a refused Use of Bow moved ' + JSON.stringify(was) + ' -> ' + JSON.stringify(await swapState(db, uid)));
  return { out, h, uid };
}
const closeHunt = async (db, uid, sid) => {
  await db.query(`select public.hr_hunt_close($1::uuid, 'left', now(), true)`, [sid]);
  await db.query(`update public.player_state set active_kind = 'idle', active_id = null where user_id = $1 and slot = 0`, [uid]);
};

const ARMS = {
  /* SAVING A SETUP IS FREE (redesign direction 9, 1049-setups-free.sql): no row and no verb sells a slot; a brand-new hero with NO GOLD
     saves a setup on every number under the limit, each through the verb a player presses, and the purse and the shop journal never move. */
  'SS-FREE': async (db, X) => {
    const out = [];
    if (X.GS.SINK_RULES.setup_slot) out.push('src/data/gold-sinks.js still has a setup_slot row');
    if (Number(await one(db, `select count(*) from public.hr_sink_rules where sink_id = 'setup_slot'`))) out.push('hr_sink_rules still sells a setup slot');
    if (await one(db, `select to_regprocedure($1) is not null`, [BUY])) out.push('hr_setup_slot_buy still exists');
    const lim = await limit(db);
    await hero(db, 0, 'Marlow');
    await db.query('update public.account_wallet set gold = 0 where user_id = $1', [A]);
    const s = await section(db, 0);
    if (!s || s.count !== lim || s.max !== lim || Object.keys(s).sort().join() !== 'count,max') out.push('a fresh hero reads ' + JSON.stringify(s));
    for (let n = 0; n < lim; n++) {
      const r = await VERBS.save(db, 0, n, 'Setup ' + (n + 1));
      if (!r || r.ok !== true) out.push(`saving setup ${n} with no gold answered ` + JSON.stringify(r));
    }
    if ((await q(db, 'select preset from public.player_hunt_presets where user_id = $1 and slot = 0', [A])).length !== lim) out.push(`fewer than ${lim} setups were saved`);
    const after = await one(db, 'select public.hr_state_of($1::uuid, 0)', [A]);
    if (X.ITEM.presetsOf({ read: (k) => after[k] }).length !== lim) out.push('the envelope does not show every saved setup');
    if (await purse(db) !== 0) out.push('saving setups moved the purse to ' + await purse(db));
    if (Number(await one(db, `select count(*) from public.player_ledger where user_id = $1 and kind = 'shop'`, [A]))) out.push('saving setups wrote a shop journal row');
    /* a second hero of the account holds the same, for nothing */
    await hero(db, 1, 'Tamsel');
    const t = await section(db, 1);
    if (!t || t.count !== lim) out.push('the second hero reads ' + JSON.stringify(t));
    return out;
  },

  /* PAST THE LIMIT: every verb that can open a number refuses it (bad_preset, its own range) and leaves no row; the shared check names the
     count and offers nothing. */
  'SS-NEW': async (db) => {
    const out = [];
    const lim = await limit(db);
    await hero(db, 0, 'Marlow');
    for (const [name, verb] of Object.entries(VERBS)) {
      const r = await verb(db, 0, lim);
      if (!r || r.error !== 'bad_preset') out.push(`${name} at ${lim} answered ` + JSON.stringify(r));
    }
    const h = await held(db, 0, lim);
    if (h.setup || h.bar) out.push('a refused verb left a row: ' + JSON.stringify(h));
    const locked = await one(db, `select public.hr_setup_locked($1::uuid, 0, $2::int)`, [A, lim]);
    if (!locked || locked.error !== 'setup_locked' || locked.slots !== lim || 'price' in locked) out.push('past the limit the check reads ' + JSON.stringify(locked));
    for (let n = 0; n < lim; n++) {
      const open = await one(db, `select public.hr_setup_locked($1::uuid, 0, $2::int)`, [A, n]);
      if (open !== null) out.push(`number ${n} under the limit is refused: ` + JSON.stringify(open));
    }
    return out;
  },

  /* A SAVED SETUP IS THE PLAYER'S: saved, used, renamed, deleted, and its number saved again, with nothing asked for it. */
  'SS-KEEP': async (db) => {
    const out = [];
    const top = await limit(db) - 1;
    await hero(db, 0, 'Marlow');
    const saved = await VERBS.save(db, 0, top, 'Last');
    if (!saved || saved.ok !== true) return ['saving the last number answered ' + JSON.stringify(saved)];
    for (const [name, verb] of Object.entries(VERBS)) {
      const r = await verb(db, 0, top);
      if (!r || r.ok !== true) out.push(`${name} on a saved setup answered ` + JSON.stringify(r));
    }
    const ren = await as(db, A, `select public.hr_hunt_preset_rename(0, $1::int, 'Older', $2::uuid)`, [top, idem()]);
    if (!ren || ren.ok !== true) out.push('rename on a saved setup answered ' + JSON.stringify(ren));
    await db.query('update public.player_hunt_active set action_set = 0 where user_id = $1 and slot = 0', [A]);
    const use = await as(db, A, 'select public.hr_hunt_preset_apply(0, $1::int, $2::uuid)', [top, idem()]);
    if (!use || use.ok !== true) out.push('Use on a saved setup answered ' + JSON.stringify(use));
    await db.query('update public.player_hunt_active set action_set = 0 where user_id = $1 and slot = 0', [A]);
    const del = await as(db, A, 'select public.hr_hunt_preset_delete(0, $1::int, $2::uuid)', [top, idem()]);
    if (!del || del.ok !== true) out.push('deleting a saved setup answered ' + JSON.stringify(del));
    const again = await VERBS.save(db, 0, top, 'Again');
    if (!again || again.ok !== true) out.push('the deleted number saved again answered ' + JSON.stringify(again));
    return out;
  },

  /* A HUNTING HERO: Save keeps its hunt_open refusal (a hunt runs on the set it entered with). */
  'SS-HUNT': async (db) => {
    const out = [];
    await hero(db, 0, 'Marlow');
    await db.query('update public.hr_hunt_config set enabled = true where id');
    await db.query(`update public.player_state set stamina_ms = 28800000, stamina_at = now() where user_id = $1 and slot = 0`, [A]);
    const entered = await as(db, A, `select public.hr_hunt_enter(0, 'mill_cellar', '[]'::jsonb, 0, null, $1::uuid)`, [idem()]);
    if (!entered || entered.ok !== true) return ['the hunt would not open: ' + JSON.stringify(entered)];
    const save = await VERBS.save(db, 0, 1);
    if (!save || save.error !== 'hunt_open') out.push('Save in a hunt answered ' + JSON.stringify(save));
    return out;
  },

  /* COPYING BARS TO ANOTHER HERO brings every number the source holds (each is open to every hero) and keeps the bar of a setup the target saved. */
  'SS-COPY': async (db) => {
    const out = [];
    const top = await limit(db) - 1;
    await hero(db, 0, 'Marlow');
    await hero(db, 1, 'Tamsel');
    for (let n = 0; n <= top; n++) await VERBS.save(db, 0, n, 'Set ' + n);
    await db.query(`delete from public.player_action_sets where user_id = $1 and slot = 0 and preset = $2`, [A, top]);
    await db.query('update public.player_hunt_active set action_set = 0 where user_id = $1 and slot = 0', [A]);
    await db.query(`insert into public.player_hunt_presets (user_id, slot, preset, name, action_set, gear, restock) values ($1, 1, $2, 'Kept', $2, '{}'::jsonb, '{}'::jsonb)`, [A, top]);
    await db.query(`insert into public.player_action_sets (user_id, slot, preset, name, slots, options) values ($1, 1, $2, 'Kept', '[{"item":"cooked_shrimp"}]'::jsonb, '{}'::jsonb)`, [A, top]);
    const r = await as(db, A, 'select public.hr_action_set_copy(0, 1, $1::uuid)', [idem()]);
    if (!r || r.ok !== true) return ['the copy answered ' + JSON.stringify(r)];
    const nums = (await q(db, 'select preset from public.player_action_sets where user_id = $1 and slot = 1 order by preset', [A])).map((x) => x.preset);
    const want = []; for (let n = 0; n <= top; n++) want.push(n);
    if (JSON.stringify(nums) !== JSON.stringify(want)) out.push(`the target holds bars ${nums}, it may hold ${want}`);
    if (Number(r.locked || 0) !== 0) out.push(`the copy says it left ${r.locked} behind`);
    const kept = (await q(db, 'select name from public.player_action_sets where user_id = $1 and slot = 1 and preset = $2', [A, top]))[0];
    if (!kept || kept.name !== 'Kept') out.push('the saved setup lost its bar: ' + JSON.stringify(kept));
    return out;
  },

  'SS-WRITERS': async (db) => {
    const out = [];
    const rows = await q(db, `select p.proname, p.prosrc from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f'
      and p.prosrc ~* 'insert\\s+into\\s+public\\.player_(action_sets|hunt_presets)'`);
    if (rows.length < 5) out.push(`only ${rows.length} writers found: the search broke, not the rule`);
    for (const r of rows) if (!/hr_setup_locked\s*\(/.test(r.prosrc)) out.push(`${r.proname} writes a setup number and never asks hr_setup_locked`);
    return out;
  },

  'SS-GRANT': async (db) => {
    const out = [];
    for (const fn of [LOCKED, OF, VIEW]) {
      for (const role of ['anon', 'authenticated']) if (await one(db, 'select has_function_privilege($1, $2, $3)', [role, fn, 'execute'])) out.push(`${role} reaches ${fn}`);
    }
    /* nothing a client can call sells a setup slot, and the baseline names no such verb */
    const sellers = await q(db, `select p.oid::regprocedure::text fn from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname ~ 'setup_slot'
      and (has_function_privilege('authenticated', p.oid, 'execute') or has_function_privilege('anon', p.oid, 'execute'))`);
    if (sellers.length) out.push('a client can call ' + sellers.map((r) => r.fn).join(', '));
    if (Number(await one(db, `select count(*)::int from public.hr_client_rpc_baseline where proname ~ 'setup_slot'`))) out.push('the client baseline names a setup slot verb');
    if (!Number(await one(db, `select count(*)::int from public.hr_state_sections where key = 'setup_slots'`))) out.push('the setup_slots section is not registered');
    try { await db.exec('select public.hr_assert_grant_hygiene(true)'); } catch (e) { out.push('grant hygiene: ' + String(e.message).slice(0, 160)); }
    return out;
  },

  'SS-AGAIN': async (db, X, mutant) => {
    const out = [];
    const text = mutant && mutant.sql ? plantSql(MIG(FILE), mutant.sql) : MIG(FILE);
    const inventory = async () => (await q(db, `select p.oid::regprocedure::text fn, md5(pg_get_functiondef(p.oid)) || ':' || coalesce(p.proacl::text, '') m from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname in ('hr_setups_bought', 'hr_setups_of', 'hr_setup_slots_view', 'hr_setup_locked', 'hr_setup_slot_buy',
        'hr_hunt_preset_save', 'hr_action_set_put', 'hr_action_set_options', 'hr_action_set_rename', 'hr_action_set_copy') order by 1`)).map((r) => r.fn + ':' + r.m).join('\n');
    const was = await inventory();
    await db.exec('savepoint again');
    try { await db.exec(text); } catch (e) {
      out.push('the second apply refused: ' + String(e.message).split('\n')[0].slice(0, 180));
      await db.exec('rollback to savepoint again');
      return out;
    }
    if ((await inventory()) !== was) out.push('a second apply moved a body');
    return out;
  },

  /* EVERY ENVELOPE BUILDS THE SECTION: it reads no table, it says what the verbs' check says for every hero, and a bought rung left
     from the priced days moves nothing. */
  'SS-PARITY': async (db) => {
    const out = [];
    const body = await one(db, `select prosrc from pg_proc where oid = $1::regprocedure`, [VIEW]);
    if (/\bfrom\s+public\./i.test(body) || /hr_sink_price\s*\(|hr_setups_of\s*\(/.test(body)) out.push('the section reads a table or a helper, on every envelope');
    await hero(db, 0, 'Marlow');
    await hero(db, 1, 'Tamsel');
    const lim = await limit(db);
    await db.query(`insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at) values ($1, 0, 'stat', 'setup_slots_bought', '', 2, now())
      on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value`, [A]);
    for (const slot of [0, 1]) {
      const s = await section(db, slot);
      const count = Number(await one(db, 'select public.hr_setups_of($1::uuid, $2::int)', [A, slot]));
      if (!s || s.count !== count || s.count !== lim || s.max !== lim || 'price' in s) out.push(`hero ${slot}: the section reads ${JSON.stringify(s)}, the verbs ${count}, the limit ${lim}`);
    }
    return out;
  },

  'SS-CLIENT': async (db, X) => {
    const out = [];
    /* THE READER: what the server sent, or nothing */
    const cs = (sec) => ({ read: (k) => (k === 'setup_slots' ? sec : undefined) });
    const good = X.ITEM.setupSlotsOf(cs({ count: 5, max: 5 }));
    if (!good || good.count !== 5 || good.max !== 5 || 'price' in good) out.push('the reader reads ' + JSON.stringify(good));
    if (X.ITEM.setupSlotsOf(cs(undefined)) !== null || X.ITEM.setupSlotsOf(cs({ max: 5 })) !== null) out.push('a section with no count is not null');
    /* THE FULL LINE AND THE REFUSAL: the server's count, nothing to buy */
    const full = 'This hero\'s 4 setup slots are full. Delete one to save a new setup.';
    if (X.WORDS.setupFullWords(4) !== full) out.push('the full line reads ' + X.WORDS.setupFullWords(4));
    if (/\bbuy\b|\bgp\b|\d,\d{3}/i.test(X.WORDS.setupFullWords(4))) out.push('the full line offers a purchase');
    if (X.WORDS.setupBuyWords !== undefined) out.push('setup-words.js still words a purchase');
    const refused = X.REF.refusalOf({ ok: true, body: { ok: false, error: 'setup_locked', slots: 4 } });
    const said = X.IW.refusalText(refused);
    if (said !== full) out.push('the refused save says ' + JSON.stringify(said));
    if (!X.IW.refusalWords('setup_locked') || X.IW.refusalWords('setup_locked') === X.RW.REFUSAL_FALLBACK) out.push('setup_locked has no plain line');
    if (X.PI.buySetupSlot !== undefined) out.push('preset-intents.js still sends a slot purchase');
    return out;
  },

  'SS-SWAP-CLOSED': async (db) => (await swapThrough(db, DOORS['SS-SWAP-CLOSED'])).out,
  'SS-SWAP-VIEWED': async (db) => (await swapThrough(db, DOORS['SS-SWAP-VIEWED'])).out,

  /* A PARTY SEAT: the rule is the seat's own session, and the instance's next settle hands only that seat the new bar. */
  'SS-SWAP-PARTY': async (db) => {
    const { H, M } = await swapHarness();
    const [lead, seat] = [H.UIDS[0], H.UIDS[1]];
    const out = [];
    const hero = { ...H.STRONG, minutesAgo: 10, keepKit: true, inv: { cooked_shrimp: 30, [BOOTS]: 1 } };
    /* both seats hold the same three setups, so a swap that reached the leader would show on its stance */
    await H.hunter(db, M, { party: [hero, hero], beforeEnter: async () => { await seedSetups(db, lead); await seedSetups(db, seat); } });
    const door = DOORS['SS-SWAP-CLOSED'];
    const first = await settleVia(H, M, db, seat, Date.now() - 12000, door);
    if (!first.last || first.refused) return ['the party hunt would not settle: ' + JSON.stringify(first).slice(0, 300)];
    const heroOf = (s, u) => ((s.last ? s.last.plan.members : []).find((m) => String(m.user) === u) || {}).hero;
    for (const u of [lead, seat]) if (!heroOf(first, u) || heroOf(first, u).settings.stance !== 'offensive') out.push('CONTROL: a seat began on ' + JSON.stringify(heroOf(first, u) && heroOf(first, u).settings));
    await clearRate(db, seat);
    const r = await useSetup(db, seat, 1);
    if (!r || r.ok !== true || r.bar_only !== true) return out.concat('a party seat\'s mid-hunt Use answered ' + JSON.stringify(r));
    /* LEVER-HORIZON: inside the seed horizon the seat keeps Tank's bar; past it, Guard's */
    const later = horizonPassed();
    await later.pin(db);
    const inside = await settleVia(H, M, db, seat, later.at(36000), door);
    if (!heroOf(inside, seat) || heroOf(inside, seat).settings.stance !== 'offensive') out.push('the seat\'s window inside the seed horizon reads ' + JSON.stringify(heroOf(inside, seat) && heroOf(inside, seat).settings));
    const next = await settleVia(H, M, db, seat, later.at(60000), door);
    if (!heroOf(next, seat) || heroOf(next, seat).settings.stance !== 'defensive') out.push('the seat\'s next settle reads ' + JSON.stringify(heroOf(next, seat) && heroOf(next, seat).settings));
    if (!heroOf(next, lead) || !sameJson(heroOf(next, lead).settings, heroOf(first, lead).settings)) out.push('the leader\'s bar moved: ' + JSON.stringify([heroOf(first, lead), heroOf(next, lead)].map((x) => x && x.settings)));
    return out;
  },

  'SS-SWAP-GEAR': async (db) => {
    const { out, h, uid } = await swapThrough(db, DOORS['SS-SWAP-CLOSED']);
    if (out.length) return out;
    const gear = async () => (await swapState(db, uid)).gear;
    /* (a) the hunt ends: the shield off goes to Tank (the gear is Tank's), Guard and Bow keep theirs; back on again */
    await closeHunt(db, uid, h.sid);
    let r = await equip(db, uid, { shield: null });
    if (!r || r.ok !== true || !sameJson(await gear(), { Tank: { weapon: SWORD }, Guard: GUARD_GEAR, Bow: BOW_GEAR })) out.push('after the hunt the shield off left ' + JSON.stringify(await gear()) + ' (' + JSON.stringify(r) + ')');
    r = await equip(db, uid, { shield: SHIELD });
    if (!r || r.ok !== true || !sameJson(await gear(), { Tank: TANK_GEAR, Guard: GUARD_GEAR, Bow: BOW_GEAR })) out.push('the shield back on left ' + JSON.stringify(await gear()));
    /* (b) a town Use of Guard wears its boots, the gear is Guard's own again, Tank is untouched */
    await clearRate(db, uid);
    r = await useSetup(db, uid, 1);
    let s = await swapState(db, uid);
    if (!r || r.ok !== true || r.bar_only || !sameJson(r.worn, { boots: BOOTS }) || !sameJson(s.worn, GUARD_GEAR) || !sameJson(s.active, { set: 1, owner: null })
        || !sameJson(s.gear, { Tank: TANK_GEAR, Guard: GUARD_GEAR, Bow: BOW_GEAR })) out.push('the town Use of Guard answered ' + JSON.stringify(r) + ' and left ' + JSON.stringify(s));
    /* (c) a second hunt on Guard; Use Tank swaps the bar onto Guard's worn gear; the hunt ends and Use equipped on Tank takes that gear */
    await clearRate(db, uid);
    r = await as(db, uid, `select public.hr_hunt_enter(0, 'mill_cellar', '[]'::jsonb, 1, null, $1::uuid)`, [idem()]);
    if (!r || r.ok !== true || !r.session) return out.concat('the second hunt would not open: ' + JSON.stringify(r));
    const second = r.session.id;
    r = await useSetup(db, uid, 0);
    s = await swapState(db, uid);
    if (!r || r.bar_only !== true || !sameJson(s.active, { set: 0, owner: 1 }) || !sameJson(s.worn, GUARD_GEAR)) out.push('the swap back to Tank answered ' + JSON.stringify(r) + ' and left ' + JSON.stringify(s.active));
    await closeHunt(db, uid, second);
    await clearRate(db, uid);
    r = await as(db, uid, `select public.hr_hunt_preset_save(0, 0, 'Tank', $1::uuid)`, [idem()]);
    s = await swapState(db, uid);
    if (!r || r.ok !== true || !sameJson(s.active, { set: 0, owner: null }) || !sameJson(s.gear, { Tank: GUARD_GEAR, Guard: GUARD_GEAR, Bow: BOW_GEAR })) out.push('Use equipped on Tank answered ' + JSON.stringify(r) + ' and left ' + JSON.stringify(s));
    r = await equip(db, uid, { boots: null });
    if (!r || r.ok !== true || !sameJson(await gear(), { Tank: TANK_GEAR, Guard: GUARD_GEAR, Bow: BOW_GEAR })) out.push('the boots off after Use equipped left ' + JSON.stringify(await gear()));
    return out;
  },

  /* A SECOND APPLY OF THE SWAP FILE IS BYTE-IDENTICAL (it is the chain's last file, so this is its own position) and refuses no pin. */
  'SS-SWAP-AGAIN': async (db0, X, mutant) => {
    const out = [];
    /* MEASURED AT THE FILE'S OWN POSITION (a replay up to it), not at the chain head: 1005-lever-horizon.sql holds a mid-hunt swap
       until the seed horizon, so this APPLIED file's §6(e) ("the engine's next read plays set 2") speaks of the chain as it stood */
    const { bootReplay } = await import('./schema-replay.mjs');
    const { db } = await bootReplay({ upTo: SWAP_FILE });
    void db0;
    await db.exec('begin');
    const text = mutant && mutant.sql ? plantSql(MIG(SWAP_FILE), mutant.sql) : MIG(SWAP_FILE);
    const inventory = async () => JSON.stringify(await q(db, `select 'fn' k, p.oid::regprocedure::text n, md5(pg_get_functiondef(p.oid)) || ':' || coalesce(p.proacl::text, '') v from pg_proc p
        where p.pronamespace = 'public'::regnamespace and p.proname in ('hr_hunt_preset_apply', 'hr_setup_gear_follow', 'hr_hunt_presets_view', 'hr_setup_fights_as', 'hr_hunt_gear_set', 'hr_setup_gear_owner')
      union all select 'trigger', t.tgname, md5(pg_get_triggerdef(t.oid)) from pg_trigger t where t.tgname in ('hr_setup_gear_owner', 'hr_setup_gear_follow') and not t.tgisinternal
      union all select 'check', c.conname, md5(pg_get_constraintdef(c.oid)) from pg_constraint c where c.conname = 'player_hunt_active_gear_set_range'
      union all select 'column', a.attname, format_type(a.atttypid, a.atttypmod) || ':' || a.attnotnull from pg_attribute a
        where a.attrelid = 'public.player_hunt_active'::regclass and a.attnum > 0 and not a.attisdropped
      order by 1, 2`));
    const was = await inventory();
    if (!/hr_setup_gear_owner/.test(was) || !/gear_set/.test(was)) return ['CONTROL: the inventory does not hold the file\'s objects: ' + was.slice(0, 200)];
    await db.exec('savepoint swap_again');
    try { await db.exec(text); } catch (e) {
      await db.exec('rollback to savepoint swap_again');
      return ['the second apply refused: ' + String(e.message).split('\n')[0].slice(0, 180)];
    }
    if ((await inventory()) !== was) out.push('a second apply moved an object');
    return out;
  },

  'SS-SWAP-CLIENT': async (db, X) => {
    const out = [];
    const cs = (sec) => ({ read: (k) => (k === 'hunt_presets' ? sec : undefined) });
    const base = { preset: 1, name: 'Guard', action_set: 1, gear: GUARD_GEAR };
    const [p] = X.ITEM.presetsOf(cs([{ ...base, fights_as: 'shield', discipline: 'shield', wearing: false }]));
    if (!p || p.fightsAs !== 'shield' || p.discipline !== 'shield' || p.wearing !== false) out.push('the reader keeps ' + JSON.stringify(p));
    const [bare] = X.ITEM.presetsOf(cs([base]));
    if (!bare || bare.fightsAs !== null || bare.discipline !== null || bare.wearing !== null) out.push('an old row reads ' + JSON.stringify(bare));
    const [odd] = X.ITEM.presetsOf(cs([{ ...base, fights_as: '<b>', discipline: 'x'.repeat(40), wearing: 'yes' }]));
    if (!odd || odd.fightsAs !== null || odd.discipline !== null || odd.wearing !== null) out.push('a forged row reads ' + JSON.stringify(odd));
    const use = X.SETUPS.midHuntUse;
    const worn = { discipline: 'shield' };
    const same = use({ preset: 1, discipline: 'shield' }, 0, worn);
    if (!same.ok || same.why) out.push('a setup of the worn type: ' + JSON.stringify(same));
    for (const [what, args] of [['the setup in use', [{ preset: 0, discipline: 'shield' }, 0, worn]], ['a row with no discipline', [{ preset: 1, discipline: null }, 0, worn]],
      ['no worn discipline', [{ preset: 1, discipline: 'shield' }, 0, { discipline: null }]], ['no settings', [{ preset: 1, discipline: 'shield' }, 0, null]]]) {
      const v = use(...args);
      if (v.ok || v.why) out.push(what + ' may swap or says ' + JSON.stringify(v));
    }
    const bow = use({ preset: 2, discipline: 'ranged' }, 0, worn);
    if (bow.ok || bow.why !== 'Town only: needs a bow or crossbow') out.push('a bow setup over a sword and shield: ' + JSON.stringify(bow));
    const strange = use({ preset: 2, discipline: 'lute' }, 0, worn);
    if (strange.ok || strange.why !== 'Town only: needs another weapon') out.push('an unknown list: ' + JSON.stringify(strange));
    if (!X.IW.refusalWords('setup_needs_weapon') || X.IW.refusalWords('setup_needs_weapon') === X.RW.REFUSAL_FALLBACK) out.push('setup_needs_weapon has no plain line');
    return out;
  },
};

function plantSql(text, [, find, repl]) {
  if (find instanceof RegExp) {
    if (!find.test(text)) throw Object.assign(new Error('sql mutant anchor not found: ' + find), { harness: true });
    return text.replace(find, repl);
  }
  if (text.split(find).length !== 2) throw Object.assign(new Error('sql mutant anchor not found once: ' + find.slice(0, 80)), { harness: true });
  return text.replace(find, () => repl);
}

async function loadReaders(root) {
  const u = (p) => pathToFileURL(join(root, p)).href + sourceQuery(root);
  return {
    GS: await import(u('src/data/gold-sinks.js')),
    ITEM: await import(u('src/session/item-sections.js')),
    WORDS: await import(u('src/shell/setup-words.js')),
    IW: await import(u('src/shell/intent-words.js')),
    RW: await import(u('src/data/refusal-words.js')),
    REF: await import(u('src/session/refusal.js')),
    PI: await import(u('src/session/preset-intents.js')),
    SETUPS: await import(u('src/shell/windows/hunt-prep/setups.js')),
  };
}

/* One arm in its own transaction, the planted defect (if any) inside it. */
async function runArm(db, X, id, mutant) {
  await db.query('begin');
  try {
    if (mutant && mutant.db) {
      const [fn, find, repl] = mutant.db;
      const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [fn])).split(String.fromCharCode(13)).join('');
      if (def.split(find).length !== 2) throw Object.assign(new Error(`mutant anchor not found once in ${fn}: ${find.slice(0, 80)}`), { harness: true });
      await db.exec(def.replace(find, () => repl));
    }
    if (mutant && mutant.ddl) await db.exec(mutant.ddl);
    return await ARMS[id](db, X, mutant);
  } finally { await db.query('rollback'); await claims(db, null).catch(() => {}); }
}

async function main() {
  if (process.argv.includes('--list')) { for (const [id, m] of Object.entries(MUTANTS)) console.log(`${id}  [${m.arm}]  ${m.why}`); return; }
  const { bootReplay } = await import('./schema-replay.mjs');
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(1); }
  /* the harness's pinnable now() (hr.test_now), so the swap arms can let the seed horizon pass (horizonPassed) */
  await (await swapHarness()).H.pinDice(db);
  const X = await loadReaders(ROOT);
  const pick = (process.argv.find((a) => a.startsWith('--mutate=')) || '').slice(9);
  if (!(process.argv.includes('--selftest') || pick)) {
    let bad = 0;
    for (const id of Object.keys(ARMS)) {
      let p;
      try { p = await runArm(db, X, id, null); } catch (e) { p = ['threw: ' + String(e && e.stack || e).slice(0, 600)]; }
      if (p.length) { bad++; for (const m of p) console.error(`✗ ${id}: ${m}`); } else console.log(`✓ ${id}`);
    }
    console.log(bad ? `setup-slots: ${bad} arm(s) red` : `setup-slots: all ${Object.keys(ARMS).length} arms green`);
    process.exit(bad ? 1 : 0);
  }
  if (pick && !MUTANTS[pick]) { console.error('unknown mutant ' + pick); process.exit(2); }
  let missed = 0;
  const ids = pick ? [pick] : Object.keys(MUTANTS);
  for (const id of ids) {
    const m = MUTANTS[id];
    let p;
    try {
      if (m.js) {
        const dir = mkdtempSync(join(tmpdir(), 'hr-ss-'));
        try {
          cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true, filter: (s) => !/\.(png|webp|jpg|ogg|mp3)$/.test(s) });
          const f = join(dir, m.js[0]);
          let src = readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
          for (const [find, repl] of m.js[1]) {
            if (src.split(find).length !== 2) throw Object.assign(new Error('js mutant anchor not found once: ' + find.slice(0, 60)), { harness: true });
            src = src.replace(find, () => repl);
          }
          writeFileSync(f, src);
          p = await runArm(db, await loadReaders(dir), m.arm, null);
        } finally { rmSync(dir, { recursive: true, force: true }); }
      } else p = await runArm(db, X, m.arm, m);
    } catch (e) {
      if (e && e.harness) { console.error(`✗ ${id}: harness: ${e.message}`); missed++; continue; }
      p = ['threw: ' + String(e && e.message || e).slice(0, 200)];
    }
    if (p.length) console.log(`✓ ${m.arm} goes red on ${id}: ${m.why}`);
    else { console.error(`✗ ${m.arm} stayed GREEN on ${id}: ${m.why}`); missed++; }
  }
  console.log(missed ? `setup-slots --selftest: ${missed} of ${ids.length} mutant(s) survived` : `setup-slots --selftest: all ${ids.length} mutants killed`);
  process.exit(missed ? 1 : 0);
}

if (isMain(import.meta.url)) await main();
