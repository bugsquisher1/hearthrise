// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/boss-call-pane.js — CALL OUT ON A GROUND'S PAGE (src/data/boss-calls.js; Tyler 2026-11-04, the series 2026-11-14).
//
// One section under Go as, on a ground whose boss can be called: what a fight costs, the press, then the warning with the
// SLIDER (how many fights in a row) and its one confirm (the 11-04 risk ruling: a warned choice, one confirm press).
// EVERY NUMBER IS THE SERVER'S QUOTE (hr_boss_call_view, read when the page opens on it; CLAUDE.md §6): one fight's stamina and
// gold, its time limit, the slider's top, what the room's stamina and gold cover right now, and the picked count's total, which
// is the quote's own entry for that count (`totals`), never a sum made here. The only number this pane holds is the count the
// slider picked, sent as it is; the server bounds it and compares the price (a stale one only earns quote_changed). The press
// stays off until a quote says yes, and says why when it doesn't. hunts.js owns the window, its status line and the run of the press.
// WHAT A WIN EARNS AND WHAT THE ROOM RISKS, BEFORE THE PRESS (audit F24, 2026-11-15): the section lists what a win can drop, his table with
// each row's odds as the quote hands them (`drops`; this file never reads monsters.js for it), and one line for each danger the server read
// of the room (`danger`: a hero under his Level, no tank, no healer, a bar with no food). Food, a healer, a tank: never Challenge.
// A LIVE EVENT (Open Halls, 2027-03-22-live-events.sql §4) moves only the server's quote: a fight that costs no gold reads the
// no-gold labels, with the event's line before them (live-events-view.js callEventWords). It waives gold only: stamina stays.
// The event coming on or going off on the server's clock reads the quote again (feeKey).
// NATURAL WINS BEFORE THE CALL (2027-05-05-entry-gates.sql, Tyler 2026-11-18): "Rat King wins: 2/10" and each seat still short, from the quote's
// `wins`, or before a quote and after a reload from the envelope's `entry_gates` section; a gate the server says is shut holds the press off.
// ════════════════════════════════════════════════════════════════════════
import { text, prop, cls, attr, rows, element } from '../../render/paint.js';
import { itemName, monsterName } from '../widgets/bits.js';
import { whole } from '../../render/format.js';
import { BOSS_CALL_RULES, BOSS_CALL_WORDS, callFromGround, isGuarded } from '../../data/boss-calls.js';
import { MONSTERS } from '../../data/monsters.js';
import { callOut } from '../../session/boss-intents.js';
import { readCall } from '../../session/boss-quote.js';
import { callGateOf } from '../../session/gate-sections.js';
import { callEventWords, feeKey } from '../live-events-view.js';
import { partyNote } from '../hunt-list.js';

const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { call: null, key: '', quote: null, asking: false, warned: false, fights: 1 }; SCRATCH.set(cs, s); } return s; };
/* A quote is read again on a new ground or a new party, or once this old: the room's stamina and gold may have moved on another hero. */
const QUOTE_STANDS_MS = 60000;
const S = BOSS_CALL_WORDS.series;

/* Milliseconds as minutes, the way a label says them: 2, 2.5, 10. */
const minutesOf = (ms) => { const m = ms / 60000; return Number.isInteger(m) ? String(m) : (Math.round(m * 10) / 10).toFixed(1); };

/**
 * {Boss}, {boss} and {guard} (his adds shield him, or nothing) from the call; every number from `x`, the server's:
 * { fee, staminaMs, limitMs, n, stamina (ms), gold, covers, max, who, heroes, have, need }. A number the server has not said is left unfilled by the caller's choice of line.
 * @param {string} line
 * @param {{Boss: string, boss: string, monster: string, of: string}} call
 * @param {{fee?: number, staminaMs?: number, limitMs?: number, n?: number, stamina?: number, gold?: number, covers?: number, max?: number, who?: string|null, heroes?: number, have?: number, need?: number}} [x]
 */
