// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/party.js — THE PARTY: MAKE ONE, FILL IT, HUNT TOGETHER.
//
// Week plan step 16. A party is up to the server's `max` characters, any role
// mix; the role is the equipped weapon's (src/data/hunt-roles.js roleForWeapon,
// read in src/session/party-sections.js). Two faces, from the server's `party`
// section alone:
//   IN A PARTY   the seats (role glyph, name, weapon, the leader's crown, who is
//                hunting), Kick (the leader, by seat), Leave, Start the party
//                hunt (the leader), invite by name, and "Bring" for each of this
//                account's own open characters not yet in a party (that
//                character's own join intent: no invite needed)
//   NOT IN ONE   invites waiting for this character (accept / decline), Make a
//                party on a hunt ground, and the party finder (src/shell/windows/
//                party-finder.js) filtered by hunt and by a weapon type the party
//                has no one with yet, defaulting to this character's own weapon
// Every control is one intent, off from the press until the server answered;
// the window changes only from the re-read envelope. Nothing is predicted.
// ════════════════════════════════════════════════════════════════════════
import { HUNT_GROUNDS } from '../../data/hunt-grounds.js?v=0.2.4';
import { HUNT_ROLES } from '../../data/hunt-roles.js?v=0.2.4';
import { WEAPON_WORDS } from '../../data/hunt-hud.js?v=0.2.4';
import { partyMembershipOf, invitesOf, huntName } from '../../session/party-sections.js?v=0.2.4';
import { nameOf } from '../../session/item-sections.js?v=0.2.4';
import { rows, text, cls, prop, element } from '../../render/paint.js?v=0.2.4';
import { markPlayer } from '../context-menu.js?v=0.2.4';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.4';
import { glyphSvg } from '../launcher.js?v=0.2.4';
import { patchRoleGlyph } from '../widgets/bits.js?v=0.2.4';
import { runIntent } from '../intent-words.js?v=0.2.4';
import { finderHtml, patchFinder, actFinder, partyScratch } from './party-finder.js?v=0.2.4';
import { partyNote } from '../hunt-list.js?v=0.2.4';

const nameFor = (cs) => nameOf(cs) || 'Character ' + (cs.slot + 1);

/** One seat's role in words: "Ranger · Bow", or what is missing. */
function seatWords(s) {
  const role = s.role && HUNT_ROLES[s.role];
  if (!s.weapon) return 'No hunt weapon worn';
  return (role ? role.label : 'No role') + ' · ' + (WEAPON_WORDS[s.weapon] || s.weapon);
}

