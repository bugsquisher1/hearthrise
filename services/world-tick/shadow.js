// ============================================================================
// services/world-tick/shadow.js — RE-EXPORT ONLY. The code moved, it was not copied.
//
// 2026-09-21, milestone 1b: the `op:'tick'` entry in `hr-accrue` runs this
// logic for real, and `tools/pack-edge.mjs` can only vendor from `src/core` and
// `src/data` — so a module under `services/` is unreachable from an edge
// payload. The production half therefore LIVES at
// `supabase/functions/hr-accrue/tick-shadow.js` and this file re-exports it.
//
// Copying it here instead would be the second gather path AWAY-12 forbids, and
// the drift would be silent: the offline guards would keep measuring a file the
// deployed function no longer runs.
// ============================================================================

export * from '../../supabase/functions/hr-accrue/tick-shadow.js';

import { hydrate, shadowTick, advance } from '../../supabase/functions/hr-accrue/tick-shadow.js';
import { planWindows } from './contract.js';

/* `shadowSpan` stays HERE and is deliberately not in the payload: it is the
   OFFLINE span-runner the parity guard drives over fixtures (it probes the
   engine an extra time to learn `tickMs`, which a request path must not pay
   for). The edge's own loop is `settleGatherSession`, which chains on the
   engine's watermark instead of on a pre-planned window list. */

/* Run [fromMs, toMs] as a chain of cadence windows. Returns every proposed
   delta and the character the chain ended on. Writes nothing. */
export function shadowSpan(char0, fromMs, toMs, catalogues, opts) {
  const o = opts || {};
  const cadenceMs = Math.floor(o.cadenceMs || 10000);
  const char = hydrate(char0);
  /* The character's own combat tick, derived from SERVER-OWNED equipment by the
     engine itself — never a cadence, never a client value. Asking the engine
     for it (a one-window probe) rather than re-deriving it here keeps the
     alignment rule on the same number the simulation will actually use. */
  const probe = shadowTick(hydrate(char0), fromMs, toMs, catalogues, {});
  const tickMs = Number(probe.tickMs) || 2400;
  const anchorMs = Number(char.activeSinceMs) || fromMs;
  const windows = o.windows ? o.windows(anchorMs, fromMs, toMs, cadenceMs, tickMs)
                            : planWindows(anchorMs, fromMs, toMs, cadenceMs, tickMs);
  const results = [];
  for (const w of windows) {
    let input = null;
    const res = shadowTick(char, w.fromMs, w.toMs, catalogues,
      Object.assign({}, o, { onInput: (i) => { input = i; } }));
    results.push({ window: w, input, res });
    advance(char, res);
  }
  return { tickMs, windows, results, char, probe };
}
