// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/talents/index.js — THE TALENTS WINDOW: THE ROADS MAP (lane/r-ui-roads, 2026-11-26).
//
// docs/design/redesign/20-v030-the-roads.md section 4 (R-UI), 18-roads-review-ux.md, 17-talent-tree.md v3. One component: a window
// over the World on desktop (src/data/shell-windows.js `talents`, offered only while the server sends the `talents` section, i.e. while
// the Roads switch is on), a full-width sheet on a phone with the node card sliding in over the map (src/styles/roads.css).
//   band   Points and Vows (the server's), Spend as suggested (ONE intent), the zoom tier (Country, Road, Node), Recenter
//   map    ./map.js: every stone in one of four states, the route to the stone under the pointer or picked, its cost badge
//   card   ./card.js: what the picked stone is, its route and cost, and its Take (ONE intent, on only from the server's state)
//   list   Country view: each country with its owned count; a press flies there at Road view
// OPENS WHERE YOU ARE (18 section 3): every opening starts at Road view on the next stone of the hero's suggested road.
// The camera, the pick and the hover are display scratch in memory (this file's WeakMap), never the residue and never sent.
// ════════════════════════════════════════════════════════════════════════
import { NODE_INDEX, TALENT_NODES, COUNTRY_ROADS } from '../../../data/talents.js';
import { wornRoleKey, disciplineOf } from '../../../data/hunt-roles.js';
import { ITEMS } from '../../../data/items.js';
import { MOBILE_QUERY } from '../../../render/mobile-query.js';
import { roadsLayout } from '../../../render/roads-layout.js';
import { nodeStates, routeTo, nextSuggested, vowsOf } from '../../../core/talent-route.js';
import { talentsOf } from '../../../session/talent-sections.js';
import { spendSuggested, spendTalent } from '../../../session/talent-intents.js';
import { equipmentOf } from '../../../session/item-sections.js';
import { rows, text, prop, cls, attr, element } from '../../../render/paint.js';
import { whole } from '../../../render/format.js';
import { runIntent } from '../../intent-words.js';
import { t } from '../../../render/player-text.js';
import { mapHtml, mapOf, paintMap, bindGestures, nodeAt, countryAt } from './map.js';
import { cardHtml, patchCard } from './card.js';
import { fitScale, tierOf, scaleOf, toMap, clampCam, zoomAbout, stepScale, tierIn, TIERS } from './camera.js';

/* the plan the map reads the suggested road for (the company joins at Level 5, 17 section 13): the card's and the tab's */
const PLAN = 'party';
const SCRATCH = new WeakMap();
const scratchOf = (cs) => {
  let s = SCRATCH.get(cs);
  if (!s) {
    s = { cam: null, sel: null, hover: null, pending: false, msg: '', memo: null, frame: 0,
      /* the stage as last painted ({ w, h, fit, phone }), the country list's measured width, and a pending Country fit */
      view: null, listW: 0, fitCountry: false };
    SCRATCH.set(cs, s);
  }
  return s;
};
const roleKeyOf = (cs) => { const eq = /** @type {{ weapon?: string }} */ (equipmentOf(cs) || {}); return eq && eq.weapon && ITEMS[eq.weapon] ? wornRoleKey(eq, ITEMS) : null; };

/** The skeleton (built once per opening): an opening starts where the hero is (the camera is chosen at the first paint). */
export function renderTalentsMap(ctx) {
  if (ctx.character) { const sc = scratchOf(ctx.character); sc.cam = null; sc.sel = null; sc.hover = null; sc.msg = ''; }
  return '<div class="rdw">'
    + '<div class="rdw-band">'
    + '<p class="rdw-stat"><span></span><b class="rdw-points"></b></p><p class="rdw-stat"><span></span><b class="rdw-vows"></b></p>'
    + '<button type="button" class="hh-tool" data-hs-act="rd-suggested"></button><p class="hs-note rdw-band-why"></p>'
    + '<span class="rdw-gap"></span>'
    + '<div class="hw-tabs rdw-tiers" role="tablist">' + TIERS.map((k) => '<button type="button" role="tab" class="hw-tab" data-hs-act="rd-tier" data-tier="' + k + '"></button>').join('') + '</div>'
    + '<button type="button" class="hh-tool is-link" data-hs-act="rd-home"></button>'
    + '</div>'
    + '<div class="rdw-main"><div class="rdw-mapbox">' + mapHtml() + '<ul class="rdw-countries"></ul></div>' + cardHtml() + '</div>'
    + '</div>';
}

