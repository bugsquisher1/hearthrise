// ════════════════════════════════════════════════════════════════════════
// src/shell/hunt-list.js — THE HUNTS A PLAYER CAN GO TO, AND WHAT TO CARRY.
//
// PURE. The Hunts window (src/shell/windows/hunts.js) draws one line per hunt
// ground row (src/data/hunt-grounds.js) joined to its hunt row (hunts.js): a
// new ground is a data row and shows up here with nothing else to edit.
//   huntRows()          [{ hunt, name, theme, band, heroes, packs, packMin,
//                          packMax, respawnS, boss }] in band order
//   packWords(row, n)   "6 packs of 7 · back in 60 s": the pull size the
//                        server spawns on the shown tier; the room as built only at 0
//   tierPull(row, tier, size)  how many monsters a pull brings on a tier for this group
//   tierWords(row, tier, size)  what a tier does, in plain words (hunt-tiers.js TIER_LINES; the numbers are the wiki's)
//   tierChoiceWords(row, tier, size)  the same choice in one line, beside Enter
//   bandWords(row, lv)  "Level 1 to 8" (+ ", you are 3" when known)
//   recommendation(levels, size)  the Hunts window's default pick for this hero
//                        or this party's levels, and a plain note when no ground
//                        built for the group holds them
//   partyNote(hunt)     the ground's party rule in words, from ITS row (the
//                        pocket carrying forParty and the boss standing in it),
//                        or '' for a ground with no party-only pocket
//   packFor(bag)        what the hunt carries: the bag's own hunt supplies,
//                        every stack, at most the server's line cap
//   bestWords(b, hunt)  this hero's personal bests on the ground, alone and
//                        in a party, from the server's `hunt_bests` section
//                        (one "No best here yet" line when it has none)
//   bestLine(b, hunt)   the list line's best Level XP an hour, or "No best yet"
//   fitWords(row, lv)   the list line's band against the Level, and its tone
// Nothing here is a gate: the server checks the band, the stamina and the
// stock when the player presses Enter, and says why it refuses.
// ════════════════════════════════════════════════════════════════════════
import { HUNT_GROUNDS, partyPullOf, underFloorSharePm } from '../data/hunt-grounds.js?v=0.2.118';
import { DEFAULT_TIER, TIER_NAME, TIER_LINES, TIER_DEATH_LINE, tierRowOf, pullOfTier } from '../data/hunt-tiers.js?v=0.2.118';
import { PARTY } from '../data/party.js?v=0.2.118';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.118';
import { MONSTERS } from '../data/monsters.js?v=0.2.118';
import { SUPPLIES } from '../data/supplies.js?v=0.2.118';
import { SESSION_LIMITS, DEATH_XP_LOSS } from '../data/hunt-sessions.js?v=0.2.118';
import { whole, gold } from '../render/format.js?v=0.2.118';
import { t, hasText } from '../render/player-text.js?v=0.2.118';

const PACK_QTY_MAX = 100000;
/* A party size in words (hunts.count_<n>, "two"), else the number. */
const countWords = (n) => (Number.isInteger(n) && hasText('hunts.count_' + n) ? t('hunts.count_' + n) : String(n));

/** "The Rat King is built for a group of two or more. Alone, you still fight him, and he can kill you." for this hunt's ground, or ''. */
export function partyNote(hunt) {
  const g = Object.values(HUNT_GROUNDS).find((r) => r.hunt === hunt);
  const p = g && g.pockets.find((q) => q.forParty);
  if (!p) return '';
  const boss = p.spawns.map((s) => MONSTERS[s.monster]).find((m) => m && m.boss === true);
  const n = countWords(p.forParty);
  /* A warning, never a gate (Tyler 2026-11-08: "Either they are strong enough to do the harder content or they aren't"): a lone hero walks the hall. */
  return boss ? t('hunts.party_boss', { boss: boss.name, n }) : t('hunts.party_hall', { n });
}

