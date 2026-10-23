// tests/hunt-core/drop-tables.mjs — WHAT EVERY WALKED HUNT PAYS (Tyler 2026-10-14 loot ruling, 2026-10-20 drops +
// profit rulings, 2026-10-23 loot redesign). Run by run-all.mjs. Cases on the data, then plays on the real settle
// (play-ground.mjs: the hr-accrue accrueHunt the world tick runs, one fixed hunt seed, ten-minute windows), then mutants.
//
// EVERY WALKED GROUND IS ON THE LOOT BANDS (src/data/loot-bands.js; the Thicket the sample, Phase A, the other four in
// batches of 20 rows or fewer, Phase B, 2026-10-23). The old one-equipment-row model retired with its last ground.
//
//   loot-structure   every row names a band, in band order (Trophy last); 1-2 Commons over 15% (COMMONS_PENDING monsters
//                    wait on the designer's trim), ONE Uncommon in (5%, 15%], every Scarce / Rare / Trophy row at 5% or
//                    less; a monster's Scarce armour is helmet / body / legs / boots in heavy, medium AND light, once each per
//                    slot it carries (weapons may join), wearable in the ground's band; a Trophy only on a boss. A REVEALED
//                    item (Rare, Trophy) is live (no dormant effect), has its pixel icon, is no Hearthfind, not tier 8, not
//                    'unique', not sold by a listed Shop row, not boss loot, of its dropper's tier or one above, and its
//                    dropper is no Hearthfind source (the checks lucky-finds and field-salvage make for their own rows)
//   slot-homes       each Scarce slot on a ground has ONE home a player can learn: one monster, or a named group of the
//                    ground's slow monsters (loot-bands.js LOOT_GROUPS); a monster carries at most two armour slots and one
//                    Scarce weapon (SLOT_LIMITS)
//   pending-rows     a row parked for an item not built yet (loot-bands.js PENDING_ROWS: the Kingsgrate) names a monster
//                    and a row it follows, sits in its band's odds, and its item does NOT exist (the day it does, the row moves)
//   sale-ladder      every armour line, weapon family and the spellbook sells tier by tier for no less than its lower twin
//   band-is-the-reveal  the roller (src/core/drops.js bandOf) reveals exactly the Rare and Trophy rows; Common, Uncommon and
//                    Scarce are standard drops; an unbanded old-roster row (a lucky or salvage find) reveals by its odds
//   build-coverage   each ground's Scarce rows cover helmet, body, legs and boots in all three weights (the tutorial excepted)
//   four-slots       each monster has a Common that is its own product (not bones), at most one bones row, and EXACTLY one
//                    imbuement row (`imbue`, no other monster drops it, (5%, 15%], tier and book value from its Level)
//   gear-pace        (the floor hour, expected on its kills) each Scarce piece lands about once an hour per hero
//                    (BAND_TARGETS.scarce, Tyler 2026-10-23), for the reference group AND a party ground's second group
//                    (BAND_ALT); a fresh solo hero at the floor holds all four slots of EACH weight within GEAR_HOURS
//   rare-pace        each Rare item every 10-20 h per hero (a PENDING_ROWS row too, at the pace it will have);
//   trophy-pace      each Trophy item every 125-150 h per hero, so a full Bestiary (x1.25) still waits 100 h
//   gear-faucet      the equipment's expected sale value (the trader's price, loot-bands.js VENDOR_GEAR_RATES by tier) per
//                    hero-hour is at most FAUCET of the coin
//   total-value      coin + commons + every Scarce / Rare / Trophy row's sale value per hero-hour is at most +25% over the
//                    group's value pinned before the conversion (TOTAL_TODAY, BAND_ALT.today)
//   reveal-path      (the real settle, a fresh GEAR_HOURS hunt) every Rare item credited rides the settle's rare-drop hint
//                    (the row the database journals as rare_drop and broadcasts), and no Scarce piece does; on a party
//                    ground every Rare unit a party of four gets also went through the party's rare roll
//   profit-floor     at its band floor, in its first hour, each non-starter ground earns coin + commons at least +25% over
//                    the store bill (a MINIMUM, Tyler 10-20)
//   warrens-floor    the Warrens' party of four at 32 and a lone own-tier Melee at the card's soloFrom clear +25% on two seeds
//   caster-floor     the Sewer's party of four at its floor lives the hour, the Mage casts, every role clears +25%
//   ranger-floor     a crossbow + shield Ranger on store Iron Bolts (no free bolt rung: every shot bought) in the party of four
//                    at the Sewer and Warrens floors lives the hour and clears +25% over its own bill; in range (Sewer 20,
//                    Warrens 50) its shot bill is printed against the coin share (the designer's ~45-55% of coin)
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
const FAUCET = 0.50;            // designer 2026-10-23, Tyler: gear's sale value at most half the coin
const TOTAL_RISE_MAX = 0.25;    // Tyler 2026-10-23: total value up to +25% over today's pinned numbers
/* TODAY'S PINNED VALUE: expected gold per hero-hour at the floor (coin as the settle rounds it, commons, and every row the
   band model puts at 5% or less, each at the trader's price with gear at full book), on the floor hour's kills, measured
   on next b7af6a9db before any ground converted. A conversion is held to +25% over its ground's row; never re-pinned. */
const TOTAL_TODAY = Object.freeze({ mill_cellar: 1869, millrace_sewer: 3822, meadowbrook_thicket: 2285, coppercap_warrens: 4588, mosslight_glade: 3834 });
const BUILD_SLOTS = Object.freeze(['helmet', 'body', 'pants', 'boots']);
const WEIGHTS = Object.freeze(['heavy', 'medium', 'light']);
const SLOT_WORD = Object.freeze({ helmet: 'helmet', body: 'body', pants: 'legs', boots: 'boots' });
const GEAR_TYPES = Object.freeze(['weapon', 'armor', 'offhand']);
const HOUR_BANDS = Object.freeze(['scarce', 'rare', 'trophy']);
/* The tutorial cellar teaches the pull with one slot: its Hive Wasp's helmets in three weights (build-coverage). */
const TUTORIAL = Object.freeze({ ground: 'mill_cellar' });
/* MONSTERS STILL OVER TWO COMMONS (the designer's trim, 2026-10-23): the Giant Rat's wheat, the Warrens' ore, ears
   and coal. SHRINK-ONLY: a monster leaves when its Commons are one product and at most one bones row. */
