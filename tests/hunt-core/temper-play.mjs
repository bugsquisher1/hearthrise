// tests/hunt-core/temper-play.mjs — TEMPERING ON THE REAL SETTLE (src/core/temper.js; PRIORITY_BOARD 2026-11-05). Run by run-all.mjs.
//
// rung-zero     every way a hero can hold no rung plays byte for byte the hunt it always played: no draw, no change.
// both-paths    max rungs, alone and as a four: a watched hunt (10 s settles) and a closed browser (10 min) land every blow alike.
// blows-pay     a full Blows ladder pays what it says: more damage, more kills, on every way to fight.
// next-tier-wins the point of one ladder per tier: a maxed Iron Blows never overtakes the next tier's kit, on any way to fight.
// armor-below-the-next-set  exact, through the engine's own functions: a maxed Armor ladder leaves more damage reaching the hero than the next
//               tier's bare set does, on every weight against the monsters of a ground that wears it (lane/c-armor-tiers' table).
// dawnsteel-rungs-play  tier 7's small ladder (0.4% a rung, 2% a track) at Krell's Hold: its rungs read as its own ladder says, both paths
//               agree, the rungs change the hunt and Armor takes what it says off. No tier 8 exists yet, so no next-tier bar.
//
// mutant-anchors: src/core/temper.js src/core/combat-sim.js src/core/member.js src/data/temper.js
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { makeReport, ROOT, plant } from './fixtures/h1.js';

const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const { loadPlay, PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);

const HOUR = 3600000, GLADE = 'mosslight_glade', WARRENS = 'coppercap_warrens';
const MAX = Object.freeze({ 'temper:blows:2': 5, 'temper:armor:2': 5, 'temper:blows:3': 5, 'temper:armor:3': 5, 'temper:blows:4': 5, 'temper:armor:4': 5,
  'temper:blows:5': 5, 'temper:armor:5': 5, 'temper:blows:6': 5, 'temper:armor:6': 5 });
const BLOWS = Object.freeze({ 'temper:blows:2': 5, 'temper:blows:3': 5 });
const SEEDS = ['-4611686018427387904', '77'];
/* A THIN ROW OF next-tier-wins IS READ ON EIGHT SEEDS (lane/b-one-difficulty, 2026-11-09). The thinnest row is the Glade's Level 24 bow: a full ladder pays +3.1%
   Level XP and the next tier's kit +4.6%, a real 1.5% between them, on main and here alike (eight seeds each). One seed's hour moves about 1.9% either way, so
   two seeds read that row as a coin: 8 of 8 seeds agreed on main, 7 of 8 here, where one pack for every group made a kill fewer and bigger (390 an hour, not
   554), and the first two summed to the ladder ahead by 0.4%. So a row whose two seeds stand under THIN clear plays six more, and all eight are judged (that
   row pools to 1.4%); every other row stands 3% to 22% clear on eight. The bar is the same: the next tier pays more, and lands more a blow. */
