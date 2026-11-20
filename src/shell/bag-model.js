// ════════════════════════════════════════════════════════════════════════
// src/shell/bag-model.js — WHAT THE BAG SHOWS, AND WHAT A BULK SALE WOULD NAME.
//
// PURE (no DOM). The bag window, the shop, the gear window and the tests read
// these. Every count comes from the server's `inventory`; every price from its
// `shop.bids` (src/session/item-sections.js). This file only filters, sorts and
// adds up what the server sent, for display and for the NAMES a sale intent
// carries; the server re-checks every line under the character lock.
//
//   kindOf(id)            the pocket's kind: gear, ammo, food, drink, junk, material, rare, other. A monster's drop
//                         that a recipe, the House or Tempering spends, or that is kept for a planned use (an
//                         imbuement's ingredient), is a material; one nothing spends or will spend is junk (Tyler
//                         2026-11-08: "if its a monster drop that is only good for selling, the category should just be Junk")
//   view(items, o)        one category, a search, a sort (the remembered choice; the
//                         Inventory's and the Storage window's, each its own residue)
//   sellPlan(items, ids)  the lines a bulk sale sends; LOCKED stacks are never named
//   bagValue(items, bids) the bag's worth at the server's bids
//   isNew / markSeen      the "new" mark (residue `bagSeen`, display only)
//   statLines / compare   an item's stats in words, and the change against the worn one: the ladder's numbers and its own
//                         attribute (a resistance, a bane: the engine's readers, so a new unique needs no code)
//   baneKindName(cls)     a bane's monster kind as the Bestiary names it
//   equipSlotFor(id, eq)  the slot an item would go into
//   riteOf / cookOf       the bench recipe that spends a whole stack (Burn all, Cook all)
//   namedFuelOf(id)       a named Hearth fuel's row (src/data/hearth.js): burnt alone, never sold in bulk
//   upgradeNeeds(h, c)    what the House's next steps need, and what those are made from: Sell all loot keeps it
//   isSpentMaterial(id)   does any recipe, House price or Tempering rung spend this?
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js?v=0.2.143';
import { FAMILY_SKILL } from '../data/skills.js?v=0.2.143';
import { DRINK_ITEMS } from '../data/drinks.js?v=0.2.143';
import { MONSTERS } from '../data/monsters.js?v=0.2.143';
import { ARTISAN_RECIPES } from '../data/recipes.js?v=0.2.143';
import { NAMED_FUELS } from '../data/hearth.js?v=0.2.143';
import { CHEST_OUTFITS } from '../data/chests.js?v=0.2.143';
import { roleForWeapon, wornRoleKey, shootsItem } from '../data/hunt-roles.js?v=0.2.143';
import { expandItemSlot, TREES, ROCKS, FISH_SPOTS, CROPS } from '../data/gathering.js?v=0.2.143';
import { SHOP_OFFERS } from '../data/shops.js?v=0.2.143';
import { HELD_HOME_OFFERS, HELD_HOME_ROOMS, STORAGE_CHESTS } from '../data/homestead-tiers.js?v=0.2.143';
import { START_INVENTORY, START_EQUIPMENT } from '../data/start-kit.js?v=0.2.143';
import { TEMPER_MATERIALS } from '../data/temper.js?v=0.2.143';
import { recipeInputs } from '../core/artisan.js?v=0.2.143';
import { BAG_SEEN_MAX } from '../session/residue.js?v=0.2.143';
import { itemName } from './widgets/bits.js?v=0.2.143';
import { HERO_RESIST_KEYS } from '../data/elements.js?v=0.2.143';
import { baneIndex, baneMultFor, MONSTER_CLASSES as BANE_CLASSES } from '../core/bane.js?v=0.2.143';
import { MONSTER_CLASSES } from '../data/monster-classes.js?v=0.2.143';
import { t } from '../render/player-text.js?v=0.2.143';
import { bandOf } from '../core/drops.js?v=0.2.143';
import { REVEAL_BANDS } from '../data/loot-bands.js?v=0.2.143';

/* The category row, in reading order. `all` first; the rest are kinds. */
export const BAG_CATS = Object.freeze([
  ['all', 'All'], ['gear', 'Gear'], ['food', 'Food'], ['drink', 'Drinks'], ['ammo', 'Ammo & runes'],
  ['junk', 'Junk'], ['material', 'Materials'], ['rare', 'Rare'], ['other', 'Other'],
]);
export const BAG_SORTS = Object.freeze([['type', 'Type'], ['value', 'Value'], ['newest', 'Newest'], ['count', 'Count'], ['name', 'Name']]);
/* A non-gear item at these rungs, or a trophy / cosmetic / quest piece, files under Rare (it is kept, not spent). */
const RARE_RUNGS = new Set(['epic', 'legendary', 'mythic']);
const RARE_TAGS = new Set(['trophy', 'cosmetic', 'quest']);
const KIND_ORDER = new Map(BAG_CATS.map(([id], i) => [id, i]));
/* The most of one stack a sale line may name (supabase/functions/hr-accrue/request.js MAX_QTY). */
const SELL_LINE_MAX = 1000;

