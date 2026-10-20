// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/bestiary.js — THE BESTIARY: WHAT THIS ACCOUNT HAS SLAIN.
//
// One page per hunting ground, one line per creature that lives there, every
// number the SERVER's (`account_bestiary`, src/session/bestiary-sections.js;
// the same on every character of the account):
//   how common it is on its ground, how many the account has slain, the stage
//   those kills reached, the stage activated and the relic chance it raises,
//   and the next stage: its kill count and its fee.
// Activate sends ONE intent for the next stage at the fee the server quoted
// (hr_bestiary_activate, refused quote_changed otherwise). It is off until the
// server says the kills are there and the creature drops a relic, while any
// intent is in flight, and when the purse is short; nothing on screen moves
// until the re-read envelope says so.
// ════════════════════════════════════════════════════════════════════════
import { bestiaryOf } from '../../session/bestiary-sections.js?v=0.2.12';
import { goldOf } from '../../session/item-sections.js?v=0.2.12';
import { HUNT_INDEX, RARITY_LABEL } from '../../data/hunts.js?v=0.2.12';
import { monsterName } from '../widgets/bits.js?v=0.2.12';
import { text, cls, prop, rows, element } from '../../render/paint.js?v=0.2.12';
import { whole, gold } from '../../render/format.js?v=0.2.12';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.12';
import { runIntent } from '../intent-words.js?v=0.2.12';

const COMMON = Object.freeze({ ...RARITY_LABEL, boss: 'Holds a room' });
const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { pending: false, msg: '' }; SCRATCH.set(cs, s); } return s; };

/** The ground pages: [{ hunt, rows: [monster row] }] in the server's order (a creature on two grounds shows on each). */
function pagesOf(b) {
  const out = new Map();
  for (const m of b.monsters) {
    for (const g of m.grounds) {
      if (!out.has(g.hunt)) out.set(g.hunt, { hunt: g.hunt, rows: [] });
      out.get(g.hunt).rows.push({ m, rarity: g.rarity });
    }
  }
  return Array.from(out.values());
}

/** "x1.05" */
const times = (v) => 'x' + Number(v).toFixed(2);

/** The relic line: what the activated stage raises, or why there is nothing to raise. */
function relicLine(m) {
  if (!m.hasRelic) return 'No relic to boost here.';
  return m.activatedStage ? 'Relic chance ' + times(m.relicMult) + ' (stage ' + m.activatedStage + ' active).' : 'Relic chance not raised yet.';
}

/** The next-stage line. */
function nextLine(m, last) {
  if (!m.next) return 'Every stage is active.';
  const reached = m.kills >= m.next.kills;
  return 'Stage ' + m.next.stage + ' of ' + last + (reached ? ' reached' : ' at ' + whole(m.next.kills) + ' kills') + ' · fee ' + gold(m.next.fee);
}

/** The skeleton (built once per opening). */
export function renderBestiary() {
  return '<div class="hw-bestiary">'
    + '<p class="hs-note hw-best-note"></p>'
    + '<div class="hw-best-pages"></div>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

renderBestiary.patch = function patchBestiary(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const root = body.querySelector('.hw-bestiary');
  const b = bestiaryOf(cs);
  const purse = goldOf(cs);
  const canSend = !!cs && typeof cs.activateBestiaryStage === 'function';
  const last = b && b.stages.length ? b.stages[b.stages.length - 1].stage : 0;
  text(root.querySelector('.hw-best-note'), !b ? 'The bestiary loads from the server.'
    : 'Every character on your account adds to these counts. Each stage reached can be activated once, for a fee, to raise that creature\'s relic chance'
      + (b.stages.length ? ' (' + b.stages.map((s) => whole(s.kills) + ' kills ' + times(s.relicMult)).join(', ') + ').' : '.'));
  rows(root.querySelector('.hw-best-pages'), b ? pagesOf(b) : [], {
    key: (p) => p.hunt,
    build: (p) => element(ctx.doc, '<section class="hw-best-page"><h3 class="hs-sub">' + esc((HUNT_INDEX[p.hunt] && HUNT_INDEX[p.hunt].name) || p.hunt)
      + '</h3><ul class="hw-ledger"></ul></section>'),
    patch: (sec, p) => rows(sec.querySelector('ul'), p.rows, {
      key: (r) => r.m.monster,
      build: (r) => element(ctx.doc, '<li class="hw-line"><span class="hw-line-name"><b>' + esc(monsterName(r.m.monster)) + '</b>'
        + '<small class="hw-best-kills"></small><small class="hw-best-relic"></small><small class="hw-best-next"></small></span>'
        + '<button type="button" class="hh-tool" data-hs-act="activate" data-monster="' + esc(r.m.monster) + '"></button></li>'),
      patch: (li, r) => {
        const m = r.m;
        text(li.querySelector('.hw-best-kills'), (COMMON[r.rarity] || r.rarity) + (m.level ? ' · level ' + whole(m.level) : '') + ' · '
          + whole(m.kills) + ' slain · stage ' + m.stage + ' of ' + last);
        text(li.querySelector('.hw-best-relic'), relicLine(m));
        text(li.querySelector('.hw-best-next'), nextLine(m, last));
        const btn = li.querySelector('button');
        text(btn, m.next ? 'Activate ' + m.next.stage : 'Done');
        prop(btn, 'disabled', !canSend || !m.canActivate || sc.pending || purse === null || purse < m.next.fee);
      },
    }),
  });
  text(root.querySelector('.hh-intent-msg'), sc.msg);
  cls(root, 'is-pending', sc.pending);
};

renderBestiary.act = function actBestiary(ctx, body, action, ev, t) {
  if (ev.type !== 'click' || action !== 'activate') return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const b = bestiaryOf(cs);
  const m = b && b.monsters.find((x) => x.monster === t.getAttribute('data-monster'));
  if (!m || !m.canActivate || typeof cs.activateBestiaryStage !== 'function') return true;
  const stage = m.next.stage;
  runIntent(sc, () => renderBestiary.patch(body, ctx), () => cs.activateBestiaryStage(m.monster, stage, m.next.fee),
    'Activating…', () => monsterName(m.monster) + ': stage ' + stage + ' is active.');
  return true;
};