const MORE_SEEDS = Object.freeze(['1', '2', '3', '4', '5', '6']), THIN = 0.03;
const plus = (a, b) => Object.fromEntries(Object.keys(a).map((k) => [k, a[k] + b[k]]));
/* The ladder's own pieces at a tier, by role (gear-tiers.js). The harness's kit gives a Level 24 Ranger a tier 3 bow, so a test about tiers names them. */
const LINES = {
  plate: { 2: ['iron_helm', 'iron_platebody', 'iron_platelegs', 'iron_boots'], 3: ['steel_helm', 'steel_platebody', 'steel_platelegs', 'steel_boots'], 4: ['mithril_helm', 'mithril_platebody', 'mithril_platelegs', 'mithril_boots'],
    5: ['rune_helm', 'rune_platebody', 'rune_platelegs', 'rune_boots'], 6: ['ember_helm', 'ember_platebody', 'ember_platelegs', 'ember_boots'], 7: ['dawn_helm', 'dawn_platebody', 'dawn_platelegs', 'dawn_boots'] },
  leather: { 2: ['studded_helmet', 'studded_body', 'studded_pants', 'studded_boots'], 3: ['boarhide_helmet', 'boarhide_body', 'boarhide_pants', 'boarhide_boots'], 4: ['snakeskin_helmet', 'snakeskin_body', 'snakeskin_pants', 'snakeskin_boots'],
    5: ['wyvernhide_helmet', 'wyvernhide_body', 'wyvernhide_pants', 'wyvernhide_boots'], 6: ['dragonhide_helmet', 'dragonhide_body', 'dragonhide_pants', 'dragonhide_boots'], 7: ['dawnhide_helmet', 'dawnhide_body', 'dawnhide_pants', 'dawnhide_boots'] },
  cloth: { 2: ['adept_helmet', 'adept_body', 'adept_pants', 'adept_boots'], 3: ['scholar_helmet', 'scholar_body', 'scholar_pants', 'scholar_boots'], 4: ['warlock_helmet', 'warlock_body', 'warlock_pants', 'warlock_boots'],
    5: ['sorcerer_helmet', 'sorcerer_body', 'sorcerer_pants', 'sorcerer_boots'], 6: ['archmage_helmet', 'archmage_body', 'archmage_pants', 'archmage_boots'], 7: ['duskweave_helmet', 'duskweave_body', 'duskweave_pants', 'duskweave_boots'] },
};
/* Tier 7 is Dawnsteel's, worn from 88: Lord Krell's weapons and helms and bodies, his Tollgate and the Duskwood Codex (catalogue-coherence reachableSources) */
const WEAPON = { tank: { 2: 'iron_sword', 3: 'steel_sword', 4: 'mithril_sword', 7: 'dawn_sword' }, ranger: { 2: 'longbow', 3: 'willow_longbow', 4: 'maple_bow', 7: 'duskwood_bow' },
  mage: { 2: 'oak_wand', 3: 'willow_wand', 4: 'maple_wand', 7: 'duskwood_wand' }, healer: { 2: 'oak_staff', 3: 'willow_staff', 4: 'maple_staff', 7: 'duskwood_staff' } };
const OFF = { tank: { 2: 'ironbound_shield', 3: 'coppercap_shield', 4: 'coppercap_shield', 7: 'krells_tollgate' }, mage: { 2: 'oak_spellbook', 3: 'willow_spellbook', 4: 'maple_spellbook', 7: 'duskwood_codex' } };
/* DAWNSTEEL'S LADDER (lane/d-gold-sinks 2026-11-18; Tyler 2026-11-16 "give tier-7 Dawnsteel its own Tempering ladder", small cap): both tracks full */
const MAX7 = Object.freeze({ 'temper:blows:7': 5, 'temper:armor:7': 5 });
const HOLD = 'krells_hold', HOLD_L = 95;
const LINE_OF = { tank: 'plate', ranger: 'leather', mage: 'cloth', healer: 'cloth' };
const kitOf = (items) => (role, tier) => {
  const worn = { weapon: WEAPON[role][tier], ...(OFF[role] ? { shield: OFF[role][tier] } : {}), ...(role === 'ranger' ? { ammo: 'bronze_arrows' } : {}) };
  for (const id of LINES[LINE_OF[role]][tier]) worn[items[id].slot] = id;
  return worn;
};