export function callWords(line, call, x = {}) {
  const fill = (s, k, v) => (v === undefined || v === null ? s : s.replace('{' + k + '}', v));
  let s = line.replace('{Boss}', call.Boss).replace('{boss}', call.boss).replace('{guard}', isGuarded(MONSTERS[call.monster]) ? BOSS_CALL_WORDS.warnGuard : '');
  /* the natural wins (2027-05-05-entry-gates.sql): the boss by his own name ("Rat King"), the server's count and number */
  s = s.replace('{name}', monsterName(call.of));
  s = fill(s, 'need', Number.isFinite(x.need) ? whole(x.need) : null);
  s = fill(s, 'have', Number.isFinite(x.have) ? whole(x.have) : null);
  s = fill(s, 'fee', Number.isFinite(x.fee) ? whole(x.fee) : null);
  s = fill(s, 'staminaMin', Number.isFinite(x.staminaMs) ? minutesOf(x.staminaMs) : null);
  s = fill(s, 'minutes', Number.isFinite(x.limitMs) ? minutesOf(x.limitMs) : null);
  s = fill(s, 'n', Number.isFinite(x.n) ? String(x.n) : null);
  s = fill(s, 'stamina', Number.isFinite(x.stamina) ? minutesOf(x.stamina) : null);
  s = fill(s, 'gold', Number.isFinite(x.gold) ? whole(x.gold) : null);
  s = fill(s, 'covers', Number.isFinite(x.covers) ? String(x.covers) : null);
  s = fill(s, 'max', Number.isFinite(x.max) ? String(x.max) : null);
  s = fill(s, 'heroes', Number.isFinite(x.heroes) ? String(x.heroes) : null);
  return fill(s, 'who', typeof x.who === 'string' && x.who ? x.who : null);
}
/* The natural wins of quote `q` for callWords: its number, and the count of `who` (a seat short of it, by the server's name) or this hero's. */
function winsFacts(q, who) {
  if (!q || !q.wins) return {};
  const seat = who ? q.wins.short.find((s) => s.name === who) : null;
  return { need: q.wins.need, ...(who ? (seat ? { have: seat.have } : {}) : { have: q.wins.have }) };
}
/* One fight's numbers of quote `q`, for callWords (and the wins its `why` names). */
const fightOf = (q) => (q ? { fee: q.price, staminaMs: q.staminaMs, limitMs: q.limitMs, max: q.maxFights, who: q.who, heroes: q.heroes,
  ...winsFacts(q, q.why === 'party_wins' ? q.who : null) } : {});

/** The words for a refusal of this call (the designer's table), or null: the status line's general reader takes the rest.
    `r` the refusal (its own `quote`, `who` and `max` are the server's); a line whose number the server did not say is not used. */
export function callRefusal(r, call) {
  const line = r && Object.hasOwn(BOSS_CALL_WORDS.refused, r.error) ? BOSS_CALL_WORDS.refused[r.error] : null;
  if (!line) return null;
  const said = callWords(line, call, { ...fightOf(r.quote || null), ...(r.who ? { who: r.who } : {}), ...(Number.isFinite(r.max) ? { max: r.max } : {}),
    ...winsFacts(r.quote || null, r.error === 'party_wins' ? r.who || (r.quote && r.quote.who) : null) });
  return /\{[a-zA-Z]+\}/.test(said) ? null : said;
}

/* A row's odds as words: the server's parts per million as a percent of at most two decimals (1,000,000 is every win). */
const oddsWords = (ppm) => (ppm >= 1000000 ? S.odds.always : S.odds.pct.replace('{pct}', String(Math.round(ppm / 100) / 100)));

