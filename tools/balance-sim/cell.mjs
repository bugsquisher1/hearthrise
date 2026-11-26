// tools/balance-sim/cell.mjs — ONE SCENARIO ("cell") PLAYED ON THE REAL ENGINE, measured.
//
// A cell is a ground, a party of styles at a Level, a density, a gear rule, a bar and a supply policy. It is played
// through the settle the world tick runs (tests/hunt-core/fixtures/play-ground.mjs `run` -> hr-accrue accrual.js
// accrueHunt -> src/core/combat-sim.js), in short settle windows (any cut walks the same swings: TICK-1), for
// `hours` of hunting per seed. Nothing here computes a combat number: every value is read off the events, members and
// deltas the engine answers.
//
// THE DEATH RULE (`cell.deathRule`, the critical review's step 1, 2026-11-21):
//   'real'     the game's rule (CLAUDE.md section 6, rulings 2026-11-09): a death ENDS that hero's hunt and costs the death
//              price; the hero is settled no more (dropEnded) and stays home for the rest of the seed. A party's other heroes
//              hunt on unless the cell sets `endTogether: true` (ruling 27-1 as amended 2026-11-21: for an account's own
//              heroes "end together" is OFF unless set). One hunt a seed, so the time a dead hero did not hunt is LOST time:
//              each hero carries `wallHours` (the hours the seed offered) beside `hours` (the hours it hunted). Stamina
//              (`staminaH`) and the purse (`purse`) bind the same way: a hunt they end is over.
//   'reenter'  (the default, kept for the legacy tables and guards that read it): a death ends the hunt and the next segment is
//              a NEW hunt on a new seed at the cell's Level, so a hero that dies stands up again; its deaths are deaths a hunted hour.
// Either way the party's hours book only the time hunted (a hunt that ended in its first seconds books those seconds).
// `blessings` (0, or any count above it for the ONE Blessing, src/data/blessings.js BLESSING; lane/level-costs 2026-11-22): each
// death's Level XP loss is cut by the Blessing's share and the Blessing is bought again at the hero's Level (src/core/wage.js
// blessingPrice; a death uses it up): `xpLostLevelBlessed` and `blessingGold` beside the raw loss.
//
// HP between settles: the engine emits every blow and every heal (food, spells), but not regeneration. Inside a
// window the tracked HP is the window-start HP (the settle's own `delta.hp`) minus blows plus heals plus a constant
// regeneration rate, the one that lands the window on the engine's own HP at its end (never past max); every window
// end re-anchors on the engine. Regeneration is not constant inside a window (it stops at max), so a dip can read a
// little deeper than it was: close calls are counted conservatively (never hidden).
//
// ENCOUNTER (the ruling's "one continuous encounter = one close call"): from one `pull` to the next. Its minimum
// HP% is the encounter's dip; a dip under 25% is a close call; time-to-death at that minimum is the HP left over the
// damage the hero took in the 4 s before it (the incoming rate at that moment).
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { loadGear, STYLES } from './gear.mjs';
import { rateCI, quantile, round, gini, underInto } from './stats.mjs';
import { playedBar, runeTierAt, shoppingTier, RUNE_TIERS, PLAYED_OPTIONS, PLAYED_RUNES } from './played.mjs';
import { loadLines, skillsAt, restateSkills } from './skill-lines.mjs';
import { sourceQuery } from '../lib/version-stamp.mjs';
/* the sustain reads of a settled window, shared with the browser twin (tools/balance-lab/lab-core.mjs) */
import { sustainTotals, noteSustainEvent, readSustainWindow, sustainSummary } from './sustain-reads.mjs';

/* the settle's cut: 10 s alone, 30 s for a party (the tracked HP is re-anchored on the engine's at every cut; a
   party pays for every cut: about +40% an hour at 10 s, measured) */
const windowOf = (cell) => cell.windowMs || (cell.party.length > 1 ? 30000 : 10000);
const T0 = Date.UTC(2026, 9, 18, 12, 0, 0);
const BURST_MS = 4000;
const CLOSE_PCT = 25;
/* a hero's event in `channel` (its blow, a blow at it, its heal) and the worn Traits that held on it (the event's `tr`, src/core/hunt/trait-rules.js) */
function traitHeld(h, channel, e) {
  h.tr[channel]++;
  if (typeof e.tr === 'string' && e.tr) for (const id of e.tr.split(',')) { const k = channel + ':' + id; h.tr.held[k] = (h.tr.held[k] || 0) + 1; }
}
const DIP_PCT = 40;

/* One deterministic hunt secret per (seed, segment): the same dice for the same seed in every cell (paired A/B). */
function secretOf(seed, seg) {
  let h = 2166136261 >>> 0;
  for (const c of 'bal:' + seed + ':' + seg) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return String(-4611686018427387904n + BigInt(h));
}

