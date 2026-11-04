// ════════════════════════════════════════════════════════════════════════
// src/site-files.js — WHERE A FILE OF THE SITE LIVES, FOR CODE THAT MAKES ITS URL AT RUN TIME.
//
// Plain source (local development, tools/qa/local-world.mjs, the test harnesses): a file sits at its own
// path, named by the build's version query, as the page has always asked for it.
// The built site (tools/build-site.mjs): a file whose URL the game makes at run time (a world atlas, the
// icon atlas, a vendored SDK) sits under a name made from its content, from the table the build writes in
// place of HASHED below. A release that did not change a file does not change its URL, so nobody downloads it again.
// A path the table does not name stays where it is: a built site keeps the game's icons at their own paths.
// ════════════════════════════════════════════════════════════════════════
const HASHED = null;   // tools/build-site.mjs replaces this one line: a moved anchor fails the build

/**
 * @param {string} path  the file's path from the site's root (assets/world/atlas-common.png)
 * @param {string} [version]  the build's version query, for plain source
 * @returns {string} the same file's path from the site's root, as this site serves it
 */
export function siteFile(path, version) {
  if (HASHED && HASHED[path]) return HASHED[path];
  return version ? path + '?v=' + version : path;
}
