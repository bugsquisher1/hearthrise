// ════════════════════════════════════════════════════════════════════════
// src/world/hunt-config.js — CONFIGURE ACTION (lane B1; Huntera's sheet, as
// Tyler showed it 2026-10-14): tabs Spells | Ammo & Runes | Supplies, a list
// with the price or count on each icon, a detail panel, a CONDITIONS builder
// ([Self][HP][≤/≥][− value +][% ][×], "+ Add condition"), Enabled, Save.
//
// What it edits is a DRAFT held in this module (never G); Save hands one slot
// `{item, on, conditions}` to the caller, which sends it as an intent
// (src/net/hunt.js putSet) and repaints from the server's re-read row. The
// vocabulary is src/data/rule-subjects.js — the same table the server checks
// (hr_hunt_slots_check refuses, never clamps), so a value here is clamped to
// the subject's range before it can be sent.
//
// HIDDEN until the combat redesign: Spells (a disabled tab), mana conditions
// and drinks. Ammo is spent by every swing, not fired by a rule, so its tab
// explains the bag and the shop's per-shot price and saves nothing.
// The layer is the modal primitive (.hr-scrim / .hr-sheet, Escape through
// src/render/modal-sheet.js's [data-hr-dismiss]).
// ════════════════════════════════════════════════════════════════════════
import { ITEMS } from '../data/items.js?v=582';
import { SUPPLIES, SUPPLY_ROWS, HEAL_ORDER } from '../data/supplies.js?v=582';
import { BASIC_SUPPLIES } from '../data/supply-basics.js?v=582';
import { RULE_SUBJECTS, RULE_OPERATORS, ACTION_SET_LIMITS, HEAL_ANY, parseSubject } from '../data/rule-subjects.js?v=582';
import { resolveTarget } from './hunt-bar.js?v=582';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
const fmt = (n) => Math.round(Number(n) || 0).toLocaleString('en-US');
const nameOf = (id) => (ITEMS[id] && ITEMS[id].name) || String(id || '').replace(/_/g, ' ');

/* The subjects a supply slot may ask today, in the order the menu lists them.
   Mana waits for the mana engine; buff subjects wait for buffs (parked). */
const OFFERED = [['self_hp_pct', 'HP'], ['session_minutes', 'Minutes hunting'], ['bag_left', 'Left in bag']];
const STEP = { self_hp_pct: 5, session_minutes: 5, bag_left: 10 };
const DEFAULT_VALUE = { self_hp_pct: 50, session_minutes: 60, bag_left: 10 };

export const CONFIG_TABS = Object.freeze([
  { id: 'spells', label: 'Spells', off: 'Spells arrive with the combat update.' },
  { id: 'ammo', label: 'Ammo & Runes' },
  { id: 'supplies', label: 'Supplies' },
]);

/** Clamp a typed value into a subject's range (the server refuses outside it). */
export function clampValue(subject, v) {
  const spec = RULE_SUBJECTS[parseSubject(subject).base];
  if (!spec || !spec.range) return null;
  const n = Math.round(Number(v));
  return Math.max(spec.range[0], Math.min(spec.range[1], Number.isFinite(n) ? n : spec.range[0]));
}

/**
 * The sheet's model. PURE.
 * @param {object} o
 *   draft  {index, tab, pick, on, conds}   the sheet's own state
 *   tier   the hunt's tier (shop prices)
 *   counts {itemId: n}  what each supply shows: the bag's `left` on a hunt, the inventory otherwise
 *   ammo   the equipped ammo id, or null
 *   counted  'bag' | 'inventory'
 */
