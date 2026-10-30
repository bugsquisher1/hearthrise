// ════════════════════════════════════════════════════════════════════════
// src/data/hearth.js — THE GREAT HEARTH: WHAT IT BURNS, AND WHAT A NAMED FUEL
// DOES TO ITS FLAME. (Tyler 2026-10-25: Prayer + burying bones read as an OSRS
// lift; "feed the Hearth, raise your Inner Flame". Design: docs/planning/
// PRIORITY_BOARD.md "The Hearth: Inner Flame replaces Prayer (2026-10-25)".)
//
// ONE VERB, "Fuel the hearth". Two kinds of fuel, two server paths:
//   HEARTH_FUELS  the everyday ladder. The bench src/data/recipes.js
//                 ARTISAN_RECIPES.inner_flame is BUILT from these rows (one recipe
//                 `fuel_<item>` a row, output null): a server-run town activity at
//                 the Great Hearth (set_activity artisan; the town stands put the
//                 body on a fuel stand, 2027-01-28-town-stands.sql), the bag and the
//                 XP moving every settle and journalled as `craft` (hr-accrue + hr_apply).
//                 Creatures with skeletons drop bones; a creature with NO skeleton
//                 drops its family's fuel instead (Tyler 10-25), and that fuel pays
//                 what a bone pays: Lamp Jelly (slimes), Dry Husk (insects and
//                 spiders), Pithwood (walking plants). Clinker (golems, elementals)
//                 and Wisp Wax (spirits) are designed and ship with the first
//                 reachable ground that has those bodies (no item without a source).
//   NAMED_FUELS   one super-rare fuel per ground or boss. It always burns ALONE
//                 (never in a Fuel all): ONE call, hr_hearth_burn (2027-01-31-inner-
//                 flame.sql), pays a burst of Inner Flame XP and colours the Hearth's
//                 flame for everyone in Havora for `secs` (a second named fuel queues
//                 behind it). Rows are mirrored into the server catalogue
//                 hr_hearth_named by tools/gen-hearth-catalogue.mjs (--check is the
//                 twin guard); XP is authored PRE-DIAL and the generator stores what the
//                 server PAYS (src/core/pacing.js pacedXp).
//
// NAMES (DESIGN_STANDARDS §2): each named fuel is a thing from its creature or
// its ground, never a mood word: the wax comb from the hive's heart, the knot the
// Rat King's tails are tied in, the resin knot of the Dire Gray's den pine, the
// copper scale off Chief Coppercap's stolen pots, the glowing moss off a Walking
// Vine. Copy rule (the board): Inner Flame is warmth and recovery, never fire
// damage; it never sits beside Flame Strike / Flame Volley in a list.
//
// RATES live on the monsters' drop rows (src/data/monsters.js, the Rare band:
// src/data/loot-bands.js) and are PROVISIONAL with every loot number (Tyler
// 2026-10-23): the balance-sim lane measures them.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════
import { FLAME_FUEL } from './core-model.js?v=0.2.71';

/* ── THE EVERYDAY LADDER ───────────────────────────────────────────────────
   { item, xp (pre-dial, per item), req (Inner Flame), ms (per item, before the pacing dial), chunk (the
   world sprite thrown into the fire, atlas-common: art/world/common/fuel_*.json) }. Rung order. */
const fuel = (item, xp, req, ms, chunk) => Object.freeze({ item, xp, req, ms, chunk });
/* THE FAMILY FUELS: a boneless creature's bones (Tyler 10-25): slimes, insects and spiders, walking plants. Each is
   its dropper's BONES ROW, not its own product (tests/hunt-core/drop-tables.mjs four-slots reads this list), and
   burns on the plain bone's rung. A new family is one id here plus its item and its chunk sprite `fuel_<id>`. */
