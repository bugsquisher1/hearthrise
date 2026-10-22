// ════════════════════════════════════════════════════════════════════════
// src/social/friends.js — THE FRIENDS LIST AND ITS REQUESTS, AS THE SERVER SAYS.
//
// One FriendStore per AccountSession (owned by its SocialSession, which reads
// hr_social_state and hands the answer to apply()). Everything shown is the
// server's: names, online, and what a friend is doing (hunting where / in
// town) — the server tells only accepted friends, and hides a character whose
// presence is quiet.
//   friends()   [{ id, name, online, doing: { kind: 'hunting'|'town', hunt } | null }]
//   incoming()  [{ id, name }]  asks made to this account
//   outgoing()  [{ id, name }]  asks this account made
//   isFriend(id) / asked(id)
//   request(target) / answer(id, accept) / remove(id): ONE rpc each; the list
//               moves only when the next hr_social_state says so (the
//               SocialSession re-reads after every answer)
// A target is a user id or a claimed display name; the server resolves it.
// ════════════════════════════════════════════════════════════════════════

import { askVia } from '../session/intent-ledger.js?v=0.2.30';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HUNT = /^[a-z0-9_]{1,64}$/;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const nameOf = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 24) : 'Adventurer');

/** One person as the server answered it, or null. */
export function personOf(p) {
  return isObj(p) && typeof p.id === 'string' && UUID.test(p.id) ? { id: p.id, name: nameOf(p.name) } : null;
}

function doingOf(d) {
  if (!isObj(d)) return null;
  if (d.kind === 'hunting' && typeof d.hunt === 'string' && HUNT.test(d.hunt)) return { kind: 'hunting', hunt: d.hunt };
  if (d.kind === 'town') return { kind: 'town', hunt: null };
  return null;
}

export class FriendStore {
  /** @param {{ account: object, reread: () => Promise<any> }} o */
  constructor(o) {
    this._account = o.account;
    this._reread = o.reread;
    this._friends = [];
    this._in = [];
    this._out = [];
    this.read = false;
  }

  /** The server's answer (hr_social_state) replaces the lists whole. */
  apply(b) {
    const list = (v) => (Array.isArray(v) ? v.slice(0, 250).map(personOf).filter(Boolean) : []);
    this._friends = Array.isArray(b.friends) ? b.friends.slice(0, 250).map((f) => {
      const p = personOf(f);
      return p && Object.assign(p, { online: f.online === true, doing: doingOf(f.doing) });
    }).filter(Boolean) : [];
    this._in = list(b.incoming);
    this._out = list(b.outgoing);
    this.read = true;
  }

  friends() { return this._friends.slice(); }
  incoming() { return this._in.slice(); }
  outgoing() { return this._out.slice(); }
  isFriend(id) { return this._friends.some((f) => f.id === id); }
  asked(id) { return this._out.some((f) => f.id === id); }

  /* One ask (intent-ledger.js) from the send until the re-read: the pressed control waits on it. */
  _settled(verb, send) {
    return askVia(this._account, verb, async () => {
      const ans = await send();
      const b = ans.body;
      const ok = !!(ans.ok && b && b.ok === true);
      if (ok) await this._reread();
      return ok ? { ok: true, state: b.state || null } : { ok: false, error: (b && typeof b.error === 'string' && b.error) || ans.error || 'refused' };
    });
  }

  request(target) {
    const t = String(target || '').trim().slice(0, 40);
    if (!t) return Promise.resolve({ ok: false, error: 'no_player' });
    return this._settled('friend_request', () => this._account.server.rpc('hr_friend_request', { p_target: t }));
  }
  answer(id, accept) { return this._settled('friend_answer', () => this._account.server.rpc('hr_friend_answer', { p_target: String(id), p_accept: accept === true })); }
  remove(id) { return this._settled('friend_remove', () => this._account.server.rpc('hr_friend_remove', { p_target: String(id) })); }
}
