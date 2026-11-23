// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/farm-tend.js — THE FARM'S "TEND THE FIELD": THE SERVER'S BILL, THEN ONE PRESS.
//
// Build plan L09 (26-home.md §6, ruled): a visit was two presses a plot, one at a time. This section, under the field,
// shows the SERVER's bill (src/session/farm-tend.js farmTendOf, the `farm_tend` section of 1017-tend-the-field.sql) before
// anything is pressed: the ready plots it harvests, the plots it plants again and the seeds that takes (from the bag and
// Storage, and any it buys, with the gold), the plots it waters, and each plot that stays empty and why. "Plant with" picks
// one crop for every plot it plants (the server's compact bill for that crop); left alone, each plot gets its own crop
// back. The press sends ONE hr_farm_tend carrying the bill's gold as the server sent it; nothing here adds up a price.
// The press is off until the server's bill says there is something to do, and while any farm intent is in flight.
//   tendHtml()                         the skeleton, built once with the window
//   patchTend(root, cs, sc, doc)       the bill and the press, from the server's section only
//   tendPress(cs, sc)                  { crop, gold } of the bill on screen, or null (nothing to do)
//   tendLine(r, why)                   the one line after the press, from the server's answer
//   cropMakes(id)                      what a crop makes, from the data rows (its mana drink, else its Cooking rows)
// ════════════════════════════════════════════════════════════════════════
import { farmTendOf, tendHasWork } from '../../session/farm-tend.js';
import { CROPS } from '../../data/gathering.js';
import { DRINK_RECIPES, DRINK_ITEMS } from '../../data/drinks.js';
import { ARTISAN_RECIPES } from '../../data/recipes.js';
import { rows, text, cls, prop, element } from '../../render/paint.js';
import { whole, gold, listWords } from '../../render/format.js';
import { escapeHtml as esc } from '../../utils/dom.js';
import { itemName, itemNameFor } from '../widgets/bits.js';
import { t } from '../../render/player-text.js';

const cropName = (id) => (CROPS[id] && CROPS[id].name) || itemName(id);
const plotList = (is) => listWords(is.map((i) => String(i + 1)), 8);

/** What crop `id` makes, from the data rows: its mana drink, else the Cooking rows that take it; '' when none does. */
export function cropMakes(id) {
  const prod = CROPS[id] && CROPS[id].prod;
  if (!prod) return '';
  const drink = DRINK_RECIPES.find((r) => r.inputs && r.inputs[prod] && DRINK_ITEMS[r.output]);
  if (drink) return t('farm.makes_drink', { drink: DRINK_ITEMS[drink.output].n, mana: whole(DRINK_ITEMS[drink.output].mana) });
  const foods = (ARTISAN_RECIPES.cooking || []).filter((r) => r.inputs && r.inputs[prod] && r.output).map((r) => itemName(r.output));
  return foods.length ? t('farm.makes_food', { foods: listWords(foods, 2) }) : '';
}

/** The skeleton (built once per opening). */
export function tendHtml() {
  return '<section class="hw-tend"><h3 class="hw-ledger-head is-on">' + esc(t('farm.tend_head')) + '</h3>'
    + '<label class="hw-tend-pick">' + esc(t('farm.tend_pick')) + ' <select class="hh-select" data-hs-act="tendcrop"></select></label>'
    + '<ul class="hw-tend-bill"></ul>'
    + '<div class="hw-tools"><button type="button" class="hh-tool is-primary" data-hs-act="tend"></button></div></section>';
}

/* The bill on screen: the server's default, or its compact bill for the crop picked (dropped when the server no longer offers it). */
function billOf(cs, sc) {
  const all = farmTendOf(cs);
  if (!all) return null;
  const pick = sc.tendCrop && all.choices.has(sc.tendCrop) ? all.choices.get(sc.tendCrop) : null;
  if (sc.tendCrop && !pick) sc.tendCrop = null;
  return { all, pick, gold: pick ? pick.gold : all.gold,
    work: pick ? all.harvest.length + pick.plant + pick.water > 0 : tendHasWork(all) };
}

/** { crop, gold } of the bill on screen, or null when it has nothing to do (the press sends exactly this). */
export function tendPress(cs, sc) {
  const b = billOf(cs, sc);
  return b && b.work ? { crop: b.pick ? b.pick.crop : null, gold: b.gold } : null;
}

/* "Uses 2 Turnip Seed you have and buys 1 more for 5 gp", from one seed's counts. */
function seedWords(seed, held, buy, cost) {
  if (held > 0 && buy > 0) return t('farm.tend_seed_have_buy', { qty: whole(held), seed: itemNameFor(seed, held), more: whole(buy), gold: gold(cost) });
  if (held > 0) return t('farm.tend_seed_have', { qty: whole(held), seed: itemNameFor(seed, held) });
  return buy > 0 ? t('farm.tend_seed_buy', { qty: whole(buy), seed: itemNameFor(seed, buy), gold: gold(cost) }) : '';
}

