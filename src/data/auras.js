// ════════════════════════════════════════════════════════════════════════
// src/data/auras.js — PARTY AURA ROWS (lane/e2-e3-statuses, E3; docs/design/redesign/22-fists-support.md 2.2 and 4.2, 19 section 3)
//
// An aura is a party effect that holds WHILE ITS MOVE IS SLOTTED: an ability row with `target: 'aura'` and `aura: <id>` on a hero's bar
// (src/data/abilities.js), cast never, on while it sits there and its hero lives. Every living hero of the wearer's side within `radius`
// tiles (Chebyshev) of the wearer, the wearer too, gets the row's steps as a POWER LEDGER ROW (src/core/power-ledger.js clampLedger):
//   { slice, raises, steps, key, scope: 'party', worn: true on the wearer, false on an ally }
// so the ledger's party-row rule counts it: ONE PER KEY A PARTY (two wearers of one key: the larger counts, never both), on an ally
// whole and outside its own cap (in the wearer's slice, 19 section 3), on the wearer inside its own slice's cap. src/core/hunt/auras.js
// writes the rows; src/core/hunt/danger.js powerPm reads them with the hero's own ledger (on the Danger scale, as every ledger row).
//
// ROW SHAPE: { id, name, key, radius, slice, raises, steps }
//   key     its party key: one aura of a key counts a party (22 4.2: "Party aura: damage", "Party aura: mana")
//   radius  tiles round the wearer, 1..12
//   slice   the ledger slice it counts in (src/data/power-ledger.js LEDGER_SLICES): a move's or a node's, 'build'
//   raises  the ledger channel: offense | defense | heal
//   steps   at full size, in power steps (DANGER.powerStep); a build slice ramps them with the Level (power-ledger.js ramp)
//
// No move names an aura yet: the Wraps' fires stay hidden (FIST_LINE.live false). OPEN FIRE is the sample row the engine and the Lab
// read: "+4% damage within 8 tiles" (22 2.2) is about 11 steps at the 0.35% step. PROVISIONAL, the designer's number.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

import { LEDGER_SLICES } from './power-ledger.js';

export const AURAS = Object.freeze({
  open_fire: Object.freeze({ id: 'open_fire', name: 'Open Fire', key: 'party_damage', radius: 8, slice: 'build', raises: 'offense', steps: 11 }),
});

const ID = /^[a-z0-9_]{1,32}$/;
const CHANNELS = Object.freeze(['offense', 'defense', 'heal']);

/** Every problem with the table (or `rows`, one of its shape), as strings. Empty = valid. */
export function validate(rows = AURAS) {
  const out = [];
  for (const [id, r] of Object.entries(rows)) {
    const bad = (m) => out.push('aura ' + id + ': ' + m);
    if (!r || r.id !== id || !ID.test(id)) { bad('its key must equal its [a-z0-9_] id'); continue; }
    if (typeof r.name !== 'string' || !r.name) bad('needs a name');
    if (typeof r.key !== 'string' || !ID.test(r.key)) bad('key is a [a-z0-9_] party key');
    if (!Number.isInteger(r.radius) || r.radius < 1 || r.radius > 12) bad('radius is a whole 1..12 tiles');
    if (!Object.prototype.hasOwnProperty.call(LEDGER_SLICES, r.slice)) bad('slice ' + r.slice + ' is no ledger slice');
    if (!CHANNELS.includes(r.raises)) bad('raises is offense, defense or heal');
    if (!Number.isInteger(r.steps) || r.steps < 1 || r.steps > 40) bad('steps is a whole 1..40 (an aura raises; a cost is a vow\'s)');
    for (const k of Object.keys(r)) if (!['id', 'name', 'key', 'radius', 'slice', 'raises', 'steps'].includes(k)) bad(k + ' is no aura field');
  }
  return out;
}
