#!/usr/bin/env node
// tools/balance-sim/special-table.mjs — THE SPECIAL-ATTRIBUTE SAMPLE, measured on the real engine (designer,
// lane/d-special-attributes; the design is docs/planning/PRIORITY_BOARD.md "2026-11-15 Special-attribute gear").
// A what-if tool: it writes nothing to src/. The five sample rows live in src/data/special-attributes.js, which no
// catalogue imports; this tool adds them to the engine's ITEMS in memory, dresses one hero in one, and plays the same
// dice with and without it.
//
//   node tools/balance-sim/special-table.mjs survey      [--seeds 3] [--hours 2]   where an element spell bites on the open grounds, with 10% and 20% resistance
//   node tools/balance-sim/special-table.mjs chief       [--tries 60]              fire resistance and + Defense in Chief Coppercap's called fight
//   node tools/balance-sim/special-table.mjs mitts       [--seeds 3] [--hours 2]   Mudlark's Mitts (+2 Ranged) on the Slake
//   node tools/balance-sim/special-table.mjs demoncaller [--seeds 3] [--hours 2]   Demoncaller (Undead bane) on the Pyre Field
//   node tools/balance-sim/special-table.mjs legs        [--seeds 3] [--hours 2]   Banded Legguards (3% physical) on Krell's Hold, the ground
//   node tools/balance-sim/special-table.mjs krell       [--tries 60] [--level 88] Tollgate and Legguards in Krell's Hall, the door's bar
//   node tools/balance-sim/special-table.mjs crit        [--seeds 3] [--hours 2]   Widow's Fang (+6% crit) on the Sewer and the Glade, and the crit ladder's upper rungs
//   node tools/balance-sim/special-table.mjs skill       [--ground G --level L --tier T --who tank:defense,bow:ranged]   + skill on armor, +1 to +8
//
// ONE ATTRIBUTE HAS NO ENGINE HOOK YET, so it is measured through a stand-in, named on every table:
//   (physical resistance was a planted copy of the engine until lane/c-krell-uniques built the hook: src/core/elements.js
//    heroElementPermille reads `physical` for a blow with no element, under data/elements.js HERO_RESIST_PM.physicalMax. It is
//    measured on the real engine now.)
//   + skill              the hero's own skill raised by the bonus (cell.mjs skillsBySeat), as the Tower's table did. Combat reads
//                        the same number either way; skill XP earned is not what is being read.
// Exit 0 when every cell ran; 1 otherwise.
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sourceQuery } from '../lib/version-stamp.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const mode = process.argv[2];
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const SEEDS = Number(arg('seeds', 3)), HOURS = Number(arg('hours', 2));
const k = (n) => (n === null || n === undefined ? '-' : Math.abs(n) >= 10000 ? (n / 1000).toFixed(1) + 'k' : String(Math.round(n)));
const pct = (a, b) => (b ? ((100 * (a - b)) / b >= 0 ? '+' : '') + ((100 * (a - b)) / b).toFixed(1) + '%' : '-');
const u = (root, p) => pathToFileURL(join(root, p)).href;

/* The engine of `root`, with the sample rows and any stand-in rows added to both ITEMS instances the fight can read. */
async function engine(root, extra = {}) {
  const { loadCellRunner } = await import(u(root, 'tools/balance-sim/cell.mjs'));
  const R = await loadCellRunner(root);
  const { BUILD } = await import(u(root, 'src/build-info.js'));
  const v = sourceQuery(ROOT);
  const tables = [(await import(u(root, 'src/data/items.js') + v)).ITEMS, (await import(u(root, 'src/data/items.js'))).ITEMS];
  const { SPECIAL_SAMPLE } = await import(u(ROOT, 'src/data/special-attributes.js'));
  const rows = { ...Object.fromEntries(Object.entries(SPECIAL_SAMPLE).map(([id, s]) => ['sample_' + id, JSON.parse(JSON.stringify(s.row))])), ...extra };
  for (const t of tables) for (const [id, row] of Object.entries(rows)) { if (t[id]) throw new Error('special-table: ' + id + ' is already an item'); t[id] = JSON.parse(JSON.stringify(row)); }
  return { R, tables, v, root };
}
/* The engine the physical tables play on: the real one (the hook is built; this was a planted copy before lane/c-krell-uniques). */
async function planted() {
  return { root: ROOT, done() {} };
}

