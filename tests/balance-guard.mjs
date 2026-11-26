#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/balance-guard.mjs — THE WHOLE GAME AGAINST THE PLAN, EVERY RELEASE (balance program 30-plan section E, lane L14).
//
//   node tests/balance-guard.mjs                 the guard: plays its cells on the real settle, prints one screen, exits 0 unless a
//                                                line in `red` mode is out of band (today G14, and G6 since L05)
//   node tests/balance-guard.mjs --strict        every line judged as if `red` (exit 1 on any line outside its red band): the waves' check
//   node tests/balance-guard.mjs --nightly       + the nightly twin: the death cells at 4 seeds x 8 h, judging D1 and D2
//                                                (also chosen when GITHUB_EVENT_NAME=schedule)
//   node tests/balance-guard.mjs --selftest      measures once, then plants out-of-band data line by line (and one dial on the real
//                                                engine) and proves each turns its OWN line red and no other
//   node tests/balance-guard.mjs --write --why "<what moved and why>"   re-writes tests/balance-guard.baseline.json
//   --json <file>  every number it read; --workers N  worker processes (default: the cores, at most 4)
//   After its lines it prints THE STANDARDS: every band of tools/balance-program/standards.mjs judged on the progression grid's cached cells
//   (tools/balance-program/progression-grid.json, played nightly by progression-grid.mjs; grid-derive.mjs judges). Report mode: never an exit, nothing played here.
//
// mutant-anchors: none — every --selftest plant transforms the measured inputs, a loaded module's copy or an engine row inside a
// worker (worker.mjs whatIf), never a file
//
// ci-step: economy-selftests | Balance guard - the whole game against the plan (30-plan E)
// ci-run: node tests/balance-guard.mjs
// ci-run: node tools/mutant-gate.mjs node tests/balance-guard.mjs --selftest
//
// WHAT IT IS. One guard the simulator re-runs every release so the balance cannot drift between patches (30-plan section E). Every
// number comes from the REAL engine (tools/balance-sim/cell.mjs -> the hr-accrue settle -> src/core/combat-sim.js) or the REAL data
// (src/data/*): the reference cells are measure.mjs's own (refCell, rowOf), the lever scan is
// tools/balance-program/lever-scan.mjs, the cost is measure.mjs accountCost on tests/per-player-cost.baseline.json's fixtures. The
// lines, their bands, their modes and the cells are tools/balance-program/guard-cells.mjs. Nothing measured is copied here.
//
// MODES (section E). A line starts as REPORT: it is printed, its out-of-band rows listed, and the run exits 0. It turns RED in the
// lane that lands the change it guards (that lane flips `mode` in guard-cells.mjs) and never goes back. G14 is this lane's own and is red.
// THE REDESIGN (lane/econ-followups, 2026-11-22): G1 and G7 are RE-AIMED on the Danger scale (C-7: a lone hero x the four's head, played on
// every scale ground; C-11: the next scale ground's first depth over the last one's top, read from data), and G3, G4 and G5, the Deadly
// tier's contracts, are RETIRED, each with the reason and the home of its question (guard-cells.mjs RETIRED; printed under the lines).
// K1 GATES the lines read on the harness's party (G8, G19, D1, D2, and G22's party rows): while the harness four
// reads the real Krell four outside 0.9-1.1 on Level XP and kills, or 0.8-1.2 on net gold (guard-cells.mjs K1_GATE, 30-plan E as
// re-issued; today 0.83 and 0.51), they print their numbers as "uncalibrated" and are neither red nor green (31-plan-audit M3). The fix
// is in the harness's four, not in the line.
//
// RUNTIME. Section E: 3 minutes at most. 126 cells run on worker processes (tools/balance-sim/worker.mjs, one engine each, at most
// four); two played lives (life.mjs: the start kit to Level 10,) and the
// lever scan run beside them; G17's two timing cells run alone after them. MEASURED 2026-11-20 with 4 workers: plain 105 s at 68% CPU
// from other lanes (146 s for 114 cells at 100%), --selftest about the plain run + 20 s, --nightly + about 4 min (the six twin cells are
// 128 hero-hours each, about 150 s apiece; G21's climbs ride with them). A cell read only for sums settles in 60 s windows
// (guard-cells.mjs SUMS_WINDOW_MS: the same swings, about a fifth faster).
// THE NIGHTLY PATH. The registered plain step IS the twin on smoke.yml's schedule (GITHUB_EVENT_NAME=schedule, as settle-properties
// does), so a red twin is a red nightly and blocks the next release (CLAUDE.md §3.6); a push runs the plain size.
//
// Exit: 0 clean (or report-only lines out of band) · 1 a red line out of band (any line with --strict; a selftest plant not caught) ·
// 2 harness (a cell failed, a baseline missing, a bad argument).
// ════════════════════════════════════════════════════════════════════════
import { fork, spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { availableParallelism, tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'tests', 'balance-guard.baseline.json');
const WORKER = join(ROOT, 'tools', 'balance-sim', 'worker.mjs');
const LIFE = join(ROOT, 'tools', 'balance-sim', 'life.mjs');
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const argv = process.argv.slice(2);
const has = (f) => argv.includes('--' + f);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };

const GC = await import(u('tools/balance-program/guard-cells.mjs'));
const MODEL = await import(u('tools/balance-program/model.mjs'));
const MEASURE = await import(u('tools/balance-program/measure.mjs'));
const GOLD = await import(u('tools/balance-program/gold-model.mjs'));
const SCAN = await import(u('tools/balance-program/lever-scan.mjs'));
const SL = await import(u('tools/balance-sim/skill-lines.mjs'));
const tiers = await import(u('src/data/hunt-tiers.js'));
const { HUNT_GROUNDS } = await import(u('src/data/hunt-grounds.js'));
const { HUNT_INDEX } = await import(u('src/data/hunts.js'));
const { TOWER_RULES } = await import(u('src/data/tower.js'));
const { LEVEL_PACE } = await import(u('src/data/core-model.js'));
const { contractXpPerH } = await import(u('src/data/balance-sheet.js'));
const TRAINING = await import(u('src/data/training.js'));
const { STAMINA_REFILL } = await import(u('src/data/stamina-refill.js'));
const { STAMINA_MAX_MS } = await import(u('src/data/hunt-sessions.js'));
const XP = await import(u('src/core/xp.js'));
const LUCK = await import(u('tools/balance-sim/staged/luck.js'));
const SCALED = await import(u('src/data/scaled-hunts.js'));
const { GROUND_ROSTER } = await import(u('src/data/balance-sheet.js'));
const { MONSTERS } = await import(u('src/data/monsters.js'));
const ABIL = await import(u('src/data/abilities.js'));
const WAGE = await import(u('src/data/wage.js'));

const LINE = Object.fromEntries(GC.LINES.map((l) => [l.id, l]));
const lerp = GOLD.lerp;

/* ── the context guard-cells.mjs builds its cells from ─────────────────────────────────────────────────────────────────────────── */
const LINES_SNAP = SL.loadLines();
const bandOf = (g) => HUNT_INDEX[HUNT_GROUNDS[g].hunt].band;
const paceHours = (L) => lerp(LEVEL_PACE.targets, L);
/** G11: the skill levels a lone hammer gains over its career line by training every idle hour since the yard opened to it. */
function yardLevels(level) {
  const pl = MODEL.REFERENCE_PLAYERS.find((p) => p.id === GC.G11_PLAYER);
  const idle = Math.max(0, 24 - pl.huntHoursADay - pl.townHoursADay);
  const days = Math.max(0, paceHours(level) - paceHours(TRAINING.TRAINING_RULES.minLevel)) / pl.huntHoursADay;
  const trained = days * idle * TRAINING.TRAINING_RULES.xpPerHour;
  const line = SL.skillsAt(LINES_SNAP, 'alone', 'hammer', level);
  const over = (k) => XP.skillLevelFromXp(k, XP.skillXpForLevel(k, line[k]) + trained) - line[k];
  return { main: over('melee'), defense: over('defense'), days, trained };
}
/** G24: a ground's roster as it plays scaled to `level` (scaled-hunts.js scaledRow), a worker what-if; null when it does not scale. */
function scaledWhatIf(ground, level) {
  const rows = {};
  for (const id of Object.keys(GROUND_ROSTER[ground] || {})) {
    const r = SCALED.scaledRow(MONSTERS[id], id, ground, level);
    if (r === MONSTERS[id]) return null;
    rows[id] = Object.fromEntries(['level', 'hp', 'atk', 'aim', 'evasion', 'def', 'xp', 'gp', 'drops', 'partyPm', 'lootPm'].map((k) => [k, r[k]]));
  }
  return Object.keys(rows).length ? { monsters: rows } : null;
}
/* THE SCALE (lane/econ-followups: G1 and G7 re-aimed): every Danger scale ground at the Level its reference step was measured at
   (tests/level-curve.mjs REF_LEVEL, as C7 and V4 read it), the held start (refStep - startMargin) and the band's floor; a cell on it is
   held-four.mjs's (progression-grid.mjs buildCell, the matrix's MID kits and played bars) with a Steady stance from `start`. */
