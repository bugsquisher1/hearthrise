// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/settings-intent.js — HUNT SETTINGS ARE INTENTS (parity HS-01..HS-09).
//
// The action bar's control panel (target, stance, chase, distance) is built from these.
// Every control SHOWS the server's `hunt_settings` section and nothing else.
// A change is an INTENT: the controls of that panel go disabled at once, one
// hr_action_set_options call is sent (CharacterSession.setHuntOptions), and
// they come back only when the server has answered and the re-read envelope
// has replaced the section — so a control never shows a value the server has
// not confirmed (CLAUDE.md §6, HS-07). A refusal leaves the server's value in
// place and says why in plain words.
//
// Controls are marked `data-opt="<key>"`; buttons carry `data-val`.
// ════════════════════════════════════════════════════════════════════════
import { TARGET_MODES, HUNT_STANCES, HERO_DISTANCE } from '../../data/rule-subjects.js?v=0.2.22';
import { settingsOf, partyOf } from '../../session/hunt-sections.js?v=0.2.22';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.22';
import { text, attr, prop, cls } from '../../render/paint.js?v=0.2.22';

/* Words for the server's refusal codes; anything else reads as a plain "not saved". */
const REFUSAL = Object.freeze({
  rate_limited: 'Too many changes at once. Try again in a moment.',
  settle_first: 'The hunt is catching up. Try again in a few seconds.',
  bad_option: 'The server does not take this setting yet.',
  network: 'No connection. Your settings are unchanged.',
});

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

/** Patch every [data-opt] control under `root` to the server's settings; off while pending or unknown. */
export function patchControls(root, cs) {
  const s = settingsOf(cs);
  const party = partyOf(cs);
  const pending = root.hasAttribute('data-pending');
  for (const el of root.querySelectorAll('[data-opt]')) {
    const key = el.getAttribute('data-opt');
    const v = s ? valueOf(s, key) : null;
    prop(el, 'disabled', pending || v === null);
    if (el.tagName === 'SELECT' || el.tagName === 'INPUT') { if (v !== null && !pending) prop(el, 'value', String(v)); }
    else if (key === 'stance') attr(el, 'aria-pressed', String(v === el.getAttribute('data-val')));
    else if (key === 'chase') attr(el, 'aria-pressed', String(v === true));
  }
  for (const out of root.querySelectorAll('[data-show]')) {
    const v = s ? valueOf(s, out.getAttribute('data-show')) : null;
    text(out, v === null ? '–' : v);
  }
  /* "Follow the leader" names the leader when there is one (HS-02). */
  const follow = root.querySelector('select[data-opt="target_mode"] option[value="follow"]');
  const lead = party && party.members.find((m) => m.seat === party.leaderSeat);
  if (follow) text(follow, lead && party.members.length > 1 ? 'Follow ' + lead.name : TARGET_MODES.follow.label);
  cls(root, 'is-pending', pending);
}

function valueOf(s, key) {
  const map = { target_mode: s.targetMode, stance: s.stance, distance: s.distance, chase: s.chase };
  const v = map[key];
  return v === undefined ? null : v;
}

/** The option a control's gesture asks for, or null (no change / out of the range the server takes). */
function optionFor(el, cs) {
  const s = settingsOf(cs);
  if (!s) return null;
  const key = el.getAttribute('data-opt');
  if (key === 'distance') {
    const n = (s.distance || 0) + Number(el.getAttribute('data-val'));
    return s.distance === null || n < HERO_DISTANCE.min || n > HERO_DISTANCE.max ? null : { distance: n };
  }
  if (key === 'chase') return s.chase === null ? null : { chase: !s.chase };
  if (key === 'stance') return el.getAttribute('data-val') === s.stance ? null : { stance: el.getAttribute('data-val') };
  if (key === 'target_mode') return TARGET_MODES[el.value] && el.value !== s.targetMode ? { target_mode: el.value } : null;
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
  if (!opts || !s || root.hasAttribute('data-pending')) { repaint(); return false; }
  attr(root, 'data-pending', true);
  text(root.querySelector('.hh-intent-msg'), 'Saving…');
  repaint();
  const r = await cs.setHuntOptions(s.preset, opts);
  attr(root, 'data-pending', null);
  text(root.querySelector('.hh-intent-msg'), r.ok ? '' : (REFUSAL[r.error] || 'Not saved: the server refused it.'));
  repaint();
  return r.ok;
}
