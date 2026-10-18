#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/quest-reward-parity.mjs — THE THREE-WAY BIND FOR QUEST *ITEM* REWARDS.
//
//   node tests/quest-reward-parity.mjs             the guard
//   node tests/quest-reward-parity.mjs --list      what it read, from where
//   node tests/quest-reward-parity.mjs --selftest  plant every defect class,
//                                                  require each one caught
//   node tests/quest-reward-parity.mjs --mutate    alias of --selftest (the
//                                                  house name for the same proof)
//
// ── THE FAILURE THIS EXISTS TO KILL ─────────────────────────────────────────
// Every quest ITEM reward was PHANTOM. src/legacy.js QUEST_DEFS authored
// `reward:{item, qty}`, completeQuest paid it with `addItem()` — which writes
// G.inventory and nothing else — and `hr_claim_quest` credited GOLD only. The
// item therefore never existed on the server, and the first envelope that spoke
// about the id took it back. `shrimp` is a FISH_SPOTS product, so
// serverOwnedItem('shrimp') is true and one away-eaten shrimp makes the
// envelope's figure ABSOLUTE for it: the server says 0 and the stack is gone.
//
// 2026-09-06-quest-item-rewards.sql moves the credit server-side. That creates
// the SAME hazard the gold half already has, one system over: THREE copies of
// the same authored number.
//   (1) src/data/goal-catalogue.js   QUEST_REWARDS[id].items   — the source
//   (2) [retired 2026-10-17: the old client's QUEST_DEFS, deleted with it]
//   (3) the CHAIN-END seed — the LAST file in tests/schema-apply-order.json
//                                     `order` that refills hr_quest_rewards
//                                     (2026-09-28-journeymans-road.sql today;
//                                     2026-09-06 until then) — what the server
//                                     actually CREDITS. Derived, never a
//                                     hard-coded file: a superseded seed is
//                                     not what a rebuild or production runs.
// A drift means a player is promised 30 shrimp and paid 5, or promised an item
// and paid nothing at all. This guard fails the build on any one-sided edit.
//
// ── IT ALSO ENFORCES TWO PROPERTIES THAT ARE NOT "SAME NUMBER" ──────────────
//   COMPLETENESS  every QUEST_DEFS row that authors an item MUST be in the
//                 catalogue and in the seed. This is the phantom class itself:
//                 an authored item the server cannot credit is a promise the
//                 next reload breaks, and completeQuest's client-minted
//                 fallback would silently take it.
//   REAL IDS      every granted id must exist in src/data/items.js — the source
//                 hr_items is generated from. An id that exists nowhere is
//                 skipped at claim time (`skipped_items`), i.e. authored,
//                 shipped, and paying nothing. This is the `gold_500`
//                 "small_bones" defect, caught before it reaches a player.
//
// Credential-free and database-free: three files, parsed. Cheap enough to run
// on every push next to the other catalogue binds.
//
// Exit: 0 in sync · 1 drift · 2 harness problem.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain } from './_is-main.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));

/* ── THE CHAIN END ───────────────────────────────────────────────────────────
   The LAST file in schema-apply-order.json `order` whose text matches `re` —
   the body/seed a rebuild installs last, which is also the one production runs
   once the order is applied. Same derivation collection-renown-claim-drift uses;
   shared here so goal-catalogue-drift and goal-counter-kinds bind the SAME file
   this guard does. Returns {file, sql} or null. */
