// ════════════════════════════════════════════════════════════════════════
// src/data/chests.js — THE CHEST ON THE GREAT HEARTH'S LEDGE: ITS KEYS, WHAT EACH ONE ALWAYS HOLDS, ITS WEAPON CHANCE, AND THE
//   HEARTH'S WARMTH AND STOKES (data; the source of truth). Tyler 2026-11-14: "burning tower chests that sit on the ledge of the Great
//   Hearth", "Bronze Keys, Silver Keys, Gold Keys, Platinum keys", "should likely just be a single chest and varies loot based on the key
//   so we can add more keys later", "we'll eventually want to go higher than platinum", "should we reverse the % weapon chances", "I think
//   we should do it like huntera does it, but be very transparent about it in a menu", "stoke the fire for good luck", "the keys are per
//   character per week" (its weekly cap superseded 2026-11-16, below). The design of record: docs/planning/PRIORITY_BOARD.md "2026-11-14 The Burning Tower" §5 (origin/lane/
//   d-burning-tower), with the coherence pass's C4 (origin/lane/d-coherence-133). lane/c-tower-chest builds the server half
//   (supabase/migrations/2027-04-27-tower-chest.sql); the server reads these rows as hr_chest_keys, hr_chest_luck, hr_chest_weapons and
//   hr_chest_weapon_families (tools/gen-chests.mjs, whose --check fails a stale copy). Nothing here is read by the engine.
//
// KEY FAMILIES (Tyler 2026-11-16, superseding the 2026-11-14 "6 keys a week" earn cap): every key belongs to ONE family (KEY_FAMILIES:
//   'tower' today, 'catacomb' when the Unmarked Catacombs are built), and the caps live on the FAMILY, never on a key, so a new key type or
//   a catacomb wing is one row here that joins its family's caps with no new cap:
//   opensPerWeek  keys of the family one hero may USE at the chest in a UTC week (Monday 00:00), counted by the server from the
//                 append-only chest_opens. Keys keep dropping with no weekly earn cap ("so if someone wants to stock up ... they can")
//   heldMax       the held-key LIMIT: when a hero already holds this many keys of the family (its bag plus the account's Storage: what it
//                 could open; the designer's number, about five weeks of opens) a new key of that family does not drop (the mint skips
//                 it and journals the skip). Keys still move between one account's heroes through Storage: the limit gates a new drop only
// THE KEY TABLE IS OPEN (the design's §5). A Tower key row says where its landings start (`from`); a Tower landing hands out the key of
//   the highest TOWER row that starts at or under it (keyForLanding), so the family's top row is always open-ended and a key above it is
//   ONE ROW here, its seven weapon rows and its art: no code, no new chest, no landing renumbered.
//   family      its KEY_FAMILIES row (the caps it counts against)
//   from        the first landing (a floor, a multiple of TOWER_RULES.landingEvery) whose key this is
//   item        the key's item id (a bag item: no shop value, never listed or traded; Storage moves it between one account's heroes)
//   weaponPm    the base chance a key of this row finds a tower weapon, permille (Tyler 2026-11-14: 16 / 8 / 4.5 / 2%, falling as keys rise)
//   weaponTier  the gear tier its weapons wear the numbers of (gear-tiers.js): Iron 2, Mithril and Maple 4, Emberforged and Runewood 6,
//               Dawnsteel and Duskwood 7
//   skillPlus   the +combat skill its weapons give while worn (Tyler 2026-11-14: "bronze +1, silver +2, gold +3, plat +4"; an equipment
//               bonus "like it does in tibia": the engine's half, one item field summed over what is worn, is the Systems lane's)
//   cinders     the Hearth Cinders it always holds
//   saltsQty    the tempering salts it always holds. WHICH salts is DERIVED, never written here: the material of the highest tempering
//               tier at or under weaponTier (src/data/temper.js TEMPER_MATERIALS; keySalts). The coherence pass's C4: the Silver Key paid
//               tier 3's salts to heroes wearing tier 4; with tier 4 to 6 ladders (lane/d-audit-balance-2) Silver pays Mithril salts and
//               Gold and Platinum Ember salts, and a tier 7 ladder moves Platinum by itself. Until those ladders land, the highest
//               ladder there is (tier 3's Fine salts) is what any key past Bronze pays, and tools/gen-chests.mjs --check turns red the
//               day a ladder lands, so the catalogue can't stay stale
//   food        the cooked food it always holds: the store food a climb at that height eats (the board's §5). Gold and Platinum read
//               the Barrow March's bag guides: every ground from 45 to 110 guides Cooked Lobster (src/data/grounds/*/pack.js bagGuide)
//   weapons     family -> the item a weapon roll of that family gives (gear-tiers.js WEAPON_FAMILIES keys). ONE WEAPON A FAMILY, SEVEN
//               A KEY (the design's "one of each type"). Read from src/data/tower-weapons.js TOWER_WEAPONS (lane/d-tower-weapons: who
//               left each one, its name and line); the item rows are towerWeaponItems below (the standard weapon of the key's rank,
//               every number copied, plus the key's skillPlus on the family's own combat skill: src/core/combat.js
//               SKILL_PLUS_FIELDS). A key whose seven are not all here is NOT READY: the server refuses to open it
//               (`chest_not_ready`, the key kept), so nobody is ever paid a roll the table can't honour (chestShipBlockers lists what
//               the switch waits on).
//
// THE LUCK (`hr_chest_luck`, one row; the design's "Bad luck, handled in the open", Tyler 2026-11-14):
//   warmthStepPm  every key that finds no weapon warms the Hearth for that hero's next key by this much of the key's OWN base chance
//                 (40 = 4%); a weapon cools it back to nothing. One count a hero, shared by every kind of key.
//   warmthCapPm   the warmth tops out here, in permille of the base (3000 = three times, reached after 50 dry keys)
//   stokes        stoking the chest once, twice or three times before a key: { pm: the multiplier on the chance, keys: its cost in
//                 that key's own Cinders, as a number of keys' worth } (x1.7 for 3, x2.5 for 7, x3.3 for 12). Paid in Hearth Cinders
//                 from the hero's bag, then the account's Storage. No gold, no second currency.
//   ownPm         a weapon is the family the hero has equipped this often (500 = half: Tyler 2026-11-14, "I like the 2nd option"); the rest
//                 is spread evenly over the key's other families. No weapon worn (or one no family names): even over all of them.
//   perCall       keys one press may use ("Use all" is one press). The period clamp is the key family's opensPerWeek.
//   A key's chance, in parts per million: base x warmth x stoke, at most a sure thing (chestChancePpm). The server works it out
//   again itself inside the open; the menu never sends a chance, a warmth or a Cinder count.
//
// PURE ESM DATA. Imports only the tempering table and the weapon families. Node, Deno and the browser.
// ════════════════════════════════════════════════════════════════════════
import { TEMPER_MATERIALS } from './temper.js?v=0.2.143';
import { WEAPON_FAMILIES } from './gear-tiers.js?v=0.2.143';
import { TOWER_WEAPONS } from './tower-weapons.js?v=0.2.143';
import { TOWER_RULES, RUN_GROUNDS, CATACOMB_WINGS } from './tower.js?v=0.2.143';
import { ARMOUR_WEIGHT, SKILL_PLUS_FIELDS } from './core-model.js?v=0.2.143';
import { CATACOMB_ARMOR_SHIPPED, CATACOMB_TIERS, WING_LEAN } from './catacomb-armor.js?v=0.2.143';

