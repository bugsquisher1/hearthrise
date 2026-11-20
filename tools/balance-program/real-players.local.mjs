// tools/balance-program/real-players.local.mjs — THE REAL-PLAYER BASELINE the balance program holds its simulator against
// (lane/d-balance-real-players, phase 1; Tyler 2026-11-19 on production reads: "definitely read from it").
//
//   node tools/balance-program/real-players.local.mjs             read production, write the raw rows and the aggregate under
//                                                                 .scratch/real-players/ (gitignored), print the aggregate's tables
//   node tools/balance-program/real-players.local.mjs --from-raw  no network: aggregate again from the raw rows of the last read
//   node tools/balance-program/real-players.local.mjs --json      print the aggregate as JSON instead of tables
//   node tools/balance-program/real-players.local.mjs --selftest  no token, no network: the read-only gate, the token's redaction and
//                                                                 the aggregate's anonymity, each on planted inputs
//
// WHAT IT READS. public.player_ledger (the append-only journal, CLAUDE.md §6: the only complete record, hunt_sessions and its
// tally are pruned), player_state, player_skills, player_equipment, the hunt, tower, chest, market, clan, farm and house tables.
// SELECT only, through the Management API, every statement inside `begin read only` with read_only:true, the pattern of
// tools/char-state.local.mjs. The token is ~/.supabase-token read as file bytes: never printed, never in argv, never written.
// Hero names are never selected.
//
// WHAT LEAVES THE MACHINE. Nothing. The raw rows (account ids, clock times) stay in .scratch/real-players/raw.json. The
// aggregate (aggregate.json and the printed tables) holds no account id, name, session id or clock time: heroes are H1..Hn and
// people P1..Pn in order of hours hunted, time is a day count. anonymityProblems() is run on it before it is written, and the
// selftest plants each leak. docs/design/balance-program/10-real-players.md is written from the aggregate.
//
// WHO IS A REAL PLAYER. An account with a hero is `test` when its allowlist note starts with "QA" or it is a walled game master
// account, and `real` otherwise. Two accounts whose notes open with the same word before the first comma are one person.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REF = 'nezapsylztqbbwuwembx';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, '.scratch', 'real-players');
const ARGS = process.argv.slice(2);

/* ── THE READ-ONLY GATE ─────────────────────────────────────────────────────────────────────────────────────────────── */
const WRITE_WORDS = ['insert', 'update', 'delete', 'merge', 'truncate', 'drop', 'alter', 'create', 'grant', 'revoke', 'copy', 'call', 'do', 'commit',
  'rollback', 'begin', 'set', 'reset', 'lock', 'vacuum', 'analyze', 'refresh', 'reindex', 'comment', 'execute', 'prepare', 'notify', 'listen', 'into',
  'nextval', 'setval', 'set_config', 'pg_advisory_lock', 'dblink', 'lo_import', 'lo_export', 'pg_read_file', 'pg_terminate_backend'];
/** Why `sql` is not one plain read, or null. One statement, opening with select or with, no word that writes outside a string. */
export function writeProblem(sql) {
  const bare = String(sql).replace(/'(?:[^']|'')*'/g, "''").replace(/--[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ');
  if (bare.includes(';')) return 'more than one statement';
  if (!/^\s*(select|with)\b/i.test(bare)) return 'does not open with select or with';
  for (const w of WRITE_WORDS) if (new RegExp('(^|[^a-z_])' + w + '([^a-z_]|$)', 'i').test(bare)) return 'holds the word "' + w + '"';
  return null;
}
/** A query function over the Management API. `token` never leaves this closure: an error body is scrubbed of it before it is thrown. */
export function makeQuery({ token, fetchImpl = fetch }) {
  const scrub = (s) => String(s).split(token).join('[token]');
  return async function q(sql) {
    const why = writeProblem(sql);
    if (why) throw new Error('refused, not a plain read: ' + why);
    let r;
    try {
      r = await fetchImpl('https://api.supabase.com/v1/projects/' + REF + '/database/query', { method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'begin read only; ' + sql + ';', read_only: true }) });
    } catch (e) { throw new Error('read failed: ' + scrub(e && e.message).slice(0, 200)); }
    if (!r.ok) throw new Error('read failed: ' + scrub(await r.text()).slice(0, 200));
    return r.json();
  };
}

/* ── THE READS ──────────────────────────────────────────────────────────────────────────────────────────────────────── */
const FAMILY_VERBS = "('unlock_buy','shop_buy','town_show')";
/* A row a player's own press wrote (the rest are the server's settles). The session and away figures are read from these. */
const AUTHORED = "('set_activity','create_character','bank_deposit','bank_withdraw','loot_dispatch','equip','hunt_preset_apply','farm_clear','farm_harvest',"
  + "'farm_plant','farm_water','farm_upgrade_plot','farm_replant_seed','hero_slot_buy','hunt_pack','tally_accept','tally_drop','chest_open','tower_start',"
  + "'blessing_buy','boss_call','boss_hall','hero_colors_set','house_dummy','scaled_hunt_buy','shop_buy','stamina_refill','storage_chest','title_buy',"
  + "'town_show','town_works','training_start','unlock_buy','vendor_sell_many','market_buy','market_cancel','market_list','hearth_burn','crier','hallmark',"
  + "'setup_slot_buy','hero_rename')";
