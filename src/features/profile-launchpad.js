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
// ============================================================

(function(){
  'use strict';

  // ── Daily snapshot ────────────────────────────────────────
  // Snapshots are keyed on the same dayString that generateDailyTasks
  // uses (`new Date().toDateString()`). When the day rolls, we capture
  // a fresh baseline so getTodayDelta() shows ONLY today's numbers.

  function todayKey(){ return new Date().toDateString(); }

  function totalXp(){
    if(!window.G || !window.G.skills) return 0;
    var sum = 0;
    var keys = Object.keys(window.G.skills);
    for(var i = 0; i < keys.length; i++) sum += (window.G.skills[keys[i]] | 0);
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
    var fresh = {
      dayKey: key,
      xpTotal:       totalXp(),
      gold:          window.G.gold | 0,
      kills:         stats.kills | 0,
      gathered:      stats.gathered | 0,
      harvested:     stats.harvested | 0,
      deedsDropped:  inv.farm_deed | 0,
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
      goldEarned:   Math.max(0, (window.G.gold|0) - snap.gold),
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
        icon:  sd.icon || '📊',
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
        icon:  m.icon || '⚔️',
        action: function(){
          if(typeof window.startCombat === 'function') window.startCombat(la.id);
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
        var sid = skillIds[i];
        var xp = window.G.skills[sid] | 0;
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
          icon: window.SKILLS_DEF[sid].icon || '📊',
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
      var q = open[j];
      if(!q.goal) continue;
      var pq = (q.progress || 0) / q.goal;
      var qcand = {
        kind: 'quest',
        label: q.label || q.id,
        current: q.progress || 0,
        target: q.goal,
        pct: Math.max(0, Math.min(1, pq)),
        icon: q.done ? '✅' : '🎯',
        deepLink: function(){
          // Open quests modal if available, else just nav to profile
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

  // ── Public API ────────────────────────────────────────────
  window.HearthriseLaunchpad = {
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
