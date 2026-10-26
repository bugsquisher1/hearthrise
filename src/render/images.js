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
 * The one ready sheet for `src`, loaded once per page: an ImageBitmap where the browser makes one, else the
 * <img> (drawImage takes either). A canvas's first draw of an <img> prepares the whole sheet inside that frame
 * (22 ms for the Havora sheet, run 40321779709); the bitmap is prepared here, off the frame, after decode().
 */
export function heldImage(doc, src) {
  const url = new URL(src, doc.baseURI).href;
  let ready = HELD.get(url);
  if (ready) return ready;
  const win = doc.defaultView;
  const bitmap = !!win && typeof win.createImageBitmap === 'function';
  ready = new Promise((ok, no) => {
    const img = doc.createElement('img');
    img.decoding = 'async';
    img.onload = () => {
      if (!bitmap) { ok(img); return; }
      (typeof img.decode === 'function' ? img.decode() : Promise.resolve()).then(() => win.createImageBitmap(img)).then(ok, () => ok(img));
    };
    img.onerror = () => { HELD.delete(url); no(new Error('image ' + src + ' did not load')); };
    img.src = url;
  });
  HELD.set(url, ready);
  return ready;
}
