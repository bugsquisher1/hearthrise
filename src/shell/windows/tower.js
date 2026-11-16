// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/tower.js — THE BURNING TOWER: WHAT IT IS, WHERE YOU MAY START, THIS WEEK'S KEYS, AND THE HEARTH CHEST.
//
// The design of record: docs/planning/PRIORITY_BOARD.md "2026-11-14 The Burning Tower" (origin/lane/d-burning-tower) §2 how a climb runs,
// §5 (c) the chest's one menu, §8 the window's words; the server half is 2027-04-24-tower-climb.sql, 2027-04-27-tower-chest.sql and
// 2027-04-28-tower-section.sql. The Great Hearth's tap opens it (src/data/world/stations.js), only while the server sends the `tower`
// section (its switch, src/data/shell-windows.js `section`); with the switch off the Hearth opens the bag as before and nothing here
// exists. One component: a docked window on a desktop, a slide-out sheet on a phone (the window manager's).
//
// TWO TABS. Climb: the six plain lines the design puts first, the floors the server lists for this hero this week (a press picks one),
// what a climb pays (the Tower mode's own row), this week's keys, and Enter. Chest: ./tower-chest.js. The Story link shows Tyler's text.
// Every number is the section's (CLAUDE.md §1, §6): the window works none out and sends none. Enter is off, and says why above it, for
// what the screen already knows (a hunt, a party, a floor the server did not list); the server still judges (hr_tower_start), and a
// refusal re-reads the character so the list on screen is the server's again.
// ════════════════════════════════════════════════════════════════════════
import { towerOf, keyForLanding } from '../../session/tower-sections.js?v=0.2.133';
import { startClimb } from '../../session/tower-intents.js?v=0.2.133';
import { huntOf } from '../../session/hunt-sections.js?v=0.2.133';
import { partyMembershipOf } from '../../session/party-sections.js?v=0.2.133';
import { nameOf } from '../../session/item-sections.js?v=0.2.133';
import { text, cls, attr, prop, rows } from '../../render/paint.js?v=0.2.133';
import { localWhen } from '../../render/format.js?v=0.2.133';
import { t } from '../../render/player-text.js?v=0.2.133';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.133';
import { runIntent } from '../intent-words.js?v=0.2.133';
import { floorList } from '../tower-words.js?v=0.2.133';
import { chestHtml, patchChest, actChest } from './tower-chest.js?v=0.2.133';

const TABS = Object.freeze(['climb', 'chest']);
const STORY = Object.freeze(['tower.story_1', 'tower.story_2', 'tower.story_3', 'tower.story_4', 'tower.story_5']);
const SCRATCH = new WeakMap();
/* Display scratch per CharacterSession: the tab, the story shown, the floor picked (null: the highest the server lists), the chest's. */
export const scratchOf = (cs) => {
  let s = SCRATCH.get(cs);
  if (!s) { s = { tab: 'climb', story: false, floor: null, key: null, pending: false, msg: '', result: null }; SCRATCH.set(cs, s); }
  return s;
};

/** The floor Enter starts on: the one picked here while the server still lists it, else the highest it lists, else null. Pure. */
export function floorPicked(sc, tw) {
  if (!tw || !tw.starts.length) return null;
  return sc.floor !== null && tw.starts.includes(sc.floor) ? sc.floor : tw.starts[tw.starts.length - 1];
}

/** Why Enter is off now, said above it, or '' when the server is to judge. Only what the screen already knows from the server's record. */
export function enterBlock(cs, tw, floor) {
  const name = nameOf(cs) || t('training.your_hero');
  const h = huntOf(cs);
  if (h && !h.ended) return t(h.huntId === tw.hunt ? 'tower.off_climbing' : 'tower.off_hunting', { name });
  if (partyMembershipOf(cs)) return t('tower.off_party');
  if (floor === null || !tw.starts.includes(floor)) return t('tower.off_pick');
  return '';
}

const serverNow = (cs) => { const v = typeof cs.serverNow === 'function' ? cs.serverNow() : null; return Number.isFinite(v) ? v : Date.now(); };

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
    + '<ul class="tt-sum"><li class="tt-sum-climb">' + esc(t('tower.sum_climb')) + '</li><li>' + esc(t('tower.sum_hunt')) + '</li>'
    + '<li class="tt-sum-death"></li><li class="tt-sum-keys"></li><li>' + esc(t('tower.sum_chest')) + '</li><li>' + esc(t('tower.sum_xp')) + '</li></ul>'
    + '<p class="hs-note tt-xp"></p>'
    + '<h3 class="hs-sub">' + esc(t('tower.start_head')) + '</h3>'
    + '<div class="tt-starts" role="radiogroup" aria-label="' + esc(t('tower.start_head')) + '"></div>'
    + '<p class="hs-note tt-start-note"></p>'
    + '<p class="tt-line tt-best"></p><p class="tt-line tt-week"></p><p class="tt-line tt-open"></p><p class="tt-line tt-next"></p>'
    + '<p class="hs-note tt-resets"></p><p class="hs-note tt-limits"></p>'
    /* the floor Enter starts on stands beside it: the picks may be scrolled away */
    + '<div class="tt-foot"><p class="tt-start-on"></p><p class="hw-why tt-off-why"></p>'
    + '<button type="button" class="hh-tool is-primary tt-go" data-hs-act="tower-enter">' + esc(t('controls.enter')) + '</button></div>'
    + '</section>'
    + '<section class="hw-pane tt-pane" data-pane="chest">' + chestHtml() + '</section>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

