#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/collection-renown-claim-drift.mjs — THE THREE-WAY BIND for the
// COLLECTION-MILESTONE and RENOWN-RANK claim catalogues.
//
// Each reward catalogue lives in THREE places that must never disagree:
//   COLLECTION
//     (1) src/data/collection-milestones.js       — the single source
//     (2) src/features/collection-log.js MILESTONES — what the player SEES
//     (3) the CHAIN-END migration restating hr_claim_milestone__ungated (the
//         LAST such file in tests/schema-apply-order.json `order`) — what the
//         server CREDITS (the CASE catalogue), plus the hunterAll threshold vs
//         the monster-catalogue size in src/data/monsters.js.
//   Checked both directions on id/domain/goal/gold/gems; per domain the
//   thresholds AND gold strictly increase; rungs outside the original four pay
//   0 gems; every threshold is reachable (items ≤ distinct MONSTERS drops
//   that are not bind-on-pickup — a BoP key never makes a rung reachable,
//   monsters ≤ MONSTER_TOTAL). `--selftest` plants each defect and must see red.
//   RENOWN
//     (1) src/data/renown-ranks.js                 — the single source
//     (2) src/features/renown.js RANKS             — what the player SEES
//     (3) supabase/migrations/2026-08-22-renown-claim.sql — what the server
//         CREDITS (the embedded CASE catalogue).
//
// A drift means a player is shown one gold/gem number and credited another, or
// a milestone/rank threshold the server verifies against differs from the one
// the ladder displays. This guard fails the build on either.
//
// Run standalone:  node tests/collection-renown-claim-drift.mjs
// Also invoked as a guard by tests/run-smoke.mjs.
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { COLLECTION_MILESTONES, MONSTER_TOTAL } from '../src/data/collection-milestones.js';
import { RENOWN_RANK_REWARDS } from '../src/data/renown-ranks.js';
import { MONSTERS } from '../src/data/monsters.js';
import { ITEMS } from '../src/data/items.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* THE CHAIN-END SQL: the LAST file in schema-apply-order.json `order` that
   restates hr_claim_milestone__ungated — never a filename sort, never a
   hard-coded file (the old guard read 2026-08-22 forever). */
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

/* The SQL CASE arms as data. */
export function parseSqlArms(sql) {
  const out = {};
  const re = /when\s+'([a-zA-Z0-9_]+)'\s+then\s+v_domain\s*:=\s*'([a-z]+)';\s*v_thresh\s*:=\s*(\d+);\s*v_gold\s*:=\s*(\d+);\s*v_gems\s*:=\s*(\d+);/g;
  let m;
  while ((m = re.exec(sql))) out[m[1]] = { domain: m[2], threshold: Number(m[3]), gold: Number(m[4]), gems: Number(m[5]) };
  return out;
}

/* The ids the ORIGINAL 2026-08-22 catalogue shipped with gems. Every other rung
   is gold-only: no new premium-currency faucet rides a content pack. */
const ORIGINAL_FOUR = new Set(['hunter10', 'hunterAll', 'collect50', 'collect100']);

