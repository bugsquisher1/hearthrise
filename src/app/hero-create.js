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
// HEROES TWO TO FOUR COME PRE-FILLED (companyOf): once the account has a hero,
// the step offers every empty slot at once, as a shield, a healer and a bow
// (COMPANY_PICKS), with the first hero's colors to copy, and one press makes them.
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

import { HOW_YOU_FIGHT, HOW_YOU_FIGHT_LEAD, STARTER_PICKS, COMPANY_PICKS } from '../data/how-to-play.js';
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
 * @param colors  { head, body, legs, feet } dye indices
 * @param colorOf (tokenName) -> '#rrggbb'  (a --dye-N token's value)
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

/** The "How this hero fights" column: the rule, the account's hero slots on their own line (`slots`: the Characters screen's line, the
    SERVER'S numbers, slot-offer.js playLineOf; '' while it has not said, and nothing is shown), then the cards to pick from. Pure. */
export function howYouFightHtml(slots = '', picked = null) {
  return '<section class="hero-how" aria-labelledby="hero-how-title"><h2 class="hero-how-title hs-sub" id="hero-how-title">' + t('heroes.create_pick') + '</h2>'
    + '<p class="hero-how-lead">' + HOW_YOU_FIGHT_LEAD + '</p>'
    + (slots ? '<p class="hero-how-slots">' + esc(slots) + '</p>' : '')
    + pickCardsHtml(picked)
    + '<p class="hero-how-more" hidden>' + t('heroes.create_more') + '</p></section>';
}

/**
 * The pre-filled party for heroes two to four (chapter 08 section 2.1), or null: the account has no hero yet (the first is made alone),
 * or `slot` is not empty. `slots`: `slot` first, then every other empty slot, at most COMPANY_PICKS.length; `copyFrom`: the first hero's
 * name and base colors, for "Same colors as". Pure: the roster is the server's (AccountSession.roster).
 */
export function companyOf(roster, slot) {
  const rows = Array.isArray(roster) ? roster : [];
  const first = rows.find((r) => r && r.exists);
  const empty = rows.filter((r) => r && !r.exists && !r.unnamed).map((r) => r.slot);
  if (!first || !empty.includes(slot)) return null;
  const base = first.look && first.look.base && typeof first.look.base === 'object' ? first.look.base : null;
  return { slots: [slot, ...empty.filter((x) => x !== slot)].slice(0, COMPANY_PICKS.length), copyFrom: { name: first.name || '', base } };
}

/** The party's healer line: how many of `sets` heal (one, as pre-filled, or none). Pure. */
export function healerWords(sets) {
  const heals = sets.filter((set) => (styleOf(set) || {}).role === 'healer').length;
  return heals ? t('heroes.company_healer_one') : t('heroes.company_healer_none');
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
 * @param o { slot, colorOf (token) -> '#rrggbb', create (name, colors, key, set, slot?) -> Promise<{ ok, reason, nameReason }>,
 *            done () (the hero exists: play it), back () (return to the characters), dyes (the strips and preview: outfits.js HERO_DYES_SHOWN),
 *            slots (the Characters screen's hero-slot line, the server's numbers; '' or none: not shown),
 *            company (companyOf: heroes two to four pre-filled, made with one press; null: one hero, picked from nothing) }
 * @returns { colors () the picked indices, destroy () }
 */
export function renderHeroCreate(card, o) {
  if (!o.company) return renderOne(card, o);
  /* "One at a time": the party's first slot as a step of its own, its pick and the copy press carried over */
  let inner = renderCompany(card, o, (picked) => {
    inner.destroy();
    inner = renderOne(card, Object.assign({}, o, { company: null, picked, copyFrom: o.company.copyFrom }));
  });
  return { colors: () => inner.colors(), destroy: () => inner.destroy() };
}

/* ONE HERO: a name, a way to fight (none picked for the first hero), the colors. `o.picked`: a way already chosen (heroes two to four);
   `o.copyFrom`: { name, base } of the first hero, offered as one press. */
function renderOne(card, o) {
  const colors = Object.assign({}, BASE_DEFAULT_COLORS);
  let picked = typeof o.picked === 'string' && STARTER_SETS[o.picked] ? o.picked : null;
  const copy = o.copyFrom && o.copyFrom.base ? o.copyFrom : null;
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
    + (dyes && copy ? '<button type="button" class="hh-tool hero-copy" aria-pressed="false">' + esc(t('heroes.company_copy', { name: copy.name })) + '</button>' : '')
    + (dyes ? '<div class="hero-colors">' + BASE_REGIONS.map((g) => '<fieldset class="hero-region"><legend>' + REGION_LABEL[g] + '</legend><div class="hero-dyes">' + swatches(g) + '</div></fieldset>').join('') + '</div>' : '')
    + '</div>' + howYouFightHtml(typeof o.slots === 'string' ? o.slots : '', picked) + '</div>'
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
    if (e.target.closest('.hero-copy') && copy) {
      for (const g of BASE_REGIONS) if (Number.isInteger(copy.base[g])) colors[g] = copy.base[g];
      e.target.closest('.hero-copy').setAttribute('aria-pressed', 'true');
      paintColors();
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

/* HEROES TWO TO FOUR, PRE-FILLED (chapter 08 section 2.1): every empty slot at once as a shield, a healer and a bow, each pick changeable,
   the first hero's colors copied unless unticked, the healer line kept true as the picks change, and ONE press that makes them in order,
   one intent a hero. A refused name stops there with its reason; the heroes made stay made and are never asked for again. */
function renderCompany(card, o, alone) {
  const c = o.company;
  const sets = c.slots.map((_, i) => COMPANY_PICKS[i] || COMPANY_PICKS[0]);
  const made = c.slots.map(() => false);
  const tried = c.slots.map(() => null);
  const options = (sel) => STARTER_PICKS.map((r) => '<option value="' + r.set + '"' + (r.set === sel ? ' selected' : '') + '>' + esc(r.name) + '</option>').join('');
  card.innerHTML = '<h1 class="auth-title">' + t('heroes.company_title') + '</h1>'
    + '<p class="auth-lead">' + t('heroes.company_lead') + '</p>'
    + '<ol class="hero-party">' + c.slots.map((slot, i) => '<li class="hero-member" data-member="' + i + '">'
      + '<input type="text" class="hero-name" data-member="' + i + '" maxlength="20" autocomplete="off" spellcheck="false" aria-label="' + t('heroes.create_name') + '" placeholder="' + t('heroes.create_name_hint') + '">'
      + '<select class="hero-member-way" data-member="' + i + '" aria-label="' + t('heroes.create_pick') + '">' + options(sets[i]) + '</select></li>').join('') + '</ol>'
    + '<p class="hero-party-healer">' + healerWords(sets) + '</p>'
    + (c.copyFrom.base ? '<label class="hero-party-copy"><input type="checkbox" class="hero-copy-on" checked> ' + esc(t('heroes.company_copy', { name: c.copyFrom.name })) + '</label>' : '')
    + '<p class="auth-message" role="status" aria-live="polite"></p>'
    + '<div class="auth-foot"><button type="button" class="auth-link hero-back">' + t('controls.back') + '</button>'
    + '<button type="button" class="auth-link hero-alone">' + t('heroes.company_one') + '</button>'
    + '<button type="button" class="hh-tool is-primary auth-submit is-go hero-confirm">' + t('heroes.company_go', { count: c.slots.length }) + '</button></div>';
  const msg = card.querySelector('.auth-message');
  const confirm = card.querySelector('.hero-confirm');
  const nameOf = (i) => card.querySelector('.hero-name[data-member="' + i + '"]');
  let busy = false;
  let gone = false;
  const pressWords = confirm.textContent;
  const colorsNow = () => {
    const on = card.querySelector('.hero-copy-on');
    return Object.assign({}, BASE_DEFAULT_COLORS, on && on.checked && c.copyFrom.base ? c.copyFrom.base : {});
  };
  async function submit() {
    if (busy || gone) return;
    msg.textContent = '';
    for (let i = 0; i < c.slots.length; i++) {
      if (made[i]) continue;
      const name = nameOf(i).value.trim().replace(/\s+/g, ' ');
      if (name.length < 3) { msg.textContent = t(NAME_REASON.short); nameOf(i).focus(); return; }
    }
    busy = true; confirm.disabled = true; confirm.textContent = t('heroes.creating');
    for (let i = 0; i < c.slots.length; i++) {
      if (made[i]) continue;
      const name = nameOf(i).value.trim().replace(/\s+/g, ' ');
      if (!tried[i] || tried[i].name !== name || tried[i].set !== sets[i]) tried[i] = { name, set: sets[i], key: globalThis.crypto.randomUUID() };
      const r = await o.create(name, colorsNow(), tried[i].key, sets[i], c.slots[i]);
      if (gone) return;
      if (r && (r.ok || r.reason === 'already_created')) {
        made[i] = true;
        nameOf(i).disabled = true;
        card.querySelector('.hero-member-way[data-member="' + i + '"]').disabled = true;
        continue;
      }
      if (r && r.answered) tried[i] = null;
      busy = false; confirm.disabled = false; confirm.textContent = pressWords;
      msg.textContent = refusalText(r);
      nameOf(i).focus();
      return;
    }
    confirm.textContent = t('heroes.entering');
    let went;
    try { went = await o.done(); } catch (e) { went = false; }
    if (gone || went !== false) return;
    busy = false; confirm.disabled = false; confirm.textContent = pressWords;
    msg.textContent = t('heroes.enter_failed');
  }
  const onChange = (e) => {
    const sel = e.target.closest && e.target.closest('.hero-member-way');
    if (!sel) return;
    const i = Number(sel.getAttribute('data-member'));
    if (STARTER_SETS[sel.value] && Number.isInteger(i)) sets[i] = sel.value;
    card.querySelector('.hero-party-healer').textContent = healerWords(sets);
  };
  const onClick = (e) => {
    if (e.target.closest('.hero-confirm')) submit();
    else if (e.target.closest('.hero-back')) o.back();
    else if (e.target.closest('.hero-alone') && !busy && !made.some(Boolean)) alone(sets[0]);
  };
  card.addEventListener('change', onChange);
  card.addEventListener('click', onClick);
  focusOffTouch(nameOf(0));
  return {
    colors: () => colorsNow(),
    destroy() { gone = true; card.removeEventListener('change', onChange); card.removeEventListener('click', onClick); },
  };
}
