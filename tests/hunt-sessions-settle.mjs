#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-sessions-settle.mjs — THE HUNT INSTANCE SETTLE (lane S1;
// HUNT_SCREEN_SPEC §1.1 engine contract, §1.3, §3.4, §3.8-3.10; ruling
// HR-2026-10-14 §2 / §4).
//
//   node tests/hunt-sessions-settle.mjs            the guard
//   node tests/hunt-sessions-settle.mjs --closed   every arm with the game CLOSED
//   node tests/hunt-sessions-settle.mjs --mutate   every planted defect must be CAUGHT
//
// The settle is supabase/functions/hr-accrue/hunt-settle.js (read → engine →
// hr_hunt_apply_instance). A hunt is a WORLD (src/core/hunt/*): every hero of
// an instance — solo is a party of one — is a unit, stepped by the ONE loop
// (src/core/combat-sim.js simulateHuntInstance) and paid by
// src/core/hunt-rewards.js. The DB arms drive the settle's exported pieces
// (readHuntSettle / proposeHuntSettle / commitHuntSettle, and settleHunt
// whole) against the real replayed chain (PGlite, as hr_engine), on a fixture
// GROUND (the hunt-core h1 ground, installed as mill_cellar's — no ground ships
// yet), choosing each window's end the way the world tick's clock would.
//
// ARMS (ENGINE — no database)
//   TICK-2     no away, no presence: the hunt files read no presence / cap /
//              away / receipt and none of the deleted-outright names; an
//              instance window is byte-identical under every presence- and
//              away-era input.
//   SEED       HMAC-SHA256 keyed by the instance secret, distinct per swing /
//              domain / instance / secret, FNV-collision-proof; an unseeded
//              instance swing is refused.
//   ONE-PATH   the C2 single-foe path and its bar are GONE (spec §1.1
//              one-path table): runActionBar, pickHeal, spendFromBag,
//              pickSpawn, the single-foe swing, the hs.pull cycle, presses,
//              src/core/hunt.js (STANCES / Vigour) — and combat-sim.js < 600 lines.
//   MAXHP      a Level gained in the window raises max HP from the next swing, and never
//              lowers it (max HP is derived from Level and armour, src/core/vitals.js).
//   WEAKNESS   a basic swing is priced against its monster (accuracy over its
//              defence, the weapon weakness paid): a hammer on an ooze out-hits neutral.
//   CRIT       crit is gear and buffs: crit blows land and journal the lifetime `crits`.
//   EVENT-IDS  every playback event has a stable id (<atMs>.<k>) and its server
//              instant, identical however the windows are cut.
//   BUFF       a hunt READS the timed buff queue (fires none): a live buff pays,
//              an expired one does not, one ending mid-window pays the same cut or not.
//   STAMINA-RULE  the pool drains 1:1 hunting, rests 1:1 to the character's
//              cap (8 h free / 12 h premium, one data row), a five-swing pool
//              ends `stamina` after five, a knocked-out hero RESTS.
//   SUPPLY-RULE  the one resolver: own stock first (free, the smallest that
//              covers), then the store at catalogue price under the default
//              `switch`, never under `end`; a store row restores ITS amount;
//              a dry purse ends `gold_out`; the coins a kill drops reach the
//              purse; sell-to-cover sells junk only, cheapest first, above the floor.
//   ECON-1     a fresh melee hero (0 gold, the kit's food) hunts a T1 hour on store
//              drinks without gold_out; its kill coins pay every drink.
//   SPLIT      party-split.js: gold even with the remainder to the first, common items
//              round-robin; a two-hero hunt pays both, neither more than its
//              share plus the remainders. THE RARE ROLL (Tyler L8): a rare unit goes to
//              the highest 1-100 roll, a tie re-rolls among the tied, a winner waits
//              until everyone in the instance has won (a leaver dropped, a joiner
//              eligible), solo draws no die, commons keep the round-robin; a party's
//              rares go to the same heroes however the windows are cut (the
//              rotation rides the world), each with its `rare_roll` event.
//   RARE-DROP  a carrier's rare dropped in a settle is a rare_drop world event naming its hero (the
//              timeline's alert, float and log line) and a hints.rare_drop on that hero's session, cut or not.
//   DEATH      a killed hero DIES (Tyler 2026-10-19): one death row, no recovery
//              line, the hunt ends `died` at its next boundary, the hero walks home
//              at full HP, the death is priced on its Level and combat skills; the
//              same death cut into windows (ATTENDED) as in one span (AWAY).
//   PARTY-DEATH  one member dies: every other member ends `party_member_died` at its
//              own boundary and pays nothing for it.
//   QUIVER     every ranged basic looses one shot of the loaded ammo; a
//              40-arrow bag under `end` fires 40 and ends ammo_out.
//   RUNE-SPEND a staff's basic never buys a store rune; spent runes never end a
//              default hunt and the caster swings on, bare; a slot naming Blood
//              Runes with Air loaded lands Blood-loaded's blows; an unaffordable
//              store-rune spell never ends the hunt; one span == cut windows.
//   WORLD-BOUND  a four-hero party's world stays inside world_max_bytes on the
//              compact form; world-state refuses one past it.
//   FENCE      a hunter is never priced by the old path (hunt_open), a combat
//              pointer with no hunt by nothing (hunt_required).
//   DEATHXP-RULE  a death costs DEATH_XP_LOSS of the total Level XP (DEATH_XP_BASE) and of
//              each combat skill's progress, never a level.
// ARMS (DATABASE — the replayed chain)
//   TICK-1     N tick windows (90 s) and odd cuts == ONE window, through the
//              database: the character, the session, the bag, the tally, the
//              ledger sums, the timeline, and the instance WORLD itself.
//   BOTH-PATH  a hunt with a death settled at a player's irregular instants writes
//              what the tick's windows write.
//   NO-DODGE   a death the viewer's live seeds showed cannot be stepped around: a
//              leave sent seconds before it still ends the hunt `died` at that swing,
//              the same death row and end as with no leave (2026-10-31-live-horizon.sql).
//   PARITY     the tick door, the player's door and the composed pieces write
//              the same rows for one window.
//   OWN        own food is eaten first: one supply_own row a settle, gold 0, the
//              bag debited by exactly the units used; the store untouched.
//   OWN-DRINK  an own crafted drink is spent the same way, with the browser closed
//              (the tick's door) and the hunt viewed (the player's door); one past the
//              bag is refused bag_short.
//   STORE      an empty bag under the default switch buys from the store: every
//              unit journalled supply_buy at the catalogue price, the gold
//              moved = coins − store gold, the tally's Waste carries it; under
//              `end` the store sells nothing.
//   END        under `end`, a dry essential heal line ends the hunt heals_out.
//   STAMINA    the pool through the database; the cap follows premium (free
//              8 h, premium 12 h at the window); a tampered pool is refused.
//   RESUME     an automatic end resumes the last activity after the walk home;
//              a level-locked one leaves the character idle.
//   DEATHXP    the death states its price; one death_xp row; bank = start +
//              gains − price; an over-charge is refused.
//   TALLY      tally = Σ ledger rows stamped with the session.
//   ANALYZER   dealt / taken / healed persisted per session from the engine's
//              tally; a free character reads no analyzer, a premium one does.
//   BETA       the beta premium switch (2026-12-17-beta-premium.sql, Tyler 10-23):
//              on, a FREE hero is premium in every surface (the edge's cap, the
//              rest, the section + the client's isPremium, the analyzer, the login
//              claim, outfits) with no premium_until written; off, the same hero is
//              free; a real premium_until works alone; no other body reads the
//              column or the switch past hr_premium_until / hr_premium_active.
//   PARTY      two characters in one party hunt ONE instance: one world, both
//              paid, kills journalled each, gold split; a settle missing a
//              member is refused member_set.
//   PARTY-RESTART  a restarted instance (no world, a kept swing counter) settles on from it.
//   HOLD-SEAT  "One tank holds" (Tyler 2026-10-22): the read's instance.hold_seat reaches the LEADING
//              member's hero only, and the proposed world holds that seat's unit (at once in a world made
//              in the window); a seat that is no member's names no unit (take turns).
//   PARTY-KICK a member closed by the database between settles (a kick, a leave at
//              once) walks its unit out; the next settle still commits (live P1 10-20:
//              `tally ... not a hero` on every fire).
//   PARTY-VIEW the real `party` section of a settled two-hero hunt, read by the
//              client's own reader (src/session/hunt-sections.js partyOf), yields
//              both members the party panel draws: unit (= the session's world
//              unit), name, role, HP / mana off the pose, dealt, DPS; leader and
//              self are units; `account.max_concurrent` is the server config.
//   VALUE      every bound refuses a forgery and moves nothing: gold / XP /
//              item (value_over), kills (kills_over), the world's size, shape and
//              swing, the store without consent (store_off), the lane caps
//              (too_many_uses), an unsold id (not_for_sale).
//   DENSITY    P0 #57: a Level-2 club hero at Mill Cellar density 8 (the real ground),
//              nothing landed since it opened and Leave pressed, ends through its own
//              settle with the browser closed (tick) and viewed (player's settle), both
//              with the density the server froze on the instance at hunt start (a later
//              setup change moves neither the bound nor what the engine plays) and with
//              none frozen (an instance opened before the freeze: the bound reads the ceiling).
//   FORFEIT    the sixth refused commit in a row forfeits the window: ended `left`
//              (Leave pressed) or `server` (browser closed) at the last accepted
//              boundary, purse unmoved, one window_forfeit row, bag home; a landed
//              commit starts the count over.
//   DEPLOY     a deploy never ends a hunt: a catalogue world-shape move with the edge
//              landing before or after it (v0.2.32 live). Catalogue first: the old
//              engine's settles are held (never counted); edge first: the new engine
//              proposes nothing; then the whole owed window lands, both doors, party.
//   REPLAY     the same keys re-committed answer replayed and move nothing; a
//              stale proposal answers session_moved.
//   SETTINGS   the hero's stored options reach its unit in the persisted world.
//   TICK-0     cron to edge: hr_tick_cron_run leases the due session and queues
//              its own `hunts` body; runTick settles from it.
//   SLOT       a slot-1 hunt's settle binds every read and write to slot 1.
//   XPDOOR     the client's combat-XP door pays nothing.
//   BESTIARY   no ladder prices a fight.
//
// RETIRED with the C2 single-foe path (lane S1), each with its reason; the
// arm named in [brackets] holds the property where one survives:
//   PRESS / ACTIONBAR / ACTIONBAR-RULE  hunts are idle (Tyler 2026-10-16): no
//     press, no conditional supply slot, no spell-slot kind; the bar is ability
//     ids [ONE-PATH, and hunt-settings-options.sql §6 executes the bar check].
//   VIGOUR  Vigour's exports left with src/core/hunt.js [ONE-PATH; TICK-2's
//     deleted-outright names].
//   HEAL  "a heal fires on a body" / "heals one less": food is consumables.js
//     on the world unit [SUPPLY-RULE pins the amount; hunt-core/consumables the
//     living-only rule].
//   FRESH  the fresh-hero balance forecast ran on Mill Cellar's single-foe pull;
//     no ground ships until the sewer content lane (week plan item 17), which
//     re-homes the forecast on a real ground.
//   SEAMS S3 (reserved lane cooldown keys): sessions hold no cooldowns any more;
//     every lane lives on the hero's unit [hunt-core/abilities clocks-survive-a-cut].
//   SEAMS S1 (the pull cycle on the instance row): the cycle is the world's
//     [TICK-1 compares the instance world byte for byte].
//   TICK-1 "the buff queue at the read clock": re-homed on BUFF (the queue is
//     re-measured at every boundary, so a cut cannot move a buff's end).
// ════════════════════════════════════════════════════════════════════════
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHmac } from 'node:crypto';
import { SHIM_CRYPTO, SHIM_VAULT, SHIM_NET } from './world-tick-token-shims.mjs';
import { isMain } from './_is-main.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const MUTATE = process.argv.includes('--mutate');
const CLOSED = process.argv.includes('--closed');
const FN = join('supabase', 'functions', 'hr-accrue');
const UIDS = ['00000000-0000-4000-8000-0000000c5d01', '00000000-0000-4000-8000-0000000c5d02',
  '00000000-0000-4000-8000-0000000c5d03', '00000000-0000-4000-8000-0000000c5d04'];
const UID = UIDS[0];

async function loadEdge(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  return {
    HS: await import(u(join(FN, 'hunt-settle.js'))),
    AC: await import(u(join(FN, 'accrual.js'))),
    SEED: await import(u(join(FN, 'hunt-seed.js'))),
    TR: await import(u(join(FN, 'tick-reads.js'))),
    HT: await import(u('src/core/hunt-track.js')),
    IN: await import(u(join(FN, 'intents.js'))),
    TK: await import(u(join(FN, 'tick.js'))),
    SA: await import(u(join(FN, 'set-activity.js'))),
    HSD: await import(u('src/data/hunt-sessions.js')),
    /* The client's envelope applier is read from the REAL tree (the mutant copies
       hold only the edge, src/core and src/data). */
    ENV: await import(pathToFileURL(join(ROOT, 'src', 'session', 'envelope.js')).href),
    CD: await import(u('src/data/consumables.js')),
    SB: await import(u('src/data/supply-basics.js')),
    TUN: await import(u('src/data/hunt-tuning.js')),
    AR: await import(u('src/core/action-rules.js')),
    CS: await import(u('src/core/combat-sim.js')),
    SPAWN: await import(u('src/core/hunt-spawn.js')),
    PS: await import(u('src/core/party-split.js')),
    HR: await import(u('src/core/hunt-rewards.js')),
    ROLES: await import(u('src/data/hunt-roles.js')),
    XS: await import(u('src/core/hunt/xp-share.js')),
    WS: await import(u('src/core/hunt/world-state.js')),
    GRID: await import(u('src/core/hunt/grid.js')),
    VIT: await import(u('src/core/vitals.js')),
    XP: await import(u('src/core/xp.js')),
    C: await import(u('src/core/combat.js')),
    MONSTERS: (await import(u('src/data/monsters.js'))).MONSTERS,
    ITEMS: (await import(u('src/data/items.js'))).ITEMS,
    root,
  };
}

const canon = (v) => {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
};
const firstDiff = (a, b) => {
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  return `at char ${i}: …${a.slice(Math.max(0, i - 100), i + 100)}… vs …${b.slice(Math.max(0, i - 100), i + 100)}…`;
};
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"])\/\/[^\n]*/g, '$1');

/* ── THE FIXTURE GROUND: hunt-core's h1 ground (two rooms and a corridor, three
   pockets, 90 s respawn), played as mill_cellar's. ── */
const GROUND_MAP = Object.freeze([
  '####################', '#........#.........#', '#........#.........#', '#..................#',
  '#..................#', '#........#.........#', '#........#.........#', '####.#########.#####',
  '#..................#', '####################']);
const groundRow = () => ({
  id: 'h1_fixture', hunt: 'mill_cellar', map: 'h1_fixture', start: [[2, 8], [3, 8], [4, 8], [5, 8]],
  pockets: [
    { room: [10, 1, 18, 6], spawns: [{ monster: 'rat', x: 14, y: 3 }, { monster: 'rat', x: 15, y: 4 }] },
    { room: [1, 1, 8, 6], spawns: [{ monster: 'wolf', x: 4, y: 3 }] },
    { room: [1, 8, 18, 8], spawns: [{ monster: 'rat', x: 9, y: 8 }] },
  ],
  route: [0, 1, 2], respawnMs: 90000, pullDist: 1.5, groupFit: 'both',
});
const gridOf = (M) => M.GRID.makeGrid(GROUND_MAP[0].length, GROUND_MAP.length,
  (x, y) => GROUND_MAP[y][x] === '.', (x, y) => GROUND_MAP[y][x] === '#');
/* The fixture ground with every spawn one monster: the cellar's rats never threaten a hero in its
   band (CORE_NUMBERS Q9), so the arms that need a fight with a cost name a harder monster. */
const rowWith = (monster, over) => () => {
  const g = groundRow();
  return { ...g, ...(over || {}), pockets: g.pockets.map((p) => ({ ...p, spawns: p.spawns.map((s) => ({ ...s, monster })) })) };
};
const groundWith = (M, monster, over) => ({ ground: rowWith(monster, over)(), grid: gridOf(M) });
/* Ghouls: a low hero dies there (the DEATH arms). */
const deadlyRow = rowWith('ghoul');
/* The fixture's rats and wolf in pockets 0-1 (pickups), ghouls in pocket 2 (the death): one window holds
   both (tests/settle-hooks.mjs H-ALL). */
const mixedRow = () => {
  const g = groundRow();
  return { ...g, pockets: g.pockets.map((p, i) => (i === 2 ? { ...p, spawns: p.spawns.map((s) => ({ ...s, monster: 'ghoul' })) } : p)) };
};
/* The DB arms' settles play the ground installGround last put in the catalogue. */
let fixtureRow = groundRow;
/* null = the REAL ground (hunt-ground.js huntGroundOf) and the chain's own catalogue row (the DENSITY arm). */
const groundsOf = (M) => (fixtureRow ? { mill_cellar: { ground: fixtureRow(), grid: gridOf(M) } } : {});
const deadlyOf = (M) => ({ ground: deadlyRow(), grid: gridOf(M) });

// ═══════════════════════════════════════════════════════════════════════
// ENGINE ARMS (no database)
// ═══════════════════════════════════════════════════════════════════════
const T0 = Date.UTC(2026, 9, 17, 12, 0, 0);
const IID = '00000000-0000-4000-8000-0000000c5e01';
const SECRET = '-4611686018427387904';
const tier1 = (M) => {
  const basics = {};
  for (const b of M.SB.BASIC_SUPPLIES) basics[b.id] = { kind: b.kind, price: b.price, heals: b.heals || 0, mana: b.mana || 0, partner: b.partner };
  /* `shop`: the rows an empty-handed tier-1 hero's need lands on (the cheapest that covers it) — expectations only;
     the session carries no hunt-tier store (Tyler 2026-10-19: the bar's slots pick the store item). */
  return { basics, shop: { heal: 'salted_shrimp', mana: 'thin_turnip_juice' } };
};

/* One member of an engine-arm instance, in the shape hunt-settle.js memberInput builds. */
function memberIn(M, key, o) {
  const x = o || {};
  const t = tier1(M);
  /* A hero at Level `level` (default 20) with every combat skill at that level (the designer's fit). */
  const L = x.level || 20;
  const skills = x.skills || Object.fromEntries(['melee', 'ranged', 'magic', 'defense'].map((k) => [k, M.XP.skillXpForLevel(k, L)]));
  const role = x.role || 'melee_dps';
  return {
    key, user: key, slot: 0, seat: x.seat || 0, unitId: x.unitId ?? null, sessionId: 's-' + key, version: 1, huntId: 'mill_cellar',
    huntSession: { id: 's-' + key, instanceId: IID, huntFromMs: T0, nextSwingAtMs: T0, swingIndex: 0,
      bag: x.bag || {}, staminaMs: x.stamina ?? 12 * 3600000, staminaMaxMs: x.staminaMax ?? 12 * 3600000,
      basics: t.basics, goldFloor: x.floor ?? 0, supplySource: x.source || 'mine', onEmpty: x.empty || 'switch',
      cover: x.cover || {} },
    skills, levelXp: x.levelXp ?? M.XP.charXpForLevel(L), xpFrac: null, hp: x.hp ?? 1e9, gold: x.gold ?? 0, equipment: x.equipment || {},
    inventory: {}, deathsTodayBefore: 0, deathsLifetimeBefore: 0, hearthfindReady: false, perks: null,
    /* The ROLE key (hunt-roles.js roleWeaponOf): a wand is the Mage, a staff the Healer (Tyler 2026-10-19). */
    hero: M.SPAWN.heroSetup({ weaponType: x.weaponType || ({ melee_dps: 'hammer', ranger: 'ranged', mage: 'wand', healer: 'staff' }[role] || 'sword'),
      options: x.options || {}, bar: x.bar || [], partyRoles: x.partyRoles || [role] }),
    ...(x.extra || {}),
  };
}
function instIn(M, members, spanMs, extra) {
  return Object.assign({ instance: { id: IID, nextSwingAtMs: T0, world: null }, window: { fromMs: T0, toMs: T0 + spanMs },
    secret: SECRET, ...groundsOf(M).mill_cellar, items: M.ITEMS, monsters: M.MONSTERS, members }, extra || {});
}
/* Run an instance over [T0, T0 + span) cut at `cuts`, carrying the world and every session like the database does. */
function runCut(M, mk, spanMs, cuts, over) {
  const members = mk();
  const edges = [T0, ...cuts.filter((c) => c > T0 && c < T0 + spanMs).sort((a, b) => a - b), T0 + spanMs];
  let world = null; let next = T0;
  const outs = [];
  for (let i = 1; i < edges.length; i++) {
    const out = M.AC.accrueHunt(instIn(M, members, 0, { ...(over || {}), instance: { id: IID, nextSwingAtMs: next, world },
      window: { fromMs: edges[i - 1], toMs: edges[i] } }));
    if (!out.accrued) continue;
    outs.push(out);
    world = out.world; next = out.settledTo;
    for (const p of out.members) {
      const m = members.find((x) => x.key === p.key);
      const h = p.hunt;
      m.huntSession = Object.assign({}, m.huntSession, { swingIndex: h.swing_to, nextSwingAtMs: Date.parse(h.next_swing_at),
        staminaMs: h.stamina,
        bag: Object.fromEntries(Object.entries(m.huntSession.bag).map(([id, l]) => [id, { ...l, left: (l.left ?? l.loaded) - (h.uses[id] || 0) }])) });
      m.unitId = h.unit_id;
      m.hp = p.delta.hp;
      for (const [k, v] of Object.entries(p.delta.xp || {})) m.skills = { ...m.skills, [k]: (m.skills[k] || 0) + v };
      m.levelXp += p.delta.level_xp || 0;
      m.gold += p.delta.gold || 0;
      if (h.ended) m.ended = h.ended;
    }
  }
  return { outs, members, world };
}

/* THE RARE ROLL (Tyler L8), on scripted dice: party-split.js rareRoll, then the one reward path
   (hunt-rewards.js rewardSwing) for a kill that drops two commons and one rare. */
function rareRollRules(M) {
  const problems = [];
  const { rareRoll } = M.PS;
  const dice = (list) => {
    const q = list.slice();
    return { int: (a, b) => { if (a === b) return a; if (!q.length) throw new Error('an unscripted draw ' + a + '..' + b); return q.shift(); },
      chance: () => true, next: () => 0.99, left: () => q.length };
  };
  const say = (r) => canon({ winner: r.winner, rolls: r.rolls, reroll: r.reroll, won: r.won });
  let r = rareRoll([1, 2, 3], null, dice([40, 90, 12]));
  if (say(r) !== canon({ winner: 2, rolls: { 1: 40, 2: 90, 3: 12 }, reroll: null, won: [2] })) problems.push('the highest roll does not win: ' + say(r));
  let d = dice([90, 90, 12, 30, 70]);
  r = rareRoll([1, 2, 3], null, d);
  if (say(r) !== canon({ winner: 2, rolls: { 1: 90, 2: 90, 3: 12 }, reroll: { 1: 30, 2: 70 }, won: [2] }) || d.left()) problems.push('a tie is not re-rolled among the tied: ' + say(r));
  r = rareRoll([1, 2, 3], [2], dice([50, 60]));
  if (say(r) !== canon({ winner: 3, rolls: { 1: 50, 3: 60 }, reroll: null, won: [2, 3] })) problems.push('a winner rolls again before everyone has won: ' + say(r));
  d = dice([]);
  r = rareRoll([1, 2, 3], [2, 3], d);
  if (say(r) !== canon({ winner: 1, rolls: {}, reroll: null, won: [2, 3, 1] })) problems.push('the last hero without a win does not take it: ' + say(r));
  r = rareRoll([1, 2, 3], [2, 3, 1], dice([10, 20, 30]));
  if (say(r) !== canon({ winner: 3, rolls: { 1: 10, 2: 20, 3: 30 }, reroll: null, won: [3] })) problems.push('the rotation does not start over once everyone has won: ' + say(r));
  r = rareRoll([1, 2, 4], [2, 3], dice([5, 9]));
  if (say(r) !== canon({ winner: 4, rolls: { 1: 5, 4: 9 }, reroll: null, won: [2, 4] })) problems.push('a leaver is kept or a joiner is not eligible: ' + say(r));

  /* The reward path: commons a, b round-robin from the offset (1: unit 2 then unit 1), the rare r to the roll. */
  const monsters = { x: { gp: [0, 0], drops: [{ id: 'a', ch: 1 }, { id: 'b', ch: 1 }, { id: 'r', ch: 0.01 }] } };
  const kill = (heroes, script, rareWon) => {
    const got = []; const events = [];
    const world = { units: [...heroes.map((id) => ({ id, side: 'hero' })), { id: 9, side: 'mon', kind: 'x' }], rareWon: rareWon ?? null };
    const members = new Map(heroes.map((id) => [id, { unitId: id, state: {}, hs: { tally: { kills: 0 } }, bonus: () => 0, weakness: () => ({ dropMult: 1 }),
      fx: { addItem: (item) => got.push(item + '>' + id) } }]));
    const rng = dice(script);
    M.HR.rewardSwing(members, [{ type: 'kill', u: heroes[0], t: 9, atMs: 5000 }], world,
      { rng, monsters, hearthfind: false, emit: (e) => { if (e.type === 'rare_roll') events.push(e); } });
    return { got: got.join(' '), events, world, left: rng.left() };
  };
  const two = kill([1, 2], [1, 70, 30]);
  if (two.got !== 'a>2 b>1 r>1') problems.push(`a party kill paid ${two.got}, want the commons round-robin (a>2 b>1) and the rare to the 70 (r>1)`);
  const ev = two.events[0];
  if (two.events.length !== 1 || !ev || ev.type !== 'rare_roll' || ev.u !== 1 || ev.item !== 'r' || canon(ev.rolls) !== canon({ 1: 70, 2: 30 }) || ev.atMs !== 5000) {
    problems.push('the rare roll event is ' + canon(two.events));
  }
  if (canon(two.world.rareWon) !== '[1]' || two.left) problems.push(`the world's rotation is ${canon(two.world.rareWon)} (want [1]), ${two.left} draws unspent`);
  const next = kill([1, 2], [1], [1]);
  if (next.got !== 'a>2 b>1 r>2' || canon(next.events[0] && next.events[0].rolls) !== '{}') problems.push(`the next rare went ${next.got} (the winner must wait: r>2, no dice)`);
  const solo = kill([1], []);
  if (solo.got !== 'a>1 b>1 r>1' || solo.events.length || solo.world.rareWon !== null) problems.push(`a solo kill paid ${solo.got} with ${solo.events.length} roll events (the hero takes all, no die, no rotation)`);
  return problems;
}

