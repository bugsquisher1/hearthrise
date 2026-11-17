// ════════════════════════════════════════════════════════════════════════
// src/shell/faction-words.js — THE FACTIONS IN PLAIN WORDS, WITH THE SERVER'S OWN NUMBERS.
//
// PURE. Every sentence is a row of src/data/text/factions.js, every name a row of src/data/text/people.js; this fills them from the
// `factions` section (src/session/faction-sections.js) or a refusal's figures (src/session/faction-intents.js). A clock is the
// server's instant against the server's clock as the session measures it (display only: the server refuses an early press).
// A refusal with no number reads from src/data/refusal-words.js; src/shell/intent-words.js refusalText asks here first.
// ════════════════════════════════════════════════════════════════════════
import { t, hasText } from '../render/player-text.js?v=0.2.137';
import { hoursWords } from '../render/format.js?v=0.2.137';
import { factionOf } from '../session/faction-sections.js?v=0.2.137';

const DAY_MS = 86400000;
const VERBS = Object.freeze(['faction_join', 'faction_swap_start', 'faction_swap_finish', 'faction_outfit_claim']);
const num = (v) => Number.isSafeInteger(v) && v >= 0;

/** The names a line may say, from the one row each. */
export const people = () => ({ holly: t('people.holly'), venn: t('people.venn'), harry: t('people.harry'), rowe: t('people.rowe') });

/** A side's name ("First Flame") by the server's id; an id this client doesn't know reads as another side, never as a code. */
export const sideName = (id) => (hasText('factions.side_' + id) ? t('factions.side_' + id) : t('factions.side_unknown'));

/** A side's motto, or '' for a side this client has no words for. */
export const sideMotto = (id) => (hasText('factions.motto_' + id) ? t('factions.motto_' + id) : '');

/* Who speaks for a side, by its id: the First Flame's face is Holly, the Last Ember's is Venn. */
const FACES = Object.freeze({ first_flame: 'holly', last_ember: 'venn' });
/** The person a hero talks to about a side ({ key, name }), or null. */
export function faceOf(side) {
  const key = FACES[side];
  return key ? { key, name: people()[key] } : null;
}

/** What the side's face says to a hero joining (or swapping to) it, or ''. */
export function said(side, why) {
  const f = faceOf(side);
  if (!f) return '';
  if (f.key === 'holly') return why === 'swap' ? t('factions.said_holly_swap') : t('factions.said_holly_join', people());
  return why === 'swap' ? t('factions.said_venn_swap') : t('factions.said_venn_join', people());
}

/** A piece's name by the server's id. */
export function pieceName(id) {
  const p = people();
  switch (id) {
    case 'flamebearer': return t('factions.piece_flamebearer');
    case 'flamebearer_shield': return t('factions.piece_flamebearer_shield');
    case 'flamebearer_light': return t('factions.piece_flamebearer_light', { holly: p.holly });
    case 'emberkeeper': return t('factions.piece_emberkeeper');
    case 'emberkeeper_lantern': return t('factions.piece_emberkeeper_lantern', { harry: p.harry });
    case 'emberkeeper_coal': return t('factions.piece_emberkeeper_coal');
    default: return t('factions.piece_unknown');
  }
}

/** A span of hunting time: "12 h", "4 h 10 m", "45 m", and "0 h" under a minute. */
export const spanWords = (ms) => (ms >= 60000 ? hoursWords(ms) : t('factions.no_time'));

/** A wait as a player reads it: whole days from a day up ("3 days"), else hours and minutes. */
export const waitWords = (ms) => (ms >= DAY_MS ? t('factions.days', { count: Math.floor(ms / DAY_MS) }) : spanWords(ms));

/** "Next swap: in 3 days" / "Next swap: in 4 h 10 m" / "Next swap: ready", from the server's instant; '' with no member. */
export function nextSwapWords(f, serverNowMs) {
  if (!f || !f.side || f.swapReadyAt === null) return '';
  const left = f.swapReadyAt - serverNowMs;
  if (!(left > 0)) return t('factions.next_swap_ready');
  /* whole days rounded UP: the page never promises a swap before the server allows one */
  return left >= DAY_MS ? t('factions.next_swap_days', { count: Math.ceil(left / DAY_MS) }) : t('factions.next_swap_soon', { time: spanWords(left) });
}

/** Is the hero's cooldown over, by the server's instant against the server's clock? Display only. */
export const swapReady = (f, serverNowMs) => !!f && !!f.side && !f.swap && f.swapReadyAt !== null && serverNowMs >= f.swapReadyAt;

/** "Swap: 4 h 10 m left" / "Swap: ready to finish", from the server's credited time; '' with no swap. */
export function swapLeftWords(f) {
  if (!f || !f.swap) return '';
  const left = f.swap.needMs - f.swap.ms;
  return left > 0 ? t('factions.swap_left', { time: spanWords(left) }) : t('factions.swap_done');
}

/** The server's clock as the session measures it (display only), else the page's. */
export const serverNowOf = (cs) => { const v = cs && typeof cs.serverNow === 'function' ? cs.serverNow() : null; return Number.isFinite(v) ? v : Date.now(); };

/** A faction refusal that carries the server's numbers, in a sentence, or null (the shared table then says it). */
export function factionRefusal(r, cs) {
  if (!r || !VERBS.includes(r.verb)) return null;
  if (r.error === 'standing_short' && num(r.needMs) && num(r.haveMs)) {
    const f = factionOf(cs);
    const piece = f && f.pieces.find((p) => p.id === r.piece);
    return t('factions.short_standing', { piece: pieceName(r.piece), need: spanWords(r.needMs), have: spanWords(r.haveMs), side: sideName(piece ? piece.side : null) });
  }
  if (r.error === 'swap_short' && num(r.needMs) && num(r.haveMs)) return t('factions.short_swap', { need: spanWords(r.needMs), have: spanWords(r.haveMs) });
  if (r.error === 'swap_cooldown' && Number.isFinite(r.readyAt)) return t('factions.cooldown', { time: waitWords(Math.max(60000, r.readyAt - serverNowOf(cs))) });
  return null;
}
