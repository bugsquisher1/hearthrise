// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/character/state.js — THE CHARACTER WINDOW'S SCRATCH.
//
// Display state only, per character: the open tab, the outfit draft (the
// outfit and dyes being tried on, the facing, the search, the owned filter,
// the region being dyed), the death row that is open, and the one intent in
// flight. Nothing reads it but this window and nothing spends it: the worn
// outfit is the server's `outfit` section until Save's answer re-reads it.
// ════════════════════════════════════════════════════════════════════════

const SCRATCH = new WeakMap();

/** This character's Character-window scratch (made on first use). */
export function scratchOf(cs) {
  let s = SCRATCH.get(cs);
  if (!s) {
    s = { tab: 'sheet', pending: false, msg: '',
      /* the sheet ask: one per opening (due → asking → done), then one per stale version, never two at once */
      opening: 'due', sheetAsked: null, sheetAsking: false,
      /* the outfit draft (null = not started: follow the server) */
      draft: null, dir: 0, query: '', ownedOnly: false, region: null,
      openDeath: null };
    SCRATCH.set(cs, s);
  }
  return s;
}
