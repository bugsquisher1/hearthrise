// tests/hunt-core/drop-tables.mjs — WHAT EVERY WALKED HUNT PAYS (Tyler 2026-10-14 loot ruling, 2026-10-20 drops +
// profit rulings, 2026-10-23 loot redesign). Run by run-all.mjs. Cases on the data, then plays on the real settle
// (play-ground.mjs: the hr-accrue accrueHunt the world tick runs, one fixed hunt seed, ten-minute windows), then mutants.
//
// TWO LOOT MODELS, ground by ground. A ground on the LOOT BANDS (src/data/loot-bands.js; every ground NOT in OLD_MODEL)
// is held to the band rules; a ground in OLD_MODEL to the 10-14/10-20 equipment-slot rules. OLD_MODEL only shrinks: the
// Thicket is the sample (Phase A), the other grounds convert in batches of 20 rows or fewer (Phase B).
//
// THE LOOT BANDS
//   loot-structure   every row names a band, in band order (Trophy last); 1-2 Commons over 15%, ONE Uncommon in (5%, 15%],
//                    every Scarce / Rare / Trophy row at 5% or less; a monster's Scarce armour is ONE of helmet / body /
//                    legs / boots in heavy, medium AND light (weapons may join), wearable in the ground's band; a Trophy
//                    only on a boss. A REVEALED item (Rare, Trophy) is live (no dormant effect), has its pixel icon, is no
//                    Hearthfind, not tier 8, not 'unique', not sold by a listed Shop row, not boss loot, of its dropper's
//                    tier or one above, and its dropper is no Hearthfind source: the checks tests/lucky-finds.mjs and
//                    tests/field-salvage.mjs make for their own rows. An OLD_MODEL ground carries no band (no half conversion).
//   band-is-the-reveal  the roller (src/core/drops.js bandOf) reveals exactly the Rare and Trophy rows; Common, Uncommon
//                    and Scarce are standard drops; the old model's equipment slot stays one, its odds rows reveal at 5%
//   build-coverage   each banded ground's Scarce rows cover helmet, body, legs and boots in all three weights
//   gear-pace        (the floor hour, expected on its kills) each Scarce piece lands about once an hour per hero
//                    (BAND_TARGETS.scarce, Tyler 2026-10-23); a fresh solo hero at the floor holds all four slots of
//                    EACH weight within GEAR_HOURS (realized)
//   rare-pace        each Rare item every 10-20 h per hero; trophy-pace: each Trophy item every 100-150 h
//   gear-faucet      the equipment's expected sale value (the trader's price: loot-bands.js VENDOR_GEAR_RATE of book) per
//                    hero-hour is at most FAUCET_BANDED of the coin
//   total-value      coin + commons + every Scarce / Rare / Trophy row's sale value per hero-hour is at most +25% over the
//                    ground's TOTAL_TODAY, pinned before its conversion
//   reveal-path      (the real settle, a fresh GEAR_HOURS hunt) every Rare item credited rides the settle's rare-drop hint
//                    (the row the database journals as rare_drop and broadcasts), and no Scarce piece does
// THE OLD MODEL (OLD_MODEL grounds), unchanged:
//   slot-structure   pays gold, a junk / material row and EXACTLY ONE equipment row (`gear: true`, wearable in range,
//                    5% or less, no salvage / lucky row beside it); the tutorial cellar's Giant Rat and Slime keep their tables
//   one-rare-carrier every non-equipment row at rare odds sits on ONE monster
//   slot-coverage    weapon, helmet, body, legs and boots (the tutorial cellar excepted)
//   gear-pace        every slot's expected hours in its band (low floors 0.5-3 h, steel floors 3-15 h), no slot LUMP times
//                    slower than the fastest; a fresh solo hero holds all five slots within GEAR_HOURS
//   rare-pace        the carrier's rare rows once per 10-20 h per hero
//   gear-faucet      the equipment's sale value at most FAUCET (0.35) of the coin
// BOTH MODELS:
//   four-slots       on every ground not IMBUE_PENDING each monster has EXACTLY one junk row (its own product, over 15%),
//                    at most one bones row, and EXACTLY one imbuement row (`imbue`, no other monster drops it, (5%, 15%],
//                    tier and book value from the dropper's Level)
//   profit-floor     at its band floor, in its first hour, each non-starter ground earns coin + commons at least +25% over
//                    the store bill (a MINIMUM, Tyler 10-20)
//   warrens-floor    the Warrens' party of four at 32 and a lone own-tier Melee at the card's soloFrom clear +25% on two seeds
//   caster-floor     the Sewer's party of four at its floor lives the hour, the Mage casts, every role clears +25%
//
// Prints the per-ground tables every run: the evidence. EVERY LOOT NUMBER IS PROVISIONAL (Tyler 2026-10-23): re-tuned
// after combat balance and the economy sims; a re-tune changes data, these rules stay.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { makeReport, ROOT, plant } from './fixtures/h1.js';

const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const imp = (root, p) => import(pathToFileURL(join(root, p)).href + V);

/* THE NUMBERS THE RULINGS NAME (the designer's picks inside them, stated once). */
const MARGIN_MIN = 25;          // percent over the store bill at the band floor (Tyler 10-18/10-20: 25-35%, a minimum)
const GEAR_HOURS = 6;           // "a few hours of hunting equips a new hero": every slot within 6 h at the floor
const SLOT_HOURS = Object.freeze({ low: [0.5, 3], high: [3, 15] });   // OLD MODEL: expected hours per piece per hero
const HIGH_FLOOR = 30;          // OLD MODEL: a ground whose floor wears steel (gear-tiers.js: steel opens at 30) keeps the rarer band
const LUMP = 3;                 // OLD MODEL: no slot more than 3x slower than the ground's fastest slot (the band model's
                                // 2x-wide Scarce band implies it)
const RARE_HOURS = Object.freeze([10, 20]);   // OLD MODEL: Tyler 10-14/15, a rare drop about once per 10-20 h
const FAUCET = 0.35;            // OLD MODEL: equipment sale value per hour at most 35% of the coin per hour
const FAUCET_BANDED = 0.50;     // THE BANDS (designer 2026-10-23, Tyler: gear at most half the coin)
const TOTAL_RISE_MAX = 0.25;    // THE BANDS (Tyler 2026-10-23): total value up to +25% over today's pinned numbers
/* TODAY'S PINNED VALUE: expected gold per hero-hour at the floor (coin as the settle rounds it, commons, and every row the
   band model puts at 5% or less, each at the trader's price with gear at full book), on the floor hour's kills, measured
   on next b7af6a9db before any ground converted. A conversion is held to +25% over its ground's row; never re-pinned. */
