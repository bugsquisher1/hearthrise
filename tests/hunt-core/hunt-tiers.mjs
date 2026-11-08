// tests/hunt-core/hunt-tiers.mjs — THREE WAYS TO HUNT A GROUND (Tyler 2026-11-05, lane/c-difficulty-tiers). Run by run-all.mjs. Plays the REAL engine through tools/balance-sim's cell runner
// (the settle the world tick runs, play-ground.mjs), deterministic on a commit. The rows are src/data/hunt-tiers.js; the blow, armor's read and the kill's XP are hunt-core/damage.mjs a-tier-is-the-monsters-stats; the server's half is tests/hunt-tiers-db.mjs.
//
//   rows                  Normal is the ground as it stands; each harder tier hits harder and pays more, its pull never falls; the Cellar is Normal only and every other open ground offers all three; the full box stays reachable; every pull fits its ground; no name is the post-launch game mode.
//   catalogue             the server's rows (hr_ground_tiers) are the data's, digit for digit.
//   normal-is-the-ground  no tier, Normal, a word nobody offers and a tier the ground doesn't offer all play the same hunt, digit for digit.
//   harder-tier-costs     Deadly against the same pull with no tier, one hero: a bigger bill, the row's XP a kill, the same gold a kill.
//   never-gold            an XP-only dial on the same dice: the same kills, the same coin and the same drops to the unit; only Level XP moves.
//   dials                 ONE FORMULA (Tyler 2026-11-07: "a scaling % of exp and difficulty BUT NOT GOLD"): the Glade's Deadly with a health dial (a what-if):
//                         every monster of the first world has the dial's health under the party scale and the party scale's yield; over an hour each
//                         kill takes the dial's damage, pays the tier's XP and the row's coin and loot, never more coin.
//   ladder                the rule that keeps people moving: a ground's top tier doesn't beat the next ground's Normal on XP at the Level that fits it, single target, AoE or a party.
//
// --only a,b plays just those cases and their mutants. About three minutes on one core, mutants included.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';
import { makeReport, ROOT, plant } from './fixtures/h1.js';
import { packIds } from '../../tools/pack/files.mjs';
import { foldedPacks } from '../../tools/pack/whole.mjs';

