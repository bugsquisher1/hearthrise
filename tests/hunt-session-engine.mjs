#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/hunt-session-engine.mjs — THE HUNT SESSION ENGINE'S PARITY GUARDS
// (ruling HR-2026-10-14 §4; lane E).
//
//   node tests/hunt-session-engine.mjs           run every arm
//   node tests/hunt-session-engine.mjs --mutate  plant each defect in a temp
//                                                copy of src/core + src/data and
//                                                prove its arm goes red
//
// Arms:
//   TICK-1       N ten-second windows == one N x 10 s span, byte for byte, on
//                the session (bag, tally, cooldowns, clock), the state, the
//                events and the ledger-shaped fx stream. Two fixtures: a fed
//                melee hunt with falls and knock-outs, and a ranged hunt that
//                spends arrows and fires a Feast.
//   BOTH-PATH    the ATTENDED shape (settles at irregular instants, as
//                hr_hunt_use presses cut them) and the AWAY shape (only the
//                10 s world tick) write identical rows through a fall and a
//                knock-out (§4 "a death with a client connected…", CLAUDE.md §4).
//   TICK-MANUAL  a manual press equals the matching rule, including a press
//                that lands inside a running cooldown.
//   BAG          loaded = used + left on every line, `used` counted from the
//                swings' own outcomes, not from the tally that is being checked.
//   HEAL         "*heal" is the cheapest heal that covers the missing HP, else
//                the largest (Cooked Panther Meat vs Swordfish Steak).
//   END          the end checks run in END_ORDER and `endedAtMs` is the boundary.
//   BUFF         the engine's buff segment rule reproduces the SQL's worked
//                examples (2026-09-13-buff-segments.sql).
//   PULL         the spawn cycle (Security design review 2026-10-14 item 1):
//                every 10 s window's kills are EXACTLY pull_left_old + P x the
//                pulls it started - pull_left_new, those pulls fit the respawns
//                the window admits after respawn_at_old (no "+1"), and the
//                stored pair only moves forward — the identity
//                hr_hunt_apply re-proves; the fixture must wait on a respawn.
// ════════════════════════════════════════════════════════════════════════

import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
/* THE SEEDER IS THE EDGE'S (lane C2): HMAC-SHA256 keyed by the session's 64-bit
   secret, injected as ctx.swingSeed — the engine has no seed of its own. Taken
   from the REPO, never from a mutant's temp copy of src/core: the mutants plant
   defects in the engine, and the seeder is not the engine. */
const { swingSeederFor } = await import(pathToFileURL(join(ROOT, 'supabase', 'functions', 'hr-accrue', 'hunt-seed.js')).href);
const seederOf = (seed, sid) => swingSeederFor(String(BigInt(seed)), sid);

async function load(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  return {
    cs: await import(u('src/core/combat-sim.js')),
    AR: await import(u('src/core/action-rules.js')),
    BF: await import(u('src/core/buffs.js')),
    MONSTERS: (await import(u('src/data/monsters.js'))).MONSTERS,
    ITEMS: (await import(u('src/data/items.js'))).ITEMS,
    HUNTS: (await import(u('src/data/hunts.js'))).HUNT_INDEX,
    RS: await import(u('src/data/rule-subjects.js')),
    HSD: await import(u('src/data/hunt-sessions.js')),
    SUPPLIES: (await import(u('src/data/supplies.js'))).SUPPLIES,
    C: await import(u('src/core/combat.js')),
    SB: await import(u('src/data/supply-basics.js')),
  };
}

const T0 = Date.UTC(2026, 9, 14, 23, 50, 0);   // crosses UTC midnight inside the span
const WIN = 10000;

/* A ledger-shaped fx sink: every value movement, in order. */
function sink() {
  const rows = [];
  return {
    rows,
    fx: {
      addXp: (skill, n) => rows.push(['xp', skill, n]),
      addItem: (id, n) => rows.push(['item', id, n]),
      onLoot: (gp) => rows.push(['gold', gp]),
    },
  };
}

