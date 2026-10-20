// tests/hunt-core/world-state.mjs — src/core/hunt/world-state.js (engine contract #4). Run by run-all.mjs.
import { suite, hero, mon, world } from './fixtures/h1.js';

const sample = (M) => world(M, [
  hero(M, 1, 12, 3, { goal: [2, 8], path: [[11, 3], [10, 3]], fx: 13, prog: 420, dir: 6, spot: [16, 3], target: 4 }),
  mon(M, 4, 0, 14, 3, { hp: 7, target: 1, waitMs: 300, repathMs: 200 }),
], { leader: 1, swing: 17, trail: [[13, 3], [12, 3]], packs: [{ aggro: true, holder: 1 }, { aggro: false, holder: null }] });

const cases = {
  'round-trip': (M) => {
    const w = sample(M);
    const back = M.worldstate.decode(JSON.parse(JSON.stringify(M.worldstate.encode(w))));
    const a = JSON.stringify(M.worldstate.makeWorld(w)); const b = JSON.stringify(M.worldstate.makeWorld(back));
    if (a !== b) return 'decode(encode(w)) differs:\n  ' + a + '\n  ' + b;
    const bad = M.worldstate.validate(back);
    return bad.length ? 'the decoded world does not validate: ' + bad.join('; ') : null;
  },
  'bound': (M) => {
    if (M.worldstate.validate(sample(M)).length) return 'the sample world should validate: ' + M.worldstate.validate(sample(M)).join('; ');
    const long = Array.from({ length: 60 }, (_, i) => [i % 19, 8]);
    const big = world(M, Array.from({ length: 40 }, (_, i) => mon(M, i + 1, 0, 14, 3, { path: long.map((t) => t.slice()) })));
    const bad = M.worldstate.validate(big);
    if (!bad.some((s) => /bytes, over the/.test(s))) return 'a ' + M.worldstate.encodedBytes(big) + '-byte world passed the bound';
    return null;
  },
  'refuses-another-shape': (M) => {
    const enc = M.worldstate.encode(sample(M));
    const throws = (e) => { try { M.worldstate.decode(e); return false; } catch { return true; } };
    if (!throws(Object.assign({}, enc, { s: enc.s ^ 1 }))) return 'a world of another field list was decoded';
    if (!throws(Object.assign({}, enc, { v: enc.v + 1 }))) return 'a world of another version was decoded';
    /* A row short only by the DEFAULTED fields (a world saved before they existed) loads them blank;
       a row short by a shaped field is another shape and is refused. */
    const nShaped = M.worldstate.FIELDS.unit.length;
    if (!throws(Object.assign({}, enc, { u: [enc.u[0].slice(0, nShaped - 1)] }))) return 'a short unit row was decoded';
    let old;
    try { old = M.worldstate.decode(Object.assign({}, enc, { u: enc.u.map((r) => r.slice(0, nShaped)) })); } catch (e) { return 'a world saved without the defaulted fields was refused: ' + e.message; }
    if (!old.units.every((u) => u.hurt === null)) return 'a missing defaulted field did not load blank';
    return null;
  },
  'validate-refuses-bad-values': (M) => {
    const w = sample(M);
    w.units[0].x = 1.5;
    if (!M.worldstate.validate(w).some((s) => /\.x is not a valid int/.test(s))) return 'a float tile passed';
    const w2 = sample(M); w2.units.reverse();
    if (!M.worldstate.validate(w2).some((s) => /ascending/.test(s))) return 'descending unit ids passed';
    return null;
  },
  'fields-composed-from-modules': (M) => {
    const names = M.worldstate.FIELDS.unit.map(([n]) => n);
    for (const n of ['id', 'x', 'y', 'prog', 'path', 'spot']) if (!names.includes(n)) return 'the unit field list lacks ' + n;
    return null;
  },
};

const mutants = [
  { name: 'decode drops a field', case: 'round-trip',
    edits: [['src/core/hunt/world-state.js', "  ALL[part].forEach(([name, kind], i) => { out[name] = i < arr.length ? copy(arr[i]) : KINDS[kind].blank(); });", "  ALL[part].forEach(([name, kind], i) => { out[name] = name === 'prog' ? 0 : i < arr.length ? copy(arr[i]) : KINDS[kind].blank(); });"]] },
  { name: 'no byte bound', case: 'bound',
    edits: [['src/core/hunt/world-state.js', '    if (bytes > HUNT_TUNING.worldMaxBytes)', '    if (false)']] },
  { name: 'two modules persist one field', case: 'fields-composed-from-modules',
    edits: [['src/core/hunt/roles.js', "unit: Object.freeze([['role', 'str'],", "unit: Object.freeze([['x', 'int'], ['role', 'str'],"]] },
];

await suite('hunt-core/world-state', cases, mutants);
