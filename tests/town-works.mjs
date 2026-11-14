#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/town-works.mjs — THE TOWN WORKS: THE WHOLE SERVER GIVES GOLD, AND HAVORA RAISES THE WEIGHHOUSE (Tyler 2026-11-04; the designer's board section "2026-11-04 Gold sinks";
//   2027-03-04-town-works*.sql; src/data/town-works.js). The real race is tests/town-shows-race.mjs (R7-R10); the played walk is tests/town-works-world.mjs.
//
//   node tests/town-works.mjs             the guard
//   node tests/town-works.mjs --list      the mutation catalogue
//   node tests/town-works.mjs --selftest  every planted defect must turn its arm red
//   node tests/town-works.mjs --mutate=<id>
//
// mutant-anchors: supabase/migrations/2027-03-04-town-works.sql
//
// The real chain replayed (PGlite), the real client modules and map; production untouched:
//   TW-RULES   hr_town_works holds exactly the data file's rows; every stage's art exists and shares one frame, anchor and footprint
//   TW-GIVE    one gift: the amount leaves the purse, one journal row, kind shop, intent town_works:<project>:<amount>; a replayed key charges once; no XP; a hunting hero may give
//   TW-ONLY    only hr_town_works_give writes the totals and the gifts; no client role reaches a table or a helper
//   TW-REFUSE  under the smallest, over today, over the project, past the finish: refused under the server's clock, before any charge; the last coins can still be given
//   TW-CAP     the day's cap is the ACCOUNT's, across heroes, and it comes back the next UTC day; the lock order is hero, sink key, the count, the charge, the project's key
//   TW-LOST    a gift that loses the race rolls back whole: purse, journal, intent, gold given, totals, gifts, line; the same key still works
//   TW-GIVEN   Gold Given rises by the gift, for the hero who gave, in the charge's transaction
//   TW-STAGE   each stage's System line fires once per crossing, as the town, naming no giver; a gift across two stages says both; the finish takes no more and stands
//   TW-PLAQUE  the top accounts, each as its lead hero; a hidden hero can't lead, a hidden account holds no place, a blocked name reads Name hidden; no account id leaves
//   TW-VIEW    the window's read: the server's numbers, own place and total off the plaque's end, the last gift, the most that can go today
//   TW-EXTRAS  a gift reaches every viewer's town read, and the map draws its stage from that alone
//   TW-MAP     the lot blocks from stage 0 and a stage never moves what blocks; the oak is gone; compose y-sorts the stage's art with the people, and the fire's ambient draw never carries it
//   TW-TAP     the plaque opens Works; a site opens Works on its own tiles and the street above it still walks; finished, it opens the Market
//   TW-NO-BUFF THE STANDING GUARD: nothing in the engine, XP, drops or prices reads a project: a gold-funded power effect is on Tyler's avoid list
//   TW-AGAIN   a second apply of both files is byte-identical and keeps what was given
//   TW-WORDS   every refusal says why in the designer's sentence, with the server's numbers; Gold Given names the Works
//   TW-WINDOW  the tab is listed; its buttons, field and lines read the server's answer, field by field
// TRUE CONCURRENCY: PGlite is one backend, so TW-LOST proves the order and the rollback; tests/town-shows-race.mjs runs both on real PostgreSQL 17 backends.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { ownHeroSlots } from './_slots.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = '000000c0-0000-4000-a000-0000901d8a01';
const B = '000000c0-0000-4000-a000-0000901d8a02';
const P = 'weighhouse';
const idem = () => crypto.randomUUID();
const MIG = (f) => readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n');
const CATALOGUE = '2027-03-04-town-works-catalogue.generated.sql';
const WORKS = '2027-03-04-town-works.sql';
const GIVE = 'public.hr_town_works_give(integer,text,bigint,uuid)';
const VIEW = 'public.hr_town_works_view(integer)';
const NOTICE = 'public.hr_town_notice(text,text)';
const LEAD = 'public.hr_town_works_lead(uuid,bigint[])';
const PLAQUE = 'public.hr_town_works_plaque(text,uuid,integer)';
const EXTRAS = 'public.hr_town_extras(text)';
const FAULT = 'public.hr_town_works_fault(bigint,bigint,bigint,bigint,bigint)';
const GIVEN = 'public.hr_town_works_given_today(uuid)';

/* ── THE PLANTED DEFECTS ─────────────────────────────────────────────────────
   db: a live body edited inside the arm's transaction (fn, find, replace). ddl: a statement in it. sql: an edit of a migration's TEXT the arm re-applies.
   js: a client module, copied and edited. Each names the arm that must go red. */
