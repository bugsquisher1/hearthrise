// ════════════════════════════════════════════════════════════════════════
// src/data/factions.js — THE TWO SIDES: WHO MAY JOIN, WHAT STANDING IS, WHAT A SWAP COSTS, WHAT EACH QUARTERMASTER KEEPS
//   (docs/design/redesign/25-factions.md, game designer, lane/factions-morrow-hills 2026-11-23; server half
//   supabase/migrations/1065-faction-company.sql and its catalogue, tools/gen-factions.mjs).
//
// The First Flame and the Last Ember. Neither is evil, Havora belongs to neither, and a side gives NO POWER: no stat, no step, no
// modifier, no rule (19-power-ledger.md row 17, 0 steps; validateFactions refuses a row that names any key outside its shape). The sides'
// ids are the ground shape's vocabulary (src/data/grounds/shape.js STANDING_SIDES): a hunt row names the side its ground pays.
//
// THE COMPANY HOLDS THE SIDE (25 section 2.1): one side for all of an account's heroes, picked once, after any hero of the company has a
// server-counted kill of `joinAfter`. Parties and grounds stay open to both sides; only the standing credit reads a side.
// STANDING (25 section 2.3): one point a settled hero-minute on a ground whose `standingFor` is the company's side, credited by the
// server's settle, never by a browser, added to the company's total for that side. Kept per side, never spent, never lost on a swap.
// THE DAY'S CEILING: each HERO is credited at most `dayCapMinutes` of standing and swap time together a UTC day (a fuse: a window counted
// twice still can't pass the clock).
// SWAPPING (25 section 2.2): start a swap, hunt `swapHeroMinutes` (company hero-minutes) on the NEW side's grounds, which pay swap time,
// not standing, then finish it. 40 hero-hours is one day for a four, four for a lone hero. Locked `swapCooldownDays` from joining or the
// last swap. Cancel loses the swap time.
// THE WEEK (25 section 2.5, ships with the social layer): each side's score is the mean of its companies' standing that week, each
// company capped at `frontCapHeroMinutes`. Held here and in the server's rule row so the week's close reads one number.
//
// THE QUARTERMASTER (25 section 2.4): each side's stock, one row a piece, unlocked once at its standing `mark` (hero-minutes, so the
// server never converts). Outfit pieces are free. A hall or mount piece costs gold: `wageHoursPm` thousandths of an hour of the WAGE AT
// THE COMPANY'S TOP LEVEL (src/data/wage.js, the Level step every per-hero cost reads: stockPrice below, hr_faction_piece_price its SQL
// twin). DESIGN CALL (lane/factions-morrow-hills): a company piece is bought once for every hero, so it reads the company's highest
// Level, not the pressing hero's: which hero presses Buy never changes the price, and no one logs into a low alt to shop. The pressing
// hero pays. Looks only. A row with `opensWith` is CLOSED until the system that shows it ships (the hall's wall, mounts): the catalogue
// carries it, every verb refuses it, and the page lists none of it.
//
// THE GROUND RULE (factionGroundProblems, held by tests/faction-ground-balance.mjs): every hunt row names a region; every ground of a region
// after `standingAfter` pays one side and no ground before it pays any; each such region OPENS as many grounds for one side as the other;
// a keyed hall counts with its ground; a region kit that lists a ground agrees on its region.
//
// PURE ESM. Data, a validator, the price and the ground rule. Never imported by the engine or the page (tests/faction-ground-balance.mjs
// FG-EDGE).
// ════════════════════════════════════════════════════════════════════════
import { REGIONS, STANDING_SIDES } from './grounds/shape.js';
import { HUNTS, CALLED_HUNTS, HALL_HUNTS, TRAINING_HUNTS } from './hunts.js';
import { HUNT_GROUNDS } from './hunt-grounds.js';
import { MONSTERS } from './monsters.js';
import { REGION_KITS } from './world/region-kits.js';
import { PEOPLE_TEXT } from './text/people.js';
import { wage, wageStep } from './wage.js';

