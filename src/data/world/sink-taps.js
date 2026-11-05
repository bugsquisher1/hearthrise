// ════════════════════════════════════════════════════════════════════════
// src/data/world/sink-taps.js — WHAT A TAP ON THE MAP OPENS FOR THE GOLD SINKS (data).
//
// TAP_OPENS-shaped, read by src/world/walk-scene.js and src/app/world-pane.js beside src/data/world/stations.js's rows. They live here and not in stations.js because the
// edge bundles that file: these rows would move the hr-accrue hash for a thing the engine never reads. tab: the tab the window opens on.
// PURE ESM DATA.
// ════════════════════════════════════════════════════════════════════════

export const SINK_TAPS = Object.freeze({
  /* the Tavern: stand a round (the Havora window on its Round tab) */
  havora_tavern: Object.freeze({ open: 'window', window: 'havora', tab: 'round' }),
});
