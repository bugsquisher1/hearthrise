// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/house-dummy.js — THE HOUSE'S TRAINING DUMMY (a section of the House window, src/shell/windows/house.js).
//
// One dummy for the account (the designer's "2026-11-13 Combat training spec"): it trains a combat skill as fast as the
// yard with no fee, one hero at a time, and each skill is unlocked on its own, the price climbing in the order the player
// picks. The skills, which are unlocked, the price ladder and the next price are the server's (`training.dummy`); the
// window names a skill and the price the player SAW (src/session/training-intents.js unlockDummy), after a confirm.
// ════════════════════════════════════════════════════════════════════════
import { trainingOf } from '../../session/training-sections.js?v=0.2.129';
import { unlockDummy } from '../../session/training-intents.js?v=0.2.129';
import { goldOf } from '../../session/item-sections.js?v=0.2.129';
import { PROPERTY_TIERS } from '../../data/homestead-tiers.js?v=0.2.129';
import { text, cls, attr, prop, rows, element } from '../../render/paint.js?v=0.2.129';
import { whole } from '../../render/format.js?v=0.2.129';
import { t } from '../../render/player-text.js?v=0.2.129';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.129';
import { runIntent } from '../intent-words.js?v=0.2.129';
import { skillWord } from '../training-words.js?v=0.2.129';

const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { ask: null, pending: false, msg: '' }; SCRATCH.set(cs, s); } return s; };
const homeName = (id) => ((PROPERTY_TIERS.find((p) => p.id === id) || {}).name) || id;

/** The section's skeleton, inside the House's. */
export const DUMMY_HTML = '<section class="hd-dummy" hidden><h3 class="hs-sub">' + esc(t('training.dummy_head')) + '</h3>'
  + '<p class="hs-note">' + esc(t('training.dummy_lead')) + '</p>'
  + '<ul class="hd-skills" aria-label="' + esc(t('training.dummy_head')) + '"></ul>'
  + '<p class="hd-next"></p><p class="hw-why hd-why"></p>'
  + '<div class="hd-confirm" hidden><p class="hd-confirm-q"></p><div class="hw-confirm-do">'
  + '<button type="button" class="hw-primary" data-hs-act="dummy-yes"></button>'
  + '<button type="button" class="hh-tool" data-hs-act="dummy-no">' + esc(t('controls.cancel')) + '</button></div></div>'
  + '<p class="hd-msg" role="status" aria-live="polite"></p></section>';

/** Why Unlock is off, or '' when the server is to judge. Pure. */
export function unlockBlock(d, purse) {
  if (!d.hasHome) return t('training.dummy_needs_home', { home: homeName(d.needs || 'homestead') });
  if (d.nextPrice === null) return '';
  if (purse !== null && purse < d.nextPrice) return t('training.dummy_short', { price: whole(d.nextPrice), purse: whole(purse) });
  return '';
}

/** Paint the dummy from the server's section; hidden while the server sends none. */
export function patchDummy(root, ctx) {
  const box = root.querySelector('.hd-dummy');
  if (!box) return;
  const cs = ctx.character;
  const tr = trainingOf(cs), d = tr && tr.dummy;
  prop(box, 'hidden', !d);
  if (!d) return;
  const sc = scratchOf(cs);
  const block = unlockBlock(d, goldOf(cs));
  const canBuy = d.nextPrice !== null && !block;
  rows(box.querySelector('.hd-skills'), tr.skills.map((k) => ({ k, owned: d.owned.includes(k) })), {
    key: (r) => r.k,
    build: () => element(ctx.doc, '<li class="hd-skill"><b></b><small></small><button type="button" class="hh-tool" data-hs-act="dummy-ask"></button></li>'),
    patch: (li, r) => {
      text(li.querySelector('b'), skillWord(r.k));
      text(li.querySelector('small'), r.owned ? t('training.dummy_owned') : t('training.dummy_locked'));
      const btn = li.querySelector('button');
      attr(btn, 'data-skill', r.k);
      text(btn, t('controls.unlock'));
      prop(btn, 'hidden', r.owned);
      prop(btn, 'disabled', sc.pending || !canBuy);
      cls(li, 'is-held', r.owned);
    },
  });
  text(box.querySelector('.hd-next'), d.nextPrice === null ? t('training.dummy_all')
    : t('training.dummy_next', { price: whole(d.nextPrice) }) + (d.busy ? ' ' + t('training.dummy_in_use', { who: d.busy }) : ''));
  text(box.querySelector('.hd-why'), block);
  if (sc.ask && (d.owned.includes(sc.ask.skill) || sc.ask.price !== d.nextPrice)) sc.ask = null;
  const cf = box.querySelector('.hd-confirm');
  prop(cf, 'hidden', !sc.ask);
  if (sc.ask) {
    text(cf.querySelector('.hd-confirm-q'), t('training.dummy_confirm', { skill: skillWord(sc.ask.skill), price: whole(sc.ask.price) }));
    text(cf.querySelector('[data-hs-act="dummy-yes"]'), t('controls.unlock'));
  }
  prop(cf.querySelector('[data-hs-act="dummy-yes"]'), 'disabled', sc.pending);
  text(box.querySelector('.hd-msg'), sc.msg);
}

/** The dummy's presses; true when handled. */
export function actDummy(ctx, action, el, repaint) {
  const cs = ctx.character;
  if (!cs || !String(action).startsWith('dummy-')) return false;
  const sc = scratchOf(cs);
  const tr = trainingOf(cs), d = tr && tr.dummy;
  if (!d) return false;
  if (action === 'dummy-ask') {
    const k = el.getAttribute('data-skill');
    if (tr.skills.includes(k) && !d.owned.includes(k) && d.nextPrice !== null && !unlockBlock(d, goldOf(cs))) { sc.ask = { skill: k, price: d.nextPrice }; sc.msg = ''; }
    repaint();
    return true;
  }
  if (action === 'dummy-no') { sc.ask = null; repaint(); return true; }
  if (action === 'dummy-yes' && sc.ask && ctx.account) {
    const ask = sc.ask;
    sc.ask = null;
    runIntent(sc, repaint, () => unlockDummy(ctx.account, cs, ask.skill, ask.price), t('training.dummy_buying'),
      () => t('training.dummy_bought', { skill: skillWord(ask.skill) }), cs);
    return true;
  }
  return false;
}
