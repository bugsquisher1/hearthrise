// ============================================================================
// src/features/boot-hydration.js — "CONNECTING YOUR CHARACTER…" (b492).
//
// THE DEFECT THIS EXISTS FOR, stated as the player met it. 2026-08-29, QA
// account, build 491, Chrome cold start after a PC restart. A clean boot of
// hearthrise.net reached "ready" and stayed there for 36+ seconds showing:
//
//     attack 0 · strength 0 · defense 0 · hitpoints 1154 xp · 500 gold
//
// …on an account holding attack 428 and 7,520 gold, DB-verified. The net pill
// read "Online". There was no banner, no error, no gate. The page looked exactly
// like a brand-new account, and a player who saw that would reasonably conclude
// their character had been wiped.
//
// Nothing was wiped. The boot read had failed and nothing retried (record.js's
// ladder is that half), and while it was failing the client rendered the
// FRESH-G FACTORY LITERAL because that literal is what `G` holds before the
// server answers.
//
// ── THE RULE, AND IT IS THE SAVE-INVARIANT POSTURE APPLIED TO A RENDER ──────
// CLAUDE.md save-invariant #2: act only on CERTAINTY. record.js has always
// honoured that for AUTHORITY — a field the server has not stated is UNKNOWN,
// never a substituted local number. What had no equivalent was the RENDER:
// "unknown" had no picture, so the picture defaulted.
//
//     A player must never be shown "wiped" when the truth is "not loaded yet."
//
// So while the character has not arrived, the character is not drawn. This veil
// is deliberately BLOCKING and deliberately does NOT time out into the game:
// Hearthrise is online-only (CLAUDE.md server-authority ruling), there is no
// offline mode to degrade into, and "give up and show the defaults" is the bug.
// It gets louder as attempts accumulate — it names the reason and offers a
// retry — but it never lies.
//
// ── WHEN IT IS SHOWN, AND THE THREE THINGS THAT MUST NOT TRIGGER IT ─────────
// `shouldVeil` is PURE and takes an injected environment, so the rule is
// asserted by the suite rather than described here. All four must hold:
//
//   blobRetired  the capstone is armed — the character comes ONLY from the
//                server, so there is genuinely nothing local to show. With the
//                capstone dormant the save blob has already loaded a real
//                character and veiling it would be a regression; behaviour there
//                is byte-for-byte unchanged.
//   signedIn     there is a live session. A signed-OUT visitor is the account
//                gate's screen, not ours, and two full-screen sheets arguing is
//                worse than either.
//   !hydrated    no envelope has landed on this page yet (record.js
//                `isCharacterHydrated()` — `hydrated` or `fresh` both count;
//                a server that says "no character" has spoken, and a genuinely
//                new account must reach the game).
//   !harness     the smoke suite boots this page with no server and no session.
//                It is not a player and must not be veiled. Belt to the
//                `signedIn` braces, and it is the honest statement.
//
// ── PRESENTATION OWNERSHIP ──────────────────────────────────────────────────
// ⚠ ART DIRECTOR: this is a Systems-Engineer-authored surface built under a P1
//   trust bug, and the visual treatment is explicitly yours to take. It uses
//   theme TOKENS with literal fallbacks — `var(--bg-3, #2a1f15)` — rather than
//   hardcoded colours (CLAUDE.md HARD RULE), and the fallbacks exist only so the
//   veil still renders if the stylesheet itself failed to load, which is one of
//   the situations it has to survive. Restyle freely; keep the two properties
//   that are load-bearing: it COVERS the character surfaces, and it never
//   dismisses itself without a server verdict.
//
// No emoji as art (Final Directive). DOM-only; all state comes from record.js.
// ============================================================================

import { bootHydrationState, isCharacterHydrated, onHydrationChange,
         beginRecordLoad } from '../net/record.js?v=499';
import { isBlobRetired } from '../net/capstone.js?v=499';

export const VEIL_ID = 'hr-boot-hydration-veil';