const TOTAL_TODAY = Object.freeze({ mill_cellar: 1869, millrace_sewer: 3822, meadowbrook_thicket: 2285, coppercap_warrens: 4588, mosslight_glade: 3834 });
/* THE OLD MODEL'S GROUNDS. SHRINK-ONLY: a ground leaves the day every row of its roster names a band, and never returns. */
const OLD_MODEL = Object.freeze(['mill_cellar', 'millrace_sewer', 'coppercap_warrens', 'mosslight_glade']);
const banded = (gid) => !OLD_MODEL.includes(gid);
const SLOTS = Object.freeze(['weapon', 'helmet', 'body', 'pants', 'boots']);
const BUILD_SLOTS = Object.freeze(['helmet', 'body', 'pants', 'boots']);
const WEIGHTS = Object.freeze(['heavy', 'medium', 'light']);
const SLOT_WORD = Object.freeze({ weapon: 'weapon', helmet: 'helmet', body: 'body', pants: 'legs', boots: 'boots' });
const GEAR_TYPES = Object.freeze(['weapon', 'armor', 'offhand']);
const HOUR_BANDS = Object.freeze(['scarce', 'rare', 'trophy']);
/* The tutorial cellar's Giant Rat and Slime are the shared tier-1 rows the seeded fixtures pin (field-salvage /
   lucky-finds FIXTURE_EXCLUDED; xp-frac-carry's measured slime): their tables stay, so the cellar is the one ground
   the slot rules do not cover. Its Hive Wasp carries its equipment row. */
const TUTORIAL = Object.freeze({ ground: 'mill_cellar', fixtures: Object.freeze(['rat', 'slime']) });
/* THE FOUR-SLOT SAMPLE (designer 2026-10-21): the Thicket and the Sewer carry the imbuement slot; these grounds are the
   next batch. SHRINK-ONLY: a ground leaves this list when its monsters get their imbuement items, and never returns. */
const IMBUE_PENDING = Object.freeze(['mill_cellar', 'coppercap_warrens']);
const JUNK_MIN = 0.15;          // the junk row is the creature's common product (over the uncommon band)
const BONES = Object.freeze(['bones', 'big_bones']);
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
  /* the solo spring ground (lane c-ground-16-31): a solo Melee in the ladder kit, the Thicket graduate it is built for */
  mosslight_glade: { roles: ['tank'], full: false },
});
const GEAR_RUNS = Object.freeze(['meadowbrook_thicket', 'millrace_sewer', 'mosslight_glade']);   // the fresh-hero grounds
/* The fresh hunt's seeds for reveal-path: the default first, then searched in this fixed order until a Rare drops. */
const FRESH_SEEDS = Object.freeze(['1234567890123', '987654321987', '424242424242']);

