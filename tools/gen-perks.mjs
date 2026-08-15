#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/gen-perks.mjs — the ROOM RUNG PAYLOAD, extracted, with a drift guard
//
// WHY THIS EXISTS
//   `supabase/functions/hr-accrue/accrual.js` passes `zeroBonus()` — every
//   permanent bonus reads 0 server-side. The consequence that BLOCKS a
//   feature rather than merely shaving it: `noBurn` is the Kitchen rung, so
//   a server that cooked today would burn at the base 25% while the
//   player's Cast-Iron Range says 0%. The server would DESTROY items the
//   client keeps. `src/core/skill-sim.js` refuses artisan accrual for
//   exactly that reason, in writing.
//
//   The numbers live in `const ROOMS={…}` in src/legacy.js — a CLASSIC
//   SCRIPT, which Deno cannot import and an ESM module cannot import (the
//   b222 trap). Same trap as the prices, so the same answer, and it is the
//   answer this repo has already ratified twice (tools/gen-catalogues.mjs,
//   tools/gen-shops.mjs, and the B338-1 starting kit before both): emit a
//   generated copy and make the build fail the moment the two disagree.
//
//   ⚠ AND UNLIKE gen-shops.mjs, THE GENERATED FILE IS LOAD-BEARING AT
//     RUNTIME ON BOTH SIDES. src/legacy.js `getBonus` delegates to
//     src/core/perks.js, which reads this table; so does the Edge Function.
//     That is deliberate and it is the stronger arrangement: a stale
//     generated table makes the two sides wrong TOGETHER (a bug --check
//     catches at the gate) rather than wrong APART (a divergence nothing
//     catches). The whole point of the channel is that the client's number
//     and the server's cannot differ.
//
// WHAT IT READS
//   src/legacy.js   `const ROOMS={` — 8 rooms x 5 rungs.
//                   Each rung's `bk`/`bv` headline pair and its `bx`
//                   secondary map are merged into ONE bonus map per rung,
//                   because that merge is precisely what getBonus did inline
//                   and a consumer should not have to know the shape has two
//                   halves for historical reasons.
//                   `rested` / `restedCap` (the Library's capacity payload)
//                   ride along in ROOM_RUNG_EXTRAS — not a bonus key, but
//                   part of the same rung, and leaving it behind would invite
//                   a SECOND extraction of the same table later.
//
// WHAT IT DELIBERATELY DOES NOT READ
//   The three plot-building perks and the property capstone. They are not a
//   table — they are literals inside getBonus itself (`t+=0.02` and friends).
//   Extracting a literal out of a FUNCTION BODY by regex is the "source-text
//   regex standing in for a numeric assertion" failure this repo has already
//   recorded. They are AUTHORED in src/core/perks.js instead and getBonus
//   now delegates, so there is exactly one copy and nothing to guard.
//
// USAGE
//   node tools/gen-perks.mjs            → (re)write src/data/perks.js
//   node tools/gen-perks.mjs --check    → exit 1 if the committed file differs
//   node tools/gen-perks.mjs --report   → print the extraction, rung by rung
//
//   `--check` is a PREFLIGHT in tests/run-smoke.mjs.
//
// THE FAILURE MODE THIS FILE IS BUILT AGAINST
//   A drift guard that cannot see drift. If an anchor silently missed, this
//   would emit an empty table, `--check` would compare empty to empty, and
//   the guard would be green forever while asserting nothing. So: the room
//   count, the rung count and the KEY SET are all asserted against literals
//   below, independently of the diff. See TRIPWIRES.
// ════════════════════════════════════════════════════════════════════════

import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeDie, sliceLiteral as sliceLiteral_ } from './lib/slice-literal.mjs';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const OUT = join(ROOT, 'src', 'data', 'perks.js');
const die = makeDie('gen-perks');
const read = (rel) => readFile(join(ROOT, rel), 'utf8');
const sliceLiteral = (src, anchor, where) => sliceLiteral_(src, anchor, where, die);

const CHECK = process.argv.includes('--check');
const REPORT = process.argv.includes('--report');

// ── TRIPWIRES ────────────────────────────────────────────────────────────
// Each of these is a fact about the shipped game measured on 2026-08-15, NOT
// a fact about whatever the extraction happens to return. If the game grows a
// ninth room these fail and a human decides whether the growth is intended —
// which is the point. A tripwire that updates itself is a tripwire that has
// never fired.
const EXPECT_ROOMS = 8;
const EXPECT_RUNGS = 5;
// Every bonus key any rung may pay. A NEW key reaching the server without
// anyone deciding what it means is how a ghost key becomes a live faucet.
const EXPECT_KEYS = [
  'allXP', 'buffDuration', 'combatXP', 'cookSpeed', 'craftSave', 'craftSpeed',
  'farmYield', 'noBurn', 'prayerSpeed', 'smithSpeed', 'yield_cooking',
  'yield_smithing',
];

