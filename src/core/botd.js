// ============================================================
// src/core/botd.js — Boss of the Day / Week as a PURE FUNCTION OF TIME.
//
// WHY THIS MOVED
// The rotation lived in src/features/boss-of-the-day.js, which reads
// `window.HearthriseWorldEvents` for its hash and its day key and calls
// `new Date()` for "now". That is fine for a card in the Combat panel and
// useless for the away ruling, which needs the boss resolved PER UTC-DAY
// SEGMENT of an absence — an absence that ended before this code ran, at
// instants that are not "now", possibly on a different day than today.
//
// So the rotation is now `botdFor(atMs)`: same FNV-1a, same day key, same
// Monday-aligned week key, same pools — but a function of a timestamp.
// The feature file keeps its card and delegates; the accrual Edge Function
// imports this file and passes a SERVER timestamp.
//
// DETERMINISM IS THE POINT. Every client and the server must agree on
// today's boss with no round-trip, so the pick is a hash of a UTC day key
// and nothing else. Changing the hash, the key format or the pool ORDER
// re-rolls history; adding to the END of a pool is safe.
//
// PURE ESM. No DOM, no window, no timers, no Math.random.
// ============================================================

/* The curated daily pool — marquee mid/endgame monsters, so a week of
   rotation has real variety. Ids are filtered against the live catalogue at
   read time, so a cut or renamed id is skipped rather than crashing.
   ORDER IS LOAD-BEARING (see the header): append only. */
export const DAILY_POOL = [
  'dark_wizard', 'venom_spider', 'goblin_brute', 'zombie', 'warlock',
  'plague_swarm', 'goblin_warlord', 'bear', 'wraith', 'lesser_demon', 'mountain_troll',
  'shadow_creeper', 'warband_captain', 'panther', 'death_knight', 'archmage',
  'void_parasite', 'war_king', 'ancient_bear', 'lich', 'dragon',
  /* ── b356 roster wave, APPENDED (never inserted — see the header: order is
     load-bearing, and reordering re-rolls every player's Boss-of-the-Day
     history). One marquee mid/endgame monster per new class, so a week of
     rotation now spans the whole taxonomy instead of six families. ── */
  'minotaur', 'giant_spider', 'hellhound', 'wyvern', 'barrow_knight',
  'winter_wolf', 'ice_elemental', 'watchknight', 'void_mote', 'carnivorous_plant',
  'cyclops', 'frost_giant', 'grave_banshee', 'fury', 'drake',
  'magma_elemental', 'gargoyle', 'starhusk', 'bandit_lord', 'mammoth',
  'revenant', 'vampire_bride', 'storm_elemental', 'the_silence',
];

/* The weekly boss — the apex end of the roster, on a 7-day clock. */
export const WEEKLY_POOL = [
  'death_knight', 'archmage', 'war_king', 'ancient_bear', 'lich', 'dragon', 'void_parasite',
  /* b356: APPEND ONLY. The eleven new capstone bosses — before this the game
     had two bosses in MONSTERS and the weekly slot was mostly non-bosses. */
  'elk_king', 'broodmother', 'treant', 'stonejaw', 'necromancer', 'grim_reaper',
  'vharek', 'draconia', 'ashwing', 'elder_cinder', 'iron_colossus', 'the_unlit',
];

export const DAILY_BONUS = Object.freeze({ dropMult: 1.5, xpMult: 1.25 });
export const WEEKLY_BONUS = Object.freeze({ dropMult: 2.0, xpMult: 1.5 });
export const NO_BONUS = Object.freeze({ dropMult: 1, xpMult: 1 });

/* FNV-1a — 32-bit, via Math.imul. Identical to src/core/rng.js `hashSeed`,
   which is the ONE reference implementation in this repo; every other copy
   must match it byte for byte.

   b332: this used to read `h = (h * 0x01000193) >>> 0`, which was copied into
   five files and is NOT FNV-1a. `h * 16777619` is a FLOAT multiply: whenever
   the product passes 2^53 the low bits — the only ones `>>> 0` keeps — are
   rounded away, so the last characters of the key barely reach the output.
   Measured symptoms: the result was even ~85% of the time (100% over the key
   ranges currently in play), so any `hash(k) % evenPool` could only ever
   return even indices, and adjacent day keys collided for 3-6 days at a
   stretch. Here the pools are 21 and 7 — both ODD — so nothing was
   unreachable, but the draw was skewed and one cut monster (avail -> 20)
   would have silently killed half the roster. `Math.imul` keeps the low 32
   bits exactly, which is what FNV-1a is defined on.

   The old comment said this was "byte-identical to HearthriseWorldEvents._hash
   — that identity is what keeps today's boss the same boss after this
   extraction." That identity is preserved: world-events.js is fixed in the
   same change, so client, server and every copy still agree with each other.
   They now also agree with the SQL oracle in
   supabase/migrations/2026-08-09-rally-v2.sql, which always did the exact
   bigint multiply and therefore always disagreed with the client. */
