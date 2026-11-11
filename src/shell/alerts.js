// ════════════════════════════════════════════════════════════════════════
// src/shell/alerts.js — THE ALERTS: WHAT HAPPENED TO WHICH CHARACTER, ONCE.
//
// One alert centre per AccountSession, watching every open character (QoL 7,
// Tyler 10-18). It reads only what the server sent, and turns four kinds of
// event (src/data/alerts.js) into one line each with the next action:
//   rare    a `rare_drop` event as it ARRIVES in the character's timeline
//           (timeline.onArrive, so a character that is not on screen still
//           tells), id = the server's own event id
//   out     a `slot_dry` event as it arrives for this character's hero (Tyler
//           2026-10-21): "Mira's Cooked Shrimp ran out: slot 2 (Salted Shrimp)
//           takes over", the slot and item the engine named (the server's
//           commit carries it), id = the event's key
//   death   the hunt section ending `died` / `party_member_died`, id = session
//           (a death of the character ON SCREEN is the death popup instead,
//           death-popup.js; one whose popup was dismissed never fires)
//   low     a bar supply at zero for a hero set to end its hunt on empty, while hunting; id = session + item. Never for a resource
//           the hero does not use (a drink for a hero with no mana pool), and
//           never "out of" while the store pays per use (supply_source `store`
//           or on_empty `switch`: HUNT_SCREEN_SPEC §3.4 rule 7, the hunt never
//           stops for lack of stock). A bar slot names ONE item: its stock is
//           that item's bag stack.
//   ended   the hunt section saying `ended`, id = session
//   away    "While you were away": on return, what the hunt did since this
//           browser last showed it (away-recap.js), id = session + the stamp
//   invite  a party invite waiting for the character (`party_invites`), id =
//           the server's invite id; Join / No thanks answer it, and it goes
//           when the server no longer lists it (answered anywhere, expired)
//   party   what another player's move did to this hero (`party_notices`,
//           2027-02-18-party-truth.sql), id = the server's notice id: said no,
//           removed it, closed the party, left
//   partywarn  a warning first: the leader is about to take the party above this
//           hero's level (a `party_notices` ground_warn, id = the notice's), or a
//           friend's stamina is low (`stamina_low_ms`, id = session + seat)
//
// THE RULE: an alert fires ONCE per event id. The ids already shown are kept
// in memory for the page and in the character's residue (`alerts.seen`,
// display state, bounded) for the next visit, so a reload or a re-sent
// envelope never repeats one. Which kinds show is the residue's `alerts.off`.
// Nothing here gates or spends anything; the "Start again" button is an
// intent (CharacterSession.restartHunt) like every other.
// ════════════════════════════════════════════════════════════════════════
import { ALERT_INDEX } from '../data/alerts.js?v=0.2.119';
import { END_REASON_COPY } from '../data/hunt-sessions.js?v=0.2.119';
import { ALERTS_SEEN_MAX } from '../session/residue.js?v=0.2.119';
import { huntOf, settingsOf } from '../session/hunt-sections.js?v=0.2.119';
import { carriedOf, nameOf, huntLootOf } from '../session/item-sections.js?v=0.2.119';
import { huntName, invitesOf, noticesOf, partyMembershipOf } from '../session/party-sections.js?v=0.2.119';
import { callOfHunt } from '../data/boss-calls.js?v=0.2.119';
import { cameHomeWords, noticeWords, staminaLowWords } from '../data/party-words.js?v=0.2.119';
import { itemName } from './widgets/bits.js?v=0.2.119';
import { noShotWords } from './hunt-go.js?v=0.2.119';
import { CONSUMABLES } from '../data/consumables.js?v=0.2.119';
import { deathSeen } from './death-popup.js?v=0.2.119';
import { summaryClosedFor, forgetUnreadSummary } from '../hunt-view/summary-recorder.js?v=0.2.119';
import { awayRecapOf, awayLineNow, awaySettled, stampAway as stampNow, markBack, backWithNoStamp } from './away-recap.js?v=0.2.119';
import { benchStopRecapOf } from './bench-fee.js?v=0.2.119';
import { workRow } from './town-work.js?v=0.2.119';
import { tallyOf, pickWords } from '../session/tally-sections.js?v=0.2.119';
import { tallyTask } from '../data/tally-tasks.js?v=0.2.119';
import { gold } from '../render/format.js?v=0.2.119';
import { levelOf } from '../session/character-sections.js?v=0.2.119';
import { ITEMS } from '../data/items.js?v=0.2.119';
import { trackOnce } from '../net/observability.js?v=0.2.119';

