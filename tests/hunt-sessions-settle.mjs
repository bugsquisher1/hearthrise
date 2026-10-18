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
//   MAXHP      a hitpoints level-up never LOWERS max HP (the FX-4 root cause).
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
//   SPLIT      party-split.js: gold even with the remainder to the first, items
//              round-robin; a two-hero hunt pays both, neither more than its
//              share plus the remainders.
//   KNOCKOUT   a fall downs the hero KNOCKOUT_MS on the world's clock (whole
//              swings, every one of them down, stamina resting), it stands at
//              resumeHpFor (never a free heal), and the recovery line a window
//              leaves is the fall + KNOCKOUT_MS.
//   QUIVER     every ranged basic looses one shot of the loaded ammo; a
//              40-arrow bag under `end` fires 40 and ends ammo_out.
//   WORLD-BOUND  a four-hero party's world stays inside world_max_bytes on the
//              compact form; world-state refuses one past it.
//   FENCE      a hunter is never priced by the old path (hunt_open), a combat
//              pointer with no hunt by nothing (hunt_required).
//   DEATHXP-RULE  a fall costs DEATH_XP_LOSS of the level gap, never a de-level.
// ARMS (DATABASE — the replayed chain)
//   TICK-1     N tick windows (90 s) and odd cuts == ONE window, through the
//              database: the character, the session, the bag, the tally, the
//              ledger sums, the timeline, and the instance WORLD itself.
//   BOTH-PATH  a hunt with falls settled at a player's irregular instants
//              (inside the knockouts) writes what the tick's windows write.
//   PARITY     the tick door, the player's door and the composed pieces write
//              the same rows for one window.
//   OWN        own food is eaten first: one supply_own row a settle, gold 0, the
//              bag debited by exactly the units used; the store untouched.
//   STORE      an empty bag under the default switch buys from the store: every
//              unit journalled supply_buy at the catalogue price, the gold
//              moved = coins − store gold, the tally's Waste carries it; under
//              `end` the store sells nothing.
//   END        under `end`, a dry essential heal line ends the hunt heals_out.
//   STAMINA    the pool through the database; the cap follows premium (free
//              8 h, premium 12 h at the window); a tampered pool is refused.
//   RESUME     an automatic end resumes the last activity after the walk home;
//              a level-locked one leaves the character idle.
//   DEATHXP    falls state their price; one death_xp row; bank = start +
//              gains − price; an over-charge is refused.
//   TALLY      tally = Σ ledger rows stamped with the session.
//   ANALYZER   dealt / taken / healed persisted per session from the engine's
//              tally; a free character reads no analyzer, a premium one does.
//   PARTY      two characters in one party hunt ONE instance: one world, both
//              paid, kills journalled each, gold split; a settle missing a
//              member is refused member_set.
//   PARTY-VIEW the real `party` section of a settled two-hero hunt, read by the
//              client's own reader (src/session/hunt-sections.js partyOf), yields
//              both members the party panel draws: unit (= the session's world
//              unit), name, role, HP / mana off the pose, dealt, DPS; leader and
//              self are units; `account.max_concurrent` is the server config.
//   VALUE      every bound refuses a forgery and moves nothing: gold / XP /
//              item (value_over), kills (kills_over), the world's size, shape and
//              swing, the store without consent (store_off), the lane caps
//              (too_many_uses), an unsold id (not_for_sale).
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
    HT: await import(u(join(FN, 'hunt-track.js'))),
    IN: await import(u(join(FN, 'intents.js'))),
    TK: await import(u(join(FN, 'tick.js'))),
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
    WS: await import(u('src/core/hunt/world-state.js')),
    GRID: await import(u('src/core/hunt/grid.js')),
    REC: await import(u('src/core/recovery.js')),
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
  route: [0, 1, 2], respawnMs: 90000, pullDist: 1.5,
});
const gridOf = (M) => M.GRID.makeGrid(GROUND_MAP[0].length, GROUND_MAP.length,
  (x, y) => GROUND_MAP[y][x] === '.', (x, y) => GROUND_MAP[y][x] === '#');
const groundsOf = (M) => ({ mill_cellar: { ground: groundRow(), grid: gridOf(M) } });

// ═══════════════════════════════════════════════════════════════════════
// ENGINE ARMS (no database)
// ═══════════════════════════════════════════════════════════════════════
const T0 = Date.UTC(2026, 9, 17, 12, 0, 0);
const IID = '00000000-0000-4000-8000-0000000c5e01';
const SECRET = '-4611686018427387904';
const tier1 = (M) => {
  const basics = {};
  for (const b of M.SB.BASIC_SUPPLIES) basics[b.id] = { kind: b.kind, price: b.price, heals: b.heals || 0, mana: b.mana || 0, partner: b.partner };
  return { basics, shop: { heal: M.SB.basicFor('heal', 1).id, mana: M.SB.basicFor('mana', 1).id } };
};

/* One member of an engine-arm instance, in the shape hunt-settle.js memberInput builds. */
function memberIn(M, key, o) {
  const x = o || {};
  const t = tier1(M);
  const lv = (n) => M.XP.xpForLevel(n);
  const skills = x.skills || { attack: lv(x.level || 20), strength: lv(x.level || 20), defense: lv(x.level || 20), hitpoints: lv(x.level || 20) };
  const maxHp = x.maxHp ?? M.XP.levelFromXp(skills.hitpoints);
  const role = x.role || 'melee_dps';
  return {
    key, user: key, slot: 0, seat: x.seat || 0, unitId: x.unitId ?? null, sessionId: 's-' + key, version: 1, huntId: 'mill_cellar',
    huntSession: { id: 's-' + key, instanceId: IID, huntFromMs: T0, nextSwingAtMs: T0, swingIndex: 0,
      bag: x.bag || {}, staminaMs: x.stamina ?? 12 * 3600000, staminaMaxMs: x.staminaMax ?? 12 * 3600000,
      basics: t.basics, shop: t.shop, goldFloor: x.floor ?? 0, supplySource: x.source || 'mine', onEmpty: x.empty || 'switch',
      cover: x.cover || {}, fallsLimit: 3 },
    skills, xpFrac: null, hp: x.hp ?? maxHp, maxHp, gold: x.gold ?? 0, equipment: x.equipment || {}, combatStyle: null,
    inventory: {}, recoveringUntilMs: 0, deathsTodayBefore: 0, deathsLifetimeBefore: 0, hearthfindReady: false, perks: null,
    hero: M.SPAWN.heroSetup({ weaponType: x.weaponType || ({ melee_dps: 'hammer', ranger: 'ranged', mage: 'magic', healer: 'magic' }[role] || 'sword'),
      options: Object.assign({}, x.options || {}, role === 'healer' ? { role: 'healer' } : {}), bar: x.bar || [], partyRoles: x.partyRoles || [role] }),
    ...(x.extra || {}),
  };
}
function instIn(M, members, spanMs, extra) {
  return Object.assign({ instance: { id: IID, nextSwingAtMs: T0, world: null }, window: { fromMs: T0, toMs: T0 + spanMs },
    secret: SECRET, ...groundsOf(M).mill_cellar, items: M.ITEMS, monsters: M.MONSTERS, members }, extra || {});
}
/* Run an instance over [T0, T0 + span) cut at `cuts`, carrying the world and every session like the database does. */
function runCut(M, mk, spanMs, cuts) {
  const members = mk();
  const edges = [T0, ...cuts.filter((c) => c > T0 && c < T0 + spanMs).sort((a, b) => a - b), T0 + spanMs];
  let world = null; let next = T0;
  const outs = [];
  for (let i = 1; i < edges.length; i++) {
    const out = M.AC.accrueHunt(instIn(M, members, 0, { instance: { id: IID, nextSwingAtMs: next, world },
      window: { fromMs: edges[i - 1], toMs: edges[i] } }));
    if (!out.accrued) continue;
    outs.push(out);
    world = out.world; next = out.settledTo;
    for (const p of out.members) {
      const m = members.find((x) => x.key === p.key);
      const h = p.hunt;
      m.huntSession = Object.assign({}, m.huntSession, { swingIndex: h.swing_to, nextSwingAtMs: Date.parse(h.next_swing_at),
        falls: h.falls, staminaMs: h.stamina, down: h.down,
        bag: Object.fromEntries(Object.entries(m.huntSession.bag).map(([id, l]) => [id, { ...l, left: (l.left ?? l.loaded) - (h.uses[id] || 0) }])) });
      m.unitId = h.unit_id;
      m.hp = p.delta.hp;
      for (const [k, v] of Object.entries(p.delta.xp || {})) m.skills = { ...m.skills, [k]: (m.skills[k] || 0) + v };
      m.gold += p.delta.gold || 0;
      if (h.ended) m.ended = h.ended;
    }
  }
  return { outs, members, world };
}

