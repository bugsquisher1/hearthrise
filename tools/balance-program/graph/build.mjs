// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/graph/build.mjs — THE MODEL GRAPH, BUILT (Balance Lab phase 1; docs/design/redesign/07-balance-lab.md 3.1).
// One pure function. It joins the registers that already exist and adds nothing of its own but the join:
//   formulas-architecture.json (the formulas and their edges) + graph/io.mjs (their typed reads and writes) + the rule code (what the
//   homes really touch, by graph/derive.mjs) + levers.json (the levers and the outcomes each declares) + targets.json and the bands
//   of standards.mjs (the targets and their readers) + the measured table (graph/measured.mjs).
//
//   buildGraph(ctx) -> { problems, findings, graph }
//     problems   STRUCTURAL faults. Any one fails --check: a formula with no typed row, an unknown quantity, a lost home, a token the
//                code touches that no declaration covers (an undeclared read or write), a declaration the code does not show and no
//                reason explains (a wrong declaration), a lever that moves a quantity its formulas do not write.
//     findings   what the graph SEES, each with a stable id: ghost edges, sign misses, undeclared movements, dead levers. A finding is
//                not a failure while it is on the baseline. A NEW one fails --check.
//     graph      the joined picture tools/balance-program/graph.json holds and `lab ask` reads.
//
// GHOST EDGES, four kinds (the idea is mechflow's, rebuilt here):
//   feeds      F writes a quantity G reads, and the register holds no edge between them
//   writers    F and G both write one quantity, and the register holds no edge between them (two numbers stack on one amount)
//   carrier    the register holds an edge F -> G, and F writes nothing G reads (an interaction nobody can name a quantity for)
//   call       G's code reaches into F's home, and no quantity is declared between the two in either direction (an interaction the code
//              shows and the typed rows do not)
// A pair is cleared by a NO_INTERACTION record in io.mjs, or answered by an INTERACTIONS row. Two formulas that only READ the same
// quantity are not a ghost edge: half the game reads the hero's Level.
// ════════════════════════════════════════════════════════════════════════
import { createHash } from 'node:crypto';
import { topLevel, occurrences, importsOf } from './derive.mjs';
import { tokenIndex } from './quantities.mjs';
import { stepsOf, trace } from './trace.mjs';
import { compare } from './measured.mjs';

export const GRAPH_SCHEMA = 'hearthrise.balance-graph/1';
/* the kinds of node an interaction may name. 'trait' has no rows yet: gear Traits (docs/design/redesign/02-architecture.md 2c) join as
   nodes of this kind and their pairs as INTERACTIONS rows of kind 'pair', with no change to this shape */
export const NODE_KINDS = Object.freeze(['formula', 'reader', 'lever', 'target', 'trait']);
export const INTERACTION_KINDS = Object.freeze(['feeds', 'stacks', 'excludes', 'pair']);
export const FINDING_KINDS = Object.freeze({
  feeds: 'ghost edge: one writes what the other reads, no declared edge',
  writers: 'ghost edge: two mechanics write one quantity, no declared edge',
  carrier: 'ghost edge: a declared edge with no shared quantity',
  call: 'ghost edge: the code calls it, no declared read',
  'lever-reader': 'a lever\'s number is read by a formula the lever does not name',
  sign: 'the trace\'s predicted direction disagrees with the measured one',
  'undeclared-move': 'a measured movement no lever declared',
  dead: 'a played lever that moved nothing',
  'dead-outcome': 'a declared outcome that did not move',
});

const sha = (s) => createHash('sha1').update(s).digest('hex');
export const findingId = (kind, key) => 'GF-' + sha(kind + '|' + key).slice(0, 8);

