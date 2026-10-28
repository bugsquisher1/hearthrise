// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/settings-intent.js — HUNT SETTINGS ARE INTENTS (parity HS-01..HS-09).
//
// The action bar's control panel (target, stance, chase, distance, the gold to keep) is built from these.
// Every control SHOWS the server's `hunt_settings` section and nothing else. In town the server projects the pick
// the engine would make for an option the player never set (hr_hunt_settings_view over hr_hunt_role_defaults,
// 2027-01-25-town-defaults.sql), so the bar is configurable in town too (Tyler 10-25); an option the server still
// leaves unset is off, never filled with a client copy of that rule (CLAUDE.md §6).
// A change is an INTENT: the controls of that panel go disabled at once, one
// hr_action_set_options call is sent (CharacterSession.setHuntOptions), and
// they come back only when the server has answered and the re-read envelope
// has replaced the section — so a control never shows a value the server has
// not confirmed (CLAUDE.md §6, HS-07). A refusal leaves the server's value in
// place and says why in plain words.
//
// Controls are marked `data-opt="<key>"`; buttons carry `data-val`.
// ════════════════════════════════════════════════════════════════════════
import { TARGET_MODES, HUNT_STANCES, HERO_DISTANCE } from '../../data/rule-subjects.js?v=0.2.58';
import { GOLD_FLOOR } from '../../data/hunt-sessions.js?v=0.2.58';
import { settingsOf, partyOf } from '../../session/hunt-sections.js?v=0.2.58';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.58';
import { text, attr, prop, cls } from '../../render/paint.js?v=0.2.58';
import { answerWithin } from '../bar-draft.js?v=0.2.58';
import { refusalText } from '../intent-words.js?v=0.2.58';

/* The server's refusal reads from the one table (src/data/refusal-words.js via intent-words.js refusalText). */

/** The <option>s for the target select. */
export function targetOptionsHtml() {
  return Object.entries(TARGET_MODES).map(([id, m]) => '<option value="' + esc(id) + '">' + esc(m.label) + '</option>').join('');
}

/** The stance buttons. */
export function stanceButtonsHtml() {
  return Object.entries(HUNT_STANCES).map(([id, s]) => '<button type="button" class="hh-seg" data-opt="stance" data-val="' + esc(id) + '" data-hs-act="opt" aria-pressed="false" title="' + esc(s.label) + '">' + esc(s.label) + '</button>').join('');
}

/** The distance stepper: minus, the server's value, plus. */
export function distanceHtml() {
  return '<span class="hh-step" role="group" aria-label="Distance in tiles">'
    + '<button type="button" class="hh-seg" data-opt="distance" data-val="-1" data-hs-act="opt" aria-label="Closer">−</button>'
    + '<output class="hh-step-val" data-show="distance"></output>'
    + '<button type="button" class="hh-seg" data-opt="distance" data-val="1" data-hs-act="opt" aria-label="Farther">+</button></span>';
}

/** The gold-to-keep field: a whole number of gold, the server's own range (GOLD_FLOOR, hr_hunt_limits gold_floor_*). */
export function goldFloorHtml() {
  return '<input type="number" class="hh-num hb-gold" min="' + GOLD_FLOOR.min + '" max="' + GOLD_FLOOR.max + '" step="50" inputmode="numeric"'
    + ' data-opt="gold_floor" data-hs-act="opt" aria-label="Gold to keep: the hunt sells loot, then stops, rather than spend below it">';
}

/* The server's gold floor (hunt_settings.gold_floor, hr_hunt_settings_view). settingsOf (hunt-sections.js, the
   live-engine lane's) does not parse it yet: read here until it does. */
function goldFloorOf(cs) {
  const raw = cs && typeof cs.read === 'function' ? cs.read('hunt_settings') : null;
  if (!raw || typeof raw !== 'object') return null;
  const v = raw.gold_floor;
  /* The server sends the floor it keeps (hr_hunt_limits gold_floor_default when unset, 2027-01-25-town-defaults.sql). */
  return Number.isSafeInteger(v) && v >= 0 ? v : null;
}

