// ════════════════════════════════════════════════════════════════════════
// src/hunt-view/live-diff.js — WHAT DIFFERS WHEN THE PREDICTION LEFT THE SERVER'S WORLD.
//
// The browser's engine is deterministic and server-seeded, so a diverged verdict means an input differs
// between the browser and the server, and a local replay of the same setup cannot say which one a real
// player hit. The moment the correcting start point lands the browser holds both worlds of that swing
// (live-engine.js worldAt, the start point's own text): this names every persisted field they disagree on,
// short enough for one telemetry event and a bug report. Numbers and catalogue ids only, nothing personal.
//
// PURE (no DOM). Display and telemetry only: nothing here feeds the hunt.
// ════════════════════════════════════════════════════════════════════════

import { FIELDS, decode, reconcileText } from '../core/hunt/world-state.js?v=0.2.78';

/* The most field lines a report carries; `count` and `by` say how many there were. */
const KEEP_LINES = 8;
const shown = (v) => String(JSON.stringify(v) ?? 'null').slice(0, 40);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * @param {string} mine    the prediction's world text at a swing
 * @param {string} theirs  the server's stored world text at that swing
 * @param {number|null} self  the viewed character's unit
 * @returns {{count: number, by: Object<string, number>, lines: string[]}|null}
 *   `by`: differing fields counted by the side that holds them (self, peer, mon, pack, world), each line one
 *   "<who>.<field> browser|server". Null when either text cannot be read. Server-only fields are not differences.
 */
export function worldDiff(mine, theirs, self) {
  let a, b;
  try { a = decode(JSON.parse(reconcileText(mine))); b = decode(JSON.parse(reconcileText(theirs))); } catch (e) { return null; }
  const by = {}, lines = [];
  let count = 0;
  const note = (who, group, field, x, y) => {
    count++;
    const k = group + '.' + field;
    by[k] = (by[k] || 0) + 1;
    if (lines.length < KEEP_LINES) lines.push(who + '.' + field + ' ' + shown(x) + '|' + shown(y));
  };
  for (const [f] of FIELDS.world) if (!same(a[f], b[f])) note('world', 'world', f, a[f], b[f]);
  const theirUnits = new Map(b.units.map((u) => [u.id, u]));
  const groupOf = (u) => (u.side === 'mon' ? 'mon' : u.id === self ? 'self' : 'peer');
  for (const u of a.units) {
    const t = theirUnits.get(u.id);
    const who = groupOf(u) + ':' + u.kind;
    if (!t) { note(who, groupOf(u), 'only_browser', u.id, null); continue; }
    theirUnits.delete(u.id);
    for (const [f] of FIELDS.unit) if (!same(u[f], t[f])) note(who, groupOf(u), f, u[f], t[f]);
  }
  for (const t of theirUnits.values()) note(groupOf(t) + ':' + t.kind, groupOf(t), 'only_server', null, t.id);
  a.packs.forEach((p, i) => {
    const q = b.packs[i];
    for (const [f] of FIELDS.pack) if (!q || !same(p[f], q[f])) note('pack' + i, 'pack', f, p[f], q ? q[f] : null);
  });
  return { count, by, lines };
}
