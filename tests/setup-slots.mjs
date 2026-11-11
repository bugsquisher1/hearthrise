#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/setup-slots.mjs — A HERO'S SETUPS: SOME FREE, THEN BOUGHT, UP TO THE SAME LIMIT (Tyler 2026-11-04; the designer's board section
//   "2026-11-04 Gold sinks"; 2027-02-28-setup-slots.sql; src/data/gold-sinks.js `setup_slot`).
//
//   node tests/setup-slots.mjs             the guard
//   node tests/setup-slots.mjs --list      the mutation catalogue
//   node tests/setup-slots.mjs --selftest  every planted defect must turn its arm red
//   node tests/setup-slots.mjs --mutate=<id>
//
// mutant-anchors: supabase/migrations/2027-02-28-setup-slots.sql supabase/migrations/2027-02-28-sink-price-plan.sql src/shell/setup-words.js src/session/preset-intents.js src/session/item-sections.js src/session/refusal.js src/shell/intent-words.js
//
// EVERY NUMBER HERE IS READ FROM THE ROW. Tyler may say 3 free with one row, and SS-FLIP proves all of it moves with that row.
// The real chain replayed (PGlite), real client roles, the real client modules; production untouched:
//   SS-RULE    the section reads the row; a fresh hero holds the free count; the tutorial's one save lands on a hero with no setups
//   SS-NEW     a new number at or past the count is refused setup_locked, with the numbers the words need, by EVERY verb that can open one, and leaves no row
//   SS-KEEP    A SETUP ALREADY SAVED IS NEVER BLOCKED OR DELETED: past the count it saves over, puts on, renames and edits; deleted, its number is new again
//   SS-QUOTE   a stale or forged price is quote_changed; a price of nothing is bad_quote; a short purse is insufficient_gold; refused means not charged and no rung
//   SS-ONCE    a replayed key charges once; one purchase is exactly one journal row of kind shop; a second press is a re-quote, never a second charge at the same price
//   SS-TOP     past the top rung: setup_slots_max, the section's price is null, nothing charged
//   SS-HERO    the rung is the hero's, though the purse is the account's
//   SS-HUNT    a hunting hero: Save keeps its hunt_open refusal; a purchase lands and the running hunt doesn't move
//   SS-COPY    copying bars to another hero never opens a number past its count, says how many it left, and keeps the bar of a setup it saved
//   SS-FLIP    one row moved (one more free, one rung fewer): every number follows it, and a hero who already bought keeps what it paid for
//   SS-WRITERS every function that can write a new setup number asks hr_setup_locked: a new writer can't slip in free
//   SS-GRANT   the verb is the client's and baselined; no helper is; the section is registered
//   SS-AGAIN   a second apply is byte-identical (in chain order: 2027-02-28-sink-price-plan.sql restates this file's section)
//   SS-PARITY  EVERY ENVELOPE BUILDS THE SECTION, 5.33 A WATCHED SETTLE: it calls no helper, and it tells the same truth as the verbs' helpers at every rung, past the top and on a moved row
//   SS-CLIENT  the reader, the button and the refusal's words, from the row's numbers; ONE intent with the QUOTE; a stale quote re-reads
// TRUE CONCURRENCY is unverified here (PGlite is one backend); two presses on one hero are ordered by hr_hunt_lock (the migration's header).
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { ownHeroSlots, asOldLadder } from './_slots.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = '000000c0-0000-4000-a000-0000901d7b01';
const idem = () => crypto.randomUUID();
const MIG = (f) => readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n');
const FILE = '2027-02-28-setup-slots.sql';
const PLAN = '2027-02-28-sink-price-plan.sql';
const BUY = 'public.hr_setup_slot_buy(integer,bigint,uuid)';
const LOCKED = 'public.hr_setup_locked(uuid,integer,integer)';
const OF = 'public.hr_setups_of(uuid,integer)';
const VIEW = 'public.hr_setup_slots_view(uuid,integer)';
const SAVE = 'public.hr_hunt_preset_save(integer,integer,text,uuid)';
const PUT = 'public.hr_action_set_put(integer,integer,text,jsonb,uuid)';
const OPTIONS = 'public.hr_action_set_options(integer,integer,jsonb,uuid)';
const RENAME = 'public.hr_action_set_rename(integer,integer,text,uuid)';
const COPY = 'public.hr_action_set_copy(integer,integer,uuid)';

/* ── THE PLANTED DEFECTS ─────────────────────────────────────────────────────
   db: a live body edited inside the arm's transaction (fn, find, replace). ddl: a statement in it. sql: an edit of the migration's TEXT
   the arm re-applies. js: a client module, copied and edited. Each names the arm that must go red. */