/* The collection half, pure over its inputs so --selftest can mutate each. */
export function checkCollection({ catalogue, monsterTotal, monsters, chainEnd, items = ITEMS }) {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };
  const catIds = Object.keys(catalogue);

  // ── MONSTER_TOTAL vs the actual catalogue ────────────────────────────────
  const monCount = Object.keys(monsters).length;
  ok(monsterTotal === monCount,
    `collection-milestones.js MONSTER_TOTAL=${monsterTotal} != src/data/monsters.js count ${monCount} — `
    + 'the hunterAll ("slay every monster") threshold has drifted. Update MONSTER_TOTAL AND the SQL CASE.');
  ok(catalogue.hunterAll && catalogue.hunterAll.threshold === monsterTotal,
    `hunterAll.threshold=${catalogue.hunterAll && catalogue.hunterAll.threshold} != MONSTER_TOTAL ${monsterTotal}`);

  // (2, the client's MILESTONES rows in src/features/collection-log.js, retired with the
  //  old client on 2026-10-17: the catalogue and the SQL are the two sides now.)

  // ── (3) the chain-end SQL CASE, both directions ─────────────────────────
  ok(!!chainEnd, 'CONTROL: no file in schema-apply-order.json `order` restates hr_claim_milestone__ungated.');
  if (chainEnd) {
    const arms = parseSqlArms(chainEnd.sql);
    for (const [id, cat] of Object.entries(catalogue)) {
      const a = arms[id];
      ok(!!a, `SQL ${chainEnd.file}: hr_claim_milestone__ungated is missing/misshapen CASE arm for '${id}'.`);
      if (!a) continue;
      ok(a.domain === cat.domain, `SQL collection '${id}' domain '${a.domain}' != catalogue '${cat.domain}'`);
      ok(a.threshold === cat.threshold, `SQL collection '${id}' threshold ${a.threshold} != catalogue ${cat.threshold}`);
      ok(a.gold === cat.gold, `SQL collection '${id}' gold ${a.gold} != catalogue ${cat.gold}`);
      ok(a.gems === (cat.gems || 0), `SQL collection '${id}' gems ${a.gems} != catalogue ${cat.gems || 0}`);
    }
    for (const id of Object.keys(arms)) ok(!!catalogue[id], `SQL ${chainEnd.file} has an arm '${id}' the catalogue does not.`);
  }

  // ── LADDER SHAPE: per domain, thresholds AND gold strictly increase ─────
  for (const d of ['monsters', 'items']) {
    const ladder = Object.entries(catalogue).filter(([, c]) => c.domain === d)
      .sort((x, y) => x[1].threshold - y[1].threshold);
    for (let i = 1; i < ladder.length; i++) {
      const [pid, p] = ladder[i - 1], [id, c] = ladder[i];
      ok(c.threshold > p.threshold, `${d} ladder: '${id}' threshold ${c.threshold} is not above '${pid}' ${p.threshold}`);
      ok(c.gold > p.gold, `${d} ladder: '${id}' gold ${c.gold} is not above '${pid}' ${p.gold} (thresholds ascending)`);
    }
  }
  for (const [id, c] of Object.entries(catalogue)) {
    ok(['monsters', 'items'].includes(c.domain), `collection '${id}' domain '${c.domain}' is neither monsters nor items`);
    if (!ORIGINAL_FOUR.has(id)) ok(!(c.gems > 0), `collection '${id}' pays ${c.gems} gems — new rungs are gold-only (no new gem faucet)`);
  }

  // ── REACHABILITY ─────────────────────────────────────────────────────────
  // Security 2026-09-26: BoP drops (dungeon keys) are excluded from the pool,
  // so no rung can depend on a bind-on-pickup-only drop.
  const drops = new Set();
  for (const m of Object.values(monsters)) for (const d of (m.drops || [])) {
    if (d && d.id && !(items[d.id] && items[d.id].bop)) drops.add(d.id);
  }
  for (const [id, c] of Object.entries(catalogue)) {
    if (c.domain === 'items') ok(c.threshold <= drops.size,
      `collection '${id}' needs ${c.threshold} distinct combat drops; only ${drops.size} non-BoP ids exist in MONSTERS[*].drops — unreachable`);
    if (c.domain === 'monsters') ok(c.threshold <= monsterTotal,
      `collection '${id}' needs ${c.threshold} distinct monsters; MONSTER_TOTAL is ${monsterTotal} — unreachable`);
  }
  return problems;
}

export async function collectionRenownClaimDriftGuard() {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };

  problems.push(...checkCollection({
    catalogue: COLLECTION_MILESTONES,
    monsterTotal: MONSTER_TOTAL,
    monsters: MONSTERS,
    chainEnd: await chainEndMilestoneSql(),
  }));

  // (RENOWN (2), the client's RANKS rows in src/features/renown.js, retired with the old client.)

  // ── RENOWN (3) renown-claim.sql CASE ─────────────────────────────────────
  const rSql = await readFile(join(ROOT, 'supabase', 'migrations', '2026-08-22-renown-claim.sql'), 'utf8');
  for (const [id, cat] of Object.entries(RENOWN_RANK_REWARDS)) {
    const re = new RegExp(
      `when\\s+'${id}'\\s+then\\s+v_min\\s*:=\\s*(\\d+);\\s*v_gold\\s*:=\\s*(\\d+);\\s*v_gems\\s*:=\\s*(\\d+);`);
    const m = rSql.match(re);
    ok(!!m, `SQL hr_claim_rank is missing/misshapen CASE arm for rank '${id}'.`);
    if (m) {
      ok(Number(m[1]) === cat.min, `SQL renown '${id}' min ${m[1]} != catalogue ${cat.min}`);
      ok(Number(m[2]) === cat.gold, `SQL renown '${id}' gold ${m[2]} != catalogue ${cat.gold}`);
      ok(Number(m[3]) === (cat.gems || 0), `SQL renown '${id}' gems ${m[3]} != catalogue ${cat.gems || 0}`);
    }
  }
  // peasant (no reward) must NOT be a claimable arm.
  ok(!/when\s+'peasant'\s+then/.test(rSql),
    'SQL hr_claim_rank has a peasant arm — peasant has no reward and must fall through to unknown_rank.');

  return problems;
}

