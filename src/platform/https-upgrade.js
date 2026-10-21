/* src/platform/https-upgrade.js — AN http:// VISIT GOES TO https:// FIRST.
 *
 * A classic script, the FIRST script in <head> on every root page
 * (tests/https-upgrade.mjs holds that). GitHub Pages serves hearthrise.net on
 * plain http too, and the hr-accrue Edge Function only answers https origins
 * (supabase/functions/hr-accrue/cors.js): on http every hunt call is refused
 * by CORS and the hunt freezes. So an http page replaces itself with the same
 * host, path, query and hash on https before any module loads. Local dev
 * (localhost, 127.0.0.1, [::1], *.localhost) is left on http.
 *
 * The CORS allowlist is never widened to http: the page moves instead. */
(function () {
  var l = window.location;
  if (l.protocol !== 'http:') return;
  var h = l.hostname;
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1' || /\.localhost$/.test(h)) return;
  l.replace('https://' + l.host + l.pathname + l.search + l.hash);
})();
