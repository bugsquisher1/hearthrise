// ════════════════════════════════════════════════════════════════════════
// src/shell/tower-words.js — THE BURNING TOWER AND THE HEARTH CHEST IN PLAIN WORDS, WITH THE SERVER'S OWN NUMBERS.
//
// PURE. Every sentence is a row of src/data/text/tower.js; this fills them from the `tower` section (src/session/tower-sections.js) or
// an answer's figures (src/session/tower-intents.js). A chance is the server's parts per million, written as a player reads a drop
// chance (render/format.js chance). A refusal with no number reads from src/data/refusal-words.js; src/shell/intent-words.js
// refusalText asks here first.
// ════════════════════════════════════════════════════════════════════════
import { t, hasText } from '../render/player-text.js?v=0.2.138';
import { chance, whole } from '../render/format.js?v=0.2.138';
import { itemName } from './widgets/bits.js?v=0.2.138';
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.138';
import { END_WORDS } from '../hunt-view/summary-model.js?v=0.2.138';

const VERBS = Object.freeze(['tower_start', 'chest_open', 'chest_stoke_default']);
const num = (v) => Number.isSafeInteger(v) && v >= 0;

/** The Havora window's Hearth tab press into the Tower window (hidden until the window shows it: the server's section). */
export const towerDoorHtml = () => '<p class="hv-tower" hidden>'
  + '<button type="button" class="hh-tool" data-hs-act="tower">' + esc(t('tower.havora_open')) + '</button></p>';

/** A chance in parts per million as a player reads it ("16%", "2.4%"), or '' when the server sent none. */
export const ppmWords = (ppm) => (num(ppm) ? chance(ppm / 1000000) : '');

/** "Bow", by the server's weapon family id; a family this client has no words for reads as its id spelled out. */
export const familyWord = (id) => (hasText('tower.family_' + id) ? t('tower.family_' + id) : String(id || '').replace(/_/g, ' '));

/** "Tower Keys", from a key family row: the server's own name for it (hr_chest_key_families.name), or its id spelled out when it sent
    none, so a family the server adds (the catacombs') draws its row with no words added here. */
export const keyFamilyWord = (f) => t('tower.key_family', { name: (f && (f.name || String(f.family || '').replace(/_/g, ' '))) || '' });

/** A place on the Tower's board as a player reads it: "#12", or "#1,000+" past the board's depth (the server's `over`); '' with none. */
export const rankWords = (p) => (!p ? '' : p.rank !== null ? t('tower.rank_n', { rank: whole(p.rank) }) : t('tower.rank_over', { rank: whole(p.over) }));

/** A multiplier in permille as a player reads it: 1700 -> "1.7", 2500 -> "2.5", 3000 -> "3". */
export const timesWords = (pm) => (num(pm) ? String(Math.round(pm / 100) / 10) : '');

/** A loot list, one label an item ("Tempering Salts x15", "Hearth Cinders x50"), from { item: qty } (the server's own row). */
export function lootList(items) {
  return Object.entries(items || {}).filter(([, q]) => num(q) && q > 0).map(([id, q]) => t('tower.loot_item', { item: itemName(id), count: whole(q) }));
}

/**
 * THE END CARD OF A CLIMB as label rows, or null for a card that is no climb. `tw` is the `tower` section (its `last` run is the
 * newest climb that ended, the server's floors, keys and the best before it); `card` the summary (summary-model.js: id, hunt, reason).
 * A climb never says "died": "Spat out" (the board's §1 "In the game's words"). The run's numbers only when the section's last run IS
 * this card's session; an older card says the bare labels.
 *   rows   [{ id, k, v, gold }]  New Best (+N) when the climb set the record (best_before), and then its place on the board (last.board:
 *                               Rank #N (+ heroes passed), Passed <the best of them>), Floors cleared, Spat out / Ended, XP lost, and
 *                               the keys the held limit kept back
 *   keys   [{ key, item, name, count, landing }]  every landing the run cleared mints its key, one entry a kind (the highest landing's)
 *   run    { start, top, best, before } | null   the climb drawn on the tower; `before` the old best when it set a new one
 */