function melee(M, seed) {
  const hs = M.AR.newHuntSession({
    id: 'sess-melee', huntFromMs: T0 + 20000,
    bag: { cooked_shrimp: { loaded: 40 }, cooked_trout: { loaded: 6 } },
    slots: M.RS.DEFAULT_PRESET.slots, fallsLimit: 6,
    /* A two-foe pull that is back 5 s after it started: a fed hero clears it
       sooner, so the fixture waits on respawns across window cuts. */
    pull: { size: 2, respawnMs: 5000, left: 0, respawnAtMs: T0 + 20000 },
  });
  const state = { activeMonster: 'rat', playerHp: 12, playerMaxHp: 12, huntSession: hs, stats: {},
    deathsTodayBefore: 1, deathsLifetimeBefore: 9, inventory: {} };
  const ctx = { tickMs: 2400, swingSeed: seederOf(seed, hs.id), monsters: M.MONSTERS, items: M.ITEMS, hunt: M.HUNTS.mill_cellar,
    bonus: () => 0, weakness: () => ({ dropMult: 1 }),
    playerRolls: () => ({ accuracy: 0.55, maxHit: 3, critChance: 0.05 }),
    monsterRolls: () => ({ accuracy: 0.7, maxHit: 7 }) };
  return { state, ctx, spanMs: 2 * 3600000 };
}

function ranged(M, seed) {
  const hs = M.AR.newHuntSession({
    id: 'sess-ranged', huntFromMs: T0,
    bag: { iron_arrows: { loaded: 400 }, cooked_trout: { loaded: 30 }, hunters_feast: { loaded: 3 } },
    slots: [
      M.RS.DEFAULT_PRESET.slots[0],
      { item: 'hunters_feast', on: true, conditions: [{ subject: 'buff_missing:drop_rate', op: '<=', value: 0 }] },
    ],
  });
  const state = { activeMonster: 'rat', playerHp: 30, playerMaxHp: 30, huntSession: hs, stats: {}, inventory: {},
    equipment: { weapon: 'shortbow', ammo: 'iron_arrows' }, buffs: [] };
  const ctx = { tickMs: 2200, swingSeed: seederOf(seed, hs.id), monsters: M.MONSTERS, items: M.ITEMS, hunt: M.HUNTS.mill_cellar,
    weaponType: 'ranged', bonus: () => 0, weakness: () => ({ dropMult: 1 }),
    playerRolls: () => ({ accuracy: 0.7, maxHit: 4, critChance: 0.05 }),
    monsterRolls: () => ({ accuracy: 0.5, maxHit: 3 }) };
  return { state, ctx, spanMs: 3600000 };
}

/* Run a fixture over [T0, T0 + spanMs) cut at the given instants. */
function run(M, fixture, cuts) {
  const { state, ctx, spanMs } = fixture;
  const s = sink();
  const events = [];
  const sums = { kills: 0, foodEaten: 0, deaths: 0, consumed: {} };
  const edges = [T0, ...cuts.filter((c) => c > T0 && c < T0 + spanMs), T0 + spanMs];
  for (let i = 1; i < edges.length; i++) {
    const r = M.cs.simulateSpan(state, Object.assign({}, ctx, { fromMs: edges[i - 1], toMs: edges[i], fx: s.fx }));
    events.push(...r.huntEvents);
    sums.kills += r.kills; sums.foodEaten += r.foodEaten; sums.deaths += r.deaths;
    for (const [k, v] of Object.entries(r.consumed)) sums.consumed[k] = (sums.consumed[k] || 0) + v;
  }
  return { out: canon({ state, events, ledger: s.rows }), state, events, sums, ledger: s.rows };
}

const ticks = (spanMs) => Array.from({ length: Math.ceil(spanMs / WIN) }, (_, i) => T0 + i * WIN);

/* Key order is not a property of the rows the tick writes (they are columns),
   so the comparison is over a canonical form: sorted keys, same values. */
function canon(v) {
  if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}';
  return JSON.stringify(v);
}

