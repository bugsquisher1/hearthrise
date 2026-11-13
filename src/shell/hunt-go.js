// ════════════════════════════════════════════════════════════════════════
// src/shell/hunt-go.js — GOING HUNTING: AS WHICH SETUP, WITH WHAT, AND WITH WHOM.
//
// PURE readers of the server's projection for the Hunts window's ground page
// (designer plan 2026-10-22: Hunt prep is absorbed into the moment a hunt is
// chosen). Every number is the envelope's, read again for every patch and
// replaced by the next envelope, never merged upward (CLAUDE.md §6). Nothing
// here gates a press: the server decides each one.
//   setupsOf(cs)        "Go as" (A #1): the setups this hero can put on (the server's
//                       hunt_presets) and the one it is on (hunt_settings.preset), each
//                       with its weapon, the role that weapon plays and, for the one in
//                       use, its bar's first four actions (the only bar the envelope
//                       carries). The default is the setup in use.
//   supplyWords(s, cs, c) THE ONE READER of what a bar will spend, said per kind (Before you go and
//                       Hunt prep both print it, so they can never disagree; Andy #74): food, drink
//                       and runes in slot order ("Food: 20 Cooked Shrimp of yours, then Salted Shrimp
//                       from the store, 14 gp each"), ammo in the engine's own order (shotPlan). `c` is
//                       what the hero can use NOW (item-sections.js carriedOf: the hunt bag in a hunt).
//   beforeLines(cs, o)  "Before you go" (A #5): supplyWords, the stamina when it will end the hunt
//                       soon, the gold when the store is paid from it, no weapon, held tasks that do
//                       not count on this ground, and the Blessings on. A line shows only when it informs, and never stops the press.
//   freeHeroes(cs, all) "Bring your heroes" (B #3): this account's other open
//                       characters that sit in no party (own characters join at once,
//                       PARTY_SPEC 10-19).
// ════════════════════════════════════════════════════════════════════════
import { settingsOf, staminaOf } from '../session/hunt-sections.js?v=0.2.125';
import { presetsOf, equipmentOf, goldOf, nameOf, carriedOf, skillsOf, blessingsOf } from '../session/item-sections.js?v=0.2.125';
import { partyMembershipOf, huntName } from '../session/party-sections.js?v=0.2.125';
import { tallyOf, countsWords } from '../session/tally-sections.js?v=0.2.125';
import { ITEMS } from '../data/items.js?v=0.2.125';
import { HUNT_ROLES, wornRoleKey, roleForWeapon, shootsItem } from '../data/hunt-roles.js?v=0.2.125';
import { attackOrder, DEFAULT_ATTACK_ROW, runeSupplyOf } from '../core/hunt/conditions.js?v=0.2.125';
import { ammoPerShot } from '../core/ammo.js?v=0.2.125';
import { CONSUMABLES } from '../data/consumables.js?v=0.2.125';
import { ABILITIES } from '../data/abilities.js?v=0.2.125';
import { storeOf, storeName, moveOffWeapon } from './bar-draft.js?v=0.2.125';
import { itemName, runeWords } from './widgets/bits.js?v=0.2.125';
import { ownCount } from './rune-supply.js?v=0.2.125';
import { shortOf } from './item-lore.js?v=0.2.125';
import { whole, gold } from '../render/format.js?v=0.2.125';
import { t } from '../render/player-text.js?v=0.2.125';

/* How many of the bar's actions a setup line shows. */
const SETUP_ICONS = 4;
/* Stamina under this much is said as the short of it; above it, what it means for a player about to walk away (panel 2026-11-01:
   8 h away on 3 h 17 of stamina, 5 h 46 idle with no word before leaving). */
const STAMINA_SAY_MS = 2 * 3600000;

/* The role a worn set plays (src/data/hunt-roles.js, the ONE weapon -> role source: the weapon and the shield
   beside it), or null with no weapon. */
const roleOfGear = (gear) => (gear && gear.weapon && ITEMS[gear.weapon] ? roleForWeapon(wornRoleKey(gear, ITEMS), null) : null);

/**
 * "Go as": [{ preset, name, inUse, weapon, role, roleWords, bar }] in setup order, or null when the server
 * sent no hunt_settings. `bar` is the first SETUP_ICONS actions of the setup in use, null for the others.
 */