export async function chainEndMigration(re, orderOverride) {
  const order = orderOverride
    || JSON.parse(await readFile(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8')).order;
  let end = null;
  for (const f of order) {
    let txt;
    try { txt = await readFile(join(ROOT, 'supabase', 'migrations', f), 'utf8'); } catch { continue; }
    if (re.test(txt)) end = { file: f, sql: txt };
  }
  return end;
}
export const SEED_RE = /insert into public\.hr_quest_rewards \(quest_id, items\) values/i;
/* THE XP HALF (2026-10-10-quest-xp-absence-pay.sql): hr_quest_rewards.xp is
   seeded by its own insert, so the item seed's chain end is untouched. */
export const XP_SEED_RE = /insert into public\.hr_quest_rewards \(quest_id, xp\) values/i;
async function xpSeedMigration() {
  const end = await chainEndMigration(XP_SEED_RE);
  if (!end) throw new Error('no file in tests/schema-apply-order.json `order` seeds hr_quest_rewards.xp');
  return end;
}
export function parseXpSeed(sql) {
  const block = sql.match(/insert into public\.hr_quest_rewards \(quest_id, xp\) values([\s\S]*?)(?:on conflict|;)/i);
  if (!block) return null;
  const out = new Map();
  for (const m of block[1].matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*'(\{[^']*\})'\s*\)/gi)) {
    let xp;
    try { xp = JSON.parse(m[2]); } catch (e) { return { __bad: `${m[1]}: xp is not valid JSON — ${m[2]}` }; }
    const norm = {};
    for (const [k, v] of Object.entries(xp)) norm[k] = Math.floor(Number(v) || 0);
    out.set(m[1], norm);
  }
  return out;
}
async function seedMigration() {
  const end = await chainEndMigration(SEED_RE);
  if (!end) throw new Error('no file in tests/schema-apply-order.json `order` seeds hr_quest_rewards');
  return end;
}

/* ── (3) the migration seed ──────────────────────────────────────────────────
   Anchored on the INSERT this file owns. A moved anchor is a harness failure,
   not a pass: parsing zero rows out of a file that must seed three is reported
   as loudly as a drift. */
export function parseSeed(sql) {
  const block = sql.match(/insert into public\.hr_quest_rewards \(quest_id, items\) values([\s\S]*?);/i);
  if (!block) return null;
  const out = new Map();
  for (const m of block[1].matchAll(/\(\s*'([a-z0-9_]+)'\s*,\s*'(\{[^']*\})'\s*\)/gi)) {
    let items;
    try { items = JSON.parse(m[2]); } catch (e) { return { __bad: `${m[1]}: items is not valid JSON — ${m[2]}` }; }
    const norm = {};
    for (const [k, v] of Object.entries(items)) norm[k] = Math.floor(Number(v) || 0);
    out.set(m[1], norm);
  }
  return out;
}

const same = (a, b) => {
  const ka = Object.keys(a || {}).sort(); const kb = Object.keys(b || {}).sort();
  if (ka.join('|') !== kb.join('|')) return false;
  return ka.every((k) => Number(a[k]) === Number(b[k]));
};
const show = (m) => (Object.keys(m || {}).length ? Object.entries(m).map(([k, v]) => `${v}x ${k}`).join(', ') : '(none)');

