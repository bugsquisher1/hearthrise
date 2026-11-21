#!/usr/bin/env node
// tools/balance-sim/skill-lines.mjs — THE SKILLS A HERO HAS AT A LEVEL, measured on a career (lane/d-audit-fixes-sim, the board's fix 1,
// "2026-11-19 Balance audit (real hunts)": "take a cell's skills from a career, not from its Level").
//
// WHY. The harness gave every combat skill the hero's Level. Real heroes are not built that way (calibrate.mjs, the 11-16 to 11-18 export):
// a hero who levels alone is AHEAD of its Level on its own skill (Level 26: Melee 36, Defense 32; Level 35: Melee 46, Defense 50), and a hero
// levelled in a Deadly party is BEHIND it (Level 72: main skill 56-59, a caster's Defense 14-24), because a party earns Level XP faster than
// its blows earn skill XP. So the skills come from the life that put a hero at its Level:
//   alone   each way to fight on its own career from Level 1, where the game's advice sends a lone hero (src/shell/hunt-list.js), as players
//           set one up (played.mjs), its skills carried hour to hour (career.mjs)
//   party   the designer's four (tank, Healer, bow, wand) and the all-damage four (tank, hammer, bow, wand), each on its own career from Level 1
//           where the advice sends a four, on the PARTY'S tier (Deadly where the ground offers it, as the recorded fours hunted)
// Nothing here is a combat number: each skill level is read off the engine's own carry (career.mjs trace, the skills a chunk ended on beside
// the Level it ended on). Training Yard hours are NOT in a line (no record says how long players train): `--check` prints each line beside
// the recorded heroes, and the gap left is the yard's.
//
//   node tools/balance-sim/skill-lines.mjs --run [--workers 3] [--out DIR]    play the careers (about 10 minutes on 3 workers)
//   node tools/balance-sim/skill-lines.mjs --write [--in DIR]                 write tools/balance-sim/skill-lines.json from them
//   node tools/balance-sim/skill-lines.mjs --check                            the committed lines beside the recorded heroes
//
// READ BY cell.mjs: a cell with `profile: 'played'` that names no skills of its own plays each seat on its line (`cell.skillLine`, default
// 'alone' for a hero alone and 'party' for a party; 'level' is the old every-skill-at-the-Level hero).
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';
import { isMain } from '../../tests/_is-main.mjs';
import * as XP_CURVE from '../../src/core/xp.js';
import { LEVEL_PACE } from '../../src/data/core-model.js';

/* what a projection past a line's top reads (skillsAt): this tree's skill curve and its pace of record */
const CTX = Object.freeze({ XP: XP_CURVE, targets: LEVEL_PACE.targets });

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
export const SNAPSHOT = join(HERE, 'skill-lines.json');
export const SKILLS = Object.freeze(['melee', 'ranged', 'magic', 'defense', 'inner_flame']);
export const LINES = Object.freeze(['alone', 'party', 'level']);
const LONE_WAYS = Object.freeze(['tank', 'sword', 'hammer', 'axes', 'bow', 'crossbow', 'mage', 'healer']);
/* the fours a party line is read from, and which of their seats stands for a way no four holds (by its role) */
const FOURS = Object.freeze({ four: ['tank', 'healer', 'bow', 'mage'], four_dps: ['tank', 'hammer', 'bow', 'mage'] });
const PARTY_STAND_IN = Object.freeze({ sword: 'hammer', axes: 'hammer', crossbow: 'bow' });
const TOP = 100, PARTY_TIER = 'deadly';

/** The careers the lines are read from (pool jobs, career.mjs). */
export function careerJobs() {
  const life = { kind: 'career', startLevel: 1, targetLevel: TOP, chunkH: 1, chunkByLevel: [[1, 0.25], [10, 0.5], [20, 1]], seed: 0, profile: 'played', supply: 'own' };
  return [
    ...LONE_WAYS.map((s) => ({ ...life, id: 'line:alone:' + s, party: [s], maxHours: 900 })),
    ...Object.entries(FOURS).map(([name, party]) => ({ ...life, id: 'line:party:' + name, party, maxHours: 500, tier: PARTY_TIER })),
  ];
}

