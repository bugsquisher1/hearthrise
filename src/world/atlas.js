// ════════════════════════════════════════════════════════════════════════
// src/world/atlas.js — LOAD THE SHIPPED WORLD ART.
//
// Every set in src/data/world/atlas-sets.js is loaded on the pane's first open:
// its manifest as a JSON module and its atlas image, both with the build's
// cache-buster (paths: atlasPaths() in src/data/world/art-budget.js). The
// result is the pure book (core/book.js) over every manifest that arrived plus
// the decoded images by set. A set that fails is logged and left out — its
// sprites draw as stubs — so a slow or broken asset never blanks the pane.
// ════════════════════════════════════════════════════════════════════════
import { ATLAS_SETS } from '../data/world/atlas-sets.js?v=579';
import { atlasPaths } from '../data/world/art-budget.js?v=579';
import { createBook } from './core/book.js?v=579';

function loadImage(doc, src) {
  return new Promise((resolve, reject) => {
    const img = doc.createElement('img');
    img.decoding = 'async';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image ' + src + ' did not load'));
    img.src = src;
  });
}

/**
 * @param {{doc: Document, version: number|string}} o
 * @returns {Promise<{book: object, images: {[set: string]: HTMLImageElement}}>}
 */
export async function loadAtlases(o) {
  /* A module specifier resolves against THIS module's URL, an image against the
     document: both are made absolute from the document so assets/ is the site's. */
  const url = (path) => new URL(path + '?v=' + o.version, o.doc.baseURI).href;
  const manifests = {}, images = {};
  await Promise.all(ATLAS_SETS.map(async (set) => {
    const p = atlasPaths(set);
    try {
      const [m, img] = await Promise.all([
        import(url(p.manifest), { with: { type: 'json' } }).then((mod) => mod.default),
        loadImage(o.doc, url(p.image)),
      ]);
      manifests[set] = m;
      images[set] = img;
    } catch (e) {
      console.warn('[world] atlas "' + set + '" did not load; its sprites draw as stubs', e && e.message);
    }
  }));
  return { book: createBook(manifests), images };
}
