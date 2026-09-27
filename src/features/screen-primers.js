// ============================================================
// src/features/screen-primers.js — one "what is this screen for?" note per screen
//
// On the first visit to a panel that has a row in src/data/screen-primers.js,
// prepend a short note with a "Got it" button. Keyed on the ACTIVE PANEL's id,
// never on the tab name ('shops', 'shop', 'premium' and 'market' reach two
// panels). The dismissal marker is a device-local preference: it lives only in
// HearthriseStorage, never in G, never in the residue, never in an intent.
//
// Publishes window.HearthriseScreenPrimers = {html, shouldShow, reset,
// dismissAll, _park}. The suite parks it for the run (src/features/smoke-test.js)
// so a primer never moves the layout under an unrelated test; PRIMER-1..3
// (src/features/smoke/boot.js) unpark inside their own bodies.
//
// Exports: setupScreenPrimers().
// ============================================================

import { SCREEN_PRIMERS } from '../data/screen-primers.js?v=557';

const KEY = (id) => 'hearthrise:primer:' + id;
let parked = false;

const store = () => window.HearthriseStorage || null;
const isDismissed = (id) => { const S = store(); return !!S && S.get(KEY(id)) === '1'; };

function build(id) {
  const row = SCREEN_PRIMERS[id];
  if (!row) return null;
  const aside = document.createElement('aside');
  aside.className = 'hr-primer';
  aside.setAttribute('role', 'note');
  aside.setAttribute('data-primer', id);
  const b = document.createElement('b');
  b.textContent = row.title;
  const p = document.createElement('p');
  p.textContent = row.body;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'btn btn-sm';
  btn.setAttribute('data-primer-dismiss', '');
  btn.textContent = 'Got it';
  aside.append(b, p, btn);
  return aside;
}

function html(id) {
  const el = build(id);
  return el ? el.outerHTML : '';
}

/* opts.dismissed / opts.panel override the live reads, so the rule is testable
   without touching storage or the DOM. */
function shouldShow(id, opts = {}) {
  if (parked || !SCREEN_PRIMERS[id]) return false;
  const dismissed = ('dismissed' in opts) ? !!opts.dismissed : isDismissed(id);
  if (dismissed) return false;
  if (document.querySelector('.ftue-root .ftue-card.show')) return false;
  const panel = opts.panel || document.getElementById(id);
  return !(panel && panel.querySelector('[data-primer]'));
}

function mount() {
  const panel = document.querySelector('main .panel.active');
  if (!panel || !panel.id || !shouldShow(panel.id, { panel })) return;
  const aside = build(panel.id);
  aside.querySelector('[data-primer-dismiss]').addEventListener('click', () => {
    const S = store();
    if (S) S.set(KEY(panel.id), '1');
    aside.remove();
  });
  panel.prepend(aside);
}

const forEachKey = (fn) => { const S = store(); if (S) Object.keys(SCREEN_PRIMERS).forEach((id) => fn(S, KEY(id))); };

export function setupScreenPrimers() {
  window.HearthriseScreenPrimers = {
    html,
    shouldShow,
    // SCREEN_PRIMERS keys only — a 'hearthrise:' prefix scan would take the
    // FTUE flag, the identity record and the save backups with it.
    reset: () => forEachKey((S, k) => S.remove(k)),
    dismissAll: () => forEachKey((S, k) => S.set(k, '1')),
    // In-memory only; returns the previous state so a caller can restore it.
    _park: (on) => { const was = parked; parked = !!on; return was; },
  };
  if (window.HearthriseShowTab && typeof window.HearthriseShowTab.wrapShowTab === 'function') {
    window.HearthriseShowTab.wrapShowTab('screen-primers', mount);
  }
}
