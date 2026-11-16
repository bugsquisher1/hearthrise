// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/tower.js — THE BURNING TOWER: WHAT IT IS, WHERE YOU MAY START, AND THE HEARTH CHEST.
//
// The design of record: docs/planning/PRIORITY_BOARD.md "2026-11-14 The Burning Tower" (origin/lane/d-burning-tower) §2 how a climb runs,
// §5 (c) the chest's one menu, §8 the window's words; the server half is 2027-04-24-tower-climb.sql, 2027-04-27-tower-chest.sql and
// 2027-04-28-tower-section.sql. The Great Hearth's tap opens it (src/data/world/stations.js), only while the server sends the `tower`
// section (its switch, src/data/shell-windows.js `section`); with the switch off the Hearth opens the bag as before and nothing here
// exists. One component: a docked window on a desktop, a slide-out sheet on a phone (the window manager's).
//
// TWO TABS. Climb: the six plain lines the design puts first, what a climb pays (the Tower mode's own row), the hero's best, and on the
// foot the Start Floor picker beside Enter: ONE control, a select of the CHECKPOINTS the server lists (Tyler 2026-11-16: every landing up
// to the hero's best, a party's lowest seat's; the highest by default), each said as the floor the climb starts on. Chest:
// ./tower-chest.js. The Story link shows Tyler's text. Every number is the section's (CLAUDE.md §1, §6): the window works none out and
// sends only the picked checkpoint. Enter is off, and says why above it, for what the screen already knows (a hunt, a seat that does not
// lead its party, a checkpoint the server did not list); the server still judges (hr_tower_start), and a refusal re-reads the character
// so the list on screen is the server's again.
// ════════════════════════════════════════════════════════════════════════
import { towerOf } from '../../session/tower-sections.js?v=0.2.133';
import { startClimb } from '../../session/tower-intents.js?v=0.2.133';
import { huntOf } from '../../session/hunt-sections.js?v=0.2.133';
import { partyMembershipOf } from '../../session/party-sections.js?v=0.2.133';
import { nameOf } from '../../session/item-sections.js?v=0.2.133';
import { text, cls, attr, prop, rows } from '../../render/paint.js?v=0.2.133';
import { t } from '../../render/player-text.js?v=0.2.133';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.133';
import { runIntent } from '../intent-words.js?v=0.2.133';
import { chestHtml, patchChest, actChest } from './tower-chest.js?v=0.2.133';

const TABS = Object.freeze(['climb', 'chest']);
const STORY = Object.freeze(['tower.story_1', 'tower.story_2', 'tower.story_3', 'tower.story_4', 'tower.story_5']);
const SCRATCH = new WeakMap();
/* Display scratch per CharacterSession: the tab, the story shown, the checkpoint picked (null: the highest the server lists), the chest's. */
export const scratchOf = (cs) => {
  let s = SCRATCH.get(cs);
  if (!s) { s = { tab: 'climb', story: false, landing: null, key: null, pending: false, msg: '', result: null }; SCRATCH.set(cs, s); }
  return s;
};

/** The checkpoint Enter starts after: the one picked here while the server still lists it, else the highest it lists (the best), else
    null. Pure. */
export function landingPicked(sc, tw) {
  if (!tw || !tw.checkpoints.length) return null;
  return sc.landing !== null && tw.checkpoints.includes(sc.landing) ? sc.landing : tw.checkpoints[tw.checkpoints.length - 1];
}

/** Why Enter is off now, said above it, or '' when the server is to judge. Only what the screen already knows from the server's record. */
export function enterBlock(cs, tw, landing) {
  const h = huntOf(cs);
  if (h && !h.ended) return t(h.huntId === tw.hunt ? 'tower.off_climbing' : 'tower.off_hunting');
  /* a party climbs together on its leader's press (hr_tower_start: every seat or none, from its lowest seat's checkpoints) */
  const party = partyMembershipOf(cs);
  if (party && !party.isLeader) return t('tower.off_leader');
  if (!tw.checkpoints.length) return t('tower.off_no_start');
  if (landing === null || !tw.checkpoints.includes(landing)) return t('tower.off_pick');
  return '';
}

