// ════════════════════════════════════════════════════════════════════════
// src/session/gm-intents.js — THE GAME MASTER'S ASKS, SESSION SIDE (no UI).
//
// The Game Master window calls these. Every one is refused by the server unless this account holds the row only a migration
// writes (2027-03-13-gm-tools.sql); nothing here decides anything, and this file is loaded only after the server said `gm`.
//   gmOnline(account)                         who is online or playing
//   gmHero(account, target, slot)             one hero: a name, or an account id with a slot
//   gmStop(cs, target, slot, reason)          the engine's verb: a job by the player's own stop, a hunt by its own leave
//   gmMute / gmUnmute / gmBan / gmUnban       one account
//   gmSay(account, body)                      one line to everyone
//   gmGrantGold / gmGrantItem / gmGrantLevel  the hero this session views: the server takes no account from the client
// A new key per press: a lost answer leaves nothing in flight the server would double, and a repeat of a stop or a mute is harmless.
// A grant re-reads the account's open heroes: the purse is theirs too.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js?v=0.2.106';
import { refusalOf } from './refusal.js?v=0.2.106';

const key = () => globalThis.crypto.randomUUID();

/* The server's answer: { ok:true, ...body }, or the refusal the window reads as words. */
const answer = (ans) => (ans && ans.ok && ans.body && ans.body.ok === true ? ans.body : refusalOf(ans || {}));

const ask = async (account, verb, send) => answer(await askVia(account, verb, send));

export const gmOnline = (account) => ask(account, 'gm_online', () => account.server.rpc('hr_gm_online', {}));
export const gmHero = (account, target, slot) => ask(account, 'gm_hero', () => account.server.rpc('hr_gm_hero', { p_target: target, p_slot: Number.isInteger(slot) ? slot : null }));
export const gmMute = (account, target, minutes, reason) => ask(account, 'gm_mute', () => account.server.rpc('hr_gm_mute', { p_target: target, p_minutes: minutes, p_reason: reason, p_idem: key() }));
export const gmUnmute = (account, target, reason) => ask(account, 'gm_unmute', () => account.server.rpc('hr_gm_unmute', { p_target: target, p_reason: reason, p_idem: key() }));
export const gmBan = (account, target, reason) => ask(account, 'gm_ban', () => account.server.rpc('hr_gm_ban', { p_target: target, p_reason: reason, p_idem: key() }));
export const gmUnban = (account, target, reason) => ask(account, 'gm_unban', () => account.server.rpc('hr_gm_unban', { p_target: target, p_reason: reason, p_idem: key() }));
export const gmSay = (account, body) => ask(account, 'gm_say', () => account.server.rpc('hr_gm_say', { p_body: body, p_idem: key() }));

/** The stop: a read through the engine, so no envelope lands on the hero this session views. */
export async function gmStop(cs, target, slot, reason) {
  const r = await cs.edgeIntent('gm_stop', { gm: { target, slot, reason } }, true);
  return r && r.ok && r.body ? r.body : r;
}

async function granted(account, r) {
  if (r.ok && account && typeof account.characters === 'function') {
    await Promise.all(account.characters().filter((o) => o && o.status !== 'closed' && typeof o.load === 'function').map((o) => o.load()));
  }
  return r;
}
export const gmGrantGold = async (account, cs, amount, reason) => granted(account, await ask(account, 'gm_grant_gold', () => account.server.rpc('hr_gm_grant_gold', { p_slot: cs.slot, p_amount: amount, p_reason: reason, p_idem: key() })));
export const gmGrantItem = async (account, cs, item, qty, reason) => granted(account, await ask(account, 'gm_grant_item', () => account.server.rpc('hr_gm_grant_item', { p_slot: cs.slot, p_item: item, p_qty: qty, p_reason: reason, p_idem: key() })));
export const gmGrantLevel = async (account, cs, level, reason) => granted(account, await ask(account, 'gm_grant_level', () => account.server.rpc('hr_gm_grant_level', { p_slot: cs.slot, p_level: level, p_reason: reason, p_idem: key() })));