export const FAMILY_FUELS = Object.freeze(['lamp_jelly', 'dry_husk', 'pithwood']);
export const HEARTH_FUELS = Object.freeze([
  fuel('bones', FLAME_FUEL.recipeXp, 1, 400, 'fuel_bone'),
  ...FAMILY_FUELS.map((item) => fuel(item, FLAME_FUEL.recipeXp, 1, 400, 'fuel_' + item)),
  /* Big Bones paid 15, under a plain bone's 40 (the board's "15 -> retuned"): the designer's retune puts it between
     Bones and Dragon Bones (game-designer call, lane/b-inner-flame 2026-10-27) */
  fuel('big_bones', 60, 15, 1500, 'fuel_bone'),
  fuel('dragon_bones', 72, 35, 2000, 'fuel_bone'),
  /* the higher rungs keep their inputs, levels and XP (designer 2026-09-12); only the rite verbs are gone */
  fuel('bone_chips', 105, 40, 2200, 'fuel_bone'),
  fuel('grave_dust', 155, 46, 2400, 'fuel_bone'),
  fuel('razor_claw', 212, 52, 2500, 'fuel_bone'),
  fuel('vamp_dust', 295, 58, 2600, 'fuel_bone'),
  fuel('demon_shard', 420, 65, 2800, 'fuel_coal'),
  fuel('wraith_veil', 600, 72, 3000, 'fuel_dry_husk'),
  fuel('dragon_scale', 855, 79, 3200, 'fuel_bone'),
  fuel('lich_soul', 1210, 86, 3400, 'fuel_bone'),
  fuel('ancient_claw', 1700, 92, 3600, 'fuel_bone'),
  fuel('void_chitin', 2400, 99, 3800, 'fuel_dry_husk'),
]);

/* The recipe id a fuel burns under: `fuel_<item>` (derived, so a new rung is one row above). */
export const fuelRecipeId = (item) => 'fuel_' + item;

/* ── THE NAMED FUELS (the sample of five, one per live ground; Tyler 10-25: "awesome") ─────────────────
   { xp (pre-dial, the burst), req (Inner Flame: about 0.6 x the ground's floor Level, the curve a hero who
   burns its bones is on; designer 2026-10-27), flame (a FLAMES key), secs (how long the square burns its
   colour), chunk (the world sprite thrown) }. Where each drops: src/data/monsters.js. */
const named = (xp, req, flame, secs, chunk) => Object.freeze({ xp, req, flame, secs, chunk });
export const NAMED_FUELS = Object.freeze({
  queens_comb: named(1500, 1, 'honey', 60, 'fuel_queens_comb'),            // Hive Wasp, Mill Cellar
  den_knot: named(3000, 3, 'amber', 60, 'fuel_den_knot'),                  // Dire Gray, Meadowbrook Thicket
  rat_kings_knot: named(3000, 5, 'marsh', 60, 'fuel_rat_kings_knot'),      // the Rat King, The Sewer
  mosslight_clump: named(4500, 10, 'mosslight', 90, 'fuel_mosslight_clump'), // Walking Vine, Mosslight Glade
  verdigris_cake: named(4500, 19, 'verdigris', 90, 'fuel_verdigris_cake'), // Chief Coppercap, Coppercap Warrens
});

/* ── THE SHARED FLAME'S LIMITS (server-enforced: the catalogue's hr_hearth_rule row) ──────────────────
   perDay   named fuels one hero may burn a UTC day (they are super-rare: a clamp, not a pace)
   queueS   how far ahead the square's colours may be booked; past it the burn is refused, with the wait */
export const HEARTH_RULE = Object.freeze({ perDay: 20, queueS: 600 });

/* ── THE FLAMES (display: the Great Hearth's fire, its flare and its sparks in a named fuel's colour). The
   everyday fire is `fire` (hearth_fire / hearth_flare / hearth_burn_sparks, atlas-common); each colour is the
   same art with its flame pixels re-poured onto the colour's palette ramp (tools/world-art/hearth-flames.mjs). */
const flame = (fire, flare, sparks, words) => Object.freeze({ fire, flare, sparks, words });
export const FLAMES = Object.freeze({
  fire: flame('hearth_fire', 'hearth_flare', 'hearth_burn_sparks', 'burns'),
  honey: flame('hearth_fire_honey', 'hearth_flare_honey', 'hearth_burn_sparks_honey', 'burns honey-gold'),
  amber: flame('hearth_fire_amber', 'hearth_flare_amber', 'hearth_burn_sparks_amber', 'burns deep amber'),
  marsh: flame('hearth_fire_marsh', 'hearth_flare_marsh', 'hearth_burn_sparks_marsh', 'burns marsh-gas blue'),
  mosslight: flame('hearth_fire_mosslight', 'hearth_flare_mosslight', 'hearth_burn_sparks_mosslight', 'glows mosslight blue-green'),
  verdigris: flame('hearth_fire_verdigris', 'hearth_flare_verdigris', 'hearth_burn_sparks_verdigris', 'burns copper green'),
});

/* ── THE BURN, ON SCREEN (display only; no output waits on it). A hero at a fuel stand whose server pointer
   is a fuel bench throws one chunk every `throwEveryMs` (each standing for what burnt since the last); the
   throw flies `throwMs`, then the flare plays. A named fuel throws once, on arrival. */
export const BURN_SHOW = Object.freeze({ throwEveryMs: 1500, throwMs: 300, arcTiles: 1.5 });