const tallyLabel = (task) => { const t = tallyTask(task); return t ? t.label : 'a tally'; };

const residueOf = (cs) => {
  const r = cs && cs.record && cs.record.residue && cs.record.residue.alerts;
  return r && typeof r === 'object' ? r : {};
};
const who = (cs) => nameOf(cs) || 'Character ' + (cs.slot + 1);
/* The lines a new hunt retires once its session is open (the last hunt's end, death and low supply). */
const RETIRE = new Set(['ended', 'death', 'low']);
/* How long the away card must have been up to count as read when the page is left. */
const AWAY_READ_MS = 8000;
/* THE HOOK, COUNTED (designer 2026-11-10: "Your hero keeps hunting after you close the game"). Three funnel steps this centre is the one to see,
   sent as the coach's are (observability.js trackOnce: once per scope in a page load, a no-op where nothing sends). Numbers and ids only: a slot,
   a ground id, an item id, a Level, minutes. Never a name. Nothing reads them back.
     left_with_hunt_running  the page was hidden or closed over an open hunt            per hero, once hidden and once closed
     away_recap_shown        "While you were away" came up for a hunt                   per line
     first_gear_found        a piece of gear landed in the open hunt's loot, in view    per hero */
const GEAR_TYPES = new Set(['armor', 'weapon', 'offhand', 'jewelry']);
/** The gear ids in this hero's open hunt's loot (the server's `hunt.loot`), or null with no open hunt or no loot sent. */
function huntGearOf(cs) {
  const h = huntOf(cs), loot = huntLootOf(cs);
  if (!h || h.ended || !loot) return null;
  return loot.filter((l) => l.count > 0 && ITEMS[l.item] && GEAR_TYPES.has(ITEMS[l.item].type)).map((l) => l.item);
}

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

/* Which kind a consume slot's ONE item is ('food' | 'drink'; null = neither). */
const kindOf = (id) => (CONSUMABLES[id] ? CONSUMABLES[id].kind : null);

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
  const stock = (id) => have.get(id) || 0;
  const out = new Map();
  if (s && !storePays) for (const sl of s.slots) {
    if (!sl.empty && sl.action.type === 'consume' && uses(sl.item) && !(stock(sl.item) > 0) && !out.has(sl.item)) out.set(sl.item, { item: sl.item });
  }
  return Array.from(out.values());
}
const supplyWords = (id) => itemName(id);

/**
 * What this character's record says happened, as candidate alerts (pure).
 * @returns {{id: string, kind: string, text: string, session: string|null, item?: string}[]}
 */
