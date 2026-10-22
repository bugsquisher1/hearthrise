// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/hunts.js — HUNTS: WHERE TO GO, AND THE ONE PRESS THAT GOES.
//
// Tyler's first playtest (10-18): "It's not obvious how I go to hunts; clicking
// the cellar does nothing." This window is the answer, one gesture from
// anywhere: its launcher is the first icon, its key is H, and a hunt's door in
// the World (the mill hatch) opens it with that hunt picked
// (src/app/world-pane.js turns the World's `entrance` into pickHunt + open).
//
// One ruled line per hunt ground (src/shell/hunt-list.js, from the data rows):
// its name and theme, its Level band against the character's own Level,
// who may come, and how crowded it is. The picked line carries the window's one
// primary, Enter, and says what the hunt will carry from the bag (its own
// supplies). Enter is ONE hr_hunt_enter; the server checks the band, the stamina
// and the stock, and the hunt shows only from the re-read envelope. A hunt above
// the character's level says so ("expect losses"); the floor is a warning, and
// only the server refuses (Tyler 10-18: 15 or more levels under it).
//
// IN A PARTY (PARTY_SPEC.md §1.5, Tyler 10-19) the ground is chosen HERE, at
// Start: the leader's Enter reads "Start with party" and is ONE
// hr_hunt_party_start naming the picked hunt; everyone walks in together, each
// with their own saved setup, or nobody, and the answer names who was not
// ready. A member's Enter stays off ("the leader starts the hunt"). The party
// size is the server's seat count; the picked ground's party rule (its row's
// minParty pocket and boss) shows on its line.
//
// DENSITY is chosen with the hunt, before Enter (Tyler 10-18): how many monsters
// each spawn holds (the engine's pack size, pull-cycle.js spawnPack), a −/+
// stepper on the picked line from "as built" up to the ground's most for the
// party's size (hunt-grounds.js densityFor). A press moves the number AT ONCE,
// marked "Saving..." (Tyler 10-20: the round trip per press was "incredibly
// laggy"): presses inside DENSITY_SAVE_MS coalesce into ONE hr_hunt_density_set
// carrying the last value, and the server's answer (the re-read hunt_density)
// replaces the draft; a refusal shows the server's value again and why. Nothing
// spends the draft (CLAUDE.md §6): Enter / Start with party first waits for the
// save. The pick is the hero's own PER GROUND (rulings H4: remembered per hunt,
// never part of a setup), so each line's facts say the pull size the server
// spawns at THAT ground's pick.
// IN A PARTY THE LEADER CHOOSES (Tyler 2026-10-20): the leader's pick is the pull
// for everyone; a member sees it read-only ("Set by <leader>: 7 each", the
// server's `leader_densities`) with no step, and the server refuses a member's
// pick (hr_hunt_density_set `not_leader`).
// ════════════════════════════════════════════════════════════════════════
import { huntOf, settingsOf, huntBestsOf, huntDensityOf } from '../../session/hunt-sections.js?v=0.2.27';
import { bagOf } from '../../session/item-sections.js?v=0.2.27';
import { levelOf as levelRowOf } from '../../session/character-sections.js?v=0.2.27';
import { huntName, partyMembershipOf } from '../../session/party-sections.js?v=0.2.27';
import { startPartyHunt, settleTownActivity } from '../../session/party-intents.js?v=0.2.27';
import { rows, text, cls, prop, attr, element } from '../../render/paint.js?v=0.2.27';
import { whole } from '../../render/format.js?v=0.2.27';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.27';
import { itemName } from '../widgets/bits.js?v=0.2.27';
import { runIntent, refusalText } from '../intent-words.js?v=0.2.27';
import { HUNT_GROUNDS, densityFor, DENSITY_PICK } from '../../data/hunt-grounds.js?v=0.2.27';
import { huntRows, densityWords, bandWords, rangeWords, groupWords, recommendation, heroWords, packFor, partyNote, bestWords, ABOVE_LEVEL_WORDS } from '../hunt-list.js?v=0.2.27';

const SCRATCH = new WeakMap();
/* `draft` is the density shown before the server has it ({ hunt, n }), `timer` its coalescing
   wait, `saving` the save in flight (its promise: Enter waits on it). */
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { pick: null, pending: false, msg: '', draft: null, timer: null, saving: null }; SCRATCH.set(cs, s); } return s; };
/* How long the step waits for the next press before it saves (one intent for a run of presses). */
const DENSITY_SAVE_MS = 300;

