// ════════════════════════════════════════════════════════════════════════
// src/data/reveals.js — WHEN EACH DOOR, CARD AND SKILL FIRST APPEARS.
//
// One row per surface the one-spine design gates (src/data/spine.js). A row
// SHOWS when its `step` has arrived (every earlier step done, or any later one
// done), OR when one of its `uses` facts is true: the server says the player
// already uses it. Both halves are server facts, both only grow, so a reveal
// is never taken back and needs no stored client flag.
//
// ID NAMESPACES (tests/reveal-coverage.mjs checks every one against its owner):
//   pane:<tab>    a pane of a rail door (src/nav-consolidation.js HUBS). A door
//                 shows when any of its panes does.
//   war:<id>      a destination card on the Combat war table
//                 (src/features/combat-screens.js destinations(), field `rid`).
//   skill:<id>    a tile on the Skills list, one per src/data/skills.js row.
//   card:<id>     a Home card or a chrome element; every one is named at a
//                 `revealed('card:…')` call site somewhere under src/.
//
// `step` 0 is open from the first minute, whatever the server has said.
// `product` names an unreleased feature: the row stays shut until it is live.
// `uses` vocabulary (src/core/spine-progress.js evaluates it):
//   count(key, min)   a permanent `stat` progress row
//   skill(id)         server XP above the character's starting XP
//   property(min) · workers(min) · companions(min)
//   holds(ids)        any of these items in the server's bag
// PURE ESM. No DOM, no window.
// ════════════════════════════════════════════════════════════════════════

import { DUNGEONS } from './dungeons.js?v=576';
import { count, property, workers, companions } from './spine.js?v=576';

const skill = (id) => Object.freeze({ fact: 'skill', id });
const holds = (ids) => Object.freeze({ fact: 'holds', ids: Object.freeze(ids.slice()) });
const row = (id, step, uses, product) => Object.freeze({ id, step, uses: Object.freeze(uses || []), product: product || null });

/* A dungeon key in the bag reveals the dungeon door and card at any step. */
export const DUNGEON_KEYS = Object.freeze([...new Set(Object.values(DUNGEONS)
  .map((d) => d && d.cost && d.cost.key).filter(Boolean))]);

const COMBAT_SKILLS = ['attack', 'strength', 'defense', 'hitpoints', 'ranged', 'magic', 'prayer'];
const fought = [count('ev:kill_any', 1)].concat(COMBAT_SKILLS.map(skill));
const bountied = [count('bounty_turnins', 1), skill('bountyHunter')];

export const REVEALS = Object.freeze([
  // ── rail panes ─────────────────────────────────────────────────────────
  row('pane:profile', 1),
  row('pane:character', 1),
  row('pane:inventory', 1),
  row('pane:skills', 1),
  row('pane:shop', 0),
  row('card:discord', 0),
  // Tyler: the Player Market is there from minute 0 for every hero, like the Local Shop.
  row('pane:market', 0),
  row('pane:journal', 3, [count('ev:kill_any', 1), count('rare_drops', 1)]),
  row('pane:combat', 3, fought),
  row('pane:farming', 4, [count('ev:planted', 1), skill('farming')]),
  row('pane:house', 5, [property(1)]),
  row('pane:stable', 10, [companions(1)]),
  row('pane:bounty', 9, bountied),
  row('pane:dungeons', 9, [holds(DUNGEON_KEYS)]),
  row('pane:clan', 10, [], 'clans'),
  row('pane:party', 10),
  row('pane:events', 10),
  row('pane:social', 10),
  // The World pane ships behind its own switch (src/features/world-panel.js WORLD_LAUNCHED).
  row('pane:world', 1, [], 'world'),

  // ── Combat war table ───────────────────────────────────────────────────
  row('war:botd', 3, fought),
  row('war:weekly', 3, fought),
  row('war:bounty', 9, bountied),
  row('war:dungeon', 9, [holds(DUNGEON_KEYS)]),
  row('war:clanhunt', 10, [], 'clans'),
  row('war:worldevent', 10),
  /* From the last step on, the war table also shows the ONE nearest card
     beyond the ten-level window: the next thing worth climbing toward. */
  row('war:next', 10),

  // ── Skills list ────────────────────────────────────────────────────────
  row('skill:woodcutting', 1, [skill('woodcutting')]),
  row('skill:fishing', 2, [skill('fishing')]),
  row('skill:cooking', 2, [skill('cooking')]),
  ...COMBAT_SKILLS.map((id) => row('skill:' + id, 3, [skill(id)])),
  row('skill:farming', 4, [skill('farming')]),
  row('skill:mining', 5, [skill('mining')]),
  row('skill:crafting', 7, [skill('crafting')]),
  row('skill:smithing', 7, [skill('smithing')]),
  row('skill:bountyHunter', 9, bountied),
  row('skill:runecrafting', 10, [skill('runecrafting')]),
  row('skill:stonemason', 13, [skill('stonemason')]),

  // ── Home cards and chrome ──────────────────────────────────────────────
  row('card:upkeep', 2),
  row('card:collection', 3, [count('ev:kill_any', 1), count('rare_drops', 1)]),
  row('card:come-back', 4, [count('ev:planted', 1)]),
  row('card:holding', 5, [property(1)]),
  row('card:renown', 5, [property(1)]),
  row('card:workers', 6, [workers(1)]),
  row('card:recipe-book', 7, [count('crafted', 1), count('smithed', 1)]),
  row('card:quests-chip', 8),
  row('card:vigour', 9),
  row('card:realm', 10),
  row('card:heroes', 10),
]);

export const REVEAL_BY_ID = Object.freeze(Object.fromEntries(REVEALS.map((r) => [r.id, r])));
