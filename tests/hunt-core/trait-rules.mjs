// tests/hunt-core/trait-rules.mjs — A WORN TRAIT IN THE FIGHT: every one of the 40 rows plays its rule, dark for players (lane/traits-in-engine,
// systems, 2026-11-23; src/core/hunt/trait-rules.js, src/data/traits.js, 12-targets.md section 8, 19-power-ledger.md row 5). Run by run-all.mjs.
//
//   worn-list        the list the engine plays: an unknown id, a rank outside 1 to 3 and a Trait past its slot's pieces dropped; the key
//                    rule keeps the larger (the rank, then the party-wide one, then the lower number); heroSetup carries it, none with none
//   every-trait      EVERY ROW PLAYS (the switch on): each Trait at rank 3 moves its hero's conditional steps in its channel by exactly
//                    traitSteps[2] (a trade: offense + tradeSteps[2], defense - traitSteps[2]) on a blow or heal where its `when` holds, and by
//                    0 where it fails, a move-narrowed Trait by 0 on another kind of move; a row with no scenario here is red
//   families         a party Trait reaches a living ally (once a party, two wearers or not) and never a monster or a dead wearer's ally;
//                    the key rule on one hero; the gear slice's cap holds three rank 3 Traits at once to 20 and never clamps a trade's
//                    cost; a running-low Trait counts only on a hunt started with its floor; a heal Trait reads the heal's own target
//   real-settle      THE BOTH PATHS (CLAUDE.md section 4): a Muster four wearing one Trait of each family on the real settle names every
//                    family on its events (`tr`), plays a different hunt from the same four with none, and settles the same in 10-minute
//                    and 100-second windows (a closed hunt and a viewed one)
//   view-names       every Trait id is named by src/render/source-names.js; the combat log says a `tr` event's Traits by name, never by id
//   lab-kits         the Lab's Rare and Very Rare kits (tools/balance-program/trait-kits.mjs) are wearable: rank III, one a key, each slot
//                    within the room the worn kit gives (no shield Trait beside a two-hander); lucky only the seat's own; the census covers
//                    all 40 in wearable sets; a theory wears a party-wide key once a party
//   dark             GEAR_STEPS.traitsLive is false and no src or server file but the engine's three readers names `wornTraits` (nothing
//                    hands a hero a worn Trait); a hero with none writes no field and its rows come back untouched (the switch off plays
//                    as before: engine-parity holds with no re-pin)
//
// mutant-anchors: src/core/hunt/trait-rules.js src/core/hunt/amount.js src/core/hunt/damage.js src/core/hunt/abilities.js src/core/hunt/heal-rules.js src/core/hunt-spawn.js src/core/member.js src/core/combat-sim.js src/render/source-names.js src/hunt-view/combat-log.js src/data/gear-steps.js tools/balance-program/trait-kits.mjs
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { loadCore, plant, makeReport, ROOT } from './fixtures/h1.js';
import { caughtBy, missWhy } from '../_mutant-verdict.mjs';
import { sourceQuery } from '../../tools/lib/version-stamp.mjs';

const V = sourceQuery(ROOT);
async function load(root) {
  const M = await loadCore(root);
  const imp = (p) => import(pathToFileURL(join(root, p)).href + V);
  M.TRR = await imp('src/core/hunt/trait-rules.js');
  M.A = await imp('src/core/hunt/amount.js');
  M.GS = await imp('src/data/gear-steps.js');
  /* the view (only where the planted tree carries it: the view's mutants plant its import graph) */
  M.SN = existsSync(join(root, 'src/hunt-view/combat-log.js')) ? await imp('src/render/source-names.js') : null;
  M.LOG = M.SN ? await imp('src/hunt-view/combat-log.js') : null;
  return M;
}

const G = 'muster_barrows';
/* an rng that draws its lowest and lands no chance */
const LOW = Object.freeze({ chance: () => false, int: (a) => a });
const RANK = 3;
let nextId = 100;
/* a hero at Level 60 in Muster's kit, standing at (x, 5) */
const heroU = (role, o = {}) => ({ side: 'hero', id: nextId++, kind: role, role, alive: true, heroLv: 60, gearPm: 60000, armorGearPm: 60000, wardPm: 60000,
  skillGapPm: 0, blowBp: 740, hp: 1000, maxHp: 1000, mana: 500, maxMana: 500, x: 5, y: 5, statuses: [], ...o });
