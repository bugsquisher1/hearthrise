// tests/hunt-core/drop-tables.mjs — WHAT EVERY WALKED HUNT PAYS (Tyler 2026-10-14 loot ruling, 2026-10-20 drops +
// profit rulings). Run by run-all.mjs. Cases on the data, then plays on the real settle (play-ground.mjs: the
// hr-accrue accrueHunt the world tick runs, one fixed hunt seed, ten-minute windows), then mutants.
//
//   slot-structure   every monster a walked ground spawns pays gold, at least one junk / material row and
//                    EXACTLY ONE equipment row (`gear: true`): armour or a weapon the ground's band can wear,
//                    at 5% or less a kill; no salvage or lucky row rides beside it. (The tutorial cellar's
//                    Giant Rat and Slime are the game's shared seeded-fixture rows: they keep their tables.)
//   gear-is-no-reveal an equipment row rolls as band 'gear', never 'rare': only the rare carrier earns the
//                    "Rare drop" moment (src/core/drops.js)
//   one-rare-carrier on each ground every non-equipment row at rare odds (5% or less) sits on ONE monster
//   slot-coverage    each ground but the tutorial covers weapon, helmet, body, legs and boots
//   profit-floor     at its band floor, in its first hour (the hunt levels the hero after that), each non-starter
//                    ground earns coin + commons at least +25% over the store bill (a MINIMUM, Tyler 10-20)
//   gear-pace        a fresh solo hero at the floor of the Thicket and the Sewer holds a piece in each of the five
//                    slots within GEAR_HOURS; every slot's expected hours per hero sit in its band, and no slot is
//                    more than LUMP times slower than the ground's fastest (the "4 boots, 2 helmets" class)
//   rare-pace        the carrier's rare rows land once per 10-20 hours per hero (Tyler 10-14/15)
//   gear-faucet      the vendor value of the equipment that drops stays under FAUCET of the coin
//   caster-floor     the Sewer's party of four (Melee tank, Ranger, Mage with wand + book, Healer) at its floor in the
//                    ladder kit plays the full hour with 0 deaths, the Mage casts, and EVERY role clears +25% on the
//                    even income share against its own store bill (designer pass 2026-10-21: drinks x12 with the mana
//                    pools, store drinks x5/3, Fireball rune-free; before it the party wiped in 12.9 min)
//
// Prints the per-ground table (gold/h, store/h, margin, gear pieces per hour by slot) every run: the evidence.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { makeReport, ROOT, plant } from './fixtures/h1.js';

const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const imp = (root, p) => import(pathToFileURL(join(root, p)).href + V);

/* THE NUMBERS THE RULINGS NAME (the designer's picks inside them, stated once). */
const MARGIN_MIN = 25;          // percent over the store bill at the band floor (Tyler 10-18/10-20: 25-35%, a minimum)
const GEAR_HOURS = 6;           // "a few hours of hunting equips a new hero": all five slots within 6 h at the floor (each slot ~1.3 h
                                // apart per hero, so about 19 heroes in 20 hold all five by then; the fixed seed must)
const SLOT_HOURS = Object.freeze({ low: [0.5, 3], high: [3, 15] });   // expected hours per piece per hero: band D's
                                // standard drops (1-3 h) for the low-level grounds; the tier-3 Warrens' steel rarer
const HIGH_FLOOR = 30;          // a ground whose floor wears steel (gear-tiers.js: steel opens at 30) keeps the rarer band
const LUMP = 3;                 // no slot more than 3x slower than the ground's fastest slot
const RARE_HOURS = Object.freeze([10, 20]);   // Tyler 10-14/15: a rare drop about once per 10-20 h of hunting
const FAUCET = 0.35;            // equipment vendor value per hour at most 35% of the coin per hour
const SLOTS = Object.freeze(['weapon', 'helmet', 'body', 'pants', 'boots']);
const SLOT_WORD = Object.freeze({ weapon: 'weapon', helmet: 'helmet', body: 'body', pants: 'legs', boots: 'boots' });
const GEAR_TYPES = Object.freeze(['weapon', 'armor', 'offhand']);
/* The tutorial cellar's Giant Rat and Slime are the shared tier-1 rows the seeded fixtures pin (field-salvage /
   lucky-finds FIXTURE_EXCLUDED; xp-frac-carry's measured slime): their tables stay, so the cellar is the one ground
   the slot rules do not cover. Its Hive Wasp carries its equipment row. */