export function setupsOf(cs) {
  const s = settingsOf(cs);
  if (!s) return null;
  const saved = presetsOf(cs) || [];
  const named = (n) => (s.presets.find((p) => p.preset === n) || saved.find((p) => p.preset === n) || {}).name || 'Setup ' + (n + 1);
  const ids = new Set(saved.map((p) => p.preset).concat([s.preset]));
  return Array.from(ids).sort((a, b) => a - b).map((n) => {
    const inUse = n === s.preset;
    const p = saved.find((x) => x.preset === n);
    /* The setup in use wears what the hero has on now (the server's equipment); another wears its saved gear. */
    const weapon = inUse ? (equipmentOf(cs) || {}).weapon || null : (p && p.gear.weapon) || null;
    const role = inUse && s.role && HUNT_ROLES[s.role] ? s.role : roleOfGear(inUse ? equipmentOf(cs) : p && p.gear);
    return {
      preset: n, name: named(n), inUse, weapon, role, roleWords: role ? HUNT_ROLES[role].label : null,
      bar: inUse ? s.slots.filter((sl) => !sl.empty).slice(0, SETUP_ICONS).map((sl) => sl.action) : null,
    };
  });
}

const KIND_WORDS = Object.freeze({ food: 'Food', drink: 'Drink', rune: 'Runes' });

/* What one bar slot spends: { kind, own: { id, n } | null, store: { name, price, each } | null, off }, or null. A slot
   switched Off never fires. An ammo slot is shotPlan's: the bar's order is not the order arrows fly in. */
function slotSupply(sl, s, carried) {
  if (!sl || sl.empty || sl.enabled === false) return null;
  const a = sl.action;
  const have = (id) => (carried.find((r) => r.id === id) || {}).qty || 0;
  const st = storeOf(a, s.store);
  const store = st && st.price !== null ? { name: st.name, price: st.price, each: a.type === 'ability' ? 'a cast' : 'each' } : null;
  /* A slot the server struck because the store is off for this hero buys nothing, nor does one naming a store rune above its level. */
  const off = sl.why === 'store_off' || sl.why === 'store_level';
  if (a.type === 'consume') {
    const c = CONSUMABLES[a.id];
    if (!c || !KIND_WORDS[c.kind]) return null;
    /* A store row IS the slot's item: it is bought per use; anything else is own stock (the server's count). */
    return c.source === 'store' ? { kind: c.kind, own: null, store: off ? null : store, off }
      : { kind: c.kind, own: { id: a.id, n: Number.isInteger(sl.count) ? sl.count : have(a.id) }, store: null, off };
  }
  if (a.type === 'ability' && ABILITIES[a.id] && ABILITIES[a.id].rune) {
    /* a move the worn weapon can't use never fires, so it spends nothing (a club hero warned about Flame Volley's runes, QA 2026-11-04) */
    if (moveOffWeapon(s.discipline, a.id)) return null;
    /* a rune spell spends the runes its slot ticked (Tyler 2026-11-08, RUNE SUPPLY PER SLOT: rune-supply.js ownCount), and buys only
       when the slot says so, the shop rune it names or its family's tier-1 one (conditions.js runeSupplyOf, the engine's rule) */
    const sup = /** @type {{ onEmpty: string, store: string|null }} */ (runeSupplyOf(a));
    const r = ABILITIES[a.id].rune, n = ownCount(a, carried);
    const bought = sup.onEmpty === 'store' ? storeOf({ ...a, store: sup.store || undefined }, s.store) : null;
    const buys = bought && bought.price !== null ? { name: bought.name, price: bought.price, each: 'a cast' } : null;
    /* the store's rune of that family, the way to fix a slot that leaves the hunt when its runes run out */
    const fam = Array.isArray(s.store) ? s.store.find((x) => x && x.partner === r && Number.isInteger(x.price)) : null;
    return { kind: 'rune', spell: ABILITIES[a.id].n, own: { id: r, n, name: runeWords(r, n) }, store: off ? null : buys, off,
      fix: fam ? { name: storeName(fam.id), price: fam.price } : null };
  }
  return null;
}

/* What a kind with nothing usable means for the hunt. An empty food or drink slot is a heads-up, never a stop: hunting
   without them is a fair choice, HP and mana come back between fights (designer 2026-10-29, Tyler's "0 food" report); food
   the bag carries but the bar does not name is said with the fix. A rune spell that cannot fire only loses that spell, and
   says which. Empty ammo leaves a hero that shoots unable to attack (shotLine's short line). */