function firstDiff(a, b) {
  let i = 0; while (i < a.length && a[i] === b[i]) i++;
  return `at char ${i}: …${a.slice(Math.max(0, i - 60), i + 60)}… vs …${b.slice(Math.max(0, i - 60), i + 60)}…`;
}

const ARMS = {
  'TICK-1': (M) => {
    for (const make of [melee, ranged]) {
      const one = run(M, make(M, '0x5eed'), []);
      const many = run(M, make(M, '0x5eed'), ticks(make(M, '0x5eed').spanMs));
      if (one.out !== many.out) return `${make.name}: 10 s ticks differ from one span ${firstDiff(one.out, many.out)}`;
      if (make === melee && !(one.sums.deaths > 0)) return 'melee fixture never fell — it cannot prove the knock-out splits';
      if (make === ranged && !(one.sums.consumed.iron_arrows > 0 && one.state.huntSession.tally.supplies.hunters_feast > 0)) {
        return 'ranged fixture spent no arrows or no Feast — it cannot prove the quiver or the buff splits';
      }
    }
    return null;
  },
  'BOTH-PATH': (M) => {
    const span = melee(M, '0x5eed').spanMs;
    let x = 0x2545f491;
    const irregular = [];
    for (let t = T0; t < T0 + span;) {
      x = (Math.imul(x ^ (x >>> 13), 0x5bd1e995) >>> 0);
      t += 300 + (x % 47000);
      irregular.push(t);
    }
    const attended = run(M, melee(M, '0x5eed'), irregular);
    const away = run(M, melee(M, '0x5eed'), ticks(span));
    if (!(away.sums.deaths > 0 && away.state.huntSession.tally.downMs > 0)) return `no fall with a knock-out in the fixture (falls ${away.sums.deaths}, down ${away.state.huntSession.tally.downMs} ms)`;
    if (attended.out !== away.out) return `attended settles wrote different rows ${firstDiff(attended.out, away.out)}`;
    return null;
  },
  'TICK-MANUAL': (M) => {
    /* A Feast fires by rule at the first boundary past minute 1 and starts the
       1 s buff cooldown. Path A then PRESSES a Moonbloom Elixir at the very next
       boundary — inside that cooldown. Path B has a rule that fires the elixir
       once, from that same boundary. The press must wait the cooldown exactly
       as the rule does. */
    const feast = { item: 'hunters_feast', on: true, conditions: [
      { subject: 'session_minutes', op: '>=', value: 1 }, { subject: 'bag_left:hunters_feast', op: '>=', value: 2 }] };
    const mk = (slots) => {
      const f = ranged(M, '0x9e55');
      f.ctx.tickMs = 600;
      f.state.huntSession = M.AR.newHuntSession({ id: 'sess-press', huntFromMs: T0,
        bag: { cooked_trout: { loaded: 20 }, hunters_feast: { loaded: 2 }, moonbloom_elixir: { loaded: 1 } }, slots });
      return f;
    };
    const A = mk([feast, { item: 'moonbloom_elixir', on: false, conditions: [] }]);
    const B = mk([feast, { item: 'moonbloom_elixir', on: true, conditions: [
      { subject: 'bag_left:hunters_feast', op: '<=', value: 1 }, { subject: 'bag_left:moonbloom_elixir', op: '>=', value: 1 }] }]);
    const sA = sink(); const sB = sink();
    let at = T0;
    const step = (f, s, to) => M.cs.simulateSpan(f.state, Object.assign({}, f.ctx, { fromMs: at, toMs: to, fx: s.fx }));
    while (at < T0 + 5 * 60000) {
      const to = at + 600;
      if (A.state.huntSession.tally.supplies.hunters_feast === 1 && !A._pressed) {
        A.state.huntSession.presses.push(1);
        A._pressed = true;
      }
      step(A, sA, to); step(B, sB, to);
      at = to;
    }
    const strip = (f) => Object.assign({}, f.state, { huntSession: Object.assign({}, f.state.huntSession, { slots: null }) });
    const ja = canon([strip(A), sA.rows]); const jb = canon([strip(B), sB.rows]);
    if (!A._pressed || A.state.huntSession.tally.supplies.moonbloom_elixir !== 1) return 'the press never fired';
    if (ja !== jb) return `a press differs from its matching rule ${firstDiff(ja, jb)}`;
    return null;
  },
  BAG: (M) => {
    for (const make of [melee, ranged]) {
      const r = run(M, make(M, '0xba9'), ticks(make(M, '0xba9').spanMs));
      const hs = r.state.huntSession;
      const heals = Object.keys(hs.bag).filter((id) => M.SUPPLIES[id].kind === 'heal');
      const usedHeals = heals.reduce((a, id) => a + (hs.bag[id].loaded - hs.bag[id].left), 0);
      if (usedHeals !== r.sums.foodEaten) return `${make.name}: ${r.sums.foodEaten} heals eaten, ${usedHeals} left the bag`;
      for (const [id, line] of Object.entries(hs.bag)) {
        const used = hs.tally.supplies[id] || 0;
        if (line.loaded !== used + line.left || line.left < 0) return `${make.name}: ${id} loaded ${line.loaded} != used ${used} + left ${line.left}`;
      }
      const arrows = (hs.bag.iron_arrows ? hs.bag.iron_arrows.loaded - hs.bag.iron_arrows.left : 0);
      if (arrows !== (r.sums.consumed.iron_arrows || 0)) return `${make.name}: ${r.sums.consumed.iron_arrows} arrows loosed, ${arrows} left the bag`;
    }
    return null;
  },
  HEAL: (M) => {
    const hs = { bag: { cooked_panther_meat: { left: 5 }, cooked_swordfish: { left: 5 } } };
    const got = [M.AR.pickHeal(hs, 5), M.AR.pickHeal(hs, 30), M.AR.pickHeal(hs, 60), M.AR.pickHeal(hs, 0)];
    const want = ['cooked_panther_meat', 'cooked_swordfish', 'cooked_swordfish', null];
    return JSON.stringify(got) === JSON.stringify(want) ? null : `pickHeal gave ${JSON.stringify(got)}, want ${JSON.stringify(want)}`;
  },
  END: (M) => {
    const order = M.HSD.END_ORDER;
    const base = () => M.AR.newHuntSession({ id: 'e', huntFromMs: 0,
      bag: { cooked_shrimp: { loaded: 1 }, iron_arrows: { loaded: 1 } }, hoursLimit: 1 });
    const make = {
      falls: (h) => { h.falls = h.fallsLimit; }, heals_out: (h) => { h.bag.cooked_shrimp.left = 0; },
      ammo_out: (h) => { h.bag.iron_arrows.left = 0; }, gold_out: (h) => { h.goldOut = true; },
      stamina: (h) => { h.staminaMs = 0; },
      hours: () => {}, left: (h) => { h.leaveAtMs = 0; }, changed: (h) => { h.changeAtMs = 0; },
      server: (h) => { h.stopAtMs = 0; },
    };
    for (let i = 0; i < order.length; i++) {
      const h = base();
      for (let j = i; j < order.length; j++) make[order[j]](h);
      const atMs = i <= order.indexOf('hours') ? 3600000 : 0;
      const got = M.AR.endReasonAt(h, atMs);
      if (got !== order[i]) return `with ${order.slice(i).join('+')} true the hunt ended on ${got}, want ${order[i]}`;
    }
    const f = melee(M, '0xe0d');
    /* Early in the hunt: three falls end every hunt now (master plan row 16), so
       a late leave could be overtaken by them. */
    f.state.huntSession.leaveAtMs = T0 + 60000;
    const r = M.cs.simulateSpan(f.state, Object.assign({}, f.ctx, { fromMs: T0, toMs: T0 + 3600000 }));
    const hs = f.state.huntSession;
    if (!r.huntEnded || r.huntEnded.reason !== 'left') return 'leaving did not end the hunt';
    if (hs.endedAtMs < T0 + 60000 || hs.endedAtMs >= T0 + 60000 + f.ctx.tickMs) return `ended_at ${hs.endedAtMs - T0} is not the first boundary at/after the leave`;
    if (hs.nextSwingAtMs !== hs.endedAtMs) return 'a swing ran after the hunt ended';
    return null;
  },
  PULL: (M) => {
    const f = melee(M, '0x9011');
    /* A strong hero: two rats fall well inside the 5 s respawn, so it waits. */
    f.ctx.playerRolls = () => ({ accuracy: 0.95, maxHit: 12, critChance: 0.05 });
    const hs = f.state.huntSession;
    const P = hs.pull.size; const R = hs.pull.respawnMs;
    let waited = 0; let pulls = 0;
    for (let at = T0; at < T0 + f.spanMs; at += WIN) {
      const left0 = hs.pull.left; const r0 = hs.pull.respawnAtMs; const n0 = hs.pull.pulls;
      const r = M.cs.simulateSpan(f.state, Object.assign({}, f.ctx, { fromMs: at, toMs: at + WIN }));
      const n = hs.pull.pulls - n0; const left1 = hs.pull.left; const r1 = hs.pull.respawnAtMs;
      const to = at + WIN;
      const nmax = r0 < to ? Math.floor((to - 1 - r0) / R) + 1 : 0;
      if (r.kills !== left0 + n * P - left1) return `window at +${at - T0} ms: ${r.kills} kills, the cycle says ${left0} + ${n} x ${P} - ${left1}`;
      if (n > nmax) return `window at +${at - T0} ms started ${n} pulls, the respawn admits ${nmax}`;
      if (left1 < 0 || left1 > (n > 0 ? P : left0)) return `window at +${at - T0} ms left ${left1} standing`;
      if (n === 0 ? r1 !== r0 : (r1 < r0 + n * R || r1 >= to + R)) return `window at +${at - T0} ms moved respawn_at ${r0} -> ${r1} on ${n} pulls`;
      pulls += n;
      if (hs.endedReason) break;
    }
    waited = Number(hs.tally.waitMs) || 0;
    if (!(waited > 0 && pulls > 2)) return `the fixture never waited on a respawn (wait ${waited} ms, ${pulls} pulls)`;
    return null;
  },
  BUFF: (M) => {
    const q = [];
    const ap = (type, magnitude, mins, atMs = 0) => M.BF.applyBuffSegment(q, { type, magnitude, durationMs: mins * 60000 }, { atMs });
    ap('drop_rate', 5, 8); ap('drop_rate', 2, 3);
    const a = q.map((b) => [b.magnitude, b.remainingMs, b.delayMs || 0]);
    if (JSON.stringify(a) !== JSON.stringify([[5, 480000, 0], [2, 660000, 480000]])) return `elixir then trout: ${JSON.stringify(a)}`;
    q.length = 0; ap('drop_rate', 2, 3); ap('drop_rate', 5, 8);
    if (q.length !== 1 || q[0].magnitude !== 5) return `trout then elixir should leave only the elixir: ${JSON.stringify(q)}`;
    q.length = 0; ap('drop_rate', 5, 8); ap('drop_rate', 5, 8);
    if (q.length !== 1 || q[0].remainingMs !== 960000) return `a same-magnitude re-eat must extend one segment: ${JSON.stringify(q)}`;
    q.length = 0; for (let i = 0; i < 4; i++) ap('drop_rate', 5, 15);
    const last = ap('drop_rate', 5, 15);
    if (last.ok || last.why !== 'buff_at_max' || q[0].remainingMs !== 3600000) return `the hour ceiling: ${JSON.stringify(last)} ${JSON.stringify(q)}`;
    return null;
  },
};