const TUTORIAL = Object.freeze({ ground: 'mill_cellar', fixtures: Object.freeze(['rat', 'slime']) });
const STARTER = Object.freeze(['mill_cellar', 'meadowbrook_thicket']);   // keep their gold (Tyler 10-20): printed, not floored
const PARTY = Object.freeze(['tank', 'ranger', 'mage', 'healer']);
/* WHO IS MEASURED AT THE FLOOR. The Sewer is the start flow's first real ground, entered from the cellar: a solo Melee
   in the smiths' ladder kit (weapon, helm, body) before anything here has dropped. The Warrens is a party ground whose
   floor kills the ladder kit in minutes, so its party of four wears the full own-tier set (play-ground fullSet). */
const REFERENCE = Object.freeze({
  mill_cellar: { roles: ['tank'], full: false },
  meadowbrook_thicket: { roles: ['tank'], full: false },
  millrace_sewer: { roles: ['tank'], full: false },
  coppercap_warrens: { roles: PARTY, full: true },
});
const GEAR_RUNS = Object.freeze(['meadowbrook_thicket', 'millrace_sewer']);   // the fresh-hero grounds

async function load(root) {
  return {
    MONSTERS: (await imp(root, 'src/data/monsters.js')).MONSTERS,
    ITEMS: (await imp(root, 'src/data/items.js')).ITEMS,
    HUNTS: (await imp(root, 'src/data/hunts.js')).HUNT_INDEX,
    G: await imp(root, 'src/data/hunt-grounds.js'),
    drops: await imp(root, 'src/core/drops.js'),
  };
}

/** The monster kinds a ground spawns at any density (every pocket's spawns and full pack). */
function rosterOf(ground) {
  const ids = new Set();
  for (const p of ground.pockets) for (const s of (p.pack || []).concat(p.spawns)) ids.add(s.monster);
  return [...ids].sort();
}
const isGear = (d) => d && d.gear === true;
const rareRow = (D, d) => d && !isGear(d) && d.ch < 1 && D.dropBand(d.ch) === 'rare';
const gearRowOf = (m) => (m.drops || []).find(isGear) || null;