const V = '?v=' + (/cache:\s*'([^']+)'/.exec(readFileSync(join(ROOT, 'src/build-info.js'), 'utf8')) || [, ''])[1];
const { loadCellRunner } = await import(pathToFileURL(join(ROOT, 'tools/balance-sim/cell.mjs')).href);
const { PLAY_TREES } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
const REAL = await import(pathToFileURL(join(ROOT, 'src/data/hunt-tiers.js')).href + V);
const G = await import(pathToFileURL(join(ROOT, 'src/data/hunt-grounds.js')).href + V);
const HUNTS = await import(pathToFileURL(join(ROOT, 'src/data/hunts.js')).href + V);
/* the newest file that writes hr_ground_tiers' rows: the generator's own (tools/gen-ground-tiers.mjs; 2027-02-27-hunt-tiers.sql made the table and the first rows) */
const { OUT_NAME: CATALOGUE } = await import(pathToFileURL(join(ROOT, 'tools/gen-ground-tiers.mjs')).href);
const { loadPlay } = await import(pathToFileURL(join(ROOT, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
const WINDOW = 120000;
const GLADE = 'mosslight_glade', WARRENS = 'coppercap_warrens';
const HARDER = ['dangerous', 'deadly'];

/* A cell on a tier as written (T: the data the case reads, a planted copy under a mutant). */
const cellOn = (T) => (ground, party, level, tier, hours = 1) => {
  const pull = tier ? T.pullOfTier(T.tierRowOf(ground, tier), party.length) : 0;
  return { id: [ground, party, level, tier].join(':'), ground, party, level, hours, seeds: 1, windowMs: WINDOW, ...(tier ? { options: { tier } } : {}), ...(pull ? { density: pull } : {}) };
};
/* The numbers of a played cell, its row and its id left out. */
const digits = (r) => JSON.stringify({ party: r.party, heroes: r.heroes });
const pooled = (r, f) => r.heroes.reduce((s, h) => s + f(h) * h.hours, 0) / r.heroes.reduce((s, h) => s + h.hours, 0);

const cases = {
  rows: ({ T, S }) => {
    const N = T.tierRowOf('mill_cellar', 'deadly');
    if (N.id !== T.DEFAULT_TIER || N.dmgPm !== 1000 || N.hpPm !== 1000 || N.xpPm !== 1000 || N.pull.some((p) => p !== 0)) return 'Normal moved off the ground as it stands: ' + JSON.stringify(N);
    if (T.tiersOf('mill_cellar').join() !== T.DEFAULT_TIER) return 'the Cellar offers ' + T.tiersOf('mill_cellar');
    for (const id of Object.keys(G.OPEN_GROUNDS)) if (id !== 'mill_cellar' && T.tiersOf(id).join() !== T.TIER_IDS.join()) return id + ' offers ' + T.tiersOf(id) + ', not all three (Tyler: each hunting ground)';
    /* ONE TABLE (balance-sheet.js, lane/b-ground-formula): its tiers are the game's, Normal is the row, and every exception is a named pull or Normal
       only, on an open ground, with its reason; a typo would be the table's number, silently. */
    if (Object.keys(S.TIER_DIALS).join() !== T.TIER_IDS.join()) return 'the sheet\'s tiers are ' + Object.keys(S.TIER_DIALS) + ', the game\'s ' + T.TIER_IDS;
    if (T.DIALS.some((k) => S.TIER_DIALS.normal[k] !== 1000) || S.TIER_DIALS.normal.pull.some((p) => p !== 0)) return 'the sheet\'s Normal is not the ground as it stands: ' + JSON.stringify(S.TIER_DIALS.normal);
    for (const [g, over] of Object.entries(S.TIER_PULL_OVERRIDES)) {
      if (!G.HUNT_GROUNDS[g]) return 'an override for ' + g + ', which is no ground';
      if (!(typeof over.why === 'string' && over.why.length > 10)) return 'the override for ' + g + ' gives no reason';
      for (const [k, v] of Object.entries(over)) {
        if (k === 'why' || (k === 'normalOnly' && v === true)) continue;
        /* a ground's own dials (the Thicket's: XP on no HP dial), named like a pull: a harder tier's, and only the dials the engine reads */
        if (k === 'dials') {
          for (const [id, d] of Object.entries(v)) if (!HARDER.includes(id) || Object.keys(d).some((x) => !T.DIALS.includes(x))) return g + ' dials ' + id + ': ' + Object.keys(d) + ', no dial';
          continue;
        }
        if (!HARDER.includes(k) || !Array.isArray(v) || v.length !== G.PARTY_SCALE.maxHeroes) return g + ' overrides ' + k + ': only a harder tier\'s pull, or Normal only';
      }
    }
    /* NEVER TYPED: every ground's row is the sheet's tierRowFor at its floor (hunts.js band) and its fit, as the designer's own tool reads
       them (tools/gen-ground-stats.mjs floorOf, fitOf), per-ground dials included, digit for digit. */
    const fitOf = (gr) => (gr.pockets.some((p) => p.minParty) ? 'party' : gr.groupFit || 'both');
    for (const [g, rows] of Object.entries(T.GROUND_TIERS)) for (const t of HARDER) {
      const want = S.tierRowFor(HUNTS.HUNT_INDEX[G.HUNT_GROUNDS[g].hunt].band[0], t, { ground: g, fit: fitOf(G.HUNT_GROUNDS[g]) }), r = rows[t];
      if (!r || r.pull.join() !== want.pull.join() || T.DIALS.some((k) => r[k] !== want[k])) return g + ' ' + t + ' plays ' + JSON.stringify(r) + ', the sheet answers ' + JSON.stringify(want);
    }
    for (const [id, rows] of Object.entries(T.GROUND_TIERS)) {
      const g = G.HUNT_GROUNDS[id];
      if (!g) return id + ' offers tiers but is no ground';
      let was = N;
      for (const t of HARDER) {
        const r = rows[t];
        if (!r || r.id !== t) return id + ' has no row for ' + t;
        /* harder: damage and health never fall and one of them rises; better paid: more XP a kill */
        if (r.dmgPm < was.dmgPm || r.hpPm < was.hpPm || (r.dmgPm === was.dmgPm && r.hpPm === was.hpPm) || !(r.xpPm > was.xpPm)) return id + ': ' + t + ' is not harder and better paid than ' + was.id;
        if (r.pull.length !== G.PARTY_SCALE.maxHeroes || r.pull.some((p, s) => (p && p < was.pull[s]) || (s && p && p < r.pull[s - 1]))) return id + ': ' + t + "'s pull falls: " + r.pull;
        for (let s = 0; s < r.pull.length; s++) if (r.pull[s] > g.densityMax[s]) return id + " cannot spawn " + t + "'s " + r.pull[s] + ' for ' + (s + 1);
        /* SLIGHTLY MORE XP (Tyler 2026-11-05 tier words: "Dangerous and Deadly ... pay slightly more Level XP", +10% and +20% in his 11-05
           table; 11-07's "a scaling % of exp and difficulty" names the dial, not the amount): a kill never pays more than +25% for a tier, and
           power is what it's paid for. */
        if (r.xpPm > 1250) return id + ': ' + t + ' pays more than slightly more XP: ' + r.xpPm;
        was = r;
      }
    }
    /* THE FULL BOX STAYS REACHABLE (Tyler 10-18), on the grounds whose ladder has room for it, at every party size. */
    for (const id of [GLADE, WARRENS]) if (T.GROUND_TIERS[id].deadly.pull.some((p) => p !== G.FULL_BOX)) return id + ' has lost its full box: ' + T.GROUND_TIERS[id].deadly.pull;
    /* "Hardcore" is the post-launch game mode's word (game-modes-roadmap). */
    if (Object.values(T.TIER_NAME).some((n) => /hardcore/i.test(n))) return 'a tier is named for the game mode: ' + Object.values(T.TIER_NAME);
    return null;
  },
  catalogue: ({ T }) => {
    const sql = readFileSync(join(ROOT, 'supabase', 'migrations', CATALOGUE), 'utf8');
    const got = [...sql.matchAll(/\('([a-z_]+)', '([a-z]+)', '\{([0-9,]+)\}'::int\[\], (\d+), (\d+), (\d+)\)/g)].map((m) => [m[1], m[2], m[3], m[4], m[5], m[6]].join('|')).sort();
    const want = [];
    /* the file serves the OPEN grounds its whole view carries: a ground pack not folded into it ships its rows in its own file
       (tools/pack/whole.mjs, tests/ground-pack.mjs GP-3), so a new ground never re-issues this one (lane/b-ground-pack) */
    const unfolded = new Set(packIds().filter((id) => !foldedPacks(CATALOGUE).includes(id)));
    for (const [g, rows] of Object.entries(T.GROUND_TIERS)) {
      if (!G.OPEN_GROUNDS[g] || unfolded.has(g)) continue;
      for (const id of HARDER) { const t = rows[id]; want.push([g, id, t.pull.join(), t.dmgPm, t.hpPm, t.xpPm].join('|')); }
    }
    want.sort();
    return got.join(';') === want.join(';') ? null : 'the catalogue says ' + got.join(';') + ' and the data ' + want.join(';');
  },
  'normal-is-the-ground': ({ R, T }) => {
    const cell = cellOn(T);
    for (const word of ['normal', 'hardcore', 'constructor', '__proto__']) if (T.tierRowOf(GLADE, word).id !== T.DEFAULT_TIER) return 'the word ' + word + ' plays ' + T.tierRowOf(GLADE, word).id + ' on the Glade';
    const base = digits(R.runCell({ ...cell(GLADE, ['tank'], 24, null, 0.5) }));
    for (const tier of ['normal', 'hardcore']) {
      const got = digits(R.runCell({ ...cell(GLADE, ['tank'], 24, null, 0.5), options: { tier } }));
      if (got !== base) return tier + ' on the Glade plays differently from no tier at all';
    }
    /* a tier the ground doesn't offer plays Normal's stats */
    const plain = digits(R.runCell(cell('mill_cellar', ['tank'], 4, null, 0.5)));
    return digits(R.runCell({ ...cell('mill_cellar', ['tank'], 4, null, 0.5), options: { tier: 'deadly' } })) === plain ? null : 'Deadly moved the Cellar, which doesn\'t offer it';
  },
  'harder-tier-costs': ({ R, T }) => {
    /* The same hero, the same Level, the same pull: the tier's stats are the only change. */
    const cell = cellOn(T);
    const row = T.tierRowOf(GLADE, 'deadly');
    const flat = R.runCell({ ...cell(GLADE, ['tank'], 31, null), density: T.pullOfTier(row, 1) });
    const dead = R.runCell(cell(GLADE, ['tank'], 31, 'deadly'));
    const f = flat.heroes[0], d = dead.heroes[0];
    if (!(flat.party.killsPerH > 100 && dead.party.killsPerH > 100)) return 'the fixture killed ' + flat.party.killsPerH + ' and ' + dead.party.killsPerH + ' an hour';
    if (!(d.storePerH > f.storePerH * 1.3)) return 'a Deadly store bill of ' + d.storePerH + ' against ' + f.storePerH + ': it hits no harder';
    if (!(d.takenPerH > f.takenPerH * 1.3)) return 'a Deadly hero takes ' + d.takenPerH + ' an hour against ' + f.takenPerH;
    const perKill = (r, n) => n / r.party.killsPerH;
    const xp = perKill(dead, d.levelXpPerH) / perKill(flat, f.levelXpPerH), want = row.xpPm / 1000;
    if (!(xp > want - 0.05 && xp < want + 0.05)) return 'a Deadly kill pays ' + xp.toFixed(3) + ' times the Level XP, the row says ' + want;
    const coin = perKill(dead, d.coinPerH) / perKill(flat, f.coinPerH);
    if (!(coin > 0.9 && coin < 1.1)) return 'a Deadly kill pays ' + coin.toFixed(3) + ' times the coin (Tyler: the same gold)';
    /* (the drops: never-gold, exact. An hour's loot ratio is a dice roll once HP is a dial: one seed read 0.755x, 2 seeds x 2 h 0.813x,
       4 seeds x 2 h 0.974x, all on the same rows.) */
    return null;
  },
  'never-gold': ({ P, T }) => {
    /* NEVER GOLD, EXACTLY (Tyler 2026-11-07: "BUT NOT GOLD"): the Glade's Deadly pull with only its XP dial (damage and HP at the row's), a
       what-if put back after, against the same pull with no tier, on the same dice. The fight is Normal's blow for blow, so every coin and
       every drop must be Normal's to the unit, and only the Level XP moves. 10 minutes: no Level is gained, so no hero's stats move. */
    const rows = T.GROUND_TIERS[GLADE], was = rows.deadly, pull = T.pullOfTier(was, 1);
    const play = (tier) => P.run(GLADE, 31, ['tank'], { spanMs: 600000, windowMs: 120000, density: pull, options: () => (tier ? { tier } : {}) });
    rows.deadly = { ...was, pull: [...was.pull], dmgPm: 1000, hpPm: 1000 };
    try {
      const flat = play(null), dial = play('deadly');
      if (!(flat.totals.kills > 20)) return 'the fixture killed ' + flat.totals.kills + ' in 10 minutes';
      if (dial.totals.kills !== flat.totals.kills) return 'an XP dial moved the fight: ' + dial.totals.kills + ' kills against ' + flat.totals.kills;
      if (dial.totals.coin !== flat.totals.coin) return 'an XP dial moved the coin: ' + dial.totals.coin + ' against ' + flat.totals.coin + ' (Tyler: never gold)';
      const items = (r) => JSON.stringify(Object.keys(r.items).sort().map((k) => [k, r.items[k]]));
      if (items(dial) !== items(flat)) return 'an XP dial moved the drops: ' + items(dial) + ' against ' + items(flat);
      const want = Math.round((flat.totals.levelXp * rows.deadly.xpPm) / 1000);
      if (Math.abs(dial.totals.levelXp - want) > flat.totals.kills) return 'the XP dial paid ' + dial.totals.levelXp + ' Level XP, its row says about ' + want;
      return null;
    } finally { rows.deadly = was; }
  },
  dials: ({ R, T, P, WS }) => {
    /* The Glade's Deadly pull with the health dial alone (damage and XP at the row's), a what-if on the engine's own rows, restored after:
       the new dial isolated. Damage and XP are harder-tier-costs' and damage.mjs a-tier-is-the-monsters-stats'. */
    const HP = 1500;
    const rows = T.GROUND_TIERS[GLADE], was = rows.deadly;
    rows.deadly = { ...was, pull: [...was.pull], dmgPm: 1000, hpPm: HP, xpPm: 1000 };
    try {
      const pull = T.pullOfTier(rows.deadly, 1);
      /* (1) THE FIRST WORLD: every monster, at the dial's health under the party scale (hunt-grounds.js scaledHp, never the reader under test),
         and at the party scale's yield, so more health pays no more. */
      let first = null;
      P.run(GLADE, 31, ['tank'], { spanMs: 10000, windowMs: 10000, density: pull, options: () => ({ tier: 'deadly' }), onWindow: (out) => { if (!first) first = out.world; } });
      const w = first ? WS.decode(JSON.parse(first)) : null;
      const mons = w ? w.units.filter((u) => u.side === 'mon') : [];
      if (mons.length < pull) return 'the first world holds ' + mons.length + ' monsters for a pull of ' + pull;
      for (const u of mons) {
        const row = P.MONSTERS[u.kind], want = G.scaledHp({ hp: Math.round((row.hp * HP) / 1000) }, 1);
        if (u.maxHp !== want || !(want > G.scaledHp(row, 1))) return 'a ' + u.kind + ' spawned at ' + u.maxHp + ' health; the dial says ' + want + ', Normal ' + G.scaledHp(row, 1);
        if (u.yieldPm !== G.yieldPermille(1)) return 'a ' + u.kind + ' spawned at a yield of ' + u.yieldPm + ', the party scale says ' + G.yieldPermille(1) + ': health paid in coin';
      }
      /* (2) AN HOUR, the same hero and pull with no tier against the dialled Deadly: a kill takes the dial's damage, earns the tier's XP and
         pays the row's coin and loot (Tyler 2026-11-07: never gold). */
      const cell = cellOn(T);
      const flat = R.runCell({ ...cell(GLADE, ['tank'], 31, null), density: pull });
      const dial = R.runCell(cell(GLADE, ['tank'], 31, 'deadly'));
      const f = flat.heroes[0], d = dial.heroes[0];
      if (!(flat.party.killsPerH > 100 && dial.party.killsPerH > 50)) return 'the fixture killed ' + flat.party.killsPerH + ' and ' + dial.party.killsPerH + ' an hour';
      const perKill = (r, n) => n / r.party.killsPerH;
      const took = perKill(dial, d.dealtPerH) / perKill(flat, f.dealtPerH);
      if (!(took > (HP / 1000) * 0.9 && took < (HP / 1000) * 1.1)) return 'a dialled kill takes ' + took.toFixed(3) + ' times the damage, the dial says ' + HP / 1000;
      const xp = perKill(dial, d.levelXpPerH) / perKill(flat, f.levelXpPerH), want = rows.deadly.xpPm / 1000;
      if (!(xp > want - 0.05 && xp < want + 0.05)) return 'a dialled kill earns ' + xp.toFixed(3) + ' times the Level XP, the row says ' + want;
      const coin = perKill(dial, d.coinPerH) / perKill(flat, f.coinPerH);
      if (!(coin > 0.9 && coin < 1.1)) return 'a dialled kill pays ' + coin.toFixed(3) + ' times the coin (Tyler 2026-11-07: never gold)';
      const loot = perKill(dial, d.incomePerH - d.coinPerH) / perKill(flat, f.incomePerH - f.coinPerH);
      if (!(loot > 0.85 && loot < 1.15)) return 'a dialled kill pays ' + loot.toFixed(3) + ' times the loot (the same drops)';
      return null;
    } finally { rows.deadly = was; }
  },
  ladder: ({ R, T }) => {
    /* At the Level the upper ground opens, the ways that bracket it: a lone single target, a lone area hero of each kind, a mixed four. The upper ground's own bill is its business: this is the rule that keeps people moving. tools/balance-sim plan tierladder has every way to fight, past the floor, and Tempered. */
    const cell = cellOn(T);
    const seen = new Map();
    const xp = (ground, party, level, tier) => {
      const k = [ground, party, level, tier].join(':');
      if (!seen.has(k)) seen.set(k, pooled(R.runCell(cell(ground, party, level, tier)), (h) => h.levelXpPerH));
      return seen.get(k);
    };
    for (const [lower, upper, level] of [['meadowbrook_thicket', 'wickstead', 8], ['meadowbrook_thicket', 'millrace_sewer', 8], ['wickstead', GLADE, 16], ['millrace_sewer', GLADE, 16], [GLADE, WARRENS, 32]]) {
      for (const party of [['tank'], ['hammer'], ['mage'], ['tank', 'healer', 'bow', 'mage']]) {
        const a = xp(lower, party, level, 'deadly'), b = xp(upper, party, level, null);
        if (!(a < b)) return lower + ' on Deadly reads ' + Math.round(a) + ' XP/h and ' + upper + ' on Normal ' + Math.round(b) + ' for ' + party.join('+') + ' at ' + level + ': nobody moves on';
      }
    }
    return null;
  },
};

const D = 'src/data/hunt-tiers.js';
const SH = 'src/data/balance-sheet.js';
const SHEET_DEADLY = 'deadly: Object.freeze({ pull: Object.freeze([8, 8, 8, 8]), lift: 1, dmgPm: 1330, hpPm: 1100, xpPm: 1250 }),';
const THICKET_DIALS = "dials: Object.freeze({ dangerous: Object.freeze({ hpPm: 1000, xpPm: 1050 }), deadly: Object.freeze({ hpPm: 1000, xpPm: 1080 }) }),";
const PC = 'src/core/hunt/pull-cycle.js';
const mutants = [
  { name: 'the sheet and the catalogue part: Deadly has more HP in the data only', case: 'catalogue', edits: [[SH, SHEET_DEADLY, SHEET_DEADLY.replace('hpPm: 1100', 'hpPm: 1150')]] },
  { name: 'a ground\'s row typed in hunt-tiers.js, not the sheet\'s', case: 'rows', edits: [[D, 'dmgPm: r.dmgPm, hpPm: r.hpPm, xpPm: r.xpPm };', "dmgPm: g === 'mosslight_glade' ? 1600 : r.dmgPm, hpPm: r.hpPm, xpPm: r.xpPm };"]] },
  { name: 'the Glade loses its full box', case: 'rows', edits: [[SH, SHEET_DEADLY, SHEET_DEADLY.replace('[8, 8, 8, 8]', '[6, 8, 8, 8]')]] },
  { name: 'the Cellar offers a harder tier', case: 'rows', edits: [[SH, 'mill_cellar: Object.freeze({ normalOnly: true,', 'mill_cellar: Object.freeze({ normalOnly: false,']] },
  { name: 'an override\'s typo plays the table\'s pull', case: 'rows', edits: [[SH, 'wickstead: Object.freeze({ dangerous: Object.freeze([0, 5, 5, 6]),', 'wickstead: Object.freeze({ dangerus: Object.freeze([0, 5, 5, 6]),']] },
  { name: 'Deadly pays more than slightly more XP', case: 'rows', edits: [[SH, SHEET_DEADLY, SHEET_DEADLY.replace('xpPm: 1250', 'xpPm: 1300')]] },
  { name: 'a ground\'s dial names no dial', case: 'rows', edits: [[SH, THICKET_DIALS, THICKET_DIALS.replace('xpPm: 1080', 'xpPM: 1080')]] },
  { name: 'a party ground lifts its tiers', case: 'rows', edits: [[D, '{ ground: g, fit: fitOf(HUNT_GROUNDS[g]) }', '{ ground: g }']] },
  { name: 'the dial reader drops the health dial', case: 'dials', edits: [[D, 'hp: hp === 1000 ? row.hp : Math.max(1, Math.round(((row.hp || 1) * hp) / 1000))', 'hp: row.hp']] },
  { name: 'the dial reader drops the XP dial', case: 'harder-tier-costs', edits: [[D, 'xp: ((row.xp || 0) * xp) / 1000 };', 'xp: row.xp || 0 };']] },
  { name: 'health is no dial: a row on damage and XP alone is the row', case: 'dials', edits: [[D, "if (!row || (dmg === 1000 && hp === 1000 && xp === 1000)) return row;", "if (!row || (dmg === 1000 && xp === 1000)) return row;"]] },
  { name: 'a spawn ignores the tier\'s health', case: 'dials', edits: [[PC, 'const hp = packHpFor(inst.ground, atTier(row, inst.tier), heroes);', 'const hp = packHpFor(inst.ground, row, heroes);']] },
  { name: 'the first packs spawn on no tier', case: 'dials', edits: [['src/core/combat-sim.js', '            { density: densityFor(ctx.ground, standing.length, picker(standing)), tier });', '            { density: densityFor(ctx.ground, standing.length, picker(standing)) });']] },
  { name: 'more health pays more coin', case: 'dials', edits: [[PC, 'const yieldPm = inst.ground.partyScale === true ? yieldPermille(heroes) : 1000;', 'const yieldPm = Math.round(((inst.ground.partyScale === true ? yieldPermille(heroes) : 1000) * (inst.tier ? inst.tier.hpPm : 1000)) / 1000);']] },
  { name: 'the settle reads no tier at all', case: 'harder-tier-costs', edits: [['src/core/combat-sim.js', "const tier = tierRowOf(ground.id, tierPick(members.filter((m) => !m.left && m.unitId !== null)));", "const tier = null;"]] },
  { name: 'a tier rolls more drops', case: 'never-gold', edits: [['src/core/hunt-rewards.js', 'yieldMult: y }, rng);', 'yieldMult: y * (ctx.tier ? ctx.tier.xpPm / 1000 : 1) }, rng);']] },
  { name: 'a tier pays more gold a kill (exact)', case: 'never-gold', edits: [['src/core/hunt-rewards.js', "const y = yieldPm / 1000;", "const y = (yieldPm / 1000) * (ctx.tier ? ctx.tier.xpPm / 1000 : 1);"]] },
  { name: 'a tier pays more gold a kill', case: 'harder-tier-costs', edits: [['src/core/hunt-rewards.js', "const y = yieldPm / 1000;", "const y = (yieldPm / 1000) * (ctx.tier ? ctx.tier.xpPm / 1000 : 1);"]] },
  { name: 'a word nobody offers plays a harder tier', case: 'normal-is-the-ground', edits: [[D, "return (rows && Object.prototype.hasOwnProperty.call(rows, id) && rows[id]) || NORMAL;", "return (rows && (rows[id] || rows.deadly)) || NORMAL;"]] },
  { name: 'Deadly pays triple XP: nobody moves on', case: 'ladder', edits: [[SH, SHEET_DEADLY, SHEET_DEADLY.replace('xpPm: 1250', 'xpPm: 4200')]] },
  { name: 'the Thicket\'s Deadly brings the full box: it out-earns Wickstead', case: 'ladder', edits: [[SH, 'meadowbrook_thicket: Object.freeze({ dangerous: Object.freeze([0, 0, 0, 0]), deadly: Object.freeze([0, 0, 0, 0]),', 'meadowbrook_thicket: Object.freeze({ dangerous: Object.freeze([0, 0, 0, 0]), deadly: Object.freeze([8, 8, 8, 8]),']] },
];

const REPORT = makeReport('hunt-core/hunt-tiers');
const RUN = await loadCellRunner(ROOT);
const PLAY = await loadPlay(ROOT);
const WSTATE = await import(pathToFileURL(join(ROOT, 'src/core/hunt/world-state.js')).href + V);
const SHEET = await import(pathToFileURL(join(ROOT, 'src/data/balance-sheet.js')).href + V);
const ONLY = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1].split(',') : null;
for (const k of ONLY || []) REPORT.ok(!!cases[k], '--only names no case ' + k);
for (const [cn, fn] of Object.entries(cases).filter(([k]) => !ONLY || ONLY.includes(k))) {
  let why = null;
  try { why = await fn({ R: RUN, T: REAL, P: PLAY, WS: WSTATE, S: SHEET }); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  REPORT.ok(!why, cn + ': ' + why);
}
const PICKED = mutants.filter((m) => !ONLY || ONLY.includes(m.case));
for (const mu of PICKED) {
  if (!cases[mu.case]) { REPORT.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
  const p = plant(mu.edits, [...PLAY_TREES, 'tests/hunt-core/fixtures', 'tools/balance-sim']);
  try {
    let why = null;
    try {
      const { loadCellRunner: planted } = await import(pathToFileURL(join(p.root, 'tools/balance-sim/cell.mjs')).href);
      const { loadPlay: plantedPlay } = await import(pathToFileURL(join(p.root, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
      why = await cases[mu.case]({ R: await planted(p.root), T: await import(pathToFileURL(join(p.root, 'src/data/hunt-tiers.js')).href + V),
        P: await plantedPlay(p.root), WS: await import(pathToFileURL(join(p.root, 'src/core/hunt/world-state.js')).href + V),
        S: await import(pathToFileURL(join(p.root, 'src/data/balance-sheet.js')).href + V) });
    } catch (e) { why = 'threw ' + e.message; }
    REPORT.ok(!!why, 'mutant "' + mu.name + '" was NOT caught by ' + mu.case);
    if (why && process.argv.includes('--verbose')) console.log('  caught: ' + mu.name + ' -> ' + why);
  } finally { p.done(); }
}
if (!REPORT.fails.length) console.log('  ' + (ONLY ? ONLY.length : Object.keys(cases).length) + ' cases, ' + PICKED.length + ' mutants caught');
REPORT.finish();