export const FACTION_RULES = Object.freeze({
  /* The monster whose first server-counted kill, by ANY hero of the company, opens joining: Lord Krell, his hall in Krell's Hold. */
  joinAfter: 'lord_krell',
  /* Every region AFTER this one pays standing on every ground (Tyler: "after krell is killed, each new zone has equal amounts"). */
  standingAfter: 'barrow_march',
  /* LEVER: company hero-minutes on the new side's grounds a swap takes (40 h: a four's day, a lone hero's four). */
  swapHeroMinutes: 2400,
  /* LEVER: days from joining or the last swap before a swap may start. */
  swapCooldownDays: 7,
  /* FUSE: a hero's standing and swap time together, a UTC day. */
  dayCapMinutes: 24 * 60,
  /* LEVER: a company's most hero-minutes counted toward its side's week (40 h, under a lone hero's own week, so bought hours can't move it). */
  frontCapHeroMinutes: 2400,
});

/* THE SIDES (one row each, keyed by STANDING_SIDES). `face` names the src/data/text/people.js row who asks a company to join. */
export const FACTIONS = Object.freeze({
  first_flame: Object.freeze({ face: 'holly' }),
  last_ember: Object.freeze({ face: 'venn' }),
});

/* THE KINDS a stock row may be: what the piece dresses, and whether it is free. */
export const STOCK_KINDS = Object.freeze({
  outfit: Object.freeze({ wear: true, paid: false }),
  outfit_addon: Object.freeze({ wear: true, paid: false }),
  hall_banner: Object.freeze({ wear: false, paid: true }),
  mount_cloth: Object.freeze({ wear: false, paid: true }),
});

const H = 60;
/* THE QUARTERMASTERS' STOCK (25 section 2.4). Marks in company hero-minutes; wageHoursPm in thousandths of a wage hour. */
/** @typedef {{ side: string, mark: number, kind: string, wageHoursPm?: number, opensWith?: string }} StockRow */
/** @type {Readonly<Record<string, Readonly<StockRow>>>} */
export const FACTION_STOCK = Object.freeze({
  flamebearer: Object.freeze({ side: 'first_flame', mark: 40 * H, kind: 'outfit' }),
  flame_banner: Object.freeze({ side: 'first_flame', mark: 120 * H, kind: 'hall_banner', wageHoursPm: 20000, opensWith: 'hall_wall' }),
  flamebearer_shield: Object.freeze({ side: 'first_flame', mark: 200 * H, kind: 'outfit_addon' }),
  flame_saddlecloth: Object.freeze({ side: 'first_flame', mark: 400 * H, kind: 'mount_cloth', wageHoursPm: 30000, opensWith: 'mounts' }),
  flamebearer_light: Object.freeze({ side: 'first_flame', mark: 600 * H, kind: 'outfit_addon' }),
  emberkeeper: Object.freeze({ side: 'last_ember', mark: 40 * H, kind: 'outfit' }),
  ember_banner: Object.freeze({ side: 'last_ember', mark: 120 * H, kind: 'hall_banner', wageHoursPm: 20000, opensWith: 'hall_wall' }),
  emberkeeper_lantern: Object.freeze({ side: 'last_ember', mark: 200 * H, kind: 'outfit_addon' }),
  ember_saddlecloth: Object.freeze({ side: 'last_ember', mark: 400 * H, kind: 'mount_cloth', wageHoursPm: 30000, opensWith: 'mounts' }),
  emberkeeper_coal: Object.freeze({ side: 'last_ember', mark: 600 * H, kind: 'outfit_addon' }),
});

/* THE WEARABLE PIECES (the outfit catalogue's view: src/data/outfits.js STAGED_OUTFITS names them, tools/gen-outfits.mjs and
   tests/pixel-icons.mjs read them): every stock row whose kind is worn, its mark in whole hours. */
export const FACTION_OUTFITS = Object.freeze(Object.fromEntries(Object.entries(FACTION_STOCK)
  .filter(([, p]) => STOCK_KINDS[p.kind] && STOCK_KINDS[p.kind].wear)
  .map(([id, p]) => [id, Object.freeze({ side: p.side, hours: p.mark / H })])));

/* A row's own keys. ANY other key is refused: a side or a piece that names a stat, a step, a modifier or a rule-table key would be
   power, and factions take no slice (19-power-ledger.md row 17). */
const FACTION_KEYS = new Set(['face']);
const STOCK_KEYS = new Set(['side', 'mark', 'kind', 'wageHoursPm', 'opensWith']);

const whole = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;
const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);

/** Is a stock row open (served and claimable)? A row with `opensWith` waits for the system that shows it. Pure. */
export const stockOpen = (p) => !!p && !p.opensWith;