// ── EXTRACT ──────────────────────────────────────────────────────────────
const legacy = await read('src/legacy.js');
const ROOMS = sliceLiteral(legacy, 'const ROOMS={', 'src/legacy.js');

const roomIds = Object.keys(ROOMS).sort();
if (roomIds.length !== EXPECT_ROOMS) {
  die(`extracted ${roomIds.length} rooms, expected ${EXPECT_ROOMS}. If a room was added or `
    + 'removed, update EXPECT_ROOMS here AND decide what the new room pays the server.');
}

const roomPerks = {};
const roomExtras = {};
const seenKeys = new Set();
let rungCount = 0;

for (const id of roomIds) {
  const def = ROOMS[id];
  if (!def || !Array.isArray(def.levels) || def.levels.length === 0) {
    die(`room ${id} has no levels array — the ROOMS shape changed`);
  }
  if (def.levels.length !== EXPECT_RUNGS) {
    die(`room ${id} has ${def.levels.length} rungs, expected ${EXPECT_RUNGS}`);
  }
  const rungs = [];
  const extras = [];
  let anyExtra = false;
  for (const ld of def.levels) {
    rungCount++;
    // ONE map per rung. `bk`/`bv` is the headline pair; `bx` is the secondary
    // map b225 added when the Kitchen started buying two things off one rung.
    // A rung's map REPLACES the rung below it (getBonus reads only
    // levels[lv-1]), so every rung restates every key it keeps — that is why
    // Kitchen L4 repeats noBurn:.25, and dropping it would silently
    // un-burn-proof a player as a reward for upgrading.
    const m = {};
    if (ld.bk) {
      const v = Number(ld.bv);
      if (!Number.isFinite(v)) die(`room ${id} rung has bk=${ld.bk} with a non-finite bv`);
      m[ld.bk] = v;
    }
    if (ld.bx) {
      for (const k of Object.keys(ld.bx)) {
        const v = Number(ld.bx[k]);
        if (!Number.isFinite(v)) die(`room ${id} bx.${k} is not finite`);
        // bx must never restate bk — that would double the same grant.
        if (k in m) die(`room ${id} rung declares ${k} in BOTH bk and bx`);
        m[k] = v;
      }
    }
    for (const k of Object.keys(m)) seenKeys.add(k);
    rungs.push(m);

    const ex = {};
    if (ld.rested != null) { ex.rested = Number(ld.rested); anyExtra = true; }
    if (ld.restedCap != null) { ex.restedCap = Number(ld.restedCap); anyExtra = true; }
    extras.push(Object.keys(ex).length ? ex : null);
  }
  roomPerks[id] = rungs;
  if (anyExtra) roomExtras[id] = extras;
}

const keys = [...seenKeys].sort();
const keyDiff = (a, b) => a.filter((k) => !b.includes(k));
if (keyDiff(keys, EXPECT_KEYS).length || keyDiff(EXPECT_KEYS, keys).length) {
  die(`the room bonus KEY SET changed.\n  extracted: ${keys.join(', ')}\n  expected:  ${EXPECT_KEYS.join(', ')}\n`
    + '  A new key reaching the accrual engine without a decision is how a ghost key becomes a\n'
    + '  live faucet. Update EXPECT_KEYS here and CHANNEL_CLASS in src/core/perks.js together.');
}
if (rungCount !== EXPECT_ROOMS * EXPECT_RUNGS) die(`extracted ${rungCount} rungs`);

// ── EMIT ─────────────────────────────────────────────────────────────────
// Room ids are already iterated in SORTED order (roomIds), so the emitted file
// and the digest are stable across platforms and Object-key insertion order.
const j = (v) => JSON.stringify(v);
const roomLines = roomIds.map((id) =>
  `  ${id}: [\n${roomPerks[id].map((m) => `    ${j(m)},`).join('\n')}\n  ],`).join('\n');
const extraIds = Object.keys(roomExtras).sort();
const extraLines = extraIds.map((id) =>
  `  ${id}: [${roomExtras[id].map((e) => (e ? j(e) : 'null')).join(', ')}],`).join('\n');

const payload = JSON.stringify({ rooms: roomPerks, extras: roomExtras });
const DIGEST = createHash('sha256').update(payload).digest('hex');