/* ── THE THREE COMBAT-BIBLE ARMS (designer review 2026-10-15 §2, K3 / K8 / K9) ── */
/* A ranged fight whose carried arrow line is EMPTY and whose bar names the shop
   shot: the dry-line choice decides whether the store takes over. */
function dryFixture(M, onDry) {
  const SHOT = 'plain_barbed_arrows';
  const hs = M.AR.newHuntSession({
    id: 'sess-dry', huntFromMs: T0, bag: { barbed_arrows: { loaded: 0, essential: true }, cooked_trout: { loaded: 30 } },
    slots: [M.RS.DEFAULT_PRESET.slots[0], { item: SHOT, on: true, conditions: [] }],
    basics: { [SHOT]: { kind: 'ammo', price: 2, heals: 0, mana: 0, partner: 'barbed_arrows' } },
    purse: 100000, onDry,
  });
  const equipment = { weapon: 'shortbow', ammo: 'barbed_arrows' };
  const eq = M.C.equipmentStats(equipment, M.ITEMS);
  const profile = { type: 'ranged', accuracySkill: 'ranged', damageSkill: 'ranged', accuracyBonusField: 'rangeAtkB', strengthBonusField: 'rangeStrB' };
  const skills = { ranged: 50000, hitpoints: 50000, defense: 50000 };
  const shares = [];
  const state = { activeMonster: 'rat', playerHp: 300, playerMaxHp: 300, huntSession: hs, stats: {}, inventory: {},
    equipment, ammoCarry: {}, skills };
  const ctx = { tickMs: 2400, swingSeed: seederOf('0x5eed', hs.id), monsters: M.MONSTERS, items: M.ITEMS, hunt: M.HUNTS.mill_cellar,
    weaponType: 'ranged', bonus: () => 0, weakness: () => ({ dropMult: 1 }),
    playerRolls: (m, o) => { shares.push(o && o.ammoShare); return M.C.playerCombatRolls(m, { eq, equipment, items: M.ITEMS, skills, profile, ammoShare: o && o.ammoShare }); },
    monsterRolls: () => ({ accuracy: 0, maxHit: 0 }), fromMs: T0, toMs: T0 + 600000 };
  const r = M.cs.simulateSpan(state, ctx);
  return { r, hs, shares };
}

