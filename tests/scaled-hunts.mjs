#!/usr/bin/env node
// tests/scaled-hunts.mjs — A SCALED HUNT IS A CHOICE, NEVER THE BEST GRIND (src/data/scaled-hunts.js; lane/b-scaled-hunts, Tyler 2026-11-07:
// "an option to 'scale' early game hunts up with gold", "party would scale to the leader", "+x% exp +x% more damage from monsters +x% more
// gold from monsters", "make it a per hour slider", "up to 24 hours").
//
// Played on the REAL settle (tools/balance-sim cells through tools/balance-sim/pool.mjs, at most 4 workers; a scaled ground is a what-if
// that writes scaledRow's rows on BOTH engine instances of monsters.js, the ?v= one src/core reads and the plain one, worker.mjs applyWhatIf).
// One seed, one hour a way, the same dice in every cell (paired): a lone hero is the median of hammer, bow and mage; a four is tank, healer,
// bow and mage. Every number is Level XP or net gold (coin + commons - the store bill) a hero an hour, Normal.
//
//   derived      pure: the scalable grounds and topLevel are READ from the ground data, never typed in scaled-hunts.js. A test-only
//                ground opened above the top is picked up (it becomes the top, the Warrens becomes scalable), and the module's
//                source restates no band (the ground-pack lane must open a ground without a row there; CONFLICTS.md 2026-11-07)
//   rules        pure: when a ground scales (past its band's top, never past topLevel, the Warrens never), SCALABLE_GROUNDS agrees with
//                hunts.js and hunt-grounds.js, scaledRow is the formula at the scaled Level with the dials, its drops are the row's,
//                scaledMonsters is the roster's rows, the tier rows are the sheet's at the scaled floor (no Deadly), the slider's words are the rows'
//                ratios, the price is whole and climbs, the buy's catalogue refuses a bad number of hours
//   fee-guard    three grounds x three Level gaps: Level XP under the right-Level ground's (the open ground whose band holds the Level,
//                highest floor first), gold after the fee under the best free ground's (every open ground at or under the Level), Level
//                XP at least 1.25x the ground unscaled (worth buying); alone, the fee a real sink (15-60% of the scaled gold) that
//                never turns the hour into a loss
//   no-deaths    nobody dies on Normal at the leader's Level: every four, and every lone way on a solo ground
//   coin-scales  coin a kill scales (2x or more), drops a kill don't (commons' value a kill within 0.75-1.33x of the ground unscaled)
//
// --mutate: each check against a planted wrong module (the engine ones replay only the scaled cells) must go red.
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const REAL = await import(u('src/data/scaled-hunts.js'));
const B = await import(u('src/data/balance-sheet.js'));
const { MONSTERS } = await import(u('src/data/monsters.js'));
const G = await import(u('src/data/hunt-grounds.js'));
const { HUNT_INDEX } = await import(u('src/data/hunts.js'));
const { runPool } = await import(u('tools/balance-sim/pool.mjs'));
const { metricsOf } = await import(u('tools/balance-sim/grade.mjs'));

const SOLO = [['hammer'], ['bow'], ['mage']], FOUR = [['tank', 'healer', 'bow', 'mage']];
/* three grounds (the first room, the first solo ground with its danger held at half, the strongest scaled XP), three gaps each */
const CASES = [
  ['mill_cellar', 20, 1], ['mill_cellar', 32, 4], ['mill_cellar', 50, 1],
  ['meadowbrook_thicket', 20, 1], ['meadowbrook_thicket', 41, 1], ['meadowbrook_thicket', 50, 4],
  ['mosslight_glade', 32, 1], ['mosslight_glade', 41, 4], ['mosslight_glade', 50, 4],
];
const COIN_CASE = ['meadowbrook_thicket', 41, 1];
const BAR = Object.freeze({ xpUnderRight: 1, xpOverOwn: 1.25, feeShare: [0.15, 0.6], coinPerKill: 2, commonsPerKill: [0.75, 1.33] });

