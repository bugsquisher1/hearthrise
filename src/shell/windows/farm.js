// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/farm.js — THE FARM: A ROW OF SOIL PLOTS YOU TEND.
//
// ART_DIRECTION §12: the Farm is soil plots, not a card grid. One row of plots,
// as many as the SERVER says the land holds (`farm_land.cap`: 2 at the Camp,
// more with the property and the Garden), each showing what grows in it at ×2,
// how long it has left and which hero planted it. The land is the ACCOUNT's
// (Tyler 2026-10-23, 2026-12-14-shared-farm.sql): every hero sees and tends the
// same plots, and the window says so. The buttons act as the hero on screen: its
// seeds and gold pay, its bag and Farming XP take the crop. An EXTRA plot (past
// the cap) is drawn after the others and goes once harvested. Under the field,
// one line for the plot tier and its price, and the seed picker for the plot you
// pressed.
//   An empty plot      press it: pick a seed you hold (the crops you can plant list
//                      first; the others say why: the Farming level or the plot tier
//                      they need; with no seed, where to buy one) → ONE hr_farm_plant.
//                      The picker then moves on to the server's next empty plot, where
//                      it stands (Discord 0.2.95: "scrolling up and down to select new
//                      plantable seeds over and over is tedious"). "Plant N empty
//                      plots" sends ONE hr_farm_plant per empty plot, in order, and stops
//                      at the first refusal with its words.
//   A growing plot     Water (2 h at double speed) while the server says it may
//                      be watered → ONE hr_farm_water.
//   A ready plot       Harvest and replant (the designer's model: the same crop goes back in,
//                      from your own seed, else one bought at the Shop's price) →
//                      ONE hr_farm_harvest_replant; "Harvest only" → hr_farm_harvest (Tyler 10-25).
//                      A REGROWING crop (tomato, emberfruit: CROPS regrows) stays in the ground
//                      after a harvest, so its plot says how often it grows back (the server's
//                      `regrows_left`) and offers "Harvest (grows back N more times)" →
//                      hr_farm_harvest and "Harvest and clear plot" → hr_farm_harvest_clear
//                      (report #66). On its last harvest it withers, so it reads like any crop.
//   The plot tier      Improve the soil at the server's price → hr_farm_upgrade_plot.
// Every number is the server's (src/session/farm-sections.js). The countdown only
// displays, and when it runs out the window asks the server again; Harvest opens
// on the server's `ready`, never on the clock. Every control is off while an
// intent is in flight; the field changes only from the re-read envelope.
// ════════════════════════════════════════════════════════════════════════
import { farmLandOf, readyInMs } from '../../session/farm-sections.js?v=0.2.125';
import { plantCrop, waterPlot, harvestPlot, clearPlot, upgradePlot } from '../../session/farm-intents.js?v=0.2.125';
import { bagOf, skillsOf, goldOf, shopOf, heldOf, drawsOnStorage } from '../../session/item-sections.js?v=0.2.125';
import { CROPS } from '../../data/gathering.js?v=0.2.125';
import { requiredPlotLevel, unlockedCrops, emptyPlotIndices } from '../../core/farm.js?v=0.2.125';
import { rows, text, cls, attr, prop, style, element } from '../../render/paint.js?v=0.2.125';
import { whole, gold } from '../../render/format.js?v=0.2.125';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.125';
import { itemIconHtml, itemName } from '../widgets/bits.js?v=0.2.125';
import { runIntent, refusalText } from '../intent-words.js?v=0.2.125';
import { t, hasText } from '../../render/player-text.js?v=0.2.125';
import { patchParts, targetOf } from '../goto.js?v=0.2.125';

const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { pick: null, pending: false, msg: '', asked: null }; SCRATCH.set(cs, s); } return s; };

/* The farm's own refusals, in plain words: farm.refused_<code> (some codes mean something else elsewhere: `not_ready`
   is the party's too). An own-property read, so a code like `constructor` falls through to the shared table. */