/* A whole result in one string: keys sorted, since a credit map's order is the order of its first credit in a cut. */
const sorted = (x) => (Array.isArray(x) ? x.map(sorted) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sorted(x[k])])) : x);
/* One hour on the real settle: the whole result with every event in order, and what the party's blows dealt (a blow's amount is clipped to the HP it had left, as a kill is). */
function play(P, ground, L, roles, o = {}) {
  let dealt = 0, blows = 0;
  const ids = new Set(), events = [];
  const r = P.run(ground, L, roles, { spanMs: o.spanMs || HOUR, secret: o.secret || SEEDS[0], windowMs: o.windowMs || 600000,
    ...(o.temper ? { temper: o.temper } : {}), ...(o.ground ? { ground: o.ground } : {}), equipment: (role) => P.kit(role, o.tier || 2),
    onWindow: (out) => {
      for (const p of out.members) if (p.hunt && p.hunt.unit_id) ids.add(p.hunt.unit_id);
      for (const e of out.events || []) { events.push(e); if (e.type === 'dmg' && ids.has(e.u) && !ids.has(e.t)) { dealt += e.amount; blows++; } }
    } });
  return { r, dealt, blows, whole: JSON.stringify(sorted([r.totals, r.members, r.items, r.heroXp])) + JSON.stringify(events) };
}
const across = (fn, seeds = SEEDS) => seeds.map(fn).reduce((a, x) => ({ dealt: a.dealt + x.dealt, blows: a.blows + x.blows, kills: a.kills + x.r.totals.kills, xp: a.xp + x.r.totals.levelXp, falls: a.falls + x.r.totals.falls }),
  { dealt: 0, blows: 0, kills: 0, xp: 0, falls: 0 });

