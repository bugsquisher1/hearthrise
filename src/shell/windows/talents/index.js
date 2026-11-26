// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/talents/index.js — THE TALENTS WINDOW'S BODY: THE ROADS MAP (lane/r-ui-roads, 2026-11-26).
//
// Loaded on need by its door (src/shell/windows/talents.js) the first time the window opens with the server's `talents` section, so
// the map's code is never on the boot path (tools/build-site.mjs SITE-10). renderBody / patchBody / actBody are the door's three calls
// on the door's own host element.
//
// docs/design/redesign/20-v030-the-roads.md section 4 (R-UI), 18-roads-review-ux.md, 17-talent-tree.md v3. One component: a window
// over the World on desktop (src/data/shell-windows.js `talents`, offered only while the server sends the `talents` section, i.e. while
// the Roads switch is on), a full-width sheet on a phone with the node card sliding in over the map (src/styles/roads.css).
//   band   Points and Vows (the server's), Spend as suggested (the standing rule: a toggle drawn from the server's `auto`, ONE intent
//          a press, never flipped before the answer), the zoom tier (Country, Road, Node), Recenter
//   map    ./map.js: every stone in one of four states, the route to the stone under the pointer or picked, its cost badge, the plan's
//          stones (./plan.js: the server's saved build); over it Find talent and the filters (./find.js); the stage takes the keys
//   card   ./card.js: what the picked stone is, its route and cost, its Take (ONE intent, on only from the server's state) and its Plan
//          route (ONE saveBuild); with nothing picked, the plan and Spend on plan
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
import { setTalentAuto, spendTalent } from '../../../session/talent-intents.js';
import { equipmentOf } from '../../../session/item-sections.js';
import { rows, text, prop, cls, attr, element } from '../../../render/paint.js';
import { whole } from '../../../render/format.js';
import { runIntent } from '../../intent-words.js';
import { t } from '../../../render/player-text.js';
import { mapHtml, mapOf, paintMap, bindGestures, nodeAt, countryAt } from './map.js';
import { cardHtml, patchCard } from './card.js';
import { fitScale, tierOf, scaleOf, toMap, clampCam, zoomAbout, stepScale, tierIn, TIERS } from './camera.js';
import { planOf, actPlan } from './plan.js';
import { findTalents, FILTERS, stoneToward } from './find.js';
import { keyBelongsToField } from '../../../utils/dom.js';

/* the plan the map reads the suggested road for (the company joins at Level 5, 17 section 13): the card's and the tab's */
const PLAN = 'party';
const SCRATCH = new WeakMap();
const scratchOf = (cs) => {
  let s = SCRATCH.get(cs);
  if (!s) {
    s = { cam: null, sel: null, hover: null, pending: false, msg: '', memo: null, frame: 0,
      /* the stage as last painted ({ w, h, fit, phone }), the country list's measured width, and a pending Country fit */
      view: null, listW: 0, fitCountry: false,
      /* Find talent's words and rows, and the filters on (find.js): display scratch */
      find: '', found: [], filters: new Set() };
    SCRATCH.set(cs, s);
  }
  return s;
};
const roleKeyOf = (cs) => { const eq = /** @type {{ weapon?: string }} */ (equipmentOf(cs) || {}); return eq && eq.weapon && ITEMS[eq.weapon] ? wornRoleKey(eq, ITEMS) : null; };

/** The skeleton (built once per opening): an opening starts where the hero is (the camera is chosen at the first paint). */
export function renderBody(ctx) {
  if (ctx.character) { const sc = scratchOf(ctx.character); sc.cam = null; sc.sel = null; sc.hover = null; sc.msg = ''; sc.find = ''; sc.found = []; }
  return '<div class="rdw">'
    + '<div class="rdw-band">'
    + '<p class="rdw-stat"><span></span><b class="rdw-points"></b></p><p class="rdw-stat"><span></span><b class="rdw-vows"></b></p>'
    /* the band's one toggle (18 section 8): the standing rule, as the server holds it */
    + '<button type="button" class="hh-tool rdw-auto" data-hs-act="rd-auto" aria-pressed="false"></button>'
    + '<span class="rdw-gap"></span>'
    + '<div class="hw-tabs rdw-tiers" role="tablist">' + TIERS.map((k) => '<button type="button" role="tab" class="hw-tab" data-hs-act="rd-tier" data-tier="' + k + '"></button>').join('') + '</div>'
    + '<button type="button" class="hh-tool is-link" data-hs-act="rd-home"></button>'
    + '</div>'
    + '<div class="rdw-main"><div class="rdw-mapbox">' + mapHtml() + '<ul class="rdw-countries"></ul>'
    /* Find talent and the filters, over the map's top left (find.js) */
    + '<div class="rdw-tools"><div class="rdw-findbox"><input type="search" class="rdw-find" data-hs-act="rd-find" autocomplete="off" spellcheck="false">'
    + '<ul class="rdw-found"></ul><p class="hs-note rdw-found-none"></p></div>'
    + Object.keys(FILTERS).map((f) => '<button type="button" class="hh-tool rdw-filter" data-hs-act="rd-filter" data-filter="' + f + '" aria-pressed="false"></button>').join('')
    + '</div></div>' + cardHtml() + '</div>'
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
  const go = () => { sc.frame = 0; if (body.isConnected) patchBody(body, ctx); };
  sc.frame = w && w.requestAnimationFrame ? w.requestAnimationFrame(go) : (setTimeout(go, 16), 1);
}

