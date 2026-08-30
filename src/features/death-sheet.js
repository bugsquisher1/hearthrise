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
     now universal while the client's live-combat switch
     (`G.autoActions.eat.enabled`, and `maybeAutoEat`'s real gate) still starts
     OFF. Keyed on ownership, `auto-eat-idle` would tell every new player with
     an empty bag that "Auto-Eat is watching your health" when nothing is —
     precisely the class of lie the F7/b432 audit built this sheet to remove.
     So the ACTIVE branch keys on `autoEatOn` (the switch) and the OFFER copy
     keys on `autoEatOwned` (the entitlement). Two facts, two fields.

     `tip` is copy. `tipKey` is the STATED branch, so the suite asserts the
     rule rather than a sentence somebody may reword. */
  var TIPS = {
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
      var closer = d.autoEatOwned
        ? (d.autoEatOn
          ? ' Auto-Eat is on, but it only fires below a quarter health and ' + d.monsterName +
            ' closed that gap in one blow — eat sooner, or raise the trigger point with Auto-Eat II.'
          : ' You already have Auto-Eat — switch it on in Settings → Gameplay and it feeds you' +
            ' below a quarter health, including while you are away.')
        : later;
      return 'You were carrying ' + carried + ' and never ate ' +
        (d.foodQty === 1 ? 'it' : 'one') + '. Press Eat beside your champion during a fight.' +
        closer;
    },
    'auto-eat-idle': function () {
      return 'Auto-Eat is watching your health, but your bag had no provisions left to eat. ' +
        'Cook or buy food before the next fight and it will do the rest.';
    },
    'no-food': function () {
      return 'You went in with no provisions. Cook something at the fire — even a Shrimp buys ' +
        'you another few swings — and press Eat when your health runs low.';
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
   * @returns {{title,lead,rows:Array,tipKey:string,tip:string,actions:Array}}
   */
  function describeDeath(d) {
    d = d || {};
    var monsterName = String(d.monsterName || '').trim();
    var foodQty = Math.max(0, Number(d.foodQty) || 0);
    var foodName = String(d.foodName || 'provision');
    var ate = Math.max(0, Number(d.ateThisFight) || 0);
    var kills = Math.max(0, Number(d.killsThisFoe) || 0);
    var maxHp = Math.max(1, Number(d.maxHp) || 1);
    var deaths = Math.max(1, Number(d.deaths) || 1);

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
    rows.push({ g: 'uiHeart', tone: 'ok', k: 'healed', t: 'Health fully restored', v: maxHp + ' / ' + maxHp });
    /* What dying ACTUALLY costs, stated where the player can see it rather
       than discovered later as a missing number. */
    rows.push({ g: 'uiHourglass', tone: 'bad', k: 'run-stopped', t: 'Your run stopped — nothing earns while you are idle', v: 'idle' });
    if (d.streakBroken) {
      rows.push({ g: 'uiTarget', tone: 'bad', k: 'streak', t: 'Bounty streak reset to 0', v: 'streak' });
    }

    return {
      title: monsterName ? 'The ' + monsterName + ' got you' : 'You fell',
      lead: deaths === 1
        ? 'Your first fall. Nothing is lost but the run — here is what happened.'
        : 'Here is what happened.',
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
      actions: [
        { k: 'again', label: monsterName ? 'Fight ' + monsterName + ' again' : 'Fight again', primary: true },
        { k: 'table', label: 'Back to the War Table' }
      ]
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
      autoEatOwned: !!(G.traits && G.traits.auto_eat),
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
      deaths: (G.stats && G.stats.deaths) || 1
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
      '.hr-death-tip b{display:block;color:var(--gold-2,#c9a24a);font-size:calc(13px * var(--ui-scale,1));',
      '  letter-spacing:.09em;text-transform:uppercase;margin-bottom:4px}',
      /* display:block — as an inline button it wrapped onto the tail of the
         tip paragraph ("…think about it again.Open the Bounty Shop"), which
         read as a run-on sentence rather than an action. Verified in browser. */
      '.hr-death-shop{display:block;background:none;border:0;padding:0;margin-top:8px;font:inherit;text-align:left;',
      '  font-size:calc(14px * var(--ui-scale,1));color:var(--gold-2,#c9a24a);',
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
    var el = document.getElementById(ROOT_ID);
    if (el) el.classList.remove('show');
  }

  function render(model, moment) {
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
        '</div>' +
        '<div class="hr-death-acts">' +
          model.actions.map(function (a) {
            return '<button class="btn' + (a.primary ? ' btn-primary' : '') + '" data-act="' + a.k + '">' +
              esc(a.label) + '</button>';
          }).join('') +
        '</div>' +
      '</div>';

    root.querySelectorAll('[data-act]').forEach(function (b) {
      b.onclick = function () { act(b.getAttribute('data-act'), moment); };
    });
    root.classList.add('show');
    return root;
  }

  function nav(tab) {
    if (typeof window.showTab === 'function') window.showTab(tab);
  }

  function act(kind, moment) {
    close();
    try {
      if (kind === 'again' && moment && moment.monsterId && typeof window.startCombat === 'function') {
        window.startCombat(moment.monsterId);
        return;
      }
      /* The Bounty Shop is a card on the `bounty` panel, not the gem store —
         Auto-Eat is bought with Marks (legacy.js injectBountyPanel). */
      if (kind === 'shop') { nav('bounty'); return; }
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
  function show(ctx, info) {
    if (ctx && ctx.away) return null;                     // the welcome-back receipt owns this
    if (!document || !document.body) return null;
    var moment = readMoment(info);
    var model = describeDeath(moment);
    render(model, moment);
    return model;
  }

  window.HearthriseDeathSheet = {
    describeDeath: describeDeath,
    show: show,
    close: close,
    _readMoment: readMoment,
    _bestProvision: bestProvision,
    _ateThisFight: ateThisFight,
    _TIP_KEYS: ['food-unused', 'auto-eat-idle', 'no-food', 'outmatched']
  };
})();
