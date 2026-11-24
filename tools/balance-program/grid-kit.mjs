// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/grid-kit.mjs — THE KIT BUILDER (balance program 50-standards.md section 1.4 and 5.2, builder 1).
//
//   const K = await loadKits(root);
//   K.kitFor(level, state, style, { ground, mainSkill })   -> a PLAN: what each slot wears and why, the cell's gear options, the
//                                                            Tempering rungs, the skill offset, a what-if (projected rows), the sources
//                                                            that are ruled but not built
//   K.kitCost(plan)                                       -> the gold of a plan's pieces and rungs (Shop price, else book value)
//   await K.traitPlans(kind, plans, { rates, taken })     -> the Traits each plan's pieces carry, for a party (Rare and Very Rare kits:
//                                                            tools/balance-program/trait-kits.mjs lucky | theory | census:<k>), on plan.traits
//
// EVERY KIT IS A RULE ON THE GAME'S DATA. Nobody types a kit: the three states of standards.mjs GEAR_STATES are applied to src/data through
// tools/balance-sim/gear.mjs kitOf (the ladder, the reachable sources, the staged uniques, the Hearth Chest's pieces), the accessory rule
// below (jewelry.js grades, reachable sources), src/data/temper.js (which ladder a worn piece reads, open or shut) and, past Level 185,
// the projected line (grid-project.mjs). A state that cannot be built from data throws: it fails loudly.
//
//   LOW   under 15 the start kit (gear.mjs `starter`). On the ladder (to 88) every slot one tier under (tierOffset -1, only 'all'). Past it,
//         the previous band's MID set (the day the hero walks into a new band having bought nothing). No jewelry or cloak, no rungs, the
//         store's basic ammo (the Bronze Arrow; no whetstone: the store sells none), skills 8 under the career line from 30, sliding from 0 at 10.
//   MID   the ladder piece of the Level's tier in every slot; from 110 (past tier 7) the best ground or boss drop (uniques, never a chest
//         piece). Jewelry and cloak: the plain piece of the highest tier the Level can wear and get. Rung 2 of 5 on both tracks of every open
//         ladder it wears. The Level's ammo (gear.mjs accessories: the best its skill may spend). Skills on the career line.
//   BIS   the best wearable piece from any source at or under the Level (uniques and the Hearth Chest's). Jewelry: highest tier, then the
//         highest grade (Hallmarked, Fine, plain) whose plain piece can be got, then the larger perk pair. Rung 5 of 5 on every open ladder.
//         Skills 10 over the line on the main skill and Defense. Linings, perks on 12 seats, worn in, jewelry tiers 4 to 7, Necrotic and
//         Storm, faction skills: ruled, not built in the engine, listed in `projectedAdds` with their ruled budget, never played.
//   PROJECTED (past 185) the state's set at 185 with its weapon and armor moved to the projected line: MID and BIS the band's, LOW one back.
//
// Unique Tempering bands (temper.js TEMPER_UNIQUE_BANDS) are shut, so a unique or projected piece takes no rung; the plan says so.
// The sibling lane's sources and paths (tools/balance-program/sources.mjs, paths.mjs) read kitFor and kitCost: keep them pure of the grid.
// ════════════════════════════════════════════════════════════════════════
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { sourceQuery } from '../lib/version-stamp.mjs';
import { GEAR_STATES, POWER_SOURCES, stretchOf } from './standards.mjs';
import { PROJECTED, projectedBand, lineKit } from './grid-project.mjs';
import { loadTraitKits } from './trait-kits.mjs';