export function patchBody(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const root = body.querySelector('.rdw');
  const tl = talentsOf(cs, roleKeyOf(cs), PLAN);
  const memo = memoOf(sc, tl);
  const plan = planOf(cs, tl);
  const L = roadsLayout();
  const phone = phoneOf(ctx);
  /* the band: the server's points and vow slots */
  const bandStats = root.querySelectorAll('.rdw-stat');
  text(bandStats[0].querySelector('span'), t('talents.points_label'));
  text(root.querySelector('.rdw-points'), whole(tl ? tl.left : 0));
  const vw = tl ? vowsOf(tl.nodes, tl.level) : { held: 0, open: 0 };
  text(bandStats[1].querySelector('span'), t('talents.vows_label'));
  text(root.querySelector('.rdw-vows'), t('talents.vows_of', { held: whole(vw.held), open: whole(vw.open) }));
  /* Spend as suggested, the standing rule: pressed exactly while the SERVER's section says it is on (`auto`), never flipped by the
     press itself; off while a press is out (its busy line says so) */
  const go = root.querySelector('[data-hs-act="rd-auto"]');
  text(go, t('talents.spend_suggested'));
  attr(go, 'aria-pressed', String(!!(tl && tl.auto)));
  prop(go, 'disabled', sc.pending);
  text(root.querySelector('[data-hs-act="rd-home"]'), t('talents.recenter'));
  patchTools(root, ctx, sc);

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
    paintMap(M, { cam: sc.cam, w, h, states: memo.states, picks: memo.picks, route: routeOf(memo, tl, shown), sel: sc.sel, counts: memo.counts,
      planned: plan.planned, filters: sc.filters });
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
  const home = homeOf(cs, tl);
  patchCard(card, ctx, { tl, sel: sc.sel, route: routeOf(memo, tl, sc.sel), states: memo.states, fork: home === 'hearth' ? null : home, pending: sc.pending, msg: sc.msg,
    plan, suggest: PLAN });
}

/* Find talent's rows and the filters' toggles (find.js); the typed words are the input's own, never written back but to clear them */
function patchTools(root, ctx, sc) {
  const input = root.querySelector('.rdw-find');
  attr(input, 'placeholder', t('talents.find'));
  attr(input, 'aria-label', t('talents.find'));
  if (!sc.find && input.value) input.value = '';
  rows(root.querySelector('.rdw-found'), sc.found, {
    key: (r) => r.id + '|' + r.label,
    build: (r) => element(ctx.doc, '<li><button type="button" class="hh-tool is-link rdw-hit" data-hs-act="rd-found" data-node="' + r.id + '"><b></b><small></small></button></li>'),
    patch: (li, r) => { text(li.querySelector('b'), r.label); text(li.querySelector('small'), r.sub); },
  });
  text(root.querySelector('.rdw-found-none'), sc.find.trim().length >= 2 && !sc.found.length ? t('talents.find_none') : '');
  for (const b of root.querySelectorAll('[data-hs-act="rd-filter"]')) {
    const f = b.getAttribute('data-filter');
    text(b, t('talents.filter_' + f));
    attr(b, 'aria-pressed', String(sc.filters.has(f)));
  }
}

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

/* pick stone `id` and bring it on screen: centred when it stands outside the stage's inner room, else where it is */
function pickStone(body, ctx, sc, id) {
  const v = sc.view;
  sc.sel = id; sc.hover = null; sc.msg = '';
  const p = roadsLayout().pos[id];
  if (!v || !sc.cam || !p) { patchBody(body, ctx); return; }
  const s = Math.max(sc.cam.s, scaleOf('road', v.fit, v.phone));
  const sx = (p.x - sc.cam.cx) * s + v.w / 2, sy = (p.y - sc.cam.cy) * s + v.h / 2, m = 48;
  if (s !== sc.cam.s || sx < m || sy < m || sx > v.w - m || sy > v.h - m) flyTo(body, ctx, sc, p, s); else schedule(body, ctx, sc);
}

