#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/collection-renown-claim-drift.mjs — THE COLLECTION-MILESTONE CLAIM BIND
// (designer ruling 2026-10-22, lane c-monster-ladders: the ladders are shares of
// what a player can MEET, and no rung pays premium currency).
//
// The catalogue lives in two places that must never disagree:
//   (1) src/data/collection-milestones.js — the single source: per rung its
//       domain, `part` of `of` of the reachable roster, and its gold;
//   (2) the CHAIN-END migration restating hr_claim_milestone__ungated (the LAST
//       such file in tests/schema-apply-order.json `order`) — what the server
//       CREDITS (its CASE arms).
// And both must be EARNABLE today:
//   · the reachable roster, counted HERE from the raw tables (every monster on an
//     OPEN ground's pockets, packs and hunt spawn rows; a staged ground is out;
//     their drops less bind-on-pickup), equals the module's REACHABLE (the rows
//     gen-hunt-sessions writes to hr_hunt_roster / hr_hunt_loot_roster);
//   · per domain the rungs step part 1..of with one `of`, the top rung is all of
//     it, gold strictly rises, and every goal ceil(reach x part / of) lies in
//     [1, reach] and strictly rises (so reach >= of): a goal above what a player
//     can meet is red;
//   · no rung pays premium currency (Tyler L12): no `gems` in the catalogue, no
//     v_gems / hr_wallet_credit in the credited body.
// `--selftest` plants each defect and must see red.
//   RENOWN — retired in the 2026-10-14 demolition. The file keeps its name and its
//   exported guard because tests/run-smoke.mjs imports them.
//
// Run standalone:  node tests/collection-renown-claim-drift.mjs
// Also invoked as a guard by tests/run-smoke.mjs.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { COLLECTION_MILESTONES, REACHABLE, goalOf } from '../src/data/collection-milestones.js';
import { MONSTERS } from '../src/data/monsters.js';
import { ITEMS } from '../src/data/items.js';
import { HUNT_GROUNDS } from '../src/data/hunt-grounds.js';
import { HUNT_INDEX } from '../src/data/hunts.js';
import { isMain } from './_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* THE CHAIN-END SQL: the LAST file in schema-apply-order.json `order` that
   restates hr_claim_milestone__ungated — never a filename sort, never a
   hard-coded file. */
