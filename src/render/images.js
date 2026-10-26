// ════════════════════════════════════════════════════════════════════════
// src/render/images.js — ONE READY SHEET PER URL, HELD FOR THE PAGE'S LIFE.
//
// The world atlases are big sheets every World mount and the Character
// window's outfit preview read. Each asked for its own new image, so a pane
// remounted (a character switch, a sign-in again) fetched every sheet again
// (Coordinator QA, 2026-10-20). Here a sheet loads ONCE per page:
//
//   heldImage(doc, src)  Promise<ImageBitmap|HTMLImageElement>: the one ready
//                        sheet for that URL (src/world/atlas.js)
//
// Keyed by the absolute URL, so 'assets/x.png' and its full form are one entry.
// A failed load is dropped, so the next request may retry it. The set is
// bounded by the shipped atlases. (DOM icons are kept as nodes instead:
// src/render/paint.js keyedChild and rows' keep.)
// ════════════════════════════════════════════════════════════════════════

const HELD = new Map();   // absolute URL -> Promise<ImageBitmap|HTMLImageElement>

/**
 * The one ready sheet for `src`, loaded at most once per page: an ImageBitmap where the browser makes one,
 * else the loaded image. Every reader draws it on a canvas (drawImage takes either; both have width/height).
 * WHY A BITMAP (run 40321779709, perf red on v0.2.50): a canvas's first drawImage of an <img> prepares the
 * whole sheet on the main thread inside that frame, decode() or not: 22 ms for the 2048 x 1664 Havora sheet,
 * on the frame the town is entered after a hunt (tests/perf-budget.mjs). createImageBitmap does it off the
 * frame, so the first draw costs what any other does. It is made from the fetched BYTES: made from an <img>
 * it decodes on the main thread (a 44 ms task in the same profile); from a Blob the browser decodes it off
 * the thread. A browser without either, or a fetch or decode that fails, falls back to the <img>.
 */
export function heldImage(doc, src) {
  const url = new URL(src, doc.baseURI).href;
  let ready = HELD.get(url);
  if (ready) return ready;
  const win = doc.defaultView;
  const viaImg = () => new Promise((ok, no) => {
    const img = doc.createElement('img');
    img.decoding = 'async';
    img.onload = () => ok(img);
    img.onerror = () => no(new Error('image ' + src + ' did not load'));
    img.src = url;
  });
  const bitmap = win && typeof win.createImageBitmap === 'function' && typeof win.fetch === 'function';
  ready = (bitmap
    ? win.fetch(url).then((r) => { if (!r.ok) throw new Error('image ' + src + ' answered ' + r.status); return r.blob(); })
      .then((b) => win.createImageBitmap(b)).catch(viaImg)
    : viaImg())
    .catch((e) => { HELD.delete(url); throw e; });
  HELD.set(url, ready);
  return ready;
}
