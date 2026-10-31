// ════════════════════════════════════════════════════════════════════════
// src/shell/launcher.js — THE ICON ROW AT THE TOP RIGHT (WORLD_SHELL.md §1).
//
// Icons only. Hover or focus shows a tooltip with the label and the shortcut;
// the open window's icon is lit gold with an underline (aria-pressed mirrors it).
// The row is drawn from the window catalogue, so it lists only windows that
// exist, and it is the `launchers` HUD widget, which can never be hidden.
// ════════════════════════════════════════════════════════════════════════
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.75';
import { pointerCardOf } from '../session/tutorial-sections.js?v=0.2.75';
import { HUNT_TUTORIAL, AUTO_KINDS, coachIcon } from '../data/hunt-tutorial.js?v=0.2.75';
import { tallyOf } from '../session/tally-sections.js?v=0.2.75';
import { bagOf, rulesOf, shopOf, equipmentOf, nameOf, skillsOf } from '../session/item-sections.js?v=0.2.75';
import { levelOf } from '../session/character-sections.js?v=0.2.75';
import { huntOf } from '../session/hunt-sections.js?v=0.2.75';
import { COACH_READ_MAX } from '../session/residue.js?v=0.2.75';
import { lootSale } from './bag-model.js?v=0.2.75';
import { upgradeOf } from './widgets/upgrade-line.js?v=0.2.75';
import { revealInWindow, glyphSvg } from './widgets/bits.js?v=0.2.75';
import { draftOf, serverBar } from './bar-draft.js?v=0.2.75';

/** The chip text for a row's shortcut key: 'b' -> 'B', 'enter' -> 'Enter'. */
export function keyLabel(key) {
  const k = String(key || '');
  return k.length === 1 ? k.toUpperCase() : k.charAt(0).toUpperCase() + k.slice(1);
}

/** An inline SVG for a window.HR_GLYPHS key, or '' when the glyph is missing (src/shell/widgets/bits.js). */
export { glyphSvg };

/**
 * THE TUTORIAL POINTER (Tyler 10-18: "I'm confused right away"). One line under the icon row: the
 * hunt tutorial card the character is on (src/data/hunt-tutorial.js), read from what the server
 * projects (src/session/tutorial-sections.js), so it advances as the server reports each step done
 * and is the same after a reload. Once the guide is done it names the next goal instead ("What next":
 * the next ground and the weapon skill's next unlock, designer 2026-10-22), so a hero is never left
 * with nothing to aim at. It is drawn only while NO window is open (it would cover the
 * window's title; the card a window's control answers shows INSIDE that window instead, src/shell/shell.js coach),
 * and not here during a hunt: the hunt top bar draws it under itself
 * (src/shell/widgets/hunt-topbar.js), so it never covers Leave hunt or the analyzer. Display only.
 */
export function pointerFor(ctx) {
  const cs = ctx.character;
  if (!cs || ctx.wm.openIds().length > 0) return '';
  const card = heldCard(ctx);
  return card ? coachHtml(cs, card) : '';
}

/* ── LONG ENOUGH TO READ (designer playtest 2026-10-24: "Your hero fights alone" and "That's a level" were never on
   screen; the first kill lands 3 s in) ── A card the SERVER finishes on its own (AUTO_KINDS: the first kill, a level)
   stays up for its reading time before the next replaces it, and a card of that kind the server passed while an
   earlier one was being read gets its turn too, in order. A card the PLAYER finishes (Enter, Save, Plant) gives way at
   once: they did what it asked. Display scratch per CharacterSession (a reload shows the server's card at once);
   it gates and spends nothing. No clock in the context (a test, a pure render): the server's card as it is. */
const HELD = new WeakMap();
const ORDER = new Map(HUNT_TUTORIAL.map((r, i) => [r.id, i]));
const auto = (r) => !!r && !!r.done && AUTO_KINDS.includes(r.done.kind);

/** How long a card stays up before a later one replaces it: about 4 words a second, 4 to 9 s. */
export function readMs(card) {
  const words = String(card.title + ' ' + card.text).split(/\s+/).filter(Boolean).length;
  return Math.max(4000, Math.min(9000, 1500 + words * 250));
}

