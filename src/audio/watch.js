// ════════════════════════════════════════════════════════════════════════
// src/audio/watch.js — WHICH SOUND, WHEN: THE GAME IS WATCHED, NEVER ASKED.
//
// PURE of the DOM and of Web Audio. Sound is an observer: no module of the game
// raises a sound or knows this file exists. It listens where the client already
// draws each moment and calls cue(id) / bed(slot, id) (src/audio/manager.js):
//
//   the viewed hero's TIMELINE (src/hunt-view/timeline.js subscribe: each event
//     once, as the screen plays it, predicted or the server's)  blows, casts,
//     deaths, loot, the rare drop, level-ups, food and drink, a boss's phase
//   its ENVELOPE (CharacterSession.subscribe)   a hunt starting or ending, a
//     level gained in town, where the hero stands (the bed of that place)
//   the ALERTS (src/shell/alerts.js)            a party invite, a private message,
//     and a rare drop or a death of a hero that is NOT the one on screen
//   the INTENT LEDGER (src/session/intent-ledger.js)   coins on a purchase the
//     server said yes to, the refusal when it said no
//   the CHAT (src/social/chat-store.js)         a line from someone else
//   the shell's WINDOW MANAGER (followShell)    a window opening or closing
//
// NEVER TWICE. The timeline delivers an event id once (T1), so a blow the
// prediction showed is not sounded again when the server confirms it. What can
// reach here by two roads is keyed here: a monster dies once per unit (a
// restarted prediction replays a death under a new id: scene.js S6), a hero's
// death once per hunt (its timeline event and the envelope's end reason), a level
// once per skill and level (the hunt's event and the envelope). A NEW VIEW IS NOT
// NEWS: whatever a hero, the alerts or the chat already hold when the watch
// starts or the view switches is the baseline, and only a change after it sounds.
// ════════════════════════════════════════════════════════════════════════
import { huntOf, partyOf } from '../session/hunt-sections.js?v=0.2.114';
import { levelOf } from '../session/character-sections.js?v=0.2.114';
import { skillsOf } from '../session/item-sections.js?v=0.2.114';
import { ABILITIES } from '../data/abilities.js?v=0.2.114';
import { CHAT_TABS } from '../data/chat-channels.js?v=0.2.114';
import { castSoundOf, bedsOf, ALERT_SOUNDS, PURCHASE_VERB } from '../data/sounds.js?v=0.2.114';

const abilityOf = (id) => (typeof id === 'string' && Object.hasOwn(ABILITIES, id) ? ABILITIES[id] : null);
const KEPT = 512;   // dead units and told levels remembered per hero (a hunt's pack ids; bounded)
const keep = (set, k) => { set.add(k); if (set.size > KEPT) set.delete(set.values().next().value); };

/**
 * @param {object} o
 * @param {object} o.account   the AccountSession
 * @param {object} [o.alerts]  the alert centre
 * @param {(id: string, opts?: {lateMs: number}) => any} o.cue
 * @param {(slot: string, id: string|null) => any} o.bed
 * @returns {{ followShell(shell: object|null): void, destroy(): void }}
 */
