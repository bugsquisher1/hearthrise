#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/readers.mjs — THE BALANCE LAB'S READERS (Balance Lab phase 2, "Readers"; docs/design/redesign/07-balance-lab.md
// section 3.4 and the roadmap row "2. Readers": "Every target has a reader or a reason").
//
//   node tools/balance-program/readers.mjs --list        every reader: the targets it reads, what it reads, where it reads it
//   node tools/balance-program/readers.mjs --check       exit 1 unless every target of targets.json names a reader that resolves, or is MISSING
//                                                         with its gap and `until` (what must exist first); and every reader here reads a target
//   node tools/balance-program/readers.mjs --play [--blocks ways,four,...] [--seeds N] [--hours H] [--patch <patch.json>] [--out <file>]
//                                                         the subset plan played on the tree, or on a scratch copy with a balance patch planted
//                                                         (hearthrise.balance-patch/1), kept as a results file (hearthrise.lab-results/1)
//   node tools/balance-program/readers.mjs --report <results.json> [--pin <findings.json>] [--write-pin <file>] [--json]
//                                                         every reader on the played cells, each number with its interval, the findings with
//                                                         stable ids (new, gone and unchanged against a pin), and the assumptions block
//   node tools/balance-program/readers.mjs --headroom    the number headroom reader on the game's own growth families
//   node tools/balance-program/readers.mjs --selftest    every reader, the headroom reader and the findings diff on planted cells
//
// A READER reads played cells (the matrix's subset plan, tools/balance-sim/cell.mjs answers kept by matrix-metrics.mjs slimSeed), the
// cached progression grid, or the game's own formulas in closed form. It answers rows { at, value, lo, hi, n, status, shown }: status
// 'ok', 'off' (the target's band or rule is broken, beyond noise where the reading has an interval), 'thin' (too little sample to say) or
// 'n/a' (a reading, the target does not judge this cell). An 'off' row is a FINDING (lab-report.mjs: a stable id from the reader and the
// row's scope). Readers judge the targets of targets.json, never today's game: no reader compares a cell with the pinned baseline.
//
// Exit: 0 read / clean · 1 a --check failure, a --selftest proof failed, or a --report with a finding the pin does not hold · 2 a bad argument.
// mutant-anchors: none — --selftest plants in-memory cells, families and pins; no tracked file is patched
// ci-step: economy-selftests | Balance Lab readers - every target has a reader or a reason, each reader judges its planted cells, the headroom reader fails a 5% step near 750, findings diff new/gone/unchanged
// ci-run: node tools/mutant-gate.mjs node tools/balance-program/readers.mjs --selftest
// ci-run: node tools/balance-program/readers.mjs --check
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { isMain } from '../../tests/_is-main.mjs';
import * as STD from './standards.mjs';
import { finding, diffFindings, pinOf, readPin, assumptionsOf, checkAssumptions, printAssumptions, interval, rate } from './lab-report.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
export const RESULTS_SCHEMA = 'hearthrise.lab-results/1';
const TARGETS_FILE = join(HERE, 'targets.json');
/* a reading under this many hero-hours says 'thin' where its rule needs an absence (no death, no dip) to mean something */
export const THIN_HERO_H = 8;
/* the Lab's Level horizon for formulas (07-balance-lab.md 3.3 "Unlimited Levels": a closed-form probe at Levels 10 to 100,000) */
export const HORIZON_LEVEL = 100000;

const sum = (xs) => xs.reduce((a, b) => a + b, 0);
const heroesOf = (c) => c.seeds.flatMap((s) => s.heroes);
const hoursOf = (hs) => sum(hs.map((h) => h.hours || 0));
const healOf = (s) => s.healIn.food + s.healIn.self + s.healIn.ally + s.healIn.regen;
const takenOf = (s) => s.takenBy.swing + s.takenBy.spell + s.takenBy.status;
const hasSus = (c) => c.seeds.length && c.seeds.every((s) => s.heroes.every((h) => h.sustain));
/* the death line a tier and gear state is held at: S2.<gear> on Normal, S6.<tier>.<gear> above it (standards.mjs) */
const deathLine = (tier, gear) => { const b = STD.bandById(tier === 'normal' ? 'S2.' + gear : 'S6.' + tier + '.' + gear); return b && Number.isFinite(b.hi) ? b.hi : null; };
const row = (at, r, status, shown = null, extra = {}) => ({ at, value: r.value, lo: r.lo, hi: r.hi, n: r.n, status, ...(shown ? { shown } : {}), ...extra });
const point = (value, n = 1) => ({ value: Number.isFinite(value) ? Number(value.toPrecision(4)) : null, lo: null, hi: null, n });
/* the end reasons SUST-3 counts: gold, supplies (src/data/hunt-sessions.js END_ORDER: heals, ammo, runes) and the no-fight rule */
export const EARLY_ENDS = Object.freeze({ gold: ['gold_out'], supplies: ['heals_out', 'ammo_out', 'runes_out'], 'no-fight': ['no_fight'] });

/* ── THE READERS ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────
   { id, targets, on ('cells' | 'grid' | 'formulas'), reads, label ('MEASURED' | 'PROXY' | 'COMPUTED'), read(cells, ctx) -> rows } */
