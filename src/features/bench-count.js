// ══════════════════════════════════════════════════════════════════════
// SETTLE-THEN-GATE AT THE BENCH (CLAUDE.md §6, both directions)
// ══════════════════════════════════════════════════════════════════════
// The last stated server bag (G._serverBag) is up to one settle cadence old:
// ore gathered since is real on the server and absent from it. set_activity
// COLLECTS that open window before it switches (intents.js collectsFirst, no
// 60 s floor — the accrue verb has one, so asking it for a fresh bag inside a
// minute of the last settle returns nothing). So the switch IS the settle:
//   · the last bag funds the run → the caller arms the bench now;
//   · it does not → send the switch, paint "Counting…" (no timer, so nothing is
//     predicted off an unstated bag), and arm on the switch's own envelope;
//   · that envelope still cannot fund it → stop (declares idle, the server's
//     pointer is this recipe) and name the shortfall with the realm's count.
// A gate on the last bag may only accept early; it never refuses.
import { gateInputs, gateItemCount } from '../net/accrue.js?v=561';

const W = window;
const inputsOf = (r) => W.HearthriseCore.artisan.recipeInputs(r);
const repaint = (skillId) => {
  if (typeof W.renderSkillsList === 'function') W.renderSkillsList();
  if (typeof W.renderSkillDetail === 'function') W.renderSkillDetail(skillId);
};
const say = (m, kind) => { if (typeof W.notify === 'function') W.notify(m, kind); };
const nameOf = (id) => (W.ITEMS && W.ITEMS[id] && W.ITEMS[id].n) || id;

/** Is this tile waiting on the switch's envelope? Read by the tile and the render key. */
export function isCounting(skillId, id) {
  const m = W._benchCounting;
  return !!m && m.skill === skillId && m.id === id;
}

/** The answer to a switch that was sent because the last bag was short.
 *  ONLY an answered switch whose collect still cannot fund the recipe stops the
 *  run: every other outcome is the server deciding (a refusal's reconcile has
 *  already moved the pointer if it disagreed) or not having decided yet — and a
 *  client stop there would declare idle over a switch that may have landed. */
function finish(mark, skillId, r, v) {
  if (W._benchCounting !== mark) return;                  // a newer gesture owns the pointer
  /* COALESCED behind an in-flight switch: nothing was sent yet. Wait for the
     declaration that actually goes out (activity.js `settled`), still Counting… */
  if (v && v.outcome === 'queued' && v.settled && typeof v.settled.then === 'function') {
    v.settled.then((v2) => finish(mark, skillId, r, v2), () => finish(mark, skillId, r, null));
    return;
  }
  W._benchCounting = null;
  const G = W.G;
  if (G.activeSkill !== skillId || G.skillTargetId !== r.id) { repaint(skillId); return; }   // the server's reconcile moved it
  const answered = !!v && (v.outcome === 'switched' || v.outcome === 'replayed');
  const ig = gateInputs(G, inputsOf(r));
  if (!(answered && ig.short.length)) { W._armArtisanTimers(G.skillMs); repaint(skillId); return; }   // funded, unstated, refused-to-this-pointer, unanswered, 429/5xx: the server's pointer stands
  if (typeof W.stopSkill === 'function') W.stopSkill();
  say('Need: ' + ig.short.map((id) => nameOf(id) + ' x' + ig.inputs[id] + ' (the realm counts ' + (gateItemCount(G, id) || 0) + ')').join(', '), 'kill');
}

/**
 * Called by legacy.js startArtisan with the pointer already set and the bench
 * NOT armed. Returns false when the last stated bag funds the run (the caller
 * arms and declares as before); true when it took the gesture over.
 */
export function countFirst(skillId, r) {
  if (gateInputs(W.G, inputsOf(r)).ok) return false;
  const mark = W._benchCounting = { skill: skillId, id: r.id };
  const p = (typeof W.declareActivity === 'function') ? W.declareActivity('artisan', r.id) : null;
  /* NOTHING WAS SENT: a quiet start is the client applying the SERVER's own
     pointer (reconcile/resume) — it already decided, and a stop here would
     evict its run on uncertainty. Hand the gesture back to the caller. */
  if (!p || typeof p.then !== 'function') { W._benchCounting = null; return false; }
  repaint(skillId);
  say('Counting your bag…', 'info');
  p.then((v) => finish(mark, skillId, r, v), () => finish(mark, skillId, r, null));
  return true;
}

W.HearthriseBenchCount = { countFirst, isCounting };