/** One line per hunt ground, lowest band first (ties by name). */
export function huntRows() {
  const out = [];
  for (const g of Object.values(HUNT_GROUNDS)) {
    const h = HUNT_INDEX[g.hunt];
    /* a staged hunt (hunts.js `staged`: built, art pending) is never listed; the server refuses it too */
    if (!h || h.staged === true) continue;
    const sizes = g.pockets.map((p) => p.spawns.length);
    out.push({
      /* A ground with a hall built for a party (a forParty pocket: the Rat King) is a PARTY ground to the advice,
         whatever its workbook column says (Tyler 2026-10-21: "The Sewer is a party hunt"): its fight is
         built for a party, so a lone hero is never pointed at it and is told it is best with one. */
      hunt: g.hunt, name: h.name, theme: h.theme || '', band: h.band.slice(),
      groupFit: g.pockets.some((p) => p.forParty) ? 'party' : g.groupFit,
      soloFrom: Number.isInteger(g.soloFrom) ? g.soloFrom : null,
      /* WHO MAY COME is the server's party size on every ground, never the ground's start tiles: two tiles read "up to 1 more"
         on the Thicket while the server walked in four (panel 2026-11-01; heroes past the tiles stand beside them). */
      heroes: PARTY.maxSize,
      packs: g.pockets.length, packMin: Math.min(...sizes), packMax: Math.max(...sizes), partyPull: g.partyPull || null,
      respawnS: Math.round(g.respawnMs / 1000),
      boss: g.pockets.some((p) => p.spawns.some((s) => MONSTERS[s.monster] && MONSTERS[s.monster].boss === true)),
    });
  }
  return out.sort((a, b) => a.band[0] - b.band[0] || (a.name < b.name ? -1 : 1));
}

/**
 * How crowded a ground is, in words: its packs, their size, the boss, the respawn. `n` is the
 * pull the server spawns this ground at on the shown tier (every pack holds n), 0 or unknown = the room as built.
 */
export function packWords(r, n) {
  const built = r.packMin === r.packMax ? String(r.packMin) : t('hunts.pack_range', { min: r.packMin, max: r.packMax });
  const picked = Number.isInteger(n) && n > 0;
  return t(r.boss ? 'hunts.packs_boss' : 'hunts.packs', { count: r.packs, size: picked ? n : built, secs: r.respawnS });
}

/** How many monsters a pull brings on tier `id` for a group of `size` (0 = the room as built: Normal alone). The tier's row, else the ground's own party pull. Pure. */
export function tierPull(r, id, size = 1) {
  return pullOfTier(tierRowOf(r.hunt, id), size) || partyPullOf(r, size);
}

/**
 * WHAT A TIER DOES, the page's words (Tyler 2026-11-08: "Simplify this ... it's way too 'exact' it seems AI"): the plain line for the tier
 * (hunt-tiers.js TIER_LINES), `more` when its pull brings more monsters at once than Normal does for this group, else `same`, and one short
 * death line. No percent, HP or blow here: the wiki says the numbers. Normal says '' (the ground as the page describes it). Pure.
 */
const tierLine = (r, tier, size) => { const L = TIER_LINES[tier.id]; return typeof L === 'string' ? L : tierPull(r, tier.id, size) > tierPull(r, DEFAULT_TIER, size) ? L.more : L.same; };
export function tierWords(r, id, size = 1) {
  const tier = tierRowOf(r.hunt, id);
  return tier.id === DEFAULT_TIER ? '' : [tierLine(r, tier, size), TIER_DEATH_LINE].join(' ');
}

/** The one line beside Enter, so a pick kept from last time is said at the press: "Deadly: big groups that hit hard." '' on Normal. Pure. */
export function tierChoiceWords(r, id, size = 1) {
  const tier = tierRowOf(r.hunt, id);
  if (tier.id === DEFAULT_TIER) return '';
  const first = tierLine(r, tier, size).split('. ')[0].replace(/\.$/, '');
  return t('hunts.tier_choice', { tier: TIER_NAME[tier.id], head: first.charAt(0).toLowerCase() + first.slice(1) });
}

/** The ground's level band in words, and where the character stands when its level is known. */
export function bandWords(r, level) {
  return Number.isInteger(level) ? t('hunts.band_you', { lo: r.band[0], hi: r.band[1], level }) : t('hunts.band', { lo: r.band[0], hi: r.band[1] });
}

