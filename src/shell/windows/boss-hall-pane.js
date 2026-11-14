// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/boss-hall-pane.js — A KEYED HALL ON ITS GROUND'S PAGE (src/data/boss-halls.js; the Krell's Hold design's engine piece 5).
//
// One section under Go as, on a ground whose hall a key opens: how many of its keys this hero holds (the server's bag, as every envelope
// replaces it), the press, then the warning with its one confirm (the 11-04 risk ruling: a warned choice, one confirm press). The press
// stays off with no key, while the hero hunts and for a party's member; the server decides the rest (hr_boss_hall_enter) and its refusal
// keeps the key. hunts.js owns the window, its status line and the run of the press. A ground with no hall shows nothing.
// ════════════════════════════════════════════════════════════════════════
import { text, prop, cls } from '../../render/paint.js?v=0.2.130';
import { BOSS_HALL_RULES, BOSS_HALL_WORDS, hallFromGround, roomOfHunt } from '../../data/boss-halls.js?v=0.2.130';
import { isGuarded } from '../../data/boss-calls.js?v=0.2.130';
import { HUNT_INDEX } from '../../data/hunts.js?v=0.2.130';
import { MONSTERS } from '../../data/monsters.js?v=0.2.130';
import { spellRow } from '../../data/monster-spells.js?v=0.2.130';
import { bagOf } from '../../session/item-sections.js?v=0.2.130';
import { openHall } from '../../session/boss-intents.js?v=0.2.130';
import { itemName } from '../widgets/bits.js?v=0.2.130';

const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { hall: null, warned: false }; SCRATCH.set(cs, s); } return s; };

/** {Boss}, {boss}, {key}, {hall}, {minutes}, {guard} and {haste} in one of the table's lines, for hall `hall`. */
export function hallWords(line, hall) {
  const room = roomOfHunt(hall.hunt);
  const row = room ? MONSTERS[room.monster] : null;
  const h = row && row.phases && row.phases.hasten;
  const sp = h ? spellRow(h.spell) : null;
  return line.replace('{Boss}', hall.Boss).replace('{boss}', hall.boss).replace('{key}', itemName(hall.key))
    .replace('{hall}', (HUNT_INDEX[hall.hunt] || {}).name || hall.Boss).replace('{minutes}', String(BOSS_HALL_RULES.limitMs / 60000))
    .replace('{guard}', isGuarded(row) ? BOSS_HALL_WORDS.warnGuard : '').replace('{haste}', sp ? BOSS_HALL_WORDS.warnHaste.replace('{spell}', sp.n) : '');
}
/** The words for a refusal of this hall (the table's), or null: the status line's general reader takes the rest. */
export function hallRefusal(r, hall) {
  const line = r && Object.hasOwn(BOSS_HALL_WORDS.refused, r.error) ? BOSS_HALL_WORDS.refused[r.error] : null;
  return line ? hallWords(line, hall) : null;
}
/* This hero's keys for `hall`, from the server's bag. */
const keysOf = (cs, hall) => ((bagOf(cs) || []).find((x) => x.id === hall.key) || { qty: 0 }).qty;

export function hallHtml() {
  return '<section class="hw-hd-call hw-hd-hall" aria-label="' + BOSS_HALL_WORDS.heading + '" hidden><h4 class="hw-hd-h"></h4>'
    + '<p class="hw-call-line"></p>'
    + '<button type="button" class="hh-tool hw-call-press" data-hs-act="hall-warn"></button>'
    + '<div class="hw-confirm hw-call-warn" role="group" aria-label="' + BOSS_HALL_WORDS.sure + '"><p class="hw-confirm-q"></p><p class="hw-confirm-note hw-hall-note-alone" hidden></p><p class="hw-confirm-note hw-hall-note-a"></p><p class="hw-confirm-note hw-hall-note-b"></p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary is-on" data-hs-act="hall-go"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="hall-no"></button></div></div></section>';
}

/** Write the section for ground `v.hunt` ({ hunt, party, now, pending }); `hall` the hall its page opens (the data's, by default). */
export function patchHall(det, ctx, v, hall = hallFromGround(v.hunt)) {
  const box = det.querySelector('.hw-hd-hall');
  prop(box, 'hidden', !hall);
  if (!hall) return;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  if (sc.hall !== hall) { sc.hall = hall; sc.warned = false; }
  const keys = keysOf(cs, hall);
  const member = !!v.party && !v.party.isLeader;
  const open = keys > 0 && !v.now && !v.pending && !member;
  text(box.querySelector('.hw-hd-h'), BOSS_HALL_WORDS.heading);
  const W = BOSS_HALL_WORDS;
  const said = v.now ? W.hunting : member ? W.refused.hall_leader : keys === 0 ? W.have.none : keys === 1 ? W.have.one : W.have.other.replace('{n}', String(keys));
  text(box.querySelector('.hw-call-line'), hallWords(said, hall));
  const press = box.querySelector('.hw-call-press');
  text(press, hallWords(W.press, hall));
  prop(press, 'disabled', !open);
  prop(press, 'hidden', sc.warned && open);
  const warn = box.querySelector('.hw-call-warn');
  cls(warn, 'is-on', sc.warned && open);
  if (sc.warned && open) {
    const alone = !v.party || v.party.seats.length <= 1;
    text(warn.querySelector('.hw-confirm-q'), hallWords(W.warnTitle, hall));
    const a = warn.querySelector('.hw-hall-note-alone');
    prop(a, 'hidden', !alone);
    text(a, alone ? hallWords(W.warnAlone, hall) : '');
    text(warn.querySelector('.hw-hall-note-a'), hallWords(W.warn[0], hall));
    text(warn.querySelector('.hw-hall-note-b'), hallWords(W.warn[1], hall));
    text(warn.querySelector('[data-hs-act="hall-go"]'), hallWords(W.confirm, hall));
    text(warn.querySelector('[data-hs-act="hall-no"]'), W.cancel);
  }
}

/**
 * The section's presses. `run(send, busy, done)` is hunts.js's: the status line, the setup Go as chose, the close on a hunt under way.
 * Answers true when the action was this section's.
 */
export function actHall(ctx, action, repaint, run) {
  if (action !== 'hall-warn' && action !== 'hall-no' && action !== 'hall-go') return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  if (action === 'hall-warn') { sc.warned = true; repaint(); return true; }
  if (action === 'hall-no') { sc.warned = false; repaint(); return true; }
  const { hall } = sc;
  if (!hall || keysOf(cs, hall) < 1) return true;
  sc.warned = false;
  run(() => openHall(ctx.account, cs, hall.id), hallWords(BOSS_HALL_WORDS.opening, hall),
    (r) => hallWords(r && r.alone === false ? BOSS_HALL_WORDS.opened.party : BOSS_HALL_WORDS.opened.alone, hall))
    .then(() => repaint());
  return true;
}
