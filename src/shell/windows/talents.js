// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/talents.js — THE TALENTS WINDOW'S DOOR (the Roads map, lane/r-ui-roads, 2026-11-26).
//
// The window's row (src/data/shell-windows.js `talents`, offered only while the server sends the `talents` section) and this small
// door ship to everyone; the map itself (./talents/index.js and its modules) loads the first time the window opens with the section,
// so a player who never opens it never fetches it, and the town's boot path does not carry it (tools/build-site.mjs SITE-10). The
// game-master window's pattern (./game-master.js).
// ════════════════════════════════════════════════════════════════════════

/* Not a literal import(): play.html's preload block (tests/module-preload.mjs) names every literal one, and every page would fetch the
   map. At this module's own stamp (the site build writes one on every import), so the body's imports are the page's own instances. */
const BODY_URL = new URL('./talents/index.js', import.meta.url).href + new URL(import.meta.url).search;
let body = null;
let loading = null;

function load(repaint) {
  if (!loading) loading = import(BODY_URL).then((m) => { body = m; repaint(); }, () => { loading = null; });
  return loading;
}

const hostOf = (el) => el.querySelector('[data-rd-door]');
/* the server's section: the door opens on it only (its row is offered only while the server sends it) */
const sectionOf = (cs) => { const v = cs && typeof cs.read === 'function' ? cs.read('talents') : null; return !!v && typeof v === 'object'; };

/** The door: one host the map is built into once it has loaded. */
export function renderTalents() {
  return '<div class="rdw-door" data-rd-door></div>';
}

renderTalents.patch = function patchTalents(el, ctx) {
  const host = hostOf(el);
  if (!host || !sectionOf(ctx.character)) return;
  if (!body) { load(() => { if (el.isConnected) renderTalents.patch(el, ctx); }); return; }
  /* built once per opening: the skeleton chooses where the map opens */
  if (!host.hasAttribute('data-rd-built')) { host.innerHTML = body.renderBody(ctx); host.setAttribute('data-rd-built', ''); }
  body.patchBody(host, ctx);
};

renderTalents.act = function actTalents(ctx, el, action, ev, t) {
  const host = hostOf(el);
  return body && host && host.hasAttribute('data-rd-built') ? body.actBody(ctx, host, action, ev, t) : false;
};