const monU = (kind, o = {}) => ({ side: 'mon', id: nextId++, kind, alive: true, hp: 500, maxHp: 500, x: 6, y: 5, statuses: [], ...o });
const pctHp = (u, p) => { u.hp = Math.round((u.maxHp * p) / 100); };
const pctMana = (u, p) => { u.mana = Math.round((u.maxMana * p) / 100); };
/* a percent on each side of `op value` (a holding one, a failing one) */
const sides = (op, v) => ({ lt: [v - 10, v + 10], lte: [v, v + 10], gt: [v + 5, v - 10], gte: [v, v - 10], eq: [v, v + 10], ne: [v + 10, v] })[op];

/*
 * THE SCENE ONE TRAIT IS READ IN: the wearer (its `best` seat), a party (tank, healer, a third), a monster, and the blow's or heal's context;
 * `set(holds)` puts the world in a state where its `when` holds (true) or fails (false). One builder a metric: a Trait on a metric with no
 * builder here is red (every-trait), so a new condition is played before it ships.
 */
function scene(M, id) {
  const t = M.GS.TRAITS[id];
  const w = heroU(t.best.seat);
  const tank = t.best.seat === 'tank' ? w : heroU('tank'), healer = t.best.seat === 'healer' ? w : heroU('healer');
  const third = heroU(t.best.seat === 'ranger' ? 'mage' : 'ranger');
  const party = [...new Set([w, tank, healer, third])];
  const mon = monU('barrow_pikeman');
  const s = { t, w, party, mon, to: null, el: 1000, tag: { id: 'basic' }, h: { hs: { bag: {} }, ammo: null }, extra: [] };
  /* the move it is narrowed to (or a plain blow): the right one, and one of another kind for the narrowed check */
  const MOVE = { area: { id: 'fireball', area: 1 }, spell: { id: 'frost_lance' }, ranged: { id: 'basic' } };
  if (t.move === 'ranged' && w.role !== 'ranger') return { err: id + ': a ranged Trait sized on a seat that does not shoot' };
  if (t.move) s.tag = { ...MOVE[t.move] };
  /* (a caster's basic is a spell: it spends mana and trains Magic, so the move of another kind for a spell Trait is a weapon strike) */
  s.wrongMove = t.move === 'area' ? { id: 'frost_lance' } : t.move === 'spell' ? { id: 'power_strike' } : t.move === 'ranged' ? { id: 'frost_lance' } : null;
  const c = t.when;
  const B = {
    self_hp_pct: (on) => pctHp(w, sides(c.op, c.value)[on ? 0 : 1]),
    self_mana_pct: (on) => pctMana(w, sides(c.op, c.value)[on ? 0 : 1]),
    party_hp_pct: (on) => { for (const u of party) pctHp(u, sides(c.op, c.value)[on ? 0 : 1]); },
    ally_mana_pct: (on) => pctMana(c.subject === 'healer' ? healer : c.subject === 'tank' ? tank : w, sides(c.op, c.value)[on ? 0 : 1]),
    ally_hp_pct: (on) => {
      const who = c.subject === 'tank' ? tank : c.subject === 'healer' ? healer : third;
      pctHp(who, sides(c.op, c.value)[on ? 0 : 1]);
      /* a heal reads its own target: failing, the target is high while ANOTHER hero is low (the bar's 'lowest' would hold) */
      if (t.raises === 'heal') { s.to = who; if (!on) pctHp(w === who ? third : w, sides(c.op, c.value)[0]); }
    },
    allies_below: (on) => {
      const under = Number(String(c.subject).slice(6));
      /* the count that holds (and one that fails) of the party's heroes under `under`% */
      const want = c.op === 'eq' ? (on ? c.value : c.value + 1) : c.op === 'gte' ? (on ? c.value : c.value - 1) : null;
      if (want === null) return;
      party.forEach((u, i) => pctHp(u, i < want ? under - 10 : 100));
    },
    enemy_casting: (on) => {
      const n = on ? c.value : 0;
      for (let i = 0; i < n; i++) s.extra.push(monU('barrow_pikeman', { cast: { kind: 'group', x: 0, y: 0 } }));
    },
    enemies_in_aoe: (on) => { s.tag = { ...s.tag, area: on ? c.value : c.value - 2 }; },
    target_weak: (on) => { s.el = on ? 1250 : 1000; },
    target_resists: (on) => { s.el = on ? 750 : 1000; },
    target_is_boss: (on) => { s.mon = monU(on ? 'captain_hask' : 'barrow_pikeman'); },
    effect_missing: (on) => { s.mon.statuses = on ? [{ s: c.value }] : []; },
    item_qty: (on) => { s.h = { hs: { bag: { bronze_arrows: { loaded: 2 * c.value, left: on ? c.value : c.value + 20 } } }, ammo: 'bronze_arrows' }; },
  };
  if (!B[c.metric]) return { err: id + ': no scene for the condition ' + c.metric };
  s.set = (on) => { for (const u of party) { pctHp(u, 100); pctMana(u, 100); } s.extra = []; s.to = t.raises === 'heal' ? third : null; B[c.metric](on); };
  return s;
}