/* The floors the server lists, as radio buttons: the picked one gold, each a landing's floor after it. */
function patchStarts(host, tw, picked, pending) {
  rows(host, tw.starts.map((f) => ({ f })), {
    key: (r) => String(r.f),
    build: () => { const b = host.ownerDocument.createElement('button'); b.type = 'button'; b.className = 'tt-start'; b.setAttribute('role', 'radio');
      b.setAttribute('data-hs-act', 'floor'); return b; },
    patch: (b, r) => {
      attr(b, 'data-floor', String(r.f));
      attr(b, 'aria-checked', String(r.f === picked));
      prop(b, 'disabled', pending);
      text(b, String(r.f));
    },
  });
}

/* THE CLIMB TAB, every line from the section. */
function patchClimb(root, cs, tw, sc) {
  const name = nameOf(cs) || t('training.your_hero');
  const run = tw.run;
  const now = root.querySelector('.tt-now');
  prop(now, 'hidden', !run);
  text(now, run ? t(run.floor !== null ? 'tower.run_now' : 'tower.run_ready', { name, floor: run.floor !== null ? run.floor : run.start }) : '');
  const free = !!(tw.pays && tw.pays.deathLossPm === 0);
  const death = root.querySelector('.tt-sum-death');
  prop(death, 'hidden', !free);
  text(death, free ? t('tower.sum_death') : '');
  text(root.querySelector('.tt-sum-keys'), t('tower.sum_keys', { every: tw.rules.landingEvery, keys: Math.floor(tw.rules.weekBack / tw.rules.landingEvery) }));
  text(root.querySelector('.tt-xp'), tw.pays ? t('tower.xp_rule', { pct: tw.pays.xpPm / 10 }) : '');
  const floor = floorPicked(sc, tw);
  patchStarts(root.querySelector('.tt-starts'), tw, floor, sc.pending);
  text(root.querySelector('.tt-start-note'), tw.starts.length ? t('tower.start_note', { first: tw.starts[0] }) : '');
  text(root.querySelector('.tt-best'), tw.bestFloor > 0 ? t('tower.best', { floor: tw.bestFloor }) : t('tower.best_none'));
  const n = tw.landings.length;
  text(root.querySelector('.tt-week'), n === 0 ? t('tower.week_none') : n === 1 ? t('tower.week_taken_one') : t('tower.week_taken', { count: n }));
  text(root.querySelector('.tt-open'), tw.open.length ? t('tower.week_open', { list: floorList(tw.open) }) : '');
  const nextKey = tw.nextLanding !== null ? keyForLanding(tw, tw.nextLanding) : null;
  text(root.querySelector('.tt-next'), nextKey ? t('tower.week_next', { floor: tw.nextLanding, key: nextKey.name || '' }) : '');
  text(root.querySelector('.tt-resets'), tw.weekEndsAt !== null ? t('tower.week_resets', { when: localWhen(tw.weekEndsAt, serverNow(cs), true) }) : '');
  text(root.querySelector('.tt-limits'), t('tower.limits', { floor: tw.rules.floorLimitMs / 60000, landing: tw.rules.landingLimitMs / 60000 }));
  const block = enterBlock(cs, tw, floor);
  text(root.querySelector('.tt-start-on'), !block && floor !== null ? t('tower.start_on', { floor }) : '');
  const go = root.querySelector('.tt-go');
  prop(go, 'disabled', sc.pending || !!block);
  attr(go, 'data-off-why', block || null);
  attr(go, 'data-floor', floor === null ? null : String(floor));
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
  if (ev.type !== 'click') return false;
  const cs = ctx.character;
  if (!cs) return false;
  const sc = scratchOf(cs);
  const repaint = () => ctx.refresh('tower');
  const tw = towerOf(cs);
  if (!tw) return false;
  if (action === 'tab') { const id = el.getAttribute('data-tab'); if (TABS.includes(id)) { sc.tab = id; sc.msg = ''; body.scrollTop = 0; repaint(); } return true; }
  if (action === 'story') { sc.story = !sc.story; repaint(); return true; }
  if (action === 'floor') { const f = Number(el.getAttribute('data-floor')); if (tw.starts.includes(f)) { sc.floor = f; sc.msg = ''; repaint(); } return true; }
  if (actChest(ctx, cs, tw, sc, action, el, repaint)) return true;
  if (sc.pending || !ctx.account) return false;
  if (action === 'tower-enter') {
    const floor = floorPicked(sc, tw);
    if (enterBlock(cs, tw, floor)) { repaint(); return true; }
    runIntent(sc, repaint, () => startClimb(ctx.account, cs, floor), t('tower.busy_start'),
      () => t('tower.started', { name: nameOf(cs) || t('training.your_hero') }), cs);
    return true;
  }
  return false;
};