export const ARMOR_SLOTS = Object.freeze(['helmet', 'body', 'pants', 'boots', 'gloves', 'belt']);
export const JEWEL_SLOTS = Object.freeze({ ring1: 'ring', ring2: 'ring', earrings: 'earrings', necklace: 'necklace', cape: 'cape' });
const MAIN_FIELDS = Object.freeze({ ranger: ['rangeAtkB', 'rangeStrB'], mage: ['magicAtkB', 'magicStrB'], healer: ['magicAtkB', 'magicStrB'] });
const GRADE = Object.freeze({ hallmarked: 2, fine: 1 });
/* the rungs each state holds on an OPEN ladder (50-standards 1.4: standards.mjs GEAR_STATES[state].temper.blows) */
const rungsOfState = (states, state) => Number((states[state].temper || {}).blows) || 0;
/** The career-line offset of the main skill and Defense: GEAR_STATES[state].skills (LOW slides from 0 at its zero Level to full at its full Level). */
export function skillDeltaOf(state, level, states = GEAR_STATES) {
  const s = states[state].skills || {};
  if (!Number.isFinite(s.vsCareerLine) || s.vsCareerLine === 0) return 0;
  if (!Number.isFinite(s.fullFromLevel)) return s.vsCareerLine;
  return Math.round(s.vsCareerLine * Math.min(1, Math.max(0, (level - s.zeroAtLevel) / (s.fullFromLevel - s.zeroAtLevel))));
}