export const READERS = Object.freeze([
  {
    id: 'RD-SUSTAIN', targets: ['SUST-1'], on: 'cells', label: 'MEASURED',
    reads: 'the engine\'s sustain counters: healing received (food, spells, leech, regeneration) over damage taken, each seed; deaths and close calls',
    read(cells, ctx) {
      return cells.filter(hasSus).map((c) => {
        const r = interval(c.seeds.map((s) => { const t = sum(s.heroes.map((h) => takenOf(h.sustain))); return t > 0 ? sum(s.heroes.map((h) => healOf(h.sustain))) / t : null; }));
        const hs = heroesOf(c), hurt = sum(hs.map((h) => h.deaths || 0)) + sum(hs.map((h) => h.sustain.closeCalls || 0));
        if (c.tier !== ctx.hardestOf(c.ground)) return row(c.key, r, 'n/a');
        if (hurt) return row(c.key, r, 'ok', 'the hardest tier hurt it: ' + sum(hs.map((h) => h.deaths || 0)) + ' death(s), ' + sum(hs.map((h) => h.sustain.closeCalls || 0)) + ' close call(s)');
        return row(c.key, r, hoursOf(hs) < THIN_HERO_H ? 'thin' : 'off', 'no death and no dip under 25% HP in ' + hoursOf(hs).toFixed(1) + ' hero-hours on the hardest tier: healing outpaced every pull');
      });
    },
  },
  {
    id: 'RD-REGEN', targets: ['SUST-2'], on: 'cells', label: 'MEASURED',
    reads: 'the engine\'s sustain counters: regeneration\'s share of the healing received, each seed',
    read(cells) {
      return cells.filter(hasSus).map((c) => {
        const r = interval(c.seeds.map((s) => { const h = sum(s.heroes.map((x) => healOf(x.sustain))); return h > 0 ? sum(s.heroes.map((x) => x.sustain.healIn.regen)) / h : null; }));
        if (c.tier !== 'normal') return row(c.key, r, 'n/a');
        return row(c.key, r, r.value === null ? 'thin' : r.value >= 0.95 ? 'off' : 'ok', r.value !== null && r.value >= 0.95 ? 'regeneration carried the hunt alone: no food, drink or healer was needed' : null);
      });
    },
  },
  {
    id: 'RD-ENDS', targets: ['SUST-3'], on: 'cells', label: 'MEASURED',
    reads: 'why each hero\'s hunt ended (the engine\'s end reason, simulateHuntInstance summary.huntEnded): gold, supplies or the no-fight rule, MID on Normal',
    read(cells) {
      const rows = [];
      for (const c of cells.filter((x) => x.tier === 'normal' && x.gear === 'mid')) {
        const hs = heroesOf(c), by = {};
        for (const h of hs) for (const [why, n] of Object.entries(h.ended || {})) for (const [cls, list] of Object.entries(EARLY_ENDS)) if (list.includes(why)) by[cls] = (by[cls] || 0) + n;
        const early = sum(Object.values(by));
        rows.push(row(c.key, point(hs.length ? early / hs.length : null, hs.length), early ? 'off' : 'ok', early ? Object.entries(by).map(([k, n]) => n + ' on ' + k).join(', ') + ' of ' + hs.length + ' hunts' : null));
      }
      return rows;
    },
  },
  {
    id: 'RD-MANA-DEATHS', targets: ['SUST-4'], on: 'cells', label: 'MEASURED',
    reads: 'party deaths at which the healer\'s heal rule had been waiting for mana in the death explanation\'s window (the engine\'s rule_wait, sustain-reads.mjs)',
    read(cells, ctx) {
      return cells.filter((c) => hasSus(c) && c.party === 4 && c.gear === 'mid' && c.tier === 'dangerous').map((c) => {
        const hs = heroesOf(c), deaths = sum(hs.map((h) => h.deaths || 0));
        const short = sum(hs.filter((h) => h.style === 'healer').map((h) => sum(Object.entries(h.sustain.shortAt || {}).filter(([a]) => ctx.isHeal(a)).map(([, n]) => n))));
        return row(c.key, point(short, deaths), short ? 'off' : 'ok', short + ' of ' + deaths + ' death(s) with the healer\'s heal waiting for mana');
      });
    },
  },
  {
    id: 'RD-MAGIC-MANA', targets: ['STYLE-7'], on: 'cells', label: 'MEASURED',
    reads: 'Magic XP over the net mana a hero\'s casts and mana shots kept (the engine\'s sustain counter), the lone mage over the lone healer, seed by seed',
    read(cells) {
      const rows = [];
      const per = (c) => c.seeds.map((s) => { const h = s.heroes[0], m = h.sustain.mana.spent; return m > 0 ? (((h.skillXpPerH || {}).magic || 0) * h.hours) / m : null; });
      const lone = cells.filter((c) => hasSus(c) && c.party === 1 && c.tier === 'normal' && c.gear === 'mid');
      for (const L of [...new Set(lone.map((c) => c.L))].sort((a, b) => a - b)) {
        const mage = lone.find((c) => c.L === L && c.styles[0] === 'mage'), healer = lone.find((c) => c.L === L && c.styles[0] === 'healer');
        if (!mage || !healer) continue;
        const a = per(mage), b = per(healer), r = interval(a.map((x, i) => (x && b[i] ? x / b[i] : null)));
        const off = r.n >= 2 && r.lo !== null && (r.hi < 0.95 || r.lo > 1.05);
        rows.push(row('L ' + L, r, r.n < 2 ? 'thin' : off ? 'off' : 'ok', 'mage ' + (interval(a).value ?? '-') + ', healer ' + (interval(b).value ?? '-') + ' Magic XP a point of mana'));
      }
      return rows;
    },
  },
  {
    id: 'RD-CLOSE-CALLS', targets: ['SURV-3'], on: 'cells', label: 'MEASURED',
    reads: 'encounters under 25% HP (one encounter counts once, cell.mjs) a hero-hour, as a rate per 12 h, MID on Normal',
    read(cells) {
      return cells.filter((c) => hasSus(c) && c.tier === 'normal' && c.gear === 'mid').map((c) => {
        const hs = heroesOf(c), r = rate(sum(hs.map((h) => h.sustain.closeCalls || 0)), hoursOf(hs), 12);
        return row(c.key, r, r.lo !== null && r.lo > 1 ? 'off' : 'ok');
      });
    },
  },
  {
    id: 'RD-TIER-DEATHS', targets: ['SURV-6'], on: 'cells', label: 'MEASURED',
    reads: 'deaths a 1,000 hero-hours on each tier over the tier below, the same Level, gear, party and lineup (exact Poisson intervals)',
    read(cells) {
      const rows = [], groups = new Map();
      for (const c of cells.filter((x) => !x.step)) { const k = [c.L, c.gear, c.party, c.comp].join('|'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(c); }
      for (const [k, list] of groups) {
        const byTier = list.filter((c) => STD.TIERS.includes(c.tier)).sort((a, b) => STD.TIERS.indexOf(a.tier) - STD.TIERS.indexOf(b.tier));
        for (let i = 1; i < byTier.length; i++) {
          const lo = byTier[i - 1], hi = byTier[i], hl = heroesOf(lo), hh = heroesOf(hi);
          const a = rate(sum(hl.map((h) => h.deaths || 0)), hoursOf(hl), 1000), b = rate(sum(hh.map((h) => h.deaths || 0)), hoursOf(hh), 1000);
          const safer = b.hi !== null && a.lo !== null && b.hi < a.lo;
          rows.push(row(k + ' ' + hi.tier + '/' + lo.tier, point(a.value > 0 ? b.value / a.value : null, a.n + b.n), !a.n && !b.n ? 'thin' : safer ? 'off' : 'ok', hi.tier + ' ' + b.value + ' [' + b.lo + ', ' + b.hi + '] against ' + lo.tier + ' ' + a.value + ' [' + a.lo + ', ' + a.hi + ']'));
        }
      }
      return rows;
    },
  },
  {
    id: 'RD-SPELL-SHARE', targets: ['SURV-14'], on: 'cells', label: 'PROXY',
    reads: 'the share of a MID four\'s damage taken that monsters\' spells landed (the engine\'s sustain counter). A PROXY: a telegraphed spell is the only blow that can strike more than one hero, and a spell that struck one counts too',
    read(cells, ctx) {
      return cells.filter((c) => hasSus(c) && c.party === 4 && c.gear === 'mid' && c.tier === ctx.hardestOf(c.ground)).map((c) => {
        const r = interval(c.seeds.map((s) => { const t = sum(s.heroes.map((h) => takenOf(h.sustain))); return t > 0 ? sum(s.heroes.map((h) => h.sustain.takenBy.spell)) / t : null; }));
        return row(c.key, r, r.hi !== null && r.hi < 0.05 ? 'off' : r.n < 2 ? 'thin' : 'ok');
      });
    },
  },
  {
    id: 'RD-FOUR-GOLD', targets: ['PARTY-2'], on: 'cells', label: 'MEASURED',
    reads: 'income less the store bill a hero-hour, the MID four on each tier over the same styles alone on Normal at the same Level, seed by seed',
    read(cells) {
      const rows = [];
      const net = (h) => (h.hours > 0 ? ((h.raw && h.raw.income) - (h.raw && h.raw.store)) / h.hours : null);
      for (const four of cells.filter((c) => c.party === 4 && c.gear === 'mid' && !c.step)) {
        const alone = four.styles.map((st) => cells.find((c) => c.party === 1 && c.L === four.L && c.gear === 'mid' && c.tier === 'normal' && c.styles[0] === st));
        if (alone.some((x) => !x)) continue;
        const per = four.seeds.map((s, i) => { const f = sum(s.heroes.map(net)) / s.heroes.length, a = alone.map((c) => (c.seeds[i] ? net(c.seeds[i].heroes[0]) : null)); return a.every(Number.isFinite) && sum(a) > 0 ? f / (sum(a) / a.length) : null; });
        const r = interval(per);
        rows.push(row(four.key, r, r.n < 2 ? 'thin' : r.hi !== null && r.hi < 1 ? 'off' : 'ok'));
      }
      return rows;
    },
  },
  {
    id: 'RD-LINEUP-WINS', targets: ['STYLE-3'], on: 'cells', label: 'MEASURED',
    reads: 'on each Level\'s ground, the four lineup with the most Level XP a hero-hour among those whose deaths stay under the tier\'s death line; then how many grounds each lineup wins',
    read(cells) {
      const rows = [], wins = {}, lineups = cells.filter((c) => c.block === 'lineups');
      const Ls = [...new Set(lineups.map((c) => c.L))].sort((a, b) => a - b);
      for (const L of Ls) {
        const at = lineups.filter((c) => c.L === L).map((c) => { const hs = heroesOf(c), h = hoursOf(hs); return { c, xp: h > 0 ? sum(hs.map((x) => (x.raw && x.raw.levelXp) || 0)) / h : null, d: rate(sum(hs.map((x) => x.deaths || 0)), h, 1000) }; });
        const line = deathLine(at[0] ? at[0].c.tier : 'deadly', 'mid');
        const safe = at.filter((x) => line === null || x.d.lo === null || x.d.lo <= line).sort((a, b) => b.xp - a.xp);
        if (!safe.length) { rows.push(row('L ' + L, point(null, at.length), 'thin', 'no lineup stayed under the death line')); continue; }
        wins[safe[0].c.comp] = (wins[safe[0].c.comp] || 0) + 1;
        rows.push(row('L ' + L + ' ' + safe[0].c.ground, point(safe[0].xp, safe.length), 'n/a', 'fastest safe: ' + safe[0].c.comp));
      }
      const top = Object.entries(wins).sort((a, b) => b[1] - a[1])[0];
      if (top) rows.push(row('every ground', point(top[1] / Ls.length, Ls.length), Ls.length < 2 ? 'thin' : top[1] === Ls.length ? 'off' : 'ok', top[0] + ' wins ' + top[1] + ' of ' + Ls.length + ' grounds'));
      return rows;
    },
  },
  {
    id: 'RD-RARE-HOURS', targets: ['DROP-2'], on: 'cells', label: 'MEASURED',
    reads: 'hunted hours of one hero for each named Rare it found (the settle\'s rare_drop hints), alone, by ground: hours over the count, its Poisson interval turned over',
    read(cells) {
      const by = new Map();
      for (const c of cells.filter((x) => x.party === 1 && !x.step)) { const g = by.get(c.ground) || { h: 0, k: 0 }; for (const h of heroesOf(c)) { g.h += h.hours || 0; g.k += h.rareItems || 0; } by.set(c.ground, g); }
      return [...by.entries()].map(([g, x]) => {
        const r = rate(x.k, x.h, 1);
        return row(g, { value: x.k ? Number((x.h / x.k).toPrecision(4)) : null, lo: r.hi ? Number((1 / r.hi).toPrecision(4)) : null, hi: r.lo ? Number((1 / r.lo).toPrecision(4)) : null, n: x.k }, x.k < 3 ? 'thin' : 'n/a', x.k + ' Rare(s) in ' + x.h.toFixed(1) + ' hunted hours');
      });
    },
  },
  {
    id: 'RD-RARE-SHARE', targets: ['DROP-5'], on: 'cells', label: 'MEASURED',
    reads: 'in each four\'s seed, the rare rolls each seat won: the rule holds when no seat won twice before every seat won once (most wins less fewest, at most 1). A seat that died is still counted eligible',
    read(cells) {
      return cells.filter((c) => c.party === 4 && c.seeds.some((s) => (s.party.rareRolls || 0) > 0)).map((c) => {
        const seeds = c.seeds.filter((s) => (s.party.rareRolls || 0) > 0);
        const held = seeds.filter((s) => { const w = s.heroes.map((h) => (s.party.rareWins || {})[h.key] || 0); return Math.max(...w) - Math.min(...w) <= 1; }).length;
        return row(c.key, point(held / seeds.length, seeds.length), held === seeds.length ? 'ok' : 'off', held + ' of ' + seeds.length + ' seed(s) with rolls kept the round');
      });
    },
  },
  {
    id: 'RD-HOLD-PAST-400', targets: ['LONG-2'], on: 'cells', label: 'MEASURED',
    reads: 'past Level 400, the hardest tier the MID four holds: deaths a 1,000 hero-hours whose interval reaches under the tier\'s death line (S2 on Normal, S6 above it)',
    read(cells) {
      const rows = [], fours = cells.filter((c) => c.party === 4 && c.gear === 'mid' && c.L > 400 && !c.step);
      for (const L of [...new Set(fours.map((c) => c.L))].sort((a, b) => a - b)) {
        const at = fours.filter((c) => c.L === L).sort((a, b) => STD.TIERS.indexOf(a.tier) - STD.TIERS.indexOf(b.tier));
        const held = at.filter((c) => { const hs = heroesOf(c), r = rate(sum(hs.map((h) => h.deaths || 0)), hoursOf(hs), 1000), line = deathLine(c.tier, 'mid'); return line === null || r.lo <= line; });
        const top = held.length ? held[held.length - 1].tier : null;
        rows.push(row('L ' + L, point(top ? STD.TIERS.indexOf(top) : null, at.length), top ? 'ok' : 'off', top ? 'holds ' + top : 'holds no tier: a wall'));
      }
      return rows;
    },
  },
  {
    id: 'RD-PACE-DAYS', targets: ['PACE-6'], on: 'grid', label: 'MEASURED',
    reads: 'days of the pace seat to Level 88 (grid-derive.mjs dayAt on the cached progression grid, 12 hunted hours a day)',
    read(grid, ctx) {
      if (!grid || !ctx.derived) return [row('Level 88', point(null, 0), 'thin', 'no cached progression grid')];
      const d = ctx.derived.dayAt(ctx.derived.PACE, 88);
      return [row('Level 88', point(d), d === null ? 'thin' : d > 30.5 ? 'off' : 'ok', d === null ? null : d.toFixed(1) + ' days (weeks, not months: off past a month)')];
    },
  },
  {
    id: 'RD-HEADROOM', targets: ['LONG-2'], on: 'formulas', label: 'COMPUTED',
    reads: 'each growth family the engine adds into an integer, from Level 1 to ' + HORIZON_LEVEL.toLocaleString('en-US') + ': the first Level whose value leaves the safe integers (2^53 - 1) or stops growing',
    read(_, ctx) { return headroomRows(ctx.families || gameFamilies(ctx)); },
  },
]);
export const READER_IDS = Object.freeze(READERS.map((r) => r.id));
export const readerById = (id) => READERS.find((r) => r.id === id) || null;

/* ── THE NUMBER HEADROOM READER (07-balance-lab.md 3.3: "a fixed ratio per step grows without bound, 5% a step passes 9 x 10^15 near step
   750") ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export const SAFE = Number.MAX_SAFE_INTEGER;
/** The first step in [1, horizon] where f leaves the safe integers or stops growing, by a log-spaced walk and a bisection: { at, why } or null. */
export function headroomOf(f, horizon = HORIZON_LEVEL) {
  const bad = (n) => { const v = f(n); return !Number.isFinite(v) || Math.abs(v) > SAFE ? 'past 2^53 - 1 (' + v.toExponential(2) + ')' : null; };
  let prev = 0, prevV = -Infinity;
  for (let n = 1; n <= horizon; n = n < 16 ? n + 1 : Math.min(horizon, Math.ceil(n * 1.15)) === n ? horizon : Math.min(horizon, Math.ceil(n * 1.15))) {
    const why = bad(n);
    if (why) { let lo = prev, hi = n; while (hi - lo > 1) { const m = Math.floor((lo + hi) / 2); if (bad(m)) hi = m; else lo = m; } return { at: hi, why: bad(hi) }; }
    const v = f(n);
    if (v < prevV) return { at: n, why: 'falls (' + prevV + ' to ' + v + ')' };
    prev = n; prevV = v;
    if (n === horizon) break;
  }
  return null;
}
/** The game's own growth families (closed form, no engine): the Level curve and a regular monster's HP, XP and coin at its floor. */
export function gameFamilies(ctx) {
  const reg = (k) => (L) => { const s = ctx.formulaStats({ role: 'regular', floor: L, level: L }); return Array.isArray(s[k]) ? s[k][1] : s[k]; };
  return [
    { id: 'level-xp', what: 'Level XP to reach a Level (src/core/xp.js charXpForLevel)', f: ctx.charXpForLevel },
    { id: 'monster-hp', what: 'a regular monster\'s HP at its floor (src/data/balance-sheet.js formulaStats)', f: reg('hp') },
    { id: 'kill-xp', what: 'a regular monster\'s XP a kill at its floor (formulaStats)', f: reg('xp') },
    { id: 'kill-coin', what: 'a regular monster\'s most coin a kill at its floor (formulaStats)', f: reg('gp') },
  ];
}
export function headroomRows(families) {
  return families.map((fam) => {
    const h = headroomOf(fam.f);
    return row(fam.id, point(h ? h.at : HORIZON_LEVEL), h ? 'off' : 'ok', h ? fam.what + ': fails at Level ' + h.at.toLocaleString('en-US') + ', ' + h.why : fam.what + ': holds to Level ' + HORIZON_LEVEL.toLocaleString('en-US'));
  });
}

/* ── THE CELLS, THE CONTEXT, THE REPORT ───────────────────────────────────────────────────────────────────────────────────────────── */
/** A results doc's cells, each with its seeds in seed order (jobs are `<key>#<seed>`). */
export function cellsOf(doc) {
  return doc.cells.map((c) => ({ ...c, seeds: Array.from({ length: c.seeds || 0 }, (_, s) => doc.results[c.key + '#' + s]).filter(Boolean) })).filter((c) => c.seeds.length);
}
/** What the readers read beyond the cells, from a tree (the repo, or the tree a results doc was played on: its data, not its code). */
export async function contextOf(root = ROOT, o = {}) {
  const imp = (p) => import(pathToFileURL(join(root, p)).href);
  const [TI, AB, XP, BS] = await Promise.all(['src/data/hunt-tiers.js', 'src/data/abilities.js', 'src/core/xp.js', 'src/data/balance-sheet.js'].map(imp));
  const ctx = {
    hardestOf: (g) => { const t = TI.tiersOf(g); return t[t.length - 1]; },
    isHeal: (a) => { const r = AB.ABILITIES[a]; return !!(r && (r.lane === 'heal' || r.healPm > 0)); },
    charXpForLevel: XP.charXpForLevel, formulaStats: BS.formulaStats, derived: null,
  };
  if (o.grid) {
    const GRID = await import('./progression-grid.mjs'), DER = await import('./grid-derive.mjs'), KIT = await import('./grid-kit.mjs');
    const g = GRID.readGrid(false) || GRID.readGrid(true);
    if (g) { ctx.grid = g; ctx.derived = DER.derive(await GRID.loadGridData(root), g, await KIT.loadKits(root)); }
  }
  return ctx;
}
/** Every reader on a results doc: { rows: [{ reader, target, ...row }], findings }. */
export function readAll(doc, ctx) {
  const cells = cellsOf(doc), rows = [];
  for (const R of READERS) {
    const got = R.on === 'cells' ? R.read(cells, ctx) : R.on === 'grid' ? R.read(ctx.grid || null, ctx) : R.read(null, ctx);
    for (const x of got) rows.push({ reader: R.id, targets: R.targets, label: R.label, ...x });
  }
  const findings = rows.filter((x) => x.status === 'off').map((x) => finding(x.reader, x.at, x.reader + ' ' + x.at + ': ' + (x.shown || 'value ' + x.value + (x.lo !== null ? ' [' + x.lo + ', ' + x.hi + ']' : ''))));
  for (const e of doc.errors || []) findings.push(finding('tool:cell-error', e.id.split('#')[0], 'a cell failed: ' + e.error));
  return { rows, findings };
}

/* ── --check: every target has a reader or a reason ──────────────────────────────────────────────────────────────────────────────────
   The spec's own shape (a MISSING names its gap and `until`, a reader:ID resolves) is targets.mjs validate's, which --check runs first.
   This adds the two directions only the Lab knows: a target's Lab reader says it reads that target, and every reader reads a target. */
export function checkTargets(doc) {
  const out = [];
  const used = new Set();
  for (const t of doc.targets) {
    for (const r of t.readers || []) if (r.startsWith('reader:')) { const id = r.slice(7); used.add(id); const R = readerById(id); if (!R) out.push(t.id + ': names reader ' + id + ', which readers.mjs does not hold'); else if (!R.targets.includes(t.id)) out.push(t.id + ': reader ' + id + ' does not say it reads ' + t.id); }
  }
  for (const R of READERS) {
    if (!used.has(R.id)) out.push(R.id + ': reads ' + R.targets.join(', ') + ', and no target names it');
    for (const tid of R.targets) if (!doc.targets.some((t) => t.id === tid)) out.push(R.id + ': reads ' + tid + ', which targets.json does not hold');
  }
  return out;
}

/* ── --play: the subset plan on the tree or a patch's scratch copy ───────────────────────────────────────────────────────────────── */
async function play(o) {
  const { loadGridData } = await import('./progression-grid.mjs');
  const { loadKits } = await import('./grid-kit.mjs');
  const { RUNS, planMatrix } = await import('./matrix-plan.mjs');
  const { slimSeed } = await import('./matrix-metrics.mjs');
  const { playJobs, dataView } = await import('./balance-matrix.mjs');
  const { plantScratch, PATCH_SCHEMA } = await import('./matrix-scratch.mjs');
  const patch = o.patch ? JSON.parse(readFileSync(o.patch, 'utf8')) : null;
  if (patch && patch.schema !== PATCH_SCHEMA) throw new Error(o.patch + ' is not a ' + PATCH_SCHEMA);
  const D = await loadGridData(ROOT), K = await loadKits(ROOT);
  const sc = patch ? await plantScratch(patch) : null;
  try {
    const root = sc ? sc.root : ROOT;
    const V = await dataView(D, root);
    const plan = planMatrix(V, K, RUNS.subset, { blocks: o.blocks, seeds: o.seeds, hours: o.hours, only: o.only });
    const t0 = Date.now();
    const { results, errors } = await playJobs(plan.jobs, root, o.workers);
    const planHash = createHash('sha256').update(JSON.stringify(plan.jobs.map((j) => [j.id, j.cell]))).digest('hex').slice(0, 12);
    const keep = ['key', 'block', 'L', 'gear', 'party', 'comp', 'tier', 'ground', 'styles', 'step', 'seeds'];
    const tree = treeStamp();
    const doc = {
      schema: RESULTS_SCHEMA, at: new Date().toISOString(), tree, patch: patch ? { name: patch.name, kind: patch.kind, edits: patch.edits || [], knobs: patch.knobs || {} } : null,
      scenario: { run: 'subset', blocks: o.blocks, seeds: o.seeds, hours: o.hours, cells: plan.cells.length, planHash },
      assumptions: assumptionsOf({ candidate: patch ? 'C0 with the patch ' + patch.name + ' planted on a scratch copy' : null, tree, scenario: { run: 'subset', blocks: o.blocks, cells: plan.cells.length, planHash, seeds: o.seeds, hours: o.hours },
        deathRule: 'real (one hunt a seed: a death ends that hero\'s hunt, the rest hunt on; cell.mjs)', bar: 'the played reference bars of buildCell (tools/balance-sim/played.mjs)',
        supply: 'the store fallback with gold to pay for it (buildCell)', gear: 'standards.mjs GEAR_STATES rules (grid-kit.mjs)' }),
      cells: plan.cells.map((c) => Object.fromEntries(keep.filter((k) => c[k] !== undefined).map((k) => [k, c[k]]))),
      results: Object.fromEntries(Object.entries(results).map(([id, r]) => [id, slimSeed(r)])), errors, runtime: { wallS: Math.round((Date.now() - t0) / 1000) },
    };
    if (o.out) writeFileSync(o.out, JSON.stringify(doc));
    console.log('played ' + Object.keys(results).length + ' of ' + plan.jobs.length + ' seed jobs on ' + (sc ? 'a scratch copy with ' + patch.name : 'the tree') + ' in ' + doc.runtime.wallS + ' s' + (errors.length ? ', ' + errors.length + ' error(s)' : '') + (o.out ? ': ' + o.out : ''));
    return errors.length ? 1 : 0;
  } finally { if (sc) sc.done(); }
}
function treeStamp() {
  try {
    const commit = execFileSync('git', ['rev-parse', '--short=9', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain', '--', 'src', 'tools/balance-sim', 'tools/balance-program', 'supabase/functions'], { cwd: ROOT, encoding: 'utf8' }).trim().length > 0;
    return { commit, dirty };
  } catch { return { commit: 'unknown', dirty: true }; }
}

/* ── --report ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export function reportOf(doc, ctx, pin = null) {
  const { rows, findings } = readAll(doc, ctx);
  const assumptions = doc.assumptions || null;
  return { schema: 'hearthrise.lab-readers-report/1', results: { at: doc.at, tree: doc.tree, patch: doc.patch, scenario: doc.scenario }, assumptions, assumptionsMissing: checkAssumptions(assumptions),
    rows, findings, diff: pin ? diffFindings(pin.findings, findings) : null };
}
function printReport(rep) {
  const L = [];
  for (const id of READER_IDS) {
    const rs = rep.rows.filter((r) => r.reader === id);
    if (!rs.length) continue;
    const R = readerById(id), c = (s) => rs.filter((r) => r.status === s).length;
    L.push(id + ' (' + R.targets.join(', ') + ', ' + R.label + '): ' + rs.length + ' row(s), ' + c('off') + ' off, ' + c('ok') + ' ok, ' + c('thin') + ' thin, ' + c('n/a') + ' reading');
    for (const r of rs.filter((x) => x.status === 'off').slice(0, 6)) L.push('  off  ' + r.at + ': ' + (r.shown || r.value + (r.lo !== null ? ' [' + r.lo + ', ' + r.hi + ']' : '')));
  }
  L.push('FINDINGS ' + rep.findings.length + (rep.diff ? ': ' + rep.diff.new.length + ' new, ' + rep.diff.gone.length + ' gone, ' + rep.diff.unchanged.length + ' unchanged against the pin' : ''));
  if (rep.diff) for (const [k, list] of [['new', rep.diff.new], ['gone', rep.diff.gone]]) for (const f of list.slice(0, 12)) L.push('  ' + k.padEnd(5) + f.id + ' ' + f.what.slice(0, 140));
  L.push(...(rep.assumptions ? printAssumptions(rep.assumptions) : ['ASSUMPTIONS: none (a results file from before the block)']));
  if (rep.assumptionsMissing.length) L.push('  UNSTATED: ' + rep.assumptionsMissing.join(', '));
  return L;
}

/* ── THE SELFTEST: planted cells with known answers ──────────────────────────────────────────────────────────────────────────────── */
/* an honest hero: healing 30 food, 20 from an ally and 40 regeneration against 90 swings and 10 spell, no dip, 4 hours, Magic XP 25 an hour on
   100 mana: every reader reads it in band */
const HONEST = Object.freeze({ healIn: { food: 30, ally: 20, regen: 40 }, takenBy: { swing: 90, spell: 10 }, mana: { spent: 100 } });
const sus = (o = HONEST) => ({ healIn: { food: 0, self: 0, ally: 0, regen: 0, ...(o.healIn || {}) }, takenBy: { swing: 0, spell: 0, status: 0, ...(o.takenBy || {}) },
  mana: { spent: 0, back: 0, waits: 0, ...(o.mana || {}) }, waitsBy: {}, regenUnreadH: 0, shortAt: o.shortAt || {}, closeCalls: o.closeCalls || 0, encounters: 10 });
const hero = (style, i, o = {}) => ({ style, key: '0' + i + ':' + style, hours: 4, deaths: 0, ended: {}, rareItems: 0, skillXpPerH: { magic: 25 }, raw: { levelXp: 1000, income: 400, store: 100 }, sustain: sus(), ...o });
const seedOf = (heroes) => ({ party: { hours: 4, rareRolls: 0, rareWins: {} }, heroes });
const STYLES4 = ['hammer', 'tank', 'mage', 'healer'];
/** A planted cell: `heroes(seed)` builds each seed's heroes (two seeds unless `n`). */
const cellOf = (key, o, heroes, n = 2) => {
  const hs = heroes(0);
  return { key, block: 'four', L: 60, gear: 'mid', tier: 'normal', ground: 'g', party: hs.length, comp: hs.length === 4 ? 'std' : hs[0].style, styles: hs.map((h) => h.style), ...o,
    seeds: Array.from({ length: n }, (_, s) => seedOf(heroes(s))) };
};
const four = (o = {}) => () => STYLES4.map((s, i) => hero(s, i, typeof o === 'function' ? o(i) : o));
const docOf = (cells) => ({ schema: RESULTS_SCHEMA, cells: cells.map(({ seeds, ...c }) => ({ ...c, seeds: seeds.length })), results: Object.fromEntries(cells.flatMap((c) => c.seeds.map((s, i) => [c.key + '#' + i, s]))), errors: [] });
const plantCtx = (families) => ({ hardestOf: () => 'deadly', isHeal: (a) => a === 'greater_mend', derived: { PACE: 'p', dayAt: () => 21 }, grid: {}, families });
const FLAT = [{ id: 'flat', what: 'flat', f: (n) => n }], FIVE = [{ id: 'five', what: 'five', f: (n) => 1.05 ** n }];
/** The honest world: a four on each tier and each way alone on Normal; the Deadly four lost a hero once (so the tier hurt it). */
const honestWorld = () => [
  cellOf('n4', {}, four()), cellOf('d4', { tier: 'dangerous' }, four()), cellOf('x4', { tier: 'deadly' }, four((i) => ({ deaths: i === 0 ? 1 : 0 }))),
  ...STYLES4.map((s) => cellOf('n1' + s, { block: 'ways' }, () => [hero(s, 0)])),
];

function selftest() {
  const fails = [];
  const expect = (name, ok) => { if (!ok) fails.push(name); };
  const ctx = plantCtx(FLAT);
  const ok0 = readAll(docOf(honestWorld()), ctx);
  expect('CONTROL: the honest world reads no finding (got ' + ok0.findings.map((f) => f.what).join(' | ') + ')', ok0.findings.length === 0);
  const each = (cs, key, f) => cs.find((c) => c.key === key).seeds.forEach((s) => s.heroes.forEach(f));
  const plants = [
    ['RD-SUSTAIN: a hardest-tier four nobody hurt', (cs) => each(cs, 'x4', (h) => { h.deaths = 0; })],
    ['RD-REGEN: a Normal hunt carried by regeneration', (cs) => each(cs, 'n4', (h) => { h.sustain.healIn = { food: 0, self: 0, ally: 0, regen: 100 }; })],
    ['RD-ENDS: a Normal hunt that ran out of supplies', (cs) => { cs.find((c) => c.key === 'n4').seeds[0].heroes[1].ended = { heals_out: 1 }; }],
    ['RD-MANA-DEATHS: the healer short of mana at a death on Dangerous', (cs) => { const s = cs.find((x) => x.key === 'd4').seeds[0]; s.heroes[0].deaths = 1; s.heroes[3].sustain.shortAt = { greater_mend: 1 }; }],
    ['RD-MAGIC-MANA: the mage earns twice the healer\'s Magic XP a point of mana', (cs) => each(cs, 'n1mage', (h) => { h.skillXpPerH = { magic: 50 }; })],
    ['RD-CLOSE-CALLS: four dips an hour on Normal', (cs) => each(cs, 'n4', (h) => { h.sustain.closeCalls = 16; })],
    ['RD-TIER-DEATHS: Deadly safer than Dangerous', (cs) => { each(cs, 'x4', (h) => { h.deaths = 0; h.sustain.closeCalls = 1; }); each(cs, 'd4', (h) => { h.deaths = 3; }); }],
    ['RD-SPELL-SHARE: a Deadly four no spell struck', (cs) => each(cs, 'x4', (h) => { h.sustain.takenBy = { swing: 100, spell: 0, status: 0 }; })],
    ['RD-FOUR-GOLD: a four that earns half what its heroes earn apart', (cs) => each(cs, 'n4', (h) => { h.raw.income = 250; })],
    ['RD-RARE-SHARE: one seat wins twice before another wins once', (cs) => { const s = cs.find((c) => c.key === 'n4').seeds[0]; s.party.rareRolls = 2; s.party.rareWins = { '00:hammer': 2 }; }],
    ['RD-HOLD-PAST-400: a wall at Level 1000', (cs) => { for (const t of ['normal', 'dangerous', 'deadly']) cs.push(cellOf('w' + t, { L: 1000, tier: t }, four({ deaths: 40 }))); }],
  ];
  for (const [name, plant] of plants) {
    const cs = honestWorld();
    plant(cs);
    const id = name.split(':')[0];
    const got = readAll(docOf(cs), ctx).findings;
    expect('NOT CAUGHT: ' + name + ' (findings: ' + (got.map((f) => f.check).join(', ') || 'none') + ')', got.some((f) => f.check === id));
  }
  /* the lineups on their own world: one lineup fastest on both grounds is a finding, each fastest somewhere is not */
  const lineup = (L, comp, xp) => cellOf('l' + L + comp, { block: 'lineups', L, tier: 'deadly', comp, ground: 'g' + L }, four({ raw: { levelXp: xp, income: 400, store: 100 } }));
  const one = readAll(docOf([lineup(60, 'a', 2000), lineup(60, 'b', 1000), lineup(110, 'a', 2000), lineup(110, 'b', 1000)]), ctx).findings;
  expect('NOT CAUGHT: RD-LINEUP-WINS: one lineup fastest on every ground', one.some((f) => f.check === 'RD-LINEUP-WINS'));
  const two = readAll(docOf([lineup(60, 'a', 2000), lineup(60, 'b', 1000), lineup(110, 'a', 1000), lineup(110, 'b', 2000)]), ctx).findings;
  expect('CONTROL: RD-LINEUP-WINS: two lineups each fastest somewhere', !two.some((f) => f.check === 'RD-LINEUP-WINS'));
  const slow = readAll(docOf([]), { ...ctx, derived: { PACE: 'p', dayAt: () => 45 } }).findings;
  expect('NOT CAUGHT: RD-PACE-DAYS: 45 days to Level 88', slow.some((f) => f.check === 'RD-PACE-DAYS'));
  /* THE HEADROOM READER: a 5% a step family from 1 leaves the safe integers at step 753 (07-balance-lab.md 3.3: "near step 750"); from 100 at
     659; a linear one holds; a falling one fails */
  const five = headroomOf((n) => 1.05 ** n), five100 = headroomOf((n) => 100 * 1.05 ** n);
  expect('the headroom reader puts a 5% step from 1 at step ' + (five && five.at) + ', not 753', five && five.at >= 750 && five.at <= 756);
  expect('the headroom reader puts a 5% step from 100 at step ' + (five100 && five100.at) + ', not 659', five100 && five100.at >= 656 && five100.at <= 662);
  expect('CONTROL: a linear family holds to the horizon', headroomOf((n) => 1760 * n) === null);
  expect('the headroom reader misses a family that falls', !!headroomOf((n) => (n < 5000 ? n : 1)));
  const hr = readAll(docOf([]), plantCtx(FIVE)).findings;
  expect('NOT CAUGHT: RD-HEADROOM: a planted 5% family', hr.some((f) => f.check === 'RD-HEADROOM' && f.scope === 'five'));
  /* FINDINGS: a stable id is its check and scope; a planted patch's report lists new, gone and unchanged right */
  const pinWorld = honestWorld(); plants[0][1](pinWorld);
  const pinned = readAll(docOf(pinWorld), plantCtx(FIVE)).findings;
  const patched = honestWorld(); plants[0][1](patched); plants[1][1](patched); plants[2][1](patched);
  const now = readAll(docOf(patched), ctx).findings;
  const d = diffFindings(pinned, now);
  expect('the diff names the patch\'s two new findings (got new ' + d.new.map((f) => f.check).join(',') + ')', d.new.length === 2 && d.new.some((f) => f.check === 'RD-REGEN') && d.new.some((f) => f.check === 'RD-ENDS'));
  expect('the diff names the finding the patched run lost as gone (got gone ' + d.gone.map((f) => f.check).join(',') + ')', d.gone.length === 1 && d.gone[0].check === 'RD-HEADROOM');
  expect('the diff names the finding both runs hold as unchanged (got ' + d.unchanged.map((f) => f.check).join(',') + ')', d.unchanged.length === 1 && d.unchanged[0].check === 'RD-SUSTAIN');
  const moved = honestWorld(); plants[0][1](moved); plants[1][1](moved); plants[2][1](moved); each(moved, 'n4', (h) => { h.sustain.healIn.regen = 300; });
  expect('a finding whose value moved keeps its id (unchanged, never new and gone)', diffFindings(now, readAll(docOf(moved), ctx).findings).unchanged.some((f) => f.check === 'RD-REGEN'));
  /* --check: a target naming a reader that does not exist, a reader no target names, a MISSING with no `until` */
  const bad = checkTargets({ targets: [{ id: 'A-1', readers: ['reader:RD-NOPE'], readerState: 'lab' }] });
  expect('--check misses a reader that does not exist', bad.some((s) => /RD-NOPE/.test(s)));
  expect('--check misses a reader that does not say it reads its target', checkTargets({ targets: [{ id: 'SUST-2', readers: ['reader:RD-SUSTAIN'] }] }).some((s) => /does not say it reads SUST-2/.test(s)));
  expect('--check misses a reader no target names', bad.some((s) => /RD-SUSTAIN: reads SUST-1, and no target names it/.test(s)));
  /* the assumptions block: a report states every field, or says which it did not */
  expect('an assumptions block with nothing stated reads complete', checkAssumptions(assumptionsOf({})).length > 5);
  expect('CONTROL: a stated block reads incomplete', !checkAssumptions(assumptionsOf({ candidate: null, tree: { commit: 'x', dirty: false }, scenario: { run: 'subset', blocks: ['four'], cells: 1, planHash: 'h', seeds: 1, hours: 1 }, deathRule: 'real', bar: 'b', supply: 's', gear: 'g' })).length);
  for (const f of fails) console.error('FAIL ' + f);
  console.log('readers selftest: ' + (plants.length + 21) + ' cases, ' + fails.length + ' failed');
  return fails.length ? 1 : 0;
}

/* ── CLI ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const has = (k) => argv.includes('--' + k);
const arg = (k, d = null) => { const i = argv.indexOf('--' + k); return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : d; };
async function main() {
  if (has('selftest')) return selftest();
  if (has('list')) { for (const R of READERS) console.log(R.id.padEnd(18) + R.targets.join(',').padEnd(9) + R.on.padEnd(9) + R.label.padEnd(9) + R.reads); return 0; }
  if (has('check')) {
    /* the spec's own shape first (targets.mjs: a MISSING names its gap and until), then the Lab's two directions */
    const doc = JSON.parse(readFileSync(TARGETS_FILE, 'utf8'));
    const bad = [...(await import('./targets.mjs')).validate(doc), ...checkTargets(doc)];
    for (const b of bad) console.error('BAD  ' + b);
    console.log('readers: ' + READERS.length + ' readers, ' + bad.length + ' problem(s)');
    return bad.length ? 1 : 0;
  }
  if (has('headroom')) { for (const r of headroomRows(gameFamilies(await contextOf()))) console.log((r.status === 'off' ? 'OFF  ' : 'ok   ') + r.shown); return 0; }
  if (has('play')) return play({ blocks: (arg('blocks') || 'ways,gear,tier,four').split(','), seeds: Number(arg('seeds', 2)), hours: Number(arg('hours', 1)), workers: Number(arg('workers', 3)), out: arg('out'), patch: arg('patch'), only: arg('only') ? arg('only').split(',').map(Number) : null });
  if (has('report')) {
    const f = arg('report');
    if (!f || !existsSync(f)) { console.error('readers.mjs: --report <results.json>'); return 2; }
    const doc = JSON.parse(readFileSync(f, 'utf8'));
    if (doc.schema !== RESULTS_SCHEMA) { console.error('readers.mjs: ' + f + ' is not a ' + RESULTS_SCHEMA); return 2; }
    const rep = reportOf(doc, await contextOf(ROOT, { grid: !has('no-grid') }), arg('pin') ? readPin(arg('pin')) : null);
    if (arg('write-pin')) writeFileSync(arg('write-pin'), JSON.stringify(pinOf(rep.findings, { results: f, tree: doc.tree, patch: doc.patch && doc.patch.name }), null, 1) + '\n');
    if (has('json')) console.log(JSON.stringify(rep, null, 1)); else console.log(printReport(rep).join('\n'));
    return rep.diff && rep.diff.new.length ? 1 : 0;
  }
  console.error('readers.mjs: --list | --check | --play | --report <results> | --headroom | --selftest');
  return 2;
}
if (isMain(import.meta.url)) main().then((c) => process.exit(c), (e) => { console.error('readers.mjs: ' + (process.env.HR_TRACE ? e.stack : e.message)); process.exit(2); });