const band = (gid) => HUNT_INDEX[G.OPEN_GROUNDS[gid].hunt].band;
const fitOf = (gid) => (G.HUNT_GROUNDS[gid].pockets.some((p) => p.forParty) ? 'party' : G.HUNT_GROUNDS[gid].groupFit || 'both');
const compsOf = (size) => (size === 4 ? FOUR : SOLO);
const rightOf = (L) => Object.keys(G.OPEN_GROUNDS).filter((g) => band(g)[0] <= L && L <= band(g)[1]).sort((a, b) => band(b)[0] - band(a)[0])[0];
const freeOf = (L) => Object.keys(G.OPEN_GROUNDS).filter((g) => band(g)[0] <= L);

/* ── THE ENGINE: jobs on the pool, read back by id ── */
const idOf = (kind, gid, L, party, tag) => [kind, gid, L, party.join('+'), tag || ''].join(',');
const whatIfOf = (S, gid, L) => {
  const rows = {};
  for (const id of Object.keys(B.GROUND_ROSTER[gid])) {
    const r = S.scaledRow(MONSTERS[id], id, gid, L);
    if (r === MONSTERS[id]) throw new Error('scaled-hunts: ' + gid + ' did not scale ' + id + ' for a Level ' + L + ' leader');
    rows[id] = Object.fromEntries(['level', 'hp', 'atk', 'baseAcc', 'def', 'xp', 'gp', 'drops'].map((k) => [k, r[k]]));
  }
  return { monsters: rows };
};
const job = (kind, gid, L, party, extra = {}, tag = '') => ({ id: idOf(kind, gid, L, party, tag), ground: gid, party, level: L, hours: 1, seeds: 1, windowMs: 120000, ...extra });
async function play(jobs) {
  const dir = mkdtempSync(join(tmpdir(), 'scaled-hunts-'));
  try {
    const file = join(dir, 'cells.jsonl');
    const res = await runPool(jobs, file, { root: ROOT, workers: 4, cpuMax: 100, log: () => {} });
    if (res.failed) throw new Error('scaled-hunts: ' + res.failed + ' cell(s) failed on the engine: ' + readFileSync(join(dir, 'cells.errors.jsonl'), 'utf8').slice(0, 400));
    return new Map(readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { const c = JSON.parse(l); return [c.id, c]; }));
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
const med = (xs) => { const s = xs.slice().sort((a, b) => a - b); const n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
/* one ground at one Level for one size: the median way's Level XP and net gold a head, deaths, and coin and commons a kill */
function readOf(cells, kind, gid, L, size, tag) {
  const cs = compsOf(size).map((p) => cells.get(idOf(kind, gid, L, p, tag)));
  if (cs.some((c) => !c)) throw new Error('scaled-hunts: a cell was not played: ' + kind + ' ' + gid + ' L' + L + ' x' + size + ' ' + (tag || ''));
  const ms = cs.map(metricsOf);
  const perKill = (f) => med(cs.map((c) => { const k = c.party.killsPerH || 1; return c.heroes.reduce((s, h) => s + f(h), 0) / k; }));
  return { xp: med(ms.map((m) => m.xp)), net: med(ms.map((m) => m.net)), deaths: ms.reduce((s, m) => s + m.deaths, 0),
    coinPerKill: perKill((h) => h.coinPerH), commonsPerKill: perKill((h) => h.incomePerH - h.coinPerH) };
}

/* the free grounds every case compares against (they don't depend on the module: played once, mutants reuse them) */
function freeJobs() {
  const seen = new Set(), jobs = [];
  for (const [, L, size] of CASES) for (const gid of freeOf(L)) for (const p of compsOf(size)) {
    const j = job('free', gid, L, p);
    if (!seen.has(j.id)) { seen.add(j.id); jobs.push(j); }
  }
  return jobs;
}
const scaledJobs = (S, tag) => CASES.flatMap(([gid, L, size]) => compsOf(size).map((p) => job('scaled', gid, L, p, { whatIf: whatIfOf(S, gid, L) }, tag)));

/* ── THE CHECKS ── each answers a list of what is wrong (empty = green) and pushes its numbers into `rows` */
function feeGuard(S, cells, tag, rows = []) {
  const bad = [];
  for (const [gid, L, size] of CASES) {
    const s = readOf(cells, 'scaled', gid, L, size, tag), own = readOf(cells, 'free', gid, L, size), right = readOf(cells, 'free', rightOf(L), L, size);
    const best = freeOf(L).map((g) => [g, readOf(cells, 'free', g, L, size).net]).sort((a, b) => b[1] - a[1])[0];
    const price = S.pricePerHour(gid, L), fee = price / size, after = s.net - fee;
    const k = gid + ' L' + L + ' x' + size;
    rows.push({ k, s, own, right: [rightOf(L), right], best, price, after });
    if (!Number.isInteger(price) || price <= 0) { bad.push(k + ': no price (' + price + ')'); continue; }
    if (!(s.xp < BAR.xpUnderRight * right.xp)) bad.push(k + ': Level XP ' + Math.round(s.xp) + ', not under the right-Level ground (' + rightOf(L) + ') ' + Math.round(right.xp));
    if (!(after < best[1])) bad.push(k + ': gold after the fee ' + Math.round(after) + ', not under the best free ground (' + best[0] + ') ' + Math.round(best[1]));
    if (!(s.xp >= BAR.xpOverOwn * own.xp)) bad.push(k + ': Level XP ' + Math.round(s.xp) + ', under ' + BAR.xpOverOwn + 'x the ground unscaled ' + Math.round(own.xp) + ' (not worth buying)');
    if (size === 1) {
      if (!(after > 0)) bad.push(k + ': the fee ' + price + ' turns the lone leader\'s hour into a loss (' + Math.round(after) + ')');
      const share = price / Math.max(1, s.net);
      if (share < BAR.feeShare[0] || share > BAR.feeShare[1]) bad.push(k + ': the fee is ' + Math.round(share * 100) + '% of the lone leader\'s scaled gold (bar ' + BAR.feeShare.map((x) => x * 100).join('-') + '%)');
    }
  }
  return bad;
}
function noDeaths(S, cells, tag) {
  const bad = [];
  for (const [gid, L, size] of CASES) {
    if (size === 1 && fitOf(gid) === 'party') continue;
    const s = readOf(cells, 'scaled', gid, L, size, tag);
    if (s.deaths) bad.push(gid + ' L' + L + ' x' + size + ': ' + s.deaths + ' death(s) on Normal at the leader\'s Level');
  }
  return bad;
}
function coinScales(S, cells, tag) {
  const [gid, L, size] = COIN_CASE, s = readOf(cells, 'scaled', gid, L, size, tag), own = readOf(cells, 'free', gid, L, size);
  const coin = s.coinPerKill / own.coinPerKill, commons = s.commonsPerKill / Math.max(1e-9, own.commonsPerKill), bad = [];
  if (!(coin >= BAR.coinPerKill)) bad.push(gid + ' L' + L + ': coin a kill ' + coin.toFixed(2) + 'x the ground unscaled (bar ' + BAR.coinPerKill + 'x)');
  if (!(commons >= BAR.commonsPerKill[0] && commons <= BAR.commonsPerKill[1])) bad.push(gid + ' L' + L + ': commons a kill ' + commons.toFixed(2) + 'x the ground unscaled (drops must not scale)');
  return bad;
}
/* THE GROUND DATA IS THE LIST: the module's table is scaleLadderOf on the open grounds, a ground opened above the top is picked up,
   and no band, floor or top Level is typed in the module's source. `S.__src`: a mutant's source text. */
const SRC = readFileSync(join(ROOT, 'src/data/scaled-hunts.js'), 'utf8');
function derived(S) {
  const bad = [];
  const now = S.scaleLadderOf(G.OPEN_GROUNDS, HUNT_INDEX);
  if (JSON.stringify(now.grounds) !== JSON.stringify(S.SCALABLE_GROUNDS) || now.topLevel !== S.SCALED_HUNTS.topLevel) {
    bad.push('the module\'s table is not the ground data\'s: ' + JSON.stringify(Object.keys(S.SCALABLE_GROUNDS)) + ' top ' + S.SCALED_HUNTS.topLevel + ', the data ' + JSON.stringify(Object.keys(now.grounds)) + ' top ' + now.topLevel);
  }
  /* a test-only party ground opened above the Warrens, its band 50-65, with a roster */
  const warrens = G.OPEN_GROUNDS.coppercap_warrens, extra = { ...warrens, id: 'test_slake', hunt: 'test_slake' };
  const opened = S.scaleLadderOf({ ...G.OPEN_GROUNDS, test_slake: extra }, { ...HUNT_INDEX, test_slake: { ...HUNT_INDEX[warrens.hunt], band: [50, 65] } },
    { ...B.GROUND_ROSTER, test_slake: B.GROUND_ROSTER.coppercap_warrens });
  const w = opened.grounds.coppercap_warrens;
  if (opened.topLevel !== 65) bad.push('a ground opened at 50-65 leaves the top Level at ' + opened.topLevel);
  if (!w || w.floor !== 32 || w.top !== 50 || w.fit !== 'party') bad.push('a ground opened above the Warrens leaves the Warrens unscalable (' + JSON.stringify(w) + ')');
  if (opened.grounds.test_slake) bad.push('the new top ground scales');
  for (const id of Object.keys(now.grounds)) if (JSON.stringify(opened.grounds[id]) !== JSON.stringify(now.grounds[id])) bad.push(id + ' moved when a ground opened above the top');
  /* the source: no band typed (a restated table reads `floor: 1`, `top: 8`, `topLevel: 50`) */
  const typed = (S.__src || SRC).match(/\b(?:floor|top|topLevel)\s*:\s*\d+/g);
  if (typed) bad.push('scaled-hunts.js types a band again: ' + typed.slice(0, 3).join(', '));
  for (const id of Object.keys(S.SCALE_EXCEPTIONS || {})) if (!S.SCALABLE_GROUNDS[id]) bad.push('the exception ' + id + ' names a ground that does not scale');
  return bad;
}

function rules(S) {
  const bad = [], H = S.SCALED_HUNTS;
  /* the restated ground facts are hunts.js's and hunt-grounds.js's; the scalable set is every open ground under the top one */
  const top = Object.keys(G.OPEN_GROUNDS).sort((a, b) => band(b)[1] - band(a)[1])[0];
  if (H.topLevel !== band(top)[1]) bad.push('topLevel ' + H.topLevel + ', the top open ground\'s band ends at ' + band(top)[1]);
  for (const gid of Object.keys(G.OPEN_GROUNDS)) {
    const g = S.SCALABLE_GROUNDS[gid];
    if (gid === top) { if (g) bad.push(gid + ' is the top ground and scales'); continue; }
    if (!g) { bad.push(gid + ' cannot be scaled'); continue; }
    if (g.floor !== band(gid)[0] || g.top !== band(gid)[1]) bad.push(gid + ': band restated ' + g.floor + '-' + g.top + ', hunts.js ' + band(gid).join('-'));
    if (g.fit !== fitOf(gid)) bad.push(gid + ': fit restated ' + g.fit + ', hunt-grounds.js ' + fitOf(gid));
    if (g.danger !== undefined && !(g.danger > 0 && g.danger < 1 && g.why)) bad.push(gid + ': a danger hold needs a share under 1 and a why');
    /* when: past the band's top only, held at topLevel */
    if (S.scaleLevelFor(gid, g.top) !== null) bad.push(gid + ' scales for a leader it still fits (Level ' + g.top + ')');
    if (S.scaleLevelFor(gid, g.top + 1) !== g.top + 1) bad.push(gid + ' does not scale for a Level ' + (g.top + 1) + ' leader');
    if (S.scaleLevelFor(gid, H.topLevel + 30) !== H.topLevel) bad.push(gid + ' scales past Level ' + H.topLevel);
    for (const L of [g.top + 1, 41, H.topLevel + 10]) {
      const to = S.scaleLevelFor(gid, L);
      if (to === null) continue;
      /* the rows: the formula at Level + gap on the scaled floor, the ground's own danger hold, Level XP and coin dialed, drops the row's */
      const F = g.danger ? { ...B.STAT_FORMULA, ramp: { from: B.STAT_FORMULA.ramp.from, to: B.STAT_FORMULA.ramp.from + Math.max(1, to - B.STAT_FORMULA.ramp.from) / g.danger } } : B.STAT_FORMULA;
      if (Math.abs(B.rampAt(to, F) - (g.danger || B.rampAt(to))) > 1e-9) bad.push(gid + ' L' + L + ': danger ' + B.rampAt(to, F) + ', not its hold');
      const table = S.scaledMonsters(MONSTERS, gid, L);
      for (const [id, role] of Object.entries(B.GROUND_ROSTER[gid])) {
        const m = MONSTERS[id], r = S.scaledRow(m, id, gid, L), gap = to - g.floor;
        const f = B.formulaStats({ level: m.level + gap, role, tier: m.tier, floor: to, fit: g.fit, ground: gid }, { formula: F });
        const mean = ((f.gp[0] + f.gp[1]) / 2) * (H.coinPm[g.fit] / 1000), got = (r.gp[0] + r.gp[1]) / 2;
        const k = gid + ' L' + L + ' ' + id;
        if (r.level !== m.level + gap) bad.push(k + ': Level ' + r.level + ', want ' + (m.level + gap));
        for (const f2 of ['hp', 'atk', 'baseAcc', 'def']) if (r[f2] !== f[f2]) bad.push(k + ': ' + f2 + ' ' + r[f2] + ', the formula ' + f[f2]);
        if (r.xp !== Math.max(1, Math.round((f.xp * H.xpPm) / 1000))) bad.push(k + ': xp ' + r.xp + ', the formula x ' + H.xpPm + ' permille');
        if (Math.abs(got - mean) > 1) bad.push(k + ': coin mean ' + got + ', the formula x ' + H.coinPm[g.fit] + ' permille ' + mean.toFixed(1));
        if (r.drops !== m.drops) bad.push(k + ': its drops are not the row\'s');
        if (!table[id] || JSON.stringify(table[id]) !== JSON.stringify(r)) bad.push(k + ': scaledMonsters is not scaledRow');
      }
      /* the tiers stack: the sheet's row for a ground of the scaled floor, its own pulls and named dials; Deadly never, nor a tier the ground lacks */
      const normalOnly = !!(B.TIER_PULL_OVERRIDES[gid] && B.TIER_PULL_OVERRIDES[gid].normalOnly);
      for (const t of ['normal', 'dangerous', 'deadly']) {
        const want = t === 'deadly' || (normalOnly && t !== 'normal') ? null : B.tierRowFor(to, t, { ground: gid, fit: g.fit, formula: F });
        if (JSON.stringify(S.scaledTierRow(gid, t, L)) !== JSON.stringify(want)) bad.push(gid + ' L' + L + ' ' + t + ': tier row ' + JSON.stringify(S.scaledTierRow(gid, t, L)) + ', the sheet at the scaled floor ' + JSON.stringify(want));
      }
      /* the slider's words are the reference regular's ratios, and point the right way */
      const w = S.scaleFor(gid, L);
      if (!w || w.band[0] !== to || w.band[1] !== to + g.top - g.floor) bad.push(gid + ' L' + L + ': the slider reads band ' + JSON.stringify(w && w.band));
      else for (const k2 of ['dmgPm', 'hpPm', 'xpPm', 'coinPm']) if (!(Number.isInteger(w[k2]) && w[k2] > 1000)) bad.push(gid + ' L' + L + ': the slider\'s ' + k2 + ' ' + w[k2] + ' is not a rise');
    }
    /* the price: whole gold, climbing with the Level, the buy refuses anything but whole hours 1 to 24 */
    let was = 0;
    for (let L = g.top + 1; L <= H.topLevel + 5; L++) {
      const p = S.pricePerHour(gid, L);
      if (!Number.isInteger(p) || p <= 0 || p < was) { bad.push(gid + ' L' + L + ': price ' + p + ' an hour after ' + was); break; }
      was = p;
    }
    if (S.pricePerHour(gid, g.top) !== null) bad.push(gid + ': a price for a leader it still fits');
    for (const h of [0, 25, 1.5, -1, '3']) if (S.priceFor(gid, 41, h) !== null) bad.push(gid + ': the buy prices ' + JSON.stringify(h) + ' hours');
    if (S.priceFor(gid, 41, H.maxHours) !== S.pricePerHour(gid, 41) * H.maxHours) bad.push(gid + ': 24 hours do not cost 24 x the hour');
  }
  for (const [k, v] of [['minHours', 1], ['maxHours', 24], ['bankMaxHours', 24]]) if (H[k] !== v) bad.push(k + ' ' + H[k] + ', ruled ' + v + ' (Tyler 11-07 "up to 24 hours")');
  if (!(Number.isInteger(H.buyMaxHoursPerDay) && H.buyMaxHoursPerDay >= H.bankMaxHours)) bad.push('the per-day clamp ' + H.buyMaxHoursPerDay + ' is under one bank');
  if (!(H.xpPm > 0 && H.xpPm < 1000)) bad.push('xpPm ' + H.xpPm + ': a scaled kill pays the formula\'s Level XP or more');
  return bad;
}

/* ── THE MUTANTS: a planted copy of the module with one rule broken ── */
const plant = (patch) => ({ ...REAL, ...patch });
/* a mutant row (and the table built from it, so only the planted fault differs from the module) */
const rowPatch = (fn) => {
  const scaledRow = (row, id, g, L) => { const r = REAL.scaledRow(row, id, g, L); return r === row ? r : fn(r, row, g); };
  return plant({ scaledRow, scaledMonsters: (M, g, L) => Object.fromEntries(Object.keys(REAL.scaledMonsters(M, g, L)).map((id) => [id, scaledRow(M[id], id, g, L)])) });
};
const OLD_TABLE = Object.freeze({ topLevel: 50, grounds: REAL.SCALABLE_GROUNDS });
const MUTANTS = [
  ['derived', 'the list typed back in (the derivation ignores a new ground)', () => plant({ scaleLadderOf: () => OLD_TABLE })],
  ['derived', 'the top Level typed back in the source', () => plant({ __src: SRC.replace('topLevel: LADDER.topLevel,', 'topLevel: 50,') })],
  ['derived', 'a band restated in the source', () => plant({ __src: SRC + '\nconst THICKET = { floor: 5, top: 15 };\n' })],
  ['rules', 'the Warrens scale', () => plant({ SCALABLE_GROUNDS: { ...REAL.SCALABLE_GROUNDS, coppercap_warrens: { floor: 32, top: 50, fit: 'party' } } })],
  ['rules', 'a ground scales for a leader it still fits', () => plant({ scaleLevelFor: (g, L) => (REAL.SCALABLE_GROUNDS[g] ? Math.min(Math.max(1, Math.floor(L)), 50) : null) })],
  ['rules', 'no cap at topLevel', () => plant({ scaleLevelFor: (g, L) => { const r = REAL.scaleLevelFor(g, L); return r === null ? null : Math.floor(L); } })],
  ['rules', 'the monsters keep their own Level', () => rowPatch((r, row) => ({ ...r, level: row.level }))],
  ['rules', 'the Thicket\'s danger hold dropped', () => rowPatch((r, row, g) => (g !== 'meadowbrook_thicket' ? r : { ...r, atk: r.atk + 3 }))],
  ['rules', 'drops scale with the rows', () => rowPatch((r) => ({ ...r, drops: r.drops.map((d) => ({ ...d })) }))],
  ['rules', 'a tier read at the ground\'s own floor', () => plant({ scaledTierRow: (g, t, L) => (REAL.scaledTierRow(g, t, L) === null ? null : B.tierRowFor(REAL.SCALABLE_GROUNDS[g].floor, t, { ground: g, fit: REAL.SCALABLE_GROUNDS[g].fit })) })],
  ['rules', 'Deadly offered on a scaled ground', () => plant({ scaledTierRow: (g, t, L) => (REAL.scaleLevelFor(g, L) === null ? null : t === 'deadly' && !(B.TIER_PULL_OVERRIDES[g] || {}).normalOnly ? B.tierRowFor(REAL.scaleLevelFor(g, L), t, { ground: g, fit: REAL.SCALABLE_GROUNDS[g].fit }) : REAL.scaledTierRow(g, t, L)) })],
  ['rules', 'the buy prices 25 hours', () => plant({ priceFor: (g, L, h) => { const p = REAL.pricePerHour(g, L); return p === null || !Number.isInteger(h) || h < 1 || h > 25 ? null : p * h; } })],
  ['rules', 'a band restated wrong', () => plant({ SCALABLE_GROUNDS: { ...REAL.SCALABLE_GROUNDS, wickstead: { ...REAL.SCALABLE_GROUNDS.wickstead, top: 20 } } })],
  ['fee-guard', 'the fee 10x', () => plant({ pricePerHour: (g, L) => { const p = REAL.pricePerHour(g, L); return p === null ? null : p * 10; } })],
  ['fee-guard', 'the fee a token 1 gold', () => plant({ pricePerHour: (g, L) => (REAL.pricePerHour(g, L) === null ? null : 1) })],
  ['fee-guard', 'Level XP x1.5 a kill', () => rowPatch((r) => ({ ...r, xp: Math.round(r.xp * 1.5) })), 'engine'],
  ['fee-guard', 'coin x2 a kill', () => rowPatch((r) => ({ ...r, gp: r.gp.map((x) => x * 2) })), 'engine'],
  ['no-deaths', 'blows x2.5 (atk)', () => rowPatch((r) => ({ ...r, atk: Math.round(r.atk * 2.5) })), 'engine'],
  ['coin-scales', 'drops x3 a kill', () => rowPatch((r) => ({ ...r, drops: r.drops.map((d) => ({ ...d, ch: Math.min(1, d.ch * 3) })) })), 'engine'],
  ['coin-scales', 'coin left at the ground\'s own', () => rowPatch((r, row) => ({ ...r, gp: row.gp.slice() })), 'engine'],
];

const mutate = process.argv.includes('--mutate');
let red = 0;
const say = (name, bad) => { if (bad.length) { red++; console.error('  RED  ' + name + '\n        ' + bad.slice(0, 6).join('\n        ')); } else console.log('  ok   ' + name); };
say('derived', derived(REAL));
say('rules', rules(REAL));
const t0 = Date.now();
const cells = await play([...freeJobs(), ...scaledJobs(REAL, '')]);
const rows = [];
say('fee-guard', feeGuard(REAL, cells, '', rows));
for (const r of rows) {
  console.log('       ' + r.k.padEnd(28) + ' XP ' + Math.round(r.s.xp / 1000) + 'k (right ' + r.right[0].replace(/_.*/, '') + ' ' + Math.round(r.right[1].xp / 1000) + 'k = '
    + (r.s.xp / r.right[1].xp).toFixed(2) + 'x, own ' + Math.round(r.own.xp / 1000) + 'k = ' + (r.s.xp / r.own.xp).toFixed(2) + 'x)  gold ' + Math.round(r.s.net) + ' - fee ' + r.price
    + (r.k.endsWith('x4') ? '/4' : '') + ' = ' + Math.round(r.after) + ' (best free ' + r.best[0].replace(/_.*/, '') + ' ' + Math.round(r.best[1]) + ', own ' + Math.round(r.own.net) + ')  deaths ' + r.s.deaths);
}
say('no-deaths', noDeaths(REAL, cells, ''));
say('coin-scales', coinScales(REAL, cells, ''));
{ const [gid, L, size] = COIN_CASE, s = readOf(cells, 'scaled', gid, L, size, ''), o = readOf(cells, 'free', gid, L, size, '');
  console.log('       ' + gid + ' L' + L + ': coin a kill ' + s.coinPerKill.toFixed(1) + ' vs ' + o.coinPerKill.toFixed(1) + ', commons a kill ' + s.commonsPerKill.toFixed(2) + ' vs ' + o.commonsPerKill.toFixed(2)); }
console.log('  (' + cells.size + ' cells on the engine, ' + Math.round((Date.now() - t0) / 1000) + ' s)');
if (mutate) {
  const CHECK = { derived: (S) => derived(S), rules: (S) => rules(S), 'fee-guard': (S, c, t) => feeGuard(S, c, t), 'no-deaths': (S, c, t) => noDeaths(S, c, t), 'coin-scales': (S, c, t) => coinScales(S, c, t) };
  const made = MUTANTS.map(([name, what, make, engine], i) => ({ name, what, S: make(), tag: engine ? 'm' + i : '' }));
  /* the engine mutants' scaled cells, all on one pool run (the free cells are the module's own, reused) */
  const extra = await play(made.filter((m) => m.tag).flatMap((m) => (m.name === 'coin-scales' ? [COIN_CASE] : CASES).flatMap(([gid, L, size]) => compsOf(size).map((p) => job('scaled', gid, L, p, { whatIf: whatIfOf(m.S, gid, L) }, m.tag)))));
  const all = new Map([...cells, ...extra]);
  for (const m of made) {
    let bad;
    try { bad = CHECK[m.name](m.S, all, m.tag); } catch (e) { bad = ['threw: ' + e.message]; }
    if (!bad.length) { red++; console.error('  MUTANT SURVIVED  ' + m.name + ': ' + m.what); } else console.log('  caught  ' + m.name + ': ' + m.what + '  (' + bad[0].slice(0, 110) + ')');
  }
}
if (red) { console.error('scaled-hunts: RED (' + red + ')'); process.exit(1); }
console.log('scaled-hunts: green' + (mutate ? ' (' + MUTANTS.length + ' mutants caught)' : ''));
