// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/baseline/outcomes.mjs — WHAT THE BASELINE READS OFF ONE SEED OF ONE CELL, AND HOW IT GROUPS THEM
// (Tyler 2026-11-21, the balance baseline request: "capture all meaningful outcomes"; lane/bl-baseline, deliverables 1 and 8).
//
//   OUTCOMES          [id, label, category, unit, better]: every number the baseline keeps, one value a SEED, so a cell carries its own
//                     run-to-run noise (four seeds: mean, standard deviation, standard error). `better` is a direction HINT ('up',
//                     'down' or null): it never judges a change: BL-3's new-game targets do (compare.mjs); it only says which way a move reads
//   CATEGORIES        Tyler's eight report groups, in his order. The first four hold per-seed outcomes; equipment value, hunting
//                     ground viability, solo and party and long-term scaling are VIEWS across cells (compare.mjs views)
//   seedOutcomes      one seed's answer (tools/balance-sim/cell.mjs runCell, the full answer, not the matrix's slim seed) -> { id: number }
//   cellStats         a cell's seeds -> { id: [n, mean, sd] } and the pooled deaths and hours a Poisson reading needs
//
// Every number is read off the engine's own answer. Nothing here plays or computes a fight. A field cell.mjs does not emit is not
// invented: the coverage report (docs/design/balance-baseline/06-coverage.md) lists it as a gap.
// ════════════════════════════════════════════════════════════════════════

export const CATEGORIES = Object.freeze([
  ['combat', 'Combat performance'],
  ['survival', 'Survivability'],
  ['economy', 'Resource economy'],
  ['progression', 'Progression'],
  ['equipment', 'Equipment value'],
  ['grounds', 'Hunting ground viability'],
  ['party', 'Solo and party performance'],
  ['scaling', 'Long-term scaling'],
].map((x) => Object.freeze(x)));
export const CATEGORY_IDS = Object.freeze(CATEGORIES.map(([id]) => id));

const MAIN = Object.freeze({ hammer: 'melee', tank: 'melee', sword: 'melee', axes: 'melee', mage: 'magic', healer: 'magic', bow: 'ranged', crossbow: 'ranged' });
const finite = (x) => typeof x === 'number' && Number.isFinite(x);
const sum = (xs) => xs.reduce((a, b) => a + (finite(b) ? b : 0), 0);
const vals = (o) => Object.values(o || {});
/* hunted hero-hours, offered hero-hours, the party's hunted hours */
const heroHours = (r) => sum(r.heroes.map((h) => h.hours));
const wallHours = (r) => sum(r.heroes.map((h) => (finite(h.wallHours) ? h.wallHours : h.hours)));
/* a per-hour field of each hero, weighted by the hours it hunted: a rate a hunted hero-hour */
const perHeroHour = (r, f) => { const t = heroHours(r); return t > 0 ? sum(r.heroes.map((h) => (f(h) || 0) * h.hours)) / t : null; };
/* a raw total of each hero over the hunted hero-hours */
const totalPerHeroHour = (r, f) => { const t = heroHours(r); return t > 0 ? sum(r.heroes.map((h) => f(h) || 0)) / t : null; };
const totalPerWallHour = (r, f) => { const t = wallHours(r); return t > 0 ? sum(r.heroes.map((h) => f(h) || 0)) / t : null; };
const minSeat = (r, f) => { const xs = r.heroes.map(f).filter(finite); return xs.length ? Math.min(...xs) : null; };
const maxSeat = (r, f) => { const xs = r.heroes.map(f).filter(finite); return xs.length ? Math.max(...xs) : null; };
const ratio = (a, b) => (finite(a) && finite(b) && b !== 0 ? a / b : null);
const raw = (h, k) => (h.raw && finite(h.raw[k]) ? h.raw[k] : 0);
const skillTotal = (h, k) => (h.raw && h.raw.skillXp && finite(h.raw.skillXp[k]) ? h.raw.skillXp[k] : 0);

/* [id, label, category, unit, better, read(seedAnswer, ctx)]. ctx: { toNext (Level XP from the cell's Level to the next, the tree's curve),
   contract (the tree's contract XP an hour at the Level) } */
