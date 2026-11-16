#!/usr/bin/env node
// tools/balance-sim/temper-dawn-table.mjs — TEMPERING DAWNSTEEL (TIER 7, WORN FROM 88), sized on the real engine before it is built
// (designer, lane/d-temper-dawnsteel; Tyler 2026-11-16 "yes": tier-7 Dawnsteel gets its own Tempering ladder so the gold sink keeps
// growing from Level 88 to 110, a small cap, sized with the simulator like the uniques ladder; the design is docs/planning/PRIORITY_BOARD.md
// "2026-11-16 Tempering Dawnsteel"). A measuring tool: it grades nothing and writes nothing to src/.
//
//   node tools/balance-sim/temper-dawn-table.mjs gold [--hours 2] [--seeds 4]
//        THE GOLD CURVE FROM 88 TO 110: a lone sword-and-shield tank on Normal where the game sends it (hunt-list.js recommendedHunt: Krell's
//        Hold the whole span), in the gear ladder's kit (from 88 it reads Krell's drops: his Dawnsteel helm, body and sword over Emberforged), at 88, 95, 102 and 109:
//        Level XP an hour and net gold an hour (coin and sold loot with rares, less the store). The span's hours and gold are the sum over its
//        Levels of (XP to the next Level / XP an hour) and that times net gold an hour, read straight between the measured Levels; then what
//        a tier-7 ladder (src/data/temper.js TEMPER_TIERS[7], both tracks) asks of it.
//
//   node tools/balance-sim/temper-dawn-table.mjs next
//        THE NEXT ARMOR STILL WINS (no fights; mitigation.js and temper.js themselves, as tests/temper-uniques.mjs reads the bands): each weight's
//        whole Dawnsteel set fully tempered at a 1% to 5% ladder, against the armor line's bare set worn from 110 (Dawnsteel's armor itself),
//        122 (the Night Shift, the first band-110 piece above Dawnsteel) and 125 (Wyvern Roost), on Krell's Hold and every drafted ground
//        past it; and what a whole ladder takes off on Krell's Hold, where Dawnsteel is worn. Then Blows: a Dawnsteel weapon's max hit with a
//        full ladder against the same weapon on the weapon line (Tyler 2026-11-16, damage x Level / 110) worn from 115, 122 and 125.
//
//   node tools/balance-sim/temper-dawn-table.mjs bars [--seeds 3] [--hours 2] [--level 98]
//        A FULLY TEMPERED DAWNSTEEL HERO DOESN'T MOVE THE LIVE BARS: Krell's Hold and the Pyre Field, the sheet's cells (Normal lone low point,
//        Dangerous and Deadly deaths per 16 hero-hours), each seat in its weight's whole Dawnsteel set and weapon, bare and with both tracks full.
//
// Exit 0 when every cell ran; 1 otherwise.
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const mode = process.argv[2];
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const u = (p) => pathToFileURL(join(ROOT, p)).href;
const SLOTS = ['helmet', 'body', 'pants', 'boots', 'gloves', 'belt'];
const WEIGHTS = ['plate', 'leather', 'cloth'];
const LINE_OF = { tank: 'plate', sword: 'plate', hammer: 'plate', axes: 'plate', bow: 'leather', crossbow: 'leather', mage: 'cloth', healer: 'cloth' };
/* Each way to fight's tier-7 weapon (gear-tiers.js WEAPON_FAMILIES at Dawnsteel; every one drops off Lord Krell, krells_hold pack.js). */
const WEAPON_OF = { tank: 'dawn_sword', sword: 'dawn_sword', hammer: 'dawn_warhammer', axes: 'dawn_hatchets', bow: 'duskwood_bow', crossbow: 'duskwood_crossbow', mage: 'duskwood_wand', healer: 'duskwood_staff' };
const head = (title, cols) => { console.log('\n' + title); console.log('| ' + cols.join(' | ') + ' |'); console.log('|' + cols.map(() => '---').join('|') + '|'); };
const line = (cells) => console.log('| ' + cells.join(' | ') + ' |');
const k = (n) => (Math.abs(n) >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.round(n / 1000) + 'k');

/* The tier-7 ladder as data says it, both tracks full (temper:<track>:7 at its rung count). */
async function fullDawn() {
  const TD = await import(u('src/data/temper.js'));
  const l = TD.temperLadder('armor', 7);
  if (!l) return null;
  return { 'temper:armor:7': l.rungs, 'temper:blows:7': l.rungs };
}