const ENGINE_ARMS = {
  'TICK-2': async (M) => {
    const problems = [];
    const dir = join(M.root, FN);
    /* DELETED OUTRIGHT (the closed rebuild, lane C2; the C2 bar, lane S1). No edge file may name one in CODE again. */
    const gone = new RegExp(['hr_attended_kills', 'hr_credit_kills', 'ATTENDED_MAX_FIDELITY', 'attendedKillCap',
      'away-receipt', 'withAwayReceipt', 'receiptRescue', 'last_away_receipt', 'hr_vigour_of', 'vigourCharge',
      'VIGOUR_', 'autoEatEnabled', 'resolveAutoEat', 'auto_eat_', 'huntStance', 'hunt_stance', 'evaluateStop',
      'consec_falls', 'retreatAtFall', 'killBonusesFor', 'charmIndex', 'killsByClass', 'trophyIndex',
      'readTickBestiary', 'companionXpBacked', 'COMPANION_XP_SERVER_BACKED', 'partyIntentFence', 'tick-party',
      'tick-combat', 'claim-reward', 'dungeon-settle', 'quartermaster-buy', 'runEnchant', 'hunt_use', 'barSlot',
      'hr_hunt_apply\\(', 'hr_hunt_engine_read'].join('|'));
    for (const f of readdirSync(dir).filter((n) => /\.(js|ts)$/.test(n))) {
      const code = stripComments(readFileSync(join(dir, f), 'utf8'));
      const m = code.match(gone);
      if (m) problems.push(`${f} still names \`${m[0]}\` in code (deleted outright)`);
    }
    const presence = /\baway\b|presence|last_seen|capMs|cap_ms|hr_accrue_cap_ms|hr_offline_cap_ms|return_anchor|horizon/;
    for (const f of ['hunt-settle.js', 'hunt-seed.js', 'hunt-ground.js', 'hunt-track.js']) {
      const code = stripComments(readFileSync(join(dir, f), 'utf8'));
      const m = code.match(presence);
      if (m) problems.push(`${f} reads \`${m[0]}\` — the hunt settle may not consult presence, a cap or ctx.away (TICK-2)`);
    }
    const acc = stripComments(readFileSync(join(dir, 'accrual.js'), 'utf8'));
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
      const fake = { key: 'a', seat: 0, unitId: null, hs: M.AR.newHuntSession(m.huntSession), state: { skills: {}, playerHp: 10, playerMaxHp: 10, stats: {} },
        hero: m.hero, snapshot: () => ({ acc: 500, maxHit: 2, def: 1 }), style: null, bonus: () => 0, weakness: () => ({ dropMult: 1 }), fx: {} };
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
    /* THE FOOD LANE, ONE SOURCE (spec §3.4 #3): consumables.js laneMs, 1 s. */
    if (M.CD.CONSUMABLE_RULES.laneMs !== 1000) problems.push(`the food-and-drink lane is ${M.CD.CONSUMABLE_RULES.laneMs} ms, the spec's pick is 1 s`);
    return problems;
  },

  MAXHP: async (M) => {
    const problems = [];
    const lv6 = M.XP.xpForLevel(6) - 1;
    const m = memberIn(M, 'a', { skills: { attack: 50000, strength: 50000, defense: 50000, hitpoints: lv6 }, maxHp: 10, hp: 10 });
    const out = M.AC.accrueHunt(instIn(M, [m], 600000));
    const r = out.members && out.members[0];
    if (!r) return [`CONTROL: the window settled nothing (${out.reason})`];
    if (!(r.maxHp >= 10)) problems.push(`max HP fell to ${r.maxHp} on a hitpoints level-up — raise-only`);
    if (!(r.delta.xp && r.delta.xp.hitpoints > 0)) problems.push('CONTROL: no hitpoints XP was earned');
    /* RAISED on a level-up: a hero at max HP 5 that reaches hitpoints 6 inside the window leaves at 6. */
    const lo = memberIn(M, 'a', { skills: { attack: 50000, strength: 50000, defense: 50000, hitpoints: lv6 }, maxHp: 5, hp: 5 });
    const up = M.AC.accrueHunt(instIn(M, [lo], 600000)).members[0];
    /* The level REACHED, not a literal 6: a hero the store keeps in mana (cheap drinks,
       designer 2026-10-17) hunts the whole window and may level past 6. */
    const reached = M.XP.levelFromXp(lv6 + ((up.delta.xp || {}).hitpoints || 0));
    if (!(reached >= 6)) problems.push('CONTROL: the hitpoints level-up never happened');
    else if (up.maxHp !== reached) problems.push(`a hitpoints level-up to ${reached} left max HP at ${up.maxHp}`);
    return problems;
  },

  /* BUFF: a hunt READS the timed buff queue (it fires none): a live +200% damage
     buff kills faster; one that ended before the window pays nothing; one that
     ends mid-window pays exactly while it runs, however the window is cut. */
  BUFF: async (M) => {
    const problems = [];
    const iso = (ms) => new Date(ms).toISOString();
    const mk = (buffs) => () => [memberIn(M, 'a', { level: 5, empty: 'end', extra: { buffs } })];
    const kills = (o) => o.outs.reduce((a, x) => a + x.members[0].delta.journal.meta.kills, 0);
    const bare = runCut(M, mk(null), 900000, []);
    const live = runCut(M, mk([{ type: 'damage', magnitude: 200, until: iso(T0 + 3600000), from: iso(T0 - 1000) }]), 900000, []);
    const dead = runCut(M, mk([{ type: 'damage', magnitude: 200, until: iso(T0 - 1000), from: iso(T0 - 600000) }]), 900000, []);
    const dealt = (o) => o.outs.reduce((x, w) => x + Number(((w.members[0].analyzer || {}).dealt || {}).total || 0), 0);
    if (!(dealt(live) > dealt(bare) * 1.5)) problems.push(`a live +200% damage buff dealt ${dealt(live)} against ${dealt(bare)} without — a hunt does not read the buff queue`);
    if (canon(dead.outs.map((o) => o.members[0].delta)) !== canon(bare.outs.map((o) => o.members[0].delta))) problems.push('a buff that ended before the window changed it');
    const mid = [{ type: 'damage', magnitude: 200, until: iso(T0 + 300000), from: iso(T0 - 1000) }];
    /* A hero that outlives the buff (level 20), so a queue frozen at a window's start shows. */
    const mk20 = (buffs) => () => [memberIn(M, 'a', { level: 20, empty: 'end', extra: { buffs } })];
    const one = runCut(M, mk20(mid), 900000, []);
    const cut = runCut(M, mk20(mid), 900000, [T0 + 100000, T0 + 290000, T0 + 310000, T0 + 600000]);
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
    /* A KNOCKED-OUT hero RESTS: over a window with falls, the pool = start − paid + down (under the cap). */
    const ko = runCut(M, () => [memberIn(M, 'a', { stamina: 3600000, staminaMax: cap.free, empty: 'end',
      skills: { attack: 0, strength: 0, defense: 0, hitpoints: M.XP.xpForLevel(4) }, maxHp: 4, hp: 4 })], 600000, []);
    const k = ko.outs[0] && ko.outs[0].members[0];
    if (!k || !(k.hunt.down_ms > 0)) problems.push('CONTROL: the weak hero was never knocked out');
    else if (k.hunt.stamina !== 3600000 - k.hunt.paid_ms + k.hunt.down_ms) {
      problems.push(`a pool of 1 h after ${k.hunt.paid_ms} ms paid and ${k.hunt.down_ms} ms down is ${k.hunt.stamina} — a knockout does not rest`);
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
    const hs = (o) => M.AR.newHuntSession(Object.assign({ id: 'x', bag: {}, basics: t.basics, shop: t.shop, purse: 1000, goldFloor: 0 }, o));
    if (M.HSD.ON_EMPTY.default !== 'switch' || !M.HSD.ON_EMPTY.modes.includes('end')) problems.push(`ON_EMPTY is ${JSON.stringify(M.HSD.ON_EMPTY)}, not default switch with end opt-in`);
    /* OWN FIRST, the smallest that covers, free. */
    const own = hs({ bag: { cooked_shrimp: { loaded: 5 }, cooked_trout: { loaded: 5 } } });
    const sh = M.CD.CONSUMABLES.cooked_shrimp.amount;
    const l1 = M.AR.resolveLine(own, 'heal', sh);
    if (l1.id !== 'cooked_shrimp' || l1.source !== 'own' || l1.price !== 0) problems.push(`own food first, the smallest that covers: ${JSON.stringify(l1)}`);
    if (M.AR.lineAmount(own, l1) !== M.ITEMS.cooked_shrimp.heals && M.AR.lineAmount(own, l1) !== M.CD.CONSUMABLES.cooked_shrimp.amount) problems.push('an own food does not restore its item\'s amount');
    if (!M.AR.takeLine(own, l1, 0) || own.bag.cooked_shrimp.left !== 4 || own.tally.supplies.cooked_shrimp !== 1) problems.push('an own use did not leave the bag once');
    /* Under supply_source `store` a carried line is STILL spent first (hunt-sessions.js SUPPLY_SOURCE). */
    const l1s = M.AR.resolveLine(hs({ supplySource: 'store', bag: { cooked_shrimp: { loaded: 5 } } }), 'heal', sh);
    if (l1s.source !== 'own') problems.push(`a store-sourced hero with food in its bag bought instead: ${JSON.stringify(l1s)}`);
    /* THE STORE behind an empty line, under the default switch, at the catalogue price, restoring ITS amount. */
    const store = hs({});
    const l2 = M.AR.resolveLine(store, 'heal', 5);
    const row = t.basics[t.shop.heal];
    if (l2.source !== 'store' || l2.price !== row.price) problems.push(`an empty bag under switch did not fall to the store at its price: ${JSON.stringify(l2)}`);
    if (M.AR.lineAmount(store, l2) !== row.heals) problems.push(`a store food restores ${M.AR.lineAmount(store, l2)}, its row says ${row.heals}`);
    if (!M.AR.takeLine(store, l2, 0) || store.purse !== 1000 - row.price || store.tally.bought[t.shop.heal] !== 1) problems.push('a store use was not paid once from the purse');
    if (M.AR.resolveLine(hs({ onEmpty: 'end' }), 'heal', 5).source) problems.push('the store sold under the hero\'s `end`');
    /* A dry purse ends gold_out; the floor is kept; cover sells junk only, cheapest first. */
    const dry = hs({ purse: row.price - 1 });
    const l3 = M.AR.resolveLine(dry, 'heal', 5);
    if (l3.why !== 'gold_short') problems.push(`a purse short of the price answered ${JSON.stringify(l3)}`);
    if (M.AR.canAfford(hs({ purse: 100, goldFloor: 50 }), 60)) problems.push('a use was affordable below the gold floor');
    const cov = hs({ purse: 0, cover: { a_junk: { unit: 5, avail: 10 }, b_junk: { unit: 2, avail: 10 } } });
    M.AR.sellToCover(cov, 4);
    if (cov.tally.covered.b_junk !== 2 || cov.tally.covered.a_junk) problems.push(`sell-to-cover did not sell the cheapest first: ${JSON.stringify(cov.tally.covered)}`);
    if (M.HSD.coverSellable({ type: 'resource' }, false) || !M.HSD.coverSellable({ type: 'resource', junk: true }, false)) problems.push('sell-to-cover sells something other than junk');
    /* THE COINS REACH THE PURSE: a hero one coin short of the store's food, at full HP, can buy
       food once a kill has paid — without its coins the first meal it needs ends the hunt gold_out. */
    const out = runCut(M, () => [memberIn(M, 'a', { level: 12, gold: row.price - 1 })], 1800000, []);
    const ms = out.outs.flatMap((o) => o.members);
    /* FOOD buys only: a 6 g store drink is affordable from the purse alone (designer 2026-10-17), so a drink buy proves nothing about the coins. */
    const tl = ms.reduce((a, x) => a + ((x.hunt.buys || {})[t.shop.heal] || 0), 0);
    const kills = ms.reduce((a, x) => a + x.delta.journal.meta.kills, 0);
    const end = ms.find((x) => x.hunt.ended);
    /* A DRINK THE PURSE CANNOT BUY ONLY GOES WITHOUT: a broke hero that wants to drink
       but never needs food hunts on (spec §3.4 #7); only an unaffordable FOOD ends gold_out.
 */
    const thirsty = runCut(M, () => [memberIn(M, 'a', { level: 40, gold: 0, options: { drink_below_pct: 99 } })], 600000, []);
    const tEnd = thirsty.outs.flatMap((o) => o.members).find((x) => x.hunt.ended);
    if (tEnd && tEnd.hunt.ended.reason === 'gold_out') problems.push('a broke hero that only wanted a drink ended gold_out');
    if (!(kills > 0)) problems.push('CONTROL: the poor hero killed nothing');
    else if (!(tl > 0)) problems.push(`a hero one coin short bought no food after ${kills} kills (ended ${JSON.stringify(end && end.hunt.ended)}) — kill coins do not reach the purse`);
    return problems;
  },

  /* ECON-1 (designer 2026-10-17, Tyler's rule: gold + common drops pay the supplies,
     profit comes from rares). A FRESH melee hero (Bronze Sword, Hitpoints 10, 0 gold,
     the kit's 20 cooked shrimp) hunts the mill_cellar fixture for an hour on the store's
     drinks: it never ends gold_out, and the coins its kills drop pay every drink it buys.
     At the old 90 g Thin Turnip Juice it ended gold_out at 1:54. */
  'ECON-1': async (M) => {
    const problems = [];
    const fresh = () => [memberIn(M, 'a', { skills: { hitpoints: M.XP.xpForLevel(10) }, gold: 0,
      bag: { cooked_shrimp: { loaded: 20 } }, equipment: { weapon: 'bronze_sword' } })];
    const cuts = Array.from({ length: 5 }, (_, i) => T0 + (i + 1) * 600000);
    const out = runCut(M, fresh, 3600000, cuts);
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
    return problems;
  },

  KNOCKOUT: async (M) => {
    const problems = [];
    const ko = M.HSD.KNOCKOUT_MS;
    const weak = () => [memberIn(M, 'a', { skills: { attack: 0, strength: 0, defense: 0, hitpoints: M.XP.xpForLevel(4) }, maxHp: 4, hp: 4, empty: 'end' })];
    const out = runCut(M, weak, 200000, []);
    const first = out.outs[0] && out.outs[0].members[0];
    if (!first || !(first.summary.deathLog.length >= 1)) return [`CONTROL: the weak hero never fell (${out.outs.length} windows)`];
    const d = first.summary.deathLog[0];
    if (d.recoverMs !== ko || first.delta.deaths[0].recovery_ms !== ko) problems.push(`a fall downs for ${d.recoverMs}, KNOCKOUT_MS is ${ko}`);
    if (d.resumeHp !== M.REC.resumeHpFor(4)) problems.push(`a fall stands at ${d.resumeHp}, resumeHpFor is ${M.REC.resumeHpFor(4)}`);
    if (!(first.hunt.down_ms >= ko - 2000)) problems.push(`a fall left ${first.hunt.down_ms} ms down, KNOCKOUT_MS is ${ko}`);
    /* RESUME-LINE: a window ending mid-knockout leaves the line at the fall + KNOCKOUT_MS. */
    const mid = runCut(M, weak, d.atMs - T0 + 10000, []);
    const last = mid.outs[mid.outs.length - 1].members[0];
    if (last.delta.recovering_until !== new Date(d.atMs + ko).toISOString()) {
      problems.push(`a window cut mid-knockout left the line at ${last.delta.recovering_until}, want ${new Date(d.atMs + ko).toISOString()}`);
    }
    /* The stand-up is never a free heal: a 20-HP hero's HP one swing after it stands is
       resumeHpFor(20) give or take one swing of regen, never its max. */
    const big = () => [memberIn(M, 'a', { skills: { attack: 0, strength: 0, defense: 0, hitpoints: M.XP.xpForLevel(20) }, maxHp: 20, hp: 20, empty: 'end' })];
    const b0 = runCut(M, big, 900000, []).outs[0];
    const bf = b0 && b0.members[0].summary.deathLog[0];
    if (!bf) problems.push('CONTROL: the 20-HP hero never fell');
    else {
      const stood = runCut(M, big, bf.atMs - T0 + ko + 2000, []).outs;
      const hp = stood[stood.length - 1].members[0].delta.hp;
      const r20 = M.REC.resumeHpFor(20);
      if (!(hp <= r20 + 3)) problems.push(`a 20-HP hero stood up at ${hp} HP, resumeHpFor is ${r20} — a free heal`);
    }
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
    const f = M.AR.deathXpLossFor; const L = M.XP.xpForLevel;
    if (f(L(10)) !== 0) problems.push('a fall at a level floor costs XP');
    const gap = L(11) - L(10);
    if (f(L(11) - 1) !== Math.floor(gap * M.HSD.DEATH_XP_LOSS)) problems.push('a fall does not cost DEATH_XP_LOSS of the gap');
    if (f(L(10) + 3) !== 3) problems.push('a fall de-levels');
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
async function installGround(db) {
  const GEN = await import(pathToFileURL(join(ROOT, 'tools', 'gen-hunt-sessions.mjs')).href);
  const { rows, spawns } = GEN.groundRows({ h1_fixture: groundRow() });
  for (const g of rows) {
    await db.query(`insert into public.hr_hunt_grounds (hunt_id, ground_id, pockets, spawns, respawn_ms, seats) values ($1,$2,$3,$4,$5,$6)
                    on conflict (hunt_id) do update set ground_id = excluded.ground_id, pockets = excluded.pockets, spawns = excluded.spawns,
                      respawn_ms = excluded.respawn_ms, seats = excluded.seats`, [g.hunt, g.ground, g.pockets, g.spawns, g.respawn, g.seats]);
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
  if (o.level) { const xp = M.XP.xpForLevel(o.level); await admin(db, uid, { xp: { attack: xp, strength: xp, defense: xp, hitpoints: xp } }); }
  if (o.skillsXp) await admin(db, uid, { xp: o.skillsXp });
  if (o.gold != null) {
    await db.query('update public.player_state set gold = $2 where user_id = $1 and slot = 0', [uid, o.gold]);
  }
  if (o.hp) await db.query('update public.player_state set hp = least(max_hp, $2) where user_id = $1 and slot = 0', [uid, o.hp]);
  if (o.options) {
    await asUser(db, uid);
    const r = await one(db, 'select public.hr_action_set_options(0, 0, $1::jsonb, $2::uuid)', [JSON.stringify(o.options), idem()]);
    if (!r || r.ok !== true) throw new Error('options refused: ' + JSON.stringify(r));
  }
  if (o.premium) await db.query(`select public.hr_premium_grant($1, 0, now() + interval '30 days', 's1 probe')`, [uid]);
  if (o.lastActivity) {
    await db.query('update public.player_state set last_activity_kind = $2, last_activity_id = $3 where user_id = $1 and slot = 0',
      [uid, o.lastActivity.kind, o.lastActivity.id]);
  }
}

/* A hunter: one character (or, with o.party, every character of a party) on mill_cellar `minutesAgo` minutes ago. */
async function hunter(db, M, o) {
  await installGround(db);
  await db.query('update public.hr_hunt_config set enabled = true where id');
  const who = o.party ? o.party : [o];
  for (let i = 0; i < who.length; i++) await character(db, M, UIDS[i], who[i]);
  let party = null;
  if (o.party) {
    await asUser(db, UIDS[0]);
    party = (await one(db, `select public.hr_hunt_party_create(0, 'mill_cellar', $1::uuid)`, [idem()])).party.id;
    for (let i = 1; i < who.length; i++) {
      await asUser(db, UIDS[i]);
      const j = await one(db, 'select public.hr_hunt_party_join(0, $1::uuid, $2::uuid)', [party, idem()]);
      if (!j || j.ok !== true) throw new Error('party join refused: ' + JSON.stringify(j));
    }
  }
  const sids = [];
  for (let i = 0; i < who.length; i++) {
    await asUser(db, UIDS[i]);
    const e = await one(db, `select public.hr_hunt_enter(0, 'mill_cellar', $1::jsonb, 0, null, null, $2::uuid)`, [JSON.stringify(who[i].bag || []), idem()]);
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
  const exec = makeExec(db);
  const plan = await M.HS.readHuntSettle({ exec, user: o.user || UID, slot: 0, grounds: groundsOf(M), atMs: toMs }, 'tick');
  if (plan.answer) return { skipped: plan.answer.reason };
  const p = await M.HS.proposeHuntSettle(plan, plan.toMs, 0);
  if (!p.out.accrued) return { skipped: p.out.reason };
  if (o.tamper) o.tamper(p.commit, p.out);
  const res = await M.HS.commitHuntSettle(exec, { ...p.commit, project: null });
  if (o.tamper || o.raw) return { res, out: p.out, commit: p.commit };
  if (!res || res.ok !== true) throw new Error(`settle to ${new Date(toMs).toISOString()} refused: ${JSON.stringify(res).slice(0, 500)}`);
  return { res, out: p.out, commit: p.commit };
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
      'gold', ps.gold, 'hp', ps.hp, 'max_hp', ps.max_hp, 'recovering_until', ps.recovering_until,
      'active', ps.active_kind || ':' || coalesce(ps.active_id, ''), 'stamina', ps.stamina_ms, 'stamina_at', ps.stamina_at,
      'skills', (select jsonb_object_agg(skill_id, jsonb_build_array(xp, xp_frac)) from public.player_skills where user_id = $1 and slot = 0),
      'inv', (select jsonb_object_agg(item_id, qty) from public.player_inventory where user_id = $1 and slot = 0),
      'stats', (select jsonb_object_agg(kind || ':' || key || ':' || period_key, value) from public.player_progress
                 where user_id = $1 and slot = 0 and kind <> 'daily'),
      'session', (select jsonb_build_object('swing', swing_index, 'next', next_swing_at, 'settled_to', settled_to,
                    'falls', falls, 'down', down, 'unit', unit_id, 'ended_at', ended_at, 'end_reason', end_reason)
                    from public.hunt_sessions h where h.id = $2),
      'instance', (select jsonb_build_object('world_swing', i.world_swing, 'world', md5(coalesce(i.world, '')), 'settled_to', i.settled_to)
                     from public.hunt_sessions h join public.hunt_instances i on i.id = h.instance_id where h.id = $2),
      'bag', (select jsonb_object_agg(item_id, jsonb_build_array(qty_loaded, qty_left)) from public.hunt_bag where session_id = $2),
      'tally', (select to_jsonb(t) - 'updated_at' - 'ledger_hwm' - 'raw_xp' from public.hunt_session_tally t where session_id = $2),
      'ledger', (select jsonb_object_agg(intent, s) from (select l.intent, jsonb_build_array(sum(coalesce(l.gold, 0)), sum(coalesce(l.qty, 0))) s
                   from public.player_ledger l where l.session_id = $2 and l.kind = 'hunt' group by l.intent) x),
      'deaths', (select jsonb_agg(jsonb_build_array(meta->>'monster', meta->>'recovery_ms', meta->>'resume_hp') order by id)
                   from public.player_ledger where session_id = $2 and kind = 'combat' and intent = 'death'),
      'events', (select jsonb_agg(jsonb_build_array(type, at, data) order by at, type, data::text)
                   from public.hunt_session_events where session_id = $2 and type in ('fall', 'slot_dry', 'ended')),
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
const WEAK = { minutesAgo: 25, inv: {}, bag: [], gold: 0, hp: 1, options: { on_empty: 'end', food_below_pct: 99 },
  skillsXp: { attack: 400, strength: 450, magic: 1585 } };

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
    /* AWAY = the tick's 90 s windows; ATTENDED = a player's irregular instants, two of them INSIDE each knockout of the away run. */
    const attended = (from, a) => {
      const falls = ((a[0] && a[0].events) || []).filter((e) => e[0] === 'fall').map((e) => Date.parse(e[1]));
      const cuts = [from + 7001, from + 33333];
      for (const t of falls) cuts.push(t + 1500, t + 31234);
      cuts.push(from + SPAN_MS);
      return [...new Set(cuts)].filter((t) => t > from && t <= from + SPAN_MS).sort((x, y) => x - y);
    };
    const { a, b, h: hA } = await compareRuns(db, M, WEAK, ticksOf(90000, SPAN_MS), attended);
    if (!((a[0].deaths || []).length >= 1)) problems.push(`CONTROL: the weak hero never fell (${JSON.stringify(a[0].tally)})`);
    if (canon(a) !== canon(b)) problems.push(`a hunt settled at a player's instants wrote different rows from the tick's ${firstDiff(canon(a), canon(b))}`);
    /* THE CARRIED LINE: two settles inside one knockout (the second has no fall of its own)
       leave player_state.recovering_until at the fall + KNOCKOUT_MS, read back between them. */
    const fall = ((a[0] && a[0].events) || []).find((e) => e[0] === 'fall');
    if (fall) {
      await inTx(db, async () => {
        await rewindDice(db);
        const h = await hunter(db, M, WEAK);
        const at = Date.parse(fall[1]) - hA.from + h.from;   // the same fall on this transaction's clock
        await settleTo(db, M, at + 1500);
        await settleTo(db, M, at + 31234);
        const line = await one(db, `select floor(extract(epoch from recovering_until) * 1000)::bigint from public.player_state where user_id = $1 and slot = 0`, [UID]);
        if (Number(line) !== at + M.HSD.KNOCKOUT_MS) problems.push(`the line carried across two settles in one knockout is ${line}, want ${at + M.HSD.KNOCKOUT_MS}`);
        if (!h.sid) problems.push('CONTROL: no hunt');
      });
    }
    return problems;
  },
  PARITY: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid } = await hunter(db, M, { ...STRONG, options: { stance: 'defensive', distance: 3, food_below_pct: 90 } });
    const exec = makeExec(db);
    await db.query('savepoint parity');
    const runs = {};
    for (const [door, go] of [
      ['tick', () => M.HS.settleHunt({ exec, user: UID, slot: 0, mode: 'tick', session: sid, grounds: groundsOf(M) })],
      ['settle', () => M.HS.settleHunt({ exec, user: UID, slot: 0, mode: 'settle', minWindowMs: 0, grounds: groundsOf(M) })],
      ['pieces', async () => { const now = Number(await one(db, 'select floor(extract(epoch from now()) * 1000)::bigint')); return settleTo(db, M, now); }],
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
    const { sid, from } = await hunter(db, M, { ...WEAK, options: { supply_source: 'mine', on_empty: 'switch', food_below_pct: 99 }, gold: 100000,
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
    const { sid, from } = await hunter(db, M, { ...WEAK, options: { on_empty: 'end', food_below_pct: 99 }, inv: { cooked_shrimp: 3 },
      bag: [{ item: 'cooked_shrimp', qty: 3, essential: true }], lastActivity: { kind: 'gather', id: 'shrimp_s' } });
    await run(db, M, from, ticksOf(90000, SPAN_MS));
    const s = await snapshot(db, sid);
    if (!s.session.ended_at) return [`CONTROL: the hunt did not end (${JSON.stringify(s.session)})`];
    if (s.session.end_reason !== 'heals_out') problems.push(`a dry essential heal line ended ${s.session.end_reason}, not heals_out`);
    if (s.bag.cooked_shrimp[1] !== 0) problems.push('heals_out ended a hunt with food left');
    /* With nothing essential to run out of, the falls limit ends it — at exactly the limit. */
    await db.query('rollback'); await db.query('begin');
    const f = await hunter(db, M, WEAK);
    await run(db, M, f.from, ticksOf(90000, SPAN_MS));
    const sf = await snapshot(db, f.sid);
    const lim = await one(db, 'select falls_limit from public.hunt_sessions where id = $1', [f.sid]);
    if (sf.session.end_reason !== 'falls' || sf.session.falls !== lim) problems.push(`a hero with no essential line ended ${sf.session.end_reason} after ${sf.session.falls} falls (limit ${lim})`);
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
    return problems;
  }),
  DEATHXP: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid, from } = await hunter(db, M, WEAK);
    const x0 = await one(db, `select jsonb_object_agg(skill_id, xp) from public.player_skills where user_id = $1 and slot = 0`, [UID]);
    await run(db, M, from, ticksOf(90000, SPAN_MS));
    const s = await snapshot(db, sid);
    const falls = (s.events || []).filter((e) => e[0] === 'fall');
    if (!falls.length) return ['CONTROL: the weak hero never fell'];
    for (const f of falls) if (!f[2] || f[2].xp_lost === undefined) problems.push(`a fall event states no price: ${JSON.stringify(f)}`);
    const price = s.death_xp || {};
    if (!(Object.values(price).reduce((a, n) => a + Number(n), 0) > 0)) problems.push(`${falls.length} falls cost no XP`);
    for (const [k, v] of Object.entries(price)) {
      const gained = s.tally.xp[k] || 0;
      const now = s.skills[k][0];
      if (now !== Math.floor(x0[k] + gained) - v && Math.abs(now - (x0[k] + gained - v)) > 1) problems.push(`${k}: bank ${now} != start ${x0[k]} + gains ${gained} - price ${v}`);
    }
    /* AN OVER-CHARGE: the first fall's window re-proposed with one XP more than its permille share of
       strength's level gap (strength sits mid-level, so only the share bound can refuse it). */
    await db.query('rollback'); await db.query('begin');
    const o = await hunter(db, M, WEAK);
    let refused = null;
    for (const t of ticksOf(90000, SPAN_MS)(o.from)) {
      let hit = false;
      const x = await settleTo(db, M, t, { tamper: (c) => {
        const dx = c.members[0].hunt.death_xp;
        if (dx.length) { hit = true; dx[0] = { ...dx[0], strength: Math.floor((M.XP.xpForLevel(6) - M.XP.xpForLevel(5)) * M.HSD.DEATH_XP_LOSS) + 1 }; }
      } });
      if (hit) { refused = x.res; break; }
      if (!x.res || x.res.ok !== true) break;
    }
    if (!refused) problems.push('CONTROL: no window with a fall to over-charge');
    else if (refused.error !== 'death_xp_over') problems.push(`a fall charged one XP over its share answered ${JSON.stringify(refused).slice(0, 200)}`);
    return problems;
  }),
  TALLY: async (db, M) => inTx(db, async () => {
    const problems = [];
    const { sid, from } = await hunter(db, M, { ...STRONG, options: { food_below_pct: 99 } });
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
    if (!free || free.error !== 'premium_required') problems.push(`a free character's analyzer read answered ${JSON.stringify(free).slice(0, 160)}`);
    if (!prem || prem.ok !== true || Number(prem.hero.dealt.total) !== Number(t.dealt.total) || Number(prem.hero.kills) <= 0) {
      problems.push(`the premium analyzer read ${JSON.stringify(prem && prem.hero).slice(0, 200)} is not the session's tally`);
    }
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
      ['a window teaching a fortune in XP', (c) => { m0(c).delta.xp = { ...(m0(c).delta.xp || {}), attack: 1000000 }; }, 'value_over'],
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
    for (const [label, tamper, code] of cases) {
      const x = await settleTo(db, M, from + 120000, { tamper });
      const got = x.res && x.res.error;
      if (code ? got !== code : !(x.res && x.res.ok === false)) problems.push(`${label} answered ${JSON.stringify(x.res).slice(0, 200)}, want ${code || 'a refusal'}`);
      const g = Number(await one(db, 'select gold from public.player_state where user_id = $1 and slot = 0', [UID]));
      if (g !== g0) problems.push(`${label} moved gold ${g0} -> ${g}`);
    }
    const honest = await settleTo(db, M, from + 120000, { raw: true });
    if (!honest.res || honest.res.ok !== true) problems.push(`an honest settle answered ${JSON.stringify(honest.res).slice(0, 200)}`);
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
    const e = await one(db, `select public.hr_hunt_enter(1, 'mill_cellar', '[]'::jsonb, 0, null, null, $1::uuid)`, [idem()]);
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
    const problems = [];
    const { sid } = await hunter(db, M, STRONG);
    const skills = async () => canon(await one(db, `select jsonb_object_agg(skill_id, jsonb_build_array(xp, xp_frac)) from public.player_skills where user_id = $1 and slot = 0`, [UID]));
    const before = await skills();
    await asUser(db, UID);
    const r = await one(db, `select public.hr_credit_combat_xp(0, $1::jsonb, $2)`, [JSON.stringify({ attack: 400, hitpoints: 130 }), idem()]);
    await db.query(`select set_config('request.jwt.claim.sub', '', true)`);
    if (!r || r.ok !== false || r.error !== 'hunt_open') problems.push(`a hunter's combat-XP credit answered ${JSON.stringify(r)}`);
    if (await skills() !== before) problems.push('a hunter\'s combat-XP credit moved a skill');
    if (!sid) problems.push('CONTROL: no hunt');
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
  { arm: 'TICK-2', name: '[C2 away ctx] the instance span runs with ctx.away again', file: join(FN, 'accrual.js'),
    from: '    { toMs, tickMs, seed, ground: inp.ground,', to: '    { away: true, toMs, tickMs, seed, ground: inp.ground,' },
  { arm: 'TICK-2', name: '[C2 absence watermark] the window starts at a presence watermark', file: join(FN, 'accrual.js'),
    from: 'const fromMs = Math.floor(nat(w.fromMs, -1));', to: 'const fromMs = Math.floor(nat(inp.accruedToMs, nat(w.fromMs, -1)));' },
  { arm: 'TICK-2', name: '[C2 F11 / no_topup] a deleted read returns to the hunt settle', file: join(FN, 'hunt-settle.js'),
    from: "import { huntTimeline } from './hunt-track.js';", to: "import { huntTimeline } from './hunt-track.js';\nexport const ATTENDED_READ = 'select * from public.hr_attended_kills($1, $2, $3)';" },
  { arm: 'BUFF', name: 'the hunt never re-measures the buff queue (a buff never pays)', file: 'src/core/combat-sim.js',
    from: "      if (typeof m.buffsAt === 'function') m.buffsAt(atMs);\n", to: '' },
  { arm: 'BUFF', name: '[C2 buff queue at the read clock] the queue is measured once, at the window start', file: join(FN, 'accrual.js'),
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
  { arm: 'MAXHP', name: 'a hitpoints level-up sets max HP to the level', file: join(FN, 'accrual.js'),
    from: "if (ev.type === 'levelup' && ev.skill === 'hitpoints' && ev.to > state.playerMaxHp) state.playerMaxHp = ev.to;",
    to: "if (ev.type === 'levelup' && ev.skill === 'hitpoints') state.playerMaxHp = ev.to;" },
  { arm: 'ECON-1', name: 'the T1 store drink back at 90 g (the heal\'s 15 g a point): a fresh melee hero ends gold_out', file: 'src/data/supply-basics.js',
    from: "'turnip_juice', 6, 6, [1]", to: "'turnip_juice', 6, 90, [1]" },
  { arm: 'WEAKNESS', name: 'a basic swing is priced on the neutral snapshot (the matched weapon pays nothing)', file: 'src/core/hunt/damage.js',
    from: "  const vs = h && t.side === 'mon' && typeof h.rollsVs === 'function' ? h.rollsVs(MONSTERS[t.kind]) : null;",
    to: "  const vs = null;" },
  { arm: 'WEAKNESS', name: 'the settle hands the swing no per-monster rolls', file: 'src/core/combat-sim.js',
    from: ' range: m.hero.range, rollsVs: m.rollsVs,', to: ' range: m.hero.range,' },
  { arm: 'CRIT', name: 'a hero blow never crits', file: 'src/core/hunt/damage.js',
    from: '    vs ? Number(vs.critChance) || 0 : 0);', to: '    0);' },
  { arm: 'CRIT', name: 'a crit is not journalled as the lifetime stat', file: join(FN, 'accrual.js'),
    from: "  stat('crits', stats.crits);\n", to: '' },
  { arm: 'EVENT-IDS', name: 'an event id counts across the whole window', file: join(FN, 'hunt-track.js'),
    from: '    const k = seen.get(at) || 0;', to: '    const k = seen.size;' },
  { arm: 'STAMINA-RULE', name: 'a swing does not drain the pool', file: 'src/core/action-rules.js',
    from: '  if (hunting) return Math.max(0, v - d);', to: '  if (hunting) return v;' },
  { arm: 'STAMINA-RULE', name: 'an empty pool ends nothing', file: 'src/core/action-rules.js',
    from: "  stamina: (hs) => hs.staminaMs !== null && hs.staminaMs !== undefined && !(Number(hs.staminaMs) > 0),", to: '  stamina: () => false,' },
  { arm: 'STAMINA-RULE', name: 'resting lowers a pool above the cap (a lapse eats banked stamina)', file: 'src/core/action-rules.js',
    from: '  return Math.max(v, Math.min(Math.floor(Number(maxMs) || 0), v + d));', to: '  return Math.min(Math.floor(Number(maxMs) || 0), v + d);' },
  { arm: 'STAMINA-RULE', name: '[C2 knockout rests] a knocked-out hero drains its pool', file: 'src/core/combat-sim.js',
    from: '        m.hs.staminaMs = staminaStep(m.hs.staminaMs, tick, standing, m.hs.staminaMaxMs);', to: '        m.hs.staminaMs = staminaStep(m.hs.staminaMs, tick, true, m.hs.staminaMaxMs);' },
  { arm: 'STAMINA', name: '[C2 reads no pool] the settle reads no pool', file: join(FN, 'hunt-settle.js'),
    from: '    staminaMs: num(h.stamina_ms),', to: '    staminaMs: null,' },
  { arm: 'SUPPLY-RULE', name: '[C2 shop never buys] the store never sells', file: 'src/core/action-rules.js',
    from: "    return canAfford(hs, b.price) ? { id, source: 'store', price: b.price } : { why: 'gold_short', id };", to: "    return { why: 'none' };" },
  { arm: 'SUPPLY-RULE', name: '[C2 shop heal by partner] a store food restores its crafted partner\'s amount', file: 'src/core/action-rules.js',
    from: "    return b ? Math.max(0, int(b.kind === 'mana' ? b.mana : b.heals, 0)) : 0;", to: "    return b ? (CONSUMABLES[b.partner] ? CONSUMABLES[b.partner].amount : 0) : 0;" },
  { arm: 'SUPPLY-RULE', name: '[C2 DEEPWATERS-S2] an own food restores one less than its item', file: 'src/core/action-rules.js',
    from: "  return c && c.source === 'own' ? c.amount : 0;", to: "  return c && c.source === 'own' ? c.amount - 1 : 0;" },
  { arm: 'SUPPLY-RULE', name: 'the store is open under the hero\'s end', file: 'src/core/action-rules.js',
    from: "  if (hs.onEmpty !== 'switch') return false;", to: '' },
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
  { arm: 'SUPPLY-RULE', name: '[C2 kill coins] kill coins never reach the purse', file: join(FN, 'accrual.js'),
    from: '      hs.purse = Math.max(0, Math.floor(Number(hs.purse) || 0)) + g;', to: '' },
  { arm: 'SUPPLY-RULE', name: '[C2 own first] the resolver reaches for the store before the own stack', file: 'src/core/action-rules.js',
    from: "    const own = pickOwn(hs, want, Math.max(1, int(need, 1)));", to: "    const own = storeAllowed(hs, want) ? null : pickOwn(hs, want, Math.max(1, int(need, 1)));" },
  { arm: 'SUPPLY-RULE', name: 'an unaffordable drink ends the hunt gold_out', file: 'src/core/hunt/consumables.js',
    from: "if (w.why === 'gold_short') { if (w.kind === 'food') hero.hs.goldOut = true; return { why: 'gold_short' }; }", to: "if (w.why === 'gold_short') { hero.hs.goldOut = true; return { why: 'gold_short' }; }" },
  { arm: 'SPLIT', name: 'the remainder of a split is lost', file: 'src/core/party-split.js',
    from: '  out[0] += t - each * k;', to: '' },
  { arm: 'SPLIT', name: 'every item goes to the first hero', file: 'src/core/party-split.js',
    from: '  return (((o + Math.floor(Number(k))) % m) + m) % m;', to: '  return 0;' },
  { arm: 'SPLIT', name: 'only the killer counts the kill', file: 'src/core/hunt-rewards.js',
    from: '  for (const m of present) countKill(m, kind);', to: '  countKill(lead, kind);' },
  { arm: 'KNOCKOUT', name: '[C2 free stand-up] a fall downs the hero for no time', file: 'src/core/hunt/pull-cycle.js',
    from: '  u.downMs = KNOCKOUT_MS;', to: '  u.downMs = 0;' },
  { arm: 'KNOCKOUT', name: '[probe-bar freeHeal, b509] the stand-up after a fall heals to full', file: 'src/core/hunt/pull-cycle.js',
    from: '      if (h.downMs === 0) { h.alive = true; h.hp = resumeHpFor(h.maxHp); h.hpMilli = 0; }', to: '      if (h.downMs === 0) { h.alive = true; h.hp = h.maxHp; h.hpMilli = 0; }' },
  { arm: 'KNOCKOUT', name: '[resume-alignment] the recovery line is stamped a swing late', file: 'src/core/combat-sim.js',
    from: '  m.state.recoveringUntilMs = f.atMs + KNOCKOUT_MS;', to: '  m.state.recoveringUntilMs = f.atMs + KNOCKOUT_MS + 2000;' },
  { arm: 'KNOCKOUT', name: '[C2 knockout ignored] a knocked-out hero is paid as hunting', file: 'src/core/combat-sim.js',
    from: '      const standing = !!u && u.alive;', to: '      const standing = !!u;' },
  { arm: 'QUIVER', name: '[C2 ammoGuard] a shot is loosed but its arrow is never taken from the bag', file: 'src/core/hunt/abilities.js',
    from: '    if (!takeLine(h.hs, l, sc.atMs)) { h.hs.goldOut = true; return false; }\n  }\n  return true;', to: '  }\n  return true;' },
  { arm: 'QUIVER', name: 'the free rung is spent like a paid one', file: 'src/core/hunt/abilities.js',
    from: "    if (l.source === 'own' && ammoPerShot(itemRow(h, l.id)) === 0) return true;\n", to: '' },
  { arm: 'QUIVER', name: 'a ranged basic swings without a shot', file: 'src/core/hunt/damage.js',
    from: '    if (shot.pick.ammo !== null && !payBasic(inst, u, { ammo: shot.pick.ammo }, sc)) continue;', to: '' },
  { arm: 'QUIVER', name: '[C2 skipFoodDebit] a carried use is not debited', file: 'src/core/action-rules.js',
    from: '  l.left = int(l.left, 0) - 1;', to: '  l.left = int(l.left, 0);' },
  { arm: 'WORLD-BOUND', name: 'the world bound is lifted', file: 'src/data/hunt-tuning.js',
    from: '  worldMaxBytes: 16384,', to: '  worldMaxBytes: 16384000,' },
  { arm: 'FENCE', name: 'the engine prices a hunter on the old path', file: join(FN, 'accrual.js'),
    from: '  if (inp.huntOpen === true) return { accrued: false, reason: SKIP.HUNT_OPEN };', to: '' },
  { arm: 'DEATHXP-RULE', name: 'a fall takes the whole gap, de-levelling', file: 'src/core/action-rules.js',
    from: '  return Math.max(0, Math.min(Math.floor(gap * f), x - floor));', to: '  return Math.max(0, Math.floor(gap * f));' },
  { arm: 'DEATHXP', name: '[C2 a fall costs nothing] a fall prices nothing', file: 'src/core/combat-sim.js',
    from: '  const xpLost = deathXpLoss(m.state.skills, m.style);', to: '  const xpLost = {};' },
  { arm: 'END', name: '[C2 retreatGuard] the falls limit ends nothing', file: 'src/core/action-rules.js',
    from: '  falls: (hs) => int(hs.falls, 0) >= int(hs.fallsLimit, SESSION_LIMITS.falls.default),', to: '  falls: () => false,' },
  { arm: 'END', name: '[C2 dry heal line] a dry essential heal line under end ends nothing', file: 'src/core/action-rules.js',
    from: "  heals_out: (hs) => essentialOut(hs, 'heal'),", to: '  heals_out: () => false,' },
  { arm: 'TICK-1', name: '[combat-parity relabelSeed] each window re-labels its swings from zero', file: 'src/core/combat-sim.js',
    from: "rng: createRng(seedOf(ctx, 's', sw))", to: "rng: createRng(seedOf(ctx, 's', swings))" },
  { arm: 'TICK-1', name: '[combat-parity shiftWindow] the member clock is read one second late', file: join(FN, 'hunt-settle.js'),
    from: '    nextSwingAtMs: num(h.next_swing_at_ms),', to: '    nextSwingAtMs: num(h.next_swing_at_ms) + 1000,' },
  { arm: 'TICK-1', name: '[world-tick-parity P5 rewind] the settle re-simulates the last swing', file: join(FN, 'hunt-settle.js'),
    from: '    instance: { id: String(inst.id), nextSwingAtMs: Number(inst.next_swing_at_ms), world: inst.world || null },',
    to: '    instance: { id: String(inst.id), nextSwingAtMs: Number(inst.next_swing_at_ms) - 2000, world: inst.world || null },' },
  { arm: 'TICK-1', name: '[C2 knocked-out foe carried] the world is not carried across a settle', file: join(FN, 'hunt-settle.js'),
    from: '    instance: { id: String(inst.id), nextSwingAtMs: Number(inst.next_swing_at_ms), world: inst.world || null },',
    to: '    instance: { id: String(inst.id), nextSwingAtMs: Number(inst.next_swing_at_ms), world: null },' },
  { arm: 'MAXHP', name: '[maxhp-carry H1] a hitpoints level-up inside the window never raises max HP', file: join(FN, 'accrual.js'),
    from: "if (ev.type === 'levelup' && ev.skill === 'hitpoints' && ev.to > state.playerMaxHp) state.playerMaxHp = ev.to;",
    to: "if (ev.type === 'levelup' && ev.skill === 'hitpoints' && false) state.playerMaxHp = ev.to;" },
  { arm: 'BOTH-PATH', name: '[resume-alignment carrierOneTickLate] the carried recovery line drifts a tick per settle', file: join(FN, 'envelope.js'),
    from: '? (st.recovering_until ? new Date(st.recovering_until).getTime() : 0) : null,',
    to: '? (st.recovering_until ? new Date(st.recovering_until).getTime() + 2000 : 0) : null,' },
  { arm: 'PARITY', name: '[combat-parity wallclock] the tick door ends its window on a wall-clock grid', file: join(FN, 'hunt-settle.js'),
    from: "  const toMs = Number.isFinite(Number(o.atMs)) ? Math.min(nowMs, Math.floor(Number(o.atMs))) : nowMs;",
    to: "  const toMs = Number.isFinite(Number(o.atMs)) ? Math.min(nowMs, Math.floor(Number(o.atMs))) : (mode === 'tick' ? nowMs - (nowMs % 90000) : nowMs);" },
  { arm: 'PARITY', name: '[combat-parity C2 read-dropped] the tick door builds its heroes without their options', file: join(FN, 'hunt-settle.js'),
    from: '    m.hero = heroSetup({ weaponType: m._weaponType, options: m._options, bar: m._bar, partyRoles });',
    to: "    m.hero = heroSetup({ weaponType: m._weaponType, options: mode === 'tick' ? {} : m._options, bar: m._bar, partyRoles });" },
  { arm: 'SETTINGS', name: 'the stored options never reach the unit', file: 'src/core/combat-sim.js',
    from: '    if (s.stance !== undefined) u.stance = s.stance;', to: '' },
  { arm: 'OWN', name: '[probe-bar noAutoEat] the hero never eats', file: 'src/core/combat-sim.js',
    from: '          foodBelowPct: m.hero.foodBelowPct, drinkBelowPct: m.hero.drinkBelowPct };',
    to: '          foodBelowPct: 0, drinkBelowPct: 0 };' },
  { arm: 'ANALYZER', name: 'the analyzer tally is never proposed', file: join(FN, 'accrual.js'),
    from: '      analyzer: analyzerOf(sim, unitIds, summary.unitIdEver) });', to: '      analyzer: null });' },
  { arm: 'SLOT', name: '[edge-tick-gate M17] the settle reads slot 0\'s perks for every slot', file: join(FN, 'hunt-settle.js'),
    from: '  const perks = await readTickPerks(exec, m.user, m.slot);', to: '  const perks = await readTickPerks(exec, m.user, 0);' },
  { arm: 'TICK-0', name: 'the world tick drops its hunt cohort', file: join(FN, 'tick.js'),
    from: '  if (body.hunts.length) {', to: '  if (false) {' },
  { arm: 'BESTIARY', name: '[bestiary-parity] the settle reads hr_bestiary_of and a ladder prices the hunt again', file: join(FN, 'hunt-settle.js'),
    from: '  const perks = await readTickPerks(exec, m.user, m.slot);',
    to: "  const perks = await readTickPerks(exec, m.user, m.slot);\n  const [bk] = await exec(\"select coalesce(sum(value), 0)::bigint as n from public.player_progress where user_id = $1 and slot = $2 and kind = 'stat' and key like 'ev:kill_monster:%'\", [m.user, m.slot]);\n  if (Number(bk && bk.n) > 0) e.skills = { ...e.skills, attack: (Number(e.skills.attack) || 0) * 4 };" },
];

/* DB mutants: planted in a LIVE function body of the booted chain, the arm run, the body restored. */
const AM = 'public.hr_hunt_apply_member(uuid,uuid,integer,uuid,uuid,jsonb,jsonb,jsonb)';
const AI = 'public.hr_hunt_apply_instance(uuid,bigint,jsonb,jsonb,uuid,integer)';
const SS = 'public.hr_hunt_settle_session(uuid,integer,uuid,jsonb)';
const DB_MUTANTS = [
  { arm: 'VALUE', name: 'the gold bound is gone', fn: AM,
    find: "  if jsonb_typeof(p_delta->'gold') = 'number' and (p_delta->>'gold')::numeric > v_kills * v_vb_gold * v_vb_h then", replace: '  if false then' },
  { arm: 'VALUE', name: 'an undroppable item passes the drop bound', fn: AM,
    find: '             select max(coalesce((b.drops->>e.key)::numeric, 0)) from public.hr_hunt_kill_bounds b', replace: '             select 1000000 from public.hr_hunt_kill_bounds b' },
  { arm: 'VALUE', name: '[FRESH respawn x6] the kill bound is lifted', fn: AM,
    find: '  if v_kills > v_kmax then', replace: '  if v_kills > v_kmax * 1000 then' },
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
  { arm: 'STORE', name: '[C2 one gold] the applier prices a use at one gold', fn: AM,
    find: '      v_cost := v_cost + v_n * v_price;', replace: '      v_cost := v_cost + v_n;' },
  { arm: 'STORE', name: 'a store use is not journalled', fn: AM,
    find: "        values (p_user, p_slot, 'hunt', 'supply_buy', -v_cost, -v_units,", replace: "        values (p_user, p_slot, 'hunt', 'supply_bought', -v_cost, -v_units," },
  { arm: 'PARTY', name: 'a settle of some members lands', fn: AI,
    find: "    return jsonb_build_object('ok', false, 'error', 'member_set');", replace: "    null;" },
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
  { arm: 'ANALYZER', name: 'a free character reads the analyzer', fn: 'public.hr_hunt_analyzer(integer,uuid)',
    find: '  if not public.hr_premium_active(v_uid, p_slot, now()) then', replace: '  if false then' },
  { arm: 'DEATHXP', name: 'the applier stops bounding a fall\'s price', fn: AM,
    find: '                  > floor((public.hr_xp_for_level(v_lv + 1) - public.hr_xp_for_level(v_lv)) * v_rate / 1000.0)) then', replace: '                  > 1000000000) then' },
  { arm: 'DEATHXP', name: 'the fall price is never debited', fn: AM,
    find: '      update public.player_skills set xp = xp - v_n where user_id = p_user and slot = p_slot and skill_id = v_k;', replace: '      null;' },
  { arm: 'STAMINA', name: 'the applier stops bounding the pool', fn: AM,
    find: '  if v_e < greatest(0, v_s0 - v_paid) or v_e > greatest(0, v_s0 - v_paid + v_down) or v_e > greatest(v_s0, v_cap) then', replace: '  if v_e < 0 then' },
  { arm: 'VALUE', name: 'a stamina end is proven on any pool', fn: SS,
    find: "                                     where ps.user_id = p_user and ps.slot = p_slot), 1) <= 0", replace: "                                     where ps.user_id = p_user and ps.slot = p_slot), 1) >= 0" },
  { arm: 'STAMINA', name: 'the premium cap is everyone\'s', fn: 'public.hr_stamina_cap(uuid,integer,timestamp with time zone)',
    find: "               then public.hr_hunt_limit('stamina_premium_min') else public.hr_hunt_limit('stamina_free_min') end)::bigint * 60000",
    replace: "               then public.hr_hunt_limit('stamina_premium_min') else public.hr_hunt_limit('stamina_premium_min') end)::bigint * 60000" },
  { arm: 'RESUME', name: 'an automatic end resumes nothing', fn: AM,
    find: '    if v_ok then\n      update public.player_state', replace: '    if false then\n      update public.player_state' },
  { arm: 'VALUE', name: 'a heals_out end is proven on a full bag', fn: SS,
    find: "      when 'heals_out' then not exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id",
    replace: "      when 'heals_out' then true or not exists (select 1 from public.hunt_bag b join public.hr_hunt_supplies p on p.item_id = b.item_id" },
  { arm: 'XPDOOR', name: "[combat-xp-settle-split] a hunter's client credit pays beside the settle again", fn: 'public.hr_credit_combat_xp(integer,jsonb,text)',
    find: '    case when public.hr_hunt_open_of(auth.uid(), coalesce(p_slot, 0)) is not null', replace: '    case when false' },
  { arm: 'TICK-0', name: 'the cron queues its hunts body with no selectors', fn: 'public.hr_tick_cron_run()',
    find: "'hunts', v_hunts)::text);", replace: "'hunts', '[]'::jsonb)::text);" },
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
export const HARNESS = Object.freeze({ ROOT, UIDS, STRONG, loadEdge, pinDice, hunter, character, settleTo, run, ticksOf,
  one, q, inTx, makeExec, groundsOf });

if (isMain(import.meta.url)) main();
