// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/configure-runes.js — CONFIGURE ACTION'S RUNE SECTION: WHICH CARRIED RUNES A SPELL
// SPENDS, AND WHAT IT DOES WHEN THEY RUN OUT.
//
// Tyler 2026-11-08 (RUNE SUPPLY PER SLOT, DECIDE IN CONFIGURE ACTION): "If the player has 'use carried
// runes' checked, it opens a section of carried runes that fit that spell type, and they check the box.
// Then condition - 'when rune supply runs out' 'Pay rune shop' or 'leave hunt'". In a rune spell's detail:
//   [ ] Use carried runes      ticked: the runes of the spell's family the hero carries, each with its
//                              count, what one cast lands for this hero and a box, a locked tier saying
//                              the level it needs
//   When your runes run out    ( ) Buy from the rune shop, a tier picker of the family's shop runes, each
//                              with its price and what one cast lands (Tyler 2026-11-08: "75% what?",
//                              so the numbers, never a share)   ( ) Leave the hunt
// With the box off the rune shop is the slot's one supply. Every choice is the draft's until Save (the
// window's one intent); the rule is src/shell/rune-supply.js's, the engine's. The bar's hover only
// summarises it (cast-facts.js costLine).
// ════════════════════════════════════════════════════════════════════════
import { rows, text, attr, prop, cls, element } from '../../render/paint.js?v=0.2.115';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.115';
import { runeSupplyOf } from '../../core/hunt/conditions.js?v=0.2.115';
import { RUNE_FAMILIES } from '../../data/runes.js?v=0.2.115';
import { storeChoices, storeChoiceWords } from '../bar-draft.js?v=0.2.115';
import { carriedRunes, withSupply } from '../rune-supply.js?v=0.2.115';
import { castOf, outputWords } from '../cast-facts.js?v=0.2.115';
import { whole } from '../../render/format.js?v=0.2.115';
import { t } from '../../render/player-text.js?v=0.2.115';

/** The section's skeleton (built once per opening, inside the detail pane). */
export function runesHtml() {
  const radio = (v, key) => '<label class="ca-rn-pick"><input type="radio" name="ca-rn-empty" value="' + v + '" data-hs-act="cfg-f" data-f="rn-empty"> <span>' + esc(t(key)) + '</span></label>';
  return '<div class="ca-runes">'
    + '<label class="ca-rn-own"><input type="checkbox" data-hs-act="cfg-f" data-f="rn-own"> <span>' + esc(t('bar.runes_use')) + '</span></label>'
    + '<ul class="ca-rn-list" aria-label="' + esc(t('bar.runes_use')) + '"></ul>'
    + '<p class="ca-rn-none"></p>'
    + '<fieldset class="ca-rn-empty"><legend class="ca-rs-q">' + esc(t('bar.runes_when')) + '</legend>' + radio('store', 'bar.runes_buy') + radio('leave', 'bar.runes_leave') + '</fieldset>'
    + '<p class="ca-rn-shop"></p>'
    + '<ul class="ca-rs-list" role="listbox" aria-label="' + esc(t('bar.runes_buy')) + '"></ul>'
    + '</div>';
}

/** Patch the section for the draft `d`. `c` = { doc, bag (what the hero carries now), store (the server's rows), skills, off (the
   Save in flight: Configure action's own busy line says so) }. */
export function patchRunes(root, d, c) {
  const off = c.off;
  const box = root.querySelector('.ca-runes');
  const sup = runeSupplyOf(d.action);
  cls(box, 'is-on', !!sup);
  if (!sup) return;
  const useOwn = sup.own.length > 0;
  const own = box.querySelector('[data-f="rn-own"]');
  prop(own, 'checked', useOwn);
  prop(own, 'disabled', off);
  const list = useOwn ? carriedRunes(d.action, c.bag, c.skills) : [];
  rows(box.querySelector('.ca-rn-list'), list, {
    key: (r) => r.id,
    build: (r) => element(c.doc, '<li class="ca-rn"><label><input type="checkbox" data-hs-act="cfg-f" data-f="rn-tick" data-rune="' + esc(r.id) + '">'
      + ' <span class="ca-rn-name"></span> <span class="ca-rn-have"></span> <span class="ca-rn-out"></span><span class="ca-rn-lock"></span></label></li>'),
    patch: (li, r) => {
      cls(li, 'is-locked', r.locked);
      const cb = li.querySelector('input');
      prop(cb, 'checked', r.ticked);
      prop(cb, 'disabled', off);
      text(li.querySelector('.ca-rn-name'), r.name);
      text(li.querySelector('.ca-rn-have'), whole(r.have));
      text(li.querySelector('.ca-rn-lock'), r.locked ? t('bar.runes_needs', { needs: r.needs }) : '');
      text(li.querySelector('.ca-rn-out'), r.locked ? '' : landsWith(d.action, { own: [r.id], onEmpty: 'leave' }, c));
    },
  });
  const fam = RUNE_FAMILIES[sup.family];
  text(box.querySelector('.ca-rn-none'), useOwn && !list.length ? t('bar.runes_none', { family: fam ? fam.label : '' }) : '');
  const empty = box.querySelector('.ca-rn-empty');
  prop(empty, 'hidden', !useOwn);
  for (const r of empty.querySelectorAll('input')) { prop(r, 'checked', r.value === sup.onEmpty); prop(r, 'disabled', off); }
  text(box.querySelector('.ca-rn-shop'), useOwn ? '' : t('bar.runes_shop_only'));
  rows(box.querySelector('.ca-rs-list'), sup.onEmpty === 'store' ? storeChoices(d.action, c.store, c.skills) : [], {
    key: (x) => x.id,
    build: (x) => element(c.doc, '<li><button type="button" class="ca-rs" role="option" data-hs-act="cfg" data-x="store" data-store="' + esc(x.id) + '"></button></li>'),
    patch: (li, x) => {
      const sel = sup.store === x.id;
      const b = li.firstElementChild;
      attr(b, 'aria-selected', String(sel));
      cls(b, 'is-on', sel);
      prop(b, 'disabled', off);
      text(b, storeChoiceWords(x, landsWith(d.action, { own: [], store: x.id, onEmpty: 'store' }, c)));
    },
  });
}

/* What one cast lands for this hero on ONE supply (castOf, the engine's rule): a carried tier, or a shop rune. '' when that supply
   would not cast (the cast-facts.js source is not the one asked for). */
function landsWith(a, supply, c) {
  const k = castOf(Object.assign({ type: a.type, id: a.id }, supply), { bag: supply.store ? [] : c.bag, store: c.store, skills: c.skills });
  return k && k.rune && k.rune.source === (supply.store ? 'store' : 'own') ? outputWords(k) : '';
}

/** The slot's action after one of the section's controls (`el`: a box, a tick, a choice, or a shop rune pressed), or null
    when `el` is none of them. `store` are the server's store rows. */
export function runesEdit(d, el, store) {
  const f = el.getAttribute('data-f');
  if (f === 'rn-own') return withSupply(d.action, { useOwn: el.checked === true }, store);
  if (f === 'rn-tick') return withSupply(d.action, { tick: el.getAttribute('data-rune'), on: el.checked === true }, store);
  if (f === 'rn-empty') return withSupply(d.action, { onEmpty: el.value }, store);
  if (el.getAttribute('data-x') === 'store') return withSupply(d.action, { store: el.getAttribute('data-store') }, store);
  return null;
}
