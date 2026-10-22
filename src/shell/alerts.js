// ════════════════════════════════════════════════════════════════════════
// src/shell/alerts.js — THE ALERTS: WHAT HAPPENED TO WHICH CHARACTER, ONCE.
//
// One alert centre per AccountSession, watching every open character (QoL 7,
// Tyler 10-18). It reads only what the server sent, and turns four kinds of
// event (src/data/alerts.js) into one line each with the next action:
//   rare    a `rare_drop` event as it ARRIVES in the character's timeline
//           (timeline.onArrive, so a character that is not on screen still
//           tells), id = the server's own event id
//   death   the hunt section ending `died` / `party_member_died`, id = session
//           (a death of the character ON SCREEN is the death popup instead,
//           death-popup.js; one whose popup was dismissed never fires)
//   low     a bar supply at zero for a hero set to end its hunt on empty, while hunting; id = session + item. Never for a resource
//           the hero does not use (a drink for a hero with no mana pool), and
//           never "out of" while the store pays per use (supply_source `store`
//           or on_empty `switch`: HUNT_SCREEN_SPEC §3.4 rule 7, the hunt never
//           stops for lack of stock). A bar slot may name a KIND (`food`,
//           `drink`): its stock is every bag stack of that kind.
//   ended   the hunt section saying `ended`, id = session
//   away    "While you were away": on return, what the hunt did since this
//           browser last showed it (away-recap.js), id = session + the stamp
//   invite  a party invite waiting for the character (`party_invites`), id =
//           the server's invite id; Join / No thanks answer it, and it goes
//           when the server no longer lists it (answered anywhere, expired)
//
// THE RULE: an alert fires ONCE per event id. The ids already shown are kept
// in memory for the page and in the character's residue (`alerts.seen`,
// display state, bounded) for the next visit, so a reload or a re-sent
// envelope never repeats one. Which kinds show is the residue's `alerts.off`.
// Nothing here gates or spends anything; the "Start again" button is an
// intent (CharacterSession.restartHunt) like every other.
// ════════════════════════════════════════════════════════════════════════
import { ALERT_INDEX } from '../data/alerts.js?v=0.2.27';
import { END_REASON_COPY } from '../data/hunt-sessions.js?v=0.2.27';
import { ALERTS_SEEN_MAX } from '../session/residue.js?v=0.2.27';
import { huntOf, settingsOf } from '../session/hunt-sections.js?v=0.2.27';
import { carriedOf, nameOf } from '../session/item-sections.js?v=0.2.27';
import { huntName, invitesOf } from '../session/party-sections.js?v=0.2.27';
import { itemName } from './widgets/bits.js?v=0.2.27';
import { CONSUMABLES, CONSUMABLE_KINDS } from '../data/consumables.js?v=0.2.27';
import { deathSeen } from './death-popup.js?v=0.2.27';
import { awayRecapOf, stampAway } from './away-recap.js?v=0.2.27';

const residueOf = (cs) => {
  const r = cs && cs.record && cs.record.residue && cs.record.residue.alerts;
  return r && typeof r === 'object' ? r : {};
};
const who = (cs) => nameOf(cs) || 'Character ' + (cs.slot + 1);
/* The lines a new hunt retires once its session is open (the last hunt's end, death and low supply). */
const RETIRE = new Set(['ended', 'death', 'low']);

/** Which kinds this character shows (every kind unless its residue switched it off). */
export function alertShown(cs, kind) {
  const off = residueOf(cs).off;
  return !(Array.isArray(off) && off.includes(kind));
}

/** The record's residue with one kind switched on or off (display state only). */
export function setAlertShown(cs, kind, on) {
  if (!ALERT_INDEX[kind]) return false;
  const r = residueOf(cs);
  const off = new Set(Array.isArray(r.off) ? r.off : []);
  if (on) off.delete(kind); else off.add(kind);
  return cs.setResidue('alerts', { off: Array.from(off), seen: Array.isArray(r.seen) ? r.seen : [] });
}

/* What a consume names: a kind ('food' | 'drink') or an item, and which kind it is (null = neither). */
const kindOf = (id) => (CONSUMABLE_KINDS[id] ? id : CONSUMABLES[id] ? CONSUMABLES[id].kind : null);

