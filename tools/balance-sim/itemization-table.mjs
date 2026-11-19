#!/usr/bin/env node
// tools/balance-sim/itemization-table.mjs — THE 2026-11-18 ITEMIZATION AUDIT'S NUMBERS, ON THE REAL SETTLE
// (designer, lane/d-itemization-audit). A measuring tool: it grades nothing and changes nothing.
//
//   node tools/balance-sim/itemization-table.mjs day   [--hours 2] [--seeds 2] [--styles hammer,tank]
//        one hunting hour on every open ground at the middle of its band, a lone hero on Normal in the Level's kit:
//        Level XP, main-skill XP, coin and sold loot, the store bill, gear pieces an hour, hours a Rare
//   node tools/balance-sim/itemization-table.mjs steps [--hours 2] [--seeds 2] [--styles hammer,tank] [--at glade]
//        what ONE upgrade is worth with everything else equal (same seeds, so the dice are paired): the weapon a tier
//        behind, the armor a tier behind, a full Tempering track, ten trained skill levels, the crafted ring plain and
//        Hallmarked, the cape, the Tower weapon of the tier
//   node tools/balance-sim/itemization-table.mjs sample [--at glade,warrens] [--only Steady,Focus] [--styles ...]
//        the phase 2 jewelry sample, each new piece and perk alone and the sample set against the set a tier down
//   node tools/balance-sim/itemization-table.mjs sets [--at glade,warrens] [--styles ...]
//        every tier's full set worn, all six (two rings, earrings, necklace, cloak, the kit's belt), plain and Hallmarked, and one tier down
//   node tools/balance-sim/itemization-table.mjs built-for [--at glade]
//        Steady and Focus where each is meant to shine (the main skill ten under the Level)
//
// Every number is read off the engine's own events (cell.mjs). Nothing here computes a combat or gold number.
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCellRunner } from './cell.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const mode = process.argv[2];
const hours = Number(arg('hours', 2)), seeds = Number(arg('seeds', 2));
const styles = String(arg('styles', 'hammer,tank')).split(',');

/* ground, the Level a hero stands on it (the middle of its band), the gear tier worn there */
const DAY = [
  ['meadowbrook_thicket', 10, 1], ['wickstead', 13, 1], ['millrace_sewer', 18, 2], ['mosslight_glade', 24, 2],
  ['coppercap_warrens', 40, 3], ['hasks_ford', 52, 4], ['the_slake', 57, 4], ['muster_barrows', 65, 5],
  ['pyre_field', 80, 5], ['krells_hold', 95, 6],
];
const MAIN = { hammer: 'melee', tank: 'melee', sword: 'melee', axes: 'melee', bow: 'ranged', crossbow: 'ranged', mage: 'magic', healer: 'magic' };
const pct = (a, b) => (b ? ((a / b - 1) * 100).toFixed(1) + '%' : 'n/a');

async function day() {
  const R = await loadCellRunner(ROOT);
  console.log('ground | Level | way | Level XP/h | main skill XP/h | Defense XP/h | coin+loot g/h | store g/h | net g/h | gear pieces/h | a Rare every (h) | deaths | low HP p10 %');
  for (const [ground, level] of DAY) for (const s of styles) {
    let m;
    try { m = R.runCell({ id: ['IT-day', ground, level, s].join(':'), ground, party: [s], level, hours, seeds }); } catch (e) { console.log([ground, level, s, 'ERROR ' + e.message].join(' | ')); continue; }
    const h = m.heroes[0];
    const pieces = Object.values(h.gearPerH || {}).reduce((a, b) => a + b, 0);
    console.log([ground, level, s, h.levelXpPerH, (h.skillXpPerH || {})[MAIN[s]] || 0, (h.skillXpPerH || {}).defense || 0, h.incomePerH, h.storePerH, h.profitPerH,
      pieces.toFixed(2), h.rareEveryH === null ? 'none seen' : h.rareEveryH, h.deaths, h.encMinHpPct.p10].join(' | '));
  }
}

/* where a step is measured: ground, Level, the gear tier worn, the Tower weapon of that tier by style, the temper tier */
const AT = {
  glade: { ground: 'mosslight_glade', level: 24, tier: 2, tower: { hammer: 'millwrights_mallet', tank: 'palisade_sword', bow: 'fowling_bow', mage: 'lamplighters_wand' } },
  warrens: { ground: 'coppercap_warrens', level: 42, tier: 3, tower: {} },
  slake: { ground: 'the_slake', level: 57, tier: 4, tower: { hammer: 'quarry_maul', tank: 'tollkeepers_sword', bow: 'ferrymans_bow', mage: 'chandlers_wand' } },
  /* at 80 the kit is Emberforged (worn from 75), so the Tempering rows name tier 6. At the Hold (95) the weapon, body and helm are
     Krell's tier 7, which has no ladder: its Blows row reads nothing and its Armor row only the tier-6 pieces' share. */
  pyre: { ground: 'pyre_field', level: 80, tier: 6, tower: {} },
  hold: { ground: 'krells_hold', level: 95, tier: 6, tower: { hammer: 'passing_bell_hammer', tank: 'bierguard_sword', bow: 'vigil_bow', mage: 'sextons_wand' } },
};

