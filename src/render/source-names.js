// ════════════════════════════════════════════════════════════════════════
// src/render/source-names.js — WHAT A HUNT EVENT'S SOURCE IS CALLED (lane/client-talent-floaters, 2026-11-23).
//
// PURE. A hunt event names what did it by id: a `dmg` or a `heal` its `ability`, a status event its `status`. Since the engine
// pieces (lane/talent-effects) that id is not always a move: a Mending tick names its status, a Shield Priest heal its reaction,
// a guard's share or an overkill its engine piece. One reader for every surface that writes the id as words (the combat log,
// the analyzer's attacks, the hunt report's healing), in this order:
//   a move              src/data/abilities.js `n`
//   a monster's spell   src/data/monster-spells.js `n`
//   a status            src/data/statuses.js `name` (a status is a row, and its name is the row's)
//   an engine piece     src/data/text/fight.js piece_<id> (a blow the engine names itself: damage.js `bodyguard`, reactions.js `carry`)
//   a reaction          the Roads node or option that grants it (src/data/talents.js `n`: Draining Sickness's heal, Shield Priest's)
//
//   nameOf(id)       the name, or null when nothing names `id` (tests/hunt-event-names.mjs holds every id the engine emits named)
//   sourceName(id)   the name, else the id spelled out: a source this build does not know still reads as words, never as a code
// ════════════════════════════════════════════════════════════════════════
import { ABILITIES } from '../data/abilities.js';
import { spellRow } from '../data/monster-spells.js';
import { STATUSES } from '../data/statuses.js';
import { TALENT_NODES } from '../data/talents.js';
import { t, hasText } from './player-text.js';

/* reaction id -> the name of the node or option that grants it, read once (the first one that names it) */
let reacts = null;
function reactName(id) {
  if (!reacts) {
    reacts = new Map();
    const take = (list, n) => { for (const e of list || []) if (e && e.kind === 'react' && !reacts.has(e.id)) reacts.set(e.id, n); };
    for (const node of TALENT_NODES) {
      take(node.effects, node.n);
      for (const o of node.options || []) take(o.effects, o.n);
    }
  }
  return reacts.get(id) || null;
}

/** The name of hunt event source `id` (the header's order), or null when nothing names it. */
export function nameOf(id) {
  if (typeof id !== 'string' || !id) return null;
  if (Object.hasOwn(ABILITIES, id)) return ABILITIES[id].n;
  const spell = spellRow(id);
  if (spell) return spell.n;
  if (Object.hasOwn(STATUSES, id)) return STATUSES[id].name;
  if (hasText('fight.piece_' + id)) return t('fight.piece_' + id);
  return reactName(id);
}

const spelled = (id) => { const s = String(id).replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };

/** The name of `id`, else the id spelled out ("Frozen ground"), never blank. */
export function sourceName(id) {
  return nameOf(id) || spelled(id);
}
