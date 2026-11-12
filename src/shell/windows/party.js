// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/party.js — THE PARTY WINDOW: INVITES AND THE FINDER.
//
// PARTY_SPEC.md §2 (2026-10-19), one way to do each thing:
//   invite      right-click a player (or one of your own characters' strip
//               tabs) -> Invite to party; the first invite makes the party
//   the roster  the Party panel (src/shell/widgets/party-panel.js) in a hunt, with Leave /
//               Kick / Disband; in town, this window's Your party tab (same roster, same Leave)
//   start       the leader's "Enter with party" in the Hunts window, where the
//               ground is chosen
// So this window holds what has no other home, as three tabs:
//   Your party    shown only while THIS character sits in a party, and the tab
//                 it opens on then (./party-roster.js; Tyler live v0.2.53: a party
//                 formed in town had no screen, the board being a hunt widget):
//                 every seat, the next step, Leave party / Disband
//   Invites       invites waiting for THIS character (the server's
//                 `party_invites`): Join / Decline (the toast offers the same
//                 two answers anywhere in the game)
//   Find a party  the finder (./party-finder.js), filtered by the weapon a
//                 party lacks, defaulting to this character's own
// Every control is one intent, off from the press until the server answered;
// the window changes only from the re-read envelope. Nothing is predicted.
// ════════════════════════════════════════════════════════════════════════
import { invitesOf, partyMembershipOf, huntName } from '../../session/party-sections.js?v=0.2.124';
import { rows, text, cls, prop, attr, element } from '../../render/paint.js?v=0.2.124';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.124';
import { runIntent } from '../intent-words.js?v=0.2.124';
import { finderHtml, patchFinder, actFinder, partyScratch } from './party-finder.js?v=0.2.124';
import { rosterHtml, patchRoster, actRoster } from './party-roster.js?v=0.2.124';
import { t } from '../../render/player-text.js?v=0.2.124';

const TABS = Object.freeze([['party', 'Your party'], ['invites', 'Invites'], ['find', 'Find a party']]);

