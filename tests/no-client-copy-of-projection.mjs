#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════════
// tests/no-client-copy-of-projection.mjs — THE CLASS-KILL GUARD FOR
// "THE SERVER PROJECTS IT AND THE CLIENT KEEPS ITS OWN COPY ANYWAY".
//
// Tyler, 2026-09-14: "this has been part of releases like over a dozen times
// now" — auto-eat food, the play streak and the Renown record each regressed
// AFTER they were fixed. Every one of those fixes landed the SERVER half
// (hr_state_of projects auto_eat_food / streak_days / renown_high), the client
// "observed" it into a `_`-scratch, and then kept its OWN persisted copy in the
// residue allowlist (RESIDUE_FIELDS, src/net/client-state.js) while screens and
// GATES went on reading the copy. Nothing in the repo forbade that, so the same
// shape came back one surface at a time. This guard forbids it.
//
// It answers four questions, and each of them has been the live bug at least
// once:
//
//   1  MAPPING DRIFT — is every key hr_state_of actually projects accounted for
//      by a client field (or explicitly declared meta/derived)? A projection the
//      client never maps is the `unlocked_recipes` shape: the server starts
//      holding the truth and the browser keeps gating on its residue.
//   2  A READER THAT DOES NOT EXIST — an entry may claim `reconcileX` /
//      `ownsY()` as the reader. If that function is not in that file, the
//      "server-first" comment is the only server-first thing in the build
//      (measured today: `reconcileGemUnlocks` is named in a legacy.js header
//      and is implemented nowhere).
//   3  A PERSISTED CLIENT COPY — a mapped client field that is on
//      RESIDUE_FIELDS. Allowed ONLY by name, with a written reason, in
//      RESIDUE_OK below (a per-character pointer, a client-only preference, a
//      pre-envelope hint that gates nothing).
//   4  A GATE/RENDER SITE READING THE RAW COPY — `G.<field>` read in
//      src/render/*, src/features/* or src/legacy.js for a field that HAS a
//      reader which prefers the server. Ratcheted at today's count: it may fall,
//      never rise. This is the one that actually regressed three times.
//
// ── WHY THE PROJECTED KEY SET IS EXECUTED, NEVER PARSED ─────────────────────
// hr_state_of is not in any one file. It is created once and then PROGRAMMATICALLY
// PATCHED by later migrations (`pg_get_functiondef` → string splice → re-create;
// see 2026-09-14-recipe-learn.sql §hr_state_of). The text production runs exists
// only after a replay, so a grep over supabase/migrations/** is a guess. This
// guard REPLAYS the chain (tests/schema-replay.mjs bootReplay()), calls
// hr_state_of on a probe character and reads the real key set — under `--execute`.
//
// That replay costs ~10 s and a pglite, which is the db-replay-2 job's budget
// (split from db-replay 2026-09-20) and not the client-guards / lane-done
// budget. So the executed answer is PINNED in
// tests/no-client-copy-of-projection.baseline.json:
//   · `--execute`         replays and FAILS if the pinned set differs from the
//                         real one (registered in the db-replay-2 job).
//   · the default run     is pure text over src/ + the pinned set, so every lane
//                         hits it in `tools/lane-done.mjs` for ~1 s.
// A migration that adds a projection therefore goes red in db-replay-2 until
// the key is re-pinned (`--write --execute`) AND mapped here — which is
// exactly the moment the client half is owed.
//
// Run:
//   node tests/no-client-copy-of-projection.mjs              # the gate
//   node tests/no-client-copy-of-projection.mjs --execute    # + replay the chain
//   node tests/no-client-copy-of-projection.mjs --write      # re-pin raw-read counts
//   node tests/no-client-copy-of-projection.mjs --write --execute  # + re-pin the keys
//   node tests/no-client-copy-of-projection.mjs --selftest   # mutation proof
// ════════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = join(ROOT, 'tests', 'no-client-copy-of-projection.baseline.json');

/* ── THE MAP ────────────────────────────────────────────────────────────────
   Every key hr_state_of projects → what the CLIENT calls it and who reads it.
   `kind`:
     meta        envelope machinery, no player-visible client field
     derived     the client recomputes it from another projected field (named)
     reconciled  an envelope reader REPLACES a client field with the server's
     split       the server's answer lands in a scratch/mirror AND a client-held
                 fallback copy survives for the pre-envelope moment — the shape
                 this whole guard exists to police
   `reader` is asserted to EXIST (check 2). `client` roots are checked against
   RESIDUE_FIELDS (check 3). `ratchet:true` puts the field's raw `G.<field>`
   reads under the count pin (check 4). */