/** Words on a hunt ABOVE the character's level, or null. The floor is only ever a warning (Tyler 2026-11-04 UTC: "big risks should include warnings
    but should allow the player to take them"): any hero may walk into any ground, and these words say what it is risking. Display only: the first
    press of Enter arms "Enter anyway" (hunts.js), and that one confirm is all that stands between a hero and a ground. */
/* THE MONSTERS ARE SIMPLY STRONGER (Tyler 2026-11-04: "it's inherent in the game, not a penalty driven system"): nothing in the fight reads a hero's Level against the ground. The claims are played on the
   real engine (tests/hunt-core/first-week-bands.mjs above-your-level-words), so a balance change that makes one false turns it red. */
export const ABOVE_LEVEL_WORDS = t('hunts.above_level');
/* FAR under a floor: the words and the list line lean harder. Display only. */
const FAR_UNDER_LEVELS = 10;
const FAR_WORDS = t('hunts.far_above_level');
/** cutPermille: the share of a death's XP loss the held Blessings remove, the server's (item-sections.js blessingsOf permille, hr_blessing_view);
    0 or absent says the unblessed share (designer re-read 2026-11-11: "lose 6%" with 3 of 3 on, where a death took 1.5%). */
export function rangeWords(r, level, cutPermille) {
  if (!Number.isInteger(level) || level >= r.band[0]) return null;
  const gap = r.band[0] - level;
  const cut = Number.isInteger(cutPermille) && cutPermille > 0 ? Math.min(1000, cutPermille) : 0;
  /* one decimal at most: 6% x (1 - 750/1000) = 1.5% */
  const loss = Math.round(DEATH_XP_LOSS * (1000 - cut) / 10 * 10) / 10;
  return [t('hunts.range_under', { count: gap }), (gap >= FAR_UNDER_LEVELS ? FAR_WORDS : ABOVE_LEVEL_WORDS),
    cut ? t('hunts.range_die_blessed', { loss }) : t('hunts.range_die', { loss })].join(' ');
}

/**
 * THE LEADER'S PICK, BEFORE IT GOES (panel 2026-11-01: a leader's Glade killed a Level 9 unasked; the floor stays a warning, Tyler
 * 10-18, and the pick the leader's, 10-20): the OTHER seats standing under this ground's floor, by the server's levels. Display only.
 */
export function seatsUnder(r, party) {
  const under = (party ? party.seats : []).filter((s) => s.seat !== party.me && Number.isInteger(s.level) && s.level < r.band[0]);
  return { under };
}

/** "Sorrel (Level 9) and Oren (Level 12) are under this ground's Level 16." or '' for nobody. Pure. */
export function underWords(r, seats) {
  if (!seats.length) return '';
  const names = seats.map((s) => t('hunts.seat_level', { name: s.name, level: s.level }));
  const who = names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names[0];
  return t('hunts.seats_under', { count: names.length, who, level: r.band[0] });
}

/** THE LEVEL SHARE IN WORDS (xp-share.js reads the same row): each seat, this hero included at `myLevel`, that keeps less than a full share of Level XP on this ground, or ''. Pure. */
export function shareWords(r, party, myLevel) {
  if (!party) return '';
  const seats = party.seats.map((s) => ({ me: s.seat === party.me, name: s.name, level: s.seat === party.me ? myLevel : s.level })).filter((s) => Number.isInteger(s.level));
  const top = Math.max(0, ...seats.map((s) => s.level));
  const ground = Object.values(HUNT_GROUNDS).find((g) => g.hunt === r.hunt);
  const low = seats.map((s) => ({ ...s, pm: underFloorSharePm(ground, s.level, top) })).filter((s) => s.pm < 1000);
  if (!low.length) return '';
  return low.map((s) => (s.me ? t('hunts.share_you', { pct: Math.max(1, Math.round(s.pm / 10)), top })
    : t('hunts.share_seat', { name: s.name, pct: Math.max(1, Math.round(s.pm / 10)), top }))).join(' ');
}

