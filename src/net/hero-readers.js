// ════════════════════════════════════════════════════════════════════════
// src/net/hero-readers.js — THE HERO SECTIONS TELEMETRY READS.
//
// src/net/observability.js reports hunts, the funnel and hangs off a hero's server projection through these readers.
// They pull the session's whole graph, so observability does not import them: boot.js hands this object in with the
// game half (src/app/game-half.js) before it opens any hero (lane b-first-load 2026-11-13: the sign-in screen loads
// without them).
// ════════════════════════════════════════════════════════════════════════

import { partyOf, huntOf, huntTierOf } from '../session/hunt-sections.js?v=0.2.130';
import { levelOf } from '../session/character-sections.js?v=0.2.130';
import { endedSessionOf } from '../hunt-view/summary-model.js?v=0.2.130';

export const HERO_READERS = Object.freeze({ partyOf, huntOf, huntTierOf, levelOf, endedSessionOf });