let DROPS = null;
/* Every item some monster drops (the bestiary rows), built once. */
function dropSet() {
  if (DROPS) return DROPS;
  DROPS = new Set();
  for (const m of Object.values(MONSTERS)) for (const d of (m && m.drops) || []) if (d && d.id) DROPS.add(d.id);
  return DROPS;
}

let INPUTS = null;
/* Every item some recipe spends (bars, planks, blanks...), built once from the recipe rows. */
function inputSet() {
  if (INPUTS) return INPUTS;
  INPUTS = new Set();
  for (const rows of Object.values(ARTISAN_RECIPES)) for (const r of rows || []) if (r) for (const id of Object.keys(recipeInputs(r) || {})) INPUTS.add(id);
  return INPUTS;
}

let MADE = null;
/* Every item a hero can make or gather (recipe outputs, gathering nodes, crops), built once. A monster may drop some too:
   that does not make Copper Ore or a Timber Beam "loot" (panel 2026-11-01: Sell all loot sold beams the Manor asks for). */
function madeSet() {
  if (MADE) return MADE;
  MADE = new Set();
  for (const rows of Object.values(ARTISAN_RECIPES)) for (const r of rows || []) if (r && r.output) MADE.add(r.output);
  for (const nodes of [TREES, ROCKS, FISH_SPOTS, Object.values(CROPS)]) for (const n of nodes) if (n && n.prod) MADE.add(n.prod);
  return MADE;
}

/* What every new hero starts with (src/data/start-kit.js, the source of the server's hr_start_inventory): the Weighhouse won't list it. */
const KIT = new Set([...Object.keys(START_INVENTORY), ...Object.values(START_EQUIPMENT)]);
/** Is this in the starting kit? */
export const isStartKit = (id) => KIT.has(id);
/* A kit piece reforged at the bench into its own slot (Klappa's Club, style-gear.js): the kit holds one and nothing sells another, so a sale is the end of it. */
const KIT_MADE = new Map();
for (const rows of Object.values(ARTISAN_RECIPES)) for (const r of rows || []) if (r && ITEMS[r.output]) for (const id of Object.keys(recipeInputs(r) || {})) if (KIT.has(id) && ITEMS[id] && ITEMS[id].slot && ITEMS[id].slot === ITEMS[r.output].slot) KIT_MADE.set(r.output, id);
/** The kit piece this one was made from, or null. */
export const madeFromKit = (id) => KIT_MADE.get(id) || null;

let HOME_SPENDS = null;
/* Every item some House price names, built once: the deeds and rooms a player can reach (no held offer, no rung of a held
   room: homestead-tiers.js), and the storage chests. */
const heldRoomRung = (o) => (o.grant || []).some((g) => g && HELD_HOME_ROOMS.some((r) => g.id === 'room:' + r));
function homeSpends() {
  if (HOME_SPENDS) return HOME_SPENDS;
  HOME_SPENDS = new Set();
  const held = new Set(HELD_HOME_OFFERS);
  for (const o of SHOP_OFFERS) if ((o.table === 'property' || o.table === 'room') && !held.has(o.id) && !heldRoomRung(o)) for (const c of o.cost || []) if (c.kind === 'item') HOME_SPENDS.add(c.id);
  for (const c of STORAGE_CHESTS) for (const id of Object.keys(c.cost || {})) if (id !== 'gold') HOME_SPENDS.add(id);
  return HOME_SPENDS;
}
/** Does a House price name this item? */
export const houseSpends = (id) => homeSpends().has(id);
/* What a Tempering rung takes besides gold (src/data/temper.js TEMPER_MATERIALS). */
const TEMPER_SPENDS = new Set(Object.values(TEMPER_MATERIALS).map((m) => m.item));
/** Does a Tempering rung take this item? */
export const temperSpends = (id) => TEMPER_SPENDS.has(id);
/**
 * Is this item kept for a use the game plans but has not built? An imbuement's ingredient (src/data/imbuements.js: every IMBUE_ITEMS
 * row carries `imbue: { kind, tier }`, the imbuement it will feed, Element Ward's ward items included) is a Material now and never
 * bulk-sold: Tyler, only get rid of what we are not planning to use, and imbuement items are never NPC-sold unless ticked (ruling
 * 2026-10-14). From the rows, so a new ground's imbuement drop files itself.
 */
