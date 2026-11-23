#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-event-names.mjs — EVERY HUNT EVENT REACHES THE SCREEN NAMED (lane/client-talent-floaters, 2026-11-23).
//
//   node tests/hunt-event-names.mjs            the guard (pure Node: the real engine plays a hunt, the real view modules read it)
//   node tests/hunt-event-names.mjs --mutate   every planted defect must turn its arm red
//
// mutant-anchors: src/hunt-view/combat-log.js src/hunt-view/scene.js src/hunt-view/death-explain.js src/render/source-names.js src/shell/widgets/bits.js src/shell/hunt-report.js
// ci-step: client-guards | Every hunt event reaches the screen named (a talents-on hunt's log lines, floats and report names, every status and piece)
// ci-run: node tests/hunt-event-names.mjs
// ci-run: node tools/mutant-gate.mjs node tests/hunt-event-names.mjs --mutate
//
// WHY. The engine pieces the Roads, Signatures and Traits share (lane/talent-effects) put new ids on old events: a Mending tick names its
// status, a Shield Priest heal its reaction, a Bodyguard's share and an overkill their engine piece, Frozen Ground lays Chill every
// second. With the talents switch on the log read "is affected by frozen_ground", a heal over time floated a damage number on the hero
// it healed, and Cold Iron's Chill wrote a line on every melee blow. THE PLAY: Muster Barrows at Level 60, a Steady four whose tank and
// healer carry the Roads (the switch forced on in-test: the build hunt-settle.js memberInput hands heroSetup when `talents.live`), played
// on the real settle (tests/hunt-core/fixtures/play-ground.mjs). THE UNIVERSE: every id the engine can put on an event (every status row,
// every reaction a Roads node grants, every engine piece a blow names itself in src/core/hunt), each also sent through the view.
//   EN-PLAY    the play reached the pieces it is here for (Mending laid and ticking, Frozen Ground, Chill, Sapped)
//   EN-NAME    every id is named by a row, a text row or the Roads node that grants it (src/render/source-names.js nameOf), and the
//              analyzer's attacks read the same name (src/shell/widgets/bits.js abilityName)
//   EN-LOG     every event's combat log line names its source in words (never its id), a status by what it does (a harmful one
//              affects, a helpful one is gained, a ground patch is left), a Bodyguard's share as the guard's own line; plain text
//   EN-ONCE    the log says a status once until it ends (no refresh is news), and says nothing of a dead unit's statuses
//   EN-FLOAT   the screen's floats (src/hunt-view/scene.js): a status tick floats nothing of its own (its dmg or heal does), a heal of
//              nothing floats nothing, a heal is never a damage number, a `dot` flies no bolt, every float is words or a number in a
//              colour tokens.css holds (--world-float-<kind>)
//   EN-REPORT  the hunt report's healing names each heal's source (src/shell/hunt-report.js ledgerLines)
// Exit: 0 green · 1 red · 2 harness.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, mkdtempSync, rmSync, writeFileSync, cpSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';
import { harnessFail, verdict } from './_mutant-verdict.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

async function load(root) {
  const u = (p) => import(pathToFileURL(join(root, p)).href);
  return { L: await u('src/hunt-view/combat-log.js'), S: await u('src/hunt-view/scene.js'), B: await u('src/shell/widgets/bits.js'),
    W: await u('src/shell/hunt-report.js'), ST: await u('src/data/statuses.js'), TD: await u('src/data/talents.js'),
    MR: await u('src/data/monster-roles.js'), DE: await u('src/hunt-view/death-explain.js'),
    LOG: (await u('src/data/text/log.js')).LOG_TEXT,
    /* the resolver this lane added: absent on an older tree, which reads red (EN-NAME), not a harness */
    SN: await u('src/render/source-names.js').catch(() => null),
    tokens: readFileSync(join(root, 'src/styles/tokens.css'), 'utf8'),
    core: readdirSync(join(root, 'src/core/hunt')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(root, 'src/core/hunt', f), 'utf8')) };
}

