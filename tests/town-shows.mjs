#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/town-shows.mjs — WHAT GOLD BUYS IN HAVORA, AND THE SEAMS THE SINK LANES SHARE (Tyler 2026-11-04; the designer's board section
//   "2026-11-04 Gold sinks"; the five 2027-02-27-* files; src/data/gold-sinks.js). The Crier's own rules are tests/town-crier.mjs; the real race is tests/town-shows-race.mjs.
//
//   node tests/town-shows.mjs             the guard
//   node tests/town-shows.mjs --list      the mutation catalogue
//   node tests/town-shows.mjs --selftest  every planted defect must turn its arm red
//   node tests/town-shows.mjs --mutate=<id>
//
// mutant-anchors: supabase/migrations/2027-02-27-gold-sinks-seams.sql, supabase/migrations/2027-02-27-town-shows.sql, supabase/migrations/2027-02-27-gold-given.sql
//
// The real chain replayed (PGlite), the real client modules; production untouched:
//   TS-RULES   hr_sink_rules holds exactly the data file's rows; setup slots are one row: free + prices = the hero's setup limit
//   TS-PRICE   hr_sink_price climbs, ends in null, reads a Level; every helper here is the owner's: no client role can call one
//   TS-TITLE   replacing ONLY hr_title_of's body (what lane/c-hero-sinks does) reaches the chat row through hr_chat_send, the hero's
//              look and a stranger's town read, and a forged from_title on an insert never survives
//   TS-COLORS  a hero's base_colors reach a stranger's town read; none chosen reads null
//   TS-TOWN    replacing ONLY hr_town_extras / hr_town_shows_of reaches the town read as `extras` / `shows`; the read keeps what it had
//   TS-AGAIN   a second apply of all five files is byte-identical and never overwrites a body a later lane put in a stub
//   TS-CLIENT  the walker keeps a title and colors and refuses junk; the plate reads "Marlow the Wolfer · 18"; a chat line carries the
//              title and draws it; the Works stubs stay hidden
//   TS-XP      a bought powder pays zero Inner Flame XP by any path: no xp key in the verb, no item to burn, no recipe, no named row
//   TS-NAMED   a named fuel never waits behind a bought powder; it answers first in the square; the paused powder still burns every second it paid for
//   TS-CLIMB   two heroes on one account share one ladder, in order, each paying the next price; the lock order is hero, sink key, the count, the charge, the town's key
//   TS-REFUSE  a show that loses the queue race rolls back whole: purse, journal, intent, row, line, board; the same key then buys it once
//   TS-QUOTE   a stale or forged price gets quote_changed, never a charge at the client's number
//   TS-LEDGER  exactly one ledger row per purchase, kind shop, intent town_show:<show>:<price>; a replayed key charges once
//   TS-HUNT    a hunting hero is refused in town words and charged nothing
//   TS-QUIET   a quiet hero pays and shows with no name and no line
//   TS-LINES   a powder's line in Local and a round's in System hold only the server's sentence and the stamped name
//   TS-GIVEN   Gold Given counts only the town's sinks, in the charge's transaction; no client can call the counter; it ranks accounts, shows the lead hero, hides as the
//              boards hide, resets by UTC month
//   TS-NO-METER THE STANDING GUARD: nothing but the named functions reads town_shows or the purchase journal: gold into the Hearthrise meter is a paid XP buff (avoid list)
//   TS-EDGE    bought flames stay out of src/data/hearth.js, and src/data/gold-sinks.js is in no edge bundle, so this lane moves no edge hash
//   TS-WORDS   every refusal says why in the designer's sentence, with the server's numbers
//   TS-WINDOW  the Havora window's buttons read the server's quote; its tabs hide Works; the Tavern opens its Round tab; a bought flame swaps the fire's art and a round bursts;
//              the Hearth tab says what a powder does, and the day's line and the answer stand in the window's foot (tests/chat-social.mjs CW-HAVORA measures the foot in a browser)
//   TS-SHOW    a round is a show for its whole length: shells climb from the square and burst high over it, in many places, never dark for long, never crowding the square;
//              each shell is large, mostly air and no mirrored stamp, and every shell steps on one tick so a show can't repaint the town every frame
// TRUE CONCURRENCY: PGlite is one backend, so TS-CLIMB and TS-REFUSE prove the order and the rollback; tests/town-shows-race.mjs runs both on real PostgreSQL 17 backends.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const A = '000000c0-0000-4000-a000-0000901d7a01';
const B = '000000c0-0000-4000-a000-0000901d7a02';
const idem = () => crypto.randomUUID();
const MIG = (f) => readFileSync(join(ROOT, 'supabase', 'migrations', f), 'utf8').replace(/\r\n/g, '\n');
const CATALOGUE = '2027-02-27-gold-sinks-catalogue.generated.sql';
const SEAMS = '2027-02-27-gold-sinks-seams.sql';
const LOOK = 'public.hr_town_look(uuid,integer)';
const VIEW = 'public.hr_town_view(integer,text,integer,integer,bigint,integer,integer)';
const CHAT_ROW = 'public.hr_chat_row(public.chat_messages)';
const NAME_TRIGGER = 'public.hr_chat_name_authority()';
const PRICE = 'public.hr_sink_price(text,integer,integer)';
const THE_MAP = 'town_common';
const SHOW = 'public.hr_town_show(integer,text,bigint,uuid)';
const BURN = 'public.hr_hearth_burn(integer,text,uuid)';
const FLAME = 'public.hr_hearth_flame_of(text)';
const PUSH = 'public.hr_town_show_push(text,timestamp with time zone,timestamp with time zone)';
const ADD = 'public.hr_gold_given_add(uuid,integer,bigint)';
const CHAIN = [CATALOGUE, SEAMS, '2027-02-27-gold-given.sql', '2027-02-27-town-crier.sql', '2027-02-27-town-shows.sql'];

/* ── THE PLANTED DEFECTS ─────────────────────────────────────────────────────
   db: a live body edited inside the arm's transaction (fn, find, replace). ddl: a statement in it. sql: an edit of a migration's TEXT the
   arm re-applies. js: a client module, copied and edited. Each names the arm that must go red. */