/* One cell, read: the party's numbers and each hero's. */
function read(res) {
  const hs = res.heroes;
  return { xp: res.party.levelXpPerHeroPerH, kills: res.party.killsPerH, deaths: hs.reduce((a, h) => a + h.deaths, 0), hours: res.party.hours,
    heroes: hs.map((h) => ({ style: h.style, xp: h.levelXpPerH, taken: h.takenPerH, store: h.storePerH, deaths: h.deaths, close: h.closeCallsPer12h.rate, dps: h.dps, healOut: h.healOutPerH,
      low: h.encMinHpPct.p10, spells: Object.fromEntries(Object.entries(h.spellsIn).map(([id, s]) => [id, Math.round(s.dmg / (h.hours || 1e-9))])), kit: h.kit })) };
}
const cellOf = (ground, party, level, extra = {}) => ({ id: ground + ':' + party.join('+') + '@' + level, ground, party, level, hours: HOURS, seeds: SEEDS, segmentH: HOURS, ...extra });
const tierOpt = (tier) => (tier === 'normal' ? {} : { options: { tier } });
const skillsAt = (L, plus = {}) => ({ melee: L + (plus.melee || 0), ranged: L + (plus.ranged || 0), magic: L + (plus.magic || 0), defense: L + (plus.defense || 0) });
const head = (title, cols) => { console.log('\n' + title); console.log('| ' + cols.join(' | ') + ' |'); console.log('|' + cols.map(() => '---').join('|') + '|'); };
const line = (cells) => console.log('| ' + cells.join(' | ') + ' |');

/* ── + SKILL ON ARMOR (stand-in: the skill raised by the bonus), every style, to +8. --ground and --level pick the cell. ── */
async function skill() {
  const E = await engine(ROOT);
  const ground = arg('ground', 'muster_barrows'), L = Number(arg('level', 60)), tier = arg('tier', 'normal');
  head('+ SKILL at Level ' + L + ' on ' + ground + ', ' + tier + ', alone. A STAND-IN (the skill raised by the bonus). ' + SEEDS + ' seeds x ' + HOURS + ' h a cell, the same dice.',
    ['Who', 'Skill', 'Bonus', 'Level XP / h', 'vs none', 'Damage taken / h', 'vs none', 'Supplies g / h', 'Deaths']);
  const who = (arg('who', 'tank:defense,tank:melee,hammer:melee,bow:ranged,mage:magic,healer:magic')).split(',').map((x) => x.split(':'));
  for (const [style, sk] of who) {
    let base = null;
    for (const plus of [0, 1, 2, 4, 8]) {
      const r = read(E.R.runCell(cellOf(ground, [style], L, { ...tierOpt(tier), skillsBySeat: [skillsAt(L, { [sk]: plus })] })));
      if (plus === 0) base = r;
      line([style, sk, plus ? '+' + plus : 'as trained', k(r.xp), plus ? pct(r.xp, base.xp) : '', k(r.heroes[0].taken), plus ? pct(r.heroes[0].taken, base.heroes[0].taken) : '', k(r.heroes[0].store), r.deaths]);
    }
  }
}

