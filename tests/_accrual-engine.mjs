// tests/_accrual-engine.mjs — THE ACCRUAL ENGINE'S SOURCE, ALL OF IT, for the guards that read its text.
// mutant-anchors: none — a pure reader with no proof arm of its own
//
// supabase/functions/hr-accrue/accrual.js was one 2,473-line file until 2026-11-19 (architecture audit item 7). It is
// the engine's door now, and its pieces sit beside it (the module map is in its header). A guard that read "accrual.js"
// for a rule about the ENGINE (no spread of a caller object, no wall clock, every `inp.<name>` it reads, every
// `reason:` it returns, every delta key it proposes) reads engineSource(): the door and every sibling an engine file
// imports, transitively, except the modules that are not engine (NOT_ENGINE). A new piece is read the day an engine file
// imports it; nothing here lists it.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const FN_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'functions', 'hr-accrue');
export const DOOR = 'accrual.js';
/* Siblings the engine imports that are not engine: the one catalogue-lookup guard and the hunt's keyed seeder. Each is
   read by its own guards; reading them here would hold their text to the engine's rules. */
export const NOT_ENGINE = Object.freeze(['intents.js', 'hunt-seed.js']);
/* The engine has five pieces since 2026-11-21 (accrual-contract, accrual-window, accrue-gather, accrue-artisan, accrue-hunt):
   accrue-rested.js left with the rested bank (Tyler S-9 c). The floor is the count, so a reader that found fewer is blind. */
const MIN_PIECES = 5;

const SIBLING = /(?:^|\n)\s*(?:import|export)\s[^;]*?\sfrom\s+'\.\/([\w.-]+\.js)'/g;

/** The engine's files in `fnDir` (the repo's, or a mutation harness's copy), the door first, then each piece in the
 *  order the door and its pieces first import it. Throws when the door imports fewer than MIN_PIECES: a reader that
 *  found only the door would hold the guards to a seventh of the engine and call it green. */
export function engineFiles(fnDir = FN_DIR) {
  const out = [DOOR];
  for (let i = 0; i < out.length; i++) {
    const text = readFileSync(join(fnDir, out[i]), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of text.matchAll(SIBLING)) {
      if (!NOT_ENGINE.includes(m[1]) && !out.includes(m[1])) out.push(m[1]);
    }
  }
  if (out.length - 1 < MIN_PIECES) {
    throw Object.assign(new Error(`_accrual-engine: ${DOOR} reaches ${out.length - 1} piece(s) in ${fnDir}, fewer than ${MIN_PIECES}: the reader is blind`), { harness: true });
  }
  return out;
}

/** The engine's text: every engine file in engineFiles order, joined by a newline (CRLF normalised). */
export function engineSource(fnDir = FN_DIR) {
  return engineFiles(fnDir).map((f) => readFileSync(join(fnDir, f), 'utf8').replace(/\r\n/g, '\n')).join('\n');
}
