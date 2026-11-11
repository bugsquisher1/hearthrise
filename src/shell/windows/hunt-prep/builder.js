// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/hunt-prep/builder.js — THE BUILDER: ONE SETUP'S COPY, EDITED, THEN SAVED AS ONE INTENT.
//
// The right column of Hunt prep. The picked setup's state is the SERVER's: the envelope's hunt_settings
// for the setup in use, ONE hr_hunt_preset_read for another (session/preset-read.js). The builder edits
// a COPY of it (prep-draft.js): Fights as (read only), stance, target, chase and distance, the gold to
// keep, and the slot grid (grid.js). Save sends the copy as ONE hr_action_set_options with every key;
// Save and use then ONE hr_hunt_preset_apply. If the envelope changes the picked setup under a dirty
// draft (the HUD bar edited it), the builder says so and Save waits until the draft is loaded again.
// A clean draft always follows the server. Nothing here spends or gates anything (CLAUDE.md §6).
// ════════════════════════════════════════════════════════════════════════
import { settingsOf } from '../../../session/hunt-sections.js?v=0.2.122';
import { presetsOf, equipmentOf } from '../../../session/item-sections.js?v=0.2.122';
import { text, cls, prop, attr } from '../../../render/paint.js?v=0.2.122';
import { escapeHtml as esc } from '../../../utils/dom.js?v=0.2.122';
import { runIntent } from '../../intent-words.js?v=0.2.122';
import { HUNT_ROLES, ROLE_ORDER } from '../../../data/hunt-roles.js?v=0.2.122';
import { HUNT_STANCES, TARGET_MODES, HERO_DISTANCE } from '../../../data/rule-subjects.js?v=0.2.122';
import { GOLD_FLOOR } from '../../../data/hunt-sessions.js?v=0.2.122';
import { itemName } from '../../widgets/bits.js?v=0.2.122';
import { setupsOf } from '../../hunt-go.js?v=0.2.122';
import { settleTownActivity } from '../../../session/party-intents.js?v=0.2.122';
import { readPreset } from '../../../session/preset-read.js?v=0.2.122';
import { draftFrom, draftKey, isDirty, optionsOf, clearedBar, stepDistance, goldFloorOk } from '../../prep-draft.js?v=0.2.122';
import { sortBar } from '../../bar-sort.js?v=0.2.122';
import { t } from '../../../render/player-text.js?v=0.2.122';
import { gridHtml, patchGrid, actGrid } from './grid.js?v=0.2.122';

