// ════════════════════════════════════════════════════════════════════════
// src/audio/mount.js — SOUND, MOUNTED ON THE PAGE FOR ONE ACCOUNT.
//
// The audio home's only door. src/app/boot.js asks for it (never with a literal
// import(): tests/module-preload.mjs) ONLY when src/data/sound-buses.js says
// sound is on, so with the switch off this file, the map, the manager and every
// audio file stay unfetched. It joins the three parts:
//   manager.js   the mixer (buses, voices, cooldowns, the files)
//   watch.js     which sound, when (the game is watched, never asked)
//   the page     the first gesture unlocks audio (a phone's first tap, a click, a
//                key); a hidden tab goes quiet; a press on a control ticks; the
//                player's four volumes (Settings > Sound, one pick for every hero)
// ════════════════════════════════════════════════════════════════════════
import { BUILD } from '../build-info.js?v=0.2.114';
import { SOUND, SOUND_BUSES, soundModeOf, soundLevelsOf } from '../data/sound-buses.js?v=0.2.114';
import { SOUNDS, SOUND_LIMITS } from '../data/sounds.js?v=0.2.114';
import { playerPick } from '../session/player-switch.js?v=0.2.114';
import { createSoundManager } from './manager.js?v=0.2.114';
import { watchSound } from './watch.js?v=0.2.114';

/* What unlocks audio: the events a browser counts as the player's own act (a phone: the end of a tap). */
const GESTURES = Object.freeze(['pointerup', 'touchend', 'click', 'keydown']);
/* A press that ticks: a control, as src/shell/press-ack.js names one, less the fields a player types in. */
const CONTROL = 'button, [data-hs-act], [role="button"], [role="menuitem"], [role="tab"]';

/**
 * @param {Window} win
 * @param {object} account   the AccountSession
 * @param {object} [alerts]  the alert centre
 * @returns {Promise<{ followShell(shell: object|null): void, destroy(): void, manager: object }|null>}  null when sound is off
 */
export async function mountSound(win, account, alerts) {
  const mode = soundModeOf(win.location.search);
  if (mode === 'off') return null;
  const doc = win.document;
  const tones = mode === 'tones' ? await import('./tones.js?v=0.2.114') : null;
  const manager = createSoundManager({
    mode, sounds: SOUNDS, limits: SOUND_LIMITS, buses: SOUND_BUSES.map((b) => b.id), tones,
    AudioContext: win.AudioContext || win.webkitAudioContext,
    fetch: (url) => win.fetch(url),
    urlOf: (file) => new URL('../../' + file, import.meta.url).href + '?v=' + BUILD.cache,
    now: () => win.performance.now(),
  });

  /* The player's volumes: the newest pick any open hero holds, read again when any open hero changes and applied when it differs. */
  let applied = '';
  const levels = () => {
    const next = soundLevelsOf(playerPick(account.characters(), SOUND.field));
    const sig = JSON.stringify(next);
    if (sig === applied) return;
    applied = sig;
    manager.setLevels(next);
  };
  const heroes = new Map();   // slot -> its unsubscribe
  const follow = () => {
    const open = new Set(account.characters().map((c) => c.slot));
    for (const [slot, off] of heroes) if (!open.has(slot)) { off(); heroes.delete(slot); }
    for (const c of account.characters()) if (!heroes.has(c.slot)) heroes.set(c.slot, c.subscribe(levels));
    levels();
  };
  const offAccount = account.subscribe((why) => { if (why === 'opened' || why === 'closed') follow(); });
  follow();

  const cue = (id, opts) => manager.play(id, opts);
  const watch = watchSound({ account, alerts, cue, bed: (slot, id) => manager.bed(slot, id) });

  const onGesture = (e) => {
    manager.unlock();
    if (e.type !== 'click') return;
    const t = e.target && e.target.closest ? e.target.closest(CONTROL) : null;
    if (t && !t.disabled && t.getAttribute('aria-disabled') !== 'true') cue('ui_press');
  };
  const onHidden = () => manager.setHidden(doc.hidden);
  for (const type of GESTURES) doc.addEventListener(type, onGesture, true);
  doc.addEventListener('visibilitychange', onHidden);
  onHidden();

  return {
    manager,
    followShell: (shell) => watch.followShell(shell),
    destroy() {
      for (const type of GESTURES) doc.removeEventListener(type, onGesture, true);
      doc.removeEventListener('visibilitychange', onHidden);
      offAccount();
      for (const off of heroes.values()) off();
      heroes.clear();
      watch.destroy();
      manager.destroy();
    },
  };
}