const DZ = await import(u('src/data/danger.js'));
const { refLevelOf } = await import(u('tests/level-curve.mjs'));
const GRID = await import(u('tools/balance-program/progression-grid.mjs'));
const [GRID_D, GRID_K] = await Promise.all([GRID.loadGridData(ROOT), (await import(u('tools/balance-program/grid-kit.mjs'))).loadKits(ROOT)]);
const SCALE_GROUNDS = Object.entries(DZ.DANGER_GROUNDS).map(([id, g]) => ({ id, level: refLevelOf(id), heldStart: Math.max(0, g.refStep - DZ.DANGER.startMargin), floorStep: g.floorStep }));
const scaleCell = (ground, level, styles, start) => ({ ...GRID.buildCell(GRID_D, GRID_K, { L: level, gear: 'mid', styles: [...styles], tier: 'normal', ground }).cell,
  options: { risk: 'steady', danger: start } });
const CTX = { tiers, refCell: MEASURE.refCell, lines: LINES_SNAP, skillsAt: SL.skillsAt, MAIN: MEASURE.MAIN, bandOf, yardLevels, towerHunt: TOWER_RULES.hunt, scaledWhatIf, scalableGrounds: Object.keys(SCALED.SCALABLE_GROUNDS),
  scaleGrounds: SCALE_GROUNDS, scaleCell };

/* ── the pool: worker.mjs processes, one engine each ───────────────────────────────────────────────────────────────────────────── */
function playAll(jobs, workers, log = () => {}) {
  const cost = (j) => (j.cell.hours || 1) * (j.cell.seeds || 1) * ((j.cell.party || []).length || 1);
  const queue = [...jobs].sort((a, b) => cost(b) - cost(a));
  const results = {}, errors = [];
  if (!queue.length) return Promise.resolve({ results, errors });
  const n = Math.max(1, Math.min(workers, queue.length));
  return new Promise((done) => {
    let alive = n;
    const feed = (w) => {
      const j = queue.shift();
      if (!j) { w.kill(); return; }
      w.job = j;
      w.send({ type: 'job', job: { ...j.cell, id: j.id, ...(j.whatIf ? { whatIf: j.whatIf } : {}) } });
    };
    for (let i = 0; i < n; i++) {
      const w = fork(WORKER, [ROOT], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
      w.on('message', (m) => {
        if (m.type === 'ready') { feed(w); return; }
        if (m.type === 'done') { results[m.id] = { ms: m.ms, result: m.result }; log(m.id, m.ms); } else errors.push({ id: m.id, error: String(m.error).split('\n').slice(0, 3).join(' ') });
        w.job = null;
        feed(w);
      });
      w.on('exit', () => {
        if (w.job) { errors.push({ id: w.job.id, error: 'the worker exited mid-cell' }); w.job = null; }
        if (--alive === 0) { for (const j of queue.splice(0)) errors.push({ id: j.id, error: 'never ran: every worker exited' }); done({ results, errors }); }
      });
    }
  });
}

/** A played life (tools/balance-sim/life.mjs), read from its --out file: { json, error }. */
function playLife(policy, to, max, party = ['hammer']) {
  const dir = mkdtempSync(join(tmpdir(), 'balance-guard-'));
  const out = join(dir, 'life.json');
  return new Promise((done) => {
    const p = spawn(process.execPath, [LIFE, '--party', party.join(','), '--policy', policy, '--to', String(to), '--max', String(max), '--out', out], { stdio: ['ignore', 'ignore', 'inherit'] });
    p.on('exit', (code) => {
      let json = null, error = null;
      try { json = JSON.parse(readFileSync(out, 'utf8')); } catch (e) { error = 'life.mjs --policy ' + policy + ' exited ' + code + ': ' + e.message; }
      rmSync(dir, { recursive: true, force: true });
      done({ json, error });
    });
  });
}
/** G6: the new player's life to Level 10 (LEVEL_PACE.newPlayer: the start kit, life.mjs --policy new, Hunt again in the Thicket; lane/c-levels-7-9
    calibrated it on the retention dive's blind play within 4%, where --policy idle's walk to Wickstead read half the hours): hours to 10 and
    each Level's step. */
function lifeIdleOf(j) {
  const at = (q) => (j.miles['0:' + q] || {}).h;
  const steps = [];
  for (let q = 2; q <= 10; q++) if (at(q) !== undefined) steps.push([q, Math.round((at(q) - (q === 2 ? 0 : at(q - 1))) * 100) / 100]);
  return { level10: at(10) ?? null, reached: j.reached[0], hours: j.hours, steps };
}
/* (G9 and G20, the hero slot against a played lone bank, retired 2026-11-21 with the slot prices: patches/fb5-free-hero-slots.json) */

/* ── the data half: read once, planted by --selftest ────────────────────────────────────────────────────────────────────────────── */
function costInputs() {
  return { fixtures: JSON.parse(readFileSync(join(ROOT, 'tests', 'per-player-cost.baseline.json'), 'utf8')).fixtures, players: MODEL.REFERENCE_PLAYERS, cost: MODEL.COST };
}
/** G16: a reference account's day on the server: fixtures (MEASURED on the replayed chain) at the REAL cadences, and accountCost's REAL means. */
function costOf(ci) {
  const fx = (seat) => Object.entries(ci.fixtures).find(([k]) => (seat === 'four' ? /^party4/ : /^lone/).test(k));
  const out = {};
  for (const pl of ci.players) {
    const [name, f] = fx(pl.seat), n = /^party4/.test(name) ? 4 : 1;
    const hunted = pl.heroes * pl.huntHoursADay, tabH = ci.cost.real.watchedShareOfHuntedHours * pl.huntHoursADay;
    const watched = Math.min(hunted, tabH * pl.heroes), away = hunted - watched;
    const settles = watched * ci.cost.commitsAnHour.watched + away * ci.cost.commitsAnHour.away;
    const acct = MEASURE.accountCost(pl, 'real', ci.cost.real.tabHourReadsS.today);
    out[pl.id] = { statementsADay: Math.round(settles * f.statements_a_settle / n), rowWritesADay: Math.round(settles * f.row_writes_a_settle / n),
      ledgerRowsADay: Math.round(hunted * f.ledger_rows_a_hero_hour), dbSADay: Math.round(acct.dbS), journalRowsADay: Math.round(acct.rows) };
  }
  return out;
}
function dataInputs() {
  return {
    refill: { ...STAMINA_REFILL },
    bar: { lanes: { ...ABIL.ABILITY_LANES }, rows: Object.values(ABIL.ABILITIES).map((r) => ({ id: r.id, lane: r.lane, cdMs: r.cdMs, disciplines: [...r.disciplines], replaces: r.replaces || null })), budget: { ...GC.BAR_BUDGET } },
    training: { rules: TRAINING.TRAINING_RULES, gear: TRAINING.TRAINING_GEAR, fee: TRAINING.trainingFee },
    costIn: costInputs(),
    stamina: { freeH: STAMINA_MAX_MS.free / 3600000, refillH: STAMINA_REFILL.perDay * STAMINA_REFILL.maxMinPerBuy / 60, players: MODEL.REFERENCE_PLAYERS },
    luckTop: LUCK.MAGIC_FIND_MAX,
    /* G7: each scale ground's band in its own steps and its base item Level (the wage step its reference depth pays), and the coin rule */
    scale: { grounds: Object.entries(DZ.DANGER_GROUNDS).map(([id, g]) => ({ id, gearLevel: g.gearLevel, refStep: g.refStep, floorStep: g.floorStep, topStep: g.topStep })),
      floor: DZ.PAY.floor, gapMax: DZ.PAY.gapMax, payStepCoin: WAGE.WAGE.payStepCoin },
  };
}
/** G7: what a hold at `step` of ground `g` pays in the wage's unit: the engine's coin rule (src/data/danger.js PAY: the depth ratio on the gap,
    held at the pay floor under the reference and at gapMax over it) on the wage its reference depth was calibrated to (wage(gearLevel)). */
function depthPay(sc, g, step) {
  return WAGE.wage(g.gearLevel) * Math.max(sc.floor, (1 + sc.payStepCoin) ** Math.min(step - g.refStep, sc.gapMax));
}
/** G7's pairs: each scale ground of a base item Level against the best-paying top of the Level before it (grounds of one Level, the two
    Catacomb wings, are each other's alternatives, never "the next ground"). [{ prev, next }] in the judge's order. */
function g7Pairs(sc) {
  const levels = [...new Set(sc.grounds.map((g) => g.gearLevel))].sort((a, b) => a - b);
  const at = (L) => sc.grounds.filter((g) => g.gearLevel === L).sort((a, b) => (a.id < b.id ? -1 : 1));
  return levels.slice(1).flatMap((L, i) => {
    const prev = at(levels[i]).reduce((m, g) => (depthPay(sc, g, g.topStep) > depthPay(sc, m, m.topStep) ? g : m));
    return at(L).map((next) => ({ prev, next }));
  });
}

/* ── measuring ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
async function measure({ nightly = false, workers, quiet = false }) {
  const t0 = Date.now();
  const jobs = GC.plainCells(CTX).filter((j) => !j.id.startsWith('time-'));
  const twin = nightly ? GC.nightlyCells(CTX) : [];
  const lifeP = playLife(LEVEL_PACE.newPlayer.policy, 10, 14, LEVEL_PACE.newPlayer.party);
  const scanP = SCAN.scanLevers(ROOT);
  const progress = quiet ? () => {} : (() => { let k = 0; const total = jobs.length + twin.length; return () => { k++; if (process.stderr.isTTY) process.stderr.write('\r  cells ' + k + '/' + total + '   '); }; })();
  const { results, errors } = await playAll([...jobs, ...twin], workers, progress);
  /* G17: engine time, measured alone after the pool (a busy machine would read every other cell's work), warm: the second run of each */
  const timing = GC.plainCells(CTX).filter((j) => j.id.startsWith('time-'));
  const timed = await playAll([...timing, ...timing.map((j) => ({ ...j, id: j.id + ':warm' }))], 1);
  if (process.stderr.isTTY && !quiet) process.stderr.write('\r');
  const idle = await lifeP;
  const scan = await scanP;
  const rows = {}, ms = {};
  for (const [id, r] of Object.entries({ ...results, ...timed.results })) {
    const party = r.result.cell.party;
    rows[id] = { ...MEASURE.rowOf(r.result, party), heroHours: r.result.heroes.reduce((s, h) => s + h.hours, 0), partyHours: r.result.party.hours,
      front: { takenPerH: r.result.heroes[0].takenPerH }, level: r.result.heroes.map((h) => h.level),
      /* a climb's top floor (endgame.mjs climb: a run that cleared nothing topped out under its start) */
      ...(r.result.party.tower ? { towerTop: r.result.party.tower.top === null ? r.result.party.tower.from - 1 : r.result.party.tower.top } : {}) };
    ms[id] = r.ms;
  }
  const life = idle.json ? lifeIdleOf(idle.json) : null;
  return { rows, ms, life, scan, data: dataInputs(), errors: [...errors, ...timed.errors, ...[idle].filter((x) => x.error).map((x) => ({ id: 'life', error: x.error }))],
    nightly, wallMs: Date.now() - t0, workers, cells: jobs.length + twin.length + timing.length * 2 };
}

