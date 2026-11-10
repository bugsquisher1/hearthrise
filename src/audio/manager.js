// ════════════════════════════════════════════════════════════════════════
// src/audio/manager.js — THE ONE MIXER (Web Audio): FOUR BUSES, A FEW VOICES.
//
// PURE of the DOM: it is handed the AudioContext constructor, fetch and a clock
// (tests/sound.mjs drives it with fakes). Rows come from src/data/sounds.js.
//
//   play(id, { lateMs })   one shot. Refused, in this order, when: sound is off;
//        no gesture has unlocked audio yet (the browser's autoplay rule: a sound
//        before the first tap is dropped, never queued to burst out later); the
//        page is hidden; the id is not in the map; the event is older than the
//        row's lateMs; the row's cooldown or its own voices are spent; every voice
//        is taken by sounds of equal or higher priority.
//   bed(slot, id | null)   the looping sound of a slot ('ambience', 'music'),
//        cross-faded; remembered while locked or hidden and started when it can.
//   unlock()               the first gesture (src/audio/mount.js): the context is
//        made HERE, never earlier, so the page makes no sound object until tapped.
//   setLevels(levels)      { bus: { vol 0-100, mute } } from the player's pick
//   setHidden(on)          a hidden tab goes quiet at once and holds its clock
//
// FILES: a row's file is fetched on its FIRST use, once. A file that is missing
// or will not decode is remembered as silent and never asked for again (no 404
// storm, no console error). With mode 'off' nothing is ever fetched; with mode
// 'tones' nothing is fetched either: src/audio/tones.js makes each voice.
//
// Sound is never read back by the game: nothing here gates, spends or decides.
// ════════════════════════════════════════════════════════════════════════

const gainOf = (level) => (level && !level.mute ? Math.pow(Math.max(0, Math.min(100, level.vol)) / 100, 2) : 0);

/**
 * @param {object} o
 * @param {'off'|'files'|'tones'} o.mode
 * @param {object} o.sounds   src/data/sounds.js SOUNDS
 * @param {object} o.limits   src/data/sounds.js SOUND_LIMITS
 * @param {string[]} o.buses  bus ids, master first
 * @param {Function} [o.AudioContext]  the constructor (window.AudioContext)
 * @param {Function} [o.fetch]         (url) => Promise<Response>
 * @param {(file: string) => string} [o.urlOf]
 * @param {() => number} [o.now]       ms
 * @param {() => number} [o.random]    0..1
 * @param {object} [o.tones]           src/audio/tones.js (mode 'tones')
 */
