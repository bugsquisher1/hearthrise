// src/data/grounds/carters_rest/pack.js — CARTER'S REST, Levels 110-125: the first ground of the Morrow Hills, the region after the Barrow March
// (lane/d-next-region, the designer's "2026-11-13 The Morrow Hills" on the board; Tyler 2026-11-14: "get started on the next set of lore and hunts
// after this boss"). Shape: src/data/grounds/shape.js. Started from `node tools/pack.mjs new carters_rest --like wickstead --band 110,125`, then every
// row rewritten. The stat lines are the formula's (`node tools/pack.mjs propose carters_rest --write`): tier 6, floor 110, fit both.
//
// STAGED, A SAMPLE. The map is still Wickstead's layout under a new id (map.js): the inn is not drawn and there is no art. The three spells are
// stand-ins from rows that exist (the Slate Thrower's Poacher's Volley, the Stable Troll's Lash Sweep, the Troll Brewer's Blasting Charge), so the
// grader plays something close to the design. The ground's own spell rows, a monster that shoots from range and its drop chances fitted on
// drop-tables are the pack lane's. Nothing here is served or listed.
//
// THE PLACE. Carter's Rest was the halfway inn on the road from Krell's Hold up to Morrow. Krell shut the road years ago, the carters stopped
// coming, and a family of hill trolls moved in. Harry Wick's cart is parked in the yard, because the trolls are between him and Morrow.
// ALIGNMENT (Tyler 2026-11-14): a GOOD ground. Everything here is alive and nothing here is tied to Krell's fire. The field waits for the
// ground row to learn it (the board's faction section).
// NAMING VOICE: inn and carter words (taproom, stable, cellar, slate, sign, yard). Trolls are named for the job they took over at the inn.
// THE LESSON: trolls are Humanoid, so a sword cuts them and poison does 15% more. The Slate Thrower goes for whoever stands farthest back, the
// Stable Troll's swing is a marked hit the tank holds, and the Brewer's boiling mash lands on everyone (a Fire Lining from the March answers it).
// THE LOOT. Scarce: the tier-7 boots, gloves, legs and belts in three weights, the four slots Lord Krell does not drop. Worn from 88, so every
// piece is wearable the hour it drops. Each body drops one imbuement item. THE CHANCES ARE PROPOSED, the Hold's by role, not fitted.
import { definePack, box } from '../shape.js?v=0.2.129';
import map from './map.js?v=0.2.129';

const PK = 'troll_picker', TH = 'slate_thrower', ST = 'stable_troll', BR = 'troll_brewer', LL = 'the_landlord';

