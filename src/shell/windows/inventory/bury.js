// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/inventory/bury.js — BURY: PRAYER IS TRAINED FROM THE BAG.
//
// Tyler 10-14: Prayer trains by burying bones (and the other Prayer offerings:
// src/data/recipes.js ARTISAN_RECIPES.prayer, one row per item, `output:null`).
// Tyler live 10-18 (v0.2.1): "can't bury bones" — the server path existed, the
// new client never offered it.
//
// The server's path is the bench recipe: ONE `set_activity` naming
// { kind:'artisan', id:<recipe> }. The engine buries one at a time at its own
// pace from the SERVER's bag, pays the Prayer XP itself (never a client number),
// and stops on its own when the stack is gone. Stop (or the timer below, when
// the stack should be done) is ONE `set_activity` { kind:'idle' }: the engine
// collects the burying before it switches, and the re-read envelope replaces
// the bag and the skills. The "Burying…" line reads the server's pointer
// (state.active_kind / active_id), so it survives a reload.
//
// The engine buries the WHOLE stack: it has no "this many" for a recipe, so a
// partial bury would be a client guess at the server's clock. It is not offered.
// ════════════════════════════════════════════════════════════════════════
import { ARTISAN_RECIPES } from '../../../data/recipes.js?v=0.2.2';
import { pacedActionMs } from '../../../core/pacing.js?v=0.2.2';
import { whole } from '../../../render/format.js?v=0.2.2';
import { itemName } from '../../widgets/bits.js?v=0.2.2';
import { skillsOf } from '../../../session/item-sections.js?v=0.2.2';
import { huntOf } from '../../../session/hunt-sections.js?v=0.2.2';

/* item id -> its Prayer recipe (input = the item, nothing made). */
const BY_ITEM = new Map((ARTISAN_RECIPES.prayer || []).filter((r) => r.input && !r.output).map((r) => [r.input, r]));
const BY_ID = new Map(Array.from(BY_ITEM.values()).map((r) => [r.id, r]));
/* A little past the paced time of the last bone, so the engine has buried it before the stop collects. */
const SLACK_MS = 2000;
const MAX_WAIT_MS = 30 * 60 * 1000;

/** The Prayer recipe that consumes `id`, or null. */
export function buryRecipeOf(id) { return BY_ITEM.get(id) || null; }

/** The recipe's verb ("Bury", "Offer", "Scatter"…), from its own name. */
export function buryVerb(r) { return String(r.name).split(' ')[0]; }

/** "Burying", "Offering", "Consecrating": the verb as the line under the bag says it. */
export function buryingWord(r) { const v = buryVerb(r); return (/[^e]e$/.test(v) ? v.slice(0, -1) : v) + 'ing'; }

/** The label for a stack of `qty`: "Bury" for one, "Bury all" for more. */
export function buryLabel(r, qty) { return buryVerb(r) + (qty > 1 ? ' all' : ''); }

/** The Prayer recipe the server says this character is doing now, or null. */
export function buryingOf(cs) {
  const s = cs && typeof cs.read === 'function' ? cs.read('state') : null;
  return s && s.active_kind === 'artisan' && typeof s.active_id === 'string' ? BY_ID.get(s.active_id) || null : null;
}

/** Why the stack cannot be buried now (plain words), or '' when it can. */
export function buryBlock(cs, r) {
  const h = huntOf(cs);
  if (h && !h.ended) return 'Not while a hunt is running.';
  const sk = skillsOf(cs);
  const lv = sk && sk.prayer ? sk.prayer.level : null;
  if (lv === null) return 'Reading your Prayer level…';
  if (lv < r.req) return 'Needs Prayer ' + r.req + ' (you have ' + lv + ').';
  return '';
}

function prayerXp(cs) { const sk = skillsOf(cs); return sk && sk.prayer ? sk.prayer.xp : null; }

/**
 * Start burying the stack `id`: ONE set_activity; the stop is armed for when
 * the stack should be done. `send(fn, busy, done)` is the window's runIntent.
 */
export function startBury(cs, sc, id, send, repaint) {
  const r = buryRecipeOf(id);
  if (!r) return null;
  const qty = (cs.read('inventory') || {})[id] || 0;
  return send(() => cs.edgeIntent('set_activity', { activity: { kind: 'artisan', id: r.id } }), 'Starting…', () => {
    clearTimeout(sc.buryTimer);
    sc.buryFrom = { xp: prayerXp(cs), id, qty };
    const wait = Math.min(MAX_WAIT_MS, qty * pacedActionMs(r.ms) + SLACK_MS);
    sc.buryTimer = setTimeout(() => { if (buryingOf(cs) === r && !sc.pending) stopBury(cs, sc, send); else repaint(); }, wait);
    return buryingWord(r) + ' ' + whole(qty) + ' ' + itemName(id) + '…';
  });
}

/** Stop burying: ONE set_activity idle; the engine pays what was buried first. */
export function stopBury(cs, sc, send) {
  clearTimeout(sc.buryTimer);
  const before = prayerXp(cs);
  return send(() => cs.edgeIntent('set_activity', { activity: { kind: 'idle' } }), 'Finishing…', () => {
    const after = prayerXp(cs);
    const from = sc.buryFrom && sc.buryFrom.xp !== null ? sc.buryFrom.xp : before;
    sc.buryFrom = null;
    return after !== null && from !== null && after > from ? 'Done: +' + whole(after - from) + ' Prayer XP.' : 'Stopped.';
  });
}

/**
 * The "Burying…" line's words, or '' when the hero is free. Any other gathering
 * or crafting pointer the server holds (from before this client had a way to
 * stop it) is named too, with the same Stop: hr_hunt_enter refuses a hero that
 * is not idle, so a pointer with no Stop would keep the hero out of every hunt.
 */
export function buryLine(cs) {
  const r = buryingOf(cs);
  if (r) return buryingWord(r) + ' ' + itemName(r.input) + '. Your Prayer XP and bag update when it is done.';
  const s = cs && typeof cs.read === 'function' ? cs.read('state') : null;
  return s && (s.active_kind === 'gather' || s.active_kind === 'artisan') ? 'Your hero is still busy gathering or crafting, so hunts will not start. Stop it here.' : '';
}