/* the hero's conditional steps in `channel` on one blow or heal in scene `s`, wearing `worn` (none: []) */
function condOf(M, s, channel, worn, tag) {
  M.TRR.syncTraits(s.w, worn.length ? { wornTraits: worn } : {});
  for (const u of s.party) if (u !== s.w) M.TRR.syncTraits(u, {});
  const inst = { world: { risk: 'steady', units: [...s.party, s.mon, ...s.extra] }, ground: { id: G }, monsters: M.MONSTERS, tier: null,
    heroes: { [s.w.id]: s.h }, atMs: 0 };
  const tr = {};
  if (channel === 'offense') M.A.blowAmount(inst, { source: s.w, target: s.mon, mean: 1000, el: s.el, rng: LOW, critMult: 1.5, tag: tag || s.tag, trace: tr });
  else if (channel === 'defense') M.A.blowAmount(inst, { source: s.mon, target: s.w, mean: 100, el: 1000, rng: LOW, critMult: 1.5, trace: tr });
  else M.A.healAmount(inst, s.w, 1000, { rng: LOW, to: s.to, trace: tr });
  /* a defense row's steps come OFF the blow at the hero: read as what the hero gains */
  return channel === 'defense' ? -tr.cond : tr.cond;
}

const cases = {
  'worn-list': (M) => {
    const W = M.TRR.wornTraitsOf, T = M.GS.TRAITS;
    if (W([]) !== null || W(null) !== null || W([{ id: 'nope', rank: 1 }]) !== null) return 'an empty or unknown list was not none';
    if (W([{ id: 'last_file', rank: 0 }]) || W([{ id: 'last_file', rank: 4 }]) || W([{ id: 'last_file', rank: 1.5 }])) return 'a rank outside 1 to 3 was kept';
    const key = W([{ id: 'full_wick', rank: 2 }, { id: 'banked_coals', rank: 3 }]);
    if (!key || key.length !== 1 || key[0].id !== 'banked_coals') return 'the key rule kept ' + JSON.stringify(key) + ', not the higher rank';
    const tie = W([{ id: 'captains_due', rank: 3 }, { id: 'raised_colors', rank: 3 }]);
    if (!tie || tie.length !== 1 || tie[0].id !== 'raised_colors') return 'a tie of one key kept ' + JSON.stringify(tie) + ', not the party-wide one';
    const lower = W([{ id: 'ledge_footing', rank: 2 }, { id: 'slack_water', rank: 2 }]);
    if (!lower || lower[0].id !== 'slack_water') return 'a tie of one scope kept ' + JSON.stringify(lower) + ', not the lower number';
    /* ring Traits: two rings, two a piece = 4; a fifth is past the pieces */
    const rings = Object.keys(T).filter((id) => T[id].slot === 'ring').map((id) => ({ id, rank: 1 }));
    if (rings.length < 5) return 'CONTROL: ' + rings.length + ' ring Traits';
    const r = W(rings);
    if (!r || r.length !== 4) return 'five ring Traits kept ' + (r && r.length) + ', not the 4 two rings hold';
    const hs = M.spawn.heroSetup({ weaponType: 'shield', options: {}, bar: null, wornTraits: [{ id: 'last_file', rank: 2 }, { id: 'x', rank: 1 }] });
    if (!hs || !hs.wornTraits || hs.wornTraits.length !== 1 || hs.wornTraits[0].id !== 'last_file') return 'heroSetup carried ' + JSON.stringify(hs && hs.wornTraits);
    if ('wornTraits' in M.spawn.heroSetup({ weaponType: 'shield', options: {}, bar: null })) return 'heroSetup wrote a worn list nobody handed';
    return null;
  },
  'every-trait': (M) => {
    const T = M.GS.TRAITS, S = M.GS.GEAR_STEPS;
    if (Object.keys(T).length < 40) return 'CONTROL: ' + Object.keys(T).length + ' Traits';
    for (const id of Object.keys(T)) {
      const s = scene(M, id);
      if (s.err) return s.err;
      const t = s.t, worn = [{ id, rank: RANK }];
      const want = t.trade ? { offense: S.tradeSteps[RANK - 1], defense: -S.traitSteps[RANK - 1] } : { [t.raises]: S.traitSteps[RANK - 1] };
      for (const [ch, steps] of Object.entries(want)) {
        s.set(true);
        const on = condOf(M, s, ch, worn) - condOf(M, s, ch, []);
        if (Math.abs(on - steps) > 1e-9) return id + ' (' + t.when.metric + ') moved ' + ch + ' by ' + on + ' where it holds, not ' + steps;
        s.set(false);
        const off = condOf(M, s, ch, worn) - condOf(M, s, ch, []);
        if (off !== 0) return id + ' (' + t.when.metric + ') moved ' + ch + ' by ' + off + ' where it fails';
        if (s.wrongMove) {
          s.set(true);
          const other = condOf(M, s, ch, worn, s.wrongMove) - condOf(M, s, ch, [], s.wrongMove);
          if (other !== 0) return id + ' (a ' + t.move + ' Trait) moved ' + ch + ' by ' + other + ' on another kind of move';
        }
      }
    }
    return null;
  },
  families: (M) => {
    const S = M.GS.GEAR_STEPS, R3 = S.traitSteps[2];
    /* PARTY: Raised Colors on its wearer reaches the ranger, once with two wearers, never a monster, and not while its wearer is down */
    const s = scene(M, 'raised_colors');
    s.set(true);
    const ranger = s.party.find((u) => u.role === 'ranger');
    const asRanger = (wearers, dead) => {
      for (const u of s.party) M.TRR.syncTraits(u, wearers.includes(u) ? { wornTraits: [{ id: 'raised_colors', rank: 3 }] } : {});
      for (const u of wearers) u.alive = !dead;
      const inst = { world: { risk: 'steady', units: [...s.party, s.mon] }, ground: { id: G }, monsters: M.MONSTERS, tier: null, heroes: {}, atMs: 0 };
      const tr = {};
      M.A.blowAmount(inst, { source: ranger, target: s.mon, mean: 1000, el: 1000, rng: LOW, critMult: 1.5, tag: { id: 'basic' }, trace: tr });
      for (const u of wearers) u.alive = true;
      return tr.cond;
    };
    const none = asRanger([]);
    if (asRanger([s.w]) - none !== R3) return 'a party Trait on its wearer moved the ranger by ' + (asRanger([s.w]) - none) + ', not ' + R3;
    const two = s.party.filter((u) => u !== ranger).slice(0, 2);
    if (asRanger(two) - none !== R3) return 'two wearers of one party Trait counted ' + (asRanger(two) - none) + ' on an ally, not once';
    if (asRanger([s.w], true) !== none) return 'a party Trait reached an ally while its wearer was down';
    const rows = M.TRR.withTraits([], { world: { units: [...s.party, s.mon] }, heroes: {}, atMs: 0 }, s.mon, 'offense', { target: ranger, tag: null });
    if (rows.length) return 'a party Trait reached a monster';
    /* THE CAP: three rank 3 offense Traits that all hold are 20 together (the gear slice), never 30; a trade's cost is never clamped */
    const f = scene(M, 'early_start');
    f.set(true);
    f.party.forEach((u) => { u.hp = u.maxHp; });
    f.mon = { ...f.mon, statuses: [{ s: 'bleed' }] };
    const three = [{ id: 'early_start', rank: 3 }, { id: 'worrier', rank: 3 }, { id: 'slack_water', rank: 3 }];
    const capped = condOf(M, f, 'offense', three) - condOf(M, f, 'offense', []);
    if (capped !== S.conditionalStepsMax) return 'three rank 3 Traits that hold made ' + capped + ' steps, not the cap ' + S.conditionalStepsMax;
    const hb = scene(M, 'hasks_bargain');
    hb.set(true);
    const cost = condOf(M, hb, 'defense', [{ id: 'hasks_bargain', rank: 3 }, { id: 'first_rank', rank: 3 }]) - condOf(M, hb, 'defense', [{ id: 'first_rank', rank: 3 }]);
    if (cost !== -R3) return 'a trade\'s cost beside a defense gain moved the hero by ' + cost + ', not -' + R3;
    /* RUNNING LOW: Bottom of the Quiver's floor: 40 left of a hunt that packed 60 is never on */
    const q = scene(M, 'bottom_of_the_quiver');
    q.set(true);
    q.h = { hs: { bag: { bronze_arrows: { loaded: 60, left: 40 } } }, ammo: 'bronze_arrows' };
    if (condOf(M, q, 'offense', [{ id: 'bottom_of_the_quiver', rank: 3 }]) !== condOf(M, q, 'offense', [])) return 'a running-low Trait counted on a hunt that packed under its floor';
    /* THE HEAL'S OWN TARGET: Stair Bearer is on for a heal at the low tank, off for a heal at a low ranger */
    const sb = scene(M, 'stair_bearer');
    sb.set(true);
    const tankU = sb.party.find((u) => u.role === 'tank');
    const other = sb.party.find((u) => u.role === 'ranger');
    pctHp(other, 20);
    sb.to = other;
    if (condOf(M, sb, 'heal', [{ id: 'stair_bearer', rank: 3 }]) !== condOf(M, sb, 'heal', [])) return 'a tank-only heal Trait counted on a heal at another hero';
    sb.to = tankU;
    if (condOf(M, sb, 'heal', [{ id: 'stair_bearer', rank: 3 }]) - condOf(M, sb, 'heal', []) !== R3) return 'a tank-only heal Trait missed the heal at its low tank';
    return null;
  },
  'real-settle': async (M) => {
    const { loadPlay } = await import(pathToFileURL(join(M.root, 'tests/hunt-core/fixtures/play-ground.mjs')).href);
    const P = await loadPlay(M.root);
    const four = ['tank', 'ranger', 'mage', 'healer'];
    /* one Trait of each family: defense (tank), offense and a trade and running low (ranger, 120 Steel Arrows packed: the free rung,
       Bronze, never depletes), a move and a party-wide one (mage), heal on a target (healer) */
    const KIT = [[{ id: 'first_rank', rank: 3 }], [{ id: 'early_start', rank: 3 }, { id: 'hasks_bargain', rank: 3 }, { id: 'bottom_of_the_quiver', rank: 3 }],
      [{ id: 'file_breaker', rank: 3 }, { id: 'full_wick', rank: 3 }, { id: 'snuffed', rank: 3 }], [{ id: 'keepers_carry', rank: 3 }, { id: 'full_cellar', rank: 3 }]];
    /* every Trait worn must hold at least once (each names its family) */
    const FAMILY = { defense: ['first_rank'], offense: ['early_start'], trade: ['hasks_bargain'], low: ['bottom_of_the_quiver'], 'move (area)': ['file_breaker'],
      'move (spell)': ['full_wick'], party: ['snuffed'], 'heal (on a target)': ['keepers_carry'], heal: ['full_cellar'] };
    const go = (kit, windowMs) => {
      const tr = {};
      const r = P.run(G, 60, four, { spanMs: 900000, windowMs, secret: '-4611686018427387904', options: () => ({ risk: 'steady', danger: 570 }),
        equipment: (role, i, L) => ({ ...P.kitFor(L, role), ...(role === 'ranger' ? { ammo: 'steel_arrows' } : {}) }),
        bag: (role) => (role === 'ranger' ? { steel_arrows: { loaded: 120 } } : {}),
        ...(kit ? { traits: (r2, i) => kit[i] } : {}),
        onWindow: (out) => { for (const e of out.events || []) if (e && typeof e.tr === 'string') for (const id of e.tr.split(',')) tr[e.type + ':' + id] = (tr[e.type + ':' + id] || 0) + 1; } });
      return { sig: JSON.stringify({ t: r.totals, x: r.heroXp, tr }), tr };
    };
    const plain = go(null, 600000), closed = go(KIT, 600000), viewed = go(KIT, 100000);
    if (Object.keys(plain.tr).length) return 'a four with no Traits named one on an event';
    for (const [fam, ids] of Object.entries(FAMILY)) {
      for (const id of ids) if (!Object.keys(closed.tr).some((k) => k.endsWith(':' + id))) return 'the ' + fam + ' Trait ' + id + ' never held on the real settle; held: ' + JSON.stringify(closed.tr);
    }
    if (KIT.flat().some((w) => !Object.values(FAMILY).flat().includes(w.id))) return 'CONTROL: a worn Trait names no family';
    if (plain.sig === closed.sig) return 'the four with Traits played exactly the hunt of the four with none: the Traits never reached the engine';
    if (closed.sig !== viewed.sig) return 'the same Traits settled in 10-minute and 100-second windows played two hunts';
    return null;
  },
  'view-names': (M) => {
    if (!M.SN || !M.SN.traitNames) return 'src/render/source-names.js names no Trait';
    for (const [id, t] of Object.entries(M.GS.TRAITS)) if (M.SN.nameOf(id) !== t.name) return 'Trait ' + id + ' is named ' + JSON.stringify(M.SN.nameOf(id));
    const n = { name: (u) => (u === 1 ? 'Bran' : 'Barrow Pikeman'), isHero: (u) => u === 1, shoots: () => false };
    const hit = M.LOG.lineOf({ key: 'a', type: 'dmg', u: 2, t: 1, amount: 40, ability: 'basic', tr: 'last_file' }, n);
    if (!hit || !hit.text.includes('(Last File)') || hit.text.includes('last_file')) return 'the log line of a Trait-cut blow reads ' + JSON.stringify(hit && hit.text);
    const heal = M.LOG.lineOf({ key: 'b', type: 'heal', u: 1, t: 1, amount: 30, tr: 'full_cellar,keepers_carry' }, n);
    if (!heal || !heal.text.includes('(Full Cellar, Keeper\'s Carry)')) return 'the log line of a Trait-raised heal reads ' + JSON.stringify(heal && heal.text);
    const plain = M.LOG.lineOf({ key: 'c', type: 'dmg', u: 2, t: 1, amount: 40, ability: 'basic' }, n);
    if (!plain || plain.text.includes('(')) return 'a blow with no Trait reads ' + JSON.stringify(plain && plain.text);
    return null;
  },
  /* THE LAB'S KITS (tools/balance-program/trait-kits.mjs): what the sim measures Traits with must be wearable */
  'lab-kits': async (M) => {
    const TK = await (await import(pathToFileURL(join(M.root, 'tools/balance-program/trait-kits.mjs')).href)).loadTraitKits(M.root);
    const T = M.GS.TRAITS;
    const wearable = (kit, room) => {
      const per = {}, keys = new Set();
      for (const w of kit) {
        const t = T[w.id];
        if (!t || w.rank !== 3) return 'an unknown Trait or a rank under III: ' + JSON.stringify(w);
        if (keys.has(t.key)) return 'two Traits of key ' + t.key;
        keys.add(t.key); per[t.slot] = (per[t.slot] || 0) + 1;
        if (per[t.slot] > (room[t.slot] || 0)) return 'slot ' + t.slot + ' holds ' + per[t.slot] + ' past its room ' + (room[t.slot] || 0);
      }
      return null;
    };
    /* a two-handed hero: no shield slot, so no shield Trait */
    const room = TK.traitRoomOf({ weapon: 'w', helmet: 'h', body: 'b', pants: 'p', boots: 'o', gloves: 'g', belt: 'e', cape: 'c', necklace: 'n', ring1: 'r', ring2: 'r', earrings: 'a' }, {});
    if (room.shield !== 0 || room.ring !== 4 || room.weapon !== 2) return 'the room of a two-handed kit reads ' + JSON.stringify(room);
    for (const seat of ['tank', 'melee_dps', 'ranger', 'mage', 'healer']) {
      const k = TK.luckyKit(seat, room);
      const bad = wearable(k, room);
      if (bad) return 'the lucky ' + seat + ' kit: ' + bad;
      if (k.some((w) => T[w.id].best.seat !== seat)) return 'the lucky ' + seat + ' kit wears a Trait made for another seat';
    }
    const sets = TK.censusSets();
    const all = sets.flat();
    if (all.length !== Object.keys(T).length || new Set(all).size !== all.length) return 'the census sets cover ' + new Set(all).size + ' of ' + Object.keys(T).length + ' Traits';
    for (let i = 0; i < sets.length; i++) { const bad = wearable(TK.censusKit(i, null), Object.fromEntries(Object.keys(M.GS.GEAR_STEPS.traitSlots).map((s) => [s, 99]))); if (bad) return 'census set ' + i + ': ' + bad; }
    /* a theory: every seat's kit wearable, a party-wide key worn once in the party */
    const rates = [0, 1, 2, 3].map(() => Object.fromEntries(Object.keys(T).map((id) => [id, 0.5])));
    const kits = TK.theoryKits(['melee_dps', 'ranger', 'mage', 'healer'], [room, room, room, room], rates, [0.7, 0.2, 0.05, 0.05]);
    for (const k of kits) { const bad = wearable(k, room); if (bad) return 'a theory kit: ' + bad; }
    const party = kits.flat().filter((w) => T[w.id].scope === 'party').map((w) => T[w.id].key);
    if (new Set(party).size !== party.length) return 'a party-wide key worn twice in one party';
    return null;
  },
  dark: (M) => {
    if (M.GS.GEAR_STEPS.traitsLive !== false) return 'GEAR_STEPS.traitsLive is ' + M.GS.GEAR_STEPS.traitsLive + ': worn Traits are dark until wave 4';
    const allowed = new Set(['src/core/hunt/trait-rules.js', 'src/core/hunt-spawn.js', 'src/core/member.js']);
    const strip = (x) => x.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    const walk = (abs, rel, out) => {
      if (!existsSync(abs)) return out;
      for (const e of readdirSync(abs)) {
        const a = join(abs, e), r = rel + '/' + e;
        if (statSync(a).isDirectory()) walk(a, r, out); else if (/\.(m?js|ts)$/.test(e)) out.push([r, readFileSync(a, 'utf8')]);
      }
      return out;
    };
    const files = [...walk(join(M.root, 'src'), 'src', []), ...walk(join(M.root, 'supabase', 'functions'), 'supabase/functions', [])];
    if (files.length < 50) return 'CONTROL: ' + files.length + ' files read';
    for (const [rel, text] of files) if (!allowed.has(rel) && /\bwornTraits\b/.test(strip(text))) return rel + ' names wornTraits: it hands a hero a worn Trait while Traits are dark';
    /* none worn: no field, the rows untouched (no copy), the event carries nothing */
    const u = heroU('tank');
    M.TRR.syncTraits(u, { wornTraits: [{ id: 'last_file', rank: 1 }] });
    M.TRR.syncTraits(u, {});
    if (u.traitRules !== undefined) return 'a hero whose Traits went kept its rules';
    const rows = [];
    const inst = { world: { units: [u] }, heroes: {}, atMs: 0 };
    if (M.TRR.withTraits(rows, inst, u, 'offense', {}) !== rows || rows.length) return 'a hero with no Traits got rows';
    if (Object.keys(M.TRR.traitsField(undefined)).length) return 'an event with no Trait got a tr field';
    return null;
  },
};