/* ── THE SHELL'S FACTS (the lane 1 / lane 2 interface, src/session/tutorial-sections.js header) ──
   What only the shell knows, computed with the SAME function its control uses, so a card and its button never
   disagree: the reads (residue `coach.read`), the account's heroes (the roster the server last read plus the open
   CharacterSessions, which are fresher), the slots owned and the play-at-once limit (the server's, never a fallback),
   what Sell all loot would sell (bag-model.js lootSale) and what Equip upgrades would put on (upgrade-line.js). A
   field the shell cannot know is null, and the card that needs it is passed by (never a wall). Kept per character
   while the records it read are the same objects (every envelope and residue write replaces a record). */
const FACTS = new WeakMap();
/** The cards this character has read (Got it, or on screen long enough), or null when this client cannot record one. */
export function coachReadOf(cs) {
  if (!cs || !cs.record || typeof cs.setResidue !== 'function') return null;
  const r = cs.record.residue && cs.record.residue.coach;
  return new Set(r && Array.isArray(r.read) ? r.read : []);
}
const huntOpenOf = (c) => { const h = huntOf(c); return !!h && !h.ended; };
/** The shell's facts for `cs` (pointerCardOf's second argument). `account`: the AccountSession, or null. */
export function coachFactsOf(cs, account) {
  if (!cs) return {};
  const open = account && typeof account.characters === 'function' ? account.characters() : [];
  const memo = FACTS.get(cs);
  if (memo && cs.record && memo.record === cs.record && memo.account === account && memo.open.length === open.length
    && memo.open.every((x, i) => x.cs === open[i] && x.record === open[i].record)) return memo.sh;
  const rows = account && typeof account.lastRoster === 'function' ? account.lastRoster() : null;
  let roster = null;
  if (rows || open.length) {
    const by = new Map();
    for (const r of rows || []) if (r.exists) by.set(r.slot, { slot: r.slot, level: r.level, name: r.name, open: false, hunting: null });
    for (const c of open) {
      const lv = levelOf(c);
      by.set(c.slot, { slot: c.slot, level: lv ? lv.level : (by.get(c.slot) || {}).level ?? null, name: nameOf(c) || (by.get(c.slot) || {}).name || null,
        open: true, hunting: huntOpenOf(c) });
    }
    roster = Array.from(by.values()).sort((a, b) => a.slot - b.slot);
  }
  const bag = bagOf(cs), shop = shopOf(cs), eq = equipmentOf(cs);
  const sh = {
    read: coachReadOf(cs),
    roster,
    slotsOwned: rows ? rows.length : null,
    playLimit: account && typeof account.statedLimit === 'function' ? account.statedLimit() : null,
    sellable: bag && shop ? lootSale(bag, rulesOf(cs), shop, skillsOf(cs)).lines.length : null,
    upgrades: bag && eq ? upgradeOf(cs).picks.map((p) => p.id) : null,
  };
  if (cs.record) FACTS.set(cs, { record: cs.record, account, open: open.map((c) => ({ cs: c, record: c.record })), sh });
  return sh;
}

/** Record `card` as read for this character (residue `coach.read`, display state): its Got it press, or a card the
    player only has to read once it has been on screen its reading time. True when written. */
export function markCoachRead(cs, card) {
  const read = coachReadOf(cs);
  if (!read || !card || read.has(card.id)) return false;
  const r = (cs.record.residue && cs.record.residue.coach) || {};
  return cs.setResidue('coach', Object.assign({}, r, { read: Array.from(read).concat(card.id).slice(-COACH_READ_MAX) }));
}

/* A card a read finishes (read on sight, or its Got it): the player may close it, which records the read. A card that
   finishes on a server fact cannot be closed by a click (CLAUDE.md §6: its done is the server's); it only folds. */
const readable = (card) => !!card && !!card.done && (card.done.kind === 'read'
  || (card.done.kind === 'any' && card.done.of.some((d) => d.kind === 'read')));
