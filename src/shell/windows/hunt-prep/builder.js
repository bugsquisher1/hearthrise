// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/hunt-prep/builder.js — THE BUILDER: ONE SETUP'S COPY, EDITED, THEN SAVED AS ONE INTENT.
//
// The right column of Hunt prep. The picked setup's state is the SERVER's: the envelope's hunt_settings
// for the setup in use, ONE hr_hunt_preset_read for another (session/preset-read.js). The builder edits
// a COPY of it (prep-draft.js): Fights as (read only), stance, target, chase and distance, the gold to
// keep, and the slot grid (grid.js). Save sends the copy as ONE hr_action_set_options with every key;
// Save and use then ONE hr_hunt_preset_apply. Basic setup (Tyler 2026-11-16) fills the copy's bar with the basic
// setup of the weapon type the picked setup fights as (src/shell/basic-setup.js, src/data/basic-setups.js), against
// the server's skills and carried stock; like Sort and Clear it sends nothing until Save. Its press names that weapon type
// ("Basic setup" over "Sword") in the setups column beside Use equipped; on an empty bar it is the window's one gold press (Tyler
// 2026-11-17: "i thought we were adding some defaults to this page?", the small word beside Sort went unseen).
// If the envelope changes the picked setup under a dirty draft (the HUD bar edited it), the builder says so and Save
// waits until the draft is loaded again.
// A clean draft always follows the server. Nothing here spends or gates anything (CLAUDE.md §6).
// ════════════════════════════════════════════════════════════════════════
import { settingsOf, huntOf } from '../../../session/hunt-sections.js';
import { presetsOf, equipmentOf, skillsOf, carriedOf, setupSlotsOf } from '../../../session/item-sections.js';
import { text, cls, prop, attr } from '../../../render/paint.js';
import { escapeHtml as esc } from '../../../utils/dom.js';
import { runIntent, refusalWords } from '../../intent-words.js';
import { HUNT_ROLES, ROLE_ORDER } from '../../../data/hunt-roles.js';
import { HUNT_STANCES, TARGET_MODES, HERO_DISTANCE } from '../../../data/rule-subjects.js';
import { GOLD_FLOOR } from '../../../data/hunt-sessions.js';
import { itemName } from '../../widgets/bits.js';
import { setupsOf } from '../../hunt-go.js';
import { settleTownActivity } from '../../../session/party-intents.js';
import { readPreset } from '../../../session/preset-read.js';
import { draftFrom, draftKey, isDirty, rebaseDraft, optionsOf, clearedBar, stepDistance, goldFloorOk } from '../../prep-draft.js';
import { sortBar } from '../../bar-sort.js';
import { basicBar, basicSetupOf } from '../../basic-setup.js';
import { t } from '../../../render/player-text.js';
import { gridHtml, patchGrid, actGrid } from './grid.js';

/** Throw the draft away: the next patch builds it again from the server's row. */
export function dropDraft(sc) {
  sc.draft = null; sc.draftFor = null; sc.base = ''; sc.read = null; sc.stale = false; sc.sorted = false; sc.cleared = false; sc.basic = false; sc.roleHint = null; sc.drag = null;
}

/** Pick setup `n` for editing (the draft of the old pick is thrown away). */
export function pickSetup(sc, n) {
  if (sc.picked === n) return;
  sc.picked = n;
  dropDraft(sc);
}

/** Has the player changed the picked setup's copy? */
export function draftDirty(sc) {
  return isDirty(sc.draft, sc.base);
}

function head(key) { return '<h3 class="hw-ledger-head is-on">' + t(key) + '</h3>'; }

/** BASIC SETUP'S PRESS: in the setups column beside Use equipped (hunt-prep.js; Tyler 2026-11-17 did not find it as a word beside Sort, and the
    head of the builder grew the window past its last bar row). Two lines, Use equipped's way: the feature's name, then the weapon type it loads. */
export function basicPressHtml() {
  return '<button type="button" class="hh-tool hpb-basic" data-hs-act="basic"><b>' + t('controls.basic_setup') + '</b><small></small></button>';
}

