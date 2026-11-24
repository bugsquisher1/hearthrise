#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/drop-formula.mjs — DROPS IN HUNTED HOURS, THE RARITY LADDER AND THE DARK TRAIT ROLLER (systems, lane/drop-formula, 2026-11-22).
// src/data/drop-hours.js, src/core/drop-rate.js, src/core/trait-roll.js, tools/gen-drop-hours.mjs; 04 sections 10-11, 21 section 4,
// 24 G8 / G10, 12-targets 3.3 and 8.1.
//
//   DF-1  THE FORMULA ON THE DATA: every scale ground's owned row (a monster row of its pack, or of src/data/monsters.js for a ground with no
//         pack, under certainty) carries `everyHours` and the
//         `ch` those hours derive (rowChance: 1 / (hours x refKillsHead x the monster's share of the kills at refStep), 3 significant
//         digits), so hours x kills a hero-hour x ch is 1 within rounding; a Catacomb wing's rows the same over its own kill rate
//   DF-2  A KILL-RATE CHANGE KEEPS THE HOURS: the same hours over twice the kills derive half the chance (a re-measured ground keeps its drops)
//   DF-3  THE LADDER: Rare, Very Rare and Signature each inside its band, rarer up the ladder from Rare; Plain is the Scarce band; depth
//         multiplies the Rare odds x1 at depth 1 to x3 at depth 20, 1 at the reference's own depth; the edge's depthOf is the browser's
//   DF-4  THE ROLLER (seeded, many kills): every piece's slot is a rollable cell of its ground (dropped and homed) and its first Trait from
//         that cell; a Very Rare's second Trait shares its slot, never its key, never a banned pair; no rank over the ground's maxRank,
//         only rank 1 under depth 8, and at depth 20 of a rank-3 ground the top rank about topRankPm, more with luck, never past
//         topRankMaxPm; personal loot: a hero of four finds as often an hour as a hero alone; the flame's luck multiplies the odds; pity
//         keeps the long-run rate (the mean kills to a hit 1 / p) and the tail short (p90 under 2x the mean, against ~2.3 without)
//   DF-5  THE SETTLE, VIEWED OR CLOSED: a scale hunt handed a roll finds the same pieces for the same heroes in one window, 10 s windows
//         and odd cuts (world and pity through JSON at every cut); and every other output (events, items, gold, world) is the hunt's
//         without the roll, digit for digit: the roller draws on its own streams only
//   DF-6  DARK: GEAR_STEPS.traitsLive is false and no src or server file but the roller and its two engine readers names `traitDrops`
//         (nothing hands the settle a roll); a made piece (drop-hours.js made, data until the bench verb) is a cape or a jewel, a slot no
//         scale ground drops, named by a part a scale ground does drop
//
//   node tests/drop-formula.mjs            the guard and every planted mutant (each caught by its case)
//
// ci-step: economy-selftests | Drops in hunted hours, the rarity ladder and pity, the dark Trait roller (its planted mutants run inline)
// ci-run: node tests/drop-formula.mjs
//
// mutant-anchors: src/core/trait-roll.js, src/core/drop-rate.js, src/core/hunt-rewards.js, src/core/action-rules.js, src/data/grounds/muster_barrows/pack.js, src/app/game-modules.js
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, loadCore, plant, makeReport, member, groundRow, gridOf, T0 } from './hunt-core/fixtures/h1.js';
import { caughtBy, missWhy } from './_mutant-verdict.mjs';
import { sourceQuery } from '../tools/lib/version-stamp.mjs';

const V = sourceQuery(ROOT);
async function load(root) {
  const M = await loadCore(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  M.DH = await imp('src/data/drop-hours.js');
  M.DR = await imp('src/core/drop-rate.js');
  M.B = await imp('src/core/bands.js');
  M.TR = await imp('src/core/trait-roll.js');
  M.GS = await imp('src/data/gear-steps.js');
  M.D = await imp('src/data/danger.js');
  M.PACKS = (await imp('src/data/grounds/index.js')).GROUND_PACKS;
  M.LB = await imp('src/data/loot-bands.js');
  M.SESSION_DEPTH = existsSync(join(root, 'src/session/danger-sections.js')) ? (await imp('src/session/danger-sections.js')).depthOf : null;
  return M;
}

const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b));

