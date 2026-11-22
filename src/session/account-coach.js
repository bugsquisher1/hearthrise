// ════════════════════════════════════════════════════════════════════════
// src/session/account-coach.js — WHAT THE COACH HAS TAUGHT THIS ACCOUNT (FB-5, 2026-11-21).
//
// Chapter 08 section 2.6: "An account lesson is taught once. A card seen on one hero is seen for the account. Only a card
// about a weapon's own first move is per hero." The server holds it (public.account_coach, 1039-account-coach.sql) and
// hr_account_coach is the one door:
//   read     the cards the player pressed Got it on or had on screen long enough (a read finishes a card that teaches)
//   taught   the cards a hero of this account moved past: every other hero passes them by (taughtElsewhere)
// Display state: it finishes cards that teach and gates, spends and ranks nothing (CLAUDE.md §6). A write sends only the new
// ids, which the server adds as a union (raise-only), and the answer REPLACES what is held here when its version is not older,
// so a stale answer never takes a card back. AccountSession makes one per login and hands it to each CharacterSession it opens
// (cs.accountCoach, the way it hands the purse and the storage); the coach reads it through coachOf.
// ════════════════════════════════════════════════════════════════════════

const ID = /^[a-z0-9_]{1,64}$/;
const ids = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string' && ID.test(x)) : []);
const newKey = () => globalThis.crypto.randomUUID();

/* A card about a weapon's own first move stays each hero's (chapter 08 section 2.6): a bar card (hunt-tutorial.js anchor
   'action_bar') teaches that hero's own slots and moves, so another hero is still shown it. */
export function perHeroCard(card) {
  return !!card && card.anchor === 'action_bar';
}

export class AccountCoach {
  /** @param {{ rpc: (name: string, args: object, opts?: object) => Promise<any> } | null} server the account's server (null: held here only, nothing is sent)
      @param {{ read?: string[], taught?: string[] }} [seed] what is known before the server answers */
  constructor(server, seed = {}) {
    this.server = server;
    this.read = new Set(ids(seed.read));
    this.taught = new Set(ids(seed.taught));
    this.v = 0;
    this._loading = null;
    /** @type {Promise<unknown>} the writes, one after another */
    this._sending = Promise.resolve();
    this._subs = new Set();
  }

  /** Call `fn` whenever what is held changes. Returns the unsubscribe. */
  subscribe(fn) { this._subs.add(fn); return () => this._subs.delete(fn); }

  /** Read the server's row once (a second call shares the first). */
  load() {
    if (!this.server) return Promise.resolve(true);
    if (!this._loading) this._loading = this._send([], []).then((ok) => { if (!ok) this._loading = null; return ok; });
    return this._loading;
  }

  /** Mark cards read (`kind` 'read') or taught ('taught'): held at once, sent as new ids only. True when anything was new. */
  mark(kind, cardIds) {
    const set = kind === 'read' ? this.read : kind === 'taught' ? this.taught : null;
    const add = set ? ids(cardIds).filter((id) => !set.has(id)) : [];
    if (!add.length) return false;
    for (const id of add) set.add(id);
    this._changed();
    if (this.server) {
      this._sending = this._sending.then(() => this._send(kind === 'read' ? add : [], kind === 'taught' ? add : []));
    }
    return true;
  }

  async _send(read, taught) {
    let ans;
    /* a write rides a fetch that outlives the page (server.js keepalive): a Got it pressed just before a reload still lands */
    const write = read.length + taught.length > 0;
    try { ans = await this.server.rpc('hr_account_coach', { p_read: read, p_taught: taught, p_idem: write ? newKey() : null }, write ? { keepalive: true } : undefined); }
    catch { return false; }
    const b = ans && ans.ok ? ans.body : null;
    if (!b || b.ok !== true || !Number.isSafeInteger(b.v) || b.v < this.v) return false;
    /* the server's answer replaces what is held, and what this tab marked since the call went out stays (it is still on its way) */
    const keepRead = [...this.read].filter((id) => !read.includes(id));
    const keepTaught = [...this.taught].filter((id) => !taught.includes(id));
    this.v = b.v;
    this.read = new Set([...ids(b.read), ...keepRead]);
    this.taught = new Set([...ids(b.taught), ...keepTaught]);
    this._changed();
    return true;
  }

  _changed() { for (const fn of this._subs) { try { fn(this); } catch { /* a reader's fault is its own */ } } }
}

/** The account's coach for this CharacterSession (AccountSession hands it over), or null when this client records none. */
export function coachOf(cs) {
  const c = cs && cs.accountCoach;
  return c && c.read instanceof Set && c.taught instanceof Set && typeof c.mark === 'function' ? c : null;
}

/** The cards this account has taught on ANOTHER hero that this hero passes by: every taught card but a weapon's own first
    move (perHeroCard). `cards`: the tutorial rows (hunt-tutorial.js HUNT_TUTORIAL). */
export function taughtElsewhere(cs, cards) {
  const c = coachOf(cs);
  if (!c || !c.taught.size) return new Set();
  const perHero = new Set(cards.filter(perHeroCard).map((r) => r.id));
  return new Set([...c.taught].filter((id) => !perHero.has(id)));
}