const TR = 'src/core/hunt/trait-rules.js';
/* (every client tree: the log reads the shell's widgets, which read the DOM helpers) */
const VIEW_TREES = readdirSync(join(ROOT, 'src')).filter((d) => !['core', 'data', 'render'].includes(d) && statSync(join(ROOT, 'src', d)).isDirectory()).map((d) => 'src/' + d);
const mutants = [
  { name: 'the key rule keeps the first, not the larger', case: 'worn-list', edits: [[TR, '    if (!was || better(w, was)) byKey.set(t.key, w);', '    if (!was) byKey.set(t.key, w);']] },
  { name: 'a slot holds any number of Traits', case: 'worn-list', edits: [[TR, '    if (n >= roomOf(t.slot)) continue;\n', '']] },
  { name: 'heroSetup drops the worn list', case: 'worn-list', edits: [['src/core/hunt-spawn.js', '    ...(worn ? { wornTraits: worn } : {}),\n', '']] },
  { name: 'the pipeline never reads an offense Trait', case: 'every-trait', edits: [['src/core/hunt/amount.js', "withTraits(heroRows(source, 'offense', c).concat(auraRowsOn(inst, source)), inst, source, 'offense', c)", "heroRows(source, 'offense', c).concat(auraRowsOn(inst, source))"]] },
  { name: 'a defense Trait raises the blow at the hero', case: 'every-trait', edits: [['src/core/hunt/amount.js', "withTraits(heroRows(target, 'defense', c).concat(auraRowsOn(inst, target)), inst, target, 'defense', c)", "withTraits(heroRows(target, 'defense', c).concat(auraRowsOn(inst, target)), inst, target, 'offense', c)"]] },
  { name: 'a heal Trait never counts', case: 'every-trait', edits: [['src/core/hunt/amount.js', "withTraits(heroRows(u, 'heal', c).concat(auraRowsOn(inst, u)), inst, u, 'heal', c)", "heroRows(u, 'heal', c).concat(auraRowsOn(inst, u))"]] },
  { name: 'a Trait counts whatever its condition', case: 'every-trait', edits: [[TR, '  return whenHolds(cx, t.when);\n}', '  return true;\n}']] },
  { name: 'a narrowed Trait counts on any move', case: 'every-trait', edits: [[TR, '  if (t.move && !moveIs(t.move, cx)) return false;\n', '']] },
  { name: 'a trade has no cost', case: 'every-trait', edits: [[TR, " put('defense', -steps); }", ' }']] },
  { name: 'a boss Trait reads the hero\'s own target, not the blow', case: 'every-trait', edits: [[TR, "    case 'target_is_boss':", "    case 'target_is_boss_x':"]] },
  { name: 'the area count is never put on the cast', case: 'real-settle', edits: [['src/core/hunt/abilities.js', '      hitTag.area = reached.length;\n', '']] },
  { name: 'a party Trait reaches its wearer only', case: 'families', edits: [[TR, '    if (w.alive !== true || (w !== u && !isAlly(w, u))) continue;', '    if (w.alive !== true || w !== u) continue;']] },
  { name: 'a party Trait counts on every ally while its wearer is down', case: 'families', edits: [[TR, '    if (w.alive !== true || (w !== u && !isAlly(w, u))) continue;', '    if (w !== u && !isAlly(w, u)) continue;']] },
  { name: 'Traits are not held to the gear slice', case: 'families', edits: [[TR, "take(e, { slice: 'gear', raises: channel, steps: e.steps, key: e.t.key });", "take(e, { slice: 'build', raises: channel, steps: e.steps, key: e.t.key });"]] },
  { name: 'running low ignores the start floor', case: 'families', edits: [[TR, '  if (t.startMin && !startedWith(cx, t.startMin)) return false;\n', '']] },
  { name: 'a heal Trait reads the bar\'s ally, not its target', case: 'families', edits: [[TR, "      if (cx.channel !== 'heal' || w.subject === 'self') break;", '      break;']] },
  { name: 'the settle never syncs the Traits', case: 'real-settle', edits: [['src/core/combat-sim.js', '  syncTraits(u, m.hero);', '  void syncTraits;']] },
  { name: 'the member drops the worn list', case: 'real-settle', edits: [['src/core/member.js', "        ...(Array.isArray(h.wornTraits) && h.wornTraits.length ? { wornTraits: h.wornTraits } : {}),\n", '']] },
  { name: 'the dmg event drops the Traits', case: 'real-settle', edits: [['src/core/hunt/damage.js', '    return c.traits ? Object.assign(r, { traits: c.traits }) : r;', '    return r;']] },
  { name: 'the heal event drops the Traits', case: 'real-settle', edits: [['src/core/hunt/heal-rules.js', ', ...traitsField(cast && cast.tr) }));', ' }));']] },
  { name: 'the view names no Trait', case: 'view-names', edits: [['src/render/source-names.js', '  if (Object.hasOwn(TRAITS, id)) return TRAITS[id].name;\n', '']] },
  { name: 'the log forgets the Traits', case: 'view-names', edits: [['src/hunt-view/combat-log.js', 'text: ev.tr ? traitsSaid(ev, text) : text });', 'text });']] },
  { name: 'a Lab kit ignores a slot\'s room', case: 'lab-kits', edits: [['tools/balance-program/trait-kits.mjs', "      if (keys.has(t.key) || (used[t.slot] || 0) >= (room[t.slot] || 0)) continue;", '      if (keys.has(t.key)) continue;']] },
  { name: 'a Lab theory wears a party-wide key twice', case: 'lab-kits', edits: [['tools/balance-program/trait-kits.mjs', " || (isParty(id) && partyKeys.has(t.key))", '']] },
  { name: 'Traits switched on', case: 'dark', edits: [['src/data/gear-steps.js', '  traitsLive: false,', '  traitsLive: true,']] },
  { name: 'the settle hands a hero its worn Traits', case: 'dark', edits: [['src/core/combat-sim.js', '  syncTraits(u, m.hero);', '  syncTraits(u, { wornTraits: m.hero.wornTraits });']] },
  { name: 'a hero whose Traits went keeps its rules', case: 'dark', edits: [[TR, '  else if (u.traitRules !== undefined) delete u.traitRules;', '  else if (u.traitRules !== undefined) void 0;']] },
];

