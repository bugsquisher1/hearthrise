// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/honor.js — THE ROLL OF HONOR: HAVORA'S HEROES, IN ORDER.
//
// A town's roll, not a table: one board at a time (src/data/honor-roll.js picks which
// boards exist), each line a place, a hero's name and the number that earned it. The
// viewed hero is marked on the roll, and below it the window says where that hero stands
// even when it is far off the top: its place, the hero one place up and how far ahead.
// An empty board says so and invites the first; a hero not on a board is told how to get on.
//   Picking a board   ONE hr_leaderboard read (src/session/honor-roll.js readBoard)
//   While open        the board is asked again every two minutes (the server rebuilds its
//                     boards every five; "Updated N minutes ago" is the server's stamp)
// Every number is the server's: places (shared on a tie), levels, scores, the count and the
// stamp. The window adds nothing up and ranks nobody (CLAUDE.md §1, §6).
// ════════════════════════════════════════════════════════════════════════
import { readBoard } from '../../session/honor-roll.js?v=0.2.78';
import { nameOf } from '../../session/item-sections.js?v=0.2.78';
import { HONOR_BOARDS, honorBoard, honorGroups } from '../../data/honor-roll.js?v=0.2.78';
import { rows, text, cls, attr, prop, element } from '../../render/paint.js?v=0.2.78';
import { whole } from '../../render/format.js?v=0.2.78';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.78';
import { glyphSvg } from '../widgets/bits.js?v=0.2.78';
import { refusalText } from '../intent-words.js?v=0.2.78';

/** Asked again while the window stays open, and after a read that did not land (ms of the shell's clock). */
const REASK_MS = 120000;
const RETRY_MS = 15000;
const SCRATCH = new WeakMap();
/* Display scratch per CharacterSession: the board picked, the server's last answer, the read in flight. */
const scratchOf = (cs) => {
  let s = SCRATCH.get(cs);
  if (!s) { s = { board: HONOR_BOARDS[0].id, roll: null, asking: false, askedAt: -Infinity, stale: true, msg: '' }; SCRATCH.set(cs, s); }
  return s;
};

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st. */
function ordinal(n) {
  const t = n % 100;
  const sfx = t >= 11 && t <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' })[n % 10] || 'th';
  return whole(n) + sfx;
}

/** When the server last rebuilt the boards, in plain words. */
function freshWords(atMs, nowMs) {
  if (!Number.isFinite(atMs)) return '';
  const m = Math.max(0, Math.floor((nowMs - atMs) / 60000));
  if (m < 1) return 'Updated just now';
  if (m < 60) return 'Updated ' + m + (m === 1 ? ' minute ago' : ' minutes ago');
  const h = Math.floor(m / 60);
  return 'Updated ' + h + (h === 1 ? ' hour ago' : ' hours ago');
}

/* The number on a line: "Level 8" with its XP under it, or "Total level 45". */
const valueOf = (b, r) => (b.reads === 'total' ? 'Total level ' + whole(r.level) : 'Level ' + whole(r.level));
const xpOf = (b, r) => (b.reads === 'total' ? '' : whole(r.score) + ' XP');

function lineHtml() {
  return '<li class="hr-line"><span class="hr-place"></span><span class="hr-name"><b></b><small></small></span>'
    + '<span class="hr-val"><b></b><small></small></span></li>';
}

function patchLine(li, r, st) {
  const viewed = r.mine && r.slot === st.slot;
  cls(li, 'is-first', r.place === 1);
  cls(li, 'is-mine', r.mine);
  cls(li, 'is-viewed', viewed);
  attr(li, 'aria-current', viewed ? 'true' : null);
  text(li.querySelector('.hr-place'), ordinal(r.place));
  text(li.querySelector('.hr-name b'), r.name);
  text(li.querySelector('.hr-name small'), viewed ? 'Your hero' : r.mine ? 'Also yours' : '');
  text(li.querySelector('.hr-val b'), valueOf(st.b, r));
  text(li.querySelector('.hr-val small'), xpOf(st.b, r));
}

const lineRows = (host, list, st, doc) => rows(host, list, {
  key: (r) => String(r.rank), build: () => element(doc, lineHtml()), patch: (li, r) => patchLine(li, r, st),
});