/** THE DANGER LINES for quote `q` (its `danger`, the server's reading of the room), in the order a player fixes them: Level, a tank, a healer, food. */
function dangerLines(q, call) {
  const d = q && q.danger;
  if (!d) return [];
  const W = BOSS_CALL_WORDS.danger, out = [];
  if (d.under > 0 && d.lowest !== null) out.push(W.under.replace('{Boss}', call.Boss).replace('{bossLevel}', String(d.bossLevel)).replace('{lowest}', String(d.lowest)));
  if (!d.tank) out.push(W.tank);
  if (!d.healer) out.push(W.healer);
  if (d.noFood > 0) out.push(d.noFood === 1 ? W.food.one : W.food.other.replace('{n}', String(d.noFood)));
  return out;
}

/* Why the press is off, beside it (the quote's own `why`, before anything was pressed), or null for a code with no line or a number the server did not say. */
function cantWords(q, call) {
  const line = Object.hasOwn(BOSS_CALL_WORDS.cant, q.why) ? BOSS_CALL_WORDS.cant[q.why] : null;
  const said = line ? callWords(line, call, fightOf(q)) : null;
  return said && !/\{[a-zA-Z]+\}/.test(said) ? said : null;
}

/** THE NATURAL WINS LINES (2027-05-05-entry-gates.sql, Tyler 2026-11-18): the server's count, from quote `q` or else the envelope's gate (before a
    quote and after a reload): this hero's own while it falls short ("Rat King wins: 2/10"), then each other seat that does, but the one the quote's
    own line already names. [] when the server says nothing or nobody falls short. */
function winsLines(q, gate, call) {
  const w = q && q.wins ? q.wins : gate || null;
  if (!w) return [];
  const named = q && q.why === 'party_wins' ? q.who : null;
  const out = w.have < w.need ? [callWords(BOSS_CALL_WORDS.wins, call, { have: w.have, need: w.need })] : [];
  for (const s of w.short) if (s.name !== named) out.push(callWords(BOSS_CALL_WORDS.cant.party_wins, call, { who: s.name, have: s.have, need: w.need }));
  return out;
}

/* How many fights the slider holds for quote `q`: the pick, inside the server's range. */
const pickOf = (sc, q) => Math.max(1, Math.min(q ? q.maxFights : 1, Number.isInteger(sc.fights) ? sc.fights : 1));

export function callHtml() {
  return '<section class="hw-hd-call" aria-label="Call out" hidden><h4 class="hw-hd-h">Call out</h4>'
    + '<p class="hw-call-line"></p><ul class="hw-before hw-call-wins"></ul>'
    /* WHAT A WIN CAN DROP (the server's list and odds) and THE DANGER (the server's reading of the room): both stand above the press, so they are read before it */
    + '<p class="hw-call-drops-h" hidden></p><ul class="hw-call-drops"></ul>'
    + '<ul class="hw-before hw-call-danger" aria-label="' + BOSS_CALL_WORDS.danger.label + '"></ul>'
    + '<button type="button" class="hh-tool hw-call-press" data-hs-act="call-warn"></button>'
    + '<div class="hw-confirm hw-call-warn" role="group" aria-label="Confirm"><p class="hw-confirm-q"></p><p class="hw-confirm-note hw-call-note-alone" hidden></p><p class="hw-confirm-note hw-call-note-a"></p>'
    /* THE SLIDER: how many fights in a row, 1 to the server's top. It answers as it moves (hunts.js names `input` in its events) and sends nothing until the confirm. */
    + '<label class="hw-call-pick"><span class="hw-call-pick-l"></span>'
    + '<input type="range" class="hw-call-n" min="1" max="1" step="1" value="1" data-hs-act="call-fights">'
    + '<b class="hw-call-count"></b></label>'
    + '<ul class="hw-call-facts"><li class="hw-call-f-stamina"></li><li class="hw-call-f-cost"></li><li class="hw-call-f-limit"></li><li class="hw-call-f-pay"></li>'
    + '<li class="hw-call-f-total"></li><li class="hw-call-f-covers"></li><li class="hw-call-f-heroes" hidden></li><li class="hw-call-f-ends"></li></ul>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary is-on" data-hs-act="call-go"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="call-no"></button></div></div></section>';
}

