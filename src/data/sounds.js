// ════════════════════════════════════════════════════════════════════════
// src/data/sounds.js — THE SOUND MAP: ONE ROW PER SOUND EVENT.
//
// Loaded only when sound is on (src/data/sound-buses.js SOUND.shipped, or the
// page's ?sound=tones), by src/audio/mount.js: never part of the first screen.
// A new sound is a row here and, if nothing raises it yet, one cue() where the
// client already draws that moment (src/audio/watch.js). tests/sound.mjs holds
// both halves: every id raised exists here, every row here is raised.
//
// A ROW  id → { file, bus, vol, pitch, cooldownMs, voices, priority, lateMs, loop, duckMs }
//   file        under assets/audio/. NONE EXISTS YET: the manager asks for a file
//               only when the switch is on, once, and a missing one stays silent
//   bus         effects | ambience | music (src/data/sound-buses.js; master is over all)
//   vol         0..1 of its bus
//   pitch       each play is tuned by up to this much either way (0.08 = 8%), so
//               the tenth blow does not sound like the first played again
//   cooldownMs  the same sound is not started again inside this window: a pack of
//               eight dying in one pull is one or two deaths, never eight
//   voices      how many of this sound may ring at once
//   priority    when every voice is taken (SOUND_LIMITS.voices), a higher one
//               takes the oldest lower one's place; an equal or lower one is dropped
//   lateMs      an event drawn this long after its moment is not sounded (a
//               catch-up after a hidden tab, a restarted prediction). null: a
//               moment that sounds whenever the server tells it (a rare drop)
//   loop        a bed: it plays while its place is on screen (BEDS), cross-faded
//   duckMs      while it rings, ambience and music drop to SOUND_LIMITS.duckTo
//
// SOUND, NEVER TRUTH. Every event is raised from what the screen already shows
// (the viewed hero's timeline as it plays, the envelope, the alerts, the intent
// ledger); nothing reads a sound back. PURE ESM. Data only.
// ════════════════════════════════════════════════════════════════════════
import { ELEMENTS } from './elements.js?v=0.2.114';
import { HUNT_INDEX } from './hunts.js?v=0.2.114';
import { STATION_BY_ID } from './world/stations.js?v=0.2.114';
import { ALERT_INDEX } from './alerts.js?v=0.2.114';
import { SOUND_BUSES } from './sound-buses.js?v=0.2.114';

export const SOUND_ROOT = 'assets/audio/';

/* The mixer's own bounds. `firstUseMs`: a file still loading when its event fires is played if it lands inside this, else that play is skipped. */
export const SOUND_LIMITS = Object.freeze({ voices: 12, duckTo: 0.35, duckBuses: Object.freeze(['ambience', 'music']), duckFadeMs: 120, bedFadeMs: 900, hiddenFadeMs: 60, firstUseMs: 250 });

const DEFAULTS = Object.freeze({ vol: 1, pitch: 0, cooldownMs: 0, voices: 1, priority: 2, lateMs: 400, loop: false, duckMs: 0 });
const row = (bus, file, o) => Object.freeze(Object.assign({}, DEFAULTS, { bus, file: SOUND_ROOT + file }, o));
const fx = (file, o) => row('effects', file, o);
const bed = (file, o) => row('ambience', file, Object.assign({ loop: true, lateMs: null }, o));
const MOMENT = Object.freeze({ lateMs: null });

