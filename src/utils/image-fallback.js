// ============================================================
// src/utils/image-fallback.js
//
// Global handler for failed image loads. Replaces the browser's
// default broken-image placeholder (the ugly gray square with a
// torn-page icon) with a styled emoji glyph that matches the rest
// of the UI.
//
// Why this exists:
//   • Some asset packs contain placeholder mappings that point at
//     paths the user hasn't installed yet.
//   • Local dev servers occasionally hiccup and 404 individual
//     PNGs even though the parent folder serves fine.
//   • Production CDN failures shouldn't make the UI look broken.
//
// What it does:
//   • Listens (in capture phase) for `error` events on `img` elements.
//   • For images that came from `/assets/raw-bundle/`, replaces them
//     with a `<span class="icon-fallback">` containing a glyph from
//     a `data-fb-glyph` attribute, the image's `alt` text, or a
//     generic 📦.
//   • Also styles `img.icon-broken` so even un-handled errors render
//     subtly instead of jarringly.
//
// Imported for side effects:
//   import './utils/image-fallback.js';
// ============================================================

const FALLBACK_CLASS = 'icon-fallback';

/**
 * Replace a broken `<img>` element with a styled span fallback.
 * Idempotent — if already replaced, the second call is a no-op.
 *
 * @param {HTMLImageElement} img
 */
function replaceBrokenImg(img) {
  if (!img || img.dataset.fbDone === '1') return;
  img.dataset.fbDone = '1';

  // Pick the best fallback glyph available. Order:
  //   1. data-fb-glyph attribute (set by render code that knows what fits)
  //   2. emoji in alt text (legacy renderers sometimes set alt to the emoji)
  //   3. generic 📦 (better than a broken box)
  let glyph = img.getAttribute('data-fb-glyph')
           || (img.alt && img.alt.length <= 3 ? img.alt : '')
           || '📦';

  // Style the replacement so it visually fills the same space the
  // image was occupying. Inherits parent padding / border-radius.
  const span = document.createElement('span');
  span.className = FALLBACK_CLASS;
  span.textContent = glyph;
  span.style.cssText = ''
    + 'display:inline-flex;'
    + 'align-items:center;justify-content:center;'
    + 'width:100%;height:100%;'
    + 'font-size:max(60%, 18px);'
    + 'color:rgba(243,209,129,.7);'         // soft gold so it reads as deliberate
    + 'opacity:.85;';
  if (img.parentNode) {
    img.parentNode.replaceChild(span, img);
  } else {
    img.style.display = 'none';
  }
}

/**
 * Capture-phase error listener — runs before the bubbling phase so
 * we can catch IMG errors anywhere in the tree without the renderer
 * having to opt in.
 */
function onError(e) {
  const t = e.target;
  if (!t || t.tagName !== 'IMG') return;
  // Only swap our own asset images so we don't accidentally rewrite
  // someone else's broken third-party img.
  const src = t.getAttribute('src') || '';
  if (!src) return;
  // Match either `assets/raw-bundle/...` or any local image path —
  // safer to be greedy here than to miss icons.
  if (src.indexOf('http') === 0 && src.indexOf(location.origin) !== 0) return;
  replaceBrokenImg(t);
}

if (typeof window !== 'undefined') {
  // Capture phase — `error` events on img don't bubble, so capture is
  // the only way to catch them via document-level delegation.
  window.addEventListener('error', onError, /* useCapture */ true);

  // Sweep any images that already failed before we attached the handler.
  // (Browser fires error events synchronously during initial decode.)
  function sweep() {
    document.querySelectorAll('img').forEach(img => {
      if (img.complete && img.naturalWidth === 0) {
        replaceBrokenImg(img);
      }
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(sweep, 100));
  } else {
    setTimeout(sweep, 100);
  }
  // Re-sweep periodically — render functions in legacy.js inject new
  // `<img>` elements that may fail after the initial pass. Cheap.
  setInterval(sweep, 2000);

  console.log('[image-fallback] global broken-image handler armed');
}
