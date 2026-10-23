// ════════════════════════════════════════════════════════════════════════
// src/social/blocks.js — WHO THIS ACCOUNT HAS BLOCKED.
//
// One BlockStore per AccountSession (owned by its SocialSession, which hands it
// the `blocks` list of hr_social_state). The server is what enforces a block:
// a blocked player's chat lines and whispers are never sent to this account
// (RLS), and their whispers, friend asks and inspects are refused
// (supabase/migrations/2026-10-25-social.sql). This store only lists the
// blocks (Settings, with Unblock) and, at the moment of blocking, clears the
// lines already on screen (onBlocked).
//   list()          [{ id, name }]
//   has(id)
//   set(target, on) ONE hr_block_set; then the SocialSession re-reads
// ════════════════════════════════════════════════════════════════════════
import { personOf } from './friends.js?v=0.2.37';
import { askVia } from '../session/intent-ledger.js?v=0.2.37';

export class BlockStore {
  /** @param {{ account: object, reread: () => Promise<any>, onBlocked: (id: string) => void }} o */
  constructor(o) {
    this._account = o.account;
    this._reread = o.reread;
    this._onBlocked = o.onBlocked;
    this._list = [];
  }

  apply(blocks) { this._list = Array.isArray(blocks) ? blocks.slice(0, 600).map(personOf).filter(Boolean) : []; }
  list() { return this._list.slice(); }
  has(id) { return this._list.some((b) => b.id === id); }

  set(target, on) {
    return askVia(this._account, 'block_set', async () => {
      const ans = await this._account.server.rpc('hr_block_set', { p_target: String(target || ''), p_on: on === true });
      const b = ans.body;
      if (!ans.ok || !b || b.ok !== true) return { ok: false, error: (b && typeof b.error === 'string' && b.error) || ans.error || 'refused' };
      const who = personOf(b.person);
      if (on === true && who) this._onBlocked(who.id);
      await this._reread();
      return { ok: true };
    });
  }
}
