// ============================================================================
// services/world-tick/fixtures.js — fixture loading for the shadow spike.
//
// NO PRODUCTION READS, by construction: the only inputs are a JSON file in this
// directory and `src/data/*`, which is the game's content and is already the
// single source both runtimes import.
//
// Every catalogue id in the fixture is VALIDATED against src/data on load. A
// fixture that names an item the game no longer contains does not "still test
// the engine" — it tests the engine against a monster with no drop table and a
// weapon with no speed, which is the one way a parity spike can be green and
// meaningless.
// ============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

import { ITEMS } from '../../src/data/items.js';
import { MONSTERS } from '../../src/data/monsters.js';

const HERE = dirname(fileURLToPath(import.meta.url));

export const CATALOGUES = Object.freeze({ items: ITEMS, monsters: MONSTERS });

export function loadFixtures(file) {
  const path = file || join(HERE, 'fixtures', 'characters.json');
  const raw = JSON.parse(readFileSync(path, 'utf8'));
  const problems = [];
  for (const c of raw.characters) {
    if (c.activeKind === 'combat' && !Object.prototype.hasOwnProperty.call(MONSTERS, c.activeId)) {
      problems.push(`fixture "${c.name}": monster "${c.activeId}" is not in src/data/monsters.js`);
    }
    for (const slot of Object.keys(c.equipment || {})) {
      const id = c.equipment[slot];
      if (!Object.prototype.hasOwnProperty.call(ITEMS, id)) {
        problems.push(`fixture "${c.name}": equipment ${slot}="${id}" is not in src/data/items.js`);
      }
    }
    for (const id of Object.keys(c.inventory || {})) {
      if (!Object.prototype.hasOwnProperty.call(ITEMS, id)) {
        problems.push(`fixture "${c.name}": inventory item "${id}" is not in src/data/items.js`);
      }
    }
    if (c.autoEatFood && !Object.prototype.hasOwnProperty.call(ITEMS, c.autoEatFood)) {
      problems.push(`fixture "${c.name}": autoEatFood "${c.autoEatFood}" is not in src/data/items.js`);
    }
  }
  if (problems.length) {
    throw new Error('fixture drift against src/data:\n  - ' + problems.join('\n  - '));
  }
  return raw.characters;
}

/* Resolve the fixture's relative offsets against a scenario start instant.
   Absolute epochs in the JSON would rot; an offset is a property of the
   scenario and stays true. */
export function atSpan(fixture, fromMs) {
  const c = JSON.parse(JSON.stringify(fixture));
  c.activeSinceMs = fromMs + Number(c.activeSinceOffsetMs || 0);
  c.accruedToMs = fromMs;
  delete c.activeSinceOffsetMs;
  return c;
}