/* the stone the map opens on: the next stone of the suggested road, else the hearth */
function homeOf(cs, tl) {
  const disc = disciplineOf(roleKeyOf(cs));
  return (tl && nextSuggested(tl.nodes, disc, PLAN)) || 'hearth';
}

/* one parse per server section: the states and the counts (the section object is replaced whole by each envelope) */
function memoOf(sc, tl) {
  if (sc.memo && sc.memo.tl === tl) return sc.memo;
  const states = tl ? nodeStates(tl.nodes, tl.level) : {};
  const counts = {};
  for (const c of Object.keys(COUNTRY_ROADS)) counts[c] = [0, 0];
  for (const n of TALENT_NODES) if (counts[n.country]) { counts[n.country][1]++; if (states[n.id] === 'owned') counts[n.country][0]++; }
  const picks = {};
  for (const [k, v] of Object.entries((tl && tl.nodes) || {})) if (typeof v === 'string') picks[k] = v;
  sc.memo = { tl, states, counts, picks, routes: new Map() };
  return sc.memo;
}
function routeOf(memo, tl, id) {
  if (!id || !tl) return null;
  if (!memo.routes.has(id)) memo.routes.set(id, routeTo(tl.nodes, tl.level, id, tl.left));
  return memo.routes.get(id);
}

const phoneOf = (ctx) => { const w = ctx.doc && ctx.doc.defaultView; return !!(w && w.matchMedia && w.matchMedia(MOBILE_QUERY).matches); };

/* the next frame's repaint (gestures move the camera many times a frame: one paint) */
function schedule(body, ctx, sc) {
  if (sc.frame) return;
  const w = ctx.doc && ctx.doc.defaultView;
  const go = () => { sc.frame = 0; if (body.isConnected) renderTalentsMap.patch(body, ctx); };
  sc.frame = w && w.requestAnimationFrame ? w.requestAnimationFrame(go) : (setTimeout(go, 16), 1);
}