/** The skeleton (built once per opening). */
export function renderTower(ctx) {
  if (ctx && ctx.character) { const sc = scratchOf(ctx.character); sc.msg = ''; sc.result = null; sc.story = false; }
  return '<div class="tt-tower">'
    + '<div class="tt-top"><div class="hw-tabs" role="tablist">'
    + TABS.map((id, i) => '<button type="button" role="tab" class="hw-tab" data-hs-act="tab" data-tab="' + id + '" aria-selected="' + (i === 0) + '">'
      + esc(t('tower.tab_' + id)) + '</button>').join('')
    + '</div><button type="button" class="hh-tool tt-story-link" data-hs-act="story" aria-expanded="false">' + esc(t('tower.story_link')) + '</button></div>'
    + '<section class="tt-story" hidden>' + STORY.map((k) => '<p>' + esc(t(k)) + '</p>').join('') + '</section>'
    + '<section class="hw-pane tt-pane" data-pane="climb">'
    + '<p class="tt-now" hidden></p>'
    /* what the Tower is, one label a row: the mode's pay and the rules are the server's, each row hidden when its row does not say it */
    + '<ul class="tt-sum"><li>' + esc(t('tower.sum_floors')) + '</li><li>' + esc(t('tower.sum_party')) + '</li>'
    + '<li class="tt-xp"></li><li class="tt-sum-loot"></li><li class="tt-sum-death"></li><li class="tt-sum-uses"></li>'
    + '<li class="tt-sum-keys"></li><li>' + esc(t('tower.sum_chest')) + '</li></ul>'
    + '<p class="tt-line tt-best"></p><p class="hs-note tt-limits"></p>'
    /* the Start Floor picker stands on the foot beside Enter: the floor the press sends is never scrolled away from it */
    + '<div class="tt-foot"><label class="hr-pick tt-start-row"><span>' + esc(t('tower.start_head')) + '</span>'
    + '<select class="hh-select tt-start-pick" data-hs-act="floor"></select></label>'
    + '<p class="hs-note tt-start-note"></p><p class="hw-why tt-off-why"></p>'
    + '<button type="button" class="hh-tool is-primary tt-go" data-hs-act="tower-enter">' + esc(t('controls.enter')) + '</button></div>'
    + '</section>'
    + '<section class="hw-pane tt-pane" data-pane="chest">' + chestHtml() + '</section>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

/* The checkpoints the server lists, as the options of ONE select (the list grows with the hero's best: one control at any length), each
   said as the floor the climb starts on (the one after the landing; 0 is floor 1); the picked one selected, off while a press is out or
   the server lists none. */
function patchStarts(sel, tw, picked, pending) {
  rows(sel, tw.checkpoints.map((l) => ({ l })), {
    key: (r) => String(r.l),
    build: () => sel.ownerDocument.createElement('option'),
    patch: (o, r) => { attr(o, 'value', String(r.l)); text(o, t('tower.start_floor', { floor: r.l + 1 })); },
  });
  prop(sel, 'value', picked === null ? '' : String(picked));
  prop(sel, 'disabled', pending || !tw.checkpoints.length);
}

/* THE CLIMB TAB, every line from the section. */
function patchClimb(root, cs, tw, sc) {
  const name = nameOf(cs) || t('training.your_hero');
  const run = tw.run;
  const now = root.querySelector('.tt-now');
  prop(now, 'hidden', !run);
  text(now, run ? t(run.floor !== null ? 'tower.run_now' : 'tower.run_ready', { name, floor: run.floor !== null ? run.floor : run.start }) : '');
  const p = tw.pays;
  const row = (sel, on, words) => { const li = root.querySelector(sel); prop(li, 'hidden', !on); text(li, on ? words : ''); };
  row('.tt-sum-death', !!p && p.deathLossPm === 0, t('tower.sum_death'));
  row('.tt-sum-loot', !!p && !p.coin && !p.drops, t('tower.sum_loot'));
  row('.tt-sum-uses', !!p && p.stamina, t('tower.sum_uses'));
  /* no weekly EARN cap is said: Tyler 2026-11-16 put the cap on chests opened per key family, the Chest tab's line (KEY FAMILIES) */
  text(root.querySelector('.tt-sum-keys'), t('tower.sum_keys', { every: tw.rules.landingEvery }));
  row('.tt-xp', !!p, p ? t('tower.xp_rule', { pct: p.xpPm / 10 }) : '');
  const landing = landingPicked(sc, tw);
  patchStarts(root.querySelector('.tt-start-pick'), tw, landing, sc.pending);
  /* in a party the list is its lowest seat's record (the server's), and the note says whose */
  const party = partyMembershipOf(cs);
  text(root.querySelector('.tt-start-note'), t(party ? 'tower.start_note_party' : 'tower.start_note', { every: tw.rules.landingEvery }));
  text(root.querySelector('.tt-best'), tw.bestFloor > 0 ? t('tower.best', { floor: tw.bestFloor }) : t('tower.best_none'));
  text(root.querySelector('.tt-limits'), t('tower.limits', { floor: tw.rules.floorLimitMs / 60000, landing: tw.rules.landingLimitMs / 60000 }));
  const block = enterBlock(cs, tw, landing);
  const go = root.querySelector('.tt-go');
  prop(go, 'disabled', sc.pending || !!block);
  attr(go, 'data-off-why', block || null);
  attr(go, 'data-landing', landing === null ? null : String(landing));
  text(root.querySelector('.tt-off-why'), block);
}

renderTower.patch = function patchTower(body, ctx) {
  const cs = ctx.character;
  const root = body.querySelector('.tt-tower');
  if (!cs || !root) return;
  const tw = towerOf(cs);
  /* the switch went off (or the section is not the server's shape): the window has nothing true to say */
  if (!tw) { if (ctx.wm && typeof ctx.wm.close === 'function') ctx.wm.close('tower'); return; }
  const sc = scratchOf(cs);
  const want = ctx.wm && typeof ctx.wm.takeTab === 'function' ? ctx.wm.takeTab('tower') : null;
  if (want && TABS.includes(want)) { sc.tab = want; sc.msg = ''; }
  for (const b of root.querySelectorAll('.hw-tab')) attr(b, 'aria-selected', String(b.getAttribute('data-tab') === sc.tab));
  for (const p of root.querySelectorAll('.tt-pane')) cls(p, 'is-on', p.getAttribute('data-pane') === sc.tab);
  prop(root.querySelector('.tt-story'), 'hidden', !sc.story);
  attr(root.querySelector('.tt-story-link'), 'aria-expanded', String(sc.story));
  text(root.querySelector('.tt-story-link'), t(sc.story ? 'tower.story_hide' : 'tower.story_link'));
  if (sc.tab === 'climb') patchClimb(root, cs, tw, sc);
  else patchChest(root.querySelector('[data-pane="chest"]'), cs, tw, sc);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
};

renderTower.act = function actTower(ctx, body, action, ev, el) {
  const cs = ctx.character;
  if (!cs) return false;
  const sc = scratchOf(cs);
  const repaint = () => ctx.refresh('tower');
  const tw = towerOf(cs);
  if (!tw) return false;
  /* the Start Floor picker: a change picks a floor the server lists (anything else is not its list and is ignored) */
  if (action === 'floor') {
    if (ev.type === 'change') { const l = Number(el.value); if (tw.checkpoints.includes(l)) { sc.landing = l; sc.msg = ''; } repaint(); }
    return true;
  }
  if (ev.type !== 'click') return false;
  if (action === 'tab') { const id = el.getAttribute('data-tab'); if (TABS.includes(id)) { sc.tab = id; sc.msg = ''; body.scrollTop = 0; repaint(); } return true; }
  if (action === 'story') { sc.story = !sc.story; repaint(); return true; }
  if (actChest(ctx, cs, tw, sc, action, el, repaint)) return true;
  if (sc.pending || !ctx.account) return false;
  if (action === 'tower-enter') {
    const landing = landingPicked(sc, tw);
    if (enterBlock(cs, tw, landing)) { repaint(); return true; }
    runIntent(sc, repaint, () => startClimb(ctx.account, cs, landing), t('tower.busy_start'),
      () => t('tower.started', { name: nameOf(cs) || t('training.your_hero') }), cs);
    return true;
  }
  return false;
};
