// ════════════════════════════════════════════════════════════════════════
// src/data/town-presence.js — HOW OFTEN THE TOWN HEARS WHERE YOU STAND, AS DATA.
//
// The knobs of src/session/town-presence.js (who else is in town, and where)
// and src/world/town-scene.js (how they walk on your screen). The server's own
// bounds live in supabase/migrations/2026-10-25-town-walk.sql (the publish) and
// 2027-01-28-town-stands.sql (the stands and the read); the client keeps inside
// them so a refusal is rare, never so a bound can be skipped:
//   publishMinMs   never two position publishes closer than this (server floor 250 ms, 90/min)
//   keepaliveMs    a hero standing off its stand re-publishes this often, and an unviewed (parked) one says it is
//                  here (hr_town_here, server 30/min): inside the 30 s a body and a steered tile last. A hero ON its
//                  stand in a town being read sends none: the read is its keepalive (town-presence.js _keepaliveDue)
//   pollMs         hr_town_view is read this often while a town is DRAWN (server 45/min): a frame that
//                  asks for the people (walkers()); a hidden tab or a pane not drawing reads nobody
//   idlePollMs     ...and this often once `idleAfterQuiet` answers in a row said nothing new and the hero stands (a town
//                  at rest, 30 reads a minute for nothing: old-laptop player 10-31); any change, anyone walking, or the
//                  hero's own step goes back to pollMs at once. A whole multiple of pollMs (the poll's timer asks)
//   fullEveryMs    a WHOLE answer at least this often (the reads between ask only for what changed; the
//                  server answers whole a cursor older than 60 s)
//   staleMs        a walker list older than this shows nobody, never ghosts (twice idlePollMs: a read at rest that runs late is no ghost)
//   cap            walkers drawn at most: the server's view cap (TOWN_INSTANCE.cap, the one number)
//   snapTiles      a peer drawn this many tiles from where the server says it is
//                  jumps there instead of walking (a door, an exit, a long gap)
// ════════════════════════════════════════════════════════════════════════
import { TOWN_INSTANCE } from './world/stations.js?v=0.2.111';

export const TOWN_PRESENCE = Object.freeze({
  publishMinMs: 1000,
  keepaliveMs: 20000,
  pollMs: 2000,
  idlePollMs: 6000,
  idleAfterQuiet: 3,
  fullEveryMs: 30000,
  staleMs: 12000,
  cap: TOWN_INSTANCE.cap,
  snapTiles: 6,
});

/* A VISIT (a Hearth powder or a named fuel sets the body on a fuel stand; hr_town_go a counter): the SERVER holds the body on
   the visit's stand long enough to walk there from where it stood and throw, then sets a hero still working a town job back
   at its job's station (a pointer change meanwhile waits for the visit too). The walk is never longer than the straight
   line times `pathFactor` plus `holdS` (measured 2026-11-08 on Havora at the client's 3.2 tiles/s, every stand to the
   first four stands of the Hearth and every counter: at 1.5 the path outruns the line by 3.2 s at worst); `holdS` covers
   that, a read's lag and the throw. The visit's end changes the stand, so the World drops a throw the hero never reached.
   Mirrored by hr_town_visit_hold (supabase/migrations/2027-03-23-town-visit-hold.sql); tests/town-shows.mjs TS-VISIT is the twin. */
export const TOWN_VISIT = Object.freeze({ pathFactor: 1.5, holdS: 10 });

/** The facings the server takes (hr_town_move p_dir). */
export const TOWN_DIRS = Object.freeze(['n', 's', 'e', 'w']);
