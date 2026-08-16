#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tools/cutover-import.mjs — THE CUTOVER IMPORT.
//
// One-time, per-player migration of the client-authored `game_saves.snapshot`
// blob into the server's authoritative tables. The blob is trusted EXACTLY
// ONCE, here, on freeze day. After this it is a cache and nothing more.
//
//   node tools/cutover-import.mjs --dry-run            READ-ONLY. No RPC call.
//   node tools/cutover-import.mjs --rehearse           full write + rollback
//   node tools/cutover-import.mjs --apply --yes        the real thing
//   node tools/cutover-import.mjs --user <uuid> …      one player
//   node tools/cutover-import.mjs … --reopen-cutover   re-open a CLOSED cutover
//                                                      (a marker row exists — the
//                                                      ceremony has already run)
//   node tools/cutover-import.mjs --report-dir <dir>   where the JSON lands
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────
// Tyler deferred the wipe (2026-08-15, HANDOFF "SCOPE CHANGE"): current
// players keep their progress with explicit amnesty for any pre-cutover
// forgery. Amnesty means NO FORENSICS. It does not mean accepting `1e12` into
// a bigint column, and it does not mean guessing what a renamed item id used
// to be.
//
// ╔══════════════════════════════════════════════════════════════════════╗
// ║  THE THREE PROPERTIES, in the order they matter                      ║
// ║                                                                      ║
// ║  1. EVERY FIELD IS DECLARED. A snapshot key that FIELD_MAP does not  ║
// ║     name fails the whole run, BY NAME, before anything is written.   ║
// ║     This is the b350 declaration-gap lesson: the gather seam was     ║
// ║     widened by DERIVATION, so no client site was ever added, and     ║
// ║     nothing failed. Derivation removes the second LIST; it does not  ║
// ║     remove the second SIDE.                                          ║
// ║  2. EVERY IMPORT IS VERIFIED. After the write the server state is    ║
// ║     re-read through `hr_state_of` — the same envelope the game reads ║
// ║     — and diffed against the SOURCE SNAPSHOT by a reader that does   ║
// ║     not share code with the plan builder. A mismatch fails that      ║
// ║     player loudly.                                                   ║
// ║  3. ONE PLAYER'S GARBAGE NEVER ABORTS THE BATCH. Imports are         ║
// ║     per-player transactional: skip, report, continue.                ║
// ╚══════════════════════════════════════════════════════════════════════╝
//
// ── THE ADMISSION RULE ──────────────────────────────────────────────────
//   A FIELD IS IMPORTED IFF THE SERVER HAS A HOME FOR IT THAT `hr_state_of`
//   CAN READ BACK.
// Everything else stays client-owned in the blob, which the import does NOT
// delete. That is what makes "dropped" honest: nothing is lost, it is simply
// still owned by the client until its domain moves server-side. And it makes
// property 2 total rather than partial — there is no "imported but
// unverifiable" bucket for a defect to hide in.
//
// ── WHAT THE SERVER DECIDES, NOT THIS TOOL ──────────────────────────────
// This tool proposes. `public.hr_import_apply` disposes: it re-validates every
// id against the server's own catalogues, re-clamps every magnitude against
// its own constants, derives hp/max_hp/accrued_to/version itself, runs the
// plan through `hr_unlock_guard`, reads back and verifies, and rolls the
// player back whole on any disagreement. The tool is allowed to be wrong.
// See supabase/migrations/2026-08-17-cutover-import.sql.
//
// ── SECRET HYGIENE ──────────────────────────────────────────────────────
// Same discipline as tools/apply-migration.mjs: the personal access token is
// read from ~/.supabase-token as FILE BYTES, never printed, never argv, never
// an env var. Nothing in this file is hand-authored into a tool argument.
//
// PURE ESM, Node only.
// ════════════════════════════════════════════════════════════════════════

import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, dirname, normalize } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { sliceLiteral, makeDie } from './lib/slice-literal.mjs';
import { GOAL_EVENTS, goalKey } from '../src/core/goals.js';
import { levelFromXp } from '../src/core/xp.js';
import { COMPANIONS } from '../src/data/companions.js';

export const ROOT = normalize(join(dirname(fileURLToPath(import.meta.url)), '..'));
const die = makeDie('cutover-import');

/* ══════════════════════════════════════════════════════════════════════════
   0 · GAME DATA READ OUT OF THE ONE COPY THAT EXISTS

   Neither table is restated here. `BANK_SPACE` (the bank-slot economy) and
   `TIERS` (the homestead ladder) live in classic scripts that Node cannot
   import, so they are SLICED — anchor, brace-match, evaluate — by the same
   helper tools/gen-shops.mjs and tools/gen-perks.mjs use. An anchor that
   matches zero or two times is a build failure, never a guess. A second copy
   of game data is the failure src/main.js `unifyObject` was written about.
   ══════════════════════════════════════════════════════════════════════════ */
export function readGameData() {
  const legacy = readFileSync(join(ROOT, 'src', 'legacy.js'), 'utf8');
  const homestead = readFileSync(join(ROOT, 'src', 'features', 'homestead.js'), 'utf8');
  const BANK_SPACE = sliceLiteral(legacy, 'var BANK_SPACE = {', 'src/legacy.js', die);
  const TIERS = sliceLiteral(homestead, 'var TIERS = [', 'src/features/homestead.js', die);
  const BOUNTY_SHOP = sliceLiteral(legacy, 'const BOUNTY_SHOP = [', 'src/legacy.js', die);
  if (!BANK_SPACE || !BANK_SPACE.gold || !BANK_SPACE.gem || !BANK_SPACE.BASE_CAP) {
    die('BANK_SPACE was sliced but has no BASE_CAP/gold/gem — bank_cap would import as a guess');
  }
  if (!Array.isArray(TIERS) || TIERS.length < 2 || TIERS[0].id !== 'camp') {
    die('the homestead TIERS ladder was sliced but does not start at `camp` — propertyTier '
      + 'would import against a ladder this tool invented');
  }
  return { BANK_SPACE, TIERS, ID_ALIAS: buildIdAlias({ BOUNTY_SHOP }) };
}

/* ══════════════════════════════════════════════════════════════════════════
   0b · THE ID-SPACE ALIAS — a CLASS, not a bounty special-case.

   Game-designer ruling (2026-08-15, binding, stamped in tools/gen-unlocks.mjs):
   the bounty upgrades were the FIRST INSTANCE of a class — a client store whose
   internal key is NOT the catalogue id. When they differ the import must ALIAS,
   not drop, and the alias must be provably 1:1.

   THE SHAPE: ID_ALIAS[namespace] maps a CLIENT id to a SERVER catalogue id
   (the full `namespace:localId`). A store whose client id already IS the
   catalogue id has no entry here and needs none — the absence is the common
   case and it is correct.

   DERIVED, NOT DECLARED, WHERE THE SOURCE MAKES THE MAPPING EXPLICIT. The
   bounty alias is not four hand-typed lines that can drift from the shop; it is
   COMPUTED from BOUNTY_SHOP, where each offer carries both its catalogue `id`
   and the `flag` the client writes into G.bountyHunter.upgrades. `flag ->
   namespace:id`. The mapping is asserted 1:1 (no two offers share a flag) and
   cross-checked against the ruling's stamped four, so a rename on either side
   fails the build rather than importing against a mapping this tool invented.
   ══════════════════════════════════════════════════════════════════════════ */
function buildIdAlias({ BOUNTY_SHOP }) {
  if (!Array.isArray(BOUNTY_SHOP) || !BOUNTY_SHOP.length) {
    die('BOUNTY_SHOP was sliced but is empty — the bounty id-space alias would be silently absent, '
      + 'and six live upgrades across two players would drop instead of mapping (dry-run 2026-08-15).');
  }
  const bounty = {};
  for (const offer of BOUNTY_SHOP) {
    if (!offer || typeof offer.id !== 'string') continue;
    // reroll_token carries no `flag`: it is a repeatable consumable that leaves
    // no `upgrades` key, so there is nothing to alias. Skipped, per the ruling.
    if (typeof offer.flag !== 'string' || !offer.flag) continue;
    if (Object.prototype.hasOwnProperty.call(bounty, offer.flag)) {
      die(`BOUNTY_SHOP has two offers with flag "${offer.flag}" — the alias would not be 1:1 and `
        + 'the import could not tell which upgrade a client flag meant.');
    }
    bounty[offer.flag] = `bounty:${offer.id}`;
  }
  // Cross-check against the ruling's stamped four. A divergence here means the
  // shop was renamed and the ruling (or this tool) is now stale — fail, do not
  // import against a mapping nobody ratified.
  const RULING = {
    goldBoost: 'bounty:mark_pouch',
    autoBounty: 'bounty:auto_bounty_1',
    extraRerolls: 'bounty:free_reroll_2',
    cosmeticCloak: 'bounty:cosmetic_cape',
  };
  for (const [flag, want] of Object.entries(RULING)) {
    if (bounty[flag] !== want) {
      die(`the bounty alias derived from BOUNTY_SHOP maps ${flag} -> ${bounty[flag] || '(absent)'}, `
        + `but the game-designer ruling (stamped in tools/gen-unlocks.mjs) says ${want}. The shop `
        + 'was renamed; update the ruling and this cross-check together.');
    }
  }
  return { bounty };
}

/* Resolve a proposed `namespace:localId` (or a bare-namespace id like `worker`)
   through the alias. Returns { id, aliased }. The bare form has no local id and
   is never aliased. */