async function load(root) {
  const SB = await imp(root, 'src/data/supply-basics.js');
  const art = await imp(root, 'src/data/item-art.js');
  return {
    MONSTERS: (await imp(root, 'src/data/monsters.js')).MONSTERS,
    ITEMS: (await imp(root, 'src/data/items.js')).ITEMS,
    HUNTS: (await imp(root, 'src/data/hunts.js')).HUNT_INDEX,
    G: await imp(root, 'src/data/hunt-grounds.js'),
    IMB: await imp(root, 'src/data/imbuements.js'),
    LB: await imp(root, 'src/data/loot-bands.js'),
    WEIGHT: (await imp(root, 'src/data/core-model.js')).ARMOUR_WEIGHT,
    live: (await imp(root, 'src/data/item-effects.js')).effectsAreLive,
    BOSSES: (await imp(root, 'src/data/bosses.js')).BOSSES,
    hfSources: new Set((await imp(root, 'src/data/hearthfind.js')).HEARTHFIND_TABLE.filter((r) => r.kind === 'monster').map((r) => r.id)),
    /* what a listed Shop row sells (catalogue-coherence: only a listed row is a door) */
    shopSold: new Set(SB.SUPPLY_SHOP_OFFERS.filter((o) => SB.SHOP_SOLD_KINDS.includes(o.kind)).map((o) => o.item)),
    /* the pixel icon on disk, always read from the repo (a planted tree copies no images) */
    hasIcon: (id) => existsSync(join(ROOT, art.PIXEL_DIR + art.fileFor(id))),
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
const mentions = (v, id) => v === id || (Array.isArray(v) ? v.some((x) => mentions(x, id))
  : !!v && typeof v === 'object' && Object.keys(v).some((k) => k === id || mentions(v[k], id)));
const weightOf = (M, it) => (it && it.type === 'armor' && BUILD_SLOTS.includes(it.slot) && M.WEIGHT[it.armourClass]) || null;

/* Why a revealed (Rare / Trophy) row's item may not be revealed, or null: the lucky-finds / field-salvage item rules. */
function revealWhy(M, tag, mid, m, d) {
  const it = M.ITEMS[d.id];
  if (!M.live(it)) return tag + ' reveals ' + d.id + ', which declares a dormant effect';
  if (it.hearthfind) return tag + ' reveals ' + d.id + ', a Hearthfind (it has one door, hr_apply\'s hearthfind arm)';
  if (it.tier === 8 || it.rarity === 'unique') return tag + ' reveals ' + d.id + ', tier 8 or unique (its sink is the forge, not a drop)';
  if (!M.hasIcon(d.id)) return tag + ' reveals ' + d.id + ', which has no pixel icon (the reveal shows it)';
  if (M.shopSold.has(d.id)) return tag + ' reveals ' + d.id + ', which a listed Shop row sells (a drop it shortcuts)';
  if (mentions(M.BOSSES, d.id)) return tag + ' reveals ' + d.id + ', which is boss loot';
  if (M.hfSources.has(mid)) return tag + ' is a Hearthfind source and reveals ' + d.id + ' (two chase rolls on one kill)';
  if (Number.isInteger(it.tier) && !(it.tier === m.tier || it.tier === m.tier + 1)) return tag + ' reveals ' + d.id + ' of tier ' + it.tier + ', not its tier ' + m.tier + ' or one above';
  return null;
}

const cases = {
  'loot-structure'(M) {
    for (const [gid, ground] of Object.entries(M.G.HUNT_GROUNDS)) {
      const band = M.HUNTS[ground.hunt].band;
      for (const id of rosterOf(ground)) {
        const m = M.MONSTERS[id], drops = m.drops || [], tag = gid + ': ' + id;
        if (!banded(gid)) {
          if (drops.some((d) => d.band !== undefined)) return tag + ' names a band on an OLD_MODEL ground (a half conversion)';
          continue;
        }
        if (!(Array.isArray(m.gp) && m.gp[1] > 0)) return tag + ' pays no gold';
        let last = -1, commons = 0, uncommons = 0, trophies = 0;
        const armour = [];
        for (let i = 0; i < drops.length; i++) {
          const d = drops[i], it = M.ITEMS[d.id];
          if (!M.LB.LOOT_BANDS.includes(d.band)) return tag + ' row ' + d.id + ' names band ' + JSON.stringify(d.band) + ', not one of ' + M.LB.LOOT_BANDS.join(', ');
          if (d.gear || d.lucky || d.salvage || d.champion) return tag + ' row ' + d.id + ' keeps an old-model flag';
          if (!it) return tag + ' drops unknown item ' + d.id;
          const bi = M.LB.LOOT_BANDS.indexOf(d.band);
          if (bi < last) return tag + ' lists ' + d.id + ' (' + d.band + ') after a ' + M.LB.LOOT_BANDS[last] + ' row: rows go in band order';
          last = bi;
          const T = M.LB.BAND_TARGETS[d.band];
          if (T.odds ? !(d.ch > T.odds[0] && d.ch <= T.odds[1]) : !(d.ch > 0 && d.ch <= T.oddsMax)) return tag + ' ' + d.band + ' row ' + d.id + ' at ' + d.ch + ', outside the band\'s odds';
          if (d.band === 'common') commons++;
          if (d.band === 'uncommon') uncommons++;
          if (d.band === 'scarce') {
            if (!GEAR_TYPES.includes(it.type)) return tag + ' Scarce row ' + d.id + ' is not equipment';
            if (!(Number(it.reqLv) <= band[1])) return tag + ' drops ' + d.id + ' (req ' + it.reqLv + ') nobody in ' + band.join('-') + ' can wear';
            if (it.type === 'armor') {
              if (!weightOf(M, it)) return tag + ' Scarce armour ' + d.id + ' is not a helmet, body, legs or boots of one weight';
              armour.push(it);
            }
          }
          if (d.band === 'trophy') {
            trophies++;
            if (m.boss !== true) return tag + ' carries a Trophy row (' + d.id + ') and is no boss';
          }
          if (M.LB.REVEAL_BANDS.includes(d.band)) { const why = revealWhy(M, tag, id, m, d); if (why) return why; }
        }
        if (commons < 1 || commons > 2) return tag + ' has ' + commons + ' Common rows, the rule is 1-2';
        if (uncommons !== 1) return tag + ' has ' + uncommons + ' Uncommon rows, the rule is one (its imbuement item)';
        if (trophies > 1) return tag + ' has ' + trophies + ' Trophy rows, the rule is one per boss';
        if (armour.length) {
          const slots = new Set(armour.map((it) => it.slot)), weights = armour.map((it) => weightOf(M, it)).sort().join(', ');
          if (slots.size !== 1 || weights !== [...WEIGHTS].sort().join(', ')) {
            return tag + ' Scarce armour is ' + [...slots].map((s) => SLOT_WORD[s]).join(' + ') + ' in ' + weights + ': the rule is one slot in heavy, medium and light';
          }
        }
      }
    }
    return null;
  },
  'band-is-the-reveal'(M) {
    const sure = { chance: () => true, int: (a) => a };
    const rows = [{ id: 'c', ch: 0.5, band: 'common' }, { id: 'u', ch: 0.1, band: 'uncommon' }, { id: 's', ch: 0.01, band: 'scarce' },
      { id: 'r', ch: 0.01, band: 'rare' }, { id: 't', ch: 0.001, band: 'trophy' }, { id: 'g', ch: 0.01, gear: true }, { id: 'o', ch: 0.01 }];
    const want = { c: [false, 'common'], u: [false, 'uncommon'], s: [false, 'scarce'], r: [true, 'rare'], t: [true, 'trophy'], g: [false, 'gear'], o: [true, 'rare'] };
    const out = M.drops.rollDropTable(rows, {}, sure);
    for (const [id, [rare, band]] of Object.entries(want)) {
      const ev = out.events.find((e) => e.id === id);
      if (!ev || ev.rare !== rare || ev.band !== band) return 'a ' + band + ' row rolled as ' + JSON.stringify(ev) + ', the rule is band ' + band + (rare ? ', revealed' : ', no reveal');
    }
    return null;
  },
  'build-coverage'(M) {
    for (const [gid, ground] of Object.entries(M.G.HUNT_GROUNDS)) {
      if (!banded(gid)) continue;
      const have = new Set();
      for (const id of rosterOf(ground)) for (const d of M.MONSTERS[id].drops || []) {
        const w = d.band === 'scarce' && weightOf(M, M.ITEMS[d.id]);
        if (w) have.add(M.ITEMS[d.id].slot + ':' + w);
      }
      const miss = WEIGHTS.flatMap((w) => BUILD_SLOTS.filter((s) => !have.has(s + ':' + w)).map((s) => w + ' ' + SLOT_WORD[s]));
      if (miss.length) return gid + ': no Scarce row for ' + miss.join(', ');
    }
    return null;
  },
  'slot-structure'(M) {
    for (const [gid, ground] of Object.entries(M.G.HUNT_GROUNDS)) {
      if (banded(gid)) continue;
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
  'one-rare-carrier'(M) {
    for (const [gid, ground] of Object.entries(M.G.HUNT_GROUNDS)) {
      if (banded(gid)) continue;
      const carriers = rosterOf(ground).filter((id) => (M.MONSTERS[id].drops || []).some((d) => rareRow(M.drops, d)));
      if (carriers.length !== 1) return gid + ': ' + carriers.length + ' rare carriers (' + carriers.join(', ') + '), the ruling is one';
    }
    return null;
  },
  'four-slots'(M) {
    const droppers = {};
    for (const [mid, m] of Object.entries(M.MONSTERS)) for (const d of m.drops || []) (droppers[d.id] = droppers[d.id] || new Set()).add(mid);
    for (const [gid, ground] of Object.entries(M.G.HUNT_GROUNDS)) {
      if (IMBUE_PENDING.includes(gid)) continue;
      for (const id of rosterOf(ground)) {
        const m = M.MONSTERS[id], drops = m.drops || [];
        const imbue = drops.filter((d) => M.ITEMS[d.id] && M.ITEMS[d.id].imbue);
        if (imbue.length !== 1) return gid + ': ' + id + ' has ' + imbue.length + ' imbuement rows, the ruling is one';
        const d = imbue[0], it = M.ITEMS[d.id];
        if (!M.IMB.IMBUE_KINDS.includes(it.imbue.kind)) return gid + ': ' + d.id + ' feeds an unknown kind ' + it.imbue.kind;
        if (it.imbue.tier !== M.IMB.imbueTierFor(m.level)) return gid + ': ' + d.id + ' is tier ' + it.imbue.tier + ', its dropper (Level ' + m.level + ') feeds tier ' + M.IMB.imbueTierFor(m.level);
        if (it.v !== M.IMB.imbueValueFor(m.level) || it.raw !== true) return gid + ': ' + d.id + ' book value ' + it.v + ' (raw ' + it.raw + '), the rule is ' + M.IMB.imbueValueFor(m.level) + ', raw';
        if (!(d.ch > M.IMB.IMBUE_DROP.above && d.ch <= M.IMB.IMBUE_DROP.max) || d.gear) return gid + ': ' + id + ' imbuement row at ' + d.ch + ', not in the uncommon band';
        if (droppers[d.id].size !== 1) return gid + ': ' + d.id + ' is dropped by ' + [...droppers[d.id]].join(', ') + ', the ruling is one monster';
        if (drops.filter((x) => BONES.includes(x.id)).length > 1) return gid + ': ' + id + ' has two bones rows';
        const junk = drops.filter((x) => !isGear(x) && !BONES.includes(x.id) && x !== d && !rareRow(M.drops, x) && !HOUR_BANDS.includes(x.band));
        if (junk.length !== 1) return gid + ': ' + id + ' has ' + junk.length + ' junk rows (' + junk.map((x) => x.id).join(', ') + '), the ruling is one';
        if (!(junk[0].ch > JUNK_MIN)) return gid + ': ' + id + ' junk row ' + junk[0].id + ' at ' + junk[0].ch + ', not a common';
      }
    }
    return null;
  },
  'slot-coverage'(M) {
    for (const [gid, ground] of Object.entries(M.G.HUNT_GROUNDS)) {
      if (gid === TUTORIAL.ground || banded(gid)) continue;
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
/* OLD MODEL: expected pieces per hour per hero by slot, from the run's kills: kills x the row's chance x the kill's yield share. */
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
/* THE BANDS: the EXPECTED loot per hero-hour on the run's kills (the loot stream never moves a kill, so it is exact for
   the seed and stable under any drop-row change): coin as the settle rounds each kill's roll (hunt-rewards.js payKill),
   each row at the engine's own chance (drops.js effectiveDropChance, the kill's yield share) and the trader's price.
   `items` = band:id -> pieces per hero-hour; `gearBook` = the equipment at full book (the sell factor's evidence). */
function expectedLoot(M, P, monsters, x, n) {
  const y = M.G.yieldPermille(n) / 1000, per = 1 / n / (x.playedMs / H || 1);
  const out = { coin: 0, commons: 0, gear: 0, gearBook: 0, other: 0, items: {} };
  for (const [id, k] of Object.entries(x.killsBy)) {
    const m = monsters[id] || {};
    if (Array.isArray(m.gp)) {
      let t = 0;
      for (let v = m.gp[0]; v <= m.gp[1]; v++) t += Math.round(v * y);
      out.coin += k * t / (m.gp[1] - m.gp[0] + 1) * per;
    }
    for (const d of m.drops || []) {
      const c = M.drops.effectiveDropChance(d, { dropMult: m.dropBonus || 1, yieldMult: y }), it = M.ITEMS[d.id] || {};
      const sold = k * c * P.vendorPriceOf(M.ITEMS, d.id) * per;
      if (!HOUR_BANDS.includes(d.band)) { out.commons += sold; continue; }
      const key = d.band + ':' + d.id;
      out.items[key] = out.items[key] || { id: d.id, band: d.band, perH: 0, from: [] };
      out.items[key].perH += k * c * per;
      out.items[key].from.push(id);
      if (M.LB.VENDOR_GEAR_TYPES.includes(it.type)) { out.gear += sold; out.gearBook += k * c * (Number(it.v) || 0) * per; } else out.other += sold;
    }
  }
  return out;
}

/* THE BANDS' RULES on one played floor hour. Answers the printed evidence. */
function bandRules(M, P, monsters, R, gid, x, n) {
  const E = expectedLoot(M, P, monsters, x, n), list = Object.values(E.items);
  const range = (band) => list.filter((p) => p.band === band).map((p) => 1 / p.perH);
  for (const band of HOUR_BANDS) {
    const [lo, hi] = M.LB.BAND_TARGETS[band].hours, rule = band === 'scarce' ? 'gear-pace' : band === 'rare' ? 'rare-pace' : 'trophy-pace';
    for (const p of list.filter((q) => q.band === band)) {
      const h = 1 / p.perH;
      R.ok(h >= lo && h <= hi, rule + ': ' + gid + ' ' + band + ' ' + p.id + ' (' + p.from.join(', ') + ') every ' + h.toFixed(2) + ' h per hero, outside ' + lo + '-' + hi + ' h');
    }
  }
  R.ok(E.gear <= FAUCET_BANDED * E.coin, 'gear-faucet: ' + gid + ' equipment sells for ' + Math.round(E.gear) + ' g/h, over ' + FAUCET_BANDED + ' of the coin (' + Math.round(E.coin) + ' g/h)');
  const total = E.coin + E.commons + E.gear + E.other, today = TOTAL_TODAY[gid];
  R.ok(today > 0 && total <= (1 + TOTAL_RISE_MAX) * today, 'total-value: ' + gid + ' pays ' + Math.round(total) + ' g per hero-hour, over +' + Math.round(TOTAL_RISE_MAX * 100) + '% on today\'s ' + today);
  /* THE SELL FACTOR the caps allow, measured: the largest share of book the equipment could sell at with both caps met. */
  const fmax = E.gearBook > 0 ? Math.min(FAUCET_BANDED * E.coin, (1 + TOTAL_RISE_MAX) * today - E.coin - E.commons - E.other) / E.gearBook : Infinity;
  return { E, total, today, fmax, scarce: range('scarce'), rare: range('rare'), trophy: range('trophy') };
}

/* THE FRESH HERO, banded: all four slots of each weight within GEAR_HOURS (realized on the real settle). */
function freshWeights(M, R, gid, x) {
  const got = x.heroItems[x.heroes[0]] || {}, have = {};
  for (const [id, q] of Object.entries(got)) { const it = M.ITEMS[id], w = weightOf(M, it); if (w && q > 0) (have[w] = have[w] || new Set()).add(it.slot); }
  for (const w of WEIGHTS) {
    const miss = BUILD_SLOTS.filter((s) => !(have[w] && have[w].has(s)));
    R.ok(!miss.length, 'gear-pace: a fresh hero at the ' + gid + ' floor has no ' + w + ' ' + miss.map((s) => SLOT_WORD[s]).join(', ') + ' after ' + GEAR_HOURS + ' h');
  }
  return WEIGHTS.map((w) => w + ' ' + BUILD_SLOTS.filter((s) => have[w] && have[w].has(s)).length + '/4').join(', ');
}
/* REVEAL-PATH: a fresh hunt on the real settle (seeds searched in a fixed order until a Rare item is credited). */
function revealPath(M, P, monsters, R, gid, first) {
  const ground = M.G.HUNT_GROUNDS[gid], floor = M.HUNTS[ground.hunt].band[0];
  const reveal = new Set(), plain = new Set(), scarce = new Set();
  for (const id of rosterOf(ground)) for (const d of monsters[id].drops || []) {
    (M.LB.REVEAL_BANDS.includes(d.band) ? reveal : plain).add(d.id);
    if (d.band === 'scarce') scarce.add(d.id);
  }
  const only = [...reveal].filter((id) => !plain.has(id)), never = [...plain].filter((id) => !reveal.has(id));
  const gotOf = (x) => x.heroItems[x.heroes[0]] || {};
  let x = first, n = 1;
  for (const secret of FRESH_SEEDS) {
    if (only.some((id) => gotOf(x)[id] > 0)) break;
    x = P.run(gid, floor, ['tank'], { spanMs: GEAR_HOURS * H, monsters, secret }); n++;
  }
  const got = gotOf(x), hints = x.heroRares[x.heroes[0]] || [], count = (id) => hints.filter((h) => h === id).length;
  R.ok(only.some((id) => got[id] > 0), 'reveal-path: ' + gid + ' credited no Rare item in ' + n + ' fresh ' + GEAR_HOURS + ' h hunts');
  for (const h of hints) R.ok(reveal.has(h), 'reveal-path: ' + gid + ' revealed ' + h + ', which no Rare or Trophy row drops');
  for (const id of only) R.ok((got[id] || 0) === count(id), 'reveal-path: ' + gid + ' credited ' + (got[id] || 0) + ' ' + id + ' with ' + count(id) + ' rare-drop hint(s)');
  for (const id of never) R.ok(count(id) === 0, 'reveal-path: ' + gid + ' revealed ' + id + ', a standard drop');
  R.ok([...scarce].some((id) => got[id] > 0), 'reveal-path: ' + gid + ' credited no Scarce piece in a fresh ' + GEAR_HOURS + ' h hunt');
  return n + ' hunt(s): ' + only.filter((id) => got[id] > 0).map((id) => id + ' x' + got[id] + ' (' + count(id) + ' hint)').join(', ');
}

/* `only` (a mutant's ground list) plays just those grounds' floor hour, without the party runs; `fresh` adds their
   fresh-hero hunts (the realized gear-pace and the reveal-path). */
async function plays(M, P, monsters, R, print, only, fresh = !only) {
  const rows = [], partyCarrier = [];
  for (const gid of Object.keys(M.G.HUNT_GROUNDS)) {
    if (only && !only.includes(gid)) continue;
    const ref = REFERENCE[gid];
    if (!ref) { R.ok(false, 'profit-floor: ' + gid + ' has no REFERENCE group'); continue; }
    const floor = M.HUNTS[M.G.HUNT_GROUNDS[gid].hunt].band[0];
    const n = ref.roles.length;
    const x = P.run(gid, Math.max(1, floor), ref.roles, { spanMs: H, fullSet: ref.full, monsters });
    const m = marginOf(x), T = x.totals, h = x.playedMs / H || 1;
    const row = { gid, floor, n, h, coin: T.coin / h / n, commons: T.commons / h / n, store: T.store / h / n, m, deaths: T.falls };
    rows.push(row);
    if (!STARTER.includes(gid)) {
      R.ok(x.playedMs >= H, 'profit-floor: ' + gid + ' ended after ' + (x.playedMs / 60000).toFixed(0) + ' min at its floor (' + T.ended.join(', ') + ')');
      R.ok(m >= MARGIN_MIN, 'profit-floor: ' + gid + ' at level ' + floor + ' earns ' + pct(m) + ' over its store bill, under +' + MARGIN_MIN + '%');
    }
    if (banded(gid)) { row.bands = bandRules(M, P, monsters, R, gid, x, n); continue; }
    /* the EXPECTED sale value of the equipment rows at this run's kills (one lucky body would swing a realized count) */
    row.gearValue = Object.entries(x.killsBy).reduce((s, [id, k]) => { const g = gearRowOf(monsters[id] || {}); return s + (g ? k * g.ch * M.G.yieldPermille(n) / 1000 * P.vendorPriceOf(M.ITEMS, g.id) : 0); }, 0) / h / n;
    row.rates = slotRates({ ...M, MONSTERS: monsters }, M.G, x, n);
    row.rare = rareHours({ ...M, MONSTERS: monsters }, M.G, x, n);
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
  /* THE FRESH HERO: a solo Melee in the ladder kit at the floor, GEAR_HOURS long; the hero levels as it plays. */
  const fresh5 = {}, freshB = {};
  if (fresh) {
    for (const gid of GEAR_RUNS) {
      if (only && !only.includes(gid)) continue;
      const x = P.run(gid, M.HUNTS[M.G.HUNT_GROUNDS[gid].hunt].band[0], ['tank'], { spanMs: GEAR_HOURS * H, monsters });
      if (banded(gid)) { freshB[gid] = { held: freshWeights(M, R, gid, x), reveal: revealPath(M, P, monsters, R, gid, x) }; continue; }
      const got = x.heroItems[x.heroes[0]] || {};
      const bySlot = {};
      for (const [id, q] of Object.entries(got)) { const it = M.ITEMS[id]; if (it && GEAR_TYPES.includes(it.type)) bySlot[it.slot] = (bySlot[it.slot] || 0) + q; }
      fresh5[gid] = bySlot;
      const miss = SLOTS.filter((s) => !bySlot[s]);
      R.ok(!miss.length, 'gear-pace: a fresh hero at the ' + gid + ' floor has no ' + miss.map((s) => SLOT_WORD[s]).join(', ') + ' after ' + GEAR_HOURS + ' h');
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
  if (print) {
    const span = (a) => (a.length ? Math.min(...a).toFixed(2) + '-' + Math.max(...a).toFixed(2) + ' h' : '-');
    console.log('  per hero per hour at the band floor, first hour | coin | commons | store | margin | (old model) gear g/h | pieces/h weapon helmet body legs boots | rare every');
    for (const r of rows) {
      const head = '  ' + r.gid.padEnd(20) + ' L' + String(r.floor).padEnd(3) + (r.n > 1 ? 'party of ' + r.n : 'solo').padEnd(11) + String(Math.round(r.coin)).padStart(5)
        + String(Math.round(r.commons)).padStart(6) + String(Math.round(r.store)).padStart(6) + (Number.isFinite(r.m) ? pct(r.m) : 'no bill').padStart(9);
      if (r.bands) { console.log(head + '   loot bands (below)'); continue; }
      console.log(head + String(Math.round(r.gearValue)).padStart(6) + '   ' + SLOTS.map((s) => (r.rates[s] || 0).toFixed(2).padStart(5)).join(' ')
        + '   ' + (Number.isFinite(r.rare.hours) ? r.rare.hours.toFixed(1) + ' h (' + r.rare.carrier + ')' : '-'));
    }
    for (const r of rows.filter((q) => q.bands)) {
      const B = r.bands, E = B.E, someRare = B.rare.length ? 1 / B.rare.reduce((s, hh) => s + 1 / hh, 0) : Infinity;
      console.log('  LOOT BANDS ' + r.gid + ' L' + r.floor + ' (expected, per hero-hour): Scarce piece every ' + span(B.scarce) + ' (' + B.scarce.length + ' pieces)'
        + ' | Rare item every ' + span(B.rare) + ' (' + B.rare.length + ' items; some Rare every ' + someRare.toFixed(1) + ' h)' + (B.trophy.length ? ' | Trophy every ' + span(B.trophy) : '')
        + ' | coin ' + Math.round(E.coin) + ' commons ' + Math.round(E.commons) + ' gear ' + Math.round(E.gear) + ' (' + Math.round(100 * E.gear / E.coin) + '% of coin) other ' + Math.round(E.other)
        + ' | total ' + Math.round(B.total) + ' vs today ' + B.today + ' (' + pct((B.total / B.today - 1) * 100) + ')'
        + ' | gear sells at ' + M.LB.VENDOR_GEAR_RATE + ' of book; both caps hold up to ' + B.fmax.toFixed(2));
    }
    for (const { gid, sp, spr } of party) {
      console.log('  ' + gid.padEnd(20) + ' L' + M.HUNTS[M.G.HUNT_GROUNDS[gid].hunt].band[0] + '  party of 4 (full set): ' + pct(marginOf(sp)) + ', rare every ' + spr.hours.toFixed(1)
        + ' h (' + spr.carrier + '); store per hero/h ' + Object.entries(sp.totals.buys).map(([k, b]) => k + ' ' + Math.round(Object.entries(b).reduce((s, [id, q]) => s + q * ((P.basics[id] || {}).price || 0), 0) / (sp.playedMs / H))).join(', '));
    }
    for (const [gid, b] of Object.entries(fresh5)) console.log('  fresh solo hero, ' + gid + ', ' + GEAR_HOURS + ' h: ' + SLOTS.map((s) => SLOT_WORD[s] + ' ' + (b[s] || 0)).join(', '));
    for (const [gid, b] of Object.entries(freshB)) console.log('  fresh solo hero, ' + gid + ', ' + GEAR_HOURS + ' h: slots held ' + b.held + ' | reveals on the settle: ' + b.reveal);
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

/* THE WARRENS FLOOR (CONFLICTS item 2): the party at 32 and a lone hero at the card's soloFrom, two seeds. */
const WARRENS_SEEDS = Object.freeze(['-4611686018427387904', '1234567890123']);
function warrensFloor(M, P, R, print) {
  const gid = 'coppercap_warrens', row = M.G.HUNT_GROUNDS[gid], floor = M.HUNTS[row.hunt].band[0];
  const margins = (x) => {
    const T = x.totals, h = x.playedMs / H || 1, share = (T.coin + T.commons) / h / x.heroes.length;
    return x.heroes.map((k) => { const bill = Object.entries(T.buys[k] || {}).reduce((s2, [id, q]) => s2 + q * ((P.basics[id] || {}).price || 0), 0) / h;
      return [k, bill > 0 ? (share / bill - 1) * 100 : Infinity]; });
  };
  const out = [];
  for (const secret of WARRENS_SEEDS) {
    const party = P.run(gid, floor, PARTY, { spanMs: H, secret });
    R.ok(party.playedMs >= H && party.totals.falls === 0, 'warrens-floor: the party of four (ladder kit) at ' + floor + ' ended after ' + (party.playedMs / 60000).toFixed(1) + ' min, ' + party.totals.falls + ' death(s)');
    for (const [k, m] of margins(party)) R.ok(m >= MARGIN_MIN, 'warrens-floor: party ' + k + ' at ' + floor + ' earns ' + pct(m) + ', under +' + MARGIN_MIN + '%');
    const lone = Number.isInteger(row.soloFrom) ? row.soloFrom : floor;
    const solo = P.run(gid, lone, ['tank'], { spanMs: H, secret, fullSet: true });
    const [, sm] = margins(solo)[0];
    R.ok(solo.playedMs >= H && sm >= MARGIN_MIN, 'warrens-floor: a lone Melee at ' + lone + ' (the card\'s alone-from Level) earns ' + pct(sm) + ' over ' + (solo.playedMs / 60000).toFixed(0) + ' min, under +' + MARGIN_MIN + '%');
    out.push(margins(party).map(([k, m]) => k + ' ' + pct(m)).join(', ') + ' | alone at ' + lone + ' ' + (Number.isFinite(sm) ? pct(sm) : 'no bill'));
  }
  if (print) console.log('  ' + gid.padEnd(20) + ' L' + floor + '  party of 4 (ladder kit) per seed: ' + out.join(' ; '));
}

/* ── MUTANTS: every case and every play rule must bite ─────────────────── */
const clone = (MONSTERS, edit) => {
  const out = {};
  for (const [id, m] of Object.entries(MONSTERS)) out[id] = { ...m, drops: (m.drops || []).map((d) => ({ ...d })) };
  edit(out);
  return out;
};
/* A data mutant's copy of M: the monsters cloned, the item map and the Hearthfind sources shallow-copied for its edit. */
const mutated = (M, edit) => {
  const M2 = { ...M, ITEMS: { ...M.ITEMS }, hfSources: new Set(M.hfSources) };
  M2.MONSTERS = clone(M.MONSTERS, (ms) => edit(ms, M2));
  return M2;
};
const gearOf = (ms, id) => ms[id].drops.find(isGear);
const rowOf = (ms, id, item) => ms[id].drops.find((d) => d.id === item);
const dataMutants = [
  /* THE OLD MODEL (on its own grounds) */
  { name: 'an equipment row dropped', case: 'slot-structure', edit: (ms) => { ms.drain_rat.drops = ms.drain_rat.drops.filter((d) => !isGear(d)); } },
  { name: 'a second equipment row', case: 'slot-structure', edit: (ms) => { ms.carrion_crow.drops.push({ id: 'bronze_helm', ch: 0.01, gear: true }); } },
  { name: 'equipment nobody in range can wear', case: 'slot-structure', edit: (ms) => { gearOf(ms, 'carrion_crow').id = 'mithril_platebody'; } },
  { name: 'equipment as a common', case: 'slot-structure', edit: (ms) => { gearOf(ms, 'sump_slime').ch = 0.2; } },
  { name: 'the salvage row kept beside it', case: 'slot-structure', edit: (ms) => { ms.walking_vine.drops.push({ id: 'bronze_gauntlets', ch: 0.002, salvage: true }); } },
  { name: 'the equipment flag lost (a rare reveal again)', case: 'one-rare-carrier', edit: (ms) => { delete gearOf(ms, 'culvert_bat').gear; ms.culvert_bat.drops.push({ id: 'bronze_sword', ch: 0.01, gear: true }); } },
  { name: 'a second rare carrier', case: 'one-rare-carrier', edit: (ms) => { ms.cistern_spider.drops.splice(2, 0, { id: 'spider_eye', ch: 0.035 }); } },
  { name: 'two helmets, no boots', case: 'slot-coverage', edit: (ms) => { gearOf(ms, 'carrion_crow').id = 'studded_helmet'; } },
  /* BOTH MODELS: the four slots */
  { name: 'the imbuement row dropped', case: 'four-slots', edit: (ms) => { ms.drain_rat.drops = ms.drain_rat.drops.filter((d) => d.id !== 'rat_incisor'); } },
  { name: 'one imbuement item on two monsters', case: 'four-slots', edit: (ms) => { ms.sump_slime.drops.find((d) => d.id === 'sump_membrane').id = 'rat_incisor'; } },
  { name: 'an imbuement row at rare odds', case: 'four-slots', edit: (ms) => { ms.gray_wolf.drops.find((d) => d.id === 'gray_dewclaw').ch = 0.02; } },
  { name: 'a second junk row back (the old free-form list)', case: 'four-slots', edit: (ms) => { ms.gray_wolf.drops.splice(1, 0, { id: 'wolf_pelt', ch: 0.06 }); } },
  { name: 'the junk row lost', case: 'four-slots', edit: (ms) => { ms.cistern_spider.drops = ms.cistern_spider.drops.filter((d) => d.id !== 'silk_thread'); } },
  { name: 'an imbuement item on a monster of the wrong tier', case: 'four-slots', edit: (ms) => { ms.rat_king.level = 30; } },
  /* THE LOOT BANDS */
  { name: 'a band row loses its band', case: 'loot-structure', edit: (ms) => { delete rowOf(ms, 'gray_wolf', 'bones').band; } },
  { name: 'a misspelt band', case: 'loot-structure', edit: (ms) => { rowOf(ms, 'gray_whelp', 'bronze_boots').band = 'scarse'; } },
  { name: 'an old-model flag on a banded row', case: 'loot-structure', edit: (ms) => { rowOf(ms, 'briarcoat_wolf', 'leather_pants').gear = true; } },
  { name: 'a band on an old-model ground (half converted)', case: 'loot-structure', edit: (ms) => { rowOf(ms, 'drain_rat', 'bones').band = 'common'; } },
  { name: 'rows out of band order', case: 'loot-structure', edit: (ms) => { const d = ms.gray_whelp.drops; d.push(d.splice(2, 1)[0]); } },
  { name: 'a Scarce row at common odds', case: 'loot-structure', edit: (ms) => { rowOf(ms, 'briarcoat_wolf', 'leather_pants').ch = 0.2; } },
  { name: 'a Common under 15%', case: 'loot-structure', edit: (ms) => { rowOf(ms, 'gray_wolf', 'bones').ch = 0.1; } },
  { name: 'a second Uncommon', case: 'loot-structure', edit: (ms) => { ms.gray_wolf.drops.splice(3, 0, { id: 'wolf_pelt', ch: 0.1, band: 'uncommon' }); } },
  { name: 'a weight missing from a Scarce slot', case: 'loot-structure', edit: (ms) => { ms.gray_whelp.drops = ms.gray_whelp.drops.filter((d) => d.id !== 'apprentice_boots'); } },
  { name: 'two slots on one monster', case: 'loot-structure', edit: (ms) => { rowOf(ms, 'gray_whelp', 'apprentice_boots').id = 'apprentice_helmet'; } },
  { name: 'Scarce gear nobody in range can wear', case: 'loot-structure', edit: (ms) => { rowOf(ms, 'gray_wolf', 'bronze_helm').id = 'steel_helm'; } },
  { name: 'a Trophy on a monster that is no boss', case: 'loot-structure', edit: (ms) => { ms.grayjaw.drops.push({ id: 'war_crown', ch: 0.0005, band: 'trophy' }); } },
  { name: 'a boss\'s Trophy before its Rare rows', case: 'loot-structure', edit: (ms) => { ms.grayjaw.boss = true; ms.grayjaw.drops.splice(3, 0, { id: 'war_crown', ch: 0.0005, band: 'trophy' }); } },
  { name: 'a revealed item with a dormant effect', case: 'loot-structure', edit: (ms, M2) => { M2.ITEMS.grayjaws_ruff = { ...M2.ITEMS.grayjaws_ruff, effects: ['not_an_engine_effect'] }; } },
  { name: 'a revealed Hearthfind', case: 'loot-structure', edit: (ms) => { rowOf(ms, 'grayjaw', 'grayjaws_ruff').id = 'emberheart'; } },
  { name: 'a revealed unique', case: 'loot-structure', edit: (ms, M2) => { M2.ITEMS.grayjaws_ruff = { ...M2.ITEMS.grayjaws_ruff, rarity: 'unique' }; } },
  { name: 'a revealed item with no icon', case: 'loot-structure', edit: (ms, M2) => { M2.ITEMS.no_icon_relic = { n: 'No Icon Relic', v: 100 }; rowOf(ms, 'grayjaw', 'alpha_fang').id = 'no_icon_relic'; } },
  { name: 'a revealed item the Shop sells', case: 'loot-structure', edit: (ms) => { rowOf(ms, 'grayjaw', 'alpha_fang').id = 'traveler_cape'; } },
  { name: 'a revealed item that is boss loot', case: 'loot-structure', edit: (ms) => { rowOf(ms, 'grayjaw', 'alpha_fang').id = 'warboss_standard'; } },
  { name: 'a revealed item two tiers up', case: 'loot-structure', edit: (ms) => { rowOf(ms, 'grayjaw', 'iron_helm').id = 'mithril_helm'; } },
  { name: 'a Hearthfind source that reveals', case: 'loot-structure', edit: (ms, M2) => { M2.hfSources.add('grayjaw'); } },
  { name: 'the Dire Grays drop helmets, not bodies', case: 'build-coverage', edit: (ms) => {
    rowOf(ms, 'dire_gray', 'bronze_platebody').id = 'bronze_helm'; rowOf(ms, 'dire_gray', 'leather_body').id = 'leather_helmet'; rowOf(ms, 'dire_gray', 'apprentice_body').id = 'apprentice_helmet';
  } },
];
/* Played on the monsters' copy: the expected loot on the floor hour's kills (and, with `fresh`, the fresh-hero hunts). */
const playMutants = [
  /* The Sewer's coin cut to under half (armour weights, ruling K7, left the ladder-kit Melee +119% at the floor,
     so the old /1.8 coin clears +25% by a hair: the floor still bites at /2.2, about +11%). */
  { name: 'the Sewer coin cut to under half', rule: 'profit-floor: millrace_sewer', edit: (ms) => {
    for (const id of ['drain_rat', 'sump_slime', 'culvert_bat', 'cistern_spider', 'kobold_tosher', 'rat_king']) ms[id].gp = ms[id].gp.map((v) => Math.max(1, Math.round(v / 2.2)));
  } },
  { name: 'the Sewer boots five times rarer (old model)', rule: 'gear-pace: millrace_sewer', edit: (ms) => { gearOf(ms, 'drain_rat').ch /= 5; } },
  { name: 'Rook\'s Whistle at 1% (old model)', rule: 'rare-pace: mosslight_glade', edit: (ms) => { ms.rook_poacher.drops.find((d) => d.id === 'rooks_whistle').ch = 0.01; } },
  /* half price for worn gear (loot-bands.js VENDOR_GEAR_RATE) halved the old faucet: every Warrens piece at 5% bites */
  { name: 'the Warrens gear by the cartload (old model)', rule: 'gear-faucet: coppercap_warrens', edit: (ms) => {
    for (const id of ['goblin_scavenger', 'goblin_skulker', 'goblin_digger', 'hobgoblin_foreman', 'chief_coppercap']) gearOf(ms, id).ch = 0.05;
  } },
  { name: 'the Thicket\'s heavy boots five times rarer', rule: 'gear-pace: meadowbrook_thicket', edit: (ms) => { rowOf(ms, 'gray_whelp', 'bronze_boots').ch /= 5; } },
  { name: 'the Thicket\'s bodies twice as common', rule: 'gear-pace: meadowbrook_thicket', edit: (ms) => { for (const d of ms.dire_gray.drops) if (d.band === 'scarce') d.ch *= 2; } },
  { name: 'the den mother\'s fang back to 1%', rule: 'rare-pace: meadowbrook_thicket', edit: (ms) => { rowOf(ms, 'grayjaw', 'alpha_fang').ch = 0.01; } },
  { name: 'the Studded Leather Body ten times rarer', rule: 'rare-pace: meadowbrook_thicket', edit: (ms) => { rowOf(ms, 'dire_gray', 'studded_body').ch /= 10; } },
  { name: 'a boss Trophy every 44 h', rule: 'trophy-pace: meadowbrook_thicket', edit: (ms) => { ms.grayjaw.boss = true; ms.grayjaw.drops.push({ id: 'war_crown', ch: 0.001, band: 'trophy' }); } },
  { name: 'the den mother\'s fang a War Crown at 2% (value, not gear)', rule: 'total-value: meadowbrook_thicket', edit: (ms) => { Object.assign(rowOf(ms, 'grayjaw', 'alpha_fang'), { id: 'war_crown', ch: 0.02 }); } },
  { name: 'a fresh hero\'s heavy boots gone', rule: 'gear-pace: a fresh hero at the meadowbrook_thicket', fresh: true, edit: (ms) => { ms.gray_whelp.drops = ms.gray_whelp.drops.filter((d) => d.id !== 'bronze_boots'); } },
];
/* Planted trees (src/data, src/core, the settle), played on the Thicket. */
const plantMutants = [
  { name: 'worn gear sells at full book again', rule: 'gear-faucet: meadowbrook_thicket', edits: [['src/data/loot-bands.js', 'export const VENDOR_GEAR_RATE = 0.5;', 'export const VENDOR_GEAR_RATE = 1;']] },
  { name: 'the roller reveals nothing (a Rare credited with no hint)', rule: 'reveal-path: meadowbrook_thicket', fresh: true,
    edits: [['src/core/drops.js', 'rare: REVEAL_BANDS.includes(band) });', 'rare: false });']] },
];
/* The caster floor's levers live in src/data the engine imports: each mutant plays on a planted copy. */
const casterMutants = [
  /* Every store drink back (the bar's default buys the cheapest per point of them all, not one tier's). */
  { name: 'the drinks back to the old grain (a tier-1 drink 6-8 mana)', edits: [
    ['src/data/supply-basics.js', "'turnip_juice', 72, 10)", "'turnip_juice', 6, 10)"],
    ['src/data/supply-basics.js', "'carrot_juice', 120, 18)", "'carrot_juice', 10, 18)"],
    ['src/data/supply-basics.js', "'tomato_juice', 216, 45)", "'tomato_juice', 18, 45)"],
    ['src/data/supply-basics.js', "'pumpkin_cider', 288, 80)", "'pumpkin_cider', 24, 80)"],
    ['src/data/supply-basics.js', "'goldenroot_tea', 396, 138)", "'goldenroot_tea', 33, 138)"],
    ['src/data/supply-basics.js', "'emberfruit_cordial', 480, 233)", "'emberfruit_cordial', 40, 233)"],
    ['src/data/drinks.js', "v: 6, mana: 96 ", "v: 6, mana: 8 "]] },
  { name: 'Fireball spends a Fire Rune again (the Mage casts nothing)', edits: [
    ['src/data/abilities.js', "id: 'fireball', n: 'Fireball', disciplines: ['destruction'], lane: 'offense', cdMs: 8000, mana: 25,",
      "id: 'fireball', n: 'Fireball', disciplines: ['destruction'], lane: 'offense', cdMs: 8000, mana: 25, rune: 'fire_rune',"]] },
];
/* The Warrens floor's levers (src/data + the tier table in src/core/combat.js): each plays on a planted copy. */
const warrensMutants = [
  /* Store-by-slot (v0.2.30): the measured hero's bar names the guide's food (play-ground.mjs refBar), so the mutant
     puts the guide back on the tier-4 Swordfish, as a player stocking by the old guide would. */
  { name: 'the Warrens store food back to tier 4', edits: [['src/data/supplies.js', "  coppercap_warrens: Object.freeze({ tier: 3,\n    melee: melee('cooked_lobster', 80),",
    "  coppercap_warrens: Object.freeze({ tier: 4,\n    melee: melee('cooked_swordfish', 80),"]] },
  { name: 'tier-3 blows back to the flat 5.4', edits: [['src/core/combat.js', 'monsterDamageScaleByTier: Object.freeze({ 3: 4.0, 4: 4.0,', 'monsterDamageScaleByTier: Object.freeze({ 4: 4.0,']] },
  { name: 'the card offers the Warrens alone from 40', edits: [['src/data/hunt-grounds.js', '    soloFrom: 45,', '    soloFrom: 40,']] },
];
const engineMutants = [
  { name: 'the row\'s band ignored (the odds decide the reveal again)', case: 'band-is-the-reveal',
    edits: [['src/core/drops.js', '  if (row && LOOT_BANDS.includes(row.band)) return row.band;\n', '']] },
  { name: 'a Trophy is no reveal', case: 'band-is-the-reveal',
    edits: [['src/data/loot-bands.js', "export const REVEAL_BANDS = Object.freeze(['rare', 'trophy']);", "export const REVEAL_BANDS = Object.freeze(['rare']);"]] },
  { name: 'the old equipment band forgotten in the engine', case: 'band-is-the-reveal',
    edits: [['src/core/drops.js', "  return row && row.gear === true ? 'gear' : dropBand(row ? row.ch : 0);", '  return dropBand(row ? row.ch : 0);']] },
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
warrensFloor(M, P, R, true);

for (const mu of dataMutants) {
  let why = null;
  try { why = cases[mu.case](mutated(M, mu.edit)); } catch (e) { why = 'threw ' + e.message; }
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
const groundOf = (rule) => /meadowbrook_thicket|millrace_sewer|mosslight_glade|coppercap_warrens|mill_cellar/.exec(rule)[0];
for (const mu of playMutants) {
  const MR = { fails: [], ok(c, msg) { if (!c) this.fails.push(msg); } };
  await plays(M, P, clone(M.MONSTERS, mu.edit), MR, false, [groundOf(mu.rule)], mu.fresh === true);
  R.ok(MR.fails.some((f) => f.startsWith(mu.rule)), 'mutant "' + mu.name + '" was NOT caught by ' + mu.rule + ' (fails: ' + (MR.fails.join(' | ') || 'none') + ')');
}
for (const mu of plantMutants) {
  const p = plant(mu.edits, PLAY_TREES);
  try {
    const MR = { fails: [], ok(c, msg) { if (!c) this.fails.push(msg); } };
    await plays(await load(p.root), await loadPlay(p.root), M.MONSTERS, MR, false, [groundOf(mu.rule)], mu.fresh === true);
    R.ok(MR.fails.some((f) => f.startsWith(mu.rule)), 'mutant "' + mu.name + '" was NOT caught by ' + mu.rule + ' (fails: ' + (MR.fails.join(' | ') || 'none') + ')');
  } finally { p.done(); }
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
for (const mu of warrensMutants) {
  const p = plant(mu.edits, PLAY_TREES);
  try {
    const MR = { fails: [], ok(c, msg) { if (!c) this.fails.push(msg); } };
    warrensFloor({ ...M, G: await imp(p.root, 'src/data/hunt-grounds.js') }, await loadPlay(p.root), MR, false);
    R.ok(MR.fails.length > 0, 'mutant "' + mu.name + '" was NOT caught by warrens-floor');
    if (MR.fails.length) console.log('  warrens mutant "' + mu.name + '" caught: ' + MR.fails[0].slice(0, 140));
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases + the plays, ' + (dataMutants.length + engineMutants.length + playMutants.length + plantMutants.length + casterMutants.length + warrensMutants.length) + ' mutants caught');
R.finish();