/* ── THE GOLD CURVE, 88 TO 110 ── */
async function gold() {
  const HOURS = Number(arg('hours', 2)), SEEDS = Number(arg('seeds', 4));
  const LEVELS = [88, 95, 102, 109];
  const { loadCellRunner } = await import(u('tools/balance-sim/cell.mjs'));
  const R = await loadCellRunner(ROOT);
  const { BUILD } = await import(u('src/build-info.js'));
  const { recommendedHunt } = await import(u('src/shell/hunt-list.js') + '?v=' + BUILD.version);
  const TD = await import(u('src/data/temper.js'));
  head('THE GOLD CURVE FROM 88 TO 110: a lone tank on Normal where the game sends it, in the gear ladder\'s kit. ' + SEEDS + ' seeds x ' + HOURS + ' h a cell.',
    ['Ground', 'Level', 'Level XP/h', 'coin+loot g/h', 'rares g/h', 'store g/h', 'net g/h (with rares)', 'deaths', 'low %']);
  const pts = [];
  let kit = null;
  for (const L of LEVELS) {
    const ground = recommendedHunt([L], 1).hunt;
    /* the gear ladder's own kit: from 88 it reads Krell's drops, so it is his Dawnsteel helm, body and sword over Emberforged (printed below) */
    const m = R.runCell({ id: 'TD:' + ground + ':' + L, ground, party: ['tank'], level: L, hours: HOURS, seeds: SEEDS });
    const h = m.heroes[0];
    pts.push({ L, xp: h.levelXpPerH, net: h.netWithRaresPerH, ground });
    line([ground, L, h.levelXpPerH, h.incomePerH, h.raresPerH, h.storePerH, h.netWithRaresPerH, h.deaths, Math.round(h.encMinHpPct.p50)]);
    if (L === LEVELS[0]) kit = h.kit;
  }
  console.log('\nthe kit at ' + LEVELS[0] + ': ' + Object.entries(kit || {}).map(([s, id]) => s + ' ' + id).join(', '));
  const at = (L, key) => {
    let i = 0;
    while (i < pts.length - 2 && L > pts[i + 1].L) i++;
    const a = pts[i], b = pts[i + 1], f = Math.min(1, Math.max(0, (L - a.L) / (b.L - a.L)));
    return a[key] + f * (b[key] - a[key]);
  };
  let hours = 0, banked = 0;
  for (let L = 88; L < 110; L++) {
    const need = R.XP.charXpForLevel(L + 1) - R.XP.charXpForLevel(L), xp = at(L, 'xp'), net = at(L, 'net');
    hours += need / xp; banked += (need / xp) * net;
  }
  const row = TD.TEMPER_TIERS[7], mat = TD.TEMPER_MATERIALS[7];
  const book = (await import(u('src/data/items.js'))).ITEMS[mat ? mat.item : 'ember_temper_salts'].v;
  head('THE SPAN\'S HOURS AND GOLD, and what the tier-7 ladder asks (TEMPER_TIERS[7], both tracks; tiers 2 to 6 ask 40% to 52% of their span)',
    ['Levels', 'Read on', 'hours', 'gold banked', 'a track', 'both tracks', 'share', 'salts (both)', 'salts at book', 'share with salts']);
  if (!row) { line(['88 to 110', 'krells_hold', Math.round(hours), k(banked), 'no ladder', '', '', '', '', '']); return; }
  const track = row.reduce((s, n) => s + n, 0), both = 2 * track, salts = mat ? 2 * mat.qty.reduce((s, n) => s + n, 0) : 0;
  line(['88 to 110', [...new Set(pts.map((p) => p.ground))].join(', '), Math.round(hours), k(banked), k(track), k(both), Math.round((100 * both) / banked) + '%',
    salts, k(salts * book), Math.round((100 * (both + salts * book)) / banked) + '%']);
}

