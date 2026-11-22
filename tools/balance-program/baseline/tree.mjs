// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/baseline/tree.mjs — A GAME TREE TO MEASURE, AND WHAT IT IS (lane/bl-baseline, deliverables 1 and 8).
//
// THE OVERLAY. A measurement is (a game tree) x (one harness). The game tree is any commit: the pinned baseline (branch baseline/overhaul-start),
// a set tip, a lane. The harness is THIS checkout's tools: the matrix, the cell runner, the kit builder, the skill lines, the bands, and the
// settle driver tests/hunt-core/fixtures/play-ground.mjs. materialize() exports the game commit with `git archive` into a folder and lays
// the HARNESS paths over it, so every tool run there reads ONE tree's data and engine (ROOT is the folder) with the same harness on both
// sides of a comparison. Nothing of the game is overlaid: src/**, supabase/** and every other tool and fixture stay the commit's own.
//
//   materialize({ game, into, label, harnessRoot })   -> the folder's .baseline-tree.json (game sha, harness sha, what was overlaid)
//   manifest(root)                                     -> the pin's record: shas, a hash of src/data/**, the engine, the edge settle, the
//                                                         server catalogues (supabase/migrations/*.generated.sql), the configuration
//                                                         (the build version, the combat constants, the tier dials, every `live:` switch)
//                                                         and the standards.mjs revision the bands come from
// ════════════════════════════════════════════════════════════════════════
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync, mkdirSync, rmSync, cpSync } from 'node:fs';
import { join, relative } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

export const TREE_FILE = '.baseline-tree.json';
export const TREE_SCHEMA = 'hearthrise.balance-baseline-tree/1';
/* the harness: laid over the game tree from this checkout */
export const HARNESS = Object.freeze(['tools/balance-program', 'tools/balance-sim', 'tools/lib', 'tests/_is-main.mjs', 'tests/hunt-core/fixtures/play-ground.mjs', 'tests/fixtures/balance-calibration.json']);
/* inside the harness paths, the GAME's own: the designer's staged item lines past Dawnsteel (the kit builder reads them; a candidate that
   re-cuts them, as FB-8's gear curve does, is measured with its own) */
export const TREE_OWN = Object.freeze(['tools/balance-sim/staged']);
/* the game: exported from the commit (tools and tests come along: the cell runner reads the commit's own fixtures and generators) */
export const GAME_PATHS = Object.freeze(['src', 'supabase/functions', ':(glob)supabase/migrations/*.generated.sql', 'supabase/config.toml', 'tests', 'tools', 'package.json']);

