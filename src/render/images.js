// ════════════════════════════════════════════════════════════════════════
// src/render/images.js — ONE DECODED IMAGE PER URL, HELD FOR THE PAGE'S LIFE.
//
// The world atlases are big sheets every World mount and the Character
// window's outfit preview read. Each asked for its own new image, so a pane
// remounted (a character switch, a sign-in again) fetched every sheet again
// (Coordinator QA, 2026-10-20). Here a sheet loads ONCE per page:
//
//   heldImage(doc, src)  Promise<HTMLImageElement>: the one decoded image for
//                        that URL (src/world/atlas.js)
//
// Keyed by the absolute URL, so 'assets/x.png' and its full form are one entry.
// A failed load is dropped, so the next request may retry it. The set is
// bounded by the shipped atlases. (DOM icons are kept as nodes instead:
// src/render/paint.js keyedChild and rows' keep.)
// ════════════════════════════════════════════════════════════════════════

const HELD = new Map();   // absolute URL -> Promise<HTMLImageElement>

/** The one decoded image for `src`, loaded at most once per page. */
export function heldImage(doc, src) {
  const url = new URL(src, doc.baseURI).href;
  let ready = HELD.get(url);
  if (ready) return ready;
  ready = new Promise((ok, no) => {
    const img = doc.createElement('img');
    img.decoding = 'async';
    img.onload = () => ok(img);
    img.onerror = () => { HELD.delete(url); no(new Error('image ' + src + ' did not load')); };
    img.src = url;
  });
  HELD.set(url, ready);
  return ready;
}
