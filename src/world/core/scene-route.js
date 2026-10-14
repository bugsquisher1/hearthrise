// ════════════════════════════════════════════════════════════════════════
// src/world/core/scene-route.js — WHICH MAP THE WORLD PANE SHOWS.
//
// The server says what the hero is doing (`active_kind` / `active_id`, the
// envelope's activity). A combat whose id is a hunt a map renders — or a monster
// one of those hunts spawns (a training fight on a rat is fought in the cellar)
// — shows that hunt. Anything else shows the viewer's own choice of town or
// home. There is no client mirror of the activity: the caller passes what the
// server last said, and a missing answer shows the town.
// PURE: no DOM, no window, no G.
// ════════════════════════════════════════════════════════════════════════

/** hunt id / monster id → map id, from the maps' `hunts` columns and each hunt's spawns. */
export function huntMapIndex(maps, huntIndex) {
  const out = Object.create(null);
  for (const m of maps) {
    for (const hid of m.hunts || []) {
      if (!(hid in out)) out[hid] = m.id;
      const hunt = huntIndex[hid];
      for (const s of (hunt && hunt.spawns) || []) if (!(s.monster in out)) out[s.monster] = m.id;
    }
  }
  return out;
}

/**
 * @param {{kind: string, id: string|null}|null} activity  what the server says the hero is doing
 * @param {'town'|'home'} choice  the viewer's pick for a non-hunt scene
 * @param {object} index  huntMapIndex()
 * @param {{town: string, home: string}} sceneMaps
 * @returns {{map: string, kind: 'hunt'|'town'|'home'}}
 */
export function sceneFor(activity, choice, index, sceneMaps) {
  const id = activity && activity.kind === 'combat' ? activity.id : null;
  if (id && index[id]) return { map: index[id], kind: 'hunt' };
  const pick = choice === 'home' ? 'home' : 'town';
  return { map: sceneMaps[pick], kind: pick };
}