const BARE_WORDS = Object.freeze({ food: 'Nothing will be eaten, so HP comes back only between fights',
  drink: 'Nothing will be drunk, so mana comes back only between fights' });
/* The kinds an empty slot of which stops nothing: food and drink (a heads-up line). */
const HEADS_UP_KINDS = Object.freeze(new Set(['food', 'drink']));

/* "You carry 12 Trout. Put it on the bar to eat it", or '': the biggest own stack of a food or drink in `rows`
   (what the hero can use now) that the bar does not name (`named`, a Set of item ids). Display only. */
function spareWords(kind, rows, named) {
  let best = null;
  for (const r of rows || []) {
    const c = CONSUMABLES[r.id];
    if (c && c.kind === kind && c.source !== 'store' && !named.has(r.id) && r.qty > 0 && (!best || r.qty > best.qty)) best = r;
  }
  return best ? 'You carry ' + whole(best.qty) + ' ' + itemName(best.id) + '. Put it on the bar to ' + (kind === 'food' ? 'eat' : 'drink') + ' it' : '';
}

function bareWords(kind, parts, carried) {
  if (kind !== 'rune') return spareWords(kind, carried, new Set(parts.map((p) => (p.own ? p.own.id : null)))) || BARE_WORDS[kind];
  const spells = Array.from(new Set(parts.map((p) => p.spell).filter(Boolean)));
  if (!spells.length) return 'Nothing to cast';
  /* NO UNEXPLAINED DEAD BUTTON (designer 2026-10-29, lane/a-starter-bars): a slot the player set to Carried runes only, with none left
     (no default bar: rule-subjects.js); this line says the fix before the hunt */
  const fixes = Array.from(new Map(parts.filter((p) => p.spell && p.fix).map((p) => [p.fix.name, p.fix])).values());
  return spells.join(' and ') + ' will not fire' + (fixes.length ? '. To cast ' + (spells.length > 1 ? 'them' : 'it') + ', press ' + (spells.length > 1 ? 'each' : 'its')
    + ' slot and pick ' + fixes.map((x) => x.name + ' (' + x.price + ' gp a cast)').join(' or ') + ' under "When your runes run out"' : '');
}

/* Every item the bar's slots name. */
const barNames = (s) => new Set(s.slots.filter((sl) => !sl.empty && sl.enabled !== false && sl.action.type === 'consume').map((sl) => sl.action.id));

/* One part of a supply line: "20 Cooked Shrimp of yours", "no Cooked Shrimp left", "Salted Shrimp from the store, 14 gp each". */
function partWords(p) {
  const name = p.own ? p.own.name || itemName(p.own.id) : '';
  /* a rune a new hero never had is not "left": "no Fire runes of yours". With the store behind it the empty stock says
     nothing ("no Fire runes of yours, then Plain Fire Rune..." read like a robot, first-hour play 2026-10-31). */
  const own = p.own ? (p.own.n > 0 ? whole(p.own.n) + ' ' + name + ' of yours' : p.kind === 'rune' && p.store ? null : 'no ' + name + (p.kind === 'rune' ? ' of yours' : ' left')) : null;
  const store = p.store ? p.store.name + ' from the store, ' + p.store.price + ' gp ' + p.store.each : null;
  return [own, store].filter(Boolean).join(', then ');
}

/* What casts, in slot order. "Then" is a fallback, and it stays inside one spell's own runes and its store rune (partWords): two spells
   are two spends, so they never chain ("Plain Fire Rune..., then Plain Ice Rune..." read as if Ice took over when Fire ran out, played
   2026-11-05). The store runes bought at one price are said together, each once. */
function liveRunes(live) {
  const spends = [], said = new Set();
  for (const p of live) {
    if (p.own && p.own.n > 0) { spends.push({ words: partWords(p) }); if (p.store) said.add(p.store.name); continue; }
    if (said.has(p.store.name)) continue;
    said.add(p.store.name);
    const same = spends.find((x) => x.price === p.store.price);
    if (same) same.names.push(p.store.name);
    else spends.push({ price: p.store.price, names: [p.store.name] });
  }
  const andWords = (n) => (n.length < 2 ? n[0] : n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1]);
  return spends.map((x) => x.words || andWords(x.names) + ' from the store, ' + x.price + ' gp a cast').join('. ');
}