const day = (col) => `(${col} at time zone 'utc')::date::text`;
export const READS = Object.freeze({
  meta: `select now() at time zone 'utc' read_at, (select count(*) from profiles) profiles, (select count(*) from player_ledger) ledger_rows,
    (select ${day('min(at)')} from player_ledger) ledger_from, (select count(*) from hunt_sessions) sessions_kept`,
  accounts: `select p.id::text u, ${day('p.created_at')} created, a.note, (g.user_id is not null) gm, w.gold, w.gems
    from profiles p left join hr_access_allowlist a on a.user_id = p.id left join hr_gm_accounts g on g.user_id = p.id
    left join account_wallet w on w.user_id = p.id where exists (select 1 from player_state s where s.user_id = p.id)`,
  heroes: `select s.user_id::text u, s.slot, s.level_xp, ${day('s.created_at')} created, (s.premium_until is not null) premium, s.active_kind, s.active_id,
    s.last_activity_kind, s.last_activity_id, s.login_days,
    (select jsonb_object_agg(k.skill_id, k.xp) from player_skills k where k.user_id = s.user_id and k.slot = s.slot) skills,
    (select jsonb_object_agg(e.equip_slot, e.item_id) from player_equipment e where e.user_id = s.user_id and e.slot = s.slot) worn
    from player_state s`,
  /* every combat settle, in ten-minute buckets. `party` = the heroes whose settle shares this ground and this settle instant. */
  combat: `with a as (select l.user_id, l.slot, l.session_id, l.meta->>'mon' mon, l.meta->>'to' t, l.at, l.gold,
      coalesce((l.meta->>'ms')::numeric, 0) ms, coalesce((l.meta->>'kills')::numeric, 0) kills,
      coalesce((l.meta->'delta'->>'lx')::numeric, 0) lx, l.meta->'delta'->'x' x
      from player_ledger l where l.kind = 'combat' and l.intent = 'accrue'),
    p as (select mon, t, count(distinct user_id::text || ':' || slot) n, count(distinct user_id) accts from a group by 1, 2)
    select a.user_id::text u, a.slot, a.mon,
      to_char(date_trunc('hour', a.at at time zone 'utc') + floor(extract(minute from a.at at time zone 'utc') / 10) * interval '10 min', 'YYYY-MM-DD"T"HH24:MI') b,
      max(p.n) party, max(p.accts) accts, s.tier, (i.scale_level is not null) scaled, sum(a.ms) ms, sum(a.kills) kills, sum(a.gold) g, sum(a.lx) lx,
      sum(coalesce((a.x->>'melee')::numeric, 0)) melee, sum(coalesce((a.x->>'ranged')::numeric, 0)) ranged, sum(coalesce((a.x->>'magic')::numeric, 0)) magic,
      sum(coalesce((a.x->>'defense')::numeric, 0)) defense, sum(coalesce((a.x->>'inner_flame')::numeric, 0)) inner_flame
    from a join p using (mon, t) left join hunt_sessions s on s.id = a.session_id left join hunt_instances i on i.id = s.instance_id
    group by 1, 2, 3, 4, s.tier, (i.scale_level is not null)`,
  kills: `select l.user_id::text u, l.meta->>'mon' mon, e.key monster, sum(e.value::numeric) n
    from player_ledger l, jsonb_each_text(l.meta->'km') e
    where l.kind = 'combat' and l.intent = 'accrue' and jsonb_typeof(l.meta->'km') = 'object' group by 1, 2, 3`,
  loot: `select l.user_id::text u, l.meta->>'mon' mon, e.key item, sum(e.value::numeric) qty
    from player_ledger l, jsonb_each_text(l.meta->'delta'->'i') e
    where l.kind = 'combat' and l.intent = 'accrue' and jsonb_typeof(l.meta->'delta'->'i') = 'object' and e.value::numeric > 0 group by 1, 2, 3`,
  deaths: `select l.user_id::text u, l.slot, l.intent, l.at::text at, l.meta, s.tier,
      (select a.meta->>'mon' from player_ledger a where a.user_id = l.user_id and a.slot = l.slot and a.kind = 'combat' and a.intent = 'accrue' and a.id < l.id
        order by a.id desc limit 1) mon
    from player_ledger l left join hunt_sessions s on s.id = l.session_id where l.intent in ('death', 'death_xp', 'blessing_used')`,
  /* every journal verb by account and day: the gold table, the purse curve and each system's use are all read from this */
  verbs: `select l.user_id::text u, l.kind, split_part(l.intent, ':', 1) verb,
      case when split_part(l.intent, ':', 1) in ${FAMILY_VERBS} then split_part(split_part(l.intent, ':', 2), '.', 1) end fam,
      (l.meta ? 'transfer') xfer, coalesce(l.meta->>'via', '') via, ${day('l.at')} d, count(*) n, count(distinct l.slot) heroes,
      coalesce(sum(l.gold) filter (where l.gold > 0), 0) gin, coalesce(-sum(l.gold) filter (where l.gold < 0), 0) gout
    from player_ledger l group by 1, 2, 3, 4, 5, 6, 7`,
  supplies: `select l.user_id::text u, e.key item, sum((e.value->>'qty')::numeric) qty, sum((e.value->>'qty')::numeric * (e.value->>'price')::numeric) gold
    from player_ledger l, jsonb_each(l.meta->'items') e
    where l.kind = 'hunt' and l.intent = 'supply_buy' and jsonb_typeof(l.meta->'items') = 'object' and jsonb_typeof(e.value) = 'object' group by 1, 2`,
  supplies_own: `select l.user_id::text u, e.key item, sum(e.value::numeric) qty from player_ledger l, jsonb_each_text(l.meta->'items') e
    where l.kind = 'hunt' and l.intent = 'supply_own' and jsonb_typeof(l.meta->'items') = 'object' group by 1, 2`,
  vendor: `select l.user_id::text u, coalesce(l.meta->>'via', 'hand') via, e.key item, sum((e.value->>0)::numeric) qty,
      sum((e.value->>0)::numeric * (e.value->>1)::numeric) gold
    from player_ledger l, jsonb_each(l.meta->'lines') e
    where l.kind = 'shop' and l.intent like 'vendor_sell_many%' and jsonb_typeof(l.meta->'lines') = 'object' group by 1, 2, 3`,
  equips: `select l.user_id::text u, op->>'item' item, op->>'slot' slot, count(*) n from player_ledger l, jsonb_array_elements(l.meta->'ops') op
    where l.kind = 'equip' and jsonb_typeof(l.meta->'ops') = 'array' group by 1, 2, 3`,
  bank_moves: `select l.user_id::text u, split_part(l.intent, ':', 1) verb, l.item_id item, sum(abs(l.qty)) qty, count(*) n
    from player_ledger l where l.kind in ('bank', 'trade') and l.item_id is not null group by 1, 2, 3`,
  dispatch: `select l.user_id::text u, e.key item, sum(e.value::numeric) qty from player_ledger l, jsonb_each_text(l.meta->'items') e
    where l.kind = 'bank' and l.intent like 'loot_dispatch%' and jsonb_typeof(l.meta->'items') = 'object' group by 1, 2`,
  rules: `select user_id::text u, item_id item, loot_rule, locked, restock, count(*) heroes from player_item_rules group by 1, 2, 3, 4, 5`,
  holdings: `select user_id::text u, 'bag' place, item_id item, sum(qty) qty from player_inventory group by 1, 3
    union all select user_id::text, 'storage', item_id, sum(qty) from account_bank group by 1, 3
    union all select user_id::text, 'worn', item_id, count(*) from player_equipment group by 1, 3`,
  rare_notices: `select user_id::text u, hunt_id mon, item_id item, count(*) n from hr_world_notices where kind = 'rare_drop' group by 1, 2, 3`,
  town: `select user_id::text u, kind, coalesce(meta->>'recipe', meta->>'node') what, meta->>'skill' skill, sum((meta->>'ms')::numeric) ms,
      sum(coalesce((meta->>'made')::numeric, (meta->>'qty')::numeric, 0)) made, sum(coalesce((meta->>'burnt')::numeric, 0)) burnt,
      ${day('max(at)')} last_day from player_ledger where kind in ('craft', 'gather') and intent = 'accrue' group by 1, 2, 3, 4`,
  days: `select user_id::text u, slot, ${day('at')} d, kind, coalesce(meta->>'mon' like 'training_%', false) training, sum((meta->>'ms')::numeric) ms
    from player_ledger where intent = 'accrue' and kind in ('combat', 'craft', 'gather') group by 1, 2, 3, 4, 5`,
  presses: `select user_id::text u, to_char(date_trunc('minute', at at time zone 'utc'), 'YYYY-MM-DD"T"HH24:MI') m, count(*) n
    from player_ledger where split_part(intent, ':', 1) in ${AUTHORED} group by 1, 2`,
  last_presses: `select u, kind, verb, what, at from (select user_id::text u, kind, split_part(intent, ':', 1) verb, split_part(intent, ':', 2) what, at::text at,
      row_number() over (partition by user_id order by id desc) rn from player_ledger where split_part(intent, ':', 1) in ${AUTHORED}) x where rn <= 6`,
  sessions: `select s.user_id::text u, s.slot, s.hunt_id, s.tier, s.end_reason, s.hours_limit, s.after_choice, s.preset, i.kind ikind, i.session_mode,
      (i.scale_level is not null) scaled, extract(epoch from (coalesce(s.ended_at, s.settled_to) - s.hunt_from)) secs, t.paid_ms, t.kills, t.coins, t.deaths,
      t.supply_gold, t.cover_gold, (t.xp->>'level')::numeric lx, (t.dealt->>'total')::numeric dealt, (t.taken->>'total')::numeric taken,
      (t.healed->>'total')::numeric healed, t.dealt->'byAbility' abilities, t.scaled_ms, t.xp_event,
      (select count(*) from hunt_sessions o where o.instance_id = s.instance_id) seats
    from hunt_sessions s left join hunt_instances i on i.id = s.instance_id left join hunt_session_tally t on t.session_id = s.id`,
  systems: `select json_build_object(
    'tower_runs', (select json_agg(json_build_object('u', user_id::text, 'slot', slot, 'top', top_floor, 'floors', floors, 'party', party, 'end', end_reason, 'd', ${day('started_at')})) from tower_runs),
    'tower_best', (select json_agg(json_build_object('u', user_id::text, 'slot', slot, 'floor', best_floor, 'landing', best_landing)) from tower_progress),
    'chest_opens', (select json_agg(x) from (select user_id::text u, key_id, key_family, count(*) n, count(weapon) weapons, count(armor) armor, count(outfit) outfits, sum(stokes) stokes, sum(cinders_spent) cinders, ${day('max(at)')} last_day from chest_opens group by 1, 2, 3) x),
    'unlocks', (select json_agg(x) from (select user_id::text u, key, max(value) rung, count(*) heroes from player_progress where kind = 'unlock' group by 1, 2) x),
    'storage_chests', (select json_agg(x) from (select user_id::text u, count(*) n from account_storage_chests group by 1) x),
    'house_dummy', (select json_agg(x) from (select user_id::text u, skill from account_house_dummy) x),
    'farm', (select json_agg(x) from (select f.user_id::text u, f.plot_level, (select count(*) from account_farm_plots p where p.user_id = f.user_id and p.crop_id is not null) planted from account_farm f) x),
    'market_open', (select count(*) from market_listings),
    'market_sales', (select json_agg(json_build_object('seller', seller_user_id::text, 'buyer', buyer_user_id::text, 'item', item_id, 'gold', gold_gross, 'tax', tax, 'same_network', same_network)) from market_sales),
    'clans', (select count(*) from clans), 'clan_members', (select count(*) from clan_members), 'clan_ledger', (select count(*) from clan_ledger),
    'clan_tavern', (select count(*) from clan_tavern), 'clan_work_orders', (select count(*) from clan_work_orders), 'clan_stores', (select count(*) from clan_stores),
    'faction_members', (select json_agg(x) from (select user_id::text u, count(*) n from hr_faction_members group by 1) x),
    'friend_links', (select json_agg(json_build_object('a', user_lo::text, 'b', user_hi::text)) from friend_links),
    'friend_requests', (select count(*) from friend_requests),
    'parties_made', (select count(*) from hunt_parties), 'party_seekers', (select count(*) from party_seekers),
    'blessings_held', (select json_agg(x) from (select user_id::text u, tier, count(*) n, sum(paid) paid from player_blessings group by 1, 2) x),
    'scaled_hours', (select json_agg(x) from (select user_id::text u, sum(bought_ms) bought, sum(spent_ms) spent from player_scaled_hours group by 1) x),
    'training_gear', (select json_agg(x) from (select user_id::text u, sum(opened_ms) opened, sum(spent_ms) spent from player_training_gear group by 1) x),
    'premium', (select json_agg(x) from (select user_id::text u, count(*) filter (where premium_until is not null) heroes from player_state group by 1) x),
    'hearth_flames', (select json_agg(x) from (select user_id::text u, count(*) n, ${day('max(created_at)')} last_day from hearth_flames group by 1) x),
    'hearth_bursts', (select count(*) from hearth_bursts),
    'town_shows', (select json_agg(x) from (select user_id::text u, sink_id, count(*) n from town_shows group by 1, 2) x),
    'town_works', (select json_agg(x) from (select user_id::text u, project_id, sum(gold) gold from town_works_gifts group by 1, 2) x),
    'titles', (select count(*) from player_titles), 'cosmetics', (select count(*) from player_cosmetics), 'outfits', (select count(*) from player_outfits),
    'action_sets', (select json_agg(x) from (select user_id::text u, count(*) n, count(distinct slot) heroes from player_action_sets group by 1) x),
    'hunt_presets', (select json_agg(x) from (select user_id::text u, count(*) n from player_hunt_presets group by 1) x),
    'chat', (select json_agg(x) from (select from_id::text u, count(*) n, ${day('max(created_at)')} last_day from chat_messages where from_id is not null group by 1) x),
    'whispers', (select count(*) from chat_whispers),
    'tally_claims', (select json_agg(x) from (select user_id::text u, count(*) n, count(distinct day) days, sum(gold) gold from hero_tally_claims group by 1) x),
    'boss_loot_days', (select json_agg(x) from (select user_id::text u, boss, count(*) n from player_boss_loot_day group by 1, 2) x),
    'key_ring', (select json_agg(x) from (select user_id::text u, item_id, sum(qty) qty from player_key_ring group by 1, 2) x),
    'world_finds', (select count(*) from world_finds), 'hearthfinds', (select count(*) from hearthfind_log),
    'bounties', (select count(*) from active_bounty), 'workers', (select count(*) from player_workers),
    'gold_given', (select count(*) from account_gold_given), 'bug_reports', (select count(*) from bug_reports),
    'live_events', (select json_agg(json_build_object('type', type_id, 'first', ${day('first_at')}, 'hours', hours, 'every_days', every_days)) from hr_live_events),
    'event_xp', (select coalesce(sum(xp_event), 0) from hunt_session_tally),
    'refusals', (select json_agg(x) from (select user_id::text u, code, split_part(intent, ':', 1) verb, sum(n) n from hr_rejections group by 1, 2, 3) x)
  ) j`,
});

/* ── THE AGGREGATE (pure: raw rows in, anonymous tables out) ────────────────────────────────────────────────────────── */
const N = (v) => Number(v) || 0;
const H = (ms) => N(ms) / 3600000;
const r1 = (v) => Math.round(v * 10) / 10;
const r2 = (v) => Math.round(v * 100) / 100;
const r0 = (v) => Math.round(v);
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sum = (a, f = (x) => x) => a.reduce((t, x) => t + N(f(x)), 0);
const dayNo = (d) => Math.round(Date.parse(d + 'T00:00:00Z') / 86400000);
export const LEVEL_BANDS = Object.freeze([[1, 15], [16, 30], [31, 44], [45, 64], [65, 84], [85, 110]]);
const bandOf = (L) => { const b = LEVEL_BANDS.find(([a, z]) => L >= a && L <= z) || LEVEL_BANDS[LEVEL_BANDS.length - 1]; return b[0] + '-' + b[1]; };
const PACE_LEVELS = Object.freeze([5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 75]);
const SKILL_LEVELS = Object.freeze([10, 20, 30, 45, 60, 72, 75]);
const SESSION_GAP_MIN = 30;