/* ── judging ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const inR = (v, r) => !!r && (r[0] === null || v >= r[0]) && (r[1] === null || v <= r[1]);
/* NaN is a reading that failed (ERR, the harness); an infinite one is a real answer (an offer with no measurable gain is never cheap) */
const statusOf = (v, band) => (typeof v !== 'number' || Number.isNaN(v) ? 'ERR' : inR(v, band.target) ? 'ok' : inR(v, band.keep) ? 'off' : 'RED');
const RANK = { ok: 0, 'n/a': 0, nightly: 0, uncal: 0, uncalibrated: 0, off: 1, RED: 2, ERR: 3 };
const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v));
const kG = (v) => (Number.isFinite(v) ? (Math.abs(v) >= 1000 ? (v / 1000).toFixed(1) + 'k' : String(Math.round(v))) : String(v));

/** K1'S GATE (31-plan-audit M3; the Coordinator 2026-11-20): a line read on the harness's party (`gate` 'xp' or 'gold' on the line or a
    row) is judged only while K1 reads the real Krell four within its own target, on Level XP and kills ('xp') or on net gold ('gold').
    Outside it the row reports its number and the status `uncal`: never red, never green, never an exit. */
/* THE REAL FOUR ON TODAY'S ENGINE (model.mjs REAL_KRELL_FOUR_SHIFTS, lane/c-engine-reds): its Level XP and kills times every formula shift
   since its hunt, its gold rebuilt from its income and its store bill each times theirs. K1 compares the harness with the hunt as today's
   engine would pay it, never with a number another engine paid (the to-hit ratio and the spell rule moved K1's Level XP 0.83 -> 1.06 with
   no change to the harness: the gate would have opened on an engine change). */
function realKrellNow(K = MODEL.REAL_KRELL_FOUR, shifts = MODEL.REAL_KRELL_FOUR_SHIFTS) {
  const m = (k) => shifts.reduce((x, s) => x * ((s.mult && s.mult[k]) || 1), 1);
  const income = K.netGoldAHeroHour + K.storeAHeroHour;
  return { levelXpAHeroHour: K.levelXpAHeroHour * m('levelXp'), killsAClockHour: K.killsAClockHour * m('kills'),
    netGoldAHeroHour: income * m('income') - K.storeAHeroHour * m('store'), shifts: shifts.length };
}

function calibration(I) {
  const K = { ...MODEL.REAL_KRELL_FOUR, ...realKrellNow() }, r = I.rows['krell-real'], G = GC.K1_GATE;
  const inT = (x, t) => Number.isFinite(x) && x >= t[0] && x <= t[1];
  if (!r) return { xp: false, gold: false };
  return { xp: inT(r.levelXpPerH / K.levelXpAHeroHour, G.xp) && inT(r.killsPerH / K.killsAClockHour, G.xp), gold: inT((r.incomePerH - r.storePerH * (1 - K.ownStockShare)) / K.netGoldAHeroHour, G.gold) };
}

