#!/usr/bin/env node
// ════════════════════════════════════════════════════════════════════════
// tests/sound.mjs — SOUND: THE MAP, THE MIXER AND THE WATCHER (src/audio/**)
//
//   node tests/sound.mjs             the guard
//   node tests/sound.mjs --selftest  plants each defect into a temp copy; every one must go RED
//
// mutant-anchors: src/audio/manager.js src/audio/watch.js src/audio/mount.js src/data/sounds.js src/data/sound-buses.js src/app/boot.js
//
// Tyler 2026-11-10 approved sound. It ships switched off and silent (no file
// exists yet), so what is held here is the system:
//   THE SWITCH   SND-1  off: nothing is built, asked for or played, and while it is off no page asks for the audio home
//                SND-2  the audio home is never part of the first screen (no literal import reaches it; play.html preloads none of it)
//                SND-3  when the switch is on, every file the map names exists
//   THE MIXER    SND-4  nothing plays before a gesture, and no audio object exists before it (a phone's first tap unlocks)
//                SND-5  a file is asked for on first use, once; a missing file stays silent and is never asked for again
//                SND-6  a pack dying is one sound: the cooldown and the row's voices hold
//                SND-7  every voice taken: a rare drop takes a lesser sound's place, a lesser sound is dropped
//                SND-8  the four volumes and mutes reach the buses
//                SND-9  a hidden tab is silent, and comes back
//                SND-10 an event drawn late is not sounded; a moment (the rare drop) is, whenever it comes
//                SND-11 a moment ducks the ambience and the music, then lets them back
//                SND-12 a bed waits for the gesture, loops, and gives way to the next place
//                SND-13 ?sound=tones makes every sound of the map from oscillators and asks for no file
//   THE MAP      SND-14 the map and its tables are valid
//                SND-15 every id raised in code is in the map; every row of the map is raised somewhere
//   THE WATCHER  SND-16 each moment sounds once: a monster's death under a second id, a hero's death by two roads, a level by two roads
//                SND-17 a new view is not news: what a hero, the alerts and the chat already hold makes no sound
//                SND-18 the envelope's edges, the alerts, the ledger, the chat and the windows each raise their sound
//   THE PAGE     SND-19 off, nothing is mounted; a tap, a click or a key unlocks (phones: touchend); a press ticks; a hidden page is quiet
// ════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, cpSync, rmSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const tick = () => new Promise((r) => setTimeout(r, 0));

/* A Web Audio stand-in: enough of the API to see what was built, connected, started and stopped. */
function fakeAudio() {
  const made = [];
  class Param { constructor(v) { this.value = v; } setTargetAtTime(v) { this.value = v; } setValueAtTime(v) { this.value = v; } linearRampToValueAtTime(v) { this.value = v; } cancelScheduledValues() {} }
  class Node { connect(to) { this.to = to; return to; } }
  class Gain extends Node { constructor() { super(); this.gain = new Param(1); } }
  class Src extends Node {
    constructor(ctx, kind) { super(); this.ctx = ctx; this.kind = kind; this.playbackRate = new Param(1); this.frequency = new Param(440); this.started = false; this.stopped = false; ctx.sources.push(this); }
    start() { this.started = true; }
    /* a stop in the future is only booked (a tone's own end, a fade): end() is that moment arriving */
    stop(when) { if (Number.isFinite(when) && when > this.ctx.currentTime) { this.booked = true; return; } this.end(); }
    end() { if (this.stopped) return; this.stopped = true; if (typeof this.onended === 'function') this.onended(); }
  }
  class Ctx {
    constructor() { made.push(this); this.currentTime = 0; this.state = 'suspended'; this.sampleRate = 4000; this.destination = new Node(); this.sources = []; this.gains = []; this.decoded = 0; }
    createGain() { const g = new Gain(); this.gains.push(g); return g; }
    createBufferSource() { return new Src(this, 'buffer'); }
    createOscillator() { return new Src(this, 'osc'); }
    createBiquadFilter() { const n = new Node(); n.frequency = new Param(0); return n; }
    createBuffer(ch, len) { return { getChannelData: () => new Float32Array(len) }; }
    decodeAudioData() { this.decoded++; return Promise.resolve({ decoded: true }); }
    resume() { this.state = 'running'; return Promise.resolve(); }
    suspend() { this.state = 'suspended'; return Promise.resolve(); }
    close() { this.state = 'closed'; return Promise.resolve(); }
  }
  return { Ctx, made };
}

function walk(base, dir, out = []) {
  const at = join(base, dir);
  if (!existsSync(at)) return out;
  for (const n of readdirSync(at).sort()) {
    const p = dir + '/' + n;
    if (statSync(join(base, p)).isDirectory()) { if (n !== 'vendor') walk(base, p, out); } else if (p.endsWith('.js')) out.push(p);
  }
  return out;
}

