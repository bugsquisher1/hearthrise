// ════════════════════════════════════════════════════════════════════════
// src/data/monster-spells.js — THE MONSTERS' SPELLS (Tyler 2026-11-08: "the point of Monsters having aoe spells is so
// the whole party takes damage", "the tank absorbing the boss hits and the casters dodging it", "transparent about the
// damage and other formulas ... in an in game wiki"; design: docs/planning/PRIORITY_BOARD.md "2026-11-08 Area spells" §3)
//
// One row per spell, keyed by its id. A MONSTERS row names its spells as a list (`spells: ['venom_spray']`, a boss one of
// each kind); a monster with none fights exactly as it always has (src/core/hunt/monster-spells.js reads nothing and
// draws nothing for it). The rows are the designer's (lane 2): this file holds the shape of a row, its bounds and the
// formulas the in-game wiki prints, and the engine plays whatever it lists. tests/hunt-core/spell-rows.mjs holds the rows to the
// design (every row valid, every monster's ids real, each caster where the design put it).
//
// THE ROW: { n, shape, r? | len?, range, windupMs, cdMs, hitPm, element }
//   n          the spell's name, as the combat log and the bestiary say it
//   shape      a src/core/hunt/shapes.js kind. A GROUP spell ('group') lands once on every hero in the fight, wherever
//              it stands: nobody steps out of one, and the hero's gear is its answer (resistance: src/core/elements.js
//              heroElementPermille). A MARKED spell fills its tiles first: 'ring' round the caster (r), 'blast' on its
//              target's tile (r), 'cone' toward its target (len), 'line' through it (len). Melee heroes hold and take
//              it, ranged heroes and casters step off (src/core/hunt/roles.js), a worn shield takes SHIELD_BRACE off it
//   range      the most tiles (Chebyshev) from the caster to its target a cast may start at, line of sight past 1
//   windupMs   the warning: it lands this long after it starts, whole sub-steps, at least minWindupMs(row). A Chill on
//              the caster as the cast starts stretches it (statuses.js slowPm)
//   cdMs       from one cast's start to the same spell's next earliest start, longer than its windup
//   hitPm      THE SPELL'S NUMBER: its top hit is hitPm / 1000 times the caster's own biggest normal hit (spellHit)
//   element    an elements.js id, or null (none)
// Every number here is the designer's; the BOUNDS keep a bad row from striking a whole ground or landing unwarned.
//
// MUTABLE LIKE THE ROSTER: the balance sim's what-ifs (tools/balance-sim/worker.mjs) tune a row in place for one job
// and put it back, as they do MONSTERS rows. Nothing at run time writes it.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { HUNT_TUNING } from './hunt-tuning.js?v=0.2.129';
import { isElement } from './elements.js?v=0.2.129';
import { SHAPE_KINDS, shapeProblem } from '../core/hunt/shapes.js?v=0.2.129';
import { GROUND_PACKS } from './grounds/index.js?v=0.2.129';
import { foldRows } from './grounds/shape.js?v=0.2.129';

/* The shapes a monster may cast (a 'square' is an aimed footprint, a hero's); every one but 'group' is MARKED. */
export const SPELL_SHAPES = Object.freeze(['group', 'ring', 'blast', 'cone', 'line']);
/** Is `row` a marked spell (its tiles filled before it lands, stepped off by a free ranged hero)? */
export const marked = (row) => !!row && row.shape !== 'group';

/* THE FAIR WARNING (the design's rule: a free hero can always step off a mark): the least windup is baseMs for a
   radius-1 mark (from its middle a hero walks 2 tiles off, 0.63 s at 3.2 tiles a second) and perRadiusMs more for each
   tile of radius past 1. A cone, a line and a group spell take baseMs (minWindupMs). */
export const FAIR_WARNING = Object.freeze({ baseMs: 1200, perRadiusMs: 400 });
/* THE HIT'S ROLL (spellHit): from lowPm permille of the top to the top. */
export const SPELL_ROLL = Object.freeze({ lowPm: 500 });
/* THE SHIELD'S BRACE (the design's 4K): a hero wearing a shield takes markedPm permille off a MARKED spell's hit, so the
   tank is the right hero to stand in a boss's heavy hit. A group spell is not braced. */
export const SHIELD_BRACE = Object.freeze({ markedPm: 300 });
/* THE FIRST CAST (Tyler 2026-11-08: more monsters means more spells, but a pack must not open with every cast at once and then
   repeat in step): a monster joining a fight waits a random share of each spell's cooldown, from none of it to spanPm permille
   of it, before that spell's first cast. So a pack's casts are spread over the cooldown and each one can be read. No cap on how
   many monsters cast: a bigger pull is more spells. 0 turns the wait off (every spell ready as the fight starts).
   MUTABLE LIKE THE ROWS: a test or a balance what-if sets it for its own run and puts it back. */