function judge(I) {
  const out = [];
  const R = (id) => I.rows[id] || null;
  const cal = calibration(I);
  const line = (id, rows0, note = '') => {
    const L = LINE[id];
    const rows = rows0.map((r) => { const g = r.gate || L.gate; return g && !cal[g] && r.status !== 'ERR' ? { ...r, status: 'uncal' } : r; });
    const status = L.notBuilt || (rows.length && rows.every((r) => r.status === 'n/a')) ? 'n/a' : L.nightly && !I.nightly ? 'nightly' : rows.length && rows.every((r) => r.status === 'uncal') ? 'uncalibrated'
      : rows.reduce((s, r) => (RANK[r.status] > RANK[s] ? r.status : s), 'ok');
    out.push({ id, words: L.words, on: L.on, mode: L.mode, turnsRedIn: L.turnsRedIn, status, rows, note: (L.gate && !cal[L.gate] && status !== 'nightly' ? 'UNCALIBRATED: K1 reads the harness four outside ' + GC.K1_GATE[L.gate].join('-') + ' of the real one on ' + (L.gate === 'xp' ? 'Level XP or kills' : 'net gold') + '. ' : '') + note });
  };
  const row = (at, value, band, show = f2, extra = '') => ({ at, value, status: statusOf(value, band), shown: show(value) + extra });
  const band = (id, part) => (part ? LINE[id].parts[part] : { target: LINE[id].target, keep: LINE[id].keep });
  const star = (p) => (p.open ? '' : '*');
  const xc = (r, L) => (r ? r.levelXpPerH / contractXpPerH(L) : NaN);

  /* G1 (re-aimed, C-7): each lone reference seat over the mixed four's head, on every scale ground */
  line('G1', CTX.scaleGrounds.flatMap((g) => GC.SCALE_LONE.map((style) => {
    const lone = R('scale-lone:' + g.id + ':' + style), four = R('scale-four:' + g.id);
    return row(g.id + ' ' + style, lone && four && four.levelXpPerH > 0 ? lone.levelXpPerH / four.levelXpPerH : NaN, band('G1'), f2, lone ? ' (' + kG(lone.levelXpPerH) + ' / ' + kG(four && four.levelXpPerH) + ')' : '');
  })), 'Level ' + CTX.scaleGrounds.map((g) => g.level).join('/') + ', Steady; the four from its held start, a lone hero from the band\'s floor');
  line('G2', GC.ALL_POINTS.map((p) => {
    const ways = [['hammer', R('ref:' + p.id + ':lone')], ['mage', R('ref:' + p.id + ':mage')], ...['tank', 'sword', 'axes', 'bow', 'crossbow', 'healer'].map((s) => [s, R('way:' + p.id + ':' + s)])];
    if (ways.some(([, r]) => !r)) return row(p.id + star(p), NaN, band('G2'));
    const xs = ways.map(([s, r]) => [s, r.levelXpPerH]).sort((a, b) => a[1] - b[1]);
    const med = (xs[3][1] + xs[4][1]) / 2, best = xs[xs.length - 1];
    return row(p.id + star(p), best[1] / med, band('G2'), f2, ' ' + best[0]);
  }));
  /* (G3, G4 and G5 are RETIRED, guard-cells.mjs RETIRED says why and what holds each question now) */
  {
    const lf = I.life;
    const worst = lf ? lf.steps.reduce((m, s) => (s[1] > m[1] ? s : m), [0, -1]) : null;
    line('G6', lf ? [row('Level 10', lf.level10 ?? Infinity, band('G6', 'level10'), (v) => v.toFixed(1) + ' h'),
      row('longest under 10', worst[1], band('G6', 'step'), (v) => v.toFixed(1) + ' h', ' (' + (worst[0] - 1) + '->' + worst[0] + ')')] : [{ at: 'life', value: NaN, status: 'ERR', shown: 'no life' }]);
  }
  {
    /* G7 (re-aimed, C-11): read from data, consecutive scale grounds by base item Level */
    const sc = I.data.scale;
    const rows = g7Pairs(sc).map(({ prev, next: g }) => {
      const v = depthPay(sc, g, g.floorStep) / depthPay(sc, prev, prev.topStep);
      return row(prev.id + ' -> ' + g.id, v, band('G7'), f2, ' (' + kG(depthPay(sc, g, g.floorStep)) + ' at depth 1 / ' + kG(depthPay(sc, prev, prev.topStep)) + ' at depth 20)');
    });
    line('G7', rows.length ? rows : [{ at: sc.grounds.map((g) => g.id).join(', ') || 'none', value: NaN, status: 'n/a', shown: 'one base item Level on the scale' }],
      rows.length ? 'a hold\'s coin in the wage\'s unit: wage(gearLevel) x the depth ratio (src/data/danger.js PAY); a Level\'s grounds against the best top of the Level before' : 'judged once a second base item Level is on the scale');
  }
  line('G8', GC.DEADLY_POINTS.map((p) => { const r = R('four-real:' + p.id); return row(p.id, r ? r.incomePerH - r.storePerH * (1 - GC.G8_OWN_SHARE) : NaN, band('G8'), kG); }),
    'store x' + (1 - GC.G8_OWN_SHARE) + ' (a quarter own); linings not built (L32)');
  {
    const rows = [];
    for (const p of GC.POOL_POINTS) {
      const base = R('ref:' + p.id + ':lone'), xm = R('lone-yard-main:' + p.id), xd = R('lone-yard-def:' + p.id), t = yardLevels(p.level);
      rows.push(row(p.id + ' xp', xm && base ? xm.levelXpPerH / base.levelXpPerH : NaN, band('G11', 'xp'), f2, ' (+' + t.main + ' main)'));
      rows.push(row(p.id + ' dmg', xd && base ? 1 - xd.takenPerH / base.takenPerH : NaN, band('G11', 'dmg'), f2, ' (+' + t.defense + ' Def)'));
    }
    line('G11', rows, 'every idle hour of the Own four\'s day in the yard, days on the lone pace table (an upper bound)');
  }
  {
    const rows = [];
    const T = I.data.training, xpFor = (k, lv) => XP.skillXpForLevel(k, lv);
    for (const p of GC.POOL_POINTS) {
      const base = R('ref:' + p.id + ':lone'), main10 = R('lone-main10:' + p.id);
      if (!base || !main10 || !(base.netPerH > 0)) { rows.push({ at: p.id, value: NaN, status: 'ERR', shown: 'no lone net' }); continue; }
      const net = base.netPerH, per1 = (gold, gain) => (gain > 0 ? gold / net / (100 * gain) : Infinity);
      const m = SL.skillsAt(LINES_SNAP, 'alone', 'hammer', p.level).melee, g10 = main10.levelXpPerH / base.levelXpPerH - 1;
      let yard = 0;
      for (let k = 0; k < 10; k++) yard += (xpFor('melee', m + k + 1) - xpFor('melee', m + k)) / T.rules.xpPerHour * T.fee(m + k);
      rows.push(row(p.id + ' yard +10', per1(yard, g10), band('G12')));
      const extra = (T.gear.boostPermille - 1000) / 1000 * T.rules.xpPerHour * 12;
      let lv = 0, left = extra;
      while (left > 0 && lv < 50) { const step = xpFor('melee', m + lv + 1) - xpFor('melee', m + lv); if (left >= step) { left -= step; lv++; } else { lv += left / step; left = 0; } }
      rows.push(row(p.id + ' item 12 h', per1(T.gear.gold[12], g10 * lv / 10), band('G12')));
    }
    line('G12', rows, 'lone REF hours of gold a +1% (Temper on steps is priced in hours of wage: 21 section 2.2)');
  }
  {
    const drop = ['charms', 'trophy-multipliers', 'band-boost', 'monster-drop-bonus', 'food-xp-buffs'].filter((id) => I.scan.byLever.has(id));
    line('G13', [{ at: 'staged top', value: I.data.luckTop, status: 'n/a', shown: String(I.data.luckTop) }], 'Luck is not built (L20); drop levers outside the one budget today: ' + drop.join(', '));
  }
  {
    const pins = (I.baseline && I.baseline.pins && I.baseline.pins.cutRows) || null;
    const rows = [{ at: 'strangers', value: I.scan.strangers.length, status: I.scan.strangers.length ? 'RED' : 'ok', shown: String(I.scan.strangers.length) }];
    for (const [id, n] of Object.entries(I.scan.pinned)) {
      const pin = pins ? pins[id] : undefined;
      rows.push({ at: id, value: n, status: pin === undefined ? 'RED' : n > pin ? 'RED' : n < pin ? 'off' : 'ok', shown: n + (pin === undefined ? ' (no pin: --write)' : n !== pin ? ' (pin ' + pin + ')' : '') });
    }
    line('G14', rows, I.scan.strangers.slice(0, 3).map((s) => (s.key || s.path) + ' in ' + s.file + ': ' + s.why).join('; '));
  }
  line('G15', [{ at: 'index', value: NaN, status: 'n/a', shown: 'not built' }], 'no band price index in the data yet (L47)');
  {
    const now = costOf(I.data.costIn), base = (I.baseline && I.baseline.cost) || null;
    line('G16', Object.entries(now).map(([pid, c]) => {
      if (!base || !base[pid]) return { at: pid, value: NaN, status: 'RED', shown: 'no baseline: --write' };
      const ratios = Object.entries(c).map(([k, v]) => [k, base[pid][k] ? v / base[pid][k] : v > 0 ? Infinity : 1]);
      const worst = ratios.reduce((m, x) => (x[1] > m[1] ? x : m));
      return row(pid, worst[1], band('G16'), f2, ' ' + worst[0].replace(/ADay$/, ''));
    }), 'a day: ' + Object.entries(now.ownfour).map(([k, v]) => k.replace(/ADay$/, '') + ' ' + kG(v)).join(', ') + ' (the Own four)');
  }
  line('G17', ['time-krell', 'time-tower'].map((id) => {
    const r = R(id + ':warm'), ms = I.ms[id + ':warm'];
    return row(id.replace('time-', ''), r && ms ? ms / (r.partyHours * 36) : NaN, band('G17'), (v) => Math.round(v) + ' ms');
  }));
  {
    const S = I.data.stamina, ceiling = S.freeH + S.refillH;
    line('G18', S.players.map((pl) => row(pl.id, pl.huntHoursADay, pl.id === 'ownfour' ? band('G18', 'ownfour') : band('G18', 'ceiling'), (v) => v.toFixed(1) + ' h')),
      'on-call heroes not built (L40); the data\'s ceiling a hero: bar ' + S.freeH + ' h + refills ' + S.refillH + ' h = ' + ceiling + ' h, of a 24 h day');
  }
  {
    const K = { ...MODEL.REAL_KRELL_FOUR, ...realKrellNow() }, r = R('krell-real');
    const net = r ? r.incomePerH - r.storePerH * (1 - K.ownStockShare) : NaN;
    line('K1', r ? [row('Level XP', r.levelXpPerH / K.levelXpAHeroHour, band('K1'), f2, ' (' + kG(r.levelXpPerH) + ')'), row('kills', r.killsPerH / K.killsAClockHour, band('K1'), f2, ' (' + r.killsPerH + ')'),
      row('net gold', net / K.netGoldAHeroHour, band('K1'), f2, ' (' + kG(net) + ')'),
      /* who takes the blows (51-baseline.md F16): the share of the four's damage on the last seat, and the four's damage a clock hour, each over the real hunt's */
      ...(Array.isArray(r.takenBySeat) && r.takenBySeat.length ? (() => { const tot = r.takenBySeat.reduce((a, b) => a + b, 0), last = r.takenBySeat[r.takenBySeat.length - 1];
        return [row('last seat dmg share', tot > 0 ? last / tot / K.damageShareLastSeat : NaN, band('K1'), f2, ' (' + (tot > 0 ? Math.round((100 * last) / tot) : '?') + '%)'),
          row('party dmg', tot / K.damageAClockHour, band('K1'), f2, ' (' + kG(tot) + ')')]; })() : [])] : [{ at: 'krell', value: NaN, status: 'ERR', shown: 'no cell' }],
    'harness / ' + K.label + ', restated on the engine of today (' + K.shifts + ' formula shifts since its hunt); harness deaths ' + (r ? r.deaths : '?') + ' in ' + (r ? r.heroHours.toFixed(0) : '?') + ' hero-hours');
  }
  /* ── the plan audit's lines (31-plan-audit.md M2, M5, M9) ── */
  {
    const rows = [];
    for (const p of GC.SMALL_POINTS) for (const k of Object.keys(GC.SMALL_PARTIES)) {
      const r = R('small:' + k + ':' + p.id), four = R('ref:' + p.id + ':four');
      rows.push(row(p.id + ' ' + k, xc(r, p.level), band('G19'), f2, r && four ? ' (x' + (r.levelXpPerH / four.levelXpPerH).toFixed(2) + ' the four, net ' + kG(r.netPerH) + ')' : ''));
    }
    line('G19', rows, 'pair ' + GC.SMALL_PARTIES.pair.join(' + ') + ', three ' + GC.SMALL_PARTIES.three.join(' + ') + '; the pace of record assumes 1.2 and 2.0 x the lone table');
  }
  line('G21', I.nightly ? [
    ...GC.TOWER_FOURS.map((p) => { const r = R('tower-four:' + p.id); return row('four ' + p.level, r && Number.isFinite(r.towerTop) ? r.towerTop - p.level : NaN, band('G21', 'top'), (v) => (v >= 0 ? '+' : '') + v + ' floors'); }),
    ...GC.TOWER_LONE.flatMap((p) => ['hammer', 'mage'].map((s) => {
      const r = R('tower-lone:' + p.id + ':' + s), h = R('ref:' + p.id + ':' + (s === 'hammer' ? 'lone' : 'mage'));
      return row(s + ' ' + p.level, r && h ? r.levelXpPerH / h.levelXpPerH : NaN, band('G21', 'xp'));
    })),
  ] : []);
  {
    const F = I.data.refill, hBuy = F.maxMinPerBuy / 60;
    const price = (n, L) => Math.ceil((F.base + F.perLevel * L) * (F.stepDen + F.stepNum * (n - 1)) / F.stepDen);
    const rows = GC.ALL_POINTS.filter((p) => p.open).map((p) => {
      const r = R('ref:' + p.id + ':lone');
      return row(p.id + ' 2nd', r ? (r.netPerH > 0 ? price(2, p.level) / (hBuy * r.netPerH) : Infinity) : NaN, band('G22', 'pays'));
    });
    const pyre = GC.BY_ID.pyre, f = R('four-real:pyre');
    const six = Array.from({ length: F.perDay }, (_, i) => price(i + 1, pyre.level)).reduce((a, b) => a + b, 0);
    const fn = f ? f.incomePerH - f.storePerH * (1 - GC.G8_OWN_SHARE) : NaN;
    rows.push({ ...row('pyre all ' + F.perDay + ' (four)', Number.isNaN(fn) ? NaN : fn > 0 ? six / (F.perDay * hBuy * fn) : Infinity, band('G22', 'six'), f2, ' (' + kG(six) + ')'), gate: 'gold' });
    line('G22', rows, 'each refill costs ' + F.stepNum + '/' + F.stepDen + ' of the first more than the last (24-1 rules 1/2); the four is G8\'s');
  }
  {
    const B = I.data.bar, rows = [];
    const ds = [...new Set(B.rows.flatMap((r) => r.disciplines))].filter((d) => B.rows.some((r) => r.lane === 'offense' && r.disciplines.includes(d)));
    for (const d of ds) {
      const fill = B.rows.filter((r) => r.lane === 'offense' && !r.replaces && r.disciplines.includes(d)).reduce((s, r) => s + B.lanes.offense / r.cdMs, 0);
      const cap = B.budget[d] ?? B.budget['*'];
      rows.push(row(d, Math.round(1e6 * fill / cap) / 1e6, { target: [null, 1], keep: [null, 1] }, () => fill.toFixed(2) + '/' + cap));
    }
    line('G23', rows, 'the lane filled = the sum of the offense lane over each row\'s cooldown; a row that replaces another shares its cooldown');
  }
  line('G24', GC.scaledPlan(CTX, I.nightly).flatMap(([g, pid]) => ['hammer', 'mage'].map((s) => {
    const r = R('scaled:' + g + ':' + pid + ':' + s), h = R('ref:' + pid + ':' + (s === 'hammer' ? 'lone' : 'mage'));
    return row(g + '@' + pid + ' ' + s, r && h ? r.levelXpPerH / h.levelXpPerH : NaN, band('G24'));
  })), 'Normal, against the reference ground of that Level; the switch is off (dark until L31)');
  const d100 = (r) => (r && r.heroHours > 0 ? 100 * r.deaths / r.heroHours : NaN);
  line('D1', I.nightly ? GC.DEADLY_POINTS.map((p) => row(p.id, d100(R('twin-band:' + p.id)), band('D1'))) : []);
  line('D2', I.nightly ? GC.DEADLY_POINTS.map((p) => row(p.id + '-10', d100(R('twin-under:' + p.id)), band('D2'))) : []);
  return out;
}

