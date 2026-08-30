// ============================================================
// src/features/renown.js  — "Rise to Jarl" Renown ladder (meta-spine)
//
// The account-wide destination the whole game was missing. Every system
// (levels, combat, kills, bosses, quests, collection, daily streak, gold)
// feeds ONE Renown score. Renown never resets and never caps hard — there
// is always a next rank just ahead. This is the retention spine: the reason
// to log in tomorrow is that you're 3 kills from Freeholder.
//
// Design for stickiness (the good kind):
//   • Always a visible next rank you're close to (home hero shows it).
//   • Daily activity feeds it, so logging in daily literally speeds your rise.
//   • Rank-ups are a MOMENT — a claimable reward + a permanent perk + a title.
//   • Early ranks come fast (first-session dopamine); later ranks stretch out.
//
// This file is the DATA + LOGIC layer (pure, testable). UI panel + event
// hooks + nav tab are wired separately. Ranks/weights are plain data so
// tuning is a one-line edit — thresholds still want a real pacing pass.
//
// Loaded as a classic script (window.HearthriseRenown), same pattern as
// home-dashboard.js. Reads window.G defensively — every field guarded so a
// missing/old save scores 0 for that term instead of throwing.
// ============================================================
(function () {
  'use strict';

  /* Reward lines and the ladder's locked marks used emoji. One gilt glyph
     helper; '' rather than a character when the atlas has no match. */
  function _rnGly(key, px, col) {
    return (window.HR && window.HR.icon)
      ? (window.HR.icon(key, px || 13, col || 'currentColor') || '')
      : '';
  }

  // ── The ladder ──────────────────────────────────────────────
  // 12 ranks, Wanderer → High Jarl. `title` is the flex shown by your name.
  // `reward` is claimed once on reaching the rank (the dopamine hit).
  // `perk` is a permanent account bonus (wired incrementally). `unlock` is
  // the tangible reason to climb (regions are future content hooks).
  // `min` = Renown needed. Names are data — rename freely.
  // Every perk uses a WIRED type (allXP → getBonus, offlineHours → processOffline)
  // so nothing shown here is a broken promise. The bonuses stack as you climb —
  // higher rank literally makes everything faster (a retention engine in itself).
  //
  // ── b228 · THE BONUS REBASE (docs/design/bonus-rebase.md §3.1, §5.3) ──────
  // The ladder used to pay +22% allXP by High King — on its own, more than the
  // entire rebased permanent ceiling for that key. The six XP ranks come to
  // +1% each on the WIDE-key half-step, four of them survive as percentages,
  // and TWO CONVERT, because +1% is not an unlock line worth 13,500 and 72,000
  // renown:
  //
  //   Count → +1 market listing slot     (`marketSlots`, declared in getPerks
  //   King  → +1 daily task slot          and `dailyTasks` — both fields have
  //                                       existed unread since renown shipped)
  //
  // Access rewards are outside the power budget by design (§2.5): a slot does
  // not scale a rate, cannot compound, and is felt every single day. Renown's
  // six offline-hour ranks were always this shape — these two now match them.
  // Total after: +4% allXP, +12h offline, +1 market slot, +1 daily task.
  var RANKS = [
    { id: 'peasant',  name: 'Peasant',   title: 'a Peasant',    min: 0,      reward: {},                           perk: null,                            unlock: 'Your journey begins.' },
    { id: 'serf',     name: 'Serf',      title: 'a Serf',       min: 400,    reward: { gold: 250 },                perk: { offlineHours: 1 },             unlock: '+1 hour offline progress' },
    { id: 'squire',   name: 'Squire',    title: 'a Squire',     min: 900,    reward: { gold: 750 },                perk: { allXP: 0.01 },                 unlock: '+1% XP from every skill' },
    { id: 'knight',   name: 'Knight',    title: 'a Knight',     min: 2200,   reward: { gold: 2000 },               perk: { offlineHours: 1 },             unlock: '+1 more hour offline progress' },
    { id: 'baron',    name: 'Baron',     title: 'a Baron',      min: 4500,   reward: { gold: 5000, gems: 25 },     perk: { allXP: 0.01 },                 unlock: '+1% XP · 25 gems' },
    { id: 'viscount', name: 'Viscount',  title: 'a Viscount',   min: 8000,   reward: { gold: 10000 },              perk: { offlineHours: 2 },             unlock: '+2 hours offline progress' },
    { id: 'count',    name: 'Count',     title: 'a Count',      min: 13500,  reward: { gold: 20000, gems: 50 },    perk: { marketSlots: 1 },              unlock: '+1 market listing slot · 50 gems' },
    { id: 'marquis',  name: 'Marquis',   title: 'a Marquis',    min: 21000,  reward: { gold: 40000 },              perk: { offlineHours: 2 },             unlock: '+2 hours offline · the Marquis title' },
    { id: 'duke',     name: 'Duke',      title: 'a Duke',       min: 32000,  reward: { gold: 75000, gems: 100 },   perk: { allXP: 0.01 },                 unlock: '+1% XP · 100 gems' },
    { id: 'prince',   name: 'Prince',    title: 'a Prince',     min: 48000,  reward: { gold: 150000 },             perk: { offlineHours: 3 },             unlock: '+3 hours offline progress' },
    { id: 'king',     name: 'King',      title: 'the King',     min: 72000,  reward: { gold: 300000, gems: 250 },  perk: { dailyTasks: 1 },               unlock: 'King of your own realm · +1 daily task' },
    { id: 'highking', name: 'High King', title: 'the High King', min: 120000, reward: { gold: 1000000, gems: 500 }, perk: { allXP: 0.01, offlineHours: 3 }, unlock: 'Legend of the realm · +1% XP · +3h offline' }
  ];

  // ── Scoring weights (tunable) ───────────────────────────────
  // Renown = Σ(each progress term × weight). Balanced so steady grind (levels)
  // is the core, but "events" (quests, boss kills, mastering a skill) give
  // satisfying jumps, and the daily streak is rewarded (retention).
  // b226 (pacing retune, spec §8.1) — levels come ~3× slower after the
  // retune. Kills do NOT: the combat tick is deliberately unchanged, and the
  // streak term is pure wall-clock. Left alone the ladder would tilt toward
  // kill-grinding and away from "the steady grind of levels is the backbone",
  // which is the intent written into this file.
  //
  // The correction RAISES the level weights instead of lowering `kill`.
  // Lowering `kill` would be the tidier fix and it is forbidden: a kill-heavy
  // veteran's score would drop and they could be DEMOTED a rank — earned
  // progress clawed back, on the one surface whose entire job is to say you
  // climbed. Raising from the other side strictly increases every existing
  // player's renown; some will rank UP on this update, which is a gift.
  //
  // ── b228 · THE PACE RETUNE (Tyler, binding, 2026-08-09) ───────────────────
  // *"It also seems to be going way too fast."* He was right, and the census
  // says why: at the b226 weights a brand-new account scored ~380 before it
  // took a single action (24 starting levels × 14, plus a combat level), so
  // Serf was almost free — and a first full day of post-PACE play (~228K XP,
  // ~120 levels, a couple of quests) landed a player near 3,000, which is
  // KNIGHT ON DAY ONE. The ladder was paying for existing, not for climbing.
  //
  // Every weight comes down; the THRESHOLDS do not move by a single point.
  // That is deliberate and it is the only safe direction: `min` values are
  // compared against `renownHigh`, the b226 high-water ratchet, so lowering
  // weights can never demote anyone (their banked high-water mark holds their
  // rank forever) whereas raising thresholds would demote everybody at once.
  //
  // Derived against the pacing model (pacing-overhaul.md A.4: ~228K XP/day at
  // PACE, total level growing sub-linearly as skills get expensive), targeting
  // the pace Tyler asked for:
  //
  //   day 2     total level ~168 → ~440 renown     → SERF (400)      ✓ day 1-2
  //   day 5-7   total level ~370 → ~1,150 renown   → SQUIRE (900)    ✓ week 1
  //   day 17-24 total level ~685 → ~2,700 renown   → KNIGHT (2,200)  ✓ week 3-4
  //   day 44-60 total level ~977 → ~5,300 renown   → BARON (4,500)   ✓ month 2
  //
  // Note the shape this produces, which is the real point: total level is
  // ~80% of the score in week one and under a quarter of it by month two,
  // because levels get expensive while kills, quests, collection entries and
  // the login streak keep accruing linearly. Early renown is "you played";
  // late renown is "you accomplished". That is the ladder the flavour text at
  // the top of this file has always claimed to be.
  var W = {
    totalLevel:   2,     // sum of all skill levels — the steady backbone
    combatLevel:  2,     // same currency as a skill level, so the same weight
    kill:         0.05,  // 20 monsters = 1 renown
    bossKill:     5,     // bosses are landmarks
    questDone:    25,    // quests are still the biggest single jump available early
    collection:   3,     // each collection-log entry (completionism)
    skill99:      100,   // mastering a skill to 99 = a flex on top of its 99 levels
    streakBest:   5,     // best login streak ever (rewards the habit)
    bountyDone:   2,
    goldLog:      8      // × (log10(gold)-3) above 1k — a minor flex, not the path
  };
  /* How each term reads in a sentence, for the "How renown is earned" panel.
     The panel PRINTS W, never a copy of it, so the explanation cannot drift
     away from the scoring the way a hand-written help text always does. */
  var W_LABEL = {
    totalLevel:  'Every skill level you own',
    combatLevel: 'Every point of Combat level',
    kill:        'Each monster slain',
    bossKill:    'Each boss felled',
    questDone:   'Each quest finished',
    collection:  'Each Collection Log entry',
    skill99:     'Each skill taken to 99',
    streakBest:  'Each day of your best login streak',
    bountyDone:  'Each bounty completed',
    goldLog:     'Every tenfold of gold above 1,000'
  };

  function lvlFromXp(xp) {
    // Mirror of legacy levelFromXp without depending on load order.
    var T = window.XP_TABLE;
    if (!T) return 1;
    for (var i = T.length - 1; i >= 0; i--) if (xp >= T[i]) return Math.min(i + 1, 99);
    return 1;
  }

  /* b431 — skill-xp READ accessor (src/net/skill-record.js), DORMANT no-op today;
     the ESM analogue of the b429 legacy skillXp() sweep. See activities-grid.js. */
  function srXpOf(G, id) {
    var SR = window.HearthriseSkillRecord;
    return (SR && typeof SR.skillXpOr === 'function')
      ? SR.skillXpOr(G, id, 0)
      : ((G && G.skills && G.skills[id]) || 0);
  }

  // ── computeRenown(G) → integer score ────────────────────────
  // Defensive: any missing field contributes 0. NOTE: quest/collection/boss
  // field shapes are confirmed against the live G by the smoke test; if a
  // shape differs the term simply scores 0 (never throws).
  function computeRenown(G) {
    G = G || window.G;
    if (!G) return 0;
    var r = 0;

    // Total level + count of maxed skills, in one pass over G.skills.
    var totalLevel = 0, maxed = 0;
    if (G.skills && typeof G.skills === 'object') {
      for (var sk in G.skills) {
        if (!Object.prototype.hasOwnProperty.call(G.skills, sk)) continue;
        var lv = lvlFromXp(srXpOf(G, sk));
        totalLevel += lv;
        if (lv >= 99) maxed++;
      }
    }
    r += totalLevel * W.totalLevel;
    r += maxed * W.skill99;

    if (typeof window.getCombatLevel === 'function') {
      try { r += (window.getCombatLevel() || 0) * W.combatLevel; } catch (e) {}
    }

    var st = G.stats || {};
    r += (st.kills || 0) * W.kill;

    // Boss kills — no dedicated counter exists; sum bestiary entries whose
    // MONSTERS def is flagged boss.
    var bossKills = 0;
    if (G.bestiary && window.MONSTERS) {
      for (var bid in G.bestiary) {
        if (!Object.prototype.hasOwnProperty.call(G.bestiary, bid)) continue;
        var md = window.MONSTERS[bid];
        if (md && md.boss) bossKills += (G.bestiary[bid].kills || 0);
      }
    }
    r += bossKills * W.bossKill;

    // Quests completed — support both an array of completed and a count.
    var q = G.quests;
    var questsDone = 0;
    if (Array.isArray(q)) questsDone = q.filter(function (x) { return x && (x.done || x.completed || x.claimed); }).length;
    else if (typeof G.questsCompleted === 'number') questsDone = G.questsCompleted;
    r += questsDone * W.questDone;

    // Collection log entries discovered.
    var col = G.collection;
    var colCount = 0;
    if (col && typeof col === 'object') {
      for (var c in col) { if (Object.prototype.hasOwnProperty.call(col, c) && col[c]) colCount++; }
    }
    r += colCount * W.collection;

    if (G.bountyHunter && typeof G.bountyHunter.completed === 'number') r += G.bountyHunter.completed * W.bountyDone;

    var streakBest = (G.streak && (G.streak.best || G.streak.count)) || 0;
    r += streakBest * W.streakBest;

    /* A SCORE TERM, and it must not swing on a transport hiccup. An UNKNOWN
       balance contributes NOTHING (0 is what `G.gold || 0` produced anyway, so
       this is not a behaviour change) — and the b226 ratchet above is what makes
       that safe: `renownHigh` is a high-water mark, so a term that momentarily
       reads as absent can never demote a rank the player has already earned. */
    var gold = (typeof window.balOr === 'function') ? window.balOr('gold', 0) : (G.gold || 0);
    if (gold > 1000) r += (Math.log(gold) / Math.LN10 - 3) * W.goldLog;

    return Math.floor(r);
  }

  // ── b226: THE RATCHET ───────────────────────────────────────
  // `G.renownHigh` is the high-water mark of computeRenown(), and every rank
  // decision reads it instead of the live score. It is the structural
  // guarantee behind "earned progress is never clawed back": no future weight
  // change, in ANY direction, and no recount of a term, can ever demote
  // anybody. Without it the promise is a convention that survives exactly as
  // long as everyone remembers it.
  //
  // The live score still climbs normally — the ratchet only ever holds a
  // FLOOR, so it is invisible until the day it saves someone's rank.
  // One number in the save, no derived state, idempotent to recompute.
  function effectiveRenown(G) {
    G = G || window.G;
    var live = computeRenown(G);
    if (!G) return live;
    var high = G.renownHigh;
    if (typeof high !== 'number' || !isFinite(high) || high < 0) high = 0;
    if (live > high) { high = live; G.renownHigh = high; }
    else if (G.renownHigh !== high) { G.renownHigh = high; }
    return high;
  }

  // ── Rank lookup ─────────────────────────────────────────────
  function rankIndexFor(renown) {
    var idx = 0;
    for (var i = 0; i < RANKS.length; i++) if (renown >= RANKS[i].min) idx = i;
    return idx;
  }

  // Full state for the UI + home hero. Never throws.
  function getState(G) {
    G = G || window.G;
    var renown = effectiveRenown(G);
    var i = rankIndexFor(renown);
    var cur = RANKS[i];
    var next = RANKS[i + 1] || null;
    var into = renown - cur.min;
    var span = next ? (next.min - cur.min) : 1;
    var pct = next ? Math.max(0, Math.min(1, into / span)) : 1;
    return {
      renown: renown,
      rankIndex: i,
      rank: cur,
      next: next,
      progress: pct,               // 0..1 toward next rank
      toNext: next ? Math.max(0, next.min - renown) : 0,
      isMax: !next
    };
  }

  // ── Persisted state (claims + rank-up detection) ────────────
  // Derived score is never stored; only what we can't recompute: which rank
  // rewards were claimed, and the highest rank we've already celebrated.
  // Lazy-ensured (like ensureBountyState/ensureBuffState) so no monolith edit.
  function ensureState(G) {
    G = G || window.G; if (!G) return null;
    if (!G.renown || typeof G.renown !== 'object') {
      // First init. Set seenRank to the CURRENT rank so existing players aren't
      // spammed with retroactive rank-up popups — but leave `claimed` empty so
      // the rewards they've already earned are waiting to be claimed (a nice
      // "welcome to Renown" hook on launch).
      G.renown = { claimed: [], seenRank: rankIndexFor(effectiveRenown(G)) };
    }
    if (!Array.isArray(G.renown.claimed)) G.renown.claimed = [];
    if (typeof G.renown.seenRank !== 'number') G.renown.seenRank = rankIndexFor(effectiveRenown(G));
    return G.renown;
  }

  function hasReward(rank) {
    return rank && rank.reward && (rank.reward.gold || rank.reward.gems || rank.reward.item);
  }

  // Ranks you've reached, have a reward, and haven't claimed yet.
  function getClaimable(G) {
    G = G || window.G; var s = ensureState(G); if (!s) return [];
    var curIdx = rankIndexFor(effectiveRenown(G));
    var out = [];
    for (var i = 0; i <= curIdx && i < RANKS.length; i++) {
      if (hasReward(RANKS[i]) && s.claimed.indexOf(RANKS[i].id) < 0) out.push(RANKS[i]);
    }
    return out;
  }

  /* ══════════════════════════════════════════════════════════════════════════
     THE RANK CLAIM IS A TWO-PHASE COMMIT, NOT FIRE-AND-FORGET.

     ── WHAT WAS WRONG ────────────────────────────────────────────────────────
     claimRank fired hr_claim_rank with `.catch(noop)`, wrote the gold/gems
     prediction, and then pushed the rank into `G.renown.claimed`
     UNCONDITIONALLY. The server decides on ITS OWN score (hr_renown_of,
     ratcheted into player_state.renown_high) and can answer `not_reached`.
     `G.renown` is RESIDUE — it survives every reload (src/net/client-state.js
     RESIDUE_FIELDS) — so a REFUSED rank was marked claimed FOREVER: never
     offered again, ✓ in the ladder, and the predicted gold reconciled away at
     the next envelope. Silent, permanent loss of a claimable rank. The ladder
     pays 1,603,000 gold + 925 gems in total and up to 1,000,000 + 500 in one
     rank, so this is the highest-value loss the reward program can produce —
     and any client-vs-server score divergence makes it bite HONEST players.

     ── THE HOUSE PATTERN, APPLIED ────────────────────────────────────────────
     Same shape as the modal goal claim (legacy.js claimQuestReward, b461) and
     the cull bounty turn-in (legacy.js completeBounty, R1/R5): under the ARM
     the claim is AWAITED and NOTHING is written until the server says ok — no
     `claimed` mark, no prediction, no save. A refusal leaves the rank exactly
     as claimable as it was and says so in a sentence, never a raw code (b465).
     `already_claimed` is the one refusal that DOES mark it claimed: the server
     once-guard is the memory, and the reward is already banked.

     ── WHY THE BUTTON STAYS ON A REFUSED RANK ────────────────────────────────
     Deliberately NOT the b487 fail-closed-on-knowledge treatment. hr_claim_rank
     advances the server high-water — `renown_high = greatest(renown_high,
     hr_renown_of(...))` — BEFORE it decides, so THE CLICK IS WHAT MOVES THE
     SERVER'S NUMBER, and it succeeds the moment the server's own live score
     reaches the threshold. Hiding the button on a known-short score would
     remove the only thing that advances it: a permanent dead END instead of a
     dead button. So the button stays, and the ladder row explains the shortfall
     in the SERVER's own figures (the `not_reached` envelope carries
     renown_high + min), which is as close to "paint the ladder from the
     server's score" as the client can get without a new projection RPC —
     hr_renown_of is deliberately not client-executable (2026-08-20-renown.sql
     §gate: "a rankable score reachable off the engine path"). See the FOLLOW-UP
     note on serverRenownHigh below.
     ══════════════════════════════════════════════════════════════════════════ */
  var _claimInFlight = Object.create(null);   // rankId → true while a verdict is pending
  var _serverHigh = null;                     // the SERVER's renown high-water, learned from a verdict
  var _serverShort = Object.create(null);     // rankId → {high, min, at} from a `not_reached`
  var SHORT_TTL_MS = 600000;                  // a shortfall note goes stale; never outlive the session

  function say(msg, kind) {
    try { if (typeof window.notify === 'function') window.notify(msg, kind || 'info'); } catch (e) {}
  }
  function repaintBalances() {
    try { if (typeof window.updateTopbar === 'function') window.updateTopbar(); } catch (e) {}
  }
  /* "The cheapest honest refresh there is" (buyTrait's phrase, and the
     bug_reports #46 fix in completeBounty). gold/gems are SERVER_OF_RECORD
     under the arm, so the credit hr_claim_rank just made is INVISIBLE to the
     topbar until an envelope arrives — the player claims 300,000 gold and
     watches the counter not move. One request refreshes the whole envelope. */
  function refreshRecordAfterCredit() {
    try {
      var R = window.HearthriseRecord;
      if (R && typeof R.requestRecord === 'function') {
        var p = R.requestRecord();
        if (p && p.then) p.then(function () { repaintBalances(); }, function () {});
        else repaintBalances();
        return;
      }
    } catch (e) {}
    repaintBalances();
  }
  function mayWrite(field) {
    return !window.clientMayWriteRecordField || window.clientMayWriteRecordField(field);
  }
  /* The DISPLAY half of a claim. Under the arm every branch here is a no-op and
     the server's credit is the only real one; pre-arm (signed-out, suite, the
     client-authoritative switch position) this IS the payout. It runs only
     after a verdict that authorises it — never before one. */
  function grantLocally(G, s, rankId, rw) {
    if (rw.gold && mayWrite('gold')) G.gold = (G.gold || 0) + rw.gold;
    if (rw.gems && mayWrite('gems')) G.gems = (G.gems || 0) + rw.gems;
    /* INVENTORY-FLIP SAFETY (2026-08-22): renown rank rewards CAN carry an item
       (rw.item). No rank in src/data/renown-ranks.js grants one today, so this is
       a dormant slot — but gate it on the inventory record seam like gold/gems so
       that IF an ownable item reward is ever added it cannot be minted client-side
       un-backed and then deleted by the inventory absolute-replace. Before shipping
       any renown ITEM reward, register the lane in item-authority.js
       unbackedOwnableMintLanes() (or server-author the grant). */
    /* The seam predicate is spelled OUT here (not via the mayWrite helper) on
       purpose: the inventory-mint census pins the greppable literal
       `clientMayWriteRecordField('inventory')` at this call site, so an edit
       that drops the gate fails the build by name instead of silently
       re-opening an un-backed ownable mint under the flip. */
    if (rw.item && (!window.clientMayWriteRecordField || window.clientMayWriteRecordField('inventory'))
        && typeof window.addItem === 'function') {
      try { window.addItem(rw.item, rw.itemQty || 1); } catch (e) {}
    }
    markClaimed(s, rankId);
  }
  function markClaimed(s, rankId) {
    if (s.claimed.indexOf(rankId) < 0) s.claimed.push(rankId);
    delete _serverShort[rankId];
    try { if (typeof window.saveLocal === 'function') window.saveLocal(); } catch (e) {}
  }
  /* Every refusal answers in a SENTENCE. An error code is a note to us, not a
     sentence to the player (b465) — and every one of these says the load-bearing
     thing: nothing was lost, the rank is still yours to claim. */
  function refusalMessage(res, rank) {
    var why = (res && res.error) || 'network';
    if (why === 'not_reached') {
      var high = Math.max(0, Math.floor(Number(res && res.renown_high) || 0));
      var min = Math.max(0, Math.floor(Number(res && res.min) || rank.min || 0));
      return 'Not yet — the realm has counted ' + fmt(high) + ' of ' + fmt(min) +
        ' Renown for ' + rank.name + '. Nothing was spent; ' + rank.name +
        ' is still waiting for you and claims itself the moment it catches up.';
    }
    if (why === 'rate_limited') return 'That came through a little fast — try claiming ' + rank.name + ' again in a few seconds.';
    if (why === 'not_signed_in') return 'Claiming needs a connection — ' + rank.name + ' is safe and still waiting.';
    if (why === 'no_character')  return 'Your character is still loading — try claiming ' + rank.name + ' again in a moment.';
    if (why === 'unknown_rank')  return 'This rank cannot be claimed yet — it has been reported. Nothing was lost.';
    if (why === 'rpc_missing')   return 'Claiming is being upgraded — try again in a few minutes. ' + rank.name + ' is safe.';
    return 'Could not reach the realm — ' + rank.name + ' is safe and still claimable. Try again in a moment.';
  }

  /* Grant a rank's reward once.
     @returns Promise<reward|null> — ALWAYS a promise (a claim is a server
     round-trip; a sometimes-sync return would be a trap for the next caller).
     Resolves to the reward when it was granted, null on every refusal. It never
     rejects, and it owns ALL of its own messaging so there is one voice for a
     verdict rather than one per call site. */
  function claimRank(rankId, G) {
    G = G || window.G;
    var s = ensureState(G);
    if (!s) return Promise.resolve(null);
    if (s.claimed.indexOf(rankId) >= 0) return Promise.resolve(null);   // already claimed
    var idx = -1; for (var i = 0; i < RANKS.length; i++) if (RANKS[i].id === rankId) { idx = i; break; }
    if (idx < 0) return Promise.resolve(null);
    if (idx > rankIndexFor(effectiveRenown(G))) return Promise.resolve(null);   // not reached yet
    var rank = RANKS[idx];
    var rw = rank.reward || {};
    /* Peasant has no reward, and the server answers `unknown_rank` for it (its
       catalogue starts at Serf). Consuming a claim slot and toasting "Claimed"
       with nothing in it is noise; refuse it here rather than at the wire. */
    if (!hasReward(rank)) return Promise.resolve(null);

    /* ARMED = at least one reward component whose record the SERVER owns. The
       same test claimQuestReward makes, per component, so a partially-armed
       reward routes through the server rather than half-paying itself. */
    var armed = !!((rw.gold && !mayWrite('gold'))
                || (rw.gems && !mayWrite('gems'))
                || (rw.item && !mayWrite('inventory')));
    var GC = window.HearthriseGoalClaim;
    var canServer = !!(GC && typeof GC.claimRank === 'function'
                       && typeof GC.isSignedIn === 'function' && GC.isSignedIn());

    if (!armed) {
      /* DORMANT (pre-arm / signed-out / the client-authoritative switch
         position). The client owns the balance, so the local grant IS the
         payout and a server verdict cannot take it away. Still fire the intent
         best-effort — the server once-guard is the authority the day this arms. */
      if (canServer) {
        try { var _p = GC.claimRank(rankId); if (_p && _p.catch) _p.catch(function () {}); } catch (e) {}
      }
      grantLocally(G, s, rankId, rw);
      say('Claimed ' + rewardText(rw), 'gold');
      repaintBalances();
      return Promise.resolve(rw);
    }

    if (!canServer) {
      /* The payout is the server's and the server is unreachable. Refusing here
         is the whole point: the old code marked the rank claimed anyway. */
      say(refusalMessage({ error: 'not_signed_in' }, rank), 'kill');
      return Promise.resolve(null);
    }
    /* In-flight latch — a double-click may not double-fire. The server
       once-guard would refuse the second call anyway, but the second toast
       ("already claimed") on a first, successful claim would read as a bug. */
    if (_claimInFlight[rankId]) return Promise.resolve(null);
    _claimInFlight[rankId] = true;

    return Promise.resolve().then(function () { return GC.claimRank(rankId); }).then(function (res) {
      delete _claimInFlight[rankId];
      /* Learn the SERVER's high-water from any verdict that carries one — ok and
         not_reached both do. This is the only renown figure the client can get
         from the server today, and it is the honest one. */
      if (res && typeof res.renown_high === 'number' && isFinite(res.renown_high)) {
        _serverHigh = Math.max(_serverHigh === null ? 0 : _serverHigh, Math.floor(res.renown_high));
      }
      if (res && res.ok) {
        grantLocally(G, s, rankId, rw);        // AFTER the verdict — nothing to revert
        say('Claimed ' + rewardText(rw), 'gold');
        refreshRecordAfterCredit();
        return rw;
      }
      if (res && res.error === 'already_claimed') {
        /* The server once-guard already paid this rank. Marking it claimed is
           the correct memory, and no local credit belongs with it. */
        markClaimed(s, rankId);
        say(rank.name + ' was already claimed — your reward is safe.', 'loot');
        return null;
      }
      /* REFUSED. Nothing is written: no claimed mark, no credit, no save. The
         rank stays exactly as claimable as it was — that is the fix. */
      if (res && res.error === 'not_reached') {
        _serverShort[rankId] = {
          high: Math.max(0, Math.floor(Number(res.renown_high) || 0)),
          min: Math.max(0, Math.floor(Number(res.min) || rank.min || 0)),
          at: Date.now()
        };
      }
      var why = (res && res.error) || 'network';
      if (why !== 'network' && why !== 'not_reached') {
        try { console.warn('[Renown] rank claim refused:', why, rankId); } catch (e) {}
      }
      say(refusalMessage(res, rank), why === 'not_reached' ? 'info' : 'kill');
      return null;
    }).catch(function () {
      delete _claimInFlight[rankId];
      say(refusalMessage({ error: 'network' }, rank), 'kill');
      return null;
    });
  }

  /* The SERVER's renown high-water as last reported by a claim verdict, or null
     if it has never answered. READ-ONLY and advisory — it is NOT used to gate
     the Claim button (see the header: the click is what advances it).

     FOLLOW-UP, filed not hidden: the correct end-state is the ladder painting
     the SERVER's score continuously, the way the quest modal paints
     hr_goal_state. That needs a projection — `renown_high` (and ideally the
     live hr_renown_of read) on the hr_state_of envelope, or a small read-only
     hr_renown_state RPC. hr_renown_of is revoked from `authenticated` on
     purpose, so it is a migration and a security review, and hr_state_of is the
     anchored-programmatic-patch danger zone (the b487 class). Until then this
     cache is what makes a refusal honest instead of mysterious. */
  function serverRenownHigh() { return _serverHigh; }
  /* {high, min} for a rank the server most recently refused as not_reached, or
     null. Expires: a note that outlives the truth is a new lie. */
  function serverShortfall(rankId) {
    var e = _serverShort[rankId];
    if (!e) return null;
    if (Date.now() - e.at > SHORT_TTL_MS) { delete _serverShort[rankId]; return null; }
    return { high: e.high, min: e.min };
  }
  /* Test seam. The in-page suite drives claims against a mocked transport in the
     LIVE page; without this a mocked refusal would leave a stale shortfall note
     on the player's own ladder. */
  function __resetClaimState() {
    _claimInFlight = Object.create(null);
    _serverHigh = null;
    _serverShort = Object.create(null);
  }

  // Aggregate passive perks from every rank reached (perks are passive on-rank,
  // not claim-gated). Game systems query this for bonuses.
  function getPerks(G) {
    G = G || window.G;
    var p = { allXP: 0, offlineHours: 0, bankSlots: 0, marketSlots: 0, dailyTasks: 0, dropRate: 0 };
    if (!G) return p;
    var curIdx = rankIndexFor(effectiveRenown(G));
    for (var i = 0; i <= curIdx && i < RANKS.length; i++) {
      var pk = RANKS[i].perk; if (!pk) continue;
      for (var k in pk) { if (Object.prototype.hasOwnProperty.call(pk, k)) p[k] = (p[k] || 0) + pk[k]; }
    }
    return p;
  }

  // Detect a NEW rank since last celebration. Returns the array of ranks newly
  // reached (usually one), advancing seenRank. UI calls this from a poll.
  function pollRankUp(G) {
    G = G || window.G; var s = ensureState(G); if (!s) return [];
    var curIdx = rankIndexFor(effectiveRenown(G));
    if (curIdx <= s.seenRank) { if (curIdx < s.seenRank) s.seenRank = curIdx; return []; }
    var reached = RANKS.slice(s.seenRank + 1, curIdx + 1);
    s.seenRank = curIdx;
    try { if (typeof window.saveLocal === 'function') window.saveLocal(); } catch (e) {}
    return reached;
  }

  // ── UI ──────────────────────────────────────────────────────
  // Class names deliberately avoid the substrings card/title/name/tile so the
  // legacy always-on `[class*=...]` rules can't hijack them. Token colors +
  // fallbacks → theme-aware (cream on Cozy, dark on Hearthlight).
  function fmt(n) { return (n || 0).toLocaleString(); }

  function ensureStyle() {
    if (document.getElementById('hr-rn-css')) return;
    var s = document.createElement('style');
    s.id = 'hr-rn-css';
    s.textContent = [
      '.hr-rn-scrim{position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,.72);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:18px}',
      '.hr-rn-wrap{background:var(--bg-1,#1a1f2e);border:1px solid var(--line,#b8893e);border-radius:14px;width:100%;max-width:460px;max-height:88vh;overflow:auto;color:var(--ink,#e9e2cf);box-shadow:0 18px 50px -12px rgba(0,0,0,.7);font-family:var(--f-ui,system-ui,sans-serif)}',
      '.hr-rn-top{padding:18px 18px 14px;background:radial-gradient(120% 90% at 50% 0,color-mix(in srgb,var(--gold,#e0a64a) 22%,transparent),transparent);border-bottom:1px solid var(--line-soft,rgba(122,94,58,.2));text-align:center;position:sticky;top:0;backdrop-filter:blur(6px)}',
      '.hr-rn-eyebrow{font-size:calc(14.5px * var(--ui-scale, 1));letter-spacing:.16em;text-transform:uppercase;color:var(--ink-3,#a5896a)}',
      '.hr-rn-cur{font-family:var(--f-display,serif);font-size:calc(27px * var(--ui-scale, 1));font-weight:800;color:var(--gold,#e0a64a);line-height:1.1;margin:3px 0 2px}',
      '.hr-rn-sub{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-2,#cbb890)}',
      '.hr-rn-bar{height:9px;border-radius:99px;background:var(--bg-0,#0f1320);border:1px solid var(--line-soft,rgba(122,94,58,.25));overflow:hidden;margin:12px 0 5px}',
      '.hr-rn-bar>i{display:block;height:100%;background:linear-gradient(90deg,var(--gold-2,#c8862a),var(--gold,#e0a64a))}',
      '.hr-rn-next{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3,#a5896a)}',
      '.hr-rn-list{padding:8px}',
      // b228: the "How renown is earned" block.
      '.hr-rn-today{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--green,#5fbf6a);font-weight:700;margin-top:6px}',
      '.hr-rn-howh{font-family:var(--f-display,serif);font-size:calc(17px * var(--ui-scale, 1));font-weight:800;color:var(--gold,#e0a64a);padding:12px 13px 2px}',
      '.hr-rn-howsub{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3,#a5896a);padding:0 13px 8px;line-height:1.45}',
      '.hr-rn-earn{display:flex;justify-content:space-between;gap:12px;align-items:baseline;padding:5px 13px;font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-2,#cbb890)}',
      '.hr-rn-earn+.hr-rn-earn{border-top:1px solid var(--line-soft,rgba(122,94,58,.16))}',
      '.hr-rn-earn>b{color:var(--ink,#e9e2cf);white-space:nowrap;font-variant-numeric:tabular-nums}',
      '.hr-rn-hownote{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3,#a5896a);padding:10px 13px 14px;line-height:1.45}',
      '.hr-rn-rank{display:flex;gap:11px;align-items:center;padding:10px 11px;border-radius:10px;border:1px solid transparent;margin:3px 0}',
      '.hr-rn-rank.is-cur{background:color-mix(in srgb,var(--gold,#e0a64a) 12%,transparent);border-color:var(--gold,#e0a64a)}',
      '.hr-rn-rank.is-done{opacity:.9}',
      '.hr-rn-rank.is-locked{opacity:.5}',
      '.hr-rn-medal{width:38px;height:38px;flex:0 0 auto;border-radius:50%;display:grid;place-items:center;font-size:calc(19px * var(--ui-scale, 1));font-weight:800;background:radial-gradient(circle at 38% 30%,var(--bg-2,#2c2216),var(--bg-0,#1a130c));border:2px solid var(--line,#cda24a);color:var(--gold,#e0a64a)}',
      '.hr-rn-rank.is-cur .hr-rn-medal{border-color:var(--gold,#e0a64a);box-shadow:0 0 0 3px color-mix(in srgb,var(--gold,#e0a64a) 22%,transparent)}',
      '.hr-rn-info{flex:1;min-width:0}',
      '.hr-rn-nm{font-weight:700;font-size:calc(16px * var(--ui-scale, 1));color:var(--ink,#e9e2cf)}',
      '.hr-rn-unlock{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3,#a5896a);margin-top:1px}',
      '.hr-rn-req{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3,#a5896a);white-space:nowrap}',
      '.hr-rn-claim{border:none;border-radius:8px;padding:7px 12px;font-weight:800;font-size:calc(14.5px * var(--ui-scale, 1));cursor:pointer;background:linear-gradient(180deg,var(--gold,#f0b860),var(--gold-2,#d99c40));color:var(--bg-0,#20160a);white-space:nowrap;flex:0 0 auto}',
      '.hr-rn-claim:active{transform:translateY(1px)}',
      '.hr-rn-done{font-size:calc(17px * var(--ui-scale, 1));color:var(--green,#5fbf6a);flex:0 0 auto}',
      '.hr-rn-x{position:absolute;top:12px;right:14px;background:var(--bg-0,#0f1320);border:1px solid var(--line-soft,rgba(122,94,58,.25));color:var(--ink-2,#cbb890);width:30px;height:30px;border-radius:8px;cursor:pointer;font-size:calc(16px * var(--ui-scale, 1));line-height:1}',
      // rank-up celebration
      '.hr-rn-cele{background:var(--bg-1,#1a1f2e);border:2px solid var(--gold,#e0a64a);border-radius:16px;max-width:400px;width:100%;padding:26px 22px;text-align:center;color:var(--ink,#e9e2cf);box-shadow:0 0 60px -10px color-mix(in srgb,var(--gold,#e0a64a) 55%,transparent);animation:hr-rn-pop .35s cubic-bezier(.2,1.3,.5,1)}',
      '@keyframes hr-rn-pop{from{transform:scale(.8);opacity:0}to{transform:scale(1);opacity:1}}',
      '.hr-rn-cele .big{font-family:var(--f-display,serif);font-size:calc(31px * var(--ui-scale, 1));font-weight:800;color:var(--gold,#e0a64a);margin:6px 0}'
    ].join('');
    document.head.appendChild(s);
  }

  /* ── "How renown is earned" (Tyler, 2026-08-09: *"we need to explain how to
     gain renown, because I don't even know"*) ──────────────────────────────
     The ladder screen showed twelve thresholds and never once said what makes
     the number go up. This reads the LIVE `W` table — the same object
     computeRenown() scores against — so the explanation is generated from the
     scoring rather than written beside it, and it cannot go stale when the
     weights are next tuned.

     Small weights are inverted into whole things ("20 monsters slain: 1")
     because "0.05" is a number, not an explanation. */
  function weightPhrase(w) {
    if (w >= 1) return (Math.round(w * 10) / 10) + '';
    var n = Math.round(1 / w);
    return '1 per ' + n;
  }
  function earnRows() {
    var order = ['totalLevel', 'combatLevel', 'questDone', 'skill99', 'bossKill',
                 'collection', 'streakBest', 'bountyDone', 'kill', 'goldLog'];
    var out = [];
    for (var i = 0; i < order.length; i++) {
      var k = order[i];
      if (!(k in W) || !W[k]) continue;
      out.push('<div class="hr-rn-earn"><span>' + (W_LABEL[k] || k) + '</span>' +
               '<b>' + weightPhrase(W[k]) + '</b></div>');
    }
    return out.join('');
  }
  /* +N renown earned today, or null when it cannot be answered honestly.
     Reads profile-launchpad's midnight snapshot — one clock for every daily
     number in the game. No snapshot, no line. */
  function todayGain(G) {
    G = G || window.G; if (!G) return null;
    try {
      if (window.HearthriseLaunchpad && typeof window.HearthriseLaunchpad.ensureDailySnapshot === 'function') {
        window.HearthriseLaunchpad.ensureDailySnapshot();
      }
    } catch (e) {}
    var snap = G.daily && G.daily.snapshot;
    if (!snap || typeof snap.renown !== 'number' || !isFinite(snap.renown)) return null;
    return Math.max(0, effectiveRenown(G) - snap.renown);
  }

  /* b465 — THE RENOWN LADDER IS THE META-SPINE; IT MUST READ LIKE PROSE.
     This produced "🪙 250" — a pictogram standing in for the word "gold" — and,
     on the item arm, the RAW ITEM ID ("🎁 1× dawn_sword"). The item arm has no
     live data behind it today (RENOWN_RANK_REWARDS is gold/gems only), which is
     exactly why it had to be fixed now: the first rank that adds an item would
     have shipped a database key onto the Rise-to-the-Throne screen. Names come
     from ITEMS, so a rename follows for free; an unknown id degrades to a
     titleised form, never to the key. Currencies are WORDS — this string is read
     in a toast, a button label and a screen reader. */
  function rewardItemName(id) {
    var it = window.ITEMS && window.ITEMS[id];
    if (it && (it.n || it.name)) return it.n || it.name;
    return String(id || '').split(/[_\-:]/).filter(Boolean)
      .map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
  }
  function rewardText(rw) {
    if (!rw) return '';
    var parts = [];
    if (rw.gold) parts.push(_rnGly('gold',13,'--gold-2') + ' ' + fmt(rw.gold));
    if (rw.gems) parts.push(_rnGly('gems',13,'--gem') + ' ' + fmt(rw.gems));
    if (rw.item) parts.push(_rnGly('uiGift',13,'--gold-2') + ' ' + (rw.itemQty || 1) + '× ' + rewardItemName(rw.item));
    return parts.join('  ');
  }

  function closeModal() { var m = document.getElementById('hr-rn-modal'); if (m) m.remove(); }

  function openLadder() {
    closeModal();               // idempotent — never stack two ladders
    ensureStyle();
    var G = window.G;
    var st = getState(G);
    var s = ensureState(G);
    var curIdx = st.rankIndex;
    var claimableIds = getClaimable(G).map(function (r) { return r.id; });

    var rows = RANKS.map(function (rank, i) {
      var reached = i <= curIdx;
      var cls = 'hr-rn-rank' + (i === curIdx ? ' is-cur' : reached ? ' is-done' : ' is-locked');
      /* ★ and ✓ are typographic MARKS and stay; the 🔒 was the only pictograph
         in the ladder, and the game already has one padlock. */
      var medal = reached ? (i === curIdx ? '★' : '✓') : _rnGly('uiLock', 13);
      var right;
      if (claimableIds.indexOf(rank.id) >= 0) {
        right = '<button class="hr-rn-claim" data-claim="' + rank.id + '">Claim</button>';
      } else if (reached && hasReward(rank)) {
        right = '<span class="hr-rn-done">✓</span>';
      } else {
        right = '<span class="hr-rn-req">' + fmt(rank.min) + '</span>';
      }
      /* The SERVER's own figures for a rank IT most recently refused. The client
         ladder is scored from client-authored residue and the server scores it
         itself, so the two can legitimately disagree; when they do, the player
         is owed the reason in numbers rather than a button that "did nothing".
         Only rendered on a rank the server has actually spoken about. */
      var short = serverShortfall(rank.id);
      var shortLine = short
        ? '<div class="hr-rn-unlock">The realm has counted ' + fmt(short.high) + ' of ' +
            fmt(short.min) + ' — this unlocks itself as it catches up.</div>'
        : '';
      return '<div class="' + cls + '">' +
        '<div class="hr-rn-medal">' + medal + '</div>' +
        '<div class="hr-rn-info"><div class="hr-rn-nm">' + rank.name + '</div>' +
        '<div class="hr-rn-unlock">' + rank.unlock + (hasReward(rank) ? '  ·  ' + rewardText(rank.reward) : '') + '</div>' +
        shortLine + '</div>' +
        right + '</div>';
    }).join('');

    var nextLine = st.isMax
      ? 'You have reached the summit — ' + st.rank.name
      : fmt(st.toNext) + ' Renown to <b>' + st.next.name + '</b>';

    var gain = todayGain(G);
    var todayLine = (gain === null) ? '' :
      '<div class="hr-rn-today">+' + fmt(gain) + ' Renown today</div>';

    var scrim = document.createElement('div');
    scrim.className = 'hr-rn-scrim';
    scrim.id = 'hr-rn-modal';
    scrim.innerHTML =
      '<div class="hr-rn-wrap">' +
        '<button class="hr-rn-x" data-close="1">✕</button>' +
        '<div class="hr-rn-top">' +
          '<div class="hr-rn-eyebrow">Rise to the Throne · Renown</div>' +
          '<div class="hr-rn-cur">' + st.rank.name + '</div>' +
          '<div class="hr-rn-sub">' + fmt(st.renown) + ' Renown</div>' +
          '<div class="hr-rn-bar"><i style="width:' + Math.round(st.progress * 100) + '%"></i></div>' +
          '<div class="hr-rn-next">' + nextLine + '</div>' +
          todayLine +
        '</div>' +
        '<div class="hr-rn-list">' + rows + '</div>' +
        '<div class="hr-rn-howh">How renown is earned</div>' +
        '<div class="hr-rn-howsub">Renown is your whole account, added up. ' +
          'Nothing is spent and nothing is lost — every rank you reach is yours ' +
          'for good, so the number below only ever goes up.</div>' +
        earnRows() +
        '<div class="hr-rn-hownote">Early on, levels are most of your renown. ' +
          'Later they slow down while quests, bosses, your Collection Log and ' +
          'your login streak keep adding — so the climb shifts from <i>how much ' +
          'you played</i> to <i>what you have done</i>.</div>' +
      '</div>';
    scrim.addEventListener('click', function (e) {
      if (e.target === scrim || e.target.getAttribute('data-close')) { closeModal(); return; }
      var id = e.target.getAttribute('data-claim');
      if (id) {
        /* claimRank owns the toast and the balance repaint for EVERY outcome; a
           call site that only reacted to success is how the refusal used to be
           silent. Re-render on any verdict (✓ on success, the shortfall line on
           a refusal) — but only if the ladder is still on screen, so a verdict
           arriving after the player closed it never re-opens a modal at them. */
        claimRank(id, window.G).then(function () {
          if (document.getElementById('hr-rn-modal')) openLadder();
        });
      }
    });
    document.body.appendChild(scrim);
  }

  function celebrate(rank) {
    ensureStyle();
    var claimable = hasReward(rank);
    var scrim = document.createElement('div');
    scrim.className = 'hr-rn-scrim';
    scrim.id = 'hr-rn-cele';
    scrim.innerHTML =
      '<div class="hr-rn-cele">' +
        '<div class="hr-rn-eyebrow">Rank up</div>' +
        // b225: the meta-spine's highest-ceremony surface was a party-popper
        // emoji (Final Directive violation). A gilt laurel crest, drawn.
        '<svg viewBox="0 0 64 48" style="width:56px;height:42px;margin:2px auto 4px;display:block" aria-hidden="true">' +
          '<path d="M14 40 Q6 30 10 16 Q12 26 18 32 Q13 22 16 10 Q19 22 24 28 Q21 18 26 8 Q28 20 30 26" fill="none" stroke="var(--gold,#e8c476)" stroke-width="2.2" stroke-linecap="round"/>' +
          '<path d="M50 40 Q58 30 54 16 Q52 26 46 32 Q51 22 48 10 Q45 22 40 28 Q43 18 38 8 Q36 20 34 26" fill="none" stroke="var(--gold,#e8c476)" stroke-width="2.2" stroke-linecap="round"/>' +
          '<circle cx="32" cy="34" r="5.5" fill="none" stroke="var(--gold,#e8c476)" stroke-width="2"/>' +
          '<circle cx="32" cy="34" r="1.8" fill="var(--gold,#e8c476)"/>' +
        '</svg>' +
        '<div class="big">' + rank.name + '</div>' +
        '<div class="hr-rn-sub" style="margin-bottom:4px">You are now <b>' + rank.title + '</b></div>' +
        '<div class="hr-rn-unlock" style="font-size:calc(14.5px * var(--ui-scale, 1));margin-bottom:16px">' + rank.unlock + '</div>' +
        (claimable
          ? '<button class="hr-rn-claim" data-cele-claim="' + rank.id + '" style="padding:10px 20px;font-size:calc(16px * var(--ui-scale, 1))">Claim ' + rewardText(rank.reward) + '</button>'
          : '<button class="hr-rn-claim" data-cele-close="1" style="padding:10px 20px;font-size:calc(16px * var(--ui-scale, 1))">Onward →</button>') +
      '</div>';
    scrim.addEventListener('click', function (e) {
      var id = e.target.getAttribute('data-cele-claim');
      /* The celebration closes on the click either way — the rank-up moment is
         over. If the server refuses, claimRank's own message says the rank is
         still waiting, and it IS: it stays claimable in the ladder. */
      if (id) claimRank(id, window.G);
      if (id || e.target.getAttribute('data-cele-close') || e.target === scrim) scrim.remove();
    });
    document.body.appendChild(scrim);
  }

  // Poll for rank-ups (mirrors the achievements poll). Slow — Renown moves
  // gradually — but catches a rank-up within a few seconds of earning it.
  // Don't stack the rank-up celebration onto other popups (login gauntlet:
  // beta / welcome-back / daily / FTUE / collection). pollRankUp only advances
  // when it fires, so deferring just waits for the screen to clear.
  function anotherModalUp() {
    return !!document.querySelector(
      '.ftue-root,#hr-welcome-modal,.wbv-overlay,.beta-overlay,[class*="welcome-overlay"],.hr-dl-scrim,.hr-cl-scrim,.acq-overlay,.ach-overlay'
    );
  }
  function tick() {
    if (!window.G) return;
    if (document.getElementById('hr-rn-cele') || document.getElementById('hr-rn-modal')) return; // ours already open
    if (anotherModalUp()) return;                       // wait for the screen to clear
    try {
      var reached = pollRankUp(window.G);
      // Celebrate one at a time; if multiple, queue by re-checking next tick.
      if (reached && reached.length) celebrate(reached[0]);
    } catch (e) { /* never break the loop */ }
  }

  window.HearthriseRenown = {
    RANKS: RANKS,
    WEIGHTS: W,
    WEIGHT_LABELS: W_LABEL,
    /* b228: exposed so the suite can assert the explainer prints the live
       weights rather than a hand-written copy of them. */
    earnRows: earnRows,
    todayGain: todayGain,
    compute: computeRenown,
    /* b226: the ratcheted score every rank decision is made against. */
    effective: effectiveRenown,
    getState: getState,
    rankIndexFor: rankIndexFor,
    ensureState: ensureState,
    getClaimable: getClaimable,
    /* ⚠ RETURNS A PROMISE<reward|null> since the two-phase fix — a claim is a
       server round-trip. It resolves to null on every refusal AND on every
       already-handled no-op, and it never rejects. It also owns its own toast. */
    claimRank: claimRank,
    serverRenownHigh: serverRenownHigh,
    serverShortfall: serverShortfall,
    __resetClaimState: __resetClaimState,
    getPerks: getPerks,
    pollRankUp: pollRankUp,
    openLadder: openLadder,
    celebrate: celebrate
  };

  // Seed state + start the rank-up watcher once G exists.
  function boot() {
    if (!window.G) { setTimeout(boot, 400); return; }
    ensureState(window.G);
    setInterval(tick, 4000);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  console.log('[renown] ladder ready (' + RANKS.length + ' ranks)');
})();
