// ════════════════════════════════════════════════════════════════════════
// src/shell/death-popup.js — THE DEATH POPUP: WHEN IT OPENS, AND WHAT IT SAYS.
//
// Tyler 2026-10-19: a death opens a centred popup (the `death` modal row,
// src/data/shell-windows.js; windows/death.js draws it), not a side alert.
// Every fact is the server's: the death row (`death_log`, hr_death_log_view):
// the ground, the killer, the XP the settle debited and the XP a Blessing kept
// (2026-11-07-death-popup-blessing.sql), the Level it took and how many Blessings
// it used (2027-03-25-death-share.sql); "what happened" is the hunt summary's
// death explanation (summary-recorder.js), made from the server's own events
// while the hunt was watched. Nothing is counted or priced in the browser, and
// a number the server did not send is never shown.
//
// WHEN: the character's hunt section says it ended `died`, and the newest death
// row is that session's. Once dismissed (OK, Hunt summary or the close) the
// session's id `died:<session>` is in the residue's `alerts.seen` (display
// state), so a reload or another device never shows the same death twice; the
// alert centre (alerts.js) reads the same id, so a seen death never comes back
// as a side line. A party member's death stays an alert line.
// ════════════════════════════════════════════════════════════════════════
import { ALERTS_SEEN_MAX } from '../session/residue.js?v=0.2.137';
import { huntOf, partyOf, settingsOf } from '../session/hunt-sections.js?v=0.2.137';
import { deathLogOf, levelOf } from '../session/character-sections.js?v=0.2.137';
import { nameOf, blessingsOf } from '../session/item-sections.js?v=0.2.137';
import { huntName } from '../session/party-sections.js?v=0.2.137';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.137';
import { roomOfHunt } from '../data/boss-halls.js?v=0.2.137';
import { MONSTERS } from '../data/monsters.js?v=0.2.137';
import { TOWER_RULES } from '../data/tower.js?v=0.2.137';
import { SKILLS_DEF } from '../data/skills.js?v=0.2.137';
import { whole } from '../render/format.js?v=0.2.137';
import { summariesOf } from '../hunt-view/summary-recorder.js?v=0.2.137';
import { monsterName } from './widgets/bits.js?v=0.2.137';
import { t } from '../render/player-text.js?v=0.2.137';

const seenOf = (cs) => {
  const r = cs && cs.record && cs.record.residue && cs.record.residue.alerts;
  return r && typeof r === 'object' ? r : {};
};
/** The dismissal id of a death: its hunt session's (the alert centre reads the same one). */
const deathSeenId = (session) => 'died:' + session;
/* ", and they're free until Level 30" while the server's Blessings are free for this hero (board 2026-10-25 #9: the
   popup never said so, and the player walked back into the same death unblessed), else nothing. */
function freeWords(cs) {
  const b = blessingsOf(cs), lv = levelOf(cs);
  return b && Number.isInteger(b.freeUntil) && lv && lv.level < b.freeUntil ? t('death.free_until', { level: b.freeUntil }) : '';
}

/** Does this hero hold fewer Blessings than the server offers? (the popup's Blessings button) Null when unknown. */
export function blessingsMissing(cs) {
  const b = blessingsOf(cs);
  return b && b.tiers.length ? b.tiers.some((tier) => !tier.held) : null;
}
/* Dismissed on this page: an envelope that lands before the residue put cannot bring one back. */
const DISMISSED = new WeakMap();
const dismissedOf = (cs) => { let s = DISMISSED.get(cs); if (!s) { s = new Set(); DISMISSED.set(cs, s); } return s; };

/** Has this character's death in `session` been dismissed (this page, or the residue)? */
export function deathSeen(cs, session) {
  const seen = seenOf(cs).seen;
  return dismissedOf(cs).has(session) || (Array.isArray(seen) && seen.includes(deathSeenId(session)));
}

/** The death the popup shows for this character now, as { session, row }, or null. */
export function deathPopupOf(cs) {
  const h = huntOf(cs);
  if (!h || !h.ended || h.endReason !== 'died' || deathSeen(cs, h.sessionId)) return null;
  /* THE BURNING TOWER: nobody dies there, the Hearth spits you out and it costs nothing (the board's §1). The climb's end card says so. */
  if (h.huntId === TOWER_RULES.hunt) return null;
  const log = deathLogOf(cs);
  const row = log && log[0];
  /* The newest row must be THIS hunt's death (a row with no session is an older server's: the newest). */
  if (!row || (row.session !== null && row.session !== h.sessionId)) return null;
  return { session: h.sessionId, row };
}

/** Mark one death as seen (display state only); sent at once, so a reload right after OK never shows it again. */
function dismissDeath(cs, session) {
  dismissedOf(cs).add(session);
  const r = seenOf(cs);
  const seen = Array.isArray(r.seen) ? r.seen : [];
  if (seen.includes(deathSeenId(session))) return;
  const ok = cs.setResidue('alerts', { off: Array.isArray(r.off) ? r.off : [], seen: seen.concat(deathSeenId(session)).slice(-ALERTS_SEEN_MAX) });
  if (ok && typeof cs.flushResidue === 'function') cs.flushResidue().catch(() => {});
}

