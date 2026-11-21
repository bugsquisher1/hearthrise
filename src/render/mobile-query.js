// ════════════════════════════════════════════════════════════════════════
// src/render/mobile-query.js — THE ONE PHONE QUERY, the screen class every view lays out by (CLAUDE.md §7: phones are
// landscape-only, windows become slide-out sheets). The stylesheets write the same text in their @media rules;
// tests/breakpoint-guard.mjs freezes that set and tests/world-core.mjs C5 holds world.css to this string.
//
// ITS OWN HOME, OFF THE WORLD (lane/a-ci-reds-pre-wave, SITE-10): the sign-in screen and the off-why bubble read it before any
// world exists. It lived in src/world/core/camera.js, so those two imports carried the camera and the whole art budget
// (src/data/world/art-budget.js) onto the sign-in stage for one string.
//
// PURE. Data only. Imports nothing.
// ════════════════════════════════════════════════════════════════════════

export const MOBILE_QUERY = '(max-width: 540px), (max-height: 540px) and (max-width: 1024px)';