/** Throw the draft away: the next patch builds it again from the server's row. */
export function dropDraft(sc) {
  sc.draft = null; sc.draftFor = null; sc.base = ''; sc.read = null; sc.stale = false; sc.sorted = false; sc.cleared = false; sc.roleHint = null; sc.drag = null;
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
    + '<output class="hh-step-val hpb-dist"></output><button type="button" class="hh-seg" data-hs-act="d-dist" data-val="1" aria-label="' + t('prep.farther') + '">+</button></span><span class="hb-label">' + t('prep.tiles') + '</span></div><p class="hpb-move-line"></p></div>'
    + '<div>' + head('prep.gold') + '<label class="hpb-gold"><span class="hb-label">' + t('prep.keep_at_least') + '</span>'
    + '<input type="number" class="hh-num hpb-floor" min="' + GOLD_FLOOR.min + '" max="' + GOLD_FLOOR.max + '" step="50" inputmode="numeric" data-hs-act="d-gold" aria-label="' + t('prep.keep_at_least') + '">'
    + '<span class="hb-label">' + t('prep.gold_word') + '</span></label><p>' + t('prep.gold_line') + '</p></div>'
    + '</div>'
    + '<div class="hpb-barhead">' + head('prep.bar') + '<small class="hpb-barcount"></small></div>'
    + gridHtml()
    + '<div class="hpb-under"><p>' + t('prep.bar_hint') + '</p>'
    + '<button type="button" class="hh-tool" data-hs-act="sort">' + t('prep.sort') + '</button><button type="button" class="hh-tool" data-hs-act="clear">' + t('prep.clear') + '</button></div>'
    + '<p class="hpb-state"></p>'
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
   draft, held (and marked stale) when it changes under a dirty one. */
function syncDraft(sc, view) {
  if (!view) return;
  const key = draftKey(draftFrom(view));
  if (!sc.draft || sc.draftFor !== sc.picked) { sc.draft = draftFrom(view); sc.base = key; sc.draftFor = sc.picked; sc.stale = false; return; }
  if (key === sc.base) { sc.stale = false; return; }
  if (!draftDirty(sc)) { sc.draft = draftFrom(view); sc.base = key; sc.stale = false; return; }
  sc.stale = true;
}

/* FIGHTS AS: the setup's role from the worn weapon (the server's for the setup in use, its gear row for another), and the
   line under it: what is worn, or, after a press on a dim role, how to get that role. */
function patchPlays(root, cs, sc, view) {
  const setups = setupsOf(cs) || [];
  const mine = setups.find((x) => x.preset === sc.picked) || null;
  const role = mine && mine.role ? mine.role : view && view.role && HUNT_ROLES[view.role] ? view.role : null;
  for (const b of root.querySelectorAll('.hpb-plays .hh-seg')) attr(b, 'aria-pressed', String(b.getAttribute('data-role') === role));
  const saved = (presetsOf(cs) || []).find((p) => p.preset === sc.picked);
  text(root.querySelector('.hpb-plays-line'), fightsLine(sc.roleHint, role, mine && mine.inUse ? equipmentOf(cs) || {} : saved ? saved.gear : {}));
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
  text(readLine, reading === 'reading' ? t('prep.reading_setup') : reading === 'refused' ? t('prep.read_refused') : '');
  prop(readLine, 'hidden', !reading);
  cls(root.querySelector('.hpb-edit'), 'is-blank', !sc.draft);
  patchPlays(root, cs, sc, view);
  patchOptions(root, sc, off);
  patchGrid(root, ctx, sc, view, off);
  for (const b of root.querySelectorAll('[data-hs-act="sort"], [data-hs-act="clear"]')) prop(b, 'disabled', off || !sc.draft);
  const dirty = draftDirty(sc);
  /* The state line: what just happened to the copy, else that it is not saved yet. */
  text(root.querySelector('.hpb-state'), sc.stale ? t('prep.changed') : sc.sorted ? t('prep.sorted') : sc.cleared ? t('prep.cleared') : dirty ? t('prep.unsaved') : '');
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
    first, as Use does). The copy is dropped on ok, so the next patch shows the server's row. A stale copy sends nothing. */
export function saveDraft(ctx, sc, repaint, andUse) {
  const cs = ctx.character;
  if (!sc.draft || sc.pending || sc.stale) return;
  const preset = sc.picked;
  const opts = optionsOf(sc.draft);
  const name = ((presetsOf(cs) || []).find((p) => p.preset === preset) || {}).name || t('prep.setup_n', { n: preset + 1 });
  runIntent(sc, repaint, async () => {
    const r = await cs.setHuntOptions(preset, opts);
    if (!r.ok || !andUse) return r;
    await settleTownActivity(cs);
    return cs.applyPreset(preset);
  }, t('prep.saving'), () => { dropDraft(sc); return andUse ? t('prep.saved_on', { name }) : t('prep.saved', { name }); }, cs);
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
  const touched = () => { sc.sorted = false; sc.cleared = false; repaint(); };
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
  if (action === 'sort' && click) { d.slots = sortBar(d.slots); sc.sorted = true; sc.cleared = false; repaint(); return true; }
  if (action === 'clear' && click) { d.slots = clearedBar(); sc.cleared = true; sc.sorted = false; repaint(); return true; }
  return undefined;
}