const SIGN = { '+': 1, '-': -1, '~': 0, '!': null };
/** '+q>w1,w2', '@+q' or ['+q', why] -> { q, sign, offline, career, to, why }. Null when it cannot be read. */
export function parseRead(x) {
  const [text, why] = Array.isArray(x) ? x : [x, null];
  const m = /^(@?)([+\-~!])([\w.]+)(?:>([\w.,]+))?$/.exec(String(text));
  if (!m) return null;
  return { q: m[3], sign: m[2] === '!' ? 0 : SIGN[m[2]], offline: m[2] === '!', career: m[1] === '@', to: m[4] ? m[4].split(',') : null, why: why || null };
}
export function parseWrite(x) {
  const [text, why] = Array.isArray(x) ? x : [x, null];
  return /^[\w.]+$/.test(String(text)) ? { q: text, why: why || null } : null;
}
const parseHome = (h) => { const [file, names] = String(h).split('#'); return { file, names: names ? names.split(',') : [] }; };

/* which outcomes a band reads, from the words of its `on` (standards.mjs BANDS). A band that names no hunt outcome maps to nothing. */
const BAND_WORDS = [
  [/xContract/, ['xContract']],
  [/after deaths/, ['netLevelXpPerH', 'deathsPer1000h']],
  [/hoursToLevel|hours for a Level|hours to Level/, ['hoursPerLevel', 'levelXpPerH']],
  [/\bxp\b|Level XP an hour/, ['levelXpPerH']],
  [/lowHpTypical/, ['lowHpTypical']],
  [/deathsPer1000h|deaths a 1,000/, ['deathsPer1000h']],
  [/damageTaken|less damage/, ['takenPerH']],
  [/hunts that finish/, ['huntedShare']],
  [/storeBill/, ['storePerH', 'netPerH']],
  [/netGold|net gold/, ['netPerH']],
  [/hunting performance/, ['levelXpPerH', 'dps', 'ttkS']],
];
export const outcomesOfBand = (on) => [...new Set(BAND_WORDS.filter(([re]) => re.test(String(on))).flatMap(([, o]) => o))];

/**
 * ctx: { arch: { formulas, edges }, levers, knobs, targets, bands, quantities, io, readers, readerSource, interactions, noInteraction,
 *        leverMoves, knobMoves, read(file) -> text | null, measured }
 */