async function steps() {
  const R = await loadCellRunner(ROOT);
  const wanted = String(arg('at', Object.keys(AT).join(','))).split(',');
  console.log('where | way | what changed | Level XP/h | vs base | damage taken/h | vs base | store g/h | net g/h | deaths | low HP p10 %');
  for (const key of wanted) {
    const a = AT[key];
    if (!a) { console.log('no such place ' + key); continue; }
    for (const s of styles) {
      const L = a.level, main = MAIN[s];
      const even = { melee: L, ranged: L, magic: L, defense: L };
      const rows = [
        ['base: the Level\'s kit, skills at Level', {}],
        ['weapon one tier behind', { gear: { tierOffset: -1, only: 'weapon' } }],
        ['armor one tier behind (all six slots)', { gear: { tierOffset: -1, only: 'armour' } }],
        ['Tempering, Blows 5 of 5', { temper: { ['temper:blows:' + a.tier]: 5 } }],
        ['Tempering, Armor 5 of 5', { temper: { ['temper:armor:' + a.tier]: 5 } }],
        ['main skill +5 (training)', { skillsBySeat: [{ ...even, [main]: L + 5 }] }],
        ['main skill +10 (training)', { skillsBySeat: [{ ...even, [main]: L + 10 }] }],
        ['Defense +10 (training)', { skillsBySeat: [{ ...even, defense: L + 10 }] }],
        ['skills 10 UNDER Level (a hero who never trains and parties)', { skillsBySeat: [{ ...even, [main]: Math.max(1, L - 10) }] }],
        ['+ Banded Signet, plain', { gear: { also: { ring: 'banded_signet' } } }],
        ['+ Hallmarked Banded Signet (Keen, Follow-through)', { gear: { also: { ring: 'banded_signet_keen_follow' } } }],
        ['+ Houndskin Cloak', { gear: { also: { cape: 'houndskin_cloak' } } }],
        ['+ Shop jewelry (Copper Ring, Hunter Necklace, Copper Studs)', { gear: { also: { ring: 'copper_ring', necklace: 'hunter_necklace', earrings: 'copper_studs' } } }],
      ];
      if (a.tower[s]) rows.push(['Tower weapon of the tier (' + a.tower[s] + ')', { gear: { also: { weapon: a.tower[s] } } }]);
      let base = null;
      for (const [label, patch] of rows) {
        let m;
        try { m = R.runCell({ id: ['IT-step', key, s, label].join(':'), ground: a.ground, party: [s], level: L, hours, seeds, ...patch }); } catch (e) { console.log([key, s, label, 'ERROR ' + e.message].join(' | ')); continue; }
        const h = m.heroes[0];
        if (!base) base = h;
        console.log([key + ' L' + L, s, label, h.levelXpPerH, pct(h.levelXpPerH, base.levelXpPerH), h.takenPerH, pct(h.takenPerH, base.takenPerH), h.storePerH, h.profitPerH, h.deaths, h.encMinHpPct.p10].join(' | '));
      }
    }
  }
}

/* THE PHASE 2 JEWELRY SAMPLE (lane/d-jewelry-sample, 2026-11-18): what each new piece and perk is worth with everything else equal
   (same seeds, so the dice are paired), against the plan's budget (docs/design/itemization-plan.md §4: one perk in an ordinary hunt
   about 1% XP or 2% less damage, about three times that in the case it is built for; a whole set one tier up at most one weapon step).
   `sample` plays the Glade (tier 2, Level 24) and the Warrens (tier 3, Level 42) in the Level's kit with no accessories, then each piece
   alone; `built-for` plays each new perk where it is meant to shine: Steady for a hero ten skill levels under its Level (more misses),
   Focus for a caster who spends its mana. */