const BIBLE_ARMS = {
  /* K3: ONE consumable lane. A heal and a buff food both want to fire on the
     same boundary; one lane admits ONE of them. */
  LANE: (M) => {
    const hs = M.AR.newHuntSession({ id: 'sess-lane', huntFromMs: T0,
      bag: { cooked_shrimp: { loaded: 5 }, hunters_feast: { loaded: 2 } },
      slots: [{ item: '*heal', on: true, conditions: [{ subject: 'self_hp_pct', op: '<=', value: 99 }] },
        { item: 'hunters_feast', on: true, conditions: [{ subject: 'buff_missing:drop_rate', op: '<=', value: 0 }] }] });
    const d = M.AR.fireRules({ hs, hp: 5, maxHp: 10, mana: 0, maxMana: 0, buffs: [], atMs: T0 });
    if (d.uses.length !== 1 || d.uses[0].lane !== 'consumable') return `a heal and a buff food fired ${JSON.stringify(d.uses)} on one boundary — not ONE consumable lane`;
    if (JSON.stringify(Object.keys(hs.cooldowns)) !== '["consumable"]') return `the session keeps cooldown keys ${JSON.stringify(Object.keys(hs.cooldowns))}`;
    return null;
  },
  /* K8: the store takes over a dry carried line ONLY on the player's choice. */
  DRY: (M) => {
    const end = dryFixture(M, 'end');
    const store = dryFixture(M, 'store');
    const deflt = dryFixture(M, undefined);
    if (end.hs.endedReason !== 'ammo_out' || Object.keys(end.hs.tally.bought || {}).length) {
      return `onDry 'end': the dry arrow line ended '${end.hs.endedReason}' and bought ${JSON.stringify(end.hs.tally.bought)} — the store took over silently`;
    }
    if (deflt.hs.onDry !== 'end' || deflt.hs.endedReason !== 'ammo_out') return `no choice reads '${deflt.hs.onDry}' and ended '${deflt.hs.endedReason}' — the default must be 'end'`;
    if (!((store.hs.tally.bought || {}).plain_barbed_arrows > 0) || store.hs.endedReason === 'ammo_out') {
      return `onDry 'store': bought ${JSON.stringify(store.hs.tally.bought)}, ended '${store.hs.endedReason}' — the chosen store did not take over`;
    }
    return null;
  },
  /* K9: a shop shot fires at BASIC_EFFECT_SHARE of its crafted partner. */
  SHOPSHOT: (M) => {
    const store = dryFixture(M, 'store');
    const share = M.SB.BASIC_EFFECT_SHARE;
    if (!(share === 0.75)) return `BASIC_EFFECT_SHARE is ${share}, not the ruled 0.75`;
    if (!store.shares.length || !store.shares.every((x) => x === share)) return `shop swings handed the rolls ammoShare ${JSON.stringify([...new Set(store.shares)])}, want ${share} on every one`;
    const m = M.MONSTERS.rat;
    /* The strongest arrow, so three quarters of its bonus is a whole-hit step. */
    const arrow = Object.keys(M.ITEMS).filter((id) => M.ITEMS[id].slot === 'ammo' && M.ITEMS[id].rangeStrB)
      .sort((x, y) => M.ITEMS[y].rangeStrB - M.ITEMS[x].rangeStrB)[0];
    const equipment = { weapon: 'shortbow', ammo: arrow };
    const profile = { type: 'ranged', accuracySkill: 'ranged', damageSkill: 'ranged', accuracyBonusField: 'rangeAtkB', strengthBonusField: 'rangeStrB' };
    const skills = { ranged: 0 };
    const full = M.C.playerCombatRolls(m, { equipment, items: M.ITEMS, skills, profile });
    const shop = M.C.playerCombatRolls(m, { equipment, items: M.ITEMS, skills, profile, ammoShare: share });
    const none = M.C.playerCombatRolls(m, { equipment: { weapon: 'shortbow' }, items: M.ITEMS, skills, profile });
    if (!(shop.maxHit < full.maxHit && shop.maxHit > none.maxHit)) return `a shop ${arrow} max hit ${shop.maxHit} is not between no ammo ${none.maxHit} and the crafted arrow ${full.maxHit}`;
    return null;
  },
};

