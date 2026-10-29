// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/party-hold.js — WHO HOLDS THE PACK, ON THE PARTY BOARD.
//
// With two or more tanks one holds the pack: by turns, a lap each (bug #59,
// Andy 10-22), or the tank the leader picks holds every lap (Tyler 2026-10-22,
// "One tank holds"). This module is the Party panel's part of it
// (src/shell/widgets/party-panel.js composes it):
//   · the LEADER's two-way switch "Take turns | One tank holds" and, under "One
//     tank holds", the party's tanks to pick from (the pull leader's by default);
//     every other seat sees the same switch read-only. ONE intent per press
//     (party-intents.js setHoldSeat), off while it is in flight; a refusal reads
//     in words (refusal-words.js). The switch shows the SERVER's `hold_seat`
//     (party-sections.js holdSeat), never the press.
//   · each tank row's line ("Holding this lap", "Holds every lap", "Guards your
//     healer" ...) from the live engine's world (live-engine.js tankTurns: the
//     engine's own holderTank), never a guess here; none in town.
//   · the note under the roster that says how the tanks share it, and a warning
//     when the pick is far weaker than the strongest tank (the engine's own
//     floor, targeting.js underHoldFloor, over the server's max HP).
// ════════════════════════════════════════════════════════════════════════
import { HUNT_ROLES, CHALLENGE } from '../../data/hunt-roles.js?v=0.2.65';
import { underHoldFloor } from '../../core/hunt/targeting.js?v=0.2.65';
import { setHoldSeat } from '../../session/party-intents.js?v=0.2.65';
import { runIntent } from '../intent-words.js?v=0.2.65';
import { rows, text, cls, attr, prop, element } from '../../render/paint.js?v=0.2.65';

const isTank = (m) => !!(m.role && HUNT_ROLES[m.role] && HUNT_ROLES[m.role].tank);
const FLOOR = Math.round(CHALLENGE.holderMinHpPm / 10) + '%';

/** A tank row's line for its turn (live-engine.js tankTurnsOf); `healer`: the party has one to guard. */
export function turnWords(turn, healer) {
  if (turn === 'every') return 'Holds every lap';
  if (turn === 'now') return 'Holding this lap';
  if (turn === 'later-every') return 'Holds every lap from next lap';
  if (turn === 'guard') return healer ? 'Guards your healer' : 'Guards the party';
  if (turn === 'weak') return 'Too weak to hold';
  return turn === 1 ? 'Holds next lap' : 'Holds in ' + turn + ' laps';
}

/* The note while the tanks take turns: the engine's count of tanks in the turns and out of them (in town, all in). */
function turnsNote(rotation, weak) {
  if (rotation > 1 && weak) return 'Your tanks take turns holding the pack, one lap each. A tank with under ' + FLOOR + ' of the strongest tank’s max health never holds.';
  if (rotation > 1) return 'Your tanks take turns holding the pack, one lap each. '
    + (rotation === 2 ? 'The other tank pulls' : 'The other tanks pull') + ' monsters off the rest of the party.';
  return rotation === 1 && weak ? 'Your strongest tank holds the pack every lap. A tank with under ' + FLOOR + ' of its max health never holds.' : '';
}

/* The note while one tank holds. */
function holdNote(name, others) {
  return name + ' holds the pack every lap. ' + (others.length === 1 ? others[0] + ' takes over' : 'Your other tanks take turns')
    + ' if ' + name + ' leaves. Only ' + name + ' trains Defense from holding.';
}

/**
 * The hold part of a roster (party-panel.js rosterOf / liveRoster members, each tank row's engine `turn` on it
 * already): { show, isLeader, one, tanks: [{ seat, name, on }], fallback, note, warn }. `show` only in a party
 * with two or more tanks. Pure; exported for tests/party-ui.mjs.
 */