export const SOUNDS = Object.freeze({
  /* ── the fight, from the viewed hero's timeline as each event is drawn ── */
  hero_hit: fx('combat/hero-hit.ogg', { vol: 0.5, pitch: 0.08, cooldownMs: 240, voices: 2, priority: 1 }),
  hero_hurt: fx('combat/hero-hurt.ogg', { vol: 0.7, pitch: 0.06, cooldownMs: 400, voices: 2, priority: 3 }),
  ally_hurt: fx('combat/ally-hurt.ogg', { vol: 0.35, pitch: 0.08, cooldownMs: 500, voices: 1, priority: 1 }),
  blow_miss: fx('combat/blow-miss.ogg', { vol: 0.3, pitch: 0.1, cooldownMs: 700, voices: 1, priority: 0 }),
  cast_fire: fx('spells/cast-fire.ogg', { vol: 0.7, pitch: 0.05, cooldownMs: 250, voices: 2, priority: 3 }),
  cast_ice: fx('spells/cast-ice.ogg', { vol: 0.7, pitch: 0.05, cooldownMs: 250, voices: 2, priority: 3 }),
  cast_poison: fx('spells/cast-poison.ogg', { vol: 0.6, pitch: 0.05, cooldownMs: 250, voices: 2, priority: 3 }),
  cast_heal: fx('spells/cast-heal.ogg', { vol: 0.45, pitch: 0.04, cooldownMs: 1200, voices: 1, priority: 2 }),
  cast_ward: fx('spells/cast-ward.ogg', { vol: 0.6, pitch: 0.04, cooldownMs: 400, voices: 1, priority: 3 }),
  cast_strike: fx('spells/cast-strike.ogg', { vol: 0.65, pitch: 0.06, cooldownMs: 250, voices: 2, priority: 3 }),
  cast_shout: fx('spells/cast-shout.ogg', { vol: 0.55, pitch: 0.05, cooldownMs: 1000, voices: 1, priority: 2 }),
  monster_die: fx('combat/monster-die.ogg', { vol: 0.6, pitch: 0.12, cooldownMs: 250, voices: 2, priority: 3 }),
  boss_phase: fx('combat/boss-phase.ogg', { vol: 0.9, cooldownMs: 2000, priority: 7, lateMs: 2000, duckMs: 1500 }),
  eat: fx('combat/eat.ogg', { vol: 0.35, pitch: 0.08, cooldownMs: 600, priority: 1 }),
  drink: fx('combat/drink.ogg', { vol: 0.35, pitch: 0.08, cooldownMs: 600, priority: 1 }),
  loot_common: fx('loot/loot-common.ogg', { vol: 0.4, pitch: 0.1, cooldownMs: 450, priority: 2 }),
  /* THE RARE DROP: the most important sound in the game. It is never dropped for age, takes a voice from anything, and the world steps back for it. */
  loot_rare: fx('loot/loot-rare.ogg', Object.assign({ vol: 1, cooldownMs: 1500, priority: 9, duckMs: 2600 }, MOMENT)),
  level_up: fx('moments/level-up.ogg', Object.assign({ vol: 0.95, cooldownMs: 1500, priority: 8, duckMs: 2200 }, MOMENT)),
  skill_up: fx('moments/skill-up.ogg', Object.assign({ vol: 0.8, cooldownMs: 800, priority: 7 }, MOMENT)),
  hero_death: fx('moments/hero-death.ogg', Object.assign({ vol: 0.95, cooldownMs: 3000, priority: 9, duckMs: 3000 }, MOMENT)),
  /* ── the hunt's edges, from the envelope ── */
  hunt_start: fx('moments/hunt-start.ogg', Object.assign({ vol: 0.8, cooldownMs: 2000, priority: 6 }, MOMENT)),
  hunt_end: fx('moments/hunt-end.ogg', Object.assign({ vol: 0.8, cooldownMs: 2000, priority: 6 }, MOMENT)),
  /* ── the windows and the counter ── */
  window_open: fx('ui/window-open.ogg', Object.assign({ vol: 0.4, pitch: 0.04, cooldownMs: 80, priority: 2 }, MOMENT)),
  window_close: fx('ui/window-close.ogg', Object.assign({ vol: 0.35, pitch: 0.04, cooldownMs: 80, priority: 2 }, MOMENT)),
  ui_press: fx('ui/press.ogg', Object.assign({ vol: 0.3, pitch: 0.06, cooldownMs: 60, voices: 2, priority: 1 }, MOMENT)),
  purchase: fx('ui/purchase.ogg', Object.assign({ vol: 0.7, pitch: 0.05, cooldownMs: 250, priority: 5 }, MOMENT)),
  refusal: fx('ui/refusal.ogg', Object.assign({ vol: 0.5, cooldownMs: 400, priority: 5 }, MOMENT)),
  /* ── other people ── */
  chat_message: fx('social/chat-message.ogg', Object.assign({ vol: 0.35, pitch: 0.05, cooldownMs: 1500, priority: 2 }, MOMENT)),
  party_invite: fx('social/party-invite.ogg', Object.assign({ vol: 0.8, cooldownMs: 2000, priority: 6 }, MOMENT)),
  /* ── the beds: the town by place, a hunt by its ground ── */
  amb_town: bed('ambience/town-square.ogg', { vol: 0.5 }),
  amb_forge: bed('ambience/forge.ogg', { vol: 0.55 }),
  amb_hearth: bed('ambience/hearth.ogg', { vol: 0.55 }),
  amb_farm: bed('ambience/farm.ogg', { vol: 0.5 }),
  amb_yard: bed('ambience/training-yard.ogg', { vol: 0.5 }),
  amb_cellar: bed('ambience/cellar.ogg', { vol: 0.5 }),
  amb_sewer: bed('ambience/sewer.ogg', { vol: 0.5 }),
  amb_wilds: bed('ambience/wilds.ogg', { vol: 0.5 }),
  amb_warren: bed('ambience/warren.ogg', { vol: 0.5 }),
  amb_glade: bed('ambience/glade.ogg', { vol: 0.5 }),
  amb_ruin: bed('ambience/ruin.ogg', { vol: 0.5 }),
  music_town: row('music', 'music/town.ogg', { vol: 0.6, loop: true, lateMs: null }),
  music_hunt: row('music', 'music/hunt.ogg', { vol: 0.6, loop: true, lateMs: null }),
});

