// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/chat.js — THE CHAT WINDOW AND ITS COMBAT TAB (parity CL-01..CL-06).
//
// The chat window holds tabs; the Combat tab is the combat log: lines from the
// character's server events only (src/hunt-view/combat-log.js), newest at the
// bottom, filterable by line type and by this hero vs the whole party. The
// filters are a display preference (residue `combatLog`, CL-05). Other chat
// tabs land with the chat lane; a tab is a row in TABS.
//
// Built once; lines are keyed rows (an event id is one line), patched in place;
// the list keeps its scroll unless the player was already at the bottom.
// ════════════════════════════════════════════════════════════════════════
import { LOG_TYPES } from '../../data/combat-text.js?v=0.2.0';
import { logFor } from '../../hunt-view/combat-log.js?v=0.2.0';
import { huntOf } from '../../session/hunt-sections.js?v=0.2.0';
import { rows, text, cls, attr, prop, element } from '../../render/paint.js?v=0.2.0';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.0';

const TABS = Object.freeze([['combat', 'Combat']]);

function prefsOf(cs) {
  const p = cs && cs.record && cs.record.residue && cs.record.residue.combatLog;
  return { off: new Set((p && p.off) || []), scope: (p && p.scope) || 'party' };
}

/** The skeleton (built once). */
export function renderChat() {
  return '<div class="hc-chat">'
    + '<div class="hc-tabs" role="tablist">' + TABS.map(([id, label]) => '<button type="button" role="tab" class="ha-tab" aria-selected="true" data-tab="' + id + '">' + esc(label) + '</button>').join('') + '</div>'
    + '<div class="hc-filters">'
    + '<span class="ha-scope" role="group" aria-label="Whose lines">'
    + '<button type="button" class="hh-tool" data-hs-act="scope" data-scope="hero" aria-pressed="false">This hero</button>'
    + '<button type="button" class="hh-tool" data-hs-act="scope" data-scope="party" aria-pressed="true">Party</button></span>'
    + '<span class="hc-types" role="group" aria-label="Line types">'
    + LOG_TYPES.map((t) => '<label class="hc-type"><input type="checkbox" data-hs-act="type" data-type="' + esc(t.id) + '" checked> ' + esc(t.label) + '</label>').join('')
    + '</span></div>'
    + '<ol class="hc-log" aria-live="off"></ol><p class="hh-empty hc-none">No combat yet. Lines appear as your hunt plays.</p></div>';
}

renderChat.patch = function patchChat(body, ctx) {
  const cs = ctx.character;
  const prefs = prefsOf(cs);
  const h = huntOf(cs);
  const me = h ? h.hero.unit : null;
  for (const b of body.querySelectorAll('[data-scope]')) attr(b, 'aria-pressed', String(b.getAttribute('data-scope') === prefs.scope));
  for (const c of body.querySelectorAll('input[data-type]')) prop(c, 'checked', !prefs.off.has(c.getAttribute('data-type')));
  const shown = logFor(cs).lines().filter((l) => !prefs.off.has(l.type) && (prefs.scope === 'party' || l.units.includes(me)));
  const list = body.querySelector('.hc-log');
  const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 4;
  rows(list, shown, {
    key: (l) => l.key,
    build: (l) => element(ctx.doc, '<li class="hc-line is-' + esc(l.type) + '"></li>'),
    patch: (li, l) => text(li, l.text),
  });
  cls(body.querySelector('.hc-none'), 'is-on', !shown.length);
  if (atBottom) list.scrollTop = list.scrollHeight;
};

renderChat.act = function actChat(ctx, body, action, ev, t) {
  const cs = ctx.character;
  const prefs = prefsOf(cs);
  if (action === 'scope' && ev.type === 'click') {
    cs.setResidue('combatLog', { off: Array.from(prefs.off), scope: t.getAttribute('data-scope') });
  } else if (action === 'type' && ev.type === 'change') {
    const id = t.getAttribute('data-type');
    if (t.checked) prefs.off.delete(id); else prefs.off.add(id);
    cs.setResidue('combatLog', { off: Array.from(prefs.off), scope: prefs.scope });
  } else return;
  renderChat.patch(body, ctx);
};
