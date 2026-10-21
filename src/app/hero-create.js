// ════════════════════════════════════════════════════════════════════════
// src/app/hero-create.js — THE CREATION STEP (Tyler 2026-10-20).
//
// "Creating a hero opens a short step: type a name, pick colours for Head,
// Body, Legs and Feet, see the hero update as you pick. The hero enters town
// only after you confirm." No role pick: the role is the weapon's.
//
// The step is a form over the characters card. Nothing it holds is authority:
// Confirm sends ONE intent (AccountSession.create → hr_create_hero) with the
// name and the four dye indices; the server checks the name (moderation,
// uniqueness), the colours and the slot, and the hero enters the world only on
// its yes. A refusal keeps the step open with the server's reason.
//
// PURE of globals: the document and the dye colours are handed in.
// ════════════════════════════════════════════════════════════════════════

import { BASE_REGIONS, BASE_DEFAULT_COLORS, DYE_COUNT, REGION_LABEL } from '../data/outfits.js?v=0.2.24';
import { HERO_BASE_ROWS, HERO_BASE_W, HERO_BASE_H, HERO_BASE_LEGEND, HERO_SHADE_PERMILLE } from '../data/hero-base.js?v=0.2.24';
import { refusalWords } from '../shell/intent-words.js?v=0.2.24';

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
 *            done () (the hero exists: play it), back () (return to the characters) }
 * @returns { colors () the picked indices, destroy () }
 */
export function renderHeroCreate(card, o) {
  const colors = Object.assign({}, BASE_DEFAULT_COLORS);
  const swatches = (g) => {
    let h = '';
    for (let i = 0; i < DYE_COUNT; i++) {
      h += '<button type="button" class="hc-dye" data-hc-region="' + g + '" data-hc-dye="' + i + '" style="--hc-dye: var(--dye-' + i + ')"'
        + ' aria-label="' + REGION_LABEL[g] + ' colour ' + (i + 1) + '" aria-pressed="' + (colors[g] === i) + '"></button>';
    }
    return h;
  };
  card.innerHTML = '<h1 class="auth-title">Create your hero</h1>'
    + '<div class="hc-body">'
    + '<canvas class="hc-preview" width="' + HERO_BASE_W * PREVIEW_SCALE + '" height="' + HERO_BASE_H * PREVIEW_SCALE + '" role="img" aria-label="Your hero"></canvas>'
    + '<div class="hc-form">'
    + '<label class="auth-field">Name<input type="text" class="hc-name" maxlength="20" autocomplete="off" spellcheck="false" placeholder="3 to 20 letters"></label>'
    + BASE_REGIONS.map((g) => '<fieldset class="hc-region"><legend>' + REGION_LABEL[g] + '</legend><div class="hc-dyes">' + swatches(g) + '</div></fieldset>').join('')
    + '</div></div>'
    + '<p class="auth-message" role="status" aria-live="polite"></p>'
    + '<button type="button" class="auth-submit hc-confirm">Enter town</button>'
    + '<p class="auth-links"><button type="button" class="auth-link hc-back">Back to your characters</button></p>';
  const canvas = card.querySelector('.hc-preview');
  const input = card.querySelector('.hc-name');
  const msg = card.querySelector('.auth-message');
  const confirm = card.querySelector('.hc-confirm');
  let busy = false;
  let gone = false;
  const repaint = () => paintPreview(canvas, colors, o.colorOf);
  repaint();

  async function submit() {
    if (busy || gone) return;
    const name = input.value.trim().replace(/\s+/g, ' ');
    if (name.length < 3) { msg.textContent = NAME_REASON.short; input.focus(); return; }
    busy = true;
    confirm.disabled = true;   // stays off until the server answers
    msg.textContent = '';
    const r = await o.create(name, Object.assign({}, colors));
    if (gone) return;
    busy = false;
    confirm.disabled = false;
    if (r && r.ok) { o.done(); return; }
    msg.textContent = refusalText(r);
  }

  const onClick = (e) => {
    const sw = e.target.closest('[data-hc-dye]');
    if (sw) {
      const g = sw.getAttribute('data-hc-region');
      const i = Number(sw.getAttribute('data-hc-dye'));
      if (!BASE_REGIONS.includes(g) || !Number.isInteger(i)) return;
      colors[g] = i;
      for (const b of card.querySelectorAll('[data-hc-region="' + g + '"]')) b.setAttribute('aria-pressed', String(b === sw));
      repaint();
      return;
    }
    if (e.target.closest('.hc-confirm')) submit();
    else if (e.target.closest('.hc-back')) o.back();
  };
  const onKey = (e) => { if (e.key === 'Enter' && e.target === input) submit(); };
  card.addEventListener('click', onClick);
  card.addEventListener('keydown', onKey);
  input.focus();
  return {
    colors: () => Object.assign({}, colors),
    destroy() { gone = true; card.removeEventListener('click', onClick); card.removeEventListener('keydown', onKey); },
  };
}
