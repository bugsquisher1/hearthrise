// ════════════════════════════════════════════════════════════════════════
// src/app/hero-create.js — THE CREATION STEP (Tyler 2026-10-20).
//
// "Creating a hero opens a short step: type a name, pick colours for Head,
// Body, Legs and Feet, see the hero update as you pick. The hero enters town
// only after you confirm." THE WEAPON PICK (GR-24, chapter 08 section 2.1): one
// card for each way to fight (src/data/how-to-play.js STARTER_PICKS), none picked
// for the player, the Club marked "Good first hero"; Enter town waits for a pick.
// No class is locked: every hero owns every practice weapon and the one in hand
// sets how it fights.
// ONE HERO FIRST (Tyler RD-Q6 a, 2026-11-22): this step makes the account's first
// hero. Heroes two to four are recruited in one press at Level 5, in the game
// (src/shell/windows/recruits-pane.js, 1053-recruits.sql), never made here.
//
// The step is a form over the characters card. Nothing it holds is authority:
// Confirm sends ONE intent a hero (AccountSession.create → hr_create_hero) with
// the name, the four dye indices and the set picked; the server checks the name
// (moderation, uniqueness), the colours, the slot and the set, and pays the kit
// once (1038-start-kits.sql). A refusal keeps the step open with its reason.
//
// PURE of globals: the document and the dye colours are handed in. Its classes
// are hero-* (src/styles/app.css), never the chat's hc-*: the two once shared
// the prefix, and the step's .hc-body laid every chat line out (2026-10-24).
// ════════════════════════════════════════════════════════════════════════

import { HOW_YOU_FIGHT, HOW_YOU_FIGHT_LEAD, STARTER_PICKS } from '../data/how-to-play.js';
import { STARTER_SETS } from '../data/start-kit.js';
import { escapeHtml as esc } from '../utils/dom.js';
import { sepHtml } from '../render/format.js';
import { BASE_REGIONS, BASE_DEFAULT_COLORS, DYE_COUNT, REGION_LABEL, HERO_DYES_SHOWN, OUTFIT_ROWS } from '../data/outfits.js';
import { OUTFITS, ROLE_OUTFIT } from '../data/hunt-outfits.js';
import { refusalWords } from '../shell/intent-words.js';
import { outfitArt, outfitMasks, drawOutfit } from '../render/outfit-sprite.js';
import { focusOffTouch } from './sign-in.js';
import { t } from '../render/player-text.js';

/* The preview's whole-number scale: a 64 px sprite at 3 = 192 px; the other outfits at 1. */
export const PREVIEW_SCALE = 3;
/* WHAT A NEW HERO WEARS before a pick: the tank's (hero-look.js, tests/hero-colors.mjs holds the two equal); a pick wears its way's (outfitFor). */
export const START_OUTFIT = ROLE_OUTFIT.tank;
/* The way to fight a starter set plays (HOW_YOU_FIGHT: its role), so the preview wears that way's outfit. Pure. */
const styleOf = (set) => HOW_YOU_FIGHT.find((r) => r.weapons.includes((STARTER_SETS[set] || [])[0])) || null;
export const outfitFor = (set) => { const st = styleOf(set); return (st && ROLE_OUTFIT[st.role]) || START_OUTFIT; };
/* The free outfits drawn small beside it: between them they show every color the first outfit doesn't, so no pick does nothing on screen. */
export const OTHER_OUTFITS = Object.freeze(['berserker', 'ranger', 'sorcerer']);

const NAME_REASON = Object.freeze({
  short: 'heroes.name_short',
  long: 'heroes.name_long',
  charset: 'heroes.name_charset',
  reserved: 'heroes.name_reserved',
  blocked: 'heroes.name_blocked',
});

/** The words a refusal shows, from the one refusal table (src/data/refusal-words.js). Pure. */
export function refusalText(r) {
  if (!r) return t('heroes.create_failed');
  if (r.reason === 'bad_name') return t(NAME_REASON[r.nameReason] || 'heroes.name_blocked');
  if (r.reason === 'bad_set') return t('heroes.bad_set');
  return refusalWords(r.reason);
}

