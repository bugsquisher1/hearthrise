// ════════════════════════════════════════════════════════════════════════
// src/data/factions.js — THE TWO FACTIONS: WHO MAY JOIN, WHAT STANDING IS, WHAT A SWAP COSTS, WHAT STANDING BUYS (Tyler 2026-11-14;
//   the board's "2026-11-14 The Morrow Hills" §6, lane/d-next-region; server half supabase/migrations/2027-04-22-faction-standing.sql).
//
// The First Flame and the Last Ember. Neither is evil, Havora belongs to neither, no gate or price anywhere reads a faction, and there is
// NO STAT BUFF: standing buys looks only. The sides themselves (their ids) are the ground shape's vocabulary, src/data/grounds/shape.js
// STANDING_SIDES, because a hunt row names the side its ground pays (`standingFor`). Their words come with the client lane, from the one
// text home (the designer: Holly's and Harry's names live in ONE row each, and no id here spells either).
//
// STANDING: one point a settled hunting minute on a ground whose `standingFor` is the hero's side, credited by the server's settle, never
// by a browser. Kept per side and never lost, so a hero who swaps keeps both totals. The server stores milliseconds (a 10 s settle is a
// sixth of a point) and a point is a whole minute of them.
// JOINING: once, after the hero's first kill of `joinAfter`, counted by the server (player_progress ev:kill_monster:<id>).
// SWAPPING (Tyler: "like 10 hours of hunting something with a week cooldown"): start a swap, hunt `swapMinutes` on grounds that pay the
// NEW side (they pay no standing meanwhile), then finish it. A swap can't start within `swapCooldownDays` of the hero's last change.
// THE DAY'S CEILING: a hero is credited at most `dayCapMinutes` of standing and swap time together per UTC day. 24 h: the 12 h premium
// pool and six 4 h refills (stamina-refill.js) let a hero hunt the whole day, so the ceiling is the clock's, a fuse that holds even if a
// window were ever counted twice.
//
// THE GROUND RULE (factionGroundProblems, held by tests/faction-ground-balance.mjs): every hunt row names a region; every ground of a region
// after `standingAfter` pays one side and no ground before it pays any; each such region OPENS as many grounds for one side as the other;
// a keyed hall counts with its ground; a region kit that lists a ground agrees on its region. The design put this check in
// catalogue-coherence.js, which the page loads: it lives here so the client's module graph doesn't grow for a rule only a guard reads.
//
// PURE ESM. Data, a validator and the ground rule. Never imported by the engine or the page (tests/faction-ground-balance.mjs FG-EDGE).
// ════════════════════════════════════════════════════════════════════════
import { REGIONS, STANDING_SIDES } from './grounds/shape.js?v=0.2.136';
import { HUNTS, CALLED_HUNTS, HALL_HUNTS, TRAINING_HUNTS } from './hunts.js?v=0.2.136';
import { HUNT_GROUNDS } from './hunt-grounds.js?v=0.2.136';
import { MONSTERS } from './monsters.js?v=0.2.136';
import { REGION_KITS } from './world/region-kits.js?v=0.2.136';

export const FACTION_RULES = Object.freeze({
  /* The monster whose first server-counted kill opens joining: Lord Krell, his hall in Krell's Hold (src/data/grounds/krells_hold). */
  joinAfter: 'lord_krell',
  /* Every region AFTER this one pays standing on every ground (Tyler: "after krell is killed, each new zone has equal amounts"). */
  standingAfter: 'barrow_march',
  swapMinutes: 600,
  swapCooldownDays: 7,
  dayCapMinutes: 24 * 60,
});

/* WHAT STANDING BUYS: each side's outfit and two add-ons, claimed once each at its standing (hours, the designer's proposed numbers).
   The mark by the name plate comes with joining and is no claim. Looks only: the art lane makes them, the outfit catalogue serves them. */
export const FACTION_OUTFITS = Object.freeze({
  flamebearer: Object.freeze({ side: 'first_flame', hours: 25 }),
  flamebearer_shield: Object.freeze({ side: 'first_flame', hours: 100 }),
  flamebearer_light: Object.freeze({ side: 'first_flame', hours: 300 }),
  emberkeeper: Object.freeze({ side: 'last_ember', hours: 25 }),
  emberkeeper_lantern: Object.freeze({ side: 'last_ember', hours: 100 }),
  emberkeeper_coal: Object.freeze({ side: 'last_ember', hours: 300 }),
});

const whole = (v, lo, hi) => Number.isInteger(v) && v >= lo && v <= hi;