const SAMPLE = {
  glade: [
    ['+ Fang Studs, plain', { earrings: 'fang_studs' }],
    ['+ Fang Studs (Steady)', { earrings: 'fang_studs_steady' }],
    ['+ Fang Studs (Focus)', { earrings: 'fang_studs_focus' }],
    ['+ Hallmarked Fang Studs (Steady, Focus)', { earrings: 'fang_studs_steady_focus' }],
    ['+ Wolfbone Necklace, plain', { necklace: 'wolfbone_torc' }],
    ['+ Banded Signet x2, plain', { ring1: 'banded_signet', ring2: 'banded_signet' }],
    ['+ Hallmarked Banded Signet x2 (Keen, Follow) (Keen, Surge)', { ring1: 'banded_signet_keen_follow', ring2: 'banded_signet_keen_surge' }],
  ],
  warrens: [
    ['+ Banded Signet x2, plain (the tier below)', { ring1: 'banded_signet', ring2: 'banded_signet' }],
    ['+ Seam Jasper Band x2, plain', { ring1: 'seam_jasper_band', ring2: 'seam_jasper_band' }],
    ['+ Hallmarked Banded Signet x2 (Keen, Follow) (Keen, Surge)', { ring1: 'banded_signet_keen_follow', ring2: 'banded_signet_keen_surge' }],
    ['+ Hallmarked Seam Jasper Band x2, reforged (Keen, Follow) (Keen, Surge)', { ring1: 'seam_jasper_band_keen_follow', ring2: 'seam_jasper_band_keen_surge' }],
    ['+ Warband Bulwark, plain', { cape: 'warband_bulwark' }],
    ['+ Houndskin Cloak, plain (the tier below)', { cape: 'houndskin_cloak' }],
    ['+ Fang Studs (Steady)', { earrings: 'fang_studs_steady' }],
    ['+ Fang Studs (Focus)', { earrings: 'fang_studs_focus' }],
    ['the full sample set: Seam Jasper Bands (Hallmarked), Hallmarked Fang Studs, Wolfbone Necklace, Warband Bulwark',
      { ring1: 'seam_jasper_band_keen_follow', ring2: 'seam_jasper_band_keen_surge', earrings: 'fang_studs_steady_focus', necklace: 'wolfbone_torc', cape: 'warband_bulwark' }],
    ['the same set one tier down: Banded Signets (Hallmarked), Hallmarked Fang Studs, Wolfbone Necklace, Houndskin Cloak',
      { ring1: 'banded_signet_keen_follow', ring2: 'banded_signet_keen_surge', earrings: 'fang_studs_steady_focus', necklace: 'wolfbone_torc', cape: 'houndskin_cloak' }],
  ],
};

async function sample() {
  const R = await loadCellRunner(ROOT);
  const builtFor = mode === 'built-for';
  const only = String(arg('only', '')).split(',').filter(Boolean);
  const wanted = String(arg('at', builtFor ? 'glade' : 'glade,warrens')).split(',');
  console.log('where | way | what changed | Level XP/h | vs base | damage taken/h | vs base | casts/h | deaths | low HP p10 %');
  for (const key of wanted) {
    const a = AT[key];
    if (!a) { console.log('no such place ' + key); continue; }
    for (const s of styles) {
      const L = a.level, main = MAIN[s];
      /* built-for Steady: the main skill ten under the Level (the miss case); Focus is read off the same rows on a caster */
      const patch = builtFor ? { skillsBySeat: [{ melee: L, ranged: L, magic: L, defense: L, [main]: Math.max(1, L - 10) }] } : {};
      const rows = [['base: the Level\'s kit, no accessories' + (builtFor ? ', main skill 10 under' : ''), {}]]
        .concat(builtFor ? [['+ Fang Studs, plain', { earrings: 'fang_studs' }], ['+ Fang Studs (Steady)', { earrings: 'fang_studs_steady' }],
          ['+ Fang Studs (Focus)', { earrings: 'fang_studs_focus' }]] : SAMPLE[key] || [])
        /* --only a,b: the rows whose label holds one of these words (the base always plays) */
        .filter(([label], i) => i === 0 || !only.length || only.some((w) => label.includes(w)));
      let base = null;
      for (const [label, also] of rows) {
        let m;
        try { m = R.runCell({ id: ['IT-sample', key, s, label, builtFor].join(':'), ground: a.ground, party: [s], level: L, hours, seeds, ...patch, gear: { also } }); } catch (e) { console.log([key, s, label, 'ERROR ' + e.message].join(' | ')); continue; }
        const h = m.heroes[0];
        if (!base) base = h;
        const casts = Object.values(h.castsPerH || {}).reduce((x, y) => x + y, 0);
        console.log([key + ' L' + L, s, label, h.levelXpPerH, pct(h.levelXpPerH, base.levelXpPerH), h.takenPerH, pct(h.takenPerH, base.takenPerH),
          casts.toFixed(0), h.deaths, h.encMinHpPct.p10].join(' | '));
      }
    }
  }
}

/* THE SET CHECK (itemization plan §4 "The power budget": every tier's full set is measured with all six pieces worn before it ships; the
   whole set one tier up, fully Hallmarked, is at most one weapon step, 5 to 9% XP). All six: two rings, the earrings, the necklace and the
   cloak named here, the belt the Level's kit wears (gear.mjs kitOf, the armour line's). A tier with no crafted piece of its own in a slot
   wears the tier below's (tier 3 has no earrings or necklace yet). Each row against the Level's kit with no accessories (the belt kept). */