const cases = {
  'rung-zero': (P) => {
    for (const roles of [['ranger'], ['tank', 'healer', 'ranger', 'mage']]) {
      const base = play(P, GLADE, 24, roles, { spanMs: HOUR / 4 });
      for (const [why, temper] of [['an empty map', {}], ['rungs of 0', { 'temper:blows:2': 0, 'temper:armor:2': 0 }], ['only the next tier\'s rungs', { 'temper:blows:3': 5, 'temper:armor:3': 5 }]]) {
        const got = play(P, GLADE, 24, roles, { spanMs: HOUR / 4, temper });
        if (got.whole !== base.whole) return roles.join('+') + ', ' + why + ': the hunt changed';
      }
    }
    /* Tier 1 has no ladder: the first hours are not touched, even by a hero who bought every rung. */
    const fresh = P.run('mill_cellar', 4, ['tank'], { spanMs: HOUR / 4, secret: SEEDS[0] });
    const rich = P.run('mill_cellar', 4, ['tank'], { spanMs: HOUR / 4, secret: SEEDS[0], temper: { ...MAX, 'temper:blows:1': 5, 'temper:armor:1': 5 } });
    return JSON.stringify(fresh.totals) === JSON.stringify(rich.totals) && rich.totals.kills > 0 ? null : 'a Bronze hero with every rung changed its hunt';
  },
  'both-paths': (P) => {
    for (const [ground, L, roles, tier] of [[GLADE, 24, ['ranger'], 2], [GLADE, 24, ['tank'], 2], [GLADE, 24, ['tank', 'healer', 'ranger', 'mage'], 2], [WARRENS, 36, ['mage'], 3]]) {
      const viewed = play(P, ground, L, roles, { tier, spanMs: HOUR / 4, windowMs: 10000, temper: MAX }), closed = play(P, ground, L, roles, { tier, spanMs: HOUR / 4, windowMs: 600000, temper: MAX });
      if (viewed.whole !== closed.whole) return roles.join('+') + ' at ' + ground + ': a watched hunt and a closed browser disagree';
      const plain = play(P, ground, L, roles, { tier, spanMs: HOUR / 4 });
      if (plain.whole === closed.whole) return roles.join('+') + ' at ' + ground + ': max rungs changed nothing on this hunt';
    }
    return null;
  },
  /* Packs back at once: at the Glade's own 60 s this mage out-clears the respawn (about 650 kills an hour at any rung), so the hour's damage is the
     ground's and two seeds read a coin on it (lost on the server's map, 26,442 to 26,565, while six seeds pay +0.8%). The ladder is read where only the hero bounds it. */
  'blows-pay': (P, X) => {
    const ground = { ...X.G.HUNT_GROUNDS[GLADE], respawnMs: 5000 };
    for (const role of ['tank', 'ranger', 'mage', 'healer']) {
      const base = across((secret) => play(P, GLADE, 24, [role], { secret, ground })), full = across((secret) => play(P, GLADE, 24, [role], { secret, ground, temper: BLOWS }));
      if (!(full.dealt > base.dealt) || !(full.dealt / full.blows > (base.dealt / base.blows) * 1.015)) return role + ': a full ladder deals ' + full.dealt + ' over ' + full.blows + ' blows, rung 0 ' + base.dealt + ' over ' + base.blows;
      if (full.falls > base.falls) return role + ': a full ladder fell more (' + full.falls + ' against ' + base.falls + ')';
    }
    return null;
  },
  'next-tier-wins': (P) => {
    for (const [ground, L, tier] of [[GLADE, 24, 2], [GLADE, 29, 2], [WARRENS, 40, 3]]) {
      for (const role of ['tank', 'ranger', 'mage', 'healer']) {
        const fullOn = (seeds) => across((secret) => play(P, ground, L, [role], { tier, secret, temper: BLOWS }), seeds);
        const nextOn = (seeds) => across((secret) => play(P, ground, L, [role], { tier: tier + 1, secret }), seeds);
        let full = fullOn(SEEDS), next = nextOn(SEEDS), seeds = SEEDS;
        if (!(next.xp > full.xp * (1 + THIN))) { full = plus(full, fullOn(MORE_SEEDS)); next = plus(next, nextOn(MORE_SEEDS)); seeds = [...SEEDS, ...MORE_SEEDS]; }
        /* rung 0 is only the words' third number: played when a line needs it */
        const won = next.xp > full.xp, verbose = process.argv.includes('--verbose');
        const base = won && !verbose ? null : across((secret) => play(P, ground, L, [role], { tier, secret }), seeds);
        if (verbose) console.log('  ' + ground + ' L' + L + ' ' + role + ' tier ' + tier + ' (' + seeds.length + ' seeds): rung 0 ' + base.xp + ' XP, ' + base.falls + ' falls; full Blows XP ' + (100 * (full.xp / base.xp - 1)).toFixed(1) + '%, dealt a blow ' + (100 * (full.dealt / full.blows / (base.dealt / base.blows) - 1)).toFixed(1) + '%; next tier XP ' + (100 * (next.xp / base.xp - 1)).toFixed(1) + '%, dealt a blow ' + (100 * (next.dealt / next.blows / (base.dealt / base.blows) - 1)).toFixed(1) + '%');
        if (!won) return role + ' at Level ' + L + ': a full Blows ladder earns ' + full.xp + ' XP, the next tier\'s kit ' + next.xp + ' (rung 0 ' + base.xp + ')';
        if (!(next.dealt / next.blows > full.dealt / full.blows)) return role + ' at Level ' + L + ': a full ladder lands ' + (full.dealt / full.blows).toFixed(2) + ' a blow, the next tier ' + (next.dealt / next.blows).toFixed(2);
      }
    }
    return null;
  },
  /* Damage reaching HP per monster swing, over the ground's own mix, at each monster's max hit: exact, no dice. */
  'armor-below-the-next-set': (P, X) => {
    const { mitigationOf, mitigate, armourValues } = X.MI;
    const swing = (values, armorPm, monsters) => {
      let sum = 0;
      for (const k of monsters) {
        const row = X.MONSTERS[k], L = X.monsterLevelOf(row), mit = mitigationOf(values, L), blow = Math.max(1, Math.floor(X.monsterMaxHit(row)));
        /* mean of the two whole answers, on a rigged draw that reports its chance */
        let p = 0;
        const lo = mitigate(blow, 1000, mit, armorPm, { chance: (c) => { p = c; return false; } }), hi = mitigate(blow, 1000, mit, armorPm, { chance: () => true });
        sum += (1 - mit.dodgePm / 1000) * (lo + p * (hi - lo));
      }
      return sum / monsters.length;
    };
    const setOf = (line, tier) => Object.fromEntries(line[tier].map((id) => [X.ITEMS[id].slot, id]));
    const monstersOf = (g) => [...new Set(X.G.OPEN_GROUNDS[g].pockets.flatMap((p) => p.spawns.map((s) => s.monster)))];
    let thinnest = 1e9;
    for (const [weight, line] of Object.entries(LINES)) {
      /* a tier's rows are the grounds that tier is worn on: Iron and Studded at the Sewer and the Glade, Steel and Boarhide at the Warrens; the
         March's three (lane/d-audit-balance-2, temper.js tiers 4 to 6): Mithril at the Ford and the Slake, Rune at the Barrows, Emberforged at the
         Hold, each against the next tier's bare set. Tier 6's bar is bare Dawnsteel (tier 7), worn from 88, so it is read at the Hold (85 to
         110), where it is worn. Not at the Pyre Field (70 to 90): there a plate hero in Emberforged already sits at the armor cap (a full ladder takes
         3.4%, not 5%) and Dawnsteel only 2.3%, so a maxed Emberforged set lets 1.2% less through than bare Dawnsteel; neither moves much there */
      for (const [tier, grounds] of [[2, [GLADE, 'millrace_sewer']], [3, [WARRENS]], [4, ['hasks_ford', 'the_slake']], [5, ['muster_barrows']], [6, ['krells_hold']]]) {
        for (const g of grounds) {
          const mons = monstersOf(g);
          const set = setOf(line, tier), next = setOf(line, tier + 1);
          const armorPm = X.T.armorPmOf(set, X.ITEMS, MAX);
          if (armorPm !== X.TD.TEMPER_RUNGS * X.TD.TEMPER_RUNG_PM) return weight + ' tier ' + tier + ': a whole set reads ' + armorPm + ' pm';
          const plain = swing(armourValues(set, X.ITEMS), 0, mons), full = swing(armourValues(set, X.ITEMS), armorPm, mons), up = swing(armourValues(next, X.ITEMS), 0, mons);
          /* the ruling's unit: what a full ladder takes off, never past its 5% */
          const off = 100 * (1 - full / plain);
          if (off > 5.5) return weight + ' tier ' + tier + ' at ' + g + ': a full ladder takes ' + off.toFixed(1) + '% off what reaches the hero';
          if (off < 2) return weight + ' tier ' + tier + ' at ' + g + ': a full ladder takes only ' + off.toFixed(1) + '% off what reaches the hero';
          const margin = 100 * (1 - up / full);
          thinnest = Math.min(thinnest, margin);
          if (process.argv.includes('--verbose')) console.log('  ' + weight + ' tier ' + tier + ' at ' + g + ': a swing lets ' + plain.toFixed(2) + ' through, ' + full.toFixed(2) + ' at rung 5 (-' + off.toFixed(1) + '%), the next set ' + up.toFixed(2) + ' (' + margin.toFixed(1) + '% under rung 5)');
          if (!(margin > 0)) return weight + ' tier ' + tier + ' at ' + g + ': a maxed set lets ' + full.toFixed(2) + ' through a swing, the next tier\'s bare set ' + up.toFixed(2);
        }
      }
    }
    if (process.argv.includes('--verbose')) console.log('  thinnest margin of the next set over a maxed one: ' + thinnest.toFixed(1) + '%');
    return null;
  },
  /* A TIER 7 HERO'S RUNGS PLAY (lane/d-gold-sinks): a Level 95 hero in Dawnsteel at Krell's Hold, where it is worn. Its five rungs read as its ladder says
     (0.4% a rung, 2% a track, never a tier's 1%, a forged 9 included), a watched hunt and a closed browser land every blow alike with them on, they
     change the hunt, and the Armor rungs take what they say off what reaches the hero, exactly, inside the small cap (Tyler 2026-11-15/16: about +2-3%). */
  'dawnsteel-rungs-play': (P, X) => {
    const ladder = X.TD.temperLadder('armor', 7), top = ladder ? ladder.rungs * ladder.pm : 0;
    if (!(top >= 20 && top <= 30)) return 'Dawnsteel\'s ladder is ' + top + ' pm, outside the small cap';
    for (const role of ['tank', 'ranger', 'mage', 'healer']) {
      const kit = P.kit(role, 7);
      for (const t of [MAX7, { 'temper:blows:7': 9, 'temper:armor:7': 9 }]) {
        if (X.T.blowsPmOf(kit, X.ITEMS, t) !== top || X.T.armorPmOf(kit, X.ITEMS, t) !== top) return role + ' in Dawnsteel at ' + JSON.stringify(t) + ' reads ' + X.T.blowsPmOf(kit, X.ITEMS, t) + ' and ' + X.T.armorPmOf(kit, X.ITEMS, t) + ' pm, its ladder says ' + top;
      }
      /* Emberforged's rungs are Emberforged's: a tier 7 kit reads none of them */
      if (X.T.blowsPmOf(kit, X.ITEMS, MAX) !== 0 || X.T.armorPmOf(kit, X.ITEMS, MAX) !== 0) return role + ': tiers 2 to 6\'s rungs pay on Dawnsteel';
    }
    for (const roles of [['tank'], ['tank', 'healer', 'ranger', 'mage']]) {
      const o = { tier: 7, spanMs: HOUR / 4, temper: MAX7 };
      const viewed = play(P, HOLD, HOLD_L, roles, { ...o, windowMs: 10000 }), closed = play(P, HOLD, HOLD_L, roles, { ...o, windowMs: 600000 });
      if (viewed.whole !== closed.whole) return roles.join('+') + ' at the Hold: a watched hunt and a closed browser disagree';
      if (play(P, HOLD, HOLD_L, roles, { tier: 7, spanMs: HOUR / 4 }).whole === closed.whole) return roles.join('+') + ' at the Hold: a full ladder changed nothing';
    }
    /* NOT READ HERE: what a full Blows ladder adds a blow on the settle. 2% sits under one hour's noise at the Hold (eight seeds of an hour, measured
       2026-11-18: a tank +1.4%, a Mage +1.9%, a bow +0.3% a blow, the kill's overkill clipped off), so a bar there would be a coin. The magnitude is
       exact in tests/hunt-core/temper.mjs: the-mean-is-exact (20 pm), blows-raise-what-lands (the hook), dawnsteel-takes-smaller-rungs (the kit reads 20). */
    const { mitigationOf, mitigate, armourValues } = X.MI;
    const mons = [...new Set(X.G.OPEN_GROUNDS[HOLD].pockets.flatMap((p) => p.spawns.map((s) => s.monster)))];
    for (const [weight, line] of Object.entries(LINES)) {
      const set = Object.fromEntries(line[7].map((id) => [X.ITEMS[id].slot, id])), values = armourValues(set, X.ITEMS);
      let plain = 0, full = 0;
      for (const k of mons) {
        const row = X.MONSTERS[k], mit = mitigationOf(values, X.monsterLevelOf(row)), blow = Math.max(1, Math.floor(X.monsterMaxHit(row)));
        const mean = (pm) => { let p = 0; const lo = mitigate(blow, 1000, mit, pm, { chance: (c) => { p = c; return false; } }), hi = mitigate(blow, 1000, mit, pm, { chance: () => true }); return (1 - mit.dodgePm / 1000) * (lo + p * (hi - lo)); };
        plain += mean(0); full += mean(X.T.armorPmOf(set, X.ITEMS, MAX7));
      }
      const off = 100 * (1 - full / plain);
      if (process.argv.includes('--verbose')) console.log('  ' + weight + ' Dawnsteel at the Hold: a full Armor ladder takes ' + off.toFixed(2) + '% off what reaches the hero');
      if (off > top / 10 + 0.3) return weight + ' Dawnsteel: a full Armor ladder takes ' + off.toFixed(2) + '% off, past the ladder\'s ' + top / 10 + '%';
      if (off < 0.8) return weight + ' Dawnsteel: a full Armor ladder takes only ' + off.toFixed(2) + '% off what reaches the hero';
    }
    return null;
  },
};