export const SPELL_STAGGER = { spanPm: 1000 };
/** THE FIRST CAST (a wiki formula): the most sub-steps a spell's first cast waits, the wait itself a whole number drawn from 0
    to it:  steps = floor(cdMs x SPELL_STAGGER.spanPm / 1000 / stepMs). */
export function firstCastSteps(row) {
  const pm = Number.isInteger(SPELL_STAGGER.spanPm) ? Math.min(1000, Math.max(0, SPELL_STAGGER.spanPm)) : 0;
  return row && Number.isInteger(row.cdMs) ? Math.floor((row.cdMs * pm) / 1000 / HUNT_TUNING.stepMs) : 0;
}
/* How many spells one monster may carry (a boss: its marked hit and its group pulse). */
export const MAX_SPELLS = 2;

export const SPELL_BOUNDS = Object.freeze({
  range: Object.freeze([1, 6]),
  windupMs: Object.freeze([FAIR_WARNING.baseMs, 4000]),
  cdMs: Object.freeze([2000, 120000]),
  hitPm: Object.freeze([100, 4000]),
});

/** THE FAIR WARNING (a wiki formula): the least windup a spell row may have, with r its radius (1 for a cone, a line or
    a group spell):  minWindup = FAIR_WARNING.baseMs + FAIR_WARNING.perRadiusMs x (r - 1). */
export function minWindupMs(row) {
  const r = row && (row.shape === 'ring' || row.shape === 'blast') && Number.isInteger(row.r) ? row.r : 1;
  return FAIR_WARNING.baseMs + FAIR_WARNING.perRadiusMs * (r - 1);
}

/** WHAT A SPELL HITS FOR (a wiki formula): with M the caster's own biggest normal hit at the hunt's tier
    (src/core/combat.js monsterMaxHit of its tier row, an enraged boss's raised one),
      top = max(1, floor(M x hitPm / 1000)),  low = max(1, ceil(top x SPELL_ROLL.lowPm / 1000)),
    and each hero struck rolls a whole number from low to top, with no to-hit roll. Then, as any blow: dodge, absorb,
    the hero's resistance to its element, ward, and the stances; a worn shield takes SHIELD_BRACE.markedPm / 1000 off a
    marked spell. Answers [low, top]. */
export function spellHit(maxHit, row) {
  const top = Math.max(1, Math.floor((Math.max(1, Math.floor(Number(maxHit) || 1)) * row.hitPm) / 1000));
  return [Math.max(1, Math.ceil((top * SPELL_ROLL.lowPm) / 1000)), top];
}

/* THE ROWS (lane/b-area-data, the design's §7 rows as written; its §4 tables are the measures). Whole-group spells are the
   main kind (Tyler 2026-11-08: "so the whole party takes damage"): one on most casters, sized lower on the busy ones (1.5x),
   higher on a rare one (the Turncoat, one pack in six), 0.4x as a boss's pulse on a party built for his room (4L). The
   marked ones are the heavy hits a tank stands in (Tyler 2026-11-08: "the tank absorbing the boss hits and the casters
   dodging it"); a windup costs the caster its swings, so a marked hit on a regular sits at 2x (4F). A boss lists his marked
   hit first, then his pulse (castSpells starts the first one ready). Plain mutable rows: tests and the balance sim's what-ifs
   tune one in place and put it back (header). */