const ENGINE_ARMS = {
  'TICK-2': async (M) => {
    const problems = [];
    const dir = join(M.root, FN);
    /* DELETED OUTRIGHT (the closed rebuild, lane C2; the C2 bar, lane S1). No edge file may name one in CODE again. */
    const gone = new RegExp(['hr_attended_kills', 'hr_credit_kills', 'ATTENDED_MAX_FIDELITY', 'attendedKillCap',
      'away-receipt', 'withAwayReceipt', 'receiptRescue', 'last_away_receipt', 'hr_vigour_of', 'vigourCharge',
      'VIGOUR_', 'autoEatEnabled', 'resolveAutoEat', 'auto_eat_', 'huntStance', 'hunt_stance', 'evaluateStop',
      'consec_falls', 'recovering_until', 'recoveringUntil', 'KNOCKOUT_MS', 'resumeHpFor', 'fallsLimit', 'down_ms', 'retreatAtFall', 'killBonusesFor', 'charmIndex', 'killsByClass', 'trophyIndex',
      'readTickBestiary', 'companionXpBacked', 'COMPANION_XP_SERVER_BACKED', 'partyIntentFence', 'tick-party',
      'tick-combat', 'claim-reward', 'dungeon-settle', 'quartermaster-buy', 'runEnchant', 'hunt_use', 'barSlot',
      'hr_hunt_apply\\(', 'hr_hunt_engine_read'].join('|'));
    for (const f of readdirSync(dir).filter((n) => /\.(js|ts)$/.test(n))) {
      const code = stripComments(readFileSync(join(dir, f), 'utf8'));
      const m = code.match(gone);
      if (m) problems.push(`${f} still names \`${m[0]}\` in code (deleted outright)`);
    }
    const presence = /\baway\b|presence|last_seen|capMs|cap_ms|hr_accrue_cap_ms|hr_offline_cap_ms|return_anchor|horizon/;
    for (const f of ['hunt-settle.js', 'hunt-seed.js', '../../../src/core/hunt-ground.js', '../../../src/core/hunt-track.js']) {
      const code = stripComments(readFileSync(join(dir, f), 'utf8'));
      const m = code.match(presence);
      if (m) problems.push(`${f} reads \`${m[0]}\` — the hunt settle may not consult presence, a cap or ctx.away (TICK-2)`);
    }
    /* memberSide lives in src/core/member.js since option B (the browser's live view shares it). */
    const acc = stripComments(readFileSync(join(dir, 'accrual.js'), 'utf8') + '\n' + readFileSync(join(dir, '..', '..', '..', 'src', 'core', 'member.js'), 'utf8'));
    const body = ['accrueHunt', 'memberSide', 'memberDelta'].map((fn) => {
      const i = acc.indexOf('function ' + fn + '(');
      const j = acc.indexOf('\nfunction ', i + 10);
      const k = acc.indexOf('\nexport function ', i + 10);
      const end = [j, k].filter((x) => x > i).sort((a, b) => a - b)[0];
      return i >= 0 ? acc.slice(i, end) : '';
    }).join('\n');
    if (!body.includes('function accrueHunt(')) problems.push('accrual.js has no accrueHunt — the hunt body moved; re-point TICK-2');
    for (const re of [/\baway\s*:/, /ctx\.away/, /\.away\b/, /capMs/, /presence|last_seen|horizon|return_anchor/]) {
      const m = body.match(re);
      if (m) problems.push(`the hunt body contains \`${m[0]}\` — a hunt reads no ctx.away and no presence (TICK-2)`);
    }
    /* THE BEHAVIOUR: presence- and away-era inputs are inert for an instance. */
    const mk = (extra) => [memberIn(M, 'a', { bag: { cooked_shrimp: { loaded: 20, left: 20 } }, extra })];
    const base = M.AC.accrueHunt(instIn(M, mk(), 900000));
    if (!base.accrued || !base.members.length) problems.push(`CONTROL: the reference window did not settle (${base.reason})`);
    const variants = {
      accruedToMs: T0 + 300000, activeSinceMs: T0 - 86400000, capMs: 1, combatXpAccruedToMs: T0 + 600000,
      lastSeenAt: new Date(T0).toISOString(), caller: 'collect', away: true,
    };
    const shape = (o) => canon({ m: o.members.map((x) => ({ d: x.delta, h: x.hunt })), w: o.world });
    for (const [k, v] of Object.entries(variants)) {
      const onMember = M.AC.accrueHunt(instIn(M, mk({ [k]: v }), 900000));
      const onInst = M.AC.accrueHunt(instIn(M, mk(), 900000, { [k]: v }));
      for (const [where, out] of [['member', onMember], ['instance', onInst]]) {
        if (shape(out) !== shape(base)) problems.push(`the window moved when the ${where} carried \`${k}\` — a hunt read a presence/away-era input ${firstDiff(shape(base), shape(out))}`);
      }
    }
    return problems;
  },

  SEED: async (M) => {
    const problems = [];
    const f = M.SEED.swingSeederFor(SECRET, IID);
    const ref = (secret, iid, i) => createHmac('sha256', 'hearthrise:hunt-swing:v1:' + secret).update(`hunt:${iid}:s:${i}`, 'utf8').digest().readUInt32BE(0);
    for (const i of [0, 1, 2, 77, 123456]) if (f(i) !== ref(SECRET, IID, i)) problems.push(`swing ${i}: the seeder is not HMAC-SHA256(secret, 'hunt:<instance>:s:<i>')`);
    const all = M.SEED.seederFor(SECRET, IID);
    if (all('s', 7) !== f(7)) problems.push('the swing seeder is not the `s` domain of the instance seeder');
    if (new Set(['s', 'g', 'r', 'c:offense', 'c:heal'].map((d) => all(d, 7))).size !== 5) problems.push('five domains at one index share a seed');
    let refused = false; try { all('swing', 1); } catch { refused = true; }
    if (!refused) problems.push("an unknown seed domain ('swing') was hashed instead of refused");
    if (new Set(Array.from({ length: 256 }, (_, i) => f(i))).size < 250) problems.push('256 swings produced too few distinct seeds');
    if (M.SEED.swingSeederFor(SECRET, IID)(9) === M.SEED.swingSeederFor(SECRET, '00000000-0000-4000-8000-0000000c5e02')(9)) problems.push('two instances share a swing seed');
    /* KEY WIDTH: two secrets whose TEXT collides under 32-bit FNV-1a still seed differently. */
    const fnv = (s) => { let h = 0x811c9dc5; for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193); } return h >>> 0; };
    const seen = new Map(); let pair = null;
    for (let n = 1n; !pair && n < 400000n; n++) {
      const s = String(1000000000000000000n + 7919n * n);
      const h = fnv(s);
      if (seen.has(h)) pair = [seen.get(h), s]; else seen.set(h, s);
    }
    if (!pair) problems.push('CONTROL: no FNV-1a text collision found');
    else {
      const a = M.SEED.swingSeederFor(pair[0], IID); const b = M.SEED.swingSeederFor(pair[1], IID);
      let same = 0; for (let i = 0; i < 16; i++) if (a(i) === b(i)) same++;
      if (same > 1) problems.push(`two secrets colliding as 32-bit text seed ${same}/16 swings alike — the mix is not keyed by the whole secret`);
    }
    for (const bad of ['', 'abc', '1.5', null]) {
      let threw = false; try { M.SEED.swingSeederFor(bad, IID); } catch { threw = true; }
      if (!threw) problems.push(`a malformed secret ${JSON.stringify(bad)} was accepted`);
    }
    let unseeded = false;
    try {
      M.CS.simulateHuntInstance({ world: null, nextSwingAtMs: T0, members: [] }, { toMs: T0 + 10000, tickMs: 2000 });
      const m = memberIn(M, 'a');
      const fake = { key: 'a', seat: 0, unitId: null, hs: M.AR.newHuntSession(m.huntSession), state: { skills: {}, levelXp: 0, playerHp: 150, playerMaxHp: 150, playerMaxMana: 100, regenPm: 1000, stats: {} },
        hero: m.hero, snapshot: () => ({ acc: 500, maxHit: 2, def: 1 }), family: 'sword', bonus: () => 0, weakness: () => ({ dropMult: 1 }), fx: {} };
      M.CS.simulateHuntInstance({ world: null, nextSwingAtMs: T0, members: [fake] }, { toMs: T0 + 10000, tickMs: 2000, ...groundsOf(M).mill_cellar });
    } catch { unseeded = true; }
    if (!unseeded) problems.push('an UNSEEDED instance swing ran — the engine must refuse a swing with no ctx.seed');
    return problems;
  },

  'ONE-PATH': async (M) => {
    const problems = [];
    const files = [];
    const walk = (d) => { for (const n of readdirSync(join(M.root, d), { withFileTypes: true })) {
      if (n.isDirectory()) walk(join(d, n.name)); else if (n.name.endsWith('.js')) files.push(join(d, n.name)); } };
    walk('src/core');
    for (const f of readdirSync(join(M.root, FN)).filter((n) => /\.(js|ts)$/.test(n))) files.push(join(FN, f));
    const retired = /\b(runActionBar|pickHeal|spendFromBag|pickSpawn|swingFoe|simulateTick|resolveKill|spendFromQuiver|fireRules|conditionHolds|assertNoStanceMultiplier|vigourBudgetMin|presses)\b|hs\.pull\b/;
    for (const f of files) {
      const m = stripComments(readFileSync(join(M.root, f), 'utf8')).match(retired);
      if (m) problems.push(`${f} still carries \`${m[0]}\` — retired by the one-path table (spec §1.1)`);
    }
    if (existsSync(join(M.root, 'src/core/hunt.js'))) problems.push('src/core/hunt.js (STANCES, Vigour) still exists');
    const rs = await import(pathToFileURL(join(M.root, 'src/data/rule-subjects.js')).href);
    for (const k of ['RULE_SUBJECTS', 'DEFAULT_PRESET', 'COOLDOWN_LANES', 'SLOT_TARGETS', 'PULL_CAP']) {
      if (k in rs) problems.push(`rule-subjects.js still exports the C2 bar's ${k}`);
    }
    const lines = readFileSync(join(M.root, 'src/core/combat-sim.js'), 'utf8').split('\n').length;
    if (lines >= 600) problems.push(`src/core/combat-sim.js is ${lines} lines (spec §1.1: under 600)`);
    /* THE FOOD COOLDOWN, ONE SOURCE (Tyler 2026-10-19): consumables.js laneMs, 2 s, food and drink alike. */
    if (M.CD.CONSUMABLE_RULES.laneMs !== 2000) problems.push(`the food-and-drink cooldown is ${M.CD.CONSUMABLE_RULES.laneMs} ms, Tyler ruled 2 s`);
    return problems;
  },

  MAXHP: async (M) => {
    const problems = [];
    /* A Level-5 hero one XP short of Level 6 levels up on its first kills: max HP leaves at Level 6's (or the
       Level reached), never lower than it entered; nothing worn, so the heavy share is 0. */
    const near = M.XP.charXpForLevel(6) - 1;
    const m = memberIn(M, 'a', { level: 5, levelXp: near });
    const out = M.AC.accrueHunt(instIn(M, [m], 600000));
    const r = out.members && out.members[0];
    if (!r) return [`CONTROL: the window settled nothing (${out.reason})`];
    if (!(r.delta.level_xp > 0)) problems.push('CONTROL: no Level XP was earned');
    const reached = M.XP.charLevelFromXp(near + (r.delta.level_xp || 0));
    if (!(reached >= 6)) problems.push('CONTROL: the Level-up never happened');
    else if (r.maxHp !== M.VIT.maxHpFor(reached, 0)) problems.push(`a Level-up to ${reached} left max HP at ${r.maxHp}, vitals.js says ${M.VIT.maxHpFor(reached, 0)}`);
    if (!(r.maxHp >= M.VIT.maxHpFor(5, 0))) problems.push(`max HP fell to ${r.maxHp} — raise-only`);
    if (r.levelUps.filter((u) => u.skill === 'level').length !== reached - 5) problems.push(`the Level-ups ${JSON.stringify(r.levelUps)} are not the ${reached - 5} crossed`);
    return problems;
  },

  /* BUFF: a hunt READS the timed buff queue (it fires none): a live +200% damage
     buff kills faster; one that ended before the window pays nothing; one that
     ends mid-window pays exactly while it runs, however the window is cut. */
  BUFF: async (M) => {
    const problems = [];
    const iso = (ms) => new Date(ms).toISOString();
    /* A Level-50 hero on a Rat King ground: every kill takes many swings, so damage (not the respawn
       clock) sets the pace; the cellar's rats die to one swing either way. */
    const KING = groundWith(M, 'rat_king');
    const mk = (buffs) => () => [memberIn(M, 'a', { level: 50, empty: 'end', extra: { buffs } })];
    const kills = (o) => o.outs.reduce((a, x) => a + x.members[0].delta.journal.meta.kills, 0);
    const bare = runCut(M, mk(null), 900000, [], KING);
    const live = runCut(M, mk([{ type: 'damage', magnitude: 200, until: iso(T0 + 3600000), from: iso(T0 - 1000) }]), 900000, [], KING);
    const dead = runCut(M, mk([{ type: 'damage', magnitude: 200, until: iso(T0 - 1000), from: iso(T0 - 600000) }]), 900000, [], KING);
    const dealt = (o) => o.outs.reduce((x, w) => x + Number(((w.members[0].analyzer || {}).dealt || {}).total || 0), 0);
    if (!(dealt(live) > dealt(bare) * 1.5)) problems.push(`a live +200% damage buff dealt ${dealt(live)} against ${dealt(bare)} without — a hunt does not read the buff queue`);
    if (canon(dead.outs.map((o) => o.members[0].delta)) !== canon(bare.outs.map((o) => o.members[0].delta))) problems.push('a buff that ended before the window changed it');
    const mid = [{ type: 'damage', magnitude: 200, until: iso(T0 + 300000), from: iso(T0 - 1000) }];
    /* The same hero outlives the buff, so a queue frozen at a window's start shows. */
    const one = runCut(M, mk(mid), 900000, [], KING);
    const cut = runCut(M, mk(mid), 900000, [T0 + 100000, T0 + 290000, T0 + 310000, T0 + 600000], KING);
    const sum = (o) => canon({ k: kills(o), g: o.outs.reduce((a, x) => a + (x.members[0].delta.gold || 0), 0), w: o.world });
    if (sum(one) !== sum(cut)) problems.push(`a buff ending mid-window paid differently cut and uncut ${firstDiff(sum(one), sum(cut))}`);
    return problems;
  },

  /* WEAKNESS: a basic swing is priced AGAINST its monster (accrual.js rollsVs =
     combat.js playerCombatRolls): a hammer on an ooze (weak to hammer, 33 HP)
     lands blows above what the unit's neutral max hit allows after the ooze's
     defence — the x1.2 the Fight screen quotes is paid. A level-60 hero, so no
     level-up moves its max hit inside the window; an empty bar, so every blow is
     a basic swing (abilities price their own hits). */
  WEAKNESS: async (M) => {
    const problems = [];
    const ground = { id: 'ooze_room', hunt: 'mill_cellar', map: 'ooze_room', start: [[2, 8]],
      pockets: [{ room: [10, 1, 18, 6], spawns: [{ monster: 'ooze', x: 14, y: 3 }, { monster: 'ooze', x: 15, y: 4 }] }],
      route: [0], respawnMs: 2000, pullDist: 1.5 };
    const mem = memberIn(M, 'a', { level: 60, empty: 'end', equipment: { weapon: 'stone_maul' }, weaponType: 'hammer',
      options: { stance: 'balanced' } });
    mem.hero = { ...mem.hero, bar: [] };
    const o = M.AC.accrueHunt(instIn(M, [mem], 300000, { ground }));
    if (!o.accrued || !o.world) return [`CONTROL: the hammer hunt settled nothing (${o.reason})`];
    const hero = M.WS.decode(JSON.parse(o.world)).units.find((x) => x.side === 'hero');
    const blows = o.events.filter((e) => e.type === 'dmg' && e.u === hero.id && e.ability === 'basic');
    const top = blows.reduce((a, e) => Math.max(a, e.amount), 0);
    const neutral = hero.maxHit - M.C.defenceReduction(M.MONSTERS.ooze);
    if (!(blows.length > 30)) problems.push(`CONTROL: only ${blows.length} basic blows on the oozes`);
    else if (!(top > neutral)) problems.push(`a hammer's best blow on an ooze is ${top}, never above the neutral ${neutral} — the weapon weakness is not paid`);
    return problems;
  },

  /* CRIT: crit is gear and buffs (playerCombatRolls critChance): a hero with a
     crit buff lands crit blows (above its max hit) and the window journals them
     as the lifetime `crits` stat; a hero with none draws no crit. */
  CRIT: async (M) => {
    const problems = [];
    const iso = (ms) => new Date(ms).toISOString();
    const mk = (buffs) => { const m = memberIn(M, 'a', { level: 20, empty: 'end', extra: { buffs } }); m.hero = { ...m.hero, bar: [] }; return () => [m]; };
    const crit = runCut(M, mk([{ type: 'damage_crit', magnitude: 50, until: iso(T0 + 3600000), from: iso(T0 - 1000) }]), 600000, []);
    const none = runCut(M, mk(null), 600000, []);
    const statOf = (o) => o.outs.reduce((a, x) => a + ((x.members[0].delta.progress || []).filter((p) => p.kind === 'stat' && p.key === 'crits' && p.period === '')
      .reduce((s, p) => s + p.add, 0)), 0);
    const flagged = (o) => o.outs.reduce((a, x) => a + x.events.filter((e) => e.type === 'dmg' && e.crit === true).length, 0);
    if (!(flagged(crit) > 5)) problems.push(`a +50% crit buff landed ${flagged(crit)} crit blows in ten minutes`);
    if (statOf(crit) !== flagged(crit)) problems.push(`the window journalled ${statOf(crit)} crits for ${flagged(crit)} crit blows`);
    if (flagged(none) !== 0 || statOf(none) !== 0) problems.push(`a hero with no crit chance critted ${flagged(none)} times`);
    return problems;
  },

  /* EVENT-IDS (Tyler 10-18 D): every playback event carries a stable id and its
     server instant, the same id however the windows were cut, so a client
     de-duplicates two overlapping responses and keeps an animation running. */
  'EVENT-IDS': async (M) => {
    const problems = [];
    const mk = () => [memberIn(M, 'a', { level: 20, empty: 'end' })];
    const ids = (o) => o.outs.flatMap((x) => M.HT.huntPlayback(x.track, x.events, 0, 0).events);
    const one = ids(runCut(M, mk, 300000, []));
    const cut = ids(runCut(M, mk, 300000, [T0 + 33000, T0 + 90000, T0 + 91000, T0 + 200000]));
    if (!(one.length > 20)) return [`CONTROL: only ${one.length} events`];
    for (const e of one) if (typeof e.id !== 'string' || !Number.isInteger(e.atMs) || !e.id.startsWith(e.atMs + '.')) { problems.push(`an event without a stable id / server instant: ${JSON.stringify(e)}`); break; }
    if (new Set(one.map((e) => e.id)).size !== one.length) problems.push('two events of one window share an id');
    const key = (l) => canon(l.map((e) => [e.id, e.type, e.u ?? null, e.t ?? null]));
    if (key(one) !== key(cut)) problems.push(`event ids moved with the cut ${firstDiff(key(one), key(cut))}`);
    return problems;
  },

  'STAMINA-RULE': async (M) => {
    const problems = [];
    const st = M.AR.staminaStep; const cap = M.HSD.STAMINA_MAX_MS;
    if (cap.free !== 8 * 3600000 || cap.premium !== 12 * 3600000) problems.push(`STAMINA_MAX_MS is ${JSON.stringify(cap)}, not 8 h free / 12 h premium`);
    if (st(10000, 2000, true, cap.free) !== 8000 || st(1000, 2000, true, cap.free) !== 0) problems.push('a hunting interval does not drain 1:1 to 0');
    if (st(cap.free - 1000, 2000, false, cap.free) !== cap.free) problems.push('resting does not stop at the cap');
    if (st(cap.premium, 2000, false, cap.free) !== cap.premium) problems.push('resting LOWERED a pool above the free cap (a lapse must keep banked stamina)');
    const out = runCut(M, () => [memberIn(M, 'a', { stamina: 5 * 2000 })], 120000, []);
    const r = out.outs[0] && out.outs[0].members[0];
    if (!r || !r.hunt.ended || r.hunt.ended.reason !== 'stamina' || r.hunt.swing_to !== 5) {
      problems.push(`a five-swing pool ended ${JSON.stringify(r && r.hunt.ended)} after ${r && r.hunt.swing_to} swings, not stamina after 5`);
    }
    /* EVERY SWING OF A HUNT DRAINS (no knockout to rest in): the pool = start − paid. */
    const all = runCut(M, () => [memberIn(M, 'a', { stamina: 3600000, staminaMax: cap.free })], 600000, []);
    const k = all.outs[0] && all.outs[0].members[0];
    if (!k || k.hunt.stamina !== Math.max(0, 3600000 - k.hunt.paid_ms) || 'down_ms' in k.hunt) {
      problems.push(`a pool of 1 h after ${k && k.hunt.paid_ms} ms paid is ${k && k.hunt.stamina} (or the proposal still carries down_ms)`);
    }
    /* The client (src/session/envelope.js): the server's pool, REPLACED by each
       envelope — never kept past one that no longer states it. */
    const pool = { ms: 1234, at: new Date(T0).toISOString(), max_ms: cap.free, hunting: true };
    const r1 = M.ENV.applyEnvelope({ version: 0, data: { stamina: { ms: 1 } }, residue: {} },
      { ok: true, version: 1, state: {}, stamina: pool }).record;
    if (!r1 || JSON.stringify(r1.data.stamina) !== JSON.stringify(pool)) {
      problems.push(`the client did not take the server's pool: ${JSON.stringify(r1 && r1.data.stamina)}`);
    }
    const r2 = M.ENV.applyEnvelope(r1, { ok: true, version: 2, state: {} }).record;
    if (r2 && 'stamina' in r2.data) problems.push('the client kept a pool the next envelope no longer states');
    return problems;
  },

  'SUPPLY-RULE': async (M) => {
    const problems = [];
    const t = tier1(M);
    const hs = (o) => M.AR.newHuntSession(Object.assign({ id: 'x', bag: {}, basics: t.basics, purse: 1000, goldFloor: 0 }, o));
    if (M.HSD.ON_EMPTY.default !== 'switch' || !M.HSD.ON_EMPTY.modes.includes('end')) problems.push(`ON_EMPTY is ${JSON.stringify(M.HSD.ON_EMPTY)}, not default switch with end opt-in`);
    /* A SLOT NAMES ONE ITEM (Tyler 2026-10-21): a crafted food is the hero's own stack, free. */
    const own = hs({ bag: { cooked_shrimp: { loaded: 5 }, cooked_trout: { loaded: 5 } } });
    const l1 = M.AR.resolveLine(own, 'cooked_shrimp');
    if (l1.id !== 'cooked_shrimp' || l1.source !== 'own' || l1.price !== 0) problems.push(`a crafted food is not its own stack, free: ${JSON.stringify(l1)}`);
    if (M.AR.lineAmount(own, l1) !== M.CD.CONSUMABLES.cooked_shrimp.amount) problems.push('an own food does not restore its item\'s amount');
    if (!M.AR.takeLine(own, l1, 0) || own.bag.cooked_shrimp.left !== 4 || own.tally.supplies.cooked_shrimp !== 1) problems.push('an own use did not leave the bag once');
    /* A crafted food with none left is NONE: never a store row the slot did not name. */
    const dryOwn = M.AR.resolveLine(hs({}), 'cooked_shrimp');
    if (dryOwn.id || dryOwn.why !== 'none') problems.push(`an empty crafted line bought something: ${JSON.stringify(dryOwn)}`);
    /* Under supply_source `store` a crafted slot is STILL its own stack (hunt-sessions.js SUPPLY_SOURCE). */
    const l1s = M.AR.resolveLine(hs({ supplySource: 'store', bag: { cooked_shrimp: { loaded: 5 } } }), 'cooked_shrimp');
    if (l1s.source !== 'own') problems.push(`a store-sourced hero with food in its bag bought instead: ${JSON.stringify(l1s)}`);
    /* THE STORE ROW A SLOT NAMES, under the default switch, at the catalogue price, restoring ITS amount. */
    const store = hs({});
    const l2 = M.AR.resolveLine(store, t.shop.heal);
    const row = t.basics[t.shop.heal];
    if (l2.id !== t.shop.heal || l2.source !== 'store' || l2.price !== row.price) problems.push(`a store food slot did not buy its row at its price: ${JSON.stringify(l2)}`);
    if (M.AR.lineAmount(store, l2) !== row.heals) problems.push(`a store food restores ${M.AR.lineAmount(store, l2)}, its row says ${row.heals}`);
    if (!M.AR.takeLine(store, l2, 0) || store.purse !== 1000 - row.price || store.tally.bought[t.shop.heal] !== 1) problems.push('a store use was not paid once from the purse');
    if (M.AR.resolveLine(hs({ onEmpty: 'end' }), t.shop.heal).source) problems.push('the store sold under the hero\'s `end`');
    /* A dry purse ends gold_out; the floor is kept; cover sells junk only, cheapest first. */
    const dry = hs({ purse: row.price - 1 });
    const l3 = M.AR.resolveLine(dry, t.shop.heal);
    if (l3.why !== 'gold_short') problems.push(`a purse short of the price answered ${JSON.stringify(l3)}`);
    if (M.AR.canAfford(hs({ purse: 100, goldFloor: 50 }), 60)) problems.push('a use was affordable below the gold floor');
    const cov = hs({ purse: 0, cover: { a_junk: { unit: 5, avail: 10 }, b_junk: { unit: 2, avail: 10 } } });
    M.AR.sellToCover(cov, 4);
    if (cov.tally.covered.b_junk !== 2 || cov.tally.covered.a_junk) problems.push(`sell-to-cover did not sell the cheapest first: ${JSON.stringify(cov.tally.covered)}`);
    if (M.HSD.coverSellable({ type: 'resource' }, false) || !M.HSD.coverSellable({ type: 'resource', junk: true }, false)) problems.push('sell-to-cover sells something other than junk');
    /* THE COINS REACH THE PURSE: a hero one coin short of the store's food, at full HP, can buy
       food once a kill has paid — without its coins the first meal it needs ends the hunt gold_out.
       Drain rats (Level 10) bite a Level-9 hero hard enough to need food, after a few kills; the cellar's rats never do. */
    /* Its bar eats the store's food under 40% HP (no drink slot), so the first meal comes after kills have paid coins. */
    const poorBar = [{ action: { type: 'consume', id: t.shop.heal }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 40 }], join: 'and' }];
    const out = runCut(M, () => [memberIn(M, 'a', { level: 9, gold: row.price - 1, bar: poorBar })], 1800000, [], groundWith(M, 'drain_rat'));
    const ms = out.outs.flatMap((o) => o.members);
    /* FOOD buys only: a 6 g store drink is affordable from the purse alone (designer 2026-10-17), so a drink buy proves nothing about the coins. */
    const tl = ms.reduce((a, x) => a + Object.entries(x.hunt.buys || {}).reduce((n, [id, q]) => n + ((t.basics[id] || {}).kind === 'heal' ? q : 0), 0), 0);
    const kills = ms.reduce((a, x) => a + x.delta.journal.meta.kills, 0);
    const end = ms.find((x) => x.hunt.ended);
    /* A DRINK THE PURSE CANNOT BUY ONLY GOES WITHOUT: a broke hero that wants to drink
       but never needs food hunts on (spec §3.4 #7); only an unaffordable FOOD ends gold_out.
 */
    /* Store by slot (2026-11-07): the drink is the bar's own slot, asked for on every step (mana at or below 100%). */
    const thirstyBar = [{ action: { type: 'consume', id: t.shop.mana }, conditions: [{ metric: 'self_mana_pct', op: 'lte', value: 100 }], join: 'and' }];
    const thirsty = runCut(M, () => [memberIn(M, 'a', { level: 40, gold: 0, bar: thirstyBar })], 600000, []);
    const tEnd = thirsty.outs.flatMap((o) => o.members).find((x) => x.hunt.ended);
    if (tEnd && tEnd.hunt.ended.reason === 'gold_out') problems.push('a broke hero that only wanted a drink ended gold_out');
    if (!(kills > 0)) problems.push(`CONTROL: the poor hero killed nothing (${JSON.stringify(end && end.hunt.ended)}, ${ms.length} windows, ${JSON.stringify(ms.map((x) => x.hunt.buys))})`);
    else if (!(tl > 0)) problems.push(`a hero one coin short bought no food after ${kills} kills (ended ${JSON.stringify(end && end.hunt.ended)}) — kill coins do not reach the purse`);
    return problems;
  },

  /* ECON-1 (designer 2026-10-17, Tyler's rule: gold + common drops pay the supplies,
     profit comes from rares). A melee hero at the bottom of the sewer's band (Level 8,
     Bronze Sword, 0 gold, the kit's 20 cooked shrimp) hunts drain rats for an hour on the
     store's drinks: it never ends gold_out, and the coins its kills drop pay every drink it
     buys. At the old 90 g Thin Turnip Juice it ended gold_out at 1:54. (Core rebuild: the
     cellar's rats cost a hero in its band no supplies at all, so the cellar proves nothing.) */
  'ECON-1': async (M) => {
    const problems = [];
    const fresh = () => [memberIn(M, 'a', { level: 8, gold: 0,
      bag: { cooked_shrimp: { loaded: 20 } }, equipment: { weapon: 'bronze_sword' } })];
    const cuts = Array.from({ length: 5 }, (_, i) => T0 + (i + 1) * 600000);
    const out = runCut(M, fresh, 3600000, cuts, groundWith(M, 'drain_rat'));
    const ms = out.outs.flatMap((o) => o.members);
    const price = (id) => (M.SB.BASIC_INDEX[id] || {}).price || 0;
    let drinks = 0; let drinkGold = 0; let coins = 0; let kills = 0;
    for (const x of ms) {
      for (const [id, n] of Object.entries(x.hunt.buys || {})) if ((M.SB.BASIC_INDEX[id] || {}).kind === 'mana') { drinks += n; drinkGold += n * price(id); }
      coins += x.delta.gold || 0;
      kills += x.delta.journal.meta.kills;
    }
    const end = ms.find((x) => x.hunt.ended);
    if (!(kills > 0)) problems.push('CONTROL: the fresh hero killed nothing');
    if (!(drinks > 0)) problems.push('CONTROL: the fresh melee hero bought no drink (its bar spends no mana?)');
    if (end) problems.push(`a fresh melee hero's hour ended ${JSON.stringify(end.hunt.ended)} after ${kills} kills (${drinks} drinks, ${drinkGold} g)`);
    if (!(drinkGold <= coins)) problems.push(`a fresh melee hero's drinks cost ${drinkGold} g an hour against ${coins} g of kill coins`);
    return problems;
  },

  SPLIT: async (M) => {
    const problems = [];
    const { splitEven, itemOwner } = M.PS;
    for (const [t, n] of [[0, 1], [7, 1], [7, 2], [10, 3], [101, 4]]) {
      const s = splitEven(t, n);
      if (s.length !== n || s.reduce((a, b) => a + b, 0) !== t || s.some((x, i) => x !== Math.floor(t / n) + (i === 0 ? t - Math.floor(t / n) * n : 0))) {
        problems.push(`splitEven(${t}, ${n}) = ${JSON.stringify(s)}`);
      }
    }
    if ([0, 1, 2, 3, 4].map((k) => itemOwner(k, 3, 2)).join() !== '2,0,1,2,0') problems.push('items do not go round-robin from the offset');
    problems.push(...rareRollRules(M));
    /* Two heroes: both are paid, and neither more than its share plus the remainders (one a kill). */
    const out = runCut(M, () => [memberIn(M, 'a', { unitId: null, seat: 0, partyRoles: ['melee_dps', 'melee_dps'] }),
      memberIn(M, 'b', { unitId: null, seat: 1, partyRoles: ['melee_dps', 'melee_dps'] })], 900000, []);
    const ms = out.outs.flatMap((o) => o.members);
    const g = { a: 0, b: 0 }; const items = { a: 0, b: 0 }; let kills = 0;
    for (const x of ms) {
      g[x.key] += x.delta.gold || 0;
      items[x.key] += Object.values(x.delta.items || {}).reduce((s, n) => s + n, 0);
      if (x.key === 'a') kills += x.delta.journal.meta.kills;
    }
    if (!(kills >= 4)) problems.push(`CONTROL: the pair killed ${kills}`);
    if (!(g.a > 0 && g.b > 0) || Math.abs(g.a - g.b) > kills) problems.push(`gold split ${JSON.stringify(g)} over ${kills} kills is not even`);
    if (!(items.a > 0 && items.b > 0)) problems.push(`loot went to one hero only: ${JSON.stringify(items)}`);
    if (ms.filter((x) => x.key === 'b').reduce((a, x) => a + x.delta.journal.meta.kills, 0) !== kills) problems.push('the two heroes journalled different kill counts for one instance');
    /* THE RARE ROLL, BOTH PATHS: the cellar's rats carry ten 5% Crown Shard rows (each a rare). One span (the browser
       closed) and the same hunt cut at odd instants (viewed) roll the same rares to the same heroes, each Crown Shard
       is the roll winner's, and with two heroes the rotation alternates: a roll, then the other hero's without dice. */
    const rat = M.MONSTERS.rat;
    const rareCat = { ...M.MONSTERS, rat: { ...rat, drops: [...rat.drops, ...Array.from({ length: 10 }, () => ({ id: 'crown_shard', ch: 0.05 }))] } };
    const pair = () => [memberIn(M, 'a', { unitId: null, seat: 0, partyRoles: ['melee_dps', 'melee_dps'] }),
      memberIn(M, 'b', { unitId: null, seat: 1, partyRoles: ['melee_dps', 'melee_dps'] })];
    const rareRun = (cuts) => {
      const o = runCut(M, pair, 900000, cuts, { monsters: rareCat });
      const rolls = o.outs.flatMap((x) => x.events.filter((e) => e.type === 'rare_roll'));
      const shards = { a: 0, b: 0 };
      for (const x of o.outs.flatMap((y) => y.members)) shards[x.key] += (x.delta.items || {}).crown_shard || 0;
      const unitOf = Object.fromEntries(o.outs.flatMap((y) => y.members).filter((x) => Number.isInteger(x.hunt.unit_id)).map((x) => [x.hunt.unit_id, x.key]));
      return { rolls, shards, unitOf };
    };
    const span = rareRun([]);
    const viewed = rareRun([T0 + 7001, T0 + 33333, T0 + 101101, T0 + 250007, T0 + 499999, T0 + 777777]);
    const won = { a: 0, b: 0 };
    for (const e of span.rolls) won[span.unitOf[e.u]] = (won[span.unitOf[e.u]] || 0) + 1;
    if (!(span.rolls.length >= 4)) problems.push(`CONTROL: the pair rolled for ${span.rolls.length} rares in 15 minutes`);
    if (canon(won) !== canon(span.shards)) problems.push(`the Crown Shards went ${canon(span.shards)} but the rolls were won ${canon(won)}`);
    span.rolls.forEach((e, i) => {
      const odd = i % 2 === 1;
      if (odd && (e.u === span.rolls[i - 1].u || canon(e.rolls) !== '{}')) problems.push(`rare roll ${i} went to ${e.u} with ${canon(e.rolls)} after ${span.rolls[i - 1].u} won (the other hero, no dice)`);
      if (!odd && Object.keys(e.rolls).length !== 2) problems.push(`rare roll ${i} rolled ${canon(e.rolls)} (a fresh rotation: both heroes roll)`);
    });
    const sig = (r) => canon({ rolls: r.rolls.map((e) => [e.atMs, e.u, e.item, e.rolls, e.reroll || null]), shards: r.shards });
    if (sig(span) !== sig(viewed)) problems.push(`the viewed cut rolled differently from one span ${firstDiff(sig(span), sig(viewed))}`);
    return problems;
  },

  /* THE RARE-DROP MOMENT (Tyler, super-rare drop moments): a carrier's rare dropped in a settle reaches the hero
     who owns it, as the window's world event the timeline plays (the alert, the float, the log line: rare_drop
     with u = that hero's unit) and as the session's hint (hints.rare_drop, the journal row), whether the
     browser was closed (one span) or viewed (cut windows). */
  'RARE-DROP': async (M) => {
    const problems = [];
    const rat = M.MONSTERS.rat;
    const rareCat = { ...M.MONSTERS, rat: { ...rat, drops: [...rat.drops, { id: 'crown_shard', ch: 0.05 }, { id: 'crown_shard', ch: 0.05 }] } };
    const one = (cuts) => {
      const o = runCut(M, () => [memberIn(M, 'a', { unitId: null })], 900000, cuts, { monsters: rareCat });
      const drops = o.outs.flatMap((x) => x.events.filter((e) => e.type === 'rare_drop'));
      const units = new Set(o.outs.flatMap((x) => x.members).map((x) => x.hunt.unit_id).filter(Number.isInteger));
      const hints = o.outs.flatMap((x) => x.members).flatMap((x) => (x.hunt.hints && x.hunt.hints.rare_drop) || []);
      const shards = o.outs.flatMap((x) => x.members).reduce((n, x) => n + ((x.delta.items || {}).crown_shard || 0), 0);
      const timeline = o.outs.flatMap((x) => M.HT.huntTimeline(x.track, x.events, T0, x.settledTo, x.settledTo, x.units).hunt_events)
        .filter((e) => e.type === 'rare_drop');
      return { drops, units, hints, shards, timeline };
    };
    const span = one([]);
    const viewed = one([T0 + 7001, T0 + 133333, T0 + 499999]);
    if (!(span.shards >= 2)) return ['CONTROL: the hero looted ' + span.shards + ' Crown Shards in 15 minutes'];
    if (span.drops.length !== span.shards) problems.push(span.shards + ' Crown Shards looted, ' + span.drops.length + ' rare_drop world events');
    if (span.drops.some((e) => e.item !== 'crown_shard' || !span.units.has(e.u) || !Number.isInteger(e.atMs))) problems.push('a rare_drop does not name the hero and the item: ' + canon(span.drops[0]));
    if (span.timeline.length !== span.drops.length || span.timeline.some((e) => typeof e.id !== 'string')) problems.push('the timeline carries ' + span.timeline.length + ' rare drops of ' + span.drops.length);
    if (span.hints.length !== span.shards || span.hints.some((h) => h.item !== 'crown_shard' || !Number.isInteger(h.at))) problems.push('the session hints carry ' + canon(span.hints) + ' for ' + span.shards + ' shards');
    const sig = (r) => canon(r.drops.map((e) => [e.atMs, e.u, e.item]));
    if (sig(span) !== sig(viewed)) problems.push('the viewed cut dropped its rares differently ' + firstDiff(sig(span), sig(viewed)));
    return problems;
  },

  DEATH: async (M) => {
    const problems = [];
    /* A Level-10 hero at 20 HP, nothing to eat, no store (end): it dies to the fixture's foes. */
    const S5 = (k) => M.XP.skillXpForLevel(k, 5) + 400;
    const weak = () => [memberIn(M, 'a', { level: 5, levelXp: M.XP.charXpForLevel(5) + 800, skills: { melee: S5('melee'), defense: S5('defense') }, hp: 5, empty: 'end' })];
    const away = runCut(M, weak, 600000, [], deadlyOf(M));
    const ms = away.outs.flatMap((o) => o.members);
    const dead = ms.find((x) => x.summary.deathLog.length);
    if (!dead) return [`CONTROL: the weak hero never died (${away.outs.length} windows)`];
    const d = dead.summary.deathLog[0];
    if (ms.reduce((a, x) => a + x.summary.deathLog.length, 0) !== 1) problems.push('the hero died more than once in one hunt');
    if (!dead.delta.deaths || dead.delta.deaths.length !== 1 || 'recovery_ms' in dead.delta.deaths[0] || 'resume_hp' in dead.delta.deaths[0]) {
      problems.push(`the death row is ${JSON.stringify(dead.delta.deaths)} (one row, no recovery fields)`);
    }
    if ('recovering_until' in dead.delta) problems.push('a death still stamps a recovery line');
    if (!dead.hunt.ended || dead.hunt.ended.reason !== 'died') problems.push(`the death ended the hunt ${JSON.stringify(dead.hunt.ended)}, not died`);
    else if (Date.parse(dead.hunt.ended.at) !== Math.ceil((d.atMs - T0) / 2000) * 2000 + T0 && Date.parse(dead.hunt.ended.at) !== Math.floor((d.atMs - T0) / 2000) * 2000 + T0 + 2000) {
      problems.push(`the hunt ended at ${dead.hunt.ended.at}, not the boundary after the death (${new Date(d.atMs).toISOString()})`);
    }
    if (dead.delta.hp !== dead.maxHp) problems.push(`a dead hero came home at ${dead.delta.hp} of ${dead.maxHp} HP — back in town at full`);
    const loss = dead.hunt.death_xp && dead.hunt.death_xp[0];
    if (!loss || !(loss.level > 0) || !(loss.melee > 0)) problems.push(`the death cost ${JSON.stringify(loss)}, not the Level and the combat skills`);
    /* ATTENDED: the same hunt cut at odd instants (one of them inside the death's swing) dies the same way. */
    const cutAt = [T0 + 7001, T0 + 33333, d.atMs - 700, d.atMs + 500, d.atMs + 1999];
    const att = runCut(M, weak, 600000, cutAt, deadlyOf(M));
    const am = att.outs.flatMap((o) => o.members);
    const ad = am.find((x) => x.summary.deathLog.length);
    const sig = (x) => x && canon({ at: x.summary.deathLog[0].atMs, m: x.summary.deathLog[0].monster, end: x.hunt.ended, dx: x.hunt.death_xp });
    if (sig(ad) !== sig(dead)) problems.push(`the attended cut died differently from one span ${firstDiff(sig(dead) || '', sig(ad) || '')}`);
    return problems;
  },

  'PARTY-DEATH': async (M) => {
    const problems = [];
    const roles = ['melee_dps', 'melee_dps'];
    const out = runCut(M, () => [memberIn(M, 'a', { seat: 0, level: 1, skills: {}, hp: 5, empty: 'end', partyRoles: roles }),
      memberIn(M, 'b', { seat: 1, level: 60, partyRoles: roles })], 600000, [], deadlyOf(M));
    const ms = out.outs.flatMap((o) => o.members);
    const endOf = (k) => (ms.find((x) => x.key === k && x.hunt.ended) || {}).hunt;
    const a = endOf('a'); const b = endOf('b');
    if (!a || a.ended.reason !== 'died') return [`CONTROL: the weak member ended ${JSON.stringify(a && a.ended)}`];
    if (!b || b.ended.reason !== 'party_member_died') problems.push(`the survivor ended ${JSON.stringify(b && b.ended)}, not party_member_died`);
    else if (b.ended.at !== a.ended.at) problems.push(`the two ends are ${a.ended.at} / ${b.ended.at}, not one boundary`);
    if (ms.some((x) => x.key === 'b' && (x.summary.deathLog.length || (x.hunt.death_xp || []).length))) problems.push('the survivor paid for a death it did not have');
    return problems;
  },

  QUIVER: async (M) => {
    const problems = [];
    /* The bar holds one ability that looses no shot, so every arrow is a basic's. */
    const ranger = (ammo, n) => () => [memberIn(M, 'a', { role: 'ranger', bar: ['hunters_mark'], bag: { [ammo]: { loaded: n, left: n, essential: true } },
      equipment: { weapon: 'oak_shortbow', ammo }, empty: 'end', level: 30 })];
    const out = runCut(M, ranger('barbed_arrows', 40), 1800000, []);
    const r = out.outs.flatMap((o) => o.members);
    const used = r.reduce((a, x) => a + (x.hunt.uses.barbed_arrows || 0), 0);
    const end = r.find((x) => x.hunt.ended);
    if (used !== 40) problems.push(`a 40-arrow bag loosed ${used} arrows`);
    if (!end || end.hunt.ended.reason !== 'ammo_out') problems.push(`the dry quiver ended ${JSON.stringify(end && end.hunt.ended)}, not ammo_out`);
    /* THE FREE RUNG (ammoPerShot 0): one Bronze Arrow in the bag shoots all window and is never spent. */
    const free = runCut(M, ranger('bronze_arrows', 1), 600000, []);
    const f = free.outs.flatMap((o) => o.members);
    const shots = free.outs.reduce((a, o) => a + o.events.filter((e) => e.type === 'dmg' && e.ability === 'basic').length, 0);
    if (f.some((x) => (x.hunt.uses.bronze_arrows || 0) > 0)) problems.push('the free rung was spent from the bag');
    if (!(shots > 10)) problems.push(`one free arrow shot ${shots} basics in ten minutes — the free rung does not shoot`);
    return problems;
  },

  /* THE HONE (lane c-work-fixes 2026-10-22): a whetstone is worn by the swing clock (ammoPerShot 0.02 =
     one stone every fiftieth swing), the same stones however the settles are cut, and its bonus stops
     on the swing the hunt's last stone wears. Before the fix the engine wore none, at any tier. */
  HONE: async (M) => {
    const problems = [];
    const MB = await import(pathToFileURL(join(M.root, 'src/core/member.js')).href);
    const melee = (n, o) => memberIn(M, 'a', Object.assign({ role: 'melee_dps', level: 40,
      bag: { steel_whetstone: { loaded: n, left: n } }, equipment: { weapon: 'stone_maul', ammo: 'steel_whetstone' } }, o || {}));
    const used = (out) => out.outs.flatMap((o) => o.members).reduce((a, x) => a + (x.hunt.uses.steel_whetstone || 0), 0);
    /* 30 min = 900 swings: 18 stones of 100, in one span and cut at odd instants (TICK-1). */
    const one = used(runCut(M, () => [melee(100)], 1800000, []));
    const cut = used(runCut(M, () => [melee(100)], 1800000, [T0 + 100999, T0 + 250001, T0 + 1000003]));
    if (one !== 18) problems.push(`900 swings wore ${one} steel whetstones, not 18 (0.02 a swing)`);
    if (cut !== one) problems.push(`the cut hunt wore ${cut} stones, the one span ${one}`);
    /* A bag of 3 wears 3, never more. */
    const three = used(runCut(M, () => [melee(3)], 1800000, []));
    if (three !== 3) problems.push(`a bag of 3 stones wore ${three}`);
    /* THE BONUS STOPS on the swing the last stone wears, and a stone not carried pays nothing. */
    const m = MB.memberSide(melee(1, { extra: {} }), { items: M.ITEMS }).member;
    const bare = MB.memberSide(memberIn(M, 'a', { role: 'melee_dps', level: 40, equipment: { weapon: 'stone_maul' } }), { items: M.ITEMS }).member;
    const unpacked = MB.memberSide(melee(0, { bag: {} }), { items: M.ITEMS }).member;
    const hit = (x) => x.snapshot(x.state).maxHit;
    const honed = hit(m);
    if (!(honed > hit(bare))) return problems.concat([`CONTROL: a carried steel whetstone adds no max hit (${honed} vs bare ${hit(bare)})`]);
    m.hs.swingIndex = 49; m.wear(T0);
    if (hit(m) !== honed || m.hs.bag.steel_whetstone.left !== 1) problems.push('swing 49 wore a stone (0.02 wears on the fiftieth)');
    m.hs.swingIndex = 50; m.wear(T0);
    if (m.hs.bag.steel_whetstone.left !== 0) problems.push(`swing 50 left ${m.hs.bag.steel_whetstone.left} stones of 1`);
    if (hit(m) !== hit(bare)) problems.push(`the spent stone still pays: max hit ${hit(m)}, bare ${hit(bare)}`);
    if (hit(unpacked) !== hit(bare)) problems.push(`an equipped but unpacked stone pays: max hit ${hit(unpacked)}, bare ${hit(bare)}`);
    return problems;
  },

  /* THE RUNE SPEND (lane a-rune-spend, 2026-10-23 audit; lane b-spell-core: runes fuel SPELLS only, a caster's basic
     costs mana and trains Magic, arrows fall back to the store), BOTH PATHS: every case settles the same in one span
     (the browser closed) and cut at odd instants (viewed). (1) A Healer's staff with Fire Runes loaded and the store's
     Plain Fire Rune behind them never spends or buys a rune for a basic: each basic spends the role's mana and pays its
     Magic XP. (2) A Mage's wand with Earth Runes loaded never spends one and never ends ammo_out. (3) A slot naming
     Barbed Arrows while Bronze are loaded lands exactly Barbed-loaded's blows (it hit at the loaded ammo's strength).
     (4) An unaffordable store-rune Flame Strike above Power Strike never ends the hunt (it ended gold_out at once).
     (5) A Ranger's 50 Iron Arrows run out and the store's Plain Iron Arrows carry the hunt on (Tyler 10-23: it hunted
     on with no basic attack); with no gold to buy one the hunt ends gold_out (Tyler 10-14). */
  'RUNE-SPEND': async (M) => {
    const problems = [];
    const span = 600000;
    const cuts = [T0 + 7001, T0 + 133333, T0 + 299999, T0 + 450001];
    const ms = (o) => o.outs.flatMap((x) => x.members);
    const unitOf = (o) => (ms(o).find((x) => Number.isInteger(x.hunt.unit_id)) || { hunt: {} }).hunt.unit_id;
    const hits = (o) => { const id = unitOf(o); return o.outs.flatMap((x) => x.events.filter((e) => e.type === 'dmg' && e.ability === 'basic' && e.u === id).map((e) => [e.atMs, e.t, e.amount])); };
    const sum = (o, k) => ms(o).reduce((a, x) => { for (const [id, n] of Object.entries(x.hunt[k] || {})) a[id] = (a[id] || 0) + n; return a; }, {});
    const xp = (o, k) => ms(o).reduce((a, x) => a + ((x.delta.xp || {})[k] || 0), 0);
    const ended = (o) => (ms(o).find((x) => x.hunt.ended) || { hunt: {} }).hunt.ended || null;
    const casts = (o, ab) => o.outs.reduce((a, x) => a + x.events.filter((e) => e.type === 'cast' && e.ability === ab).length, 0);
    const basicMana = (o) => { const id = unitOf(o); return o.outs.reduce((a, x) => a + x.events.filter((e) => e.type === 'shot' && e.u === id).reduce((n, e) => n + (e.mana || 0), 0), 0); };
    const sig = (o) => canon({ hits: hits(o), bought: sum(o, 'buys'), uses: sum(o, 'uses'), ended: ended(o), magic: xp(o, 'magic'), mana: basicMana(o) });
    const both = (label, mk) => {
      const one = runCut(M, mk, span, []);
      const cut = runCut(M, mk, span, cuts);
      if (sig(one) !== sig(cut)) problems.push(`${label}: the viewed cut settled differently from one span ${firstDiff(sig(one), sig(cut))}`);
      return one;
    };
    /* (1) a Healer's staff with three Fire Runes loaded and the store's Plain Fire Rune behind them */
    const fire = both('fire', () => [memberIn(M, 'a', { role: 'healer', level: 50, gold: 5000, bag: { fire_rune: { loaded: 3, left: 3 } },
      equipment: { weapon: 'maple_staff', ammo: 'fire_rune' } })]);
    const cost = M.ROLES.HUNT_ROLES.healer.basic.mana;
    if (sum(fire, 'buys').plain_fire_rune) problems.push(`a staff's basics bought ${sum(fire, 'buys').plain_fire_rune} Plain Fire Runes the bar never named`);
    if (sum(fire, 'uses').fire_rune) problems.push(`the staff's basics spent ${sum(fire, 'uses').fire_rune} Fire Runes (runes fuel spells only)`);
    if (!(hits(fire).length > 3)) problems.push(`the staff landed ${hits(fire).length} basics`);
    const swings = fire.outs.reduce((a, x) => a + x.events.filter((e) => (e.type === 'dmg' || e.type === 'miss' || e.type === 'immune') && e.u === unitOf(fire) && (e.ability || 'basic') === 'basic').length, 0);
    if (basicMana(fire) !== swings * cost) problems.push(`the staff's ${swings} basics spent ${basicMana(fire)} mana, want ${cost} each`);
    /* Magic XP is exactly the mana every cast AND every basic spent, at its multiplier (hunt-rewards.js) */
    const paid = fire.outs.reduce((a, x) => a + x.events.filter((e) => (e.type === 'cast' || e.type === 'shot') && e.u === unitOf(fire) && e.mana > 0 && e.magicXpMult > 0)
      .reduce((n, e) => n + M.XS.magicXpFor(e.mana, e.magicXpMult / 1000), 0), 0);
    if (!(basicMana(fire) > 0) || xp(fire, 'magic') !== paid) problems.push(`the staff trained ${xp(fire, 'magic')} Magic for ${paid} XP of casts and basics`);
    /* a loaded rune adds nothing to the blow: the same staff with no rune at all lands the same blows */
    const bare = runCut(M, () => [memberIn(M, 'a', { role: 'healer', level: 50, gold: 5000, equipment: { weapon: 'maple_staff' } })], span, []);
    if (canon(hits(bare)) !== canon(hits(fire))) problems.push(`a loaded Fire Rune changed the staff's basics ${firstDiff(canon(hits(bare)), canon(hits(fire)))}`);
    /* (2) a Mage's wand with twenty Earth Runes loaded (no store row behind them), the default supply setting */
    const earth = both('earth', () => [memberIn(M, 'a', { role: 'mage', level: 20, bag: { earth_rune: { loaded: 20, left: 20, essential: true } },
      equipment: { weapon: 'oak_wand', shield: 'oak_spellbook', ammo: 'earth_rune' } })]);
    if (ended(earth)) problems.push(`Earth Runes ended a default hunt ${canon(ended(earth))}`);
    if (sum(earth, 'uses').earth_rune) problems.push(`the wand's basics spent ${sum(earth, 'uses').earth_rune} Earth Runes`);
    if (!(hits(earth).length > 30)) problems.push(`the wand landed ${hits(earth).length} basics in ten minutes`);
    /* (3) a Ranger with Steel named on the bar and Bronze loaded, or Steel loaded (its one ability looses no shot,
       so every arrow spent is a basic's) */
    const food = { action: { type: 'consume', id: 'salted_shrimp' }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 50 }], join: 'and' };
    const ranger = (ammo, bar, bag, o) => () => [memberIn(M, 'a', Object.assign({ role: 'ranger', level: 30, gold: 5000, bar: ['hunters_mark'].concat(bar), bag,
      equipment: { weapon: 'shortbow', ammo } }, o || {}))];
    const quiver = { steel_arrows: { loaded: 2000, left: 2000 }, bronze_arrows: { loaded: 1, left: 1 } };
    const named = both('steel named', ranger('bronze_arrows', [{ action: { type: 'attack_with_item', id: 'steel_arrows' }, conditions: [], join: 'and' }, food], quiver));
    const loaded = both('steel loaded', ranger('steel_arrows', [food], quiver));
    const bronze = runCut(M, ranger('bronze_arrows', [food], quiver), span, []);
    if (!(hits(loaded).length > 30) || canon(hits(loaded)) === canon(hits(bronze))) problems.push('CONTROL: Steel loaded and Bronze loaded landed the same blows (the arm cannot see the ammo)');
    if (canon(hits(named)) !== canon(hits(loaded))) problems.push(`a Steel slot with Bronze loaded did not land Steel-loaded's blows ${firstDiff(canon(hits(loaded)), canon(hits(named)))}`);
    if (sum(named, 'uses').steel_arrows !== sum(loaded, 'uses').steel_arrows) problems.push(`the Steel slot spent ${sum(named, 'uses').steel_arrows} Steel Arrows, Steel loaded ${sum(loaded, 'uses').steel_arrows}`);
    /* (5) fifty Iron Arrows, then the store; and with no gold the hunt ends gold_out (the fixture's cut keeps a
       hunt that ended settling on, so the two paths are compared up to the window it ends in) */
    const iron = both('iron', ranger('iron_arrows', [food], { iron_arrows: { loaded: 50, left: 50, essential: true } }, { level: 10 }));
    if (sum(iron, 'uses').iron_arrows !== 50 || !(sum(iron, 'buys').plain_iron_arrows > 0) || ended(iron)) {
      problems.push(`50 Iron Arrows did not fall to the store: uses ${canon(sum(iron, 'uses'))}, buys ${canon(sum(iron, 'buys'))}, ended ${canon(ended(iron))}`);
    }
    const toEnd = (o) => {
      const b = {};
      for (const x of o.outs) {
        for (const p of x.members) for (const [id, n] of Object.entries(p.hunt.buys || {})) b[id] = (b[id] || 0) + n;
        if (x.members.some((p) => p.hunt.ended)) break;
      }
      return canon({ b, e: ended(o) });
    };
    /* (no food slot: the arrow alone must end it) */
    const broke0 = ranger('iron_arrows', [], { iron_arrows: { loaded: 5, left: 5, essential: true } }, { level: 10, gold: 0 });
    const poor = runCut(M, broke0, span, []), poorCut = runCut(M, broke0, span, cuts);
    if (toEnd(poor) !== toEnd(poorCut)) problems.push(`iron, no gold: the viewed cut ended differently ${firstDiff(toEnd(poor), toEnd(poorCut))}`);
    if (!ended(poor) || ended(poor).reason !== 'gold_out') problems.push(`a Ranger out of arrows and gold hunted on: ended ${canon(ended(poor))}`);
    /* (4) a tank whose first slot is Flame Strike on the store's rune it cannot pay (the gold floor), then Power Strike */
    const broke = both('broke', () => [memberIn(M, 'a', { role: 'tank', level: 30, floor: 100000,
      bar: [{ action: { type: 'ability', id: 'flame_strike', store: 'plain_fire_rune' }, conditions: [], join: 'and' }, 'power_strike'] })]);
    if (ended(broke)) problems.push(`an unaffordable store-rune spell ended the hunt ${canon(ended(broke))} while Power Strike could cast`);
    if (!(casts(broke, 'power_strike') > 0)) problems.push('CONTROL: Power Strike never cast');
    if (casts(broke, 'flame_strike')) problems.push(`Flame Strike cast ${casts(broke, 'flame_strike')} times on a store rune the purse could not pay`);
    return problems;
  },

  'WORLD-BOUND': async (M) => {
    const problems = [];
    const roles = ['melee_dps', 'ranger', 'mage', 'healer'];
    const out = runCut(M, () => roles.map((role, i) => memberIn(M, 'p' + i, { role, seat: i, partyRoles: roles, level: 40,
      bag: { cooked_shrimp: { loaded: 50, left: 50 } }, equipment: role === 'ranger' ? { ammo: 'bronze_arrows' } : {} })),
    1800000, Array.from({ length: 19 }, (_, i) => T0 + (i + 1) * 90000));
    const max = M.TUN.HUNT_TUNING.worldMaxBytes;
    let worst = 0;
    for (const o of out.outs) if (o.world) worst = Math.max(worst, Buffer.byteLength(o.world, 'utf8'));
    if (!(worst > 0)) problems.push('CONTROL: the party left no world');
    if (worst > max) problems.push(`a four-hero world reached ${worst} bytes, over the ${max} bound`);
    const w = M.WS.makeWorld({ ground: 'x', swing: 0, units: Array.from({ length: 400 }, (_, i) => ({ id: i + 1, side: 'mon', kind: 'rat', x: 1, y: 1 })) });
    if (!M.WS.validate(w).some((p) => /bound/.test(p))) problems.push('world-state did not refuse a world over the byte bound');
    return problems;
  },

  FENCE: async (M) => {
    const problems = [];
    const inp = { activeKind: 'combat', activeId: 'mill_cellar', huntOpen: true, monsters: M.MONSTERS, items: M.ITEMS, nowMs: T0 };
    if (M.AC.computeAccrual(inp).reason !== M.AC.SKIP.HUNT_OPEN) problems.push('the old path priced a hunter');
    if (M.AC.computeAccrual({ ...inp, huntOpen: false }).reason !== M.AC.SKIP.HUNT_REQUIRED) problems.push('a combat pointer with no hunt was priced');
    if (!M.IN.SAFE_SKIP_REASONS.includes('hunt_open')) problems.push('hunt_open is not classified SAFE');
    return problems;
  },

  'DEATHXP-RULE': async (M) => {
    const problems = [];
    const lv = M.AR.levelDeathLoss; const sk = M.AR.skillDeathLoss; const C = M.XP.charXpForLevel; const S = (l) => M.XP.skillXpForLevel('melee', l);
    const f = M.HSD.DEATH_XP_LOSS;
    if (lv(C(10)) !== 0) problems.push('a death at a Level floor costs Level XP');
    const x = C(11) - 1;
    if (lv(x, f, 'total') !== Math.min(Math.floor(x * f), x - C(10))) problems.push('a death does not cost DEATH_XP_LOSS of the TOTAL Level XP');
    if (lv(x, f, 'level') !== Math.min(Math.floor((C(11) - C(10)) * f), x - C(10))) problems.push('the `level` base does not cost a share of the Level span');
    if (lv(C(10) + 3) !== 3) problems.push('a death de-levels the Level');
    if (sk('melee', S(10)) !== 0 || sk('melee', S(10) + 1000) !== Math.floor(1000 * f)) problems.push('a skill does not lose DEATH_XP_LOSS of its progress');
    if (sk('melee', S(11) - 1) > S(11) - 1 - S(10)) problems.push('a skill loses a level');
    return problems;
  },
};