/** opts.states: the gear-state rules to apply (standards.mjs GEAR_STATES by default; --selftest plants a changed rule and watches the kits move). */
export async function loadKits(root, opts = {}) {
  const STATES = opts.states || GEAR_STATES;
  const RUNGS = Object.fromEntries(Object.keys(STATES).map((k) => [k, rungsOfState(STATES, k)]));
  const u = (p) => pathToFileURL(join(root, p)).href;
  const v = sourceQuery(root);
  const { loadGear, STYLES } = await import(u('tools/balance-sim/gear.mjs'));
  const gear = await loadGear(root);
  const ITEMS = gear.ITEMS;
  const T = await import(u('src/data/temper.js') + v);
  const GT = await import(u('src/data/gear-tiers.js') + v);
  const G = await import(u('src/data/hunt-grounds.js') + v);
  const { HUNT_INDEX } = await import(u('src/data/hunts.js') + v);
  const { SHOP_OFFERS } = await import(u('src/data/shops.js') + v);
  /* the Shop's gold price of an item it sells one at a time (shops.js SHOP_OFFERS) */
  const SHOP_PRICE = new Map();
  for (const o of SHOP_OFFERS) {
    const g = (o.cost || []).find((c) => c.kind === 'currency' && c.id === 'gold'), it = (o.grant || []).find((x) => x.kind === 'item' && x.amount === 1);
    if (g && it && (o.cost || []).length === 1 && !SHOP_PRICE.has(it.id)) SHOP_PRICE.set(it.id, g.amount);
  }
  const WL = await import(u('tools/balance-sim/staged/weapon-line.js'));
  const AL = await import(u('tools/balance-sim/staged/armor-line.js'));
  const LINES = { WEAPON_LINE_BASE: WL.WEAPON_LINE_BASE, lineWeapon: WL.lineWeapon, LINE_BASE: AL.LINE_BASE, lineArmor: AL.lineArmor };
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const floorOf = (g) => HUNT_INDEX[G.HUNT_GROUNDS[g].hunt].band[0];
  /* the staged grounds (built, hidden), by floor: a hero past a floor has been sent there, so its drops are reachable */
  const STAGED = Object.keys(G.HUNT_GROUNDS).filter((g) => !own(G.OPEN_GROUNDS, g)).sort((a, b) => floorOf(a) - floorOf(b));
  const stagedUpTo = (L) => STAGED.filter((g) => floorOf(g) <= L);
  /* THE GEAR BANDS: the ladder's tiers (gear-tiers.js MATERIAL_TIERS), the unique bands (temper.js TEMPER_UNIQUE_BANDS), the projected ones */
  const LADDER_BANDS = GT.MATERIAL_TIERS.map((t) => t.level).sort((a, b) => a - b);
  const UNIQUE_BANDS = Object.keys(T.TEMPER_UNIQUE_BANDS).map(Number).sort((a, b) => a - b);
  const LADDER_TOP = LADDER_BANDS[LADDER_BANDS.length - 1];
  const UNIQUE_FROM = T.TEMPER_UNIQUE_FROM;
  const projectedStarts = [];
  for (let b = PROJECTED.from; b <= 400; b += PROJECTED.bandEvery) projectedStarts.push(b);
  const BANDS = [...new Set([...LADDER_BANDS, ...UNIQUE_BANDS, ...projectedStarts])].sort((a, b) => a - b);
  const bandOf = (L) => BANDS.filter((b) => b <= L).pop() || 1;
  const bandBefore = (L) => { const i = BANDS.indexOf(bandOf(L)); return i > 0 ? BANDS[i - 1] : BANDS[0]; };
  const bandAfter = (L) => BANDS.find((b) => b > L) || null;
  const tierOf = (id) => (ITEMS[id] && Number(ITEMS[id].tier)) || 1;
  const lvOf = (id) => (ITEMS[id] && Number(ITEMS[id].reqLv)) || 1;

  /* THE ACCESSORY RULE. MID: the plain piece of the highest tier. BIS: highest tier, then grade, then the perk pair. Then the way's own
     attack numbers and steadiness (gear.mjs accessories' own score), then the id: a total order. */
  const scoreFor = (style) => {
    const main = MAIN_FIELDS[STYLES[style].role] || ['atkB', 'strB'];
    return (it) => main.reduce((s, k) => s + (it[k] || 0), 0) * 1000 + (it.steadyPm || 0);
  };
  const perkSum = (it) => Object.values(it.jewelPerks || {}).reduce((a, b) => a + b, 0);
  function accessory(slot, L, style, state, reach, exclude = null) {
    const score = scoreFor(style);
    const ok = (id) => {
      const it = ITEMS[id];
      if (!it || it.slot !== slot || lvOf(id) > L || (exclude && exclude.includes(id))) return false;
      if (it.jewelGrade) return state === 'bis' && !!it.jewelBase && reach.has(it.jewelBase);
      return reach.has(id);
    };
    const ids = Object.keys(ITEMS).filter(ok);
    ids.sort((a, b) => tierOf(b) - tierOf(a) || (GRADE[ITEMS[b].jewelGrade] || 0) - (GRADE[ITEMS[a].jewelGrade] || 0)
      || perkSum(ITEMS[b]) - perkSum(ITEMS[a]) || score(ITEMS[b]) - score(ITEMS[a]) || (a < b ? -1 : a > b ? 1 : 0));
    return ids[0] || null;
  }

  /* the slots a set may hold, so `also` names every one (a slot the plan leaves empty is null: gear.mjs deletes it) */
  const SLOTS = ['weapon', 'shield', ...ARMOR_SLOTS, ...Object.keys(JEWEL_SLOTS), 'ammo'];
  /** The open-ladder rungs a set takes: { 'temper:<track>:<tier>': rung } and the shut pieces it names. */
  function rungsOf(set, rung) {
    const out = {}, shut = [];
    if (!rung) return { temper: null, shut };
    for (const [slot, id] of Object.entries(set)) {
      if (!id || !ITEMS[id] || slot === 'ammo' || own(JEWEL_SLOTS, slot)) continue;
      const t = T.temperTierOf(ITEMS[id]);
      const track = slot === 'weapon' ? 'blows' : 'armor';
      if (own(T.TEMPER_TIERS, t)) out['temper:' + track + ':' + t] = rung;
      else shut.push(slot + ' ' + id + ' (ladder ' + t + ': ' + (own(T.TEMPER_UNIQUE_BANDS, t) ? 'a unique band, shut' : 'none') + ')');
    }
    return { temper: Object.keys(out).length ? out : null, shut };
  }

  /**
   * THE PLAN for one hero: `state` 'low' | 'mid' | 'bis', `style` a tools/balance-sim/styles.mjs id, ctx { ground (the cell's: uniques
   * rank on it), mainSkill (the seat's main skill level: the ammo it may spend), exclude (item ids no slot may wear: tools/new-ground.mjs
   * caps a ground inside one gear tier at its own tier's kit, src/core/bands.js insideOneTier) }.
   */
  function kitFor(level, state, style, ctx = {}) {
    const L = Math.max(1, Math.round(level));
    const S = STYLES[style];
    if (!S) throw new Error('grid-kit: no style ' + style);
    if (!STATES[state]) throw new Error('grid-kit: no gear state ' + state);
    const stretch = stretchOf(L);
    if (stretch.state === 'PROJECTED') return projectedPlan(L, state, style, ctx);
    const ground = ctx.ground || null, mainSkill = Number.isInteger(ctx.mainSkill) ? ctx.mainSkill : L;
    const exclude = Array.isArray(ctx.exclude) && ctx.exclude.length ? ctx.exclude : null, ex = exclude ? { exclude } : {};
    const reasons = {};
    let opts, base;
    const staged = stretch.state === 'STAGED' ? stagedUpTo(L) : [];
    if (state === 'low' && L < 15) {
      opts = { starter: true };
      base = gear.kitOf(style, L, { ground, ...opts });
      for (const k of Object.keys(base)) reasons[k] = 'the start kit (under Level 15)';
    } else if (state === 'low' && bandOf(L) <= LADDER_TOP) {
      /* past 110 the ladder runs on steps (src/data/gear-tiers.js STEP_TIERS) and its homes are staged grounds: one tier under the Level's own,
         read with the staged grounds the Level has been sent to open, as MID reads them (lane/gear-phase-b) */
      opts = { tierOffset: STATES.low.ladder.tierOffset, only: STATES.low.ladder.only || 'all', ...(staged.length ? { openAlso: staged } : {}) };
      base = gear.kitOf(style, L, { ground, accessories: true, ammoSkill: mainSkill, ...ex, ...opts });
      for (const k of ['weapon', 'shield', ...ARMOR_SLOTS]) if (base[k]) reasons[k] = 'the ladder, one tier under the Level\'s (tier ' + tierOf(base[k]) + ')';
    } else if (state === 'low') {
      /* past the ladder: the previous band's MID set, worn at this Level */
      const back = bandBefore(L);
      const prev = kitFor(back, 'mid', style, { ground, mainSkill, ...ex });
      opts = { ...prev.gear };
      base = { ...prev.kit };
      for (const k of ['weapon', 'shield', ...ARMOR_SLOTS]) if (base[k]) reasons[k] = 'the previous band\'s MID piece (Level ' + back + ')';
    } else {
      const uniques = state === 'bis' || L >= UNIQUE_FROM;
      opts = { ...(uniques ? { uniques: true } : {}), ...(state === 'bis' ? { chest: true } : {}), ...(staged.length ? { openAlso: staged } : {}) };
      base = gear.kitOf(style, L, { ground, accessories: true, ammoSkill: mainSkill, ...ex, ...opts });
      for (const k of ['weapon', 'shield', ...ARMOR_SLOTS]) if (base[k]) {
        const id = base[k], src = gear.reach.get(id) || (gear.staged.has(id) ? 'staged: drops on ' + gear.staged.get(id).ground : gear.CHEST_IDS.has(id) ? 'a Hearth Chest piece' : 'reachable with the staged grounds opened');
        reasons[k] = (state === 'bis' ? 'the best wearable piece' : uniques ? 'the best ground or boss drop' : 'the ladder piece of the Level\'s tier') + ' (tier ' + tierOf(id) + ', ' + src + ')';
      }
    }
    /* the accessories and the ammo, by the state's rule */
    const set = { ...base };
    const reach = staged.length ? gear.reachWith(staged) : gear.reach;
    for (const [slot, kind] of Object.entries(JEWEL_SLOTS)) {
      if (state === 'low') { set[slot] = null; reasons[slot] = 'none (LOW wears no jewelry or cloak)'; continue; }
      const id = accessory(kind, L, style, state, reach, exclude);
      set[slot] = id;
      reasons[slot] = id ? (state === 'bis' ? 'highest tier, then grade, then the perk pair' : 'the plain piece of the highest tier') + ' (tier ' + tierOf(id) + (ITEMS[id].jewelGrade ? ', ' + ITEMS[id].jewelGrade + ' ' + Object.keys(ITEMS[id].jewelPerks || {}).join('+') : '') + ')' : 'none gettable at this Level';
    }
    if (state === 'low') {
      /* D-3 ruling 2: the Shop's basic ammo for every way that spends one: the bow's Bronze Arrows, the melee ways' Coarse Whetstones */
      const melee = S.role === 'tank' || S.role === 'melee_dps';
      set.ammo = S.role === 'ranger' ? 'bronze_arrows' : melee && ITEMS.coarse_whetstone ? 'coarse_whetstone' : null;
      reasons.ammo = S.role === 'ranger' ? 'the store\'s basic arrow' : melee ? 'the Shop\'s Coarse Whetstone (D-3)' : 'none (a caster spends no ammo)';
    } else if (set.ammo) reasons.ammo = 'the best its skill may spend (skill ' + mainSkill + ')';
    return finish({ level: L, state, style, stretch: stretch.state, label: stretch.label, ground, opts, set, reasons });
  }

  /* past 185: the state's set at 185, its weapon and armor moved to the projected line (grid-project.mjs) */
  function projectedPlan(L, state, style, ctx) {
    const at = kitFor(PROJECTED.from, state, style, { ground: PROJECTED.template, mainSkill: ctx.mainSkill });
    const R = projectedBand(L, state === 'low' ? 1 : 0);
    const line = lineKit(LINES, STYLES[style], R);
    const set = { ...at.kit, ...line.set };
    const reasons = { ...at.why };
    for (const k of Object.keys(line.set)) reasons[k] = 'PROJECTED: the line at Level ' + R + ' (' + (state === 'low' ? 'one band back' : 'the band') + ')';
    return finish({ level: L, state, style, stretch: 'PROJECTED', label: 'PROJECTED', ground: PROJECTED.template, opts: { ...at.gear }, set, reasons, whatIfItems: line.items, projectedBand: R });
  }

  function finish(p) {
    const set = Object.fromEntries(SLOTS.map((k) => [k, p.set[k] || null]));
    for (const [k, id] of Object.entries(set)) if (id && !ITEMS[id] && !gear.staged.has(id)) throw new Error('grid-kit: ' + p.state + ' at ' + p.level + ' names ' + id + ' in ' + k + ', which is no item');
    const worn = Object.fromEntries(Object.entries(set).filter(([, id]) => id));
    /* a staged row worn: its catalogue must be registered where the fight runs (gear.mjs uniques registers it) */
    const needsStaged = Object.values(worn).some((id) => gear.staged.has(id));
    const gearOpts = { ...(p.opts.starter ? {} : p.opts), ...(needsStaged ? { uniques: true } : {}), accessories: true, also: set };
    delete gearOpts.starter;
    const projected = p.stretch === 'PROJECTED';
    const { temper, shut } = projected ? { temper: null, shut: ['every line piece (PROJECTED uniques: their Tempering bands are shut)'] } : rungsOf(worn, RUNGS[p.state]);
    const projectedAdds = p.state === 'bis'
      ? POWER_SOURCES.filter((s) => s.state === 'ruled' && (!s.from || s.from[0] <= p.level)).map((s) => ({ id: s.id, budgetXp: s.budgetXp, note: s.note || null }))
        .concat([{ id: 'linings', budgetXp: null, note: 'every socket at the 40% cap: not built in the engine (L32)' }])
      : [];
    return {
      level: p.level, state: p.state, style: p.style, stretch: p.stretch, label: p.label, ground: p.ground, ...(p.projectedBand ? { projectedBand: p.projectedBand } : {}),
      kit: worn, why: Object.fromEntries(Object.keys(worn).map((k) => [k, p.reasons[k] || 'the kit builder\'s pick'])),
      gear: gearOpts, temper, temperShut: shut, skillDelta: skillDeltaOf(p.state, p.level, STATES),
      whatIfItems: p.whatIfItems || null, projectedAdds,
    };
  }

  /* PRICES: the Shop's price where the Shop sells the piece, else its book value (COMPUTED; a drop's market price is not modelled) */
  const priceOf = (id) => {
    const it = ITEMS[id] || (gear.staged.has(id) ? gear.staged.get(id).row : null);
    if (!it) return 0;
    return Number(SHOP_PRICE.has(id) ? SHOP_PRICE.get(id) : it.v) || 0;
  };
  /** The gold of a plan: its worn pieces (Shop price, else book value) and the rungs it holds (temper.js TEMPER_TIERS, the cumulative rungs). */
  function kitCost(plan, onlySlots = null) {
    let pieces = 0, rungs = 0;
    for (const [slot, id] of Object.entries(plan.kit)) if (slot !== 'ammo' && (!onlySlots || onlySlots.includes(slot))) pieces += priceOf(id);
    for (const [key, n] of Object.entries(plan.temper || {})) {
      const t = Number(key.split(':')[2]);
      rungs += (T.TEMPER_TIERS[t] || []).slice(0, n).reduce((a, b) => a + b, 0);
    }
    return { pieces, rungs, total: pieces + rungs };
  }
  /** The gold to go from plan `a` to plan `b` (same Level and way): every piece of b that a does not wear, and b's rungs over a's. */
  function upgradeCost(a, b) {
    const slots = Object.keys(b.kit).filter((k) => k !== 'ammo' && b.kit[k] !== a.kit[k]);
    const pieces = kitCost(b, slots).pieces, rungs = kitCost(b).rungs - kitCost(a).rungs;
    return { slots, pieces, rungs: Math.max(0, rungs), total: pieces + Math.max(0, rungs) };
  }

  /** A plan with ONE group of slots taken from another plan of the same hero (E1's steps: the MID set with the LOW weapon, or the LOW armor). */
  function mixPlan(base, from, slots) {
    const set = { ...base.kit };
    for (const k of slots) set[k] = from.kit[k] || null;
    const items = { ...(base.whatIfItems || {}) };
    for (const k of slots) if (from.kit[k] && from.whatIfItems && from.whatIfItems[from.kit[k]]) items[from.kit[k]] = from.whatIfItems[from.kit[k]];
    const reasons = { ...base.why };
    for (const k of slots) reasons[k] = 'the step: ' + (from.why[k] || 'none');
    const { also, ...opts } = base.gear;
    void also;
    return finish({ level: base.level, state: base.state, style: base.style, stretch: base.stretch, label: base.label, ground: base.ground, opts: { ...opts, ...(from.gear.uniques ? { uniques: true } : {}) },
      set, reasons, whatIfItems: Object.keys(items).length ? items : null, projectedBand: base.projectedBand });
  }

  /**
   * THE RARE AND VERY RARE KITS (tools/balance-program/trait-kits.mjs; the engine plays them, src/core/hunt/trait-rules.js): the Traits each
   * plan's pieces carry, for a party at once (a party-wide Trait is worn once). `kind` 'lucky' | 'theory' | 'census:<k>' | null (plain);
   * o.rates / o.taken: a theory's census (trait-kits.mjs theoryKits). Each plan gains `traits` [{ id, rank }]; answers the kits by seat.
   */
  async function traitPlans(kind, plans, o = {}) {
    if (!kind) return plans.map(() => null);
    const TK = await loadTraitKits(root);
    const rooms = plans.map((p) => TK.traitRoomOf(p.kit, ITEMS));
    const seats = plans.map((p) => STYLES[p.style].role);
    let kits;
    if (kind === 'lucky') kits = seats.map((s, i) => TK.luckyKit(s, rooms[i]));
    else if (kind === 'theory') kits = TK.theoryKits(seats, rooms, o.rates || {}, o.taken || []);
    else if (/^census:\d+$/.test(kind)) kits = rooms.map((r) => TK.censusKit(Number(kind.slice(7)), r));
    else throw new Error('grid-kit: no Trait kit ' + kind + ' (lucky, theory, census:<k>)');
    plans.forEach((p, i) => { p.traits = kits[i]; });
    return kits;
  }

  return { kitFor, mixPlan, traitPlans, shopSells: (id) => SHOP_PRICE.has(id), temperTiers: T.TEMPER_TIERS, kitCost, upgradeCost, priceOf, skillDeltaOf: (state, level) => skillDeltaOf(state, level, STATES), gear, ITEMS, STYLES, BANDS, bandOf, bandAfter, bandBefore, stagedUpTo, floorOf, LINES, STAGED, STATES };
}
