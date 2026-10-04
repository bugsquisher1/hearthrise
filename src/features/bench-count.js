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
import { gateInputs, gateItemCount } from '../net/accrue.js?v=560';

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

/** The answer to a switch that was sent because the last bag was short. */
function finish(mark, skillId, r, v) {
  if (W._benchCounting !== mark) return;                  // a newer gesture owns the pointer
  W._benchCounting = null;
  const G = W.G;
  if (G.activeSkill !== skillId || G.skillTargetId !== r.id) { repaint(skillId); return; }   // the server's reconcile moved it
  const answered = !!v && (v.outcome === 'switched' || v.outcome === 'replayed');
  const unsent = !!v && (v.outcome === 'unconfigured' || v.outcome === 'undeclarable');   // no realm to count it: the pre-gate local run
  const ig = gateInputs(G, inputsOf(r));
  if ((answered && ig.ok) || unsent) { W._armArtisanTimers(G.skillMs); repaint(skillId); return; }
  if (typeof W.stopSkill === 'function') W.stopSkill();
  if (v && v.outcome === 'refused') return;                // the refusal is the server's own message
  say(answered && !ig.counting.length
    ? 'Need: ' + ig.short.map((id) => nameOf(id) + ' x' + ig.inputs[id] + ' (the realm counts ' + (gateItemCount(G, id) || 0) + ')').join(', ')
    : 'Your bag is still being counted — try again in a moment', 'kill');
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