const TOP = {
  ok:                  { kind: 'meta', why: 'the envelope verdict' },
  version:             { kind: 'meta', why: 'the optimistic-concurrency stamp (record.js)' },
  now:                 { kind: 'meta', why: 'the server clock; the client clock is never authority' },
  place:               { kind: 'reconciled', client: [], reader: ['src/net/town.js', 'res.place'], why: 'town presence, read straight off the envelope' },
  progress:            { kind: 'reconciled', client: [], reader: ['src/net/accrue.js', 'reconcileEventCounters'], why: 'player_progress rows → the goal/daily counters' },
  progress_truncated:  { kind: 'meta', why: 'the 1000-row cap flag for `progress`' },
  state:               { kind: 'meta', why: 'the nested player_state bag — every key inside it is mapped in STATE below' },
  client_state:        { kind: 'meta', why: 'THE RESIDUE BAG ITSELF — hydrateInto(); not a projected value' },
  inventory_complete:  { kind: 'meta', why: 'the server asserting the bag is absolute (accrue.js isEnvelopeAbsolute)' },
  total_level:         { kind: 'derived', from: 'skills', why: 'the client sums the SAME projected skills (src/core/xp.js totalLevel)' },
  skills:              { kind: 'reconciled', client: ['skills'], reader: ['src/net/record.js', 'applyRecord'], why: 'record field; replaced by every envelope' },
  inventory:           { kind: 'reconciled', client: ['inventory'], reader: ['src/net/accrue.js', 'reconcileInventory'], why: 'record field; gates go through gateItemCount()' },
  equipment:           { kind: 'reconciled', client: ['equipment'], reader: ['src/net/record.js', 'applyRecord'], why: 'record field' },
  bank:                { kind: 'reconciled', client: ['bank'], reader: ['src/net/accrue.js', 'reconcileBank'], why: 'record field; readers go through bankItems()' },
  farm:                { kind: 'reconciled', client: ['farmPlots'], reader: ['src/net/accrue.js', 'reconcileFarm'], why: 'the plot set is the server\'s' },
  workers:             { kind: 'reconciled', client: ['workers'], reader: ['src/net/accrue.js', 'reconcileWorkers'], why: 'the hired crew is the server\'s' },
  companions:          { kind: 'reconciled', client: ['companions'], reader: ['src/net/accrue.js', 'reconcileCompanions'], why: 'the roster is the server\'s' },
  traits:              { kind: 'reconciled', client: ['traits'], reader: ['src/net/accrue.js', 'reconcileTraits'], why: 'mirrored BOTH directions; deliberately NOT residue (client-state.js says so by name)' },
  buffs:               { kind: 'reconciled', client: ['buffs'], reader: ['src/net/accrue.js', 'reconcileBuffs'], why: 'the buff clock is the server\'s (2026-09-13); dropped from the residue in the same commit' },
  enchant:             { kind: 'reconciled', client: ['enchant'], reader: ['src/net/accrue.js', 'applyEnvelopeState'], why: 'TOP-LEVEL on the envelope (executed 2026-09-14), feeds equipmentStats()' },
  bounty:              { kind: 'reconciled', client: ['bountyHunter'], reader: ['src/render/bounty-progress.js', 'noteServer'], why: 'the contract count hr_claim_bounty judges; adopted into active._serverConfirmed' },
  dungeon_cooldowns:   { kind: 'reconciled', client: ['_dungeonCooldowns'], reader: ['src/net/accrue.js', 'reconcileDungeonCooldowns'], why: 'scratch by design; `G.dungeons` was DELETED from the residue for this' },
  hero_slots:          { kind: 'split', client: ['heroSlotsUnlocked'], mirror: '_heroSlots', reader: ['src/multi-character.js', 'ownsSlot'], ratchet: true, why: 'the owned set is the server\'s; the residue is a pre-envelope render hint that buys nothing' },
  gem_unlocks:         { kind: 'split', client: ['ownedThemes', 'ownedCosmetics'], mirror: '_gemUnlocks', reader: ['src/features/gem-unlocks.js', 'ownsGemUnlock'], ratchet: true, why: 'CLIENT HALF LANDED 2026-09-14: accrue.js reconcileGemUnlocks writes G._gemUnlocks from the envelope (and record.js hydrates it on an idle boot), ownsGemUnlock reads ONLY that, and both `client` fields were DELETED from G and from RESIDUE_FIELDS in the same build — they stay named here so the ratchet keeps them at ZERO raw reads and a re-introduction goes red.' },
  unlocked_recipes:    { kind: 'split', client: ['unlockedRecipes'], mirror: '_recipeUnlocks', reader: ['src/features/recipe-scrolls.js', 'unlockedRecipesMap'], ratchet: true, why: 'CLIENT HALF LANDED 2026-09-14: accrue.js reconcileRecipes writes G._recipeUnlocks, unlockedRecipesMap() is the ONE read (legacy gateOk, recipe-book, collection-log, the bag) and the field left RESIDUE_FIELDS with the addItem scroll wrapper. Named here so the ratchet holds it at ZERO.' },
  renown_high:         { kind: 'split', client: ['renownHigh'], mirror: '_serverHigh', reader: ['src/features/renown.js', 'countedRenown'], ratchet: true, why: 'countedRenown() prefers the realm; the residue ratchet is the PREDICTION shown before the first envelope and decides nothing' },
  /* THE HUNT'S TWO TOP-LEVEL BLOCKS (2026-09-22). Both land in `_`-prefixed
     SCRATCH and NEITHER is in the residue, deliberately: every number on the
     Hunt panel is one a player acts on, so HUNT_ANALYZER_UI.md §6 forbids a
     client copy that could go stale between settles. hydrateHunt() reads all
     three blocks by PRESENCE, so a database that predates the migration leaves
     the scratch untouched and the panel renders nothing rather than an empty
     meter. No ratchet: there is no persisted copy to count. */
  vigour:              { kind: 'reconciled', client: ['_vigour'], reader: ['src/net/accrue.js', 'hydrateHunt'], why: 'hr_vigour_of\'s whole meter INCLUDING the server\'s day_key — two spellings of "today" is how a daily gets charged twice' },
  hunt_analyzer:       { kind: 'reconciled', client: ['_huntAnalyzer'], reader: ['src/net/accrue.js', 'hydrateHunt'], why: 'the last SETTLED reading, or null — ABSOLUTE, never a union: a null must REPLACE the previous hunt\'s profit line' },
};