const DEF = [
  /* ── COMBAT PERFORMANCE ── */
  ['dps', 'Party damage a hunted second (walks and rests inside it)', 'combat', 'damage/s', 'up', (r) => { const ph = r.party.hours; return ph > 0 ? sum(r.heroes.map((h) => (h.dealtPerH || 0) * h.hours)) / (ph * 3600) : null; }],
  ['dealtPerH', 'Damage dealt a hero-hour', 'combat', 'damage/hero-h', 'up', (r) => perHeroHour(r, (h) => h.dealtPerH)],
  ['killsPerH', 'Kills a party-hour', 'combat', 'kills/party-h', 'up', (r) => r.party.killsPerH],
  ['ttkS', 'Seconds to kill, median', 'combat', 's', 'down', (r) => (r.party.ttkS ? r.party.ttkS.p50 : null)],
  ['ttkP90S', 'Seconds to kill, slowest tenth', 'combat', 's', 'down', (r) => (r.party.ttkS ? r.party.ttkS.p90 : null)],
  ['pullsPerH', 'Pulls a party-hour', 'combat', 'pulls/party-h', null, (r) => r.party.pullsPerH],
  ['castsPerH', 'Spells cast a hero-hour', 'combat', 'casts/hero-h', null, (r) => perHeroHour(r, (h) => sum(vals(h.castsPerH)))],
  /* ── SURVIVABILITY ── */
  ['takenPerH', 'Damage taken a hero-hour', 'survival', 'damage/hero-h', 'down', (r) => perHeroHour(r, (h) => h.takenPerH)],
  ['frontTakenShare', 'The front seat\'s share of the damage taken (parties)', 'survival', 'share', null, (r) => {
    if (r.heroes.length < 2) return null;
    const all = sum(r.heroes.map((h) => (h.takenPerH || 0) * h.hours));
    return all > 0 ? ((r.heroes[0].takenPerH || 0) * r.heroes[0].hours) / all : null;
  }],
  ['monsterLandedPct', 'Monster blows that land, % (hero-hour weighted)', 'survival', '%', 'down', (r) => perHeroHour(r, (h) => h.landedPct)],
  ['dmgPerMonsterSwing', 'Damage a monster swing', 'survival', 'damage', 'down', (r) => perHeroHour(r, (h) => h.dmgPerMonsterSwing)],
  ['healInPerH', 'Healing received a hero-hour (food, own and ally spells)', 'survival', 'hp/hero-h', null, (r) => perHeroHour(r, (h) => (h.healInPerH ? h.healInPerH.total : 0))],
  ['healOutPerH', 'Healing given to allies a hero-hour', 'survival', 'hp/hero-h', null, (r) => perHeroHour(r, (h) => h.healOutPerH)],
  ['shieldInPerH', 'Shield absorbed a hero-hour', 'survival', 'hp/hero-h', null, (r) => perHeroHour(r, (h) => h.shieldInPerH)],
  ['regenPerH', 'Regeneration a hero-hour (inferred: the engine emits no event)', 'survival', 'hp/hero-h', null, (r) => perHeroHour(r, (h) => h.regenPerH)],
  ['sustainRatio', 'Healing and regeneration over damage taken', 'survival', 'ratio', null, (r) => ratio(sum(r.heroes.map((h) => ((h.healInPerH ? h.healInPerH.total : 0) + (h.regenPerH || 0)) * h.hours)), sum(r.heroes.map((h) => (h.takenPerH || 0) * h.hours)))],
  ['deaths', 'Deaths (count; pooled with the hours for a rate)', 'survival', 'deaths', 'down', (r) => sum(r.heroes.map((h) => h.deaths))],
  ['deathsPer1000h', 'Deaths in 1,000 hunted hero-hours', 'survival', 'deaths/1000 hero-h', 'down', (r) => { const t = heroHours(r); return t > 0 ? (1000 * sum(r.heroes.map((h) => h.deaths))) / t : null; }],
  ['huntedShare', 'Share of the offered time hunted (a death, a bar or a purse ends a hunt)', 'survival', 'share', 'up', (r) => ratio(heroHours(r), wallHours(r))],
  ['lowHpP50', 'Lowest health of a fight, typical (the worst seat\'s median)', 'survival', 'share of max', 'up', (r) => { const x = minSeat(r, (h) => (h.encMinHpPct ? h.encMinHpPct.p50 : null)); return finite(x) ? x / 100 : null; }],
  ['lowHpP10', 'Lowest health of a fight, the worst tenth (worst seat)', 'survival', 'share of max', 'up', (r) => { const x = minSeat(r, (h) => (h.encMinHpPct ? h.encMinHpPct.p10 : null)); return finite(x) ? x / 100 : null; }],
  ['lowHpP01', 'Lowest health of a fight, the worst hundredth (worst seat)', 'survival', 'share of max', 'up', (r) => { const x = minSeat(r, (h) => (h.encMinHpPct ? h.encMinHpPct.p01 : null)); return finite(x) ? x / 100 : null; }],
  ['hpUnder30', 'Share of hunted time under 30% health (worst seat)', 'survival', 'share', 'down', (r) => maxSeat(r, (h) => (h.hpUnder ? h.hpUnder.p30 : null))],
  ['hpUnder10', 'Share of hunted time under 10% health (worst seat)', 'survival', 'share', 'down', (r) => maxSeat(r, (h) => (h.hpUnder ? h.hpUnder.p10 : null))],
  ['closeCallsPer12h', 'Fights that dipped under 25% health, per 12 hero-hours', 'survival', 'per 12 hero-h', 'down', (r) => { const t = heroHours(r); return t > 0 ? (12 * sum(r.heroes.map((h) => (h.closeCallsPer12h ? h.closeCallsPer12h.k : 0)))) / t : null; }],
  /* ── RESOURCE ECONOMY (gold is the engine's vendor value: every drop sold at once, the purse never empties; 06-coverage) ── */
  ['coinPerH', 'Coin a hero-hour', 'economy', 'gold/hero-h', 'up', (r) => totalPerHeroHour(r, (h) => raw(h, 'coin'))],
  ['lootPerH', 'Loot at vendor value a hero-hour (common to scarce)', 'economy', 'gold/hero-h', 'up', (r) => totalPerHeroHour(r, (h) => raw(h, 'income') - raw(h, 'coin'))],
  ['incomePerH', 'Gold in a hero-hour (coin and loot)', 'economy', 'gold/hero-h', 'up', (r) => totalPerHeroHour(r, (h) => raw(h, 'income'))],
  ['raresValuePerH', 'Rare and trophy drops at vendor value a hero-hour', 'economy', 'gold/hero-h', 'up', (r) => totalPerHeroHour(r, (h) => raw(h, 'rares'))],
  ['storePerH', 'Gold out on store supplies a hero-hour', 'economy', 'gold/hero-h', 'down', (r) => totalPerHeroHour(r, (h) => raw(h, 'store'))],
  ['blessingGoldPerH', 'Gold out on Blessings bought again after deaths a hero-hour', 'economy', 'gold/hero-h', 'down', (r) => totalPerHeroHour(r, (h) => raw(h, 'blessingGold'))],
  ['netPerH', 'Net gold a hero-hour (in less store and Blessings; no home-made share)', 'economy', 'gold/hero-h', 'up', (r) => totalPerHeroHour(r, (h) => raw(h, 'income') - raw(h, 'store') - raw(h, 'blessingGold'))],
  ['netWithRaresPerH', 'Net gold with rares at vendor value a hero-hour', 'economy', 'gold/hero-h', 'up', (r) => totalPerHeroHour(r, (h) => raw(h, 'income') + raw(h, 'rares') - raw(h, 'store') - raw(h, 'blessingGold'))],
  ['storeShare', 'Store gold over gold in', 'economy', 'share', 'down', (r) => ratio(sum(r.heroes.map((h) => raw(h, 'store'))), sum(r.heroes.map((h) => raw(h, 'income'))))],
  ['suppliesPerH', 'Store supplies used a hero-hour (units)', 'economy', 'units/hero-h', null, (r) => perHeroHour(r, (h) => sum(vals(h.buysPerH)))],
  ['foodPerH', 'Food eaten a hero-hour (own and store)', 'economy', 'units/hero-h', null, (r) => perHeroHour(r, (h) => (h.eatsPerH ? (h.eatsPerH.own || 0) + (h.eatsPerH.store || 0) : 0))],
  ['manaPotionsPerH', 'Mana drinks a hero-hour (own and store)', 'economy', 'units/hero-h', null, (r) => perHeroHour(r, (h) => (h.drinksPerH ? (h.drinksPerH.own || 0) + (h.drinksPerH.store || 0) : 0))],
  ['manaSpentPerH', 'Mana spent on spells a hero-hour (net of refunds)', 'economy', 'mana/hero-h', null, (r) => perHeroHour(r, (h) => sum(vals(h.castManaPerH)))],
  ['rareItemsPerH', 'Rare drops a hero-hour (the engine\'s rare-drop hints)', 'economy', 'items/hero-h', 'up', (r) => totalPerHeroHour(r, (h) => h.rareItems)],
  ['rareRollsPerPartyH', 'Rare-table rolls won a party-hour', 'economy', 'rolls/party-h', 'up', (r) => (r.party.hours > 0 ? (r.party.rareRolls || 0) / r.party.hours : null)],
  /* ── PROGRESSION ── */
  ['levelXpPerH', 'Level XP a hunted hero-hour', 'progression', 'xp/hero-h', 'up', (r) => totalPerHeroHour(r, (h) => raw(h, 'levelXp'))],
  ['netLevelXpPerH', 'Level XP after deaths (Blessings cut) an offered hero-hour', 'progression', 'xp/hero-h', 'up', (r) => totalPerWallHour(r, (h) => raw(h, 'levelXp') - raw(h, 'xpLostLevelBlessed'))],
  ['hoursPerLevel', 'Hours for the next Level (offered hours, after deaths)', 'progression', 'h', 'down', (r, c) => { const x = totalPerWallHour(r, (h) => raw(h, 'levelXp') - raw(h, 'xpLostLevelBlessed')); return finite(c.toNext) && x > 0 ? c.toNext / x : null; }],
  ['xContract', 'Level XP over the pace contract', 'progression', 'ratio', null, (r, c) => ratio(totalPerHeroHour(r, (h) => raw(h, 'levelXp')), c.contract)],
  ['mainSkillXpPerH', 'Main weapon skill XP a hero-hour', 'progression', 'xp/hero-h', 'up', (r) => totalPerHeroHour(r, (h) => skillTotal(h, MAIN[h.style] || 'melee'))],
  ['defenseXpPerH', 'Defense XP a hero-hour', 'progression', 'xp/hero-h', 'up', (r) => totalPerHeroHour(r, (h) => skillTotal(h, 'defense'))],
  ['meleeXpPerH', 'Melee XP a hero-hour (every seat)', 'progression', 'xp/hero-h', null, (r) => totalPerHeroHour(r, (h) => skillTotal(h, 'melee'))],
  ['rangedXpPerH', 'Ranged XP a hero-hour (every seat)', 'progression', 'xp/hero-h', null, (r) => totalPerHeroHour(r, (h) => skillTotal(h, 'ranged'))],
  ['magicXpPerH', 'Magic XP a hero-hour (every seat)', 'progression', 'xp/hero-h', null, (r) => totalPerHeroHour(r, (h) => skillTotal(h, 'magic'))],
  ['levelXpLostPerH', 'Level XP deaths took (Blessings cut) an offered hero-hour', 'progression', 'xp/hero-h', 'down', (r) => totalPerWallHour(r, (h) => raw(h, 'xpLostLevelBlessed'))],
  ['deathTax', 'Level XP deaths took over Level XP earned', 'progression', 'share', 'down', (r) => ratio(sum(r.heroes.map((h) => raw(h, 'xpLostLevelBlessed'))), sum(r.heroes.map((h) => raw(h, 'levelXp'))))],
];

