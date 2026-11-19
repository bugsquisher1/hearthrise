// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/tower-catacombs.js — THE UNMARKED CATACOMBS: THE TOWER WINDOW'S CATACOMBS TAB (the wings, the vault doors, the descent's
// boards, the keys, Enter).
//
// The design of record: docs/planning/PRIORITY_BOARD.md "2026-11-16 The Unmarked Catacombs descent" (Tyler 2026-11-16: their "OWN game mode
// like the Burning Tower", a WING picked before the run, keys to the SAME Hearth Chest, "Catacombs, Deepest" alone and in a party; §3 "A
// Catacombs tab with two wing cards and the start door"). The server half is 2027-05-08-catacombs.sql: the `catacomb` section
// (src/session/catacomb-sections.js) and hr_catacomb_start. The tab exists only while the server sends that section (the `unmarked_catacombs`
// switch): with it off, tower.js draws no tab and nothing here runs.
//   THE WINGS: one slot a wing the server lists, its key's icon, its name and the hero's deepest room in it; the one picked is the one Enter
//   sends (the press, else the wing the server says ran last, else the first).
//   THE VAULT DOORS, top to bottom: the entrance (room 1), then a door every `door_every` rooms with the key it gives in this wing (the
//   server's own key rows), to two doors past the deepest reached. A door the record reaches is a press that picks the start after it (the
//   wing's checkpoints, the ONE list the server checks); the picked one says Start, the first past the best says Next key; one past the
//   record is dim and no press. The Start Room select on the foot is the same pick.
//   THE COLUMN: Deepest Room and the two boards' places (Rank alone, Party Rank), the keys (every family's week, the Catacomb keys held, a
//   press opens the Chest tab on one), the last descent, the party's deepest rooms, what a descent pays, Before entering, and the foot.
// Every number is the section's (CLAUDE.md §1, §6): the tab works none out and sends only the wing id and the picked checkpoint. Enter is off,
// and says why above it, for what the screen already knows (a hunt, a seat that does not lead, the door's Level from the section's `gate`
// with each seat under it, a wing or a door the server did not list); the server still judges, and a refusal re-reads the character.
// ════════════════════════════════════════════════════════════════════════
import { catacombOf, wingRow, keyForDoor } from '../../session/catacomb-sections.js?v=0.2.140';
import { startDescent } from '../../session/tower-intents.js?v=0.2.140';
import { huntOf } from '../../session/hunt-sections.js?v=0.2.140';
import { partyMembershipOf } from '../../session/party-sections.js?v=0.2.140';
import { nameOf } from '../../session/item-sections.js?v=0.2.140';
import { runRulesOf } from '../../data/tower.js?v=0.2.140';
import { PIXEL_DIR } from '../../data/item-art.js?v=0.2.140';
import { text, cls, attr, prop, rows, element } from '../../render/paint.js?v=0.2.140';
import { whole } from '../../render/format.js?v=0.2.140';
import { t } from '../../render/player-text.js?v=0.2.140';
import { busyWords } from '../training-words.js?v=0.2.140';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.140';
import { runIntent } from '../intent-words.js?v=0.2.140';
import { rankWords, keyFamilyWord } from '../tower-words.js?v=0.2.140';
import { itemName } from '../widgets/bits.js?v=0.2.140';
import { afterHtml } from './hunt-after-pane.js?v=0.2.140';

/* the column's label rows, in order: [id, label row] (each value filled from the section, a row the server does not say hidden) */
const STATS = Object.freeze([['xp', 'tower.stat_xp'], ['death', 'tower.stat_death'], ['uses', 'tower.stat_uses'], ['time', 'tower.stat_time'],
  ['door', 'catacomb.door_time'], ['party', 'tower.stat_party']]);
/* doors drawn past the deepest one reached: the next key's and one more */
const DOORS_PAST = 2;

/** The wing Enter sends: the one pressed while the server lists it, else the descent running's, else the wing that ran last, else the first.
    Pure. */
export function wingPicked(sc, cat) {
  if (!cat) return null;
  return wingRow(cat, sc.wing) || (cat.run && wingRow(cat, cat.run.wing)) || wingRow(cat, cat.lastWing) || cat.wings[0];
}