/** Write the section for ground `v.hunt`; asks the server once when the page opens on it. */
export function patchCall(det, ctx, v) {
  const box = det.querySelector('.hw-hd-call');
  const call = callFromGround(v.hunt);
  prop(box, 'hidden', !call);
  if (!call) return;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  /* A fee event coming on or going off moves the price: the key changes with it, so the quote is read again at once. */
  const key = call.id + ':' + (v.party ? v.party.id + ':' + v.party.seats.length : '') + ':' + feeKey(cs, call);
  if (sc.key !== key) { sc.key = key; sc.quote = null; sc.at = 0; sc.warned = false; sc.fights = 1; }
  sc.call = call;
  const now = Date.now();
  /* One ask a minute, answered or not: a server that says nothing is not asked again on every repaint its own answer causes. */
  if (!sc.asking && !v.now && now - sc.at > QUOTE_STANDS_MS) {
    sc.asking = true;
    sc.at = now;
    const asked = key;
    readCall(ctx.account, cs, call.id).then((q) => { if (sc.key === asked) sc.quote = q; }, () => null)
      .finally(() => { sc.asking = false; ctx.refresh('hunts'); });
  }
  const q = sc.quote;
  /* the natural wins as the envelope states them (entry_gates.calls): a gate the server says is shut holds the press off whatever an older quote said */
  const gate = callGateOf(cs, call.id);
  const open = !!q && q.available && !v.now && !v.pending && !(gate && !gate.ok);
  const one = fightOf(q);
  const free = !!q && q.price === 0;
  /* The quote's event, when it set the price (null: today's words). Its line goes first; what a fight costs still follows it. */
  const ev = v.now ? null : callEventWords(cs, call, q);
  const said = v.now ? BOSS_CALL_WORDS.hunting : !q ? BOSS_CALL_WORDS.noQuote
    : q.available ? callWords(free ? S.eachFree : S.each, call, one) : (cantWords(q, call) || BOSS_CALL_WORDS.noQuote);
  /* No quote yet: the press names him, off, until the server has said; off, it always says why, beside it. */
  text(box.querySelector('.hw-call-line'), ev && ev.line ? ev.line + ' ' + said : said);
  /* the natural wins still owed, one red line a hero, under the line that says why the press is off */
  rows(box.querySelector('.hw-call-wins'), v.now ? [] : winsLines(q, gate, call).map((line, i) => ({ k: i + ':' + line, line })), { key: (x) => x.k,
    build: () => element(box.ownerDocument, '<li class="hw-before-line is-short"></li>'), patch: (li, x) => text(li, x.line) });
  /* what a win can drop: the quote's rows, in its order, each with its odds; nothing while the server has not said */
  const drops = !v.now && q ? q.drops : [];
  const head = box.querySelector('.hw-call-drops-h');
  text(head, drops.length ? S.dropsHead : '');
  prop(head, 'hidden', !drops.length);
  rows(box.querySelector('.hw-call-drops'), drops, { key: (x) => x.item,
    build: () => element(box.ownerDocument, '<li class="hw-call-drop"><b></b><span></span></li>'),
    patch: (li, x) => { text(li.querySelector('b'), itemName(x.item)); text(li.querySelector('span'), oddsWords(x.ppm)); } });
  /* the danger: one red line a fact, above the press and still there while the slider shows */
  rows(box.querySelector('.hw-call-danger'), v.now ? [] : dangerLines(q, call), { key: (x) => x,
    build: () => element(box.ownerDocument, '<li class="hw-before-line is-short"></li>'), patch: (li, x) => text(li, x) });
  const press = box.querySelector('.hw-call-press');
  text(press, callWords(BOSS_CALL_WORDS.press, call));
  prop(press, 'disabled', !open);
  prop(press, 'hidden', sc.warned && open);
  const warn = box.querySelector('.hw-call-warn');
  cls(warn, 'is-on', sc.warned && open);
  if (sc.warned && open) {
    const n = pickOf(sc, q);
    /* the picked count's bill: the server's own entry for it */
    const bill = { ...one, n, stamina: q.totals.staminaMs[n - 1], gold: q.totals.fee[n - 1], covers: q.covers };
    text(warn.querySelector('.hw-confirm-q'), callWords(BOSS_CALL_WORDS.warnTitle, call));
    /* ALONE, A WARNING, NEVER A REFUSAL (designer's ruling 2, 2026-11-10): one more line, first, when the server says the room holds this hero only. */
    const alone = warn.querySelector('.hw-call-note-alone');
    prop(alone, 'hidden', !q.alone);
    text(alone, q.alone ? partyNote(call.from) || BOSS_CALL_WORDS.warnAlone : '');
    text(warn.querySelector('.hw-call-note-a'), callWords(BOSS_CALL_WORDS.warn[0], call));
    text(warn.querySelector('.hw-call-pick-l'), S.pick);
    const slider = warn.querySelector('.hw-call-n');
    attr(slider, 'max', String(q.maxFights));
    attr(slider, 'aria-label', S.pick);
    attr(slider, 'aria-valuetext', callWords(S.fights, call, bill));
    if (Number(slider.value) !== n) slider.value = String(n);
    text(warn.querySelector('.hw-call-count'), callWords(S.fights, call, bill));
    text(warn.querySelector('.hw-call-f-stamina'), callWords(S.stamina, call, bill));
    text(warn.querySelector('.hw-call-f-cost'), callWords(free ? S.costFree : S.cost, call, bill));
    text(warn.querySelector('.hw-call-f-limit'), callWords(S.limit, call, bill));
    text(warn.querySelector('.hw-call-f-pay'), S.drops + '. ' + S.none + '.');
    text(warn.querySelector('.hw-call-f-total'), callWords(bill.gold === 0 ? S.totalFree : S.total, call, bill));
    text(warn.querySelector('.hw-call-f-covers'), callWords(q.covers === 0 ? S.covers.none : q.covers === 1 ? S.covers.one : S.covers.other, call, bill));
    const heroes = warn.querySelector('.hw-call-f-heroes');
    prop(heroes, 'hidden', !(q.heroes > 1));
    text(heroes, q.heroes > 1 ? callWords(S.heroes, call, bill) : '');
    text(warn.querySelector('.hw-call-f-ends'), S.ends);
    text(warn.querySelector('[data-hs-act="call-go"]'), callWords(n === 1 ? S.confirmOne : S.confirm, call, bill));
    text(warn.querySelector('[data-hs-act="call-no"]'), BOSS_CALL_WORDS.cancel);
  }
}