export const plannedUse = (id) => !!(ITEMS[id] && ITEMS[id].imbue);
/** Does any recipe, House price or Tempering rung spend this item? From the rows, so a new recipe or rung needs no list. */
export const isSpentMaterial = (id) => inputSet().has(id) || homeSpends().has(id) || TEMPER_SPENDS.has(id);

/** A Rare row: a revealed band (a Rare or Trophy row), not a server-only surprise. */
export const isRareRow = (d) => !!d && d.lucky !== true && d.salvage !== true && d.ch < 1 && REVEAL_BANDS.includes(bandOf(d));
let RARE_ITEMS = null;
/** Is this item a Rare somewhere (the Hunts page's own test, and the away card's "Best find")? From the rows, built once. */
export function isRareItem(id) {
  if (!RARE_ITEMS) { RARE_ITEMS = new Set(); for (const m of Object.values(MONSTERS)) for (const d of (m && m.drops) || []) if (isRareRow(d)) RARE_ITEMS.add(d.id); }
  return RARE_ITEMS.has(id);
}
let EVERYDAY = null;
/** Is this item a Rare wherever it drops (Rook's Whistle), not a ground's everyday piece as well (the Iron Helm: Rare on the Thicket's den mother, Scarce in the Glade)? */
export function isRareOnly(id) {
  if (!EVERYDAY) { EVERYDAY = new Set(); for (const m of Object.values(MONSTERS)) for (const d of (m && m.drops) || []) if (d && d.lucky !== true && d.salvage !== true && !isRareRow(d)) EVERYDAY.add(d.id); }
  return isRareItem(id) && !EVERYDAY.has(id);
}

/** The pocket's kind, from the catalogue row (and the drop and recipe rows, so a new row files itself). */
export function kindOf(id) {
  const it = ITEMS[id];
  if (DRINK_ITEMS[id]) return 'drink';
  if (!it) return 'other';
  if (it.slot === 'ammo' || it.type === 'ammo' || /_(arrows|rune)$/.test(id)) return 'ammo';
  if (it.slot) return 'gear';
  if (Number(it.heals) > 0) return 'food';
  /* a named Hearth fuel is a rare reveal kept to burn (src/data/hearth.js): Rare, never bulk-sold loot */
  if (NAMED_FUELS[id]) return 'rare';
  /* a trophy is kept, never junk, however it is got (the Rat King's Crown is a boss's drop) */
  if (it.type === 'trophy' || RARE_TAGS.has(it.tag)) return 'rare';
  /* a monster's drop is junk when nothing spends it and a material when something does (a recipe, the House, a Tempering
     rung: Big Bones, Silk Thread, pelts, raw meat) or will (an imbuement's ingredient), unless a hero can make or gather it
     too; a tool is a tool however it is made */
  const made = it.type !== 'tool' && madeSet().has(id);
  /* A RARE IS NEVER JUNK (audit 2026-11-18 A16: "Sell all junk" sold the Alpha Fang the away card had just called the Best find): a drop that is a
     Rare somewhere (isRareItem, the Best find's own test) files under Rare, so no bulk sale sweeps it unasked */
  if (dropSet().has(id) && !made) return isSpentMaterial(id) || plannedUse(id) ? 'material' : isRareItem(id) ? 'rare' : 'junk';
  if (made) return 'material';
  /* the raw flag on a tool is only the shop's bid (BULK_GOODS, src/data/items.js), never its kind */
  if (it.type === 'tool') return 'other';
  if (it.raw || it.tag === 'crafting-mat' || it.seed || inputSet().has(id)) return 'material';
  if (RARE_RUNGS.has(it.rarity)) return 'rare';
  return 'other';
}

/** The rarity ladder name for a framed pocket (gear only; other kinds are plain pockets). */
export function rarityOf(id) {
  const it = ITEMS[id];
  return it && it.slot && it.slot !== 'ammo' ? (it.rarity || 'common') : null;
}

/** Is this stack new: never seen, or more of it than when it was last seen? */
export function isNew(seen, id, qty) {
  const s = seen && seen[id];
  return !s || qty > s[0];
}

/**
 * The seen marks after the player has seen `ids` at their current counts.
 * Returns the new residue value, or null when nothing changed (no write).
 */
