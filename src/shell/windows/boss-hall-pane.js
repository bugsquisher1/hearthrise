// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/boss-hall-pane.js — A KEYED HALL ON ITS GROUND'S PAGE (src/data/boss-halls.js; the Krell's Hold design's engine piece 5).
//
// One section under Go as, on a ground whose hall a key opens: how many of its keys this hero holds (the server's bag, as every envelope
// replaces it), the press, then the warning with its one confirm (the 11-04 risk ruling: a warned choice, one confirm press). The press
// stays off with no key, while the hero hunts and for a party's member; the server decides the rest (hr_boss_hall_enter) and its refusal
// keeps the key. hunts.js owns the window, its status line and the run of the press. A ground with no hall shows nothing.
// ANY SEAT'S KEY OPENS IT, AND THE PRIZE IS ONCE A DAY (lane/c-krell-daily): the server's `boss_halls` section (boss-quote.js hallStateOf)
// says whose key an open would take and whether this hero, and how many of its party, can still take today's prize. The press comes on for
// a leader whose party holds a key in another seat, and one label line says the loot. A server that has not said shows neither.
// ════════════════════════════════════════════════════════════════════════
import { text, prop, cls, rows, element } from '../../render/paint.js?v=0.2.142';
import { BOSS_HALL_RULES, BOSS_HALL_WORDS, hallFromGround, roomOfHunt } from '../../data/boss-halls.js?v=0.2.142';
import { isGuarded } from '../../data/boss-calls.js?v=0.2.142';
import { HUNT_INDEX } from '../../data/hunts.js?v=0.2.142';
import { MONSTERS } from '../../data/monsters.js?v=0.2.142';
import { spellRow } from '../../data/monster-spells.js?v=0.2.142';
import { bagOf, nameOf } from '../../session/item-sections.js?v=0.2.142';
import { partyMembershipOf } from '../../session/party-sections.js?v=0.2.142';
import { settingsOf, serverNowOf } from '../../session/hunt-sections.js?v=0.2.142';
import { hallStateOf } from '../../session/boss-quote.js?v=0.2.142';
import { hoursWords } from '../../render/format.js?v=0.2.142';
import { weakFoodOf, weakFoodWords, groundFloor, hallFloor, notSaid } from '../weak-food.js?v=0.2.142';
import { heroVitalsOf } from '../../session/character-sections.js?v=0.2.142';
import { storeName } from '../bar-draft.js?v=0.2.142';
import { openHall } from '../../session/boss-intents.js?v=0.2.142';
import { itemName } from '../widgets/bits.js?v=0.2.142';
import { prizeSlices } from '../../core/drops.js?v=0.2.142';
import { partyNote } from '../hunt-list.js?v=0.2.142';

const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { hall: null, warned: false }; SCRATCH.set(cs, s); } return s; };

