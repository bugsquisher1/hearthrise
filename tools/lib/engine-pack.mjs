// ════════════════════════════════════════════════════════════════════════
// tools/lib/engine-pack.mjs — A PAYLOAD'S OWN ENGINE, OUT OF GIT, HASH-CHECKED.
//
// A combat probe is evidence about the engine that RECORDED it, so it is
// replayed on that engine — never on whatever this checkout happens to hold
// (tests/world-tick-combat-replay.mjs, Security R1 2026-10-14). The deployed
// engine is named only by its `payload_sha256`; this module turns that hash
// back into code:
//
//   1. tests/world-tick-engine-payloads.json maps payload -> commit. It is a
//      CLAIM, written by the Coordinator at each hr-accrue deploy (the deploy
//      already checks the live GET against `pack-edge --hash` at a commit).
//   2. `git archive <commit>` of the four roots a payload is packed from
//      (tools/pack-edge.mjs, supabase/functions/hr-accrue, src/core, src/data)
//      into a fresh OS-temp dir. Nothing in the checkout is touched.
//   3. THAT tree's own tools/pack-edge.mjs packs it, and the hash must equal
//      the payload or the engine is REFUSED. A wrong or stale map entry can
//      therefore never replay a probe on the wrong code; it can only stop the
//      read (the caller exits 2).
//
// The engine is then the replay composition of services/world-tick/
// parity-replay.js bound to THAT tree's modules (`replayEngine`), so the
// one-span, the chain and the replica seeds are the one composition every
// reader uses, on the payload's code.
//
// `packReplicaSample` is the worker entry tools/world-tick-replay-pool.mjs
// calls by name: deterministic in (dir, p, r), so where it runs cannot change
// what it returns.
//
// Writes only under the OS temp dir (extracted trees, and planted copies for
// a guard's --mutate). Never a network call, never a credential.
// ════════════════════════════════════════════════════════════════════════

import { spawnSync } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { engineOf, replayEngine } from '../../services/world-tick/parity-replay.js';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const PAYLOAD_MAP = 'tests/world-tick-engine-payloads.json';
const FN = 'supabase/functions/hr-accrue';
/* Everything a payload is packed from, plus the packer itself. */
export const ENGINE_ROOTS = Object.freeze(['tools/pack-edge.mjs', FN, 'src/core', 'src/data']);

const HEX64 = /^[0-9a-f]{64}$/;
const HEX40 = /^[0-9a-f]{40}$/;

export class EngineHarnessError extends Error {}
const harness = (m) => new EngineHarnessError(m);

/** The committed payload -> commit map, shape-checked (64-hex keys, 40-hex values). */
export async function readPayloadMap(path = join(ROOT, PAYLOAD_MAP)) {
  let doc;
  try { doc = JSON.parse(await readFile(path, 'utf8')); } catch (e) { throw harness(`${PAYLOAD_MAP}: ${e.message}`); }
  const map = (doc && doc.payloads) || null;
  if (!map || typeof map !== 'object' || Array.isArray(map)) throw harness(`${PAYLOAD_MAP}: no "payloads" object`);
  for (const [k, v] of Object.entries(map)) {
    if (!HEX64.test(k) || !HEX40.test(String(v))) throw harness(`${PAYLOAD_MAP}: "${k.slice(0, 12)}" -> "${String(v).slice(0, 12)}" is not 64-hex -> 40-hex`);
  }
  return map;
}

const TREES = [];

/** `git archive <commit>` of ENGINE_ROOTS into a fresh temp dir. */
export async function extractTree(commit) {
  const rev = spawnSync('git', ['rev-parse', '--verify', `${commit}^{commit}`], { cwd: ROOT, encoding: 'utf8' });
  if (rev.status !== 0) throw harness(`not a commit in this clone: ${commit} (a shallow clone has only HEAD)`);
  const full = rev.stdout.trim();
  const dir = await mkdtemp(join(tmpdir(), `hr-engine-${full.slice(0, 8)}-`));
  TREES.push(dir);
  /* Piped through stdin with `cwd` set: no path reaches tar's argv, so a
     Windows drive letter cannot be read as a remote host (deploy-differential). */
  const a = spawnSync('git', ['archive', '--format=tar', full, ...ENGINE_ROOTS], { cwd: ROOT, maxBuffer: 1 << 30 });
  if (a.status !== 0) throw harness(`git archive ${full.slice(0, 8)} failed: ${String(a.stderr).slice(0, 200)}`);
  const x = spawnSync('tar', ['-xf', '-'], { cwd: dir, input: a.stdout, maxBuffer: 1 << 26 });
  if (x.status !== 0) throw harness(`tar -xf failed: ${String(x.stderr).slice(0, 200)}`);
  return { dir, commit: full };
}