export const MONSTER_SPELLS = {
  /* WHOLE-GROUP: a 2 s warning on every hero, then one hit each that nobody steps out of. */
  smoke_pot: { n: 'Smoke Pot', shape: 'group', range: 6, windupMs: 2000, cdMs: 8000, hitPm: 2500, element: 'ember' },         // the Turncoat (Wickstead): he burned the house. 8 s: he is one pack in six and falls in seconds, and at 16 s a four never saw one in an hour
  /* THE COOLDOWN IS HOW OFTEN A PACK CASTS (lane/d-spell-tuning): a first cast waits a drawn share of it (SPELL_STAGGER), so a caster casts
     in about fight length / cooldown of its fights. 32 s on these two: few casts in a short Normal fight, most casters in a full box's long
     one. At 16 s and 1.5x the Glade's lone tank in plate earned +1% over its bill on its worst seed (the floor's bar is +10%); here +14%. */
  spore_cloud: { n: 'Spore Cloud', shape: 'group', range: 6, windupMs: 2000, cdMs: 32000, hitPm: 1000, element: 'poison' },   // the Walking Vine (the Glade)
  blasting_charge: { n: 'Blasting Charge', shape: 'group', range: 6, windupMs: 2000, cdMs: 32000, hitPm: 1000, element: 'ember' }, // the Goblin Digger (the Warrens): diggers blast the seams
  squeal: { n: 'Squeal', shape: 'group', range: 6, windupMs: 2000, cdMs: 20000, hitPm: 400, element: 'poison' },             // the Rat King's pulse. 4L
  slag_rain: { n: 'Slag Rain', shape: 'group', range: 6, windupMs: 2000, cdMs: 20000, hitPm: 400, element: 'ember' },        // Chief Coppercap's pulse. 4L
  /* MARKED: the tiles fill first; Melee holds and takes it, a free ranged hero or caster steps off, a shield braces it. */
  venom_spray: { n: 'Venom Spray', shape: 'ring', r: 1, range: 1, windupMs: 1600, cdMs: 12000, hitPm: 2000, element: 'poison' }, // the Barn Spider (Wickstead)
  tail_lash: { n: 'Tail Lash', shape: 'cone', len: 2, range: 1, windupMs: 1600, cdMs: 12000, hitPm: 2000, element: null },     // the Rat King. Measured as a ring r2 (4F), not yet as this cone
  slag_toss: { n: 'Slag Toss', shape: 'cone', len: 4, range: 1, windupMs: 1800, cdMs: 14000, hitPm: 1200, element: 'ember' },  // Chief Coppercap. 4F
  /* DODGEABLE ON REGULARS (Tyler 2026-11-08: more spells a hero can step out of, and dodging is where you stand, never a roll):
     one a ground, each a different shape so a ground reads by its mark. The Thicket and the Mill Cellar keep none: a first
     ground teaches the plain fight. 1.5x, under the Spider's 2x: these monsters hit harder to begin with. */
  muck_fling: { n: 'Muck Fling', shape: 'blast', r: 1, range: 4, windupMs: 1600, cdMs: 14000, hitPm: 1500, element: 'poison' },   // the Kobold Tosher (the Sewer): thrown from up to 4 tiles at its target's tile
  poachers_volley: { n: "Poacher's Volley", shape: 'line', len: 4, range: 4, windupMs: 1600, cdMs: 16000, hitPm: 1200, element: null }, // the Glade Poacher: through its target and the heroes lined up behind it
  lash_sweep: { n: 'Lash Sweep', shape: 'cone', len: 2, range: 1, windupMs: 1600, cdMs: 20000, hitPm: 1000, element: null },      // the Hobgoblin Foreman (the Warrens): the two tiles in front of him
  /* Cold Bilge (the Bargeman) is the Slake pack's own row (src/data/grounds/the_slake/pack.js spells). WAITING on its monster: Ash
     Bloom (the Pyre Field's ash caster, not designed yet: group, fire, 1.5x, 16 s). validate refuses a row no monster casts. */
};
/* GROUND PACKS (lane/b-pack-fields): a pack's own spell rows (its `spells`) join this table, a copy each, as its monsters join
   MONSTERS. An id already taken is refused: a pack adds. Still the one table every reader and validate see. */
Object.assign(MONSTER_SPELLS, foldRows('spell', MONSTER_SPELLS, GROUND_PACKS, (p) => Object.fromEntries(Object.entries(p.spells || {}).map(([k, v]) => [k, { ...v }]))));

const own = (id) => typeof id === 'string' && Object.prototype.hasOwnProperty.call(MONSTER_SPELLS, id);
/** The spell row of id `id`, or null. */
export const spellRow = (id) => (own(id) ? MONSTER_SPELLS[id] : null);
/** The spell ids monster row `m` casts, in its own order (a name no row holds is skipped; validate refuses it). */
export const spellsOf = (m) => (m && Array.isArray(m.spells) ? m.spells.filter(own) : []);

/* THE SWITCH (lane/b-area-set): ONE ROW turns every monster's spells on or off, so the feature can ship dark while its balance is
   tuned and be turned on without touching a monster row. Off, `castsOf` answers none: the engine starts no cast, drops one still winding
   up, reads nothing and draws nothing (src/core/hunt/monster-spells.js castSpells), and every hunt plays exactly as it did before the
   spells. The rows stay as written: `spellsOf` still names them, so the design's guards, the bestiary and the wiki read the same table.
   A data row like any other: the edge and the client both carry it, so flipping it is an edge deploy and a client push, never a
   migration (Postgres reads no spell row). The heroes' area abilities are not behind it: a player puts those on the bar.
   MUTABLE LIKE THE ROWS: a test or a balance what-if that needs casts turns it on for its own run and puts it back.
   IT IS ON (lane/d-spell-tuning, 2026-11-10). It shipped off while three money and rung guards were red with the spells on (hunt-core
   drop-tables profit-floor, forest-cave glade-between, first-week-bands weapon-rungs); the rows above are the tuning that turned them
   green, measured on the priority board ("2026-11-10 Spell tuning"). Off again is this one word. */