async function check(base) {
  const u = (p) => pathToFileURL(join(base, p)).href;
  const text = (p) => readFileSync(join(base, p), 'utf8');
  const B = await import(u('src/data/sound-buses.js'));
  const D = await import(u('src/data/sounds.js'));
  const { createSoundManager } = await import(u('src/audio/manager.js'));
  const T = await import(u('src/audio/tones.js'));
  const { watchSound } = await import(u('src/audio/watch.js'));
  const { charXpForLevel } = await import(u('src/core/xp.js'));
  const errs = [];
  const must = (ok, msg) => { if (!ok) errs.push(msg); };
  const buses = B.SOUND_BUSES.map((b) => b.id);

  /* One mixer over fakes: its clock, its fetches (`missing`: files that 404), its timers. */
  const rig = (mode, o = {}) => {
    const audio = fakeAudio();
    const r = { audio, clock: 1000, fetched: [], timers: [], missing: new Set(o.missing || []) };
    r.m = createSoundManager({
      mode, sounds: o.sounds || D.SOUNDS, limits: D.SOUND_LIMITS, buses, tones: mode === 'tones' ? T : null,
      AudioContext: audio.Ctx, now: () => r.clock, random: () => 0.5, setTimer: (fn, ms) => r.timers.push([fn, ms]),
      fetch: (url) => { r.fetched.push(url); return Promise.resolve(r.missing.has(url) ? { ok: false, status: 404 } : { ok: true, arrayBuffer: () => Promise.resolve(new ArrayBuffer(8)) }); },
    });
    r.ctx = () => audio.made[0] || null;
    r.started = () => (r.ctx() ? r.ctx().sources.filter((s) => s.started).length : 0);
    r.ringing = () => (r.ctx() ? r.ctx().sources.filter((s) => s.started && !s.stopped).length : 0);
    /* every booked stop arrives (a fade runs out, a tone ends) */
    r.pass = () => { for (const s of r.ctx().sources) if (s.booked) s.end(); };
    return r;
  };
  const levels = (over) => Object.assign(Object.fromEntries(buses.map((id) => [id, { vol: 100, mute: false }])), over || {});

  /* ── SND-1: off ── */
  must(B.soundModeOf('') === (B.SOUND.shipped ? 'files' : 'off') && B.soundModeOf('?sound=tones') === 'tones' && B.soundModeOf('?sound=1') === B.soundModeOf(''), 'SND-1 the mode is the switch, and ?sound=tones alone asks for tones');
  {
    const r = rig('off');
    r.m.bed('ambience', 'amb_town');
    const ok = r.m.unlock() === false && r.m.play('loot_rare') === false;
    await tick();
    must(ok && r.audio.made.length === 0 && r.fetched.length === 0, 'SND-1 off must build no audio context, ask for no file and play nothing (contexts ' + r.audio.made.length + ', files ' + r.fetched.length + ')');
  }
  const boot = text('src/app/boot.js');
  must(/if \(soundModeOf\(win\.location\.search\) !== 'off'\) \{[^}]*import\(SOUND_URL\)/.test(boot), 'SND-1 boot.js must ask for the audio home only when sound is not off');

  /* ── SND-2: never on the first screen ── */
  {
    const lazy = /(?:from\s*|import\s*\(\s*|import\s*)['"][^'"]*(?:\/audio\/|\/sounds\.js)[^'"]*['"]/;
    const reach = walk(base, 'src').filter((f) => !f.startsWith('src/audio/') && f !== 'src/data/sounds.js' && lazy.test(text(f)));
    must(!reach.length, 'SND-2 a literal import reaches the audio home from ' + reach.join(', ') + ': play.html would preload it for every page');
    const page = readFileSync(join(ROOT, 'play.html'), 'utf8');
    must(!/src\/audio\/|src\/data\/sounds\.js/.test(page), 'SND-2 play.html names an audio module: the first screen must not fetch it');
    must(/const SOUND_URL = new URL\('\.\.\/audio\/mount\.js\?v=/.test(boot), 'SND-2 boot.js must reach the audio home through SOUND_URL, never a literal import()');
  }

  /* ── SND-3: shipped means the files exist ── */
  if (B.SOUND.shipped) for (const [id, r] of Object.entries(D.SOUNDS)) must(existsSync(join(ROOT, r.file)), 'SND-3 the switch is on but ' + r.file + ' (' + id + ') does not exist');

  /* ── SND-4: no play before a gesture ── */
  {
    const r = rig('files');
    const before = r.m.play('hero_hit');
    await tick();
    must(before === false && r.audio.made.length === 0 && r.fetched.length === 0, 'SND-4 before a gesture nothing may play, be built or be fetched');
    must(r.m.unlock() === true && r.audio.made.length === 1 && r.ctx().state === 'running' && r.fetched.length === 0, 'SND-4 the first gesture must make the one context and resume it, and fetch nothing yet');
    r.m.unlock();
    must(r.audio.made.length === 1, 'SND-4 a second gesture must not make a second context');
  }

  /* ── SND-5: lazy files, a missing file is silent for good ── */
  {
    const r = rig('files');
    r.m.unlock();
    r.m.setLevels(levels());
    const first = r.m.play('hero_hit');
    await tick(); await tick();
    must(first === true && r.fetched.length === 1 && r.fetched[0] === D.SOUNDS.hero_hit.file && r.started() === 1, 'SND-5 the first use must fetch that one file and play it (fetched ' + JSON.stringify(r.fetched) + ', started ' + r.started() + ')');
    r.clock += 1000;
    r.m.play('hero_hit');
    await tick();
    must(r.fetched.length === 1 && r.started() === 2, 'SND-5 a second use must play from memory, with no second fetch');
    const gone = rig('files', { missing: [D.SOUNDS.monster_die.file] });
    const said = [];
    const real = console.error;
    console.error = (...a) => said.push(a);
    try {
      gone.m.unlock();
      for (let i = 0; i < 5; i++) { gone.m.play('monster_die'); gone.clock += 1000; await tick(); await tick(); }
    } finally { console.error = real; }
    must(gone.fetched.length === 1 && gone.started() === 0 && said.length === 0, 'SND-5 a missing file must be asked for once, stay silent and log no error (asked ' + gone.fetched.length + ', errors ' + said.length + ')');
  }

  /* ── SND-6: a pack dying is one sound ── */
  {
    const r = rig('tones');
    r.m.unlock();
    r.m.setLevels(levels());
    const took = [];
    for (let i = 0; i < 8; i++) took.push(r.m.play('monster_die'));
    must(took.filter(Boolean).length === 1 && r.m.stats().voices.length === 1, 'SND-6 eight deaths in one frame must be one sound, got ' + took.filter(Boolean).length);
    r.clock += D.SOUNDS.monster_die.cooldownMs;
    must(r.m.play('monster_die') === true, 'SND-6 after its cooldown the sound plays again');
    r.clock += D.SOUNDS.monster_die.cooldownMs;
    must(D.SOUNDS.monster_die.voices === 2 && r.m.play('monster_die') === false && r.m.stats().voices.length === 2, 'SND-6 a sound must never ring on more than its own voices');
  }

  /* ── SND-7: every voice taken ── */
  {
    const row = (priority) => Object.assign({}, D.SOUNDS.hero_hit, { cooldownMs: 0, voices: 1, priority });
    const sounds = { rare: row(9), low: row(0) };
    for (let i = 0; i < D.SOUND_LIMITS.voices; i++) sounds['s' + i] = row(1);
    const r = rig('tones', { sounds });
    r.m.unlock();
    for (let i = 0; i < D.SOUND_LIMITS.voices; i++) { r.m.play('s' + i); r.clock += 1; }
    const low = r.m.play('low'), rare = r.m.play('rare');
    const v = r.m.stats().voices;
    must(low === false && rare === true && v.length === D.SOUND_LIMITS.voices && v.includes('rare') && !v.includes('s0'), 'SND-7 with every voice taken a lesser sound is dropped and a rare drop takes the oldest lesser voice (voices ' + v.join(',') + ')');
  }

  /* ── SND-8: the volumes reach the buses ── */
  {
    const r = rig('tones');
    r.m.unlock();
    r.m.setLevels(levels({ master: { vol: 50, mute: false }, ambience: { vol: 0, mute: false }, music: { vol: 100, mute: true } }));
    const g = r.ctx().gains.slice(0, 4).map((x) => x.gain.value);
    must(g[0] === 0.25 && g[1] === 1 && g[2] === 0 && g[3] === 0, 'SND-8 master 50%, effects 100%, ambience 0% and music muted must read 0.25, 1, 0, 0 on the buses, got ' + g.join(', '));
    r.m.setLevels(levels({ master: { vol: 100, mute: true } }));
    must(r.ctx().gains[0].gain.value === 0, 'SND-8 the master mute must silence everything');
    const pick = B.withSoundLevel(B.withSoundLevel(null, 'music', 'vol', 33, 5), 'effects', 'mute', true, 6);
    const lv = B.soundLevelsOf(pick);
    must(pick.at === 6 && lv.music.vol === 35 && lv.effects.mute === true && lv.master.vol === B.SOUND_BUSES[0].initial && lv.ambience.mute === false, 'SND-8 a pick keeps each press, on the setting\'s steps, over the defaults: ' + JSON.stringify(lv));
  }

  /* ── SND-9: a hidden tab ── */
  {
    const r = rig('tones');
    r.m.unlock();
    r.m.setLevels(levels());
    r.m.play('level_up');
    r.m.setHidden(true);
    const quiet = r.ctx().gains[0].gain.value === 0 && r.ctx().state === 'suspended' && r.m.stats().voices.length === 0 && r.m.play('loot_rare') === false;
    r.m.setHidden(false);
    r.clock += 5000;
    must(quiet && r.ctx().gains[0].gain.value === 1 && r.ctx().state === 'running' && r.m.play('loot_rare') === true, 'SND-9 a hidden tab must be silent (master 0, the context held, nothing ringing, no new sound) and sound again when shown');
  }

  /* ── SND-10: late events ── */
  {
    const r = rig('tones');
    r.m.unlock();
    must(r.m.play('hero_hit', { lateMs: D.SOUNDS.hero_hit.lateMs + 1 }) === false && r.m.play('hero_hit', { lateMs: D.SOUNDS.hero_hit.lateMs }) === true, 'SND-10 a blow drawn later than its lateMs must not sound');
    must(D.SOUNDS.loot_rare.lateMs === null && r.m.play('loot_rare', { lateMs: 600000 }) === true, 'SND-10 the rare drop must sound whenever the server tells it');
  }

  /* ── SND-11: the duck ── */
  {
    const r = rig('tones');
    r.m.unlock();
    r.m.setLevels(levels());
    r.m.play('loot_rare');
    const g = () => r.ctx().gains.slice(1, 4).map((x) => x.gain.value);
    const down = g();
    const back = r.timers.find(([, ms]) => ms === D.SOUNDS.loot_rare.duckMs);
    if (back) back[0]();
    must(down[0] === 1 && down[1] === D.SOUND_LIMITS.duckTo && down[2] === D.SOUND_LIMITS.duckTo && !!back && g().join() === '1,1,1', 'SND-11 the rare drop must duck ambience and music (not effects) and let them back after its duckMs, got ' + down.join(', ') + ' then ' + g().join(', '));
  }

  /* ── SND-12: beds ── */
  {
    const r = rig('files');
    r.m.bed('ambience', 'amb_town');
    await tick();
    const waited = r.fetched.length === 0 && r.audio.made.length === 0;
    r.m.unlock();
    await tick(); await tick();
    const town = r.ctx().sources.find((s) => s.started);
    must(waited && r.fetched.join() === D.SOUNDS.amb_town.file && !!town && town.loop === true && r.m.stats().beds.ambience === 'amb_town', 'SND-12 a bed must wait for the gesture, then fetch its one file and loop');
    r.m.bed('ambience', 'amb_forge');
    await tick(); await tick();
    r.pass();
    must(town && town.stopped && r.m.stats().beds.ambience === 'amb_forge' && r.ringing() === 1, 'SND-12 a new place must end the old bed and start its own');
    r.m.bed('ambience', 'loot_rare');
    await tick();
    r.pass();
    must(r.m.stats().beds.ambience === null && r.ringing() === 0 && r.m.play('amb_town') === false, 'SND-12 a one-shot is never a bed and a bed is never a one-shot');
  }

  /* ── SND-13: tones ── */
  {
    const r = rig('tones');
    r.m.unlock();
    r.m.setLevels(levels());
    const silent = [];
    for (const [id, row] of Object.entries(D.SOUNDS)) {
      const n = r.started();
      if (row.loop) { r.m.bed(row.bus, id); if (!T.BED_TONES[id]) silent.push(id); } else { r.m.play(id); if (!T.TONES[id]) silent.push(id); }
      if (r.started() === n) silent.push(id + ' (nothing started)');
      r.clock += 10000;
      r.pass();   // each tone ends before the next: this rule is about tones, not voices
    }
    must(!silent.length, 'SND-13 no tone of its own for: ' + silent.join(', '));
    const extra = [...Object.keys(T.TONES), ...Object.keys(T.BED_TONES)].filter((id) => !D.SOUNDS[id]);
    must(!extra.length && r.fetched.length === 0, 'SND-13 tones must ask for no file and name only sounds of the map (extra: ' + extra.join(', ') + '; fetched ' + r.fetched.length + ')');
  }

  /* ── SND-14: the map is valid ── */
  for (const p of D.validateSounds()) errs.push('SND-14 ' + p);
  must(Object.keys(D.SOUNDS).length >= 30 && D.SOUNDS.loot_rare.priority === Math.max(...Object.values(D.SOUNDS).map((r) => r.priority)), 'SND-14 the map must hold the game\'s sounds and nothing may outrank the rare drop');
  must(D.validateSounds(Object.assign({}, D.SOUNDS, { hero_hit: Object.assign({}, D.SOUNDS.hero_hit, { cooldownMs: 0 }) })).some((p) => /cooldown/.test(p)), 'SND-14 an effect with no cooldown must fail validation');
  must(B.sanitizeSoundPick({ at: 3, vol: { music: 33, master: 999, nope: 5 }, mute: ['music', 'nope'], x: 1 }) && JSON.stringify(B.sanitizeSoundPick({ at: 3, vol: { music: 33, master: 999, nope: 5 }, mute: ['music', 'nope'], x: 1 })) === '{"at":3,"vol":{"master":100,"music":35},"mute":["music"]}', 'SND-14 a sound pick keeps only its stamp, known buses on the setting\'s steps, and known mutes');
  for (const junk of [null, 5, 'loud', [], {}, { vol: { master: 5 } }, { at: -1 }, { at: 1.5 }]) must(B.sanitizeSoundPick(junk) === undefined, 'SND-14 not a sound pick: ' + JSON.stringify(junk));

  /* ── SND-15: raised ids are in the map, and the whole map is raised ── */
  {
    const literal = new Set(), loose = [];
    for (const f of walk(base, 'src')) {
      const src = text(f);
      for (const m of src.matchAll(/\bcue\(\s*([^,)]*)/g)) {
        if (!m[1].trim()) continue;   // prose: "one cue() where"
        const lit = /^'([a-z0-9_]+)'$/.exec(m[1].trim());
        if (lit) { literal.add(lit[1]); if (!D.SOUNDS[lit[1]]) errs.push('SND-15 ' + f + ' raises `' + lit[1] + '`, which is not in the sound map'); }
        else if (f !== 'src/audio/watch.js' || !/^(id|r\.sound)$/.test(m[1].trim())) loose.push(f + ': cue(' + m[1].trim() + ')');
      }
    }
    must(literal.size >= 20, 'SND-15 only ' + literal.size + ' cue() literals found: the scan is blind');
    must(!loose.length, 'SND-15 a sound must be raised by a literal id or through a table of src/data/sounds.js: ' + loose.join('; '));
    const watch = text('src/audio/watch.js');
    for (const reader of ['castSoundOf(', 'bedsOf(', 'ALERT_SOUNDS[']) must(watch.includes(reader), 'SND-15 the watcher never reads ' + reader + ' its sounds would never be raised');
    const raised = new Set([...literal, ...D.tableSoundIds()]);
    const orphans = Object.keys(D.SOUNDS).filter((id) => !raised.has(id));
    must(!orphans.length, 'SND-15 in the map but raised nowhere: ' + orphans.join(', '));
  }

  /* ── THE WATCHER, over a stand-in account ── */
  const stage = () => {
    const w = { cues: [], beds: {}, clock: 50000 };
    const emitter = () => { const fns = new Set(); return { subscribe: (fn) => { fns.add(fn); return () => fns.delete(fn); }, emit: (...a) => { for (const fn of Array.from(fns)) fn(...a); }, size: () => fns.size }; };
    const hero = (slot, data) => {
      const rec = emitter(), tl = emitter();
      const cs = { slot, record: { data }, read: (k) => cs.record.data[k], now: () => w.clock, subscribe: (fn) => rec.subscribe(fn),
        timeline: { subscribe: tl.subscribe, clientAt: (ms) => ms },
        take(next) { cs.record = { data: Object.assign({}, cs.record.data, next) }; rec.emit(cs, 'answer'); },
        play(ev) { tl.emit(Object.assign({ atMs: w.clock }, ev)); }, listeners: () => rec.size() + tl.size() };
      return cs;
    };
    const acc = emitter(), led = emitter(), al = emitter(), ch = emitter(), wm = emitter();
    w.heroes = new Map();
    w.alerts = [];
    w.lines = { global: [], local: [], party: [], system: [], combat: [] };
    w.station = null;
    w.account = { viewed: null, userId: 'me', subscribe: acc.subscribe, character: (s) => w.heroes.get(s) || null, characters: () => Array.from(w.heroes.values()),
      intents: { subscribe: led.subscribe }, social: { chat: { subscribe: ch.subscribe, lines: (t) => w.lines[t] || [] } },
      townOf: () => ({ me: () => (w.station ? { station: w.station } : null), subscribe: () => () => {} }) };
    w.alertCentre = { list: () => w.alerts.slice(), subscribe: al.subscribe };
    w.view = (slot) => { w.account.viewed = slot; acc.emit('viewed', slot); };
    w.alert = (a) => { w.alerts.push(a); al.emit(); };
    w.ask = (verb, ok) => { led.emit('begin', { id: 1, verb }); led.emit('end', { id: 1, verb, result: { ok } }); };
    w.say = (tab, line) => { w.lines[tab].push(line); ch.emit(); };
    w.shell = { wm: { openIds: () => w.open.slice(), subscribe: wm.subscribe } };
    w.open = [];
    w.windows = (ids) => { w.open = ids; wm.emit({ open: ids.slice() }); };
    w.hero = hero;
    w.start = () => { w.watch = watchSound({ account: w.account, alerts: w.alertCentre, cue: (id, o) => { w.cues.push(id); w.late = o; }, bed: (slot, id) => { w.beds[slot] = id; } }); return w.watch; };
    w.took = () => w.cues.splice(0).join(' ');
    return w;
  };
  const huntData = (session, o = {}) => ({ session_id: session, hunt_id: o.hunt || 'millrace_sewer', ended: o.ended === true, session: { end_reason: o.reason || null },
    hero: { unit: 1, name: 'Mira', level: 3 }, pose: { at_ms: 1, units: [{ u: 1, side: 'hero', kind: 'hero' }, { u: 2, side: 'hero', kind: 'hero' }, { u: 10, side: 'mon', kind: 'rat' }] } });
  const town = (level, cooking) => ({ state: { level_xp: charXpForLevel(level) }, skills: { cooking: { xp: 10, level: cooking }, melee: { xp: 10, level: 4 } } });

  /* ── SND-16: each moment once ── */
  {
    const w = stage();
    const a = w.hero(0, Object.assign(town(3, 2), { hunt: huntData('s1') }));
    w.heroes.set(0, a);
    w.account.viewed = 0;
    w.start();
    must(w.took() === '' && w.beds.ambience === 'amb_sewer' && w.beds.music === 'music_hunt', 'SND-17 opening on a hero mid-hunt must sound nothing and lay that ground\'s bed, got "' + w.cues.join(' ') + '" / ' + JSON.stringify(w.beds));
    a.play({ type: 'dmg', u: 1, t: 10, amount: 5 });
    a.play({ type: 'dmg', u: 10, t: 1, amount: 4 });
    a.play({ type: 'dmg', u: 10, t: 2, amount: 4 });
    a.play({ type: 'dmg', u: 10, t: 1, amount: 0 });
    a.play({ type: 'miss', u: 1, t: 10 });
    must(w.took() === 'hero_hit hero_hurt ally_hurt blow_miss blow_miss', 'SND-16 a blow landed, taken by the viewed hero, taken by an ally, swallowed and missed must each raise their own sound, got ' + w.cues.join(' '));
    for (const [ability, want] of [['fireball', 'cast_fire'], ['frost_lance', 'cast_ice'], ['green_sickness', 'cast_poison'], ['greater_mend', 'cast_heal'], ['arcane_barrier', 'cast_ward'], ['challenge', 'cast_shout'], ['power_strike', 'cast_strike']]) {
      a.play({ type: 'cast', u: 1, ability });
      const got = w.took();
      must(got === want, 'SND-16 casting ' + ability + ' must sound ' + want + ', got "' + got + '"');
    }
    a.play({ type: 'cast', u: 1, ability: 'basic' });
    must(w.took() === '', 'SND-16 a basic swing has no cast sound: its blow is the sound');
    a.play({ type: 'kill', u: 1, t: 10, loot: { rat_tail: 1 } });
    a.play({ type: 'kill', u: 1, t: 10, loot: { rat_tail: 1 }, id: 'again' });
    must(w.took() === 'monster_die loot_common', 'SND-16 a monster dies once, whatever id a restarted prediction replays its death under');
    a.play({ type: 'kill', u: 1, t: 11 });
    must(w.took() === 'monster_die', 'SND-16 a kill with no loot must not sound loot');
    w.clock += 7;
    a.play({ type: 'rare_drop', u: 1, item: 'kingsgrate', atMs: w.clock - 9000 });
    must(w.took() === 'loot_rare' && w.late && w.late.lateMs === 9000, 'SND-16 the rare drop must be raised with how late it was drawn (the map decides it still sounds)');
    a.play({ type: 'level', u: 1, skill: 'level', level: 4 });
    a.play({ type: 'level', u: 1, skill: 'melee', level: 5 });
    a.play({ type: 'level', u: 2, skill: 'level', level: 9 });
    a.take(Object.assign(town(4, 2), { skills: { cooking: { xp: 10, level: 2 }, melee: { xp: 10, level: 5 } } }));
    must(w.took() === 'level_up skill_up', 'SND-16 a level the hunt already sounded must not sound again when the envelope states it; an ally\'s level is not the viewed hero\'s');
    a.play({ type: 'eat', u: 1, item: 'cooked_shrimp' });
    a.play({ type: 'drink', u: 2, item: 'thin_turnip_juice' });
    a.play({ type: 'boss_phase', u: 10, phase: 'adds' });
    must(w.took() === 'eat boss_phase', 'SND-16 the viewed hero\'s own food sounds, an ally\'s drink does not, a boss phase does');
    a.play({ type: 'kill', u: 10, t: 1 });
    a.play({ type: 'death', monster: 'rat', xpLost: 1 });
    a.take({ hunt: huntData('s1', { ended: true, reason: 'died' }) });
    must(w.took() === 'hero_death' && w.beds.ambience === 'amb_town' && w.beds.music === 'music_town', 'SND-16 a death reaches the watcher by three roads and sounds once, with no hunt-end sound after it, got ' + w.cues.join(' '));
  }

  /* ── SND-17 / SND-18: baselines and the other roads ── */
  {
    const w = stage();
    const a = w.hero(0, town(3, 2)), b = w.hero(1, Object.assign(town(9, 7), { hunt: huntData('b1', { hunt: 'mill_cellar' }) }));
    w.heroes.set(0, a); w.heroes.set(1, b);
    w.account.viewed = 0;
    w.alerts.push({ key: 'invite:old', kind: 'invite', slot: 0 });
    w.lines.global.push({ id: 'g1', channel: 'global', at: 100, fromId: 'them' });
    w.station = 'smithy_forges';
    w.start();
    w.watch.followShell(w.shell);
    must(w.took() === '' && w.beds.ambience === 'amb_forge', 'SND-17 what the alerts and the chat already hold is not news, and a hero at the forge hears the forge');
    w.station = 'shop';
    a.take({});
    must(w.beds.ambience === 'amb_town', 'SND-18 a station with no bed of its own hears the square');
    a.take({ hunt: huntData('a1', { hunt: 'meadowbrook_thicket' }) });
    must(w.took() === 'hunt_start' && w.beds.ambience === 'amb_wilds', 'SND-18 a hunt opening must sound its start and lay its ground\'s bed');
    a.take({ hunt: huntData('a1', { hunt: 'meadowbrook_thicket', ended: true, reason: 'stamina' }) });
    must(w.took() === 'hunt_end' && w.beds.ambience === 'amb_town', 'SND-18 a hunt ending must sound the way home');
    a.take(town(3, 3));
    must(w.took() === 'skill_up', 'SND-18 a level gained in town (the envelope alone) must sound');
    w.view(1);
    must(w.took() === '' && w.beds.ambience === 'amb_cellar' && a.listeners() === 0, 'SND-17 switching the view must sound nothing, lay the other hero\'s bed and stop listening to the one left');
    a.take(town(8, 8));
    a.play({ type: 'rare_drop', u: 1, item: 'x' });
    must(w.took() === '', 'SND-17 a hero that is not on screen must make no sound through its own timeline or envelope');
    w.alert({ key: 'rare:1', kind: 'rare', slot: 0 });
    w.alert({ key: 'rare:2', kind: 'rare', slot: 1 });
    w.alert({ key: 'invite:new', kind: 'invite', slot: 1 });
    w.alert({ key: 'ended:1', kind: 'ended', slot: 0 });
    must(w.took() === 'loot_rare party_invite', 'SND-18 an off-screen hero\'s rare drop sounds through its alert, the viewed hero\'s does not (its timeline does), an invite always does, got ' + w.cues.join(' '));
    w.ask('shop_buy', true); w.ask('hunt_enter', true); w.ask('shop_buy', false); w.ask('stamina_refill', true); w.ask('vendor_sell_many', true);
    must(w.took() === 'purchase refusal purchase purchase', 'SND-18 a yes to a purchase is coins, a no is the refusal, a yes to anything else is silent');
    w.say('global', { id: 'g2', channel: 'global', at: 200, fromId: 'me' });
    w.say('global', { id: 'g3', channel: 'global', at: 300, fromId: 'them' });
    w.say('local', { id: 'l1', channel: 'local:mill_cellar', at: 50, fromId: 'them' });
    w.say('system', { id: 's1', channel: 'system', at: 400, fromId: null, system: true });
    must(w.took() === 'chat_message', 'SND-18 another player\'s new line sounds once; your own line, a channel\'s first history and a system line do not, got ' + w.cues.join(' '));
    w.windows(['inventory']); w.windows(['inventory', 'shop']); w.windows(['shop']); w.windows(['shop']);
    must(w.took() === 'window_open window_open window_close', 'SND-18 a window opening and closing must each sound, and no change must not');
    w.watch.destroy();
    b.play({ type: 'rare_drop', u: 1, item: 'x' });
    w.alert({ key: 'invite:late', kind: 'invite', slot: 1 });
    must(w.took() === '' && b.listeners() === 0 && w.beds.ambience === null && w.beds.music === null, 'SND-18 destroyed, the watcher hears nothing more and its beds are let go');
  }

  /* ── SND-19: the page (src/audio/mount.js) over a stand-in window ── */
  {
    const { mountSound } = await import(u('src/audio/mount.js'));
    const page = (search) => {
      const audio = fakeAudio();
      const handlers = new Map();
      const doc = { hidden: false,
        addEventListener: (type, fn) => { if (!handlers.has(type)) handlers.set(type, new Set()); handlers.get(type).add(fn); },
        removeEventListener: (type, fn) => { if (handlers.has(type)) handlers.get(type).delete(fn); } };
      const win = { document: doc, location: { search }, AudioContext: audio.Ctx, performance: { now: () => 1000 }, fetch: () => Promise.resolve({ ok: false }) };
      const account = { viewed: null, userId: 'me', subscribe: () => () => {}, character: () => null, characters: () => [] };
      const fire = (type, target) => { for (const fn of Array.from(handlers.get(type) || [])) fn({ type, target: target || null }); };
      return { audio, doc, win, account, fire, listening: () => Array.from(handlers.values()).reduce((n, s) => n + s.size, 0) };
    };
    const off = page('');
    const none = await mountSound(off.win, off.account, null);
    must(B.SOUND.shipped || (none === null && off.listening() === 0 && off.audio.made.length === 0), 'SND-19 with sound off the page must mount nothing and listen to nothing');
    for (const gesture of ['touchend', 'pointerup', 'click', 'keydown']) {
      const p = page('?sound=tones');
      const s = await mountSound(p.win, p.account, null);
      const before = p.audio.made.length;
      p.fire(gesture);
      must(!!s && before === 0 && p.audio.made.length === 1 && s.manager.unlocked(), 'SND-19 a ' + gesture + ' must unlock audio (a phone\'s first tap is a touchend), and nothing before it');
      if (s) s.destroy();
      must(p.listening() === 0, 'SND-19 destroyed, the page must hold no listener of the sound\'s');
    }
    const p = page('?sound=tones');
    const s = await mountSound(p.win, p.account, null);
    const button = { disabled: false, getAttribute: () => null, closest() { return this; } }, dead = { disabled: true, getAttribute: () => null, closest() { return this; } };
    p.fire('click', button);
    const pressed = s.manager.stats().played;
    p.fire('click', { closest: () => null });
    p.fire('click', dead);
    must(pressed === 1 && s.manager.stats().played === 1, 'SND-19 a press on a control ticks once; a click on nothing, or on a disabled control, does not');
    p.doc.hidden = true;
    p.fire('visibilitychange');
    must(p.audio.made[0].gains[0].gain.value === 0 && p.audio.made[0].state === 'suspended', 'SND-19 a hidden page must go quiet');
    s.destroy();
  }
  return errs;
}

const MUTANTS = [
  { name: 'a phone\'s tap does not unlock audio', file: 'src/audio/mount.js', from: "const GESTURES = Object.freeze(['pointerup', 'touchend', 'click', 'keydown']);", to: "const GESTURES = Object.freeze(['pointerup', 'click', 'keydown']);", want: 'SND-19 a touchend' },
  { name: 'the page never tells the mixer it is hidden', file: 'src/audio/mount.js', from: "doc.addEventListener('visibilitychange', onHidden);", to: '', want: 'SND-19 a hidden page' },
  { name: 'a disabled control ticks', file: 'src/audio/mount.js', from: "if (t && !t.disabled && t.getAttribute('aria-disabled') !== 'true') cue('ui_press');", to: "if (t) cue('ui_press');", want: 'SND-19 a press on a control' },
  { name: 'off still makes an audio context', file: 'src/audio/manager.js', from: "if (!on() || typeof o.AudioContext !== 'function') return false;", to: "if (typeof o.AudioContext !== 'function') return false;", want: 'SND-1' },
  { name: 'boot loads the audio home with sound off', file: 'src/app/boot.js', from: "if (soundModeOf(win.location.search) !== 'off') {", to: 'if (true) {', want: 'SND-1 boot.js' },
  { name: 'boot reaches the audio home with a literal import', file: 'src/app/boot.js', from: 'import(SOUND_URL).then(', to: "import('../audio/mount.js?v=0.2.114').then(", want: 'SND-2' },
  { name: 'a sound plays before any gesture', file: 'src/audio/manager.js', from: 'const ready = () => on() && !!ctx && !hidden;', to: 'const ready = () => { if (on() && !ctx) { ctx = new o.AudioContext(); master = ctx.createGain(); for (const id of busIds) busGain.set(id, ctx.createGain()); } return on() && !hidden; };', want: 'SND-4' },
  { name: 'a missing file is asked for again', file: 'src/audio/manager.js', from: '.then((buf) => { buffers.set(id, buf); return buf; });', to: '.then((buf) => { if (buf) buffers.set(id, buf); else buffers.delete(id); return buf; });', want: 'SND-5 a missing file' },
  { name: 'no cooldown', file: 'src/audio/manager.js', from: 'if (lastAt.has(id) && t - lastAt.get(id) < row.cooldownMs) return no();', to: '', want: 'SND-6 eight deaths' },
  { name: 'no cap on a sound\'s own voices', file: 'src/audio/manager.js', from: 'if (voices.filter((v) => v.id === id).length >= row.voices) return no();', to: '', want: 'SND-6 a sound must never ring' },
  { name: 'a rare drop is dropped when every voice is taken', file: 'src/audio/manager.js', from: 'if (weakest.row.priority >= row.priority) return no();', to: 'return no();', want: 'SND-7' },
  { name: 'no global voice limit', file: 'src/audio/manager.js', from: 'if (shots.length >= limits.voices) {', to: 'if (false) {', want: 'SND-7' },
  { name: 'a mute is ignored', file: 'src/audio/manager.js', from: 'level && !level.mute ?', to: 'level ?', want: 'SND-8' },
  { name: 'a hidden tab keeps sounding', file: 'src/audio/manager.js', from: 'hidden = is === true;', to: 'hidden = false;', want: 'SND-9' },
  { name: 'late blows still sound', file: 'src/audio/manager.js', from: 'if (row.lateMs !== null && late > row.lateMs) return no();', to: '', want: 'SND-10 a blow' },
  { name: 'the rare drop does not duck', file: 'src/audio/manager.js', from: 'if (row.duckMs) duck(row.duckMs);', to: '', want: 'SND-11' },
  { name: 'the old bed keeps playing', file: 'src/audio/manager.js', from: 'if (b.voice) { stop(b.voice, limits.bedFadeMs); b.voice = null; }', to: 'b.voice = null;', want: 'SND-12 a new place' },
  { name: 'a map row with no tone', file: 'src/audio/tones.js', from: "  loot_rare: ['triangle',", to: "  loot_rarer: ['triangle',", want: 'SND-13' },
  { name: 'a table names a sound that is not in the map', file: 'src/data/sounds.js', from: "heal: 'cast_heal', shield:", to: "heal: 'cast_mend', shield:", want: 'SND-14' },
  { name: 'a sound in the map that nothing raises', file: 'src/data/sounds.js', from: "  music_town: row('music', 'music/town.ogg',", to: "  owl_hoot: fx('combat/owl-hoot.ogg', { cooldownMs: 500 }),\n  music_town: row('music', 'music/town.ogg',", want: 'SND-15 in the map but raised nowhere: owl_hoot' },
  { name: 'code raises a sound the map lacks', file: 'src/audio/watch.js', from: "cue('hunt_end');", to: "cue('hunt_over');", want: 'SND-15 src/audio/watch.js raises `hunt_over`' },
  { name: 'a monster dies twice', file: 'src/audio/watch.js', from: 'if (st.dead.has(ev.t)) break;', to: '', want: 'SND-16 a monster dies once' },
  { name: 'a level sounds by both roads', file: 'src/audio/watch.js', from: 'if (st.told.has(k)) return;', to: '', want: 'SND-16 a level the hunt already sounded' },
  { name: 'a death sounds by every road', file: 'src/audio/watch.js', from: 'if (st.deaths.has(session)) return;', to: '', want: 'SND-16 a death reaches' },
  { name: 'the first envelope is news', file: 'src/audio/watch.js', from: 'onRecord(true);', to: 'st.open = undefined; onRecord(false);', want: 'SND-17 opening on a hero mid-hunt' },
  { name: 'the hero left behind is still heard', file: 'src/audio/watch.js', from: '    for (const off of offs) off();\n    offs = [];\n    cs = account.viewed', to: '    offs = [];\n    cs = account.viewed', want: 'SND-17 switching the view' },
  { name: 'the viewed hero\'s rare drop sounds twice', file: 'src/audio/watch.js', from: 'if (r && !(r.offscreen && a.slot === account.viewed)) cue(r.sound);', to: 'if (r) cue(r.sound);', want: 'SND-18 an off-screen hero' },
  { name: 'your own chat line pings', file: 'src/audio/watch.js', from: 'l.at > known && l.fromId !== account.userId) any = true;', to: 'l.at > known) any = true;', want: 'SND-18 another player' },
  { name: 'every yes is coins', file: 'src/audio/watch.js', from: "else if (PURCHASE_VERB.test(entry.verb)) cue('purchase');", to: "else cue('purchase');", want: 'SND-18 a yes to a purchase' },
  { name: 'the switch flipped with no files', file: 'src/data/sound-buses.js', from: '  shipped: false,', to: '  shipped: true,', want: 'SND-3' },
];

if (process.argv.includes('--selftest')) {
  const clean = await check(ROOT);
  if (clean.length) { console.error('sound selftest: the CLEAN arm is red\n  ' + clean.join('\n  ')); process.exit(1); }
  const tmp = mkdtempSync(join(tmpdir(), 'sound-'));
  try {
    let i = 0;
    for (const m of MUTANTS) {
      const base = join(tmp, String(i++));
      for (const d of ['src/data', 'src/audio', 'src/app', 'src/session', 'src/core', 'src/utils']) { mkdirSync(join(base, d), { recursive: true }); cpSync(join(ROOT, d), join(base, d), { recursive: true }); }
      cpSync(join(ROOT, 'src/build-info.js'), join(base, 'src/build-info.js'));
      const p = join(base, m.file), src = readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
      if (src.split(m.from).length !== 2) { console.error('selftest anchor missing or doubled for: ' + m.name); process.exit(2); }
      writeFileSync(p, src.replace(m.from, () => m.to));
      let errs;
      try { errs = await check(base); } catch (e) { errs = ['threw: ' + String(e && e.message)]; }
      if (!errs.some((e) => e.includes(m.want))) { console.error('  MISSED: ' + m.name + ' (got ' + JSON.stringify(errs) + ')'); process.exit(1); }
      console.log('  caught  ' + m.name);
    }
  } finally { rmSync(tmp, { recursive: true, force: true }); }
  console.log('sound selftest: ' + MUTANTS.length + '/' + MUTANTS.length + ' planted defects caught');
} else {
  const errs = await check(ROOT);
  if (errs.length) { console.error('sound: RED\n  ' + errs.join('\n  ')); process.exit(1); }
  console.log('sound: off and silent by the switch; the mixer holds its gesture, voices, cooldowns, volumes and hidden tab; every raised id is in the map and every row is raised');
}
