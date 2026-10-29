// ════════════════════════════════════════════════════════════════════════
// src/app/character-strip.js — THE CHARACTER STRIP (week plan 16, QoL 3).
//
// One tab per open character, up to the server's concurrent limit: its role
// glyph (from the weapon), name, HP / mana / stamina as thin bars, what it is
// doing (hunting where, in town), and a badge for its waiting alerts. A press
// switches the VIEWED character (AccountSession.view): only the screen moves,
// the others keep playing on the server and keep their records and channels.
// "All characters" opens the command centre (src/shell/windows/characters.js).
//
// A RIGHT-CLICK (or long press) on a tab opens the one player menu (src/shell/
// context-menu.js, attached by boot.js to the viewed character's shell): the
// tab names this account's own character by the account id and its slot, so
// the party provider (src/shell/menu-providers.js) offers "Invite to party"
// (that character joins the viewed one's party at once, no accept step,
// PARTY_SPEC §1.2) and "Leave party" when it sits in one. Nothing here sends.
//
// Built once when the game screen opens; every tab is a keyed row patched in
// place (src/render/paint.js) on any character's change, a switch, or an
// alert. Every number is the server's (src/shell/command-model.js).
// ════════════════════════════════════════════════════════════════════════
import { summaryOf } from '../shell/command-model.js?v=0.2.65';
import { rows, text, cls, attr, style, element } from '../render/paint.js?v=0.2.65';
import { patchRoleGlyph } from '../shell/widgets/bits.js?v=0.2.65';
import { markPlayer, playerTargetOf } from '../shell/context-menu.js?v=0.2.65';

/** The menu target under a strip event: one of this account's own characters (its tab), or null. */
export function stripTargetOf(e) {
  const tab = e && e.target && e.target.closest ? e.target.closest('.char-tab[data-hs-player]') : null;
  return tab ? playerTargetOf(tab) : null;
}

const STRIP_HTML = '<ol class="char-tabs"></ol>'
  + '<span class="char-strip-tools">'
  + '<button type="button" class="char-tool" data-app="all" title="Every character on one screen (O)">All characters</button>'
  + '<button type="button" class="char-tool" data-app="characters">Characters</button>'
  + '<button type="button" class="char-tool" data-app="sign-out">Sign out</button></span>';

const TAB_HTML = '<li class="char-tab-row"><button type="button" class="char-tab" data-app="show">'
  + '<span class="char-roleglyph" aria-hidden="true"></span>'
  + '<span class="char-tab-main"><b class="char-tab-name"></b><small class="char-tab-doing"></small>'
  + '<span class="char-bars" aria-hidden="true"><i class="char-bar is-hp"><i></i></i><i class="char-bar is-mana"><i></i></i><i class="char-bar is-stamina"><i></i></i></span></span>'
  + '<span class="char-badge"></span></button></li>';

const fill = (cur, max) => (Number.isFinite(cur) && Number.isFinite(max) && max > 0 ? Math.round(Math.max(0, Math.min(1, cur / max)) * 1000) / 10 + '%' : '0%');

function patchTab(li, x, viewed, glyphs, uid) {
  const b = li.querySelector('.char-tab');
  attr(b, 'data-slot', String(x.slot));
  markPlayer(b, uid ? { id: uid, name: x.name, slot: x.slot } : null);
  attr(b, 'aria-pressed', String(x.slot === viewed));
  cls(b, 'is-shown', x.slot === viewed);
  cls(b, 'is-hunting', x.doing.kind === 'hunting');
  patchRoleGlyph(li.querySelector('.char-roleglyph'), x.role, glyphs);
  text(li.querySelector('.char-tab-name'), x.name);
  text(li.querySelector('.char-tab-doing'), x.doing.text);
  const v = x.vitals;
  style(li.querySelector('.is-hp > i'), 'width', fill(v.hp, v.hpMax));
  style(li.querySelector('.is-mana > i'), 'width', fill(v.mana, v.manaMax));
  style(li.querySelector('.is-stamina > i'), 'width', fill(v.staminaMs, v.staminaCapMs));
  const badge = li.querySelector('.char-badge');
  text(badge, x.alerts ? String(x.alerts) : '');
  cls(badge, 'is-on', x.alerts > 0);
  attr(b, 'aria-label', x.name + ', ' + x.doing.text + (x.alerts ? ', ' + x.alerts + (x.alerts === 1 ? ' alert' : ' alerts') : ''));
}

/**
 * @param {HTMLElement} host        the strip's box (a <nav>)
 * @param {object} o
 * @param {object} o.account        the AccountSession
 * @param {object} [o.alerts]       the account's alert centre
 * @param {() => object} [o.glyphs]
 */
export function mountCharacterStrip(host, o) {
  const doc = host.ownerDocument;
  host.className = 'char-strip';
  host.setAttribute('aria-label', 'Characters');
  host.innerHTML = STRIP_HTML;
  const list = host.querySelector('.char-tabs');
  const glyphs = () => (o.glyphs ? o.glyphs() : {});

  /* The launcher row (a screen widget of the shell) sits over the strip's right end: keep clear of it. */
  function clearLaunchers() {
    const row = doc.querySelector('.hs-launchers');
    style(host, 'padding-right', row ? row.offsetWidth + 8 + 'px' : null);
  }

  function patch() {
    clearLaunchers();
    const viewed = o.account.viewed;
    rows(list, o.account.characters().map((cs) => summaryOf(cs, o.alerts)), {
      key: (x) => String(x.slot),
      build: () => element(doc, TAB_HTML),
      patch: (li, x) => patchTab(li, x, viewed, glyphs(), o.account.userId),
    });
  }

  const offs = new Map();
  function track() {
    const open = new Set(o.account.characters().map((cs) => cs.slot));
    for (const [slot, off] of offs) if (!open.has(slot)) { off(); offs.delete(slot); }
    for (const cs of o.account.characters()) if (!offs.has(cs.slot)) offs.set(cs.slot, cs.subscribe(() => patch()));
  }
  const offAccount = o.account.subscribe(() => { track(); patch(); });
  const offAlerts = o.alerts ? o.alerts.subscribe(() => patch()) : () => {};
  track();
  patch();

  return {
    patch,
    destroy() { offAccount(); offAlerts(); for (const off of offs.values()) off(); offs.clear(); host.remove(); },
  };
}