export function buildGraph(ctx) {
  const problems = [], findings = [];
  const bad = (kind, what) => problems.push({ kind, what });
  const found = (kind, key, what, extra = {}) => findings.push({ id: findingId(kind, key), kind, key, what, ...extra });
  const Q = new Map(ctx.quantities.map((x) => [x.id, x]));
  const tokens = tokenIndex(ctx.quantities);
  const outcomeIds = ctx.quantities.filter((x) => x.kind === 'outcome').map((x) => x.id);

  // ── the formulas and their typed rows ──
  const alias = new Map();
  for (const F of ctx.arch.formulas) { alias.set(F.id, F.id); for (const a of F.also || []) if (a) alias.set(a, F.id); }
  const io = ctx.io;
  for (const id of Object.keys(io)) if (!ctx.arch.formulas.some((F) => F.id === id)) bad('io', 'io.mjs has a row for ' + id + ' and the formula register has no such formula');
  const mech = new Map(); // id -> { id, kind, reads, writes, homes, as, skip, note }
  const typed = (id, kind, row) => {
    const reads = [], writes = [];
    for (const r of row.reads) { const p = parseRead(r); if (!p) { bad('io', id + ': cannot read the read ' + JSON.stringify(r)); continue; } if (!Q.has(p.q)) { bad('quantity', id + ' reads ' + p.q + ', which is not on the quantity list'); continue; } reads.push(p); }
    for (const w of row.writes) { const p = parseWrite(w); if (!p) { bad('io', id + ': cannot read the write ' + JSON.stringify(w)); continue; } if (!Q.has(p.q)) { bad('quantity', id + ' writes ' + p.q + ', which is not on the quantity list'); continue; } writes.push(p); }
    for (const r of reads) for (const t of r.to || []) if (!writes.some((w) => w.q === t)) bad('io', id + ': the read of ' + r.q + ' is limited to ' + t + ', which ' + id + ' does not write');
    for (const [tok, v] of Object.entries(row.as || {})) for (const x of [].concat(v)) if (!Q.has(x)) bad('quantity', id + ': `as` maps ' + tok + ' to ' + x + ', which is not on the quantity list');
    const m = { id, kind, reads, writes, homes: (row.home || []).map(parseHome), as: row.as || {}, skip: row.skip || {}, note: row.note || row.why || null };
    mech.set(id, m);
    return m;
  };
  for (const F of ctx.arch.formulas) {
    if (!io[F.id]) { bad('io', F.id + ' is in the formula register and has no typed reads and writes in graph/io.mjs'); continue; }
    const m = typed(F.id, 'formula', io[F.id]);
    if (!m.homes.length && !m.note) bad('io', F.id + ' has no home and no note saying why');
    if (!m.reads.length && !m.writes.length && !m.note) bad('io', F.id + ' reads and writes nothing and no note says why');
  }
  for (const [id, row] of Object.entries(ctx.readers)) typed(id, 'reader', row);

  // ── the derivation: what each home touches, read from the code ──
  const fileCache = new Map();
  const fileOf = (file) => {
    if (!fileCache.has(file)) {
      const text = ctx.read(file);
      fileCache.set(file, text == null ? null : { text, tops: topLevel(file, text), imports: importsOf(file, text), occ: null });
    }
    return fileCache.get(file);
  };
  const occOf = (file) => { const f = fileOf(file); if (!f.occ) { f.occ = new Map(); for (const o of occurrences(file, f.text)) { if (!f.occ.has(o.binding)) f.occ.set(o.binding, []); f.occ.get(o.binding).push(o); } } return f.occ; };
  /* the occurrences of a home: a whole binding, or one first-level key of a table ('TABLE.key') */
  const homeOcc = (file, name) => { const [b, key] = name.split('.'); const list = occOf(file).get(b) || []; return key ? list.filter((o) => o.top === key) : list; };
  const owners = new Map(); // 'file#binding' or 'file#TABLE.key' -> [formula id]
  for (const m of mech.values()) {
    for (const h of m.homes) {
      const f = fileOf(h.file);
      if (!f) { bad('home', m.id + ': the home file ' + h.file + ' is not in the tree'); h.lost = true; continue; }
      for (const n of h.names) {
        if (!f.tops.some((b) => b.name === n.split('.')[0])) { bad('home', m.id + ': ' + h.file + ' has no top-level binding ' + n.split('.')[0]); continue; }
        if (n.includes('.') && !homeOcc(h.file, n).length) { bad('home', m.id + ': ' + h.file + ' ' + n.split('.')[0] + ' is no table with a key ' + n.split('.')[1]); continue; }
        const k = h.file + '#' + n;
        if (!owners.has(k)) owners.set(k, []);
        if (!owners.get(k).includes(m.id)) owners.get(k).push(m.id);
      }
    }
  }
  const candsFor = (ids, token) => {
    /* what a token may mean in a binding: the `as` of the formulas homed there, else every quantity that lists the token */
    const as = ids.flatMap((id) => (mech.get(id).as[token] !== undefined ? [].concat(mech.get(id).as[token]) : []));
    return as.length ? [...new Set(as)] : tokens.get(token) || [];
  };
  const seenUndeclared = new Set();
  for (const [k, ids] of owners) {
    const [file, name] = k.split('#');
    const touched = new Set(ids.flatMap((id) => [...mech.get(id).reads.map((r) => r.q), ...mech.get(id).writes.map((w) => w.q)]));
    for (const o of homeOcc(file, name)) {
      if (!tokens.has(o.token)) continue;
      if (ids.some((id) => mech.get(id).skip[o.token] !== undefined)) continue;
      const cands = candsFor(ids, o.token);
      if (cands.some((c) => touched.has(c))) continue;
      const key = k + '|' + o.token;
      if (seenUndeclared.has(key)) continue;
      seenUndeclared.add(key);
      bad('undeclared', k + ' ' + (o.mode === 'w' ? 'writes' : 'reads') + ' `' + o.token + '` (' + file + ':' + o.line + '), which is ' + cands.join(' or ') + '. No formula homed there (' + ids.join(', ') + ') declares it and none skips it with a reason');
    }
  }
  /* evidence for each declaration: the lines of the home where a token of the quantity stands */
  for (const m of mech.values()) {
    if (m.kind !== 'formula') continue;
    const cite = (qid, needWrite) => {
      const at = [];
      for (const h of m.homes) {
        if (h.lost) continue;
        for (const n of h.names) for (const o of homeOcc(h.file, n)) {
          if (!tokens.has(o.token) && m.as[o.token] === undefined) continue;
          if (m.skip[o.token] !== undefined && m.as[o.token] === undefined) continue;
          const cands = m.as[o.token] !== undefined ? [].concat(m.as[o.token]) : tokens.get(o.token) || [];
          if (!cands.includes(qid)) continue;
          if (needWrite && o.mode !== 'w') continue;
          at.push(h.file + ':' + o.line);
        }
      }
      return [...new Set(at)];
    };
    for (const r of m.reads) {
      r.at = cite(r.q, false);
      r.how = r.at.length ? 'derived' : 'declared';
      if (!r.at.length && !r.why) bad('phantom', m.id + ' declares a read of ' + r.q + ' and no token of it stands in its home (' + (m.homes.map((h) => h.file + '#' + h.names.join(',')).join(' ') || 'no home') + '). Give the reason, or remove the read');
    }
    for (const w of m.writes) {
      w.at = cite(w.q, true);
      w.how = w.at.length ? 'derived' : 'declared';
      if (!w.at.length && !w.why) bad('phantom', m.id + ' declares a write of ' + w.q + ' and its home never writes a token of it (' + (m.homes.map((h) => h.file + '#' + h.names.join(',')).join(' ') || 'no home') + '). Give the reason, or remove the write');
    }
  }
  for (const m of mech.values()) if (m.kind === 'reader') { for (const r of m.reads) { r.at = []; r.how = 'declared'; r.why = m.note; } for (const w of m.writes) { w.at = [ctx.readerSource]; w.how = 'declared'; w.why = m.note; } }

  // ── the levers, joined ──
  const leverSites = new Map(); // 'file#binding' -> [{ lever, text }]
  const levers = ctx.levers.map((L) => {
    const formulas = [...new Set((L.formulas || []).map((x) => alias.get(x)).filter(Boolean))];
    for (const s of L.sites || []) if (s.binding) { const k = s.file + '#' + s.binding; if (!leverSites.has(k)) leverSites.set(k, []); leverSites.get(k).push({ lever: L.id, text: s.text || '' }); }
    const knobs = L.perturb && L.perturb.kind === 'knob' ? [L.perturb.knob, ...(L.perturb.also || [])] : [];
    return { id: L.id, name: L.name, category: L.category, class: L.class, formulas, unknownFormulas: (L.formulas || []).filter((x) => !alias.has(x)), outcomes: L.outcomes || [], knobs, perturb: L.perturb ? L.perturb.kind + (L.perturb.gap ? ':' + L.perturb.gap : '') : null,
      sites: (L.sites || []).map((s) => ({ file: s.file, line: s.line, binding: s.binding || null })), tests: L.tests || null, readers: [] };
  });
  const leverById = new Map(levers.map((L) => [L.id, L]));

  // ── reference edges, read from the code: who calls into whose home, and which formula reads which lever's number ──
  const calls = new Map(); // 'F>G+H' -> { from, to: [formulas homed where the call stands], at, via }
  for (const [k, ids] of owners) {
    const [file, name] = k.split('#');
    const f = fileOf(file);
    for (const o of homeOcc(file, name)) {
      if (o.kind !== 'id') continue;
      const imp = f.imports.get(o.token);
      const base = imp ? imp.file + '#' + imp.name : f.tops.some((x) => x.name === o.token) ? file + '#' + o.token : null;
      if (!base) continue;
      /* a read of one key of a table reaches the formula homed on that key, else the one homed on the whole table */
      const target = o.member && owners.has(base + '.' + o.member) ? base + '.' + o.member : base;
      /* a binding one of these formulas is homed in too is their own code, not a call */
      const theirs = owners.get(target) || [];
      if (theirs.length && !theirs.some((x) => ids.includes(x))) {
        const ck = theirs.join('+') + '>' + ids.join('+');
        if (!calls.has(ck)) calls.set(ck, { from: theirs, to: ids, at: file + ':' + o.line, via: o.token + (o.member ? '.' + o.member : '') });
      }
      for (const site of leverSites.get(base) || []) {
        /* a read of one key of a table is a read of the lever that owns that key's line */
        if (o.member && site.text && !new RegExp('\\b' + o.member + '\\b').test(site.text) && !new RegExp('\\b' + o.token + '\\b').test(site.text)) continue;
        const L = leverById.get(site.lever);
        if (!L.readers.some((r) => r.formulas.join() === ids.join())) L.readers.push({ formulas: ids, at: file + ':' + o.line, via: o.token + (o.member ? '.' + o.member : '') });
      }
    }
  }
  for (const L of levers) {
    for (const r of L.readers) if (!r.formulas.some((x) => L.formulas.includes(x)))
      found('lever-reader', L.id + '|' + r.formulas.join('+'), L.id + ' is read by ' + r.formulas.join(' / ') + ' (' + r.at + ', `' + r.via + '`) and the lever names only ' + (L.formulas.join(', ') || 'no formula'), { a: L.id, b: r.formulas.join('+'), weight: 1 });
  }

  // ── typed edges and the declared ones ──
  const E14 = ctx.arch.formulas.some((F) => F.id === 'E14') ? 'E14' : null;
  const readerIds = [...mech.values()].filter((m) => m.kind === 'reader').map((m) => m.id);
  const reg = (id) => (mech.get(id) && mech.get(id).kind === 'reader' ? E14 : id); // an outcome reader stands where E14 stands
  const declared = new Set();
  for (const e of ctx.arch.edges) declared.add(e.from + '>' + e.to);
  for (const x of ctx.interactions || []) {
    if (!INTERACTION_KINDS.includes(x.kind)) bad('interaction', 'INTERACTIONS ' + (x.id || '?') + ': unknown kind ' + x.kind);
    if (!Array.isArray(x.members) || x.members.length !== 2 || !x.because) { bad('interaction', 'INTERACTIONS ' + (x.id || '?') + ' needs two members and a because'); continue; }
    for (const mb of x.members) if (!mech.has(mb) && !leverById.has(mb) && !/^trait:/.test(mb)) bad('interaction', 'INTERACTIONS ' + x.id + ' names ' + mb + ', which is no node of the graph');
    declared.add(x.members[0] + '>' + x.members[1]);
  }
  const isDeclared = (a, b) => { const x = reg(a), y = reg(b); return x === y || declared.has(x + '>' + y) || declared.has(y + '>' + x) || declared.has(a + '>' + b) || declared.has(b + '>' + a); };
  const cleared = (ctx.noInteraction || []).map((r) => ({ ...r, used: false }));
  const isCleared = (a, b, qs) => {
    let hit = false;
    for (const r of cleared) if (((r.a === a && r.b === b) || (r.a === b && r.b === a)) && (r.q === '*' || qs.includes(r.q))) { r.used = true; hit = true; }
    return hit;
  };
  const edges = []; // typed: { from, to, q, sign, offline }
  const writersOf = new Map();
  for (const m of mech.values()) for (const w of m.writes) { if (!writersOf.has(w.q)) writersOf.set(w.q, []); writersOf.get(w.q).push(m.id); }
  for (const g of mech.values()) for (const r of g.reads) for (const f of writersOf.get(r.q) || []) if (f !== g.id) edges.push({ from: f, to: g.id, q: r.q, sign: r.sign, offline: r.offline });
  const leverCount = new Map();
  for (const L of levers) for (const f of L.formulas) leverCount.set(f, (leverCount.get(f) || 0) + 1);
  const weight = (a, b) => (leverCount.get(a) || 0) + (leverCount.get(b) || 0);
  const catOf = new Map(ctx.arch.formulas.map((F) => [F.id, (F.categories || []).join('+')]));
  const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

  // feeds: a typed edge with no declared one
  const feedPairs = new Map();
  for (const e of edges) { const k = e.from + '>' + e.to; if (!feedPairs.has(k)) feedPairs.set(k, { from: e.from, to: e.to, qs: [] }); if (!feedPairs.get(k).qs.includes(e.q)) feedPairs.get(k).qs.push(e.q); }
  for (const p of feedPairs.values()) {
    if (isDeclared(p.from, p.to) || isCleared(p.from, p.to, p.qs)) continue;
    found('feeds', p.from + '>' + p.to, p.from + ' writes ' + p.qs.join(', ') + ' and ' + p.to + ' reads it. The register holds no edge between them', { a: p.from, b: p.to, q: p.qs, weight: weight(p.from, p.to), cross: catOf.get(p.from) !== catOf.get(p.to) });
  }
  // writers: two mechanics write one quantity
  const writerPairs = new Map();
  for (const [qid, ws] of writersOf) for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) { const k = pairKey(ws[i], ws[j]); if (!writerPairs.has(k)) writerPairs.set(k, { a: ws[i] < ws[j] ? ws[i] : ws[j], b: ws[i] < ws[j] ? ws[j] : ws[i], qs: [] }); writerPairs.get(k).qs.push(qid); }
  for (const p of writerPairs.values()) {
    if (isDeclared(p.a, p.b) || isCleared(p.a, p.b, p.qs)) continue;
    found('writers', p.a + '|' + p.b, p.a + ' and ' + p.b + ' both write ' + p.qs.join(', ') + '. The register holds no edge between them', { a: p.a, b: p.b, q: p.qs, weight: weight(p.a, p.b), cross: catOf.get(p.a) !== catOf.get(p.b) });
  }
  // carrier: a declared edge with no shared quantity
  for (const e of ctx.arch.edges) {
    const fs = e.from === E14 ? readerIds : [e.from], ts = e.to === E14 ? readerIds : [e.to];
    if (!mech.has(e.from) || !mech.has(e.to)) continue;
    const carried = edges.some((x) => fs.includes(x.from) && ts.includes(x.to));
    if (carried || isCleared(e.from, e.to, ['*'])) continue;
    found('carrier', e.from + '>' + e.to, 'The register says ' + e.from + ' feeds ' + e.to + ', and ' + e.from + ' writes nothing ' + e.to + ' reads (' + e.from + ' writes ' + (mech.get(e.from).writes.map((w) => w.q).join(', ') || 'nothing') + ')', { a: e.from, b: e.to, weight: weight(e.from, e.to), cross: catOf.get(e.from) !== catOf.get(e.to) });
  }
  // call: the code reaches into another formula's home, with no declared read of what that formula writes
  const linked = (x, y) => edges.some((e) => (e.from === x && e.to === y) || (e.from === y && e.to === x));
  for (const c of calls.values()) {
    /* the code of c.to reaches into c.from's home: the two interact. A typed edge between them in either direction says how */
    if (c.from.some((x) => c.to.some((t) => linked(x, t) || isCleared(x, t, ['*'])))) continue;
    const from = c.from.join('+'), to = c.to.join('+');
    found('call', from + '>' + to, c.to.join(' / ') + ' reaches `' + c.via + '` in the home of ' + c.from.join(' / ') + ' (' + c.at + '), and no quantity is declared between them (' + c.from.join(' / ') + ' writes ' + ([...new Set(c.from.flatMap((x) => mech.get(x).writes.map((w) => w.q)))].join(', ') || 'nothing') + ')',
      { a: from, b: to, weight: Math.max(...c.from.map((x) => weight(x, c.to[0]))), cross: catOf.get(c.from[0]) !== catOf.get(c.to[0]) });
  }
  for (const r of cleared) if (!r.used) bad('stale', 'NO_INTERACTION ' + r.a + ' / ' + r.b + ' (' + r.q + ') clears no ghost edge: remove it');
  for (const r of cleared) if (!r.because) bad('interaction', 'NO_INTERACTION ' + r.a + ' / ' + r.b + ' has no because');

  // ── what each lever and each knob moves, and what that reaches ──
  const steps = stepsOf([...mech.values()]);
  const movesOf = (list, who, formulas) => {
    const out = [];
    for (const x of list) {
      const p = parseRead(x);
      if (!p || p.offline) { bad('moves', who + ': cannot read the move ' + JSON.stringify(x)); continue; }
      if (!Q.has(p.q)) { bad('quantity', who + ' moves ' + p.q + ', which is not on the quantity list'); continue; }
      if (formulas && !p.why && !formulas.some((f) => mech.get(f) && mech.get(f).writes.some((w) => w.q === p.q)))
        bad('moves', who + ' is declared to move ' + p.q + ', and none of its formulas (' + (formulas.join(', ') || 'none') + ') writes it. Give the reason, or fix the declaration');
      out.push({ q: p.q, sign: p.sign, why: p.why });
    }
    return out;
  };
  const knobIds = (ctx.knobs || []).map((k) => k.id);
  const knobFormula = new Map((ctx.knobs || []).map((k) => [k.id, alias.get(k.formula) || null]));
  const knobs = [];
  for (const id of knobIds) {
    const decl = ctx.knobMoves[id];
    if (!decl) { bad('moves', 'knob ' + id + ' has no declared moves in graph/moves.mjs'); continue; }
    const f = knobFormula.get(id);
    knobs.push({ id, formula: f, moves: movesOf(decl, 'knob ' + id, f ? [f] : null), levers: levers.filter((L) => L.knobs.includes(id)).map((L) => L.id) });
  }
  const knobById = new Map(knobs.map((k) => [k.id, k]));
  for (const id of Object.keys(ctx.knobMoves)) if (!knobIds.includes(id)) bad('stale', 'graph/moves.mjs declares moves for knob ' + id + ', which knobs.json does not hold');
  for (const id of Object.keys(ctx.leverMoves)) if (!leverById.has(id)) bad('stale', 'graph/moves.mjs declares moves for lever ' + id + ', which levers.json does not hold');
  const predict = (moves) => { const t = trace(steps, moves.map((m) => ({ q: m.q, sign: m.sign }))); return t; };
  for (const L of levers) {
    const decl = ctx.leverMoves[L.id];
    if (decl) { L.moves = movesOf(decl, L.id, L.formulas); L.movesFrom = 'declared'; }
    else if (L.knobs.length && knobById.has(L.knobs[0])) { L.moves = knobById.get(L.knobs[0]).moves.map((m) => ({ ...m })); L.movesFrom = 'knob ' + L.knobs[0]; }
    else {
      const ws = [...new Set(L.formulas.flatMap((f) => (mech.get(f) ? mech.get(f).writes.map((w) => w.q) : [])))];
      if (ws.length === 1) { L.moves = [{ q: ws[0], sign: 1, why: null }]; L.movesFrom = 'derived: the one quantity its formula writes'; }
      else { L.moves = []; L.movesFrom = null; bad('moves', L.id + ': its formulas (' + (L.formulas.join(', ') || 'none') + ') write ' + (ws.length ? ws.join(', ') : 'nothing') + ', so what the lever moves cannot be derived. Declare it in graph/moves.mjs'); }
    }
    const t = predict(L.moves);
    L.predicted = Object.fromEntries(outcomeIds.filter((o) => t.has(o)).map((o) => [o, { sign: t.get(o).sign, depth: t.get(o).depth }]));
    L.reach = [...t.entries()].filter(([, v]) => v.depth >= 1 && v.depth <= 3).length;
  }

  // ── the targets, joined to outcomes through their readers ──
  const bandOn = new Map((ctx.bands || []).map((b) => [b.id, b.on]));
  const targets = ((ctx.targets && ctx.targets.targets) || []).map((T) => {
    const outs = [...new Set((T.readers || []).flatMap((r) => outcomesOfBand(bandOn.get(r) || '')))];
    return { id: T.id, area: T.area, metric: T.metric, readers: T.readers || [], readerState: T.readerState, outcomes: outs, conflicts: T.conflicts || [] };
  });

  // ── declared against measured, and predicted against measured ──
  let measuredOut = null;
  if (ctx.measured) {
    const units = Object.keys(ctx.measured.units).map((id) => {
      const k = knobById.get(id);
      const ls = k ? k.levers : [];
      const t = k ? predict(k.moves) : new Map();
      return { id, levers: ls, known: !!k, declared: [...new Set(ls.flatMap((l) => leverById.get(l).outcomes))], predicted: t };
    });
    const c = compare(units.filter((u) => u.known), ctx.measured, outcomeIds);
    for (const fnd of c.findings) found(fnd.kind, fnd.key, fnd.what, { a: fnd.key.split('|')[0], b: fnd.key.split('|')[1] || null });
    measuredOut = { source: ctx.measured.source, rule: ctx.measured.rule, match: c.match, rows: c.rows, notMeasured: c.notMeasured, unknownUnits: units.filter((u) => !u.known).map((u) => u.id),
      waiting: levers.filter((L) => !L.knobs.some((k) => ctx.measured.units[k] && ctx.measured.units[k].cells)).map((L) => L.id) };
  }

  findings.sort((a, b) => (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : (b.weight || 0) - (a.weight || 0) || (a.key < b.key ? -1 : 1)));
  const graph = {
    schema: GRAPH_SCHEMA,
    nodeKinds: NODE_KINDS, interactionKinds: INTERACTION_KINDS,
    quantities: ctx.quantities.map((x) => ({ id: x.id, kind: x.kind, label: x.label, writers: writersOf.get(x.id) || [], readers: [...mech.values()].filter((m) => m.reads.some((r) => r.q === x.id)).map((m) => m.id) })),
    formulas: ctx.arch.formulas.filter((F) => mech.has(F.id)).map((F) => { const m = mech.get(F.id); return { id: F.id, state: F.state, categories: F.categories, what: F.what, homes: m.homes.map((h) => h.file + (h.names.length ? '#' + h.names.join(',') : '')), reads: m.reads, writes: m.writes, note: m.note }; }),
    readers: readerIds.map((id) => { const m = mech.get(id); return { id, reads: m.reads.map((r) => ({ q: r.q, sign: r.sign, offline: r.offline, to: r.to })), writes: m.writes.map((w) => w.q), why: m.note, source: ctx.readerSource }; }),
    edges,
    /* every declared pair in one shape: the register's edges, then io.mjs INTERACTIONS (where Trait pairs will stand) */
    interactions: [...ctx.arch.edges.map((e) => ({ id: e.from + '>' + e.to, kind: 'feeds', members: [e.from, e.to], q: [...new Set(edges.filter((x) => x.from === e.from && x.to === e.to).map((x) => x.q))], source: 'formulas-architecture.json' })),
      ...(ctx.interactions || []).map((x) => ({ ...x, source: 'graph/io.mjs' }))],
    calls: [...calls.values()],
    levers, knobs, targets,
    measured: measuredOut,
    findings,
    counts: { quantities: ctx.quantities.length, formulas: ctx.arch.formulas.length, readers: readerIds.length, levers: levers.length, knobs: knobs.length, targets: targets.length,
      reads: [...mech.values()].reduce((n, m) => n + m.reads.length, 0), writes: [...mech.values()].reduce((n, m) => n + m.writes.length, 0),
      readsDerived: [...mech.values()].reduce((n, m) => n + m.reads.filter((r) => r.how === 'derived').length, 0), writesDerived: [...mech.values()].reduce((n, m) => n + m.writes.filter((w) => w.how === 'derived').length, 0),
      typedEdges: edges.length, declaredEdges: ctx.arch.edges.length, calls: calls.size, targetsWithOutcome: targets.filter((t) => t.outcomes.length).length,
      findings: Object.fromEntries(Object.keys(FINDING_KINDS).map((k) => [k, findings.filter((x) => x.kind === k).length])) },
  };
  return { problems, findings, graph, steps, mech };
}
