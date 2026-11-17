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
// A LOAD THAT STALLS (neither loaded nor failed by LOAD_WAIT_MS: a request stuck on a bad line) is let go and asked
// again, LOAD_TRIES in all, then fails like any failed load (report #81: a sheet that never came held the town's view;
// src/world/view-sheets.js stops waiting on it long before this gives up).
// ════════════════════════════════════════════════════════════════════════

const HELD = new Map();   // absolute URL -> Promise<ImageBitmap|HTMLImageElement>
export const LOAD_WAIT_MS = 15000;
export const LOAD_TRIES = 3;

/* decode() can stay pending for good in a page that is not rendering (a hidden tab, an occluded window, the Steam
   overlay; live v0.2.106: pending at 8 s after a 38 ms load, the World on "Still loading" for 60-100 s), so it
   is waited on only this long. createImageBitmap decodes the sheet by itself. */
const DECODE_WAIT_MS = 500;

/* The sheet decoded, or DECODE_WAIT_MS gone by: whichever comes first. A decode that fails still rejects. */
function decodedOrLate(win, img) {
  if (typeof img.decode !== 'function') return Promise.resolve();
  return Promise.race([img.decode(), new Promise((late) => win.setTimeout(late, DECODE_WAIT_MS))]);
}

/**
 * The one ready sheet for `src`, loaded once per page: an ImageBitmap where the browser makes one, else the
 * <img> (drawImage takes either). A canvas's first draw of an <img> prepares the whole sheet inside that frame
 * (22 ms for the Havora sheet, run 40321779709); the bitmap is prepared here, off the frame, after decode()
 * (bounded: decodedOrLate).
 */
export function heldImage(doc, src) {
  const url = new URL(src, doc.baseURI).href;
  let ready = HELD.get(url);
  if (ready) return ready;
  const win = doc.defaultView;
  const bitmap = !!win && typeof win.createImageBitmap === 'function';
  ready = new Promise((ok, no) => {
    const fail = (why) => { HELD.delete(url); no(new Error('image ' + src + ' ' + why)); };
    function attempt(n) {
      const img = doc.createElement('img');
      let live = true;   // this try is the one being waited on
      const stall = win ? win.setTimeout(() => {
        if (!live) return;
        live = false;
        img.onload = img.onerror = null;
        img.src = '';   // the stuck request is let go, so the next try is a request of its own
        if (n < LOAD_TRIES) attempt(n + 1); else fail('stalled ' + LOAD_TRIES + ' times');
      }, LOAD_WAIT_MS) : 0;
      img.decoding = 'async';
      img.onload = () => {
        if (!live) return;
        live = false;
        if (win) win.clearTimeout(stall);
        if (!bitmap) { ok(img); return; }
        decodedOrLate(win, img).then(() => win.createImageBitmap(img)).then(ok, () => ok(img));
      };
      img.onerror = () => { if (!live) return; live = false; if (win) win.clearTimeout(stall); fail('did not load'); };
      img.src = url;
    }
    attempt(1);
  });
  HELD.set(url, ready);
  return ready;
}