/* The one chest today, on the Great Hearth's ledge in Havora (world/stations.js `hearth`). A later chest is a row. */
export const CHESTS = Object.freeze({
  great_hearth: Object.freeze({ id: 'great_hearth', name: 'The Hearth Chest' }),
});

/* The Hearth Cinders item (id tower_cinders; renamed by the catacomb design: every key family pays them): the chest's own fuel, burnt in the Hearth for Inner Flame (src/data/hearth.js) or spent on stokes. */
export const CINDERS = 'tower_cinders';

/* The key families and their caps (Tyler 2026-11-16: "6 per family per hero per week" opened; a held limit of "about 30, ~5 weeks", the
   designer's to set). heldMax is PER HERO ON THE ACCOUNT, counted over the whole account (lane/c-catacombs, the descent design §4: every
   hero's bag and Key Ring and the account's Storage, against heldMax x the account's heroes), so nobody shuffles keys into Storage or onto
   another hero to make room: four heroes hold up to 120 of a family between them. */
export const KEY_FAMILIES = Object.freeze({
  tower: Object.freeze({ id: 'tower', name: 'Tower', opensPerWeek: 6, heldMax: 30, switch: 'burning_tower' }),
  /* the Unmarked Catacombs' descent (Tyler 2026-11-16: "the SAME amount as the Tower (6 per hero per week) but a SEPARATE count"): every wing's
     keys, Waterlogged and Bone and any later wing, share one six and one held limit */
  catacomb: Object.freeze({ id: 'catacomb', name: 'Catacomb', opensPerWeek: 6, heldMax: 30, switch: 'unmarked_catacombs' }),
});
/* The family a Tower landing mints from (the server's hr_tower_key_mint reads the same id). */
export const TOWER_KEY_FAMILY = 'tower';

/* A KEY ROW (both families):
     ground    the run ground whose landings (the Tower's) or vault doors (a wing's) hand this key out (src/data/tower.js RUN_GROUNDS): a
               ground's door hands out the key of its highest row starting at or under it (keyForLanding), so a family's top row is open-ended
     gear      what a hit pays: 'weapon' (a Tower key: one of its seven tower weapons, the opener's own family half the time) or 'armor' (a
               Catacomb key: a helmet or boots of its tier, the slot by the wing's lean, the weight the opener wears in that slot half the time)
     helmetPm  an armor key's lean: of the armor it finds, this many permille are helmets, the rest boots (catacomb-armor.js WING_LEAN: a
               Bone Key 700, a Waterlogged Key 300). Null on a weapon key
     weaponPm  the base chance a key finds a piece of its gear (the column keeps its first name: a Tower key's weapon, a Catacomb key's armor)
     skillPlus a weapon key's +combat skill on its weapons (0 on an armor key: its pieces carry their own attribute, catacomb-armor.js) */