/* ── DF-4's sampler: one hero's kills on a ground at a step, through the real roller ── */
function sampler(M, groundId, step, o = {}) {
  const ground = M.grounds.HUNT_GROUNDS[groundId];
  const tr = { luckPm: { h: o.luckPm || 0 }, pity: {}, found: [], ...(o.hours ? { hours: o.hours } : {}), ...(o.pityOn ? { pityOn: o.pityOn } : {}) };
  const rng = M.rng.createRng(M.rng.hashSeed('df4', groundId, step, o.seed || 1));
  const sw = M.TR.traitSwing(tr, ground, step, () => rng);
  return { tr, sw, rng, kill: (n = 1) => M.TR.rollKillFor(sw, 'h', 1, n, rng) };
}
/* kills to each first hit, `samples` times (pity reset at each hit, as the roller does) */
function killsToHit(M, groundId, step, o) {
  const s = sampler(M, groundId, step, o);
  const out = [];
  let k = 0;
  while (out.length < o.samples) { k += 1; if (s.kill(o.n || 1)) { out.push(k); k = 0; } }
  return out;
}

const CASES = {
  'DF-1'(M) {
    let rows = 0;
    /* (lane/scale-early-grounds) a scale ground with no pack owns the src/data/monsters.js rows no pack defines (the Mill Cellar's, the
       Thicket's), read as a pack-shaped view, as tools/gen-drop-hours.mjs owns them */
    const packed = new Set(M.PACKS.map((p) => p.id)), inPack = new Set(M.PACKS.flatMap((p) => Object.keys(p.monsters || {})));
    const bases = Object.keys(M.D.DANGER_GROUNDS).filter((g) => !packed.has(g) && M.grounds.HUNT_GROUNDS[g])
      .map((g) => ({ id: g, monsters: Object.fromEntries([...M.grounds.monstersOn(M.grounds.HUNT_GROUNDS[g])].filter((m) => M.MONSTERS[m] && !inPack.has(m)).map((m) => [m, M.MONSTERS[m]])) }));
    for (const p of [...M.PACKS, ...bases]) {
      if (!Object.prototype.hasOwnProperty.call(M.D.DANGER_GROUNDS, p.id)) continue;
      const g = M.grounds.HUNT_GROUNDS[p.id];
      const kph = M.DR.rowsKillsHour(g), shares = M.DR.killShares(g);
      for (const [mid, mon] of Object.entries(p.monsters || {})) {
        for (const r of mon.drops || []) {
          if (r.ch >= 1) continue;
          rows += 1;
          if (!(Number(r.everyHours) > 0)) return p.id + ' ' + mid + ' ' + r.id + ': a typed chance ' + r.ch + ' on a scale ground';
          const want = M.DR.rowChance(r, mid, g);
          if (want !== r.ch) return p.id + ' ' + mid + ' ' + r.id + ': ch ' + r.ch + ' is not what ' + r.everyHours + ' h derive (' + want + ')';
          if (!near(r.everyHours * kph * shares[mid] * r.ch, 1, 0.006)) return p.id + ' ' + r.id + ': hours x kills x ch = ' + (r.everyHours * kph * shares[mid] * r.ch);
        }
      }
    }
    if (rows < 40) return 'CONTROL: only ' + rows + ' scale rows read';
    for (const w of ['catacomb_bone_wing', 'catacomb_flooded_wing']) {
      const g = M.grounds.HUNT_GROUNDS[w];
      if (!g || !g.drops.length) return 'CONTROL: no wing rows on ' + w;
      for (const r of g.drops) if (M.DR.rowChance(r, null, g) !== r.ch) return w + ' ' + r.id + ': ch ' + r.ch + ' is not its ' + r.everyHours + ' h';
    }
    return null;
  },
  'DF-2'(M) {
    const ch = M.DH.chanceOf(12, 120), ch2 = M.DH.chanceOf(12, 240);
    if (!near(ch * 12 * 120, 1, 1e-12)) return 'chanceOf(12, 120) x 12 x 120 = ' + ch * 12 * 120;
    if (!near(ch2, ch / 2, 1e-12)) return 'twice the kills did not halve the chance: ' + ch + ' -> ' + ch2;
    if (M.DH.chanceOf(0.001, 10) !== 1) return 'a chance over 1 was not held to a certainty';
    if (M.DH.roundChance(0.0123456) !== 0.0123) return 'roundChance does not hold 3 digits';
    return null;
  },
  'DF-3'(M) {
    const R = M.DH.DROP_HOURS.rarity;
    for (const k of ['rare', 'very_rare', 'signature']) if (!(R[k].everyHours >= R[k].band[0] && R[k].everyHours <= R[k].band[1])) return k + ' ' + R[k].everyHours + ' h outside its band';
    if (!(R.rare.everyHours < R.very_rare.everyHours)) return 'a Very Rare is not rarer than a Rare';
    if (JSON.stringify(R.plain.band) !== JSON.stringify(M.LB.BAND_TARGETS.scarce.hours)) return 'Plain is not the Scarce band';
    for (const [gid, row] of Object.entries(M.D.DANGER_GROUNDS)) {
      /* the reference company's hold at the band's grain (src/core/bands.js refHeldOf: refHeld ?? refStep, the depth reading's middle) */
      const held = M.B.refHeldOf(gid);
      const d1 = M.DR.depthRarePm(gid, row.floorStep), dTop = M.DR.depthRarePm(gid, row.topStep), dRef = M.DR.depthRarePm(gid, held);
      if (M.DR.depthOf(gid, row.floorStep) !== 1 || M.DR.depthOf(gid, row.topStep) !== M.D.DEPTHS) return gid + ': the band does not read depth 1 to ' + M.D.DEPTHS;
      if (!near(dTop / d1, 3, 1e-9)) return gid + ': depth 20 over depth 1 is x' + (dTop / d1) + ', not x3';
      if (dRef !== 1000) return gid + ': the reference company\'s hold (' + held + ') reads ' + dRef + ' permille, not 1000';
      const [lo, hi] = M.DH.DROP_HOURS.depthPm, rd = M.DR.depthOf(gid, held);
      if (!near(d1, (1000 * lo) / (lo + ((hi - lo) * (rd - 1)) / (M.D.DEPTHS - 1)), 1e-9)) return gid + ': depth 1 reads ' + d1.toFixed(1) + ' permille, not its share of the reference depth ' + rd;
      if (M.SESSION_DEPTH) for (let s = row.floorStep - 5; s <= row.topStep + 5; s++) {
        const b = M.SESSION_DEPTH(gid, s);
        if (b && b.depth !== M.DR.depthOf(gid, s)) return gid + ' step ' + s + ': the edge reads depth ' + M.DR.depthOf(gid, s) + ', the browser ' + b.depth;
      }
    }
    return null;
  },
  'DF-4'(M) {
    const T = M.GS.TRAITS, G = M.GS.GEAR_STEPS;
    /* the pair rule on every source and slot, scale or not (the scale grounds hold no two Traits of one key in a slot today) */
    for (const src of new Set(Object.values(T).map((t) => t.source))) for (const s of Object.keys(G.traitSlots)) {
      for (const [a, b] of M.TR.veryRarePairs(T, G.veryRareBanned, src, s)) if (a === b || T[a].key === T[b].key || T[a].slot !== s || T[b].slot !== s || (T[a].source !== src && T[b].source !== src)) return 'veryRarePairs(' + src + ', ' + s + ') allows ' + a + '+' + b;
    }
    /* shape, on fast hours (the Lab's dial) so thousands of pieces land */
    for (const gid of Object.keys(M.D.DANGER_GROUNDS)) {
      const g = M.grounds.HUNT_GROUNDS[gid];
      if (!g) continue;
      const row = M.D.DANGER_GROUNDS[gid];
      const cells = M.TR.rollableCells(g);
      for (const [s, ids] of Object.entries(cells)) if (ids.length > G.traitRoll.cellMax) return gid + ' ' + s + ': ' + ids.length + ' Traits in a cell, over cellMax';
      for (const step of [row.floorStep, row.refStep, row.topStep]) {
        const sm = sampler(M, gid, step, { hours: { rare: 0.01, very_rare: 0.02 }, luckPm: step === row.topStep ? 0 : 400 });
        for (let i = 0; i < 4000; i++) sm.kill(1);
        const depth = M.DR.depthOf(gid, step);
        if (Object.keys(cells).length && sm.tr.found.length < 200) return 'CONTROL: ' + gid + ' found ' + sm.tr.found.length + ' pieces';
        let tops = 0, ranked = 0;
        for (const pc of sm.tr.found) {
          if (!M.DR.traitSlotsDropped(g, G.traitSlots).includes(pc.slot)) return gid + ': a piece in slot ' + pc.slot + ', a slot the ground never drops';
          if (!cells[pc.slot]) return gid + ': a piece in slot ' + pc.slot + ', not a rollable cell (' + Object.keys(cells).join(', ') + ')';
          if (!cells[pc.slot].includes(pc.traits[0].id)) return gid + ': its first Trait ' + pc.traits[0].id + ' is not of the (ground, slot) cell';
          if (pc.traits.length !== G.traitsByRarity[pc.rarity]) return gid + ': a ' + pc.rarity + ' with ' + pc.traits.length + ' Traits';
          if (pc.rarity === 'very_rare') {
            const [a, b] = pc.traits.map((t) => T[t.id]);
            if (b.slot !== pc.slot || a.key === b.key || G.veryRareBanned.includes([pc.traits[0].id, pc.traits[1].id].sort().join('+'))) return gid + ': a Very Rare pair ' + pc.traits.map((t) => t.id).join('+') + ' breaks the pair rule';
          }
          for (const t of pc.traits) {
            if (t.rank < 1 || t.rank > row.maxRank) return gid + ': rank ' + t.rank + ' on a ground whose top is ' + row.maxRank;
            if (depth < G.rankDepths[1] && t.rank !== 1) return gid + ' depth ' + depth + ': rank ' + t.rank + ' under depth ' + G.rankDepths[1];
            if (row.maxRank >= 3 && depth >= G.rankDepths[2]) { ranked += 1; if (t.rank === 3) tops += 1; }
          }
          if (pc.iL !== row.gearLevel) return gid + ': a piece at item Level ' + pc.iL + ', not the ground\'s ' + row.gearLevel;
        }
        if (ranked > 200) {
          const share = (1000 * tops) / ranked;
          if (step === row.topStep && !near(share, M.DH.DROP_HOURS.topRankPm, 0.12)) return gid + ': the top rank landed ' + share.toFixed(0) + ' permille, not about ' + M.DH.DROP_HOURS.topRankPm;
        }
      }
    }
    /* luck lifts the top rank, never past its cap */
    const wing = 'catacomb_flooded_wing', wrow = M.D.DANGER_GROUNDS[wing];
    const lucky = sampler(M, wing, wrow.topStep, { hours: { rare: 0.01, very_rare: 1e9 }, luckPm: 5000 });
    for (let i = 0; i < 3000; i++) lucky.kill(1);
    const lt = lucky.tr.found.flatMap((p) => p.traits), lshare = (1000 * lt.filter((t) => t.rank === 3).length) / lt.length;
    if (!(lt.length > 200) || !near(lshare, M.DH.DROP_HOURS.topRankMaxPm, 0.1)) return 'with a huge flame the top rank landed ' + lshare.toFixed(0) + ' permille, not its cap ' + M.DH.DROP_HOURS.topRankMaxPm;
    /* personal loot, luck and pity: kills to a hit, on hours that give p = 1 / 600 a kill alone, where the reference company holds (x1) */
    const ref = M.B.refHeldOf('muster_barrows');
    const kph = M.DR.killsHeadHour(M.grounds.HUNT_GROUNDS.muster_barrows), hrs = { rare: 600 / kph, very_rare: 1e9 };
    const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
    const q = (a, p) => [...a].sort((x, y) => x - y)[Math.floor(p * a.length)];
    const alone = killsToHit(M, 'muster_barrows', ref, { hours: hrs, samples: 3000, pityOn: { rare: false } });
    const four = killsToHit(M, 'muster_barrows', ref, { hours: hrs, samples: 3000, n: 4, pityOn: { rare: false } });
    if (!near(mean(alone), 600, 0.06)) return 'CONTROL: a hero alone took ' + mean(alone).toFixed(0) + ' kills a hit, not 600';
    /* a hero of four is at 4x the kills an hour, so 4x the kills a hit is the same hours */
    if (!near(mean(four) / 4, mean(alone), 0.08)) return 'personal loot: a hero of four took ' + (mean(four) / 4).toFixed(0) + ' kill-hours a hit, alone ' + mean(alone).toFixed(0);
    const luck = killsToHit(M, 'muster_barrows', ref, { hours: hrs, samples: 3000, luckPm: 500, pityOn: { rare: false } });
    if (!near(mean(alone) / mean(luck), 1.5, 0.08)) return 'a +50% flame moved the odds x' + (mean(alone) / mean(luck)).toFixed(2);
    const pity = killsToHit(M, 'muster_barrows', ref, { hours: hrs, samples: 3000 });
    if (!near(mean(pity), 600, 0.06)) return 'pity moved the long-run rate: ' + mean(pity).toFixed(0) + ' kills a hit, not 600';
    if (!(q(pity, 0.9) / mean(pity) < 2)) return 'pity: p90 is ' + (q(pity, 0.9) / mean(pity)).toFixed(2) + 'x the mean (21 L2: under 2)';
    if (!(q(alone, 0.9) / mean(alone) > 2)) return 'CONTROL: without pity p90 is only ' + (q(alone, 0.9) / mean(alone)).toFixed(2) + 'x the mean';
    return null;
  },
  'DF-5'(M) {
    const ground = groundRow({ id: 'muster_barrows', drops: ['rune_sword', 'runebound_shield', 'rune_platebody', 'rune_belt'].map((id) => ({ id, ch: 0, band: 'scarce' })) });
    const grid = gridOf(M);
    const SPAN = 12 * 60000;
    const run = (cuts, roll, forget) => {
      const items = { a: {}, b: {} };
      const fx = (k) => ({ addItem: (id, q) => { items[k][id] = (items[k][id] || 0) + q; } });
      const ms = ['a', 'b'].map((k, i) => member(M, k, { seat: i, maxHp: 4000, hp: 4000, maxHit: 400, fx: fx(k) }));
      for (const m of ms) m.hero = { ...m.hero, risk: 'steady', danger: M.D.DANGER_GROUNDS.muster_barrows.refStep };
      const ctx = { tickMs: 2000, seed: (d, i) => M.rng.hashSeed('df5', 3, d, i), monsters: M.MONSTERS, ground, grid };
      const edges = [T0, ...cuts, T0 + SPAN];
      let w = null, next = T0, tr = roll ? { luckPm: { a: 0, b: 300 }, pity: {}, found: [], hours: { rare: 0.01, very_rare: 0.04 } } : null;
      const events = [];
      for (let i = 1; i < edges.length; i++) {
        w = w ? M.worldstate.decode(JSON.parse(JSON.stringify(M.worldstate.encode(w)))) : null;
        /* the server's carry: pity read back from the window and written into the next (forget: a server that drops it) */
        if (tr) tr = { ...tr, pity: forget ? {} : JSON.parse(JSON.stringify(tr.pity)) };
        const r = M.cs.simulateHuntInstance({ world: w, nextSwingAtMs: next, members: ms }, { ...ctx, toMs: edges[i], ...(tr ? { traitDrops: tr } : {}) });
        w = r.world; next = r.nextSwingAtMs; events.push(...r.events);
        if (!w) break;
      }
      return { found: tr ? tr.found : [], rest: JSON.stringify({ events, items, gold: ms.map((m) => m.state.gold), world: w ? M.worldstate.encode(w) : null }) };
    };
    const one = run([], true);
    const tens = run(Array.from({ length: SPAN / 10000 - 1 }, (_, i) => T0 + (i + 1) * 10000), true);
    const odd = run([T0 + 7300, T0 + 61000, T0 + 200100, T0 + 333000, T0 + 500000], true);
    const none = run([], false);
    const forgot = run(Array.from({ length: SPAN / 10000 - 1 }, (_, i) => T0 + (i + 1) * 10000), true, true);
    if (one.found.length < 3) return 'CONTROL: ' + one.found.length + ' pieces found in twelve minutes on fast hours';
    if (new Set(one.found.map((p) => p.key)).size < 2) return 'CONTROL: only one hero found anything';
    const f = JSON.stringify(one.found);
    if (JSON.stringify(tens.found) !== f) return 'the pieces moved with 10 s windows';
    if (JSON.stringify(odd.found) !== f) return 'the pieces moved with odd cuts';
    if (JSON.stringify(forgot.found) === f) return 'pity dropped at every window found the same pieces: the carry is never read';
    if (none.rest !== one.rest) return 'the roll moved the hunt itself (a draw off the roller\'s own streams, or a write it should not make)';
    if (one.found.some((p) => p.ground !== 'muster_barrows' || !Number.isFinite(p.atMs) || !Number.isInteger(p.unit))) return 'a piece without its ground, kill time or hero';
    return null;
  },
  'DF-6'(M) {
    if (M.GS.GEAR_STEPS.traitsLive !== false) return 'GEAR_STEPS.traitsLive is ' + M.GS.GEAR_STEPS.traitsLive + ': Traits are dark until wave 4';
    const allowed = new Set(['src/core/trait-roll.js', 'src/core/combat-sim.js', 'src/core/hunt-rewards.js']);
    /* the generated preload list (tests/module-preload.mjs --write) names every module of the game half, the roller among them (combat-sim
       reaches it): a name to preload, never an import that could hand a roll, so it may name the file (as GS-6 lets it name gear-steps.js)
       and is still held to traitDrops */
    const PRELOAD_LIST = 'src/app/game-modules.js';
    const strip = (s) => s.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const walk = (abs, rel, out) => {
      if (!existsSync(abs)) return out;
      for (const e of readdirSync(abs)) {
        const a = join(abs, e), r = rel + '/' + e;
        if (statSync(a).isDirectory()) walk(a, r, out);
        else if (/\.(m?js|ts)$/.test(e)) out.push([r, readFileSync(a, 'utf8')]);
      }
      return out;
    };
    const files = [...walk(join(M.root, 'src'), 'src', []), ...walk(join(M.root, 'supabase', 'functions'), 'supabase/functions', [])];
    if (files.length < 50) return 'CONTROL: ' + files.length + ' files read';
    for (const [rel, text] of files) {
      if (allowed.has(rel)) continue;
      const code = strip(text);
      if (/\btraitDrops\b/.test(code)) return rel + ' names traitDrops: it hands the settle a Trait roll while Traits are dark';
      if (rel !== PRELOAD_LIST && /trait-roll\.js/.test(code)) return rel + ' imports the Trait roller';
    }
    /* the made piece (drop-hours.js made, the rule as data until the bench verb lands): its slots are the bench's, never a dropped slot, and
       its part names an item field the scale grounds' parts carry */
    const made = M.DH.DROP_HOURS.made;
    if (JSON.stringify([...made.slots].sort()) !== JSON.stringify(['cape', 'earrings', 'necklace', 'ring'])) return 'the made slots are not the bench ones (cape and jewelry): ' + made.slots.join(', ');
    for (const gid of Object.keys(M.D.DANGER_GROUNDS)) {
      const g = M.grounds.HUNT_GROUNDS[gid];
      /* (lane/scale-early-grounds) a ground that rolls no rank (gear-steps.js maxRankAt: entry under 40) rolls no Trait at all, so a cape it
         drops (the Thicket's Grayjaw's Ruff) is no second roll */
      if (M.D.DANGER_GROUNDS[gid].maxRank === 0) continue;
      if (g && made.slots.some((s) => M.DR.traitSlotsDropped(g, M.GS.GEAR_STEPS.traitSlots).includes(s))) return gid + ' drops a piece in a made slot: the made rule and the drop rule would both roll it';
    }
    const parts = M.PACKS.filter((p) => M.D.DANGER_GROUNDS[p.id]).flatMap((p) => Object.values(p.items || {})).filter((it) => it && it[made.part]);
    if (!parts.length) return 'no scale ground drops a part carrying ' + made.part + ': no made piece could name its ground';
    return null;
  },
};