/* The plots that stay empty, one sentence a reason and crop: "Plots 3 and 4 stay empty because Pumpkin needs Farming 50". */
function emptyWords(empty) {
  const by = new Map();
  for (const e of empty) {
    const k = e.why + ':' + (e.crop || '') + ':' + (e.seed || '');
    if (!by.has(k)) by.set(k, { e, is: [] });
    by.get(k).is.push(e.i);
  }
  return [...by.values()].map(({ e, is }) => t('farm.tend_empty_' + e.why, { count: is.length, plots: plotList(is),
    ...(e.why === 'level_too_low' || e.why === 'plot_tier_locked' ? { crop: cropName(e.crop), level: e.need === null ? '?' : e.need } : {}),
    ...(e.why === 'no_seed_for_sale' || e.why === 'cannot_afford' ? { seed: itemName(e.seed || (CROPS[e.crop] && CROPS[e.crop].seed) || '') } : {}) }));
}

function billLines(b) {
  const { all, pick } = b;
  const out = [];
  if (!b.work) out.push(t('farm.tend_nothing'));
  if (all.harvest.length) out.push(t('farm.tend_harvest', { count: all.harvest.length }));
  if (pick) {
    if (pick.plant) out.push(t('farm.tend_plant_pick', { crop: cropName(pick.crop), count: pick.plant }));
    const seed = CROPS[pick.crop] && CROPS[pick.crop].seed;
    if (seed && pick.plant) out.push(seedWords(seed, pick.bag + pick.storage, pick.buy, pick.gold));
    if (pick.water) out.push(t('farm.tend_water', { count: pick.water }));
    if (pick.empty.length && pick.why) out.push(...emptyWords(pick.empty.map((i) => ({ i, why: pick.why, crop: pick.crop, seed, need: null }))));
  } else {
    if (all.plant.length) out.push(t('farm.tend_plant_own', { count: all.plant.length }));
    for (const l of all.seeds) out.push(seedWords(l.seed, l.bag + l.storage, l.buy, l.gold));
    if (all.water.length) out.push(t('farm.tend_water', { count: all.water.length }));
    out.push(...emptyWords(all.empty));
  }
  return out.filter(Boolean);
}

/** The bill and the press, painted from the server's section; returns whether a bill is on screen. */
export function patchTend(root, cs, sc, doc) {
  const sec = root.querySelector('.hw-tend');
  const b = billOf(cs, sc);
  cls(sec, 'is-on', !!b);
  if (!b) return false;
  const sel = sec.querySelector('[data-hs-act="tendcrop"]');
  const opts = [['', t('farm.tend_pick_own')]].concat([...b.all.choices.keys()].map((c) => [c, cropName(c)]));
  const sig = opts.map((o) => o[0]).join(',');
  if (sel.getAttribute('data-sig') !== sig) {
    sel.innerHTML = opts.map(([v, w]) => '<option value="' + esc(v) + '">' + esc(w) + '</option>').join('');
    sel.setAttribute('data-sig', sig);
  }
  if (sel.value !== (sc.tendCrop || '')) sel.value = sc.tendCrop || '';
  cls(sec.querySelector('.hw-tend-pick'), 'is-on', b.all.choices.size > 0);
  prop(sel, 'disabled', sc.pending);
  const lines = billLines(b);
  rows(sec.querySelector('.hw-tend-bill'), lines.map((l, i) => [i, l]), {
    key: (x) => x[0], build: () => element(doc, '<li></li>'), patch: (li, x) => text(li, x[1]) });
  const go = sec.querySelector('[data-hs-act="tend"]');
  text(go, b.work && b.gold > 0 ? t('farm.tend_go_gold', { gold: gold(b.gold) }) : t('farm.tend_go'));
  prop(go, 'disabled', !b.work || sc.pending);
  return true;
}

/** The one line after a press, from the server's answer (src/session/farm-tend.js answerOf). `why`: the window's refusal words. */
export function tendLine(r, why) {
  const b = r.body || {};
  const s = [];
  const by = new Map();
  for (const h of b.harvested || []) by.set(h.produce, (by.get(h.produce) || 0) + h.qty);
  if (by.size) s.push(t('farm.tended_harvest', { items: listWords([...by].map(([id, q]) => whole(q) + ' ' + itemNameFor(id, q)), 4) }));
  if ((b.planted || []).length) s.push(t('farm.tended_planted', { count: b.planted.length }));
  if ((b.watered || []).length) s.push(t('farm.tended_watered', { count: b.watered.length }));
  if (b.xp > 0) s.push(t('farm.tended_xp', { xp: whole(b.xp) }));
  if ((b.bought || []).length) s.push(t('farm.tended_bought', { seeds: listWords(b.bought.map((x) => whole(x.qty) + ' ' + itemNameFor(x.seed, x.qty))), gold: gold(b.gold) }));
  for (const f of b.failed || []) s.push(t('farm.tended_failed_' + f.step, { n: f.i + 1 }), why({ error: f.error }));
  s.push(...emptyWords((b.empty || []).filter((e) => e.why !== 'unplanted')));
  return s.map((x) => String(x).replace(/\.$/, '')).filter(Boolean).join(' · ');
}