// ═══════════════════════════════════════════════════════════════════════
// DATABASE ARMS (the real chain, PGlite, as hr_engine)
// ═══════════════════════════════════════════════════════════════════════
async function q(db, sql, params) { return (await db.query(sql, params)).rows; }
async function one(db, sql, params) { const r = await q(db, sql, params); return r[0] ? Object.values(r[0])[0] : undefined; }
const makeExec = (db) => async (text, params) => {
  await db.exec('set role hr_engine');
  try { return (await db.query(text, params)).rows; } finally { await db.exec('reset role'); }
};
const asUser = (db, uid) => db.query(`select set_config('request.jwt.claim.sub', $1, true)`, [uid]);
const idem = () => crypto.randomUUID();
async function inTx(db, fn) {
  await db.query('begin');
  try { return await fn(); } finally { await db.query('rollback'); }
}

/* The fixture ground's catalogue rows (the generator's own row builder). */
async function installGround(db, row = groundRow) {
  fixtureRow = row;
  const GEN = await import(pathToFileURL(join(ROOT, 'tools', 'gen-hunt-sessions.mjs')).href);
  const { rows, spawns } = GEN.groundRows({ h1_fixture: row() });
  for (const g of rows) {
    await db.query(`insert into public.hr_hunt_grounds (hunt_id, ground_id, pockets, spawns, respawn_ms, seats, density_max) values ($1,$2,$3,$4,$5,$6,$7::int[])
                    on conflict (hunt_id) do update set ground_id = excluded.ground_id, pockets = excluded.pockets, spawns = excluded.spawns,
                      respawn_ms = excluded.respawn_ms, seats = excluded.seats, density_max = excluded.density_max`,
                    [g.hunt, g.ground, g.pockets, g.spawns, g.respawn, g.seats, g.dmax]);
    await db.query('delete from public.hr_hunt_ground_spawns where hunt_id = $1', [g.hunt]);
  }
  for (const s of spawns) await db.query('insert into public.hr_hunt_ground_spawns (hunt_id, monster_id, n) values ($1,$2,$3) on conflict do nothing', [s.hunt, s.monster, s.n]);
}