/* THE RUNES LINE: what casts (liveRunes), then the spells that will not fire and their fix. Nothing usable keeps the listed stocks (bareWords). */
function runeLine(parts, carried) {
  const live = parts.filter((p) => (p.own && p.own.n > 0) || p.store);
  if (!live.length) return parts.map(partWords).filter(Boolean).join(', ') + '. ' + bareWords('rune', parts, carried);
  const dead = parts.filter((p) => !live.includes(p) && p.spell);
  return liveRunes(live) + (dead.length ? '. ' + bareWords('rune', dead, carried) : '');
}

/* WHAT A SHOOTER WILL SPEND, IN THE ENGINE'S ORDER (conditions.js attackOrder, damage.js pickShot; Andy #63, #74): the bar's
   ammo slots with conditions, then the worn ammo, then the bar's other ammo, each on what the hero carries; only then, in the
   same order, the store. A free stack with no condition never runs out, so nothing behind it ever flies, the store included.
   A slot's ammo the hero's skill can't use yet is passed over (abilities.js shotLine) and listed in `locked` with its words.
   { order: [ids], own: [{ id, n, free }], store: [storeOf rows], locked: [{ id, text }] }. */
function shotPlan(s, worn, carried, skills) {
  const rows = s.slots.filter((sl) => !sl.empty && sl.enabled !== false && sl.action.type === 'attack_with_item').map((sl) => ({ rule: sl.id, slot: sl }));
  const order = [], locked = [];
  for (const r of attackOrder(rows.concat([DEFAULT_ATTACK_ROW]))) {
    const id = r.slot.action.id === 'loaded' ? worn : r.slot.action.id;
    if (!id || !shootsItem(s.role, ITEMS[id])) continue;
    const short = shortOf(id, skills, null);
    if (short) { if (!locked.some((l) => l.id === id)) locked.push({ id, text: short.text }); continue; }
    const ruled = r.slot.conditions.length > 0, seen = order.find((o) => o.id === id);
    if (seen) seen.ruled = seen.ruled && ruled;
    else order.push({ id, ruled });
  }
  const own = [], store = [];
  let endless = false;
  for (const o of order) {
    const n = (carried.find((r) => r.id === o.id) || {}).qty || 0;
    if (n <= 0) continue;
    const free = ammoPerShot(ITEMS[o.id]) === 0;
    own.push({ id: o.id, n, free });
    if (free && !o.ruled) { endless = true; break; }
  }
  if (!endless && (s.supplySource === 'store' || s.onEmpty === 'switch')) {
    for (const o of order) {
      const st = storeOf({ type: 'attack_with_item', id: o.id }, s.store);
      if (st) store.push(st);
      if (st && !o.ruled) break;
    }
  }
  return { order: order.map((o) => o.id), own, store, locked };
}

/* THE AMMO LINE: { id, text, short, pays }, or null for a hero whose weapon shoots nothing. `short` when nothing can be shot:
   the bar names no shot for a bow that shoots what is worn, so this line is the only warning of a hero that will not attack at
   all (first-hour play 2026-10-31). The free rung shows no count: "49 of yours" read as 49 shots left (designer 2026-10-31). A
   paid stack no shot reaches is said when the hero would otherwise shoot the free rung or pay the store (Andy #74: 27,300
   Mithril Arrows in the bag behind an empty worn slot and free Bronze); a stack the hero's skill can't use yet is never offered. */