async function runArms(root) {
  const M = await load(root);
  const out = {};
  for (const [name, arm] of Object.entries({ ...ARMS, ...BIBLE_ARMS })) {
    try { out[name] = arm(M); } catch (e) { out[name] = 'threw: ' + (e && e.stack || e); }
  }
  return out;
}

/* Each mutant names the arm that must go red. */
const MUTANTS = [
  { arm: 'TICK-1', name: 'the swing seed is indexed per window', file: 'src/core/combat-sim.js',
    from: 'createRng(swingSeedOf(ctx, swing))', to: 'createRng(swingSeedOf(ctx, ticks))' },
  { arm: 'TICK-1', name: 'the cooldown is stamped from the window start', file: 'src/core/action-rules.js',
    from: 'hs.cooldowns[u.lane] = atMs + COOLDOWN_LANES', to: 'hs.cooldowns[u.lane] = (Number(ctx.fromMs) || 0) + COOLDOWN_LANES' },
  { arm: 'BOTH-PATH', name: 'the knock-out clock is not carried across a settle', file: 'src/core/combat-sim.js',
    from: 'state.recoveringUntilMs = (!hs.endedReason && recoverUntilMs > toMs) ? recoverUntilMs : 0;', to: 'state.recoveringUntilMs = 0;' },
  { arm: 'TICK-MANUAL', name: 'a press skips the cooldown', file: 'src/core/action-rules.js',
    from: 'if (!ready(r)) { out.keep.push(entry); continue; }', to: 'if (used.has(laneOf(r))) { out.keep.push(entry); continue; }' },
  { arm: 'BAG', name: 'a heal is eaten without leaving the bag', file: 'src/core/action-rules.js',
    from: '    if (!u.buy) spendFromBag(hs, u.id, 1, atMs);', to: "    if (!u.buy && u.kind !== 'heal') spendFromBag(hs, u.id, 1, atMs);" },
  { arm: 'HEAL', name: '*heal is plain cheapest-first', file: 'src/core/action-rules.js',
    from: 'if (heals >= need && rank < coverRank)', to: 'if (rank < coverRank)' },
  { arm: 'END', name: 'the end checks run in reverse', file: 'src/core/action-rules.js',
    from: 'for (const k of END_ORDER) if (END_CHECKS[k](hs, atMs)) return k;', to: 'for (const k of END_ORDER.slice().reverse()) if (END_CHECKS[k](hs, atMs)) return k;' },
  { arm: 'PULL', name: 'a cleared pull is back at once', file: 'src/core/combat-sim.js',
    from: '      if (atMs < pl.respawnAtMs) {', to: '      if (false) {' },
  { arm: 'PULL', name: 'a respawn is timed from the kill, not the pull', file: 'src/core/combat-sim.js',
    from: '    if (r.outcome === OUTCOME.KILL) { kills++; hs.tally.kills++; pl.left--; }',
    to: '    if (r.outcome === OUTCOME.KILL) { kills++; hs.tally.kills++; pl.left--; if (pl.left <= 0) { pl.respawnAtMs = atMs + pl.respawnMs + 1; pl.pulls++; pl.left = pl.size; } }' },
  { arm: 'LANE', name: 'a heal and a buff food each keep their own lane', file: 'src/core/action-rules.js',
    from: '    if (!r.id || !ready(r)) continue;\n    used.add(laneOf(r));', to: '    if (!r.id || !ready(r)) continue;\n    used.add(r.kind);' },
  { arm: 'DRY', name: 'the store takes over a dry line whatever the player chose', file: 'src/core/action-rules.js',
    from: "  if (!hs || hs.onDry !== 'store') return null;\n", to: '  if (!hs) return null;\n' },
  { arm: 'SHOPSHOT', name: 'a shop shot hits like its crafted partner', file: 'src/core/combat-sim.js',
    from: 'supply && supply.shop ? { ammoShare: BASIC_EFFECT_SHARE } : undefined', to: 'undefined' },
  { arm: 'BUFF', name: 'a weaker buff is never dropped', file: 'src/core/buffs.js',
    from: '(Number(s.magnitude) < mag && s.remainingMs <= end)', to: 'false' },
];