/* ── Mudlark's Mitts: the row itself has the Snakeskin Bracers' numbers, so the +1 Ranged is the whole difference (stand-in). ── */
async function mitts() {
  const E = await engine(ROOT);
  const L = Number(arg('level', 52));
  const FOUR = ['tank', 'healer', 'bow', 'mage'];
  head('MUDLARK\'S MITTS on the Slake, Level ' + L + '. + Ranged is a STAND-IN (the hero\'s Ranged raised by 2; the gloves\' own numbers are the Snakeskin Bracers\'). ' + SEEDS + ' seeds x ' + HOURS + ' h a cell, the same dice.',
    ['Who', 'Tier', 'Gloves', 'Level XP / h', 'vs Snakeskin', 'Bow damage / s', 'Bow damage taken / h', 'Bow supplies g / h', 'Deaths']);
  for (const [whoName, party, seat, tier] of [['Bow alone', ['bow'], 0, 'normal'], ['Bow alone', ['bow'], 0, 'dangerous'], ['Bow in a four', FOUR, 2, 'dangerous']]) {
    let base = null;
    for (const plus of [0, 2]) {
      const r = read(E.R.runCell(cellOf('the_slake', party, L, { ...tierOpt(tier), gearBySeat: party.map((_, i) => (i === seat && plus ? { also: { gloves: 'sample_mudlarks_mitts' } } : {})),
        skillsBySeat: party.map((_, i) => skillsAt(L, i === seat ? { ranged: plus } : {})) })));
      if (!plus) base = r;
      const h = r.heroes[seat];
      line([whoName, tier, plus ? 'Mudlark\'s Mitts (+2 Ranged)' : 'Snakeskin Bracers', k(r.xp), plus ? pct(r.xp, base.xp) : '', h.dps, k(h.taken), k(h.store), r.deaths]);
    }
  }
}

/* ── Demoncaller: the Runewood Staff's numbers and 10% more to the Undead (the sample row), beside the sizes that were tried. ── */
async function demoncaller() {
  const staff = (pm, mult) => ({ n: 'what-if', type: 'weapon', slot: 'weapon', weaponType: 'magic', discipline: 'restoration', twoHanded: true, atkB: Math.round(28 * pm / 1000), strB: Math.round(38 * pm / 1000),
    magicAtkB: Math.round(28 * pm / 1000), magicStrB: Math.round(38 * pm / 1000), ...(mult ? { bane: { class: 'undead', mult }, effects: ['bane'] } : {}), tier: 6, reqSkill: 'level', reqLv: 75 });
  const E = await engine(ROOT, { whatif_staff_85: staff(850, 0), whatif_staff_85_120: staff(850, 1.2), whatif_staff_85_130: staff(850, 1.3), whatif_staff_100_110: staff(1000, 1.1), whatif_staff_100_120: staff(1000, 1.2) });
  const FOUR = ['tank', 'healer', 'hammer', 'mage'];
  head('DEMONCALLER against the Runewood Staff. ' + SEEDS + ' seeds x ' + HOURS + ' h a cell, the same dice.',
    ['Where', 'Who', 'Tier', 'Staff', 'Level XP / h', 'vs Runewood', 'Healer damage / s', 'Heals given / h', 'Deaths', 'Supplies g / h (party)']);
  const cells = [['The Pyre Field (4 of 5 Undead)', 'pyre_field', 80, ['healer'], 0, 'normal'], ['The Pyre Field (4 of 5 Undead)', 'pyre_field', 80, FOUR, 1, 'deadly'],
    ['The Muster Barrows (all Undead)', 'muster_barrows', 75, ['healer'], 0, 'normal'],
    ['Krell\'s Hold (1 of 5 Undead)', 'krells_hold', 90, ['healer'], 0, 'normal'], ['Krell\'s Hold (1 of 5 Undead)', 'krells_hold', 90, FOUR, 1, 'deadly']];
  for (const [where, ground, L, party, seat, tier] of cells) {
    let base = null;
    const rows = [['Runewood Staff', 'runewood_staff'], ['Demoncaller (the sample row)', 'sample_demoncaller_staff']].concat(party.length > 1 ? [] : [['what-if: 85% numbers, no bane', 'whatif_staff_85'], ['what-if: 85% numbers, Undead x1.2', 'whatif_staff_85_120'],
      ['what-if: 85% numbers, Undead x1.3', 'whatif_staff_85_130'], ['what-if: full numbers, Undead x1.1', 'whatif_staff_100_110'], ['what-if: full numbers, Undead x1.2', 'whatif_staff_100_120']]);
    for (const [name, id] of rows) {
      const r = read(E.R.runCell(cellOf(ground, party, L, { ...tierOpt(tier), gearBySeat: party.map((_, i) => (i === seat ? { also: { weapon: id } } : {})) })));
      if (!base) base = r;
      const h = r.heroes[seat];
      line([where, party.length > 1 ? 'Healer in a four' : 'Healer alone', tier, name, k(r.xp), base === r ? '' : pct(r.xp, base.xp), h.dps, k(h.healOut), r.deaths, k(r.heroes.reduce((a, x) => a + x.store, 0))]);
    }
  }
}

