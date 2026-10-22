#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-live.mjs — THE BROWSER'S LIVE HUNT IS THE SERVER'S HUNT, PREDICTED.
//
//   node tests/hunt-live.mjs            the rules
//   node tests/hunt-live.mjs --mutate   every planted defect must turn its rule RED
//   node tests/hunt-live.mjs --mutate --only LV-HOLD   just the mutants whose name holds that text
//
// mutant-anchors: src/hunt-view/live-engine.js src/core/combat-sim.js supabase/functions/hr-accrue/hunt-settle.js supabase/functions/hr-accrue/accrual.js src/hunt-view/timeline.js src/core/hunt/roles.js src/core/hunt/targeting.js src/core/member.js src/core/hunt/pull-cycle.js
// mutant-writes-tree: no — mutants are planted into a temp copy of src/ and the edge
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
//         frozen sim's (measured) and almost never steps back and forth between swings.
//   LV-P  PARTY PRIVACY (Tyler 2026-10-20): a peer's row is exactly its frozen numbers
//         (src/core/member.js FROZEN_KEYS / FROZEN_SESSION_KEYS): no skills, gear, perks,
//         buffs, purse, premium or bestiary; the viewer's own row stays whole.
//   LV-K  THE LEADER CHOOSES (Tyler 2026-10-20): a party whose leader (seat 1, a peer of the
//         viewer) picked 7 and the viewer 3 runs 7 on the server, and the viewer's browser
//         predicts that pull (every commit matches): the peer's frozen hero carries `lead`.
//   LV-B  A FULL BOX IS PULLED, VIEWED (Andy 10-20): a Thicket duo at its leader's 8 (the member never
//         picked) pulls the designer's ring of 8 from its edge and kills it; every commit matches.
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
//   LV-RR THE PARTY'S RARE ROLL IS THE SERVER'S (Tyler L8; rulings: loot rolls use a server-only
//         stream): with every monster carrying rare rows, the server's commits roll rares
//         (`rare_roll`, each Crown Shard to its winner) and the browser's prediction, which
//         runs the loot stream on a constant, never feeds a `rare_roll` of its own.
//   LV-G  A LONG HUNT COSTS WHAT A SHORT ONE DOES: per settle, the server's input, stored world
//         and engine work in a 40-min hunt's last 10 min stay within 2x its first 10 min's; the
//         browser holds at most 2x the look-ahead in combat seeds (they grew with the hunt's age).
//   LV-Q  ONE DEATH STOPS THE PARTY: from the sub-step a hero dies nobody acts again, browser
//         closed and viewed (live v0.2.23, Andy: "2nd char starts to run away after death").
//   LV-HOLD ONE TANK HOLDS (Tyler 2026-10-22): the leader's pick holds every lap from the first, browser
//         closed (the server's commits) and viewed (every commit matches; a peer's frozen hero carries
//         `hold`); a change mid-hunt takes force at the lap boundary, never mid-lap.
//   LV-N  A RESTART NAMES WHAT IT PLACES (Andy 10-22, null sprites): a reseed drawn before the start
//         point's next swing (it runs none) still gives every unit it places a kind and a bar.
//   LV-PULL THE LAP'S HOLDER PULLS (bug #61, Andy's party): under Take turns the pull leader is the lap's
//         holder, switched only when the lap ends; no tank yanks a pack, browser closed and viewed.
//   LV-R  RECONCILE: a prediction forced off the server's world is judged
//         `diverged` at the next commit, and the reseed eases every unit onto its true
//         tile with no frame moving a unit more than one tile.
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
  return {
    base,
    AC: await u(FN + '/accrual.js'),
    HS: await u(FN + '/hunt-settle.js'),
    LE: await u('src/hunt-view/live-engine.js'),
    TL: await u('src/hunt-view/timeline.js'),
    HT: await u('src/core/hunt-track.js'),
    HG: await u('src/core/hunt-ground.js'),
    SPAWN: await u('src/core/hunt-spawn.js'),
    SB: await u('src/data/supply-basics.js'),
    XP: await u('src/core/xp.js'),
    MB: await u('src/core/member.js'),
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
    skills: { melee: M.XP.skillXpForLevel('melee', L), defense: M.XP.skillXpForLevel('defense', L), ranged: M.XP.skillXpForLevel('ranged', L), magic: 0, prayer: 0 },
    levelXp: M.XP.charXpForLevel(L), xpFrac: null, hp: 1e6, gold: 500, equipment: { weapon }, inventory: {}, buffs: [], perks: null,
    deathsTodayBefore: 0, deathsLifetimeBefore: 0, hearthfindReady: false,
    hero: M.SPAWN.heroSetup({ weaponType: role === 'ranger' ? 'ranged' : role === 'melee_dps' ? 'hammer' : 'sword', options: {}, bar: [], partyRoles: ['tank', 'melee_dps'] }),
  };
}