/**
 * The gold piece `id` costs a company whose top hero is Level `level`: ceil(wageHoursPm / 1000 x wage(L)), the wage at that Level step
 * (src/core/wage.js levelStep is wageStep). 0 for a free piece, null for no such piece. Exact integers, like hr_faction_piece_price.
 * @param {string} id @param {number} level @param {Readonly<Record<string, Readonly<StockRow>>>} [stock]
 */
export function stockPrice(id, level, stock = FACTION_STOCK) {
  const p = own(stock, id) ? stock[id] : null;
  if (!p || !own(STOCK_KINDS, p.kind)) return null;
  if (!STOCK_KINDS[p.kind].paid) return 0;
  const L = Math.max(1, Math.floor(Number(level) || 1));
  return Number((BigInt(p.wageHoursPm) * BigInt(wage(wageStep(L))) + 999n) / 1000n);
}

/**
 * Every problem with the rules, the sides and the stock, as sentences. Empty = valid. Pure.
 * @param {Record<string, any>} [rules] @param {Record<string, any>} [outfits] @param {Record<string, any>} [sides] @param {Record<string, any>} [stock]
 */
export function validateFactions(rules = FACTION_RULES, outfits = FACTION_OUTFITS, sides = FACTIONS, stock = FACTION_STOCK) {
  const out = [];
  if (typeof rules.joinAfter !== 'string' || !/^[a-z0-9_]{1,40}$/.test(rules.joinAfter)) out.push('joinAfter is not a monster id');
  if (!REGIONS.includes(rules.standingAfter)) out.push('standingAfter ' + rules.standingAfter + ' is not a region (shape.js REGIONS)');
  if (!whole(rules.swapHeroMinutes, 1, 100000)) out.push('swapHeroMinutes is not a whole number of minutes');
  if (!whole(rules.swapCooldownDays, 0, 365)) out.push('swapCooldownDays is not a whole number of days');
  if (!whole(rules.dayCapMinutes, 1, 24 * 60)) out.push('dayCapMinutes is not a whole number of minutes in one day');
  if (!whole(rules.frontCapHeroMinutes, 1, 100000)) out.push('frontCapHeroMinutes is not a whole number of minutes');
  for (const s of STANDING_SIDES) if (!own(sides, s)) out.push(s + ' has no FACTIONS row');
  for (const [id, f] of Object.entries(sides)) {
    if (!STANDING_SIDES.includes(id)) out.push(id + ' is a FACTIONS row and no side (shape.js STANDING_SIDES)');
    for (const k of Object.keys(f || {})) if (!FACTION_KEYS.has(k)) out.push(`${id} names ${k}: a side gives no stat, step, modifier or rule (ledger row 17)`);
    if (!f || !own(PEOPLE_TEXT, f.face)) out.push(id + ' has no face in src/data/text/people.js');
  }
  const open = Object.fromEntries(STANDING_SIDES.map((s) => [s, 0]));
  for (const [id, p] of Object.entries(stock)) {
    if (!/^[a-z0-9_]{1,32}$/.test(id)) out.push(id + ' is not a piece id');
    if (/holly|harry|venn|rowe/i.test(id)) out.push(id + ' spells a person\'s name, which lives in the text home only');
    for (const k of Object.keys(p || {})) if (!STOCK_KEYS.has(k)) out.push(`${id} names ${k}: a piece gives no stat, step, modifier or rule (ledger row 17)`);
    if (!p || !STANDING_SIDES.includes(p.side)) { out.push(id + ' names no side'); continue; }
    if (!whole(p.mark, 1, 1000000)) out.push(id + ' unlocks at no whole number of hero-minutes');
    const kind = own(STOCK_KINDS, p.kind) ? STOCK_KINDS[p.kind] : null;
    if (!kind) { out.push(id + ' is of no kind (' + p.kind + ')'); continue; }
    if (kind.paid && !whole(p.wageHoursPm, 1, 1000000)) out.push(id + ' is a paid piece with no whole price in wage-hour thousandths');
    if (!kind.paid && 'wageHoursPm' in p) out.push(id + ' is a free piece with a price');
    if ('opensWith' in p && !(typeof p.opensWith === 'string' && /^[a-z0-9_]{1,32}$/.test(p.opensWith))) out.push(id + ' opens with no system id');
    if (stockOpen(p)) open[p.side] += 1;
  }
  for (const [s, n] of Object.entries(open)) if (!n) out.push(s + ' has no open piece to claim');
  for (const [id, p] of Object.entries(outfits)) {
    const row = own(stock, id) ? stock[id] : null;
    if (!row || row.side !== p.side || row.mark !== p.hours * H) out.push(id + ' is a wearable piece the stock does not hold as it says');
  }
  return out;
}

