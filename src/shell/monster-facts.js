// ════════════════════════════════════════════════════════════════════════
// src/shell/monster-facts.js — ONE MONSTER'S FACTS, FROM THE ROWS THE ENGINE FIGHTS WITH.
//
// Tyler 2026-11-09: every monster's stats are visible in the game, so players choose their own hunts; and
// (2026-11-08) the formulas are public. PURE, no DOM: the page (src/shell/windows/monster.js) only writes
// what this answers, and this types no number of its own. Each fact is read from the row the server's
// catalogue is generated from (src/data/monsters.js), through the function the engine itself calls:
//   Health        hunt-grounds.js packHpFor: the row's HP at the party's size on its ground
//   a blow        combat.js monsterMaxHit, and the roller's own floor and ceiling (rollAttack)
//   how often     combat.js COMBAT_BALANCE.tickMs, the one basic-attack interval
//   its damage    physical: the engine gives a monster's blow no element (hunt-spawn.js)
//   weak to       the row's weaponWeak, paid by combat.js WEAKNESS_BONUS
//   elements      core/elements.js elementPermille, for each element of data/elements.js
//   a kill pays   the row's xp and gp at the kill's yield share (hunt-grounds.js yieldPermille; hunt-rewards.js payKill)
//   drops         every row of its table, its chance on one kill by the roller's own sum (drops.js
//                 effectiveDropChance) with the monster's own drop bonus (combat.js weaknessInfo) and the yield
//                 share, before any hero's bonus; and what the item is for (item-lore.js: the windows that spend
//                 it, each a place a link opens, then its other uses in the item tip's words)
//   where         the open grounds it stands on, or that a bigger pull brings it to (hunt-ground-facts.js)
// The numbers are Normal's, at the party size asked for; a party-only creature is met by the smallest party
// that reaches it. A harder hunt's dials are the Hunts page's to say. A server-revealed surprise row
// (`lucky`, `salvage`) stays unlisted, as on the ground's page.
// ════════════════════════════════════════════════════════════════════════
import { MONSTERS, monsterLevelOf } from '../data/monsters.js?v=0.2.112';
import { ITEMS } from '../data/items.js?v=0.2.112';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.112';
import { OPEN_GROUNDS, PARTY_SCALE, packHpFor, yieldPermille } from '../data/hunt-grounds.js?v=0.2.112';
import { ELEMENTS, PHYSICAL } from '../data/elements.js?v=0.2.112';
import { elementPermille } from '../core/elements.js?v=0.2.112';
import { COMBAT_BALANCE, WEAKNESS_BONUS, monsterMaxHit, rollAttack, weaknessInfo } from '../core/combat.js?v=0.2.112';
import { bandOf, effectiveDropChance } from '../core/drops.js?v=0.2.112';
import { residentsOf, bigPullOf } from './hunt-ground-facts.js?v=0.2.112';
import { usePlaces, usesOf } from './item-lore.js?v=0.2.112';
import { skillName } from './widgets/bits.js?v=0.2.112';
import { t } from '../render/player-text.js?v=0.2.112';

const pctOf = (mult) => Math.round((mult - 1) * 100);
/* The roller's own two ends: a blow that lands, drawn at its lowest and at its highest. */
const LOWEST = Object.freeze({ chance: () => true, int: (lo) => lo });
const HIGHEST = Object.freeze({ chance: () => true, int: (lo, hi) => hi });

/**
 * The open grounds monster `id` lives on, lowest floor first: [{ hunt, name, band: [lo, hi], how, minParty, ground }].
 * `how` is its share of the spawn points in words ('common' | 'uncommon' | 'rare'), 'boss', or 'pull' for a creature
 * only a party or a harder hunt brings. `minParty`: the smallest party that walks a pocket holding it.
 */