export async function questRewardParityGuard(over = {}) {
  const problems = [];

  let QUEST_REWARDS; let questRewardItems; let ITEMS;
  try { ({ QUEST_REWARDS, questRewardItems } = await import('../src/data/goal-catalogue.js')); }
  catch (e) { return [`cannot import src/data/goal-catalogue.js — ${e.message}`]; }
  try { ({ ITEMS } = await import('../src/data/items.js')); }
  catch (e) { return [`cannot import src/data/items.js — ${e.message}`]; }

  if (over.QUEST_REWARDS) QUEST_REWARDS = over.QUEST_REWARDS;

  const sql = over.sql ?? (await seedMigration()).sql;

  const seed = parseSeed(sql);
  if (!seed) return ['CONTROL: the hr_quest_rewards INSERT could not be found in the migration — the anchor moved.'];
  if (seed.__bad) return [`CONTROL: ${seed.__bad}`];

  // ── the catalogue's own view: id -> item map (only rows that pay items) ──
  const cat = new Map();
  for (const [id, row] of Object.entries(QUEST_REWARDS)) {
    const items = questRewardItems(row);
    if (Object.keys(items).length) cat.set(id, items);
  }

  if (cat.size === 0) problems.push('CONTROL: no QUEST_REWARDS row authors an item — either the catalogue was gutted or the shape changed.');
  if (seed.size === 0) problems.push('CONTROL: the migration seeds 0 rows — the anchor matched but parsed nothing.');

  // ── COMPLETENESS, the other direction: catalogue -> seed ──
  for (const [id, items] of cat) {
    if (!seed.has(id)) {
      problems.push(`goal-catalogue.js QUEST_REWARDS['${id}'].items = ${show(items)} but the migration seeds NO row `
        + `for '${id}' — hr_claim_quest would find an empty catalogue and pay gold only.`);
    }
  }
  for (const [id, items] of seed) {
    if (!cat.has(id)) {
      problems.push(`the migration seeds '${id}' = ${show(items)} but goal-catalogue.js authors no items for it — `
        + 'the server would credit an item the client never promised.');
    }
  }

  // ── VALUE PARITY, catalogue <-> seed ──
  for (const [id, items] of cat) {
    const fromSeed = seed.get(id);
    if (fromSeed && !same(items, fromSeed)) {
      problems.push(`'${id}': goal-catalogue.js authors ${show(items)} but the migration seeds ${show(fromSeed)} — `
        + 'the SQL is what actually gets credited.');
    }
  }

  // ── REAL IDS: every granted id must exist in items.js ──
  for (const [label, src] of [['goal-catalogue.js', cat], ['the migration seed', seed]]) {
    for (const [id, items] of src) {
      for (const itemId of Object.keys(items)) {
        if (!ITEMS[itemId]) {
          problems.push(`${label} grants '${itemId}' on quest '${id}' — that id does not exist in src/data/items.js, `
            + 'so hr_items does not have it either and the claim would SKIP it. Authored, shipped, pays nothing.');
        }
      }
      for (const [itemId, qty] of Object.entries(items)) {
        if (!(Number.isInteger(qty) && qty > 0)) {
          problems.push(`${label} grants '${itemId}' x${qty} on quest '${id}' — a quantity must be a positive integer.`);
        }
      }
    }
  }

  // ── THE XP HALF: QUEST_DEFS reward.xp == QUEST_REWARDS[id].xp == the chain-end
  //    hr_quest_rewards.xp seed, and every skill is a real one (src/data/skills.js,
  //    which hr_skills is generated from). An XP quest the server does not seed is
  //    a claim that pays nothing; a seeded one the client does not show is XP the
  //    player was never promised.
  let questRewardXp; let SKILLS_DEF;
  try { ({ questRewardXp } = await import('../src/data/goal-catalogue.js')); }
  catch (e) { return [`cannot import questRewardXp — ${e.message}`]; }
  try { ({ SKILLS_DEF } = await import('../src/data/skills.js')); }
  catch (e) { return [`cannot import src/data/skills.js — ${e.message}`]; }
  const xpSql = over.xpSql ?? (await xpSeedMigration()).sql;
  const xseed = parseXpSeed(xpSql);
  if (!xseed) return [...problems, 'CONTROL: the hr_quest_rewards (quest_id, xp) INSERT could not be found — the anchor moved.'];
  if (xseed.__bad) return [...problems, `CONTROL: ${xseed.__bad}`];
  const xcat = new Map();
  for (const [id, row] of Object.entries(QUEST_REWARDS)) {
    const xp = questRewardXp(row);
    if (Object.keys(xp).length) xcat.set(id, xp);
  }
  if (xcat.size === 0) problems.push('CONTROL: no QUEST_REWARDS row authors XP — hundred_kills lost its server credit.');
  for (const [id, xp] of xcat) {
    const sx = xseed.get(id);
    if (!sx) problems.push(`goal-catalogue.js authors XP for '${id}' but the chain-end xp seed has no row — hr_claim_quest pays no XP.`);
    else if (!same(xp, sx)) problems.push(`'${id}': goal-catalogue.js authors XP ${JSON.stringify(xp)} but the migration seeds ${JSON.stringify(sx)} — the SQL is what gets credited.`);
  }
  for (const [id, sx] of xseed) {
    if (!xcat.has(id)) problems.push(`the migration seeds XP ${JSON.stringify(sx)} for '${id}' but goal-catalogue.js authors none.`);
  }
  for (const [label, src] of [['goal-catalogue.js', xcat], ['the xp seed', xseed]]) {
    for (const [id, xp] of src) {
      for (const [sk, n] of Object.entries(xp)) {
        if (!SKILLS_DEF[sk]) problems.push(`${label} pays '${sk}' XP on quest '${id}' — not a skill in src/data/skills.js (hr_skills); it would be skipped.`);
        if (!(Number.isInteger(n) && n > 0)) problems.push(`${label} pays '${sk}' x${n} on quest '${id}' — an amount must be a positive integer.`);
      }
    }
  }

  return problems;
}

