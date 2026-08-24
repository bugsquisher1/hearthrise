// ============================================================
// src/features/profile-launchpad.js
//
// Batch D (b138) — Profile launchpad. Four roadmap items:
//   #1 Resume last activity   — one-click "Continue [X]" card
//   #2 Today's progress       — XP/gold/kills/etc since local midnight
//   #3 Next milestone         — closest skill level-up or quest
//   #5 Editable display name  — inline rename on Profile
//
// Architecture-first per the engineering principles. ALL state goes
// through this module's API. Other code calls in; nothing pokes
// `G.lastActivity` or `G.daily.snapshot` directly.
//
// State touched (migration v4 → v5 fills these in for old saves):
//   G.lastActivity = {
//     kind: 'skill' | 'monster',
//     id:   <skill id or monster id>,
//     stoppedAt: <ms epoch>,
//   } | null
//
//   G.daily.snapshot = {
//     dayKey:        'Sun May 03 2026',         // matches G.daily.lastReset
//     xpTotal:       <sum of all skill XP at midnight>,
//     gold:          <G.gold at midnight>,
//     kills:         <G.stats.kills at midnight>,
//     gathered:      <G.stats.gathered at midnight>,
//     harvested:     <G.stats.harvested at midnight>,
//     deedsDropped:  <G.inventory.farm_deed at midnight>,  // approximate baseline
//   }
//
// Public API (window.HearthriseLaunchpad):
//   recordStop(kind, id)       — called from stopSkill / stopCombat
//   getResumePayload()         — { kind, id, label, icon, action } | null
//   resume()                   — invokes the action; returns true on success
//   ensureDailySnapshot()      — captures baseline at midnight rollover (idempotent)
//   getTodayDelta()            — { xpGained, goldEarned, kills, gathered, harvested, deedsDropped }
//   getNextMilestone()         — { kind, label, current, target, pct, icon, deepLink } | null
//   setDisplayName(newName)    — applies + persists + (later) Supabase sync
//   openRename()               — opens the in-game name modal (b373); the ONLY
//                                rename entry point. Never a native prompt().
// ============================================================