/** Every problem with the rules and the pieces, as sentences. Empty = valid. Pure. */
export function validateFactions(rules = FACTION_RULES, outfits = FACTION_OUTFITS) {
  const out = [];
  if (typeof rules.joinAfter !== 'string' || !/^[a-z0-9_]{1,40}$/.test(rules.joinAfter)) out.push('joinAfter is not a monster id');
  if (!REGIONS.includes(rules.standingAfter)) out.push('standingAfter ' + rules.standingAfter + ' is not a region (shape.js REGIONS)');
  if (!whole(rules.swapMinutes, 1, 100000)) out.push('swapMinutes is not a whole number of minutes');
  if (!whole(rules.swapCooldownDays, 0, 365)) out.push('swapCooldownDays is not a whole number of days');
  if (!whole(rules.dayCapMinutes, 1, 24 * 60)) out.push('dayCapMinutes is not a whole number of minutes in one day');
  const per = Object.fromEntries(STANDING_SIDES.map((s) => [s, 0]));
  for (const [id, p] of Object.entries(outfits)) {
    if (!/^[a-z0-9_]{1,32}$/.test(id)) out.push(id + ' is not a piece id');
    if (/holly|harry/i.test(id)) out.push(id + ' spells a hero\'s name, which lives in the text home only');
    if (!p || !STANDING_SIDES.includes(p.side)) { out.push(id + ' names no side'); continue; }
    if (!whole(p.hours, 1, 100000)) out.push(id + ' takes no whole number of hours');
    per[p.side] += 1;
  }
  for (const [s, n] of Object.entries(per)) if (!n) out.push(s + ' has no piece to claim');
  return out;
}

/**
 * The ground rule's problems, as sentences (FG-* names the clause). Empty = holds. Every input defaults to the data, so a guard can hand
 * it a planted copy. `grounds` are the hunt rows of walkable grounds (HUNTS: base and packs, staged included); `rooms` every other row.
 * @param {{grounds?: readonly any[], rooms?: readonly any[], regions?: readonly string[], rules?: typeof FACTION_RULES,
 *   kits?: Record<string, any>, maps?: Record<string, string>, monsters?: Record<string, any>, outfits?: typeof FACTION_OUTFITS}} [o]
 */
export function factionGroundProblems(o = {}) {
  const grounds = o.grounds || HUNTS, rooms = o.rooms || [...CALLED_HUNTS, ...HALL_HUNTS, ...TRAINING_HUNTS];
  const regions = o.regions || REGIONS, rules = o.rules || FACTION_RULES, kits = o.kits || REGION_KITS;
  const maps = o.maps || Object.fromEntries(Object.entries(HUNT_GROUNDS).map(([id, g]) => [id, g.map]));
  const monsters = o.monsters || MONSTERS;
  const out = validateFactions(rules, o.outfits || FACTION_OUTFITS).map((p) => 'FG-RULES ' + p);
  const after = regions.indexOf(rules.standingAfter);
  const pays = (h) => regions.indexOf(h.region) > after;
  for (const h of [...grounds, ...rooms]) {
    if (!regions.includes(h.region)) out.push(`FG-REGION ${h.id} names no region (${h.region})`);
    if ('standingFor' in h && !STANDING_SIDES.includes(h.standingFor)) out.push(`FG-SIDE ${h.id} pays standing to ${h.standingFor}, no side`);
  }
  for (const h of grounds) {
    if (!regions.includes(h.region)) continue;
    if (pays(h) && !h.standingFor) out.push(`FG-FIELD ${h.id} stands in ${h.region}, after ${rules.standingAfter}, and pays no side`);
    if (!pays(h) && h.standingFor) out.push(`FG-FIELD ${h.id} stands in ${h.region}, before Krell falls, and pays ${h.standingFor}`);
  }
  const byId = Object.fromEntries(grounds.map((h) => [h.id, h]));
  for (const r of rooms) {
    const g = r.hall ? byId[r.id.replace(/_hall$/, '')] : null;
    const want = g ? g.standingFor : undefined;
    if (r.standingFor !== want) out.push(`FG-ROOM ${r.id} pays ${r.standingFor || 'no side'}, and ${g ? 'its ground pays ' + (want || 'none') : 'only a hall counts with a ground'}`);
    if (g && r.region !== g.region) out.push(`FG-ROOM ${r.id} stands in ${r.region}, its ground in ${g.region}`);
  }
  for (const reg of regions.slice(after + 1)) {
    const open = grounds.filter((h) => h.region === reg && h.staged !== true);
    const n = STANDING_SIDES.map((s) => open.filter((h) => h.standingFor === s).length);
    if (new Set(n).size > 1) out.push(`FG-EVEN ${reg} opens ${STANDING_SIDES.map((s, i) => n[i] + ' for ' + s).join(' and ')}`);
  }
  for (const [reg, kit] of Object.entries(kits)) {
    for (const h of grounds) if (maps[h.id] && kit.grounds && maps[h.id] in kit.grounds && h.region !== reg) out.push(`FG-KIT ${h.id} names ${h.region}, and the ${reg} kit paints its map`);
  }
  const krell = monsters[rules.joinAfter];
  if (!krell || krell.boss !== true) out.push(`FG-JOIN ${rules.joinAfter} is not a boss in the monster rows`);
  return out;
}
