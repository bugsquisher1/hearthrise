// ════════════════════════════════════════════════════════════════════════
// src/app/hero-create.js — THE CREATION STEP (Tyler 2026-10-20).
//
// "Creating a hero opens a short step: type a name, pick colours for Head,
// Body, Legs and Feet, see the hero update as you pick. The hero enters town
// only after you confirm." No role pick: the role is the weapon's, and the step
// SAYS so where a newcomer looks for a class (Tyler 2026-10-22: explain the
// combat styles and how they are chosen): a "How you fight" column from
// src/data/how-to-play.js HOW_YOU_FIGHT (desktop; the phone sheet keeps the
// lead line, and the whole list is in Settings > Help).
//
// The step is a form over the characters card. Nothing it holds is authority:
// Confirm sends ONE intent (AccountSession.create → hr_create_hero) with the
// name and the four dye indices; the server checks the name (moderation,
// uniqueness), the colours and the slot, and the hero enters the world only on
// its yes. A refusal keeps the step open with the server's reason.
//
// PURE of globals: the document and the dye colours are handed in. Its classes
// are hero-* (src/styles/app.css), never the chat's hc-*: the two once shared
// the prefix, and the step's .hc-body laid every chat line out (2026-10-24).
// ════════════════════════════════════════════════════════════════════════

import { HOW_YOU_FIGHT, HOW_YOU_FIGHT_LEAD, HOW_YOU_FIGHT_SLOTS } from '../data/how-to-play.js?v=0.2.124';
import { BASE_REGIONS, BASE_DEFAULT_COLORS, DYE_COUNT, REGION_LABEL, HERO_DYES_SHOWN, OUTFIT_ROWS } from '../data/outfits.js?v=0.2.124';
import { OUTFITS, ROLE_OUTFIT } from '../data/hunt-outfits.js?v=0.2.124';
import { refusalWords } from '../shell/intent-words.js?v=0.2.124';
import { outfitArt, outfitMasks, drawOutfit } from '../render/outfit-sprite.js?v=0.2.124';
import { focusOffTouch } from './sign-in.js?v=0.2.124';
import { t } from '../render/player-text.js?v=0.2.124';

/* The preview's whole-number scale: a 64 px sprite at 3 = 192 px; the other outfits at 1. */
export const PREVIEW_SCALE = 3;
/* WHAT A NEW HERO WEARS: the start kit's sword and shield make it the tank, and the tank wears this (hero-look.js, tests/hero-colors.mjs holds the two equal). */
export const START_OUTFIT = ROLE_OUTFIT.tank;
/* The free outfits drawn small beside it: between them they show every color the first outfit doesn't, so no pick does nothing on screen. */
export const OTHER_OUTFITS = Object.freeze(['berserker', 'ranger', 'sorcerer']);

const NAME_REASON = Object.freeze({
  short: 'A name needs at least 3 letters.',
  long: 'A name can have at most 20 letters.',
  charset: 'Use letters, numbers, spaces, hyphens or apostrophes.',
  reserved: 'That name is reserved. Try another.',
  blocked: 'That name is not allowed. Try another.',
});

/** The sentence a refusal shows, from the one refusal table (src/data/refusal-words.js). Pure. */
export function refusalText(r) {
  if (!r) return 'The hero could not be made. Try again in a minute.';
  if (r.reason === 'bad_name') return NAME_REASON[r.nameReason] || 'That name is not allowed. Try another.';
  return refusalWords(r.reason);
}

/**
 * The picks as the renderer wants them: per BASE_REGIONS index, the dye token's colour. Pure.
 * @param colors  { head, body, legs, feet } dye indices
 * @param colorOf (tokenName) -> '#rrggbb'  (a --dye-N token's value)
 */
export function previewDyes(colors, colorOf) {
  return BASE_REGIONS.map((g) => String(colorOf('dye-' + colors[g]) || '').trim() || null);
}

/** What the picks change on the outfit a new hero starts in, and that the rest show elsewhere. Pure. */
export function startWords() {
  const row = OUTFIT_ROWS[START_OUTFIT];
  return 'You start in the ' + row.label + ': your colors change its ' + row.regions.map((g) => row.parts[g].toLowerCase()).join(' and ')
    + '. The other outfits show the rest. Your colors stay with you on every outfit.';
}

