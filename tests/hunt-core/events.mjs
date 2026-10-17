// tests/hunt-core/events.mjs — src/core/hunt/events.js (the one event + track schema). Run by run-all.mjs.
import { suite } from './fixtures/h1.js';

const sampleOf = (k) => (k === 'xpLost' ? { attack: 3 } : k === 'u' || k === 't' || k === 'amount' || k === 'pocket' || k === 'level' ? 2 : 'x');

const cases = {
  'schema-round-trip': (M) => {
    for (const [type, req] of Object.entries(M.events.EVENT_TYPES)) {
      const ev = M.events.makeEvent(type, 1000, Object.fromEntries(req.map((k) => [k, sampleOf(k)])));
      const back = JSON.parse(JSON.stringify(ev));
      if (JSON.stringify(back) !== JSON.stringify(ev)) return type + ' does not survive JSON';
      const bad = M.events.validateEvent(back);
      if (bad.length) return type + ': ' + bad.join('; ');
    }
    const st = M.events.trackStep(3, 4, 5, 600);
    return JSON.stringify(st) === '{"u":3,"x":4,"y":5,"atMs":600}' ? null : 'track step shape ' + JSON.stringify(st);
  },
  'refuses-malformed': (M) => {
    const throws = (f) => { try { f(); return false; } catch { return true; } };
    if (!throws(() => M.events.makeEvent('nonsense', 0, {}))) return 'an unknown type was admitted';
    if (!throws(() => M.events.makeEvent('dmg', 0, { u: 1, t: 2 }))) return 'a dmg with no amount was admitted';
    if (!throws(() => M.events.makeEvent('ended', 10.5, { reason: 'x' }))) return 'a float instant was admitted';
    if (!throws(() => M.events.makeEvent('ended', 0, { reason: 'x', extra: [1, 2] }))) return 'an array field was admitted';
    if (!throws(() => M.events.trackStep(1, 2.5, 3, 0))) return 'a float track tile was admitted';
    return null;
  },
};

const mutants = [
  { name: 'required fields are not checked', case: 'refuses-malformed',
    edits: [['src/core/hunt/events.js', "  for (const k of req) if (ev[k] === undefined) out.push(ev.type + ': missing ' + k);\n", '']] },
];

await suite('hunt-core/events', cases, mutants);
