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
// primary, Enter, and says what the hunt will carry from the bag (the player's
// remembered restock targets). Enter is ONE hr_hunt_enter; the server checks the band, the stamina
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
// party's size (hunt-grounds.js densityFor). It shows only the server's value
// (hunt_settings.density, clamped to the ground as the settle clamps it) and a
// press is ONE hr_action_set_options. The server keeps ONE pick per action set
// today, not one per ground, so the line says it carries to the next hunt.
// ════════════════════════════════════════════════════════════════════════
import { huntOf, settingsOf } from '../../session/hunt-sections.js?v=0.2.11';
import { bagOf, rulesOf } from '../../session/item-sections.js?v=0.2.11';
import { levelOf as levelRowOf } from '../../session/character-sections.js?v=0.2.11';
import { huntName, partyMembershipOf } from '../../session/party-sections.js?v=0.2.11';
import { startPartyHunt, settleTownActivity } from '../../session/party-intents.js?v=0.2.11';
import { rows, text, cls, prop, attr, element } from '../../render/paint.js?v=0.2.11';
import { whole } from '../../render/format.js?v=0.2.11';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.11';
import { itemName } from '../widgets/bits.js?v=0.2.11';
import { runIntent } from '../intent-words.js?v=0.2.11';
import { HUNT_GROUNDS, densityFor, DENSITY_PICK } from '../../data/hunt-grounds.js?v=0.2.11';
import { huntRows, densityWords, bandWords, rangeWords, groupWords, recommendedHunt, heroWords, packFor, partyNote, ABOVE_LEVEL_WORDS } from '../hunt-list.js?v=0.2.11';

const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { pick: null, pending: false, msg: '' }; SCRATCH.set(cs, s); } return s; };

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

/* The server's density pick as this ground would spawn it, and the most the ground allows for `size`; null = unknown. */
function densityOf(set, hunt, size) {
  const g = Object.values(HUNT_GROUNDS).find((x) => x.hunt === hunt);
  if (!set || !Number.isInteger(set.density) || !g) return null;
  const max = densityFor(g, size, [DENSITY_PICK.max]);
  return { now: densityFor(g, size, [set.density]), max };
}

function packWords(lines) {
  if (!lines.length) return 'You carry nothing from your bag.';
  return 'You carry ' + lines.map((l) => whole(l.qty) + ' ' + itemName(l.item)).join(', ') + '.';
}

/** The skeleton (built once per opening). */
export function renderHunts() {
  return '<div class="hw-hunts">'
    + '<p class="hs-note hw-hunts-now"></p>'
    + '<ul class="hw-ledger hw-hunt-list" role="listbox" aria-label="Hunts"></ul>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

function lineHtml(r) {
  return '<li class="hw-hunt" role="option" data-hs-act="pick" data-hunt="' + esc(r.hunt) + '" tabindex="-1">'
    + '<span class="hw-hunt-main"><b class="hw-hunt-name">' + esc(r.name) + '</b><small class="hw-hunt-theme">' + esc(r.theme) + '</small>'
    + '<small class="hw-hunt-band"></small><small class="hw-hunt-warn"></small><small class="hw-hunt-facts">' + esc(heroWords(r) + ' · ' + densityWords(r)) + '</small>'
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
  if (!sc.pick && list.length) { const rec = recommendedHunt(level, size, list); sc.pick = rec ? rec.hunt : list[0].hunt; }
  const pack = packFor(bagOf(cs), rulesOf(cs));
  const set = settingsOf(cs);
  /* "On the way to …" is the intent's answer, not the hunt's state: once the server's hunt section
     says the hero is hunting (or the hunt is over), the line below speaks for it (Tyler 10-19). */
  if (sc.msg && sc.msg === sc.enterMsg && (now || (h && h.ended))) { sc.msg = ''; sc.enterMsg = null; }
  const nowEl = root.querySelector('.hw-hunts-now');
  text(nowEl, now ? 'You are hunting in ' + huntName(now.huntId) + '. Leave that hunt to go somewhere else.'
    : follower ? 'Your party leader picks the hunt and starts it. You walk in with everyone, with your own setup.'
    : party ? 'Pick a hunt, then Start with party. Everyone walks in together, each with their own setup.'
    : 'Pick a hunt, then Enter. Your hero walks there and fights on its own.');
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
      const dn = densityOf(set, r.hunt, size);
      cls(li.querySelector('.hw-density'), 'is-on', on && !!dn);
      if (on && dn) {
        text(li.querySelector('.hw-density .hh-step-val'), dn.now ? dn.now + ' each' : 'As built');
        text(li.querySelector('.hw-density-note'), 'How many monsters each spawn holds (up to ' + dn.max + ' for ' + (size === 1 ? 'you alone' : 'a party of ' + size) + '). It stays set for your next hunts.');
        prop(li.querySelector('[data-by="-1"]'), 'disabled', sc.pending || !!now || dn.now <= DENSITY_PICK.min);
        prop(li.querySelector('[data-by="1"]'), 'disabled', sc.pending || !!now || dn.now >= dn.max);
      }
    },
  });
  cls(root, 'is-pending', sc.pending);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
};

renderHunts.act = function actHunts(ctx, body, action, ev, t) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const hunt = t.getAttribute('data-hunt');
  const repaint = () => renderHunts.patch(body, ctx);
  if (action === 'density') {
    const s = settingsOf(cs);
    const party = partyMembershipOf(cs);
    const dn = densityOf(s, hunt, party ? party.seats.length : 1);
    const n = dn ? dn.now + Number(t.getAttribute('data-by')) : NaN;
    if (!dn || n < DENSITY_PICK.min || n > dn.max) return true;
    runIntent(sc, repaint, () => cs.setHuntOptions(s.preset, { density: n }), 'Saving…', () => '');
    return true;
  }
  if (action === 'pick') { sc.pick = hunt; sc.msg = ''; repaint(); return true; }
  if (action === 'enter' && partyMembershipOf(cs)) {
    sc.pick = hunt;
    if (!partyMembershipOf(cs).isLeader) return true;
    runIntent(sc, repaint, () => startPartyHunt(ctx.account, cs, hunt), 'Gathering the party for ' + huntName(hunt) + '…',
      () => 'Your party is on its way to ' + huntName(hunt) + '.');
    return true;
  }
  if (action === 'enter') {
    sc.pick = hunt;
    const s = settingsOf(cs);
    const lines = packFor(bagOf(cs), rulesOf(cs));
    /* A town activity never blocks a hunt: the engine settles it first (what it earned is paid), then Enter. */
    runIntent(sc, repaint, () => settleTownActivity(cs).then(() => cs.enterHunt(hunt, lines, s ? s.preset : 0)), 'Setting off for ' + huntName(hunt) + '…', (res) => { sc.enterMsg = 'On the way to ' + huntName(hunt) + '.' + (res && res.belowRange ? ' ' + ABOVE_LEVEL_WORDS : ''); return sc.enterMsg; });
    return true;
  }
  return false;
};