/* After this many failed attempts the veil stops being a spinner and starts
   being an explanation. Three rungs of the ladder is ~5.6s — long enough that a
   normal slow boot never sees the louder copy, short enough that a real failure
   is named while the player is still looking at it. */
export const LOUD_AFTER_ATTEMPTS = 3;

/* WHY THE CHARACTER HAS NOT ARRIVED, in the player's language. Keyed on
   record.js's RECORD_OUTCOMES so a new outcome is a missing row here (which
   falls back to the honest generic) rather than a wrong sentence. */
const WHY = {
  'timeout': 'The server has not answered yet.',
  'unreachable': 'This device cannot reach the server right now.',
  'unavailable': 'The server is having trouble answering.',
  'rate-limited': 'The server asked us to slow down for a moment.',
  'not-signed-in': 'Your sign-in is being renewed.',
  'not-deployed': 'The server is mid-update.',
  'malformed': 'The server sent an answer this version could not read.',
  'refused': 'The server declined the request.',
  'unconfigured': 'Still connecting to the server.',
};

/**
 * THE RULE. Pure, injected, exported — so the suite drives it without a server,
 * a session or a DOM, and so a mutation to it is caught rather than argued
 * about. Every field is read as a boolean; an absent field is falsy, which
 * fails toward NOT veiling (never blocking a player over a missing input).
 */
export function shouldVeil(env) {
  const e = env || {};
  if (e.harness) return false;
  if (!e.blobRetired) return false;
  if (!e.signedIn) return false;
  return !e.hydrated;
}

/** Read the live world into `shouldVeil`'s shape. Every lookup is call-time and
 *  guarded: this runs during boot, when any given module may not have attached
 *  yet, and a throw here must never be the thing that stops the game. */
export function readEnv(win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  let signedIn = false;
  try {
    const A = w && w.HearthriseAuth;
    signedIn = !!(A && typeof A.isSignedIn === 'function' && A.isSignedIn());
  } catch (e) { signedIn = false; }
  let retired = false;
  try { retired = !!isBlobRetired(); } catch (e) { retired = false; }
  let hydrated = true;   // fail toward NOT veiling if record.js is unreachable
  try { hydrated = !!isCharacterHydrated(); } catch (e) { hydrated = true; }
  return {
    harness: !!(w && w.__HR_TEST_HARNESS__),
    blobRetired: retired,
    signedIn,
    hydrated,
  };
}

function tok(name, fallback) { return 'var(' + name + ', ' + fallback + ')'; }

/* ── THE ONE PIECE OF MOTION, AND IT IS NOT DECORATION ───────────────────────
   A completely static full-screen message held for 30 seconds reads as FROZEN,
   and "the game has hung" is the second-worst thing this screen could say after
   "you have been wiped". Three pulsing dots is the smallest honest signal that
   something is still happening. Injected once, namespaced, and it respects
   prefers-reduced-motion — a player who has asked for stillness gets a static
   row rather than nothing at all. */
const VEIL_STYLE_ID = 'hr-boot-hydration-veil-css';
function ensureVeilStyle(doc) {
  if (doc.getElementById(VEIL_STYLE_ID)) return;
  const s = doc.createElement('style');
  s.id = VEIL_STYLE_ID;
  s.textContent =
    '@keyframes hrBhvPulse{0%,80%,100%{opacity:.25}40%{opacity:1}}'
    + '#' + VEIL_ID + ' .hr-bhv-dot{display:inline-block;width:7px;height:7px;border-radius:50%;'
    + 'background:currentColor;margin:0 4px;animation:hrBhvPulse 1.4s infinite ease-in-out both}'
    + '#' + VEIL_ID + ' .hr-bhv-dot:nth-child(2){animation-delay:.18s}'
    + '#' + VEIL_ID + ' .hr-bhv-dot:nth-child(3){animation-delay:.36s}'
    + '@media (prefers-reduced-motion: reduce){#' + VEIL_ID + ' .hr-bhv-dot{animation:none;opacity:.55}}';
  (doc.head || doc.documentElement).appendChild(s);
}

