#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-view-core.mjs — THE HUNT SCREEN'S PURE RULES, IN NODE.
//
//   node tests/hunt-view-core.mjs           the rules
//   node tests/hunt-view-core.mjs --mutate  every planted defect must turn a rule RED
//
// mutant-anchors: src/hunt-view/ src/session/hunt-sections.js src/session/character-session.js src/session/envelope.js src/session/residue.js src/data/combat-text.js
// mutant-writes-tree: no — mutants are planted into a temp copy of src/
//
// Snapshot vs timeline (Tyler, 2026-10-17): the envelope's sections are the
// numbers and are REPLACED; the settle response's track and events are a
// timeline played smoothly, never restarted by a new envelope.
//   TL-1  an event id is delivered once, however many batches restate it
//   TL-2  A NEW ENVELOPE DOES NOT RESTART A RUNNING ANIMATION: a unit mid-step
//         stands where it stood a moment ago after a new envelope (same track
//         restated, a later server clock, a pose that agrees)
//   TL-3  a window gap holds the last pose: no newer step, no movement
//   TL-4  a pose that disagrees walks the unit there after its last step (no teleport)
//   TL-5  the timeline keys never enter the character's record
//   SEC-1 sections read null when absent or malformed; the next envelope without
//         `hunt_analyzer` leaves no analyzer behind (null replaces)
//   SEC-2 a party member's role comes from its weapon, never its outfit
//   FP-1  float defaults: the bleed badge off over regular monsters, on over
//         bosses; a saved toggle wins; a forged residue is bounded
//   INT-1 a settings change is ONE intent (hr_action_set_options with slot,
//         preset, options); ok re-reads the character; a refusal changes nothing
//   LOG-1 the combat log writes each event once, in plain words, by type
// ════════════════════════════════════════════════════════════════════════
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const FIXTURE = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/hunt-envelope.json'), 'utf8'));
const clone = (o) => JSON.parse(JSON.stringify(o));

async function load(base) {
  const u = (p) => import(pathToFileURL(join(base, p)).href + V);
  return {
    T: await u('src/hunt-view/timeline.js'),
    C: await u('src/session/character-session.js'),
    H: await u('src/session/hunt-sections.js'),
    F: await u('src/hunt-view/float-prefs.js'),
    R: await u('src/session/residue.js'),
    L: await u('src/hunt-view/combat-log.js'),
    CFG: await u('src/session/config.js'),
  };
}

/** A CharacterSession over a scripted server (no network, no timers that fire). */
function session(M, answers, clock) {
  const calls = [];
  const server = {
    rpc: async (name, args) => { calls.push({ name, args }); const a = answers[name]; return typeof a === 'function' ? a(args) : a || { ok: true, body: { ok: true } }; },
    accrue: async (body) => { calls.push({ name: 'hr-accrue', args: body }); const a = answers['hr-accrue']; return typeof a === 'function' ? a(body) : a; },
  };
  const cs = new M.C.CharacterSession({ slot: 0, uid: '11111111-2222-3333-4444-555555555555', server, setTimer: () => 0, clearTimer: () => {}, now: () => clock.t });
  return { cs, calls };
}