export function climbEnd(tw, card, towerHunt) {
  if (!card || card.hunt !== towerHunt) return null;
  const run = tw && tw.last && tw.last.session === String(card.id).toLowerCase() ? tw.last : null;
  const rows = [];
  const newBest = !!run && run.top !== null && run.bestBefore !== null && run.top > run.bestBefore;
  if (newBest) rows.push({ id: 'best', k: t('tower.best_head'), v: t('tower.end_best', { floor: whole(run.top), plus: whole(run.top - run.bestBefore) }), gold: true });
  /* the record's place on the board when the climb ended (the server's last.board): Rank (+ the heroes it passed), and the best of them */
  const place = newBest ? run.board : null;
  if (place) rows.push({ id: 'rank', k: t('tower.rank'), v: place.passed > 0 ? t('tower.end_rank_up', { rank: rankWords(place), plus: whole(place.passed) }) : rankWords(place) });
  if (place && place.passedName) rows.push({ id: 'passed', k: t('tower.end_passed'), v: place.passedName });
  if (run) rows.push({ id: 'cleared', k: t('tower.end_cleared'), v: run.top !== null ? t('tower.end_climbed', { from: run.start, to: run.top }) : t('tower.none') });
  /* the floor it ended on: the one after the last it cleared, or the one it started on */
  const on = run ? (run.top !== null ? run.top + 1 : run.start) : null;
  if (card.reason === 'died') rows.push({ id: 'out', k: t('tower.end_spat'), v: on !== null ? t('tower.start_floor', { floor: on }) : '' });
  else if (card.reason === 'floor_time') rows.push({ id: 'out', k: t('tower.end_ended'), v: t('tower.end_time') });
  /* every other end as the hunt card's own label (QA gate 2026-11-17: a party member leaving said nothing), a seat's fall in the Tower's words */
  else if (card.reason === 'party_member_died') rows.push({ id: 'out', k: t('tower.end_ended'), v: t('tower.end_member_out') });
  else if (typeof card.reason === 'string' && Object.hasOwn(END_WORDS, card.reason)) rows.push({ id: 'out', k: t('tower.end_ended'), v: END_WORDS[card.reason] });
  /* the mode's own death loss, the server's: none in the Tower */
  if (card.reason === 'died' && tw && tw.pays && tw.pays.deathLossPm === 0) rows.push({ id: 'xp', k: t('tower.end_xp'), v: t('tower.none') });
  /* the keys the family's held limit kept back (the mint's tower_key_withheld rows): the card says why they did not drop */
  if (run && run.withheld > 0) rows.push({ id: 'withheld', k: t('tower.end_withheld'), v: t('tower.end_not_dropped', { count: run.withheld }) });
  /* every landing a run clears mints its key (no weekly earn cap, Tyler 2026-11-16): one entry a kind */
  const keys = [];
  for (const m of run ? run.keys : []) {
    const k = tw.chest ? tw.chest.keys.find((x) => x.key === m.key) : null;
    if (!k) continue;
    const had = keys.find((x) => x.key === k.key);
    if (had) { had.count++; had.landing = Math.max(had.landing, m.landing); } else keys.push({ key: k.key, item: k.item, name: k.name || itemName(k.item), count: 1, landing: m.landing });
  }
  return { rows, keys, run: run ? { start: run.start, top: run.top, best: newBest, before: newBest ? run.bestBefore : null } : null };
}

/**
 * A Tower refusal that carries the server's numbers or needs the Tower's own words, as a label, or null (the shared table says it).
 * week_limit { family, used, limit } is the key family's week of chests (2027-04-27-tower-chest.sql, Tyler 2026-11-16).
 */
export function towerRefusal(r) {
  if (!r || !VERBS.includes(r.verb)) return null;
  if (r.error === 'bad_landing') return t('tower.bad_floor');
  /* the door's Level (2027-05-05-entry-gates.sql): the server's need, and for a seat its name and Level */
  if (r.error === 'tower_level' && num(r.need)) return t('tower.off_level', { level: r.need });
  if (r.error === 'tower_party_level' && r.who && num(r.need) && num(r.have)) return t('tower.refused_seat_level', { name: r.who, level: r.have, need: r.need });
  if (r.error === 'party_hunting') return t('tower.off_party_hunting');
  if (r.error === 'hunt_open' || r.error === 'activity_running' || r.error === 'in_hunt') return t('tower.off_hunting');
  if (r.error === 'no_key') return t('tower.off_no_key');
  if (r.error === 'week_limit' && num(r.limit)) return t('tower.off_week', { max: r.limit });
  if (r.error === 'chest_not_ready') return t('tower.not_ready');
  return null;
}