/** The column's skeleton. */
export function builderHtml() {
  const roles = ROLE_ORDER.map((r) => '<button type="button" class="hh-seg" data-hs-act="role" data-role="' + r + '" aria-pressed="false">' + esc(HUNT_ROLES[r].label) + '</button>').join('');
  const stances = Object.entries(HUNT_STANCES).map(([id, s]) => '<button type="button" class="hh-seg" data-hs-act="d-stance" data-val="' + id + '" aria-pressed="false">' + esc(s.label) + '</button>').join('');
  const targets = Object.entries(TARGET_MODES).map(([id, m]) => '<option value="' + id + '">' + esc(m.label) + '</option>').join('');
  return '<div class="hpb-edit">'
    + '<p class="hs-note hpb-read" hidden></p>'
    + '<div class="hpb-plays-box">' + head('prep.fights_as') + '<div class="hpb-plays"><span class="hh-segs" role="group" aria-label="' + t('prep.fights_as') + '">' + roles + '</span><p class="hpb-plays-line"></p></div></div>'
    + '<div class="hpb-three">'
    + '<div>' + head('prep.stance') + '<span class="hh-segs hpb-stance" role="group" aria-label="' + t('prep.stance') + '">' + stances + '</span><p class="hpb-stance-line"></p></div>'
    + '<div>' + head('prep.target') + '<select class="hh-select hpb-target" data-hs-act="d-target" aria-label="' + t('prep.target') + '">' + targets + '</select><p>' + t('prep.target_line') + '</p></div>'
    + '<div>' + head('prep.distance') + '<div class="hpb-move"><button type="button" class="hh-seg hpb-chase" data-hs-act="d-chase" aria-pressed="false">' + t('prep.chase') + '</button>'
    + '<span class="hh-step" role="group" aria-label="' + t('prep.distance') + '"><button type="button" class="hh-seg" data-hs-act="d-dist" data-val="-1" aria-label="' + t('prep.closer') + '">−</button>'
    + '<output class="hh-step-val hpb-dist"></output><button type="button" class="hh-seg" data-hs-act="d-dist" data-val="1" aria-label="' + t('prep.farther') + '">+</button></span></div><p class="hpb-move-line"></p></div>'
    + '<div>' + head('prep.gold') + '<label class="hpb-gold">'
    + '<input type="number" class="hh-num hpb-floor" min="' + GOLD_FLOOR.min + '" max="' + GOLD_FLOOR.max + '" step="50" inputmode="numeric" data-hs-act="d-gold" aria-label="' + t('prep.keep_at_least') + '">'
    + '<span class="hb-label">' + t('prep.gold_word') + '</span></label><p>' + t('prep.gold_line') + '</p></div>'
    + '</div>'
    + '<div class="hpb-barhead">' + head('prep.bar') + '<small class="hpb-barcount"></small>'
    + '<button type="button" class="hh-tool" data-hs-act="sort">' + t('controls.sort') + '</button><button type="button" class="hh-tool" data-hs-act="clear">' + t('controls.clear') + '</button></div>'
    + gridHtml()
    + '<p class="hpb-under">' + t('prep.bar_hint') + '</p>'
    + '</div>';
}

/* THE PICKED SETUP'S VIEW: the envelope's projection for the setup in use (always fresh), else the read's answer; a read is
   asked once per pick and the column says it is reading. null while there is nothing to show. */
function viewOf(ctx, sc, repaint) {
  const cs = ctx.character;
  const live = settingsOf(cs);
  if (!live) return null;
  if (sc.picked === live.preset) return live;
  if (sc.read && sc.read.preset === sc.picked) return sc.read.state === 'ok' ? sc.read.set : null;
  const preset = sc.picked;
  sc.read = { preset, state: 'reading', set: null, error: null };
  readPreset(ctx.account, cs, preset).then((r) => {
    if (!sc.read || sc.read.preset !== preset) return;
    sc.read = r.ok ? { preset, state: 'ok', set: r.set, error: null } : { preset, state: 'refused', set: null, error: r.error || 'refused' };
    repaint();
  });
  return null;
}

/* THE DRAFT FOLLOWS THE SERVER: built from the view on the first look, rebuilt when the server's row changes under a clean
   draft. Under a dirty one the server's change is folded in where the player changed nothing (prep-draft.js rebaseDraft: a slot set on
   the HUD bar shows here at once, the audit's A26); only when both changed the same slot is the copy held (and marked stale). */
function syncDraft(sc, view) {
  if (!view) return;
  const key = draftKey(draftFrom(view));
  if (!sc.draft || sc.draftFor !== sc.picked) { sc.draft = draftFrom(view); sc.base = key; sc.draftFor = sc.picked; sc.stale = false; return; }
  if (key === sc.base) { sc.stale = false; return; }
  if (!draftDirty(sc)) { sc.draft = draftFrom(view); sc.base = key; sc.stale = false; return; }
  const merged = rebaseDraft(sc.draft, sc.base, draftFrom(view));
  if (merged) { sc.draft = merged; sc.base = key; sc.stale = false; return; }
  sc.stale = true;
}