const LOCK_CHECK = "  v_lock := public.hr_setup_locked(v_uid, p_slot, p_preset);\n  if v_lock is not null then return public.hr_note_rejection(c_verb, p_slot, v_lock); end if;\n";
export const MUTANTS = {
  price_from_client: { arm: 'SS-QUOTE', why: 'the verb charges the client\'s number', db: [BUY, '  if v_price <> p_price then\n', '  if false then\n'] },
  no_replay: { arm: 'SS-ONCE', why: 'a replayed key is not looked up, so hr_apply answers it and the rung moves again',
    db: [BUY, '  if v_r is not null then return public.hr_note_rejection(c_verb, p_slot, v_r); end if;\n', ''] },
  charged_twice: { arm: 'SS-ONCE', why: 'one purchase journals two rows',
    db: [BUY, "  -- THE RUNG, raise-only: nothing can take a bought slot back.\n", "  perform public.hr_apply(v_uid, p_slot, v_ver + 1, gen_random_uuid(), jsonb_build_object('gold', -1, 'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb)));\n"] },
  wrong_kind: { arm: 'SS-ONCE', why: 'the journal row is not kind shop', db: [BUY, "jsonb_build_object('kind', 'shop', 'intent', v_verb,", "jsonb_build_object('kind', 'wallet', 'intent', v_verb,"] },
  rung_not_written: { arm: 'SS-ONCE', why: 'the purchase charges and opens nothing',
    db: [BUY, "values (v_uid, p_slot, 'stat', 'setup_slots_bought', '', v_bought + 1, now())", "values (v_uid, p_slot, 'stat', 'setup_slots_bought', '', v_bought, now())"] },
  rung_on_all_heroes: { arm: 'SS-HERO', why: 'the rung is read across the account',
    db: ['public.hr_setups_bought(uuid,integer)', "where p.user_id = p_user and p.slot = p_slot and p.kind = 'stat'", "where p.user_id = p_user and p.kind = 'stat'"] },
  past_top_charged: { arm: 'SS-TOP', why: 'past the top rung the last price is charged again',
    db: [BUY, "  v_price := case when public.hr_setups_of(v_uid, p_slot) < v_lim then public.hr_sink_price('setup_slot', v_bought) end;\n",
      "  v_price := coalesce(case when public.hr_setups_of(v_uid, p_slot) < v_lim then public.hr_sink_price('setup_slot', v_bought) end, p_price);\n"] },
  free_hardcoded: { arm: 'SS-FLIP', why: 'the count stops reading the row',
    db: [OF, "  select r.free into v_free from public.hr_sink_rules r where r.sink_id = 'setup_slot';\n", '  v_free := 2;\n'] },
  no_cap: { arm: 'SS-PARITY', why: 'the verbs\' count runs past the hero\'s limit', db: [OF, 'return least(v_free + public.hr_setups_bought(p_user, p_slot), v_lim);', 'return v_free + public.hr_setups_bought(p_user, p_slot);'] },
  saved_blocked: { arm: 'SS-KEEP', why: 'a setup past the count is refused though the hero saved it',
    db: [LOCKED, "     or exists (select 1 from public.player_hunt_presets p where p.user_id = p_user and p.slot = p_slot and p.preset = p_preset)\n     or exists (select 1 from public.player_action_sets a where a.user_id = p_user and a.slot = p_slot and a.preset = p_preset) then", ' then'] },
  bar_not_kept: { arm: 'SS-KEEP', why: 'a bar with no setup past the count is refused', db: [LOCKED, "\n     or exists (select 1 from public.player_action_sets a where a.user_id = p_user and a.slot = p_slot and a.preset = p_preset) then", ' then'] },
  save_unchecked: { arm: 'SS-NEW', why: 'Save opens a new number for free',
    db: [SAVE, "  v_r := public.hr_setup_locked(v_uid, p_slot, p_preset);\n  if v_r is not null then return public.hr_note_rejection('hunt_preset_save', p_slot, v_r); end if;\n", ''] },
  put_unchecked: { arm: 'SS-NEW', why: 'the old bar verb opens a new number for free', db: [PUT, LOCK_CHECK, ''] },
  options_unchecked: { arm: 'SS-NEW', why: 'a bar option opens a new number for free', db: [OPTIONS, LOCK_CHECK, ''] },
  rename_unchecked: { arm: 'SS-NEW', why: 'naming a bar opens a new number for free',
    db: [RENAME, "  v_r := public.hr_setup_locked(v_uid, p_slot, p_preset);\n  if v_r is not null then return public.hr_note_rejection('action_set_rename', p_slot, v_r); end if;\n", ''] },
  locked_no_numbers: { arm: 'SS-NEW', why: 'the refusal drops the numbers its words say', db: [LOCKED, "'slots', v_count,\n", "\n"] },
  copy_opens_numbers: { arm: 'SS-COPY', why: 'a copy brings numbers past the target\'s count', db: [COPY, ' and a.preset = any (v_open);', ';'] },
  copy_takes_saved_bar: { arm: 'SS-COPY', why: 'a copy deletes the bar of a saved setup',
    db: [COPY, "\n     and (exists (select 1 from public.player_action_sets a where a.user_id = v_uid and a.slot = p_from and a.preset = t.preset)\n          or not exists (select 1 from public.player_hunt_presets p where p.user_id = v_uid and p.slot = p_to and p.preset = t.preset));", ';'] },
  verb_open_to_anon: { arm: 'SS-GRANT', why: 'anon can buy', ddl: `grant execute on function public.hr_setup_slot_buy(integer, bigint, uuid) to anon` },
  helper_open: { arm: 'SS-GRANT', why: 'a client role can call a helper', ddl: `grant execute on function public.hr_setups_of(uuid, integer) to authenticated` },
  no_baseline: { arm: 'SS-GRANT', why: 'the verb is not on the client baseline', ddl: `delete from public.hr_client_rpc_baseline where proname = 'hr_setup_slot_buy'` },
  no_section: { arm: 'SS-RULE', why: 'the section is not registered', ddl: `delete from public.hr_state_sections where key = 'setup_slots'` },
  new_writer: { arm: 'SS-WRITERS', why: 'a new verb writes a setup number and never asks',
    ddl: `create function public.hr_zz_writer(p_user uuid, p_slot int, p_n int) returns void language sql as $fn$ insert into public.player_action_sets (user_id, slot, preset, name, slots, options) values (p_user, p_slot, p_n, 'x', '[]'::jsonb, '{}'::jsonb) $fn$` },
  section_wrong_rung: { arm: 'SS-PARITY', why: 'the section quotes the rung after the verb\'s', db: [VIEW, "'price', r.prices[b.n + 1])", "'price', r.prices[b.n + 2])"] },
  section_no_cap: { arm: 'SS-PARITY', why: 'the section\'s count runs past the limit', db: [VIEW, "'count', least(r.free + b.n, r.free + cardinality(r.prices)),", "'count', r.free + b.n,"] },
  section_all_heroes: { arm: 'SS-PARITY', why: 'the section reads the rung across the account', db: [VIEW, "where p.user_id = p_user and p.slot = p_slot and p.kind = 'stat'", "where p.user_id = p_user and p.kind = 'stat' and p.slot <> p_slot"] },
  section_calls_helper: { arm: 'SS-PARITY', why: 'the section reads through the price helper again, on every settle', db: [VIEW, "'price', r.prices[b.n + 1])", "'price', public.hr_sink_price('setup_slot', b.n))"] },
  repin_lost: { arm: 'SS-AGAIN', why: 'a second apply refuses because the pin forgot this file\'s own image', sql: [FILE, /('public\.hr_action_set_copy\(integer,integer,uuid\)', 'f1f349d0e3eebcd4441019d8056dc57c', ')[0-9a-f]{32}'/, '$100000000000000000000000000000000\''] },
  words_two: { arm: 'SS-CLIENT', why: 'the button hardcodes the third slot',
    js: ['src/shell/setup-words.js', [["return 'Buy ' + aNew(count + 1) + ' setup: ' + gold(price);", "return 'Buy a third setup: ' + gold(price);"]]] },
  words_full_lost: { arm: 'SS-CLIENT', why: 'the refusal drops its price', js: ['src/shell/intent-words.js', [["return setupFullWords(r.figures.slots, Number.isInteger(r.figures.price) ? r.figures.price : null);", 'return setupFullWords(r.figures.slots, null);']]] },
  figures_dropped: { arm: 'SS-CLIENT', why: 'the session drops the refusal\'s numbers', js: ['src/session/refusal.js', [["'min_skill_level', 'slots', 'price', 'per_day']", "'min_skill_level', 'per_day']"]]] },
  reader_invents: { arm: 'SS-CLIENT', why: 'a section with no count reads as the limit', js: ['src/session/item-sections.js', [["if (!isObj(s) || count(s.count) === null || count(s.max) === null) return null;", "if (!isObj(s)) return { count: 5, max: 5, price: null };"]]] },
  buy_own_price: { arm: 'SS-CLIENT', why: 'the press sends a price of its own', js: ['src/session/preset-intents.js', [["p_slot: cs.slot, p_price: price, p_idem: newIdem()", 'p_slot: cs.slot, p_price: 1, p_idem: newIdem()']]] },
  stale_not_reread: { arm: 'SS-CLIENT', why: 'a stale quote stays on the button', js: ['src/session/preset-intents.js', [["if (r.error === 'quote_changed' && cs.status !== 'closed') await cs.load();", '']]] },
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
const buy = (db, slot, price, key) => as(db, A, 'select public.hr_setup_slot_buy($1::int, $2::bigint, $3::uuid)', [slot, price, key || idem()]);
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
const journal = (db, slot) => q(db, `select kind, intent, gold from public.player_ledger where user_id = $1 and slot = $2 and intent like 'setup\\_slot\\_buy:%' order by id`, [A, slot]);
const rule = async (db) => { const r = (await q(db, `select free, prices from public.hr_sink_rules where sink_id = 'setup_slot'`))[0]; return { free: Number(r.free), prices: r.prices.map(Number) }; };
const limit = (db) => one(db, `select public.hr_hunt_limit('presets')`).then(Number);

const ARMS = {
  'SS-RULE': async (db, X) => {
    const out = [];
    const R = await rule(db);
    const d = X.GS.SINK_RULES.setup_slot;
    if (R.free !== d.free || JSON.stringify(R.prices) !== JSON.stringify(d.prices)) out.push('the table and the data file disagree');
    if (R.free + R.prices.length !== await limit(db)) out.push('free + prices is not the limit');
    await hero(db, 0, 'Marlow');
    const s = await section(db, 0);
    if (!s) return ['the envelope has no setup_slots section'];
    if (s.count !== R.free || s.free !== R.free || s.bought !== 0 || s.max !== await limit(db) || Number(s.price) !== R.prices[0]) out.push('a fresh hero reads ' + JSON.stringify(s));
    /* THE TUTORIAL'S save_setup: one setup, on a hero with none, on the first free number */
    const before = await purse(db);
    const saved = await VERBS.save(db, 0, 0, 'Keep this bar');
    if (!saved || saved.ok !== true) out.push('the tutorial\'s one save answered ' + JSON.stringify(saved));
    const after = await one(db, 'select public.hr_state_of($1::uuid, 0)', [A]);
    if (!X.ITEM.presetsOf({ read: (k) => after[k] }).length) out.push('the tutorial\'s setup_saved fact would not see the save');
    if (await purse(db) !== before) out.push('the free save cost gold');
    return out;
  },

  'SS-NEW': async (db) => {
    const out = [];
    const R = await rule(db);
    await hero(db, 0, 'Marlow');
    const next = R.free;
    for (const [name, verb] of Object.entries(VERBS)) {
      const r = await verb(db, 0, next);
      if (!r || r.error !== 'setup_locked') out.push(`${name} at ${next} answered ` + JSON.stringify(r));
      else if (r.slots !== R.free || Number(r.price) !== R.prices[0]) out.push(`${name}'s refusal carries ` + JSON.stringify(r));
    }
    const h = await held(db, 0, next);
    if (h.setup || h.bar) out.push('a refused verb left a row: ' + JSON.stringify(h));
    /* under the count every verb still works */
    const under = R.free - 1;
    if (under > 0) for (const [name, verb] of Object.entries(VERBS)) {
      const r = await verb(db, 0, under);
      if (!r || r.ok !== true) out.push(`${name} at ${under} (under the count) answered ` + JSON.stringify(r));
    }
    return out;
  },

  'SS-KEEP': async (db) => {
    const out = [];
    const R = await rule(db);
    const top = await limit(db) - 1;
    await hero(db, 0, 'Marlow');
    await VERBS.save(db, 0, 0, 'First');
    /* a hero who already holds setups past the free count (saved while they were free) */
    await db.query(`insert into public.player_hunt_presets (user_id, slot, preset, name, action_set, gear, restock) values ($1, 0, $2, 'Old', $2, '{}'::jsonb, '{}'::jsonb)`, [A, top]);
    await db.query(`insert into public.player_action_sets (user_id, slot, preset, name, slots, options) values ($1, 0, $2, 'Old', '[]'::jsonb, '{}'::jsonb)`, [A, top]);
    for (const [name, verb] of Object.entries(VERBS)) {
      const r = await verb(db, 0, top);
      if (!r || r.ok !== true) out.push(`${name} on a setup already saved answered ` + JSON.stringify(r));
    }
    const ren = await as(db, A, `select public.hr_hunt_preset_rename(0, $1::int, 'Older', $2::uuid)`, [top, idem()]);
    if (!ren || ren.ok !== true) out.push('rename on a setup already saved answered ' + JSON.stringify(ren));
    await db.query('update public.player_hunt_active set action_set = 0 where user_id = $1 and slot = 0', [A]);
    const use = await as(db, A, 'select public.hr_hunt_preset_apply(0, $1::int, $2::uuid)', [top, idem()]);
    if (!use || use.ok !== true) out.push('Use on a setup already saved answered ' + JSON.stringify(use));
    /* a bare bar on a number past the count is also not new */
    const bare = R.free;
    if (bare !== top) {
      await db.query(`insert into public.player_action_sets (user_id, slot, preset, name, slots, options) values ($1, 0, $2, 'Bare', '[]'::jsonb, '{}'::jsonb)`, [A, bare]);
      const r = await VERBS.options(db, 0, bare);
      if (!r || r.ok !== true) out.push('a bar already on a number past the count answered ' + JSON.stringify(r));
    }
    /* the migration deletes nothing: a second apply leaves the row */
    if ((await held(db, 0, top)).setup !== 1) out.push('the setup past the count is gone');
    /* deleted, its number is new again */
    await db.query('update public.player_hunt_active set action_set = 0 where user_id = $1 and slot = 0', [A]);
    const del = await as(db, A, 'select public.hr_hunt_preset_delete(0, $1::int, $2::uuid)', [top, idem()]);
    if (!del || del.ok !== true) out.push('deleting a setup past the count answered ' + JSON.stringify(del));
    const again = await VERBS.save(db, 0, top);
    if (!again || again.error !== 'setup_locked') out.push('a deleted number past the count answered ' + JSON.stringify(again));
    return out;
  },

  'SS-QUOTE': async (db) => {
    const out = [];
    const R = await rule(db);
    await hero(db, 0, 'Marlow');
    const was = await purse(db);
    for (const forged of [R.prices[0] + 1, R.prices[0] - 1, 1]) {
      const r = await buy(db, 0, forged);
      if (!r || r.error !== 'quote_changed') out.push(`a price of ${forged} answered ` + JSON.stringify(r));
    }
    for (const junk of [0, -5]) {
      const r = await buy(db, 0, junk);
      if (!r || r.error !== 'bad_quote') out.push(`a price of ${junk} answered ` + JSON.stringify(r));
    }
    /* A PRICE MOVED UNDER THE PLAYER: what was on screen is stale */
    await db.query(`update public.hr_sink_rules set prices[1] = prices[1] + 500 where sink_id = 'setup_slot'`);
    const stale = await buy(db, 0, R.prices[0]);
    if (!stale || stale.error !== 'quote_changed' || !stale.setup_slots || Number(stale.setup_slots.price) !== R.prices[0] + 500) out.push('a stale price answered ' + JSON.stringify(stale));
    await db.query(`update public.hr_sink_rules set prices[1] = prices[1] - 500 where sink_id = 'setup_slot'`);
    if (await purse(db) !== was) out.push('a refused price moved gold');
    if ((await journal(db, 0)).length) out.push('a refused price wrote a journal row');
    /* A SHORT PURSE: hr_apply's words, no rung */
    await db.query('update public.account_wallet set gold = $2 where user_id = $1', [A, R.prices[0] - 1]);
    const short = await buy(db, 0, R.prices[0]);
    if (!short || short.error !== 'insufficient_gold') out.push('a short purse answered ' + JSON.stringify(short));
    if (await purse(db) !== R.prices[0] - 1) out.push('a short purse moved gold');
    if ((await section(db, 0)).count !== R.free) out.push('a short purse opened a slot');
    return out;
  },

  'SS-ONCE': async (db) => {
    const out = [];
    const R = await rule(db);
    await hero(db, 0, 'Marlow');
    const was = await purse(db);
    const key = idem();
    const first = await buy(db, 0, R.prices[0], key);
    if (!first || first.ok !== true) return ['the purchase answered ' + JSON.stringify(first)];
    const replay = await buy(db, 0, R.prices[0], key);
    if (!replay || replay.ok !== true) out.push('the replay answered ' + JSON.stringify(replay));
    if (await purse(db) !== was - R.prices[0]) out.push(`the purse moved ${was - await purse(db)}, not ${R.prices[0]}`);
    const rows = await journal(db, 0);
    if (rows.length !== 1) out.push(`${rows.length} journal rows for one purchase`);
    else if (rows[0].kind !== 'shop' || rows[0].intent !== 'setup_slot_buy:' + R.prices[0] || Number(rows[0].gold) !== -R.prices[0]) out.push('the journal row reads ' + JSON.stringify(rows[0]));
    const s = await section(db, 0);
    if (s.count !== R.free + 1 || s.bought !== 1 || Number(s.price) !== R.prices[1]) out.push('after one purchase the section reads ' + JSON.stringify(s));
    /* the key can't buy the next rung either, and a second press at the old price is a re-quote */
    const again = await buy(db, 0, R.prices[0]);
    if (!again || again.error !== 'quote_changed') out.push('a second press at the old price answered ' + JSON.stringify(again));
    const crossed = await buy(db, 0, R.prices[1], key);
    if (crossed && crossed.ok === true) out.push('one key bought a second rung');
    if ((await journal(db, 0)).length !== 1) out.push('a re-press wrote another journal row');
    /* the bought number opens */
    const opened = await VERBS.save(db, 0, R.free);
    if (!opened || opened.ok !== true) out.push('the bought number answered ' + JSON.stringify(opened));
    return out;
  },

  'SS-TOP': async (db) => {
    const out = [];
    const R = await rule(db);
    await hero(db, 0, 'Marlow');
    for (const p of R.prices) {
      const r = await buy(db, 0, p);
      if (!r || r.ok !== true) return [`the rung at ${p} answered ` + JSON.stringify(r)];
    }
    const s = await section(db, 0);
    if (s.count !== await limit(db) || s.price !== null) out.push('at the top the section reads ' + JSON.stringify(s));
    const was = await purse(db);
    for (const p of [R.prices[R.prices.length - 1], 1]) {
      const r = await buy(db, 0, p);
      if (!r || r.error !== 'setup_slots_max') out.push(`past the top, a price of ${p} answered ` + JSON.stringify(r));
    }
    if (await purse(db) !== was) out.push('past the top moved gold');
    if ((await journal(db, 0)).length !== R.prices.length) out.push('past the top wrote a journal row');
    /* the limit itself is unmoved: every number is a setup */
    const lim = await limit(db);
    const beyond = await VERBS.save(db, 0, lim);
    if (!beyond || beyond.error !== 'bad_preset') out.push('a number past the limit answered ' + JSON.stringify(beyond));
    return out;
  },

  'SS-HERO': async (db) => {
    const out = [];
    const R = await rule(db);
    await hero(db, 0, 'Marlow');
    await hero(db, 1, 'Tamsel');
    const was = await purse(db);
    const r = await buy(db, 0, R.prices[0]);
    if (!r || r.ok !== true) return ['the purchase answered ' + JSON.stringify(r)];
    const other = await section(db, 1);
    if (other.count !== R.free || other.bought !== 0 || Number(other.price) !== R.prices[0]) out.push('the other hero reads ' + JSON.stringify(other));
    const locked = await VERBS.save(db, 1, R.free);
    if (!locked || locked.error !== 'setup_locked') out.push('the other hero\'s new number answered ' + JSON.stringify(locked));
    /* the purse is the account's: both heroes read it, and the second pays from it */
    const env = await one(db, 'select public.hr_state_of($1::uuid, 1)', [A]);
    if (Number(env.state.gold) !== was - R.prices[0]) out.push('the other hero reads the purse as ' + env.state.gold);
    const second = await buy(db, 1, R.prices[0]);
    if (!second || second.ok !== true) out.push('the other hero\'s own first rung answered ' + JSON.stringify(second));
    if (await purse(db) !== was - 2 * R.prices[0]) out.push('two heroes\' purchases moved the purse by ' + (was - await purse(db)));
    return out;
  },

  'SS-HUNT': async (db) => {
    const out = [];
    const R = await rule(db);
    await hero(db, 0, 'Marlow');
    await db.query('update public.hr_hunt_config set enabled = true where id');
    const GEN = await import(pathToFileURL(join(ROOT, 'tools/gen-hunt-sessions.mjs')).href);
    const room = { id: 'ss_cellar', hunt: 'mill_cellar', map: 'ss_cellar', start: [[1, 1]], pockets: [{ room: [3, 1, 6, 3], spawns: [{ monster: 'rat', x: 4, y: 2 }] }], route: [0], respawnMs: 60000, pullDist: 1.5 };
    const { rows, spawns } = GEN.groundRows({ ss_cellar: room });
    for (const g of rows) await db.query(`insert into public.hr_hunt_grounds (hunt_id, ground_id, pockets, spawns, respawn_ms, seats, density_max) values ($1,$2,$3,$4,$5,$6,$7::int[])
      on conflict (hunt_id) do update set ground_id = excluded.ground_id, pockets = excluded.pockets, spawns = excluded.spawns, respawn_ms = excluded.respawn_ms, seats = excluded.seats, density_max = excluded.density_max`,
      [g.hunt, g.ground, g.pockets, g.spawns, g.respawn, g.seats, g.dmax]);
    await db.query('delete from public.hr_hunt_ground_spawns where hunt_id = $1', ['mill_cellar']);
    for (const x of spawns) await db.query('insert into public.hr_hunt_ground_spawns (hunt_id, monster_id, n) values ($1,$2,$3) on conflict do nothing', [x.hunt, x.monster, x.n]);
    await db.query(`update public.player_state set stamina_ms = 28800000, stamina_at = now() where user_id = $1 and slot = 0`, [A]);
    const entered = await as(db, A, `select public.hr_hunt_enter(0, 'mill_cellar', '[]'::jsonb, 0, null, $1::uuid)`, [idem()]);
    if (!entered || entered.ok !== true) return ['the hunt would not open: ' + JSON.stringify(entered)];
    const session = (await q(db, 'select id, preset, settled_to, leave_at, ended_at from public.hunt_sessions where user_id = $1 and slot = 0 and ended_at is null', [A]))[0];
    if (!session) return ['no open session after the enter'];
    /* the existing refusal for what a hunt forbids */
    const save = await VERBS.save(db, 0, 1);
    if (!save || save.error !== 'hunt_open') out.push('Save in a hunt answered ' + JSON.stringify(save));
    /* the purchase lands (the design's pattern names no hunting refusal for a hero sink), once */
    const was = await purse(db);
    const r = await buy(db, 0, R.prices[0]);
    if (!r || r.ok !== true) return out.concat('a hunting hero\'s purchase answered ' + JSON.stringify(r));
    if (await purse(db) !== was - R.prices[0]) out.push('the hunting purchase moved the purse by ' + (was - await purse(db)));
    const after = (await q(db, 'select id, preset, settled_to, leave_at, ended_at from public.hunt_sessions where id = $1', [session.id]))[0];
    if (JSON.stringify(after) !== JSON.stringify(session)) out.push('the running hunt moved: ' + JSON.stringify(after));
    return out;
  },

  'SS-COPY': async (db) => {
    const out = [];
    const R = await rule(db);
    const top = await limit(db) - 1;
    await hero(db, 0, 'Marlow');
    await hero(db, 1, 'Tamsel');
    /* the source opened every number; the target holds one saved setup past its count */
    for (const p of R.prices) await buy(db, 0, p);
    for (let n = 0; n <= top; n++) await VERBS.save(db, 0, n, 'Set ' + n);
    await db.query(`delete from public.player_action_sets where user_id = $1 and slot = 0 and preset = $2`, [A, top]);
    await db.query('update public.player_hunt_active set action_set = 0 where user_id = $1 and slot = 0', [A]);
    await db.query(`insert into public.player_hunt_presets (user_id, slot, preset, name, action_set, gear, restock) values ($1, 1, $2, 'Kept', $2, '{}'::jsonb, '{}'::jsonb)`, [A, top]);
    await db.query(`insert into public.player_action_sets (user_id, slot, preset, name, slots, options) values ($1, 1, $2, 'Kept', '[{"item":"cooked_shrimp"}]'::jsonb, '{}'::jsonb)`, [A, top]);
    const r = await as(db, A, 'select public.hr_action_set_copy(0, 1, $1::uuid)', [idem()]);
    if (!r || r.ok !== true) return ['the copy answered ' + JSON.stringify(r)];
    const nums = (await q(db, 'select preset from public.player_action_sets where user_id = $1 and slot = 1 order by preset', [A])).map((x) => x.preset);
    const want = []; for (let n = 0; n < R.free; n++) want.push(n);
    want.push(top);
    if (JSON.stringify(nums) !== JSON.stringify(want)) out.push(`the target holds bars ${nums}, it may hold ${want}`);
    const left = top - R.free;   // the source's numbers from the free count up to, not including, the kept one
    if (r.locked !== left) out.push(`the copy says it left ${r.locked}, it left ${left}`);
    const kept = (await q(db, 'select name from public.player_action_sets where user_id = $1 and slot = 1 and preset = $2', [A, top]))[0];
    if (!kept || kept.name !== 'Kept') out.push('the saved setup lost its bar: ' + JSON.stringify(kept));
    /* and it made no number free: the next one past the count is still refused */
    if (R.free < top) {
      const next = await VERBS.save(db, 1, R.free);
      if (!next || next.error !== 'setup_locked') out.push('after a copy the next number answered ' + JSON.stringify(next));
    }
    return out;
  },

  'SS-FLIP': async (db) => {
    const out = [];
    const R = await rule(db);
    await hero(db, 0, 'Marlow');
    await hero(db, 1, 'Tamsel');
    const bought = await buy(db, 1, R.prices[0]);
    if (!bought || bought.ok !== true) return ['the purchase before the flip answered ' + JSON.stringify(bought)];
    /* "3 free": one more free, one rung fewer. The designer's own example of the one row. */
    const flipped = { free: R.free + 1, prices: R.prices.slice(1) };
    await db.query(`update public.hr_sink_rules set free = $1, prices = $2::bigint[] where sink_id = 'setup_slot'`, [flipped.free, flipped.prices]);
    const s = await section(db, 0);
    if (s.count !== flipped.free || Number(s.price) !== flipped.prices[0]) out.push('after the flip a fresh hero reads ' + JSON.stringify(s));
    const open = await VERBS.save(db, 0, R.free);
    if (!open || open.ok !== true) out.push('the number the flip made free answered ' + JSON.stringify(open));
    const stillLocked = flipped.free < await limit(db) ? await VERBS.save(db, 0, flipped.free) : { error: 'setup_locked' };
    if (!stillLocked || stillLocked.error !== 'setup_locked') out.push('the next number after the flip answered ' + JSON.stringify(stillLocked));
    /* the hero who already bought keeps it; the count is still capped at the limit */
    const paid = await section(db, 1);
    if (paid.count !== flipped.free + 1) out.push('a hero who bought before the flip reads ' + JSON.stringify(paid));
    const lim = await limit(db);
    await db.query(`insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at) values ($1, 1, 'stat', 'setup_slots_bought', '', 99, now())
      on conflict (user_id, slot, kind, key, period_key) do update set value = 99`, [A]);
    const capped = await section(db, 1);
    if (capped.count !== lim || capped.price !== null) out.push('the count ran past the limit: ' + JSON.stringify(capped));
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
    for (const fn of [LOCKED, OF, VIEW, 'public.hr_setups_bought(uuid,integer)']) {
      for (const role of ['anon', 'authenticated']) if (await one(db, 'select has_function_privilege($1, $2, $3)', [role, fn, 'execute'])) out.push(`${role} reaches ${fn}`);
    }
    if (await one(db, 'select has_function_privilege($1, $2, $3)', ['anon', BUY, 'execute'])) out.push('anon can buy');
    if (!(await one(db, 'select has_function_privilege($1, $2, $3)', ['authenticated', BUY, 'execute']))) out.push('a player cannot buy');
    if (!(await one(db, `select count(*)::int from public.hr_client_rpc_baseline where proname = 'hr_setup_slot_buy' and grantee = 'authenticated'`))) out.push('the verb is not on the baseline');
    try { await db.exec('select public.hr_assert_grant_hygiene(true)'); } catch (e) { out.push('grant hygiene: ' + String(e.message).slice(0, 160)); }
    return out;
  },

  'SS-AGAIN': async (db, X, mutant) => {
    const out = [];
    const text = mutant && mutant.sql ? plantSql(MIG(FILE), mutant.sql) : MIG(FILE);
    const inventory = async () => (await q(db, `select p.oid::regprocedure::text fn, md5(pg_get_functiondef(p.oid)) m from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname in ('hr_setups_bought', 'hr_setups_of', 'hr_setup_slots_view', 'hr_setup_locked', 'hr_setup_slot_buy',
        'hr_hunt_preset_save', 'hr_action_set_put', 'hr_action_set_options', 'hr_action_set_rename', 'hr_action_set_copy') order by 1`)).map((r) => r.fn + ':' + r.m).join('\n');
    const was = await inventory();
    await db.exec('savepoint again');
    /* the file's own self-check makes a second hero unpaid: re-applied on the ladder it was written against (tests/_slots.mjs) */
    try { await asOldLadder((sql) => db.exec(sql), () => db.exec(text)); await db.exec(MIG(PLAN)); } catch (e) {
      out.push('the second apply refused: ' + String(e.message).split('\n')[0].slice(0, 180));
      await db.exec('rollback to savepoint again');
      return out;
    }
    if ((await inventory()) !== was) out.push('a second apply moved a body');
    return out;
  },

  'SS-PARITY': async (db) => {
    const out = [];
    const body = await one(db, `select prosrc from pg_proc where oid = $1::regprocedure`, [VIEW]);
    if (/hr_sink_price\s*\(|hr_setups_of\s*\(|hr_setups_bought\s*\(|hr_hunt_limit\s*\(/.test(body)) out.push('the section calls a helper, on every settle');
    const lang = await one(db, `select l.lanname from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = 'public.hr_sink_price(text,integer,integer)'::regprocedure`);
    if (lang !== 'plpgsql') out.push('hr_sink_price is ' + lang + ': PostgreSQL 17 re-plans it per call');
    await hero(db, 0, 'Marlow');
    await hero(db, 1, 'Tamsel');
    const check = async (label) => {
      const R = await rule(db), lim = await limit(db);
      for (let n = 0; n <= R.prices.length + 2; n++) {
        await db.query(`insert into public.player_progress (user_id, slot, kind, key, period_key, value, updated_at) values ($1, 0, 'stat', 'setup_slots_bought', '', $2, now())
          on conflict (user_id, slot, kind, key, period_key) do update set value = excluded.value`, [A, n]);
        const s = await section(db, 0);
        const count = Number(await one(db, 'select public.hr_setups_of($1::uuid, 0)', [A]));
        const quote = count < lim ? await one(db, `select public.hr_sink_price('setup_slot', $1::int)`, [n]) : null;
        if (s.count !== count || s.bought !== n || s.max !== lim || s.free !== R.free || (s.price === null ? null : Number(s.price)) !== (quote === null ? null : Number(quote))) {
          out.push(`${label}, rung ${n}: the section reads ${JSON.stringify(s)}, the verbs ${count} and ${quote}`);
        }
      }
    };
    await check('as shipped');
    /* the other hero's rung stays the other hero's */
    const other = await section(db, 1);
    if (other.bought !== 0) out.push('the other hero reads ' + JSON.stringify(other));
    /* one row moved: one more free, one rung fewer */
    const R0 = await rule(db);
    await db.query(`update public.hr_sink_rules set free = $1, prices = $2::bigint[] where sink_id = 'setup_slot'`, [R0.free + 1, R0.prices.slice(1)]);
    await check('the row moved');
    return out;
  },

  'SS-CLIENT': async (db, X) => {
    const out = [];
    const R = X.GS.SINK_RULES.setup_slot;
    const ordinal = ['first', 'second', 'third', 'fourth', 'fifth'][R.free];
    const gp = (n) => n.toLocaleString('en-US') + ' gp';
    /* THE READER: what the server sent, or nothing */
    const cs = (sec) => ({ read: (k) => (k === 'setup_slots' ? sec : undefined) });
    const good = X.ITEM.setupSlotsOf(cs({ count: R.free, free: R.free, bought: 0, max: 5, price: R.prices[0] }));
    if (!good || good.count !== R.free || good.price !== R.prices[0]) out.push('the reader reads ' + JSON.stringify(good));
    if (X.ITEM.setupSlotsOf(cs(undefined)) !== null || X.ITEM.setupSlotsOf(cs({ price: 5 })) !== null) out.push('a section with no count is not null');
    const top = X.ITEM.setupSlotsOf(cs({ count: 5, max: 5, price: null }));
    if (!top || top.price !== null) out.push('past the top the reader reads ' + JSON.stringify(top));
    /* THE BUTTON AND THE REFUSAL, in the design's words with the row's numbers */
    const button = X.WORDS.setupBuyWords(R.free, R.prices[0]);
    if (button !== `Buy a ${ordinal} setup: ${gp(R.prices[0])}`) out.push('the button reads ' + button);
    const flipped = X.WORDS.setupBuyWords(R.free + 1, R.prices[1]);
    if (!flipped.includes(['first', 'second', 'third', 'fourth', 'fifth'][R.free + 1])) out.push('one more free still reads ' + flipped);
    const full = `This hero's ${R.free} setup slots are full. Delete one, or buy a ${ordinal} for ${gp(R.prices[0])}.`;
    if (X.WORDS.setupFullWords(R.free, R.prices[0]) !== full) out.push('the refusal\'s words read ' + X.WORDS.setupFullWords(R.free, R.prices[0]));
    /* the server's refusal, through the session's reader, into the sentence */
    const refused = X.REF.refusalOf({ ok: true, body: { ok: false, error: 'setup_locked', slots: R.free, price: R.prices[0] } });
    const said = X.IW.refusalText(refused);
    if (said !== full) out.push('the refused save says ' + JSON.stringify(said));
    if (!X.IW.refusalWords('setup_locked') || X.IW.refusalWords('setup_locked') === X.RW.REFUSAL_FALLBACK) out.push('setup_locked has no plain line');
    if (X.IW.refusalWords('setup_slots_max') === X.RW.REFUSAL_FALLBACK) out.push('setup_slots_max has no plain line');
    /* ONE INTENT WITH THE QUOTE; a stale quote re-reads, so the next press is priced right */
    const calls = [];
    let loads = 0;
    const answers = [{ ok: true, body: { ok: true } }, { ok: true, body: { ok: false, error: 'quote_changed' } }];
    const account = { server: { rpc: async (name, body) => { calls.push({ name, body }); return answers.shift(); } } };
    const c = { slot: 2, status: 'open', load: async () => { loads++; return true; } };
    const a1 = await X.PI.buySetupSlot(account, c, R.prices[0]);
    if (!a1.ok || calls.length !== 1 || calls[0].name !== 'hr_setup_slot_buy' || calls[0].body.p_slot !== 2 || calls[0].body.p_price !== R.prices[0] || !calls[0].body.p_idem) out.push('the press sent ' + JSON.stringify(calls));
    if (loads !== 1) out.push('an accepted purchase re-read ' + loads + ' times');
    const a2 = await X.PI.buySetupSlot(account, c, R.prices[0]);
    if (a2.ok || a2.error !== 'quote_changed') out.push('a stale quote answered ' + JSON.stringify(a2));
    if (loads !== 2) out.push('a stale quote did not re-read');
    const none = await X.PI.buySetupSlot(account, c, 0);
    if (none.ok || calls.length !== 2) out.push('a price of 0 went out');
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
  const v = (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
  const u = (p) => pathToFileURL(join(root, p)).href + '?v=' + v;
  return {
    GS: await import(u('src/data/gold-sinks.js')),
    ITEM: await import(u('src/session/item-sections.js')),
    WORDS: await import(u('src/shell/setup-words.js')),
    IW: await import(u('src/shell/intent-words.js')),
    RW: await import(u('src/data/refusal-words.js')),
    REF: await import(u('src/session/refusal.js')),
    PI: await import(u('src/session/preset-intents.js')),
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