function shotLine(s, cs, carried) {
  if (!s.role || !shootsItem(s.role, { slot: 'ammo', reqSkill: 'ranged' })) return null;
  const worn = (equipmentOf(cs) || {}).ammo || null;
  const skills = skillsOf(cs);
  const plan = shotPlan(s, worn, carried, skills);
  const waiting = plan.locked.map((l) => ' ' + itemName(l.id) + ' wait on your bar. ' + l.text + '.').join('');
  const dry = !!worn && shootsItem(s.role, ITEMS[worn]) && !((carried.find((r) => r.id === worn) || {}).qty > 0) ? 'no ' + itemName(worn) + ' left' : null;
  if (!plan.own.length && !plan.store.length) {
    const spare = carried.find((r) => r.qty > 0 && shootsItem(s.role, ITEMS[r.id]) && !shortOf(r.id, skills, null));
    return { id: 'ammo', text: 'Ammo: ' + (dry || 'nothing loaded') + ', so your weapon can\'t shoot and your hero won\'t attack. '
      + (spare ? 'Open your bag, press ' + itemName(spare.id) + ', then Put on the bar.' : 'Press an empty slot on your bar, then Ammo, and pick a shot from the store.') + waiting, short: true, pays: false };
  }
  const parts = (dry ? [dry] : [])
    .concat(plan.own.map((o) => (o.free ? itemName(o.id) : whole(o.n) + ' ' + itemName(o.id) + ' of yours') + (o.id === worn ? (o.free ? ' loaded' : ', loaded') : '')))
    .concat(plan.store.map((st) => st.name + ' from the store, ' + st.price + ' gp each'));
  const idle = plan.own.length && !plan.own[0].free ? []
    : carried.filter((r) => r.qty > 0 && shootsItem(s.role, ITEMS[r.id]) && ammoPerShot(ITEMS[r.id]) > 0 && !plan.order.includes(r.id) && !shortOf(r.id, skills, null));
  const spare = idle.reduce((best, r) => (!best || r.qty > best.qty ? r : best), null);
  return { id: 'ammo', text: 'Ammo: ' + parts.join(', then ') + '.' + (plan.own.some((o) => o.free) ? ' They never run out.' : '')
    + (spare ? ' You carry ' + whole(spare.qty) + ' ' + itemName(spare.id) + ': put them on the bar to shoot them.' : '') + waiting, short: false, pays: plan.store.length > 0 };
}

/** The hunt screen's warning: a hero hunting with a weapon that can shoot nothing won't attack at all (the panel 2026-11-01
    lost 10 minutes and 784 gp to a silent hunt screen before the no-fight end), or '' when it can. */
export function noShotWords(cs) {
  const s = settingsOf(cs);
  const shot = s ? shotLine(s, cs, carriedOf(cs) || []) : null;
  return shot && shot.short ? shot.text.replace(/^Ammo: /, '') : '';
}

/* HELD TASKS THAT DO NOT COUNT HERE (the panel 2026-11-01: 11 h at 0/120 because the list had moved its pick): said, never
   a stop. Quiet with no open task, or when any open task counts on this ground. */
function tallyElsewhere(cs, hunt) {
  const tally = tallyOf(cs);
  const open = tally && hunt ? tally.held.filter((h) => !h.done) : [];
  if (!open.length || open.some((h) => h.hunt === hunt)) return null;
  return { id: 'tally', text: 'Tamsin\'s tasks: nothing here counts toward them. ' + open.map((h) => countsWords(h.task, huntName(h.hunt))).join(' '), short: false };
}

/**
 * WHAT THE BAR WILL SPEND, per kind: { lines: [{ id, text, short }], paysStore }. `carried` is what the hero can use now
 * (carriedOf). `short` marks a shooter with nothing to shoot; an empty food or drink slot or a dead spell is never a stop.
 */
export function supplyWords(s, cs, carried) {
  const out = [];
  const kinds = new Map();
  const seen = new Set();
  for (const sl of s.slots) {
    const p = slotSupply(sl, s, carried);
    if (!p) continue;
    /* Two slots spending the same stock (two spells of one family) say it once. */
    if (p.own && seen.has(p.own.id)) p.own = null;
    else if (p.own) seen.add(p.own.id);
    if (!p.own && !p.store && !p.off) continue;
    if (!kinds.has(p.kind)) kinds.set(p.kind, []);
    kinds.get(p.kind).push(p);
  }
  const shot = shotLine(s, cs, carried);
  if (shot) out.push({ id: shot.id, text: shot.text, short: shot.short });
  let paysStore = !!shot && shot.pays;
  for (const [kind, parts] of kinds) {
    const words = parts.map(partWords).filter(Boolean);
    const usable = parts.some((p) => (p.own && p.own.n > 0) || p.store);
    if (parts.some((p) => p.store)) paysStore = true;
    if (kind === 'rune') { out.push({ id: kind, text: KIND_WORDS[kind] + ': ' + runeLine(parts, carried), short: false }); continue; }
    /* A food or drink the bag holds and no slot names goes unused, whatever else the bar buys (panel 2026-11-01: 78 Turnip Juice sat
       through a hunt under "Drink: from the store"; a slot names ONE item, Tyler 2026-10-21): said beside what the bar will do. */
    const spare = usable && HEADS_UP_KINDS.has(kind) ? spareWords(kind, carried, barNames(s)) : '';
    /* nothing usable: the stocks are listed, never chained with "then" (no fallback runs between empties) */
    out.push({ id: kind, text: KIND_WORDS[kind] + ': ' + (words.length ? words.join(usable ? ', then ' : ', ') : 'nothing this bar can use') + (usable ? '' : '. ' + bareWords(kind, parts, carried)) + (spare ? '. ' + spare : ''), short: false });
  }
  /* A kind the bar has no slot for at all, with a stack waiting. */
  for (const kind of HEADS_UP_KINDS) {
    const spare = !kinds.has(kind) && (kinds.has('food') || kinds.has('drink')) ? spareWords(kind, carried, barNames(s)) : '';
    if (spare) out.push({ id: kind, text: KIND_WORDS[kind] + ': no slot on your bar. ' + spare, short: false });
  }
  if (!kinds.has('food') && !kinds.has('drink')) out.push({ id: 'none', text: 'Your bar eats and drinks nothing: HP and mana come back only between fights.', short: false });
  return { lines: out, paysStore };
}

