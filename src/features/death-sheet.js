// ============================================================
// src/features/death-sheet.js — THE DEATH MOMENT (b373, Designer ruling)
//
// ── THE PROBLEM THIS CLOSES ──────────────────────────────────────────
// Measured on the b372 fresh-character FTUE run (LIVE-AUDIT-2026-08-17,
// "FTUE run 2"): a brand-new player died to the FIRST slime at 3m30s with
// EIGHT raw shrimp uneaten. What the game told them was one line at the
// bottom of a scrolling combat log — "You died! Respawning…" — followed by
// a silent dump back to the War Table and an activity strip reading
// "Idle — pick an activity". The auditor's words: "A real new player
// re-fights and dies again, learning nothing. This is the single biggest
// FTUE gap in the run."
//
// Three separate failures were stacked in that moment:
//   1. NO STATEMENT. The most dramatic event in the game was the quietest
//      thing on screen. The player does not know what killed them, whether
//      they lost anything, or what they should have done.
//   2. NO TEACHING. The player was carrying the exact answer (food) and the
//      game never said the word "Eat". The tour mentions it once, three
//      screens and three minutes earlier.
//   3. NO NEXT STEP. Death STOPS the run, so the game is now idle and the
//      player must choose something — and it dumped them on a screen with
//      no indication that a choice was owed.
//
// ── THE DESIGN RULE ──────────────────────────────────────────────────
// A death is not a punishment screen. It is a RECEIPT plus a DOOR.
//
//   RECEIPT — what killed you, how far you got, and (the reassuring half a
//             new player cannot know) that you lost nothing you were
//             carrying. Hearthrise has no item or gold loss on death; the
//             cost of dying is that the run STOPPED. Say both out loud.
//   ONE TIP — exactly one, chosen from what the player was actually
//             holding when they fell. A generic "try harder" teaches
//             nothing; "you were carrying 8 Raw Shrimp and never ate one"
//             teaches the whole healing system in a sentence.
//   A DOOR  — Fight again / War table. The run is over either way, so the
//             sheet is not an interruption: it IS the next step the player
//             now owes the game.
//
// WHY EVERY LIVE DEATH, NOT JUST THE FIRST N. A LIVE death means the player
// was watching, and it always ends with the game idle — so a sheet costs a
// player who already knows the rules exactly one click that they were going
// to spend anyway (choosing what to do next), and it costs a player who does
// NOT know the rules nothing at all. An AWAY death is different: nobody was
// watching, and it already has a surface — the welcome-back receipt
// (legacy.js maybeShowWelcome, "You died to X — nothing was earned after").
// This sheet never opens for one. See show().
//
// ── STRUCTURE ────────────────────────────────────────────────────────
// `describeDeath()` is PURE and is the whole design. It takes a plain
// description of the moment and returns the model the sheet renders — title,
// rows, one tip, and the actions. Everything player-visible is decided there,
// so the copy and the tip-selection rule are unit-testable without a DOM,
// and the renderer below has no opinions of its own.
//
// Tokens only — no hardcoded colours (CLAUDE.md hard rule). Glyphs, never
// emoji (Final Directive).
// ============================================================
(function () {
  'use strict';

  var STYLE_ID = 'hr-death-style';
  var ROOT_ID = 'hr-death-scrim';

  // ════════════════════════════════════════════════════════════
  // 1 · THE MODEL — pure, DOM-free, the whole ruling
  // ════════════════════════════════════════════════════════════

  /* The four states a dead player can have been in, and the one sentence each
     of them earns. Ordered by how much the player stands to learn.

       food-unused   held healing food, never ate any of it. THE new-player
                     case, and the one the audit caught. Names the item, the
                     button, and the automation.
       auto-eat-idle Auto-Eat is SWITCHED ON but had no provision to eat. The
                     system is working; the bag was empty.

       no-food       carried nothing healing at all. The gap is upstream — go
                     cook or buy some.
       outmatched    ate everything and still lost. Nothing about healing left
                     to teach; the answer is gear, levels or a softer target.

     ⚠ b497 — `autoEatOwned` STOPPED BEING A PROXY FOR "AUTO-EAT IS ACTIVE",
     and the branch rule had to move with it. The designer ruling grants
     Auto-Eat I to every character at creation
     (supabase/migrations/2026-09-04-auto-eat-at-creation.sql), so OWNERSHIP is
     now universal — while the switch `maybeAutoEat` actually reads
     (`G.autoActions.eat.enabled`) is a SEPARATE fact that ownership says
     nothing about.

     ✗ RETRACTED (2026-08-30): this passage used to continue "…still starts
       OFF", and that is FALSE. `DEFAULTS.eat.enabled` is false, but
       `ensureShape()` in src/features/auto-actions.js flips it to true whenever
       `G.foodSlot` is set, and the fresh-`G` literal carries
       `foodSlot:'cooked_shrimp'` (b495). A FRESH CHARACTER IS `owned + ON`.
       The code below was always right — it reads
       `HearthriseAuto.getEat().enabled` — only this comment lied, and it is
       quoted rather than deleted because two reviews were misled by the same
       claim elsewhere.

     The split is still exactly as necessary, just for the opposite population:
     a player who has TURNED IT OFF (or cleared their food slot) would be told
     "Auto-Eat is watching your health" when nothing is — precisely the class of
     lie the F7/b432 audit built this sheet to remove.
     So the ACTIVE branch keys on `autoEatOn` (the switch) and the OFFER copy
     keys on `autoEatOwned` (the entitlement). Two facts, two fields.

     `tip` is copy. `tipKey` is the STATED branch, so the suite asserts the
     rule rather than a sentence somebody may reword. */
  var TIPS = {
    /* rev. 2. The only tip on this sheet whose subject is the LADDER: it names
       the switch, the cost the player is already paying for it being off, and
       where to throw it. `enableAutoEat` gives it the one-tap button. */
    'auto-eat-off-repeat': function () {
      return 'Auto-Eat is switched off, so you are fighting to the floor every time and '
           + 'paying for it in recovery. Switch it on here and your provisions keep the run going instead.';
    },
    'food-unused': function (d) {
      /* "8 x Raw Shrimp", never "8 Raw Shrimps". Item names in ITEMS are
         already singular nouns of every shape ("Raw Shrimp", "Bread", "Trout"),
         and there is no pluralisation rule that survives all of them — the
         first draft of this line shipped "8 Raw Shrimps" straight into the
         browser check. The quantity marker sidesteps the problem entirely and
         matches how every other quantity in the game is written. */
      var carried = d.foodQty + ' x ' + d.foodName;
      /* b432 (new-player audit) — NAME THE PRICE.
         The old line sent a player who had just died on their first slime to
         "the Bounty Shop", where Auto-Eat sits behind 100 Marks and a tier-1
         cull contract pays 5–6 for 80–120 kills. Following the game's own
         advice therefore led to a padlock roughly eighteen contracts away,
         with nothing on the sheet or the shop row saying so — a recommendation
         that reads as "do this now" and behaves as "do this next week" is a
         dead end, not a tip. Stating the number converts it into a goal the
         player can decide about, and it keeps the honest ordering: the thing
         they can do THIS fight comes first.
         The cost is READ from the shop table (window.TRAITS via readMoment),
         never authored here — a second copy of "100" would be a number that
         can drift silently away from the thing it describes. When it is
         unavailable the sentence simply does not claim one. */
      var cost = Number(d.autoEatCost) > 0 ? d.autoEatCost : 0;
      var later = cost
        ? ' Longer term, Bounty Board contracts pay Marks — ' + cost +
          ' of them unlock Auto-Eat in the Bounty Shop, and then you never think about it again.'
        : ' Longer term, Auto-Eat in the Bounty Shop does it for you.';
      /* b497 — THREE ENDINGS, because there are now three states and the old
         two-way split told one of them something false.
           owned + ON   Auto-Eat is running and still did not save this fight,
                        so "switch it on" would be wrong. The honest fact is the
                        THRESHOLD: tier I fires below a quarter health and this
                        foe crossed that gap in one blow. Names the paid upgrade
                        that actually answers it, which is the sink the ruling
                        deliberately kept.
           owned + off  The new default. Says they ALREADY HAVE IT — a player
                        who was never told cannot act on it — and where the
                        switch is.
           not owned    The pre-ruling path, unchanged and still literally true
                        for any character without the trait (the Bounty Shop
                        still sells it at this price). Kept rather than deleted
                        so a grant that has not reached this device does not
                        leave the sheet with nothing to say. */
      /* ⚠ 2026-08-31 (Designer ruling 2b, condition 3). The owned+off line is
         the one the ruling names: *"for a player who owns a tier and has it
         switched off it must say 'Auto-Eat is switched off' with a one-tap
         re-enable, not quote a Store price."* The price half was ALREADY right
         — b497 built this branch precisely so an owner is never sold to, and
         the suite pins it. What was missing is the TAP: the sheet named a
         switch three screens away and made them go and find it, at the one
         moment they have proof they need it. `enableAutoEat` below is the
         button; the sentence still names Settings, because the button settles
         this fight and the words are how they find it for the next one.

         "including while you are away" is not decoration any more: with the
         ON/OFF sync ARMED, off reaches the server and really does mean the
         night too. Three surfaces — this sheet, the settings hint, the return
         receipt — now make one promise. */
      var closer = d.autoEatOwned
        ? (d.autoEatOn
          ? ' Auto-Eat is on, but it only fires below a quarter health and ' + d.monsterName +
            ' closed that gap in one blow — eat sooner, or raise the trigger point with Auto-Eat II.'
          : ' You already have Auto-Eat — it is switched off, not missing. Turn it back on here,' +
            ' or in Settings → Gameplay, and it feeds you below a quarter health, including while' +
            ' you are away.')
        : later;
      return 'You were carrying ' + carried + ' and never ate ' +
        (d.foodQty === 1 ? 'it' : 'one') + '. Press Eat beside your champion during a fight.' +
        closer;
    },
    'auto-eat-idle': function () {
      return 'Auto-Eat is watching your health, but your bag had no provisions left to eat. ' +
        'Cook or buy food at the Local Shop before the next fight and it will do the rest.';
    },
    'no-food': function () {
      /* b526 — THE SECOND HALF OF THE SENTENCE IS NOW TRUE. "Cook something"
         was the only advice this tip could honestly give while the knockout
         refused every payable kind: a player told to cook, who could not fish
         and could not buy, was told to do nothing. The Supplies counter sells
         Cooked Shrimp, shopping is never gated by recovery, and the button
         below goes straight there. */
      return 'You went in with no provisions. Cook something at the fire, or buy a few Cooked ' +
        'Shrimp at the Local Shop — even a Shrimp buys you another few swings — and press Eat ' +
        'when your health runs low.';
    },
    outmatched: function (d) {
      return 'You ate everything you had and still fell. ' + d.monsterName +
        ' out-damages you: train Defence, upgrade your armour, or take a softer target first.';
    }
  };

  /**
   * PURE. The whole death moment as data.
   *
   * @param {object} d
   *   monsterName    {string}  what killed you ('' when unknown)
   *   killsThisFoe   {number}  kills landed in the run that just ended
   *   foodQty        {number}  healing provisions still in the bag
   *   foodName       {string}  the provision's display name
   *   ateThisFight   {number}  provisions consumed during the run
   *   autoEatOwned   {boolean} is the Auto-Eat trait held (granted at creation
   *                            since b497, or bought in the Bounty Shop)
   *   autoEatOn      {boolean} is the live-combat switch actually ON — the gate
   *                            maybeAutoEat() reads. NOT the same question.
   *   maxHp          {number}  respawn health (see RESPAWN below)
   *   streakBroken   {boolean} did the death reset a bounty streak
   *   deaths         {number}  lifetime deaths, AFTER this one
   *   recoveringUntilMs {number} First-Night Idle Rescue: the ABSOLUTE server
   *                            instant this character gets back up, 0 when they
   *                            already are. NEVER a countdown the client owns —
   *                            it is `player_state.recovering_until`, and the
   *                            client only subtracts it from the clock to draw.
   *   nowMs          {number}  the instant to measure that against
   *   hadFood        {boolean|undefined} did the bag hold anything auto-eatable.
   *                            `undefined` = not stated, so claim nothing.
   *   deathsToday    {number}  rev. 2: `n` in the ladder — falls TODAY including
   *                            this one. 1 is the free fall. SERVER-COUNTED
   *                            (player_progress stat:deaths under today's UTC
   *                            period key); the client only renders it.
   *   recoveryMs     {number}  what THIS fall cost. 0 on the day's first.
   *   nextRecoveryMs {number}  what the NEXT fall today would cost. Read off
   *                            the same table the server stamps from, so the
   *                            warning cannot promise a rung nobody charges.
   *   resumeHp       {number}  the health the character stood back up on — 40%
   *                            of max since rev. 2, NOT a full heal.
   *   retreat        {boolean} rev. 3: did THIS fall end the run (the Retreat).
   *                            STATED by the engine, never derived here.
   *   retreatFoodless {boolean|undefined} which rung fired — the empty-bag one
   *                            or the any-hero one. Decides which sentence and
   *                            which tail the player reads.
   *   retreatFalls   {number}  how many consecutive falls the engine charged,
   *                            i.e. the rung, written into the lead as a word.
   *   missingHp      {number}  maxHp - hp, the price of `Rest at the Hearth`.
   * @returns {{title,lead,rows:Array,tipKey:string,tip:string,actions:Array,
   *            recoverMsLeft:number}}
   */
  /* "1:47". The countdown's only formatter — local and tiny on purpose: the
     death sheet is the one surface that renders a sub-minute span to the second
     and borrowing a span formatter that rounds to minutes would print "2m" for
     the whole two minutes and then jump to nothing. */
  function mmss(ms) {
    var t = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
    var m = Math.floor(t / 60);
    var sec = t % 60;
    return m + ':' + (sec < 10 ? '0' : '') + sec;
  }

  /* "2m" / "64m". The LADDER's formatter, which is a different question from
     the countdown's: a rung is always a whole number of minutes and writing it
     as "2:00" invites a player to read a clock that is not running yet. */
  function fmtDur(ms) {
    var m = Math.max(0, Math.round((Number(ms) || 0) / 60000));
    return m + 'm';
  }

  /* ══ THE RECOVERY SENTENCE — ONE AUTHOR, TWO SURFACES ═══════════════════
     (Designer ruling, 2026-09-07.) The retreat death sheet and the durable
     away card both have to tell the player the same thing — how long the
     recovery clock still has to run — and the ruling asks for them in the
     SAME words: "both surfaces print the identical 'Still recovering — Nm to
     go.'"

     SO IT IS WRITTEN ONCE, HERE, AND EXPORTED. src/features/home-dashboard.js
     reads `HearthriseDeathSheet.stillRecovering` for the away card's clock
     note; nothing composes that sentence a second time. The cautionary
     precedent is in that very file: the SUPPLIES sentence exists three times
     (the away card, legacy.js's welcome modal, accrue.js's receipt clause) and
     the three have already drifted in punctuation.

     WHY THIS MODULE OWNS IT rather than home-dashboard, which had it first:
     index.html loads death-sheet.js (line ~1064) BEFORE home-dashboard.js
     (~1120), so the dependency runs with the load order rather than against it,
     and `describeDeath` stays PURE — it composes the sentence from a local
     function instead of reaching for a global, which is the property that lets
     the whole model be unit-tested with no DOM and no window.G.

     `recoverySpan` IS the away card's `fmtSince` semantics, restated here as
     the single implementation: SECONDS below a minute ("47s" — the case a
     minutes-only formatter renders as "0m"), whole minutes below an hour
     ("41m"), and hours FLOORED past that, dropping a remainder under five
     minutes so the line can never claim a minute it did not pay. */
  function recoverySpan(ms) {
    var n = Math.max(0, Number(ms) || 0);
    if (n < 60000) return Math.max(1, Math.round(n / 1000)) + 's';
    var mins = Math.floor(n / 60000);
    if (mins < 60) return mins + 'm';
    var h = Math.floor(mins / 60), m = mins % 60;
    return m >= 5 ? (h + 'h ' + m + 'm') : (h + 'h');
  }
  function stillRecovering(ms) {
    return 'Still recovering — ' + recoverySpan(ms) + ' to go.';
  }

  /* "3" -> "three". The retreat lead names its own rung in words, and the rung
     is DATA (`RETREAT_FOODLESS_FALLS` / `RETREAT_ANY_FALLS` in src/core/away.js,
     carried here as `retreatFalls` off the engine's own death info) — so the
     word is looked up from the number the engine actually charged rather than
     typed into the sentence. A designer moving the table to 4 gets "Four falls
     in a row"; a number this table does not know falls back to the digit, which
     is plain rather than wrong.
     ⚠ home-dashboard.js has the same table for the AWAY card's sentence. Two
       copies of a twelve-word lookup is not the drift hazard a duplicated
       SENTENCE is — and the sentences themselves are single-authored, which is
       the property that actually matters. */
  var NUM_WORD = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
    'eight', 'nine', 'ten', 'eleven', 'twelve'];
  function numWord(n) {
    var i = Math.max(0, Math.floor(Number(n) || 0));
    return NUM_WORD[i] || String(i);
  }
  function cap(w) { return String(w).charAt(0).toUpperCase() + String(w).slice(1); }

  /* ══ THE RETREAT LEAD (Designer ruling, 2026-09-07) — VERBATIM ═══════════
     Three parts, in this order, and the ruling gives each of them by name:

       THE CAUSE   which rung fired, and what it means. Two sentences because
                   the two rungs answer two different questions — "you own the
                   fix, bring provisions" vs "this target is wrong for you" —
                   and one sentence could only ever say one of them.
       THE CLOCK   `Still recovering — 41m to go.` (the SHARED sentence above,
                   so this and the away card cannot word it differently)
                   followed by the half a player cannot infer: the clock runs
                   down on its own, and the fight does NOT restart itself.
                   That pair is the whole reason this lead replaced rev. 3's:
                   a retreat leaves a live recovery clock AND an idled pointer,
                   and a player told only about the clock reasonably expects the
                   run to pick up when it expires. It does not.
       THE TAIL    the one thing to do differently, chosen by the rung.

     ⚠ READ FROM `recovering_until`, NEVER FROM AN "ms to resume". `msLeft` is
       the SERVER's absolute instant minus the clock (see `recoverLeft` in
       describeDeath) — the same number the away card subtracts. An engine-side
       "how long this fall was charged" would be a different question with a
       nearly identical answer, which is the worst kind of wrong number.
     ⚠ THE CLOCK SENTENCE IS OMITTED, NOT ZEROED, once the line has passed.
       "Still recovering — 0s to go" is a sentence about a state the player is
       no longer in. */
  function retreatLead(o) {
    o = o || {};
    var falls = numWord(o.falls);
    var lead = o.foodless
      ? cap(falls) + ' falls in a row on an empty bag — you retreated to camp rather than '
        + 'keep going down.'
      : cap(falls) + ' falls in a row — you retreated to camp. That fight is out of your '
        + 'league for now.';
    var msLeft = Math.max(0, Number(o.msLeft) || 0);
    var clock = msLeft > 0
      ? (' ' + stillRecovering(msLeft) + ' The clock runs down on its own; the fight does not '
         + 'restart itself.')
      : '';
    var tail = o.foodless
      ? ' Bring food, then pick the fight back up.'
      : ' Pick a softer target when you are back up.';
    return lead + clock + tail;
  }

  /* ══ WHAT THE 1 Hz TICK WRITES INTO THE LEAD ════════════════════════════
     A pure function of the model and the milliseconds still on the server's
     clock. EXTRACTED BECAUSE OF THE DEFECT IT CLOSES, which is worth stating
     plainly: rev. 3 stated `retreat` on the model with a comment saying it was
     there so "the renderer's countdown must not rewrite a retreat's lead into
     'Back on your feet in 3:47'" — and NOTHING READ IT. The branch was three
     inline lines inside a `setInterval`, i.e. code no test can reach without a
     real clock and a real DOM, so the flag sat unread for a whole build and the
     ruled lead was replaced by the wrong promise one second after the sheet
     opened. A named function is a function the suite can ask.

     A RETREAT COUNTS DOWN IN ITS OWN WORDS. Its recovery clock is REAL — the
     retreating fall charged its rung and hr_rest is still the cure — so there
     IS something true to redraw. What must never be redrawn is "Back on your
     feet in 3:47", because the fight the player would be back on their feet FOR
     has been ended: the settle idles the pointer. Rebuilt through the SAME
     `retreatLead` `describeDeath` used, so the sheet cannot grow a second voice
     one second after opening, and the clock clause drops itself when the line
     passes. */
  function leadTick(model, msLeft) {
    var left = Math.max(0, Number(msLeft) || 0);
    if (model && model.retreat) {
      return retreatLead({ foodless: model.retreatFoodless, falls: model.retreatFalls,
        msLeft: left });
    }
    return left > 0 ? ('Back on your feet in ' + mmss(left) + '.') : 'You are back on your feet.';
  }

  function describeDeath(d) {
    d = d || {};
    var monsterName = String(d.monsterName || '').trim();
    var foodQty = Math.max(0, Number(d.foodQty) || 0);
    var foodName = String(d.foodName || 'provision');
    var ate = Math.max(0, Number(d.ateThisFight) || 0);
    var kills = Math.max(0, Number(d.killsThisFoe) || 0);
    var maxHp = Math.max(1, Number(d.maxHp) || 1);
    var deaths = Math.max(1, Number(d.deaths) || 1);
    /* THE LADDER, AS THE SERVER COUNTED IT (rev. 2). `n` is falls TODAY
       including this one; 1 is the day's free fall. Defaults are the
       UNDER-claiming ones — an older server that states nothing produces a
       sheet that promises no penalty rather than inventing one. */
    var nToday = Math.max(1, Number(d.deathsToday) || 1);
    var recoveryMs = Math.max(0, Number(d.recoveryMs) || 0);
    var nextRecoveryMs = Math.max(0, Number(d.nextRecoveryMs) || 0);
    var resumeHp = Math.max(0, Number(d.resumeHp) || 0);
    var missingHp = Math.max(0, Number(d.missingHp) || 0);
    /* KNOCKED OUT (First-Night Idle Rescue). Derived from the SERVER's absolute
       instant minus the clock — never a counter this sheet decrements, because
       a counter would survive a reload and Recovery is precisely the thing that
       must not. 0 when up, or when the server never stated a line. */
    var recoverLeft = Math.max(0, (Number(d.recoveringUntilMs) || 0) - (Number(d.nowMs) || 0));
    /* WHICH OF THE FIVE STATES THIS SHEET IS DESCRIBING (attended-death P0).
       Absent ⇒ derive the pre-b510 pair from the timer alone, so every caller
       that predates this field — the away receipt, the whole existing suite —
       renders byte-for-byte what it did. The two NEW states are the ones the
       old sheet could not tell apart from a free fall: `pending` (the server
       has not priced the window the fall is in yet) and `unconfirmed` (it did,
       and there was no death in it). */
    var phase = String(d.fallPhase || '') || (recoverLeft > 0 ? 'recovering' : 'down-free');
    /* ── THE RETREAT (Recovery Rule rev. 3) ────────────────────────────────
       STATED by the engine (`resolveDeath` -> info.retreat), never derived here
       from a count and a bag: the sheet and the server must not be able to
       disagree about which fall was the last one. It is deliberately NOT a
       sixth `phase` — the phases answer "what is the SERVER's answer about this
       fall yet?" (pending / unconfirmed / recovering / down-free), and a
       retreating fall passes through every one of those exactly as any other
       fall does. Retreat is a fact about the RUN, not about the fall's
       settlement, so it overrides the title and the lead and leaves the phase
       machinery — including the countdown re-render — untouched. */
    var retreat = !!d.retreat;
    /* WHICH RUNG FIRED, AND HOW MANY FALLS IT TOOK — both STATED by the engine
       (`resolveDeath` -> info.foodless / info.consecFalls) and neither derived
       here, for the reason `retreat` itself is not: the sheet and the server
       must not be able to disagree about the fall that ended the run.
       `retreatFoodless` falls back to the receipt's `hadFood` only when the
       engine said nothing, and `=== false` is the test there because
       `undefined` means nobody stated it. */
    var retreatFoodless = (typeof d.retreatFoodless === 'boolean')
      ? d.retreatFoodless : (d.hadFood === false);
    var retreatFalls = Math.max(0, Math.floor(Number(d.retreatFalls) || 0));

    /* THE TIP RULE. Held-and-unused beats everything, because it is the only
       branch where the player already owned the answer — that is the most
       teachable death there is, and it is the one the FTUE run hit. */
    var tipKey;
    if (foodQty > 0 && ate === 0) tipKey = 'food-unused';
    /* ATE ANYTHING AT ALL → outmatched, and this clause must come BEFORE the
       auto-eat one. The first draft asked "bag empty and Auto-Eat owned?"
       second, which told a player who had just burned five Trout that their bag
       was empty — technically true, and useless advice. Caught by the suite,
       not by review. Healing worked; the fight was the problem. */
    else if (ate > 0) tipKey = 'outmatched';
    /* b497: the SWITCH, not the entitlement. Every character owns Auto-Eat from
       creation now, so `autoEatOwned` here would tell a player who has never
       turned it on that it is "watching your health". An owner with it OFF and
       an empty bag is a `no-food` death — the gap really is upstream. */
    /* rev. 2 — THE REPEAT FALLER WITH THE SWITCH OFF. Above `no-food` because
       it is a strictly better answer for the same player: they own the fix,
       they are paying the ladder for not using it, and by the third fall of a
       day the cost is no longer theoretical. Ranked below `outmatched` for the
       reason that clause already states — somebody who ate five Trout has a
       fight problem, not a switch problem. */
    else if (nToday >= 3 && d.autoEatOwned && !d.autoEatOn) tipKey = 'auto-eat-off-repeat';
    else if (d.autoEatOn) tipKey = 'auto-eat-idle';
    else tipKey = 'no-food';

    var rows = [];
    rows.push({
      g: 'uiSkull', tone: 'bad', k: 'killed-by',
      t: monsterName ? 'Slain by ' + monsterName : 'Slain in battle',
      v: kills > 0 ? (kills + (kills === 1 ? ' kill' : ' kills') + ' first') : 'no kills'
    });
    /* THE REASSURING HALF, and it is not filler. A new player's first
       assumption on death in an RPG is that they were just robbed. Hearthrise
       does not take anything — saying so is the difference between "I lost my
       stuff" and "I lost my time", and only one of those makes them try
       again. If a death penalty is ever added, THIS row is the contract that
       has to change with it. */
    rows.push({ g: 'uiChest', tone: 'ok', k: 'kept', t: 'You kept everything you were carrying', v: 'no loss' });
    /* ⚠ NOT "fully restored" ANY MORE (rev. 2). A death used to be the cheapest
       full heal in the game; the character now stands up on 40%, and this row
       is the one place a player learns that before they walk into the next
       fight on it. `resumeHp` is STATED by the simulation, not recomputed here,
       so the sheet and the server cannot round differently. */
    /* NOT ON AN UNCONFIRMED FALL: nobody stood up, because per the server
       nobody went down. Claiming a 40% resume there would be the same class of
       invention this whole change removes. */
    if (phase !== 'unconfirmed') {
      rows.push({ g: 'uiHeart', tone: 'ok', k: 'healed', t: 'You got back up at 40% health',
        v: (resumeHp > 0 ? resumeHp : maxHp) + ' / ' + maxHp });
    }
    /* WHAT DYING ACTUALLY COSTS — the ladder, stated where the player can see
       it rather than discovered later as a missing number. Two rows, because
       the day's FIRST fall and its fourth are different events and one line
       that covered both would have to be vague about the only number that
       matters. */
    if (phase === 'pending') {
      /* THE HONEST ROW WHILE THE ANSWER IS IN FLIGHT. The server floor is 60 s
         (ACCRUE_MIN_MS), so a fall early in a fight cannot be priced yet — and
         the one thing this sheet must not do is fill that gap with a number.
         It says it is asking, and the renderer replaces this row in place the
         moment the envelope lands. */
      rows.push({ g: 'uiHourglass', tone: 'ok', k: 'run-stopped',
        t: 'Asking the hearth how long you are down', v: 'under a minute' });
    } else if (phase === 'unconfirmed') {
      rows.push({ g: 'uiHourglass', tone: 'ok', k: 'run-stopped',
        t: 'The hearth recorded no fall — your run never stopped', v: 'no delay' });
    } else if (nToday <= 1 || recoveryMs <= 0) {
      rows.push({ g: 'uiHourglass', tone: 'ok', k: 'run-stopped',
        t: 'First fall of the day — you are back on your feet at once', v: 'no delay' });
    } else {
      rows.push({ g: 'uiHourglass', tone: 'bad', k: 'run-stopped',
        t: 'Knocked out for ' + fmtDur(recoveryMs) + ' — nothing earns while you recover',
        v: fmtDur(recoveryMs) });
    }
    /* THE POINTER SURVIVES. The single most important thing this sheet can say
       to somebody who just watched a twelve-hour night end at minute four
       before rev. 1: the run is not over, and they do not have to do anything.
       ⚠ EXCEPT ON A RETREAT, WHERE IT IS FALSE. The realm ENDED the run and the
         server idled the pointer, so "picks up · automatic" is the same wrong
         promise RETREAT-A6 removed from the lead, one row lower. The retreat
         row states the ruled lead's own fact instead of suppressing the slot,
         because a sheet that simply goes quiet about the pointer leaves the
         player to assume the reassuring answer. Copy is provisional and is
         flagged to the Designer in CONFLICTS.md. */
    rows.push(retreat
      ? { g: 'uiTarget', tone: 'bad', k: 'resume',
          t: 'You pulled back — your run does not restart itself', v: 'ended' }
      : { g: 'uiTarget', tone: 'ok', k: 'resume',
          t: monsterName
            ? 'Your run picks up against the ' + monsterName + ' the moment you are up'
            : 'Your run picks up the moment you are up',
          v: 'automatic' });
    /* THE WARNING, only once there is something to warn about. Shown from the
       second fall so the doubling is learned at the rung where it starts
       costing, not announced on a free one. */
    if (nToday >= 2 && nextRecoveryMs > 0) {
      rows.push({ g: 'uiHourglass', tone: 'bad', k: 'escalating',
        t: 'Recovery doubles each time you fall today — ' + fmtDur(nextRecoveryMs) + ' if you fall again',
        v: 'doubling' });
    }
    if (d.streakBroken) {
      rows.push({ g: 'uiTarget', tone: 'bad', k: 'streak', t: 'Bounty streak reset to 0', v: 'streak' });
    }
    /* THE EMPTY BAG, SAID PLAINLY (First-Night Idle Rescue). The tip further
       down explains WHY; this row is the one-line fact a player reads in the
       second and a half they give this sheet, and it is the state every brand
       new character is in.
       ⚠ `=== false`, NOT `!d.hadFood`. `undefined` means nobody stated it, and
         a truthiness test would tell every such player their bag was empty. */
    if (d.hadFood === false) {
      rows.push({ g: 'uiFood', tone: 'bad', k: 'no-food',
        t: 'Cook some food — your bag is empty.', v: 'no food' });
    }

    return {
      /* THE HEADLINE IS THE CHARACTER'S STATE, not the event, whenever the two
         differ. A player who is face-down for another 1:47 needs to be told
         THAT first — "The Slime got you" describes a thing that already
         finished, and the sheet would then be silent about the only fact that
         governs their next tap. */
      /* ── THE RETREAT OVERRIDES BOTH (rev. 3), and it sits ABOVE the phase
         ladder deliberately. A retreating fall is still "recovering" — its rung
         was charged before the run ended — so without this the sheet would say
         "Knocked out / Back on your feet in 3:47", which describes a player who
         is about to carry on. They are not: the server has idled their pointer.
         The ruling's own words: ENDED BY CHOICE is not the same as FAILED. */
      title: retreat
        ? 'You pulled back'
        : (phase === 'pending'
        ? 'You fell'
        : (phase === 'unconfirmed'
          ? 'Still standing'
          : (recoverLeft > 0
            ? 'Knocked out'
            : (monsterName ? 'The ' + monsterName + ' got you' : 'You fell')))),
      lead: retreat
        ? retreatLead({ foodless: retreatFoodless, falls: retreatFalls, msLeft: recoverLeft })
        : (phase === 'pending'
        /* ⚠ THE WAIT IS NAMED, NEVER AN OPEN-ENDED SPINNER (P1, b511 live).
           The server floor is 60 s, so this sentence is on screen for up to a
           minute by design — and a player looking at "…" with no stated bound
           cannot tell that from a hung game. It was, live: the sheet sat on
           this line for 94 s with nothing re-asking. The re-ask is fixed in
           accrue.js; the honest bound belongs here. */
        ? 'Asking the hearth how long you are down — an answer takes up to a minute.'
        : (phase === 'unconfirmed'
          /* THE PLAYER IS STOOD BACK UP, IN WORDS AND IN HP (P1, b511 live).
             The server priced the window the client fell in and saw no death
             in it, so the client's dice were wrong and the run resumes. The
             health quoted is the SERVER's (`resumeHp` reads the adopted
             `G.playerHp`) — the sheet states the number the tick will swing
             on, never a client guess, and never a bare "no fall" that leaves
             the player wondering what shape they are in. */
          ? (resumeHp > 0
            ? 'The hearth says you are still standing — resuming at ' + resumeHp + ' HP.'
            : 'The hearth found no fall in that stretch — your run never stopped.')
          : (recoverLeft > 0
            ? 'Back on your feet in ' + mmss(recoverLeft) + '.'
            : (nToday <= 1
              ? 'Your first fall today. Nothing is lost but a moment — here is what happened.'
              : 'You have fallen ' + nToday + ' times today. Each one takes longer to shake off.')))),
      /* STATED on the model so the renderer can tell a re-render it must do
         (the phase moved) from one it must not (a second ticked by). */
      fallPhase: phase,
      /* STATED for the same reason `fallPhase` is: the renderer's 1 Hz tick
         rewrites the lead, and it must not rewrite a retreat's lead into "Back
         on your feet in 3:47" — that clock IS running, but the run it would
         resume is over. `render` branches on this and redraws the retreat lead
         through the same `retreatLead` this model used, so the minutes tick
         down in the ruled words instead of being replaced by the wrong promise.
         ⚠ THIS FLAG WAS STATED HERE IN rev. 3 AND NEVER READ. The comment
           claimed the protection; the renderer's countdown only ever tested
           `shown.until > 0`, which is > 0 on a retreat — so the ruled lead was
           overwritten one second after the sheet opened. Fixed in `render`. */
      retreat: retreat,
      /* THE TWO FACTS THE LEAD IS BUILT FROM, restated on the model so the 1 Hz
         redraw can rebuild the same sentence without re-deriving the rule. */
      retreatFoodless: retreatFoodless,
      retreatFalls: retreatFalls,
      /* WHAT THE SERVER'S RECOVERY LINE STILL HAS TO RUN. Stated rather than
         re-derived by the renderer, so one function owns the arithmetic.
         ⚠ NO LONGER ZEROED ON A RETREAT (Designer ruling, 2026-09-07). rev. 3
           suppressed it so the sheet could not promise a resume it would not
           honour — but the ruling puts the clock ON the retreat sheet in words
           ("Still recovering — 41m to go") precisely because the player needs
           it: `hr_rest` is still the cure and the recovery is still real. The
           thing that must not be promised is the RESUME, and that is what the
           `retreat` flag above now actually suppresses. A model that says 0
           while its own lead quotes 41 minutes is a model that disagrees with
           itself. */
      recoverMsLeft: recoverLeft,
      deaths: deaths,
      rows: rows,
      tipKey: tipKey,
      tip: TIPS[tipKey](
        { foodQty: foodQty, foodName: foodName, monsterName: monsterName || 'That foe',
          autoEatOwned: !!d.autoEatOwned,
          // b497: the live-combat SWITCH, distinct from ownership. See the
          // branch note above TIPS.
          autoEatOn: !!d.autoEatOn,
          // 0 / absent => the tip states no price rather than inventing one.
          autoEatCost: Math.max(0, Number(d.autoEatCost) || 0) }
      ),
      /* The Bounty Shop link only appears when it is actually the answer —
         an offer to buy something you already own is noise. */
      shopLink: tipKey === 'food-unused' && !d.autoEatOwned,
      /* ── b526 · THE EMPTY BAG GETS A DOOR ─────────────────────────────────
         The two tips whose whole content is "you had nothing to eat" are the
         two that can now be ACTED ON from the sheet, because the Supplies
         counter stocks Cooked Shrimp and `set_activity`'s recovery refusal
         does not touch shopping. Mutually exclusive with `shopLink` by
         construction — that one is the food-unused tip, these are the two
         empty-bag tips — so the single affordance slot never holds two. */
      foodShopLink: tipKey === 'no-food' || tipKey === 'auto-eat-idle',
      /* THE ONE-TAP RE-ENABLE (Designer ruling 2b condition 3, 2026-08-31).
         The exact complement of `shopLink`: the same tip, the same slot, the
         other population. An owner who has it switched OFF is the only player
         for whom one tap fixes the thing that just killed them, so it is the
         only one who gets a button — an owner with it ON would be offered a
         switch already thrown, and a non-owner a switch they do not have. */
      enableAutoEat: (tipKey === 'food-unused' || tipKey === 'auto-eat-off-repeat')
        && !!d.autoEatOwned && !d.autoEatOn,
      /* ── THE RELIEF VALVE (rev. 2, N1) ────────────────────────────────
         "Rest at the Hearth" is the ONLY way off the floor early, and it is
         bought with FOOD — never with gold, marks, gems or a trait (the R10
         standing rule; tests/recovery-relief-guard.mjs asserts the absence).
         It is offered ONLY while the timer is actually running and only when
         there is health to buy back, because `hr_rest` refuses both of those
         cases server-side and an action that always fails is worse than none.
         The SERVER decides which provisions are eaten and how many — this
         button sends a slot and an idempotency key and nothing else. */
      restHp: missingHp,
      restSub: 'Eating your way back up clears the timer. Food is the fastest way off the floor.',
      /* ── THE BUTTON MUST NOT PROMISE WHAT THE SERVER WILL REFUSE (b510 P0) ──
         MEASURED LIVE: the bag was empty server-side, the sheet offered "Rest
         at the Hearth — eat 7 health", and `hr_rest` answered
         `insufficient_food` — an action that could never succeed, offered as
         the PRIMARY tap on a screen the player is stuck behind.
         `foodQty` is read from `G.inventory` through `bestProvision`, i.e. from
         the bag AFTER the boot/settle reconcile — which is the server's food
         count now that reconcileInventory lets a server-eaten provision reach
         zero (src/net/accrue.js, the phantom-food rule). One source, no second
         idea of how much food exists. */
      restFood: foodQty,
      /* NO "Fight again" WHILE THE FALL IS UNRESOLVED, and that is not caution:
         `startCombat` declares a new activity, hr_apply stamps
         `accrued_to = now()` on any activity delta, and the window the fall is
         waiting to be priced in would be erased by the tap. Pending offers the
         door out and nothing else; unconfirmed offers the way back, because
         the run the player is being returned to never stopped. */
      actions: (phase === 'pending'
        ? [{ k: 'table', label: 'Back to the War Table' }]
        : (phase === 'unconfirmed'
          ? [{ k: 'table', label: 'Back to the fight', primary: true }]
          : (recoverLeft > 0 && missingHp > 0
            ? [(foodQty > 0
                 ? { k: 'rest', label: 'Rest at the Hearth — eat ' + missingHp + ' health', primary: true }
                 /* No provisions: the tap is shown so the player learns WHY the
                    relief valve is closed, and disabled so it cannot lie. */
                 : { k: 'rest', label: 'No food to rest with', primary: true, disabled: true }),
               { k: 'table', label: 'Back to the War Table' }]
            : [{ k: 'again', label: monsterName ? 'Fight ' + monsterName + ' again' : 'Fight again', primary: true },
               { k: 'table', label: 'Back to the War Table' }])))
    };
  }

  // ════════════════════════════════════════════════════════════
  // 2 · READING THE MOMENT OFF THE LIVE GAME
  // ════════════════════════════════════════════════════════════

  /* The biggest healing PROVISION in the bag, by the same rule auto-eat picks
     with (src/core/auto-eat.js isAutoEatable) — so the sheet names the food
     the game would actually have eaten, not the first row of the inventory. */
  function bestProvision(G) {
    var best = null;
    var C = window.HearthriseCore;
    var eligible = (C && C.autoEat && C.autoEat.isAutoEatable) || null;
    var inv = (G && G.inventory) || {};
    var ITEMS = window.ITEMS || {};
    for (var id in inv) {
      if (!Object.prototype.hasOwnProperty.call(inv, id)) continue;
      var qty = inv[id];
      if (!(qty > 0)) continue;
      var it = ITEMS[id];
      if (!it) continue;
      var ok = eligible ? eligible(it) : (it.heals > 0 && it.foodClass !== 'buff');
      if (!ok) continue;
      if (!best || (it.heals || 0) > (best.heals || 0)) {
        best = { id: id, name: it.n || id, heals: it.heals || 0, qty: qty };
      }
    }
    return best;
  }

  /** Count the "Ate"/"Auto-ate" lines this run left in the combat log. */
  function ateThisFight(G) {
    var log = (G && G.combatLog) || [];
    if (!Array.isArray(log)) return 0;
    var n = 0;
    for (var i = 0; i < log.length; i++) {
      if (/(^|\s)(Auto-ate|You eat|You ate)\b/.test(String(log[i]))) n++;
    }
    return n;
  }

  /* ── THE BOOT-RAISED SHEET'S RETREAT, OBSERVED OFF THE ENVELOPE ──────────
     THE MEASURED GAP (CONFLICTS.md 2026-09-07, systems → designer; closed by
     the 2026-09-08 brief). RETREAT-A4 gave the reload its sheet, but a sheet
     raised at BOOT carries no engine `info` — so a player whose run the realm
     ENDED came back to "Knocked out / Back on your feet in 31:47" with a row
     promising "Your run picks up the moment you are up · automatic". After a
     retreat the server has IDLED the pointer and it does not pick up: the same
     defect RETREAT-A6 exists for, reached through the boot door.

     THIS IS AN OBSERVATION, NOT A SECOND COPY OF THE RULE. `readMoment` still
     re-derives NOTHING: it does not look at the bag, does not count anything
     and does not decide when a run ends. It reads the SERVER's own durable
     counter (`player_state.consec_falls` → `G.consecFalls`, projected by
     hr_state_of and hydrated by `reconcileFall`) and asks src/core/away.js's
     `retreatAtFall` — the ONE definition both runtimes import — which rung that
     number is at. The rule has exactly one author either way.

     ⚠ KEY PRESENCE, THE SAME CONTRACT `reconcileFall` KEEPS. `G.consecFalls` is
       left UNDEFINED by an older server, and an undefined counter must claim
       NOTHING: inventing a 0 (or a 3) would put the ruled ending on a sheet the
       database cannot back. Non-number ⇒ no retreat, full stop.
     ⚠ THE POINTER IS THE OTHER HALF. An ordinary knockout mid-fight boots with
       `active_kind:'combat'` and record.js re-points `G.activeMonster`; a
       retreat ALWAYS boots idle. A character still pointed at a fight has not
       pulled back, whatever their fall count reads, so the fight wins the tie.
     ⚠ WHICH RUNG DECIDES THE COPY, and nothing else does. Fed (6) is asked
       FIRST because it is the strictly weaker condition — a count at 6 is a
       retreat whatever the bag held, and the ruled fed sentence ("out of your
       league") is the honest one there. Only a count the fed rung does not
       reach can be the foodless rung's, and that is the only inference here. */
  function bootRetreat(G) {
    var none = { retreat: false, foodless: undefined, falls: 0 };
    try {
      if (!G || typeof G.consecFalls !== 'number' || !isFinite(G.consecFalls)) return none;
      var n = Math.floor(G.consecFalls);
      if (!(n > 0)) return none;
      if (G.activeMonster) return none;
      var A = window.HearthriseCore && window.HearthriseCore.away;
      if (!A || typeof A.retreatAtFall !== 'function') return none;
      if (A.retreatAtFall({ consecFalls: n, foodless: false })) {
        return { retreat: true, foodless: false, falls: n };
      }
      if (A.retreatAtFall({ consecFalls: n, foodless: true })) {
        return { retreat: true, foodless: true, falls: n };
      }
      return none;
    } catch (e) { return none; }
  }

  /**
   * Build the model from live state. `info` is combat-sim's death info.
   *
   * WHY `G.activeMonster` AND NOT A FIELD ON `info`. The obvious shape is for
   * resolveDeath() to put `monsterId` on the info object it hands to
   * `fx.onDeath`. It is not needed: resolveDeath calls onDeath BEFORE the
   * caller stops the fight, so the target is still standing when we read it —
   * and src/core/combat-sim.js is packed into the hr-accrue Edge Function
   * (tools/pack-edge.mjs), so one byte changed there turns the suite's Edge
   * payload guard red until the function is redeployed. A UI feature does not
   * get to force a coordinated server redeploy for a value it can already see.
   * `info.monsterId` is still read first, so if that field ever does arrive for
   * a real reason this keeps working. The ordering contract is asserted by the
   * "RESPAWN IS A FULL HEAL" test, which fails if onDeath ever moves.
   */
  function readMoment(info) {
    var G = window.G || {};
    var MON = window.MONSTERS || {};
    /* Asked ONCE, and only where there is no engine `info` to state it: the
       engine's answer always wins, so a live fall is untouched by this. */
    var _boot = info ? null : bootRetreat(G);
    var id = (info && info.monsterId) || G.activeMonster || null;
    var m = id && MON[id];
    var food = bestProvision(G);
    return {
      monsterId: id,
      monsterName: (m && m.name) || '',
      killsThisFoe: G.combatKillsThisFoe || 0,
      foodQty: food ? food.qty : 0,
      foodName: food ? food.name : 'provision',
      ateThisFight: ateThisFight(G),
      /* ANY TIER OWNS THE FEATURE. Asking about the entry-tier id alone told a
         character holding only Auto-Eat II that they did not have Auto-Eat, and
         then quoted them the Store price for it — which is exactly the sale the
         2b ruling's third condition forbids, arriving through the gate rather
         than the copy. Same predicate `maybeAutoEat`, the settings row and the
         server entitlement all use: a capability, never an id. Falls back to
         the id read when the core is not up, which is the honest degrade. */
      autoEatOwned: (function () {
        try {
          var AE = window.HearthriseCore && window.HearthriseCore.autoEat;
          if (AE && typeof AE.autoEatTier === 'function') return AE.autoEatTier(G.traits || {}) > 0;
        } catch (e) {}
        return !!(G.traits && G.traits.auto_eat);
      })(),
      /* b497 — THE SWITCH, read from its one authoritative writer
         (HearthriseAuto, b326/b329) rather than from `G.autoActions` directly,
         which is the shape ensureShape() maintains and not the contract. Since
         every character is granted Auto-Eat I at creation, ownership no longer
         answers "is it running"; only this does. Absent module => false, which
         is the honest reading of "we cannot tell, so do not claim it is on". */
      autoEatOn: (function () {
        try {
          var A = window.HearthriseAuto;
          return !!(A && typeof A.getEat === 'function' && A.getEat().enabled);
        } catch (e) { return false; }
      })(),
      /* b432: the Marks price of Auto-Eat, read from the ONE place it is
         authored (legacy.js TRAITS, the same row the Bounty Shop renders), so
         the death sheet and the shop can never quote different numbers. Guard
         the currency too — if the trait is ever repriced in gold the tip must
         stop saying "Marks" rather than start lying. */
      autoEatCost: (function () {
        var t = window.TRAITS && window.TRAITS.auto_eat;
        if (!t || t.currency !== 'marks') return 0;
        return Number(t.cost) > 0 ? Number(t.cost) : 0;
      })(),
      maxHp: G.playerMaxHp || 10,
      streakBroken: !!(info && info.streakBroken),
      deaths: (G.stats && G.stats.deaths) || 1,
      /* THE LADDER'S NUMBERS, STATED BY THE SIMULATION (rev. 2). `info` is
         combat-sim's own death info, which read them off the two SERVER
         counters seeded onto the state — the sheet re-derives none of it.
         Falling back to `1 / 0` is the under-claiming direction: a sheet with
         nothing stated promises no penalty rather than inventing one. */
      /* THE LADDER, FROM THE SERVER'S OWN COUNTERS (`state.deaths_today` /
         `deaths_lifetime`, hr_state_of). `info.deathsToday` is the SIMULATION's
         number, which is right on the away path (the engine seeded it from
         those same rows) and garbage on the live one (nothing seeds
         `G.deathsTodayBefore`, so `resolveDeath` falls back to the lifetime
         tally). Server first, engine second, 1 last — the under-claiming order,
         since a sheet with nothing stated promises no penalty. */
      deathsToday: (function () {
        try {
          var AC = window.HearthriseAccrual;
          var n = (AC && typeof AC.deathsToday === 'function') ? Math.floor(AC.deathsToday()) : 0;
          if (n > 0) return n;
        } catch (e) {}
        return Math.max(1, Number(info && info.deathsToday) || 1);
      })(),
      /* WHAT THIS FALL COST, from the SERVER's counters through the same pure
         ladder the engine stamps from: fall number `deaths_today` was charged
         `recoveryFor(deathsTodayBefore = deaths_today - 1)`. The engine's own
         `info.recoverMs` is the fallback and is correct on the away path, where
         the state WAS seeded from those rows. */
      recoveryMs: (function () {
        try {
          var AC = window.HearthriseAccrual;
          var A = window.HearthriseCore && window.HearthriseCore.away;
          var today = (AC && typeof AC.deathsToday === 'function') ? Math.floor(AC.deathsToday()) : 0;
          var life = (AC && typeof AC.deathsLifetime === 'function') ? Math.floor(AC.deathsLifetime()) : 0;
          if (today > 0 && A && typeof A.recoveryFor === 'function') {
            return Math.max(0, A.recoveryFor({
              deathsTodayBefore: Math.max(0, today - 1),
              deathsLifetimeBefore: Math.max(0, life - 1),
            }) || 0);
          }
        } catch (e) {}
        return Math.max(0, Number(info && info.recoverMs) || 0);
      })(),
      /* WHAT THE NEXT FALL COSTS, derived from the SERVER's counters through
         the same pure ladder the engine stamps from (src/core/away.js
         `recoveryFor`) — so the warning cannot promise a rung nobody charges.
         Falls back to the engine's own answer when the counters are absent (an
         older server), which is exactly the away path's case. */
      nextRecoveryMs: (function () {
        try {
          var AC = window.HearthriseAccrual;
          var A = window.HearthriseCore && window.HearthriseCore.away;
          var today = (AC && typeof AC.deathsToday === 'function') ? Math.floor(AC.deathsToday()) : 0;
          var life = (AC && typeof AC.deathsLifetime === 'function') ? Math.floor(AC.deathsLifetime()) : 0;
          if (today > 0 && A && typeof A.recoveryFor === 'function') {
            return Math.max(0, A.recoveryFor({ deathsTodayBefore: today, deathsLifetimeBefore: life }) || 0);
          }
        } catch (e) {}
        return Math.max(0, Number(info && info.nextRecoverMs) || 0);
      })(),
      resumeHp: Math.max(0, Number(info && info.resumeHp) || Number(G.playerHp) || 0),
      /* ── THE RETREAT (Recovery rev. 3) ──────────────────────────────────
         STATED BY THE ENGINE and by nothing else. `info.retreat` is
         `resolveDeath`'s own answer, computed from the durable server counter
         (`G.consecFalls`, projected by hr_state_of) and the LIVE bag at the
         instant of the fall — so the sheet cannot decide a player retreated on
         a fall the server will price as an ordinary one.
         ⚠ NO CLIENT FALLBACK, for the same reason `recoveringUntilMs` above has
           none since the attended-death P0: re-deriving it here from a count
           and a bag would be a second copy of the rule, and the second copy is
           the one that is wrong.
         A BOOT-RAISED SHEET (`show(null, null)`) HAS NO `info`, and until
         2026-09-08 therefore claimed nothing — which left a retreated player
         reading "Knocked out / Back on your feet in 31:47" beside a row
         promising an automatic resume the idled pointer will never honour. It
         now reads `bootRetreat` above: the SERVER's own `consec_falls` put to
         away.js's `retreatAtFall`. That is an observation of state, not a
         second copy of the rule; an absent counter still claims nothing. */
      retreat: !!(info ? info.retreat : (_boot && _boot.retreat)),
      /* WHICH RUNG, AND HOW MANY FALLS — STATED BY THE ENGINE beside `retreat`
         itself (`resolveDeath` returns `foodless` and `consecFalls` in the same
         object) so the sheet's sentence names the rung the server charged.
         WITH NO `info` they come from `bootRetreat` — the server's counter and
         nothing else — and are omitted entirely unless it claimed a retreat, so
         a sheet that claims nothing still feeds the lead nothing. */
      retreatFoodless: info
        ? ((typeof info.foodless === 'boolean') ? info.foodless : undefined)
        : ((_boot && _boot.retreat) ? _boot.foodless : undefined),
      retreatFalls: info
        ? Math.max(0, Math.floor(Number(info.consecFalls) || 0))
        : ((_boot && _boot.retreat) ? _boot.falls : 0),
      /* What "Rest at the Hearth" costs, in health. The SERVER recomputes it
         under the row lock and this number never crosses back — it is a label. */
      missingHp: Math.max(0, (Number(G.playerMaxHp) || 0) - (Number(G.playerHp) || 0)),
      /* THE RECOVERY LINE (First-Night Idle Rescue). SERVER-OWNED — the client
         reads `player_state.recovering_until` off the last state envelope and
         never authors it. Absent (an older server, or a character who is up)
         reads 0, and every recovery branch on this sheet simply does not fire.
         `info.recoverMs` is the engine's own answer for the death that JUST
         happened, used only until the next envelope confirms it. */
      /* ⚠ NO CLIENT FALLBACK ANY MORE (attended-death P0, 2026-09-06). This
         used to fall back to `info.recoverMs` — the engine's own answer for the
         death that just happened — "until the next envelope confirms it". On
         the ATTENDED path no envelope ever confirmed it, because the client
         declared idle and the server never simulated the fall; and the fallback
         itself was wrong twice over, since `resolveDeath` adds the LIFETIME
         `stats.deaths` to an unseeded `deathsTodayBefore` and therefore quoted
         a fifth-fall rung on a first fall. Measured live: the sheet counted
         down from 1:38 against a server row of NULL. A timer this client cannot
         source from an envelope is not shown at all — `fallPhase` below says
         so instead. */
      recoveringUntilMs: (function () {
        try {
          var AC = window.HearthriseAccrual;
          return (AC && typeof AC.recoveringUntilMs === 'function') ? (AC.recoveringUntilMs() || 0) : 0;
        } catch (e) { return 0; }
      })(),
      /* WHERE THE CHARACTER STANDS, as src/net/accrue.js `fallState` reports it
         from the envelope: pending / recovering / down-free / unconfirmed / up.
         The sheet BRANCHES on this rather than inferring a state from whether a
         number happens to be zero — "no timer" is three different facts (a
         free first fall, an answer still in flight, and a fall the server never
         saw) and the old sheet told all three the same story. */
      fallPhase: (function () {
        try {
          var AC = window.HearthriseAccrual;
          if (AC && typeof AC.fallState === 'function') return AC.fallState().phase || '';
        } catch (e) {}
        return '';
      })(),
      nowMs: Date.now(),
      /* Did the bag hold ANYTHING auto-eatable at this moment? The same chooser
         the simulation gates on, so the sheet and the night agree. `undefined`
         when core is not up — the row then claims nothing. */
      hadFood: (function () {
        try {
          var AE = window.HearthriseCore && window.HearthriseCore.autoEat;
          if (!AE || typeof AE.chooseFood !== 'function') return undefined;
          var A = window.HearthriseAuto;
          var nom = (A && typeof A.getEat === 'function') ? ((A.getEat() || {}).foodId || null) : null;
          return !!AE.chooseFood(nom, G.inventory || {}, window.ITEMS || {}, Infinity);
        } catch (e) { return undefined; }
      })()
    };
  }

  // ════════════════════════════════════════════════════════════
  // 3 · PRESENTATION — tokens only, glyphs only
  // ════════════════════════════════════════════════════════════
  function gly(key, px, color) {
    var IS = window.HearthriseIconSet;
    var p = key && IS && IS.path && IS.path(key);
    if (!p) return '';
    return '<svg viewBox="0 0 512 512" style="width:' + (px || 18) + 'px;height:' + (px || 18) +
      'px;display:inline-block;vertical-align:middle" aria-hidden="true"><path fill="' +
      (color || 'var(--gold-2)') + '" d="' + p + '"/></svg>';
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '#' + ROOT_ID + '{position:fixed;inset:0;z-index:100000;display:none;align-items:center;',
      '  justify-content:center;padding:16px;background:rgba(0,0,0,.72);backdrop-filter:blur(3px)}',
      '#' + ROOT_ID + '.show{display:flex}',
      '.hr-death{width:100%;max-width:440px;max-height:92vh;overflow:auto;border-radius:14px;',
      '  background:var(--surface-2,#221b14);border:1px solid var(--line,rgba(255,255,255,.12));',
      '  box-shadow:0 24px 60px -20px rgba(0,0,0,.9);padding:20px}',
      '.hr-death-top{display:flex;gap:11px;align-items:center;margin-bottom:4px}',
      '.hr-death-mark{flex:0 0 auto;width:40px;height:40px;border-radius:50%;display:flex;',
      '  align-items:center;justify-content:center;background:rgba(0,0,0,.32);',
      '  border:1px solid var(--line,rgba(255,255,255,.14))}',
      '.hr-death h2{margin:0;font-family:var(--f-display,inherit);',
      '  font-size:calc(21px * var(--ui-scale,1));color:var(--ink,#efe6d6);line-height:1.15}',
      '.hr-death-lead{margin:8px 0 14px;font-size:calc(14.5px * var(--ui-scale,1));',
      '  color:var(--ink-3,#a2968a);line-height:1.5}',
      '.hr-death-rows{display:flex;flex-direction:column;gap:1px;border-radius:10px;overflow:hidden;',
      '  border:1px solid var(--line,rgba(255,255,255,.10))}',
      '.hr-death-row{display:flex;align-items:center;gap:9px;padding:9px 11px;background:rgba(0,0,0,.22);',
      '  font-size:calc(14.5px * var(--ui-scale,1));color:var(--ink-2,#cbbfae);line-height:1.35}',
      '.hr-death-row span.hr-death-t{flex:1;min-width:0}',
      '.hr-death-row b{color:var(--ink,#efe6d6);font-variant-numeric:tabular-nums;white-space:nowrap}',
      '.hr-death-row[data-tone="bad"] b{color:var(--red,#a04830)}',
      '.hr-death-row[data-tone="ok"] b{color:var(--gold-2,#c9a24a)}',
      '.hr-death-tip{margin:14px 0 0;padding:11px 12px;border-radius:10px;',
      '  background:rgba(0,0,0,.28);border:1px solid rgba(201,162,74,.34);',
      '  font-size:calc(14.5px * var(--ui-scale,1));color:var(--ink-2,#cbbfae);line-height:1.5}',
      /* b227's 14.5px reading floor, not 13. This label and the link below sat
         under it since b373 and no guard had ever SEEN them: the stylesheet is
         injected by ensureStyle() on the first render, and until RECOVER-10
         mounted the sheet in the suite nothing in a test run had ever opened it.
         The two rules are the whole diff; the uppercase label simply reads at
         the size the rest of the game does. Flagged to the Art Director. */
      '.hr-death-tip b{display:block;color:var(--gold-2,#c9a24a);font-size:calc(14.5px * var(--ui-scale,1));',
      '  letter-spacing:.09em;text-transform:uppercase;margin-bottom:4px}',
      /* display:block — as an inline button it wrapped onto the tail of the
         tip paragraph ("…think about it again.Open the Bounty Shop"), which
         read as a run-on sentence rather than an action. Verified in browser. */
      '.hr-death-shop{display:block;background:none;border:0;padding:0;margin-top:8px;font:inherit;text-align:left;',
      '  font-size:calc(14.5px * var(--ui-scale,1));color:var(--gold-2,#c9a24a);',
      '  text-decoration:underline;cursor:pointer}',
      /* STICKY, not merely last. On a 922x423 landscape phone the sheet is
         taller than the viewport and the two actions sat below the fold —
         measured, and it is the one part of this sheet that must never be
         hidden, because it is the whole "and now do this" half of the design.
         Sticky keeps them pinned to the sheet's bottom edge while the receipt
         above scrolls; the negative margins + padding make the bar span the
         sheet's full width so the scrolled content passes behind an opaque
         strip rather than through the buttons. */
      '.hr-death-acts{position:sticky;bottom:-20px;z-index:1;display:flex;gap:8px;flex-wrap:wrap;',
      '  margin:16px -20px -20px;padding:12px 20px 20px;background:var(--surface-2,#221b14)}',
      '.hr-death-acts .btn{flex:1 1 auto;min-height:40px}',
      '.hr-death-acts .btn[disabled]{opacity:.5;cursor:not-allowed}',
      /* THE REFUSAL LINE. Lives INSIDE the sticky action bar so it can never be
         scrolled away from the button that produced it. Full-width so it reads
         as a sentence about the sheet, not a caption on one button. */
      '.hr-death-note{flex:1 0 100%;margin:0 0 2px;font-size:calc(14.5px * var(--ui-scale,1));',
      '  line-height:1.45;color:var(--ink-2,#cbbfae)}',
      '.hr-death-note[data-tone="bad"]{color:var(--red,#a04830)}',
      '.hr-death-note:empty{display:none}',
      /* Landscape phone (922x423 and friends): tighten every band so the
         receipt itself usually fits too, not just the actions. */
      '@media (max-height:540px){',
      '  .hr-death{max-width:520px;padding:14px}',
      '  .hr-death-lead{margin:6px 0 10px}',
      '  .hr-death-row{padding:6px 10px}',
      '  .hr-death-tip{margin-top:10px;padding:9px 11px}',
      '  .hr-death-acts{bottom:-14px;margin:12px -14px -14px;padding:10px 14px 14px}}'
    ].join('');
    document.head.appendChild(s);
  }

  function close() {
    /* Clear the recovery countdown with the sheet. A timer that outlives its
       DOM keeps waking the tab once a second forever, which on a phone is a
       battery bug nobody attributes to a death modal. */
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    /* ── THE DISMISSAL IS REMEMBERED, AND SEPARATELY FROM THE RAISE ───────
       `raisedForUntil` says "this window has been ANNOUNCED"; this says "the
       player has ANSWERED it". They look like the same fact and are not, and
       the difference is what the sheet gets wrong when anything re-arms the
       raise latch: `_resetRaise()` sets `raisedForUntil` back to 0, and the
       very next envelope of a knockout that is still running re-opens a sheet
       the player just put away — every few seconds, for the whole recovery.
       Read from the SERVER's own line first and from what is on screen second,
       so a sheet rendered from a stated moment is dismissable too. */
    try {
      var f = serverFall();
      var untilNow = (f.until > 0) ? f.until : ((shown && Number(shown.until)) || 0);
      if (untilNow > 0) dismissedUntil = untilNow;
    } catch (e) {}
    shown = null;
    var el = document.getElementById(ROOT_ID);
    if (el) el.classList.remove('show');
  }

  /* The two server-owned facts this sheet is a view of, read as cheaply as
     possible so the 1 Hz watch below can compare them without rebuilding the
     whole moment (which walks the inventory). */
  function serverFall() {
    var out = { phase: '', until: 0 };
    try {
      var AC = window.HearthriseAccrual;
      if (AC && typeof AC.fallState === 'function') out.phase = AC.fallState().phase || '';
      if (AC && typeof AC.recoveringUntilMs === 'function') out.until = AC.recoveringUntilMs() || 0;
    } catch (e) {}
    return out;
  }

  function render(model, moment, info) {
    ensureStyle();
    var root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.addEventListener('click', function (e) { if (e.target === root) close(); });
      document.body.appendChild(root);
    }

    var rows = model.rows.map(function (r) {
      return '<div class="hr-death-row" data-tone="' + r.tone + '" data-row="' + r.k + '">' +
        '<span>' + gly(r.g, 17, r.tone === 'bad' ? 'var(--red,#a04830)' : 'var(--gold-2)') + '</span>' +
        '<span class="hr-death-t">' + esc(r.t) + '</span><b>' + esc(r.v) + '</b></div>';
    }).join('');

    root.innerHTML =
      '<div class="hr-death" onclick="event.stopPropagation()">' +
        '<div class="hr-death-top">' +
          '<div class="hr-death-mark">' + gly('uiSkull', 21, 'var(--red,#a04830)') + '</div>' +
          '<h2>' + esc(model.title) + '</h2>' +
        '</div>' +
        '<p class="hr-death-lead">' + esc(model.lead) + '</p>' +
        '<div class="hr-death-rows">' + rows + '</div>' +
        '<div class="hr-death-tip" data-tip="' + esc(model.tipKey) + '">' +
          '<b>What to do differently</b>' + esc(model.tip) +
          (model.shopLink ? '<button class="hr-death-shop" data-act="shop">Open the Bounty Shop</button>' : '') +
          (model.foodShopLink ? '<button class="hr-death-shop" data-act="foodshop">Buy food at the Local Shop</button>' : '') +
          /* Same class as the shop link — one affordance in this slot, so the
             two never look like different kinds of thing. */
          (model.enableAutoEat ? '<button class="hr-death-shop" data-act="autoeat">Turn Auto-Eat back on</button>' : '') +
        '</div>' +
        '<div class="hr-death-acts">' +
          '<p class="hr-death-note" data-note role="status" aria-live="polite"></p>' +
          model.actions.map(function (a) {
            /* data-label carries the ORIGINAL wording so an in-flight button can
               be restored verbatim after a refusal — reconstructing it from the
               model would be a second copy of the label rule. */
            return '<button class="btn' + (a.primary ? ' btn-primary' : '') + '" data-act="' + a.k + '"' +
              ' data-label="' + esc(a.label) + '"' +
              (a.disabled ? ' disabled' : '') + '>' + esc(a.label) + '</button>';
          }).join('') +
        '</div>' +
      '</div>';

    root.querySelectorAll('[data-act]').forEach(function (b) {
      b.onclick = function () {
        if (b.disabled) return;
        act(b.getAttribute('data-act'), moment, b);
      };
    });
    /* THE STANDING EXPLANATION. A disabled Rest button with no reason beside it
       is the same silent refusal in a different costume, so the sheet says the
       thing up front rather than only after a tap. */
    if (model.restFood === 0 && model.actions.some(function (a) { return a.k === 'rest' && a.disabled; })) {
      note(root, 'You have no cooked food left — the Hearth cannot heal you. Cook or buy some, or wait '
        + restWaitText(moment) + '.', 'bad');
    }
    /* ── THE LIVE COUNTDOWN (First-Night Idle Rescue) ────────────────────
       Redrawn from the SERVER's absolute instant every second — it subtracts,
       it never decrements a stored number, so a reload, a tab switch or a
       suspended machine all produce the right answer with no reconciliation.
       The interval clears itself the moment the line passes (and `close()`
       clears it too), because a timer that outlives its sheet is the class of
       leak this file has no other instance of. */
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null; }
    /* ── THE WATCH (attended-death P0, 2026-09-06) ─────────────────────
       ONE 1 Hz timer with two jobs, because they are the same job: draw the
       countdown from the SERVER's absolute instant, and notice when that
       instant (or the phase) changes because an envelope landed. The sheet
       opens on an attended death BEFORE the fall has been priced — the server
       floor is 60 s — so a sheet that only counted down would be frozen on
       "Asking the hearth" for the rest of its life, which is the same defect as
       the invented timer it replaces, wearing honest words.

       It compares only the two cheap server reads and rebuilds the whole moment
       exactly when one of them moved; `render` clears this handle on entry, so
       the re-render owns the next tick and there is never a second timer. */
    /* WHAT IS CURRENTLY ON SCREEN, at module scope so the ENVELOPE can compare
       against it too (see syncToServer). A per-render closure variable made the
       poll the only thing that could ever notice a phase change. */
    shown = { info: info, phase: model.fallPhase || '',
      until: Number(moment && moment.recoveringUntilMs) || 0 };
    countdownTimer = setInterval(function () {
      var el = document.getElementById(ROOT_ID);
      if (!el || !el.classList.contains('show')) { clearInterval(countdownTimer); countdownTimer = null; return; }
      if (syncToServer()) return;
      var lead = el.querySelector('.hr-death-lead');
      if (!lead) { clearInterval(countdownTimer); countdownTimer = null; return; }
      if (!(shown && shown.until > 0)) return;     // nothing to count down
      var left = shown.until - Date.now();
      /* ONE DECISION, IN ONE PLACE (see `leadTick`). This line is the whole of
         what the tick writes; everything it could have opinions about lives in
         a function the suite can call without a clock. */
      lead.textContent = leadTick(model, left);
      /* THE HEADLINE FOLLOWS THE LEAD ONLY WHEN THE FIGHT ACTUALLY RESUMES. A
         retreat keeps "You pulled back" for ever: the clock ran out, the run
         did not come back with it. */
      if (model.retreat || left > 0) return;
      var h2 = el.querySelector('.hr-death-top h2');
      if (h2) h2.textContent = model.title === 'Knocked out' ? 'Back up' : model.title;
    }, 1000);
    root.classList.add('show');
    return root;
  }

  /* The countdown's handle. Module-scope so `close()` can clear a timer the
     renderer started, which is the only way to guarantee one sheet's timer
     cannot outlive it into the next. */
  var countdownTimer = null;

  /* WHAT THE OPEN SHEET IS A VIEW OF: the engine's death info plus the two
     server-stated facts it was drawn from. Module-scope, and the reason is the
     bug this pair of lines closes. */
  var shown = null;

  /* ── THE PHASE CHANGE IS AN EVENT, NOT A POLL (P1, measured live on b513) ──
     MEASURED: the b512 re-ask worked — `fallState()` answered
     `{phase:'recovering', msLeft:1007205}` — and the sheet went on reading
     "Asking the hearth how long you are down" with the countdown never
     starting. The model was right; only the SCREEN was stale.

     WHY. The re-render lived exclusively inside the 1 Hz `setInterval` above,
     and a timer is precisely the thing that stops being 1 Hz: Chrome throttles
     timers in a background or occluded tab to once a second, and to once a
     MINUTE after five minutes hidden. Every other surface in this file is
     server-truth-derived and correct at the instant it is asked; the only
     broken link was WHEN it was asked. `hearthrise:fall` already fires
     synchronously out of applyEnvelopeState on every envelope (accrue.js), and
     a network response is not throttled — so the answer arrives with its own
     trigger and the poll goes back to being what it says it is, a ticker for
     the seconds digit.

     Idempotent by construction: it re-renders only when a server-stated fact
     has actually moved away from what is on screen, so firing it on every
     envelope costs one cheap read. */
  function syncToServer() {
    var el = document.getElementById(ROOT_ID);
    if (!el || !el.classList.contains('show') || !shown) return false;
    var now = serverFall();
    if (!((now.phase && now.phase !== shown.phase) || now.until !== shown.until)) return false;
    var next = readMoment(shown.info);
    render(describeDeath(next), next, shown.info);
    return true;
  }

  function nav(tab) {
    if (typeof window.showTab === 'function') window.showTab(tab);
  }

  /* Write the refusal line inside the sticky action bar. `root` may be the sheet
     or absent (a closed sheet) — writing to a sheet that is gone is a no-op, not
     a throw, because every caller is inside a promise the player cannot see. */
  function note(root, text, tone) {
    try {
      var el = (root || document.getElementById(ROOT_ID));
      el = el && el.querySelector('[data-note]');
      if (!el) return;
      el.textContent = String(text == null ? '' : text);
      el.setAttribute('data-tone', tone || '');
    } catch (e) {}
  }

  /* "3 min" — how long the floor still has to run, for the sentence that tells a
     foodless player what their OTHER option is. Read from the SERVER's absolute
     instant (the same one the countdown uses); never invented. */
  function restWaitText(moment) {
    var left = Math.max(0, (Number(moment && moment.recoveringUntilMs) || 0) - Date.now());
    if (!(left > 0)) return 'a moment';
    return Math.max(1, Math.ceil(left / 60000)) + ' min';
  }

  /* ── EVERY hr_rest REFUSAL, BY REASON (b510 P0) ───────────────────────────
     MEASURED LIVE: `hr_rest` answered 200 `{ok:false, error:'insufficient_food',
     need_hp:7, covered_hp:0}`; the sheet had ALREADY closed itself and navigated
     away, so the player saw nothing at all and stayed knocked out with no idea
     why. A refusal the player cannot see is indistinguishable from a broken
     button. Every branch names what happened AND states that nothing was eaten,
     because "did that cost me a meal?" is the first question a refusal raises. */
  function restRefusalText(r, moment) {
    var err = (r && r.error) || 'unknown';
    if (err === 'insufficient_food') {
      return 'You have no cooked food left — the Hearth cannot heal you. Cook or buy some, or wait '
        + restWaitText(moment) + '. Nothing was eaten.';
    }
    if (err === 'not_recovering') return 'You are already back on your feet — there is nothing to rest off.';
    if (err === 'not_hurt') return 'You are at full health — there is nothing to heal.';
    if (err === 'collect_first') return 'Your run is still settling — try Rest again in a moment. Nothing was eaten.';
    if (err === 'rate_limited') return 'You have rested too many times in a row — wait a minute and try again. Nothing was eaten.';
    if (err === 'not_signed_in') return 'You are signed out — sign back in to rest. Nothing was eaten.';
    if (err === 'network' || err === 'no_config' || err === 'unsent' || err === 'bad_response') {
      return 'The Hearth could not be reached. Nothing was eaten — try again in a moment.';
    }
    if (err === 'rpc_missing') return 'Resting is not available on this server yet. Nothing was eaten.';
    return 'The Hearth turned you away (' + err + '). Nothing was eaten.';
  }

  function act(kind, moment, btn) {
    /* REST IS THE ONE ACTION THAT DOES NOT CLOSE FIRST. It is a server call that
       can be REFUSED, and the sheet is the only surface that can say so — closing
       before the answer is what made the live refusal silent. Every other action
       is a navigation and closes immediately, exactly as before. */
    if (kind !== 'rest') close();
    try {
      if (kind === 'again' && moment && moment.monsterId && typeof window.startCombat === 'function') {
        window.startCombat(moment.monsterId);
        return;
      }
      /* The Bounty Shop is a card on the `bounty` panel, not the gem store —
         Auto-Eat is bought with Marks (legacy.js injectBountyPanel). */
      if (kind === 'shop') { nav('bounty'); return; }
      /* b526: the Supplies counter, not the gem store — Cooked Shrimp is a
         GOLD offer (`seed.cooked_shrimp`). The tab is selected before the nav
         so the panel paints on the right sub-tab in one frame; `setShopTab`
         is a legacy global and its absence must not swallow the navigation,
         which is the part the player actually asked for. */
      if (kind === 'foodshop') {
        try { if (typeof window.setShopTab === 'function') window.setShopTab('seeds'); } catch (e) {}
        nav('shop');
        return;
      }
      /* ── REST AT THE HEARTH (rev. 2, N1) ────────────────────────────────
         One call to the SERVER, which owns every number in it: which
         provisions are eligible (hr_items.auto_eatable), how much each heals,
         how many the bag holds, how much health is missing, and the clock. The
         client sends a slot and a fresh idempotency key and NOTHING else —
         there is no quantity and no item id in the signature, so there is no
         client value to distrust and a double tap eats one meal.
         Delegated to the RPC transport (src/net/goal-claim.js), which owns the
         endpoint, the slot resolution and the settle-first ladder; this file
         must not grow a second one. */
      if (kind === 'rest') {
        var root = document.getElementById(ROOT_ID);
        var GC = window.HearthriseGoalClaim;
        if (!GC || typeof GC.rest !== 'function') {
          note(root, 'Resting is not available right now. Nothing was eaten.', 'bad');
          return;
        }
        /* In flight: the button cannot be tapped twice (the retry ladder inside
           rest() runs for up to 19 s) and the player is told the call is live. */
        if (btn) { btn.disabled = true; btn.textContent = 'Resting…'; }
        note(root, 'Asking the Hearth…', '');
        var label = btn ? btn.getAttribute('data-label') : null;
        GC.rest().then(function (r) {
          if (r && r.ok === true) {
            /* SUCCESS CLOSES IT, and clears the client's reading of the recovery
               line from the SERVER's own fresh envelope rather than by zeroing a
               local flag — `recovering_until` is server-owned and this client
               never authors it (accrue.js). `clearFall` retires the unanswered
               fall so the 1 Hz watch cannot re-open the sheet behind us. */
            try {
              var AC = window.HearthriseAccrual;
              var G = window.G;
              if (AC && G && r.state && typeof r.state === 'object'
                  && typeof AC.applyEnvelopeState === 'function') AC.applyEnvelopeState(G, r);
              if (AC && typeof AC.clearFall === 'function') AC.clearFall();
            } catch (e) {}
            close();
            if (typeof window.notify === 'function') {
              window.notify('You ate your way back to full — the timer is cleared.', 'good');
            }
            nav('combat');
            return;
          }
          /* REFUSED — the sheet STAYS OPEN and says why. */
          if (btn) { btn.disabled = false; btn.textContent = label || 'Rest at the Hearth'; }
          note(document.getElementById(ROOT_ID), restRefusalText(r, moment), 'bad');
        }).catch(function () {
          if (btn) { btn.disabled = false; btn.textContent = label || 'Rest at the Hearth'; }
          note(document.getElementById(ROOT_ID),
            'The Hearth could not be reached. Nothing was eaten — try again in a moment.', 'bad');
        });
        return;
      }
      /* ── THE ONE TAP (ruling 2b condition 3) ────────────────────────────
         Through `HearthriseAuto.setEat` and nothing else: it is the declared
         ONE WRITER of the eat config (b326/b329), it persists itself, and
         since the 2b arm it is also what pushes the switch to the server —
         so this single call fixes the next fight AND the next night. Writing
         `G.autoActions` here would fix neither and would be the second writer
         that whole comment block exists to prevent.
         The player is then dropped on Combat like every other exit, having
         been told what changed. */
      if (kind === 'autoeat') {
        try {
          var A = window.HearthriseAuto;
          if (A && typeof A.setEat === 'function') {
            A.setEat({ enabled: true });
            if (typeof window.notify === 'function') {
              window.notify('Auto-Eat is back on — it will feed you below a quarter health.', 'good');
            }
          }
        } catch (e) { /* a dead sheet must never trap the player behind it */ }
        nav('combat');
        return;
      }
      /* 'table' and every fallback land on Combat, which is where stopCombat()
         already left them — the difference is that they arrive having been
         told why. */
      nav('combat');
    } catch (e) { /* a dead sheet must never trap the player behind it */ }
  }

  /**
   * The one entry point the engine calls. `ctx`/`info` are combat-sim's.
   * Returns the model it rendered, or null when it declined (away death,
   * or a headless/harness context with no body yet).
   */
  /* ── ANSWER A TAP THAT WAS REFUSED — AND VERIFY THE ANSWER LANDED ────────
     MEASURED LIVE (b524, QA account): knocked out, the player tapped a fishing
     spot and NOTHING happened — no run, no sheet, no line. The recovery gate
     was working perfectly; the ANSWER was swallowed, because the caller invoked
     `show()` inside a bare `try{}catch(e){}`, and any throw — or any state in
     which the sheet is built but never reaches the glass — turned a deliberate
     refusal into a dead tap. That is indistinguishable from the game losing the
     input, and it is a WORSE bug report than the refusal it hid.

     So the answer is VERIFIED rather than attempted, and it lives HERE rather
     than in the caller for one reason: only this module knows what "a sheet is
     up" means. `show()` returns a MODEL, which is not the same fact. `notify`
     is the floor and it is tried SEPARATELY — the two are independent failure
     modes, and collapsing them is how the first one got away with it.

     Returns true if the player was told something. Never throws: every caller
     is a tap handler or a network answer nobody is watching. */
  function isOpen() {
    try {
      var el = document.getElementById(ROOT_ID);
      return !!(el && el.classList && el.classList.contains('show'));
    } catch (e) { return false; }
  }

  function answerTap(why) {
    try { show(null, null); } catch (e) {}
    if (isOpen()) return true;
    try {
      if (typeof window.notify === 'function') { window.notify(why, 'kill'); return true; }
    } catch (e) {}
    try { console.warn('[recovery] refused a tap and had no surface to say so'); } catch (e) {}
    return false;
  }

  function show(ctx, info) {
    if (ctx && ctx.away) return null;                     // the welcome-back receipt owns this
    if (!document || !document.body) return null;
    var moment = readMoment(info);
    var model = describeDeath(moment);
    /* `info` is carried through so the watch can rebuild the moment when the
       server answers — the engine's death info does not change, only the
       server's reading of it does. */
    render(model, moment, info);
    return model;
  }

  /* ════════════════════════════════════════════════════════════
     4 · THE BOOT RAISE (2026-09-06, measured live on b510)
     ────────────────────────────────────────────────────────────
     A knockout OUTLIVES the tab. `show()` is called from the fall moment in the
     live tick, so a player who reloads while `recovering_until` is 27 minutes
     ahead used to land on a normal "Fighting Goblin" bar with nothing on screen
     saying that nothing earns until it passes. The data was always right — the
     TRIGGER was missing.

     ONCE PER RECOVERY WINDOW, keyed on the server's absolute instant. Every
     envelope announces the fall state, and settles are frequent, so a raise per
     announcement would re-open a sheet the player has just dismissed. The
     instant IS the identity of the window: a new knockout stamps a new
     `recovering_until`, so a later fall raises again with no extra state, and a
     dismissal (or a Rest that clears the line) is remembered for exactly as
     long as the window it belongs to. Deliberately NOT persisted — it is a
     within-session courtesy, and a reload should re-state a knockout the player
     is still in.
     ⚠ The mark is set BEFORE the sheet opens and also when one is already
       showing, so an exception in `show()` cannot turn this into a loop. */
  var raisedForUntil = 0;
  /* The window the PLAYER closed, kept apart from the one this module opened —
     see close(). A reset of the raise latch must not resurrect a dismissal. */
  var dismissedUntil = 0;

  function maybeRaiseRecovery() {
    var f = serverFall();
    /* NO CURRENT WINDOW, NO SHEET. `recovering` with an instant still ahead of
       the clock is the only state this raise exists for. `up` and `unconfirmed`
       mean nobody is down; `pending` belongs to the fall moment in the live
       tick, which opens its own sheet with the run's own detail on it; and an
       `until` the clock has passed is a knockout that is over. */
    if (f.phase !== 'recovering' || !(f.until > Date.now())) return false;
    if (raisedForUntil === f.until || dismissedUntil === f.until) return false;
    raisedForUntil = f.until;
    var el = document.getElementById(ROOT_ID);
    if (el && el.classList.contains('show')) return false;   // the watch is already on it
    return !!show(null, null);
  }

  /* See the export note below for why this exists. */
  function __resetForTest() {
    close();
    raisedForUntil = 0;
    dismissedUntil = 0;
    try {
      var AC = window.HearthriseAccrual;
      /* The pending fall, and the re-ask timer it owns. */
      if (AC && typeof AC.clearFall === 'function') AC.clearFall();
      /* The recovery line is SERVER-OWNED and has no client setter by design
         (RECOVER-8 pins the absence of one), so it is retired the only way this
         client is allowed to retire it: an envelope that states the character
         is up. That dispatches `hearthrise:fall`, which is why the sheet is put
         away once more below. */
      if (AC && typeof AC.applyEnvelopeState === 'function') {
        AC.applyEnvelopeState(window.G || {}, { state: { recovering_until: null } });
      }
    } catch (e) {}
    close();
    raisedForUntil = 0;
    dismissedUntil = 0;
  }

  try {
    window.addEventListener('hearthrise:fall', function () {
      /* RAISE FIRST, THEN SYNC, and the order matters: `maybeRaiseRecovery`
         claims the window (`raisedForUntil`) even when a sheet is already open,
         so a sheet the player later dismisses is not re-raised by the next
         envelope of the same knockout. It opens a sheet only when there is
         none; `syncToServer` then finds nothing to do. */
      try { maybeRaiseRecovery(); } catch (e) {}
      try { syncToServer(); } catch (e) {}
    });
  } catch (e) {}

  window.HearthriseDeathSheet = {
    /* THE SHARED RECOVERY SENTENCE. src/features/home-dashboard.js renders the
       away card's clock note with this exact function so the two surfaces
       cannot word one fact two ways (Designer ruling, 2026-09-07). Exported
       beside the model rather than hidden behind it: it is copy, and copy that
       two files depend on is API. */
    stillRecovering: stillRecovering,
    /* THE 1 Hz TICK'S DECISION, as a pure function. A test seam and nothing
       else: the renderer is the only production caller. It exists because the
       branch it replaces was unreachable from any test (see leadTick). */
    __leadTick: leadTick,
    describeDeath: describeDeath,
    show: show,
    answerTap: answerTap,
    maybeRaiseRecovery: maybeRaiseRecovery,
    /* Clears the RAISE latch only, and that restriction is the fix: the
       dismissal is a separate fact (see close()) precisely so that re-arming
       the announcement cannot resurrect a sheet the player has put away while
       the same knockout is still running. Use `__resetForTest` below to retire
       a fall outright. */
    _resetRaise: function () { raisedForUntil = 0; },
    /* ── ONE TEARDOWN FOR EVERY FIXTURE THAT STATES A FALL ────────────────
       A test that puts this sheet on screen and does not take it off hands
       every later test a FULL-SCREEN overlay, and the failure then lands
       wherever the next hit-test happens to be — thousands of lines away,
       intermittently, reporting a row of this sheet as "something is covering
       the buy control" (measured: b221's shop scene, `COVER=<span>.hr-death-t`).
       Closing is only half of the job: the client's pending fall and the
       server's recovery line are what raise it AGAIN on the next envelope, and
       the raise latch that would have refused that is exactly what a bare
       `_resetRaise()` teardown clears. So the four facts are retired together,
       here, or they are not retired at all. */
    __resetForTest: __resetForTest,
    close: close,
    _readMoment: readMoment,
    _syncToServer: syncToServer,
    _bestProvision: bestProvision,
    _ateThisFight: ateThisFight,
    _restRefusalText: restRefusalText,
    _act: act,
    /* TEST SEAM. `show()` reads the LIVE G/accrual to build its moment, which a
       suite cannot put into a knocked-out-with-food state without stubbing half
       the engine. Rendering a hand-built model is the same code path from the
       DOM down — the part the rest-refusal contract lives in. */
    _render: function (model, moment) { return render(model, moment, null); },
    _TIP_KEYS: ['food-unused', 'auto-eat-idle', 'no-food', 'outmatched']
  };
})();
