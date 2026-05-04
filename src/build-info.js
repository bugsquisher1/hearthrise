// ============================================================
// src/build-info.js
//
// Single source of truth for the running build's version. Bump
// BUILD.cache when you ship — it doubles as the cache-buster suffix
// you append to script tags in index.html (?v=...). The welcome /
// changelog modal also reads this to know whether to show.
//
// Why is this a hand-edited constant instead of git rev-parse?
// We ship as a static folder via Cloudflare Pages — there's no
// build step. A 30-second hand-edit per release is cheaper than
// adding a build pipeline just for this.
// ============================================================

export const BUILD = Object.freeze({
  version:   '0.9.0-beta',         // semver — bump on real releases
  cache:     127,                   // cache-buster, must match index.html ?v=
  channel:   'beta',                // 'dev' | 'beta' | 'live'
  date:      '2026-05-04',          // build date
  // Set this to your latest commit SHA after each push if you want
  // bug reports to include it. Optional.
  commit:    null,
});

export function buildString() {
  const c = BUILD.commit ? ' · ' + BUILD.commit.slice(0, 7) : '';
  return `v${BUILD.version} (b${BUILD.cache})${c}`;
}

if (typeof window !== 'undefined') {
  window.HearthriseBuild = { ...BUILD, buildString };
  console.log('[Hearthrise] build', buildString());
}
