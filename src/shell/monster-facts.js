// ════════════════════════════════════════════════════════════════════════
// src/shell/monster-facts.js — ONE MONSTER'S FACTS, FROM THE ROWS THE ENGINE FIGHTS WITH.
//
// Tyler 2026-11-09: every monster's stats are visible in the game, so players choose their own hunts; and
// (2026-11-08) the formulas are public. PURE, no DOM: the page (src/shell/windows/monster.js) only writes
// what this answers, and this types no number of its own. Each fact is read from the row the server's
// catalogue is generated from (src/data/monsters.js), through the function the engine itself calls:
//   Health        the row's HP on Normal (hunt-tiers.js atTier), the same for every group size (Tyler 2026-11-08)
//   Max Hit       combat.js monsterMaxHit, the ceiling the engine rolls a landed blow under (the game's label, Tyler 2026-11-11)
//   how often     combat.js COMBAT_BALANCE.tickMs, the one basic-attack interval
//   its damage    physical: the engine gives a monster's blow no element (hunt-spawn.js)
//   weak to       the row's weaponWeak, paid by combat.js WEAKNESS_BONUS
//   elements      core/elements.js elementPermille, for each element of data/elements.js
//   a kill pays   the row's xp and gp, whole, shared by who was there (hunt-rewards.js payKill)
//   drops         every row of its table, its chance on one kill by the roller's own sum (drops.js
//                 effectiveDropChance) with the monster's own drop bonus (combat.js weaknessInfo),
//                 before any hero's bonus; and what the item is for (item-lore.js: the windows that spend
//                 it, each a place a link opens, then its other uses in the item tip's words)
//   where         the open grounds it stands on, or that a bigger pull brings it to (hunt-ground-facts.js)
// ONE DIFFICULTY FOR EVERY GROUP SIZE (Tyler 2026-11-08): the numbers are Normal's, the same alone or in a party.
// A boss whose hall is built for a group says so in the Hunts list's own words (hunt-list.js partyNote). A harder hunt's dials are the Hunts page's to say. A server-revealed surprise row
// (`lucky`, `salvage`) stays unlisted, as on the ground's page.
// ════════════════════════════════════════════════════════════════════════
import { MONSTERS, monsterLevelOf } from '../data/monsters.js?v=0.2.119';
import { ITEMS } from '../data/items.js?v=0.2.119';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.119';
import { OPEN_GROUNDS } from '../data/hunt-grounds.js?v=0.2.119';
import { DEFAULT_TIER, atTier, tierRowOf } from '../data/hunt-tiers.js?v=0.2.119';
import { partyNote } from './hunt-list.js?v=0.2.119';
import { ELEMENTS, PHYSICAL } from '../data/elements.js?v=0.2.119';
import { elementPermille } from '../core/elements.js?v=0.2.119';
import { COMBAT_BALANCE, WEAKNESS_BONUS, monsterMaxHit, weaknessInfo } from '../core/combat.js?v=0.2.119';
import { bandOf, effectiveDropChance } from '../core/drops.js?v=0.2.119';
import { residentsOf, bigPullOf } from './hunt-ground-facts.js?v=0.2.119';
import { usePlaces, usesOf } from './item-lore.js?v=0.2.119';
import { skillName } from './widgets/bits.js?v=0.2.119';
import { t } from '../render/player-text.js?v=0.2.119';

const pctOf = (mult) => Math.round((mult - 1) * 100);

/**
 * The open grounds monster `id` lives on, lowest floor first: [{ hunt, name, band: [lo, hi], how, warn, ground }].
 * `how` is its share of the spawn points in words ('common' | 'uncommon' | 'rare'), 'boss', or 'pull' for a creature
 * only a party or a harder hunt brings. `warn`: for a boss whose hall is built for a group, the Hunts list's warning; else ''.
 */
export function homesOf(id) {
  const out = [];
  for (const g of Object.values(OPEN_GROUNDS)) {
    const here = residentsOf(g.hunt).find((r) => r.id === id);
    if (!here && !bigPullOf(g.hunt).some((r) => r.id === id)) continue;
    const row = HUNT_INDEX[g.hunt] || {};
    const grouped = !!here && here.boss && g.pockets.some((p) => p.forParty && p.spawns.some((s) => s.monster === id));
    out.push({ hunt: g.hunt, name: row.name || g.hunt, band: row.band || null, ground: g,
      how: !here ? 'pull' : here.boss ? 'boss' : here.band, warn: grouped ? partyNote(g.hunt) : '' });
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
 * Monster `id`'s facts on Normal, the same for every group size, or null for a monster no open ground holds:
 * { id, name, family, level, boss, hp, maxHit, swingMs, deals, weak: { weapon, damagePct, accuracyPct } | null,
 *   elements: [{ element, pct }] (pct LESS taken, negative = more), xp, gold: [lo, hi],
 *   drops: [{ id, name, band, chance, uses: [{ words, place }] }], homes (homesOf) }.
 */
export function monsterFactsOf(id) {
  if (!isMet(id)) return null;
  const row = MONSTERS[id];
  const homes = homesOf(id);
  const home = homes[0];
  /* the row as it fights on Normal: the engine's own read (pull-cycle.js spawns it so) */
  const fights = atTier(row, tierRowOf(home.ground.id, DEFAULT_TIER));
  const top = monsterMaxHit(fights);
  const weak = weaknessInfo(row, { weaponType: row.weaponWeak });
  const lone = weaknessInfo(row, null);
  return {
    id, name: row.name || id, family: row.className || row.family || '', level: monsterLevelOf(row), boss: row.boss === true,
    hp: Math.max(1, fights.hp || 1),
    maxHit: top,
    swingMs: COMBAT_BALANCE.tickMs,
    deals: PHYSICAL,
    weak: weak.matched ? { weapon: row.weaponWeak, damagePct: pctOf(WEAKNESS_BONUS.damage), accuracyPct: pctOf(weak.accuracyMult) } : null,
    elements: ELEMENTS.map((element) => ({ element, pct: (1000 - elementPermille(row, element)) / 10 })).filter((e) => e.pct !== 0),
    xp: Math.round(fights.xp || 0),
    gold: Array.isArray(row.gp) ? [row.gp[0], row.gp[1]] : [0, 0],
    drops: (row.drops || []).filter((d) => d && d.id && d.lucky !== true && d.salvage !== true).map((d) => ({
      id: d.id, name: (ITEMS[d.id] && ITEMS[d.id].n) || d.id, band: bandOf(d),
      chance: effectiveDropChance(d, { dropMult: lone.dropMult }),
      uses: usesFor(d.id),
    })),
    homes,
  };
}