async function admin(db, uid, delta) {
  const v = await one(db, 'select version from public.player_state where user_id = $1 and slot = 0', [uid]);
  const [r] = await makeExec(db)('select public.hr_apply($1::uuid, 0, $2::bigint, $3::uuid, $4::text::jsonb) as r',
    [uid, v, idem(), JSON.stringify({ ...delta, journal: { kind: 'admin', intent: 's1_probe' } })]);
  if (!r || !r.r || r.r.ok !== true) throw new Error('admin apply refused: ' + JSON.stringify(r && r.r));
}

/* A probe character: created, its kit replaced by `inv`, skills / gold / options / premium set. */
async function character(db, M, uid, o) {
  await db.query('insert into auth.users (id) values ($1) on conflict (id) do nothing', [uid]);
  if (CLOSED) await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 'hunt-sessions-settle --closed') on conflict (user_id) do nothing`, [uid]);
  await asUser(db, uid);
  const c = await one(db, 'select public.hr_create_character(0)');
  if (!c || c.created !== true) throw new Error('probe character refused: ' + JSON.stringify(c));
  await db.query("update public.player_state set active_kind = 'idle', active_id = null where user_id = $1 and slot = 0", [uid]);
  if (!o.keepKit) await db.query('delete from public.player_inventory where user_id = $1 and slot = 0', [uid]);
  for (const [item, qty] of Object.entries(o.inv || {})) {
    await db.query('insert into public.player_inventory (user_id, slot, item_id, qty) values ($1, 0, $2, $3) on conflict (user_id, slot, item_id) do update set qty = excluded.qty', [uid, item, qty]);
  }
  if (o.level) {
    await admin(db, uid, { xp: Object.fromEntries(['melee', 'ranged', 'magic', 'defense'].map((k) => [k, M.XP.skillXpForLevel(k, o.level)])) });
    /* Level XP is credited only by the hunt settle (kills only): a fixture sets it directly. */
    await db.query('update public.player_state set level_xp = $2 where user_id = $1 and slot = 0', [uid, M.XP.charXpForLevel(o.level) + (o.levelXpOver || 0)]);
  }
  if (o.skillsXp) await admin(db, uid, { xp: o.skillsXp });
  if (o.gold != null) {
    await db.query('update public.player_state set gold = $2 where user_id = $1 and slot = 0', [uid, o.gold]);
  }
  if (o.hp) await db.query('update public.player_state set hp = $2 where user_id = $1 and slot = 0', [uid, o.hp]);
  if (o.options) {
    await asUser(db, uid);
    const r = await one(db, 'select public.hr_action_set_options(0, 0, $1::jsonb, $2::uuid)', [JSON.stringify(o.options), idem()]);
    if (!r || r.ok !== true) throw new Error('options refused: ' + JSON.stringify(r));
  }
  /* The density pick on the hunter's ground (hunt_density, 2026-11-17-hunt-density-home.sql: per ground, never a setup). */
  if (o.density != null) {
    await asUser(db, uid);
    const r = await one(db, `select public.hr_hunt_density_set(0, 'mill_cellar', $1::int, $2::uuid)`, [o.density, idem()]);
    if (!r || r.ok !== true) throw new Error('density refused: ' + JSON.stringify(r));
  }
  if (o.premium) await db.query(`select public.hr_premium_grant($1, 0, now() + interval '30 days', 's1 probe')`, [uid]);
  if (o.lastActivity) {
    await db.query('update public.player_state set last_activity_kind = $2, last_activity_id = $3 where user_id = $1 and slot = 0',
      [uid, o.lastActivity.kind, o.lastActivity.id]);
  }
  /* A town activity RUNNING when the hero presses Enter (burying, fishing): the enter must stop it. */
  if (o.running) {
    await db.query('update public.player_state set active_kind = $2, active_id = $3, active_since = now(), accrued_to = now() where user_id = $1 and slot = 0',
      [uid, o.running.kind, o.running.id]);
  }
}

/* A hunter: one character (or, with o.party, every character of a party) on mill_cellar `minutesAgo` minutes ago. */
async function hunter(db, M, o) {
  if (o.realGround) fixtureRow = null; else await installGround(db, o.row || (o.deadly ? deadlyRow : groundRow));
  await db.query('update public.hr_hunt_config set enabled = true where id');
  const who = o.party ? o.party : [o];
  for (let i = 0; i < who.length; i++) await character(db, M, UIDS[i], who[i]);
  let party = null;
  if (o.party) {
    /* THE FIRST INVITE MAKES THE PARTY (2026-10-28-party-flow.sql; hr_hunt_party_create is retired). */
    await asUser(db, UIDS[1]);
    const named = await one(db, 'select public.hr_character_name_set(0, $1, $2::uuid)', ['Settle Second', idem()]);
    if (!named || named.ok !== true) throw new Error('name refused: ' + JSON.stringify(named));
    await asUser(db, UIDS[0]);
    const inv = await one(db, 'select public.hr_hunt_party_invite(0, $1, $2::uuid)', ['Settle Second', idem()]);
    if (!inv || inv.ok !== true) throw new Error('party invite refused: ' + JSON.stringify(inv));
    party = await one(db, 'select public.hr_hunt_party_of($1::uuid, 0)', [UIDS[0]]);
    /* The ground is the leader's pick at Start (hr_hunt_party_start); these arms enter member by member, so the
       fixture binds it as the retired create did. */
    await db.query("update public.hunt_parties set hunt_id = 'mill_cellar' where id = $1", [party]);
    /* A party is joined only by invite or once its leader LISTS it (2026-10-29-party-security.sql). */
    const listed = await one(db, 'select public.hr_hunt_party_list(0, true, $1::uuid)', [idem()]);
    if (!listed || listed.ok !== true) throw new Error('party list refused: ' + JSON.stringify(listed));
    for (let i = 1; i < who.length; i++) {
      await asUser(db, UIDS[i]);
      const j = await one(db, 'select public.hr_hunt_party_join(0, $1::uuid, $2::uuid)', [party, idem()]);
      if (!j || j.ok !== true) throw new Error('party join refused: ' + JSON.stringify(j));
    }
  }
  /* A caller's town-only seeding (a setup is saved in town: 2026-11-15-preset-names.sql), before anyone enters. */
  if (typeof o.beforeEnter === 'function') await o.beforeEnter();
  const sids = [];
  for (let i = 0; i < who.length; i++) {
    await asUser(db, UIDS[i]);
    const e = await one(db, `select public.hr_hunt_enter(0, 'mill_cellar', $1::jsonb, 0, null, $2::uuid)`, [JSON.stringify(who[i].bag || []), idem()]);
    if (!e || e.ok !== true) throw new Error('enter refused: ' + JSON.stringify(e));
    sids.push(e.session.id);
  }
  await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
  /* Backdate: every session and the instance arrive at the same whole second, `minutesAgo` ago. */
  const t = `date_trunc('second', now() - make_interval(mins => ${Number(o.minutesAgo || (o.party && o.party[0].minutesAgo) || 10)}))`;
  for (const sid of sids) {
    await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t},
                      next_swing_at = ${t} where id = $1`, [sid]);
  }
  const inst = await one(db, 'select instance_id from public.hunt_sessions where id = $1', [sids[0]]);
  await db.query(`update public.hunt_instances set settled_to = ${t}, next_swing_at = ${t} where id = $1`, [inst]);
  if (o.stamina != null) {
    await db.query(`update public.player_state set stamina_ms = $2, stamina_at = (select hunt_from from public.hunt_sessions where id = $3)
                     where user_id = $1 and slot = 0`, [UIDS[0], o.stamina, sids[0]]);
  }
  const from = Number(await one(db, `select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_instances where id = $1`, [inst]));
  return { sid: sids[0], sids, inst, from, party };
}

/* ONE settle of the instance, ending at `toMs`, through hunt-settle.js's three pieces (tamper between). */
async function settleTo(db, M, toMs, o = {}) {
  /* A backlog longer than HUNT_SETTLE_SPAN_MS lands in slices, as successive fires do. */
  for (;;) {
    const r = await settleSlice(db, M, toMs, o);
    if (o.tamper || o.raw || r.skipped || r.res?.ok !== true || !(r.commit && r.out && r.out.settledTo < toMs && r.planTo < toMs)) return r;
  }
}
async function settleSlice(db, M, toMs, o) {
  const exec = makeExec(db);
  const plan = await M.HS.readHuntSettle({ exec, user: o.user || UID, slot: 0, grounds: groundsOf(M), atMs: toMs }, 'tick');
  if (plan.answer) return { skipped: plan.answer.reason };
  const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
  if (!p.out.accrued) return { skipped: p.out.reason };
  if (o.tamper) o.tamper(p.commit, p.out);
  const res = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
  if (o.tamper || o.raw) return { res, out: p.out, commit: p.commit };
  if (!res || res.ok !== true) throw new Error(`settle to ${new Date(toMs).toISOString()} refused: ${JSON.stringify(res).slice(0, 500)}`);
  return { res, out: p.out, commit: p.commit, planTo: plan.toMs };
}
/* Settle `cuts(from)` in order; stop when the hunt is over. */
async function run(db, M, from, cuts, o) {
  for (const t of cuts(from)) {
    const r = await settleTo(db, M, t, o);
    if (r.skipped === 'no_hunt') break;
  }
}

async function snapshot(db, sid, uid = UID) {
  return one(db, `
    select jsonb_build_object(
      'gold', ps.gold, 'hp', ps.hp, 'level_xp', ps.level_xp,
      'active', ps.active_kind || ':' || coalesce(ps.active_id, ''), 'stamina', ps.stamina_ms, 'stamina_at', ps.stamina_at,
      'skills', (select jsonb_object_agg(skill_id, jsonb_build_array(xp, xp_frac)) from public.player_skills where user_id = $1 and slot = 0),
      'inv', (select jsonb_object_agg(item_id, qty) from public.player_inventory where user_id = $1 and slot = 0),
      'stats', (select jsonb_object_agg(kind || ':' || key || ':' || period_key, value) from public.player_progress
                 where user_id = $1 and slot = 0 and kind <> 'daily'),
      'session', (select jsonb_build_object('swing', swing_index, 'next', next_swing_at, 'settled_to', settled_to,
                    'unit', unit_id, 'ended_at', ended_at, 'end_reason', end_reason)
                    from public.hunt_sessions h where h.id = $2),
      'instance', (select jsonb_build_object('world_swing', i.world_swing, 'world', md5(coalesce(i.world, '')), 'settled_to', i.settled_to)
                     from public.hunt_sessions h join public.hunt_instances i on i.id = h.instance_id where h.id = $2),
      'bag', (select jsonb_object_agg(item_id, jsonb_build_array(qty_loaded, qty_left)) from public.hunt_bag where session_id = $2),
      'tally', (select to_jsonb(t) - 'updated_at' - 'ledger_hwm' - 'raw_xp' from public.hunt_session_tally t where session_id = $2),
      'ledger', (select jsonb_object_agg(intent, s) from (select l.intent, jsonb_build_array(sum(coalesce(l.gold, 0)), sum(coalesce(l.qty, 0))) s
                   from public.player_ledger l where l.session_id = $2 and l.kind = 'hunt' group by l.intent) x),
      'deaths', (select jsonb_agg(jsonb_build_array(meta->>'monster', meta->>'deaths_today', meta->>'food_in_bag') order by id)
                   from public.player_ledger where session_id = $2 and kind = 'combat' and intent = 'death'),
      'events', (select jsonb_agg(jsonb_build_array(type, at, data) order by at, type, data::text)
                   from public.hunt_session_events where session_id = $2 and type in ('death', 'slot_dry', 'ended')),
      'death_xp', (select jsonb_object_agg(k, v) from (select x.key k, sum((x.value #>> '{}')::bigint) v
                     from public.player_ledger l, jsonb_each(l.meta->'xp') x
                    where l.session_id = $2 and l.kind = 'hunt' and l.intent = 'death_xp' group by 1) d))
      from public.player_state ps where ps.user_id = $1 and ps.slot = 0`, [uid, sid]);
}

/* ONE hunter, TWO timelines: run cutsA, snapshot, roll back to the savepoint, run cutsB, snapshot. */
async function compareRuns(db, M, fixture, cutsA, cutsB) {
  return inTx(db, async () => {
    const h = await hunter(db, M, fixture);
    const go = async (cuts) => { await run(db, M, h.from, cuts); return Promise.all(h.sids.map((sid, i) => snapshot(db, sid, UIDS[i]))); };
    await db.query('savepoint s1_runs');
    const a = await go(cutsA);
    await db.query('rollback to savepoint s1_runs');
    const b = await go((f) => cutsB(f, a));
    return { a, b, h };
  });
}
const SPAN_MS = 20 * 60000;
const ticksOf = (stepMs, spanMs) => (from) => Array.from({ length: Math.ceil(spanMs / stepMs) }, (_, i) => Math.min(from + (i + 1) * stepMs, from + spanMs));
const STRONG = { minutesAgo: 25, level: 25, inv: { cooked_shrimp: 30 }, bag: [{ item: 'cooked_shrimp', qty: 25 }], gold: 100000 };
const WEAK = { minutesAgo: 25, inv: {}, bag: [], gold: 0, hp: 20, options: { on_empty: 'end' },
  level: 10 };
/* A Level-5 hero part-way into its Level and skills, on the ghoul ground: it dies, and the death has a price. */
const DOOMED = { ...WEAK, deadly: true, level: 5, levelXpOver: 800, skillsXp: { melee: 400, defense: 400 } };

