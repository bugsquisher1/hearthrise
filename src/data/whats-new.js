// ════════════════════════════════════════════════════════════════════════
// src/data/whats-new.js — THE "WHAT'S NEW" CARD, ONE ROW A RELEASE THAT HAS ONE (lane/wn-sh WN, 2026-11-26; 20-v030-the-roads.md band 5).
//
// The characters screen shows the newest row at or under the running version, once an ACCOUNT (src/app/whats-new.js): its seen mark is
// the card id in the account's coach reads (1039-account-coach.sql, server-held display state), so a reload or another device does not
// show it again, and a row a later release adds is a new card. Older rows are never shown once a newer one is out.
//   version  the release the card is for (semver)
//   card     its seen mark (^[a-z0-9_]{1,64}$, unique)
//   lines    text ids (src/data/text/share.js), one sentence each, in order
//   fresh    a text id shown only to a RETURNING account (made before the release: this release starts every hero fresh), or null
//   since    the release's date (YYYY-MM-DD) "returning" is read against; null until the release sets it, and then the running build's own
//            date (src/build-info.js BUILD.date) stands in while the running version is this row's
//   forNew   true: a brand-new account sees the card too (without the fresh line)
// Placeholder copy: the designer owns the final words (lane PN). PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const WHATS_NEW = Object.freeze([
  Object.freeze({
    version: '0.3.0', card: 'whats_new_0_3_0',
    lines: Object.freeze(['share.news_030_roads', 'share.news_030_risk', 'share.news_030_share']),
    fresh: 'share.news_030_fresh', since: null, forNew: true,
  }),
]);

/** -1, 0 or 1 as semver `a` is under, at or over `b`. Pure. */
export function semverCmp(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0) ? -1 : 1;
  return 0;
}