(function(){
  'use strict';

  // ── Daily snapshot ────────────────────────────────────────
  // Snapshots are keyed on the same dayString that generateDailyTasks
  // uses (`new Date().toDateString()`). When the day rolls, we capture
  // a fresh baseline so getTodayDelta() shows ONLY today's numbers.

  function todayKey(){ return new Date().toDateString(); }

  /* b431 — skill-xp READ accessor (src/net/skill-record.js), DORMANT no-op today;
     the ESM analogue of the b429 legacy skillXp() sweep. See activities-grid.js. */
  function srXpOf(id){
    var SR = window.HearthriseSkillRecord;
    if (SR && typeof SR.skillXpForDisplayOr === 'function') return SR.skillXpForDisplayOr(window.G, id, 0);
    return (SR && typeof SR.skillXpOr === 'function')
      ? SR.skillXpOr(window.G, id, 0)
      : ((window.G && window.G.skills && (window.G.skills[id] | 0)) || 0);
  }

  function totalXp(){
    if(!window.G || !window.G.skills) return 0;
    var sum = 0;
    var keys = Object.keys(window.G.skills);
    for(var i = 0; i < keys.length; i++) sum += (srXpOf(keys[i]) | 0);
    return sum;
  }

  function ensureDailySnapshot(){
    if(!window.G) return null;
    if(!window.G.daily) window.G.daily = { lastReset: null, tasks: [] };
    var key = todayKey();
    var snap = window.G.daily.snapshot;
    if(snap && snap.dayKey === key) return snap;
    // New day — capture baseline. Existing snapshot (if any) is replaced;
    // keeping yesterday's around isn't useful and bloats the save.
    var stats = (window.G.stats || {});
    var inv = (window.G.inventory || {});
    /* ⚠ A MIDNIGHT BASELINE MUST NOT BE TAKEN AGAINST AN UNKNOWN BALANCE.
       `window.G.gold | 0` recorded ZERO for a client that had simply not been
       told the balance yet, and `getTodayDelta` below then reports the FIRST
       ENVELOPE'S ENTIRE FORTUNE as "earned today". Two surfaces read that
       number. So the snapshot is not taken at all until the figure exists —
       it is re-attempted on the next call, which is every render. */
    if(typeof window.balKnown === 'function' && !window.balKnown('gold')) return null;
    var fresh = {
      dayKey: key,
      xpTotal:       totalXp(),
      gold:          (typeof window.balOr === 'function') ? window.balOr('gold', 0) : (window.G.gold | 0),
      kills:         stats.kills | 0,
      gathered:      stats.gathered | 0,
      harvested:     stats.harvested | 0,
      deedsDropped:  inv.farm_deed | 0,
      /* b228: renown joins the baseline so the Throne ladder can honestly say
         "+N renown today" off the SAME midnight rollover every other daily
         number uses, rather than inventing a second clock. Guarded: if the
         renown module has not booted yet the field is absent, and the ladder
         then prints no daily line at all rather than a wrong one. */
      renown:        (window.HearthriseRenown && typeof window.HearthriseRenown.effective === 'function')
                       ? window.HearthriseRenown.effective(window.G) : undefined,
    };
    window.G.daily.snapshot = fresh;
    if(typeof window.saveLocal === 'function'){
      try { window.saveLocal(); } catch(e){}
    }
    return fresh;
  }

  function getTodayDelta(){
    var snap = ensureDailySnapshot();
    if(!snap || !window.G){
      return { xpGained: 0, goldEarned: 0, kills: 0, gathered: 0, harvested: 0, deedsDropped: 0 };
    }
    var stats = (window.G.stats || {});
    var inv = (window.G.inventory || {});
    return {
      xpGained:     Math.max(0, totalXp()        - snap.xpTotal),
      /* No figure ⇒ no delta. `0` is "nothing to report", which is what every
         consumer of this already renders as an absent line. */
      goldEarned:   (typeof window.balNum === 'function' && window.balNum('gold') === null)
        ? 0 : Math.max(0, ((typeof window.balOr === 'function' ? window.balOr('gold', 0) : (window.G.gold|0))) - snap.gold),
      kills:        Math.max(0, (stats.kills|0)   - snap.kills),
      gathered:     Math.max(0, (stats.gathered|0)- snap.gathered),
      harvested:    Math.max(0, (stats.harvested|0)-snap.harvested),
      deedsDropped: Math.max(0, (inv.farm_deed|0) - snap.deedsDropped),
    };
  }

  // ── Resume last activity ──────────────────────────────────

  function recordStop(kind, id){
    if(!window.G) return;
    if(kind !== 'skill' && kind !== 'monster') return;
    if(!id) return;
    window.G.lastActivity = {
      kind: kind,
      id:   id,
      stoppedAt: Date.now(),
    };
    // Don't saveLocal here — stopSkill/stopCombat already trigger it via
    // their own flows + we don't want to spam disk on every click.
  }

  /* `icon` on every payload below is RENDERED HTML, not a character.
     It used to be `sd.icon || '📊'` / `m.icon || '⚔️'` — the data tables' emoji,
     handed to callers that innerHTML it straight into a 34px art slot. Every
     consumer already treats the field as markup, so the change is invisible to
     them and the emoji simply has nowhere left to enter from. */
  function _skillArt(id, px){
    return (typeof window.skillIconHTML === 'function')
      ? window.skillIconHTML(id, px || 30)
      : ((window.HR && window.HR.icon) ? (window.HR.icon('uiStar', px || 20, '--gold-2') || '') : '');
  }
  function _monArt(id, px){
    return (typeof window.monsterArt === 'function')
      ? window.monsterArt(id, px || 30)
      : ((window.HR && window.HR.icon) ? (window.HR.icon('uiSkull', px || 20, '--red') || '') : '');
  }
  function getResumePayload(){
    if(!window.G || !window.G.lastActivity) return null;
    // If something else is already running, hide the resume card — the
    // dash-active panel will show the live status anyway.
    if(window.G.activeSkill || window.G.activeMonster) return null;
    var la = window.G.lastActivity;
    if(la.kind === 'skill' && window.SKILLS_DEF && window.SKILLS_DEF[la.id]){
      var sd = window.SKILLS_DEF[la.id];
      return {
        kind: 'skill', id: la.id,
        label: 'Resume training: ' + sd.name,
        icon:  _skillArt(la.id, 30),
        action: function(){
          if(typeof window.showTab === 'function') window.showTab('skills');
          if(typeof window.openSkillDetail === 'function') window.openSkillDetail(la.id);
        },
      };
    }
    if(la.kind === 'monster' && window.MONSTERS && window.MONSTERS[la.id]){
      var m = window.MONSTERS[la.id];
      return {
        kind: 'monster', id: la.id,
        label: 'Resume fighting: ' + m.name,
        icon:  _monArt(la.id, 30),
        /* ⚠ b372 (F18): `startCombat` IS A TOGGLE — its first line is
           `if(G.activeMonster===mId){stopCombat();return;}`. The guard eight
           lines above is evaluated when the card is PAINTED, not when it is
           pressed, and the gap between those two instants is exactly where a
           fight arrives: the Home dashboard renders while idle, then the boot's
           `loadLocal()` re-arms the saved fight (or a server reconcile does),
           and the still-visible Resume button then STOPS the fight it offered to
           resume. That is the reported symptom verbatim — "a Resume chip
           appeared but did not resume" — and the button did exactly what it was
           told; it was told at the wrong time.
           Re-ask at CLICK time, and when the named foe is already live just take
           the player to it. Deliberately NOT `if activeMonster then return`: a
           DIFFERENT monster running is a real switch and startCombat's
           stop-then-start is the correct behaviour for it. */
        action: function(){
          if(window.G && window.G.activeMonster !== la.id
             && typeof window.startCombat === 'function') window.startCombat(la.id);
          if(typeof window.showTab === 'function') window.showTab('combat');
        },
      };
    }
    return null;
  }

  function resume(){
    var p = getResumePayload();
    if(!p) return false;
    try { p.action(); return true; } catch(e){ return false; }
  }

  // ── Next milestone ────────────────────────────────────────
  // Picks the single "closest to completion" target out of:
  //   - all skills (XP needed to next level)
  //   - all open quests (progress / goal)
  // Pct closeness is the comparison. Ties broken by lower XP-to-go.

  function getNextMilestone(){
    if(!window.G) return null;
    var best = null;

    // Skills — closest to next level
    if(window.G.skills && window.SKILLS_DEF
       && typeof window.levelFromXp === 'function'
       && typeof window.xpForLevel === 'function'){
      var skillIds = Object.keys(window.SKILLS_DEF);
      for(var i = 0; i < skillIds.length; i++){
        /* b227: `var sid` is FUNCTION-scoped, so every deepLink closure below
           shared one binding and read whatever the loop finished on — the last
           key in SKILLS_DEF, `bountyHunter`. Home's milestone "Train" button
           therefore opened the Bounty Hunter skill no matter which skill the
           milestone was actually about. Bind per iteration. */
        let sid = skillIds[i];
        var xp = srXpOf(sid) | 0;
        var lv = window.levelFromXp(xp);
        if(lv >= 99) continue; // maxed — no milestone
        var nextXp = window.xpForLevel(lv + 1);
        var prevXp = window.xpForLevel(lv);
        var pct = nextXp > prevXp ? (xp - prevXp) / (nextXp - prevXp) : 0;
        var cand = {
          kind: 'skill',
          label: (window.SKILLS_DEF[sid].name || sid) + ' Lv ' + lv + ' → ' + (lv + 1),
          current: xp - prevXp,
          target:  nextXp - prevXp,
          pct: Math.max(0, Math.min(1, pct)),
          icon: _skillArt(sid, 30),
          deepLink: function(){
            if(typeof window.showTab === 'function') window.showTab('skills');
            if(typeof window.openSkillDetail === 'function') window.openSkillDetail(sid);
          },
          _cmp: pct,
        };
        if(!best || cand._cmp > best._cmp) best = cand;
      }
    }

    // Quests — pick the closest open one. Daily tasks count too.
    var open = [];
    if(Array.isArray(window.G.quests)) open = open.concat(window.G.quests.filter(q => !q.done));
    if(window.G.daily && Array.isArray(window.G.daily.tasks))
      open = open.concat(window.G.daily.tasks.filter(t => !t.done));
    for(var j = 0; j < open.length; j++){
      let q = open[j];                       // per-iteration binding — see above
      if(!q.goal) continue;
      var pq = (q.progress || 0) / q.goal;
      /* b227 (audit finding #2): this deepLink opened the Quests modal, which
         does not contain `G.quests` / `G.daily.tasks` at all — the milestone
         said "Gather 50 resources" and its button opened a window listing
         three different quests. It now goes where the quest is PLAYED, via the
         one shared resolver. `goal` is carried on the milestone so the
         renderer can label the button with the same verb. */
      var qdest = (window.HearthriseQuestNav && window.HearthriseQuestNav.destination)
        ? window.HearthriseQuestNav.destination(q) : null;
      var qcand = {
        kind: 'quest',
        label: q.label || q.id,
        current: q.progress || 0,
        target: q.goal,
        pct: Math.max(0, Math.min(1, pq)),
        icon: (window.HR && window.HR.icon)
          ? (window.HR.icon(q.done ? 'uiCheck' : 'uiQuests', 30, q.done ? '--green' : '--gold-2') || '')
          : '',
        goal: q,
        verb: (qdest && qdest.verb) || 'Go',
        deepLink: function(){
          var QN = window.HearthriseQuestNav;
          if(QN && typeof QN.go === 'function'){ QN.go(q); return; }
          if(typeof window.openQuestsModal === 'function') window.openQuestsModal();
        },
        _cmp: pq,
      };
      if(!best || qcand._cmp > best._cmp) best = qcand;
    }

    if(!best) return null;
    delete best._cmp;
    return best;
  }

  // ── Display name ──────────────────────────────────────────

  function setDisplayName(newName){
    if(typeof newName !== 'string') return false;
    var trimmed = newName.trim().slice(0, 24);
    if(!trimmed) return false;
    if(!window.G) return false;
    window.G.playerName = trimmed;
    if(typeof window.updateTopbar === 'function') window.updateTopbar();
    if(typeof window.renderProfile === 'function') window.renderProfile();
    if(typeof window.saveLocal === 'function') {
      try { window.saveLocal(); } catch(e){}
    }
    // Future: sync to Supabase user_metadata.display_name when signed in.
    // For now, the legacy.js settings flow already handles cloud profile.
    return true;
  }

  /* ══════════════════════════════════════════════════════════════════════
     b373 — THE RENAME AFFORDANCE. NOT `window.prompt`.

     REPORTED LIVE (FTUE run 2, b372): clicking the rename pencil next to the
     character name hard-hung the renderer. `prompt()` is the last native
     BLOCKING dialog left on a player-reachable path after b371 removed the
     switch-slot `confirm()`, and it fails the same way: it stops every timer,
     tick, paint and input handler in the game for as long as it is up, and if
     it is never answered (suppressed by Chrome's "prevent additional dialogs",
     raised while the tab is not frontmost, or under automation) the tab is
     bricked with no self-recovery.

     Worse, the prompt path was ALSO wrong on the merits: it wrote the raw
     string through setDisplayName(), which is a LOCAL clamp-and-store. It
     never touched `claim_display_name`, so a rename bypassed the charset /
     reserved-word / profanity rules AND the uniqueness registry — two players
     could end up sharing a name, and a name the server would have rejected
     still shipped to chat, market and leaderboards.

     So this does not merely swap the dialog: it routes the rename onto the
     ONE existing, validated, server-authoritative path — identity.js's
     openNameModal(), the same modal first-run sign-in uses. Non-blocking,
     tokens only, live availability check, and adopt() writes G.playerName +
     saveLocal + refreshUi on success, which is exactly what the old call did
     by hand.

     No native fallback. If identity.js somehow is not loaded, we say so and
     do nothing — reintroducing prompt() as a "safety net" would reintroduce
     the freeze on precisely the degraded path least able to recover from it.
     ══════════════════════════════════════════════════════════════════════ */
  function openRename(){
    var ID = window.HearthriseIdentity;
    if(ID && typeof ID.openNameModal === 'function'){
      ID.openNameModal();
      return true;
    }
    if(typeof window.notify === 'function'){
      window.notify('The name editor is still loading — try again in a moment.', 'info');
    }
    return false;
  }

  // ── Public API ────────────────────────────────────────────
  window.HearthriseLaunchpad = {
    openRename: openRename,
    recordStop: recordStop,
    getResumePayload: getResumePayload,
    resume: resume,
    ensureDailySnapshot: ensureDailySnapshot,
    getTodayDelta: getTodayDelta,
    getNextMilestone: getNextMilestone,
    setDisplayName: setDisplayName,
    // Test hooks
    _todayKey: todayKey,
    _totalXp: totalXp,
  };

  console.log('[profile-launchpad] HearthriseLaunchpad API loaded');
})();
