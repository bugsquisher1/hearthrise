// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/bar-editor.js — THE BAR AS A PRIORITY LIST (inside Hunt settings).
//
// Slot 1 is tried first and the next slot whose conditions pass is the
// fallback. Each row says what its slot does ("IF … THEN …", the store behind
// it), moves it earlier or later, and opens it in the Configure action window
// (configure-action.js). The list shows what the SERVER holds
// (hunt_settings.slots); a move sends ONE intent, the whole bar restated, and
// every control stays off until the server has answered (bar-draft.js, shared
// with the Configure action window).
// ════════════════════════════════════════════════════════════════════════
import { settingsOf, wireSlot } from '../../session/hunt-sections.js?v=0.2.1';
import { rows, text, cls, prop, element } from '../../render/paint.js?v=0.2.1';
import { SLOTS, draftOf, openSlot, slotWords, moveSlot } from '../bar-draft.js?v=0.2.1';

/** The skeleton (built once, inside the hunt settings window). */
export function barEditorHtml() {
  return '<section class="hx-bar" aria-label="Bar">'
    + '<h3 class="hs-sub">Bar</h3><p class="hs-note">Slot 1 is tried first; when its conditions fail, the next slot that passes fires. Press Configure to change a slot.</p>'
    + '<ol class="hx-slots"></ol><p class="hh-intent-msg" role="status" aria-live="polite"></p></section>';
}

function rowHtml(i) {
  return '<li class="hx-row"><span class="hx-n">' + (i + 1) + '</span><span class="hx-sum"></span>'
    + '<button type="button" class="hh-seg" data-hs-act="bar" data-x="up" data-slot="' + i + '" aria-label="Move earlier">↑</button>'
    + '<button type="button" class="hh-seg" data-hs-act="bar" data-x="down" data-slot="' + i + '" aria-label="Move later">↓</button>'
    + '<button type="button" class="hh-seg" data-hs-act="bar" data-x="edit" data-slot="' + i + '">Configure</button></li>';
}

/** Patch the list under `root` (the hunt settings window's body). */
export function patchBarEditor(root, ctx) {
  const cs = ctx.character;
  const set = settingsOf(cs);
  const s = draftOf(cs);
  const ed = root.querySelector('.hx-bar');
  const slots = set ? Array.from({ length: SLOTS }, (_, i) => set.slots[i] || { empty: true }) : [];
  /* Empty slots fold away but the first, so the list reads as the priority order it is. */
  const firstEmpty = slots.findIndex((sl) => sl.empty);
  rows(ed.querySelector('.hx-slots'), slots.map((sl, i) => ({ sl, i })), {
    key: (r) => r.i,
    build: (r) => element(ctx.doc, rowHtml(r.i)),
    patch: (li, r) => {
      text(li.querySelector('.hx-sum'), slotWords(r.sl.empty ? null : wireSlot(r.sl)));
      cls(li, 'is-empty', r.sl.empty);
      cls(li, 'is-folded', r.sl.empty && r.i !== firstEmpty && s.open !== r.i);
      cls(li, 'is-open', s.open === r.i);
      cls(li, 'is-error', !!s.error && s.error.slot === r.i);
      for (const b of li.querySelectorAll('button')) prop(b, 'disabled', s.pending);
    },
  });
  text(ed.querySelector('.hh-intent-msg'), s.open === null ? s.msg : '');
  cls(ed, 'is-pending', s.pending);
}

/** A control of the list ('bar' buttons, data-x). */
export function actBarEditor(ctx, root, action, ev, t, repaint) {
  if (action !== 'bar' || ev.type !== 'click') return;
  const cs = ctx.character;
  if (!settingsOf(cs) || draftOf(cs).pending) return;
  const x = t.getAttribute('data-x');
  const i = Number(t.getAttribute('data-slot'));
  const both = () => { repaint(); ctx.refresh('configure-action'); };
  if (x === 'edit') { openSlot(cs, i); ctx.show('configure-action'); both(); }
  else if (x === 'up' || x === 'down') moveSlot(cs, i, x === 'up' ? -1 : 1, both);
}
