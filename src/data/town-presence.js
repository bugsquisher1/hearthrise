// ════════════════════════════════════════════════════════════════════════
// src/data/town-presence.js — HOW OFTEN THE TOWN HEARS WHERE YOU STAND, AS DATA.
//
// The knobs of src/session/town-presence.js (who else is in town, and where)
// and src/world/town-scene.js (how they walk on your screen). The server's own
// bounds live in supabase/migrations/2026-10-25-town-walk.sql (the publish) and
// 2027-01-28-town-stands.sql (the stands and the read); the client keeps inside
// them so a refusal is rare, never so a bound can be skipped:
//   publishMinMs   never two position publishes closer than this (server floor 250 ms, 90/min)
//   keepaliveMs    a standing hero re-publishes this often (server freshness 30 s)
//   parkedKeepaliveMs  ...and an unviewed (parked) one says it is here (hr_town_here) this often,
//                  still inside the 30 s freshness (server 30/min)
//   pollMs         hr_town_view is read this often while a town is DRAWN (server 45/min): a frame that
//                  asks for the people (walkers()); a hidden tab or a pane not drawing reads nobody
//   fullEveryMs    a WHOLE answer at least this often (the reads between ask only for what changed; the
//                  server answers whole a cursor older than 60 s)
//   staleMs        a walker list older than this shows nobody, never ghosts
//   cap            walkers drawn at most: the server's view cap (TOWN_INSTANCE.cap, the one number)
//   snapTiles      a peer drawn this many tiles from where the server says it is
//                  jumps there instead of walking (a door, an exit, a long gap)
// ════════════════════════════════════════════════════════════════════════
import { TOWN_INSTANCE } from './world/stations.js?v=0.2.57';

export const TOWN_PRESENCE = Object.freeze({
  publishMinMs: 1000,
  keepaliveMs: 10000,
  parkedKeepaliveMs: 20000,
  pollMs: 2000,
  fullEveryMs: 30000,
  staleMs: 8000,
  cap: TOWN_INSTANCE.cap,
  snapTiles: 6,
});

/** The facings the server takes (hr_town_move p_dir). */
export const TOWN_DIRS = Object.freeze(['n', 's', 'e', 'w']);