const git = (cwd, args, o = {}) => execFileSync('git', args, { cwd, encoding: o.buffer ? 'buffer' : 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'] });
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
/* text normalised to LF so a Windows checkout and a Linux runner hash the same bytes */
const norm = (buf) => (buf.includes(0) ? buf : Buffer.from(buf.toString('utf8').replace(/\r\n/g, '\n'), 'utf8'));

/** A commit for `ref`: the ref itself, else origin/<ref> (a runner's checkout holds remote branches only). */
export function resolveCommit(repo, ref) {
  for (const r of [ref, 'origin/' + ref]) {
    try { return git(repo, ['rev-parse', '--verify', '--quiet', r + '^{commit}']).trim(); } catch { /* next */ }
  }
  throw new Error('baseline: no commit for ' + ref + ' (fetch it first: git fetch origin ' + ref + ')');
}

/** Every file under `p` (a file or a folder), relative to root, sorted. */
export function filesUnder(root, p) {
  const abs = join(root, p);
  if (!existsSync(abs)) return [];
  if (!statSync(abs).isDirectory()) return [p];
  const out = [];
  for (const f of readdirSync(abs).sort()) out.push(...filesUnder(root, p + '/' + f));
  return out;
}
/** One hash over files: their paths and LF-normalised bytes. */
export function hashFiles(root, files) {
  const h = createHash('sha256');
  for (const f of [...files].sort()) { h.update(f + '\0'); h.update(norm(readFileSync(join(root, f)))); h.update('\0'); }
  return { files: files.length, sha256: h.digest('hex') };
}
export const hashPaths = (root, paths) => hashFiles(root, paths.flatMap((p) => filesUnder(root, p)));
/* the harness paths' files less the tree's own (TREE_OWN) */
const notTreeOwn = (f) => !TREE_OWN.some((o) => f === o || f.startsWith(o + '/'));
export const hashOwnPaths = (root, paths) => hashFiles(root, paths.flatMap((p) => filesUnder(root, p)).filter(notTreeOwn));
/* what a measurement says, not how it measures: the run's target, the committed pins and candidates (their scenario is its own hash) */
export const NOT_INSTRUMENT = Object.freeze(['tools/balance-program/baseline/target.json', 'tools/balance-program/baseline/overhaul-start', 'tools/balance-program/baseline/candidates']);
const instrument = (f) => notTreeOwn(f) && !NOT_INSTRUMENT.some((o) => f === o || f.startsWith(o + '/'));
/** The INSTRUMENT: the harness's files less the tree's own and less the measurement's own records. Equal on both sides of a fair comparison. */
export const hashHarness = (root) => hashFiles(root, HARNESS.flatMap((p) => filesUnder(root, p)).filter(instrument));

/** The instrument files that differ between two harness commits (git, in `repo`), or null when either commit is not here. */
export function instrumentDiff(repo, a, b) {
  if (!a || !b || a === b) return a && a === b ? [] : null;
  try { return git(repo, ['diff', '--name-only', a, b, '--', ...HARNESS]).split('\n').map((s) => s.trim()).filter(Boolean).filter(instrument); } catch { return null; }
}

/** Export `game` into `into` and lay the harness over it. Answers the folder's tree record. */
export function materialize({ game, into, label = null, harnessRoot, patches = [] }) {
  const sha = resolveCommit(harnessRoot, game);
  if (existsSync(into) && readdirSync(into).length) throw new Error('baseline: ' + into + ' is not empty (materialize writes a fresh folder)');
  mkdirSync(into, { recursive: true });
  /* the archive is written into the folder and unpacked there by a RELATIVE name: GNU tar reads "C:\..." as a remote host, and a large
     archive on a Windows stdin pipe ends early (spawnSync EOF) */
  const TAR = '.baseline-game.tar';
  writeFileSync(join(into, TAR), git(harnessRoot, ['archive', '--format=tar', sha, '--', ...GAME_PATHS], { buffer: true }));
  execFileSync('tar', ['-xf', TAR], { cwd: into, stdio: ['ignore', 'ignore', 'pipe'] });
  rmSync(join(into, TAR), { force: true });
  /* what the harness replaces of the tree's own (a settle driver that differs is named: the pair must still be one engine contract) */
  const replaced = {};
  const keep = join(into, '.baseline-tree-own');
  for (const p of TREE_OWN) if (existsSync(join(into, p))) cpSync(join(into, p), join(keep, p), { recursive: true });
  for (const p of HARNESS) {
    const own = hashOwnPaths(into, [p]), ours = hashOwnPaths(harnessRoot, [p]);
    replaced[p] = { tree: own.files ? own.sha256.slice(0, 16) : null, harness: ours.sha256.slice(0, 16), same: own.sha256 === ours.sha256 };
    rmSync(join(into, p), { recursive: true, force: true });
    if (existsSync(join(harnessRoot, p))) cpSync(join(harnessRoot, p), join(into, p), { recursive: true });
  }
  for (const p of TREE_OWN) {
    rmSync(join(into, p), { recursive: true, force: true });
    if (existsSync(join(keep, p))) cpSync(join(keep, p), join(into, p), { recursive: true });
  }
  rmSync(keep, { recursive: true, force: true });
  let harnessSha = 'unknown', dirty = null, standardsSha = null;
  try { harnessSha = git(harnessRoot, ['rev-parse', 'HEAD']).trim(); dirty = git(harnessRoot, ['status', '--porcelain', '--', ...HARNESS]).trim().length > 0; } catch { /* not a checkout */ }
  try { standardsSha = git(harnessRoot, ['log', '-1', '--format=%H', '--', 'tools/balance-program/standards.mjs']).trim() || null; } catch { /* not a checkout */ }
  const rec = { schema: TREE_SCHEMA, game: { ref: game, sha, label }, harness: { sha: harnessSha, dirty, overlay: hashHarness(harnessRoot), standardsCommit: standardsSha }, treeOwn: TREE_OWN,
    replaced, patches, at: new Date().toISOString().slice(0, 16) + 'Z' };
  writeFileSync(join(into, TREE_FILE), JSON.stringify(rec, null, 1) + '\n');
  return rec;
}

/** The folder's tree record, or a record of a plain checkout (no overlay: the harness is the tree's own). */
export function treeRecord(root) {
  const f = join(root, TREE_FILE);
  if (existsSync(f)) return JSON.parse(readFileSync(f, 'utf8'));
  let sha = 'unknown';
  try { sha = git(root, ['rev-parse', 'HEAD']).trim(); } catch { /* no git */ }
  return { schema: TREE_SCHEMA, game: { ref: 'HEAD', sha, label: 'this checkout' }, harness: { sha, dirty: null, overlay: null, standardsCommit: null }, replaced: null, patches: [], plain: true };
}

/** Every `live: true|false` switch in src/data: [file:line, the line]. */
function switches(root) {
  const out = [];
  for (const f of filesUnder(root, 'src/data').filter((x) => x.endsWith('.js'))) {
    readFileSync(join(root, f), 'utf8').split('\n').forEach((line, i) => {
      if (/\blive:\s*(true|false)\b/.test(line) && !/^\s*(\/\/|\*|\/\*)/.test(line)) out.push([f + ':' + (i + 1), line.trim().slice(0, 140)]);
    });
  }
  return out;
}

/** The pin's record of the tree at `root` (run inside a materialized folder, or a plain checkout). */
export async function manifest(root) {
  const imp = (p) => import(pathToFileURL(join(root, p)).href);
  const tree = treeRecord(root);
  const { BUILD } = await imp('src/build-info.js');
  const { COMBAT_BALANCE } = await imp('src/core/combat.js');
  const TI = await imp('src/data/hunt-tiers.js');
  const catalogues = filesUnder(root, 'supabase/migrations').filter((f) => f.endsWith('.generated.sql'));
  const config = { build: { version: BUILD.version, cache: BUILD.cache, date: BUILD.date || null }, combat: COMBAT_BALANCE, tierDials: TI.DIALS || null, groundTiers: TI.GROUND_TIERS || null, switches: switches(root) };
  return {
    tree,
    hashes: {
      srcData: hashPaths(root, ['src/data']), engine: hashPaths(root, ['src/core']), edgeSettle: hashPaths(root, ['supabase/functions/hr-accrue']),
      catalogues: { ...hashFiles(root, catalogues), list: catalogues.map((f) => f.split('/').pop()) }, configToml: hashPaths(root, ['supabase/config.toml']),
      config: { sha256: sha256(JSON.stringify(config)) }, standards: hashPaths(root, ['tools/balance-program/standards.mjs']), harness: hashHarness(root), staged: hashPaths(root, TREE_OWN),
    },
    config: { build: config.build, combat: config.combat, tierDials: config.tierDials, switches: config.switches, groundTiersSha256: sha256(JSON.stringify(config.groundTiers)) },
    node: process.version, platform: process.platform,
  };
}