/* A card read on sight: it finishes on its read and has no Got it (you ate, you drank, stamina is low). */
const readOnSight = (card) => readable(card) && !card.gotIt;
const SIGHT = new WeakMap();
/** Whether `card` is on screen in any of `roots`, open OR folded to its tab: a folded read-on-sight card is read on
 *  its tab too, or it would sit there forever (Tyler 2026-10-28, "Your hero just drank" stuck folded). */
export function coachOnScreen(roots, card) {
  return !!card && roots.some((r) => !!r && !!r.querySelector('.hs-pointer[data-tutorial="' + card.id + '"]'));
}
/**
 * The display tick's read-on-sight clock: `onScreen` = the card is on screen now, open or folded (coachOnScreen). A
 * read-on-sight card that has stayed on screen its reading time is recorded read (markCoachRead) and gives way.
 * True when written.
 */
export function noteCoachSight(ctx, card, onScreen) {
  const cs = ctx.character;
  const now = typeof ctx.now === 'function' ? ctx.now() : null;
  if (!cs || now === null || !readOnSight(card) || !onScreen) { if (cs) SIGHT.delete(cs); return false; }
  const s = SIGHT.get(cs);
  if (!s || s.id !== card.id) { SIGHT.set(cs, { id: card.id, since: now }); return false; }
  if (now - s.since < readMs(card)) return false;
  SIGHT.delete(cs);
  return markCoachRead(cs, card);
}

/** The card the coach shows now: the server's (pointerCardOf, with the shell's facts: ctx.account), or one still
 *  being read (above). */
export function heldCard(ctx) {
  const cs = ctx.character;
  const card = pointerCardOf(cs, cs ? coachFactsOf(cs, ctx.account || null) : undefined);
  const now = typeof ctx.now === 'function' ? ctx.now() : null;
  if (!cs || now === null) return card;
  const had = HELD.get(cs);
  const show = (c, since) => { HELD.set(cs, { card: c, since }); return c; };
  if (!card) { HELD.delete(cs); return null; }
  if (!had || had.card.id === card.id) return show(card, had ? had.since : now);
  /* a "What next" goal comes after every card */
  const at = (c) => (ORDER.has(c.id) ? ORDER.get(c.id) : HUNT_TUTORIAL.length);
  const from = at(had.card), to = at(card);
  /* back, or a goal line after a goal line: the server's at once */
  if (to <= from) return show(card, now);
  if (auto(had.card) && now - had.since < readMs(had.card)) return had.card;
  const passed = HUNT_TUTORIAL.slice(from + 1, to).find(auto);
  return passed ? show(passed, now) : show(card, now);
}

/** The coach box for `card` (folded to its title, or open), the same wherever it is drawn. Open, its words are their
 *  own box (.hs-coach-text): on a phone a long card scrolls there, under its title and its dash (shell.css). `inWin`:
 *  drawn inside the window the card points into, where it says its words for there (card.textIn: "Press Enter",
 *  never "Open Hunts" over the open Hunts, board 2026-10-25 #20). */
export function coachHtml(cs, card, inWin) {
  if (inWin && card.textIn) card = Object.assign({}, card, { text: card.textIn });
  const { min, fresh } = coachFoldOf(cs, card);
  /* Close (x): only where a read finishes the card and this client can record it; it records the read. */
  const close = readable(card) && coachReadOf(cs) ? '<button type="button" class="hs-coach-close" data-hs-act="coach-close" aria-label="Close '
    + esc(card.title) + '" title="Close"></button>' : '';
  /* data-coach: what the box shows (the card, folded or not, marked or not); the hunt bar redraws when it changes. */
  const head = '<p class="hs-pointer' + (min ? ' is-min' : '') + (close ? ' has-close' : '') + '" role="note" data-tutorial="' + esc(card.id) + '" data-coach="'
    + esc(card.id + (min ? (fresh ? ':new' : ':min') : '')) + '"' + (card.anchor ? ' data-anchor="' + esc(card.anchor) + '"' : '') + '>';
  if (min) {
    return head + '<button type="button" class="hs-coach-tab" data-hs-act="coach-open" aria-expanded="false" aria-label="'
      + esc(card.title + (fresh ? ', something new' : '') + ': show') + '">' + esc(card.title)
      + (fresh ? '<i class="hs-coach-new" aria-hidden="true"></i>' : '') + '</button>' + close + '</p>';
  }
  /* A card that teaches and asks for nothing finishes on its Got it (residue `coach.read`, markCoachRead); it is
     offered only where this client can record the press, so it is never a button that does nothing. */
  const got = card.gotIt && coachReadOf(cs) ? ' <button type="button" class="hs-coach-got" data-hs-act="coach-got">Got it</button>' : '';
  return head + '<button type="button" class="hs-coach-min" data-hs-act="coach-min" aria-expanded="true" aria-label="Minimize '
    + esc(card.title) + '" title="Minimize"></button>' + close + '<b>' + esc(card.title) + '</b> <span class="hs-coach-text">' + esc(card.text) + '</span>' + got + '</p>';
}