export function watchSound(o) {
  const { account, alerts, cue, bed } = o;
  let cs = null, offs = [], st = null, offShell = null;

  /* Who is a hero in the viewed hunt, and which unit is the viewed one: read again after each envelope. */
  function cast() {
    if (st.cast) return st.cast;
    const h = huntOf(cs), p = partyOf(cs);
    const heroes = new Set();
    if (p) for (const m of p.members) if (Number.isInteger(m.unit)) heroes.add(m.unit);
    const self = h && Number.isInteger(h.hero.unit) ? h.hero.unit : null;
    if (self !== null) heroes.add(self);
    for (const x of cs.live && typeof cs.live.heroUnits === 'function' ? cs.live.heroUnits() : []) if (Number.isInteger(x.unit)) heroes.add(x.unit);
    const units = h ? h.units : new Map();
    st.cast = { self, isHero: (u) => heroes.has(u) || (units.get(u) || {}).side === 'hero' };
    return st.cast;
  }

  function died(session) {
    if (st.deaths.has(session)) return;
    keep(st.deaths, session);
    cue('hero_death');
  }
  function levelled(skill, level) {
    const k = skill + '@' + level;
    if (st.told.has(k)) return;
    keep(st.told, k);
    if (skill === 'level') cue('level_up'); else cue('skill_up');
  }

  function onEvent(ev) {
    const at = cs.timeline.clientAt(ev.atMs);
    const late = { lateMs: Number.isFinite(at) ? Math.max(0, cs.now() - at) : 0 };
    const c = cast();
    const mine = (u) => c.self === null || u === c.self;
    switch (ev.type) {
      case 'dmg':
        if (!c.isHero(ev.t)) cue('hero_hit', late);
        else if (ev.amount === 0) cue('blow_miss', late);   // a barrier took all of it: the screen's spark
        else if (mine(ev.t)) cue('hero_hurt', late);
        else cue('ally_hurt', late);
        break;
      case 'miss': cue('blow_miss', late); break;
      case 'cast': { const id = castSoundOf(abilityOf(ev.ability)); if (id) cue(id, late); break; }
      case 'kill':
        if (c.isHero(ev.t)) { if (mine(ev.t)) died(st.open || 'hunt'); break; }
        if (st.dead.has(ev.t)) break;
        keep(st.dead, ev.t);
        cue('monster_die', late);
        if (ev.loot && typeof ev.loot === 'object' && Object.keys(ev.loot).length) cue('loot_common', late);
        break;
      case 'death': died(st.open || 'hunt'); break;
      case 'rare_drop': cue('loot_rare', late); break;
      case 'level': if (mine(ev.u) && typeof ev.skill === 'string' && Number.isInteger(ev.level)) levelled(ev.skill, ev.level); break;
      case 'eat': if (mine(ev.u)) cue('eat', late); break;
      case 'drink': if (mine(ev.u)) cue('drink', late); break;
      case 'boss_phase': cue('boss_phase', late); break;
      default: break;
    }
  }

  const levelsOf = (c) => {
    const out = {};
    const L = levelOf(c), sk = skillsOf(c);
    if (L) out.level = L.level;
    for (const [id, r] of Object.entries(sk || {})) out[id] = r.level;
    return out;
  };

  function place() {
    if (!cs) { bed('ambience', null); bed('music', null); return; }
    const h = huntOf(cs);
    const town = typeof account.townOf === 'function' ? account.townOf(cs.slot) : null;
    const me = town && typeof town.me === 'function' ? town.me() : null;
    const b = bedsOf(h && !h.ended ? { hunt: h.huntId } : { station: me ? me.station : null });
    bed('ambience', b.ambience);
    bed('music', b.music);
  }

  /* The envelope: `first` only takes the baseline. */
  function onRecord(first) {
    st.cast = null;
    const h = huntOf(cs);
    const open = h && !h.ended ? h.sessionId : null;
    if (!first && open !== st.open) {
      if (open) { st.dead.clear(); cue('hunt_start'); }
      else if (h && h.sessionId === st.open && h.endReason === 'died') died(st.open);
      else if (!st.deaths.has(st.open)) cue('hunt_end');
    }
    st.open = open;
    const now = levelsOf(cs);
    for (const [skill, level] of Object.entries(now)) {
      const was = st.levels[skill];
      if (!first && Number.isInteger(was) && level > was) levelled(skill, level);
      else if (first || !Number.isInteger(was)) keep(st.told, skill + '@' + level);
    }
    st.levels = now;
    place();
  }

  function view() {
    for (const off of offs) off();
    offs = [];
    cs = account.viewed === null || account.viewed === undefined ? null : account.character(account.viewed);
    if (!cs) { place(); return; }
    st = { open: null, levels: {}, cast: null, dead: new Set(), deaths: new Set(), told: new Set() };
    onRecord(true);
    offs.push(cs.timeline.subscribe(onEvent));
    offs.push(cs.subscribe((s, why) => { if (s === cs && why !== 'closed' && s.record) onRecord(false); }));
    const town = typeof account.townOf === 'function' ? account.townOf(cs.slot) : null;
    if (town && typeof town.subscribe === 'function') offs.push(town.subscribe(place));
  }

  const global = [account.subscribe((why) => { if (why === 'viewed' || why === 'opened' || why === 'closed') { const was = cs; const next = account.viewed === null || account.viewed === undefined ? null : account.character(account.viewed); if (next !== was) view(); } })];

  if (account.intents && typeof account.intents.subscribe === 'function') {
    global.push(account.intents.subscribe((kind, entry) => {
      if (kind !== 'end') return;
      if (!(entry.result && entry.result.ok)) cue('refusal');
      else if (PURCHASE_VERB.test(entry.verb)) cue('purchase');
    }));
  }

  if (alerts && typeof alerts.subscribe === 'function') {
    const heard = new Set(alerts.list().map((a) => a.key));
    global.push(alerts.subscribe(() => {
      for (const a of alerts.list()) {
        if (heard.has(a.key)) continue;
        heard.add(a.key);
        const r = ALERT_SOUNDS[a.kind];
        if (r && !(r.offscreen && a.slot === account.viewed)) cue(r.sound);
      }
      if (heard.size > KEPT) for (const k of Array.from(heard).slice(0, heard.size - KEPT)) heard.delete(k);
    }));
  }

  const chat = account.social && account.social.chat;
  if (chat && typeof chat.subscribe === 'function') {
    /* the newest line known per channel: a channel first seen (a new zone, a new party, the history) is only the baseline */
    const newest = new Map();
    const scan = (sound) => {
      const top = new Map();
      let any = false;
      for (const tab of CHAT_TABS) for (const l of chat.lines(tab.id)) {
        if (!l || l.system || typeof l.channel !== 'string' || !Number.isFinite(l.at)) continue;
        const known = newest.get(l.channel);
        if (known !== undefined && l.at > known && l.fromId !== account.userId) any = true;
        if (!(top.get(l.channel) >= l.at)) top.set(l.channel, l.at);
      }
      for (const [channel, at] of top) if (!(newest.get(channel) >= at)) newest.set(channel, at);
      if (any && sound) cue('chat_message');
    };
    scan(false);
    global.push(chat.subscribe(() => scan(true)));
  }

  view();

  return {
    /** The viewed hero's shell (src/app/boot.js, each time the pane is mounted): its windows opening and closing. */
    followShell(shell) {
      if (offShell) { offShell(); offShell = null; }
      const wm = shell && shell.wm;
      if (!wm || typeof wm.subscribe !== 'function') return;
      let was = new Set(wm.openIds());
      offShell = wm.subscribe(({ open }) => {
        const now = new Set(open);
        let opened = false, closed = false;
        for (const id of now) if (!was.has(id)) opened = true;
        for (const id of was) if (!now.has(id)) closed = true;
        was = now;
        if (opened) cue('window_open'); else if (closed) cue('window_close');
      });
    },
    destroy() {
      for (const off of offs.concat(global)) off();
      offs = [];
      if (offShell) offShell();
      offShell = null;
      bed('ambience', null);
      bed('music', null);
    },
  };
}