const STATE = {
  slot:                  { kind: 'meta', why: 'which character' },
  gold:                  { kind: 'reconciled', client: ['gold'], reader: ['src/net/record.js', 'applyRecord'], why: 'record field' },
  gems:                  { kind: 'reconciled', client: ['gems'], reader: ['src/net/record.js', 'applyRecord'], why: 'record field' },
  hearth_tokens:         { kind: 'reconciled', client: ['hearthTokens'], reader: ['src/net/record.js', 'applyRecord'], why: 'IAP-only bond; never minted client-side' },
  marks:                 { kind: 'reconciled', client: ['marks'], reader: ['src/net/record.js', 'applyRecord'], why: 'record field (the b443 nested-marks fix)' },
  hp:                    { kind: 'reconciled', client: ['playerHp'], reader: ['src/net/accrue.js', 'reconcileHp'], why: 'readers go through serverHp()' },
  max_hp:                { kind: 'reconciled', client: ['playerMaxHp'], reader: ['src/net/accrue.js', 'reconcileHp'], why: 'raise-only; tracks the hitpoints level server-side' },
  bank_cap:              { kind: 'reconciled', client: ['bankCap'], reader: ['src/net/accrue.js', 'reconcileBankRungs'], why: 'purchased bank space is the enforced bank space' },
  plot_level:            { kind: 'reconciled', client: ['plotLevel'], reader: ['src/net/accrue.js', 'reconcileFarm'], why: 'the plot tier is raise-only server-side' },
  rested_xp:             { kind: 'reconciled', client: ['restedXp'], reader: ['src/net/record.js', 'applyRecord'], why: 'record field' },
  rested_at:             { kind: 'reconciled', client: ['restedAt'], reader: ['src/net/record.js', 'applyRecord'], why: 'record field' },
  dungeon_scrip:         { kind: 'reconciled', client: ['inventory'], reader: ['src/net/dungeon-scrip-record.js', 'reconcileScrip'], why: 'the scrip balance is the server\'s (report #3: it reset to 0 on reload)' },
  enchant:               { kind: 'meta', why: 'NOT PROJECTED HERE — see the top-level `enchant`. Kept as a named non-key so a future move into `state` is a mapping change, not a silent adoption.', absentOk: true },
  fight:                 { kind: 'reconciled', client: ['_serverFight'], reader: ['src/net/accrue.js', 'applyEnvelopeState'], why: 'the in-flight fight is the server\'s' },
  active_kind:           { kind: 'reconciled', client: ['activity'], reader: ['src/net/activity.js', 'resolveActiveSlot'], why: 'the activity pointer is the server\'s' },
  active_id:             { kind: 'reconciled', client: ['activity'], reader: ['src/net/activity.js', 'resolveActiveSlot'], why: 'the activity pointer is the server\'s' },
  active_since:          { kind: 'meta', why: 'the server-side activity stamp; the client never authors it' },
  accrued_to:            { kind: 'meta', why: 'the priced window watermark (accrue.js bootAccruedToAt)' },
  workers_accrued_to:    { kind: 'meta', why: 'the worker accrual watermark' },
  combat_xp_accrued_to:  { kind: 'meta', why: 'the combat-XP cadence watermark' },
  consec_falls:          { kind: 'reconciled', client: ['consecFalls'], reader: ['src/net/accrue.js', 'reconcileFall'], why: 'the retreat counter hr_apply validates' },
  deaths_today:          { kind: 'reconciled', client: ['deathsToday'], reader: ['src/net/accrue.js', 'reconcileFall'], why: 'the Recovery Rule counter' },
  deaths_lifetime:       { kind: 'reconciled', client: ['deathsLifetime'], reader: ['src/net/accrue.js', 'reconcileFall'], why: 'the durable death counter (a death is never a free heal)' },
  recovering_until:      { kind: 'reconciled', client: ['recoveringUntil'], reader: ['src/net/accrue.js', 'reconcileFall'], why: 'the recovery clock is the server\'s' },
  last_away_receipt:     { kind: 'reconciled', client: ['_awayReceipt'], reader: ['src/net/accrue.js', 'reconcileAwayReceipt'], why: 'the night the server kept' },
  combat_style:          { kind: 'reconciled', client: ['combatStyle'], reader: ['src/net/accrue.js', 'reconcileCombatStyle'], why: 'server-wins per family, with the in-flight pick held in `_pendingStyle` scratch. Off RESIDUE_FIELDS since 2026-09-14 — the map is rebuilt from the envelope, never persisted' },
  auto_eat_enabled:      { kind: 'split', client: ['autoActions'], reader: ['src/features/auto-actions.js', 'eatEnabled'], ratchet: true, why: 'the switch the engine obeys. `autoActions` is a COMPOUND bag: its eat branch is server-owned and is STRIPPED from the residue patch (capstone.js), while replant/trainGoal are real prefs and ride' },
  auto_eat_food:         { kind: 'split', client: ['autoActions'], reader: ['src/features/auto-actions.js', 'eatFoodId'], ratchet: true, why: 'THE 2026-09-14 REGRESSION: the browser said cooked_shrimp while player_state.auto_eat_food said otherwise. eatFoodId() is the one reader' },
  auto_eat_pct:          { kind: 'reconciled', client: ['autoActions'], reader: ['src/features/auto-actions.js', 'eatThreshold'], why: 'THE THRESHOLD THE ENGINE EATS ON. `autoEatPct` is DELETED (2026-09-14) — the slider gesture lives in memory inside autoActions.eat, which no longer rides the residue PUT, and eatThreshold() answers from state.auto_eat_pct' },
  auto_eat_touched:      { kind: 'meta', why: 'has the player ever set auto-eat (server-side first-run marker)' },
  tool_carry:            { kind: 'reconciled', client: ['toolCarry'], reader: ['src/net/accrue.js', 'reconcileToolCarry'], why: 'the fractional gather carry is the server\'s: the engine advances player_state.tool_carry through the same core advanceToolCarry the attended tick uses, and reconcileToolCarry replaces the prediction on every envelope (client half landed 2026-09-14, closing the OWED)' },
  streak_days:           { kind: 'reconciled', client: ['_serverStreak'], reader: ['src/net/accrue.js', 'playStreakDays'], why: 'THE PLAY STREAK. The client counter is DELETED (2026-09-14): streak-chip.js advances nothing, `streak` is off RESIDUE_FIELDS, and playStreakDays() answers 0 until the realm speaks' },
  streak_day_key:        { kind: 'reconciled', client: ['_serverStreak'], reader: ['src/net/accrue.js', 'playStreakDays'], why: 'the UTC day the server counted, so the chip cannot double-count across a roll' },
  hearthfind_last:       { kind: 'reconciled', client: ['_hearthfind'], reader: ['src/features/hearthfind.js', 'noteEnvelope'], why: 'the trophy moment; deliberately NOT in G (hearthfind.js header)' },
  hearthfind_ready:      { kind: 'reconciled', client: ['_hearthfind'], reader: ['src/features/hearthfind.js', 'noteEnvelope'], why: 'the server decides when a find is ready' },
  hearthfind_plinth:     { kind: 'reconciled', client: ['_hearthfind'], reader: ['src/features/hearthfind.js', 'noteEnvelope'], why: 'what stands on the plinth is the server\'s' },
  hearthfind_titles:     { kind: 'reconciled', client: ['_hearthfind'], reader: ['src/features/hearthfind.js', 'noteEnvelope'], why: 'earned titles are server rows' },
  /* THE TWO STANDING ORDERS (2026-09-22). Read by PRESENCE in hydrateHunt():
     an ABSENT key means this build has no hunts, a NULL value means "no stance
     chosen", and the panel must not confuse the two. Scratch (`_hunt`), never
     residue — the stance the engine obeys is the column hr_apply validates
     against hr_hunt_stances, never a client-held pick. */
  hunt_stance:           { kind: 'reconciled', client: ['_hunt'], reader: ['src/net/accrue.js', 'hydrateHunt'], why: 'HOW to fight; null = steady. Carries no multiplier (design §2.2) — the id is an allowlist the server enforces' },
  hunt_stop:             { kind: 'reconciled', client: ['_hunt'], reader: ['src/net/accrue.js', 'hydrateHunt'], why: 'WHEN to stop; the stop predicate runs server-side in the one engine both the tick and the away replay call' },
};