/** The "How you fight" column: the rule, then one line per way to fight. Pure. */
export function howYouFightHtml() {
  return '<section class="hero-how" aria-labelledby="hero-how-title"><h2 class="hero-how-title hs-sub" id="hero-how-title">How you fight</h2>'
    + '<p class="hero-how-lead">' + HOW_YOU_FIGHT_LEAD + ' <span class="hero-how-slots">' + HOW_YOU_FIGHT_SLOTS + '</span></p>'
    + '<ul class="hero-how-list">'
    + HOW_YOU_FIGHT.map((r) => '<li data-style="' + r.id + '"><b>' + r.name + '</b> ' + r.does + ' <span class="hero-how-uses">' + r.uses + '</span></li>').join('')
    + '</ul><p class="hero-how-more" hidden>More below</p></section>';
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
function previewer(card, colors, colorOf) {
  let art = null, masks = null;
  const doc = card.ownerDocument;
  const version = new URL(import.meta.url).searchParams.get('v') || '';
  const big = card.querySelector('.hero-preview');
  const repaint = () => {
    if (!art) return;
    const dyes = previewDyes(colors, colorOf);
    drawOutfit(big, art, OUTFITS[START_OUTFIT], { dir: 's', scale: PREVIEW_SCALE, dyes, masks });
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
 * @param o { slot, colorOf (token) -> '#rrggbb', create (name, colors) -> Promise<{ ok, reason, nameReason }>,
 *            done () (the hero exists: play it), back () (return to the characters), dyes (the strips and preview: outfits.js HERO_DYES_SHOWN) }
 * @returns { colors () the picked indices, destroy () }
 */
export function renderHeroCreate(card, o) {
  const colors = Object.assign({}, BASE_DEFAULT_COLORS);
  const dyes = o.dyes === undefined ? HERO_DYES_SHOWN : o.dyes === true;
  const swatches = (g) => {
    let h = '';
    for (let i = 0; i < DYE_COUNT; i++) {
      h += '<button type="button" class="hero-dye" data-hero-region="' + g + '" data-hero-dye="' + i + '" style="--hero-dye: var(--dye-' + i + ')"'
        + ' aria-label="' + REGION_LABEL[g] + ' color ' + (i + 1) + '" aria-pressed="' + (colors[g] === i) + '"></button>';
    }
    return h;
  };
  card.innerHTML = '<h1 class="auth-title">Create your hero</h1>'
    /* a phone's step shows one thing at a time: its own layout of the same step (Tyler 2026-10-25), not a smaller desktop */
    + (dyes ? '<button type="button" class="hh-tool hero-pick" aria-pressed="false">' + t('controls.pick_colors') + '</button>' : '')
    + '<div class="hero-body">'
    + (dyes ? '<div class="hero-look"><canvas class="hero-preview" width="' + 64 * PREVIEW_SCALE + '" height="' + 64 * PREVIEW_SCALE + '" role="img" aria-label="Your hero"></canvas>'
      + '<div class="hero-others">' + OTHER_OUTFITS.map((id) => '<canvas class="hero-other" data-hero-outfit="' + id + '" width="64" height="64" role="img" aria-label="Your hero in the ' + OUTFIT_ROWS[id].label + '"></canvas>').join('') + '</div>'
      + '<p class="hero-note">' + startWords() + '</p></div>' : '')
    + '<div class="hero-form">'
    + '<label class="auth-field">Name<input type="text" class="hero-name" maxlength="20" autocomplete="off" spellcheck="false" placeholder="3 to 20 letters"></label>'
    + (dyes ? '<div class="hero-colors">' + BASE_REGIONS.map((g) => '<fieldset class="hero-region"><legend>' + REGION_LABEL[g] + '</legend><div class="hero-dyes">' + swatches(g) + '</div></fieldset>').join('') + '</div>' : '')
    + '</div>' + howYouFightHtml() + '</div>'
    + '<p class="auth-message" role="status" aria-live="polite"></p>'
    + '<div class="auth-foot"><button type="button" class="auth-link hero-back">' + t('controls.back') + '</button>'
    + '<button type="button" class="hh-tool is-primary auth-submit is-go hero-confirm">Enter town</button></div>';
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
    hold('Entering town…');
    let went;
    try { went = await o.done(); } catch (e) { went = false; }
    if (gone || went !== false) return;
    release();
    msg.textContent = 'Your hero is made, but town did not open. Press Enter town to try again.';
  }
  const repaint = previewer(card, colors, o.colorOf);

  async function submit() {
    if (busy || gone) return;
    msg.textContent = '';
    if (made) { enter(); return; }
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (name.length < 3) { msg.textContent = NAME_REASON.short; input.focus(); return; }
    hold('Making your hero…');   // stays off until the server answers
    if (!tried || tried.name !== name) tried = { name, key: globalThis.crypto.randomUUID() };
    const r = await o.create(name, Object.assign({}, colors), tried.key);
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
      for (const b of card.querySelectorAll('[data-hero-region="' + g + '"]')) b.setAttribute('aria-pressed', String(b === sw));
      repaint();
      return;
    }
    const pick = e.target.closest('.hero-pick');
    if (pick) {
      const on = card.classList.toggle('is-picking');
      pick.setAttribute('aria-pressed', String(on));
      pick.textContent = on ? 'How you fight' : 'Pick colors';
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
    destroy() { gone = true; unwatchHow(); card.removeEventListener('click', onClick); card.removeEventListener('keydown', onKey); },
  };
}
