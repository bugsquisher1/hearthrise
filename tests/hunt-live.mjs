#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-live.mjs — THE BROWSER'S LIVE HUNT IS THE SERVER'S HUNT, PREDICTED.
//
//   node tests/hunt-live.mjs            the rules
//   node tests/hunt-live.mjs --mutate   every planted defect must turn its rule RED
//
// mutant-anchors: src/hunt-view/live-engine.js src/core/combat-sim.js supabase/functions/hr-accrue/hunt-settle.js src/hunt-view/timeline.js src/core/hunt/roles.js
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
      staminaMs: 8 * 3600000, staminaMaxMs: 8 * 3600000, basics, shop: { heal: M.SB.basicFor('heal', 1).id, mana: M.SB.basicFor('mana', 1).id },
      goldFloor: 0, supplySource: 'mine', onEmpty: 'switch', cover: {} },
    skills: { melee: M.XP.skillXpForLevel('melee', L), defense: M.XP.skillXpForLevel('defense', L), ranged: M.XP.skillXpForLevel('ranged', L), magic: 0, prayer: 0 },
    levelXp: M.XP.charXpForLevel(L), xpFrac: null, hp: 1e6, gold: 500, equipment: { weapon }, inventory: {}, buffs: [], perks: null,
    deathsTodayBefore: 0, deathsLifetimeBefore: 0, hearthfindReady: false,
    hero: M.SPAWN.heroSetup({ weaponType: role === 'ranger' ? 'ranged' : role === 'melee_dps' ? 'hammer' : 'sword', options: {}, bar: [], partyRoles: ['tank', 'melee_dps'] }),
  };
}

/* The server: the instance row and its members, settled by accrueHunt in commits. */
function server(M, mis) {
  const where = M.HG.huntGroundOf('mill_cellar');
  const inst = { id: 'i-live', hunt: 'mill_cellar', world: null, settled_to_ms: T0, next_swing_at_ms: T0, world_swing: 0, secret: SECRET };
  const drops = {};
  return {
    inst, drops,
    live: (user) => M.HS.huntLive(inst, mis, user, 0),
    commit(to) {
      const r = M.AC.accrueHunt({ instance: { id: inst.id, nextSwingAtMs: inst.next_swing_at_ms, world: inst.world },
        window: { fromMs: inst.settled_to_ms, toMs: to }, secret: SECRET, ground: where.ground, grid: where.grid,
        items: M.ITEMS, monsters: M.MONSTERS, members: mis });
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
  const srv = server(M, mis);
  const E = M.LE.createLiveEngine({ items: M.ITEMS, monsters: M.MONSTERS });
  E.seed(srv.live(mis[0].user));
  const fed = { steps: [], events: [] };
  const heroesSeen = new Map();
  const verdicts = [];
  for (let t = T0; t <= T0 + spanMs; t += 100) {
    E.advance(t, (b) => {
      for (const s of b.track) fed.steps.push(s);
      for (const e of b.events) fed.events.push(e);
      if (o.feed) o.feed(b);
    });
    if (o.tamperAt && t === o.tamperAt) o.tamper(E, srv);
    if ((t - T0) % 16000 === 0 && t > T0) {
      const c = srv.commit(t);
      if (c) {
        const v = E.confirm(c.check);
        verdicts.push({ t, v, tl: c.tl });
        if (o.onCommit) o.onCommit({ t, v, c, E, srv });
      }
    }
    if (o.onTick) o.onTick({ t, E });
  }
  return { srv, E, fed, verdicts, heroesSeen };
}

function rules(M) {
  const fails = [];
  const ok = (id, cond, msg) => { if (!cond) fails.push(id + ': ' + msg); };
  const key = (s) => s.u + ',' + s.x + ',' + s.y + ',' + s.atMs;
  const ekey = (e) => JSON.stringify(e);

  for (const [name, mis] of [['solo', [memberOf(M, 'a', 0, 'tank', 6)]], ['party', [memberOf(M, 'a', 0, 'tank', 6), memberOf(M, 'b', 1, 'melee_dps', 6)]]]) {
    const r = run(M, mis, 160000);
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
      /* The same 112 s on both sides (inside the 64-seed window, the server's windows end-exclusive). */
      for (let t = T0; t < T0 + 112000; t += 100) E2.advance(t, () => {});
      const predicted = E2.predictedDrops();
      for (let t = T0 + 16000; t <= T0 + 112000; t += 16000) srv2.commit(t);
      const paid = srv2.drops;
      ok('LV-L', Object.keys(paid).length > 0, 'the control: the server paid no drops in 112 s');
      console.log(`  LV-L: server paid ${JSON.stringify(sorted(paid))}; the browser's engine would have dropped ${JSON.stringify(sorted(predicted))}`);
      ok('LV-L', JSON.stringify(sorted(predicted)) !== JSON.stringify(sorted(paid)), `the browser's engine foresaw the server's drops exactly (${JSON.stringify(sorted(paid))})`);
    }
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
          if (res) { eased = tl.rebase(t, res.positions, 250); }
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
  return fails;
}
const sorted = (o) => Object.fromEntries(Object.entries(o).sort());

const MUTANTS = [
  ['drops rolled on the combat stream (LV-L)', 'src/core/combat-sim.js', "rng: createRng(seedOf(ctx, 'r', sw))", "rng: createRng(seedOf(ctx, 's', sw))", /^LV-L/],
  ['the reseed teleports (LV-R)', 'src/hunt-view/timeline.js', 'const dur = Math.max(easeMs || 250, Math.ceil(dist * EASE_MS_PER_TILE));', 'const dur = 1;', /^LV-R/],
  ['every commit reads as a match (LV-R)', 'src/hunt-view/live-engine.js', "return h === hc.world_hash ? 'match' : 'diverged';", "return 'match';", /^LV-R/],
  ['a melee hero beside its target steps to another side every repath (LV-M)', 'src/core/hunt/roles.js',
    '  if (cheb(h, tgt) <= 1 && atRest(h)) { clearGoal(h); return; }\n  if (h.aiMs > 0 && h.path.length) return;\n  h.aiMs = AI_REPATH_MS.melee;\n  const free = (x, y) => !standable(inst, h, tgt.pocket, x, y);',
    '  if (h.aiMs > 0 && h.path.length) return;\n  h.aiMs = AI_REPATH_MS.melee;\n  const free = (x, y) => !standable(inst, h, tgt.pocket, x, y) || (x === h.x && y === h.y);', /^LV-M/],
  ['members run in another order than the server (LV-D)', 'src/hunt-view/live-engine.js', '.slice().sort((a, b) => (a.key < b.key ? -1 : 1))', '.slice().reverse()', /^LV-D/],
];

async function mutate() {
  let escaped = 0;
  for (const [name, file, from, to, arm] of MUTANTS) {
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
  console.log(escaped ? `hunt-live --mutate: ${escaped} ESCAPED` : `hunt-live --mutate: ${MUTANTS.length}/${MUTANTS.length} caught`);
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
