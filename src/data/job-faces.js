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
import { GEAR_STEPS } from './danger.js';

/* THE REMAINS A BAND (imbue-rules.js: "the Remains good is one a band, and the job slice names its face"). JUDGMENT, the designer re-rules
   it (CONFLICTS 2026-11-26 k1-job-slice): band 0 is Bones (the designer's, 09 4.9), band 2 is Bones too (inner-flame.js FLAME_FUEL stands
   it at entry Level 45, band 2, and it drops on every band-2 imbuement part's home ground) and band 3 is Razor Claw (FLAME_FUEL Level 70,
   band 3, and it drops on the Pyre Field, home of both band-3 parts). Band 1 is Bones too (the designer, lane/designer-kit-band1, 09 4.13):
   band 1 has no imbuement, but its runes bind with Remains, and the Mosslight Glade (the band-1 ground, gear Level 20) drops Bones
   from glade_poacher, goblin_sluicer and rook_poacher, so the binder of bands 0 to 2 is one good and changes where the imbuement's does.
   BAND 3 IS GRAVE DUST, not Razor Claw (the designer, lane/kit-bands-2-3, 09 4.14): band 3's runes bind with its Remains too, and Razor
   Claw drops only on the Pyre Field (entry Level 70), so a company hunting the Muster Barrows (the band-3 ground, gear Level 60) could
   never cut its own band's runes. Grave Dust drops on the Muster Barrows (cairn_wight, captain_hask) and on the Pyre Field (pyre_wraith,
   provost), the home of both band-3 imbuement parts, so the binder still comes from where the band's parts drop.
   BAND 4 IS BIG BONES (the designer, lane/kit-bands-4-5, 09 4.15): both band-4 grounds drop them (Krell's Hold: grave_guard, gatekeeper;
   the Pyre Field: stoker, provost), so a company on either cuts its Graven runes. Razor Claw drops on the Pyre Field alone.
   BANDS 5 TO 8 ARE NAMED BEFORE THEIR RUNES (the designer, lane/kit-bands-6-9, 09 4.16): no rune tier or imbuement sits past band 4 yet, but
   the rune ladder runs on (HANDOFFS 2026-11-28, kit-bands-6-9), and each band's binder is the Remains a ground OF THAT BAND drops, so the
   rows are owed no face when they land (tests/kit-recipes.mjs KR-BINDER). Band 5 Big Bones (Carter's Rest: stable_troll, the_landlord),
   band 6 Big Bones (the Ox Road: yoke_ox, wagonmaster), band 7 Dragon Bones (the Wyvern Roost: every wyvern, its only Remains), band 8
   Big Bones (both Catacomb wings: bone_wall, and keeper_dunn in the Flooded Wing). */
export const STREAM_FACES = Object.freeze({ remains: Object.freeze(['bones', 'bones', 'bones', 'grave_dust', 'big_bones',
  'big_bones', 'big_bones', 'dragon_bones', 'big_bones']) });

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
