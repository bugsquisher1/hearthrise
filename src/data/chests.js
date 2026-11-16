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
//   cinders     the Tower Cinders it always holds
//   saltsQty    the tempering salts it always holds. WHICH salts is DERIVED, never written here: the material of the highest tempering
//               tier at or under weaponTier (src/data/temper.js TEMPER_MATERIALS; keySalts). The coherence pass's C4: the Silver Key paid
//               tier 3's salts to heroes wearing tier 4; with tier 4 to 6 ladders (lane/d-audit-balance-2) Silver pays Mithril salts and
//               Gold and Platinum Ember salts, and a tier 7 ladder moves Platinum by itself. Until those ladders land, the highest
//               ladder there is (tier 3's Fine salts) is what any key past Bronze pays, and tools/gen-chests.mjs --check turns red the
//               day a ladder lands, so the catalogue can't stay stale
//   food        the cooked food it always holds: the store food a climb at that height eats (the board's §5). Gold and Platinum read
//               the Barrow March's bag guides: every ground from 45 to 110 guides Cooked Lobster (src/data/grounds/*/pack.js bagGuide)
//   weapons     family -> the item a weapon roll of that family gives (gear-tiers.js WEAPON_FAMILIES keys). ONE WEAPON A FAMILY, SEVEN
//               A KEY (the design's "one of each type"). EMPTY TODAY: the tower weapons' names are the designer's (a sample of five
//               Silver ones exists, the rest are unnamed), their icons the Art Director's and their +skill the engine's, and none is
//               built. A key whose seven are not all here is NOT READY: the server refuses to open it (`chest_not_ready`, the key kept),
//               so nobody is ever paid a roll the table can't honour (chestShipBlockers lists what the switch waits on).
//
// THE LUCK (`hr_chest_luck`, one row; the design's "Bad luck, handled in the open", Tyler 2026-11-14):
//   warmthStepPm  every key that finds no weapon warms the Hearth for that hero's next key by this much of the key's OWN base chance
//                 (40 = 4%); a weapon cools it back to nothing. One count a hero, shared by every kind of key.
//   warmthCapPm   the warmth tops out here, in permille of the base (3000 = three times, reached after 50 dry keys)
//   stokes        stoking the chest once, twice or three times before a key: { pm: the multiplier on the chance, keys: its cost in
//                 that key's own Cinders, as a number of keys' worth } (x1.7 for 3, x2.5 for 7, x3.3 for 12). Paid in Tower Cinders
//                 from the hero's bag, then the account's Storage. No gold, no second currency.
//   ownPm         a weapon is the family the hero has equipped this often (500 = half: Tyler 2026-11-14, "I like the 2nd option"); the rest
//                 is spread evenly over the key's other families. No weapon worn (or one no family names): even over all of them.
//   perCall       keys one press may use ("Use all" is one press). The period clamp is the key family's opensPerWeek.
//   A key's chance, in parts per million: base x warmth x stoke, at most a sure thing (chestChancePpm). The server works it out
//   again itself inside the open; the menu never sends a chance, a warmth or a Cinder count.
//
// PURE ESM DATA. Imports only the tempering table and the weapon families. Node, Deno and the browser.
// ════════════════════════════════════════════════════════════════════════
import { TEMPER_MATERIALS } from './temper.js?v=0.2.132';
import { WEAPON_FAMILIES } from './gear-tiers.js?v=0.2.132';

/* The one chest today, on the Great Hearth's ledge in Havora (world/stations.js `hearth`). A later chest is a row. */
export const CHESTS = Object.freeze({
  great_hearth: Object.freeze({ id: 'great_hearth', name: 'The Hearth Chest' }),
});

/* The Tower Cinders item: the chest's own fuel, burnt in the Hearth for Inner Flame (src/data/hearth.js) or spent on stokes. */
export const CINDERS = 'tower_cinders';

/* The key families and their caps (Tyler 2026-11-16: "6 per family per hero per week" opened; a held limit of "about 30, ~5 weeks", the
   designer's to set). The Catacombs' family joins as one row here when its keys are built. */
export const KEY_FAMILIES = Object.freeze({
  tower: Object.freeze({ id: 'tower', name: 'Tower', opensPerWeek: 6, heldMax: 30 }),
});
/* The family a Tower landing mints from (the server's hr_tower_key_mint reads the same id). */
export const TOWER_KEY_FAMILY = 'tower';

const key = (id, family, item, name, from, weaponPm, weaponTier, skillPlus, cinders, saltsQty, food, foodQty) => Object.freeze({
  id, family, item, name, from, weaponPm, weaponTier, skillPlus, cinders, saltsQty, food, foodQty, weapons: Object.freeze({}) });

/* The design's four (§5, Tyler 2026-11-14), in `from` order. Counts are the designer's; none is measured in play. Platinum: the
   coherence pass's C4 says "Ember salts and more Cinders" until a tier 7 ladder exists, with no number for the Cinders: 600 stays the
   design's, the designer's to raise. */
export const CHEST_KEYS = Object.freeze([
  key('bronze', 'tower', 'tower_key_bronze', 'Bronze Key', 10, 160, 2, 1, 50, 15, 'cooked_shrimp', 20),
  key('silver', 'tower', 'tower_key_silver', 'Silver Key', 40, 80, 4, 2, 150, 25, 'cooked_lobster', 15),
  key('gold', 'tower', 'tower_key_gold', 'Gold Key', 70, 45, 6, 3, 300, 30, 'cooked_lobster', 20),
  key('platinum', 'tower', 'tower_key_platinum', 'Platinum Key', 100, 20, 7, 4, 600, 40, 'cooked_lobster', 25),
]);

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

