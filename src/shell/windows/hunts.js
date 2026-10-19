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
// its name and theme, its combat-level band against the character's own level,
// who may come, and how crowded it is. The picked line carries the window's one
// primary, Enter, and says what the hunt will carry from the bag (the player's
// remembered restock targets). "With a party" opens the Party window on that
// ground. Enter is ONE hr_hunt_enter; the server checks the band, the stamina
// and the stock, and the hunt shows only from the re-read envelope. A hunt above
// the character's level says so ("expect losses"); the floor is a warning, and
// only the server refuses (Tyler 10-18: 15 or more levels under it).
// ════════════════════════════════════════════════════════════════════════
import { combatLevel } from '../../core/xp.js?v=0.2.5';
import { huntOf, settingsOf, partyOf } from '../../session/hunt-sections.js?v=0.2.5';
import { bagOf, rulesOf, skillsOf } from '../../session/item-sections.js?v=0.2.5';
import { huntName } from '../../session/party-sections.js?v=0.2.5';
import { rows, text, cls, prop, attr, element } from '../../render/paint.js?v=0.2.5';
import { whole } from '../../render/format.js?v=0.2.5';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.5';
import { itemName } from '../widgets/bits.js?v=0.2.5';
import { runIntent } from '../intent-words.js?v=0.2.5';
import { huntRows, densityWords, bandWords, rangeWords, groupWords, recommendedHunt, heroWords, packFor, ABOVE_LEVEL_WORDS } from '../hunt-list.js?v=0.2.5';
import { partyScratch } from './party-finder.js?v=0.2.5';

const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { pick: null, pending: false, msg: '' }; SCRATCH.set(cs, s); } return s; };

/** Pick a hunt in this character's Hunts window (the World's door does, before it opens the window). */
export function pickHunt(cs, hunt) {
  if (!cs) return;
  const sc = scratchOf(cs);
  if (huntRows().some((r) => r.hunt === hunt)) { sc.pick = hunt; sc.msg = ''; }
}

/* The server's combat skills as the shared curve reads them (xp by skill), or null. */
function levelOf(cs) {
  const sk = skillsOf(cs);
  if (!sk) return null;
  return combatLevel(Object.fromEntries(Object.entries(sk).map(([id, r]) => [id, r.xp])));
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
    + '<small class="hw-hunt-pack"></small></span>'
    + '<span class="hw-hunt-do"><button type="button" class="hh-tool hw-hunt-enter" data-hs-act="enter" data-hunt="' + esc(r.hunt) + '">Enter</button>'
    + '<button type="button" class="hh-tool" data-hs-act="party" data-hunt="' + esc(r.hunt) + '">With a party</button></span></li>';
}

renderHunts.patch = function patchHunts(body, ctx) {
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const root = body.querySelector('.hw-hunts');
  const list = huntRows();
  const h = huntOf(cs);
  const now = h && !h.ended ? h : null;
  const level = levelOf(cs);
  const party = partyOf(cs);
  const size = party ? party.members.length : 1;
  if (!sc.pick && list.length) { const rec = recommendedHunt(level, size, list); sc.pick = rec ? rec.hunt : list[0].hunt; }
  const pack = packFor(bagOf(cs), rulesOf(cs));
  /* "On the way to …" is the intent's answer, not the hunt's state: once the server's hunt section
     says the hero is hunting (or the hunt is over), the line below speaks for it (Tyler 10-19). */
  if (sc.msg && sc.msg === sc.enterMsg && (now || (h && h.ended))) { sc.msg = ''; sc.enterMsg = null; }
  const nowEl = root.querySelector('.hw-hunts-now');
  text(nowEl, now ? 'You are hunting in ' + huntName(now.huntId) + '. Leave that hunt to go somewhere else.' : 'Pick a hunt, then Enter. Your hero walks there and fights on its own.');
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
      const enter = li.querySelector('.hw-hunt-enter');
      cls(enter, 'hw-primary', on);
      cls(enter, 'is-on', on);
      cls(enter, 'hh-tool', !on);
      for (const b of li.querySelectorAll('button')) prop(b, 'disabled', sc.pending || !!now);
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
  if (action === 'pick') { sc.pick = hunt; sc.msg = ''; repaint(); return true; }
  if (action === 'enter') {
    sc.pick = hunt;
    const s = settingsOf(cs);
    const lines = packFor(bagOf(cs), rulesOf(cs));
    runIntent(sc, repaint, () => cs.enterHunt(hunt, lines, s ? s.preset : 0), 'Setting off for ' + huntName(hunt) + '…', (res) => { sc.enterMsg = 'On the way to ' + huntName(hunt) + '.' + (res && res.belowRange ? ' ' + ABOVE_LEVEL_WORDS : ''); return sc.enterMsg; });
    return true;
  }
  if (action === 'party') {
    partyScratch(cs).hunt = hunt;
    if (ctx.wm.isOpen('hunt-party')) ctx.refresh('hunt-party'); else ctx.wm.open('hunt-party');
    return true;
  }
  return false;
};