const DB_ARMS = {
  'TICK-1': async (db, M) => {
    const odd = (from) => [from + 61234, from + 61235, from + 200001, from + 333333, from + SPAN_MS];
    const { a, b } = await compareRuns(db, M, STRONG, ticksOf(90000, SPAN_MS), odd);
    const problems = [];
    if (canon(a) !== canon(b)) problems.push(`N tick windows and odd cuts wrote different rows ${firstDiff(canon(a), canon(b))}`);
    if (!(a[0].tally && a[0].tally.kills > 3)) problems.push(`CONTROL: the strong hero killed ${a[0].tally && a[0].tally.kills}`);
    if (!(a[0].instance && a[0].instance.world_swing > 0)) problems.push('CONTROL: the instance world never stepped');
    return problems;
  },
  'BOTH-PATH': async (db, M) => {
    const problems = [];
    /* AWAY = the tick's 90 s windows; ATTENDED = a player's irregular instants, two of them around the death. */
    const attended = (from, a) => {
      const deaths = ((a[0] && a[0].events) || []).filter((e) => e[0] === 'death').map((e) => Date.parse(e[1]));
      const cuts = [from + 7001, from + 33333];
      for (const t of deaths) cuts.push(t - 1500, t + 1500);
      cuts.push(from + SPAN_MS);
      return [...new Set(cuts)].filter((t) => t > from && t <= from + SPAN_MS).sort((x, y) => x - y);
    };
    const { a, b } = await compareRuns(db, M, DOOMED, ticksOf(90000, SPAN_MS), attended);
    if (!((a[0].deaths || []).length === 1)) problems.push(`CONTROL: the weak hero did not die exactly once (${JSON.stringify(a[0].deaths)})`);
    if (a[0].session.end_reason !== 'died') problems.push(`the death ended the hunt ${a[0].session.end_reason}, not died`);
    /* The death row carries the engine's instant (the settle's death hint), inside the swing it happened in:
       strictly before the boundary the hunt ended at, never clamped onto a window edge. */
    const deathAt = ((a[0].events || []).find((e) => e[0] === 'death') || [])[1];
    if (!(Date.parse(deathAt) < Date.parse(a[0].session.ended_at))) problems.push(`the death row sits at ${deathAt}, not before the end ${a[0].session.ended_at}`);
    if (canon(a) !== canon(b)) problems.push(`a hunt settled at a player's instants wrote different rows from the tick's ${firstDiff(canon(a), canon(b))}`);
    return problems;
  },
  'NO-DODGE': async (db, M) => inTx(db, async () => {
    const problems = [];
    const h = await hunter(db, M, { ...DOOMED });
    await db.query('savepoint no_dodge');
    await run(db, M, h.from, () => [h.from + SPAN_MS]);
    const a = await snapshot(db, h.sid, UIDS[0]);
    await db.query('rollback to savepoint no_dodge');
    const deathAt = Date.parse(((a.events || []).find((e) => e[0] === 'death') || [])[1]);
    if (!(a.session.end_reason === 'died' && Number.isFinite(deathAt))) return ['CONTROL: the doomed hero did not die (' + a.session.end_reason + ')'];
    /* The browser saw the death in its seeds; the player leaves three seconds before it. */
    await run(db, M, h.from, () => [deathAt - 3000]);
    await asUser(db, UIDS[0]);
    const lv = await one(db, 'select public.hr_hunt_leave(0, $1::uuid)', [idem()]);
    await db.query("select set_config('request.jwt.claim.sub', '', true)");
    if (!lv || lv.ok !== true) return ['the leave was refused: ' + JSON.stringify(lv)];
    await run(db, M, h.from, () => [h.from + SPAN_MS]);
    const b = await snapshot(db, h.sid, UIDS[0]);
    if (b.session.end_reason !== 'died') problems.push(`a leave before a foreseen death ended the hunt ${b.session.end_reason}, not died`);
    if (b.session.ended_at !== a.session.ended_at) problems.push(`the hunt ended at ${b.session.ended_at} with the leave, ${a.session.ended_at} without`);
    if (JSON.stringify(b.events) !== JSON.stringify(a.events)) problems.push('the death / end rows differ with the leave: ' + firstDiff(JSON.stringify(a.events), JSON.stringify(b.events)));
    return problems;
  }),
  PARITY: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid } = await hunter(db, M, { ...STRONG, minutesAgo: 10, options: { stance: 'defensive', distance: 3 } });
    const exec = makeExec(db);
    await db.query('savepoint parity');
    const runs = {};
    for (const [door, go] of [
      ['tick', () => M.HS.settleHunt({ exec, user: UID, slot: 0, mode: 'tick', session: sid, grounds: groundsOf(M) })],
      ['settle', () => M.HS.settleHunt({ exec, user: UID, slot: 0, mode: 'settle', minWindowMs: 0, grounds: groundsOf(M) })],
      ['pieces', async () => { const now = Number(await one(db, 'select floor(extract(epoch from now()) * 1000)::bigint')); return settleSlice(db, M, now, {}); }],
    ]) {
      const r = await go();
      if (door !== 'pieces' && (!r || r.outcome !== 'paid')) problems.push(`CONTROL: the ${door} door did not pay (${r && r.outcome}/${r && r.reason})`);
      runs[door] = canon(await snapshot(db, sid));
      await db.query('rollback to savepoint parity');
    }
    if (runs.tick !== runs.settle) problems.push(`the tick and the player's settle wrote different rows ${firstDiff(runs.tick, runs.settle)}`);
    if (runs.tick !== runs.pieces) problems.push(`the tick and the composed pieces wrote different rows ${firstDiff(runs.tick, runs.pieces)}`);
    return problems;
  }),
  OWN: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid, from } = await hunter(db, M, { ...WEAK, options: { supply_source: 'mine', on_empty: 'switch' }, gold: 100000,
      inv: { cooked_shrimp: 40 }, bag: [{ item: 'cooked_shrimp', qty: 40 }] });
    await run(db, M, from, ticksOf(90000, SPAN_MS));
    const s = await snapshot(db, sid);
    const used = s.bag.cooked_shrimp[0] - s.bag.cooked_shrimp[1];
    const own = s.ledger && s.ledger.supply_own;
    if (!(used > 0)) problems.push('CONTROL: the hero ate nothing');
    if (!own || Number(own[0]) !== 0 || Number(own[1]) !== -used) problems.push(`supply_own rows ${JSON.stringify(own)} do not journal ${used} units at no gold`);
    if (s.tally.supplies.cooked_shrimp !== used) problems.push(`the tally's own supplies ${JSON.stringify(s.tally.supplies)} are not the ${used} units used`);
    const heals = await one(db, `select coalesce(sum((x.value->>'qty')::int), 0)::int from public.player_ledger l, jsonb_each(l.meta->'items') x
       where l.session_id = $1 and l.intent = 'supply_buy' and x.key = any($2::text[])`, [sid, M.SB.BASIC_SUPPLIES.filter((b) => b.kind === 'heal').map((b) => b.id)]);
    if (heals && s.bag.cooked_shrimp[1] > 0) problems.push(`the store sold ${heals} food while own food was left`);
    return problems;
  }),
  /* OWN DRINKS (lane c-own-drinks-settle): a crafted drink is packed (src/shell/hunt-list.js packFor) and
     spent from the bag exactly like own food. The session half once admitted only heal / ammo uses, so
     every window that drank one was refused kind_not_used and the sixth in a row forfeited the hunt
     (2026-12-16-own-drinks-settle.sql admits `mana`). BOTH PATHS: the browser closed (the world
     tick's door, 90 s windows) and the hunt viewed (the player's settle door, project + live). */
  'OWN-DRINK': async (db, M) => inTx(db, async () => {
    const problems = [];
    const bar = [
      { action: { type: 'consume', id: 'cooked_shrimp' }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 60 }], join: 'and' },
      { action: { type: 'consume', id: 'turnip_juice' }, conditions: [{ metric: 'self_mana_pct', op: 'lte', value: 100 }], join: 'and' }];
    const h = await hunter(db, M, { ...STRONG, minutesAgo: 6, options: { slots: bar },
      inv: { cooked_shrimp: 30, turnip_juice: 400 }, bag: [{ item: 'cooked_shrimp', qty: 25 }, { item: 'turnip_juice', qty: 400 }] });
    const exec = makeExec(db);
    const to = h.from + 5 * 60000;
    const doors = {
      closed: { mode: 'tick', session: h.sid, cuts: ticksOf(90000, to - h.from)(h.from) },
      viewed: { mode: 'settle', bucket: null, project: true, live: true, cuts: [h.from + 12345, h.from + 95000, h.from + 181111, to] },
    };
    await db.query('savepoint own_drink');
    for (const [path, d] of Object.entries(doors)) {
      const { cuts, ...door } = d;
      for (const t of cuts) {
        const r = await M.HS.settleHunt({ exec, user: UID, slot: 0, grounds: groundsOf(M), atMs: t, ...door });
        if (!r || r.outcome !== 'paid') { problems.push(`${path}: the window to +${t - h.from} ms answered ${r && r.outcome}/${r && r.reason} ${JSON.stringify(r && r.body).slice(0, 200)}`); break; }
      }
      const s = await snapshot(db, h.sid);
      const drunk = s.bag.turnip_juice[0] - s.bag.turnip_juice[1];
      const eaten = s.bag.cooked_shrimp[0] - s.bag.cooked_shrimp[1];
      const own = s.ledger && s.ledger.supply_own;
      if (!(drunk > 0)) problems.push(`${path}: CONTROL: the hero drank nothing from its bag`);
      if (Date.parse(s.session.settled_to) !== to) problems.push(`${path}: the hunt settled to ${s.session.settled_to}, not +${to - h.from} ms`);
      if (s.tally.supplies.turnip_juice !== drunk) problems.push(`${path}: the tally's own drinks ${JSON.stringify(s.tally.supplies)} are not the ${drunk} drunk`);
      if (!own || Number(own[0]) !== 0 || Number(own[1]) !== -(drunk + eaten)) problems.push(`${path}: supply_own rows ${JSON.stringify(own)} do not journal ${drunk + eaten} units at no gold`);
      const bought = await one(db, `select count(*)::int from public.player_ledger where session_id = $1 and intent = 'supply_buy'`, [h.sid]);
      if (bought) problems.push(`${path}: the store sold ${bought} time(s) while own stock was left`);
      await db.query('rollback to savepoint own_drink');
    }
    /* One drink past the bag (inside the window's lane cap) is refused and moves nothing. */
    await db.query('rollback'); await db.query('begin');
    const k = await hunter(db, M, { ...STRONG, minutesAgo: 6, options: { slots: bar },
      inv: { cooked_shrimp: 30, turnip_juice: 3 }, bag: [{ item: 'cooked_shrimp', qty: 25 }, { item: 'turnip_juice', qty: 3 }] });
    const g0 = Number(await one(db, 'select gold from public.player_state where user_id = $1 and slot = 0', [UID]));
    const x = await settleTo(db, M, k.from + 60000, { tamper: (c) => { c.members[0].hunt.uses = { ...(c.members[0].hunt.uses || {}), turnip_juice: 4 }; } });
    if (!x.res || x.res.error !== 'bag_short') problems.push(`a drink past the bag answered ${JSON.stringify(x.res).slice(0, 200)}, want bag_short`);
    if (Number(await one(db, 'select gold from public.player_state where user_id = $1 and slot = 0', [UID])) !== g0
        || Number(await one(db, `select qty_left from public.hunt_bag where session_id = $1 and item_id = 'turnip_juice'`, [k.sid])) !== 3) {
      problems.push('a drink past the bag moved the purse or the bag');
    }
    return problems;
  }),
  STORE: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid, from } = await hunter(db, M, { ...WEAK, options: { supply_source: 'mine', on_empty: 'switch', gold_floor: 0 }, gold: 5000 });
    await run(db, M, from, ticksOf(90000, SPAN_MS));
    const s = await snapshot(db, sid);
    const rows = await q(db, `select meta from public.player_ledger where session_id = $1 and kind = 'hunt' and intent = 'supply_buy' order by id`, [sid]);
    if (!rows.length) return ['CONTROL: an empty bag under switch bought nothing'];
    let cost = 0;
    for (const r of rows) {
      for (const [id, x] of Object.entries(r.meta.items)) {
        const b = M.SB.BASIC_INDEX[id];
        if (!b || x.price !== b.price) problems.push(`${id} was sold at ${x.price}, the catalogue says ${b && b.price}`);
        cost += x.qty * x.price;
      }
    }
    if (s.tally.supply_gold !== cost || Number(s.ledger.supply_buy[0]) !== -cost) problems.push(`the store's gold ${s.tally.supply_gold} / ${s.ledger.supply_buy[0]} is not the ${cost} its rows priced`);
    if (s.gold !== 5000 + s.tally.coins - cost + (s.tally.cover_gold || 0)) problems.push(`gold ${s.gold} != 5000 + coins ${s.tally.coins} - store ${cost}`);
    /* Under the hero's `end`, the store sells nothing. */
    await db.query('rollback'); await db.query('begin');
    const e = await hunter(db, M, { ...WEAK, options: { on_empty: 'end' }, gold: 5000 });
    await run(db, M, e.from, ticksOf(90000, SPAN_MS));
    const n = await one(db, `select count(*)::int from public.player_ledger where session_id = $1 and intent = 'supply_buy'`, [e.sid]);
    if (n) problems.push(`the store sold ${n} time(s) under the hero's end`);
    return problems;
  }),
  END: async (db, M) => inTx(db, async () => {
    const problems = [];
    /* The bar eats the carried Cooked Shrimp under 99% HP (the eat-at is a slot condition, Tyler 2026-10-19). */
    const eat99 = [{ action: { type: 'consume', id: 'cooked_shrimp' }, conditions: [{ metric: 'self_hp_pct', op: 'lt', value: 99 }], join: 'and' }];
    const { sid, from } = await hunter(db, M, { ...WEAK, options: { on_empty: 'end', slots: eat99 }, inv: { cooked_shrimp: 3 },
      bag: [{ item: 'cooked_shrimp', qty: 3, essential: true }], lastActivity: { kind: 'gather', id: 'shrimp_s' } });
    await run(db, M, from, ticksOf(90000, SPAN_MS));
    const s = await snapshot(db, sid);
    if (!s.session.ended_at) return [`CONTROL: the hunt did not end (${JSON.stringify(s.session)})`];
    if (s.session.end_reason !== 'heals_out') problems.push(`a dry essential heal line ended ${s.session.end_reason}, not heals_out`);
    if (s.bag.cooked_shrimp[1] !== 0) problems.push('heals_out ended a hunt with food left');
    /* With nothing essential to run out of, the first death ends it: `died`, home at full HP, resuming. */
    await db.query('rollback'); await db.query('begin');
    const f = await hunter(db, M, { ...DOOMED, lastActivity: { kind: 'gather', id: 'shrimp_s' } });
    await run(db, M, f.from, ticksOf(90000, SPAN_MS));
    const sf = await snapshot(db, f.sid);
    const maxHp = Number(await one(db, `select (public.hr_vitals_of($1::uuid, 0)->>'max_hp')::int`, [UID]));
    if (sf.session.end_reason !== 'died' || (sf.deaths || []).length !== 1) problems.push(`a hero with no essential line ended ${sf.session.end_reason} after ${(sf.deaths || []).length} death(s)`);
    if (sf.hp !== maxHp) problems.push(`a dead hero is home at ${sf.hp} of ${maxHp} HP, not full`);
    if (sf.active !== 'gather:shrimp_s') problems.push(`a death resumed ${sf.active}, not the last activity`);
    /* A died end with no death journalled is refused. */
    await db.query('rollback'); await db.query('begin');
    const g = await hunter(db, M, STRONG);
    const t = await settleTo(db, M, g.from + 120000, { tamper: (c) => { c.members[0].hunt.ended = { reason: 'died', at: c.members[0].hunt.to }; } });
    if (!t.res || t.res.error !== 'end_not_proven') problems.push(`a died end with no death answered ${JSON.stringify(t.res).slice(0, 200)}`);
    /* A death journalled with the hunt left running is refused: the death owes its end. */
    await db.query('rollback'); await db.query('begin');
    const k = await hunter(db, M, DOOMED);
    let owed = null;
    for (const at of ticksOf(90000, SPAN_MS)(k.from)) {
      let hit = false;
      const x = await settleTo(db, M, at, { tamper: (c) => {
        const mh = c.members[0];
        if ((mh.delta.deaths || []).length) { hit = true; mh.hunt.ended = null; }
      } });
      if (hit) { owed = x.res; break; }
      if (!x.res || x.res.ok !== true) break;
    }
    if (!owed) problems.push('CONTROL: no window carried the death');
    else if (owed.error !== 'end_missing') problems.push(`a death with the hunt left running answered ${JSON.stringify(owed).slice(0, 200)}`);
    return problems;
  }),
  STAMINA: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid, from } = await hunter(db, M, { ...STRONG, stamina: 30 * 2000 });
    await run(db, M, from, ticksOf(90000, SPAN_MS));
    const s = await snapshot(db, sid);
    if (s.session.end_reason !== 'stamina' || Number(s.stamina) !== 0) problems.push(`a 30-swing pool ended ${s.session.end_reason} at ${s.stamina}`);
    /* The cap at the window follows premium: the engine read hands 8 h free, 12 h premium. */
    await db.query('rollback'); await db.query('begin');
    const free = await hunter(db, M, STRONG);
    const rf = await one(db, `select (public.hr_hunt_instance_read($1::uuid, 0)->'members'->0->'session'->>'stamina_max_ms')::bigint`, [UID]);
    await db.query(`select public.hr_premium_grant($1, 0, now() + interval '1 day', 'probe')`, [UID]);
    const rp = await one(db, `select (public.hr_hunt_instance_read($1::uuid, 0)->'members'->0->'session'->>'stamina_max_ms')::bigint`, [UID]);
    if (Number(rf) !== M.HSD.STAMINA_MAX_MS.free || Number(rp) !== M.HSD.STAMINA_MAX_MS.premium) problems.push(`the read's caps are ${rf} free / ${rp} premium`);
    /* A tampered pool is refused (undrained: the window's paid time not taken off). */
    const t = await settleTo(db, M, free.from + 120000, { tamper: (c) => { c.members[0].hunt.stamina += 100000; } });
    if (!t.res || t.res.error !== 'bad_stamina') problems.push(`an undrained pool answered ${JSON.stringify(t.res).slice(0, 200)}`);
    return problems;
  }),
  RESUME: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid, from } = await hunter(db, M, { ...STRONG, stamina: 10 * 2000, lastActivity: { kind: 'gather', id: 'shrimp_s' } });
    await run(db, M, from, ticksOf(90000, 120000));
    const s = await snapshot(db, sid);
    if (s.session.end_reason !== 'stamina' || s.active !== 'gather:shrimp_s') problems.push(`an automatic end left the character ${s.active} after ${s.session.end_reason}`);
    /* ENTER STOPS BURYING, like fishing (Andy live 10-21: "burying locks an action"): ONE hunt_enter intent with a
       bury running enters the hunt (hunter throws on a refusal), the bury yields, journalled with what it was. */
    await db.query('rollback'); await db.query('begin');
    const b = await hunter(db, M, { ...STRONG, running: { kind: 'artisan', id: 'bury_bones' } });
    const yielded = await one(db, `select l.meta from public.player_ledger l where l.user_id = $1 and l.intent = 'activity_yield' order by l.id desc limit 1`, [UID]);
    const st = await one(db, 'select active_kind from public.player_state where user_id = $1 and slot = 0', [UID]);
    if (!b.sid || st === 'artisan') problems.push(`Enter left the hero burying (${st})`);
    if (!yielded || yielded.kind !== 'artisan' || yielded.id !== 'bury_bones') problems.push(`the bury's stop was not journalled: ${JSON.stringify(yielded)}`);
    return problems;
  }),
  DEATHXP: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid, from } = await hunter(db, M, DOOMED);
    const x0 = await one(db, `select jsonb_object_agg(skill_id, xp) from public.player_skills where user_id = $1 and slot = 0`, [UID]);
    const l0 = Number(await one(db, 'select level_xp from public.player_state where user_id = $1 and slot = 0', [UID]));
    await run(db, M, from, ticksOf(90000, SPAN_MS));
    const s = await snapshot(db, sid);
    const deaths = (s.events || []).filter((e) => e[0] === 'death');
    if (deaths.length !== 1) return [`CONTROL: the weak hero died ${deaths.length} time(s)`];
    if (!deaths[0][2] || deaths[0][2].xp_lost === undefined) problems.push(`the death event states no price: ${JSON.stringify(deaths[0])}`);
    const price = s.death_xp || {};
    if (!(Number(price.level) > 0)) problems.push(`the death cost no Level XP: ${JSON.stringify(price)}`);
    if (Number(s.level_xp) !== l0 + Number(s.tally.xp.level || 0) - Number(price.level || 0)) {
      problems.push(`Level XP ${s.level_xp} != start ${l0} + gains ${s.tally.xp.level || 0} - price ${price.level}`);
    }
    for (const [k, v] of Object.entries(price)) {
      if (k === 'level') continue;
      const gained = s.tally.xp[k] || 0;
      const now = s.skills[k][0];
      if (now !== Math.floor(x0[k] + gained) - v && Math.abs(now - (x0[k] + gained - v)) > 1) problems.push(`${k}: bank ${now} != start ${x0[k]} + gains ${gained} - price ${v}`);
    }
    /* AN OVER-CHARGE: the death's window re-proposed with one Level XP more than its permille share. */
    await db.query('rollback'); await db.query('begin');
    const o = await hunter(db, M, DOOMED);
    let refused = null;
    for (const t of ticksOf(90000, SPAN_MS)(o.from)) {
      let hit = false;
      const x = await settleTo(db, M, t, { tamper: (c) => {
        const dx = c.members[0].hunt.death_xp;
        if (dx.length) { hit = true; dx[0] = { ...dx[0], level: (dx[0].level || 0) + 1 }; }
      } });
      if (hit) { refused = x.res; break; }
      if (!x.res || x.res.ok !== true) break;
    }
    if (!refused) problems.push('CONTROL: no window with a death to over-charge');
    else if (refused.error !== 'death_xp_over') problems.push(`a death charged over its share answered ${JSON.stringify(refused).slice(0, 200)}`);
    return problems;
  }),
  TALLY: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid, from } = await hunter(db, M, { ...STRONG });
    await run(db, M, from, ticksOf(90000, SPAN_MS));
    const t = await one(db, `select to_jsonb(t) from public.hunt_session_tally t where session_id = $1`, [sid]);
    const l = await one(db, `select jsonb_build_object(
        'coins', coalesce(sum(case when kind <> 'hunt' then gold else 0 end), 0),
        'kills', coalesce(sum(case when jsonb_typeof(meta->'kills') = 'number' then (meta->>'kills')::int else 0 end), 0))
      from public.player_ledger where session_id = $1`, [sid]);
    if (Number(t.coins) !== Number(l.coins) || Number(t.kills) !== Number(l.kills)) problems.push(`tally ${t.coins}/${t.kills} != ledger ${l.coins}/${l.kills}`);
    const own = await one(db, `select coalesce(sum(-qty), 0)::int from public.player_ledger where session_id = $1 and intent = 'supply_own'`, [sid]);
    const sup = Object.values(t.supplies || {}).reduce((a, n) => a + Number(n), 0);
    if (Number(own) !== sup) problems.push(`tally supplies ${sup} != supply_own rows ${own}`);
    if (!(Number(t.kills) > 0)) problems.push('CONTROL: nothing was killed');
    if (!(sup > 0)) problems.push('CONTROL: the hero ate nothing');
    return problems;
  }),
  ANALYZER: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid, from } = await hunter(db, M, STRONG);
    await run(db, M, from, ticksOf(90000, SPAN_MS));
    const t = await one(db, `select jsonb_build_object('dealt', dealt, 'taken', taken) from public.hunt_session_tally where session_id = $1`, [sid]);
    if (!(Number(t.dealt.total) > 0) || !t.dealt.byAbility || !(Number(t.dealt.byAbility.basic) > 0)) problems.push(`the session recorded no damage dealt: ${JSON.stringify(t)}`);
    await asUser(db, UID);
    const free = await one(db, 'select public.hr_hunt_analyzer(0, null)');
    await db.query(`select public.hr_premium_grant($1, 0, now() + interval '1 day', 'probe')`, [UID]);
    await asUser(db, UID);
    const prem = await one(db, 'select public.hr_hunt_analyzer(0, null)');
    /* Basic for everyone, the rest for premium (2026-10-26-hunt-analyzer-basic.sql, Tyler 10-19): a free read is the
       basic block (kills, XP, gold), never the damage tally. */
    if (!free || free.ok !== true || free.tier !== 'basic' || !free.hero || free.hero.dealt !== undefined || !(Number(free.hero.kills) > 0)) {
      problems.push(`a free character's analyzer read answered ${JSON.stringify(free).slice(0, 160)}`);
    }
    if (!prem || prem.ok !== true || Number(prem.hero.dealt.total) !== Number(t.dealt.total) || Number(prem.hero.kills) <= 0) {
      problems.push(`the premium analyzer read ${JSON.stringify(prem && prem.hero).slice(0, 200)} is not the session's tally`);
    }
    return problems;
  }),
  BETA: async (db, M) => inTx(db, async () => {
    const problems = [];
    const cap = M.HSD.STAMINA_MAX_MS;
    const HSEC = await import(pathToFileURL(join(ROOT, 'src', 'session', 'hunt-sections.js')).href);
    const [HUNTER, TOWN] = UIDS;
    const flag = (on) => db.query("update public.hr_flags set enabled = $1 where key = 'beta_premium'", [on]);
    if (!(await one(db, "select count(*)::int from public.hr_flags where key = 'beta_premium'"))) return ['no hr_flags beta_premium row'];
    /* TWO FREE heroes: one hunting (the edge's read, the analyzer), one in town whose pool emptied 13 h ago. */
    const { from } = await hunter(db, M, STRONG);
    await run(db, M, from, ticksOf(90000, 90000));
    await character(db, M, TOWN, {});
    await db.query(`update public.player_state set stamina_ms = 0, stamina_at = now() - interval '13 hours' where user_id = $1 and slot = 0`, [TOWN]);
    const prem = await q(db, 'select outfit_id from public.hr_outfits where premium order by sort');
    if (!prem.length) return ['no premium outfit to probe with'];
    const po = prem[0].outfit_id;
    /* Every surface, as the server answers it. */
    const surfaces = async () => {
      const env = await one(db, 'select public.hr_state_of($1::uuid, 0)', [HUNTER]);
      const town = await one(db, 'select public.hr_state_of($1::uuid, 0)', [TOWN]);
      await asUser(db, HUNTER);
      const rpc = await one(db, 'select public.hr_hunt_analyzer(0, null)');
      await asUser(db, TOWN);
      const claim = await one(db, 'select public.hr_login_claim(0, $1::uuid)', [idem()]);
      const outfit = await one(db, 'select public.hr_outfit_set(0, $1, $2::jsonb, $3::uuid)', [po, '{}', idem()]);
      await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
      return {
        section: env.premium && env.premium.active === true,
        perks: !!env.premium && ['analyzer', 'outfits', 'login'].every((k) => env.premium.perks && env.premium.perks[k] === true),
        client: HSEC.isPremium({ read: (k) => env[k] }) === true,
        edgeCap: Number(await one(db, `select public.hr_hunt_instance_read($1::uuid, 0)->'members'->0->'session'->>'stamina_max_ms'`, [HUNTER])),
        envCap: Number(env.stamina && env.stamina.max_ms),
        rest: Number(town.stamina && town.stamina.ms),
        analyzer: env.hunt_analyzer && env.hunt_analyzer.tier === 'premium',
        analyzerRpc: !!rpc && rpc.ok === true && rpc.tier === 'premium',
        login: town.login && town.login.premium === true,
        claim: !!claim && claim.ok === true ? 'ok' : String(claim && claim.error),
        owned: prem.every((r) => town.outfit && Array.isArray(town.outfit.owned) && town.outfit.owned.includes(r.outfit_id)),
        outfit: !!outfit && outfit.ok === true ? 'ok' : String(outfit && outfit.error),
      };
    };
    const want = (on) => ({ section: on, perks: on, client: on, edgeCap: on ? cap.premium : cap.free, envCap: on ? cap.premium : cap.free,
      rest: on ? cap.premium : cap.free, analyzer: on, analyzerRpc: on, login: on, claim: on ? 'ok' : 'premium_required', owned: on,
      outfit: on ? 'ok' : 'not_owned' });
    const diff = (tag, got, exp) => { for (const k of Object.keys(exp)) if (got[k] !== exp[k]) problems.push(`${tag}: ${k} is ${JSON.stringify(got[k])}, want ${JSON.stringify(exp[k])}`); };
    /* ON: every surface premium. The claim is answered before the day check, so OFF still reads premium_required. */
    await flag(true);
    diff('switch on, free hero', await surfaces(), want(true));
    const own = await q(db, 'select user_id from public.player_state where user_id = any ($1::uuid[]) and premium_until is not null', [[HUNTER, TOWN]]);
    const grants = Number(await one(db, `select count(*) from public.player_ledger where user_id = any ($1::uuid[]) and intent = 'premium_grant'`, [[HUNTER, TOWN]]));
    if (own.length || grants) problems.push(`the switch wrote premium: ${own.length} premium_until, ${grants} premium_grant rows`);
    /* OFF: the same heroes are free everywhere. */
    await flag(false);
    diff('switch off, free hero', await surfaces(), want(false));
    /* A real premium_until works alone, and only for its hero. */
    await db.query(`select public.hr_premium_grant($1, 0, now() + interval '1 day', 'beta probe')`, [TOWN]);
    const mine = await one(db, 'select public.hr_state_of($1::uuid, 0)', [TOWN]);
    if (!mine.premium || mine.premium.active !== true || Number(mine.stamina.max_ms) !== cap.premium) problems.push(`own premium with the switch off reads ${JSON.stringify(mine.premium)}`);
    if (await one(db, 'select public.hr_premium_active($1::uuid, 0, now())', [HUNTER])) problems.push('own premium leaked to another hero');
    /* ONE CHECK: no other body reads the column (code, comments stripped) or names the switch. A new premium
       surface that reads premium_until itself goes red here before it can disagree with the switch. */
    const bodies = await q(db, `select p.oid::regprocedure::text as sig, p.prosrc as src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                 where n.nspname = 'public' and p.prokind = 'f' and (p.prosrc ~ 'premium_until' or p.prosrc ~ 'beta_premium')`);
    const code = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/--[^\n]*/g, '');
    const READS_COLUMN = new Set(['hr_premium_until(uuid,integer)', 'hr_premium_grant(uuid,integer,timestamp with time zone,text)', 'hr_premium_view(uuid,integer)']);
    for (const b of bodies) {
      if (/(^|[^a-z0-9_])premium_until/.test(code(b.src)) && !READS_COLUMN.has(b.sig)) problems.push(`${b.sig} reads player_state.premium_until past the one check`);
      if (/beta_premium/.test(code(b.src)) && b.sig !== 'hr_premium_until(uuid,integer)') problems.push(`${b.sig} reads the beta switch past the one check`);
    }
    if (!bodies.some((b) => b.sig === 'hr_premium_until(uuid,integer)' && /beta_premium/.test(code(b.src)))) problems.push('hr_premium_until does not read the switch');
    /* A SECOND APPLY is byte-identical and never turns back on a switch an operator turned off (the EA wipe). */
    const image = () => one(db, `select jsonb_build_object('defs', (select jsonb_object_agg(p.oid::regprocedure::text, md5(pg_get_functiondef(p.oid)) || ':' || coalesce(p.proacl::text, ''))
                                    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                                   where n.nspname = 'public' and p.proname in ('hr_premium_until', 'hr_premium_active', 'hr_premium_view', 'hr_stamina_of')),
                                 'flags', (select jsonb_object_agg(key, enabled) from public.hr_flags))`);
    const before = await image();
    await db.exec(readFileSync(join(ROOT, 'supabase', 'migrations', '2026-12-17-beta-premium.sql'), 'utf8').replace(/\r\n/g, '\n'));
    const after = await image();
    if (canon(after) !== canon(before)) problems.push(`a second apply moved ${firstDiff(canon(before), canon(after))}`);
    if (!before.flags || before.flags.beta_premium !== false) problems.push('CONTROL: the switch was not off before the second apply');
    return problems;
  }),
  PARTY: async (db, M) => inTx(db, async () => {
    const problems = [];
    const h = await hunter(db, M, { party: [{ ...STRONG }, { ...STRONG }] });
    const insts = await one(db, `select count(distinct instance_id)::int from public.hunt_sessions where id = any($1::uuid[])`, [h.sids]);
    if (insts !== 1 || h.inst !== h.party) problems.push(`the party hunts ${insts} instance(s), not its own one`);
    /* A settle missing a member is refused. */
    const partial = await settleTo(db, M, h.from + 120000, { tamper: (c) => { c.members = c.members.slice(0, 1); } });
    if (!partial.res || partial.res.error !== 'member_set') problems.push(`a settle of one member of two answered ${JSON.stringify(partial.res).slice(0, 200)}`);
    /* ONE SIMULATION OWNER (Tyler 10-18 C): both members settle the SAME window at
       once — each read and proposal is the whole instance — and the second commit
       answers replayed: one ledger set, nothing paid twice. A retried window too. */
    const exec = makeExec(db);
    const at = h.from + 120000;
    const planA = await M.HS.readHuntSettle({ exec, user: UIDS[0], slot: 0, grounds: groundsOf(M), atMs: at }, 'tick');
    const planB = await M.HS.readHuntSettle({ exec, user: UIDS[1], slot: 0, grounds: groundsOf(M), atMs: at }, 'tick');
    if (planA.answer || planB.answer) return [...problems, `CONTROL: a member's read answered ${JSON.stringify(planA.answer || planB.answer).slice(0, 200)}`];
    const pA = await M.HS.proposeHuntSettle(planA, planA.toMs, 0);
    const pB = await M.HS.proposeHuntSettle(planB, planB.toMs, 0);
    if (pA.commit.members.length !== 2 || pB.commit.members.length !== 2) problems.push('a member\'s settle did not carry the whole party');
    const rows = async () => one(db, 'select count(*)::int from public.player_ledger where session_id = any($1::uuid[])', [h.sids]);
    const ca = await M.HS.commitHuntSettle(exec, { ...pA.commit, project: null });
    const after = await rows();
    const cb = await M.HS.commitHuntSettle(exec, { ...pB.commit, project: null });
    const again = await M.HS.commitHuntSettle(exec, { ...pA.commit, project: null });
    if (!ca || ca.ok !== true || ca.stage === 'replayed') problems.push(`the first member's settle answered ${JSON.stringify(ca).slice(0, 200)}`);
    if (!cb || cb.stage !== 'replayed' || !again || again.stage !== 'replayed') problems.push(`a concurrent / retried settle of the same window answered ${JSON.stringify(cb).slice(0, 120)} / ${JSON.stringify(again).slice(0, 120)}, not replayed`);
    if (await rows() !== after || !(after > 0)) problems.push(`the ledger moved ${after} -> ${await rows()} on a replayed window`);
    await run(db, M, h.from, ticksOf(90000, SPAN_MS));
    const a = await snapshot(db, h.sids[0], UIDS[0]); const b = await snapshot(db, h.sids[1], UIDS[1]);
    if (!(a.tally.kills > 0) || a.tally.kills !== b.tally.kills) problems.push(`the party journalled kills ${a.tally.kills} / ${b.tally.kills}`);
    if (!(a.tally.coins > 0 && b.tally.coins > 0) || Math.abs(a.tally.coins - b.tally.coins) > a.tally.kills) problems.push(`gold ${a.tally.coins} / ${b.tally.coins} is not split evenly`);
    if (a.instance.world !== b.instance.world || a.instance.world_swing !== b.instance.world_swing) problems.push('the two members see two worlds');
    const units = new Set([a.session.unit, b.session.unit]);
    if (units.size !== 2 || units.has(null)) problems.push(`the members' units are ${[...units]}`);
    return problems;
  }),
  /* HOLD-SEAT (Tyler 2026-10-22, the party's "One tank holds"; lane/b-tank-choice). hr_hunt_instance_read carries
     the party's hunt_parties.hold_seat at instance.hold_seat (lane/c-hunt-screens-server, 2026-12-08-party-hold.sql,
     in the replayed chain; the arm sets the column as hr_party_hold_set would, rolled back). The door and the tick
     share this read; it reaches the LEADING member's hero as the seat, and no other hero's; the proposal's world
     holds that seat's unit (holdNext, and `hold` too in a world made in this window); a seat that is no member's
     names no unit, so the tanks take turns. */
  'HOLD-SEAT': async (db, M) => inTx(db, async () => {
    const problems = [];
    const h = await hunter(db, M, { party: [{ ...STRONG }, { ...STRONG }] });
    const exec = makeExec(db);
    const hold = (seat) => db.query('update public.hunt_parties set hold_seat = $2 where id = $1', [h.party, seat]);
    const at = h.from + 120000;
    await hold(1);
    const plan = await M.HS.readHuntSettle({ exec, user: UIDS[0], slot: 0, grounds: groundsOf(M), atMs: at }, 'tick');
    if (plan.answer) return [`CONTROL: the read answered ${JSON.stringify(plan.answer).slice(0, 200)}`];
    if (plan.inst.hold_seat !== 1) return [`hr_hunt_instance_read carries instance.hold_seat ${JSON.stringify(plan.inst.hold_seat)}, not the party's 1`];
    const lead = plan.members.filter((m) => m.hero.lead === true);
    if (lead.length !== 1) return [`CONTROL: ${lead.length} leading member(s) in the party read`];
    const heroes = JSON.stringify(plan.members.map((m) => [m.seat, m.hero.lead, m.hero.hold]));
    if (lead[0].hero.hold !== 1 || plan.members.some((m) => m !== lead[0] && m.hero.hold !== null)) problems.push(`the hold seat reached the heroes as [seat, lead, hold] ${heroes}`);
    const fresh = !plan.inst.world;
    const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
    const seat1 = plan.members.find((m) => m.seat === 1);
    const row = seat1 && p.commit && p.commit.members.find((x) => String(x.user) === String(seat1.user) && Number(x.slot) === Number(seat1.slot));
    const unit = row && row.hunt ? row.hunt.unit_id : null;
    const w = p.commit && p.commit.settle.world ? M.WS.decode(JSON.parse(p.commit.settle.world)) : null;
    if (!Number.isInteger(unit) || !w) return [...problems, `CONTROL: no unit for seat 1 (${unit}) or no world proposed`];
    if (w.holdNext !== unit || (fresh && w.hold !== unit)) problems.push(`the proposed world holds ${w.hold} / next ${w.holdNext}, not seat 1's unit ${unit}${fresh ? ' (a world made in this window)' : ''}`);
    /* a hold seat that is no member's (seat 3 of a party of two): no unit, the tanks take turns */
    await hold(3);
    const none = await M.HS.readHuntSettle({ exec, user: UIDS[0], slot: 0, grounds: groundsOf(M), atMs: at }, 'tick');
    const pn = none.answer ? null : await M.HS.proposeHuntSettle(none, none.toMs, 0);
    const wn = pn && pn.commit && pn.commit.settle.world ? M.WS.decode(JSON.parse(pn.commit.settle.world)) : null;
    if (!wn || wn.holdNext !== null || wn.hold !== null) problems.push(`a hold seat with no member proposed hold ${wn && wn.hold} / next ${wn && wn.holdNext}, not take turns (null)`);
    return problems;
  }),
  /* PARTY-RESTART (live P1 2026-10-20): a party instance restarted after its last session ended keeps
     its swing counter but no world; the first settle of the new hunt must count on from that counter
     (the commit's CAS), not from 0 (session_moved on every fire, the hunt frozen). */
  'PARTY-RESTART': async (db, M) => inTx(db, async () => {
    const problems = [];
    const h = await hunter(db, M, { party: [{ ...STRONG }, { ...STRONG }] });
    await db.query('update public.hunt_instances set world = null, world_swing = 112 where id = $1', [h.inst]);
    const r = await settleTo(db, M, h.from + 120000, { raw: true });
    if (!r.res || r.res.ok !== true) problems.push(`a restarted instance's settle answered ${JSON.stringify(r.res || r.skipped).slice(0, 200)}`);
    else if (!(Number(r.res.instance.world_swing) > 112)) problems.push(`the restarted world swing ${r.res.instance.world_swing} did not count on from 112`);
    return problems;
  }),
  /* PARTY-KICK (live P1 2026-10-20): hr_hunt_close (kick / an at-once leave) clears the session's unit_id
     but not the stored world; the orphan hero kept fighting, and the analyzer tally refused every settle. */
  'PARTY-KICK': async (db, M) => inTx(db, async () => {
    const problems = [];
    const h = await hunter(db, M, { party: [{ ...STRONG }, { ...STRONG }] });
    await settleTo(db, M, h.from + 120000);
    const gone = await one(db, 'select unit_id from public.hunt_sessions where id = $1', [h.sids[1]]);
    await db.query(`select public.hr_hunt_close($1::uuid, 'left', now(), true)`, [h.sids[1]]);
    let r;
    try { r = await settleTo(db, M, h.from + 480000, { raw: true }); } catch (e) { r = { res: { error: String(e.message) } }; }
    if (!r.res || r.res.ok !== true) return [...problems, `the settle after a kick answered ${JSON.stringify(r.res || r.skipped).slice(0, 200)}`];
    const w = JSON.stringify(r.out.world && (await import(pathToFileURL(join(ROOT, 'src/core/hunt/world-state.js')).href)).decode(JSON.parse(r.out.world)).units.filter((u) => u.side === 'hero').map((u) => u.id));
    if (!Number.isInteger(gone) || w.includes(String(gone))) problems.push(`the kicked unit ${gone} is still in the world's heroes ${w}`);
    return problems;
  }),
  'PARTY-VIEW': async (db, M) => inTx(db, async () => {
    const problems = [];
    const { partyOf } = await import(pathToFileURL(join(ROOT, 'src/session/hunt-sections.js')).href);
    const { SESSION_CONFIG } = await import(pathToFileURL(join(ROOT, 'src/session/config.js')).href);
    const h = await hunter(db, M, { party: [{ ...STRONG }, { ...STRONG }] });
    await run(db, M, h.from, ticksOf(90000, 6 * 60000));
    const env = await one(db, 'select public.hr_state_of($1::uuid, 0)', [UIDS[0]]);
    const cs = { read: (k) => env[k] };
    const a = await snapshot(db, h.sids[0], UIDS[0]); const b = await snapshot(db, h.sids[1], UIDS[1]);
    const p = partyOf(cs);
    if (!p) return [`the client reads no party out of the server's section: ${JSON.stringify(env.party).slice(0, 300)}`];
    const units = [a.session.unit, b.session.unit];
    if (p.members.length !== 2 || p.members.map((m) => m.unit).join() !== units.join()) problems.push(`the panel's members are units ${p.members.map((m) => m.unit)}, the sessions' are ${units}`);
    if (p.self !== a.session.unit) problems.push(`self is ${p.self}, the viewer's unit is ${a.session.unit}`);
    if (!units.includes(p.leader)) problems.push(`the leader ${p.leader} is no member's unit`);
    for (const m of p.members) {
      const miss = ['hp', 'hpMax', 'mana', 'manaMax', 'dealt', 'healed', 'level'].filter((k) => m[k] === null || m[k] === undefined);
      if (miss.length) problems.push(`member ${m.unit} has no ${miss.join(', ')}`);
      if (!m.name || !m.role) problems.push(`member ${m.unit} has name ${m.name} / role ${m.role}`);
      if (!(m.hpMax > 0) || m.hp > m.hpMax) problems.push(`member ${m.unit} HP ${m.hp} / ${m.hpMax}`);
    }
    if (!p.members.some((m) => m.dealt > 0 && m.dps > 0)) problems.push(`no member dealt anything over six minutes: ${JSON.stringify(p.members.map((m) => [m.dealt, m.dps]))}`);
    const acc = env.account;
    if (!acc || acc.max_concurrent !== SESSION_CONFIG.maxConcurrentCharacters) problems.push(`account is ${JSON.stringify(acc)}, the config says ${SESSION_CONFIG.maxConcurrentCharacters}`);
    /* A solo hunt is a party of one. */
    const soloEnv = await one(db, 'select public.hr_hunt_party_view($1::uuid, 0)', [UIDS[2]]);
    if (soloEnv !== null) problems.push(`a character with no hunt and no party has a party section: ${JSON.stringify(soloEnv).slice(0, 200)}`);
    return problems;
  }),
  /* P0 bug report #57 (v0.2.26): a Level-2 club hero picked density 8 at Mill Cellar; the kill bound counted
     the ground's as-built spawns, refused the engine's own kills (22 in a 50 s window against 15), and every
     later, longer window more so: the instance never moved and the Leave never landed. Here is that instance:
     the real ground, nothing landed since it opened, Leave pressed. It must end through its own settle, with
     the browser closed (the tick) and with the hunt viewed (the player's settle). */
  DENSITY: async (db, M) => inTx(db, async () => {
    const problems = [];
    try {
      const h = await hunter(db, M, { realGround: true, minutesAgo: 22, level: 2, density: 8,
        inv: { cooked_shrimp: 30 }, bag: [{ item: 'cooked_shrimp', qty: 25 }], gold: 1000 });
      /* Hank's weapon: the club's cleave clears a full pack at once. */
      await db.query("delete from public.player_equipment where user_id = $1 and slot = 0 and equip_slot in ('shield', 'weapon')", [UID]);
      await db.query("insert into public.player_equipment (user_id, slot, equip_slot, item_id) values ($1, 0, 'weapon', 'practice_club')", [UID]);
      await asUser(db, UID);
      const lv = await one(db, 'select public.hr_hunt_leave(0, $1::uuid)', [idem()]);
      await db.query("select set_config('request.jwt.claim.sub', '', true)");
      if (!lv || lv.ok !== true) return ['CONTROL: the leave was refused: ' + JSON.stringify(lv)];
      /* Pressed two minutes ago (the arm's clock is one transaction's now()). */
      await db.query('update public.hunt_sessions set leave_at = to_timestamp($2::bigint / 1000.0) where id = $1', [h.sid, h.from + 20 * 60000]);
      const exec = makeExec(db);
      /* The server froze the pick on the instance when the hunt opened (2026-11-16-hunt-density-bounds.sql). */
      const frozen = await one(db, 'select density from public.hunt_instances where id = $1', [h.inst]);
      if (frozen !== 8) problems.push(`the instance froze density ${frozen} at hunt start, want 8`);
      /* A density key left on the action set (the hero has no row until a setup is saved): what an engine read before 2026-11-17. */
      const staleKey = (n) => db.query(`insert into public.player_action_sets as a (user_id, slot, preset, name, slots, options)
        values ($1, 0, 0, 'Preset 1', '[]'::jsonb, jsonb_build_object('density', $2::int))
        on conflict (user_id, slot, preset) do update set options = a.options || excluded.options`, [UID, n]);
      await db.query('savepoint density');
      for (const [variant, door] of [['frozen', 'tick'], ['frozen', 'settle'], ['opened before the freeze', 'tick'], ['opened before the freeze', 'settle']]) {
        if (variant === 'frozen') {
          /* A pick changed after Enter (or a stale key on an action-set row) moves neither the bound nor what the engine plays. */
          await db.query(`update public.hunt_density set density = 1 where user_id = $1 and slot = 0`, [UID]);
          await staleKey(1);
          const first = await settleTo(db, M, h.from + 60000);
          const w = await one(db, 'select world from public.hunt_instances where id = $1', [h.inst]);
          const played = first.res && first.res.ok === true && w ? M.WS.decode(JSON.parse(w)).density : null;
          if (played !== 8) problems.push(`${variant}/${door}: after a setup change the engine played density ${played}, not the frozen 8`);
        } else {
          /* Hank's 32c99ffe: opened before the freeze existed, so its row holds none (the bound reads the ceiling). */
          await db.query('update public.hunt_instances set density = null where id = $1', [h.inst]);
          /* ...and its engine read the pick off the action set then (the key 2026-11-17 strips): it plays 8 against the ceiling. */
          await staleKey(8);
        }
        let r = null;
        for (let i = 0; i < 4; i++) {
          r = await M.HS.settleHunt({ exec, user: UID, slot: 0, mode: door, grounds: groundsOf(M),
            ...(door === 'tick' ? { session: h.sid } : { minWindowMs: 0 }) });
          if (!r || r.outcome !== 'paid' || r.ended) break;
        }
        const s = await snapshot(db, h.sid);
        if (!r || r.outcome === 'refused') problems.push(`${variant}/${door}: the stuck density-8 hunt was refused ${r && r.reason}: ${JSON.stringify(r && r.body && r.body.detail).slice(0, 300)}`);
        else if (!s.session.ended_at || !['left', 'died'].includes(s.session.end_reason)) {
          problems.push(`${variant}/${door}: the stuck hunt did not end through its own settle (${s.session.end_reason}; ${r.outcome}/${r.reason})`);
        }
        /* CONTROL: a landed window carried more kills than the as-built bound allowed (density is under test). */
        const over = await one(db, `select count(*) from public.player_ledger l, public.hr_hunt_grounds g
          where l.session_id = $1 and l.kind <> 'hunt' and g.hunt_id = 'mill_cellar' and jsonb_typeof(l.meta->'kills') = 'number'
            and (l.meta->>'kills')::bigint > g.spawns * ((l.meta->>'ms')::bigint / g.respawn_ms + 2)`, [h.sid]);
        if (!(Number(over) > 0) && !problems.length) problems.push(`CONTROL ${variant}/${door}: no landed window exceeded the as-built kill bound`);
        await db.query('rollback to savepoint density');
      }
    } finally { fixtureRow = groundRow; }
    return problems;
  }),
  /* A REFUSED WINDOW NEVER TRAPS A HERO (2026-11-16-hunt-density-bounds.sql): the sixth refused commit in a row
     forfeits the pending window. Nothing of it is paid; every session ends at the last accepted boundary, `left`
     when its hero asked to leave, `server` otherwise, journalled once. A landed commit starts the count over. */
  FORFEIT: async (db, M) => inTx(db, async () => {
    const problems = [];
    const h = await hunter(db, M, { ...STRONG, minutesAgo: 10 });
    await settleTo(db, M, h.from + 60000);
    const gold = async () => Number(await one(db, 'select gold from public.player_state where user_id = $1 and slot = 0', [UID]));
    const g0 = await gold();
    const at0 = Number(await one(db, 'select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_instances where id = $1', [h.inst]));
    const forged = (c) => { c.members[0].delta.journal.meta.kills = 100000; };
    const refuse = async (n, toMs = h.from + 120000) => {
      let r = null;
      for (let i = 0; i < n; i++) {
        r = await settleTo(db, M, toMs, { tamper: forged });
        if (!r.res) throw new Error(`refusal ${i + 1} of ${n} was not offered: ${JSON.stringify(r).slice(0, 200)}`);
      }
      return r;
    };
    const open = async () => (await one(db, 'select count(*) from public.hunt_sessions where id = $1 and ended_at is null', [h.sid])) > 0;
    await db.query('savepoint forfeit');
    /* Consecutive: five refusals, a landed window, five more: the hunt never forfeits. */
    let r = await refuse(5);
    if (!r.res || r.res.error !== 'kills_over' || r.res.forfeit || !(await open())) problems.push(`five refusals answered ${JSON.stringify(r.res).slice(0, 200)}`);
    const honest = await settleTo(db, M, h.from + 120000, { raw: true });
    if (!honest.res || honest.res.ok !== true) problems.push(`a landed window after five refusals answered ${JSON.stringify(honest.res).slice(0, 200)}`);
    r = await refuse(5, h.from + 180000);
    if (r.res.forfeit || !(await open())) problems.push('five refusals after a landed window forfeited the hunt (the count did not start over)');
    await db.query('rollback to savepoint forfeit');
    for (const [label, leave, want] of [['hunt viewed, Leave pressed', true, 'left'], ['browser closed, no Leave', false, 'server']]) {
      if (leave) {
        await asUser(db, UID);
        const lv = await one(db, 'select public.hr_hunt_leave(0, $1::uuid)', [idem()]);
        await db.query("select set_config('request.jwt.claim.sub', '', true)");
        if (!lv || lv.ok !== true) problems.push(`${label}: the leave was refused`);
      }
      r = await refuse(6);
      const s = await snapshot(db, h.sid);
      if (!r.res || !r.res.forfeit) problems.push(`${label}: the sixth refusal answered ${JSON.stringify(r.res).slice(0, 200)}`);
      if (s.session.end_reason !== want || Date.parse(s.session.ended_at) !== at0) {
        problems.push(`${label}: the hunt ended ${s.session.end_reason} at ${s.session.ended_at}, want ${want} at ${new Date(at0).toISOString()}`);
      }
      if (await gold() !== g0) problems.push(`${label}: the forfeit moved gold ${g0} -> ${await gold()}`);
      const rows = await q(db, `select gold, meta->>'code' code from public.player_ledger where session_id = $1 and intent = 'window_forfeit' and kind = 'hunt'`, [h.sid]);
      if (rows.length !== 1 || Number(rows[0].gold) !== 0 || rows[0].code !== 'kills_over') problems.push(`${label}: the forfeit journalled ${JSON.stringify(rows)}`);
      if (Object.values(s.bag || {}).some((b) => b[1] !== 0)) problems.push(`${label}: the bag did not go home ${JSON.stringify(s.bag)}`);
      const inst = (await q(db, 'select world, refusals from public.hunt_instances where id = $1', [h.inst]))[0];
      if (inst.world !== null || inst.refusals !== 0) problems.push(`${label}: the instance kept a world or a count`);
      const next = await settleTo(db, M, h.from + 180000);
      if (next.skipped !== 'no_hunt') problems.push(`${label}: a settle after the forfeit answered ${JSON.stringify(next).slice(0, 200)}`);
      /* The forfeit is the SESSION's fact, not the ledger's: it outlives the 90-day prune of its journal row
         (2026-11-20-hunt-forfeit-durable.sql; the prune is played by deleting the row under replica mode). */
      await db.query('set local session_replication_role = replica');
      await db.query("delete from public.player_ledger where session_id = $1 and intent = 'window_forfeit'", [h.sid]);
      await db.query('set local session_replication_role = origin');
      const fv = await one(db, 'select public.hr_hunt_view($1::uuid)', [h.sid]);
      if (!fv || fv.forfeit !== true) problems.push(`${label}: once its ledger row is pruned the forfeited hunt reads forfeit ${fv && fv.forfeit}`);
      await db.query('rollback to savepoint forfeit');
    }
    return problems;
  }),
  /* A DEPLOY NEVER ENDS A HUNT (v0.2.32 live: the 12-09 catalogue applied 22 s before its edge and two watched
     party hunts were forfeited on 8-9 bad_world refusals; 2026-12-11-hunt-deploy-no-forfeit.sql + hunt-settle.js).
     A party of two on a catalogue of field list OLD; the deploy moves the catalogue to the real engine's SHAPE.
     CATALOGUE FIRST: nine settles of the engine still writing OLD are held (never counted, nothing moves), then the
     new engine lands the whole owed window from the unmoved boundary. EDGE FIRST: the new engine against the OLD
     catalogue proposes nothing (no commit, no refusal row), then lands everything once the catalogue moves. Both
     doors: the hunt viewed (the player's settle) and the browser closed (the tick). The fuse is unchanged: an
     unknown shape counts, and the replaced one counts once the grace has passed. */
  DEPLOY: async (db, M) => inTx(db, async () => {
    const problems = [];
    const h = await hunter(db, M, { party: [{ ...STRONG }, { ...STRONG }] });
    const exec = makeExec(db);
    const NEW = M.WS.SHAPE;
    const OLD = (NEW + 1) % 4294967296;
    const catalogue = async (shape) => {
      const [row] = await q(db, 'select version, fields from public.hr_hunt_world_shape where id');
      await db.query('delete from public.hr_hunt_world_shape');
      await db.query('insert into public.hr_hunt_world_shape (id, version, shape, fields) values (true, $1, $2, $3::jsonb)',
        [row.version, shape, JSON.stringify(row.fields)]);
    };
    const swapS = (text, from, to) => {
      if (typeof text !== 'string') return text;
      const w = JSON.parse(text);
      if (w.s === from) w.s = to;
      return JSON.stringify(w);
    };
    /* THE ENGINE BEFORE THE DEPLOY: the real engine writing field list OLD and reading OLD as its own. It predates
       the edge's shape check, so the read's world_shape never reaches it. */
    const oldEngine = async (text, params) => {
      if (text === M.HS.HUNT_APPLY_SQL) {
        const st = JSON.parse(params[2]);
        st.world = swapS(st.world, NEW, OLD);
        params = [params[0], params[1], JSON.stringify(st), ...params.slice(3)];
      }
      const rows = await exec(text, params);
      if (text === M.HS.HUNT_READ_SQL) {
        for (const r of rows) { const i = r.inst && r.inst.instance; if (i) { i.world = swapS(i.world, OLD, NEW); delete i.world_shape; } }
      }
      return rows;
    };
    const fire = (ex, door, atMs) => M.HS.settleHunt({ exec: ex, user: UID, slot: 0, mode: door, grounds: groundsOf(M), atMs,
      ...(door === 'tick' ? { session: h.sid } : { minWindowMs: 0, live: true, project: true }) });
    const inst = async () => {
      const [r] = await q(db, `select refusals, world, floor(extract(epoch from settled_to) * 1000)::bigint as to_ms
                                 from public.hunt_instances where id = $1`, [h.inst]);
      return { refusals: Number(r.refusals), shape: r.world ? JSON.parse(r.world).s : null, toMs: Number(r.to_ms) };
    };
    const open = async () => Number(await one(db, 'select count(*) from public.hunt_sessions where id = any($1::uuid[]) and ended_at is null', [h.sids]));
    const recorded = async () => Number(await one(db, `select coalesce(sum(n), 0) from public.hr_rejections
      where user_id = any($1::uuid[]) and code in ('bad_world', 'world_shape_moved')`, [UIDS.slice(0, 2)]));
    const paidMs = async (sid) => Number(await one(db, `select coalesce(sum((meta->>'ms')::bigint), 0) from public.player_ledger
      where session_id = $1 and kind = 'combat' and intent = 'accrue'`, [sid]));
    /* THE OLD ERA: the catalogue has been OLD for hours; the old engine's windows land. */
    await catalogue(OLD);
    await db.query(`update public.hunt_world_shape_move set moved_at = now() - interval '2 hours' where id`);
    for (const at of [h.from + 60000, h.from + 120000]) {
      const r = await fire(oldEngine, 'tick', at);
      if (r.outcome !== 'paid') return [`CONTROL: the old engine on its own catalogue answered ${r.outcome}/${r.reason}`];
    }
    const era = await inst();
    const at0 = era.toMs;
    if (at0 !== h.from + 120000 || era.shape !== OLD) return [`CONTROL: the OLD era settled to ${at0} with a world of shape ${era.shape}`];
    await db.query('savepoint deploy');
    for (const [order, door] of [['catalogue first', 'settle'], ['catalogue first', 'tick'], ['edge first', 'settle'], ['edge first', 'tick']]) {
      const label = `${order} / ${door === 'tick' ? 'browser closed (tick)' : 'hunt viewed'}`;
      const want = order === 'catalogue first' ? ['refused', 'world_shape_moved', 9] : ['nothing', 'world_shape_pending', 0];
      if (order === 'catalogue first') await catalogue(NEW);
      const rec0 = await recorded();
      for (let i = 1; i <= 9; i++) {
        const r = await fire(order === 'catalogue first' ? oldEngine : exec, door, at0 + i * 10000);
        if (r.outcome !== want[0] || r.reason !== want[1]) {
          problems.push(`${label}: settle ${i} in the gap answered ${r.outcome}/${r.reason}, want ${want[0]}/${want[1]}`);
          break;
        }
      }
      const g = await inst();
      if ((await open()) !== 2 || g.refusals !== 0 || g.toMs !== at0) {
        problems.push(`${label}: the gap left ${await open()} open hunt(s), count ${g.refusals}, settled to ${g.toMs} (want 2, 0, ${at0})`);
      }
      if ((await recorded()) - rec0 !== want[2]) problems.push(`${label}: the gap recorded ${(await recorded()) - rec0} world refusal(s), want ${want[2]}`);
      if (order === 'edge first') {
        /* A settle-before-mutate verb (set-activity.js collectCurrentWindow) waits for the window the gap owes
           instead of mutating ahead of it. */
        const env = await one(db, 'select public.hr_state_of($1::uuid, 0)', [UID]);
        const c = await M.SA.collectCurrentWindow({ exec, user: UID, slot: 0, env, st: { active_kind: 'combat' }, nowMs: at0 + 120000, capMs: 0 });
        if (c.outcome !== 'refused' || c.error !== 'world_shape_pending') problems.push(`${label}: a verb's settle-first in the gap answered ${c.outcome}/${c.error || c.reason}`);
        await catalogue(NEW);
      }
      /* Both landed: the new engine settles the whole owed window from the unmoved boundary (the OLD world restarts). */
      const done = await fire(exec, door, at0 + 120000);
      const a = await inst();
      if (done.outcome !== 'paid' || a.toMs !== at0 + 120000 || a.shape !== NEW || (await open()) !== 2) {
        problems.push(`${label}: after the deploy the settle answered ${done.outcome}/${done.reason}, settled to ${a.toMs} `
          + `(want ${at0 + 120000}), world shape ${a.shape}, ${await open()} open`);
      }
      for (const [k, sid] of h.sids.entries()) {
        const ms = await paidMs(sid);
        if (ms !== a.toMs - h.from) problems.push(`${label}: member ${k} was paid ${ms} ms of a ${a.toMs - h.from} ms hunt (a window lost)`);
      }
      const lost = await one(db, `select count(*)::int from public.player_ledger where session_id = any($1::uuid[]) and intent = 'window_forfeit'`, [h.sids]);
      if (lost) problems.push(`${label}: ${lost} window(s) forfeited`);
      await db.query('rollback to savepoint deploy');
    }
    /* THE FUSE IS UNCHANGED: an unknown field list counts; the replaced one counts once the grace has passed. */
    await catalogue(NEW);
    const unknown = await settleTo(db, M, at0 + 10000, { tamper: (c) => { c.settle.world = swapS(c.settle.world, NEW, (NEW + 7) % 4294967296); } });
    if (!unknown.res || unknown.res.error !== 'bad_world' || unknown.res.refusals !== 1) {
      problems.push(`an unknown world shape answered ${JSON.stringify(unknown.res).slice(0, 200)}, want bad_world counted`);
    }
    await db.query(`update public.hunt_world_shape_move set moved_at = now() - interval '31 minutes' where id`);
    const late = await fire(oldEngine, 'tick', at0 + 10000);
    const n = (await inst()).refusals;
    if (late.outcome !== 'refused' || late.reason !== 'bad_world' || n !== 2) {
      problems.push(`the replaced shape past the grace answered ${late.outcome}/${late.reason} (count ${n}), want bad_world counted`);
    }
    await db.query('rollback to savepoint deploy');
    return problems;
  }),
  VALUE: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { from } = await hunter(db, M, { ...STRONG, options: { on_empty: 'end', supply_source: 'mine' },
      inv: { cooked_shrimp: 300 }, bag: [{ item: 'cooked_shrimp', qty: 300, essential: true }] });
    await settleTo(db, M, from + 60000);
    const g0 = Number(await one(db, 'select gold from public.player_state where user_id = $1 and slot = 0', [UID]));
    const back = (c) => { const w = JSON.parse(c.settle.world); c.settle.world_swing = c.worldSwingFrom - 1; w.w[1] = c.settle.world_swing; c.settle.world = JSON.stringify(w); };
    const endAt = (why) => (c) => { m0(c).hunt.ended = { reason: why, at: m0(c).hunt.to }; };
    const m0 = (c) => c.members[0];
    const cases = [
      ['a window paying a fortune in gold', (c) => { m0(c).delta.gold = 1000000; }, 'value_over'],
      ['a window teaching a fortune in XP', (c) => { m0(c).delta.xp = { ...(m0(c).delta.xp || {}), melee: 1000000 }; }, 'value_over'],
      ['a window teaching a fortune in Level XP', (c) => { m0(c).delta.level_xp = 1000000; }, 'value_over'],
      ['a died end with no death', endAt('died'), 'end_not_proven'],
      ['a window dropping an item no spawn drops', (c) => { m0(c).delta.items = { ...(m0(c).delta.items || {}), dragon_scale: 1 }; }, 'value_over'],
      ['a window claiming a thousand kills', (c) => { m0(c).delta.journal.meta.kills = 1000; }, 'kills_over'],
      ['a world over the byte bound', (c) => { c.settle.world = '{' + 'x'.repeat(20000) + '}'; }, 'world_too_big'],
      ['a world of another version', (c) => { const w = JSON.parse(c.settle.world); w.v += 1; c.settle.world = JSON.stringify(w); }, 'bad_world'],
      ['a world swing running backwards', back, 'bad_world_swing'],
      ['a heals_out end with food in the bag', endAt('heals_out'), 'end_not_proven'],
      ['a stamina end on a full pool', endAt('stamina'), 'end_not_proven'],
      ['a store buy the hero never chose', (c) => { m0(c).hunt.buys = { salted_shrimp: 1 }; }, 'store_off'],
      ['an id the store does not sell', (c) => { m0(c).hunt.buys = { dragon_scale: 1 }; }, 'not_for_sale'],
      ['two hundred meals in one minute (the bag holds them)', (c) => { m0(c).hunt.uses = { cooked_shrimp: 200 }; }, 'too_many_uses'],
    ];
    /* Each forgery is judged alone (its own savepoint): six refusals in a row forfeit the window (FORFEIT). */
    for (const [label, tamper, code] of cases) {
      await db.query('savepoint value_case');
      const x = await settleTo(db, M, from + 120000, { tamper });
      const got = x.res && x.res.error;
      if (code ? got !== code : !(x.res && x.res.ok === false)) problems.push(`${label} answered ${JSON.stringify(x.res).slice(0, 200)}, want ${code || 'a refusal'}`);
      const g = Number(await one(db, 'select gold from public.player_state where user_id = $1 and slot = 0', [UID]));
      if (g !== g0) problems.push(`${label} moved gold ${g0} -> ${g}`);
      await db.query('rollback to savepoint value_case');
    }
    const honest = await settleTo(db, M, from + 120000, { raw: true });
    if (!honest.res || honest.res.ok !== true) problems.push(`an honest settle answered ${JSON.stringify(honest.res).slice(0, 200)}`);
    return problems;
  }),
  /* P1 2026-10-20 (546 WORKER_RESOURCE_LIMIT): a refused instance re-simulated its whole growing
     backlog every fire. One settle simulates at most HUNT_SETTLE_SPAN_MS; the rest is owed. */
  SPAN: async (db, M) => inTx(db, async () => {
    const problems = [];
    const span = M.HS.HUNT_SETTLE_SPAN_MS;
    if (!(span > 0 && span <= 30 * 60000)) return [`HUNT_SETTLE_SPAN_MS is ${span}, not a bound of at most 30 min`];
    const { from } = await hunter(db, M, { ...STRONG, minutesAgo: 120 });
    const plan = await M.HS.readHuntSettle({ exec: makeExec(db), user: UID, slot: 0, grounds: groundsOf(M) }, 'tick');
    if (plan.answer) return [`a 2 h backlog was not offered: ${JSON.stringify(plan.answer.reason)}`];
    if (plan.toMs - plan.fromMs > span) problems.push(`one settle simulates ${plan.toMs - plan.fromMs} ms of a 2 h backlog, past the ${span} ms span`);
    const r = await settleTo(db, M, from + 3 * span);
    if (!r.res || r.res.ok !== true) problems.push(`the backlog did not catch up slice by slice: ${JSON.stringify(r.res).slice(0, 200)}`);
    return problems;
  }),
  REPLAY: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid, from } = await hunter(db, M, STRONG);
    const a = await settleTo(db, M, from + 180000);
    const s1 = canon(await snapshot(db, sid));
    const again = await M.HS.commitHuntSettle(makeExec(db), { ...a.commit, project: null });
    if (!again || again.ok !== true || again.stage !== 'replayed') problems.push(`the same keys re-committed answered ${JSON.stringify(again).slice(0, 200)}`);
    if (canon(await snapshot(db, sid)) !== s1) problems.push('a replay moved the hunt');
    /* A stale proposal (computed before another settle moved the instance) loses the CAS. */
    const plan = await M.HS.readHuntSettle({ exec: makeExec(db), user: UID, slot: 0, grounds: groundsOf(M), atMs: from + 360000 }, 'tick');
    if (plan.answer) return [`CONTROL: the stale read answered ${JSON.stringify(plan.answer).slice(0, 300)}`];
    const stale = await M.HS.proposeHuntSettle(plan, plan.toMs, 1);
    await settleTo(db, M, from + 270000);
    const late = await M.HS.commitHuntSettle(makeExec(db), { ...stale.commit, project: null });
    if (!late || late.error !== 'session_moved') problems.push(`a stale proposal answered ${JSON.stringify(late).slice(0, 200)}`);
    return problems;
  }),
  SETTINGS: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { from, inst } = await hunter(db, M, { ...STRONG, options: { stance: 'defensive', distance: 1, chase: false } });
    await settleTo(db, M, from + 60000);
    const w = await one(db, 'select world from public.hunt_instances where id = $1', [inst]);
    const u = M.WS.decode(JSON.parse(w)).units.find((x) => x.side === 'hero');
    if (!u || u.stance !== 'defensive' || u.dist !== 1 || u.chase !== false) problems.push(`the hero's unit carries ${JSON.stringify(u && { stance: u.stance, dist: u.dist, chase: u.chase })}, not its options`);
    /* Changed mid-hunt (settled to within the edit slack first, as the client does): the next
       settle writes it onto the unit already standing in the world. */
    const nowMs = Number(await one(db, 'select floor(extract(epoch from now()) * 1000)::bigint'));
    await settleTo(db, M, nowMs - 10000);
    await asUser(db, UID);
    const ch = await one(db, 'select public.hr_action_set_options(0, 0, $1::jsonb, $2::uuid)', [JSON.stringify({ stance: 'offensive', distance: 4 }), idem()]);
    await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
    if (!ch || ch.ok !== true) return [...problems, `CONTROL: the options change was refused: ${JSON.stringify(ch)}`];
    await settleTo(db, M, nowMs);
    const u2 = M.WS.decode(JSON.parse(await one(db, 'select world from public.hunt_instances where id = $1', [inst]))).units.find((x) => x.side === 'hero');
    if (!u2 || u2.stance !== 'offensive' || u2.dist !== 4) problems.push(`a mid-hunt change left the unit at ${JSON.stringify(u2 && { stance: u2.stance, dist: u2.dist })}`);
    return problems;
  }),
  'TICK-0': async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid, from } = await hunter(db, M, STRONG);
    await db.query('update public.hr_tick_config set enabled = true where id');
    const exec = makeExec(db);
    const fire = async (hunts) => (await M.TK.runTick({ exec, grounds: groundsOf(M),
      body: { op: 'tick', roster: [], cadence_ms: 10000, flush_ms: 90000, hunts } })).body;
    const stamped = async () => one(db, `select count(*)::int from public.player_ledger where session_id = $1 and kind = 'combat' and intent = 'accrue'`, [sid]);
    const other = await fire([{ user_id: UID, slot: 0, session_id: '00000000-0000-4000-8000-0000000c5eff' }]);
    if (!other.hunts || other.hunts.settled !== 0 || (other.hunts.reasons || {}).session_changed !== 1 || await stamped() !== 0) {
      problems.push(`a selector naming another session was not skipped by name: ${JSON.stringify(other.hunts)}`);
    }
    await db.exec(SHIM_CRYPTO + SHIM_VAULT + SHIM_NET);
    await db.query(`update public.hr_tick_config set flush_seconds = 90, cadence_seconds = 10, batch_limit = 200, lease_ms = 30000, shards = 1,
                      edge_url = 'https://nezapsylztqbbwuwembx.supabase.co/functions/v1/hr-accrue' where id`);
    await db.query('delete from net.http_request_queue');
    await db.query('select public.hr_tick_cron_run()');
    const bodies = (await q(db, `select convert_from(body, 'UTF8') as b from net.http_request_queue order by id`)).map((r) => JSON.parse(r.b)).filter((b) => Array.isArray(b.hunts));
    const huntBody = bodies[0];
    if (bodies.length !== 1 || !huntBody || huntBody.hunts.length !== 1 || huntBody.hunts[0].session_id !== sid) {
      problems.push(`the cron did not queue ONE hunts body naming this session: ${JSON.stringify(bodies).slice(0, 300)}`);
      return problems;
    }
    huntBody.hunts.push({ user_id: 'not-a-uuid', slot: 0, session_id: sid });
    const f = (await M.TK.runTick({ exec, grounds: groundsOf(M), body: huntBody })).body;
    const to = Number(await one(db, `select floor(extract(epoch from settled_to) * 1000)::bigint from public.hunt_sessions where id = $1`, [sid]));
    if (!f.hunts || f.hunts.settled !== 1) problems.push(`runTick did not settle the hunt cohort: ${JSON.stringify(f)}`);
    if (await stamped() !== 1) problems.push('one tick settle did not write exactly one stamped accrue row');
    if (!(to > from + 60000)) problems.push(`the session clock did not advance (${to - from} ms)`);
    return problems;
  }),
  SLOT: async (db, M) => inTx(db, async () => {
    const problems = [];
    await installGround(db);
    await db.query('insert into auth.users (id) values ($1)', [UID]);
    if (CLOSED) await db.query(`insert into public.hr_access_allowlist (user_id, note) values ($1, 's1') on conflict do nothing`, [UID]);
    await asUser(db, UID);
    for (const s of [0, 1]) {
      if (s > 0) await db.query(`insert into public.player_progress (user_id, slot, kind, key, value, period_key) values ($1, 0, 'flag', 'character_slot:' || $2, 1, '') on conflict do nothing`, [UID, s]);
      const c = await one(db, 'select public.hr_create_character($1)', [s]);
      if (!c || c.created !== true) { problems.push(`CONTROL: slot ${s} refused: ${JSON.stringify(c)}`); return problems; }
      await db.query("update public.player_state set active_kind = 'idle', active_id = null where user_id = $1 and slot = $2", [UID, s]);
    }
    await db.query('update public.hr_hunt_config set enabled = true where id');
    const e = await one(db, `select public.hr_hunt_enter(1, 'mill_cellar', '[]'::jsonb, 0, null, $1::uuid)`, [idem()]);
    if (!e || e.ok !== true) { problems.push(`CONTROL: the slot-1 hunt was refused: ${JSON.stringify(e)}`); return problems; }
    const sid = e.session.id;
    const t = "date_trunc('second', now() - interval '10 minutes')";
    await db.query(`update public.hunt_sessions set entered_at = ${t} - interval '1 minute', hunt_from = ${t}, settled_to = ${t}, next_swing_at = ${t} where id = $1`, [sid]);
    await db.query(`update public.hunt_instances set settled_to = ${t}, next_swing_at = ${t} where id = $1`, [sid]);
    await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
    const inner = makeExec(db); const seen = [];
    const exec = async (text, params) => { seen.push({ text: String(text), params: params || [] }); return inner(text, params); };
    const r = await M.HS.settleHunt({ exec, user: UID, slot: 1, mode: 'tick', session: sid, grounds: groundsOf(M) });
    if (!r || r.outcome !== 'paid') problems.push(`CONTROL: the slot-1 settle did not pay (${r && r.outcome}/${r && r.reason})`);
    if (!seen.some((s) => /perks/i.test(s.text))) problems.push('CONTROL: the settle issued no perks read');
    for (const s of seen) {
      const i = s.params.findIndex((v) => v === UID);
      if (i < 0) continue;
      const slotArg = s.params[i + 1];
      if (slotArg !== 1 && slotArg !== '1') problems.push(`a slot-1 settle issued ${s.text.trim().slice(0, 70)}… with slot ${JSON.stringify(slotArg)}`);
    }
    if (await one(db, `select count(*)::int from public.player_ledger where user_id = $1 and slot = 0 and session_id = $2`, [UID, sid])) problems.push('the slot-1 hunt wrote ledger rows on slot 0');
    return problems;
  }),
  XPDOOR: async (db, M) => inTx(db, async () => {
    /* The client combat-XP door was deleted outright with the core rebuild (2026-10-27-core-schema.sql):
       no client verb mints skill XP; only the hunt settle pays it. */
    const problems = [];
    if (await one(db, `select to_regprocedure('public.hr_credit_combat_xp(integer,jsonb,text)') is not null`)) problems.push('hr_credit_combat_xp still exists');
    if (await one(db, `select exists (select 1 from public.hr_client_rpc_baseline where proname = 'hr_credit_combat_xp')`)) problems.push('the client baseline still names hr_credit_combat_xp');
    return problems;
  }),
  BESTIARY: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid } = await hunter(db, M, STRONG);
    const exec = makeExec(db);
    const value = async () => canon(await one(db, `select jsonb_build_object('gold', ps.gold,
        'skills', (select jsonb_object_agg(skill_id, xp) from public.player_skills where user_id = $1 and slot = 0),
        'inv', (select jsonb_object_agg(item_id, qty) from public.player_inventory where user_id = $1 and slot = 0),
        'tally', (select jsonb_build_object('coins', t.coins, 'kills', t.kills, 'loot', t.loot) from public.hunt_session_tally t where t.session_id = $2))
      from public.player_state ps where ps.user_id = $1 and ps.slot = 0`, [UID, sid]));
    await db.query('savepoint bestiary');
    const bare = await M.HS.settleHunt({ exec, user: UID, slot: 0, mode: 'tick', session: sid, grounds: groundsOf(M) });
    const vBare = await value();
    await db.query('rollback to savepoint bestiary');
    for (const m of ['rat', 'wolf']) {
      await db.query(`insert into public.player_progress (user_id, slot, kind, key, period_key, value) values ($1, 0, 'stat', 'ev:kill_monster:' || $2, '', 20000)`, [UID, m]);
    }
    const charmed = await M.HS.settleHunt({ exec, user: UID, slot: 0, mode: 'tick', session: sid, grounds: groundsOf(M) });
    if (bare.outcome !== 'paid' || charmed.outcome !== 'paid') problems.push(`CONTROL: a settle did not pay (${bare.outcome}/${bare.reason})`);
    else if (vBare !== await value()) problems.push('20,000 counted kills priced the hunt differently from none — a ladder prices a fight again');
    return problems;
  }),
};