const T = 'src/core/temper.js';
const mutants = [
  { name: 'the settle never puts the rungs on the hero', case: 'blows-pay', edits: [['src/core/combat-sim.js', '  if (snap.blowsPm) u.blowsPm = snap.blowsPm; else if (u.blowsPm) delete u.blowsPm;\n', '']] },
  { name: 'the member never reads the server\'s rungs', case: 'blows-pay', edits: [['src/core/member.js', 'temper: mi.perks && mi.perks.temper ? mi.perks.temper : null };', 'temper: null };']] },
  { name: 'the part of a point is drawn from the wall clock, so two cuts disagree', case: 'both-paths', edits: [[T, 'part > 0 && rng.chance(part / 1000)', 'part > 0 && Math.random() < part / 1000']] },
  { name: 'tier 1 is tempered too', case: 'rung-zero', edits: [['src/data/temper.js', '  2: Object.freeze([2000,', '  1: Object.freeze([1, 2, 3, 4, 5]),\n  2: Object.freeze([2000,']] },
  { name: 'a rung is worth 5%, so a maxed ladder beats the next tier', case: 'next-tier-wins', edits: [['src/data/temper.js', 'export const TEMPER_RUNG_PM = 10;', 'export const TEMPER_RUNG_PM = 50;']] },
  { name: 'a rung is worth 5%, so a maxed Armor ladder beats the next set', case: 'armor-below-the-next-set', edits: [['src/data/temper.js', 'export const TEMPER_RUNG_PM = 10;', 'export const TEMPER_RUNG_PM = 50;']] },
  { name: 'a rung is worth almost nothing', case: 'armor-below-the-next-set', edits: [['src/data/temper.js', 'export const TEMPER_RUNG_PM = 10;', 'export const TEMPER_RUNG_PM = 2;']] },
  { name: 'Dawnsteel has no ladder', case: 'dawnsteel-rungs-play', edits: [['src/data/temper.js', '  7: Object.freeze([40000, 80000, 160000, 320000, 640000]),\n', '']] },
  { name: 'a Dawnsteel rung pays a tier\'s 1%', case: 'dawnsteel-rungs-play', edits: [['src/data/temper.js', 'export const TEMPER_TIER_RUNG_PM = Object.freeze({ 7: 4 });', 'export const TEMPER_TIER_RUNG_PM = Object.freeze({});']] },
  { name: 'Armor never reads a tier 7 piece\'s own rung', case: 'dawnsteel-rungs-play', edits: [[T, "rungs += def * temperRung(temper, 'armor', t) * rungPmOf('armor', t)", "rungs += def * temperRung(temper, 'armor', Math.min(t, 6)) * rungPmOf('armor', Math.min(t, 6))"]] },
];