/* ── THE NEXT ARMOR STILL WINS, AND BLOWS (no fights) ── */
async function next() {
  const { BUILD } = await import(u('src/build-info.js'));
  const v = '?v=' + BUILD.version;
  const AL = await import(u('src/data/armor-line.js'));
  const T = await import(u('src/core/temper.js') + v);
  const { mitigationOf, mitigate, armourValues } = await import(u('src/core/mitigation.js') + v);
  const { MONSTERS, monsterLevelOf } = await import(u('src/data/monsters.js') + v);
  const { monsterMaxHit } = await import(u('src/core/combat.js') + v);
  const { HUNT_GROUNDS } = await import(u('src/data/hunt-grounds.js'));
  const { ITEMS } = await import(u('src/data/items.js') + v);
  const M = await import(u('src/core/member.js') + v);
  const XP = await import(u('src/core/xp.js') + v);
  const monstersOf = (g) => [...new Set(HUNT_GROUNDS[g].pockets.flatMap((p) => [...(p.spawns || []), ...(p.pack || [])].map((x) => x.monster)))];
  const swing = (values, armorPm, mons) => {
    let sum = 0;
    for (const id of mons) {
      const row = MONSTERS[id], L = monsterLevelOf(row), mit = mitigationOf(values, L), blow = Math.max(1, Math.floor(monsterMaxHit(row)));
      let p = 0;
      const lo = mitigate(blow, 1000, mit, armorPm, { chance: (c) => { p = c; return false; } }), hi = mitigate(blow, 1000, mit, armorPm, { chance: () => true });
      sum += (1 - mit.dodgePm / 1000) * (lo + p * (hi - lo));
    }
    return sum / mons.length;
  };
  const dawnSet = (cls) => Object.fromEntries(SLOTS.map((s) => [s, AL.LINE_BASE[cls].ids[s]]));
  const lineValues = (cls, r) => {
    const out = { heavy: 0, medium: 0, light: 0 }, key = { plate: 'heavy', leather: 'medium', cloth: 'light' }[cls];
    for (const s of SLOTS) out[key] += AL.lineArmor(s, cls, r);
    return out;
  };
  const LADDERS = [10, 15, 20, 25, 30, 50];
  const full = await fullDawn();
  const GROUNDS = { krells_hold: 85, carters_rest: 110, ox_road: 112, wyvern_roost: 125, pauper_vaults: 165 };
  head('WHAT A WHOLE DAWNSTEEL LADDER TAKES OFF WHERE IT IS WORN (Krell\'s Hold), by the size of the ladder. Plate in full Dawnsteel sits at the 60% cap against the Hold, so the cap eats most of it there.',
    ['Weight', 'Ground', 'bare: a swing lets through', ...LADDERS.map((p) => 'off at ' + p / 10 + '%'), ...(full ? ['pm the data reads'] : [])]);
  for (const cls of WEIGHTS) for (const g of ['krells_hold', 'pyre_field']) {
    const vals = armourValues(dawnSet(cls), ITEMS), mons = monstersOf(g), bare = swing(vals, 0, mons);
    line([cls, g, bare.toFixed(2), ...LADDERS.map((p) => (100 * (1 - swing(vals, p, mons) / bare)).toFixed(2) + '%'), ...(full ? [T.armorPmOf(dawnSet(cls), ITEMS, full)] : [])]);
  }
  head('THE NEXT ARMOR STILL WINS: whole Dawnsteel, fully tempered, against the armor line\'s bare set worn from R. Positive = the bare piece lets less through. '
    + 'R = 110 is Dawnsteel\'s own armor (a band-110 unique at its floor adds an attribute, not armor), so it is negative at any ladder.',
    ['Weight', 'against R', 'Ground', 'next bare lets through', ...LADDERS.map((p) => 'margin at ' + p / 10 + '%')]);
  const thinnest = {};
  for (const r of [110, 122, 125]) for (const cls of WEIGHTS) for (const [g, fl] of Object.entries(GROUNDS)) {
    const mons = monstersOf(g), vals = armourValues(dawnSet(cls), ITEMS), n = swing(lineValues(cls, r), 0, mons);
    const margins = LADDERS.map((p) => 100 * (1 - n / swing(vals, p, mons)));
    if (fl >= r || g === 'ox_road') LADDERS.forEach((p, i) => { const key = r + ':' + p; thinnest[key] = Math.min(thinnest[key] ?? Infinity, margins[i]); });
    line([cls, r, g + (fl >= r ? '' : ' (floor ' + fl + ')'), n.toFixed(2), ...margins.map((m) => m.toFixed(2) + '%')]);
  }
  head('THINNEST MARGIN by the piece it is read against, on grounds at or past R (and the Ox Road, 112 to 128, where the 122 pieces are worn)', ['against R', ...LADDERS.map((p) => 'at ' + p / 10 + '%')]);
  for (const r of [110, 122, 125]) line([r, ...LADDERS.map((p) => thinnest[r + ':' + p].toFixed(2) + '%')]);

  /* BLOWS: the weapon line is ruled (Tyler 2026-11-16: damage x Level / 110) and not built. What-if: the Dawnsteel weapon with its damage stat
     times R / 110, against the Dawnsteel weapon with a full Blows ladder; a Level-110 hero, skills at 110, the weapon alone (no armor penalties). */
  head('BLOWS: a Dawnsteel weapon\'s max hit with a whole ladder against the weapon line\'s bare weapon worn from R (what-if: its damage stat x R / 110). '
    + 'A Blows rung raises what lands by its %, so the margin is the line weapon\'s max hit over (1 + ladder) x Dawnsteel\'s.',
    ['Weapon', 'Dawnsteel max hit', 'R = 115', 'R = 122', 'R = 125', ...LADDERS.map((p) => 'margin vs 115 at ' + p / 10 + '%')]);
  const lv = 110, skills = Object.fromEntries(['melee', 'ranged', 'magic', 'defense'].map((s) => [s, XP.skillXpForLevel(s, lv)]));
  const maxHitOf = (id, row) => {
    const I = { ...ITEMS, [id]: row };
    const worn = { weapon: id };
    const { eq, setBonus, profile } = M.loadoutOf(worn, I);
    return M.heroSnapshot({ skills, levelXp: XP.charXpForLevel ? XP.charXpForLevel(lv) : 0 }, { eq, equipment: worn, items: I, bonus: () => 0, setBonus, profile }).maxHit;
  };
  for (const id of [...new Set(Object.values(WEAPON_OF))]) {
    const base = ITEMS[id], dmgFields = ['strB', 'rangeStrB', 'magicStrB'].filter((f) => base[f]);
    const at = (r) => maxHitOf(id, { ...base, ...Object.fromEntries(dmgFields.map((f) => [f, Math.round(base[f] * r / 110)])) });
    const b = maxHitOf(id, base), m115 = at(115);
    line([id, b, m115, at(122), at(125), ...LADDERS.map((p) => (100 * (m115 / (b * (1 + p / 1000)) - 1)).toFixed(2) + '%')]);
  }
}