renderTalentsMap.patch = function patchTalentsMap(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const root = body.querySelector('.rdw');
  const tl = talentsOf(cs, roleKeyOf(cs), PLAN);
  const memo = memoOf(sc, tl);
  const L = roadsLayout();
  const phone = phoneOf(ctx);
  /* the band: the server's points and vow slots; Spend as suggested is ONE intent, off with no point to spend */
  const bandStats = root.querySelectorAll('.rdw-stat');
  text(bandStats[0].querySelector('span'), t('talents.points_label'));
  text(root.querySelector('.rdw-points'), whole(tl ? tl.left : 0));
  const vw = tl ? vowsOf(tl.nodes, tl.level) : { held: 0, open: 0 };
  text(bandStats[1].querySelector('span'), t('talents.vows_label'));
  text(root.querySelector('.rdw-vows'), t('talents.vows_of', { held: whole(vw.held), open: whole(vw.open) }));
  const go = root.querySelector('[data-hs-act="rd-suggested"]');
  text(go, t('talents.spend_suggested'));
  const noPoints = !tl || !tl.left;
  prop(go, 'disabled', noPoints || sc.pending);
  text(root.querySelector('.rdw-band-why'), noPoints ? t('talents.no_points') : '');
  text(root.querySelector('[data-hs-act="rd-home"]'), t('talents.recenter'));

  /* the map: sized to its stage, opened where the hero is */
  const stage = root.querySelector('[data-rd-stage]');
  const M = mapOf(stage);
  bindGestures(stage, gestures(body, ctx, sc, M));
  watchSize(stage, body, ctx, sc);
  const w = Math.round(stage.clientWidth), h = Math.round(stage.clientHeight);
  /* Country view's list shows before the map is fitted beside it (its width measured, never typed twice) */
  const list = root.querySelector('.rdw-countries');
  attr(list, 'hidden', sc.cam && tierOf(sc.cam.s) === 'country' ? null : '');
  if (list.offsetWidth) sc.listW = list.offsetWidth;
  if (w > 0 && h > 0) {
    const fit = fitScale(L.bounds, Math.max(1, w - (sc.listW || 0)), h);
    if (!sc.cam) { const p = L.pos[homeOf(cs, tl)] || L.pos.hearth; sc.cam = { cx: p.x, cy: p.y, s: scaleOf('road', fit, phone) }; }
    /* a press on Country: the whole map, its middle in the room right of the list */
    if (sc.fitCountry) { const b = L.bounds; sc.cam = { cx: (b.x0 + b.x1) / 2 - (sc.listW || 0) / 2 / fit, cy: (b.y0 + b.y1) / 2, s: fit }; sc.fitCountry = false; }
    sc.cam = clampCam(sc.cam, L.bounds, fit);
    sc.view = { w, h, fit, phone };
    const shown = sc.hover && NODE_INDEX[sc.hover] ? sc.hover : sc.sel;
    paintMap(M, { cam: sc.cam, w, h, states: memo.states, picks: memo.picks, route: routeOf(memo, tl, shown), sel: sc.sel, counts: memo.counts });
  }
  const tier = sc.cam ? tierOf(sc.cam.s) : 'road';
  attr(root, 'data-tier', tier);
  for (const b of root.querySelectorAll('.rdw-tiers [data-tier]')) {
    const k = b.getAttribute('data-tier');
    text(b, t('talents.tier_' + k));
    attr(b, 'aria-selected', String(k === tier));
  }
  /* Country view: the countries as a list, each a press that flies there */
  attr(list, 'hidden', tier === 'country' ? null : '');
  rows(list, tier === 'country' ? L.countries : [], {
    key: (c) => c.id,
    build: (c) => element(ctx.doc, '<li><button type="button" class="hh-tool is-link rdw-country" data-hs-act="rd-country" data-country="' + c.id + '"><b></b><span></span></button></li>'),
    patch: (li, c) => {
      text(li.querySelector('b'), t('talents.country_' + c.id));
      text(li.querySelector('span'), t('talents.country_count', { owned: whole(memo.counts[c.id][0]), total: whole(memo.counts[c.id][1]) }));
    },
  });
  /* the card */
  const card = root.querySelector('.rdw-card');
  cls(root, 'is-picked', !!sc.sel);
  patchCard(card, ctx, { tl, sel: sc.sel, route: routeOf(memo, tl, sc.sel), states: memo.states, fork: homeOf(cs, tl) === 'hearth' ? null : homeOf(cs, tl), pending: sc.pending, msg: sc.msg });
};

/* a size change repaints (the window docks, the phone turns, the card opens) */
const WATCHED = new WeakSet();
function watchSize(stage, body, ctx, sc) {
  const W = ctx.doc && ctx.doc.defaultView;
  if (WATCHED.has(stage) || !W || typeof W.ResizeObserver !== 'function') return;
  WATCHED.add(stage);
  new W.ResizeObserver(() => schedule(body, ctx, sc)).observe(stage);
}

/* the camera moved to `cam` (held over the map) and painted next frame */
function moveTo(body, ctx, sc, cam) {
  const v = sc.view;
  if (!v) return;
  sc.cam = clampCam(cam, roadsLayout().bounds, v.fit);
  schedule(body, ctx, sc);
}
/* centre on map point p at scale s */
const flyTo = (body, ctx, sc, p, s) => moveTo(body, ctx, sc, { cx: p.x, cy: p.y, s });