/**
 * The picks as the renderer wants them: per BASE_REGIONS index, the dye token's colour. Pure.
 * @param {{ head: number, body: number, legs: number, feet: number }} colors  the dye indices
 * @param {(token: string) => string} colorOf  a --dye-N token's value, '#rrggbb'
 */
export function previewDyes(colors, colorOf) {
  return BASE_REGIONS.map((g) => String(colorOf('dye-' + colors[g]) || '').trim() || null);
}

/** What the picks change on the outfit a new hero starts in (`set`: the way picked, or none yet), and that the rest show elsewhere. Pure. */
export function startWords(set) {
  const row = OUTFIT_ROWS[set ? outfitFor(set) : START_OUTFIT];
  return t('heroes.create_start', { outfit: row.label });
}

/** One card a way to fight (STARTER_PICKS): its name and mark, what it does and uses, its honest tag and its cost line.
    `picked`: the set pressed, or null (the first hero has none until the player picks). Pure. */
export function pickCardsHtml(picked) {
  return '<div class="hero-ways" role="group" aria-label="' + t('heroes.create_pick') + '">'
    + STARTER_PICKS.map((r) => '<button type="button" class="hero-way" data-hero-set="' + r.set + '" aria-pressed="' + (picked === r.set) + '">'
      + '<b>' + esc(r.name) + '</b>' + (r.mark ? ' <span class="hero-way-mark">' + esc(r.mark) + '</span>' : '')
      + '<span class="hero-way-does">' + esc(r.does) + sepHtml() + esc(r.uses) + '</span>'
      + (r.tag ? '<span class="hero-way-tag">' + esc(r.tag) + '</span>' : '')
      + (r.cost ? '<span class="hero-way-cost">' + esc(r.cost) + '</span>' : '')
      + '</button>').join('') + '</div>';
}

/** The "How this hero fights" column: the rule, then the cards to pick from (the account's hero slots are the Characters screen's line, not
    this step's: art review 2026-11-21 #4, the room is the cards'). Pure. */
export function howYouFightHtml(picked = null) {
  return '<section class="hero-how" aria-labelledby="hero-how-title"><h2 class="hero-how-title hs-sub" id="hero-how-title">' + t('heroes.create_pick') + '</h2>'
    + '<p class="hero-how-lead">' + HOW_YOU_FIGHT_LEAD + '</p>'
    + pickCardsHtml(picked)
    + '<p class="hero-how-more" hidden>' + t('heroes.create_more') + '</p></section>';
}

/* While words wait below the step's fold, its cue says so: a phone's scrollbar shows only during a swipe (phone panel v0.2.83: "nothing shows that it scrolls"). Returns the detach. */
function watchHowMore(card) {
  const body = card.querySelector('.hero-body'), more = body && body.querySelector('.hero-how-more');
  const win = body && body.ownerDocument.defaultView;
  if (!more || !win || !win.ResizeObserver) return () => {};
  const sync = () => {
    const below = body.scrollHeight - body.clientHeight - body.scrollTop - (more.hidden ? 0 : more.offsetHeight);
    const hide = below <= 1;
    if (more.hidden !== hide) more.hidden = hide;
  };
  const ro = new win.ResizeObserver(sync);
  ro.observe(body);
  body.addEventListener('scroll', sync, { passive: true });
  sync();
  return () => { ro.disconnect(); body.removeEventListener('scroll', sync); };
}

/* THE PREVIEW IS THE REAL HERO (newcomer panel 2026-11-01: a picked blue never showed): the outfit a new hero starts in and three others, each in the World's own
   recolour, once the art and the masks have landed. Returns the repaint. Nothing it draws is authority. */