/* ── THE PLAY (once, on this tree's engine: the mutants plant only the view) ── */
const ORDER = ['r1', 'r2', 'r3', 'x1', 'w1', 'r4', 'r5', 'x2', 'w2'];
/* a road walked to its picks: stones, crossroads I and II, the waystones */
function road(move, x1, x2) {
  const b = {};
  for (const s of ORDER) b[move + '.' + s] = s === 'x1' ? x1 : s === 'x2' ? x2 : true;
  return b;
}
const TANK = { ...road('challenge', 'long_hold', 'mended'), ...road('frost_slam', 'long_frost', 'cold_ground'), ...road('shelter', 'steady_shelter', 'ready_shelter'),
  ...road('greater_mend', 'split_mending', 'thrifty_mending'), 'border.shield_restoration.town': 'use_greater_mend', 'border.shield_restoration.x': 'taunting_guard',
  'border.shield_restoration.vow': true, 'vow.cold_iron': true, 'vow.bodyguard': true };
const HEAL = { ...road('mend', 'steady_mend', 'light_mend'), ...road('greater_mend', 'split_mending', 'lingering_mending'), ...road('circle_of_renewal', 'lasting_circle', 'mana_circle'),
  ...road('spring_tide', 'high_tide', 'clearing_tide'), ...road('green_sickness', 'draining_sickness', 'weakening_sickness'), 'vow.lifeline': true };
const slot = (id) => ({ action: { type: 'ability', id }, conditions: [], join: 'and' });
/* the tank's bar holds no Challenge, so the pack's blows reach the back row and the Bodyguard's share lands */
const BARS = { tank: ['frost_slam', 'shelter'], healer: ['greater_mend', 'circle_of_renewal', 'spring_tide', 'green_sickness', 'mend'] };

async function play() {
  const { loadPlay } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
  const P = await loadPlay(ROOT);
  const events = [], heroes = new Map();
  const ground = 'muster_barrows';
  P.run(ground, 60, ['tank', 'ranger', 'mage', 'healer'], { spanMs: 900000, windowMs: 600000, secret: '-4611686018427387904',
    options: () => ({ risk: 'steady', danger: 570 }), roads: (role, i) => (i === 0 ? TANK : i === 3 ? HEAL : null),
    bar: (role) => [...(BARS[role] || []).map(slot), ...P.refBar(ground)],
    onWindow: (out) => {
      for (const p of out.members || []) if (p.hunt && Number.isInteger(p.hunt.unit_id)) heroes.set(p.hunt.unit_id, { role: String(p.key).split(':')[1], name: 'Hero ' + p.hunt.unit_id });
      for (const e of out.events || []) if (e && typeof e === 'object') events.push(Object.freeze({ ...e, key: 'p' + events.length }));
    } });
  return { events, heroes };
}

/* ── the words ── */
const plain = (s) => typeof s === 'string' && s.length > 0 && !/[;—–_]|undefined|null|NaN/.test(s);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/* a raw id written as it is ("frozen_ground", "chill" as a word, never "Chill" or "bleeding") */
const rawIn = (text, id) => typeof id === 'string' && /[a-z]/.test(id) && new RegExp('(^|[^A-Za-z])' + esc(id) + '([^A-Za-z]|$)').test(text);
const fill = (row, vars) => row.replace(/\{([a-zA-Z]+)\}/g, (_, k) => String(vars[k]));
/* the ids an event names its source by */
const idsOf = (ev) => [ev.status, ev.ability, ev.spell].filter((x) => typeof x === 'string' && x && x !== 'basic');
const srcOf = (ev) => (ev.type === 'heal' ? ev.ability || ev.spell || null : ev.type === 'dmg' && ev.ability !== 'basic' ? ev.ability : null);

/* every id the engine can put on an event: the status rows, every reaction a Roads node grants, every piece a blow names itself, and
   the spell each monster role casts on a formula ground (monster-roles.js roleSpellId: `mf_brute`) */