/* The low-supply items of a hunting character: bar supplies at zero (no shop sells supplies; Tyler 2026-10-20). */
function lowItems(cs, hero) {
  /* What the hero carries now: a hunt's supplies are in its hunt bag, not the bag (carriedOf). */
  const bag = carriedOf(cs);
  if (!bag) return [];
  const s = settingsOf(cs);
  /* The store pays per use unless the hero opted into "own stock, end the hunt": running out is no event. */
  const storePays = !s || s.supplySource === 'store' || s.onEmpty !== 'end';
  /* A drink restores mana: a hero the server gives no mana pool never needs one. */
  const uses = (id) => kindOf(id) !== 'drink' || hero.manaMax > 0;
  const have = new Map(bag.map((r) => [r.id, r.qty]));
  const stock = (id) => (CONSUMABLE_KINDS[id] ? bag.reduce((n, r) => n + (kindOf(r.id) === id ? r.qty : 0), 0) : have.get(id) || 0);
  const out = new Map();
  if (s && !storePays) for (const sl of s.slots) {
    if (!sl.empty && sl.action.type === 'consume' && uses(sl.item) && !(stock(sl.item) > 0) && !out.has(sl.item)) out.set(sl.item, { item: sl.item });
  }
  return Array.from(out.values());
}
/* A kind reads as plain words ("out of drinks"); an item by its name. */
const supplyWords = (id) => (id === 'food' ? 'food' : id === 'drink' ? 'drinks' : itemName(id));

/**
 * What this character's record says happened, as candidate alerts (pure).
 * @returns {{id: string, kind: string, text: string, session: string|null, item?: string}[]}
 */
function candidatesOf(cs, viewed) {
  const out = (invitesOf(cs) || []).map((i) => ({ id: 'invite:' + i.id, kind: 'invite', session: null, invite: i.id,
    text: i.from + ' invites ' + who(cs) + ' to their party.' }));
  const h = huntOf(cs);
  if (!h) return out;
  const where = huntName(h.huntId);
  /* A death ends the hunt (CORE_MODEL.md §4): the death alert stands in for the ended one. The character
     on screen gets the death POPUP instead (death-popup.js, Tyler 2026-10-19), and a death whose popup was
     already dismissed never comes back as a side line. */
  if (h.ended && h.endReason === 'died') {
    if (!viewed && !deathSeen(cs, h.sessionId)) out.push({ id: 'death:' + h.sessionId, kind: 'death', session: h.sessionId,
      text: END_REASON_COPY.died.one.replace('{name}', who(cs)).replace('{ground}', where) });
  }
  else if (h.ended && h.endReason === 'party_member_died') out.push({ id: 'death:' + h.sessionId, kind: 'death', session: h.sessionId,
    text: 'A party member died in ' + where + ', so ' + who(cs) + '’s party returned to town.' });
  else if (h.ended) out.push({ id: 'ended:' + h.sessionId, kind: 'ended', session: h.sessionId, text: who(cs) + '’s hunt in ' + where + ' has ended.' });
  else for (const l of lowItems(cs, h.hero)) {
    out.push({ id: 'low:' + h.sessionId + ':' + l.item, kind: 'low', session: h.sessionId, item: l.item,
      text: who(cs) + ' is out of ' + supplyWords(l.item) + '.' });
  }
  return out;
}

/** The rare-drop alert for one arriving timeline event, or null. */
function rareOf(cs, ev) {
  if (!ev || ev.type !== 'rare_drop' || typeof ev.item !== 'string' || typeof ev.key !== 'string') return null;
  const h = huntOf(cs);
  return { id: 'rare:' + (h ? h.sessionId : 'slot' + cs.slot) + ':' + ev.key.replace(/[^A-Za-z0-9_:.-]/g, '_').slice(0, 60), kind: 'rare',
    session: h ? h.sessionId : null, item: ev.item, text: 'Rare drop for ' + who(cs) + ': ' + itemName(ev.item) + '!' };
}

/**
 * @param {object} account  the AccountSession (its open characters, and 'opening' / 'closed')
 */