/** The skeleton (built once per opening): the board is asked for afresh. */
export function renderHonor(ctx) {
  if (ctx && ctx.character) { const sc = scratchOf(ctx.character); sc.stale = true; sc.msg = ''; }
  const options = honorGroups().map((g) => '<optgroup label="' + esc(g.group) + '">'
    + g.boards.map((b) => '<option value="' + esc(b.id) + '">' + esc(b.label) + '</option>').join('') + '</optgroup>').join('');
  return '<div class="hw-honor">'
    + '<label class="hr-pick"><span>Roll</span><select class="hh-select" data-hs-act="board" aria-label="Which roll to read">' + options + '</select></label>'
    + '<header class="hr-head"><span class="hr-glyph" aria-hidden="true"></span><span class="hr-head-words"><b class="hr-title"></b><small class="hr-why"></small></span></header>'
    + '<p class="hw-cap"><span class="hr-count"></span><span class="hr-fresh"></span></p>'
    + '<ol class="hr-roll" aria-label="The roll"></ol>'
    + '<p class="hh-empty hr-empty"></p>'
    + '<section class="hr-you"><h3 class="hw-ledger-head is-on">Your hero</h3>'
    + '<p class="hr-you-line"></p><ol class="hr-roll hr-near" aria-label="Around your hero"></ol><p class="hr-you-next"></p></section>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

/* Where the viewed hero stands: { line, next, near } in plain words, from the server's own rows. */
function standing(b, roll, slot, heroName) {
  const me = roll.mine.find((m) => m.slot === slot) || null;
  if (!me) return { line: heroName + ' is not on this roll yet. ' + b.join, next: '', near: [] };
  const shared = roll.top.concat(me.near).some((r) => r.place === me.place && r.rank !== me.rank);
  const line = me.place === 1
    ? me.name + (shared ? ' shares first place.' : ' holds first place.')
    : me.name + (shared ? ' shares ' : ' stands ') + ordinal(me.place) + ' of ' + whole(roll.total) + '.';
  const up = me.near.filter((r) => r.place < me.place).sort((x, y) => y.rank - x.rank)[0];
  const gap = up ? up.score - me.score : 0;
  const next = !up ? '' : b.reads === 'total'
    ? up.name + ', the next hero up, is ' + whole(gap) + (gap === 1 ? ' level' : ' levels') + ' ahead.'
    : up.name + ', the next hero up, is ' + whole(gap) + ' XP ahead.';
  const inTop = roll.top.some((r) => r.rank === me.rank);
  return { line, next, near: inTop ? [] : me.near };
}

renderHonor.patch = function patchHonor(body, ctx) {
  const cs = ctx.character;
  const root = body.querySelector('.hw-honor');
  if (!cs || !root) return;
  const sc = scratchOf(cs);
  const b = honorBoard(sc.board) || HONOR_BOARDS[0];
  const roll = sc.roll && sc.roll.board === b.id ? sc.roll : null;
  const st = { b, slot: cs.slot };
  const select = root.querySelector('[data-hs-act="board"]');
  if (select.value !== b.id) prop(select, 'value', b.id);
  const glyph = root.querySelector('.hr-glyph');
  if (glyph.getAttribute('data-glyph') !== b.glyph) { glyph.innerHTML = glyphSvg(ctx.glyphs, b.glyph); attr(glyph, 'data-glyph', b.glyph); }
  text(root.querySelector('.hr-title'), b.label);
  text(root.querySelector('.hr-why'), b.why);
  const n = roll ? roll.total : null;
  text(root.querySelector('.hr-count'), !n ? '' : n === 1 ? '1 hero on this roll' : whole(n) + ' heroes on this roll');   // an empty roll says so below
  text(root.querySelector('.hr-fresh'), roll ? freshWords(roll.refreshedAt, Date.now()) : '');
  lineRows(root.querySelector('.hr-roll:not(.hr-near)'), roll ? roll.top : [], st, ctx.doc);
  const empty = root.querySelector('.hr-empty');
  cls(empty, 'is-on', !roll || !roll.top.length);
  text(empty, !roll ? (sc.asking ? 'Reading the roll…' : sc.msg || 'Reading the roll…') : b.empty);
  const you = roll ? standing(b, roll, cs.slot, nameOf(cs) || 'Your hero') : null;
  cls(root.querySelector('.hr-you'), 'is-on', !!you);
  text(root.querySelector('.hr-you-line'), you ? you.line : '');
  lineRows(root.querySelector('.hr-near'), you ? you.near : [], st, ctx.doc);
  text(root.querySelector('.hr-you-next'), you ? you.next : '');
  text(root.querySelector('.hh-intent-msg'), roll ? sc.msg : '');
  /* THE READ: once per opening, on a new board, and every REASK_MS while open (a read, never the record). */
  const due = sc.stale || ctx.now() - sc.askedAt >= REASK_MS;
  if (due && !sc.asking && ctx.account) {
    const want = b.id;
    sc.asking = true; sc.stale = false; sc.askedAt = ctx.now();
    readBoard(ctx.account, cs, want).then((r) => {
      sc.asking = false;
      if (r.ok) { sc.roll = r.roll; sc.msg = ''; } else {
        sc.askedAt = ctx.now() - REASK_MS + RETRY_MS;   // asked again in RETRY_MS, never on every tick
        if (sc.board === want) sc.msg = refusalText(r, cs);
      }
      ctx.refresh('honor');
    });
  }
};

renderHonor.act = function actHonor(ctx, body, action, ev, t) {
  if (action !== 'board' || ev.type !== 'change' || !ctx.character) return false;
  const b = honorBoard(t.value);
  if (!b) return false;
  const sc = scratchOf(ctx.character);
  if (sc.board !== b.id) { sc.board = b.id; sc.stale = true; sc.msg = ''; }
  ctx.refresh('honor');
  return true;
};