/* ── CHECK 3'S ONLY ESCAPE HATCH ────────────────────────────────────────────
   A mapped client field that IS on RESIDUE_FIELDS, allowed by name with the
   reason it is not a copy of the server's answer. Anything not on this list is
   red; adding a name here is a review, which is the whole point. */
const RESIDUE_OK = {
  houseTheme:        'a per-character POINTER at which owned theme is applied — not the entitlement (that is gem_unlocks/ownsGemUnlock).',
  lootFilter:        'a client-only display preference; it hides, it never discards, and it gates nothing server-side.',
  lockedItems:       'the client-side sell-lock; it only stops the CLIENT authoring a sell intent. A forged or absent lock grants nothing.',
  /* ⚠ heroSlotsUnlocked, renownHigh, streak, autoEatPct, combatStyle, foodSlot and
     toolCarry WERE ON THIS LIST and are gone from it because they are gone from
     RESIDUE_FIELDS (2026-09-14). Each entry here is a standing permission for a
     persisted copy to exist, so a name left behind after the field is deleted is
     the permission outliving the review. Re-adding any of them means re-arguing
     the case, which is the point. */
  autoActions:       'a COMPOUND preference bag: replant and trainGoal are real prefs and ride, while the server-owned `eat` branch (enabled/pct/food) is STRIPPED on the way out by capstone.js buildResiduePatch and on the way in by hydrateInto.',
  bountyHunter:      'the contract sheet (accepted contract, rerolls, history); only `active._serverConfirmed` comes from the projection and noteServer() writes it.',
  inventory:         'NOT RESIDUE — listed here only because `pendingItemSpends` shadows it; the bag itself is a record field.',
};