function universe(X) {
  const reacts = new Set();
  for (const n of X.TD.TALENT_NODES) for (const e of [...(n.effects || []), ...(n.options || []).flatMap((o) => o.effects || [])]) if (e.kind === 'react') reacts.add(e.id);
  const pieces = new Set();
  for (const src of X.core) for (const m of src.matchAll(/\{\s*id:\s*'([a-z_]+)',\s*dot:\s*true/g)) pieces.add(m[1]);
  const derived = [], sid = typeof X.MR.roleSpellId === 'function' ? X.MR.roleSpellId : null;
  for (const [role, R] of Object.entries(sid ? X.MR.MONSTER_ROLES : {})) {
    if (R.windup) derived.push(sid(role));
    if (R.mend) derived.push(sid(role, true));
  }
  return { statuses: Object.keys(X.ST.STATUSES), reacts: [...reacts], pieces: [...pieces], derived };
}

/* events made for every id of the universe, beside the played ones: a status on and off a hero and a monster, a heal from every
   reaction and status, a blow from every piece (from a monster at a hero, and from the ranger at a monster) */
function madeEvents(U, P) {
  const hero = [...P.heroes.keys()][0], ranger = [...P.heroes].find(([, h]) => h.role === 'ranger'), mon = 999;
  const out = [];
  const add = (e) => out.push(Object.freeze({ atMs: 1000, key: 'm' + out.length, ...e }));
  for (const s of U.statuses) for (const t of [hero, mon]) { add({ type: 'status_on', t, status: s, stacks: 1 }); add({ type: 'status_off', t, status: s }); }
  for (const id of [...U.reacts, ...U.statuses]) add({ type: 'heal', u: hero, t: hero, amount: 12, ability: id });
  for (const id of U.pieces) { add({ type: 'dmg', u: mon, t: hero, amount: 9, ability: id, element: null, dot: true }); add({ type: 'dmg', u: ranger ? ranger[0] : hero, t: mon, amount: 9, ability: id, element: null, dot: true }); }
  for (const id of U.derived) add({ type: 'dmg', u: mon, t: hero, amount: 30, ability: id, element: null });
  add({ type: 'status_tick', t: hero, status: 'mending', amount: 7, heals: true });
  add({ type: 'heal', u: hero, t: hero, amount: 0 });
  return out;
}

function namerOf(P) {
  return { name: (u) => (P.heroes.has(u) ? P.heroes.get(u).name : Number.isInteger(u) ? 'Wight' : 'Someone'), isHero: (u) => P.heroes.has(u),
    shoots: () => false, guarded: () => false, wave: null };
}

const ARMS = {
  'EN-PLAY': (X, P) => {
    const out = [];
    const has = (f, what) => { if (!P.events.some(f)) out.push('the play never reached ' + what + ': the pieces this guard reads are not played'); };
    has((e) => e.type === 'status_on' && e.status === 'mending', 'a heal laid over time (Steady Mend, Lasting Circle)');
    has((e) => e.type === 'status_tick' && e.status === 'mending' && e.heals === true, 'a Mending tick');
    has((e) => e.type === 'heal' && e.ability === 'mending', 'a heal naming its status');
    has((e) => e.type === 'status_on' && e.status === 'frozen_ground', 'Cold Ground\'s patch');
    has((e) => e.type === 'status_on' && e.status === 'chill', 'Chill');
    has((e) => e.type === 'status_on' && e.status === 'sapped', 'Weakening Sickness\'s Sapped');
    return out;
  },
  'EN-NAME': (X, P) => {
    if (!X.SN) return ['no resolver names a hunt event\'s source (src/render/source-names.js)'];
    const out = [];
    const U = universe(X);
    if (!U.pieces.includes('bodyguard') || !U.pieces.includes('carry')) out.push('the piece scan found ' + JSON.stringify(U.pieces) + ': it reads the wrong tree');
    if (!U.derived.length) out.push('no monster role casts a derived spell: the role scan reads the wrong tree');
    const ids = new Set([...U.statuses, ...U.reacts, ...U.pieces, ...U.derived, ...P.events.flatMap(idsOf)]);
    for (const id of ids) {
      const n = X.SN.nameOf(id);
      if (!plain(n) || rawIn(n, id)) out.push(id + ' is named ' + JSON.stringify(n));
      else if (X.B.abilityName(id) !== n) out.push('the analyzer calls ' + id + ' ' + JSON.stringify(X.B.abilityName(id)) + ', not ' + n);
    }
    /* a reaction named like a move or a status would be called that instead */
    for (const id of U.reacts) if (U.statuses.includes(id) || U.pieces.includes(id) || X.SN.nameOf(id) !== reactNode(X, id)) out.push('reaction ' + id + ' is not named by the node that grants it');
    /* one reaction id, one name: two nodes granting one id under two names would both read as the first */
    const names = new Map();
    for (const n of X.TD.TALENT_NODES) for (const [list, name] of [[n.effects, n.n], ...(n.options || []).map((o) => [o.effects, o.n])]) {
      for (const e of list || []) if (e.kind === 'react') names.set(e.id, (names.get(e.id) || new Set()).add(name));
    }
    for (const [id, s] of names) if (s.size > 1) out.push('reaction ' + id + ' is granted under ' + s.size + ' names (' + [...s].join(', ') + '): give each its own id');
    return out;
  },
  'EN-LOG': (X, P) => {
    const out = [];
    const n = namerOf(P), U = universe(X);
    for (const ev of [...P.events, ...madeEvents(U, P)]) {
      const l = X.L.lineOf(ev, n);
      if ((ev.type === 'status_on' || ev.type === 'status_off') && !l) { out.push(ev.type + ' ' + ev.status + ' writes no line'); continue; }
      if (!l) continue;
      const tag = ev.type + ' ' + idsOf(ev).join('/') + ': ' + JSON.stringify(l.text);
      if (!plain(l.text)) { out.push('not plain words: ' + tag); continue; }
      const raw = idsOf(ev).find((id) => rawIn(l.text, id));
      if (raw) { out.push('the line writes the id ' + raw + ': ' + tag); continue; }
      if (ev.type === 'status_on' || ev.type === 'status_off') {
        const want = statusLine(X, ev, n.name(ev.t));
        if (l.text !== want) out.push('a status reads ' + JSON.stringify(l.text) + ', not ' + JSON.stringify(want));
        continue;
      }
      if (ev.type === 'dmg' && ev.ability === 'bodyguard') {
        if (!l.text.startsWith(n.name(ev.t)) || l.type !== 'taken') out.push('a Bodyguard\'s share reads as the monster\'s blow: ' + tag);
        continue;
      }
      const src = srcOf(ev);
      const name = src && X.SN ? X.SN.nameOf(src) : null;
      if (src && !(name && l.text.includes(name))) out.push('the line does not name its source ' + src + ' (' + name + '): ' + tag);
    }
    /* the death card's killing blow (death-explain.js) names a formula monster's spell as it names a catalogue one */
    for (const id of U.derived) {
      const evs = [{ id: 'b', type: 'dmg', u: 999, t: 1, amount: 40, ability: id, an: 'Wight', atMs: 900 }, { id: 'd', type: 'death', u: 1, monster: 'wight', atMs: 1000 }];
      const said = X.DE.explainDeaths(evs, { whoOf: () => ({ name: 'Bran', others: [] }) }).deaths[0];
      const name = X.SN ? X.SN.nameOf(id) : null;
      if (!said || !name || !said.lines.some((x) => x.includes('’s ' + name))) out.push('the death card does not name ' + id + ' (' + name + '): ' + JSON.stringify(said && said.lines));
    }
    return dedupe(out);
  },
  'EN-ONCE': (X, P) => {
    const out = [];
    const subs = [];
    const cs = { read: () => null, live: null, timeline: { subscribe: (fn) => { subs.push(fn); return () => {}; }, kindOf: () => null } };
    const log = X.L.logFor(cs);
    const said = new Map(), dead = new Set(), carried = new Set();
    let v = log.version(), statusLines = 0, refreshes = 0;
    for (const ev of P.events) {
      /* the stream's own refreshes (a status landing on a unit that carries it): what the log must not say again */
      if (ev.type === 'status_on') { if (carried.has(ev.t + ':' + ev.status)) refreshes++; carried.add(ev.t + ':' + ev.status); }
      if (ev.type === 'status_off') carried.delete(ev.t + ':' + ev.status);
      for (const fn of subs) fn(ev);
      if (ev.type === 'kill') dead.add(ev.t);
      if (log.version() === v) continue;
      v = log.version();
      if (ev.type !== 'status_on' && ev.type !== 'status_off') continue;
      statusLines++;
      const k = ev.t + ':' + ev.status;
      if (ev.type === 'status_off' && dead.has(ev.t)) out.push('the log says ' + k + ' ended on a unit it saw die');
      else if (ev.type === 'status_on' && said.get(k)) out.push('the log says ' + k + ' again before it ended (a refresh is no news)');
      else if (ev.type === 'status_off' && !said.get(k)) out.push('the log says ' + k + ' ended, never having said it');
      said.set(k, ev.type === 'status_on');
    }
    if (!statusLines || !refreshes) out.push(statusLines + ' status lines and ' + refreshes + ' refreshes played: the arm read nothing');
    return dedupe(out);
  },
  'EN-FLOAT': (X, P) => {
    const out = [];
    const kinds = new Set([...X.tokens.matchAll(/--world-float-([a-z]+)\s*:/g)].map((m) => m[1]));
    const seen = new Set();
    const shape = (e) => [e.type, e.status, e.ability, e.dot, e.heals, e.amount === 0, P.heroes.has(e.u), P.heroes.has(e.t), e.crit].join('|');
    const tl = { clientAt: (ms) => ms, positionAt: (u) => ({ x: (u | 0) % 40, y: ((u | 0) >> 3) % 9, moving: false, d: 0, hx: 0, hy: 1 }), units: () => [],
      hpAt: () => null, forget: () => false, kindOf: () => null };
    const book = { sprite: () => ({ anims: {} }), frames: () => 1, facing: (i, a, d) => d };
    const monsters = new Map(P.events.filter((e) => Number.isInteger(e.t) && !P.heroes.has(e.t)).map((e) => [e.t, { kind: 'wight', side: 'monster', boss: false }]));
    const read = () => ({ units: monsters, heroes: P.heroes, people: new Map(), viewed: [...P.heroes.keys()][0], viewedShield: 0, poseAtMs: null, entrance: null,
      huntName: null, huntId: null, fx: null, huntFromMs: null, self: null, look: null, dye: null, level: null, title: null, shown: () => true, names: false, tower: null });
    for (const ev of [...P.events, ...madeEvents(universe(X), P)]) {
      const k = shape(ev);
      if (seen.has(k)) continue;
      seen.add(k);
      const scene = X.S.createHuntScene({ timeline: tl, book, read });
      scene.onEvent(ev, ev.atMs);
      const flying = scene.frame(ev.atMs + 50).fx.filter((f) => f.angle !== undefined);
      const floats = scene.frame(ev.atMs + 300).floats;
      const tag = ev.type + ' ' + idsOf(ev).join('/') + (ev.dot ? ' dot' : '') + (ev.heals ? ' heals' : '');
      if (ev.dot && flying.length) out.push('a ' + tag + ' flies a bolt from its dealer (' + flying.map((f) => f.id).join() + ')');
      if (ev.type === 'status_tick' && floats.length) out.push('a ' + tag + ' floats its own ' + JSON.stringify(floats.map((f) => [f.text, f.kind])) + ' beside its dmg or heal');
      if (ev.type === 'heal' && ev.amount === 0 && floats.length) out.push('a heal of nothing floats ' + JSON.stringify(floats.map((f) => f.text)));
      for (const f of floats) {
        if (!kinds.has(f.kind)) out.push('a ' + tag + ' floats in ' + f.kind + ', a colour tokens.css does not hold');
        if (!plain(f.text) || idsOf(ev).some((id) => rawIn(f.text, id))) out.push('a ' + tag + ' floats ' + JSON.stringify(f.text));
        if ((ev.type === 'heal' || ev.heals) && f.kind !== 'heal') out.push('a ' + tag + ' floats a ' + f.kind + ' number ' + JSON.stringify(f.text));
      }
    }
    return dedupe(out);
  },
  'EN-REPORT': (X, P) => {
    const out = [];
    const sources = new Set(P.events.filter((e) => e.type === 'heal' && P.heroes.has(e.u)).map((e) => e.ability || e.spell).filter(Boolean));
    for (const id of [...sources, ...universe(X).reacts]) {
      const line = (X.W.ledgerLines({ heal: [[id, 500]] }) || [])[0] || '';
      const name = X.SN ? X.SN.nameOf(id) : null;
      if (!name || !line.includes(name) || rawIn(line, id)) out.push('the report\'s healing reads ' + JSON.stringify(line) + ' for ' + id);
    }
    return out;
  },
};

/* the name of the Roads node or option that grants reaction `id` (the first one) */
function reactNode(X, id) {
  for (const n of X.TD.TALENT_NODES) {
    if ((n.effects || []).some((e) => e.kind === 'react' && e.id === id)) return n.n;
    for (const o of n.options || []) if ((o.effects || []).some((e) => e.kind === 'react' && e.id === id)) return o.n;
  }
  return null;
}

/* THE STATUS LINE AS THE TEXT TABLE WRITES IT (src/data/text/log.js): its own pair, else a ground patch left, a helpful one gained, a
   harmful one affecting; the status by its row's name */
function statusLine(X, ev, who) {
  const on = ev.type === 'status_on' ? 'on' : 'off';
  const row = X.ST.STATUSES[ev.status];
  const own = X.LOG['status_' + on + '_' + ev.status];
  const kind = row.ground ? '_ground' : X.ST.harmful(row) ? '' : '_good';
  const words = own || X.LOG['status_' + on + kind];
  return typeof words === 'string' ? fill(words, { who, status: row.name }) : '(no row log.status_' + on + kind + ')';
}

const dedupe = (l) => [...new Set(l)].slice(0, 12);

async function runAll(X, P, only) {
  const fails = [];
  for (const [id, arm] of Object.entries(ARMS)) {
    if (only && id !== only) continue;
    let got;
    /* a throw is HARNESS, never its arm's red (tests/_mutant-verdict.mjs): a crash cannot score a mutant */
    try { got = await arm(X, P); } catch (e) { fails.push(harnessFail(id, e)); continue; }
    for (const g of got) fails.push(id + ' ' + g);
  }
  return fails;
}

const MUTANTS = [
  ['the log writes a status by its id', 'EN-LOG', 'src/hunt-view/combat-log.js', '{ who, status: sourceName(ev.status) }', '{ who, status: ev.status }'],
  ['a helpful status reads as an affliction', 'EN-LOG', 'src/hunt-view/combat-log.js', ": harmful(row) ? '' : '_good';", ": '';"],
  ['a heal names no source', 'EN-LOG', 'src/hunt-view/combat-log.js', '      const src = id ? sourceName(id) : null;\n', '      const src = null;\n'],
  ['a Bodyguard\'s share reads as the monster\'s blow', 'EN-LOG', 'src/hunt-view/combat-log.js',
    "      if (ev.ability === 'bodyguard') return line('taken', t('log.guard', { target: b, n: ev.amount }));\n", ''],
  ['a status is said at every refresh', 'EN-ONCE', 'src/hunt-view/combat-log.js', '    if (said && said.has(ev.status)) return false;\n', ''],
  ['a dead unit\'s statuses end in the log', 'EN-ONCE', 'src/hunt-view/combat-log.js', "    if (ev.type === 'kill') { held.delete(ev.t); return true; }", "    if (ev.type === 'kill') return true;"],
  ['a status tick floats its own number', 'EN-FLOAT', 'src/hunt-view/scene.js', "      case 'miss': glance(ev, start); break;\n",
    "      case 'status_tick': if (Number.isFinite(ev.amount)) num(ev.t, ev.amount, start); break;\n      case 'miss': glance(ev, start); break;\n"],
  ['a dot flies its dealer\'s bolt', 'EN-FLOAT', 'src/hunt-view/scene.js', 'const flies = !!bolt && !ev.dot;', 'const flies = !!bolt;'],
  ['a heal of nothing floats +0', 'EN-FLOAT', 'src/hunt-view/scene.js', "if (ev.amount > 0) addFloat(ev.t, 'heal',", "if (true) addFloat(ev.t, 'heal',"],
  ['a status is not named by its row', 'EN-NAME', 'src/render/source-names.js', '  if (Object.hasOwn(STATUSES, id)) return STATUSES[id].name;\n', ''],
  ['an engine piece is not named', 'EN-NAME', 'src/render/source-names.js', "  if (hasText('fight.piece_' + id)) return t('fight.piece_' + id);\n", ''],
  ['a reaction is not named by its node', 'EN-NAME', 'src/render/source-names.js', '  return reactName(id);\n', '  return null;\n'],
  ['a formula monster\'s spell is not named', 'EN-NAME', 'src/render/source-names.js', '  if (derived) return derived.n;\n', ''],
  ['the death card drops a formula monster\'s spell', 'EN-LOG', 'src/hunt-view/death-explain.js', '  const said = cast || (killingBlow && roleSpellRow(killingBlow.ability));', '  const said = cast;'],
  ['the analyzer spells an id', 'EN-NAME', 'src/shell/widgets/bits.js', ": sourceName(id); }", ': String(id); }'],
  ['the report\'s healing reads a source as an item', 'EN-REPORT', 'src/shell/hunt-report.js', '(nameOf(uses) ? sourceName(uses) : itemName(uses))', 'itemName(uses)'],
];

async function main() {
  const P = await play();
  if (!process.argv.includes('--mutate')) {
    const fails = await runAll(await load(ROOT), P);
    for (const f of fails) console.log('✗ ' + f);
    console.log(fails.length ? `hunt-event-names: ${fails.length} RED` : `hunt-event-names: green (${Object.keys(ARMS).join(', ')}; ${P.events.length} played events)`);
    process.exit(fails.length ? (fails.some((f) => f.startsWith('HARNESS')) ? 2 : 1) : 0);
  }
  const clean = await runAll(await load(ROOT), P);
  if (clean.length) { console.error('hunt-event-names --mutate: the clean tree is red: ' + clean.join(' | ')); process.exit(2); }
  let escaped = 0, harness = 0;
  for (const [name, arm, file, find, repl] of MUTANTS) {
    const dir = mkdtempSync(join(tmpdir(), 'hr-names-'));
    try {
      cpSync(join(ROOT, 'src'), join(dir, 'src'), { recursive: true, filter: (s) => !/\.(png|webp|jpg|ogg|mp3)$/.test(s) });
      const f = join(dir, file);
      const src = readFileSync(f, 'utf8').split(String.fromCharCode(13)).join('');
      if (src.split(find).length !== 2) { console.error(`HARNESS: ${file} has no single ${JSON.stringify(find.slice(0, 60))}`); process.exit(2); }
      writeFileSync(f, src.replace(find, () => repl));
      /* caught only by a line its arm named; a throw is HARNESS (exit 2), nothing at all an escape */
      const v = verdict(await runAll(await load(dir), P, arm));
      if (v.kind === 'caught') console.log(`  caught  ${name} (${v.rule}): ${v.line.slice(0, 140)}`);
      else if (v.kind === 'harness') { console.log(`  HARNESS ${name} (${arm}): ${v.why.slice(0, 140)}`); harness++; }
      else { console.log(`  ESCAPED ${name} (${arm})`); escaped++; }
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }
  console.log(escaped || harness ? `hunt-event-names --mutate: ${escaped} ESCAPED, ${harness} HARNESS`
    : `hunt-event-names --mutate: ${MUTANTS.length}/${MUTANTS.length} caught, each by its named arm`);
  process.exit(escaped ? 1 : harness ? 2 : 0);
}

if (isMain(import.meta.url)) main().catch((e) => { console.error(e && e.stack ? e.stack : e); process.exit(2); });
