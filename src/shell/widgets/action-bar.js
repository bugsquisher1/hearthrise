// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/action-bar.js — THE HEARTH-EMBLEM BOTTOM BAR (parity BB-*, HS-*).
//
// Hunts are idle (Tyler 10-16): the bar is CONFIGURATION, never a cast button.
//   vitals   HP and mana with their regen per second, level and XP, stamina
//            time left — every number from the `hunt` and `stamina` sections
//   tablets  the active action set's 20 slots, ten either side of the emblem:
//            an icon, mana cost top-left, count top-right, the first
//            condition's percent; a slot the server marks unusable is greyed
//            and struck; a press opens Configure action on that slot; a food,
//            drink or ammo stack dragged from the bag onto a slot puts it
//            there (ONE intent, the whole bar restated: src/shell/bar-assign.js)
//   plaque   the action set's name, target, stance, chase and distance — each
//            change an INTENT through settings-intent.js, the controls off
//            until the server has confirmed. The full editor (thresholds,
//            supplies) is the hunt settings window, one button away.
// The bar shows in town too (Tyler 10-18: set it up before leaving); the
// vitals show only while a hunt runs. Saved setups (Hunt prep) are one
// button away. On a phone the tablets become one swipeable row and the plaque
// collapses to the editor button (parity SH-07, HS-08).
// ════════════════════════════════════════════════════════════════════════
import { BAR_SLOTS } from '../../data/hunt-hud.js?v=0.2.1';
import { huntOf, settingsOf, staminaOf } from '../../session/hunt-sections.js?v=0.2.1';
import { text, cls, attr } from '../../render/paint.js?v=0.2.1';
import { whole, pct, hoursMinutes } from '../../render/format.js?v=0.2.1';
import { glyphSvg } from '../launcher.js?v=0.2.1';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.1';
import { gaugeHtml, patchGauge, itemIconHtml, itemName, abilityName } from './bits.js?v=0.2.1';
import { ITEMS } from '../../data/items.js?v=0.2.1';
import { METRICS } from '../../data/condition-metrics.js?v=0.2.1';
import { openSlot, storeOf, storeWords } from '../bar-draft.js?v=0.2.1';
import { assignToBar, barKind } from '../bar-assign.js?v=0.2.1';
import { DRAG_TYPE } from '../windows/inventory/actions.js?v=0.2.1';
import { refusalWords } from '../intent-words.js?v=0.2.1';

const METRIC_KIND = new Map(METRICS.map((m) => [m.id, m.value]));
import { targetOptionsHtml, stanceButtonsHtml, distanceHtml, patchControls, sendOption } from './settings-intent.js?v=0.2.1';

const HALF = (BAR_SLOTS.rows * BAR_SLOTS.cols) / 2;

function slotHtml(i) {
  return '<li class="hb-slot is-empty" data-slot="' + i + '" data-hs-act="slot" role="button" tabindex="0"><span class="hb-slot-ico"></span>'
    + '<small class="hb-mana"></small><small class="hb-count"></small><small class="hb-thr"></small></li>';
}

function tabletHtml(from, label) {
  let h = '<ol class="hb-tablet" aria-label="' + esc(label) + '">';
  for (let i = from; i < from + HALF; i++) h += slotHtml(i);
  return h + '</ol>';
}

/** The skeleton (built once). */
export function renderActionBar(ctx) {
  const g = ctx.glyphs;
  return '<div class="hb-bar" role="group" aria-label="Hunt bar">'
    + '<div class="hb-vitals">'
    + '<div class="hb-vital">' + gaugeHtml('hp', 'Health') + '<small class="hb-regen" data-regen="hp"></small></div>'
    + '<div class="hb-vital">' + gaugeHtml('mana', 'Mana') + '<small class="hb-regen" data-regen="mana"></small></div>'
    + '<div class="hb-vital">' + gaugeHtml('xp', 'Experience') + '</div>'
    + '<div class="hb-vital">' + gaugeHtml('stamina', 'Stamina') + '</div>'
    + '</div>'
    + tabletHtml(0, 'Slots 1 to 10')
    + '<div class="hb-emblem" aria-hidden="true">' + glyphSvg(g, 'uiFlame', 'hb-emblem-glyph') + '<b class="hb-level"></b></div>'
    + tabletHtml(HALF, 'Slots 11 to 20')
    + '<div class="hb-plaque">'
    + '<div class="hb-row"><span class="hb-label">Action set</span><b class="hb-set"></b>'
    + '<button type="button" class="hh-tool" data-hs-act="setups" aria-label="Saved setups">' + glyphSvg(g, 'uiCheck') + '</button>'
    + '<button type="button" class="hh-tool" data-hs-act="editor" aria-label="Edit hunt settings">' + glyphSvg(g, 'uiSettings') + '</button></div>'
    + '<label class="hb-row"><span class="hb-label">Target</span><select class="hh-select" data-opt="target_mode" data-hs-act="opt">' + targetOptionsHtml() + '</select></label>'
    + '<div class="hb-row hb-seg-row"><span class="hh-segs" role="group" aria-label="Stance">' + stanceButtonsHtml() + '</span>'
    + '<button type="button" class="hh-seg" data-opt="chase" data-hs-act="opt" aria-pressed="false">Chase</button>'
    + distanceHtml() + '</div>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p>'
    + '</div></div>';
}