export function homesOf(id) {
  const out = [];
  for (const g of Object.values(OPEN_GROUNDS)) {
    const here = residentsOf(g.hunt).find((r) => r.id === id);
    if (!here && !bigPullOf(g.hunt).some((r) => r.id === id)) continue;
    const row = HUNT_INDEX[g.hunt] || {};
    const need = g.pockets.filter((p) => p.spawns.some((s) => s.monster === id)).map((p) => p.minParty || 1);
    out.push({ hunt: g.hunt, name: row.name || g.hunt, band: row.band || null, ground: g,
      how: !here ? 'pull' : here.boss ? 'boss' : here.band, minParty: need.length ? Math.min(...need) : 1 });
  }
  return out.sort((a, b) => ((a.band || [0])[0] - (b.band || [0])[0]) || (a.name < b.name ? -1 : 1));
}

/** Is `id` a monster a player can meet (it lives on an open ground)? The page shows no other. */
export function isMet(id) {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(MONSTERS, id) && homesOf(id).length > 0;
}

/* What a dropped item is for: the windows that spend it (each a place a link opens), then the uses no window stands for
   (burn it, eat it, wear it, sell it), in the item tip's own words. A line the tip writes for a place already linked is left out:
   it is found by the same text rows the tip reads, never by its wording. */
function usesFor(item) {
  const places = usePlaces(item);
  const said = new Set([t('item.plant_it'), t('item.house_asks'), t('item.temper_asks')]);
  const heads = places.filter((p) => p.place && p.place.kind === 'work').map((p) => t('item.used_in', { skill: skillName(p.place.skill), items: '' }));
  const rest = usesOf(item).filter((words) => !places.length || (!said.has(words) && !heads.some((h) => words.startsWith(h))));
  return places.concat(rest.map((words) => ({ words, place: null })));
}

/**
 * Monster `id`'s facts for a party of `size` (default alone), on Normal, or null for a monster no open ground holds:
 * { id, name, family, level, boss, size (the party it is met by), scaled (its Health and pay move with the party's size),
 *   maxParty, hp, blow: { min, max }, swingMs, deals, weak: { weapon, damagePct, accuracyPct } | null,
 *   elements: [{ element, pct }] (pct LESS taken, negative = more), xp, gold: [lo, hi],
 *   drops: [{ id, name, band, chance, uses: [{ words, place }] }], homes (homesOf) }.
 */
export function monsterFactsOf(id, size) {
  if (!isMet(id)) return null;
  const row = MONSTERS[id];
  const homes = homesOf(id);
  const home = homes[0];
  const met = Math.max(Math.max(1, Math.floor(Number(size) || 1)), home.minParty);
  const scaled = home.ground.partyScale === true;
  const yieldPm = scaled ? yieldPermille(met) : 1000;
  const top = monsterMaxHit(row);
  const weak = weaknessInfo(row, { weaponType: row.weaponWeak });
  const lone = weaknessInfo(row, null);
  return {
    id, name: row.name || id, family: row.className || row.family || '', level: monsterLevelOf(row), boss: row.boss === true,
    size: met, scaled, maxParty: PARTY_SCALE.maxHeroes,
    hp: packHpFor(home.ground, row, met),
    blow: { min: rollAttack(LOWEST, 1, top), max: rollAttack(HIGHEST, 1, top) },
    swingMs: COMBAT_BALANCE.tickMs,
    deals: PHYSICAL,
    weak: weak.matched ? { weapon: row.weaponWeak, damagePct: pctOf(WEAKNESS_BONUS.damage), accuracyPct: pctOf(weak.accuracyMult) } : null,
    elements: ELEMENTS.map((element) => ({ element, pct: (1000 - elementPermille(row, element)) / 10 })).filter((e) => e.pct !== 0),
    xp: Math.round(((row.xp || 0) * yieldPm) / 1000),
    /* payKill's own sum: the draw times the share, rounded */
    gold: Array.isArray(row.gp) ? [Math.round(row.gp[0] * (yieldPm / 1000)), Math.round(row.gp[1] * (yieldPm / 1000))] : [0, 0],
    drops: (row.drops || []).filter((d) => d && d.id && d.lucky !== true && d.salvage !== true).map((d) => ({
      id: d.id, name: (ITEMS[d.id] && ITEMS[d.id].n) || d.id, band: bandOf(d),
      chance: effectiveDropChance(d, { dropMult: lone.dropMult, yieldMult: yieldPm / 1000 }),
      uses: usesFor(d.id),
    })),
    homes,
  };
}
