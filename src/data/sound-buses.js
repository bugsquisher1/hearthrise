// ════════════════════════════════════════════════════════════════════════
// src/data/sound-buses.js — THE SOUND SWITCH AND ITS FOUR VOLUMES, AS DATA.
//
// Tyler 2026-11-10 approved sound. The system (src/audio/**) ships SWITCHED OFF
// and silent until he has chosen where the sounds come from: no file exists yet.
// This is the only part of it the first screen loads, because the Settings rows
// (src/data/settings.js) and the residue sanitizer (src/session/residue.js) need
// it; the sound map (src/data/sounds.js) and the manager load only when sound is
// on, and never with a literal import() (tests/module-preload.mjs).
//
//   SOUND.shipped   THE SWITCH. false: no audio module is fetched, no audio file is
//                   asked for, the Settings rows are hidden. Flip it when the files
//                   under assets/audio/ exist.
//   SOUND.param     ?sound=tones plays every event as a generated tone (a Web Audio
//                   oscillator, no files), so timing and mixing can be heard today.
//   SOUND_BUSES     master, effects, ambience, music: each a volume (a whole percent)
//                   and a mute, one pick for every hero (src/session/player-switch.js)
//   SOUND.field     the residue field that holds the pick: { at, vol: {bus: n}, mute: [bus] }
//
// A display preference: no gate, intent or purchase reads a sound or its state
// (CLAUDE.md §6). PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════

export const SOUND = Object.freeze({
  shipped: false,
  field: 'sound',
  param: 'sound',
  tones: 'tones',
  volume: Object.freeze({ min: 0, max: 100, step: 5 }),
});

const bus = (id, initial, label, help, muteLabel, muteHelp) => Object.freeze({ id, initial, label, help, muteLabel, muteHelp });
export const SOUND_BUSES = Object.freeze([
  bus('master', 80, 'Master volume', 'How loud the whole game is.', 'Mute everything', 'Turn every sound off. Your volumes are kept.'),
  bus('effects', 100, 'Effects volume', 'Blows, spells, loot, windows and buttons.', 'Mute effects', 'Turn the effects off. Their volume is kept.'),
  bus('ambience', 60, 'Ambience volume', 'The town and the hunting grounds around your hero.', 'Mute ambience', 'Turn the sound of the town and the grounds off. Its volume is kept.'),
  bus('music', 50, 'Music volume', 'The music in town and on a hunt.', 'Mute music', 'Turn the music off. Its volume is kept.'),
]);
const BUS_IDS = Object.freeze(SOUND_BUSES.map((b) => b.id));

/** 'off' (nothing loads), 'files' (the switch is on) or 'tones' (the page's ?sound=tones). */
export function soundModeOf(search) {
  let asked = null;
  try { asked = new URLSearchParams(String(search || '')).get(SOUND.param); } catch (e) { asked = null; }
  if (asked === SOUND.tones) return 'tones';
  return SOUND.shipped ? 'files' : 'off';
}

const pct = (v) => {
  const { min, max, step } = SOUND.volume;
  return Math.max(min, Math.min(max, Math.round(v / step) * step));
};

/* The residue's sanitizer: a pick keeps its stamp, a whole percent per known bus and the known buses muted; else no pick at all. */
export function sanitizeSoundPick(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v) || !Number.isSafeInteger(v.at) || v.at < 0) return undefined;
  const out = { at: v.at, vol: {}, mute: [] };
  const vol = v.vol && typeof v.vol === 'object' && !Array.isArray(v.vol) ? v.vol : {};
  for (const id of BUS_IDS) if (Number.isFinite(vol[id])) out.vol[id] = pct(vol[id]);
  if (Array.isArray(v.mute)) out.mute = BUS_IDS.filter((id) => v.mute.includes(id));
  return out;
}

/** Every bus as the mixer reads it: { master: { vol, mute }, ... }, the pick's values over the defaults. */
export function soundLevelsOf(pick) {
  const p = sanitizeSoundPick(pick) || { vol: {}, mute: [] };
  return Object.fromEntries(SOUND_BUSES.map((b) => [b.id, { vol: Number.isFinite(p.vol[b.id]) ? p.vol[b.id] : b.initial, mute: p.mute.includes(b.id) }]));
}

/** The pick after one Settings press (`key`: 'vol' a percent, 'mute' a boolean), stamped `at`. */
export function withSoundLevel(pick, busId, key, value, at) {
  const p = sanitizeSoundPick(pick) || { vol: {}, mute: [] };
  const next = { at, vol: Object.assign({}, p.vol), mute: p.mute.slice() };
  if (!BUS_IDS.includes(busId)) return next;
  if (key === 'vol' && Number.isFinite(value)) next.vol[busId] = pct(value);
  if (key === 'mute') next.mute = BUS_IDS.filter((id) => (id === busId ? value === true : p.mute.includes(id)));
  return next;
}
