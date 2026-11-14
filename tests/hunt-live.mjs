#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-live.mjs — THE BROWSER'S LIVE HUNT IS THE SERVER'S HUNT, PREDICTED.
//
//   node tests/hunt-live.mjs            the rules
//   node tests/hunt-live.mjs --mutate   every planted defect must turn its rule RED
//   node tests/hunt-live.mjs --mutate --only LV-HOLD   just the mutants whose name holds that text
//
// mutant-anchors: src/hunt-view/live-engine.js src/core/combat-sim.js supabase/functions/hr-accrue/hunt-settle.js supabase/functions/hr-accrue/accrual.js src/hunt-view/timeline.js src/core/hunt/roles.js src/core/hunt/targeting.js src/core/member.js src/core/hunt/pull-cycle.js src/core/hunt/leash.js src/core/hunt/boss-phases.js src/core/hunt/damage.js src/core/hunt/monster-spells.js src/core/hunt/marks.js
// mutant-writes-tree: no — mutants are planted into a temp copy of src/ and the edge
// mutant-rule-functions: rules
// mutant-runner-functions: mutate main
//
// Option B (Tyler 2026-10-19). The edge settles a hunt instance in commits of at
// least 15 s (accrual.js accrueHunt); the browser runs the same engine live from
// the server's start point (hunt-settle.js huntLive) with the combat seeds the
// server sends (src/hunt-view/live-engine.js).
//
//   LV-D  DETERMINISM: from the same start point and seeds, the browser's swings
//         produce byte-identical tracks and events to the server's commits, and its
//         world hash matches every commit's hunt_check, across seed refreshes, for
//         N seconds of a solo hunt and of a two-hero party (whose both heroes stand
//         in the instance for the whole run).
//   LV-L  LOOT IS NOT FORESEEABLE: the drops the browser's engine would roll (its
//         member sinks) are not the drops the server's commits paid; hunt_live
//         carries no drop-stream seed. (Mutant: drops rolled on the combat stream.)
//   LV-M  MELEE HOLDS: the engine's lone knight changes tile no more often per kill than the
//         frozen sim's (measured) and almost never steps back and forth between swings (a step out and
//         straight back with no kill between; in to pull and out once the pack is dead is not one).
//   LV-CALL A CALLED ROOM, VIEWED: the browser plays his two lines and his adds as the server's commits do, to the kill.
//   LV-DOWN EVERY PACK DOWN, THE LEADER WALKS ON (report #69): a knight that outruns the Cellar's respawn
//         never stands on the pocket it cleared, browser closed (every swing's commit) and viewed (every
//         commit matches the prediction).
//   LV-P  PARTY PRIVACY (Tyler 2026-10-20): a peer's row is exactly its frozen numbers
//         (src/core/member.js FROZEN_KEYS / FROZEN_SESSION_KEYS): no skills, gear, perks,
//         buffs, purse, premium or bestiary; the viewer's own row stays whole.
//   LV-K  THE LEADER CHOOSES (Tyler 2026-10-20): a party whose leader (seat 1, a peer of the
//         viewer) picked 7 and the viewer 3 runs 7 on the server, and the viewer's browser
//         predicts that pull (every commit matches): the peer's frozen hero carries `lead`.
//   LV-B  A FULL BOX IS PULLED, VIEWED (Andy 10-20): a Thicket duo at its leader's 8 (the member never
//         picked) pulls the designer's ring of 8 from its edge and kills it; every commit matches.
//   LV-OPEN THE OPEN GROUND (Tyler + Andy 10-25: "the tank doesn't stand next to the wall"): a lone tank pulls the
//         cellar's first pack of 8 from the pack area's edge; browser closed, every server commit from 32 s has all 8
//         of his tiles held by his pack (7 before); viewed, every commit matches the prediction (same tiles, same seed).
//   LV-RING THE RING'S ROOMY SIDE (Andy #64, "tank would have wanted to stand 1 sqm above"): at the Warrens' second
//         pocket a full ring (density 8) closes round its centre and the west edge, where the party walks in, feeds 7
//         box slots; the holder walks on to an edge that feeds 8 and pulls there. Browser closed: every server commit with
//         5+ of the pull on him at rest has all of them beside him (one or two queued before). Viewed: every commit matches.
//   LV-KITE A KITER'S PULL IS FOUGHT (Tyler 10-17: kiters never kite outside the area): a lone bow at the Warrens, pull 8, runs
//         round its pack to the area's edge and stays in it. Browser closed: no pack ever resets (seven in 120 s before, the
//         first 15 s in, each healing the pack to full). Viewed: every commit matches.
//   LV-H  THE LOOK-AHEAD (Tyler 2026-10-20): hunt_live sends liveSeeds (16) combat seeds,
//         one constant (src/data/hunt-tuning.js) the edge reads, and the leave horizon of
//         2026-10-31-live-horizon.sql is exactly liveSeeds x the swing.
//   LV-T  A SECOND TANK FIGHTS: with the pack on the leader, the second shield hero walks to its own
//         target and lands >= 60% of the leader's blows, never 3 s+ with nothing engaged beside it;
//         ONE tank holds a lap (the monsters swing only at the lap's holder), and over two laps
//         the browser's engine shows no mid-lap steal and the second tank taking the next lap.
//   LV-W  A RESTARTED INSTANCE (no world, swing counter kept) predicts from its first swing and
//         its first commit matches (v0.2.20: the browser asked for seed 0 of a list from 40 and
//         never started).
//   LV-S  A SETUP CHANGED MID-HUNT, BROWSER CLOSED (r10, Andy): with nobody watching, settings
//         changed while the hunt runs reach the server's next commit (the hero unit carries them);
//         every start point keeps one setup until it changes (live-engine.js sameSetup: no restart
//         per commit) and names the new one after (the viewed half: tests/hunt-scene-live.mjs LV-14).
//   LV-$  THE PLAYER'S STORE FOOD (Tyler 2026-10-19: the bar slot picks the store item,
//         never the hunt): a tank with no food of its own and an "Any food" slot naming
//         Salted Trout buys Salted Trout and nothing else, on the server's commits (the
//         browser closed) and in the browser's prediction (viewed), every commit matching.
//   LV-SHOT-SKILL a slot's ammo the hero's skill can't use yet (Mithril Arrows, Ranged 45, at Ranged 42): viewed and closed, neither
//             shot nor spent, the next slot flies, every commit matches (the settle half: tests/hunt-core/ranger-bar.mjs under-skill)
//   LV-WAITS  a slot's words read the engine's own test of the prediction's world (src/shell/slot-waits.js): held on a lone monster, free on two,
//             nothing to judge between pulls, and asked on every tick no commit moves
//   LV-RANGER A RANGER'S BAR (Andy 2026-10-23, Fremulon): a bow with NO ammo worn, a Copper Whetstone
//         slot ahead of its arrows: it shoots only its arrows (never the whetstone) and Precision Shot
//         casts on them, on the server's commits (browser closed) and in the prediction (viewed).
//   LV-NOFIGHT A HERO WHO CAN'T FIGHT GOES HOME (designer 10-31): a bare bow with the store shut ends no_fight at its
//         span on the server's commits; viewed, the prediction stops there too and every commit before it matches.
//   LV-SPELL A MONSTER'S GROUP STRIKE (Tyler 2026-11-08, lane/b-area-engine): every hero of a party of four, and a lone hero, is struck
//         at every landing wherever it stands, on the server's commits (browser closed); viewed, every commit matches and the browser
//         plays the server's own marks; a frost-resisting tank (gear resistPm, carried to a peer's browser in its frozen row) takes half.
//   LV-STAGGER THE FIRST CAST'S STAGGER, BOTH PATHS (Tyler 2026-11-08, lane/d-spell-tuning's SPELL_STAGGER): a pack of casters does not open
//         with every cast at once. Browser closed: on the server's commits the casters' first casts start at different instants, and the
//         same seed gives the same casts again. Viewed: every commit matches the prediction and the browser's casts are the server's, start
//         for start (the wait is drawn on the swing's own dice, which both sides hold).
//   LV-KINDS THE KRELL'S HOLD MONSTER KINDS, BOTH PATHS (the design's engine pieces 2, 3 and 4): a Cellar wasp that shoots from range, a
//         slime that mends its pull, and two Melee heroes that name a kind first. Browser closed: the server's commits show each (most wasp
//         blows from range, mends landed, the wasp-first hero on a wasp). Viewed: every commit matches, every mend and wasp blow is the
//         browser's, and a peer's kind first reaches the browser in its frozen row. Each rule's mutants: tests/hunt-core/monster-kinds.mjs.
//   LV-AREA A HERO'S AREA ABILITY, BOTH PATHS (Tyler 2026-11-08, lane/b-area-set): a sword alone with Turning Cut beside a tank, watched by
//         the TANK, so the caster is the browser's frozen peer. Browser closed: the server's commits cast it and it strikes for a share of
//         the caster's own blow; a hero under its unlock level never casts it. Viewed: every commit matches the prediction both ways (the
//         peer's level and its largest blow reach the browser in its frozen row).
//   LV-RR THE PARTY'S RARE ROLL IS THE SERVER'S (Tyler L8; rulings: loot rolls use a server-only
//         stream): with every monster carrying rare rows, the server's commits roll rares
//         (`rare_roll`, each Crown Shard to its winner) and the browser's prediction, which
//         runs the loot stream on a constant, never feeds a `rare_roll` of its own; and every
//         commit still matches the prediction (the roll's rotation is server-only: world-state.js
//         reconcileText leaves it out of the reconcile key, so an hourly party Rare never re-seeds).
//   LV-G  A LONG HUNT COSTS WHAT A SHORT ONE DOES: per settle, the server's input, stored world
//         and engine work in a 40-min hunt's last 10 min stay within 2x its first 10 min's; the
//         browser holds at most 2x the look-ahead in combat seeds (they grew with the hunt's age).
//   LV-Q  ONE DEATH STOPS THE PARTY: from the sub-step a hero dies nobody acts again, browser
//         closed and viewed (live v0.2.23, Andy: "2nd char starts to run away after death").
//   LV-HOLD ONE TANK HOLDS (Tyler 2026-10-22): the leader's pick holds every lap from the first, browser
//         closed (the server's commits) and viewed (every commit matches; a peer's frozen hero carries
//         `hold`); a change mid-hunt takes force at the lap boundary, never mid-lap.
//   LV-N  A RESTART NAMES WHAT IT PLACES (Andy 10-22, null sprites): a reseed drawn before the start
//         point's next swing (it runs none) still gives every unit it places a kind and a bar, and a unit
//         spawning in a catch-up's last swing after the eased instant is named too (Andy #65).
//   LV-4P ANDY'S OWN PARTY, EVERY HERO VIEWED (#64/#65, live v0.2.45 "match 0"): four heroes of one account at
//         the Warrens on their default bars (scaled spells, store runes, food, drink; a Ranger's carried and
//         bought arrows): viewing each in turn, every commit matches the prediction; the server's commits
//         are the same with the browser closed (a peer's frozen `lv` and `shots`, src/core/member.js).
//   LV-PULL THE HOLDER PULLS (bug #61, Andy's party): under Take turns the lap's holder, under "One tank
//         holds" the pick, switched only when the lap ends; no tank yanks a pack, browser closed and viewed.
//   LV-TGT "STRONGEST" AND "FOLLOW" ON A MIXED PACK (Andy a08): a follower stands on the leader's monster, a
//         Strongest hero on the strongest kind engaged, browser closed (the server's boundaries) and viewed (every
//         commit matches; the browser plays their blows as the server's commits hold them).
//   LV-SCALE A SCALED HUNT, VIEWED (lane/c-scaled-hunts; Tyler 2026-11-07 "party would scale to the leader"): the Cellar played at
//         Level 50 (src/core/combat-sim.js huntPlayOf, the server's scale on the start point): every commit matches the prediction,
//         solo and in a pair viewed from the member (its leader a frozen peer, rolled against the scaled rows); the server's
//         monsters stand at the scaled rows' health; against the same pair unscaled a kill pays 2x the Level XP and coin, and a
//         monster lands a blow no catalogue Cellar monster can. The settle's half (the bank, the bounds, browser closed):
//         tests/scaled-hunts-server.mjs.
//   LV-EVENT A LIVE EVENT, VIEWED (lane/c-live-events; src/core/live-events.js): a pair on the Cellar, the peer leader's account inside a
//         +25% Level XP window for 40 s of the run (the server's windows on the start point, hunt_live.instance.live_xp): every commit
//         matches, every `xp` event the server played is the browser's (the event's part `ev` included), a kill pays its dial by its own
//         time (inside the window only, the windowless viewer never), and the leader's Level XP over the window is the event's x1.25.
//   LV-R  RECONCILE: a prediction forced off the server's world is judged
//         `diverged` at the next commit, and the reseed eases every unit onto its true
//         tile with no frame moving a unit more than one tile.
//   LV-CLASS PARTY LEVEL XP (Tyler 2026-10-31: better only with different classes): a mixed pair earns the table's
//         factor and a same-class pair its own smaller cell, on the server's commits (browser closed, one long settle) and
//         viewed (the prediction's own `xp` events), the same XP on every path; every commit matches. The swing the
//         prediction runs past the last commit shows what the server's next commit pays.
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, mkdtempSync, cpSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isMain } from './_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FN = 'supabase/functions/hr-accrue';
const clone = (o) => JSON.parse(JSON.stringify(o));
const SECRET = '-4611686018427387904';
const T0 = Date.UTC(2026, 9, 19, 15, 33, 17, 447);

async function load(base) {
  const u = (p) => import(pathToFileURL(join(base, p)).href);
  /* the engine's own instance of a src/** module: src/core imports src/data with the build's ?v= (CLAUDE.md §5) */
  const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(base, 'src/build-info.js'), 'utf8')) || [, ''])[1];
  return {
    ENGINE_MONSTERS: (await import(pathToFileURL(join(base, 'src/data/monsters.js')).href + V)).MONSTERS,
    /* the engine's own spell table (LV-SPELL plants a test row and takes it back) */
    ENGINE_SPELLS: (await import(pathToFileURL(join(base, 'src/data/monster-spells.js')).href + V)).MONSTER_SPELLS,
    /* the engine's own switch (the one row that turns every monster's spells on or off): LV-SPELL plays with it on, whichever way it ships */
    ENGINE_SPELL_SWITCH: (await import(pathToFileURL(join(base, 'src/data/monster-spells.js')).href + V)).SPELL_SWITCH,
    ENGINE_MS: await import(pathToFileURL(join(base, 'src/data/monster-spells.js')).href + V),
    /* the engine's own first-cast stagger row (LV-STAGGER plays it as shipped) */
    ENGINE_SPELL_STAGGER: (await import(pathToFileURL(join(base, 'src/data/monster-spells.js')).href + V)).SPELL_STAGGER,
    ENGINE_ELEMENTS: await import(pathToFileURL(join(base, 'src/core/elements.js')).href + V),
    /* the engine's own tier rows (LV-DIAL swaps one for a what-if and puts it back) */
    ENGINE_TIERS: (await import(pathToFileURL(join(base, 'src/data/hunt-tiers.js')).href + V)).GROUND_TIERS,
    /* the engine's own ability rows (LV-AREA reads Turning Cut's unlock and share off them) */
    ENGINE_ABILITIES: (await import(pathToFileURL(join(base, 'src/data/abilities.js')).href + V)).ABILITIES,
    /* the engine's own blow and to-hit (deadlyRows builds its rows with them) */
    ENGINE_COMBAT: await import(pathToFileURL(join(base, 'src/core/combat.js')).href + V),
    /* the engine's own scaled-hunt play (LV-SCALE reads the rows a scaled Cellar fights with) */
    ENGINE_SIM: await import(pathToFileURL(join(base, 'src/core/combat-sim.js')).href + V),
    HGR: await u('src/data/hunt-grounds.js'),
    base,
    AC: await u(FN + '/accrual.js'),
    HS: await u(FN + '/hunt-settle.js'),
    LE: await u('src/hunt-view/live-engine.js'),
    HSD: await u('src/data/hunt-sessions.js'),
    TL: await u('src/hunt-view/timeline.js'),
    HT: await u('src/core/hunt-track.js'),
    HG: await u('src/core/hunt-ground.js'),
    GR: await u('src/core/hunt/grid.js'),
    LS: await u('src/core/hunt/leash.js'),
    SPAWN: await u('src/core/hunt-spawn.js'),
    SB: await u('src/data/supply-basics.js'),
    XP: await u('src/core/xp.js'),
    MB: await u('src/core/member.js'),
    HR: await u('src/data/hunt-roles.js'),
    PCX: await u('src/data/party-class-xp.js'),
    TUNE: (await u('src/data/hunt-tuning.js')).HUNT_TUNING,
    CB: (await u('src/core/combat.js')).COMBAT_BALANCE,
    WS: await u('src/core/hunt/world-state.js'),
    ITEMS: (await u('src/data/items.js')).ITEMS,
    MONSTERS: (await u('src/data/monsters.js')).MONSTERS,
  };
}

/* One member's engine input, in the shape hunt-settle.js memberInput builds. */
function memberOf(M, user, seat, role, level) {
  const basics = {};
  for (const b of M.SB.BASIC_SUPPLIES) basics[b.id] = { kind: b.kind, price: b.price, heals: b.heals || 0, mana: b.mana || 0, partner: b.partner };
  const weapon = { tank: 'bronze_sword', melee_dps: 'stone_maul', ranger: 'shortbow' }[role] || 'bronze_sword';
  const L = level || 6;
  return {
    key: user + ':0', user, slot: 0, seat, unitId: null, sessionId: 's-' + user, version: 1, huntId: 'mill_cellar',
    huntSession: { id: 's-' + user, instanceId: 'i-live', huntFromMs: T0, nextSwingAtMs: T0, swingIndex: 0, bag: { cooked_shrimp: { loaded: 30, left: 30, essential: true } },
      staminaMs: 8 * 3600000, staminaMaxMs: 8 * 3600000, basics,
      goldFloor: 0, supplySource: 'mine', onEmpty: 'switch', cover: {} },
    skills: { melee: M.XP.skillXpForLevel('melee', L), defense: M.XP.skillXpForLevel('defense', L), ranged: M.XP.skillXpForLevel('ranged', L), magic: 0, inner_flame: 0 },
    levelXp: M.XP.charXpForLevel(L), xpFrac: null, hp: 1e6, gold: 500, equipment: role === 'tank' ? { weapon, shield: 'practice_shield' } : { weapon }, inventory: {}, buffs: [], perks: null,
    deathsTodayBefore: 0, deathsLifetimeBefore: 0, hearthfindReady: false,
    /* LEAVE TOGETHER (Tyler 2026-10-22): every hero's box "Leave if anyone leaves the hunt or dies" is on, the server's
       default (player_state.party_leave_together), so a partner's death sends this hero home (LV-Q, LV-E). */
    /* (the SHIELD makes the tank, Tyler 2026-10-23: a tank's key is the shield's, a sword alone plays Melee damage) */
    hero: M.SPAWN.heroSetup({ weaponType: role === 'ranger' ? 'ranged' : role === 'melee_dps' ? 'hammer' : 'shield', options: {}, bar: [], partyRoles: ['tank', 'melee_dps'], leaveTogether: true }),
  };
}

/* A DEADLY CASE BUILT FROM DATA (LV-Q; tests/perf-budget.mjs's death scene). Every monster the ground of `hunt` fields,
   priced as the engine prices a blow (combat.js monsterMaxHit, monsterAccuracy): a blow of at least 1/`share` of the max
   HP of `mi` and, when `hit` is given, a to-hit of at least `hit` against its defence (member.js memberSide, the settle's own numbers). Only ever
   raised, never the rows' own numbers, so a ground the formula softens or reshapes still kills. `put()` and `back()` lift
   and restore the engine's own rows (and this harness's copy); `rows` is what to lift on another copy (the page's). */
function deadlyRows(M, hunt, mi, o) {
  const share = (o && o.share) || 6, hit = o && Number.isFinite(o.hit) ? o.hit : null;
  const side = M.MB.memberSide(mi, { items: M.ITEMS });
  const hp = side.state.playerMaxHp, def = side.member.snapshot(side.state).def;
  const kinds = [...new Set(M.HG.huntGroundOf(hunt).ground.pockets.flatMap((p) => [...(p.spawns || []), ...(p.pack || [])].map((s) => s.monster || s)))]
    .filter((k) => M.ENGINE_MONSTERS[k]);
  const C = M.ENGINE_COMBAT, rows = {}, was = {};
  for (const id of kinds) {
    const r = M.ENGINE_MONSTERS[id];
    let atk = r.atk || 1;
    while (C.monsterMaxHit({ ...r, atk }) * share < hp) atk++;
    const base = Number.isFinite(r.baseAcc) ? r.baseAcc : C.COMBAT_BALANCE.monsterBaseAccuracy;
    const lift = hit === null ? 0 : Math.max(0, Math.ceil((hit - C.monsterAccuracy({ ...r, atk }, def)) * 100) / 100);
    rows[id] = lift > 0 ? { atk, baseAcc: Math.round((base + lift) * 100) / 100 } : { atk };
    was[id] = { atk: r.atk, baseAcc: r.baseAcc };
  }
  const set = (list) => { for (const [id, x] of Object.entries(list)) for (const book of [M.ENGINE_MONSTERS, M.MONSTERS]) {
    for (const [k, v] of Object.entries(x)) { if (v === undefined) delete book[id][k]; else book[id][k] = v; } } };
  return { rows, hp, def, put: () => set(rows), back: () => set(was) };
}

/* The server: the instance row and its members, settled by accrueHunt in commits. */
function server(M, mis, o) {
  /* `o` (tests/hunt-scene-live.mjs LV-9): another ground, instance id and start instant */
  const hunt = (o && o.hunt) || 'mill_cellar', t0 = (o && o.t0) || T0;
  const where = M.HG.huntGroundOf(hunt);
  const inst = { id: (o && o.id) || 'i-live', hunt, world: null, settled_to_ms: t0, next_swing_at_ms: t0, world_swing: 0, secret: SECRET };
  /* LV-SCALE: the server's scale of this instance (hunt-settle.js scalePlanOf's `play`; the hours never run out here) */
  inst.play = { level: (o && o.scale) || null, restart: false, stopMs: Infinity };
  const drops = {}, buys = {};
  return {
    inst, drops, buys,
    live: (user, slot) => M.HS.huntLive(inst, mis, user, slot || 0),
    commit(to) {
      const r = M.AC.accrueHunt({ instance: { id: inst.id, nextSwingAtMs: inst.next_swing_at_ms, world: inst.world, worldSwing: inst.world_swing },
        window: { fromMs: inst.settled_to_ms, toMs: to }, secret: SECRET, ground: where.ground, grid: where.grid,
        items: M.ITEMS, monsters: (o && o.monsters) || M.MONSTERS, members: mis, ...(inst.play.level ? { scale: { level: inst.play.level } } : {}) });
      if (!r.accrued) return null;
      const tl = M.HT.huntTimeline(r.track, r.events, inst.settled_to_ms, r.settledTo, to, r.units);
      for (const p of r.members) {
        const mi = mis.find((x) => x.key === p.key);
        const h = p.hunt;
        mi.huntSession = Object.assign({}, mi.huntSession, { swingIndex: h.swing_to, nextSwingAtMs: Date.parse(h.next_swing_at), staminaMs: h.stamina,
          bag: Object.fromEntries(Object.entries(mi.huntSession.bag).map(([id, l]) => [id, { ...l, left: (l.left ?? l.loaded) - (h.uses[id] || 0) }])) });
        mi.unitId = h.unit_id; mi.hp = p.delta.hp;
        for (const [k, v] of Object.entries(p.delta.xp || {})) mi.skills = { ...mi.skills, [k]: (mi.skills[k] || 0) + v };
        mi.levelXp += p.delta.level_xp || 0;
        mi.gold += p.delta.gold || 0;
        for (const [id, n] of Object.entries(p.delta.items || {})) drops[id] = (drops[id] || 0) + n;
        for (const [id, n] of Object.entries(h.buys || {})) buys[id] = (buys[id] || 0) + n;
      }
      inst.world = r.world; inst.settled_to_ms = r.settledTo; inst.next_swing_at_ms = r.settledTo; inst.world_swing = r.worldSwingTo;
      return { tl, ends: r.members.map((p) => p.hunt.ended).filter(Boolean), check: { world_swing: r.worldSwingTo, settled_to_ms: r.settledTo, world_hash: M.HT.worldHash(r.world), seeds: M.HS.liveSeeds(inst, r.worldSwingTo) } };
    },
  };
}

/* N seconds of one instance: the browser predicting swing by swing, the server committing every 16 s. */
function run(M, mis, spanMs, opt) {
  const o = opt || {};
  const srv = server(M, mis, o.server);
  const E = M.LE.createLiveEngine({ items: M.ITEMS, monsters: (o.server && o.server.monsters) || M.MONSTERS });
  E.seed(srv.live(o.viewer ? o.viewer.user : mis[0].user, o.viewer ? o.viewer.slot : 0));
  const fed = { steps: [], events: [] };
  const heroesSeen = new Map();
  const verdicts = [];
  const every = o.commitMs || 16000;
  let starvedMs = 0;
  for (let t = T0; t <= T0 + spanMs; t += 100) {
    E.advance(t, (b) => {
      for (const s of b.track) fed.steps.push(s);
      for (const e of b.events) fed.events.push(e);
      if (o.feed) o.feed(b);
    });
    if (o.tamperAt && t === o.tamperAt) o.tamper(E, srv);
    if ((t - T0) % every === 0 && t > T0) {
      const c = srv.commit(t);
      if (c) {
        const v = E.reconcile(c.check);
        verdicts.push({ t, v, tl: c.tl });
        if (o.onCommit) o.onCommit({ t, v, c, E, srv });
      }
    }
    if (o.onTick) o.onTick({ t, E });
    if (!E.running()) starvedMs += 100;
  }
  return { srv, E, fed, verdicts, heroesSeen, starvedMs };
}

/* A MONSTER'S SWINGS, NEVER ITS SPELLS (lane/b-area-data: the monsters' spells on the real grounds). A spell's hits land in the
   sub-step its `spell_end` (why 'landed') closes, from its caster (monster-spells.js land: the caster swings in no sub-step of
   its windup), so `events` less every dmg and miss at that caster in that sub-step. A group spell strikes every hero by design
   (Tyler 2026-11-08): it is no swing off the lap's holder. */