/* ── CRIT ON A WEAPON: Widow's Fang (the sample row) against the Iron Sword, and the ladder's upper rungs on the tier-5 and tier-6 swords. ── */
async function crit() {
  const sword = (atkB, strB, critB, tier, reqLv) => ({ n: 'what-if', type: 'weapon', slot: 'weapon', weaponType: 'sword', atkB, strB, critB, tier, reqSkill: 'level', reqLv });
  const E = await engine(ROOT, { whatif_iron_3: sword(7, 6, 0.03, 2, 15), whatif_rune_8: sword(25, 20, 0.08, 5, 60), whatif_ember_10: sword(33, 27, 0.10, 6, 75) });
  head('CRIT ON A SWORD, Normal, alone. ' + SEEDS + ' seeds x ' + HOURS + ' h a cell, the same dice.', ['Where, Level', 'Who', 'Sword', 'Level XP / h', 'vs standard', 'Damage / s', 'Deaths']);
  const cells = [['millrace_sewer', 15, [['Iron Sword', 'iron_sword'], ['what-if: +3% crit', 'whatif_iron_3'], ['Widow\'s Fang (+6% crit)', 'sample_widows_fang']]],
    ['mosslight_glade', 20, [['Iron Sword', 'iron_sword'], ['what-if: +3% crit', 'whatif_iron_3'], ['Widow\'s Fang (+6% crit)', 'sample_widows_fang']]],
    ['muster_barrows', 60, [['Rune Sword', 'rune_sword'], ['what-if: +8% crit', 'whatif_rune_8']]],
    ['krells_hold', 90, [['Emberforged Sword', 'ember_sword'], ['what-if: +10% crit', 'whatif_ember_10']]]];
  for (const [ground, L, rows] of cells) for (const style of ['sword', 'tank']) {
    let base = null;
    for (const [name, id] of rows) {
      const r = read(E.R.runCell(cellOf(ground, [style], L, { gear: { also: { weapon: id } } })));
      if (!base) base = r;
      line([ground + ', ' + L, style === 'tank' ? 'Sword and shield' : 'Sword alone', name, k(r.xp), base === r ? '' : pct(r.xp, base.xp), r.heroes[0].dps, r.deaths]);
    }
  }
}