// ═══════════════════════════════════════════════════════════════════════
async function runArms(root, db, only) {
  const M = await loadEdge(root);
  const out = {};
  if (db) await rewindDice(db);
  for (const [name, arm] of Object.entries(ENGINE_ARMS)) {
    if (only && !only.includes(name)) continue;
    try { out[name] = await arm(M); } catch (e) { out[name] = ['threw: ' + String(e && e.stack || e).split('\n').slice(0, 4).join(' | ')]; }
  }
  if (db) {
    for (const [name, arm] of Object.entries(DB_ARMS)) {
      if (only && !only.includes(name)) continue;
      await rewindDice(db);
      try { out[name] = await arm(db, M); } catch (e) { out[name] = ['threw: ' + String(e && e.stack || e).split('\n').slice(0, 4).join(' | ')]; }
    }
  }
  return out;
}

/* JS mutants: planted in a temp copy of the edge + src/core + src/data. A name
   in [brackets] is the C2 mutant this one re-anchors (its catch is kept). */
const MUTANTS = [
  { arm: 'DEPLOY', name: '[deploy v0.2.32] the edge proposes against a catalogue of another world shape', file: join(FN, 'hunt-settle.js'),
    from: '  if (worldShapePending(inst.world_shape)) {', to: '  if (false && worldShapePending(inst.world_shape)) {' },
  { arm: 'DEPLOY', name: '[deploy] a settle-before-mutate verb mutates ahead of the window a deploy gap owes', file: join(FN, 'set-activity.js'),
    from: "    if ((v.outcome === 'nothing' && v.reason !== 'world_shape_pending') || v.outcome === 'none') {",
    to: "    if (v.outcome === 'nothing' || v.outcome === 'none') {" },
  { arm: 'SPAN', name: '[546 P1] a settle simulates the whole backlog again', file: join(FN, 'hunt-settle.js'),
    from: '  const toMs = Math.min(endMs, fromMs + HUNT_SETTLE_SPAN_MS);', to: '  const toMs = endMs;' },
  { arm: 'TICK-2', name: '[C2 away ctx] the instance span runs with ctx.away again', file: join(FN, 'accrual.js'),
    from: '    { toMs, tickMs, seed, ground: inp.ground,', to: '    { away: true, toMs, tickMs, seed, ground: inp.ground,' },
  { arm: 'TICK-2', name: '[C2 absence watermark] the window starts at a presence watermark', file: join(FN, 'accrual.js'),
    from: 'const fromMs = Math.floor(nat(w.fromMs, -1));', to: 'const fromMs = Math.floor(nat(inp.accruedToMs, nat(w.fromMs, -1)));' },
  { arm: 'TICK-2', name: '[C2 F11 / no_topup] a deleted read returns to the hunt settle', file: join(FN, 'hunt-settle.js'),
    from: "import { huntTimeline, worldHash } from '../../../src/core/hunt-track.js';", to: "import { huntTimeline, worldHash } from '../../../src/core/hunt-track.js';\nexport const ATTENDED_READ = 'select * from public.hr_attended_kills($1, $2, $3)';" },
  { arm: 'HONE', name: 'the swing never wears the whetstone (a free +strB forever)', file: 'src/core/combat-sim.js',
    from: "      if (typeof m.wear === 'function') m.wear(atMs);\n", to: '' },
  { arm: 'HONE', name: 'a spent whetstone keeps paying its bonus', file: 'src/core/member.js',
    from: '    if (honeLeft() <= 0) unhone();\n  };', to: '  };' },
  { arm: 'RUNE-SPEND', name: '[spell-core] a spent arrow line never falls to its store row (Iron Arrows, 10-23)', file: 'src/core/hunt/abilities.js',
    from: '  return resolveLine(h && h.hs, id, isRune(itemRow(h, id)) ? null : undefined);', to: '  return resolveLine(h && h.hs, id, null);' },
  { arm: 'RUNE-SPEND', name: '[spell-core] a basic supply the purse cannot buy never ends the hunt', file: 'src/core/hunt/abilities.js',
    from: "    if (!l.id || l.why) { if (l.why === 'gold_short') h.hs.goldOut = true; return false; }", to: '    if (!l.id || l.why) return false;' },
  { arm: 'RUNE-SPEND', name: '[spell-core] a caster\'s basic swings free (no mana)', file: 'src/core/hunt/damage.js',
    from: '      if (row.basic) {', to: '      if (false) {' },
  { arm: 'RUNE-SPEND', name: '[spell-core] a caster\'s basic mana trains no Magic', file: 'src/core/hunt-rewards.js',
    from: "      case 'shot': {", to: "      case 'shot_': {" },
  { arm: 'RUNE-SPEND', name: '[rune-spend] a shot is priced by the loaded ammo, not the item it spent', file: 'src/core/hunt/damage.js',
    from: "  if (h && t.side === 'mon' && price !== undefined && (price !== h.ammo || basic) && typeof h.shotRolls === 'function') {", to: '  if (false) {' },
  { arm: 'RUNE-SPEND', name: '[rune-spend] the member prices every shot with the loaded ammo', file: 'src/core/member.js',
    from: '      if (k) e.ammo = k; else delete e.ammo;', to: '' },
  { arm: 'RUNE-SPEND', name: '[rune-spend] spent runes end a default hunt ammo_out', file: 'src/core/action-rules.js',
    from: "  if (kind === 'ammo' && storeAllowed(hs)) return false;\n", to: '' },
  { arm: 'RUNE-SPEND', name: '[spell-core] a loaded rune still prices the caster\'s blow', file: 'src/core/member.js',
    from: '  if (!e.ammo || !isRune(items && items[e.ammo])) return e;', to: '  return e;' },
  { arm: 'RUNE-SPEND', name: '[rune-spend] an unaffordable slot marks the hunt gold_out while the bar is still walked', file: 'src/core/hunt/abilities.js',
    from: "    if (s.why) return { why: s.short ? 'gold_short' : s.why === 'level' ? 'level' : 'no_stock' };", to: "    if (s.why) { if (s.short) h.hs.goldOut = true; return { why: s.short ? 'gold_short' : s.why === 'level' ? 'level' : 'no_stock' }; }" },
  { arm: 'BUFF', name: 'the hunt never re-measures the buff queue (a buff never pays)', file: 'src/core/combat-sim.js',
    from: "      if (typeof m.buffsAt === 'function') m.buffsAt(atMs);\n", to: '' },
  { arm: 'BUFF', name: '[C2 buff queue at the read clock] the queue is measured once, at the window start', file: 'src/core/member.js',
    from: '      buffsAt: (atMs) => { state.buffs = buffQueueFromServer(buffRows, atMs); },',
    to: "      buffsAt: (atMs) => { if (!state._b) { state._b = 1; state.buffs = buffQueueFromServer(buffRows, atMs); } },"  },
  { arm: 'SEED', name: 'the per-swing seed is the 32-bit FNV text mix again', file: join(FN, 'hunt-seed.js'),
    from: "    const d = createHmac('sha256', key).update(seedLabel(instanceId, domain, i), 'utf8').digest();",
    to: "    const s = secret + seedLabel(instanceId, domain, i); let h = 0x811c9dc5; for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193); }\n    const d = Buffer.from([h >>> 24, (h >>> 16) & 255, (h >>> 8) & 255, h & 255]);" },
  { arm: 'SEED', name: '[probe-bar fixedSeed] every swing of an instance rolls the same seed', file: join(FN, 'hunt-seed.js'),
    from: ".update(seedLabel(instanceId, domain, i), 'utf8')", to: ".update(seedLabel(instanceId, domain, 0), 'utf8')" },
  { arm: 'SEED', name: 'an unseeded swing runs on a zero seed', file: 'src/core/combat-sim.js',
    from: "  if (typeof f !== 'function') throw new Error('simulateHuntInstance: a hunt needs ctx.seed(domain, index) — refusing an unseeded swing');",
    to: "  if (typeof f !== 'function') return 0;" },
  { arm: 'ONE-PATH', name: 'a press path returns to the settle', file: join(FN, 'hunt-settle.js'),
    from: '    cover: (h.cover && typeof h.cover === \'object\') ? h.cover : {},', to: '    cover: (h.cover && typeof h.cover === \'object\') ? h.cover : {},\n    presses: h.presses || [],' },
  { arm: 'MAXHP', name: 'a Level-up never raises max HP', file: 'src/core/member.js',
    from: '      if (charLevelFromXp(state.levelXp) > lv0) applyVitals(state, equipment, items);', to: '' },
  { arm: 'MAXHP', name: 'max HP is not raise-only (a vitals read may lower it)', file: 'src/core/member.js',
    from: '  state.playerMaxHp = Math.max(state.playerMaxHp || 0, v.maxHp);', to: '  state.playerMaxHp = v.maxHp - 1;' },
  { arm: 'ECON-1', name: 'the T1 store drink back at the heal\'s 15 g a point (72 mana for 1080 g): a fresh melee hero ends gold_out', file: 'src/data/supply-basics.js',
    from: "'turnip_juice', 72, 10)", to: "'turnip_juice', 72, 1080)" },
  { arm: 'WEAKNESS', name: 'a basic swing is priced on the neutral snapshot (the matched weapon pays nothing)', file: 'src/core/hunt/damage.js',
    from: "  const vs = h && t.side === 'mon' && typeof h.rollsVs === 'function' ? h.rollsVs(MONSTERS[t.kind]) : null;",
    to: "  const vs = null;" },
  { arm: 'WEAKNESS', name: 'the settle hands the swing no per-monster rolls', file: 'src/core/combat-sim.js',
    from: ' range: m.hero.range, rollsVs: m.rollsVs,', to: ' range: m.hero.range,' },
  { arm: 'CRIT', name: 'a hero blow never crits', file: 'src/core/hunt/damage.js',
    from: '    vs ? Number(vs.critChance) || 0 : 0);', to: '    0);' },
  { arm: 'CRIT', name: 'a crit is not journalled as the lifetime stat', file: join(FN, 'accrual.js'),
    from: "  stat('crits', stats.crits);\n", to: '' },
  { arm: 'EVENT-IDS', name: 'an event id counts across the whole window', file: 'src/core/hunt-track.js',
    from: '    const k = seen.get(at) || 0;', to: '    const k = seen.size;' },
  { arm: 'STAMINA-RULE', name: 'a swing does not drain the pool', file: 'src/core/action-rules.js',
    from: '  if (hunting) return Math.max(0, v - d);', to: '  if (hunting) return v;' },
  { arm: 'STAMINA-RULE', name: 'an empty pool ends nothing', file: 'src/core/action-rules.js',
    from: "  stamina: (hs) => hs.staminaMs !== null && hs.staminaMs !== undefined && !(Number(hs.staminaMs) > 0),", to: '  stamina: () => false,' },
  { arm: 'STAMINA-RULE', name: 'resting lowers a pool above the cap (a lapse eats banked stamina)', file: 'src/core/action-rules.js',
    from: '  return Math.max(v, Math.min(Math.floor(Number(maxMs) || 0), v + d));', to: '  return Math.min(Math.floor(Number(maxMs) || 0), v + d);' },
  { arm: 'STAMINA', name: '[C2 reads no pool] the settle reads no pool', file: join(FN, 'hunt-settle.js'),
    from: '    staminaMs: num(h.stamina_ms),', to: '    staminaMs: null,' },
  { arm: 'SUPPLY-RULE', name: '[C2 shop never buys] the store never sells', file: 'src/core/action-rules.js',
    from: "    return canAfford(hs, b.price) ? { id: want, source: 'store', price: b.price } : { why: 'gold_short', id: want };", to: "    return { why: 'none' };" },
  { arm: 'SUPPLY-RULE', name: '[C2 shop heal by partner] a store food restores its crafted partner\'s amount', file: 'src/core/action-rules.js',
    from: "    return b ? Math.max(0, int(b.kind === 'mana' ? b.mana : b.heals, 0)) : 0;", to: "    return b ? (CONSUMABLES[b.partner] ? CONSUMABLES[b.partner].amount : 0) : 0;" },
  { arm: 'SUPPLY-RULE', name: '[C2 DEEPWATERS-S2] an own food restores one less than its item', file: 'src/core/action-rules.js',
    from: "  return c && c.source === 'own' ? c.amount : 0;", to: "  return c && c.source === 'own' ? c.amount - 1 : 0;" },
  { arm: 'SUPPLY-RULE', name: 'the store is open under the hero\'s end', file: 'src/core/action-rules.js',
    from: "  return !!hs && (hs.supplySource === 'store' || hs.onEmpty === 'switch');", to: '  return !!hs;' },
  { arm: 'SUPPLY-RULE', name: 'the default goes back to end (a hunt stops for lack of stock)', file: 'src/data/hunt-sessions.js',
    from: "export const ON_EMPTY = Object.freeze({ modes: Object.freeze(['switch', 'end']), default: 'switch' });",
    to: "export const ON_EMPTY = Object.freeze({ modes: Object.freeze(['switch', 'end']), default: 'end' });" },
  { arm: 'SUPPLY-RULE', name: '[C2 dry purse] a purse short of the price buys anyway', file: 'src/core/action-rules.js',
    from: '  return Math.max(0, int(hs.purse, 0)) + coverValue(hs) - floorOf(hs) >= price;', to: '  return true;' },
  { arm: 'SUPPLY-RULE', name: '[C2 floor] the floor is ignored', file: 'src/core/action-rules.js',
    from: 'export function floorOf(hs) { return Math.max(0, int(hs && hs.goldFloor, GOLD_FLOOR.default)); }', to: 'export function floorOf() { return 0; }' },
  { arm: 'SUPPLY-RULE', name: '[C2 cover dearest first] sell-to-cover sells the dearest loot first', file: 'src/core/action-rules.js',
    from: '    .sort((a, b) => (hs.cover[a].unit - hs.cover[b].unit) || (a < b ? -1 : 1));', to: '    .sort((a, b) => (hs.cover[b].unit - hs.cover[a].unit) || (a < b ? -1 : 1));' },
  { arm: 'SUPPLY-RULE', name: '[C2 cover bones] sell-to-cover sells any common drop again', file: 'src/data/hunt-sessions.js',
    from: '  return item.junk === true;', to: '  return true;' },
  { arm: 'SUPPLY-RULE', name: '[C2 kill coins] kill coins never reach the purse', file: 'src/core/member.js',
    from: '      hs.purse = Math.max(0, Math.floor(Number(hs.purse) || 0)) + g;', to: '' },
  { arm: 'SUPPLY-RULE', name: '[C2 own first] a store-sourced hero skips its own stack', file: 'src/core/action-rules.js',
    from: "  if (c && c.source === 'own') return leftOf(hs, want) > 0", to: "  if (c && c.source === 'own' && !storeAllowed(hs)) return leftOf(hs, want) > 0" },
  { arm: 'SUPPLY-RULE', name: 'an unaffordable drink ends the hunt gold_out', file: 'src/core/hunt/consumables.js',
    from: "if (w.why === 'gold_short') { if (w.kind === 'food') starved = true; return { why: 'gold_short' }; }", to: "if (w.why === 'gold_short') { starved = true; return { why: 'gold_short' }; }" },
  { arm: 'SPLIT', name: 'the remainder of a split is lost', file: 'src/core/party-split.js',
    from: '  out[0] += t - each * k;', to: '' },
  { arm: 'SPLIT', name: 'every item goes to the first hero', file: 'src/core/party-split.js',
    from: '  return (((o + Math.floor(Number(k))) % m) + m) % m;', to: '  return 0;' },
  { arm: 'SPLIT', name: 'a rare goes round-robin like a common (no rare roll)', file: 'src/core/hunt-rewards.js',
    from: '    if (ev.rare && present.length > 1) {', to: '    if (false) {' },
  { arm: 'SPLIT', name: 'a winner may win again before everyone has', file: 'src/core/party-split.js',
    from: '  if (ids.every((id) => had.includes(id))) had = [];', to: '  had = [];' },
  { arm: 'SPLIT', name: 'a tie goes to the lowest unit (no re-roll)', file: 'src/core/party-split.js',
    from: '      if (tied.length === 1 || round + 1 >= maxRounds) { winner = tied[0]; break; }', to: '      { winner = tied[0]; break; }' },
  { arm: 'SPLIT', name: 'the rotation is not carried across a settle cut', file: 'src/core/party-split.js',
    from: "world: Object.freeze([['rareWon', 'json']])", to: 'world: Object.freeze([])' },
  { arm: 'RARE-DROP', name: 'a rare drop is never a world event (no alert, no float)', file: 'src/core/hunt-rewards.js',
    from: "      if (typeof ctx.emit === 'function') ctx.emit(makeEvent('rare_drop',", to: "      if (false) ctx.emit(makeEvent('rare_drop'," },
  { arm: 'RARE-DROP', name: 'the session never journals a rare drop (no hint)', file: join(FN, 'accrual.js'),
    from: "    else if (e.type === 'rare_drop' && e.item) hints.rare_drop.push(", to: "    else if (false) hints.rare_drop.push(" },
  { arm: 'SPLIT', name: 'only the killer counts the kill', file: 'src/core/hunt-rewards.js',
    from: '  for (const m of present) countKill(m, kind);', to: '  countKill(lead, kind);' },
  { arm: 'DEATH', name: 'a death does not end the hunt', file: 'src/core/action-rules.js',
    from: '  died: (hs) => hs.died === true,', to: '  died: () => false,' },
  { arm: 'DEATH', name: 'a dead hero walks home at 0 HP', file: 'src/core/combat-sim.js',
    from: '  if (u) m.state.playerHp = u.alive ? u.hp : m.state.playerMaxHp;', to: '  if (u) m.state.playerHp = u.alive ? u.hp : 0;' },
  { arm: 'DEATH', name: 'a death row carries a recovery clock again', file: join(FN, 'accrual.js'),
    from: '      monster: String(d.monster || \'\'),\n      deaths_today:', to: '      monster: String(d.monster || \'\'),\n      recovery_ms: 60000,\n      deaths_today:' },
  { arm: 'DEATH', name: 'a death costs nothing', file: 'src/core/combat-sim.js',
    from: '  const xpLost = deathXpLoss(m.state);', to: '  const xpLost = {};' },
  { arm: 'DEATH', name: 'a dead hero gets back up (the hunt goes on)', file: 'src/core/hunt/pull-cycle.js',
    from: "  if (u.side === 'mon') { u.deadMs = 0; return; }\n  u.spot = null;", to: "  if (u.side === 'mon') { u.deadMs = 0; return; }\n  u.alive = true; u.hp = 1; u.spot = null;" },
  { arm: 'PARTY-DEATH', name: 'a party death leaves the survivor hunting', file: 'src/core/combat-sim.js',
    from: '        for (const other of members) if (other !== m && !other.left && !other.hs.died) other.hs.partyDied = true;\n', to: '' },
  { arm: 'QUIVER', name: '[C2 ammoGuard] a shot is loosed but its arrow is never taken from the bag', file: 'src/core/hunt/abilities.js',
    from: '    if (!takeLine(h.hs, l, sc.atMs)) { h.hs.goldOut = true; return false; }\n    return l;', to: '    return l;' },
  { arm: 'QUIVER', name: 'the free rung is spent like a paid one', file: 'src/core/hunt/abilities.js',
    from: "    if (l.source === 'own' && ammoPerShot(itemRow(h, l.id)) === 0) return l;\n", to: '' },
  { arm: 'QUIVER', name: 'a ranged basic swings without a shot', file: 'src/core/hunt/damage.js',
    from: '    const paid = cost ? payBasic(inst, u, cost, sc) : true;', to: '    const paid = true;' },
  { arm: 'QUIVER', name: '[C2 skipFoodDebit] a carried use is not debited', file: 'src/core/action-rules.js',
    from: '  l.left = int(l.left, 0) - 1;', to: '  l.left = int(l.left, 0);' },
  { arm: 'WORLD-BOUND', name: 'the world bound is lifted', file: 'src/data/hunt-tuning.js',
    from: '  worldMaxBytes: 16384,', to: '  worldMaxBytes: 16384000,' },
  { arm: 'FENCE', name: 'the engine prices a hunter on the old path', file: join(FN, 'accrual.js'),
    from: '  if (inp.huntOpen === true) return { accrued: false, reason: SKIP.HUNT_OPEN };', to: '' },
  { arm: 'DEATHXP-RULE', name: 'a death takes Level XP below the Level floor (de-levelling)', file: 'src/core/action-rules.js',
    from: '  return Math.max(0, Math.min(Math.floor(of * f), x - floor));', to: '  return Math.max(0, Math.floor(of * f));' },
  { arm: 'DEATHXP-RULE', name: 'the total base is read as the Level span', file: 'src/core/action-rules.js',
    from: "  const of = base === 'level' ? charXpForLevel(lv + 1) - floor : x;", to: '  const of = charXpForLevel(lv + 1) - floor;' },
  { arm: 'DEATHXP', name: 'a death prices nothing', file: 'src/core/combat-sim.js',
    from: '  const xpLost = deathXpLoss(m.state);', to: '  const xpLost = {};' },
  { arm: 'END', name: 'a death ends nothing (the hunt runs on to another end)', file: 'src/core/action-rules.js',
    from: '  died: (hs) => hs.died === true,', to: '  died: () => false,' },
  { arm: 'END', name: '[C2 dry heal line] a dry essential heal line under end ends nothing', file: 'src/core/action-rules.js',
    from: "  heals_out: (hs) => essentialOut(hs, 'heal'),", to: '  heals_out: () => false,' },
  { arm: 'TICK-1', name: '[combat-parity relabelSeed] each window re-labels its swings from zero', file: 'src/core/combat-sim.js',
    from: "rng: createRng(seedOf(ctx, 's', sw))", to: "rng: createRng(seedOf(ctx, 's', swings))" },
  { arm: 'TICK-1', name: '[combat-parity shiftWindow] the member clock is read one second late', file: join(FN, 'hunt-settle.js'),
    from: '    nextSwingAtMs: num(h.next_swing_at_ms),', to: '    nextSwingAtMs: num(h.next_swing_at_ms) + 1000,' },
  { arm: 'TICK-1', name: '[world-tick-parity P5 rewind] the settle re-simulates the last swing', file: join(FN, 'hunt-settle.js'),
    from: '    instance: { id: String(inst.id), nextSwingAtMs: Number(inst.next_swing_at_ms), world: inst.world || null,',
    to: '    instance: { id: String(inst.id), nextSwingAtMs: Number(inst.next_swing_at_ms) - 2000, world: inst.world || null,' },
  { arm: 'TICK-1', name: '[C2 knocked-out foe carried] the world is not carried across a settle', file: join(FN, 'hunt-settle.js'),
    from: '    instance: { id: String(inst.id), nextSwingAtMs: Number(inst.next_swing_at_ms), world: inst.world || null,',
    to: '    instance: { id: String(inst.id), nextSwingAtMs: Number(inst.next_swing_at_ms), world: null,' },
  { arm: 'PARTY-RESTART', name: 'the fresh world of a restarted instance counts from swing 0', file: join(FN, 'hunt-settle.js'),
    from: '      worldSwing: Number(inst.world_swing) || 0 },', to: '      worldSwing: 0 },' },
  { arm: 'PARTY-KICK', name: 'a hero with no member stays in the world', file: 'src/core/combat-sim.js',
    from: "    for (const u of world.units.slice()) if (u.side === 'hero' && !owned.has(u.id)) leaveHero(world, u.id);", to: '' },
  { arm: 'BOTH-PATH', name: 'the death hint is dropped (the death event lands on whichever window edge settled it)', file: join(FN, 'accrual.js'),
    from: "    else if (e.type === 'death') hints.death.push(Math.floor(e.atMs));", to: "    else if (e.type === 'death') hints.death.length = 0;" },
  { arm: 'PARITY', name: '[combat-parity wallclock] the tick door ends its window on a wall-clock grid', file: join(FN, 'hunt-settle.js'),
    from: "  const endMs = Number.isFinite(Number(o.atMs)) ? Math.min(nowMs, Math.floor(Number(o.atMs))) : nowMs;",
    to: "  const endMs = Number.isFinite(Number(o.atMs)) ? Math.min(nowMs, Math.floor(Number(o.atMs))) : (mode === 'tick' ? nowMs - (nowMs % 90000) : nowMs);" },
  { arm: 'PARITY', name: '[combat-parity C2 read-dropped] the tick door builds its heroes without their options', file: join(FN, 'hunt-settle.js'),
    from: '    m.hero = heroSetup({ weaponType: m._weaponType, options: m._options, bar: m._bar, partyRoles, lead: m._leads, hold: m._hold });',
    to: "    m.hero = heroSetup({ weaponType: m._weaponType, options: mode === 'tick' ? {} : m._options, bar: m._bar, partyRoles, lead: m._leads, hold: m._hold });" },
  { arm: 'SETTINGS', name: 'the stored options never reach the unit', file: 'src/core/combat-sim.js',
    from: '    if (s.stance !== undefined) u.stance = s.stance;', to: '' },
  { arm: 'OWN', name: '[probe-bar noAutoEat] the hero never eats', file: 'src/core/hunt/consumables.js',
    from: '    if (got) use(u, hero, got.pick.kind, got.pick.line, sc, got);', to: '    if (false) use(u, hero, got.pick.kind, got.pick.line, sc, got);' },
  { arm: 'ANALYZER', name: 'the analyzer tally is never proposed', file: join(FN, 'accrual.js'),
    from: '      analyzer: analyzerOf(sim, unitIds, summary.unitIdEver) });', to: '      analyzer: null });' },
  { arm: 'SLOT', name: '[edge-tick-gate M17] the settle reads slot 0\'s perks for every slot', file: join(FN, 'hunt-settle.js'),
    from: '  const perks = await readTickPerks(exec, m.user, m.slot);', to: '  const perks = await readTickPerks(exec, m.user, 0);' },
  { arm: 'TICK-0', name: 'the world tick drops its hunt cohort', file: join(FN, 'tick.js'),
    from: '  if (body.hunts.length) {', to: '  if (false) {' },
  { arm: 'BESTIARY', name: '[bestiary-parity] the settle reads hr_bestiary_of and a ladder prices the hunt again', file: join(FN, 'hunt-settle.js'),
    from: '  const perks = await readTickPerks(exec, m.user, m.slot);',
    to: "  const perks = await readTickPerks(exec, m.user, m.slot);\n  const [bk] = await exec(\"select coalesce(sum(value), 0)::bigint as n from public.player_progress where user_id = $1 and slot = $2 and kind = 'stat' and key like 'ev:kill_monster:%'\", [m.user, m.slot]);\n  if (Number(bk && bk.n) > 0) e.skills = { ...e.skills, melee: (Number(e.skills.melee) || 0) * 4 };" },
  { arm: 'HOLD-SEAT', name: 'the settle drops the party hold seat (lane/b-tank-choice)', file: join(FN, 'hunt-settle.js'),
    from: '    _hold: Number.isInteger(inst.hold_seat) ? inst.hold_seat : null,\n', to: '    _hold: null,\n' },
  { arm: 'HOLD-SEAT', name: 'every hero carries the hold seat, not only the leader', file: 'src/core/hunt-spawn.js',
    from: 'hold: o.lead === true && Number.isInteger(o.hold) && o.hold >= 0 ? o.hold : null,', to: 'hold: Number.isInteger(o.hold) && o.hold >= 0 ? o.hold : null,' },
];