export function configModel(o) {
  const d = o.draft;
  const counts = o.counts || {};
  const shopHeal = resolveTarget('*heal_shop', o.tier);
  const list = [];
  if (d.tab === 'supplies') {
    const heals = HEAL_ORDER.filter((id) => Number(counts[id]) > 0);
    list.push({ target: HEAL_ANY, name: 'Cheapest food', art: heals[0] || HEAL_ORDER[0], badge: { kind: 'count', text: fmt(heals.reduce((n, id) => n + Number(counts[id]), 0)) } });
    list.push({ target: '*heal_shop', name: shopHeal.name, art: shopHeal.art, badge: { kind: 'price', text: fmt(shopHeal.price) + 'g' } });
    for (const id of heals) list.push({ target: id, name: nameOf(id), art: id, badge: { kind: 'count', text: fmt(counts[id]) } });
    /* The slot being edited stays listed even when none is left to count. */
    if (d.pick && !list.some((x) => x.target === d.pick)) {
      const r = resolveTarget(d.pick, o.tier);
      list.push({ target: d.pick, name: r.name, art: r.art, badge: r.src === 'shop' ? { kind: 'price', text: fmt(r.price) + 'g' } : { kind: 'count', text: fmt(counts[d.pick]) } });
    }
  } else if (d.tab === 'ammo') {
    const ammo = SUPPLY_ROWS.filter((r) => r[0] === 'ammo' && (Number(counts[r[1]]) > 0 || r[1] === o.ammo)).map((r) => r[1]);
    for (const id of ammo) list.push({ target: id, name: nameOf(id), art: id, badge: { kind: 'count', text: fmt(counts[id]) }, ammo: true });
  }
  const pick = d.pick && (d.tab !== 'ammo' || list.some((x) => x.target === d.pick)) ? d.pick : (list[0] && list[0].target) || null;
  let detail = null;
  if (d.tab === 'ammo') {
    const shot = pick ? BASIC_SUPPLIES.find((b) => b.kind === 'ammo' && b.partner === pick) : null;
    detail = { name: pick ? nameOf(pick) : 'Ammo & Runes', art: pick, lines: [
      'Ammo is used by every swing, so it is packed in your hunt bag rather than set on the bar.',
      shot ? 'When the bag runs out, the shop\'s ' + shot.n + ' cost ' + fmt(shot.price) + ' gold per shot.' : 'Your free starter ammo never runs out.',
    ] };
  } else if (pick) {
    const r = resolveTarget(pick, o.tier);
    const heals = r.heals ? 'Heals ' + fmt(r.heals) + '.' : null;
    const lines = ['Uses itself when its rule passes.'];
    if (r.src === 'shop') lines.push((heals ? heals + ' ' : '') + 'Costs ' + fmt(r.price) + ' gold per use, paid from your purse as it fires. Nothing to pack.');
    else if (r.any) lines.push('Eats the cheapest healing food in your bag first.');
    else lines.push((heals ? heals + ' ' : '') + 'From your bag.');
    detail = { name: r.name, art: r.art, lines };
  }
  const pickIsItem = !!(pick && SUPPLIES[pick]);
  const conds = (d.conds || []).map((c, i) => {
    const { base } = parseSubject(c.subject);
    const spec = RULE_SUBJECTS[base] || {};
    return { i, base, op: c.op, value: c.value, range: spec.range, pct: base.endsWith('_pct'),
      subjects: OFFERED.filter(([k]) => k !== 'bag_left' || pickIsItem || base === 'bag_left').map(([k, label]) => ({ k, label, on: k === base })) };
  });
  return {
    index: d.index, tab: d.tab, tabs: CONFIG_TABS.map((t) => Object.assign({ on: t.id === d.tab }, t)),
    list: list.map((x) => Object.assign({ on: x.target === pick }, x)), pick, detail, conds, on: d.on !== false,
    canAdd: conds.length < ACTION_SET_LIMITS.conditions,
    canSave: d.tab === 'supplies' && !!pick, canRemove: d.index >= 0,
    counted: o.counted || 'inventory',
  };
}

/** The slot a Save sends: ids, an operator and whole numbers in range. PURE. */
export function draftSlot(d, pick) {
  return {
    item: pick, on: d.on !== false,
    conditions: (d.conds || []).map((c) => {
      const { base } = parseSubject(c.subject);
      const subject = base === 'bag_left' ? 'bag_left:' + pick : base;
      return { subject, op: RULE_OPERATORS[c.op] ? c.op : '<=', value: clampValue(subject, c.value) };
    }),
  };
}