/* ── THE OWED LIST ───────────────────────────────────────────────────────────
   A projection whose client half does not exist yet. These are REAL violations,
   named with an owner, and the count is a ratchet: it may fall, never rise. A
   new projection without a client reader is red on the day it is written. */
/* 3 → 1 → 0 on 2026-09-14: gem_unlocks and unlocked_recipes got their client
   halves in the build that removed their residue bags, and tool_carry got
   reconcileToolCarry in the projection purge. EVERY key hr_state_of projects now
   has a reader that prefers it. A new projection without one is red the day it
   is written, which is the only state this number should ever be in. */
const OWED_MAX = 0;

/* Files a raw `G.<field>` read is counted in (check 4). The reader's OWN module
   is excluded — that is where the read is supposed to happen — and so is the
   harness, which seeds fields as fixtures. */
const SCAN_GLOBS = ['src/render', 'src/features', 'src/legacy.js'];
const SCAN_SKIP = (rel) => rel === 'src/features/smoke-test.js' || rel.startsWith('src/features/smoke/');

/** Blank comment and string interiors so prose that mentions `G.streak.count`
 *  is not counted as a read. Newlines preserved. (Same idea as
 *  tests/arm-homing-guard.mjs stripCode; duplicated deliberately — a guard that
 *  imports another guard goes red for its neighbour's reasons.)
 *
 *  ⚠ IT ALSO SKIPS REGEX LITERALS, which arm-homing's copy does not, and that is
 *  not a nicety: src/features/hearthfind.js contains `/['"]/`-shaped literals, and
 *  a stripper that reads the quote inside one enters string mode and blanks the
 *  next several KILOBYTES of real code. Measured while writing this guard: with
 *  the naive stripper `function noteEnvelope` vanished and four true readers were
 *  reported missing. A raw-read count taken over a half-blanked file is a pin that
 *  silently under-counts, which is worse than no pin at all. The regex/divide
 *  decision is the usual previous-significant-character heuristic. */
function stripCode(src) {
  let out = ''; let i = 0; const n = src.length; let mode = null; let prev = ''; let word = '';
  const REGEX_OK = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '~', '^', '<', '>', 'return', 'typeof', 'case', 'in', 'of', 'do', 'else', 'yield', 'await', 'new', 'delete', 'void', 'instanceof']);
  while (i < n) {
    const c = src[i], d = src[i + 1];
    if (mode === null) {
      if (c === '/' && d === '/') { mode = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && d === '*') { mode = 'block'; out += '  '; i += 2; continue; }
      if (c === '/' && REGEX_OK.has(prev)) {
        // a regex literal: copy it verbatim (it is code), honouring \ and [...]
        let j = i + 1, cls = false;
        while (j < n) {
          const k = src[j];
          if (k === '\\') { j += 2; continue; }
          if (k === '[') cls = true;
          else if (k === ']') cls = false;
          else if (k === '/' && !cls) break;
          else if (k === '\n') break;
          j++;
        }
        if (j < n && src[j] === '/') { out += src.slice(i, j + 1); i = j + 1; prev = 'x'; word = ''; continue; }
        // not a terminated regex after all — fall through and treat as a divide
      }
      if (c === "'" || c === '"' || c === '`') { mode = c; out += c; i++; continue; }
      out += c; i++;
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { word = ''; continue; }
      if (/[A-Za-z0-9_$]/.test(c)) { word += c; prev = word; } else { word = ''; prev = c; }
      continue;
    }
    if (mode === 'line') { if (c === '\n') { mode = null; out += c; } else out += ' '; i++; continue; }
    if (mode === 'block') { if (c === '*' && d === '/') { mode = null; out += '  '; i += 2; } else { out += (c === '\n' ? '\n' : ' '); i++; } continue; }
    if (c === '\\') { out += '  '; i += 2; continue; }
    if (c === mode) { mode = null; out += c; i++; prev = 'x'; word = ''; continue; }
    out += (c === '\n' ? '\n' : ' '); i++;
  }
  return out;
}