/* The picked setup's worn gear: the server's equipment for the setup in use, its saved gear row for another. */
function gearOf(cs, sc) {
  const mine = (setupsOf(cs) || []).find((x) => x.preset === sc.picked) || null;
  const saved = (presetsOf(cs) || []).find((p) => p.preset === sc.picked);
  return mine && mine.inUse ? equipmentOf(cs) || {} : saved ? saved.gear : {};
}

/* FIGHTS AS: the setup's role from the worn weapon (the server's for the setup in use, its gear row for another), and the
   line under it: what is worn, or, after a press on a dim role, how to get that role. */
function patchPlays(root, cs, sc, view) {
  const mine = (setupsOf(cs) || []).find((x) => x.preset === sc.picked) || null;
  const role = mine && mine.role ? mine.role : view && view.role && HUNT_ROLES[view.role] ? view.role : null;
  for (const b of root.querySelectorAll('.hpb-plays .hh-seg')) attr(b, 'aria-pressed', String(b.getAttribute('data-role') === role));
  text(root.querySelector('.hpb-plays-line'), fightsLine(sc.roleHint, role, gearOf(cs, sc)));
}

/** THE BASIC SETUP PRESS: { weapon, words, lead, off }. The weapon names the weapon type it loads, the server's discipline for the setup
    (bare hands play the club's list and say so), or that the type is unknown, and is '' before the setup is read; the words are the whole
    label for a reader. It leads (the window's gold press) while the copy's bar is empty: the obvious next step. Off with no copy or no
    type. Pure. */
export function basicPress(view, draft, gear) {
  const d = view && view.discipline;
  const known = !!basicSetupOf(d);
  const weapon = !view ? '' : !known ? t('prep.basic_none') : t('prep.basic_weapon_' + (d === 'club' && !(gear && gear.weapon) ? 'bare' : d));
  const empty = !!draft && Array.isArray(draft.slots) && draft.slots.every((s) => !s);
  return { weapon, words: weapon ? t('prep.basic_for', { weapon }) : t('controls.basic_setup'), lead: known && empty, off: !draft || !known };
}

/** The line under Fights as: how to get the role pressed (a dim one), else what is worn (the weapon and the shield beside it), else bare hands. Pure. */
export function fightsLine(roleHint, role, gear) {
  if (roleHint && roleHint !== role && HUNT_ROLES[roleHint]) return t('prep.fights_' + roleHint);
  const g = gear || {};
  const weapon = g.weapon ? itemName(g.weapon) : null;
  const shield = g.shield ? itemName(g.shield) : null;
  return !weapon ? t('prep.fights_none') : shield ? t('prep.fights_weapon_shield', { weapon, shield }) : t('prep.fights_weapon', { weapon });
}

const pct = (pm) => Math.abs(Math.round((pm - 1000) / 10));

/* STANCE, TARGET, DISTANCE, GOLD from the draft; each control is off until the draft holds that value (the server never sent one). */
function patchOptions(root, sc, off) {
  const d = sc.draft;
  for (const b of root.querySelectorAll('.hpb-stance .hh-seg')) { attr(b, 'aria-pressed', String(!!d && b.getAttribute('data-val') === d.stance)); prop(b, 'disabled', off || !d || d.stance === null); }
  const st = d && d.stance ? HUNT_STANCES[d.stance] : null;
  text(root.querySelector('.hpb-stance-line'), !st ? '' : st.dealt === 1000 && st.taken === 1000 ? t('prep.stance_balanced')
    : st.dealt >= 1000 ? t('prep.stance_more', { dealt: pct(st.dealt), taken: pct(st.taken) }) : t('prep.stance_less', { dealt: pct(st.dealt), taken: pct(st.taken) }));
  const target = root.querySelector('.hpb-target');
  prop(target, 'disabled', off || !d || d.targetMode === null);
  if (d && d.targetMode !== null) prop(target, 'value', d.targetMode);
  const chase = root.querySelector('.hpb-chase');
  attr(chase, 'aria-pressed', String(!!d && d.chase === true));
  prop(chase, 'disabled', off || !d || d.chase === null);
  for (const b of root.querySelectorAll('[data-hs-act="d-dist"]')) {
    const by = Number(b.getAttribute('data-val'));
    prop(b, 'disabled', off || !d || d.distance === null || d.distance + by < HERO_DISTANCE.min || d.distance + by > HERO_DISTANCE.max);
  }
  text(root.querySelector('.hpb-dist'), d && d.distance !== null ? String(d.distance) : '–');
  text(root.querySelector('.hpb-move-line'), !d || d.chase === null || d.distance === null ? '' : d.chase ? t('prep.chase_on') : t('prep.chase_off', { count: d.distance }));
  const floor = root.querySelector('.hpb-floor');
  prop(floor, 'disabled', off || !d || d.goldFloor === null);
  if (d && d.goldFloor !== null && floor.ownerDocument.activeElement !== floor) prop(floor, 'value', String(d.goldFloor));
}