const key = (id, family, item, name, from, weaponPm, weaponTier, skillPlus, cinders, saltsQty, food, foodQty) => Object.freeze({
  id, family, item, name, from, weaponPm, weaponTier, skillPlus, cinders, saltsQty, food, foodQty,
  ground: TOWER_RULES.hunt, gear: 'weapon', helmetPm: null, armor: Object.freeze({}),
  weapons: Object.freeze(Object.fromEntries(TOWER_WEAPONS.filter((w) => w.key === id).map((w) => [w.family, w.id]))) });

/* The design's four (§5, Tyler 2026-11-14), in `from` order. Counts are the designer's; none is measured in play. Platinum: the
   coherence pass's C4 says "Ember salts and more Cinders" until a tier 7 ladder exists, with no number for the Cinders: 600 stays the
   design's, the designer's to raise. THE TOWER'S keys: the Tower window and its art read these four (tower-stage.js, tower-art.mjs). */
export const CHEST_KEYS = Object.freeze([
  key('bronze', 'tower', 'tower_key_bronze', 'Bronze Key', 10, 160, 2, 1, 50, 15, 'cooked_shrimp', 20),
  key('silver', 'tower', 'tower_key_silver', 'Silver Key', 40, 80, 4, 2, 150, 25, 'cooked_lobster', 15),
  key('gold', 'tower', 'tower_key_gold', 'Gold Key', 70, 45, 6, 3, 300, 30, 'cooked_lobster', 20),
  key('platinum', 'tower', 'tower_key_platinum', 'Platinum Key', 100, 20, 7, 4, 600, 40, 'cooked_lobster', 25),
]);

/* THE CATACOMB KEYS (Tyler 2026-11-16: "Waterlogged Key" from the Flooded Wing, leans boots; "Bone Key" from the Bone Wing, leans helmets; the
   SAME chest and the SAME Bronze / Silver / Gold / Platinum "so it's familiar"; the descent design §4-§5): a wing's tier key per metal, its
   doors the Tower's (`from`), its chance the Tower's (16 / 8 / 4.5 / 2%, RULED 2026-11-16), what it always holds the Tower key's of that
   metal. A hit pays one armor piece of the key's tier (catacomb-armor.js: the slot's twin plus one attribute); `armor` maps slot:weight (the
   server's heavy / medium / light, core-model.js ARMOUR_WEIGHT) to the piece, from the pieces that ship (CATACOMB_ARMOR_SHIPPED: all four
   metals since lane/d-catacomb-gold-platinum, so every Catacomb key opens). A key short of its six (a later tier or wing before its pieces
   ship) is NOT READY: it drops and is held, and the chest refuses to open it (chest_not_ready, the key kept). */
const TOWER_OF_METAL = Object.freeze(Object.fromEntries(CHEST_KEYS.map((k) => [k.id, k])));
const WING_OF_LEAN = Object.freeze(Object.fromEntries(Object.entries(WING_LEAN).map(([lean, l]) => [lean, CATACOMB_WINGS.find((w) => w.wing === l.wing)])));
const catacombKey = (lean, metal) => {
  const t = TOWER_OF_METAL[metal], w = WING_OF_LEAN[lean], l = WING_LEAN[lean];
  return Object.freeze({
    id: lean + '_' + metal, family: 'catacomb', item: lean + '_key_' + metal, name: t.name.replace(' Key', ' ' + l.name),
    from: t.from, weaponPm: t.weaponPm, weaponTier: CATACOMB_TIERS[metal], skillPlus: 0, cinders: t.cinders, saltsQty: t.saltsQty, food: t.food,
    foodQty: t.foodQty, ground: w ? w.hunt : null, gear: 'armor', helmetPm: l.helmet, weapons: Object.freeze({}),
    armor: Object.freeze(Object.fromEntries(CATACOMB_ARMOR_SHIPPED.filter((p) => p.key === metal)
      .map((p) => [p.slot + ':' + ARMOUR_WEIGHT[p.weight], p.id]).sort((a, b) => (a[0] < b[0] ? -1 : 1)))),
  });
};
export const CATACOMB_KEYS = Object.freeze(['waterlogged', 'bone'].flatMap((lean) => ['bronze', 'silver', 'gold', 'platinum'].map((m) => catacombKey(lean, m))));

/* EVERY KEY THE HEARTH CHEST OPENS, both families: the server's table (tools/gen-chests.mjs hr_chest_keys) and every item row reads this. */
export const HEARTH_CHEST_KEYS = Object.freeze([...CHEST_KEYS, ...CATACOMB_KEYS]);

/* The armor slots a Catacomb key can find, and the weights in each, in the order the open lists them (the server's hr_chest_armor). */
export const ARMOR_SLOTS = Object.freeze(['helmet', 'boots']);
export const ARMOR_WEIGHTS = Object.freeze(['heavy', 'medium', 'light']);