function buildVeil(doc) {
  ensureVeilStyle(doc);
  const el = doc.createElement('div');
  el.id = VEIL_ID;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.style.cssText = [
    'position:fixed', 'inset:0', 'z-index:2147483644',
    'background:' + tok('--bg-0', '#2a1f15'),
    'color:' + tok('--ink', '#f2e4cc'),
    'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
    'text-align:center', 'padding:24px', 'box-sizing:border-box',
    'font:400 16px/1.55 ' + tok('--f-ui', 'system-ui,-apple-system,Segoe UI,Roboto,sans-serif'),
  ].join(';');
  el.innerHTML =
    '<div style="max-width:420px;width:100%">'
    + '<div id="hr-bhv-title" style="font:600 20px/1.3 ' + tok('--f-display', 'Georgia,serif')
    + ';color:' + tok('--gold', '#c8862a') + ';margin-bottom:10px">Connecting your character…</div>'
    + '<div aria-hidden="true" style="color:' + tok('--gold', '#c8862a') + ';margin-bottom:12px">'
    + '<span class="hr-bhv-dot"></span><span class="hr-bhv-dot"></span><span class="hr-bhv-dot"></span></div>'
    + '<p id="hr-bhv-body" style="margin:0 0 4px;color:' + tok('--ink-2', '#c9b48f') + '">'
    + 'Reading your progress from the server.</p>'
    /* THE SENTENCE THAT DOES THE ACTUAL WORK. Everything else on this screen is
       furniture; this is the line that stops a player believing they were wiped,
       and it is present from the first frame rather than only after a failure.
       15px, not 14px: the suite's legibility floor is 14.5px, and the one line on
       this screen a frightened player most needs to read may not sit under it. */
    + '<p id="hr-bhv-safe" style="margin:10px 0 0;font-size:15px;color:'
    + tok('--ink-3', '#a5896a') + '">Nothing has been lost — your character lives on the server '
    + 'and has not been touched.</p>'
    + '<div id="hr-bhv-actions" style="display:none;gap:8px;margin-top:18px;justify-content:center">'
    + '<button id="hr-bhv-retry" type="button" style="font:600 15px/1 ' + tok('--f-ui', 'system-ui,sans-serif')
    + ';background:' + tok('--gold', '#c8862a') + ';color:' + tok('--bg-0', '#241a10')
    + ';border:0;border-radius:8px;padding:11px 18px;cursor:pointer">Try again</button>'
    + '<button id="hr-bhv-reload" type="button" style="font:500 15px/1 ' + tok('--f-ui', 'system-ui,sans-serif')
    + ';background:transparent;color:' + tok('--ink-2', '#c9b48f') + ';border:1px solid '
    + tok('--line', 'rgba(255,255,255,.22)') + ';border-radius:8px;padding:11px 16px;cursor:pointer">Reload</button>'
    + '</div>'
    + '</div>';
  const retry = el.querySelector('#hr-bhv-retry');
  if (retry) retry.addEventListener('click', () => {
    retry.disabled = true;
    retry.textContent = 'Asking the server…';
    try { beginRecordLoad(); } catch (e) {}
    setTimeout(() => { try { retry.disabled = false; retry.textContent = 'Try again'; } catch (e) {} }, 2500);
  });
  const reload = el.querySelector('#hr-bhv-reload');
  if (reload) reload.addEventListener('click', () => { try { location.reload(); } catch (e) {} });
  return el;
}

/** The copy for a given hydration state. Pure + exported so the suite asserts
 *  the SENTENCES rather than that a function exists which might produce them. */
export function veilCopy(state) {
  const s = state || {};
  const attempts = Number(s.attempts) || 0;
  if (attempts < LOUD_AFTER_ATTEMPTS) {
    return {
      title: 'Connecting your character…',
      body: 'Reading your progress from the server.',
      loud: false,
    };
  }
  const why = WHY[s.outcome] || 'The server has not answered yet.';
  return {
    title: 'Still connecting…',
    body: why + ' Retrying automatically.',
    loud: true,
  };
}