export function createSoundManager(o) {
  const { mode, sounds, limits } = o;
  const now = o.now || (() => Date.now());
  const random = o.random || Math.random;
  const urlOf = o.urlOf || ((f) => f);
  const [masterId, ...busIds] = o.buses;
  let ctx = null, master = null, hidden = false, dead = false;
  let levels = {};
  const busGain = new Map();          // bus id -> GainNode
  const lastAt = new Map();           // sound id -> ms it last started
  const buffers = new Map();          // sound id -> AudioBuffer | Promise | null (missing: stays silent)
  const voices = [];                  // { id, row, src, gain, at }
  const beds = new Map();             // slot -> { want, id, voice }
  const ducks = new Set();
  const stats = { played: 0, dropped: 0, requests: 0 };

  const on = () => mode !== 'off' && !dead;
  const ready = () => on() && !!ctx && !hidden;
  const ramp = (param, to, ms) => {
    const t = ctx.currentTime;
    if (typeof param.cancelScheduledValues === 'function') param.cancelScheduledValues(t);
    if (typeof param.setTargetAtTime === 'function' && ms > 0) param.setTargetAtTime(to, t, ms / 3000); else param.value = to;
  };
  const ducked = (id) => ducks.size > 0 && limits.duckBuses.includes(id);
  function applyLevels(ms) {
    if (!ctx) return;
    ramp(master.gain, hidden ? 0 : gainOf(levels[masterId]), ms);
    for (const id of busIds) ramp(busGain.get(id).gain, gainOf(levels[id]) * (ducked(id) ? limits.duckTo : 1), ms);
  }

  /* The file's decoded sound: fetched once, on first use. Null from then on when it is missing or unreadable. */
  function bufferOf(id, row) {
    if (buffers.has(id)) return buffers.get(id);
    stats.requests++;
    const p = Promise.resolve().then(() => o.fetch(urlOf(row.file)))
      .then((res) => (res && res.ok ? res.arrayBuffer() : null))
      .then((bytes) => (bytes ? ctx.decodeAudioData(bytes) : null))
      .then((buf) => buf || null, () => null)
      .then((buf) => { buffers.set(id, buf); return buf; });
    buffers.set(id, p);
    return p;
  }

  const drop = (v) => {
    const i = voices.indexOf(v);
    if (i >= 0) voices.splice(i, 1);
  };
  function stop(v, fadeMs) {
    drop(v);
    try {
      if (fadeMs > 0) { ramp(v.gain.gain, 0, fadeMs); v.src.stop(ctx.currentTime + fadeMs / 1000); } else v.src.stop();
    } catch (e) { /* already ended */ }
  }

  /* One voice of `row` into its bus: a file's buffer, or a tone made for it. Null when there is nothing to play. */
  function start(id, row, buf) {
    const gain = ctx.createGain();
    gain.gain.value = row.vol;
    gain.connect(busGain.get(row.bus));
    const rate = 1 + (random() * 2 - 1) * row.pitch;
    let src;
    if (mode === 'tones') src = o.tones.voice(ctx, id, row, gain, rate);
    else {
      src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = row.loop;
      src.playbackRate.value = rate;
      src.connect(gain);
      src.start();
    }
    if (!src) return null;
    const v = { id, row, src, gain, at: now() };
    voices.push(v);
    if (!row.loop) src.onended = () => drop(v);
    return v;
  }

  function duck(ms) {
    const token = {};
    ducks.add(token);
    applyLevels(limits.duckFadeMs);
    (o.setTimer || setTimeout)(() => { ducks.delete(token); if (ctx && !dead) applyLevels(limits.duckFadeMs * 4); }, ms);
  }

  function play(id, opts) {
    const row = Object.prototype.hasOwnProperty.call(sounds, id) ? sounds[id] : null;
    const no = () => { stats.dropped++; return false; };
    if (!ready() || !row || row.loop) return no();
    const late = opts && Number.isFinite(opts.lateMs) ? opts.lateMs : 0;
    if (row.lateMs !== null && late > row.lateMs) return no();
    const t = now();
    if (lastAt.has(id) && t - lastAt.get(id) < row.cooldownMs) return no();
    if (voices.filter((v) => v.id === id).length >= row.voices) return no();
    const shots = voices.filter((v) => !v.row.loop);
    if (shots.length >= limits.voices) {
      const weakest = shots.reduce((a, b) => (b.row.priority < a.row.priority || (b.row.priority === a.row.priority && b.at < a.at) ? b : a));
      if (weakest.row.priority >= row.priority) return no();
      stop(weakest, 30);
    }
    /* the cooldown starts when the event is taken, not when its file lands: eight deaths in one frame are still one sound */
    lastAt.set(id, t);
    const go = (buf) => { if (!ready() || (mode !== 'tones' && !buf) || !start(id, row, buf)) return false; stats.played++; if (row.duckMs) duck(row.duckMs); return true; };
    if (mode === 'tones') return go(null);
    const buf = bufferOf(id, row);
    if (buf && typeof buf.then === 'function') { buf.then((b) => { if (now() - t <= limits.firstUseMs) go(b); }); return true; }
    return go(buf);
  }

  /* Bring each slot's sounding bed to the one wanted (a cross-fade), once audio can play. */
  function syncBeds() {
    if (!ready()) return;
    for (const [slot, b] of beds) {
      if (b.id === b.want) continue;
      if (b.voice) { stop(b.voice, limits.bedFadeMs); b.voice = null; }
      b.id = b.want;
      const row = b.id ? sounds[b.id] : null;
      if (!row) continue;
      const begin = (buf) => {
        if (!ready() || beds.get(slot) !== b || b.id !== b.want || b.voice || (mode !== 'tones' && !buf)) return;
        const v = start(b.id, row, buf);
        if (!v) return;
        v.gain.gain.value = 0;
        ramp(v.gain.gain, row.vol, limits.bedFadeMs);
        b.voice = v;
      };
      if (mode === 'tones') { begin(null); continue; }
      const buf = bufferOf(b.id, row);
      if (buf && typeof buf.then === 'function') buf.then(begin); else begin(buf);
    }
  }

  return {
    mode,
    play,
    bed(slot, id) {
      if (!on()) return;
      const want = id && sounds[id] && sounds[id].loop && sounds[id].bus === slot ? id : null;
      const b = beds.get(slot) || { want: null, id: null, voice: null };
      b.want = want;
      beds.set(slot, b);
      syncBeds();
    },
    /** The first gesture. True once audio can play. */
    unlock() {
      if (!on() || typeof o.AudioContext !== 'function') return false;
      if (!ctx) {
        try { ctx = new o.AudioContext(); } catch (e) { ctx = null; return false; }
        master = ctx.createGain();
        master.connect(ctx.destination);
        for (const id of busIds) { const g = ctx.createGain(); g.connect(master); busGain.set(id, g); }
        applyLevels(0);
      }
      if (!hidden && ctx.state === 'suspended' && typeof ctx.resume === 'function') Promise.resolve(ctx.resume()).catch(() => {});
      syncBeds();
      return true;
    },
    unlocked: () => !!ctx,
    setLevels(next) { levels = next || {}; applyLevels(40); },
    setHidden(is) {
      hidden = is === true;
      if (!ctx) return;
      applyLevels(limits.hiddenFadeMs);
      if (hidden) {
        for (const v of voices.filter((x) => !x.row.loop)) stop(v, 0);
        if (typeof ctx.suspend === 'function') Promise.resolve(ctx.suspend()).catch(() => {});
      } else {
        if (typeof ctx.resume === 'function') Promise.resolve(ctx.resume()).catch(() => {});
        syncBeds();
      }
    },
    /** For tests and ?debug: what has played, what was dropped, how many files were asked for, what rings now. */
    stats: () => Object.assign({}, stats, { voices: voices.map((v) => v.id), beds: Object.fromEntries(Array.from(beds, ([k, b]) => [k, b.voice ? b.id : null])) }),
    destroy() {
      dead = true;
      for (const v of voices.slice()) stop(v, 0);
      beds.clear();
      if (ctx && typeof ctx.close === 'function') Promise.resolve(ctx.close()).catch(() => {});
      ctx = null;
    },
  };
}
