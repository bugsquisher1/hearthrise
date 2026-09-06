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
//   (2) src/legacy.js                QUEST_DEFS reward.item/qty — what the
//                                     player is SHOWN (and the tooltip they
//                                     believe)
//   (3) supabase/migrations/2026-09-06-quest-item-rewards.sql — what the server
//                                     actually CREDITS
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

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const LEGACY = join(ROOT, 'src', 'legacy.js');
const MIG = join(ROOT, 'supabase', 'migrations', '2026-09-06-quest-item-rewards.sql');

/* ── (2) legacy.js QUEST_DEFS ────────────────────────────────────────────────
   Parsed from TEXT, never imported: legacy.js is a classic script that needs a
   DOM.

   ⚠ THE ROW SPLIT IS DEPTH-AWARE, AND THAT IS NOT A STYLE CHOICE. The obvious
   `\{[^{}]*\}` — which tests/goal-catalogue-drift.mjs uses — cannot match a
   quest row at all, because every row CONTAINS a nested `reward:{…}`. Run over
   QUEST_DEFS it returns the six REWARD objects, none of which carries an `id:`,
   so that guard's per-quest loop `continue`s on all six and asserts nothing
   about any quest. Its `rows.length >= 5` control passes on the reward objects
   and hides it. Reported to the Coordinator; this guard does not inherit the
   defect. Depth tracking also means a quest row may grow an `items:{…}` map
   without silently falling out of the guard's view. */
/* COMMENTS ARE STRIPPED FIRST, because QUEST_DEFS is 80% prose and that prose
   contains braces — `{authored:true}` in the hundred_kills header, for one. An
   unbalanced brace inside a comment desynchronises the depth counter and drops
   every row after it, silently. */
export function stripComments(src) {
  let out = ''; let i = 0; let quote = null;
  while (i < src.length) {
    const c = src[i]; const d = src[i + 1];
    if (quote) {
      out += c;
      if (c === '\\') { out += d ?? ''; i += 2; continue; }
      if (c === quote) quote = null;
      i++; continue;
    }
    if (c === "'" || c === '"' || c === '`') { quote = c; out += c; i++; continue; }
    if (c === '/' && d === '*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 2; continue; }
    if (c === '/' && d === '/') { const end = src.indexOf('\n', i); i = end < 0 ? src.length : end; continue; }
    out += c; i++;
  }
  return out;
}

export function splitTopLevelObjects(body) {
  const out = [];
  let depth = 0; let start = -1; let quote = null;
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === "'" || c === '"' || c === '`') { quote = c; continue; }
    if (c === '{') { if (depth++ === 0) start = i; }
    else if (c === '}') { if (--depth === 0 && start >= 0) { out.push(body.slice(start, i + 1)); start = -1; } }
  }
  return out;
}