export function createAlertCenter(account) {
  const alerts = [];                 // newest first
  const seen = new Map();            // slot -> Set of ids shown on this page
  const watching = new Map();        // slot -> [unsubscribe]
  const listeners = new Set();
  let n = 0;

  const changed = () => { for (const fn of Array.from(listeners)) { try { fn(); } catch (e) { console.error('[alerts] a listener failed', e); } } };
  const seenOf = (slot) => { let s = seen.get(slot); if (!s) { s = new Set(); seen.set(slot, s); } return s; };

  function fire(cs, c) {
    const mine = seenOf(cs.slot);
    const stored = residueOf(cs).seen;
    if (mine.has(c.id) || (Array.isArray(stored) && stored.includes(c.id))) return false;
    mine.add(c.id);
    if (!alertShown(cs, c.kind)) return false;
    const kind = ALERT_INDEX[c.kind];
    alerts.unshift(Object.assign({ key: 'a' + (++n), slot: cs.slot, action: kind.action, button: kind.button, decline: kind.decline || null, glyph: kind.glyph, pending: false, msg: '' }, c));
    if (alerts.length > 32) alerts.length = 32;
    const r = residueOf(cs);
    cs.setResidue('alerts', { off: Array.isArray(r.off) ? r.off : [], seen: (Array.isArray(stored) ? stored : []).concat(c.id).slice(-ALERTS_SEEN_MAX) });
    return true;
  }

  function scan(cs) {
    let any = false;
    const now = candidatesOf(cs, account.viewed === cs.slot);
    /* "While you were away" (away-recap.js): judged against the last-seen stamp BEFORE it is renewed. */
    const away = awayRecapOf(cs);
    if (away) now.push(away);
    for (const c of now) any = fire(cs, c) || any;
    stampAway(cs);
    /* An invite the server no longer lists (answered elsewhere, expired, its party gone) leaves the lines. */
    const live = new Set(now.filter((c) => c.kind === 'invite').map((c) => c.id));
    /* A NEW HUNT RETIRES THE LAST ONE'S LINES (Brannoc 10-22: "has ended · Start again" stayed up into the next
       hunt): once the server says another session is open, an ended, death or low line of an older one goes. */
    const h = huntOf(cs);
    const open = h && !h.ended ? h.sessionId : null;
    for (let i = alerts.length - 1; i >= 0; i--) {
      const a = alerts[i];
      if (a.slot !== cs.slot) continue;
      if ((a.kind === 'invite' && !live.has(a.id)) || (open && RETIRE.has(a.kind) && a.session && a.session !== open)) { alerts.splice(i, 1); any = true; }
    }
    if (any) changed();
  }

  function watch(slot) {
    const cs = account.character(slot);
    if (!cs || watching.has(slot)) return;
    const offs = [cs.subscribe((s, why) => { if (why !== 'closed') scan(s); })];
    if (cs.timeline && typeof cs.timeline.onArrive === 'function') {
      offs.push(cs.timeline.onArrive((ev) => { const c = rareOf(cs, ev); if (c && fire(cs, c)) changed(); }));
    }
    watching.set(slot, offs);
    scan(cs);
  }
  function unwatch(slot) {
    for (const off of watching.get(slot) || []) off();
    watching.delete(slot);
    seen.delete(slot);
    for (let i = alerts.length - 1; i >= 0; i--) if (alerts[i].slot === slot) alerts.splice(i, 1);
    changed();
  }

  const offAccount = account.subscribe((why, slot) => {
    if (why === 'opening' || why === 'opened') watch(slot);
    else if (why === 'closed') unwatch(slot);
  });
  for (const cs of account.characters()) watch(cs.slot);

  return {
    /** The alerts on screen, newest first. */
    list: () => alerts.slice(),
    /** How many alerts one character has waiting (the strip's badge). */
    countFor: (slot) => alerts.filter((a) => a.slot === slot).length,
    dismiss(key) {
      const i = alerts.findIndex((a) => a.key === key);
      if (i < 0) return false;
      alerts.splice(i, 1);
      changed();
      return true;
    },
    /** Mark an alert's next action in flight (its button goes off) or answered. */
    mark(key, pending, msg) {
      const a = alerts.find((x) => x.key === key);
      if (!a) return false;
      a.pending = !!pending;
      a.msg = msg || '';
      changed();
      return true;
    },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    destroy() { offAccount(); for (const slot of Array.from(watching.keys())) unwatch(slot); listeners.clear(); },
  };
}