export const OUTCOMES = Object.freeze(DEF.map(([id, label, category, unit, better]) => Object.freeze([id, label, category, unit, better])));
export const OUTCOME_IDS = Object.freeze(OUTCOMES.map((o) => o[0]));
const READ = new Map(DEF.map((d) => [d[0], d[5]]));
export const outcomeById = (id) => OUTCOMES.find((o) => o[0] === id) || null;

/** One seed's outcomes: { id: number | null } in OUTCOMES order. `res` is runCell's answer for one seed; ctx { toNext, contract }. */
export function seedOutcomes(res, ctx = {}) {
  const out = {};
  for (const [id] of OUTCOMES) {
    let v;
    try { v = READ.get(id)(res, ctx); } catch { v = null; }
    out[id] = finite(v) ? Number(v.toPrecision(6)) : null;
  }
  /* the exposure the pooled rates need: hunted hero-hours and offered hero-hours */
  out._hh = Number(heroHours(res).toFixed(4));
  out._wall = Number(wallHours(res).toFixed(4));
  return out;
}

/** Mean, standard deviation (n - 1) and count of the finite values. */
export function moments(xs) {
  const v = xs.filter(finite);
  const n = v.length;
  if (!n) return [0, null, null];
  const mean = v.reduce((a, b) => a + b, 0) / n;
  const sd = n > 1 ? Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : null;
  return [n, mean, sd];
}

/** A cell's seeds (seedOutcomes each) -> { stats: { id: [n, mean, sd] }, deaths, hh, wall } (deaths and hours pooled for Poisson rates). */
export function cellStats(seeds) {
  const stats = {};
  for (const [id] of OUTCOMES) stats[id] = moments(seeds.map((s) => s[id])).map((x) => (finite(x) ? Number(x.toPrecision(6)) : x));
  return { stats, deaths: sum(seeds.map((s) => s.deaths)), hh: Number(sum(seeds.map((s) => s._hh)).toFixed(3)), wall: Number(sum(seeds.map((s) => s._wall)).toFixed(3)) };
}