const file = `// ════════════════════════════════════════════════════════════════════════
// Hearthrise — THE ROOM RUNG PAYLOAD  (GENERATED — DO NOT EDIT BY HAND)
//
//   Generated by tools/gen-perks.mjs from \`const ROOMS={…}\` in src/legacy.js.
//   Any hand edit here is reverted by the next generation and FAILS
//   \`node tools/gen-perks.mjs --check\`, a preflight in tests/run-smoke.mjs.
//
//   ⚠ THE SOURCE OF TRUTH IS STILL src/legacy.js. To change a room's bonus,
//   change it THERE and re-run the generator. This file exists because
//   legacy.js is a classic script: Deno cannot import it, so the accrual
//   engine could not read the Kitchen's \`noBurn\` — and a server that cannot
//   read \`noBurn\` cooks at the base 25% burn rate while the player's
//   Cast-Iron Range says 0%, destroying a quarter of the input.
//
//   BOTH SIDES READ THIS FILE AT RUNTIME, through src/core/perks.js.
//   src/legacy.js getBonus delegates to it, and so does hr-accrue. A stale
//   copy therefore makes the two sides wrong TOGETHER — caught at the build
//   gate — rather than wrong APART, which nothing would catch.
//
//   perk digest: ${DIGEST}
//   ${roomIds.length} rooms x ${EXPECT_RUNGS} rungs = ${rungCount} rung payloads · keys: ${keys.join(', ')}
//
// THE SHAPE
//   ROOM_PERKS[roomId][level - 1]  →  { bonusKey: magnitude, … }
//
//   A rung's map REPLACES the rung below it, exactly as getBonus reads it
//   (\`levels[lv-1]\`, never a sum over rungs). Every rung therefore restates
//   every key it keeps — Kitchen L4 repeats noBurn:0.25 because dropping it
//   would un-burn-proof a player as a reward for upgrading.
//
//   \`bk\`/\`bv\` (the headline pair) and \`bx\` (the secondary map b225 added
//   when one rung started buying two things) are MERGED here. That split is
//   an artefact of how the table grew, not a fact a consumer should have to
//   know.
//
// PURE ESM DATA. No imports, no functions, no DOM. Node and Deno both.
// ════════════════════════════════════════════════════════════════════════

export const ROOM_PERKS = Object.freeze({
${roomLines}
});

/* Rung payload that is NOT a bonus key: the Library's Rested XP quantum and
   bank size (bonus-rebase.md §5.3 — Rested converted from a percentage to a
   flat quantum). Carried here so nothing has to extract the same table twice
   for the sake of two fields. \`null\` = that rung pays none. */
export const ROOM_RUNG_EXTRAS = Object.freeze({
${extraLines}
});

/* Every bonus key any rung can pay, sorted. Exported so a consumer can assert
   it knows what each one MEANS rather than silently forwarding a new one. */
export const ROOM_PERK_KEYS = Object.freeze(${j(keys)});

/* The digest of the extracted payload. tools/gen-perks.mjs --check recomputes
   it; a mismatch names which side moved. */
export const PERK_DIGEST = '${DIGEST}';
`;

// ── OUTPUT MODE ──────────────────────────────────────────────────────────
if (REPORT) {
  console.log(`gen-perks: ${roomIds.length} rooms, ${rungCount} rungs, digest ${DIGEST.slice(0, 12)}…`);
  for (const id of roomIds) {
    console.log(`  ${id.padEnd(10)} ${roomPerks[id].map((m, i) => `L${i + 1}${j(m)}`).join(' ')}`);
  }
  console.log(`  keys: ${keys.join(', ')}`);
} else if (CHECK) {
  const existing = await readFile(OUT, 'utf8').catch(() => null);
  if (existing === null) {
    console.error(`perk drift: ${OUT} is missing. Run: node tools/gen-perks.mjs`);
    process.exit(1);
  }
  // Normalised line endings: git checks the file out as CRLF on Windows while
  // the generator writes LF, and a guard that cries wolf on a whole platform
  // is a guard people learn to skip.
  const norm = (s) => s.replace(/\r\n/g, '\n');
  if (norm(existing) !== norm(file)) {
    const was = /perk digest: ([0-9a-f]{64})/.exec(existing);
    const committed = was ? was[1] : '(none)';
    if (committed === DIGEST) {
      console.error('perk drift: src/data/perks.js was EDITED BY HAND.');
      console.error('  The extraction from ROOMS is unchanged (same digest), but the committed file');
      console.error('  no longer matches it. Change the rung in src/legacy.js and regenerate.');
    } else {
      console.error('perk drift: a room rung in src/legacy.js no longer matches src/data/perks.js.');
      console.error(`  committed digest ${committed}`);
      console.error(`  extracted digest ${DIGEST}`);
      console.error('  ⚠ THE CLIENT AND THE SERVER BOTH READ THE COMMITTED FILE. Until it is');
      console.error('    regenerated they are running the OLD rung values — including noBurn.');
    }
    console.error('  Run: node tools/gen-perks.mjs   (then read the diff — a rung moved)');
    process.exit(1);
  }
  console.log(`perks in sync (${roomIds.length} rooms, ${rungCount} rungs, digest ${DIGEST.slice(0, 12)}…)`);
} else {
  await writeFile(OUT, file, 'utf8');
  console.log(`wrote ${OUT}`);
  console.log(`  ${roomIds.length} rooms · ${rungCount} rungs · keys ${keys.join(', ')}`);
  console.log(`  digest ${DIGEST}`);
}