function sheetHtml(m, art) {
  const tabs = m.tabs.map((t) => '<button type="button" role="tab" class="hcfg-tab' + (t.on ? ' is-on' : '') + '" aria-selected="' + t.on + '"'
    + (t.off ? ' disabled title="' + esc(t.off) + '"' : ' data-cfg-tab="' + t.id + '"') + '>' + esc(t.label) + '</button>').join('');
  const list = m.list.length ? m.list.map((x) => '<button type="button" class="hcfg-item' + (x.on ? ' is-on' : '') + '" data-cfg-pick="' + esc(x.target) + '" aria-pressed="' + x.on + '">'
    + '<span class="hbar-slot is-mini"><span class="hbar-art" aria-hidden="true">' + (x.art ? art(x.art) : '') + '</span>'
    + '<span class="hbar-badge is-' + x.badge.kind + '">' + esc(x.badge.text) + '</span></span><span class="hcfg-name">' + esc(x.name) + '</span></button>').join('')
    : '<p class="hcfg-empty">' + (m.tab === 'ammo' ? 'No ammo in your bag or bank. A bow or staff needs it; a sword does not.' : 'Nothing to show yet.') + '</p>';
  const det = m.detail ? '<div class="hcfg-detail"><span class="hbar-slot is-mini"><span class="hbar-art" aria-hidden="true">' + (m.detail.art ? art(m.detail.art) : '') + '</span></span>'
    + '<div><b>' + esc(m.detail.name) + '</b>' + m.detail.lines.map((l) => '<p>' + esc(l) + '</p>').join('') + '</div></div>' : '';
  const rows = m.conds.map((c) => '<div class="hcfg-cond" data-cfg-row="' + c.i + '">'
    + '<select aria-label="Whose" disabled><option>Self</option></select>'
    + '<select data-cfg-subj="' + c.i + '" aria-label="What">' + c.subjects.map((s) => '<option value="' + s.k + '"' + (s.on ? ' selected' : '') + '>' + esc(s.label) + '</option>').join('') + '</select>'
    + '<select data-cfg-op="' + c.i + '" aria-label="Compare">' + Object.entries(RULE_OPERATORS).map(([k, v]) => '<option value="' + esc(k) + '"' + (k === c.op ? ' selected' : '') + '>' + esc(v.label) + '</option>').join('') + '</select>'
    + '<span class="hcfg-num"><button type="button" data-cfg-step="' + c.i + ':-1" aria-label="Less">−</button>'
    + '<input type="number" inputmode="numeric" data-cfg-val="' + c.i + '" value="' + esc(c.value) + '" min="' + (c.range ? c.range[0] : 0) + '" max="' + (c.range ? c.range[1] : 0) + '" aria-label="Value">'
    + '<button type="button" data-cfg-step="' + c.i + ':1" aria-label="More">+</button></span>'
    + (c.pct ? '<label class="hcfg-pct"><input type="checkbox" checked disabled> %</label>' : '<span class="hcfg-pct" aria-hidden="true"></span>')
    + '<button type="button" class="hcfg-x" data-cfg-del="' + c.i + '" aria-label="Remove this condition">×</button></div>').join('');
  const conds = m.tab === 'supplies' ? '<fieldset class="hcfg-conds"><legend>Conditions</legend>' + rows
    + (m.canAdd ? '<button type="button" class="whud-link" data-cfg-add>+ Add condition</button>' : '')
    + '<p class="hcfg-note">All conditions must match. No conditions means always.</p></fieldset>'
    + '<label class="hcfg-on"><input type="checkbox" data-cfg-on' + (m.on ? ' checked' : '') + '> Enabled</label>' : '';
  return '<div class="hr-sheet hcfg-sheet" role="dialog" aria-modal="true" aria-label="Configure action">'
    + '<header class="hr-sheet-head hcfg-head"><h3>Configure action</h3><button type="button" class="hcfg-close" data-hr-dismiss data-cfg-close aria-label="Close">×</button></header>'
    + '<div class="hr-sheet-body hcfg-body"><div class="hcfg-tabs" role="tablist">' + tabs + '</div>'
    + '<div class="hcfg-grid"><div class="hcfg-list">' + list + '</div><div class="hcfg-side">' + det + conds + '</div></div></div>'
    + '<footer class="hr-sheet-foot hcfg-foot">' + (m.canRemove ? '<button type="button" class="whud-btn is-small is-leave" data-cfg-remove>Remove</button>' : '')
    + '<button type="button" class="whud-btn is-primary" data-cfg-save' + (m.canSave ? '' : ' disabled') + '>Save</button></footer></div>';
}

/**
 * The sheet controller. `open(index, slot)` edits bar slot `index` (-1: a new
 * one); Save → `o.save(index, slot)`, Remove → `o.remove(index)`.
 * @param {Document} doc
 * @param {{art, inputs: () => {tier, counts, ammo, counted}, save, remove, paint?}} o
 */
