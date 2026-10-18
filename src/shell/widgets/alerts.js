// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/alerts.js — THE ALERT LINES (QoL 7).
//
// The newest ALERTS_SHOWN alerts of the account's alert centre (src/shell/
// alerts.js), whichever character they are about: one line saying what
// happened, ONE button for the next action, and a close. Built once; each
// alert is a keyed row, patched in place.
//   Open the bag / Buy supplies  show that character and open the window
//   See the hunt                 show that character
//   Start again                  that character's restart INTENT; the button
//                                is off until the server answered, and the
//                                alert goes once it has
// ════════════════════════════════════════════════════════════════════════
import { ALERTS_SHOWN } from '../../data/alerts.js?v=0.2.0';
import { rows, text, cls, prop, element } from '../../render/paint.js?v=0.2.0';
import { glyphSvg } from '../launcher.js?v=0.2.0';
import { refusalWords } from '../intent-words.js?v=0.2.0';

const OPENS = Object.freeze({ bag: 'inventory', shop: 'shop', show: null });

/** The skeleton (built once). */
export function renderAlerts() {
  return '<section class="hw-alerts is-empty" aria-label="Alerts"><ol class="hw-alert-list" aria-live="polite"></ol></section>';
}

function alertRow(ctx) {
  return element(ctx.doc, '<li class="hw-alert"><span class="hw-alert-glyph" aria-hidden="true"></span>'
    + '<p class="hw-alert-text"></p><button type="button" class="hh-tool hw-alert-do" data-hs-act="alert-do"></button>'
    + '<button type="button" class="hs-close hw-alert-x" data-hs-act="alert-x" aria-label="Dismiss">' + glyphSvg(ctx.glyphs, 'uiClose') + '</button></li>');
}

renderAlerts.patch = function patchAlerts(el, ctx) {
  const list = ctx.alerts ? ctx.alerts.list().slice(0, ALERTS_SHOWN) : [];
  cls(el.querySelector('.hw-alerts'), 'is-empty', !list.length);
  rows(el.querySelector('.hw-alert-list'), list, {
    key: (a) => a.key,
    build: (a) => {
      const li = alertRow(ctx);
      li.querySelector('.hw-alert-glyph').innerHTML = glyphSvg(ctx.glyphs, a.glyph);
      li.setAttribute('data-kind', a.kind);
      for (const b of li.querySelectorAll('button')) b.setAttribute('data-alert', a.key);
      return li;
    },
    patch: (li, a) => {
      text(li.querySelector('.hw-alert-text'), a.msg ? a.text + ' ' + a.msg : a.text);
      const go = li.querySelector('.hw-alert-do');
      text(go, a.pending ? 'Sending…' : a.button);
      prop(go, 'disabled', a.pending || (a.action === 'restart' && !a.session));
    },
  });
};

renderAlerts.act = async function actAlerts(ctx, el, action, ev, t) {
  if (ev.type !== 'click' || !ctx.alerts) return;
  const key = t.getAttribute('data-alert');
  const a = ctx.alerts.list().find((x) => x.key === key);
  if (!a) return;
  if (action === 'alert-x') { ctx.alerts.dismiss(key); return; }
  if (action !== 'alert-do' || a.pending) return;
  if (a.action !== 'restart') {
    ctx.alerts.dismiss(key);
    if (ctx.goTo) ctx.goTo(a.slot, OPENS[a.action] || null);
    return;
  }
  const cs = ctx.peers().find((p) => p.slot === a.slot);
  if (!cs) return;
  ctx.alerts.mark(key, true, '');
  let r;
  try { r = await cs.restartHunt(a.session); } catch (e) { r = { ok: false, error: 'network' }; }
  if (r.ok) ctx.alerts.dismiss(key);
  else ctx.alerts.mark(key, false, refusalWords(r.error));
};