/** The skeleton (built once per opening). */
export function renderParty() {
  return '<div class="hw-party">'
    + '<div class="hw-tabs" role="tablist">' + TABS.map(([id, l]) => '<button type="button" role="tab" class="hw-tab" data-hs-act="party-tab" data-tab="' + id + '" aria-selected="false">' + esc(l) + '</button>').join('') + '</div>'
    /* "Only players you invite can join" needs a way to invite (panel 2026-11-01): a name, one intent, its answer in words. */
    + '<div class="hw-add hw-invite-name"><input type="text" class="hh-num hw-invite-in" maxlength="24" placeholder="A player’s name" aria-label="A player’s name">'
    + '<button type="button" class="hh-tool" data-hs-act="invite-name">Invite</button></div>'
    + '<p class="hs-note hw-invite-how"></p>'
    + '<section class="hw-pane" data-pane="party">' + rosterHtml() + '</section>'
    + '<section class="hw-pane" data-pane="invites">'
    + '<ul class="hw-ledger hw-invites"></ul>'
    + '<p class="hh-empty hw-invites-none"></p></section>'
    + '<section class="hw-pane" data-pane="find">' + finderHtml() + '</section>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

/** One invite in words: "Mira invites you" / "to hunt Millrace Sewer" (or no ground yet). */
function inviteWords(i) {
  return { who: i.from + ' invites you', where: i.hunt ? 'Their party last hunted ' + huntName(i.hunt) + '.' : 'To their party.' };
}

function patchInvites(root, ctx, sc, inv) {
  rows(root.querySelector('.hw-invites'), inv, {
    key: (i) => i.id,
    build: (i) => element(ctx.doc, '<li class="hw-line"><span class="hw-line-name"><b></b><small></small></span>'
      + '<button type="button" class="hw-primary is-on" data-hs-act="accept" data-invite="' + esc(i.id) + '">Join</button>'
      + '<button type="button" class="hh-tool" data-hs-act="decline" data-invite="' + esc(i.id) + '">' + t('controls.decline') + '</button></li>'),
    patch: (li, i) => {
      const w = inviteWords(i);
      text(li.querySelector('b'), w.who);
      text(li.querySelector('small'), w.where);
      for (const b of li.querySelectorAll('button')) prop(b, 'disabled', sc.pending);
    },
  });
  const none = root.querySelector('.hw-invites-none');
  cls(none, 'is-on', !inv.length);
  text(none, partyMembershipOf(ctx.character) ? 'No invites. You are in a party, and its members show on the Your party tab.'
    : 'No invites right now. ' + (ctx.isPhone && ctx.isPhone() ? 'Type a name above, or hold a player’s name' : 'Type a name above, or right-click a player') + ' and choose Invite to party to start your own.');
}

renderParty.patch = function patchParty(body, ctx) {
  const cs = ctx.character;
  const sc = partyScratch(cs);
  const root = body.querySelector('.hw-party');
  const inv = invitesOf(cs) || [];
  const mine = partyMembershipOf(cs);
  /* A pick lasts while the party it was made in does: joining or leaving one opens the window afresh. */
  const partyKey = mine ? mine.id : '';
  if (sc.tabFor !== partyKey) { if (sc.tabFor !== undefined) sc.tab = null; sc.tabFor = partyKey; }
  /* The window's answer was about the party as it stood ("Invite sent to Bram." after Wren joined Bram, friends' panel 2026-11-01): a seat coming or going retires it. */
  const seatsKey = partyKey + ':' + (mine ? mine.seats.length : 0);
  if (sc.msgSeats !== seatsKey) { if (sc.msgSeats !== undefined && !sc.pending) sc.msg = ''; sc.msgSeats = seatsKey; }
  /* The tab the player picked (Your party only while in one); until then Your party while in one, Invites when
     one is waiting, else the finder. */
  const picked = sc.tab === 'party' && !mine ? null : sc.tab;
  const tab = picked || (mine ? 'party' : inv.length ? 'invites' : 'find');
  for (const b of root.querySelectorAll('.hw-tab')) {
    attr(b, 'aria-selected', String(b.getAttribute('data-tab') === tab));
    if (b.getAttribute('data-tab') === 'party') prop(b, 'hidden', !mine);
    if (b.getAttribute('data-tab') === 'invites') text(b, inv.length ? 'Invites (' + inv.length + ')' : 'Invites');
  }
  for (const p of root.querySelectorAll('.hw-pane')) cls(p, 'is-on', p.getAttribute('data-pane') === tab);
  /* On every tab (party panel 11-03: it opened on the finder and never said how to invite; the how-to was a tab away). The Invites tab says the rest in its own empty line. */
  cls(root.querySelector('.hw-invite-name'), 'is-on', true);
  text(root.querySelector('.hw-invite-how'), tab === 'find' ? (ctx.isPhone && ctx.isPhone() ? 'Type a name to invite them, or hold a player’s name' : 'Type a name to invite them, or right-click a player') + ' and choose Invite to party.' : '');
  prop(root.querySelector('[data-hs-act="invite-name"]'), 'disabled', sc.pending);
  cls(root, 'is-pending', sc.pending);
  patchRoster(root, ctx, sc, mine);
  patchInvites(root, ctx, sc, inv);
  patchFinder(root, ctx, sc);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
};

renderParty.act = function actParty(ctx, body, action, ev, el) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  const sc = partyScratch(cs);
  const repaint = () => renderParty.patch(body, ctx);
  if (action === 'party-tab') { sc.tab = el.getAttribute('data-tab'); sc.msg = ''; repaint(); return true; }
  if (action === 'invite-name') {
    const box = body.querySelector('.hw-invite-in');
    const name = box.value.trim();
    if (name.length < 2) { sc.msg = 'Type the name of the player to invite.'; repaint(); return true; }
    runIntent(sc, repaint, () => cs.inviteByName(name).then((r) => (r.ok ? r : { ...r, verb: 'party_invite' })), 'Inviting…', () => { box.value = ''; return 'Invite sent to ' + name + '.'; });
    return true;
  }
  if (action === 'accept' || action === 'decline') {
    const yes = action === 'accept';
    runIntent(sc, repaint, () => cs.answerInvite(el.getAttribute('data-invite'), yes).then((r) => (r.ok ? r : { ...r, verb: 'party_join' })), yes ? 'Joining…' : 'Declining…',
      () => (yes ? 'You joined the party.' : 'Invite declined.'));
    return true;
  }
  return actRoster(ctx, action, repaint, sc) || actFinder(ctx, body, action, el, repaint);
};