/** Patch every [data-opt] control under `root` to the server's settings; off while pending or unknown. */
export function patchControls(root, cs) {
  const s = settingsOf(cs);
  const party = partyOf(cs);
  const pending = root.hasAttribute('data-pending');
  for (const el of root.querySelectorAll('[data-opt]')) {
    const key = el.getAttribute('data-opt');
    const v = s ? valueOf(s, key, cs) : null;
    prop(el, 'disabled', pending || v === null);
    /* A field shows the server's value, in flight too (nothing new shows before the server confirms); only a
       field the player is typing in, with nothing in flight, is left alone. */
    if (el.tagName === 'INPUT') { if (v !== null && (pending || el.ownerDocument.activeElement !== el)) prop(el, 'value', String(v)); }
    else if (el.tagName === 'SELECT') { if (v !== null && !pending) prop(el, 'value', String(v)); }
    else if (key === 'stance') attr(el, 'aria-pressed', String(v === el.getAttribute('data-val')));
    else if (key === 'chase') attr(el, 'aria-pressed', String(v === true));
  }
  for (const out of root.querySelectorAll('[data-show]')) {
    const v = s ? valueOf(s, out.getAttribute('data-show'), cs) : null;
    text(out, v === null ? '–' : v);
  }
  /* "Follow the leader" names the leader when there is one (HS-02). */
  const follow = root.querySelector('select[data-opt="target_mode"] option[value="follow"]');
  const lead = party && party.members.find((m) => m.seat === party.leaderSeat);
  if (follow) text(follow, lead && party.members.length > 1 ? 'Follow ' + lead.name : TARGET_MODES.follow.label);
  cls(root, 'is-pending', pending);
}

/* CONFIGURABLE IN TOWN (Tyler 2026-10-25: "people don't want to go into a hunt to configure their bar"). The server
   projects the engine's pick for an unset option out of a hunt too (role and party, hr_hunt_role_defaults), so the
   control is live before a hunt: a press sends an absolute value, the server stores it in the setup's options and
   the re-read envelope projects it. A value the server does not send is unknown: its control is off. */
function valueOf(s, key, cs) {
  if (key === 'gold_floor') return goldFloorOf(cs);
  const map = { target_mode: s.targetMode, stance: s.stance, distance: s.distance, chase: s.chase };
  const v = map[key];
  return v === undefined || v === null ? null : v;
}

/** The option a control's gesture asks for, or null (no change / out of the range the server takes). */
function optionFor(el, cs) {
  const s = settingsOf(cs);
  if (!s) return null;
  const key = el.getAttribute('data-opt');
  if (key === 'distance') {
    const d = valueOf(s, key, cs);
    const n = (d || 0) + Number(el.getAttribute('data-val'));
    return d === null || n < HERO_DISTANCE.min || n > HERO_DISTANCE.max ? null : { distance: n };
  }
  if (key === 'chase') { const c = valueOf(s, key, cs); return c === null ? null : { chase: !c }; }
  if (key === 'stance') return el.getAttribute('data-val') === valueOf(s, key, cs) ? null : { stance: el.getAttribute('data-val') };
  if (key === 'gold_floor') {
    const now = goldFloorOf(cs);
    const n = Number(el.value);
    /* Only a whole number in the server's range is sent; anything else snaps back to the server's value. */
    return now === null || !Number.isSafeInteger(n) || n < GOLD_FLOOR.min || n > GOLD_FLOOR.max || n === now ? null : { gold_floor: n };
  }
  if (key === 'target_mode') return TARGET_MODES[el.value] && el.value !== valueOf(s, key, cs) ? { target_mode: el.value } : null;
  return null;
}

/**
 * Send one settings intent from a control under `root`. Resolves when the
 * server has answered (and, on ok, the character was re-read).
 * @param {object} ctx   the shell context (ctx.character is the CharacterSession)
 * @param {Element} root the panel the controls live in (it goes pending)
 * @param {Element} el   the control
 * @param {() => void} repaint
 */
export async function sendOption(ctx, root, el, repaint) {
  const cs = ctx.character;
  const opts = optionFor(el, cs);
  const s = settingsOf(cs);
  if (!opts || !s || root.hasAttribute('data-pending')) { if (el.tagName === 'INPUT') el.blur(); repaint(); return false; }
  attr(root, 'data-pending', true);
  text(root.querySelector('.hh-intent-msg'), 'Saving…');
  repaint();
  /* Never left pending: the answer, a refusal or the timeout always turns the controls back on. */
  const r = await answerWithin(() => cs.setHuntOptions(s.preset, opts));
  attr(root, 'data-pending', null);
  text(root.querySelector('.hh-intent-msg'), r.ok ? '' : refusalText(r, cs));
  repaint();
  return r.ok;
}