/** Patch the column: the view, the draft, every control, the grid and the footer's Save buttons. */
export function patchBuilder(root, ctx, sc, hunting, repaint) {
  const cs = ctx.character;
  const view = viewOf(ctx, sc, repaint);
  syncDraft(sc, view);
  sc.view = view;
  const live = settingsOf(cs);
  const current = !!live && sc.picked === live.preset;
  const off = sc.pending;
  const reading = !view && sc.read && sc.read.preset === sc.picked ? sc.read.state : null;
  const readLine = root.querySelector('.hpb-read');
  /* A refused read says the server's why in the one table's words (rate_limited, no_character, a network miss). */
  text(readLine, reading === 'reading' ? t('prep.reading_setup') : reading === 'refused' ? refusalWords(sc.read.error) : '');
  prop(readLine, 'hidden', !reading);
  cls(root.querySelector('.hpb-edit'), 'is-blank', !sc.draft);
  patchPlays(root, cs, sc, view);
  patchOptions(root, sc, off);
  patchGrid(root, ctx, sc, view, off);
  for (const b of root.querySelectorAll('[data-hs-act="sort"], [data-hs-act="clear"]')) prop(b, 'disabled', off || !sc.draft);
  /* Basic setup needs the weapon type the server says this setup fights as: its second line says which, or that it is unknown (and the
     read line says the setup is still being read). */
  const bp = basicPress(view, sc.draft, gearOf(cs, sc));
  const basic = root.querySelector('[data-hs-act="basic"]');
  text(basic.querySelector('small'), bp.weapon);
  attr(basic, 'aria-label', bp.words);
  cls(basic, 'is-primary', bp.lead);
  prop(basic, 'disabled', off || bp.off);
  attr(basic, 'data-off-why', !sc.draft ? t('prep.reading_setup') : bp.off ? t('prep.basic_none') : null);
  const dirty = draftDirty(sc);
  /* The state line: what just happened to the copy, else that it is not saved yet. */
  text(root.querySelector('.hpb-state'), sc.stale ? t('prep.changed') : sc.basic ? t('prep.basic_loaded') : sc.sorted ? t('prep.sorted') : sc.cleared ? t('prep.cleared') : dirty ? t('prep.unsaved') : '');
  /* THE FOOTER'S SAVES. Save keeps the copy on the server; Save and use keeps it and puts that setup on (town only). On the setup in
     use Save alone is the primary: there is nothing to switch to. */
  const foot = root.querySelector('.hpb-foot');
  const save = foot.querySelector('.hpb-save'), saveUse = foot.querySelector('.hpb-save-use');
  prop(save, 'disabled', off || !sc.draft || sc.stale);
  cls(save, 'is-primary', current);
  prop(saveUse, 'hidden', current);
  prop(saveUse, 'disabled', off || !sc.draft || sc.stale || hunting);
  prop(foot.querySelector('.hpb-load'), 'hidden', !sc.stale);
}

/** SAVE: ONE hr_action_set_options with every key of the copy; and use: then ONE hr_hunt_preset_apply (a town activity settled
    first, as Use does). The copy is dropped on ok, so the next patch shows the server's row. A stale copy sends nothing.
    ONE BAR TRUTH (the full-game audit's A26, 2026-11-18: Save left "Not saved: Preset 1"): the bar in use is the setup this window names,
    so when the server holds no setup row for it, Save also keeps it as one, ONE hr_hunt_preset_save under its own name after the bar
    (keepAsSetup: in town, and only on a number the server lets this hero open). */