async function rules(M) {
  const fails = [];
  const ok = (id, cond, msg) => { if (!cond) fails.push(id + ': ' + msg); };

  { // TL-1, TL-3, TL-4 on the bare timeline
    const tl = M.T.createTimeline({ delayMs: 0, tileMs: 300 });
    const got = [];
    tl.subscribe((e) => got.push(e.key));
    const batch = { serverNowMs: 10000, track: [{ u: 1, x: 0, y: 0, atMs: 9000 }, { u: 1, x: 1, y: 0, atMs: 10000 }],
      events: [{ id: 'a', type: 'dmg', atMs: 9500, u: 1, t: 2, amount: 3 }, { id: 'b', type: 'xp', atMs: 9900, u: 1, amount: 1 }] };
    tl.ingest(batch, 50000);
    tl.ingest(clone(batch), 50100);
    tl.advance(50100);
    tl.ingest(clone(batch), 50200);
    tl.advance(50300);
    ok('TL-1', got.join(',') === 'i:a,i:b', 'each event once, got ' + got.join(','));
    const far = tl.positionAt(1, 90000);
    ok('TL-3', far && far.x === 1 && far.y === 0 && far.moving === false, 'a window gap must hold the last tile, got ' + JSON.stringify(far));
    tl.reconcile({ at_ms: 10100, units: [{ u: 1, x: 3, y: 0 }] });
    const at = tl.positionAt(1, 50000 + 400);   // server 10400: the walk toward the pose has begun, not jumped
    const done = tl.positionAt(1, 50000 + 2000);
    ok('TL-4', at && at.x > 1 && at.x < 3 && done && done.x === 3, 'a disagreeing pose must be walked to, got ' + JSON.stringify(at) + ' then ' + JSON.stringify(done));
  }

  { // TL-2, TL-5 through a real CharacterSession: a new envelope mid-animation
    const clock = { t: 100000 };
    const first = clone(FIXTURE);
    first.hunt_server_now_ms = 2000000;
    first.hunt_track = [{ u: 7, x: 4, y: 4, atMs: 1999000 }, { u: 7, x: 5, y: 4, atMs: 2000000 }];
    first.hunt.pose = { at_ms: 2000000, units: [{ u: 7, side: 'hero', x: 5, y: 4 }] };
    first.hunt_events = [{ id: 'e1', type: 'dmg', atMs: 1999900, u: 7, t: 101, amount: 2 }];
    let next = first;
    const { cs } = session(M, { hr_load: () => ({ ok: true, body: clone(next) }) }, clock);
    await cs.load();
    ok('TL-5', cs.read('hunt_track') === undefined && cs.read('hunt_events') === undefined && cs.read('hunt_server_now_ms') === undefined,
      'the timeline keys must stay out of the record');
    const delay = M.CFG.SESSION_CONFIG.huntPlaybackDelayMs;   // the session's playback delay (src/session/config.js)
    clock.t = 100000 + delay + 150;              // mid-step: server 2000150 of a 312 ms roll
    const before = cs.timeline.positionAt(7, clock.t);
    ok('TL-2', before && before.moving && before.x > 4 && before.x < 5, 'the fixture must be mid-step, got ' + JSON.stringify(before));
    const delivered = [];
    cs.timeline.subscribe((e) => delivered.push(e.key));
    cs.timeline.advance(clock.t);
    /* The next envelope a moment later: the same track and events restated, a later server clock that has drifted 40 ms. */
    next = clone(first);
    next.version = first.version + 1;
    next.hunt_server_now_ms = 2000000 + (clock.t - 100000) - 40;
    await cs.load();
    const after = cs.timeline.positionAt(7, clock.t);
    ok('TL-2', after && Math.abs(after.x - before.x) < 0.05 && after.moving, 'a new envelope moved a running animation from ' + JSON.stringify(before) + ' to ' + JSON.stringify(after));
    cs.timeline.advance(clock.t + 1000);
    ok('TL-2', delivered.filter((k) => k === 'i:e1').length === 1, 'a new envelope re-played an event: ' + delivered.join(','));
  }

  { // SEC-1, SEC-2
    const clock = { t: 0 };
    let body = clone(FIXTURE);
    const { cs } = session(M, { hr_load: () => ({ ok: true, body: clone(body) }) }, clock);
    ok('SEC-1', M.H.analyzerOf(cs) === null && M.H.partyOf(cs) === null && M.H.settingsOf(cs) === null, 'an unloaded character has no sections');
    await cs.load();
    const a = M.H.analyzerOf(cs);
    ok('SEC-1', a && a.hero.kills === FIXTURE.hunt_analyzer.hero.kills && a.hero.perHour.xp === FIXTURE.hunt_analyzer.hero.per_hour.xp, 'the analyzer must read the section as sent');
    /* Tracker r44: Next level in read 00:00:00 forever. It is the Level's eta (hero.level.eta_h), never a skill's: the fixture's maxed Melee carries eta_h 0. */
    ok('SEC-1', a.nextLevelMs === Math.round(FIXTURE.hunt_analyzer.hero.level.eta_h * 3600000) && a.nextLevelMs > 0 && FIXTURE.hunt_analyzer.hero.skills.melee.eta_h === 0, 'Next level in must be the Level eta, not a maxed skill 0 (got ' + a.nextLevelMs + ')');
    for (const [i, bad] of [null, 0, 'soon'].entries()) {
      body = clone(FIXTURE); body.version += 1 + i; body.hunt_analyzer.hero.level = { xp: 0, per_hour: 0, eta_h: bad };
      await cs.load();
      ok('SEC-1', M.H.analyzerOf(cs).nextLevelMs === null, 'a ' + JSON.stringify(bad) + ' Level eta must read unknown (null, shown as the dash), got ' + M.H.analyzerOf(cs).nextLevelMs);
    }
    body = clone(FIXTURE); body.version += 11; delete body.hunt_analyzer;
    body.party.members[0].hp = 'lots';
    await cs.load();
    ok('SEC-1', M.H.analyzerOf(cs) === null, 'an envelope without hunt_analyzer must leave no analyzer behind');
    const p = M.H.partyOf(cs);
    ok('SEC-1', p && p.members[0].hp === null, 'a malformed number must read null, not a guess (' + (p && p.members[0].hp) + ')');
    ok('SEC-2', p && p.members[0].role === 'tank' && p.members[1].role === 'ranger', 'roles must come from the weapons (shield, bow): ' + (p && p.members.map((m) => m.role)));
    body = clone(FIXTURE); body.version += 12; body.party.members[0].weapon = undefined; body.party.members[0].outfit = 'knight';
    await cs.load();
    ok('SEC-2', M.H.partyOf(cs).members[0].role === null, 'an outfit must never give a role');
  }

  { // FP-1
    const cs = { record: { residue: {} } };
    ok('FP-1', M.F.floatShown(cs, 'bleed_badge', 'regular') === false && M.F.floatShown(cs, 'bleed_badge', 'boss') === true, 'bleed badge defaults must be off for monsters, on for bosses');
    ok('FP-1', M.F.floatShown(cs, 'dealt', 'regular') === true && M.F.floatShown(cs, 'nope', 'boss') === false, 'other types default on; an unknown type never shows');
    cs.record.residue.combatText = M.R.sanitizeResidueField('combatText', M.F.withFloat(cs, 'bleed_badge', 'regular', true));
    ok('FP-1', M.F.floatShown(cs, 'bleed_badge', 'regular') === true && M.F.floatShown(cs, 'bleed_badge', 'boss') === true, 'a saved toggle must win over the default');
    const forged = M.R.sanitizeResidueField('combatText', { bleed_badge: { regular: 'yes', boss: false, gold: 9 }, 'Bad Key!': { boss: true } });
    ok('FP-1', JSON.stringify(forged) === '{"bleed_badge":{"boss":false}}', 'a forged combatText must be bounded: ' + JSON.stringify(forged));
  }

  { // INT-1
    const clock = { t: 0 };
    let loads = 0;
    const answers = {
      hr_load: () => { loads++; return { ok: true, body: Object.assign(clone(FIXTURE), { version: FIXTURE.version + loads }) }; },
      hr_action_set_options: { ok: true, body: { ok: true, preset: 0 } },
    };
    const { cs, calls } = session(M, answers, clock);
    await cs.load();
    const v = cs.record.version;
    const r = await cs.setHuntOptions(0, { stance: 'offensive' });
    const sent = calls.filter((c) => c.name === 'hr_action_set_options');
    ok('INT-1', r.ok && sent.length === 1 && sent[0].args.p_slot === 0 && sent[0].args.p_preset === 0
      && JSON.stringify(sent[0].args.p_opts) === '{"stance":"offensive"}' && typeof sent[0].args.p_idem === 'string', 'one intent with slot, preset, options and an idempotency key: ' + JSON.stringify(sent));
    ok('INT-1', loads === 2 && cs.record.version > v, 'an ok must re-read the character (loads ' + loads + ')');
    answers.hr_action_set_options = { ok: true, body: { ok: false, error: 'bad_option' } };
    const before = cs.record;
    const r2 = await cs.setHuntOptions(0, { stance: 'defensive' });
    ok('INT-1', !r2.ok && r2.error === 'bad_option' && cs.record === before && loads === 2, 'a refusal must change nothing and say why: ' + JSON.stringify(r2));
  }

  { // LOG-1
    const clock = { t: 500000 };
    const body = clone(FIXTURE);
    const { cs } = session(M, { hr_load: () => ({ ok: true, body: clone(body) }) }, clock);
    const log = M.L.logFor(cs);
    await cs.load();
    await cs.load();
    cs.timeline.advance(clock.t + 60000);
    const lines = log.lines();
    const byKey = Object.fromEntries(lines.map((l) => [l.key, l]));
    ok('LOG-1', lines.length === FIXTURE.hunt_events.length, 'each event once: ' + lines.map((l) => l.key).join(','));
    ok('LOG-1', byKey['i:s1:1'] && byKey['i:s1:1'].type === 'dealt' && byKey['i:s1:1'].text === 'Tyler hits Giant Rat for 12.', 'a hero hit reads "Tyler hits Giant Rat for 12.": ' + JSON.stringify(byKey['i:s1:1']));
    ok('LOG-1', byKey['i:s1:2'] && byKey['i:s1:2'].type === 'taken', 'a monster hit is damage taken');
    ok('LOG-1', byKey['i:s1:4'] && byKey['i:s1:4'].type === 'loot' && /Slime Gel/.test(byKey['i:s1:4'].text), 'a kill with loot names the loot: ' + JSON.stringify(byKey['i:s1:4']));
  }

  { // LOG-2: the party's rare roll (Tyler L8) reads in plain words: each roll, a tie's re-roll, the winner.
    const n = { name: (u) => ({ 1: 'Tyler', 2: 'Andy' })[u] || 'Someone', isHero: () => true };
    const roll = M.L.lineOf({ key: 'k1', type: 'rare_roll', atMs: 1, u: 1, item: 'crown_shard', rolls: { 1: 87, 2: 40 } }, n);
    ok('LOG-2', roll && roll.type === 'loot' && roll.text === 'Rare roll for the Crown Shard: Tyler 87, Andy 40. Tyler wins it.', 'a rare roll reads ' + JSON.stringify(roll));
    const tie = M.L.lineOf({ key: 'k2', type: 'rare_roll', atMs: 1, u: 2, item: 'crown_shard', rolls: { 1: 50, 2: 50 }, reroll: { 1: 12, 2: 61 } }, n);
    ok('LOG-2', tie && tie.text === 'Rare roll for the Crown Shard: Tyler 50, Andy 50. Tie, so they roll again: Tyler 12, Andy 61. Andy wins it.', 'a tie reads ' + JSON.stringify(tie));
    const turn = M.L.lineOf({ key: 'k3', type: 'rare_roll', atMs: 1, u: 2, item: 'crown_shard', rolls: {} }, n);
    ok('LOG-2', turn && /^Andy takes the Crown Shard: everyone else in the party has won a rare/.test(turn.text), 'the rotation\'s turn reads ' + JSON.stringify(turn));
  }

  { // LOG-3: while the live prediction runs, a server answer's rare roll still reaches the log (the prediction
    // cannot draw it, live-engine.js), and nothing else of that answer does (one position source).
    const clock = { t: 500000 };
    const { cs } = session(M, { hr_load: () => ({ ok: true, body: clone(FIXTURE) }) }, clock);
    const log = M.L.logFor(cs);
    await cs.load();
    cs.live = { running: () => true, stalled: () => false };
    cs.liveLink = { from() {}, off() {} };
    const at = FIXTURE.hunt_server_now_ms - 200;
    cs._play(Object.assign(clone(FIXTURE), { hunt_track: [], hunt_events: [
      { id: at + '.0', type: 'dmg', atMs: at, u: 1, t: 101, amount: 77 },
      { id: at + '.1', type: 'rare_roll', atMs: at, u: 1, item: 'crown_shard', rolls: { 1: 87 } }] }));
    cs.timeline.advance(clock.t + 60000);
    const texts = log.lines().map((l) => l.text);
    ok('LOG-3', texts.some((x) => /^Rare roll for the Crown Shard: Tyler 87\./.test(x)), 'a live viewer never sees the server\'s rare roll: ' + JSON.stringify(texts.slice(-3)));
    ok('LOG-3', !texts.some((x) => / for 77\./.test(x)), 'a live viewer was fed the server\'s own dmg over the prediction');
  }
  return fails;
}

