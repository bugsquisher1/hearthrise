// ════════════════════════════════════════════════════════════════════════
// src/session/hearth-intents.js — THE GREAT HEARTH'S ONE VERB: BURN A NAMED FUEL.
//
// A named fuel (src/data/hearth.js NAMED_FUELS) burns ALONE, by one call the
// server decides whole (supabase/migrations/2027-01-31-inner-flame.sql
// hr_hearth_burn): this names only the character's slot, the fuel's catalogue id
// and a fresh key, never an amount, an XP figure, a colour or a time. The server
// takes the fuel from the bag, pays the Inner Flame XP from its own catalogue,
// queues the square's colour, posts the line, and sets the hero's body on a free
// fuel stand by the fire; its answer's `me` is handed to the character's
// TownPresence, so the World walks the hero there from the server's yes (never
// predicted). On ok the character is RE-READ, so the bag and the skill change only
// from the server's envelope. An everyday fuel is a bench run instead
// (set_activity on fuel_<item>: src/shell/windows/inventory/bury.js).
// One ask in the account's intent ledger (askVia), so the pressed control waits.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.54';
import { NAMED_FUELS } from '../data/hearth.js?v=0.2.54';

const usable = (account, cs) => !!account && !!account.server && !!cs && cs.status !== 'closed' && Number.isInteger(cs.slot);
const int = (v) => (Number.isSafeInteger(v) ? v : null);
const word = (v) => (typeof v === 'string' && /^[a-z0-9_]{1,64}$/.test(v) ? v : null);

/**
 * Burn ONE named fuel in the Great Hearth. Resolves to { ok, item, xp, flame: {flame, fromMs, untilMs} } or
 * { ok:false, error, need?, have?, hunt?, waitS?, perDay? } (the server's words: hunting, not_a_fuel, no_item,
 * flame_too_low, hearth_limit, hearth_busy, …).
 */
export function burnNamedFuel(account, cs, item) {
  if (!usable(account, cs) || !Object.prototype.hasOwnProperty.call(NAMED_FUELS, item)) return Promise.resolve({ ok: false, error: 'bad_intent' });
  return askVia(cs, 'hearth_burn', async () => {
    const ans = await account.server.rpc('hr_hearth_burn', { p_slot: cs.slot, p_item: item, p_idem: globalThis.crypto.randomUUID() });
    const b = ans && ans.body && typeof ans.body === 'object' && !Array.isArray(ans.body) ? ans.body : {};
    if (!(ans && ans.ok && b.ok === true)) {
      /* `verb` and `item` let intent-words.js refusalText say it in the Hearth's words, with the server's numbers */
      return { ok: false, error: (typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused', verb: 'hearth_burn', item,
        need: int(b.need), have: int(b.have), hunt: word(b.hunt), waitS: int(b.wait_s), perDay: int(b.per_day) };
    }
    /* the server set the body on a fuel stand: the World walks it there (display only) */
    const town = typeof account.townOf === 'function' ? account.townOf(cs.slot) : null;
    if (town && b.me && typeof town.noteStand === 'function') town.noteStand(b.me);
    if (town && typeof town.noteBurn === 'function') town.noteBurn(item);
    if (typeof cs.load === 'function') await cs.load();
    const f = b.flame && typeof b.flame === 'object' ? b.flame : {};
    return { ok: true, item, xp: int(b.xp),
      flame: word(f.flame) ? { flame: f.flame, fromMs: int(f.from_ms), untilMs: int(f.until_ms) } : null };
  });
}