export async function loadCellRunner(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const { loadPlay } = await import(u('tests/hunt-core/fixtures/play-ground.mjs'));
  const play = await loadPlay(root);
  const gear = await loadGear(root);
  const { BUILD } = await import(u('src/build-info.js'));
  const v = sourceQuery(root);
  const XP = await import(u('src/core/xp.js') + v);
  const MIT = await import(u('src/core/mitigation.js') + v);
  const VIT = await import(u('src/core/vitals.js') + v);
  /* every combat skill (src/data/skills.js: Inner Flame since lane/b-inner-flame), the ones a career records */
  const { COMBAT_SKILLS } = await import(u('src/data/skills.js') + v);
  const CORE_COMBAT = await import(u('src/core/combat.js') + v);
  const { monsterLevelOf } = await import(u('src/data/monsters.js') + v);
  const G = await import(u('src/data/hunt-grounds.js'));
  const { HUNT_INDEX } = await import(u('src/data/hunts.js'));
  const { START_BAR } = await import(u('src/data/start-kit.js'));
  const { BAG_GUIDE_BY_HUNT } = await import(u('src/data/supplies.js'));
  const SB = await import(u('src/data/supply-basics.js'));
  const BL = await import(u('src/data/blessings.js'));
  const WG = await import(u('src/core/wage.js') + v);
  const BUFF = await import(u('src/core/buffs.js') + v);
  /* THE SUSTAIN COUNTERS (Balance Lab phase 2): the played tree's own tally, asked for its sustain block (src/core/hunt/tally.js header). A
     tree from before the counters (baseline.mjs --materialize of an older commit) has none: its heroes carry `sustain: null` */
  const TALLY = await import(u('src/core/hunt/tally.js') + v);
  const COMBAT = ['melee', 'ranged', 'magic', 'defense'];
  /* cell.buffs [{ type, magnitude, hours?, until? }]: the server's timed buff rows (player_state.buffs; src/core/buffs.js BUFFS_DEF names the
     types). A row with its own `until` is passed as written. Otherwise the buff is KEPT UP for `hours` (default: the whole hunt), as a player
     eats again when one runs out: one row an hour, each stamped `from` its hour's start (the server caps a row at BUFF_MAX_UNTIL_MS and pays a
     row only from its `from`). Fresh rows for every hero: the engine drains them. */
  /* the hunt session fields a cell names: a stamina bar (`staminaH`, hours at the start) and the gold floor the store may not spend under
     (`goldFloor`: the game's default is 300, the harness's 0; a store use the purse cannot pay over it ends the hunt gold_out) */
  const sessionOf = (cell) => {
    const o = {};
    if (Number.isFinite(cell.staminaH)) Object.assign(o, { staminaMs: Math.round(cell.staminaH * 3600000), staminaMaxMs: Math.max(Math.round(cell.staminaH * 3600000), 12 * 3600000) });
    if (Number.isInteger(cell.goldFloor)) o.goldFloor = cell.goldFloor;
    return Object.keys(o).length ? o : null;
  };
  const buffRows = (rows, spanH) => rows.flatMap((b) => {
    if (!BUFF.BUFFS_DEF[b.type]) throw new Error('balance-sim: no buff type ' + b.type + ' (src/core/buffs.js BUFFS_DEF)');
    if (!(Number.isFinite(b.magnitude) && b.magnitude > 0)) throw new Error('balance-sim: buff ' + b.type + ' needs a magnitude');
    if (b.until !== undefined) return [{ type: b.type, magnitude: b.magnitude, until: b.until, ...(b.from !== undefined ? { from: b.from } : {}) }];
    const endMs = Math.round((Number.isFinite(b.hours) ? Math.min(b.hours, spanH) : spanH) * 3600000), out = [];
    for (let at = 0; at < endMs; at += BUFF.BUFF_MAX_UNTIL_MS) out.push({ type: b.type, magnitude: b.magnitude, from: T0 + at, until: T0 + Math.min(endMs, at + BUFF.BUFF_MAX_UNTIL_MS) });
    return out;
  });
  /* the skill lines a played cell reads (skill-lines.mjs): the tree's own snapshot, else this file's (a planted copy carries none) */
  const SKILL_LINES = loadLines(join(root, 'tools', 'balance-sim', 'skill-lines.json')) || loadLines();
  const ITEMS = play.ITEMS, MONSTERS = play.MONSTERS, vendor = (id) => play.vendorPriceOf(ITEMS, id), basics = play.basics;

  /* THE BAR a cell names: the reference bar (the start bar's three slots naming the ground's guide food and drink,
     play-ground.mjs refBar) with its HP threshold moved (`eatPct`) and/or its drink threshold (`drinkPct`), and/or its store food (`storeFood`, a store row id: grade.mjs's start-bar cell). */
  const storeOf = (kind, cooked) => (SB.BASIC_SUPPLIES.find((b) => b.kind === kind && b.partner === cooked) || {}).id;
  const guideOf = (huntId) => BAG_GUIDE_BY_HUNT[huntId] || null;
  const barFor = (huntId, bar) => {
    const g = guideOf(huntId);
    const item = g ? { d_food: g.melee.heal.id, d_food_store: bar.storeFood || storeOf('heal', g.melee.heal.id), d_drink: storeOf('mana', g.magic.mana.id) } : {};
    return START_BAR.map((x) => {
      const y = JSON.parse(JSON.stringify(x));
      if (item[y.id]) y.action.id = item[y.id];
      const c = y.conditions[0];
      if (c.metric === 'self_hp_pct' && Number.isInteger(bar.eatPct)) c.value = bar.eatPct;
      if (c.metric === 'self_mana_pct' && Number.isInteger(bar.drinkPct)) c.value = bar.drinkPct;
      return y;
    });
  };
  /* THE BAG: 'store' = empty (every heal and drink bought per use: the store bill is the whole supply cost);
     'own' = the ground's guide food and drink carried (crafted, own stock first, then the store). A Ranger on the
     free Bronze Arrow carries one (ammoPerShot 0: it never runs out). */
  const bagFor = (huntId, supply, kit, also) => {
    const bag = {};
    if (kit.ammo === 'bronze_arrows') bag.bronze_arrows = { loaded: 1 };
    /* cell.bagByRole { role: { item: n } }: carried stock beside the supply policy (a self-bound caster's own runes) */
    for (const [id, n] of Object.entries(also || {})) bag[id] = { loaded: n };
    if (supply === 'own') {
      const g = guideOf(huntId);
      if (g) { bag[g.melee.heal.id] = { loaded: 100000 }; if (g.magic.mana) bag[g.magic.mana.id] = { loaded: 100000 }; }
    }
    return bag;
  };
  const bandOf = (ground) => {
    const m = {};
    for (const p of ground.pockets) for (const s of (p.pack || []).concat(p.spawns)) {
      for (const d of (MONSTERS[s.monster] || {}).drops || []) if (!m[d.id]) m[d.id] = d.band || (d.ch >= 0.05 ? 'common' : 'rare');
    }
    return m;
  };

  /** Play one cell; answers its measured metrics (per hero and per party). */
  function runCell(cell) {
    /* cell.tower { floor }: A RUN (the Burning Tower, a Catacomb wing; tower-curve.mjs) from that floor, in the run ground's own session mode, as the
       server runs it: an ended hero is settled no more, and the climb is ONE segment a seed (a death or a floor's time ends it, nothing re-enters).
       Every encounter (one floor's room, pull to pull) is tagged with its floor: heroes[i].towerEnc [[floor, low HP %]], and the party's
       tower { from, top, cleared [[floor, ms from the start]] }. A cell without it plays exactly as before. */
    const run = cell.tower && Number.isInteger(cell.tower.floor) ? cell.tower : null;
    const ground = run ? G.groundOfHunt(cell.ground) : G.HUNT_GROUNDS[cell.ground];
    if (!ground || (run && ground.tower !== true)) throw new Error('balance-sim: no ' + (run ? 'run ' : '') + 'ground ' + cell.ground);
    /* cell.seats [{ role, style?, levelXp, skills { skill: xp }, equipment, bar, options, bag }]: REAL HEROES, seat by seat (calibrate.mjs:
       a recorded hunt's party as the server held it: its own XP, worn set, stored bar, hunt options and carried stock). Nothing is dressed
       or defaulted for such a seat: the kit rule, the reference bar and the supply policy stand aside. */
    const seats = Array.isArray(cell.seats) ? cell.seats : null;
    const party = seats ? seats.map((s) => s.style || s.role) : cell.party;
    const roles = seats ? seats.map((s) => s.role) : party.map((s) => STYLES[s].role);
    /* THE SKILL LINE (skill-lines.mjs, the board's fix 1): a PLAYED hero whose cell names no skills has the skills its career gave it at its
       Level, not every skill at the Level: `cell.skillLine` 'alone' | 'party' | 'level' (the old hero), by default 'alone' for a hero on its own
       and 'party' for a party. A plain cell is untouched. */
    const asPlayed = cell.profile === 'played';
    const line = asPlayed ? cell.skillLine || (party.length > 1 ? 'party' : 'alone') : 'level';
    const lineLevels = (style, L) => {
      if (line !== 'level' && !SKILL_LINES) throw new Error('balance-sim: a played cell reads the skill lines and tools/balance-sim/skill-lines.json is missing (skill-lines.mjs --run, --write)');
      return skillsAt(SKILL_LINES, line, style, L);
    };
    const lineXp = (style, L) => { const lv = lineLevels(style, L); return Object.fromEntries(COMBAT.map((k) => [k, XP.skillXpForLevel(k, lv[k])])); };
    /* A seat field left out falls back to the harness's own rule for it (the ladder kit of `style`, the skill line (every combat skill at the
       Level for a plain cell), the reference bar, the supply policy), so one field at a time can be swapped between the recorded hero and the
       harness's hero. */
    if (seats) {
      cell = { ...cell, party, startBySeat: seats.map((s) => {
        const L = XP.charLevelFromXp(s.levelXp);
        /* a seat recorded on the old curve (s.skillCurve 'geometric', calibrate.mjs) plays the skill levels it read then: its XP restated on
           this tree's curve (skill-lines.mjs restateSkills; stage 7 moved the combat skills onto the Level clock) */
        return { levelXp: s.levelXp, skills: s.skills ? (s.skillCurve === 'geometric' ? restateSkills(s.skills, 'geometric', XP) : s.skills) : lineXp(s.style || s.role, L) };
      }) };
    } else if (line !== 'level' && !cell.startBySeat && !cell.skillsBySeat) {
      const lv0 = (i) => (Array.isArray(cell.level) ? cell.level[i] : cell.level);
      cell = { ...cell, skillsBySeat: party.map((s, i) => lineLevels(s, lv0(i))) };
    }
    /* cell.startBySeat [{ levelXp, skills: { skill: xp } }]: a hero's exact XP (a career run's carry); its Level is the curve's */
    const levels = party.map((_, i) => (cell.startBySeat ? XP.charLevelFromXp(cell.startBySeat[i].levelXp)
      : Array.isArray(cell.level) ? cell.level[i] : cell.level));
    /* the ground rides along so a `uniques` kit picks the attribute this ground asks for (gear.mjs); a ladder kit never reads it */
    /* cell.profile 'played' (played.mjs): the hero as real players set one up, wherever the cell doesn't name its own: accessories and spent
       ammo on the kit, the recorded bar for the role (rune spells on its Magic's tier), the recorded hunt options, and with supply 'own' its
       own runes, arrows and whetstones beside the guide food. A seat's skill level is its own XP's, else the cell's (its skill line's, above),
       else its Level. */
    const skillLv = (i, k) => (cell.startBySeat ? XP.skillLevelFromXp(k, (cell.startBySeat[i].skills || {})[k] || 0) : cell.skillsBySeat ? (cell.skillsBySeat[i] || {})[k] || 1 : levels[i]);
    const dress = (style, i) => (asPlayed ? { accessories: true, ammoSkill: skillLv(i, STYLES[style].role === 'ranger' ? 'ranged' : 'melee') } : {});
    const kits = seats ? seats.map((s, i) => (s.equipment ? { ...s.equipment } : gear.kitOf(s.style, levels[i], { ground: cell.ground, ...dress(s.style, i), ...(cell.gear || {}) }))) : party.map((s, i) => gear.kitOf(s, levels[i], { ground: cell.ground, ...dress(s, i), ...((cell.gearBySeat && cell.gearBySeat[i]) || cell.gear || {}) }));
    const spends = (id) => !!id && ITEMS[id] && (ITEMS[id].ammoPerShot || 0) > 0;
    /* cell.addSlots { role: { after: ability id, slots: [slot] } }: slots a player added to the role's played bar, right after that ability's
       slot (the bar's end when it holds none): a what-if on the played hero, the rest of its bar as recorded (the tank rune spells' A/B). */
    /* cell.runeTierByRole { role: rune tier id }: the dearest rune that role buys or carries (played.mjs RUNE_TIERS), whatever its Magic allows:
       the real Krell four's Mage on Carved and Healer on Etched where the harness would cast on Graven (11-krell-hunt section 4). Its spells cast
       the version that rune carries. Absent, a role casts on the tier its Magic allows, as before. */
    const runeMagic = (role, i) => {
      const t = cell.runeTierByRole && cell.runeTierByRole[role];
      const at = t ? (RUNE_TIERS.find(([, id]) => id === t) || [])[0] : undefined;
      if (t && at === undefined) throw new Error('balance-sim: runeTierByRole names no rune tier ' + t);
      return at === undefined ? skillLv(i, 'magic') : Math.min(skillLv(i, 'magic'), at);
    };
    /* cell.shopping 'real' | 'allowed' (played.mjs shoppingTier): the store rune tier each spell family casts on, as real players buy; a
       runeTierByRole tier names the role's dearest rune and the rule shops under it. Absent, the tier the Magic allows (as before). */
    const tierOfFor = (role, i) => (cell.shopping ? (family) => shoppingTier(role, family, runeMagic(role, i), cell.shopping) : undefined);
    const playedBarFor = (role, i) => {
      const g = guideOf(cell.ground), own = (cell.supply || 'store') === 'own';
      const bar = playedBar(role, { magic: runeMagic(role, i), tierOf: tierOfFor(role, i), food: own && g ? g.melee.heal.id : null, storeFood: g ? storeOf('heal', g.melee.heal.id) : 'salted_shrimp',
        storeDrink: g ? storeOf('mana', g.magic.mana.id) : 'thin_turnip_juice', arrows: role === 'ranger' && spends(kits[i].ammo) ? kits[i].ammo : null });
      /* cell.addSlotsBySeat [{ after, slots } | null]: the same, seat by seat (two seats of one role, lane/roads-review-measure) */
      /* cell.dropSlotsBySeat [[ability id] | null]: the abilities taken off that seat's played bar (a knockout: the move audit,
         lane/spell-audit, measures each move as the party without it) */
      const drop = Array.isArray(cell.dropSlotsBySeat) && cell.dropSlotsBySeat[i];
      if (Array.isArray(drop)) for (let k = bar.length - 1; k >= 0; k--) if (bar[k].action.type === 'ability' && drop.includes(bar[k].action.id)) bar.splice(k, 1);
      const add = (Array.isArray(cell.addSlotsBySeat) && cell.addSlotsBySeat[i]) || (cell.addSlots && cell.addSlots[role]);
      if (!add) return bar;
      const at = bar.findIndex((s) => s.action.type === 'ability' && s.action.id === add.after);
      bar.splice(at < 0 ? bar.length : at + 1, 0, ...JSON.parse(JSON.stringify(add.slots)));
      return bar;
    };
    const playedBagFor = (role, i) => {
      const bag = bagFor(cell.ground, cell.supply || 'store', kits[i], cell.bagByRole && cell.bagByRole[role]);
      if ((cell.supply || 'store') !== 'own') return bag;
      for (const f of PLAYED_RUNES[role] || []) bag[runeTierAt(f === 'earth' && role === 'mage' ? 1 : runeMagic(role, i)) + '_' + f + '_rune'] = { loaded: 100000 };
      if (spends(kits[i].ammo)) bag[kits[i].ammo] = { loaded: 100000 };
      return bag;
    };
    /* the runner's own member keys (play-ground.mjs memberKey: seat order, as one player's heroes enter live) */
    const keys = roles.map((r, i) => play.memberKey(r, i));
    const band = bandOf(ground);
    /* skills: 'level' = every combat skill at the hero's Level (the harness default); or per seat { skill: level } */
    const startFor = (role, seat) => {
      if (cell.startBySeat) return { levelXp: cell.startBySeat[seat].levelXp, skills: { ...cell.startBySeat[seat].skills } };
      const sk = cell.skillsBySeat ? cell.skillsBySeat[seat] : null;
      if (!sk) return null;
      return { skills: Object.fromEntries(COMBAT.map((k) => [k, XP.skillXpForLevel(k, sk[k] || 1)])) };
    };
    const H = keys.map((k, i) => ({ key: k, style: party[i], level: levels[i], kit: kits[i],
      mit: MIT.mitigationFor(kits[i], ITEMS, levels[i]),
      vit: VIT.vitalsOf({ levelXp: XP.charXpForLevel(levels[i]), skills: {}, equipment: kits[i], items: ITEMS }),
      hours: 0, wallHours: 0, levelXp: 0, skillXp: {}, coin: 0, loot: { common: 0, uncommon: 0, scarce: 0, rare: 0, trophy: 0, other: 0 }, lootN: 0,
      rareItems: [], gear: {}, store: 0, buys: {}, uses: {}, deaths: 0, killers: {}, xpLostLevel: 0, xpLostLevelBlessed: 0, blessingGold: 0, deathLevelXpLost: [],
      xpLostSkill: {}, dealt: 0, dealtBy: {}, taken: 0, takenBy: {}, spellsIn: {}, healIn: { food: 0, self: 0, ally: 0 }, healOut: 0, shieldIn: 0,
      blowsLanded: 0, blowsMissed: 0, dodged: 0, eats: { own: 0, store: 0 }, drinks: { own: 0, store: 0 }, casts: {}, castGold: 0, castMana: {}, castBack: {},
      manaShots: 0, enc: [], towerEnc: [], close: 0, dips: 0, ttdClose: [], ended: {},
      /* the HP regained with no event (regeneration: the window's gap, below), the hunted ms under 30% / 10% of max HP, damage dealt by target kind */
      regen: 0, under: { p30: 0, p10: 0 }, dealtTo: {},
      /* THE WORN TRAITS (cell.traitsBySeat): the hero's blows, the blows at it and its heals, and on how many each Trait held (an event's `tr`) */
      tr: { offense: 0, defense: 0, heal: 0, held: {} },
      /* the engine's sustain block summed over the cell (TALLY), the hunted ms whose regeneration the answer cannot close (a hunt that ended
         another way than a death in that window), and the party deaths this hero was short of mana at: { the waiting rule's action: n } */
      ...sustainTotals(TALLY) }));
    const P = { kills: 0, killsBy: {}, ttk: [], ttkBy: {}, hours: 0, segments: 0, rareRolls: 0, rareWins: {}, pulls: 0, ...(run ? { tower: { from: run.floor, top: null, cleared: [] } } : {}) };
    const byKey = Object.fromEntries(H.map((h) => [h.key, h]));
    /* THE TO-HIT A HERO STANDS AT (chapter 10's Footing and the floor CORE-4 owes the to-hit formula): its Defense rating as the engine builds it
       (member.js heroSnapshot: the Defense level, worn +Defense and guard, times its Footing where the cell carries one), and the monsters' chance
       to land on it over the ground's spawns (combat.js monsterAccuracy, the rows as written: a tier's raised aim is not in it) */
    const spawnMix = [];
    for (const p of ground.pockets || []) for (const sp of p.spawns || []) if (MONSTERS[sp.monster]) spawnMix.push(MONSTERS[sp.monster]);
    H.forEach((h, i) => {
      const eq = CORE_COMBAT.equipmentStats(kits[i], ITEMS), footing = (Array.isArray(cell.talentsBySeat) && cell.talentsBySeat[i] && cell.talentsBySeat[i].footing) || 0;
      const def0 = Math.floor((skillLv(i, 'defense') || 1) + CORE_COMBAT.skillPlusOf(eq, 'defense') + (Number(eq.guardB) || 0)), def = Math.floor(def0 * (1 + footing / 1000));
      const at = (d) => (spawnMix.length ? spawnMix.map((m) => CORE_COMBAT.monsterAccuracy(m, d)) : []);
      const h0 = at(def0), h1 = at(def), mean = (xs) => (xs.length ? round(xs.reduce((a, b) => a + b, 0) / xs.length, 4) : null);
      h.toHit = { def0, def, footingPm: footing, landed0: mean(h0), landed: mean(h1), lowest: h1.length ? round(Math.min(...h1), 4) : null };
    });
    /* THE DEATH RULE (header): 'real' plays one hunt a seed over the whole of `hours`, a hero whose hunt ended settled no more */
    const real = cell.deathRule === 'real';
    if (cell.deathRule !== undefined && !['real', 'reenter'].includes(cell.deathRule)) throw new Error('balance-sim: no death rule ' + cell.deathRule);
    /* Blessings held at each hunt's start (bought again after a death uses them up): the cut on a death's Level XP loss, and their price */
    const blessings = Number.isInteger(cell.blessings) ? cell.blessings : 0;
    if (blessings < 0) throw new Error('balance-sim: blessings is 0 or more (any count above 0 holds the one Blessing)');
    /* `blessedShare` (a what-if: what a blessed death leaves) overrides the Blessing's own cut */
    const blessedShare = Number.isFinite(cell.blessedShare) ? cell.blessedShare : 1 - (blessings ? BL.BLESSING.cutPm : 0) / 1000;
    const blessingsPrice = (L) => (blessings ? WG.blessingPrice(L) : 0);
    const engineBuffs = (cell.buffs || []).filter((b) => b.type !== 'level_xp');
    const levelXpPm = Math.round(10 * (cell.buffs || []).filter((b) => b.type === 'level_xp').reduce((a, b) => a + (Number(b.magnitude) || 0), 0));
    for (let seed = 0; seed < cell.seeds; seed++) {
      let left = cell.hours * 3600000, seg = 0;
      for (const h of H) h.wallHours += cell.hours;
      while (real ? seg === 0 : left > 60000) {
        const span = real ? left : Math.min(left, (cell.segmentH || 2) * 3600000);
        /* the live tracking of one hunt (one segment) */
        const live = {};
        /* waits / casts: this hero's mana waits [at, the rule's action] and cast instants inside the death explanation's window */
        for (const h of H) live[h.key] = { unit: null, cur: null, max: null, enc: null, recent: [], at: T0, rate: 0 };
        let winFrom = T0;
        /* a run's floor standing (or standing next): its start, then one past each floor the room's fall cleared */
        let floorNow = run ? run.floor : null;
        const unitKey = {};
        const firstHit = {};
        const close = (h, x) => {
          if (!x.enc || x.max === null) return;
          const pct = (100 * x.enc.min) / x.max;
          h.enc.push(Math.round(pct * 10) / 10);
          if (run) h.towerEnc.push([x.enc.floor, Math.round(pct * 10) / 10]);
          if (pct < CLOSE_PCT) { h.close++; h.ttdClose.push(x.enc.ttd); }
          if (pct < DIP_PCT) h.dips++;
          x.enc = null;
        };
        const open = (x) => { x.enc = { min: x.cur, ttd: Infinity, floor: floorNow }; };
        const lower = (x, at) => {
          if (!x.enc) open(x);
          if (x.cur < x.enc.min) {
            x.enc.min = x.cur;
            const recent = x.recent.filter((r) => r[0] > at - BURST_MS).reduce((s, r) => s + r[1], 0);
            x.enc.ttd = recent > 0 ? Math.round((x.cur / (recent / BURST_MS)) / 100) / 10 : Infinity;
          }
        };
        const onWindow = (out) => {
          for (const p of out.members) {
            const x = live[p.key];
            const uid = p.summary && Number.isInteger(p.summary.unitIdEver) ? p.summary.unitIdEver : p.hunt && p.hunt.unit_id;
            if (Number.isInteger(uid)) { x.unit = uid; unitKey[uid] = p.key; }
            x.max = p.maxHp;
            if (x.cur === null) x.cur = p.maxHp;
          }
          /* HP moves: blows and heals at a hero, the pulls, and each hero's death, in time order */
          const hp = [];
          for (const e of out.events || []) {
            if (e.type === 'pull') { P.pulls++; hp.push([e.atMs, null, 0]); continue; }
            /* THE DANGER SCALE (src/core/hunt/danger.js, a cell whose options name a `risk`): each pull's end, as the engine read it:
               [seed, ms from the start, the step it was made at, the step after, its lowest HP permille, why, and on a fall or a death the seat and the monster kind that caused it (R2's cause)] */
            if (e.type === 'danger') { (P.danger || (P.danger = [])).push([seed, e.atMs - T0, e.step, e.to, e.low, e.why, ...(e.why === 'fall' || e.why === 'death' ? [e.hero ?? null, e.monster || null] : [])]); continue; }
            /* a run's floor cleared (tower.js towerCleared): the stair, kept in time order with the HP moves so a pull after it opens the next floor */
            if (e.type === 'floor' && run) { hp.push([e.atMs, 'floor', e.floor]); P.tower.cleared.push([e.floor, e.atMs - T0]); P.tower.top = Math.max(P.tower.top ?? 0, e.floor); continue; }
            const tk = unitKey[e.t], uk = unitKey[e.u];
            switch (e.type) {
              case 'dmg': {
                const n = e.amount || 0;
                if (tk) {
                  const h = byKey[tk];
                  h.taken += n;
                  const kind = (out.units && out.units[e.u] && out.units[e.u][0]) || (e.dot ? 'status' : '?');
                  h.takenBy[kind] = (h.takenBy[kind] || 0) + n;
                  /* a monster's spell (monster-spells.js): its hit names the spell, where a swing names 'basic' */
                  if (!e.dot && !uk && e.ability && e.ability !== 'basic') { const s = h.spellsIn[e.ability] || (h.spellsIn[e.ability] = { hits: 0, dmg: 0 }); s.hits++; s.dmg += n; }
                  if (!e.dot && !uk) h.blowsLanded++;
                  if (!uk) traitHeld(h, 'defense', e);
                  hp.push([e.atMs, tk, -n]);
                } else if (uk) {
                  const h = byKey[uk];
                  traitHeld(h, 'offense', e);
                  h.dealt += n; const a = e.ability || 'basic'; h.dealtBy[a] = (h.dealtBy[a] || 0) + n;
                  const to = (out.units && out.units[e.t] && out.units[e.t][0]) || '?'; h.dealtTo[to] = (h.dealtTo[to] || 0) + n;
                  if (firstHit[e.t] === undefined) firstHit[e.t] = e.atMs;
                }
                break;
              }
              case 'miss':
                if (tk && !uk) { const h = byKey[tk]; h.blowsMissed++; if (e.dodge) h.dodged++; }
                break;
              case 'heal':
                if (tk) {
                  const h = byKey[tk], n = e.amount || 0;
                  if (e.item) h.healIn.food += n; else if (e.u === e.t) h.healIn.self += n; else h.healIn.ally += n;
                  hp.push([e.atMs, tk, n]);
                }
                if (uk && e.u !== e.t && !e.item) byKey[uk].healOut += e.amount || 0;
                if (uk && !e.item) traitHeld(byKey[uk], 'heal', e);
                break;
              case 'shield':
                if (tk) byKey[tk].shieldIn += e.amount || 0;
                break;
              case 'kill':
                if (!tk) {
                  P.kills++; const kd = (out.units && out.units[e.t] && out.units[e.t][0]) || '?'; P.killsBy[kd] = (P.killsBy[kd] || 0) + 1;
                  if (firstHit[e.t] !== undefined) { const ms = e.atMs - firstHit[e.t]; P.ttk.push(ms); const t = P.ttkBy[kd] || (P.ttkBy[kd] = [0, 0]); t[0] += ms; t[1]++; delete firstHit[e.t]; }
                }
                break;
              case 'eat': case 'drink':
                if (uk) { const h = byKey[uk]; (e.type === 'eat' ? h.eats : h.drinks)[e.source === 'store' ? 'store' : 'own']++; }
                break;
              case 'rule_wait':
                if (uk) noteSustainEvent(live[uk], e);
                break;
              case 'cast':
                if (uk) {
                  noteSustainEvent(live[uk], e);
                  const h = byKey[uk]; h.casts[e.ability] = (h.casts[e.ability] || 0) + 1; h.castGold += e.gold || 0;
                  /* the mana each spell KEPT (the cast's `mana`, net of a refund or mana back) and what came back (`back`, the Storm spells) */
                  h.castMana[e.ability] = (h.castMana[e.ability] || 0) + (e.mana || 0);
                  if (e.back > 0) h.castBack[e.ability] = (h.castBack[e.ability] || 0) + e.back;
                }
                break;
              case 'shot':
                if (uk && e.mana) byKey[uk].manaShots++;
                break;
              case 'rare_roll':
                P.rareRolls++; if (unitKey[e.u]) P.rareWins[unitKey[e.u]] = (P.rareWins[unitKey[e.u]] || 0) + 1;
                break;
              default: break;
            }
          }
          /* THE SUSTAIN COUNTERS, the engine's own (sustain-reads.mjs: the tally with each hero's HP anchors, and short of mana at a death) */
          readSustainWindow(TALLY, out, { heroes: H, byKey, live, unitKey, winFrom });
          /* REGENERATION has no event: each hero's rate this window is what makes its blows and heals end on the
             engine's own HP at the window's end (spread evenly over the window, never past max). Pass one finds it. */
          const winTo = Number.isInteger(out.settledTo) ? out.settledTo : winFrom + windowOf(cell);
          const endHp = {};
          for (const p of out.members) {
            const d = p.delta || {}, hu = p.hunt || {};
            for (const dl of (p.summary && p.summary.deathLog) || []) hp.push([dl.atMs || winTo, p.key, -Infinity]);
            if (Number.isInteger(d.hp) && !hu.ended) endHp[p.key] = d.hp;
          }
          hp.sort((a, b) => a[0] - b[0]);
          for (const h of H) {
            const x = live[h.key];
            x.rate = 0; x.at = winFrom;
            if (x.cur === null || x.max === null || endHp[h.key] === undefined) continue;
            let c = x.cur;
            for (const [, k, n] of hp) if (k === h.key) c = Math.min(x.max, c + n);
            const gap = endHp[h.key] - c;
            if (gap > 0 && winTo > winFrom) { x.rate = gap / (winTo - winFrom); h.regen += gap; }
          }
          /* pass two: the HP each hero stood at through the window (and the time it stood under UNDER_SHARES: stats.mjs underInto, never
             after a death; capped below at the hunted time the window paid) */
          const step = (x, at) => {
            if (at > x.at && !x.dead) underInto(x.under || (x.under = {}), x.cur, x.rate, x.max, at - x.at);
            if (x.rate > 0 && at > x.at) x.cur = Math.min(x.max, x.cur + x.rate * (at - x.at)); x.at = Math.max(x.at, at);
          };
          for (const [at, k, n] of hp) {
            if (k === 'floor') { floorNow = n + 1; continue; }
            if (k === null) {
              for (const h of H) { const x = live[h.key]; if (x.unit !== null && x.cur !== null && !x.done) { step(x, at); close(h, x); open(x); } }
              continue;
            }
            const x = live[k];
            if (x.cur === null) continue;
            step(x, at);
            if (n === -Infinity) { x.cur = 0; x.dead = true; lower(x, at); continue; }
            if (n < 0) { x.cur += n; x.recent.push([at, -n]); if (x.recent.length > 64) x.recent.splice(0, 32); lower(x, at); }
            else x.cur = Math.min(x.max, x.cur + n);
          }
          winFrom = winTo;
          for (const p of out.members) {
            const h = byKey[p.key], x = live[p.key], d = p.delta || {}, hu = p.hunt || {};
            h.hours += (hu.paid_ms || 0) / 3600000;
            h.levelXp += d.level_xp || 0;
            /* cell.trace: Level XP and paid hours so far on the hunt's clock (v1-climb.mjs --pay-from reads pay from a held start) */
            if (cell.trace) (h.xpTrace || (h.xpTrace = [])).push([winFrom - T0, h.levelXp, h.hours]);
            for (const [k, n] of Object.entries(d.xp || {})) h.skillXp[k] = (h.skillXp[k] || 0) + n;
            h.coin += d.gold || 0;
            for (const [id, n] of Object.entries(d.items || {})) {
              const b = band[id] || 'other';
              h.loot[b in h.loot ? b : 'other'] += n * vendor(id); h.lootN += n;
              /* worn gear by slot and weight (the ruling's "a piece an hour per slot per weight"), any band */
              const it = ITEMS[id];
              if (it && it.type === 'armor' && it.armourClass) h.gear[it.slot + ':' + it.armourClass] = (h.gear[it.slot + ':' + it.armourClass] || 0) + n;
            }
            for (const rd of (hu.hints && hu.hints.rare_drop) || []) h.rareItems.push(rd.item);
            for (const [id, n] of Object.entries(hu.buys || {})) { h.buys[id] = (h.buys[id] || 0) + n; h.store += n * ((basics[id] || {}).price || 0); }
            for (const [id, n] of Object.entries(hu.uses || {})) h.uses[id] = (h.uses[id] || 0) + n;
            for (const dl of (p.summary && p.summary.deathLog) || []) {
              h.deaths++; h.killers[dl.monster] = (h.killers[dl.monster] || 0) + 1;
              const lost = (dl.xpLost && dl.xpLost.level) || 0;
              h.xpLostLevel += lost; h.deathLevelXpLost.push(lost);
              /* the held Blessings cut this death's loss and are used up; the hero buys them again for its next hunt */
              h.xpLostLevelBlessed += lost * blessedShare; h.blessingGold += blessingsPrice(h.level);
              for (const [k, n] of Object.entries(dl.xpLost || {})) if (k !== 'level') h.xpLostSkill[k] = (h.xpLostSkill[k] || 0) + n;
            }
            if (hu.ended) h.ended[hu.ended.reason] = (h.ended[hu.ended.reason] || 0) + 1;
            /* a run's ended hero is settled no more (dropEnded): it opens no later floor's encounter */
            if (hu.ended && run) x.done = true;
            /* the window's tail (the last HP move to its end) under UNDER_SHARES, then its time under, never more than it hunted */
            if (x.cur !== null && !x.dead && winTo > x.at) underInto(x.under || (x.under = {}), x.cur, x.rate, x.max, winTo - x.at);
            for (const k of Object.keys(h.under)) h.under[k] += Math.min((x.under && x.under[k]) || 0, hu.paid_ms || 0);
            x.under = {};
            /* the engine's HP at the window's end: the anchor for the next window */
            if (Number.isInteger(d.hp) && !hu.ended) { x.cur = d.hp; if (x.enc) x.enc.min = Math.min(x.enc.min, x.cur); }
          }
        };
        const opts = {
          spanMs: span, secret: secretOf((cell.seedBase || 0) + seed, seg), windowMs: windowOf(cell), onWindow,
          equipment: (role, i) => kits[i],
          /* `startBar`: the bar a hero who never touched it plays: START_BAR as shipped (Salted Shrimp, Thin Turnip Juice), not the ground's guide food */
          /* `slotsByRole` { role: [slot] }: a stored ability lane for that role beside the cell's consumables (the bar a
             player set: a deeper store rune, another trigger), so the role's defaults (rule-subjects.js ROLE_RULES) stand aside */
          bar: seats ? (role, i) => (seats[i].bar ? JSON.parse(JSON.stringify(seats[i].bar)) : asPlayed ? playedBarFor(role, i) : barFor(cell.ground, cell.bar || {})) : cell.startBar ? () => JSON.parse(JSON.stringify(START_BAR)) : cell.bar || cell.slotsByRole
            ? (role) => barFor(cell.ground, cell.bar || {}).concat(JSON.parse(JSON.stringify((cell.slotsByRole && cell.slotsByRole[role]) || []))) : asPlayed ? playedBarFor : undefined,
          bag: seats ? (role, i) => (seats[i].bag ? JSON.parse(JSON.stringify(seats[i].bag)) : asPlayed ? playedBagFor(role, i) : bagFor(cell.ground, cell.supply || 'store', kits[i], null)) : asPlayed ? playedBagFor : (role, i) => bagFor(cell.ground, cell.supply || 'store', kits[i], cell.bagByRole && cell.bagByRole[role]),
          buffs: engineBuffs.length ? () => buffRows(engineBuffs, span / 3600000) : undefined,
          /* a Level XP row (the sitting's S-4: a clan room's standing bonus) is no engine buff type: it rides m.perks.levelXpPm, the seam the
             scratch hook patches/level-xp-hook.json reads (a tree without it plays it as nothing) */
          ...(levelXpPm ? { levelXpPm } : {}),
          start: cell.skillsBySeat || cell.startBySeat ? startFor : undefined,
          /* the box "Leave if anyone leaves the hunt or dies": 'real' follows 27-1 as amended (own heroes: OFF unless the cell sets
             `endTogether`); the legacy rule kept the old default (ON for a party unless `leaveTogether: false`) */
          leaveTogether: real ? party.length > 1 && cell.endTogether === true : party.length > 1 && cell.leaveTogether !== false,
          ...(real ? { dropEnded: true } : {}),
          /* a stamina bar that binds (`staminaH`: the hours it holds at the start) and a purse that binds (`purse`: gold at the start) */
          ...(sessionOf(cell) ? { session: () => sessionOf(cell) } : {}),
          ...(Number.isFinite(cell.purse) ? { gold: Math.max(0, Math.round(cell.purse)) } : {}),
          options: seats ? (role, i) => ({ ...(seats[i].options || (asPlayed ? PLAYED_OPTIONS[role] : {})), ...(cell.options && !Array.isArray(cell.options) ? cell.options : {}) })
            : asPlayed ? (role, i) => ({ ...PLAYED_OPTIONS[role], ...(Array.isArray(cell.options) ? cell.options[i] : cell.options || {}) })
              : cell.options ? (role, i) => (Array.isArray(cell.options) ? cell.options[i] : cell.options) : undefined,
        };
        if (!opts.bar) delete opts.bar;
        if (!opts.start) delete opts.start;
        if (!opts.options) delete opts.options;
        if (Number.isInteger(cell.density)) opts.density = cell.density;
        if (cell.temper) opts.temper = cell.temper;
        /* cell.holdLevel: the heroes stay at their starting Level and skills (play-ground.mjs opts.holdLevel; a Danger band's companies) */
        if (cell.holdLevel === true) opts.holdLevel = true;
        /* cell.talentsBySeat [{ force, footing, grit, reserve } | null]: each seat's Talents (tools/balance-program/talents.mjs), on m.perks.talents */
        if (Array.isArray(cell.talentsBySeat)) opts.talents = (role, i) => cell.talentsBySeat[i] || null;
        /* cell.roadsBySeat [{ nodeId: value } | null]: each seat's Roads build (src/core/talents.js; tools/balance-program/redesign/roads/
           alloc-run.mjs), handed to heroSetup as the settle hands hr_talents_view's nodes (play-ground.mjs opts.roads) */
        if (Array.isArray(cell.roadsBySeat)) opts.roads = (role, i) => cell.roadsBySeat[i] || null;
        /* cell.borrowedBySeat [[ability id] | null]: each seat's own borrow list (heroSetup `borrowed`: the native row on the native weapon's
           blow, no penalty; lane/roads-borrow-values measures a town move's V0 on it), handed as play-ground.mjs opts.borrowed */
        if (Array.isArray(cell.borrowedBySeat)) opts.borrowed = (role, i) => cell.borrowedBySeat[i] || null;
        /* cell.traitsBySeat [[{ id, rank }] | null]: the Traits each seat's pieces carry (tools/balance-program/trait-kits.mjs; the engine plays them,
           src/core/hunt/trait-rules.js, dark in the game), handed as play-ground.mjs opts.traits */
        if (Array.isArray(cell.traitsBySeat)) opts.traits = (role, i) => cell.traitsBySeat[i] || null;
        /* cell.signatureBySeat [Signature id | null]: the Signature each seat plays (src/data/signatures.js; the engine plays it,
           src/core/hunt/signature-rules.js, dark in the game), handed as play-ground.mjs opts.signature */
        if (Array.isArray(cell.signatureBySeat)) opts.signature = (role, i) => cell.signatureBySeat[i] || null;
        /* a what-if on the ground's own row (respawnMs, pockets ...): a copy, never the frozen table */
        if (cell.groundPatch) opts.ground = { ...ground, ...cell.groundPatch };
        if (run) Object.assign(opts, { ground: opts.ground || ground, sessionMode: ground.mode, tower: { floor: run.floor }, dropEnded: true });
        /* cell.resolveOnly: the seats this runner would field, played by nobody (resolvedOf): Balance Lab v3 plays the same seats in the browser */
        if (cell.resolveOnly) return resolvedOf(cell, party, roles, levels, kits, opts);
        const res = play.run(cell.ground, levels.length > 1 ? levels : levels[0], roles, opts);
        for (const h of H) close(h, live[h.key]);
        /* book the time hunted, never more (F-framework-audit section 5: a hunt that ended in its first seconds booked a full minute);
           the legacy loop still steps its budget by at least a minute so a hero that dies at once cannot loop forever */
        P.hours += res.playedMs / 3600000; P.segments++;
        left -= real ? left : Math.max(res.playedMs, 60000); seg++;
        if (run) break;
      }
    }
    return summarise(cell, H, P, ground);
  }

  /* A CELL'S SEATS, RESOLVED (cell.resolveOnly; tools/balance-lab lab-core.mjs `cell.resolved` plays them): each seat's worn set, bar, bag,
     hunt options and start (Level XP and skill XP), the pull, the rungs, the leave rule, the settle's cut, and every staged row a seat wears
     (gear.mjs registers those into ITEMS; the browser's bundle registers the same rows). Plain JSON; nothing is played. */
  function resolvedOf(cell, party, roles, levels, kits, opts) {
    const clone = (x) => (x === undefined ? null : JSON.parse(JSON.stringify(x)));
    const seat = (f) => (typeof f === 'function' ? roles.map((r, i) => clone(f(r, i, levels[i]))) : null);
    const staged = {};
    for (const k of kits) for (const id of Object.values(k)) if (id && gear.staged && gear.staged.has(id) && ITEMS[id]) staged[id] = clone(ITEMS[id]);
    return { ground: cell.ground, styles: [...party], roles: [...roles], levels: [...levels], equipment: kits.map((k) => ({ ...k })), bar: seat(opts.bar), bag: seat(opts.bag),
      options: seat(opts.options), start: seat(opts.start), density: Number.isInteger(opts.density) ? opts.density : null, temper: clone(opts.temper) || null,
      leaveTogether: !!opts.leaveTogether, windowMs: opts.windowMs, segmentH: cell.segmentH || 2, staged,
      /* the death rule, Blessings, the timed buffs (server rows), the purse and the stamina bar (cell.mjs header) */
      talents: Array.isArray(cell.talentsBySeat) ? clone(cell.talentsBySeat) : null,
      deathRule: cell.deathRule || 'reenter', dropEnded: opts.dropEnded === true, blessings: Number.isInteger(cell.blessings) ? cell.blessings : 0,
      buffs: opts.buffs ? opts.buffs() : null, levelXpPm: opts.levelXpPm || 0, blessedShare: Number.isFinite(cell.blessedShare) ? cell.blessedShare : null, gold: Number.isInteger(opts.gold) ? opts.gold : null, session: opts.session ? opts.session() : null };
  }

  /* THE CELL'S METRICS (the ruling's §11 list), per hero and per party, compact enough to keep thousands of cells. */
  function summarise(cell, H, P, ground) {
    const hunt = HUNT_INDEX[ground.hunt] || {};
    const heroes = H.map((h) => {
      const hr = h.hours || 1e-9, per = (n) => round(n / hr, 0);
      const income = h.coin + h.loot.common + h.loot.uncommon + h.loot.scarce + h.loot.other;
      const rares = h.loot.rare + h.loot.trophy;
      const swings = h.blowsLanded + h.blowsMissed;
      const healTotal = h.healIn.food + h.healIn.self + h.healIn.ally;
      const lostMean = h.deaths ? h.xpLostLevel / h.deaths : null;
      const xph = h.levelXp / hr;
      const deaths = rateCI(h.deaths, h.hours, 1000);
      const closeCalls = rateCI(h.close, h.hours, 12);
      const minMed = quantile(h.enc, 0.5);
      return {
        key: h.key, style: h.style, level: h.level, kit: h.kit, maxHp: h.vit.maxHp, maxMana: h.vit.maxMana, mit: h.mit, toHit: h.toHit || null,
        hours: round(h.hours, 2),
        levelXpPerH: round(xph, 0), skillXpPerH: Object.fromEntries(Object.entries(h.skillXp).map(([k, n]) => [k, per(n)])),
        coinPerH: per(h.coin), lootPerH: Object.fromEntries(Object.entries(h.loot).map(([k, n]) => [k, per(n)])),
        incomePerH: per(income), raresPerH: per(rares), storePerH: per(h.store), profitPerH: per(income - h.store),
        netWithRaresPerH: per(income + rares - h.store), margin: h.store > 0 ? round(income / h.store - 1, 3) : null,
        buysPerH: Object.fromEntries(Object.entries(h.buys).map(([k, n]) => [k, round(n / hr, 1)])),
        gearPerH: Object.fromEntries(Object.entries(h.gear).map(([k, n]) => [k, round(n / hr, 2)])),
        rareItems: h.rareItems.length, rareEveryH: h.rareItems.length ? round(h.hours / h.rareItems.length, 1) : null,
        deaths: h.deaths, deathsPer1000h: deaths, killers: h.killers,
        levelXpLostPerDeath: round(lostMean, 0), deathCostHours: lostMean !== null && xph > 0 ? round(lostMean / xph, 2) : null,
        /* THE DEATH RULE'S READS: the hours the seeds offered, the share of them hunted, the hours lost after a hunt ended early, deaths a
           hunted hero-hour, and Level XP after deaths (the Blessings' cut applied) a hero-hour of the time offered */
        wallHours: round(h.wallHours, 2), huntedShare: h.wallHours > 0 ? round(h.hours / h.wallHours, 4) : null, lostHours: round(Math.max(0, h.wallHours - h.hours), 3),
        deathsPerHeroH: h.hours > 0 ? round(h.deaths / h.hours, 4) : null, sessionsEndedEarly: Object.values(h.ended).reduce((a, n) => a + n, 0),
        xpAfterDeathsPerWallH: h.wallHours > 0 ? round((h.levelXp - h.xpLostLevelBlessed) / h.wallHours, 0) : null, blessingGoldPerH: per(h.blessingGold),
        dealtPerH: per(h.dealt), dps: round(h.dealt / (hr * 3600), 2), dealtBy: h.dealtBy,
        takenPerH: per(h.taken), takenBy: Object.fromEntries(Object.entries(h.takenBy).sort((a, b) => b[1] - a[1]).slice(0, 6)),
        /* the monsters' spells that struck this hero: { spell id: { hits, dmg } } over the cell (dodged ones are not hits) */
        spellsIn: h.spellsIn,
        monsterSwingsPerH: per(swings), landedPct: swings ? round((100 * h.blowsLanded) / swings, 1) : null,
        dodgedPct: swings ? round((100 * h.dodged) / swings, 1) : null, dmgPerMonsterSwing: swings ? round(h.taken / swings, 3) : null,
        healInPerH: { food: per(h.healIn.food), self: per(h.healIn.self), ally: per(h.healIn.ally), total: per(healTotal) },
        healOutPerH: per(h.healOut), shieldInPerH: per(h.shieldIn), sustainRatio: h.taken ? round(healTotal / h.taken, 3) : null,
        eatsPerH: { own: round(h.eats.own / hr, 1), store: round(h.eats.store / hr, 1) },
        drinksPerH: { own: round(h.drinks.own / hr, 1), store: round(h.drinks.store / hr, 1) },
        castsPerH: Object.fromEntries(Object.entries(h.casts).map(([k, n]) => [k, round(n / hr, 1)])), manaShotsPerH: round(h.manaShots / hr, 1),
        castManaPerH: Object.fromEntries(Object.entries(h.castMana).map(([k, n]) => [k, per(n)])),
        manaBackPerH: Object.fromEntries(Object.entries(h.castBack).map(([k, n]) => [k, per(n)])),
        encounters: h.enc.length, encMinHpPct: { p50: minMed, p10: quantile(h.enc, 0.1), p01: quantile(h.enc, 0.01) },
        closeCallsPer12h: closeCalls, dipsUnder40Per12h: rateCI(h.dips, h.hours, 12),
        ttdAtCloseS: quantile(h.ttdClose.filter(Number.isFinite), 0.5),
        band: bandOfCell(minMed, deaths.rate), ended: h.ended,
        /* the raw totals a career run carries into its next chunk (gains, and what deaths took back) */
        ...(h.xpTrace ? { xpTrace: h.xpTrace } : {}),
        raw: { levelXp: h.levelXp, skillXp: h.skillXp, xpLostLevel: h.xpLostLevel, xpLostSkill: h.xpLostSkill, coin: h.coin,
          income, store: h.store, rares, wallHours: h.wallHours, xpLostLevelBlessed: h.xpLostLevelBlessed, blessingGold: h.blessingGold },
        /* a run's encounters, each its floor and its low HP % (0: the hero fell there) */
        ...(P.tower ? { towerEnc: h.towerEnc } : {}),
        /* THE BALANCE MATRIX'S READS (tools/balance-program/balance-matrix.mjs; 40-formula-brief section 6): the HP regained with no event
           (regeneration), the share of hunted time under 30% and 10% of max HP, and the damage dealt to each kind of monster */
        regenPerH: per(h.regen), hpUnder: Object.fromEntries(Object.entries(h.under).map(([k, ms]) => [k, round(ms / (hr * 3600000), 4)])),
        dealtToPerH: Object.fromEntries(Object.entries(h.dealtTo).map(([k, n]) => [k, per(n)])),
        /* THE SUSTAIN COUNTERS (Balance Lab phase 2; tools/balance-program/readers.mjs reads them): the engine's tally block as TOTALS over the
           cell (so seeds add), the hunted hours whose regeneration could not be closed, the party deaths this hero was short of mana at
           (by the waiting rule's action), and the close calls (encounters under 25% HP) as a count */
        sustain: sustainSummary(h, h.close, h.enc.length),
        /* THE WORN TRAITS' HOLDS (cell.traitsBySeat): the events of each channel (its blows, the blows at it, its heals) and, by
           'channel:traitId', how many of them each Trait held on, as totals over the cell (so seeds add): the census trait-kits.mjs reads */
        ...(Array.isArray(cell.traitsBySeat) ? { traits: { worn: cell.traitsBySeat[H.indexOf(h)] || [], events: { offense: h.tr.offense, defense: h.tr.defense, heal: h.tr.heal }, held: h.tr.held } } : {}),
      };
    });
    const hours = P.hours || 1e-9;
    const wins = heroes.map((h) => P.rareWins[h.key] || 0);
    return {
      id: cell.id, cell, ground: cell.ground, hunt: { band: hunt.band || null, groupFit: ground.groupFit || null },
      party: { size: heroes.length, hours: round(P.hours, 2), segments: P.segments, killsPerH: round(P.kills / hours, 0),
        /* kills an hour by monster (Tamsin's counts: tally-tasks.js "a count is about an hour at the ground's floor") */
        killsByPerH: Object.fromEntries(Object.entries(P.killsBy).map(([k, n]) => [k, round(n / hours, 1)])),
        pullsPerH: round(P.pulls / hours, 1), ttkS: { p50: msS(quantile(P.ttk, 0.5)), p90: msS(quantile(P.ttk, 0.9)) },
        rareRolls: P.rareRolls, rareWins: P.rareWins, rareGini: gini(wins),
        levelXpPerHeroPerH: round(heroes.reduce((s, h) => s + (h.levelXpPerH || 0), 0) / heroes.length, 0),
        createdPerH: round(heroes.reduce((s, h) => s + h.incomePerH + h.raresPerH, 0), 0),
        destroyedPerH: round(heroes.reduce((s, h) => s + h.storePerH, 0), 0),
        ...(P.tower ? { tower: P.tower } : {}),
        /* the Danger scale's pull log (absent off the scale) */
        ...(P.danger ? { danger: P.danger } : {}),
        /* time to kill by monster kind: [ms summed, kills timed] (seeds merge by adding) */
        ttkBy: P.ttkBy },
      heroes,
    };
  }
  const msS = (ms) => (ms === null ? null : round(ms / 1000, 1));

  /* THE ARMOR RUNGS (balance ruling 2026-10-25 §9, "3-5% less actual incoming damage, same level, enemy, other items and settings"): exact, no dice. The damage reaching HP per monster swing aimed at a hero, over a
     ground's as-built spawn mix, through the engine's own to-hit, blow and armor functions; each piece moved one tier from a full set of the rung below, then the whole set. Rows: { line, from, to, ground, pieces { slot: % }, mean, set }. */
  function armorRungs() {
    const SLOTS = ['body', 'pants', 'helmet', 'boots', 'gloves', 'belt'];
    /* EACH RUNG ON ITS UPPER TIER'S GROUNDS (12-targets 8.4, the designer 2026-11-26): iron is first worn at Level 10 (made, Wickstead and the Sewer) and
       drops on the Glade; steel drops on the Warrens, the Ford and the Slake. The Glade drops no steel, and a steel piece there meets monsters iron already
       answers (the chain is P / (P + k x the attacker's Level), so armor a tier over its ground saturates by design) */
    const RUNGS = [[0, 1, ['wickstead', 'millrace_sewer', 'mosslight_glade']], [1, 2, ['coppercap_warrens', 'hasks_ford', 'the_slake']]];
    const worn = (line, tier) => Object.fromEntries(SLOTS.map((s) => [s, gear.ladder[line + ':' + s][tier]]));
    const perSwing = (kit, gid) => {
      const mix = new Map();
      for (const p of G.HUNT_GROUNDS[gid].pockets) for (const s of p.spawns || []) mix.set(s.monster, (mix.get(s.monster) || 0) + 1);
      const values = MIT.armourValues(kit, ITEMS), floor = HUNT_INDEX[G.HUNT_GROUNDS[gid].hunt].band[0];
      let sum = 0, n = 0;
      for (const [id, k] of mix) {
        const row = MONSTERS[id], max = CORE_COMBAT.monsterMaxHit(row), prof = MIT.mitigationOf(values, monsterLevelOf(row));
        let blow = 0;
        for (let b = 1; b <= max; b++) blow += MIT.mitigate(b, 1000, prof);
        sum += k * CORE_COMBAT.monsterAccuracy(row, floor) * (1 - prof.dodgePm / 1000) * (blow / max);
        n += k;
      }
      return sum / n;
    };
    const out = [];
    for (const line of ['plate', 'leather', 'cloth']) for (const [lo, hi, grounds] of RUNGS) for (const gid of grounds) {
      const base = perSwing(worn(line, lo), gid), cut = (kit) => Math.round(1000 * (1 - perSwing(kit, gid) / base)) / 10;
      const pieces = Object.fromEntries(SLOTS.map((s) => [s, cut({ ...worn(line, lo), [s]: gear.ladder[line + ':' + s][hi] })]));
      out.push({ line, from: lo + 1, to: hi + 1, ground: gid, pieces, mean: Math.round((10 * SLOTS.reduce((a, s) => a + pieces[s], 0)) / SLOTS.length) / 10, set: cut(worn(line, hi)) });
    }
    return out;
  }

  /* the tiers (src/data/hunt-tiers.js): a career on a party's tier reads each ground's own row (career.mjs job.tier) */
  const tiers = await import(u('src/data/hunt-tiers.js'));
  return { runCell, armorRungs, STYLES, gear, XP, COMBAT_SKILLS, tiers };
}

/* THE RULING'S DIFFICULTY BANDS (§3): a cell's band by its typical encounter minimum HP and by its deaths per
   1,000 h. 'normal' needs both (minimum 60-80% and at most 1 death per 1,000 h); a cell whose two readings
   disagree says so ('easy|normal'). */
export const BANDS = Object.freeze([
  Object.freeze({ id: 'easy', minHp: [80, 100], deaths: [0, 0.1] }),
  Object.freeze({ id: 'normal', minHp: [60, 80], deaths: [0, 1] }),
  Object.freeze({ id: 'hard', minHp: [35, 60], deaths: [10, 30] }),
  Object.freeze({ id: 'extreme', minHp: [15, 40], deaths: [50, 100] }),
]);
function bandOfCell(minHp, deathRate) {
  const byHp = minHp === null ? null : (BANDS.find((b) => minHp >= b.minHp[0]) || { id: 'lethal' }).id;
  const d = deathRate === null ? null : deathRate;
  const byDeath = d === null ? null : d <= 0.1 ? 'easy' : d <= 1 ? 'normal' : d <= 30 ? 'hard' : d <= 100 ? 'extreme' : 'lethal';
  return byHp === byDeath ? byHp : byHp + '|' + byDeath;
}