const COMMONS_PENDING = Object.freeze(['rat', 'goblin_scavenger', 'goblin_skulker', 'goblin_digger', 'hobgoblin_foreman', 'chief_coppercap']);
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
/* THE PARTY GROUNDS' SECOND GROUP (a party ground is measured for a party at the floor AND solo): the Sewer's party of
   four at its floor in the full set, and the Warrens' lone hero at the card's soloFrom. `today` is that group's own
   pinned value (TOTAL_TODAY's method, next b7af6a9db). */
const BAND_ALT = Object.freeze({
  millrace_sewer: Object.freeze({ roles: PARTY, full: true, at: 'floor', today: 3422 }),
  coppercap_warrens: Object.freeze({ roles: Object.freeze(['tank']), full: true, at: 'soloFrom', today: 5226 }),
});
/* The party grounds whose Rare units must go through the party's rare roll (a GEAR_HOURS hunt at the floor). */
const PARTY_REVEAL = Object.freeze({
  millrace_sewer: Object.freeze({ roles: PARTY, full: true }),
  coppercap_warrens: Object.freeze({ roles: PARTY, full: true }),
});
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
    vendor: (await imp(root, 'supabase/functions/hr-accrue/catalogue.js')).vendorPriceOf,
    ladders: (await imp(root, 'src/data/gear-tiers.js')).GEAR_LADDERS,
  };
}

