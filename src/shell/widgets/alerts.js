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
//   Join / No thanks             a party invite's answer, that character's
//                                answerInvite INTENT, the same way (PARTY_SPEC
//                                §1.3: the toast reaches a player anywhere)
// ════════════════════════════════════════════════════════════════════════
import { ALERTS_SHOWN } from '../../data/alerts.js?v=0.2.12';
import { rows, text, cls, prop, element } from '../../render/paint.js?v=0.2.12';
import { glyphSvg } from '../launcher.js?v=0.2.12';
import { refusalWords } from '../intent-words.js?v=0.2.12';

const OPENS = Object.freeze({ bag: 'inventory', shop: 'shop', show: null });

/** The skeleton (built once). */
export function renderAlerts() {
  return '<section class="hw-alerts is-empty" aria-label="Alerts"><ol class="hw-alert-list" aria-live="polite"></ol></section>';
}

function alertRow(ctx) {
  return element(ctx.doc, '<li class="hw-alert"><span class="hw-alert-glyph" aria-hidden="true"></span>'
    + '<p class="hw-alert-text"></p><button type="button" class="hh-tool hw-alert-do" data-hs-act="alert-do"></button>'
    + '<button type="button" class="hh-tool hw-alert-no" data-hs-act="alert-no" hidden></button>'
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
      const no = li.querySelector('.hw-alert-no');
      prop(no, 'hidden', !a.decline);
      text(no, a.decline || '');
      prop(no, 'disabled', a.pending);
    },
  });
};

/*
 * An alert's intent for its character: the line's buttons go off at once (the
 * widget repaints here: the shell paints widgets on a character's change, not
 * on an alert's), and the line goes only once the server said yes.
 */
async function settle(ctx, el, a, send) {
  const cs = ctx.peers().find((p) => p.slot === a.slot);
  if (!cs) return;
  ctx.alerts.mark(a.key, true, '');
  renderAlerts.patch(el, ctx);
  let r;
  try { r = await send(cs); } catch (e) { r = { ok: false, error: 'network' }; }
  if (r.ok) ctx.alerts.dismiss(a.key);
  else ctx.alerts.mark(a.key, false, refusalWords(r.error));
  renderAlerts.patch(el, ctx);
}

renderAlerts.act = async function actAlerts(ctx, el, action, ev, t) {
  if (ev.type !== 'click' || !ctx.alerts) return;
  const key = t.getAttribute('data-alert');
  const a = ctx.alerts.list().find((x) => x.key === key);
  if (!a) return;
  if (action === 'alert-x') { ctx.alerts.dismiss(key); return; }
  if ((action !== 'alert-do' && action !== 'alert-no') || a.pending) return;
  /* A party invite: Join / No thanks, that character's one answer. */
  if (a.action === 'join') { if (a.invite) await settle(ctx, el, a, (cs) => cs.answerInvite(a.invite, action === 'alert-do')); return; }
  if (action !== 'alert-do') return;
  if (a.action !== 'restart') {
    ctx.alerts.dismiss(key);
    if (ctx.goTo) ctx.goTo(a.slot, OPENS[a.action] || null);
    return;
  }
  await settle(ctx, el, a, (cs) => cs.restartHunt(a.session));
};