const MUTANTS = [
  { name: 'a stale chance after a kill-rate change', case: 'DF-1', edits: [['src/data/grounds/muster_barrows/pack.js', "{ id: 'mithril_sword', everyHours: 1.08, ch: 0.016,", "{ id: 'mithril_sword', everyHours: 1.08, ch: 0.018,"]] },
  { name: 'a typed chance on a scale ground', case: 'DF-1', edits: [['src/data/grounds/muster_barrows/pack.js', "{ id: 'mithril_sword', everyHours: 1.08, ch: 0.016,", "{ id: 'mithril_sword', ch: 0.016,"]] },
  /* lane/scale-early-grounds: a base ground's rows (src/data/monsters.js) are owned the same way */
  { name: 'a typed chance on a base scale ground', case: 'DF-1', edits: [['src/data/monsters.js', "{ id: 'rat_tail', everyHours: 0.02565, ch: 0.42,", "{ id: 'rat_tail', ch: 0.42,"]] },
  { name: 'kills shares off the reference pull', case: 'DF-1', edits: [['src/core/drop-rate.js', 'const size = dangerDial(ground, row.refStep).pull[0];', 'const size = 3;']] },
  /* (lane/monster-roles-ford-wings) a row's chance read at the scale's kill rate, not the one its rows are written at (the Ford's 235: the
     tier path plays them as written) */
  { name: 'chances derived at the scale\'s kills, not the rows\'', case: 'DF-1', edits: [['src/core/drop-rate.js', '  return Number.isInteger(row.rowsKillsHead) ? row.rowsKillsHead : refKillsOf(ground);', '  return refKillsOf(ground);']] },
  { name: 'depth read raw, not against the reference', case: 'DF-3', edits: [['src/core/drop-rate.js', 'return (1000 * depthPmAt(d)) / depthPmAt(ref);', 'return depthPmAt(d);']] },
  /* (lane/depth-reading-fix) the authored hours are the reference COMPANY's: x1 where it holds, not at the pay's anchor */
  { name: 'the Rare odds read against the pay anchor, not the reference hold', case: 'DF-3', edits: [['src/core/drop-rate.js', 'ref = depthOf(groundId, refHeldOf(groundId));', 'ref = depthOf(groundId, row.refStep); void refHeldOf;']] },
  { name: 'no divisor for the heroes at the kill', case: 'DF-4', edits: [['src/core/trait-roll.js', '((chanceOf(hours, tr.kills) || 0) / n)', '((chanceOf(hours, tr.kills) || 0) / 1)']] },
  { name: 'pity off', case: 'DF-4', edits: [['src/core/trait-roll.js', 'if (!on) return Math.min(1, p);', 'return Math.min(1, p);']] },
  { name: 'the flame left out', case: 'DF-4', edits: [['src/core/trait-roll.js', '(tr.rarePm / 1000) * ((1000 + luck) / 1000);', '(tr.rarePm / 1000);']] },
  { name: 'a Very Rare pair of one key', case: 'DF-4', edits: [['src/core/trait-roll.js', "if (a !== b && traits[a].key !== traits[b].key && !banned.includes(tag)) seen.add(tag);", 'if (a !== b && !banned.includes(tag)) seen.add(tag);']] },
  { name: 'a rank past the ground\'s top', case: 'DF-4', edits: [['src/core/trait-roll.js', 'if (depth >= d && i + 1 <= maxRank) top = i + 1;', 'if (depth >= d) top = i + 1;']] },
  { name: 'the slot from the whole pool, not the dropped cells', case: 'DF-4', edits: [['src/core/trait-roll.js', 'const slots = traitSlotsDropped(ground, GEAR_STEPS.traitSlots);', 'const slots = Object.keys(GEAR_STEPS.traitSlots);']] },
  { name: 'the roll draws on the kill\'s r stream', case: 'DF-5', edits: [['src/core/hunt-rewards.js', 'ctx.traitDrops.rngOf(ids[i]), atMs)', 'ctx.rng, atMs)']] },
  { name: 'pity kept on the swing, not carried', case: 'DF-5', edits: [['src/core/trait-roll.js', 'pity: drops.pity || (drops.pity = {}),', 'pity: {},']] },
  { name: 'a server file hands the settle a roll', case: 'DF-6', edits: [['src/core/action-rules.js', 'export const SEED_DOMAIN =', 'export const traitDrops = null;\nexport const SEED_DOMAIN =']] },
  { name: 'another module names the roller', case: 'DF-6', edits: [['src/core/action-rules.js', 'export const SEED_DOMAIN =', "export const ROLLER = './trait-roll.js';\nexport const SEED_DOMAIN ="]] },
  { name: 'the preload list hands the settle a roll', case: 'DF-6', also: ['src/app'], edits: [['src/app/game-modules.js', 'export const GAME_MODULES =', 'export const traitDrops = null;\nexport const GAME_MODULES =']] },
];

async function main() {
  const R = makeReport('drop-formula');
  const M = await load(ROOT);
  for (const [cn, fn] of Object.entries(CASES)) {
    let why = null;
    try { why = fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
    R.ok(!why, cn + ': ' + why);
    if (!why) console.log('  ✓ ' + cn);
  }
  if (!process.argv.includes('--no-mutate')) {
    for (const mu of MUTANTS) {
      const p = plant(mu.edits, mu.also || []);
      try {
        let why = null;
        try { why = CASES[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }
        R.ok(caughtBy(why), 'mutant "' + mu.name + '" was NOT caught by ' + mu.case + missWhy(why));
        if (caughtBy(why)) console.log('  ✓ caught ' + mu.name + ' (' + mu.case + ')');
      } finally { p.done(); }
    }
  }
  R.finish();
}
main();
