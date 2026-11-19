// ════════════════════════════════════════════════════════════════════════
// src/shell/hunt-list.js — THE HUNTS A PLAYER CAN GO TO, AND WHAT TO CARRY.
//
// PURE. The Hunts window (src/shell/windows/hunts.js) draws one line per hunt
// ground row (src/data/hunt-grounds.js) joined to its hunt row (hunts.js): a
// new ground is a data row and shows up here with nothing else to edit.
//   huntRows()          [{ hunt, name, theme, band, heroes, packs, packMin,
//                          packMax, respawnS, boss }] in band order
//   packWords(row, n)   "6 packs of 7 · respawns every 60 seconds": the pull size the
//                        server spawns on the shown tier; the room as built only at 0
//   tierPull(row, tier, size)  how many monsters a pull brings on a tier for this group
//   tierWords(row, tier, size)  what a tier does, in plain words (hunt-tiers.js TIER_LINES; the numbers are the wiki's)
//   tierChoiceWords(row, tier, size)  the same choice in one line, beside Enter
//   bandWords(row, lv)  "Level 1 to 8" (+ ", you are 3" when known)
//   recommendation(levels, size)  the Hunts window's default pick for this hero
//                        or this party's levels, and a plain note when no ground
//                        built for the group holds them
//   nextGroundFrom(hunt, levels, size)  the advice's ground when it is a step up from `hunt` (the summary's Next ground)
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
import { HUNT_GROUNDS, underFloorSharePm } from '../data/hunt-grounds.js?v=0.2.140';
import { DEFAULT_TIER, TIER_NAME, TIER_LINES, TIER_DEATH_LINE, tierRowOf, pullOfTier, isHealerTier } from '../data/hunt-tiers.js?v=0.2.140';
import { PARTY } from '../data/party.js?v=0.2.140';
import { partyBestLine } from '../data/party-class-xp.js?v=0.2.140';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.140';
import { MONSTERS } from '../data/monsters.js?v=0.2.140';
import { SUPPLIES, healerWanted } from '../data/supplies.js?v=0.2.140';
import { SESSION_LIMITS, DEATH_XP_LOSS } from '../data/hunt-sessions.js?v=0.2.140';
import { whole, gold } from '../render/format.js?v=0.2.140';
import { t } from '../render/player-text.js?v=0.2.140';

const PACK_QTY_MAX = 100000;
/* A line of several labels: each on its own line (the warning keeps line breaks, windows.css). */
const LINES = '\n';
/* The advice over the list stays one line (it shares the window's height with the page): its two labels as two fragments. */
const ADVICE = '. ';

/** "Recommended: 2+ players" for this hunt's ground (Tyler 2026-11-14: a label, not a sentence), or ''. */
export function partyNote(hunt) {
  const g = Object.values(HUNT_GROUNDS).find((r) => r.hunt === hunt);
  const p = g && g.pockets.find((q) => q.forParty);
  /* A warning, never a gate (Tyler 2026-11-08: "Either they are strong enough to do the harder content or they aren't"): a lone hero walks the hall. */
  return p ? t('hunts.party_size', { n: p.forParty }) : '';
}

/**
 * "The Barrow Knights here hit harder than food can keep up with. Bring a Healer. …" for a ground whose bag guide says a hero fighting
 * this way at this Level is measured to need one (supplies.js healerWanted), or ''. `healed`: the hero is a Healer or its party has one.
 * The monster named is the ground's hardest hitter, from its own rows (the highest Level among its spawns). Never a gate.
 */
export function healerNote(hunt, level, discipline, healed) {
  if (healed || !healerWanted(hunt, Number.isInteger(level) ? level : null, discipline)) return '';
  const h = HUNT_INDEX[hunt];
  const top = h ? h.spawns.map((s) => MONSTERS[s.monster]).filter((m) => m && m.boss !== true).sort((a, b) => (b.level || 0) - (a.level || 0))[0] : null;
  return top ? t('hunts.wants_healer', { monster: top.name }) : '';
}

/* WHAT A PARTY EARNS HERE, MEASURED (lane/a-party-advice-glade): by party size 2..PARTY.maxSize, the most a mixed party earns against the same heroes
   alone on any tier this ground offers, whole percent (party-class-xp.js partyBestLine: the Party window's own lines, written from the real settle by
   tests/party-class-xp-line.mjs --mixed --write); null for a size with no line. */
