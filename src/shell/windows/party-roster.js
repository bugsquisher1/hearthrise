// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/party-roster.js — THE PARTY WINDOW'S "YOUR PARTY" TAB.
//
// Tyler, live v0.2.53: "the party screen is not working on my main account".
// A party formed in town (right-click -> Invite to party) was invisible: the
// Party board is a hunt widget (src/data/hud-widgets.js `when: 'hunt'`) and
// this window held only Invites and Find a party. So while the viewed hero sits
// in a party, the window opens on this tab: every seat (name, level, role from
// the weapon, the leader's crown, away / hunting / in town), the next step
// (the leader picks a hunt in the Hunts window, where "Start with party"
// lives; a member waits for the leader) and Leave party / Disband.
//
// Everything is the SERVER's: the seats are party-panel.js rosterOf over the
// projected `party` (party-sections.js partyMembershipOf), the very roster the
// board shows. Leave and Disband are the board's own leaveOrDisband (one path,
// one intent each), off from the press until the server answered; the tab
// changes only from the re-read envelope.
// ════════════════════════════════════════════════════════════════════════
import { HUNT_ROLES } from '../../data/hunt-roles.js?v=0.2.53';
import { huntName } from '../../session/party-sections.js?v=0.2.53';
import { rosterOf, stateWords, leaveOrDisband } from '../widgets/party-panel.js?v=0.2.53';
import { patchRoleGlyph } from '../widgets/bits.js?v=0.2.53';
import { glyphSvg } from '../launcher.js?v=0.2.53';
import { rows, text, cls, prop, element } from '../../render/paint.js?v=0.2.53';

/** The tab's skeleton (built once with the window). */
export function rosterHtml() {
  return '<ul class="hw-ledger hw-seats"></ul>'
    + '<p class="hs-note hw-party-next"></p>'
    + '<div class="hw-add hw-party-acts">'
    + '<button type="button" class="hw-primary is-on" data-hs-act="party-hunts" hidden>Pick a hunt for the party</button>'
    + '<button type="button" class="hh-tool" data-hs-act="leave">Leave party</button>'
    + '<button type="button" class="hh-tool" data-hs-act="disband" hidden>Disband</button></div>';
}

function seatHtml(glyphs) {
  return '<li class="hw-line hw-seat"><span class="hw-ico hw-roleglyph" aria-hidden="true"></span>'
    + '<span class="hw-line-name"><b><span class="hw-seat-name"></span>'
    + '<span class="hw-seat-lead" title="Party leader" hidden>' + glyphSvg(glyphs, 'uiCrown') + '</span></b><small></small></span>'
    + '<span class="hw-seat-state"></span></li>';
}

/** One seat's second line: "Lv 12 · Melee (shield)" (no weapon worn: "No weapon"). */
function seatFacts(m) {
  const role = m.role && HUNT_ROLES[m.role] ? HUNT_ROLES[m.role].label : 'No weapon';
  return (m.level === null ? '' : 'Lv ' + m.level + ' · ') + role;
}

/** Where a seat is, in words: away (its seat kept), hunting, or in town. */
function seatWhere(m) {
  return stateWords(m) || (m.hunting ? 'Hunting' : 'In town');
}

/** What the party does next, from the server's party (the leader picks the ground; a member waits). */
function nextStep(p, r) {
  if (r.anyHunting) return p.hunt ? 'The party is hunting in ' + huntName(p.hunt) + '.' : 'The party is hunting.';
  if (r.isLeader) return r.members.length > 1 ? 'You lead. Pick a hunt and press Start with party.'
    : 'You are the only one here. Invite someone (right-click a player), or pick a hunt.';
  const lead = r.members.find((m) => m.seat === r.leaderSeat);
  return 'Waiting for ' + (lead ? lead.name : 'the leader') + ' to pick a hunt.';
}

/** Patch the tab from the server's party; `p` partyMembershipOf (null: the tab is hidden by the window). */
export function patchRoster(root, ctx, sc, p) {
  if (!p) return;
  const r = rosterOf(ctx.character);
  rows(root.querySelector('.hw-seats'), r.members, {
    key: (m) => String(m.seat),
    build: () => element(ctx.doc, seatHtml(ctx.glyphs)),
    patch: (li, m) => {
      patchRoleGlyph(li.querySelector('.hw-roleglyph'), m.role, ctx.glyphs);
      text(li.querySelector('.hw-seat-name'), m.name + (m.seat === r.selfSeat ? ' (you)' : ''));
      prop(li.querySelector('.hw-seat-lead'), 'hidden', m.seat !== r.leaderSeat);
      text(li.querySelector('small'), seatFacts(m));
      text(li.querySelector('.hw-seat-state'), seatWhere(m));
      cls(li, 'is-away', m.away);
    },
  });
  text(root.querySelector('.hw-party-next'), nextStep(p, r));
  const hunts = root.querySelector('[data-hs-act="party-hunts"]');
  prop(hunts, 'hidden', !(r.isLeader && !r.anyHunting));
  prop(root.querySelector('[data-hs-act="disband"]'), 'hidden', !r.isLeader);
  for (const b of root.querySelectorAll('.hw-party-acts button')) prop(b, 'disabled', sc.pending);
}

/** The tab's controls. True when the action was the tab's. */
export function actRoster(ctx, action, repaint, sc) {
  if (action === 'party-hunts') { ctx.show('hunts'); return true; }
  return leaveOrDisband(ctx, ctx.character, sc, repaint, action);
}