const cases = {
  'slot-structure'(M) {
    for (const [gid, ground] of Object.entries(M.G.HUNT_GROUNDS)) {
      const band = M.HUNTS[ground.hunt].band;
      for (const id of rosterOf(ground)) {
        if (gid === TUTORIAL.ground && TUTORIAL.fixtures.includes(id)) continue;
        const m = M.MONSTERS[id], drops = m.drops || [];
        if (!(Array.isArray(m.gp) && m.gp[1] > 0)) return gid + ': ' + id + ' pays no gold';
        const gear = drops.filter(isGear);
        if (gear.length !== 1) return gid + ': ' + id + ' has ' + gear.length + ' equipment rows, the ruling is one';
        const g = gear[0], it = M.ITEMS[g.id];
        if (!it || !GEAR_TYPES.includes(it.type)) return gid + ': ' + id + ' equipment row ' + g.id + ' is not equipment';
        if (!(Number(it.reqLv) <= band[1])) return gid + ': ' + id + ' drops ' + g.id + ' (req ' + it.reqLv + ') nobody in ' + band.join('-') + ' can wear';
        if (!(g.ch > 0 && g.ch <= M.drops.DROP_BAND_MAX.rare)) return gid + ': ' + id + ' equipment at ' + g.ch + ', not in (0, 5%]';
        if (g.salvage || g.lucky || g.champion) return gid + ': ' + id + ' equipment row also carries a salvage/lucky flag';
        if (drops.some((d) => !isGear(d) && (d.salvage || d.lucky))) return gid + ': ' + id + ' keeps a salvage or lucky row beside its equipment';
        if (!drops.some((d) => !isGear(d) && d.id !== 'bones' && d.id !== 'big_bones' && M.ITEMS[d.id])) return gid + ': ' + id + ' has no junk or material row';
        for (const d of drops) if (!M.ITEMS[d.id]) return gid + ': ' + id + ' drops unknown item ' + d.id;
      }
    }
    return null;
  },
  'gear-is-no-reveal'(M) {
    const sure = { chance: () => true, int: (a) => a };
    const out = M.drops.rollDropTable([{ id: 'bronze_helm', ch: 0.01, gear: true }, { id: 'crown_shard', ch: 0.01 }], {}, sure);
    const g = out.events.find((e) => e.id === 'bronze_helm'), r = out.events.find((e) => e.id === 'crown_shard');
    if (!g || g.rare !== false || g.band !== 'gear') return 'an equipment row rolled as ' + JSON.stringify(g);
    if (!r || r.rare !== true) return 'a 1% chase row lost its reveal: ' + JSON.stringify(r);
    return null;
  },
  'one-rare-carrier'(M) {
    for (const [gid, ground] of Object.entries(M.G.HUNT_GROUNDS)) {
      const carriers = rosterOf(ground).filter((id) => (M.MONSTERS[id].drops || []).some((d) => rareRow(M.drops, d)));
      if (carriers.length !== 1) return gid + ': ' + carriers.length + ' rare carriers (' + carriers.join(', ') + '), the ruling is one';
    }
    return null;
  },
  'slot-coverage'(M) {
    for (const [gid, ground] of Object.entries(M.G.HUNT_GROUNDS)) {
      if (gid === TUTORIAL.ground) continue;
      const have = new Set(rosterOf(ground).map((id) => gearRowOf(M.MONSTERS[id])).filter(Boolean).map((g) => M.ITEMS[g.id].slot));
      const miss = SLOTS.filter((s) => !have.has(s));
      if (miss.length) return gid + ': no equipment row for ' + miss.map((s) => SLOT_WORD[s]).join(', ');
    }
    return null;
  },
};

/* ── THE PLAYS ─────────────────────────────────────────────────────────── */
const H = 3600000;
const pct = (n) => (n >= 0 ? '+' : '') + Math.round(n) + '%';
function marginOf(x) {
  const T = x.totals;
  return T.store > 0 ? ((T.coin + T.commons) / T.store - 1) * 100 : Infinity;
}
/* Expected pieces per hour per hero by slot, from the run's kills: kills x the row's chance x the kill's yield share. */
function slotRates(M, G, x, n) {
  const y = G.yieldPermille(n) / 1000, hours = x.playedMs / H, out = {};
  for (const [id, k] of Object.entries(x.killsBy)) {
    const g = gearRowOf(M.MONSTERS[id] || {});
    if (!g) continue;
    const s = M.ITEMS[g.id].slot;
    out[s] = (out[s] || 0) + k * g.ch * y / n / hours;
  }
  return out;
}
function rareHours(M, G, x, n) {
  const y = G.yieldPermille(n) / 1000, hours = x.playedMs / H;
  let perHour = 0, carrier = null;
  for (const [id, k] of Object.entries(x.killsBy)) {
    for (const d of (M.MONSTERS[id] || {}).drops || []) if (rareRow(M.drops, d)) { perHour += k * d.ch * y / n / hours; carrier = id; }
  }
  return { carrier, hours: perHour > 0 ? 1 / perHour : Infinity };
}