function partyBestOf(groundId) {
  const out = {};
  for (let n = 2; n <= PARTY.maxSize; n++) out[n] = partyBestLine(groundId, n);
  return Object.freeze(out);
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
      partyBest: partyBestOf(g.id),
      /* WHO MAY COME is the server's party size on every ground, never the ground's start tiles: two tiles read "up to 1 more"
         on the Thicket while the server walked in four (panel 2026-11-01; heroes past the tiles stand beside them). */
      heroes: PARTY.maxSize,
      packs: g.pockets.length, packMin: Math.min(...sizes), packMax: Math.max(...sizes),
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

/** How many monsters a pull brings on tier `id` for a group of `size` (0 = the room as built: Normal, for every group since Tyler 2026-11-11). The tier's row. Pure. */
export function tierPull(r, id, size = 1) {
  return pullOfTier(tierRowOf(r.hunt, id), size);
}

/**
 * WHAT A TIER DOES, the page's words (Tyler 2026-11-08: "Simplify this ... it's way too 'exact' it seems AI"): the plain line for the tier
 * (hunt-tiers.js TIER_LINES), `more` when its pull brings more monsters at once than Normal does for this group, else `same`, and one short
 * death line. No percent, HP or blow here: the wiki says the numbers. Normal says '' (the ground as the page describes it). Pure.
 */
const tierLine = (r, tier, size) => { const L = TIER_LINES[tier.id]; return typeof L === 'string' ? L : tierPull(r, tier.id, size) > tierPull(r, DEFAULT_TIER, size) ? L.more : L.same; };
/* `level`: the server's Level for this hero (null: unknown). A Healer's tier on this ground (hunt-tiers.js HEALER_TIERS, measured) adds its
   line under the Level it was measured to hold to, for a hero alone and a party alike (lane/a-honest-lines, re-landed by lane/a-honesty-rescue). */
export function tierWords(r, id, size = 1, level = null) {
  const tier = tierRowOf(r.hunt, id);
  if (tier.id === DEFAULT_TIER) return '';
  const healer = isHealerTier(r.hunt, tier.id, level) ? [t('hunts.tier_healer')] : [];
  return [tierLine(r, tier, size), ...healer, TIER_DEATH_LINE].join('\n');
}

/** The one line beside Enter, so a pick kept from last time is said at the press: "Deadly: big groups that hit hard." '' on Normal. Pure. */
export function tierChoiceWords(r, id, size = 1) {
  const tier = tierRowOf(r.hunt, id);
  if (tier.id === DEFAULT_TIER) return '';
  const first = tierLine(r, tier, size).split('\n')[0].replace(/\.$/, '');
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
    cut ? t('hunts.range_die_blessed', { loss }) : t('hunts.range_die', { loss })].join(LINES);
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
  const who = names.join(', ');
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
    : t('hunts.share_seat', { name: s.name, pct: Math.max(1, Math.round(s.pm / 10)), top }))).join(LINES);
}

/**
 * Does the advice send a group of `partySize` (1 = alone) here? A hero alone: any ground not built for a party (groupFit 'party', or a hall that
 * needs one: Tyler 2026-10-21, "a fresh solo melee should be starting in the thicket"). A PARTY: a ground where a mixed party of its size earns at
 * least what the same heroes earn alone on some tier it offers, MEASURED (partyBest; Tyler 2026-11-16's bar, "every Dangerous/Deadly party mix stays
 * >= the same heroes alone"), never a hand tag. The workbook's groupFit 'solo' sat on Wickstead and the Glade (Tyler 2026-11-16: no ground is solo)
 * and sent a four at 16-31 to the Sewer: tools/balance-sim/party-advice-table.mjs, a four at 16 earns a head 52.4k Level XP an hour on the Sewer's
 * best tier against 55.7k / 74.1k / 93.6k on the Glade's Normal / Dangerous / Deadly. The first grounds' small packs leave a four walk-bound
 * (the Cellar, the Thicket and Wickstead read under alone on every tier), so a four from 8 to 15 still goes to the Sewer (42.7k at 13 against
 * Wickstead's 23.1k).
 * OVER ALONE, NOT EVEN (lane/d-harder-monsters, 2026-11-19): a party suits a ground its line puts OVER its heroes alone (> 0). With monsters a tenth
 * harder a hero alone dies more on Wickstead's Deadly, and a mixed pair's line there read 0 (was -5): at ">= 0" the highest floor that broke even
 * took a pair at 8-15 off the Sewer, where the same pair earns +10 to +15 (tests/hunt-floor-warning.mjs G4, G8). Breaking even is no reason to send
 * a party anywhere; Tyler 2026-11-16's ">= the same heroes alone" is the bar the harder tiers are tuned to, not where the advice sends a party.
 */
