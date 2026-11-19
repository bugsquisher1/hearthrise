// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/training.js — THE TRAINING YARD: PICK A COMBAT SKILL, SEE WHAT AN HOUR COSTS, START OR STOP.
//
// The designer's board section "2026-11-13 Combat training spec"; the server half is lane/c-combat-training. A hero in
// town trains one combat skill at the yard (a fee each hour) or on the account's house dummy (no fee, once that skill
// is unlocked in the House). The yard's dummies in Havora open it, only while the server sends the `training` section
// (src/data/shell-windows.js `section`); a section that goes away closes it.
//
// Every number is the server's (CLAUDE.md §1, §6): the fee, the XP an hour and the hours to the next level are the
// section's quotes, read, never worked out. The window names a skill, a place and the fee the player SAW, and the
// server re-quotes it. The one thing drawn between answers is the running clock (since, against the server's clock).
// Start is off, and says why above it, for what the screen already knows; the server still judges, and every refusal
// reads in plain words (src/shell/training-words.js, src/data/refusal-words.js).
//
// THE RATE AND THE TRAINING ITEMS (2027-04-23-training-gear.sql, Tyler 2026-11-14: one rate for every skill and Level, the item at
// 200%; labels, the server's numbers): the quote's XP/h is the server's rate for this hero now; the item box shows the hours left on
// the skill's open item, the "Use" switch, the sealed ones held (Open) and the Arms Master's rows (Buy at the price SEEN). Every
// number is the section's; the window never works one out.
// ════════════════════════════════════════════════════════════════════════
import { trainingOf, quoteFor, runForMs, gearFor, offersFor } from '../../session/training-sections.js?v=0.2.141';
import { startTraining, stopTraining, buyGear, openGear, useGear } from '../../session/training-intents.js?v=0.2.141';
import { itemName } from '../widgets/bits.js?v=0.2.141';
import { goldOf, nameOf, skillsOf } from '../../session/item-sections.js?v=0.2.141';
import { huntOf, partyOf } from '../../session/hunt-sections.js?v=0.2.141';
import { text, cls, attr, prop, rows } from '../../render/paint.js?v=0.2.141';
import { whole, gold } from '../../render/format.js?v=0.2.141';
import { t } from '../../render/player-text.js?v=0.2.141';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.141';
import { runIntent } from '../intent-words.js?v=0.2.141';
import { skillWord, timeWords, endedWords } from '../training-words.js?v=0.2.141';
import { TRAINING_GEAR } from '../../data/training.js?v=0.2.141';
import { leavingLine } from '../widgets/hunt-topbar.js?v=0.2.141';
import { connection } from '../../net/connection.js?v=0.2.141';

/* The ground a training session runs on (src/data/hunts.js, the server half): its hunt is the run, not "out hunting". */
const YARD_GROUND = 'training_yard';
const CLOCK_MS = 30000;
/* While a Stop pends the line counts the seconds to the server's close, so the window repaints every second. */
const STOPPING_MS = 1000;
/* The window -> when its pending Stop was first drawn (display only): the hunt bar's own wait timing (widgets/hunt-topbar.js). */
const STOP_SINCE = new WeakMap();
const SCRATCH = new WeakMap();
const scratchOf = (cs) => {
  let s = SCRATCH.get(cs);
  if (!s) { s = { skill: null, where: 'yard', pending: false, msg: '', clock: null, ask: null }; SCRATCH.set(cs, s); }
  return s;
};

/** The skill on the picker: the one picked here, else the first the server trains. Pure. */
export function skillPicked(sc, tr) {
  return sc.skill && tr.skills.includes(sc.skill) ? sc.skill : tr.skills[0] || null;
}

/** Where it trains: the house only while the dummy holds the picked skill. Pure. */
export function wherePicked(sc, tr, skill) {
  const owned = !!(tr.dummy && tr.dummy.owned.includes(skill));
  return sc.where === 'house' && owned ? 'house' : 'yard';
}

/**
 * Why Start is off now, said above it, or '' when the server is to judge. Only what the screen already knows from the
 * server's own record: out hunting, in a party, no quote, a purse under the first hour, a dummy in use.
 */
