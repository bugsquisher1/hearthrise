// ════════════════════════════════════════════════════════════════════════
// src/session/quoted-ask.js — A PRESS AT THE SERVER'S QUOTED PRICE, AND WHAT ITS REFUSAL OWES THE SCREEN.
//
// A priced verb a MODULE sends (hr_training_start, hr_house_dummy_unlock, hr_storage_chest_build, the scaled hunts'
// verbs) carries the price the player SAW, from a section of the hero's read; the server re-quotes under its lock and
// refuses rather than charge another sum. A refusal the SERVER answered (quote_changed, the bar already full, today's
// count used) means the screen offered what the server would not sell: the hero is re-read (ONE bounded resync,
// read-gate.js) before the refusal is said, so the price on screen is the server's again and a retry never sends the
// stale one (QA 2026-11-14: 197 gp shown, 169 quoted, every retry refused until a reload; CLAUDE.md §6). A dropped
// network is no answer: nothing is read. The CharacterSession's own priced verbs (stamina, Blessings, the Bestiary, a
// rename) need no wrapper: every refusal of its own asks is re-read by _settled, on the same rule (refusal.js refusedByServer).
// ════════════════════════════════════════════════════════════════════════
import { refusedByServer } from './refusal.js?v=0.2.140';

/** `send` (one priced rpc) wrapped so a refusal the server answered re-reads `cs` before it resolves. */
export function quoted(cs, send) {
  return async () => {
    const ans = await send();
    if (refusedByServer(ans) && cs && cs.status !== 'closed' && typeof cs.resync === 'function') await cs.resync();
    return ans;
  };
}