function resolveAlias(id, ID_ALIAS) {
  const c = id.indexOf(':');
  if (c < 0) return { id, aliased: false };
  const ns = id.slice(0, c);
  const local = id.slice(c + 1);
  const table = (ID_ALIAS && ID_ALIAS[ns]) || null;
  if (table && Object.prototype.hasOwnProperty.call(table, local)) {
    return { id: table[local], aliased: true, from: id };
  }
  return { id, aliased: false };
}

/** bankCap(), as legacy.js computes it, from the sliced table. */
function bankCapOf(bank, BANK_SPACE) {
  const b = bank && typeof bank === 'object' ? bank : {};
  return BANK_SPACE.BASE_CAP
    + (num(b.goldBuys) || 0) * BANK_SPACE.gold.slots
    + (num(b.gemBuys) || 0) * BANK_SPACE.gem.slots
    + (num(b.grandfather) || 0);
}

/* The three keys inside `G.bank` that are BANK-SPACE BOOKKEEPING rather than
   items. Every other key in that object is an item id — the client uses one
   object for both, which is exactly the kind of shape an importer must know
   about explicitly rather than discover. */
const BANK_RESERVED = new Set(['goldBuys', 'gemBuys', 'grandfather']);

/* ══════════════════════════════════════════════════════════════════════════
   THE COMPANION SLOT IS CLIENT-OWNED, WHOLESALE.

   Found by the full-batch --rehearse on 2026-08-16 (4 of 6 players MISMATCH).
   `G.equipment.companion` is NOT an ordinary equipment slot:

     · b229 (src/legacy.js ~12524): `equipCompanion()` mirrors the legacy
       `fox_companion` ITEM id into the slot for the FOX ONLY; every other
       companion writes its raw COMPANIONS id (`wolf_pup`, `silkling`, …),
       which `ITEMS` does not have. Two id-spaces in one slot.
     · `fox_companion` IS a real item (`src/data/items.js`, slot:'companion'),
       so it is in hr_items AND hr_item_slots and WOULD import — while every
       other player's companion dropped. That asymmetry is the sweep finding:
       one player ends up with a server-side equipped companion granting
       strB:2/xpB:.02 and nobody else does.
     · `hr_perks_of` declares `companions: 'blocked:no_server_pet_model'`.
       There is no server companion model to import INTO.

   So the whole slot is dropped BY NAME, fox included. Importing one player's
   fox but nobody else's wolf is worse than importing none: it is silently
   unfair, and it contradicts a channel the server itself says is blocked.
   Same reason as FIELD_MAP's `companions` entry — one decision, two surfaces.
   ══════════════════════════════════════════════════════════════════════════ */
export const COMPANION_SLOT = 'companion';
export const COMPANION_IDS = new Set(Object.keys(COMPANIONS));
/** The legacy ITEM id the fox (and only the fox) mirrors into the slot. */
export const LEGACY_COMPANION_ITEM = 'fox_companion';

/** Why an id in the companion slot is client-owned — named, never silent. */
export function companionDropReason(id) {
  if (COMPANION_IDS.has(id)) return 'client_owned_companion_no_server_pet_model';
  if (id === LEGACY_COMPANION_ITEM) return 'client_owned_companion_legacy_item_mirror';
  return 'client_owned_companion_slot_unknown_id';
}

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const int = (v) => { const n = num(v); return n === null ? null : Math.floor(n); };

/* ══════════════════════════════════════════════════════════════════════════
   1 · THE FIELD MAP — THE DELIVERABLE

   Every key that can appear in a `game_saves.snapshot`, and exactly one
   outcome for it. A key that is not here FAILS THE RUN BY NAME.

   OUTCOMES
     SERVER   written to a server table. `to` names the target, `build`
              produces the plan fragment, and `verify` re-reads it out of the
              envelope INDEPENDENTLY of `build`.
     DERIVED  the server computes this itself; the blob's copy is ignored.
              Named rather than omitted, because "ignored" and "forgotten" are
              indistinguishable in a report and one of them is a bug.
     CLIENT   no server model exists. Stays authoritative in the blob, which
              this import does not touch. NOT a loss — a deferral, and the
              reason names what would have to ship first.
     DEVICE   device-local scratch. Discarded.
     META     import bookkeeping only; recorded in the ledger row's meta.
     NO_SYNC  never reaches the blob at all (src/net/events.js denylist).
              Declared so that a change to that denylist shows up here as a
              key with a home rather than as an unmapped surprise.
   ══════════════════════════════════════════════════════════════════════════ */
const F = (outcome, to, why, extra = {}) => ({ outcome, to, why, ...extra });

