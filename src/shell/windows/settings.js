// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/settings.js — SETTINGS: ONE WINDOW, BUILT FROM THE REGISTRY.
//
// Holds no setting of its own. Every row, category and default is data in
// src/data/settings.js; how a row is read and written is src/shell/settings-model.js.
// A feature adds a setting by adding a row there, never here.
//
// Desktop: category tabs down the left, the chosen category's page on the right.
// Phone sheet: the category list first, then one page with a Back button.
// Search filters every category by label and help text at once. Built once;
// patched in place through paint.js, so a search or a toggle never rebuilds it.
// ════════════════════════════════════════════════════════════════════════
import { SETTINGS, SETTING_CATEGORIES } from '../../data/settings.js?v=0.2.12';
import { read, write, visible, categoriesFor, search } from '../settings-model.js?v=0.2.12';
import { keyLabel } from '../launcher.js?v=0.2.12';
import { attr, cls, prop, text } from '../../render/paint.js?v=0.2.12';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.12';

function control(r) {
  const sid = 'data-sid="' + esc(r.id) + '" data-hs-act="set"';
  const label = 'aria-label="' + esc(r.label) + '"';
  if (r.type === 'toggle') {
    const f = r.bind.store === 'float' ? ' data-float="' + esc(r.bind.type) + '" data-target="' + esc(r.bind.target) + '"' : '';
    return '<input type="checkbox" ' + sid + f + ' ' + label + '>';
  }
  if (r.type === 'choice') return '<select class="st-select" ' + sid + ' ' + label + '>' + r.options.map((o) => '<option value="' + esc(o.value) + '">' + esc(o.label) + '</option>').join('') + '</select>';
  if (r.type === 'slider') return '<input type="range" min="' + r.options.min + '" max="' + r.options.max + '" step="' + (r.options.step || 1) + '" ' + sid + ' ' + label + '>';
  if (r.type === 'action') return '<button type="button" class="hs-quiet" data-hs-act="run" data-sid="' + esc(r.id) + '">' + esc(r.label) + '</button>';
  return '<kbd class="hs-key">' + esc(keyLabel(r.key)) + '</kbd>';
}

function rowHtml(r) {
  const head = r.type === 'toggle' || r.type === 'choice' || r.type === 'slider'
    ? '<label class="st-label">' + esc(r.label) + '</label>' : '<span class="st-label">' + (r.type === 'action' ? '' : esc(r.label)) + '</span>';
  return '<div class="st-row" data-row="' + esc(r.id) + '" title="' + esc(r.help) + '"><div class="st-line">' + head + control(r)
    + '</div><p class="st-help">' + esc(r.help) + '</p></div>';
}

/** The skeleton (built once). */
export function renderSettings() {
  const tabs = SETTING_CATEGORIES.map((c) => '<button type="button" class="st-tab" data-hs-act="cat" data-cat="' + esc(c.id) + '">' + esc(c.label) + '</button>').join('');
  const pages = SETTING_CATEGORIES.map((c) => '<section class="st-page" data-page="' + esc(c.id) + '"><h3 class="hs-sub">' + esc(c.label) + '</h3>'
    + '<p class="hs-note">' + esc(c.blurb) + '</p>' + SETTINGS.filter((r) => r.category === c.id).map(rowHtml).join('') + '</section>').join('');
  return '<div class="st" data-view="list">'
    + '<div class="st-find"><input type="search" class="st-search" data-hs-act="search" placeholder="Search settings" aria-label="Search settings" autocomplete="off"></div>'
    + '<div class="st-body"><nav class="st-tabs" aria-label="Setting categories">' + tabs + '</nav>'
    + '<div class="st-pages"><button type="button" class="st-back" data-hs-act="back">&lsaquo; All settings</button>' + pages
    + '<p class="hs-note st-none" hidden>No setting matches that.</p></div></div></div>';
}

renderSettings.events = ['input'];

renderSettings.patch = function patchSettings(body, ctx) {
  const root = body.querySelector('.st');
  if (!root) return;
  const q = root.getAttribute('data-q') || '';
  const found = new Set(search(SETTINGS, q).map((r) => r.id));
  const live = categoriesFor(ctx, SETTINGS, SETTING_CATEGORIES).map((c) => c.id);
  let active = root.getAttribute('data-cat');
  if (!live.includes(active)) active = live[0] || '';
  let any = false;
  for (const r of SETTINGS) {
    const el = root.querySelector('[data-row="' + r.id + '"]');
    const shown = visible(ctx, r) && found.has(r.id);
    attr(el, 'hidden', !shown);
    if (!shown) continue;
    any = true;
    const c = el.querySelector('[data-sid]');
    if (!c || r.type === 'action') continue;
    const v = read(ctx, r);
    if (r.type === 'toggle') prop(c, 'checked', v === true);
    else if (document.activeElement !== c) prop(c, 'value', String(v));
  }
  for (const c of SETTING_CATEGORIES) {
    const page = root.querySelector('[data-page="' + c.id + '"]');
    const has = !!page.querySelector('.st-row:not([hidden])');
    attr(page, 'hidden', !has || (!q && c.id !== active));
    const tab = root.querySelector('.st-tab[data-cat="' + c.id + '"]');
    attr(tab, 'hidden', !live.includes(c.id));
    cls(tab, 'is-on', !q && c.id === active);
  }
  attr(root.querySelector('.st-none'), 'hidden', any);
  attr(root, 'data-view', q ? 'page' : root.getAttribute('data-view'));
  text(root.querySelector('.st-back'), q ? '‹ Clear search' : '‹ All settings');
};

renderSettings.act = function actSettings(ctx, body, action, ev, t) {
  const root = body.querySelector('.st');
  if (action === 'search' && ev.type === 'input') {
    attr(root, 'data-q', t.value.trim() || null);
    attr(root, 'data-view', t.value.trim() ? 'page' : 'list');
  } else if (action === 'cat' && ev.type === 'click') {
    attr(root, 'data-cat', t.getAttribute('data-cat'));
    attr(root, 'data-view', 'page');
  } else if (action === 'back' && ev.type === 'click') {
    const find = root.querySelector('.st-search');
    prop(find, 'value', '');
    attr(root, 'data-q', null);
    attr(root, 'data-view', 'list');
  } else if (action === 'set' && ev.type === 'change') {
    const r = SETTINGS.find((x) => x.id === t.getAttribute('data-sid'));
    if (!r) return;
    write(ctx, r, r.type === 'toggle' ? t.checked : r.type === 'slider' ? Number(t.value) : t.value);
  } else if (action === 'run' && ev.type === 'click') {
    const r = SETTINGS.find((x) => x.id === t.getAttribute('data-sid'));
    if (r && r.open) ctx.show(r.open);
    else if (r && ctx.character && typeof ctx.character[r.run] === 'function') ctx.character[r.run]();
  } else return;
  renderSettings.patch(body, ctx);
};
