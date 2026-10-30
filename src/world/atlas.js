// ════════════════════════════════════════════════════════════════════════
// src/world/atlas.js — LOAD THE SHIPPED WORLD ART.
//
// A set (src/data/world/atlas-sets.js) is its manifest, a JSON module, and its
// atlas image, both with the build's cache-buster (paths: atlasPaths() in
// src/data/world/art-budget.js). The World pane reads EVERY manifest on its
// first open (small JSON: the book, core/book.js, must know every sprite's
// footprint and set before any map compiles) but an image only when a scene
// that draws from it is about to show (createSceneImages, the sets
// src/world/scene-sets.js derives): the town never downloads a hunting
// ground's sheet. A manifest or an image that fails is logged and left out —
// its sprites draw as stubs — so a slow or broken asset never blanks the pane.
// ════════════════════════════════════════════════════════════════════════
import { ATLAS_SETS } from '../data/world/atlas-sets.js?v=0.2.70';
import { atlasPaths } from '../data/world/art-budget.js?v=0.2.70';
import { createBook } from './core/book.js?v=0.2.70';
/* Each atlas image loads once per page (src/render/images.js): a remounted pane and the Character
   window's outfit preview reuse the decoded image instead of fetching it again. */
import { heldImage } from '../render/images.js?v=0.2.70';

/* A module specifier resolves against THIS module's URL, an image against the
   document: both are made absolute from the document so assets/ is the site's. */
const urlOf = (o, path) => new URL(path + '?v=' + o.version, o.doc.baseURI).href;

/** One set's manifest (a JSON module: fetched once per page). @param {{doc: Document, version: string}} o */
export function loadAtlasManifest(o, set) {
  return import(urlOf(o, atlasPaths(set).manifest), { with: { type: 'json' } }).then((mod) => mod.default);
}

/** One set's decoded image, once per page. @param {{doc: Document, version: string}} o */
export function loadAtlasImage(o, set) {
  return heldImage(o.doc, urlOf(o, atlasPaths(set).image));
}

/**
 * ONE set: its manifest and decoded image (the Character window's outfit
 * preview reads the `hunt` set this way). Rejects when either fails.
 * @param {{doc: Document, version: number|string}} o
 * @param {string} set
 * @returns {Promise<{manifest: object, image: HTMLImageElement}>}
 */
export async function loadAtlasSet(o, set) {
  const [manifest, image] = await Promise.all([loadAtlasManifest(o, set), loadAtlasImage(o, set)]);
  return { manifest, image };
}

/** Every base-grid manifest that arrived, by set; a set that failed is logged and left out. */
export async function loadManifests(o) {
  const manifests = {};
  await Promise.all(ATLAS_SETS.map((set) => loadAtlasManifest(o, set).then((m) => { manifests[set] = m; },
    (e) => console.warn('[world] atlas "' + set + '" did not load; its sprites draw as stubs', e && e.message))));
  return manifests;
}

/**
 * THE IMAGES ONE PANE DRAWS FROM, loaded set by set as its scenes need them.
 *   images        { set: image }: the object the backend reads; a set appears once decoded
 *   ready(sets)   every set has settled: loaded, or failed (a failed set draws stubs, as before)
 *   ensure(sets)  Promise<boolean>: resolves once ready(sets); true when every set loaded
 * @param {{doc: Document, version: string}} o
 */
export function createSceneImages(o) {
  const images = {}, settled = new Set(), loading = new Map();
  function load(set) {
    if (!loading.has(set)) {
      loading.set(set, loadAtlasImage(o, set).then((img) => { images[set] = img; return true; },
        (e) => { console.warn('[world] atlas "' + set + '" did not load; its sprites draw as stubs', e && e.message); return false; })
        .then((ok) => { settled.add(set); return ok; }));
    }
    return loading.get(set);
  }
  return {
    images,
    ready: (sets) => sets.every((s) => settled.has(s)),
    ensure: (sets) => Promise.all(sets.map(load)).then((r) => r.every(Boolean)),
  };
}

/**
 * EVERY set at once: { book, images } (a tool or test that draws anything; the pane loads by scene).
 * @param {{doc: Document, version: number|string}} o
 */
export async function loadAtlases(o) {
  const manifests = await loadManifests(o);
  const art = createSceneImages(o);
  await art.ensure(Object.keys(manifests));
  return { book: createBook(manifests), images: art.images };
}