export const FIELD_MAP = {
  // ── currencies + the bank ───────────────────────────────────────────────
  gold: F('SERVER', 'player_state.gold',
    'The value the whole program exists to protect. Clamped at 1e9 by the RPC and reported.'),
  gems: F('SERVER', 'player_state.gems',
    'Premium currency. Has a column, an intent surface and a daily budget dimension (b351).'),
  bank: F('SERVER', 'player_state.bank_cap + player_inventory',
    'ONE object with TWO meanings. goldBuys/gemBuys/grandfather are bank-space purchases and '
    + 'become bank_cap via legacy.js bankCap(); every OTHER key is an item id in the bank and '
    + 'merges into the bag, because the server has one item store and no location column.'),

  // ── the bag ─────────────────────────────────────────────────────────────
  inventory: F('SERVER', 'player_inventory',
    'Catalogue-validated against hr_items. An id the catalogue does not know is dropped BY NAME '
    + '— never guessed, never remapped.'),
  equipment: F('SERVER', 'player_equipment',
    'Validated twice: the item must exist in hr_items AND be able to occupy that slot per '
    + 'hr_item_slots. Live example that this catches: the `companion` slot holds `phoenix_chick`, '
    + 'which is a companion and not an item.'),

  // ── skills ──────────────────────────────────────────────────────────────
  skills: F('SERVER', 'player_skills',
    'XP only; LEVEL IS NEVER STORED. Validated against hr_skills, so the client-side derived '
    + '`combat` key in the same bag is dropped by name rather than minting an unreadable row.'),

  // ── the farm ────────────────────────────────────────────────────────────
  farmPlots: F('SERVER', 'player_farm',
    'One row per OWNED plot (the row count is the capacity). plantedAt/waterings are CLIENT '
    + 'clocks and are clamped into a 30-day window by the RPC — a forged 1970 plantedAt is a '
    + 'free harvest of every plot on the first tick after switch-on.'),

  // ── auto-eat: three fields, one server shape ────────────────────────────
  autoActions: F('SERVER', 'player_state.auto_eat_*',
    'Only the `eat` sub-object maps (enabled/foodId/threshold). `trainGoal` and `farmReplant` '
    + 'are client automation with no server model and stay in the blob.'),
  foodSlot: F('SERVER', 'player_state.auto_eat_food',
    'The fallback source when autoActions.eat.foodId is absent. Must be hr_items.auto_eatable.'),
  autoEatPct: F('SERVER', 'player_state.auto_eat_pct',
    'A 0..1 fraction client-side, an int 0..100 in the column.'),

  // ── the tool-double carry ───────────────────────────────────────────────
  toolCarry: F('SERVER', 'player_state.tool_carry',
    'b348. Per-skill fractional carry. hr_apply refuses a value outside [0,1) rather than '
    + 'clamping it, so this tool DROPS an out-of-range entry by name instead of handing the RPC '
    + 'a plan it must reject wholesale.'),

  // ── unlocks: player_progress rows, per the catalogue's storage kinds ────
  rooms: F('SERVER', "player_progress kind='unlock' key='room:<id>'",
    'A rung LADDER, merged with GREATEST — never `+`, or two cheap rungs buy an expensive one. '
    + 'THE ORDERING DEPENDENCY FOR THE ARTISAN FLIP: without room:kitchen, hr_perks_of returns '
    + 'rooms {} and makeBonus(\'noBurn\') reads 0, so the server burns food a Kitchen owner keeps.'),
  homestead: F('SERVER', "player_progress kind='unlock' key='property:<tier id>'",
    'The tier INDEX into the homestead TIERS ladder, sliced from src/features/homestead.js. '
    + 'Tier 0 (camp) is the default and has no unlock row. hr_perks_of takes max(property:*).'),
  plotLevels: F('SERVER', "player_progress kind='unlock' key='farm_plot_tier'",
    'A tier ladder whose id IS its namespace. The catalogue sells rungs {2,3,4,5}; tier 1 is the '
    + 'default and writes no row.'),
  plotBuildings: F('SERVER', "player_progress kind='stat' key='plot:<id>'",
    'REPEATABLE, so the row holds a COUNT and additive merge is correct — getBonus pays per '
    + 'instance, and two Scarecrows really are +2 farmYield.'),
  workers: F('SERVER', "player_progress kind='stat' key='worker' (count only)",
    'The COUNT of hired workers imports. The ROSTER — names, per-worker xp, targets, '
    + 'lastCollect — is client-owned: there is no server worker model, and inventing one at '
    + 'import time would be authoring game state from a blob.'),
  unlockedRecipes: F('SERVER', "player_progress kind='flag' key='recipe:<id>'",
    'THE ARTISAN GATE. kind=flag precisely so the accrual engine can grant a scroll it rolled '
    + 'itself. An absent row is a LOCKED recipe — the fail-closed default.'),
  ownedThemes: F('SERVER', "player_progress kind='flag' key='theme:<id>'", 'Owned or not.'),
  ownedCosmetics: F('SERVER', "player_progress kind='flag' key='cosmetic:<id>'", 'Owned or not.'),
  entitlements: F('SERVER', "player_progress kind='flag' key='entitlement:<id>'",
    'IAP entitlements (noAds / offlinePlus / hearthHall). Owned or not.'),
  traits: F('SERVER', "player_progress kind='flag' key='trait:<id>'",
    'trait:auto_eat is the purchase receipt hr_set_auto_eat requires. The RPC refuses to switch '
    + 'auto-eat on without it, so the receipt and the setting can never disagree.'),
  stats: F('SERVER', "player_progress kind='stat' (nine lifetime keys + six ev:* counters)",
    'Two families. The nine lifetime counters the engine already writes (kills, crits, gathered, '
    + 'chopped, mined, fished, tool_doubles, deaths, rare_drops), and the six `ev:<type>` goal '
    + 'counters from src/core/goals.js — which is what makes every quest retro-correct, since '
    + 'quest progress is min(goal, stat[ev:<type>]). Every OTHER stats key is client-owned.'),
  bountyHunter: F('SERVER', "player_progress kind='flag' key='bounty:<id>' (upgrades only, ALIASED)",
    'Only `upgrades` maps, and it is the FIRST INSTANCE OF THE ID-SPACE ALIAS CLASS (game-designer '
    + 'ruling 2026-08-15): the client keys upgrades by the shop offer\'s `flag` (goldBoost, '
    + 'autoBounty, extraRerolls, cosmeticCloak), the catalogue keys by the offer\'s `id`, so the '
    + 'import aliases flag -> bounty:<id> via ID_ALIAS (derived 1:1 from BOUNTY_SHOP). reroll_token '
    + 'has no flag and no upgrades key — nothing to import. marks / xp / board / warrants / active '
    + 'are CLIENT-OWNED under the record-follows-the-writer rule (src/net/record.js): player_state '
    + 'has no `marks` column, every marks writer is still client-side, and a field with a server '
    + 'record and a live client writer is the two-sources bug that rule exists to prevent.'),

  // ── DERIVED — the server computes these; the blob\'s copy is ignored ─────
  totalLevel: F('DERIVED', 'hr_total_level()',
    'A leaderboard stamp the client writes into its own snapshot. Recomputed from player_skills.'),
  combatLevel: F('DERIVED', 'src/core/xp.js combatLevel(skills)', 'Derived from the imported XP.'),
  bossKills: F('DERIVED', 'countBossKills()', 'A leaderboard stamp, derived from the bestiary.'),
  offlineBudget: F('DERIVED', 'player_state.accrued_to = now()',
    'NEVER imported. This is the accrual watermark, and a client watermark of 1970 is an '
    + 'unbounded mint (save-invariant #5). The import stamps now(), so the freeze window itself '
    + 'is not paid. It is already the one field on record.js SERVER_OF_RECORD.'),
  lastActivity: F('DERIVED', "player_state.active_kind = 'idle'",
    'The import does not resume an activity: `stoppedAt` is a client clock and resuming from it '
    + 'would pay the freeze. The player picks an activity on their first session back — one tap.'),
  clanId: F('DERIVED', 'clan_members',
    'Clan membership has been server-authoritative since 2026-08-11. The blob\'s copy is a cache.'),
  clanName: F('DERIVED', 'clans', 'Same. Derived server-side; never taken from a client string.'),
  muster: F('DERIVED', 'the muster tables', 'Already server-authoritative.'),
  raids: F('DERIVED', 'raid tables', 'Already server-authoritative (raid_claim_authority).'),
  rallyPledge: F('DERIVED', 'rally tables', 'Already server-authoritative (rally-v2).'),
  playerName: F('DERIVED', 'profiles / display_names',
    'A display name crosses to other players through chat and the leaderboard, so it is derived '
    + 'server-side and never taken from a client field (architectural law 2). Importing it would '
    + 'be the chat-name authority defect, re-opened at batch scale.'),

  // ── CLIENT — no server model. Stays in the blob, which is not deleted. ──
  companions: F('CLIENT', 'game_saves.snapshot',
    'hr_perks_of names this exactly: companions = "blocked:no_server_pet_model". Ownership, per-'
    + 'pet xp and the equipped pet have no server home, and most companion ids are EARNED rather '
    + 'than bought so they are not in the shop-derived unlock catalogue either. Importing a '
    + 'subset would be worse than importing none: the client would then hold two disagreeing '
    + 'records of what you own.'),
  houseTheme: F('CLIENT', 'game_saves.snapshot',
    'Which owned theme is ACTIVE is a display preference. Ownership (ownedThemes) is imported.'),
  renown: F('CLIENT', 'game_saves.snapshot',
    'hr_perks_of names it: renown = "blocked:no_server_renown_score".'),
  renownHigh: F('CLIENT', 'game_saves.snapshot', 'Same channel.'),
  quests: F('CLIENT', 'game_saves.snapshot',
    'The quest LIFECYCLE (accepted / done / reward claimed) is a client model; kind=\'quest\' is '
    + 'deliberately NOT written by the engine because state=\'claimed\' gates a payout (review '
    + 'S13). What the server DOES import is the ev:* counters the quests read, so progress is '
    + 'retro-correct — see the `stats` entry.'),
  questsCompleted: F('CLIENT', 'game_saves.snapshot', 'Same lifecycle.'),
  daily: F('CLIENT', 'game_saves.snapshot',
    'PERIODIC. The import writes only permanent rows: a daily counter is a fact about a day that '
    + 'is ending, the freeze is measured in hours, and the blob\'s day key ("Sun Aug 16 2026") is '
    + 'not the database\'s (hr_utc_day_key\'s FM format yields "2026-8-16"). Stated cost: a '
    + 'bounded under-credit of at most one day\'s dailies, on the day of the freeze only.'),
  dailyTasks: F('CLIENT', 'game_saves.snapshot', 'Legacy alias of `daily`. Same reason.'),
  dailyGoals: F('CLIENT', 'game_saves.snapshot',
    'A claim ledger with startValues. Importing it would be inventing a claim model server-side; '
    + 'claim_reward already names its dependencies and this is one of them.'),
  weeklyGoals: F('CLIENT', 'game_saves.snapshot', 'Same claim ledger.'),
  dailyReward: F('CLIENT', 'game_saves.snapshot', 'The login-streak claim ledger. Same reason.'),
  streak: F('CLIENT', 'game_saves.snapshot', 'Login streak counter feeding the claim above.'),
  dailyGoldStart: F('CLIENT', 'game_saves.snapshot', 'Daily-goal baseline.'),
  dailyGoldDelta: F('CLIENT', 'game_saves.snapshot', 'Daily-goal baseline.'),
  collection: F('CLIENT', 'game_saves.snapshot', 'The item collection log. No server model.'),
  collectionLog: F('CLIENT', 'game_saves.snapshot', 'Same.'),
  bestiary: F('CLIENT', 'game_saves.snapshot', 'Kill counts per monster. No server model.'),
  achievements: F('CLIENT', 'game_saves.snapshot', 'No server achievement model.'),
  dropLog: F('CLIENT', 'game_saves.snapshot', 'A rolling display log.'),
  chronicle: F('CLIENT', 'game_saves.snapshot', 'The player-facing event history.'),
  marketStats: F('CLIENT', 'game_saves.snapshot',
    'A client-side tally of market activity. The market\'s own tables are the record.'),
  dungeons: F('CLIENT', 'game_saves.snapshot',
    'lastRun cooldowns. dungeon_run unlocks are merge=\'none\' in the catalogue — a one-shot '
    + 'action with no persistent home BY DESIGN — so there is nothing to import them into.'),
  dungeonStats: F('CLIENT', 'game_saves.snapshot', 'Best times / clears. No server model.'),
  buffs: F('CLIENT', 'game_saves.snapshot',
    'The consumable buff timeline. src/core/away.js counts buffs down across an away window from '
    + 'the client\'s list; there is no server buff table yet.'),
  buyback: F('CLIENT', 'game_saves.snapshot', 'The vendor buy-back queue.'),
  loadouts: F('CLIENT', 'game_saves.snapshot', 'Saved equipment sets.'),
  lockedItems: F('CLIENT', 'game_saves.snapshot', 'UI protection flags on stacks.'),
  wieldGrandfather: F('CLIENT', 'game_saves.snapshot',
    'Which items a veteran may wield despite a later requirement change. A grandfather list is '
    + 'a statement about the PAST, and the server has no record of that past to check it against.'),
  restedAt: F('CLIENT', 'game_saves.snapshot', 'Rested-XP model is client-side.'),
  restedXp: F('CLIENT', 'game_saves.snapshot', 'Same.'),
  lifetimeKills: F('CLIENT', 'game_saves.snapshot',
    'Superseded by the imported stat:kills counter; the blob keeps its own for display.'),
  combatKillsThisFoe: F('CLIENT', 'game_saves.snapshot', 'In-flight combat counter.'),
  currentCombatTier: F('CLIENT', 'game_saves.snapshot', 'Combat tier selection (UI state).'),
  combatStyle: F('CLIENT', 'game_saves.snapshot', 'Per-weapon-class style choice.'),
  activeStyle: F('CLIENT', 'game_saves.snapshot', 'Current attack style.'),
  seasonPass: F('CLIENT', 'game_saves.snapshot', 'Retired in b215; nothing reads it.'),
  tools: F('CLIENT', 'game_saves.snapshot', 'Client tool-tier cache; derived from equipment.'),
  junkThreshold: F('CLIENT', 'game_saves.snapshot', 'Sell-junk preference.'),
  settings: F('CLIENT', 'game_saves.snapshot', 'sfx / reduceFx / leftHand. UI preferences.'),
  viewingSkill: F('CLIENT', 'game_saves.snapshot', 'Which skill panel is open.'),
  activeTab: F('CLIENT', 'game_saves.snapshot', 'Which tab is open.'),
  lastWelcome: F('CLIENT', 'game_saves.snapshot', 'When the welcome modal last showed.'),
  lastSessionSummary: F('CLIENT', 'game_saves.snapshot', 'Display-only session card.'),
  sessionStart: F('CLIENT', 'game_saves.snapshot', 'Display-only.'),
  activeAction: F('CLIENT', 'game_saves.snapshot', 'In-flight UI action.'),
  actionProgress: F('CLIENT', 'game_saves.snapshot', 'In-flight UI progress.'),
  activeArtisanSkill: F('CLIENT', 'game_saves.snapshot', 'In-flight artisan selection.'),

  // ── DEVICE / META ───────────────────────────────────────────────────────
  __device: F('DEVICE', '(discarded)', 'A device fingerprint written by the sync layer.'),
  account: F('DEVICE', '(discarded)', 'Cached auth profile. auth.users is the record.'),
  cloudSyncedAt: F('DEVICE', '(discarded)', 'When this device last uploaded.'),
  lastSeen: F('META', 'ledger meta', 'Recorded, not applied. accrued_to is now().'),
  createdAt: F('META', 'ledger meta', 'Character creation stamp; player_state.created_at is the record.'),
  schemaVersion: F('META', 'ledger meta', 'Snapshot schema version, recorded for the audit trail.'),
  v: F('META', 'ledger meta', 'Save-migration version, recorded.'),
  migratedToV3At: F('META', 'ledger meta', 'Save-migration stamp, recorded.'),

  // ── NO_SYNC — declared so a denylist change surfaces here ───────────────
  activeMonster: F('NO_SYNC', '(never in the blob)', 'src/net/events.js NO_SYNC.'),
  monsterHp: F('NO_SYNC', '(never in the blob)', 'NO_SYNC.'),
  monsterMaxHp: F('NO_SYNC', '(never in the blob)', 'NO_SYNC.'),
  hp: F('DERIVED', 'player_state.hp = max_hp',
    'A field the b127 Character page read and legacy.js never wrote ("HP: — / —"). If a save '
    + 'ever carries one it is a fallback read, not the record — playerHp is, and it is NO_SYNC. '
    + 'Declared so it cannot arrive as an unmapped surprise on freeze day.'),
  playerHp: F('NO_SYNC', '(never in the blob)',
    'NO_SYNC — which is why the import derives hp = max_hp. There is no HP in the blob to import '
    + 'and the alternatives are "1 HP" and "invent a number".'),
  playerMaxHp: F('NO_SYNC', '(never in the blob)',
    'NO_SYNC, and derived anyway: hr_level_from_xp(hitpoints xp), the client\'s own rule.'),
  activeSkill: F('NO_SYNC', '(never in the blob)', 'NO_SYNC.'),
  skillTargetId: F('NO_SYNC', '(never in the blob)', 'NO_SYNC.'),
  skillProgress: F('NO_SYNC', '(never in the blob)', 'NO_SYNC.'),
  skillMs: F('NO_SYNC', '(never in the blob)', 'NO_SYNC.'),
  activeArtisanRecipe: F('NO_SYNC', '(never in the blob)', 'NO_SYNC.'),
  combatLog: F('NO_SYNC', '(never in the blob)', 'NO_SYNC.'),
  lastOfflineSummary: F('NO_SYNC', '(never in the blob)', 'NO_SYNC.'),
};