export async function chainEndMilestoneSql(orderOverride) {
  const order = orderOverride
    || JSON.parse(await readFile(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8')).order;
  const RE = /create\s+or\s+replace\s+function\s+public\.hr_claim_milestone__ungated\b/i;
  let end = null;
  for (const f of order) {
    let txt;
    try { txt = await readFile(join(ROOT, 'supabase', 'migrations', f), 'utf8'); } catch { continue; }
    if (RE.test(txt)) end = { file: f, sql: txt };
  }
  return end;
}

/* The credited function's body (create ... through its closing $$), so a comment elsewhere in the file never counts. */
function bodyOf(sql) {
  const at = sql.search(/create\s+or\s+replace\s+function\s+public\.hr_claim_milestone__ungated\b/i);
  if (at < 0) return '';
  const open = sql.indexOf('$$', at);
  const close = sql.indexOf('$$', open + 2);
  return open < 0 || close < 0 ? '' : sql.slice(open, close + 2);
}

/* The SQL CASE arms as data. */
export function parseSqlArms(sql) {
  const out = {};
  const re = /when\s+'([a-zA-Z0-9_]+)'\s+then\s+v_domain\s*:=\s*'([a-z]+)';\s*v_part\s*:=\s*(\d+);\s*v_of\s*:=\s*(\d+);\s*v_gold\s*:=\s*(\d+);/g;
  let m;
  while ((m = re.exec(bodyOf(sql)))) out[m[1]] = { domain: m[2], part: Number(m[3]), of: Number(m[4]), gold: Number(m[5]) };
  return out;
}

/* What a player can meet and loot, counted HERE (never through the module's helper): the open grounds' pockets, packs and
   hunt spawn rows; a ground whose hunt is `staged` is out; the loot is their drops less bind-on-pickup. */
export function reachableHere(monsters, items, grounds = HUNT_GROUNDS, hunts = HUNT_INDEX) {
  const mons = new Set();
  for (const g of Object.values(grounds)) {
    if (hunts[g.hunt] && hunts[g.hunt].staged === true) continue;
    for (const p of g.pockets) for (const s of [...(p.pack || []), ...p.spawns]) mons.add(s.monster);
    for (const s of ((hunts[g.hunt] || {}).spawns || [])) mons.add(s.monster);
  }
  const loot = new Set();
  for (const id of mons) for (const d of ((monsters[id] || {}).drops || [])) if (!(items[d.id] && items[d.id].bop)) loot.add(d.id);
  return { monsters: [...mons].sort(), loot: [...loot].sort() };
}

const DOMAINS = Object.freeze(['monsters', 'items']);

export function checkCollection({ catalogue, reachable, monsters, items = ITEMS, grounds = HUNT_GROUNDS, hunts = HUNT_INDEX, chainEnd }) {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };

  // ── the module's roster is what a player can meet ─────────────────────────
  const here = reachableHere(monsters, items, grounds, hunts);
  const reach = { monsters: here.monsters.length, items: here.loot.length };
  ok(JSON.stringify(reachable.monsters) === JSON.stringify(here.monsters),
    `collection-milestones.js REACHABLE.monsters (${reachable.monsters.length}) != the ${here.monsters.length} monsters on the open grounds`);
  ok(JSON.stringify(reachable.loot) === JSON.stringify(here.loot),
    `collection-milestones.js REACHABLE.loot (${reachable.loot.length}) != the ${here.loot.length} loot ids the open grounds' monsters drop`);

  // ── no premium currency (Tyler L12) ────────────────────────────────────────
  for (const [id, c] of Object.entries(catalogue)) ok(!('gems' in c) || !(c.gems > 0), `collection '${id}' pays ${c.gems} gems — Crowns are never earned in play (Tyler L12)`);

  // ── the chain-end SQL CASE, both directions ────────────────────────────────
  ok(!!chainEnd, 'CONTROL: no file in schema-apply-order.json `order` restates hr_claim_milestone__ungated.');
  if (chainEnd) {
    const body = bodyOf(chainEnd.sql);
    ok(!/v_gems|hr_wallet_credit/.test(body), `SQL ${chainEnd.file}: the credited body still carries a gem credit (v_gems / hr_wallet_credit)`);
    const arms = parseSqlArms(chainEnd.sql);
    for (const [id, cat] of Object.entries(catalogue)) {
      const a = arms[id];
      ok(!!a, `SQL ${chainEnd.file}: hr_claim_milestone__ungated is missing/misshapen CASE arm for '${id}'.`);
      if (!a) continue;
      for (const k of ['domain', 'part', 'of', 'gold']) ok(a[k] === cat[k], `SQL collection '${id}' ${k} ${a[k]} != catalogue ${cat[k]}`);
    }
    for (const id of Object.keys(arms)) ok(!!catalogue[id], `SQL ${chainEnd.file} has an arm '${id}' the catalogue does not.`);
  }

  // ── each ladder: part 1..of, one `of`, top = all, gold and goals rise, goals within reach ──
  for (const [id, c] of Object.entries(catalogue)) ok(DOMAINS.includes(c.domain), `collection '${id}' domain '${c.domain}' is neither monsters nor items`);
  for (const d of DOMAINS) {
    const ladder = Object.entries(catalogue).filter(([, c]) => c.domain === d).sort((x, y) => x[1].part - y[1].part);
    if (!ladder.length) continue;
    const of = ladder[0][1].of;
    ladder.forEach(([id, c], i) => {
      ok(c.of === of && Number.isInteger(c.part) && c.part === i + 1, `${d} ladder: '${id}' is ${c.part} of ${c.of}, not step ${i + 1} of ${of}`);
      const goal = goalOf(c, reach[d]);
      ok(goal >= 1 && goal <= reach[d], `${d} ladder: '${id}' needs ${goal}, but only ${reach[d]} can be met — unreachable`);
      if (i) {
        const [pid, p] = ladder[i - 1];
        ok(c.gold > p.gold, `${d} ladder: '${id}' gold ${c.gold} is not above '${pid}' ${p.gold}`);
        ok(goal > goalOf(p, reach[d]), `${d} ladder: '${id}' needs ${goal}, no more than '${pid}' (${goalOf(p, reach[d])}): only ${reach[d]} reachable for ${of} rungs`);
      }
    });
    ok(ladder[ladder.length - 1][1].part === of, `${d} ladder: the top rung is ${ladder[ladder.length - 1][1].part} of ${of}, not all of it`);
  }
  return problems;
}

export async function collectionRenownClaimDriftGuard() {
  return checkCollection({ catalogue: COLLECTION_MILESTONES, reachable: REACHABLE, monsters: MONSTERS, chainEnd: await chainEndMilestoneSql() });
}

/* ── --selftest: each planted defect must turn the guard RED ──────────────── */
async function selftest() {
  const base = { catalogue: COLLECTION_MILESTONES, reachable: REACHABLE, monsters: MONSTERS, chainEnd: await chainEndMilestoneSql() };
  const baseRed = checkCollection(base);
  if (baseRed.length) { console.log('selftest: the UNMUTATED inputs are red — fix the guard first:'); baseRed.forEach((x) => console.log(`  ✗ ${x}`)); return 1; }
  const cat = (patch) => Object.fromEntries(Object.entries(COLLECTION_MILESTONES).map(([id, c]) => [id, patch[id] ? { ...c, ...patch[id] } : c]));
  const sql = (from, to) => {
    if (base.chainEnd.sql.split(from).length !== 2) throw new Error(`selftest anchor not unique: ${from}`);
    return { ...base.chainEnd, sql: base.chainEnd.sql.replace(from, () => to) };
  };
  const order = JSON.parse(await readFile(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8')).order;
  const MUT = [
    ['hunter60 asks 7 of 6 (catalogue and SQL together): a goal above what can be met',
      () => ({ ...base, catalogue: cat({ hunter60: { part: 7 } }), chainEnd: sql("v_part := 4; v_of := 6; v_gold := 1200;", "v_part := 7; v_of := 6; v_gold := 15000;") })],
    ['the world shrinks to the Mill Cellar (3 monsters for 6 rungs)',
      () => ({ ...base, grounds: { mill_cellar: HUNT_GROUNDS.mill_cellar }, reachable: reachableHere(MONSTERS, ITEMS, { mill_cellar: HUNT_GROUNDS.mill_cellar }) })],
    ['a staged ground counted (Mosslight Glade opened in the guard, the module unchanged)',
      () => ({ ...base, hunts: { ...HUNT_INDEX, mosslight_glade: { ...HUNT_INDEX.mosslight_glade, staged: false } } })],
    ['a monster with no ground counted by the module',
      () => ({ ...base, reachable: { ...REACHABLE, monsters: [...REACHABLE.monsters, 'zz_ground_less'].sort() } })],
    ['hunterAll pays 25 gems again (catalogue)', () => ({ ...base, catalogue: cat({ hunterAll: { gems: 25 } }) })],
    ['the gem credit back in the SQL body',
      () => ({ ...base, chainEnd: sql("  -- CREDIT (after the guard", "  perform public.hr_wallet_credit(auth.uid(), v_slot, 25, 'x', null);\n  -- CREDIT (after the guard") })],
    ['drop the hunter40 SQL arm', () => ({ ...base, chainEnd: { ...base.chainEnd, sql: base.chainEnd.sql.replace(/\n\s*when 'hunter40'[^\n]*/, '') } })],
    ['collect75 gold 4000 in the SQL only (the catalogue says 1000)', () => ({ ...base, chainEnd: sql("v_part := 3; v_of := 5; v_gold := 1000;", "v_part := 3; v_of := 5; v_gold := 4000;") })],
    ['the top rung is not all of it (hunterAll 5 of 6, hunter85 4 of 6)',
      () => ({ ...base, catalogue: cat({ hunterAll: { part: 5 }, hunter85: { part: 4 } }) })],
    ['hunter60 gold 300 everywhere (ladder gold not rising)',
      () => ({ ...base, catalogue: cat({ hunter60: { gold: 300 } }), chainEnd: sql("v_part := 4; v_of := 6; v_gold := 1200;", "v_part := 4; v_of := 6; v_gold := 300;") })],
    ['an older file picked as the chain end (2026-10-25-hunterall-129.sql)',
      async () => ({ ...base, chainEnd: await chainEndMilestoneSql(order.slice(0, order.indexOf('2026-10-25-hunterall-129.sql') + 1)) })],
    ['no file restates the function (chain end absent)', async () => ({ ...base, chainEnd: await chainEndMilestoneSql([]) })],
  ];
  let missed = 0;
  for (const [name, mk] of MUT) {
    const red = checkCollection(await mk());
    if (red.length) console.log(`  caught  ${name}\n            ${red[0]}`);
    else { console.log(`  MISSED  ${name}`); missed++; }
  }
  if (missed) { console.log(`\ncollection-renown-claim-drift --selftest: ${missed} mutation(s) NOT caught.`); return 1; }
  console.log(`\ncollection-renown-claim-drift --selftest: all ${MUT.length} planted defects caught; the unmutated inputs are green.`);
  return 0;
}

if (isMain(import.meta.url)) {
  if (process.argv.includes('--selftest')) {
    selftest().then((c) => process.exit(c), (e) => { console.error('harness:', e); process.exit(2); });
  } else {
    collectionRenownClaimDriftGuard().then((p) => {
      if (p.length) { console.log('collection-renown-claim-drift — FAILED:'); for (const x of p) console.log(`  ✗ ${x}`); process.exit(1); }
      const g = (d) => Object.values(COLLECTION_MILESTONES).filter((c) => c.domain === d).map((c) => goalOf(c, d === 'monsters' ? REACHABLE.monsters.length : REACHABLE.loot.length)).join('/');
      console.log(`collection-renown-claim-drift — catalogue and chain-end SQL agree; ${REACHABLE.monsters.length} monsters and ${REACHABLE.loot.length} loot ids reachable; goals monsters ${g('monsters')}, items ${g('items')}; no rung pays gems.`);
    });
  }
}