/* ── Banded Legguards on the Hold's ground: the tier-6 legs a tank wears today, plain Dawnsteel numbers, and the 3%. Planted engine. ── */
async function legs() {
  const P = await planted();
  try {
    const E = await engine(P.root, { whatif_legs_100: { n: 'what-if', type: 'armor', slot: 'pants', defB: 64, armourClass: 'plate', rangeAtkB: -16, magicAtkB: -32, resistPm: { physical: 100 }, tier: 7, reqSkill: 'level', reqLv: 88 } });
    const FOUR = ['tank', 'healer', 'hammer', 'mage'];
    head('BANDED LEGGUARDS on Krell\'s Hold (the ground), Level 90. ' + SEEDS + ' seeds x ' + HOURS + ' h a cell, the same dice.',
      ['Who', 'Tier', 'Legs', 'Tank damage taken / h', 'vs Emberforged', 'vs plain Dawnsteel', 'Tank supplies g / h', 'Deaths', 'Close calls / 12 h', 'Level XP / h']);
    for (const [who, party, tier] of [['Tank alone', ['tank'], 'normal'], ['Tank alone', ['tank'], 'dangerous'], ['Tank in a four', FOUR, 'dangerous'], ['Tank in a four', FOUR, 'deadly']]) {
      let ember = null, dawn = null;
      for (const [name, id] of [['Emberforged Platelegs (worn today)', null], ['Dawnsteel numbers, no attribute', 'dawn_platelegs'], ['Banded Legguards (3%)', 'sample_banded_legguards'], ['what-if: at the 10% cap', 'whatif_legs_100']]) {
        const r = read(E.R.runCell(cellOf('krells_hold', party, 90, { ...tierOpt(tier), gearBySeat: party.map((_, i) => (i === 0 && id ? { also: { pants: id } } : {})) })));
        const h = r.heroes[0];
        if (!id) ember = h; if (id === 'dawn_platelegs') dawn = h;
        line([who, tier, name, k(h.taken), id ? pct(h.taken, ember.taken) : '', id && id !== 'dawn_platelegs' ? pct(h.taken, dawn.taken) : '', k(h.store), r.deaths, h.close.toFixed(1), k(r.xp)]);
      }
    }
  } finally { P.done(); }
}

/* ── A BOSS ROOM (a keyed hall or a called fight), tank + healer + hammer + mage, on boss-call-table.mjs's own secrets and two of its bars:
   'door' (default moves, eating at 75%, the healer's two heals: what a hall's hints build) and 'default' (default moves on the ground's food).
   `wear` is a list of { seat: { slot: item } }. Answers one row a variant. ── */