function paint(el, state) {
  const c = veilCopy(state);
  const t = el.querySelector('#hr-bhv-title');
  const b = el.querySelector('#hr-bhv-body');
  const a = el.querySelector('#hr-bhv-actions');
  if (t && t.textContent !== c.title) t.textContent = c.title;
  if (b && b.textContent !== c.body) b.textContent = c.body;
  if (a) a.style.display = c.loud ? 'flex' : 'none';
}

/** Show / update / hide, from whatever the world currently says. Idempotent —
 *  safe to call from a hook, a poll and a boot, which is exactly what happens. */
export function syncVeil(win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  const doc = w && w.document;
  if (!doc || !doc.body) return null;
  const env = readEnv(w);
  const existing = doc.getElementById(VEIL_ID);
  if (!shouldVeil(env)) {
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    return null;
  }
  /* THE OTHER SHEETS OUTRANK THIS ONE. An evicted device and a dead session are
     both states the player must ACT on; this one resolves by itself. Two
     full-screen sheets arguing is worse than either. */
  if (doc.getElementById('hr-evicted-gate') || doc.getElementById('hr-auth-expired-gate')) {
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    return null;
  }
  const el = existing || buildVeil(doc);
  if (!existing) doc.body.appendChild(el);
  let state = { attempts: 0, outcome: null };
  try { state = bootHydrationState(); } catch (e) {}
  paint(el, state);
  return el;
}

let pollTimer = null;

/** Wire it up. Idempotent.
 *
 *  TWO TRIGGERS, and the poll is not laziness. The hydration hook covers every
 *  verdict, but two of the three inputs to `shouldVeil` change WITHOUT one:
 *  `signedIn` flips when auth finishes restoring the session (which is after
 *  boot on a cold start — the very case this exists for), and `blobRetired`
 *  flips with the accrual switch. A hook-only wiring would decide once, at the
 *  worst possible moment, and then never look again. 500ms is imperceptible to
 *  a player and free next to a network boot. */
export function installBootHydrationVeil(win) {
  const w = win || (typeof window !== 'undefined' ? window : null);
  if (!w || !w.document) return null;
  /* THE HARNESS GETS NO TIMER AT ALL. `shouldVeil` already refuses to veil it, so
     the poll would be ~2,000 no-op wakeups across a suite run — and the suite's
     in-page budget is a real, measured constraint (CLAUDE.md: concurrent runs
     "blow the in-page budget and look like flakes"). Refusing the timer as well
     as the veil is the honest version of "the harness is not a player".
     The pure functions stay fully drivable — B492-4 asserts the RULE, not the
     timer. */
  if (w.__HR_TEST_HARNESS__) return null;
  try { onHydrationChange(() => { try { syncVeil(w); } catch (e) {} }); } catch (e) {}
  if (pollTimer === null && typeof setInterval === 'function') {
    pollTimer = setInterval(() => { try { syncVeil(w); } catch (e) {} }, 500);
    try { if (pollTimer && typeof pollTimer.unref === 'function') pollTimer.unref(); } catch (e) {}
  }
  return syncVeil(w);
}

/** Test seam — stop the poll and drop the veil. */
export function uninstallBootHydrationVeil(win) {
  if (pollTimer !== null) { try { clearInterval(pollTimer); } catch (e) {} pollTimer = null; }
  const w = win || (typeof window !== 'undefined' ? window : null);
  const el = w && w.document && w.document.getElementById(VEIL_ID);
  if (el && el.parentNode) el.parentNode.removeChild(el);
}

if (typeof window !== 'undefined') {
  window.HearthriseBootVeil = {
    VEIL_ID, LOUD_AFTER_ATTEMPTS,
    shouldVeil, readEnv, veilCopy, syncVeil,
    installBootHydrationVeil, uninstallBootHydrationVeil,
  };
  /* Installed on DOM-ready rather than at import: this module is imported from
     main.js, which may run before <body> exists. */
  const start = () => { try { installBootHydrationVeil(window); } catch (e) {} };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
}