/**
 * "Before you go": [{ id, text, short }] for the setup in use, or null when the server sent no bar.
 * `o.other` names another setup chosen under Go as: its bar is not in the envelope, so one line says
 * its supplies follow its own bar. `short` marks a line that will stop the hunt or leaves it bare. `o.hunt` names the
 * ground picked, for the line about held tasks.
 */
export function beforeLines(cs, o) {
  const s = settingsOf(cs);
  if (!s) return null;
  const out = [];
  let paysStore = false;
  if (o && o.other) out.push({ id: 'other', text: 'Supplies: as ' + o.other + '’s own bar sets them. It shows here once that setup is on.', short: false });
  else {
    const worn = equipmentOf(cs);
    if (worn && !worn.weapon) out.push({ id: 'weapon', text: 'Weapon: none on, so your hero fights bare-handed. Put one on from your bag.', short: true });
    const said = supplyWords(s, cs, carriedOf(cs) || []);
    out.push(...said.lines);
    paysStore = said.paysStore;
  }
  const tally = tallyElsewhere(cs, o && o.hunt);
  if (tally) out.push(tally);
  const st = staminaOf(cs);
  if (st && st.msLeft <= 0) out.push({ id: 'stamina', text: 'No stamina left. Rest in town before you go.', short: true });
  else if (st) {
    const m = Math.floor(st.msLeft / 60000);
    const left = (m >= 60 ? Math.floor(m / 60) + ' h ' : '') + (m % 60) + ' min';
    out.push({ id: 'stamina', text: st.msLeft < STAMINA_SAY_MS ? 'Stamina: ' + left + ' left, then the hunt ends.'
      : 'Stamina: ' + left + '. Your hero hunts that long, even with the game closed, then comes home.', short: false });
  }
  const gp = goldOf(cs);
  if (paysStore && gp !== null) {
    out.push(gp > 0 ? { id: 'gold', text: 'Gold: ' + gold(gp) + ' pays the store as you use it.', short: false }
      : { id: 'gold', text: 'No gold for the store, so the hunt ends when your own supplies run out.', short: true });
  }
  const bless = blessingWords(blessingsOf(cs));
  if (bless) out.push({ id: 'blessings', text: bless, short: false });
  return out;
}

/* WHAT A DEATH WOULD COST, said before the risk is taken: the Blessings on, or the next one and its price. A heads-up, never a stop. All the server's. */
function blessingWords(b) {
  if (!b || !b.tiers.length) return '';
  const on = b.tiers.filter((r) => r.held).length, next = b.tiers.find((r) => !r.held);
  const vars = { on, of: b.tiers.length, pct: Math.round(b.permille / 10), price: next ? gold(next.price) : '', level: b.freeUntil };
  if (!next) return t('prep.blessings_all', vars);
  /* While the next one is free, the summary's Bless step is the one place that says it, with its press (first-30 play 2026-11-12:
     a new hero was told three times); a priced Blessing is a real choice, so Before you go names its price. */
  if (next.price === 0 && Number.isInteger(b.freeUntil)) return '';
  const how = next.price > 0 ? '_cost' : '';
  return t('prep.blessings_' + (on ? 'some' : 'none') + how, vars);
}

/** "Bring your heroes": this account's other open characters in no party, [{ slot, name }]. */
export function freeHeroes(cs, all) {
  return (all || []).filter((o) => o && o !== cs && o.status !== 'closed' && Number.isInteger(o.slot) && !partyMembershipOf(o))
    .map((o) => ({ slot: o.slot, name: nameOf(o) || 'Character ' + (o.slot + 1) }));
}