export const MUTANTS = {
  rules_drift: { arm: 'TW-RULES', why: 'the table no longer says what the data file says', ddl: `update public.hr_town_works set per_day = 50000 where project_id = 'weighhouse'` },
  stage_art_frame: { arm: 'TW-RULES', why: 'a stage drawn on another frame jumps when it swaps',
    js: ['src/data/town-works.js', [["stage(600000, 'havora_weighhouse_walled',", "stage(600000, 'havora_tavern',"]]] },
  /* A GIFT */
  charge_twice: { arm: 'TW-GIVE', why: 'a gift charges double', db: [GIVE, "             'gold', -p_amount,\n", "             'gold', -2 * p_amount,\n"] },
  gift_pays_xp: { arm: 'TW-GIVE', why: 'a gift pays XP: the buff on the avoid list', db: [GIVE, "             'gold', -p_amount,\n", "             'gold', -p_amount, 'xp', jsonb_build_object('inner_flame', 500),\n"] },
  wrong_kind: { arm: 'TW-GIVE', why: 'the journal row is not kind shop', db: [GIVE, "jsonb_build_object('kind', 'shop', 'intent', v_verb,", "jsonb_build_object('kind', 'craft', 'intent', v_verb,"] },
  intent_no_amount: { arm: 'TW-GIVE', why: 'the journal row leaves the amount out', db: [GIVE, "  v_verb := 'town_works:' || p_project || ':' || p_amount;\n", "  v_verb := 'town_works:' || p_project;\n"] },
  replay_gone: { arm: 'TW-GIVE', why: 'a replayed key is not answered from its decision',
    db: [GIVE, "  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);\n  if v_r is not null then return public.hr_note_rejection('town_works', p_slot, v_r); end if;\n  -- THE CATALOGUE\n", "  -- THE CATALOGUE\n",
      "  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);\n  if v_r is not null then return public.hr_note_rejection('town_works', p_slot, v_r); end if;\n  select version into v_ver", "  select version into v_ver"] },
  refuses_hunting: { arm: 'TW-GIVE', why: 'a hunting hero is refused, though the purse is the account\'s and nothing walks',
    db: [GIVE, "  -- THE ACCOUNT'S DAY, under its key", "  if exists (select 1 from public.hunt_sessions h where h.user_id = v_uid and h.slot = p_slot and h.ended_at is null) then return jsonb_build_object('ok', false, 'error', 'hunting'); end if;\n  -- THE ACCOUNT'S DAY, under its key"] },
  /* ONLY THE VERB WRITES */
  second_writer: { arm: 'TW-ONLY', why: 'another function moves the total', ddl: `create function public.hr__zz_bump() returns void language sql as $f$ update public.town_works_totals set total = total + 1 $f$` },
  gifts_second_writer: { arm: 'TW-ONLY', why: 'another function writes a gift', ddl: `create function public.hr__zz_gift() returns void language sql as $f$ delete from public.town_works_gifts $f$` },
  table_open: { arm: 'TW-ONLY', why: 'a client can read the gifts', ddl: 'grant select on public.town_works_gifts to authenticated' },
  policy_open: { arm: 'TW-ONLY', why: 'a policy opens the totals', ddl: 'create policy zz_open on public.town_works_totals for select to authenticated using (true)' },
  notice_open: { arm: 'TW-ONLY', why: 'a client can speak as the town', ddl: 'grant execute on function public.hr_town_notice(text, text) to authenticated' },
  anon_gives: { arm: 'TW-ONLY', why: 'a signed-out call reaches the verb', ddl: 'grant execute on function public.hr_town_works_give(integer, text, bigint, uuid) to anon' },
  /* THE RULE */
  no_minimum: { arm: 'TW-REFUSE', why: 'a 1 gp gift is taken', db: [FAULT, "    when p_amount < least(p_min, p_left) then jsonb_build_object('error', 'works_small', 'min', least(p_min, p_left))\n", ''] },
  no_project_cap: { arm: 'TW-REFUSE', why: 'a gift over what the project needs is taken', db: [FAULT, "    when p_amount > p_left and p_left <= p_per_day - p_given then jsonb_build_object('error', 'works_short', 'left', p_left)\n", ''] },
  no_finish: { arm: 'TW-REFUSE', why: 'a finished project keeps taking gifts', db: [FAULT, "    when p_left <= 0 then jsonb_build_object('error', 'works_done')\n", ''] },
  last_coins_stuck: { arm: 'TW-REFUSE', why: 'the last 50 gp can never be given, so the project never finishes', db: [FAULT, "    when p_amount < least(p_min, p_left) then", "    when p_amount < p_min then"] },
  fault_after_charge: { arm: 'TW-REFUSE', why: 'the first read of the rule moves after the charge, so a refusal pays first',
    db: [GIVE, "  if v_fault is not null then\n    return public.hr_note_rejection('town_works', p_slot, v_fault || jsonb_build_object('ok', false, 'project', p_project)); end if;\n  begin\n", "  begin\n"] },
  /* THE ACCOUNT'S DAY */
  no_day_cap: { arm: 'TW-CAP', why: 'the day\'s cap is never read', db: [FAULT, "    when p_amount > p_per_day - p_given then jsonb_build_object('error', 'works_over', 'left', p_per_day - p_given)\n", ''] },
  cap_per_hero: { arm: 'TW-CAP', why: 'each hero has its own 25,000, so four heroes give 100,000',
    db: [GIVEN, "where g.user_id = p_user and g.day = (now() at time zone 'utc')::date", "where g.user_id = p_user and g.day = (now() at time zone 'utc')::date and g.by_slot[1] = 0"] },
  cap_never_resets: { arm: 'TW-CAP', why: 'yesterday\'s gifts still count', db: [GIVEN, " and g.day = (now() at time zone 'utc')::date", ''] },
  day_keeps_counting: { arm: 'TW-CAP', why: 'a new day adds to yesterday\'s count instead of starting it', db: [GIVE, "          day_gold = case when g.day = v_day then g.day_gold + p_amount else p_amount end,\n", "          day_gold = g.day_gold + p_amount,\n"] },
  sink_lock_gone: { arm: 'TW-CAP', why: 'two heroes pressing together both read what\'s left', db: [GIVE, "  perform public.hr_sink_lock(v_uid);\n", ''] },
  works_key_first: { arm: 'TW-CAP', why: 'the project\'s key comes before the purse, so one account\'s settle can hold the Works',
    db: [GIVE, "    -- THE CHARGE: gold only, never an xp key and never an item. Exactly one journal row.\n", "    perform pg_advisory_xact_lock(hashtextextended('hr:works:' || p_project, 0));\n"] },
  /* A LOST RACE */
  race_not_checked: { arm: 'TW-LOST', why: 'a gift that lost the race overfills the project',
    db: [GIVE, "    if v_fault is not null then raise exception using errcode = 'HR943', message = 'town_works lost the race'; end if;\n", ''] },
  race_charges: { arm: 'TW-LOST', why: 'a gift that lost the race keeps the charge',
    db: [GIVE, "raise exception using errcode = 'HR943', message = 'town_works lost the race'; end if;", "return v_fault || jsonb_build_object('ok', false, 'project', p_project); end if;"] },
  stale_total: { arm: 'TW-LOST', why: 'the total is never read again under the key, so a gift adds to a stale number',
    db: [GIVE, "    v_total := coalesce((select t.total from public.town_works_totals t where t.project_id = p_project), 0);\n    v_fault := public.hr_town_works_fault(v_p.min_gift, v_p.per_day, v_goal - v_total, v_given, p_amount);\n    if v_fault is not null then raise", "    if v_fault is not null then raise"] },
  /* GOLD GIVEN */
  given_not_counted: { arm: 'TW-GIVEN', why: 'a gift never reaches the board', db: [GIVE, "    perform public.hr_gold_given_add(v_uid, p_slot, p_amount);\n", ''] },
  given_to_slot_zero: { arm: 'TW-GIVEN', why: 'every gift counts to the first hero', db: [GIVE, "    perform public.hr_gold_given_add(v_uid, p_slot, p_amount);\n", "    perform public.hr_gold_given_add(v_uid, 0, p_amount);\n"] },
  /* THE STAGE LINES */
  line_every_gift: { arm: 'TW-STAGE', why: 'the line fires on every gift past the stage', db: [GIVE, "      if v_total < v_p.stage_at[v_k] and v_after >= v_p.stage_at[v_k] then\n", "      if v_after >= v_p.stage_at[v_k] then\n"] },
  line_early: { arm: 'TW-STAGE', why: 'the line fires one coin short of the stage', db: [GIVE, "and v_after >= v_p.stage_at[v_k] then\n", "and v_after + 1 >= v_p.stage_at[v_k] then\n"] },
  one_line_per_gift: { arm: 'TW-STAGE', why: 'a gift across two stages says only the first', db: [GIVE, "        perform public.hr_town_notice(v_p.name, v_p.stage_lines[v_k]);\n", "        perform public.hr_town_notice(v_p.name, v_p.stage_lines[v_k]);\n        exit;\n"] },
  town_speaks_as_giver: { arm: 'TW-STAGE', why: 'the line reads as the giver\'s, and a block hides it', db: [NOTICE, "  perform set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);\n", ''] },
  claims_half_cleared: { arm: 'TW-STAGE', why: 'on production auth.uid() reads request.jwt.claims too, so the line still reads as the giver', db: [NOTICE, "set_config('request.jwt.claim.sub', '', true), set_config('request.jwt.claims', '', true);", "set_config('request.jwt.claim.sub', '', true);"] },
  claims_not_restored: { arm: 'TW-STAGE', why: 'the verb carries on with no session after the line', db: [NOTICE, "  perform set_config('request.jwt.claim.sub', coalesce(v_sub, ''), true), set_config('request.jwt.claims', coalesce(v_claims, ''), true);\n", ''] },
  finish_not_stamped: { arm: 'TW-STAGE', why: 'the finish is never stamped', db: [GIVE, "values (p_project, v_after, case when v_after >= v_goal then now() end, now())", "values (p_project, v_after, null, now())"] },
  /* THE PLAQUE */
  plaque_no_limit: { arm: 'TW-PLAQUE', why: 'the plaque names everyone', db: [PLAQUE, "                   limit p_top) s) r", "                   ) s) r"] },
  plaque_wrong_order: { arm: 'TW-PLAQUE', why: 'the plaque leads with the smallest', db: [PLAQUE, "                   order by g.gold desc, g.last_at, g.user_id\n", "                   order by g.gold, g.last_at, g.user_id\n"] },
  lead_is_first_hero: { arm: 'TW-PLAQUE', why: 'the name is the first hero, not the one who gave most', db: [LEAD, "   order by p_by[h.slot + 1] desc, h.slot\n", "   order by h.slot\n"] },
  hidden_can_lead: { arm: 'TW-PLAQUE', why: 'a hidden hero is named on the plaque',
    db: [LEAD, "     and not exists (select 1 from public.hr_lb_hidden x where x.user_id = h.user_id and (x.slot is null or x.slot = h.slot))\n", ''] },
  name_not_masked: { arm: 'TW-PLAQUE', why: 'a blocked name reaches the plaque', db: [PLAQUE, "case when public.hr_name_blocked(r.name) then 'Name hidden' else r.name end", 'r.name'] },
  plaque_leaks_id: { arm: 'TW-PLAQUE', why: 'the plaque carries an account id', db: [PLAQUE, "'gold', r.gold)\n", "'gold', r.gold, 'user_id', r.user_id)\n"] },
  mine_for_all: { arm: 'TW-PLAQUE', why: 'every row is marked as the viewer\'s', db: [PLAQUE, "case when r.user_id = p_viewer then", "case when r.user_id is not null then"] },
  /* THE READ */
  view_ignores_day: { arm: 'TW-VIEW', why: 'the window always says the whole 25,000 is left', db: [VIEW, "  v_day_left := greatest(v_p.per_day - v_given, 0);\n", "  v_day_left := v_p.per_day;\n"] },
  view_forgets_gift: { arm: 'TW-VIEW', why: 'the window can\'t open on the last gift', db: [VIEW, "'last_gift', v_g.last_gift, ", "'last_gift', null, "] },
  view_counts_hidden: { arm: 'TW-VIEW', why: 'a hidden account ahead pushes the place down', db: [VIEW, "       and public.hr_town_works_lead(o.user_id, o.by_slot) is not null;\n", ";\n"] },
  view_mine_in_top_only: { arm: 'TW-VIEW', why: 'an account off the plaque has no place', db: [VIEW, "  if v_g.user_id is not null and public.hr_town_works_lead(v_uid, v_g.by_slot) is not null then\n", "  if false then\n"] },
  /* THE MAP */
  extras_always_zero: { arm: 'TW-EXTRAS', why: 'a gift never reaches the map', db: [EXTRAS, "public.hr_town_works_stage(w.stage_at, t.total)", '0'] },
  extras_other_map: { arm: 'TW-EXTRAS', why: 'every town draws the Weighhouse', db: [EXTRAS, "      where w.map_id = p_map\n", '\n'] },
  swap_stuck: { arm: 'TW-EXTRAS', why: 'the map never draws past stage 0',
    js: ['src/world/town-works.js', [["    out = out ? Object.assign({}, out, swaps[stage]) : swaps[stage];\n", '']]] },
  swap_trusts_junk: { arm: 'TW-EXTRAS', why: 'a stage past the end draws a missing sprite',
    js: ['src/world/town-works.js', [["    if (!Number.isInteger(stage) || stage < 1 || stage >= swaps.length) continue;\n", '']]] },
  swap_any_map: { arm: 'TW-EXTRAS', why: 'the swap reaches another town',
    js: ['src/world/town-works.js', [["    if (TOWN_WORKS[id].map !== map.id) continue;\n", '']]] },
  lot_off_map: { arm: 'TW-MAP', why: 'the lot blocks nothing, so walkability moves with the art',
    js: ['src/data/world/town/sites.js', [["['havora_weighhouse_staked', 94, 55], ", '']]] },
  oak_back: { arm: 'TW-MAP', why: 'the oak still stands on the lot',
    js: ['src/data/world/town/greenery.js', [["export const GREENERY = Object.freeze([\n", "export const GREENERY = Object.freeze([\n  ['oak', 98, 58],\n"]]] },
  compose_ignores_swap: { arm: 'TW-MAP', why: 'the stage\'s art is never drawn',
    js: ['src/world/core/compose.js', [["place(swap || o.id, o.x, o.y, { fp: [o.fw, o.fh] });", 'place(o.id, o.x, o.y, { fp: [o.fw, o.fh] });']]] },
  lot_is_an_effect: { arm: 'TW-MAP', why: 'the lot draws over everyone, as the fire does',
    js: ['src/data/world/town/sites.js', [["export const AMBIENT = Object.freeze([Object.freeze({ id: 'hearth_fire', x: 117, y: 48, lift: 86 })]);", "export const AMBIENT = Object.freeze([Object.freeze({ id: 'hearth_fire', x: 117, y: 48, lift: 86 }), Object.freeze({ id: 'havora_weighhouse_staked', x: 98, y: 60, lift: 0 })]);"]]] },
  /* THE TAPS */
  plaque_is_a_prop: { arm: 'TW-TAP', why: 'a tap on the plaque opens nothing', js: ['src/data/world/sink-taps.js', [["  havora_weighhouse_plaque: works,\n", '']]] },
  finished_is_a_prop: { arm: 'TW-TAP', why: 'the finished Weighhouse is no door to the Market', js: ['src/data/world/sink-taps.js', [["  havora_weighhouse_finished: Object.freeze({ open: 'window', window: 'market' }),\n", '']]] },
  street_opens_window: { arm: 'TW-TAP', why: 'a tap on the street above a staked-out plot opens the window',
    js: ['src/world/steer-local.js', [["    if (opens && opens.lot && !(pick.tile[0] >= hit.tx && pick.tile[0] < hit.tx + opens.lot[0] && pick.tile[1] >= hit.ty && pick.tile[1] < hit.ty + opens.lot[1])) continue;\n", '']]] },
  /* THE STANDING GUARD: NO POWER */
  xp_reads_total: { arm: 'TW-NO-BUFF', why: 'an XP rate reads the project\'s total',
    ddl: `create function public.hr_works_xp_rate() returns numeric language sql stable as $f$ select 1 + coalesce(sum(total), 0) / 1000000.0 from public.town_works_totals $f$` },
  price_reads_gifts: { arm: 'TW-NO-BUFF', why: 'a discount reads what an account gave',
    ddl: `create function public.hr_works_discount(p_user uuid) returns numeric language sql stable as $f$ select coalesce(sum(gold), 0) / 1000000.0 from public.town_works_gifts where user_id = p_user $f$` },
  view_feeds_engine: { arm: 'TW-NO-BUFF', why: 'a view exposes the totals to whatever wants them', ddl: 'create view public.hr_works_done as select project_id from public.town_works_totals where finished_at is not null' },
  drop_reads_extras: { arm: 'TW-NO-BUFF', why: 'a drop rate reads the map\'s stage', ddl: `create function public.hr_works_drop_boost(p_map text) returns jsonb language sql stable as $f$ select public.hr_town_extras(p_map) $f$` },
  trigger_on_totals: { arm: 'TW-NO-BUFF', why: 'a trigger on the totals feeds something else',
    ddl: `create function public.hr__zz_noop() returns trigger language plpgsql as $f$ begin return new; end $f$; create trigger zz_noop after update on public.town_works_totals for each row execute function public.hr__zz_noop()` },
  trigger_wears_the_wall: { arm: 'TW-NO-BUFF', why: "a meter on the totals hides under the Game Master wall's name",
    ddl: `create function public.hr__zz_noop() returns trigger language plpgsql as $f$ begin return new; end $f$; create or replace trigger hr_gm_wall before insert on public.town_works_totals for each row execute function public.hr__zz_noop()` },
  engine_names_works: { arm: 'TW-NO-BUFF', why: 'an engine file reads a project', plant: 'engineFile' },
  works_in_edge: { arm: 'TW-NO-BUFF', why: 'the project\'s data reaches the edge bundle', plant: 'edgeFile' },
  client_price_reads_extras: { arm: 'TW-NO-BUFF', why: 'a client module outside the Works reads the map\'s extras', plant: 'clientFile' },
  /* A SECOND APPLY */
  catalogue_resets: { arm: 'TW-AGAIN', why: 'a re-apply of the catalogue deletes what the gifts point at',
    sql: [CATALOGUE, "insert into public.hr_town_works (project_id,", "delete from public.town_works_gifts; delete from public.town_works_totals; delete from public.hr_town_works;\ninsert into public.hr_town_works (project_id,"] },
  /* THE WORDS AND THE WINDOW */
  over_says_nothing: { arm: 'TW-WORDS', why: 'over today\'s cap reads the plain line, without its number', js: ['src/shell/sink-words.js', [["if (r.error === 'works_over' && num(r.left)) return", 'if (false) return']]] },
  short_says_nothing: { arm: 'TW-WORDS', why: 'over the project reads the plain line, without its number', js: ['src/shell/sink-words.js', [["if (r.error === 'works_short' && num(r.left)) return", 'if (false) return']]] },
  join_forgets_works: { arm: 'TW-WORDS', why: 'Gold Given\'s join line leaves the Works out',
    js: ['src/data/honor-roll.js', [["join: 'Give to the Town Works, throw a Hearth powder, stand a round or pay the Town Crier.'", "join: 'Throw a Hearth powder, stand a round or pay the Town Crier.'"]]] },
  tab_hidden: { arm: 'TW-WINDOW', why: 'the Works tab stays hidden', js: ['src/shell/windows/havora/works.js', [["label: 'Works', shown: true", "label: 'Works', shown: false"]]] },
  answer_in_the_flow: { arm: 'TW-WINDOW', why: 'a refusal is drawn under the fold, where a short window never shows it', js: ['src/shell/windows/havora/works.js', [["  text(root.querySelector('.hh-intent-msg'), sc.msg);\n", "  text(pane.querySelector('.hv-works-msg'), sc.msg);\n"]]] },
  day_in_the_flow: { arm: 'TW-WINDOW', why: 'what the day leaves is cut off at the window\'s foot', js: ['src/shell/windows/havora/works.js', [["  text(root.querySelector('.hv-count[data-of=\"works\"]'), w ? todayWords(w) : '');\n", "  text(pane.querySelector('.hv-works-today'), w ? todayWords(w) : '');\n"]]] },
  gift_over_purse_on: { arm: 'TW-WINDOW', why: 'a gift the purse can\'t pay stays live and is refused after the press', js: ['src/shell/windows/havora/works.js', [["prop(b, 'disabled', off || short > 0);", "prop(b, 'disabled', off);"]]] },
  max_ignores_purse: { arm: 'TW-WINDOW', why: 'the last button offers today\'s room over a short purse', js: ['src/shell/windows/havora/works.js', [['return Number.isSafeInteger(purse) ? Math.max(0, Math.min(w.maxGift, purse)) : w.maxGift;', 'return w.maxGift;']]] },
  purse_unsaid: { arm: 'TW-WINDOW', why: 'nothing under the buttons says why they are off', js: ['src/shell/windows/havora/works.js', [["  text(pane.querySelector('.hv-works-why'), purseWords(w, purse, row.gifts));\n", '']]] },
  max_ignores_project: { arm: 'TW-WINDOW', why: 'the last button says "left today" when the project needs less', js: ['src/shell/windows/havora/works.js', [["  return w.left < w.leftToday ? 'Give the ' + gold(w.maxGift) + ' it still needs' : 'Give the ' + gold(w.maxGift) + ' left today';", "  return 'Give the ' + gold(w.maxGift) + ' left today';"]]] },
  parse_trusts_junk: { arm: 'TW-WINDOW', why: 'a broken answer reaches the window', js: ['src/session/town-intents.js', [["  if (!isObj(b) || b.ok !== true || !word(b.project) || int(b.total) === null || int(b.goal) === null || int(b.stage) === null || !Array.isArray(b.stage_at)) return null;\n", "  if (!isObj(b)) return null;\n"]]] },
  giver_names_total: { arm: 'TW-WINDOW', why: 'the intent sends more than the gift', js: ['src/session/town-intents.js', [["p_project: project, p_amount: amount, p_idem:", "p_project: project, p_amount: amount, p_total: amount, p_idem:"]]] },
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
async function hero(db, uid, slot, name) {
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'town-works guard') on conflict (user_id) do nothing`, [uid]);
  const dye = await one(db, 'select min(idx) from public.hr_outfit_dyes');
  if (slot > 0) await ownHeroSlots((sql, p) => db.query(sql, p), uid, slot);   // one slot to start (2027-03-25-hero-slots-one.sql)
  const r = await as(db, uid, 'select public.hr_create_hero($1::int, $2, $3::jsonb, $4::uuid)', [slot, name, JSON.stringify({ head: dye, body: dye, legs: dye, feet: dye }), idem()]);
  if (!r || r.ok !== true) throw Object.assign(new Error(`hr_create_hero(${slot}, ${name}): ` + JSON.stringify(r)), { harness: true });
}
const purse = async (db, u) => Number(await one(db, 'select gold from public.account_wallet where user_id = $1', [u]));
const rich = (db, u, g = 10000000) => db.query('update public.account_wallet set gold = $2 where user_id = $1', [u, g]);
const give = (db, u, slot, amount, key, project = P) => as(db, u, 'select public.hr_town_works_give($1::int, $2, $3::bigint, $4::uuid)', [slot, project, amount, key || idem()]);
const calm = (db) => db.query('delete from public.hr_rate_counters');
const shopRows = (db, u) => q(db, "select slot, intent, gold::bigint as gold from public.player_ledger where user_id = $1 and kind = 'shop' order by at, intent", [u]);
const total = async (db, project = P) => Number((await one(db, 'select total from public.town_works_totals where project_id = $1', [project])) || 0);
const setTotal = (db, n, project = P) => (n > 0 ? db.query('insert into public.town_works_totals (project_id, total) values ($1, $2) on conflict (project_id) do update set total = excluded.total', [project, n])
  : db.query('delete from public.town_works_totals where project_id = $1', [project]));
const lines = (db) => q(db, "select from_id, from_slot, from_name, body from public.chat_messages where channel = 'system' and from_name = 'The Weighhouse' order by created_at");
const firstHunt = (db) => one(db, 'select g.hunt_id from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id order by coalesce(h.band_min, 0), g.hunt_id limit 1');
const blockedName = async (db) => {
  const stem = await one(db, "select b.stem from public.hr_name_blocklist b where b.match = 'substring' and length(b.stem) between 3 and 12 order by length(b.stem), b.stem limit 1");
  return stem.charAt(0).toUpperCase() + stem.slice(1) + 'qz';
};
/* Production's auth.uid() (it reads both claims; the replay's fixture reads only the first), for the arm that needs to see the difference. */
const PROD_UID = `create or replace function auth.uid() returns uuid language sql stable as $f$
  select coalesce(nullif(current_setting('request.jwt.claim.sub', true), ''), (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'))::uuid $f$`;

const ARMS = {
  'TW-RULES': async (db, X) => {
    const out = [];
    const rows = await q(db, 'select * from public.hr_town_works order by ord');
    const want = Object.keys(X.TWD.TOWN_WORKS);
    if (rows.map((r) => r.project_id).join() !== want.join()) out.push(`the table holds ${rows.map((r) => r.project_id)}, the data file ${want}`);
    for (const r of rows) {
      const d = X.TWD.TOWN_WORKS[r.project_id];
      if (!d) continue;
      if (r.map_id !== d.map || r.name !== d.name || Number(r.min_gift) !== d.minGift || Number(r.per_day) !== d.perDay || r.per_minute !== d.perMinute || r.plaque_top !== d.plaqueTop) out.push(`${r.project_id}: the row reads ${JSON.stringify(r)}`);
      if (r.stage_at.map(Number).join() !== d.stages.map((s) => s.at).join()) out.push(`${r.project_id}: stages ${r.stage_at}`);
      if (JSON.stringify(r.stage_lines) !== JSON.stringify(d.stages.map((s) => s.line))) out.push(`${r.project_id}: lines ${r.stage_lines}`);
    }
    /* the numbers Tyler approved, read from the row */
    const w = X.TWD.TOWN_WORKS.weighhouse;
    if (w.perDay !== 25000 || w.minGift !== 100 || w.stages.at(-1).at !== 1000000) out.push('the Weighhouse no longer asks 100 to 25,000 a day of 1,000,000');
    /* EVERY STAGE IS ONE FRAME: the swap must not jump, and it must block the same tiles */
    for (const [id, d] of Object.entries(X.TWD.TOWN_WORKS)) {
      const base = X.book.sprites[d.stages[0].art];
      if (!base) { out.push(`${id}: stage 0's art ${d.stages[0].art} is not in the atlas`); continue; }
      for (const s of d.stages) {
        const a = X.book.sprites[s.art];
        if (!a) { out.push(`${s.art} is not in the atlas`); continue; }
        if (JSON.stringify([a.frame, a.anchor, a.footprint]) !== JSON.stringify([base.frame, base.anchor, base.footprint])) out.push(`${s.art} doesn't share ${d.stages[0].art}'s frame, anchor and footprint`);
      }
    }
    return out;
  },

  'TW-GIVE': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await rich(db, A);
    const xp0 = Number(await one(db, 'select coalesce(sum(xp), 0) from public.player_skills where user_id = $1', [A]));
    const lv0 = Number(await one(db, 'select level_xp from public.player_state where user_id = $1 and slot = 0', [A]));
    const key = idem();
    const r = await give(db, A, 0, 1000, key);
    if (!r || r.ok !== true || Number(r.amount) !== 1000 || Number(r.total) !== 1000 || r.stage !== 0 || Number(r.left_today) !== 24000) out.push('a gift answered ' + JSON.stringify(r));
    if ((await purse(db, A)) !== 9999000) out.push('the purse reads ' + (await purse(db, A)));
    const rows = await shopRows(db, A);
    if (rows.length !== 1 || rows[0].intent !== 'town_works:weighhouse:1000') out.push('the journal reads ' + JSON.stringify(rows));
    /* A REPLAYED KEY CHARGES ONCE */
    const again = await give(db, A, 0, 1000, key);
    if (!again || again.ok !== true) out.push('a replay answered ' + JSON.stringify(again));
    if ((await purse(db, A)) !== 9999000 || (await total(db)) !== 1000) out.push('a replay moved the purse or the total');
    if ((await shopRows(db, A)).length !== 1) out.push('a replay journalled again');
    /* the same key on another number is another intent, refused and uncharged */
    const other = await give(db, A, 0, 2000, key);
    if (!other || other.error !== 'intent_mismatch') out.push('one key on two amounts answered ' + JSON.stringify(other));
    if ((await purse(db, A)) !== 9999000) out.push('a mismatched key charged');
    /* NOTHING BUT GOLD MOVES */
    if (Number(await one(db, 'select coalesce(sum(xp), 0) from public.player_skills where user_id = $1', [A])) !== xp0) out.push('a gift paid skill XP');
    if (Number(await one(db, 'select level_xp from public.player_state where user_id = $1 and slot = 0', [A])) !== lv0) out.push('a gift paid Level XP');
    /* A HUNTING HERO MAY GIVE: the purse is the account's and nothing walks */
    await calm(db);
    const hunt = await firstHunt(db);
    const entered = await as(db, A, "select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, gen_random_uuid())", [hunt]);
    if (!entered || entered.ok !== true) return out.concat('hr_hunt_enter: ' + JSON.stringify(entered));
    const inHunt = await give(db, A, 0, 500);
    if (!inHunt || inHunt.ok !== true) out.push('a hunting hero was refused: ' + JSON.stringify(inHunt));
    return out;
  },

  'TW-ONLY': async (db) => {
    const out = [];
    /* EVERY WRITER IS NAMED HERE: the totals and the gifts move only in the verb */
    const fns = await q(db, "select p.proname, p.prosrc from pg_proc p where p.pronamespace = 'public'::regnamespace");
    const WRITES = (t) => new RegExp('(insert\\s+into|update|delete\\s+from|truncate)\\s+(table\\s+)?(public\\.)?' + t + '\\b', 'i');
    for (const f of fns) {
      for (const t of ['town_works_totals', 'town_works_gifts']) if (WRITES(t).test(f.prosrc || '') && f.proname !== 'hr_town_works_give') out.push(f.proname + ' writes ' + t);
    }
    for (const role of ['anon', 'authenticated']) {
      for (const t of ['public.hr_town_works', 'public.town_works_totals', 'public.town_works_gifts']) {
        if (await one(db, 'select has_table_privilege($1, $2, $3) or has_table_privilege($1, $2, $4)', [role, t, 'select', 'insert,update,delete'])) out.push(`${role} reaches ${t}`);
      }
      for (const fn of [FAULT, GIVEN, LEAD, PLAQUE, NOTICE, EXTRAS, 'public.hr_town_works_stage(bigint[],bigint)']) {
        if (await one(db, 'select has_function_privilege($1, $2, $3)', [role, fn, 'execute'])) out.push(`${role} reaches ${fn}`);
      }
    }
    if (await one(db, "select has_function_privilege('anon', $1, 'execute')", [GIVE])) out.push('anon reaches the verb');
    if (await one(db, "select has_function_privilege('anon', $1, 'execute')", [VIEW])) out.push('anon reaches the read');
    if (!(await one(db, "select has_function_privilege('authenticated', $1, 'execute')", [GIVE]))) out.push('a player can\'t reach the verb');
    if (Number(await one(db, "select count(*) from pg_policies where schemaname = 'public' and tablename in ('hr_town_works', 'town_works_totals', 'town_works_gifts')"))) out.push('a policy opens a table');
    for (const t of ['hr_town_works', 'town_works_totals', 'town_works_gifts']) if (!(await one(db, "select relrowsecurity from pg_class where oid = $1::regclass", ['public.' + t]))) out.push(`${t} has no RLS`);
    /* the client's surface */
    const base = (await q(db, "select proname from public.hr_client_rpc_baseline where proname like 'hr_town_works%' or proname = 'hr_town_notice' or proname = 'hr_town_extras' order by 1")).map((r) => r.proname).join();
    if (base !== 'hr_town_works_give,hr_town_works_view') out.push('the client surface reads ' + base);
    return out;
  },

  'TW-REFUSE': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await rich(db, A);
    const unmoved = async (what) => {
      if ((await purse(db, A)) !== 10000000) out.push(what + ' charged: ' + (await purse(db, A)));
      if ((await shopRows(db, A)).length) out.push(what + ' journalled');
      if (await one(db, 'select exists (select 1 from public.town_works_gifts where user_id = $1)', [A])) out.push(what + ' wrote a gift');
      if (await one(db, 'select exists (select 1 from public.account_gold_given where user_id = $1)', [A])) out.push(what + ' reached the board');
    };
    const refused = async (amount, error, field, n) => {
      await calm(db);
      const r = await give(db, A, 0, amount);
      if (!r || r.error !== error || (field && Number(r[field]) !== n)) out.push(`${amount} gp answered ${JSON.stringify(r)}; wanted ${error}`);
      await unmoved(`${amount} gp`);
    };
    await refused(99, 'works_small', 'min', 100);
    await refused(1, 'works_small', 'min', 100);
    await refused(25001, 'works_over', 'left', 25000);
    for (const bad of [0, -5000, 2000000000]) await refused(bad, 'bad_amount');
    /* BEFORE ANY CHARGE: the rule answers first, so an empty purse still hears why the gift itself is wrong, not that it can't pay */
    await rich(db, A, 0);
    await calm(db);
    const broke = await give(db, A, 0, 99);
    if (!broke || broke.error !== 'works_small') out.push('99 gp from an empty purse answered ' + JSON.stringify(broke));
    const poor = await give(db, A, 0, 100);
    if (!poor || poor.error !== 'insufficient_gold') out.push('a fair gift from an empty purse answered ' + JSON.stringify(poor));
    if ((await total(db)) !== 0 || (await shopRows(db, A)).length) out.push('a gift nobody could pay for moved the total or the journal');
    await rich(db, A);
    const none = await give(db, A, 0, 500, idem(), 'no_such_works');
    if (!none || none.error !== 'not_a_project') out.push('an unknown project answered ' + JSON.stringify(none));
    await unmoved('an unknown project');
    const slot = await give(db, A, 3, 500);
    if (!slot || slot.error !== 'no_character') out.push('a hero who doesn\'t exist answered ' + JSON.stringify(slot));
    await unmoved('a hero who doesn\'t exist');
    /* THE PROJECT: what it still needs, under the server's number */
    await setTotal(db, 999000);
    await refused(5000, 'works_short', 'left', 1000);
    await setTotal(db, 999950);
    await refused(100, 'works_short', 'left', 50);
    await refused(49, 'works_small', 'min', 50);
    /* THE LAST COINS CAN BE GIVEN, or the last 50 gp could never go in */
    await calm(db);
    const last = await give(db, A, 0, 50);
    if (!last || last.ok !== true || Number(last.total) !== 1000000) out.push('the last 50 gp answered ' + JSON.stringify(last));
    /* PAST THE FINISH */
    await calm(db);
    const done = await give(db, A, 0, 100);
    if (!done || done.error !== 'works_done') out.push('past the finish answered ' + JSON.stringify(done));
    return out;
  },

  'TW-CAP': async (db, X) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await hero(db, A, 1, 'Sorrel');
    await hero(db, B, 0, 'Tamsel');
    await rich(db, A);
    await rich(db, B);
    const r0 = await give(db, A, 0, 20000);
    if (!r0 || r0.ok !== true) out.push('the first hero answered ' + JSON.stringify(r0));
    /* THE OTHER HERO SHARES THE ACCOUNT'S DAY */
    const over = await give(db, A, 1, 5001);
    if (!over || over.error !== 'works_over' || Number(over.left) !== 5000) out.push('the second hero over the cap answered ' + JSON.stringify(over));
    if ((await purse(db, A)) !== 9980000) out.push('the refusal charged: ' + (await purse(db, A)));
    const r1 = await give(db, A, 1, 5000);
    if (!r1 || r1.ok !== true || Number(r1.left_today) !== 0) out.push('the second hero to the cap answered ' + JSON.stringify(r1));
    const limit = await give(db, A, 0, 100);
    if (!limit || limit.error !== 'works_limit' || Number(limit.per_day) !== 25000) out.push('past the cap answered ' + JSON.stringify(limit));
    /* ANOTHER ACCOUNT HAS ITS OWN */
    const b = await give(db, B, 0, 25000);
    if (!b || b.ok !== true) out.push('another account answered ' + JSON.stringify(b));
    /* A DAY NOT ENOUGH FOR THE SMALLEST GIFT IS A FINISHED DAY, not a loop of two refusals */
    await calm(db);
    await db.query(`update public.town_works_gifts set day_gold = 24950 where user_id = $1`, [A]);
    for (const n of [100, 50]) {
      const r = await give(db, A, 0, n);
      if (!r || r.error !== 'works_limit') out.push(`50 gp left today, ${n} gp answered ` + JSON.stringify(r));
    }
    /* THE NEXT UTC DAY IT COMES BACK, and starts its own count */
    await calm(db);
    await db.query(`update public.town_works_gifts set day = day - 1 where user_id = $1`, [A]);
    const next = await give(db, A, 0, 25000);
    if (!next || next.ok !== true || Number(next.left_today) !== 0) out.push('the next day answered ' + JSON.stringify(next));
    if (Number(await one(db, 'select day_gold from public.town_works_gifts where user_id = $1', [A])) !== 25000) out.push('a new day kept counting yesterday');
    if (Number(await one(db, 'select gold from public.town_works_gifts where user_id = $1', [A])) !== 50000) out.push('the account\'s total lost a day');
    /* THE LOCK ORDER: hero, the sink key, the count, the charge, the project's key */
    const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [GIVE]));
    const at = (s) => def.indexOf(s);
    const order = ['public.hr_hunt_lock(v_uid, p_slot)', 'public.hr_sink_lock(v_uid)', 'public.hr_town_works_given_today(v_uid)', 'public.hr_apply(', "'hr:works:'"];
    if (order.some((s) => at(s) < 0)) out.push('the verb has lost a lock: ' + order.filter((s) => at(s) < 0));
    for (let i = 1; i < order.length; i++) if (at(order[i - 1]) >= at(order[i])) out.push(`${order[i - 1]} no longer comes before ${order[i]}`);
    if (def.split("'hr:works:'").length !== 2) out.push('the project\'s key is taken more than once');
    return out;
  },

  'TW-LOST': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await hero(db, B, 0, 'Tamsel');
    await rich(db, A);
    await setTotal(db, 998000);
    /* what another account's commit looks like while this gift waits on the project's key: the first read saw 2,000 left */
    await db.exec(`create or replace function public.hr__zz_fill() returns trigger language plpgsql as $f$ begin
        update public.town_works_totals set total = 999500 where project_id = '${P}';
        return new; end $f$;
      create trigger hr__zz_fill before insert on public.player_ledger for each row execute function public.hr__zz_fill();`);
    const key = idem();
    const lost = await give(db, A, 0, 1000, key);
    await db.exec('drop trigger hr__zz_fill on public.player_ledger');
    if (!lost || lost.ok === true || lost.error !== 'works_short' || Number(lost.left) !== 500) out.push('the gift that lost the race answered ' + JSON.stringify(lost));
    if ((await purse(db, A)) !== 10000000) out.push('the gift that lost the race charged: ' + (await purse(db, A)));
    if ((await shopRows(db, A)).length) out.push('the gift that lost the race journalled');
    if (await one(db, 'select exists (select 1 from public.player_intents where user_id = $1 and intent_id = $2)', [A, key])) out.push('the gift that lost the race spent its key');
    if (await one(db, 'select exists (select 1 from public.town_works_gifts where user_id = $1)', [A])) out.push('the gift that lost the race wrote a gift');
    if (await one(db, 'select exists (select 1 from public.account_gold_given where user_id = $1)', [A])) out.push('the gift that lost the race counted on the board');
    if ((await lines(db)).length) out.push('the gift that lost the race spoke');
    /* the trigger's update rolled back with the block: what's on the row is what the first read saw */
    if ((await total(db)) > 1000000) out.push('the project overfilled: ' + (await total(db)));
    /* NOTHING WAS SPENT: the same key gives it, once */
    const again = await give(db, A, 0, 1000, key);
    if (!again || again.ok !== true || (await purse(db, A)) !== 9999000) out.push('the same key after the race answered ' + JSON.stringify(again));
    if ((await total(db)) !== 999000) out.push('after the race the total reads ' + (await total(db)));
    return out;
  },

  'TW-GIVEN': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await hero(db, A, 1, 'Sorrel');
    await rich(db, A);
    const of = async (slot) => Number((await one(db, "select gold from public.account_gold_given where user_id = $1 and slot = $2 and month = date_trunc('month', now() at time zone 'utc')::date", [A, slot])) || 0);
    await give(db, A, 0, 1000);
    if ((await of(0)) !== 1000) out.push('the board reads ' + (await of(0)));
    await give(db, A, 1, 3000);
    if ((await of(1)) !== 3000 || (await of(0)) !== 1000) out.push('the gift is not counted to the hero who gave it');
    const purseAfter = await purse(db, A);
    /* a refusal never counts */
    await give(db, A, 0, 99);
    if ((await of(0)) !== 1000 || (await purse(db, A)) !== purseAfter) out.push('a refusal counted');
    /* a replay never counts twice */
    const key = idem();
    await give(db, A, 0, 200, key);
    await give(db, A, 0, 200, key);
    if ((await of(0)) !== 1200) out.push('a replay counted twice: ' + (await of(0)));
    /* the board's allowlist still has it, and the charge's transaction holds both */
    const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [GIVE]));
    if (def.indexOf('public.hr_gold_given_add(v_uid, p_slot, p_amount)') < def.indexOf('public.hr_apply(')) out.push('the counter moves before the charge');
    return out;
  },

  'TW-STAGE': async (db, X) => {
    const out = [];
    await db.exec(PROD_UID);
    await hero(db, A, 0, 'Marlow');
    await hero(db, B, 0, 'Tamsel');
    await rich(db, A);
    await rich(db, B);
    const said = async () => (await lines(db)).map((l) => l.body);
    /* ONE COIN SHORT SAYS NOTHING; CROSSING SAYS IT ONCE; THE NEXT GIFT PAST IT SAYS NOTHING */
    await setTotal(db, 99000);
    await give(db, A, 0, 999);
    if ((await said()).length) out.push('one coin short of the stage spoke: ' + (await said()));
    await calm(db);
    const crossed = await give(db, B, 0, 1);
    if (crossed.error !== 'works_small') out.push('the one coin answered ' + JSON.stringify(crossed));
    await give(db, B, 0, 100);
    if ((await said()).join() !== 'has its footings.') out.push('crossing footings said ' + (await said()));
    await give(db, B, 0, 100);
    await give(db, A, 0, 1000);
    if ((await said()).length !== 1) out.push('a gift past the stage spoke again: ' + (await said()));
    /* AS THE TOWN: no giver's id, slot or name, whoever pressed */
    const [row] = await lines(db);
    if (row.from_id !== null || row.from_slot !== null || row.from_name !== 'The Weighhouse') out.push('the line is stamped ' + JSON.stringify(row));
    const shown = X.CL.lineOf(await one(db, "select public.hr_chat_row(m) from public.chat_messages m where channel = 'system' and from_name = 'The Weighhouse' limit 1"));
    const words = shown && shown.parts.map((p) => p.text).join('');
    if (words !== 'The Weighhouse has its footings.') out.push('the System tab reads ' + JSON.stringify(words));
    /* THE SESSION COMES BACK: the verb's own answer and the next call are still this player */
    await claims(db, A);
    if (String(await one(db, 'select auth.uid()::text')) !== A) out.push('the session was lost');
    await one(db, "select public.hr_town_notice('The Weighhouse', 'zz.')");
    if (String(await one(db, 'select auth.uid()::text')) !== A) out.push('a notice leaves the verb with no session');
    await claims(db, null);
    await db.query("delete from public.chat_messages where body = 'zz.'").catch(() => {});
    /* A GIFT ACROSS TWO STAGES SAYS BOTH, IN ORDER */
    await db.query(`insert into public.hr_town_works (project_id, map_id, ord, name, min_gift, per_day, per_minute, plaque_top, stage_at, stage_lines)
      values ('zz_two', 'town_common', 9001, 'The Probe', 100, 25000, 60, 10, array[0, 1000, 2000, 1000000]::bigint[], array[null, 'has its first.', 'has its second.', 'is finished.']::text[])`);
    await calm(db);
    await give(db, B, 0, 2500, idem(), 'zz_two');
    const both = (await q(db, "select body from public.chat_messages where from_name = 'The Probe' order by created_at, body")).map((r) => r.body);
    if (both.join() !== 'has its first.,has its second.') out.push('a gift across two stages said ' + both);
    /* THE FINISH: the line, the stamp, no more gifts, and it stands */
    await calm(db);
    await setTotal(db, 999000);
    const fin = await give(db, B, 0, 1000);
    if (!fin || fin.ok !== true || fin.stage !== 4) out.push('the finishing gift answered ' + JSON.stringify(fin));
    if (!(await said()).includes('is finished.')) out.push('the finish said nothing: ' + (await said()));
    if (!(await one(db, 'select finished_at is not null from public.town_works_totals where project_id = $1', [P]))) out.push('the finish was not stamped');
    const after = await give(db, A, 0, 1000);
    if (!after || after.error !== 'works_done') out.push('past the finish answered ' + JSON.stringify(after));
    if ((await said()).filter((b) => b === 'is finished.').length !== 1) out.push('the finish spoke twice');
    /* A QUIET GIVER CHANGES NOTHING: the line is the town's. A BLOCKED GIVER HIDES NOTHING. */
    await calm(db);
    await db.query('update public.player_state set presence_quiet = true where user_id = $1', [A]);
    await db.query('update public.town_works_totals set total = 99000 where project_id = $1', ['zz_two']);
    await db.query(`update public.hr_town_works set stage_at = array[0, 100000, 200000, 1000000]::bigint[] where project_id = 'zz_two'`);
    await give(db, A, 0, 1000, idem(), 'zz_two');
    const quiet = (await q(db, "select from_id from public.chat_messages where from_name = 'The Probe' and body = 'has its first.' order by created_at")).length;
    if (quiet !== 2) out.push('a quiet giver silenced the town: ' + quiet);
    return out;
  },

  'TW-PLAQUE': async (db) => {
    const out = [];
    const users = Array.from({ length: 12 }, (_, i) => '000000c0-0000-4000-a000-0000901d8b' + String(i + 1).padStart(2, '0'));
    const names = 'Ansel Brom Corin Dara Edda Fenn Gale Hale Ilsa Jory Kett Lorn'.split(' ');
    for (let i = 0; i < users.length; i++) {
      await hero(db, users[i], 0, names[i]);
      await rich(db, users[i]);
      await give(db, users[i], 0, 1000 * (i + 1));   // Lorn gave most, Ansel least
    }
    const read = (viewer) => as(db, viewer, 'select public.hr_town_works_view(0)');
    const v = await read(users[0]);
    if (!v || v.ok !== true) return ['the read answered ' + JSON.stringify(v)];
    if (v.plaque.length !== 10) out.push('the plaque holds ' + v.plaque.length);
    if (v.plaque[0].name !== 'Lorn' || Number(v.plaque[0].gold) !== 12000 || v.plaque[0].place !== 1) out.push('first place reads ' + JSON.stringify(v.plaque[0]));
    if (v.plaque.map((r) => r.name).join() !== 'Lorn,Kett,Jory,Ilsa,Hale,Gale,Fenn,Edda,Dara,Corin') out.push('the order reads ' + v.plaque.map((r) => r.name));
    /* NO ACCOUNT ID LEAVES, AND ONLY THE VIEWER'S ROW IS MARKED */
    for (const r of v.plaque) for (const k of Object.keys(r)) if (!['place', 'name', 'gold', 'mine'].includes(k)) out.push('a plaque row carries ' + k);
    if (v.plaque.some((r) => r.mine)) out.push('a row off the viewer is marked as the viewer\'s');
    const lorn = await read(users[11]);
    if (!lorn.plaque[0].mine || lorn.plaque.slice(1).some((r) => r.mine)) out.push('the viewer\'s own row is not the one marked');
    /* THE LEAD HERO: whichever gave most, not the first */
    await hero(db, users[11], 1, 'Sorrel');
    await calm(db);
    await give(db, users[11], 1, 13000);
    const led = await read(users[0]);
    if (led.plaque[0].name !== 'Sorrel' || Number(led.plaque[0].gold) !== 25000) out.push('the account\'s lead hero reads ' + JSON.stringify(led.plaque[0]));
    /* A HIDDEN HERO CAN'T LEAD: the next who gave does */
    await db.query("insert into public.hr_lb_hidden (user_id, slot, reason, note) values ($1, 1, 'test', 'town-works guard')", [users[11]]);
    const fell = await read(users[0]);
    if (fell.plaque[0].name !== 'Lorn') out.push('a hidden hero leads: ' + JSON.stringify(fell.plaque[0]));
    /* A HERO WHO NEVER GAVE CAN'T LEAD */
    await db.query("delete from public.hr_lb_hidden where user_id = $1", [users[11]]);
    await db.query("insert into public.hr_lb_hidden (user_id, slot, reason, note) values ($1, 0, 'test', 'town-works guard')", [users[10]]);
    await hero(db, users[10], 1, 'Tarn');
    const never = await read(users[0]);
    if (never.plaque.map((r) => r.name).includes('Tarn') || never.plaque.map((r) => r.name).includes('Kett')) out.push('an account whose only giver is hidden holds a place: ' + never.plaque.map((r) => r.name));
    /* A HIDDEN ACCOUNT HOLDS NO PLACE, AND THE NEXT ONE COMES UP */
    await db.query("insert into public.hr_lb_hidden (user_id, slot, reason, note) values ($1, null, 'test', 'town-works guard')", [users[11]]);
    const hid = await read(users[0]);
    if (hid.plaque.map((r) => r.name).includes('Lorn') || hid.plaque.map((r) => r.name).includes('Sorrel')) out.push('a hidden account holds a place: ' + hid.plaque.map((r) => r.name));
    if (hid.plaque.length !== 10) out.push('a hidden account left the plaque short: ' + hid.plaque.length);
    /* A BLOCKED NAME */
    const bad = await blockedName(db);
    await db.query('update public.character_names set name = $1 where user_id = $2 and slot = 0', [bad, users[9]]);
    const masked = await read(users[0]);
    if (masked.plaque[0].name !== 'Name hidden') out.push('a blocked name reached the plaque: ' + masked.plaque[0].name);
    return out;
  },

  'TW-VIEW': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await hero(db, A, 1, 'Sorrel');
    await hero(db, B, 0, 'Tamsel');
    await rich(db, A);
    await rich(db, B);
    const read = (u, s = 0) => as(db, u, 'select public.hr_town_works_view($1::int)', [s]);
    const fresh = await read(A);
    if (!fresh || fresh.ok !== true) return ['the read answered ' + JSON.stringify(fresh)];
    if (Number(fresh.total) !== 0 || Number(fresh.goal) !== 1000000 || fresh.stage !== 0 || Number(fresh.left_today) !== 25000 || Number(fresh.max_gift) !== 25000 || Number(fresh.min_gift) !== 100
      || fresh.last_gift !== null || fresh.place !== null || Number(fresh.gold) !== 0 || fresh.plaque.length !== 0) out.push('a fresh read answers ' + JSON.stringify(fresh));
    await give(db, B, 0, 9000);
    await give(db, A, 0, 2000);
    await give(db, A, 1, 3000);
    const seen = await read(A);
    if (Number(seen.total) !== 14000 || Number(seen.given_today) !== 5000 || Number(seen.left_today) !== 20000 || Number(seen.max_gift) !== 20000) out.push('after three gifts the read answers ' + JSON.stringify(seen));
    /* THE WINDOW OPENS ON THE LAST GIFT */
    if (Number(seen.last_gift) !== 3000) out.push('the last gift reads ' + seen.last_gift);
    /* ITS OWN PLACE AND TOTAL */
    if (seen.place !== 2 || Number(seen.gold) !== 5000) out.push('own place and total read ' + JSON.stringify({ place: seen.place, gold: seen.gold }));
    /* ANOTHER HERO OF THE ACCOUNT READS THE SAME DAY */
    const other = await read(A, 1);
    if (Number(other.left_today) !== 20000 || other.place !== 2) out.push('the other hero reads ' + JSON.stringify(other));
    /* A HIDDEN ACCOUNT AHEAD DOESN'T PUSH A PLACE DOWN; A HIDDEN ACCOUNT HOLDS NONE ITSELF */
    await db.query("insert into public.hr_lb_hidden (user_id, slot, reason, note) values ($1, null, 'test', 'town-works guard')", [B]);
    const clear = await read(A);
    if (clear.place !== 1) out.push('a hidden account ahead pushes the place to ' + clear.place);
    const hidden = await read(B);
    if (hidden.place !== null || Number(hidden.gold) !== 9000) out.push('a hidden account reads ' + JSON.stringify({ place: hidden.place, gold: hidden.gold }));
    /* ITS OWN PLACE OFF THE PLAQUE'S END */
    const many = Array.from({ length: 11 }, (_, i) => '000000c0-0000-4000-a000-0000901d8c' + String(i + 1).padStart(2, '0'));
    for (let i = 0; i < many.length; i++) {
      await hero(db, many[i], 0, 'Zed' + 'abcdefghijk'[i]);
      await rich(db, many[i]);
      await give(db, many[i], 0, 6000 + i);
    }
    const off = await read(A);
    if (off.plaque.length !== 10 || off.place !== 12 || off.plaque.some((r) => r.mine)) out.push('off the plaque the read answers ' + JSON.stringify({ n: off.plaque.length, place: off.place }));
    /* WHAT'S LEFT ON THE PROJECT TAKES OVER FROM TODAY'S */
    await setTotal(db, 999000);
    const near = await read(A);
    if (Number(near.max_gift) !== 1000 || Number(near.left) !== 1000) out.push('near the finish the read answers ' + JSON.stringify({ max: near.max_gift, left: near.left }));
    await setTotal(db, 999950);
    const lastCoins = await read(A);
    if (Number(lastCoins.min_gift) !== 50 || Number(lastCoins.max_gift) !== 50) out.push('the last coins read ' + JSON.stringify({ min: lastCoins.min_gift, max: lastCoins.max_gift }));
    /* THE FINISH */
    await setTotal(db, 1000000);
    const done = await read(A);
    if (done.finished !== true || done.stage !== 4 || Number(done.max_gift) !== 0 || Number(done.left) !== 0) out.push('finished, the read answers ' + JSON.stringify(done));
    if (done.plaque.length !== 10) out.push('the plaque did not stay');
    /* NO HERO */
    const none = await read(A, 3);
    if (!none || none.error !== 'no_character') out.push('no hero answered ' + JSON.stringify(none));
    return out;
  },

  'TW-EXTRAS': async (db, X) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await hero(db, B, 0, 'Tamsel');
    await rich(db, A);
    await db.query("update public.hr_flags set enabled = true where key = 'town_presence'");
    const read = () => as(db, B, "select public.hr_town_view(0, 'town_common', null, null, null, null, null)");
    const fresh = await read();
    if (!fresh || !fresh.extras || !fresh.extras.works || fresh.extras.works.weighhouse !== 0) out.push('a fresh town read holds ' + JSON.stringify(fresh && fresh.extras));
    if (Object.keys(await one(db, "select public.hr_town_extras('no_such_town')")).length) out.push('a town with no project reads Works');
    const stages = [[0, 0], [99999, 0], [100000, 1], [299999, 1], [300000, 2], [600000, 3], [999999, 3], [1000000, 4]];
    const map = { id: 'town_common' };
    const w = X.TWD.TOWN_WORKS.weighhouse;
    for (const [t, k] of stages) {
      await setTotal(db, t);
      const r = await read();
      if (!r.extras || r.extras.works.weighhouse !== k) out.push(`${t} gp reads stage ${JSON.stringify(r.extras)}, wanted ${k}`);
      /* THE MAP DRAWS ITS STAGE FROM THAT ANSWER ALONE */
      const swap = X.TW.townWorksSwap(map, r.extras);
      if (k === 0 ? swap !== null : !swap || swap[w.stages[0].art] !== w.stages[k].art) out.push(`stage ${k} draws ${JSON.stringify(swap)}`);
    }
    /* A GIFT REACHES A STRANGER'S NEXT READ */
    await setTotal(db, 99000);
    await give(db, A, 0, 1000);
    const after = await read();
    if (!after.extras || after.extras.works.weighhouse !== 1) out.push('a gift never reached a stranger: ' + JSON.stringify(after.extras));
    /* JUNK DRAWS NOTHING */
    for (const junk of [null, {}, { works: null }, { works: { weighhouse: 9 } }, { works: { weighhouse: -1 } }, { works: { weighhouse: '2' } }, { works: { weighhouse: 1.5 } }]) {
      if (X.TW.townWorksSwap(map, junk) !== null) out.push('junk draws ' + JSON.stringify(junk));
    }
    if (X.TW.townWorksSwap({ id: 'somewhere_else' }, { works: { weighhouse: 2 } }) !== null) out.push('the swap reaches another town');
    /* THE ANSWER IS MADE ONCE: this runs every town frame */
    if (X.TW.townWorksSwap(map, { works: { weighhouse: 2 } }) !== X.TW.townWorksSwap(map, { works: { weighhouse: 2 } })) out.push('the swap allocates per frame');
    return out;
  },

  'TW-MAP': async (db, X) => {
    const out = [];
    const row = X.maps.WORLD_MAPS.find((m) => m.id === X.plan.TOWN_MAP);
    const [lx, ly] = X.plan.at(94, 55);
    const lot = row.objects.find((o) => o.id === 'havora_weighhouse_staked');
    if (!lot || lot.x !== lx || lot.y !== ly) return ['the lot is not at plan (94, 55): ' + JSON.stringify(lot)];
    const [px, py] = X.plan.at(103, 53);
    if (!row.objects.some((o) => o.id === 'havora_weighhouse_plaque' && o.x === px && o.y === py)) out.push('the plaque is not at plan (103, 53)');
    const [ox, oy] = X.plan.at(98, 58);
    if (row.objects.some((o) => o.id === 'oak' && o.x === ox && o.y === oy)) out.push('the oak still stands at plan (98, 58)');
    const tables = { materials: X.terrain.MATERIALS, sprites: X.book.sprites, openClasses: X.terrain.OPEN_CLASSES, treeClasses: X.terrain.TREE_CLASSES, lights: X.terrain.LIGHTS, terrains: X.book.terrains };
    const map = X.mapc.compileMap(row, tables);
    /* THE FOOTPRINT BLOCKS, from stage 0, and the map's hash says so */
    for (let y = ly; y < ly + 6; y++) for (let x = lx; x < lx + 8; x++) if (map.mask[y * map.w + x] !== 1) out.push(`the lot's tile (${x}, ${y}) is walkable`);
    if (map.maskHash !== row.maskHash) out.push(`the map's hash reads ${row.maskHash}, the mask ${map.maskHash}`);
    /* EVERY STAGE IS THE SAME FOOTPRINT, SO NO STAGE CAN MOVE WHAT BLOCKS: compile with each stage's art in the object's place */
    for (const s of X.TWD.TOWN_WORKS.weighhouse.stages) {
      const staged = Object.assign({}, row, { objects: row.objects.map((o) => (o === lot ? Object.freeze(Object.assign({}, o, { id: s.art })) : o)) });
      const m = X.mapc.compileMap(staged, tables);
      if (m.maskHash !== map.maskHash) out.push(`stage ${s.art} moves what blocks a step`);
    }
    /* THE DRAW: in the y-sort with the people, behind nobody south of it, over a hero north of it, and never with the effects */
    const T = map.T || 32;
    const view = { ox: (lx - 12) * T, oy: (ly - 12) * T, w: 32 * T, h: 30 * T };
    const frame = (hero, swap) => X.compose.composeFrame(map, X.book, { hero, t: 0, objectSwap: swap }, view, tables, T);
    const swap = { havora_weighhouse_staked: 'havora_weighhouse_finished' };
    const north = frame({ x: lx + 3, y: ly - 1, dir: 's' }, swap);
    const ids = north.sprites.map((d) => d.id);
    if (!ids.includes('havora_weighhouse_finished') || ids.includes('havora_weighhouse_staked')) out.push('the swap does not draw: ' + ids.filter((i) => /weighhouse/.test(i)));
    if (north.fx.some((e) => /weighhouse/.test(e.id))) out.push('the lot draws with the effects, over everyone');
    const at = (list, pred) => list.findIndex(pred);
    const isHeroAt = (x, y) => (d) => d.kind === 'unit' && d.tx === x && d.ty === y && !/weighhouse/.test(d.id);
    const isLot = (d) => d.id === 'havora_weighhouse_finished';
    if (at(north.sprites, isHeroAt(lx + 3, ly - 1)) < 0 || at(north.sprites, isHeroAt(lx + 3, ly - 1)) > at(north.sprites, isLot)) out.push('a hero north of the lot draws over it');
    const south = frame({ x: lx + 3, y: ly + 6, dir: 's' }, swap);
    if (at(south.sprites, isHeroAt(lx + 3, ly + 6)) < at(south.sprites, isLot)) out.push('a hero south of the lot draws behind it');
    /* the staged art stands in the same box */
    const a = frame(null, null).sprites.find((d) => d.id === 'havora_weighhouse_staked');
    const b = frame(null, swap).sprites.find(isLot);
    if (!a || !b || a.x !== b.x || a.y !== b.y || a.row !== b.row) out.push('a stage moves the lot on the map');
    /* NOTHING STANDS ON IT, AND NO WAY RUNS THROUGH IT */
    for (const s of X.stations.STATIONS) for (const [x, y] of s.stands) if (x >= lx && x < lx + 8 && y >= ly && y < ly + 6) out.push(`${s.id}'s stand (${x}, ${y}) is on the lot`);
    if (!X.reach(map, row.start, [px, py + 1])) out.push('the plaque can\'t be walked to');
    return out;
  },

  'TW-TAP': async (db, X) => {
    const out = [];
    const [lx, ly] = X.plan.at(94, 55);
    const opens = X.ST.SINK_TAPS;
    const tap = (id, tile) => X.SL.tapAction({ id: 'town_common', exits: [] }, { tile, hits: [{ id, tx: lx, ty: ly, ref: null }] }, { opens, maps: {} });
    const plaque = X.SL.tapAction({ id: 'town_common', exits: [] }, { tile: [lx, ly], hits: [{ id: 'havora_weighhouse_plaque', tx: lx, ty: ly, ref: null }] }, { opens, maps: {} });
    if (plaque.kind !== 'window' || plaque.window !== 'havora' || plaque.tab !== 'works') out.push('a tap on the plaque acts ' + JSON.stringify(plaque));
    for (const art of ['havora_weighhouse_staked', 'havora_weighhouse_footings', 'havora_weighhouse_framed', 'havora_weighhouse_walled']) {
      const on = tap(art, [lx + 2, ly + 2]);
      if (on.kind !== 'window' || on.tab !== 'works') out.push(`a tap on ${art} acts ` + JSON.stringify(on));
      /* the street above the plot still walks: a tall frame's empty air is no building */
      const street = tap(art, [lx + 2, ly - 1]);
      if (street.kind !== 'walk') out.push(`a tap on the street above ${art} acts ` + JSON.stringify(street));
    }
    /* FINISHED: A DOOR TO THE MARKET */
    const done = tap('havora_weighhouse_finished', [lx + 3, ly + 3]);
    if (done.kind !== 'window' || done.window !== 'market') out.push('a tap on the finished Weighhouse acts ' + JSON.stringify(done));
    if (!X.SW.SHELL_WINDOWS.some((w) => w.id === 'market') || !X.SW.SHELL_WINDOWS.some((w) => w.id === 'havora')) out.push('a tap names a window the shell doesn\'t have');
    /* every stage's art has its row, so a stage is never a dead tap */
    for (const s of X.TWD.TOWN_WORKS.weighhouse.stages) if (!opens[s.art]) out.push(`${s.art} has no tap row`);
    return out;
  },

  'TW-NO-BUFF': async (db, X, mutant) => {
    const out = [];
    /* EVERY READER IS NAMED HERE. A new one is argued here first: a gold-funded power effect is on Tyler's avoid list. */
    const READERS = new Set(['hr_town_works_give', 'hr_town_works_view', 'hr_town_works_given_today', 'hr_town_works_plaque', 'hr_town_extras']);
    const fns = await q(db, "select p.proname, p.prosrc from pg_proc p where p.pronamespace = 'public'::regnamespace");
    for (const f of fns) {
      if (/\btown_works_(totals|gifts)\b/.test(f.prosrc || '') && !READERS.has(f.proname)) out.push(f.proname + ' reads a project\'s total or gifts');
      if (/\bhr_town_works\b/.test(f.prosrc || '') && !READERS.has(f.proname)) out.push(f.proname + ' reads the Works catalogue');
      if (/\bhr_town_extras\b/.test(f.prosrc || '') && f.proname !== 'hr_town_view') out.push(f.proname + ' reads the map\'s extras');
      if (/town_works:/.test(f.prosrc || '') && f.proname !== 'hr_town_works_give') out.push(f.proname + ' reads the gifts off the journal');
    }
    const views = await q(db, "select c.relname, pg_get_viewdef(c.oid) d from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')");
    for (const v of views) if (/\b(town_works_totals|town_works_gifts|hr_town_works|hr_town_extras)\b/.test(v.d)) out.push('the view ' + v.relname + ' reads a project');
    /* hr_gm_wall (2027-03-13-gm-tools.sql) refuses a walled hero's insert and reads no total, so it may hang here, running one of the wall's two guards; nothing else may */
    for (const t of ['town_works_totals', 'town_works_gifts']) {
      const hung = await q(db, `select g.tgname, g.tgfoid::regprocedure::text as fn, g.tgfoid in (to_regprocedure('public.hr_gm_wall_guard()'), to_regprocedure('public.hr_gm_wall_session()')) as wall
                                 from pg_trigger g where g.tgrelid = $1::regclass and not g.tgisinternal`, ['public.' + t]);
      for (const g of hung) if (!(g.tgname === 'hr_gm_wall' && g.wall === true)) out.push(`a trigger hangs off ${t}: ${g.tgname} runs ${g.fn}`);
    }
    /* AND NO ENGINE FILE NAMES IT */
    const works = /\btown_works|hr_town_works|town-works|TOWN_WORKS|\.extras\(\)|hr_town_extras/;
    const engine = X.engineFiles.concat(mutant && mutant.plant === 'engineFile' ? [['src/core/planted.js', "const r = rpc('hr_town_works_view');"]] : []);
    for (const [rel, text] of engine) if (works.test(text)) out.push(rel + ' names the Works');
    if (!X.engineFiles.length) out.push('the scan of the engine read no file');
    const edge = [...X.edgeFiles].concat(mutant && mutant.plant === 'edgeFile' ? ['vendor/data/town-works.js'] : []);
    if (edge.length < 50) out.push('the pack read ' + edge.length + ' files');
    for (const n of edge) if (/town-works|works\.js|town-intents|sink-taps/.test(n)) out.push(n + ' is in the edge bundle');
    /* ONLY THE WORKS' OWN CLIENT MODULES READ IT: no price, gate or number a player can act on */
    /* (src/app/game-modules.js is the generated list of every module's path, tests/module-preload.mjs --write: it names the file, it reads nothing) */
    const CLIENT_READERS = new Set(['src/app/game-modules.js', 'src/world/town-works.js', 'src/world/world-boot.js', 'src/session/town-presence.js', 'src/session/town-intents.js', 'src/shell/sink-words.js', 'src/shell/windows/havora/works.js', 'src/shell/windows/havora/index.js', 'src/data/town-works.js', 'src/data/world/sink-taps.js', 'src/data/honor-roll.js', 'src/data/refusal-words.js', 'src/data/world/town/sites.js']);
    const client = X.clientFiles.concat(mutant && mutant.plant === 'clientFile' ? [['src/shell/windows/shop.js', 'const discount = town.extras();']] : []);
    for (const [rel, text] of client) if (/\.extras\(\)|data\/town-works\.js|readWorks|hr_town_works/.test(text) && !CLIENT_READERS.has(rel)) out.push(rel + ' reads the Works');
    if (client.length < 50) out.push('the scan of the client read ' + client.length + ' files');
    return out;
  },

  'TW-AGAIN': async (db, X, mutant) => {
    const out = [];
    const plantIn = (f) => (mutant && mutant.sql && mutant.sql[0] === f ? plantSql(MIG(f), mutant.sql) : MIG(f));
    await hero(db, A, 0, 'Marlow');
    await rich(db, A);
    await give(db, A, 0, 1000);
    const inventory = async () => (await q(db, `select p.oid::regprocedure::text fn, md5(pg_get_functiondef(p.oid)) m from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname like any (array['hr_town_works%', 'hr_town_notice', 'hr_town_extras']) order by 1`)).map((r) => r.fn + ':' + r.m).join('\n');
    const before = await inventory();
    for (const f of [CATALOGUE, WORKS]) await db.exec(plantIn(f));
    if ((await inventory()) !== before) out.push('a second apply moved a body');
    if ((await total(db)) !== 1000) out.push('a second apply lost the total: ' + (await total(db)));
    if (Number(await one(db, 'select gold from public.town_works_gifts where user_id = $1', [A])) !== 1000) out.push('a second apply lost the gifts');
    return out;
  },

  'TW-WORDS': async (db, X) => {
    const out = [];
    const R = (o) => X.IW.refusalText({ ok: false, verb: 'town_works', project: P, ...o }, null);
    const want = [
      [{ error: 'works_limit', perDay: 25000 }, 'Havora takes 25,000 gp a day from one account, and you\'ve given yours. More after midnight UTC.'],
      [{ error: 'works_over', left: 4200 }, 'You can give 4,200 gp more today.'],
      [{ error: 'works_short', left: 800 }, 'The Weighhouse only needs 800 gp more.'],
      [{ error: 'works_small', min: 100 }, 'The smallest gift is 100 gp.'],
      [{ error: 'works_done' }, 'The Weighhouse is finished. Nothing else is being built right now.'],
    ];
    for (const [r, words] of want) if (R(r) !== words) out.push(`${r.error} reads "${R(r)}"`);
    /* the plain table says something for every code the verb can answer, in case a number is lost */
    const def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [GIVE])) + String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [FAULT]));
    for (const m of def.matchAll(/'error', '((?:works_|not_a_|bad_a)[a-z_]+)'/g)) if (!X.RW.REFUSAL_WORDS[m[1]]) out.push('no words for ' + m[1]);
    const plain = X.IW.refusalText({ ok: false, error: 'works_over', verb: 'town_works', project: P }, null);
    if (!/more than you can give/.test(plain)) out.push('with its number lost, works_over reads ' + plain);
    const join = X.HR.honorBoard('gold_given').join;
    if (join !== 'Give to the Town Works, throw a Hearth powder, stand a round or pay the Town Crier.') out.push('Gold Given\'s join line reads ' + join);
    return out;
  },

  'TW-WINDOW': async (db, X, mutant) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await rich(db, A);
    const html = X.HW.renderHavora({});
    for (const id of ['hearth', 'round', 'works']) if (!html.includes('data-tab="' + id + '"')) out.push('the window has no ' + id + ' tab');
    if (!html.includes('data-pane="works"')) out.push('the window has no Works pane');
    if (!html.includes('data-amount="1000"') || !html.includes('data-amount="5000"')) { if (X.WK.WORKS_TAB.shown) out.push('the Give buttons are missing'); }
    if (X.WK.giveWords(1000) !== 'Give 1,000 gp') out.push('the gift\'s button reads ' + X.WK.giveWords(1000));
    /* THE DAY'S LINE AND THE ANSWER STAND IN THE WINDOW'S FOOT: at 1366 x 768 the window ends under the buttons, so a refusal drawn in the flow was off screen (played 2026-11-05).
       The patch itself, on the elements it reads: the walk measures them in a browser */
    if (/hv-works-today|hv-works-msg/.test(X.WK.worksHtml())) out.push('the pane draws its own day\'s line or answer, in the flow');
    const footed = await footOf(X, await as(db, A, 'select public.hr_town_works_view(0)'));
    if (footed.day !== 'You can give 25,000 gp more today. More after midnight UTC.') out.push('the foot\'s day line reads ' + JSON.stringify(footed.day));
    if (footed.said !== 'The smallest gift is 100 gp.') out.push('the foot\'s answer reads ' + JSON.stringify(footed.said));
    /* A GIFT THE PURSE CAN'T PAY IS OFF BEFORE THE PRESS, AND SAYS WHY (v0.2.97 gate: a 500 gp purse saw "Give 1,000 gp", "Give 5,000 gp" and "Give the 25,000 gp left
       today" live, and "Not enough gold." only after the press). The purse is the envelope's; the room is the server's; the last button gives the smaller. */
    const room = await as(db, A, 'select public.hr_town_works_view(0)');
    const poor = await giftsOf(X, room, 500);
    if (poor.gifts.some((g) => !g.off) || poor.gifts.map((g) => g.why).join('|') !== 'You need 500 gp more.|You need 4,500 gp more.') out.push('with 500 gp the gifts read ' + JSON.stringify(poor.gifts));
    /* the last button says the purse itself; a line more pushed the custom gift under a 1366x768 window's foot (chat-social CW-HAVORA measures it) */
    if (poor.max.words !== 'Give the 500 gp you have' || poor.max.off || poor.max.hidden || poor.cap !== '500' || poor.why) out.push('with 500 gp the last button and its line read ' + JSON.stringify(poor));
    /* where the last button gives what the project still needs, the purse under a gift says it on the line */
    const near = await giftsOf(X, { ...room, left: 800, max_gift: 800 }, 900);
    if (near.gifts[0].off !== true || near.max.words !== 'Give the 800 gp it still needs' || near.why !== 'You have 900 gp. A gift can\'t be more than your purse.') out.push('near the finish with 900 gp the window reads ' + JSON.stringify(near));
    if (poor.sent.join() !== '500') out.push('with 500 gp the last button sent ' + JSON.stringify(poor.sent));
    const flush = await giftsOf(X, room, 30000);
    if (flush.gifts.some((g) => g.off || g.why) || flush.max.words !== 'Give the 25,000 gp left today' || flush.why || flush.sent.join() !== '25000') out.push('with 30,000 gp the window reads ' + JSON.stringify(flush));
    const unsaid = await giftsOf(X, room, null);
    if (unsaid.gifts.some((g) => g.off) || unsaid.max.words !== 'Give the 25,000 gp left today' || unsaid.why) out.push('with no purse stated the window judges for the server: ' + JSON.stringify(unsaid));
    const empty = await giftsOf(X, room, 0), crumbs = await giftsOf(X, room, 50);
    if (empty.gifts.some((g) => !g.off) || !empty.max.hidden || !empty.typed || empty.why !== 'Your purse is empty.' || empty.sent.length) out.push('an empty purse reads ' + JSON.stringify(empty));
    if (!crumbs.max.hidden || !crumbs.typed || crumbs.why !== 'You have 50 gp, and the smallest gift is 100 gp.') out.push('a purse under the smallest gift reads ' + JSON.stringify(crumbs));
    /* THE SERVER'S ANSWER, read field by field */
    await give(db, A, 0, 2000);
    const view = await as(db, A, 'select public.hr_town_works_view(0)');
    const w = X.TI.parseWorks(view);
    if (!w || w.total !== 2000 || w.goal !== 1000000 || w.stage !== 0 || w.leftToday !== 23000 || w.maxGift !== 23000 || w.lastGift !== 2000 || w.place !== 1 || w.gold !== 2000 || w.plaque[0].name !== 'Marlow' || !w.plaque[0].mine) out.push('the window parses ' + JSON.stringify(w));
    if (X.TI.parseWorks({ ok: true }) !== null || X.TI.parseWorks({ ok: false }) !== null || X.TI.parseWorks(null) !== null) out.push('a broken answer parsed');
    if (w && X.TI.parseWorks({ ...view, stage_at: ['x'] }) !== null) out.push('a broken stage list parsed');
    const row = X.TWD.TOWN_WORKS.weighhouse;
    if (w) {
      if (X.WK.maxWords(w) !== 'Give the 23,000 gp left today') out.push('the last button reads ' + X.WK.maxWords(w));
      if (X.WK.stageWords(w, row) !== 'Staked out: 2,000 of 1,000,000 gp') out.push('the stage line reads ' + X.WK.stageWords(w, row));
      if (X.WK.nextWords(w, row) !== '98,000 gp more and it has its footings.') out.push('the next line reads ' + X.WK.nextWords(w, row));
      if (X.WK.todayWords(w) !== 'You can give 23,000 gp more today. More after midnight UTC.') out.push('today\'s line reads ' + X.WK.todayWords(w));
      if (X.WK.meWords(w) !== 'You\'re 1st, with 2,000 gp given.') out.push('own line reads ' + X.WK.meWords(w));
      const near = { ...w, left: 800, maxGift: 800 };
      if (X.WK.maxWords(near) !== 'Give the 800 gp it still needs') out.push('near the finish the last button reads ' + X.WK.maxWords(near));
      if (X.WK.todayWords({ ...w, maxGift: 0, perDay: 25000 }) !== 'Havora takes 25,000 gp a day from one account, and you\'ve given yours. More after midnight UTC.') out.push('a spent day reads ' + X.WK.todayWords({ ...w, maxGift: 0 }));
      if (X.WK.nextWords({ ...w, stage: 4 }, row) !== '') out.push('the finish still asks for more');
      if (X.WK.meWords({ ...w, gold: 0 }) !== 'You haven\'t given to The Weighhouse yet.') out.push('no gift reads ' + X.WK.meWords({ ...w, gold: 0 }));
      if (X.WK.meWords({ ...w, place: null }) !== 'You\'ve given 2,000 gp.') out.push('a hidden account reads ' + X.WK.meWords({ ...w, place: null }));
      for (const [n, s] of [[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [11, '11th'], [12, '12th'], [13, '13th'], [21, '21st'], [101, '101st'], [111, '111th']]) if (X.WK.placeWords(n) !== s) out.push(`place ${n} reads ${X.WK.placeWords(n)}`);
    }
    /* THE INTENT: the gift is the one number, and a fresh key every press */
    const sent = [];
    const account = { server: { rpc: async (name, args) => { sent.push([name, args]); return { ok: true, body: { ok: true, amount: args.p_amount, total: 5, goal: 10, stage: 0 } }; } } };
    const cs = { slot: 0, status: 'open', load: async () => {} };
    await X.TI.giveToWorks(account, cs, P, 1000);
    await X.TI.giveToWorks(account, cs, P, 1000);
    if (sent.length !== 2 || sent[0][0] !== 'hr_town_works_give') out.push('the intent calls ' + JSON.stringify(sent[0]));
    else {
      if (Object.keys(sent[0][1]).sort().join() !== 'p_amount,p_idem,p_project,p_slot') out.push('the intent sends ' + Object.keys(sent[0][1]));
      if (sent[0][1].p_idem === sent[1][1].p_idem) out.push('two presses share one key');
    }
    for (const bad of [0, -1, 1.5, '100', null]) {
      const r = await X.TI.giveToWorks(account, cs, P, bad);
      if (r.ok !== false) out.push('a gift of ' + bad + ' reached the server');
    }
    if (sent.length !== 2) out.push('a bad gift was sent');
    return out;
  },
};