function candidatesOf(cs, viewed) {
  const out = (invitesOf(cs) || []).map((i) => ({ id: 'invite:' + i.id, kind: 'invite', session: null, invite: i.id,
    text: i.from + ' invites ' + who(cs) + ' to their party.' }));
  /* What another player's move did to this hero, once per notice the server wrote. */
  for (const n of noticesOf(cs) || []) {
    const said = noticeWords(n, { name: who(cs), ground: n.hunt ? huntName(n.hunt) : null });
    if (said) out.push({ id: 'party:' + n.id, kind: n.kind === 'ground_warn' ? 'partywarn' : 'party', session: null, text: said });
  }
  /* Tamsin's payments (the server's claims of the last day, `tally.recent`): one line each, ever. */
  for (const p of (tallyOf(cs) || { recent: [] }).recent) {
    out.push({ id: 'tally:' + p.claim, kind: 'tally', session: null, item: p.item,
      text: 'Tamsin paid ' + who(cs) + ' ' + gold(p.gold) + ' and ' + pickWords(p, itemName) + ' for ' + tallyLabel(p.task) + '.' });
  }
  const h = huntOf(cs);
  if (!h) return out;
  const where = huntName(h.huntId);
  /* A called room has no "Start again": its one door is the paid press on the ground's page (src/data/boss-calls.js). */
  const endedKind = callOfHunt(h.huntId) ? 'party' : 'ended', endedSession = endedKind === 'ended' ? h.sessionId : null;
  /* A death ends the hunt (CORE_MODEL.md §4): the death alert stands in for the ended one. The character
     on screen gets the death POPUP instead (death-popup.js, Tyler 2026-10-19), and a death whose popup was
     already dismissed never comes back as a side line. */
  if (h.ended && h.endReason === 'died') {
    if (!viewed && !deathSeen(cs, h.sessionId)) out.push({ id: 'death:' + h.sessionId, kind: 'death', session: h.sessionId,
      text: END_REASON_COPY.died.one.replace('{name}', who(cs)).replace('{ground}', where) });
  }
  /* LEAVE TOGETHER (Tyler 2026-10-22): "<Name> left the hunt, so <hero> came home too." / "<Name> fell, so ..." */
  else if (h.ended && h.endReason === 'party_member_died') out.push({ id: 'death:' + h.sessionId, kind: 'death', session: h.sessionId,
    text: cameHomeLine(h, who(cs)) });
  else if (h.ended && h.endReason === 'party_member_left') out.push({ id: 'ended:' + h.sessionId, kind: endedKind, session: endedSession,
    text: cameHomeLine(h, who(cs)) });
  /* The character ON SCREEN gets its hunt summary instead (it opens by itself: src/shell/shell.js followSummary), the
     one notice of a return (designer walk 2026-10-25 #5): its line is marked seen, never shown. */
  else if (h.ended) out.push({ id: 'ended:' + h.sessionId, kind: endedKind, session: endedSession, quiet: viewed, text: who(cs) + '’s hunt in ' + where + ' has ended.' });
  else {
    for (const l of lowItems(cs, h.hero)) {
      out.push({ id: 'low:' + h.sessionId + ':' + l.item, kind: 'low', session: h.sessionId, item: l.item,
        text: who(cs) + ' is out of ' + supplyWords(l.item) + '.' });
    }
    const noShot = noShotWords(cs);
    if (noShot) out.push({ id: 'low:' + h.sessionId + ':noshot', kind: 'low', session: h.sessionId, text: who(cs) + ': ' + noShot });
    /* A friend's stamina, before it sends anyone home (the server says only once it is low). */
    const p = partyMembershipOf(cs);
    for (const s of p ? p.seats : []) {
      if (s.seat !== p.me && s.hunting && s.staminaLowMs !== null) {
        out.push({ id: 'lowstam:' + h.sessionId + ':' + s.seat, kind: 'partywarn', session: h.sessionId, text: staminaLowWords(s.name, s.staminaLowMs, who(cs), p.leaveTogether === true) });
      }
    }
  }
  return out;
}

/** A ticked hero's way home (LEAVE TOGETHER): who ended first and why, by the server's `end_by` and `end_by_why` ("A party
    member" when it cannot say), and this hero's name. Pure; exported for tests/party-ui.mjs. */
export function cameHomeLine(h, hero) {
  return h ? cameHomeWords(h.endReason, h.endBy, h.endWhy, hero) : '';
}