export const MUTANTS = {
  price_wrong_rung: { arm: 'TS-PRICE', why: 'the first purchase is charged the second rung',
    db: [PRICE, 'r.prices[greatest(coalesce(p_bought, 0), 0) + 1]', 'r.prices[greatest(coalesce(p_bought, 0), 0) + 2]'] },
  price_ignores_level: { arm: 'TS-PRICE', why: 'a Level price reads Level 1 for everyone',
    db: [PRICE, 'r.price_base + r.price_per_level * greatest(coalesce(p_level, 1), 1)', 'r.price_base + r.price_per_level'] },
  helper_open_to_clients: { arm: 'TS-PRICE', why: 'a client role can call a helper', ddl: `grant execute on function public.hr_title_of(uuid, integer) to authenticated` },
  rules_drift: { arm: 'TS-RULES', why: 'the table no longer says what the data file says', ddl: `update public.hr_sink_rules set prices = array[1, 2, 3]::bigint[] where sink_id = 'round'` },
  setups_past_limit: { arm: 'TS-RULES', why: 'free + prices is more than a hero can hold', ddl: `update public.hr_sink_rules set free = 3 where sink_id = 'setup_slot'` },
  title_not_stamped: { arm: 'TS-TITLE', why: 'the trigger stops stamping the title',
    db: [NAME_TRIGGER, "  new.from_title := case when new.from_id is null then null\n                         else left(public.hr_title_of(new.from_id, coalesce(new.from_slot, 0)), 40) end;\n", ''] },
  title_from_client: { arm: 'TS-TITLE', why: 'a forged title survives the insert',
    db: [NAME_TRIGGER, "  new.from_title := case when new.from_id is null then null\n", "  new.from_title := case when new.from_id is null or new.from_title is not null then new.from_title\n"] },
  row_drops_title: { arm: 'TS-TITLE', why: 'the chat row leaves the title out', db: [CHAT_ROW, "'from_title', m.from_title, ", ''] },
  row_drops_crier: { arm: 'TS-TITLE', why: 'the chat row leaves the Crier flag out', db: [CHAT_ROW, ", 'crier', m.crier", ''] },
  look_drops_title: { arm: 'TS-TITLE', why: 'a stranger never sees the title', db: [LOOK, "'title', left(public.hr_title_of(p_user, p_slot), 40),", "'title', null,"] },
  look_drops_colors: { arm: 'TS-COLORS', why: 'a stranger never sees the colors',
    db: [LOOK, "(select nullif(po.base_colors, '{}'::jsonb) from public.player_outfits po where po.user_id = p_user and po.slot = p_slot)", 'null::jsonb'] },
  view_drops_extras: { arm: 'TS-TOWN', why: 'the town read never carries the Works', db: [VIEW, "    'extras', public.hr_town_extras(p_map));", "    'extras', '{}'::jsonb);"] },
  view_drops_shows: { arm: 'TS-TOWN', why: 'the town read never carries the shows', db: [VIEW, "    'shows', public.hr_town_shows_of(p_map),\n", "    'shows', null,\n"] },
  stub_overwrites: { arm: 'TS-AGAIN', why: 'a second apply puts the stub back over a later lane\'s body',
    sql: [SEAMS, "  if to_regprocedure('public.hr_title_of(uuid,integer)') is null then\n    create function public.hr_title_of(p_user uuid, p_slot int)",
      "  if true then\n    create or replace function public.hr_title_of(p_user uuid, p_slot int)"] },
  repin_lost: { arm: 'TS-AGAIN', why: 'a second apply refuses because the pin forgot this file\'s own image',
    sql: [SEAMS, "('public.hr_town_look(uuid,integer)', '1a6ceebe218f985e63f182e3fa9515f2', '4e2d78833019b7001758dd04a1fb60cb')", "('public.hr_town_look(uuid,integer)', '1a6ceebe218f985e63f182e3fa9515f2', '00000000000000000000000000000000')"] },
  walker_keeps_junk: { arm: 'TS-CLIENT', why: 'a title that is not plain words reaches the plate',
    js: ['src/session/town-presence.js', [["    title: typeof w.title === 'string' && TITLE.test(w.title) ? w.title : null,", '    title: w.title,']]] },
  plate_no_title: { arm: 'TS-CLIENT', why: 'the town label drops the title',
    js: ['src/world/town-scene.js', [["w.name + (w.title ? ' ' + w.title : '') + (w.level", 'w.name + (w.level']]] },
  line_no_title: { arm: 'TS-CLIENT', why: 'a chat line drops the title',
    js: ['src/social/chat-lines.js', [["    title: !whisper && typeof row.from_title === 'string' && TITLE.test(row.from_title) ? row.from_title : null,", '    title: null,']]] },
  extras_merged: { arm: 'TS-CLIENT', why: 'an answer with no extras keeps the last ones',
    js: ['src/session/town-presence.js', [["    this._extras = b.extras && typeof b.extras === 'object' && !Array.isArray(b.extras) ? b.extras : null;", "    this._extras = b.extras && typeof b.extras === 'object' && !Array.isArray(b.extras) ? b.extras : this._extras;"]]] },
  works_shown: { arm: 'TS-CLIENT', why: 'the Works tab shows before its lane lands',
    js: ['src/shell/windows/havora/works.js', [["shown: false", 'shown: true']]] },
  /* A BOUGHT POWDER PAYS NO XP */
  powder_pays_xp: { arm: 'TS-XP', why: 'a powder pays Inner Flame XP',
    db: [SHOW, "             'gold', -v_price,\n", "             'gold', -v_price, 'xp', jsonb_build_object('inner_flame', 500),\n"] },
  /* A NAMED FUEL NEVER WAITS */
  push_removed: { arm: 'TS-NAMED', why: 'a named fuel burns over a powder, which loses those seconds',
    db: [BURN, "  perform public.hr_town_show_push(v_map, v_start, v_end);\n", ''] },
  push_loses_time: { arm: 'TS-NAMED', why: 'a paused powder burns for less than it paid for',
    db: [PUSH, "         ends_at = s.ends_at + (p_until - p_from)", "         ends_at = s.ends_at + (p_until - p_from) / 2"] },
  bought_answers_first: { arm: 'TS-NAMED', why: 'the square shows a powder over a named flame',
    db: [FLAME, "      where f.map_id = p_map and f.starts_at <= now() and f.ends_at > now()\n", "      where f.map_id = p_map and f.starts_at <= now() and f.ends_at > now() and not exists (select 1 from public.town_shows x where x.map_id = p_map and x.starts_at <= now() and x.ends_at > now())\n"] },
  named_waits: { arm: 'TS-NAMED', why: 'a named fuel queues behind bought powders',
    db: [BURN, "    perform pg_advisory_xact_lock(hashtextextended('hr:hearth:' || v_map, 0));\n    v_start := greatest(now(), coalesce((select max(f.ends_at) from public.hearth_flames f where f.map_id = v_map), now()));",
      "    perform pg_advisory_xact_lock(hashtextextended('hr:hearth:' || v_map, 0));\n    v_start := greatest(now(), coalesce((select max(f.ends_at) from public.hearth_flames f where f.map_id = v_map), now()), coalesce((select max(s.ends_at) from public.town_shows s where s.map_id = v_map), now()));"] },
  burn_key_first: { arm: 'TS-NAMED', why: 'the Hearth\'s key is held over the charge, which deadlocks against a powder on the same account',
    db: [BURN, "    -- THE BURN: the item and the XP, journalled, exactly once on this key\n", "    perform pg_advisory_xact_lock(hashtextextended('hr:hearth:' || v_map, 0));\n"] },
  burn_race_charges: { arm: 'TS-NAMED', why: 'a burn that lost the queue race keeps the item and the XP',
    db: [BURN, "raise exception using errcode = 'HR942', message = 'hearth_busy'; end if;", "return jsonb_build_object('ok', false, 'error', 'hearth_busy', 'wait_s', 1); end if;"] },
  /* THE CLIMB */
  sink_lock_gone: { arm: 'TS-CLIMB', why: 'two heroes pressing together both read the same count',
    db: [SHOW, "  perform public.hr_sink_lock(v_uid);\n", ''] },
  count_per_hero: { arm: 'TS-CLIMB', why: 'each hero climbs its own ladder, so four heroes get four',
    db: ['public.hr_sink_bought_today(uuid,text,text[])', "l.slot = any (array[0, 1, 2, 3, 4, 5])", 'l.slot = 0'] },
  no_day_limit: { arm: 'TS-CLIMB', why: 'the day\'s cap is never read',
    db: [SHOW, "  if v_price is null then\n", "  if false then\n"] },
  town_key_first: { arm: 'TS-CLIMB', why: 'the town\'s key comes before the purse, so a settle can hold the Hearth',
    db: [SHOW, "    -- THE CHARGE: gold only, never an xp key and never an item. Exactly one journal row.\n", "    perform pg_advisory_xact_lock(hashtextextended('hr:hearth:' || v_map, 0));\n"] },
  /* A REFUSED SHOW CHARGES NOTHING */
  race_not_checked: { arm: 'TS-REFUSE', why: 'a show that lost the race is charged and booked past the cap',
    db: [SHOW, "    if v_free > now() + make_interval(secs => v_rule.book_s) then raise exception using errcode = 'HR938', message = 'show_busy'; end if;\n", ''] },
  race_charges: { arm: 'TS-REFUSE', why: 'a show that lost the race keeps the charge',
    db: [SHOW, "raise exception using errcode = 'HR938', message = 'show_busy'; end if;", "return jsonb_build_object('ok', false, 'error', 'show_busy', 'sink', v_rule.sink_id, 'wait_s', 1, 'booked_s', 1); end if;"] },
  /* THE PRICE */
  trusts_client_price: { arm: 'TS-QUOTE', why: 'a forged price is charged',
    db: [SHOW, "  if v_price <> p_price then\n", "  v_price := p_price;\n  if false then\n"] },
  /* THE JOURNAL */
  wrong_kind: { arm: 'TS-LEDGER', why: 'a purchase journals under another kind', db: [SHOW, "'journal', jsonb_build_object('kind', 'shop', 'intent', v_verb,", "'journal', jsonb_build_object('kind', 'quest', 'intent', v_verb,"] },
  no_replay: { arm: 'TS-LEDGER', why: 'a retried key is not answered from the journal, and hr_apply is reached with a stale read',
    db: [SHOW, "  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);\n  if v_r is not null then return public.hr_note_rejection('town_show', p_slot, v_r); end if;\n  -- THE CATALOGUE", "  -- THE CATALOGUE",
      "  -- A SECOND PRESS OF ONE KEY that waited on that lock answers the first one's decision\n  v_r := public.hr_intent_replay(v_uid, p_slot, p_idem, v_verb);\n  if v_r is not null then return public.hr_note_rejection('town_show', p_slot, v_r); end if;\n", ''] },
  /* HUNTING */
  hunting_allowed: { arm: 'TS-HUNT', why: 'a hero out hunting throws a powder',
    db: [SHOW, "  if v_hunt is not null then\n", "  if false then\n"] },
  /* QUIET */
  quiet_named: { arm: 'TS-QUIET', why: 'a quiet hero is named in the square', db: [FLAME, "'by', case when coalesce(ps.presence_quiet, false) then null else left(public.hr_character_name(s.user_id, s.slot), 24) end,\n              'from_ms', floor(extract(epoch from s.starts_at) * 1000)::bigint,\n              'until_ms', floor(extract(epoch from s.ends_at) * 1000)::bigint,\n              'now_ms', floor(extract(epoch from now()) * 1000)::bigint,\n              'queued', 0)", "'by', left(public.hr_character_name(s.user_id, s.slot), 24),\n              'from_ms', floor(extract(epoch from s.starts_at) * 1000)::bigint,\n              'until_ms', floor(extract(epoch from s.ends_at) * 1000)::bigint,\n              'now_ms', floor(extract(epoch from now()) * 1000)::bigint,\n              'queued', 0)"] },
  quiet_posts_line: { arm: 'TS-QUIET', why: 'a quiet hero posts a line', db: [SHOW, "    if not v_quiet then\n", "    if true then\n"] },
  /* THE LINES */
  round_in_global: { arm: 'TS-LINES', why: 'a round goes to Global, not System', db: [SHOW, "values (v_msg, 'system', v_uid, 'Adventurer', p_slot, 'stood a round at the Tavern.');", "values (v_msg, 'global', v_uid, 'Adventurer', p_slot, 'stood a round at the Tavern.');"] },
  powder_in_system: { arm: 'TS-LINES', why: 'a powder goes to System, not Local', db: [SHOW, "values (v_msg, public.hr_chat_zone_of(v_uid, p_slot), v_uid, 'Adventurer', p_slot, 'notice',", "values (v_msg, 'system', v_uid, 'Adventurer', p_slot, 'notice',"] },
  /* GOLD GIVEN */
  given_not_counted: { arm: 'TS-GIVEN', why: 'a powder never reaches the board', db: [SHOW, "    perform public.hr_gold_given_add(v_uid, p_slot, v_price);\n", ''] },
  given_open_to_clients: { arm: 'TS-GIVEN', why: 'a client can climb the board for free', ddl: 'grant execute on function public.hr_gold_given_add(uuid, integer, bigint) to authenticated' },
  given_from_a_refill: { arm: 'TS-GIVEN', why: 'a verb that is no gift to the town counts',
    db: ['public.hr_stamina_refill(integer,bigint,uuid)', "  update public.player_state\n     set stamina_ms", "  perform public.hr_gold_given_add(v_uid, p_slot, p_price);\n  update public.player_state\n     set stamina_ms"] },
  given_never_resets: { arm: 'TS-GIVEN', why: 'last month still counts', allMonths: true },
  /* THE STANDING GUARD */
  meter_reads_shows: { arm: 'TS-NO-METER', why: 'a Hearthrise meter counts bought flames', ddl: 'create function public.hr_hearthrise_meter(p_map text) returns bigint language sql stable as $f$ select count(*) from public.town_shows where map_id = p_map $f$' },
  meter_view: { arm: 'TS-NO-METER', why: 'a view feeds gold into a meter', ddl: 'create view public.hr_hearthrise_fuel as select map_id, count(*) n from public.town_shows group by 1' },
  meter_reads_journal: { arm: 'TS-NO-METER', why: 'a meter counts purchases off the ledger', ddl: "create function public.hr_hearthrise_paid() returns bigint language sql stable as $f$ select count(*) from public.player_ledger where intent like 'town_show:%' $f$" },
  meter_reads_flame: { arm: 'TS-NO-METER', why: 'a meter reads the flame the square burns, which includes bought ones', ddl: "create function public.hr_hearthrise_lit(p_map text) returns boolean language sql stable as $f$ select public.hr_hearth_flame_of(p_map) is not null $f$" },
  /* THE EDGE */
  flame_in_hearth_data: { arm: 'TS-EDGE', why: 'a bought flame lands in src/data/hearth.js, which the edge bundles',
    js: ['src/data/hearth.js', [["  fire: flame('hearth_fire', 'hearth_flare', 'hearth_burn_sparks', 'burns'),\n", "  fire: flame('hearth_fire', 'hearth_flare', 'hearth_burn_sparks', 'burns'),\n  cinnabar: flame('hearth_fire_cinnabar', 'hearth_flare_cinnabar', 'hearth_burn_sparks_cinnabar', 'burns red'),\n"]]] },
  sinks_in_edge: { arm: 'TS-EDGE', why: 'the sinks\' data reaches the edge bundle', plant: 'edgeFile' },
  /* THE WORDS AND THE WINDOW */
  limit_says_nothing: { arm: 'TS-WORDS', why: 'the day\'s cap reads the plain line, without its number',
    js: ['src/shell/sink-words.js', [["if (r.error === 'show_limit' && num(r.perDay)) return", "if (false) return"]]] },
  button_has_no_price: { arm: 'TS-WINDOW', why: 'the button hides the server\'s price',
    js: ['src/shell/windows/havora/index.js', [["return 'Throw ' + SHOW_FLAMES[show].label + (Number.isSafeInteger(price) ? ': ' + gold(price) : '');", "return 'Throw ' + SHOW_FLAMES[show].label;"]]] },
  tavern_is_a_prop: { arm: 'TS-WINDOW', why: 'a tap on the Tavern opens nothing',
    js: ['src/data/world/sink-taps.js', [["  havora_tavern: Object.freeze({ open: 'window', window: 'havora', tab: 'round' }),\n", '']]] },
  bought_flame_plain: { arm: 'TS-WINDOW', why: 'a bought flame draws the plain fire',
    js: ['src/world/hearth-burn.js', [["const FLAMES = Object.freeze({ ...NAMED_FLAMES, ...SHOW_FLAMES });", "const FLAMES = NAMED_FLAMES;"]]] },
  round_never_bursts: { arm: 'TS-WINDOW', why: 'a round draws nothing',
    js: ['src/world/town-shows.js', [["      if (!fire || !round || now < round.startedAt || now >= round.endsAt) return [];", "      return [];"]]] },
  show_on_the_floor: { arm: 'TS-SHOW', why: 'a shell bursts where it was fired from, on the floor', js: ['src/data/gold-sinks.js', [['riseMs: 416, riseTiles: 6,', 'riseMs: 416, riseTiles: 0,']]] },
  show_is_a_moment: { arm: 'TS-SHOW', why: 'a paid round is over in a few seconds', js: ['src/data/gold-sinks.js', [['  ].map(Object.freeze)),\n});\n\n/** One row per sink', '  ].slice(0, 6).map(Object.freeze)),\n});\n\n/** One row per sink']]] },
  show_in_one_place: { arm: 'TS-SHOW', why: 'every shell bursts on one spot', js: ['src/world/town-shows.js', [['x: fire.x + dx, y: fire.y + dy }); continue; }', 'x: fire.x, y: fire.y + dy }); continue; }']]] },
  show_every_frame: { arm: 'TS-SHOW', why: 'a shell moves on every frame, so a show repaints the town at the screen\'s rate', js: ['src/world/town-shows.js', [['const t = Math.floor((now - round.startedAt) / tickMs) * tickMs;', 'const t = now - round.startedAt;']]] },
  hearth_claims_the_square: { arm: 'TS-WINDOW', why: 'the Hearth tab promises a color the square never shows', js: ['src/shell/windows/havora/index.js', [["It burns that color for ' + whole(SINK_RULES.powder.seconds) + ' seconds, and everyone in ' + esc(TOWN_NAME) + ' sees", "Its color fills ' + esc(TOWN_NAME) + '\\'s square for ' + whole(SINK_RULES.powder.seconds) + ' seconds, and everyone there sees"]]] },
  foot_in_the_pane: { arm: 'TS-WINDOW', why: 'the answer to a press sits outside the foot, under the fold of a short window', js: ['src/shell/windows/havora/index.js', [["    + '<p class=\"hh-intent-msg\" role=\"status\" aria-live=\"polite\"></p></div></div>';", "    + '</div><p class=\"hh-intent-msg\" role=\"status\" aria-live=\"polite\"></p></div>';"]]] },
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
  await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'town-shows guard') on conflict (user_id) do nothing`, [uid]);
  const dye = await one(db, 'select min(idx) from public.hr_outfit_dyes');
  const r = await as(db, uid, 'select public.hr_create_hero($1::int, $2, $3::jsonb, $4::uuid)', [slot, name, JSON.stringify({ head: dye, body: dye, legs: dye, feet: dye }), idem()]);
  if (!r || r.ok !== true) throw Object.assign(new Error(`hr_create_hero(${slot}, ${name}): ` + JSON.stringify(r)), { harness: true });
  await db.query('update public.player_state set stamina_ms = 28800000, stamina_at = now() where user_id = $1 and slot = $2', [uid, slot]);
}
/* A stranger's read of the square, with `whose` standing in it. */
async function strangerSees(db, whose, viewer) {
  await db.query("update public.hr_flags set enabled = true where key = 'town_presence'");
  await as(db, whose, 'select public.hr_town_here(0, $1)', [THE_MAP]);
  await db.query('update public.town_bodies set look = null, look_at = null where user_id = $1', [whose]);
  const read = await as(db, viewer, 'select public.hr_town_view(0, $1, null, null, null, null, null)', [THE_MAP]);
  return { read, walker: (read && read.walkers || []).find((w) => w.id === whose) || null };
}

const purse = async (db, u) => Number(await one(db, 'select gold from public.account_wallet where user_id = $1', [u]));
const rich = (db, u, g = 1000000) => db.query('update public.account_wallet set gold = $2 where user_id = $1', [u, g]);
const bought = (db, u, slot, show, price, key) => as(db, u, 'select public.hr_town_show($1::int, $2, $3::bigint, $4::uuid)', [slot, show, price, key || idem()]);
const calm = (db) => db.query('delete from public.hr_rate_counters');
const shopRows = (db, u) => q(db, "select slot, intent, gold::bigint as gold from public.player_ledger where user_id = $1 and kind = 'shop' order by at, intent", [u]);
const skillXp = (db, u, slot) => one(db, 'select coalesce(sum(xp), 0)::bigint from public.player_skills where user_id = $1 and slot = $2', [u, slot]);
const firstHunt = (db) => one(db, 'select g.hunt_id from public.hr_hunt_grounds g left join public.hr_hunts h on h.hunt_id = g.hunt_id order by coalesce(h.band_min, 0), g.hunt_id limit 1');
const blockedName = async (db) => {
  const stem = await one(db, "select b.stem from public.hr_name_blocklist b where b.match = 'substring' and length(b.stem) between 3 and 12 order by length(b.stem), b.stem limit 1");
  return stem.charAt(0).toUpperCase() + stem.slice(1) + 'qz';
};
/* An insert past every client path: what another buyer's commit looks like while this one waits on the town's key. Rolled back with the arm. */
async function queueFillsDuringTheCharge(db, stranger) {
  await db.exec(`create or replace function public.hr__zz_fill() returns trigger language plpgsql as $f$ begin
      insert into public.town_shows (map_id, sink_id, show_id, user_id, slot, price, starts_at, ends_at)
      values ('${THE_MAP}', 'powder', 'borax', '${stranger}', 0, 1, now(), now() + interval '1 hour');
      return new; end $f$;
    create trigger hr__zz_fill before insert on public.player_ledger for each row execute function public.hr__zz_fill();`);
}

const ARMS = {
  'TS-RULES': async (db, X) => {
    const out = [];
    const rows = await q(db, 'select * from public.hr_sink_rules order by sink_id');
    const want = Object.keys(X.GS.SINK_RULES).sort();
    if (rows.map((r) => r.sink_id).join() !== want.join()) out.push(`the table holds ${rows.map((r) => r.sink_id)}, the data file ${want}`);
    for (const r of rows) {
      const d = X.GS.SINK_RULES[r.sink_id];
      if (!d) continue;
      const same = (a, b) => JSON.stringify(a === null || a === undefined ? null : a) === JSON.stringify(b === null || b === undefined ? null : b);
      const prices = (r.prices || []).map(Number);
      if (!same(prices, d.prices || [])) out.push(`${r.sink_id}: prices ${prices} against ${d.prices}`);
      if (Number(r.free) !== (d.free || 0)) out.push(`${r.sink_id}: free ${r.free} against ${d.free}`);
      for (const [col, key] of [['price_base', 'priceBase'], ['price_per_level', 'pricePerLevel'], ['per_day', 'perDay'], ['seconds', 'seconds'], ['book_s', 'bookS'], ['gap_s', 'gapS'], ['min_level', 'minLevel'], ['max_letters', 'maxLetters'], ['per_minute', 'perMinute']]) {
        if (!same(r[col] === null ? null : Number(r[col]), d[key])) out.push(`${r.sink_id}.${col}: ${r[col]} against ${d[key]}`);
      }
      if (!same(r.offers, d.offers)) out.push(`${r.sink_id}.offers: ${r.offers} against ${d.offers}`);
    }
    const setup = rows.find((r) => r.sink_id === 'setup_slot');
    const limit = Number(await one(db, `select public.hr_hunt_limit('presets')`));
    if (!setup || setup.free + setup.prices.length !== limit) out.push(`setup_slot's free + prices is not the hero's limit of ${limit}`);
    if (rows.some((r) => /boss|call/.test(r.sink_id))) out.push('a boss call row landed: that lane is not approved');
    return out;
  },

  'TS-PRICE': async (db) => {
    const out = [];
    const price = (s, n, l) => one(db, 'select public.hr_sink_price($1, $2::int, $3::int)', [s, n, l === undefined ? null : l]);
    const seen = [];
    for (let n = 0; n <= 5; n++) seen.push(await price('powder', n));
    if (seen.map((v) => (v === null ? 'null' : Number(v))).join() !== '2000,4000,6000,8000,10000,null') out.push(`the powder ladder reads ${seen}`);
    if (Number(await price('setup_slot', 0)) !== 5000 || Number(await price('setup_slot', 2)) !== 40000 || (await price('setup_slot', 3)) !== null) out.push('the setup ladder reads wrong');
    if (Number(await price('hero_colors', 0, 18)) !== 2400 || Number(await price('hero_colors', 0, 45)) !== 3750) out.push(`a Level price reads ${await price('hero_colors', 0, 18)} at 18`);
    if ((await price('no_such_sink', 0)) !== null) out.push('an unknown sink has a price');
    for (const fn of [PRICE, 'public.hr_sink_lock(uuid)', 'public.hr_title_of(uuid,integer)', 'public.hr_town_extras(text)', 'public.hr_town_shows_of(text)', CHAT_ROW, LOOK]) {
      for (const role of ['anon', 'authenticated']) if (await one(db, 'select has_function_privilege($1, $2, $3)', [role, fn, 'execute'])) out.push(`${role} reaches ${fn}`);
    }
    for (const role of ['anon', 'authenticated']) {
      if (await one(db, `select has_table_privilege($1, 'public.hr_sink_rules', 'select') or has_table_privilege($1, 'public.hr_sink_rules', 'insert,update,delete')`, [role])) out.push(`${role} reaches hr_sink_rules`);
      if (await one(db, `select has_table_privilege($1, 'public.chat_messages', 'insert') or has_table_privilege($1, 'public.chat_messages', 'update')`, [role])) out.push(`${role} can write a chat row, so it can set crier`);
    }
    return out;
  },

  'TS-TITLE': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await hero(db, B, 0, 'Tamsel');
    /* THE STUB: nothing worn reads null everywhere. */
    let sent = await as(db, A, 'select public.hr_chat_send(0, $1, $2)', ['global', 'plain words first']);
    if (!sent || sent.ok !== true) return ['hr_chat_send refused the first line: ' + JSON.stringify(sent)];
    if (!('from_title' in sent.line) || sent.line.from_title !== null || sent.line.crier !== false) out.push('a line with the stub reads ' + JSON.stringify(sent.line));
    /* WHAT THE HERO LANE DOES: this body, and nothing else. */
    await db.exec(`create or replace function public.hr_title_of(p_user uuid, p_slot int) returns text language sql stable security definer set search_path = public, pg_catalog as $fn$
      select case when p_user = '${A}'::uuid then 'the Wolfer' end $fn$`);
    sent = await as(db, A, 'select public.hr_chat_send(0, $1, $2)', ['global', 'and a title now']);
    if (!sent || sent.ok !== true) return ['hr_chat_send refused the second line: ' + JSON.stringify(sent)];
    if (sent.line.from_title !== 'the Wolfer') out.push('the chat row carries ' + JSON.stringify(sent.line.from_title));
    const stored = await one(db, 'select from_title from public.chat_messages where id = $1', [sent.line.id]);
    if (stored !== 'the Wolfer') out.push('the stored line holds ' + stored);
    const history = await as(db, B, 'select public.hr_chat_recent(0)');
    if (!history || !Array.isArray(history.lines) || !history.lines.some((l) => l.from_title === 'the Wolfer')) out.push('the chat history drops the title: ' + JSON.stringify(history).slice(0, 200));
    /* A FORGED TITLE never survives, by any path that can insert at all. */
    const forged = await q(db, `insert into public.chat_messages (channel, from_id, from_slot, from_name, from_title, body) values ('global', $1, 0, 'x', 'the Forged', 'zz') returning from_title`, [B]);
    if (forged[0].from_title !== null) out.push('a forged from_title on a hero wearing none survived: ' + forged[0].from_title);
    const forged2 = await q(db, `insert into public.chat_messages (channel, from_id, from_slot, from_name, from_title, body) values ('global', $1, 0, 'x', 'the Forged', 'zz') returning from_title`, [A]);
    if (forged2[0].from_title !== 'the Wolfer') out.push('a forged from_title beat the worn one: ' + forged2[0].from_title);
    /* A STRANGER'S READ OF THE SQUARE */
    const { walker } = await strangerSees(db, A, B);
    if (!walker) out.push('the stranger never saw the hero');
    else if (walker.title !== 'the Wolfer') out.push('the stranger reads the title ' + JSON.stringify(walker.title));
    const none = await one(db, 'select public.hr_town_look($1::uuid, 0)', [B]);
    if (none.title !== null || !('title' in none)) out.push('a hero wearing none has a look of ' + JSON.stringify(none));
    return out;
  },

  'TS-COLORS': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await hero(db, B, 0, 'Tamsel');
    const dyes = (await q(db, 'select idx from public.hr_outfit_dyes order by idx limit 4')).map((r) => Number(r.idx));
    const chosen = { head: dyes[0], body: dyes[1], legs: dyes[2], feet: dyes[3] };
    await db.query('update public.player_outfits set base_colors = $2::jsonb where user_id = $1 and slot = 0', [A, JSON.stringify(chosen)]);
    const { walker } = await strangerSees(db, A, B);
    if (!walker) return ['the stranger never saw the hero'];
    if (JSON.stringify(walker.colors) !== JSON.stringify(await one(db, 'select $1::jsonb', [JSON.stringify(chosen)]))) out.push('the stranger reads colors ' + JSON.stringify(walker.colors));
    await db.query(`update public.player_outfits set base_colors = '{}'::jsonb where user_id = $1 and slot = 0`, [A]);
    const look = await one(db, 'select public.hr_town_look($1::uuid, 0)', [A]);
    if (look.colors !== null) out.push('a hero with none chosen reads ' + JSON.stringify(look.colors));
    return out;
  },

  'TS-TOWN': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await hero(db, B, 0, 'Tamsel');
    const before = await strangerSees(db, A, B);
    if (!before.read || before.read.ok !== true) return ['the town read answered ' + JSON.stringify(before.read)];
    if (JSON.stringify(before.read.extras) !== '{}' || before.read.shows !== null) out.push(`the stubs read extras ${JSON.stringify(before.read.extras)}, shows ${JSON.stringify(before.read.shows)}`);
    for (const k of ['map', 'inst', 'cap', 'full', 'cursor', 'area', 'walkers', 'gone', 'me', 'hearth']) if (!(k in before.read)) out.push(`the town read lost ${k}`);
    await db.exec(`create or replace function public.hr_town_extras(p_map text) returns jsonb language sql stable security definer set search_path = public, pg_catalog as $fn$
      select jsonb_build_object('works', jsonb_build_object('map', p_map, 'stage', 2)) $fn$`);
    await db.exec(`create or replace function public.hr_town_shows_of(p_map text) returns jsonb language sql stable security definer set search_path = public, pg_catalog as $fn$
      select jsonb_build_object('round', p_map) $fn$`);
    const after = await as(db, B, 'select public.hr_town_view(0, $1, null, null, null, null, null)', [THE_MAP]);
    if (!after.extras || !after.extras.works || after.extras.works.stage !== 2 || after.extras.works.map !== THE_MAP) out.push('a later lane\'s extras never reached the read: ' + JSON.stringify(after.extras));
    if (!after.shows || after.shows.round !== THE_MAP) out.push('the shows never reached the read: ' + JSON.stringify(after.shows));
    return out;
  },

  'TS-AGAIN': async (db, X, mutant) => {
    const out = [];
    const plantIn = (f) => (mutant && mutant.sql && mutant.sql[0] === f ? plantSql(MIG(f), mutant.sql) : MIG(f));
    const inventory = async () => (await q(db, `select p.oid::regprocedure::text fn, md5(pg_get_functiondef(p.oid)) m from pg_proc p
      where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.proname in ('hr_sink_price', 'hr_sink_lock', 'hr_sink_bought_today', 'hr_title_of', 'hr_town_extras', 'hr_town_shows_of', 'hr_town_look', 'hr_town_view', 'hr_chat_row', 'hr_chat_name_authority',
        'hr_gold_given_add', 'hr_lb_boards', 'hr_lb_row', 'hr_crier_send', 'hr_crier_has_link', 'hr_town_crier_quote', 'hr_town_show', 'hr_town_show_free_at', 'hr_town_show_push', 'hr_town_sink_quote', 'hr_town_sinks_view', 'hr_hearth_flame_of', 'hr_hearth_burn') order by 1`))
      .map((r) => r.fn + ':' + r.m).join('\n');
    /* a later lane has put its body in a stub, as the hero lane will */
    await db.exec(`create or replace function public.hr_title_of(p_user uuid, p_slot int) returns text language sql stable security definer set search_path = public, pg_catalog as $fn$ select 'the Later Lane'::text $fn$`);
    await db.exec(`revoke execute on function public.hr_title_of(uuid, integer) from public, anon, authenticated, service_role`);
    const was = await inventory();
    const rows = JSON.stringify(await q(db, 'select * from public.hr_sink_rules order by sink_id'));
    await db.exec('savepoint again');
    try {
      for (const f of CHAIN) await db.exec(plantIn(f));
    } catch (e) {
      out.push('the second apply refused: ' + String(e.message).split('\n')[0].slice(0, 180));
      await db.exec('rollback to savepoint again');
      return out;
    }
    if ((await inventory()) !== was) out.push('a second apply moved a body');
    if (JSON.stringify(await q(db, 'select * from public.hr_sink_rules order by sink_id')) !== rows) out.push('a second apply moved a price row');
    if ((await one(db, 'select public.hr_title_of($1::uuid, 0)', [A])) !== 'the Later Lane') out.push('a second apply put the stub back over a later lane\'s body');
    return out;
  },

  'TS-XP': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await rich(db, A);
    const before = { skills: await skillXp(db, A, 0), level: await one(db, 'select level_xp::bigint from public.player_state where user_id = $1 and slot = 0', [A]) };
    const r = await bought(db, A, 0, 'cinnabar', 2000);
    if (!r || r.ok !== true) return ['the powder was refused: ' + JSON.stringify(r)];
    if (String(await skillXp(db, A, 0)) !== String(before.skills)) out.push('a powder paid skill XP');
    if (String(await one(db, 'select level_xp::bigint from public.player_state where user_id = $1 and slot = 0', [A])) !== String(before.level)) out.push('a powder paid Level XP');
    const src = await one(db, 'select prosrc from pg_proc where oid = $1::regprocedure', [SHOW]);
    if (/'xp'|'level_xp'|'items'/.test(src)) out.push('the verb names an xp or items key');
    /* NO OTHER PATH: nothing to stock, no bench to run, no named row to burn */
    for (const offer of ['cinnabar', 'quicklime', 'borax', 'round']) {
      const burn = await as(db, A, 'select public.hr_hearth_burn(0, $1, $2::uuid)', [offer, idem()]);
      if (burn.error !== 'not_a_fuel') out.push(`hr_hearth_burn on ${offer} answered ${JSON.stringify(burn)}`);
      if (await one(db, 'select exists (select 1 from public.hr_items where item_id = $1)', [offer])) out.push(offer + ' is an item, so it can be stocked or traded');
      if (await one(db, "select exists (select 1 from public.hr_activities where activity_id like '%' || $1 || '%')", [offer])) out.push(offer + ' is a bench run');
      if (await one(db, 'select exists (select 1 from public.hr_hearth_named where flame = $1)', [offer])) out.push(offer + ' is a named flame');
    }
    return out;
  },

  'TS-NAMED': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await hero(db, B, 0, 'Tamsel');
    await rich(db, A);
    await db.query("insert into public.player_skills (user_id, slot, skill_id, xp) values ($1, 0, 'inner_flame', 50000000) on conflict (user_id, slot, skill_id) do update set xp = excluded.xp", [B]);
    await db.query("insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, 'den_knot', 3) on conflict (user_id, slot, item_id) do update set qty = excluded.qty", [B]);
    const nowMs = Number(await one(db, 'select floor(extract(epoch from now()) * 1000)::bigint'));
    const p = await bought(db, A, 0, 'cinnabar', 2000);
    if (!p || p.ok !== true) return ['the powder was refused: ' + JSON.stringify(p)];
    if (Number(p.from_ms) !== nowMs || Number(p.until_ms) !== nowMs + 30000) out.push('the powder is not booked now for 30 s: ' + JSON.stringify(p));
    const seenFirst = await one(db, 'select public.hr_hearth_flame_of($1)', [THE_MAP]);
    if (seenFirst.flame !== 'cinnabar' || seenFirst.bought !== true || seenFirst.item !== null) out.push('the square reads ' + JSON.stringify(seenFirst));
    /* TEN SECONDS LATER (now() stands still in a transaction, so the row moves): the powder is mid-burn when the named fuel lands */
    await db.query("update public.town_shows set starts_at = starts_at - interval '10 seconds', ends_at = ends_at - interval '10 seconds' where user_id = $1", [A]);
    /* THE NAMED FUEL: at once, not behind the powder */
    const n1 = await as(db, B, 'select public.hr_hearth_burn(0, $1, $2::uuid)', ['den_knot', idem()]);
    if (!n1 || n1.ok !== true) return ['the named fuel was refused: ' + JSON.stringify(n1)];
    if (Number(n1.flame.from_ms) !== nowMs) out.push('a named fuel waited behind a bought powder: from ' + (Number(n1.flame.from_ms) - nowMs) + ' ms');
    const seen = await one(db, 'select public.hr_hearth_flame_of($1)', [THE_MAP]);
    if (seen.flame !== 'amber') out.push('the named flame did not answer first: ' + JSON.stringify(seen));
    /* THE POWDER, PAUSED: it says so, and it has every second */
    const view = await as(db, A, 'select public.hr_town_sinks_view(0)');
    if (!view.powder.mine || view.powder.mine.behind !== 'den_knot') out.push('the buyer is not told it burns after the named fuel: ' + JSON.stringify(view.powder.mine));
    const visible = async () => {
      const row = (await q(db, "select extract(epoch from starts_at) * 1000 as s, extract(epoch from ends_at) * 1000 as e from public.town_shows where user_id = $1 and show_id = 'cinnabar'", [A]))[0];
      const named = await q(db, 'select extract(epoch from starts_at) * 1000 as s, extract(epoch from ends_at) * 1000 as e from public.hearth_flames');
      let seconds = (Number(row.e) - Number(row.s)) / 1000;
      for (const f of named) seconds -= Math.max(0, Math.min(Number(row.e), Number(f.e)) - Math.max(Number(row.s), Number(f.s))) / 1000;
      return Math.round(seconds * 1000) / 1000;
    };
    if ((await visible()) !== 30) out.push('after one named fuel the powder shows for ' + (await visible()) + ' s of its 30');
    /* A SECOND POWDER QUEUES BEHIND EVERYTHING, AND A SECOND NAMED FUEL STILL ONLY WAITS FOR THE FIRST */
    const p2 = await bought(db, A, 0, 'borax', 4000);
    if (!p2 || p2.ok !== true) return ['the second powder was refused: ' + JSON.stringify(p2)];
    if (p2.behind !== 'den_knot') out.push('the second powder\'s answer does not name the flame ahead: ' + JSON.stringify(p2));
    const n2 = await as(db, B, 'select public.hr_hearth_burn(0, $1, $2::uuid)', ['den_knot', idem()]);
    if (!n2 || n2.ok !== true) return ['the second named fuel was refused: ' + JSON.stringify(n2)];
    if (Number(n2.flame.from_ms) !== Number(n1.flame.until_ms)) out.push('the second named fuel waited for a powder too: from ' + n2.flame.from_ms + ', the first ends ' + n1.flame.until_ms);
    if ((await visible()) !== 30) out.push('after two named fuels the powder shows for ' + (await visible()) + ' s of its 30');
    /* THE BURN'S OWN LOCK ORDER: hr_apply, then the Hearth's key, as the powder's */
    const burnSrc = await one(db, 'select prosrc from pg_proc where oid = $1::regprocedure', [BURN]);
    if (burnSrc.indexOf('pg_advisory_xact_lock') < burnSrc.indexOf('v_a := public.hr_apply(')) out.push('hr_hearth_burn holds the Hearth\'s key over its charge');
    /* A BURN THAT LOSES THE QUEUE RACE MOVES NOTHING: the queue fills while its charge waits on the key */
    await calm(db);
    const xpBefore = await skillXp(db, B, 0);
    const knots = Number(await one(db, "select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = 'den_knot'", [B]));
    await db.exec(`create or replace function public.hr__zz_flame() returns trigger language plpgsql as $f$ begin
        insert into public.hearth_flames (map_id, item_id, flame, user_id, slot, starts_at, ends_at) values ('${THE_MAP}', 'zz', 'honey', '${A}', 0, now(), now() + interval '2 hours');
        return new; end $f$;
      create trigger hr__zz_flame before insert on public.player_ledger for each row execute function public.hr__zz_flame();`);
    const lost = await as(db, B, 'select public.hr_hearth_burn(0, $1, $2::uuid)', ['den_knot', idem()]);
    await db.exec('drop trigger hr__zz_flame on public.player_ledger; drop function public.hr__zz_flame()');
    if (lost.error !== 'hearth_busy') out.push('a burn that lost the race answered ' + JSON.stringify(lost));
    if (String(await skillXp(db, B, 0)) !== String(xpBefore)) out.push('a burn that lost the race paid XP');
    if (Number(await one(db, "select qty from public.player_inventory where user_id = $1 and slot = 0 and item_id = 'den_knot'", [B])) !== knots) out.push('a burn that lost the race took the fuel');
    /* TIME PASSES (both named flames are done): the powder is back, with the 20 s it hadn't burned */
    await db.query('update public.hearth_flames set starts_at = starts_at - interval \'120 seconds\', ends_at = ends_at - interval \'120 seconds\'');
    await db.query("update public.town_shows set starts_at = starts_at - interval '120 seconds', ends_at = ends_at - interval '120 seconds'");
    const back = await one(db, 'select public.hr_hearth_flame_of($1)', [THE_MAP]);
    if (back.flame !== 'cinnabar' || Number(back.until_ms) - Number(back.now_ms) !== 20000) out.push('after the named flames the square reads ' + JSON.stringify(back));
    return out;
  },

  'TS-CLIMB': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await hero(db, A, 1, 'Sorrel');
    await rich(db, A);
    const first = await bought(db, A, 0, 'cinnabar', 2000);
    if (!first || first.ok !== true) return ['the first press was refused: ' + JSON.stringify(first)];
    /* the other hero, holding the price it read before the first press landed */
    const stale = await bought(db, A, 1, 'borax', 2000);
    if (stale.error !== 'quote_changed' || Number(stale.price) !== 4000) out.push('a second hero at the first price answered ' + JSON.stringify(stale));
    if ((await purse(db, A)) !== 998000) out.push('the stale press moved gold: ' + (await purse(db, A)));
    const second = await bought(db, A, 1, 'borax', 4000);
    if (!second || second.ok !== true || second.n !== 2) out.push('the second hero at the next price answered ' + JSON.stringify(second));
    if ((await purse(db, A)) !== 994000) out.push('after two powders the purse reads ' + (await purse(db, A)));
    /* colors share one ladder; a round is another; yesterday's don't count */
    await db.query("insert into public.player_ledger (user_id, slot, kind, intent, gold, at, meta) values ($1, 0, 'shop', 'town_show:cinnabar:2000', -2000, now() - interval '2 days', '{\"probe\":true}'::jsonb)", [A]);
    const round = await bought(db, A, 0, 'round', 5000);
    if (!round || round.ok !== true) out.push('a round did not start its own ladder: ' + JSON.stringify(round));
    const third = await bought(db, A, 0, 'quicklime', 6000);
    if (!third || third.ok !== true) out.push('the third powder at 6,000 answered ' + JSON.stringify(third));
    const seen = await as(db, A, 'select public.hr_town_sinks_view(1)');
    if (seen.powder.price !== 8000 || seen.powder.n !== 3 || seen.powder.last !== 'quicklime' || seen.round.price !== 10000) out.push('the other hero\'s window reads ' + JSON.stringify(seen.powder));
    await calm(db);
    if (!(await bought(db, A, 1, 'borax', 8000)).ok) out.push('the fourth powder was refused');
    if (!(await bought(db, A, 0, 'borax', 10000)).ok) out.push('the fifth powder was refused');
    const over = await bought(db, A, 1, 'borax', 10000);
    if (over.error !== 'show_limit' || over.per_day !== 5) out.push('a sixth powder answered ' + JSON.stringify(over));
    const full = await as(db, A, 'select public.hr_town_sinks_view(0)');
    if (full.powder.price !== null) out.push('the window still quotes a price past the day\'s cap: ' + full.powder.price);
    /* THE LOCK ORDER, off the body: hero, sink key, the count, the charge, the town's key */
    const src = await one(db, 'select prosrc from pg_proc where oid = $1::regprocedure', [SHOW]);
    const at = (s) => src.indexOf(s);
    const order = ['hr_hunt_lock(v_uid, p_slot)', 'hr_sink_lock(v_uid)', 'v_n := public.hr_sink_bought_today', 'v_a := public.hr_apply(', "pg_advisory_xact_lock(hashtextextended(case when v_rule.sink_id = 'powder'"];
    for (let i = 0; i < order.length; i++) {
      if (at(order[i]) < 0) out.push('the body has no ' + order[i]);
      else if (i && at(order[i]) < at(order[i - 1])) out.push(order[i] + ' comes before ' + order[i - 1]);
    }
    if (at('pg_advisory_xact_lock') < at('v_a := public.hr_apply(')) out.push('a town key comes before the purse, so one account\'s settle can hold the town');
    return out;
  },

  'TS-REFUSE': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await hero(db, B, 0, 'Tamsel');
    await rich(db, A);
    /* A FULL QUEUE, seen before the charge */
    await db.query("insert into public.town_shows (map_id, sink_id, show_id, user_id, slot, price, starts_at, ends_at) values ($1, 'powder', 'borax', $2, 0, 1, now(), now() + interval '10 minutes')", [THE_MAP, B]);
    const full = await bought(db, A, 0, 'cinnabar', 2000);
    if (full.error !== 'show_busy' || full.sink !== 'powder' || full.booked_s !== 600 || full.wait_s !== 300) out.push('a full queue answered ' + JSON.stringify(full));
    if ((await purse(db, A)) !== 1000000) out.push('a full queue charged');
    if ((await shopRows(db, A)).length) out.push('a full queue journalled');
    await db.query('delete from public.town_shows where user_id = $1', [B]);
    /* THE QUEUE FILLS WHILE THE CHARGE WAITS ON THE TOWN'S KEY: the whole purchase rolls back */
    await queueFillsDuringTheCharge(db, B);
    const key = idem();
    const lost = await bought(db, A, 0, 'cinnabar', 2000, key);
    await db.exec('drop trigger hr__zz_fill on public.player_ledger; drop function public.hr__zz_fill()');
    if (lost.error !== 'show_busy' || lost.ok !== false) out.push('the show that lost the race answered ' + JSON.stringify(lost));
    if ((await purse(db, A)) !== 1000000) out.push('the show that lost the race charged: ' + (await purse(db, A)));
    if ((await shopRows(db, A)).length) out.push('the show that lost the race journalled: ' + JSON.stringify(await shopRows(db, A)));
    if (await one(db, 'select exists (select 1 from public.player_intents where user_id = $1 and intent_id = $2)', [A, key])) out.push('the show that lost the race spent its key');
    if (await one(db, 'select exists (select 1 from public.town_shows where user_id = $1)', [A])) out.push('the show that lost the race was booked');
    if (await one(db, "select exists (select 1 from public.chat_messages where from_id = $1)", [A])) out.push('the show that lost the race posted a line');
    if (await one(db, 'select exists (select 1 from public.account_gold_given where user_id = $1)', [A])) out.push('the show that lost the race counted on the board');
    /* NOTHING WAS SPENT: the same key buys it, once */
    const again = await bought(db, A, 0, 'cinnabar', 2000, key);
    if (!again || again.ok !== true) out.push('the same key after the race answered ' + JSON.stringify(again));
    if ((await purse(db, A)) !== 998000) out.push('the same key after the race left the purse at ' + (await purse(db, A)));
    return out;
  },

  'TS-QUOTE': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await rich(db, A);
    for (const forged of [1, 1999, 2001, 999999]) {
      const r = await bought(db, A, 0, 'cinnabar', forged);
      if (r.error !== 'quote_changed' || Number(r.price) !== 2000) out.push(`a price of ${forged} answered ${JSON.stringify(r)}`);
    }
    await calm(db);
    for (const bad of [0, -2000, 2000000000]) {
      const r = await bought(db, A, 0, 'cinnabar', bad);
      if (r.error !== 'bad_quote') out.push(`a price of ${bad} answered ${JSON.stringify(r)}`);
    }
    if ((await purse(db, A)) !== 1000000) out.push('a stale or forged price charged: ' + (await purse(db, A)));
    if ((await shopRows(db, A)).length) out.push('a stale or forged price journalled');
    const named = await bought(db, A, 0, 'amber', 2000);
    if (named.error !== 'not_a_show') out.push('a named color answered ' + JSON.stringify(named));
    await rich(db, A, 1000);
    const poor = await bought(db, A, 0, 'cinnabar', 2000);
    if (poor.error !== 'insufficient_gold') out.push('a short purse answered ' + JSON.stringify(poor));
    if ((await purse(db, A)) !== 1000) out.push('a short purse moved gold');
    if (await one(db, 'select exists (select 1 from public.town_shows where user_id = $1)', [A])) out.push('a short purse was booked');
    return out;
  },

  'TS-LEDGER': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await rich(db, A);
    const key = idem();
    const r = await bought(db, A, 0, 'cinnabar', 2000, key);
    if (!r || r.ok !== true) return ['the powder was refused: ' + JSON.stringify(r)];
    const replay = await bought(db, A, 0, 'cinnabar', 2000, key);
    if (!replay || replay.ok !== true) out.push('a replayed key answered ' + JSON.stringify(replay));
    let rows = await shopRows(db, A);
    if (rows.length !== 1 || rows[0].intent !== 'town_show:cinnabar:2000' || Number(rows[0].gold) !== -2000 || rows[0].slot !== 0) out.push('the journal reads ' + JSON.stringify(rows));
    if ((await purse(db, A)) !== 998000) out.push('a replayed key charged again: ' + (await purse(db, A)));
    if (Number(await one(db, 'select count(*) from public.town_shows where user_id = $1', [A])) !== 1) out.push('a replayed key booked twice');
    if (Number(await one(db, 'select sum(gold) from public.account_gold_given where user_id = $1', [A])) !== 2000) out.push('a replayed key counted twice on the board');
    /* a key that already bought something can't buy something else */
    const other = await bought(db, A, 0, 'borax', 4000, key);
    if (other.error !== 'intent_mismatch') out.push('one key, another show answered ' + JSON.stringify(other));
    const round = await bought(db, A, 0, 'round', 5000);
    if (!round || round.ok !== true) out.push('a round was refused: ' + JSON.stringify(round));
    rows = await shopRows(db, A);
    if (rows.length !== 2 || !rows.some((x) => x.intent === 'town_show:round:5000')) out.push('the journal after a round reads ' + JSON.stringify(rows));
    return out;
  },

  'TS-HUNT': async (db, X) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await rich(db, A);
    const hunt = await firstHunt(db);
    const entered = await as(db, A, "select public.hr_hunt_enter(0, $1, '[]'::jsonb, 0, null, gen_random_uuid())", [hunt]);
    if (!entered || entered.ok !== true) return ['hr_hunt_enter: ' + JSON.stringify(entered)];
    for (const [show, price, verb, words] of [['cinnabar', 2000, 'town_powder', 'Your hero is out hunting. The Great Hearth is in town.'], ['round', 5000, 'town_round', 'Your hero is out hunting. The Tavern is in town.']]) {
      const r = await bought(db, A, 0, show, price);
      if (r.error !== 'hunting' || r.hunt !== hunt) out.push(`a hunting hero's ${show} answered ${JSON.stringify(r)}`);
      const said = X.IW.refusalText({ ok: false, error: r.error, verb }, null);
      if (said !== words) out.push('it reads: ' + said);
    }
    if ((await purse(db, A)) !== 1000000) out.push('a hunting hero was charged');
    if (await one(db, 'select exists (select 1 from public.town_shows where user_id = $1)', [A])) out.push('a hunting hero booked a show');
    const view = await as(db, A, 'select public.hr_town_sinks_view(0)');
    if (view.hunting !== true) out.push('the window does not know the hero is hunting');
    return out;
  },

  'TS-QUIET': async (db) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await rich(db, A);
    await db.query('update public.player_state set presence_quiet = true where user_id = $1 and slot = 0', [A]);
    const p = await bought(db, A, 0, 'cinnabar', 2000);
    const r = await bought(db, A, 0, 'round', 5000);
    if (!p.ok || !r.ok) return ['a quiet hero was refused: ' + JSON.stringify([p, r])];
    if ((await purse(db, A)) !== 993000) out.push('a quiet hero did not pay');
    if (await one(db, 'select exists (select 1 from public.chat_messages where from_id = $1)', [A])) out.push('a quiet hero posted a line');
    const flame = await one(db, 'select public.hr_hearth_flame_of($1)', [THE_MAP]);
    if (!flame || flame.flame !== 'cinnabar' || flame.by !== null) out.push('the square names a quiet hero: ' + JSON.stringify(flame));
    const shows = await one(db, 'select public.hr_town_shows_of($1)', [THE_MAP]);
    if (!shows || !shows.round || shows.round.by !== null) out.push('the round names a quiet hero: ' + JSON.stringify(shows));
    return out;
  },

  'TS-LINES': async (db, X) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await rich(db, A);
    await bought(db, A, 0, 'cinnabar', 2000);
    await bought(db, A, 0, 'round', 5000);
    const lines = await q(db, 'select public.hr_chat_row(m) r, m.channel from public.chat_messages m where m.from_id = $1 order by m.channel', [A]);
    const local = lines.find((l) => l.channel === 'local:town');
    const sys = lines.find((l) => l.channel === 'system');
    if (lines.length !== 2 || !local || !sys) return ['the lines are ' + JSON.stringify(lines)];
    const said = (row) => X.CL.lineOf(row, { tz: 'utc' });
    const lLine = said(local.r), sLine = said(sys.r);
    if (!lLine || !lLine.system || lLine.parts.map((p) => p.text).join('') !== 'Marlow threw Cinnabar on the Great Hearth.') out.push('the powder reads ' + JSON.stringify(lLine && lLine.parts));
    if (lLine && lLine.channel !== 'local:town') out.push('the powder is not in Local: ' + lLine.channel);
    if (!sLine || !sLine.system || sLine.parts.map((p) => p.text).join('') !== 'Marlow stood a round at the Tavern.') out.push('the round reads ' + JSON.stringify(sLine && sLine.parts));
    /* a player can't write the notice's shape: hr_chat_send always stamps a Level */
    const sent = await as(db, A, 'select public.hr_chat_send(0, $1, $2)', ['local', 'threw Cinnabar on the Great Hearth.']);
    const spoof = said({ ...sent.line, from_role: 'notice' });
    if (!sent.ok || spoof.system) out.push('a player\'s line with the notice\'s role reads as a notice: ' + JSON.stringify(spoof));
    return out;
  },

  'TS-GIVEN': async (db, X) => {
    const out = [];
    await hero(db, A, 0, 'Marlow');
    await hero(db, A, 1, 'Sorrel');
    await hero(db, B, 0, 'Tamsel');
    await rich(db, A);
    await rich(db, B);
    const total = async (u) => Number(await one(db, 'select coalesce(sum(gold), 0) from public.account_gold_given where user_id = $1 and month = date_trunc(\'month\', now() at time zone \'utc\')::date', [u]));
    await bought(db, A, 0, 'cinnabar', 2000);
    await bought(db, A, 1, 'round', 5000);
    if ((await total(A)) !== 7000) out.push('two gifts read ' + (await total(A)));
    if (Number(await one(db, 'select gold from public.account_gold_given where user_id = $1 and slot = 1', [A])) !== 5000) out.push('the gift is not counted to the hero who gave it');
    /* A REFILL ISN'T A GIFT */
    await db.query('update public.player_state set stamina_ms = 0, stamina_at = now() where user_id = $1 and slot = 0', [A]);
    const quote = await one(db, 'select public.hr_stamina_refill_quote($1::uuid, 0)', [A]);
    const refill = await as(db, A, 'select public.hr_stamina_refill(0, $1::bigint, $2::uuid)', [quote.price, idem()]);
    if (!refill || refill.ok !== true) out.push('the refill was refused: ' + JSON.stringify(refill));
    if ((await total(A)) !== 7000) out.push('a stamina refill counted on the board');
    /* ONLY THE TOWN'S VERBS WRITE IT, AND NO CLIENT CAN */
    const writers = (await q(db, "select p.proname from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prosrc ~ 'hr_gold_given_add' and p.proname <> 'hr_gold_given_add' order by 1")).map((r) => r.proname);
    const ALLOWED = new Set(['hr_town_show', 'hr_crier_send', 'hr_town_works_give']);
    for (const w of writers) if (!ALLOWED.has(w)) out.push(w + ' writes the board, and it is no gift to the town');
    for (const w of ['hr_town_show', 'hr_crier_send']) if (!writers.includes(w)) out.push(w + ' does not write the board');
    for (const role of ['anon', 'authenticated']) if (await one(db, 'select has_function_privilege($1, $2, $3)', [role, ADD, 'execute'])) out.push(role + ' can call the counter');
    await db.exec('savepoint given');
    await claims(db, A);
    await db.exec('set local role authenticated');
    let denied = false;
    try { await db.query('select public.hr_gold_given_add($1::uuid, 0, 1000000)', [A]); } catch (e) { denied = /permission denied/.test(String(e.message)); }
    await db.exec('rollback to savepoint given');
    await db.exec('reset role');
    await claims(db, null);
    if (!denied) out.push('a client\'s call to the counter was not denied');
    if ((await total(A)) !== 7000) out.push('a client moved the board');
    /* THE BOARD: an account, its lead hero */
    await bought(db, B, 0, 'borax', 2000);
    await db.query("insert into public.account_gold_given (month, user_id, slot, gold) values ((date_trunc('month', now() at time zone 'utc') - interval '1 month')::date, $1, 0, 90000000)", [B]);
    await db.exec('refresh materialized view public.leaderboard_ranked');
    await claims(db, A);
    const board = await one(db, "select public.hr_leaderboard__ungated('gold_given', 25, 1)");
    await claims(db, null);
    if (!board.ok || board.total !== 2 || board.top.length !== 2) return out.concat('the board reads ' + JSON.stringify(board).slice(0, 300));
    const [top, next] = board.top;
    if (top.name !== 'Sorrel' || Number(top.score) !== 7000 || top.place !== 1 || top.mine !== true || top.slot !== 1) out.push('first place reads ' + JSON.stringify(top));
    if (next.name !== 'Tamsel' || Number(next.score) !== 2000 || 'slot' in next || 'user_id' in next) out.push('last month reached the board, or another account leaks: ' + JSON.stringify(next));
    /* A BLOCKED NAME AND A HIDDEN ACCOUNT, as on every board */
    const bad = await blockedName(db);
    await db.query('update public.character_names set name = $1 where user_id = $2 and slot = 0', [bad, B]);
    await db.exec('refresh materialized view public.leaderboard_ranked');
    const named = await one(db, "select public.hr_leaderboard__ungated('gold_given', 25, 1)");
    if (named.top[1].name !== 'Name hidden') out.push('a blocked name reached the board: ' + named.top[1].name);
    await db.query("insert into public.hr_lb_hidden (user_id, slot, reason, note) values ($1, null, 'test', 'town-shows guard')", [B]);
    await db.exec('refresh materialized view public.leaderboard_ranked');
    const hidden = await one(db, "select public.hr_leaderboard__ungated('gold_given', 25, 1)");
    if (hidden.total !== 1) out.push('a hidden account holds a place');
    if (!X.HR.honorBoard('gold_given') || X.HR.honorBoard('gold_given').reads !== 'gold' || X.HR.honorBoard('gold_given').group !== 'Town') out.push('the window has no Gold Given row');
    return out;
  },

  'TS-NO-METER': async (db, X) => {
    const out = [];
    /* EVERY READER OF town_shows IS NAMED HERE. A new one is argued here first: gold into the Hearthrise meter is the gold-funded XP buff on the avoid list. */
    const READERS = new Set(['hr_town_show', 'hr_town_show_free_at', 'hr_town_show_push', 'hr_town_sink_quote', 'hr_hearth_flame_of', 'hr_town_shows_of', 'hr_town_sinks_view']);
    const fns = await q(db, "select p.proname, p.prosrc from pg_proc p where p.pronamespace = 'public'::regnamespace");
    for (const f of fns) {
      if (/\btown_shows\b/.test(f.prosrc || '') && !READERS.has(f.proname)) out.push(f.proname + ' reads town_shows');
      if (/\baccount_gold_given\b/.test(f.prosrc || '') && f.proname !== 'hr_gold_given_add') out.push(f.proname + ' reads the Gold Given counter');
      if (/town_show:/.test(f.prosrc || '') && f.proname !== 'hr_town_show') out.push(f.proname + ' reads the purchases off the journal');
      if (/\bhr_hearth_flame_of\b/.test(f.prosrc || '') && f.proname !== 'hr_town_view') out.push(f.proname + ' reads the flame the square burns, bought ones included');
      if (/\bhr_town_shows_of\b/.test(f.prosrc || '') && f.proname !== 'hr_town_view') out.push(f.proname + ' reads the round going now');
    }
    const views = await q(db, "select c.relname, pg_get_viewdef(c.oid) d from pg_class c where c.relnamespace = 'public'::regnamespace and c.relkind in ('v', 'm')");
    for (const v of views) {
      if (/\btown_shows\b/.test(v.d)) out.push('the view ' + v.relname + ' reads town_shows');
      if (/\baccount_gold_given\b/.test(v.d) && v.relname !== 'leaderboard_ranked') out.push('the view ' + v.relname + ' reads the Gold Given counter');
    }
    if (Number(await one(db, "select count(*) from pg_trigger where tgrelid = 'public.town_shows'::regclass and not tgisinternal"))) out.push('a trigger hangs off town_shows');
    /* AND NO ENGINE FILE NAMES IT */
    for (const [rel, text] of X.engineFiles) if (/\btown_shows\b|hr_town_show\b|town_show:/.test(text)) out.push(rel + ' names the shows');
    if (!X.engineFiles.length) out.push('the scan of the engine read no file');
    return out;
  },

  'TS-EDGE': async (db, X, mutant) => {
    const out = [];
    const names = [...X.edgeFiles].concat(mutant && mutant.plant === 'edgeFile' ? ['vendor/data/gold-sinks.js'] : []);
    if (names.length < 50) out.push('the pack read ' + names.length + ' files');
    for (const n of names) if (/gold-sinks|sink-taps|town-shows|town-intents|sink-words|havora/.test(n)) out.push(n + ' is in the edge bundle');
    for (const offer of ['cinnabar', 'quicklime', 'borax']) {
      if (X.HD.FLAMES[offer]) out.push(offer + ' is in src/data/hearth.js, which the edge bundles');
      if (!X.GS.SHOW_FLAMES[offer]) out.push(offer + ' has no flame in src/data/gold-sinks.js');
    }
    for (const c of Object.values(X.HD.NAMED_FUELS)) if (X.GS.SHOW_FLAMES[c.flame]) out.push('a named fuel burns a color that is for sale: ' + c.flame);
    return out;
  },

  'TS-WORDS': async (db, X) => {
    const out = [];
    const R = (o) => X.IW.refusalText({ ok: false, ...o }, null);
    const want = [
      [{ error: 'show_limit', verb: 'town_powder', perDay: 7 }, 'Havora takes 7 powders a day from one account. More after midnight UTC.'],
      [{ error: 'show_busy', verb: 'town_powder', bookedS: 360, waitS: 60 }, 'The Hearth\'s powders are booked for the next 6 minutes. You weren\'t charged.'],
      [{ error: 'show_limit', verb: 'town_round', perDay: 4 }, 'Havora takes 4 rounds a day from one account. More after midnight UTC.'],
      [{ error: 'show_busy', verb: 'town_round', bookedS: 200, waitS: 20 }, 'Someone\'s round is still going. Try again in 20 seconds. You weren\'t charged.'],
      [{ error: 'quote_changed', verb: 'town_powder', price: 4000 }, 'The price moved to 4,000 gp. You weren\'t charged. Press again to pay it.'],
      [{ error: 'not_a_show', verb: 'town_powder' }, 'Havora doesn\'t sell that.'],
    ];
    for (const [r, words] of want) if (R(r) !== words) out.push(JSON.stringify(r) + ' reads: ' + R(r));
    return out;
  },

  'TS-WINDOW': async (db, X) => {
    const out = [];
    if (X.HW.throwWords('cinnabar', 2000) !== 'Throw Cinnabar: 2,000 gp') out.push('the powder\'s button reads ' + X.HW.throwWords('cinnabar', 2000));
    if (X.HW.roundWords(5000) !== 'Stand a round: 5,000 gp') out.push('the round\'s button reads ' + X.HW.roundWords(5000));
    const html = X.HW.renderHavora({});
    if (/data-tab="works"|data-pane="works"/.test(html)) out.push('the window shows Works before its lane lands');
    for (const id of ['hearth', 'round']) if (!html.includes('data-tab="' + id + '"')) out.push('the window has no ' + id + ' tab');
    /* ONLY THE FLAME CHANGES COLOR, so the Hearth tab says so, with the rules row's own seconds */
    const lead = (/data-pane="hearth"><p class="hv-lead">([^<]*)</.exec(html) || [])[1] || '';
    if (/fills|square/i.test(lead)) out.push('the Hearth tab promises the square a color: ' + lead);
    if (!lead.includes('burns that color for ' + X.GS.SINK_RULES.powder.seconds + ' seconds') || !lead.includes('everyone in Havora sees who threw it')) out.push('the Hearth tab reads: ' + lead);
    /* THE DAY'S LINE AND THE ANSWER STAND IN THE FOOT, one line per tab: a short window scrolls the pane under them */
    const foot = (/<div class="hv-foot">(.*)<\/div><\/div>$/.exec(html) || [])[1] || '';
    for (const id of ['hearth', 'round']) if (!foot.includes('hv-count" data-of="' + id + '"')) out.push('the foot has no line for ' + id + ': ' + foot);
    if (!foot.includes('hh-intent-msg')) out.push('the answer to a press is not in the foot: ' + foot);
    /* THE SERVER'S ANSWER, read field by field */
    await hero(db, A, 0, 'Marlow');
    const view = await as(db, A, 'select public.hr_town_sinks_view(0)');
    const s = X.TI.parseSinks(view);
    if (!s || s.powder.price !== 2000 || s.round.price !== 5000 || s.powder.perDay !== 5 || !s.crier || s.crier.price !== 1000 || s.crier.minLevel !== 10) out.push('the window parses ' + JSON.stringify(s));
    if (X.TI.parseSinks({ ok: true }) !== null) out.push('a broken answer parsed');
    /* THE TAVERN OPENS ITS ROUND TAB */
    const row = X.ST.SINK_TAPS.havora_tavern;
    const act = row ? X.SL.tapAction({ id: 'town', exits: [] }, { tile: [62, 20], hits: [{ id: 'havora_tavern', tx: 62, ty: 20, ref: null }] }, { opens: X.ST.SINK_TAPS, maps: {} }) : null;
    if (!act || act.kind !== 'window' || act.window !== 'havora' || act.tab !== 'round') out.push('a tap on the Tavern acts ' + JSON.stringify(act));
    /* A BOUGHT FLAME SWAPS THE FIRE'S ART, FROM THE TOWN'S ANSWER ALONE */
    const map = { T: 32, ambient: [{ id: 'hearth_fire', x: 50, y: 50, lift: 0 }] };
    const sprites = { hearth_fire: {}, hearth_fire_cinnabar: {}, hearth_flare_cinnabar: {}, hearth_burn_sparks_cinnabar: {}, fx_round_gold: {}, fx_round_cinder: {}, fx_round_frost: {}, fx_round_rise: {} };
    const hv = X.HB.createHearthView(map, { sprites });
    const fr = hv.frame({ place: {}, units: [], walkers: [], me: null, active: null, burn: null, flame: { flame: 'cinnabar', startedAt: 1000 }, xp: null, hero: { x: 1, y: 1 } }, 1100);
    if (!fr.ambientSwap || fr.ambientSwap.hearth_fire !== 'hearth_fire_cinnabar') out.push('a bought flame leaves the fire ' + JSON.stringify(fr.ambientSwap));
    /* A ROUND BURSTS, THE SAME FOR EVERY VIEWER */
    const shows = X.TSH.createTownShows(map, { sprites });
    const round = { startedAt: 1000, endsAt: 46000 };
    const f1 = shows.frame(round, 5000), f2 = shows.frame(round, 5000);
    if (!f1.length || JSON.stringify(f1) !== JSON.stringify(f2) || !f1.every((e) => /^fx_round_/.test(e.id))) out.push('a round draws ' + JSON.stringify(f1));
    if (shows.frame(round, 46000).length || shows.frame(null, 5000).length) out.push('a round draws past its end');
    /* A ROUND ON THE TOWN'S ANSWER, ON THE LOCAL CLOCK */
    let answer = { ok: true, status: 200, body: { ok: true, walkers: [], gone: [], shows: { round: { by: 'Marlow', from_ms: 900, until_ms: 45900, now_ms: 1000 } } } };
    let clock = 500000;
    const tp = new X.TP.TownPresence({ server: { rpc: async () => answer }, slot: 0, timers: { setTimer: () => 1, clearTimer: () => {} }, now: () => clock });
    tp.show(THE_MAP);
    await tp.read();
    const r1 = tp.round();
    if (!r1 || r1.by !== 'Marlow' || r1.endsAt !== clock + 44900) out.push('the round on the local clock reads ' + JSON.stringify(r1));
    answer = { ok: true, status: 200, body: { ok: true, walkers: [], gone: [] } };
    clock += 5000;
    await tp.read();
    if (tp.round() !== null) out.push('an answer with no round kept the last one');
    tp.destroy();
    return out;
  },

  'TS-SHOW': async (db, X) => {
    const out = [];
    const S = X.GS.ROUND_SHOW;
    const FIRE = { id: S.from, x: 50, y: 50, lift: 0 };
    const ids = [...new Set(S.program.map((r) => r[1]))];
    const shows = X.TSH.createTownShows({ T: 32, ambient: [FIRE] }, { sprites: Object.fromEntries([S.rise, ...ids].map((id) => [id, {}])) });
    const len = X.GS.SINK_RULES.round.seconds * 1000;
    const round = { startedAt: 1000, endsAt: 1000 + len };
    /* WALKED AT 50 ms FROM START TO END: a real show for its whole length, never crowding the square */
    let dark = 0, longest = 0, most = 0, lastUp = -1;
    const places = new Set();
    for (let t = 0; t < len; t += 50) {
      const f = shows.frame(round, 1000 + t);
      most = Math.max(most, f.length);
      const up = f.filter((e) => e.id !== S.rise);
      for (const e of up) places.add(e.x + ',' + e.y);
      if (up.length) { dark = 0; lastUp = t; } else if (t > 1200) { dark += 50; longest = Math.max(longest, dark); }
    }
    if (longest > 1000) out.push('the show goes dark for ' + longest + ' ms');
    if (len - lastUp > 3000 + 50) out.push('the show ends ' + (len - lastUp) + ' ms before the round does');
    if (S.program.some(([at]) => at + S.playMs > len)) out.push('a shell is cut off by the round\'s end');
    if (places.size < 12) out.push('the show bursts in only ' + places.size + ' places');
    if (most > 6) out.push(most + ' shells up at once crowd the square');
    /* EVERY SHELL CLIMBS FROM THE SQUARE AND BURSTS HIGH OVER IT, north of its launch and of the fire's own row */
    const [first] = S.program;
    const tickAfter = (ms) => Math.ceil(ms / S.tickMs) * S.tickMs + 1;
    const climbing = shows.frame(round, 1000 + tickAfter(first[0] - S.riseMs)).find((e) => e.id === S.rise);
    const burst = shows.frame(round, 1000 + tickAfter(first[0])).find((e) => e.id === first[1]);
    if (!climbing || !burst || climbing.y - burst.y < 4 || S.riseTiles < 5) out.push('a shell climbs ' + (climbing && burst ? climbing.y - burst.y : '?') + ' tiles from the square to its burst');
    if (burst && (burst.x !== FIRE.x + first[2] || burst.y !== FIRE.y + first[3])) out.push('the first shell bursts at ' + JSON.stringify(burst));
    if (S.program.some((r) => r[3] >= 0)) out.push('a row bursts on the floor, south of the fire');
    /* A SHELL NEVER LANDS ON THE LAST ONE */
    for (let i = 1; i < S.program.length; i++) {
      const [a, , ax, ay] = S.program[i - 1], [b, , bx, by] = S.program[i];
      if (b - a < S.playMs && Math.hypot(bx - ax, by - ay) < 4) out.push('rows at ' + a + ' and ' + b + ' burst on each other');
    }
    /* ONE TICK, HOWEVER MANY ARE UP: the frame is the same list until the tick turns */
    const onTick = Math.ceil(first[0] / S.tickMs) * S.tickMs;
    if (JSON.stringify(shows.frame(round, 1000 + onTick + 1)) !== JSON.stringify(shows.frame(round, 1000 + onTick + 1 + S.tickMs / 2))) out.push('a shell moves between ticks');
    /* THE ART: large, mostly air so a hero or the Hearth reads through it, and no mirrored stamp */
    const A = await import(pathToFileURL(join(ROOT, 'tools/world-art/round-fireworks.mjs')).href);
    for (const id of ids) {
      const name = id.replace('fx_round_', '');
      if (A.coverOf(name) > 0.15) out.push(id + ' hides ' + Math.round(A.coverOf(name) * 100) + '% of its box at its fullest');
      const frames = A.shellFrames(name);
      if (frames.length * 100 < S.playMs * 0.8 || frames.length * 100 > S.playMs) out.push(id + ' plays ' + frames.length * 100 + ' ms against playMs ' + S.playMs);
      const set = (f, x, y) => x >= 0 && y >= 0 && x < f.w && y < f.h && f.rank[y * f.w + x] !== 0;
      let wide = 0, mirrored = 0, n = 0;
      for (const f of frames) {
        let lo = f.w, hi = -1;
        for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (set(f, x, y)) { lo = Math.min(lo, x); hi = Math.max(hi, x); n++; if (set(f, f.w - 1 - x, y)) mirrored++; }
        wide = Math.max(wide, hi - lo + 1);
      }
      if (wide < 110) out.push(id + ' is only ' + wide + ' art px across at its widest');
      if (mirrored / n > 0.5) out.push(id + ' is a mirrored stamp: ' + Math.round(mirrored / n * 100) + '% of its pixels have a twin');
    }
    return out;
  },

  'TS-CLIENT': async (db, X) => {
    const out = [];
    const W = (o) => ({ id: A, slot: 0, name: 'Marlow', x: 10, y: 10, gx: 10, gy: 10, dir: 's', level: 18, ...o });
    const w = X.TP.walkerOf(W({ title: 'the Wolfer', colors: { head: 1, body: 2, legs: 3, feet: 4 } }));
    if (w.title !== 'the Wolfer' || !w.colors || w.colors.feet !== 4) out.push('a good walker lost its title or colors: ' + JSON.stringify(w));
    if (X.TP.walkerOf(W({ title: '<b>Rich</b>' })).title !== null) out.push('a title with markup reached the plate');
    if (X.TP.walkerOf(W({ title: 7 })).title !== null) out.push('a title that is no string reached the plate');
    if (X.TP.walkerOf(W({ colors: { head: 1 } })).colors !== null) out.push('half a set of colors passed');
    if (X.TP.walkerOf(W({ colors: { head: -1, body: 2, legs: 3, feet: 4 } })).colors !== null) out.push('a negative dye passed');
    if (X.TP.walkerOf(W({})).title !== null || X.TP.walkerOf(W({})).colors !== null) out.push('a walker from an older answer does not read null');

    const plates = [X.TS.plateTextOf(X.TP.walkerOf(W({ title: 'the Wolfer' }))), X.TS.plateTextOf(X.TP.walkerOf(W({ id: B, name: 'Tamsel' })))];
    if (plates[0] !== 'Marlow the Wolfer · 18' || plates[1] !== 'Tamsel · 18') out.push('the plates read ' + JSON.stringify(plates));

    const row = (o) => ({ id: 'aaaaaaaa-0000-4000-8000-0000000000a1', channel: 'global', from_id: A, from_name: 'Marlow', from_slot: 0, from_level: 18, from_weapon: null, from_role: null, body: 'hi', created_at: '2026-11-04T09:00:00Z', ...o });
    const line = X.CL.lineOf(row({ from_title: 'the Wolfer' }), { tz: 'utc' });
    if (!line || line.title !== 'the Wolfer') out.push('a chat line lost its title: ' + JSON.stringify(line));
    if (X.CL.lineOf(row({ from_title: '<img src=x>' }), { tz: 'utc' }).title !== null) out.push('markup reached a chat line\'s title');
    if (X.CL.lineOf(row({}), { tz: 'utc' }).title !== null) out.push('a row with no title does not read null');

    /* REPLACED BY EVERY ANSWER, never merged upward */
    let answer = { ok: true, status: 200, body: { ok: true, walkers: [], gone: [], extras: { works: { stage: 1 } } } };
    let clock = 1000;
    const tp = new X.TP.TownPresence({ server: { rpc: async () => answer }, slot: 0, timers: { setTimer: () => 1, clearTimer: () => {} }, now: () => clock });
    tp.show(THE_MAP);
    await tp.read();
    const first = tp.extras();
    answer = { ok: true, status: 200, body: { ok: true, walkers: [], gone: [] } };
    clock += 5000;
    await tp.read();
    if (!first || first.works.stage !== 1) out.push('the first answer\'s extras were not held: ' + JSON.stringify(first));
    if (tp.extras() !== null) out.push('an answer with no extras kept the last ones');
    tp.destroy();

    if (X.WK.WORKS_TAB.shown !== false || X.WK.worksHtml() !== '' || X.WK.patchWorks({}, {}) !== undefined || X.WK.actWorks({}, {}, 'tab', {}, {}) !== false) out.push('the Works tab is not hidden');
    if (X.TW.townWorksSwap({}, { works: { stage: 4 } }) !== null) out.push('the map draws Works before its lane lands');
    return out;
  },
};

