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
// EVERY HERO ON THE ACCOUNT, OPEN OR NOT (Andy 2026-11-09: "refreshed ... only
// showed 3 chars"). A reload reopens the heroes THIS tab had open, so a hero it
// never opened had no tab and seemed gone. The account's other heroes stand in
// the strip too, in slot order, as the roster last read them (AccountSession.
// notOpen: the server's name, Level and doing, the same read the character list
// draws, never a client copy): dimmer, no glyph, no bars, no badge, and a Play press
// (data-app="open-hero", boot.js openHero) that opens the hero beside the others
// and shows it. A `.char-unopened`, never a `.char-tab`: a tab is an OPEN hero,
// which the menu, the coach's rings and the switch all mean by it. At the
// server's play-at-once limit the Play goes, and a press says why in one plain
// line under the strip (say). The heroes boot.js is about to open (o.soon) wait
// off the list, so no Play shows on a hero that opens a moment later.
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
import { summaryOf } from '../shell/command-model.js?v=0.2.127';
import { rows, text, cls, attr, style, element } from '../render/paint.js?v=0.2.127';
import { patchRoleGlyph } from '../shell/widgets/bits.js?v=0.2.127';
import { markPlayer, playerTargetOf } from '../shell/context-menu.js?v=0.2.127';
import { t } from '../render/player-text.js?v=0.2.127';

/** The menu target under a strip event: one of this account's own characters (its tab), or null. */
export function stripTargetOf(e) {
  const tab = e && e.target && e.target.closest ? e.target.closest('.char-tab[data-hs-player]') : null;
  return tab ? playerTargetOf(tab) : null;
}

/* A phone has room for one word beside the icon row at its narrowest (app.css): "Heroes", carrying the alert count, and
   the sheet it opens holds Characters and Sign out (src/shell/windows/characters.js, playtest 2026-10-31). */
const STRIP_HTML = '<ol class="char-tabs"></ol>'
  + '<span class="char-strip-tools">'
  + '<button type="button" class="char-tool is-all" data-app="all" aria-label="All characters" title="Every character on one screen (O)"><span class="char-tool-now"></span><span class="char-tool-wide">All characters</span><span class="char-tool-short">Heroes</span><span class="char-badge char-all-badge"></span></button>'
  + '<button type="button" class="char-tool" data-app="characters">Characters</button>'
  + '<button type="button" class="char-tool" data-app="sign-out">Sign out</button></span>';

const TAB_HTML = '<li class="char-tab-row"><button type="button" class="char-tab" data-app="show">'
  + '<span class="char-roleglyph" aria-hidden="true"></span>'
  + '<span class="char-tab-main"><b class="char-tab-name"></b><small class="char-tab-doing"></small>'
  + '<span class="char-bars" aria-hidden="true"><i class="char-bar is-hp"><i></i></i><i class="char-bar is-mana"><i></i></i><i class="char-bar is-stamina"><i></i></i></span></span>'
  + '<span class="char-badge"></span></button></li>';

/* A hero this tab has not open: who, then Play and what the server last said of it (no glyph, no bars, no badge: nothing live).
   Play leads the second line, so a narrow strip (1280 px: the icon row takes most of it) cuts the status, never the name. */
const UNOPENED_HTML = '<li class="char-tab-row is-unopened"><button type="button" class="char-unopened" data-app="open-hero">'
  + '<span class="char-tab-main"><b class="char-tab-name"></b>'
  + '<span class="char-unopened-line"><b class="char-unopened-play"></b><small class="char-tab-doing"></small></span></span></button></li>';

/* How long the strip's line stays up, and how far it keeps from the screen's edge. */
const NOTE_MS = 7000;
const EDGE_PX = 8;

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

/** A not-open hero's name: the server's, else its slot's number. */
const heroName = (x) => x.name || t('heroes.strip_no_name', { number: x.slot + 1 });

/** What the roster says of a not-open hero: its Level, and what it was doing when that is more than standing idle. The Play
    before it, the missing bars and the dashed foot say it isn't playing here, so no words do (Tyler's voice, 11-11). */
function unopenedLine(x) {
  if (!Number.isInteger(x.level)) return x.doing || '';
  return x.doing ? t('heroes.strip_level_doing', { level: x.level, doing: x.doing }) : t('heroes.strip_level', { level: x.level });
}

/** Why a not-open hero can't play now: as many heroes play as the server allows at once. */
const fullLine = (x, limit) => t('heroes.strip_full', { count: limit, name: heroName(x) });