/* `only` (a mutant's ground list) plays just those grounds' floor hour, without the party and fresh-hero runs. */
async function plays(M, P, monsters, R, print, only) {
  const rows = [], partyCarrier = [];
  for (const gid of Object.keys(M.G.HUNT_GROUNDS)) {
    if (only && !only.includes(gid)) continue;
    const ref = REFERENCE[gid];
    if (!ref) { R.ok(false, 'profit-floor: ' + gid + ' has no REFERENCE group'); continue; }
    const floor = M.HUNTS[M.G.HUNT_GROUNDS[gid].hunt].band[0];
    const n = ref.roles.length;
    const x = P.run(gid, Math.max(1, floor), ref.roles, { spanMs: H, fullSet: ref.full, monsters });
    const m = marginOf(x), T = x.totals, h = x.playedMs / H || 1;
    /* the EXPECTED vendor value of the equipment rows at this run's kills (one lucky body would swing a realized count) */
    const gearValue = Object.entries(x.killsBy).reduce((s, [id, k]) => { const g = gearRowOf(monsters[id] || {}); return s + (g ? k * g.ch * M.G.yieldPermille(n) / 1000 * P.vendorPriceOf(M.ITEMS, g.id) : 0); }, 0);
    const row = { gid, floor, n, h, coin: T.coin / h / n, commons: T.commons / h / n, store: T.store / h / n, m, deaths: T.falls,
      gearValue: gearValue / h / n, rates: slotRates({ ...M, MONSTERS: monsters }, M.G, x, n), rare: rareHours({ ...M, MONSTERS: monsters }, M.G, x, n) };
    rows.push(row);
    if (!STARTER.includes(gid)) {
      R.ok(x.playedMs >= H, 'profit-floor: ' + gid + ' ended after ' + (x.playedMs / 60000).toFixed(0) + ' min at its floor (' + T.ended.join(', ') + ')');
      R.ok(m >= MARGIN_MIN, 'profit-floor: ' + gid + ' at level ' + floor + ' earns ' + pct(m) + ' over its store bill, under +' + MARGIN_MIN + '%');
    }
    if (gid !== TUTORIAL.ground) {
      R.ok(row.gearValue <= FAUCET * row.coin, 'gear-faucet: ' + gid + ' equipment worth ' + Math.round(row.gearValue) + ' g/h against ' + Math.round(row.coin) + ' g/h of coin');
      const band = floor >= HIGH_FLOOR ? SLOT_HOURS.high : SLOT_HOURS.low;
      const hrs = SLOTS.map((s) => (row.rates[s] ? 1 / row.rates[s] : Infinity));
      SLOTS.forEach((s, i) => R.ok(hrs[i] >= band[0] && hrs[i] <= band[1], 'gear-pace: ' + gid + ' ' + SLOT_WORD[s] + ' every ' + hrs[i].toFixed(2) + ' h per hero, outside ' + band.join('-') + ' h'));
      R.ok(Math.max(...hrs) <= LUMP * Math.min(...hrs), 'gear-pace: ' + gid + ' slots are lumpy (' + hrs.map((v) => v.toFixed(1)).join(' / ') + ' h)');
      /* A carrier the solo reference never meets (a minParty pocket: the Sewer's King) is measured on the party below. */
      if (row.rare.carrier) R.ok(row.rare.hours >= RARE_HOURS[0] && row.rare.hours <= RARE_HOURS[1], 'rare-pace: ' + gid + ' ' + row.rare.carrier + ' rare every ' + row.rare.hours.toFixed(1) + ' h per hero');
      else partyCarrier.push(gid);
    }
  }
  if (only) return;
  /* A PARTY-ONLY CARRIER (minParty >= 2): measured on the party of four at the floor, in the full set (the ladder
     kit falls there). Printed too: what each role pays for its supplies. */
  const party = [];
  for (const gid of partyCarrier) {
    const sp = P.run(gid, M.HUNTS[M.G.HUNT_GROUNDS[gid].hunt].band[0], PARTY, { spanMs: H, fullSet: true, monsters });
    const spr = rareHours({ ...M, MONSTERS: monsters }, M.G, sp, PARTY.length);
    R.ok(spr.hours >= RARE_HOURS[0] && spr.hours <= RARE_HOURS[1], 'rare-pace: ' + gid + ' ' + spr.carrier + ' rare every ' + spr.hours.toFixed(1) + ' h per hero (party of four)');
    party.push({ gid, sp, spr });
  }
  /* THE FRESH HERO: a solo Melee in the ladder kit at the floor, GEAR_HOURS long; the hero levels as it plays. */
  const fresh = {};
  for (const gid of GEAR_RUNS) {
    const x = P.run(gid, M.HUNTS[M.G.HUNT_GROUNDS[gid].hunt].band[0], ['tank'], { spanMs: GEAR_HOURS * H, monsters });
    const got = x.heroItems[x.heroes[0]] || {};
    const bySlot = {};
    for (const [id, q] of Object.entries(got)) { const it = M.ITEMS[id]; if (it && GEAR_TYPES.includes(it.type)) bySlot[it.slot] = (bySlot[it.slot] || 0) + q; }
    fresh[gid] = bySlot;
    const miss = SLOTS.filter((s) => !bySlot[s]);
    R.ok(!miss.length, 'gear-pace: a fresh hero at the ' + gid + ' floor has no ' + miss.map((s) => SLOT_WORD[s]).join(', ') + ' after ' + GEAR_HOURS + ' h');
  }
  if (print) {
    console.log('  per hero per hour at the band floor, first hour | coin | commons | store | margin | gear g/h | pieces/h weapon helmet body legs boots | rare every');
    for (const r of rows) {
      console.log('  ' + r.gid.padEnd(20) + ' L' + String(r.floor).padEnd(3) + (r.n > 1 ? 'party of ' + r.n : 'solo') .padEnd(11) + String(Math.round(r.coin)).padStart(5)
        + String(Math.round(r.commons)).padStart(6) + String(Math.round(r.store)).padStart(6) + (Number.isFinite(r.m) ? pct(r.m) : 'no bill').padStart(9)
        + String(Math.round(r.gearValue)).padStart(6) + '   ' + SLOTS.map((s) => (r.rates[s] || 0).toFixed(2).padStart(5)).join(' ')
        + '   ' + (Number.isFinite(r.rare.hours) ? r.rare.hours.toFixed(1) + ' h (' + r.rare.carrier + ')' : '-'));
    }
    for (const { gid, sp, spr } of party) {
      console.log('  ' + gid.padEnd(20) + ' L' + M.HUNTS[M.G.HUNT_GROUNDS[gid].hunt].band[0] + '  party of 4 (full set): ' + pct(marginOf(sp)) + ', rare every ' + spr.hours.toFixed(1)
        + ' h (' + spr.carrier + '); store per hero/h ' + Object.entries(sp.totals.buys).map(([k, b]) => k + ' ' + Math.round(Object.entries(b).reduce((s, [id, q]) => s + q * ((P.basics[id] || {}).price || 0), 0) / (sp.playedMs / H))).join(', '));
    }
    for (const [gid, b] of Object.entries(fresh)) console.log('  fresh solo hero, ' + gid + ', ' + GEAR_HOURS + ' h: ' + SLOTS.map((s) => SLOT_WORD[s] + ' ' + (b[s] || 0)).join(', '));
  }
}