async function bossRoom(spec, variants) {
  const P = await planted();
  try {
    const TRIES = Number(arg('tries', 60)), L = Number(arg('level', spec.level));
    const E = await engine(P.root, spec.extra || {});
    const { loadPlay } = await import(u(P.root, 'tests/hunt-core/fixtures/play-ground.mjs'));
    const play = await loadPlay(P.root);
    const { loadGear, STYLES } = await import(u(P.root, 'tools/balance-sim/gear.mjs'));
    const gear = await loadGear(P.root);
    const G = await import(u(P.root, 'src/data/hunt-grounds.js'));
    const { BOSS_HALLS, BOSS_HALL_RULES } = await import(u(P.root, 'src/data/boss-halls.js'));
    const { BOSS_CALLS, BOSS_CALL_RULES } = await import(u(P.root, 'src/data/boss-calls.js'));
    const { START_BAR } = await import(u(P.root, 'src/data/start-kit.js'));
    const { BAG_GUIDE_BY_HUNT } = await import(u(P.root, 'src/data/supplies.js'));
    const SB = await import(u(P.root, 'src/data/supply-basics.js'));
    const COND = await import(u(P.root, 'src/core/hunt/conditions.js') + E.v);
    const XP = await import(u(P.root, 'src/core/xp.js'));
    const COMBAT = ['melee', 'ranged', 'magic', 'defense'];
    const room = spec.hall ? { hunt: BOSS_HALLS[spec.hall].hunt, from: spec.hall, ground: G.HALL_GROUNDS[BOSS_HALLS[spec.hall].hunt], limitMs: BOSS_HALL_RULES.limitMs }
      : { hunt: BOSS_CALLS[spec.call].hunt, from: BOSS_CALLS[spec.call].from, ground: G.CALLED_GROUNDS[BOSS_CALLS[spec.call].hunt], limitMs: BOSS_CALL_RULES.limitMs };
    const secretOf = (seed) => { let h = 2166136261 >>> 0; for (const c of 'bosscall:' + seed) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; } return String(-4611686018427387904n + BigInt(h)); };
    const storeOf = (kind, cooked) => (SB.BASIC_SUPPLIES.find((b) => b.kind === kind && b.partner === cooked) || {}).id;
    const guideBar = (eatPct) => {
      const g = BAG_GUIDE_BY_HUNT[room.from];
      const item = g ? { d_food: g.melee.heal.id, d_food_store: storeOf('heal', g.melee.heal.id), d_drink: storeOf('mana', g.magic.mana.id) } : {};
      return START_BAR.map((x) => { const y = JSON.parse(JSON.stringify(x)); if (item[y.id]) y.action.id = item[y.id]; if (Number.isInteger(eatPct) && y.conditions[0].metric === 'self_hp_pct') y.conditions[0].value = eatPct; return y; });
    };
    const slot = (id, when) => ({ action: { type: 'ability', id, store: 'plain_water_rune' }, conditions: when || COND.suggestedConditions({ type: 'ability', id }), join: 'and' });
    const DOOR = { healer: [slot('circle_of_renewal', [{ metric: 'allies_below', op: 'gte', value: 2, subject: 'under_80' }]), slot('greater_mend', [{ metric: 'ally_hp_pct', op: 'lt', value: 85, subject: 'lowest' }])] };
    const party = ['tank', 'healer', 'hammer', 'mage'], roles = party.map((s) => STYLES[s].role);
    /* `plus` { seat: { skill: n } }: the + skill stand-in, the seat's own skill raised (play-ground.mjs opts.start) */
    const tryOnce = (wear, seed, plus) => {
      const kits = party.map((s, i) => ({ ...gear.kitOf(s, L, {}), ...((wear && (wear[i] || wear.all)) || {}) }));
      let how = 'other', store = 0;
      const unitSeat = {}, taken = party.map(() => 0), el = party.map(() => 0), died = party.map(() => 0);
      play.run(room.hunt, L, roles, { ground: room.ground, spanMs: room.limitMs + 30000, windowMs: 30000, secret: secretOf(seed), equipment: (role, i) => kits[i],
        bar: (role, seat) => (spec.bar === 'door' ? [...(DOOR[party[seat]] || []), ...guideBar(75)] : guideBar()), leaveTogether: true,
        bag: (role, i) => (kits[i].ammo === 'bronze_arrows' ? { bronze_arrows: { loaded: 1 } } : {}),
        ...(plus ? { start: (role, i) => ({ skills: Object.fromEntries(COMBAT.map((sk) => [sk, XP.skillXpForLevel(sk, L + ((plus[i] || {})[sk] || 0))])) }) } : {}),
        onWindow: (o) => {
          for (const p of o.members) {
            const seat = Number.parseInt(String(p.key), 10); /* play-ground.mjs memberKey: the seat comes first */
            const uid = p.summary && Number.isInteger(p.summary.unitIdEver) ? p.summary.unitIdEver : p.hunt && p.hunt.unit_id;
            if (Number.isInteger(uid) && Number.isInteger(seat)) unitSeat[uid] = seat;
            if (p.hunt.ended) { const r = p.hunt.ended.reason; if (r === 'boss_felled') how = 'felled'; else if (r === 'boss_time' && how !== 'felled') how = 'time'; else if ((r === 'died' || r === 'party_member_died') && how === 'other') how = 'death'; }
            if (Number.isInteger(seat)) died[seat] += (p.summary.deathLog || []).length;
            for (const [id, n] of Object.entries(p.hunt.buys || {})) store += n * ((play.basics[id] || {}).price || 0);
          }
          for (const e of o.events || []) if (e.type === 'dmg' && unitSeat[e.t] !== undefined) { taken[unitSeat[e.t]] += e.amount || 0; if (e.element === spec.element) el[unitSeat[e.t]] += e.amount || 0; }
        } });
      return { how, store: store / roles.length, taken, el, died, seen: Object.keys(unitSeat).length };
    };
    const base = party.map((s) => gear.kitOf(s, L, {}));
    head(spec.title + ', Level ' + L + ', tank + healer + hammer + mage, the ' + (spec.bar === 'door' ? 'door\'s bar' : 'default moves on the ground\'s food') + ', ' + TRIES + ' tries a row on the same secrets. The tank today wears '
      + base[0].shield + ' and ' + base[0].pants + '.',
    ['Worn', 'Wins', 'Tries a death ended', 'Tries each died in (tank / healer / hammer / mage)', 'Tank damage taken a try', 'of it ' + spec.element, 'Back line taken a try', 'of it ' + spec.element, 'Food g a head']);
    for (const [name, wear, plus] of variants) {
      const t = []; for (let s = 0; s < TRIES; s++) t.push(tryOnce(wear, s, plus));
      if (!t.every((x) => x.seen === party.length)) throw new Error('special-table: a seat\'s unit was never seen (' + t.map((x) => x.seen).join(',') + ')');
      const won = t.filter((x) => x.how === 'felled').length, mean = (f) => Math.round(t.reduce((a, x) => a + f(x), 0) / t.length);
      const back = (a) => a[1] + a[2] + a[3];
      line([name, Math.round((100 * won) / TRIES) + '%', t.filter((x) => x.how === 'death').length, party.map((_, i) => t.filter((x) => x.died[i] > 0).length).join(' / '),
        k(mean((x) => x.taken[0])), k(mean((x) => x.el[0])), k(mean((x) => back(x.taken))), k(mean((x) => back(x.el))), k(mean((x) => x.store))]);
    }
  } finally { P.done(); }
}
const ring = (el, pm) => ({ n: 'what-if', slot: 'ring', type: 'jewelry', resistPm: { [el]: pm } });