/** One career's line per seat: { from, to, skills: { skill: [level at L = from..to] } }, the skills each Level was first reached with. */
function lineOf(career, seat) {
  const at = {};
  for (const t of career.trace) {
    const L = t.levelsAfter ? t.levelsAfter[seat] : null;
    if (!Number.isInteger(L) || at[L]) continue;
    at[L] = t.skills[seat];
  }
  const levels = Object.keys(at).map(Number).sort((a, b) => a - b);
  if (!levels.length) return null;
  const from = levels[0], to = levels[levels.length - 1];
  /* a Level crossed inside a chunk with another (two Levels in one chunk, early) takes the next reached Level's skills */
  const skills = Object.fromEntries(SKILLS.map((k) => [k, []]));
  for (let L = from; L <= to; L++) {
    const near = at[L] || at[levels.find((x) => x >= L)];
    for (const k of SKILLS) skills[k].push(near[k] || 1);
  }
  return { from, to, skills };
}

/** The snapshot from played careers (pool rows: { id, party, trace, ... }). */
export function buildLines(careers, meta) {
  const by = Object.fromEntries(careers.map((c) => [c.id, c]));
  const alone = {}, party = {};
  for (const s of LONE_WAYS) { const c = by['line:alone:' + s]; if (!c) throw new Error('skill-lines: no lone career for ' + s); alone[s] = { ...lineOf(c, 0), hours: c.hours, reached: c.reached[0] }; }
  for (const [name, comp] of Object.entries(FOURS)) {
    const c = by['line:party:' + name];
    if (!c) throw new Error('skill-lines: no party career ' + name);
    comp.forEach((s, i) => { if (!party[s]) party[s] = { ...lineOf(c, i), hours: c.hours, reached: c.reached[i], from4: name }; });
  }
  return { schema: 'hearthrise.skill-lines/1', ...meta, top: TOP, partyTier: PARTY_TIER, standIn: PARTY_STAND_IN, lines: { alone, party } };
}

/** Load the committed snapshot (null when there is none). */
export function loadLines(file = SNAPSHOT) {
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null;
}

/**
 * THE SKILLS a hero of `style` at Level `level` has on `line` ('alone' | 'party'), as skill LEVELS { melee, ranged, magic, defense, inner_flame }.
 * Under the line's start, the start. 'level': every skill at the Level.
 * PAST THE LINE'S TOP each skill goes on at the skill XP an hour of its last ten Levels, over the hours of the pace of record, stretched by
 * sqrt(L / top): projectSkill below, the ONE projection the game's reference hero is written with (tools/gen-ref-hero.mjs -> src/data/to-hit.js
 * REF_HERO, the hero every monster's aim and evasion are written against). It was a straight line in skill LEVELS until 2026-11-21: Melee 198
 * at Level 400 where the skill curve's cost allows 129, so every cell past Level 100 played a hero the game cannot make, against monsters
 * written for the real one (42-formulas-progression.md X43; 51-baseline.md fault F15).
 * `ctx` { XP: src/core/xp.js, targets: LEVEL_PACE.targets } is this tree's by default; a caller reading another tree passes its own.
 */
export function skillsAt(snap, line, style, level, ctx = CTX) {
  const L = Math.max(1, Math.round(level));
  if (line === 'level') return Object.fromEntries(SKILLS.map((k) => [k, L]));
  if (!snap || !snap.lines || !snap.lines[line]) throw new Error('skill-lines: no ' + line + ' line (node tools/balance-sim/skill-lines.mjs --run, then --write)');
  const lines = snap.lines[line];
  const row = lines[style] || lines[(snap.standIn || {})[style]];
  if (!row) throw new Error('skill-lines: the ' + line + ' line has no ' + style);
  const at = (k, x) => row.skills[k][Math.min(row.to, Math.max(row.from, x)) - row.from];
  return Object.fromEntries(SKILLS.map((k) => {
    if (L <= row.to) return [k, Math.max(1, at(k, L))];
    const back = Math.max(row.from, row.to - 10);
    return [k, Math.max(1, projectSkill(ctx, k, at(k, row.to), at(k, back), row.to, back, L))];
  }));
}

/** The hunted hours the pace of record gives Level `L` (LEVEL_PACE.targets, read straight between its rows, held at its last). */
export function paceHoursAt(targets, L) {
  for (let i = 1; i < targets.length; i++) if (L <= targets[i][0]) return targets[i - 1][1] + ((targets[i][1] - targets[i - 1][1]) * (L - targets[i - 1][0])) / (targets[i][0] - targets[i - 1][0]);
  return targets[targets.length - 1][1];
}

