// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/party-roster.js — THE PARTY WINDOW'S "YOUR PARTY" TAB.
//
// Tyler, live v0.2.53: "the party screen is not working on my main account".
// A party formed in town (right-click -> Invite to party) was invisible: the
// Party board is a hunt widget (src/data/hud-widgets.js `when: 'hunt'`) and
// this window held only Invites and Find a party. So while the viewed hero sits
// in a party, the window opens on this tab: every seat (name, level, role from
// the weapon, the leader's crown, away / hunting / in town), the next step
// (the leader picks a hunt in the Hunts window, where "Enter with party"
// lives; a member waits for the leader) and Leave party / Disband.
//
// Everything is the SERVER's: the seats are party-panel.js rosterOf over the
// projected `party` (party-sections.js partyMembershipOf), the very roster the
// board shows. Leave and Disband are the board's own leaveOrDisband (one path,
// one intent each), off from the press until the server answered; the tab
// changes only from the re-read envelope.
// THE LEADER (designer D-2 section 2.2, 1051-company-start.sql): a party of the account's own heroes is led by the hero the engine sends in
// front (ROLE_ORDER), worked out at every Start; "Lead" on a seat pins that hero (hr_party_lead_set) and "Let the front lead" unpins it, in
// town only, off until the server answers. The words under the seats are the ruling's: "{Name} leads. {Name} walks in front and picks the
// hunt for the party."
// ════════════════════════════════════════════════════════════════════════
import { HUNT_ROLES, roleForWeapon } from '../../data/hunt-roles.js';
import { HUNT_GROUNDS } from '../../data/hunt-grounds.js';
import { PARTY_CLASSES, partyClassXp, partyVsAlone } from '../../data/party-class-xp.js';
import { DEFAULT_TIER, TIER_NAME, tiersOf } from '../../data/hunt-tiers.js';
import { recommendation } from '../hunt-list.js';
import { huntName } from '../../session/party-sections.js';
import { rosterOf, stateWords, leaveOrDisband, disbandWord } from '../widgets/party-panel.js';
import { patchRoleGlyph } from '../widgets/bits.js';
import { glyphSvg } from '../launcher.js';
import { rows, text, cls, prop, attr, element } from '../../render/paint.js';
import { t } from '../../render/player-text.js';
import { partyMembershipOf } from '../../session/party-sections.js';
import { companyPlanOf } from '../../session/company-sections.js';
import { setPartyLead } from '../../session/company-intents.js';
import { runIntent } from '../intent-words.js';

/** The tab's skeleton (built once with the window). */
export function rosterHtml() {
  return '<ul class="hw-ledger hw-seats"></ul>'
    + '<p class="hs-note hw-party-next"></p>'
    + '<p class="hs-note hw-party-lead" hidden></p><button type="button" class="hh-tool hw-lead-unpin" data-hs-act="lead-unpin" hidden>' + t('party.lead_unpin') + '</button>'
    + '<p class="hs-note hw-party-class" hidden></p>'
    + '<div class="hw-add hw-party-acts">'
    + '<button type="button" class="hw-primary is-on" data-hs-act="party-hunts" hidden>' + t('controls.pick_hunt') + '</button>'
    + '<button type="button" class="hh-tool" data-hs-act="leave">Leave party</button>'
    + '<button type="button" class="hh-tool" data-hs-act="disband" hidden>Disband</button></div>';
}

function seatHtml(glyphs) {
  return '<li class="hw-line hw-seat"><span class="hw-ico hw-roleglyph" aria-hidden="true"></span>'
    + '<span class="hw-line-name"><b><span class="hw-seat-name"></span>'
    + '<span class="hw-seat-lead" title="Party leader" hidden>' + glyphSvg(glyphs, 'uiCrown') + '</span></b><small></small></span>'
    + '<span class="hw-seat-state"></span><button type="button" class="hh-tool hw-seat-leadpin" data-hs-act="lead-pin" hidden>' + t('party.lead_pin') + '</button></li>';
}

