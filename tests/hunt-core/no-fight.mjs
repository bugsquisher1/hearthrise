// tests/hunt-core/no-fight.mjs — A HERO MUST NOT SIT IN A HUNT IT CAN'T FIGHT IN (game designer's ruling 2026-10-31:
// players' archers "hunted" for hours with 0 kills while the store spent 4,500-8,746 gp). Run by run-all.mjs.
// One engine, one end: the real settle the world tick runs (accrual.js accrueHunt, nobody watching). The viewed half
// (the browser's engine reaches the same end, every commit matching) is tests/hunt-live.mjs LV-NOFIGHT; the database's
// proof of the end is tests/hunt-sessions-settle.mjs NO-FIGHT.
//
//   trapped       a bow with nothing to shoot, store off: no kill, no blow, and the hunt ends no_fight exactly at its
//                 hunt start + NO_FIGHT_END_MIN, not a swing earlier, however the settles are cut (four cuts).
//   dried-up      the same trap met mid-hunt: 30 arrows, then none. The clock runs from the last blow, not the hunt's start.
//   party-fights  a party that kills never trips it, even with a member who deals nothing (a bow with nothing to
//                 shoot beside a tank, 40 minutes): the non-dealer's own damage is 0, and it stays in.
//   late-joiner   a member who joins a quiet world gets its whole span, from its own hunt start.
//   restart       a restarted world (a party change, a deploy) starts its own quiet: a hunt older than the span walks on.
//   quiet-gaps    the span is well clear of a fighting hunt's longest gap: every open ground at its floor, a solo tank
//                 and a tank with a healer: no no_fight end, and the longest quiet stretch stays under half the span.
//   mutants       each half of the rule, planted back.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { makeReport, ROOT, plant } from './fixtures/h1.js';

