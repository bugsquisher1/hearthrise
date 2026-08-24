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
/* b288 — THE CLOUD SAVE HOLE (paione: "some stuff is not reloaded through the
   cloud — Bestiary, Achievements, quests, daily login bonus, dungeon times reset,
   clan boss can be re-attacked").

   ROOT CAUSE: this was an ALLOWLIST of 17 fields while G carries ~40. Anything a
   feature added after this list was written silently never reached the cloud — so
   a second device restored a save with no bestiary, no achievements, no quest
   progress, and — far worse — **reset cooldowns**: dungeon lastRun, the daily
   reward claim and the weekly clan-boss claim all live in unlisted fields, so
   switching devices RE-GRANTED them. That is an economy exploit, not just data loss.

   FIX: invert it. Persist everything EXCEPT a small denylist of genuinely
   device-local / derived runtime state. New features now persist by default —
   the failure mode becomes "syncs something harmless" instead of "silently loses
   your progress and hands out free cooldown resets". */
/* ── b466 — NO_SYNC IS ALSO A *DECLARATION*, NOT JUST A DENYLIST ─────────────
   Under BLOB_RETIRED the blob is gone, so this set no longer decides what is
   uploaded — the residue allowlist does. It still carries its original meaning
   and gains a second, load-bearing one: it is the register of fields that are
   DELIBERATELY not persisted. tests/arm-homing-guard.mjs treats membership here
   as a valid "home", so naming a field here is an explicit claim that losing it
   across a reload is CORRECT and invisible to the player. The guard also fails
   if a field is BOTH here and on a persistence home — scratch and progress are
   mutually exclusive claims, and save invariant 3 still stands: a
   persistent-progress field in NO_SYNC is silent data loss and is forbidden. */
const NO_SYNC = new Set([
  // in-flight combat — belongs to the device you are fighting on
  'activeMonster', 'monsterHp', 'monsterMaxHp', 'playerHp', 'playerMaxHp',
  /* b466: the kill streak WITHIN the current fight. Per-fight, not per-account
     (G.lifetimeKills + G.stats.kills are the persistent counters, both homed in
     the residue) and re-supplied by the combat envelope on resume — so it is
     scratch of exactly the same kind as activeMonster above it. */
  'combatKillsThisFoe',
  // in-flight activity loop — same reason
  'activeSkill', 'skillTargetId', 'skillProgress', 'skillMs', 'activeArtisanRecipe',
  /* b466: the legacy siblings of the two above. Nothing in the game writes them
     any more (the activity bar and the artisan panel only READ them), but they
     are the same in-flight-activity class, so they are declared here rather than
     left as an unhomed trap for whoever revives the legacy action path. */
  'activeAction', 'activeArtisanSkill',
  // transient UI / derived
  'combatLog', 'lastOfflineSummary', 'totalLevel', 'combatLevel',
  /* b466 — transient UI, continued. Both are "what is on screen right now":
     viewingSkill is which skill panel the player last opened (the panel re-opens
     from the tab, not from a saved pointer), and lastSessionSummary is the
     one-shot away-summary modal payload — the sibling of lastOfflineSummary
     directly above, and re-showing a stale summary after a reload would be the
     b462 daily-reward bug in another costume. */
  'viewingSkill', 'lastSessionSummary',
]);

export function snapshot(G) {
  if (!G) return null;
  const out = { schemaVersion: 1 };
  for (const k in G) {
    if (!Object.prototype.hasOwnProperty.call(G, k)) continue;
    if (NO_SYNC.has(k)) continue;
    if (k.charAt(0) === '_') continue;               // internal scratch (_saveOwner etc.)
    const v = G[k];
    if (typeof v === 'function' || typeof v === 'undefined') continue;
    out[k] = v;
  }
  return out;
}

/* The previous hand-maintained list, kept ONLY as the documented contract of what
   the leaderboard/server reads. The denylist above is now the source of truth. */
export function snapshotLegacyFields(G) {
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