/** Is this ground built for a group of `partySize` (1 = alone)? A 'both' ground always is. */
export function fitsGroup(r, partySize) {
  return r.groupFit === 'both' || r.groupFit === ((Number(partySize) || 1) >= 2 ? 'party' : 'solo');
}

/* The party's levels in words: "Level 20", or "Levels 12 to 20" when they differ. */
const levelsWords = (lo, hi) => (lo === hi ? t('hunts.level_one', { level: lo }) : t('hunts.levels_range', { lo, hi }));

/**
 * THE ONE RECOMMENDATION (the Hunts window's default pick; tests/core-loop.mjs plays it), from the
 * rows alone. `levels` is the hero's Level, or every known Level in its party; `partySize` 1 = alone.
 * Among the grounds whose groupFit suits the group, highest floor first:
 *   1. one whose band holds every level;  2. one whose band holds the lowest level;
 *   3. none holds it: the nearest one BELOW the lowest level, with a note that says so plainly
 *      (and names a ground in band that wants a party, for a lone hero);
 *   4. no ground suits the group at all: the highest-floor ground in band, else the first ground.
 * A lone hero is never pointed at a party ground while a solo one exists. Advice only: every
 * ground stays enterable, the server decides.
 * @returns {{ row: object|null, note: string|null }}
 */
export function recommendation(levels, partySize = 1, rows = huntRows()) {
  const lv = [].concat(levels).filter(Number.isInteger);
  const best = (l) => l.slice().sort((x, y) => y.band[0] - x.band[0] || (x.name < y.name ? -1 : 1))[0] || null;
  if (!lv.length) return { row: rows[0] || null, note: null };
  const lo = Math.min(...lv), hi = Math.max(...lv);
  const holds = (r, from, to) => r.band[0] <= from && to <= r.band[1];
  const fit = rows.filter((r) => fitsGroup(r, partySize));
  const sure = best(fit.filter((r) => holds(r, lo, hi))) || best(fit.filter((r) => holds(r, lo, lo)));
  if (sure) return { row: sure, note: null };
  const alone = (Number(partySize) || 1) < 2;
  const below = fit.filter((r) => r.band[1] < lo).sort((x, y) => y.band[1] - x.band[1] || y.band[0] - x.band[0])[0];
  if (below) {
    const party = alone ? best(rows.filter((r) => !fitsGroup(r, 1) && holds(r, lo, lo))) : null;
    /* NO GROUND IS SOLO OR PARTY TO THE PLAYER (Tyler 2026-11-08: "So some of those are solo only and party only? That isn't really matching up
       with how we are planning the game"): the note says where the Levels are and what the tough ground costs, never who it is for. */
    const note = [t('hunts.no_ground', { levels: levelsWords(lo, hi) }), t('hunts.nearest_below', { ground: below.name, lo: below.band[0], hi: below.band[1] })]
      .concat(party ? [t('hunts.tough_at_level', { ground: party.name })] : []).join(' ');
    return { row: below, note };
  }
  return { row: best(rows.filter((r) => holds(r, lo, lo))) || rows[0] || null, note: null };
}

/** The recommended ground's row alone (see recommendation). */
export function recommendedHunt(levels, partySize = 1, rows = huntRows()) {
  return recommendation(levels, partySize, rows).row;
}

/**
 * THE LINE THE WINDOW OPENS ON, until a hand picks another: the advice's ground, or the harder ground this hero last hunted and came home from alive (first principle: a choice made once is
 * remembered; played 11-04, every opening at Level 22 put the pick back on the Glade after 5.6 h in the Warrens). The confirm press on that page still stands (Tyler 2026-11-04). Pure.
 * `last`: { huntId, endReason } of the hero's latest hunt, or null. Null when there is no row at all.
 */
export function openingPick(rec, list, last) {
  const advised = rec && rec.row ? rec.row : list[0] || null;
  const was = last && last.endReason !== 'died' ? list.find((r) => r.hunt === last.huntId) : null;
  return was && advised && was.band[0] > advised.band[0] ? was : advised;
}

