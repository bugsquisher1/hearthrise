#!/usr/bin/env node
// tools/balance-sim/grade-compare.mjs — DOES ANYTHING A PLAYER WOULD FEEL GET WORSE? (lane/b-ground-grader, the release gate the
// Coordinator asked for, 2026-11-07). Two graded runs of tools/balance-sim/grade.mjs on the same grid (today's rows, a candidate's),
// compared cell for cell by what a player would feel:
//   Normal deaths at or above a floor     any death the candidate has where today had none, per ground and party size
//   a held harder tier paying under Normal any such cell new in the candidate
//   a party seat against going alone      every party cell on Normal in range: the lowest seat's XP over the median lone hero,
//                                         worse when it drops more than TOL and ends under 1 (a seat that now levels slower)
//   the fresh hero (practice set)          dips under 25% HP and deaths at a first-day floor, worse when they rise
// plus the sheet's binding fails per ground, before and after. Gold is never a gate (Tyler 2026-11-13, NO PROFIT MOLDS: the old "gold an
// hour by floor" inversion is retired; grade.mjs prints each ground's gold side by side). EXIT 1 when anything a player would feel is worse, else 0.
//
//   node tools/balance-sim/grade-compare.mjs --before DIR --after DIR [--root TREE] [--tol 0.02]
import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { feelVerdicts, fitsOf, metricsOf } from './grade.mjs';
import { isMain } from '../../tests/_is-main.mjs';

const median = (xs) => { const s = xs.filter(Number.isFinite).sort((a, b) => a - b); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const IN = ['floor', 'middle', 'plus10', 'top'];

/** Seat ratios per party cell on Normal in range: key -> lowest seat XP / median lone XP. */
export function seatRatios(cells) {
  const rows = cells.filter((c) => c.heroes && c.cell && c.cell.grade && (c.cell.grade.gear || 'ladder') === 'ladder');
  const out = {};
  for (const c of rows) {
    const m = c.cell.grade;
    if (m.tier !== 'normal' || !IN.includes(m.offset) || m.size < 2) continue;
    const solo = median(rows.filter((o) => o.cell.grade.ground === m.ground && o.cell.grade.tier === 'normal' && o.cell.grade.offset === m.offset && o.cell.grade.size === 1).map((o) => metricsOf(o).xp));
    if (solo > 0) out[[m.ground, m.offset, m.comp].join(' / ')] = Math.min(...c.heroes.map((h) => h.levelXpPerH)) / solo;
  }
  return out;
}
/** The fresh hero per ground and way: { dips, deaths }. */
export function freshOf(cells) {
  const out = {};
  for (const c of cells) if (c.cell && c.cell.grade && c.cell.grade.gear === 'practice') { const x = metricsOf(c); out[c.cell.grade.ground + ' / ' + c.cell.grade.comp] = { dips: x.dips, deaths: x.deaths }; }
  return out;
}

/** Everything a player would feel that is worse in `after` than in `before`: [{ what, where, before, after }]. */
export function worse(before, after, fits, tol = 0.02) {
  const out = [];
  const fb = feelVerdicts(before, fits), fa = feelVerdicts(after, fits);
  const keys = (vs, rule) => new Set(vs.filter((v) => v.rule === rule).map((v) => v.key.split(' / ').slice(0, 4).join(' / ')));
  for (const rule of ['feel-normal-deaths', 'feel-tier-less']) {
    const had = keys(fb, rule);
    for (const v of fa.filter((x) => x.rule === rule)) {
      const k = v.key.split(' / ').slice(0, 4).join(' / ');
      if (!had.has(k)) out.push({ what: rule, where: v.key, before: 'none', after: Math.round(v.value * 100) / 100 });
    }
  }
  const sb = seatRatios(before), sa = seatRatios(after);
  for (const [k, a] of Object.entries(sa)) { const b = sb[k]; if (b != null && a < 1 && a < b - tol) out.push({ what: 'seat-vs-solo', where: k, before: Math.round(b * 100) / 100, after: Math.round(a * 100) / 100 }); }
  const xb = freshOf(before), xa = freshOf(after);
  /* a dip count moves a little with any row change on the same dice: worse past a quarter more and two more */
  for (const [k, a] of Object.entries(xa)) { const b = xb[k]; if (b && (a.deaths > b.deaths || a.dips > b.dips * 1.25 + 2)) out.push({ what: 'fresh-hero', where: k, before: b.dips + ' dips, ' + b.deaths + ' deaths', after: a.dips + ' dips, ' + a.deaths + ' deaths' }); }
  return out;
}

if (isMain(import.meta.url)) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
  const read = (dir) => readFileSync(join(resolve(dir), 'cells.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const bDir = arg('before', null), aDir = arg('after', null);
  if (!bDir || !aDir) { console.error('grade-compare: --before DIR --after DIR [--root TREE]'); process.exit(2); }
  const fits = await fitsOf(resolve(arg('root', '.')));
  const w = worse(read(bDir), read(aDir), fits, Number(arg('tol', '0.02')));
  const sheet = (dir) => { const j = JSON.parse(readFileSync(join(resolve(dir), 'grade.json'), 'utf8')); const by = {}; for (const v of j.verdicts) if (v.verdict === 'FAIL' && !v.rule.startsWith('feel-') && v.binding) by[v.ground] = (by[v.ground] || 0) + 1; return by; };
  const sb = sheet(bDir), sa = sheet(aDir);
  console.log('SHEET BINDING FAILS per ground, before -> after');
  for (const g of [...new Set([...Object.keys(sb), ...Object.keys(sa)])]) console.log('  ' + g.padEnd(22) + (sb[g] || 0) + ' -> ' + (sa[g] || 0));
  console.log('\nWORSE FOR A PLAYER (' + w.length + ')');
  for (const x of w) console.log('  ' + x.what.padEnd(20) + x.where + ': ' + x.before + ' -> ' + x.after);
  console.log('\nGATE: anything a player would feel worse than before? ' + (w.length ? 'YES' : 'NO'));
  process.exit(w.length ? 1 : 0);
}
