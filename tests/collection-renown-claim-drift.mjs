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
//   0 gems; every threshold is reachable (items ≤ distinct MONSTERS drops,
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

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Split a `[ {…}, {…} ]` array body into its TOP-LEVEL `{…}` objects, honouring
   nested braces (the rows carry `test: function(s){ … }`). */
function topLevelObjects(arrayBody) {
  const out = [];
  let depth = 0, start = -1;
  for (let i = 0; i < arrayBody.length; i++) {
    const c = arrayBody[i];
    if (c === '{') { if (depth === 0) start = i; depth++; }
    else if (c === '}') { depth--; if (depth === 0 && start >= 0) { out.push(arrayBody.slice(start, i + 1)); start = -1; } }
  }
  return out;
}

/* Extract the `reward: { … }` object's gold/gems from one row. */
function rewardOf(row) {
  const at = row.indexOf('reward:');
  if (at < 0) return { gold: 0, gems: 0 };
  const open = row.indexOf('{', at);
  let depth = 0, end = -1;
  for (let i = open; i < row.length; i++) {
    if (row[i] === '{') depth++;
    else if (row[i] === '}' && --depth === 0) { end = i; break; }
  }
  const rw = row.slice(open, end + 1);
  return {
    gold: Number((rw.match(/\bgold:\s*(\d+)/) || [])[1] || 0),
    gems: Number((rw.match(/\bgems:\s*(\d+)/) || [])[1] || 0),
  };
}

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