/** The payload hash a tree packs to, by THAT tree's own packer. */
export async function packHashOf(dir) {
  const m = await import(pathToFileURL(join(dir, 'tools', 'pack-edge.mjs')).href);
  const r = await m.pack('hr-accrue');
  if (!r || !HEX64.test(String(r.hash))) throw harness(`${dir}: pack-edge produced no hash`);
  if (r.problems && r.problems.length) throw harness(`${dir}: pack-edge problems: ${r.problems.slice(0, 2).join('; ')}`);
  return r.hash;
}

const ENGINES = new Map();
/**
 * The engine of a tree (ROOT is this checkout's): its tick modules, its hunt
 * catalogue if it has one (null before lane c-hunts-c1), and the replay
 * composition bound to them. Cached per dir.
 */
export async function engineAt(dir) {
  if (ENGINES.has(dir)) return ENGINES.get(dir);
  const at = (p) => import(pathToFileURL(join(dir, p)).href);
  const [probe, combat, contract, rng] = await Promise.all([
    at(`${FN}/tick-probe.js`), at(`${FN}/tick-combat.js`), at(`${FN}/tick-contract.js`), at('src/core/rng.js'),
  ]);
  const huntsPath = join(dir, 'src', 'data', 'hunts.js');
  const hunts = existsSync(huntsPath) ? await at('src/data/hunts.js') : null;
  const e = Object.freeze({
    dir, probe, combat,
    huntIndex: (hunts && hunts.HUNT_INDEX) || Object.create(null),
    replay: replayEngine(engineOf({ probe, combat, contract, rng })),
  });
  ENGINES.set(dir, e);
  return e;
}

/** Worker entry (tools/world-tick-replay-pool.mjs): replica r of probe p on the engine at dir. */
export async function packReplicaSample(dir, p, r) {
  return (await engineAt(dir)).replay.replicaSample(p, r);
}

/**
 * A payload's own engine: its map commit, extracted, packed by its own packer,
 * and REFUSED unless that hash is the payload.
 */
export async function engineForPayload(payload, map) {
  const commit = map[payload];
  if (!commit) {
    throw harness(`payload ${String(payload).slice(0, 16)}… has no commit in ${PAYLOAD_MAP} — add the commit whose `
      + '`node tools/pack-edge.mjs hr-accrue --hash` prints it (the deploy that shipped it)');
  }
  const t = await extractTree(commit);
  const hash = await packHashOf(t.dir);
  if (hash !== payload) {
    throw harness(`${PAYLOAD_MAP}: ${t.commit.slice(0, 8)} packs to ${hash.slice(0, 16)}…, not ${String(payload).slice(0, 16)}… — `
      + 'the map is wrong; a probe is never replayed on another payload\'s code');
  }
  return Object.assign({ commit: t.commit, hash }, await engineAt(t.dir));
}

/**
 * A COPY of a tree's engine roots with one or more planted edits — a guard's
 * --mutate engine. Each edit's anchor must match exactly once.
 * @param plants [{ file, find, repl }]
 */
export async function plantedTree(fromDir, plants) {
  const dir = await mkdtemp(join(tmpdir(), 'hr-engine-plant-'));
  TREES.push(dir);
  for (const r of ENGINE_ROOTS) {
    const src = join(fromDir, r);
    if (existsSync(src)) await cp(src, join(dir, r), { recursive: true });
  }
  for (const p of plants) {
    const f = join(dir, p.file);
    const s = (await readFile(f, 'utf8')).replace(/\r\n/g, '\n');
    if (s.split(p.find).length !== 2) throw harness(`plant anchor in ${p.file} matched ${s.split(p.find).length - 1}x`);
    await writeFile(f, s.replace(p.find, () => p.repl), 'utf8');
  }
  return dir;
}

/** Remove every tree this process extracted or planted. */
export async function dropTrees() {
  for (const d of TREES.splice(0)) await rm(d, { recursive: true, force: true });
}