/** One seat's second line: "Lv 12 · Melee (shield)" (no weapon worn: "No weapon"). */
function seatFacts(m) {
  const role = m.role && HUNT_ROLES[m.role] ? HUNT_ROLES[m.role].label : 'No weapon';
  return (m.level === null ? '' : 'Lv ' + m.level + ', ') + role;
}

/** Where a seat is, in words: away (its seat kept), hunting, or in town. */
function seatWhere(m) {
  return stateWords(m) || (m.hunting ? 'Hunting' : 'In town');
}

/** What the party does next, from the server's party (the leader picks the ground; a member waits). */
function nextStep(p, r) {
  if (r.anyHunting) return p.hunt ? 'The party is hunting in ' + huntName(p.hunt) + '.' : 'The party is hunting.';
  if (r.isLeader) return r.members.length > 1 ? 'Leader: pick a hunt, then Enter with party'
    : 'Party of one: invite a player or pick a hunt';
  const lead = r.members.find((m) => m.seat === r.leaderSeat);
  return 'Waiting for ' + (lead ? lead.name : 'the leader') + ' to pick a hunt.';
}

const CLASS_NAMES = Object.values(PARTY_CLASSES).map((c) => c.label);
const CLASS_WORDS = CLASS_NAMES.slice(0, -1).join(', ') + ' and ' + CLASS_NAMES[CLASS_NAMES.length - 1];

/**
 * THE CLASS LINE (Tyler 2026-10-31; designer's words), the classes read off the ONE table the engine pays by and the answer off its measured row (src/data/party-class-xp.js
 * over the seats' server roles; a seat with no weapon fights as the engine's bare-handed Melee). It names the ground, since this
 * window holds no ground of its own, and the tier the leader picked there when it is not Normal: each tier has its own measured line
 * (lane/d-party-pace: the Normal line sat on the Glade's Deadly, -20% where the settle paid a four +22-41%). Exported for tests/party-ui.mjs.
 */
export function classXpLine(roles, hunt, tier = DEFAULT_TIER) {
  const ground = Object.values(HUNT_GROUNDS).find((g) => g.hunt === hunt);
  const seats = roles.map((r) => r || roleForWeapon('neutral'));
  const { classes } = partyClassXp(seats);
  /* a tier the ground no longer offers reads Normal, as the Hunts window does (hunts.js tierOf) */
  const at = ground && tiersOf(ground.id).includes(tier) ? tier : DEFAULT_TIER;
  /* The measured answer against hunting alone (designer 2026-11-02), never the table's factor on a share: see PARTY_VS_ALONE. */
  /* Tyler's voice (2026-11-09): a sentence each, no colon joins. Since one pack on Normal for every group (Tyler 2026-11-11) a one-class party loses a lot
     there, so its line says how to fix it (lane/d-party-xp-cells). */
  const vs = partyVsAlone(ground ? ground.id : null, seats, at);
  const place = at === DEFAULT_TIER ? huntName(hunt) : t('party.place_tier', { place: huntName(hunt), tier: TIER_NAME[at] });
  const have = t('party.class_have', { have: classes.length, of: CLASS_NAMES.length }) + '. ';
  if (vs === null) return have + t('party.class_none', { place });
  if (vs === 0) return have + t('party.class_same', { place });
  if (vs > 0) return have + t('party.class_more', { pct: vs, place });
  /* "Mix ... to get more" only where another class can still be held at this size: since the flat party cut (Tyler 2026-11-16) a full mix may
     earn under alone on Normal, and telling it to mix is false. */
  if (classes.length >= Math.min(seats.length, CLASS_NAMES.length)) return have + t('party.class_less_full', { pct: -vs, place });
  return have + t('party.class_less', { pct: -vs, place, classes: CLASS_WORDS });
}

