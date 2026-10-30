#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-plan-cache.mjs — WRITES supabase/migrations/2027-02-10-settle-plan-cache.generated.sql
// (lane/c-settle-cost-2, backend-architect, 2026-10-30). An AUTHORING tool (tools/build-settle-hooks.mjs's pattern):
// the file it writes is a literal, self-describing migration — whole function bodies, nothing patched at apply time —
// reviewed as SQL; this tool exists so every restated body is the body the chain really runs, byte for byte, and so
// the §0 pins are measured rather than typed.
//
//   node tools/gen-plan-cache.mjs          (re)write the file
//   node tools/gen-plan-cache.mjs --check  exit 1 if the file is not what it would write
//
// WHAT IT DOES TO EACH FUNCTION IN `FNS`: nothing but its language. A `LANGUAGE sql` function with a `SET` clause is
// never inlined, and PostgreSQL 17 (production) parses, rewrites and plans its body again for EVERY statement
// execution that calls it (18 caches it; PGlite is 18, so the replay never showed it). The same body inside
// `LANGUAGE plpgsql` is planned once per backend and kept. The restated body is
//     #variable_conflict use_column            -- a name that is both a column and a parameter means the column,
//                                              -- the SQL-function rule
//     begin return (select hr_q.v from ( <the SQL body, verbatim> ) as hr_q(v) limit 1); end
// i.e. the first row of the body's one column, or NULL with none — a scalar SQL function's own contract — so no
// input can make the plpgsql copy answer or raise differently. Signature, return type, volatility, SECURITY DEFINER,
// STRICT, PARALLEL, COST and every SET clause are kept from the pre-image; CREATE OR REPLACE keeps the owner and grants.
//
// WHICH FUNCTIONS. Every STABLE, scalar (not set-returning), single-statement `LANGUAGE sql` function a watched 4-hero
// settle calls 7 or more times (tools/settle-cost.mjs --pg --door=viewed, 2026-10-30), except
//   · hr_char_xp_for_level  owned by tools/gen-level-curve.mjs (a future curve file would restate it as SQL again:
//                           that generator is where its language moves, handed off);
//   · hr_hunt_role_of, hr_role_view  restated by hand in 2027-02-10-settle-reads.sql (their weapon lookup is hoisted
//                           out of a per-row filter there, beside the conversion);
//   · hr_depot_view         2027-01-12-market-account.sql md5-pins it, and tests/market-v2.mjs M0 re-applies that file
//                           over the whole chain: a later restatement would make its pin refuse (5 calls a settle);
//   · hr_hunt_member_read, hr_shop_view  a full-chain mutant patches each in its own file (tests/settle-hooks.mjs
//                           H-COVER in 2026-11-07-store-by-slot.sql; tests/alpha-server.mjs's shop arms in
//                           2026-11-25-shop-seeds.sql): this file's pin would refuse the mutated pre-image before the
//                           guard's arm could name the defect;
//   · hr_premium_until, hr_premium_active, hr_premium_view  tests/hunt-sessions-settle.mjs BETA re-applies
//                           2026-12-17-beta-premium.sql at chain end and requires their definitions unmoved.
// Rule for the next conversion: a body a full-chain mutant patches, or a chain-end re-apply restates or pins, stays
// where it is (or that guard moves its re-apply to the file's own chain position first).
// The self-check (§2) proves every converted function answers exactly what its SQL pre-image answers, as text, over
// probe inputs drawn from the database it is applied to (every character on production).
//
// PASS 2 (lane/c-envelope-diff, 2026-10-30) WRITES supabase/migrations/2027-02-11-settle-plan-cache-2.generated.sql:
// the rest of the class. Pass 1 took STABLE scalar helpers called 7+ times a settle; a watched 4-hero settle on the
// PostgreSQL 17 replay still spent ~32 % of its DB time in LANGUAGE sql bodies re-planned per call: IMMUTABLE ones
// (hr_jsonb_add, 303 calls a settle; hr_hunt_tally_add), SET-RETURNING ones (hr_unlock_levels, 0.9 ms a call), the
// sections called once an envelope (hr_depot_view, hr_premium_view), and two pass 1 had to leave:
//   · hr_premium_until/active/view: tests/hunt-sessions-settle.mjs BETA now re-applies 2026-12-17-beta-premium.sql at
//     that file's own chain position (market-v2 M0's move), so a later restatement no longer reads as "a second apply
//     moved them";
//   · hr_depot_view: market-v2 M0 re-applies at its own position and leaves a body a later file restates to that file;
//   · hr_char_xp_for_level: restated here; the NEXT curve file tools/gen-level-curve.mjs writes must emit it as
//     plpgsql too (tests/settle-budget.mjs SB-3 goes red on a SQL copy, naming the generator).
// A set-returning body becomes `return query <body>` (rows compared as a multiset: a SQL function's row order is no
// contract). Still left, each for a guard that cannot move here: hr_hunt_member_read, hr_shop_view (full-chain
// mutants patch them in their own files, see above). Volatile SQL (hr_admitted, an RLS predicate) is not this class.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from '../tests/_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const FILE = '2027-02-10-settle-plan-cache.generated.sql';
const OUT = join(ROOT, 'supabase', 'migrations', FILE);