const SETS = {
  2: { plain: { ring1: 'banded_signet', ring2: 'banded_signet', earrings: 'fang_studs', necklace: 'wolfbone_torc', cape: 'houndskin_cloak' },
    hallmarked: { ring1: 'banded_signet_keen_follow', ring2: 'banded_signet_keen_surge', earrings: 'fang_studs_steady_focus', necklace: 'wolfbone_torc', cape: 'houndskin_cloak' } },
  3: { plain: { ring1: 'seam_jasper_band', ring2: 'seam_jasper_band', earrings: 'fang_studs', necklace: 'wolfbone_torc', cape: 'warband_bulwark' },
    hallmarked: { ring1: 'seam_jasper_band_keen_follow', ring2: 'seam_jasper_band_keen_surge', earrings: 'fang_studs_steady_focus', necklace: 'wolfbone_torc', cape: 'warband_bulwark' } },
};
async function sets() {
  const R = await loadCellRunner(ROOT);
  const wanted = String(arg('at', 'glade,warrens')).split(',');
  console.log('where | way | what is worn | Level XP/h | vs no accessories | damage taken/h | vs no accessories | deaths');
  const step = [], byKit = {};
  for (const key of wanted) {
    const a = AT[key];
    if (!a || !SETS[a.tier]) { console.log('no set for ' + key); continue; }
    const rows = [['no accessories (the kit\'s belt)', {}], ['tier ' + a.tier + ' set, plain', SETS[a.tier].plain], ['tier ' + a.tier + ' set, Hallmarked', SETS[a.tier].hallmarked]]
      .concat(SETS[a.tier - 1] ? [['tier ' + (a.tier - 1) + ' set, Hallmarked (one tier down)', SETS[a.tier - 1].hallmarked]] : []);
    for (const s of styles) {
      let base = null;
      const xp = {};
      for (const [label, also] of rows) {
        const h = R.runCell({ id: ['IT-sets', key, s, label].join(':'), ground: a.ground, party: [s], level: a.level, hours, seeds, gear: { also } }).heroes[0];
        if (!base) base = h;
        xp[label] = h.levelXpPerH;
        ((byKit[key] ||= {})[label] ||= {})[s] = h.levelXpPerH;
        console.log([key + ' L' + a.level, s, label, h.levelXpPerH, pct(h.levelXpPerH, base.levelXpPerH), h.takenPerH, pct(h.takenPerH, base.takenPerH), h.deaths].join(' | '));
      }
      const up = xp['tier ' + a.tier + ' set, Hallmarked'], down = xp['tier ' + (a.tier - 1) + ' set, Hallmarked (one tier down)'];
      if (down) step.push([key, s, pct(up, down)]);
    }
  }
  if (step.length) console.log('\nthe set one tier up, both Hallmarked (budget: at most one weapon step, 5 to 9% XP)\n' + step.map((r) => r.join(' | ')).join('\n'));
  /* A REPORT ROW, NOT A BAR (designer 2026-11-18): "jewelry never lifts a way above the best way in the same kit". Per place and kit, the way
     that leads with no accessories, the way that leads wearing this kit, and every way the kit lifts above the bare leader's own reading. */
  console.log('\njewelry never lifts a way above the best way in the same kit (report)\nwhere | kit | leader bare | leader in this kit | ways in this kit above the leader in the same kit');
  for (const [key, kits] of Object.entries(byKit)) {
    const labels = Object.keys(kits), bare = kits[labels[0]];
    const lead = (row) => Object.entries(row).sort((a, b) => b[1] - a[1])[0];
    const [bWay, bXp] = lead(bare);
    for (const label of labels.slice(1)) {
      const row = kits[label], [kWay, kXp] = lead(row);
      /* in the same kit: every way wears it, so a way that passes the bare leader's way (also wearing it) is lifted above the best way */
      const above = Object.entries(row).filter(([w, x]) => w !== bWay && x > row[bWay]).map(([w, x]) => w + ' ' + pct(x, row[bWay]));
      console.log([key, label, bWay + ' ' + bXp, kWay + ' ' + kXp, above.length ? above.join(', ') : 'none'].join(' | '));
    }
  }
}

if (mode === 'sample' || mode === 'built-for') await sample();
else if (mode === 'sets') await sets();
else if (mode === 'day') await day();
else if (mode === 'steps') await steps();
else console.log('usage: node tools/balance-sim/itemization-table.mjs day|steps|sample|built-for|sets [--hours 2] [--seeds 2] [--styles hammer,tank] [--at glade,slake]');