export const CHEST_LUCK = Object.freeze({
  warmthStepPm: 40,
  warmthCapPm: 3000,
  stokes: Object.freeze([
    Object.freeze({ pm: 1700, keys: 3 }),
    Object.freeze({ pm: 2500, keys: 7 }),
    Object.freeze({ pm: 3300, keys: 12 }),
  ]),
  ownPm: 500,
  perCall: 20,
});

/* THE SUPER-RARE OUTFITS (the board's §5 super-rare outfit, named Key Warden by Tyler 2026-11-16; Tyler 2026-11-14: "a super rare outfit that can drop
   from any chest would be cool too"). A row is one outfit a chest can pay:
     outfit  its src/data/outfits.js OUTFIT_ROWS id, whose `bundle` is this row's item (tools/gen-chests.mjs refuses a mismatch)
     item    the bag item it comes out as (the bundle): tradeable until a hero uses it, then that hero owns the outfit for good
             (supabase/migrations/2027-04-30-sweeps-coat.sql hr_outfit_bundle_use, hr_outfit_owned)
     name    the item's name; value its book value (the shop's bid and the market's ceiling read it: the designer stated none, so 20,000 is
             the backend's pick, the market's own daily spend cap divided by its 100x ceiling, for the designer to move)
     pm      its chance on EVERY key row, permille (the board: Bronze 0.2%, Silver 0.3%, Gold 0.4%, Platinum 0.5%). No key row may be missing:
             a new key states its own chance here, never inherits one
   One outfit roll a key, on its own stream beside the weapon's (it never moves a weapon's odds): the rows stack in order, so a key finds
   at most one outfit and each at exactly its chance. Add-ons (the board's Brush at 50, Lantern at 100) wait for the outfit system's add-ons. */
export const CHEST_OUTFITS = Object.freeze([
  /* Tyler 2026-11-16 named it "Key Warden" (a hooded key-keeper with a gold key); the ids keep the design's first name */
  Object.freeze({ outfit: 'sweeps_coat', item: 'sweeps_coat_bundle', name: 'Key Warden', value: 20000,
    /* every key of both families (the descent design §3: "every key at the chest rolls the coat"), the same chance a metal */
    pm: Object.freeze({ bronze: 2, silver: 3, gold: 4, platinum: 5,
      waterlogged_bronze: 2, waterlogged_silver: 3, waterlogged_gold: 4, waterlogged_platinum: 5,
      bone_bronze: 2, bone_silver: 3, bone_gold: 4, bone_platinum: 5 }) }),
]);

/** Everything wrong with the outfit rows against the key table, as strings (empty: valid). Pure. */
export function validateChestOutfits(outfits = CHEST_OUTFITS, keys = HEARTH_CHEST_KEYS) {
  const out = [];
  const ID = /^[a-z0-9_]{1,40}$/;
  const keyIds = keys.map((k) => k.id), taken = new Set(keys.map((k) => k.item).concat([CINDERS], keys.flatMap((k) => Object.values(k.weapons || {}).concat(Object.values(k.armor || {})))));
  const seen = new Set(), items = new Set();
  const total = Object.fromEntries(keyIds.map((id) => [id, 0]));
  for (const o of Array.isArray(outfits) ? outfits : []) {
    const n = (o && o.outfit) || '?';
    if (!o || !ID.test(String(o.outfit)) || seen.has(o.outfit)) { out.push('outfit ' + n + ': its id is not an id, or a second row has it'); continue; }
    seen.add(o.outfit);
    if (!ID.test(String(o.item)) || items.has(o.item) || taken.has(o.item)) out.push('outfit ' + n + ': its item is not an id, or another row (a key, the Cinders, a weapon) names it');
    items.add(o.item);
    if (typeof o.name !== 'string' || !o.name.trim()) out.push('outfit ' + n + ': no name');
    if (!Number.isInteger(o.value) || o.value < 1) out.push('outfit ' + n + ': its book value is not a whole number above 0');
    const pm = o.pm && typeof o.pm === 'object' ? o.pm : {};
    for (const id of keyIds) {
      if (!Number.isInteger(pm[id]) || pm[id] < 1 || pm[id] > 1000) out.push('outfit ' + n + ': no whole permille 1..1000 for the ' + id + ' key');
      else total[id] += pm[id];
    }
    for (const id of Object.keys(pm)) if (!keyIds.includes(id)) out.push('outfit ' + n + ': a chance for ' + id + ', which is no key');
  }
  for (const id of keyIds) if (total[id] > 1000) out.push('the outfits of the ' + id + ' key add up past a sure thing');
  return out;
}

/* The weapon families a key's weapons come in (gear-tiers.js WEAPON_FAMILIES), in its order: the seven "types". */
export const WEAPON_FAMILY_KEYS = Object.freeze(WEAPON_FAMILIES.map((f) => f.key));

/** The family an ITEMS row of slot `weapon` belongs to, read from its own fields (weaponType, discipline, two hands), or null. The
    same rule as the families' own rows (validateChests checks every family's ids land on it), so a special or unique weapon finds its
    family without a list. Pure. */
