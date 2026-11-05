// ════════════════════════════════════════════════════════════════════════
// src/data/world/sink-taps.js — WHAT A TAP ON THE MAP OPENS FOR THE GOLD SINKS (data).
//
// TAP_OPENS-shaped, read by src/world/walk-scene.js and src/app/world-pane.js beside src/data/world/stations.js's rows. They live here and not in stations.js because the
// edge bundles that file: these rows would move the hr-accrue hash for a thing the engine never reads. tab: the tab the window opens on. lot: [w, h] tiles from the sprite's
// origin that take the tap, for a sprite whose frame stands taller than its art: the street above a staked-out plot still walks.
// PURE ESM DATA.
// ════════════════════════════════════════════════════════════════════════

/* a Town Works project on its way up: the site opens its tab, on the lot's own tiles */
const works = Object.freeze({ open: 'window', window: 'havora', tab: 'works' });
const site = Object.freeze({ ...works, lot: Object.freeze([8, 6]) });

export const SINK_TAPS = Object.freeze({
  /* the Tavern: stand a round (the Havora window on its Round tab) */
  havora_tavern: Object.freeze({ open: 'window', window: 'havora', tab: 'round' }),
  /* the Weighhouse's plaque: Works, always */
  havora_weighhouse_plaque: works,
  havora_weighhouse_staked: site, havora_weighhouse_footings: site, havora_weighhouse_framed: site, havora_weighhouse_walled: site,
  /* finished, it's a door to the Market, which stays open everywhere else: no power, no discount */
  havora_weighhouse_finished: Object.freeze({ open: 'window', window: 'market' }),
});
