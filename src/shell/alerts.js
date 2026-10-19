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
//   low     a restock target under LOW_SUPPLY_PCT of itself, or a bar supply
//           at zero, while hunting; id = session + item. Never for a resource
//           the hero does not use (a drink for a hero with no mana pool), and
//           never "out of" while the store pays per use (supply_source `store`
//           or on_empty `switch`: HUNT_SCREEN_SPEC §3.4 rule 7, the hunt never
//           stops for lack of stock). A bar slot may name a KIND (`food`,
//           `drink`): its stock is every bag stack of that kind.
//   ended   the hunt section saying `ended`, id = session
//
// THE RULE: an alert fires ONCE per event id. The ids already shown are kept
// in memory for the page and in the character's residue (`alerts.seen`,
// display state, bounded) for the next visit, so a reload or a re-sent
// envelope never repeats one. Which kinds show is the residue's `alerts.off`.
// Nothing here gates or spends anything; the "Start again" button is an
// intent (CharacterSession.restartHunt) like every other.
// ════════════════════════════════════════════════════════════════════════
import { ALERT_INDEX, LOW_SUPPLY_PCT } from '../data/alerts.js?v=0.2.9';
import { END_REASON_COPY } from '../data/hunt-sessions.js?v=0.2.9';
import { ALERTS_SEEN_MAX } from '../session/residue.js?v=0.2.9';
import { huntOf, settingsOf } from '../session/hunt-sections.js?v=0.2.9';
import { bagOf, rulesOf, nameOf } from '../session/item-sections.js?v=0.2.9';
import { huntName } from '../session/party-sections.js?v=0.2.9';
import { itemName } from './widgets/bits.js?v=0.2.9';
import { whole } from '../render/format.js?v=0.2.9';
import { CONSUMABLES, CONSUMABLE_KINDS } from '../data/consumables.js?v=0.2.9';

const residueOf = (cs) => {
  const r = cs && cs.record && cs.record.residue && cs.record.residue.alerts;
  return r && typeof r === 'object' ? r : {};
};
const who = (cs) => nameOf(cs) || 'Character ' + (cs.slot + 1);

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

/* The low-supply items of a hunting character: restock targets under the share, and bar supplies at zero. */
function lowItems(cs, hero) {
  const bag = bagOf(cs);
  if (!bag) return [];
  const s = settingsOf(cs);
  /* The store pays per use unless the hero opted into "own stock, end the hunt": running out is no event. */
  const storePays = !s || s.supplySource === 'store' || s.onEmpty !== 'end';
  /* A drink restores mana: a hero the server gives no mana pool never needs one. */
  const uses = (id) => kindOf(id) !== 'drink' || hero.manaMax > 0;
  const have = new Map(bag.map((r) => [r.id, r.qty]));
  const stock = (id) => (CONSUMABLE_KINDS[id] ? bag.reduce((n, r) => n + (kindOf(r.id) === id ? r.qty : 0), 0) : have.get(id) || 0);
  const out = new Map();
  const rules = rulesOf(cs);
  if (rules) for (const [id, target] of Object.entries(rules.restock)) {
    const n = have.get(id) || 0;
    if (uses(id) && n * 100 < target * LOW_SUPPLY_PCT && !(storePays && n === 0)) out.set(id, { item: id, have: n, target });
  }
  if (s && !storePays) for (const sl of s.slots) {
    if (!sl.empty && sl.action.type === 'consume' && uses(sl.item) && !(stock(sl.item) > 0) && !out.has(sl.item)) out.set(sl.item, { item: sl.item, have: 0, target: null });
  }
  return Array.from(out.values());
}
/* A kind reads as plain words ("out of drinks"); an item by its name. */
const supplyWords = (id) => (id === 'food' ? 'food' : id === 'drink' ? 'drinks' : itemName(id));

/**
 * What this character's record says happened, as candidate alerts (pure).
 * @returns {{id: string, kind: string, text: string, session: string|null, item?: string}[]}
 */
function candidatesOf(cs) {
  const h = huntOf(cs);
  if (!h) return [];
  const out = [];
  const where = huntName(h.huntId);
  /* A death ends the hunt (CORE_MODEL.md §4): the death alert stands in for the ended one. */
  if (h.ended && h.endReason === 'died') out.push({ id: 'death:' + h.sessionId, kind: 'death', session: h.sessionId,
    text: END_REASON_COPY.died.one.replace('{name}', who(cs)).replace('{ground}', where) });
  else if (h.ended && h.endReason === 'party_member_died') out.push({ id: 'death:' + h.sessionId, kind: 'death', session: h.sessionId,
    text: 'A party member died in ' + where + ', so ' + who(cs) + '’s party returned to town.' });
  else if (h.ended) out.push({ id: 'ended:' + h.sessionId, kind: 'ended', session: h.sessionId, text: who(cs) + '’s hunt in ' + where + ' has ended.' });
  else for (const l of lowItems(cs, h.hero)) {
    out.push({ id: 'low:' + h.sessionId + ':' + l.item, kind: 'low', session: h.sessionId, item: l.item,
      text: who(cs) + ' is ' + (l.have === 0 ? 'out of ' : 'low on ') + supplyWords(l.item) + (l.target ? ' (' + whole(l.have) + ' of ' + whole(l.target) + ').' : '.') });
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
    alerts.unshift(Object.assign({ key: 'a' + (++n), slot: cs.slot, action: kind.action, button: kind.button, glyph: kind.glyph, pending: false, msg: '' }, c));
    if (alerts.length > 32) alerts.length = 32;
    const r = residueOf(cs);
    cs.setResidue('alerts', { off: Array.isArray(r.off) ? r.off : [], seen: (Array.isArray(stored) ? stored : []).concat(c.id).slice(-ALERTS_SEEN_MAX) });
    return true;
  }

  function scan(cs) {
    let any = false;
    for (const c of candidatesOf(cs)) any = fire(cs, c) || any;
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