/**
 * THE COACH FOLDS (Tyler 2026-10-24: "need an option to minimize"). The residue `coach` (a display preference,
 * per character: src/session/residue.js) holds { min, seen }: folded, the line is its title alone, a tab the player
 * presses to open it again; `seen` is the card the player last had in front of them, so a NEW card (the next
 * tutorial step, a new goal) marks the folded tab without opening it. Gates and spends nothing.
 */
export function coachFoldOf(cs, card) {
  const r = cs && cs.record && cs.record.residue ? cs.record.residue.coach : null;
  const min = !!r && r.min === true;
  return { min, fresh: min && !!card && r.seen !== card.id };
}

/**
 * The coach as a child of a built-once box (the hunt top bar): redrawn only when what it shows changes (data-coach
 * names the card AND its fold, so a fold, an open or a new card redraws it; a display tick never does).
 */
export function placeCoach(el, html) {
  const have = el.querySelector(':scope > .hs-pointer');
  const key = (/data-coach="([a-z0-9_:]+)"/.exec(html) || [])[1] || null;
  if (have && have.getAttribute('data-coach') !== key) have.remove();
  if (key && !(have && have.getAttribute('data-coach') === key)) el.insertAdjacentHTML('beforeend', html);
}

/** The coach's fold, open, Got it and close presses, from wherever it is drawn (this row, the hunt top bar, a window).
 *  Close records the read of a card a read finishes; any other card it only folds. True when handled. */
export function actCoach(ctx, el, action, ev) {
  if (action !== 'coach-min' && action !== 'coach-open' && action !== 'coach-got' && action !== 'coach-close') return false;
  if (ev.type !== 'click') return true;
  const cs = ctx.character;
  const card = cs && heldCard(ctx);
  if (!card || typeof cs.setResidue !== 'function') return true;
  if (action === 'coach-got') { if (card.gotIt) markCoachRead(cs, card); return true; }
  if (action === 'coach-close') { if (readable(card)) { markCoachRead(cs, card); return true; } action = 'coach-min'; }
  const doc = el.ownerDocument;
  const hadFocus = !!doc && !!doc.activeElement && el.contains(doc.activeElement);
  /* Opening clears the mark: the card the player now sees is the one they have seen. The reads stay. */
  const read = coachReadOf(cs);
  const keep = read && read.size ? { read: Array.from(read) } : {};
  cs.setResidue('coach', Object.assign(action === 'coach-min' ? { min: true, seen: card.id } : { seen: card.id }, keep));
  /* The box is redrawn on the residue change (one repaint per task): keep the keyboard on the coach's control. */
  if (hadFocus) queueMicrotask(() => { const b = el.querySelector('[data-hs-act^="coach-"]'); if (b) b.focus(); });
  return true;
}

/** The `launchers` widget body: one button per window row that has a launcher. The coach's ring is drawn here when
 *  the card's way starts at an icon (src/data/hunt-tutorial.js coachIcon), last of the button's attributes, exactly
 *  as ringCoach (below) would set it, so a repaint never finds this row changed. */