/* patchWorks over plain elements, a server read and a refused field: what the foot ends up saying. Only what a patch reads is here; a broken selector reads back empty. */
async function footOf(X, view) {
  const els = new Map();
  const el = (s) => {
    if (!els.has(s)) els.set(s, { textContent: '', value: s === '.hv-works-amount' ? 'x' : '', firstElementChild: null, style: { getPropertyValue: () => '', setProperty() {}, removeProperty() {} }, setAttribute() {}, removeAttribute() {}, getAttribute: () => null, classList: { contains: () => false, toggle() {} } });
    return els.get(s);
  };
  const pane = { querySelector: el, querySelectorAll: () => [], ownerDocument: {}, closest: () => ({ querySelector: el }) };
  const cs = { slot: 0, status: 'open', load: async () => {} };
  const ctx = { character: cs, account: { server: { rpc: async () => ({ ok: true, body: { ...view, plaque: [] } }) } }, now: () => 1000, refresh: () => {} };
  X.WK.patchWorks(pane, ctx);
  await new Promise((r) => setTimeout(r, 20));
  X.WK.actWorks(ctx, pane, 'works-typed', { type: 'click' }, el('.hv-works-typed'));
  X.WK.patchWorks(pane, ctx);
  return { day: el('.hv-count[data-of="works"]').textContent, said: el('.hh-intent-msg').textContent };
}