/** {Boss}, {boss}, {key}, {hall}, {minutes}, {guard} and {haste} in one of the table's lines, for hall `hall`. */
export function hallWords(line, hall) {
  const room = roomOfHunt(hall.hunt);
  const row = room ? MONSTERS[room.monster] : null;
  const h = row && row.phases && row.phases.hasten;
  const sp = h ? spellRow(h.spell) : null;
  const dropper = line.includes('{source}') ? Object.values(MONSTERS).find((m) => m && Array.isArray(m.drops) && m.drops.some((d) => d.id === hall.key)) : null;
  return line.replace('{source}', dropper ? BOSS_HALL_WORDS.source.replace('{dropper}', dropper.name) : '')
    .replace('{Boss}', hall.Boss).replace('{boss}', hall.boss).replace('{key}', itemName(hall.key))
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
/* ANOTHER SEAT'S KEY the open would take (the server's own rule, the `boss_halls` section): { name } in a party whose key is not this
   hero's own, else null. Never read from another hero's bag here: another account's is not in this browser. */
const seatKeyOf = (st, party) => (party && st && st.key && st.key.own !== true ? st.key : null);
/* THE LOOT LINES, one label each (boss-halls.js loot): this hero's own day, the wait to the next when taken (the server's clock), and in
   a party how many of the heroes walking in can still take today's. None when the server has not said. */
function lootLines(cs, st) {
  if (!st) return [];
  const W = BOSS_HALL_WORDS.loot;
  /** @type {string[]} */
  const out = [st.taken ? W.taken : W.left];
  /* the first win is still ahead of this hero (the server's word): its roll always lands a piece */
  if (st.first) out.push(W.first);
  const now = serverNowOf(cs);
  if (st.taken && st.nextAtMs !== null && Number.isFinite(now) && st.nextAtMs > now) out.push(W.next.replace('{in}', hoursWords(st.nextAtMs - now)));
  if (st.seats !== null && st.seats > 1 && st.left !== null) out.push(W.party.replace('{n}', String(st.left)).replace('{m}', String(st.seats)));
  return out;
}

/** A share of one roll as the page says it: "2.9", "3", "6.7" (one decimal, no trailing zero). */
const pctWords = (ch) => String(Math.round(ch * 1000) / 10);
/**
 * THE PRIZE TABLE of `hall`, one label a piece, in the rows' order: the numbers the server rolls (drops.js prizeSlices over the boss's own
 * rows, the data the engine is built from), never a number typed here. `first`: the server says this hero's first win is ahead, so each
 * line carries that roll's number too.
 */
export function prizeLines(hall, first) {
  const room = hall ? roomOfHunt(hall.hunt) : null;
  const rowsOf = room && MONSTERS[room.monster] ? MONSTERS[room.monster].drops || [] : [];
  const every = prizeSlices(rowsOf, false), sure = prizeSlices(rowsOf, true);
  const W = BOSS_HALL_WORDS.loot;
  return every.map((d, i) => (first && sure[i].ch !== d.ch ? W.rowFirst.replace('{first}', pctWords(sure[i].ch)) : W.row).replace('{item}', itemName(d.id)).replace('{pct}', pctWords(d.ch)));
}

export function hallHtml() {
  return '<section class="hw-hd-call hw-hd-hall" aria-label="' + BOSS_HALL_WORDS.heading + '" hidden><h4 class="hw-hd-h"></h4>'
    /* HIS PRIZE TABLE, folded, under the name and above the door: what he can drop is read before the key is spent, and one line here
       is one line less under the press, so at the page's end a 423 px phone still shows the press whole (tests/phone-touch.mjs PH-32) */
    + '<details class="hw-hall-table"><summary class="hh-tool is-link"></summary><ul class="hw-before hw-hall-drops"></ul></details>'
    /* THE DOOR FIRST, THEN WHAT WINS: the key line, this bar's red food line and the press stand together under the head, so the
       press and its warning are in view at once on a 423 px phone, never the press under Enter with its warning a screen above */
    + '<p class="hw-call-line"></p><p class="hw-before-line is-short hw-hall-food" hidden></p>'
    + '<button type="button" class="hh-tool hw-call-press" data-hs-act="hall-warn"></button>'
    + '<div class="hw-confirm hw-call-warn" role="group" aria-label="' + BOSS_HALL_WORDS.sure + '"><p class="hw-confirm-q"></p><p class="hw-confirm-note hw-hall-note-alone" hidden></p><p class="hw-confirm-note hw-hall-note-a"></p><p class="hw-confirm-note hw-hall-note-b"></p>'
    /* nobody walking in can take today's prize: said in the confirm, where the key is about to be used */
    + '<p class="hw-confirm-note hw-hall-note-loot" hidden></p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary is-on" data-hs-act="hall-go"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="hall-no"></button></div></div>'
    /* the day's prize, label lines under the door (the door itself stays where a 423 px phone shows it whole) */
    + '<ul class="hw-before hw-hall-loot" aria-label="' + BOSS_HALL_WORDS.loot.label + '"></ul>'
    + '<p class="hs-note hw-hall-bars" hidden></p><ul class="hw-before hw-hall-tips" aria-label="' + BOSS_HALL_WORDS.tipsLabel + '"></ul></section>';
}

/** Write the section for ground `v.hunt` ({ hunt, party, now, pending, other: another setup picked under Go as }); `hall` the hall its page
    opens (the data's, by default). */
export function patchHall(det, ctx, v, hall = hallFromGround(v.hunt)) {
  const box = det.querySelector('.hw-hd-hall');
  prop(box, 'hidden', !hall);
  if (!hall) return;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  if (sc.hall !== hall) { sc.hall = hall; sc.warned = false; }
  const keys = keysOf(cs, hall);
  const member = !!v.party && !v.party.isLeader;
  /* the server's own word on this door (the `boss_halls` section): whose key, and the day's prize */
  const st = hallStateOf(cs, hall.id);
  const seatKey = seatKeyOf(st, v.party);
  const open = (keys > 0 || !!seatKey) && !v.now && !v.pending && !member;
  text(box.querySelector('.hw-hd-h'), BOSS_HALL_WORDS.heading);
  const W = BOSS_HALL_WORDS;
  const held = seatKey ? W.have.party.replace('{name}', seatKey.name || W.someHero) : null;
  const said = (v.now ? W.hunting : member ? (keys > 0 ? W.memberKey : held || W.refused.hall_leader) : keys === 0 ? held || W.have.none : keys === 1 ? W.have.one : W.have.other).replace('{n}', String(keys));
  text(box.querySelector('.hw-call-line'), hallWords(said, hall));
  rows(box.querySelector('.hw-hall-loot'), lootLines(cs, st), { key: (x) => x, build: () => element(box.ownerDocument, '<li class="hw-before-line"></li>'), patch: (li, x) => text(li, x) });
  const table = prizeLines(hall, !!st && st.first);
  prop(box.querySelector('.hw-hall-table'), 'hidden', !table.length);
  text(box.querySelector('.hw-hall-table summary'), W.loot.table.replace('{n}', String(table.length)));
  rows(box.querySelector('.hw-hall-drops'), table, { key: (x) => x, build: () => element(box.ownerDocument, '<li class="hw-before-line"></li>'), patch: (li, x) => text(li, x) });
  /* WHAT WINS HERE (the hall's measured food and bar line, boss-halls.js food and words.bars): said before the key is spent, red when this bar's food is under it */
  const advice = hall.storeFloor ? hallWords(W.food, hall).replace('{food}', storeName(hall.storeFloor)) + (hall.bars ? ' ' + W.tips : '') : hall.bars ? W.tips : '';
  const bars = box.querySelector('.hw-hall-bars');
  text(bars, advice);
  prop(bars, 'hidden', !advice);
  /* the measured good bar as label lines, one change each ("Everyone: Eat under 75%"): tuning is the way through (Tyler 2026-11-14) */
  rows(box.querySelector('.hw-hall-tips'), hall.bars || [], { key: (x) => x, build: () => element(box.ownerDocument, '<li class="hw-before-line"></li>'), patch: (li, x) => text(li, x) });
  /* this hero's bar, then every hero of this account in the same party (their bars are in this browser; another account's are not projected
     to it, CLAUDE.md §2 live-engine rule, so a seat of another account is the server's to flag: handed to Systems) */
  /* ...the bar in use only when it is the bar that walks in: with another setup picked under Go as, its own bar goes (hunts.js asChosen) and
     Before you go names that setup, so the bar on now is not judged here (the full-game audit's A26: one bar truth) */
  const short = hall.storeFloor && !v.other ? foodShortWords(cs, ctx, v, hall) : '';
  const food = box.querySelector('.hw-hall-food');
  text(food, short);
  prop(food, 'hidden', !short);
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
    text(a, alone ? partyNote(v.hunt) || W.warnAlone : '');
    text(warn.querySelector('.hw-hall-note-a'), hallWords(W.warn[0], hall));
    /* whose key it uses up: this hero's own, or the seat's the server names */
    const whose = keys > 0 || !seatKey ? W.whose.own : W.whose.seat.replace('{name}', seatKey.name || W.someHero);
    text(warn.querySelector('.hw-hall-note-b'), hallWords(W.warn[1], hall).replace('{whose}', whose));
    /* ...and when nobody walking in can take today's prize, its own label says so before the key is used */
    const none = !!st && st.left === 0;
    const nl = warn.querySelector('.hw-hall-note-loot');
    prop(nl, 'hidden', !none);
    text(nl, none ? W.loot.none : '');
    text(warn.querySelector('[data-hs-act="hall-go"]'), hallWords(W.confirm, hall));
    text(warn.querySelector('[data-hs-act="hall-no"]'), W.cancel);
  }
}

