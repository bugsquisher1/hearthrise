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
//   An empty plot      press it: pick a seed you hold (the crops you cannot plant
//                      yet say why: the Farming level or the plot tier they need;
//                      with no seed, where to buy one) → ONE hr_farm_plant.
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
import { farmLandOf, readyInMs } from '../../session/farm-sections.js?v=0.2.77';
import { plantCrop, waterPlot, harvestPlot, clearPlot, upgradePlot } from '../../session/farm-intents.js?v=0.2.77';
import { bagOf, skillsOf, goldOf, shopOf, heldOf, drawsOnStorage } from '../../session/item-sections.js?v=0.2.77';
import { CROPS } from '../../data/gathering.js?v=0.2.77';
import { requiredPlotLevel, unlockedCrops } from '../../core/farm.js?v=0.2.77';
import { rows, text, cls, attr, prop, style, element } from '../../render/paint.js?v=0.2.77';
import { whole, gold } from '../../render/format.js?v=0.2.77';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.77';
import { itemIconHtml, itemName } from '../widgets/bits.js?v=0.2.77';
import { runIntent, refusalText } from '../intent-words.js?v=0.2.77';

const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { pick: null, pending: false, msg: '', asked: null }; SCRATCH.set(cs, s); } return s; };

/* The farm's own refusals, in plain words (some codes mean something else elsewhere: `not_ready` is the party's too). */
const FARM_WORDS = Object.freeze({
  not_ready: 'Not ready yet. Give it a little longer.',
  empty_plot: 'That plot is empty now.',
  plot_occupied: 'Something is already growing there.',
  plot_cap: 'Your land has no room for that plot yet.',
  insufficient_seed: 'You have no seed for that crop in your bag or Storage. The Shop sells seeds.',
  level_too_low: 'Your Farming level is too low for that crop.',
  plot_tier_locked: 'Your plots need a higher tier for that crop.',
  still_watered: 'Still soaked. Water it again when this wears off.',
  water_capped: 'That plot cannot take more water.',
  already_ready: 'It is ready: harvest it.',
  day_budget: 'You have farmed all you can today. More tomorrow.',
  farm_level_too_low: 'Your Farming level is too low for the next plot tier.',
  cannot_afford: 'Not enough gold for that.',
  stale_level: 'Your plots changed. Check the new price and try again.',
  max_plot_level: 'Your plots are at the top tier.',
  no_seed_for_sale: 'The Shop does not sell that seed.',
});
const farmWords = (r) => FARM_WORDS[r && r.error] || refusalText(r);

const cropName = (id) => (CROPS[id] && CROPS[id].name) || itemName(id);
/** "3 h 20 m", "45 m", "under a minute". */
function left(ms) {
  const m = Math.ceil(ms / 60000);
  if (m <= 1) return 'under a minute';
  const h = Math.floor(m / 60), r = m % 60;
  return h && r ? h + ' h ' + r + ' m' : h ? h + ' h' : r + ' m';
}

/** "1 more time", "3 more times". */
const times = (n) => n + (n === 1 ? ' more time' : ' more times');