export function startBlock(cs, tr, skill, where) {
  const h = huntOf(cs);
  if (h && !h.ended && h.huntId !== YARD_GROUND) return t('training.hunting');
  /* THE LEVEL GATE (the server's rate row: the Level it opens at and this hero's) */
  const r = tr.rate;
  if (r && r.level !== null && r.minLevel !== null && r.level < r.minLevel) return t('training.low_level', { need: r.minLevel });
  if (partyOf(cs)) return t('training.in_party');
  const q = quoteFor(tr, skill);
  if (!skill || !q) return t('training.closed');
  if (where === 'house') {
    if (tr.dummy && tr.dummy.busy) return t('training.dummy_busy', { who: tr.dummy.busy });
    return '';
  }
  const purse = goldOf(cs);
  if (purse !== null && purse < q.feeH) return t('training.short_gold', { fee: whole(q.feeH), purse: whole(purse) });
  return '';
}

const serverNow = (cs) => { const v = typeof cs.serverNow === 'function' ? cs.serverNow() : null; return Number.isFinite(v) ? v : Date.now(); };

/** The skeleton (built once per opening). */
export function renderTraining(ctx) {
  if (ctx && ctx.character) { const sc = scratchOf(ctx.character); sc.skill = null; sc.where = 'yard'; sc.msg = ''; sc.ask = null; }
  return '<div class="tw-train">'
    + '<p class="hs-note tw-lead">' + esc(t('training.lead')) + '</p>'
    + '<p class="hw-cap tw-purse"></p>'
    + '<section class="tw-run" hidden><p class="tw-now"></p><p class="tw-line tw-run-where"></p><p class="tw-line tw-run-clock"></p><p class="tw-line tw-run-paid"></p></section>'
    + '<p class="tw-line tw-ended" hidden></p>'
    + '<div class="tw-form">'
    + '<h3 class="hs-sub">' + esc(t('training.skill_head')) + '</h3>'
    + '<div class="tw-skills" role="radiogroup" aria-label="' + esc(t('training.skill_head')) + '"></div>'
    + '<dl class="tw-quote"><dt class="tw-fee"></dt><dd class="tw-xp"></dd><dd class="tw-to-level"></dd></dl>'
    + '<div class="tw-where-box" hidden><h3 class="hs-sub">' + esc(t('training.where_head')) + '</h3>'
    + '<div class="tw-where" role="radiogroup" aria-label="' + esc(t('training.where_head')) + '">'
    + '<button type="button" class="tw-place" role="radio" data-hs-act="where" data-where="yard">' + esc(t('training.where_yard')) + '</button>'
    + '<button type="button" class="tw-place" role="radio" data-hs-act="where" data-where="house">' + esc(t('training.where_house')) + '</button>'
    + '</div></div>'
    + '<p class="hs-note tw-terms"></p><p class="hs-note tw-max"></p>'
    + '</div>'
    + '<section class="tw-gear" hidden><h3 class="hs-sub">' + esc(t('training.gear_head')) + '</h3>'
    + '<p class="tw-line tw-gear-left"></p>'
    + '<label class="tw-gear-use" hidden><input type="checkbox" class="tw-gear-on" data-hs-act="gear-use"><span class="tw-gear-use-text"></span></label>'
    + '<div class="tw-gear-held"></div><div class="tw-gear-shop"></div>'
    + '<div class="tw-gear-confirm" hidden><p class="tw-gear-confirm-q"></p><div class="hw-confirm-do">'
    + '<button type="button" class="hw-primary" data-hs-act="gear-yes">' + esc(t('controls.buy')) + '</button>'
    + '<button type="button" class="hh-tool" data-hs-act="gear-no">' + esc(t('controls.cancel')) + '</button></div></div>'
    + '<p class="hs-note tw-gear-note"></p><p class="hs-note tw-gear-day"></p></section>'
    + '<div class="tw-foot"><p class="hw-why tw-off-why"></p><p class="hw-why tw-stop-why" role="status" hidden></p>'
    + '<button type="button" class="hh-tool is-primary tw-go" data-hs-act="train-start">' + esc(t('training.press_start')) + '</button>'
    + '<button type="button" class="hh-tool tw-stop" data-hs-act="train-stop" hidden>' + esc(t('controls.stop')) + '</button>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div></div>';
}

/* The skills as radio buttons: the name and the server's level, the picked one gold. */
function patchSkills(host, cs, tr, picked) {
  const levels = skillsOf(cs) || {};
  rows(host, tr.skills.map((k) => ({ k, level: levels[k] ? levels[k].level : null })), {
    key: (r) => r.k,
    build: () => { const b = host.ownerDocument.createElement('button'); b.type = 'button'; b.className = 'tw-skill'; b.setAttribute('role', 'radio');
      b.setAttribute('data-hs-act', 'skill'); b.innerHTML = '<span class="tw-skill-name"></span><b class="tw-skill-level"></b>'; return b; },
    patch: (b, r) => {
      attr(b, 'data-skill', r.k);
      attr(b, 'aria-checked', String(r.k === picked));
      text(b.querySelector('.tw-skill-name'), skillWord(r.k));
      text(b.querySelector('.tw-skill-level'), r.level === null ? '' : String(r.level));
    },
  });
}