/* THE CASTER FLOOR (designer pass 2026-10-21). Income is split evenly and each hero pays its own store bill
   (ruling 10-16), so each role's margin is its share of coin + commons over its own bill. */
function casterFloor(M, P, R, print) {
  const gid = 'millrace_sewer', floor = M.HUNTS[M.G.HUNT_GROUNDS[gid].hunt].band[0];
  const x = P.run(gid, floor, PARTY, { spanMs: H });
  const T = x.totals, h = x.playedMs / H || 1, share = (T.coin + T.commons) / h / PARTY.length;
  R.ok(x.playedMs >= H && T.falls === 0, 'caster-floor: the ' + gid + ' party of four (ladder kit) ended after ' + (x.playedMs / 60000).toFixed(1)
    + ' min with ' + T.falls + ' death(s) (' + T.ended.join(', ') + ')');
  const mage = x.heroes.find((k) => k.startsWith('mage'));
  R.ok(((x.heroXp[mage] || {}).magic || 0) > 0, 'caster-floor: the Mage (wand + book) cast no spell in ' + (x.playedMs / 60000).toFixed(1) + ' min');
  const bills = x.heroes.map((k) => [k, Object.entries(T.buys[k] || {}).reduce((s, [id, q]) => s + q * ((P.basics[id] || {}).price || 0), 0) / h]);
  for (const [k, bill] of bills) {
    const m = bill > 0 ? (share / bill - 1) * 100 : Infinity;
    R.ok(m >= MARGIN_MIN, 'caster-floor: ' + k + ' at the ' + gid + ' floor earns ' + pct(m) + ' (share ' + Math.round(share) + ' g/h vs its bill ' + Math.round(bill) + ' g/h), under +' + MARGIN_MIN + '%');
  }
  if (print) console.log('  ' + gid.padEnd(20) + ' L' + floor + '  party of 4 (ladder kit): ' + (x.playedMs / 60000).toFixed(0) + ' min, ' + T.falls + ' deaths, share ' + Math.round(share)
    + ' g/h; bill per hero/h ' + bills.map(([k, b]) => k + ' ' + Math.round(b) + (b > 0 ? ' (' + pct((share / b - 1) * 100) + ')' : '')).join(', '));
}