/* the suite: cases on the repo, each mutant on a planted copy must be caught (h1's rule) */
const R = makeReport('trait-rules');
const M0 = await load(ROOT);
for (const [cn, fn] of Object.entries(cases)) {
  let why = null;
  try { why = await fn(M0); } catch (e) { why = 'threw ' + (e && e.stack || e); }
  R.ok(!why, cn + ': ' + why);
}
if (!process.argv.includes('--no-mutants')) for (const mu of mutants) {
  if (!cases[mu.case]) { R.ok(false, 'mutant "' + mu.name + '" names no case ' + mu.case); continue; }
  /* the trees a planted run needs: the real settle's (play-ground.mjs) and, for the view's cases, the log's own import graph */
  const view = mu.case === 'view-names', lab = mu.case === 'lab-kits';
  const p = plant(mu.edits, ['src/render', 'supabase/functions/hr-accrue', 'tests/hunt-core/fixtures', ...(view ? VIEW_TREES : []), ...(lab ? ['tools/balance-program/trait-kits.mjs'] : [])]);
  try {
    let why = null;
    try { why = await cases[mu.case](await load(p.root)); } catch (e) { why = 'threw ' + e.message; }
    R.ok(caughtBy(why), 'mutant "' + mu.name + '" was NOT caught by ' + mu.case + missWhy(why));
  } finally { p.done(); }
}
if (!R.fails.length) console.log('  ' + Object.keys(cases).length + ' cases, ' + mutants.length + ' mutants caught');
R.finish();