export function markSeen(seen, items, ids) {
  const want = new Set(ids);
  const out = Object.assign({}, seen || {});
  let next = 0;
  for (const v of Object.values(out)) if (v[1] >= next) next = v[1] + 1;
  let changed = false;
  for (const { id, qty } of items) {
    if (!want.has(id)) continue;
    const s = out[id];
    if (s && s[0] === qty) continue;
    out[id] = [qty, s && qty <= s[0] ? s[1] : next++];
    changed = true;
  }
  if (!changed) return null;
  const keep = Object.entries(out).sort((a, b) => b[1][1] - a[1][1]).slice(0, BAG_SEEN_MAX);
  return Object.fromEntries(keep);
}

const nameKey = (id) => itemName(id).toLowerCase();

/**
 * One view of the bag: category, search and sort.
 * @param {{id:string, qty:number}[]} items
 * @param {{cat?:string, query?:string, sort?:string, bids?:Map, seen?:object}} o
 */
export function view(items, o) {
  const cat = o.cat || 'all';
  const q = String(o.query || '').trim().toLowerCase();
  const bids = o.bids || new Map();
  const seen = o.seen || {};
  const rows = items.filter((r) => (cat === 'all' || kindOf(r.id) === cat) && (!q || nameKey(r.id).includes(q) || kindOf(r.id).includes(q)));
  const byName = (a, b) => nameKey(a.id).localeCompare(nameKey(b.id));
  const worth = (r) => (bids.has(r.id) ? bids.get(r.id) * r.qty : -1);
  const at = (r) => (isNew(seen, r.id, r.qty) ? Number.MAX_SAFE_INTEGER : seen[r.id][1]);
  const sorts = {
    type: (a, b) => KIND_ORDER.get(kindOf(a.id)) - KIND_ORDER.get(kindOf(b.id)) || byName(a, b),
    value: (a, b) => worth(b) - worth(a) || byName(a, b),
    newest: (a, b) => at(b) - at(a) || byName(a, b),
    count: (a, b) => b.qty - a.qty || byName(a, b),
    name: byName,
  };
  return rows.sort(sorts[o.sort] || sorts.type);
}

let RITES = null;
/**
 * The recipe a skill spends this item on WITHOUT making anything (a recipe row with an `input` and no `output`:
 * Inner Flame's fuels, fuel_bones, fuel_lamp_jelly...), or null. From the recipe rows, so a new fuel needs no code.
 */
export function riteOf(id) {
  if (!RITES) {
    RITES = new Map();
    for (const [skill, rows] of Object.entries(ARTISAN_RECIPES)) for (const r of rows || []) if (r && r.input && !r.output && !RITES.has(r.input)) RITES.set(r.input, { skill, recipe: r, input: r.input, need: r.inputQty || 1 });
  }
  return RITES.get(id) || null;
}

/** A named Hearth fuel's row ({ item, xp, req, flame, secs, chunk }: src/data/hearth.js NAMED_FUELS), or null. */
export function namedFuelOf(id) { return NAMED_FUELS[id] ? Object.assign({ item: id }, NAMED_FUELS[id]) : null; }

/** Is item `id` a chest's super-rare find (an outfit's bundle, src/data/chests.js CHEST_OUTFITS)? A sale's confirmation names it. */
export const isSuperRare = (id) => CHEST_OUTFITS.some((o) => o.item === id);

let COOKS = null;
/**
 * The Cooking recipe that turns this one item into FOOD, or null: { skill:'cooking', recipe, input, need } (need = how many
 * go into one dish). From the recipe rows: a cooking row with exactly one input whose output the bag files as food,
 * not behind a recipe scroll. No id list, so a new raw meat or fish is cookable from the bag the day its row lands
 * (playtest 10-22: Raw Wolf Meat sold for 1 gp because nothing said it cooks). The lowest-level row wins.
 */
export function cookOf(id) {
  if (!COOKS) {
    COOKS = new Map();
    for (const r of ARTISAN_RECIPES.cooking || []) {
      if (!r || !r.output || r.gated || kindOf(r.output) !== 'food') continue;
      const ins = Object.entries(recipeInputs(r));
      if (ins.length !== 1) continue;
      const [input, need] = ins[0];
      const had = COOKS.get(input);
      if (!had || (r.req || 1) < (had.recipe.req || 1)) COOKS.set(input, { skill: 'cooking', recipe: r, input, need: Math.max(1, Number(need) || 1) });
    }
  }
  return COOKS.get(id) || null;
}

/**
 * WHAT THE HOUSE'S NEXT STEPS NEED (panel 2026-11-01: Sell all loot sold Slime Gel while deed III wanted Timber Beams, which are
 * made from it): the Set of items the steps the House window prices now (the server's `home` and `chests`) name, its own word,
 * so Sell all junk keeps even a Junk row a step names. What those are made from needs no walk: a recipe's input is a Material
 * (kindOf), which no bulk sale sweeps. Null when the server has not said (`home` null).
 */
