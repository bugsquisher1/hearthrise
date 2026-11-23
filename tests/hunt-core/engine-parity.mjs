// tests/hunt-core/engine-parity.mjs — THE ONE COMBAT ENGINE PLAYS THE SAME HUNT, TO THE BYTE (lane/r-engine-profile, 2026-11-11).
// Run by run-all.mjs.
//
// pinned   Each pinned-seed scenario below is the world tick's settle (hr-accrue accrual.js accrueHunt over
//          src/core/combat-sim.js simulateHuntInstance), cut into 100 s windows, the world carried between windows as its
//          stored string. Every settle is hashed three ways and the chain of each is pinned in engine-parity.baseline.json:
//            world     the stored world string, its swing counters and where the settle stopped
//            timeline  the settle's events, its track and its unit book (what the browser plays back)
//            tally     every member's share (delta, hunt, analyzer) and the run's totals, kills and items
//          A PURE optimization of the engine (the same inputs give the same outputs) keeps all three. A change MEANT to move
//          what a hunt does (a rule, a balance number, a data row these grounds read) moves them: re-pin with
//            node tests/hunt-core/engine-parity.mjs --write
//          in the same commit, and say in it why the hunt moved. Never re-pin an optimization.
//
// The mutants prove the pin bites: one damage roll in a whole run one point higher, and each of the pure
// optimizations this file was written to hold (lane/r-engine-profile) broken by one tile or one unit.
//
// index-audited   THE SUB-STEP'S UNIT LISTS (src/core/hunt/unit-index.js, part 2) are kept between reads and dropped by
//                 their writers. An audit planted into the index checks EVERY answer it gives against a fresh scan of the
//                 list, through all four scenarios: a writer that forgot to drop it throws there, even where the stale
//                 answer happened not to move a hash. The audited run must also hold the pins.
// index-writers   Every line in src/core that writes a unit's `alive`, a `target` or a world's unit list is pinned below
//                 with why the index stays true (it drops the index; a hero's target is in no kept list; it runs between
//                 swings). A new writer fails here until it calls staleIndex(inst) or says why it needn't.
//
// mutant-anchors: src/core/hunt/damage.js src/core/hunt/roles.js src/core/hunt/movement.js src/core/hunt/grid.js src/core/hunt/targeting.js src/core/hunt/pull-cycle.js src/core/hunt/unit-index.js
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { makeReport, ROOT, plant } from './fixtures/h1.js';
import { caughtBy, missWhy } from '../_mutant-verdict.mjs';