/** The vault door a descent on wing `w` starts after: the one picked here while the server still lists it, else the one its last descent
    started after (the design: "the pick is remembered for each wing"), else the deepest the server lists, else null. Pure. */
export function doorPicked(sc, w) {
  if (!w || !w.checkpoints.length) return null;
  const picked = sc.doors ? sc.doors[w.wing] : undefined;
  if (Number.isSafeInteger(picked) && w.checkpoints.includes(picked)) return picked;
  if (w.lastStart !== null && w.checkpoints.includes(w.lastStart)) return w.lastStart;
  return w.checkpoints[w.checkpoints.length - 1];
}

/** Why Enter is off now, said above it, or '' when the server is to judge. Only what the screen already knows from the server's record. */
export function descentBlock(cs, cat, w, door) {
  const h = huntOf(cs);
  if (h && !h.ended) { const run = runRulesOf(h.huntId); return run && run.family === 'catacomb' ? t('catacomb.off_descending') : busyWords(cs, t('tower.off_hunting')); }
  /* a party descends together on its leader's press (hr_catacomb_start: every seat or none, from its lowest seat's checkpoints) */
  const party = partyMembershipOf(cs);
  if (party && !party.isLeader) return t('tower.off_leader');
  /* THE DOOR'S LEVEL: the section's gate, this hero's and every seat's (`ok`); none from the server is locked, never guessed open */
  if (!cat.gate) return t('tower.off_checking');
  if (!cat.gate.ok) return t('tower.off_level', { level: cat.gate.need });
  if (!w) return t('catacomb.off_wing');
  if (!w.checkpoints.length) return t('catacomb.off_no_start');
  if (door === null || !w.checkpoints.includes(door)) return t('catacomb.off_pick');
  return '';
}

/** The pane's skeleton (inside the Tower window, built once). */
export function catacombHtml() {
  return '<p class="tt-now tk-now" hidden></p>'
    + '<div class="tk-wings" role="radiogroup" aria-label="' + esc(t('catacomb.wings_head')) + '"></div>'
    + '<div class="tk-body">'
    + '<section class="tk-doors-box"><h3 class="hw-hd-h tt-hd">' + esc(t('catacomb.doors_head')) + '</h3><div class="tk-doors"></div></section>'
    + '<div class="tt-side tk-side">'
    + '<section class="tt-box"><h3 class="hw-hd-h tt-hd">' + esc(t('catacomb.best_head')) + '</h3>'
    + '<p class="tt-best"><b class="tt-big tk-big"></b>'
    + '<span class="tt-rank tk-rank" data-board="solo" hidden><span class="tt-k">' + esc(t('catacomb.rank_solo')) + '</span><b class="tt-v"></b></span>'
    + '<span class="tt-rank tk-rank" data-board="party" hidden><span class="tt-k">' + esc(t('catacomb.rank_party')) + '</span><b class="tt-v"></b></span></p></section>'
    + '<section class="tt-box tk-keys-box"><h3 class="hw-hd-h tt-hd">' + esc(t('catacomb.keys_head')) + '</h3><div class="tk-fams"></div>'
    + '<div class="tk-keys"></div></section>'
    + '<section class="tt-box tk-last-box" hidden><h3 class="hw-hd-h tt-hd">' + esc(t('catacomb.last_head')) + '</h3><div class="tt-rows tk-last"></div></section>'
    + '<section class="tt-box tk-party-box" hidden><h3 class="hw-hd-h tt-hd">' + esc(t('catacomb.party_head')) + '</h3><div class="tt-rows tk-party"></div></section>'
    + '<section class="tt-box tk-rules-box"><h3 class="hw-hd-h tt-hd">' + esc(t('catacomb.descent_head')) + '</h3><div class="tt-rows">'
    + STATS.map(([id, key]) => '<div class="tt-row" data-row="' + id + '"><span class="tt-k">' + esc(t(key)) + '</span><span class="tt-v"></span></div>').join('')
    + '</div></section>'
    /* Before entering stands IN the foot, over the Start Room (2026-11-18 shots: in the column it scrolled under the foot, clipped
       mid-line), so what the bar buys is read whole beside the press it is for */
    + '<div class="tt-foot tk-foot"><section class="tk-before-box"><h3 class="hw-hd-h tt-hd">' + esc(t('hunts.head_before')) + '</h3>'
    + '<ul class="hw-before tk-before"></ul></section>'
    /* WHEN THE HUNT ENDS under it (the designer, 2026-11-18: a descent's end runs the hero's plan as a hunt's does, so the door shows it;
       ./hunt-after-pane.js, patched and sent by tower.js) */
    + afterHtml() + '<label class="tt-start-row"><span class="tt-k">' + esc(t('catacomb.start_head')) + '</span>'
    + '<select class="hh-select tk-start-pick" data-hs-act="cat-door"></select></label>'
    + '<p class="hw-why tk-off-why"></p><ul class="hw-before tk-gate"></ul>'
    + '<button type="button" class="hh-tool is-primary tk-go" data-hs-act="cat-enter">' + esc(t('controls.enter')) + '</button></div>'
    + '</div></div>';
}