export function upgradeNeeds(home, chests) {
  if (!home) return null;
  const want = new Set();
  const step = (s) => { for (const it of s.items) want.add(it.id); };
  const deed = home.tiers.find((tier) => !tier.owned);
  if (deed) step(deed);
  for (const r of home.rooms) if (r.next && r.opens <= home.tier && r.next.need <= home.tier) step(r.next);
  if (chests && chests.next && chests.next.canBuild) step(chests.next);
  return want;
}

/**
 * The stacks "Sell all junk" sells: the Junk (kindOf: a monster's drop nothing spends), never a Material (Tyler 2026-11-08:
 * a bulk sale never sweeps one unless the player picked it: bones for the Great Hearth, raw meat that cooks, Silk Thread,
 * pelts and whatever else a recipe, the House or Tempering spends), nor anything the House's next steps name (`needs`:
 * upgradeNeeds, the server's own word, null when the House is not read yet). Ids, in the bag's order.
 */
export function lootToSell(items, needs) {
  return (items || []).filter((r) => kindOf(r.id) === 'junk' && !(needs && needs.has(r.id))).map((r) => r.id);
}

/** "Sell all junk": the plan its button shows and sends (src/shell/windows/shop.js) and the coach's `sellable` fact
    reads (src/shell/launcher.js coachFactsOf), ONE function so the card and the button never disagree. `rules` and
    `shop`: the server's sections (rulesOf, shopOf), or null. `needs`: upgradeNeeds. */
export function lootSale(items, rules, shop, needs) {
  return sellPlan(items || [], lootToSell(items, needs), { locked: rules ? rules.locked : null, bids: shop ? shop.bids : null });
}

/** The lines one sale may carry (edge-intents.js EDGE_LIMITS.sellLines, the engine's MAX_SELL_LINES); the summary's Sell step takes one sale's worth. */
export const SELL_LINES_MAX = 64;
/* Worth keeping against what is worn: an empty slot it could fill, or a higher tier than the piece there (an item with no tier: the safe side). */
function aboveWorn(id, worn) {
  const it = ITEMS[id];
  if (!Number.isInteger(it.tier)) return true;
  return expandItemSlot(it.slot).some((s) => { const w = worn && worn[s] ? ITEMS[worn[s]] : null; return !w || (Number.isInteger(w.tier) && it.tier > w.tier); });
}

/** What Equip upgrades would put on (src/shell/upgrade-plan.js: its picks and every choice's pieces): no bulk sale or selection takes one. Pure. */
export const upgradeWanted = (up) => new Set([...((up && up.picks) || []).map((p) => p.id), ...((up && up.choices) || []).flatMap((c) => c.ids)]);

/**
 * GEAR THE HERO HAS OUTGROWN, of any weight or weapon family: never what Equip upgrades would put on (`o.wanted`: upgradeWanted), an empty slot's
 * piece, a higher tier than the piece worn in that slot, the start kit or what the bench made from it, or a stack the player gave a plan to Keep or
 * Deposit. `o.isRare` leaves Rares out too (Sell spare gear: never sold unasked, Tyler 2026-10-14); the bag's "Select outgrown" keeps them in, since
 * the player sees the selection and confirms it (audit F18, 2026-11-15: 41 of 145 outgrown stacks were Rares, a press each). What is worn is not in the
 * bag (the server's inventory). `worn`: equipmentOf. Ids, in the bag's order. Pure.
 */
export function outgrownIds(items, worn, rules, o) {
  const wanted = (o && o.wanted) || new Set();
  const rare = (o && o.isRare) || (() => false);
  const plans = rules ? rules.loot : {};
  return (items || []).filter((r) => kindOf(r.id) === 'gear' && !isStartKit(r.id) && !madeFromKit(r.id) && !wanted.has(r.id) && !rare(r.id) && !aboveWorn(r.id, worn)
    && plans[r.id] !== 'keep' && plans[r.id] !== 'deposit').map((r) => r.id);
}

/**
 * THE RETURN CHORE (designer 2026-11-03; optimizer panel, its quit moment at hour 11-12: "sell-all, hand-sell 17-20 armor stacks"): what "Sell spare gear" sells, ONE sale
 * with its total shown first: the outgrown gear (outgrownIds) with `o.isRare` (hunt-ground-facts.js isRareOnly) left out, and any stack the player locked. Pure.
 */
export function spareSale(items, worn, rules, shop, o) {
  return sellPlan(items || [], outgrownIds(items, worn, rules, o), { locked: rules ? rules.locked : null, bids: shop ? shop.bids : null });
}