/**
 * The section's presses. `run(send, busy, done)` is hunts.js's: the status line, the setup Go as chose, the close on a hunt under way.
 * `el` the control pressed (the slider's own value is the count). Answers true when the action was this section's.
 */
export function actCall(ctx, action, repaint, run, el) {
  if (action !== 'call-warn' && action !== 'call-no' && action !== 'call-go' && action !== 'call-fights') return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  if (action === 'call-warn') { sc.warned = true; repaint(); return true; }
  if (action === 'call-no') { sc.warned = false; repaint(); return true; }
  if (action === 'call-fights') {
    /* the slider's pick: display scratch until the confirm sends it; held to the server's range here, bounded again there */
    const n = el ? Math.floor(Number(el.value)) : NaN;
    if (Number.isFinite(n)) { sc.fights = Math.max(1, Math.min(sc.quote ? sc.quote.maxFights : 1, n)); repaint(); }
    return true;
  }
  const { call, quote } = sc;
  if (!call || !quote || !quote.available) return true;
  const n = pickOf(sc, quote);
  sc.warned = false;
  const answered = quote.alone ? BOSS_CALL_WORDS.answered.alone : BOSS_CALL_WORDS.answered.party;
  run(() => callOut(ctx.account, cs, call.id, n, quote.price), callWords(BOSS_CALL_WORDS.calling, call), () => callWords(answered, call))
    .then((r) => { if (r && r.quote) sc.quote = r.quote; else sc.at = 0; repaint(); });
  return true;
}