/** The skeleton (built once per opening). */
export function renderParty() {
  const grounds = Object.values(HUNT_GROUNDS).map((g) => '<option value="' + esc(g.hunt) + '">' + esc(huntName(g.hunt)) + '</option>').join('');
  return '<div class="hw-party">'
    + '<section class="hw-party-in">'
    + '<p class="hw-party-head"><b class="hw-party-title"></b><small class="hw-party-sub"></small></p>'
    + '<ol class="hw-seats"></ol>'
    + '<div class="hw-tools"><button type="button" class="hw-primary" data-hs-act="start">Start the party hunt</button>'
    + '<button type="button" class="hh-tool" data-hs-act="leave">Leave the party</button></div>'
    + '<p class="hs-note hw-party-why"></p>'
    + '<h3 class="hw-ledger-head is-on">Invite</h3>'
    + '<div class="hw-add"><input type="text" class="hh-num hw-invite-name" maxlength="40" placeholder="Character name" aria-label="Character to invite" data-hs-act="invite-name">'
    + '<button type="button" class="hh-tool" data-hs-act="invite">Invite</button></div>'
    + '<ul class="hw-ledger hw-bring"></ul></section>'
    + '<section class="hw-party-out">'
    + '<h3 class="hw-ledger-head hw-invites-head">Invites</h3><ul class="hw-ledger hw-invites"></ul>'
    + '<h3 class="hw-ledger-head is-on">Make a party</h3>'
    + '<p class="hs-note">Up to four characters hunt one ground together, any mix of weapons. Loot is split evenly by value.</p>'
    + '<div class="hw-add"><select class="hh-select" data-hs-act="create-hunt" aria-label="Hunt for the new party">' + grounds + '</select>'
    + '<button type="button" class="hw-primary is-on" data-hs-act="create">Make a party</button></div>'
    + '<p class="hs-note hw-create-note"></p>'
    + finderHtml() + '</section>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

function seatRow(ctx) {
  return element(ctx.doc, '<li class="hw-line hw-seat"><span class="hw-ico hw-roleglyph" aria-hidden="true"></span>'
    + '<span class="hw-line-name"><b></b><small></small></span>'
    + '<span class="hw-crown" title="Party leader">' + glyphSvg(ctx.glyphs, 'uiCrown') + '</span>'
    + '<span class="hw-seat-state"></span>'
    + '<button type="button" class="hh-tool hw-kick" data-hs-act="kick">Kick</button></li>');
}

function patchIn(root, ctx, p, sc) {
  text(root.querySelector('.hw-party-title'), 'Party for ' + huntName(p.hunt));
  text(root.querySelector('.hw-party-sub'), p.seats.length + (p.max ? ' of ' + p.max : '') + ' seats taken' + (p.isLeader ? ' · you lead' : ''));
  rows(root.querySelector('.hw-seats'), p.seats, {
    key: (s) => String(s.seat),
    build: () => seatRow(ctx),
    patch: (li, s) => {
      patchRoleGlyph(li.querySelector('.hw-roleglyph'), s.role, ctx.glyphs);
      text(li.querySelector('b'), s.name + (s.seat === p.me ? ' (this character)' : ''));
      text(li.querySelector('small'), seatWords(s));
      cls(li.querySelector('.hw-crown'), 'is-on', s.seat === p.leader);
      text(li.querySelector('.hw-seat-state'), s.hunting ? 'Hunting' : 'Ready');
      cls(li, 'is-self', s.seat === p.me);
      markPlayer(li, s.seat === p.me ? null : { name: s.name });   // the player menu (src/shell/context-menu.js)
      const kick = li.querySelector('.hw-kick');
      kick.setAttribute('data-seat', String(s.seat));
      cls(kick, 'is-on', p.isLeader && s.seat !== p.me);
      prop(kick, 'disabled', sc.pending || s.hunting);
    },
  });
  const start = root.querySelector('[data-hs-act="start"]');
  cls(start, 'is-on', p.isLeader);
  prop(start, 'disabled', sc.pending || p.anyHunting);
  const meHunting = p.seats.some((s) => s.seat === p.me && s.hunting);
  prop(root.querySelector('[data-hs-act="leave"]'), 'disabled', sc.pending || meHunting);
  text(root.querySelector('.hw-party-why'), meHunting ? 'You can leave once this hunt ends.'
    : p.isLeader ? 'Each member goes in with their own saved setup.' : 'The leader starts the hunt.');
  for (const el of root.querySelectorAll('.hw-party-in .hw-add input, .hw-party-in .hw-add button')) prop(el, 'disabled', sc.pending || p.full);
  /* This account's own open characters not in a party yet: one press each, no invite needed. */
  const free = ctx.peers().filter((o) => o !== ctx.character && o.record && !partyMembershipOf(o));
  rows(root.querySelector('.hw-bring'), p.full ? [] : free, {
    key: (o) => String(o.slot),
    build: (o) => element(ctx.doc, '<li class="hw-line"><span class="hw-line-name"><b></b><small>Your character</small></span>'
      + '<button type="button" class="hh-tool" data-hs-act="bring" data-slot="' + o.slot + '">Bring</button></li>'),
    patch: (li, o) => { text(li.querySelector('b'), nameFor(o)); prop(li.querySelector('button'), 'disabled', sc.pending); },
  });
}

function patchOut(root, ctx, sc) {
  const inv = invitesOf(ctx.character);
  cls(root.querySelector('.hw-invites-head'), 'is-on', !!inv && inv.length > 0);
  rows(root.querySelector('.hw-invites'), inv || [], {
    key: (i) => i.id,
    build: (i) => element(ctx.doc, '<li class="hw-line"><span class="hw-line-name"><b></b><small></small></span>'
      + '<button type="button" class="hw-primary is-on" data-hs-act="accept" data-invite="' + esc(i.id) + '">Join</button>'
      + '<button type="button" class="hh-tool" data-hs-act="decline" data-invite="' + esc(i.id) + '">No thanks</button></li>'),
    patch: (li, i) => {
      text(li.querySelector('b'), i.from + ' invites you');
      text(li.querySelector('small'), 'to hunt ' + huntName(i.hunt));
      for (const b of li.querySelectorAll('button')) prop(b, 'disabled', sc.pending);
    },
  });
  prop(root.querySelector('[data-hs-act="create"]'), 'disabled', sc.pending);
  /* The Hunts window's "With a party" names its ground once; the player's own pick wins after that. */
  const ground = root.querySelector('[data-hs-act="create-hunt"]');
  if (sc.hunt && ctx.doc.activeElement !== ground) { ground.value = sc.hunt; sc.hunt = null; }
  /* The picked ground's party rule, from ITS row (Tyler 10-19: the Rat King's note under Coppercap Warrens). */
  const note = root.querySelector('.hw-create-note');
  const said = partyNote(ground.value);
  text(note, said);
  prop(note, 'hidden', !said);
  patchFinder(root, ctx, sc);
}

renderParty.patch = function patchParty(body, ctx) {
  const cs = ctx.character;
  const sc = partyScratch(cs);
  const root = body.querySelector('.hw-party');
  const p = partyMembershipOf(cs);
  cls(root, 'is-in', !!p);
  cls(root, 'is-pending', sc.pending);
  if (p) patchIn(root, ctx, p, sc); else patchOut(root, ctx, sc);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
};

const WORDS_DONE = Object.freeze({ create: 'Party made.', leave: 'You left the party.', kick: 'Removed.', invite: 'Invite sent.',
  accept: 'You joined the party.', decline: 'Invite declined.', start: 'The party is on its way.', bring: 'Joined the party.' });

renderParty.act = function actParty(ctx, body, action, ev, t) {
  /* A ground picked: its party rule shows at once, not on the next display tick. */
  if (ev.type === 'change' && (action === 'create-hunt' || action === 'find-hunt')) { renderParty.patch(body, ctx); return true; }
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  const sc = partyScratch(cs);
  const repaint = () => renderParty.patch(body, ctx);
  const go = (send, busy) => { runIntent(sc, repaint, send, busy, () => WORDS_DONE[action] || ''); return true; };
  switch (action) {
    case 'create': return go(() => cs.createParty(body.querySelector('[data-hs-act="create-hunt"]').value), 'Making the party…');
    case 'leave': return go(() => cs.leaveParty(), 'Leaving…');
    case 'kick': return go(() => cs.kickSeat(Number(t.getAttribute('data-seat'))), 'Removing…');
    case 'start': return go(() => cs.startPartyHunt(), 'Starting the hunt…');
    case 'accept': case 'decline': return go(() => cs.answerInvite(t.getAttribute('data-invite'), action === 'accept'), action === 'accept' ? 'Joining…' : 'Declining…');
    case 'invite': {
      const input = body.querySelector('.hw-invite-name');
      if (input.value.trim().length < 2) return true;
      return go(() => cs.inviteByName(input.value).then((r) => { if (r.ok) input.value = ''; return r; }), 'Sending the invite…');
    }
    case 'bring': {
      const p = partyMembershipOf(cs);
      const peer = ctx.peers().find((o) => String(o.slot) === t.getAttribute('data-slot'));
      if (!p || !peer) return true;
      return go(() => peer.joinParty(p.id), 'Bringing ' + nameFor(peer) + '…');
    }
    default: return actFinder(ctx, body, action, t, repaint);
  }
};