export function parseQuestDefs(legacySrcRaw) {
  const legacySrc = stripComments(legacySrcRaw);
  const at = legacySrc.indexOf('const QUEST_DEFS=');
  if (at < 0) return null;
  const open = legacySrc.indexOf('[', at);
  let depth = 0; let body = null;
  for (let i = open; i < legacySrc.length; i++) {
    if (legacySrc[i] === '[') depth++;
    else if (legacySrc[i] === ']' && --depth === 0) { body = legacySrc.slice(open, i + 1); break; }
  }
  if (!body) return null;
  const out = new Map();
  for (const row of splitTopLevelObjects(body)) {
    const id = (row.match(/\bid:\s*'([a-z0-9_]+)'/) || [])[1];
    if (!id) continue;
    const reward = (row.match(/reward:\s*\{([^{}]*)\}/) || [])[1] || '';
    const item = (reward.match(/\bitem:\s*'([a-z0-9_]+)'/) || [])[1] || null;
    const qty = item ? Number((reward.match(/\bqty:\s*(\d+)/) || [])[1] ?? 1) : 0;
    out.set(id, item ? { [item]: qty } : {});
  }
  return out;
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

  const legacySrc = over.legacy ?? await readFile(LEGACY, 'utf8');
  const sql = over.sql ?? await readFile(MIG, 'utf8');

  const defs = parseQuestDefs(legacySrc);
  if (!defs) return ['CONTROL: QUEST_DEFS could not be located in src/legacy.js — the authored side is unreadable.'];
  if (defs.size < 5) problems.push(`CONTROL: QUEST_DEFS yielded ${defs.size} rows, expected >= 5`);

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

  // ── COMPLETENESS: an authored QUEST_DEFS item must be server-credited ──
  for (const [id, items] of defs) {
    if (!Object.keys(items).length) continue;
    if (!cat.has(id)) {
      problems.push(`QUEST_DEFS '${id}' pays ${show(items)} but has NO items in goal-catalogue.js QUEST_REWARDS — `
        + 'the server cannot credit it, so completeQuest would client-mint it and the next envelope would erase it. '
        + 'This is the phantom-reward bug being re-authored.');
    }
  }
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

  // ── VALUE PARITY across all three ──
  for (const [id, items] of cat) {
    const fromDefs = defs.get(id);
    if (fromDefs === undefined) {
      problems.push(`goal-catalogue.js authors items for '${id}' but QUEST_DEFS has no such quest — a reward nobody can earn.`);
    } else if (!same(items, fromDefs)) {
      problems.push(`'${id}': QUEST_DEFS shows ${show(fromDefs)} but goal-catalogue.js authors ${show(items)} — `
        + 'the player is promised one thing and the server pays another.');
    }
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

  return problems;
}

// ── --list ──────────────────────────────────────────────────────────────────
async function list() {
  const { QUEST_REWARDS, questRewardItems } = await import('../src/data/goal-catalogue.js');
  const defs = parseQuestDefs(await readFile(LEGACY, 'utf8'));
  const seed = parseSeed(await readFile(MIG, 'utf8'));
  const ids = new Set([...Object.keys(QUEST_REWARDS), ...(defs ? defs.keys() : []), ...(seed ? seed.keys() : [])]);
  process.stdout.write('quest        QUEST_DEFS (legacy.js)   QUEST_REWARDS (data)     hr_quest_rewards (sql)\n');
  for (const id of [...ids].sort()) {
    const a = defs?.get(id); const b = QUEST_REWARDS[id] ? questRewardItems(QUEST_REWARDS[id]) : undefined;
    const c = seed?.get(id);
    process.stdout.write(`${id.padEnd(13)}${show(a).padEnd(25)}${show(b).padEnd(25)}${show(c)}\n`);
  }
}

/* ── --selftest / --mutate ───────────────────────────────────────────────────
   A guard nobody has watched FAIL is a guard nobody knows works. Each mutation
   below plants exactly one defect class into an in-memory copy of one of the
   three sources and requires the guard to catch it. The base run must be clean
   first: a mutation proof on an already-red tree proves nothing. */
const MUTATIONS = [
  { name: 'legacy qty drift (player promised 5, server pays 30)',
    apply: (s) => ({ legacy: s.legacy.replace("item:'shrimp',qty:30", "item:'shrimp',qty:5") }) },
  { name: 'legacy item deleted (the reward silently disappears from the UI)',
    apply: (s) => ({ legacy: s.legacy.replace("reward:{gold:200,item:'shrimp',qty:30}", 'reward:{gold:200}') }) },
  { name: 'legacy authors an item the catalogue does not know (phantom re-authored)',
    apply: (s) => ({ legacy: s.legacy.replace("{id:'gatherer',type:'gather',label:'Gather 15 resources',goal:15,progress:0,reward:{gold:150},done:false}",
      "{id:'gatherer',type:'gather',label:'Gather 15 resources',goal:15,progress:0,reward:{gold:150,item:'logs',qty:9},done:false}") }) },
  { name: 'sql seed qty drift (the number that actually gets credited)',
    apply: (s) => ({ sql: s.sql.replace("('first_cook',  '{\"shrimp\": 30}')", "('first_cook',  '{\"shrimp\": 3}')") }) },
  { name: 'sql seed row removed (server pays gold only)',
    apply: (s) => ({ sql: s.sql.replace("('first_blood', '{\"turnip_seed\": 5}'),\n", '') }) },
  { name: 'sql seed grants an id that exists nowhere (the small_bones class)',
    apply: (s) => ({ sql: s.sql.replace('"wheat_seed": 5', '"small_bones": 5') }) },
  { name: 'catalogue item map emptied (the client stops asking the server for it)',
    apply: (s, cat) => ({ QUEST_REWARDS: { ...cat, first_cook: { ...cat.first_cook, items: {} } } }) },
  { name: 'catalogue qty drift against both other sides',
    apply: (s, cat) => ({ QUEST_REWARDS: { ...cat, first_cook: { ...cat.first_cook, items: { shrimp: 31 } } } }) },
];

async function selftest() {
  const base = { legacy: await readFile(LEGACY, 'utf8'), sql: await readFile(MIG, 'utf8') };
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
    if (over.legacy === base.legacy && over.sql === base.sql && !over.QUEST_REWARDS) {
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

if (process.argv[1]?.endsWith('quest-reward-parity.mjs')) {
  const arg = process.argv[2] || '';
  const run = arg === '--list' ? list().then(() => 0)
    : (arg === '--selftest' || arg === '--mutate') ? selftest()
      : questRewardParityGuard().then((problems) => {
        if (problems.length) {
          for (const p of problems) process.stdout.write(`  FAIL  ${p}\n`);
          process.stdout.write(`\n${problems.length} quest-reward drift(s). The three sides are src/data/goal-catalogue.js, `
            + 'src/legacy.js QUEST_DEFS and supabase/migrations/2026-09-06-quest-item-rewards.sql.\n');
          return 1;
        }
        process.stdout.write('  ok    every quest item reward agrees across data, client and server, and every id is real.\n\nin sync.\n');
        return 0;
      });
  run.then((code) => process.exit(code)).catch((e) => { process.stderr.write(`ERROR: ${e.stack || e.message}\n`); process.exit(2); });
}