function previewer(card, colors, colorOf, pickedOf) {
  let art = null, masks = null;
  const doc = card.ownerDocument;
  const version = new URL(import.meta.url).searchParams.get('v') || '';
  const big = card.querySelector('.hero-preview');
  const repaint = () => {
    if (!art) return;
    const dyes = previewDyes(colors, colorOf);
    drawOutfit(big, art, OUTFITS[pickedOf() ? outfitFor(pickedOf()) : START_OUTFIT], { dir: 's', scale: PREVIEW_SCALE, dyes, masks });
    for (const c of card.querySelectorAll('[data-hero-outfit]')) drawOutfit(c, art, OUTFITS[c.getAttribute('data-hero-outfit')], { dir: 's', scale: 1, dyes, masks });
  };
  if (big) {
    outfitArt(doc, version).then((a) => { art = a; repaint(); }).catch(() => { /* the canvases stay blank */ });
    outfitMasks(doc, version).then((m) => { masks = m; repaint(); }).catch(() => { /* drawn as it is */ });
  }
  return repaint;
}

/**
 * Render the creation step into `card` (the characters card).
 * @param card  the .auth-card element
 * @param o  the step's hooks: slot; colorOf (token) -> '#rrggbb'; create (name, colors, key, set, slot?) -> Promise of ok, reason, nameReason;
 *            done () (the hero exists: play it); back () (return to the characters); dyes (the strips and preview: outfits.js HERO_DYES_SHOWN)
 * @returns an object with colors () (the picked indices) and destroy ()
 */