/** 1 when a line that counts is RED (every line under strict; `red`-mode lines otherwise), else 0. ERR is the harness: 2. */
function exitOf(lines, strict) {
  if (lines.some((l) => l.status === 'ERR')) return 2;
  return lines.some((l) => l.status === 'RED' && (strict || l.mode === 'red')) ? 1 : 0;
}

/* ── the report ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const MARK = { ok: '', off: '~', RED: '!', ERR: '?', 'n/a': '', nightly: '', uncal: '#' };
function report(I, lines, strict) {
  const commit = (() => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'unknown'; } })();
  const sz = GC.SIZES.plain;
  console.log('BALANCE GUARD (30-plan E) on ' + commit + ': ' + I.cells + ' cells at ' + sz.seeds + ' seeds x ' + sz.hours + ' h' + (I.nightly ? ' + the nightly twin at ' + GC.SIZES.nightly.seeds + ' x ' + GC.SIZES.nightly.hours + ' h' : '')
    + ', ' + I.workers + ' workers, ' + (I.wallMs / 1000).toFixed(0) + ' s. ' + (strict ? 'STRICT: every line judged red.' : 'Report mode (red-mode lines: ' + GC.LINES.filter((l) => l.mode === 'red').map((l) => l.id).join(', ') + ').'));
  console.log('line | status | mode, turns red in | value at each place (~ off target, ! past the red band, # not judged: K1 uncalibrated, * staged) | target / outside this is red');
  for (const l of lines) {
    const L = LINE[l.id];
    const bands = L.bands || (L.parts ? Object.entries(L.parts).map(([k, b]) => k + ' ' + rng(b.target) + ' / ' + rng(b.keep)).join('; ') : rng(L.target) + ' / ' + rng(L.keep));
    console.log([l.id, l.status, l.mode + ', ' + l.turnsRedIn, l.words + ': ' + (l.rows.length ? l.rows.map((r) => r.at + ' ' + r.shown + MARK[r.status]).join(', ') : l.status === 'nightly' ? 'judged by the nightly twin only' : '-'), bands].join(' | ')
      + (l.note ? '\n     ' + l.note : ''));
  }
  for (const [id, why] of Object.entries(GC.RETIRED)) console.log(id + ' | RETIRED | ' + why);
  const out = lines.filter((l) => l.rows.some((r) => r.status === 'RED' || r.status === 'off'));
  console.log('OUTSIDE THEIR BAND: ' + (out.length ? out.map((l) => l.id + ' (' + l.rows.filter((r) => r.status === 'RED').map((r) => r.at + '!').concat(l.rows.filter((r) => r.status === 'off').map((r) => r.at + '~')).join(' ') + ')').join(', ') : 'none'));
  if (I.errors.length) console.log('HARNESS: ' + I.errors.map((e) => e.id + ': ' + e.error).join('; '));
  const moved = movedSinceBaseline(I, lines);
  if (moved) console.log(moved);
}
function rng(r) { if (!r) return '-'; const [a, b] = r; return a === null ? '<=' + b : b === null ? '>=' + a : a + '-' + b; }
function valuesOf(lines) { return Object.fromEntries(lines.map((l) => [l.id, Object.fromEntries(l.rows.filter((r) => Number.isFinite(r.value)).map((r) => [r.at, Math.round(r.value * 1000) / 1000]))])); }
function movedSinceBaseline(I, lines) {
  const b = I.baseline && I.baseline.values;
  if (!b) return '';
  const now = valuesOf(lines), moves = [];
  /* a machine's timing (G17) moves with the machine, not the game: never listed as a move */
  for (const [id, rows] of Object.entries(now)) if (!LINE[id].machine) for (const [at, v] of Object.entries(rows)) {
    const was = (b[id] || {})[at];
    if (Number.isFinite(was) && Math.abs(v - was) > Math.max(0.02 * Math.abs(was), 1e-9)) moves.push(id + ' ' + at + ' ' + was + ' -> ' + v);
  }
  return moves.length ? 'MOVED SINCE THE BASELINE (' + I.baseline.commit + '): ' + moves.slice(0, 12).join(', ') + (moves.length > 12 ? ' and ' + (moves.length - 12) + ' more' : '') : '';
}
const readBaseline = () => (existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null);

