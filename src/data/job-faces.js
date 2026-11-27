// ════════════════════════════════════════════════════════════════════════
// src/data/job-faces.js — THE HUNTED STREAMS' FACES AND THE IMBUEMENT JOBS (lane/k1-job-slice, backend-architect, 2026-11-26;
//   docs/design/redesign/09-crafting.md sections 4.9 and 4.10, 21-flame-temper-imbue-loot.md section 3.2).
//
// Two small tables the kit trades (src/data/trades.js, which re-exports both) and the item rows (src/data/items.js: the made imbuements)
// read, kept apart so the item table does not load the whole trade catalogue:
//   STREAM_FACES   what a band drops for a hunted stream (13-market 3.2: how many make an hour-unit is the drop formulas'), band 0 first
//   IMBUE_JOBS     one Artificing job an imbuement (IMBUE_RULES), derived and never typed
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════
import { IMBUE_RULES, imbueBandOf, imbueItemOf } from './imbue-rules.js';
import { GEAR_STEPS } from './gear-steps.js';

/* THE REMAINS A BAND (imbue-rules.js: "the Remains good is one a band, and the job slice names its face"). JUDGMENT, the designer re-rules
   it (CONFLICTS 2026-11-26 k1-job-slice): band 0 is Bones (the designer's, 09 4.9), band 2 is Bones too (inner-flame.js FLAME_FUEL stands
   it at entry Level 45, band 2, and it drops on every band-2 imbuement part's home ground) and band 3 is Razor Claw (FLAME_FUEL Level 70,
   band 3, and it drops on the Pyre Field, home of both band-3 parts). Band 1 has no imbuement, so no face. */
export const STREAM_FACES = Object.freeze({ remains: Object.freeze(['bones', null, 'bones', 'razor_claw']) });

/** The item a hunted stream drops at `band` (null: none named). */
export const streamFaceOf = (stream, band) => (STREAM_FACES[stream] && STREAM_FACES[stream][band]) || null;

/* THE IMBUEMENT JOBS (21 section 3.2, HANDOFFS 2026-11-26 tp-server-1): Artificing makes `imbue_<id>` (imbueItemOf) from its row's part
   and the Remains of its band, one job row an imbuement. Its BAND is its part's (imbueBandOf, an entry Level) read as a gear band (tierSteps
   a band), so a Fire Ward made from Ford weed is band 2 and a Brute Edge from a Pyre Field ferrule band 3. Its counts are imbueRecipe's (5
   parts, 4 Remains), which is also what src/core/trades.js jobRecipes reads off the catalogue's hunted inputs (its hour-unit rule).
   JUDGMENT (CONFLICTS 2026-11-26 k1-job-slice): an imbuement opens at the kind's own rung, not at its band's (bandRung), because no
   imbuement sits under band 2 and a trade gated at Level 21 with nothing under it could never be trained. */
export const imbueJobId = (imbue) => 'imbuement_' + imbue;
export const IMBUE_JOBS = Object.freeze(Object.keys(IMBUE_RULES).filter((id) => imbueBandOf(id) !== null).map((id) => Object.freeze({
  id: imbueJobId(id), imbue: id, kind: 'imbuement', band: Math.floor(imbueBandOf(id) / GEAR_STEPS.tierSteps),
  name: 'Make ' + IMBUE_RULES[id].name, face: imbueItemOf(id), part: IMBUE_RULES[id].part,
})));
