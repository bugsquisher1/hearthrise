// ════════════════════════════════════════════════════════════════════════
// src/audio/tones.js — A STAND-IN VOICE FOR EVERY SOUND, MADE OF OSCILLATORS.
//
// DEV ONLY: loaded by the page's ?sound=tones (src/data/sound-buses.js) and by
// nothing else. No sound file exists yet, so each event of the map plays a short
// tone of its own here, through the same manager, buses, cooldowns and voices the
// files will use: the TIMING and the MIX can be heard and tuned today. These are
// not the game's sounds and never ship as them (Hearthrise sounds are wood, iron
// and hearth, not synth blips: .claude/coordination/sound-list-2026-11-10.md).
//
// A recipe: [wave, [hz, atMs, durMs, toHz?] ...]   notes in order; `toHz` slides
// A bed:    { noise: lowpassHz }  filtered noise    | { drone: [hz, hz] }  two held sines
// A sound with no recipe gets a plain blip, so a new row is audible at once;
// tests/sound.mjs asks that every row has its own, so no two events sound alike by accident.
// ════════════════════════════════════════════════════════════════════════

export const TONES = Object.freeze({
  hero_hit: ['triangle', [170, 0, 70, 110]],
  hero_hurt: ['sawtooth', [120, 0, 130, 80]],
  ally_hurt: ['triangle', [95, 0, 90, 70]],
  blow_miss: ['sine', [1100, 0, 70, 500]],
  cast_fire: ['sawtooth', [220, 0, 260, 520]],
  cast_ice: ['sine', [1300, 0, 260, 700]],
  cast_poison: ['square', [310, 0, 300, 190]],
  cast_heal: ['sine', [523, 0, 140], [659, 120, 220]],
  cast_ward: ['sine', [330, 0, 320, 350]],
  cast_strike: ['square', [250, 0, 150, 120]],
  cast_shout: ['sawtooth', [140, 0, 260, 185]],
  monster_die: ['triangle', [300, 0, 230, 75]],
  boss_phase: ['sawtooth', [82, 0, 650, 70], [123, 0, 650, 105]],
  eat: ['square', [520, 0, 35], [470, 90, 35]],
  drink: ['sine', [400, 0, 160, 620]],
  loot_common: ['sine', [880, 0, 60], [1175, 60, 90]],
  loot_rare: ['triangle', [784, 0, 140], [988, 130, 140], [1175, 260, 140], [1568, 390, 620]],
  level_up: ['square', [262, 0, 150], [330, 140, 150], [392, 280, 150], [523, 420, 460]],
  skill_up: ['square', [392, 0, 120], [523, 110, 260]],
  hero_death: ['sawtooth', [330, 0, 260], [262, 240, 260], [196, 480, 260], [131, 720, 700]],
  hunt_start: ['sawtooth', [196, 0, 240], [294, 220, 380]],
  hunt_end: ['sawtooth', [294, 0, 240], [196, 220, 420]],
  window_open: ['sine', [500, 0, 60, 720]],
  window_close: ['sine', [720, 0, 60, 500]],
  ui_press: ['square', [1000, 0, 22]],
  purchase: ['triangle', [1800, 0, 45], [2250, 70, 80]],
  refusal: ['square', [150, 0, 160, 130]],
  chat_message: ['sine', [1400, 0, 55]],
  party_invite: ['triangle', [660, 0, 130], [880, 130, 130], [660, 260, 220]],
});

export const BED_TONES = Object.freeze({
  amb_town: { noise: 900 }, amb_forge: { noise: 2400 }, amb_hearth: { noise: 420 }, amb_farm: { noise: 1500 }, amb_yard: { noise: 1900 },
  amb_cellar: { noise: 260 }, amb_sewer: { noise: 340 }, amb_wilds: { noise: 1200 }, amb_warren: { noise: 500 }, amb_glade: { noise: 3000 }, amb_ruin: { noise: 700 },
  music_town: { drone: [196, 294] }, music_hunt: { drone: [147, 220] },
});

const BLIP = Object.freeze(['sine', [660, 0, 80]]);
/* A stand-in is quiet next to a real sound: a bare oscillator at full scale is harsh. */
const LEVEL = 0.25, BED_LEVEL = 0.12;

/* Several nodes that start and stop as one voice (the manager's `src`). */
function group(nodes, last) {
  const g = {
    onended: null,
    stop(when) { for (const n of nodes) { try { n.stop(when); } catch (e) { /* already stopped */ } } },
  };
  if (last) last.onended = () => { if (typeof g.onended === 'function') g.onended(); };
  return g;
}

function bedVoice(ctx, spec, dest) {
  const out = ctx.createGain();
  out.gain.value = BED_LEVEL;
  out.connect(dest);
  if (spec.drone) {
    const oscs = spec.drone.map((hz) => { const x = ctx.createOscillator(); x.type = 'sine'; x.frequency.value = hz; x.connect(out); x.start(); return x; });
    return group(oscs, null);
  }
  /* two seconds of noise, looped through a low-pass: a different cutoff is a different room */
  const len = Math.floor(ctx.sampleRate * 2);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let seed = 22222;
  for (let i = 0; i < len; i++) { seed = (seed * 16807) % 2147483647; data[i] = (seed / 2147483647) * 2 - 1; }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = spec.noise;
  src.connect(lp);
  lp.connect(out);
  src.start();
  return group([src], null);
}

/**
 * One voice for sound `id` into `dest`, tuned by `rate`. The manager treats it as it treats a file's source:
 * it sets `onended` and may call `stop(when)`.
 */
export function voice(ctx, id, row, dest, rate) {
  if (row.loop) return BED_TONES[id] ? bedVoice(ctx, BED_TONES[id], dest) : null;
  const [wave, ...notes] = TONES[id] || BLIP;
  const t0 = ctx.currentTime;
  let last = null, end = 0;
  const oscs = notes.map(([hz, atMs, durMs, toHz]) => {
    const a = t0 + atMs / 1000, b = a + durMs / 1000;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(hz * rate, a);
    if (toHz) osc.frequency.linearRampToValueAtTime(toHz * rate, b);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, a);
    env.gain.linearRampToValueAtTime(LEVEL, a + 0.005);
    env.gain.linearRampToValueAtTime(0, b);
    osc.connect(env);
    env.connect(dest);
    osc.start(a);
    osc.stop(b + 0.02);
    if (b >= end) { end = b; last = osc; }
    return osc;
  });
  return group(oscs, last);
}
