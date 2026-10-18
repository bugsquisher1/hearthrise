#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// tests/no-client-copy-of-projection.mjs — THE CLASS-KILL GUARD FOR
// "THE SERVER PROJECTS IT AND THE CLIENT KEEPS ITS OWN COPY ANYWAY".
//
// Tyler, 2026-09-14: auto-eat food, the play streak and the Renown record each
// regressed AFTER they were fixed, because the client kept its OWN persisted
// copy of a value hr_state_of projects. The rebuilt client (2026-10-17) closes
// the class by construction — src/session/envelope.js keeps each envelope
// WHOLE and the residue is a one-field allowlist — and this guard keeps it
// closed:
//
//   PROJ    the pinned hr_state_of key set (top level + `state`) is the one the
//           chain actually produces — `--execute` replays the chain and fails on
//           drift, so a new projection is noticed the day it is written.
//   KEEP    the client's applier keeps EVERY projected key, whole: an envelope
//           carrying each pinned key is applied (src/session/envelope.js,
//           executed) and every non-meta key must be on the record. A projection
//           the client drops is the `unlocked_recipes` shape — the server holds
//           the truth and the browser has nothing to show.
//   COPY    no residue field (src/session/residue.js RESIDUE_FIELDS) names a
//           projected value, in either spelling (snake_case or camelCase). The
//           residue is for values the server does NOT hold (CLAUDE.md §6).
//
// ── WHY THE PROJECTED KEY SET IS EXECUTED, NEVER PARSED ─────────────────────
// hr_state_of is created once and then PROGRAMMATICALLY PATCHED by later
// migrations; the body production runs exists only after a replay. `--execute`
// replays (tests/schema-replay.mjs bootReplay) and reads the real key set; the
// answer is PINNED in tests/no-client-copy-of-projection.baseline.json so the
// default run is pure and fast (lane-done). `--execute` runs in db-replay-3.
//
// Run:
//   node tests/no-client-copy-of-projection.mjs              # the gate
//   node tests/no-client-copy-of-projection.mjs --execute    # + replay the chain
//   node tests/no-client-copy-of-projection.mjs --write --execute  # re-pin the keys
//   node tests/no-client-copy-of-projection.mjs --selftest   # mutation proof
// ════════════════════════════════════════════════════════════════════════════
// migration-arm: --execute hr_state_of
// mutant-anchors: src/session/envelope.js src/session/residue.js
import { readFileSync, writeFileSync, existsSync, mkdtempSync, cpSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'tests', 'no-client-copy-of-projection.baseline.json');

/* Top-level keys that describe the ANSWER or carry the residue bag, not a
   character value the record keeps. Everything else must reach the record. */
const META = Object.freeze({
  ok: 'the envelope verdict',
  client_state: 'THE RESIDUE BAG ITSELF — read through the allowlist (src/session/residue.js), never kept as data',
});

const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

async function loadModules(base) {
  const u = (p) => pathToFileURL(join(base, p)).href;
  return {
    E: await import(u('src/session/envelope.js')),
    R: await import(u('src/session/residue.js')),
  };
}

/** Pure over its inputs: the pinned key set and the two client modules. */
export function audit(pinned, mods) {
  const fail = [];
  const top = pinned.top || [];
  const state = pinned.state || [];
  if (top.length < 10 || !top.includes('state')) fail.push(`PROJ-PIN       the pinned key set has ${top.length} top-level keys — re-pin with --write --execute`);

  // ── KEEP: execute the applier over an envelope carrying every pinned key ──
  const env = { ok: true, version: 7 };
  for (const k of top) if (!(k in env)) env[k] = k === 'state' ? {} : { probe: k };
  for (const k of state) env.state[k] = { probe: k };
  const r = mods.E.applyEnvelope(null, env);
  if (!r.applied) fail.push(`KEEP-REFUSED   the client refused a well-formed envelope carrying the pinned keys (${r.verdict})`);
  else {
    for (const k of top) {
      if (META[k] || k === 'version') continue;
      if (!(k in r.record.data)) fail.push(`KEEP-DROPPED   hr_state_of projects ${k} and the client's applier does not keep it — the browser would have nothing to show for a value the server holds`);
    }
    for (const k of state) {
      if (!(k in (r.record.data.state || {}))) fail.push(`KEEP-DROPPED   hr_state_of projects state.${k} and the client's applier does not keep it`);
    }
  }

  // ── COPY: no residue field is a projected value ────────────────────────
  const projected = new Set([...top, ...state, ...top.map(camel), ...state.map(camel)]);
  for (const f of mods.R.RESIDUE_FIELDS) {
    if (projected.has(f)) fail.push(`RESIDUE-COPY   '${f}' is on RESIDUE_FIELDS and is a value hr_state_of projects — a persisted client copy of the server's answer (CLAUDE.md §6)`);
  }
  if (!mods.R.RESIDUE_FIELDS.length) fail.push('RESIDUE-READ   RESIDUE_FIELDS read as empty — the COPY check is checking nothing');
  return fail;
}

/* ── THE EXECUTED KEY SET ─────────────────────────────────────────────────── */
async function executedProjection() {
  const { bootReplay } = await import('./schema-replay.mjs');
  const { db } = await bootReplay();
  const A = '11111111-1111-1111-1111-111111111111';
  await db.exec(`insert into auth.users (id) values ('${A}') on conflict do nothing;`);
  await db.exec(`insert into public.player_state (user_id, slot, gold, version)
                 values ('${A}', 0, 10, 1) on conflict (user_id, slot) do nothing;`);
  const env = (await db.query('select public.hr_state_of($1::uuid, 0) as env', [A])).rows[0].env;
  if (!env || env.ok !== true) throw new Error('hr_state_of refused the probe character: ' + JSON.stringify(env));
  return { top: Object.keys(env).sort(), state: Object.keys(env.state || {}).sort() };
}