function patchUnopened(li, x, limit, full) {
  const b = li.querySelector('.char-unopened');
  attr(b, 'data-slot', String(x.slot));
  cls(b, 'is-full', full);
  text(li.querySelector('.char-tab-name'), heroName(x));
  text(li.querySelector('.char-tab-doing'), unopenedLine(x));
  text(li.querySelector('.char-unopened-play'), full ? '' : t('controls.play'));
  attr(b, 'title', full ? fullLine(x, limit) : t('heroes.strip_play_title', { name: heroName(x) }));
}

/**
 * @param {HTMLElement} host        the strip's box (a <nav>)
 * @param {object} o
 * @param {object} o.account        the AccountSession
 * @param {object} [o.alerts]       the account's alert centre
 * @param {() => object} [o.glyphs]
 * @param {() => Set<number>} [o.soon]  the slots boot.js opens next: off the not-open list until it has tried them
 */
export function mountCharacterStrip(host, o) {
  const doc = host.ownerDocument;
  const win = doc.defaultView;
  host.className = 'char-strip';
  host.setAttribute('aria-label', 'Characters');
  host.innerHTML = STRIP_HTML;
  const list = host.querySelector('.char-tabs');
  const allBadge = host.querySelector('.char-all-badge');
  /* On the page, not in the strip: a phone's strip is a size container, which would hold a fixed line inside it (app.css). */
  const note = element(doc, '<p class="char-strip-note" role="status" aria-live="polite"></p>');
  doc.body.appendChild(note);
  let noteTimer = 0;
  const glyphs = () => (o.glyphs ? o.glyphs() : {});

  /* The launcher row (a screen widget of the shell) sits over the strip's right end: keep clear of it. */
  function clearLaunchers() {
    const row = doc.querySelector('.hs-launchers');
    style(host, 'padding-right', row ? row.offsetWidth + 8 + 'px' : null);
  }

  function patch() {
    clearLaunchers();
    const viewed = o.account.viewed;
    const all = o.account.characters().map((cs) => summaryOf(cs, o.alerts));
    const soon = o.soon ? o.soon() : null;
    const unopened = o.account.notOpen().filter((x) => !(soon && soon.has(x.slot)));
    const limit = o.account.limit();
    const full = all.length >= limit;
    const tabs = all.map((x) => ({ x, open: true })).concat(unopened.map((x) => ({ x, open: false }))).sort((a, b) => a.x.slot - b.x.slot);
    rows(list, tabs, {
      key: (r) => (r.open ? String(r.x.slot) : 'unopened-' + r.x.slot),
      build: (r) => element(doc, r.open ? TAB_HTML : UNOPENED_HTML),
      patch: (li, r) => (r.open ? patchTab(li, r.x, viewed, glyphs(), o.account.userId) : patchUnopened(li, r.x, limit, full)),
    });
    const shown = all.find((x) => x.slot === viewed);
    text(host.querySelector('.char-tool-now'), shown ? shown.name : '');
    const waiting = all.reduce((n, x) => n + x.alerts, 0);
    text(allBadge, waiting ? String(waiting) : '');
    cls(allBadge, 'is-on', waiting > 0);
  }

  /* ONE PLAIN LINE under the strip, at the hero pressed: why that press opened nothing (boot.js openHero). Display only. */
  function say(slot, words) {
    win.clearTimeout(noteTimer);
    text(note, words);
    cls(note, 'is-on', true);
    const tab = list.querySelector('.char-unopened[data-slot="' + slot + '"]');
    const at = (tab || host).getBoundingClientRect();
    style(note, 'left', Math.round(Math.max(EDGE_PX, Math.min(win.innerWidth - note.offsetWidth - EDGE_PX, at.left))) + 'px');
    style(note, 'top', Math.round(host.getBoundingClientRect().bottom + 4) + 'px');
    noteTimer = win.setTimeout(() => cls(note, 'is-on', false), NOTE_MS);
  }

  /** A press on a not-open hero opened nothing: 'full' (every seat the server allows is taken) or 'failed' (it did not load). */
  function refused(slot, why) {
    const x = o.account.notOpen().find((h) => h.slot === slot);
    if (x) say(slot, why === 'full' ? fullLine(x, o.account.limit()) : t('heroes.strip_open_failed', { name: heroName(x) }));
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
    refused,
    destroy() { win.clearTimeout(noteTimer); note.remove(); offAccount(); offAlerts(); for (const off of offs.values()) off(); offs.clear(); host.remove(); },
  };
}