/* ── --selftest ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const clone = (I) => ({ ...I, rows: JSON.parse(JSON.stringify(I.rows)), ms: { ...I.ms },
  data: { ...I.data, refill: { ...I.data.refill }, bar: JSON.parse(JSON.stringify(I.data.bar)),
    costIn: JSON.parse(JSON.stringify(I.data.costIn)), stamina: { ...I.data.stamina } },
  life: I.life && { ...I.life, steps: I.life.steps.map((s) => [...s]) } });
const redSet = (lines) => new Set(lines.flatMap((l) => l.rows.filter((r) => r.status === 'RED').map((r) => l.id + ' ' + r.at)));
/** The first row of `id` (in the line's order) that is neither RED nor gated nor failed on the clean judge, matching `want`. */
const firstClean = (clean, id, want = () => true) => (clean.find((l) => l.id === id).rows.find((r) => !['RED', 'ERR', 'uncal'].includes(r.status) && want(r)) || null);
const pointOf = (at) => at.split(' ')[0].replace(/\*$/, '');
/* PRE-STEPS a plant may need so its line is judged at all. CALIBRATE: K1 reads the real Krell four exactly (the gate opens).
   NIGHTLY: the twin's and the Tower's rows planted in band (a plain measure has none), then calibrated (D1, D2 are gated). */
function calibrate(J) {
  const K = realKrellNow(), r = J.rows['krell-real'];
  J.rows['krell-real'] = { ...r, levelXpPerH: K.levelXpAHeroHour, killsPerH: K.killsAClockHour, incomePerH: K.netGoldAHeroHour, storePerH: 0 };
  return J;
}
/* UNCALIBRATE: K1 reads the harness at half the real four's Level XP and kills (the gate shuts), wherever it reads today. The K1 gate's negative
   control runs on it: with the real seats and the hunt restated on today's engine K1's Level XP sits at the gate's own edge (0.90), and a
   control that needed the measured K1 to be outside the gate went NOISY the day the harness came into band (51-baseline.md F16). */
function uncalibrate(J) {
  const K = realKrellNow(), r = J.rows['krell-real'];
  J.rows['krell-real'] = { ...r, levelXpPerH: K.levelXpAHeroHour * 0.5, killsPerH: K.killsAClockHour * 0.5 };
  return J;
}
function inBandNightly(J) {
  J.nightly = true;
  for (const p of GC.DEADLY_POINTS) {
    J.rows['twin-band:' + p.id] = { deaths: 3, heroHours: 128 };          // 2.3 a 100 hero-hours: inside D1's 1 to 3.34
    J.rows['twin-under:' + p.id] = { deaths: 10, heroHours: 128 };        // 7.8: past D2's 6.25
  }
  for (const p of GC.TOWER_FOURS) J.rows['tower-four:' + p.id] = { towerTop: p.level + 10 };
  for (const p of GC.TOWER_LONE) for (const s of ['hammer', 'mage']) J.rows['tower-lone:' + p.id + ':' + s] = { levelXpPerH: 0.8 * J.rows['ref:' + p.id + ':' + (s === 'hammer' ? 'lone' : 'mage')].levelXpPerH };
  /* G24's night grid, in band (0.9 of the right-Level ground) wherever the plain run did not play it */
  for (const [g, pid] of GC.scaledPlan(CTX, true)) for (const s of ['hammer', 'mage']) {
    const id = 'scaled:' + g + ':' + pid + ':' + s;
    if (!J.rows[id]) J.rows[id] = { levelXpPerH: 0.9 * J.rows['ref:' + pid + ':' + (s === 'hammer' ? 'lone' : 'mage')].levelXpPerH };
  }
  return calibrate(J);
}