// ── --list ──────────────────────────────────────────────────────────────────
async function list() {
  const { QUEST_REWARDS, questRewardItems } = await import('../src/data/goal-catalogue.js');
  const end = await seedMigration();
  process.stdout.write(`chain-end seed: ${end.file}\n`);
  const seed = parseSeed(end.sql);
  const ids = new Set([...Object.keys(QUEST_REWARDS), ...(seed ? seed.keys() : [])]);
  process.stdout.write('quest        QUEST_REWARDS (data)     hr_quest_rewards (sql)\n');
  for (const id of [...ids].sort()) {
    const b = QUEST_REWARDS[id] ? questRewardItems(QUEST_REWARDS[id]) : undefined;
    const c = seed?.get(id);
    process.stdout.write(`${id.padEnd(13)}${show(b).padEnd(25)}${show(c)}\n`);
  }
}

/* ── --selftest / --mutate ───────────────────────────────────────────────────
   A guard nobody has watched FAIL is a guard nobody knows works. Each mutation
   below plants exactly one defect class into an in-memory copy of one of the
   three sources and requires the guard to catch it. The base run must be clean
   first: a mutation proof on an already-red tree proves nothing. */
const MUTATIONS = [
  { name: 'sql seed qty drift (the number that actually gets credited)',
    apply: (s) => ({ sql: s.sql.replace("('first_cook',  '{\"shrimp\": 30}')", "('first_cook',  '{\"shrimp\": 3}')") }) },
  { name: 'sql seed row removed (server pays gold only)',
    apply: (s) => ({ sql: s.sql.replace("('first_blood', '{\"turnip_seed\": 5}'),\n", '') }) },
  { name: 'sql seed grants an id that exists nowhere (the small_bones class)',
    /* Anchored on the SEED TUPLE, not the bare `"wheat_seed": 5` (now carrot_seed): the chain-end
       file also quotes the pre-state rows in its §0 precondition, and a bare
       anchor mutated that copy — changing text, proving nothing. */
    apply: (s) => ({ sql: s.sql.replace("('farmhand',    '{\"carrot_seed\": 5}')", "('farmhand',    '{\"small_bones\": 5}')") }) },
  { name: 'catalogue item map emptied (the client stops asking the server for it)',
    apply: (s, cat) => ({ QUEST_REWARDS: { ...cat, first_cook: { ...cat.first_cook, items: {} } } }) },
  { name: 'catalogue qty drift against both other sides',
    apply: (s, cat) => ({ QUEST_REWARDS: { ...cat, first_cook: { ...cat.first_cook, items: { shrimp: 31 } } } }) },
  /* ── Journeyman's Road (content pack 7) — the road rows are bound the same way */
  { name: 'road: chain-end seed potato_seed drift (the number that actually gets credited)',
    apply: (s) => ({ sql: s.sql.replace("('road_harvest', '{\"potato_seed\": 10}')", "('road_harvest', '{\"potato_seed\": 1}')") }) },
  { name: 'road: catalogue iron_pickaxe qty drift against both other sides',
    apply: (s, cat) => ({ QUEST_REWARDS: { ...cat, road_forge: { ...cat.road_forge, items: { iron_pickaxe: 2 } } } }) },
  /* ── the XP half (2026-10-10-quest-xp-absence-pay.sql) */
  { name: 'xp: chain-end seed amount drift (hundred_kills 1500 -> 15000)',
    apply: (s) => ({ xpSql: s.xpSql.replace("('hundred_kills', '{\"hitpoints\": 1500}')", "('hundred_kills', '{\"hitpoints\": 15000}')") }) },
  { name: 'xp: chain-end seed row removed (hr_claim_quest pays hundred_kills nothing)',
    apply: (s) => ({ xpSql: s.xpSql.replace("('hundred_kills', '{\"hitpoints\": 1500}')", "('nobody', '{}')") }) },
  { name: 'xp: chain-end seed names a skill that does not exist',
    apply: (s) => ({ xpSql: s.xpSql.replace("('hundred_kills', '{\"hitpoints\": 1500}')", "('hundred_kills', '{\"combat\": 1500}')") }) },
  { name: 'xp: catalogue XP emptied (the client stops claiming hundred_kills)',
    apply: (s, cat) => ({ QUEST_REWARDS: { ...cat, hundred_kills: { ...cat.hundred_kills, xp: {} } } }) },
  { name: 'road: chain-end seed row removed (road_cook pays gold only)',
    apply: (s) => ({ sql: s.sql.replace("  ('road_cook',    '{\"lobster\": 3}'),\n", '') }) },
];

