#!/usr/bin/env node
// mutant-rule-functions: pure
// ════════════════════════════════════════════════════════════════════════
// tests/personal-loot-play.mjs — PERSONAL LOOT IN THE ENGINE: WHO TOOK PART, EACH ROLLER'S OWN ROLL, BOTH PATHS (backend, lane/p1-personal-loot,
// 2026-11-27; 20-v030-the-roads.md section 4 P1, 21-flame-temper-imbue-loot.md section 4; src/core/hunt/took-part.js, src/core/hunt-rewards.js
// payPersonal, src/core/drops.js effectiveDropChance `share`). The server half (the frozen rule, both doors through the real commit) is
// tests/personal-loot-db.mjs.
//
//   node tests/personal-loot-play.mjs            the rules
//   node tests/personal-loot-play.mjs --mutate   every planted defect must turn a rule RED
//
// ci-step: economy-selftests | Personal loot in the engine (who took part, each roller's own roll at ch / n, both paths)
// ci-run: node tests/personal-loot-play.mjs
// ci-run: node tools/mutant-gate.mjs node tests/personal-loot-play.mjs --mutate
//
// mutant-anchors: src/core/hunt/took-part.js src/core/hunt-rewards.js src/core/drops.js src/core/combat-sim.js src/core/hunt/world-state.js
// mutant-writes-tree: no — every mutant is planted into a temp copy of src and the edge (tests/_pure-guard.mjs planted)
//
//   PLP-1  WHO TOOK PART (took-part.js): a blow struck at a monster (landed or missed) or a heal or shield given a hero marks the hero; a
//          meal, a heal of nothing, a monster's act and a blow at a hero do not; a `pull` clears every mark; a kill's rollers are the living
//          heroes at it that hold a mark, or all of them when none does
//   PLP-2  THE ROLL (hunt-rewards.js rewardSwing, personal): only the kill's rollers roll, each on ITS OWN loot stream (never the swing's `r`,
//          which draws only the coin), each row at 1 / (the rollers) of the chance on its OWN odds (its weakness), and what a roller finds is
//          in its own bag alone; a pull's mark carries into a later swing and a new pull clears it; no rare roll is drawn and the rotation is
//          never touched. CONTROL: the party roll (personal off) still draws its table on `r`
//   PLP-3  NO FLOOD (drops.js `share`): n rollers' chances on a row sum to the row's whole chance after every multiplier and the cap, a
//          guarantee's too, and a share of 1 is the row's chance to the bit
//   PLP-4  BOTH PATHS (the real settle, accrual.js accrueHunt): a four on Muster Barrows on Steady with personal loot, settled as the closed
//          tick cuts it (one 10-minute window) and as a watched hunt does (twenty 30-second windows), stores the SAME bag for every seat
//          and the same world, every seat finds something, and no rare roll is drawn; the same hunt with the rule off stores other bags
//          (CONTROL: the switch moves the loot); on both doors every guaranteed item's units over every seat equal the party's kills of
//          the monsters carrying it (S-31's exact bound)
//   PLP-5  A GUARANTEE IS DEALT (12-targets 8.11 item 2): over 1,000 kills of a four, each ch 1 row lands exactly once a kill on its dealt
//          seat (roller (monster unit + swing + j) mod n), a kill's two guarantees on two seats, every seat holds 20 to 30% of each, a
//          dealt Trophy earns its moment, a roller's stream draws only for its rows under 1, a guarantee goes only to the kill's rollers,
//          and a table of guarantees alone seeds no stream
// ════════════════════════════════════════════════════════════════════════
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { runPureGuard } from './_pure-guard.mjs';

const MUSTER = 'muster_barrows';
const FOUR = ['tank', 'healer', 'ranger', 'mage'];
const SPAN = 600000;

/* a seeded stream that records every chance asked of it (the rewards' dice: chance, int, next) */
function spy(name, log, seed = 1) {
  let a = seed >>> 0;
  const next = () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return { next: () => { log.push([name, 'next']); return next(); }, chance: (p) => { log.push([name, 'chance', p]); return next() < p; },
    int: (lo, hi) => { log.push([name, 'int']); return lo + Math.floor(next() * (hi - lo + 1)); } };
}