/** The rare-drop alert for one arriving timeline event, or null. */
function rareOf(cs, ev) {
  if (!ev || ev.type !== 'rare_drop' || typeof ev.item !== 'string' || typeof ev.key !== 'string') return null;
  const h = huntOf(cs);
  /* a party member's rare is theirs: only this character's own hero raises it */
  if (h && h.hero && Number.isInteger(ev.u) && Number.isInteger(h.hero.unit) && ev.u !== h.hero.unit) return null;
  /* hero, place and at are the shareable card's facts (src/shell/share-card.js): display only. */
  return { id: 'rare:' + (h ? h.sessionId : 'slot' + cs.slot) + ':' + ev.key.replace(/[^A-Za-z0-9_:.-]/g, '_').slice(0, 60), kind: 'rare',
    session: h ? h.sessionId : null, item: ev.item, text: 'Rare drop for ' + who(cs) + ': ' + itemName(ev.item) + '!',
    hero: who(cs), place: h ? huntName(h.huntId) : null, at: Number.isFinite(ev.atMs) ? ev.atMs : null };
}

/** The run-out alert for one arriving `slot_dry` event of this character's hero, or null. */
export function runOutOf(cs, ev) {
  if (!ev || ev.type !== 'slot_dry' || typeof ev.item !== 'string' || typeof ev.key !== 'string') return null;
  const h = huntOf(cs);
  if (!h || !h.hero || !Number.isInteger(ev.u) || ev.u !== h.hero.unit) return null;
  const then = typeof ev.next === 'string' && Number.isInteger(ev.slot)
    ? ': slot ' + ev.slot + ' (' + itemName(ev.next) + ') takes over.'
    : ', and no slot takes over: ' + who(cs) + ' hunts on without it.';
  return { id: 'out:' + h.sessionId + ':' + ev.key.replace(/[^A-Za-z0-9_:.-]/g, '_').slice(0, 60), kind: 'low', session: h.sessionId, item: ev.item,
    text: who(cs) + '’s ' + itemName(ev.item) + ' ran out' + then };
}

/**
 * @param {object} account  the AccountSession (its open characters, and 'opening' / 'closed')
 * @param {object} [opts]   { track(name, props, scope): the funnel's sender (the tests'), clock(): ms since the page loaded }
 */