async function selftest(workers) {
  const I = await measure({ workers, quiet: true });
  I.baseline = readBaseline();
  if (I.errors.length) { console.log('HARNESS: the clean measure failed: ' + I.errors.map((e) => e.id + ': ' + e.error).join('; ')); return 2; }
  const clean0 = judge(I);
  if (exitOf(clean0, false) !== 0) { console.log('HARNESS: the clean tree is red in plain mode (' + [...redSet(clean0)].join(', ') + '): fix that before proving the plants'); return 2; }
  /* the clean judge each pre-step plants on */
  const CLEAN = { none: clean0, cal: judge(calibrate(clone(I))), nightly: judge(inBandNightly(clone(I))), uncal: judge(uncalibrate(clone(I))) };
  const PRE = { none: (J) => J, cal: calibrate, nightly: inBandNightly, uncal: uncalibrate };
  /* the scan plants: a module's copy with one more row */
  const plantScan = async (file, edit) => SCAN.scanLevers(ROOT, async (f) => { const m = await SCAN.loadData(ROOT)(f); return f === file ? edit(m) : m; });
  const withItem = (row) => (m) => ({ ...m, ITEMS: { ...m.ITEMS, planted_meal: row } });
  const P = [];
  const plant = (name, pick, apply, extra = {}) => P.push({ name, pick, apply, pre: 'none', ...extra });
  const cal = { pre: 'cal' };
  plant('a cost over the allowance: one more statement on every settle', (c) => firstClean(c, 'G16', (r) => r.at === 'ownfour'), (J) => { for (const f of Object.values(J.data.costIn.fixtures)) f.statements_a_settle += 1; }, { also: (c) => c.find((l) => l.id === 'G16').rows.filter((r) => r.status !== 'RED').map((r) => 'G16 ' + r.at) });
  /* RE-AIMED (lane/econ-levers: under the store's derived prices a bill x4 stayed inside the keep): the bill set past the four's gold in */
  plant('Deadly loses gold: the Krell-kit four\'s store bill past its gold in', (c) => firstClean(c, 'G8'), (J, r) => { const x = J.rows['four-real:' + r.at]; x.storePerH = (1.25 * x.incomePerH) / (1 - GC.G8_OWN_SHARE); }, cal);
  /* G7 (re-aimed, C-11): a second scale ground one tier on with Muster's own band: its first depth pays under the last ground's top. With
     one ground the line has no pair to judge, so the plant opens the second; its pair's row is the one that must turn red. */
  {
    /* a ground one tier past the highest base item Level, cut like the last ground there (the judge's order: base item Level, then id) */
    const last = () => [...I.data.scale.grounds].sort((a, b) => a.gearLevel - b.gearLevel || (a.id < b.id ? -1 : 1)).slice(-1)[0];
    const planted = () => ({ ...last(), id: 'planted_ground', gearLevel: last().gearLevel + 20 });
    plant('the next scale ground pays less from its first depth than the last one\'s top (a ground one tier on, the last ground\'s band)',
      (c) => c.find((l) => l.id === 'G7').rows[0] || null,
      /* a copy all the way down: clone() shares I.data, and every later plant judges that */
      (J) => { J.data = { ...J.data, scale: { ...J.data.scale, grounds: [...J.data.scale.grounds, planted()] } }; },
      { expect: () => g7Pairs({ ...I.data.scale, grounds: [...I.data.scale.grounds, planted()] }).filter((p) => p.next.id === 'planted_ground').map((p) => 'G7 ' + p.prev.id + ' -> planted_ground') });
  }
  /* G1 (re-aimed, C-7): a lone hero out-earns the mixed four's head */
  plant('a lone hero runs away: 1.3x the four\'s head', (c) => firstClean(c, 'G1'), (J, r) => { const [g, style] = r.at.split(' '); J.rows['scale-lone:' + g + ':' + style].levelXpPerH = 1.3 * J.rows['scale-four:' + g].levelXpPerH; });
  plant('one way runs away alone: the bow x2 Level XP', (c) => firstClean(c, 'G2'), (J, r) => { J.rows['way:' + pointOf(r.at) + ':bow'].levelXpPerH *= 2; });
  plant('a gold-for-power offer far too cheap: a training item at 1 gold', (c) => firstClean(c, 'G12', (r) => /item 12 h/.test(r.at) && Number.isFinite(r.value)), (J) => { J.data.training = { ...J.data.training, gear: { ...J.data.training.gear, gold: { ...J.data.training.gear.gold, 12: 1 } } }; });
  /* a machine's timing: planted as three times the line's own budget, whatever this machine measured (a x3 on a fast machine stays inside it) */
  plant('a settle three times past its budget: a Krell window at 3 x 200 ms', (c) => firstClean(c, 'G17', (r) => r.at === 'krell'), (J) => { J.ms['time-krell:warm'] = 3 * LINE.G17.keep[1] * J.rows['time-krell:warm'].partyHours * 36; });
  plant('the Own four hunts 14 hours a day with no new press', (c) => firstClean(c, 'G18', (r) => r.at === 'ownfour'), (J) => { J.data.stamina.players = J.data.stamina.players.map((p) => (p.id === 'ownfour' ? { ...p, huntHoursADay: 14 } : p)); });
  plant('a slower first hour: Level 10 at 9 hours', (c) => firstClean(c, 'G6', (r) => r.at === 'Level 10'), (J) => { J.life.level10 = 9; }, { redMode: true });
  plant('the new player\'s worst Level at 3 hours', (c) => firstClean(c, 'G6', (r) => /longest/.test(r.at)), (J) => { J.life.steps[J.life.steps.length - 1][1] = 3; }, { redMode: true });
  plant('a new XP food row (a planted meal with all_xp)', (c) => firstClean(c, 'G14', (r) => r.at === 'food-xp-buffs'), async (J) => { J.scan = await plantScan('items.js', withItem({ n: 'Planted Meal', buff: { type: 'all_xp', magnitude: 2, durationMs: 1 } })); }, { redMode: true });
  plant('a lever with no class (a gold_find meal)', (c) => firstClean(c, 'G14', (r) => r.at === 'strangers'), async (J) => { J.scan = await plantScan('items.js', withItem({ n: 'Planted Purse Pie', buff: { type: 'gold_find', magnitude: 2, durationMs: 1 } })); }, { redMode: true });
  plant('a dial-less live event gains a dial (the world boss window with xpPm)', (c) => firstClean(c, 'G14', (r) => r.at === 'strangers'), async (J) => { J.scan = await plantScan('live-events.js', (m) => ({ ...m, LIVE_EVENT_TYPES: { ...m.LIVE_EVENT_TYPES, world_boss: { ...m.LIVE_EVENT_TYPES.world_boss, dial: 'xpPm' } } })); }, { redMode: true });
  plant('a lever-named field in a new place (a planted goldBonusPm)', (c) => firstClean(c, 'G14', (r) => r.at === 'strangers'), async (J) => { J.scan = await plantScan('party.js', (m) => ({ ...m, PLANTED: { goldBonusPm: 1200 } })); }, { redMode: true });
  /* the plan audit's lines */
  plant('the pair runs away on Deadly: x1.6 Level XP', (c) => firstClean(c, 'G19'), (J, r) => { const [p, k] = r.at.split(' '); J.rows['small:' + k + ':' + p].levelXpPerH *= 1.6; }, cal);
  plant('the Tower runs past the cap: a four tops out 60 floors over its Level', (c) => firstClean(c, 'G21', (r) => /^four/.test(r.at)), (J, r) => { const L = Number(r.at.split(' ')[1]); J.rows['tower-four:' + GC.TOWER_FOURS.find((p) => p.level === L).id].towerTop = L + 60; }, { pre: 'nightly' });
  plant('the Tower pays a lone hero more than hunting: x1.5', (c) => firstClean(c, 'G21', (r) => /^(hammer|mage)/.test(r.at)), (J, r) => { const [s, L] = r.at.split(' '); const p = GC.ALL_POINTS.find((q) => q.level === Number(L)); J.rows['tower-lone:' + p.id + ':' + s].levelXpPerH = 1.5 * J.rows['ref:' + p.id + ':' + (s === 'hammer' ? 'lone' : 'mage')].levelXpPerH; }, { pre: 'nightly' });
  plant('Deadly kills a four in band: 20 deaths in 128 hero-hours', (c) => firstClean(c, 'D1'), (J, r) => { J.rows['twin-band:' + r.at].deaths = 20; }, { pre: 'nightly' });
  plant('a four ten under the floor never dies', (c) => firstClean(c, 'D2'), (J, r) => { J.rows['twin-under:' + r.at.replace(/-10$/, '')].deaths = 0; }, { pre: 'nightly' });
  plant('refills twenty times their price: the second never pays', (c) => firstClean(c, 'G22', (r) => /2nd$/.test(r.at)), (J) => { J.data.refill.base *= 20; J.data.refill.perLevel *= 20; },
    { also: (c) => c.find((l) => l.id === 'G22').rows.filter((r) => (/2nd$/.test(r.at) && r.status !== 'RED') || (/^pyre all /.test(r.at) && !['RED', 'ERR', 'uncal'].includes(r.status))).map((r) => 'G22 ' + r.at) });   /* the six-refill row is the plant's own too, once K1's gold gate judges it */
  plant('a new offense row on the bow at a 4 s cooldown: the lane over its budget', (c) => firstClean(c, 'G23', (r) => r.at === 'ranged'), (J) => { J.data.bar.rows.push({ id: 'planted_shot', lane: 'offense', cdMs: 4000, disciplines: ['ranged'], replaces: null }); });
  plant('a scaled ground beats the right-Level one: x1.5 Level XP', (c) => firstClean(c, 'G24'), (J, r) => { const [gp, s] = r.at.split(' '); const [g, pid] = gp.split('@'); J.rows['scaled:' + g + ':' + pid + ':' + s].levelXpPerH *= 1.5; });
  plant('NEGATIVE CONTROL: the Glade\'s lone hammer +1% Level XP', () => ({ at: 'none' }), (J) => { J.rows['ref:glade:lone'].levelXpPerH *= 1.01; }, { control: true });
  plant('NEGATIVE CONTROL: a meal that only heals (no buff)', () => ({ at: 'none' }), async (J) => { J.scan = await plantScan('items.js', withItem({ n: 'Planted Bread', heals: 10 })); }, { control: true });
  plant('NEGATIVE CONTROL: a new bow row that replaces Precision Shot (shares its cooldown)', () => ({ at: 'none' }), (J) => { J.data.bar.rows.push({ id: 'planted_shot', lane: 'offense', cdMs: 4000, disciplines: ['ranged'], replaces: 'precision_shot' }); }, { control: true });
  /* (moved from G3 when it retired, lane/econ-followups: G19 is the line a gated plant reads now) */
  plant('NEGATIVE CONTROL (the K1 gate): the pair and the three x1.6 while K1 reads the harness at half the real four stay uncalibrated', () => ({ at: 'none' }),
    (J) => { for (const p of GC.SMALL_POINTS) for (const k of Object.keys(GC.SMALL_PARTIES)) J.rows['small:' + k + ':' + p.id].levelXpPerH *= 1.6; },
    { control: true, pre: 'uncal', check: (got) => got.find((l) => l.id === 'G19').status === 'uncalibrated' });

  let fails = 0, n = 0;
  console.log('BALANCE GUARD --selftest: ' + P.length + ' plants on one clean measure (' + I.cells + ' cells, ' + (I.wallMs / 1000).toFixed(0) + ' s); each must turn its OWN row red and no other'
    + ' (K1 reads the harness ' + (calibration(I).xp ? 'inside' : 'outside') + ' its band on XP, so a gated plant opens the gate first)');
  for (const p of P) {
    const clean = CLEAN[p.pre], cleanRed = redSet(clean);
    const target = p.pick(clean);
    if (!target) { console.log('  HARNESS ' + p.name + ': no clean row to plant on (every candidate is already red): pick another'); fails++; continue; }
    const J = PRE[p.pre](clone(I));
    J.scan = I.scan;
    await p.apply(J, target);
    const got = judge(J), now = redSet(got);
    const fresh = [...now].filter((k) => !cleanRed.has(k)).sort();
    /* `expect`: a plant that adds the row it turns red (G7's second ground) names that row itself */
    const lineId = p.control || p.expect ? null : clean.find((l) => l.rows.includes(target)).id;
    const expected = p.control ? [] : p.expect ? [...p.expect(clean)].sort() : [...new Set([lineId + ' ' + target.at, ...(p.also ? p.also(clean) : [])])].sort();
    const strictExit = exitOf(got, true), plainExit = exitOf(got, false);
    const ok = JSON.stringify(fresh) === JSON.stringify(expected) && (p.control ? plainExit === 0 && (!p.check || p.check(got)) : strictExit === 1 && plainExit === (p.redMode ? 1 : 0));
    n++;
    if (!ok) fails++;
    console.log('  ' + (p.control ? (ok ? 'SILENT ' : 'NOISY  ') : ok ? 'CAUGHT ' : 'MISSED ') + p.name + ': newly red ' + (fresh.join(', ') || 'nothing') + (ok ? '' : ' (expected ' + (expected.join(', ') || 'nothing') + ')') + '; --strict exits ' + strictExit + ', plain ' + plainExit);
  }
  /* ON THE REAL ENGINE: the hardest tier's Level XP dial x1.6 on G19's grounds (worker.mjs whatIf), the pair and the three re-played, K1's
     gate open. (Re-pointed from G3, which retired with the Deadly four's pace premium, lane/econ-followups 2026-11-22: G19 is the line that
     still reads a tier dial off a played party.) */
  {
    const tierOf = (g) => { const ts = tiers.tiersOf(g); return ts.includes('deadly') ? 'deadly' : ts.includes('dangerous') ? 'dangerous' : null; };
    const pts = GC.SMALL_POINTS.filter((p) => tierOf(p.ground));
    const jobs = GC.plainCells(CTX).filter((j) => /^small:/.test(j.id) && pts.some((p) => j.id.endsWith(':' + p.id)));
    const whatIf = { tiers: Object.fromEntries(pts.map((p) => { const t = tierOf(p.ground), r = tiers.tierRowOf(p.ground, t); return [p.ground, { [t]: { id: r.id, pull: [...r.pull], dmgPm: r.dmgPm, hpPm: r.hpPm, xpPm: Math.round(r.xpPm * 1.6) } }]; })) };
    const { results, errors } = await playAll(jobs.map((j) => ({ ...j, whatIf })), workers);
    const J = calibrate(clone(I)), cleanRed = redSet(CLEAN.cal);
    for (const [id, r] of Object.entries(results)) J.rows[id] = { ...J.rows[id], ...MEASURE.rowOf(r.result, r.result.cell.party) };
    const got = judge(J), fresh = [...redSet(got)].filter((k) => !cleanRed.has(k)).sort();
    const ratios = jobs.map((j) => J.rows[j.id].levelXpPerH / I.rows[j.id].levelXpPerH);
    const ok = !errors.length && jobs.length > 0 && fresh.length > 0 && fresh.every((k) => k.startsWith('G19 ')) && ratios.every((x) => x > 1.4 && x < 1.8) && exitOf(got, true) === 1 && exitOf(got, false) === 0;
    n++;
    if (!ok) fails++;
    console.log('  ' + (ok ? 'CAUGHT ' : 'MISSED ') + 'the hardest tier\'s Level XP dial x1.6 on the real engine (whatIf, ' + jobs.length + ' pair and three cells re-played): Level XP x' + ratios.map((x) => x.toFixed(2)).join('/') + ', newly red ' + (fresh.join(', ') || 'nothing') + (errors.length ? ' HARNESS ' + errors.map((e) => e.error).join('; ') : ''));
  }
  console.log(fails ? 'BALANCE GUARD --selftest: ' + fails + ' of ' + n + ' NOT caught' : 'BALANCE GUARD --selftest: all ' + n + ' caught, each on its own row, every control silent');
  return fails ? 1 : 0;
}