export function fnv1a(s) {
  let h = 0x811c9dc5;
  const str = String(s);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}

/** 'YYYY-M-D' in UTC. Same format world-events has always produced. */
export function utcDayKey(atMs) {
  const d = new Date(Number(atMs) || 0);
  return d.getUTCFullYear() + '-' + (d.getUTCMonth() + 1) + '-' + d.getUTCDate();
}

/** Whole UTC days since the epoch, at `atMs`. */
export function utcDayNumber(atMs) {
  const d = new Date(Number(atMs) || 0);
  return Math.floor(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 86400000);
}

/* b293: MONDAY-aligned. Epoch day 0 is a Thursday, so a bare floor(days/7)
   rotated the weekly boss on Thursdays while weekly quests reset on Monday.
   +3 shifts it. Preserved exactly — changing it re-rolls the week. */
export function utcWeekKey(atMs) {
  return Math.floor((utcDayNumber(atMs) + 3) / 7);
}

function pick(pool, catalogue, seedKey) {
  const avail = catalogue ? pool.filter((id) => catalogue[id]) : pool.slice();
  if (!avail.length) return null;
  return avail[fnv1a(seedKey) % avail.length];
}

/**
 * Who is featured at this instant.
 *
 * @param atMs      the instant to resolve — a SERVER timestamp server-side,
 *                  the segment start during an away replay, Date.now() live.
 * @param catalogue MONSTERS, so cut ids are skipped. Optional.
 * @returns { atMs, dayKey, weekKey, dailyId, weeklyId }
 */
export function botdFor(atMs, catalogue) {
  const t = Number(atMs) || 0;
  const dayKey = utcDayKey(t);
  const weekKey = utcWeekKey(t);
  return {
    atMs: t,
    dayKey,
    weekKey,
    dailyId: pick(DAILY_POOL, catalogue, 'hr-boss-' + dayKey),
    weeklyId: pick(WEEKLY_POOL, catalogue, 'hr-weekly-boss-' + weekKey),
  };
}

/**
 * The kill multipliers for a monster at an instant. The WEEKLY boss (bigger
 * bonus) takes precedence over the daily, as it always has.
 *
 * Per the ruling this applies AWAY too — a featured boss is a targeting
 * decision the player made before leaving, not a passive lift — which is
 * why it takes `atMs` rather than reading a clock.
 */
export function killBonusesFor(monsterId, atMs, catalogue) {
  if (!monsterId) return NO_BONUS;
  const f = botdFor(atMs, catalogue);
  if (monsterId === f.weeklyId) return WEEKLY_BONUS;
  if (monsterId === f.dailyId) return DAILY_BONUS;
  return NO_BONUS;
}

/** True when the monster carries any featured lift at that instant. */
export function isFeaturedAt(monsterId, atMs, catalogue) {
  const b = killBonusesFor(monsterId, atMs, catalogue);
  return b.dropMult > 1 || b.xpMult > 1;
}

/** ms until the next UTC midnight from `atMs` (the daily card's countdown). */
export function msUntilDailyRotate(atMs) {
  const t = Number(atMs) || 0;
  return Math.max(0, (Math.floor(t / 86400000) + 1) * 86400000 - t);
}

/** ms until the next Monday-aligned UTC week boundary. */
export function msUntilWeeklyRotate(atMs) {
  const t = Number(atMs) || 0;
  const daysIntoWeek = (utcDayNumber(t) + 3) % 7;
  const midnightToday = Math.floor(t / 86400000) * 86400000;
  return Math.max(0, midnightToday + (7 - daysIntoWeek) * 86400000 - t);
}