function walk(rel, acc) {
  const abs = join(ROOT, rel);
  if (!existsSync(abs)) return acc;
  let entries;
  try { entries = readdirSync(abs, { withFileTypes: true }); }
  catch { acc.set(rel, stripCode(readFileSync(abs, 'utf8'))); return acc; }
  for (const e of entries) {
    const r = `${rel}/${e.name}`;
    if (e.isDirectory()) walk(r, acc);
    else if (e.name.endsWith('.js') && !SCAN_SKIP(r)) acc.set(r, stripCode(readFileSync(join(ROOT, r), 'utf8')));
  }
  return acc;
}

/** Everything the audit reads, in one object, so --selftest can MUTATE it. */
export function loadInputs() {
  const scan = new Map();
  for (const g of SCAN_GLOBS) walk(g, scan);
  const readerFiles = new Map();
  for (const e of [...Object.values(TOP), ...Object.values(STATE)]) {
    if (!e.reader) continue;
    const f = e.reader[0];
    if (readerFiles.has(f)) continue;
    const abs = join(ROOT, f);
    readerFiles.set(f, existsSync(abs) ? stripCode(readFileSync(abs, 'utf8')) : null);
  }
  const cs = readFileSync(join(ROOT, 'src', 'net', 'client-state.js'), 'utf8');
  const block = /export const RESIDUE_FIELDS\s*=\s*Object\.freeze\(\[([\s\S]*?)\n\]\);/.exec(cs);
  if (!block) throw new Error('RESIDUE_FIELDS literal not found in src/net/client-state.js');
  const residue = [...stripCode(block[1]).matchAll(/'([A-Za-z_][A-Za-z0-9_]*)'/g)].map((m) => m[1]);
  return { scan, readerFiles, residue };
}

/** Pure. inputs + the pinned baseline in, a list of failures out. */
export function audit(inputs, baseline) {
  const fail = [];
  const counts = {};
  const owed = [];
  const pinned = (baseline && baseline.projection) || { top: [], state: [] };

  // ── 1 — MAPPING DRIFT (both directions) ──────────────────────────────────
  for (const [ns, keys, map] of [['top', pinned.top, TOP], ['state', pinned.state, STATE]]) {
    for (const k of keys) {
      if (!map[k]) fail.push(`PROJ-UNMAPPED  hr_state_of projects ${ns}.${k} and this guard maps it to nothing. `
        + 'Add it to the map with the client field + reader, or declare it meta/derived with a reason.');
    }
    for (const k of Object.keys(map)) {
      if (map[k].absentOk) continue;
      if (!keys.includes(k)) fail.push(`PROJ-STALE     this guard maps ${ns}.${k} but hr_state_of no longer projects it `
        + '(re-pin with --write --execute after reading WHY it went away).');
    }
  }

  const entries = [...Object.entries(TOP), ...Object.entries(STATE)];

  for (const [key, e] of entries) {
    // ── 2 — THE READER MUST EXIST ─────────────────────────────────────────
    if (e.reader) {
      const [file, fn] = e.reader;
      const src = inputs.readerFiles.get(file);
      const present = src !== null && src !== undefined
        && (new RegExp(`function\\s+${fn}\\b`).test(src) || new RegExp(`\\b${fn}\\s*[:=]\\s*function`).test(src)
            || src.includes(fn));
      if (!present) {
        if (e.owed) owed.push(`${key}: ${e.owed}`);
        else fail.push(`READER-MISSING ${key} names ${file}#${fn} as its reader and that file does not contain it. `
          + 'A "server-first" comment with no function behind it is how gem_unlocks shipped unread.');
      }
    }
    if (e.owed && !owed.some((o) => o.startsWith(`${key}:`))) owed.push(`${key}: ${e.owed}`);

    // ── 3 — NO PERSISTED CLIENT COPY OF A PROJECTED VALUE ─────────────────
    for (const f of e.client || []) {
      if (f.charAt(0) === '_') continue;                    // scratch is never persisted
      if (!inputs.residue.includes(f)) continue;
      if (!RESIDUE_OK[f]) fail.push(`RESIDUE-COPY   '${f}' is on RESIDUE_FIELDS and is the client's copy of the projected `
        + `${key}. The residue is for values the server does NOT hold (§6). Either drop it from RESIDUE_FIELDS `
        + `(and route its reads through ${e.reader ? e.reader[1] + '()' : 'a reader'}), or add it to RESIDUE_OK with the reason it is not a copy.`);
    }

    // ── 4 — NO GATE/RENDER SITE ON THE RAW COPY ───────────────────────────
    if (!e.ratchet) continue;
    const readerFile = e.reader ? e.reader[0] : null;
    for (const f of e.client || []) {
      if (counts[f] !== undefined) continue;
      let n = 0;
      for (const [path, src] of inputs.scan) {
        if (path === readerFile) continue;
        n += (src.match(new RegExp(`\\bG\\.${f}\\b`, 'g')) || []).length;
      }
      counts[f] = n;
    }
  }

  // the ratchet itself
  const pins = (baseline && baseline.rawReads) || {};
  for (const [f, n] of Object.entries(counts)) {
    const pin = pins[f];
    if (pin === undefined) {
      fail.push(`RAW-READ-NEW   'G.${f}' is now under the ratchet and has no pin. Run --write once, in this lane.`);
    } else if (n > pin) {
      fail.push(`RAW-READ-ROSE  'G.${f}' raw reads rose ${pin} → ${n} in src/render, src/features, src/legacy.js. `
        + 'A render or gate site is reading the client copy instead of the reader that prefers the server — that is '
        + 'the auto-eat / streak / renown regression, exactly. Route the new site through the reader.');
    }
  }
  for (const f of Object.keys(pins)) {
    if (counts[f] === undefined) fail.push(`RAW-READ-STALE 'G.${f}' is pinned but no longer ratcheted — re-pin with --write.`);
  }

  if (owed.length > OWED_MAX) {
    fail.push(`OWED-ROSE      ${owed.length} projections have no client reader (pin ${OWED_MAX}). A projection without a `
      + 'client half means the browser is gating on its own copy while the server holds the truth.');
  }

  const fell = Object.entries(counts).filter(([f, n]) => pins[f] !== undefined && n < pins[f]);
  return { fail, counts, owed, fell };
}