export function createAlertCenter(account, opts) {
  const track = (opts && opts.track) || trackOnce;
  const sinceLoad = (opts && opts.clock) || (() => (typeof performance !== 'undefined' ? performance.now() : 0));
  const gearSeen = new Map();        // slot -> { session, ids: Set } the gear already in the open hunt's loot
  const alerts = [];                 // newest first
  const seen = new Map();            // slot -> Set of ids shown on this page
  const watching = new Map();        // slot -> [unsubscribe]
  const listeners = new Set();
  /* The slots whose next read is a RETURN: this page's first of the hero, or the first after it was left (leaving). A hunt in view is never "away". */
  const returning = new Set();
  let n = 0;

  const changed = () => { for (const fn of Array.from(listeners)) { try { fn(); } catch (e) { console.error('[alerts] a listener failed', e); } } };
  /* A RELOAD DURING A SLOW FIRST LOAD ATE THE AWAY CARD (played 2026-11-04: reloaded 0.6 s and 2 s after Play, the next load said nothing). The card isn't read
     until it has been up AWAY_READ_MS, and a hero not judged yet has told nothing: leaving then keeps the absence for the next load. Display state only. */
  const youngAway = new Map();
  let hiding = false;
  const cardYoung = (cs) => { const y = youngAway.get(cs.slot); return !!y && Date.now() - y.at < AWAY_READ_MS; };
  function cardUnread(cs) {
    if (returning.has(cs.slot)) return true;
    if (hiding || !cardYoung(cs)) return false;
    const y = youngAway.get(cs.slot);
    cs.setResidue('alerts', { off: Array.isArray(y.off) ? y.off : [], seen: Array.isArray(y.seen) ? y.seen : [] });
    return true;
  }
  /* No stamp over a card still being read, on screen or on the way out (a page only hidden may flicker back, so it stamps as ever); every other stamp is away-recap.js's own. */
  const stampAway = (cs, leaving) => ((leaving ? cardUnread(cs) : cardYoung(cs)) ? false : stampNow(cs, leaving));
  const seenOf = (slot) => { let s = seen.get(slot); if (!s) { s = new Set(); seen.set(slot, s); } return s; };

  function fire(cs, c) {
    const mine = seenOf(cs.slot);
    const stored = residueOf(cs).seen;
    if (mine.has(c.id) || (Array.isArray(stored) && stored.includes(c.id))) return false;
    mine.add(c.id);
    if (c.quiet) return false;
    if (!alertShown(cs, c.kind)) return false;
    const kind = ALERT_INDEX[c.kind];
    alerts.unshift(Object.assign({ key: 'a' + (++n), slot: cs.slot, action: kind.action, button: kind.button, decline: kind.decline || null,
      share: kind.share || null, glyph: kind.glyph, pending: false, msg: '' }, c));
    if (c.kind === 'away' && c.session) track('away_recap_shown', { slot: cs.slot, minutes: c.minutes, still_hunting: !c.ended, levels: c.levels }, c.id);
    if (alerts.length > 32) alerts.length = 32;
    if (kind.fadeMs) { const key = alerts[0].key; setTimeout(() => { const i = alerts.findIndex((a) => a.key === key); if (i >= 0) { alerts.splice(i, 1); changed(); } }, kind.fadeMs); }
    /* `transient`: live news a reload never raises again, so it takes no place in the saved list */
    if (!c.transient) {
      const r = residueOf(cs);
      cs.setResidue('alerts', { off: Array.isArray(r.off) ? r.off : [], seen: (Array.isArray(stored) ? stored : []).concat(c.id).slice(-ALERTS_SEEN_MAX) });
    }
    return true;
  }

  /* first_gear_found: the first read of a hunt is the baseline (what dropped unseen is the return's news, not a find); a gear id new since then is the find. */
  function noteGear(cs) {
    const ids = huntGearOf(cs);
    if (!ids) return;
    const h = huntOf(cs), was = gearSeen.get(cs.slot);
    if (!was || was.session !== h.sessionId) { gearSeen.set(cs.slot, { session: h.sessionId, ids: new Set(ids) }); return; }
    const found = ids.find((id) => !was.ids.has(id));
    if (!found) return;
    for (const id of ids) was.ids.add(id);
    const lv = levelOf(cs);
    track('first_gear_found', { slot: cs.slot, hunt: h.huntId, item: found, level: lv ? lv.level : null }, 'gear:' + cs.slot);
  }
  /* left_with_hunt_running: every open hero whose hunt is open as the page goes. `how`: hidden (it may come back) or closed. */
  function noteLeft(how) {
    for (const cs of account.characters()) {
      const h = huntOf(cs);
      if (!h || h.ended) continue;
      const lv = levelOf(cs);
      track('left_with_hunt_running', { slot: cs.slot, hunt: h.huntId, level: lv ? lv.level : null, minutes: Math.round(sinceLoad() / 60000), how }, 'left:' + how + ':' + cs.slot);
    }
  }

  function scan(cs) {
    let any = false;
    noteGear(cs);
    /* ON SCREEN: the viewed slot, or, while the first character is still loading (a reload, a sign-in), the one the
       account is opening, since it becomes the viewed one (AccountSession._open: `viewed === null` -> this slot).
       Without that a reload raised "has ended · Start again" over the hero on screen (QA2's Pellow, 10-25). */
    const now = candidatesOf(cs, account.viewed === cs.slot || account.viewed === null);
    /* "While you were away" (away-recap.js): judged against the last-seen stamp BEFORE it is renewed. */
    const judged = returning.has(cs.slot);
    const away = judged ? awayRecapOf(cs) : null;
    if (away) { now.push(away); markBack(cs, away.session, away.at); } else if (judged) backWithNoStamp(cs);
    /* A bench the server stopped for gold says so once, watched or not (the work bench tax: bench-fee.js). */
    const broke = benchStopRecapOf(cs, (id) => { const w = workRow('artisan', id); return w ? w.row.name : 'A bench job'; });
    if (broke) now.push(broke);
    /* Before it fires: firing writes the residue, and the listeners' scan runs inside that write. */
    if (away && !seenOf(cs.slot).has(away.id)) youngAway.set(cs.slot, { at: Date.now(), seen: residueOf(cs).seen, off: residueOf(cs).off });
    for (const c of now) any = fire(cs, c) || any;
    /* A town job's return waits for the settle that pays it; the stamp waits with it. */
    if (judged && awaySettled(cs)) returning.delete(cs.slot);
    if (!returning.has(cs.slot)) stampAway(cs);
    /* An invite the server no longer lists (answered elsewhere, expired, its party gone) leaves the lines. */
    const live = new Set(now.filter((c) => c.kind === 'invite').map((c) => c.id));
    /* A NEW HUNT RETIRES THE LAST ONE'S LINES (Brannoc 10-22: "has ended · Start again" stayed up into the next
       hunt): once the server says another session is open, an ended, death or low line of an older one goes. */
    const h = huntOf(cs);
    const open = h && !h.ended ? h.sessionId : null;
    for (let i = alerts.length - 1; i >= 0; i--) {
      const a = alerts[i];
      if (a.slot !== cs.slot) continue;
      /* A warning is about what comes next: a friend's low stamina goes with the hunt it was raised in, a warned ground once a hunt is open. */
      const stale = a.kind === 'partywarn' && (a.session ? a.session !== open : !!open);
      /* AN END ALREADY SEEN IS OVER (party panel 2026-11-03: "Pip left the hunt, so Kell came home too" outlived that hunt's summary): the player closed the summary, or dismissed the death. */
      const seenEnd = !!a.session && (a.kind === 'ended' || a.kind === 'death') && (summaryClosedFor(cs, a.session) || deathSeen(cs, a.session));
      if (stale || seenEnd || (a.kind === 'invite' && !live.has(a.id)) || (open && RETIRE.has(a.kind) && a.session && a.session !== open)) { alerts.splice(i, 1); any = true; continue; }
      /* "While you were away": what the hunt is doing now is the record's, never the moment the card came up (CLAUDE.md §6). */
      const line = a.kind === 'away' ? awayLineNow(cs, a) : a.text;
      if (line === null) { alerts.splice(i, 1); any = true; } else if (line !== a.text) { a.text = line; any = true; }
    }
    if (any) changed();
  }

  function watch(slot) {
    const cs = account.character(slot);
    if (!cs || watching.has(slot)) return;
    const offs = [cs.subscribe((s, why) => { if (why !== 'closed') scan(s); })];
    if (cs.timeline && typeof cs.timeline.onArrive === 'function') {
      offs.push(cs.timeline.onArrive((ev) => { const c = rareOf(cs, ev) || runOutOf(cs, ev); if (c && fire(cs, c)) changed(); }));
    }
    watching.set(slot, offs);
    returning.add(slot);
    scan(cs);
  }
  function unwatch(slot) {
    for (const off of watching.get(slot) || []) off();
    watching.delete(slot);
    returning.delete(slot);
    gearSeen.delete(slot);
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
    /** Judge this hero's lines again: something a record does not say has changed (its summary was closed, shell.js). */
    rescan(cs) { if (cs && watching.has(cs.slot)) scan(cs); },
    /** A line this centre did not read off a record (the Weighhouse's notices, market-watch.js): fired once by its id. */
    say(cs, c) { if (fire(cs, c)) changed(); },
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
    /** The page is being left (src/app/boot.js): every open hero's last-seen stamp and whatever residue still sits in the debounce (a Got it, a
        closed summary, a moved window) go now, on a fetch that outlives the page. `hidden`: only hidden, it may yet flicker back (flushResidue). */
    leaving({ hidden = false } = {}) {
      hiding = hidden;
      noteLeft(hidden ? 'hidden' : 'closed');
      if (!hidden) for (const cs of account.characters()) forgetUnreadSummary(cs);
      for (const cs of account.characters()) { stampAway(cs, true); cs.flushResidue({ keepalive: true, hidden }).catch(() => {}); }
      for (const cs of account.characters()) returning.add(cs.slot);
    },
    destroy() { offAccount(); for (const slot of Array.from(watching.keys())) unwatch(slot); listeners.clear(); },
  };
}