export function weaponFamilyOf(item) {
  if (!item || item.slot !== 'weapon') return null;
  switch (item.weaponType) {
    case 'sword': return 'sword';
    case 'hammer': return 'warhammer';
    case 'axe': return 'hatchets';
    case 'ranged': return item.twoHanded === true ? 'bow' : 'crossbow';
    case 'magic': return item.discipline === 'restoration' ? 'staff' : item.discipline === 'destruction' ? 'wand' : null;
    default: return null;
  }
}

/** The key row run ground `ground`'s landing (a floor, a vault door) hands out: the highest row of that ground starting at or under it, or
    null under the first. The Tower's ground by default (its landings' keys). Pure. */
export function keyForLanding(landing, keys = HEARTH_CHEST_KEYS, ground = TOWER_RULES.hunt) {
  let out = null;
  for (const k of keys) {
    if (k.ground === ground && Number.isInteger(landing) && landing >= k.from && (!out || k.from > out.from)) out = k;
  }
  return out;
}

/** The salts item a key row always holds: the material of the highest tempering tier at or under its weapon tier, or null. Pure. */
export function keySalts(k, materials = TEMPER_MATERIALS) {
  const tiers = Object.keys(materials).map(Number).filter((t) => t <= k.weaponTier).sort((a, b) => b - a);
  return tiers.length ? materials[tiers[0]].item : null;
}

/** What a key row always holds: { item: qty }. Pure. */
export function keyHaul(k, materials = TEMPER_MATERIALS) {
  const out = { [CINDERS]: k.cinders };
  const salts = keySalts(k, materials);
  if (salts) out[salts] = (out[salts] || 0) + k.saltsQty;
  out[k.food] = (out[k.food] || 0) + k.foodQty;
  return out;
}

/** The warmth multiplier after `dry` keys with no weapon, permille of the base (1000 cold, warmthCapPm at most). Pure. */
export function warmthPm(dry, luck = CHEST_LUCK) {
  const d = Math.max(0, Math.trunc(Number(dry) || 0));
  return 1000 + Math.min(d * luck.warmthStepPm, luck.warmthCapPm - 1000);
}

/** A stoke count's multiplier, permille (0 stokes: 1000), or null for a count no row has. Pure. */
export function stokePm(stokes, luck = CHEST_LUCK) {
  if (stokes === 0) return 1000;
  const s = Number.isInteger(stokes) && stokes > 0 ? luck.stokes[stokes - 1] : null;
  return s ? s.pm : null;
}

/** A stoke count's price in Hearth Cinders for key row `k` (0 stokes: 0), or null for a count no row has. Pure. */
export function stokeCost(k, stokes, luck = CHEST_LUCK) {
  if (stokes === 0) return 0;
  const s = Number.isInteger(stokes) && stokes > 0 ? luck.stokes[stokes - 1] : null;
  return s ? s.keys * k.cinders : null;
}

/** The chance key row `k` finds a weapon after `dry` dry keys with `stokes` stokes, in parts per million (at most 1,000,000). The
    server's hr_chest_chance_ppm is the same integer sum, checked against this one (tests/tower-chest.mjs TCH-DATA). Pure. */
export function chestChancePpm(k, dry, stokes, luck = CHEST_LUCK) {
  const s = stokePm(stokes, luck);
  if (s === null) return null;
  return Math.min(1000000, Math.floor((k.weaponPm * warmthPm(dry, luck) * s) / 1000));
}

/** Everything wrong with the chest table, as strings (empty: valid). `landingEvery` is a key's spacing when its ground has no run row (the
    run row's own landingEvery otherwise: src/data/tower.js RUN_GROUNDS). Pure. */