/* Sorted. See the header for how the list was drawn. */
export const FNS = [
  'hr_account_property_tier', 'hr_account_view', 'hr_bag_rules_view', 'hr_bench_run_view', 'hr_blessing_price',
  'hr_blessings_view', 'hr_character_name', 'hr_character_name_view', 'hr_death_log_view', 'hr_depot_cap',
  'hr_dungeon_cooldowns', 'hr_farm_plot_cap', 'hr_farm_plot_level', 'hr_flag_on', 'hr_gem_unlocks_of',
  'hr_hero_slots_of', 'hr_home_view', 'hr_hunt_analyzer_view', 'hr_hunt_bests_view', 'hr_hunt_density_view',
  'hr_hunt_limit', 'hr_hunt_party_of', 'hr_hunt_presets_view', 'hr_hunt_role_default',
  'hr_hunt_setup_view', 'hr_hunt_supply_of', 'hr_hunt_view', 'hr_hunt_weapon_of', 'hr_level_block', 'hr_level_from_xp',
  'hr_level_of', 'hr_login_view', 'hr_max_hp', 'hr_max_mana', 'hr_monster_level', 'hr_outfit_owned', 'hr_party_away',
  'hr_party_invites_view', 'hr_party_seek_view',
  'hr_recipes_of', 'hr_regen_permille', 'hr_renown_of', 'hr_seed', 'hr_skill_level',
  'hr_social_party_view', 'hr_stamina_cap', 'hr_storage_room_used', 'hr_tally_section', 'hr_total_level', 'hr_vitals_of',
];

/* THE PROBES (§2): per argument type, a set of values drawn from the database the file is applied to. A (uuid, integer)
   leading pair is one character (every player_state row, and a hero that does not exist). */
const ZERO = `'00000000-0000-0000-0000-000000000000'::uuid`;
const SETS = {
  who: `select user_id, slot from public.player_state union all select ${ZERO}, 0`,
  uuid: `select x from (select user_id from public.player_state union select id from (select id from public.hunt_sessions order by entered_at desc limit 200) s
           union select ${ZERO}) t(x)`,
  integer: `select x from unnest(array[null, -1, 0, 1, 2, 3, 4, 5, 9, 10, 15, 20, 30, 45, 50, 60, 75, 99, 100, 120, 150, 1000]::int[]) x`,
  bigint: `select x from (select unnest(array[null, -5, 0, 1, 50, 83, 100, 1000, 5000, 13363, 123456, 1210421, 13034431, 200000000]::bigint[])
           union select level_xp from public.player_state) t(x)`,
  text: `select x from (select key from public.hr_hunt_limits union select key from public.hr_flags union select skill_id from public.hr_skills
           union select activity_id from (select activity_id from public.hr_activities where kind = 'combat' order by activity_id limit 60) a
           union select unnest(array[null, '', 'nope', 'melee', 'ranger', 'mage', 'healer', 'tank', 'accrue:probe'])) t(x)`,
  'timestamp with time zone': `select x from unnest(array[now(), now() - interval '1 day', now() + interval '1 day', null]::timestamptz[]) x`,
  'text[]': `select x::text[] from unnest(array[null, '{}', '{melee}', '{ranger}', '{mage,healer}', '{melee,ranger,mage,healer}', '{healer,healer}']) x`,
  hunt_sessions: `select h from public.hunt_sessions h order by h.entered_at desc limit 100`,
};

/* PASS 2: the file, its functions (sorted) and the probe sets its argument types need beyond SETS. */
export const FILE2 = '2027-02-11-settle-plan-cache-2.generated.sql';
const OUT2 = join(ROOT, 'supabase', 'migrations', FILE2);
export const FNS2 = [
  'hr_bestiary_of', 'hr_char_xp_for_level', 'hr_collection_of', 'hr_depot_view', 'hr_frame_topic', 'hr_gold_kind',
  'hr_hunt_analyzer_basic', 'hr_hunt_open_of', 'hr_hunt_tally_add', 'hr_hunt_tally_ok', 'hr_jsonb_add', 'hr_premium_active',
  'hr_premium_until', 'hr_premium_view', 'hr_skill_inputs_view', 'hr_trophy_of', 'hr_unlock_levels', 'hr_utc_day_start',
];
/* Flat {key: number} maps (a tally's xp / raw_xp / loot / supplies / bought) and the analyzer's nested ones (dealt /
   taken / healed: {total, byX: {key: number}}), the shapes the settle hands these helpers: literals at the edges, and
   the six newest sessions' own tallies. Every input is one both images take without raising. */