/**
 * The ground rule's problems, as sentences (FG-* names the clause). Empty = holds. Every input defaults to the data, so a guard can hand
 * it a planted copy. `grounds` are the hunt rows of walkable grounds (HUNTS: base and packs, staged included); `rooms` every other row.
 * @param {{grounds?: readonly any[], rooms?: readonly any[], regions?: readonly string[], rules?: typeof FACTION_RULES,
 *   kits?: Record<string, any>, maps?: Record<string, string>, monsters?: Record<string, any>, outfits?: typeof FACTION_OUTFITS,
 *   sides?: typeof FACTIONS, stock?: Record<string, any>}} [o]
 */
export function factionGroundProblems(o = {}) {
  const grounds = o.grounds || HUNTS, rooms = o.rooms || [...CALLED_HUNTS, ...HALL_HUNTS, ...TRAINING_HUNTS];
  const regions = o.regions || REGIONS, rules = o.rules || FACTION_RULES, kits = o.kits || REGION_KITS;
  const maps = o.maps || Object.fromEntries(Object.entries(HUNT_GROUNDS).map(([id, g]) => [id, g.map]));
  const monsters = o.monsters || MONSTERS;
  const out = validateFactions(rules, o.outfits || FACTION_OUTFITS, o.sides || FACTIONS, o.stock || FACTION_STOCK).map((p) => 'FG-RULES ' + p);
  const after = regions.indexOf(rules.standingAfter);
  const pays = (h) => regions.indexOf(h.region) > after;
  for (const h of [...grounds, ...rooms]) {
    if (!regions.includes(h.region)) out.push(`FG-REGION ${h.id} names no region (${h.region})`);
    if ('standingFor' in h && !STANDING_SIDES.includes(h.standingFor)) out.push(`FG-SIDE ${h.id} pays standing to ${h.standingFor}, no side`);
  }
  for (const h of grounds) {
    if (!regions.includes(h.region)) continue;
    if (pays(h) && !h.standingFor) out.push(`FG-FIELD ${h.id} stands in ${h.region}, after ${rules.standingAfter}, and pays no side`);
    if (!pays(h) && h.standingFor) out.push(`FG-FIELD ${h.id} stands in ${h.region}, before Krell falls, and pays ${h.standingFor}`);
  }
  const byId = Object.fromEntries(grounds.map((h) => [h.id, h]));
  for (const r of rooms) {
    const g = r.hall ? byId[r.id.replace(/_hall$/, '')] : null;
    const want = g ? g.standingFor : undefined;
    if (r.standingFor !== want) out.push(`FG-ROOM ${r.id} pays ${r.standingFor || 'no side'}, and ${g ? 'its ground pays ' + (want || 'none') : 'only a hall counts with a ground'}`);
    if (g && r.region !== g.region) out.push(`FG-ROOM ${r.id} stands in ${r.region}, its ground in ${g.region}`);
  }
  for (const reg of regions.slice(after + 1)) {
    const open = grounds.filter((h) => h.region === reg && h.staged !== true);
    const n = STANDING_SIDES.map((s) => open.filter((h) => h.standingFor === s).length);
    if (new Set(n).size > 1) out.push(`FG-EVEN ${reg} opens ${STANDING_SIDES.map((s, i) => n[i] + ' for ' + s).join(' and ')}`);
  }
  for (const [reg, kit] of Object.entries(kits)) {
    for (const h of grounds) if (maps[h.id] && kit.grounds && maps[h.id] in kit.grounds && h.region !== reg) out.push(`FG-KIT ${h.id} names ${h.region}, and the ${reg} kit paints its map`);
  }
  const krell = monsters[rules.joinAfter];
  if (!krell || krell.boss !== true) out.push(`FG-JOIN ${rules.joinAfter} is not a boss in the monster rows`);
  return out;
}