function patchSlot(li, s, glyphs) {
  if (li.getAttribute('data-item') !== (s.empty ? '' : s.item)) {
    attr(li, 'data-item', s.empty ? '' : s.item);
    const ico = li.querySelector('.hb-slot-ico');
    ico.innerHTML = s.empty ? '' : ITEMS[s.item] ? itemIconHtml(glyphs, s.item) : glyphSvg(glyphs, s.item === 'basic' ? 'uiSword' : 'uiSpark');
  }
  const st = s.empty ? null : storeOf(s.action);
  attr(li, 'title', s.empty ? 'Empty slot: press to configure' : (s.action.type === 'ability' ? abilityName(s.item) : ITEMS[s.item] ? itemName(s.item) : s.item === 'food' ? 'Any food' : s.item === 'drink' ? 'Any drink' : 'The loaded ammo')
    + (st ? ' · own first, ' + storeWords(st) : ''));
  cls(li, 'is-empty', s.empty);
  cls(li, 'is-off', !s.empty && !s.usable);
  text(li.querySelector('.hb-mana'), !s.empty && s.mana ? s.mana : '');
  text(li.querySelector('.hb-count'), !s.empty && s.count !== null ? whole(s.count) : '');
  const c = !s.empty && s.conditions[0];
  text(li.querySelector('.hb-thr'), c && typeof c.value === 'number' && METRIC_KIND.get(c.metric) === 'pct' ? c.value + '%' : '');
}

renderActionBar.patch = function patchActionBar(el, ctx) {
  const cs = ctx.character;
  const h = huntOf(cs);
  const hero = h ? h.hero : {};
  const st = staminaOf(cs);
  cls(el.querySelector('.hb-bar'), 'is-town', !h);
  const s = settingsOf(cs);
  const regen = (v) => (Number.isFinite(v) && v > 0 ? '+' + whole(v) : '');
  patchGauge(el.querySelector('.is-hp'), hero.hp, hero.hpMax, hero.hp == null ? 'Health –' : whole(hero.hp) + ' / ' + whole(hero.hpMax));
  patchGauge(el.querySelector('.is-mana'), hero.mana, hero.manaMax, hero.mana == null ? 'Mana –' : whole(hero.mana) + ' / ' + whole(hero.manaMax));
  patchGauge(el.querySelector('.is-xp'), hero.xpPct, 1, (hero.level == null ? 'Level –' : 'Level ' + hero.level) + '  ' + pct(hero.xpPct));
  patchGauge(el.querySelector('.is-stamina'), st ? st.msLeft : null, st ? st.capMs : null, 'Stamina ' + hoursMinutes(st ? st.msLeft : null));
  text(el.querySelector('[data-regen="hp"]'), regen(hero.hpRegen));
  text(el.querySelector('[data-regen="mana"]'), regen(hero.manaRegen));
  text(el.querySelector('.hb-level'), hero.level == null ? '' : hero.level);
  const slots = s ? s.slots : [];
  for (const li of el.querySelectorAll('.hb-slot')) patchSlot(li, slots[Number(li.getAttribute('data-slot'))] || { empty: true }, ctx.glyphs);
  const set = s && s.presets.find((p) => p.preset === s.preset);
  text(el.querySelector('.hb-set'), set ? set.name : s ? 'Set ' + (s.preset + 1) : '–');
  patchControls(el.querySelector('.hb-plaque'), cs);
};

renderActionBar.events = Object.freeze(['dragover', 'dragleave', 'drop']);

/* A bag stack dropped on a slot: one bar intent; the slot changes when the server's bar does. */
function dropOnSlot(ctx, el, ev, t) {
  const types = Array.from((ev.dataTransfer && ev.dataTransfer.types) || []);
  if (!types.includes(DRAG_TYPE)) return false;
  if (ev.type === 'dragleave') { cls(t, 'is-drop', false); return false; }
  ev.preventDefault();
  cls(t, 'is-drop', ev.type === 'dragover');
  if (ev.type !== 'drop') return true;
  const id = ev.dataTransfer.getData(DRAG_TYPE);
  const msg = el.querySelector('.hb-plaque .hh-intent-msg');
  if (!barKind(id)) { text(msg, refusalWords('not_for_bar')); return true; }
  text(msg, 'Putting it on the bar…');
  assignToBar(ctx.character, id, Number(t.getAttribute('data-slot'))).then((r) => { text(msg, r.ok ? '' : refusalWords(r.error)); renderActionBar.patch(el, ctx); });
  return true;
}

renderActionBar.act = function actActionBar(ctx, el, action, ev, t) {
  if (action === 'slot' && ev.type !== 'click') return dropOnSlot(ctx, el, ev, t);
  if (action === 'editor' && ev.type === 'click') { ctx.show('hunt-settings'); return; }
  if (action === 'setups' && ev.type === 'click') { ctx.show('hunt-prep'); return; }
  /* A slot opens Configure action on that slot (BB-18): the bar is configured, never pressed. */
  if (action === 'slot' && ev.type === 'click') { openSlot(ctx.character, Number(t.getAttribute('data-slot'))); ctx.show('configure-action'); ctx.refresh('configure-action'); return; }
  if (action !== 'opt') return;
  /* A select reports on change; a button on click. */
  if ((t.tagName === 'SELECT') !== (ev.type === 'change')) return;
  sendOption(ctx, el.querySelector('.hb-plaque'), t, () => renderActionBar.patch(el, ctx));
};