/* ── THE EXECUTED KEY SET ───────────────────────────────────────────────────
   Replays the migration chain and asks the real hr_state_of. This is the only
   honest source: the deployed body is assembled by programmatic patches and
   exists in no file. */
async function executedProjection() {
  const { bootReplay } = await import('./schema-replay.mjs');
  const { db } = await bootReplay();
  const A = '11111111-1111-1111-1111-111111111111';
  await db.exec(`insert into auth.users (id) values ('${A}') on conflict do nothing;`);
  await db.exec(`insert into public.player_state (user_id, slot, gold, gems, version)
                 values ('${A}', 0, 10, 0, 1) on conflict (user_id, slot) do nothing;`);
  const env = (await db.query('select public.hr_state_of($1::uuid, 0) as env', [A])).rows[0].env;
  if (!env || env.ok !== true) throw new Error('hr_state_of refused the probe character: ' + JSON.stringify(env));
  return {
    top: Object.keys(env).sort(),
    state: Object.keys(env.state || {}).sort(),
  };
}

function readBaseline() {
  if (!existsSync(BASELINE)) return null;
  return JSON.parse(readFileSync(BASELINE, 'utf8'));
}

async function main(argv) {
  const write = argv.includes('--write');
  const execute = argv.includes('--execute');
  let base = readBaseline();

  if (execute) {
    const real = await executedProjection();
    if (write) {
      base = base || { rawReads: {} };
      base.projection = real;
    } else {
      if (!base) { console.error('PROJECTION: no baseline. Run --write --execute once.'); return 2; }
      const drift = [];
      for (const ns of ['top', 'state']) {
        const was = new Set(base.projection[ns] || []);
        const now = new Set(real[ns] || []);
        for (const k of now) if (!was.has(k)) drift.push(`+ ${ns}.${k} (a NEW projection — map it, and write the client reader)`);
        for (const k of was) if (!now.has(k)) drift.push(`- ${ns}.${k} (a projection went away — the client half is now orphaned)`);
      }
      if (drift.length) {
        console.error('✗ PROJECTION DRIFT — the pinned hr_state_of key set is not what the chain produces:');
        for (const d of drift) console.error('   ' + d);
        console.error('  Re-pin with: node tests/no-client-copy-of-projection.mjs --write --execute');
        return 1;
      }
      console.log(`  executed: hr_state_of projects ${real.top.length} top-level + ${real.state.length} state keys — matches the pin.`);
    }
  }

  if (!base) { console.error('PROJECTION: no baseline. Run --write --execute once.'); return 2; }

  const inputs = loadInputs();
  const r = audit(inputs, base);

  if (write) {
    base.rawReads = r.counts;
    base.generatedAt = new Date().toISOString().slice(0, 10);
    writeFileSync(BASELINE, JSON.stringify(base, null, 2) + '\n');
    console.log(`no-client-copy-of-projection: re-pinned ${Object.keys(r.counts).length} raw-read counts`
      + (execute ? ` and ${base.projection.top.length}+${base.projection.state.length} projected keys` : '') + '.');
    return 0;
  }

  for (const o of r.owed) console.log('  OWED  ' + o.split('\n')[0]);
  for (const [f, n] of r.fell) console.log(`  note  G.${f} raw reads fell ${base.rawReads[f]} → ${n} — run --write to lower the pin.`);
  if (r.fail.length) {
    console.error('✗ no-client-copy-of-projection: ' + r.fail.length + ' violation(s)');
    for (const f of r.fail) console.error('   ' + f);
    return 1;
  }
  console.log(`no-client-copy-of-projection: ${base.projection.top.length} top + ${base.projection.state.length} state `
    + `projections mapped, ${Object.keys(r.counts).length} raw-read pins held, ${r.owed.length}/${OWED_MAX} client halves owed.`);
  return 0;
}

