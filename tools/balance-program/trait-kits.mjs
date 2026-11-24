// ════════════════════════════════════════════════════════════════════════
// tools/balance-program/trait-kits.mjs — RARE AND VERY RARE KITS: the Traits a hero's pieces carry in the Lab (systems, lane/traits-in-engine,
// 2026-11-23; the engine plays them through src/core/hunt/trait-rules.js, handed as `wornTraits`; docs/design/redesign/12-targets.md 8, 8.1).
//
// EVERY KIT IS A RULE, never a hand-typed list. A hero carries Traits only on the slots its kit wears (a shield Trait on a shield, never on
// a spellbook or beside a two-handed weapon; a ring Trait on either ring), at most a Very Rare's two a piece (GEAR_STEPS.traitsByRarity), and
// the engine's key rule counts one Trait a key (trait-rules.js wornTraitsOf), so a kit here holds one a key already.
//   lucky    THE LUCK CEILING, not chosen for the ground: every Trait sized for the hero's own seat (traits.js `best.seat`) at rank III, each
//            on a Very Rare of its slot, while the slot has room (a tie on a key: the party-wide one, then the lower number). What a hero who
//            kept every rank III piece made for its seat wears, wherever it hunts
//   theory   THEORYCRAFTED FOR THE GROUND: from all 40 at rank III, the Traits that measured to hold most on this ground for this hero
//            (census below), placed greedily by expected steps: hold share x the rank's steps x what the channel is worth to the seat
//            (offense 1; defense 4 x the hero's share of the damage the four took, so the front seat values it most; heal 1 on a healer),
//            a party-wide Trait valued over every hero it reaches and worn once, and no channel valued past the gear slice's cap
//   census   THE MEASURING KITS: the 40 cut into the fewest sets a hero can wear at once (each slot within its room, one Trait a key); every
//            hero wears set k in census pass k, and the run's events (`tr`) give each Trait's hold share for each seat
//
//   traitRoomOf(kit, ITEMS)                    { trait slot: room } a worn kit gives (0 where the slot is not worn)
//   luckyKit(seat, room)                       [{ id, rank }]
//   censusSets(room?)                          [[id]] covering all 40, each wearable on a full kit (room null: every slot worn)
//   censusKit(k, room)                         census pass k's [{ id, rank }] as far as a hero's worn slots carry it
//   theoryKits(seats, rooms, rates, taken)     [[{ id, rank }] per seat]; rates { seat index: { traitId: share } }, taken [share per seat]
//
// PURE: data in, kits out (reads src/data/gear-steps.js only).
// ════════════════════════════════════════════════════════════════════════
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const RANK_III = 3;