export function renderLaunchers(ctx) {
  const open = new Set(ctx.wm.openIds());
  const ring = ctx.character ? coachIcon(heldCard(ctx), (id) => open.has(id)) : null;
  const buttons = ctx.wm.rows().filter((r) => r.launcher !== false).map((r) => {
    const on = open.has(r.id);
    const key = keyLabel(r.key);
    return '<button type="button" class="hs-launch' + (on ? ' is-open' : '') + '" data-hs-open="' + esc(r.id) + '"'
      + ' aria-pressed="' + on + '" aria-label="' + esc(r.label) + ' (' + esc(key) + ')"'
      + ' data-tip="' + esc(r.label) + '" data-key="' + esc(key) + '"' + (ring === r.id ? ' data-coach-ring=""' : '') + '>'
      + glyphSvg(ctx.glyphs, r.glyph) + '</button>';
  });
  return '<nav class="hs-launchers" aria-label="Windows">' + buttons.join('') + (ctx.hud && ctx.hud.isShown('hunt-topbar') ? '' : pointerFor(ctx)) + '</nav>';
}

/* The row's own controls: the coach's fold and open (the icons are [data-hs-open], the shell's). */
renderLaunchers.act = function actLaunchers(ctx, el, action, ev) { actCoach(ctx, el, action, ev); };

/* ── THE COACH'S GOLD RING (designer playtest 2026-10-24, 5/10 desktop, 4/10 phone: no card rang a real control) ──
   Huntera's quick start (memory `huntera-tutorial-model`, mechanics only) rings the very control the card names.
   ONE control on screen carries `data-coach-ring` (src/styles/shell.css: a pixel gold ring, no glow): the deepest
   step of the card's way that is on screen now, e.g. Hunts' icon -> the Mill Cellar's line -> Enter. The icon row
   draws its own ring (renderLaunchers, coachIcon). A card whose controls live in a window shows inside it
   (src/shell/shell.js, hunt-tutorial.js coachWindow). Display only: gates, spends and stores nothing (CLAUDE.md §6). */
const inWin = (id, q) => '[data-hs-win="' + id + '"] ' + q;

/**
 * THE RING'S WAY: the selectors of the controls `card` names, deepest first (the first one on screen is ringed).
 * `at`: { open(id) the window is open, configuring: the bar slot Configure action has open (or null), weight: the
 * armor weight Tamsin pays in is chosen (the server's), or null when unknown }. Pure. [] = nothing to ring.
 */