export function saveDraft(ctx, sc, repaint, andUse) {
  const cs = ctx.character;
  if (!sc.draft || sc.pending || sc.stale) return;
  const preset = sc.picked;
  const opts = optionsOf(sc.draft);
  const keep = keepAsSetup(cs, preset);
  const name = ((presetsOf(cs) || []).find((p) => p.preset === preset) || keep || {}).name || t('prep.setup_n', { n: preset + 1 });
  runIntent(sc, repaint, async () => {
    const r = await cs.setHuntOptions(preset, opts);
    if (!r.ok) return r;
    if (keep) { const k = await cs.savePreset(preset, keep.name); if (!k || !k.ok) return k || { ok: false, error: 'network' }; }
    if (!andUse) return r;
    await settleTownActivity(cs);
    return cs.applyPreset(preset);
  }, t('prep.saving'), () => { dropDraft(sc); return andUse ? t('prep.saved_on', { name }) : t('prep.saved', { name }); }, cs);
}

/** THE BAR IN USE WITH NO SETUP ROW: { name } when Save should also keep setup `preset` as one, else null. Only the setup in use (the server's
    hunt_settings.preset, named by its own row there), only with no saved row (hunt_presets), only in town (the server refuses hunt_open), and
    only on a number under this hero's count (setup_slots; unknown is no, §6 fail safe): past it the column's full line says why. Pure. */
export function keepAsSetup(cs, preset) {
  const live = settingsOf(cs), saved = presetsOf(cs), slots = setupSlotsOf(cs), h = huntOf(cs);
  if (!live || live.preset !== preset || !saved || saved.some((p) => p.preset === preset) || (h && !h.ended) || !slots || preset >= slots.count) return null;
  const row = live.presets.find((p) => p.preset === preset);
  return { name: row ? row.name : t('prep.setup_n', { n: preset + 1 }) };
}

/** BASIC SETUP: the copy's bar becomes the basic setup of the weapon type the picked setup fights as (its discipline, the server's),
    with the moves the server's skill levels allow and the food and drink the hero carries (basic-setup.js). The fight options stay. */
function loadBasic(ctx, sc) {
  const cs = ctx.character;
  const bar = sc.draft && sc.view ? basicBar({ discipline: sc.view.discipline, skills: skillsOf(cs), carried: carriedOf(cs) }) : null;
  if (!bar) return false;
  sc.draft.slots = bar;
  sc.basic = true; sc.sorted = false; sc.cleared = false;
  return true;
}

/** The column's presses and changes. Returns true/false when handled, undefined when it is not the column's. */
export function actBuilder(ctx, body, sc, repaint, action, ev, el) {
  if (action === 'b-slot') return actGrid(ctx, body, sc, repaint, ev, el);
  const d = sc.draft;
  const change = ev.type === 'change', click = ev.type === 'click';
  if (action === 'role' && click) { sc.roleHint = el.getAttribute('data-role'); repaint(); return true; }
  if (action === 'save' && click) { saveDraft(ctx, sc, repaint, false); return true; }
  if (action === 'save-use' && click) { saveDraft(ctx, sc, repaint, true); return true; }
  if (action === 'load-again' && click) { sc.draft = null; repaint(); return true; }
  if (!d || sc.pending) return click || change ? true : undefined;
  const touched = () => { sc.sorted = false; sc.cleared = false; sc.basic = false; repaint(); };
  if (action === 'd-stance' && click) { if (HUNT_STANCES[el.getAttribute('data-val')]) d.stance = el.getAttribute('data-val'); touched(); return true; }
  if (action === 'd-target' && change) { if (TARGET_MODES[el.value]) d.targetMode = el.value; touched(); return true; }
  if (action === 'd-chase' && click) { if (d.chase !== null) d.chase = !d.chase; touched(); return true; }
  if (action === 'd-dist' && click) { d.distance = stepDistance(d, Number(el.getAttribute('data-val'))); touched(); return true; }
  if (action === 'd-gold' && change) {
    const n = Math.round(Number(el.value));
    if (goldFloorOk(n)) d.goldFloor = n;
    el.blur();
    touched();
    return true;
  }
  if (action === 'sort' && click) { d.slots = sortBar(d.slots); sc.sorted = true; sc.cleared = false; sc.basic = false; repaint(); return true; }
  if (action === 'clear' && click) { d.slots = clearedBar(); sc.cleared = true; sc.sorted = false; sc.basic = false; repaint(); return true; }
  if (action === 'basic' && click) { loadBasic(ctx, sc); repaint(); return true; }
  return undefined;
}
