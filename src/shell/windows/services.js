// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/services.js — SERVICES: STAMINA, BLESSINGS, A NAME (lane S2).
//
// Three services the town sells, every number the SERVER's:
//   Stamina    the next refill as the server prices it (`stamina_refill`): how
//              long it restores, its gold, and which purchase of today it is.
//              Buy opens a confirmation with that price; one press sends ONE
//              hr_stamina_refill carrying the quoted price, which the server
//              refuses if its own price has changed. Never automatic.
//   Blessings  the three tiers (`blessings`): owned or not, each tier's price
//              at this character's level ("free until 30"), and that a death
//              uses them up. Only the next missing tier can be bought: ONE
//              hr_blessing_buy (tier, quoted price).
//   Name       this character's own name: ONE hr_character_name_set.
// Every control is off while an intent is in flight; nothing changes on
// screen until the re-read envelope says so.
// ════════════════════════════════════════════════════════════════════════
import { staminaRefillOf, blessingsOf, goldOf, nameOf } from '../../session/item-sections.js?v=0.2.25';
import { staminaOf } from '../../session/hunt-sections.js?v=0.2.25';
import { text, cls, prop, rows, element } from '../../render/paint.js?v=0.2.25';
import { whole, gold } from '../../render/format.js?v=0.2.25';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.25';
import { runIntent } from '../intent-words.js?v=0.2.25';

const ROMAN = Object.freeze(['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX']);
const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { confirm: false, pending: false, msg: '' }; SCRATCH.set(cs, s); } return s; };

/** "4 h", "1 h 30 m", "45 m" from milliseconds. */
function hoursText(ms) {
  const m = Math.max(0, Math.floor(Number(ms) / 60000));
  const h = Math.floor(m / 60), r = m % 60;
  return h && r ? h + ' h ' + r + ' m' : h ? h + ' h' : r + ' m';
}

