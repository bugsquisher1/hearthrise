// ============================================================================
// services/world-tick/gather.js — RE-EXPORT ONLY. The code moved, it was not copied.
//
// 2026-09-21, milestone 1b: the `op:'tick'` entry in `hr-accrue` runs this
// logic for real, and `tools/pack-edge.mjs` can only vendor from `src/core` and
// `src/data` — so a module under `services/` is unreachable from an edge
// payload. The production half therefore LIVES at
// `supabase/functions/hr-accrue/tick-gather.js` and this file re-exports it.
//
// Copying it here instead would be the second gather path AWAY-12 forbids, and
// the drift would be silent: the offline guards would keep measuring a file the
// deployed function no longer runs.
// ============================================================================

export * from '../../supabase/functions/hr-accrue/tick-gather.js';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { ITEMS } from '../../src/data/items.js';
import { GATHER_NODES } from '../../supabase/functions/hr-accrue/catalogue.js';
import { CHANNEL } from '../../supabase/functions/hr-accrue/tick-gather.js';

const HERE = dirname(fileURLToPath(import.meta.url));

/* THE FIXTURE HALF STAYS OFFLINE. It reads `node:fs` and a fixtures directory,
   neither of which belongs in an edge payload, and nothing in production calls
   it: the tick's active set is server rows (`sessionFromRoster`), never a file.
/* THE OFFLINE SHAPE. Fixtures, for the parity guard and for a run with no
   credentials. Validated against the real catalogues on load, for the reason
   fixtures.js states: a fixture naming a node the game no longer contains does
   not still test the engine. */
export function loadGatherSessions(file) {
  const path = file || join(HERE, 'fixtures', 'gather-sessions.json');
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const problems = [];
  for (const s of raw.sessions) {
    if (!Object.prototype.hasOwnProperty.call(GATHER_NODES, s.activeId)) {
      problems.push(`session "${s.name}": node "${s.activeId}" is not in the gather index`);
    }
    for (const id of Object.keys(s.inventory || {})) {
      if (!Object.prototype.hasOwnProperty.call(ITEMS, id)) {
        problems.push(`session "${s.name}": inventory item "${id}" is not in src/data/items.js`);
      }
    }
    for (const slot of Object.keys(s.equipment || {})) {
      if (!Object.prototype.hasOwnProperty.call(ITEMS, s.equipment[slot])) {
        problems.push(`session "${s.name}": equipment ${slot}="${s.equipment[slot]}" is not in src/data/items.js`);
      }
    }
  }
  if (problems.length) throw new Error('gather fixture drift against src/data:\n  - ' + problems.join('\n  - '));
  return raw.sessions;
}

/* Resolve relative offsets against a scenario start, as fixtures.js does. */
export function atSpan(session, fromMs) {
  const s = JSON.parse(JSON.stringify(session));
  s.activeKind = CHANNEL;
  s.activeSinceMs = fromMs + Number(s.activeSinceOffsetMs || 0);
  s.accruedToMs = fromMs;
  delete s.activeSinceOffsetMs;
  return s;
}
