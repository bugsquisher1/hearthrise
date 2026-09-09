// ============================================================
// src/render/fight-warning.js — the pre-fight warning's WORDS (render layer)
//
// Render-layer extraction out of src/legacy.js, following the playbook in
// docs/design/render-extraction-pattern.md.
//
// WHAT THIS IS: the copy half of the advisory pre-fight warning (Recovery Rule
// rev. 3, item 7). It takes a warning KIND and a forecast that src/core has
// already produced and returns {title, body} — nothing else. It reads no
// globals, runs no simulation, decides nothing about whether a player may
// fight, and writes no state.
//
// WHY IT IS SPLIT HERE. The DECISION is the simulation's
// (`forecastFight`/`forecastWarning` in src/core/combat-sim.js — a closed-form
// estimate would be a second combat model, which AWAY-12 forbids); the CONTEXT
// assembly is glue and stays in legacy.js beside the gear and style it reads.
// What is left is a sentence, and a sentence is presentation. Keeping it here
// means the copy can be quoted by the suite without booting a dialog.
//
// PURE. No DOM, no window reads, no timers, no randomness.
// ============================================================
(function () {
  'use strict';

  /* MEASURED, NOT ESTIMATED — `firstDeathMs` is the simulation's own deathLog
     instant. Rounded to a human number because quoting "about 37.4 seconds"
     claims a precision a seeded forecast does not have, and the singular is
     spelled out because "about 1 minutes" is the first thing a player notices
     and the last thing they trust afterwards. Returns null when the forecast
     never fell, so the caller omits the clause rather than guessing one. */
  function whenClause(ms) {
    var n = Number(ms);
    if (!isFinite(n) || n <= 0) return null;
    if (n < 60000) return 'about ' + Math.max(5, Math.round(n / 5000) * 5) + ' seconds';
    if (n < 90000) return 'in about a minute';
    return 'about ' + Math.round(n / 60000) + ' minutes';
  }

  /* @param kind      the forecast's verdict (FORECAST_WARNING.*)
     @param noFood    true when `kind` is the no-food verdict; the caller owns
                      the comparison so this module needs no core import.
     @param foeName   the monster's display name.
     @param firstDeathMs the simulation's own fall instant, or null.
     @returns {title, body} — never null; the caller decides whether to speak. */
  function copy(kind, noFood, foeName, firstDeathMs) {
    var foe = 'A ' + foeName;
    if (noFood) {
      var when = whenClause(firstDeathMs);
      var clause = when ? (when === 'in about a minute' ? (' ' + when) : (' in ' + when)) : '';
      return { kind: kind, title: 'No food in your bag',
        body: 'You have no food. ' + foe + ' will put you down' + clause
          + ', and every fall today costs longer to shake off.' };
    }
    return { kind: kind, title: 'Out of your league',
      body: foe + ' would take you down before you took it down. Come back with better gear '
        + 'or a few more levels.' };
  }

  /* THE PRE-FIGHT WARNING - "NEVER REFUSE A FIGHT, WARN ONCE."
     Refusing an overmatched fight was REJECTED by name as the residue-ahead
     class: beating something you should not be able to beat is a reward, and a
     client that decides a player may not try has taken an authority it does not
     own. So this is ADVISORY, the DEFAULT button is "Fight anyway", the server
     never reads it and no state is written.
     THE FORECAST IS THE SIMULATION, not a DPS formula - `forecastFight` runs
     `simulateSpan` on a deep clone with a fixed seed. A closed-form estimate
     would be a SECOND combat model, which AWAY-12 forbids, and it would be wrong
     in exactly the ways the real loop is subtle: crits, accuracy, auto-eat, ammo,
     the weakness multiplier, the Boss of the Day.
     WARN ONCE PER MONSTER ID PER TAB SESSION - per FOE, not per foe-and-kind: a
     modal on every re-tap trains the player to dismiss it without reading, which
     is the same as not warning. `hrClearFightWarnings` is the suite's teardown
     seam and has no production caller. */
  let _fightWarned=Object.create(null);
  function hrClearFightWarnings(){ _fightWarned=Object.create(null); }
  /* Returns {kind,title,body} or null. PURE apart from the forecast it runs; the
     caller owns the latch, so the suite can ask the question repeatedly. */
  function hrPreFightWarning(mId){
    const C=window.HearthriseCore;
    const CS=C&&C.combatSim;
    if(!CS||typeof CS.forecastFight!=='function'||typeof CS.forecastWarning!=='function')return null;
    const m=(window.MONSTERS||{})[mId];
    if(!m)return null;
    let f=null;
    try{
      /* The LIVE ctx, so the forecast fights with the gear, style, perks and
         featured boss the next half hour would actually have. `forecastFight`
         replaces the rng, the window and the effect sink itself — see its header
         — so nothing the client owns can leak a side effect into it. */
      const ctx=window.combatSimCtx();
      ctx.away=false;
      let eat=null;
      try{ const A=window.HearthriseAuto; if(A&&typeof A.getEat==='function') eat=A.getEat(); }catch(e){}
      let owned=false;
      try{
        const AE=C&&C.autoEat;
        owned=(AE&&typeof AE.autoEatTier==='function')?AE.autoEatTier(window.G.traits||{})>0
                                                      :!!(window.G.traits&&window.G.traits.auto_eat);
      }catch(e){}
      let thr;
      try{ thr=(typeof window.eatThreshold==='function')?window.eatThreshold():undefined; }catch(e){}
      f=CS.forecastFight(window.G,ctx,{
        monsterId:mId,
        autoEat:{ enabled:!!(eat&&eat.enabled), owned:owned,
                  threshold:thr, foodId:eat?eat.foodId:null },
      });
    }catch(e){ return null; }   /* a forecast that throws must never block a fight */
    const kind=CS.forecastWarning(f);
    if(!kind)return null;
    const W=CS.FORECAST_WARNING||{};
    return copy(kind, kind===W.NO_FOOD, m.name, f&&f.firstDeathMs);
  }
  window.__hrPreFightWarning=hrPreFightWarning;          // test seam (FORECAST-COPY)
  window.__hrClearFightWarnings=hrClearFightWarnings;    // test seam

  /* THE FOUR SUPPRESSIONS. `hrPreFightWarning` decides whether there is anything
     to SAY; this decides whether the player is in a position to be told it. Each
     is here because speaking would cost the player something:
       A FIGHT IS ALREADY RUNNING - the tap is a SWITCH, and a dialog would
         interrupt the very run it was trying to protect.
       THE BAG HAS FOOD - this exists for the empty-bag population. A fed hero who
         is outmatched finds out by fighting, which is the reward the ruling
         refused by name to take away.
       ALREADY WARNED ABOUT THIS FOE THIS TAB SESSION - the latch above.
     `awayHadFood()` RETURNS `undefined` WHEN CORE IS NOT UP, and the test is
       `=== true` on purpose: "we could not ask" is not "the bag has food". It is
       the same `chooseFood` the simulation and the away receipt use, so the
       warning and the night cannot disagree about provisions.
       KNOCKED OUT - THERE IS NO FIGHT TO WARN ABOUT (b523, measured live on
         b522, QA account 2026-09-08 23:30 UTC: a plain page reload while the
         server held `recovering_until` 31 minutes ahead put "No food in your
         bag - a Goblin will put you down in about 55 seconds" over the
         knocked-out sheet, with no tap behind it). While the server refuses
         combat (rev. 3, 2026-09-08) there is nothing for the advisory to delay: a
         warning is about the fight the next tap starts, and the next tap
         cannot start one for half an hour. Worse than noise - the once-per-foe
         latch is spent, so the warning the player IS owed, on the tap they
         eventually make, never comes. The knocked-out sheet is the only
         surface that owns this fact (b520). `hrCombatDownPeek` is the
         side-effect-free read: `hrCombatDown` owns the stand-up transition and
         a gate must never fire it. Missing (core not up) reads as "up", which
         degrades to today's behaviour rather than swallowing warnings. */
  function hrFightGate(mId){
    if(window.G.activeMonster)return null;
    if(typeof window.hrCombatDownPeek==='function'&&window.hrCombatDownPeek())return null;
    if(_fightWarned[mId])return null;
    if(window.awayHadFood()===true)return null;
    return hrPreFightWarning(mId);
  }
  window.__hrFightGate=hrFightGate;                      // test seam (RETREAT-A5)

  /* RAISE IT, AND TREAT EVERY EXIT AS "FIGHT ANYWAY". Returns TRUE when the
     modal is up and owns the fight; FALSE when it could not be raised, in which
     case the caller fights IMMEDIATELY - a warning may delay a tap, never eat one.
     `alert`, NOT `confirm`: every exit starts the fight, so a second "Not yet"
       button would be a control that does not do what its label says.
     HearthriseDialog, NEVER window.confirm - a native dialog blocks the main
       thread and has frozen this game twice; tests/native-dialog.mjs guards it. */
  function hrRaiseFightWarning(mId,w){
    /* THE TEST HARNESS IS ONE MORE DISMISSAL, which is the ruling's own framing
       and a strictly better rule than the blanket skip it replaces. A blocking
       modal has no meaning where nobody can answer it — MEASURED 2026-09-07: a
       foodless character in the in-page suite left `activeMonster` null AND a
       full-screen overlay over the game that nothing would ever answer, the b221
       cascade reached through a brand-new door. Under the harness the dialog is
       not raised and the fight starts SYNCHRONOUSLY, which is also what keeps
       `startCombat` synchronous for the thirty-odd suite callers. The coverage is
       not given up: RETREAT-A5 clears the flag itself and drives the real gate. */
    if(window.__HR_TEST_HARNESS__)return false;
    const D=window.HearthriseDialog;
    if(!D||typeof D.alert!=='function')return false;
    const go=function(){ try{ window.startCombat(mId,{confirmed:true}); }catch(e){} };
    try{
      const p=D.alert({ title:w.title, body:w.body, confirmLabel:'Fight anyway' });
      /* `then(go,go)` — a REJECTED promise is a dismissal too. This dialog never
         rejects today; relying on that is how the tap gets eaten the day it does. */
      if(p&&typeof p.then==='function'){ p.then(go,go); return true; }
      /* A non-thenable answer means the module answered synchronously. Still a
         dismissal, so the fight starts here and the caller must not start it
         again — hence TRUE. */
      go();
      return true;
    }catch(e){ return false; }
  }

  /* CONTRACT CHANGE, STATED BECAUSE IT IS NOT LOCAL. `startCombat(mId)` is
     CONDITIONALLY ASYNCHRONOUS: when the forecast has something to warn about it
     raises a dialog and returns WITHOUT setting `G.activeMonster`; the fight
     starts from the dialog, which re-enters with `{confirmed:true}`. That is
     correct for every production caller - all of them are player GESTURES, and a
     gesture is exactly when a player should be warned.
     AND IT IS NARROWLY BOUNDED, which is what makes the asynchrony safe:
     `hrFightGate` can only answer non-null on a tap that STARTS a fight rather
     than switching one, from an EMPTY bag, and is the FIRST tap on that foe this
     tab session. Every other call is synchronous exactly as before.
     THE GATE LIVES INSIDE THE ONE DOOR, not a second `startCombatWithWarning`
     wrapper: a second door is one somebody walks through by accident, and this
     warning must not be optional-by-omission. */
  window.HearthriseFightWarning = {
    copy: copy, whenClause: whenClause,
    warning: hrPreFightWarning, gate: hrFightGate, raise: hrRaiseFightWarning,
    clear: hrClearFightWarnings,
    markWarned: function (mId) { _fightWarned[mId] = true; },
  };

  console.log('Fight warning copy: loaded');
})();