/* patchWorks over plain elements with the envelope's purse (`state.gold`), the gift buttons as the pane draws them: what each button, the last button,
   the field and the line under them end up as, and what a press on the last button sends. */
async function giftsOf(X, view, purse) {
  const els = new Map();
  const fake = (amount) => {
    const at = {};
    return { textContent: '', value: '', disabled: false, hidden: false, firstElementChild: null, at, style: { getPropertyValue: () => '', setProperty() {}, removeProperty() {} },
      getAttribute: (k) => (k === 'data-amount' && amount !== null ? String(amount) : k in at ? at[k] : null), setAttribute: (k, v) => { at[k] = String(v); },
      hasAttribute: (k) => k in at, removeAttribute: (k) => { delete at[k]; }, classList: { contains: () => false, toggle() {} } };
  };
  const el = (s) => { if (!els.has(s)) els.set(s, fake(null)); return els.get(s); };
  const gifts = X.TWD.TOWN_WORKS.weighhouse.gifts.map(fake);
  const pane = { querySelector: (s) => (s === '[data-hs-act="works-typed"]' ? el('typed') : el(s)), querySelectorAll: (s) => (s === '[data-hs-act="works-give"]' ? gifts : []), ownerDocument: {}, closest: () => ({ querySelector: el }) };
  const sent = [];
  const cs = { slot: 0, status: 'open', load: async () => {}, read: (k) => (k === 'state' && purse !== null ? { gold: purse, gold_v: 1 } : undefined) };
  const rpc = async (name, args) => { if (name === 'hr_town_works_view') return { ok: true, body: { ...view, plaque: [] } }; sent.push(args); return { ok: true, body: { ok: true, amount: args.p_amount, total: 1, goal: 2, stage: 0 } }; };
  const ctx = { character: cs, account: { server: { rpc } }, now: () => 1000, refresh: () => {} };
  X.WK.patchWorks(pane, ctx);
  await new Promise((r) => setTimeout(r, 20));
  X.WK.patchWorks(pane, ctx);
  const max = el('.hv-works-max');
  const out = { gifts: gifts.map((b) => ({ amount: Number(b.getAttribute('data-amount')), off: b.disabled, why: b.getAttribute('data-off-why') })),
    max: { words: max.textContent, off: max.disabled, hidden: max.hidden }, typed: el('typed').disabled, cap: el('.hv-works-amount').getAttribute('max'), why: el('.hv-works-why').textContent };
  if (!max.hidden && !max.disabled) { X.WK.actWorks(ctx, pane, 'works-max', { type: 'click' }, max); await new Promise((r) => setTimeout(r, 20)); }
  return { ...out, sent: sent.map((a) => a.p_amount) };
}

