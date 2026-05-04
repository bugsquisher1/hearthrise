// ============================================================
// src/features/drop-log.js
//
// Per-monster kill + drop history. Recorded automatically on
// every kill; consumed by Batch F (b138) UI that shows
// "Slime: 47 kills, 4 Slime Gel, 1 Bones, 2 Sticky Core"
// in the monster preview modal.
//
// Shape (lives on G.dropLog, persisted by saveLocal()):
//   {
//     [monsterId]: {
//       kills:     <number>,
//       drops:     { [itemId]: <count> },
//       firstSeen: <ms timestamp>,
//       lastSeen:  <ms timestamp>,
//     },
//   }
//
// Public API (window.HearthriseDropLog):
//   recordKill(monsterId, dropsObj)   — call from killMonster()
//   getMonsterStats(monsterId)        — returns entry or null
//   getAllStats()                     — returns full table (for export)
//   getMostKilled(n)                  — top N monsters by kill count
//   reset()                           — clears all (test / debug)
//
// b133 — Batch A foundations. Batch F hooks the UI into this.
// ============================================================

(function(){
  'use strict';

  function ensureShape(){
    if(!window.G) return null;
    if(!window.G.dropLog || typeof window.G.dropLog !== 'object') {
      window.G.dropLog = {};
    }
    return window.G.dropLog;
  }

  function ensureEntry(monsterId){
    var log = ensureShape(); if(!log) return null;
    if(!log[monsterId]){
      log[monsterId] = {
        kills:     0,
        drops:     {},
        firstSeen: Date.now(),
        lastSeen:  Date.now(),
      };
    }
    return log[monsterId];
  }

  // ── Public API ──────────────────────────────────────────────

  function recordKill(monsterId, dropsObj){
    if(!monsterId) return;
    var entry = ensureEntry(monsterId);
    if(!entry) return;
    entry.kills += 1;
    entry.lastSeen = Date.now();
    if(dropsObj && typeof dropsObj === 'object'){
      for(var itemId in dropsObj){
        if(!Object.prototype.hasOwnProperty.call(dropsObj, itemId)) continue;
        var qty = +dropsObj[itemId] || 0;
        if(qty <= 0) continue;
        entry.drops[itemId] = (entry.drops[itemId] || 0) + qty;
      }
    }
    // Lightweight: don't saveLocal on every kill — combat tick
    // batches its own save calls. The drop log lives on G and
    // gets persisted next time saveLocal() runs.
  }

  function getMonsterStats(monsterId){
    var log = ensureShape(); if(!log) return null;
    return log[monsterId] || null;
  }

  function getAllStats(){
    var log = ensureShape();
    return log ? log : {};
  }

  function getMostKilled(n){
    var log = ensureShape(); if(!log) return [];
    var entries = [];
    for(var id in log){
      if(!Object.prototype.hasOwnProperty.call(log, id)) continue;
      entries.push({ id: id, kills: log[id].kills || 0 });
    }
    entries.sort(function(a, b){ return b.kills - a.kills; });
    return entries.slice(0, n || 10);
  }

  function reset(){
    if(window.G) window.G.dropLog = {};
    if(typeof window.saveLocal === 'function') window.saveLocal();
  }

  window.HearthriseDropLog = {
    recordKill: recordKill,
    getMonsterStats: getMonsterStats,
    getAllStats: getAllStats,
    getMostKilled: getMostKilled,
    reset: reset,
  };

  console.log('[drop-log] API loaded — recordKill() will be called from killMonster().');
})();