/* ── MUTANTS: every case and every play rule must bite ─────────────────── */
const clone = (MONSTERS, edit) => {
  const out = {};
  for (const [id, m] of Object.entries(MONSTERS)) out[id] = { ...m, drops: (m.drops || []).map((d) => ({ ...d })) };
  edit(out);
  return out;
};
const gearOf = (ms, id) => ms[id].drops.find(isGear);
const dataMutants = [
  { name: 'an equipment row dropped', case: 'slot-structure', edit: (ms) => { ms.drain_rat.drops = ms.drain_rat.drops.filter((d) => !isGear(d)); } },
  { name: 'a second equipment row', case: 'slot-structure', edit: (ms) => { ms.gray_wolf.drops.push({ id: 'bronze_helm', ch: 0.01, gear: true }); } },
  { name: 'equipment nobody in range can wear', case: 'slot-structure', edit: (ms) => { gearOf(ms, 'gray_whelp').id = 'steel_platebody'; } },
  { name: 'equipment as a common', case: 'slot-structure', edit: (ms) => { gearOf(ms, 'sump_slime').ch = 0.2; } },
  { name: 'the salvage row kept beside it', case: 'slot-structure', edit: (ms) => { ms.gray_wolf.drops.push({ id: 'bronze_gauntlets', ch: 0.002, salvage: true }); } },
  { name: 'the equipment flag lost (a rare reveal again)', case: 'one-rare-carrier', edit: (ms) => { delete gearOf(ms, 'culvert_bat').gear; ms.culvert_bat.drops.push({ id: 'bronze_sword', ch: 0.01, gear: true }); } },
  { name: 'a second rare carrier', case: 'one-rare-carrier', edit: (ms) => { ms.cistern_spider.drops.splice(2, 0, { id: 'spider_eye', ch: 0.035 }); } },
  { name: 'two helmets, no boots', case: 'slot-coverage', edit: (ms) => { gearOf(ms, 'gray_whelp').id = 'leather_helmet'; } },
];
const playMutants = [
  /* The Sewer's coin cut to under half (armour weights, ruling K7, left the ladder-kit Melee +119% at the floor,
     so the old /1.8 coin clears +25% by a hair: the floor still bites at /2.2, about +11%). */
  { name: 'the Sewer coin cut to under half', rule: 'profit-floor: millrace_sewer', edit: (ms) => {
    for (const id of ['drain_rat', 'sump_slime', 'culvert_bat', 'cistern_spider', 'kobold_tosher', 'rat_king']) ms[id].gp = ms[id].gp.map((v) => Math.max(1, Math.round(v / 2.2)));
  } },
  { name: 'the Thicket boots five times rarer', rule: 'gear-pace: meadowbrook_thicket', edit: (ms) => { gearOf(ms, 'gray_whelp').ch /= 5; } },
  { name: 'the den mother\'s fang back to 1%', rule: 'rare-pace: meadowbrook_thicket', edit: (ms) => { ms.grayjaw.drops.find((d) => d.id === 'alpha_fang').ch = 0.01; } },
  { name: 'the Warrens boots by the cartload', rule: 'gear-faucet: coppercap_warrens', edit: (ms) => { gearOf(ms, 'goblin_scavenger').ch = 0.05; } },
];
/* The caster floor's levers live in src/data the engine imports: each mutant plays on a planted copy. */
const casterMutants = [
  { name: 'the drinks back to the old grain (a tier-1 drink 6-8 mana)', edits: [
    ['src/data/supply-basics.js', "'turnip_juice', 72, 10, [1]", "'turnip_juice', 6, 10, [1]"],
    ['src/data/drinks.js', "v: 6, mana: 96 ", "v: 6, mana: 8 "]] },
  { name: 'Fireball spends a Fire Rune again (the Mage casts nothing)', edits: [
    ['src/data/abilities.js', "id: 'fireball', n: 'Fireball', disciplines: ['destruction'], lane: 'offense', cdMs: 8000, mana: 25,",
      "id: 'fireball', n: 'Fireball', disciplines: ['destruction'], lane: 'offense', cdMs: 8000, mana: 25, rune: 'fire_rune',"]] },
];
const engineMutants = [
  { name: 'the equipment band forgotten in the engine', case: 'gear-is-no-reveal',
    edits: [['src/core/drops.js', "const band = d.gear === true ? 'gear' : dropBand(d.ch);", 'const band = dropBand(d.ch);']] },
];

