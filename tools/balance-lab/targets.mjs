// tools/balance-lab/targets.mjs — A RUN AGAINST THE TARGET SHEET, green or red per target.
//
// The sheet is src/data/balance-sheet.js BALANCE_SHEET when the bundle holds it (lane/b-ground-formula: the designer's
// targets, each RULED or DESIGNER in its own comment). Without it, Tyler's balance ruling of 2026-10-25 (§2 pace, §3
// Normal band, §5 parties) and the 10-18 profit line, the numbers the sheet restates. Either way the pace is the
// contract a x L^b Level XP an hour at Level L (src/data/core-model.js LEVEL_PACE.contract), the trend the Level curve
// is held to. A target that does not apply to a run is left out and the run's notes say why (a harder tier carries
// risk by design; a hero outside the ground's band is read on the weight-class lines); a target that needs a run the
// page did not play (each hero alone, the same party on Normal) says which box to tick.
import { LEVEL_PACE } from '../../src/data/core-model.js';
import { charXpForLevel } from '../../src/core/xp.js';
import { STYLES } from '../balance-sim/gear.mjs';
import * as SHEET from './virtual/sheet.mjs';

/* Tyler's 2026-10-25 ruling and the 10-18 profit line, in the sheet's shape (used when the bundle has no sheet) */
const RULING_1025 = Object.freeze({
  normal: { deathsPer1000h: 1, closeCallPct: 25, closeCallsPer12h: 1, typicalMinHpPct: 60, marginMin: 0.25, supplyShare: null, xpVsContract: { at: 'middle', min: 0.9, max: 1.1 } },
  freshHero: null, weightClass: null, tiers: null,
  party: { fourVsSolo: [1.15, 1.25] },
});
/* §5's illustrative duo and trio lines (provisional in the ruling), beside the four's */
const PARTY_LINES = Object.freeze({ 2: [1.05, 1.15], 3: [1.10, 1.20] });

export const sheetSource = () => (SHEET.BALANCE_SHEET ? 'src/data/balance-sheet.js' : 'balance ruling 2026-10-25');
const sheet = () => SHEET.BALANCE_SHEET || RULING_1025;
/** The pace contract's Level XP an hour at Level L. */
export const contractXpPerH = (L) => (typeof SHEET.contractXpPerH === 'function' ? SHEET.contractXpPerH(L) : LEVEL_PACE.contract.a * Math.max(1, L) ** LEVEL_PACE.contract.b);
/** Hours from Level L to L + 1 at the pace contract. */
export const contractHoursToNext = (L) => (charXpForLevel(L + 1) - charXpForLevel(L)) / contractXpPerH(L);

/* the four classes of the party line (Tyler 2026-10-31: Melee with or without a shield, Ranger, Mage, Healer) */
const classOf = (style) => ({ tank: 'melee', melee_dps: 'melee', ranger: 'ranger', mage: 'mage', healer: 'healer' })[STYLES[style] && STYLES[style].role] || style;
const row = (id, label, who, value, target, pass, note) => ({ id, label, who, value, target, pass, note: note || null });
const pct = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 1000) / 10);
const pctTxt = (x) => (pct(x) === null ? null : pct(x) + '%');
const TIER_NAME = { normal: 'Normal', dangerous: 'Dangerous', deadly: 'Deadly' };

/**
 * Grade one measured run. run = the summarise answer; ctx = { band: [lo, hi], tier, gear: [preset per seat] };
 * extra = { solo: { 'style@level': { levelXpPerH } } (each hero alone, same ground and tier),
 *           normal: { heroes: [{ levelXpPerH, deaths, profitPerH }], hours } (the same party on Normal, same dice) }.
 * Answers { source, notes: [text], rows: [{ id, label, who, value, target, pass: true | false | null, note }] }.
 */