/* A label row of a box: its value, or hidden when the server does not say it. */
function stat(root, id, value) {
  const row = root.querySelector('.tk-rules-box .tt-row[data-row="' + id + '"]');
  prop(row, 'hidden', !value);
  text(row.querySelector('.tt-v'), value || '');
}

/* label rows built from [{ id, k, v }] (the last descent's, the party's) */
function labelRows(host, list) {
  rows(host, list, {
    key: (r) => r.id,
    build: () => element(host.ownerDocument, '<div class="tt-row"><span class="tt-k"></span><span class="tt-v"></span></div>'),
    patch: (d, r) => { text(d.querySelector('.tt-k'), r.k); text(d.querySelector('.tt-v'), r.v); },
  });
}

/* THE WINGS: one slot a wing, the key its next door gives, its name and the hero's deepest room in it; the picked gold. */
function patchWings(host, cat, picked, pending) {
  rows(host, cat.wings, {
    key: (w) => w.wing,
    build: (w) => element(host.ownerDocument, '<button type="button" class="tk-wing" role="radio" data-hs-act="cat-wing" data-wing="' + esc(w.wing) + '">'
      + '<img class="tk-wing-ico" alt="" width="32" height="32" decoding="async"><span class="tk-wing-words"><b class="tk-wing-name"></b>'
      + '<span class="tk-wing-best"></span></span></button>'),
    patch: (b, w) => {
      const k = keyForDoor(cat, w, (Math.floor(w.best / cat.rules.doorEvery) + 1) * cat.rules.doorEvery);
      const ico = b.querySelector('.tk-wing-ico');
      prop(ico, 'hidden', !k);
      if (k) attr(ico, 'src', PIXEL_DIR + k.item + '.png');
      text(b.querySelector('.tk-wing-name'), w.name);
      text(b.querySelector('.tk-wing-best'), w.best > 0 ? t('catacomb.wing_best', { room: whole(w.best) }) : t('catacomb.wing_none'));
      attr(b, 'aria-checked', String(!!picked && w.wing === picked.wing));
      prop(b, 'disabled', pending);
    },
  });
}

/* THE VAULT DOORS of the picked wing: the entrance, then every door to two past the deepest reached (never past the server's last room). */
function doorList(cat, w, door) {
  const every = cat.rules.doorEvery, reach = Math.max(w.best, w.record || 0, door || 0);
  const last = Math.min(Math.floor(cat.rules.roomTop / every) * every, (Math.floor(reach / every) + DOORS_PAST) * every);
  const out = [0];
  for (let d = every; d <= last; d += every) out.push(d);
  return out;
}
function patchDoors(host, cat, w, door, pending) {
  const next = (Math.floor(w.best / cat.rules.doorEvery) + 1) * cat.rules.doorEvery;
  rows(host, doorList(cat, w, door), {
    key: (d) => String(d),
    build: (d) => element(host.ownerDocument, '<button type="button" class="tk-door" data-hs-act="cat-door-pick" data-landing="' + d + '">'
      + '<span class="tk-door-well"><img class="tk-door-ico" alt="" width="32" height="32" decoding="async"></span>'
      + '<span class="tk-door-words"><span class="tk-door-l1"><b class="tk-door-room"></b><span class="tt-tag tk-door-tag"></span></span>'
      + '<span class="tk-door-key"></span></span></button>'),
    patch: (b, d) => {
      const k = d > 0 ? keyForDoor(cat, w, d) : null;
      const ico = b.querySelector('.tk-door-ico');
      prop(ico, 'hidden', !k);
      if (k) attr(ico, 'src', PIXEL_DIR + k.item + '.png');
      text(b.querySelector('.tk-door-room'), t('catacomb.door_room', { room: whole(d || 1) }));
      text(b.querySelector('.tk-door-key'), d === 0 ? t('catacomb.entrance') : k ? k.name || itemName(k.item) : '');
      const listed = w.checkpoints.includes(d), isPick = d === door, isNext = d === next;
      const tag = b.querySelector('.tk-door-tag');
      text(tag, isPick ? t('catacomb.door_start', { room: whole(d + 1) }) : isNext ? t('catacomb.door_next') : '');
      attr(tag, 'data-tone', isPick ? 'gold' : isNext ? 'steel' : null);
      prop(tag, 'hidden', !isPick && !isNext);
      cls(b, 'is-pick', isPick);
      cls(b, 'is-dark', !listed);
      prop(b, 'disabled', pending || !listed);
    },
  });
}

