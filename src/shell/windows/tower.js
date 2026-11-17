// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/tower.js — THE BURNING TOWER: THE CLIMB DRAWN AS THE HEARTH'S CHIMNEY, AND THE HEARTH CHEST.
//
// The design of record: docs/planning/PRIORITY_BOARD.md "2026-11-14 The Burning Tower" (origin/lane/d-burning-tower) §2 how a climb runs,
// §5 (c) the chest's one menu, §8 the window's words; the look is direction A "The Chimney" (Tyler 2026-11-16, art/review/tower-mocks).
// The server half is 2027-04-24-tower-climb.sql, 2027-04-27-tower-chest.sql and 2027-04-28-tower-section.sql. The Great Hearth's tap opens it
// (src/data/world/stations.js), only while the server sends the `tower` section (its switch, src/data/shell-windows.js `section`); with the
// switch off the Hearth opens the bag as before and nothing here exists. One component: a docked window on a desktop, a slide-out sheet on
// a phone (the window manager's).
//
// TWO TABS. Climb: THE TOWER (../tower-stage.js: the chimney, a landing every 10th floor in its key's metal, the dark above the best, the
// heroes on it: you, your party, the field's rivals when the server sends a field) beside the column of labels (Best Floor, Next Key and
// its ticks, what a climb pays), and on the foot the Start Floor beside Enter. A start is picked by tapping a landing or in the Start Floor
// select, both the same pick, and both only the CHECKPOINTS the server lists (Tyler 2026-11-16: every landing up to the hero's best, a
// party's lowest seat's; the highest by default). Chest: ./tower-chest.js. The Story link shows Tyler's text. Every number is the section's
// (CLAUDE.md §1, §6): the window works none out and sends only the picked checkpoint. Enter is off, and says why above it, for what the
// screen already knows (a hunt, a seat that does not lead its party, a checkpoint the server did not list); the server still judges
// (hr_tower_start), and a refusal re-reads the character so the list on screen is the server's again.
// ════════════════════════════════════════════════════════════════════════
import { towerOf, keyForLanding } from '../../session/tower-sections.js?v=0.2.137';
import { startClimb } from '../../session/tower-intents.js?v=0.2.137';
import { huntOf } from '../../session/hunt-sections.js?v=0.2.137';
import { partyMembershipOf } from '../../session/party-sections.js?v=0.2.137';
import { nameOf } from '../../session/item-sections.js?v=0.2.137';
import { heroSprite } from '../../session/hero-look.js?v=0.2.137';
import { outfitSprite } from '../../data/hunt-outfits.js?v=0.2.137';
import { PIXEL_DIR } from '../../data/item-art.js?v=0.2.137';
import { text, cls, attr, prop, rows } from '../../render/paint.js?v=0.2.137';
import { whole } from '../../render/format.js?v=0.2.137';
import { t } from '../../render/player-text.js?v=0.2.137';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.137';
import { runIntent } from '../intent-words.js?v=0.2.137';
import { rankWords } from '../tower-words.js?v=0.2.137';
import { stageHtml, stageModel, patchStage, climbLabels, scrollToFloor } from '../tower-stage.js?v=0.2.137';
import { chestHtml, patchChest, actChest } from './tower-chest.js?v=0.2.137';

const TABS = Object.freeze(['climb', 'chest']);
const STORY = Object.freeze(['tower.story_1', 'tower.story_2', 'tower.story_3', 'tower.story_4', 'tower.story_5']);
/* the Climb column's label rows, in order: [id, label row] (each value is filled from the section, a row the server does not say hidden) */
const STATS = Object.freeze([['xp', 'tower.stat_xp'], ['death', 'tower.stat_death'], ['uses', 'tower.stat_uses'], ['time', 'tower.stat_time'],
  ['party', 'tower.stat_party']]);
const SCRATCH = new WeakMap();
/* Display scratch per CharacterSession: the tab, the story shown, the checkpoint picked (null: the highest the server lists), the stage
   brought to the hero once a showing, the re-read an opening owes (`stale`), the chest's. */
