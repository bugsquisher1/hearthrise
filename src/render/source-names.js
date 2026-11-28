// ════════════════════════════════════════════════════════════════════════
// src/render/source-names.js — WHAT A HUNT EVENT'S SOURCE IS CALLED (lane/client-talent-floaters, 2026-11-23).
//
// PURE. A hunt event names what did it by id: a `dmg` or a `heal` its `ability`, a status event its `status`. Since the engine
// pieces (lane/talent-effects) that id is not always a move: a Mending tick names its status, a Shield Priest heal its reaction,
// a guard's share or an overkill its engine piece. One reader for every surface that writes the id as words (the combat log,
// the analyzer's attacks, the hunt report's healing), in this order:
//   a move              src/data/abilities.js `n`
//   a monster's spell   src/data/monster-spells.js `n`; on a formula ground its role's (src/data/monster-roles.js roleSpellRow: `mf_brute`)
//   a status            src/data/statuses.js `name` (a status is a row, and its name is the row's)
//   an engine piece     src/data/text/fight.js piece_<id> (a blow the engine names itself: damage.js `bodyguard`, reactions.js `carry`)
//   a reaction          the Roads node or option that grants it (src/data/talents.js `n`: Draining Sickness's heal, Shield Priest's)
//   a worn Trait        its row's `name` (src/data/traits.js through gear-steps.js): a `dmg` or `heal` event's `tr` names the Traits that
//                       held on it (src/core/hunt/trait-rules.js). DARK: no event carries one while GEAR_STEPS.traitsLive is false
//   a worn imbuement    its row's `name` (src/data/imbue-rules.js): a worn Leech's heal names it (src/core/hunt/imbue-leech.js, damage.js
//                       landHit). DARK: none is worn while the imbuements switch is off
//
//   nameOf(id)       the name, or null when nothing names `id` (tests/hunt-event-names.mjs holds every id the engine emits named)
//   sourceName(id)   the name, else the id spelled out: a source this build does not know still reads as words, never as a code
//   traitNames(ev)   the names of the Traits an event's `tr` lists, in its order ([] for none)
// ════════════════════════════════════════════════════════════════════════
import { ABILITIES } from '../data/abilities.js';
import { spellRow } from '../data/monster-spells.js';
import { roleSpellRow } from '../data/monster-roles.js';
import { STATUSES } from '../data/statuses.js';
import { TALENT_NODES } from '../data/talents.js';
import { TRAITS } from '../data/gear-steps.js';
import { IMBUE_RULES } from '../data/imbue-rules.js';
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
  const derived = roleSpellRow(id);
  if (derived) return derived.n;
  if (Object.hasOwn(STATUSES, id)) return STATUSES[id].name;
  if (hasText('fight.piece_' + id)) return t('fight.piece_' + id);
  if (Object.hasOwn(TRAITS, id)) return TRAITS[id].name;
  if (Object.hasOwn(IMBUE_RULES, id)) return IMBUE_RULES[id].name;
  return reactName(id);
}

/** The names of the worn Traits event `ev` says held on it (its `tr`, comma-joined ids), in its order; [] for none. */
export function traitNames(ev) {
  const tr = ev && typeof ev.tr === 'string' && ev.tr ? ev.tr.split(',') : [];
  return tr.map((id) => sourceName(id));
}

const spelled = (id) => { const s = String(id).replace(/_/g, ' '); return s.charAt(0).toUpperCase() + s.slice(1); };

/** The name of `id`, else the id spelled out ("Frozen ground"), never blank. */
export function sourceName(id) {
  return nameOf(id) || spelled(id);
}