/* THE ONE WEAK-FOOD RULE at the hall's door (weak-food.js, the ground pages' own sentence): this hero's bar ("Slot 4: Salted Shrimp heals 72
   of 1,208 HP. Pick Salted Swordfish"), then each own hero of this party whose bar is under it, by name ("Bryony's slot 4: ..."), or ''. The
   hall's floor speaks in the hall's band (hallFloor), and ONCE PER SLOT (the 139 audit's B2): a slot this hero's Before you go already names for
   the ground ("Pick Salted Trout") is not named again here; the hall's "Requires ... on every bar" line above still says what the hall asks. */
function foodShortWords(cs, ctx, v, hall) {
  const out = [];
  const said = (p, who, ground) => {
    const lv = heroVitalsOf(p);
    return weakFoodWords('prep', notSaid(weakFoodOf(settingsOf(p), hallFloor(hall, lv.level)), ground), lv.hpMax, who);
  };
  const mine = said(cs, null, weakFoodOf(settingsOf(cs), groundFloor(v.hunt, heroVitalsOf(cs).level)));
  if (mine) out.push(mine);
  const party = v.party;
  const pid = party && party.id;
  const peers = pid && typeof ctx.peers === 'function' ? ctx.peers() : [];
  for (const p of peers || []) {
    if (!p || p === cs || (partyMembershipOf(p) || {}).id !== pid) continue;
    const theirs = said(p, nameOf(p) || BOSS_HALL_WORDS.someHero, null);
    if (theirs) out.push(theirs);
  }
  return out.join('. ');
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
  /* a key of this hero's own, or one the server says the open would take from another seat of its party */
  if (!hall || (keysOf(cs, hall) < 1 && !seatKeyOf(hallStateOf(cs, hall.id), partyMembershipOf(cs)))) return true;
  sc.warned = false;
  run(() => openHall(ctx.account, cs, hall.id), hallWords(BOSS_HALL_WORDS.opening, hall),
    (r) => hallWords(r && r.alone === false ? BOSS_HALL_WORDS.opened.party : BOSS_HALL_WORDS.opened.alone, hall))
    .then(() => repaint());
  return true;
}