function plantSql(text, [, find, repl]) {
  if (text.split(find).length !== 2) throw Object.assign(new Error('sql mutant anchor not found once: ' + find.slice(0, 80)), { harness: true });
  return text.replace(find, () => repl);
}

/* WHAT THE SERVER'S ENGINE IS MADE OF: read once from the tree; a meter there must not name a show. */
function walk(dir, out = []) {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) walk(rel, out);
    else if (/\.(m?js|ts)$/.test(e.name)) out.push([rel, readFileSync(join(ROOT, rel), 'utf8')]);
  }
  return out;
}
const ENGINE_FILES = walk('src/core').concat(walk('supabase/functions'));
let EDGE_FILES = [];

async function loadReaders(root) {
  const u = (p) => pathToFileURL(join(root, p)).href + '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
  return {
    GS: await import(u('src/data/gold-sinks.js')),
    ST: await import(u('src/data/world/sink-taps.js')),
    HD: await import(u('src/data/hearth.js')),
    IW: await import(u('src/shell/intent-words.js')),
    HW: await import(u('src/shell/windows/havora/index.js')),
    TI: await import(u('src/session/town-intents.js')),
    HB: await import(u('src/world/hearth-burn.js')),
    TSH: await import(u('src/world/town-shows.js')),
    SL: await import(u('src/world/steer-local.js')),
    HR: await import(u('src/data/honor-roll.js')),
    engineFiles: ENGINE_FILES,
    edgeFiles: EDGE_FILES,
    TP: await import(u('src/session/town-presence.js')),
    TS: await import(u('src/world/town-scene.js')),
    CL: await import(u('src/social/chat-lines.js')),
    WK: await import(u('src/shell/windows/havora/works.js')),
    TW: await import(u('src/world/town-works.js')),
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
    /* the board's view with its month filter gone (hr_lb_row goes with a dropped view: its own text brings it back) */
    if (mutant && mutant.allMonths) {
      const def = String(await one(db, "select pg_get_viewdef('public.leaderboard_ranked'::regclass)"));
      const open = def.replace(/WHERE \(g\.month = [^\n]*\n/, '\n');
      if (open === def) throw Object.assign(new Error('the view has no month filter to plant out'), { harness: true });
      const lbRow = /create or replace function public\.hr_lb_row[\s\S]*?\$\$;/.exec(MIG('2027-02-27-gold-given.sql'))[0];
      await db.exec(`drop materialized view public.leaderboard_ranked cascade; create materialized view public.leaderboard_ranked as ${def === open ? def : open.replace(/;\s*$/, '')};
        create unique index leaderboard_ranked_hero_idx on public.leaderboard_ranked (board, user_id, slot); ${lbRow}`);
    }
    return await ARMS[id](db, X, mutant);
  } finally { await db.query('rollback'); await claims(db, null).catch(() => {}); }
}

async function main() {
  if (process.argv.includes('--list')) { for (const [id, m] of Object.entries(MUTANTS)) console.log(`${id}  [${m.arm}]  ${m.why}`); return; }
  const { bootReplay } = await import('./schema-replay.mjs');
  let db;
  try { ({ db } = await bootReplay()); } catch (e) { console.error('✗ the chain would not replay: ' + String(e.message).slice(0, 600)); process.exit(1); }
  const { pack } = await import('../tools/pack-edge.mjs');
  EDGE_FILES = (await pack('hr-accrue')).files.map((f) => f.name);
  const X = await loadReaders(ROOT);
  const pick = (process.argv.find((a) => a.startsWith('--mutate=')) || '').slice(9);
  if (!(process.argv.includes('--selftest') || pick)) {
    let bad = 0;
    for (const id of Object.keys(ARMS)) {
      let p;
      try { p = await runArm(db, X, id, null); } catch (e) { p = ['threw: ' + String(e && e.stack || e).slice(0, 600)]; }
      if (p.length) { bad++; for (const m of p) console.error(`✗ ${id}: ${m}`); } else console.log(`✓ ${id}`);
    }
    console.log(bad ? `town-shows: ${bad} arm(s) red` : `town-shows: all ${Object.keys(ARMS).length} arms green`);
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
        const dir = mkdtempSync(join(tmpdir(), 'hr-ts-'));
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
  console.log(missed ? `town-shows --selftest: ${missed} of ${ids.length} mutant(s) survived` : `town-shows --selftest: all ${ids.length} mutants killed`);
  process.exit(missed ? 1 : 0);
}

if (isMain(import.meta.url)) await main();
