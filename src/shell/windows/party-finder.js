// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/party-finder.js — FIND A PARTY THAT NEEDS YOUR WEAPON.
//
// The Find a party tab of the Party window (src/shell/windows/party.js). One
// READ, hr_hunt_party_finder: open parties with a free seat and, with the
// weapon filter (Tyler 10-19: the finder filters by weapon type), only those
// with NO member of that weapon type yet. The ground filter is the read's own
// p_hunt (designer plan 2026-10-22, B #3: the Hunts window's "Find a party" opens
// this tab on the picked ground, openFinderOn); until a listing carries its own
// ground (Lane C, plan C #1) the server matches the ground the party last hunted,
// and a row names it. The weapon filter starts on this character's own weapon
// (the server's `role` section), so the common search is one press. A party is private
// (invite only) until its leader lists it: the leader's switch here is ONE
// hr_hunt_party_list and reads the server's `listed`. The rows are the
// server's answer held as window scratch — never the record, and nothing can
// spend them: Join is the server's own check under its lock.
// ════════════════════════════════════════════════════════════════════════
import { WEAPON_ROLES, HUNT_ROLES } from '../../data/hunt-roles.js?v=0.2.71';
import { WEAPON_WORDS } from '../../data/hunt-hud.js?v=0.2.71';
import { finderRows, huntName, partyMembershipOf } from '../../session/party-sections.js?v=0.2.71';
import { roleOf } from '../../session/item-sections.js?v=0.2.71';
import { rows, text, cls, prop, element } from '../../render/paint.js?v=0.2.71';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.71';
import { refusalWords, runIntent } from '../intent-words.js?v=0.2.71';
import { patchRoleGlyph } from '../widgets/bits.js?v=0.2.71';
import { listParty } from '../../session/party-intents.js?v=0.2.71';
import { huntRows } from '../hunt-list.js?v=0.2.71';

const SCRATCH = new WeakMap();

/** The `party` section's `listed` as the server says it (false when unsaid: private fails safe). */
function listedOf(cs) {
  const p = cs && typeof cs.read === 'function' ? cs.read('party') : null;
  return !!p && typeof p === 'object' && p.listed === true;
}

/** The Party window's scratch for one character: the intent in flight, the open tab, the finder's last answer. */
export function partyScratch(cs) {
  let s = SCRATCH.get(cs);
  if (!s) { s = { pending: false, msg: '', found: null, findMsg: '', weapon: undefined, ground: '', tab: null, tabFor: undefined }; SCRATCH.set(cs, s); }
  return s;
}

/** "Needs a bow · Ranger": the weapon filter's words (a party with no member of that weapon yet). The role is left
    out where it already names the weapon ("Needs a shield", never "Melee (shield)" in brackets again);
    tests/party-ui.mjs UI-9 reads them off the select. */
function weaponOption(w) {
  const role = HUNT_ROLES[WEAPON_ROLES[w][0]];
  const word = (WEAPON_WORDS[w] || w).toLowerCase();
  const what = 'Needs ' + (/s$/.test(word) ? '' : 'a ') + word;
  return role.label.toLowerCase().includes(word) ? what : what + ' · ' + role.label;
}

export function finderHtml() {
  const weapons = Object.keys(WEAPON_ROLES).map((w) => '<option value="' + esc(w) + '">' + esc(weaponOption(w)) + '</option>').join('');
  /* The grounds the Hunts window lists (a staged one is not): the finder's ground filter, sent as p_hunt. */
  const grounds = huntRows().map((r) => '<option value="' + esc(r.hunt) + '">' + esc(r.name) + '</option>').join('');
  /* The leader's listing switch (2026-10-29-party-security.sql): a party is private, invite only, until listed. */
  return '<div class="hw-add hw-list-party" hidden><span class="hs-note hw-list-why"></span>'
    + '<button type="button" class="hh-tool" data-hs-act="list-party"></button></div>'
    + '<div class="hw-add hw-find-party">'
    + '<select class="hh-select" data-hs-act="find-ground" aria-label="Ground"><option value="">Any ground</option>' + grounds + '</select>'
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

/* The weapon filter's start: this character's own weapon (the server's `role` section), else any. */
function ownWeapon(cs) {
  const mine = roleOf(cs);
  return mine && mine.weapon && WEAPON_ROLES[mine.weapon] ? mine.weapon : '';
}

export function patchFinder(root, ctx, sc) {
  const sel = root.querySelector('[data-hs-act="find-weapon"]');
  if (sc.weapon === undefined) sc.weapon = ownWeapon(ctx.character);
  if (sel.value !== sc.weapon && ctx.doc.activeElement !== sel) sel.value = sc.weapon;
  const where = root.querySelector('[data-hs-act="find-ground"]');
  if (where.value !== sc.ground && ctx.doc.activeElement !== where) where.value = sc.ground;
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

/* ONE finder read with the scratch's ground and weapon (p_hunt, p_weapon; empty = any). The rows are window
   scratch, never the record; an empty answer says what to do next, a refusal says why. */
function search(cs, sc, repaint) {
  const hunt = sc.ground || null, weapon = sc.weapon || null;
  return runIntent(sc, repaint, async () => {
    const r = await cs.findParties(hunt, weapon);
    sc.found = r.ok ? finderRows(r.body) : null;
    sc.findMsg = !r.ok ? refusalWords(r.error) : sc.found && sc.found.length ? ''
      : (hunt ? 'No open party lists ' + huntName(hunt) + ' right now. ' : 'No open party matches. ') + 'Right-click a player to invite them and start your own.';
    return { ok: true };
  }, 'Searching…', () => '');
}

/**
 * THE FINDER ON ONE GROUND (the Hunts window's "Find a party", designer plan B #3): the Party window opens on
 * its Find tab with the ground set and the weapon filter back on this character's own, and searches once.
 */
export function openFinderOn(ctx, cs, hunt) {
  const sc = partyScratch(cs);
  sc.tab = 'find';
  sc.ground = hunt;
  sc.weapon = ownWeapon(cs);
  sc.msg = '';
  ctx.show('hunt-party');
  return search(cs, sc, () => ctx.refresh('hunt-party'));
}

/** The finder's controls. Returns true when the action was the finder's. */
export function actFinder(ctx, body, action, t, repaint) {
  const cs = ctx.character;
  const sc = partyScratch(cs);
  if (action === 'find') {
    sc.weapon = body.querySelector('[data-hs-act="find-weapon"]').value || '';
    sc.ground = body.querySelector('[data-hs-act="find-ground"]').value || '';
    search(cs, sc, repaint);
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