export function createConfigSheet(doc, o) {
  let draft = null, scrim = null;
  const render = () => {
    if (!scrim || !draft) return;
    const m = configModel(Object.assign({ draft }, o.inputs()));
    draft.pick = m.pick;
    const html = sheetHtml(m, o.art);
    if (o.paint && typeof o.paint.html === 'function') o.paint.html(scrim, html); else scrim.innerHTML = html;
  };
  const close = () => { if (scrim) scrim.remove(); scrim = null; draft = null; };
  const onClick = (e) => {
    const t = e.target && e.target.closest ? e.target : null;
    if (!t || !draft) return;
    if (t === scrim || t.closest('[data-cfg-close]')) { close(); return; }
    const tab = t.closest('[data-cfg-tab]');
    if (tab) { draft.tab = tab.getAttribute('data-cfg-tab'); draft.pick = null; render(); return; }
    const pick = t.closest('[data-cfg-pick]');
    if (pick) { draft.pick = pick.getAttribute('data-cfg-pick'); render(); return; }
    if (t.closest('[data-cfg-add]')) { draft.conds.push({ subject: 'self_hp_pct', op: '<=', value: DEFAULT_VALUE.self_hp_pct }); render(); return; }
    const del = t.closest('[data-cfg-del]');
    if (del) { draft.conds.splice(Number(del.getAttribute('data-cfg-del')), 1); render(); return; }
    const step = t.closest('[data-cfg-step]');
    if (step) {
      const [i, dir] = step.getAttribute('data-cfg-step').split(':').map(Number);
      const c = draft.conds[i];
      const base = parseSubject(c.subject).base;
      c.value = clampValue(base, Number(c.value) + dir * (STEP[base] || 1));
      render(); return;
    }
    if (t.closest('[data-cfg-save]')) {
      const m = configModel(Object.assign({ draft }, o.inputs()));
      if (!m.canSave) return;
      const i = draft.index;
      const slot = draftSlot(draft, m.pick);
      close();
      o.save(i, slot);
      return;
    }
    if (t.closest('[data-cfg-remove]')) { const i = draft.index; close(); o.remove(i); }
  };
  const onChange = (e) => {
    const t = e.target;
    if (!t || !draft) return;
    const subj = t.getAttribute('data-cfg-subj'), op = t.getAttribute('data-cfg-op'), val = t.getAttribute('data-cfg-val');
    if (subj != null) { const c = draft.conds[Number(subj)]; c.subject = t.value; c.value = DEFAULT_VALUE[t.value]; render(); }
    else if (op != null) { draft.conds[Number(op)].op = t.value; render(); }
    /* No repaint here: a blur that lands on Save must not swap the button under the click. */
    else if (val != null) { const c = draft.conds[Number(val)]; c.value = clampValue(parseSubject(c.subject).base, t.value); t.value = c.value; }
    else if (t.hasAttribute('data-cfg-on')) { draft.on = !!t.checked; }
  };
  /* Typing changes the draft without a repaint (a repaint would take the caret);
     the value is clamped and redrawn on `change`. */
  const onInput = (e) => {
    const t = e.target, val = t && t.getAttribute && t.getAttribute('data-cfg-val');
    if (val != null && draft) draft.conds[Number(val)].value = t.value;
  };
  return {
    open(index, slot) {
      close();
      const s = slot || null;
      draft = {
        index: s ? index : -1, tab: 'supplies', pick: s ? s.item : null, on: s ? s.on !== false : true,
        conds: s && Array.isArray(s.conditions) ? s.conditions.map((c) => ({ subject: parseSubject(c.subject).base, op: c.op || '<=', value: c.value })) : [],
      };
      scrim = doc.createElement('div');
      scrim.className = 'hr-scrim hcfg-scrim';
      scrim.addEventListener('click', onClick);
      scrim.addEventListener('change', onChange);
      scrim.addEventListener('input', onInput);
      doc.body.appendChild(scrim);
      render();
      const first = scrim.querySelector('.hcfg-item.is-on, .hcfg-item, [data-cfg-save]');
      if (first && first.focus) first.focus();
    },
    close, render,
    isOpen: () => !!scrim,
    el: () => scrim,
  };
}