/* The nine lifetime `stat` keys the accrual engine already writes, mapped from
   the client's own names. src/core/goals.js lists them as the key space its
   `ev:` prefix must not collide with — so this is a reader of that decision,
   not a second one. */
export const STAT_KEYS = {
  kills: 'kills', crits: 'crits', gathered: 'gathered', chopped: 'chopped',
  mined: 'mined', fished: 'fished', toolDoubles: 'tool_doubles',
  deaths: 'deaths', rareDrops: 'rare_drops',
};

/* The six goal events, each sourced from the client stat that counts the same
   thing. GOAL_EVENTS is imported from src/core/goals.js rather than restated,
   so a seventh event type fails the assertion below instead of silently never
   importing. */
export const GOAL_SOURCE = {
  kill_any: 'kills', gather: 'gathered', harvest: 'harvested',
  cooked: 'cooked', crafted: 'crafted', smithed: 'smithed',
};
for (const ev of GOAL_EVENTS) {
  if (!GOAL_SOURCE[ev]) {
    die(`GOAL_EVENTS names "${ev}" and GOAL_SOURCE has no client stat for it. A goal counter `
      + 'with no import source would start every quest at zero for every existing player. '
      + 'Add the mapping (or declare it unsourceable) in tools/cutover-import.mjs.');
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   2 · THE PLAN BUILDER
   ══════════════════════════════════════════════════════════════════════════ */

/** Assert every key in the snapshot has a declared outcome. Fatal, by name. */
export function declarationGap(snapshot) {
  const missing = [];
  for (const k of Object.keys(snapshot || {})) {
    if (k.charAt(0) === '_') continue;              // scratch never reaches the blob
    if (!Object.prototype.hasOwnProperty.call(FIELD_MAP, k)) missing.push(k);
  }
  return missing;
}

/**
 * Build the proposed plan for ONE snapshot.
 * @returns {{plan:object, report:object}}
 */
export function buildPlan(snapshot, cat, game) {
  const rep = {
    imported: {}, dropped: [], clamped: [], aliased: [], client: [], derived: [], device: [], meta: {},
  };
  const plan = { state: {}, skills: {}, inventory: {}, equipment: {}, farm: [], progress: [] };
  const S = snapshot || {};
  const ID_ALIAS = (game && game.ID_ALIAS) || {};

  const drop = (kind, id, reason, extra = {}) => rep.dropped.push({ kind, id, reason, ...extra });
  const clamp = (field, from, to, why) => rep.clamped.push({ field, from, to, why });

  // Which unlock ids exist, and under which kind. Read out of the server's own
  // catalogue (hr_unlocks) — never a list this file keeps.
  const unlock = (id) => cat.unlocks.get(id) || null;
  const pushUnlock = (rawId, value, source) => {
    // ── THE ID-SPACE AUDIT (game-designer ruling 2026-08-15) ─────────────
    // EVERY unlock store — recipes, traits, cosmetics, themes, character
    // slots, companions, room perks, bounty — passes through here, so this is
    // the one place client id-space is reconciled to the catalogue. Resolve
    // the alias FIRST; a client id that differs from the catalogue and has NO
    // alias is not silently dropped — it is reported by name as ALIASABLE, the
    // structural form of the b350 declaration-gap lesson: an id-space mismatch
    // nobody has ruled on fails visibly rather than losing a player's unlock.
    const { id, aliased, from } = resolveAlias(rawId, ID_ALIAS);
    if (aliased) rep.aliased.push({ from, to: id, source });
    const u = unlock(id);
    if (!u) {
      drop('unlock', id, 'not_in_hr_unlocks', aliased ? { source, aliased_from: from } : { source, aliasable: true });
      return;
    }
    if (!u.progress_kind) { drop('unlock', id, 'merge_none_has_no_storage', { source }); return; }
    let v = Math.floor(Number(value) || 0);
    if (v <= 0) return;
    // ⚠ CEILINGS AND LADDERS APPLY TO LEVELS ONLY, and this is not a shortcut —
    //   it mirrors hr_unlock_guard exactly, which returns early for any kind
    //   other than 'unlock' because "their ceilings are a PURCHASE decision,
    //   not a storage one". `worker` carries max_value 1 (the shop offer's
    //   `max`), while the real cap is the property tier and a live player has
    //   FOUR hired. Clamping a count against a purchase limit would have
    //   deleted three workers per player, silently, on freeze day.
    if (u.progress_kind === 'unlock') {
      if (u.max_value != null && v > Number(u.max_value)) {
        clamp(`unlock:${id}`, v, Number(u.max_value), 'catalogue ceiling');
        v = Number(u.max_value);
      }
      if (Array.isArray(u.rungs) && u.rungs.length && !u.rungs.includes(v)) {
      // Snap DOWN to the highest rung at or below the value. Never up: an
      // interpolated rung the shop does not sell is a room the player did not
      // buy, and the guard would refuse it anyway.
        const below = u.rungs.filter((r) => r <= v);
        if (!below.length) { drop('unlock', id, 'below_lowest_rung', { source, value: v }); return; }
        const snapped = Math.max(...below);
        if (snapped !== v) clamp(`unlock:${id}`, v, snapped, 'snapped down to a sold rung');
        v = snapped;
      }
    }
    plan.progress.push({ kind: u.progress_kind, key: id, value: v });
  };

  // ── walk the snapshot, key by declared key ─────────────────────────────
  for (const k of Object.keys(S)) {
    if (k.charAt(0) === '_') continue;
    const e = FIELD_MAP[k];
    if (!e) continue;                              // declarationGap() is the gate
    if (e.outcome === 'CLIENT') rep.client.push(k);
    else if (e.outcome === 'DERIVED') rep.derived.push(k);
    else if (e.outcome === 'DEVICE') rep.device.push(k);
    else if (e.outcome === 'META') rep.meta[k] = S[k];
    else if (e.outcome === 'NO_SYNC') {
      // A NO_SYNC key that is PRESENT means the denylist and the blob disagree.
      // Reported rather than dropped silently — it is a save-system defect.
      drop('no_sync_key_present', k, 'in the blob despite NO_SYNC');
    }
  }

  // ── state ──────────────────────────────────────────────────────────────
  plan.state.gold = Math.max(0, int(S.gold) ?? 0);
  plan.state.gems = Math.max(0, int(S.gems) ?? 0);
  plan.state.bank_cap = bankCapOf(S.bank, game.BANK_SPACE);

  // ── inventory (+ bank items) ───────────────────────────────────────────
  const bag = new Map();
  const addToBag = (id, qty, where) => {
    const n = int(qty);
    if (n === null) { drop('item', id, 'not_a_number', { where, value: qty }); return; }
    if (n <= 0) return;
    if (!cat.items.has(id)) { drop('item', id, 'not_in_hr_items', { where, qty: n }); return; }
    bag.set(id, (bag.get(id) || 0) + n);
  };
  for (const [id, q] of Object.entries(S.inventory || {})) addToBag(id, q, 'inventory');
  for (const [id, q] of Object.entries(S.bank || {})) {
    if (BANK_RESERVED.has(id)) continue;           // bank-space bookkeeping, handled above
    addToBag(id, q, 'bank');
  }
  for (const [id, q] of bag) plan.inventory[id] = q;

  // ── equipment ──────────────────────────────────────────────────────────
  for (const [slot, id] of Object.entries(S.equipment || {})) {
    if (!id) continue;
    // THE COMPANION SLOT IS CLIENT-OWNED WHOLESALE — checked FIRST, before the
    // catalogue lookups, because `fox_companion` would otherwise pass all three
    // of them and import for one player while every other companion dropped.
    // See COMPANION_SLOT above.
    if (slot === COMPANION_SLOT) {
      drop('equipped_companion', id, companionDropReason(id), { slot });
      continue;
    }
    if (!cat.equipSlots.has(slot)) { drop('equip_slot', slot, 'not_in_hr_equip_slots', { item: id }); continue; }
    if (!cat.items.has(id)) { drop('equipped_item', id, 'not_in_hr_items', { slot }); continue; }
    if (!cat.itemSlots.has(`${id} ${slot}`)) {
      drop('equipped_item', id, 'item_not_valid_for_slot', { slot }); continue;
    }
    plan.equipment[slot] = id;
  }

  // ── skills ─────────────────────────────────────────────────────────────
  for (const [id, xp] of Object.entries(S.skills || {})) {
    if (!cat.skills.has(id)) { drop('skill', id, 'not_in_hr_skills', { xp }); continue; }
    const n = int(xp);
    if (n === null) { drop('skill', id, 'not_a_number', { xp }); continue; }
    plan.skills[id] = Math.max(0, n);
  }

  // ── farm ───────────────────────────────────────────────────────────────
  const plots = Array.isArray(S.farmPlots) ? S.farmPlots : [];
  plots.forEach((p, i) => {
    if (i >= 64) { drop('plot', i, 'index_out_of_range'); return; }
    const crop = p && typeof p === 'object' ? (p.cropId || null) : null;
    if (crop && !cat.crops.has(crop)) {
      drop('crop', crop, 'not_in_hr_crops', { plot: i });
      plan.farm.push({ i, crop: null, planted_at: null, watered_at: null });
      return;
    }
    const waterings = Array.isArray(p && p.waterings) ? p.waterings.filter((w) => num(w) !== null) : [];
    plan.farm.push({
      i,
      crop: crop || null,
      planted_at: crop && num(p.plantedAt) ? new Date(p.plantedAt).toISOString() : null,
      watered_at: crop && waterings.length ? new Date(Math.max(...waterings)).toISOString() : null,
    });
  });

  // ── auto-eat ───────────────────────────────────────────────────────────
  const eat = (S.autoActions && typeof S.autoActions === 'object' && S.autoActions.eat) || {};
  const food = eat.foodId || S.foodSlot || null;
  const pctRaw = num(eat.threshold) ?? num(S.autoEatPct);
  plan.state.auto_eat_enabled = !!eat.enabled;
  plan.state.auto_eat_pct = pctRaw === null ? 50 : Math.round(Math.max(0, Math.min(1, pctRaw)) * 100);
  if (food && !cat.autoEatable.has(food)) {
    drop('auto_eat_food', food, 'not_auto_eatable');
    plan.state.auto_eat_food = null;
  } else {
    plan.state.auto_eat_food = food || null;
  }

  // ── tool carry ─────────────────────────────────────────────────────────
  const carry = {};
  for (const [sk, v] of Object.entries(S.toolCarry || {})) {
    if (!cat.skills.has(sk)) { drop('tool_carry', sk, 'not_in_hr_skills', { value: v }); continue; }
    const n = num(v);
    // hr_apply REFUSES a carry outside [0,1) rather than clamping it. Dropping
    // it here costs at most a fraction of one item and keeps the plan
    // acceptable; handing the RPC a value it must reject would cost the player
    // their whole import.
    if (n === null || n < 0 || n >= 1) { drop('tool_carry', sk, 'outside_[0,1)', { value: v }); continue; }
    carry[sk] = n;
  }
  plan.state.tool_carry = carry;

  // ── unlocks ────────────────────────────────────────────────────────────
  for (const [id, lv] of Object.entries(S.rooms || {})) pushUnlock(`room:${id}`, lv, 'rooms');

  const tier = int(S.homestead && S.homestead.tier) ?? 0;
  if (tier > 0) {
    const t = game.TIERS[tier];
    if (!t) drop('property', String(tier), 'tier_index_off_the_ladder');
    else pushUnlock(`property:${t.id}`, tier, 'homestead.tier');
  }

  const plotTier = int(S.plotLevels) ?? 1;
  if (plotTier > 1) pushUnlock('farm_plot_tier', plotTier, 'plotLevels');

  const plotCounts = new Map();
  for (const b of (Array.isArray(S.plotBuildings) ? S.plotBuildings : [])) {
    if (b && b.id) plotCounts.set(b.id, (plotCounts.get(b.id) || 0) + 1);
  }
  for (const [id, n] of plotCounts) pushUnlock(`plot:${id}`, n, 'plotBuildings');

  const hired = (S.workers && Array.isArray(S.workers.hired)) ? S.workers.hired.length : 0;
  if (hired > 0) pushUnlock('worker', hired, 'workers.hired');

  for (const [id, on] of Object.entries(S.unlockedRecipes || {})) {
    if (on) pushUnlock(`recipe:${id}`, 1, 'unlockedRecipes');
  }
  for (const id of (Array.isArray(S.ownedThemes) ? S.ownedThemes : [])) pushUnlock(`theme:${id}`, 1, 'ownedThemes');
  for (const id of (Array.isArray(S.ownedCosmetics) ? S.ownedCosmetics : [])) pushUnlock(`cosmetic:${id}`, 1, 'ownedCosmetics');
  for (const [id, on] of Object.entries(S.entitlements || {})) {
    if (on) pushUnlock(`entitlement:${id}`, 1, 'entitlements');
  }
  for (const [id, on] of Object.entries(S.traits || {})) {
    if (on) pushUnlock(`trait:${id}`, 1, 'traits');
  }
  const upgrades = (S.bountyHunter && S.bountyHunter.upgrades) || {};
  for (const [id, on] of Object.entries(upgrades)) {
    if (on) pushUnlock(`bounty:${id}`, 1, 'bountyHunter.upgrades');
  }

  // ── stats: nine lifetime counters + six goal counters ──────────────────
  const st = (S.stats && typeof S.stats === 'object') ? S.stats : {};
  const declaredStat = new Set([...Object.keys(STAT_KEYS), ...Object.values(GOAL_SOURCE)]);
  for (const [clientKey, serverKey] of Object.entries(STAT_KEYS)) {
    const n = int(st[clientKey]);
    if (n && n > 0) plan.progress.push({ kind: 'stat', key: serverKey, value: n });
  }
  for (const ev of GOAL_EVENTS) {
    const n = int(st[GOAL_SOURCE[ev]]);
    if (n && n > 0) plan.progress.push({ kind: 'stat', key: goalKey(ev), value: n });
  }
  // Nested keys are REPORTED, not fatal: `stats` grows with every new counter
  // and a fatal here would block the freeze on a cosmetic tally. The fatal
  // gate is at the TOP level, where a new field means a new domain.
  rep.undeclaredStatKeys = Object.keys(st).filter((k) => !declaredStat.has(k));

  rep.imported = {
    gold: plan.state.gold, gems: plan.state.gems, bank_cap: plan.state.bank_cap,
    skills: Object.keys(plan.skills).length,
    items: Object.keys(plan.inventory).length,
    equipment: Object.keys(plan.equipment).length,
    farm: plan.farm.length,
    progress: plan.progress.length,
  };
  return { plan, report: rep };
}

/* ══════════════════════════════════════════════════════════════════════════
   2b · THE ID-SPACE AUDIT — diff EVERY client unlock store against the catalogue

   Game-designer ruling 3 (2026-08-15): the bounty drop was the first instance
   of a class, so before the import runs, EVERY store whose ids must land in
   hr_unlocks is diffed against it — recipes, traits, cosmetics, themes,
   entitlements, rooms, plots, property, bounty. Any client id that is neither
   in the catalogue nor aliased is REPORTED BY NAME as `aliasable`, never
   silently dropped. That is the structural form of the b350 declaration-gap
   lesson: an id-space mismatch nobody has ruled on must fail visibly.

   This is a SECOND expression of the reconciliation, independent of buildPlan
   (it builds no plan, it only classifies), so a bug in one does not hide in the
   other. buildPlan reports the same facts as a SIDE EFFECT of building; this
   reports them as the WHOLE JOB, which is what the dry-run and the test read.

   Two of the ruling's named stores are DELIBERATELY EXCLUDED, with reasons,
   because excluding without a reason is exactly the silence this audit exists to
   end:
     · companion — CLIENT (FIELD_MAP). Most companion ids are EARNED, not
       shop-bought, so they are not in the shop-derived catalogue and never
       will be; auditing ownedIds against it would report a pile of expected
       "unmapped" pets and drown the real signal. Companions are not imported.
     · character_slot — no client STORE exists in the snapshot. Slots are
       account-level (src/multi-character.js), not a `game_saves` field, so
       there is nothing to diff. The catalogue namespace exists for the shop;
       the import has no source for it.
   ══════════════════════════════════════════════════════════════════════════ */
export const AUDIT_STORES = [
  { store: 'unlockedRecipes', namespace: 'recipe', ids: (S) => Object.keys(S.unlockedRecipes || {}).filter((k) => S.unlockedRecipes[k]) },
  { store: 'traits', namespace: 'trait', ids: (S) => Object.keys(S.traits || {}).filter((k) => S.traits[k]) },
  { store: 'ownedCosmetics', namespace: 'cosmetic', ids: (S) => (Array.isArray(S.ownedCosmetics) ? S.ownedCosmetics : []) },
  { store: 'ownedThemes', namespace: 'theme', ids: (S) => (Array.isArray(S.ownedThemes) ? S.ownedThemes : []) },
  { store: 'entitlements', namespace: 'entitlement', ids: (S) => Object.keys(S.entitlements || {}).filter((k) => S.entitlements[k]) },
  { store: 'rooms', namespace: 'room', ids: (S) => Object.keys(S.rooms || {}).filter((k) => Number(S.rooms[k]) > 0) },
  { store: 'plotBuildings', namespace: 'plot', ids: (S) => [...new Set((Array.isArray(S.plotBuildings) ? S.plotBuildings : []).map((b) => b && b.id).filter(Boolean))] },
  { store: 'bountyHunter.upgrades', namespace: 'bounty', ids: (S) => Object.keys((S.bountyHunter || {}).upgrades || {}).filter((k) => (S.bountyHunter.upgrades)[k]) },
];

export const AUDIT_EXCLUDED = {
  companion: 'CLIENT — most companion ids are earned, not shop-catalogued; not imported.',
  character_slot: 'no client store in the snapshot; slots are account-level (multi-character.js).',
};

/**
 * Diff every imported unlock store against the catalogue.
 * @returns {{store, namespace, mapped:[], aliased:[{from,to}], unmapped:[]}[]}
 *          plus `.excluded` documenting the ruling's excluded stores.
 */
export function auditIdSpaces(snapshot, cat, game) {
  const S = snapshot || {};
  const ID_ALIAS = (game && game.ID_ALIAS) || {};
  const out = [];
  for (const spec of AUDIT_STORES) {
    const row = { store: spec.store, namespace: spec.namespace, mapped: [], aliased: [], unmapped: [] };
    for (const localId of spec.ids(S)) {
      const raw = `${spec.namespace}:${localId}`;
      const { id, aliased, from } = resolveAlias(raw, ID_ALIAS);
      if (cat.unlocks.has(id)) {
        if (aliased) row.aliased.push({ from, to: id });
        else row.mapped.push(id);
      } else {
        // Reported BY NAME, tagged aliasable — a candidate for a future alias
        // ruling, not a silent loss.
        row.unmapped.push(id);
      }
    }
    out.push(row);
  }
  out.excluded = { ...AUDIT_EXCLUDED };
  return out;
}

/* ══════════════════════════════════════════════════════════════════════════
   3 · THE VERIFIER

   Deliberately does NOT read `plan`. It re-derives what the server SHOULD hold
   straight from the snapshot and compares that to the envelope `hr_state_of`
   returned. Two expressions of the same rule; a bug in buildPlan shows up as a
   mismatch instead of agreeing with itself.
   ══════════════════════════════════════════════════════════════════════════ */
export function verify(snapshot, envelope, cat, game, ...reports) {
  const bad = [];
  const S = snapshot || {};
  const env = envelope || {};
  const state = env.state || {};
  /* BOTH reports, because a drop can happen on EITHER side: the tool drops an
     uncatalogued id before proposing it, and the RPC drops one the tool got
     past (or that a live catalogue change made unknown between the two). A
     verifier that only read the server's list would call the tool's own honest
     drops "unreported" — which is what the first run of this guard did, and it
     is the right kind of failure to have found in a test. */
  const clampedFields = new Set();
  const droppedIds = new Set();
  for (const r of reports) {
    if (!r) continue;
    for (const c of (r.clamps || r.clamped || [])) clampedFields.add(c.field);
    for (const d of (r.drops || r.dropped || [])) droppedIds.add(String(d.id));
  }

  const cmp = (label, want, have, clampKey) => {
    if (want === have) return;
    if (clampKey && clampedFields.has(clampKey)) return;   // clamped AND reported
    bad.push(`${label}: snapshot ${JSON.stringify(want)} <> server ${JSON.stringify(have)}`);
  };

  cmp('gold', Math.max(0, int(S.gold) ?? 0), Number(state.gold), 'gold');
  cmp('gems', Math.max(0, int(S.gems) ?? 0), Number(state.gems), 'gems');
  cmp('bank_cap', bankCapOf(S.bank, game.BANK_SPACE), Number(state.bank_cap), 'bank_cap');

  // hp / max_hp are DERIVED. Verified against the derivation, not the blob —
  // and against src/core/xp.js's own levelFromXp, which is the function the
  // client uses (`G.playerMaxHp = levelFromXp(G.skills.hitpoints)`), so the
  // check cannot drift from the rule it is checking.
  const hpXp = int((S.skills || {}).hitpoints) ?? 0;
  const wantMax = Math.max(1, levelFromXp(Math.min(hpXp, 13034431)));
  cmp('max_hp', wantMax, Number(state.max_hp));
  cmp('hp', wantMax, Number(state.hp));
  if (state.active_kind !== 'idle') bad.push(`active_kind: server ${state.active_kind} <> idle`);

  // skills
  for (const [id, xp] of Object.entries(S.skills || {})) {
    if (!cat.skills.has(id)) {
      if ((env.skills || {})[id]) bad.push(`skill ${id}: uncatalogued but present on the server`);
      continue;
    }
    const want = Math.max(0, int(xp) ?? 0);
    const have = Number(((env.skills || {})[id] || {}).xp);
    cmp(`skill ${id}`, want, have, `skill:${id}`);
  }

  // inventory — rebuilt from BOTH sources, independently of buildPlan
  const want = new Map();
  const consider = (id, q) => {
    const n = int(q);
    if (n === null || n <= 0 || !cat.items.has(id)) return;
    want.set(id, (want.get(id) || 0) + n);
  };
  for (const [id, q] of Object.entries(S.inventory || {})) consider(id, q);
  for (const [id, q] of Object.entries(S.bank || {})) if (!BANK_RESERVED.has(id)) consider(id, q);
  const haveInv = env.inventory || {};
  for (const [id, q] of want) cmp(`item ${id}`, q, Number(haveInv[id]), `item:${id}`);
  for (const id of Object.keys(haveInv)) {
    if (!want.has(id)) bad.push(`item ${id}: on the server but not in the snapshot`);
  }

  // equipment
  const haveEq = env.equipment || {};
  for (const [slot, id] of Object.entries(S.equipment || {})) {
    if (!id) continue;
    // The companion slot is EXPECTED ABSENT server-side, whatever it holds —
    // including `fox_companion`, which is a legal catalogued item in this slot
    // and would otherwise read as "legal, so it must be present". See
    // COMPANION_SLOT.
    if (slot === COMPANION_SLOT) {
      if (haveEq[slot]) bad.push(`equip ${slot}: ${haveEq[slot]} reached the server — the companion slot is client-owned`);
      else if (!droppedIds.has(String(id))) bad.push(`equip ${slot}: ${id} was dropped without a report`);
      continue;
    }
    const legal = cat.equipSlots.has(slot) && cat.items.has(id) && cat.itemSlots.has(`${id} ${slot}`);
    if (!legal) {
      if (haveEq[slot] === id) bad.push(`equip ${slot}: illegal item ${id} reached the server`);
      else if (!droppedIds.has(String(id)) && !droppedIds.has(String(slot))) {
        bad.push(`equip ${slot}: ${id} was dropped without a report`);
      }
      continue;
    }
    cmp(`equip ${slot}`, id, haveEq[slot]);
  }

  // farm — row COUNT is the capacity, so it is the thing that must match
  const plots = Array.isArray(S.farmPlots) ? S.farmPlots.slice(0, 64) : [];
  cmp('farm plots', plots.length, (env.farm || []).length);
  const farmByIdx = new Map((env.farm || []).map((f) => [f.i, f]));
  plots.forEach((p, i) => {
    const crop = (p && p.cropId && cat.crops.has(p.cropId)) ? p.cropId : null;
    const row = farmByIdx.get(i);
    if (!row) { bad.push(`farm plot ${i}: missing on the server`); return; }
    cmp(`farm plot ${i} crop`, crop, row.crop === undefined ? null : row.crop);
  });

  // progress — every unlock the snapshot implies must be present at the value
  // the catalogue permits, and nothing else may be.
  const prog = new Map((env.progress || []).filter((p) => p.period === '')
    .map((p) => [`${p.kind} ${p.key}`, Number(p.value)]));
  const wantUnlock = new Map();
  const ID_ALIAS = (game && game.ID_ALIAS) || {};
  const noteWant = (rawId, v) => {
    // Alias-aware, exactly like buildPlan — otherwise verify is BLIND to the
    // alias: it would compute `bounty:goldBoost` (uncatalogued, skipped) and
    // never notice whether the server holds `bounty:mark_pouch`.
    const { id } = resolveAlias(rawId, ID_ALIAS);
    const u = cat.unlocks.get(id);
    if (!u || !u.progress_kind) return;                    // dropped by rule; checked below
    let n = Math.floor(Number(v) || 0);
    if (n <= 0) return;
    // Ceilings and ladders apply to LEVELS only — hr_unlock_guard's own rule,
    // and the same one buildPlan follows. See the note there.
    if (u.progress_kind === 'unlock') {
      if (u.max_value != null) n = Math.min(n, Number(u.max_value));
      if (Array.isArray(u.rungs) && u.rungs.length) {
        const below = u.rungs.filter((r) => r <= n);
        if (!below.length) return;
        n = Math.max(...below);
      }
    }
    wantUnlock.set(`${u.progress_kind} ${id}`, n);
  };
  for (const [id, lv] of Object.entries(S.rooms || {})) noteWant(`room:${id}`, lv);
  const tier = int(S.homestead && S.homestead.tier) ?? 0;
  if (tier > 0 && game.TIERS[tier]) noteWant(`property:${game.TIERS[tier].id}`, tier);
  const pt = int(S.plotLevels) ?? 1;
  if (pt > 1) noteWant('farm_plot_tier', pt);
  const pc = new Map();
  for (const b of (Array.isArray(S.plotBuildings) ? S.plotBuildings : [])) {
    if (b && b.id) pc.set(b.id, (pc.get(b.id) || 0) + 1);
  }
  for (const [id, n] of pc) noteWant(`plot:${id}`, n);
  const hired = (S.workers && Array.isArray(S.workers.hired)) ? S.workers.hired.length : 0;
  if (hired > 0) noteWant('worker', hired);
  for (const [id, on] of Object.entries(S.unlockedRecipes || {})) if (on) noteWant(`recipe:${id}`, 1);
  for (const id of (Array.isArray(S.ownedThemes) ? S.ownedThemes : [])) noteWant(`theme:${id}`, 1);
  for (const id of (Array.isArray(S.ownedCosmetics) ? S.ownedCosmetics : [])) noteWant(`cosmetic:${id}`, 1);
  for (const [id, on] of Object.entries(S.entitlements || {})) if (on) noteWant(`entitlement:${id}`, 1);
  for (const [id, on] of Object.entries(S.traits || {})) if (on) noteWant(`trait:${id}`, 1);
  for (const [id, on] of Object.entries((S.bountyHunter || {}).upgrades || {})) if (on) noteWant(`bounty:${id}`, 1);

  for (const [k, v] of wantUnlock) {
    const have = prog.get(k);
    if (have !== v) bad.push(`unlock ${k.replace(' ', ' ')}: snapshot implies ${v}, server has ${have}`);
  }

  // the six goal counters + nine lifetime stats
  const st = (S.stats && typeof S.stats === 'object') ? S.stats : {};
  for (const [ck, sk] of Object.entries(STAT_KEYS)) {
    const n = int(st[ck]);
    if (n && n > 0) cmp(`stat ${sk}`, n, prog.get(`stat ${sk}`), `progress:${sk}`);
  }
  for (const ev of GOAL_EVENTS) {
    const n = int(st[GOAL_SOURCE[ev]]);
    if (n && n > 0) cmp(`stat ${goalKey(ev)}`, n, prog.get(`stat ${goalKey(ev)}`), `progress:${goalKey(ev)}`);
  }

  // auto-eat
  const eat = ((S.autoActions || {}).eat) || {};
  const pctRaw = num(eat.threshold) ?? num(S.autoEatPct);
  cmp('auto_eat_pct', pctRaw === null ? 50 : Math.round(Math.max(0, Math.min(1, pctRaw)) * 100),
      Number(state.auto_eat_pct), 'auto_eat_pct');
  const wantFood = eat.foodId || S.foodSlot || null;
  if (wantFood && cat.autoEatable.has(wantFood)) cmp('auto_eat_food', wantFood, state.auto_eat_food || null);
  else if (state.auto_eat_food) bad.push(`auto_eat_food: server holds ${state.auto_eat_food} which is not auto-eatable`);

  return bad;
}

/**
 * THE ONE VERIFICATION CALL. Both `run()` and tests/cutover-import.mjs go
 * through here, and that is the whole point of its existence.
 *
 * ⚠ WHY THIS FUNCTION EXISTS — the full-batch rehearsal on 2026-08-16 failed
 *   4 of 6 players with "equip companion: <id> was dropped without a report",
 *   while the guard had been GREEN on the same shape for two days. The defect
 *   was not in `verify` and not in `buildPlan`: BOTH were correct. It was that
 *   `run()` called `verify(..., out)` — the SERVER report only — while the test
 *   called `verify(..., out, report)` — server AND tool. A drop the tool makes
 *   before the RPC ever sees the plan is in `report`, never in `out`, so
 *   production ran a composition the test never exercised.
 *
 *   That is the instance-#18 family (same bytes, different composition) landing
 *   in the verifier of the tool built to catch exactly this. The fix is not to
 *   add the argument at the call site — that is the same fix that was already
 *   "obviously" right in the test. It is to make ONE call site exist, so the two
 *   CANNOT differ. A test that assembles its own arguments is testing its own
 *   assembly.
 */
export function verifyImport(snapshot, serverOut, toolReport, cat, game) {
  return verify(snapshot, serverOut && serverOut.envelope, cat, game, serverOut, toolReport);
}

/* ══════════════════════════════════════════════════════════════════════════
   4 · TRANSPORT — file bytes, nothing hand-authored, nothing printed
   ══════════════════════════════════════════════════════════════════════════ */
const PROJECT = 'nezapsylztqbbwuwembx';
const URL_Q = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;

function makeQuery() {
  let token;
  try { token = readFileSync(join(homedir(), '.supabase-token'), 'utf8').trim(); }
  catch { die('~/.supabase-token is not readable. The token is never taken from argv or the environment.'); }
  if (!token) die('~/.supabase-token is empty');
  return async function q(query) {
    const r = await fetch(URL_Q, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    const text = await r.text();
    if (!r.ok) throw new Error(`HTTP ${r.status}: ${text.slice(0, 800)}`);
    try { return JSON.parse(text); } catch { return text; }
  };
}

const lit = (s) => `'${String(s).replace(/'/g, "''")}'`;

/** Fetch every catalogue the mapping validates against, out of the DATABASE. */
export async function loadCatalogues(q) {
  const rows = async (sql) => { const r = await q(sql); return Array.isArray(r) ? r : []; };
  const items = await rows('select item_id, auto_eatable from public.hr_items');
  const skills = await rows('select skill_id from public.hr_skills');
  const eslots = await rows('select equip_slot from public.hr_equip_slots');
  const islots = await rows('select item_id, equip_slot from public.hr_item_slots');
  const crops = await rows('select crop_id from public.hr_crops');
  const unlocks = await rows('select unlock_id, namespace, merge, progress_kind, max_value, rungs from public.hr_unlocks');
  const cat = {
    items: new Set(items.map((r) => r.item_id)),
    autoEatable: new Set(items.filter((r) => r.auto_eatable).map((r) => r.item_id)),
    skills: new Set(skills.map((r) => r.skill_id)),
    equipSlots: new Set(eslots.map((r) => r.equip_slot)),
    itemSlots: new Set(islots.map((r) => `${r.item_id} ${r.equip_slot}`)),
    crops: new Set(crops.map((r) => r.crop_id)),
    unlocks: new Map(unlocks.map((r) => [r.unlock_id, {
      ...r,
      rungs: Array.isArray(r.rungs) ? r.rungs.map(Number)
        : (typeof r.rungs === 'string' ? r.rungs.replace(/[{}]/g, '').split(',').filter(Boolean).map(Number) : null),
    }])),
  };
  // A catalogue that came back empty makes every id unknown and every bag
  // empty, and the run would report a clean sweep of drops. Refuse.
  for (const [name, set] of [['hr_items', cat.items], ['hr_skills', cat.skills],
    ['hr_equip_slots', cat.equipSlots], ['hr_item_slots', cat.itemSlots],
    ['hr_crops', cat.crops], ['hr_unlocks', cat.unlocks]]) {
    if (!set.size) die(`${name} came back EMPTY. Every id would read as unknown and the run would `
      + 'report a clean sweep of drops. Refusing.');
  }
  return cat;
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/* ══════════════════════════════════════════════════════════════════════════
   5 · THE RUN
   ══════════════════════════════════════════════════════════════════════════ */
export async function run(argv) {
  const mode = argv.includes('--apply') ? 'apply'
    : argv.includes('--rehearse') ? 'rehearse'
      : 'dry-run';
  if (mode === 'apply' && !argv.includes('--yes')) {
    die('--apply writes to PRODUCTION and is irreversible without PITR. Add --yes when the '
      + 'freeze is in force and the runbook says so.');
  }
  const only = (() => { const i = argv.indexOf('--user'); return i >= 0 ? argv[i + 1] : null; })();
  const outDir = (() => { const i = argv.indexOf('--report-dir'); return i >= 0 ? argv[i + 1] : join(ROOT, 'cutover-reports'); })();

  const game = readGameData();
  const q = makeQuery();
  const cat = await loadCatalogues(q);

  const where = only ? ` where user_id = ${lit(only)}` : '';
  const saves = await q(
    `select user_id::text as user_id, slot, saved_at, snapshot::text as snapshot
       from public.game_saves${where} order by user_id, slot`);
  if (!Array.isArray(saves)) die(`game_saves query returned ${typeof saves}`);

  /* The marker table only exists once 2026-08-17-cutover-import.sql has been
     applied, and --dry-run is meant to be usable BEFORE that — rehearsing the
     shape of the run is most valuable while the migration is still staged. An
     absent table means "nobody has been imported", which is the truth. It is
     REPORTED rather than assumed, because in --apply mode an absent marker
     table is a hard stop: without it there is no idempotency at all. */
  let markers = [];
  let markerTable = true;
  try {
    markers = await q('select user_id::text as user_id, slot, snapshot_sha, '
      + 'imported_at::text as imported_at from public.hr_import_marker');
  } catch (e) {
    if (!/hr_import_marker.*does not exist/.test(e.message)) throw e;
    markerTable = false;
    if (mode !== 'dry-run') {
      die('public.hr_import_marker does not exist — apply supabase/migrations/'
        + '2026-08-17-cutover-import.sql first. Without the marker there is no idempotency, and a '
        + 'second run would import over every player a second time.');
    }
    console.log('  note: hr_import_marker does not exist yet (the migration is staged). '
      + 'Treating every player as un-imported, which is the truth.');
  }
  const done = new Set((Array.isArray(markers) ? markers : []).map((m) => `${m.user_id}:${m.slot}`));
  void markerTable;

  /* ⚠ THE CUTOVER IS A ONE-TIME CEREMONY (Security N1, 2026-08-17).
     The per-player marker above stops a re-import of somebody already imported.
     It does NOT stop the ceremony being run a second time — and the gap is real:
     a player who registers AFTER the cutover has no marker row and sits at
     version 0 with a live, client-authored game_saves.snapshot, so every check
     in hr_import_apply reads their blob as a legitimate first import. A second
     --apply would trust a forgeable client value, once, per new player.
     ANY marker row therefore means the ceremony is over. The server refuses
     independently (`cutover_closed`); this stop exists so the operator reads a
     sentence instead of a batch of errors. */
  const reopen = argv.includes('--reopen-cutover');
  if (mode === 'apply' && done.size && !reopen) {
    const when = markers.map((m) => m.imported_at).filter(Boolean).sort()[0];
    die(`THE CUTOVER IS CLOSED. public.hr_import_marker holds ${done.size} row(s)`
      + `${when ? ` (first import ${when})` : ''}, which means the one-time import ceremony has\n`
      + '  already run. Importing again would take a CLIENT-AUTHORED snapshot as server truth for\n'
      + '  any player who has no marker row — i.e. everyone who registered since — and that is the\n'
      + '  exact trust the whole server-authority program exists to remove. There is no un-import.\n'
      + '  The server refuses this too: hr_import_apply answers `cutover_closed` on every\n'
      + '  p_commit call while a marker exists.\n'
      + '  --rehearse and --dry-run are unaffected and are what you want for diagnosis.\n'
      + '  If the cutover genuinely must be re-opened, that is a deliberate, reviewed act:\n'
      + '    node tools/cutover-import.mjs --apply --yes --reopen-cutover');
  }
  /* --reopen-cutover must also lift the SERVER's seal, or the flag is a door
     that opens onto a wall. The GUC is set transaction-locally INSIDE the same
     statement as the RPC (a single statement is its own transaction, and the
     FROM row is produced before the target list), so it can never leak onto a
     pooled connection the way a session-level SET would. */
  const reopenFrom = reopen
    ? " from (select set_config('hearthrise.import_reopen', 'yes', true)) _reopen"
    : '';
  if (reopen && mode === 'apply') {
    console.log('  ⚠ --reopen-cutover: the server seal is being lifted for THIS RUN ONLY. '
      + 'Every player without a marker row will be imported from their client blob.');
  }

  const reports = [];
  const tool = `tools/cutover-import.mjs@${process.env.GIT_SHA || 'local'}`;
  let ok = 0; let skipped = 0; let failed = 0;

  console.log(`cutover-import [${mode}] — ${saves.length} save(s), `
    + `${cat.items.size} items / ${cat.skills.size} skills / ${cat.unlocks.size} unlocks in the catalogue`);

  for (const row of saves) {
    const id = `${row.user_id}:${row.slot}`;
    const rec = { user_id: row.user_id, slot: row.slot, saved_at: row.saved_at, status: null };
    reports.push(rec);
    try {
      let snap;
      try { snap = JSON.parse(row.snapshot); } catch { snap = null; }
      if (!snap || typeof snap !== 'object' || Array.isArray(snap)) {
        rec.status = 'SKIPPED'; rec.reason = 'snapshot is not a JSON object';
        skipped++; console.log(`  ${id}  SKIPPED  ${rec.reason}`); continue;
      }
      // A snapshot with none of the four load-bearing keys is not a save.
      const anchors = ['gold', 'skills', 'inventory', 'equipment'].filter((k) => k in snap);
      if (anchors.length < 2) {
        rec.status = 'SKIPPED'; rec.reason = `snapshot carries only ${anchors.length} of the four anchor keys`;
        skipped++; console.log(`  ${id}  SKIPPED  ${rec.reason}`); continue;
      }

      // ⚠ THE DECLARATION GATE. Fatal for the whole run, before anything is
      //   written: a field nobody classified is a domain nobody decided about,
      //   and the freeze is not the moment to decide it.
      const gap = declarationGap(snap);
      if (gap.length) {
        die(`UNMAPPED SNAPSHOT FIELD(S) on ${id}: ${gap.join(', ')}\n`
          + '  Every field must be declared in FIELD_MAP with exactly one outcome (SERVER /\n'
          + '  DERIVED / CLIENT / DEVICE / META / NO_SYNC) and a reason. Add the declaration —\n'
          + '  do NOT widen the gate. This is the b350 lesson: derivation removes the second\n'
          + '  LIST, it does not remove the second SIDE.');
      }

      const sha = sha256(row.snapshot);
      const { plan, report } = buildPlan(snap, cat, game);
      // THE ID-SPACE AUDIT, run independently of the plan (ruling 3). Its
      // `unmapped` lists are the freeze-day decision surface: a non-empty one on
      // a store the ruling says aligns is an unratified id-space mismatch.
      const audit = auditIdSpaces(snap, cat, game);
      const unmapped = audit.filter((a) => a.unmapped.length);
      rec.snapshot_sha = sha;
      rec.plan = report;
      rec.audit = audit;

      if (done.has(id)) {
        rec.status = 'SKIPPED'; rec.reason = 'already imported (marker row present)';
        skipped++; console.log(`  ${id}  SKIPPED  already imported`); continue;
      }

      if (mode === 'dry-run') {
        rec.status = 'PLANNED';
        console.log(`  ${id}  PLANNED  gold ${report.imported.gold} · ${report.imported.items} items · `
          + `${report.imported.skills} skills · ${report.imported.progress} progress · `
          + `${report.aliased.length} aliased · ${report.dropped.length} dropped · `
          + `${report.clamped.length} clamped`);
        for (const a of report.aliased) console.log(`      ~ aliased ${a.from} → ${a.to} (${a.source})`);
        for (const u of unmapped) {
          console.log(`      ⚠ ${u.store}: ${u.unmapped.length} client id(s) neither catalogued nor `
            + `aliased — a ruling is needed: ${u.unmapped.join(', ')}`);
        }
        ok++; continue;
      }

      const meta = { snapshot_sha: sha, snapshot_at: row.saved_at, tool };
      const commit = mode === 'apply';
      const res = await q(
        `select public.hr_import_apply(${lit(row.user_id)}::uuid, ${Number(row.slot)},
                ${lit(JSON.stringify(plan))}::jsonb, ${lit(JSON.stringify(meta))}::jsonb,
                ${commit ? 'true' : 'false'}) as r${reopenFrom}`);
      const out = Array.isArray(res) && res[0] ? res[0].r : null;
      rec.server = out;
      if (!out || out.ok !== true) {
        rec.status = 'FAILED'; rec.reason = (out && out.error) || 'no result';
        failed++; console.log(`  ${id}  FAILED   ${rec.reason} ${JSON.stringify(out && out.detail || {})}`);
        continue;
      }
      if (out.imported === false) {
        rec.status = 'SKIPPED'; rec.reason = out.skipped;
        skipped++; console.log(`  ${id}  SKIPPED  ${out.skipped}`); continue;
      }

      // ── PER-PLAYER VERIFICATION ──────────────────────────────────────
      // ONE call site, shared with the guard — see verifyImport's header.
      const problems = verifyImport(snap, out, report, cat, game);
      rec.mismatches = problems;
      if (problems.length) {
        rec.status = 'MISMATCH';
        failed++;
        console.log(`  ${id}  MISMATCH (${problems.length}):`);
        for (const p of problems.slice(0, 12)) console.log(`      ✗ ${p}`);
        if (commit) {
          console.log('      ⚠ THIS PLAYER IS COMMITTED. Stop the run, read the report, and use '
            + 'PITR — there is no un-import.');
        }
        continue;
      }
      rec.status = commit ? 'IMPORTED' : 'REHEARSED';
      ok++;
      console.log(`  ${id}  ${rec.status}  gold ${out.envelope.state.gold} · `
        + `${Object.keys(out.envelope.inventory).length} items · `
        + `${out.counts.progress} progress · ${out.drops.length} dropped · ${out.clamps.length} clamped`);
      for (const d of out.drops) console.log(`      – dropped ${d.kind} ${d.id}: ${d.reason}`);
      for (const c of out.clamps) console.log(`      – clamped ${c.field} ${c.from} → ${c.to}`);
    } catch (e) {
      // ONE PLAYER'S GARBAGE NEVER ABORTS THE BATCH.
      rec.status = 'FAILED'; rec.reason = String(e && e.message || e).slice(0, 500);
      failed++;
      console.log(`  ${id}  FAILED   ${rec.reason}`);
    }
  }

  mkdirSync(outDir, { recursive: true });
  const file = join(outDir, `cutover-${mode}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify({ mode, at: new Date().toISOString(), tool, reports }, null, 2));
  console.log(`\n${mode}: ${ok} ok · ${skipped} skipped · ${failed} failed`);
  console.log(`report: ${file}`);
  if (failed) process.exitCode = 1;
  return { ok, skipped, failed, reports };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  run(process.argv.slice(2)).catch((e) => { console.error('FAILED:', e.message); process.exit(1); });
}