/* ── THE MUTATION PROOF ─────────────────────────────────────────────────────
   A guard that has never been red is not a guard. Each arm mutates the AUDIT'S
   INPUTS (never a shipped file) and must produce the NAMED failure. The
   positive control runs first: an unmutated tree must be green, or every arm
   below is vacuous. */
function selftest() {
  const base = readBaseline();
  if (!base) { console.error('SELFTEST: no baseline; run --write --execute first.'); return 2; }
  const pristine = loadInputs();
  const clone = () => ({ scan: new Map(pristine.scan), readerFiles: new Map(pristine.readerFiles), residue: [...pristine.residue] });
  let bad = 0;
  const control = audit(pristine, base);
  if (control.fail.length) {
    console.error('SELFTEST control: the untouched tree is RED, so no arm below proves anything:');
    for (const f of control.fail) console.error('   ' + f);
    return 1;
  }
  console.log('  ok   control — the untouched tree is green');

  /* THE STRIPPER IS PART OF THE CONTRACT, AND IT FAILED FOR REAL while this
     guard was being written: a naive stripper reads the quote inside a regex
     literal like /['"]/ , enters string mode, and blanks kilobytes of live code —
     which reported four true readers missing and under-counted two raw reads. */
  const probe = stripCode("var re = /['\"]/; G.streak.count; // G.renownHigh\nvar s = 'G.autoEatPct';");
  if (!/G\.streak\.count/.test(probe)) { console.error('SELFTEST stripper: code after a quote-bearing regex literal was blanked'); bad++; }
  else if (/G\.renownHigh/.test(probe) || /G\.autoEatPct/.test(probe)) { console.error('SELFTEST stripper: a comment or string survived the strip — prose would be counted as a read'); bad++; }
  else console.log('  ok   stripper — regex literals survive, comments and strings do not');

  const arms = [
    ['a persisted client copy of a projected field (renownHigh-shaped: `skills` back on RESIDUE_FIELDS)', 'RESIDUE-COPY',
      () => { const i = clone(); i.residue.push('skills'); return i; }],
    /* RE-TARGETED 2026-09-14: this arm added a `G.streak.count` read, and `streak`
       stopped being a client field that day (the counter was DELETED, not preferred
       second), so the mutation stopped being a violation and the arm stopped
       proving anything. `autoActions` IS still mapped and pinned. */
    ['a render site reading the raw copy (`G.autoActions.eat.foodId` added to src/render/achievements.js)', 'RAW-READ-ROSE',
      () => { const i = clone(); i.scan.set('src/render/achievements.js', (i.scan.get('src/render/achievements.js') || '') + '\nvar d = G.autoActions.eat.foodId;\n'); return i; }],
    ['a projected key dropped from the mapping (state.streak_days unmapped)', 'PROJ-UNMAPPED',
      () => clone(), (b) => ({ ...b, projection: { top: b.projection.top, state: [...b.projection.state, 'streak_days_v2'] } })],
    ['a reader that does not exist (playStreakDays removed from src/net/accrue.js)', 'READER-MISSING',
      () => { const i = clone(); i.readerFiles.set('src/net/accrue.js', (i.readerFiles.get('src/net/accrue.js') || '').split('playStreakDays').join('xxRemovedxx')); return i; }],
  ];
  for (const [label, code, mutate, rebase] of arms) {
    const r = audit(mutate(), rebase ? rebase(base) : base);
    const hit = r.fail.some((f) => f.startsWith(code));
    if (hit) console.log(`  ok   ${code.padEnd(14)} caught: ${label}`);
    else { bad++; console.error(`  FAIL ${code.padEnd(14)} NOT caught: ${label}\n       got: ${r.fail.join(' | ') || '(green)'}`); }
  }
  if (bad) { console.error(`✗ SELFTEST: ${bad} arm(s) not caught.`); return 1; }
  console.log('no-client-copy-of-projection --selftest: 1 control + 4 arms, every arm red for its own reason.');
  return 0;
}

/* Import-safe: another guard (or a future suite step) may want `audit()` /
   `loadInputs()` without running the gate and setting an exit code. */
const INVOKED_DIRECTLY = process.argv[1] && fileURLToPath(import.meta.url) === join(process.argv[1]);
if (INVOKED_DIRECTLY) {
  const argv = process.argv.slice(2);
  process.exitCode = argv.includes('--selftest') ? selftest() : await main(argv);
}