export function grade(run, ctx, extra) {
  const S = sheet();
  const N = S.normal;
  const band = ctx.band || [1, 1];
  const tier = ctx.tier || 'normal';
  const x = extra || {};
  const rows = [], notes = [];
  const n = run.heroes.length;
  const whoOf = (h) => h.style + ' L' + h.level;
  if (tier === 'normal') {
    for (const [i, h] of run.heroes.entries()) {
      const who = whoOf(h);
      if (h.level < band[0]) { notes.push(who + ' is under the band (' + band[0] + '-' + band[1] + '): on Normal its weight-class line is a report (more XP, at a price in gold), not a target.'); continue; }
      if (h.level > band[1]) { notes.push(who + ' is over the band (' + band[0] + '-' + band[1] + '): over-levelled hunting is profit with low XP, no target (Tyler 2026-10-14).'); continue; }
      const fresh = S.freshHero && (ctx.gear && ctx.gear[i]) === 'starter' && h.level <= S.freshHero.upToLevel;
      const T = fresh ? S.freshHero : N;
      const d = h.deathsPer1000h || {};
      const deathMax = fresh ? 0 : T.deathsPer1000h;
      rows.push(row('deaths', fresh ? 'Deaths (a fresh hero)' : 'Deaths per 1,000 h', who, fresh ? h.deaths : d.rate,
        (fresh ? 'none' : '<= ' + deathMax) + (Number.isFinite(d.hi) && !fresh ? ', 95% upper ' + Math.round(d.hi) : ''), fresh ? h.deaths === 0 : d.rate <= deathMax));
      const cc = h.closeCallsPer12h || {};
      const ccMax = fresh ? 0 : T.closeCallsPer12h;
      rows.push(row('close', 'Dips under 25% per 12 h', who, cc.rate, '<= ' + ccMax, cc.rate <= ccMax));
      const minHp = h.encMinHpPct && h.encMinHpPct.p50;
      rows.push(row('minhp', 'Typical lowest HP a pull', who, minHp === null ? null : minHp + '%', '>= ' + T.typicalMinHpPct + '%', minHp === null ? null : minHp >= T.typicalMinHpPct));
      rows.push(row('margin', 'Coin + commons over the store bill', who, h.margin === null ? 'no store bill' : '+' + pct(h.margin) + '%', '>= +' + pct(T.marginMin) + '%',
        h.margin === null ? true : h.margin >= T.marginMin));
      if (!fresh && N.supplyShare && h.level >= N.supplyShare.fromLevel) {
        const share = h.incomePerH > 0 ? h.storePerH / h.incomePerH : null;
        rows.push(row('supply', 'Store bill as a share of income', who, pctTxt(share), pct(N.supplyShare.min) + '-' + pct(N.supplyShare.max) + '%',
          share === null ? null : share >= N.supplyShare.min && share <= N.supplyShare.max));
      }
      if (n === 1) {
        const ratio = h.levelXpPerH / contractXpPerH(h.level);
        const lo = fresh ? S.freshHero.xpVsPaceMin : N.xpVsContract.min, hi = fresh ? Infinity : N.xpVsContract.max;
        rows.push(row('pace', 'Level XP an hour vs the pace contract', who, Math.round(h.levelXpPerH).toLocaleString('en-US') + ' (' + pct(ratio) + '%)',
          Math.round(contractXpPerH(h.level)).toLocaleString('en-US') + ' x ' + (hi === Infinity ? '>= ' + lo : lo + '-' + hi), ratio >= lo && ratio <= hi,
          N.xpVsContract.at === 'middle' ? 'the sheet reads it at the band\'s middle (' + Math.round((band[0] + band[1]) / 2) + ')' : null));
      }
    }
    /* THE PARTY LINE: XP a head against each hero alone, same ground, same Levels */
    if (n > 1) {
      const sameClass = new Set(run.heroes.map((h) => classOf(h.style))).size === 1;
      const line = n === 4 ? S.party.fourVsSolo : PARTY_LINES[n];
      const target = sameClass ? '<= 100% (one class, 2026-10-31)' : pct(line[0]) + '-' + pct(line[1]) + '%' + (n < 4 ? ' (provisional)' : '');
      const soloXp = x.solo ? run.heroes.map((h) => (x.solo[h.style + '@' + h.level] || {}).levelXpPerH).filter(Number.isFinite) : [];
      if (soloXp.length === n) {
        const head = run.heroes.reduce((s, h) => s + h.levelXpPerH, 0) / n, base = soloXp.reduce((s, v) => s + v, 0) / n;
        const r = base > 0 ? head / base : null;
        rows.push(row('party', 'Level XP a head vs the same heroes alone', 'party of ' + n, pctTxt(r), target, r === null ? null : sameClass ? r <= 1 : r >= line[0] && r <= line[1]));
      } else rows.push(row('party', 'Level XP a head vs the same heroes alone', 'party of ' + n, null, target, null, 'tick "Also play each hero alone" to read it'));
    }
    return { source: sheetSource(), notes, rows };
  }
  /* A HARDER TIER: Normal's safety lines step aside (Tyler 2026-11-06: "Yes, make it risky"); the tier and weight-class lines read */
  notes.push(TIER_NAME[tier] + ' carries real risk by design (Tyler 2026-11-06), so Normal\'s safety lines are not read here.');
  const W = S.weightClass;
  for (const h of run.heroes) {
    const under = band[0] - h.level;
    if (!W || under < 2) continue;
    const who = whoOf(h);
    if (tier === 'dangerous' && under <= 3) rows.push(row('weight', 'Under the band on Dangerous: net gold', who, Math.round(h.profitPerH) + ' g/h', '<= ' + W.dangerousUnder.netMax, h.profitPerH <= W.dangerousUnder.netMax));
    if (tier === 'deadly' || under >= 5) {
      rows.push(row('weight', 'Under the band on ' + TIER_NAME[tier] + ': dies', who, h.deaths, '>= ' + W.deadlyUnder.deathsMin + ' in the sample', h.deaths >= W.deadlyUnder.deathsMin));
      rows.push(row('weight', 'Under the band on ' + TIER_NAME[tier] + ': net gold', who, Math.round(h.profitPerH) + ' g/h', '<= ' + W.deadlyUnder.netMax, h.profitPerH <= W.deadlyUnder.netMax));
    }
  }
  const TT = S.tiers && S.tiers[tier];
  if (!TT) { notes.push('The tier lines need the target sheet (src/data/balance-sheet.js) in the bundle.'); return { source: sheetSource(), notes, rows }; }
  const inBand = run.heroes.every((h) => h.level >= band[0] && h.level <= band[1]);
  if (!inBand) notes.push('The tier lines read heroes inside the band (' + band[0] + '-' + band[1] + ').');
  const nx = x.normal && x.normal.heroes;
  const needNormal = 'tick "Also play Normal" to read it';
  /* ONE DIFFICULTY FOR EVERY GROUP (RULED 2026-11-08): the same line for one hero or four, read only when the group held the tier */
  const held = run.heroes.every((h) => h.deaths === 0);
  if (inBand && held) {
    const head = run.heroes.reduce((s, h) => s + h.levelXpPerH, 0) / n;
    const base = nx ? nx.reduce((s, h) => s + h.levelXpPerH, 0) / nx.length : null;
    const r = base > 0 ? head / base : null;
    rows.push(row('tier', 'Level XP a head vs the same group on Normal (it held)', n === 1 ? whoOf(run.heroes[0]) : 'party of ' + n, pctTxt(r), '>= ' + pct(TT.xpVsNormalMin) + '%', r === null ? null : r >= TT.xpVsNormalMin, r === null ? needNormal : null));
  }
  if (inBand && n === 4 && tier === 'deadly') {
    const deaths = run.heroes.reduce((s, h) => s + h.deaths, 0), hours = run.party.hours || 1e-9;
    const per16 = (16 * deaths) / hours;
    rows.push(row('tier', 'The four\'s deaths per 16 h', 'party of 4', Math.round(per16 * 100) / 100, '<= ' + TT.fourDeathsPer16hMax, per16 <= TT.fourDeathsPer16hMax));
  }
  if (!rows.length) notes.push('No tier line covers this run on ' + TIER_NAME[tier] + ' (the sheet reads a group that held the tier in the band, and a four\'s deaths on Deadly).');
  return { source: sheetSource(), notes, rows };
}
