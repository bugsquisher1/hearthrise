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

import { HOW_YOU_FIGHT, HOW_YOU_FIGHT_LEAD, HOW_YOU_FIGHT_SLOTS } from '../data/how-to-play.js?v=0.2.84';
import { BASE_REGIONS, BASE_DEFAULT_COLORS, DYE_COUNT, REGION_LABEL, HERO_DYES_SHOWN } from '../data/outfits.js?v=0.2.84';
import { HERO_BASE_ROWS, HERO_BASE_W, HERO_BASE_H, HERO_BASE_LEGEND, HERO_SHADE_PERMILLE } from '../data/hero-base.js?v=0.2.84';
import { refusalWords } from '../shell/intent-words.js?v=0.2.84';
import { focusOffTouch } from './sign-in.js?v=0.2.84';

/* The preview's integer scale: 16 x 24 cells at 8 = 128 x 192 px. */
export const PREVIEW_SCALE = 8;

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

/** '#rrggbb' -> [r, g, b], or null. Pure. */
export function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/**
 * The preview as cells: [{ x, y, rgb }] for every painted cell. Pure.
 * @param colors  { head, body, legs, feet } dye indices
 * @param colorOf (tokenName) -> '#rrggbb'  (a --dye-N or --hero-* token's value)
 */
export function heroCells(colors, colorOf) {
  const out = [];
  const dye = {};
  for (const g of BASE_REGIONS) dye[g] = hexRgb(colorOf('dye-' + colors[g]));
  const fixed = {};
  HERO_BASE_ROWS.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const l = HERO_BASE_LEGEND[row[x]];
      if (!l) continue;
      let rgb;
      if (l.token) rgb = fixed[l.token] || (fixed[l.token] = hexRgb(colorOf(l.token)));
      else {
        const base = dye[l.region];
        rgb = base && l.shade ? base.map((c) => Math.floor(c * HERO_SHADE_PERMILLE / 1000)) : base;
      }
      if (rgb) out.push({ x, y, rgb });
    }
  });
  return out;
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

/** Paint the preview into a canvas at PREVIEW_SCALE (whole cells, no smoothing). */
function paintPreview(canvas, colors, colorOf) {
  const ctx = canvas && canvas.getContext ? canvas.getContext('2d') : null;
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const c of heroCells(colors, colorOf)) {
    ctx.fillStyle = 'rgb(' + c.rgb.join(',') + ')';
    ctx.fillRect(c.x * PREVIEW_SCALE, c.y * PREVIEW_SCALE, PREVIEW_SCALE, PREVIEW_SCALE);
  }
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
    + '<div class="hero-body">'
    + (dyes ? '<canvas class="hero-preview" width="' + HERO_BASE_W * PREVIEW_SCALE + '" height="' + HERO_BASE_H * PREVIEW_SCALE + '" role="img" aria-label="Your hero"></canvas>' : '')
    + '<div class="hero-form">'
    + '<label class="auth-field">Name<input type="text" class="hero-name" maxlength="20" autocomplete="off" spellcheck="false" placeholder="3 to 20 letters"></label>'
    + (dyes ? BASE_REGIONS.map((g) => '<fieldset class="hero-region"><legend>' + REGION_LABEL[g] + '</legend><div class="hero-dyes">' + swatches(g) + '</div></fieldset>').join('') : '')
    + '</div>' + howYouFightHtml() + '</div>'
    + '<p class="auth-message" role="status" aria-live="polite"></p>'
    + '<div class="auth-foot"><button type="button" class="auth-link hero-back">Back to your characters</button>'
    + '<button type="button" class="hh-tool is-primary auth-submit is-go hero-confirm">Enter town</button></div>';
  const canvas = card.querySelector('.hero-preview');
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
  const repaint = () => paintPreview(canvas, colors, o.colorOf);
  repaint();

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