/* Parse the authored MILESTONES rows as DATA: {id, label, domain, goal, gold, gems}. */
export function parseClientMilestones(cl) {
  const msAt = cl.indexOf('var MILESTONES');
  if (msAt < 0) return null;
  const open = cl.indexOf('[', msAt);
  let depth = 0, end = -1;
  for (let i = open; i < cl.length; i++) {
    if (cl[i] === '[') depth++;
    else if (cl[i] === ']' && --depth === 0) { end = i; break; }
  }
  return topLevelObjects(cl.slice(open, end + 1)).map((row) => ({
    id: (row.match(/\bid:\s*'([a-zA-Z0-9_]+)'/) || [])[1] || null,
    label: (row.match(/\blabel:\s*'([^']*)'/) || [])[1] || null,
    domain: (row.match(/\bdomain:\s*'([a-z]+)'/) || [])[1] || null,
    goal: (m => (m ? Number(m[1]) : null))(row.match(/\bgoal:\s*(\d+)/)),
    test: /\btest:\s*function/.test(row),
    ...rewardOf(row),
  }));
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
export function checkCollection({ catalogue, monsterTotal, monsters, clientSrc, chainEnd }) {
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

  // ── (2) collection-log.js authored MILESTONES, as data, both directions ──
  const rows = parseClientMilestones(clientSrc);
  ok(!!rows, 'CONTROL: MILESTONES could not be located in collection-log.js.');
  if (rows) {
    ok(rows.length === catIds.length,
      `CONTROL: MILESTONES yielded ${rows.length} rows; the catalogue has ${catIds.length}.`);
    const seen = new Set();
    for (const r of rows) {
      ok(!!r.id, 'a MILESTONES row has no id.');
      if (!r.id) continue;
      ok(!seen.has(r.id), `MILESTONES row '${r.id}' appears twice.`);
      seen.add(r.id);
      ok(!r.test, `MILESTONES row '${r.id}' carries a test function — earned is decided by ONE function over server counts.`);
      ok(!!r.label, `MILESTONES row '${r.id}' has no label.`);
      const cat = catalogue[r.id];
      ok(!!cat, `MILESTONES row '${r.id}' is ABSENT from collection-milestones.js COLLECTION_MILESTONES.`);
      if (!cat) continue;
      ok(r.domain === cat.domain, `collection '${r.id}' client domain='${r.domain}' != catalogue '${cat.domain}'`);
      ok(r.goal === cat.threshold, `collection '${r.id}' client goal=${r.goal} != catalogue threshold ${cat.threshold}`);
      ok(cat.gold === r.gold, `collection '${r.id}' client gold=${r.gold} != catalogue ${cat.gold}`);
      ok((cat.gems || 0) === r.gems, `collection '${r.id}' client gems=${r.gems} != catalogue ${cat.gems || 0}`);
    }
    for (const id of catIds) ok(seen.has(id), `catalogue milestone '${id}' has no authored MILESTONES row in collection-log.js.`);
    const hAll = rows.find((r) => r.id === 'hunterAll');
    ok(hAll && hAll.goal === monCount, `client hunterAll goal=${hAll && hAll.goal} != monsters.js count ${monCount}`);
  }

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
  const drops = new Set();
  for (const m of Object.values(monsters)) for (const d of (m.drops || [])) if (d && d.id) drops.add(d.id);
  for (const [id, c] of Object.entries(catalogue)) {
    if (c.domain === 'items') ok(c.threshold <= drops.size,
      `collection '${id}' needs ${c.threshold} distinct combat drops; only ${drops.size} exist in MONSTERS[*].drops — unreachable`);
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
    clientSrc: await readFile(join(ROOT, 'src', 'features', 'collection-log.js'), 'utf8'),
    chainEnd: await chainEndMilestoneSql(),
  }));

  // ── RENOWN (2) renown.js authored RANKS ──────────────────────────────────
  const rn = await readFile(join(ROOT, 'src', 'features', 'renown.js'), 'utf8');
  const ranksAt = rn.indexOf('var RANKS');
  ok(ranksAt >= 0, 'CONTROL: RANKS could not be located in renown.js.');
  if (ranksAt >= 0) {
    const open = rn.indexOf('[', ranksAt);
    let depth = 0, end = -1;
    for (let i = open; i < rn.length; i++) {
      if (rn[i] === '[') depth++;
      else if (rn[i] === ']' && --depth === 0) { end = i; break; }
    }
    const body = rn.slice(open, end + 1);
    const rows = topLevelObjects(body);
    ok(rows.length >= 11, `CONTROL: RANKS yielded ${rows.length} rows, expected >= 11.`);
    const seen = new Set();
    for (const row of rows) {
      const id = (row.match(/id:\s*'([a-z]+)'/) || [])[1];
      if (!id) continue;
      const min = Number((row.match(/\bmin:\s*(\d+)/) || [])[1] || 0);
      const { gold, gems } = rewardOf(row);
      const cat = RENOWN_RANK_REWARDS[id];
      if (gold > 0 || gems > 0) {
        ok(!!cat, `renown.js rank '${id}' has a reward but is ABSENT from renown-ranks.js RENOWN_RANK_REWARDS.`);
        if (cat) {
          seen.add(id);
          ok(cat.min === min, `renown '${id}' client min=${min} != catalogue ${cat.min}`);
          ok(cat.gold === gold, `renown '${id}' client gold=${gold} != catalogue ${cat.gold}`);
          ok((cat.gems || 0) === gems, `renown '${id}' client gems=${gems} != catalogue ${cat.gems || 0}`);
        }
      } else {
        ok(!cat, `renown.js rank '${id}' has NO reward but IS in RENOWN_RANK_REWARDS — a no-reward rank never fires a claim.`);
      }
    }
    for (const id of Object.keys(RENOWN_RANK_REWARDS)) {
      ok(seen.has(id), `catalogue rank '${id}' has no matching rewarded RANKS row in renown.js.`);
    }
  }

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
    clientSrc: await readFile(join(ROOT, 'src', 'features', 'collection-log.js'), 'utf8'),
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
  const MUT = [
    ['drop the hunter40 SQL arm',
      () => ({ ...base, chainEnd: { ...base.chainEnd, sql: base.chainEnd.sql.replace(/\n\s*when 'hunter40'[^\n]*/, '') } })],
    ['hunter40 gold 9000 in the client rows only',
      () => ({ ...base, clientSrc: sub(base.clientSrc, "domain: 'monsters', goal: 40,  reward: { gold: 8000 }", "domain: 'monsters', goal: 40,  reward: { gold: 9000 }") })],
    ['hunter40 goal 45 in the client rows only',
      () => ({ ...base, clientSrc: sub(base.clientSrc, "domain: 'monsters', goal: 40,", "domain: 'monsters', goal: 45,") })],
    ['collect75 domain monsters in the client rows only',
      () => ({ ...base, clientSrc: sub(base.clientSrc, "label: 'Curator',             domain: 'items',", "label: 'Curator',             domain: 'monsters',") })],
    ['collect125 = 141 (catalogue, client and SQL together — unreachable)',
      () => ({ ...base, catalogue: cat({ collect125: { threshold: 141 } }),
        clientSrc: sub(base.clientSrc, 'goal: 125,', 'goal: 141,'),
        chainEnd: { ...base.chainEnd, sql: base.chainEnd.sql.replace("v_thresh := 125;", "v_thresh := 141;") } })],
    ['collect75 gems 5 (catalogue, client and SQL together — a new gem faucet)',
      () => ({ ...base, catalogue: cat({ collect75: { gems: 5 } }),
        clientSrc: sub(base.clientSrc, 'reward: { gold: 10000 }', 'reward: { gold: 10000, gems: 5 }'),
        chainEnd: { ...base.chainEnd, sql: base.chainEnd.sql.replace(/(when 'collect75'[^\n]*v_gems := )0;/, '$15;') } })],
    ['an older file picked as the chain end (2026-08-22)',
      async () => ({ ...base, chainEnd: await chainEndMilestoneSql(order.slice(0, order.indexOf('2026-08-22-collection-claim.sql') + 1)) })],
    ['no file restates the function (chain end absent)',
      async () => ({ ...base, chainEnd: await chainEndMilestoneSql([]) })],
    ['hunter60 gold 7000 everywhere (ladder gold not increasing)',
      () => ({ ...base, catalogue: cat({ hunter60: { gold: 7000 } }),
        clientSrc: sub(base.clientSrc, 'reward: { gold: 15000 } }', 'reward: { gold: 7000 } }'),
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
      console.log('collection-renown-claim-drift — data modules, client rows, and the chain-end migration SQL all agree; ladders ascend and are reachable.');
    });
  }
}