/* ── Krell's Hall: the Tollgate and the Banded Legguards on the tank. ── */
const krell = () => bossRoom({ hall: 'krells_hold', level: 88, bar: arg('bar', 'door'), element: 'ember', title: 'KRELL\'S HALL',
  extra: { whatif_shield_15: { n: 'what-if', type: 'offhand', slot: 'shield', offhand: 'shield', defB: 15, tier: 7, reqSkill: 'level', reqLv: 88 }, whatif_ember_100: ring('ember', 100), whatif_ember_300: ring('ember', 300) } },
[['what the ladder gives (tier-3 shield, tier-6 legs)', null], ['a plain guard-15 shield', { 0: { shield: 'whatif_shield_15' } }], ['Krell\'s Tollgate (guard 15, 10% fire)', { 0: { shield: 'sample_krells_tollgate' } }],
  ['plain Dawnsteel legs', { 0: { pants: 'dawn_platelegs' } }], ['Banded Legguards (3% physical)', { 0: { pants: 'sample_banded_legguards' } }],
  ['Tollgate and Banded Legguards', { 0: { shield: 'sample_krells_tollgate', pants: 'sample_banded_legguards' } }],
  ['what-if: everyone 10% fire, no Tollgate', { all: { ring: 'whatif_ember_100' } }], ['what-if: everyone 30% fire (a Sealed lining), no Tollgate', { all: { ring: 'whatif_ember_300' } }]]);