export const SPELL_SWITCH = { live: true };
/** The spell ids monster row `m` casts NOW: its list while the switch is on, none while it is off. The engine's one read. */
export const castsOf = (m) => (SPELL_SWITCH.live === true ? spellsOf(m) : []);

/** The shape spec a row casts ({ shape, r }, { shape, len } or { shape } for a group spell). */
export const specOf = (row) => {
  const p = SHAPE_KINDS[row.shape] && SHAPE_KINDS[row.shape].param;
  return p ? { shape: row.shape, [p]: row[p] } : { shape: row.shape };
};

const ID = /^[a-z0-9_]{1,32}$/;

/** Every problem with row `row` of id `id`, as strings. Empty = valid. */
export function validateSpell(row, id) {
  if (!row || typeof row !== 'object') return ['spell row is not an object'];
  const out = [];
  const at = 'spell ' + id + ': ';
  if (typeof id !== 'string' || !ID.test(id)) out.push('spell id ' + id + ' is not [a-z0-9_]');
  if (row.id !== undefined && row.id !== id) out.push(at + 'its id field is not its key');
  if (typeof row.n !== 'string' || !row.n) out.push(at + 'needs a name (n)');
  if (!SPELL_SHAPES.includes(row.shape)) out.push(at + 'shape must be one of ' + SPELL_SHAPES.join('/'));
  else {
    const bad = shapeProblem(specOf(row));
    if (bad) out.push(at + bad);
    /* The parameter its shape does not read is a typo, never ignored (`n` is the row's name: a monster casts no square). */
    for (const p of ['r', 'len']) if (p !== SHAPE_KINDS[row.shape].param && row[p] !== undefined) out.push(at + row.shape + ' reads no ' + p);
  }
  for (const [k, [lo, hi]] of Object.entries(SPELL_BOUNDS)) {
    if (!Number.isInteger(row[k]) || row[k] < lo || row[k] > hi) out.push(at + k + ' must be an integer ' + lo + '..' + hi + ', got ' + row[k]);
  }
  for (const k of ['windupMs', 'cdMs']) if (Number.isInteger(row[k]) && row[k] % HUNT_TUNING.stepMs) out.push(at + k + ' is not a whole number of ' + HUNT_TUNING.stepMs + ' ms sub-steps');
  if (Number.isInteger(row.windupMs) && row.windupMs < minWindupMs(row)) out.push(at + 'windupMs ' + row.windupMs + ' is under the fair warning ' + minWindupMs(row) + ' (minWindupMs)');
  if (Number.isInteger(row.cdMs) && Number.isInteger(row.windupMs) && row.cdMs <= row.windupMs) out.push(at + 'cdMs must outlast the windup');
  if (row.element !== null && !isElement(row.element)) out.push(at + 'element must be an elements.js id or null, got ' + row.element);
  if ('dmgPm' in row) out.push(at + 'the strength is hitPm (dmgPm is the old name)');
  return out;
}

/** Every problem with the table against the roster `monsters` (src/data/monsters.js MONSTERS). Empty = valid. */
export function validate(monsters) {
  const out = [];
  for (const [key, row] of Object.entries(MONSTER_SPELLS)) out.push(...validateSpell(row, key));
  const cast = new Set();
  for (const [id, m] of Object.entries(monsters || {})) {
    if (m.spell !== undefined) out.push('monster ' + id + ' names `spell`, where a monster lists its `spells`');
    if (m.spells === undefined) continue;
    const list = m.spells;
    if (!Array.isArray(list) || !list.length || list.length > MAX_SPELLS || new Set(list).size !== list.length) {
      out.push('monster ' + id + ' spells must list 1..' + MAX_SPELLS + ' different spell ids'); continue;
    }
    for (const s of list) { if (!own(s)) out.push('monster ' + id + ' names spell ' + s + ', which no row holds'); else cast.add(s); }
  }
  /* A row no monster casts is content nothing plays (every row has a use). */
  for (const key of Object.keys(MONSTER_SPELLS)) if (!cast.has(key)) out.push('spell ' + key + ' is cast by no monster');
  return out;
}