/** The skeleton (built once per opening). */
export function renderServices() {
  return '<div class="hw-services">'
    + '<h3 class="hs-sub">Stamina</h3>'
    + '<p class="hs-note hw-stam-now"></p><p class="hw-stam-quote"></p>'
    + '<div class="hw-tools"><button type="button" class="hh-tool" data-hs-act="stam-ask"></button></div>'
    + '<div class="hw-confirm" role="alertdialog" aria-label="Confirm the stamina purchase"><p class="hw-confirm-q"></p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary" data-hs-act="stam-yes"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="stam-no">Cancel</button></div></div>'
    + '<h3 class="hs-sub">Blessings</h3>'
    + '<p class="hs-note hw-bless-note"></p>'
    + '<ul class="hw-ledger hw-bless"></ul>'
    + '<h3 class="hs-sub">Name</h3>'
    + '<p class="hs-note hw-name-now"></p>'
    + '<div class="hw-add"><input type="text" class="hh-num hw-name-in" maxlength="20" placeholder="New name" data-hs-act="name-in" aria-label="New name">'
    + '<button type="button" class="hh-tool" data-hs-act="name">Change name</button></div>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

renderServices.patch = function patchServices(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const root = body.querySelector('.hw-services');
  const purse = goldOf(cs);
  /* STAMINA */
  const st = staminaOf(cs);
  const q = staminaRefillOf(cs);
  text(root.querySelector('.hw-stam-now'), st ? 'Stamina ' + hoursText(st.msLeft) + ' of ' + hoursText(st.capMs) + '.' : 'Stamina loads from the server.');
  const quote = root.querySelector('.hw-stam-quote');
  const ask = root.querySelector('[data-hs-act="stam-ask"]');
  if (!q) { text(quote, 'The server has not priced a refill yet.'); text(ask, 'Buy stamina'); }
  else if (!q.available) {
    text(quote, q.why === 'stamina_full' ? 'Your stamina is full.' : 'You have bought all ' + whole(q.perDay) + ' refills for today. More tomorrow.');
    text(ask, 'Buy stamina');
  } else {
    text(quote, 'Restores ' + hoursText(q.restoreMs) + ' for ' + gold(q.price) + '. Bought today: ' + whole(q.boughtToday) + ' of ' + whole(q.perDay) + '; each one costs more.');
    text(ask, 'Buy ' + hoursText(q.restoreMs) + ' · ' + gold(q.price));
  }
  const canStam = !!q && q.available && !sc.pending && (purse === null || purse >= q.price);
  prop(ask, 'disabled', !canStam || sc.confirm);
  if (sc.confirm && !canStam) sc.confirm = false;
  const cf = root.querySelector('.hw-confirm');
  cls(cf, 'is-on', sc.confirm);
  const yes = root.querySelector('[data-hs-act="stam-yes"]');
  cls(yes, 'is-on', sc.confirm);
  if (sc.confirm && q) {
    text(cf.querySelector('.hw-confirm-q'), 'Buy ' + hoursText(q.restoreMs) + ' of stamina for ' + gold(q.price) + '?');
    text(yes, 'Buy for ' + gold(q.price));
  }
  prop(yes, 'disabled', sc.pending);
  /* BLESSINGS */
  const b = blessingsOf(cs);
  text(root.querySelector('.hw-bless-note'), !b ? 'Blessings load from the server.'
    : 'Each blessing cuts the XP a death takes; a death uses them all up.' + (b.freeUntil ? ' Free until combat level ' + b.freeUntil + '.' : ''));
  const next = b ? b.tiers.find((t) => !t.held) : null;
  rows(root.querySelector('.hw-bless'), b ? b.tiers : [], {
    key: (t) => String(t.tier),
    build: (t) => element(ctx.doc, '<li class="hw-line" data-tier="' + t.tier + '"><span class="hw-line-name"><b>Blessing ' + ROMAN[t.tier] + '</b><small></small></span>'
      + '<button type="button" class="hh-tool" data-hs-act="bless" data-tier="' + t.tier + '"></button></li>'),
    patch: (li, t) => {
      text(li.querySelector('small'), Math.round(t.permille / 10) + '% less XP lost' + (t.tier > 1 ? ' in all' : '') + ' · ' + (t.held ? 'owned' : t.price ? gold(t.price) : 'free'));
      const btn = li.querySelector('button');
      text(btn, t.held ? 'Owned' : next && next.tier === t.tier ? (t.price ? 'Bless · ' + gold(t.price) : 'Bless · free') : 'Needs ' + ROMAN[t.tier - 1]);
      prop(btn, 'disabled', t.held || !next || next.tier !== t.tier || sc.pending || (purse !== null && purse < t.price));
    },
  });
  /* NAME */
  const name = nameOf(cs);
  text(root.querySelector('.hw-name-now'), name ? 'Players see this character as ' + name + '.' : 'Choose the name players see.');
  for (const el of root.querySelectorAll('.hw-add input, .hw-add button')) prop(el, 'disabled', sc.pending);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
  cls(root, 'is-pending', sc.pending);
};

renderServices.act = function actServices(ctx, body, action, ev, t) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const repaint = () => renderServices.patch(body, ctx);
  if (action === 'stam-ask') { const q = staminaRefillOf(cs); if (q && q.available) { sc.confirm = true; sc.msg = ''; repaint(); } return true; }
  if (action === 'stam-no') { sc.confirm = false; repaint(); return true; }
  if (action === 'stam-yes' && sc.confirm) {
    const q = staminaRefillOf(cs);
    sc.confirm = false;
    if (!q || !q.available) { repaint(); return true; }
    runIntent(sc, repaint, () => cs.buyStamina(q.price), 'Buying stamina…', () => 'Stamina restored.');
    return true;
  }
  if (action === 'bless') {
    const b = blessingsOf(cs);
    const tier = Number(t.getAttribute('data-tier'));
    const row = b && b.tiers.find((x) => x.tier === tier);
    if (!row || row.held) return true;
    runIntent(sc, repaint, () => cs.buyBlessing(tier, row.price), 'Blessing…', () => 'Blessing ' + ROMAN[tier] + ' is yours.');
    return true;
  }
  if (action === 'name') {
    const v = body.querySelector('[data-hs-act="name-in"]').value;
    runIntent(sc, repaint, () => cs.setName(v), 'Saving the name…', () => 'Name changed.');
    return true;
  }
  return false;
};
