// ════════════════════════════════════════════════════════════════════════
// src/data/town-criers.js — THE TOWN CRIERS: PEOPLE WHO CALL OUT TIPS IN LOCAL CHAT.
//
// Tyler 2026-11-11: "We need a 'town crier' who yells out tips in local chat
// periodically. Or maybe even multiple: a smith that says 'temper your gear by
// going to xyz' and the Tamsin npc that says 'click on my board to see what I
// need help with'." One row per crier; a crier's lines are keyed by what the
// hero has NOT done yet, read from the server's projection
// (src/session/crier-facts.js), so a line is always a tip the player can use
// now and never noise. The clock, the pick and the chat line are
// src/shell/town-criers.js. A line is local and display-only: it is never
// sent to the server and no other player sees it.
//
// A crier:
//   id        the crier's id (the chat line's key)
//   name      how the chat names the speaker
//   stand     the station the crier stands at (src/data/world/stations.js id):
//             the link under a line opens that station's screen unless the
//             line says otherwise
//   everyMs   the least time between two of THIS crier's lines
//   lines     [{ id, when, at?, tab?, tabOf? }]
//     id      the text row: t('criers.say_<id>') is the line, t('criers.go_<id>')
//             the link's words (src/data/text/criers.js)
//     when    the fact that makes it a tip (CRIER_FACTS): the line is said only
//             while the hero's projection holds it
//     at      a station id the link opens instead of the crier's stand
//     tab     the tab of that window the link opens on
//     tabOf   the fact's field whose value is the tab (Tamsin's open task: its ground)
//
// CRIER_CLOCK: firstMs after a hero is first seen standing in town, everyMs
// between any two lines, tickMs how often the clock looks. CRIER_FACTS names
// every fact a line may key on; tests/town-criers.mjs holds a line to them.
//
// PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

const MIN = 60 * 1000;

export const CRIER_CLOCK = Object.freeze({ firstMs: 40 * 1000, everyMs: 2 * MIN, tickMs: 5 * 1000 });

/** The facts a line may key on, each read from the server's projection (src/session/crier-facts.js crierFactsOf). */
export const CRIER_FACTS = Object.freeze({
  unhunted: 'the hero has never hunted (no Level XP yet)',
  no_blessing: 'no Blessing is held',
  storage_unused: 'the account\'s Storage is empty',
  untempered: 'the hero wears gear with a tempering ladder and has never bought a rung',
  no_task: 'no task is held on Tamsin\'s tally',
  task_open: 'a task is held and not done: { label, count, ground, hunt }',
});

const line = (id, when, more) => Object.freeze(Object.assign({ id, when }, more || {}));
const crier = (id, name, stand, everyMs, lines) => Object.freeze({ id, name, stand, everyMs, lines: Object.freeze(lines) });

export const TOWN_CRIERS = Object.freeze([
  crier('crier', 'Town Crier', 'gatehouse', 3 * MIN, [
    line('gate', 'unhunted'),
    line('blessing', 'no_blessing', { at: 'shop', tab: 'services' }),
    line('storage', 'storage_unused', { at: 'storage' }),
  ]),
  /* the smith works the forges, and tempers under the Shop's Services tab (src/shell/windows/temper-pane.js) */
  crier('smith', 'Garrick the Smith', 'smithy_forges', 6 * MIN, [
    line('temper', 'untempered', { at: 'shop', tab: 'services' }),
  ]),
  crier('tamsin', 'Tamsin Reeve', 'tally', 5 * MIN, [
    line('board', 'no_task'),
    line('owe', 'task_open', { at: 'gatehouse', tabOf: 'hunt' }),
  ]),
]);

/** Every problem with the rows, as strings (empty = valid): tests/town-criers.mjs and the shell's boot read it. */
export function validateCriers(rows = TOWN_CRIERS, stations = null) {
  const out = [];
  const ids = new Set();
  for (const c of rows) {
    if (!c.id || ids.has(c.id)) out.push('crier `' + c.id + '`: id missing or duplicated');
    ids.add(c.id);
    if (!c.name) out.push('crier `' + c.id + '`: no name');
    if (stations && !stations.has(c.stand)) out.push('crier `' + c.id + '`: stand `' + c.stand + '` is no station');
    if (!Number.isSafeInteger(c.everyMs) || c.everyMs < CRIER_CLOCK.everyMs) out.push('crier `' + c.id + '`: everyMs under the clock\'s');
    if (!c.lines.length) out.push('crier `' + c.id + '`: no lines');
    const seen = new Set();
    for (const l of c.lines) {
      if (!/^[a-z][a-z0-9_]*$/.test(l.id) || seen.has(l.id)) out.push('crier `' + c.id + '`: line id `' + l.id + '` bad or duplicated');
      seen.add(l.id);
      if (!Object.prototype.hasOwnProperty.call(CRIER_FACTS, l.when)) out.push('crier `' + c.id + '` line `' + l.id + '`: `when` names no fact: ' + l.when);
      if (stations && l.at && !stations.has(l.at)) out.push('crier `' + c.id + '` line `' + l.id + '`: `at` is no station: ' + l.at);
    }
  }
  return out;
}