const R = makeReport('hunt-core/temper-play');
const load = async (root) => {
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  const combat = await imp('src/core/combat.js'), mon = await imp('src/data/monsters.js');
  const P = await loadPlay(root);
  P.kit = kitOf(P.ITEMS);
  return { P, X: { MI: await imp('src/core/mitigation.js'), T: await imp('src/core/temper.js'), TD: await imp('src/data/temper.js'), ITEMS: (await imp('src/data/items.js')).ITEMS,
    MONSTERS: mon.MONSTERS, monsterLevelOf: mon.monsterLevelOf, monsterMaxHit: combat.monsterMaxHit, G: await imp('src/data/hunt-grounds.js') } };
};
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
const home = await load(ROOT);
for (const [cn, fn] of Object.entries(cases).filter(([k]) => !ONLY || ONLY.includes(k))) {
  let why = null;
  try { why = fn(home.P, home.X); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
const PICKED = mutants.filter((m) => !ONLY || ONLY.includes(m.case));
for (const mu of PICKED) {
  const p = plant(mu.edits, [...PLAY_TREES, 'tests/hunt-core/fixtures']);
  try {
    let why = null;
    try { const m = await load(p.root); why = cases[mu.case](m.P, m.X); } catch (e) { why = 'threw ' + e.message; }
    R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
    if (why && process.argv.includes('--verbose')) console.log('  caught: ' + mu.name + ' -> ' + why);
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + (ONLY ? ONLY.length : Object.keys(cases).length) + ' cases, ' + PICKED.length + ' mutants caught');
R.finish();
