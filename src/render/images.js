// ════════════════════════════════════════════════════════════════════════
// src/render/images.js — ONE DECODED IMAGE PER URL, HELD FOR THE PAGE'S LIFE.
//
// The hunt view repaints its panels every envelope. A panel that clears an
// icon and builds it again (a bar slot the server empties for one envelope, a
// loot row that leaves and comes back, a pane remounted on a character switch)
// made the browser fetch the same file again once nothing else held it:
// 216 image requests early in a hunt, the same handful repeated (Coordinator
// QA, 2026-10-20). Here every image the client shows is loaded ONCE and kept:
//
//   holdIcon(src)        a DOM icon's URL (src/shell/widgets/bits.js): its
//                        image is held, so a later <img> with the same src is
//                        served from memory, never the network
//   heldImage(doc, src)  Promise<HTMLImageElement>: the one decoded image for
//                        that URL (the world atlases, src/world/atlas.js); the
//                        World and the Character window's outfit share it
//
// Keyed by the absolute URL, so 'assets/x.png' and its full form are one entry.
// A failed load is dropped, so the next request may retry it. The set is
// bounded by the art the player has seen (the catalogue's icons and atlases).
// ════════════════════════════════════════════════════════════════════════

const HELD = new Map();   // absolute URL -> { img, ready }

function hold(doc, src) {
  const url = new URL(src, doc.baseURI).href;
  let h = HELD.get(url);
  if (h) return h;
  const img = doc.createElement('img');
  img.decoding = 'async';
  const ready = new Promise((ok, no) => {
    img.onload = () => ok(img);
    img.onerror = () => { HELD.delete(url); no(new Error('image ' + src + ' did not load')); };
  });
  ready.catch(() => { /* the caller that awaits it sees the rejection; a held icon needs no handler */ });
  img.src = url;
  h = { img, ready };
  HELD.set(url, h);
  return h;
}

/** The one decoded image for `src`, loaded at most once per page. */
export function heldImage(doc, src) {
  return hold(doc, src).ready;
}

/** Hold the image behind a DOM icon's `src` (no-op off the browser); returns `src`. */
export function holdIcon(src) {
  const doc = globalThis.document;
  if (doc && typeof doc.createElement === 'function') hold(doc, src);
  return src;
}
