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
  };
}

// Expose to window so legacy code can opt in during migration.
window.HearthriseEvents = { on, emit, snapshot };