/** The skeleton (built once per opening). */
export function renderFarm() {
  return '<div class="hw-farm">'
    + '<p class="hw-cap"><span class="hw-farm-land"></span><span class="hw-gold"></span></p>'
    + '<p class="hs-note hw-farm-shared">Your heroes share this land. The hero you are playing plants their own seeds and keeps the crop and the Farming XP.</p>'
    + '<ul class="hw-field" aria-label="Your plots"></ul>'
    + '<p class="hh-empty hw-farm-wait">Your field loads from the server.</p>'
    + '<section class="hw-sow"><h3 class="hw-ledger-head is-on hw-sow-head"></h3><ul class="hw-ledger hw-seeds"></ul>'
    + '<p class="hs-note hw-sow-none"></p><div class="hw-tools"><button type="button" class="hh-tool" data-hs-act="shop">Open the Shop</button>'
    + '<button type="button" class="hh-tool" data-hs-act="unpick">Close</button></div></section>'
    + '<h3 class="hw-ledger-head is-on">Plot tier</h3><p class="hs-note hw-tier"></p>'
    + '<div class="hw-tools"><button type="button" class="hh-tool" data-hs-act="upgrade"></button></div>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

function plotHtml(i) {
  return '<li class="hw-plot" data-plot="' + i + '"><button type="button" class="hw-soil" data-hs-act="plot" data-plot="' + i + '"><span class="hw-crop"></span></button>'
    + '<span class="hw-grow" role="meter" aria-valuemin="0" aria-valuemax="100"><i></i></span><small class="hw-plot-say"><b></b><span></span></small>'
    + '<small class="hw-plot-by"></small>'
    + '<button type="button" class="hh-tool hw-harvest" data-hs-act="harvest" data-plot="' + i + '">Harvest</button>'
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
  attr(li.querySelector('.hw-soil'), 'aria-label', p ? cropName(p.crop) + (p.ready ? ', ready' : ', growing') : 'Empty plot ' + (i + 1) + ': plant a seed');
  text(li.querySelector('.hw-plot-say b'), p ? cropName(p.crop) : '');
  text(li.querySelector('.hw-plot-say span'), !p ? 'Empty' : p.ready ? 'Ready' : ms > 0 ? left(ms) + ' left' : 'Checking…');
  /* Who planted it (the land is shared by the account's heroes); an extra plot says it goes. */
  const extra = !!p && p.extra;
  /* A REGROWING crop stays in the ground after a harvest (report #66): `more` is the server's
     regrows after the next harvest (null = no limit), 0 = this harvest is its last. */
  const regrow = !!p && !extra && !!crop && crop.regrows === true;
  const more = regrow ? p.regrowsLeft : null;
  const vine = regrow && more !== 0;   // a plain harvest leaves the plant growing
  cls(li, 'is-extra', extra);
  text(li.querySelector('.hw-plot-by'), !p ? '' : (p.byName ? 'Planted by ' + p.byName : 'Planted by one of your heroes')
    + (extra ? '. Extra plot: gone once harvested' : '')
    + (!regrow ? '' : more === null ? '. Grows back after every harvest' : more === 0 ? '. Last harvest: the plant withers after it'
      : '. Grows back ' + times(more) + ' after this harvest'));
  /* Harvest replants the same crop; an extra plot is only harvested (it takes no new seed); a living vine is kept. */
  const harvest = li.querySelector('.hw-harvest');
  cls(harvest, 'is-on', !!p && p.ready);
  attr(harvest, 'data-hs-act', extra || vine ? 'leave' : 'harvest');
  /* Each label says what its verb does (Tyler 10-25, "farming is hard to understand"): an extra plot never replants. */
  text(harvest, extra ? 'Harvest' : vine ? (more === null ? 'Harvest (it grows back)' : 'Harvest (grows back ' + times(more) + ')') : 'Harvest and replant');
  prop(harvest, 'disabled', st.sc.pending);
  /* A regrowing crop never reads "Harvest only" (report #66): on its last harvest that press withers it and clears the plot. */
  const act = li.querySelector('.hw-plot-do');
  const verb = !p ? 'plant' : p.ready ? (extra ? '' : vine ? 'clear' : 'leave') : p.waterable ? 'water' : '';
  attr(act, 'data-hs-act', verb || null);
  cls(act, 'is-off', !verb);
  text(act, verb === 'plant' ? 'Plant' : verb === 'leave' ? (regrow ? 'Harvest and clear plot' : 'Harvest only') : verb === 'clear' ? 'Harvest and clear plot' : verb === 'water' ? 'Water' : p ? 'Watered' : '');
  prop(act, 'disabled', !verb || st.sc.pending);
}

/* The seed picker for the pressed plot: every crop, plantable or saying why not. */
function patchSow(root, st, ctx) {
  const sow = root.querySelector('.hw-sow');
  const on = st.sc.pick !== null && !st.land.plots.has(st.sc.pick) && st.sc.pick < st.land.cap;
  cls(sow, 'is-on', on);
  if (!on) return;
  text(root.querySelector('.hw-sow-head'), 'Plant in plot ' + (st.sc.pick + 1));
  const tier = new Set(unlockedCrops(st.land.plotLevel));
  const list = Object.keys(CROPS).map((id) => {
    const c = CROPS[id];
    const held = st.seeds.get(c.seed) || 0;
    const why = st.farming === null ? 'Reading your Farming level…' : st.farming < c.req ? 'Needs Farming ' + c.req
      : !tier.has(id) ? 'Needs plot tier ' + requiredPlotLevel(id) : held < 1 ? 'No seeds' + (st.prices.has(c.seed) ? ': the Shop sells them at ' + gold(st.prices.get(c.seed)) : '') : '';
    return { id, c, held, why };
  });
  rows(root.querySelector('.hw-seeds'), list, {
    key: (r) => r.id,
    build: (r) => element(ctx.doc, '<li class="hw-line" data-crop="' + esc(r.id) + '"><span class="hw-ico">' + itemIconHtml(ctx.glyphs, r.c.seed) + '</span>'
      + '<span class="hw-line-name"><b>' + esc(r.c.name) + '</b><small></small></span>'
      + '<button type="button" class="hh-tool" data-hs-act="sow" data-crop="' + esc(r.id) + '">Plant</button></li>'),
    patch: (li, r) => {
      text(li.querySelector('small'), r.c.hours + ' h · ' + (r.why || whole(r.held) + (r.held === 1 ? ' seed' : ' seeds') + st.seedsWhere));
      cls(li, 'is-locked', !!r.why);
      prop(li.querySelector('button'), 'disabled', !!r.why || st.sc.pending);
    },
  });
  const none = !list.some((r) => !r.why);
  text(root.querySelector('.hw-sow-none'), none ? 'You hold no seed you can plant here yet. The Shop sells seeds under Seeds.' : '');
  cls(root.querySelector('[data-hs-act="shop"]'), 'is-on', none);
}

function patchTier(root, st) {
  const lv = st.land.plotLevel;
  const up = st.land.upgrade;
  const grows = unlockedCrops(lv).map(cropName).join(', ');
  /* A crop the tier opens may need more Farming to plant than the soil asks (playtest 2026-10-29 #12: "Tier 2 adds Carrot
     ... at Farming 5" beside "Carrot: Needs Farming 10"): its own level is said beside it, from the same CROPS row. */
  const adds = up ? unlockedCrops(up.level).filter((id) => requiredPlotLevel(id) === up.level)
    .map((id) => cropName(id) + (CROPS[id] && CROPS[id].req > up.farming ? ' (Farming ' + CROPS[id].req + ' to plant)' : '')).join(', ') : '';
  text(root.querySelector('.hw-tier'), 'Tier ' + lv + ' grows ' + grows + '.'
    + (up ? ' Tier ' + up.level + ' adds ' + adds + ': ' + gold(up.gold) + (up.deeds ? ' (or ' + whole(up.deeds) + ' Farmer\'s Deed' + (up.deeds === 1 ? '' : 's') + ')' : '') + ', at Farming ' + up.farming + '.' : ' Your plots are at the top tier.'));
  const btn = root.querySelector('[data-hs-act="upgrade"]');
  text(btn, up ? 'Improve the soil · ' + gold(up.gold) : 'Top tier');
  const afford = !!up && ((st.purse !== null && st.purse >= up.gold) || st.land.deeds >= up.deeds);
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
  text(root.querySelector('.hw-gold'), purse === null ? '' : 'Your gold ' + gold(purse));   // the ACCOUNT's purse
  if (!land) { rows(root.querySelector('.hw-field'), [], { key: String, build: () => null, patch: () => {} }); return; }
  const sk = skillsOf(cs);
  const shop = shopOf(cs);
  const st = {
    land, sc, glyphs: ctx.glyphs, purse,
    farming: sk && sk.farming ? sk.farming.level : sk ? 1 : null,
    /* The seeds a plant can spend: the server's bag, then the account's Storage (heldOf; Tyler 2026-10-25). */
    seeds: new Map(Object.entries(heldOf(cs))),
    seedsWhere: drawsOnStorage(cs) ? ' in your bag and Storage' : ' in your bag',
    prices: new Map(shop ? shop.offers.filter((o) => o.kind === 'seed').map((o) => [o.item, o.price]) : []),
  };
  /* The land's plots, then any EXTRA plot past them (the server's `extra`), in index order. */
  const extras = Array.from(land.plots.keys()).filter((i) => i >= land.cap).sort((a, b) => a - b);
  text(root.querySelector('.hw-farm-land'), 'Your land has room for ' + land.cap + (land.cap === 1 ? ' plot.' : ' plots.')
    + (extras.length ? ' ' + extras.length + (extras.length === 1 ? ' extra plot goes' : ' extra plots go') + ' once harvested.' : ''));
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
  let s = 'Harvested ' + whole(b.qty) + ' ' + itemName(b.produce) + ' (+' + whole(b.xp) + ' Farming XP).';
  if (b.extra) return s + ' That extra plot is gone now.';
  if (b.withered) s += ' The plant has withered.';
  else if (b.regrew) s += !Number.isInteger(b.regrows_left) ? ' It grows back.'
    : b.regrows_left > 0 ? ' It grows back, then ' + times(b.regrows_left) + '.' : ' It grows back one last time.';
  if (b.cleared) return s + ' The plot is clear.';
  if (!rep || rep.kept) return s;
  if (rep.ok) return s + (rep.bought ? ' Bought a seed for ' + gold(rep.bought) + ' and planted it again.' : ' Planted it again.');
  if (rep.error === 'cannot_afford') return s + ' Not planted again: a seed costs ' + gold(rep.price) + '.';
  return s + ' Not planted again: ' + farmWords(rep);
}

function run(sc, repaint, send, busy, done) {
  return runIntent(sc, repaint, async () => { const r = await send(); if (!r.ok) r.error = r.error || 'refused'; return r; }, busy, done)
    .then((r) => { if (!r.ok) { sc.msg = farmWords(r); repaint(); } return r; });
}

renderFarm.act = function actFarm(ctx, body, action, ev, t) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => renderFarm.patch(body, ctx);
  const plot = Number(t.getAttribute('data-plot'));
  const land = farmLandOf(cs, typeof ctx.now === 'function' ? ctx.now() : 0);
  if (action === 'shop') { if (ctx.wm) ctx.wm.open('shop'); return true; }
  if (action === 'unpick') { sc.pick = null; repaint(); return true; }
  if (!land || sc.pending) return true;
  if (action === 'plot' || action === 'plant') {
    sc.pick = land.plots.has(plot) ? null : plot;
    sc.msg = '';
    repaint();
    return true;
  }
  if (action === 'sow' && sc.pick !== null) {
    const crop = t.getAttribute('data-crop');
    const at = sc.pick;
    run(sc, repaint, () => plantCrop(ctx.account, cs, at, crop), 'Planting…', () => { sc.pick = null; return 'Planted ' + cropName(crop) + ' in plot ' + (at + 1) + '.'; });
    return true;
  }
  if (action === 'water') { run(sc, repaint, () => waterPlot(ctx.account, cs, plot), 'Watering…', () => 'Watered: it grows twice as fast for 2 hours.'); return true; }
  if (action === 'harvest' || action === 'leave') {
    run(sc, repaint, () => harvestPlot(ctx.account, cs, plot, action === 'harvest'), 'Harvesting…', harvestLine);
    return true;
  }
  if (action === 'clear') { run(sc, repaint, () => clearPlot(ctx.account, cs, plot), 'Harvesting…', harvestLine); return true; }
  if (action === 'upgrade' && land.upgrade) {
    const up = land.upgrade;
    run(sc, repaint, () => upgradePlot(ctx.account, cs, up.level), 'Improving the soil…', () => 'Your plots are tier ' + up.level + ' now.');
    return true;
  }
  return false;
};