const { loadPlay, PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
const BASELINE = join(ROOT, 'tests/hunt-core/engine-parity.baseline.json');
const WINDOW = 100000;
const SEED = '-4611686018427387904';

/* The live-shaped hard grounds at a full box (density 8), a lone kiting ranger, and a melee + healer pair on another map:
   every positioning path (tank hold and open ground, melee walk, ranged spot, kite), the bar, the supplies, the rewards. */
/* RE-PINNED 2026-11-12 (lane/d-solo-fifteen), DATA ONLY, THE ENGINE UNCHANGED. The pins were stamped on d86e0ac4f (lane/r-engine-profile, 2026-11-10). Proof, by
   laying files into an archive of that commit and running this test there: the CURRENT src/core and supabase/functions/hr-accrue over the pin's data hold
   every pin (the engine profile lane's byte-identity, played); the current src/data moves them. One current data file at a time into the pin's tree:
     src/data/party-class-xp.js  moves warrens-4, glade-4, glade-1-kite and sewer-2: the mixed party cells re-fitted for one pack on Normal (lane/d-party-xp-cells,
                                 Tyler 2026-11-11), then every cell x1150/1050 and SOLO_XP_PM 1050 -> 1150 (Tyler 2026-11-11: solo hunters +15%)
     src/data/monsters.js        moves warrens-4, glade-4 and glade-1-kite: the rows regenerated from the sheet on the XP fits (the Glade 0.90, the Warrens 0.76,
                                 the Cellar 1.28, balance-sheet.js GROUND_XP_FIT) and the Brook Bear as a heavy with most of an elite's purse (designer 2026-11-12)
     src/data/hunt-grounds.js    moves glade-4 and glade-1-kite (kills 500 -> 504, 137 -> 128): the party's own Normal pull retired and the bear standing in
                                 Vine Hollow as built (lane/c-brook-bear, Tyler 2026-11-11)
     core-model.js (the re-fitted Level curve), scaled-hunts.js, balance-sheet.js, items.js, hunt-tiers.js, hunt-xp.js and the ground packs move no pin.
   Every settle's hashes moved, the kills with them (warrens-4 221 as before). The baseline is --write on this tree.
   RE-PINNED 2026-11-13 (lane/d-no-profit-molds), DATA ONLY: glade-4's TALLY alone moved (world and timeline held, kills 536 as pinned). Cause, proved by
   putting the old row back alone (the bear's gp [13, 40]: every pin holds, exit 0): src/data/monsters.js brook_bear gp [13, 40] -> [11, 32], the purse
   back on the formula when the +10% floor it served was retired (NO PROFIT MOLDS). The Cellar's XP fit (rat 15 -> 16 XP) is on no pinned ground.
   UN-PINNED 2026-11-15 (lane/d-chief-spell): warrens-4 is back on its 11-13 pin. lane/a-open-march-scaled had re-pinned it over cf3fbb21d's Slag Rain 400 -> 800,
   a row the field Chief shared with the called one; the called Chief now casts his own slag_rain_called and the field row is 400 again. Opening the March moves no pin.
   RE-PINNED 2026-11-15 (lane/d-mage-110), DATA ONLY: warrens-4 (kills 231 -> 209) and glade-4 (536 -> 515) moved. Cause: src/data/gear-tiers.js cloth's
   magicStrB 0.4 of the plate twin's defence -> 1 plus a tenth of it (the Adept set 15 -> 9, the Scholar set 27 -> 14), so each four's Mage and Healer hit softer; and the Chief's
   Cauldron .00122 -> .0014 (src/data/monsters.js). Proof: this file and the current src/core over the old two rows hold every pin (exit 0).
   RE-PINNED 2026-11-16 (lane/d-flat-party-xp), A PARTY XP CHANGE MEANT TO MOVE THEM: the three parties moved (warrens-4 first, its world at settle 8, kills 231
   as pinned; glade-4 and sewer-2 behind it), the lone kiting ranger held. Cause, proved by laying origin/main's src/data/party-class-xp.js and
   src/core/hunt/xp-share.js back alone into an archive of the lane (all four pins hold, exit 0): ONE party table by size for every ground and tier (Tyler
   2026-11-16, "just balance the hunting grounds xp vs having a unique formula everywhere"); a party's XP moves its Levels, and the Levels their rolls.
   The peer keys on hunt_check (hunt-settle.js huntPeerKeys, member.js frozenKey) move no pin.
   RE-PINNED 2026-11-17 (lane/d-flat-party-xp merged with set/v0.2.135 at 0d2552906), THE TABLE ONLY: the set's own pins (lane/c-tower-all re-pinned the set's
   output: the income dial's coin and Turning Cut's sewer-2 kills 114 -> 121) move for the three parties from settle 1 (warrens-4 209, glade-4 515, sewer-2
   121 kills as pinned); the lone kiting ranger holds. Cause, proved on an archive of this tree with the set's src/data/party-class-xp.js and
   src/core/hunt/xp-share.js laid back: all four set pins hold (exit 0). The one party table pays each party another cell than its ground's row did, and a
   party's XP moves its Levels, and the Levels their rolls. The baseline is --write here.
   RE-PINNED 2026-11-17 (the same lane's tier fix), THE TABLE ONLY: the four cells 1765 / 1800 -> 1670 / 1700 (so Deadly can pay more an hour than Dangerous
   under Tyler's ~2.5x) move warrens-4 and glade-4 from settle 1, kills as pinned; sewer-2 (two classes) and the lone ranger hold. Proof: the set's
   src/data/party-class-xp.js laid back into an archive of this tree, every pin holds (exit 0). The tier rows move no pin (no scenario plays a tier).
   RE-PINNED 2026-11-17 (lane/a-cave-walls round 2), THE WARRENS' WALK GRID ONLY: warrens-4 moved at settle 1 (kills 209 -> 211); glade-4, sewer-2 and the
   lone ranger hold. Cause: src/data/world/maps/coppercap_warrens.js rows reshaped off the rectangles (the Coordinator: the rooms read as boxes; every
   pack tile, pull, node, the patrol path and the walk between the pockets held, 981 -> 986 open tiles), so the party walks other steps. Proof: the
   merged tree with origin/lane/a-art-136's coppercap_warrens.js laid back alone holds every pin (exit 0). The Glade's ford stone ids move no pin.
   RE-PINNED 2026-11-18 (lane/d-party-pace; Tyler 2026-11-18 "Yes, open at 5"), THE SEWER'S MONSTER ROWS ONLY: sewer-2 moved at settle 2 (kills 121 -> 114);
   warrens-4, glade-4 and the lone ranger hold. Cause: the Sewer's floor 8 -> 5 re-made its six formula rows (tools/gen-ground-stats.mjs --write: a floor-5
   purse, three of them one point less attack) and the Rat King's attack 7 -> 6 by hand (balance-sheet.js FORMULA_EXCEPTIONS: his Tail Lash held at 35% of
   the floor-5 hero), so its swings and coin differ. Proof: this tree with the parent commit's src/data/monsters.js laid back holds
   every pin (exit 0); the band itself moves none.
   RE-PINNED 2026-11-18 (set/v0.2.139 merged into lane/d-party-pace), LANE/D-DROP-HOMES' DROP ROWS ONLY: warrens-4 moved at settle 4 (kills 211 as pinned);
   glade-4, sewer-2 and the lone ranger hold. Cause: src/data/monsters.js drop rows (armor, weapons and shields drop at every tier, Tyler 2026-11-18) change
   the Warrens' loot rolls. Proof: set/v0.2.139 alone (f5ec21295) reads the same red, and with origin/main's src/data/monsters.js laid in it holds every pin (exit 0).
   RE-PINNED 2026-11-18 (lane/d-jewelry-sample on v0.2.139, 5b58e0b6e), WARRENS-4'S TALLY ONLY (world and timeline hold, kills 211): the Goblin Digger's Seam
   Jasper Rare (src/data/monsters.js) is a new item in the tally. glade-4, sewer-2 and the lone ranger hold. Proof: this lane's tree with origin/main's
   src/data/monsters.js laid back alone holds every pin (exit 0), so Steady and Focus (combat.js, damage.js) move none: no pinned hero wears them.
   RE-PINNED 2026-11-19 (lane/d-harder-monsters; Tyler 2026-11-19 "raise HP and damage done by all monsters in the game slightly"), DATA ONLY, A
   BALANCE CHANGE MEANT TO MOVE THEM, pinned last on set/v0.2.142 (00205fa4a): all four scenarios move (kills against the set's pins: warrens-4
   217 -> 198, glade-4 527 -> 488, glade-1-kite 143 -> 139, sewer-2 120 -> 113).
   Cause: src/data/balance-sheet.js STAT_FORMULA's blows and HP line x1.1 and
   XP a point x0.96, so every formula row on the pinned grounds (src/data/monsters.js, rewritten by tools/gen-ground-stats.mjs --write) has a tenth
   more HP and a blow a tenth harder: other kills, other swings, other rolls. This lane's diff touches no file under src/core or
   supabase/functions (git diff set/v0.2.142...HEAD --stat -- src/core supabase/functions: empty), so the engine is the pin's.
   RE-PINNED 2026-11-19 (lane/d-142-rulings; the board's "2026-11-19 Two rulings for v0.2.142", the Coordinator's no-Level-loss route), DATA ONLY,
   kills as pinned (198 / 488 / 139 / 113): every timeline and tally moves from settle 1, the world from settle 3 (sewer-2's world holds). Cause:
   src/data/balance-sheet.js STAT_FORMULA XP a point x0.88, so every formula row's xp (src/data/monsters.js, gen-ground-stats --write) pays 12%
   less a kill, and the XP the timeline and tally carry moves from the first kill. The Level curve under these heroes holds (Levels 10-110 are the
   set's brackets; only Levels 1-9 re-split and past 110 re-fit). No file under src/core or supabase/functions moves.
   RE-PINNED 2026-11-20 (lane/c-tohit-ratio, balance program L15; Tyler ruled 21-1 and 21-2: to-hit as a ratio of two ratings), THE ENGINE AND THE
   ROWS, A RULE CHANGE MEANT TO MOVE THEM: all four scenarios move from settle 1 (kills 198 -> 187, 488 -> 479, 139 -> 134, 113 -> 113). Cause:
   src/core/combat.js rolls every blow on src/data/to-hit.js's ratio (a hero's 20 + skill + accuracy against the monster's evasion, a monster's aim
   against 20 + Defense + guard), and every monster row carries the two ratings in place of baseAcc, its def without STAT_FORMULA.def.past (so a
   blow loses fewer points to it); the Warrens' drop rows re-fitted to the slower Chief move warrens-4's tally too. Other landed blows, other rolls.
   RE-PINNED 2026-11-21 (set/v0.2.144 merged into lane/c-tohit-ratio), SEWER-2'S TALLY ONLY (kills 113 as pinned; the other three hold): the set's Level
   curve (lane/c-levels-7-9: Levels 7-20 re-cut, src/data/core-model.js LEVEL_CURVE) moves where its heroes' Levels fall. Proof: the merged tree with this
   lane's pre-merge core-model.js laid back holds every pin (exit 0).
   RE-PINNED 2026-11-22 (lane/c-hunt-report, build plan FB-7, GR-66), A READING, NOT A PLAY: every WORLD hash and every kill count held at all 48 settles
   of the four scenarios (the re-pin moved 0 world lines); the TIMELINE and the TALLY moved at every settle. Cause: a blow at a hero now carries the HP it
   left and the hero's max (src/core/hunt/damage.js landHit `hp`, `max`), which the timeline hashes, and the settle's analyzer proposes the hunt report's
   counters (accrue-hunt.js analyzerOf `report`: lowest health, close calls, rule uses and waits, the bar and gear), which the tally hashes.
   Re-pinned again the same day, THE TALLY ONLY (world and timeline held): report.js reportProposal writes the report in the database's shape,
   its maps in key order.
   RE-PINNED 2026-11-21 (lane/v1-climb, the Danger scale), THE STORED WORLD STRING ONLY: every scenario's world chain moves from settle 1 because the
   world carries six more fields (src/core/hunt/danger.js PERSISTED: risk, danger, climb, clean, low, cool), blank on every tier hunt. Every timeline
   and tally chain holds, kills as pinned (207 / 486 / 139 / 104): proof, the four scenarios played on this tree with the world string set aside, both
   other chains compared to the 11-21 pin (all HOLD, and no tier hunt wrote a danger field). No scenario plans a stance.
   RE-PINNED 2026-11-22 (lane/v1-climb merged with set/v0.2.144), THE WORLD STRING ONLY again: against the set's pin, timeline and tally hold at
   every settle and kills as pinned; only the six blank Danger fields move the world chain.
   RE-PINNED 2026-11-22 (lane/v1-climb wave 1), THE STORED WORLD STRING ONLY: every pack carries its Danger count of the fallen (danger.js
   PERSISTED pack `down`, 0 on every tier hunt: only a pack row falling on the scale counts). Timeline, tally and kills hold at every
   settle of the four scenarios (207 / 486 / 139 / 104), compared to the pin before; the scale's pay, coin and cleared-pull rule run only
   on a world with a stance, and no scenario plans one.
   RE-PINNED 2026-11-22 (lane/r2-danger-falls), THE STORED WORLD STRING ONLY: the world carries what a fall back names (danger.js PERSISTED
   world `lowHero`, `lowBy`: null and '' on every tier hunt). Diffed against the pin before: only the 4 x 12 `each` world hashes and the 4
   chain world hashes moved; every timeline and tally hash and every kill count (207 / 486 / 139 / 104) held. No scenario plans a stance.
   RE-PINNED 2026-11-22 (lane/bar-metrics), A UNIT'S lastMove ONLY: a hero carries the last ability it cast per lane (abilities.js PERSISTED,
   the bar's last_move test), so the stored world, the timeline's unit book and the run's member summary moved. Compared against the base
   tree with lastMove stripped (warrens-4, sewer-2): every settle's events, track, unit book and member share, and the run's totals, are
   byte-identical; kills 207 / 486 / 139 / 104 held.
   RE-PINNED 2026-11-22 (lane/e2-e3-statuses), ONE NEW EVENT ONLY: glade-4's timeline at settle 12 (and its chain) moved, nothing else. Cause: a
   shield spent to nothing now says `shield_break` (damage.js landHit, events.js EVENT_VERSION 9), and glade-4's healer's Protective Ward broke
   once in that window. PROOF THE GENERAL STATUS SYSTEM IS THE OLD ENGINE: Bleed, Chill and Sickness on statuses.js keys and the one reader
   (status-effects.js), the one shield rule (shields.js offerShield), auras (auras.js, none slotted) and Silenced, played with that one emit
   switched off, HOLD EVERY PIN (world, timeline and tally at all 48 settles, exit 0); with it on, the diff against the pin before is the
   two glade-4 timeline hashes, every world and tally hash and every kill count (203 / 479 / 134 / 104) held.
   PINNED 2026-11-23 (lane/stage3-pipeline), ONE NEW SCENARIO, THE FOUR TIER PINS HELD: muster-steps-4 plays the Danger scale (its leader's plan on
   Steady from step 0), so every blow, spell, tick, heal and shell of it goes through the amount pipeline (src/core/hunt/amount.js; 27 D-1 to D-8).
   Cause of the pin: no scenario played the scale, so the pipeline had no byte-identity pin; its mutant (one pipeline blow one point higher) moves it.
   The pipeline runs only on the scale: warrens-4, glade-4, glade-1-kite and sewer-2 held world, timeline, tally and kills (203 / 479 / 134 / 104),
   diffed against the pin before this lane; muster-steps-4 172 kills. */
const SCENARIOS = Object.freeze({
  'warrens-4': { hunt: 'coppercap_warrens', L: 40, roles: ['tank', 'healer', 'ranger', 'mage'], fullSet: true, density: 8, settles: 12 },
  'glade-4': { hunt: 'mosslight_glade', L: 24, roles: ['tank', 'healer', 'ranger', 'mage'], fullSet: true, density: 8, settles: 12 },
  'glade-1-kite': { hunt: 'mosslight_glade', L: 26, roles: ['ranger'], fullSet: true, settles: 12 },
  'sewer-2': { hunt: 'millrace_sewer', L: 20, roles: ['melee_dps', 'healer'], settles: 12 },
  /* the Danger scale and its amount pipeline (lane/stage3-pipeline): a four on Muster Barrows, the leader's plan on Steady from the ground as built */
  'muster-steps-4': { hunt: 'muster_barrows', L: 60, roles: ['tank', 'healer', 'ranger', 'mage'], fullSet: true, plan: { risk: 'steady', danger: 0 }, settles: 12 },
});

const h12 = (s) => createHash('sha256').update(s).digest('hex').slice(0, 12);

/** One scenario on `P` (loadPlay of the repo or a planted copy): per settle, its three hashes; and the chains. */
function fingerprint(P, sc) {
  const settles = [];
  const r = P.run(sc.hunt, sc.L, sc.roles, { spanMs: sc.settles * WINDOW, windowMs: WINDOW, secret: SEED, fullSet: sc.fullSet === true,
    ...(Number.isInteger(sc.density) ? { density: sc.density } : {}),
    ...(sc.plan ? { plan: sc.plan } : {}),
    onWindow: (out) => {
      settles.push({
        world: h12([out.worldSwingFrom, out.worldSwingTo, out.settledTo, out.world === null ? 'null' : out.world].join('|')),
        timeline: h12(JSON.stringify(out.events) + '|' + JSON.stringify(out.track) + '|' + JSON.stringify(out.units)),
        tally: h12(JSON.stringify(out.members)),
      });
    } });
  const chain = (k) => h12(settles.map((s) => s[k]).join(','));
  return { settles: settles.length, kills: r.totals.kills, world: chain('world'), timeline: chain('timeline'),
    tally: h12(chain('tally') + JSON.stringify([r.totals, r.members, r.items, r.heroXp, r.killsBy])), each: settles };
}

/** Every scenario's fingerprint against the pin: null when all three chains hold, else where the first one broke. */
function against(P, pin, names) {
  for (const name of names) {
    const f = fingerprint(P, SCENARIOS[name]);
    const p = pin.scenarios[name];
    if (!p) return name + ': not pinned (run --write)';
    if (f.settles !== p.settles) return name + ': ' + f.settles + ' settles, pinned ' + p.settles;
    for (const k of ['world', 'timeline', 'tally']) {
      if (f[k] === p[k]) continue;
      const at = f.each.findIndex((s, i) => !p.each[i] || s[k] !== p.each[i][k]);
      return name + ': the ' + k + ' moved' + (at >= 0 ? ' at settle ' + (at + 1) + ' of ' + f.settles : ' (the run totals)') + ' (kills ' + f.kills + ', pinned ' + p.kills + ')';
    }
  }
  return null;
}

const R = makeReport('hunt-core/engine-parity');
const P = await loadPlay(ROOT);

if (process.argv.includes('--write')) {
  const out = { note: 'tests/hunt-core/engine-parity.mjs --write. Re-pin only for a change meant to move what a hunt does, and say why in the commit.', window: WINDOW, seed: SEED, scenarios: {} };
  for (const name of Object.keys(SCENARIOS)) {
    const f = fingerprint(P, SCENARIOS[name]);
    out.scenarios[name] = { settles: f.settles, kills: f.kills, world: f.world, timeline: f.timeline, tally: f.tally, each: f.each };
    console.log('  ' + name.padEnd(13) + ' ' + f.settles + ' settles, ' + f.kills + ' kills, world ' + f.world + ' timeline ' + f.timeline + ' tally ' + f.tally);
  }
  writeFileSync(BASELINE, JSON.stringify(out, null, 1) + '\n');
  console.log('engine-parity: pinned ' + Object.keys(SCENARIOS).length + ' scenarios in tests/hunt-core/engine-parity.baseline.json');
  process.exit(0);
}

const PIN = JSON.parse(readFileSync(BASELINE, 'utf8'));
R.ok(PIN.window === WINDOW && PIN.seed === SEED, 'the baseline was pinned on another window or seed');
const names = Object.keys(SCENARIOS);
R.ok(names.every((n) => PIN.scenarios[n]) && Object.keys(PIN.scenarios).every((n) => SCENARIOS[n]), 'the baseline pins other scenarios than this file runs (run --write)');
for (const name of names) {
  /* each scenario must be a hunt worth pinning: every settle played, and kills in it */
  const p = PIN.scenarios[name];
  R.ok(p && p.settles === SCENARIOS[name].settles && p.kills > 0, name + ': the pin is not a full hunt with kills');
}
const why = against(P, PIN, names);
R.ok(!why, 'pinned: ' + why);

/* THE INDEX AUDIT (unit-index.js current): every answer checked against a fresh build of the same list, and counted. */
const AUDIT = ['src/core/hunt/unit-index.js', '  if (!ix || ix.units !== units || ix.n !== units.length) ix = inst.ix = build(units);\n  return ix;\n',
  '  if (!ix || ix.units !== units || ix.n !== units.length) ix = inst.ix = build(units);\n'
  + "  { const f = build(units); const same = (a, b) => a === b || (!!a && !!b && a.length === b.length && a.every((u, i) => u === b[i]));"
  + " for (const k of ['engaged', 'mons', 'heroes', 'heroUnits']) if (!same(ix[k], f[k])) throw new Error('unit-index audit: a stale ' + k + ' list');"
  /* (the side seam, sides.js: every side's lists, by its kind group while none is placed, and every foe list the sub-step has kept) */
  + " const groups = (x) => (x.placed ? [...x.sides] : [[SIDE.company, x.company], [SIDE.ground, x.ground]]);"
  + " const gi = groups(ix); const gf = groups(f); if (ix.placed !== f.placed || gi.length !== gf.length) throw new Error('unit-index audit: a stale set of sides');"
  + " gf.forEach(([s, g], j) => { for (const k of ['living', 'engaged', 'targeted']) if (gi[j][0] !== s || !same(gi[j][1][k], g[k])) throw new Error('unit-index audit: a stale ' + k + ' list of side ' + s); });"
  + " if (ix.foes) for (const [s, g] of ix.foes) if (!same(g.living, units.filter((u) => u.alive && sideOf(u) !== s))) throw new Error('unit-index audit: a stale foe list of side ' + s);"
  + ' globalThis.__indexReads = (globalThis.__indexReads || 0) + 1; }\n  return ix;\n'];
if (!process.argv.includes('--no-audit')) {
  const p = plant([AUDIT], [...PLAY_TREES, 'tests/hunt-core/fixtures']);
  try {
    globalThis.__indexReads = 0;
    let got = null;
    try { got = against(await loadPlay(p.root), PIN, names); } catch (e) { got = 'threw ' + e.message; }
    R.ok(!got, 'index-audited: ' + got);
    /* the audit must have read the index, a lot: a swing that never indexes would pass it vacuously */
    R.ok(globalThis.__indexReads > 100000, 'index-audited: the index was read ' + globalThis.__indexReads + ' times in four hunts');
    if (process.argv.includes('--verbose')) console.log('  index-audited: ' + globalThis.__indexReads + ' answers, every one a fresh scan\'s');
  } finally { p.done(); }
}

/* THE WRITERS (unit-index.js header). [file, the line as written, why the index stays true]. */
const WRITERS = [
  ['src/core/hunt-spawn.js', 'world.units = units;', 'a new world, between swings'],
  ['src/core/hunt-spawn.js', 'world.units.push(heroUnit(id, hero, roles, ground.start[Math.max(0, seat) % ground.start.length]));', 'a hero joins between swings'],
  ['src/core/hunt-spawn.js', 'world.units = world.units.filter((u) => u.id !== unitId);', 'a hero leaves between swings'],
  ['src/core/hunt-spawn.js', 'for (const u of world.units) if (u.target === unitId) u.target = null;', 'a hero leaves between swings'],
  ['src/core/hunt/leash.js', 'u.target = null;', 'resetPack drops the index'],
  /* A ground boss's adds leave on his reset (lane/b-muster-barrows; tests/ground-boss.mjs): all three before resetPack's one staleIndex, which nothing reads ahead of */
  ['src/core/hunt/leash.js', 'if (isAdd(inst, u)) { u.alive = false; u.hp = 0; u.goal = null; gone.add(u.id); continue; }', 'resetPack drops the index'],
  ['src/core/hunt/leash.js', 'inst.world.units = inst.world.units.filter((u) => !gone.has(u.id));', 'resetPack drops the index'],
  ['src/core/hunt/leash.js', 'for (const u of inst.world.units) if (gone.has(u.target)) u.target = null;', 'resetPack drops the index'],
  ['src/core/hunt/pull-cycle.js', 'w.units.push(u);', 'placeRow drops the index'],
  ['src/core/hunt/pull-cycle.js', 'w.packs[p].alive = true;', 'a pack\'s alive, not a unit\'s'],
  ['src/core/hunt/pull-cycle.js', 'if (u && on.length) { u.target = on[i % on.length].id; staleIndex(inst); }', 'spawnAdds drops the index'],
  ['src/core/hunt/pull-cycle.js', 'u.alive = false;', 'fallen drops the index'],
  ['src/core/hunt/pull-cycle.js', 'u.target = null;', 'fallen drops the index'],
  ['src/core/hunt/pull-cycle.js', 'h.target = null;', 'a hero\'s target, in no kept list'],
  ['src/core/hunt/pull-cycle.js', 'for (const m of packMonsters(inst, p)) m.target = aimOf(inst, m, k.id);', 'startPull drops the index'],
  ['src/core/hunt/pull-cycle.js', 'w.packs[p].alive = false;', 'a pack\'s alive, not a unit\'s'],
  ['src/core/hunt/pull-cycle.js', "if (gone) { w.units = w.units.filter((u) => !isMonster(u) || u.alive || u.deadMs < HUNT_TUNING.corpseMs); staleIndex(inst); }", 'clearCorpses drops the index'],
  /* the Danger scale's pull re-formed at its step's size (lane/v1-climb): the next line drops the index */
  ['src/core/hunt/pull-cycle.js', 'w.units = w.units.filter((u) => !gone.has(u.id));', 'fitPull drops the index'],
  ['src/core/hunt/pull-cycle.js', 'for (const h of heroes(inst)) h.target = null;', 'a hero\'s target, in no kept list (breakOff; its resetPack drops the index)'],
  ['src/core/hunt/roles.js', 'if (m) h.target = m.id;', 'a hero\'s target, in no kept list'],
  ['src/core/hunt/targeting.js', 'm.target = id;', 'retarget drops the index'],
  ['src/core/hunt/targeting.js', 'if (!u.alive || !fighting) { u.target = null; continue; }', 'a hero\'s target, in no kept list'],
  ['src/core/hunt/targeting.js', 'u.target = id;', 'a hero\'s target, in no kept list'],
  ['src/core/hunt/world-state.js', 'w.units = ((o && o.units) || []).map(makeUnit);', 'a new world, between swings'],
  ['src/core/hunt/world-state.js', "w.units = enc.u.map((r) => unrow('unit', r));", 'a decoded world, between swings'],
];
{
  const re = /\.(alive|target)\s*=(?!=)|\.units\s*=(?!=)|\.units\.(push|splice|unshift|pop|shift|sort|reverse|fill|copyWithin)\(|\.units\[[^\]]*\]\s*=(?!=)/;
  const found = [];
  for (const f of readdirSync(join(ROOT, 'src/core'), { recursive: true }).filter((x) => String(x).endsWith('.js')).sort()) {
    for (const line of readFileSync(join(ROOT, 'src/core', String(f)), 'utf8').split('\n')) {
      const t = line.trim();
      if (!t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && re.test(line)) found.push('src/core/' + String(f).replace(/\\/g, '/') + '  ' + t);
    }
  }
  const pinned = WRITERS.map(([f, t]) => f + '  ' + t);
  const extra = found.filter((x) => !pinned.includes(x)), gone = pinned.filter((x) => !found.includes(x));
  R.ok(!extra.length && !gone.length && found.length === pinned.length, 'index-writers: '
    + (extra.length ? 'a new writer of alive, a target or the unit list (call staleIndex(inst) where it writes, or say why it needn\'t, and pin it here): ' + extra.join(' | ') : '')
    + (gone.length ? ' pinned writers no longer found: ' + gone.join(' | ') : '') + (found.length !== pinned.length ? ' (' + found.length + ' found, ' + pinned.length + ' pinned)' : ''));
  if (process.argv.includes('--writers')) for (const x of found) console.log('  writer: ' + x);
}

/* THE MUTANTS. Each runs only the scenario that walks the code it breaks (a planted copy of the engine and the settle). */
const mutants = [
  /* one roll, five points: at a monster with well over twice the blow's HP left (never an overkill the HP cap hides), past every floor */
  { name: 'one damage roll in the run is five points higher', only: ['glade-4'],
    edits: [['src/core/hunt/damage.js', '  let amount = rollAttack(sc.rng, accuracy, maxHit);\n',
      "  let amount = rollAttack(sc.rng, accuracy, maxHit);\n  if (amount > 0 && t.side === 'mon' && t.hp > 2 * amount + 20 && ++globalThis.__parityRolls === 1) amount += 5;\n"]],
    before: () => { globalThis.__parityRolls = 0; } },
  /* the amount pipeline (lane/stage3-pipeline): one blow on the scale one point higher moves muster-steps-4's pin */
  { name: 'one pipeline blow on the scale is one point higher', only: ['muster-steps-4'],
    edits: [['src/core/hunt/amount.js', '  const n = Math.max(1, Math.round(base * mult * (roll / 1000) * ratioOf(steps)));\n',
      "  const n = Math.max(1, Math.round(base * mult * (roll / 1000) * ratioOf(steps))) + (++globalThis.__pipeBlows === 40 ? 1 : 0);\n"]],
    before: () => { globalThis.__pipeBlows = 0; } },
  /* the optimizations, each broken (lane/r-engine-profile): every one must move the pin, or the pin does not hold it */
  { name: 'a ranged hero\'s spot search forgets the monsters beside a tile (roles.js besideNear)', only: ['glade-4'],
    edits: [['src/core/hunt/roles.js', 'const near = mons.filter((m) => cheb(m, c) <= r + 1);', 'const near = [];']] },
  { name: 'a spot search reads no other hero\'s claimed spot (movement.js claimsOf)', only: ['warrens-4', 'glade-4'],
    edits: [['src/core/hunt/movement.js', "if (v !== hero && v.alive && isHero(v) && v.spot) out.push(v.spot);", "if (v !== hero && v.alive && isHero(v) && v.spot) out.length = 0;"]] },
  { name: 'the band asked first is a step closer than the spot rule\'s (roles.js onBand)', only: ['glade-4'],
    edits: [['src/core/hunt/roles.js', 'const onBand = (x, y) => inBand((x - tgt.x) * (x - tgt.x) + (y - tgt.y) * (y - tgt.y), want);',
      'const onBand = (x, y) => inBand((x - tgt.x) * (x - tgt.x) + (y - tgt.y) * (y - tgt.y), want - 1);']] },
  { name: 'A* breaks a tie by the newest entry (grid.js heap)', only: ['warrens-4', 'glade-4'],
    edits: [['src/core/hunt/grid.js', '(a[1] === b[1] && a[2] < b[2])', '(a[1] === b[1] && a[2] > b[2])']] },
  { name: 'A* takes "too big to tell" for "sealed off" (grid.js sealedOff)', only: ['warrens-4', 'glade-4'],
    edits: [['src/core/hunt/grid.js', '      if (seen.size >= budget) return false;', '      if (seen.size >= budget) return true;']] },
  { name: 'the basic attack takes the last monster in range (targeting.js basicTarget)', only: ['glade-4'],
    edits: [['src/core/hunt/targeting.js', 'if ((cmp(a, b) || dist2(a, u) - dist2(b, u) || a.id - b.id) < 0) bi = i;', 'if ((cmp(a, b) || dist2(a, u) - dist2(b, u) || a.id - b.id) > 0) bi = i;']] },
  /* part 2: a writer that forgets the index (the audit planted beside it throws on the first stale answer). A death is read
     again in its own sub-step; a pull is mostly read again only after the sub-step drops the index anyway, so it runs with the
     sub-step's drop taken out too. A retarget moves a list only when it drops a target (no leader to turn on), which these
     hunts never meet: tests/hunt-core/targeting.mjs an-indexed-retarget-is-read-at-once holds that writer. */
  { name: 'a death leaves the index standing (pull-cycle.js fallen)', only: ['warrens-4'],
    edits: [AUDIT, ['src/core/hunt/pull-cycle.js', '  u.target = null;\n  staleIndex(inst);\n', '  u.target = null;\n']] },
  { name: 'a pull leaves the index standing, past the sub-step (pull-cycle.js startPull)', only: ['warrens-4'],
    edits: [AUDIT, ['src/core/hunt/pull-cycle.js', '  for (const m of packMonsters(inst, p)) m.target = aimOf(inst, m, k.id);\n  staleIndex(inst);\n', '  for (const m of packMonsters(inst, p)) m.target = aimOf(inst, m, k.id);\n'],
      ['src/core/hunt/world-step.js', '    inst.ix = null;\n', '']] },
  { name: 'the cast order is the list\'s, not the ids\' (abilities.js castOrder)', only: ['warrens-4', 'glade-4'],
    edits: [['src/core/hunt/abilities.js', '  return k ? [k, ...heroes.filter((u) => u !== k)] : heroes;', '  return k ? [...heroes.filter((u) => u !== k), k] : heroes;']] },
];

const PICK = process.argv.includes('--no-mutants') ? [] : mutants;
for (const mu of PICK) {
  const p = plant(mu.edits, [...PLAY_TREES, 'tests/hunt-core/fixtures']);
  try {
    let caught = null;
    /* the planted AUDIT throws by design: its throw is the index-audited rule's line, named so; any other throw is HARNESS (lane/c-hollow-proofs) */
    try { if (mu.before) mu.before(); caught = against(await loadPlay(p.root), PIN, mu.only); } catch (e) { caught = (/^unit-index audit: /.test(e.message) ? 'index-audited: ' : 'threw ') + e.message; }
    R.ok(caughtBy(caught), 'mutant "' + mu.name + '" was NOT caught' + missWhy(caught));
    if (caught && process.argv.includes('--verbose')) console.log('  caught: ' + mu.name + ' -> ' + caught);
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + names.length + ' scenarios hold their pin, ' + PICK.length + ' mutants caught');
R.finish();
