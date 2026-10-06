// src/render/loadout-verdict.js — what a loadout tap SAYS (legacy.js applyLoadout).
// A skipped piece is never silent: the toast names it and why. The ✓ waits for
// the realm's answer, because `equip` collects first and its ANSWER decides.
const W = window;

/** Why a loadout piece stayed out: `wield` is canWield()'s verdict, or null for the food slot. */
function skipWhy(id, wield) {
  const n = (W.ITEMS && W.ITEMS[id] && W.ITEMS[id].n) || id;
  if (!wield) return n + ' (no food left to carry)';
  if (wield.ok) return n + ' (not in your bag)';
  const sk = W.SKILLS_DEF && W.SKILLS_DEF[wield.req.skill];
  return n + ' (needs ' + ((sk && sk.name) || wield.req.skill) + ' ' + wield.req.lv + ')';
}

const LANDED = new Set(['equipped', 'replayed', 'switch-off', 'unconfigured']);   // landed, or a dark build whose local kit stands
const UNANSWERED = new Set(['timeout', 'unreachable', 'malformed', 'undeliverable']);

/** Say the loadout once `p` (routeEquipGesture's answer; nothing when nothing was sent) settles. */
function sayLoadout(p, name, skipped, notify) {
  const said = '✓ Applied loadout: ' + name + (skipped.length ? ' · skipped ' + skipped.join(', ') : '');
  const ok = () => notify(said, skipped.length ? 'info' : 'levelup');
  if (!p || typeof p.then !== 'function') return ok();   // no change / dark build: the local kit is the answer
  p.then((v) => {
    const o = v && v.outcome;
    if (LANDED.has(o)) ok();
    else if (!o || UNANSWERED.has(o)) notify('The realm did not answer — your loadout settles on the next sync.', 'kill');   // never a ✓ it did not give
    // a refusal (incl. 429) was already said by equipVerdictOutcome
  });
}

W.HearthriseLoadoutVerdict = { skipWhy, sayLoadout };