export function fitsGroup(r, partySize) {
  const n = Number(partySize) || 1;
  if (n < 2) return r.groupFit !== 'party';
  const best = r.partyBest ? r.partyBest[Math.min(n, PARTY.maxSize)] : null;
  return Number.isInteger(best) && best > 0;
}

/* The party's levels in words: "Level 20", or "Levels 12 to 20" when they differ. */
const levelsWords = (lo, hi) => (lo === hi ? t('hunts.level_one', { level: lo }) : t('hunts.levels_range', { lo, hi }));

/**
 * THE ONE RECOMMENDATION (the Hunts window's default pick; tests/core-loop.mjs plays it), from the
 * rows alone. `levels` is the hero's Level, or every known Level in its party; `partySize` 1 = alone.
 * Among the grounds that suit the group (fitsGroup: a party's is measured), highest floor first (harder pays more:
 * tools/balance-sim/party-advice-table.mjs plays it for a party), a party breaking a tie of floors by its measured line:
 *   1. one whose band holds every level;  2. one whose band holds the lowest level;
 *   3. none holds it: the nearest one BELOW the lowest level. The note says so plainly: when a ground
 *      built otherwise holds the Level, it names THAT ground as right for the Level (the list reads
 *      "In your range" on it) and says what makes the one below the easier pick: its monsters are tough,
 *      or, from the server's `bests` (hunt_bests), that this hero lost gold there alone. "No good hunt"
 *      only when no ground holds the Level at all (Tyler 2026-11-11: the line contradicted the row);
 *   4. no ground suits the group at all: the highest-floor ground in band, else the first ground.
 * A lone hero is never pointed at a party ground while a solo one exists. Advice only: every
 * ground stays enterable, the server decides.
 * @returns {{ row: object|null, note: string|null }}
 */
export function recommendation(levels, partySize = 1, rows = huntRows(), bests = null) {
  const lv = [].concat(levels).filter(Number.isInteger);
  /* A PARTY TAKES THE GROUND THAT PAYS IT MORE ON A TIE OF FLOORS (lane/d-party-pace, Tyler 2026-11-18 "Yes, open at 5"; measured since lane/a-party-advice-glade):
     the Sewer and the Thicket both open at 5, a four at 5-7 earns about 1.6x the same heroes alone in the Thicket there, and the Thicket's measured lines keep it
     out of a party's advice (fitsGroup). On two grounds a party suits on one floor, the higher measured line wins. A hero alone never sees a party ground here. */
  const group = (Number(partySize) || 1) >= 2;
  const size = Math.min(Number(partySize) || 1, PARTY.maxSize);
  const lineOf = (r) => (r.partyBest && Number.isInteger(r.partyBest[size]) ? r.partyBest[size] : -1000);
  const best = (l) => l.slice().sort((x, y) => y.band[0] - x.band[0] || (group ? lineOf(y) - lineOf(x) : 0) || (x.name < y.name ? -1 : 1))[0] || null;
  if (!lv.length) return { row: rows[0] || null, note: null };
  const lo = Math.min(...lv), hi = Math.max(...lv);
  const holds = (r, from, to) => r.band[0] <= from && to <= r.band[1];
  const fit = rows.filter((r) => fitsGroup(r, partySize));
  const sure = best(fit.filter((r) => holds(r, lo, hi))) || best(fit.filter((r) => holds(r, lo, lo)));
  if (sure) return { row: sure, note: null };
  const alone = (Number(partySize) || 1) < 2;
  const below = fit.filter((r) => r.band[1] < lo).sort((x, y) => y.band[1] - x.band[1] || y.band[0] - x.band[0])[0];
  if (below) {
    /* NO GROUND IS SOLO OR PARTY TO THE PLAYER (Tyler 2026-11-08: "So some of those are solo only and party only? That isn't really matching up
       with how we are planning the game"): the note says where the Levels are and what the tough ground costs, never who it is for. */
    const inBand = best(rows.filter((r) => !fitsGroup(r, partySize) && holds(r, lo, lo)));
    const easier = { easier: below.name, lo: below.band[0], hi: below.band[1] };
    if (!inBand) return { row: below, note: [t('hunts.no_ground', { levels: levelsWords(lo, hi) }), t('hunts.nearest_below', { ground: below.name, lo: below.band[0], hi: below.band[1] })].join(ADVICE) };
    const levels2 = holds(inBand, lo, hi) ? levelsWords(lo, hi) : levelsWords(lo, lo);
    const was = alone && bests && bests.grounds && bests.grounds[inBand.hunt] && bests.grounds[inBand.hunt].solo;
    const lost = was && Number.isFinite(was.balanceH) && was.balanceH < 0 ? gold(-was.balanceH) : null;
    const key = lost ? 'hunts.right_but_lost' : alone ? 'hunts.right_but_tough' : 'hunts.right_easier';
    return { row: below, note: [t(key, { ground: inBand.name, levels: levels2, gold: lost }), t('hunts.easier', easier)].join(ADVICE) };
  }
  return { row: best(rows.filter((r) => holds(r, lo, lo))) || rows[0] || null, note: null };
}