export async function loadTraitKits(root) {
  const { GEAR_STEPS, TRAITS } = await import(pathToFileURL(join(root, 'src/data/gear-steps.js')).href);
  const PER_PIECE = Math.max(...Object.values(GEAR_STEPS.traitsByRarity));
  const ids = Object.keys(TRAITS).sort((a, b) => TRAITS[a].n - TRAITS[b].n);
  const isParty = (id) => TRAITS[id].scope === 'party';
  /* the steps a Trait gives at rank III in the channel it raises (a trade: its gain, offense; its cost, defense, is valued apart) */
  const stepsOf = (id) => (TRAITS[id].trade ? GEAR_STEPS.tradeSteps[RANK_III - 1] : GEAR_STEPS.traitSteps[RANK_III - 1]);
  const costOf = (id) => (TRAITS[id].trade ? GEAR_STEPS.traitSteps[RANK_III - 1] : 0);
  const channelOf = (id) => (TRAITS[id].trade ? 'offense' : TRAITS[id].raises);

  function traitRoomOf(kit, ITEMS) {
    const out = {};
    for (const [slot, equip] of Object.entries(GEAR_STEPS.traitSlots)) {
      out[slot] = equip.filter((e) => {
        const id = kit && kit[e];
        if (!id) return false;
        if (slot === 'shield') return !!ITEMS && !!ITEMS[id] && ITEMS[id].offhand === 'shield';
        return true;
      }).length * PER_PIECE;
    }
    return out;
  }
  const FULL = Object.fromEntries(Object.entries(GEAR_STEPS.traitSlots).map(([s, e]) => [s, e.length * PER_PIECE]));

  /* place `want` (ids, in order) on a kit with `room`: one a key, each slot within its room */
  function place(want, room, keys = new Set()) {
    const used = {}, out = [];
    for (const id of want) {
      const t = TRAITS[id];
      if (keys.has(t.key) || (used[t.slot] || 0) >= (room[t.slot] || 0)) continue;
      keys.add(t.key); used[t.slot] = (used[t.slot] || 0) + 1;
      out.push({ id, rank: RANK_III });
    }
    return out;
  }

  function luckyKit(seat, room) {
    const mine = ids.filter((id) => TRAITS[id].best.seat === seat);
    /* the key rule's tie order: the party-wide one first, then the lower number */
    mine.sort((a, b) => (isParty(b) ? 1 : 0) - (isParty(a) ? 1 : 0) || TRAITS[a].n - TRAITS[b].n);
    return place(mine, room || FULL);
  }

  function censusSets(room) {
    const r = room || FULL;
    const sets = [];
    for (const id of ids) {
      const t = TRAITS[id];
      let s = sets.find((x) => !x.keys.has(t.key) && (x.used[t.slot] || 0) < (r[t.slot] || 0));
      if (!s) { if (!(r[t.slot] > 0)) continue; s = { ids: [], keys: new Set(), used: {} }; sets.push(s); }
      s.ids.push(id); s.keys.add(t.key); s.used[t.slot] = (s.used[t.slot] || 0) + 1;
    }
    return sets.map((s) => s.ids);
  }

  function theoryKits(seats, rooms, rates, taken) {
    const n = seats.length;
    const weight = (i, ch) => (ch === 'offense' ? 1 : ch === 'defense' ? 4 * (Number(taken && taken[i]) || 0) : seats[i] === 'healer' ? 1 : 0);
    const rate = (i, id) => Number((rates[i] || {})[id]) || 0;
    const CAP = GEAR_STEPS.conditionalStepsMax;
    /* expected steps already placed: [seat][channel] */
    const filled = Array.from({ length: n }, () => ({ offense: 0, defense: 0, heal: 0 }));
    const used = Array.from({ length: n }, () => ({})), keys = Array.from({ length: n }, () => new Set()), partyKeys = new Set();
    const kits = Array.from({ length: n }, () => []);
    /* the value of putting `id` on seat i now: its expected steps on every hero it reaches, each held to what is left under the cap */
    const value = (i, id) => {
      const ch = channelOf(id), to = isParty(id) ? seats.map((_, j) => j) : [i];
      /* (a trade's cost is taken whenever its gain holds: never capped) */
      return to.reduce((a, j) => a + weight(j, ch) * Math.min(rate(j, id) * stepsOf(id), Math.max(0, CAP - filled[j][ch])) - weight(j, 'defense') * rate(j, id) * costOf(id), 0);
    };
    for (;;) {
      let best = null;
      for (let i = 0; i < n; i++) for (const id of ids) {
        const t = TRAITS[id];
        if (keys[i].has(t.key) || (isParty(id) && partyKeys.has(t.key)) || (used[i][t.slot] || 0) >= (rooms[i][t.slot] || 0)) continue;
        const v = value(i, id);
        if (v > 1e-6 && (!best || v > best.v + 1e-12)) best = { i, id, v };
      }
      if (!best) break;
      const { i, id } = best, t = TRAITS[id], ch = channelOf(id);
      kits[i].push({ id, rank: RANK_III });
      keys[i].add(t.key); used[i][t.slot] = (used[i][t.slot] || 0) + 1;
      if (isParty(id)) partyKeys.add(t.key);
      for (const j of isParty(id) ? seats.map((_, k) => k) : [i]) filled[j][ch] += rate(j, id) * stepsOf(id);
    }
    return kits.map((k) => k.sort((a, b) => TRAITS[a.id].n - TRAITS[b.id].n));
  }

  /* census pass k's kit for a hero with `room`: set k as far as its worn slots carry it */
  const censusKit = (k, room) => place(censusSets()[k] || [], room || FULL);
  return { TRAITS, GEAR_STEPS, traitRoomOf, luckyKit, censusSets, censusKit, theoryKits, channelOf };
}