/* THE KEYS: every key family's week (the server's rows: opens left of the week, keys held of the account's limit), then each Catacomb key
   held, a press that opens the Chest tab on it. */
function patchKeys(root, cat) {
  const c = cat.chest;
  rows(root.querySelector('.tk-fams'), c ? c.families : [], {
    key: (f) => f.family,
    build: () => element(root.ownerDocument, '<div class="tk-fam"><b class="tk-fam-name"></b><span class="tk-fam-week"><span class="tt-k">'
      + esc(t('tower.opens_left')) + '</span><b class="tt-v"></b></span><span class="tk-fam-held"><span class="tt-k">' + esc(t('tower.held_head'))
      + '</span><b class="tt-v"></b></span></div>'),
    patch: (d, f) => {
      attr(d, 'data-family', f.family);
      text(d.querySelector('.tk-fam-name'), keyFamilyWord(f));
      text(d.querySelector('.tk-fam-week .tt-v'), t('tower.of', { count: whole(Math.max(0, f.maxWeek - f.openedWeek)), max: whole(f.maxWeek) }));
      prop(d.querySelector('.tk-fam-held'), 'hidden', f.held === null);
      text(d.querySelector('.tk-fam-held .tt-v'), f.held !== null ? t('tower.of', { count: whole(f.held), max: whole(f.maxHeld) }) : '');
    },
  });
  /* the Catacomb keys held: a key row whose ground is a wing the section lists */
  const held = c ? c.keys.filter((k) => k.heldAll > 0 && cat.wings.some((w) => w.hunt === k.ground)) : [];
  rows(root.querySelector('.tk-keys'), held, {
    key: (k) => k.key,
    build: (k) => element(root.ownerDocument, '<button type="button" class="tk-key" data-hs-act="cat-key" data-key="' + esc(k.key) + '">'
      + '<img class="tk-key-ico" src="' + esc(PIXEL_DIR + k.item + '.png') + '" alt="" width="32" height="32" decoding="async">'
      + '<span class="tk-key-words"><b class="tk-key-name"></b><span class="tk-key-sub"></span></span><span class="tk-key-open"></span></button>'),
    patch: (b, k) => {
      text(b.querySelector('.tk-key-name'), t('tower.end_key_count', { key: k.name || itemName(k.item), count: whole(k.heldAll) }));
      /* chest_not_ready said before the press: an armor key whose pieces are not in the chest yet */
      text(b.querySelector('.tk-key-sub'), k.ready ? '' : t('catacomb.not_ready'));
      text(b.querySelector('.tk-key-open'), t('catacomb.open_chest'));
    },
  });
}

/* THE LAST DESCENT as label rows (the section's `last`): the wing, the rooms cleared, the keys it dropped by kind, the ones the held limit
   kept back, and its place on the board when it ended. */