/** real / test, and which accounts are one person, from the allowlist note alone. */
export function classify(accounts) {
  const head = (a) => (a.note ? String(a.note).split(/[,(]/)[0].trim().toLowerCase() : 'account ' + a.u);
  return accounts.map((a) => ({ ...a, cls: a.gm || /^\s*QA/i.test(a.note || '') ? 'test' : 'real', person: head(a) }));
}

/** The journal key a verb row files under and whether it is a source, a sink or a transfer. */
const SINK_LABELS = Object.freeze({
  'hunt:supply_buy': 'store supplies on the hunt', 'shop:shop_buy.supply': 'shop supplies, seeds and jewelry', 'shop:farm_replant_seed': 'replant seeds',
  'shop:stamina_refill': 'stamina refills', 'shop:blessing_buy': 'Blessings', 'shop:unlock_buy.temper': 'Tempering', 'shop:unlock_buy.room': 'House rooms',
  'shop:unlock_buy.property': 'House properties', 'shop:unlock_buy.bank': 'Storage rungs', 'shop:storage_chest': 'Storage chests',
  'shop:house_dummy': 'House training dummy', 'shop:training_start': 'training yard', 'shop:training_fee': 'training yard',
  'shop:scaled_hunt_buy': 'scaled hunts', 'shop:boss_call': 'boss calls', 'shop:town_works': 'Town Works', 'shop:town_show.round': 'tavern rounds',
  'shop:town_show.powder': 'Hearth powders', 'shop:title_buy': 'titles', 'shop:hero_colors_set': 'hero dyes', 'shop:hallmark': 'Hallmark fees',
  'shop:crier': 'Town Crier', 'shop:setup_slot_buy': 'action bar setups', 'shop:hero_rename': 'hero renames', 'trade:market_list': 'market listing fees',
  'craft:accrue': 'bench tax', 'farm:farm_upgrade_plot': 'farm plots', 'hero_slot:hero_slot_buy': 'hero slots',
});
const SOURCE_LABELS = Object.freeze({
  'combat:accrue': 'monster coin', 'shop:vendor_sell_many': 'loot sold to the shop', 'shop:loot_sell': 'loot sold to the shop', 'hunt:loot_sell': 'loot sold to the shop',
  'hunt:tally_pay': "Tamsin's tally", 'admin:create_character': 'starting gold',
});
const POWDERS = new Set(['borax', 'cinnabar', 'quicklime', 'verdigris', 'saltpeter', 'powder']);
export function goldKey(row) {
  let key = row.kind + ':' + row.verb + (row.fam ? '.' + row.fam : '');
  if (row.verb === 'town_show') key = 'shop:town_show.' + (row.fam === 'round' ? 'round' : POWDERS.has(row.fam) || row.fam ? 'powder' : 'round');
  if (row.xfer) return { key, role: 'transfer', label: 'market, player to player' };
  if (SOURCE_LABELS[key]) return { key, role: 'source', label: SOURCE_LABELS[key] };
  if (SINK_LABELS[key]) return { key, role: 'sink', label: SINK_LABELS[key] };
  return { key, role: N(row.gin) > N(row.gout) ? 'source' : 'sink', label: 'unlabelled ' + key };
}

/** Every table of the report, from the raw reads and the game's own data (`game`: level and skill curves, items, monsters, the sim's lines). */
export function aggregate(raw, game) {
  const { charLevelFromXp, skillLevelFromXp, contractXpPerH, ITEMS, bandOfItem, roleOfWorn, skillLine, paceHours } = game;
  const readDay = dayNo(String(raw.meta[0].read_at).slice(0, 10));
  const accounts = classify(raw.accounts);
  const acct = new Map(accounts.map((a) => [a.u, a]));
  const clsOf = (u) => (acct.get(u) ? acct.get(u).cls : 'test');

  /* heroes, with their hunted time and Level curve rebuilt from the journal */
  const heroKey = (u, slot) => u + ':' + slot;
  const heroes = new Map(raw.heroes.map((h) => [heroKey(h.u, h.slot), { ...h, buckets: [], deaths: [], hunt_ms: 0, train_ms: 0, gather_ms: 0, craft_ms: 0 }]));
  for (const c of raw.combat) { const h = heroes.get(heroKey(c.u, c.slot)); if (h) h.buckets.push(c); }
  for (const d of raw.deaths) { const h = heroes.get(heroKey(d.u, d.slot)); if (h && d.intent === 'death_xp') h.deaths.push(d); }
  const isTraining = (mon) => String(mon || '').startsWith('training_');
  const cells = []; // one per hero ten-minute bucket, with the Level the hero stood at
  for (const h of heroes.values()) {
    h.buckets.sort((a, b) => (a.b < b.b ? -1 : a.b > b.b ? 1 : 0));
    const lost = h.deaths.map((d) => ({ at: String(d.at).slice(0, 16).replace(' ', 'T'), xp: (typeof d.meta === 'string' ? JSON.parse(d.meta) : d.meta).xp || {} }))
      .sort((a, b) => (a.at < b.at ? -1 : 1));
    let lx = 0, di = 0; const sk = { melee: 0, ranged: 0, magic: 0, defense: 0, inner_flame: 0 };
    h.pace = {}; h.skillsAt = {}; h.partyMs = 0; h.soloMs = 0;
    for (const c of h.buckets) {
      while (di < lost.length && lost[di].at <= c.b) { lx = Math.max(0, lx - N(lost[di].xp.level)); for (const k of Object.keys(sk)) sk[k] = Math.max(0, sk[k] - N(lost[di].xp[k])); di += 1; }
      const level = charLevelFromXp(lx);
      const train = isTraining(c.mon);
      if (train) h.train_ms += N(c.ms); else { h.hunt_ms += N(c.ms); if (N(c.party) > 1) h.partyMs += N(c.ms); else h.soloMs += N(c.ms); }
      cells.push({ h, c, level, train });
      lx += N(c.lx); for (const k of Object.keys(sk)) sk[k] += N(c[k]);
      const after = charLevelFromXp(lx);
      for (const L of PACE_LEVELS) if (after >= L && h.pace[L] === undefined) h.pace[L] = H(h.hunt_ms);
      for (const L of SKILL_LEVELS) if (after >= L && !h.skillsAt[L]) h.skillsAt[L] = Object.fromEntries(Object.keys(sk).map((k) => [k, skillLevelFromXp(k, sk[k])]));
    }
    h.rebuilt_lx = lx; h.level = charLevelFromXp(N(h.level_xp));
  }
  for (const d of raw.days) { const h = heroes.get(heroKey(d.u, d.slot)); if (!h) continue; if (d.kind === 'gather') h.gather_ms += N(d.ms); if (d.kind === 'craft') h.craft_ms += N(d.ms); }

  /* labels: people and heroes in order of hours hunted, real first */
  const people = new Map();
  for (const a of accounts) { const p = people.get(a.person) || { key: a.person, cls: a.cls, accounts: [], hunt_ms: 0 }; p.accounts.push(a); people.set(a.person, p); }
  for (const h of heroes.values()) { const a = acct.get(h.u); if (a) people.get(a.person).hunt_ms += h.hunt_ms; }
  const order = [...people.values()].sort((a, b) => (a.cls === b.cls ? b.hunt_ms - a.hunt_ms : a.cls === 'real' ? -1 : 1));
  let pr = 0, pt = 0;
  for (const p of order) { p.label = p.cls === 'real' ? 'P' + (pr += 1) : 'T' + (pt += 1); p.accounts.sort((a, b) => (a.created < b.created ? -1 : 1)).forEach((a, i) => { a.label = p.label + (p.accounts.length > 1 ? 'abcd'[i] : ''); }); }
  const heroList = [...heroes.values()].filter((h) => acct.has(h.u)).sort((a, b) => b.hunt_ms - a.hunt_ms);
  let hr = 0, ht = 0;
  for (const h of heroList) { h.cls = clsOf(h.u); h.label = h.cls === 'real' ? 'H' + (hr += 1) : 'Q' + (ht += 1); h.account = acct.get(h.u).label; }
  const acctHeroes = (u) => heroList.filter((h) => h.u === u);
  const huntHoursOf = (u) => sum(acctHeroes(u), (h) => H(h.hunt_ms));
  const real = (u) => clsOf(u) === 'real';
  const realAccounts = accounts.filter((a) => a.cls === 'real');
  const realHeroes = heroList.filter((h) => h.cls === 'real');
  const realHuntH = sum(realHeroes, (h) => H(h.hunt_ms));

  const out = { schema: 'hearthrise.real-players/1', read_day: String(raw.meta[0].read_at).slice(0, 10), ledger_from: raw.meta[0].ledger_from,
    ledger_rows: N(raw.meta[0].ledger_rows), sessions_kept: N(raw.meta[0].sessions_kept), profiles: N(raw.meta[0].profiles) };

  /* 1. who the numbers rest on */
  out.population = {
    rule: 'test = allowlist note opens with "QA", or a game master account; one person = accounts whose notes open with the same word',
    profiles_with_no_hero: out.profiles - accounts.length,
    real: { people: order.filter((p) => p.cls === 'real').length, accounts: realAccounts.length, heroes: realHeroes.length,
      heroes_that_hunted: realHeroes.filter((h) => h.hunt_ms > 0).length, hunted_hero_hours: r0(realHuntH) },
    test: { people: order.filter((p) => p.cls === 'test').length, accounts: accounts.length - realAccounts.length, heroes: heroList.length - realHeroes.length,
      hunted_hero_hours: r0(sum(heroList.filter((h) => h.cls === 'test'), (h) => H(h.hunt_ms))) },
    accounts: accounts.slice().sort((a, b) => (a.label < b.label ? -1 : 1)).map((a) => ({ account: a.label, cls: a.cls, heroes: acctHeroes(a.u).length,
      heroes_that_hunted: acctHeroes(a.u).filter((h) => h.hunt_ms > 0).length, age_days: readDay - dayNo(a.created), hunted_hero_hours: r0(huntHoursOf(a.u)), purse: N(a.gold), crowns: N(a.gems) })),
  };

  /* 2. each hero: Level, way, hours, skills against the simulator's lines */
  const mainOf = (s) => ['melee', 'ranged', 'magic'].reduce((m, k) => (N(s[k]) > N(s[m]) ? k : m), 'melee');
  const heroRow = (h) => {
    const now = Object.fromEntries(Object.entries(h.skills || {}).map(([k, x]) => [k, skillLevelFromXp(k, N(x))]));
    const main = mainOf(now); const role = roleOfWorn(h.worn || {});
    const partyShare = h.hunt_ms ? h.partyMs / h.hunt_ms : 0;
    const line = skillLine(partyShare >= 0.5 ? 'party' : 'alone', role, main, h.level);
    const lifeDays = Math.max(1, readDay - dayNo(h.created) + 1);
    return { hero: h.label, account: h.account, cls: h.cls, level: h.level, way: role, main_skill: main, main: now[main] || 1, defense: now.defense || 1, inner_flame: now.inner_flame || 1,
      sim_line: line ? { mode: line.mode, style: line.style, main: line.main, defense: line.defense } : null,
      main_minus_level: (now[main] || 1) - h.level, defense_minus_level: (now.defense || 1) - h.level,
      hunted_h: r1(H(h.hunt_ms)), party_share: r2(partyShare), training_h: r1(H(h.train_ms)), gathering_h: r1(H(h.gather_ms)), crafting_h: r1(H(h.craft_ms)),
      life_days: lifeDays, share_of_life: { hunting: r2(H(h.hunt_ms) / (lifeDays * 24)), training: r2(H(h.train_ms) / (lifeDays * 24)), gathering: r2(H(h.gather_ms) / (lifeDays * 24)), crafting: r2(H(h.craft_ms) / (lifeDays * 24)) },
      deaths: h.deaths.length, premium: !!h.premium, level_xp_rebuilt_gap: r0(h.rebuilt_lx - sum(h.deaths, () => 0) - N(h.level_xp)),
      hours_to_level: Object.fromEntries(Object.entries(h.pace).map(([L, v]) => [L, r1(v)])),
      skills_at_level: Object.fromEntries(Object.entries(h.skillsAt).map(([L, s]) => { const m = mainOf(s); const ln = skillLine(partyShare >= 0.5 ? 'party' : 'alone', role, m, Number(L));
        return [L, { main: s[m], defense: s.defense, sim_main: ln ? ln.main : null, sim_defense: ln ? ln.defense : null }]; })) };
  };
  out.heroes = heroList.map(heroRow);

  /* 3. hours hunted to each Level, against the simulator's pace table */
  out.pace = PACE_LEVELS.map((L) => { const xs = out.heroes.filter((h) => h.cls === 'real' && h.hours_to_level[L] !== undefined).map((h) => h.hours_to_level[L]);
    return { level: L, real_heroes: xs.length, min: xs.length ? Math.min(...xs) : null, median: xs.length ? r1(median(xs)) : null, max: xs.length ? Math.max(...xs) : null,
      sim_lone_hours: paceHours(L), real_over_sim: xs.length && paceHours(L) ? r2(median(xs) / paceHours(L)) : null }; });

  /* 4. Level XP and coin an hour by Level band, party size, ground and tier */
  const group = (rows, keyOf, init, add) => { const m = new Map(); for (const r of rows) { const k = keyOf(r); if (k === null) continue; if (!m.has(k)) m.set(k, init(r)); add(m.get(k), r); } return [...m.values()]; };
  const rateInit = (extra) => ({ ...extra, heroes: new Set(), people: new Set(), ms: 0, lx: 0, g: 0, kills: 0, contract: 0, deaths: 0 });
  const rateAdd = (t, x) => { t.heroes.add(x.h.label); t.people.add(acct.get(x.h.u).person); t.ms += N(x.c.ms); t.lx += N(x.c.lx); t.g += N(x.c.g); t.kills += N(x.c.kills); t.contract += contractXpPerH(x.level) * H(x.c.ms); };
  const rateRow = (t) => { const { heroes: hs, people: ps, ms, lx, g, kills, contract, deaths, ...rest } = t; const h = H(ms);
    return { ...rest, heroes: hs.size, people: ps.size, hero_hours: r1(h), xp_h: h ? r0(lx / h) : 0, xp_vs_contract: contract ? r2(lx / contract) : null, coin_h: h ? r0(g / h) : 0,
      kills_h: h ? r0(kills / h) : 0, deaths, deaths_per_100h: h ? r1(deaths / h * 100) : null }; };
  const huntCells = cells.filter((x) => !x.train);
  const sizeOf = (x) => Math.min(4, Math.max(1, N(x.c.party)));
  const deathAt = raw.deaths.filter((d) => d.intent === 'death').map((d) => { const h = heroes.get(heroKey(d.u, d.slot)); if (!h || !acct.has(h.u)) return null;
    const b = String(d.at).slice(0, 15).replace(' ', 'T') + '0'; const cell = cells.filter((x) => x.h === h && x.c.b <= b).pop();
    const meta = typeof d.meta === 'string' ? JSON.parse(d.meta) : d.meta;
    return { h, cls: h.cls, way: cell ? mainOf(cell.c) : null, mon: d.mon || (cell ? cell.c.mon : null), tier: d.tier || (cell ? cell.c.tier : null) || 'not recorded', party: cell ? sizeOf(cell) : 1, level: cell ? cell.level : h.level, monster: meta.monster || null }; }).filter(Boolean);
  const withDeaths = (rows, match) => rows.map((t) => { t.deaths = deathAt.filter((d) => match(t, d)).length; return t; });
  for (const cls of ['real', 'test']) {
    const cs = huntCells.filter((x) => x.h.cls === cls); const ds = deathAt.filter((d) => d.cls === cls);
    const key = cls === 'real' ? '' : '_test';
    out['xp_by_band_party' + key] = withDeaths(group(cs, (x) => bandOf(x.level) + '|' + sizeOf(x), (x) => rateInit({ band: bandOf(x.level), party: sizeOf(x) }), rateAdd),
      (t, d) => ds.includes(d) && bandOf(d.level) === t.band && d.party === t.party).map(rateRow).sort((a, b) => parseInt(a.band, 10) - parseInt(b.band, 10) || a.party - b.party);
    out['xp_by_ground' + key] = withDeaths(group(cs, (x) => x.c.mon + '|' + (x.c.tier || 'not recorded') + '|' + (sizeOf(x) > 1 ? 'party' : 'alone'),
      (x) => rateInit({ ground: x.c.mon, tier: x.c.tier || 'not recorded', mode: sizeOf(x) > 1 ? 'party' : 'alone', levels: [x.level, x.level] }),
      (t, x) => { rateAdd(t, x); t.levels = [Math.min(t.levels[0], x.level), Math.max(t.levels[1], x.level)]; }),
      (t, d) => ds.includes(d) && d.mon === t.ground && d.tier === t.tier && (d.party > 1 ? 'party' : 'alone') === t.mode).map(rateRow).sort((a, b) => a.levels[0] - b.levels[0]);
  }
  out.party = { real_hunt_hours_by_size: [1, 2, 3, 4].map((n) => ({ party: n, hero_hours: r1(sum(huntCells.filter((x) => x.h.cls === 'real' && sizeOf(x) === n), (x) => H(x.c.ms))) })),
    hero_hours_with_two_accounts_in_one_hunt: r1(sum(huntCells.filter((x) => x.h.cls === 'real' && N(x.c.accts) > 1), (x) => H(x.c.ms))),
    tier_recorded_share: r2(sum(huntCells.filter((x) => x.h.cls === 'real' && x.c.tier), (x) => N(x.c.ms)) / Math.max(1, sum(huntCells.filter((x) => x.h.cls === 'real'), (x) => N(x.c.ms)))),
    scaled_hero_hours: r1(sum(huntCells.filter((x) => x.c.scaled), (x) => H(x.c.ms))) };
  const realDeaths = deathAt.filter((d) => d.cls === 'real');
  out.by_account_size = withDeaths(group(huntCells.filter((x) => x.h.cls === 'real'), (x) => String(acctHeroes(x.h.u).filter((h) => h.hunt_ms > 0).length),
    (x) => rateInit({ heroes_on_account: acctHeroes(x.h.u).filter((h) => h.hunt_ms > 0).length }), rateAdd),
    (t, d) => realDeaths.includes(d) && acctHeroes(d.h.u).filter((h) => h.hunt_ms > 0).length === t.heroes_on_account).map(rateRow).sort((a, b) => a.heroes_on_account - b.heroes_on_account);
  /* the way a hero fought in a bucket = the attack skill that earned the most XP in it */
  out.by_way = withDeaths(group(huntCells.filter((x) => x.h.cls === 'real'), (x) => { const w = mainOf(x.c); return N(x.c[w]) > 0 ? w + '|' + (sizeOf(x) > 1 ? 'party' : 'alone') : null; },
    (x) => ({ ...rateInit({ way: mainOf(x.c), mode: sizeOf(x) > 1 ? 'party' : 'alone' }), sx: 0, dx: 0 }), (t, x) => { rateAdd(t, x); t.sx += N(x.c[t.way]); t.dx += N(x.c.defense); }),
    (t, d) => realDeaths.includes(d) && d.way === t.way && (d.party > 1 ? 'party' : 'alone') === t.mode)
    .map((t) => { const { sx, dx, ...rest } = t; const h = H(t.ms); return { ...rateRow(rest), skill_xp_h: r0(sx / h), defense_xp_h: r0(dx / h) }; });

  /* 5. deaths */
  const dx = raw.deaths.filter((d) => d.intent === 'death_xp' && real(d.u)).map((d) => (typeof d.meta === 'string' ? JSON.parse(d.meta) : d.meta));
  out.deaths = { real: deathAt.filter((d) => d.cls === 'real').length, test: deathAt.filter((d) => d.cls === 'test').length,
    real_per_100_hunted_hours: realHuntH ? r2(deathAt.filter((d) => d.cls === 'real').length / realHuntH * 100) : null,
    real_by_monster: Object.entries(deathAt.filter((d) => d.cls === 'real').reduce((m, d) => { m[d.monster || 'not recorded'] = (m[d.monster || 'not recorded'] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]),
    real_level_xp_lost: r0(sum(dx, (m) => (m.xp || {}).level)), real_death_xp_rows: dx.length,
    real_permille_seen: Object.entries(dx.reduce((m, x) => { m[x.permille] = (m[x.permille] || 0) + 1; return m; }, {})),
    real_blessings_used: raw.deaths.filter((d) => d.intent === 'blessing_used' && real(d.u)).length };

  /* 6. gold: every source and sink, a hunted hero-hour, and the purse over an account's age */
  const gold = new Map();
  for (const v of raw.verbs) { if (!acct.has(v.u) || (!N(v.gin) && !N(v.gout))) continue; const k = goldKey(v); const cls = clsOf(v.u); const id = cls + '|' + k.label;
    if (!gold.has(id)) gold.set(id, { cls, label: k.label, role: k.role, gin: 0, gout: 0, rows: 0, accounts: new Set(), people: new Set(), last: '' });
    const t = gold.get(id); t.gin += N(v.gin); t.gout += N(v.gout); t.rows += N(v.n); t.accounts.add(v.u); t.people.add(acct.get(v.u).person); if (v.d > t.last) t.last = v.d; }
  const goldRows = (cls) => { const rows = [...gold.values()].filter((t) => t.cls === cls); const hh = cls === 'real' ? realHuntH : sum(heroList.filter((h) => h.cls === 'test'), (h) => H(h.hunt_ms));
    const tin = sum(rows.filter((t) => t.role === 'source'), (t) => t.gin); const tout = sum(rows.filter((t) => t.role === 'sink'), (t) => t.gout);
    return { hunted_hero_hours: r0(hh), gold_in: r0(tin), gold_out: r0(tout), net: r0(tin - tout), in_per_hunted_hour: r0(tin / Math.max(1, hh)), out_per_hunted_hour: r0(tout / Math.max(1, hh)),
      rows: rows.map((t) => ({ label: t.label, role: t.role, gold: r0(t.role === 'source' ? t.gin : t.role === 'sink' ? t.gout : t.gout), share: r2((t.role === 'source' ? t.gin / Math.max(1, tin) : t.role === 'sink' ? t.gout / Math.max(1, tout) : 0)),
        per_hunted_hour: r0((t.role === 'source' ? t.gin : t.gout) / Math.max(1, hh)), uses: t.rows, accounts: t.accounts.size, people: t.people.size, days_since_last: readDay - dayNo(t.last) }))
        .sort((a, b) => (a.role === b.role ? b.gold - a.gold : a.role < b.role ? 1 : -1)) }; };
  out.gold = { real: goldRows('real'), test: goldRows('test') };
  const supplyClass = (id) => { const it = ITEMS[id] || {}; if (/rune/.test(id)) return 'runes'; if (/whetstone|arrow|bolt|quiver/.test(id) || it.type === 'ammo') return 'ammo and whetstones';
    if (/juice|tea|water|ale|brew|cider|milk|tonic|drink/.test(id) || it.drink) return 'drinks'; return 'food'; };
  const supplyTotals = raw.supplies.filter((s) => real(s.u)).reduce((m, s) => { const k = supplyClass(s.item); m[k] = (m[k] || 0) + N(s.gold); return m; }, {});
  const supplyAll = sum(Object.values(supplyTotals));
  out.gold.real.store_supplies_by_kind = Object.entries(supplyTotals).map(([kind, g]) => ({ kind, gold: r0(g), share: r2(g / Math.max(1, supplyAll)) })).sort((a, b) => b.gold - a.gold);
  out.gold.real.own_supplies_used = r0(sum(raw.supplies_own.filter((s) => real(s.u)), (s) => s.qty));
  out.gold.real.store_supplies_bought = r0(sum(raw.supplies.filter((s) => real(s.u)), (s) => s.qty));
  out.gold.by_account = realAccounts.map((a) => { const vs = raw.verbs.filter((v) => v.u === a.u); const hh = huntHoursOf(a.u);
    const tin = sum(vs.filter((v) => goldKey(v).role === 'source'), (v) => v.gin); const tout = sum(vs.filter((v) => goldKey(v).role === 'sink'), (v) => v.gout);
    const supply = sum(vs.filter((v) => v.verb === 'supply_buy'), (v) => v.gout); const coin = sum(vs.filter((v) => v.kind === 'combat'), (v) => v.gin);
    const sold = sum(vs.filter((v) => /sell/.test(v.verb)), (v) => v.gin);
    return { account: a.label, heroes: acctHeroes(a.u).filter((h) => h.hunt_ms > 0).length, top_level: Math.max(0, ...acctHeroes(a.u).map((h) => h.level)), hunted_hero_hours: r0(hh),
      in_per_hunted_hour: r0(tin / Math.max(1, hh)), coin_per_hunted_hour: r0(coin / Math.max(1, hh)), sold_per_hunted_hour: r0(sold / Math.max(1, hh)), sold_share_of_income: r2(sold / Math.max(1, tin)),
      store_supplies_per_hunted_hour: r0(supply / Math.max(1, hh)), supplies_share_of_coin: r2(supply / Math.max(1, coin)), out_per_hunted_hour: r0(tout / Math.max(1, hh)), purse_now: N(a.gold), ledger_net: r0(tin - tout) }; })
    .sort((a, b) => (a.account < b.account ? -1 : 1));
  out.purse_curve = realAccounts.map((a) => { const first = dayNo(a.created); const vs = raw.verbs.filter((v) => v.u === a.u); const start = Math.min(first, ...vs.map((v) => dayNo(v.d)));
    const at = (n) => r0(sum(vs.filter((v) => dayNo(v.d) - start < n), (v) => N(v.gin) - N(v.gout)));
    const age = readDay - start + 1; return { account: a.label, age_days: age, purse_after_days: Object.fromEntries([1, 3, 7, 14, 21, 28].filter((n) => n <= age).map((n) => [n, at(n)])), purse_now: N(a.gold) }; })
    .sort((a, b) => (a.account < b.account ? -1 : 1));
  out.coin_by_band = group(huntCells.filter((x) => x.h.cls === 'real'), (x) => bandOf(x.level), (x) => rateInit({ band: bandOf(x.level) }), rateAdd).map(rateRow)
    .sort((a, b) => parseInt(a.band, 10) - parseInt(b.band, 10)).map((t) => ({ band: t.band, heroes: t.heroes, hero_hours: t.hero_hours, coin_h: t.coin_h, xp_h: t.xp_h }));

  /* 7. items: drops an hour by kind, tier and band, the reveals against the rows' odds, and what players do with gear */
  const kindOf = (id) => { const it = ITEMS[id]; if (!it) return 'unknown'; return ['weapon', 'armor', 'offhand', 'jewelry'].includes(it.type) ? 'gear' : it.type === 'trophy' ? 'trophy' : 'other'; };
  const isGear = (id) => kindOf(id) === 'gear';
  const groundHours = new Map(); for (const x of huntCells) if (x.h.cls === 'real') groundHours.set(x.c.mon, (groundHours.get(x.c.mon) || 0) + H(x.c.ms));
  const lootReal = raw.loot.filter((l) => real(l.u));
  /* the band of a drop is the band of the likeliest row for that item among the monsters killed on that ground (an item can be common on one monster and rare on another) */
  const groundMonsters = new Map(); for (const k of raw.kills) { if (!groundMonsters.has(k.mon)) groundMonsters.set(k.mon, new Set()); groundMonsters.get(k.mon).add(k.monster); }
  const bandMemo = new Map();
  const bandAt = (item, ground) => { const key = item + '|' + ground; if (bandMemo.has(key)) return bandMemo.get(key); let best = null;
    for (const m of groundMonsters.get(ground) || []) for (const row of game.allRows(m)) if (row.id === item && (!best || row.ch > best.ch)) best = row;
    const b = best ? best.band || null : bandOfItem(item); bandMemo.set(key, b); return b; };
  out.drops_by_ground = [...groundHours.entries()].filter(([, h]) => h >= 1).map(([mon, h]) => { const ls = lootReal.filter((l) => l.mon === mon);
    const byBand = {}; for (const l of ls) { const b = bandAt(l.item, mon) || 'no band'; byBand[b] = (byBand[b] || 0) + N(l.qty); }
    const gear = ls.filter((l) => isGear(l.item)); const tiers = {}; for (const l of gear) { const t = 'tier ' + ((ITEMS[l.item] || {}).tier || '?'); tiers[t] = (tiers[t] || 0) + N(l.qty); }
    return { ground: mon, hero_hours: r1(h), gear_pieces_h: r2(sum(gear, (l) => l.qty) / h), gear_by_tier: tiers,
      per_hour_by_band: Object.fromEntries(Object.entries(byBand).map(([b, n]) => [b, r2(n / h)])), rare_count: byBand.rare || 0, trophy_count: byBand.trophy || 0,
      hours_per_rare_reveal: (byBand.rare || 0) + (byBand.trophy || 0) ? r1(h / ((byBand.rare || 0) + (byBand.trophy || 0))) : null }; }).sort((a, b) => b.hero_hours - a.hero_hours);
  const expected = { rare: 0, trophy: 0 }; const got = { rare: 0, trophy: 0 }; const rareRows = [];
  for (const k of raw.kills.filter((x) => real(x.u))) for (const row of game.dropRows(k.monster)) if (expected[row.band] !== undefined) {
    expected[row.band] += N(k.n) * row.ch; rareRows.push({ monster: k.monster, item: row.id, band: row.band, kills: N(k.n), ch: row.ch }); }
  const killsWithMonsters = sum(raw.kills.filter((x) => real(x.u)), (x) => x.n); const killsAll = sum(huntCells.filter((x) => x.h.cls === 'real'), (x) => x.c.kills);
  const otherRows = new Set(); for (const k of raw.kills.filter((x) => real(x.u))) for (const row of game.allRows(k.monster)) if (row.band !== 'rare' && row.band !== 'trophy') otherRows.add(row.id);
  const lootOnKm = new Map(); for (const l of lootReal) { const b = bandAt(l.item, l.mon); if (got[b] !== undefined) got[b] += N(l.qty); lootOnKm.set(l.item, (lootOnKm.get(l.item) || 0) + N(l.qty)); }
  const pure = { rare: { items: 0, expected: 0, dropped: 0 }, trophy: { items: 0, expected: 0, dropped: 0 } };
  const byItem = new Map(); for (const r of rareRows) { const t = byItem.get(r.item) || { item: r.item, band: r.band, expected: 0 }; t.expected += r.kills * r.ch; byItem.set(r.item, t); }
  for (const t of byItem.values()) { t.pure = !otherRows.has(t.item); if (t.pure) { pure[t.band].items += 1; pure[t.band].expected += t.expected; pure[t.band].dropped += lootOnKm.get(t.item) || 0; } }
  for (const b of ['rare', 'trophy']) { pure[b].expected = r2(pure[b].expected); pure[b].dropped_over_expected = pure[b].expected ? r2(pure[b].dropped / pure[b].expected) : null; }
  out.rares = { only_rare_items: pure, kills_with_a_monster_name_share: r2(killsWithMonsters / Math.max(1, killsAll)), expected_from_row_odds: { rare: r1(expected.rare), trophy: r2(expected.trophy) }, dropped: got,
    dropped_over_expected: { rare: expected.rare ? r2(got.rare / expected.rare * (killsWithMonsters / Math.max(1, killsAll))) : null },
    reveal_notices_real: sum(raw.rare_notices.filter((n) => real(n.u)), (n) => n.n),
    rows: [...byItem.values()].map((t) => ({ item: t.item, band: t.band, only_rare_rows: t.pure, expected: r1(t.expected), dropped: lootOnKm.get(t.item) || 0 })).sort((a, b) => b.expected - a.expected).slice(0, 40),
    trophies_held_real: sum(raw.holdings.filter((x) => real(x.u) && kindOf(x.item) === 'trophy'), (x) => x.qty) };
  const gearDropped = sum(lootReal.filter((l) => isGear(l.item)), (l) => l.qty);
  const vend = raw.vendor.filter((v) => real(v.u) && isGear(v.item));
  const tierOf = (id) => (ITEMS[id] || {}).tier || 0;
  out.gear_use = { dropped: r0(gearDropped), sold_to_shop: r0(sum(vend, (v) => v.qty)), sold_by_loot_rule: r0(sum(vend.filter((v) => v.via === 'loot_dispatch'), (v) => v.qty)),
    sold_by_hand: r0(sum(vend.filter((v) => v.via !== 'loot_dispatch'), (v) => v.qty)), sold_gold: r0(sum(vend, (v) => v.gold)),
    sold_gold_all_items: r0(sum(raw.vendor.filter((v) => real(v.u)), (v) => v.gold)),
    stored: r0(sum(raw.bank_moves.filter((b) => real(b.u) && b.verb === 'bank_deposit' && isGear(b.item)), (b) => b.qty) + sum(raw.dispatch.filter((b) => real(b.u) && isGear(b.item)), (b) => b.qty)),
    taken_back_out: r0(sum(raw.bank_moves.filter((b) => real(b.u) && b.verb === 'bank_withdraw' && isGear(b.item)), (b) => b.qty)),
    listed_on_market: r0(sum(raw.bank_moves.filter((b) => real(b.u) && b.verb === 'market_list' && isGear(b.item)), (b) => b.qty)),
    equip_presses: r0(sum(raw.equips.filter((e) => real(e.u) && e.item && isGear(e.item)), (e) => e.n)), distinct_pieces_ever_worn: new Set(raw.equips.filter((e) => real(e.u) && e.item && isGear(e.item)).map((e) => e.u + e.item)).size,
    held_now: Object.fromEntries(['bag', 'storage', 'worn'].map((p) => [p, r0(sum(raw.holdings.filter((x) => real(x.u) && x.place === p && isGear(x.item)), (x) => x.qty))])),
    salvaged: 0,
    sold_by_tier: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((t) => ['tier ' + t, r0(sum(vend.filter((v) => tierOf(v.item) === t), (v) => v.qty))])),
    dropped_by_tier: Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((t) => ['tier ' + t, r0(sum(lootReal.filter((l) => isGear(l.item) && tierOf(l.item) === t), (l) => l.qty))])),
    loot_rules: Object.entries(raw.rules.filter((r) => real(r.u)).reduce((m, r) => { const k = (r.loot_rule || 'none') + (r.locked ? ' + locked' : ''); m[k] = (m[k] || 0) + N(r.heroes); return m; }, {})),
    accounts_with_a_loot_rule: new Set(raw.rules.filter((r) => real(r.u) && r.loot_rule).map((r) => r.u)).size };

  /* 8. every system: uses, accounts, days since the last use (a system at zero for two days is a P1, CLAUDE.md §3.4) */
  const S = raw.systems[0].j; const arr = (k) => S[k] || [];
  const verbUse = (name, test) => { const vs = raw.verbs.filter((v) => test(v)); const rs = vs.filter((v) => real(v.u)); const last = rs.reduce((m, v) => (v.d > m ? v.d : m), '');
    return { system: name, real_uses: sum(rs, (v) => v.n), real_accounts: new Set(rs.map((v) => v.u)).size, real_people: new Set(rs.map((v) => acct.get(v.u).person)).size,
      test_uses: sum(vs.filter((v) => !real(v.u)), (v) => v.n), days_since_last_real_use: last ? readDay - dayNo(last) : null }; };
  const tableUse = (name, rows, nOf = (r) => N(r.n) || 1, lastOf = () => null) => { const rs = rows.filter((r) => real(r.u)); const last = rs.reduce((m, r) => { const d = lastOf(r); return d && d > m ? d : m; }, '');
    return { system: name, real_uses: sum(rs, nOf), real_accounts: new Set(rs.map((r) => r.u)).size, real_people: new Set(rs.map((r) => acct.get(r.u).person)).size,
      test_uses: sum(rows.filter((r) => !real(r.u)), nOf), days_since_last_real_use: last ? readDay - dayNo(last) : null }; };
  const count = (name, n, note) => ({ system: name, real_uses: null, real_accounts: null, real_people: null, test_uses: null, days_since_last_real_use: null, rows_any_account: N(n), detail: note });
  const v = (verb, kind) => (x) => x.verb === verb && (!kind || x.kind === kind);
  const fam = (f) => (x) => x.verb === 'unlock_buy' && x.fam === f;
  const hallUnlock = (k) => arr('unlocks').filter((u) => u.key.startsWith(k));
  out.systems = [
    verbUse('hunting (combat settles)', (x) => x.kind === 'combat' && x.verb === 'accrue'),
    verbUse('gathering', (x) => x.kind === 'gather'), verbUse('crafting, cooking, smithing, runecrafting', (x) => x.kind === 'craft' && x.verb === 'accrue'),
    verbUse('farming: plant', v('farm_plant')), verbUse('farming: water', v('farm_water')), verbUse('farming: harvest', v('farm_harvest')), verbUse('farm plot upgrades', v('farm_upgrade_plot')),
    verbUse('store supplies bought on a hunt', v('supply_buy')), verbUse('own supplies used on a hunt', v('supply_own')),
    verbUse('shop: loot sold', (x) => /sell/.test(x.verb)), verbUse('shop: supplies, seeds, jewelry bought', (x) => x.verb === 'shop_buy'),
    verbUse('Storage: deposit', v('bank_deposit')), verbUse('Storage: withdraw', v('bank_withdraw')), verbUse('loot plan dispatch (store or sell after a hunt)', v('loot_dispatch')),
    verbUse('equip', v('equip')), verbUse("Tamsin's tally: task taken", v('tally_accept')), verbUse("Tamsin's tally: paid", v('tally_pay')),
    verbUse('stamina refills', v('stamina_refill')), verbUse('Blessings bought', v('blessing_buy')), verbUse('Blessings used by a death', v('blessing_used')),
    verbUse('deaths', v('death')), verbUse('Tempering', fam('temper')), verbUse('House rooms', fam('room')), verbUse('House properties', fam('property')),
    verbUse('Storage rungs', fam('bank')), verbUse('Storage chests', v('storage_chest')), verbUse('House training dummy', v('house_dummy')),
    verbUse('training yard and dummy sessions', v('training_start')), verbUse('scaled hunts bought', v('scaled_hunt_buy')),
    verbUse('boss called out (paid)', v('boss_call')), verbUse('boss hall entered (key)', v('boss_hall')), verbUse('boss daily loot', v('boss_daily')),
    verbUse('the Burning Tower: climbs started', v('tower_start')), verbUse('Tower keys earned', v('tower_key')), verbUse('Hearth Chest opens', v('chest_open')),
    verbUse('Hearth: fuel burned', v('hearth_burn')), verbUse('Hearth powders and tavern rounds', v('town_show')), verbUse('Town Works gifts', v('town_works')),
    verbUse('Town Crier', v('crier')), verbUse('titles bought', v('title_buy')), verbUse('hero dyes', v('hero_colors_set')), verbUse('hero renames', v('hero_rename')),
    verbUse('action bar setup slots bought', v('setup_slot_buy')), verbUse('Hallmark fees', v('hallmark')), verbUse('hero slots bought', v('hero_slot_buy')),
    verbUse('market: listed', v('market_list')), verbUse('market: bought', v('market_buy')), verbUse('market: cancelled or expired', (x) => x.verb === 'market_cancel' || x.verb === 'market_expire'),
    verbUse('Crowns bought or spent (iap)', (x) => x.kind === 'iap' || x.kind === 'gem_unlock'),
    tableUse('Tower runs kept', arr('tower_runs'), () => 1, (r) => r.d), tableUse('chest opens (rows)', arr('chest_opens'), (r) => N(r.n), (r) => r.last_day),
    tableUse('chat lines', arr('chat'), (r) => N(r.n), (r) => r.last_day), tableUse('Hearth flames lit', arr('hearth_flames'), (r) => N(r.n), (r) => r.last_day),
    tableUse('factions joined (QA switch only)', arr('faction_members')), tableUse('training items opened', arr('training_gear').filter((r) => N(r.opened) > 0)),
    tableUse('saved action bar setups', arr('action_sets')), tableUse('saved hunt presets', arr('hunt_presets')),
    tableUse('premium heroes (granted, not bought)', arr('premium').filter((r) => N(r.heroes) > 0), (r) => N(r.heroes)),
    { ...count('friend links', arr('friend_links').length), real_uses: arr('friend_links').filter((f) => real(f.a) && real(f.b)).length, real_accounts: new Set(arr('friend_links').flatMap((f) => [f.a, f.b]).filter(real)).size },
    { ...count('market sales', arr('market_sales').length), real_uses: arr('market_sales').filter((m) => real(m.seller) && real(m.buyer)).length,
      detail: arr('market_sales').filter((m) => m.same_network || acct.get(m.seller) && acct.get(m.buyer) && acct.get(m.seller).person === acct.get(m.buyer).person).length + ' between one person\'s own accounts' },
    count('market listings open now', S.market_open), count('parties made (kept rows)', S.parties_made), count('party finder seekers', S.party_seekers),
    count('friend requests pending', S.friend_requests), count('whispers', S.whispers),
    count('clans', S.clans), count('clan members', S.clan_members), count('clan ledger (castle, stores, standing)', S.clan_ledger), count('clan feasts (tavern)', S.clan_tavern),
    count('castle board orders', S.clan_work_orders), count('clan stores', S.clan_stores), count('titles held', S.titles), count('cosmetics held', S.cosmetics),
    count('outfits set', S.outfits), count('world finds', S.world_finds), count('lucky finds logged', S.hearthfinds), count('Hearth bursts', S.hearth_bursts),
    count('bounties', S.bounties), count('workers', S.workers), count('Gold Given board rows', S.gold_given), count('bug reports', S.bug_reports),
    count('live event Level XP paid', S.event_xp, (S.live_events || []).map((e) => e.type + ' first ' + e.first).join(', ')),
  ];
  out.house = { real_accounts: realAccounts.length,
    rooms: [...new Set(hallUnlock('room:').map((u) => u.key))].map((k) => ({ room: k.slice(5), real_accounts: hallUnlock(k).filter((u) => real(u.u)).length, top_rung: Math.max(0, ...hallUnlock(k).filter((u) => real(u.u)).map((u) => N(u.rung))) })),
    properties: [...new Set(hallUnlock('property:').map((u) => u.key))].map((k) => ({ property: k.slice(9), real_accounts: hallUnlock(k).filter((u) => real(u.u)).length, top_rung: Math.max(0, ...hallUnlock(k).filter((u) => real(u.u)).map((u) => N(u.rung))) })),
    temper: [...new Set(hallUnlock('temper:').map((u) => u.key))].map((k) => ({ track: k.slice(7), real_accounts: new Set(hallUnlock(k).filter((u) => real(u.u)).map((u) => u.u)).size, real_heroes: sum(hallUnlock(k).filter((u) => real(u.u)), (u) => u.heroes), top_rung: Math.max(0, ...hallUnlock(k).filter((u) => real(u.u)).map((u) => N(u.rung))) })),
    storage_chests: sum(arr('storage_chests').filter((r) => real(r.u)), (r) => r.n), storage_rung_accounts: hallUnlock('bank').filter((u) => real(u.u)).length,
    dummy_accounts: new Set(arr('house_dummy').filter((r) => real(r.u)).map((r) => r.u)).size,
    farm: arr('farm').filter((r) => real(r.u)).map((r) => ({ plot_level: N(r.plot_level), planted_now: N(r.planted) })) };
  out.tower = { runs: arr('tower_runs').map((r) => ({ cls: clsOf(r.u), top_floor: N(r.top), floors: N(r.floors), party: N(r.party), end: r.end })).sort((a, b) => b.top_floor - a.top_floor),
    best_real: Math.max(0, ...arr('tower_best').filter((r) => real(r.u)).map((r) => N(r.floor))), real_heroes_with_a_best: arr('tower_best').filter((r) => real(r.u)).length,
    chest: arr('chest_opens').filter((r) => real(r.u)).map((r) => ({ key: r.key_id, family: r.key_family, opens: N(r.n), weapons: N(r.weapons), armor: N(r.armor), outfits: N(r.outfits), stokes: N(r.stokes), cinders: N(r.cinders) })) };
  const town = raw.town.filter((t) => real(t.u));
  const townBy = (kind) => group(town.filter((t) => t.kind === kind), (t) => t.what || 'not recorded', (t) => ({ what: t.what || 'not recorded', skill: t.skill, ms: 0, made: 0, burnt: 0, accounts: new Set(), last: '' }),
    (t, x) => { t.ms += N(x.ms); t.made += N(x.made); t.burnt += N(x.burnt); t.accounts.add(x.u); if (x.last_day > t.last) t.last = x.last_day; })
    .map((t) => ({ what: t.what, skill: t.skill, hero_hours: r1(H(t.ms)), made: r0(t.made), burnt: r0(t.burnt), accounts: t.accounts.size, days_since_last: readDay - dayNo(t.last) })).sort((a, b) => b.hero_hours - a.hero_hours);
  out.crafting = townBy('craft'); out.gathering = townBy('gather');
  out.town_hours_by_skill = group(town, (t) => t.skill || t.kind, (t) => ({ skill: t.skill || t.kind, ms: 0, accounts: new Set() }), (t, x) => { t.ms += N(x.ms); t.accounts.add(x.u); })
    .map((t) => ({ skill: t.skill, hero_hours: r1(H(t.ms)), accounts: t.accounts.size })).sort((a, b) => b.hero_hours - a.hero_hours);
  out.training = { real_hero_hours: r1(sum(realHeroes, (h) => H(h.train_ms))), real_heroes: realHeroes.filter((h) => h.train_ms > 0).length,
    by_place: group(cells.filter((x) => x.train && x.h.cls === 'real'), (x) => x.c.mon, (x) => ({ place: x.c.mon, ms: 0, sx: 0 }), (t, x) => { t.ms += N(x.c.ms); t.sx += N(x.c.melee) + N(x.c.ranged) + N(x.c.magic) + N(x.c.defense); })
      .map((t) => ({ place: t.place, hero_hours: r1(H(t.ms)), skill_xp_h: r0(t.sx / Math.max(0.01, H(t.ms))) })) };
  out.refusals = Object.entries(arr('refusals').filter((r) => real(r.u)).reduce((m, r) => { const k = r.code + ' on ' + r.verb; m[k] = (m[k] || 0) + N(r.n); return m; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 15);

  /* 9. time: sessions, away, return, and where each account stopped */
  const sessionsKept = raw.sessions.filter((s) => real(s.u) && !isTraining(s.hunt_id));
  out.time = { how: 'a visit = presses a player made with no gap over ' + SESSION_GAP_MIN + ' minutes; a visit with one press counts one minute, so visit length is a floor',
    accounts: realAccounts.map((a) => { const ms = raw.presses.filter((p) => p.u === a.u).map((p) => Date.parse(p.m + ':00Z') / 60000).sort((x, y) => x - y);
      const visits = []; for (const m of ms) { const last = visits[visits.length - 1]; if (last && m - last[1] <= SESSION_GAP_MIN) last[1] = m; else visits.push([m, m]); }
      const lens = visits.map((s) => s[1] - s[0] + 1); const gaps = visits.slice(1).map((s, i) => (s[0] - visits[i][1]) / 60);
      const days = [...new Set(ms.map((m) => Math.floor(m / 1440)))].sort((x, y) => x - y); const d0 = days[0];
      const huntDays = raw.days.filter((d) => d.u === a.u && d.kind === 'combat' && !d.training); const span = days.length ? readDay - d0 + 1 : 0;
      const hh = huntHoursOf(a.u); const nh = Math.max(1, acctHeroes(a.u).filter((h) => h.hunt_ms > 0).length);
      const last = raw.last_presses.filter((p) => p.u === a.u).map((p) => p.kind + ':' + p.verb + (p.verb === 'set_activity' || p.verb === 'unlock_buy' || p.verb === 'training_start' ? ':' + p.what : ''));
      return { account: a.label, days_since_first_press: span, days_with_a_press: days.length, came_back_day_2: days.includes(d0 + 1), came_back_day_7_or_later: days.some((d) => d >= d0 + 6),
        days_since_last_press: days.length ? readDay - days[days.length - 1] : null, visits: visits.length, visits_per_day_played: days.length ? r1(visits.length / days.length) : null,
        visit_minutes_median: lens.length ? median(lens) : null, visit_minutes_mean: lens.length ? r0(sum(lens) / lens.length) : null, press_minutes_total_h: r1(sum(lens) / 60),
        away_hours_median: gaps.length ? r1(median(gaps)) : null, away_hours_max: gaps.length ? r1(Math.max(...gaps)) : null,
        hunted_hero_hours: r0(hh), hunted_hours_a_hero_a_day_played: days.length ? r1(hh / nh / days.length) : null, hunted_hours_a_hero_a_calendar_day: span ? r1(hh / nh / span) : null,
        days_with_a_hunt: new Set(huntDays.map((d) => d.d)).size, hunt_hours_per_press_hour: sum(lens) ? r1(hh / (sum(lens) / 60)) : null, last_presses: last }; }).sort((a, b) => (a.account < b.account ? -1 : 1)),
    sessions_kept: { hunts: sessionsKept.length, median_hours: sessionsKept.length ? r1(median(sessionsKept.map((s) => N(s.paid_ms) / 3600000))) : null,
      ends: Object.entries(sessionsKept.reduce((m, s) => { m[s.end_reason || 'open'] = (m[s.end_reason || 'open'] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]),
      tiers: Object.entries(sessionsKept.reduce((m, s) => { const k = (s.tier || 'not recorded') + (N(s.seats) > 1 ? ', party' : ', alone'); m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]),
      after_choice: Object.entries(sessionsKept.reduce((m, s) => { m[s.after_choice || 'none'] = (m[s.after_choice || 'none'] || 0) + 1; return m; }, {})),
      store_gold_h_by_tier: group(sessionsKept.filter((s) => N(s.paid_ms) > 0), (s) => (s.tier || 'not recorded') + (N(s.seats) > 1 ? ', party' : ', alone'), (s) => ({ k: (s.tier || 'not recorded') + (N(s.seats) > 1 ? ', party' : ', alone'), ms: 0, g: 0, c: 0, d: 0, t: 0 }),
        (t, s) => { t.ms += N(s.paid_ms); t.g += N(s.supply_gold); t.c += N(s.coins); t.d += N(s.deaths); t.t += N(s.taken); })
        .map((t) => ({ tier: t.k, hero_hours: r1(H(t.ms)), store_gold_h: r0(t.g / H(t.ms)), coin_h: r0(t.c / H(t.ms)), damage_taken_h: r0(t.t / H(t.ms)), deaths: t.d })) } };
  const realDays = raw.days.filter((d) => real(d.u));
  out.hero_hours_total = { hunting: r0(sum(realDays.filter((d) => d.kind === 'combat' && !d.training), (d) => H(d.ms))), training: r0(sum(realDays.filter((d) => d.kind === 'combat' && d.training), (d) => H(d.ms))),
    gathering: r0(sum(realDays.filter((d) => d.kind === 'gather'), (d) => H(d.ms))), crafting: r0(sum(realDays.filter((d) => d.kind === 'craft'), (d) => H(d.ms))),
    hero_life_hours: r0(sum(realHeroes, (h) => (readDay - dayNo(h.created) + 1) * 24)) };
  return out;
}

/** What in `agg` could name an account, a hero, a session or a clock time. Empty = anonymous. `rawIds` = the ids the raw rows held. */
export function anonymityProblems(agg, rawIds = []) {
  const text = JSON.stringify(agg); const bad = [];
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text)) bad.push('a uuid');
  if (/\d{2}:\d{2}/.test(text)) bad.push('a clock time');
  if (/\d{4}-\d{2}-\d{2}T/.test(text)) bad.push('a timestamp');
  for (const id of rawIds) { const s = String(id); if (s.length >= 8 && text.includes(s.slice(0, 8))) bad.push('an account key (' + s.slice(0, 2) + '…)'); }
  if (/"(name|display_name|user_id|session_id|u|sid|note)"\s*:/.test(text)) bad.push('an id, name or note field');
  return bad;
}

/* ── THE GAME'S OWN DATA (the aggregate reads Levels, skills, items and the simulator's lines from the repo, never from memory) ─ */
async function loadGame() {
  const imp = (p) => import('../../' + p);
  const [{ charLevelFromXp, skillLevelFromXp }, { contractXpPerH }, { ITEMS }, { MONSTERS }, { wornRoleKey }] = await Promise.all([
    imp('src/core/xp.js'), imp('src/data/balance-sheet.js'), imp('src/data/items.js'), imp('src/data/monsters.js'), imp('src/data/hunt-roles.js')]);
  const lines = JSON.parse(readFileSync(join(ROOT, 'tools', 'balance-sim', 'skill-lines.json'), 'utf8')).lines;
  const pace = JSON.parse(readFileSync(join(ROOT, 'tools', 'balance-sim', 'level-pace.json'), 'utf8')).measuredHours;
  const rank = ['common', 'uncommon', 'scarce', 'key', 'rare', 'trophy'];
  const best = new Map();
  for (const m of Object.values(MONSTERS)) for (const d of (m && m.drops) || []) if (d.band && (!best.has(d.id) || rank.indexOf(d.band) > rank.indexOf(best.get(d.id)))) best.set(d.id, d.band);
  const STYLE = { shield: 'tank', sword: 'sword', hammer: 'hammer', club: 'hammer', axe: 'axes', dual_axe: 'axes', neutral: 'hammer', bow: 'bow', ranged: 'bow', crossbow: 'crossbow', wand: 'mage', staff: 'healer' };
  return { charLevelFromXp, skillLevelFromXp, contractXpPerH, ITEMS,
    bandOfItem: (id) => best.get(id) || null,
    allRows: (monster) => ((MONSTERS[monster] || {}).drops || []).filter((d) => d && d.id && d.ch),
    dropRows: (monster) => ((MONSTERS[monster] || {}).drops || []).filter((d) => d.band === 'rare' || d.band === 'trophy'),
    roleOfWorn: (worn) => wornRoleKey(worn, ITEMS),
    skillLine: (mode, role, main, level) => { const style = STYLE[role] || (main === 'magic' ? 'mage' : main === 'ranged' ? 'bow' : 'hammer'); const set = lines[mode] || lines.alone;
      const l = set[style] || set[{ sword: 'hammer', axes: 'hammer', crossbow: 'bow' }[style]] || set.hammer; if (!l) return null;
      const i = Math.min(l.to, Math.max(l.from, level)) - l.from; return { mode, style, main: l.skills[main][i], defense: l.skills.defense[i] }; },
    paceHours: (L) => (pace[L] === undefined ? null : pace[L]) };
}

/* ── PRINT ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */
function table(title, rows, cols) {
  if (!rows || !rows.length) return console.log('\n### ' + title + '\n(none)');
  const ks = cols || Object.keys(rows[0]);
  const cell = (v) => (v === null || v === undefined ? '-' : typeof v === 'object' ? JSON.stringify(v) : String(v));
  console.log('\n### ' + title + '\n| ' + ks.join(' | ') + ' |\n|' + ks.map(() => '---').join('|') + '|');
  for (const r of rows) console.log('| ' + ks.map((k) => cell(r[k])).join(' | ') + ' |');
}
function print(a) {
  console.log('REAL PLAYERS, read ' + a.read_day + ' · journal from ' + a.ledger_from + ', ' + a.ledger_rows + ' rows · ' + a.sessions_kept + ' hunt sessions kept');
  console.log(JSON.stringify(a.population.real) + ' real · ' + JSON.stringify(a.population.test) + ' test · ' + a.population.profiles_with_no_hero + ' profiles never made a hero');
  table('accounts', a.population.accounts);
  table('heroes', a.heroes.map((h) => ({ ...h, share_of_life: JSON.stringify(h.share_of_life), hours_to_level: undefined, skills_at_level: undefined })),
    ['hero', 'account', 'level', 'way', 'main_skill', 'main', 'defense', 'inner_flame', 'sim_line', 'hunted_h', 'party_share', 'training_h', 'gathering_h', 'crafting_h', 'share_of_life', 'deaths', 'level_xp_rebuilt_gap']);
  table('hours hunted to each Level (real heroes)', a.pace);
  table('each hero: hours to Level', a.heroes.filter((h) => h.cls === 'real').map((h) => ({ hero: h.hero, ...h.hours_to_level })), ['hero', ...PACE_LEVELS.map(String)]);
  table('each hero: skills at Level (main/defense, sim main/defense)', a.heroes.filter((h) => h.cls === 'real').map((h) => ({ hero: h.hero, way: h.way,
    ...Object.fromEntries(Object.entries(h.skills_at_level).map(([L, s]) => [L, s.main + '/' + s.defense + ' (' + s.sim_main + '/' + s.sim_defense + ')'])) })), ['hero', 'way', ...SKILL_LEVELS.map(String)]);
  table('Level XP an hour by Level band and party size (real)', a.xp_by_band_party);
  table('by ground, tier, alone or party (real)', a.xp_by_ground);
  table('by ground (test accounts)', a.xp_by_ground_test);
  table('party size', a.party.real_hunt_hours_by_size); console.log(JSON.stringify({ ...a.party, real_hunt_hours_by_size: undefined }));
  table('by heroes on the account', a.by_account_size); table('by way', a.by_way);
  console.log('\n### deaths\n' + JSON.stringify(a.deaths));
  for (const cls of ['real', 'test']) { const g = a.gold[cls]; console.log('\n### gold, ' + cls + ': ' + JSON.stringify({ ...g, rows: undefined, store_supplies_by_kind: undefined })); table('gold rows, ' + cls, g.rows); }
  table('store supplies by kind (real)', a.gold.real.store_supplies_by_kind); table('gold by account', a.gold.by_account); table('purse over account age', a.purse_curve); table('coin by Level band', a.coin_by_band);
  table('drops by ground', a.drops_by_ground); console.log('\n### rares\n' + JSON.stringify({ ...a.rares, rows: undefined })); table('rare and trophy rows', a.rares.rows);
  console.log('\n### what players do with gear\n' + JSON.stringify(a.gear_use));
  table('systems', a.systems, ['system', 'real_uses', 'real_accounts', 'real_people', 'test_uses', 'days_since_last_real_use', 'rows_any_account', 'detail']); console.log('\n### house\n' + JSON.stringify(a.house) + '\n### tower\n' + JSON.stringify(a.tower));
  table('crafting by recipe', a.crafting); table('gathering by node', a.gathering); table('town hours by skill', a.town_hours_by_skill);
  console.log('\n### training\n' + JSON.stringify(a.training) + '\n### refusals\n' + JSON.stringify(a.refusals));
  table('time by account', a.time.accounts.map((t) => ({ ...t, last_presses: t.last_presses.join(' < ') }))); console.log(JSON.stringify(a.time.sessions_kept));
  console.log('\n### hero hours\n' + JSON.stringify(a.hero_hours_total));
}

/* ── SELFTEST ───────────────────────────────────────────────────────────────────────────────────────────────────────── */
async function selftest() {
  const fails = []; const ok = (cond, what) => { if (!cond) fails.push(what); };
  /* 1. the gate refuses every write and passes every read this tool makes */
  const WRITES = ["update account_wallet set gold = 1", "select 1; delete from player_ledger", "insert into player_ledger default values",
    "with x as (delete from player_ledger returning 1) select * from x", "select * into t2 from player_ledger", "select set_config('transaction_read_only', 'off', false)",
    "commit; update account_wallet set gold = 1", "select nextval('player_ledger_id_seq')", "drop table player_ledger", "truncate hunt_sessions",
    "create table t as select 1", "do $$ begin perform 1; end $$", "call hr_apply()", "select 1 /* x */; update player_state set hp = 1", "grant all on player_ledger to anon",
    "alter table player_ledger disable trigger all", "copy player_ledger to stdout", "select pg_advisory_lock(1)", "explain analyze delete from player_ledger"];
  for (const w of WRITES) ok(writeProblem(w) !== null, 'the gate let a write through: ' + w);
  for (const [name, sql] of Object.entries(READS)) ok(writeProblem(sql) === null, 'the gate refuses this tool\'s own read "' + name + '": ' + writeProblem(sql));
  ok(writeProblem("select 'update; delete' x from player_ledger") === null, 'a write word inside a string literal is refused');
  /* 2. a refused statement never reaches the network; an allowed one goes out read-only */
  const TOKEN = 'sbp_selftest_0123456789abcdef'; const sent = [];
  const q = makeQuery({ token: TOKEN, fetchImpl: async (url, init) => { sent.push({ url, init }); return { ok: true, json: async () => [{ one: 1 }] }; } });
  let threw = ''; try { await q('update account_wallet set gold = 1'); } catch (e) { threw = e.message; }
  ok(/refused/.test(threw) && sent.length === 0, 'a write reached the network');
  await q('select 1 one');
  const body = sent.length ? JSON.parse(sent[0].init.body) : {};
  ok(sent.length === 1 && body.read_only === true && /^begin read only; /.test(body.query), 'a read went out without `begin read only` and read_only:true');
  ok(sent.length === 1 && !sent[0].url.includes(TOKEN) && !sent[0].init.body.includes(TOKEN), 'the token rides in the url or the body');
  /* 3. the token is never printed: an error that echoes it comes back scrubbed, and nothing this file logs can hold it */
  const leaky = makeQuery({ token: TOKEN, fetchImpl: async () => ({ ok: false, text: async () => 'bad jwt ' + TOKEN + ' rejected' }) });
  let msg = ''; try { await leaky('select 1'); } catch (e) { msg = e.message; }
  ok(msg && !msg.includes(TOKEN) && msg.includes('[token]'), 'a failed read printed the token');
  const thrower = makeQuery({ token: TOKEN, fetchImpl: async () => { throw new Error('connect failed for Bearer ' + TOKEN); } });
  msg = ''; try { await thrower('select 1'); } catch (e) { msg = e.message; }
  ok(msg && !msg.includes(TOKEN), 'a network error printed the token');
  const src = readFileSync(fileURLToPath(import.meta.url), 'utf8');
  const main = src.slice(src.indexOf('/* ── MAIN'));
  ok((src.match(/\.supabase-token/g) || []).length === 4, 'the token file is named somewhere new (expected: the header, these two checks, the one read)');
  ok(/const q = makeQuery\(\{ token: readFileSync\(join\(homedir\(\), '\.supabase-token'\), 'utf8'\)\.trim\(\) \}\);/.test(main), 'the token is held in a variable outside makeQuery');
  ok(!/process\.argv[^\n]*token|token[^\n]*process\.argv/i.test(main) && !/writeFileSync\([^\n]*token/i.test(src.replace(/ok\([^\n]*\n/g, '')), 'the token can reach argv or a file');
  /* 4. the aggregate is anonymous, and each planted leak is caught */
  const game = await loadGame();
  const U1 = '11111111-2222-4333-8444-555555555555', U2 = '99999999-aaaa-4bbb-8ccc-dddddddddddd', U3 = 'abcdef12-aaaa-4bbb-8ccc-dddddddddddd';
  const raw = fixture(U1, U2, U3);
  const agg = aggregate(raw, game);
  ok(anonymityProblems(agg, [U1, U2, U3]).length === 0, 'the fixture aggregate is not anonymous: ' + anonymityProblems(agg, [U1, U2, U3]).join(', '));
  ok(agg.population.real.accounts === 2 && agg.population.real.people === 1 && agg.population.test.accounts === 1, 'real / test / one-person classification is off: ' + JSON.stringify(agg.population.real));
  ok(agg.heroes.find((h) => h.cls === 'real').hunted_h === 2 && agg.gold.real.gold_in === 900 && agg.gold.real.gold_out === 300, 'the fixture\'s hours or gold do not add up: ' + JSON.stringify([agg.heroes[0].hunted_h, agg.gold.real.gold_in, agg.gold.real.gold_out]));
  ok(agg.gold.test.gold_in === 5000 && !agg.gold.real.rows.some((r) => r.gold === 5000), 'a test account\'s gold is counted as a real player\'s');
  const LEAKS = [['an account id', (a) => { a.population.accounts[0].account = U1; }], ['an account key prefix', (a) => { a.heroes[0].hero = U2.slice(0, 8); }],
    ['a clock time', (a) => { a.read_day = '2026-11-19 14:46'; }], ['a timestamp', (a) => { a.time.accounts[0].first = '2026-11-19T'; }], ['a name field', (a) => { a.heroes[0].name = 'x'; }],
    ['a note field', (a) => { a.population.accounts[0].note = 'x'; }]];
  for (const [what, plant] of LEAKS) { const a = JSON.parse(JSON.stringify(agg)); plant(a); ok(anonymityProblems(a, [U1, U2, U3]).length > 0, 'a planted leak passed: ' + what); }
  if (fails.length) { console.error('real-players --selftest: RED\n  ' + fails.join('\n  ')); process.exit(1); }
  console.log('real-players --selftest: green (' + WRITES.length + ' writes refused, ' + Object.keys(READS).length + ' reads pass the gate, the token scrubbed from 2 failures, ' + LEAKS.length + ' planted leaks caught)');
}
/* two real accounts of one person and one QA account, two hours hunted */
function fixture(U1, U2, U3) {
  const combat = (u, b, lx, g) => ({ u, slot: 0, mon: 'mill_cellar', b, party: 1, accts: 1, tier: 'normal', scaled: false, ms: 3600000, kills: 100, g, lx, melee: 500, ranged: 0, magic: 0, defense: 100, inner_flame: 0 });
  const verb = (u, kind, verb, d, gin, gout, extra = {}) => ({ u, kind, verb, fam: null, xfer: false, via: '', d, n: 1, heroes: 1, gin, gout, ...extra });
  return { meta: [{ read_at: '2026-11-20 03:40:00', profiles: 5, ledger_rows: 10, ledger_from: '2026-10-19', sessions_kept: 0 }],
    accounts: [{ u: U1, created: '2026-11-01', note: 'Sam, tester', gm: false, gold: 600, gems: 0 }, { u: U2, created: '2026-11-05', note: 'Sam, second account', gm: false, gold: 0, gems: 0 },
      { u: U3, created: '2026-10-19', note: 'QA account (play gate)', gm: false, gold: 5000, gems: 0 }],
    heroes: [U1, U2, U3].map((u) => ({ u, slot: 0, level_xp: u === U1 ? 20000 : 0, created: '2026-11-01', premium: false, skills: { melee: 1000, defense: 200 }, worn: {} })),
    combat: [combat(U1, '2026-11-01T10:00', 10000, 400), combat(U1, '2026-11-01T11:00', 10000, 500), combat(U3, '2026-11-01T10:00', 10000, 5000)],
    kills: [{ u: U1, mon: 'mill_cellar', monster: 'rat', n: 200 }], loot: [{ u: U1, mon: 'mill_cellar', item: 'bones', qty: 40 }], deaths: [],
    verbs: [verb(U1, 'combat', 'accrue', '2026-11-01', 900, 0), verb(U1, 'hunt', 'supply_buy', '2026-11-01', 0, 300), verb(U3, 'combat', 'accrue', '2026-11-01', 5000, 0)],
    supplies: [{ u: U1, item: 'plain_fire_rune', qty: 30, gold: 300 }], supplies_own: [], vendor: [], equips: [], bank_moves: [], dispatch: [], rules: [], holdings: [], rare_notices: [],
    town: [], days: [{ u: U1, slot: 0, d: '2026-11-01', kind: 'combat', training: false, ms: 7200000 }], presses: [{ u: U1, m: '2026-11-01T10:00', n: 1 }, { u: U1, m: '2026-11-01T10:05', n: 2 }],
    last_presses: [{ u: U1, kind: 'hunt', verb: 'hunt_pack', what: '', at: '2026-11-01 10:05:00' }], sessions: [], systems: [{ j: {} }] };
}

/* ── MAIN ───────────────────────────────────────────────────────────────────────────────────────────────────────────── */
if (ARGS.includes('--selftest')) await selftest();
else {
  let raw;
  if (ARGS.includes('--from-raw')) raw = JSON.parse(readFileSync(join(OUT, 'raw.json'), 'utf8'));
  else {
    const q = makeQuery({ token: readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim() });
    raw = {};
    for (const [name, sql] of Object.entries(READS)) { try { raw[name] = await q(sql); } catch (e) { console.error('read "' + name + '" failed: ' + e.message); process.exit(2); } process.stderr.write(name + ' ' + raw[name].length + '  '); }
    process.stderr.write('\n');
    if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
    writeFileSync(join(OUT, 'raw.json'), JSON.stringify(raw));
  }
  const agg = aggregate(raw, await loadGame());
  const leaks = anonymityProblems(agg, raw.accounts.map((a) => a.u));
  if (leaks.length) { console.error('the aggregate is not anonymous (' + leaks.join(', ') + '): nothing written'); process.exit(1); }
  if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, 'aggregate.json'), JSON.stringify(agg, null, 1));
  if (ARGS.includes('--json')) console.log(JSON.stringify(agg)); else print(agg);
}
