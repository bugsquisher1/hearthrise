// ============================================================
// src/build-info.js
//
// Single source of truth for the running version (semver), set by
// ./bump-version.sh. The site build (tools/build-site.mjs) stamps every
// import and page tag with ?v=<version>, so a browser fetches each
// release fresh; cache is the same string, for asset URLs built at
// run time. The new-version notice reads this file to know a release
// has landed.
// ============================================================

export const BUILD = Object.freeze({
  version:   '0.2.141',   // semver: patch per release, minor per milestone, 1.0.0 = full release
  cache:     '0.2.141',   // = version: the ?v= on asset URLs built at run time
  channel:   'beta',                // 'dev' | 'beta' | 'live'
  date: '2026-11-19',         // build date
  // Set this to your latest commit SHA after each push if you want
  // bug reports to include it. Optional.
  commit:    null,
});

export function buildString() {
  const c = BUILD.commit ? ' (' + BUILD.commit.slice(0, 7) + ')' : '';
  return `v${BUILD.version}${c}`;
}

if (typeof window !== 'undefined') {
  window.HearthriseBuild = { ...BUILD, buildString };
  console.log('[Hearthrise] build', buildString());
}
