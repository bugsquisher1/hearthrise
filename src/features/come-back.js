// src/features/come-back.js — COME BACK FOR: Home's reasons to return.
//
// Turns clocks the server already owns into at most MAX_ROWS rows: a ripe or
// waterable crop, and the next crop to ripen. It is read-and-navigate only:
// nothing here sends an intent, spends, gates or claims, and every number comes
// from a server reader (CLAUDE.md §6):
//   crops    HearthriseFarm (the farm tile's predicates over the projected plots)
// The dungeon Auto-Run windows, the Boss of the Day rows and the midnight
// "new daily quests" row left with their systems (2026-10-14 demolition).
//
// inputs(G, now) gathers, model(inputs) is pure, card(G) renders. Home repaints
// every 1.5 s, so there is no timer here. setupComeBack() publishes
// window.HearthriseComeBack and one delegated click listener on [data-cbk].

const MAX_ROWS = 4;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function clock(ms) {
  const m = Math.max(1, Math.ceil(ms / 60000));
  return m >= 60 ? Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm' : m + 'm';
}

function cropsOf(G) {
  const F = window.HearthriseFarm, CROPS = window.CROPS || {};
  if (!F || !G || !Array.isArray(G.farmPlots)) return [];
  const out = [];
  for (const p of G.farmPlots) {
    if (!p || !CROPS[p.cropId]) continue;
    const ready = p.state === 'ready' || !!F.isReady(p);
    out.push({ name: CROPS[p.cropId].name, ready, waterable: !ready && !!F.isWaterable(p), inMs: ready ? 0 : F.readyInMs(p) });
  }
  return out;
}

function inputs(G, now) {
  return { now, crops: cropsOf(G) };
}

/** Pure: the rows, 'Now' first, then by clock. */
function model({ crops }) {
  const rows = [];
  const ready = (crops || []).filter((c) => c.ready);
  if (ready.length) {
    const n = ready.length - 1;
    rows.push({ kind: 'ready', glyph: 'navFarm', door: 'farm', when: 'Now', sort: -2, sHtml: '',
      t: n ? ready[0].name + ' and ' + n + ' more plot' + (n === 1 ? '' : 's') + ' are ready to harvest' : ready[0].name + ' is ready to harvest' });
  }
  const wet = (crops || []).filter((c) => c.waterable);
  if (wet.length) {
    rows.push({ kind: 'water', glyph: 'uiSprout', door: 'farm', when: 'Now', sort: -1,
      t: wet.length === 1 ? wet[0].name + ' can take water' : wet.length + ' plots can take water',
      sHtml: esc('Watered, a crop grows twice as fast for two hours.') });
  }
  const growing = (crops || []).filter((c) => !c.ready && Number.isFinite(c.inMs) && c.inMs > 0)
    .sort((a, b) => a.inMs - b.inMs)[0];
  if (growing) {
    rows.push({ kind: 'ripens', glyph: 'uiHourglass', door: 'farm', t: growing.name + ' ripens', sHtml: '',
      when: 'in about ' + clock(growing.inMs), sort: growing.inMs });
  }
  return rows.map((r, i) => [r, i]).sort((a, b) => (a[0].sort - b[0].sort) || (a[1] - b[1]))
    .slice(0, MAX_ROWS).map(([{ kind, glyph, t, sHtml, when, door }]) => ({ kind, glyph, t, sHtml, when, door }));
}

function icon(glyph, colour) {
  const HR = window.HR;
  return (HR && typeof HR.icon === 'function') ? (HR.icon(glyph, 20, colour) || '') : '';
}
const TONE = { ready: 'var(--green)', water: 'var(--green)' };

function card(G) {
  const rows = model(inputs(G, Date.now()));
  if (!rows.length) return '';
  const html = rows.map((r) =>
    '<div class="hd-card hd-duo" data-cbk="' + esc(r.door) + '" data-cbk-row="' + esc(r.kind) + '" style="cursor:pointer">' +
      '<div class="mi">' + icon(r.glyph, r.when ? (TONE[r.kind] || 'var(--gold-2)') : 'var(--ink-3)') + '</div>' +
      '<div class="bd"><div class="t">' + esc(r.t) + '</div>' + (r.sHtml ? '<div class="s">' + r.sHtml + '</div>' : '') + '</div>' +
      (r.when ? '<div class="when">' + esc(r.when) + '</div>' : '') +
    '</div>').join('');
  return '<div data-cbk-section><div class="hd-h"><h3>Come back for</h3></div><div class="hd-rows">' + html + '</div></div>';
}

function onClick(e) {
  const el = e.target && e.target.closest && e.target.closest('[data-cbk]');
  if (!el) return;
  const tab = { farm: 'farming' }[el.getAttribute('data-cbk')];
  if (tab && typeof window.showTab === 'function') window.showTab(tab);
}

export function setupComeBack() {
  window.HearthriseComeBack = Object.freeze({ inputs, model, card, MAX_ROWS });
  document.addEventListener('click', onClick);
}
