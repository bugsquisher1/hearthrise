// ════════════════════════════════════════════════════════════════════════
// src/shell/death-popup.js — THE DEATH POPUP: WHEN IT OPENS, AND THE WORDS IT SAYS.
//
// Tyler 2026-10-19: a death opens a centred popup (the `death` modal row,
// src/data/shell-windows.js; windows/death.js draws it), not a side alert.
// Every fact is the server's death row (`death_log`, hr_death_log_view): the
// ground, the killer and the killing blow, the last seconds of damage and
// healing (the engine's account, hr_death_why), the XP the death cost and the
// XP a Blessing kept. Nothing is counted or priced in the browser.
//
// WHEN: the character's hunt section says it ended `died`, and the newest
// death row is that session's and not yet dismissed. A dismissal (OK, Hunt
// summary or the close) is the death's server id in the residue's
// `alerts.seen` (display state), so a reload or another device never shows the
// same death twice. Only the newest death can open it: a fresh device does not
// replay the log. The death of a party member stays an alert line (alerts.js).
// ════════════════════════════════════════════════════════════════════════
import { ALERTS_SEEN_MAX } from '../session/residue.js?v=0.2.17';
import { huntOf } from '../session/hunt-sections.js?v=0.2.17';
import { deathLogOf } from '../session/character-sections.js?v=0.2.17';
import { HUNT_INDEX } from '../data/hunts.js?v=0.2.17';
import { SKILLS_DEF } from '../data/skills.js?v=0.2.17';
import { whole } from '../render/format.js?v=0.2.17';
import { monsterName, abilityName } from './widgets/bits.js?v=0.2.17';

const seenOf = (cs) => {
  const r = cs && cs.record && cs.record.residue && cs.record.residue.alerts;
  return r && typeof r === 'object' ? r : {};
};
const seenId = (id) => 'died:' + id;
/* Dismissed on this page: an envelope that lands before the residue put cannot bring one back. */
const DISMISSED = new WeakMap();
const dismissedOf = (cs) => { let s = DISMISSED.get(cs); if (!s) { s = new Set(); DISMISSED.set(cs, s); } return s; };

/** The death the popup should show for this character now, or null. */
export function deathPopupOf(cs) {
  const h = huntOf(cs);
  if (!h || !h.ended || h.endReason !== 'died') return null;
  const log = deathLogOf(cs);
  const d = log && log[0];
  if (!d || (d.session && d.session !== h.sessionId) || dismissedOf(cs).has(d.id)) return null;
  const seen = seenOf(cs).seen;
  return Array.isArray(seen) && seen.includes(seenId(d.id)) ? null : d;
}

/** Mark one death as seen (display state only). */
export function dismissDeath(cs, id) {
  dismissedOf(cs).add(id);
  const r = seenOf(cs);
  const seen = Array.isArray(r.seen) ? r.seen : [];
  if (seen.includes(seenId(id))) return false;
  const ok = cs.setResidue('alerts', { off: Array.isArray(r.off) ? r.off : [], seen: seen.concat(seenId(id)).slice(-ALERTS_SEEN_MAX) });
  /* Sent now, not after the debounce: a reload right after OK must not show it again. */
  if (ok && typeof cs.flushResidue === 'function') cs.flushResidue().catch(() => {});
  return ok;
}

const xpName = (k) => (k === 'level' ? 'Level' : (SKILLS_DEF[k] && SKILLS_DEF[k].name) || k);
const xpWords = (m) => {
  const parts = Object.entries(m).map(([k, n]) => whole(n) + ' ' + xpName(k) + ' XP');
  return parts.length < 2 ? parts.join('') : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
};
const blowAbility = (ab) => (ab && ab !== 'basic' ? abilityName(ab) + ', ' : '');
const secs = (ms) => (ms < 100 ? 'at the end' : (ms / 1000).toFixed(1) + ' s before');

/** The popup's words for one death row (pure; every number is the row's). */
export function deathWords(d) {
  const where = d.hunt ? (HUNT_INDEX[d.hunt] ? HUNT_INDEX[d.hunt].name : d.hunt) : null;
  const killer = (d.blow && d.blow.monster) || d.monster;
  return {
    title: where ? 'You died in ' + where : 'You died',
    killed: d.blow
      ? 'Killed by ' + (killer ? monsterName(killer) : 'an unseen blow') + ' — ' + blowAbility(d.blow.ability) + whole(d.blow.amount) + ' damage'
      : killer ? 'Killed by ' + monsterName(killer) : '',
    /* Oldest first, so the list ends on the killing blow. */
    recent: d.recent.slice().reverse().map((e) => ({
      kind: e.kind,
      text: e.kind === 'heal'
        ? 'You healed ' + whole(e.amount)
        : (e.monster ? monsterName(e.monster) : 'Something') + ' hit you for ' + whole(e.amount) + (e.ability && e.ability !== 'basic' ? ' (' + abilityName(e.ability) + ')' : ''),
      when: secs(e.agoMs),
    })),
    lost: Object.keys(d.xpLost).length ? 'You lost ' + xpWords(d.xpLost) + '.' : d.xp === null ? '' : 'You lost no XP.',
    saved: d.saved === null ? '' : Object.keys(d.saved).length ? 'Your Blessing saved ' + xpWords(d.saved) + '.' : 'No Blessing protected you this time.',
    town: 'You are back in town with full health and mana.',
  };
}

/**
 * Open the popup on this shell when its character dies, and record the
 * dismissal when it closes (however it closes). Returns the unsubscribe.
 */
export function followDeaths(ctx) {
  const cs = ctx.character;
  if (!cs || typeof cs.subscribe !== 'function') return () => {};
  let showing = null;
  const check = () => {
    const d = deathPopupOf(cs);
    if (!d || ctx.wm.isOpen('death')) return;
    showing = d.id;
    ctx.wm.open('death');
  };
  const offWm = ctx.wm.subscribe(() => {
    if (showing !== null && !ctx.wm.isOpen('death')) { const id = showing; showing = null; dismissDeath(cs, id); }
  });
  const offCs = cs.subscribe((s, why) => { if (why !== 'closed') check(); });
  check();
  return () => { offWm(); offCs(); };
}