function lastRows(cat) {
  const l = cat.last;
  if (!l) return [];
  const w = wingRow(cat, l.wing);
  const out = [{ id: 'wing', k: t('catacomb.last_wing'), v: w ? w.name : '' },
    { id: 'rooms', k: t('catacomb.last_rooms'), v: l.top !== null ? t('catacomb.last_rooms_value', { from: whole(l.start), to: whole(l.top) }) : t('tower.none') }];
  const counts = new Map();
  for (const m of l.keys) counts.set(m.key, (counts.get(m.key) || 0) + 1);
  const words = [...counts].map(([key, n]) => { const k = cat.chest ? cat.chest.keys.find((x) => x.key === key) : null;
    return k ? t('tower.end_key_count', { key: k.name || itemName(k.item), count: whole(n) }) : ''; }).filter(Boolean);
  if (words.length) out.push({ id: 'keys', k: t('catacomb.last_keys'), v: words.join(', ') });
  if (l.withheld > 0) out.push({ id: 'withheld', k: t('catacomb.last_withheld'), v: t('catacomb.last_not_dropped', { count: whole(l.withheld) }) });
  if (l.board) out.push({ id: 'rank', k: t('catacomb.last_rank'), v: rankWords(l.board) });
  return out;
}

/** The Catacombs tab, every line from the section. `before` is the Tower window's Before entering reader (tower.js towerBeforeLines). */
export function patchCatacombs(pane, cs, cat, sc, before) {
  const w = wingPicked(sc, cat), door = doorPicked(sc, w);
  const name = nameOf(cs) || t('away.your_hero');
  const run = cat.run, runWing = run ? wingRow(cat, run.wing) : null;
  const now = pane.querySelector('.tk-now');
  prop(now, 'hidden', !run);
  text(now, run ? t(run.room !== null ? 'catacomb.run_now' : 'catacomb.run_ready', { name, wing: runWing ? runWing.name : '', room: whole(run.room !== null ? run.room : run.start) }) : '');
  patchWings(pane.querySelector('.tk-wings'), cat, w, sc.pending);
  if (w) {
    patchDoors(pane.querySelector('.tk-doors'), cat, w, door, sc.pending);
    /* the picked door brought into view once a showing */
    if (!sc.catScrolled) {
      const host = pane.querySelector('.tk-doors'), row = host.querySelector('.tk-door.is-pick');
      if (row && host.clientHeight > 0) { host.scrollTop = Math.max(0, row.offsetTop - host.offsetTop - host.clientHeight / 2); sc.catScrolled = true; }
    }
  }
  /* a wing never descended reads the Tower's empty mark, "—" (the game's, as the wing slot says it; 2026-11-18 phone review) */
  text(pane.querySelector('.tk-big'), w && w.best > 0 ? whole(w.best) : t('tower.best_none'));
  /* "Catacombs, Deepest": the hero's place alone and in a party (one board for both wings), each only when the server sends it */
  /* ...never beside a wing the hero has not descended (2026-11-18 shots: "None" next to "Rank #1" earned in the other wing) */
  const ranked = !!w && w.best > 0;
  for (const [board, f] of [['solo', cat.field.solo], ['party', cat.field.party]]) {
    const el = pane.querySelector('.tk-rank[data-board="' + board + '"]');
    prop(el, 'hidden', !f || !ranked);
    text(el.querySelector('.tt-v'), rankWords(f));
  }
  patchKeys(pane, cat);
  const last = lastRows(cat);
  prop(pane.querySelector('.tk-last-box'), 'hidden', !last.length);
  labelRows(pane.querySelector('.tk-last'), last);
  /* the party's other seats, each at its deepest room in the picked wing */
  const seats = w ? cat.party.map((p) => ({ id: 's' + (p.seat ?? p.name), k: p.name, v: p.best[w.wing] > 0 ? t('catacomb.party_room', { room: whole(p.best[w.wing]) }) : t('tower.none') })) : [];
  prop(pane.querySelector('.tk-party-box'), 'hidden', !seats.length);
  labelRows(pane.querySelector('.tk-party'), seats);
  const p = cat.pays;
  stat(pane, 'xp', p ? t('tower.xp_pct', { pct: p.xpPm / 10 }) : '');
  stat(pane, 'death', p && p.deathLossPm === 0 ? t('tower.none') : '');
  stat(pane, 'uses', p && p.stamina ? t('tower.uses_value') : '');
  stat(pane, 'time', t('catacomb.time_value', { room: cat.rules.roomLimitMs / 60000 }));
  stat(pane, 'door', t('catacomb.door_time_value', { room: cat.rules.doorLimitMs / 60000 }));
  /* in a party a descent starts where every seat has been: the server's own checkpoints, read from its lowest seat's record */
  stat(pane, 'party', partyMembershipOf(cs) && w && w.checkpoints.length ? t('catacomb.start_room', { room: whole(w.checkpoints[w.checkpoints.length - 1] + 1) }) : '');
  rows(pane.querySelector('.tk-before'), w ? before(cs, { hunt: w.hunt, run: cat.run }) : [], {
    key: (l) => l.id,
    build: () => { const li = pane.ownerDocument.createElement('li'); li.className = 'hw-before-line'; return li; },
    patch: (li, l) => { text(li, l.text); cls(li, 'is-short', l.short); },
  });
  const sel = pane.querySelector('.tk-start-pick');
  rows(sel, w ? w.checkpoints.map((l) => ({ l })) : [], {
    key: (r) => String(r.l),
    build: () => sel.ownerDocument.createElement('option'),
    patch: (o, r) => { attr(o, 'value', String(r.l)); text(o, t('catacomb.start_room', { room: whole(r.l + 1) })); },
  });
  prop(sel, 'value', door === null ? '' : String(door));
  prop(sel, 'disabled', sc.pending || !w || !w.checkpoints.length);
  const block = descentBlock(cs, cat, w, door);
  const go = pane.querySelector('.tk-go');
  prop(go, 'disabled', sc.pending || !!block);
  attr(go, 'data-off-why', block || null);
  attr(go, 'data-wing', w ? w.wing : null);
  attr(go, 'data-landing', door === null ? null : String(door));
  text(pane.querySelector('.tk-off-why'), block);
  /* while the door's Level holds Enter off, each seat under it by name and the server's Level ("Bran: Level 8") */
  const gate = cat.gate;
  const short = gate && !gate.ok && block === t('tower.off_level', { level: gate.need }) ? gate.short : [];
  rows(pane.querySelector('.tk-gate'), short, {
    key: (x) => x.name,
    build: () => { const li = pane.ownerDocument.createElement('li'); li.className = 'hw-before-line is-short'; return li; },
    patch: (li, x) => { text(li, t('tower.seat_level', { name: x.name, level: x.level })); },
  });
}