const farmWords = (r) => (r && typeof r.error === 'string' && hasText('farm.refused_' + r.error) ? t('farm.refused_' + r.error) : refusalText(r));

const cropName = (id) => (CROPS[id] && CROPS[id].name) || itemName(id);
/** "3 h 20 m", "45 m", "under a minute". */
function left(ms) {
  const m = Math.ceil(ms / 60000);
  if (m <= 1) return t('farm.time_under_minute');
  const h = Math.floor(m / 60), r = m % 60;
  return h && r ? h + ' h ' + r + ' m' : h ? h + ' h' : r + ' m';
}

/** The server's empty plots inside the cap, in index order: the picker's next plot and "Plant N empty plots" read this one answer. */
const emptyOf = (land) => emptyPlotIndices(Array.from({ length: land.cap }, (_, i) => land.plots.get(i) || null), land.cap);

/** The empty plot after `at` on the RE-READ field (wrapping round), else null: where the picker goes after a plant. */
function nextEmpty(cs, ctx, at) {
  const land = farmLandOf(cs, typeof ctx.now === 'function' ? ctx.now() : 0);
  const free = land ? emptyOf(land) : [];
  const after = free.find((i) => i > at);
  return after !== undefined ? after : free.length ? free[0] : null;
}

/** The skeleton (built once per opening). */
export function renderFarm() {
  return '<div class="hw-farm">'
    + '<p class="hw-cap"><span class="hw-farm-land"></span><span class="hw-gold"></span></p>'
    + '<p class="hs-note hw-farm-shared">' + esc(t('farm.shared')) + '</p>'
    + '<ul class="hw-field" aria-label="' + esc(t('farm.plots_aria')) + '"></ul>'
    + '<p class="hh-empty hw-farm-wait">' + esc(t('farm.loading')) + '</p>'
    + '<section class="hw-sow"><h3 class="hw-ledger-head is-on hw-sow-head"></h3><ul class="hw-ledger hw-seeds"></ul>'
    + '<p class="hs-note hw-sow-none"></p><div class="hw-tools"><button type="button" class="hh-tool" data-hs-act="shop">' + esc(t('farm.open_shop')) + '</button>'
    + '<button type="button" class="hh-tool" data-hs-act="unpick">' + esc(t('controls.close')) + '</button></div></section>'
    + '<h3 class="hw-ledger-head is-on">' + esc(t('farm.tier_head')) + '</h3><p class="hs-note hw-tier"></p>'
    + '<div class="hw-tools"><button type="button" class="hh-tool" data-hs-act="upgrade"></button></div>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

function plotHtml(i) {
  return '<li class="hw-plot" data-plot="' + i + '"><button type="button" class="hw-soil" data-hs-act="plot" data-plot="' + i + '"><span class="hw-crop"></span></button>'
    + '<span class="hw-grow" role="meter" aria-valuemin="0" aria-valuemax="100"><i></i></span><small class="hw-plot-say"><b></b><span></span></small>'
    + '<small class="hw-plot-by"></small>'
    + '<button type="button" class="hh-tool hw-harvest" data-hs-act="harvest" data-plot="' + i + '">' + esc(t('farm.harvest')) + '</button>'
    + '<button type="button" class="hh-tool hw-plot-do" data-plot="' + i + '"></button></li>';
}

/* One plot, patched: what grows, how far along, and the one thing to do now. */
function patchPlot(li, i, st, now) {
  const p = st.land.plots.get(i) || null;
  const crop = p && CROPS[p.crop] ? CROPS[p.crop] : null;
  const ms = p ? readyInMs(st.land, p, now) : 0;
  const total = crop ? crop.hours * 3600000 : 0;
  const frac = !p ? 0 : p.ready ? 1 : total ? Math.max(0, Math.min(1, 1 - ms / total)) : 0;
  const ico = li.querySelector('.hw-crop');
  const want = p ? p.crop : '';
  if (ico.getAttribute('data-crop') !== want) { ico.setAttribute('data-crop', want); ico.innerHTML = p ? itemIconHtml(st.glyphs, crop ? crop.prod : p.crop) : ''; }
  cls(li, 'is-empty', !p);
  cls(li, 'is-ready', !!p && p.ready);
  cls(li, 'is-picked', st.sc.pick === i);
  style(li.querySelector('.hw-grow i'), 'width', Math.round(frac * 100) + '%');
  attr(li.querySelector('.hw-grow'), 'aria-valuenow', Math.round(frac * 100));
  attr(li.querySelector('.hw-soil'), 'aria-label', p ? t(p.ready ? 'farm.plot_aria_ready' : 'farm.plot_aria_growing', { crop: cropName(p.crop) })
    : t('farm.plot_aria_empty', { n: i + 1 }));
  text(li.querySelector('.hw-plot-say b'), p ? cropName(p.crop) : '');
  text(li.querySelector('.hw-plot-say span'), !p ? t('farm.plot_empty') : p.ready ? t('farm.plot_ready') : ms > 0 ? t('farm.plot_left', { time: left(ms) }) : t('farm.plot_checking'));
  /* Who planted it (the land is shared by the account's heroes); an extra plot says it goes. */
  const extra = !!p && p.extra;
  /* A REGROWING crop stays in the ground after a harvest (report #66): `more` is the server's
     regrows after the next harvest (null = no limit), 0 = this harvest is its last. */
  const regrow = !!p && !extra && !!crop && crop.regrows === true;
  const more = regrow ? p.regrowsLeft : null;
  const vine = regrow && more !== 0;   // a plain harvest leaves the plant growing
  cls(li, 'is-extra', extra);
  /* The plot's notes, each a sentence without its period, joined by ". " (as the line has always read). */
  text(li.querySelector('.hw-plot-by'), !p ? '' : [p.byName ? t('farm.planted_by', { name: p.byName }) : t('farm.planted_by_hero'),
    extra ? t('farm.note_extra') : '',
    (!regrow ? '' : more === null ? t('farm.note_regrows') : more === 0 ? t('farm.note_last_harvest')
      : t('farm.note_regrows_n', { count: more }))].filter(Boolean).join('. '));
  /* Harvest replants the same crop; an extra plot is only harvested (it takes no new seed); a living vine is kept. */
  const harvest = li.querySelector('.hw-harvest');
  cls(harvest, 'is-on', !!p && p.ready);
  attr(harvest, 'data-hs-act', extra || vine ? 'leave' : 'harvest');
  /* Each label says what its verb does (Tyler 10-25, "farming is hard to understand"): an extra plot never replants. */
  text(harvest, extra ? t('farm.harvest') : vine ? (more === null ? t('farm.harvest_regrows') : t('farm.harvest_regrows_n', { count: more })) : t('farm.harvest_replant'));
  prop(harvest, 'disabled', st.sc.pending);
  /* A regrowing crop never reads "Harvest only" (report #66): on its last harvest that press withers it and clears the plot. */
  const act = li.querySelector('.hw-plot-do');
  const verb = !p ? 'plant' : p.ready ? (extra ? '' : vine ? 'clear' : 'leave') : p.waterable ? 'water' : '';
  attr(act, 'data-hs-act', verb || null);
  cls(act, 'is-off', !verb);
  text(act, verb === 'plant' ? t('farm.plant') : verb === 'leave' ? (regrow ? t('farm.harvest_clear') : t('farm.harvest_only')) : verb === 'clear' ? t('farm.harvest_clear')
    : verb === 'water' ? t('farm.water') : p ? t('farm.watered') : '');
  prop(act, 'disabled', !verb || st.sc.pending);
}

/* The seed picker for the pressed plot: every crop, the plantable ones first, the others saying why not. It stays
   drawn while a plant is in flight, so the window keeps its scroll until the picker moves to the next empty plot. */
function patchSow(root, st, ctx) {
  const sow = root.querySelector('.hw-sow');
  const on = st.sc.pick !== null && st.sc.pick < st.land.cap && (st.sc.pending || !st.land.plots.has(st.sc.pick));
  cls(sow, 'is-on', on);
  if (!on) return;
  text(root.querySelector('.hw-sow-head'), t('farm.sow_head', { n: st.sc.pick + 1 }));
  const tier = new Set(unlockedCrops(st.land.plotLevel));
  const list = Object.keys(CROPS).map((id) => {
    const c = CROPS[id];
    const held = st.seeds.get(c.seed) || 0;
    const why = st.farming === null ? t('farm.why_reading') : st.farming < c.req ? t('farm.why_farming', { level: c.req })
      : !tier.has(id) ? t('farm.why_tier', { tier: requiredPlotLevel(id) }) : held < 1 ? t(st.prices.has(c.seed) ? 'farm.why_no_seeds_head' : 'farm.why_no_seeds') : '';
    /* Only short of the seed, and the Shop sells it: the price is a link to the Shop's row for it (Tyler 2026-11-08) */
    const buy = why === t('farm.why_no_seeds_head')
      ? { words: t('farm.shop_sells_seeds', { price: gold(st.prices.get(c.seed)) }), target: targetOf({ kind: 'shop', item: c.seed }) } : null;
    return { id, c, held, why, buy };
  }).sort((a, b) => Number(!!a.why) - Number(!!b.why));
  const free = emptyOf(st.land).length;
  rows(root.querySelector('.hw-seeds'), list, {
    key: (r) => r.id,
    build: (r) => element(ctx.doc, '<li class="hw-line" data-crop="' + esc(r.id) + '"><span class="hw-ico">' + itemIconHtml(ctx.glyphs, r.c.seed) + '</span>'
      + '<span class="hw-line-name"><b>' + esc(r.c.name) + '</b><small></small></span>'
      + '<button type="button" class="hh-tool" data-hs-act="sow" data-crop="' + esc(r.id) + '">' + esc(t('farm.plant')) + '</button>'
      + '<button type="button" class="hh-tool hw-sow-all" data-hs-act="sowall" data-crop="' + esc(r.id) + '"></button></li>'),
    patch: (li, r) => {
      patchParts(li.querySelector('small'), [t('farm.seed_line', { hours: r.c.hours, status: r.why || t(st.seedsWhere, { count: r.held, held: whole(r.held) }) })]
        .concat(r.buy ? [' ', r.buy] : []));
      cls(li, 'is-locked', !!r.why);
      prop(li.querySelector('[data-hs-act="sow"]'), 'disabled', !!r.why || st.sc.pending);
      const all = li.querySelector('.hw-sow-all');
      text(all, t('farm.sow_all', { n: free }));
      cls(all, 'is-on', !r.why && free > 1);
      prop(all, 'disabled', !!r.why || st.sc.pending);
    },
  });
  const none = !list.some((r) => !r.why);
  text(root.querySelector('.hw-sow-none'), none ? t('farm.no_seed_to_plant') : '');
  cls(root.querySelector('[data-hs-act="shop"]'), 'is-on', none);
}

function patchTier(root, st) {
  const lv = st.land.plotLevel;
  const up = st.land.upgrade;
  const grows = unlockedCrops(lv).map(cropName).join(', ');
  /* A crop the tier opens may need more Farming to plant than the soil asks (playtest 2026-10-29 #12: "Tier 2 adds Carrot
     ... at Farming 5" beside "Carrot: Needs Farming 10"): its own level is said beside it, from the same CROPS row. */
  const adds = up ? unlockedCrops(up.level).filter((id) => requiredPlotLevel(id) === up.level)
    .map((id) => (CROPS[id] && CROPS[id].req > up.farming ? t('farm.tier_crop_needs', { crop: cropName(id), level: CROPS[id].req }) : cropName(id))).join(', ') : '';
  const next = !up ? t('farm.tier_top') : t('farm.tier_next', { tier: up.level, crops: adds, price: gold(up.gold), level: up.farming });
  text(root.querySelector('.hw-tier'), t('farm.tier_grows', { tier: lv, crops: grows }) + ' ' + next);
  const btn = root.querySelector('[data-hs-act="upgrade"]');
  text(btn, up ? t('farm.improve', { price: gold(up.gold) }) : t('farm.improve_top'));
  const afford = !!up && st.purse !== null && st.purse >= up.gold;
  prop(btn, 'disabled', !up || st.sc.pending || st.farming === null || st.farming < up.farming || !afford);
}

renderFarm.patch = function patchFarm(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const root = body.querySelector('.hw-farm');
  const now = typeof ctx.now === 'function' ? ctx.now() : 0;
  const land = farmLandOf(cs, now);
  cls(root.querySelector('.hw-farm-wait'), 'is-on', !land);
  cls(root, 'is-off', !land);
  cls(root, 'is-pending', sc.pending);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
  const purse = goldOf(cs);
  text(root.querySelector('.hw-gold'), purse === null ? '' : t('farm.purse', { gold: gold(purse) }));   // the ACCOUNT's purse
  if (!land) { rows(root.querySelector('.hw-field'), [], { key: String, build: () => null, patch: () => {} }); return; }
  const sk = skillsOf(cs);
  const shop = shopOf(cs);
  const st = {
    land, sc, glyphs: ctx.glyphs, purse,
    farming: sk && sk.farming ? sk.farming.level : sk ? 1 : null,
    /* The seeds a plant can spend: the server's bag, then the account's Storage (heldOf; Tyler 2026-10-25). */
    seeds: new Map(Object.entries(heldOf(cs))),
    seedsWhere: drawsOnStorage(cs) ? 'farm.seeds_in_bag_storage' : 'farm.seeds_in_bag',
    prices: new Map(shop ? shop.offers.filter((o) => o.kind === 'seed').map((o) => [o.item, o.price]) : []),
  };
  /* The land's plots, then any EXTRA plot past them (the server's `extra`), in index order. */
  const extras = Array.from(land.plots.keys()).filter((i) => i >= land.cap).sort((a, b) => a - b);
  text(root.querySelector('.hw-farm-land'), t('farm.land_room', { count: land.cap })
    + (extras.length ? ' ' + t('farm.land_extra', { count: extras.length }) : ''));
  const ids = Array.from({ length: land.cap }, (_, i) => i).concat(extras);
  rows(root.querySelector('.hw-field'), ids, { key: String, build: (i) => element(ctx.doc, plotHtml(i)), patch: (li, i) => patchPlot(li, i, st, now) });
  patchSow(root, st, ctx);
  patchTier(root, st);
  /* A countdown that ran out asks the server once per envelope; Harvest opens only on its answer. */
  const due = Array.from(land.plots.values()).some((p) => !p.ready && readyInMs(land, p, now) <= 0);
  if (due && sc.asked !== land && !sc.pending && typeof cs.load === 'function') { sc.asked = land; cs.load(); }
};

/* "Harvested 3 Turnip (+1,008 Farming XP). Planted again." — from the server's own answer. */
function harvestLine(r) {
  const b = r.body || {};
  const rep = b.replant || null;
  /* Whole sentences, one after another. */
  const s = [t('farm.harvested', { qty: whole(b.qty), item: itemName(b.produce), xp: whole(b.xp) })];
  if (b.extra) return s.concat(t('farm.harvested_extra_gone')).join(' ');
  if (b.withered) s.push(t('farm.harvested_withered'));
  else if (b.regrew) s.push(!Number.isInteger(b.regrows_left) ? t('farm.harvested_regrows')
    : b.regrows_left > 0 ? t('farm.harvested_regrows_n', { count: b.regrows_left }) : t('farm.harvested_regrows_last'));
  if (b.cleared) s.push(t('farm.harvested_cleared'));
  else if (rep && !rep.kept) {
    s.push(rep.ok ? (rep.bought ? t('farm.replanted_bought', { price: gold(rep.bought) }) : t('farm.replanted'))
      : rep.error === 'cannot_afford' ? t('farm.not_replanted_price', { price: gold(rep.price) }) : t('farm.not_replanted', { why: farmWords(rep) }));
  }
  return s.join(' ');
}

function run(sc, repaint, send, busy, done) {
  return runIntent(sc, repaint, async () => { const r = await send(); if (!r.ok) r.error = r.error || 'refused'; return r; }, busy, done)
    .then((r) => { if (!r.ok) { sc.msg = farmWords(r); repaint(); } return r; });
}

/* "Plant N empty plots": ONE hr_farm_plant per plot of `order`, in order; the first refusal ends it and is handed back
   (alone when nothing was planted, else as `stop` beside the count) for the window's one line. The picker follows it. */
async function sowEach(ctx, sc, repaint, order, crop) {
  let n = 0;
  for (const at of order) {
    sc.pick = at;
    sc.msg = t('farm.planting_in', { crop: cropName(crop), n: at + 1 });
    repaint();
    const r = await plantCrop(ctx.account, ctx.character, at, crop);
    if (!r.ok) return n ? { ok: true, n, at, stop: r } : r;
    n++;
  }
  return { ok: true, n };
}

renderFarm.act = function actFarm(ctx, body, action, ev, el) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => renderFarm.patch(body, ctx);
  const plot = Number(el.getAttribute('data-plot'));
  const land = farmLandOf(cs, typeof ctx.now === 'function' ? ctx.now() : 0);
  if (action === 'shop') { if (ctx.wm) ctx.wm.goTo('shop', { tab: 'buy' }); return true; }
  if (action === 'unpick') { sc.pick = null; repaint(); return true; }
  if (!land || sc.pending) return true;
  if (action === 'plot' || action === 'plant') {
    sc.pick = land.plots.has(plot) ? null : plot;
    sc.msg = '';
    repaint();
    /* the picker sits under the field: bring it on screen rather than make the player scroll for it */
    const sow = body.querySelector('.hw-sow.is-on');
    if (sow && typeof sow.scrollIntoView === 'function') sow.scrollIntoView({ block: 'nearest' });
    return true;
  }
  if (action === 'sow' && sc.pick !== null) {
    const crop = el.getAttribute('data-crop');
    const at = sc.pick;
    run(sc, repaint, () => plantCrop(ctx.account, cs, at, crop), t('farm.planting'), () => { sc.pick = nextEmpty(cs, ctx, at); return t('farm.planted_in', { crop: cropName(crop), n: at + 1 }); });
    return true;
  }
  if (action === 'sowall' && sc.pick !== null) {
    const crop = el.getAttribute('data-crop');
    const order = emptyOf(land);   // the server's empty plots at the press, each tried once, in order
    run(sc, repaint, () => sowEach(ctx, sc, repaint, order, crop), t('farm.planting'), (r) => {
      sc.pick = nextEmpty(cs, ctx, -1);
      return t('farm.planted_many', { crop: cropName(crop), count: r.n }) + (r.stop ? ' ' + t('farm.planted_stopped', { n: r.at + 1, why: farmWords(r.stop) }) : '');
    });
    return true;
  }
  if (action === 'water') { run(sc, repaint, () => waterPlot(ctx.account, cs, plot), t('farm.watering'), () => t('farm.watered_done')); return true; }
  if (action === 'harvest' || action === 'leave') {
    run(sc, repaint, () => harvestPlot(ctx.account, cs, plot, action === 'harvest'), t('farm.harvesting'), harvestLine);
    return true;
  }
  if (action === 'clear') { run(sc, repaint, () => clearPlot(ctx.account, cs, plot), t('farm.harvesting'), harvestLine); return true; }
  if (action === 'upgrade' && land.upgrade) {
    const up = land.upgrade;
    run(sc, repaint, () => upgradePlot(ctx.account, cs, up.level), t('farm.improving'), () => t('farm.improved', { tier: up.level }));
    return true;
  }
  return false;
};