/* DB mutants: planted in a LIVE function body of the booted chain, the arm run, the body restored. */
const AM = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)';
const AI = 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)';
const SS = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)';
const SR = 'public.hr_hunt_settle_refused(uuid,bigint,jsonb,jsonb)';
const DB_MUTANTS = [
  { arm: 'NO-DODGE', name: 'a leave closes the hunt at once again (the foreseen death is dodged)', fn: 'public.hr_hunt_leave(integer,uuid)',
    find: '    update public.hunt_sessions set leave_at = public.hr_hunt_live_horizon_at(v_s.settled_to), version = version + 1 where id = v_s.id;',
    replace: "    perform public.hr_hunt_close(v_s.id, 'left', now(), true);" },
  { arm: 'VALUE', name: 'the gold bound is gone', fn: AM,
    find: "  if jsonb_typeof(p_delta->'gold') = 'number' and (p_delta->>'gold')::numeric > v_kills * v_vb_gold * v_vb_h then", replace: '  if false then' },
  { arm: 'VALUE', name: 'an undroppable item passes the drop bound', fn: AM,
    find: '             select max(coalesce((b.drops->>e.key)::numeric, 0)) from public.hr_hunt_kill_bounds b', replace: '             select 1000000 from public.hr_hunt_kill_bounds b' },
  { arm: 'VALUE', name: '[FRESH respawn x6] the kill bound is lifted', fn: AM,
    find: '  if v_kills > v_kmax then', replace: '  if v_kills > v_kmax * 1000 then' },
  { arm: 'DENSITY', name: '[#57] the kill bound counts the as-built spawns again', fn: AM,
    find: '  v_kmax := v_pass * (greatest(v_win, 0) / v_ground.respawn_ms + 2);',
    replace: '  v_kmax := v_ground.spawns::bigint * (greatest(v_win, 0) / v_ground.respawn_ms + 2);' },
  { arm: 'DENSITY', name: '[#57] the engine plays today\'s action-set density, not the frozen one', fn: 'public.hr_hunt_instance_read(uuid,integer)',
    find: "|| jsonb_build_object('density', v_i.density)) end,", replace: "|| '{}'::jsonb) end," },
  { arm: 'DENSITY', name: '[#57] the density is never frozen at hunt start', fn: 'public.hr_hunt_density_freeze()',
    find: '   where id = new.instance_id and density is null;', replace: '   where false;' },
  { arm: 'FORFEIT', name: '[#57] a refused window is never forfeited (the hero is trapped)', fn: SR,
    find: '  if v_n >= c_forfeit_after then', replace: '  if false then' },
  { arm: 'FORFEIT', name: 'a landed commit keeps the refusal count', fn: AI,
    find: 'settled_to = v_to, next_swing_at = v_to, refusals = 0, version = version + 1', replace: 'settled_to = v_to, next_swing_at = v_to, version = version + 1' },
  { arm: 'FORFEIT', name: 'a forfeited hunt reads forfeit from the pruned ledger again', fn: 'public.hr_hunt_view(uuid)',
    find: "'forfeit', s.forfeit,", replace: "'forfeit', exists (select 1 from public.player_ledger l where l.session_id = s.id and l.intent = 'window_forfeit')," },
  { arm: 'FORFEIT', name: 'a forfeit ends the hunt now instead of at the last accepted boundary', fn: 'public.hr_hunt_forfeit(uuid,text,jsonb)',
    find: "    perform public.hr_hunt_close(v_s.id, v_end, v_i.settled_to, true);", replace: "    perform public.hr_hunt_close(v_s.id, v_end, now(), true);" },
  { arm: 'DEPLOY', name: '[deploy v0.2.32] a world of the shape the catalogue just replaced counts toward the forfeit again', fn: AI,
    find: "        return public.hr_hunt_settle_held(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'world_shape_moved',",
    replace: "        return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'world_shape_moved'," },
  { arm: 'DEPLOY', name: '[deploy] the replaced shape is held forever (no grace)', fn: AI,
    find: '      if v_move.prev_shape is not null and v_move.moved_at > now() - c_shape_grace', replace: '      if v_move.prev_shape is not null' },
  { arm: 'DEPLOY', name: '[deploy] a world of any shape the settle names is held', fn: AI,
    find: "         and v_wj->'v' = to_jsonb(v_move.prev_version) and v_wj->'s' = to_jsonb(v_move.prev_shape)", replace: '         and true' },
  { arm: 'DEPLOY', name: '[deploy] the catalogue move is never recorded', fn: 'public.hr_hunt_world_shape_moved()',
    find: '    where (m.version, m.shape) is distinct from (excluded.version, excluded.shape);', replace: '    where false;' },
  { arm: 'DEPLOY', name: '[deploy] the engine read carries no catalogue shape', fn: 'public.hr_hunt_instance_read(uuid,integer)',
    find: "'world_shape', (select jsonb_build_object('v', w.version, 's', w.shape) from public.hr_hunt_world_shape w where w.id),", replace: '' },
  { arm: 'VALUE', name: 'the world byte bound is not asked', fn: AI,
    find: "    if octet_length(v_world) > public.hr_hunt_limit('world_max_bytes') then", replace: '    if false then' },
  { arm: 'VALUE', name: 'a world of any shape is stored', fn: AI,
    find: "    if jsonb_typeof(v_wj) <> 'object' or (v_wj->>'v')::int is distinct from v_shape.version", replace: "    if false and (v_wj->>'v')::int is distinct from v_shape.version" },
  { arm: 'VALUE', name: 'the world swing may run backwards', fn: AI,
    find: '  if v_wsw < v_i.world_swing or v_wsw > v_i.world_swing + v_win / v_tick then', replace: '  if false then' },
  { arm: 'VALUE', name: '[C2 silent store] a store buy lands on a hero that chose end', fn: AM,
    find: "      if not (v_supply->>'supply_source' = 'store' or v_supply->>'on_empty' = 'switch') then", replace: '      if false then' },
  { arm: 'VALUE', name: '[C2 two lanes] the food lane cap admits ten times its uses', fn: AM,
    /* (the line restated in 2026-10-25-settle-hooks.sql, own drinks on the same lane) */
    find: "(v_ukind->>'mana')::bigint, 0) > v_win / v_cons + 1", replace: "(v_ukind->>'mana')::bigint, 0) > 10 * v_win / v_cons + 1" },
  { arm: 'OWN-DRINK', name: '[own drinks] the session half admits only heal and ammo uses again', fn: SS,
    find: "v_kind is distinct from 'heal' and v_kind is distinct from 'mana' and v_kind is distinct from 'ammo' then",
    replace: "v_kind is distinct from 'heal' and v_kind is distinct from 'ammo' then" },
  { arm: 'STORE', name: '[C2 one gold] the applier prices a use at one gold', fn: AM,
    find: '      v_cost := v_cost + v_n * v_price;', replace: '      v_cost := v_cost + v_n;' },
  { arm: 'STORE', name: 'a store use is not journalled', fn: AM,
    find: "        values (p_user, p_slot, 'hunt', 'supply_buy', -v_cost, -v_units,", replace: "        values (p_user, p_slot, 'hunt', 'supply_bought', -v_cost, -v_units," },
  { arm: 'PARTY', name: 'a settle of some members lands', fn: AI,
    /* (re-anchored on 2026-11-16-hunt-density-bounds.sql: every refusal after the lock is counted) */
    find: "    return public.hr_hunt_settle_refused(p_instance, p_world_from, v_first, jsonb_build_object('ok', false, 'error', 'member_set'));", replace: "    null;" },
  { arm: 'PARTY-VIEW', name: 'the party section keeps the old seats key for HP max', fn: 'public.hr_hunt_party_view(uuid,integer)',
    find: "'hp_max', case when", replace: "'max_hp', case when" },
  { arm: 'PARTY-VIEW', name: 'the party section does not name the world unit', fn: 'public.hr_hunt_party_view(uuid,integer)',
    find: "'unit', v_r.unit_id,", replace: "'unit_id', v_r.unit_id," },
  { arm: 'PARTY-VIEW', name: 'the vitals are not read off the pose', fn: 'public.hr_hunt_party_view(uuid,integer)',
    find: "'mana', v_v->'mana',", replace: "'mana', null::jsonb," },
  { arm: 'REPLAY', name: 'the instance CAS is gone', fn: AI,
    find: '  if v_i.world_swing <> p_world_from then', replace: '  if false then' },
  { arm: 'TICK-1', name: '[C2 instance unmoved] the instance swing counter is not written', fn: AI,
    find: '       set world = case when v_n > 0 then v_world end, world_swing = v_wsw,', replace: '       set world = case when v_n > 0 then v_world end, world_swing = world_swing,' },
  { arm: 'OWN', name: 'own uses are not journalled supply_own', fn: SS,
    find: "        values (p_user, p_slot, 'hunt', 'supply_own', 0, -v_used_n,", replace: "        values (p_user, p_slot, 'hunt', 'hunt_consume', 0, -v_used_n," },
  { arm: 'TALLY', name: 'the fold counts one kill the ledger does not hold', fn: SS,
    find: 'kills = t.kills + v_kills,', replace: 'kills = t.kills + v_kills + 1,' },
  { arm: 'TALLY', name: 'the fold drops the own-supply rows', fn: SS,
    find: 'supplies = public.hr_jsonb_add(t.supplies, v_sup)', replace: 'supplies = t.supplies' },
  { arm: 'ANALYZER', name: 'the analyzer tally is not folded', fn: AM,
    find: '       set dealt = public.hr_hunt_tally_add(t.dealt, coalesce(p_analyzer->\'dealt\', \'{}\'::jsonb)),', replace: '       set dealt = t.dealt,' },
  /* 'a free character reads the analyzer' RETIRED 2026-10-19: 2026-10-26-hunt-analyzer-basic.sql gives every
     character the basic analyzer, so the live body has no premium gate to remove. */
  { arm: 'DEATHXP', name: 'the applier stops bounding the Level\'s death price', fn: AM,
    find: '        if v_n > floor(v_lxb * v_rate / 1000.0) or v_cur - v_n < v_xfloor then', replace: '        if false then' },
  { arm: 'DEATHXP', name: 'the Level\'s death price is never debited', fn: AM,
    find: '        update public.player_state set level_xp = level_xp - v_n where user_id = p_user and slot = p_slot;', replace: '        null;' },
  { arm: 'STAMINA', name: 'the applier stops proving the pool', fn: AM,
    find: '  if v_e <> greatest(0, v_s0 - v_paid) then', replace: '  if v_e < 0 then' },
  { arm: 'VALUE', name: 'the Level XP bound is gone', fn: AM,
    find: "  if jsonb_typeof(p_delta->'level_xp') = 'number' and (p_delta->>'level_xp')::numeric > v_kills * v_vb_xp * v_vb_h then", replace: '  if false then' },
  { arm: 'VALUE', name: 'a died end is proven without a death', fn: SS,
    find: "      when 'died' then v_deaths >= 1", replace: "      when 'died' then true" },
  { arm: 'END', name: 'a journalled death owes no end', fn: SS,
    find: '    if v_deaths >= 1\n       or', replace: '    if false\n       or' },
  { arm: 'VALUE', name: 'a stamina end is proven on any pool', fn: SS,
    find: "                                     where ps.user_id = p_user and ps.slot = p_slot), 1) <= 0", replace: "                                     where ps.user_id = p_user and ps.slot = p_slot), 1) >= 0" },
  { arm: 'STAMINA', name: 'the premium cap is everyone\'s', fn: 'public.hr_stamina_cap(uuid,integer,timestamp with time zone)',
    find: "               then public.hr_hunt_limit('stamina_premium_min') else public.hr_hunt_limit('stamina_free_min') end)::bigint * 60000",
    replace: "               then public.hr_hunt_limit('stamina_premium_min') else public.hr_hunt_limit('stamina_premium_min') end)::bigint * 60000" },
  /* BETA: each premium surface bypassing the one check (reading the column itself) goes red. */
  { arm: 'BETA', name: 'the one check ignores the beta switch', fn: 'public.hr_premium_until(uuid,integer)',
    find: "case when public.hr_flag_on('beta_premium') then 'infinity'::timestamptz else ps.premium_until end", replace: 'ps.premium_until' },
  { arm: 'BETA', name: 'the premium section reads the column, not the check', fn: 'public.hr_premium_view(uuid,integer)',
    find: "'active', a.prem,", replace: "'active', coalesce(ps.premium_until > now(), false)," },
  { arm: 'BETA', name: 'the stamina rest reads the column, not the check', fn: 'public.hr_stamina_of(uuid,integer,timestamp with time zone)',
    find: '  v_pu := public.hr_premium_until(p_user, p_slot);',
    replace: '  select ps.premium_until into v_pu from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot;' },
  { arm: 'BETA', name: 'premium outfits read the column, not the check', fn: 'public.hr_outfit_owned(uuid,integer)',
    find: 'public.hr_premium_active(p_user, p_slot, now())',
    replace: 'coalesce((select ps.premium_until > now() from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot), false)' },
  { arm: 'BETA', name: 'the login claim reads the column, not the check', fn: 'public.hr_login_claim(integer,uuid)',
    find: '  if not public.hr_premium_active(v_uid, p_slot, now()) then',
    replace: '  if not coalesce((select ps.premium_until > now() from public.player_state ps where ps.user_id = v_uid and ps.slot = p_slot), false) then' },
  { arm: 'BETA', name: 'the full analyzer reads the column, not the check', fn: 'public.hr_hunt_analyzer_view(uuid,integer)',
    find: '  select case when public.hr_premium_active(p_user, p_slot, now())',
    replace: '  select case when coalesce((select ps.premium_until > now() from public.player_state ps where ps.user_id = p_user and ps.slot = p_slot), false)' },
  { arm: 'RESUME', name: 'an automatic end resumes nothing', fn: AM,
    find: '    if v_ok then\n      update public.player_state', replace: '    if false then\n      update public.player_state' },
  { arm: 'VALUE', name: 'a heals_out end is proven on a full bag', fn: SS,
    find: "      when 'heals_out' then not exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id",
    replace: "      when 'heals_out' then true or not exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id" },
  { arm: 'TICK-0', name: 'the cron queues its hunts body with no selectors', fn: 'public.hr_tick_cron_run()',
    find: "'hunts', v_hb.sel)::text);", replace: "'hunts', '[]'::jsonb)::text);" },
];