function plantSql(text, [, find, repl]) {
  if (text.split(find).length !== 2) throw Object.assign(new Error('sql mutant anchor not found once: ' + find.slice(0, 80)), { harness: true });
  return text.replace(find, () => repl);
}

function walk(dir, out = []) {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(m?js|ts)$/.test(e.name)) out.push([rel, readFileSync(join(ROOT, rel), 'utf8')]);
  }
  return out;
}
const ENGINE_FILES = walk('src/core').concat(walk('supabase/functions'));
const CLIENT_FILES = walk('src').filter(([rel]) => !/^src\/(vendor|core)\//.test(rel));
let EDGE_FILES = [];

async function loadReaders(root) {
  const u = (p) => pathToFileURL(join(root, p)).href + '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
  const [bookm, sets, terrain, path] = await Promise.all(['src/world/core/book.js', 'src/data/world/atlas-sets.js', 'src/data/world/terrain.js', 'src/world/core/path.js'].map((p) => import(u(p))));
  const manifests = {};
  for (const set of sets.LOADED_SETS) manifests[set] = JSON.parse(readFileSync(join(ROOT, 'assets/world/atlas-' + set + '.json'), 'utf8'));
  return {
    TWD: await import(u('src/data/town-works.js')),
    ST: await import(u('src/data/world/sink-taps.js')),
    IW: await import(u('src/shell/intent-words.js')),
    RW: await import(u('src/data/refusal-words.js')),
    HR: await import(u('src/data/honor-roll.js')),
    HW: await import(u('src/shell/windows/havora/index.js')),
    WK: await import(u('src/shell/windows/havora/works.js')),
    TI: await import(u('src/session/town-intents.js')),
    TW: await import(u('src/world/town-works.js')),
    SL: await import(u('src/world/steer-local.js')),
    CL: await import(u('src/social/chat-lines.js')),
    SW: await import(u('src/data/shell-windows.js')),
    maps: await import(u('src/data/world/maps/index.js')),
    plan: await import(u('src/data/world/town/plan.js')),
    mapc: await import(u('src/world/core/map-compile.js')),
    compose: await import(u('src/world/core/compose.js')),
    stations: await import(u('src/data/world/stations.js')),
    book: bookm.createBook(manifests),
    terrain,
    reach: (map, from, to) => path.reachFrom(map.mask, map.w, map.h, from)[to[1] * map.w + to[0]] === 1,
    engineFiles: ENGINE_FILES,
    clientFiles: CLIENT_FILES,
    edgeFiles: EDGE_FILES,
  };
}

/* One arm in its own transaction, the planted defect (if any) inside it. */
async function runArm(db, X, id, mutant) {
  await db.query('begin');
  try {
    if (mutant && mutant.db) {
      const [fn, ...pairs] = mutant.db;
      let def = String(await one(db, 'select pg_get_functiondef($1::regprocedure)', [fn])).split(String.fromCharCode(13)).join('');
      for (let i = 0; i < pairs.length; i += 2) {
        if (def.split(pairs[i]).length !== 2) throw Object.assign(new Error(`mutant anchor not found once in ${fn}: ${pairs[i].slice(0, 80)}`), { harness: true });
        def = def.replace(pairs[i], () => pairs[i + 1]);
      }
      await db.exec(def);
    }
    if (mutant && mutant.ddl) await db.exec(mutant.ddl);
    return await ARMS[id](db, X, mutant);
  } finally { await db.query('rollback'); await claims(db, null).catch(() => {}); }
}

async function main() {
  if (process.argv.includes('--list')) { for (const [id, m] of Object.entries(MUTANTS)) console.log(`${id}  [${m.arm}]  ${m.why}`); return; }
  const { bootReplay } = await import('./schema-replay.mjs');
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 800)); process.exit(1); }
  const { pack } = await import('../tools/pack-edge.mjs');
  EDGE_FILES = (await pack('hr-accrue')).files.map((f) => f.name);
  const X = await loadReaders(ROOT);
  const pick = (process.argv.find((a) => a.startsWith('--mutate=')) || '').slice(9);
  const onlyArm = (process.argv.find((a) => a.startsWith('--arm=')) || '').slice(6);
  if (!(process.argv.includes('--selftest') || pick)) {
    let bad = 0;
    for (const id of Object.keys(ARMS)) {
      if (onlyArm && id !== onlyArm) continue;
      let p;
      try { p = await runArm(db, X, id, null); } catch (e) { p = ['threw: ' + String(e && e.stack || e).slice(0, 700)]; }
      if (p.length) { bad++; for (const m of p) console.error(`✗ ${id}: ${m}`); } else console.log(`✓ ${id}`);
    }
    console.log(bad ? `town-works: ${bad} arm(s) red` : `town-works: all ${Object.keys(ARMS).length} arms green`);
    process.exit(bad ? 1 : 0);
  }
  if (pick && !MUTANTS[pick]) { console.error('unknown mutant ' + pick); process.exit(2); }
  let missed = 0;
  const ids = pick ? [pick] : Object.keys(MUTANTS).filter((id) => !onlyArm || MUTANTS[id].arm === onlyArm);
  for (const id of ids) {
    const m = MUTANTS[id];
    let p;
    try {
      if (m.js) {
        const dir = mkdtempSync(join(tmpdir(), 'hr-tw-'));
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
  console.log(missed ? `town-works --selftest: ${missed} of ${ids.length} mutant(s) survived` : `town-works --selftest: all ${ids.length} mutants killed`);
  process.exit(missed ? 1 : 0);
}

if (isMain(import.meta.url)) await main();