/* ── THE BARS ── */
async function bars() {
  const SEEDS = Number(arg('seeds', 3)), HOURS = Number(arg('hours', 2)), LEVEL = Number(arg('level', 98));
  const { loadCellRunner } = await import(u('tools/balance-sim/cell.mjs'));
  const R = await loadCellRunner(ROOT);
  const AL = await import(u('src/data/armor-line.js'));
  const HT = await import(u('src/data/hunt-tiers.js'));
  const full = await fullDawn();
  if (!full) throw new Error('src/data/temper.js has no tier-7 ladder to measure');
  const wear = (s) => ({ ...Object.fromEntries(SLOTS.map((k) => [k, AL.LINE_BASE[LINE_OF[s]].ids[k]])), weapon: WEAPON_OF[s] });
  const GROUNDS = { krells_hold: LEVEL, pyre_field: Math.min(LEVEL, 89) };
  const CELLS = [{ label: 'Normal, tank alone', party: ['tank'], tier: 'normal' }, { label: 'Normal, hammer alone', party: ['hammer'], tier: 'normal' },
    { label: 'Normal, bow alone', party: ['bow'], tier: 'normal' }, { label: 'Normal, Mage alone', party: ['mage'], tier: 'normal' },
    { label: 'Dangerous, tank and Healer', party: ['tank', 'healer'], tier: 'dangerous', show: 'deaths' },
    { label: 'Deadly, a four', party: ['tank', 'healer', 'bow', 'mage'], tier: 'deadly', show: 'deaths' }];
  const only = arg('ground', null);
  for (const [g, L] of Object.entries(GROUNDS)) {
    if (only && only !== g) continue;
    head(g + ' at Level ' + L + ', ' + SEEDS + ' seeds x ' + HOURS + ' h a cell, the same dice in every row, every seat in its weight\'s whole Dawnsteel set and weapon. '
      + 'Normal: the typical low point (the sheet: at least 60%) and XP an hour. Dangerous and Deadly: deaths per 16 hero-hours (the sheet: a Deadly four at most 9).',
    ['Dawnsteel', ...CELLS.map((c) => c.label)]);
    for (const [label, temper] of [['bare', null], ['both tracks full', full]]) {
      const out = [label];
      for (const c of CELLS) {
        const row = HT.tierRowOf(g, c.tier);
        if (c.tier !== 'normal' && !row) { out.push('no ' + c.tier); continue; }
        const cell = { id: 'TDB:' + g + ':' + c.party.join('+') + ':' + label, ground: g, party: c.party, level: L, hours: HOURS, seeds: SEEDS,
          gearBySeat: c.party.map((s) => ({ also: wear(s) })),
          ...(c.tier !== 'normal' ? { options: { tier: c.tier }, density: row.pull[c.party.length - 1] } : {}), ...(temper ? { temper } : {}) };
        const res = R.runCell(cell);
        const hh = res.heroes.reduce((s, h) => s + h.hours, 0), d = res.heroes.reduce((s, h) => s + h.deaths, 0), h0 = res.heroes[0];
        out.push(c.show === 'deaths' ? Math.round((160 * d) / Math.max(hh, 1e-9)) / 10 + ' (tank low ' + Math.round(h0.encMinHpPct.p50) + '%)'
          : Math.round(h0.encMinHpPct.p50) + '%, ' + h0.levelXpPerH + ' XP/h');
      }
      line(out);
    }
  }
}

const MODES = { gold, next, bars };
if (!MODES[mode]) { console.error('usage: node tools/balance-sim/temper-dawn-table.mjs ' + Object.keys(MODES).join('|')); process.exit(1); }
const t0 = Date.now();
try { await MODES[mode](); } catch (e) { console.error('temper-dawn-table: ' + (e && e.stack || e)); process.exit(1); }
console.log('\n(' + mode + ': ' + Math.round((Date.now() - t0) / 1000) + ' s)');