/** Pick a hunt in this character's Hunts window (the World's door does, before it opens the window). */
export function pickHunt(cs, hunt) {
  if (!cs) return;
  const sc = scratchOf(cs);
  if (huntRows().some((r) => r.hunt === hunt)) { sc.pick = hunt; sc.msg = ''; }
}

/* The character's Level (the server's Level XP on the shared curve), or null. */
function levelOf(cs) {
  const lv = levelRowOf(cs);
  return lv ? lv.level : null;
}

const groundOf = (hunt) => Object.values(HUNT_GROUNDS).find((x) => x.hunt === hunt) || null;

/* The server's pick on this ground (`picks`: { [hunt]: n }, no key = 0, as built) as the ground would spawn it,
   and the most the ground allows for `size`; null = unknown (no section, or no ground). */
function densityOf(picks, hunt, size) {
  const g = groundOf(hunt);
  if (!picks || !g) return null;
  const pick = Number.isInteger(picks[hunt]) ? picks[hunt] : 0;
  return { now: densityFor(g, size, pick), max: densityFor(g, size, DENSITY_PICK.max) };
}

/* The density on screen: this ground's unsaved draft while there is one, else the server's (both clamped to
   the ground). A party member's is its leader's (the party section's leader_densities), never its own. */
function shownDensity(sc, picks, hunt, size, party) {
  if (party && !party.isLeader) return densityOf(party.densities, hunt, size);
  const dn = densityOf(picks, hunt, size);
  if (!dn || !sc.draft || sc.draft.hunt !== hunt) return dn;
  return { now: densityFor(groundOf(hunt), size, sc.draft.n), max: dn.max };
}

/**
 * SAVE THE DENSITY DRAFT NOW: ONE hr_hunt_density_set with its ground and value, queued behind any save in
 * flight. The answer clears the draft only if no later press replaced it; a refusal says why (the
 * server's value shows again). Answers the save's result ({ ok: true } when nothing was waiting).
 */
function saveDensity(cs, sc, repaint) {
  clearTimeout(sc.timer);
  sc.timer = null;
  const d = sc.draft;
  if (!d) return sc.saving || Promise.resolve({ ok: true });
  const p = (sc.saving || Promise.resolve()).then(async () => {
    let r;
    try { r = await cs.setHuntDensity(d.hunt, d.n); } catch (e) { r = null; }
    if (!r) r = { ok: false, error: 'network' };
    if (sc.draft === d) { sc.draft = null; sc.msg = r.ok ? '' : refusalText(r); }
    if (sc.saving === p) sc.saving = null;
    repaint();
    return r;
  });
  sc.saving = p;
  return p;
}

/* Enter / Start with party never goes on an unsaved density: the draft is saved first, and a refused save refuses the start. */
function afterDensity(cs, sc, repaint, go) {
  if (!sc.draft && !sc.saving) return go();
  return saveDensity(cs, sc, repaint).then((r) => (r && r.ok === false ? r : go()));
}

function packWords(lines) {
  if (!lines.length) return 'You carry nothing from your bag.';
  return 'You carry ' + lines.map((l) => whole(l.qty) + ' ' + itemName(l.item)).join(', ') + '.';
}

