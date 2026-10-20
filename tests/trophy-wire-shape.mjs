#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/trophy-wire-shape.mjs — ABSENCE MUST STAY ABSENCE ON THE TROPHY WIRE.
//
//   node tests/trophy-wire-shape.mjs             the guard
//   node tests/trophy-wire-shape.mjs --selftest  mutation proof: each defect caught
//
// ── THE DEFECT THIS EXISTS FOR (Security F3, SEC_BESTIARY_TROPHY_2026-09-22) ─
// hr-accrue/index.ts reads the claimed trophy rows behind a savepoint that
// degrades on SQLSTATE 42883 — a database without `hr_trophy_of`, which is also
// this feature's own documented rollback (`drop function public.hr_trophy_of`).
// On that path `trophyRows` is null. The block's own comment said the key is
// then "OMITTED entirely", and the code emitted `trophies: claimed` built from
// `trophyRows ?? []` UNCONDITIONALLY — so the key was PRESENT and EMPTY.
//
// An empty array is a CLAIM: "the server holds no trophies for you". null is
// not: "the server did not say". The client must keep exactly that distinction:
// since the client reset (2026-10-17) it keeps the envelope WHOLE
// (src/session/envelope.js), so an absent key stays absent and an empty list
// stays an empty list. So the degradation path produced a panel that re-offers Claim on a
// trophy the server holds and a badge reading "not claimed yet", against a
// server that answers `already_owned`. CLAUDE.md §6: the browser never says one
// thing while the server says another.
//
// ── WHY A SHAPE TEST AND NOT A MARKER SEARCH ────────────────────────────────
// Node cannot import a Deno `.ts` file, so the emit is lifted OUT OF index.ts's
// BYTES at named anchors and EXECUTED. Both halves matter, and delta-transport
// made the argument first: the byte read pins the SHIPPED file, the execution
// proves what the shape actually does. A grep for `trophies:` would have been
// green on the defect — the string was right there, in the wrong place.
//
// The consumer is executed too, off disk, so the assertions end at the question
// a player can see rather than at a JSON key.
//
// Credential-free, database-free. The design is docs/design/BESTIARY_LADDER.md.
//
// Exit: 0 green · 1 a finding · 2 harness (an anchor moved, a module would not
// load, or --selftest could not plant a defect).
// ════════════════════════════════════════════════════════════════════════

import { readFile } from 'node:fs/promises';
import { join, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { MONSTERS } from '../src/data/monsters.js';

const ROOT = normalize(join(fileURLToPath(new URL('.', import.meta.url)), '..'));
const INDEX_TS = join(ROOT, 'supabase', 'functions', 'hr-accrue', 'index.ts');
const CLAIM_JS = join(ROOT, 'supabase', 'functions', 'hr-accrue', 'trophy-claim.js');
const ENVELOPE_JS = join(ROOT, 'src', 'session', 'envelope.js');

const argv = process.argv.slice(2);
const SELFTEST = argv.includes('--selftest');

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error(`  ✗ ${msg}`); } };
class Harness extends Error {}

// ── LIFTING THE EMIT OUT OF index.ts ────────────────────────────────────────
// The anchors are the block's own first and last statements. If either moves,
// this is a HARNESS failure (exit 2) and never a silent pass: a guard that
// quietly extracts nothing is the assertion-that-asserts-nothing family.
const OPEN = '      const claimed: Array<{ monster: string; stage: number }> = [];';
const CLOSE = '\n    }\n\n    /* THE COLLECTION BLOCK';

/** The shipped emit, as an executable function. `src` lets --selftest mutate it. */
function liftEmit(src) {
  const i = src.indexOf(OPEN);
  const j = src.indexOf(CLOSE, i);
  if (i < 0 || j < 0) {
    throw new Harness(`index.ts anchors moved — could not lift the bestiary emit (open ${i}, close ${j})`);
  }
  const body = src.slice(i, j)
    // The ONLY transform, and it is mechanical: TypeScript annotations Node
    // cannot parse. Nothing about control flow or the object literal is touched.
    .replace(/const claimed: Array<\{ monster: string; stage: number \}> =/, 'const claimed =');
  if (/:\s*(Array|Record|string|number)\b/.test(body)) {
    throw new Harness('a TypeScript annotation survived the lift — the transform is stale');
  }
  // eslint-disable-next-line no-new-func
  return new Function('trophyRows', 'byId', 'MONSTERS', `
    let bestiary = null; let bestiaryKills = null;
    ${body}
    return bestiary;
  `);
}