function readBaseline() {
  return existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
}

async function main(argv) {
  const write = argv.includes('--write');
  const execute = argv.includes('--execute');
  let base = readBaseline();
  if (execute) {
    const real = await executedProjection();
    if (write) {
      base = { projection: real, generatedAt: new Date().toISOString().slice(0, 10) };
      writeFileSync(BASELINE, JSON.stringify(base, null, 2) + '\n');
      console.log(`no-client-copy-of-projection: re-pinned ${real.top.length}+${real.state.length} projected keys.`);
      return 0;
    }
    if (!base) { console.error('PROJECTION: no baseline. Run --write --execute once.'); return 2; }
    const drift = [];
    for (const ns of ['top', 'state']) {
      const was = new Set(base.projection[ns] || []);
      const now = new Set(real[ns] || []);
      for (const k of now) if (!was.has(k)) drift.push(`+ ${ns}.${k} (a NEW projection — re-pin it and check the client shows it)`);
      for (const k of was) if (!now.has(k)) drift.push(`- ${ns}.${k} (a projection went away)`);
    }
    if (drift.length) {
      console.error('✗ PROJECTION DRIFT — the pinned hr_state_of key set is not what the chain produces:');
      for (const d of drift) console.error('   ' + d);
      console.error('  Re-pin with: node tests/no-client-copy-of-projection.mjs --write --execute');
      return 1;
    }
    console.log(`  executed: hr_state_of projects ${real.top.length} top-level + ${real.state.length} state keys — matches the pin.`);
  }
  if (!base) { console.error('PROJECTION: no baseline. Run --write --execute once.'); return 2; }
  const fail = audit(base.projection, await loadModules(ROOT));
  if (fail.length) {
    console.error('✗ no-client-copy-of-projection: ' + fail.length + ' violation(s)');
    for (const f of fail) console.error('   ' + f);
    return 1;
  }
  console.log(`no-client-copy-of-projection: ${base.projection.top.length} top + ${base.projection.state.length} state `
    + 'projections pinned, every one kept whole by the client, none copied into the residue.');
  return 0;
}

/* ── THE MUTATION PROOF: each arm must produce its NAMED failure. ─────────── */
async function selftest() {
  const base = readBaseline();
  if (!base) { console.error('SELFTEST: no baseline; run --write --execute first.'); return 2; }
  const real = await loadModules(ROOT);
  const control = audit(base.projection, real);
  if (control.length) { console.error('SELFTEST control: the untouched tree is RED:\n   ' + control.join('\n   ')); return 1; }
  console.log('  ok   control — the untouched tree is green');
  const planted = async (file, from, to) => {
    const tmp = mkdtempSync(join(tmpdir(), 'hr-proj-'));
    try {
      cpSync(join(ROOT, 'src', 'session'), join(tmp, 'src', 'session'), { recursive: true });
      const p = join(tmp, file);
      const s = readFileSync(p, 'utf8');
      if (!s.includes(from)) throw new Error('selftest anchor missing in ' + file + ': ' + from);
      writeFileSync(p, s.replace(from, to));
      return audit(base.projection, await loadModules(tmp));
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  };
  const fakeResidue = (extra) => ({ E: real.E, R: { RESIDUE_FIELDS: [...real.R.RESIDUE_FIELDS, extra] } });
  const arms = [
    ['a projected key back on the residue (skills)', 'RESIDUE-COPY', async () => audit(base.projection, fakeResidue('skills'))],
    ['a projected state key, camelCased, on the residue (combatStyle)', 'RESIDUE-COPY', async () => audit(base.projection, fakeResidue('combatStyle'))],
    ['the applier keeps only an allowlist of keys', 'KEEP-DROPPED',
      () => planted('src/session/envelope.js', "if (!META.includes(k) && !TIMELINE_KEYS.includes(k) && k !== 'client_state') data[k] = copy(env[k]);",
        "if (['state', 'skills', 'inventory'].includes(k)) data[k] = copy(env[k]);")],
    ['the applier drops a nested state key', 'KEEP-DROPPED',
      () => planted('src/session/envelope.js', "if (!META.includes(k) && !TIMELINE_KEYS.includes(k) && k !== 'client_state') data[k] = copy(env[k]);",
        "if (!META.includes(k) && !TIMELINE_KEYS.includes(k) && k !== 'client_state') data[k] = copy(k === 'state' ? Object.assign({}, env[k], { gold: undefined }) : env[k]);")],
    ['the pinned key set emptied', 'PROJ-PIN', async () => audit({ top: [], state: [] }, real)],
  ];
  let bad = 0;
  for (const [label, code, run] of arms) {
    const fail = await run();
    if (fail.some((f) => f.startsWith(code))) console.log(`  ok   ${code.padEnd(14)} caught: ${label}`);
    else { bad++; console.error(`  FAIL ${code.padEnd(14)} NOT caught: ${label}\n       got: ${fail.join(' | ') || '(green)'}`); }
  }
  if (bad) { console.error(`✗ SELFTEST: ${bad} arm(s) not caught.`); return 1; }
  console.log(`no-client-copy-of-projection --selftest: 1 control + ${arms.length} arms, every arm red for its own reason.`);
  return 0;
}

const INVOKED_DIRECTLY = isMain(import.meta.url);
if (INVOKED_DIRECTLY) {
  const argv = process.argv.slice(2);
  process.exitCode = argv.includes('--selftest') ? await selftest() : await main(argv);
}