export function holdView(r, turns) {
  const tanks = r.members.filter(isTank);
  const show = r.inParty && tanks.length > 1;
  const pick = r.holdSeat === null ? null : tanks.find((m) => m.seat === r.holdSeat) || null;
  /* the default pick: the pull leader's tank (the hunt's, partyOf `leader`), else the first tank by seat, the one
     the engine makes pull (roles.js pickLeader: the first tank to enter) */
  const fallback = (tanks.find((m) => m.seat === r.pullSeat) || tanks[0] || {}).seat ?? null;
  let note = '', warn = '';
  if (show && pick) {
    note = holdNote(pick.name, tanks.filter((m) => m !== pick).map((m) => m.name));
    const known = tanks.filter((m) => Number.isFinite(m.hpMax) && m.hpMax > 0).map((m) => ({ m, maxHp: m.hpMax }));
    const own = known.find((x) => x.m === pick);
    if (own && underHoldFloor(own, known)) warn = pick.name + ' has much less HP than ' + known.reduce((a, b) => (b.maxHp > a.maxHp ? b : a)).m.name + '.';
  } else if (show) {
    const vals = turns ? [...turns.values()] : [];
    note = vals.length > 1 ? turnsNote(vals.filter((v) => v !== 'weak' && v !== 'guard').length, vals.filter((v) => v === 'weak').length) : turnsNote(tanks.length, 0);
  }
  return { show, isLeader: r.isLeader === true, one: r.holdSeat !== null, tanks: tanks.map((m) => ({ seat: m.seat, name: m.name, on: m.seat === r.holdSeat })),
    fallback, note, warn };
}

/** The switch's skeleton, then the note and the warning under it (built once, inside the panel). Each mode reads
    in full on a desktop and short on a phone, where the board is 200 px (hunt.css, the phone query). */
export function holdHtml() {
  return '<div class="hp-hold" hidden><p class="hp-hold-label">Who holds the pack</p>'
    + '<span class="hh-segs hp-hold-modes" role="group" aria-label="Who holds the pack">'
    + '<button type="button" class="hh-seg" data-hs-act="hold-turns" aria-pressed="false" aria-label="Take turns">'
    + '<span class="hp-hold-wide">Take turns</span><span class="hp-hold-narrow">Turns</span></button>'
    + '<button type="button" class="hh-seg" data-hs-act="hold-one" aria-pressed="false" aria-label="One tank holds">'
    + '<span class="hp-hold-wide">One tank holds</span><span class="hp-hold-narrow">One tank</span></button></span>'
    + '<span class="hh-segs hp-hold-tanks" role="group" aria-label="The tank that holds"></span></div>'
    + '<p class="hp-tanks"></p><p class="hp-hold-warn"></p>';
}

/** Patch the switch, the note and the warning from `v` (holdView); `pending`: a party intent is in flight. */
export function patchHold(el, v, pending, doc) {
  const box = el.querySelector('.hp-hold');
  prop(box, 'hidden', !v.show);
  cls(box, 'is-read', !v.isLeader);
  text(el.querySelector('.hp-hold-label'), v.isLeader ? 'Who holds the pack' : 'Who holds the pack (the leader chooses)');
  const off = !v.isLeader || pending;
  for (const [act, on] of [['hold-turns', !v.one], ['hold-one', v.one]]) {
    const b = el.querySelector('[data-hs-act="' + act + '"]');
    attr(b, 'aria-pressed', String(on));
    prop(b, 'disabled', off);
  }
  const list = el.querySelector('.hp-hold-tanks');
  prop(list, 'hidden', !v.one);
  rows(list, v.one ? v.tanks : [], {
    key: (t) => t.seat,
    build: () => element(doc, '<button type="button" class="hh-seg" data-hs-act="hold-seat"></button>'),
    patch: (b, t) => { text(b, t.name); attr(b, 'data-seat', String(t.seat)); attr(b, 'aria-pressed', String(t.on)); prop(b, 'disabled', off); },
  });
  text(el.querySelector('.hp-hold-warn'), v.warn);
  text(el.querySelector('.hp-tanks'), v.show ? v.note : '');
}

/**
 * A press on the switch (the leader's): Take turns names no seat; One tank holds names the pull leader's
 * tank; a tank in the list names its seat. A press on what the server already holds sends nothing.
 * Answers true when `action` was the switch's.
 */
export function holdAct(ctx, cs, sc, repaint, action, btn, v) {
  if (!['hold-turns', 'hold-one', 'hold-seat'].includes(action)) return false;
  if (!v.show || !v.isLeader) return true;
  const seat = action === 'hold-turns' ? null : action === 'hold-one' ? v.fallback : Number(btn.getAttribute('data-seat'));
  const now = v.one ? (v.tanks.find((t) => t.on) || {}).seat ?? -1 : null;
  if ((action === 'hold-one' && v.one) || seat === now || (seat !== null && !Number.isInteger(seat))) return true;
  runIntent(sc, repaint, () => setHoldSeat(ctx.account, cs, seat), 'Saving…', () => '', cs);
  return true;
}