export function ringPlan(card, at) {
  if (!card) return [];
  const g = card.ring || {};
  const open = (id) => !!at && typeof at.open === 'function' && at.open(id);
  const icon = coachIcon(card, open);
  if (icon) return ['.hs-launchers [data-hs-open="' + icon + '"]'];
  switch (card.anchor) {
    case 'hunt_picker': {
      const hunt = card.done && card.done.hunt;
      /* Enter while the ground is the picked one and on screen; else its line (a phone shows the list first); on a
         phone showing ANOTHER ground's page, the way back to the list */
      return [inWin('hunts', '.hw-hunt-enter[data-hunt="' + hunt + '"]:not([disabled])'),
        inWin('hunts', '.hw-hunt[data-hunt="' + hunt + '"]'), '[data-hs-win="hunts"]:not(:has(.hw-hunt-enter[data-hunt="' + hunt + '"])) .hw-hd-back'];
    }
    case 'hunt_topbar': return ['[data-hs-widget="hunt-topbar"] [data-hs-act="leave"]:not([disabled])'];
    case 'action_bar': {
      if (!Number.isInteger(card.barSlot)) return [];
      if (!(open('configure-action') && at.configuring === card.barSlot)) return ['[data-hs-widget="action-bar"] .hb-slot[data-slot="' + card.barSlot + '"]'];
      /* Inside Configure action on the card's slot: the control the card names (its hooks: the store rune to pick, the
         HP condition's −) until the player has changed the slot as the words ask (down to the card's goal HP: "press −
         until it reads 50%"), then Save. A card that only teaches rings nothing. */
      const save = inWin('configure-action', '[data-x="save"]:not([disabled])');
      if (at.edited && !(Number.isFinite(card.goal) && Number.isFinite(at.cond0) && at.cond0 > card.goal)) return [save];
      const hooks = card.hooks || [];
      return hooks.length ? hooks.concat(save) : card.gotIt || readOnSight(card) ? [] : [save];
    }
    case 'farm':
      return [inWin('farm', '.hw-seeds .hw-line[data-crop="' + g.crop + '"] [data-hs-act="sow"]:not([disabled])'),
        inWin('farm', '.hw-plot.is-empty [data-hs-act="plant"]')];
    case 'crafting':
      /* its Start (once it runs, nothing: the card moves on with the first XP); the skill in the ledger; from ANOTHER
         skill's page, the way back to the ledger */
      return [inWin('skills-trade', '.hw-work.is-on .hw-work-row[data-id="' + g.work + '"] [data-hs-act="work-go"]:not([disabled])'),
        inWin('skills-trade', '.hw-skill[data-key="' + g.skill + '"]'),
        inWin('skills-trade', '.hw-work.is-on:not(:has(.hw-work-row[data-id="' + g.work + '"])) [data-hs-act="work-back"]')];
    case 'tally':
      return at.weight === false ? [inWin('tally', '.ht-weights')]
        : [inWin('tally', '[data-hs-act="take"][data-task="' + g.task + '"]:not([disabled])')];
    /* Every other anchor rings the card's own hooks (src/data/hunt-tutorial.js, tokens written by cardFor). They are
       written in the order the player meets them, so the deepest that is on screen comes first: the Shop's Sell tab ->
       Sell all loot -> its confirmation's Sell; Characters -> Create hero. */
    default: return (card.hooks || []).slice().reverse();
  }
}

/* On screen: laid out, and not inside anything hidden. */
const shown = (el) => el.getClientRects().length > 0 && !el.closest('[hidden]');

/* The bar slot Configure action has open (src/shell/bar-draft.js), and whether the player has changed it from the
   server's slot (its action or conditions): { configuring, edited }. */
function barEditOf(cs) {
  const d = cs ? draftOf(cs) : null;
  if (!d || !Number.isInteger(d.open) || !d.draft) return { configuring: null, edited: false, cond0: null };
  const bar = serverBar(cs);
  const cur = bar ? bar[d.open] : null;
  const say = (s) => JSON.stringify([s.action || null, s.conditions || [], s.store || null]);
  const c0 = Array.isArray(d.draft.conditions) && d.draft.conditions[0] ? d.draft.conditions[0].value : null;
  return { configuring: d.open, edited: cur ? say(cur) !== say(d.draft) : !!(d.draft.action && d.draft.action.id), cond0: Number.isFinite(c0) ? c0 : null };
}

/**
 * Ring `card`'s control in `roots` (the shell's boxes: the World shell, the screen layer, and the screen around them:
 * the character strip): the first selector of its way that is on screen gets `data-coach-ring`, and every other
 * element loses it. Answers the ringed element or null.
 */
export function ringCoach(ctx, card, roots) {
  const cs = ctx.character;
  const t = cs && tallyOf(cs);
  const bar = barEditOf(cs);
  const plan = ringPlan(card, { open: (id) => ctx.wm.isOpen(id), configuring: bar.configuring, edited: bar.edited, cond0: bar.cond0, weight: t ? !!t.weight : null });
  let target = null;
  for (const q of plan) {
    for (const r of roots) { const el = r.querySelector(q); if (el && shown(el)) { target = el; break; } }
    if (target) break;
  }
  for (const r of roots) for (const el of r.querySelectorAll('[data-coach-ring]')) if (el !== target) el.removeAttribute('data-coach-ring');
  /* a ring that lands below a window's fold (Tamsin's Take under her weight row, a ground low in the list) is scrolled
     into view inside its window, once, as it lands: only the window's own scroll box moves, never the page or the World */
  if (target && !target.hasAttribute('data-coach-ring')) { target.setAttribute('data-coach-ring', ''); revealInWindow(target); }
  return target;
}