export function validateChests(keys = HEARTH_CHEST_KEYS, luck = CHEST_LUCK, landingEvery = 10, materials = TEMPER_MATERIALS, families = KEY_FAMILIES, tower = TOWER_WEAPONS,
  runs = RUN_GROUNDS) {
  const out = [];
  const ID = /^[a-z0-9_]{1,40}$/;
  if (!Array.isArray(keys) || !keys.length) return ['the key table is empty'];
  /* the families: each an id, a weekly open count above 0, a held limit of at least a week's opens, and a key (no dead family) */
  if (!families || typeof families !== 'object' || !Object.keys(families).length) return ['the key families are empty'];
  for (const [fid, f] of Object.entries(families)) {
    if (!ID.test(fid) || !f || f.id !== fid) { out.push('family ' + fid + ': its id is not its key'); continue; }
    if (typeof f.name !== 'string' || !f.name.trim()) out.push('family ' + fid + ': no name');
    if (!Number.isInteger(f.opensPerWeek) || f.opensPerWeek < 1 || f.opensPerWeek > 1000) out.push('family ' + fid + ': opensPerWeek is not 1..1000');
    if (!Number.isInteger(f.heldMax) || f.heldMax < f.opensPerWeek) out.push('family ' + fid + ': heldMax is under a week\'s opens');
    /* the feature switch that hides the family's door, its keys at the chest and its section (hr_feature_switches) */
    if (typeof f.switch !== 'string' || !ID.test(f.switch)) out.push('family ' + fid + ': no feature switch');
    if (!keys.some((k) => k && k.family === fid)) out.push('family ' + fid + ': no key belongs to it');
  }
  /* (worded with no quote after the word that ends an import: tools/pack-edge.mjs reads an export's specifier up to the next quote) */
  if (!Object.hasOwn(families, TOWER_KEY_FAMILY)) out.push('no ' + TOWER_KEY_FAMILY + ' family, the one every Tower landing mints its key in');
  const prevOf = {};
  const seen = new Set(), items = new Set();
  for (const k of keys) {
    const n = (k && k.id) || '?';
    if (!k || !ID.test(String(k.id))) { out.push(n + ': its id is not an id'); continue; }
    if (seen.has(k.id)) out.push(n + ': a second row with this id');
    if (!Object.hasOwn(families, k.family)) out.push(n + ': its family ' + k.family + ' is no key family');
    /* its ground: a run ground of its own family (a Tower key from a Tower landing, a Catacomb key from a wing's vault door) */
    const run = k.ground && Object.hasOwn(runs, k.ground) ? runs[k.ground] : null;
    if (!run) out.push(n + ': its ground ' + k.ground + ' is no run ground');
    else if (run.family !== k.family) out.push(n + ': its ground ' + k.ground + ' mints the ' + run.family + ' family');
    /* a family's open table rises ground by ground: two wings' Bronze keys share their metal's door */
    const prev = prevOf[k.family + ':' + k.ground] || null;
    seen.add(k.id);
    if (!ID.test(String(k.item)) || items.has(k.item)) out.push(n + ': its item is not an id, or another key names it');
    items.add(k.item);
    if (k.item === CINDERS) out.push(n + ': the key is the Cinders');
    if (typeof k.name !== 'string' || !k.name.trim()) out.push(n + ': no name');
    if (!Number.isInteger(k.from) || k.from <= 0 || k.from % (run ? run.landingEvery : landingEvery)) out.push(n + ': from is not a landing');
    if (!Number.isInteger(k.weaponPm) || k.weaponPm < 1 || k.weaponPm > 1000) out.push(n + ': weaponPm is not a whole permille 1..1000');
    if (!Number.isInteger(k.weaponTier) || k.weaponTier < 1 || k.weaponTier > 10) out.push(n + ': weaponTier is not a tier');
    /* WHAT A HIT PAYS: a weapon key its weapons (and a +skill on them), an armor key its armor (and a lean between the two slots) */
    if (k.gear === 'weapon') {
      if (!Number.isInteger(k.skillPlus) || k.skillPlus < 1) out.push(n + ': skillPlus is not a whole number above 0');
      if (k.helmetPm !== null || Object.keys(k.armor || {}).length) out.push(n + ': a weapon key with an armor lean or armor');
    } else if (k.gear === 'armor') {
      if (k.skillPlus !== 0 || Object.keys(k.weapons || {}).length) out.push(n + ': an armor key with a +skill or weapons');
      if (!Number.isInteger(k.helmetPm) || k.helmetPm < 0 || k.helmetPm > 1000) out.push(n + ': helmetPm is not a whole permille 0..1000');
      for (const [sw, item] of Object.entries(k.armor || {})) {
        const [slot, weight] = sw.split(':');
        if (!ARMOR_SLOTS.includes(slot) || !ARMOR_WEIGHTS.includes(weight)) out.push(n + ': ' + sw + ' is no armor slot and weight');
        if (!ID.test(String(item))) out.push(n + ': its ' + sw + ' piece is not an item id');
      }
    } else out.push(n + ': gear is not weapon or armor');
    for (const f of ['cinders', 'saltsQty', 'foodQty']) if (!Number.isInteger(k[f]) || k[f] <= 0) out.push(n + ': ' + f + ' is not a whole number above 0');
    if (!ID.test(String(k.food)) || k.food === CINDERS) out.push(n + ': food is not an item id');
    if (!keySalts(k, materials)) out.push(n + ': no tempering tier at or under its weapon tier pays salts');
    for (const [fam, item] of Object.entries(k.weapons || {})) {
      if (!WEAPON_FAMILY_KEYS.includes(fam)) out.push(n + ': ' + fam + ' is no weapon family');
      if (!ID.test(String(item))) out.push(n + ': its ' + fam + ' weapon is not an item id');
    }
    if (prev) {
      /* The open table: a family's rows rise. A higher key always has more inside (the design: "a higher key always has more in it"), and its
         weapon is the rarer one (Tyler 2026-11-14's reversal), its tier and its +skill higher. */
      if (k.from <= prev.from) out.push(n + ': starts at or under ' + prev.id);
      if (k.weaponPm > prev.weaponPm) out.push(n + ': a better weapon chance than ' + prev.id + ' (the odds fall as keys rise)');
      if (k.weaponTier < prev.weaponTier || (k.gear === 'weapon' && k.skillPlus <= prev.skillPlus)) out.push(n + ': its weapons are no better than ' + prev.id + '\'s');
      if (k.cinders <= prev.cinders) out.push(n + ': no more Cinders than ' + prev.id);
      if (k.gear !== prev.gear || k.helmetPm !== prev.helmetPm) out.push(n + ': pays another gear or lean than ' + prev.id + ', a key of its ground');
    }
    prevOf[k.family + ':' + k.ground] = k;
  }
  /* THE TOWER WEAPONS' OWN ROWS (tower-weapons.js): a key and a family each, one row a pair (the key's `weapons` map keeps only the last
     of two), an id no other row takes, a name and a line */
  const pairs = new Set(), ids = new Set(), names = new Set();
  for (const w of Array.isArray(tower) ? tower : []) {
    const n = (w && w.id) || '?';
    if (!w || !ID.test(String(w.id))) { out.push('tower weapon ' + n + ': its id is not an id'); continue; }
    if (!seen.has(w.key)) out.push('tower weapon ' + n + ': ' + w.key + ' is no key');
    if (!WEAPON_FAMILY_KEYS.includes(w.family)) out.push('tower weapon ' + n + ': ' + w.family + ' is no weapon family');
    if (pairs.has(w.key + ':' + w.family)) out.push('tower weapon ' + n + ': a second ' + w.family + ' for the ' + w.key + ' key');
    if (ids.has(w.id)) out.push('tower weapon ' + n + ': a second row with this id');
    for (const f of ['name', 'line']) if (typeof w[f] !== 'string' || !w[f].trim()) out.push('tower weapon ' + n + ': no ' + f);
    if (names.has(w.name)) out.push('tower weapon ' + n + ': another tower weapon is called ' + w.name);
    pairs.add(w.key + ':' + w.family); ids.add(w.id); names.add(w.name);
  }
  const allWeapons = keys.flatMap((k) => Object.values(k.weapons || {}));
  if (new Set(allWeapons).size !== allWeapons.length) out.push('one weapon item is named by two keys or families');
  if (!luck || typeof luck !== 'object') return out.concat(['the luck row is missing']);
  if (!Number.isInteger(luck.warmthStepPm) || luck.warmthStepPm < 0) out.push('warmthStepPm is not a whole permille');
  if (!Number.isInteger(luck.warmthCapPm) || luck.warmthCapPm < 1000) out.push('warmthCapPm is under the base (1000)');
  if (!Array.isArray(luck.stokes) || !luck.stokes.length || luck.stokes.length > 9) out.push('stokes is not 1..9 rows');
  else {
    let p = { pm: 1000, keys: 0 };
    luck.stokes.forEach((s, i) => {
      if (!s || !Number.isInteger(s.pm) || !Number.isInteger(s.keys) || s.pm <= p.pm || s.keys <= p.keys) out.push('stoke ' + (i + 1) + ' is not more chance for more Cinders than the one before');
      p = s || p;
    });
  }
  if (!Number.isInteger(luck.ownPm) || luck.ownPm < 0 || luck.ownPm > 1000) out.push('ownPm is not a whole permille');
  if (!Number.isInteger(luck.perCall) || luck.perCall < 1 || luck.perCall > 100) out.push('perCall is not 1..100');
  return out;
}