const { loadPlay, PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
const imp = (root, p) => import(pathToFileURL(join(root, p)).href);

const T0 = Date.UTC(2026, 9, 18, 12, 0, 0);
const OFF = { supplySource: 'mine', onEmpty: 'end' };   // the store closed: nothing to fall back on
/* A bare bow: nothing worn in the ammo slot, nothing on the bar, nothing in the bag. */
const bareBow = () => ({ weapon: 'practice_bow' });
const noBar = () => [];

/* A blow on a monster, by the window's unit book (each unit's kind: a monster's is its id). */
let MON = {};
const onMonster = (w, e) => { const b = w.units && w.units[e.t]; return !!b && !!MON[b[0]]; };

/** Who ended why and when, and every member's blows on monsters. */
function play(P, hunt, L, roles, opts) {
  const ends = {}; const dealt = {}; const unit = {}; let kills = 0; const blows = [];
  const x = P.run(hunt, L, roles, { ...opts, onWindow: (out) => {
    for (const m of out.members) {
      if (Number.isInteger(m.hunt.unit_id)) unit[m.key] = m.hunt.unit_id;
      /* (the runner re-reads an ended member's stale session; its FIRST end is the one the database would close) */
      if (m.hunt.ended && !ends[m.key]) ends[m.key] = { reason: m.hunt.ended.reason, at: Date.parse(m.hunt.ended.at) };
    }
    /* A hero's unit id once it has left: the window's own summary keeps it. */
    for (const m of out.members) if (Number.isInteger(m.summary && m.summary.unitIdEver)) unit[m.key] = m.summary.unitIdEver;
    for (const e of out.events || []) {
      if (e.type === 'kill' && onMonster(out, e)) kills++;
      if (e.type === 'dmg' && onMonster(out, e)) {
        blows.push(e.atMs);
        for (const [k, id] of Object.entries(unit)) if (id === e.u) dealt[k] = (dealt[k] || 0) + e.amount;
      }
    }
    if (typeof opts.onWindow === 'function') opts.onWindow(out);
  } });
  return { x, ends, dealt, kills, blows };
}

function trapped(P, spanMin) {
  const spanMs = spanMin * 60000;
  const want = T0 + spanMs;
  const say = {};
  for (const [label, windowMs] of [['ten-minute windows', 600000], ['90 s windows', 90000], ['16 s windows', 16000], ['seven-minute windows', 420000]]) {
    const r = play(P, 'mill_cellar', 30, ['ranger'], { spanMs: 3 * spanMs, windowMs, session: OFF, equipment: bareBow, bag: () => ({}), bar: noBar });
    if (r.kills || r.blows.length) return 'CONTROL: the trapped bow (' + label + ') landed ' + r.blows.length + ' blows, ' + r.kills + ' kills';
    const e = r.ends.ranger0;
    if (!e || e.reason !== 'no_fight') return 'a bow with nothing to shoot (' + label + ') ended ' + JSON.stringify(e) + ', not no_fight';
    if (e.at !== want) return label + ': it ended at +' + ((e.at - T0) / 60000) + ' min, not at +' + spanMin + ' min';
    say[label] = e.at;
  }
  return Object.values(say).every((t) => t === want) ? null : 'the end moved with the cut: ' + JSON.stringify(say);
}

function driedUp(P, spanMin) {
  const spanMs = spanMin * 60000;
  /* The bag's line is not `essential`, so `ammo_out` does not fire: this is the trap the end exists for. */
  const r = play(P, 'mill_cellar', 30, ['ranger'], { spanMs: 3 * spanMs, session: OFF, equipment: () => ({ weapon: 'practice_bow', ammo: 'iron_arrows' }),
    bag: () => ({ iron_arrows: { loaded: 30, essential: false } }), bar: noBar });
  const e = r.ends.ranger0;
  if (!r.blows.length) return 'CONTROL: the 30 arrows landed nothing';
  if (!e || e.reason !== 'no_fight') return 'a bow out of arrows with the store closed ended ' + JSON.stringify(e) + ', not no_fight';
  const last = Math.max(...r.blows);
  if (!(last > T0 + 10000)) return 'CONTROL: the last blow is at +' + (last - T0) + ' ms';
  const gap = e.at - last;
  return gap >= spanMs && gap <= spanMs + 2000 ? null : 'it ended ' + gap + ' ms after the last blow, not one span (' + spanMs + ' ms) after it';
}

function partyFights(P, spanMin) {
  const r = play(P, 'mill_cellar', [10, 10], ['tank', 'ranger'], { spanMs: 4 * spanMin * 60000, session: OFF,
    equipment: (role, seat, L) => (role === 'ranger' ? bareBow() : P.kitFor(L, role)),
    bag: (role) => (role === 'tank' ? { cooked_shrimp: { loaded: 500 } } : {}), bar: (role) => (role === 'ranger' ? [] : undefined) });
  if (!(r.kills > 50)) return 'CONTROL: the party killed ' + r.kills + ' in ' + 4 * spanMin + ' minutes';
  if (r.dealt.ranger0) return 'CONTROL: the bare bow dealt ' + r.dealt.ranger0 + ' (a member who deals nothing is the point)';
  return Object.keys(r.ends).length ? 'a party that kills was sent home: ' + JSON.stringify(r.ends) : null;
}

/* Two bare bows, the second walking in five minutes later: the first goes at its span, the second at its own. */
function lateJoiner(P, spanMin) {
  const late = 5 * 60000;
  const r = play(P, 'mill_cellar', 30, ['ranger', 'ranger'], { spanMs: 3 * spanMin * 60000, equipment: bareBow, bag: () => ({}), bar: noBar,
    session: (role, seat) => ({ ...OFF, ...(seat === 1 ? { huntFromMs: T0 + late, nextSwingAtMs: T0 + late } : {}) }) });
  const a = r.ends.ranger0, b = r.ends.ranger1;
  if (!a || !b || a.reason !== 'no_fight' || b.reason !== 'no_fight') return 'the two bows ended ' + JSON.stringify(r.ends);
  if (a.at !== T0 + spanMin * 60000) return 'the first ended at +' + (a.at - T0) + ' ms';
  return b.at === T0 + late + spanMin * 60000 ? null : 'the late joiner ended at +' + (b.at - T0) + ' ms, not its own span after its +' + late + ' ms';
}

/* A hunt older than the span whose world restarted: the instance's stored world is gone, its clock is not. */
async function restart(root, P, spanMin) {
  const AR = await imp(root, 'src/core/action-rules.js');
  const r = play(P, 'mill_cellar', 5, ['tank'], { spanMs: 5 * 60000, session: { huntFromMs: T0 - 2 * spanMin * 60000 },
    equipment: () => P.kitFor(5, 'tank'), bag: () => ({ cooked_shrimp: { loaded: 500 } }) });
  if (Object.keys(r.ends).length) return 'a hunt older than the span, in a fresh world, ended ' + JSON.stringify(r.ends);
  /* The check itself: a clock older than the span trips, one a swing younger does not, none at all never does. */
  const hs = (fightAtMs) => ({ tally: {}, bag: {}, huntFromMs: T0, fightAtMs });
  const span = spanMin * 60000;
  if (AR.endReasonAt(hs(T0), T0 + span) !== 'no_fight') return 'a full span of quiet did not end the hunt';
  if (AR.endReasonAt(hs(T0), T0 + span - 2000) !== null) return 'a swing short of the span ended the hunt';
  if (AR.endReasonAt(hs(null), T0 + 100 * span) !== null) return 'a hero not in a world (no clock) ended no_fight';
  return null;
}

function quietGaps(P, grounds, spanMin) {
  const out = []; const bad = [];
  for (const g of grounds) {
    for (const roles of [['tank'], ['tank', 'healer']]) {
      const L = g.band;
      let last = T0; let longest = 0;
      const r = play(P, g.id, L, roles, { spanMs: 1800000, windowMs: 90000, bag: () => ({ cooked_shrimp: { loaded: 2000 } }),
        onWindow: (w) => { for (const e of w.events || []) if (e.type === 'dmg' && onMonster(w, e)) { longest = Math.max(longest, e.atMs - last); last = e.atMs; } } });
      const nf = Object.values(r.ends).filter((e) => e.reason === 'no_fight');
      out.push(g.id + ' L' + L + ' ' + roles.join('+') + ': ' + Math.round(longest / 1000) + ' s' + (Object.keys(r.ends).length ? ' (' + JSON.stringify(Object.values(r.ends).map((e) => e.reason)) + ')' : ''));
      if (nf.length) bad.push(g.id + ' ' + roles.join('+') + ' ended no_fight');
      if (longest > (spanMin * 60000) / 2) bad.push(g.id + ' ' + roles.join('+') + ': a quiet stretch of ' + Math.round(longest / 1000) + ' s');
      if (!r.kills && !nf.length && !Object.keys(r.ends).length) bad.push('CONTROL: ' + g.id + ' ' + roles.join('+') + ' killed nothing');
    }
  }
  console.log('  quiet-gaps (longest stretch with no blow on a monster): ' + out.join(' | '));
  return bad.length ? bad.join(' | ') : null;
}

const R = makeReport('hunt-core/no-fight');
const H = await imp(ROOT, 'src/data/hunt-sessions.js');
const G = await imp(ROOT, 'src/data/hunt-grounds.js');
const HUNTS = await imp(ROOT, 'src/data/hunts.js');
const SPAN = H.NO_FIGHT_END_MIN;
const P = await loadPlay(ROOT);
MON = P.MONSTERS;

async function allCases(root, p) {
  const out = [];
  for (const [name, f] of [['trapped', () => trapped(p, SPAN)], ['dried-up', () => driedUp(p, SPAN)], ['party-fights', () => partyFights(p, SPAN)], ['late-joiner', () => lateJoiner(p, SPAN)], ['restart', () => restart(root, p, SPAN)]]) {
    let w = null;
    try { w = await f(); } catch (e) { w = 'threw ' + (e && e.stack || e); }
    if (w) out.push(name + ': ' + w);
  }
  return out;
}

for (const w of await allCases(ROOT, P)) R.ok(false, w);
const gapGrounds = Object.keys(G.OPEN_GROUNDS).map((id) => ({ id, band: (HUNTS.HUNT_INDEX[id] && HUNTS.HUNT_INDEX[id].band && HUNTS.HUNT_INDEX[id].band[0]) || 5 }));
let gaps = null;
try { gaps = quietGaps(P, gapGrounds, SPAN); } catch (e) { gaps = 'threw ' + (e && e.stack || e); }
R.ok(!gaps, 'quiet-gaps: ' + gaps);

const MUTANTS = [
  { name: 'the end never fires', edits: [['src/core/action-rules.js', "  no_fight: (hs, t) => Number.isInteger(hs.fightAtMs) && t - Math.max(hs.fightAtMs, Number(hs.huntFromMs) || 0) >= NO_FIGHT_END_MIN * 60000,", '  no_fight: () => false,']], arm: /^trapped/ },
  { name: 'a blow never resets the clock (a party that kills goes home)', edits: [['src/core/hunt/damage.js', "    if (target.side === 'mon') inst.world.fightAt = sc.atMs;\n", '']], arm: /^(party-fights|dried-up)/ },
  { name: 'a blow at a hero counts as a fight', edits: [['src/core/hunt/damage.js', "    if (target.side === 'mon') inst.world.fightAt = sc.atMs;\n", '    inst.world.fightAt = sc.atMs;\n']], arm: /^(trapped|dried-up)/ },
  { name: 'the clock does not survive a settle cut', edits: [['src/core/hunt/damage.js', "  world: Object.freeze([['fightAt', 'int']]),", '  world: Object.freeze([]),']], arm: /^trapped/ },
  { name: 'a fresh world keeps no clock of its own (a restart ends an old hunt)', edits: [['src/core/combat-sim.js', '          world.fightAt = atMs;\n', '']], arm: /^restart/ },
  { name: 'a late joiner reads the world\'s clock alone', edits: [['src/core/action-rules.js', 't - Math.max(hs.fightAtMs, Number(hs.huntFromMs) || 0) >= NO_FIGHT_END_MIN * 60000', 't - hs.fightAtMs >= NO_FIGHT_END_MIN * 60000']], arm: /^late-joiner/ },
  { name: 'a hero with no clock ends at once', edits: [['src/core/combat-sim.js', "    for (const m of members) m.hs.fightAtMs = world && m.unitId !== null ? world.fightAt : null;\n", '    for (const m of members) m.hs.fightAtMs = 0;\n']], arm: /^(restart|trapped|party-fights)/ },
];
for (const mu of MUTANTS) {
  const p = plant(mu.edits, PLAY_TREES);
  try {
    const w = await allCases(p.root, await loadPlay(p.root));
    R.ok(w.some((x) => mu.arm.test(x)), 'mutant "' + mu.name + '" was NOT caught (' + JSON.stringify(w).slice(0, 300) + ')');
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  6 cases, ' + MUTANTS.length + ' mutants caught');
R.finish();