/* The name of a skill's training item, without a size ("Training Sword"): the hours left and the switch are the skill's bank, never one item's. */
const gearName = (skill) => TRAINING_GEAR.names[skill] || skillWord(skill);

/* One row of the item box: a name, a figure, a press. */
function gearRow(doc, act, label) {
  const row = doc.createElement('div');
  row.className = 'tw-gear-row';
  row.innerHTML = '<span class="tw-gear-name"></span><span class="tw-gear-fig"></span><button type="button" class="hh-tool tw-gear-press" data-hs-act="' + act + '">' + esc(label) + '</button>';
  return row;
}

/* THE ITEM BOX for `skill` (the run's, else the picked one): the hours left, the switch, the sealed ones held, the Arms Master's rows. */
function patchGear(root, tr, skill, sc) {
  const box = root.querySelector('.tw-gear');
  prop(box, 'hidden', !tr.rate || !skill);
  if (!tr.rate || !skill) return;
  const doc = root.ownerDocument;
  const g = gearFor(tr, skill);
  const shopOn = !!(tr.shop && tr.shop.on);
  const name = gearName(skill);
  text(root.querySelector('.tw-gear-left'), g && g.bankedMs > 0
    ? t(g.on ? 'training.gear_left_on' : 'training.gear_left', { item: name, time: timeWords(g.bankedMs) }) : '');
  /* While the items are closed (the server's switch) nothing here presses: the note says so. Otherwise every press is on, and the
     server judges it (a purse short of the price, hours still left, the day's buys): its refusal speaks with its own numbers. */
  const use = root.querySelector('.tw-gear-use');
  prop(use, 'hidden', !(shopOn && g && (g.bankedMs > 0 || g.bag.length)));
  const box2 = root.querySelector('.tw-gear-on');
  prop(box2, 'checked', !!(g && g.on));
  prop(box2, 'disabled', sc.pending);
  attr(box2, 'data-skill', skill);
  text(root.querySelector('.tw-gear-use-text'), t('training.gear_use', { item: name }));
  /* the sealed ones: the bag's, then Storage's; Open is off while an item of this skill still has hours */
  const held = g && shopOn ? g.bag.map((h) => ({ ...h, where: 'bag' })).concat(g.stored.map((h) => ({ ...h, where: 'storage' }))) : [];
  rows(root.querySelector('.tw-gear-held'), held, {
    key: (h) => h.where + ':' + h.item,
    build: () => gearRow(doc, 'gear-open', t('training.press_open')),
    patch: (row, h) => {
      text(row.querySelector('.tw-gear-name'), h.bound ? t('training.gear_bound', { item: itemName(h.item) }) : itemName(h.item));
      text(row.querySelector('.tw-gear-fig'), t(h.where === 'bag' ? 'training.gear_in_bag' : 'training.gear_in_storage', { count: h.qty }));
      const b = row.querySelector('.tw-gear-press');
      attr(b, 'data-item', h.item);
      prop(b, 'disabled', sc.pending);
    },
  });
  /* the Arms Master's rows, at the server's price */
  rows(root.querySelector('.tw-gear-shop'), shopOn ? offersFor(tr, skill) : [], {
    key: (o) => o.item,
    build: () => gearRow(doc, 'gear-buy', t('training.press_buy')),
    patch: (row, o) => {
      text(row.querySelector('.tw-gear-name'), itemName(o.item));
      text(row.querySelector('.tw-gear-fig'), t('training.gear_price', { gold: whole(o.price) }));
      const b = row.querySelector('.tw-gear-press');
      attr(b, 'data-item', o.item);
      prop(b, 'disabled', sc.pending);
    },
  });
  /* THE CONFIRM (the House dummy's pattern): Buy only asks; Buy in the confirm sends the one purchase at the price shown. An ask whose
     row the server no longer offers at that price (or a closed shop) is dropped. */
  const ask = sc.ask && shopOn ? offersFor(tr, skill).find((o) => o.item === sc.ask.item && o.price === sc.ask.price) : null;
  if (!ask) sc.ask = null;
  const cf = root.querySelector('.tw-gear-confirm');
  prop(cf, 'hidden', !ask);
  text(cf.querySelector('.tw-gear-confirm-q'), ask ? t('training.gear_confirm', { item: itemName(ask.item), price: whole(ask.price) }) : '');
  prop(cf.querySelector('[data-hs-act="gear-yes"]'), 'disabled', sc.pending);
  text(root.querySelector('.tw-gear-note'), !shopOn ? t('training.gear_closed') : t('training.gear_card', { skill: skillWord(skill) }));
  const day = shopOn && tr.shop.max !== null ? t('training.gear_today', { today: tr.shop.today, max: tr.shop.max }) : '';
  prop(root.querySelector('.tw-gear-day'), 'hidden', !day);
  text(root.querySelector('.tw-gear-day'), day);
}

