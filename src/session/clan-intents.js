// ════════════════════════════════════════════════════════════════════════
// src/session/clan-intents.js — THE CLAN'S VERBS AND READS (lane/c-social, FB-12; supabase/migrations/1041-social-clans.sql).
//
// A clan is the ACCOUNT's (25-7): every call here names the account through its session and nothing about it or the clan beyond an id or
// a typed name. The server decides who may do what, the price and every count. Reads are asked when the Clan window opens or after a
// change, never on a timer (the roster is a panel-open read, 30 a minute).
//   readRoster(account)                 hr_clan_roster: the account's clan and members, or the invites waiting for it, and the price
//   browse(account, query)              hr_clan_browser: clans by name or tag, members first
//   found(account, cs, name, tag, policy, price)   hr_clan_found: MONEY, at the price the server last quoted (a forged price is refused
//                                       quote_changed); the founding hero's slot and a fresh key; the character is re-read after
//   join / leave / invite / kick / rank / setPolicy   the server's verbs, one ask each
// After a membership change the chat re-reads its channels (the Clan tab follows the server's answer, never this file).
// Every answer is checked for shape: a malformed one is a refusal, never a guess.
// ════════════════════════════════════════════════════════════════════════
import { askVia } from './intent-ledger.js';
import { CLAN_RANKS, CLAN_POLICIES } from '../data/clans.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const int = (v) => (Number.isSafeInteger(v) ? v : null);
const str = (v, max) => (typeof v === 'string' && v.length <= (max || 64) ? v : null);
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : null);
const usable = (account) => !!account && !!account.server && typeof account.server.rpc === 'function';

/** A clan's card as the server sent it, or null: { id, name, tag, policy, members, cap, leader, mine, invited, invitedBy, expiresMs }. */
export function cardOf(c) {
  const o = obj(c);
  if (!o || typeof o.id !== 'string' || !UUID.test(o.id) || !str(o.name, 24)) return null;
  return {
    id: o.id, name: o.name, tag: str(o.tag, 8), policy: CLAN_POLICIES.includes(o.join_policy) ? o.join_policy : 'open',
    members: int(o.members) ?? 0, cap: int(o.member_cap), leader: str(o.leader, 24),
    mine: o.mine === true, invited: o.invited === true, invitedBy: str(o.invited_by, 24), expiresMs: int(o.expires_ms),
  };
}

/** A roster row: { id, name, slot, role, level, online, doing, joinedMs }, or null. */
export function memberOf(m) {
  const o = obj(m);
  if (!o || typeof o.id !== 'string' || !UUID.test(o.id) || !str(o.name, 24) || !CLAN_RANKS.includes(o.role)) return null;
  const doing = obj(o.doing);
  return { id: o.id, name: o.name, slot: int(o.slot), role: o.role, level: int(o.level), online: o.online === true,
    doing: doing && typeof doing.kind === 'string' ? { kind: doing.kind, hunt: str(doing.hunt) } : null, joinedMs: int(o.joined_ms) };
}

/* One ask: `call(server)` names the RPC (so tests/client-intent-surface.mjs reads every name this file sends). */
async function ask(account, verb, call) {
  if (!usable(account)) return { ok: false, error: 'bad_intent' };
  return askVia(account, verb, async () => {
    const ans = await call(account.server);
    const b = ans && obj(ans.body);
    if (!(ans && ans.ok && b && b.ok === true)) {
      return { ok: false, error: (b && typeof b.error === 'string' && b.error) || (ans && ans.error) || 'refused', verb: 'clan',
        price: int(b && b.price) };
    }
    return { ok: true, body: b };
  });
}

/** The chat follows the server's channels again (the Clan tab appears or goes with the server's next answer). */
function chatAgain(account) {
  const chat = account && account.social && account.social.chat;
  if (chat && typeof chat.refresh === 'function') chat.refresh();
}

/**
 * The account's clan: { ok, clan: card|null, role, me, members: [member], invited: [person], invites: [card], price } or a refusal.
 * `price` is the server's founding price (shown only while the account is in no clan).
 */
export async function readRoster(account) {
  const r = await ask(account, 'clan_read', (server) => server.rpc('hr_clan_roster', {}));
  if (!r.ok) return r;
  const b = r.body;
  const list = (v) => (Array.isArray(v) ? v : []);
  return { ok: true, clan: cardOf(b.clan), role: CLAN_RANKS.includes(b.role) ? b.role : null, me: str(b.me),
    members: list(b.members).map(memberOf).filter(Boolean),
    invited: list(b.invited).map((p) => (obj(p) && str(p.name, 24) && UUID.test(String(p.id)) ? { id: p.id, name: p.name, expiresMs: int(p.expires_ms) } : null)).filter(Boolean),
    invites: list(b.invites).map(cardOf).filter(Boolean), price: int(b.price) };
}

/** Clans by name or tag (empty query: every clan, members first): { ok, clans: [card], mine } or a refusal. */
export async function browse(account, query) {
  const q = typeof query === 'string' ? query.trim().slice(0, 24) : '';
  const r = await ask(account, 'clan_browse', (server) => server.rpc('hr_clan_browser', { p_query: q || null, p_limit: 50 }));
  if (!r.ok) return r;
  return { ok: true, clans: (Array.isArray(r.body.clans) ? r.body.clans : []).map(cardOf).filter(Boolean), mine: str(r.body.mine) };
}

/** Found a clan at the price the server quoted. The character is re-read so the purse changes only from the envelope. */
export async function found(account, cs, name, tag, policy, price) {
  if (!cs || !Number.isInteger(cs.slot) || !Number.isSafeInteger(price)) return { ok: false, error: 'bad_intent' };
  const r = await ask(account, 'clan_found', (server) => server.rpc('hr_clan_found', { p_slot: cs.slot, p_name: String(name || ''), p_tag: String(tag || ''),
    p_policy: CLAN_POLICIES.includes(policy) ? policy : 'open', p_price: price, p_idem: globalThis.crypto.randomUUID() }));
  if (typeof cs.load === 'function') await cs.load();
  if (r.ok) chatAgain(account);
  return r.ok ? { ok: true, clan: cardOf(r.body.clan) } : r;
}

const change = (verb, callOf) => async (account, ...a) => {
  const r = await ask(account, verb, (server) => callOf(server, ...a));
  if (r.ok) chatAgain(account);
  return r.ok ? { ok: true } : r;
};
/** Join a clan (open, or one that invited this account). */
export const join = change('clan_join', (server, id) => server.rpc('clan_join', { p_clan_id: id }));
/** Leave the clan (a leader passes it on; the last one out disbands it). */
export const leave = change('clan_leave', (server) => server.rpc('clan_leave', {}));
/** Invite a character by name (a leader or an officer). */
export const invite = change('clan_invite_by_name', (server, target) => server.rpc('hr_clan_invite', { p_target: String(target || '').trim().slice(0, 40) }));
/** Remove a member (a leader, or an officer for a member); no ban. */
export const kick = change('clan_kick', (server, id) => server.rpc('clan_kick', { p_user_id: id, p_ban_hours: 0 }));
/** Withdraw an invite. */
export const revoke = change('clan_invite_revoke', (server, id) => server.rpc('clan_invite_revoke', { p_user_id: id }));
/** Set a member's rank, or hand the clan on (the leader). */
export const rank = change('clan_rank', (server, id, r) => server.rpc('hr_clan_rank', { p_target: id, p_rank: r }));
/** Open or invite only. */
export const setPolicy = change('clan_policy', (server, p) => server.rpc('clan_join_policy_set', { p_policy: p }));