export function renderHeroCreate(card, o) {
  const colors = Object.assign({}, BASE_DEFAULT_COLORS);
  /* the first choice a player makes is theirs: no way is picked for them */
  let picked = null;
  const dyes = o.dyes === undefined ? HERO_DYES_SHOWN : o.dyes === true;
  const swatches = (g) => {
    let h = '';
    for (let i = 0; i < DYE_COUNT; i++) {
      h += '<button type="button" class="hero-dye" data-hero-region="' + g + '" data-hero-dye="' + i + '" style="--hero-dye: var(--dye-' + i + ')"'
        + ' aria-label="' + REGION_LABEL[g] + ' color ' + (i + 1) + '" aria-pressed="' + (colors[g] === i) + '"></button>';
    }
    return h;
  };
  card.innerHTML = '<h1 class="auth-title">' + t('heroes.create_title') + '</h1>'
    /* a phone's step shows one thing at a time: its own layout of the same step (Tyler 2026-10-25), not a smaller desktop */
    + (dyes ? '<button type="button" class="hh-tool hero-pick" aria-pressed="false">' + t('controls.pick_colors') + '</button>' : '')
    + '<div class="hero-body">'
    + (dyes ? '<div class="hero-look"><canvas class="hero-preview" width="' + 64 * PREVIEW_SCALE + '" height="' + 64 * PREVIEW_SCALE + '" role="img" aria-label="' + t('heroes.create_preview') + '"></canvas>'
      + '<div class="hero-others">' + OTHER_OUTFITS.map((id) => '<canvas class="hero-other" data-hero-outfit="' + id + '" width="64" height="64" role="img" aria-label="' + t('heroes.create_preview_in', { outfit: OUTFIT_ROWS[id].label }) + '"></canvas>').join('') + '</div>'
      + '<p class="hero-note">' + startWords(picked) + '</p></div>' : '')
    + '<div class="hero-form">'
    + '<label class="auth-field">' + t('heroes.create_name') + '<input type="text" class="hero-name" maxlength="20" autocomplete="off" spellcheck="false" placeholder="' + t('heroes.create_name_hint') + '"></label>'
    + (dyes ? '<div class="hero-colors">' + BASE_REGIONS.map((g) => '<fieldset class="hero-region"><legend>' + REGION_LABEL[g] + '</legend><div class="hero-dyes">' + swatches(g) + '</div></fieldset>').join('') + '</div>' : '')
    + '</div>' + howYouFightHtml(picked) + '</div>'
    + '<p class="auth-message" role="status" aria-live="polite"></p>'
    + '<div class="auth-foot"><button type="button" class="auth-link hero-back">' + t('controls.back') + '</button>'
    + '<button type="button" class="hh-tool is-primary auth-submit is-go hero-confirm">' + t('heroes.create_go') + '</button></div>';
  const input = card.querySelector('.hero-name');
  const msg = card.querySelector('.auth-message');
  const confirm = card.querySelector('.hero-confirm');
  let busy = false;
  let gone = false;
  /* THE PRESS MOVES ON (friends' panel 2026-11-01: on a slow line the hero was made, the button came back live, and the second press said "That name is taken").
     `made`: the server said yes, so no press ever asks again; `tried`: a press whose answer never came keeps its key, so the server replays its answer. */
  let made = false;
  let tried = null;
  const pressWords = confirm.textContent;
  const hold = (words) => { busy = true; confirm.disabled = true; confirm.textContent = words; };
  const release = () => { busy = false; confirm.disabled = false; confirm.textContent = pressWords; };
  async function enter() {
    hold(t('heroes.entering'));
    let went;
    try { went = await o.done(); } catch (e) { went = false; }
    if (gone || went !== false) return;
    release();
    msg.textContent = t('heroes.enter_failed');
  }
  const repaint = previewer(card, colors, o.colorOf, () => picked);
  const paintColors = () => {
    for (const b of card.querySelectorAll('[data-hero-dye]')) b.setAttribute('aria-pressed', String(colors[b.getAttribute('data-hero-region')] === Number(b.getAttribute('data-hero-dye'))));
    repaint();
  };

  async function submit() {
    if (busy || gone) return;
    msg.textContent = '';
    if (made) { enter(); return; }
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (name.length < 3) { msg.textContent = t(NAME_REASON.short); input.focus(); return; }
    /* the first choice a player makes is theirs: nothing is picked for them, and Enter town says so */
    if (!picked) { msg.textContent = t('heroes.pick_needed'); const w = card.querySelector('.hero-way'); if (w) w.focus(); return; }
    hold(t('heroes.creating'));   // stays off until the server answers
    if (!tried || tried.name !== name || tried.set !== picked) tried = { name, set: picked, key: globalThis.crypto.randomUUID() };
    const r = await o.create(name, Object.assign({}, colors), tried.key, picked);
    if (gone) return;
    if (r && (r.ok || r.reason === 'already_created')) { made = true; enter(); return; }
    /* An answered refusal is final for that key; a lost answer keeps it (`answered`: account-session.js create). */
    if (r && r.answered) tried = null;
    release();
    msg.textContent = refusalText(r);
  }

  const onClick = (e) => {
    const sw = e.target.closest('[data-hero-dye]');
    if (sw) {
      const g = sw.getAttribute('data-hero-region');
      const i = Number(sw.getAttribute('data-hero-dye'));
      if (!BASE_REGIONS.includes(g) || !Number.isInteger(i)) return;
      colors[g] = i;
      paintColors();
      return;
    }
    const way = e.target.closest('[data-hero-set]');
    if (way) {
      const set = way.getAttribute('data-hero-set');
      if (!STARTER_SETS[set] || made) return;
      picked = set;
      for (const b of card.querySelectorAll('[data-hero-set]')) b.setAttribute('aria-pressed', String(b === way));
      const note = card.querySelector('.hero-note');
      if (note) note.textContent = startWords(picked);
      repaint();
      return;
    }
    const pick = e.target.closest('.hero-pick');
    if (pick) {
      const on = card.classList.toggle('is-picking');
      pick.setAttribute('aria-pressed', String(on));
      pick.textContent = on ? t('heroes.create_pick') : t('controls.pick_colors');
      return;
    }
    if (e.target.closest('.hero-confirm')) submit();
    else if (e.target.closest('.hero-back')) o.back();
  };
  const onKey = (e) => { if (e.key === 'Enter' && e.target === input) submit(); };
  card.addEventListener('click', onClick);
  card.addEventListener('keydown', onKey);
  focusOffTouch(input);
  const unwatchHow = watchHowMore(card);
  return {
    colors: () => Object.assign({}, colors),
    picked: () => picked,
    destroy() { gone = true; unwatchHow(); card.removeEventListener('click', onClick); card.removeEventListener('keydown', onKey); },
  };
}