/* A minute clock while the window shows a run: the patch asks itself again; a closed window drops it. */
function armClock(ctx, root, sc, on, ms = CLOCK_MS) {
  if (sc.clock) { clearTimeout(sc.clock); sc.clock = null; }
  if (!on) return;
  sc.clock = setTimeout(() => { sc.clock = null; if (root.isConnected) ctx.refresh('training'); }, ms);
}

renderTraining.patch = function patchTraining(body, ctx) {
  const cs = ctx.character;
  const root = body.querySelector('.tw-train');
  if (!cs || !root) return;
  const tr = trainingOf(cs);
  if (!tr) { if (ctx.wm && typeof ctx.wm.close === 'function') ctx.wm.close('training'); return; }
  const sc = scratchOf(cs);
  const purse = goldOf(cs);
  text(root.querySelector('.tw-purse'), purse === null ? '' : t('training.purse', { gold: gold(purse) }));

  /* THE RUN: the server's session; the clock runs on the server's clock between answers */
  const run = tr.run;
  prop(root.querySelector('.tw-run'), 'hidden', !run);
  if (run) {
    text(root.querySelector('.tw-now'), t('training.run_now', { skill: skillWord(run.skill) }));
    text(root.querySelector('.tw-run-where'), run.where === 'house' ? t('training.run_where_house') : t('training.run_where_yard', { gold: whole(run.feeH) }));
    text(root.querySelector('.tw-run-clock'), t('training.run_clock', { time: timeWords(runForMs(run, serverNow(cs))) }));
    text(root.querySelector('.tw-run-paid'), run.where === 'yard' ? t('training.run_paid', { gold: whole(run.paid) }) : '');
  }
  armClock(ctx, root, sc, !!run);
  const ended = run ? '' : endedWords(tr.lastStop);
  prop(root.querySelector('.tw-ended'), 'hidden', !ended);
  text(root.querySelector('.tw-ended'), ended);

  /* THE CHOICES */
  prop(root.querySelector('.tw-form'), 'hidden', !!run);
  const skill = skillPicked(sc, tr), where = wherePicked(sc, tr, skill);
  patchSkills(root.querySelector('.tw-skills'), cs, tr, skill);
  const q = quoteFor(tr, skill);
  text(root.querySelector('.tw-fee'), !q ? '' : where === 'house' ? t('training.fee_house') : t('training.fee', { gold: whole(q.feeH) }));
  /* the server's rate for this hero now: the item's (200%) while that skill's item time runs and its switch is on */
  const boosted = !!(q && tr.rate && q.xpH === tr.rate.xpHItem && tr.rate.xpHItem !== tr.rate.xpH);
  text(root.querySelector('.tw-xp'), q && q.xpH !== null ? t(boosted ? 'training.xp_item' : 'training.xp', { xp: whole(q.xpH), skill: skillWord(skill) }) : '');
  text(root.querySelector('.tw-to-level'), q && q.hoursToNext !== null && q.level !== null
    ? t('training.to_level', { hours: t('training.time_hours', { count: Math.max(1, q.hoursToNext) }), skill: skillWord(skill), level: q.level + 1 }) : '');
  const owned = !!(tr.dummy && tr.dummy.owned.includes(skill));
  prop(root.querySelector('.tw-where-box'), 'hidden', !owned);
  for (const b of root.querySelectorAll('.tw-place')) attr(b, 'aria-checked', String(b.getAttribute('data-where') === where));
  /* two labels, a line each: the yard's fee is paid as each hour starts; the longest one session runs */
  const terms = where === 'house' ? '' : t('training.paid_ahead'), most = tr.maxHours ? t('training.max_hours', { hours: tr.maxHours }) : '';
  prop(root.querySelector('.tw-terms'), 'hidden', !terms);
  text(root.querySelector('.tw-terms'), terms);
  prop(root.querySelector('.tw-max'), 'hidden', !most);
  text(root.querySelector('.tw-max'), most);
  for (const b of root.querySelectorAll('.tw-skill, .tw-place')) prop(b, 'disabled', sc.pending);
  patchGear(root, tr, run ? run.skill : skill, sc);

  /* THE PRESS: Start while nothing runs (off, with why), Stop while one does */
  const block = run ? '' : startBlock(cs, tr, skill, where);
  const go = root.querySelector('.tw-go'), stop = root.querySelector('.tw-stop');
  prop(go, 'hidden', !!run);
  prop(stop, 'hidden', !run);
  prop(go, 'disabled', sc.pending || !!block);
  /* A STOP PENDING (post-140 audit C10: the window stood unchanged for 16 s after Stop): Stop off, and the words the hunt bar says
     (widgets/hunt-topbar.js leavingLine), counted to the SERVER's close (CharacterSession.leaveCountdown: a training leave closes at
     the press, 2027-05-20-yard-stop.sql), until the server's run is over. */
  const cd = run && typeof cs.leaveCountdown === 'function' ? cs.leaveCountdown() : null;
  const at = typeof ctx.now === 'function' ? ctx.now() : Date.now();
  if (cd === null) STOP_SINCE.delete(root);
  else if (!STOP_SINCE.has(root) || cd.phase === 'counting') STOP_SINCE.set(root, at);
  const stopping = cd !== null ? leavingLine(cd, at - STOP_SINCE.get(root), connection.state()) : '';
  if (stopping) armClock(ctx, root, sc, true, STOPPING_MS);
  prop(stop, 'disabled', sc.pending || !!stopping);
  attr(stop, 'data-off-why', stopping || null);
  text(root.querySelector('.tw-stop-why'), stopping);
  prop(root.querySelector('.tw-stop-why'), 'hidden', !stopping);
  attr(go, 'data-off-why', block || null);
  text(root.querySelector('.tw-off-why'), block);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
};