/* ── WHICH SOUND, WHERE THE CHOICE IS DATA (read by src/audio/watch.js) ── */

/* A cast is heard by its family, read off the ability's own row (src/data/abilities.js): a new spell needs no row here. */
export const CAST_SOUNDS = Object.freeze({
  element: Object.freeze({ ember: 'cast_fire', frost: 'cast_ice', poison: 'cast_poison' }),
  heal: 'cast_heal', shield: 'cast_ward', support: 'cast_shout', strike: 'cast_strike',
});
/** The sound of casting `ability` (an abilities.js row), or null for none (a basic swing is its blow). */
export function castSoundOf(ability) {
  if (!ability || ability.id === 'basic') return null;
  if (ability.heal) return CAST_SOUNDS.heal;
  if (ability.shield) return CAST_SOUNDS.shield;
  if (ability.element && CAST_SOUNDS.element[ability.element]) return CAST_SOUNDS.element[ability.element];
  return ability.lane === 'support' ? CAST_SOUNDS.support : CAST_SOUNDS.strike;
}

/* The beds of a place: `ambience` and `music`, each one looping sound or none.
   TOWN: by the station the SERVER stands the hero at (src/data/world/stations.js); a station not named hears the square.
   HUNT: by ground. A ground not named here hears the wilds, so a new ground is never silent and never needs a row to ship. */
export const BEDS = Object.freeze({
  town: Object.freeze({ ambience: 'amb_town', music: 'music_town' }),
  hunt: Object.freeze({ ambience: 'amb_wilds', music: 'music_hunt' }),
  station: Object.freeze({ smithy_forges: 'amb_forge', smithy_benches: 'amb_forge', hearth: 'amb_hearth', farm: 'amb_farm', training_yard: 'amb_yard' }),
  ground: Object.freeze({
    mill_cellar: 'amb_cellar', bramble_edge: 'amb_wilds', goblin_warren: 'amb_warren', ridge_camp: 'amb_wilds',
    millrace_sewer: 'amb_sewer', meadowbrook_thicket: 'amb_wilds', coppercap_warrens: 'amb_warren', mosslight_glade: 'amb_glade',
    wickstead: 'amb_ruin', millrace_sewer_called: 'amb_sewer', coppercap_warrens_called: 'amb_warren',
  }),
});
/** { ambience, music } for a place: { hunt: id } or { station: id | null }. */
export function bedsOf(place) {
  if (place && typeof place.hunt === 'string') return { ambience: BEDS.ground[place.hunt] || BEDS.hunt.ambience, music: BEDS.hunt.music };
  const st = place && typeof place.station === 'string' ? place.station : null;
  return { ambience: (st && BEDS.station[st]) || BEDS.town.ambience, music: BEDS.town.music };
}

/* An alert (src/data/alerts.js) that is heard as it fires. `offscreen`: only for a hero that is not the one on screen, whose own timeline already sounds it. */
export const ALERT_SOUNDS = Object.freeze({
  invite: Object.freeze({ sound: 'party_invite' }),
  whisper: Object.freeze({ sound: 'chat_message' }),
  rare: Object.freeze({ sound: 'loot_rare', offscreen: true }),
  death: Object.freeze({ sound: 'hero_death', offscreen: true }),
});