/* The server: the instance row and its members, settled by accrueHunt in commits. */
function server(M, mis, o) {
  /* `o` (tests/hunt-scene-live.mjs LV-9): another ground, instance id and start instant */
  const hunt = (o && o.hunt) || 'mill_cellar', t0 = (o && o.t0) || T0;
  const where = M.HG.huntGroundOf(hunt);
  const inst = { id: (o && o.id) || 'i-live', hunt, world: null, settled_to_ms: t0, next_swing_at_ms: t0, world_swing: 0, secret: SECRET };
  const drops = {};
  return {
    inst, drops,
    live: (user) => M.HS.huntLive(inst, mis, user, 0),
    commit(to) {
      const r = M.AC.accrueHunt({ instance: { id: inst.id, nextSwingAtMs: inst.next_swing_at_ms, world: inst.world, worldSwing: inst.world_swing },
        window: { fromMs: inst.settled_to_ms, toMs: to }, secret: SECRET, ground: where.ground, grid: where.grid,
        items: M.ITEMS, monsters: (o && o.monsters) || M.MONSTERS, members: mis });
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
      }
      inst.world = r.world; inst.settled_to_ms = r.settledTo; inst.next_swing_at_ms = r.settledTo; inst.world_swing = r.worldSwingTo;
      return { tl, check: { world_swing: r.worldSwingTo, settled_to_ms: r.settledTo, world_hash: M.HT.worldHash(r.world), seeds: M.HS.liveSeeds(inst, r.worldSwingTo) } };
    },
  };
}