const ARROWS = Object.freeze({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] });

/* THE KEYS on the stage, and the words typed into Find talent (find.js); true when the key was the map's */
function actKeys(ctx, body, sc, action, ev, el) {
  if (action === 'rd-find' && ev.type === 'input') {
    sc.find = String(el.value || '');
    sc.found = findTalents(sc.find);
    patchTools(body.querySelector('.rdw'), ctx, sc);
    return false;
  }
  if (action === 'rd-find' && ev.type === 'keydown') {
    if (ev.key === 'Enter' && !ev.isComposing && sc.found.length) { const id = sc.found[0].id; sc.find = ''; sc.found = []; pickStone(body, ctx, sc, id); return true; }
    if (ev.key === 'Escape' && sc.find) { sc.find = ''; sc.found = []; patchBody(body, ctx); return true; }
    return false;
  }
  if (action !== 'rd-keys' || ev.type !== 'keydown' || keyBelongsToField(ev.target, ev.key) || ev.altKey || ev.ctrlKey || ev.metaKey) return false;
  const v = sc.view;
  if (!v || !sc.cam) return false;
  const dir = ARROWS[ev.key];
  if (dir) {
    if (tierOf(sc.cam.s) === 'country') return false;
    const tl = talentsOf(ctx.character, roleKeyOf(ctx.character), PLAN);
    const next = sc.sel ? stoneToward(roadsLayout().pos, sc.sel, dir[0], dir[1]) : homeOf(ctx.character, tl);
    if (next) pickStone(body, ctx, sc, next);
    return true;
  }
  if (ev.key === 'Enter' || ev.key === ' ') {
    /* the card's own Take, exactly as a press would send it: on only from the server's state */
    const take = body.querySelector('.rdw-card .rdw-take');
    if (sc.sel && take && !take.hidden && !take.disabled) take.click();
    return !!sc.sel;
  }
  if (ev.key === 'Escape' && sc.sel) { sc.sel = null; sc.msg = ''; patchBody(body, ctx); return true; }
  if (ev.key === '+' || ev.key === '=' || ev.key === '-') {
    const s = ev.key === '-' ? stepScale(sc.cam.s, 1 / 1.6, v.fit, v.phone) : tierIn(sc.cam.s, v.fit, v.phone);
    moveTo(body, ctx, sc, zoomAbout(sc.cam, v.w, v.h, v.w / 2, v.h / 2, s));
    return true;
  }
  return false;
}

export function actBody(ctx, body, action, ev, el) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  if (ev.type !== 'click') return actKeys(ctx, body, sc, action, ev, el);
  const repaint = () => patchBody(body, ctx);
  const v = sc.view;
  const tlOf = () => talentsOf(cs, roleKeyOf(cs), PLAN);
  if (actPlan(ctx, sc, action, el, repaint, tlOf, PLAN)) return true;
  if (action === 'rd-filter') {
    const f = el.getAttribute('data-filter');
    if (Object.prototype.hasOwnProperty.call(FILTERS, f)) { if (sc.filters.has(f)) sc.filters.delete(f); else sc.filters.add(f); }
    repaint();
    return true;
  }
  if (action === 'rd-found') {
    const id = el.getAttribute('data-node');
    sc.find = ''; sc.found = [];
    if (id && NODE_INDEX[id]) pickStone(body, ctx, sc, id); else repaint();
    return true;
  }
  if (action === 'rd-auto') {
    const tl = tlOf();
    if (!tl) return true;
    const on = !tl.auto;
    runIntent(sc, repaint, () => setTalentAuto(ctx.account, cs, on ? PLAN : null), t('talents.spending'),
      (r) => (on && r.spent ? (r.spent === 1 ? t('talents.spent_one') : t('talents.spent_many', { count: whole(r.spent) })) : t(on ? 'talents.auto_on' : 'talents.auto_off')), cs);
    return true;
  }
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
  if (action === 'rd-take' && sc.sel) {
    const node = sc.sel, pick = el.getAttribute('data-pick');
    runIntent(sc, repaint, () => spendTalent(ctx.account, cs, node, pick || null), t('talents.taking'), () => t('talents.taken'), cs);
    return true;
  }
  return false;
}