const BY_ID = { goblin: 21000, slime: 40 };
const envelopeFor = (block) => ({ ok: true, version: 1, state: {}, bestiary: block });

async function run(indexSrc, envelopePath) {
  const emit = liftEmit(indexSrc);
  const E = await import(pathToFileURL(envelopePath).href + '?t=' + Date.now());
  const kept = (block) => { const r = E.applyEnvelope(null, envelopeFor(block)); return r.record ? r.record.data.bestiary : undefined; };

  // ── W1 — THE DEGRADATION PATH. trophyRows null ⇒ NO `trophies` KEY. ───────
  const degraded = emit(null, BY_ID, MONSTERS);
  ok(degraded && typeof degraded === 'object',
    'W1: the bestiary block was not built at all on the 42883 path — the counters must still ride');
  ok(degraded && !('trophies' in degraded),
    'W1: `trophies` is PRESENT on the 42883 path. An empty array claims "you hold none"; the server '
    + 'did not say. This is the Claim-button-on-a-claimed-trophy bug (Security F3)');
  ok(degraded && degraded.kills_by_monster && degraded.kills_by_monster.goblin === 21000,
    'W1: the per-monster counters stopped riding when the trophy read degraded — they are a separate '
    + 'projection and must not be taken down with it');

  // ── W2 — THE SERVER ANSWERED, NOTHING CLAIMED. Key PRESENT and empty. ────
  const none = emit([], BY_ID, MONSTERS);
  ok(none && Array.isArray(none.trophies) && none.trophies.length === 0,
    'W2: a server that answered with zero rows must send `trophies: []` — a truthful "none claimed", '
    + 'which is a DIFFERENT sentence from W1 and the whole reason the key is conditional');

  // ── W3 — THE SERVER'S OWN LIST, carried verbatim and coerced. ────────────
  const held = emit(
    [{ monster_id: 'goblin', stage: 4 }, { monster_id: '', stage: 2 }, { monster_id: 'slime', stage: 0 }],
    BY_ID, MONSTERS,
  );
  ok(held && Array.isArray(held.trophies) && held.trophies.length === 1,
    `W3: the emit carried ${held && held.trophies && held.trophies.length} rows where 1 survives coercion `
    + '(an empty id and a stage 0 are both dropped)');
  ok(held && held.trophies && held.trophies[0]
     && held.trophies[0].monster === 'goblin' && held.trophies[0].stage === 4,
    'W3: the surviving row is not the server\'s (goblin, 4) — the wire renamed or re-derived it');

  // ── W4 — THE CONSUMER, EXECUTED. The distinction reaches the client's record. ──
  const k1 = kept(degraded);
  ok(k1 && !('trophies' in k1),
    'W4: after the 42883 path the client record holds a `trophies` key — the client can no longer tell '
    + '"trophies are unavailable on this server" from "you have none"');
  const k2 = kept(none);
  ok(k2 && Array.isArray(k2.trophies) && k2.trophies.length === 0,
    'W4: a server that answered with an empty list did not reach the record as "answered, none"');
  const k3 = kept(held);
  ok(k3 && Array.isArray(k3.trophies) && k3.trophies.some((t) => t.monster === 'goblin' && t.stage === 4),
    'W4: the server holds (goblin, 4) and the client record does not — a Claim would be offered on a '
    + 'trophy the server refuses with already_owned');

  // ── W5 — THE OTHER EMIT SITE AGREES. Two sites that disagree is how one rots.
  const claimSrc = await readFile(CLAIM_JS, 'utf8');
  ok(claimSrc.includes('...(bestiary ? { bestiary } : {})'),
    'W5: trophy-claim.js no longer drops the WHOLE block when its re-read fails. Its PROJECTION_SQL '
    + 'path is the site index.ts was corrected to match; if it changes, they have diverged again');

  return failed;
}