const MUTANTS = [
  ['an event is delivered twice', 'src/hunt-view/timeline.js', '      if (seen.has(k)) continue;\n', ''],
  ['the clock offset jumps to each batch', 'src/hunt-view/timeline.js', 'offset = offset === null ? m : offset + (m - offset) * cfg.skew;', 'offset = m;'],
  ['a new envelope clears the timeline', 'src/session/character-session.js', '  _play(body) {\n', '  _play(body) {\n    this.timeline = createTimeline();\n'],
  ['a gap invents motion', 'src/hunt-view/timeline.js', 'const f = Math.min(1, (t - cur.atMs) / (cur.dur || cfg.tileMs));', 'const f = (t - cur.atMs) / (cur.dur || cfg.tileMs);'],
  ['a pose teleports', 'src/hunt-view/timeline.js', 'const at = last ? Math.max(pose.at_ms, last.atMs + cfg.tileMs) : pose.at_ms;', 'if (a) a.length = 0;\n      const at = pose.at_ms;'],
  ['the timeline lands in the record', 'src/session/envelope.js', '!TIMELINE_KEYS.includes(k) && ', ''],
  ['the analyzer is merged, not replaced', 'src/session/hunt-sections.js', "  const a = section(cs, 'hunt_analyzer');\n", "  const a = section(cs, 'hunt_analyzer') || globalThis.__lastA;\n  globalThis.__lastA = a;\n"],
  ['a role read off the outfit', 'src/session/hunt-sections.js', 'role: roleForWeapon(str(m.weapon), str(m.role_pick)),', "role: roleForWeapon(str(m.weapon) || (m.outfit ? 'shield' : null), str(m.role_pick)),"],
  ['the bleed badge defaults on for monsters', 'src/data/combat-text.js', "label: 'Bleed stack count', on: on(false, true)", "label: 'Bleed stack count', on: on(true, true)"],
  ['a forged toggle passes', 'src/session/residue.js', "for (const k of ['regular', 'boss']) if (typeof r[k] === 'boolean') e[k] = r[k];", 'Object.assign(e, r);'],
  ['the intent writes the record itself', 'src/session/character-session.js', "    if (ans.ok && ans.body && ans.body.ok === true) { await this.load(); return { ok: true }; }", "    this._record = Object.freeze(Object.assign({}, this._record));\n    if (ans.ok && ans.body && ans.body.ok === true) { await this.load(); return { ok: true }; }"],
  ['an ok is not re-read', 'src/session/character-session.js', '{ await this.load(); return { ok: true }; }', '{ return { ok: true }; }'],
  ['a live viewer never sees the server\'s rare roll', 'src/session/character-session.js', 'body.hunt_events.filter((e) => e && SERVER_ONLY_EVENTS.includes(e.type)) : []', '[] : []'],
  ['a monster hit reads as dealt', 'src/hunt-view/combat-log.js', "return line(n.isHero(ev.u) ? 'dealt' : 'taken',", "return line('dealt',"],
];