/* A start pick, from the select or a door pressed: only a checkpoint the server lists for the picked wing (anything else is ignored). */
function pickDoor(sc, w, value) {
  const l = Number(value);
  if (!w || !Number.isSafeInteger(l) || !w.checkpoints.includes(l)) return false;
  sc.doors = Object.assign({}, sc.doors, { [w.wing]: l });
  sc.msg = '';
  return true;
}

/** A press in the Catacombs tab; true when it was the tab's. */
export function actCatacomb(ctx, cs, sc, action, ev, el, repaint) {
  if (!['cat-wing', 'cat-door', 'cat-door-pick', 'cat-key', 'cat-enter'].includes(action)) return false;
  const cat = catacombOf(cs);
  if (!cat) return true;
  const w = wingPicked(sc, cat);
  if (action === 'cat-door') { if (ev.type === 'change' && pickDoor(sc, w, el.value)) repaint(); return true; }
  if (ev.type !== 'click') return true;
  if (action === 'cat-wing') {
    const next = wingRow(cat, el.getAttribute('data-wing'));
    if (!sc.pending && next) { sc.wing = next.wing; sc.msg = ''; sc.catScrolled = false; repaint(); }
    return true;
  }
  if (action === 'cat-door-pick') { if (!sc.pending && pickDoor(sc, w, el.getAttribute('data-landing'))) repaint(); return true; }
  /* a key held: the Chest tab on it (the chest is one; its keys are the server's rows) */
  if (action === 'cat-key') {
    const key = el.getAttribute('data-key');
    const k = cat.chest ? cat.chest.keys.find((x) => x.key === key && x.heldAll > 0) : null;
    if (k) { sc.tab = 'chest'; sc.fam = k.family; sc.key = k.key; sc.result = null; sc.msg = ''; repaint(); }
    return true;
  }
  if (sc.pending || !ctx.account) return true;
  const door = doorPicked(sc, w);
  if (descentBlock(cs, cat, w, door)) { repaint(); return true; }
  runIntent(sc, repaint, () => startDescent(ctx.account, cs, w.wing, door), t('catacomb.busy_start'),
    () => t('catacomb.started', { name: nameOf(cs) || t('away.your_hero') }), cs);
  return true;
}