// ── MUTATIONS ───────────────────────────────────────────────────────────────
// Each plants ONE defect in the SHIPPED bytes and names the assertion that must
// report it. A guard that has never been red is not a guard (CLAUDE.md §4).
const MUTATIONS = {
  always_emit: {
    what: 'the emit restores the unconditional `trophies: claimed` — the defect exactly as reviewed',
    file: 'index',
    find: '        ...(trophyRows ? { trophies: claimed } : {}),',
    repl: '        trophies: claimed,',
    expect: 'W1',
  },
  empty_array_instead_of_omission: {
    what: 'the key is conditional on the ROWS rather than on the ANSWER, so a server that answered with zero rows and a server that did not answer become the same wire',
    file: 'index',
    find: '        ...(trophyRows ? { trophies: claimed } : {}),',
    repl: '        ...(claimed.length ? { trophies: claimed } : {}),',
    expect: 'W2',
  },
  client_fills_the_key: {
    what: 'the client applier fills a missing trophies key with [] — "did not say" becomes "none"',
    file: 'envelope',
    find: "if (!META.includes(k) && !TIMELINE_KEYS.includes(k) && k !== 'client_state') data[k] = copy(env[k]);",
    repl: "if (!META.includes(k) && !TIMELINE_KEYS.includes(k) && k !== 'client_state') data[k] = copy(k === 'bestiary' ? Object.assign({ trophies: [] }, env[k]) : env[k]);",
    expect: 'W4',
  },
  control_comment_only: {
    what: 'NEGATIVE CONTROL — an inert comment INSIDE the lifted block must move nothing',
    file: 'index',
    find: '        const st = Number(r?.stage ?? 0);',
    repl: '        const st = Number(r?.stage ?? 0); /* control */',
    expect: null,
  },
};

const main = async () => {
  const indexSrc = await readFile(INDEX_TS, 'utf8');

  if (!SELFTEST) {
    failed = await run(indexSrc, ENVELOPE_JS);
    if (failed) {
      console.error(`\ntrophy-wire-shape: RED — ${failed} finding(s). See docs/planning/SEC_BESTIARY_TROPHY_2026-09-22.md F3.`);
      process.exit(1);
    }
    console.log('trophy-wire-shape: green — the trophies key is ABSENT when hr_trophy_of did not answer '
      + 'and PRESENT with the server\'s own list otherwise, the counters ride either way, the client '
      + 'keeps "unavailable" and "none" apart, and both emit sites drop rather than fake.');
    return;
  }

  // ── SELFTEST ─────────────────────────────────────────────────────────────
  let missed = 0;
  const envSrc = await readFile(ENVELOPE_JS, 'utf8');
  const { writeFile, mkdtemp, cp, rm } = await import('node:fs/promises');
  const { tmpdir } = await import('node:os');

  for (const [name, m] of Object.entries(MUTATIONS)) {
    const base = m.file === 'index' ? indexSrc : envSrc;
    if (base.split(m.find).length - 1 !== 1) {
      console.error(`  HARNESS: anchor for ${name} matched ${base.split(m.find).length - 1} times (need 1)`);
      process.exit(2);
    }
    const mutated = base.replace(m.find, m.repl);

    failed = 0;
    const seen = [];
    const realError = console.error;
    console.error = (line) => { seen.push(String(line)); };
    try {
      if (m.file === 'index') {
        await run(mutated, ENVELOPE_JS);
      } else {
        // The applier imports its sibling by relative path, so the mutant runs
        // from a temp copy of src/session (never the tree).
        const dir = await mkdtemp(join(tmpdir(), 'hr-trophy-wire-'));
        try {
          await cp(join(ROOT, 'src', 'session'), dir, { recursive: true });
          await writeFile(join(dir, 'envelope.js'), mutated);
          await run(indexSrc, join(dir, 'envelope.js'));
        } finally { await rm(dir, { recursive: true, force: true }); }
      }
    } finally {
      console.error = realError;
    }

    const hit = seen.some((l) => l.includes(`✗ ${m.expect}:`));
    if (m.expect === null) {
      if (failed) { console.error(`  MISSED  ${name} — the negative control turned something red`); missed++; }
      else console.log(`  silent  ${name}\n            ${m.what}`);
    } else if (!failed) {
      console.error(`  MISSED  ${name} — planted and NOTHING went red`); missed++;
    } else if (!hit) {
      console.error(`  MISWIRED ${name} — red, but not by ${m.expect}: ${seen[0]}`); missed++;
    } else {
      console.log(`  caught  ${name} via ${m.expect}\n            ${m.what}`);
    }
  }

  if (missed) {
    console.error(`\ntrophy-wire-shape --selftest: ${missed} mutation(s) not caught by their named assertion.`);
    process.exit(1);
  }
  console.log(`\nall ${Object.keys(MUTATIONS).length - 1} planted defects caught by name, the negative control silent.`);
};

main().catch((e) => {
  console.error(e instanceof Harness ? `harness: ${e.message}` : e);
  process.exit(2);
});
