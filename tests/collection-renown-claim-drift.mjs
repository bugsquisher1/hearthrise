#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/collection-renown-claim-drift.mjs — THE THREE-WAY BIND for the
// COLLECTION-MILESTONE and RENOWN-RANK claim catalogues.
//
// Each reward catalogue lives in THREE places that must never disagree:
//   COLLECTION
//     (1) src/data/collection-milestones.js       — the single source
//     (2) src/features/collection-log.js MILESTONES — what the player SEES
//     (3) supabase/migrations/2026-08-22-collection-claim.sql — what the server
//         CREDITS (the embedded CASE catalogue), plus the hunterAll threshold vs
//         the monster-catalogue size in src/data/monsters.js.
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

export async function collectionRenownClaimDriftGuard() {
  const problems = [];
  const ok = (cond, msg) => { if (!cond) problems.push(msg); };

  // ── MONSTER_TOTAL vs the actual catalogue ────────────────────────────────
  const monCount = Object.keys(MONSTERS).length;
  ok(MONSTER_TOTAL === monCount,
    `collection-milestones.js MONSTER_TOTAL=${MONSTER_TOTAL} != src/data/monsters.js count ${monCount} — `
    + 'the hunterAll ("slay every monster") threshold has drifted. Update MONSTER_TOTAL AND the SQL CASE.');
  ok(COLLECTION_MILESTONES.hunterAll.threshold === MONSTER_TOTAL,
    `hunterAll.threshold=${COLLECTION_MILESTONES.hunterAll.threshold} != MONSTER_TOTAL ${MONSTER_TOTAL}`);

  // ── (2) collection-log.js authored MILESTONES ────────────────────────────
  const cl = await readFile(join(ROOT, 'src', 'features', 'collection-log.js'), 'utf8');
  const msAt = cl.indexOf('var MILESTONES');
  ok(msAt >= 0, 'CONTROL: MILESTONES could not be located in collection-log.js.');
  if (msAt >= 0) {
    const open = cl.indexOf('[', msAt);
    let depth = 0, end = -1;
    for (let i = open; i < cl.length; i++) {
      if (cl[i] === '[') depth++;
      else if (cl[i] === ']' && --depth === 0) { end = i; break; }
    }
    const body = cl.slice(open, end + 1);
    const rows = topLevelObjects(body);
    ok(rows.length === 4, `CONTROL: MILESTONES yielded ${rows.length} rows, expected 4.`);
    const seen = new Set();
    for (const row of rows) {
      const id = (row.match(/id:\s*'([a-zA-Z0-9_]+)'/) || [])[1];
      if (!id) continue;
      seen.add(id);
      const cat = COLLECTION_MILESTONES[id];
      ok(!!cat, `MILESTONES row '${id}' is ABSENT from collection-milestones.js COLLECTION_MILESTONES.`);
      if (!cat) continue;
      const { gold, gems } = rewardOf(row);
      ok(cat.gold === gold, `collection '${id}' client gold=${gold} != catalogue ${cat.gold}`);
      ok((cat.gems || 0) === gems, `collection '${id}' client gems=${gems} != catalogue ${cat.gems || 0}`);
    }
    for (const id of Object.keys(COLLECTION_MILESTONES)) {
      ok(seen.has(id), `catalogue milestone '${id}' has no authored MILESTONES row in collection-log.js.`);
    }
  }

  // ── (3) collection-claim.sql CASE ────────────────────────────────────────
  const cSql = await readFile(join(ROOT, 'supabase', 'migrations', '2026-08-22-collection-claim.sql'), 'utf8');
  for (const [id, cat] of Object.entries(COLLECTION_MILESTONES)) {
    const re = new RegExp(
      `when\\s+'${id}'\\s+then\\s+v_domain\\s*:=\\s*'([a-z]+)';\\s*v_thresh\\s*:=\\s*(\\d+);\\s*v_gold\\s*:=\\s*(\\d+);\\s*v_gems\\s*:=\\s*(\\d+);`);
    const m = cSql.match(re);
    ok(!!m, `SQL hr_claim_milestone is missing/misshapen CASE arm for '${id}'.`);
    if (m) {
      ok(m[1] === cat.domain, `SQL collection '${id}' domain '${m[1]}' != catalogue '${cat.domain}'`);
      ok(Number(m[2]) === cat.threshold, `SQL collection '${id}' threshold ${m[2]} != catalogue ${cat.threshold}`);
      ok(Number(m[3]) === cat.gold, `SQL collection '${id}' gold ${m[3]} != catalogue ${cat.gold}`);
      ok(Number(m[4]) === (cat.gems || 0), `SQL collection '${id}' gems ${m[4]} != catalogue ${cat.gems || 0}`);
    }
  }

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

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('collection-renown-claim-drift.mjs')) {
  collectionRenownClaimDriftGuard().then((p) => {
    if (p.length) { console.log('collection-renown-claim-drift — FAILED:'); for (const x of p) console.log(`  ✗ ${x}`); process.exit(1); }
    console.log('collection-renown-claim-drift — data modules, client rows, and migration SQL all agree.');
  });
}
