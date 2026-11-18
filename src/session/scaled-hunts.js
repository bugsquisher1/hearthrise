// ════════════════════════════════════════════════════════════════════════
// src/session/scaled-hunts.js — SCALED HUNTS AS THE SERVER STATES THEM, AND THEIR TWO PRESSES (audit F26, 2026-11-15:
// the data and the server existed, no window read them; supabase/migrations/2027-03-21-scaled-hunts.sql, src/data/scaled-hunts.js).
//
//   scaledHuntsOf(cs)   the envelope's `scaled_hunts` section, checked field by field and frozen, or null: the server sends
//                       null while the `scaled_hunts` switch is off for the account, and then nothing shows anywhere.
//                       { minHours, maxHours, bankMaxMs, dayMaxHours, todayHours, playing: { hunt, level } | null,
//                         grounds: { hunt: { level (null: not yet), fromLevel, price (gold an hour, null: not yet), bankedMs, on } } }
//   buyScaledHours(account, cs, hunt, hours, priceSeen)
//                       ONE hr_scaled_hunt_buy: whole hours and the total the player SAW (the section's price an hour x hours).
//                       The server prices it again under the hero's lock from its own Level and catalogue and answers
//                       quote_changed rather than charge another sum; a refusal the server answered re-reads the hero first
//                       (quoted-ask.js), so the next press is at the server's price. On ok the hero is re-read.
//   setScaledOn(account, cs, hunt, on)
//                       ONE hr_scaled_hunt_switch ("use my scaled hours here"): moves no value. On ok the hero is re-read.
// Every number on screen is the section's and every envelope replaces it (CLAUDE.md §6). The slider's hours are the window's
// display scratch, sent with the press and spent by nothing else.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.139';
import { quoted } from './quoted-ask.js?v=0.2.139';
import { refusalOf } from './refusal.js?v=0.2.139';

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const HUNT = /^[a-z0-9_]{1,64}$/;
const nat = (v) => (Number.isSafeInteger(v) && v >= 0 ? v : null);
const pos = (v) => (Number.isSafeInteger(v) && v >= 1 ? v : null);
const newIdem = () => globalThis.crypto.randomUUID();
const usable = (account, cs) => !!account && !!account.server && typeof account.server.rpc === 'function'
  && !!cs && cs.status !== 'closed' && Number.isInteger(cs.slot);

function groundOf(g) {
  if (!isObj(g) || nat(g.banked_ms) === null || pos(g.from_level) === null) return null;
  const level = pos(g.level), price = pos(g.price);
  /* a Level and a price come together or not at all: the server never prices a ground it does not scale for this hero */
  if ((level === null) !== (price === null)) return null;
  return Object.freeze({ level, fromLevel: g.from_level, price, bankedMs: g.banked_ms, on: g.on !== false });
}

/** The section, or null when the server did not send it (the switch off) or sent a shape this reader does not know. */
export function scaledHuntsOf(cs) {
  const s = cs && typeof cs.read === 'function' ? cs.read('scaled_hunts') : undefined;
  if (!isObj(s) || pos(s.min_hours) === null || pos(s.max_hours) === null || nat(s.bank_max_ms) === null || pos(s.day_max_hours) === null) return null;
  const grounds = {};
  if (isObj(s.grounds)) for (const [hunt, g] of Object.entries(s.grounds).slice(0, 64)) { const row = HUNT.test(hunt) ? groundOf(g) : null; if (row) grounds[hunt] = row; }
  const p = s.playing;
  return Object.freeze({
    minHours: s.min_hours, maxHours: s.max_hours, bankMaxMs: s.bank_max_ms, dayMaxHours: s.day_max_hours, todayHours: nat(s.today_hours) ?? 0,
    playing: isObj(p) && typeof p.hunt === 'string' && HUNT.test(p.hunt) && pos(p.level) !== null ? Object.freeze({ hunt: p.hunt, level: p.level }) : null,
    grounds: Object.freeze(grounds),
  });
}

/** One ground's row of the section, or null (not scalable, or no section). */
export const scaledGroundOf = (sh, hunt) => (sh && Object.prototype.hasOwnProperty.call(sh.grounds, hunt) ? sh.grounds[hunt] : null);

/* The press's answer: re-read on ok; a refusal keeps the server's code and the numbers it stated. */
async function settle(cs, verb, ans, ok) {
  const body = ans && isObj(ans.body) ? ans.body : null;
  if (!(ans && ans.ok && body && body.ok === true)) return Object.assign(refusalOf(ans || {}), { verb });
  if (typeof cs.load === 'function') await cs.load();
  return ok(body);
}

/** Buy `hours` banked hours on `hunt` at the total the player saw. @returns {Promise<{ok:true, hours:number}|{ok:false, error:string}>} */
export function buyScaledHours(account, cs, hunt, hours, priceSeen) {
  if (!usable(account, cs) || !HUNT.test(String(hunt)) || pos(hours) === null || pos(priceSeen) === null) {
    return Promise.resolve({ ok: false, error: 'bad_intent', verb: 'scaled_hunt_buy' });
  }
  return askVia(cs, 'scaled_hunt_buy', async () => {
    const ans = await quoted(cs, () => account.server.rpc('hr_scaled_hunt_buy', { p_slot: cs.slot, p_hunt: hunt, p_hours: hours, p_price: priceSeen, p_idem: newIdem() }))();
    return settle(cs, 'scaled_hunt_buy', ans, (b) => ({ ok: true, hours: pos(b.hours) ?? hours }));
  });
}

/** Use (or stop using) this hero's banked hours on `hunt`. @returns {Promise<{ok:true, on:boolean}|{ok:false, error:string}>} */
export function setScaledOn(account, cs, hunt, on) {
  if (!usable(account, cs) || !HUNT.test(String(hunt)) || typeof on !== 'boolean') return Promise.resolve({ ok: false, error: 'bad_intent', verb: 'scaled_hunt_switch' });
  return askVia(cs, 'scaled_hunt_switch', async () => {
    const ans = await account.server.rpc('hr_scaled_hunt_switch', { p_slot: cs.slot, p_hunt: hunt, p_on: on, p_idem: newIdem() });
    return settle(cs, 'scaled_hunt_switch', ans, (b) => ({ ok: true, on: b.on === true }));
  });
}