/* ── --selftest: each planted defect must turn the collection half RED ──── */
async function selftest() {
  const base = {
    catalogue: COLLECTION_MILESTONES,
    monsterTotal: MONSTER_TOTAL,
    monsters: MONSTERS,
    chainEnd: await chainEndMilestoneSql(),
  };
  const baseRed = checkCollection(base);
  if (baseRed.length) { console.log('selftest: the UNMUTATED inputs are red — fix the guard first:'); baseRed.forEach((x) => console.log(`  ✗ ${x}`)); return 1; }
  const cat = (patch) => Object.fromEntries(Object.entries(COLLECTION_MILESTONES)
    .map(([id, c]) => [id, patch[id] ? { ...c, ...patch[id] } : c]));
  const sub = (src, find, repl) => {
    if (src.split(find).length !== 2) throw new Error(`selftest anchor not unique: ${find}`);
    return src.replace(find, () => repl);
  };
  const order = JSON.parse(await readFile(join(ROOT, 'tests', 'schema-apply-order.json'), 'utf8')).order;
  /* The two REACHABILITY arms are DERIVED from the live pool of distinct
     non-BoP drop ids, never hard-coded: a content pack that grows the pool
     (Field Salvage took it 133 -> 181) turned the old literals '141' and
     '9 lucky ids' reachable, and the arms went MISSED. They are run on the live
     roster AND on the roster with the salvage rows stripped, so the proof holds
     on both sides of the pack. */
  const poolOf = (monsters) => {
    const ids = [];
    for (const m of Object.values(monsters)) for (const d of (m.drops || [])) {
      if (d && d.id && !(ITEMS[d.id] && ITEMS[d.id].bop) && !ids.includes(d.id)) ids.push(d.id);
    }
    /* flag the rarest rows first (lucky, then salvage), the ones a player would
       think of as "the long chase", then anything else the count still needs */
    const rank = (id) => (Object.values(monsters).some((m) => (m.drops || []).some((d) => d.id === id && d.lucky)) ? 0
      : Object.values(monsters).some((m) => (m.drops || []).some((d) => d.id === id && d.salvage)) ? 1 : 2);
    return ids.map((id, i) => ({ id, i, r: rank(id) })).sort((a, b) => a.r - b.r || a.i - b.i).map((x) => x.id);
  };
  const reachArms = (monsters, label) => {
    const pool = poolOf(monsters);
    const over = pool.length + 1;
    const nBop = pool.length - 125 + 1;
    const b = { ...base, monsters };
    return [
      [`collect125 = ${over} = pool+1 (catalogue and SQL together — unreachable; ${label})`,
        () => ({ ...b, catalogue: cat({ collect125: { threshold: over } }),
          chainEnd: { ...b.chainEnd, sql: b.chainEnd.sql.replace('v_thresh := 125;', `v_thresh := ${over};`) } })],
      [`collect125 reachable only through BoP drops (${nBop} = pool-125+1 ids flagged bop; ${label})`,
        () => {
          const items = { ...ITEMS };
          for (const id of pool.slice(0, nBop)) items[id] = { ...items[id], bop: true };
          return { ...b, items };
        }],
    ];
  };
  const stripped = Object.fromEntries(Object.entries(MONSTERS)
    .map(([id, m]) => [id, { ...m, drops: (m.drops || []).filter((d) => !d.salvage) }]));
  const strippedRed = checkCollection({ ...base, monsters: stripped });
  if (strippedRed.length) { console.log('selftest: the roster WITHOUT salvage rows is red — fix the guard first:'); strippedRed.forEach((x) => console.log(`  ✗ ${x}`)); return 1; }
  const MUT = [
    ...reachArms(MONSTERS, 'live roster'),
    ...reachArms(stripped, 'roster without salvage rows'),
    ['drop the hunter40 SQL arm',
      () => ({ ...base, chainEnd: { ...base.chainEnd, sql: base.chainEnd.sql.replace(/\n\s*when 'hunter40'[^\n]*/, '') } })],
    ['collect75 gems 5 (catalogue and SQL together — a new gem faucet)',
      () => ({ ...base, catalogue: cat({ collect75: { gems: 5 } }),
        chainEnd: { ...base.chainEnd, sql: base.chainEnd.sql.replace(/(when 'collect75'[^\n]*v_gems := )0;/, '$15;') } })],
    ['an older file picked as the chain end (2026-08-22)',
      async () => ({ ...base, chainEnd: await chainEndMilestoneSql(order.slice(0, order.indexOf('2026-08-22-collection-claim.sql') + 1)) })],
    ['no file restates the function (chain end absent)',
      async () => ({ ...base, chainEnd: await chainEndMilestoneSql([]) })],
    ['hunter60 gold 7000 everywhere (ladder gold not increasing)',
      () => ({ ...base, catalogue: cat({ hunter60: { gold: 7000 } }),
        chainEnd: { ...base.chainEnd, sql: base.chainEnd.sql.replace("v_thresh := 60;  v_gold := 15000;", "v_thresh := 60;  v_gold := 7000;") } })],
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

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('collection-renown-claim-drift.mjs')) {
  if (process.argv.includes('--selftest')) {
    selftest().then((c) => process.exit(c), (e) => { console.error('harness:', e); process.exit(2); });
  } else {
    collectionRenownClaimDriftGuard().then((p) => {
      if (p.length) { console.log('collection-renown-claim-drift — FAILED:'); for (const x of p) console.log(`  ✗ ${x}`); process.exit(1); }
      console.log('collection-renown-claim-drift — the data modules and the chain-end migration SQL agree; ladders ascend and are reachable.');
    });
  }
}
