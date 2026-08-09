// State event emitter — foundation for cloud sync (Supabase / Firebase later).
//
// Design: every meaningful state change emits a typed event. A network adapter
// subscribes and ships the event to the backend. For local-only play, no adapter
// is attached and emit() is a no-op cost. This lets us wire sync points NOW
// without standing up infrastructure.
//
// Event types match the network sync contract documented in DEPLOYMENT_ROADMAP.md.

const listeners = {};

/**
 * Subscribe to a state event.
 * @param {string} type — 'kill' | 'levelUp' | 'equip' | 'unequip' | 'gather'
 *                       | 'craft' | 'companionUnlock' | 'goldDelta' | 'tabChange'
 *                       | '*' (all events)
 * @param {(payload) => void} fn
 * @returns {() => void} unsubscribe
 */
export function on(type, fn) {
  if (!listeners[type]) listeners[type] = [];
  listeners[type].push(fn);
  return () => {
    const arr = listeners[type];
    if (!arr) return;
    const i = arr.indexOf(fn);
    if (i >= 0) arr.splice(i, 1);
  };
}

/**
 * Emit a state event. Wraps callbacks in try/catch so a faulty subscriber can't
 * cascade-break gameplay. Records every event in window.__eventLog (capped at
 * 200 entries) for the smoke test + future replay debugging.
 */
export function emit(type, payload = {}) {
  const ev = { type, payload, ts: Date.now() };
  if (!window.__eventLog) window.__eventLog = [];
  window.__eventLog.push(ev);
  if (window.__eventLog.length > 200) window.__eventLog.shift();
  const fire = (arr) => {
    if (!arr) return;
    for (const fn of arr) {
      try { fn(payload, ev); } catch (e) { console.warn('[events] subscriber threw on', type, e); }
    }
  };
  fire(listeners[type]);
  fire(listeners['*']);
}

/** Snapshot the persistent slice of game state we'd ship to the server. */
export function snapshot(G) {
  if (!G) return null;
  return {
    schemaVersion: 1,
    skills: G.skills,
    inventory: G.inventory,
    bank: G.bank,
    equipment: G.equipment,
    companions: G.companions,
    farmPlots: G.farmPlots,
    rooms: G.rooms,
    bountyHunter: G.bountyHunter,
    gold: G.gold,
    gems: G.gems,
    stats: G.stats,
    playerName: G.playerName,
    activeStyle: G.activeStyle,
    foodSlot: G.foodSlot,
    // b222 (SEAM 3) — Rested XP. Added to this allowlist DELIBERATELY: the
    // bank is worthless if it evaporates on the next cloud restore, and the
    // watermark is worse than worthless without it — a restored save with a
    // fresh `restedAt` would re-bank the same offline hours on the next login,
    // which is exactly the b214 offline double-pay shape. Both fields or
    // neither; they are one piece of state.
    restedXp: G.restedXp,
    restedAt: G.restedAt,
    // b228 (the Chronicle) — added to this allowlist DELIBERATELY. This is the
    // player's permanent record of what they have done: rank-ups, 99s, first
    // boss kills, the name they claimed. Leaving it out would mean a cloud
    // restore — a new device, a reinstall, a recovered account — silently
    // returns them a character with no history, which is the one thing this
    // feature exists to prevent. It is capped at 500 entries by
    // chronicle.js compaction (~52KB worst case, ~15KB realistic), so it
    // cannot grow the snapshot without bound.
    chronicle: G.chronicle,
  };
}

// Expose to window so legacy code can opt in during migration.
window.HearthriseEvents = { on, emit, snapshot };
