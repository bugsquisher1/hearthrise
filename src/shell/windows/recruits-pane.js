// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/recruits-pane.js — THE RECRUIT PRESS, IN ALL CHARACTERS (Tyler RD-Q6 a, 2026-11-22; 1053-recruits.sql).
//
// A new account plays one hero. The server's `recruits` section (recruit-sections.js recruitsOf) says what ONE press will make: the
// heroes, the Level they arrive at and the job each wears, in the slots they take. Before the first hero reaches the press's Level the
// block says when they come and the press is off with that line above it. Once ready, each recruit is a row: its job (the weapon pick's
// own words, src/data/how-to-play.js STARTER_PICKS) and a name field the player may leave empty (the server names that recruit). ONE press
// sends ONE intent (recruit-intents.js recruitCompany) and stays off until the server answers; its key is kept until an answer comes, so
// a press whose answer was lost is sent again with it and the server answers its first receipt. The block goes when the section does.
//
//   recruitsHtml()                     the block (built once, in the window's skeleton)
//   patchRecruits(root, ctx)           the block as the server's section reads now
//   actRecruits(ctx, body, action, repaint)  the press; true when the action was this pane's
// ════════════════════════════════════════════════════════════════════════
import { rows, text, prop, element } from '../../render/paint.js';
import { t } from '../../render/player-text.js';
import { listWords } from '../../render/format.js';
import { escapeHtml as esc } from '../../utils/dom.js';
import { runIntent } from '../intent-words.js';
import { nameOf } from '../../session/item-sections.js';
import { recruitsOf } from '../../session/recruit-sections.js';
import { recruitCompany } from '../../session/recruit-intents.js';
import { STARTER_PICKS } from '../../data/how-to-play.js';

/* The press's scratch, per viewed hero: a press out, its answer in words, the key kept until the server answers. */
const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { pending: false, msg: '', key: null }; SCRATCH.set(cs, s); } return s; };
const PICK = new Map(STARTER_PICKS.map((p) => [p.set, p]));

/** The offer and the hero holding it: the hero on screen's section, else another open hero's (one account: the same offer). */
function offerOf(ctx) {
  for (const cs of [ctx.character, ...(ctx.peers ? ctx.peers() : [])]) {
    const o = recruitsOf(cs);
    if (o) return { cs, o };
  }
  return null;
}

/** The block (built once). */
export function recruitsHtml() {
  return '<section class="hw-recruits" hidden><h3 class="hw-ledger-head is-on">' + esc(t('heroes.recruits_head')) + '</h3>'
    + '<p class="hs-note hw-recruits-lead"></p><ol class="hw-recruits-list"></ol>'
    + '<div class="hw-recruits-do"><button type="button" class="hh-tool is-primary" data-hs-act="recruit-go"></button></div>'
    + '<p class="hh-intent-msg hw-recruits-msg" role="status" aria-live="polite"></p></section>';
}

/** The block as the server's section reads now. Hidden with no offer, except while the press's answer is still said. */
export function patchRecruits(root, ctx) {
  const el = root.querySelector('.hw-recruits');
  if (!el) return;
  const x = offerOf(ctx);
  const sc = scratchOf(ctx.character);
  prop(el, 'hidden', !x && !sc.msg);
  text(el.querySelector('.hw-recruits-msg'), sc.msg);
  prop(el.querySelector('.hw-recruits-do'), 'hidden', !x);
  const o = x ? x.o : null;
  const first = o ? [ctx.character, ...(ctx.peers ? ctx.peers() : [])].find((cs) => cs && cs.slot === o.first) : null;
  const name = (first && nameOf(first)) || t('away.your_hero');
  const count = o ? o.slots.length : 0;
  /* the line above the press says why it is off until the first hero reaches the Level (say-why) */
  text(el.querySelector('.hw-recruits-lead'), !o ? '' : o.ready ? t('heroes.recruits_lead', { count, name, level: o.level }) : t('heroes.recruits_wait', { count, name, at: o.at }));
  rows(el.querySelector('.hw-recruits-list'), o ? o.slots.map((slot, i) => ({ slot, set: o.sets[i] })) : [], {
    key: (r) => String(r.slot),
    build: () => element(ctx.doc, '<li class="hw-recruit"><span class="hw-recruit-job"><b></b> <small></small></span>'
      + '<input type="text" class="hh-num hw-recruit-name" maxlength="20" autocomplete="off" spellcheck="false" placeholder="' + esc(t('heroes.recruits_name')) + '"></li>'),
    patch: (li, r) => {
      const p = PICK.get(r.set);
      text(li.querySelector('b'), p ? p.name : r.set);
      text(li.querySelector('small'), p ? p.does : '');
      const input = li.querySelector('.hw-recruit-name');
      input.setAttribute('aria-label', t('heroes.recruits_name') + (p ? ', ' + p.name : ''));
      prop(input, 'disabled', sc.pending || !o.ready);
    },
  });
  const go = el.querySelector('[data-hs-act="recruit-go"]');
  text(go, sc.pending ? t('heroes.recruiting') : t('heroes.recruits_go', { count }));
  prop(go, 'disabled', sc.pending || !o || !o.ready);
}

/** The press: ONE intent with the typed names (empty: the server names that recruit) and the kept key. */
export function actRecruits(ctx, body, action, repaint) {
  if (action !== 'recruit-go') return false;
  const x = offerOf(ctx);
  const sc = scratchOf(ctx.character);
  if (!x || !x.o.ready || sc.pending) return true;
  const fields = Array.from(body.querySelectorAll('.hw-recruits .hw-recruit-name'));
  if (!sc.key) sc.key = globalThis.crypto.randomUUID();
  let ans = null;
  const send = async () => (ans = await recruitCompany(ctx.account, x.cs, fields.map((f) => f.value), sc.key));
  runIntent(sc, repaint, send, t('heroes.recruiting'),
    () => t('heroes.recruits_done', { names: listWords((ans && ans.ok ? ans.heroes : []).map((h) => h.name).filter(Boolean), 4) }), x.cs).then(() => {
    /* a lost answer keeps the key (the retry replays it); an answer, yes or no, ends it */
    if (ans && (ans.ok || ans.answered)) sc.key = null;
    if (ans && !ans.ok && Number.isInteger(ans.index) && fields[ans.index]) fields[ans.index].focus();
  });
  return true;
}