/* WHY, SO A DEATH TEACHES (Tyler 2026-11-04: dying is the price of a big risk, and the monsters are simply stronger): how far under this ground the hero stood, then what would have helped.
   The Level is the server's: the death row's `levelFrom`, the Level the hero died at (a death can take a Level since Tyler 2026-11-09, so
   the hero's Level now may be lower), else the hero's own Level on a row from before the server named it. A row from an older hunt,
   opened by the key, may have been outgrown and says nothing. */
function whyWords(cs, d) {
  const h = huntOf(cs), lv = levelOf(cs);
  const band = d.row.hunt && HUNT_INDEX[d.row.hunt] && HUNT_INDEX[d.row.hunt].band;
  const at = d.row.levelFrom !== null && d.row.levelFrom !== undefined ? d.row.levelFrom : lv ? lv.level : null;
  if (!band || at === null || !h || h.sessionId !== d.session) return '';
  /* A BOSS ROOM IS HIS FIGHT (QA audit 2026-11-18 N4: a Level 5 hero killed by the Level 25 Rat King read "3 Levels under this ground",
     the room's band floor): the gap is to the boss's own Level, the catalogue row the engine fights with. */
  const room = roomOfHunt(d.row.hunt);
  const boss = room && MONSTERS[room.monster];
  const gap = (boss && Number.isInteger(boss.level) ? boss.level : band[0]) - at;
  /* a boss room never tells a party that HAS a healer to bring one (the v0.2.132 re-play: four with a Healer read it): it says heal sooner */
  if (gap <= 0) return t(!room ? 'death.why_in_range' : hasHealer(cs) ? 'death.why_in_room_healed' : 'death.why_in_room');
  return room ? t('death.why_under_boss', { count: gap, boss: room.boss }) : t('death.why_under', { count: gap });
}

/* Did this hero's party (or the hero) fight with a Healer? The server's party section, else the hero's own role. */
const hasHealer = (cs) => ((partyOf(cs) || {}).members || []).some((m) => m.role === 'healer') || (settingsOf(cs) || {}).role === 'healer';

const xpName = (k) => (k === 'level' ? 'Level' : (SKILLS_DEF[k] && SKILLS_DEF[k].name) || k);
/* "1,200 Level XP, 40 Melee XP and 12 Defense XP", Level first. */
const xpWords = (m) => {
  const parts = Object.keys(m).sort((a, b) => (a === 'level' ? -1 : b === 'level' ? 1 : a < b ? -1 : 1)).map((k) => whole(m[k]) + ' ' + xpName(k) + ' XP');
  return parts.length < 2 ? parts.join('') : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
};

/* "Your Blessing kept 300 Level XP, and is now used up." / "Your 3 Blessings kept ..., and are now used up.", the count the server's
   (the row's `blessings`, the tiers the death used); one when it did not say. */
function savedWords(row) {
  const n = Number.isSafeInteger(row.blessings) && row.blessings > 1 ? row.blessings : 1;
  return Object.keys(row.saved).length ? t('death.blessing_kept', { count: n, xp: xpWords(row.saved) }) : t('death.blessing_used', { count: n });
}

/**
 * The popup's words for one character's death (pure; every number is the server's row).
 * @returns {{title: string, killed: string, what: string, why: string, lost: string, level: string, saved: string, town: string}}
 */
export function deathWords(cs, d) {
  const who = nameOf(cs) || t('away.your_hero');
  const row = d.row;
  const story = summariesOf(cs).find((s) => s.id === d.session);
  return {
    title: row.hunt ? t('death.title_in', { name: who, ground: huntName(row.hunt) }) : t('death.title', { name: who }),
    killed: row.monster ? t('death.killed', { monster: monsterName(row.monster) }) : '',
    what: story && story.deaths.length ? story.deaths[0] : '',
    why: whyWords(cs, d),
    /* xp null: the server has not priced it (an older row); say nothing rather than guess. */
    lost: Object.keys(row.xpLost).length ? t('death.lost', { xp: xpWords(row.xpLost) }) : row.xp === null ? '' : t('death.lost_none'),
    /* A death can take a Level (Tyler 2026-11-09): said only when the server's row shows the Level fell. */
    level: Number.isInteger(row.levelFrom) && Number.isInteger(row.levelTo) && row.levelTo < row.levelFrom
      ? t('death.level_dropped', { name: who, from: row.levelFrom, to: row.levelTo }) : '',
    /* undefined: the server did not say whether a Blessing was used, so nothing is said about one. */
    saved: row.saved === undefined ? ''
      : row.saved === null ? t('death.no_blessing', { free: freeWords(cs) })
      : savedWords(row),
    town: t('death.town', { name: who }),
  };
}

/**
 * Open the popup on this shell when its character dies (on mount too: a death
 * while away shows on return), and record the dismissal however it closes.
 * Returns the unsubscribe.
 */
export function followDeaths(ctx) {
  const cs = ctx.character;
  if (!cs || typeof cs.subscribe !== 'function') return () => {};
  let showing = null;
  const check = () => {
    const d = deathPopupOf(cs);
    if (!d || ctx.wm.isOpen('death')) return;
    showing = d.session;
    ctx.wm.open('death');
  };
  const offWm = ctx.wm.subscribe(() => {
    if (showing !== null && !ctx.wm.isOpen('death')) { const s = showing; showing = null; dismissDeath(cs, s); }
  });
  const offCs = cs.subscribe((s, why) => { if (why !== 'closed') check(); });
  check();
  return () => { offWm(); offCs(); };
}