/** The monster kinds a ground spawns at any density (every pocket's spawns and full pack). */
function rosterOf(ground) {
  const ids = new Set();
  for (const p of ground.pockets) for (const s of (p.pack || []).concat(p.spawns)) ids.add(s.monster);
  return [...ids].sort();
}
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
        if (commons < 1 || (commons > 2 && !COMMONS_PENDING.includes(id))) return tag + ' has ' + commons + ' Common rows, the rule is 1-2';
        if (uncommons !== 1) return tag + ' has ' + uncommons + ' Uncommon rows, the rule is one (its imbuement item)';
        if (trophies > 1) return tag + ' has ' + trophies + ' Trophy rows, the rule is one per boss';
        /* every slot a monster carries comes in heavy, medium AND light, once each (one slot where the kills allow it;
           a fast-dying swarm may carry two, a slow trio may share one, to hold the hourly pace: gear-pace) */
        for (const slot of new Set(armour.map((it) => it.slot))) {
          const weights = armour.filter((it) => it.slot === slot).map((it) => weightOf(M, it)).sort().join(', ');
          if (weights !== [...WEIGHTS].sort().join(', ')) return tag + ' Scarce ' + SLOT_WORD[slot] + ' come in ' + weights + ': the rule is heavy, medium and light, once each';
        }
      }
    }
    return null;
  },
  'band-is-the-reveal'(M) {
    const sure = { chance: () => true, int: (a) => a };
    const rows = [{ id: 'c', ch: 0.5, band: 'common' }, { id: 'u', ch: 0.1, band: 'uncommon' }, { id: 's', ch: 0.01, band: 'scarce' },
      { id: 'r', ch: 0.01, band: 'rare' }, { id: 't', ch: 0.001, band: 'trophy' }, { id: 'o', ch: 0.01 }, { id: 'n', ch: 0.5 }];
    const want = { c: [false, 'common'], u: [false, 'uncommon'], s: [false, 'scarce'], r: [true, 'rare'], t: [true, 'trophy'], o: [true, 'rare'], n: [false, 'common'] };
    const out = M.drops.rollDropTable(rows, {}, sure);
    for (const [id, [rare, band]] of Object.entries(want)) {
      const ev = out.events.find((e) => e.id === id);
      if (!ev || ev.rare !== rare || ev.band !== band) return 'a ' + band + ' row rolled as ' + JSON.stringify(ev) + ', the rule is band ' + band + (rare ? ', revealed' : ', no reveal');
    }
    return null;
  },
  'build-coverage'(M) {
    for (const [gid, ground] of Object.entries(M.G.HUNT_GROUNDS)) {
      /* the tutorial room teaches the pull with one slot (the Hive Wasp's helmets, designer 2026-10-23) */
      if (gid === TUTORIAL.ground) continue;
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
  'slot-homes'(M) {
    const groups = M.LB.LOOT_GROUPS, max = M.LB.SLOT_LIMITS;
    for (const [gid, ground] of Object.entries(M.G.HUNT_GROUNDS)) {
      const homes = {}, named = (groups[gid] || []).map((g) => [...g.monsters].sort().join());
      for (const id of rosterOf(ground)) {
        const rows = (M.MONSTERS[id].drops || []).filter((d) => d.band === 'scarce');
        const slots = new Set(rows.map((d) => weightOf(M, M.ITEMS[d.id]) && M.ITEMS[d.id].slot).filter(Boolean));
        const weapons = rows.filter((d) => M.ITEMS[d.id] && M.ITEMS[d.id].type !== 'armor').length;
        if (slots.size > max.armourSlots) return gid + ': ' + id + ' carries ' + slots.size + ' armour slots, the rule is ' + max.armourSlots;
        if (weapons > max.weapons) return gid + ': ' + id + ' carries ' + weapons + ' Scarce weapons, the rule is ' + max.weapons;
        for (const sl of slots) (homes[sl] = homes[sl] || []).push(id);
      }
      for (const [sl, at] of Object.entries(homes)) {
        if (at.length > 1 && !named.includes([...at].sort().join())) return gid + ': ' + SLOT_WORD[sl] + ' drop from ' + at.join(', ') + ', two homes and no named group (loot-bands.js LOOT_GROUPS)';
      }
      const used = new Set(Object.values(homes).filter((at) => at.length > 1).map((at) => [...at].sort().join()));
      const stale = (groups[gid] || []).find((g) => !used.has([...g.monsters].sort().join()));
      if (stale) return gid + ': the group "' + stale.name + '" is the home of no slot (its monsters do not carry one together)';
    }
    return null;
  },
  'pending-rows'(M) {
    for (const r of M.LB.PENDING_ROWS) {
      const m = M.MONSTERS[r.monster];
      if (!m) return r.id + ': its monster ' + r.monster + ' does not exist';
      if (M.ITEMS[r.id]) return r.id + ' exists now: move its row onto ' + r.monster + ' after ' + r.after + ' and out of PENDING_ROWS';
      if (!(m.drops || []).some((d) => d.id === r.after)) return r.id + ': ' + r.monster + ' has no ' + r.after + ' row to follow';
      const T = M.LB.BAND_TARGETS[r.band];
      if (!T || !(r.ch > 0 && r.ch <= (T.oddsMax || 0))) return r.id + ': band ' + r.band + ' at ' + r.ch + ', outside its odds';
    }
    return null;
  },
  'sale-ladder'(M) {
    for (const l of M.ladders) {
      let prev = null;
      for (const id of l.ids) {
        if (!id || !M.ITEMS[id]) continue;
        const p = M.vendor(M.ITEMS, id);
        if (prev && p < prev.p) return l.key + ': ' + id + ' sells for ' + p + ', under its lower-tier twin ' + prev.id + ' (' + prev.p + ')';
        prev = { id, p };
      }
    }
    return null;
  },
  'four-slots'(M) {
    const droppers = {};
    for (const [mid, m] of Object.entries(M.MONSTERS)) for (const d of m.drops || []) (droppers[d.id] = droppers[d.id] || new Set()).add(mid);
    for (const [gid, ground] of Object.entries(M.G.HUNT_GROUNDS)) {
      for (const id of rosterOf(ground)) {
        const m = M.MONSTERS[id], drops = m.drops || [];
        const imbue = drops.filter((d) => M.ITEMS[d.id] && M.ITEMS[d.id].imbue);
        if (imbue.length !== 1) return gid + ': ' + id + ' has ' + imbue.length + ' imbuement rows, the ruling is one';
        const d = imbue[0], it = M.ITEMS[d.id];
        if (!M.IMB.IMBUE_KINDS.includes(it.imbue.kind)) return gid + ': ' + d.id + ' feeds an unknown kind ' + it.imbue.kind;
        if (it.imbue.tier !== M.IMB.imbueTierFor(m.level)) return gid + ': ' + d.id + ' is tier ' + it.imbue.tier + ', its dropper (Level ' + m.level + ') feeds tier ' + M.IMB.imbueTierFor(m.level);
        if (it.v !== M.IMB.imbueValueFor(m.level) || it.raw !== true) return gid + ': ' + d.id + ' book value ' + it.v + ' (raw ' + it.raw + '), the rule is ' + M.IMB.imbueValueFor(m.level) + ', raw';
        if (!(d.ch > M.IMB.IMBUE_DROP.above && d.ch <= M.IMB.IMBUE_DROP.max)) return gid + ': ' + id + ' imbuement row at ' + d.ch + ', not in the uncommon band';
        if (droppers[d.id].size !== 1) return gid + ': ' + d.id + ' is dropped by ' + [...droppers[d.id]].join(', ') + ', the ruling is one monster';
        if (drops.filter((x) => BONES.includes(x.id)).length > 1) return gid + ': ' + id + ' has two bones rows';
        if (!drops.some((x) => x.band === 'common' && !BONES.includes(x.id))) return gid + ': ' + id + ' has no Common of its own (a part that sells or feeds a bench)';
      }
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
/* THE EXPECTED loot per hero-hour on the run's kills (the loot stream never moves a kill, so it is exact for the seed
   and stable under any drop-row change): coin as the settle rounds each kill's roll (hunt-rewards.js payKill), each
   row at the engine's own chance (drops.js effectiveDropChance, the kill's yield share) and the trader's price.
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

/* THE BANDS' RULES on one played floor hour (`label` names a party ground's second group). Answers the evidence. */
function bandRules(M, P, monsters, R, gid, x, n, today, label) {
  const E = expectedLoot(M, P, monsters, x, n), list = Object.values(E.items), at = gid + (label ? ' (' + label + ')' : '');
  const range = (band) => list.filter((p) => p.band === band && !p.pending).map((p) => 1 / p.perH);
  /* A parked row (PENDING_ROWS) is measured at the pace it will have on this run's kills. */
  const y = M.G.yieldPermille(n) / 1000, per = 1 / n / (x.playedMs / H || 1);
  for (const r of M.LB.PENDING_ROWS) {
    const k = x.killsBy[r.monster] || 0;
    if (k) list.push({ id: r.id, band: r.band, perH: k * Math.min(0.95, r.ch * y) * per, from: [r.monster + ', pending'], pending: true });
  }
  for (const band of HOUR_BANDS) {
    const T = M.LB.BAND_TARGETS[band], lo = T.hours[0] * (T.boostMax || 1), hi = T.hours[1];
    const rule = band === 'scarce' ? 'gear-pace' : band === 'rare' ? 'rare-pace' : 'trophy-pace';
    for (const p of list.filter((q) => q.band === band)) {
      const h = 1 / p.perH;
      R.ok(h >= lo && h <= hi, rule + ': ' + at + ' ' + (p.pending ? 'pending ' : '') + band + ' ' + p.id + ' (' + p.from.join(', ') + ') every ' + h.toFixed(2) + ' h per hero, outside ' + lo + '-' + hi + ' h');
    }
  }
  R.ok(E.gear <= FAUCET * E.coin, 'gear-faucet: ' + at + ' equipment sells for ' + Math.round(E.gear) + ' g/h, over ' + FAUCET + ' of the coin (' + Math.round(E.coin) + ' g/h)');
  const total = E.coin + E.commons + E.gear + E.other;
  R.ok(today > 0 && total <= (1 + TOTAL_RISE_MAX) * today, 'total-value: ' + at + ' pays ' + Math.round(total) + ' g per hero-hour, over +' + Math.round(TOTAL_RISE_MAX * 100) + '% on today\'s ' + today);
  /* THE SELL FACTOR the caps allow, measured: the largest share of book this ground's equipment could sell at. */
  const fmax = E.gearBook > 0 ? Math.min(FAUCET * E.coin, (1 + TOTAL_RISE_MAX) * today - E.coin - E.commons - E.other) / E.gearBook : Infinity;
  return { E, total, today, fmax, label: label || '', scarce: range('scarce'), rare: range('rare'), trophy: range('trophy'), pieces: list,
    pending: list.filter((q) => q.pending).map((q) => q.id + ' ' + (1 / q.perH).toFixed(1) + ' h') };
}

/* THE FRESH HERO: all four slots of each weight within GEAR_HOURS (realized on the real settle). */
function freshWeights(M, R, gid, x) {
  const got = x.heroItems[x.heroes[0]] || {}, have = {};
  for (const [id, q] of Object.entries(got)) { const it = M.ITEMS[id], w = weightOf(M, it); if (w && q > 0) (have[w] = have[w] || new Set()).add(it.slot); }
  for (const w of WEIGHTS) {
    const miss = BUILD_SLOTS.filter((s) => !(have[w] && have[w].has(s)));
    R.ok(!miss.length, 'gear-pace: a fresh hero at the ' + gid + ' floor has no ' + w + ' ' + miss.map((s) => SLOT_WORD[s]).join(', ') + ' after ' + GEAR_HOURS + ' h');
  }
  return WEIGHTS.map((w) => w + ' ' + BUILD_SLOTS.filter((s) => have[w] && have[w].has(s)).length + '/4').join(', ');
}
/* What a ground reveals: `only` the items only Rare / Trophy rows drop, `never` the items only standard rows drop. */
function revealSets(M, monsters, gid) {
  const reveal = new Set(), plain = new Set(), scarce = new Set();
  for (const id of rosterOf(M.G.HUNT_GROUNDS[gid])) for (const d of monsters[id].drops || []) {
    (M.LB.REVEAL_BANDS.includes(d.band) ? reveal : plain).add(d.id);
    if (d.band === 'scarce') scarce.add(d.id);
  }
  return { reveal, scarce, only: [...reveal].filter((id) => !plain.has(id)), never: [...plain].filter((id) => !reveal.has(id)) };
}
/* REVEAL-PATH, A PARTY (Tyler 2026-10-14: the party's rare roll): every Rare unit a party of four is credited in a
   GEAR_HOURS hunt at the floor went through the rare roll and rides its winner's rare-drop hint; no standard drop does. */
function partyReveal(M, P, monsters, R, gid, L, roles, full) {
  const S = revealSets(M, monsters, gid), at = gid + ' (party of ' + roles.length + ')';
  const x = P.run(gid, L, roles, { spanMs: GEAR_HOURS * H, fullSet: full, monsters });
  const got = {}, hints = [];
  for (const k of x.heroes) { for (const [id, q] of Object.entries(x.heroItems[k] || {})) got[id] = (got[id] || 0) + q; hints.push(...(x.heroRares[k] || [])); }
  const count = (list, id) => list.filter((h) => h === id).length;
  R.ok(S.only.some((id) => got[id] > 0), 'reveal-path: ' + at + ' credited no Rare item in a ' + GEAR_HOURS + ' h hunt');
  for (const id of S.only) {
    R.ok((got[id] || 0) === count(hints, id), 'reveal-path: ' + at + ' credited ' + (got[id] || 0) + ' ' + id + ' with ' + count(hints, id) + ' rare-drop hint(s)');
    R.ok((got[id] || 0) === count(x.rareRolls, id), 'reveal-path: ' + at + ' credited ' + (got[id] || 0) + ' ' + id + ' through ' + count(x.rareRolls, id) + ' rare roll(s)');
  }
  for (const id of S.never) R.ok(count(hints, id) === 0 && count(x.rareRolls, id) === 0, 'reveal-path: ' + at + ' revealed or rolled ' + id + ', a standard drop');
  return S.only.filter((id) => got[id] > 0).map((id) => id + ' x' + got[id]).join(', ') + ' (' + x.rareRolls.length + ' rare rolls)';
}
/* REVEAL-PATH: a fresh hunt on the real settle (seeds searched in a fixed order until a Rare item is credited). */
function revealPath(M, P, monsters, R, gid, first) {
  const floor = M.HUNTS[M.G.HUNT_GROUNDS[gid].hunt].band[0];
  const { reveal, scarce, only, never } = revealSets(M, monsters, gid);
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

/* `only` (a mutant's ground list) plays just those grounds' floor hours; `fresh` adds their fresh-hero and party
   hunts (the realized gear-pace and the reveal-path). */
async function plays(M, P, monsters, R, print, only, fresh = !only) {
  const rows = [];
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
    row.bands = bandRules(M, P, monsters, R, gid, x, n, TOTAL_TODAY[gid], '');
    /* A PARTY GROUND's second group (the Sewer's party at the floor, the Warrens' lone hero at soloFrom) holds the bands too. */
    const alt = BAND_ALT[gid];
    if (alt) {
      const lv = alt.at === 'soloFrom' ? M.G.HUNT_GROUNDS[gid].soloFrom : floor;
      const xa = P.run(gid, lv, alt.roles, { spanMs: H, fullSet: alt.full, monsters });
      row.alt = bandRules(M, P, monsters, R, gid, xa, alt.roles.length, alt.today, alt.roles.length > 1 ? 'party of ' + alt.roles.length : 'alone at ' + lv);
      row.altLevel = lv;
    }
  }
  const freshB = {}, partyB = {};
  if (fresh) {
    for (const [gid, pr] of Object.entries(PARTY_REVEAL)) {
      if (only && !only.includes(gid)) continue;
      partyB[gid] = partyReveal(M, P, monsters, R, gid, M.HUNTS[M.G.HUNT_GROUNDS[gid].hunt].band[0], pr.roles, pr.full);
    }
    /* THE FRESH HERO: a solo Melee in the ladder kit at the floor, GEAR_HOURS long; the hero levels as it plays. */
    for (const gid of GEAR_RUNS) {
      if (only && !only.includes(gid)) continue;
      const x = P.run(gid, M.HUNTS[M.G.HUNT_GROUNDS[gid].hunt].band[0], ['tank'], { spanMs: GEAR_HOURS * H, monsters });
      freshB[gid] = { held: freshWeights(M, R, gid, x), reveal: revealPath(M, P, monsters, R, gid, x) };
    }
  }
  if (!print) return;
  const span = (a) => (a.length ? Math.min(...a).toFixed(2) + '-' + Math.max(...a).toFixed(2) + ' h' : '-');
  console.log('  per hero per hour at the band floor, first hour | coin | commons | store | margin');
  for (const r of rows) {
    console.log('  ' + r.gid.padEnd(20) + ' L' + String(r.floor).padEnd(3) + (r.n > 1 ? 'party of ' + r.n : 'solo').padEnd(11) + String(Math.round(r.coin)).padStart(5)
      + String(Math.round(r.commons)).padStart(6) + String(Math.round(r.store)).padStart(6) + (Number.isFinite(r.m) ? pct(r.m) : 'no bill').padStart(9));
  }
  for (const B of rows.flatMap((q) => [Object.assign(q.bands, { gid: q.gid, floor: q.floor }), q.alt && Object.assign(q.alt, { gid: q.gid, floor: q.altLevel })]).filter(Boolean)) {
    const E = B.E, someRare = B.rare.length ? 1 / B.rare.reduce((s, hh) => s + 1 / hh, 0) : Infinity;
    const weight = (w) => w + ' ' + span(B.pieces.filter((pc) => pc.band === 'scarce' && weightOf(M, M.ITEMS[pc.id]) === w).map((pc) => 1 / pc.perH));
    console.log('  LOOT BANDS ' + B.gid + ' L' + B.floor + (B.label ? ' ' + B.label : ' (reference)') + ', expected per hero-hour: Scarce piece every ' + span(B.scarce) + ' (' + B.scarce.length + ' pieces: ' + WEIGHTS.map(weight).join(', ') + ')'
      + ' | Rare item every ' + span(B.rare) + ' (' + B.rare.length + ' items; some Rare every ' + someRare.toFixed(1) + ' h)' + (B.pending.length ? ' + pending ' + B.pending.join(', ') : '') + (B.trophy.length ? ' | Trophy every ' + span(B.trophy) : '')
      + ' | coin ' + Math.round(E.coin) + ' commons ' + Math.round(E.commons) + ' gear ' + Math.round(E.gear) + ' (' + Math.round(100 * E.gear / E.coin) + '% of coin) other ' + Math.round(E.other)
      + ' | total ' + Math.round(B.total) + ' vs today ' + B.today + ' (' + pct((B.total / B.today - 1) * 100) + ')'
      + ' | gear sells at ' + JSON.stringify(M.LB.VENDOR_GEAR_RATES) + ' of book by tier; this ground\'s caps hold up to ' + B.fmax.toFixed(2));
  }
  for (const [gid, b] of Object.entries(freshB)) console.log('  fresh solo hero, ' + gid + ', ' + GEAR_HOURS + ' h: slots held ' + b.held + ' | reveals on the settle: ' + b.reveal);
  for (const [gid, b] of Object.entries(partyB)) console.log('  party of four, ' + gid + ', ' + GEAR_HOURS + ' h at the floor: Rare units ' + b);
}

/* THE CASTER FLOOR (designer pass 2026-10-21). Income is split evenly and each hero pays its own store bill
   (ruling 10-16), so each role's margin is its share of coin + commons over its own bill. */
function casterFloor(M, P, R, print) {
  const gid = 'millrace_sewer', floor = M.HUNTS[M.G.HUNT_GROUNDS[gid].hunt].band[0];
  /* the Mage's SPELLS, counted from the casts (its mana basic trains Magic too since lane b-spell-core) */
  const spells = {};
  const onWindow = (out) => {
    const keyOf = {};
    for (const p of out.members) keyOf[p.hunt.unit_id] = p.key;
    for (const e of out.events) if (e.type === 'cast' && keyOf[e.u]) spells[keyOf[e.u]] = (spells[keyOf[e.u]] || 0) + 1;
  };
  const x = P.run(gid, floor, PARTY, { spanMs: H, onWindow });
  const T = x.totals, h = x.playedMs / H || 1, share = (T.coin + T.commons) / h / PARTY.length;
  R.ok(x.playedMs >= H && T.falls === 0, 'caster-floor: the ' + gid + ' party of four (ladder kit) ended after ' + (x.playedMs / 60000).toFixed(1)
    + ' min with ' + T.falls + ' death(s) (' + T.ended.join(', ') + ')');
  const mage = x.heroes.find((k) => k.startsWith('mage'));
  R.ok((spells[mage] || 0) > 0, 'caster-floor: the Mage (wand + book) cast no spell in ' + (x.playedMs / 60000).toFixed(1) + ' min');
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

/* THE RANGER FLOOR (designer 2026-10-23, the spell-release balance, PROVISIONAL: a store shot is 1 g at tiers 1-3,
   supply-basics.js BASIC_AMMO_PREMIUM). A crossbow takes a shield (Tyler 2026-10-23: a Ranger with guard, never a tank)
   and has no free bolt rung, so a store-fed one buys every shot. The Ranger wears the crossbow and shield of its Level
   (the Practice Crossbow and the Shop's Bronze-Rimmed under 15, Oak and the smiths' Ironbound under 30, then Willow and
   the Coppercap: the fixture kit's shield steps) beside the measured party, its bag empty, its ammo slot on Iron Bolts.
   MEASURED (1 h, the fixture seed): at 2 g a shot the floors read -30% (Sewer 8) and -30% (Warrens 32), in range +13%
   (Sewer 20) and +4% (Warrens 50), the shots 96-180% of the coin share; at 1 g +32% / +39% at the floors and +125% /
   +107% in range, the shots 48% / 59% of coin in range. */
const RANGER_AT = Object.freeze({ millrace_sewer: 20, coppercap_warrens: 50 });   // in range: printed, not floored
const crossbowSet = (L, kit) => ({ ...kit, ammo: 'iron_bolts',
  weapon: L < 15 ? 'practice_crossbow' : L < 30 ? 'oak_crossbow' : 'willow_crossbow',
  shield: L < 15 ? 'bronze_rimmed_shield' : L < 30 ? 'ironbound_shield' : 'coppercap_shield' });
function rangerFloor(M, P, R, print) {
  const out = [];
  for (const [gid, inRange] of Object.entries(RANGER_AT)) {
    const floor = M.HUNTS[M.G.HUNT_GROUNDS[gid].hunt].band[0];
    for (const L of [floor, inRange]) {
      const x = P.run(gid, L, PARTY, { spanMs: H, bag: () => ({}),
        equipment: (role, i, LL) => (role === 'ranger' ? crossbowSet(LL, P.kitFor(LL, role, false)) : P.kitFor(LL, role, false)) });
      const T = x.totals, h = x.playedMs / H || 1, coin = T.coin / h / PARTY.length, share = (T.coin + T.commons) / h / PARTY.length;
      const rk = x.heroes.find((k) => k.startsWith('ranger')), buys = Object.entries(T.buys[rk] || {});
      const gold = (rows) => rows.reduce((s, [id, q]) => s + q * ((P.basics[id] || {}).price || 0), 0) / h;
      const bolts = buys.filter(([id]) => id === 'plain_iron_bolts'), bill = gold(buys), shots = gold(bolts), m = bill > 0 ? (share / bill - 1) * 100 : Infinity;
      if (L === floor) {
        R.ok(x.playedMs >= H && T.falls === 0, 'ranger-floor: the ' + gid + ' party with a crossbow + shield Ranger at ' + L + ' ended after ' + (x.playedMs / 60000).toFixed(1) + ' min, ' + T.falls + ' death(s) (' + T.ended.join(', ') + ')');
        R.ok(bolts.length > 0, 'ranger-floor: the crossbow Ranger at the ' + gid + ' floor bought no store Iron Bolts (' + JSON.stringify(T.buys[rk] || {}) + ')');
        R.ok(m >= MARGIN_MIN, 'ranger-floor: the crossbow + shield Ranger at the ' + gid + ' floor (' + L + ') earns ' + pct(m) + ' (share ' + Math.round(share) + ' g/h vs its bill ' + Math.round(bill) + ' g/h), under +' + MARGIN_MIN + '%');
      }
      out.push(gid + ' L' + L + (L === floor ? ' (floor)' : '') + ': shots ' + Math.round(shots) + ' g/h = ' + Math.round(100 * shots / coin) + '% of coin ' + Math.round(coin) + ', bill ' + Math.round(bill) + ', ' + pct(m));
    }
  }
  if (print) console.log('  crossbow + shield Ranger on store Iron Bolts, party of 4, per hero per hour: ' + out.join(' ; '));
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
const rowOf = (ms, id, item) => ms[id].drops.find((d) => d.id === item);
const scarceOf = (ms, id) => ms[id].drops.filter((d) => d.band === 'scarce');
const dataMutants = [
  /* the four slots */
  { name: 'the imbuement row dropped', case: 'four-slots', edit: (ms) => { ms.drain_rat.drops = ms.drain_rat.drops.filter((d) => d.id !== 'rat_incisor'); } },
  { name: 'one imbuement item on two monsters', case: 'four-slots', edit: (ms) => { ms.sump_slime.drops.find((d) => d.id === 'sump_membrane').id = 'rat_incisor'; } },
  { name: 'an imbuement row at rare odds', case: 'four-slots', edit: (ms) => { ms.gray_wolf.drops.find((d) => d.id === 'gray_dewclaw').ch = 0.02; } },
  { name: 'a third Common (the old free-form list)', case: 'loot-structure', edit: (ms) => { ms.gray_wolf.drops.splice(1, 0, { id: 'wolf_pelt', ch: 0.3, band: 'common' }); } },
  { name: 'the Slime\'s Sticky Core back at 2% (an hourly "Rare")', case: 'four-slots', edit: (ms) => { Object.assign(rowOf(ms, 'slime', 'sticky_core'), { ch: 0.02, band: 'rare' }); } },
  { name: 'the junk row lost', case: 'four-slots', edit: (ms) => { ms.cistern_spider.drops = ms.cistern_spider.drops.filter((d) => d.id !== 'silk_thread'); } },
  { name: 'an imbuement item on a monster of the wrong tier', case: 'four-slots', edit: (ms) => { ms.rat_king.level = 30; } },
  /* the loot bands */
  { name: 'a band row loses its band', case: 'loot-structure', edit: (ms) => { delete rowOf(ms, 'gray_wolf', 'bones').band; } },
  { name: 'a misspelt band', case: 'loot-structure', edit: (ms) => { rowOf(ms, 'gray_whelp', 'bronze_boots').band = 'scarse'; } },
  { name: 'an old-model flag on a banded row', case: 'loot-structure', edit: (ms) => { rowOf(ms, 'briarcoat_wolf', 'leather_pants').gear = true; } },
  { name: 'a Warrens row with no band', case: 'loot-structure', edit: (ms) => { delete rowOf(ms, 'goblin_digger', 'coal').band; } },
  { name: 'rows out of band order', case: 'loot-structure', edit: (ms) => { const d = ms.gray_whelp.drops; d.push(d.splice(2, 1)[0]); } },
  { name: 'a Scarce row at common odds', case: 'loot-structure', edit: (ms) => { rowOf(ms, 'briarcoat_wolf', 'leather_pants').ch = 0.2; } },
  { name: 'a Common under 15%', case: 'loot-structure', edit: (ms) => { rowOf(ms, 'gray_wolf', 'bones').ch = 0.1; } },
  { name: 'a second Uncommon', case: 'loot-structure', edit: (ms) => { ms.gray_wolf.drops.splice(3, 0, { id: 'wolf_pelt', ch: 0.1, band: 'uncommon' }); } },
  { name: 'a weight missing from a Scarce slot', case: 'loot-structure', edit: (ms) => { ms.gray_whelp.drops = ms.gray_whelp.drops.filter((d) => d.id !== 'apprentice_boots'); } },
  { name: 'two slots on one monster, each short a weight', case: 'loot-structure', edit: (ms) => { rowOf(ms, 'gray_whelp', 'apprentice_boots').id = 'apprentice_helmet'; } },
  { name: 'a swarm\'s second slot short a weight', case: 'loot-structure', edit: (ms) => { rowOf(ms, 'goblin_scavenger', 'scholar_pants').id = 'boarhide_pants'; } },
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
  /* slot homes */
  { name: 'a slot with two homes and no group', case: 'slot-homes', edit: (ms) => { ms.carrion_crow.drops.push(...['iron_helm', 'studded_helmet', 'adept_helmet'].map((id) => ({ id, ch: 0.01, band: 'scarce' }))); } },
  { name: 'a monster with three armour slots', case: 'slot-homes', edit: (ms) => {
    const moved = ms.goblin_digger.drops.filter((d) => d.band === 'scarce' && d.id !== 'steel_warhammer');
    ms.goblin_digger.drops = ms.goblin_digger.drops.filter((d) => !moved.includes(d));
    ms.goblin_scavenger.drops.splice(ms.goblin_scavenger.drops.findIndex((d) => d.band === 'scarce'), 0, ...moved);
  } },
  { name: 'two Scarce weapons on one monster', case: 'slot-homes', edit: (ms) => {
    const hammer = rowOf(ms, 'goblin_digger', 'steel_warhammer');
    ms.goblin_digger.drops = ms.goblin_digger.drops.filter((d) => d !== hammer);
    ms.goblin_scavenger.drops.splice(ms.goblin_scavenger.drops.findIndex((d) => d.band === 'scarce'), 0, hammer);
  } },
  { name: 'the Chief\'s crew loses its foremen (the group no longer the home)', case: 'slot-homes', edit: (ms) => { ms.hobgoblin_foreman.drops = ms.hobgoblin_foreman.drops.filter((d) => d.band !== 'scarce'); } },
  /* pending rows and the sale ladder */
  { name: 'a row still parked for an item that exists (the Kingsgrate)', case: 'pending-rows', edit: (ms, M2) => {
    M2.LB = { ...M2.LB, PENDING_ROWS: [{ monster: 'rat_king', id: 'kingsgrate', ch: 0.017, band: 'rare', after: 'crown_shard' }] }; } },
  { name: 'Leather Boots back at 90 (outselling Studded Boots)', case: 'sale-ladder', edit: (ms, M2) => { M2.ITEMS.leather_boots = { ...M2.ITEMS.leather_boots, v: 90 }; } },
  { name: 'Steel Boots cheaper than Iron Boots', case: 'sale-ladder', edit: (ms, M2) => { M2.ITEMS.steel_boots = { ...M2.ITEMS.steel_boots, v: 300 }; } },
  /* build coverage */
  { name: 'the Dire Grays drop helmets, not bodies', case: 'build-coverage', edit: (ms) => {
    rowOf(ms, 'dire_gray', 'bronze_platebody').id = 'bronze_helm'; rowOf(ms, 'dire_gray', 'leather_body').id = 'leather_helmet'; rowOf(ms, 'dire_gray', 'apprentice_body').id = 'apprentice_helmet';
  } },
  { name: 'the Sewer\'s kobolds drop helmets, not boots', case: 'build-coverage', edit: (ms) => {
    rowOf(ms, 'kobold_tosher', 'adept_boots').id = 'adept_helmet'; rowOf(ms, 'kobold_tosher', 'studded_boots').id = 'studded_helmet'; rowOf(ms, 'kobold_tosher', 'iron_boots').id = 'iron_helm';
  } },
];
/* Played on the monsters' copy: the expected loot on the floor hours' kills (and, with `fresh`, the fresh and party hunts). */
const playMutants = [
  /* The Sewer's coin cut to under half (armour weights, ruling K7, left the ladder-kit Melee +119% at the floor,
     so the old /1.8 coin clears +25% by a hair; lane b-spell-roles' Bronze-Rimmed Shield took the floor tank to +159%,
     so /2.2 clears it too, about +32%: the floor still bites at /2.6, about +16%). */
  { name: 'the Sewer coin cut to under half', rule: 'profit-floor: millrace_sewer', edit: (ms) => {
    for (const id of ['drain_rat', 'sump_slime', 'culvert_bat', 'cistern_spider', 'kobold_tosher', 'rat_king']) ms[id].gp = ms[id].gp.map((v) => Math.max(1, Math.round(v / 2.6)));
  } },
  { name: 'the Kingsgrate at 5% (a Rare every 4 h)', rule: 'rare-pace: millrace_sewer (party of 4) rare kingsgrate', edit: (ms) => { rowOf(ms, 'rat_king', 'kingsgrate').ch = 0.05; } },
  { name: 'the Thicket\'s heavy boots five times rarer', rule: 'gear-pace: meadowbrook_thicket', edit: (ms) => { rowOf(ms, 'gray_whelp', 'bronze_boots').ch /= 5; } },
  { name: 'the Thicket\'s bodies twice as common', rule: 'gear-pace: meadowbrook_thicket', edit: (ms) => { for (const d of scarceOf(ms, 'dire_gray')) d.ch *= 2; } },
  { name: 'the Sewer\'s party bodies too slow (a party of four)', rule: 'gear-pace: millrace_sewer (party of 4)', edit: (ms) => { for (const d of scarceOf(ms, 'sump_slime')) d.ch = 0.03; } },
  { name: 'the Glade\'s bodies too slow', rule: 'gear-pace: mosslight_glade', edit: (ms) => { for (const d of scarceOf(ms, 'goblin_sluicer')) d.ch = 0.02; } },
  { name: 'the Warrens bodies on the Chief alone (a party too slow)', rule: 'gear-pace: coppercap_warrens', edit: (ms) => {
    for (const id of ['goblin_skulker', 'hobgoblin_foreman']) ms[id].drops = ms[id].drops.filter((d) => d.band !== 'scarce');
  } },
  { name: 'the Warrens boots too slow for a lone hero', rule: 'gear-pace: coppercap_warrens (alone at 45)', edit: (ms) => { for (const d of scarceOf(ms, 'goblin_scavenger')) d.ch = 0.01; } },
  { name: 'the den mother\'s fang back to 1%', rule: 'rare-pace: meadowbrook_thicket', edit: (ms) => { rowOf(ms, 'grayjaw', 'alpha_fang').ch = 0.01; } },
  { name: 'the Studded Leather Body ten times rarer', rule: 'rare-pace: meadowbrook_thicket', edit: (ms) => { rowOf(ms, 'dire_gray', 'studded_body').ch /= 10; } },
  { name: 'the Sewer\'s bows too common for a solo hero', rule: 'rare-pace: millrace_sewer rare longbow', edit: (ms) => { for (const d of ms.cistern_spider.drops) if (d.band === 'rare') d.ch = 0.02; } },
  { name: 'Rook\'s Whistle at 1%', rule: 'rare-pace: mosslight_glade rare rooks_whistle', edit: (ms) => { rowOf(ms, 'rook_poacher', 'rooks_whistle').ch = 0.01; } },
  { name: 'the War Crown at 4%', rule: 'rare-pace: coppercap_warrens rare war_crown', edit: (ms) => { rowOf(ms, 'chief_coppercap', 'war_crown').ch = 0.04; } },
  { name: 'a boss Trophy every 44 h', rule: 'trophy-pace: meadowbrook_thicket', edit: (ms) => { ms.grayjaw.boss = true; ms.grayjaw.drops.push({ id: 'war_crown', ch: 0.001, band: 'trophy' }); } },
  { name: 'the Rat King\'s Crown at 0.2% (a full Bestiary under 100 h)', rule: 'trophy-pace: millrace_sewer (party of 4)', edit: (ms) => { rowOf(ms, 'rat_king', 'rat_kings_crown').ch = 0.002; } },
  { name: 'the den mother\'s fang a War Crown at 2% (value, not gear)', rule: 'total-value: meadowbrook_thicket', edit: (ms) => { Object.assign(rowOf(ms, 'grayjaw', 'alpha_fang'), { id: 'war_crown', ch: 0.02 }); } },
  { name: 'a fresh hero\'s heavy boots gone', rule: 'gear-pace: a fresh hero at the meadowbrook_thicket', fresh: true, edit: (ms) => { ms.gray_whelp.drops = ms.gray_whelp.drops.filter((d) => d.id !== 'bronze_boots'); } },
];
/* Planted trees (src/data, src/core, the settle), played on the ground the rule names. */
const plantMutants = [
  { name: 'worn gear sells at full book again', rule: 'gear-faucet: meadowbrook_thicket', edits: [['src/data/loot-bands.js', 'export const VENDOR_GEAR_RATES = Object.freeze([0.5, 0.5, 0.14]);', 'export const VENDOR_GEAR_RATES = Object.freeze([1, 1, 1]);']] },
  { name: 'tier-3 gear sells at the tier-1 rate', rule: 'gear-faucet: coppercap_warrens', edits: [['src/data/loot-bands.js', 'export const VENDOR_GEAR_RATES = Object.freeze([0.5, 0.5, 0.14]);', 'export const VENDOR_GEAR_RATES = Object.freeze([0.5, 0.5, 0.5]);']] },
  { name: 'the roller reveals nothing (a Rare credited with no hint)', rule: 'reveal-path: meadowbrook_thicket', fresh: true,
    edits: [['src/core/drops.js', 'rare: REVEAL_BANDS.includes(band) });', 'rare: false });']] },
  { name: 'a party\'s Rare skips the rare roll (round-robin instead)', rule: 'reveal-path: millrace_sewer (party of 4)', fresh: true,
    edits: [['src/core/hunt-rewards.js', '    if (ev.rare && present.length > 1) {', '    if (false) {']] },
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
  /* Fireball is a Fire rune spell (Tyler 2026-10-23): a Mage with no runes casts it on the store's rune its default
     slot names. With no store rune on the default slots the floor Mage casts nothing. */
  { name: 'the default rune spells name no store rune (the Mage casts nothing)', edits: [
    ['src/data/rule-subjects.js', "  action: Object.freeze(Object.assign({ type: 'ability', id }, storeOf(id) ? { store: storeOf(id) } : {})),",
      "  action: Object.freeze({ type: 'ability', id }),"]] },
];
/* The Warrens floor's levers (src/data + the tier table in src/core/combat.js): each plays on a planted copy. */
const warrensMutants = [
  /* Store-by-slot (v0.2.30): the measured hero's bar names the guide's food (play-ground.mjs refBar), so the mutant
     puts the guide back on the tier-4 Swordfish, as a player stocking by the old guide would. */
  /* Since lane b-spell-roles (the floor tank behind a Coppercap Shield, guard 7; heals between pulls) the floor party's bills
     are about a tenth of its share (tank +1340%, Mage +954%, Healer +2025% on the first seed) and the lone Melee at 45
     buys nothing: ONE cost lever no longer reaches +25%. Measured (1 h, the two seeds): the tier-4 food alone, the flat
     5.4 blows alone and alone-from 40 all clear it; the two old cost levers together (tank -25% on the first seed), the
     tier-3 blows doubled (tank -68%) and the card's alone-from at the floor itself (-51%) do not. The +25% floor is
     unchanged; the margins are a balance finding for the designer (p30/p31). */
  { name: 'the Warrens store food back to tier 4, with tier-3 blows at the flat 5.4', edits: [['src/data/supplies.js', "  coppercap_warrens: Object.freeze({ tier: 3,\n    melee: melee('cooked_lobster', 80),",
    "  coppercap_warrens: Object.freeze({ tier: 4,\n    melee: melee('cooked_swordfish', 80),"],
    ['src/core/combat.js', 'monsterDamageScaleByTier: Object.freeze({ 3: 4.0, 4: 4.0,', 'monsterDamageScaleByTier: Object.freeze({ 4: 4.0,']] },
  { name: 'tier-3 blows doubled', edits: [['src/core/combat.js', 'monsterDamageScaleByTier: Object.freeze({ 3: 4.0, 4: 4.0,', 'monsterDamageScaleByTier: Object.freeze({ 3: 8.0, 4: 4.0,']] },
  { name: 'the card offers the Warrens alone from its floor (32)', edits: [['src/data/hunt-grounds.js', '    soloFrom: 45,', '    soloFrom: 32,']] },
];
/* The Ranger floor's lever: the store shot's price (src/data/supply-basics.js), played on a planted copy. */
const rangerMutants = [
  { name: 'the store Iron Bolt back at 2 g a shot', edits: [['src/data/supply-basics.js', "shot('plain_iron_bolts', 'Plain Iron Bolts', 'iron_bolts', 1),", "shot('plain_iron_bolts', 'Plain Iron Bolts', 'iron_bolts', 2),"]] },
];
const engineMutants = [
  { name: 'the row\'s band ignored (the odds decide the reveal again)', case: 'band-is-the-reveal',
    edits: [['src/core/drops.js', '  if (row && LOOT_BANDS.includes(row.band)) return row.band;\n', '']] },
  { name: 'a Trophy is no reveal', case: 'band-is-the-reveal',
    edits: [['src/data/loot-bands.js', "export const REVEAL_BANDS = Object.freeze(['rare', 'trophy']);", "export const REVEAL_BANDS = Object.freeze(['rare']);"]] },
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
rangerFloor(M, P, R, true);

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
for (const mu of rangerMutants) {
  const p = plant(mu.edits, PLAY_TREES);
  try {
    const MR = { fails: [], ok(c, msg) { if (!c) this.fails.push(msg); } };
    rangerFloor(M, await loadPlay(p.root), MR, false);
    R.ok(MR.fails.some((f) => f.startsWith('ranger-floor: the crossbow + shield Ranger')), 'mutant "' + mu.name + '" was NOT caught by ranger-floor (fails: ' + (MR.fails.join(' | ') || 'none') + ')');
    if (MR.fails.length) console.log('  ranger mutant "' + mu.name + '" caught: ' + MR.fails[0].slice(0, 160));
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases + the plays, ' + (dataMutants.length + engineMutants.length + playMutants.length + plantMutants.length + casterMutants.length + warrensMutants.length + rangerMutants.length) + ' mutants caught');
R.finish();