/** The skeleton (built once per opening). */
export function renderHunts() {
  return '<div class="hw-hunts">'
    + '<p class="hs-note hw-hunts-now"></p><p class="hs-note hw-hunts-reco" hidden></p>'
    + '<ul class="hw-ledger hw-hunt-list" role="listbox" aria-label="Hunts"></ul>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

function lineHtml(r) {
  return '<li class="hw-hunt" role="option" data-hs-act="pick" data-hunt="' + esc(r.hunt) + '" tabindex="-1">'
    + '<span class="hw-hunt-main"><b class="hw-hunt-name">' + esc(r.name) + '</b><small class="hw-hunt-theme">' + esc(r.theme) + '</small>'
    + '<small class="hw-hunt-band"></small><small class="hw-hunt-warn"></small><small class="hw-hunt-facts"></small>'
    + '<span class="hw-hunt-best"><small class="hw-hunt-best-solo"></small><small class="hw-hunt-best-party"></small></span>'
    + '<small class="hw-hunt-pack"></small><small class="hw-hunt-party"></small>'
    + '<span class="hw-density" role="group" aria-label="Density"><span class="hw-density-label">Density</span>'
    + '<span class="hh-step"><button type="button" class="hh-seg" data-hs-act="density" data-by="-1" data-hunt="' + esc(r.hunt) + '" aria-label="Fewer monsters">−</button>'
    + '<output class="hh-step-val"></output>'
    + '<button type="button" class="hh-seg" data-hs-act="density" data-by="1" data-hunt="' + esc(r.hunt) + '" aria-label="More monsters">+</button></span>'
    + '<small class="hw-density-note"></small></span></span>'
    + '<span class="hw-hunt-do"><button type="button" class="hh-tool hw-hunt-enter" data-hs-act="enter" data-hunt="' + esc(r.hunt) + '">Enter</button></span></li>';
}

renderHunts.patch = function patchHunts(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const root = body.querySelector('.hw-hunts');
  const list = huntRows();
  const h = huntOf(cs);
  const now = h && !h.ended ? h : null;
  const level = levelOf(cs);
  const party = partyMembershipOf(cs);
  const size = party ? party.seats.length : 1;
  const follower = !!party && !party.isLeader;
  /* The advice reads the server's levels: this hero's, or every seat's in its party (the party's levels pick). */
  const rec = recommendation(party ? party.seats.map((s) => (s.seat === party.me ? level : s.level)) : level, size, list);
  if (!sc.pick && list.length) sc.pick = rec.row ? rec.row.hunt : list[0].hunt;
  const pack = packFor(bagOf(cs));
  /* This hero's density pick per ground (hunt_density); null = the server sent none, no number shows. */
  const picks = huntDensityOf(cs);
  /* This hero's personal bests, the server's (hunt_bests); null = the server sent none, the lines stay empty. */
  const bests = huntBestsOf(cs);
  /* "On the way to …" is the intent's answer, not the hunt's state: once the server's hunt section
     says the hero is hunting (or the hunt is over), the line below speaks for it (Tyler 10-19). */
  if (sc.msg && sc.msg === sc.enterMsg && (now || (h && h.ended))) { sc.msg = ''; sc.enterMsg = null; }
  const nowEl = root.querySelector('.hw-hunts-now');
  text(nowEl, now ? 'You are hunting in ' + huntName(now.huntId) + '. Leave that hunt to go somewhere else.'
    : follower ? 'Your party leader picks the hunt and starts it. You walk in with everyone, with your own setup.'
    : party ? 'Pick a hunt, then Start with party. Everyone walks in together, each with their own setup.'
    : 'Pick a hunt, then Enter. Your hero walks there and fights on its own.');
  /* No ground built for this group holds its level: said plainly (the pick is the nearest below). */
  const reco = root.querySelector('.hw-hunts-reco');
  const advice = !now && !follower && rec.note ? rec.note : '';
  text(reco, advice);
  prop(reco, 'hidden', !advice);
  rows(root.querySelector('.hw-hunt-list'), list, {
    key: (r) => r.hunt,
    build: (r) => element(ctx.doc, lineHtml(r)),
    patch: (li, r) => {
      const on = sc.pick === r.hunt;
      cls(li, 'is-picked', on);
      attr(li, 'aria-selected', String(on));
      const short = Number.isInteger(level) && level < r.band[0];
      const band = li.querySelector('.hw-hunt-band');
      text(band, bandWords(r, level));
      cls(band, 'is-short', short);
      /* the floor is a warning (Tyler 10-18): words only, Enter stays the server's to refuse */
      text(li.querySelector('.hw-hunt-warn'), [rangeWords(r, level), groupWords(r, size)].filter(Boolean).join(' '));
      text(li.querySelector('.hw-hunt-pack'), on ? packWords(pack) : '');
      const best = bestWords(bests, r.hunt);
      text(li.querySelector('.hw-hunt-best-solo'), best ? best.solo : '');
      text(li.querySelector('.hw-hunt-best-party'), best ? best.party : '');
      prop(li.querySelector('.hw-hunt-best'), 'hidden', !best);
      /* The picked ground's party rule, from ITS row (Tyler 10-19: the Rat King's note). */
      const note = li.querySelector('.hw-hunt-party');
      const said = on ? partyNote(r.hunt) : '';
      text(note, said);
      prop(note, 'hidden', !said);
      const enter = li.querySelector('.hw-hunt-enter');
      text(enter, party && !follower ? 'Start with party' : 'Enter');
      cls(enter, 'hw-primary', on);
      cls(enter, 'is-on', on);
      cls(enter, 'hh-tool', !on);
      for (const b of li.querySelectorAll('button')) prop(b, 'disabled', sc.pending || !!now);
      if (follower) prop(enter, 'disabled', true);
      const dn = shownDensity(sc, picks, r.hunt, size, party);
      /* The pull size the server spawns at the shown pick (each line its own ground's pick). */
      text(li.querySelector('.hw-hunt-facts'), heroWords(r) + ' · ' + densityWords(r, dn ? dn.now : null));
      cls(li.querySelector('.hw-density'), 'is-on', on && !!dn);
      for (const b of li.querySelectorAll('.hw-density [data-by]')) prop(b, 'hidden', follower);
      if (on && dn) {
        const val = li.querySelector('.hw-density .hh-step-val');
        const words = dn.now ? dn.now + ' each' : 'As built';
        text(val, follower ? 'Set by ' + (party.leaderName || 'your leader') + ': ' + words : words);
        attr(val, 'data-pending', String(!follower && !!(sc.draft || sc.saving)));
        /* The size it clamps for, named: alone, or this party's seat count (the settle's clamp). */
        text(li.querySelector('.hw-density-note'), follower ? 'Your party leader sets how many monsters each pull brings.'
          : 'How many monsters each pull brings, up to ' + dn.max
          + (size === 1 ? ' when you hunt alone.' : ' for your party of ' + size + '. As the leader, your pick sets the pull for everyone.')
          + ' It stays set for this hunt.');
        prop(li.querySelector('[data-by="-1"]'), 'disabled', follower || sc.pending || !!now || dn.now <= DENSITY_PICK.min);
        prop(li.querySelector('[data-by="1"]'), 'disabled', follower || sc.pending || !!now || dn.now >= dn.max);
      }
    },
  });
  /* An unsaved density is marked on the status line until the server answers. */
  const saving = !sc.pending && !!(sc.draft || sc.saving);
  cls(root, 'is-pending', sc.pending || saving);
  text(root.querySelector('.hh-intent-msg'), saving ? 'Saving…' : sc.msg);
};

renderHunts.act = function actHunts(ctx, body, action, ev, t) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const hunt = t.getAttribute('data-hunt');
  const repaint = () => renderHunts.patch(body, ctx);
  if (action === 'density') {
    /* The number moves on the press; the save waits DENSITY_SAVE_MS for the next press (saveDensity). */
    const picks = huntDensityOf(cs);
    const party = partyMembershipOf(cs);
    /* A member's density is its leader's: there is nothing to press (the server refuses it too). */
    if (party && !party.isLeader) return true;
    const size = party ? party.seats.length : 1;
    const dn = shownDensity(sc, picks, hunt, size, party);
    const n = dn ? dn.now + Number(t.getAttribute('data-by')) : NaN;
    if (!dn || sc.pending || !(n >= DENSITY_PICK.min && n <= dn.max)) return true;
    sc.msg = '';
    /* Another ground's draft still waiting goes now (each ground keeps its own pick). */
    if (sc.draft && sc.draft.hunt !== hunt) saveDensity(cs, sc, repaint);
    clearTimeout(sc.timer);
    sc.timer = null;
    /* Back on the server's value with nothing in flight: nothing to save. */
    if (n === densityOf(picks, hunt, size).now && !sc.saving) sc.draft = null;
    else {
      sc.draft = { hunt, n };
      sc.timer = setTimeout(() => saveDensity(cs, sc, repaint), DENSITY_SAVE_MS);
    }
    repaint();
    return true;
  }
  if (action === 'pick') { sc.pick = hunt; sc.msg = ''; repaint(); return true; }
  if (action === 'enter' && partyMembershipOf(cs)) {
    sc.pick = hunt;
    if (!partyMembershipOf(cs).isLeader) return true;
    runIntent(sc, repaint, () => afterDensity(cs, sc, repaint, () => startPartyHunt(ctx.account, cs, hunt)), 'Gathering the party for ' + huntName(hunt) + '…',
      () => 'Your party is on its way to ' + huntName(hunt) + '.');
    return true;
  }
  if (action === 'enter') {
    sc.pick = hunt;
    const s = settingsOf(cs);
    const lines = packFor(bagOf(cs));
    /* A town activity never blocks a hunt: the engine settles it first (what it earned is paid), then Enter. */
    runIntent(sc, repaint, () => afterDensity(cs, sc, repaint, () => settleTownActivity(cs).then(() => cs.enterHunt(hunt, lines, s ? s.preset : 0))), 'Setting off for ' + huntName(hunt) + '…', (res) => { sc.enterMsg = 'On the way to ' + huntName(hunt) + '.' + (res && res.belowRange ? ' ' + ABOVE_LEVEL_WORDS : ''); return sc.enterMsg; });
    return true;
  }
  return false;
};
