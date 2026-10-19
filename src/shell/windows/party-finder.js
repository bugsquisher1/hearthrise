// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/party-finder.js — FIND A PARTY THAT NEEDS YOUR WEAPON.
//
// The finder half of the Party window (src/shell/windows/party.js). One READ,
// hr_hunt_party_finder: open parties with a free seat, on one hunt or any, and
// with a weapon filter, only those with NO member of that weapon type yet. The
// filter starts on this character's own weapon (the server's `role` section, or
// its party seat), so the common search is one press. The rows are the server's
// answer held as window scratch — never the record, and nothing can spend them:
// Join is the server's own check under its lock.
// ════════════════════════════════════════════════════════════════════════
import { HUNT_GROUNDS, MIN_PARTY_NOTE } from '../../data/hunt-grounds.js?v=0.2.3';
import { WEAPON_ROLES, HUNT_ROLES } from '../../data/hunt-roles.js?v=0.2.3';
import { WEAPON_WORDS } from '../../data/hunt-hud.js?v=0.2.3';
import { finderRows, huntName } from '../../session/party-sections.js?v=0.2.3';
import { roleOf } from '../../session/item-sections.js?v=0.2.3';
import { rows, text, cls, prop, element } from '../../render/paint.js?v=0.2.3';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.3';
import { refusalWords, runIntent } from '../intent-words.js?v=0.2.3';
import { patchRoleGlyph } from '../widgets/bits.js?v=0.2.3';

const SCRATCH = new WeakMap();

/**
 * The Party window's scratch for one character: the intent in flight, the
 * finder's last answer, and `hunt`, a ground another window asked "Make a
 * party" to start on (applied once, then the player's own pick wins).
 */
export function partyScratch(cs) {
  let s = SCRATCH.get(cs);
  if (!s) { s = { pending: false, msg: '', found: null, findMsg: '', weapon: undefined, hunt: null }; SCRATCH.set(cs, s); }
  return s;
}

/** "Needs a bow (Ranger)": the weapon filter's words. */
function weaponOption(w) {
  const role = HUNT_ROLES[WEAPON_ROLES[w][0]];
  return 'No ' + (WEAPON_WORDS[w] || w).toLowerCase() + ' yet (' + role.label + ')';
}

export function finderHtml() {
  const grounds = Object.values(HUNT_GROUNDS).map((g) => '<option value="' + esc(g.hunt) + '">' + esc(huntName(g.hunt)) + '</option>').join('');
  const weapons = Object.keys(WEAPON_ROLES).map((w) => '<option value="' + esc(w) + '">' + esc(weaponOption(w)) + '</option>').join('');
  return '<h3 class="hw-ledger-head is-on">Find a party</h3>'
    + '<div class="hw-add hw-find-party"><select class="hh-select" data-hs-act="find-hunt" aria-label="Hunt"><option value="">Any hunt</option>' + grounds + '</select>'
    + '<select class="hh-select" data-hs-act="find-weapon" aria-label="Parties with"><option value="">Any party</option>' + weapons + '</select>'
    + '<button type="button" class="hh-tool" data-hs-act="find">Search</button></div>'
    /* A ground with a party-only pocket (minParty: the Rat King) says so, from its data row. */
    + Object.values(HUNT_GROUNDS).filter((g) => g.pockets.some((p) => p.minParty)).map((g) => '<p class="hh-note">' + esc(MIN_PARTY_NOTE) + '</p>').join('')
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
  rows(root.querySelector('.hw-found'), sc.found || [], {
    key: (r) => r.id,
    build: (r) => foundRow(ctx, r),
    patch: (li, r) => {
      text(li.querySelector('b'), huntName(r.hunt));
      text(li.querySelector('small'), r.seats.map((s) => s.name).join(', ') + ' · ' + r.seats.length + (r.max ? ' of ' + r.max : ''));
      rows(li.querySelector('.hw-found-roles'), r.seats, {
        key: (s) => String(s.seat),
        build: () => element(ctx.doc, '<span class="hw-ico hw-roleglyph" aria-hidden="true"></span>'),
        patch: (el, s) => patchRoleGlyph(el, s.role, ctx.glyphs),
      });
      prop(li.querySelector('button'), 'disabled', sc.pending);
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
    const hunt = body.querySelector('[data-hs-act="find-hunt"]').value || null;
    const weapon = body.querySelector('[data-hs-act="find-weapon"]').value || null;
    sc.weapon = weapon || '';
    runIntent(sc, repaint, async () => {
      const r = await cs.findParties(hunt, weapon);
      sc.found = r.ok ? finderRows(r.body) : null;
      sc.findMsg = r.ok ? (sc.found && sc.found.length ? '' : 'No open party matches. Make one and others can find it.') : refusalWords(r.error);
      return { ok: true };
    }, 'Searching…', () => '');
    return true;
  }
  if (action === 'join') {
    runIntent(sc, repaint, () => cs.joinParty(t.getAttribute('data-party')), 'Joining…', () => { sc.found = null; return 'You joined the party.'; });
    return true;
  }
  return false;
}