const FLAT = `select x from (select unnest(array[null, '{}', '{"a":1}', '{"a":1.5,"b":-2}', '{"a":0,"b":0.25}', '{"level":120,"melee":33,"defense":4}',
           '{"a":12345678901234567890}', '{"cooked_shrimp":3,"bronze_arrow":250}']::jsonb[])
           union select v.x from (select t.* from public.hunt_session_tally t order by t.session_id desc limit 6) t
           cross join lateral (values (t.xp), (t.raw_xp), (t.loot), (t.supplies), (t.bought)) v(x)) s(x)`;
const NESTED = `select x from (select unnest(array[null, '{}', '{"a":1}', '{"total":3}', '{"total":3,"byMonster":{"rat":2}}',
           '{"total":1,"byMonster":{"rat":1,"bat":4},"byElement":{"fire":2}}', '{"total":5,"byAbility":{"slash":5},"byElement":{"physical":5}}',
           '{"bySource":{"cooked_shrimp":7}}', '{"total":2,"byMonster":{"rat":1}}', '{"zzz":1}', '{"a":{"b":1}}']::jsonb[])
           union select v.x from (select t.* from public.hunt_session_tally t order by t.session_id desc limit 6) t
           cross join lateral (values (t.dealt), (t.taken), (t.healed)) v(x)) s(x)`;
const PROBE2 = {
  hr_jsonb_add: [FLAT, FLAT],
  hr_hunt_tally_add: [NESTED, NESTED],
  hr_hunt_tally_ok: [NESTED, `select x::text[] from unnest(array[null, '{}', '{byAbility,byElement}', '{byMonster,byElement}', '{bySource}', '{total}']) x`],
  /* every character's own analyzer (premium's full shape) and the edges basic must survive */
  hr_hunt_analyzer_basic: [`select x from (select public.hr_hunt_analyzer_of(user_id, slot, null) from public.player_state
           union select unnest(array[null, '{}', '[]', '7', '{"session":{"id":"s"}}', '{"hero":{"per_hour":5}}',
             '{"hero":{"per_hour":{"xp":1,"gold":2,"balance":3,"kills":4}},"wall_ms":9}']::jsonb[])) s(x)`],
  /* every branch of the ledger's gold kinds, the escaped `_` included */
  hr_gold_kind: [`select x from unnest(array[null, 'wallet', 'hero_slot', 'farm', 'shop', 'clan', 'trade', 'trait', 'accrue', 'worker', 'gather',
             'craft', 'combat', 'hunt', 'x']) x`,
    `select x from unnest(array[null, 'tally_pay:1', 'tallyXpay:1', 'supply_buy', 'vendor_cover', 'loot_sell', 'stamina_refill:1', 'stamina_refillX1',
             'blessing_buy:2', 'hero_rename:3', 'storage_chest:4', 'farm_plant', 'vendor_sell', 'vendor_sell_many', 'create_character', 'x']) x`,
    `select x from unnest(array[null, ${ZERO}]) x`],
};

const md5 = (s) => createHash('md5').update(s.replace(/\r/g, ''), 'utf8').digest('hex');

/** `sql` with its comments, string literals, quoted identifiers and dollar-quoted strings blanked: what is left is
    the statement structure, so a `;` there separates statements. */
export function sqlSkeleton(sql) {
  let out = ''; let i = 0;
  const blank = (to) => { out += ' '.repeat(to - i); i = to; };
  while (i < sql.length) {
    const c = sql[i]; const two = sql.slice(i, i + 2);
    if (two === '--') { const e = sql.indexOf('\n', i); blank(e < 0 ? sql.length : e); continue; }
    if (two === '/*') { const e = sql.indexOf('*/', i + 2); blank(e < 0 ? sql.length : e + 2); continue; }
    if (c === "'" || c === '"') {
      let j = i + 1;
      for (;;) { const k = sql.indexOf(c, j); if (k < 0) { j = sql.length; break; } if (sql[k + 1] === c) { j = k + 2; continue; } j = k + 1; break; }
      blank(j); continue;
    }
    const m = c === '$' ? /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i)) : null;
    if (m) { const e = sql.indexOf(m[0], i + m[0].length); blank(e < 0 ? sql.length : e + m[0].length); continue; }
    out += c; i++;
  }
  return out;
}

/** The one statement of a SQL body, its own closing `;` dropped (a second statement throws). */
function oneStatement(sqlBody) {
  let body = sqlBody.replace(/\r/g, '');
  /* the one statement's own closing `;` (a comment may follow it) is dropped; any other `;` is a second statement */
  const sk = sqlSkeleton(body);
  const last = sk.trimEnd().length - 1;
  if (last >= 0 && sk[last] === ';') body = body.slice(0, last) + body.slice(last + 1);
  if (sqlSkeleton(body).includes(';')) throw new Error('a body with more than one statement cannot be restated this way');
  return body.replace(/\s+$/, '');
}

/** The plpgsql body for a scalar SQL body (see the header). `file` names the migration in its first line. */
export function plpgsqlBody(sqlBody, file = FILE) {
  const body = oneStatement(sqlBody);
  /* a trailing line comment would swallow the closing parenthesis: the body ends on its own line, so it cannot */
  return `\n-- PLAN-CACHE (${file}): the SQL body below, verbatim, planned once per backend.\n#variable_conflict use_column\n`
    + `begin\n  return (select hr_q.v from (\n${body}\n  ) as hr_q(v) limit 1);\nend\n`;
}