/* An ask the server said yes to that moved gold over a counter (src/session/intent-ledger.js verbs): coins. */
export const PURCHASE_VERB = /(^|_)(buy|sell|refill|upgrade|build|temper|hallmark)(_|$)/;

/** Every sound id the tables above can name (tests/sound.mjs: each exists, and with the cue() literals they cover the map). */
export function tableSoundIds() {
  return Array.from(new Set([...Object.values(CAST_SOUNDS.element), CAST_SOUNDS.heal, CAST_SOUNDS.shield, CAST_SOUNDS.support, CAST_SOUNDS.strike,
    ...Object.values(BEDS.town), ...Object.values(BEDS.hunt), ...Object.values(BEDS.station), ...Object.values(BEDS.ground),
    ...Object.values(ALERT_SOUNDS).map((a) => a.sound)]));
}

/** Every problem with the map and its tables, as strings. Empty = valid. */
export function validateSounds(sounds = SOUNDS, beds = BEDS) {
  const out = [];
  const buses = new Set(SOUND_BUSES.map((b) => b.id));
  const files = new Map();
  for (const [id, r] of Object.entries(sounds)) {
    const at = 'sound ' + id + ': ';
    if (!/^[a-z][a-z0-9_]{1,31}$/.test(id)) out.push(at + 'bad id');
    if (!buses.has(r.bus) || r.bus === 'master') out.push(at + 'unknown bus ' + r.bus);
    if (typeof r.file !== 'string' || !new RegExp('^' + SOUND_ROOT + '[a-z]+/[a-z0-9-]+\\.ogg$').test(r.file)) out.push(at + 'its file must be ' + SOUND_ROOT + '<folder>/<name>.ogg');
    if (files.has(r.file)) out.push(at + 'shares its file with ' + files.get(r.file));
    files.set(r.file, id);
    if (!(r.vol > 0 && r.vol <= 1)) out.push(at + 'vol must be over 0 and at most 1');
    if (!(r.pitch >= 0 && r.pitch <= 0.2)) out.push(at + 'pitch must be 0 to 0.2');
    if (!Number.isInteger(r.cooldownMs) || r.cooldownMs < 0) out.push(at + 'cooldownMs must be a whole number');
    if (!Number.isInteger(r.voices) || r.voices < 1 || r.voices > SOUND_LIMITS.voices) out.push(at + 'voices must be 1 to ' + SOUND_LIMITS.voices);
    if (!Number.isInteger(r.priority) || r.priority < 0 || r.priority > 9) out.push(at + 'priority must be 0 to 9');
    if (r.lateMs !== null && !(Number.isInteger(r.lateMs) && r.lateMs > 0)) out.push(at + 'lateMs must be null or a whole number');
    if (r.loop !== (r.bus !== 'effects')) out.push(at + 'a bed loops and sits on ambience or music; an effect does neither');
    /* a one-shot that many things raise at once must hold a limit of its own, or a pack is a wall of noise */
    if (!r.loop && r.cooldownMs < 60) out.push(at + 'an effect needs a cooldown of 60 ms or more');
    if (!Number.isInteger(r.duckMs) || r.duckMs < 0) out.push(at + 'duckMs must be a whole number');
  }
  for (const id of tableSoundIds()) if (!sounds[id]) out.push('a table names `' + id + '`, which is not in the map');
  for (const e of ELEMENTS) if (!CAST_SOUNDS.element[e]) out.push('element ' + e + ' has no cast sound');
  for (const id of Object.keys(beds.ground)) if (!HUNT_INDEX[id]) out.push('BEDS.ground names `' + id + '`, which is not a hunt');
  for (const id of Object.keys(beds.station)) if (!STATION_BY_ID[id]) out.push('BEDS.station names `' + id + '`, which is not a station');
  for (const id of Object.keys(ALERT_SOUNDS)) if (!ALERT_INDEX[id]) out.push('ALERT_SOUNDS names `' + id + '`, which is not an alert kind');
  for (const k of ['ambience', 'music']) for (const place of [beds.town, beds.hunt]) if (!sounds[place[k]] || sounds[place[k]].bus !== k) out.push('the default ' + k + ' bed must be a row on the ' + k + ' bus');
  for (const id of [...Object.values(beds.station), ...Object.values(beds.ground)]) if (sounds[id] && sounds[id].bus !== 'ambience') out.push('bed ' + id + ' must sit on the ambience bus');
  return out;
}