function swingsOnly(events) {
  const landed = new Set(events.filter((e) => e.type === 'spell_end' && e.why === 'landed').map((e) => e.u + '@' + e.atMs));
  return events.filter((e) => !((e.type === 'dmg' || e.type === 'miss') && landed.has(e.u + '@' + e.atMs)));
}

/* Run `fn` with no monster casting (the engine's own rows: LV-SPELL's table, put back after), for an arm whose subject is not
   the spells and whose party cannot live through them. */
function withoutSpells(M, fn) {
  const kept = Object.entries(M.ENGINE_MONSTERS).filter(([, m]) => Object.prototype.hasOwnProperty.call(m, 'spells')).map(([k, m]) => [k, m.spells]);
  for (const [k] of kept) delete M.ENGINE_MONSTERS[k].spells;
  try { return fn(); } finally { for (const [k, s] of kept) M.ENGINE_MONSTERS[k].spells = s; }
}

function rules(M) {
  const fails = [];
  const ok = (id, cond, msg) => { if (!cond) fails.push(id + ': ' + msg); };
  /* the engine's own stamp: the live engine re-times each step for drawing (live-engine.js timeSteps) */
  const key = (s) => s.u + ',' + s.x + ',' + s.y + ',' + (s.stampMs ?? s.atMs);
  const ekey = (e) => JSON.stringify(e);

  const cast = { solo: () => [memberOf(M, 'a', 0, 'tank', 6)], party: () => [memberOf(M, 'a', 0, 'tank', 6), memberOf(M, 'b', 1, 'melee_dps', 6)] };
  for (const [name, mis] of [['solo', cast.solo()], ['party', cast.party()]]) {
    const r = run(M, mis, 160000);
    /* THE SHORT LOOK-AHEAD NEVER STALLS: 16 seeds (32 s) outlive a commit every 16 s, and one every 30 s. */
    const late = run(M, cast[name](), 160000, { commitMs: 30000 });
    /* the control: commits further apart than the look-ahead DO stall, so the measure can see one */
    const starved = run(M, cast[name](), 160000, { commitMs: 48000 });
    ok('LV-D', starved.starvedMs > 0, `${name}: CONTROL: commits every 48 s never ran the 32 s look-ahead dry`);
    ok('LV-D', r.starvedMs === 0 && late.starvedMs === 0, `${name}: the prediction stalled out of seeds for ${r.starvedMs} ms (16 s commits) / ${late.starvedMs} ms (30 s commits)`);
    console.log(`  LV-D ${name} look-ahead: ${M.TUNE.liveSeeds} seeds; stalled ${r.starvedMs} ms at 16 s commits, ${late.starvedMs} ms at 30 s commits (control: ${starved.starvedMs} ms at 48 s)`);
    const bad = r.verdicts.filter((x) => x.v !== 'match');
    ok('LV-D', r.verdicts.length >= 9 && bad.length === 0, `${name}: ${bad.length} of ${r.verdicts.length} commits did not match the prediction (${bad.slice(0, 3).map((x) => x.t - T0 + ':' + x.v).join(', ')})`);
    const fedSteps = new Set(r.fed.steps.map(key)), fedEvents = new Set(r.fed.events.map(ekey));
    let missS = 0, missE = 0, nS = 0, nE = 0;
    for (const x of r.verdicts) {
      for (const s of x.tl.hunt_track) { nS++; if (!fedSteps.has(key(s))) missS++; }
      for (const e of x.tl.hunt_events) { nE++; if (!fedEvents.has(ekey(e))) missE++; }
    }
    console.log(`  LV-D ${name}: ${r.verdicts.length} commits, ${r.verdicts.filter((x) => x.v === 'match').length} matched; server ${nS} steps / ${nE} events, browser-missing ${missS} / ${missE}`);
    ok('LV-D', nS > 50 && nE > 50 && missS === 0 && missE === 0, `${name}: of the server's ${nS} steps and ${nE} events, ${missS} steps and ${missE} events were not the browser's`);
    if (name === 'party') {
      const heroes = new Set(r.fed.steps.filter((s) => [mis[0].unitId, mis[1].unitId].includes(s.u)).map((s) => s.u));
      ok('LV-D', heroes.size === 2, `party: the browser's instance moved ${heroes.size} hero(es), want both`);
    }
    if (name === 'solo') {
      /* LV-L: what the browser's engine would have dropped is not what the server paid. */
      const live = M.HS.huntLive(r.srv.inst, mis, 'a', 0);
      ok('LV-L', !JSON.stringify(live).includes('"r"') && live.seeds.domain === 's', 'hunt_live carries a drop-stream seed');
      const E2 = M.LE.createLiveEngine({ items: M.ITEMS, monsters: M.MONSTERS });
      const srv2 = server(M, [memberOf(M, 'a', 0, 'tank', 6)]);
      E2.seed(srv2.live('a'));
      /* The same span on both sides: the whole seeded look-ahead (liveSeeds swings), the server's windows end-exclusive. */
      const SPAN = M.TUNE.liveSeeds * M.CB.tickMs;
      for (let t = T0; t < T0 + SPAN; t += 100) E2.advance(t, () => {});
      const predicted = E2.predictedDrops();
      for (let t = T0 + 16000; t <= T0 + SPAN; t += 16000) srv2.commit(t);
      const paid = srv2.drops;
      ok('LV-L', Object.keys(paid).length > 0, 'the control: the server paid no drops in ' + SPAN + ' ms');
      console.log(`  LV-L: server paid ${JSON.stringify(sorted(paid))}; the browser's engine would have dropped ${JSON.stringify(sorted(predicted))}`);
      ok('LV-L', JSON.stringify(sorted(predicted)) !== JSON.stringify(sorted(paid)), `the browser's engine foresaw the server's drops exactly (${JSON.stringify(sorted(paid))})`);
    }
  }

  { // LV-H: THE HONE, both paths (lane c-work-fixes 2026-10-22). The browser predicts the swing a whetstone
    // wears and the bonus it then loses exactly as the server settles it: one stone worn at swing 50 of 80.
    const mis = [Object.assign(memberOf(M, 'a', 0, 'tank', 30), { equipment: { weapon: 'bronze_sword', ammo: 'steel_whetstone' } })];
    mis[0].huntSession.bag.steel_whetstone = { loaded: 1, left: 1 };
    const r = run(M, mis, 160000);
    const bad = r.verdicts.filter((x) => x.v !== 'match');
    ok('LV-H', r.verdicts.length >= 9 && bad.length === 0, `${bad.length} of ${r.verdicts.length} commits did not match the prediction while a whetstone wore out`);
    const left = mis[0].huntSession.bag.steel_whetstone.left;
    ok('LV-H', left === 0, `the server left ${left} of 1 steel whetstone after 80 swings (one wears every fiftieth)`);
  }

  { // LV-X: the assembled member carries relicMult (server-side drop input; 1 when absent)
    const side = (mi) => M.MB.memberSide(mi, { items: M.ITEMS }).member;
    const a = side(Object.assign(memberOf(M, 'a', 0, 'tank', 6), { relicMults: { rat: 1.25 } }));
    const b = side(memberOf(M, 'a', 0, 'tank', 6));
    const c = side(Object.assign(memberOf(M, 'a', 0, 'tank', 6), { relicMults: { rat: 0.5, slime: 'x' } }));
    ok('LV-X', a.relicMult('rat') === 1.25 && a.relicMult('slime') === 1, `relicMult with a projection reads ${a.relicMult('rat')} / ${a.relicMult('slime')}`);
    ok('LV-X', b.relicMult('rat') === 1 && c.relicMult('rat') === 1 && c.relicMult('slime') === 1, 'an absent or invalid projection is not 1');
    const d = side(Object.assign(memberOf(M, 'a', 0, 'tank', 6), { relicMults: { rat: 3 } }));
    ok('LV-X', d.relicMult('rat') === 1.25, 'a relic multiplier over the stage-4 x1.25 is not clamped: ' + d.relicMult('rat'));
    /* the settle reads it from the member's OWN hr_state_of account_bestiary.relic_mult (never the request) */
    const src = readFileSync(join(M.base || ROOT, FN, 'hunt-settle.js'), 'utf8');
    ok('LV-X', /env\.account_bestiary\.relic_mult/.test(src), 'hunt-settle.js does not read account_bestiary.relic_mult');
  }

  { // LV-P: party privacy — a peer's row is its frozen numbers, nothing else; the viewer's own row is whole.
    const mis = [memberOf(M, 'a', 0, 'tank', 6), memberOf(M, 'b', 1, 'melee_dps', 6)];
    mis[1].perks = { rooms: { x: 1 } }; mis[1].buffs = [{ type: 'damage', until: '2030-01-01T00:00:00Z' }];
    const live = server(M, mis).live('a');
    const peer = live.members.find((m) => !m.self), own = live.members.find((m) => m.self);
    const keys = (o) => Object.keys(o || {}).sort().join(',');
    ok('LV-P', keys(peer) === 'frozen,key,seat,self,unitId', 'a peer row carries ' + keys(peer));
    ok('LV-P', keys(peer && peer.frozen) === M.MB.FROZEN_KEYS.slice().sort().join(','), 'a peer frozen row carries ' + keys(peer && peer.frozen));
    ok('LV-P', Object.keys((peer && peer.frozen && peer.frozen.session) || {}).every((k) => M.MB.FROZEN_SESSION_KEYS.includes(k)),
      'a peer session carries ' + keys(peer && peer.frozen && peer.frozen.session));
    const text = JSON.stringify(peer);
    for (const bad of ['"skills"', '"equipment"', '"perks"', '"buffs"', '"gold"', '"levelXp"', '"premium', '"relic', '"cover"', '"staminaMs"', '"xpFrac"']) {
      ok('LV-P', !text.includes(bad), 'a peer row leaks ' + bad);
    }
    ok('LV-P', !!own && !!own.skills && !!own.equipment && !!own.huntSession, "the viewer's own row is not its full setup");
    /* the frozen `lv` is the LEVEL of each skill the peer's bar reads (Andy #64), never its XP */
    const lv = (peer && peer.frozen && peer.frozen.lv) || null;
    const reads = M.MB.engineSkillsOf(mis[1].hero.slots);
    ok('LV-P', !!lv && reads.length > 0 && JSON.stringify(Object.keys(lv).sort()) === JSON.stringify(reads)
      && reads.every((k) => lv[k] === M.XP.levelOf(mis[1].skills, k)), `a peer's frozen lv is ${JSON.stringify(lv)} (want the levels of ${reads.join(', ')})`);
  }

  { // LV-A: ARMOUR WEIGHTS, BOTH PATHS (ruling K7): the PEER tank wears a mixed set (leather dodges, a plate helm
    // absorbs, a cloth belt wards); the server's settle lands its blows through that chain and the viewer's
    // browser, which holds only the peer's frozen numbers, predicts every commit.
    const mis = [memberOf(M, 'a', 0, 'melee_dps', 8), memberOf(M, 'b', 1, 'tank', 8)];
    mis[1].equipment = { weapon: 'bronze_sword', shield: 'practice_shield', helmet: 'bronze_helm', body: 'leather_body', pants: 'leather_pants', belt: 'apprentice_belt' };
    let dodges = 0, peerUnit = null;
    const r = run(M, mis, 96000, { onCommit: ({ c }) => {
      peerUnit = mis[1].unitId;
      dodges += c.tl.hunt_events.filter((e) => e.type === 'miss' && e.dodge === true && e.t === peerUnit).length;
    } });
    ok('LV-A', dodges > 0, 'the armoured peer tank dodged nothing in 96 s on the server (its armour never reached the fight)');
    const bad = r.verdicts.filter((x) => x.v !== 'match');
    ok('LV-A', r.verdicts.length >= 5 && bad.length === 0, `the viewer's browser did not predict the armoured peer: ${bad.length} of ${r.verdicts.length} commits diverged`);
  }

  { // LV-TEMPER: TEMPERING, BOTH PATHS (src/core/temper.js): a viewer and a peer tank in Iron at the Sewer, each with rungs. BROWSER
    // CLOSED: the server's commits land the rung's blows and the blows at the peer through it. VIEWED: the viewer's browser, which holds the
    // peer only as frozen numbers, draws the same parts of a point on the same swings, so it predicts every commit.
    const mk = (temper) => {
      const mis = [memberOf(M, 'a', 0, 'melee_dps', 20), memberOf(M, 'b', 1, 'tank', 20)];
      mis[0].equipment = { weapon: 'iron_sword', body: 'iron_platebody' };
      mis[1].equipment = { weapon: 'iron_sword', shield: 'practice_shield', body: 'iron_platebody', helmet: 'iron_helm' };
      for (const m of mis) { m.huntId = 'millrace_sewer'; if (temper) m.perks = { temper }; }
      return mis;
    };
    const fought = (temper) => {
      const mis = mk(temper), seen = [];
      let atPeer = 0;
      const r = run(M, mis, 96000, { server: { hunt: 'millrace_sewer' }, onCommit: ({ c }) => {
        for (const e of c.tl.hunt_events) { if (e.type === 'dmg' || e.type === 'heal') seen.push(e.type + e.u + e.t + e.amount); if (e.type === 'dmg' && e.t === mis[1].unitId) atPeer++; }
      } });
      return { r, seen: seen.join(), atPeer };
    };
    const plain = fought(null);
    ok('LV-TEMPER', plain.seen.length > 0 && plain.atPeer > 0, 'the fixture has no fight: ' + plain.atPeer + ' blows at the peer');
    for (const [why, temper] of [['Blows', { 'temper:blows:2': 5 }], ['Armor', { 'temper:armor:2': 5 }]]) {
      const got = fought(temper);
      ok('LV-TEMPER', got.seen !== plain.seen, why + ' changed nothing on the server');
      const bad = got.r.verdicts.filter((x) => x.v !== 'match');
      ok('LV-TEMPER', got.r.verdicts.length >= 5 && bad.length === 0, `the viewer's browser did not predict a party with ${why} rungs: ${bad.length} of ${got.r.verdicts.length} commits diverged`);
    }
    /* A RUNG BOUGHT MID-HUNT: the next settle reads it, the browser's next start point carries it, and from there it predicts again. At most the one easing a purchase costs. */
    {
      const mis = mk(null);
      let after = 0, off = 0;
      const r = run(M, mis, 160000, { server: { hunt: 'millrace_sewer' }, onCommit: ({ t, v, E, srv }) => {
        if (t - T0 === 48000) for (const m of mis) m.perks = { temper: { 'temper:blows:2': 5, 'temper:armor:2': 5 } };
        if (t - T0 > 48000) { after++; if (v !== 'match') { off++; E.reseed(srv.live('a'), t); } }
      } });
      ok('LV-TEMPER', r.verdicts.length >= 9 && after >= 5, 'the mid-hunt fixture ran ' + after + ' commits after the purchase');
      ok('LV-TEMPER', off <= 1, 'after a mid-hunt purchase ' + off + ' of ' + after + ' commits diverged: the browser never took the rung from its start point');
      console.log('  LV-TEMPER a rung bought mid-hunt: ' + off + ' of ' + after + ' commits eased, then every one matched');
    }
  }

  { // LV-JEWEL: CRAFTED JEWELRY'S PERKS, BOTH PATHS (src/data/jewelry.js): a viewer in two Hallmarked Keen + Follow-through rings and a peer tank in
    // Surge + Follow-through and Keen + Surge, at the Sewer. BROWSER CLOSED: the server's commits land the extra crits and the second numbers. VIEWED:
    // the viewer's browser, which holds the peer only as frozen numbers (its followPm and surgePm ride the snapshot), predicts every commit.
    const mk = (rings) => {
      const mis = [memberOf(M, 'a', 0, 'melee_dps', 20), memberOf(M, 'b', 1, 'tank', 20)];
      mis[0].equipment = { weapon: 'iron_sword', body: 'iron_platebody', ...(rings ? { ring1: 'banded_signet_keen_follow', ring2: 'banded_signet_keen_follow' } : {}) };
      mis[1].equipment = { weapon: 'iron_sword', shield: 'practice_shield', body: 'iron_platebody', helmet: 'iron_helm',
        ...(rings ? { ring1: 'banded_signet_surge_follow', ring2: 'banded_signet_keen_surge' } : {}) };
      for (const m of mis) m.huntId = 'millrace_sewer';
      return mis;
    };
    const fought = (rings) => {
      const mis = mk(rings), seen = [];
      let follows = 0;
      const r = run(M, mis, 240000, { server: { hunt: 'millrace_sewer' }, onCommit: ({ c }) => {
        for (const e of c.tl.hunt_events) { if (e.type === 'dmg' || e.type === 'heal') seen.push(e.type + e.u + e.t + e.amount); if (e.type === 'dmg' && e.follow === true) follows++; }
      } });
      return { r, seen: seen.join(), follows };
    };
    const plain = fought(false), worn = fought(true);
    console.log('  LV-JEWEL server: ' + plain.seen.split(',').length + ' numbers plain, ' + worn.seen.split(',').length + ' in the rings, ' + worn.follows + ' follow-throughs; '
      + worn.r.verdicts.filter((x) => x.v === 'match').length + ' of ' + worn.r.verdicts.length + ' commits matched the prediction');
    ok('LV-JEWEL', plain.seen.length > 0 && plain.follows === 0, 'the fixture has no fight, or plain rings followed through (' + plain.follows + ')');
    ok('LV-JEWEL', worn.seen !== plain.seen && worn.follows > 0, 'the rings changed nothing on the server (' + worn.follows + ' follow-throughs)');
    const bad = worn.r.verdicts.filter((x) => x.v !== 'match');
    ok('LV-JEWEL', worn.r.verdicts.length >= 5 && bad.length === 0, `the viewer's browser did not predict a party in Hallmarked rings: ${bad.length} of ${worn.r.verdicts.length} commits diverged`);
  }

  { // LV-U: THE LEVEL SHARE, BOTH PATHS (lane/c-risk-ladder; hunt-grounds.js underFloorSharePm): a Level 12 viewer behind a Level 40 peer whose browser row holds only frozen numbers: the
    // low seat's cut share is what the server pays, viewed and browser closed, and what the browser predicts.
    const SPAN = 240000;
    const heroes = () => { const mis = [memberOf(M, 'a', 0, 'melee_dps', 12), memberOf(M, 'b', 1, 'tank', 40)]; for (const mi of mis) mi.huntId = 'mosslight_glade'; return mis; };
    const closedMis = heroes(), closedFrom = closedMis.map((m) => m.levelXp);
    server(M, closedMis, { hunt: 'mosslight_glade' }).commit(T0 + SPAN);
    const closedXp = closedMis.map((m, i) => m.levelXp - closedFrom[i]);
    const viewedMis = heroes(), viewedFrom = viewedMis.map((m) => m.levelXp);
    const batches = [];
    const r = run(M, viewedMis, SPAN, { server: { hunt: 'mosslight_glade', id: 'i-live' }, feed: (b) => batches.push(b) });
    const viewedXp = viewedMis.map((m, i) => m.levelXp - viewedFrom[i]);
    /* THE PREDICTION STANDS ONE SWING PAST THE LAST COMMIT (LV-CLASS's split, lane/b-ground-formula-fix): its xp is summed over the swings that
       commit settled, and the swing past it is held to the server's next commit. With the Glade's room as built for a pair (Tyler 2026-11-11,
       lane/c-brook-bear) a kill fell in that swing, and the whole-run sum read one kill's shares over the commits'. */
    const xpBy = (evList) => { const o = {}; for (const e of evList) if (e.type === 'xp') o[e.u] = (o[e.u] || 0) + e.amount; return viewedMis.map((m) => o[m.unitId] || 0); };
    const settled = r.srv.inst.settled_to_ms;
    const shownXp = xpBy(batches.filter((b) => b.toMs <= settled).flatMap((b) => b.events));
    const ahead = batches.filter((b) => b.fromMs >= settled);
    const aheadTo = Math.max(settled, ...ahead.map((b) => b.toMs));
    const aheadXp = xpBy(ahead.flatMap((b) => b.events));
    const next = r.srv.commit(aheadTo + 16000);
    const nextXp = xpBy(next ? next.tl.hunt_events.filter((e) => e.atMs < aheadTo) : []);
    console.log('  LV-U closed ' + closedXp + ', viewed ' + viewedXp + ', prediction ' + shownXp + ' (and ' + aheadXp + ' past the last commit, next commit ' + nextXp + ')');
    ok('LV-U', closedXp[1] > 0 && closedXp[0] > 0 && closedXp[0] < closedXp[1] * 0.3, 'the low seat earned ' + closedXp[0] + ' against the top seat\'s ' + closedXp[1] + ' with the browser closed');
    ok('LV-U', viewedXp.join() === closedXp.join(), 'viewed the server paid ' + viewedXp + ', with the browser closed ' + closedXp);
    ok('LV-U', shownXp.join() === closedXp.join(), 'the prediction shows ' + shownXp + ', the server pays ' + closedXp);
    ok('LV-U', aheadXp.join() === nextXp.join(), 'the prediction past the last commit shows ' + aheadXp + ', the next commit pays ' + nextXp);
  }

  { // LV-TIER: A HARDER HUNT, WATCHED (hunt-tiers.js; CLAUDE.md §6): the browser runs the same core on the frozen tier the leader's peer hero carries: every commit matches, and it's a harder fight than today's pull on the same dice.
    const worn = { tank: { weapon: 'steel_sword', shield: 'coppercap_shield', helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots' },
      melee_dps: { weapon: 'steel_warhammer', helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots' } };
    const two = (tier) => ['tank', 'melee_dps'].map((role, i) => {
      const mi = memberOf(M, 't' + i, i, role, 60); mi.huntId = 'mosslight_glade'; mi.gold = 50000; mi.hp = 1e9; mi.equipment = worn[role];
      mi.hero = Object.assign({}, mi.hero, { density: 8, lead: i === 1, ...(tier ? { tier } : {}) });
      return mi;
    });
    const taken = (r, mis) => r.fed.events.filter((e) => e.type === 'dmg' && [mis[0].unitId, mis[1].unitId].includes(e.t)).reduce((s, e) => s + (e.amount || 0), 0);
    const hard = two('deadly'), flat = two(null);
    const a = run(M, hard, 48000, { server: { hunt: 'mosslight_glade' } }), b = run(M, flat, 48000, { server: { hunt: 'mosslight_glade' } });
    const bad = a.verdicts.filter((x) => x.v !== 'match');
    ok('LV-TIER', a.verdicts.length >= 2 && bad.length === 0, `the viewer's browser did not predict the leader's Deadly: ${bad.length} of ${a.verdicts.length} commits diverged`);
    ok('LV-TIER', taken(a, hard) > taken(b, flat), `Deadly took ${taken(a, hard)} HP in the browser's fight and today's pull ${taken(b, flat)}: the fight is not harder`);
    console.log(`  LV-TIER Glade pair at the full box, 48 s: ${a.verdicts.length} commits, ${a.verdicts.length - bad.length} matched; HP taken ${taken(a, hard)} on Deadly, ${taken(b, flat)} at today's pull`);
  }

  { // LV-DIAL: A TIER'S HEALTH, WATCHED (hunt-tiers.js hpPm, lane/b-tier-dials; Tyler 2026-11-07: a tier is a % of difficulty). The Glade's Deadly
    // pull with the health dial alone (a what-if on the engine's own rows, put back after): the viewer's browser predicts every commit, and
    // every monster of the server's world stands at the dial's health, the same for any party size (Tyler 2026-11-08).
    const HP = 1500, rows = M.ENGINE_TIERS.mosslight_glade, was = rows.deadly;
    rows.deadly = { ...was, pull: [...was.pull], dmgPm: 1000, hpPm: HP, xpPm: 1000 };
    try {
      const worn = { tank: { weapon: 'steel_sword', shield: 'coppercap_shield', helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots' },
        melee_dps: { weapon: 'steel_warhammer', helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots' } };
      const mis = ['tank', 'melee_dps'].map((role, i) => {
        const mi = memberOf(M, 'd' + i, i, role, 60); mi.huntId = 'mosslight_glade'; mi.gold = 50000; mi.hp = 1e9; mi.equipment = worn[role];
        mi.hero = Object.assign({}, mi.hero, { density: 8, lead: i === 1, tier: 'deadly' });
        return mi;
      });
      const r = run(M, mis, 48000, { server: { hunt: 'mosslight_glade' } });
      const bad = r.verdicts.filter((x) => x.v !== 'match');
      ok('LV-DIAL', r.verdicts.length >= 2 && bad.length === 0, `the viewer's browser did not predict a Deadly with the health dial: ${bad.length} of ${r.verdicts.length} commits diverged`);
      const w = r.srv.inst.world ? M.WS.decode(JSON.parse(r.srv.inst.world)) : null;
      const dialHp = (u) => Math.max(1, Math.round((M.MONSTERS[u.kind].hp * HP) / 1000));
      const off = (w ? w.units : []).filter((u) => u.side === 'mon' && dialHp(u) !== u.maxHp);
      ok('LV-DIAL', !!w && w.units.some((u) => u.side === 'mon') && off.length === 0, `${off.length} monster(s) of the server's world stand off the dial's health: ${off.slice(0, 3).map((u) => u.kind + ' ' + u.maxHp).join(', ')}`);
      console.log(`  LV-DIAL Glade pair on Deadly at health x${HP / 1000}, 48 s: ${r.verdicts.length} commits, ${r.verdicts.length - bad.length} matched; ${w ? w.units.filter((u) => u.side === 'mon').length : 0} monsters at the dial's health`);
    } finally { rows.deadly = was; }
  }

  { // LV-SCALE: A SCALED HUNT, VIEWED (lane/c-scaled-hunts; src/core/combat-sim.js huntPlayOf). The Cellar played at Level 50, its Level 50
    // leader's paid scale: the browser predicts every commit from the start point's scale (solo, and a pair viewed from the member, its leader
    // a frozen peer rolled against the scaled rows); the server's world stands on the scaled rows; against the same pair unscaled a kill pays
    // more, and a scaled monster lands blows no Cellar monster of the catalogue can.
    const L = 50;
    const worn = { tank: { weapon: 'steel_sword', shield: 'coppercap_shield', helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots' },
      melee_dps: { weapon: 'steel_warhammer', helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots' } };
    const pair = (n) => ['tank', 'melee_dps'].slice(0, n).map((role, i) => {
      const mi = memberOf(M, 'sc' + i, i, role, L); mi.equipment = worn[role]; mi.gold = 50000;
      mi.hero = Object.assign({}, mi.hero, { lead: i === 0 });
      /* the leader swings at Melee 5, so its to-hit reads each monster's defense unclamped (0.72 on the catalogue's rows, 0.44-0.55 on
         the scaled): a frozen peer rolled against the wrong rows lands other blows */
      if (i === 0) mi.skills = Object.assign({}, mi.skills, { melee: M.XP.skillXpForLevel('melee', 5) });
      return mi;
    });
    const play = M.ENGINE_SIM.huntPlayOf('mill_cellar', { level: L });
    const ground = M.HG.huntGroundOf('mill_cellar').ground;
    /* the hardest blow any Cellar monster of the catalogue can swing (combat.js monsterMaxHit, before the hero's armor) */
    const catMax = Math.max(...Object.keys(play.monsters).filter((k) => play.monsters[k] !== M.ENGINE_MONSTERS[k]).map((k) => M.ENGINE_COMBAT.monsterMaxHit(M.ENGINE_MONSTERS[k])));
    const stats = (r, mis) => {
      const ev = r.verdicts.flatMap((x) => x.tl.hunt_events);
      const kills = ev.filter((e) => e.type === 'kill').length;
      const heroes = new Set(mis.map((mi) => mi.unitId).filter(Number.isInteger));
      const blows = ev.filter((e) => e.type === 'dmg' && heroes.has(e.t) && !e.dot).map((e) => e.amount);
      return { kills, xp: mis.reduce((a, mi) => a + mi.levelXp - M.XP.charXpForLevel(L), 0), gold: mis.reduce((a, mi) => a + mi.gold - 50000, 0),
        maxBlow: blows.length ? Math.max(...blows) : 0 };
    };
    for (const [name, n, viewer] of [['solo', 1, null], ['party', 2, { user: 'sc1', slot: 0 }]]) {
      const mis = pair(n);
      const r = run(M, mis, 64000, { server: { scale: L }, ...(viewer ? { viewer } : {}) });
      const bad = r.verdicts.filter((x) => x.v !== 'match');
      ok('LV-SCALE', r.verdicts.length >= 3 && bad.length === 0, name + ': ' + bad.length + ' of ' + r.verdicts.length + ' commits did not match the prediction');
      const w = r.srv.inst.world ? M.WS.decode(JSON.parse(r.srv.inst.world)) : null;
      const off = (w ? w.units : []).filter((u) => u.side === 'mon' && Math.max(1, play.monsters[u.kind].hp) !== u.maxHp);
      ok('LV-SCALE', !!w && w.units.some((u) => u.side === 'mon') && off.length === 0,
        name + ': ' + off.length + ' monster(s) of the server\'s world stand off the scaled rows\' health: ' + off.slice(0, 3).map((u) => u.kind + ' ' + u.maxHp).join(', '));
      if (name !== 'party') continue;
      const scaled = stats(r, mis), ownMis = pair(2), own = stats(run(M, ownMis, 64000, { viewer }), ownMis);
      const per = (x, k) => x[k] / Math.max(1, x.kills);
      ok('LV-SCALE', scaled.kills > 3 && per(scaled, 'xp') >= 2 * per(own, 'xp'), 'a scaled kill paid ' + per(scaled, 'xp').toFixed(1) + ' Level XP, the Cellar\'s own ' + per(own, 'xp').toFixed(1) + ' (want 2x)');
      ok('LV-SCALE', per(scaled, 'gold') >= 2 * per(own, 'gold'), 'a scaled kill paid ' + per(scaled, 'gold').toFixed(1) + ' coin, the Cellar\'s own ' + per(own, 'gold').toFixed(1) + ' (want 2x)');
      ok('LV-SCALE', scaled.maxBlow > catMax, 'a scaled monster\'s hardest blow landed ' + scaled.maxBlow + ', no more than a catalogue Cellar monster can swing (' + catMax + ')');
      console.log('  LV-SCALE Cellar pair at Level ' + L + ', 64 s: ' + r.verdicts.length + ' commits, ' + (r.verdicts.length - bad.length) + ' matched; a kill pays '
        + per(scaled, 'xp').toFixed(0) + ' Level XP and ' + per(scaled, 'gold').toFixed(1) + ' coin (own ' + per(own, 'xp').toFixed(0) + ' and ' + per(own, 'gold').toFixed(1)
        + '); the hardest blow landed ' + scaled.maxBlow + ' (a catalogue Cellar monster swings at most ' + catMax + ')');
    }
  }

  { // LV-SCALE-SPELL: A SCALED HUNT'S SPELLS HIT AT THE SCALED ROWS (audit 2026-11-13: monster-spells.js land read the catalogue row, so the
    // Sewer's Muck Fling hit at about 38% of the scaled swing). The Sewer at Level 50, unarmored heroes who cannot fall: browser closed
    // (the server's commits) and viewed (every commit matches the prediction), 240 s to reach the Toshers (the fifth pocket): a spell lands harder than the catalogue row's top can.
    const L = 30, HERO_L = 70, SPELL_ID = 'muck_fling';
    const play = M.ENGINE_SIM.huntPlayOf('millrace_sewer', { level: L });
    const catTop = M.ENGINE_MS.spellHit(M.ENGINE_COMBAT.monsterMaxHit(M.ENGINE_MONSTERS.kobold_tosher), M.ENGINE_MS.spellRow(SPELL_ID))[1];
    const scaledTop = M.ENGINE_MS.spellHit(M.ENGINE_COMBAT.monsterMaxHit(play.monsters.kobold_tosher), M.ENGINE_MS.spellRow(SPELL_ID))[1];
    const wasLive = M.ENGINE_SPELL_SWITCH.live;
    M.ENGINE_SPELL_SWITCH.live = true;
    try {
      for (const [name, n, viewer] of [['browser closed', 1, null], ['viewed', 2, { user: 'ss1', slot: 0 }]]) {
        const mis = ['tank', 'melee_dps'].slice(0, n).map((role, i) => {
          const mi = memberOf(M, 'ss' + i, i, role, HERO_L); mi.huntId = 'millrace_sewer'; mi.hp = 1e9; mi.gold = 50000; mi.equipment = { weapon: 'steel_warhammer' };
          mi.hero = Object.assign({}, mi.hero, { lead: i === 0 });
          return mi;
        });
        const r = run(M, mis, 240000, { server: { hunt: 'millrace_sewer', scale: L }, ...(viewer ? { viewer } : {}) });
        const hits = r.verdicts.flatMap((x) => x.tl.hunt_events).filter((e) => e.type === 'dmg' && e.ability === SPELL_ID).map((e) => e.amount);
        ok('LV-SCALE-SPELL', hits.length > 0 && Math.max(...hits) > catTop && Math.max(...hits) <= scaledTop,
          name + ': ' + hits.length + ' Muck Flings landed, the hardest ' + Math.max(0, ...hits) + ' (the catalogue row tops at ' + catTop + ', the scaled row at ' + scaledTop + ')');
        if (viewer) { const bad = r.verdicts.filter((x) => x.v !== 'match'); ok('LV-SCALE-SPELL', r.verdicts.length >= 5 && bad.length === 0, name + ': ' + bad.length + ' of ' + r.verdicts.length + ' commits did not match the prediction'); }
        console.log('  LV-SCALE-SPELL ' + name + ': ' + hits.length + ' Muck Flings, the hardest ' + Math.max(0, ...hits) + ' (catalogue top ' + catTop + ', scaled top ' + scaledTop + ')');
      }
    } finally { M.ENGINE_SPELL_SWITCH.live = wasLive; }
  }

  { // LV-EVENT: A LIVE EVENT, VIEWED (lane/c-live-events). The peer leader's account holds a +25% Level XP window for 40 s of a 64 s run; the
    // viewer's doesn't. The browser reads both from the start point and earns, kill by kill, what the server's commits pay.
    const W = [T0 + 20000, T0 + 60000, 1250];
    const pair = () => [memberOf(M, 'ev0', 0, 'tank', 6), memberOf(M, 'ev1', 1, 'melee_dps', 6)].map((mi, i) => {
      mi.hero = Object.assign({}, mi.hero, { lead: i === 0 });
      return mi;
    });
    const mis = pair(); mis[0].liveXp = [W];
    const r = run(M, mis, 64000, { viewer: { user: 'ev1', slot: 0 } });
    const bad = r.verdicts.filter((x) => x.v !== 'match');
    ok('LV-EVENT', r.verdicts.length >= 3 && bad.length === 0, bad.length + ' of ' + r.verdicts.length + ' commits did not match the prediction');
    const fedEvents = new Set(r.fed.events.map(ekey));
    const xps = r.verdicts.flatMap((x) => x.tl.hunt_events).filter((e) => e.type === 'xp');
    const miss = xps.filter((e) => !fedEvents.has(ekey(e)));
    ok('LV-EVENT', xps.length > 3 && miss.length === 0, miss.length + ' of the server\'s ' + xps.length + ' xp events were not the browser\'s (' + miss.slice(0, 2).map(ekey).join(' ') + ')');
    const lead = mis[0].unitId, other = mis[1].unitId;
    const inWin = (e) => e.atMs >= W[0] && e.atMs < W[1];
    const wrong = xps.filter((e) => (e.u === lead && inWin(e) && !(e.ev > 0)) || ((e.u !== lead || !inWin(e)) && e.ev !== undefined));
    ok('LV-EVENT', xps.some((e) => e.u === lead && inWin(e)) && wrong.length === 0,
      wrong.length + ' xp event(s) pay the dial at the wrong time or to the wrong hero: ' + wrong.slice(0, 2).map(ekey).join(' '));
    const ctl = pair(), rc = run(M, ctl, 64000, { viewer: { user: 'ev1', slot: 0 } });
    const xpc = rc.verdicts.flatMap((x) => x.tl.hunt_events).filter((e) => e.type === 'xp');
    const sum = (list, u, f) => list.filter((e) => e.u === u && f(e)).reduce((a, e) => a + e.amount, 0);
    const with_ = sum(xps, lead, inWin), without = sum(xpc, lead, inWin);
    ok('LV-EVENT', without > 0 && Math.abs(with_ / without - 1.25) < 0.05 && sum(xps, other, () => true) === sum(xpc, other, () => true)
      && sum(xps, lead, (e) => !inWin(e)) === sum(xpc, lead, (e) => !inWin(e)),
      'the leader earned ' + with_ + ' inside the window against ' + without + ' with none (want x1.25), the viewer ' + sum(xps, other, () => true) + ' against ' + sum(xpc, other, () => true));
    console.log('  LV-EVENT Cellar pair, +25% for the leader 20-60 s of 64 s: ' + r.verdicts.length + ' commits, ' + (r.verdicts.length - bad.length) + ' matched; '
      + xps.length + ' xp events, all the browser\'s; the leader ' + with_ + ' Level XP inside the window against ' + without + ' with none');
  }

  { // LV-K: THE LEADER CHOOSES (Tyler 2026-10-20): the peer leader's pick is the pull, on the server and in the browser.
    const pick = (mi, density, lead) => { mi.hero = Object.assign({}, mi.hero, { density, lead }); return mi; };
    const mis = [pick(memberOf(M, 'a', 0, 'tank', 6), 3, false), pick(memberOf(M, 'b', 1, 'melee_dps', 6), 7, true)];
    const r = run(M, mis, 48000);
    const w = r.srv.inst.world ? M.WS.decode(JSON.parse(r.srv.inst.world)) : null;
    ok('LV-K', !!w && w.density === 7, 'the server ran density ' + (w && w.density) + ' with the leader (seat 1) at 7 and the viewer at 3');
    const bad = r.verdicts.filter((x) => x.v !== 'match');
    ok('LV-K', r.verdicts.length >= 2 && bad.length === 0, `the viewer's browser did not predict the leader's pull: ${bad.length} of ${r.verdicts.length} commits diverged`);
    const src = readFileSync(join(M.base || ROOT, FN, 'hunt-settle.js'), 'utf8');
    ok('LV-K', /_leads: m\.leads === true/.test(src) && /lead: m\._leads/.test(src), 'hunt-settle.js does not hand the engine hr_hunt_instance_read `leads`');
  }

  { // LV-B: A FULL BOX IS PULLED, VIEWED (Andy 10-20): a Thicket duo, its leader at 8 and the member never picked. The
    // designer's ring of 8 walls the pull tile off; the leader pulls from the ring's edge on the server, the browser predicts it.
    const pick = (mi, density, lead) => { mi.hero = Object.assign({}, mi.hero, density === null ? { lead } : { density, lead }); return mi; };
    const mis = [pick(memberOf(M, 'a', 0, 'tank', 40), 8, true), pick(memberOf(M, 'b', 1, 'melee_dps', 40), null, false)];
    const r = run(M, mis, 160000, { server: { hunt: 'meadowbrook_thicket' } });
    const pulls = r.verdicts.flatMap((x) => x.tl.hunt_events).filter((e) => e.type === 'pull').length;
    const kills = r.verdicts.flatMap((x) => x.tl.hunt_events).filter((e) => e.type === 'kill').length;
    ok('LV-B', pulls >= 1 && kills >= 8, `the duo at the leader's 8 pulled ${pulls} time(s) and killed ${kills} in 160 s: the full box walled the leader off`);
    const bad = r.verdicts.filter((x) => x.v !== 'match');
    ok('LV-B', r.verdicts.length >= 9 && bad.length === 0, `the viewer's browser did not predict the full-box pull: ${bad.length} of ${r.verdicts.length} commits diverged`);
  }

  { // LV-OPEN: THE OPEN GROUND, BOTH PATHS (Tyler + Andy 2026-10-25: "fix pathing so that the tank doesn't stand next to
    // the wall. During an 8 box it ruins the whole point"). A lone tank pulls the cellar's first pack at density 8 from
    // a tile on the pack area's edge, where one tile of his box is walled in behind the others (7 of 8 before the fix:
    // tests/hunt-core/roles.mjs tank-plants-on-open-ground); the rats never die (their row's HP, the one the spawn reads,
    // raised for this run only). Browser closed: at every server commit from 32 s the holder has his pack on all 8 of
    // his tiles. Viewed: the browser's prediction matches every commit (the world hash covers every unit's tile), so
    // one seed puts every unit on the same tile in both runtimes.
    const mis = [memberOf(M, 'a', 0, 'tank', 40)];
    mis[0].hero = Object.assign({}, mis[0].hero, { density: 8, lead: true });
    const boxes = [];
    const was = M.ENGINE_MONSTERS.rat.hp;
    let r;
    try {
      M.ENGINE_MONSTERS.rat.hp = 1000000;
      r = run(M, mis, 96000, { onCommit: ({ t, srv }) => {
        if (t - T0 < 32000 || !srv.inst.world) return;
        const w = M.WS.decode(JSON.parse(srv.inst.world));
        const pk = w.packs.find((p) => p.aggro && Number.isInteger(p.holder));
        const k = pk && w.units.find((u) => u.id === pk.holder);
        boxes.push(k ? w.units.filter((u) => u.side === 'mon' && u.alive && u.target === k.id && Math.max(Math.abs(u.x - k.x), Math.abs(u.y - k.y)) <= 1).length : -1);
      } });
    } finally { M.ENGINE_MONSTERS.rat.hp = was; }
    console.log(`  LV-OPEN cellar pull of 8: the server's commits from 32 s held ${JSON.stringify(boxes)} beside the tank; ${r.verdicts.filter((x) => x.v === 'match').length} of ${r.verdicts.length} commits matched the prediction`);
    ok('LV-OPEN', boxes.length >= 3 && boxes.every((n) => n === 8), `browser closed: the server's commits from 32 s held ${JSON.stringify(boxes)} of the pack beside the tank, want 8 at each (a full box)`);
    const bad = r.verdicts.filter((x) => x.v !== 'match');
    ok('LV-OPEN', r.verdicts.length >= 5 && bad.length === 0, `viewed: the browser's prediction of the open-ground pull diverged at ${bad.length} of ${r.verdicts.length} commits`);
  }

  { // LV-RING: THE RING'S ROOMY SIDE, BOTH PATHS (Andy #64, live v0.2.45 at the Warrens: "Pathing choices. In this case, tank
    // would have wanted to stand 1 sqm above"). A tank and a healer at Coppercap Warrens, density 8 (the leader's pick), L38: the second
    // pocket's ring of 8 closes round its free centre, so the tank walking at it was stopped by the ring on its west edge,
    // (35, 7), where the ground feeds 7 slots (roles.js roomAt 119) and one or two monsters queued out of his reach every
    // pull; the south and east edges feed all 8 (pull-cycle.js roomierEdge). Browser closed: every server commit (each 2 s)
    // that finds five or more of the pull on the holder at rest finds every one of them beside him (the duo kills slowly
    // enough for the whole eight to stand on him for several commits: 7 of 8 beside him at each before). Viewed: every
    // commit matches.
    const roles = ['tank', 'healer'];
    const gear = { tank: { weapon: 'steel_sword', shield: 'coppercap_shield', helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots' },
      ranger: { weapon: 'maple_bow', ammo: 'bronze_arrows', helmet: 'boarhide_helmet', body: 'boarhide_body', pants: 'boarhide_pants', boots: 'boarhide_boots' },
      mage: { weapon: 'willow_wand', shield: 'willow_spellbook', helmet: 'scholar_helmet', body: 'scholar_body', pants: 'scholar_pants', boots: 'scholar_boots' },
      healer: { weapon: 'willow_staff', helmet: 'scholar_helmet', body: 'scholar_body', pants: 'scholar_pants', boots: 'scholar_boots' } };
    const mis = roles.map((role, i) => {
      const mi = memberOf(M, 'r' + i, i, role, 38);
      mi.huntId = 'coppercap_warrens'; mi.gold = 50000; mi.hp = 1e9; mi.equipment = gear[role];
      mi.skills = { ...mi.skills, magic: M.XP.skillXpForLevel('magic', 38) };
      mi.huntSession = Object.assign({}, mi.huntSession, { bag: role === 'ranger' ? { bronze_arrows: { loaded: 60, left: 60 } } : {} });
      mi.hero = M.SPAWN.heroSetup({ weaponType: M.HR.wornRoleKey(gear[role], M.ITEMS), options: role === 'healer' ? { role: 'healer' } : {},
        bar: [], partyRoles: roles, leaveTogether: true, lead: i === 0 });
      mi.hero = Object.assign({}, mi.hero, { density: 8 });
      return mi;
    });
    const boxes = [];
    /* 160 s: since 2026-11-08 the pair's packs carry their rows' whole HP (was 70%), so the second pocket's pull comes later */
    const r = run(M, mis, 160000, { server: { hunt: 'coppercap_warrens' }, commitMs: 2000, onCommit: ({ srv }) => {
      if (!srv.inst.world) return;
      const w = M.WS.decode(JSON.parse(srv.inst.world));
      const pk = w.packs.find((p) => p.aggro && Number.isInteger(p.holder));
      const k = pk && w.units.find((u) => u.id === pk.holder);
      const on = k ? w.units.filter((u) => u.side === 'mon' && u.alive && u.target === k.id) : [];
      if (w.packs.indexOf(pk) !== 1 || on.length < 5 || on.some((u) => u.path.length)) return;
      boxes.push(on.filter((u) => Math.max(Math.abs(u.x - k.x), Math.abs(u.y - k.y)) <= 1).length + '/' + on.length);
    } });
    console.log(`  LV-RING Warrens pocket 2 (index 1), a tank and a healer at density 8: the server's commits with the pull at rest on the holder held ${JSON.stringify(boxes)} beside him; ${r.verdicts.filter((x) => x.v === 'match').length} of ${r.verdicts.length} commits matched the prediction`);
    ok('LV-RING', boxes.length >= 3 && boxes.every((b) => b.split('/')[0] === b.split('/')[1]), `browser closed: the server's commits held ${JSON.stringify(boxes)} (beside / on him) of the pull at rest on the holder, want every one beside him (none queued out of reach; at least 3 commits with 5 or more on him)`);
    const bad = r.verdicts.filter((x) => x.v !== 'match');
    ok('LV-RING', r.verdicts.length >= 30 && bad.length === 0, `viewed: the browser's prediction of the ring's pull diverged at ${bad.length} of ${r.verdicts.length} commits`);
  }

  { // LV-KITE: A KITER'S PULL IS FOUGHT, BOTH PATHS. A retreat's goal was always inside the pack area but its walk was not: at the
    // area's edge, with the pack on its heels, the re-plan round the monsters stepped out, the pack reset and healed to full, and the
    // kiter re-pulled at once (Warrens pocket 0, the corridor east of x = 21). The control: the kiter reaches the edge, so "stays in"
    // is not passed by standing still.
    const eq = { weapon: 'maple_bow', ammo: 'bronze_arrows', helmet: 'boarhide_helmet', body: 'boarhide_body', pants: 'boarhide_pants', boots: 'boarhide_boots' };
    const mi = memberOf(M, 'k', 0, 'ranger', 40);
    mi.huntId = 'coppercap_warrens'; mi.gold = 50000; mi.hp = 1e9; mi.equipment = eq;
    mi.huntSession = Object.assign({}, mi.huntSession, { bag: { bronze_arrows: { loaded: 60, left: 60 } } });
    mi.hero = Object.assign({}, M.SPAWN.heroSetup({ weaponType: M.HR.wornRoleKey(eq, M.ITEMS), options: {}, bar: [], partyRoles: ['ranger'], leaveTogether: true, lead: true }), { density: 8 });
    const { ground, grid } = M.HG.huntGroundOf('coppercap_warrens');
    const area = (p, x, y) => M.LS.inArea({ ground, world: {} }, p, x, y);
    const walksOut = (p, x, y) => [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => M.GR.walkable(grid, x + dx, y + dy) && !area(p, x + dx, y + dy)));
    const outside = []; let resets = 0, atEdge = 0, kills = 0;
    const r = run(M, [mi], 120000, { server: { hunt: 'coppercap_warrens' }, commitMs: 2000, onCommit: ({ c, srv }) => {
      for (const e of c.tl.hunt_events) { if (e.type === 'pack_reset') resets++; if (e.type === 'kill') kills++; }
      const w = srv.inst.world && M.WS.decode(JSON.parse(srv.inst.world));
      const p = w ? w.packs.findIndex((x) => x.aggro) : -1;
      if (p < 0) return;
      const k = w.units.find((u) => u.id === w.packs[p].holder);
      if (!area(p, k.x, k.y)) outside.push([k.x, k.y]);
      if (walksOut(p, k.x, k.y)) atEdge++;
    } });
    console.log(`  LV-KITE a lone bow at the Warrens, pull 8: ${resets} pack resets, ${kills} kills, ${atEdge} commits on the area's edge; ${r.verdicts.filter((x) => x.v === 'match').length} of ${r.verdicts.length} commits matched the prediction`);
    ok('LV-KITE', resets === 0 && outside.length === 0, `browser closed: ${resets} pack resets in 120 s, the holder outside its area at ${JSON.stringify(outside)}: it must fight the pack it pulled`);
    ok('LV-KITE', atEdge >= 2 && kills >= 3, `the control: ${atEdge} commits on the area's edge, ${kills} kills: the kiter must run to the edge and fight`);
    const bad = r.verdicts.filter((x) => x.v !== 'match');
    ok('LV-KITE', r.verdicts.length >= 30 && bad.length === 0, `viewed: the browser's prediction of the kite diverged at ${bad.length} of ${r.verdicts.length} commits`);
  }

  { // LV-H: the look-ahead is ONE constant (16 swings), and a leave lands no earlier than its last swing.
    const live = server(M, [memberOf(M, 'a', 0, 'tank', 6)]).live('a');
    ok('LV-H', M.TUNE.liveSeeds === 16 && M.HS.LIVE_SEEDS === M.TUNE.liveSeeds && live.seeds.list.length === M.TUNE.liveSeeds,
      `hunt_live sends ${live.seeds.list.length} seeds (LIVE_SEEDS ${M.HS.LIVE_SEEDS}, liveSeeds ${M.TUNE.liveSeeds}), not 16`);
    const mig = readFileSync(join(ROOT, 'supabase/migrations/2026-10-31-live-horizon.sql'), 'utf8');
    const ms = Number((/settled_to \+ make_interval\(secs => (\d+) \/ 1000\.0\)/.exec(mig) || [])[1]);
    ok('LV-H', ms === M.TUNE.liveSeeds * M.CB.tickMs, `the leave horizon is ${ms} ms, not liveSeeds x the swing (${M.TUNE.liveSeeds * M.CB.tickMs})`);
  }

  { // LV-M: a melee hero in range holds its tile and swings (Tyler 10-19: "back and forth between mobs").
    /* THE SIM'S FIGURE, measured 2026-10-19 (prototypes/hunt-sim, a lone knight, 600 s at dt 0.1 through
       __simFast): 10.9 tile changes per kill. No melee hero of the engine may wander more than that. */
    const SIM_TILES_PER_KILL = 10.9;
    /* THE FIGHT IS BUILT FROM DATA (lane/a-v106-reds): a hero can only wander between swings if a monster outlives a swing. On the
       formula's Cellar a rat falls to a blow or two, and the stepping mutant moved a Melee 11 times in 87 kills (bar 13): escaped.
       So for this case (a what-if on the engine's own rows, put back after, as LV-CALL does) every Cellar monster has at least
       BLOWS x the hero's largest blow (member.js snapshot): BLOWS 3, the mutant reads 110 back-and-forths over 75 kills, the
       engine 0 (5: 230 and 0). Its own HP rows stay what they are everywhere else. */
    const BLOWS = 3;
    for (const role of ['tank', 'melee_dps']) {
      const mis = [memberOf(M, 'a', 0, role, 6)];
      const side = M.MB.memberSide(mis[0], { items: M.ITEMS });
      const blow = side.member.snapshot(side.state).maxHit;
      const kinds = [...new Set(M.HG.huntGroundOf('mill_cellar').ground.pockets.flatMap((p) => [...(p.spawns || []), ...(p.pack || [])].map((s) => s.monster || s)))]
        .filter((k) => M.ENGINE_MONSTERS[k]);
      const keep = kinds.map((id) => [id, { hp: M.ENGINE_MONSTERS[id].hp }]);
      for (const id of kinds) { const hp = Math.max(M.ENGINE_MONSTERS[id].hp, blow * BLOWS); M.ENGINE_MONSTERS[id].hp = hp; M.MONSTERS[id].hp = hp; }
      try {
        const srv = server(M, mis);
        const steps = []; const killAt = [];
        for (let t = T0 + 16000; t <= T0 + 600000; t += 16000) {
          const c = srv.commit(t);
          if (!c) continue;
          for (const st of c.tl.hunt_track) if (st.u === mis[0].unitId) steps.push(st);
          for (const e of c.tl.hunt_events) if (e.type === 'kill' && e.u === mis[0].unitId) killAt.push(e.atMs);
        }
        const kills = killAt.length;
        let moves = 0, flips = 0;
        for (let i = 1; i < steps.length; i++) if (steps[i].x !== steps[i - 1].x || steps[i].y !== steps[i - 1].y) moves++;
        /* A back-and-forth is a step out and straight back with no kill between: the hero stepping between swings. A step
           in to pull and the same step out once the pack is dead (report #69: the knight walks on to the next pocket at
           once, by the tile it came in on) spans the fight, and is not one. */
        for (let i = 2; i < steps.length; i++) {
          const back = steps[i].x === steps[i - 2].x && steps[i].y === steps[i - 2].y;
          const moved = steps[i - 1].x !== steps[i].x || steps[i - 1].y !== steps[i].y;
          const fought = killAt.some((at) => at > steps[i - 1].atMs && at <= steps[i].atMs);
          if (back && moved && !fought) flips++;
        }
        console.log(`  LV-M ${role}: ${moves} tile changes over ${kills} kills (${(moves / Math.max(1, kills)).toFixed(2)} per kill; the sim's knight ${SIM_TILES_PER_KILL}), ${flips} back-and-forth steps in 600 s`);
        ok('LV-M', kills > 20 && moves / kills <= SIM_TILES_PER_KILL, `${role}: ${(moves / Math.max(1, kills)).toFixed(2)} tile changes per kill (sim ${SIM_TILES_PER_KILL})`);
        ok('LV-M', flips <= kills * 0.15, `${role}: ${flips} back-and-forth steps over ${kills} kills (a hero stepping between swings)`);
      } finally { for (const [id, r] of keep) { M.ENGINE_MONSTERS[id].hp = r.hp; M.MONSTERS[id].hp = r.hp; } }
    }
  }

  { // LV-CALL: A CALLED ROOM, THE HUNT VIEWED (Tyler 2026-11-05: "phases", src/core/hunt/boss-phases.js). His adds spawn inside a swing with no die drawn, so the browser's prediction
    // plays the same wave at the same instant: every commit matches, both lines fall once each on the screen, and the fight ends on the kill. (The closed path: tests/boss-call-db.mjs BD-BOTH.)
    const ROWS = [['rat_king_called', { hp: 2400, atk: 1, baseAcc: 0 }], ['drain_rat_called', { hp: 60, atk: 1, baseAcc: 0 }]];
    const keep = ROWS.map(([id]) => [id, { ...M.ENGINE_MONSTERS[id] }]);
    for (const [id, row] of ROWS) { Object.assign(M.ENGINE_MONSTERS[id], row); Object.assign(M.MONSTERS[id], row); }
    try {
      /* The room's last commit is the end, whose world is gone (accrual.js: no world once everyone has left), so no prediction can match it: every commit before it must, and both lines must fall before it. This harness's server (like no real one) would go on settling members that have left. */
      const ends = [];
      let over = Infinity;
      const v = run(M, [memberOf(M, 'a', 0, 'tank', 30), memberOf(M, 'b', 1, 'melee_dps', 30)], 300000,
        { server: { hunt: 'millrace_sewer_called', id: 'i-call' }, onCommit: ({ t, c }) => { if (t <= over) for (const e of c.ends) { ends.push(e.reason); over = t; } } });
      const judged = v.verdicts.filter((x) => x.t < over);
      const bad = judged.filter((x) => x.v !== 'match');
      const lastLine = Math.max(...v.fed.events.filter((e) => e.type === 'boss_phase').map((e) => e.atMs));
      const lines = v.fed.events.filter((e) => e.type === 'boss_phase').map((e) => e.phase).join();
      console.log(`  LV-CALL the King's room, viewed: ${judged.length - bad.length} of ${judged.length} commits matched; lines ${lines}; ended ${ends.join()} at ${(over - T0) / 1000} s`);
      ok('LV-CALL', lines === 'adds,enrage', `the browser played the lines as ${lines || 'nothing'}, want adds then enrage, once each`);
      ok('LV-CALL', judged.length >= 3 && bad.length === 0, `viewed: ${bad.length} of ${judged.length} commits off the prediction`);
      ok('LV-CALL', judged.some((x) => x.t > lastLine), 'CONTROL: no commit after his second line was judged');
      ok('LV-CALL', ends.join() === 'boss_felled,boss_felled', `ended ${ends.join() || 'nothing'}, want the kill for both`);
    } finally {
      for (const [id, row] of keep) { Object.assign(M.ENGINE_MONSTERS[id], row); Object.assign(M.MONSTERS[id], row); }
    }
  }

  { // LV-DOWN: EVERY PACK DOWN, THE LEADER WALKS ON, BOTH PATHS (report #69, v0.2.63: "long pauses after killing some
    // pulls", two L45s at Wickstead; the settle never fell behind, the engine stood). A lone L6 knight clears the Cellar's
    // two pockets faster than they respawn (30 s): it stood 18 s a lap on the pocket it had cleared, then walked on.
    // BROWSER CLOSED: on the server's commits, every swing for 120 s, the leader never stands two swings running away
    // from its route's pocket while every pack is down (it waits at the next one). VIEWED: every commit matches the
    // prediction (the world hash holds every unit's tile), so the browser plays the same walk on.
    const cellar = M.HG.huntGroundOf('mill_cellar').ground;
    const srv = server(M, [memberOf(M, 'a', 0, 'tank', 6)]);
    let down = 0, stood = 0, longest = 0, prev = null;
    for (let t = T0 + M.CB.tickMs; t <= T0 + 120000; t += M.CB.tickMs) {
      if (!srv.commit(t) || !srv.inst.world) break;
      const w = M.WS.decode(JSON.parse(srv.inst.world));
      const k = w.units.find((u) => u.id === w.leader);
      const all = w.packs.every((p) => !p.alive);
      const r = cellar.pockets[cellar.route[w.routeIdx % cellar.route.length]].room;
      const onRoute = k.x >= r[0] && k.y >= r[1] && k.x <= r[2] && k.y <= r[3];
      if (all) down++;
      stood = all && w.phase === 'travel' && !onRoute && prev && prev.x === k.x && prev.y === k.y ? stood + M.CB.tickMs : 0;
      longest = Math.max(longest, stood);
      prev = { x: k.x, y: k.y };
    }
    const v = run(M, [memberOf(M, 'a', 0, 'tank', 6)], 120000);
    const bad = v.verdicts.filter((x) => x.v !== 'match');
    console.log(`  LV-DOWN cellar knight, 120 s: every pack down at ${down} commits, the longest stand on a cleared pocket ${longest / 1000} s; viewed ${v.verdicts.length - bad.length} of ${v.verdicts.length} commits matched`);
    ok('LV-DOWN', down >= 5, `CONTROL: every pack was down at ${down} of the server's commits in 120 s (the knight never outran the respawn)`);
    ok('LV-DOWN', longest <= M.CB.tickMs, `closed: with every pack down the leader stood ${longest / 1000} s on the pocket it cleared (want at most one swing: it walks on to the next)`);
    ok('LV-DOWN', v.verdicts.length >= 7 && bad.length === 0, `viewed: ${bad.length} of ${v.verdicts.length} commits off the prediction`);
  }

  { // LV-T: A SECOND TANK FIGHTS (Andy / Tyler 10-20: "not moving to the mobs ... when he has to move after
    // initial placement"). Two shield heroes, the pack on the leader: the second walks to its own target,
    // lands at least 60% of the leader's blows (was 25-40%) and is never more than 3 s with no engaged
    // monster beside it while one lives (was 6-50 s).
    for (const [hunt, dens] of [['meadowbrook_thicket', 0], ['millrace_sewer', 7]]) {
      const mis = [memberOf(M, 'a', 0, 'tank', 19), memberOf(M, 'b', 1, 'tank', 19)];
      for (const m of mis) { m.huntId = hunt; m.hero = Object.assign({}, M.SPAWN.heroSetup({ weaponType: 'shield', options: {}, bar: [], partyRoles: ['tank', 'tank'] }), { density: dens }); }
      const srv = server(M, mis, { hunt });
      const hits = {}; let away = 0, longest = 0, lap = -1, onHolder = 0, offHolder = 0;
      const heroIds = () => [mis[0].unitId, mis[1].unitId];
      const route0 = M.HG.huntGroundOf(hunt).ground.route[0];
      for (let t = T0 + M.CB.tickMs; t <= T0 + 120000; t += M.CB.tickMs) {
        const c = srv.commit(t);
        if (!c) break;
        for (const e of swingsOnly(c.tl.hunt_events)) {
          if (e.type === 'dmg') hits[e.u] = (hits[e.u] || 0) + 1;
          if (e.type === 'pull' && e.pocket === route0) lap++;
          /* a monster's swing at a tank (landed or missed: what trains its Defense), on or off the lap's holder
             (the leader's tank the first lap, the next by seat the one after) */
          if ((e.type === 'dmg' || e.type === 'miss') && !heroIds().includes(e.u) && heroIds().includes(e.t) && lap >= 0) {
            if (e.t === heroIds()[lap % 2]) onHolder++; else offHolder++;
          }
        }
        /* a party whose world is gone ended (a death ends it for everyone): the two tanks did not hold 120 s */
        if (!srv.inst.world) { ok('LV-T', false, `${hunt} d${dens}: the instance ended ${(t - T0) / 1000} s in (a hero died)`); break; }
        const w = M.WS.decode(JSON.parse(srv.inst.world));
        const engaged = w.units.filter((u) => u.side === 'mon' && u.alive && Number.isInteger(u.target));
        const h = w.units.find((u) => u.id === mis[1].unitId);
        if (!h || !h.alive) break;
        const beside = engaged.some((m) => Math.max(Math.abs(m.x - h.x), Math.abs(m.y - h.y)) <= 1);
        away = engaged.length && !beside ? away + M.CB.tickMs : 0;
        longest = Math.max(longest, away);
      }
      const a = hits[mis[0].unitId] || 0, b = hits[mis[1].unitId] || 0;
      console.log(`  LV-T ${hunt} d${dens}: leader ${a} blows, second tank ${b} (${Math.round(b / Math.max(1, a) * 100)}%), longest ${longest / 1000} s with no engaged monster beside it`);
      ok('LV-T', a > 10 && b >= a * 0.6, `${hunt} d${dens}: the second tank landed ${b} blows to the leader's ${a} (want >= 60%)`);
      ok('LV-T', longest <= 3000, `${hunt} d${dens}: the second tank stood ${longest / 1000} s with no engaged monster beside it (want <= 3 s)`);
      /* ONE HOLDER A LAP (designer 2026-10-21, Option A; live v0.2.24: "monsters are retargeting onto the
         secondary member often, until the primary uses Challenge"): the monsters swing only at the lap's holder
         (no other hero is here to overflow from). */
      console.log(`  LV-T ${hunt} d${dens}: ${lap + 1} lap(s) begun; monster swings at the lap's holder ${onHolder}, at the other tank ${offHolder}`);
      ok('LV-T', onHolder > 10 && offHolder === 0, `${hunt} d${dens}: the monsters swung ${onHolder} times at the lap's holder and ${offHolder} at the other tank (want all on the holder)`);
    }
    /* VIEWED: the browser's live engine shows the same holder (its events are the server's, LV-D) over two laps of
       the Sewer: in each lap the monsters swing at ONE tank, the leader holds the first lap and the second tank the
       next (since bug #61 the lap's holder pulls its own lap, so no Challenge yanks a pack), and every commit matches. */
    const mis = [memberOf(M, 'a', 0, 'tank', 19), memberOf(M, 'b', 1, 'tank', 19)];
    for (const m of mis) { m.huntId = 'millrace_sewer'; m.hero = Object.assign({}, M.SPAWN.heroSetup({ weaponType: 'shield', options: {}, bar: [], partyRoles: ['tank', 'tank'] }), { density: 7 }); }
    const v = run(M, mis, 480000, { server: { hunt: 'millrace_sewer' } });
    const ids = [mis[0].unitId, mis[1].unitId];
    const route0 = M.HG.huntGroundOf('millrace_sewer').ground.route[0];
    const laps = [];
    for (const e of swingsOnly(v.fed.events).sort((x, y) => x.atMs - y.atMs)) {
      if (e.type === 'pull' && e.pocket === route0) laps.push({ swings: {}, casts: 0 });
      const lap = laps[laps.length - 1];
      if (!lap) continue;
      if ((e.type === 'dmg' || e.type === 'miss') && !ids.includes(e.u) && ids.includes(e.t)) lap.swings[e.t] = (lap.swings[e.t] || 0) + 1;
      if (e.type === 'cast' && e.ability === 'challenge') lap.casts++;
    }
    const mixed = laps.filter((l) => Object.keys(l.swings).length > 1).length;
    const unmatched = v.verdicts.filter((x) => x.v !== 'match').length;
    const words = laps.map((l) => Object.entries(l.swings).map(([u, n]) => (Number(u) === ids[0] ? 'leader ' : 'second ') + n).join('+') + ' / ' + l.casts + ' cast(s)').join(', ');
    console.log(`  LV-T viewed (browser engine, sewer d7, 480 s): ${laps.length} lap(s), monster swings and Challenges by lap [${words}], ${mixed} lap(s) with both tanks hit; ${unmatched} of ${v.verdicts.length} commits off the prediction`);
    ok('LV-T', laps.length >= 2 && mixed === 0 && unmatched === 0, `viewed: ${laps.length} lap(s), ${mixed} lap(s) with both tanks hit, ${unmatched} commits off the prediction (want 2+, 0, 0)`);
    ok('LV-T', laps.length >= 2 && (laps[0].swings[ids[0]] || 0) > 0 && (laps[1].swings[ids[1]] || 0) > 0,
      `viewed: by lap [${words}]: want the leader holding the first lap and the second tank the next`);
  }

  { // LV-HOLD: ONE TANK HOLDS, BOTH PATHS (Tyler 2026-10-22, the party's "One tank holds"). Two tanks at the Sewer
    // (d7): the viewer `a` (seat 0, the pull's leader) and the party leader `b` (seat 1), who picked ITSELF to hold
    // every lap. BROWSER CLOSED: on the server's commits every monster swing at a tank goes to `b`, from the first
    // lap (a world made with the pick holds it at once, never the leader's tank by turns) through the laps after.
    // VIEWED: the viewer's browser, which holds `b` only as frozen numbers, predicts every commit (its frozen hero
    // carries `hold`). A CHANGE MID-HUNT (b sets "Take turns") is read at the next settle and takes force only when
    // the lap ends: world.hold stays b's until world.runs moves, then it is null.
    const mk = () => {
      const mis = [memberOf(M, 'a', 0, 'tank', 19), memberOf(M, 'b', 1, 'tank', 19)];
      for (const m of mis) {
        m.huntId = 'millrace_sewer';
        m.hero = Object.assign({}, M.SPAWN.heroSetup({ weaponType: 'shield', options: {}, bar: [], partyRoles: ['tank', 'tank'], lead: m.user === 'b', hold: 1 }), { density: 7 });
      }
      return mis;
    };
    const swingsAt = (evs, ids) => {
      const out = { pick: 0, other: 0 };
      for (const e of swingsOnly(evs)) if ((e.type === 'dmg' || e.type === 'miss') && !ids.includes(e.u) && ids.includes(e.t)) out[e.t === ids[1] ? 'pick' : 'other']++;
      return out;
    };
    /* browser closed: the server's commits alone, with the change to "Take turns" at 1,000 s (two laps begun by then: since 2026-11-08 a pack carries its row's whole HP for a pair, a lap about 450 s) */
    const mis = mk();
    const srv = server(M, mis, { hunt: 'millrace_sewer' });
    const evs = []; const seen = []; let changeAt = null;
    for (let t = T0 + M.CB.tickMs; t <= T0 + 1400000; t += M.CB.tickMs) {
      if (t === T0 + 1000000) { mis[1].hero = Object.assign({}, mis[1].hero, { hold: null }); changeAt = t; }
      const c = srv.commit(t);
      if (!c) break;
      if (!srv.inst.world) { ok('LV-HOLD', false, `closed: the instance ended ${(t - T0) / 1000} s in (a hero died)`); break; }
      const w = M.WS.decode(JSON.parse(srv.inst.world));
      if (changeAt === null) for (const e of c.tl.hunt_events) evs.push(e);
      seen.push({ t, runs: w.runs, hold: w.hold, holdNext: w.holdNext });
    }
    const ids = [mis[0].unitId, mis[1].unitId];
    const before = seen.filter((s) => s.t < changeAt);
    const s = swingsAt(evs, ids);
    const lapsBefore = before.length ? before[before.length - 1].runs : 0;
    const turnsAt = seen.filter((x, i) => i > 0 && x.runs !== seen[i - 1].runs).map((x) => (x.t - T0) / 1000 + ' s');
    console.log(`  LV-HOLD closed: laps ended at [${turnsAt.join(', ')}], the change at ${(changeAt - T0) / 1000} s; monster swings at the pick ${s.pick}, at the leader's tank ${s.other} before it`);
    ok('LV-HOLD', lapsBefore >= 1 && s.pick > 10 && s.other === 0, `closed: over ${lapsBefore + 1} lap(s) the monsters swung ${s.pick} times at the picked tank and ${s.other} at the other (want 2+ laps, all on the pick)`);
    ok('LV-HOLD', before.every((x) => x.hold === ids[1] && x.holdNext === ids[1]), 'closed: before the change the pick in force was not b\'s unit at every commit: ' + JSON.stringify(before.slice(0, 3)));
    const after = seen.filter((x) => x.t >= changeAt);
    const lapAtChange = after.length ? after[0].runs : null;
    const sameLap = after.filter((x) => x.runs === lapAtChange), nextLaps = after.filter((x) => x.runs > lapAtChange);
    ok('LV-HOLD', after.length > 0 && after.every((x) => x.holdNext === null), 'closed: the settle did not read the change to "Take turns" (holdNext ' + JSON.stringify(after.map((x) => x.holdNext).slice(0, 3)) + ')');
    ok('LV-HOLD', sameLap.length > 0 && sameLap.every((x) => x.hold === ids[1]), 'closed: the change took force mid-lap: ' + JSON.stringify(sameLap.slice(0, 3)));
    ok('LV-HOLD', nextLaps.length > 0 && nextLaps.every((x) => x.hold === null), `closed: after the lap ended the pick in force is ${JSON.stringify(nextLaps.slice(0, 2))}, want null (no lap ended: ${nextLaps.length === 0})`);
    /* viewed: the browser of `a` predicts the pick's laps (b's frozen hero carries hold) */
    const vm = mk();
    const v = run(M, vm, 240000, { server: { hunt: 'millrace_sewer' } });
    const vs = swingsAt(v.fed.events, [vm[0].unitId, vm[1].unitId]);
    const unmatched = v.verdicts.filter((x) => x.v !== 'match').length;
    console.log(`  LV-HOLD viewed (browser engine, sewer d7, 240 s): monster swings at the pick ${vs.pick}, at the leader's tank ${vs.other}; ${unmatched} of ${v.verdicts.length} commits off the prediction`);
    ok('LV-HOLD', vs.pick > 10 && vs.other === 0 && unmatched === 0 && v.verdicts.length >= 9, `viewed: ${vs.pick} swings at the pick, ${vs.other} at the other tank, ${unmatched} of ${v.verdicts.length} commits off (want all on the pick, 0 off)`);
    const src = readFileSync(join(M.base || ROOT, FN, 'hunt-settle.js'), 'utf8');
    ok('LV-HOLD', /_hold: Number\.isInteger\(inst\.hold_seat\)/.test(src) && /hold: m\._hold/.test(src), 'hunt-settle.js does not hand the engine hr_hunt_instance_read `hold_seat`');
  }

  { // LV-PULL: THE HOLDER PULLS (bug #61, Andy 10-22 at the Warrens; Coordinator rulings 2026-10-22 within Tyler 10-16).
    // Andy's party as live: Eddie (seat 0, L40 sword-and-shield tank, leads) and Fremulon (seat 1, sword-and-shield tank; the
    // SHIELD makes the tank since Tyler 2026-10-23, so each carries the Practice Shield), Apollo (seat 2,
    // wand) beside them, density 5. Before: Eddie pulled every lap and the other holder's Challenge yanked the pack off
    // him (6 casts a lap). In BOTH modes the holder now makes the pull: under "Take turns" the lap's holder, under "One
    // tank holds: Fremulon" Fremulon every lap (a world opened with the pick pulls with it from its first lap).
    // BROWSER CLOSED: at every commit the pull leader is the holder (it changes only when the lap ends) and every pack in
    // a fight is held by it; the monsters swing at the holder only; no tank casts Challenge, since nothing ever sits on
    // Apollo (the control: 0 swings at him). VIEWED: Apollo's browser predicts every commit and plays the same laps.
    const andy = (hold) => {
      const row = (user, seat, levelXp, skills, equipment, weaponType, lead) => {
        const mi = memberOf(M, user, seat, 'tank', 6);
        mi.huntId = 'coppercap_warrens'; mi.levelXp = levelXp; mi.skills = skills; mi.equipment = equipment;
        mi.hero = Object.assign({}, M.SPAWN.heroSetup({ weaponType, options: { stance: 'offensive' }, bar: [], partyRoles: ['tank', 'tank', 'mage'], lead, hold }), { density: 5 });
        return mi;
      };
      const plate = { body: 'bronze_platebody', pants: 'steel_platelegs', boots: 'bronze_boots' };
      return [
        row('eddie', 0, 3696348, { melee: 1212343, defense: 1166560, magic: 7056, ranged: 0, inner_flame: 76422 }, { weapon: 'steel_sword', shield: 'practice_shield', helmet: 'iron_helm', ...plate }, 'shield', true),
        row('fremulon', 1, 3370870, { melee: 965112, defense: 636093, magic: 6894, ranged: 0, inner_flame: 84294 }, { weapon: 'iron_sword', shield: 'practice_shield', helmet: 'steel_helm', ...plate }, 'shield', false),
        row('apollo', 2, 1509460, { melee: 4015, defense: 267, magic: 220560, ranged: 405, inner_flame: 26451 },
          { weapon: 'practice_wand', shield: 'practice_spellbook', helmet: 'leather_helmet', body: 'leather_body', boots: 'leather_boots' }, 'wand', false),
      ];
    };
    const hunt = 'coppercap_warrens';
    const route0 = M.HG.huntGroundOf(hunt).ground.route[0];
    const tally = (evs, ids) => {
      const laps = [];
      for (const e of evs) {
        if (e.type === 'pull' && e.pocket === route0) laps.push({ at: {}, casts: 0 });
        const lap = laps[laps.length - 1];
        if (!lap) continue;
        if ((e.type === 'dmg' || e.type === 'miss') && !ids.includes(e.u) && ids.includes(e.t)) lap.at[e.t] = (lap.at[e.t] || 0) + 1;
        if (e.type === 'cast' && e.ability === 'challenge') lap.casts++;
      }
      return laps;
    };
    /* SPELLS OFF HERE (lane/b-area-data): the bug #61 party in its 10-22 gear (bronze bodies, Practice Shields, Offensive) cannot
       live 600 s through the Warrens' spells (Fremulon falls at 516 s under Take turns, and a fallen holder ends the laps this arm
       reads). Who pulls and holds is spell-blind; LV-SPELL and LV-4P play the spells on both paths. */
    withoutSpells(M, () => {
    for (const [mode, hold] of [['Take turns', null], ['One tank holds: Fremulon', 1]]) {
      /* the holder of lap i (by `runs`): the lap's turn, or Fremulon every lap */
      const holderOf = (ids, i) => (hold === null ? ids[i % 2] : ids[1]);
      /* browser closed */
      const mis = andy(hold);
      const srv = server(M, mis, { hunt });
      const evs = []; let wrongLeader = 0, wrongHolder = 0, commits = 0;
      for (let t = T0 + M.CB.tickMs; t <= T0 + 1500000; t += M.CB.tickMs) {
        const c = srv.commit(t);
        if (!c) break;
        if (!srv.inst.world) { ok('LV-PULL', false, `${mode}, closed: the instance ended ${(t - T0) / 1000} s in (a hero died)`); break; }
        for (const e of c.tl.hunt_events) evs.push(e);
        const w = M.WS.decode(JSON.parse(srv.inst.world));
        const lapHolder = holderOf([mis[0].unitId, mis[1].unitId], w.runs);
        commits++;
        if (w.leader !== lapHolder) wrongLeader++;
        wrongHolder += w.packs.filter((pk) => pk.aggro && pk.holder !== lapHolder).length;
      }
      const ids = [mis[0].unitId, mis[1].unitId, mis[2].unitId];
      const laps = tally(evs.sort((x, y) => x.atMs - y.atMs), ids);
      const lapWords = (ls) => ls.map((l) => ['E', 'F', 'A'].map((n, i) => n + (l.at[ids[i]] || 0)).join('/') + ' c' + l.casts).join(', ');
      const offHolder = laps.reduce((n, l, i) => n + Object.entries(l.at).filter(([u]) => Number(u) !== holderOf(ids, i)).reduce((m, [, k]) => m + k, 0), 0);
      const casts = laps.reduce((n, l) => n + l.casts, 0), onApollo = laps.reduce((n, l) => n + (l.at[ids[2]] || 0), 0);
      console.log(`  LV-PULL ${mode}, closed (Andy's party, Warrens d5, 1,500 s): ${laps.length} lap(s) [${lapWords(laps)}]; pull leader off the holder at ${wrongLeader} of ${commits} commits, ${wrongHolder} pack(s) held by another`);
      ok('LV-PULL', laps.length >= 3 && wrongLeader === 0 && wrongHolder === 0, `${mode}, closed: over ${laps.length} lap(s) the pull leader was not the holder at ${wrongLeader} of ${commits} commits and ${wrongHolder} pack(s) were held by another tank (want 3+ laps, 0, 0)`);
      ok('LV-PULL', onApollo === 0 && casts === 0 && offHolder === 0, `${mode}, closed: ${casts} Challenge cast(s), ${offHolder} monster swing(s) off the holder, ${onApollo} at Apollo (want 0, 0; control 0)`);
      /* viewed: Apollo's browser (Eddie and Fremulon are its peers: their frozen heroes). 800 s: since one pack for every group (lane/b-one-difficulty,
         2026-11-08) a three's Warrens monsters have their row's HP, not 85% of it, so a lap takes about 350 s and the third begins near 705 s. Every
         commit to 800 s matches; the browser's first commit off the prediction is at 1,024 s in both modes (on the board, not this rule's). */
      const vm = andy(hold);
      const v = run(M, [vm[2], vm[0], vm[1]], 800000, { server: { hunt } });
      const vids = [vm[0].unitId, vm[1].unitId, vm[2].unitId];
      const vlaps = tally(v.fed.events.slice().sort((x, y) => x.atMs - y.atMs), vids);
      const vOff = vlaps.reduce((n, l, i) => n + Object.entries(l.at).filter(([u]) => Number(u) !== holderOf(vids, i)).reduce((m, [, k]) => m + k, 0), 0);
      const vCasts = vlaps.reduce((n, l) => n + l.casts, 0), unmatched = v.verdicts.filter((x) => x.v !== 'match').length;
      console.log(`  LV-PULL ${mode}, viewed: ${vlaps.length} lap(s), ${vCasts} Challenge cast(s), ${vOff} swing(s) off the holder; ${unmatched} of ${v.verdicts.length} commits off the prediction`);
      ok('LV-PULL', vlaps.length >= 3 && vCasts === 0 && vOff === 0 && unmatched === 0 && v.verdicts.length >= 30, `${mode}, viewed: ${vlaps.length} lap(s), ${vCasts} cast(s), ${vOff} swing(s) off the holder, ${unmatched} of ${v.verdicts.length} commits off (want 3+, 0, 0, 0)`);
    }
    });
  }

  { // LV-TGT: "STRONGEST" AND "FOLLOW" ON A MIXED PACK, BOTH PATHS (Andy a08, live v0.2.33: "Strongest and Follow
    // both seem to just target the first creature"). A Glade trio at density 8 (crows, poachers, vines, a sluicer: their
    // max HP differ): `a` the tank leads on Nearest, `b` a Melee DPS on "Follow", `c` a Melee DPS on "Strongest".
    // BROWSER CLOSED: at the server's swing boundaries with 2+ monsters engaged, b stands on the leader's monster at 85%+
    // of them (before: 56%; it took the leader's LAST blow's monster, at a pull one of the pack before, so it opened on its
    // own nearest and kept it), and c on a strongest-kind monster at 80%+ of the mixed ones, 30+ points above the Nearest
    // leader (the control). VIEWED: b's browser (a and c its peers) predicts every commit and plays b's and c's blows
    // exactly as the server's commits hold them.
    const hunt = 'mosslight_glade', SPAN = 300000;
    const mk = () => [['a', 'tank', null], ['b', 'melee_dps', 'follow'], ['c', 'melee_dps', 'strongest']].map(([user, role, mode], i) => {
      const mi = memberOf(M, user, i, role, 30);
      mi.huntId = hunt;
      /* THE STEEL A LEVEL 30 HERO WEARS (Tyler's harder Glade, 2026-11-02): in the practice set the tank now dies at 8 each and the span ends */
      mi.equipment = Object.assign({}, mi.equipment, { helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots' });
      mi.hero = Object.assign({}, M.SPAWN.heroSetup({ weaponType: role === 'tank' ? 'sword' : 'hammer', options: mode ? { target_mode: mode } : {},
        bar: [], partyRoles: ['tank', 'melee_dps', 'melee_dps'], lead: i === 0 }), { density: 8 });
      return mi;
    });
    const mis = mk();
    const srv = server(M, mis, { hunt });
    const n = { lead: 0, onLead: 0, mixed: 0, onTop: 0, leaderOnTop: 0 };
    let ended = null;
    for (let t = T0 + M.CB.tickMs; t <= T0 + SPAN; t += M.CB.tickMs) {
      const c = srv.commit(t);
      if (!c || !srv.inst.world) { ended = t - T0; break; }
      const w = M.WS.decode(JSON.parse(srv.inst.world));
      const eng = w.units.filter((u) => u.side === 'mon' && u.alive && Number.isInteger(u.target));
      if (eng.length < 2) continue;
      const [A, B, C] = mis.map((m) => w.units.find((u) => u.id === m.unitId));
      if (!A || !B || !C) continue;
      const on = (h) => eng.find((m) => m.id === h.target) || null;
      if (w.leader === A.id && on(A)) { n.lead++; if (B.target === A.target) n.onLead++; }
      const top = Math.max(...eng.map((m) => m.maxHp));
      if (new Set(eng.map((m) => m.maxHp)).size > 1) {
        n.mixed++;
        if (on(C) && on(C).maxHp === top) n.onTop++;
        if (on(A) && on(A).maxHp === top) n.leaderOnTop++;
      }
    }
    const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
    console.log(`  LV-TGT closed (Glade trio, d8, ${SPAN / 1000} s): Follow on the leader's monster at ${n.onLead}/${n.lead} boundaries; Strongest on the strongest kind at ${n.onTop}/${n.mixed} mixed ones (the Nearest leader ${n.leaderOnTop})`);
    ok('LV-TGT', ended === null, `closed: the trio's hunt ended ${ended} ms in (a death or a refusal; the rule needs the whole span)`);
    ok('LV-TGT', n.lead >= 40 && pct(n.onLead, n.lead) >= 85, `closed: "Follow" stood on the leader's monster at ${n.onLead} of ${n.lead} boundaries (want 40+ boundaries, 85%+)`);
    ok('LV-TGT', n.mixed >= 40 && pct(n.onTop, n.mixed) >= 80 && pct(n.onTop, n.mixed) >= pct(n.leaderOnTop, n.mixed) + 30,
      `closed: "Strongest" stood on the strongest kind at ${n.onTop} of ${n.mixed} mixed boundaries, the Nearest leader at ${n.leaderOnTop} (want 40+, 80%+, 30+ points above)`);
    /* viewed: b's browser */
    const vm = mk();
    const v = run(M, [vm[1], vm[0], vm[2]], SPAN, { server: { hunt } });
    const ids = [vm[1].unitId, vm[2].unitId];
    const last = v.verdicts.length ? v.verdicts[v.verdicts.length - 1].t : T0;
    const blows = (evs) => evs.filter((e) => (e.type === 'dmg' || e.type === 'miss') && ids.includes(e.u) && e.atMs < last)
      .map((e) => e.atMs + ':' + e.type + ':' + e.u + '>' + e.t).sort();
    const srvBlows = blows(v.verdicts.flatMap((x) => x.tl.hunt_events)), fedBlows = blows(v.fed.events);
    const unmatched = v.verdicts.filter((x) => x.v !== 'match').length;
    const same = srvBlows.length === fedBlows.length && srvBlows.every((x, i) => x === fedBlows[i]);
    console.log(`  LV-TGT viewed: ${unmatched} of ${v.verdicts.length} commits off the prediction; b's and c's blows: server ${srvBlows.length}, browser ${fedBlows.length}, same ${same}`);
    ok('LV-TGT', v.verdicts.length >= 15 && unmatched === 0 && srvBlows.length > 50 && same,
      `viewed: ${unmatched} of ${v.verdicts.length} commits off, ${srvBlows.length} server blows vs ${fedBlows.length} predicted (same ${same}); want 15+ commits, 0 off, 50+ blows, the same`);
  }

  { // LV-Q: ONE DEATH STOPS THE WHOLE PARTY AT ONCE (Tyler 2026-10-19; live v0.2.23, Andy: "2nd char starts to run
    // away after death"). A duo whose tank falls (Andy's was a Sewer duo at 8): from the sub-step the tank dies nobody acts again
    // (the party's hunt ends at each member's next boundary). Before: the ranger, alone and targeted, kited 5 tiles
    // away for the rest of the swing and could take blows the death had already ended. BROWSER CLOSED: the server's
    // commits; VIEWED: the live engine's fed swings (LV-D: the same).
    // THE DEADLY CASE IS BUILT HERE, FROM DATA (lane/b-ground-formula-fix): the formula made the Sewer a gentle ground (no blow
    // passes 10% of its floor hero's HP, balance-sheet.js), and Andy's duo at 14 no longer fell in 10 minutes. So the rule
    // no longer leans on how hard a ground's rows hit: for this case only (a what-if on the engine's own rows, put back after,
    // as LV-CALL does) every Sewer monster's blow reaches a sixth of the tank's max HP (deadlyRows, the harness's one builder;
    // perf-budget's death scene uses it too). No to-hit floor here: at 60% the tank fell in the first pull (13.9 s), before the
    // ranger fought, and the run-on mutant had nothing to show; at 1/6 alone he falls at 170.5 s, both heroes fighting.
    const HUNT = 'millrace_sewer', SHARE = 6;
    const mk = () => { const mis = [memberOf(M, 'a', 0, 'tank', 14), memberOf(M, 'b', 1, 'ranger', 14)];
      for (const m of mis) { m.huntId = HUNT; m.hero = Object.assign({}, m.hero, { density: 8 }); } return mis; };
    const deadly = deadlyRows(M, HUNT, mk()[0], { share: SHARE });
    const tankHp = deadly.hp;
    deadly.put();
    try {
      const after = (steps, events, ids) => {
        const death = events.find((e) => e.type === 'kill' && ids.includes(e.t));
        if (!death) return null;
        return { at: death.atMs - T0, steps: steps.filter((s) => ids.includes(s.u) && s.atMs > death.atMs).length,
          blows: events.filter((e) => e.atMs > death.atMs && (ids.includes(e.u) || ids.includes(e.t))).length };
      };
      const mis = mk();
      const srv = server(M, mis, { hunt: HUNT });
      const steps = [], events = [];
      let ids = [];
      /* the first commit is one swing long, so both heroes are named before any death (a fast one fell inside a first 10 s commit, unnamed) */
      for (let t = T0 + 2000; t <= T0 + 600000 && !mis.every((m) => m.unitId === null && m.huntSession.swingIndex > 0); t += t === T0 + 2000 ? 8000 : 10000) {
        const c = srv.commit(t);
        if (!ids.length) ids = mis.map((m) => m.unitId);
        if (c) { steps.push(...c.tl.hunt_track); events.push(...c.tl.hunt_events); }
      }
      const closed = after(steps, events, ids);
      const vm = mk();
      let vids = [];
      const v = run(M, vm, closed ? closed.at + 4000 : 1000, { server: { hunt: HUNT }, commitMs: 2000,
        onCommit: () => { if (!vids.length) vids = vm.map((m) => m.unitId); } });
      const viewed = after(v.fed.steps, v.fed.events, vids);
      console.log(`  LV-Q a Sewer duo's tank falls at ${closed && closed.at} ms (blows to a 1/${SHARE} of its ${tankHp} HP): after it, closed ${closed && closed.steps} hero steps / ${closed && closed.blows} blows, viewed ${viewed && viewed.steps} / ${viewed && viewed.blows}`);
      ok('LV-Q', !!closed && !!viewed, 'the duo never lost a hero in 10 minutes (the rule needs a death)');
      ok('LV-Q', closed && closed.steps === 0 && closed.blows === 0, `browser closed: after the death the party took ${closed && closed.steps} steps and ${closed && closed.blows} blows`);
      ok('LV-Q', viewed && viewed.steps === 0 && viewed.blows === 0, `viewed: after the death the party took ${viewed && viewed.steps} steps and ${viewed && viewed.blows} blows on screen`);
    } finally {
      deadly.back();
    }
  }

  { // LV-E: THE HUNT ENDS IN THE BROWSER WITHOUT FREEZING IT (Andy, live v0.2.22: "crashing in Coppercap Warrens
    // when my tank dies ... both games freeze ... refresh doesn't work"). Every member of the instance left (the
    // tank died, the party's hunt with it): the engine's clock stands, and the live view must stop there, not run
    // empty swings forever. The real LiveLink frame step, VIEWED (the death played live) and on a RELOAD (a start
    // point from before the death, caught up across it), runs in a child process: a frame that never returns is
    // a timeout there, not a hung test.
    const mis = [memberOf(M, 'a', 0, 'tank', 3), memberOf(M, 'b', 1, 'melee_dps', 30)];
    for (const m of mis) m.huntId = 'coppercap_warrens';
    mis[0].hp = 30;
    const where = M.HG.huntGroundOf('coppercap_warrens');
    const ctl = M.AC.accrueHunt({ instance: { id: 'i-live', nextSwingAtMs: T0, world: null, worldSwing: 0 }, window: { fromMs: T0, toMs: T0 + 16000 },
      secret: SECRET, ground: where.ground, grid: where.grid, items: M.ITEMS, monsters: M.MONSTERS, members: clone(mis) });
    const why = ctl.members.map((p) => p.hunt && p.hunt.ended && p.hunt.ended.reason).join(',');
    ok('LV-E', why === 'died,party_member_died', `the fixture's tank did not die with its partner's hunt ended after it (ends: ${why})`);
    const code = `
      import { pathToFileURL } from 'node:url';
      import { join } from 'node:path';
      const o = JSON.parse(process.env.LV_E);
      const { HARNESS: H } = await import(o.test);
      const M = await H.load(o.base);
      const { LiveLink } = await import(pathToFileURL(join(o.base, 'src/session/live-link.js')).href);
      const mis = o.mis;
      const srv = H.server(M, mis, { hunt: 'coppercap_warrens' });
      const start = srv.live('b');   // the server never settles: the start point stays the one before the death
      const once = (from, toMs) => {
        let clock = from;
        const link = new LiveLink({ timeline: M.TL.createTimeline(), now: () => clock, emit: () => {} });
        link.from({ hunt_live: start, hunt_server_now_ms: from });
        const ms = [];
        let swings = 0;
        for (; clock <= toMs; clock += 16) {
          const t = performance.now();
          swings += link.advance(clock);
          ms.push(performance.now() - t);
        }
        return { ms, swings, frames: ms.length, ended: link.ended(), running: link.running(), stats: link.stats };
      };
      /* A frame's cost is its FASTEST of five identical plays (the run is deterministic, frame i is the same
         work each time). Another process taking the CPU lands on a random frame of one play, never on the same
         frame of all five (2026-10-22: 67 ms under load, 29.7 and 7.8 ms alone); work the frame really does
         costs it in every play. */
      const play = (from, toMs) => {
        const runs = [0, 1, 2, 3, 4].map(() => once(from, toMs));
        const worst = Math.max(...runs[0].ms.map((_, i) => Math.min(...runs.map((r) => r.ms[i]))));
        const same = runs.every((r) => r.frames === runs[0].frames && r.swings === runs[0].swings);
        return Object.assign({}, runs[0], { ms: undefined, worst: Math.round(worst * 10) / 10, same });
      };
      const viewed = play(o.T0, o.T0 + 20000);
      const reload = play(o.T0 + 20000, o.T0 + 22000);
      console.log(JSON.stringify({ viewed, reload }));`;
    const { spawnSync } = process.getBuiltinModule('node:child_process');
    const ch = spawnSync(process.execPath, ['--input-type=module', '-e', code], { encoding: 'utf8', timeout: 20000,
      env: Object.assign({}, process.env, { LV_E: JSON.stringify({ test: import.meta.url, base: M.base || ROOT, mis, T0 }) }) });
    const line = (ch.stdout || '').trim().split('\n').pop();
    let r = null;
    try { r = JSON.parse(line); } catch { r = null; }
    if (!r) ok('LV-E', false, ch.error && ch.error.code === 'ETIMEDOUT' ? 'the live view froze: a frame step after the tank died never returned within 20 s'
      : 'the live view child failed: ' + String(ch.stderr || ch.error || '').trim().slice(0, 300));
    else {
      console.log(`  LV-E tank died: viewed ${r.viewed.frames} frames, ${r.viewed.swings} swing(s) run, slowest frame ${r.viewed.worst} ms, ended ${r.viewed.ended}; reload 20 s later: slowest frame ${r.reload.worst} ms, ended ${r.reload.ended}`);
      ok('LV-E', r.viewed.ended && !r.viewed.running && r.reload.ended && !r.reload.running,
        `after the tank died the prediction reads ended ${r.viewed.ended} / running ${r.viewed.running} (viewed), ${r.reload.ended} / ${r.reload.running} (reload), want ended and not running`);
      ok('LV-E', r.viewed.swings <= 3, `the viewed live view ran ${r.viewed.swings} swings for a hunt that ended at its second boundary (empty swings after the end)`);
      ok('LV-E', r.viewed.same && r.reload.same, 'the five plays of one start point did not run the same frames and swings (the fastest-of-five reading needs a deterministic play)');
      ok('LV-E', r.viewed.worst < 50 && r.reload.worst < 50, `a frame step took ${r.viewed.worst} ms (viewed) / ${r.reload.worst} ms (reload), budget 50 ms`);
    }
  }

  { // LV-RR: the party's rare roll is drawn on the server's loot stream only
    /* The rare rows come FIRST, so the prediction's constant loot stream (its second draw is 0.0003) rolls a
       rare of its own on most kills: the filter, not luck, is what keeps it off the screen. */
    const rareCat = Object.fromEntries(Object.entries(M.MONSTERS).map(([id, m]) => [id,
      { ...m, drops: [...Array.from({ length: 10 }, () => ({ id: 'crown_shard', ch: 0.05 })), ...(m.drops || [])] }]));
    const mis = [memberOf(M, 'a', 0, 'tank', 6), memberOf(M, 'b', 1, 'melee_dps', 6)];
    const r = run(M, mis, 160000, { server: { monsters: rareCat } });
    const srvRolls = r.verdicts.flatMap((x) => x.tl.hunt_events.filter((e) => e.type === 'rare_roll'));
    const fedRolls = r.fed.events.filter((e) => e.type === 'rare_roll');
    console.log(`  LV-RR: the server rolled ${srvRolls.length} rare(s) over ${r.verdicts.length} commits; the browser fed ${fedRolls.length} roll(s) of its own; crown shards paid ${r.srv.drops.crown_shard || 0}`);
    ok('LV-RR', srvRolls.length > 0, 'CONTROL: the server rolled no rare in 160 s with ten 5% rows on every monster');
    ok('LV-RR', fedRolls.length === 0, `the browser's prediction fed ${fedRolls.length} rare roll(s) drawn on its constant loot stream`);
    ok('LV-RR', (r.srv.drops.crown_shard || 0) >= srvRolls.length, `the server paid ${r.srv.drops.crown_shard || 0} Crown Shards for ${srvRolls.length} rolls`);
    const off = r.verdicts.filter((x) => x.v !== 'match').length;
    ok('LV-RR', off === 0, `${off} of ${r.verdicts.length} commits off the prediction over ${srvRolls.length} server rare rolls (the rotation re-seeded the live view)`);
  }

  { // LV-G: A LONG HUNT COSTS WHAT A SHORT ONE DOES (2026-10-21, a 260-min party hunt read "freezing"). Per settle, the
    // server's input (the stored world and every member's session), its output (the world it stores) and
    // the engine's work (steps + events) in the last 10 minutes of a 40-minute Sewer duo stay within 2x the first 10
    // minutes'; the browser's held combat seeds stay within 2x the look-ahead at every commit (kept from the first seed
    // ever sent, they grew by 8 every commit and each reconcile re-copied them all).
    const mis = [memberOf(M, 'a', 0, 'tank', 30), memberOf(M, 'b', 1, 'melee_dps', 30)];
    for (const m of mis) m.huntId = 'millrace_sewer';
    const srv = server(M, mis, { hunt: 'millrace_sewer' });
    const E = M.LE.createLiveEngine({ items: M.ITEMS, monsters: M.MONSTERS });
    E.seed(srv.live('a'));
    const SPAN = 40 * 60000, EDGE = 10 * 60000;
    const early = { input: 0, output: 0, work: 0 }, late = { input: 0, output: 0, work: 0 };
    let held = 0, stopped = null, worldMax = 0;
    for (let t = T0 + 16000; t <= T0 + SPAN; t += 16000) {
      E.advance(t, () => {});
      const input = JSON.stringify({ w: srv.inst.world, m: mis.map((m) => m.huntSession) }).length;
      const c = srv.commit(t);
      if (!c) { stopped = t - T0; break; }
      if (E.reconcile(c.check) !== 'match') E.seed(srv.live('a'));
      held = Math.max(held, E.heldSeeds());
      worldMax = Math.max(worldMax, srv.inst.world.length);
      const output = srv.inst.world.length, work = c.tl.hunt_track.length + c.tl.hunt_events.length;
      const at = t - T0 <= EDGE ? early : t - T0 > SPAN - EDGE ? late : null;
      if (at) { at.input = Math.max(at.input, input); at.output = Math.max(at.output, output); at.work = Math.max(at.work, work); }
    }
    console.log(`  LV-G 40-min Sewer duo: per settle, input ${early.input} -> ${late.input} B, world ${early.output} -> ${late.output} B (max ${worldMax}), engine work ${early.work} -> ${late.work} steps+events; browser holds at most ${held} seeds (look-ahead ${M.TUNE.liveSeeds})`);
    ok('LV-G', stopped === null, `the settle stopped answering ${stopped} ms into the hunt (a world past worldMaxBytes is refused)`);
    for (const k of ['input', 'output', 'work']) {
      ok('LV-G', early[k] > 0 && late[k] <= 2 * early[k], `the settle's ${k} grew with the hunt's age: ${early[k]} in the first 10 min, ${late[k]} in the last`);
    }
    ok('LV-G', held <= 2 * M.TUNE.liveSeeds, `the browser holds ${held} combat seeds after 40 min, over 2x the look-ahead (${M.TUNE.liveSeeds}): they grow with the hunt's age`);
  }

  { // LV-W: a RESTARTED instance (no world, its swing counter kept: hr_hunt_start) runs live from its first swing
    const mis = [memberOf(M, 'a', 0, 'tank', 6)];
    const srv = server(M, mis);
    srv.inst.world_swing = 40;
    const E = M.LE.createLiveEngine({ items: M.ITEMS, monsters: M.MONSTERS });
    E.seed(srv.live('a'));
    let ran = 0;
    for (let t = T0; t <= T0 + 16000; t += 100) ran += E.advance(t, () => {});
    const c = srv.commit(T0 + 16000);
    const v = c ? E.check(c.check) : null;
    console.log(`  LV-W restarted instance (world_swing 40): ${ran} swing(s) predicted, running ${E.running()}, commit ${v}`);
    ok('LV-W', E.running() && ran >= 8 && v === 'match', `a restarted instance's prediction ran ${ran} swing(s) (running ${E.running()}) and its commit read ${v}, want 8+ and match`);
  }

  { // LV-O: a hunt left open across a deploy that moved the world's field list (its stored world is of
    // another shape) keeps running: the settle restarts the world from the stored swing instead of
    // refusing every fire (a frozen hunt), and a browser opened on it predicts the same restart.
    try {
      const mis = [memberOf(M, 'a', 0, 'tank', 6)];
      const srv = server(M, mis);
      const first = srv.commit(T0 + 16000);
      const enc = JSON.parse(srv.inst.world);
      srv.inst.world = JSON.stringify(Object.assign({}, enc, { s: (enc.s + 1) >>> 0 }));
      const swingBefore = srv.inst.world_swing;
      const E = M.LE.createLiveEngine({ items: M.ITEMS, monsters: M.MONSTERS });
      E.seed(srv.live('a'));
      let ran = 0;
      for (let t = T0 + 16000; t <= T0 + 32000; t += 100) ran += E.advance(t, () => {});
      const c = srv.commit(T0 + 32000);
      const v = c ? E.check(c.check) : null;
      console.log(`  LV-O stored world of another shape: settle ${c ? 'accrued' : 'did not accrue'} from swing ${swingBefore} to ${c && c.check.world_swing}, browser ran ${ran} swing(s), commit ${v}`);
      ok('LV-O', !!first && !!c && c.check.world_swing > swingBefore, 'the settle did not run on from the stored swing over a world of another shape');
      ok('LV-O', JSON.parse(srv.inst.world).s === enc.s, 'the settle did not re-save the world under the current shape');
      ok('LV-O', ran >= 8 && v === 'match', `the browser over the old-shape world ran ${ran} swing(s) and its commit read ${v}, want 8+ and match`);
      const bad = (() => { try { M.WS.decodeStored({ v: enc.v, s: enc.s, w: [], u: 'x', p: [] }); return false; } catch { return true; } })();
      ok('LV-O', bad, 'a malformed world of the current shape was read instead of refused');
    } catch (e) {
      ok('LV-O', false, 'a world of another shape threw: ' + String(e && e.message).slice(0, 120));
    }
  }

  { // LV-S: a setup changed mid-hunt with the browser closed (server commits only).
    const NEW = { stance: 'offensive', distance: 3, chase: false, target_mode: 'weakest' };
    const mis = [memberOf(M, 'a', 0, 'tank', 6), memberOf(M, 'b', 1, 'melee_dps', 6)];
    const srv = server(M, mis);
    const E = M.LE.createLiveEngine({ items: M.ITEMS, monsters: M.MONSTERS });
    for (let t = T0 + 16000; t <= T0 + 48000; t += 16000) srv.commit(t);
    E.seed(srv.live('a'));
    const unitOf = (key) => {
      const w = srv.inst.world ? M.WS.decode(JSON.parse(srv.inst.world)) : null;
      const m = mis.find((x) => x.key === key);
      return w && m ? w.units.find((u) => u.id === m.unitId) : null;
    };
    srv.commit(T0 + 64000);
    const kept = E.sameSetup(srv.live('a'));
    /* the viewer's own hero (a) and a peer's (b, frozen in a's start point) change their settings */
    mis[0].hero = M.SPAWN.heroSetup({ weaponType: 'shield', options: NEW, bar: [], partyRoles: ['tank', 'melee_dps'] });
    const ownNew = !E.sameSetup(srv.live('a'));
    E.seed(srv.live('a'));
    mis[1].hero = M.SPAWN.heroSetup({ weaponType: 'hammer', options: { stance: 'defensive' }, bar: [], partyRoles: ['tank', 'melee_dps'] });
    const peerNew = !E.sameSetup(srv.live('a'));
    srv.commit(T0 + 80000);
    const u = unitOf('a:0'), p = unitOf('b:0');
    ok('LV-S', kept, 'a start point with no setup change reads as a new setup (the browser would restart every commit)');
    ok('LV-S', ownNew && peerNew, `a start point after a setup change reads as the same setup (own ${!ownNew}, peer ${!peerNew})`);
    ok('LV-S', !!u && u.stance === NEW.stance && u.dist === NEW.distance && u.chase === NEW.chase && u.tmode === NEW.target_mode,
      `with the browser closed the next commit left the hero unit at ${JSON.stringify(u && { stance: u.stance, dist: u.dist, chase: u.chase, tmode: u.tmode })}`);
    ok('LV-S', !!p && p.stance === 'defensive', `the peer's unit after its change stands ${p && p.stance}`);
  }

  { // LV-R
    const mis = [memberOf(M, 'a', 0, 'tank', 6)];
    const tl = M.TL.createTimeline({ delayMs: 100, maxSteps: 256 });
    let clientT = 0; const OFF = 5000000;
    tl.ingest({ serverNowMs: T0 }, T0 - OFF);
    let prev = new Map(), maxStep = 0, eased = 0, verdict = null, verdictT = null;
    run(M, mis, 64000, {
      feed: (b) => tl.ingest(b, clientT),
      tamperAt: T0 + 20000,
      /* Off the server's world: the hero's HP, tile and pace in the browser's start point are not the server's. Rooted
         (speed 0), it stays off its true tile until the commit judges it: a hero that walks on with every pack down
         (report #69) walked a one-tile error off before the commit, and no unit was left to ease. */
      tamper: (E, srv) => {
        const live = srv.live('a');
        const w = M.WS.decode(JSON.parse(live.instance.world));
        const h = w.units.find((u) => u.side === 'hero');
        h.hp = Math.max(1, h.hp - 7); h.x = Math.max(1, h.x - 1); h.speed = 0;
        live.instance.world = JSON.stringify(M.WS.encode(w));
        E.seed(live);
      },
      onCommit: ({ t, v, E, srv }) => {
        if (v === 'diverged' && verdict === null) {
          verdict = v; verdictT = t;
          const res = E.reseed(srv.live('a'), t);
          /* the caller plays on what the swings run hold after the instant (live-link.js _restart) */
          const ends = new Map();
          if (res) { eased = tl.rebase(t, res.positions, 250, ends); tl.ingest({ track: res.track.filter((s) => !(ends.get(s.u) >= s.atMs)), events: res.events, units: res.units, fromMs: res.fromMs }, clientT); }
        }
      },
      onTick: ({ t, E }) => {
        clientT = t - OFF;
        for (let k = 0; k < 6; k++) {
          const now = clientT + k * 16.7;
          for (const u of tl.units()) {
            const p = tl.positionAt(u, now);
            const q = prev.get(u);
            if (p && q && verdictT !== null && t >= verdictT && t <= verdictT + 3000) maxStep = Math.max(maxStep, Math.hypot(p.x - q.x, p.y - q.y));
            if (p) prev.set(u, p);
          }
        }
      },
    });
    console.log(`  LV-R: verdict ${verdict}, ${eased} unit(s) eased, largest frame step ${maxStep.toFixed(3)} tiles`);
    ok('LV-R', verdict === 'diverged', `a tampered prediction was judged ${verdict} at the next commit, want diverged`);
    ok('LV-R', eased > 0, 'the reseed eased no unit onto the server\'s world');
    ok('LV-R', maxStep < 0.5, `a frame moved a unit ${maxStep.toFixed(2)} tiles during the reconcile (budget: under half a tile; a teleport is >= 1)`);
  }
  { /* LV-N EVERY UNIT A RESTART PLACES IS NAMED (Andy 10-22, "[hunt-scene] no sprite for unit 780 (null)"):
       the server settles to the boundary AFTER its now, so a restart drawn at now - liveDelay + ease
       (live-link.js _restart) usually lies before the start point's next swing and runs none. */
    const mis = [memberOf(M, 'a', 0, 'tank', 6)];
    const srv = server(M, mis);
    let restarts = 0, beforeNext = 0;
    const unnamed = [];
    for (let t = T0 + 16700; t <= T0 + 160700; t += 16000) {
      srv.commit(t);
      const live = srv.live('a');
      const at = t - 150, ahead = 250;
      if (at + ahead < Number(live.instance.next_swing_at_ms)) beforeNext++;
      const res = M.LE.createLiveEngine({ items: M.ITEMS, monsters: M.MONSTERS }).reseed(live, at, ahead);
      if (!res) continue;
      restarts++;
      for (const u of res.positions.keys()) if (!(res.units[u] && typeof res.units[u][0] === 'string')) unnamed.push((t - T0) + ':' + u);
    }
    console.log(`  LV-N: ${restarts} restart(s), ${beforeNext} before the start point's next swing; ${unnamed.length} unit(s) placed with no kind`);
    ok('LV-N', restarts >= 9 && beforeNext >= 9, `CONTROL: ${restarts} restarts, ${beforeNext} of them before the next swing (want every one)`);
    ok('LV-N', unnamed.length === 0, `a restart placed ${unnamed.length} unit(s) with no kind (the scene cannot draw them): ${unnamed.slice(0, 6).join(', ')}`);
    /* ...and a unit that SPAWNS inside the catch-up's last swing, after the instant it eases onto (its first steps
       are played on), is named too: a restart a few seconds behind a four-hero party's commits ("[hunt-scene] no
       sprite for unit 6..17 (null)", Andy #65 at a hero switch). */
    const four = ['tank', 'ranger', 'tank', 'melee_dps'].map((role, i) => memberOf(M, 'p' + i, i, role, 6));
    const srv4 = server(M, four);
    let spawned = 0;
    const unnamedSpawn = [];
    for (let t = T0 + 16000; t <= T0 + 240000; t += 16000) {
      srv4.commit(t);
      for (const lag of [1900, 9000]) {
        const res = M.LE.createLiveEngine({ items: M.ITEMS, monsters: M.MONSTERS }).reseed(srv4.live('p0'), t + lag - 150, 250);
        if (!res) continue;
        const first = new Set(res.track.filter((s) => !res.positions.has(s.u)).map((s) => s.u));
        spawned += first.size;
        for (const u of first) if (!(res.units[u] && typeof res.units[u][0] === 'string')) unnamedSpawn.push((t - T0) + '+' + lag + ':' + u);
      }
    }
    console.log(`  LV-N spawns inside a catch-up (a four-hero party, restarts 1.9 and 9 s behind its commits): ${spawned} unit(s) first seen after the eased instant, ${unnamedSpawn.length} with no kind`);
    ok('LV-N', spawned > 0, 'CONTROL: no restart caught a unit spawning after the instant it eases onto');
    ok('LV-N', unnamedSpawn.length === 0, `a restart played on ${unnamedSpawn.length} unit(s) spawned in its last swing with no kind: ${unnamedSpawn.slice(0, 6).join(', ')}`);
  }
  { /* LV-4P ANDY'S OWN PARTY, EVERY HERO VIEWED IN TURN (#64/#65, live v0.2.45: "match 0, diverged 26"; since v0.2.42,
       5a6e449b6: spell versions and output grow with the caster's level). Four heroes of ONE account at Coppercap
       Warrens, Level 35, each on its role's default bar (the core spell naming the store rune, food and drink from the
       store); the Ranger wears Barbed Arrows (a few carried, then the store's at its share) and its bar names Iron Arrows it
       carries a dozen of. A peer's Fireball and Mend must land as hard in the browser as on the server (frozen `lv`), and its
       carried Iron and bought Barbed shots must hit as they do there (frozen `shots`), or the prediction leaves the server's world. */
    const party = () => {
      const roles = ['tank', 'ranger', 'mage', 'healer'];
      const kit = { tank: { weapon: 'steel_sword', shield: 'coppercap_shield', helmet: 'steel_helm', body: 'steel_platebody', pants: 'steel_platelegs', boots: 'steel_boots' },
        ranger: { weapon: 'maple_bow', ammo: 'barbed_arrows', helmet: 'boarhide_helmet', body: 'boarhide_body', pants: 'boarhide_pants', boots: 'boarhide_boots' },
        mage: { weapon: 'willow_wand', shield: 'willow_spellbook', helmet: 'scholar_helmet', body: 'scholar_body', pants: 'scholar_pants', boots: 'scholar_boots' },
        healer: { weapon: 'willow_staff', helmet: 'scholar_helmet', body: 'scholar_body', pants: 'scholar_pants', boots: 'scholar_boots' } };
      const at = (metric, value) => [{ metric, op: 'lt', value }];
      const rangerBar = [{ action: { type: 'consume', id: 'salted_shrimp' }, conditions: at('self_hp_pct', 60), join: 'and' },
        { action: { type: 'attack_with_item', id: 'iron_arrows' }, conditions: [], join: 'and' }];
      return roles.map((role, i) => {
        const mi = memberOf(M, 'andy', i, role, 35);
        mi.key = 'andy:' + i; mi.slot = i; mi.sessionId = 's-andy-' + i; mi.huntId = 'coppercap_warrens'; mi.gold = 50000; mi.hp = 1e9;
        mi.equipment = kit[role];
        mi.skills = { ...mi.skills, magic: M.XP.skillXpForLevel('magic', 35) };
        mi.huntSession = Object.assign({}, mi.huntSession, { id: 's-andy-' + i, bag: role === 'ranger' ? { barbed_arrows: { loaded: 6, left: 6 }, iron_arrows: { loaded: 12, left: 12 } } : {} });
        mi.hero = M.SPAWN.heroSetup({ weaponType: M.HR.wornRoleKey(kit[role], M.ITEMS), options: role === 'healer' ? { role: 'healer' } : {},
          bar: role === 'ranger' ? rangerBar : [], partyRoles: roles, leaveTogether: true, lead: i === 0 });
        return mi;
      });
    };
    const SPAN = 160000;
    /* BROWSER CLOSED: the server's commits alone (every hero unwatched); the prediction is display only, so a viewed run's
       commits must be these. */
    const hashesOf = (o) => { const h = []; return [h, Object.assign({ server: { hunt: 'coppercap_warrens' }, onCommit: ({ c }) => h.push(c.check.world_hash) }, o)]; };
    const [closedHashes, closedOpt] = hashesOf();
    const closedParty = party();
    const closed = run(M, closedParty, SPAN, closedOpt);
    const evs = closed.verdicts.flatMap((x) => x.tl.hunt_events);
    const castsBy = (id) => evs.filter((e) => e.type === 'cast' && e.ability === id).length;
    const ironShots = evs.filter((e) => e.type === 'shot' && e.item === 'iron_arrows').length, bought = closed.srv.buys.plain_barbed_arrows || 0;
    const scaled = castsBy('fireball') + castsBy('greater_mend') + castsBy('mend');
    console.log(`  LV-4P closed (Andy's own party, Warrens L35, ${SPAN / 1000} s): ${closed.verdicts.length} commits; Fireball ${castsBy('fireball')}, Mend ${castsBy('greater_mend') + castsBy('mend')}, Precision Shot ${castsBy('precision_shot')}, carried Iron Arrow shots ${ironShots}, store Barbed shots ${bought}`);
    ok('LV-4P', closed.verdicts.length >= 9, `CONTROL: ${closed.verdicts.length} server commits in ${SPAN / 1000} s`);
    ok('LV-4P', scaled >= 3 && ironShots >= 6 && bought >= 6, `CONTROL: in ${SPAN / 1000} s the party cast ${scaled} level-scaled spell(s), shot ${ironShots} carried Iron Arrow(s) and bought ${bought} Barbed shot(s)`);
    for (let v = 0; v < 4; v++) {
      const [hashes, opt] = hashesOf({ viewer: { user: 'andy', slot: v } });
      const r = run(M, party(), SPAN, opt);
      const n = { match: 0, diverged: 0, unknown: 0 };
      for (const x of r.verdicts) n[x.v]++;
      const first = r.verdicts.find((x) => x.v !== 'match');
      console.log(`  LV-4P viewed hero ${v}: ${r.verdicts.length} commits, match ${n.match}, diverged ${n.diverged}, unknown ${n.unknown}${first ? ' (first off at ' + (first.t - T0) / 1000 + ' s)' : ''}`);
      ok('LV-4P', n.match > 0 && n.match === r.verdicts.length, `viewing hero ${v}: ${n.match} of ${r.verdicts.length} commits matched the prediction (diverged ${n.diverged}, unknown ${n.unknown})`);
      ok('LV-4P', hashes.length === closedHashes.length && hashes.every((h, k) => h === closedHashes[k]), `viewing hero ${v} changed the server's commits`);
    }
  }
  { /* LV-$ the slot ORDER is the fallback, viewed and with the browser closed */
    const mi = memberOf(M, 'a', 0, 'tank', 6);
    mi.huntSession = Object.assign({}, mi.huntSession, { bag: { cooked_shrimp: { loaded: 3, left: 3, essential: true } } });
    const at95 = [{ metric: 'self_hp_pct', op: 'lt', value: 95 }];
    mi.hero = M.SPAWN.heroSetup({ weaponType: 'shield', options: {}, partyRoles: ['tank'],
      bar: [{ action: { type: 'consume', id: 'cooked_shrimp' }, conditions: at95, join: 'and' },
        { action: { type: 'consume', id: 'salted_trout' }, conditions: at95, join: 'and' }] });
    const r = run(M, [mi], 160000);
    const meals = (evs) => evs.filter((e) => e.type === 'eat').map((e) => e.item + ':' + e.source);
    const dry = (evs) => evs.filter((e) => e.type === 'slot_dry').map((e) => [e.item, e.next, e.slot].join(','));
    const closedEvs = r.verdicts.flatMap((x) => x.tl.hunt_events);
    const closed = meals(closedEvs), viewed = meals(r.fed.events);
    const bad = r.verdicts.filter((x) => x.v !== 'match');
    const order = (m) => { const k = m.findIndex((x) => x !== 'cooked_shrimp:own'); return k === 3 && m.slice(3).every((x) => x === 'salted_trout:store'); };
    console.log(`  LV-$: the server ate ${closed.length} meal(s) [${[...new Set(closed)].join(', ')}], the browser predicted ${viewed.length}; run-out ${JSON.stringify(dry(closedEvs))}; ${bad.length} of ${r.verdicts.length} commits off`);
    ok('LV-$', closed.length > 3, 'CONTROL: the tank ate ' + closed.length + ' meal(s) in 160 s, not past its 3 own shrimp');
    ok('LV-$', order(closed), 'browser closed: slot 1 (3 own shrimp) then slot 2 (Salted Trout) did not fire in order: ' + JSON.stringify(closed));
    ok('LV-$', order(viewed), 'viewed: the browser predicted ' + JSON.stringify(viewed));
    ok('LV-$', JSON.stringify(dry(closedEvs)) === JSON.stringify(['cooked_shrimp,salted_trout,2']), 'the server\'s run-out event read ' + JSON.stringify(dry(closedEvs)) + ', want slot 2 (Salted Trout) taking over');
    ok('LV-$', bad.length === 0, bad.length + ' commit(s) did not match the prediction');
  }
  { /* LV-WAITS a slot says why it isn't firing from the engine's own test of the world the prediction runs (slot-waits.js), asked on every tick */
    const mi = memberOf(M, 'a', 0, 'mage', 1);
    mi.equipment = { weapon: 'practice_wand', shield: 'practice_spellbook' };
    mi.huntSession = Object.assign({}, mi.huntSession, { bag: { chalked_fire_rune: { loaded: 200, left: 200 }, cooked_shrimp: { loaded: 30, left: 30, essential: true } } });
    const fire ={ action: { type: 'ability', id: 'fireball' }, conditions: [{ metric: 'enemies_in_aoe', op: 'gte', value: 2 }], join: 'and' };
    mi.hero = M.SPAWN.heroSetup({ weaponType: 'wand', options: {}, partyRoles: ['mage'], bar: [fire] });
    const said = { held: 0, free: 0, idle: 0 };
    const r = run(M, [mi], 96000, { onTick: ({ E }) => {
      const test = E.slotTester(E.selfUnit());
      if (!test) { said.idle++; return; }
      if (test(fire).pass) said.free++; else said.held++;
    } });
    const bad = r.verdicts.filter((x) => x.v !== 'match');
    const casts = r.fed.events.filter((e) => e.type === 'cast' && e.ability === 'fireball').length;
    console.log('  LV-WAITS: over 96 s of a Mage\'s prediction the slot read held ' + said.held + ', free ' + said.free + ', nothing engaged ' + said.idle + ' ticks; Fireball cast ' + casts + ' times; ' + bad.length + ' of ' + r.verdicts.length + ' commits off');
    ok('LV-WAITS', said.held > 0, 'CONTROL: the prediction never read Fireball as held back: ' + JSON.stringify(said));
    ok('LV-WAITS', said.free > 0 && casts > 0, 'CONTROL: Fireball never had its two monsters: ' + JSON.stringify(said) + ', ' + casts + ' casts');
    ok('LV-WAITS', said.idle > 0, 'nothing engaged never read as nothing to judge (between pulls): ' + JSON.stringify(said));
    ok('LV-WAITS', r.verdicts.length > 0 && bad.length === 0, bad.length + ' commit(s) did not match with the slot asked every tick: asking moved the prediction');
    ok('LV-WAITS', r.E.slotTester(987654) === null, 'a unit nobody plays has a tester');
  }
  { /* LV-RANGER a Ranger's bar, viewed and with the browser closed (Andy 2026-10-23, Fremulon) */
    const mi = memberOf(M, 'a', 0, 'ranger', 10);
    /* Melee 15 meets the Copper Whetstone's own requirement. At Level 10's Melee the skill gate (abilities.js shotLocked) passes it over first, which hid whether a bow may shoot it: this rule is the weapon's (damage.js pickShot). */
    mi.skills = Object.assign({}, mi.skills, { melee: M.XP.skillXpForLevel('melee', 15) });
    mi.huntSession = Object.assign({}, mi.huntSession, { bag: { iron_arrows: { loaded: 400, left: 400 }, copper_whetstone: { loaded: 50, left: 50 },
      cooked_shrimp: { loaded: 30, left: 30, essential: true } } });
    const slot = (type, id) => ({ action: { type, id }, conditions: [], join: 'and' });
    mi.hero = M.SPAWN.heroSetup({ weaponType: 'ranged', options: {}, partyRoles: ['ranger'],
      bar: [slot('ability', 'hunters_mark'), slot('ability', 'precision_shot'), slot('attack_with_item', 'copper_whetstone'), slot('attack_with_item', 'iron_arrows')] });
    const r = run(M, [mi], 160000);
    const casts = (evs) => evs.filter((e) => e.type === 'cast').map((e) => e.ability);
    const shots = (evs) => evs.filter((e) => e.type === 'shot').map((e) => e.item);
    const closedEvs = r.verdicts.flatMap((x) => x.tl.hunt_events);
    /* the browser runs a swing or so past the last commit: the viewed half is judged on the committed span */
    const viewedEvs = r.fed.events.filter((e) => e.atMs < r.srv.inst.settled_to_ms);
    const bad = r.verdicts.filter((x) => x.v !== 'match');
    const bag = mi.huntSession.bag;
    const n = (list, id) => list.filter((x) => x === id).length;
    console.log(`  LV-RANGER: the server cast ${JSON.stringify(casts(closedEvs))}, shot ${shots(closedEvs).length} [${[...new Set(shots(closedEvs))].join(', ')}]; arrows ${bag.iron_arrows.left}/400, whetstones ${bag.copper_whetstone.left}/50; the browser cast ${casts(viewedEvs).length}, shot ${shots(viewedEvs).length}; ${bad.length} of ${r.verdicts.length} commits off`);
    ok('LV-RANGER', shots(closedEvs).length >= 10, 'CONTROL: the Ranger shot ' + shots(closedEvs).length + ' time(s) in 160 s');
    ok('LV-RANGER', shots(closedEvs).every((id) => id === 'iron_arrows') && bag.copper_whetstone.left === 50,
      'browser closed: a bow shot a whetstone (slot 3, ahead of its arrows): shots ' + JSON.stringify([...new Set(shots(closedEvs))]) + ', ' + bag.copper_whetstone.left + ' of 50 whetstones left');
    ok('LV-RANGER', n(casts(closedEvs), 'precision_shot') >= 3 && n(casts(closedEvs), 'hunters_mark') >= 1,
      'browser closed: with no ammo worn the shot spells never cast on the bar\'s arrows: ' + JSON.stringify(casts(closedEvs)));
    ok('LV-RANGER', bag.iron_arrows.left === 400 - shots(closedEvs).length - n(casts(closedEvs), 'precision_shot'),
      'browser closed: ' + (400 - bag.iron_arrows.left) + ' arrows spent for ' + shots(closedEvs).length + ' shots + ' + n(casts(closedEvs), 'precision_shot') + ' Precision Shots');
    ok('LV-RANGER', JSON.stringify(casts(viewedEvs)) === JSON.stringify(casts(closedEvs)) && JSON.stringify(shots(viewedEvs)) === JSON.stringify(shots(closedEvs)),
      'viewed: the browser predicted casts ' + JSON.stringify(casts(viewedEvs)) + ' and ' + shots(viewedEvs).length + ' shots');
    ok('LV-RANGER', bad.length === 0, bad.length + ' commit(s) did not match the prediction');
  }
  { /* LV-SHOT-SKILL a slot's ammo under its skill, viewed and with the browser closed: the server and the browser pass over it alike */
    const mi = memberOf(M, 'a', 0, 'ranger', 42);
    mi.huntSession = Object.assign({}, mi.huntSession, { bag: { mithril_arrows: { loaded: 400, left: 400 }, iron_arrows: { loaded: 400, left: 400 }, cooked_shrimp: { loaded: 30, left: 30, essential: true } } });
    const slot = (id) => ({ action: { type: 'attack_with_item', id }, conditions: [], join: 'and' });
    mi.hero = M.SPAWN.heroSetup({ weaponType: 'ranged', options: {}, partyRoles: ['ranger'], bar: [slot('mithril_arrows'), slot('iron_arrows')] });
    const r = run(M, [mi], 96000);
    const shots = (evs) => evs.filter((e) => e.type === 'shot').map((e) => e.item);
    const closedEvs = r.verdicts.flatMap((x) => x.tl.hunt_events);
    const viewedEvs = r.fed.events.filter((e) => e.atMs < r.srv.inst.settled_to_ms);
    const bad = r.verdicts.filter((x) => x.v !== 'match');
    const bag = mi.huntSession.bag;
    console.log('  LV-SHOT-SKILL: Ranged 42, the server shot ' + shots(closedEvs).length + ' [' + [...new Set(shots(closedEvs))].join(', ') + '], Mithril ' + bag.mithril_arrows.left + '/400; the browser shot ' + shots(viewedEvs).length);
    ok('LV-SHOT-SKILL', shots(closedEvs).length >= 10, 'CONTROL: the Ranger shot ' + shots(closedEvs).length + ' time(s) in 96 s');
    ok('LV-SHOT-SKILL', shots(closedEvs).every((id) => id === 'iron_arrows') && bag.mithril_arrows.left === 400, 'browser closed: a Ranged 42 hero shot Mithril Arrows (Ranged 45): ' + JSON.stringify([...new Set(shots(closedEvs))]) + ', ' + bag.mithril_arrows.left + ' of 400 left');
    ok('LV-SHOT-SKILL', JSON.stringify(shots(viewedEvs)) === JSON.stringify(shots(closedEvs)), 'viewed: the browser predicted ' + shots(viewedEvs).length + ' shots of ' + JSON.stringify([...new Set(shots(viewedEvs))]));
    ok('LV-SHOT-SKILL', bad.length === 0, bad.length + ' commit(s) did not match the prediction');
  }
  { /* LV-NOFIGHT a hero who can't fight goes home, viewed and with the browser closed */
    const SPAN = M.HSD.NO_FIGHT_END_MIN * 60000;
    const mi = memberOf(M, 'a', 0, 'ranger', 30);
    mi.equipment = { weapon: 'shortbow' };
    mi.huntSession = Object.assign({}, mi.huntSession, { bag: {}, supplySource: 'mine', onEmpty: 'end' });
    mi.hero = M.SPAWN.heroSetup({ weaponType: 'ranged', options: {}, partyRoles: ['ranger'], bar: [] });
    const srv = server(M, [mi]);
    const E = M.LE.createLiveEngine({ items: M.ITEMS, monsters: M.MONSTERS });
    E.seed(srv.live(mi.user, 0));
    const verdicts = []; let end = null;
    for (let t = T0; t <= T0 + SPAN + 32000 && !end; t += 100) {
      E.advance(t, () => {});
      if ((t - T0) % 16000 === 0 && t > T0) {
        const c = srv.commit(t);
        if (!c) continue;
        if (c.ends.length) end = c.ends[0]; else verdicts.push(E.reconcile(c.check));
      }
    }
    const off = verdicts.filter((v) => v !== 'match');
    console.log('  LV-NOFIGHT: browser closed, ' + JSON.stringify(end) + '; viewed, ' + verdicts.length + ' commits before it, ' + off.length + ' off');
    ok('LV-NOFIGHT', !!end && end.reason === 'no_fight' && Date.parse(end.at) === T0 + SPAN, 'browser closed: a bare bow ended ' + JSON.stringify(end) + ', want no_fight at +' + SPAN + ' ms');
    ok('LV-NOFIGHT', verdicts.length > 30 && off.length === 0, 'viewed: ' + off.length + ' of ' + verdicts.length + ' commits did not match the prediction');
  }
  { /* LV-CLASS PARTY LEVEL XP (Tyler 2026-10-31), both paths: a Melee and a Ranger in the Cellar earn the table's cell over
       the even share (src/data/party-class-xp.js, read here: lane/b-party-xp moved it 1070 -> 1210); a Melee and a Melee earn the even share. The same swings pay the same XP viewed and browser closed. */
    const SPAN = 240000;
    const cast = { mixed: ['tank', 'ranger'], same: ['tank', 'melee_dps'] };
    for (const [name, roles] of Object.entries(cast)) {
      const heroes = () => roles.map((r, i) => memberOf(M, 'ab'[i], i, r, 6));
      /* BROWSER CLOSED: one long settle, nobody watching. */
      const closedMis = heroes();
      const closed = server(M, closedMis);
      const before = closedMis.map((m) => m.levelXp);
      const c = closed.commit(T0 + SPAN);
      const closedXp = closedMis.map((m, i) => m.levelXp - before[i]);
      const evs = c.tl.hunt_events.filter((e) => e.type === 'xp');
      const paid = evs.reduce((s, e) => s + e.amount, 0), raw = evs.reduce((s, e) => s + e.raw, 0);
      /* VIEWED: the browser predicting swing by swing beside the server's 16 s commits. A swing plays once its START is
         reached (live-engine.js advance), so the prediction stands one swing past the last commit: its `xp` is summed over
         the swings that commit settled, and the swing past it is held to the server's next commit (lane/b-ground-formula-fix:
         the formula's Cellar rows put two kills in that swing, and the whole-run sum read 436 against the commit's 420). */
      const viewedMis = heroes();
      const v0 = viewedMis.map((m) => m.levelXp);
      const batches = [];
      const r = run(M, viewedMis, SPAN, { feed: (b) => batches.push(b) });
      const viewedXp = viewedMis.map((m, i) => m.levelXp - v0[i]);
      const xpBy = (evList) => { const o = {}; for (const e of evList) if (e.type === 'xp') o[e.u] = (o[e.u] || 0) + e.amount; return viewedMis.map((m) => o[m.unitId] || 0); };
      const settled = r.srv.inst.settled_to_ms;
      const shownXp = xpBy(batches.filter((b) => b.toMs <= settled).flatMap((b) => b.events));
      const ahead = batches.filter((b) => b.fromMs >= settled);
      const aheadTo = Math.max(settled, ...ahead.map((b) => b.toMs));
      const aheadXp = xpBy(ahead.flatMap((b) => b.events));
      const next = r.srv.commit(aheadTo + 16000);
      const nextXp = xpBy(next ? next.tl.hunt_events.filter((e) => e.atMs < aheadTo) : []);
      const off = r.verdicts.filter((x) => x.v !== 'match').length;
      console.log('  LV-CLASS ' + name + ': closed ' + closedXp + ', viewed ' + viewedXp + ', prediction ' + shownXp + ' (and ' + aheadXp + ' in the ' + ahead.length + ' swing(s) past the last commit, next commit ' + nextXp + '), ' + (raw ? (paid / raw).toFixed(3) : '-') + 'x the even share, ' + off + ' commits off');
      ok('LV-CLASS', evs.length >= 8 && closedXp.every((x) => x > 0), name + ': the fixture earned ' + closedXp + ' on ' + evs.length + ' paid shares');
      ok('LV-CLASS', closedXp.join() === viewedXp.join(), name + ': viewed the server paid ' + viewedXp + ', with the browser closed ' + closedXp);
      ok('LV-CLASS', shownXp.join() === closedXp.join(), name + ': the prediction shows ' + shownXp + ', the server pays ' + closedXp);
      ok('LV-CLASS', !!next && aheadXp.join() === nextXp.join(), name + ': the prediction past the last commit shows ' + aheadXp + ', the next commit pays ' + nextXp);
      ok('LV-CLASS', off === 0, name + ': ' + off + ' of ' + r.verdicts.length + ' commits did not match the prediction');
      /* Whole shares floor: the cell moves each share before its floor, and the event's raw is the even share floored too (xp-share.js), so a kill of odd XP
         split two ways hides a half: the paid sum sits between the cell on the floored shares and the cell on those shares plus the hidden (n-1)/n. One class
         reads its own cell (read from the data, never typed: lane/d-solo-fifteen scaled every cell x1150/1050 with the +15% solo boost, Tyler 2026-11-11) and
         always sits under the mixed one (since the lane/b-one-difficulty re-tune a one-class cell is over the even share). */
      const cell = M.PCX.partyClassXp('mill_cellar', roles).permille, mixedCell = M.PCX.partyClassXp('mill_cellar', cast.mixed).permille;
      const want = evs.reduce((s, e) => s + Math.floor((e.raw * cell) / 1000 + 1e-9), 0);
      const most = evs.reduce((s, e) => s + Math.floor(((e.raw + (roles.length - 1) / roles.length) * cell) / 1000 + 1e-9), 0);
      ok('LV-CLASS', name === 'same' ? paid >= want && paid <= most && cell < mixedCell : paid >= want && paid > raw, name + ': ' + paid + ' Level XP on ' + raw + ' even shares (the cell ' + cell + ', ' + want + '-' + most + ' on the whole shares)');
    }
    /* A PARTY'S DEFAULT PULL (designer 2026-11-01), both paths: a Thicket pair with no pick stands at 3 each in the server's world
       and in the browser's, every commit matching; the same XP viewed and with the browser closed. */
    const pair = () => ['tank', 'ranger'].map((r, i) => memberOf(M, 'ab'[i], i, r, 6));
    const opt = { hunt: 'meadowbrook_thicket', id: 'i-pull' };
    const closedMis = pair(), c0 = closedMis.map((m) => m.levelXp);
    const closed = server(M, closedMis, opt);
    closed.commit(T0 + SPAN);
    const viewedMis = pair(), v0 = viewedMis.map((m) => m.levelXp);
    const r = run(M, viewedMis, SPAN, { server: opt });
    const closedXp = closedMis.map((m, i) => m.levelXp - c0[i]), viewedXp = viewedMis.map((m, i) => m.levelXp - v0[i]);
    const off = r.verdicts.filter((x) => x.v !== 'match').length;
    const pullOf = (s) => M.WS.decodeStored(JSON.parse(s.inst.world)).density;
    const closedPull = pullOf(closed), viewedPull = pullOf(r.srv);
    console.log('  LV-CLASS pull: density ' + closedPull + ' / ' + viewedPull + ', XP closed ' + closedXp + ', viewed ' + viewedXp + ', ' + off + ' commits off');
    /* ONE PACK ON NORMAL (Tyler 2026-11-11): a pair with no pick stands as built, as a hero alone does, on both doors */
    ok('LV-CLASS', closedPull === 0 && viewedPull === 0, 'pull: a Thicket pair with no pick stands at density ' + closedPull + ' closed, ' + viewedPull + ' viewed, want the room as built (0)');
    ok('LV-CLASS', closedXp.join() === viewedXp.join() && closedXp.every((x) => x > 0), 'pull: viewed the server paid ' + viewedXp + ', with the browser closed ' + closedXp);
    ok('LV-CLASS', off === 0, 'pull: ' + off + ' of ' + r.verdicts.length + ' commits did not match the prediction');
  }

  { // LV-SPELL: A MONSTER'S GROUP STRIKE, BOTH PATHS (Tyler 2026-11-08: "for the full group to take some damage"; lane/b-area-engine).
    // Every Cellar monster casts a group frost strike (a test row planted on the engine's own table, put back after): every
    // hero of a party of four, and a lone hero, is struck at every landing wherever it stands. The tank wears frost resistance
    // (a test resistPm on its shield) and takes at most half of what the others can. Browser closed: the server's commits.
    // Viewed: every commit matches the prediction, the marks (spell / spell_end) the browser plays are the server's, and the
    // tank's resistance reaches the browser through its frozen row (a peer's in the party).
    /* THE FIRST CAST IS STAGGERED over the cooldown (SPELL_STAGGER, lane/d-spell-tuning) and plays here as shipped: a four fells a Cellar pack in seconds, so the row's
       warning and cooldown are short enough that some casts start before their caster falls (at 2 s and 6 s the four saw none in 96 s). */
    const SPELL = { n: 'Test Squall', shape: 'group', range: 6, windupMs: 1200, cdMs: 2400, hitPm: 2000, element: 'frost' }, SID = 'lv_squall';
    const kinds = [...new Set(M.HG.huntGroundOf('mill_cellar').ground.pockets.flatMap((p) => [...(p.spawns || []), ...(p.pack || [])].map((s) => s.monster || s)))]
      .filter((k) => M.ENGINE_MONSTERS[k]);
    const rows = [M.ENGINE_MONSTERS, M.MONSTERS];
    const keep = kinds.map((k) => rows.map((t) => [Object.prototype.hasOwnProperty.call(t[k], 'spells'), t[k].spells]));
    const shield = M.ITEMS.practice_shield, hadResist = Object.prototype.hasOwnProperty.call(shield, 'resistPm'), oldResist = shield.resistPm;
    M.ENGINE_SPELLS[SID] = SPELL;
    const wasLive = M.ENGINE_SPELL_SWITCH.live;
    M.ENGINE_SPELL_SWITCH.live = true;
    /* ...and stand ten times their health: since one Normal pack for every group (lane/c-brook-bear) a four fells the Cellar's in seconds and one cast landed in 96 s */
    const keepHp = kinds.map((k) => rows.map((t) => t[k].hp));
    for (const k of kinds) for (const t of rows) { t[k].spells = [SID]; t[k].hp *= 10; }
    /* asked 50%, worn at the 40% cap (data/elements.js HERO_RESIST_PM) */
    shield.resistPm = { frost: 500 };
    try {
      for (const [name, mis] of [['four', [memberOf(M, 'a', 0, 'tank', 6), memberOf(M, 'b', 1, 'melee_dps', 6), memberOf(M, 'c', 2, 'ranger', 6), memberOf(M, 'd', 3, 'melee_dps', 6)]],
        ['lone', [memberOf(M, 'a', 0, 'tank', 6)]]]) {
        const r = run(M, mis, 96000, { viewer: { user: mis[mis.length - 1].user, slot: 0 } });
        const server = r.verdicts.flatMap((x) => x.tl.hunt_events);
        const ends = server.filter((e) => e.type === 'spell_end' && e.why === 'landed');
        const heroes = mis.map((m) => m.unitId);
        /* (two casters may land in one instant: each landing is its own caster's hits) */
        const hitAt = (at, u) => server.filter((e) => e.type === 'dmg' && e.ability === SID && e.atMs === at && e.u === u).map((e) => e.t).sort((a, b) => a - b);
        const missed = ends.filter((e) => e.hits !== heroes.length || JSON.stringify(hitAt(e.atMs, e.u)) !== JSON.stringify(heroes.slice().sort((a, b) => a - b)));
        console.log(`  LV-SPELL ${name}: ${ends.length} group strikes landed on the server's commits, ${missed.length} missed a hero; ${r.verdicts.filter((x) => x.v === 'match').length} of ${r.verdicts.length} commits matched`);
        ok('LV-SPELL', ends.length >= 3, `${name}: browser closed: ${ends.length} group strikes landed in 96 s (the rule needs some)`);
        ok('LV-SPELL', missed.length === 0, `${name}: browser closed: a group strike missed a hero of ${heroes.length} at ${missed.map((e) => e.atMs - T0)}`);
        const off = r.verdicts.filter((x) => x.v !== 'match');
        ok('LV-SPELL', r.verdicts.length >= 5 && off.length === 0, `${name}: viewed: ${off.length} of ${r.verdicts.length} commits did not match the prediction`);
        const fed = new Set(r.fed.events.filter((e) => e.type === 'spell' || e.type === 'spell_end').map((e) => JSON.stringify(e)));
        const marks = server.filter((e) => e.type === 'spell' || e.type === 'spell_end');
        ok('LV-SPELL', marks.length > 0 && marks.every((e) => fed.has(JSON.stringify(e))), `${name}: viewed: ${marks.filter((e) => !fed.has(JSON.stringify(e))).length} of the server's ${marks.length} marks were not the browser's`);
        /* the tank's resistance: its hits stay inside the capped share of the strike's top (balanced stance, no armor worn), the others' go past it */
        const tank = mis[0].unitId;
        const amounts = (pred) => server.filter((e) => e.type === 'dmg' && e.ability === SID && pred(e.t)).map((e) => e.amount);
        const T = amounts((t) => t === tank), O = amounts((t) => t !== tank);
        const top = Math.max(...kinds.map((k) => Math.floor((M.ENGINE_COMBAT.monsterMaxHit(M.ENGINE_MONSTERS[k]) * SPELL.hitPm) / 1000)));
        const cap = Math.floor((top * M.ENGINE_ELEMENTS.heroElementPermille({ frost: 500 }, 'frost')) / 1000);
        ok('LV-SPELL', T.length > 0 && Math.max(...T) <= cap && (name === 'lone' || Math.max(...O) > cap), `${name}: the frost-resisting tank took ${Math.max(...T, 0)} at most (cap ${cap} of the top ${top}), the rest ${Math.max(...O, 0)}`);
      }
    } finally {
      delete M.ENGINE_SPELLS[SID];
      M.ENGINE_SPELL_SWITCH.live = wasLive;
      kinds.forEach((k, i) => rows.forEach((t, j) => { const [had, v] = keep[i][j]; if (had) t[k].spells = v; else delete t[k].spells; t[k].hp = keepHp[i][j]; }));
      if (hadResist) shield.resistPm = oldResist; else delete shield.resistPm;
    }
  }

  { // LV-STAGGER: THE FIRST CAST'S STAGGER, BOTH PATHS (Tyler 2026-11-08: a pack must not open with every cast at once; lane/d-spell-tuning's
    // SPELL_STAGGER, played as shipped). Every Cellar monster casts a weak group spell on a long cooldown at a lone tank it cannot fell, so
    // each caster's FIRST cast is its drawn wait. Browser closed: the server's commits. Viewed: the prediction, cast for cast.
    const SPELL = { n: 'Test Drizzle', shape: 'group', range: 6, windupMs: 1200, cdMs: 8000, hitPm: 100, element: null }, SID = 'lv_drizzle';
    const kinds = [...new Set(M.HG.huntGroundOf('mill_cellar').ground.pockets.flatMap((p) => [...(p.spawns || []), ...(p.pack || [])].map((s) => s.monster || s)))]
      .filter((k) => M.ENGINE_MONSTERS[k]);
    const rows = [M.ENGINE_MONSTERS, M.MONSTERS];
    const keep = kinds.map((k) => rows.map((t) => [Object.prototype.hasOwnProperty.call(t[k], 'spells'), t[k].spells]));
    const wasLive = M.ENGINE_SPELL_SWITCH.live;
    M.ENGINE_SPELLS[SID] = SPELL;
    M.ENGINE_SPELL_SWITCH.live = true;
    for (const k of kinds) for (const t of rows) t[k].spells = [SID];
    try {
      ok('LV-STAGGER', Number.isInteger(M.ENGINE_SPELL_STAGGER.spanPm) && M.ENGINE_SPELL_STAGGER.spanPm > 0, 'the stagger ships off (SPELL_STAGGER.spanPm ' + M.ENGINE_SPELL_STAGGER.spanPm + '): the rule has nothing to play');
      const play = () => run(M, [memberOf(M, 'a', 0, 'tank', 6)], 180000, { viewer: { user: 'a', slot: 0 } });
      const casts = (r) => r.verdicts.flatMap((x) => x.tl.hunt_events).filter((e) => e.type === 'spell' && e.spell === SID);
      const r = play();
      const server = casts(r);
      /* each caster's first cast, and how many different instants they start at: a pack that opens at once shares one */
      const first = new Map();
      for (const e of server) if (!first.has(e.u)) first.set(e.u, e.atMs);
      const instants = new Set(first.values());
      console.log(`  LV-STAGGER: ${first.size} casters' first casts start at ${instants.size} different instants on the server's commits; ${r.verdicts.filter((x) => x.v === 'match').length} of ${r.verdicts.length} commits matched`);
      ok('LV-STAGGER', first.size >= 4 && instants.size * 5 >= first.size * 4, `browser closed: ${first.size} casters' first casts start at only ${instants.size} different instants (a pack opened at once)`);
      ok('LV-STAGGER', JSON.stringify(casts(play())) === JSON.stringify(server), 'browser closed: the same seed played twice gave different casts');
      const off = r.verdicts.filter((x) => x.v !== 'match');
      ok('LV-STAGGER', r.verdicts.length >= 5 && off.length === 0, `viewed: ${off.length} of ${r.verdicts.length} commits did not match the prediction`);
      const fed = r.fed.events.filter((e) => e.type === 'spell' && e.spell === SID).map((e) => e.u + '@' + e.atMs);
      const want = server.map((e) => e.u + '@' + e.atMs);
      ok('LV-STAGGER', want.every((k) => fed.includes(k)), `viewed: ${want.filter((k) => !fed.includes(k)).length} of the server's ${want.length} casts were not the browser's, start for start`);
    } finally {
      delete M.ENGINE_SPELLS[SID];
      M.ENGINE_SPELL_SWITCH.live = wasLive;
      kinds.forEach((k, i) => rows.forEach((t, j) => { const [had, v] = keep[i][j]; if (had) t[k].spells = v; else delete t[k].spells; }));
    }
  }

  { // LV-KINDS: THE KRELL'S HOLD MONSTER KINDS, BOTH PATHS (the design's engine pieces 2, 3 and 4; tests/hunt-core/monster-kinds.mjs holds each
    // rule and its mutants). The Cellar's Hive Wasp SHOOTS (a row `range` of 4: src/core/hunt/shooters.js), its Slime MENDS its pull (a 'mend'
    // row: monster-spells.js), and two Melee heroes name a KIND FIRST (`target_kind`, hunt-spawn.js heroSetup): `c` the wasp, `b` the rat.
    // Every Cellar monster stands ten times its health so the fight lasts. Viewed by `c`, so b's kind reaches the browser only through its
    // frozen peer row (on "Follow", b would mostly be on the leader's slime: naming the rat moves its blows). BROWSER CLOSED: on the server's
    // commits the wasp shoots from range, the slime mends a packmate and `c` is on the wasp whenever one is engaged. VIEWED: every commit
    // matches the prediction, and every mend and every wasp blow the server played is the browser's, instant for instant.
    const SID = 'lv_mend', SPELL = { n: 'Test Mend', shape: 'mend', range: 4, windupMs: 1200, cdMs: 4000, hitPm: 1000, element: null };
    const kinds = ['rat', 'slime', 'hive_wasp'];
    const rows = [M.ENGINE_MONSTERS, M.MONSTERS];
    const had = (t, k, f) => [Object.prototype.hasOwnProperty.call(t[k], f), t[k][f]];
    const keep = kinds.map((k) => rows.map((t) => ({ hp: t[k].hp, range: had(t, k, 'range'), spells: had(t, k, 'spells') })));
    const wasLive = M.ENGINE_SPELL_SWITCH.live;
    M.ENGINE_SPELLS[SID] = SPELL;
    M.ENGINE_SPELL_SWITCH.live = true;
    for (const t of rows) { for (const k of kinds) t[k].hp *= 10; t.hive_wasp.range = 4; t.slime.spells = [SID]; }
    try {
      const mk = () => [['a', 'tank', null], ['b', 'melee_dps', 'rat'], ['c', 'melee_dps', 'hive_wasp']].map(([user, role, kind], i) => {
        const mi = memberOf(M, user, i, role, 6);
        mi.hero = M.SPAWN.heroSetup({ weaponType: role === 'tank' ? 'shield' : 'hammer', options: kind ? { target_kind: kind } : {},
          bar: [], partyRoles: ['tank', 'melee_dps', 'melee_dps'], lead: i === 0, leaveTogether: true });
        return mi;
      });
      const mis = mk();
      const n = { cWith: 0, cOnWasp: 0 };
      const r = run(M, mis, 96000, { viewer: { user: 'c', slot: 0 }, commitMs: 2000, onCommit: ({ srv }) => {
        if (!srv.inst.world) return;
        const w = M.WS.decode(JSON.parse(srv.inst.world));
        const at = (id) => w.units.find((u) => u.id === id);
        const wasps = w.units.filter((u) => u.side === 'mon' && u.alive && u.kind === 'hive_wasp' && Number.isInteger(u.target));
        const C = at(mis[2].unitId);
        if (wasps.length && C && Number.isInteger(C.target)) { n.cWith++; if ((at(C.target) || {}).kind === 'hive_wasp') n.cOnWasp++; }
      } });
      const server = r.verdicts.flatMap((x) => x.tl.hunt_events);
      const mends = server.filter((e) => e.type === 'heal' && e.spell === SID);
      /* each unit's kind, from the commits' unit books (hunt-track.js huntTimeline hunt_units: { id: [kind, maxHp, hp] }) */
      const kindOf = new Map();
      for (const x of r.verdicts) for (const [id, row] of Object.entries(x.tl.hunt_units || {})) kindOf.set(Number(id), row[0]);
      const waspBlows = server.filter((e) => (e.type === 'dmg' || e.type === 'miss') && kindOf.get(e.u) === 'hive_wasp');
      /* where each unit stood at a blow: the last step it began by then on the commits' tracks (every window anchors each standing unit
         on its tile, combat-sim.js ANCHORS; a unit swings only at rest) */
      const steps = r.verdicts.flatMap((x) => x.tl.hunt_track);
      const tileAt = (u, at) => { let p = null; for (const st of steps) if (st.u === u && st.atMs <= at) p = st; return p; };
      const fromRange = waspBlows.filter((e) => { const a = tileAt(e.u, e.atMs), b = tileAt(e.t, e.atMs); return a && b && Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y)) > 1; });
      const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
      console.log(`  LV-KINDS closed: ${mends.length} mends, ${waspBlows.length} wasp blows (${fromRange.length} from range), the Melee hero on a wasp at ${n.cOnWasp}/${n.cWith} boundaries; ${r.verdicts.filter((x) => x.v === 'match').length} of ${r.verdicts.length} commits matched`);
      ok('LV-KINDS', mends.length >= 2, `browser closed: ${mends.length} mends landed in 96 s (want 2+)`);
      /* (a hero that walks up to a shooter is shot from beside, as it should be: c walks to the wasp, so not every blow is from range) */
      ok('LV-KINDS', fromRange.length >= 5 && pct(fromRange.length, waspBlows.length) >= 50, `browser closed: the wasp shot ${waspBlows.length} times, ${fromRange.length} of them from range (want 5+ from range, half or more)`);
      ok('LV-KINDS', n.cWith >= 10 && pct(n.cOnWasp, n.cWith) >= 80, `browser closed: the Melee hero naming the wasp first was on one at ${n.cOnWasp} of ${n.cWith} boundaries (want 10+, 80%+)`);
      const off = r.verdicts.filter((x) => x.v !== 'match');
      ok('LV-KINDS', r.verdicts.length >= 20 && off.length === 0, `viewed: ${off.length} of ${r.verdicts.length} commits did not match the prediction`);
      const last = r.verdicts.length ? r.verdicts[r.verdicts.length - 1].t : 0;
      const key = (e) => e.type + ':' + e.atMs + ':' + e.u + '>' + e.t + ':' + (e.amount ?? '');
      const fed = new Set(r.fed.events.map(key));
      const want = mends.concat(waspBlows).filter((e) => e.atMs < last);
      ok('LV-KINDS', want.length > 0 && want.every((e) => fed.has(key(e))), `viewed: ${want.filter((e) => !fed.has(key(e))).length} of the server's ${want.length} mends and wasp blows were not the browser's`);
    } finally {
      delete M.ENGINE_SPELLS[SID];
      M.ENGINE_SPELL_SWITCH.live = wasLive;
      kinds.forEach((k, i) => rows.forEach((t, j) => {
        const was = keep[i][j];
        t[k].hp = was.hp;
        for (const f of ['range', 'spells']) { const [h, v] = was[f]; if (h) t[k][f] = v; else delete t[k][f]; }
      }));
    }
  }

  { // LV-AREA: A HERO'S AREA ABILITY, BOTH PATHS (Tyler 2026-11-08: "our heros some more aoe spells"; lane/b-area-set). A sword alone
    // with Turning Cut on its bar (a ring round the hero: each monster struck for a share of the hero's own largest blow, unlocked at a
    // level in its skill) beside a tank, WATCHED BY THE TANK: the caster is the browser's frozen peer, so its level (the unlock) and its
    // largest blow (the share) reach the prediction only through its frozen row (member.js frozenOf: lv, snap.maxHit).
    const row = M.ENGINE_ABILITIES.turning_cut;
    const slot = { action: { type: 'ability', id: 'turning_cut' }, conditions: [], join: 'and' };
    const pair = (level) => {
      const a = memberOf(M, 'a', 0, 'tank', level), b = memberOf(M, 'b', 1, 'melee_dps', level);
      b.equipment = { weapon: 'bronze_sword' };
      b.hero = M.SPAWN.heroSetup({ weaponType: 'sword', options: {}, bar: [slot], partyRoles: ['tank', 'melee_dps'], leaveTogether: true });
      return [a, b];
    };
    ok('LV-AREA', row && Number.isInteger(row.unlock) && row.unlock > 2 && row.target === 'ring' && Number.isInteger(row.hitPm), 'Turning Cut is no longer a ring with an unlock and a share: ' + JSON.stringify(row));
    for (const [name, level, casts] of [['at its unlock', row.unlock, true], ['under its unlock', row.unlock - 1, false]]) {
      const mis = pair(level);
      const r = withoutSpells(M, () => run(M, mis, 96000, { viewer: { user: 'a', slot: 0 } }));
      const server = r.verdicts.flatMap((x) => x.tl.hunt_events);
      const caster = mis[1].unitId;
      const cast = server.filter((e) => e.type === 'cast' && e.ability === 'turning_cut' && e.u === caster);
      const hits = server.filter((e) => e.type === 'dmg' && e.ability === 'turning_cut' && e.u === caster);
      const off = r.verdicts.filter((x) => x.v !== 'match');
      console.log(`  LV-AREA ${name} (Melee ${level}): ${cast.length} Turning Cuts on the server's commits, ${hits.length} monsters struck; ${r.verdicts.length - off.length} of ${r.verdicts.length} commits matched`);
      if (casts) ok('LV-AREA', cast.length >= 3 && hits.length >= cast.length, `${name}: browser closed: ${cast.length} casts struck ${hits.length} monsters in 96 s (the rule needs some)`);
      else ok('LV-AREA', cast.length === 0 && hits.length === 0, `${name}: browser closed: a hero at Melee ${level} cast Turning Cut ${cast.length} time(s) under its unlock ${row.unlock}`);
      ok('LV-AREA', r.verdicts.length >= 5 && off.length === 0, `${name}: viewed: ${off.length} of ${r.verdicts.length} commits did not match the prediction (first at +${off.length ? off[0].t - T0 : 0} ms)`);
    }
  }
  return fails;
}
const sorted = (o) => Object.fromEntries(Object.entries(o).sort());

const MUTANTS = [
  ['the browser drops the live event windows (LV-EVENT)', 'src/hunt-view/live-engine.js', 'xpMultOf: lx ? xpMultFor(sides, (sd) => lx[String(sd.mi.key)]) : null,', 'xpMultOf: null,', /^LV-EVENT: \d+ of the server's/],
  ['a kill reads its dial with no time (LV-EVENT)', 'src/core/hunt/xp-share.js', 'const m = f ? f(hero, sc.atMs) : 1;', 'const m = f ? f(hero) : 1;', /^LV-EVENT: (\d+ xp event|the leader earned)/],
  ['the start point drops the windows (LV-EVENT)', 'supabase/functions/hr-accrue/hunt-settle.js', '...(members.some((m) => m.liveXp) ?', '...(false ?', /^LV-EVENT: \d+ of the server's/],
  ['the browser plays a scaled hunt unscaled (LV-SCALE)', 'src/hunt-view/live-engine.js', 'monsters, items, ...(s.scale ? { scale: s.scale } : {}),', 'monsters, items,', /^LV-SCALE: (solo|party): \d+ of/],
  ['the start point drops the scale (LV-SCALE)', 'supabase/functions/hr-accrue/hunt-settle.js', '      scale: play.level === null ? null : { level: play.level },', '      scale: null,', /^LV-SCALE: (solo|party): \d+ of/],
  ["a peer is frozen against the catalogue's rows (LV-SCALE)", 'supabase/functions/hr-accrue/hunt-settle.js', 'Number(inst.next_swing_at_ms), rows) };', 'Number(inst.next_swing_at_ms)) };', /^LV-SCALE: party: \d+ of/],
  ['a spawn reads the catalogue row (LV-SCALE)', 'src/core/hunt/pull-cycle.js', 'const row = (inst.monsters || MONSTERS)[s.monster];', 'const row = MONSTERS[s.monster];', /^LV-SCALE: .*scaled rows' health/],
  ['a kill pays the catalogue Level XP (LV-SCALE)', 'src/core/hunt/damage.js', 'xp: Math.round(atTier(row, inst.tier).xp', 'xp: Math.round(atTier(MONSTERS[target.kind], inst.tier).xp', /^LV-SCALE: a scaled kill paid .* Level XP/],
  ["a kill's coin is the catalogue's (LV-SCALE)", 'src/core/combat-sim.js', 'monsters: play.monsters || ctx.monsters, tier,', 'monsters: ctx.monsters, tier,', /^LV-SCALE: a scaled kill paid .* coin/],
  ['a monster swings its catalogue row (LV-SCALE)', 'src/core/hunt/damage.js', 'const row = atTier(rowOf(inst, u.kind), inst.tier);', 'const row = atTier(MONSTERS[u.kind], inst.tier);', /^LV-SCALE: a scaled monster's hardest blow/],
  ['the prediction never answers why a slot waits (LV-WAITS)', 'src/hunt-view/live-engine.js', 'return side ? slotTesterOf(st.world, st.where.grid, side.member, items) : null;', 'return null;', /^LV-WAITS: CONTROL: the prediction never read/],
  ['asking why a slot waits moves the prediction (LV-WAITS)', 'src/hunt-view/live-engine.js', '    const t = testSlot(inst, u, h, slot);\n', '    const t = testSlot(inst, u, h, slot);\n    u.mana -= 1;\n', /^LV-WAITS: \d+ commit/],
  ['the engine shoots ammo under its skill (LV-SHOT-SKILL)', 'src/core/hunt/abilities.js', "function shotLocked(h, id) {\n", "function shotLocked(h, id) {\n  if (h) return false;\n", /^LV-SHOT-SKILL: browser closed/],
  ["the peer's Level stays out of its frozen row, so the browser predicts the low seat a full share (LV-U)", 'src/core/member.js', 'armour: snap.armour || null, level: snap.level }', 'armour: snap.armour || null }', /^LV-U: the prediction/],
  ['the party factor is not paid (LV-CLASS)', 'src/core/hunt/xp-share.js', '(raw * party * multOf(sc, h))', '(raw * 1000 * multOf(sc, h))', /^LV-CLASS: mixed/],
  ["the browser's prediction fights on a ground it cannot name (LV-CLASS, viewed)", 'src/hunt-view/live-engine.js',
    '    const where = huntGroundOf(String(live.instance.hunt));\n',
    "    const real = huntGroundOf(String(live.instance.hunt));\n    const where = real && { grid: real.grid, ground: Object.assign({}, real.ground, { id: 'nowhere' }) };\n", /^LV-CLASS: mixed: (the prediction|\d+ of)/],
  /* (re-aimed, lane/c-brook-bear: the server's party pull is retired, so the plant gives the browser's prediction a bigger pack of its own:
     every pocket's first four rows as built, where the server spawns the room as built) */
  ["the browser's prediction draws a bigger pack than the server (LV-CLASS, viewed)", 'src/hunt-view/live-engine.js',
    '    const where = huntGroundOf(String(live.instance.hunt));\n',
    '    const real = huntGroundOf(String(live.instance.hunt));\n    const where = real && { grid: real.grid, ground: Object.assign({}, real.ground, { pockets: real.ground.pockets.map((p) => Object.assign({}, p, { spawns: (p.pack || p.spawns).slice(0, 4) })) }) };\n', /^LV-CLASS: pull: \d+ of/],
  ['a shield Melee and a Melee count as two classes (LV-CLASS)', 'src/data/party-class-xp.js',
    "melee: Object.freeze({ label: 'Melee', roles: Object.freeze(['tank', 'melee_dps']) }),",
    "melee: Object.freeze({ label: 'Melee', roles: Object.freeze(['melee_dps']) }), tanks: Object.freeze({ label: 'Tank', roles: Object.freeze(['tank']) }),", /^LV-CLASS: same/],
  /* A real per-frame slowdown: every 100th frame step does 60 ms of work, in every play (LV-E budget). */
  ['a frame step stalls 60 ms every 100 frames (LV-E budget)', 'src/session/live-link.js', '  advance(clientNow) {\n',
    '  advance(clientNow) {\n    this.__n = (this.__n || 0) + 1;\n    if (this.__n % 100 === 0) { const t = performance.now(); while (performance.now() - t < 60); }\n', /^LV-E: a frame step took/],
  ['the no_fight end never fires (LV-NOFIGHT)', 'src/core/action-rules.js', '  no_fight: (hs, t) => Number.isInteger(hs.fightAtMs) && t - Math.max(hs.fightAtMs, Number(hs.huntFromMs) || 0) >= NO_FIGHT_END_MIN * 60000,', '  no_fight: () => false,', /^LV-NOFIGHT/],
  ['drops rolled on the combat stream (LV-L)', 'src/core/combat-sim.js', "rng: createRng(seedOf(ctx, 'r', sw))", "rng: createRng(seedOf(ctx, 's', sw))", /^LV-L/],
  ['the prediction shows its own rare rolls (LV-RR)', 'src/hunt-view/live-engine.js', 'sim.events.filter(predicted)', 'sim.events', /^LV-RR/],
  ['the rare roll\'s rotation back in the reconcile key (LV-RR)', 'src/core/hunt/world-state.js', '  for (const [i, kind] of SERVER_ONLY_AT) w[i] = KINDS[kind].blank();\n', '', /^LV-RR/],
  ['the reseed teleports (LV-R)', 'src/hunt-view/timeline.js', 'const dur = Math.max(easeMs || 250, Math.ceil(dist * EASE_MS_PER_TILE));', 'const dur = 1;', /^LV-R/],
  ['a restart before the next swing places units with no kind (LV-N, Andy 10-22)', 'src/hunt-view/live-engine.js', '      hp[u.id] = [u.kind, u.maxHp, u.hp];\n', '', /^LV-N/],
  ['every commit reads as a match (LV-R)', 'src/hunt-view/live-engine.js', "return h === hc.world_hash ? 'match' : 'diverged';", "return 'match';", /^LV-R/],
  ['a called boss crosses no lines (LV-CALL)', 'src/core/hunt/boss-phases.js', "sc.emit(makeEvent('boss_phase', sc.atMs, { u: t.id, phase: 'adds' }));", '', /^LV-CALL/],
  ['every pack down, the leader stands on the pocket it cleared (LV-DOWN, report #69)', 'src/core/hunt/pull-cycle.js',
    '    else awaitPack(inst, k, p);\n', '', /^LV-DOWN: closed/],
  ['a melee hero beside its target steps to another side every repath (LV-M)', 'src/core/hunt/roles.js',
    '  if (cheb(h, tgt) <= 1 && atRest(h)) { clearGoal(h); return; }\n  if (h.aiMs > 0) return;\n  h.aiMs = AI_REPATH_MS.melee;\n  const beside = (list) => (x, y) => list.some((m) => cheb(m, { x, y }) <= 1 && (m.x !== x || m.y !== y) && standable(inst, h, m.pocket, x, y));',
    '  if (h.aiMs > 0) return;\n  h.aiMs = AI_REPATH_MS.melee;\n  const beside = (list) => (x, y) => list.some((m) => cheb(m, { x, y }) <= 1 && (m.x !== x || m.y !== y) && standable(inst, h, m.pocket, x, y)) && (x !== h.x || y !== h.y);', /^LV-M/],
  ['a non-holder steals from the holder (LV-T, live v0.2.24)', 'src/core/hunt/targeting.js', ' && (holds || onNonTank(m)));', ');', /^LV-T/],
  ['the holder never rotates (LV-T)', 'src/core/hunt/targeting.js', 'return tanks[runs % tanks.length];', 'return tanks[0];', /^LV-T/],
  ['a peer row carries its full setup (LV-P)', 'supabase/functions/hr-accrue/hunt-settle.js', '      if (!self) {', '      if (false) {', /^LV-P/],
  ['the look-ahead is its own number at the edge (LV-H)', 'supabase/functions/hr-accrue/hunt-settle.js', 'export const LIVE_SEEDS = HUNT_TUNING.liveSeeds;', 'export const LIVE_SEEDS = 64;', /^LV-H/],
  ['the holder walks out of its pack area (LV-KITE)', 'src/core/hunt/leash.js', 'return held < 0 || inArea(inst, held, x, y);', 'return true;', /^LV-KITE: browser closed/],
  ['a walled pull stays on short ground (LV-RING, Andy #64)', 'src/core/hunt/pull-cycle.js', '    if (walled && !arrived && roomierEdge(inst, k, p, Math.round(c.x), Math.round(c.y))) return;\n', '', /^LV-RING: browser closed/],
  ['the tank plants wherever the pull leaves him (LV-OPEN, Tyler + Andy 10-25)', 'src/core/hunt/roles.js', '  if (plantOpen(inst, h, onMe, near, zone)) return;\n', '', /^LV-OPEN: browser closed/],
  ["the browser's pack area is not the server's (LV-OPEN, viewed)", 'src/hunt-view/live-engine.js',
    '    const where = huntGroundOf(String(live.instance.hunt));\n',
    '    const real = huntGroundOf(String(live.instance.hunt));\n    const where = real && { grid: real.grid, ground: Object.assign({}, real.ground, { leashMargin: 0 }) };\n', /^LV-OPEN: viewed/],
  ['a second tank holds where it stands (LV-T)', 'src/core/hunt/roles.js', "  if (!onMe.length) { h.spot = null; closeIn(inst, h, unitById(inst, h.target) || nearestTo(mons, h)); return; }\n", '', /^LV-T/],
  ['a pack opens with every cast at once (LV-STAGGER)', 'src/core/hunt/monster-spells.js', '    if (!u.spellCds) u.spellCds = firstCasts(sc, list);', '    if (!u.spellCds) u.spellCds = {};', /^LV-STAGGER: browser closed: \d+ casters/],
  ['every caster waits the same, the wait is not drawn (LV-STAGGER)', 'src/core/hunt/monster-spells.js', 'const wait = steps > 0 ? sc.rng.int(0, steps) * sc.dtMs : 0;', 'const wait = steps > 0 ? Math.floor(steps / 2) * sc.dtMs : 0;', /^LV-STAGGER: browser closed: \d+ casters/],
  ['a frozen peer row drops the levels its abilities read (LV-AREA)', 'src/core/member.js', '  for (const k of engineSkillsOf(m.hero.slots)) lv[k] = levelOf(m.state.skills, k);\n', '', /^LV-AREA: at its unlock: viewed/],
  ['an ability casts under its unlock (LV-AREA)', 'src/core/hunt/abilities.js', "    if (row.unlock && h.skills && skillLevel(h, row) < row.unlock) return { why: 'level' };\n", '', /^LV-AREA: under its unlock: browser closed/],
  ['a frozen peer row drops its kind first (LV-KINDS)', 'src/core/member.js', '    shield: m.shield === true, hero: m.hero, session, lv, shots };',
    '    shield: m.shield === true, hero: Object.assign({}, m.hero, { settings: m.hero.settings && Object.assign({}, m.hero.settings, { tkind: undefined }) }), session, lv, shots };', /^LV-KINDS: viewed/],
  ['a shooter shoots only from beside its target (LV-KINDS)', 'src/core/hunt/shooters.js', '  return r ? inShot(inst, m.x, m.y, t, r) : cheb(m, t) <= 1;', '  return cheb(m, t) <= 1;', /^LV-KINDS: browser closed: the wasp/],
  ['a mender never mends (LV-KINDS)', 'src/core/hunt/monster-spells.js', '  if (mends(sp)) return mendable(inst, u, sp);\n', '  if (mends(sp)) return null;\n', /^LV-KINDS: browser closed: \d+ mends/],
  ['a frozen peer row drops its resistance (LV-SPELL)', 'src/core/member.js', '  ...(snap.resistPm ? { resistPm: snap.resistPm } : {}) });', '  });', /^LV-SPELL: four: viewed/],
  ['a group strike lands only on its target (LV-SPELL)', 'src/core/hunt/shapes.js', "    case 'group': return true;", "    case 'group': return d === 0;", /^LV-SPELL: four: browser closed/],
  ['gear never sums its resistance (LV-SPELL)', 'src/core/combat.js', '  if (resist) Object.assign(s, { resistPm: resist });\n', '', /^LV-SPELL: four: the frost-resisting tank/],
  ['the swing runs on after a hero dies (LV-Q, live v0.2.23)', 'src/core/hunt/world-step.js', '    if (heroes.some((u) => !u.alive)) break;\n', '', /^LV-Q/],
  ['an ended instance keeps the prediction swinging (LV-E)', 'src/hunt-view/live-engine.js', 'if (!(sim.nextSwingAtMs > at)) {', 'if (false) {', /^LV-E/],
  ['a fresh world counts from 0, not the instance swing (LV-W)', 'src/hunt-view/live-engine.js', '      worldSwing: s.worldSwing },', '      worldSwing: 0 },', /^LV-W/],
  ['the settle refuses a stored world of another shape (LV-O)', 'supabase/functions/hr-accrue/accrual.js',
    "import { encode as encodeWorldRow, decodeStored as decodeWorldRow } from '../../../src/core/hunt/world-state.js';",
    "import { encode as encodeWorldRow, decode as decodeWorldRow } from '../../../src/core/hunt/world-state.js';", /^LV-O/],
  ['the browser refuses a stored world of another shape (LV-O)', 'src/hunt-view/live-engine.js',
    'decodeStored as decodeWorldRow }', 'decode as decodeWorldRow }', /^LV-O/],
  ['a member keeps the unit id of a world that is gone (LV-O)', 'src/core/combat-sim.js',
    '  if (!world) for (const m of members) m.unitId = null;\n', '', /^LV-O/],
  ['members run in another order than the server (LV-D)', 'src/hunt-view/live-engine.js', '.slice().sort((a, b) => (a.key < b.key ? -1 : 1))', '.slice().reverse()', /^LV-D/],
  ['a setup change is not written onto a standing hero (LV-S)', 'src/core/combat-sim.js', 'if (s.stance !== undefined) u.stance = s.stance;', 'void 0;', /^LV-S/],
  ['every start point reads as the setup already run (LV-S)', 'src/hunt-view/live-engine.js', 'setupOf(live) === st.setup,', 'true,', /^LV-S/],
  ['an empty own slot buys its store partner instead of falling to slot 2 (LV-$)', 'src/core/action-rules.js',
    "  if (c && c.source === 'own') return leftOf(hs, want) > 0 ? { id: want, source: 'own', price: 0 } : { why: 'none' };",
    "  if (c && c.source === 'own' && !(leftOf(hs, want) > 0) && shopShotFor(hs, want)) return { id: shopShotFor(hs, want).id, source: 'store', price: shopShotFor(hs, want).price };\n  if (c && c.source === 'own') return leftOf(hs, want) > 0 ? { id: want, source: 'own', price: 0 } : { why: 'none' };", /^LV-\$/],
  ['a bow shoots the whetstone an attack slot names (LV-RANGER, Andy 10-23)', 'src/core/hunt/damage.js',
    '    if (!shootsItem(u.role, itemRow(h, id))) return null;\n', '', /^LV-RANGER/, [['src/core/hunt/conditions.js', 'SHOOTERS.some((r) => shootsItem(r, ITEMS[id]))', "!!ITEMS[id] && ITEMS[id].reqSkill !== 'magic'"]]],
  ['a shot ability reads only the worn ammo (LV-RANGER, Andy 10-23)', 'src/core/hunt/abilities.js',
    "    const id = slot.action.id === 'loaded' ? h.ammo : slot.action.id;", '    const id = h.ammo;', /^LV-RANGER/],
  ['the browser keeps every combat seed since the hunt began (LV-G)', 'src/hunt-view/live-engine.js',
    'const keepFrom = Math.max(Math.min(st.seeds.from, from), st.world ? st.world.swing : st.worldSwing);', 'const keepFrom = Math.min(st.seeds.from, from);', /^LV-G/],
  ['corpses are never cleared from the stored world (LV-G)', 'src/core/hunt/pull-cycle.js', 'if (u.deadMs >= HUNT_TUNING.corpseMs) gone = true;', 'if (false) gone = true;', /^LV-G/],
  ['the browser drops the leader flag of a peer (LV-K)', 'src/core/member.js', '    hero: f.hero || {},', '    hero: Object.assign({}, f.hero, { lead: false }),', /^LV-K/],
  ['the browser drops the tier of a peer (LV-TIER)', 'src/core/member.js', '    hero: f.hero || {},', '    hero: Object.assign({}, f.hero, { tier: null }),', /^LV-TIER/],
  ["a spawn ignores the tier's health (LV-DIAL)", 'src/core/hunt/pull-cycle.js', 'const hp = Math.max(1, atTier(row, inst.tier).hp || 1);', 'const hp = Math.max(1, row.hp || 1);', /^LV-DIAL/],
  ['the browser drops the tier of a peer, health dial (LV-DIAL)', 'src/core/member.js', '    hero: f.hero || {},', '    hero: Object.assign({}, f.hero, { tier: null }),', /^LV-DIAL/],
  ["a peer's frozen numbers drop its Blows rung (LV-TEMPER)", 'src/core/member.js', '...(snap.blowsPm ? { blowsPm: snap.blowsPm } : {}), ', '', /^LV-TEMPER/],
  ["a peer's frozen numbers drop its Armor rung (LV-TEMPER)", 'src/core/member.js', '...(snap.armorPm ? { armorPm: snap.armorPm } : {}), ', '', /^LV-TEMPER/],
  ['the settle never puts the Armor rung on the hero (LV-TEMPER)', 'src/core/combat-sim.js', '  if (snap.armorPm) u.armorPm = snap.armorPm; else if (u.armorPm) delete u.armorPm;\n', '', /^LV-TEMPER/],
  ['the settle never puts the Blows rung on the hero (LV-TEMPER)', 'src/core/combat-sim.js', '  if (snap.blowsPm) u.blowsPm = snap.blowsPm; else if (u.blowsPm) delete u.blowsPm;\n', '', /^LV-TEMPER/],
  ["a peer's frozen numbers drop its jewelry perks (LV-JEWEL)", 'src/core/member.js', '...jewelSnap(snap), ', '', /^LV-JEWEL/],
  ['the settle never puts Follow-through on the hero (LV-JEWEL)', 'src/core/combat-sim.js', '  if (snap.followPm) u.followPm = snap.followPm; else if (u.followPm) delete u.followPm;\n', '', /^LV-JEWEL/],
  ["a peer's frozen numbers drop its armour (LV-A)", 'src/core/member.js', 'def: snap.def, armour: snap.armour || null, level: snap.level }, vs,', 'def: snap.def, level: snap.level }, vs,', /^LV-A/],
  ['the settle never puts the armour on the hero (LV-A)', 'src/core/combat-sim.js', '  u.armour = snap.armour || null;', '  u.armour = null;', /^LV-A/],
  ['the pull leader is back to role order (LV-PULL, bug #61)', 'src/core/hunt/pull-cycle.js', '  return holderTank(inst).id;\n', '  return byRole;\n', /^LV-PULL/],
  ['the "One tank holds" pick does not pull (LV-PULL)', 'src/core/hunt/pull-cycle.js', '  if (pick) return pick.id;\n', '  if (pick) return pickLeader(inst.world.units);\n', /^LV-PULL/],
  ['a world opened with a pick is pulled by role order its first lap (LV-PULL)', 'src/core/combat-sim.js',
    'world.hold = world.holdNext; world.leader = pullLeader({ world }); fresh = false;', 'world.hold = world.holdNext; fresh = false;', /^LV-PULL/],
  ["the settle never reads the leader's hold pick (LV-HOLD)", 'src/core/combat-sim.js',
    'world.holdNext = holdPick(members.filter((m) => !m.left && m.unitId !== null));', 'world.holdNext = null;', /^LV-HOLD/],
  ['a fresh world waits a lap for the pick (LV-HOLD)', 'src/core/combat-sim.js', '      if (fresh) { world.hold = world.holdNext; world.leader = pullLeader({ world }); fresh = false; }\n', '', /^LV-HOLD/],
  ['a change to the pick takes force mid-lap (LV-HOLD)', 'src/core/combat-sim.js',
    '      if (fresh) { world.hold = world.holdNext; world.leader = pullLeader({ world }); fresh = false; }', '      world.hold = world.holdNext; world.leader = pullLeader({ world }); fresh = false;', /^LV-HOLD/],
  ['the assembled hero loses the hold pick (LV-HOLD)', 'src/core/member.js', '        hold: Number.isInteger(h.hold) ? h.hold : null,\n', '', /^LV-HOLD/],
  ['the browser drops the hold pick of a peer (LV-HOLD)', 'src/core/member.js', '    hero: f.hero || {},', '    hero: Object.assign({}, f.hero, { hold: null }),', /^LV-HOLD/],
  ['the settle drops hr_hunt_instance_read hold_seat (LV-HOLD)', 'supabase/functions/hr-accrue/hunt-settle.js', 'lead: m._leads, hold: m._hold });', 'lead: m._leads });', /^LV-HOLD/],
  ["Follow reads only the leader's last blow (LV-TGT, Andy a08)", 'src/core/hunt/targeting.js',
    "return on && on.alive && on.side === 'mon' ? on.id : inst.world.leaderLast;", 'return inst.world.leaderLast;', /^LV-TGT: closed: "Follow"/],
  ['a melee follower keeps the monster it fights (LV-TGT, Andy a08)', 'src/core/hunt/targeting.js',
    "const STEADY_MODES = Object.freeze(['strongest', 'follow']);", 'const STEADY_MODES = Object.freeze([]);', /^LV-TGT: closed: "Follow"/],
  ['"Strongest" ranks nothing (LV-TGT)', 'src/core/hunt/targeting.js', '  strongest: () => (a, b) => b.maxHp - a.maxHp,', '  strongest: () => () => 0,', /^LV-TGT: closed: "Strongest"/],
  /* Andy #64/#65 (live v0.2.45, match 0): a peer the browser draws carries every input the engine reads, as a number. */
  ['a peer is frozen without its skill levels: its spells cast at level 1 (LV-4P)', 'src/core/member.js', '  for (const k of engineSkillsOf(m.hero.slots)) lv[k] = levelOf(m.state.skills, k);\n', '', /^LV-4P: viewing/],
  ['a frozen peer swings every shot on its worn rolls (LV-4P)', 'src/core/member.js', '    shotRolls: (m, ammo, sharePm, kind) => {', '    wornOnly: (m, ammo, sharePm, kind) => {', /^LV-4P: viewing/],
  ['a frozen peer\'s store shot hits as a carried one (LV-4P)', 'src/core/member.js', '      for (const pm of [1000, STORE_SHOT_PM]) {', '      for (const pm of [1000]) {', /^LV-4P: viewing/],
  ['a unit spawned in a catch-up\'s last swing has no kind (LV-N, Andy #65)', 'src/hunt-view/live-engine.js',
    'for (const s of track) { alive.add(s.u); if (!units[s.u] && !killed.has(s.u) && hp[s.u]) units[s.u] = rowAt(s.u); }', 'for (const s of track) alive.add(s.u);', /^LV-N: a restart played on/],
];

async function mutate() {
  let escaped = 0;
  /* `--only <text>`: just the mutants whose name holds <text> (a lane proves its own rule without the whole sweep) */
  const at = process.argv.indexOf('--only');
  const list = at > 0 ? MUTANTS.filter(([name]) => name.includes(String(process.argv[at + 1] || ''))) : MUTANTS;
  /* `more`: further [file, from, to] edits one mutant plants with its first (a rule two doors hold). */
  for (const [name, file, from, to, arm, more] of list) {
    const base = mkdtempSync(join(tmpdir(), 'hr-live-'));
    try {
      cpSync(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
      cpSync(join(ROOT, 'supabase', 'functions'), join(base, 'supabase', 'functions'), { recursive: true });
      for (const [fl, a, b] of [[file, from, to]].concat(more || [])) {
        const f = join(base, fl);
        const src = readFileSync(f, 'utf8');
        if (src.split(a).length !== 2) { console.error(`harness: anchor for "${name}" not found once`); process.exit(2); }
        writeFileSync(f, src.replace(a, b));
      }
      let fails;
      try { fails = rules(await load(base)); } catch (e) { fails = ['threw: ' + e.message]; }
      const hit = fails.some((x) => arm.test(x));
      console.log(`  ${hit ? 'caught ' : 'ESCAPED'} ${name}${hit ? '' : ' (' + fails.join(' | ').slice(0, 160) + ')'}`);
      if (!hit) escaped++;
    } finally { rmSync(base, { recursive: true, force: true }); }
  }
  console.log(escaped ? `hunt-live --mutate: ${escaped} ESCAPED` : `hunt-live --mutate: ${list.length}/${list.length} caught`);
  process.exit(escaped ? 1 : 0);
}

/* For tests/hunt-scene-live.mjs: the same members, server and start point. */
export const HARNESS = Object.freeze({ T0, load, memberOf, server, deadlyRows });

async function main() {
  if (process.argv.includes('--mutate')) return mutate();
  const M = await load(ROOT);
  const fails = rules(M);
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(fails.length ? `hunt-live: ${fails.length} rule(s) RED` : 'hunt-live: the browser\'s swings are the server\'s, loot is not foreseeable, a divergence eases back');
  process.exit(fails.length ? 1 : 0);
}
if (isMain(import.meta.url)) main().catch((e) => { console.error(e); process.exit(2); });