renderTraining.act = function actTraining(ctx, body, action, ev, el) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  if (!cs) return false;
  const sc = scratchOf(cs);
  const repaint = () => ctx.refresh('training');
  const tr = trainingOf(cs);
  if (!tr) return false;
  if (action === 'skill') { const k = el.getAttribute('data-skill'); if (tr.skills.includes(k)) { sc.skill = k; sc.msg = ''; repaint(); } return true; }
  if (action === 'where') { sc.where = el.getAttribute('data-where') === 'house' ? 'house' : 'yard'; sc.msg = ''; repaint(); return true; }
  if (sc.pending || !ctx.account) return false;
  if (action === 'train-start') {
    const skill = skillPicked(sc, tr), where = wherePicked(sc, tr, skill), q = quoteFor(tr, skill);
    if (startBlock(cs, tr, skill, where) || !q) { repaint(); return true; }
    runIntent(sc, repaint, () => startTraining(ctx.account, cs, { skill, where, feeSeen: where === 'house' ? 0 : q.feeH }), t('training.busy_start'),
      () => t('training.started'), cs);
    return true;
  }
  if (action === 'train-stop') {
    runIntent(sc, repaint, () => stopTraining(cs), t('training.busy_stop'), () => '', cs);
    return true;
  }
  /* THE TRAINING ITEMS: the server's row (an offer's price as SEEN, a held item's id), never a number of the window's own */
  if (action === 'gear-buy') {
    const item = el.getAttribute('data-item'), o = tr.offers.find((x) => x.item === item);
    sc.ask = o ? { item: o.item, price: o.price } : null;
    sc.msg = '';
    repaint();
    return true;
  }
  if (action === 'gear-no') { sc.ask = null; repaint(); return true; }
  if (action === 'gear-yes') {
    const ask = sc.ask, o = ask && tr.offers.find((x) => x.item === ask.item && x.price === ask.price);
    sc.ask = null;
    if (!o) { repaint(); return true; }
    runIntent(sc, repaint, () => buyGear(ctx.account, cs, o.item, o.price), t('training.busy_buy'), () => t('training.bought', { item: itemName(o.item) }), cs);
    return true;
  }
  if (action === 'gear-open') {
    const item = el.getAttribute('data-item');
    const g = tr.gear.find((x) => x.bag.concat(x.stored).some((h) => h.item === item));
    if (!g) { repaint(); return true; }
    runIntent(sc, repaint, () => openGear(ctx.account, cs, item), t('training.busy_open'), () => t('training.opened', { item: itemName(item) }), cs);
    return true;
  }
  if (action === 'gear-use') {
    const skill = el.getAttribute('data-skill'), g = gearFor(tr, skill);
    if (!skill) return true;
    runIntent(sc, repaint, () => useGear(ctx.account, cs, skill, !(g && g.on)), '', () => '', cs);
    return true;
  }
  return false;
};