/** The plpgsql body for a SET-RETURNING SQL body (pass 2): its rows, `return query`, the body verbatim. A RETURNS TABLE
    column is a plpgsql variable; `use_column` makes every name that is also a column the column, the SQL rule. */
export function plpgsqlSetBody(sqlBody, file = FILE2) {
  const body = oneStatement(sqlBody);
  return `\n-- PLAN-CACHE (${file}): the SQL body below, verbatim, planned once per backend.\n#variable_conflict use_column\n`
    + `begin\n  return query\n${body}\n  ;\nend\n`;
}

/** A dollar tag that does not occur in `text`. */
function tagFor(text, base) { let t = base; let i = 0; while (text.includes(`$${t}$`)) t = base + (++i); return `$${t}$`; }

/** The CREATE statement for one function with `language` and `body` (the pre-image's every other property kept). */
function createSql(f, language, body, schemaName = 'public', name = f.proname) {
  const tag = tagFor(body, language === 'plpgsql' ? 'plc' : 'sqlpre');
  const parts = [`create or replace function ${schemaName}.${name}(${f.args})`, ` returns ${f.result}`, ` language ${language}`,
    ` ${({ i: 'immutable', s: 'stable', v: 'volatile' })[f.provolatile]}`];
  if (f.prosecdef) parts.push(' security definer');
  if (f.proisstrict) parts.push(' strict');
  if (f.proleakproof) parts.push(' leakproof');
  parts.push(` parallel ${({ s: 'safe', r: 'restricted', u: 'unsafe' })[f.proparallel]}`);
  parts.push(` cost ${Number(f.procost)}`);
  if (f.proretset) parts.push(` rows ${Number(f.prorows)}`);
  for (const c of f.proconfig || []) { const i = c.indexOf('='); parts.push(` set ${c.slice(0, i)} = ${c.slice(i + 1)}`); }
  return parts.join('\n') + `\nas ${tag}${body}${tag}`;
}

/** The probe query that counts the inputs on which public.<fn> and its pg_temp pre-image copy answer differently. */
function probeSql(f) {
  const types = f.argtypes;
  const from = []; const args = [];
  let i = 0;
  if (types[0] === 'uuid' && types[1] === 'integer') { from.push(`(${SETS.who}) w(a1, a2)`); args.push('w.a1', 'w.a2'); i = 2; }
  for (; i < types.length; i++) {
    const set = SETS[types[i]];
    if (!set) throw new Error(`${f.proname}: no probe set for argument type ${types[i]}`);
    from.push(`(${set}) p${i}(x)`); args.push(`p${i}.x`);
  }
  const a = args.join(', ');
  return `select count(*)::int as n, min(concat_ws(' / ', ${args.map((x) => `coalesce(${x}::text, 'null')`).join(', ')})) as example
            from ${from.join(' cross join ')}
           where public.${f.proname}(${a})::text is distinct from pg_temp.hrpc_${f.proname}(${a})::text`;
}

/** The pass-2 probe query: per argument a probe set (PROBE2's, else SETS' by type); a set-returning function's rows
    compared as a sorted array of row texts. Counts the inputs on which the two images answer differently. */
function probeSql2(f) {
  const types = f.argtypes;
  const own = PROBE2[f.proname] || [];
  const from = []; const args = [];
  let i = 0;
  if (types[0] === 'uuid' && types[1] === 'integer' && !own.length) { from.push(`(${SETS.who}) w(a1, a2)`); args.push('w.a1', 'w.a2'); i = 2; }
  for (let k = 0; i < types.length; i++, k++) {
    const set = own[k] || SETS[types[i]];
    if (!set) throw new Error(`${f.proname}: no probe set for argument type ${types[i]}`);
    from.push(`(${set}) p${i}(x)`); args.push(`p${i}.x`);
  }
  const a = args.join(', ');
  const answer = (schema, name) => (f.proretset
    ? `(select coalesce(array_agg(r::text order by r::text), '{}') from ${schema}.${name}(${a}) r)`
    : `${schema}.${name}(${a})::text`);
  return `select count(*)::int as n, min(concat_ws(' / ', ${args.map((x) => `coalesce(${x}::text, 'null')`).join(', ')})) as example
            from ${from.join(' cross join ')}
           where ${answer('public', f.proname)} is distinct from ${answer('pg_temp', 'hrpc_' + f.proname)}`;
}

/** Read each pre-image from `db` (a replay of the chain up to the file before this one). Pass 1 (`FNS`) takes STABLE
    scalar SQL functions only; pass 2 (`FNS2`, `{ pass: 2 }`) STABLE or IMMUTABLE ones, scalar or set-returning. */