/** THE GROUND THE PARTY ADVICE PICKS for a party of `size` at `level` (recommendation, the Hunts window's own pick), or null when no ground a party
    suits holds that Level (the advice falls back or carries a note). The coach's "Find a party for …" names it (lane/a-party-coach-card: it named the
    Sewer to a lone hero at 16-25, where the window sends that party to the Glade). Size 2: the first party a hero alone makes. */
export function partyGroundFor(level, size = 2, rows = huntRows()) {
  if (!Number.isInteger(level)) return null;
  const rec = recommendation(Array(size).fill(level), size, rows);
  return rec.row && !rec.note && fitsGroup(rec.row, size) ? rec.row.hunt : null;
}

/** The recommended ground's row alone (see recommendation). */
export function recommendedHunt(levels, partySize = 1, rows = huntRows()) {
  return recommendation(levels, partySize, rows).row;
}

/** The Levels the advice reads: this hero's `level`, or every seat's in its `party` (partyMembershipOf), this hero's own at `level`. All the server's. */
export const adviceLevels = (level, party) => (party ? party.seats.map((s) => (s.seat === party.me ? level : s.level)) : level);

/**
 * THE NEXT GROUND, OFF THE GROUND JUST HUNTED (audit 2026-11-18 A12: on a phone "Hunt again" kept a hero in the Mill Cellar all night after
 * Level 5, and nothing on the summary said there was a better ground): the advice's ground (recommendation: the Hunts list's own
 * "Recommended" line) when it stands on a higher floor than `hunt`, else null. A ground the list does not hold (the Tower, a called boss, a
 * training session) has no next. Advice only: Hunt again still sends what it sends. Pure.
 */
export function nextGroundFrom(hunt, levels, partySize = 1, rows = huntRows(), bests = null) {
  const was = rows.find((r) => r.hunt === hunt);
  if (!was) return null;
  const rec = recommendation(levels, partySize, rows, bests);
  return rec.row && !rec.note && rec.row.hunt !== hunt && rec.row.band[0] > was.band[0] ? rec.row : null;
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

/** THE LIST'S TWO TAGS on one ground: "Recommended" on the advice, when its band truly holds the group (no note), and "Next step up" on the harder ground above it (hunt-tutorial.js nextStepUp). Pure.
    A party reads the same Level tag as a hero alone (lane/d-party-pace, 2026-11-18): "Recommended for the party" sat on the Mill Cellar while the Party window
    said a four earns 60% under solo there (the full-game sweep, A1). The advice reads Levels, never what a party earns, and no card says which grounds suit
    parties (Tyler 2026-11-16: "nothing at all"); the Party window says what this party earns on the leader's tier. */
export function adviceTag(r, rec, step) {
  if (rec && rec.row && !rec.note && rec.row.hunt === r.hunt) return t('hunts.tag_right_level');
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
  return r.heroes > 1 ? t('hunts.heroes_up_to', { max: r.heroes }) : t('hunts.heroes_one');
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
