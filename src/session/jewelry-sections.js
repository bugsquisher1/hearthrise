// ════════════════════════════════════════════════════════════════════════
// src/session/jewelry-sections.js — CRAFTED JEWELRY AS THE SERVER STATES IT (src/data/jewelry.js).
//
// The `hallmark` section (hr_hallmark_view, 2027-05-09-jewel-reforge.sql): the Hallmark step for each Fine piece and the
// reforge for each Hallmarked piece this hero holds in its bag or the account's Storage, each at the server's gold and level in the
// piece's own bench (Tyler 2026-11-18: all jewelry is Smithing, cloaks Crafting), and the account's counts against the day's limit;
// every envelope replaces it and nothing here prices a step. (A rolled job's odds and the bench's offer left with the bench, 09 4.17.)
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js';
import { JEWEL_SKILLS } from '../data/jewelry.js';
import { skillsOf, bankOf } from './item-sections.js';

const whole = (n) => (Number.isSafeInteger(n) && n >= 0 ? n : 0);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const ID = /^[a-z0-9_]{1,48}$/;
const own = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isItem = (id) => ID.test(String(id)) && own(ITEMS, id);
/* A step's bench as the server names it: one of the crafted pieces' skills, else the row is not offered (a database before the
   per-piece skill sends none, and nothing here guesses one). */
const benchOf = (o) => (JEWEL_SKILLS.includes(o.skill) ? o.skill : null);

/**
 * The section, or null on a database before the step:
 *   { offers: [{ from, to, perk, gem, gold, level, skill }], today, reforges: [{ from, to, metal, bars, gem, gold, level, skill }], reforged, perDay }.
 */
export function hallmarkOf(cs) {
  const s = cs && typeof cs.read === 'function' ? cs.read('hallmark') : null;
  if (!isObj(s) || !Array.isArray(s.offers)) return null;
  const offers = s.offers.filter((o) => isObj(o) && isItem(o.from) && isItem(o.to) && benchOf(o)
    && Number.isSafeInteger(o.gold) && o.gold > 0 && Number.isInteger(o.level))
    .map((o) => ({ from: o.from, to: o.to, perk: String(o.perk), gem: String(o.gem), gold: o.gold, level: o.level, skill: o.skill }));
  const reforges = (Array.isArray(s.reforges) ? s.reforges : []).filter((o) => isObj(o) && isItem(o.from) && isItem(o.to) && isItem(o.metal)
    && isItem(o.gem) && benchOf(o) && Number.isSafeInteger(o.gold) && o.gold > 0 && Number.isInteger(o.level) && Number.isInteger(o.bars) && o.bars > 0)
    .map((o) => ({ from: o.from, to: o.to, metal: o.metal, bars: o.bars, gem: o.gem, gold: o.gold, level: o.level, skill: o.skill }));
  return { offers, today: whole(s.today), reforges, reforged: whole(s.reforged), perDay: whole(s.per_day) };
}

/** The hero's level in a crafted piece's bench skill (`skill`, default Smithing) as the server holds it, or null before the envelope says. */
export function jewelLevelOf(cs, skill = 'smithing') {
  const sk = skillsOf(cs);
  return sk && isObj(sk[skill]) && Number.isInteger(sk[skill].level) ? sk[skill].level : null;
}

/** How many of `id` this hero can spend on a Hallmark or a reforge, as the server counts them: { bag, storage, all } (hr_materials_take: the bag, then Storage). */
export function heldForHallmark(cs, id) {
  const inv = cs && typeof cs.read === 'function' ? cs.read('inventory') : null;
  const bag = isObj(inv) ? whole(inv[id]) : 0;
  const row = (bankOf(cs) || []).find((r) => r.id === id);
  const storage = row ? whole(row.qty) : 0;
  return { bag, storage, all: bag + storage };
}