/**
 * WHAT "SELL ALL JUNK" LEAVES, in the same words the button is priced from (blind playtest 2026-10-31: "Sell all loot ·
 * 423 gp" over a list worth 1,215, the rule invisible): the monster drops the shop bids on that the button keeps for a use
 * (a Material, or Junk the House's next step names), { ids, worth } at the server's bids. Locked stacks are the
 * confirmation's to say. Pure.
 */
export function lootKept(items, rules, shop, needs) {
  const sold = new Set(lootToSell(items, needs));
  const locked = rules ? rules.locked : new Set();
  const bids = shop ? shop.bids : new Map();
  const drop = (id) => { const k = kindOf(id); return dropSet().has(id) && (k === 'junk' || k === 'material'); };
  const kept = (items || []).filter((r) => drop(r.id) && !sold.has(r.id) && !locked.has(r.id) && bids.has(r.id));
  return { ids: kept.map((r) => r.id), worth: kept.reduce((n, r) => n + bids.get(r.id) * r.qty, 0) };
}

/** What one sale takes of a stack: the server's per-line limit (request.js MAX_QTY). */
export const sellQty = (qty) => Math.min(qty, SELL_LINE_MAX);

/**
 * The sale a bulk action would send: every chosen stack (up to the server's limit a line, SELL_LINE_MAX), minus the
 * locked ones (they are listed in `kept`, never in `lines`). `total` is at the server's
 * bids; a stack with no bid is `unpriced` and is not sold (the confirmation
 * cannot show what the player would get for it). `capped`: a stack held more than one sale takes. ONE SALE CARRIES AT MOST SELL_LINES_MAX
 * stacks (the engine refuses more, so a bigger plan sent whole sold nothing: audit F18, "Sell all gear" over a 145-stack bag): the first that many
 * go, `more` counts the priced stacks left for the next press.
 */
export function sellPlan(items, ids, o) {
  const want = new Set(ids);
  const locked = (o && o.locked) || new Set();
  const bids = (o && o.bids) || new Map();
  const lines = [], kept = [], unpriced = [];
  let total = 0, capped = false, more = 0;
  for (const { id, qty } of items) {
    if (!want.has(id)) continue;
    if (locked.has(id)) { kept.push(id); continue; }
    if (!bids.has(id)) { unpriced.push(id); continue; }
    if (lines.length >= SELL_LINES_MAX) { more++; continue; }
    lines.push({ item: id, qty: sellQty(qty) });
    total += bids.get(id) * sellQty(qty);
    capped = capped || qty > SELL_LINE_MAX;
  }
  return { lines, total, kept, unpriced, capped, more };
}

/** The bag's worth at the server's bids; `unpriced` counts the stacks it has no bid for. */
export function bagValue(items, bids) {
  let total = 0, unpriced = 0;
  for (const { id, qty } of items) {
    if (bids && bids.has(id)) total += bids.get(id) * qty; else unpriced++;
  }
  return { total, unpriced };
}

/* Stat keys in reading order, with their words; `pct` values are fractions. */
const STATS = Object.freeze([
  ['atkB', 'Melee accuracy'], ['strB', 'Melee damage'], ['defB', 'Defense'],
  ['rangeAtkB', 'Ranged accuracy'], ['rangeStrB', 'Ranged damage'],
  ['magicAtkB', 'Magic accuracy'], ['magicStrB', 'Magic damage'],
  ['critB', 'Critical chance', 'pct'], ['steadyPm', 'Damage taken', 'cut'],
  /* +SKILL while worn (src/core/combat.js SKILL_PLUS_FIELDS: a tower weapon's) */
  ['meleePlus', t('bag.stat_melee_plus')], ['rangedPlus', t('bag.stat_ranged_plus')], ['magicPlus', t('bag.stat_magic_plus')], ['defensePlus', t('bag.stat_defense_plus')],
]);

const statValue = (it, k) => (it && Number.isFinite(it[k]) ? it[k] : 0);
/* A PIECE'S RESISTANCE (`resistPm`: { ember | frost | poison | physical: permille less taken }; src/core/elements.js heroElementPermille is the
   engine's read), one line a key in the vocabulary's order: "Fire damage taken −10%", "Physical damage taken −3%". The words are the
   monster page's own element names (src/data/text/monster.js), so fire is called the same thing on both. */
const resistValue = (it, k) => (it && it.resistPm && Number.isFinite(it.resistPm[k]) ? it.resistPm[k] : 0);
const resistLabel = (k) => t('item.resist_taken', { element: t('monster.el_' + k) });
const pctWords = (v) => (Math.round(v * 1000) / 10) + '%';
const cutWords = (v) => Math.abs(v) / 10 + '%';