async function pure(base) {
  const imp = (p) => import(pathToFileURL(join(base, p)).href + '?t=' + Date.now());
  const [TP, RW, D] = await Promise.all([imp('src/core/hunt/took-part.js'), imp('src/core/hunt-rewards.js'), imp('src/core/drops.js')]);
  const out = [];

  /* PLP-1 */
  {
    const units = [{ id: 1, side: 'hero', alive: true, took: false }, { id: 2, side: 'hero', alive: true, took: false }, { id: 3, side: 'hero', alive: true, took: false },
      { id: 9, side: 'mon', kind: 'm', alive: true }];
    const world = { units };
    const unitOf = (id) => units.find((u) => u.id === id) || null;
    const members = new Map([[1, {}], [2, {}], [3, {}]]);
    const marks = () => units.filter((u) => u.side === 'hero').map((u) => (u.took ? 1 : 0)).join('');
    const feed = (evs) => { for (const ev of evs) TP.noteTookPart(ev, members, unitOf, world); return marks(); };
    if (feed([{ type: 'heal', u: 2, t: 2, amount: 40, item: 'cooked_shrimp' }, { type: 'heal', u: 3, t: 1, amount: 0 }, { type: 'dmg', u: 9, t: 1, amount: 5 },
      { type: 'dmg', u: 1, t: 2, amount: 5 }, { type: 'kill', u: 1, t: 9 }]) !== '000') out.push('PLP-1 a meal, a heal of nothing, a monster\'s blow or a blow at a hero marked ' + marks());
    if (feed([{ type: 'miss', u: 1, t: 9 }]) !== '100') out.push('PLP-1 a missed blow at a monster did not mark its striker: ' + marks());
    if (feed([{ type: 'heal', u: 2, t: 1, amount: 12, ability: 'mend' }]) !== '110') out.push('PLP-1 a heal given a hero did not mark the healer: ' + marks());
    if (feed([{ type: 'shield', u: 3, t: 1, amount: 30 }]) !== '111') out.push('PLP-1 a shield given a hero did not mark its caster: ' + marks());
    if (feed([{ type: 'pull', pocket: 0 }]) !== '000') out.push('PLP-1 a pull left the marks of the last one: ' + marks());
    if (feed([{ type: 'dmg', u: 2, t: 9, amount: 3, dot: true }]) !== '010') out.push('PLP-1 a tick the hero set on a monster did not mark it: ' + marks());
    if (TP.rollersOf([1, 2, 3], unitOf).join() !== '2') out.push('PLP-1 the rollers of a kill only hero 2 took part in are ' + TP.rollersOf([1, 2, 3], unitOf).join());
    feed([{ type: 'pull', pocket: 1 }]);
    if (TP.rollersOf([1, 3], unitOf).join() !== '1,3') out.push('PLP-1 a kill nobody living took part in rolled for ' + TP.rollersOf([1, 3], unitOf).join() + ', not every living hero');
  }

  /* PLP-2 */
  {
    const monsters = { mk: { gp: [4, 4], drops: [{ id: 'bones', ch: 1, band: 'common' }, { id: 'p_scarce', ch: 0.4, band: 'scarce' }, { id: 'p_rare', ch: 0.02, band: 'rare' }] } };
    const mk = (mult) => { const bag = []; return { bag, family: 'sword', armoured: false, shield: false, bonus: () => 0, weakness: () => ({ dropMult: mult }),
      fx: { addItem: (id, n) => { for (let k = 0; k < n; k++) bag.push(id); } }, state: { stats: {} }, hs: { tally: { kills: 0 }, _events: [] } }; };
    const play = (personal, events, alive2 = true) => {
      const log = [], a = mk(1), b = mk(2), c = mk(1);
      const w = { swing: 3, rareWon: null, units: [{ id: 1, side: 'hero', alive: true, took: false }, { id: 2, side: 'hero', alive: alive2, took: false },
        { id: 3, side: 'hero', alive: true, took: false }, { id: 9, side: 'mon', kind: 'mk', alive: false, hp: 0 }] };
      const streams = {};
      const ctx = { rng: spy('r', log), monsters, ...(personal ? { personal: true, lootRngOf: (u) => (streams[u] = streams[u] || spy('l:' + u, log, 100 + u)) } : {}) };
      RW.rewardSwing(new Map([[1, a], [2, b], [3, c]]), events, w, ctx);
      return { log, a, b, c, w };
    };
    const struck = [{ type: 'pull', pocket: 0, atMs: 0 }, { type: 'dmg', u: 1, t: 9, amount: 30, atMs: 50 }, { type: 'heal', u: 2, t: 1, amount: 9, atMs: 60 },
      { type: 'kill', u: 1, t: 9, atMs: 100 }];
    const p = play(true, struck);
    const asked = (name) => p.log.filter((x) => x[0] === name);
    if (asked('l:3').length) out.push('PLP-2 a hero that took no part in the kill rolled its table');
    if (asked('r').some((x) => x[1] === 'chance')) out.push('PLP-2 a personal kill drew a drop row on the swing\'s r stream: ' + JSON.stringify(asked('r')));
    /* the Bones (ch 1) is DEALT, drawing no die (PLP-5): each roller rolls its two rows under 1 */
    const want1 = [0.4 / 2, 0.02 / 2], want2 = [0.8 / 2, 0.04 / 2];
    const got1 = asked('l:1').filter((x) => x[1] === 'chance').map((x) => x[2]), got2 = asked('l:2').filter((x) => x[1] === 'chance').map((x) => x[2]);
    if (JSON.stringify(got1) !== JSON.stringify(want1)) out.push('PLP-2 roller 1 rolled its rows at ' + JSON.stringify(got1) + ', want ' + JSON.stringify(want1) + ' (1 / 2 a row)');
    if (JSON.stringify(got2) !== JSON.stringify(want2)) out.push('PLP-2 roller 2 rolled at ' + JSON.stringify(got2) + ', want its own odds at 1 / 2 ' + JSON.stringify(want2));
    if (p.c.bag.length) out.push('PLP-2 the hero that took no part was handed ' + p.c.bag.join());
    if (p.w.rareWon !== null) out.push('PLP-2 personal loot touched the rare roll\'s rotation: ' + JSON.stringify(p.w.rareWon));
    if (asked('r').filter((x) => x[1] === 'int').length !== 1) out.push('PLP-2 a personal kill drew ' + asked('r').length + ' times on r, want its coin alone: ' + JSON.stringify(asked('r')));
    /* every roller's bag is its dealt Bones (monster 9 + swing 3 = 12, seat 12 mod 2 = 0: roller 1), then what its own stream says */
    for (const [id, m, mult] of [[1, p.a, 1], [2, p.b, 2]]) {
      const s = spy('x', [], 100 + id), own = id === 1 ? ['bones'] : [];
      for (const row of monsters.mk.drops) if (row.ch < 1 && s.next() < D.effectiveDropChance(row, { dropMult: mult, share: 2 })) own.push(row.id);
      if (own.join() !== m.bag.join()) out.push('PLP-2 roller ' + id + ' holds ' + m.bag.join() + ', its own stream rolls ' + own.join());
    }
    /* a kill in a fresh world nobody has struck in yet: every living hero rolls, each at 1 / 3 */
    const carry = play(true, [{ type: 'kill', u: 3, t: 9, atMs: 10 }]);
    const all3 = carry.log.filter((x) => x[1] === 'chance' && x[0].startsWith('l:')).map((x) => x[0]);
    if ([...new Set(all3)].join() !== 'l:1,l:2,l:3') out.push('PLP-2 a kill no living hero took part in rolled for ' + [...new Set(all3)].join() + ', not all three');
    const later = (() => {
      const log = [], a = mk(1), b = mk(1), c = mk(1);
      const w = { swing: 4, rareWon: null, units: [{ id: 1, side: 'hero', alive: true, took: true }, { id: 2, side: 'hero', alive: true, took: false },
        { id: 3, side: 'hero', alive: true, took: false }, { id: 9, side: 'mon', kind: 'mk', alive: false, hp: 0 }] };
      const ctx = { rng: spy('r', log), monsters, personal: true, lootRngOf: (u) => spy('l:' + u, log, u) };
      RW.rewardSwing(new Map([[1, a], [2, b], [3, c]]), [{ type: 'kill', u: 1, t: 9, atMs: 10 }, { type: 'pull', pocket: 1, atMs: 20 },
        { type: 'dmg', u: 3, t: 9, amount: 1, atMs: 30 }, { type: 'kill', u: 3, t: 9, atMs: 40 }], w, ctx);
      return log.filter((x) => x[1] === 'chance' && x[0].startsWith('l:')).map((x) => x[0]);
    })();
    if (later.join() !== 'l:1,l:1,l:3,l:3') out.push('PLP-2 a mark carried from the last swing and a new pull rolled ' + later.join() + ', want hero 1 then hero 3');
    /* a dead hero rolls nothing even with a mark */
    const dead = play(true, [{ type: 'dmg', u: 2, t: 9, amount: 1, atMs: 1 }, { type: 'dmg', u: 1, t: 9, amount: 1, atMs: 2 }, { type: 'kill', u: 1, t: 9, atMs: 5 }], false);
    if (dead.log.some((x) => x[0] === 'l:2')) out.push('PLP-2 a hero dead at the kill rolled it');
    /* a roller on the scale reads the depth's share of the table (the swing's dial dropPm), then its 1 / n */
    const deep = (() => {
      const log = [], a = mk(1), b = mk(1);
      const w = { swing: 5, rareWon: null, units: [{ id: 1, side: 'hero', alive: true, took: true }, { id: 2, side: 'hero', alive: true, took: true },
        { id: 9, side: 'mon', kind: 'mk', alive: false, hp: 0 }] };
      RW.rewardSwing(new Map([[1, a], [2, b]]), [{ type: 'kill', u: 1, t: 9, atMs: 10 }], w,
        { rng: spy('r', log), monsters, tier: { dropPm: 2000 }, personal: true, lootRngOf: (u) => spy('l:' + u, log, u) });
      return log.filter((x) => x[0] === 'l:1' && x[1] === 'chance').map((x) => x[2]);
    })();
    const wantDeep = monsters.mk.drops.filter((row) => row.ch < 1).map((row) => D.effectiveDropChance(row, { depthPm: 2000, dropMult: 1, share: 2 }));
    if (JSON.stringify(deep) !== JSON.stringify(wantDeep) || deep[0] !== 0.4) out.push('PLP-2 a roller at double depth rolled ' + JSON.stringify(deep) + ', want ' + JSON.stringify(wantDeep));
    /* CONTROL: the party roll draws its table on r */
    const off = play(false, struck);
    if (!off.log.some((x) => x[0] === 'r' && x[1] === 'chance') || off.log.some((x) => x[0].startsWith('l:'))) out.push('PLP-2 CONTROL: the party roll did not draw its rows on r');
  }

  /* PLP-3 */
  for (const row of [{ ch: 0.3 }, { ch: 0.9 }, { ch: 1 }, { ch: 0.004 }]) for (const mods of [{}, { dropMult: 1.5, depthPm: 2000 }, { dropMult: 3 }]) {
    const whole = D.effectiveDropChance(row, mods);
    for (const n of [2, 3, 4]) {
      const sum = n * D.effectiveDropChance(row, { ...mods, share: n });
      if (Math.abs(sum - whole) > 1e-12) out.push('PLP-3 ' + n + ' rollers on ' + JSON.stringify(row) + ' ' + JSON.stringify(mods) + ' sum ' + sum + ', the row ' + whole);
    }
    if (D.effectiveDropChance(row, { ...mods, share: 1 }) !== whole) out.push('PLP-3 a share of 1 moved ' + JSON.stringify(row));
  }

  /* PLP-5 */
  {
    /* a boss with two guarantees (the Rat King's Rat Tail and Bones) and one row under 1 */
    const monsters = { king: { gp: [0, 0], drops: [{ id: 'tail', ch: 1, band: 'trophy' }, { id: 'p_scarce', ch: 0.3, band: 'scarce' }, { id: 'bones', ch: 1, band: 'common' }] },
      lone: { gp: [0, 0], drops: [{ id: 'bones', ch: 1, band: 'common' }] } };
    const mk = () => { const bag = []; return { bag, family: 'sword', armoured: false, shield: false, bonus: () => 0, weakness: () => ({ dropMult: 1 }),
      fx: { addItem: (id, n) => { for (let k = 0; k < n; k++) bag.push(id); } }, state: { stats: {} }, hs: { tally: { kills: 0 }, _events: [] } }; };
    const four = [1, 2, 3, 4].map(() => mk()), held = { tail: [0, 0, 0, 0], bones: [0, 0, 0, 0] };
    const log = [], emitted = [];
    let wrongSeat = 0, notOnce = 0, oneSeat = 0, dicedSure = 0, monId = 100, swing = 0;
    const gaps = spy('gaps', [], 11);
    for (let k = 0; k < 1000; k++) {
      /* the kills of a hunt: each a later spawn (its unit id up 1 to 3) some swings after the last (3 to 25), as the fight's dice space them */
      monId += gaps.int(1, 3); swing += gaps.int(3, 25);
      const w = { swing, rareWon: null, units: [...[1, 2, 3, 4].map((id) => ({ id, side: 'hero', alive: true, took: true })), { id: monId, side: 'mon', kind: 'king', alive: false, hp: 0 }] };
      const before = four.map((m) => m.bag.length);
      const at = log.length;
      RW.rewardSwing(new Map(four.map((m, i) => [i + 1, m])), [{ type: 'kill', u: 1 + (k % 4), t: monId, atMs: k }], w,
        { rng: spy('r', log), monsters, personal: true, lootRngOf: (u) => spy('l:' + u, log, 7 * k + u), emit: (e) => emitted.push(e) });
      const got = four.map((m, i) => m.bag.slice(before[i]));
      for (const id of ['tail', 'bones']) {
        const seats = got.map((g) => g.filter((x) => x === id).length);
        if (seats.reduce((a, b) => a + b, 0) !== 1) notOnce++;
        seats.forEach((n, i) => { held[id][i] += n; });
      }
      const want = (monId + swing) % 4;
      if (!got[want].includes('tail') || !got[(want + 1) % 4].includes('bones')) wrongSeat++;
      if (got.some((g) => g.includes('tail') && g.includes('bones'))) oneSeat++;
      if (log.slice(at).some((x) => x[0].startsWith('l:') && x[1] === 'chance' && x[2] !== 0.3 / 4)) dicedSure++;
    }
    if (notOnce) out.push('PLP-5 a guaranteed row landed on other than exactly one hero in ' + notOnce + ' of 2,000 guaranteed rows (1,000 kills of a four)');
    if (wrongSeat) out.push('PLP-5 a guarantee missed its dealt seat (monster + swing + j, mod 4) in ' + wrongSeat + ' of 1,000 kills');
    if (oneSeat) out.push('PLP-5 both guarantees of one kill landed on one seat in ' + oneSeat + ' of 1,000 kills');
    if (dicedSure) out.push('PLP-5 a roller\'s stream drew for a guaranteed row in ' + dicedSure + ' kills (want only the 0.3 row, at 0.3 / 4)');
    for (const id of ['tail', 'bones']) {
      const tot = held[id].reduce((a, b) => a + b, 0);
      if (held[id].some((n) => n < 0.2 * tot || n > 0.3 * tot)) out.push('PLP-5 over 1,000 kills the seats hold ' + held[id].join('/') + ' ' + id + ' (want 20 to 30% each)');
    }
    out.dealt = 'PLP-5 1,000 kills of a four dealt the Tail ' + held.tail.join('/') + ', the Bones ' + held.bones.join('/');
    if (emitted.filter((e) => e.type === 'rare_drop' && e.item === 'tail').length !== 1000) out.push('PLP-5 a dealt Trophy did not earn its rare-drop moment every kill');
    /* a kill only heroes 2 and 4 took part in: its guarantee is theirs, never the others' */
    {
      const party = [1, 2, 3, 4].map(() => mk());
      for (let k = 0; k < 8; k++) {
        const w = { swing: k, rareWon: null, units: [...[1, 2, 3, 4].map((id) => ({ id, side: 'hero', alive: true, took: id % 2 === 0 })), { id: 50, side: 'mon', kind: 'lone', alive: false, hp: 0 }] };
        RW.rewardSwing(new Map(party.map((m, i) => [i + 1, m])), [{ type: 'kill', u: 2, t: 50, atMs: k }], w, { rng: spy('r', []), monsters, personal: true, lootRngOf: (u) => spy('l:' + u, [], u) });
      }
      const n = party.map((m) => m.bag.length).join('/');
      if (n !== '0/4/0/4') out.push('PLP-5 a guarantee only heroes 2 and 4 rolled for was dealt ' + n + ' over 8 kills, want 0/4/0/4');
    }
    /* a CALLED fight's win (hunt-rewards.js calledSwing) deals by the same turns: the boss's unit + the swing */
    {
      const party = [1, 2, 3].map(() => mk());
      let miss = 0;
      for (let k = 0; k < 9; k++) {
        const before = party.map((m) => m.bag.length), boss = 70 + 2 * k;
        const w = { swing: 5, rareWon: null, units: [...[1, 2, 3].map((id) => ({ id, side: 'hero', alive: true, took: true })), { id: boss, side: 'mon', kind: 'lone', alive: false, hp: 0 }] };
        RW.rewardSwing(new Map(party.map((m, i) => [i + 1, m])), [{ type: 'kill', u: 1, t: boss, atMs: k }], w,
          { rng: spy('r', []), monsters, call: { monster: 'lone' }, personal: true, lootRngOf: (u) => spy('l:' + u, [], u) });
        const got = party.map((m, i) => m.bag.length - before[i]);
        if (got.join() !== [0, 1, 2].map((i) => (i === (boss + 5) % 3 ? 1 : 0)).join()) miss++;
      }
      if (miss) out.push('PLP-5 a called win dealt its guarantee off the boss\'s turn (unit + swing, mod 3) in ' + miss + ' of 9 wins');
    }
    /* a table of guarantees only seeds no roller's stream */
    {
      const seeded = [];
      const w = { swing: 1, rareWon: null, units: [{ id: 1, side: 'hero', alive: true, took: true }, { id: 2, side: 'hero', alive: true, took: true }, { id: 60, side: 'mon', kind: 'lone', alive: false, hp: 0 }] };
      RW.rewardSwing(new Map([[1, mk()], [2, mk()]]), [{ type: 'kill', u: 1, t: 60, atMs: 1 }], w, { rng: spy('r', []), monsters, personal: true, lootRngOf: (u) => { seeded.push(u); return spy('l:' + u, [], u); } });
      if (seeded.length) out.push('PLP-5 a table of guarantees only seeded the loot stream of ' + seeded.join());
    }
  }

  /* PLP-4 */
  {
    const { loadPlay } = await imp('tests/hunt-core/fixtures/play-ground.mjs');
    const P = await loadPlay(base);
    const go = (windowMs, personalLoot) => P.run(MUSTER, 60, FOUR, { spanMs: SPAN, windowMs, fullSet: true, plan: { risk: 'steady', danger: 0 }, personalLoot });
    const closed = go(SPAN, true), viewed = go(30000, true), dark = go(SPAN, false);
    const bags = (r) => JSON.stringify(r.heroes.map((k) => [k, Object.entries(r.heroItems[k] || {}).sort()]));
    if (closed.totals.kills < 20) out.push('PLP-4 CONTROL: the four killed ' + closed.totals.kills + ' in 10 minutes');
    if (bags(closed) !== bags(viewed)) out.push('PLP-4 the watched and the closed hunt stored other bags:\n      closed ' + bags(closed).slice(0, 400) + '\n      viewed ' + bags(viewed).slice(0, 400));
    if (closed.world !== viewed.world) out.push('PLP-4 the watched and the closed hunt stored other worlds');
    const empty = closed.heroes.filter((k) => !Object.keys(closed.heroItems[k] || {}).length);
    if (empty.length) out.push('PLP-4 seat(s) ' + empty.join(', ') + ' found nothing in ' + closed.totals.kills + ' kills');
    if (closed.rareRolls.length || viewed.rareRolls.length) out.push('PLP-4 a personal hunt drew ' + (closed.rareRolls.length + viewed.rareRolls.length) + ' rare rolls');
    if (bags(closed) === bags(dark)) out.push('PLP-4 CONTROL: the rule off stored the same bags (the switch moved nothing)');
    /* S-31's EXACT BOUND, both doors: a guaranteed item (one no killed monster rolls under 1) lands once a kill of each monster carrying it */
    const sureOf = (r) => {
      const sure = {}, rolledToo = new Set();
      for (const [kind, n] of Object.entries(r.killsBy)) for (const d of (P.MONSTERS[kind] || {}).drops || []) {
        if (d.ch >= 1) sure[d.id] = (sure[d.id] || 0) + n; else rolledToo.add(d.id);
      }
      return Object.entries(sure).filter(([id]) => !rolledToo.has(id))
        .map(([id, n]) => [id, n, r.heroes.reduce((s, k) => s + ((r.heroItems[k] || {})[id] || 0), 0)]);
    };
    const sure = sureOf(closed);
    if (!sure.some(([, n]) => n > 0)) out.push('PLP-4 CONTROL: the four killed no monster carrying a guarantee');
    for (const [name, r] of [['closed', closed], ['viewed', viewed]]) for (const [id, n, units] of sureOf(r)) {
      if (units !== n) out.push('PLP-4 ' + name + ': ' + units + ' ' + id + ' over every seat for ' + n + ' kills carrying it (a guarantee is one unit a kill)');
    }
    out.evidence = 'PLP-4 ' + closed.totals.kills + ' kills: personal bags ' + closed.heroes.map((k) => Object.values(closed.heroItems[k] || {}).reduce((s, n) => s + n, 0)).join('/')
      + ' units a seat, the party roll ' + dark.heroes.map((k) => Object.values(dark.heroItems[k] || {}).reduce((s, n) => s + n, 0)).join('/')
      + '; dealt ' + sure.map(([id, n, units]) => units + ' ' + id + ' for ' + n + ' kills carrying it').join(', ') + '; ' + out.dealt;
  }
  if (out.evidence && !out.length) console.log('  ' + out.evidence);
  return out;
}