async function selftest() {
  const end = await seedMigration();
  process.stdout.write(`  chain-end seed: ${end.file}\n`);
  const base = { sql: end.sql, xpSql: (await xpSeedMigration()).sql };
  const { QUEST_REWARDS } = await import('../src/data/goal-catalogue.js');

  const clean = await questRewardParityGuard();
  if (clean.length) {
    for (const p of clean) process.stdout.write(`  FAIL  ${p}\n`);
    process.stdout.write('\nBASE RUN IS RED — a mutation proof on a red tree proves nothing. Fix the drift first.\n');
    return 1;
  }
  process.stdout.write('  ok    base run is clean (the mutation proof means something)\n');

  let missed = 0;
  for (const m of MUTATIONS) {
    const over = { ...base, ...m.apply(base, QUEST_REWARDS) };
    if (over.sql === base.sql && over.xpSql === base.xpSql && !over.QUEST_REWARDS) {
      process.stdout.write(`  FAIL  "${m.name}" — the mutation changed NOTHING; its anchor moved and it is proving nothing.\n`);
      missed++; continue;
    }
    const found = await questRewardParityGuard(over);
    if (found.length) process.stdout.write(`  ok    caught: ${m.name}\n      -> ${found[0].slice(0, 140)}\n`);
    else { process.stdout.write(`  FAIL  MISSED: ${m.name}\n`); missed++; }
  }
  process.stdout.write(missed
    ? `\n${missed} mutation(s) went uncaught — the guard does not cover what it claims.\n`
    : `\nall ${MUTATIONS.length} mutations caught by a named assertion.\n`);
  return missed ? 1 : 0;
}

if (isMain(import.meta.url)) {
  const arg = process.argv[2] || '';
  const run = arg === '--list' ? list().then(() => 0)
    : (arg === '--selftest' || arg === '--mutate') ? selftest()
      : questRewardParityGuard().then((problems) => {
        if (problems.length) {
          for (const p of problems) process.stdout.write(`  FAIL  ${p}\n`);
          process.stdout.write(`\n${problems.length} quest-reward drift(s). The two sides are src/data/goal-catalogue.js `
            + 'and the chain-end hr_quest_rewards seed (schema-apply-order.json).\n');
          return 1;
        }
        process.stdout.write('  ok    every quest item and XP reward agrees between data and server, and every id is real.\n\nin sync.\n');
        return 0;
      });
  run.then((code) => process.exit(code)).catch((e) => { process.stderr.write(`ERROR: ${e.stack || e.message}\n`); process.exit(2); });
}
