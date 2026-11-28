// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/talents.js — THE TALENTS WINDOW'S DOOR (the Roads map, lane/r-ui-roads, 2026-11-26).
//
// The window's row (src/data/shell-windows.js `talents`, offered only while the server sends the `talents` section) and this small
// door ship to everyone; the map itself (./talents/index.js and its modules) loads the first time the window opens with the section,
// so a player who never opens it never fetches it, and the town's boot path does not carry it (tools/build-site.mjs SITE-10). The
// game-master window's pattern (./game-master.js). The map's stylesheet (src/styles/roads.css) comes with it (lane/boot-path-diet,
// 2026-11-27): the map is built only once both are here, and the door says it is loading meanwhile.
// ════════════════════════════════════════════════════════════════════════
import { escapeHtml as esc } from '../../utils/dom.js';
import { t } from '../../render/player-text.js';

/* Not a literal import(): play.html's preload block (tests/module-preload.mjs) names every literal one, and every page would fetch the
   map. At this module's own stamp (the site build writes one on every import), so the body's imports are the page's own instances. */
const BODY_URL = new URL('./talents/index.js', import.meta.url).href + new URL(import.meta.url).search;
const SHEET_URL = new URL('../../styles/roads.css', import.meta.url).href + new URL(import.meta.url).search;
let body = null;
let loading = null;

/* The map's stylesheet, once per page: resolves when it has applied (no map is built unstyled), rejects when it failed (and is
   taken away, so the next opening asks again). No document (a test in Node): nothing to load. */
function sheet() {
  const doc = globalThis.document;
  if (!doc || !doc.head) return Promise.resolve();
  /* the selector names a <link>: a stylesheet link, not the page's generic element */
  let link = /** @type {HTMLLinkElement | null} */ (/** @type {unknown} */ (doc.querySelector('link[data-rd-sheet]')));
  if (link && link.sheet) return Promise.resolve();
  if (!link) {
    link = doc.createElement('link');
    link.rel = 'stylesheet';
    link.href = SHEET_URL;
    link.setAttribute('data-rd-sheet', '');
    doc.head.appendChild(link);
  }
  const l = link;
  return new Promise((ok, no) => {
    l.addEventListener('load', () => ok(), { once: true });
    l.addEventListener('error', () => { l.remove(); no(new Error('roads.css')); }, { once: true });
  });
}

function load(repaint) {
  if (!loading) loading = Promise.all([import(BODY_URL), sheet()]).then(([m]) => { body = m; repaint(); }, () => { loading = null; });
  return loading;
}

const hostOf = (el) => el.querySelector('[data-rd-door]');
/* the server's section: the door opens on it only (its row is offered only while the server sends it) */
const sectionOf = (cs) => { const v = cs && typeof cs.read === 'function' ? cs.read('talents') : null; return !!v && typeof v === 'object'; };

/** The door: one host the map is built into once it has loaded, saying so until then. */
export function renderTalents() {
  return '<div class="rdw-door" data-rd-door><p class="hh-empty is-on">' + esc(t('talents.loading')) + '</p></div>';
}

renderTalents.patch = function patchTalents(el, ctx) {
  const host = hostOf(el);
  if (!host || !sectionOf(ctx.character)) return;
  if (!body) { load(() => { if (el.isConnected) renderTalents.patch(el, ctx); }); return; }
  /* built once per opening: the skeleton chooses where the map opens */
  if (!host.hasAttribute('data-rd-built')) { host.innerHTML = body.renderBody(ctx); host.setAttribute('data-rd-built', ''); }
  body.patchBody(host, ctx);
};

/* the map's keys and Find talent's typing (talents/find.js) */
renderTalents.events = Object.freeze(['keydown', 'input']);

renderTalents.act = function actTalents(ctx, el, action, ev, target) {
  const host = hostOf(el);
  return body && host && host.hasAttribute('data-rd-built') ? body.actBody(ctx, host, action, ev, target) : false;
};