const R = makeReport('hunt-core/drop-tables');
const M = await load(ROOT);
for (const [cn, fn] of Object.entries(cases)) {
  let why = null;
  try { why = fn(M); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
const { loadPlay, PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
const P = await loadPlay(ROOT);
await plays(M, P, M.MONSTERS, R, true);
casterFloor(M, P, R, true);

for (const mu of dataMutants) {
  let why = null;
  try { why = cases[mu.case]({ ...M, MONSTERS: clone(M.MONSTERS, mu.edit) }); } catch (e) { why = 'threw ' + e.message; }
  R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
}
for (const mu of engineMutants) {
  const p = plant(mu.edits);
  try {
    let why = null;
    try { why = cases[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }
    R.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
  } finally { p.done(); }
}
for (const mu of playMutants) {
  const MR = { fails: [], ok(c, msg) { if (!c) this.fails.push(msg); } };
  await plays(M, P, clone(M.MONSTERS, mu.edit), MR, false, [mu.rule.split(': ')[1]]);
  R.ok(MR.fails.some((f) => f.startsWith(mu.rule)), 'mutant "' + mu.name + '" was NOT caught by ' + mu.rule + ' (fails: ' + (MR.fails.join(' | ') || 'none') + ')');
}
for (const mu of casterMutants) {
  const p = plant(mu.edits, PLAY_TREES);
  try {
    const MR = { fails: [], ok(c, msg) { if (!c) this.fails.push(msg); } };
    casterFloor(M, await loadPlay(p.root), MR, false);
    R.ok(MR.fails.length > 0, 'mutant "' + mu.name + '" was NOT caught by caster-floor');
    if (MR.fails.length) console.log('  caster mutant "' + mu.name + '" caught: ' + MR.fails[0].slice(0, 140));
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases + the plays, ' + (dataMutants.length + engineMutants.length + playMutants.length + casterMutants.length) + ' mutants caught');
R.finish();