export default definePack({
  id: 'carters_rest',
  status: 'staged',
  sql: null,
  /* Weights are the pockets' head-count as built (two a pocket, six pockets): 5 Pickers, 2 Slate Throwers, 2 Stable Trolls, 2 Brewers, 1 Landlord. */
  hunt: {
    name: 'Carter\'s Rest', theme: 'This was the halfway inn on the road to Morrow. Trolls moved in when the carters stopped coming.',
    band: [110, 125],
    spawns: [{ monster: PK, w: 5, rarity: 'common' }, { monster: TH, w: 2, rarity: 'uncommon' }, { monster: ST, w: 2, rarity: 'uncommon' },
      { monster: BR, w: 2, rarity: 'uncommon' }, { monster: LL, w: 1, rarity: 'rare' }],
    family: 'Troll', art: PK, travelS: 0, pull: 4, respawnMs: 60000,
  },
  ground: {
    map: 'carters_rest',
    /* the road in from Krell's Hold, by Harry's cart */
    start: [[1, 20], [1, 19], [2, 20], [1, 21]],
    pockets: [
      /* P0 the Yard: Pickers going through the last wagon. The soft door */
      box([6, 13, 21, 26], [15, 19], [PK, PK], [TH, PK, PK, BR, PK, PK]),
      /* P1 the Stable: a Stable Troll asleep in the straw and a Picker in the tack room */
      box([4, 2, 22, 9], [14, 5], [ST, PK], [PK, ST, PK, TH, PK, ST]),
      /* P2 the Roof: Slate Throwers up top, pulling the inn apart to throw it */
      box([36, 2, 55, 11], [46, 6], [TH, PK], [TH, PK, ST, PK, TH, PK]),
      /* P3 the Brewhouse: the Brewers and their kettles */
      box([38, 16, 57, 25], [48, 20], [BR, BR], [PK, ST, BR, PK, TH, PK]),
      /* P4 the Taproom: a Stable Troll at the bar and a Thrower on the stairs */
      box([36, 29, 55, 37], [45, 33], [ST, TH], [BR, PK, ST, PK, TH, PK]),
      /* P5 the Cellar: the Landlord sits on the last of the ale. The hardest pull and the rare carrier */
      box([4, 29, 22, 37], [13, 33], [LL, PK], [ST, BR, TH, PK, ST, PK]),
    ],
    route: [0, 1, 2, 3, 4, 5],
    /* ONE DIFFICULTY FOR EVERY GROUP (Tyler 2026-11-08), ONE PACK ON NORMAL (Tyler 2026-11-11). */
    respawnMs: 60000, pullDist: 1.5, groupFit: 'both',
    densityMax: [8, 8, 8, 8],
  },
  monsters: {
    troll_picker: {
      name: 'Troll Picker', icon: '🧌', tier: 6, level: 111, cls: 'humanoid', family: 'Troll', speed: 3400,
      /* the swarm: the young ones, going through the inn's rooms and the last wagon for anything that shines. Humanoid, no override. */
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'troll_hide', ch: 0.3, band: 'common' }, { id: 'pewter_spoon', ch: 0.08, band: 'uncommon' },
        { id: 'dawn_boots', ch: 0.02, band: 'scarce' }, { id: 'voidhide_boots', ch: 0.02, band: 'scarce' }, { id: 'voidweave_boots', ch: 0.02, band: 'scarce' }],
      hp: 146, atk: 97, baseAcc: 0.94, def: 50, xp: 1633, gp: [31, 92], formula: true },
    slate_thrower: {
      name: 'Slate Thrower', icon: '🧌', tier: 6, level: 114, cls: 'humanoid', family: 'Troll', speed: 3000,
      /* the glass: a lanky troll on the roof, pulling slates and throwing them at whoever stands farthest back. Poacher's Volley stands in for the throw. */
      spells: ['poachers_volley'],
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'troll_hide', ch: 0.3, band: 'common' }, { id: 'roof_slate', ch: 0.08, band: 'uncommon' },
        { id: 'dawn_gauntlets', ch: 0.026, band: 'scarce' }, { id: 'voidhide_gloves', ch: 0.026, band: 'scarce' }, { id: 'voidweave_gloves', ch: 0.026, band: 'scarce' }],
      hp: 140, atk: 129, baseAcc: 0.45, def: 52, xp: 1899, gp: [29, 89], formula: true },
    stable_troll: {
      name: 'Stable Troll', icon: '🧌', tier: 6, level: 117, cls: 'humanoid', family: 'Troll', speed: 2400,
      /* the heavy: the big one that sleeps in the stable and swings the water trough. Lash Sweep stands in for the swing, a marked cone. */
      spells: ['lash_sweep'],
      drops: [{ id: 'big_bones', ch: 0.5, band: 'common' }, { id: 'troll_hide', ch: 0.5, band: 'common' }, { id: 'stable_bit', ch: 0.08, band: 'uncommon' },
        { id: 'dawn_platelegs', ch: 0.017, band: 'scarce' }, { id: 'voidhide_pants', ch: 0.017, band: 'scarce' }, { id: 'voidweave_pants', ch: 0.017, band: 'scarce' }],
      hp: 230, atk: 96, baseAcc: 1.02, def: 77, xp: 2890, gp: [48, 145], formula: true },
    troll_brewer: {
      name: 'Troll Brewer', icon: '🧌', tier: 6, level: 119, cls: 'humanoid', family: 'Troll', speed: 3000,
      /* the regular: she kept the inn's kettles going and throws the boiling mash over everyone. Blasting Charge stands in for it, a group fire
         spell. The tongs came off a priest of Krell's who came through with a live coal. */
      spells: ['blasting_charge'],
      drops: [{ id: 'bones', ch: 0.5, band: 'common' }, { id: 'coal', ch: 0.5, band: 'common' }, { id: 'coal_tongs', ch: 0.08, band: 'uncommon' }],
      hp: 195, atk: 122, baseAcc: 0.64, def: 59, xp: 2242, gp: [41, 123], formula: true },
    the_landlord: {
      name: 'The Landlord', icon: '🧌', tier: 6, level: 123, cls: 'humanoid', family: 'Troll', speed: 2800,
      /* the elite and the rare carrier: the biggest troll, in the innkeeper's apron, sitting on the cellar. He has the last ore wagon's Dawnstone. */
      drops: [{ id: 'big_bones', ch: 1, band: 'common' }, { id: 'dawnstone_ore', ch: 0.3, band: 'common' }, { id: 'cellar_tally', ch: 0.1, band: 'uncommon' },
        { id: 'dawn_belt', ch: 0.05, band: 'scarce' }, { id: 'voidhide_belt', ch: 0.05, band: 'scarce' }, { id: 'voidweave_belt', ch: 0.05, band: 'scarce' }],
      hp: 322, atk: 125, baseAcc: 0.66, def: 91, xp: 4315, gp: [68, 202], formula: true },
  },
  roster: { troll_picker: 'swarm', slate_thrower: 'glass', stable_troll: 'heavy', troll_brewer: 'regular', the_landlord: 'elite' },
  /* THE IMBUEMENT ITEMS (src/data/imbuements.js's rule: one a body, tier and book value from its dropper's Level, raw). */
  items: {
    pewter_spoon: { n: 'Pewter Spoon', icon: '🥄', v: 222, raw: true, imbue: { kind: 'life_leech', tier: 3 } },
    roof_slate: { n: 'Roof Slate', icon: '🪨', v: 228, raw: true, imbue: { kind: 'keen', tier: 3 } },
    stable_bit: { n: 'Stable Bit', icon: '🐴', v: 234, raw: true, imbue: { kind: 'ward', tier: 3 } },
    coal_tongs: { n: 'Coal Tongs', icon: '🔥', v: 238, raw: true, imbue: { kind: 'element_ward', tier: 3 } },
    cellar_tally: { n: 'Cellar Tally', icon: '🪵', v: 246, raw: true, imbue: { kind: 'mana_leech', tier: 3 } },
  },
  itemText: {
    pewter_spoon: 'One of the inn\'s good spoons. The trolls took every one of them and don\'t know what they\'re for',
    roof_slate: 'A slate off the inn\'s roof. The trolls throw them at whoever\'s standing farthest back',
    stable_bit: 'A horse\'s bit from the stable. There haven\'t been horses here since Krell closed the road',
    coal_tongs: 'One of Krell\'s priests came through here carrying a live coal in these. The trolls kept the tongs',
    cellar_tally: 'The innkeeper\'s tally stick for the cellar. The Landlord can\'t read it, and he won\'t give it up',
  },
  /* THE BAG: the Hold's store food and the fire rune (Humanoid: poison does 15% more, a caster may swap). Not measured for cost. */
  bagGuide: { tier: 4,
    melee: { heal: { id: 'cooked_lobster', qty: 100 } },
    ranged: { heal: { id: 'cooked_lobster', qty: 80 }, ammo: { id: 'barbed_arrows', qty: 5100 } },
    magic: { heal: { id: 'cooked_lobster', qty: 100 }, mana: { id: 'carrot_juice', qty: 40 }, ammo: { id: 'chalked_fire_rune', qty: 650 } } },
  map,
});