/** The line before a hunt starts, on the party's last ground or the one the Hunts window opens on, at the tier the leader picked there (the party
    section's leader_tiers, no key = Normal); '' for no line. */
export function classLineOf(p, r) {
  if (r.anyHunting || r.members.length < 2) return '';
  const hunt = p.hunt || (recommendation(r.members.map((m) => m.level), r.members.length).row || {}).hunt;
  const tier = hunt && p.tiers && Object.hasOwn(p.tiers, hunt) ? p.tiers[hunt] : DEFAULT_TIER;
  return hunt ? classXpLine(r.members.map((m) => m.role), hunt, tier) : '';
}

/* THE ACCOUNT'S OWN SEATS of this party: seat -> the own hero's slot (each own hero's party section names its own seat). A party with a seat
   not in it seats another account's hero: the company never re-leads it (the server refuses not_own_party). */
function ownSeatsOf(ctx, p) {
  const out = new Map();
  const all = ctx.account && typeof ctx.account.characters === 'function' ? ctx.account.characters() : [ctx.character];
  for (const o of all) { const m = partyMembershipOf(o); if (m && m.id === p.id && Number.isInteger(m.me)) out.set(m.me, o.slot); }
  return out;
}

/** Patch the tab from the server's party; `p` partyMembershipOf (null: the tab is hidden by the window). */
export function patchRoster(root, ctx, sc, p) {
  if (!p) return;
  const r = rosterOf(ctx.character);
  const own = ownSeatsOf(ctx, p);
  const company = own.size === r.members.length && r.members.length > 1;
  const pinned = !!(companyPlanOf(ctx.character) || {}).leadPinned;
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
      const pin = li.querySelector('[data-hs-act="lead-pin"]');
      prop(pin, 'hidden', !company || r.anyHunting || m.seat === r.leaderSeat);
      attr(pin, 'data-slot', own.has(m.seat) ? String(own.get(m.seat)) : null);
      prop(pin, 'disabled', sc.pending);
    },
  });
  text(root.querySelector('.hw-party-next'), nextStep(p, r));
  const lead = r.members.find((m) => m.seat === r.leaderSeat);
  text(root.querySelector('.hw-party-lead'), company && lead ? t('party.lead_words', { name: lead.name }) : '');
  prop(root.querySelector('.hw-party-lead'), 'hidden', !(company && lead));
  const unpin = root.querySelector('[data-hs-act="lead-unpin"]');
  prop(unpin, 'hidden', !company || !pinned || r.anyHunting);
  prop(unpin, 'disabled', sc.pending);
  const classLine = classLineOf(p, r);
  text(root.querySelector('.hw-party-class'), classLine);
  prop(root.querySelector('.hw-party-class'), 'hidden', !classLine);
  const hunts = root.querySelector('[data-hs-act="party-hunts"]');
  prop(hunts, 'hidden', !(r.isLeader && !r.anyHunting));
  prop(root.querySelector('[data-hs-act="disband"]'), 'hidden', !r.isLeader);
  text(root.querySelector('[data-hs-act="disband"]'), disbandWord(sc));
  for (const b of root.querySelectorAll('.hw-party-acts button')) prop(b, 'disabled', sc.pending);
}

/** The tab's controls. True when the action was the tab's. */
export function actRoster(ctx, action, repaint, sc, el) {
  if (action === 'party-hunts') { ctx.show('hunts'); return true; }
  if (action === 'lead-pin' || action === 'lead-unpin') {
    const slot = action === 'lead-pin' && el ? Number(el.getAttribute('data-slot')) : null;
    if (action === 'lead-pin' && !Number.isInteger(slot)) return true;
    runIntent(sc, repaint, () => setPartyLead(ctx.account, ctx.character, slot), t('heroes.sending'),
      () => (slot === null ? t('party.lead_unpinned') : t('party.lead_pinned')), ctx.character);
    return true;
  }
  return leaveOrDisband(ctx, ctx.character, sc, repaint, action);
}