/* ── Chief Coppercap's called fight: who needs the fire piece, how much of it, and the Tin Hat's +1 Defense (a stand-in) on the tank. ── */
const chief = () => bossRoom({ call: 'chief_coppercap', level: 45, bar: 'default', element: 'ember', title: 'CHIEF COPPERCAP, CALLED OUT',
  extra: { whatif_ember_100: ring('ember', 100), whatif_ember_200: ring('ember', 200), whatif_ember_300: ring('ember', 300), whatif_ember_400: ring('ember', 400),
    whatif_apron: { n: 'what-if', type: 'armor', slot: 'belt', defB: 4, armourClass: 'leather', rangeAtkB: 4, critB: 0.012, magicAtkB: -1, resistPm: { ember: 100 }, tier: 3, reqSkill: 'level', reqLv: 30 } } },
[['nothing', null], ['10% fire on the tank only', { 0: { ring: 'whatif_ember_100' } }], ['10% fire on the healer only', { 1: { ring: 'whatif_ember_100' } }],
  ['the tank swaps his Steel Belt for the Blast Apron (leather, 10% fire)', { 0: { belt: 'whatif_apron' } }],
  ['10% fire on everyone (one piece each)', { all: { ring: 'whatif_ember_100' } }], ['20% fire on everyone (two pieces, or a Stitched lining)', { all: { ring: 'whatif_ember_200' } }],
  ['30% fire on everyone (a piece and a Stitched lining)', { all: { ring: 'whatif_ember_300' } }], ['40% fire on everyone (the cap)', { all: { ring: 'whatif_ember_400' } }],
  ['+1 Defense on the tank (the Tin Hat)', null, { 0: { defense: 1 } }], ['+2 Defense on the tank', null, { 0: { defense: 2 } }],
  ['+1 Defense on the tank and 10% fire on everyone', { all: { ring: 'whatif_ember_100' } }, { 0: { defense: 1 } }]]);

/* ── WHERE DOES AN ELEMENT BITE? Every open ground with an element spell, a four at the floor: each hero's damage by source. ── */
async function survey() {
  const E = await engine(ROOT, Object.fromEntries(['ember', 'frost', 'poison'].flatMap((el) => [100, 200].map((pm) => ['whatif_' + el + '_' + pm, { n: 'what-if', slot: 'ring', type: 'jewelry', resistPm: { [el]: pm } }]))));
  const FOUR = ['tank', 'healer', 'bow', 'mage'];
  const GROUNDS = [['wickstead', 8, 'ember'], ['millrace_sewer', 8, 'poison'], ['mosslight_glade', 16, 'poison'], ['coppercap_warrens', 32, 'ember'], ['the_slake', 50, 'frost']];
  head('WHERE AN ELEMENT BITES: a four (tank, healer, bow, mage) at each ground\'s floor. ' + SEEDS + ' seeds x ' + HOURS + ' h a cell, the same dice. "Resist" is every hero wearing that much of the ground\'s element.',
    ['Ground, Level', 'Tier', 'Resist', 'Deaths', 'Close calls / 12 h (party)', 'Spell share of the back line\'s damage', 'Spell share of the tank\'s', 'Supplies g / h (party)', 'Level XP / h']);
  for (const [ground, L, el] of GROUNDS) for (const tier of ['dangerous', 'deadly']) for (const pm of [0, 100, 200]) {
    let r;
    try { r = read(E.R.runCell(cellOf(ground, FOUR, L, { ...tierOpt(tier), ...(pm ? { gear: { also: { ring: 'whatif_' + el + '_' + pm } } } : {}) }))); } catch (e) { line([ground + ', ' + L, tier, pm / 10 + '%', 'no such tier: ' + String(e.message).slice(0, 60)]); break; }
    const spell = (h) => Object.values(h.spells).reduce((a, b) => a + b, 0), back = r.heroes.slice(1);
    const share = (hs) => { const t = hs.reduce((a, h) => a + h.taken, 0); return t ? Math.round((100 * hs.reduce((a, h) => a + spell(h), 0)) / t) + '%' : '-'; };
    line([ground + ', ' + L, tier, pm ? pm / 10 + '% ' + el : 'none', r.deaths, r.heroes.reduce((a, h) => a + h.close, 0).toFixed(1), share(back), share([r.heroes[0]]), k(r.heroes.reduce((a, h) => a + h.store, 0)), k(r.xp)]);
  }
}

const MODES = { skill, mitts, demoncaller, crit, legs, krell, chief, survey };
if (!MODES[mode]) { console.error('usage: node tools/balance-sim/special-table.mjs ' + Object.keys(MODES).join('|') + ' [--seeds N] [--hours N]'); process.exit(1); }
const t0 = Date.now();
await MODES[mode]();
console.log('\n(' + mode + ': ' + Math.round((Date.now() - t0) / 1000) + ' s)');
