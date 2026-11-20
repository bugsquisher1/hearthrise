// ════════════════════════════════════════════════════════════════════════
// src/session/quoted-ask.js — WHAT A REFUSED ASK OWES THE SCREEN, AND A PRESS AT THE SERVER'S QUOTED PRICE.
//
// afterRefusal(cs, ans): THE ONE RULE OF A REFUSED ASK (the full-game sweep's A20, CLAUDE.md §6). A refusal the SERVER answered
// means the screen that sent the press was behind it (another tab, another hero, the server's clock): the hero is re-read ONCE
// (read-gate.js resync, bounded however many presses are refused) before the refusal resolves, so every number on screen is the
// server's again. A dropped network, a closed door or a rate limit is no news: nothing is read (refusal.js refusedByServer). Every
// ask of a hero's holds it: CharacterSession._settled (after the engine's own refusal envelope, envelope.js E7), the priced
// presses below, and every module intent sent through askVia (tests/session-core.mjs REFUSE-ASKVIA names each call site).
//
// quoted(cs, send): a priced verb a MODULE sends (hr_training_start, hr_house_dummy_unlock, hr_storage_chest_build, the scaled
// hunts' verbs) carries the price the player SAW; the server re-quotes under its lock and refuses rather than charge another sum
// (quote_changed, the bar already full, today's count used), and the rule above puts the server's price back on screen before
// the refusal is said, so a retry never sends the stale one (QA 2026-11-14: 197 gp shown, 169 quoted, every retry refused).
// ════════════════════════════════════════════════════════════════════════
import { refusedByServer } from './refusal.js';

/** Re-read `cs` ONCE when `ans` is a refusal the server answered; resolves when that read is done (or none was owed). */
export async function afterRefusal(cs, ans) {
  if (refusedByServer(ans) && cs && cs.status !== 'closed' && typeof cs.resync === 'function') await cs.resync();
}

/** `send` (one priced rpc) wrapped so a refusal the server answered re-reads `cs` before it resolves. */
export function quoted(cs, send) {
  return async () => {
    const ans = await send();
    await afterRefusal(cs, ans);
    return ans;
  };
}
