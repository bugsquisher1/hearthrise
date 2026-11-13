// ════════════════════════════════════════════════════════════════════════
// src/shell/town-criers.js — THE TOWN CRIERS' CLOCK: WHO CALLS OUT WHAT, AND WHEN.
//
// Tyler 2026-11-11: NPCs that yell tips in Local chat periodically. The rows are
// src/data/town-criers.js; the facts a line keys on are the server's projection
// (src/session/crier-facts.js). While the viewed hero stands in town and the
// page is showing, the clock looks every tickMs and, once the gaps have passed
// (CRIER_CLOCK and the crier's own everyMs), puts ONE line into the chat's Local
// tab as a named speaker with a link that opens the place (src/shell/goto.js).
// Never two in a row from the same crier; the line said the fewest times goes
// first. Quiet while a hunt is viewed, and quiet when "Show tips" is off
// (src/data/tips.js, the player's switch for every hero). A line is local and
// display-only: it is never sent to the server and no other player sees it
// (ChatStore.tell), and nothing here gates or spends anything.
//   pickCry(criers, facts, clock, now)   the pure pick: { crier, line } or null
//   crierTarget(crier, line, fact)       the link's goto target, from the stand
//   mountTownCriers(win, account, o)     the clock; o.timers / o.now / o.hidden for a test
// ════════════════════════════════════════════════════════════════════════
import { TOWN_CRIERS, CRIER_CLOCK } from '../data/town-criers.js?v=0.2.128';
import { STATION_BY_ID } from '../data/world/stations.js?v=0.2.128';
import { TIPS } from '../data/tips.js?v=0.2.128';
import { crierFactsOf } from '../session/crier-facts.js?v=0.2.128';
import { huntOf } from '../session/hunt-sections.js?v=0.2.128';
import { switchOn } from '../session/player-switch.js?v=0.2.128';
import { npcLine } from '../social/chat-lines.js?v=0.2.128';
import { t } from '../render/player-text.js?v=0.2.128';

/** The goto target of a line: its `at` station (else the crier's stand), on its tab (`tab`, or the fact's `tabOf` field). */
export function crierTarget(crier, line, fact) {
  const st = STATION_BY_ID[line.at || crier.stand];
  const opens = st && st.opens;
  if (!opens) return null;
  const tab = line.tab || (line.tabOf && fact && typeof fact === 'object' ? fact[line.tabOf] || null : null);
  if (opens.open === 'skill') return { win: 'skills-trade', tab: opens.skill, find: null };
  return opens.open === 'window' ? { win: opens.window, tab, find: null } : null;
}

/**
 * The pure pick. `clock`: { lastCrier, lastAt, saidAt: { crierId: ms }, said: { 'crier/line': n }, started: ms the hero was
 * first seen in town }. Null when nothing is due or no line fits the facts.
 */
export function pickCry(criers, facts, clock, now) {
  if (!facts) return null;
  const gap = clock.lastAt === null ? CRIER_CLOCK.firstMs : CRIER_CLOCK.everyMs;
  if (now - (clock.lastAt === null ? clock.started : clock.lastAt) < gap) return null;
  /* the turn goes round from the crier after the last one, so the last one is last in line */
  const from = criers.findIndex((c) => c.id === clock.lastCrier);
  const turn = from < 0 ? criers.slice() : criers.slice(from + 1).concat(criers.slice(0, from + 1));
  const fits = [];
  for (const crier of turn) {
    const at = clock.saidAt[crier.id];
    if (Number.isFinite(at) && now - at < crier.everyMs) continue;
    for (const line of crier.lines) {
      const fact = facts[line.when];
      if (fact) fits.push({ crier, line, fact, n: clock.said[crier.id + '/' + line.id] || 0 });
    }
  }
  /* never two in a row from the same crier while another has a line; then the line said the fewest times, the turn's order breaking a tie */
  const others = fits.filter((f) => f.crier.id !== clock.lastCrier);
  const pool = others.length ? others : fits;
  let best = null;
  for (const f of pool) if (!best || f.n < best.n) best = f;
  return best ? { crier: best.crier, line: best.line, fact: best.fact } : null;
}

/** The chat line for a pick: the words from the text home, the link to the place. `at`: the player's clock (ms). */
function cryLine(pick, at, n, o = {}) {
  const vars = pick.fact && typeof pick.fact === 'object' ? pick.fact : undefined;
  /** @type {{ text: string, goto?: any }[]} */
  const parts = [{ text: t('criers.say_' + pick.line.id, vars) }];
  const target = crierTarget(pick.crier, pick.line, pick.fact);
  if (target) parts.push({ text: ' ' }, { text: t('criers.go_' + pick.line.id, vars), goto: target });
  return npcLine('crier:' + pick.crier.id + ':' + pick.line.id + ':' + n, pick.crier.name, parts, at, o);
}

/**
 * Mount the clock once per signed-in page. `o.timers`: { setTimer, clearTimer } (setInterval's shape), `o.now` the clock (ms),
 * `o.hidden` whether the page is hidden. @returns {{ destroy(): void, tick?: () => void }}
 */
/** @param {*} win @param {*} account @param {{ timers?: { setTimer?: Function, clearTimer?: Function }, now?: () => number, hidden?: () => boolean }} [o] */
export function mountTownCriers(win, account, o = {}) {
  const set = o.timers && o.timers.setTimer ? o.timers.setTimer : (fn, ms) => win.setInterval(fn, ms);
  const clear = o.timers && o.timers.clearTimer ? o.timers.clearTimer : (h) => win.clearInterval(h);
  const now = o.now || (() => Date.now());
  const hidden = o.hidden || (() => !!win.document && win.document.hidden === true);
  const clock = { lastCrier: null, lastAt: null, saidAt: {}, said: {}, started: null };
  let n = 0;
  const viewed = () => (account.viewed !== null && account.viewed !== undefined ? account.character(account.viewed) : null);
  function tick() {
    const cs = viewed();
    const h = cs ? huntOf(cs) : null;
    /* in town, on a showing page, with tips on: else the clock holds, and a hero back from a hunt starts the first gap again */
    if (!cs || !cs.record || hidden() || (h && !h.ended) || !switchOn(account.characters(), TIPS)) { clock.started = null; return; }
    const at = now();
    if (clock.started === null) clock.started = at;
    const social = account.social;
    if (!social || !social.chat || typeof social.chat.tell !== 'function') return;
    const pick = pickCry(TOWN_CRIERS, crierFactsOf(cs), clock, at);
    if (!pick) return;
    clock.lastCrier = pick.crier.id;
    clock.lastAt = at;
    clock.saidAt[pick.crier.id] = at;
    const key = pick.crier.id + '/' + pick.line.id;
    clock.said[key] = (clock.said[key] || 0) + 1;
    social.chat.tell('local', cryLine(pick, at, ++n));
  }
  const timer = set(tick, CRIER_CLOCK.tickMs);
  return { destroy() { clear(timer); }, tick };
}