export async function readPreImages(db, { pass = 1 } = {}) {
  const out = [];
  /* every type and function name printed schema-qualified (public.hunt_sessions, public.hr_x(..)): the file never
     leans on the search_path it is applied under */
  await db.exec('set search_path = pg_catalog');
  for (const name of pass === 2 ? FNS2 : FNS) {
    const r = await db.query(`select p.proname, pg_get_function_arguments(p.oid) args, p.oid::regprocedure::text sig,
        pg_get_function_result(p.oid) result, l.lanname, p.provolatile, p.prosecdef, p.proisstrict, p.proleakproof, p.proparallel,
        p.procost, p.prorows, p.proretset, p.proconfig, p.prosrc, p.proargtypes::regtype[]::text[] argtypes, t.typtype
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang join pg_type t on t.oid = p.prorettype
       where n.nspname = 'public' and p.proname = $1`, [name]);
    if (r.rows.length !== 1) throw new Error(`${name}: ${r.rows.length} overloads in public (expected exactly one)`);
    const f = r.rows[0];
    const shape = pass === 2
      ? f.lanname === 'sql' && (f.provolatile === 's' || f.provolatile === 'i')
        && (f.proretset ? f.typtype === 'p' && /^TABLE\(/.test(f.result) : f.typtype !== 'c' && f.typtype !== 'p')
      : f.lanname === 'sql' && !f.proretset && f.provolatile === 's' && f.typtype !== 'c' && f.typtype !== 'p';
    if (!shape) {
      throw new Error(`${name}: not a ${pass === 2 ? 'stable/immutable SQL function (scalar, or RETURNS TABLE)' : 'stable scalar SQL function'}`
        + ` (${f.lanname}, retset ${f.proretset}, vol ${f.provolatile}, typtype ${f.typtype})`);
    }
    f.argtypes = (Array.isArray(f.argtypes) ? f.argtypes : String(f.argtypes).replace(/^\{|\}$/g, '').split(',')).map((x) => x.replace(/^"|"$/g, '').replace(/^public\./, ''));
    f.pre_md5 = md5(f.prosrc);
    f.plbody = pass === 2 ? (f.proretset ? plpgsqlSetBody(f.prosrc) : plpgsqlBody(f.prosrc, FILE2)) : plpgsqlBody(f.prosrc);
    f.post_md5 = md5(f.plbody);
    out.push(f);
  }
  await db.exec('reset search_path');
  return out;
}

/** The migration text. */
export function buildSql(fns) {
  const digest = createHash('sha256').update(fns.map((f) => f.proname + ':' + f.pre_md5).join('\n')).digest('hex');
  const L = [];
  L.push(`-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE SETTLE'S HELPERS KEEP THEIR PLANS  (GENERATED — DO NOT EDIT)
--
--   Written by tools/gen-plan-cache.mjs from the replayed chain (the pre-images below). Any hand edit FAILS
--   \`node tools/gen-plan-cache.mjs --check\`. lane/c-settle-cost-2, backend-architect, 2026-10-30.
--   STAGED. Game CLOSED: applies on its passing §2 (CLAUDE.md §2), one file via the Coordinator's apply tool,
--   never inside begin/commit, never 00:00-00:10 UTC.
--   digest: ${digest}
--   ${fns.length} functions.
--
-- ── WHY (measured, not guessed) ─────────────────────────────────────────────
-- Production is PostgreSQL 17. A LANGUAGE sql function with a SET clause is never inlined, and 17 parses, rewrites and
-- plans its body again for every statement execution that calls it; 18 (PGlite, the replay) caches that plan, which
-- is why no replay measurement ever showed it. Live, read-only, 2026-10-30: five one-line helpers 0.8 ms, hr_vitals_of
-- 2.25 ms a call (inlined by hand into one query: 1.1 ms), hr_home_view's body 1.6 ms of planning alone. On a local
-- PostgreSQL 17 replay of this chain (tools/pg-replay.mjs), a watched 4-hero settle calls these ${fns.length} functions
-- about 3,000 times; the same body as plpgsql costs 2-7x less a call wherever its caller runs it as its own statement
-- (hr_renown_of 2.70 -> 0.64 ms, hr_hunt_weapon_of 0.40 -> 0.05, hr_skill_level 0.18 -> 0.07) and the same per row of
-- one statement. The before/after of the whole settle is in the lane report.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 Each function below keeps its name, arguments, return type, volatility, SECURITY DEFINER, STRICT, PARALLEL, COST
--    and SET clauses (owner and grants are kept by CREATE OR REPLACE); only its LANGUAGE moves, sql -> plpgsql, and
--    its body is the SQL pre-image VERBATIM inside
--        #variable_conflict use_column     (a column and a parameter of one name: the column, as in a SQL function)
--        return (select hr_q.v from ( <pre-image> ) as hr_q(v) limit 1);
--    — the first row of the one column, or NULL with none: a scalar SQL function's own contract. No caller changes.
-- §2 The executed self-check: every function is plpgsql with exactly the pinned body and kept properties, and answers
--    exactly what its SQL pre-image answers, as TEXT (byte for byte), over probe inputs drawn from the database the
--    file is applied to — on production every character there is, every hunt session's id, every limit, flag, skill
--    and monster key; on the replay a probe hero. The pre-images run as pg_temp copies, rolled back with the probe.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
--   No row moves. CREATE OR REPLACE takes each function's lock for the instant it swaps; a statement already running
--   keeps the plan it started with. A second apply finds every post-image (§0 accepts it) and rewrites the same text.
--
-- ── SECURITY SURFACE (for the EA review: CLAUDE.md §3.7) ─────────────────────
--   NONE ADDED. No function changes who may call it (grants kept), whose rights it runs with (SECURITY DEFINER kept),
--   or the search_path it runs under (SET kept: no new function_search_path_mutable finding). The bodies are the
--   pre-images' own SQL.
--
-- ── COST ────────────────────────────────────────────────────────────────────
--   Rows/bytes: none. Memory: each backend keeps the cached plans of these bodies (a few hundred KB at most).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Each pre-image is in this file (§2's pg_temp copies, verbatim): restate it under its own name to undo. No data.
--
-- ORDER: after 2027-02-10-party-instance-reset.sql (and 2027-02-10-pg-net-vacuum.sql where it is placed); before
--   2027-02-10-settle-reads.sql. EDGE: none for this file. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════
`);
  L.push(`-- ── §0 PRECONDITIONS AND PINS — FAIL CLOSED ────────────────────────────────
-- Each function is its measured pre-image (this tool read it) or this file's own post-image (a second apply).
do $pin$
declare r record; v_md5 text; v_lang text;
begin
  for r in select * from (values
${fns.map((f) => `    ('public.${f.sig.replace(/^public[.]/, '')}', '${f.pre_md5}', '${f.post_md5}')`).join(',\n')}
  ) as t(sig, pre, post) loop
    if to_regprocedure(r.sig) is null then raise exception 'PRECONDITION: % is absent', r.sig; end if;
    select md5(replace(p.prosrc, chr(13), '')), l.lanname into v_md5, v_lang
      from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = to_regprocedure(r.sig);
    if not ((v_lang = 'sql' and v_md5 = r.pre) or (v_lang = 'plpgsql' and v_md5 = r.post)) then
      raise exception 'PIN: % is neither its pre-image (sql %) nor this file''s post-image (plpgsql %): % % - another file moved it; re-run tools/gen-plan-cache.mjs',
        r.sig, r.pre, r.post, v_lang, v_md5;
    end if;
  end loop;
end $pin$;
`);
  return L.join('\n') + bodySql(fns, 1);
}

/** §1 and §2 of a pass's file: the bodies, then the executed self-check (pass 2 also pins a set-returning shape and
    probes with probeSql2). Pass 1's text is exactly what it always was (its file is APPLIED: --check holds it). */
function bodySql(fns, pass) {
  const tag = pass === 2 ? 'plan-cache-2' : 'plan-cache';
  const probe = pass === 2 ? probeSql2 : probeSql;
  const L = [''];
  L.push(`-- ── §1 THE SAME BODIES, PLANNED ONCE PER BACKEND ─────────────────────────────`);
  for (const f of fns) L.push(createSql(f, 'plpgsql', f.plbody) + ';\n');
  /* §2 */
  L.push(`-- ── §2 SELF-CHECK (CLAUDE.md §4), EXECUTED; the probe hero and the pg_temp pre-images roll back ──────────
-- Fails on the pre-image (every function still sql) and on any body, property or answer that moved.
do $check$
declare
  c_probe constant uuid := '${pass === 2 ? '000000d6-0000-4000-a000-00005e77c0df' : '000000d6-0000-4000-a000-00005e77c0de'}';
  r record; v jsonb; v_n int; v_ex text; v_total int := 0;
begin
  -- (a) THE SHAPE: plpgsql, the pinned body, every kept property${pass === 2 ? ' (a set-returning one stays set-returning)' : ''}.
  for r in select * from (values
${fns.map((f) => `    ('public.${f.sig.replace(/^public[.]/, '')}', '${f.post_md5}', '${f.provolatile}', ${f.prosecdef}, ${f.proisstrict}, '${f.proparallel}', ${f.proconfig ? `'${JSON.stringify(f.proconfig).replace(/'/g, "''")}'` : 'null'}${pass === 2 ? `, ${f.proretset}` : ''})`).join(',\n')}
  ) as t(sig, post, vol, secdef, isstrict, par, cfg${pass === 2 ? ', retset' : ''}) loop
    if not exists (select 1 from pg_proc p join pg_language l on l.oid = p.prolang
                    where p.oid = to_regprocedure(r.sig) and l.lanname = 'plpgsql' and md5(replace(p.prosrc, chr(13), '')) = r.post
                      and p.provolatile = r.vol and p.prosecdef = r.secdef and p.proisstrict = r.isstrict and p.proparallel = r.par
                      and coalesce(to_jsonb(p.proconfig)::text, 'null') = coalesce(r.cfg::jsonb::text, 'null')${pass === 2 ? ' and p.proretset = r.retset' : ''}) then
      raise exception '${tag} §2(a): % is not this file''s plpgsql image with its properties kept', r.sig;
    end if;
  end loop;

  begin
    -- A PROBE HERO, so the replay (no characters yet) exercises every (uuid, integer) body; production adds its own.
    insert into auth.users (id) values (c_probe) on conflict (id) do nothing;
    if to_regclass('public.hr_access_allowlist') is not null then
      insert into public.hr_access_allowlist (user_id, note) values (c_probe, '${tag} §2 probe') on conflict (user_id) do nothing;
    end if;
    perform set_config('request.jwt.claim.sub', c_probe::text, true);
    v := public.hr_create_character(0);
    if coalesce(v->>'ok', v->>'created', '') <> 'true' then raise exception '${tag} §2-harness: hr_create_character refused: %', v; end if;
    perform set_config('request.jwt.claim.sub', '', true);

    -- (b) THE ANSWERS: each function against its SQL pre-image (a pg_temp copy), as text, over the probe inputs.
`);
  for (const f of fns) {
    const pre = createSql(f, 'sql', f.prosrc.replace(/\r/g, ''), 'pg_temp', 'hrpc_' + f.proname);
    const q = tagFor(pre, 'pre');
    const p = tagFor(probe(f), 'probe');
    L.push(`    execute ${q}${pre}${q};
    execute ${p}${probe(f)}${p} into v_n, v_ex;
    if v_n <> 0 then raise exception '${tag} §2(b): ${f.proname} answers differently from its SQL pre-image on % input(s), e.g. (%)', v_n, v_ex; end if;
    v_total := v_total + 1;
`);
  }
  L.push(`    if v_total <> ${fns.length} then raise exception '${tag} §2(b)-harness: % of ${fns.length} functions probed', v_total; end if;
    raise exception '${tag} §2: ok' using errcode = 'P0001';
  exception when sqlstate 'P0001' then
    if sqlerrm <> '${tag} §2: ok' then raise; end if;
  end;
end $check$;
`);
  return L.join('\n');
}

/** Pass 2's migration text (FILE2): its own header and pins, then bodySql. */
export function buildSql2(fns) {
  const digest = createHash('sha256').update(fns.map((f) => f.proname + ':' + f.pre_md5).join('\n')).digest('hex');
  const L = [];
  L.push(`-- ════════════════════════════════════════════════════════════════════════
-- Hearthrise — THE REST OF THE SETTLE'S SQL HELPERS KEEP THEIR PLANS  (GENERATED — DO NOT EDIT)
--
--   Written by tools/gen-plan-cache.mjs (pass 2) from the replayed chain (the pre-images below). Any hand edit FAILS
--   \`node tools/gen-plan-cache.mjs --check\`. lane/c-envelope-diff, backend-architect, 2026-10-30.
--   STAGED. Game CLOSED: applies on its passing §2 (CLAUDE.md §2), one file via the Coordinator's apply tool,
--   never inside begin/commit, never 00:00-00:10 UTC.
--   digest: ${digest}
--   ${fns.length} functions.
--
-- ── WHY (measured, not guessed) ─────────────────────────────────────────────
-- The brief was a per-section envelope diff. Measured first (tools/settle-cost.mjs --pg --door=viewed, PostgreSQL 17,
-- a watched 4-hero settle): building envelopes is about half the settle's DB time (5.33 builds a settle), but the
-- sections a settle CHANGES are the expensive ones (hunt_analyzer 10.7 ms, hunt 4.4, hunt_settings 4.1, party 3.1,
-- character_sheet 2.5, stamina_refill 1.3, shop 1.1: ~24 of a 33 ms section build); the 23 sections that never moved
-- over 31 consecutive answers and frames cost ~9.5 ms. Skipping their build saves at most ~50 ms a settle (~7 %) and
-- needs server-proven per-section versions over account-shared and clock-read inputs. Not this file.
-- What the same measure names instead: ~32 % of the settle's DB time inside LANGUAGE sql bodies that PostgreSQL 17
-- re-plans on every call (2027-02-10-settle-plan-cache.generated.sql took the stable scalar ones called 7+ times a
-- settle; these are the rest): hr_jsonb_add 303 calls a settle, IMMUTABLE (the analyzer's tallies and hr_apply's),
-- hr_premium_until 124, hr_premium_active 91, hr_hunt_tally_add 92, hr_char_xp_for_level 32, hr_unlock_levels 22
-- (SET-RETURNING, 0.9 ms a call), the once-an-envelope sections hr_depot_view and hr_premium_view, and the hello's
-- set-returning reads. The before/after of the whole settle is in the lane report.
--
-- ── THE CONTRACT ────────────────────────────────────────────────────────────
-- §1 Each function below keeps its name, arguments, return type (RETURNS TABLE kept), volatility (IMMUTABLE kept),
--    SECURITY DEFINER, STRICT, PARALLEL, COST, ROWS and SET clauses (owner and grants are kept by CREATE OR REPLACE);
--    only its LANGUAGE moves, sql -> plpgsql, and its body is the SQL pre-image VERBATIM inside
--        #variable_conflict use_column     (a column and a parameter of one name: the column, as in a SQL function)
--        scalar:          return (select hr_q.v from ( <pre-image> ) as hr_q(v) limit 1);
--        set-returning:   return query <pre-image>;
--    No caller changes. Every function here has a SET clause, so none was ever inlined: no call site loses an inlining.
-- §2 The executed self-check: every function is plpgsql with exactly the pinned body and kept properties, and answers
--    exactly what its SQL pre-image answers, as TEXT (a set-returning one: its rows as a sorted multiset), over probe
--    inputs drawn from the database the file is applied to: every character, the six newest hunts' own tallies, every
--    analyzer, the gold kinds' every branch. The pre-images run as pg_temp copies, rolled back with the probe.
--
-- ── CONCURRENCY / IDEMPOTENCY ───────────────────────────────────────────────
--   No row moves. CREATE OR REPLACE takes each function's lock for the instant it swaps; a statement already running
--   keeps the plan it started with. A second apply finds every post-image (§0 accepts it) and rewrites the same text.
--
-- ── SECURITY SURFACE (for the EA review: CLAUDE.md §3.7) ─────────────────────
--   NONE ADDED. No function changes who may call it (grants kept), whose rights it runs with (SECURITY DEFINER kept),
--   or the search_path it runs under (SET kept). The bodies are the pre-images' own SQL. The one premium check
--   (hr_premium_until, the beta switch's only reader) keeps its text; tests/hunt-sessions-settle.mjs BETA reads it.
--
-- ── COST ────────────────────────────────────────────────────────────────────
--   Rows/bytes: none. Memory: each backend keeps the cached plans of these bodies (a few hundred KB at most).
--
-- ── REVERSIBILITY ───────────────────────────────────────────────────────────
--   Each pre-image is in this file (§2's pg_temp copies, verbatim): restate it under its own name to undo. No data.
--
-- ORDER: after 2027-02-10-settle-reads.sql (the chain end). EDGE: none. No begin/commit.
-- ════════════════════════════════════════════════════════════════════════
`);
  L.push(`-- ── §0 PRECONDITIONS AND PINS — FAIL CLOSED ────────────────────────────────
-- Each function is its measured pre-image (this tool read it) or this file's own post-image (a second apply).
do $pin$
declare r record; v_md5 text; v_lang text;
begin
  for r in select * from (values
${fns.map((f) => `    ('public.${f.sig.replace(/^public[.]/, '')}', '${f.pre_md5}', '${f.post_md5}')`).join(',\n')}
  ) as t(sig, pre, post) loop
    if to_regprocedure(r.sig) is null then raise exception 'PRECONDITION: % is absent', r.sig; end if;
    select md5(replace(p.prosrc, chr(13), '')), l.lanname into v_md5, v_lang
      from pg_proc p join pg_language l on l.oid = p.prolang where p.oid = to_regprocedure(r.sig);
    if not ((v_lang = 'sql' and v_md5 = r.pre) or (v_lang = 'plpgsql' and v_md5 = r.post)) then
      raise exception 'PIN: % is neither its pre-image (sql %) nor this file''s post-image (plpgsql %): % % - another file moved it; re-run tools/gen-plan-cache.mjs',
        r.sig, r.pre, r.post, v_lang, v_md5;
    end if;
  end loop;
end $pin$;
`);
  return L.join('\n') + bodySql(fns, 2);
}

/* Each pass: its file, its pre-images (the chain replayed up to the file before it) and its text. */
const PASSES = [
  { file: FILE, out: OUT, pass: 1, build: buildSql },
  { file: FILE2, out: OUT2, pass: 2, build: buildSql2 },
];

async function main() {
  const check = process.argv.includes('--check');
  const order = JSON.parse(readFileSync(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8')).order;
  const { bootReplay } = await import('../tests/schema-replay.mjs');
  let bad = 0;
  for (const P of PASSES) {
    const at = order.indexOf(P.file);
    const upTo = at > 0 ? order[at - 1] : order[order.length - 1];
    const { db } = await bootReplay({ upTo });
    const fns = await readPreImages(db, { pass: P.pass });
    const sql = P.build(fns);
    await db.close?.();
    if (check) {
      const have = existsSync(P.out) ? readFileSync(P.out, 'utf8').replace(/\r\n/g, '\n') : '';
      if (have !== sql) { console.error(`✗ ${P.file} is not what tools/gen-plan-cache.mjs writes (replayed up to ${upTo}). Re-run it.`); bad++; continue; }
      console.log(`✓ ${P.file}: ${fns.length} functions, matches its pre-images (replayed up to ${upTo})`);
      continue;
    }
    writeFileSync(P.out, sql);
    console.log(`wrote ${P.file}: ${fns.length} functions, ${sql.length} bytes (pre-images replayed up to ${upTo})`);
  }
  process.exit(bad ? 1 : 0);
}
if (isMain(import.meta.url)) main().catch((e) => { console.error('gen-plan-cache: ' + (e && e.stack || e)); process.exit(1); });