function gestures(body, ctx, sc, M) {
  return {
    pan: (dx, dy) => { if (sc.cam) moveTo(body, ctx, sc, { ...sc.cam, cx: sc.cam.cx - dx / sc.cam.s, cy: sc.cam.cy - dy / sc.cam.s }); },
    zoom: (f, sx, sy) => {
      const v = sc.view;
      if (!sc.cam || !v) return;
      moveTo(body, ctx, sc, zoomAbout(sc.cam, v.w, v.h, sx, sy, stepScale(sc.cam.s, f, v.fit, v.phone)));
    },
    dbl: (sx, sy) => {
      const v = sc.view;
      if (!sc.cam || !v) return;
      moveTo(body, ctx, sc, zoomAbout(sc.cam, v.w, v.h, sx, sy, tierIn(sc.cam.s, v.fit, v.phone)));
    },
    tap: (sx, sy) => {
      const v = sc.view;
      if (!sc.cam || !v) return;
      if (tierOf(sc.cam.s) === 'country') {
        const p = toMap(sc.cam, v.w, v.h, sx, sy), c = countryAt(M, p.x, p.y);
        if (c) flyTo(body, ctx, sc, firstStone(c.id), scaleOf('road', v.fit, v.phone));
        return;
      }
      const id = nodeAt(M, sc.cam, v.w, v.h, sx, sy);
      sc.sel = id;
      sc.hover = null;
      sc.msg = '';
      /* a phone's card covers the map's right edge: a stone picked under it moves to the middle of the room left of it (18 section 6) */
      const card = body.querySelector('.rdw-card');
      const cw = v.phone && card ? card.offsetWidth : 0;
      if (id && cw && sx > v.w - cw - 24) { const p = roadsLayout().pos[id]; moveTo(body, ctx, sc, { ...sc.cam, cx: p.x + (cw / 2) / sc.cam.s, cy: p.y }); }
      else schedule(body, ctx, sc);
    },
    hover: (sx, sy) => {
      const v = sc.view;
      const id = sx === null || !sc.cam || !v ? null : nodeAt(M, sc.cam, v.w, v.h, sx, sy);
      if (id === sc.hover) return;
      sc.hover = id;
      schedule(body, ctx, sc);
    },
  };
}
/* a country's place to fly to: its first crossroads */
const firstStone = (country) => { const L = roadsLayout(); const m = COUNTRY_ROADS[country] && COUNTRY_ROADS[country][0]; return (m && L.pos[m + '.x1']) || L.pos.hearth; };

renderTalentsMap.act = function actTalentsMap(ctx, body, action, ev, el) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => renderTalentsMap.patch(body, ctx);
  const v = sc.view;
  if (action === 'rd-tier' && v && sc.cam) {
    const tier = el.getAttribute('data-tier');
    const s = scaleOf(tier, v.fit, v.phone);
    const p = sc.sel && roadsLayout().pos[sc.sel];
    /* Country view shows the whole map beside its list: fitted at the next paint, once the list stands (patch's fitCountry) */
    if (tier === 'country') { sc.fitCountry = true; moveTo(body, ctx, sc, { ...sc.cam, s }); }
    else if (p) flyTo(body, ctx, sc, p, s); else moveTo(body, ctx, sc, { ...sc.cam, s });
    return true;
  }
  if (action === 'rd-home' && v) {
    const tl = talentsOf(cs, roleKeyOf(cs), PLAN);
    flyTo(body, ctx, sc, roadsLayout().pos[homeOf(cs, tl)], scaleOf('road', v.fit, v.phone));
    return true;
  }
  if (action === 'rd-country' && v) { flyTo(body, ctx, sc, firstStone(el.getAttribute('data-country')), scaleOf('road', v.fit, v.phone)); return true; }
  if (action === 'rd-clear') { sc.sel = null; sc.msg = ''; repaint(); return true; }
  if (action === 'rd-show' || action === 'rd-step') {
    const tl = talentsOf(cs, roleKeyOf(cs), PLAN);
    const id = action === 'rd-show' ? homeOf(cs, tl) : el.getAttribute('data-node');
    if (id && NODE_INDEX[id]) {
      sc.sel = id; sc.msg = '';
      if (v && sc.cam) flyTo(body, ctx, sc, roadsLayout().pos[id], Math.max(sc.cam.s, scaleOf('road', v.fit, v.phone))); else repaint();
    }
    return true;
  }
  if (action === 'rd-suggested') {
    runIntent(sc, repaint, () => spendSuggested(ctx.account, cs, PLAN), t('talents.spending'),
      (r) => (r.spent === 1 ? t('talents.spent_one') : t('talents.spent_many', { count: whole(r.spent || 0) })), cs);
    return true;
  }
  if (action === 'rd-take' && sc.sel) {
    const node = sc.sel, pick = el.getAttribute('data-pick');
    runIntent(sc, repaint, () => spendTalent(ctx.account, cs, node, pick || null), t('talents.taking'), () => t('talents.taken'), cs);
    return true;
  }
  return false;
};