/* ── THE STANDARDS (50-standards 5.4), REPORT MODE ──────────────────────────────────────────────────────────────────────────────────
   Every band of tools/balance-program/standards.mjs judged on the progression grid's CACHED cells (progression-grid.json, else progression-grid-quick.json:
   tools/balance-program/progression-grid.mjs plays them nightly, 1,116 cells on the real engine). Nothing is played here, and no band changes the exit
   code: a band starts in report and turns red in the lane that lands the change it guards (5.4). A cache whose input hash differs from the
   tree's prints STALE. */
async function standardsBlock() {
  const GRID = await import(u('tools/balance-program/progression-grid.mjs'));
  const DER = await import(u('tools/balance-program/grid-derive.mjs'));
  const g = GRID.readGrid(false) || GRID.readGrid(true);
  if (!g) { console.log('STANDARDS (50-standards): no cached grid (node tools/balance-program/progression-grid.mjs): every band unread'); return; }
  const [D, K] = await Promise.all([GRID.loadGridData(ROOT), (await import(u('tools/balance-program/grid-kit.mjs'))).loadKits(ROOT)]);
  const j = DER.judgeGrid(D, g, { currentHash: GRID.inputHash(ROOT), K });
  const S = DER.bandSummary(j);
  const n = (st) => S.filter((s) => s.status === st).length;
  console.log('STANDARDS (50-standards 5.4, report mode) on the cached ' + g.run + ' grid ' + g.commit + ' (' + g.at + ', ' + Object.keys(g.cells).length + ' cells' + (j.stale ? ', STALE: the tree moved since' : '') + '): '
    + n('ok') + ' in band, ' + n('off') + ' off, ' + n('RED') + ' red, ' + (S.length - n('ok') - n('off') - n('RED')) + ' unread (thin, proxy or not the grid\'s) of ' + S.length);
  for (const s of S.filter((x) => x.status === 'RED' || x.status === 'off')) console.log('  ' + s.band.padEnd(17) + (s.status === 'RED' ? '!' : '~') + ' ' + s.red + ' red, ' + s.off + ' off of ' + s.n + '; worst ' + s.worst.at + ': ' + (s.worst.shown || s.worst.value));
}

/* ── the run ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
async function main() {
  const workers = Number(arg('workers', Math.min(4, availableParallelism())));
  if (!(workers >= 1)) { console.error('balance-guard: --workers wants a number'); return 2; }
  if (has('selftest')) return selftest(workers);
  const strict = has('strict'), nightly = has('nightly') || process.env.GITHUB_EVENT_NAME === 'schedule';
  if (has('write') && !arg('why')) { console.error('balance-guard: --write wants --why "<what moved and why>"'); return 2; }
  const I = await measure({ nightly, workers });
  I.baseline = readBaseline();
  if (has('write')) {
    const lines0 = judge({ ...I, baseline: null });
    const commit = (() => { try { return execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'unknown'; } })();
    const prev = I.baseline || { history: [] };
    const next = {
      _readme: ['The balance guard\'s baseline (tests/balance-guard.mjs, 30-plan section E). Re-written only by --write --why, by the lane that moved a number.',
        'pins.cutRows: rows a cut or dark lever carries (G14: a count over its pin is red). cost: a reference account\'s day (G16: 5% over is red). values: every line\'s numbers when written (the report prints what moved).'],
      schema: 'hearthrise.balance-guard/1', commit, at: new Date().toISOString().slice(0, 10), why: arg('why'),
      pins: { cutRows: I.scan.pinned }, cost: costOf(I.data.costIn), values: valuesOf(lines0),
      history: [...(prev.history || []), { at: new Date().toISOString().slice(0, 10), commit, why: arg('why') }].slice(-20),
    };
    writeFileSync(BASELINE, JSON.stringify(next, null, 1) + '\n');
    console.log('wrote ' + BASELINE);
    I.baseline = next;
  }
  const lines = judge(I);
  report(I, lines, strict);
  await standardsBlock();
  if (arg('json')) writeFileSync(resolve(arg('json')), JSON.stringify({ lines, rows: I.rows, ms: I.ms, life: I.life, errors: I.errors }, null, 1));
  return exitOf(lines, strict);
}

if (isMain(import.meta.url)) {
  main().then((code) => process.exit(code), (e) => { console.error(e); process.exit(2); });
}