async function main() {
  if (!process.argv.includes('--mutate')) {
    const fails = await rules(await load(ROOT));
    for (const f of fails) console.log('  ✗ ' + f);
    console.log(fails.length ? 'hunt-view-core: ' + fails.length + ' rule(s) RED' : 'hunt-view-core: timeline plays once and smoothly, sections replace, roles from weapons, float defaults, intents only, log once');
    process.exit(fails.length ? 1 : 0);
  }
  const clean = await rules(await load(ROOT));
  if (clean.length) { console.log('  ✗ clean control RED: ' + clean.join('; ')); process.exit(1); }
  console.log('  ✓ clean control green');
  let bad = 0;
  for (const [name, file, from, to] of MUTANTS) {
    const tmp = mkdtempSync(join(tmpdir(), 'hr-huntview-'));
    try {
      cpSync(join(ROOT, 'src'), join(tmp, 'src'), { recursive: true });
      const text = readFileSync(join(tmp, file), 'utf8');
      if (!text.includes(from)) { console.log('  ✗ ' + name + ' — anchor not found in ' + file); bad++; continue; }
      writeFileSync(join(tmp, file), text.replace(from, to));
      const fails = await rules(await load(tmp));
      if (fails.length) console.log('  ✓ ' + name + ' — caught (' + fails[0].split(':')[0] + ')');
      else { console.log('  ✗ ' + name + ' — NOT caught'); bad++; }
    } finally { rmSync(tmp, { recursive: true, force: true }); }
  }
  console.log(bad ? 'hunt-view-core --mutate: ' + bad + ' escaped' : 'hunt-view-core --mutate: ' + MUTANTS.length + '/' + MUTANTS.length + ' mutants caught');
  process.exit(bad ? 1 : 0);
}
main();
