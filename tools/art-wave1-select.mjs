/**
 * WAVE 1 SELECTION  ·  Art Director, 2026-08-16
 *
 * The judgement half of the wave-1 pipeline, kept as code so the ruling is
 * re-runnable and auditable rather than living in a chat log. It stages the
 * ACCEPTED sources under their final ids; `art-wave-matte.mjs` then turns that
 * staging folder into the shipped PNGs.
 *
 * Two kinds of decision, both made by looking at rendered contact sheets at
 * BOTH review size (265 px) and true render size (92 px), never from the file
 * browser:
 *
 * SUBSTITUTIONS — Tyler saved several takes of four monsters "because they
 * were that good"; the mechanical import took the first file as primary. Two
 * of those six groups were picked wrong, and both only became obvious at
 * render size / on a shelf.
 *
 * WITHHELD — a portrait that does not depict its own id is worse than no
 * portrait, because the renderer already degrades cleanly to the glyph atlas.
 * This repo shipped a boar labelled `bear` for months; that is the failure
 * this list exists to prevent.
 */
import fs from 'fs';
import path from 'path';

const SRC = process.argv[2];
const OUT = process.argv[3];
if (!SRC || !OUT) { console.error('usage: art-wave1-select.mjs <srcDir> <stageDir>'); process.exit(2); }

/** id -> the file in `alts/` that beats the imported primary. */
export const SUBSTITUTIONS = {
  // The primary keeps the wax mask entirely in hood-shadow: at 92 px it reads
  // as an EMPTY pale hood with an orange smudge, and the mask is the whole
  // identity of a candle-cultist. alt4 lights the mask fully against the pale
  // hood and turns three-quarters, so it also has the only asymmetric
  // silhouette of the four. alt2/alt3 are both fine and both duller.
  cultist: 'cultist__alt4',
  // Not a taste call — an identity one. The subject is "a NERVOUS TEENAGE
  // apprentice, one hand glowing badly, the other holding a dropped book".
  // The primary and alt2 are grinning red-eyed villains, indistinguishable at
  // render size from `warlock`, `dark_wizard`, `necromancer` and `conjurer`,
  // all of which already ship. alt3 is the wide-eyed kid the row describes.
  witchs_apprentice: 'witchs_apprentice__alt3',
};

/**
 * Kept OUT of the shipped set. Each falls back to the glyph atlas, which is
 * the correct degradation. Reason recorded so the regeneration brief is not
 * reconstructed from memory.
 */
export const WITHHELD = {
  cyclops: 'has TWO EYES. The id, the subject line and the monster\'s name all say one.',
  void_mote: 'depicts a heavy goggled humanoid in a headscarf. The subject is a small hovering hole in the world.',
  elder_cinder: 'no coals, no ash, no core glow — a plain grey stone brute. Side by side it is indistinguishable from ogre, rock_troll and mountain_troll, which all ship. Four identical brutes is a bestiary-legibility failure, not a style quibble.',
  ooze: 'the two identifying features of the subject — the dark eyes and the wide mouth floating IN the gel — are absent, and it sits on a humanoid torso. At render size it reads as a diseased man, not an ooze.',
};

/** Alternates that are unusable regardless of which take wins. */
export const UNSHIPPABLE_ALTS = {
  locust_swarm__alt1: 'painted sky backdrop, not a studio key — no matte can recover it (art-wave-matte fails it outright: "no light neutral key on the border ring").',
};

const primaries = fs.readdirSync(SRC).filter((f) => /\.jpg$/i.test(f)).map((f) => f.replace(/\.jpg$/i, ''));
fs.mkdirSync(OUT, { recursive: true });
for (const f of fs.readdirSync(OUT)) fs.unlinkSync(path.join(OUT, f));

const staged = [];
for (const id of primaries) {
  if (WITHHELD[id]) continue;
  const sub = SUBSTITUTIONS[id];
  const from = sub ? path.join(SRC, 'alts', sub + '.jpg') : path.join(SRC, id + '.jpg');
  if (!fs.existsSync(from)) { console.error('MISSING', from); process.exit(1); }
  fs.copyFileSync(from, path.join(OUT, id + '.jpg'));
  staged.push(id);
}

console.log(`staged ${staged.length} of ${primaries.length}`);
console.log(`substituted: ${Object.entries(SUBSTITUTIONS).map(([k, v]) => `${k} <- ${v}`).join(', ')}`);
console.log(`withheld:    ${Object.keys(WITHHELD).join(', ')}`);
console.log(staged.join(' '));