const MUTANTS = [
  ['a pull keeps the last pull\'s marks', 'src/core/hunt/took-part.js', '      for (const u of world.units) if (isHero(u) && u.took === true) u.took = false;\n', ''],
  ['a meal counts as taking part', 'src/core/hunt/took-part.js', "ev.amount > 0 && ev.item === undefined && isHero(unitOf(ev.t))", 'ev.amount > 0 && isHero(unitOf(ev.t))'],
  ['a missed blow is no part', 'src/core/hunt/took-part.js', "    case 'dmg':\n    case 'miss':\n", "    case 'dmg':\n"],
  ['a kill nobody took part in rolls for nobody', 'src/core/hunt/took-part.js', '  return out.length ? out : ids;', '  return out;'],
  ['the rewards never read who took part', 'src/core/hunt-rewards.js', '    noteTookPart(ev, members, unitOf, world);\n    switch (ev.type) {', '    switch (ev.type) {'],
  ['each roller rolls the whole row', 'src/core/hunt-rewards.js', "dropBuff: m.bonus('dropRate'), share: by.length };", "dropBuff: m.bonus('dropRate'), share: 1 };"],
  ['a roller rolls on the killer\'s odds', 'src/core/hunt-rewards.js', 'const own = { depthPm, dropMult: m.weakness(row).dropMult,', 'const own = { depthPm, dropMult: present[0].weakness(row).dropMult,'],
  ['a roller\'s roll ignores the depth', 'src/core/hunt-rewards.js', 'const own = { depthPm, dropMult: m.weakness(row).dropMult,', 'const own = { dropMult: m.weakness(row).dropMult,'],
  ['a roller draws on the swing\'s r', 'src/core/hunt-rewards.js', 'rollDropTable(rolled, own, ctx.lootRngOf(id))', 'rollDropTable(rolled, own, ctx.rng)'],
  ['the share ignores a guarantee', 'src/core/drops.js', 'return share === 1 ? wholeDropChance(row, m) : wholeDropChance(row, m) / share;', 'return share === 1 || row.ch >= 1 ? wholeDropChance(row, m) : wholeDropChance(row, m) / share;'],
  ['the share divides before the cap', 'src/core/drops.js', 'return share === 1 ? wholeDropChance(row, m) : wholeDropChance(row, m) / share;', 'return share === 1 ? wholeDropChance(row, m) : row.ch >= 1 ? wholeDropChance(row, m) / share : wholeDropChance({ ...row, ch: row.ch / share }, m);'],
  ['the mark is not persisted', 'src/core/hunt/world-state.js', 'danger.PERSISTED, bossPhases.PERSISTED, tookPart.PERSISTED];', 'danger.PERSISTED, bossPhases.PERSISTED];'],
  /* A GUARANTEE IS DEALT (PLP-5, PLP-4's exact bound) */
  ['the guarantee rolled at 1 / n (the rule before the deal)', 'src/core/hunt-rewards.js', '    if (!(d.ch >= 1)) { rolled.push(d); continue; }', '    if (true) { rolled.push(d); continue; }'],
  ['every guarantee to one seat (the killer\'s here)', 'src/core/hunt-rewards.js', 'const seat = by[itemOwner(j++, by.length, start)];', 'const seat = by[0];'],
  ['a kill\'s guarantees all to one seat', 'src/core/hunt-rewards.js', 'const seat = by[itemOwner(j++, by.length, start)];', 'const seat = by[itemOwner(0, by.length, start)];'],
  ['the turns never move with the kill', 'src/core/hunt-rewards.js', 'const start = (Number(monId) || 0) + (Number(world.swing) || 0);', 'const start = Number(world.swing) || 0;'],
  ['a guarantee dealt past the kill\'s rollers', 'src/core/hunt-rewards.js', 'const seat = by[itemOwner(j++, by.length, start)];', 'const seat = ids[itemOwner(j++, ids.length, start)];'],
  ['every roller handed every guarantee (a flood)', 'src/core/hunt-rewards.js', 'for (const d of dealt.get(id) || [])', 'for (const d of row.drops.filter((x) => x.ch >= 1))'],
  ['a roller also rolls its dealt rows', 'src/core/hunt-rewards.js', 'rollDropTable(rolled, own, ctx.lootRngOf(id))', 'rollDropTable(row.drops, own, ctx.lootRngOf(id))'],
  ['payKill never hands the monster down', 'src/core/hunt-rewards.js', '    payDrops(present, ids, lead, row, ctx, world, atMs, monId);', '    payDrops(present, ids, lead, row, ctx, world, atMs);'],
  ['a called win never hands the boss down', 'src/core/hunt-rewards.js', 'row, ctx, world, ev.atMs, ev.t); }', 'row, ctx, world, ev.atMs); }'],
  ['the sim never hands the rule to the rewards', 'src/core/combat-sim.js', "...(ctx.personalLoot === true ? { personal: true, lootRngOf: lootStreams(ctx, sw) } : {}),", ''],
];

process.exitCode = await runPureGuard({ mutate: process.argv.includes('--mutate'), guard: 'tests/personal-loot-play.mjs', pure, mutants: MUTANTS,
  copy: ['supabase/functions/hr-accrue', 'tests/hunt-core/fixtures'],
  green: 'who took part, each roller\'s own roll at ch / n on its own stream, no flood, a guarantee dealt once a kill by turns, a watched and a closed four store the same bags' });