/** The slot:weight pairs an armor key must carry to be ready (two slots x three weights). */
export const ARMOR_KINDS = Object.freeze(ARMOR_SLOTS.flatMap((s) => ARMOR_WEIGHTS.map((w) => s + ':' + w)));

/** What a key's switch waits on before the chest can open it: each key row whose gear is not all named (a weapon key's seven weapons, an
    armor key's six pieces). Not a load error: the server refuses such a key (`chest_not_ready`) and its door still mints it. The Tower's
    four by default (the burning_tower switch's own list); HEARTH_CHEST_KEYS for both families. Pure. */
export function chestShipBlockers(keys = CHEST_KEYS) {
  const missing = (k) => (k.gear === 'armor' ? ARMOR_KINDS.filter((x) => !(k.armor || {})[x]) : WEAPON_FAMILY_KEYS.filter((f) => !(k.weapons || {})[f]));
  return keys.filter((k) => missing(k).length).map((k) => k.name + ': ' + missing(k).join(', ') + ' not built');
}

const PROBLEMS = validateChests().concat(validateChestOutfits());
if (PROBLEMS.length) throw new Error('src/data/chests.js does not load: ' + PROBLEMS.join('; '));

/* ── THE ITEMS (src/data/items.js spreads them; tools/gen-catalogues.mjs writes hr_items) ─────────────────────────────────────────────
   A key and the Cinders are bound to the account (`bop`: hr_items.tradeable false, value 0, so the market, the shop and the dispatch
   refuse them: the design's "keys don't trade", and Cinders can't either, or gold would buy odds). Storage still moves them between
   one account's heroes ("that is still you"). */