/* N seconds of one instance: the browser predicting swing by swing, the server committing every 16 s. */
function run(M, mis, spanMs, opt) {
  const o = opt || {};
  const srv = server(M, mis, o.server);
  const E = M.LE.createLiveEngine({ items: M.ITEMS, monsters: (o.server && o.server.monsters) || M.MONSTERS });
  E.seed(srv.live(mis[0].user));
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
  }

  { // LV-A: ARMOUR WEIGHTS, BOTH PATHS (ruling K7): the PEER tank wears a mixed set (leather dodges, a plate helm
    // absorbs, a cloth belt wards); the server's settle lands its blows through that chain and the viewer's
    // browser, which holds only the peer's frozen numbers, predicts every commit.
    const mis = [memberOf(M, 'a', 0, 'melee_dps', 8), memberOf(M, 'b', 1, 'tank', 8)];
    mis[1].equipment = { weapon: 'bronze_sword', helmet: 'bronze_helm', body: 'leather_body', pants: 'leather_pants', belt: 'apprentice_belt' };
    let dodges = 0, peerUnit = null;
    const r = run(M, mis, 96000, { onCommit: ({ c }) => {
      peerUnit = mis[1].unitId;
      dodges += c.tl.hunt_events.filter((e) => e.type === 'miss' && e.dodge === true && e.t === peerUnit).length;
    } });
    ok('LV-A', dodges > 0, 'the armoured peer tank dodged nothing in 96 s on the server (its armour never reached the fight)');
    const bad = r.verdicts.filter((x) => x.v !== 'match');
    ok('LV-A', r.verdicts.length >= 5 && bad.length === 0, `the viewer's browser did not predict the armoured peer: ${bad.length} of ${r.verdicts.length} commits diverged`);
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
    for (const role of ['tank', 'melee_dps']) {
      const mis = [memberOf(M, 'a', 0, role, 6)];
      const srv = server(M, mis);
      const steps = []; let kills = 0;
      for (let t = T0 + 16000; t <= T0 + 600000; t += 16000) {
        const c = srv.commit(t);
        if (!c) continue;
        for (const st of c.tl.hunt_track) if (st.u === mis[0].unitId) steps.push(st);
        kills += c.tl.hunt_events.filter((e) => e.type === 'kill' && e.u === mis[0].unitId).length;
      }
      let moves = 0, flips = 0;
      for (let i = 1; i < steps.length; i++) if (steps[i].x !== steps[i - 1].x || steps[i].y !== steps[i - 1].y) moves++;
      for (let i = 2; i < steps.length; i++) {
        const back = steps[i].x === steps[i - 2].x && steps[i].y === steps[i - 2].y;
        const moved = steps[i - 1].x !== steps[i].x || steps[i - 1].y !== steps[i].y;
        if (back && moved) flips++;
      }
      console.log(`  LV-M ${role}: ${moves} tile changes over ${kills} kills (${(moves / Math.max(1, kills)).toFixed(2)} per kill; the sim's knight ${SIM_TILES_PER_KILL}), ${flips} back-and-forth steps in 600 s`);
      ok('LV-M', kills > 20 && moves / kills <= SIM_TILES_PER_KILL, `${role}: ${(moves / Math.max(1, kills)).toFixed(2)} tile changes per kill (sim ${SIM_TILES_PER_KILL})`);
      ok('LV-M', flips <= kills * 0.15, `${role}: ${flips} back-and-forth steps over ${kills} kills (a hero stepping between swings)`);
    }
  }

  { // LV-T: A SECOND TANK FIGHTS (Andy / Tyler 10-20: "not moving to the mobs ... when he has to move after
    // initial placement"). Two shield heroes, the pack on the leader: the second walks to its own target,
    // lands at least 60% of the leader's blows (was 25-40%) and is never more than 3 s with no engaged
    // monster beside it while one lives (was 6-50 s).
    for (const [hunt, dens] of [['meadowbrook_thicket', 0], ['millrace_sewer', 7]]) {
      const mis = [memberOf(M, 'a', 0, 'tank', 19), memberOf(M, 'b', 1, 'tank', 19)];
      for (const m of mis) { m.huntId = hunt; m.hero = Object.assign({}, M.SPAWN.heroSetup({ weaponType: 'sword', options: {}, bar: [], partyRoles: ['tank', 'tank'] }), { density: dens }); }
      const srv = server(M, mis, { hunt });
      const hits = {}; let away = 0, longest = 0, lap = -1, onHolder = 0, offHolder = 0;
      const heroIds = () => [mis[0].unitId, mis[1].unitId];
      const route0 = M.HG.huntGroundOf(hunt).ground.route[0];
      for (let t = T0 + M.CB.tickMs; t <= T0 + 120000; t += M.CB.tickMs) {
        const c = srv.commit(t);
        if (!c) break;
        for (const e of c.tl.hunt_events) {
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
    for (const m of mis) { m.huntId = 'millrace_sewer'; m.hero = Object.assign({}, M.SPAWN.heroSetup({ weaponType: 'sword', options: {}, bar: [], partyRoles: ['tank', 'tank'] }), { density: 7 }); }
    const v = run(M, mis, 480000, { server: { hunt: 'millrace_sewer' } });
    const ids = [mis[0].unitId, mis[1].unitId];
    const route0 = M.HG.huntGroundOf('millrace_sewer').ground.route[0];
    const laps = [];
    for (const e of v.fed.events.slice().sort((x, y) => x.atMs - y.atMs)) {
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

  { // LV-PULL: THE LAP'S HOLDER PULLS (bug #61, Andy 10-22 at the Warrens; Coordinator ruling 2026-10-22 within Tyler
    // 10-16). Andy's party as live: Eddie (seat 0, L40 sword tank, leads) and Fremulon (seat 1, sword tank) take turns,
    // Apollo (seat 2, wand) fights beside them, density 5. Before: Eddie pulled every lap and Fremulon's Challenge yanked
    // the pack off him on Fremulon's laps (6 casts a lap). BROWSER CLOSED: at every commit the pull leader is the lap's
    // holder (it switches only when the lap ends) and every pack in a fight is held by it; the monsters swing at the
    // lap's holder only; no tank casts Challenge, since nothing ever sits on Apollo (the control: 0 swings at him).
    // VIEWED: Apollo's browser predicts every commit and plays the same laps.
    const andy = () => {
      const row = (user, seat, levelXp, skills, equipment, weaponType, lead) => {
        const mi = memberOf(M, user, seat, 'tank', 6);
        mi.huntId = 'coppercap_warrens'; mi.levelXp = levelXp; mi.skills = skills; mi.equipment = equipment;
        mi.hero = Object.assign({}, M.SPAWN.heroSetup({ weaponType, options: { stance: 'offensive' }, bar: [], partyRoles: ['tank', 'tank', 'mage'], lead }), { density: 5 });
        return mi;
      };
      const plate = { body: 'bronze_platebody', pants: 'steel_platelegs', boots: 'bronze_boots' };
      return [
        row('eddie', 0, 3696348, { melee: 1212343, defense: 1166560, magic: 7056, ranged: 0, prayer: 76422 }, { weapon: 'steel_sword', helmet: 'iron_helm', ...plate }, 'sword', true),
        row('fremulon', 1, 3370870, { melee: 965112, defense: 636093, magic: 6894, ranged: 0, prayer: 84294 }, { weapon: 'iron_sword', helmet: 'steel_helm', ...plate }, 'sword', false),
        row('apollo', 2, 1509460, { melee: 4015, defense: 267, magic: 220560, ranged: 405, prayer: 26451 },
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
    /* browser closed */
    const mis = andy();
    const srv = server(M, mis, { hunt });
    const evs = []; let wrongLeader = 0, wrongHolder = 0, commits = 0;
    for (let t = T0 + M.CB.tickMs; t <= T0 + 600000; t += M.CB.tickMs) {
      const c = srv.commit(t);
      if (!c) break;
      if (!srv.inst.world) { ok('LV-PULL', false, `closed: the instance ended ${(t - T0) / 1000} s in (a hero died)`); break; }
      for (const e of c.tl.hunt_events) evs.push(e);
      const w = M.WS.decode(JSON.parse(srv.inst.world));
      const lapHolder = [mis[0].unitId, mis[1].unitId][w.runs % 2];
      commits++;
      if (w.leader !== lapHolder) wrongLeader++;
      wrongHolder += w.packs.filter((pk) => pk.aggro && pk.holder !== lapHolder).length;
    }
    const ids = [mis[0].unitId, mis[1].unitId, mis[2].unitId];
    const laps = tally(evs.sort((x, y) => x.atMs - y.atMs), ids);
    const lapWords = (ls) => ls.map((l) => ['E', 'F', 'A'].map((n, i) => n + (l.at[ids[i]] || 0)).join('/') + ' c' + l.casts).join(', ');
    const offHolder = laps.reduce((n, l, i) => n + Object.entries(l.at).filter(([u]) => Number(u) !== ids[i % 2]).reduce((m, [, k]) => m + k, 0), 0);
    const casts = laps.reduce((n, l) => n + l.casts, 0), onApollo = laps.reduce((n, l) => n + (l.at[ids[2]] || 0), 0);
    console.log(`  LV-PULL closed (Andy's party, Warrens d5, 600 s): ${laps.length} lap(s) [${lapWords(laps)}]; pull leader off the lap's holder at ${wrongLeader} of ${commits} commits, ${wrongHolder} pack(s) held by another`);
    ok('LV-PULL', laps.length >= 3 && wrongLeader === 0 && wrongHolder === 0, `closed: over ${laps.length} lap(s) the pull leader was not the lap's holder at ${wrongLeader} of ${commits} commits and ${wrongHolder} pack(s) were held by another tank (want 3+ laps, 0, 0)`);
    ok('LV-PULL', onApollo === 0 && casts === 0 && offHolder === 0, `closed: ${casts} Challenge cast(s), ${offHolder} monster swing(s) off the lap's holder, ${onApollo} at Apollo (want 0, 0; control 0)`);
    /* viewed: Apollo's browser (Eddie and Fremulon are its peers: their frozen heroes) */
    const vm = andy();
    const v = run(M, [vm[2], vm[0], vm[1]], 600000, { server: { hunt } });
    const vids = [vm[0].unitId, vm[1].unitId, vm[2].unitId];
    const vlaps = tally(v.fed.events.slice().sort((x, y) => x.atMs - y.atMs), vids);
    const vOff = vlaps.reduce((n, l, i) => n + Object.entries(l.at).filter(([u]) => Number(u) !== vids[i % 2]).reduce((m, [, k]) => m + k, 0), 0);
    const vCasts = vlaps.reduce((n, l) => n + l.casts, 0), unmatched = v.verdicts.filter((x) => x.v !== 'match').length;
    console.log(`  LV-PULL viewed: ${vlaps.length} lap(s), ${vCasts} Challenge cast(s), ${vOff} swing(s) off the lap's holder; ${unmatched} of ${v.verdicts.length} commits off the prediction`);
    ok('LV-PULL', vlaps.length >= 3 && vCasts === 0 && vOff === 0 && unmatched === 0 && v.verdicts.length >= 30, `viewed: ${vlaps.length} lap(s), ${vCasts} cast(s), ${vOff} swing(s) off the holder, ${unmatched} of ${v.verdicts.length} commits off (want 3+, 0, 0, 0)`);
  }

  { // LV-Q: ONE DEATH STOPS THE WHOLE PARTY AT ONCE (Tyler 2026-10-19; live v0.2.23, Andy: "2nd char starts to run
    // away after death"). A Sewer duo at density 8 whose tank falls: from the sub-step the tank dies nobody acts again
    // (the party's hunt ends at each member's next boundary). Before: the ranger, alone and targeted, kited 5 tiles
    // away for the rest of the swing and could take blows the death had already ended. BROWSER CLOSED: the server's
    // commits; VIEWED: the live engine's fed swings (LV-D: the same).
    const mk = () => { const mis = [memberOf(M, 'a', 0, 'tank', 14), memberOf(M, 'b', 1, 'ranger', 14)];
      for (const m of mis) { m.huntId = 'millrace_sewer'; m.hero = Object.assign({}, m.hero, { density: 8 }); } return mis; };
    const after = (steps, events, ids) => {
      const death = events.find((e) => e.type === 'kill' && ids.includes(e.t));
      if (!death) return null;
      return { at: death.atMs - T0, steps: steps.filter((s) => ids.includes(s.u) && s.atMs > death.atMs).length,
        blows: events.filter((e) => e.atMs > death.atMs && (ids.includes(e.u) || ids.includes(e.t))).length };
    };
    const mis = mk();
    const srv = server(M, mis, { hunt: 'millrace_sewer' });
    const steps = [], events = [];
    let ids = [];
    for (let t = T0 + 10000; t <= T0 + 600000 && !mis.every((m) => m.unitId === null && m.huntSession.swingIndex > 0); t += 10000) {
      const c = srv.commit(t);
      if (!ids.length) ids = mis.map((m) => m.unitId);
      if (c) { steps.push(...c.tl.hunt_track); events.push(...c.tl.hunt_events); }
    }
    const closed = after(steps, events, ids);
    const vm = mk();
    let vids = [];
    const v = run(M, vm, closed ? closed.at + 4000 : 1000, { server: { hunt: 'millrace_sewer' }, commitMs: 10000,
      onCommit: () => { if (!vids.length) vids = vm.map((m) => m.unitId); } });
    const viewed = after(v.fed.steps, v.fed.events, vids);
    console.log(`  LV-Q a Sewer duo's tank falls at ${closed && closed.at} ms: after it, closed ${closed && closed.steps} hero steps / ${closed && closed.blows} blows, viewed ${viewed && viewed.steps} / ${viewed && viewed.blows}`);
    ok('LV-Q', !!closed && !!viewed, 'the duo never lost a hero in 10 minutes (the rule needs a death)');
    ok('LV-Q', closed && closed.steps === 0 && closed.blows === 0, `browser closed: after the death the party took ${closed && closed.steps} steps and ${closed && closed.blows} blows`);
    ok('LV-Q', viewed && viewed.steps === 0 && viewed.blows === 0, `viewed: after the death the party took ${viewed && viewed.steps} steps and ${viewed && viewed.blows} blows on screen`);
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
    mis[0].hero = M.SPAWN.heroSetup({ weaponType: 'sword', options: NEW, bar: [], partyRoles: ['tank', 'melee_dps'] });
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
      /* Off the server's world: the hero's HP in the browser's start point is not the server's. */
      tamper: (E, srv) => {
        const live = srv.live('a');
        const w = M.WS.decode(JSON.parse(live.instance.world));
        const h = w.units.find((u) => u.side === 'hero');
        h.hp = Math.max(1, h.hp - 7); h.x = Math.max(1, h.x - 1);
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
  }
  { /* LV-$ the slot ORDER is the fallback, viewed and with the browser closed */
    const mi = memberOf(M, 'a', 0, 'tank', 6);
    mi.huntSession = Object.assign({}, mi.huntSession, { bag: { cooked_shrimp: { loaded: 3, left: 3, essential: true } } });
    const at95 = [{ metric: 'self_hp_pct', op: 'lt', value: 95 }];
    mi.hero = M.SPAWN.heroSetup({ weaponType: 'sword', options: {}, partyRoles: ['tank'],
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
  return fails;
}
const sorted = (o) => Object.fromEntries(Object.entries(o).sort());

const MUTANTS = [
  /* A real per-frame slowdown: every 100th frame step does 60 ms of work, in every play (LV-E budget). */
  ['a frame step stalls 60 ms every 100 frames (LV-E budget)', 'src/session/live-link.js', '  advance(clientNow) {\n',
    '  advance(clientNow) {\n    this.__n = (this.__n || 0) + 1;\n    if (this.__n % 100 === 0) { const t = performance.now(); while (performance.now() - t < 60); }\n', /^LV-E: a frame step took/],
  ['drops rolled on the combat stream (LV-L)', 'src/core/combat-sim.js', "rng: createRng(seedOf(ctx, 'r', sw))", "rng: createRng(seedOf(ctx, 's', sw))", /^LV-L/],
  ['the prediction shows its own rare rolls (LV-RR)', 'src/hunt-view/live-engine.js', 'sim.events.filter(predicted)', 'sim.events', /^LV-RR/],
  ['the reseed teleports (LV-R)', 'src/hunt-view/timeline.js', 'const dur = Math.max(easeMs || 250, Math.ceil(dist * EASE_MS_PER_TILE));', 'const dur = 1;', /^LV-R/],
  ['a restart before the next swing places units with no kind (LV-N, Andy 10-22)', 'src/hunt-view/live-engine.js', '      hp[u.id] = [u.kind, u.maxHp, u.hp];\n', '', /^LV-N/],
  ['every commit reads as a match (LV-R)', 'src/hunt-view/live-engine.js', "return h === hc.world_hash ? 'match' : 'diverged';", "return 'match';", /^LV-R/],
  ['a melee hero beside its target steps to another side every repath (LV-M)', 'src/core/hunt/roles.js',
    '  if (cheb(h, tgt) <= 1 && atRest(h)) { clearGoal(h); return; }\n  if (h.aiMs > 0) return;\n  h.aiMs = AI_REPATH_MS.melee;\n  const beside = (list) => (x, y) => list.some((m) => cheb(m, { x, y }) <= 1 && (m.x !== x || m.y !== y) && standable(inst, h, m.pocket, x, y));',
    '  if (h.aiMs > 0) return;\n  h.aiMs = AI_REPATH_MS.melee;\n  const beside = (list) => (x, y) => list.some((m) => cheb(m, { x, y }) <= 1 && (m.x !== x || m.y !== y) && standable(inst, h, m.pocket, x, y)) && (x !== h.x || y !== h.y);', /^LV-M/],
  ['a non-holder steals from the holder (LV-T, live v0.2.24)', 'src/core/hunt/targeting.js', ' && (holds || onNonTank(m)));', ');', /^LV-T/],
  ['the holder never rotates (LV-T)', 'src/core/hunt/targeting.js', 'return tanks[runs % tanks.length];', 'return tanks[0];', /^LV-T/],
  ['a peer row carries its full setup (LV-P)', 'supabase/functions/hr-accrue/hunt-settle.js', '      if (!self) {', '      if (false) {', /^LV-P/],
  ['the look-ahead is its own number at the edge (LV-H)', 'supabase/functions/hr-accrue/hunt-settle.js', 'export const LIVE_SEEDS = HUNT_TUNING.liveSeeds;', 'export const LIVE_SEEDS = 64;', /^LV-H/],
  ['a second tank holds where it stands (LV-T)', 'src/core/hunt/roles.js', "  if (!mons.some((m) => m.target === h.id)) { closeIn(inst, h, unitById(inst, h.target) || nearestTo(mons, h)); return; }\n", '', /^LV-T/],
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
  ['the browser keeps every combat seed since the hunt began (LV-G)', 'src/hunt-view/live-engine.js',
    'const keepFrom = Math.max(Math.min(st.seeds.from, from), st.world ? st.world.swing : st.worldSwing);', 'const keepFrom = Math.min(st.seeds.from, from);', /^LV-G/],
  ['corpses are never cleared from the stored world (LV-G)', 'src/core/hunt/pull-cycle.js', 'if (u.deadMs >= HUNT_TUNING.corpseMs) gone = true;', 'if (false) gone = true;', /^LV-G/],
  ['the browser drops the leader flag of a peer (LV-K)', 'src/core/member.js', '    hero: f.hero || {},', '    hero: Object.assign({}, f.hero, { lead: false }),', /^LV-K/],
  ["a peer's frozen numbers drop its armour (LV-A)", 'src/core/member.js', 'def: snap.def, mit: snap.mit || NO_MITIGATION }, vs,', 'def: snap.def }, vs,', /^LV-A/],
  ['the settle never puts the armour on the hero (LV-A)', 'src/core/combat-sim.js', '  u.mit = snap.mit || null;', '  u.mit = null;', /^LV-A/],
  ['the pull leader is back to role order (LV-PULL, bug #61)', 'src/core/hunt/pull-cycle.js', '  return holderTank(inst).id;\n', '  return byRole;\n', /^LV-PULL/],
  ["the settle never reads the leader's hold pick (LV-HOLD)", 'src/core/combat-sim.js',
    'world.holdNext = holdPick(members.filter((m) => !m.left && m.unitId !== null));', 'world.holdNext = null;', /^LV-HOLD/],
  ['a fresh world waits a lap for the pick (LV-HOLD)', 'src/core/combat-sim.js', '      if (fresh) { world.hold = world.holdNext; fresh = false; }\n', '', /^LV-HOLD/],
  ['a change to the pick takes force mid-lap (LV-HOLD)', 'src/core/combat-sim.js',
    '      if (fresh) { world.hold = world.holdNext; fresh = false; }', '      world.hold = world.holdNext; fresh = false;', /^LV-HOLD/],
  ['the assembled hero loses the hold pick (LV-HOLD)', 'src/core/member.js', '        hold: Number.isInteger(h.hold) ? h.hold : null,\n', '', /^LV-HOLD/],
  ['the browser drops the hold pick of a peer (LV-HOLD)', 'src/core/member.js', '    hero: f.hero || {},', '    hero: Object.assign({}, f.hero, { hold: null }),', /^LV-HOLD/],
  ['the settle drops hr_hunt_instance_read hold_seat (LV-HOLD)', 'supabase/functions/hr-accrue/hunt-settle.js', 'lead: m._leads, hold: m._hold });', 'lead: m._leads });', /^LV-HOLD/],
];

async function mutate() {
  let escaped = 0;
  /* `--only <text>`: just the mutants whose name holds <text> (a lane proves its own rule without the whole sweep) */
  const at = process.argv.indexOf('--only');
  const list = at > 0 ? MUTANTS.filter(([name]) => name.includes(String(process.argv[at + 1] || ''))) : MUTANTS;
  for (const [name, file, from, to, arm] of list) {
    const base = mkdtempSync(join(tmpdir(), 'hr-live-'));
    try {
      cpSync(join(ROOT, 'src'), join(base, 'src'), { recursive: true });
      cpSync(join(ROOT, 'supabase', 'functions'), join(base, 'supabase', 'functions'), { recursive: true });
      const f = join(base, file);
      const src = readFileSync(f, 'utf8');
      if (src.split(from).length !== 2) { console.error(`harness: anchor for "${name}" not found once`); process.exit(2); }
      writeFileSync(f, src.replace(from, to));
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
export const HARNESS = Object.freeze({ T0, load, memberOf, server });

async function main() {
  if (process.argv.includes('--mutate')) return mutate();
  const M = await load(ROOT);
  const fails = rules(M);
  for (const f of fails) console.log('  ✗ ' + f);
  console.log(fails.length ? `hunt-live: ${fails.length} rule(s) RED` : 'hunt-live: the browser\'s swings are the server\'s, loot is not foreseeable, a divergence eases back');
  process.exit(fails.length ? 1 : 0);
}
if (isMain(import.meta.url)) main().catch((e) => { console.error(e); process.exit(2); });
