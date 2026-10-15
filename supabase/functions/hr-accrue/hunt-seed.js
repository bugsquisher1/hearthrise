// ============================================================================
// supabase/functions/hr-accrue/hunt-seed.js — THE HUNT SESSION'S PER-SWING SEED.
//
// Ruling HR-2026-10-14 §4: every swing of a hunt draws from its own seed, named
// `hunt:<session>:<swing_index>`, so where a settle window splits can never
// change a roll (TICK-1) and a dispute replays from the session alone.
//
// ── THE MIX, AND WHY IT IS KEYED (Security, C1 review item 3, 2026-10-14) ────
// The session secret is `hr_seed(user, slot, 'hunt:' || session_id)` — 64 bits
// of sha256 over the server's PRNG secret, which no client role can read or
// call. It is fetched ONCE per settle (a per-swing hr_seed would be ~1,500 round
// trips a character-hour) and mixed with each swing's label HERE:
//
//     seed(i) = first 4 bytes of HMAC-SHA256(key = secret, msg = label(i))
//
// The first draft hashed the secret's TEXT and the label together with a 32-bit
// FNV-1a. That collapses 64 secret bits into ONE 32-bit running state: an
// observer who sees a few swings' outcomes can search 2^32 states, recover it,
// and from then on predict — and steer, by choosing when to press — every
// rare-drop roll of the session. A keyed MAC has no such state: knowing any
// number of (label, seed) pairs reveals nothing about the next one without the
// 64-bit key. tests/hunt-sessions-settle.mjs SEED goes red on the FNV mix.
//
// It lives in the edge, not in src/core, because the browser shares src/core
// and must not import a crypto primitive it never needs: the engine takes the
// seeder INJECTED as `ctx.swingSeed` (src/core/combat-sim.js swingSeedOf).
//
// PURE ESM, Node + Deno (node:crypto in both). No `?v=` (not under src/**).
// ============================================================================

import { createHmac } from 'node:crypto';
import { seedLabel } from '../../../src/core/action-rules.js';

/** The algorithm name, journalled with a settle so a replay knows what it ran. */
export const SWING_SEED_ALG = 'hmac-sha256/v1';

/* The domain separator. A future v2 mix changes this string, so a stream can
   never be confused with another version's. */
const KEY_PREFIX = 'hearthrise:hunt-swing:v1:';

/** hr_seed answers a signed 64-bit integer; it arrives as decimal text. */
export function sessionSecretOk(secret) {
  return typeof secret === 'string' && /^-?[0-9]{1,20}$/.test(secret);
}

/**
 * The seeder of one INSTANCE: (domain, index) -> unsigned 32-bit seed
 * (architecture contracts S2; action-rules.js seedLabel).
 * @param secret      hr_seed(user, slot, 'hunt:' || session_id) as decimal text
 * @param instanceId  the instance uuid (part of the label, verbatim; solo = the session id)
 */
export function seederFor(secret, instanceId) {
  if (!sessionSecretOk(secret)) {
    throw new Error('seederFor: the session secret is not hr_seed text — refusing to seed a hunt from anything else');
  }
  if (typeof instanceId !== 'string' || instanceId.length === 0) {
    throw new Error('seederFor: no instance id');
  }
  const key = KEY_PREFIX + secret;
  return (domain, index) => {
    const i = Math.floor(Number(index));
    if (!Number.isFinite(i) || i < 0) throw new Error('seederFor: bad index ' + String(index));
    const d = createHmac('sha256', key).update(seedLabel(instanceId, domain, i), 'utf8').digest();
    return ((d[0] << 24) | (d[1] << 16) | (d[2] << 8) | d[3]) >>> 0;
  };
}

/** The swing seeder of one instance: swing index -> seed, the `s` domain. */
export function swingSeederFor(secret, instanceId) {
  const seed = seederFor(secret, instanceId);
  return (swingIndex) => seed('s', swingIndex);
}
