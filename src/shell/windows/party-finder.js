// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/party-finder.js — FIND A PARTY THAT NEEDS YOUR WEAPON.
//
// The Find a party tab of the Party window (src/shell/windows/party.js). One
// READ, hr_hunt_party_finder: open parties with a free seat and, with the
// weapon filter (Tyler 10-19: the finder filters by weapon type), only those
// with NO member of that weapon type yet. A party picks its ground at Start, so
// there is no ground filter; a row names the ground it last hunted, if any. The
// filter starts on this character's own weapon (the server's `role` section, or
// its party seat), so the common search is one press. A party is private
// (invite only) until its leader lists it: the leader's switch here is ONE
// hr_hunt_party_list and reads the server's `listed`. The rows are the
// server's answer held as window scratch — never the record, and nothing can
// spend them: Join is the server's own check under its lock.
// ════════════════════════════════════════════════════════════════════════
import { WEAPON_ROLES, HUNT_ROLES } from '../../data/hunt-roles.js?v=0.2.8';
import { WEAPON_WORDS } from '../../data/hunt-hud.js?v=0.2.8';
import { finderRows, huntName, partyMembershipOf } from '../../session/party-sections.js?v=0.2.8';
import { roleOf } from '../../session/item-sections.js?v=0.2.8';
import { rows, text, cls, prop, element } from '../../render/paint.js?v=0.2.8';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.8';
import { refusalWords, runIntent } from '../intent-words.js?v=0.2.8';
import { patchRoleGlyph } from '../widgets/bits.js?v=0.2.8';
import { listParty } from '../../session/party-intents.js?v=0.2.8';

const SCRATCH = new WeakMap();

/** The `party` section's `listed` as the server says it (false when unsaid: private fails safe). */
function listedOf(cs) {
  const p = cs && typeof cs.read === 'function' ? cs.read('party') : null;
  return !!p && typeof p === 'object' && p.listed === true;
}

/** The Party window's scratch for one character: the intent in flight, the open tab, the finder's last answer. */
export function partyScratch(cs) {
  let s = SCRATCH.get(cs);
  if (!s) { s = { pending: false, msg: '', found: null, findMsg: '', weapon: undefined, tab: null }; SCRATCH.set(cs, s); }
  return s;
}

/** "No bow yet (Ranger)": the weapon filter's words. */
function weaponOption(w) {
  const role = HUNT_ROLES[WEAPON_ROLES[w][0]];
  return 'No ' + (WEAPON_WORDS[w] || w).toLowerCase() + ' yet (' + role.label + ')';
}

export function finderHtml() {
  const weapons = Object.keys(WEAPON_ROLES).map((w) => '<option value="' + esc(w) + '">' + esc(weaponOption(w)) + '</option>').join('');
  /* The leader's listing switch (2026-10-29-party-security.sql): a party is private, invite only, until listed. */
  return '<div class="hw-add hw-list-party" hidden><span class="hs-note hw-list-why"></span>'
    + '<button type="button" class="hh-tool" data-hs-act="list-party"></button></div>'
    + '<div class="hw-add hw-find-party">'
    + '<select class="hh-select" data-hs-act="find-weapon" aria-label="Parties with"><option value="">Any party</option>' + weapons + '</select>'
    + '<button type="button" class="hh-tool" data-hs-act="find">Search</button></div>'
    + '<p class="hs-note hw-find-why"></p>'
    + '<ul class="hw-ledger hw-found"></ul><p class="hh-empty hw-found-none"></p>';
}

function foundRow(ctx, r) {
  return element(ctx.doc, '<li class="hw-line hw-found-row"><span class="hw-line-name"><b></b><small></small></span>'
    + '<span class="hw-found-roles"></span>'
    + '<button type="button" class="hw-primary is-on" data-hs-act="join" data-party="' + esc(r.id) + '">Join</button></li>');
}

export function patchFinder(root, ctx, sc) {
  const sel = root.querySelector('[data-hs-act="find-weapon"]');
  if (sc.weapon === undefined) {
    const mine = roleOf(ctx.character);
    sc.weapon = mine && mine.weapon && WEAPON_ROLES[mine.weapon] ? mine.weapon : '';
  }
  if (sel.value !== sc.weapon && ctx.doc.activeElement !== sel) sel.value = sc.weapon;
  /* Already partied: Join would be refused `already_in_party`, so the tab says so and Join stays off. */
  const mine = partyMembershipOf(ctx.character);
  const inParty = !!mine;
  /* The leader sees whether its party is listed, the server's `listed`, and flips it with ONE intent. */
  const listed = listedOf(ctx.character);
  const sw = root.querySelector('.hw-list-party');
  prop(sw, 'hidden', !(mine && mine.isLeader));
  text(sw.querySelector('.hw-list-why'), listed ? 'Your party shows in the finder.' : 'Your party is private: only players you invite can join.');
  text(sw.querySelector('button'), listed ? 'Hide from the finder' : 'Show in the finder');
  prop(sw.querySelector('button'), 'disabled', sc.pending);
  const why = root.querySelector('.hw-find-why');
  text(why, inParty ? 'You are in a party. Leave it to join another.' : '');
  prop(why, 'hidden', !inParty);
  rows(root.querySelector('.hw-found'), sc.found || [], {
    key: (r) => r.id,
    build: (r) => foundRow(ctx, r),
    patch: (li, r) => {
      text(li.querySelector('b'), r.hunt ? 'Last hunted ' + huntName(r.hunt) : 'Party of ' + r.seats.length);
      text(li.querySelector('small'), r.seats.map((s) => s.name).join(', ') + ' · ' + r.seats.length + (r.max ? ' of ' + r.max : ''));
      rows(li.querySelector('.hw-found-roles'), r.seats, {
        key: (s) => String(s.seat),
        build: () => element(ctx.doc, '<span class="hw-ico hw-roleglyph" aria-hidden="true"></span>'),
        patch: (el, s) => patchRoleGlyph(el, s.role, ctx.glyphs),
      });
      prop(li.querySelector('button'), 'disabled', sc.pending || inParty);
    },
  });
  const none = root.querySelector('.hw-found-none');
  cls(none, 'is-on', !!sc.findMsg);
  text(none, sc.findMsg);
  prop(root.querySelector('[data-hs-act="find"]'), 'disabled', sc.pending);
}

/** The finder's controls. Returns true when the action was the finder's. */
export function actFinder(ctx, body, action, t, repaint) {
  const cs = ctx.character;
  const sc = partyScratch(cs);
  if (action === 'find') {
    const weapon = body.querySelector('[data-hs-act="find-weapon"]').value || null;
    sc.weapon = weapon || '';
    runIntent(sc, repaint, async () => {
      const r = await cs.findParties(null, weapon);
      sc.found = r.ok ? finderRows(r.body) : null;
      sc.findMsg = r.ok ? (sc.found && sc.found.length ? '' : 'No open party matches. Right-click a player to invite them and start your own.') : refusalWords(r.error);
      return { ok: true };
    }, 'Searching…', () => '');
    return true;
  }
  if (action === 'list-party') {
    const on = !listedOf(cs);
    runIntent(sc, repaint, () => listParty(ctx.account, cs, on), on ? 'Listing your party…' : 'Hiding your party…',
      () => (on ? 'Your party shows in the finder.' : 'Your party is private again.'));
    return true;
  }
  if (action === 'join') {
    runIntent(sc, repaint, () => cs.joinParty(t.getAttribute('data-party')), 'Joining…', () => { sc.found = null; return 'You joined the party.'; });
    return true;
  }
  return false;
}