/* SQL mutants: planted in a migration's TEXT; its own §4 must refuse each. The
   C2 settle file's are kept verbatim (its self-check is the proof that applied it). */
const SQL_MUTANTS = [
  { file: '2026-10-22-hunt-sessions-settle.sql', name: '[C2 §10] the value half is not stamped with the session', find: "    perform set_config('hr.hunt_session', p_session::text, true);\n    v_a := public.hr_apply(", replace: '    v_a := public.hr_apply(' },
  { file: '2026-10-22-hunt-sessions-settle.sql', name: '[C2 §10] a refused session half leaves the value half written', find: "  exception when sqlstate 'HR000' then\n    get stacked diagnostics", replace: "  exception when sqlstate 'XX999' then\n    get stacked diagnostics" },
  { file: '2026-10-22-hunt-sessions-settle.sql', name: '[C2 §10] the fence guards only combat accrue rows', find: "  for each row when (new.intent = 'accrue' and new.kind <> 'worker')", replace: "  for each row when (new.kind = 'combat' and new.intent = 'accrue')" },
  { file: '2026-10-22-hunt-sessions-settle.sql', name: '[C2 §10] the hunt clock keeps microseconds', find: 'create trigger hr_hunt_clock_ms before insert or update on public.hunt_sessions', replace: 'create trigger hr_hunt_clock_ms before delete on public.hunt_sessions' },
  { file: '2026-10-23-character-premium.sql', name: 'the premium writer is client-executable', find: "revoke execute on function public.hr_premium_grant(uuid, int, timestamptz, text) from anon, authenticated, service_role;",
    replace: "revoke execute on function public.hr_premium_grant(uuid, int, timestamptz, text) from anon, service_role;\ngrant execute on function public.hr_premium_grant(uuid, int, timestamptz, text) to authenticated;" },
  { file: '2026-10-23-character-premium.sql', name: 'a lapse eats banked stamina', find: "    v_ms := greatest(v_ms, least(v_free, v_ms + floor(extract(epoch from (p_at - v_sat)) * 1000)::bigint));",
    replace: "    v_ms := least(v_free, v_ms + floor(extract(epoch from (p_at - v_sat)) * 1000)::bigint);" },
  { file: '2026-10-23-premium-login-reward.sql', name: 'a free character claims the login reward', find: "  if not public.hr_premium_active(v_uid, p_slot, now()) then\n    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'premium_required')); end if;",
    replace: '' },
  { file: '2026-10-23-premium-login-reward.sql', name: 'a missed day resets the count', find: "  update public.player_state set login_days = login_days + 1, version = version + 1, updated_at = now()",
    replace: "  update public.player_state set login_days = case when exists (select 1 from public.player_progress pp where pp.user_id = v_uid and pp.slot = p_slot and pp.kind = 'daily' and pp.key = 'login' and pp.period_key = public.hr_utc_day_key(now() - interval '1 day')) then login_days + 1 else 1 end, version = version + 1, updated_at = now()" },
  { file: '2026-10-23-hunt-settings-options.sql', name: 'an out-of-range distance is clamped, not refused', find: "         or (v_v #>> '{}')::numeric > public.hr_hunt_limit(v_o.limit_key || '_max') then",
    replace: "         or false then" },
  { file: '2026-10-23-hunt-settings-options.sql', name: 'a C2 supply slot is saved on the bar', find: "    if jsonb_typeof(v_e) <> 'string' or not exists (select 1 from public.hr_hunt_abilities a where a.ability_id = v_e #>> '{}') then",
    replace: "    if jsonb_typeof(v_e) = 'number' then" },
  { file: '2026-12-17-beta-premium.sql', name: 'the premium section reads the column under the beta switch (install)', find: "    'active', a.prem,",
    replace: "    'active', coalesce(ps.premium_until > now(), false)," },
  { file: '2026-12-17-beta-premium.sql', name: 'the beta switch is client-writable', find: "on conflict (key) do nothing;\n",
    replace: "on conflict (key) do nothing;\ngrant update on public.hr_flags to authenticated;\n" },
  { file: '2026-10-23-hunt-analyzer-v2.sql', name: 'a free character reads the analyzer (install)', find: "  if not public.hr_premium_active(v_uid, p_slot, now()) then\n    return public.hr_note_rejection('hunt_analyzer', p_slot, jsonb_build_object('ok', false, 'error', 'premium_required')); end if;",
    replace: '' },
  { file: '2026-10-23-hunt-world-state.sql', name: 'the world column has no byte bound', find: "    || 'world_swing >= 0 and (world is null or (octet_length(world) <= %s and world ~ ''^\\{'')))',",
    replace: "    || 'world_swing >= 0 and (world is null or (octet_length(world) <= %s * 1000 and world ~ ''^\\{'')))'," },
  { file: '2026-10-23-hunt-world-state.sql', name: 'the instance settle is client-executable', find: "revoke execute on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, int) from anon, authenticated, service_role, hr_tick;",
    replace: "revoke execute on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, int) from anon, service_role, hr_tick;\ngrant execute on function public.hr_hunt_apply_instance(uuid, bigint, jsonb, jsonb, uuid, int) to authenticated;" },
  { file: '2026-10-23-hunt-party.sql', name: 'a party takes a fifth member', find: "  if (select count(*) from public.hunt_party_members m where m.party_id = p_party) >= v_p.max_size then",
    replace: "  if (select count(*) from public.hunt_party_members m where m.party_id = p_party) > v_p.max_size then" },
  { file: '2026-10-23-hunt-party.sql', name: 'a groundless hunt is entered', find: "  if not exists (select 1 from public.hr_hunt_grounds g where g.hunt_id = p_hunt) then\n    return public.hr_note_rejection(c_verb, p_slot, jsonb_build_object('ok', false, 'error', 'no_ground')); end if;\n  if p_preset is null",
    replace: '  if p_preset is null' },
];

/* PIN THE DICE: a fixed PRNG secret and a counting gen_random_uuid, so the same
   fixture rolls the same swings on every run and every mutant. */
async function pinDice(db) {
  await db.query(`update public.hr_server_secrets set secret = sha256(convert_to('hunt-sessions-settle:fixed-prng:2', 'utf8')) where name = 'prng'`);
  await db.exec(`create sequence if not exists public.hr_test_uuid_seq;
    create or replace function pg_catalog.gen_random_uuid() returns uuid language sql volatile as
      $f$ select ('00000000-0000-4000-8000-' || lpad(to_hex(nextval('public.hr_test_uuid_seq')), 12, '0'))::uuid $f$;`);
}
const rewindDice = (db) => db.query(`select setval('public.hr_test_uuid_seq', 1000, false)`);
function e2harness(msg) { return /patch anchor matched|produced identical SQL|did not land verbatim/.test(msg); }

async function main() {
  const { bootReplay, LAST_PATCHED } = await import('./schema-replay.mjs');
  let db;
  try { ({ db } = await bootReplay(CLOSED ? { keepClosed: true } : undefined)); } catch (e) {
    console.error(`✗ the chain would not replay: ${String(e.message).slice(0, 600)}`);
    process.exit(1);
  }
  await pinDice(db);
  if (MUTATE) {
    let bad = 0;
    const pick = (process.argv.find((a) => a.startsWith('--mutant=')) || '').slice(9);
    const picked = (list) => list.filter((m) => !pick || m.name.includes(pick));
    for (const m of picked(MUTANTS)) {
      const dir = mkdtempSync(join(tmpdir(), 'hr-s1-'));
      try {
        for (const d of ['src/core', 'src/data', FN]) cpSync(join(ROOT, d), join(dir, d), { recursive: true });
        cpSync(join(ROOT, 'src/build-info.js'), join(dir, 'src/build-info.js'));
        const p = join(dir, m.file);
        const src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
        if (src.split(m.from).length !== 2) { console.error(`✗ mutant "${m.name}": marker not found exactly once in ${m.file}`); bad++; continue; }
        writeFileSync(p, src.replace(m.from, () => m.to));
        const res = await runArms(dir, db, [m.arm]);
        if (res[m.arm] && res[m.arm].length) console.log(`✓ ${m.arm} goes red on: ${m.name}`);
        else { console.error(`✗ ${m.arm} stayed GREEN on: ${m.name}`); bad++; }
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    for (const m of picked(DB_MUTANTS)) {
      const def = String(await one(db, `select pg_get_functiondef($1::regprocedure)`, [m.fn])).split(String.fromCharCode(13)).join('');
      if (def.split(m.find).length !== 2) { console.error(`✗ db mutant "${m.name}": anchor not found exactly once`); bad++; continue; }
      await db.exec(def.replace(m.find, () => m.replace));
      try {
        const res = await runArms(ROOT, db, [m.arm]);
        if (res[m.arm] && res[m.arm].length) console.log(`✓ ${m.arm} goes red on: ${m.name}`);
        else { console.error(`✗ ${m.arm} stayed GREEN on: ${m.name}`); bad++; }
      } finally { await db.exec(def); }
    }
    for (const m of picked(SQL_MUTANTS)) {
      let refused = null;
      try { await bootReplay({ patches: new Map([[m.file, [[m.find, m.replace]]]]), upTo: LAST_PATCHED }); }
      catch (e) { refused = String(e.message); }
      if (refused && !e2harness(refused)) console.log(`✓ the §4 of ${m.file} refuses: ${m.name}`);
      else { console.error(`✗ ${m.file} applied: ${m.name}${refused ? ' (' + refused.slice(0, 200) + ')' : ''}`); bad++; }
    }
    const total = picked(MUTANTS).length + picked(DB_MUTANTS).length + picked(SQL_MUTANTS).length;
    console.log(bad ? `hunt-sessions-settle --mutate: ${bad} mutant(s) survived` : `hunt-sessions-settle --mutate: all ${total} mutants killed`);
    process.exit(bad ? 1 : 0);
  }
  const onlyArg = process.argv.find((a) => a.startsWith('--only='));
  const res = await runArms(ROOT, db, onlyArg ? onlyArg.slice(7).split(',') : undefined);
  let bad = 0;
  for (const [name, problems] of Object.entries(res)) {
    if (problems && problems.length) { bad++; for (const p of problems) console.error(`✗ ${name}: ${p}`); }
    else console.log(`✓ ${name}`);
  }
  console.log(bad ? `hunt-sessions-settle: ${bad} arm(s) red` : `hunt-sessions-settle: all ${Object.keys(res).length} arms green`);
  process.exit(bad ? 1 : 0);
}

/* The PGlite harness, for tests/envelope-contract.mjs (the real projections fed to the client's readers). */
export const HARNESS = Object.freeze({ ROOT, UIDS, STRONG, DOOMED, mixedRow, loadEdge, pinDice, hunter, character, settleTo, run, ticksOf,
  one, q, inTx, makeExec, groundsOf });

if (isMain(import.meta.url)) main();
