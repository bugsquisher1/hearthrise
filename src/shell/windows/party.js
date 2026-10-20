// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/party.js — THE PARTY WINDOW: INVITES AND THE FINDER.
//
// PARTY_SPEC.md §2 (2026-10-19), one way to do each thing:
//   invite      right-click a player (or one of your own characters' strip
//               tabs) -> Invite to party; the first invite makes the party
//   the roster  the Party panel (src/shell/widgets/party-panel.js), always on
//               screen while partied, with Leave / Kick / Disband
//   start       the leader's "Start with party" in the Hunts window, where the
//               ground is chosen
// So this window holds only what has no other home, as two tabs:
//   Invites       invites waiting for THIS character (the server's
//                 `party_invites`): Join / No thanks (the toast offers the same
//                 two answers anywhere in the game)
//   Find a party  the finder (./party-finder.js), filtered by the weapon a
//                 party lacks, defaulting to this character's own
// Every control is one intent, off from the press until the server answered;
// the window changes only from the re-read envelope. Nothing is predicted.
// ════════════════════════════════════════════════════════════════════════
import { invitesOf, partyMembershipOf, huntName } from '../../session/party-sections.js?v=0.2.18';
import { rows, text, cls, prop, attr, element } from '../../render/paint.js?v=0.2.18';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.18';
import { runIntent } from '../intent-words.js?v=0.2.18';
import { finderHtml, patchFinder, actFinder, partyScratch } from './party-finder.js?v=0.2.18';

const TABS = Object.freeze([['invites', 'Invites'], ['find', 'Find a party']]);

/** The skeleton (built once per opening). */
export function renderParty() {
  return '<div class="hw-party">'
    + '<div class="hw-tabs" role="tablist">' + TABS.map(([id, l]) => '<button type="button" role="tab" class="hw-tab" data-hs-act="party-tab" data-tab="' + id + '" aria-selected="false">' + esc(l) + '</button>').join('') + '</div>'
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
      + '<button type="button" class="hh-tool" data-hs-act="decline" data-invite="' + esc(i.id) + '">No thanks</button></li>'),
    patch: (li, i) => {
      const w = inviteWords(i);
      text(li.querySelector('b'), w.who);
      text(li.querySelector('small'), w.where);
      for (const b of li.querySelectorAll('button')) prop(b, 'disabled', sc.pending);
    },
  });
  const none = root.querySelector('.hw-invites-none');
  cls(none, 'is-on', !inv.length);
  text(none, partyMembershipOf(ctx.character) ? 'No invites. You are in a party: its members show in the Party panel.'
    : 'No invites right now. Right-click a player and choose Invite to party to start your own.');
}

renderParty.patch = function patchParty(body, ctx) {
  const cs = ctx.character;
  const sc = partyScratch(cs);
  const root = body.querySelector('.hw-party');
  const inv = invitesOf(cs) || [];
  /* The tab the player picked; until then Invites when one is waiting, else the finder. */
  const tab = sc.tab || (inv.length ? 'invites' : 'find');
  for (const b of root.querySelectorAll('.hw-tab')) {
    attr(b, 'aria-selected', String(b.getAttribute('data-tab') === tab));
    if (b.getAttribute('data-tab') === 'invites') text(b, inv.length ? 'Invites (' + inv.length + ')' : 'Invites');
  }
  for (const p of root.querySelectorAll('.hw-pane')) cls(p, 'is-on', p.getAttribute('data-pane') === tab);
  cls(root, 'is-pending', sc.pending);
  patchInvites(root, ctx, sc, inv);
  patchFinder(root, ctx, sc);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
};

renderParty.act = function actParty(ctx, body, action, ev, t) {
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  const sc = partyScratch(cs);
  const repaint = () => renderParty.patch(body, ctx);
  if (action === 'party-tab') { sc.tab = t.getAttribute('data-tab'); sc.msg = ''; repaint(); return true; }
  if (action === 'accept' || action === 'decline') {
    const yes = action === 'accept';
    runIntent(sc, repaint, () => cs.answerInvite(t.getAttribute('data-invite'), yes), yes ? 'Joining…' : 'Declining…',
      () => (yes ? 'You joined the party.' : 'Invite declined.'));
    return true;
  }
  return actFinder(ctx, body, action, t, repaint);
};
