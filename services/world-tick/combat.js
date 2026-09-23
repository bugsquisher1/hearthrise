// ============================================================================
// services/world-tick/combat.js — RE-EXPORT ONLY. The code moved, it was not copied.
//
// 2026-09-23, Security S-8: the `op:'tick'` entry in `hr-accrue` runs this
// logic for real, and `tools/pack-edge.mjs` can only vendor from `src/core`,
// `src/data` and the function directory — so a module under `services/` is
// unreachable from an edge payload. While the combat settler lived HERE,
// `tick.js` imported `CHANNEL` from `tick-gather.js`, fenced every character as
// 'gather', and `settleCombatSession` had no production caller at all: the
// combat shadow could not produce a single row. The production half therefore
// LIVES at `supabase/functions/hr-accrue/tick-combat.js` and this file
// re-exports it, exactly as gather did on 2026-09-21.
//
// Copying it here instead would be the second combat path AWAY-12 forbids, and
// the drift would be silent: the offline guards would keep measuring a file the
// deployed function no longer runs.
// ============================================================================

export * from '../../supabase/functions/hr-accrue/tick-combat.js';

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { ITEMS } from '../../src/data/items.js';
import { MONSTERS } from '../../src/data/monsters.js';
import { CHANNEL, pgTimestamptzText }
  from '../../supabase/functions/hr-accrue/tick-combat.js';

const HERE = dirname(fileURLToPath(import.meta.url));

// ═══════════════════════════════════════════════════════════════════════════
// THE OFFLINE HALF — fixtures, for the parity guard and a credential-free run
// ═══════════════════════════════════════════════════════════════════════════

/* THE FIXTURE HALF STAYS OFFLINE and moves nowhere when the rest of this file
   moves into the edge payload: it reads `node:fs` and a fixtures directory,
   neither of which belongs in a payload, and nothing in production calls it —
   the tick's active set is server rows (`sessionFromRoster`), never a file.

   Validated against the real catalogues on load, for the reason fixtures.js
   states: a fixture naming a monster the game no longer contains does not
   still test the engine, it tests the engine against a foe with no drop table. */
export function loadCombatSessions(file) {
  const path = file || join(HERE, 'fixtures', 'combat-sessions.json');
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const problems = [];
  for (const s of raw.sessions) {
    if (!Object.prototype.hasOwnProperty.call(MONSTERS, s.activeId)) {
      problems.push(`session "${s.name}": monster "${s.activeId}" is not in src/data/monsters.js`);
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
    if (s.autoEatFood && !Object.prototype.hasOwnProperty.call(ITEMS, s.autoEatFood)) {
      problems.push(`session "${s.name}": autoEatFood "${s.autoEatFood}" is not in src/data/items.js`);
    }
  }
  if (problems.length) {
    throw new Error('combat fixture drift against src/data:\n  - ' + problems.join('\n  - '));
  }
  return raw.sessions;
}

/* Resolve the fixture's relative offsets against a scenario start instant.
   Absolute epochs in the JSON would rot; an offset is a property of the
   scenario and stays true.

   `accruedToText` is stamped here in the ACCRUE PATH'S OWN SPELLING — the
   `hr_state_of` JSONB rendering, `+00:00` and no padded fraction — rather than
   `toISOString()`. A fixture that carried the `Z` spelling would make the
   guard agree with the defect T-2 names, and one that carried a padded
   fraction would agree with S-2. */
export function atSpan(session, fromMs) {
  const s = JSON.parse(JSON.stringify(session));
  s.activeKind = CHANNEL;
  s.activeSinceMs = fromMs + Number(s.activeSinceOffsetMs || 0);
  s.accruedToMs = fromMs;
  s.accruedToText = pgTimestamptzText(fromMs);
  if (typeof s.recoveringUntilOffsetMs === 'number') {
    s.recoveringUntilMs = fromMs + s.recoveringUntilOffsetMs;
  }
  /* THE COMBAT-XP WATERMARK, RELATIVE LIKE THE OTHER TWO. A fixture that
     pinned it absolutely would name an instant outside every span and the
     split would be inert — which is how a fixture stops being able to SEE an
     input (M1f F4). Offset zero is still spelled as the plain field. */
  if (typeof s.combatXpAccruedToOffsetMs === 'number') {
    s.combatXpAccruedToMs = fromMs + s.combatXpAccruedToOffsetMs;
  }
  delete s.activeSinceOffsetMs;
  delete s.recoveringUntilOffsetMs;
  delete s.combatXpAccruedToOffsetMs;
  return s;
}