/** A monster kind's name as the Bestiary says it: bane.js keys "extra_dimensional", the class table "extradimensional". */
export function baneKindName(cls) {
  const row = MONSTER_CLASSES[cls] || MONSTER_CLASSES[String(cls).replace(/_/g, '')];
  return row ? row.name : String(cls);
}
/* A PIECE'S BANE (`bane`: { class, mult } or a list; any worn slot, src/core/bane.js baneIndex), one line a kind in bane.js's order, its value
   the ENGINE's clamped multiplier less one (baneMultFor): "Damage to Vermin monsters +10%". A side-grade's worth is its attribute: left off the
   compare, Kingstooth read as "−1 Melee damage" against the Iron Sword and nothing else (lane/a-compare-lines 2026-11-16, re-landed by
   lane/a-honesty-rescue). The key is the field and its class (`bane.vermin`), as a resistance's is (`resistPm.ember`). */
const baneValue = (it, cls) => (it ? baneMultFor(cls, baneIndex({ piece: 'it' }, { it })) - 1 : 0);
const baneLabel = (cls) => t('item.stat_bane', { kind: baneKindName(cls) });

/** An item's stats as [{ key, label, value, text }] (non-zero only): the ladder's numbers, then its own attribute (a resistance, a bane). */
export function statLines(id) {
  const it = ITEMS[id];
  const out = [];
  for (const [k, label, kind] of STATS) {
    const v = statValue(it, k);
    if (!v) continue;
    out.push({ key: k, label, value: v, text: kind === 'cut' ? '−' + cutWords(v) : (v > 0 ? '+' : '') + (kind === 'pct' ? pctWords(v) : v) });
  }
  for (const k of HERO_RESIST_KEYS) {
    const v = resistValue(it, k);
    if (v > 0) out.push({ key: 'resistPm.' + k, label: resistLabel(k), value: v, text: '−' + cutWords(v) });
  }
  for (const c of BANE_CLASSES) {
    const v = baneValue(it, c);
    if (v > 1e-9) out.push({ key: 'bane.' + c, label: baneLabel(c), value: v, text: '+' + pctWords(v) });
  }
  return out;
}

/** The change wearing `id` instead of `worn` makes, stat by stat: [{ label, delta, text }]. An attribute only one of the two carries is
    a whole gain or a whole loss (Kingstooth against the Iron Sword: "+10% Damage to Vermin monsters"). */
export function compare(id, worn) {
  const a = ITEMS[id], b = worn ? ITEMS[worn] : null;
  const out = [];
  for (const [k, label, kind] of STATS) {
    const d = statValue(a, k) - statValue(b, k);
    if (Math.abs(d) < 1e-9) continue;
    out.push({ label, delta: d, text: kind === 'cut' ? (d > 0 ? '−' : '+') + cutWords(d) : (d > 0 ? '+' : '−') + (kind === 'pct' ? pctWords(Math.abs(d)) : Math.abs(d)) });
  }
  for (const k of HERO_RESIST_KEYS) {
    const d = resistValue(a, k) - resistValue(b, k);
    if (d) out.push({ label: resistLabel(k), delta: d, text: (d > 0 ? '−' : '+') + cutWords(d) });
  }
  for (const c of BANE_CLASSES) {
    const d = baneValue(a, c) - baneValue(b, c);
    if (Math.abs(d) > 1e-9) out.push({ label: baneLabel(c), delta: d, text: (d > 0 ? '+' : '−') + pctWords(Math.abs(d)) });
  }
  return out;
}

/* A WEAPON'S FIGHTING STYLE (skills.js FAMILY_SKILL: melee, ranged or magic, by its weaponType) and the stats that style fights with: a
   weapon never uses another style's numbers. */
const STYLE_STATS = Object.freeze({ melee: ['atkB', 'strB', 'meleePlus'], ranged: ['rangeAtkB', 'rangeStrB', 'rangedPlus'], magic: ['magicAtkB', 'magicStrB', 'magicPlus'] });
const styleOf = (id) => (id && ITEMS[id] ? FAMILY_SKILL[ITEMS[id].weaponType] || null : null);
const styleGain = (id, worn, style) => (STYLE_STATS[style] || []).reduce((n, k) => n + statValue(ITEMS[id], k) - statValue(worn ? ITEMS[worn] : null, k), 0);