/** THE LIST'S TWO TAGS on one ground: "Right for your level" on the advice, when its band truly holds the group (no note), and "Next step up" on the harder ground above it (hunt-tutorial.js nextStepUp). Pure. */
export function adviceTag(r, rec, step, party) {
  if (rec && rec.row && !rec.note && rec.row.hunt === r.hunt) return party ? t('hunts.tag_right_party') : t('hunts.tag_right_level');
  return step && step.hunt === r.hunt ? t('hunts.tag_next_step') : '';
}

/**
 * THIS hero's personal bests on a ground, in words, from the server's `hunt_bests` section
 * (hunt-sections.js huntBestsOf), for the picked ground's page: a line for each mode the hero has a
 * best in ("Best alone: 12,400 Level XP per hour · balance 3,100 gp per hour", "Best in a party: …"),
 * else ONE `none` line that says so and names the server's qualifying length (designer 2026-10-22:
 * eight "No hunt of 10 min yet" lines said nothing). Null when the server sent no section.
 */
export function bestWords(bests, hunt) {
  if (!bests) return null;
  const g = bests.grounds[hunt] || {};
  const rate = (b) => t('hunts.best_rate', { xp: whole(b.xpH), gold: gold(b.balanceH) });
  const solo = g.solo ? t('hunts.best_alone', { rate: rate(g.solo) }) : null;
  const party = g.party ? t('hunts.best_party', { rate: rate(g.party) }) : null;
  return { solo, party, none: solo || party ? null : t('hunts.best_none', { min: Math.round(bests.minMs / 60000) }) };
}

/**
 * The list line's best: this hero's higher Level XP an hour on the ground, alone or in a party
 * ("Best 12,400 Level XP/h"), or "No best yet" when it has none there (never "New" or "Not hunted yet": a hunt
 * under 10 minutes sets no best, and Pellow's twice-hunted Mill Cellar read "New", core-loop play 2026-10-30).
 * Null when the server sent no section.
 */
export function bestLine(bests, hunt) {
  if (!bests) return null;
  const g = bests.grounds[hunt] || {};
  const xp = Math.max(g.solo ? g.solo.xpH : -Infinity, g.party ? g.party.xpH : -Infinity);
  return Number.isFinite(xp) ? t('hunts.best_line', { xp: whole(xp) }) : t('hunts.best_line_none');
}

/**
 * Where the character's Level stands against a ground's band, for the list line: `words` and the
 * `tone` its token colour reads from. 'in' inside the band; 'above' under the floor; 'far' FAR_UNDER_LEVELS or more under;
 * 'below' over the band's top (little XP). Null when the Level is not known. Display only.
 */
export function fitWords(r, level) {
  if (!Number.isInteger(level)) return null;
  if (rangeWords(r, level)) return r.band[0] - level < FAR_UNDER_LEVELS ? { words: t('hunts.fit_above'), tone: 'above' } : { words: t('hunts.fit_far'), tone: 'far' };
  return level > r.band[1] ? { words: t('hunts.fit_below'), tone: 'below' } : { words: t('hunts.fit_in'), tone: 'in' };
}

/** Who may come: "Alone or with up to 3 more" on every ground, or "One hero". No ground is solo or party (Tyler 2026-11-08): a boss built
    for a group says so in its own warning (partyNote), and no rule holds a lone hero out. */
export function heroWords(r) {
  return r.heroes > 1 ? t('hunts.heroes_up_to', { n: r.heroes - 1 }) : t('hunts.heroes_one');
}

/**
 * What a hunt carries from the bag: every hunt supply the bag holds, the whole
 * stack (own stock is used first, then the store per use). Largest stacks first
 * when there are more kinds than the server takes lines.
 * @param {{id: string, qty: number}[]|null} bag
 * @returns {{item: string, qty: number}[]}
 */
export function packFor(bag) {
  return (bag || []).filter((r) => SUPPLIES[r.id])
    .map((r) => ({ item: r.id, qty: Math.min(PACK_QTY_MAX, r.qty) }))
    .filter((l) => l.qty > 0)
    .sort((a, b) => b.qty - a.qty || (a.item < b.item ? -1 : 1))
    .slice(0, SESSION_LIMITS.bagLines);
}