async function main() {
  if (process.argv.includes('--mutate')) {
    let bad = 0;
    for (const m of MUTANTS) {
      const dir = mkdtempSync(join(tmpdir(), 'hr-hse-'));
      try {
        cpSync(join(ROOT, 'src', 'core'), join(dir, 'src', 'core'), { recursive: true });
        cpSync(join(ROOT, 'src', 'data'), join(dir, 'src', 'data'), { recursive: true });
        const p = join(dir, m.file);
        const src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
        if (src.split(m.from).length !== 2) { console.error(`✗ mutant "${m.name}": marker not found exactly once in ${m.file}`); bad++; continue; }
        writeFileSync(p, src.replace(m.from, m.to));
        const res = await runArms(dir);
        if (res[m.arm]) console.log(`✓ ${m.arm} goes red on: ${m.name}`);
        else { console.error(`✗ ${m.arm} stayed GREEN on: ${m.name}`); bad++; }
      } finally { rmSync(dir, { recursive: true, force: true }); }
    }
    console.log(bad ? `hunt-session-engine --mutate: ${bad} mutant(s) survived` : `hunt-session-engine --mutate: all ${MUTANTS.length} mutants killed`);
    process.exit(bad ? 1 : 0);
  }
  const res = await runArms(ROOT);
  let bad = 0;
  for (const [name, err] of Object.entries(res)) {
    if (err) { console.error(`✗ ${name}: ${err}`); bad++; } else console.log(`✓ ${name}`);
  }
  console.log(bad ? `hunt-session-engine: ${bad} arm(s) red` : `hunt-session-engine: all ${Object.keys(res).length} arms green`);
  process.exit(bad ? 1 : 0);
}

main();