/**
 * ONE SKILL PAST A LINE'S TOP: `s1` at Level `top`, `s0` at Level `back`. The skill XP an hour of that last stretch, carried over the pace's
 * hours to Level `L` and stretched by sqrt(L / top), read back through the skill curve. A skill that did not move in the stretch stays.
 */
export function projectSkill(ctx, k, s1, s0, top, back, L) {
  const span = paceHoursAt(ctx.targets, top) - paceHoursAt(ctx.targets, back);
  if (!(span > 0) || s1 <= s0) return s1;
  const x1 = ctx.XP.skillXpForLevel(k, s1), rate = (x1 - ctx.XP.skillXpForLevel(k, s0)) / span;
  return Math.max(s1, ctx.XP.skillLevelFromXp(k, x1 + rate * (paceHoursAt(ctx.targets, L) - paceHoursAt(ctx.targets, top)) * Math.sqrt(L / top)));
}

/* ── --check: the lines beside the recorded heroes (tests/fixtures/balance-calibration.json: each seat's Level and skills at its hunt's start) ── */
async function check(snap) {
  const u = (p) => pathToFileURL(join(ROOT, p)).href;
  const XP = await import(u('src/core/xp.js'));
  const fx = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/balance-calibration.json'), 'utf8'));
  const STYLE = { tank: 'tank', melee_dps: 'hammer', ranger: 'bow', mage: 'mage', healer: 'healer' };
  const main = { tank: 'melee', melee_dps: 'melee', ranger: 'ranged', mage: 'magic', healer: 'magic' };
  const seen = new Set();
  console.log('recorded hero (Level)            main skill: record / alone / party        Defense: record / alone / party');
  for (const s of fx.samples) s.seats.forEach((x) => {
    const L = XP.charLevelFromXp(x.levelXp), key = x.role + ':' + L;
    if (seen.has(key)) return;
    seen.add(key);
    const k = main[x.role], rec = (sk) => XP.skillLevelFromXp(sk, x.skills[sk] || 0);
    const a = skillsAt(snap, 'alone', STYLE[x.role], L), p = skillsAt(snap, 'party', STYLE[x.role], L);
    console.log('  ' + (x.role + ' ' + (s.size > 1 ? 'in a ' + s.size : 'alone') + ' L' + L).padEnd(30) + ' ' + (k + ' ' + rec(k) + ' / ' + a[k] + ' / ' + p[k]).padEnd(32) + ' ' + rec('defense') + ' / ' + a.defense + ' / ' + p.defense);
  });
}

if (isMain(import.meta.url)) {
  const a = process.argv.slice(2), val = (f, d) => { const i = a.indexOf(f); return i >= 0 ? a[i + 1] : d; };
  const dir = resolve(val('--out', val('--in', join(HERE, 'out', 'skill-lines'))));
  if (a.includes('--run')) {
    const { runPool } = await import('./pool.mjs');
    mkdirSync(dir, { recursive: true });
    const res = await runPool(careerJobs(), join(dir, 'cells.jsonl'), { root: ROOT, workers: Number(val('--workers', '3')), cpuMax: Number(val('--cpu', '90')) });
    console.log('skill-lines --run: ' + JSON.stringify(res));
    process.exit(res.failed ? 2 : 0);
  }
  if (a.includes('--write')) {
    const rows = readFileSync(join(dir, 'cells.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => r.kind === 'career' || r.trace);
    const { BUILD } = await import(pathToFileURL(join(ROOT, 'src/build-info.js')).href);
    let commit = null;
    try { commit = execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { commit = null; }
    const snap = buildLines(rows, { generated: new Date().toISOString().slice(0, 10), version: BUILD.version, commit,
      note: 'Skill levels by Level from careers on the real engine (tools/balance-sim/skill-lines.mjs --run, then --write); never edit by hand.' });
    writeFileSync(SNAPSHOT, JSON.stringify(snap) + '\n');
    console.log('skill-lines --write: ' + Object.keys(snap.lines.alone).length + ' lone lines, ' + Object.keys(snap.lines.party).length + ' party lines -> ' + SNAPSHOT);
    await check(snap);
    process.exit(0);
  }
  if (a.includes('--check')) { await check(loadLines()); process.exit(0); }
  console.error('skill-lines: --run | --write | --check');
  process.exit(2);
}