export const scratchOf = (cs) => {
  let s = SCRATCH.get(cs);
  if (!s) { s = { tab: 'climb', story: false, landing: null, scrolled: false, key: null, pending: false, msg: '', result: null, stale: false }; SCRATCH.set(cs, s); }
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

/** The heroes the tower shows: you (on the floor you climb now, else your best), your party's other seats at their bests, and the field's
    rivals when the server sends a field. Every floor the section's. Pure over the sections. */
function climbHeroes(cs, tw) {
  const party = partyMembershipOf(cs);
  const roleOf = (seat) => { const s = party ? party.seats.find((x) => x.seat === seat) : null; return s ? s.role : null; };
  const you = { who: 'you', name: nameOf(cs) || t('away.your_hero'), floor: tw.run && tw.run.floor !== null ? tw.run.floor : tw.bestFloor, sprite: heroSprite(cs) };
  const seats = tw.party.map((p) => ({ who: 'party', name: p.name, floor: p.floor, sprite: outfitSprite(p.outfit, roleOf(p.seat)) }));
  const field = tw.field ? tw.field.above.concat(tw.field.below).map((r) => ({ who: 'rival', name: r.name, floor: r.floor, sprite: outfitSprite(r.outfit, null) })) : [];
  return [you].concat(seats, field);
}

/** The skeleton (built once per opening). */
export function renderTower(ctx) {
  if (ctx && ctx.character) { const sc = scratchOf(ctx.character); sc.msg = ''; sc.result = null; sc.story = false; sc.scrolled = false; sc.stale = true; }
  return '<div class="tt-tower">'
    + '<div class="tt-top"><div class="hw-tabs" role="tablist">'
    + TABS.map((id, i) => '<button type="button" role="tab" class="hw-tab" data-hs-act="tab" data-tab="' + id + '" aria-selected="' + (i === 0) + '">'
      + esc(t('tower.tab_' + id)) + '</button>').join('')
    + '</div><button type="button" class="hh-tool tt-story-link" data-hs-act="story" aria-expanded="false">' + esc(t('tower.story_link')) + '</button></div>'
    + '<section class="tt-story" hidden>' + STORY.map((k) => '<p>' + esc(t(k)) + '</p>').join('') + '</section>'
    + '<section class="hw-pane tt-pane" data-pane="climb">'
    + '<p class="tt-now" hidden></p>'
    + '<div class="tt-climb">' + stageHtml('tt-climb-stage', true)
    + '<div class="tt-side">'
    + '<section class="tt-box tt-best-box"><h3 class="hw-hd-h tt-hd">' + esc(t('tower.best_head')) + '</h3>'
    + '<p class="tt-best"><b class="tt-big"></b><span class="tt-rank" hidden><span class="tt-k">' + esc(t('tower.rank')) + '</span><b class="tt-v"></b></span></p></section>'
    + '<section class="tt-box tt-next"><h3 class="hw-hd-h tt-hd">' + esc(t('tower.next_head')) + '</h3>'
    + '<div class="tt-next-row"><span class="tt-key-well"><img class="tt-key-ico" alt="" width="32" height="32" decoding="async"></span>'
    + '<span class="tt-next-words"><b class="tt-next-name"></b><span class="tt-next-floor"></span></span></div><div class="tt-pips" aria-hidden="true"></div></section>'
    + '<section class="tt-box tt-rules-box"><h3 class="hw-hd-h tt-hd">' + esc(t('tower.climb_head')) + '</h3><div class="tt-rows">'
    + STATS.map(([id, key]) => '<div class="tt-row" data-row="' + id + '"><span class="tt-k">' + esc(t(key)) + '</span><span class="tt-v"></span></div>').join('')
    + '</div></section>'
    /* the Start Floor stands on the foot beside Enter: the floor the press sends is never scrolled away from it */
    + '<div class="tt-foot"><label class="tt-start-row"><span class="tt-k">' + esc(t('tower.start_head')) + '</span>'
    + '<select class="hh-select tt-start-pick" data-hs-act="floor"></select></label>'
    + '<p class="hw-why tt-off-why"></p>'
    + '<button type="button" class="hh-tool is-primary tt-go" data-hs-act="tower-enter">' + esc(t('controls.enter')) + '</button></div>'
    + '</div></div></section>'
    + '<section class="hw-pane tt-pane" data-pane="chest">' + chestHtml() + '</section>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
}

/* The checkpoints the server lists, as the options of the Start Floor select, each said as the floor the climb starts on (the one after
   the landing; 0 is floor 1); the picked one selected, off while a press is out or the server lists none. */
function patchStarts(sel, tw, picked, pending) {
  rows(sel, tw.checkpoints.map((l) => ({ l })), {
    key: (r) => String(r.l),
    build: () => sel.ownerDocument.createElement('option'),
    patch: (o, r) => { attr(o, 'value', String(r.l)); text(o, t('tower.start_floor', { floor: r.l + 1 })); },
  });
  prop(sel, 'value', picked === null ? '' : String(picked));
  prop(sel, 'disabled', pending || !tw.checkpoints.length);
}

/* One label row of the Climb column: its value, or hidden when the server does not say it. */
function stat(root, id, value) {
  const row = root.querySelector('.tt-row[data-row="' + id + '"]');
  prop(row, 'hidden', !value);
  text(row.querySelector('.tt-v'), value || '');
}

/* NEXT KEY: the key the first landing past the best gives (the server's key row), its floor, and a tick a floor climbed toward it. */
function patchNext(root, tw) {
  const every = tw.rules.landingEvery, next = (Math.floor(tw.bestFloor / every) + 1) * every;
  const k = next <= tw.rules.floorTop ? keyForLanding(tw, next) : null;
  const box = root.querySelector('.tt-next');
  prop(box, 'hidden', !k);
  if (!k) return;
  attr(box.querySelector('.tt-key-ico'), 'src', PIXEL_DIR + k.item + '.png');
  text(box.querySelector('.tt-next-name'), k.name || '');
  text(box.querySelector('.tt-next-floor'), t('tower.start_floor', { floor: next }));
  const lit = tw.bestFloor - (next - every);
  rows(box.querySelector('.tt-pips'), Array.from({ length: every }, (_, i) => i), {
    key: (i) => String(i),
    build: () => root.ownerDocument.createElement('span'),
    patch: (el, i) => { attr(el, 'class', 'tt-pip' + (i < lit ? ' is-on' : '')); },
  });
}

/* THE CLIMB TAB, every line from the section. */
function patchClimb(root, cs, tw, sc) {
  const name = nameOf(cs) || t('away.your_hero');
  const run = tw.run;
  const now = root.querySelector('.tt-now');
  prop(now, 'hidden', !run);
  text(now, run ? t(run.floor !== null ? 'tower.run_now' : 'tower.run_ready', { name, floor: run.floor !== null ? run.floor : run.start }) : '');
  const landing = landingPicked(sc, tw);
  /* the tower: the heroes on it, every landing to a little past the highest of them, the picked one's Start, the next key's */
  const heroes = climbHeroes(cs, tw);
  const stage = root.querySelector('.tt-climb-stage');
  const m = stageModel(tw, { heroes, labels: climbLabels(tw, landing), ticks: true, run: null });
  patchStage(stage, m);
  if (!sc.scrolled) sc.scrolled = scrollToFloor(stage, m, Math.max(tw.bestFloor, landing === null ? 0 : landing));
  text(root.querySelector('.tt-big'), tw.bestFloor > 0 ? whole(tw.bestFloor) : t('tower.best_none'));
  const rank = root.querySelector('.tt-rank');
  prop(rank, 'hidden', !tw.field);
  text(rank.querySelector('.tt-v'), rankWords(tw.field));
  patchNext(root, tw);
  const p = tw.pays;
  stat(root, 'xp', p ? t('tower.xp_pct', { pct: p.xpPm / 10 }) : '');
  stat(root, 'death', p && p.deathLossPm === 0 ? t('tower.none') : '');
  stat(root, 'uses', p && p.stamina ? t('tower.uses_value') : '');
  stat(root, 'time', t('tower.time_value', { floor: tw.rules.floorLimitMs / 60000 }));
  /* in a party the climb starts where every seat has been: the server's own checkpoints, read from its lowest seat's record */
  stat(root, 'party', partyMembershipOf(cs) && tw.checkpoints.length ? t('tower.start_floor', { floor: tw.checkpoints[tw.checkpoints.length - 1] + 1 }) : '');
  patchStarts(root.querySelector('.tt-start-pick'), tw, landing, sc.pending);
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
  if (want && TABS.includes(want)) { sc.tab = want; sc.msg = ''; sc.story = false; }
  /* THE BOARD MOVES WITHOUT THIS HERO: another player's climb changes its rank and rivals, which only its own envelope states (QA gate
     2026-11-17: "Rank #2" stood until a reload). One re-read each opening, in town (a climb's own re-reads keep it fresh while it runs);
     the account's other heroes re-read when one of its climbs ends (src/session/account-session.js). */
  if (sc.stale) { sc.stale = false; const h = huntOf(cs); if (!(h && !h.ended) && typeof cs.load === 'function') cs.load(); }
  for (const b of root.querySelectorAll('.hw-tab')) attr(b, 'aria-selected', String(b.getAttribute('data-tab') === sc.tab));
  for (const p of root.querySelectorAll('.tt-pane')) cls(p, 'is-on', p.getAttribute('data-pane') === sc.tab);
  prop(root.querySelector('.tt-story'), 'hidden', !sc.story);
  attr(root.querySelector('.tt-story-link'), 'aria-expanded', String(sc.story));
  text(root.querySelector('.tt-story-link'), t(sc.story ? 'tower.story_hide' : 'tower.story_link'));
  if (sc.tab === 'climb') patchClimb(root, cs, tw, sc);
  else patchChest(root.querySelector('[data-pane="chest"]'), cs, tw, sc);
  text(root.querySelector('.hh-intent-msg'), sc.msg);
};

/* A pick, from the select or a landing tapped on the tower: only a checkpoint the server lists (anything else is ignored). */
function pick(sc, tw, value) {
  const l = Number(value);
  if (!Number.isSafeInteger(l) || !tw.checkpoints.includes(l)) return false;
  sc.landing = l; sc.msg = '';
  return true;
}

renderTower.act = function actTower(ctx, body, action, ev, el) {
  const cs = ctx.character;
  if (!cs) return false;
  const sc = scratchOf(cs);
  const repaint = () => ctx.refresh('tower');
  const tw = towerOf(cs);
  if (!tw) return false;
  if (action === 'floor') { if (ev.type === 'change') { pick(sc, tw, el.value); repaint(); } return true; }
  if (ev.type !== 'click') return false;
  if (action === 'floor-pick') { if (!sc.pending && pick(sc, tw, el.getAttribute('data-landing'))) repaint(); return true; }
  if (action === 'tab') {
    const id = el.getAttribute('data-tab');
    /* a tab press shows that tab: the Story folds away (QA gate 2026-11-17: it stayed drawn over Climb and Chest) */
    if (TABS.includes(id)) { sc.tab = id; sc.msg = ''; sc.story = false; sc.scrolled = false; body.scrollTop = 0; repaint(); }
    return true;
  }
  if (action === 'story') { sc.story = !sc.story; repaint(); return true; }
  if (actChest(ctx, cs, tw, sc, action, el, repaint)) return true;
  if (sc.pending || !ctx.account) return false;
  if (action === 'tower-enter') {
    const landing = landingPicked(sc, tw);
    if (enterBlock(cs, tw, landing)) { repaint(); return true; }
    runIntent(sc, repaint, () => startClimb(ctx.account, cs, landing), t('tower.busy_start'),
      () => t('tower.started', { name: nameOf(cs) || t('away.your_hero') }), cs);
    return true;
  }
  return false;
};