/** The key row a Tower landing (a floor) hands out: the highest Tower row starting at or under it, or null under the first. Pure. */
export function keyForLanding(landing, keys = CHEST_KEYS) {
  let out = null;
  for (const k of keys) {
    if (k.family === TOWER_KEY_FAMILY && Number.isInteger(landing) && landing >= k.from && (!out || k.from > out.from)) out = k;
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

/** A stoke count's price in Tower Cinders for key row `k` (0 stokes: 0), or null for a count no row has. Pure. */
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

/** Everything wrong with the chest table, as strings (empty: valid). `landingEvery` is TOWER_RULES.landingEvery. Pure. */
export function validateChests(keys = CHEST_KEYS, luck = CHEST_LUCK, landingEvery = 10, materials = TEMPER_MATERIALS, families = KEY_FAMILIES) {
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
    if (!keys.some((k) => k && k.family === fid)) out.push('family ' + fid + ': no key belongs to it');
  }
  if (!Object.hasOwn(families, TOWER_KEY_FAMILY)) out.push('no ' + TOWER_KEY_FAMILY + ' family for the Tower\'s landings to mint from');
  const prevOf = {};
  const seen = new Set(), items = new Set();
  for (const k of keys) {
    const n = (k && k.id) || '?';
    if (!k || !ID.test(String(k.id))) { out.push(n + ': its id is not an id'); continue; }
    if (seen.has(k.id)) out.push(n + ': a second row with this id');
    if (!Object.hasOwn(families, k.family)) out.push(n + ': its family ' + k.family + ' is no key family');
    const prev = prevOf[k.family] || null;
    seen.add(k.id);
    if (!ID.test(String(k.item)) || items.has(k.item)) out.push(n + ': its item is not an id, or another key names it');
    items.add(k.item);
    if (k.item === CINDERS) out.push(n + ': the key is the Cinders');
    if (typeof k.name !== 'string' || !k.name.trim()) out.push(n + ': no name');
    if (!Number.isInteger(k.from) || k.from <= 0 || k.from % landingEvery) out.push(n + ': from is not a landing');
    if (!Number.isInteger(k.weaponPm) || k.weaponPm < 1 || k.weaponPm > 1000) out.push(n + ': weaponPm is not a whole permille 1..1000');
    if (!Number.isInteger(k.weaponTier) || k.weaponTier < 1 || k.weaponTier > 10) out.push(n + ': weaponTier is not a tier');
    if (!Number.isInteger(k.skillPlus) || k.skillPlus < 1) out.push(n + ': skillPlus is not a whole number above 0');
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
      if (k.weaponTier < prev.weaponTier || k.skillPlus <= prev.skillPlus) out.push(n + ': its weapons are no better than ' + prev.id + '\'s');
      if (k.cinders <= prev.cinders) out.push(n + ': no more Cinders than ' + prev.id);
    }
    prevOf[k.family] = k;
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

/** What the `burning_tower` switch waits on before the chest can open anything: each key row whose seven weapons are not all named.
    Not a load error: the server refuses such a key (`chest_not_ready`) and the climb still mints it. Pure. */
export function chestShipBlockers(keys = CHEST_KEYS) {
  return keys.filter((k) => WEAPON_FAMILY_KEYS.some((f) => !(k.weapons || {})[f]))
    .map((k) => k.name + ': ' + WEAPON_FAMILY_KEYS.filter((f) => !(k.weapons || {})[f]).join(', ') + ' not built');
}

const PROBLEMS = validateChests();
if (PROBLEMS.length) throw new Error('src/data/chests.js does not load: ' + PROBLEMS.join('; '));

/* ── THE ITEMS (src/data/items.js spreads them; tools/gen-catalogues.mjs writes hr_items) ─────────────────────────────────────────────
   A key and the Cinders are bound to the account (`bop`: hr_items.tradeable false, value 0, so the market, the shop and the dispatch
   refuse them: the design's "keys don't trade", and Cinders can't either, or gold would buy odds). Storage still moves them between
   one account's heroes ("that is still you"). */
export const CHEST_ITEM_ROWS = Object.freeze({
  ...Object.fromEntries(CHEST_KEYS.map((k) => [k.item, Object.freeze({ n: k.name, v: 0, bop: true, type: 'key', tag: 'tower_key',
    towerKey: k.id })])),
  [CINDERS]: Object.freeze({ n: 'Tower Cinders', v: 0, bop: true, tag: 'fuel' }),
});

/* One line an item (src/data/item-descriptions.js spreads it). Drafts in the design's voice, not through the reader gate. */
export const CHEST_ITEM_DESC = Object.freeze({
  tower_key_bronze: 'An old Keeper\'s key from the Burning Tower. It opens the chest on the Great Hearth\'s ledge once',
  tower_key_silver: 'A Keeper\'s key from the Tower\'s middle landings. The chest on the ledge gives more for it',
  tower_key_gold: 'A Keeper\'s key from high up the Tower. The chest on the ledge gives a lot for it',
  tower_key_platinum: 'A key from the Tower\'s top landings, still warm. The chest on the ledge gives the most for it',
  [CINDERS]: 'Embers from the Tower\'s own fire. Burn them in the Hearth, or stoke the chest with them for luck',
});