export const CHEST_ITEM_ROWS = Object.freeze({
  ...Object.fromEntries(CHEST_KEYS.map((k) => [k.item, Object.freeze({ n: k.name, v: 0, bop: true, type: 'key', tag: 'tower_key',
    towerKey: k.id })])),
  /* a Catacomb key (the descent): bound the same way, its own tag so a window can tell the families apart; `chestKey` its key row */
  ...Object.fromEntries(CATACOMB_KEYS.map((k) => [k.item, Object.freeze({ n: k.name, v: 0, bop: true, type: 'key', tag: 'catacomb_key',
    chestKey: k.id })])),
  [CINDERS]: Object.freeze({ n: 'Hearth Cinders', v: 0, bop: true, tag: 'fuel' }),
  /* a super-rare outfit's bundle (CHEST_OUTFITS): tradeable (no `bop`: the board's "it trades, until someone wears it"), kept and never
     junk (tag cosmetic), its own book value; `outfit` names what using it gives */
  ...Object.fromEntries(CHEST_OUTFITS.map((o) => [o.item, Object.freeze({ n: o.name, v: o.value, type: 'outfit_bundle', tag: 'cosmetic',
    rarity: 'legendary', outfit: o.outfit })])),
});

/* THE COMBAT SKILL A WEAPON'S +SKILL RAISES, by its weaponType (the design's §6: "Sword, Hammer, Hatchets: Melee. Bow, Crossbow: Ranged.
   Wand, Staff: Magic"), the same skill its blows read (src/core/member.js deriveProfile). */
const PLUS_SKILL_OF_TYPE = Object.freeze({ sword: 'melee', hammer: 'melee', axe: 'melee', ranged: 'ranged', magic: 'magic' });

/** The tower weapons' item rows, { id: row }, from the catalogue `items` they join (src/data/items.js calls it once the ladder's
    hand-authored rungs are backfilled): each the standard weapon of its key's rank (the family's rung at the key's weaponTier,
    gear-tiers.js WEAPON_FAMILIES), EVERY field copied (accuracy, damage, tier, rarity, Level requirement, book value, hands), its own
    name, and the key's skillPlus on the family's combat skill (combat.js SKILL_PLUS_FIELDS). Tradeable like any gear (Tyler 2026-10-23:
    no bound gear). `towerKey` names the lock it came out of. Throws when a rung is missing or reads another family. Pure. */
export function towerWeaponItems(items, keys = CHEST_KEYS, tower = TOWER_WEAPONS, families = WEAPON_FAMILIES) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const w of tower) {
    const k = keys.find((x) => x.id === w.key);
    const fam = families.find((f) => f.key === w.family);
    const rung = k && fam ? fam.ids[k.weaponTier - 1] : null;
    const base = rung && Object.prototype.hasOwnProperty.call(items, rung) ? items[rung] : null;
    if (!base || weaponFamilyOf(base) !== w.family) throw new Error('src/data/chests.js: tower weapon ' + w.id + ' has no ' + w.family + ' rung at tier ' + (k && k.weaponTier));
    const skill = PLUS_SKILL_OF_TYPE[base.weaponType];
    if (!skill) throw new Error('src/data/chests.js: tower weapon ' + w.id + ' raises no combat skill');
    out[w.id] = { ...base, n: w.name, [SKILL_PLUS_FIELDS[skill]]: k.skillPlus, towerKey: k.id };
  }
  return out;
}

/* One line an item (src/data/item-descriptions.js spreads it). Drafts in the design's voice, not through the reader gate. */
export const CHEST_ITEM_DESC = Object.freeze({
  tower_key_bronze: 'An old Keeper\'s key from the Burning Tower. It opens the chest on the Great Hearth\'s ledge once',
  tower_key_silver: 'A Keeper\'s key from the Tower\'s middle landings. The chest on the ledge gives more for it',
  tower_key_gold: 'A Keeper\'s key from high up the Tower. The chest on the ledge gives a lot for it',
  tower_key_platinum: 'A key from the Tower\'s top landings, still warm. The chest on the ledge gives the most for it',
  [CINDERS]: 'Embers from the Great Hearth. Every key at the chest pays some. Burn them in the Hearth, or stoke the chest with them for luck',
  sweeps_coat_bundle: 'Unlocks the Key Warden outfit for this hero',
  /* the Catacomb keys (drafts, not through the reader gate): off Keeper Dunn's ring, a wing's door each */
  ...Object.fromEntries(CATACOMB_KEYS.map((k) => {
    const wing = k.helmetPm >= 500 ? 'the Bone Wing' : 'the Flooded Wing';
    const what = k.helmetPm >= 500 ? 'Mostly helmets' : 'Mostly boots';
    /* (no quote straight after the word that ends an import, as validateChests notes: tools/pack-edge.mjs reads a specifier up to the next quote) */
    const where = { bronze: 'a door in ', silver: 'the middle doors of ', gold: 'the deep doors of ', platinum: 'the deepest doors of ' }[k.id.split('_').pop()];
    return [k.item, 'Off Keeper Dunn\'s ring. He kept it at ' + where + wing + '. It opens the Hearth Chest once. ' + what];
  })),
});
