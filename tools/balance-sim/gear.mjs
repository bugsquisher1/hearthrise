// tools/balance-sim/gear.mjs — WHAT A MEASURED HERO WEARS, read from the game's data (never a hand list).
//
// A STYLE is a way to fight (Tyler 2026-10-16/23: the worn set makes the role): its hunt role, the weapon ladder
// it climbs (src/data/gear-tiers.js GEAR_LADDERS 'weapon:<family>'), its off-hand (a shield ladder from
// src/data/shields.js, the spellbook ladder) and its armour line (plate / leather / cloth). At Level L a hero
// wears, per slot, the highest-tier piece that (a) its Level may wear (`reqLv`, LEVEL_REQ: gear is worn by Level,
// Tyler 2026-10-24) and (b) a player can actually get today (src/data/catalogue-coherence.js reachableSources:
// a drop on an open ground, a listed Shop row, a recipe, the start kit). A rung the practice kit holds (a null
// ladder id, or a ladder row nobody can obtain at tier 1) falls back to the start kit's piece of the same family.
//
// `tierOffset` (-1 = one tier behind on that slot group) and `only` (which slot group the offset moves:
// 'weapon' | 'armour' | any one armour slot | 'shield' | 'all') let a cell measure one upgrade step with everything else equal
// (the ruling's weapon and armour targets, §8-§9).
//
// `openAlso` (a list of ground ids) adds those grounds' drops to (b), as if they were open: a STAGED ground graded by name
// (tools/pack.mjs check) is played as it ships, the same ladder every open ground is graded on. Without it a staged ground at a
// tier's first Level was graded one tier under, because that tier's pieces drop only there (Hask's Ford at 45 in the tier-3
// set, 2026-11-10); the ship step ends that state, so the check would flip green on shipping with nothing changed. The open
// keyed halls stay reachable beside it, and an opened pack's own hall opens with it (a hall pays like its ground: Krell's
// tier-7 prize was off the ladder whenever a staged ground was graded, until lane/a-grader-uniques).
//
// `uniques` (lane/a-grader-uniques, brought onto v0.2.139 by lane/d-late-items-rescue; the armor and weapon lines past Dawnsteel):
// past tier 7 the gear is unique pieces, not a ladder (Tyler 2026-11-14), so a hero dressed off the ladder alone stops getting
// better at 88. With `uniques` each slot takes the best piece of its family the hero can get at its Level: the ladder's, any
// other gettable row of the same family (slot, weight or weapon kind), and the STAGED GEAR rows (STAGED_GEAR below: hidden rows
// a design lane measured and has not shipped), each gettable where its own row says it drops, as a staged ground is with
// `openAlso`. Best is the higher tier, then more of the family's number (armor, or on a graded ground a piece's score there,
// armor-power.mjs, the armor line's own measure; a shield's guard; a weapon's power on the graded ground, weapon-power.mjs, the
// weapon line's own measure, or its attack and strength off a ground), then an attribute that answers this ground (a resistance
// to an element cast here, a bane of a class that lives here, + the style's own skill), then the ladder's own piece. A staged
// row is put into the engine's ITEMS as it would ship (both module instances, the edge's and src/core's), so its armor and its
// attribute reach the fight through the hooks the live settle uses (member.js memberSide -> combat.js equipmentStats,
// mitigation.js, the unit's resistPm); `engineView` reads that, and `uniquesIn` says, per piece, whether its attribute reaches
// the engine at all (one with no hook yet is worn and plays as nothing). `tierOffset` moves the ladder only: a slot group with
// an offset is dressed off the ladder, as before.
//
// GROUND AND BOSS DROPS ONLY (the designer's ruling 2026-11-18 row 1f, PRIORITY_BOARD "2026-11-18 Designer rulings"): a ground is graded
// on "a hero in the last band's gear" (docs/design/itemization-plan.md §3), and THE Platinum chest weapon takes 7 weeks median and 18 at
// the 90th alone (Appendix A Finding 2). So past the ladder the kit wears what a ground or a boss drops (and a staged row whose home is
// built), never a Hearth Chest piece (the Tower's weapons, the Catacombs' armor: chests.js HEARTH_CHEST_KEYS). `chest: true` lets them
// back in, for the grader's printed what-if row (grade.mjs --uniques prints which chest piece each way would swap in). A staged row
// whose source is `planned` (a Morrow grid cell on a ground or boss not built yet, staged/morrow-grid.js) drops nowhere, so no kit wears it.
import { pathToFileURL, fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';
import { weaponPower } from './weapon-power.mjs';
import { armorPower, loadArmorPower } from './armor-power.mjs';
import { STYLES } from './styles.mjs';

/* The tools' own tree. A staged sample under tools/ (tools/balance-sim/staged/) is read from HERE, never from the `root` a guard plants:
   a planted copy carries src/ and the edge, not the simulator's data (party-class-xp-line's mutants plant one and load this file). */
const TOOLS_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fileUrl = (root, p) => pathToFileURL(join(p.startsWith('tools/') ? TOOLS_ROOT : root, p)).href;

/* THE STAGED GEAR CATALOGUES: [module, export]. Each export is { id: { row, source: { ground, monster, how }, attr } } (the
   design lanes' sample shape). A row whose id is already in ITEMS has shipped: the shipped row stands and the staged one is not read.
   One line per catalogue; the next design lane's hidden rows join here. */
export const STAGED_GEAR = Object.freeze([
  Object.freeze(['tools/balance-sim/staged/armor-line.js', 'LINE_SAMPLE']),
  Object.freeze(['src/data/special-attributes.js', 'SPECIAL_SAMPLE']),
  Object.freeze(['tools/balance-sim/staged/weapon-line.js', 'WEAPON_SAMPLE']),
]);

/* The combat skill each role fights with (a `<skill>Plus` field's skill that answers the style, combat.js SKILL_PLUS_FIELDS). */
const ROLE_SKILL = Object.freeze({ tank: 'melee', melee_dps: 'melee', ranger: 'ranged', mage: 'magic', healer: 'magic' });

/* The styles the simulator plays (./styles.mjs: the list alone, so the Balance Lab's browser bundle reads it without this file's node-only
   uniques kit). */
export { STYLES };

const ARMOUR_SLOT_KEYS = Object.freeze(['helmet', 'body', 'pants', 'boots', 'gloves', 'belt']);

export async function loadGear(root) {
  const u = (p) => pathToFileURL(join(root, p)).href;
  const { BUILD } = await import(u('src/build-info.js'));
  const v = '?v=' + BUILD.version;
  /* the engine's own module instances (src/core imports src/data with ?v=): the same ITEMS the fight reads */
  const { ITEMS } = await import(u('src/data/items.js') + v);
  const GT = await import(u('src/data/gear-tiers.js') + v);
  const { SHIELD_ITEMS } = await import(u('src/data/shields.js') + v);
  const { STARTER_SETS, START_EQUIPMENT } = await import(u('src/data/start-kit.js') + v);
  const CC = await import(u('src/data/catalogue-coherence.js') + v);
  const { OPEN_GROUNDS, OPEN_HALL_GROUNDS, HUNT_GROUNDS, HALL_GROUNDS } = await import(u('src/data/hunt-grounds.js') + v);
  const own = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
  const reach = CC.reachableSources();
  /* the grounds a player can enter with `ids` opened: the open grounds and open halls, each opened ground, and its pack's hall */
  const groundsWith = (ids) => {
    const out = { ...OPEN_GROUNDS, ...OPEN_HALL_GROUNDS };
    for (const g of ids) {
      out[g] = HUNT_GROUNDS[g];
      for (const [hid, h] of Object.entries(HALL_GROUNDS)) if (h.hall === g) out[hid] = h;
    }
    return out;
  };
  const openIds = (also) => [...new Set(also || [])].filter((g) => !own(OPEN_GROUNDS, g)).sort();
  /* the reachable set with `also` grounds opened (one per distinct list, built once) */
  const reaches = new Map();
  const reachWith = (also) => {
    const ids = openIds(also);
    if (!ids.length) return reach;
    const key = ids.join(',');
    if (!reaches.has(key)) {
      for (const g of ids) if (!own(HUNT_GROUNDS, g)) throw new Error('balance-sim gear: openAlso names no ground ' + g);
      /* the open keyed halls too (reachableSources' own default: an open pack's hall pays like its ground), and each opened pack's own hall.
         Without them a staged ground was graded without Lord Krell's drops, so at Carter's Rest a Level 110 hammer wore the Ember Warhammer
         and a bow the Runewood Bow while the Mage kept its Duskwood wand (lane/d-mage-110) */
      reaches.set(key, CC.reachableSources({ grounds: groundsWith(ids) }));
    }
    return reaches.get(key);
  };
  /* the ground ids a staged row may drop on with `also` opened: every enterable ground, and the pack a hall belongs to */
  const dropGroundsWith = (also) => {
    const out = new Set();
    for (const [id, g] of Object.entries(groundsWith(openIds(also)))) { out.add(id); if (g && g.hall) out.add(g.hall); }
    return out;
  };
  const ladder = Object.fromEntries(GT.GEAR_LADDERS.map((l) => [l.key, l.ids]));
  const starters = new Set([...Object.values(STARTER_SETS).flat(), ...Object.values(START_EQUIPMENT)]);
  const tierOf = (id) => (ITEMS[id] && Number(ITEMS[id].tier)) || 1;
  const lvOf = (id) => (ITEMS[id] && Number(ITEMS[id].reqLv)) || 1;
  const canIn = (R) => (id, L) => !!id && !!ITEMS[id] && R.has(id) && lvOf(id) <= L;
  const can = canIn(reach);
  /* the practice piece that plays a ladder's family at tier 1 (same weaponType and discipline, or the spellbook) */
  const practiceFor = (key) => {
    const ids = ladder[key] || [];
    const ref = ITEMS[ids.find((x) => x && ITEMS[x])];
    if (!ref) return null;
    return [...starters].find((id) => {
      const it = ITEMS[id];
      return it && it.slot === ref.slot && it.weaponType === ref.weaponType && (it.discipline || null) === (ref.discipline || null)
        && (it.offhand || null) === (ref.offhand || null) && !!it.twoHanded === !!ref.twoHanded;
    }) || null;
  };
  /* the best piece of a ladder at Level L, `off` tiers behind the best (never below tier 1) */
  const pick = (ids, L, off, fallback, ok0 = can) => {
    const ok = ids.filter((id) => ok0(id, L)).sort((a, b) => tierOf(a) - tierOf(b));
    if (fallback && ok0(fallback, L) && !ok.some((id) => tierOf(id) === tierOf(fallback))) ok.unshift(fallback);
    if (!ok.length) return null;
    return ok[Math.max(0, ok.length - 1 + (off || 0))];
  };
  /* THE SHIELD LADDER: the light shields (no attack penalty) by default; `heavy` the guards with one */
  const shieldIds = (heavy) => Object.keys(SHIELD_ITEMS).filter((id) => ITEMS[id] && !!heavy === Object.keys(ITEMS[id]).some((k) => /AtkB$/.test(k) && ITEMS[id][k] < 0));
  const armourLadder = (line, slot) => ladder[line + ':' + slot] || [];

  /* ── THE UNIQUES (opts.uniques) ── */
  /* the edge's ITEMS (hr-accrue imports src/data/items.js bare) beside src/core's (?v=): a staged row goes into both, as a shipped row is in both */
  const EDGE_ITEMS = (await import(u('src/data/items.js'))).ITEMS;
  const { MONSTERS } = await import(u('src/data/monsters.js') + v);
  const { spellRow } = await import(u('src/data/monster-spells.js') + v);
  const MEMBER = await import(u('src/core/member.js'));
  /* the engine's + skill fields (combat.js SKILL_PLUS_FIELDS) and the attribute catalogue that names them (special-attributes.js) */
  const { SKILL_PLUS_FIELDS } = await import(u('src/core/combat.js'));
  const { SPECIAL_ATTRIBUTES } = await import(u('src/data/special-attributes.js') + v);
  /* THE HEARTH CHEST'S PIECES (chests.js HEARTH_CHEST_KEYS: the Tower keys' weapons, the Catacomb keys' armor): worn only with `chest` */
  const { HEARTH_CHEST_KEYS } = await import(u('src/data/chests.js') + v);
  const CHEST_IDS = new Set(HEARTH_CHEST_KEYS.flatMap((k) => [...Object.values(k.weapons || {}), ...Object.values(k.armor || {})]));
  /* THE WEAPON LINE'S MEASURE (weapon-power.mjs, lane/d-weapon-line): a weapon's power on the ground being graded, the engine's own rolls
     over its spawn, so the grader picks the weapon the guard (tests/weapon-line.mjs) holds under the line */
  const WP = weaponPower({ ITEMS, MONSTERS, HUNT_GROUNDS: { ...HUNT_GROUNDS }, HUNT_INDEX: (await import(u('src/data/hunts.js') + v)).HUNT_INDEX,
    combat: await import(u('src/core/combat.js')), deriveProfile: MEMBER.deriveProfile, skillXpForLevel: (await import(u('src/core/xp.js'))).skillXpForLevel,
    line: await import(fileUrl(root, 'tools/balance-sim/staged/weapon-line.js')) });
  /* THE ARMOR LINE'S MEASURE (armor-power.mjs, lane/d-armor-line-v2): a piece's score on the graded ground, so the grader wears the piece the
     guard (tests/armor-line.mjs) holds under the line */
  const APL = await loadArmorPower(root);
  const AP = armorPower(APL.mods), AP_WEIGHTS = new Set(Object.keys(APL.line.LINE_BASE)), AP_CACHE = new Map();
  const staged = new Map();
  for (const [file, name] of STAGED_GEAR) {
    const cat = (await import(fileUrl(root, file)))[name] || {};
    for (const [id, s] of Object.entries(cat)) {
      if (own(ITEMS, id)) continue;
      if (staged.has(id)) throw new Error('balance-sim gear: staged row ' + id + ' is in two catalogues');
      /* a planned home (a grid cell on a ground or boss not built yet): nothing drops it, so no hero can wear it */
      if (s && s.row && s.source && s.source.planned === true) continue;
      if (!s || !s.row || !s.row.slot || !s.source || !s.source.ground) throw new Error('balance-sim gear: staged row ' + id + ' (' + file + ') has no row, slot or drop ground');
      staged.set(id, Object.freeze({ id, row: s.row, ground: s.source.ground, attr: s.attr || null, from: file + ' ' + name }));
    }
  }
  /* Put every staged row into both ITEMS instances, once, before any fight reads one (a clone: the catalogue's frozen row stays as it is). */
  let registered = false;
  const registerStaged = () => {
    if (registered) return;
    for (const table of new Set([ITEMS, EDGE_ITEMS])) for (const [id, s] of staged) {
      if (own(table, id)) throw new Error('balance-sim gear: staged row ' + id + ' is already an item');
      table[id] = JSON.parse(JSON.stringify(s.row));
    }
    registered = true;
  };
  const rowOf = (id) => (own(ITEMS, id) ? ITEMS[id] : staged.has(id) ? staged.get(id).row : null);
  /* a family: what makes two rows the same kind of piece (a sword is not a hammer, a bow is not a crossbow, a codex is not a shield) */
  const familyOf = (it) => [it.slot, it.armourClass || '', it.weaponType || '', it.discipline || '', !!it.twoHanded, it.offhand || '',
    it.slot === 'shield' ? Object.keys(it).some((k) => /AtkB$/.test(k) && it[k] < 0) : ''].join('|');
  const worn = (it) => !!it && !!it.slot && it.slot !== 'ammo' && (it.type === 'armor' || it.type === 'weapon' || it.slot === 'shield');
  const families = new Map();
  for (const id of [...Object.keys(ITEMS), ...staged.keys()]) {
    const it = rowOf(id);
    if (!worn(it)) continue;
    const f = familyOf(it);
    if (!families.has(f)) families.set(f, []);
    families.get(f).push(id);
  }
  const familyIds = (ids) => { const ref = ids.map(rowOf).find(Boolean); return ref ? families.get(familyOf(ref)) || [] : []; };
  /* the family's number: armor for armor and a shield, a weapon's (or a spellbook's) attack and strength in the style it hits with */
  const powerOf = (it) => (it.slot === 'weapon' || it.offhand === 'spellbook'
    ? (it.weaponType === 'magic' || it.offhand === 'spellbook' ? (it.magicAtkB || 0) + (it.magicStrB || 0)
      : it.weaponType === 'ranged' ? (it.rangeAtkB || 0) + (it.rangeStrB || 0) : (it.atkB || 0) + (it.strB || 0))
    : it.defB || 0);
  /* what a ground asks of an attribute: the elements its monsters cast, and the classes that live there (a staged ground's too) */
  const grounds = new Map();
  const groundAsks = (gid) => {
    if (!gid) return null;
    if (!grounds.has(gid)) {
      const g = HUNT_GROUNDS[gid] || HALL_GROUNDS[gid] || null;
      const el = new Set(), cls = new Set();
      for (const p of (g && g.pockets) || []) for (const s of (p.pack || []).concat(p.spawns || [], p.adds || [])) {
        const m = MONSTERS[s.monster];
        if (!m) continue;
        if (m.cls) cls.add(m.cls);
        for (const sp of m.spells || []) { const r = spellRow(sp); if (r && r.element) el.add(r.element); }
      }
      grounds.set(gid, { el, cls });
    }
    return grounds.get(gid);
  };
  const answers = (it, asks, role) => {
    let n = 0;
    for (const [k, pm] of Object.entries(it.resistPm || {})) if (pm > 0 && (k === 'physical' || (asks && asks.el.has(k)))) n++;
    if (it.bane && asks && asks.cls.has(it.bane.class)) n++;
    for (const [k, f] of Object.entries(SKILL_PLUS_FIELDS)) if (it[f] > 0 && (k === 'defense' || k === ROLE_SKILL[role])) n++;
    return n;
  };
  const tierOf2 = (it) => Number(it && it.tier) || 1;
  /* A WEAPON'S NUMBER ON A GROUND (lane/d-weapon-line): past Dawnsteel a weapon spends one budget its own way (more accuracy, more damage,
     a critical chance, a bane), so attack plus damage no longer ranks it. On a graded ground a weapon's number is its power there at the
     hero's Level (weapon-power.mjs score: the mean of its pace and its safety), rounded to a tenth so two pieces a hair apart fall to the next key; anywhere else, or for a
     spellbook, the family's number as before */
  /* A PIECE OF ARMOR'S NUMBER ON A GROUND (lane/d-armor-line-v2): past Dawnsteel a piece spends one budget its own way (more armor and a
     lighter swing, less armor and an element, dodge over crit), so armor alone no longer ranks it. On a graded ground a piece of a weight
     the line knows ranks by its score there at the hero's Level (armor-power.mjs scoreOnDawn: the mean of its pace and safety worn in
     untempered Dawnsteel, its slot's Dawnsteel piece 1.000), to a thousandth; anywhere else its armor as before */
  const armorScoreOf = (it, L, gid) => {
    let m = AP_CACHE.get(it);
    if (!m) AP_CACHE.set(it, (m = new Map()));
    const k = L + '|' + gid;
    if (!m.has(k)) m.set(k, AP.scoreOnDawn(it, gid, L, false));
    return m.get(k);
  };
  const rankOf = (it, L, gid) => {
    if (it.slot === 'weapon' && gid && Number.isFinite(L)) { const p = WP.score(it, gid, L); if (p !== null) return Math.round(p * 10); }
    if (ARMOUR_SLOT_KEYS.includes(it.slot) && AP_WEIGHTS.has(it.armourClass) && gid && Number.isFinite(L)) { const p = armorScoreOf(it, L, gid); if (p !== null) return Math.round(p * 1000); }
    return powerOf(it);
  };
  /* rank: tier, the family's number, an attribute that answers the ground, the ladder's own piece, the id (a total order: no tie is left to the sort) */
  const better = (asks, role, onLadder, L, gid) => (a, b) => {
    const A = rowOf(a), B = rowOf(b);
    return (tierOf2(B) - tierOf2(A)) || (rankOf(B, L, gid) - rankOf(A, L, gid)) || (answers(B, asks, role) - answers(A, asks, role))
      || ((onLadder.has(b) ? 1 : 0) - (onLadder.has(a) ? 1 : 0)) || (a < b ? -1 : a > b ? 1 : 0);
  };
  /** The best piece of `ladderIds`' family a hero of `role` can get at Level L, beside the ladder's own pick (null: none). */
  const bestOf = (ladderIds, ladderPick, L, role, ctx) => {
    const onLadder = new Set(ladderIds);
    const can = (id) => {
      const it = rowOf(id);
      if (!it || (Number(it.reqLv) || 1) > L) return false;
      if (ctx.exclude && ctx.exclude.includes(id)) return false;
      if (staged.has(id)) return ctx.drops.has(staged.get(id).ground);
      /* ground and boss drops only past the ladder (row 1f): a Hearth Chest piece only with `chest` */
      if (!onLadder.has(id) && CHEST_IDS.has(id) && !ctx.chest) return false;
      return ctx.reach.has(id);
    };
    const ids = familyIds(ladderPick ? [ladderPick, ...ladderIds] : ladderIds).filter(can);
    if (ladderPick && !ids.includes(ladderPick)) ids.push(ladderPick);
    if (!ids.length) return null;
    return ids.sort(better(ctx.asks, role, onLadder, L, ctx.ground))[0];
  };

  /**
   * THE ENGINE'S VIEW of a worn set: what the live settle's member (src/core/member.js memberSide, the hr-accrue settle's own builder) carries
   * onto the hero's unit (armor by weight, the to-hit defence, the resistances, accuracy, max hit) and the loadout's critical chance and banes.
   * `items` is the ITEMS table it reads (the edge's by default).
   */
  function engineView(kit, L, items = EDGE_ITEMS) {
    const s = MEMBER.memberSide({ key: 'view', seat: 0, equipment: { ...kit }, skills: {}, levelXp: 0, hp: 1, huntSession: {}, hero: {} }, { items });
    const snap = s.member.snapshot(s.state);
    return { armour: snap.armour, def: snap.def, acc: snap.acc, maxHit: snap.maxHit, resistPm: snap.resistPm || null, skillPlus: snap.skillPlus || null, critB: s.eq.critB, bane: s.eq.bane || null };
  }
  /* an attribute's field on a row for its key (special-attributes.js SPECIAL_ATTRIBUTES[kind].field: one field, or one a key, a + skill's
     the engine's `<skill>Plus`, row 1c) */
  const attrFieldOf = (kind, key) => {
    const def = SPECIAL_ATTRIBUTES[kind];
    return !def ? null : typeof def.field === 'string' ? def.field : (def.field && own(def.field, key) ? def.field[key] : null);
  };
  /**
   * The pieces of `kit` past the ladder (a staged row, or a gettable row the ladder does not list), each with its attribute and whether
   * that attribute reaches the engine: the engine's view of the set with the piece, against the same set with the piece's attribute
   * key taken off (a copy of the table: the real ITEMS are not touched). A key the engine drops (no hook yet) reads `hooked: false`.
   * opts: { items (the table the engine reads, the edge's by default), fieldOf (kind, key) -> field (the catalogue's by default) }: the
   * grader's proof plants a field the engine never reads (uniques-proof.mjs U4).
   */
  function uniquesIn(kit, L, opts = {}) {
    const table = opts.items || EDGE_ITEMS, fieldFor = opts.fieldOf || attrFieldOf;
    const onLadder = new Set(Object.values(ladder).flat());
    const out = [];
    for (const [slot, id] of Object.entries(kit)) {
      if (!id || onLadder.has(id) || slot === 'ammo' || starters.has(id)) continue;
      const it = own(table, id) ? table[id] : rowOf(id);
      if (!it) continue;
      const s = staged.get(id) || null;
      const [kind, key] = (s && s.attr) || [null, null];
      const field = kind ? fieldFor(kind, key) : null;
      let hooked = null;
      if (field && own(it, field)) {
        const cut = JSON.parse(JSON.stringify(it));
        if (key && cut[field] && typeof cut[field] === 'object' && field !== 'bane') { delete cut[field][key]; if (!Object.keys(cut[field]).length) delete cut[field]; }
        else delete cut[field];
        const was = JSON.stringify(engineView(kit, L, table)), now = JSON.stringify(engineView(kit, L, { ...table, [id]: cut }));
        hooked = was !== now;
      }
      out.push({ slot, id, n: it.n, staged: !!s, armor: it.defB || 0, attr: kind ? kind + (key ? ':' + key : '') : null, hooked });
    }
    return out;
  }

  /**
   * The worn set of `style` at Level `L`. opts: { tierOffset, only, heavyShield, line (another armour line),
   * armourSlots (default all six; the reachable ones are filled), noArmour, ammo (an item for the ammo slot),
   * starter (the start kit's pieces only), openAlso (ground ids played as open: see the header), exclude (item ids held out), uniques (past the ladder: see the header), chest (the Hearth Chest's pieces too, the what-if) }.
   */
  function kitOf(style, L, opts = {}) {
    const S = STYLES[style];
    if (!S) throw new Error('balance-sim: unknown style ' + style);
    /* THE STARTER KIT (`starter`): what a fresh hero owns, whatever its Level: the style's practice weapon and off-hand
       (STARTER_SETS: all six sets are in every new hero's bag), no armour (the start kit holds none) */
    if (opts.starter === true) {
      const set = { weapon: practiceFor(S.weapon) };
      if (S.offhand === 'shield') set.shield = ITEMS.practice_shield ? 'practice_shield' : null;
      else if (S.offhand === 'spellbook') set.shield = practiceFor('spellbook');
      if (S.role === 'ranger') set.ammo = opts.ammo || 'bronze_arrows';
      for (const k of Object.keys(set)) if (!set[k] || (k !== 'ammo' && !starters.has(set[k]))) delete set[k];
      return set;
    }
    const off = (group) => (opts.only === group || opts.only === 'all' ? (opts.tierOffset || 0) : 0);
    const okR = opts.openAlso ? canIn(reachWith(opts.openAlso)) : can;
    /* `exclude`: pieces this hero can't hold yet, whatever drops them (a hall's own prize before its first win) */
    const ok = opts.exclude ? (id, L) => !opts.exclude.includes(id) && okR(id, L) : okR;
    /* THE UNIQUES: each slot group with no tier offset takes the best gettable piece of its family (see the header) */
    let ctx = null;
    if (opts.uniques === true) {
      registerStaged();
      ctx = { reach: opts.openAlso ? reachWith(opts.openAlso) : reach, drops: dropGroundsWith(opts.openAlso), asks: groundAsks(opts.ground || null),
        ground: opts.ground && own(HUNT_GROUNDS, opts.ground) ? opts.ground : null, exclude: opts.exclude || null, chest: opts.chest === true };
    }
    const best = (ids, id, o) => (ctx && !o ? bestOf(ids, id, L, S.role, ctx) || id : id);
    const set = {};
    set.weapon = best(ladder[S.weapon] || [], pick(ladder[S.weapon] || [], L, off('weapon'), practiceFor(S.weapon), ok), off('weapon'));
    if (S.offhand === 'shield') {
      const ids = shieldIds(opts.heavyShield === true);
      set.shield = best(ids, pick(ids, L, off('shield'), ITEMS.practice_shield ? 'practice_shield' : null, ok), off('shield'));
    } else if (S.offhand === 'spellbook') {
      set.shield = best(ladder.spellbook || [], pick(ladder.spellbook || [], L, off('weapon'), practiceFor('spellbook'), ok), off('weapon'));
    }
    if (opts.noArmour !== true) {
      const line = opts.line || S.line;
      for (const slot of opts.armourSlots || ARMOUR_SLOT_KEYS) {
        const o = off(slot) || off('armour');
        const id = best(armourLadder(line, slot), pick(armourLadder(line, slot), L, o, null, ok), o);
        if (id) set[slot] = id;
      }
    }
    if (S.role === 'ranger') set.ammo = opts.ammo || 'bronze_arrows';
    else if (opts.ammo) set.ammo = opts.ammo;
    Object.assign(set, opts.also || {});
    for (const k of Object.keys(set)) if (!set[k]) delete set[k];
    return set;
  }

  /** Every gear row and why a player can or cannot wear it at its Level (the audit's dead-gear list). */
  function gearCensus() {
    const rows = [];
    for (const [id, it] of Object.entries(ITEMS)) {
      if (!it || !it.slot || it.slot === 'ammo' || !(it.type === 'armor' || it.type === 'weapon' || it.slot === 'shield')) continue;
      rows.push({ id, slot: it.slot, tier: it.tier || null, reqLv: it.reqLv || null, reqSkill: it.reqSkill || null,
        weaponType: it.weaponType || null, armourClass: it.armourClass || null, twoHanded: !!it.twoHanded, source: reach.get(id) || null });
    }
    return rows;
  }
  return { kitOf, gearCensus, ITEMS, EDGE_ITEMS, reach, reachWith, ladder, staged, registerStaged, engineView, uniquesIn, attrFieldOf, CHEST_IDS };
}