/**
 * THE ORDER A SLOT'S FITS ARE LISTED IN, best first (the doll's list, windows/inventory/doll.js). `fits` [{ id, delta: compare(id, worn) }].
 * Any slot but the weapon: by the sum of its changes. THE WEAPON (post-140 audit C6: an Oak Wand read +2 over a worse sword to an Iron Sword
 * hero, its magic numbers summed against the sword's melee ones): the hero's own style first (the worn weapon's), each by its gain in the
 * stats that style fights with; another style's weapons after, by their own style's. No weapon worn: one list, each by its own style. Pure.
 */
export function sortFits(slot, fits, worn) {
  const sum = (f) => f.delta.reduce((n, d) => n + d.delta, 0);
  if (slot !== 'weapon') return fits.slice().sort((a, b) => sum(b) - sum(a));
  const mine = styleOf(worn);
  const rank = new Map(fits.map((f) => { const st = styleOf(f.id); return [f, { other: mine && st !== mine ? 1 : 0, gain: styleGain(f.id, worn, st) }]; }));
  return fits.slice().sort((a, b) => rank.get(a).other - rank.get(b).other || rank.get(b).gain - rank.get(a).gain || sum(b) - sum(a));
}

/** The equip slot an item goes into: its own slot, or the free one of a pair (rings). Null when it is not worn. */
export function equipSlotFor(id, equipment) {
  const it = ITEMS[id];
  const slots = it && it.slot ? expandItemSlot(it.slot) : [];
  if (!slots.length) return null;
  const eq = equipment || {};
  return slots.find((s) => !eq[s]) || slots[0];
}

/** The ONE `equip` delta that wears `id` in `slot` (null = take it off). Two hands (Tyler 2026-10-19:
 *  Healer = staff): a two-handed weapon takes the off-hand off, and an off-hand takes a two-handed
 *  weapon off, in the same delta, because hr_apply refuses the pair (two_handed) on the worn set. */
export function equipOps(slot, id, equipment, loads) {
  const ops = { [slot]: id };
  const eq = equipment || {};
  const it = id ? ITEMS[id] : null;
  if (it && slot === 'weapon' && it.twoHanded === true && eq.shield) ops.shield = null;
  const worn = eq.weapon ? ITEMS[eq.weapon] : null;
  if (it && slot === 'shield' && worn && worn.twoHanded === true) ops.weapon = null;
  /* A BOW NEVER GOES ON EMPTY (first-hour play 2026-10-31: the kit's bow shot nothing, 0 kills in 7 minutes, with 50 arrows
     in the bag: the engine looses only what is loaded, damage.js pickShot). Taking up a shooter loads a shot in this delta. */
  if (it && slot === 'weapon' && loads) {
    const shot = shotToLoad(Object.assign({}, eq, ops), loads.bag, loads.skills);
    if (shot) ops.ammo = shot;
  }
  return ops;
}

const STYLE_NAME = Object.freeze({ tank: 'a shield tank', melee_dps: 'a Melee hero', ranger: 'a Ranger', mage: 'a Mage', healer: 'a Healer' });
/**
 * What a press of Equip changed about how the hero fights, in words, or null when the style is the same: the bar's
 * moves follow the weapon with no other sign on screen (first-hour play 2026-10-31). `eq`: the worn set; `ops`: the delta.
 */
export function styleWords(eq, ops) {
  const before = roleOfSet(eq), now = roleOfSet(Object.assign({}, eq, ops));
  if (!now || now === before) return null;
  return 'Style: ' + STYLE_NAME[now] + ', bar updated' + (ops.ammo ? '. ' + itemName(ops.ammo) + ' loaded' : '');
}

/** The role the worn set `gear` plays (the weapon and the shield beside it), or null. */
export function roleOfSet(gear) {
  return gear && gear.weapon && ITEMS[gear.weapon] ? roleForWeapon(wornRoleKey(gear, ITEMS)) : null;
}

/**
 * The ammo to load for the worn set `gear`, or null: nothing when its role does not shoot or what is loaded can be shot.
 * Of what `bag` ([{ id, qty }]) holds that the role can loose, the highest requirement the hero's `skills` meet (a stack
 * the server would refuse is never named). Display and intent only: the server checks the delta.
 */
function shotToLoad(gear, bag, skills) {
  const role = roleOfSet(gear);
  if (!role || (gear.ammo && shootsItem(role, ITEMS[gear.ammo]))) return null;
  let best = null;
  for (const r of bag || []) {
    const it = r && r.qty > 0 ? ITEMS[r.id] : null;
    if (!it || !shootsItem(role, it)) continue;
    const have = skills && skills[it.reqSkill] ? skills[it.reqSkill].level : 1;
    const need = Number(it.reqLv) || 1;
    if (need <= have && (!best || need > best.need)) best = { id: r.id, need };
  }
  return best ? best.id : null;
}
