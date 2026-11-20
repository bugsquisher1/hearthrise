// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/tower-chest.js — THE HEARTH CHEST: THE FIREBOX, THE KEYS BY METAL, STOKING, USE (the Tower window's Chest tab).
//
// The design's "One menu that shows all of it" (the board's "2026-11-14 The Burning Tower" §5 (c)), drawn as direction A (Tyler 2026-11-16):
// THE SCENE is the Great Hearth's firebox, its own fire burning, and THE CHEST ON THE LEDGE BESIDE IT, where the town map puts it (Tyler:
// "off to the side of the hearth on the ledge a bit so it doesn't block the flame"); a press's reveal plays where the chest sits
// (src/data/tower-art.js REVEAL_AT). The server half is 2027-04-27-tower-chest.sql: hr_chest_section's numbers (the `tower` section's
// `chest`), hr_chest_open and hr_chest_stoke_default.
//   THE KEYS, one slot a key row the server lists, in its metal (tools/world-art/tower-chest-icons.mjs): how many held and its weapon chance;
//   a key not held is dim and no press. The one picked is the one Use opens.
//   OPENS LEFT, an ember a chest this week (Tyler 2026-11-16 KEY FAMILIES: the cap is chests opened per family a week), and keys held
//   against the family's limit, both the server's family row (tower-sections.js familyOf). With no family row nothing is drawn or gated.
//   STOKE, one press a count (None and each row the server lists, with its Cinders): a press SAVES it (hr_chest_stoke_default) and
//   "Chance" is re-read from the server (chance_ppm at the saved stokes), so Use (hr_chest_open with p_stokes null: the saved default)
//   can only send what was on screen. The Cinders held and the Hearth's Warmth beside it.
//   Use spends one key, Use all as many as the server's own numbers allow (held, the press's cap, the key family's week). Both are off,
//   with why, while the hero is out, the key isn't held, its weapons aren't built, or the family's week of chests is used; the server
//   judges the rest. A key counts wherever the hero holds it: the bag, the account's Storage, the Key Ring.
//   THE CATACOMB KEYS (2027-05-08-catacombs.sql): the same chest opens them; with more than one key family listed, one press a family shows
//   its keys (a Catacomb key pressed in the Catacombs tab opens this tab on it). A Catacomb key finds ARMOR ("Armor chance", its helmets'
//   share on the tip, the piece's slot and weight in the loot, the reveal in its metal's strip); a key whose armor is not in the chest yet
//   (the server's `ready` false, its chest_not_ready) says "Armor coming soon" on its slot and on Use. The warmth is its family's own.
// The answer of a press (each key's weapon or none, what came out) is drawn from the server's answer; the counts come back with the envelope.
// ════════════════════════════════════════════════════════════════════════
import { keyRow, stokeRow, familyRow } from '../../session/tower-sections.js?v=0.2.143';
import { openChest, saveStokes } from '../../session/tower-intents.js?v=0.2.143';
import { huntOf } from '../../session/hunt-sections.js?v=0.2.143';
import { CHESTS, CINDERS, TOWER_KEY_FAMILY } from '../../data/chests.js?v=0.2.143';
import { PIXEL_DIR } from '../../data/item-art.js?v=0.2.143';
import { TOWER_ART, SCALE } from '../../data/tower-art.js?v=0.2.143';
import { text, attr, prop, rows, cls, element } from '../../render/paint.js?v=0.2.143';
import { whole, localWhen } from '../../render/format.js?v=0.2.143';
import { t } from '../../render/player-text.js?v=0.2.143';
import { busyWords } from '../training-words.js?v=0.2.143';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.143';
import { runIntent } from '../intent-words.js?v=0.2.143';
import { itemName, revealInWindow } from '../widgets/bits.js?v=0.2.143';
import { ppmWords, familyWord, keyFamilyWord, timesWords, lootList } from '../tower-words.js?v=0.2.143';
import { metalWord } from '../tower-stage.js?v=0.2.143';

/* The one chest today (src/data/chests.js CHESTS: a later chest is a row). */
const CHEST_ID = Object.keys(CHESTS)[0];

/** THE KEY FAMILY SHOWN (2027-05-08-catacombs.sql: the chest lists every family whose switch is on): with one family, null (every key
    shows); with more, the one pressed while the server still lists it, else the picked key's, else the first with a key held, else the
    first. Pure over the server's rows. */
export function familyShown(sc, tw) {
  const fams = tw && tw.chest ? tw.chest.families : [];
  if (fams.length < 2) return null;
  const listed = (id) => (fams.some((f) => f.family === id) ? id : null);
  const held = tw.chest.keys.filter((k) => k.heldAll > 0);
  const key = tw.chest.keys.find((k) => k.key === sc.key);
  return listed(sc.fam) || (key && listed(key.family)) || (held[0] && listed(held[0].family)) || fams[0].family;
}

/** The key rows the pane shows: the shown family's (every row with one family), in the server's order. Pure. */
const shownKeys = (sc, tw) => { const f = familyShown(sc, tw); return tw && tw.chest ? tw.chest.keys.filter((k) => f === null || k.family === f) : []; };

/** The key the panel shows: the one picked (or last used), held or not, else the first held, else null (of the family shown). A
    picked key that ran out STAYS picked with Use off (useBlock): a press never spends a key the player did not choose (the
    full-game sweep's A20: a stale tab spent a Bronze key while it showed Silver picked). Pure. */
export function keyPicked(sc, tw) {
  const keys = shownKeys(sc, tw);
  return keys.find((k) => k.key === sc.key) || keys.find((k) => k.heldAll > 0) || null;
}

/** The metal a key's art is drawn in (the reveal's strips are the Tower's four): a Tower key's own id, another family's the Tower row at
    the same door (the Catacomb keys' doors are the Tower's, src/data/chests.js `from`), or null. Pure over the server's rows. */
export function metalOfKey(tw, k) {
  if (!k) return null;
  if (k.family === TOWER_KEY_FAMILY) return k.key;
  const t0 = tw && tw.chest ? tw.chest.keys.find((x) => x.family === TOWER_KEY_FAMILY && x.from === k.from) : null;
  return t0 ? t0.key : null;
}

const serverNow = (cs) => { const v = cs && typeof cs.serverNow === 'function' ? cs.serverNow() : null; return Number.isFinite(v) ? v : Date.now(); };

/** How many keys Use all spends: the held count, the press's cap and what's left of the key family's week (when the server sends the
    family), by the server's numbers; 0 when the press's cap is unknown. Pure. */
export function useAllCount(tw, k) {
  const c = tw && tw.chest;
  if (!c || !k || c.perCall === null) return 0;
  let n = Math.min(k.heldAll, c.perCall);
  const f = familyRow(tw, k);
  if (f) n = Math.min(n, f.maxWeek - f.openedWeek);
  return Math.max(0, n);
}

/** Why Use is off now, said above it, or '' when the server is to judge. Pure over the server's record. */
export function useBlock(cs, tw, k) {
  const c = tw && tw.chest;
  if (!c || !k || k.heldAll < 1) return t('tower.off_no_key');
  const h = huntOf(cs);
  if (h && !h.ended) return busyWords(cs, t('tower.off_hunting'));
  if (!k.ready) return k.gear === 'armor' ? t('catacomb.not_ready') : t('tower.not_ready');
  const f = familyRow(tw, k);
  if (f && f.openedWeek >= f.maxWeek) return t('tower.off_week', { max: f.maxWeek });
  return '';
}

/* THE SCENE's places, from the art's one source (src/data/tower-art.js) as custom properties src/styles/tower.css lays out at x2. */
const px = (v) => v * SCALE + 'px';
const SCENE_VARS = (() => {
  const { FIREBOX: B, FIRE_AT: F, CHEST_AT: C, SMOKE_AT: S, REVEAL_AT: R, ITEM_AT: I, PHONE_VIEW: P } = TOWER_ART;
  const ms = (frames, fps) => Math.round(1000 * frames / fps) + 'ms';
  return [`--tr-sw:${px(B.w)}`, `--tr-sh:${px(B.h)}`, `--tr-fx:${px(F.x)}`, `--tr-fy:${px(F.y)}`, `--tr-fw:${px(F.w)}`, `--tr-fh:${px(F.h)}`,
    `--tr-fn:${F.frames}`, `--tr-fms:${ms(F.frames, F.fps)}`, `--tr-cx:${px(C.x)}`, `--tr-cy:${px(C.y)}`, `--tr-cw:${px(C.w)}`, `--tr-ch:${px(C.h)}`,
    `--tr-cn:${C.frames}`, `--tr-cms:${ms(C.frames, C.fps)}`,
    `--tr-kx:${px(S.x)}`, `--tr-ky:${px(S.y)}`, `--tr-kw:${px(S.w)}`, `--tr-kh:${px(S.h)}`, `--tr-rx:${px(R.x)}`, `--tr-ry:${px(R.y)}`, `--tr-rw:${px(R.w)}`, `--tr-rh:${px(R.h)}`,
    `--tr-ix:${px(I.x)}`, `--tr-iy:${px(I.y)}`, `--tr-pvx:${px(P.x)}`, `--tr-pvy:${px(P.y)}`, `--tr-pvw:${px(P.w)}`, `--tr-pvh:${px(P.h)}`].join(';');
})();

/** The pane's skeleton (inside the Tower window, built once). */
export function chestHtml() {
  /* the chest on the ledge as the town shows it: the chest, its smoke (lane/fix138-hearth-chest-big; its green at its locks, lane/a-chest-glow-139) */
  return '<div class="tc-scene" style="' + SCENE_VARS + '" aria-hidden="true"><div class="tc-scene-art"><span class="tc-fire"></span>'
    + '<span class="tc-chest"></span><span class="tc-smoke"></span>'
    + '<div class="tc-reveal-slot"></div></div></div>'
    /* the last press's answer under the scene, in place of the keys and the stokes: what came out, the weapon first (Keys goes back) */
    + '<section class="tt-result" hidden><div class="tc-loot-head"><h3 class="hw-hd-h tt-hd">' + esc(t('tower.loot_head')) + '</h3>'
    + '<button type="button" class="hh-tool is-link tc-keys-back" data-hs-act="chest-keys">' + esc(t('tower.keys_head')) + '</button></div>'
    + '<p class="tc-used" hidden></p><div class="tc-loot"></div></section>'
    /* the key families, one press each, while the server lists more than one (the Tower's and the Catacombs') */
    + '<div class="tc-famp" role="radiogroup" aria-label="' + esc(t('tower.keys_head')) + '" hidden></div>'
    + '<div class="tc-keys" role="radiogroup" aria-label="' + esc(t('tower.keys_head')) + '"></div>'
    + '<p class="tt-line tc-none" hidden></p>'
    + '<div class="tc-fams"></div>'
    + '<section class="tc-stoke-box" hidden><h3 class="hw-hd-h tt-hd">' + esc(t('tower.stoke_head')) + '</h3>'
    + '<div class="tc-stoke-row"><div class="tc-stokes" role="radiogroup" aria-label="' + esc(t('tower.stoke_head')) + '"></div>'
    + '<p class="tc-chance"><span class="tt-k">' + esc(t('tower.chance_head')) + '</span><b class="tc-chance-v"></b></p></div>'
    + '<p class="hs-note tc-stoke-short" hidden></p></section>'
    + '<div class="tc-meta" hidden><p class="tc-cinders"><span class="tt-k"></span><b class="tt-v"></b></p><p class="tc-hand"><b class="tt-v"></b></p>'
    + '<p class="tc-warm"><span class="tt-k">' + esc(t('tower.warm_head')) + '</span><b class="tt-v"></b></p></div>'
    + '<p class="hs-note tc-resets"></p>'
    + '<div class="tt-foot tc-foot"><p class="hw-why tc-off-why"></p><div class="tc-uses">'
    + '<button type="button" class="hh-tool is-primary tc-use" data-hs-act="chest-use">' + esc(t('controls.use')) + '</button>'
    + '<button type="button" class="hh-tool tc-use-all" data-hs-act="chest-use-all">' + esc(t('controls.use_all')) + '</button></div></div>';
}

/* THE KEY FAMILIES: one press a family the server lists (its own name, "Catacomb Keys"), the shown one picked; none with one family. */
function patchFamilyPicks(host, tw, shown, pending) {
  const fams = shown === null || !tw.chest ? [] : tw.chest.families;
  prop(host, 'hidden', !fams.length);
  rows(host, fams, {
    key: (f) => f.family,
    build: (f) => element(host.ownerDocument, '<button type="button" class="tc-stoke tc-fam-pick" role="radio" data-hs-act="chest-fam" data-fam="' + esc(f.family) + '"></button>'),
    patch: (b, f) => { text(b, keyFamilyWord(f)); attr(b, 'aria-checked', String(f.family === shown)); prop(b, 'disabled', pending); },
  });
}

/* THE KEYS: one slot a key row the server lists (of the family shown), its metal's icon, how many held and its weapon or armor chance;
   held keys press, the picked gold. */
function patchKeys(host, tw, keys, picked, pending) {
  rows(host, keys, {
    key: (k) => k.key,
    build: (k) => element(host.ownerDocument, '<button type="button" class="tc-pick" role="radio" data-hs-act="chest-key" data-key="' + esc(k.key) + '">'
      + '<img class="tc-pick-ico" src="' + esc(PIXEL_DIR + k.item + '.png') + '" alt="" width="32" height="32" decoding="async">'
      + '<span class="tc-pick-words"><b class="tc-pick-name"></b><span class="tc-pick-sub"><b class="tc-pick-n"></b><span class="tc-pick-pct"></span></span></span></button>'),
    patch: (b, k) => {
      const held = k.heldAll > 0;
      attr(b, 'aria-checked', String(!!picked && k.key === picked.key));
      prop(b, 'disabled', pending || !held);
      cls(b, 'is-none', !held);
      text(b.querySelector('.tc-pick-name'), metalWord(k));
      text(b.querySelector('.tc-pick-n'), t('tower.count', { count: whole(k.heldAll) }));
      /* a Catacomb key finds armor (2027-05-08-catacombs.sql), a Tower key a weapon: the same base chance, named for what it finds */
      const pct = k.basePm !== null ? ppmWords(k.basePm * 1000) : null;
      /* an armor key whose pieces are not in the chest yet (chest_not_ready: a later tier or wing until its pieces ship) says so on its slot */
      const soon = k.gear === 'armor' && !k.ready;
      text(b.querySelector('.tc-pick-pct'), soon ? t('catacomb.not_ready') : pct === null ? '' : k.gear === 'armor' ? t('catacomb.armor_chance', { pct }) : t('tower.weapon_chance', { pct }));
      attr(b, 'aria-label', (k.name || itemName(k.item)) + ': ' + whole(k.heldAll));
    },
  });
}

/* Each key family's week, the server's rows in its order: its name (only when it lists more than one), an ember a chest left this week
   and the count, and keys held against the limit when it sends them. */
function patchFamilies(host, families) {
  const named = families.length > 1;
  rows(host, families, {
    key: (f) => f.family,
    build: () => element(host.ownerDocument, '<div class="tc-fam"><h4 class="tc-fam-name"></h4><p class="tc-fam-week"><span class="tt-k">'
      + esc(t('tower.opens_left')) + '</span><span class="tc-embers" aria-hidden="true"></span><b class="tt-v"></b></p>'
      + '<p class="tc-fam-held"><span class="tt-k">' + esc(t('tower.held_head')) + '</span><b class="tt-v"></b></p></div>'),
    patch: (d, f) => {
      attr(d, 'data-family', f.family);
      const head = d.querySelector('.tc-fam-name');
      prop(head, 'hidden', !named);
      text(head, named ? keyFamilyWord(f) : '');
      const left = Math.max(0, f.maxWeek - f.openedWeek);
      rows(d.querySelector('.tc-embers'), Array.from({ length: f.maxWeek }, (_, i) => i), {
        key: (i) => String(i),
        build: () => d.ownerDocument.createElement('i'),
        patch: (el, i) => attr(el, 'class', 'tc-ember' + (i < left ? ' is-lit' : '')),
      });
      text(d.querySelector('.tc-fam-week .tt-v'), t('tower.of', { count: whole(left), max: whole(f.maxWeek) }));
      const held = d.querySelector('.tc-fam-held');
      prop(held, 'hidden', f.held === null);
      text(held.querySelector('.tt-v'), f.held !== null ? t('tower.of', { count: whole(f.held), max: whole(f.maxHeld) }) : '');
    },
  });
}

/* STOKE: None and each row the server lists, one press a count with its Cinders; the saved one picked. */
function patchStokes(host, k, pending) {
  rows(host, [{ n: 0, cost: 0 }].concat(k.stokes), {
    key: (r) => String(r.n),
    build: (r) => element(host.ownerDocument, '<button type="button" class="tc-stoke" role="radio" data-hs-act="chest-stoke" data-n="' + r.n + '">'
      + '<b class="tc-stoke-n"></b><span class="tc-stoke-cost"></span></button>'),
    patch: (b, r) => {
      text(b.querySelector('.tc-stoke-n'), r.n ? t('tower.stoke_x', { count: r.n }) : t('tower.stoke_none'));
      text(b.querySelector('.tc-stoke-cost'), r.n ? t('tower.stoke_cost', { cost: whole(r.cost) }) : '');
      attr(b, 'aria-checked', String(k.stokesDefault === r.n));
      attr(b, 'aria-label', r.n ? t('tower.stoke_option', { label: t('tower.stoke_x', { count: r.n }), cost: whole(r.cost) }) : t('tower.stoke_none'));
      prop(b, 'disabled', pending);
    },
  });
}

/* THE REVEAL (tools/world-art/tower-art.mjs, the art at x2), WHERE THE CHEST SITS: the key's own lock catches the light, the lid lifts on
   its fire and embers climb out; a weapon rises out of it in a stepped column of the key's metal, its own icon at the top. Drawn from the
   server's answer only, once per answer (a repaint never replays it), and still for reduced motion (src/styles/tower.css). A key no strip
   is drawn for (a later key row before its art) shows the shut chest and the loot list alone. */
const REVEAL_KEYS = Object.freeze(['bronze', 'silver', 'gold', 'platinum']);
export function revealHtml(r) {
  /* the strip is the key's metal's (a Catacomb key's is its Tower row's at the same door: metalOfKey) */
  const metal = r ? r.metal || r.key : null;
  if (!r || !REVEAL_KEYS.includes(metal)) return '';
  /* a super-rare outfit is the find that rises (its bundle's icon, `has-outfit` for the art's own smoke), else the weapon or the armor piece */
  const bundle = r.opens.map((o) => o.bundle).find(Boolean) || null;
  const up = bundle || r.opens.map((o) => o.weapon || o.armor).find(Boolean) || null;
  return '<div class="tc-reveal' + (up ? ' has-weapon' : '') + (bundle ? ' has-outfit' : '') + '" data-key="' + esc(metal) + '"><span class="tc-reveal-chest"></span>'
    + (up ? '<span class="tc-reveal-col"></span><img class="tc-reveal-item" src="' + esc(PIXEL_DIR + up + '.png') + '" alt="" width="32" height="32" decoding="async">' : '')
    + '</div>';
}

/* An armor piece's slot and weight as a label ("Helmet, Heavy"), from the server's own ids; an id this client has no word for is left out. */
const SLOT_WORDS = Object.freeze({ helmet: 'catacomb.slot_helmet', boots: 'catacomb.slot_boots' });
const WEIGHT_WORDS = Object.freeze({ heavy: 'catacomb.weight_heavy', medium: 'catacomb.weight_medium', light: 'catacomb.weight_light' });
function armorWords(slot, weight) {
  const s = Object.hasOwn(SLOT_WORDS, slot) ? t(SLOT_WORDS[slot]) : '', w = Object.hasOwn(WEIGHT_WORDS, weight) ? t(WEIGHT_WORDS[weight]) : '';
  return s && w ? t('catacomb.armor_found', { slot: s, weight: w }) : s || w;
}

/* The last press's answer: the reveal in the scene, and the loot under it (the server's answer, drawn once): each tower weapon found in
   gold with its type and bonus, each armor piece with its slot and weight, then every other item with its count, the keys used when more
   than one. */
const SHOWN = new WeakMap();
function patchResult(pane, r, tw) {
  const host = pane.querySelector('.tt-result'), slot = pane.querySelector('.tc-reveal-slot');
  prop(host, 'hidden', !r);
  if (!r) { SHOWN.delete(host); slot.innerHTML = ''; cls(pane.querySelector('.tc-scene'), 'is-open', false); return; }
  /* drawn once an answer: a repaint never replays the reveal */
  if (SHOWN.get(host) === r) return;
  SHOWN.set(host, r);
  const reveal = revealHtml(r);
  slot.innerHTML = reveal;
  cls(pane.querySelector('.tc-scene'), 'is-open', !!reveal);
  const k = keyRow(tw, r.key);
  const weapons = r.opens.filter((o) => o.weapon);
  /* a Catacomb key's armor piece, in gold with its slot and weight (2027-05-08-catacombs.sql) */
  const armor = r.opens.filter((o) => o.armor);
  /* a super-rare outfit found leads the list, labelled as one (its bundle is the item in the haul) */
  const finds = r.opens.filter((o) => o.bundle);
  const ids = weapons.map((o) => o.weapon).concat(armor.map((o) => o.armor), finds.map((o) => o.bundle));
  const rest = Object.fromEntries(Object.entries(r.haul).filter(([id]) => !ids.includes(id)));
  const used = pane.querySelector('.tc-used');
  prop(used, 'hidden', r.opens.length < 2);
  text(used, r.opens.length > 1 ? t('tower.opened_many', { count: r.opens.length }) : '');
  const well = (id, name, sub, found) => '<div class="tc-loot-item' + (found ? ' tt-found-row' : '') + '"><img src="' + esc(PIXEL_DIR + id + '.png') + '" alt="" width="32" height="32" decoding="async">'
    + '<span><b class="' + (found ? 'tt-found' : 'tc-loot-name') + '">' + esc(name) + '</b><span class="tc-loot-sub">' + esc(sub) + '</span></span></div>';
  pane.querySelector('.tc-loot').innerHTML = finds.map((o) => well(o.bundle, itemName(o.bundle), t('tower.super_rare'), true)).join('')
    + weapons.map((o) => well(o.weapon, itemName(o.weapon),
    [o.family ? familyWord(o.family) : '', k && k.skillPlus !== null ? t('tower.plus', { plus: k.skillPlus }) : ''].filter(Boolean).join(' '), true)).join('')
    + armor.map((o) => well(o.armor, itemName(o.armor), armorWords(o.slot, o.weight), true)).join('')
    + Object.entries(rest).filter(([, q]) => Number.isSafeInteger(q) && q > 0).map(([id, q]) => well(id, itemName(id), t('tower.count', { count: whole(q) }), false)).join('');
  revealInWindow(host);
}

/** The Chest tab, every number from the section. */
export function patchChest(pane, cs, tw, sc) {
  const c = tw.chest;
  const k = keyPicked(sc, tw);
  patchFamilyPicks(pane.querySelector('.tc-famp'), tw, familyShown(sc, tw), sc.pending);
  patchKeys(pane.querySelector('.tc-keys'), tw, shownKeys(sc, tw), k, sc.pending);
  const none = pane.querySelector('.tc-none');
  prop(none, 'hidden', !!k);
  text(none, k ? '' : t('tower.no_keys'));
  patchFamilies(pane.querySelector('.tc-fams'), c ? c.families : []);
  text(pane.querySelector('.tc-resets'), c && c.weekEnds !== null && c.families.length ? t('tower.week_resets', { when: localWhen(c.weekEnds, serverNow(cs), true) }) : '');
  /* A PRESS'S ANSWER stands in the keys' and the stokes' place (mock A, opened): the loot, the week, the keys of that kind left */
  cls(pane, 'is-result', !!sc.result);
  /* the stokes, the chance they move, the Cinders they burn and the warmth (shown with a key picked) */
  prop(pane.querySelector('.tc-stoke-box'), 'hidden', !k);
  prop(pane.querySelector('.tc-meta'), 'hidden', !k);
  text(pane.querySelector('.tc-hand .tt-v'), k ? t('tower.end_key_count', { key: k.name || itemName(k.item), count: whole(k.heldAll) }) : '');
  if (k) {
    patchStokes(pane.querySelector('.tc-stokes'), k, sc.pending);
    text(pane.querySelector('.tc-chance-v'), k.chancePpm !== null ? ppmWords(k.chancePpm) : '');
    /* the Cinders' label is the item's own name (Hearth Cinders: every key family pays them) */
    text(pane.querySelector('.tc-cinders .tt-k'), itemName(CINDERS));
    text(pane.querySelector('.tc-cinders .tt-v'), c.cindersAll !== null ? whole(c.cindersAll) : '');
    /* the warmth is the key's family's own when the server sends it (2027-05-08-catacombs.sql chest_warmth), else the chest's (the Tower's) */
    const f = familyRow(tw, k);
    const dry = f && f.dry !== null ? f.dry : c.dry, warmPm = f && f.warmthPm !== null ? f.warmthPm : c.warmthPm;
    const warm = dry !== null && dry > 0 && warmPm !== null && warmPm > 1000;
    text(pane.querySelector('.tc-warm .tt-v'), warm ? t('tower.times', { times: timesWords(warmPm) }) : t('tower.none'));
    /* what else a key holds, said on the slot to a pointer that rests on it: the equipped type's share (a weapon key) or the helmets' share
       (an armor key), the contents, the bonus */
    const tip = [k.gear === 'armor' ? (k.helmetPm !== null ? t('catacomb.helmet_lean', { pct: ppmWords(k.helmetPm * 1000) }) : '')
      : c.ownFamily && c.ownPm !== null ? t('tower.own', { family: familyWord(c.ownFamily), pct: ppmWords(c.ownPm * 1000) }) : '',
      Object.keys(k.inside).length ? t('tower.inside', { list: lootList(k.inside).join(', ') }) : '',
      k.skillPlus !== null ? t('tower.skill_plus', { plus: k.skillPlus }) : '',
      /* the super-rare outfits this key can find, each at the server's chance */
      ...k.outfits.map((o) => t('tower.outfit_chance', { name: itemName(o.item), pct: ppmWords(o.pm * 1000) }))].filter(Boolean).join('\n');
    attr(pane.querySelector('.tc-pick[data-key="' + k.key + '"]'), 'title', tip || null);
  }
  const st = k && k.stokesDefault ? stokeRow(k, k.stokesDefault) : null;
  const short = !!st && c.cindersAll !== null && c.cindersAll < st.cost;
  prop(pane.querySelector('.tc-stoke-short'), 'hidden', !short);
  text(pane.querySelector('.tc-stoke-short'), short ? t('tower.stoke_short') : '');
  patchResult(pane, sc.result, tw);
  const block = useBlock(cs, tw, k);
  const all = useAllCount(tw, k);
  const use = pane.querySelector('.tc-use'), useAll = pane.querySelector('.tc-use-all');
  prop(use, 'disabled', sc.pending || !!block);
  prop(use, 'hidden', !k);
  prop(useAll, 'disabled', sc.pending || !!block || all < 2);
  prop(useAll, 'hidden', !k || k.heldAll < 2);
  attr(use, 'data-off-why', block || null);
  attr(useAll, 'data-count', all ? String(all) : null);
  text(pane.querySelector('.tc-off-why'), k ? block : '');
}

/** A press in the Chest tab; true when it was the chest's. */
export function actChest(ctx, cs, tw, sc, action, el, repaint) {
  if (action === 'chest-key') { const key = el.getAttribute('data-key'); const k = keyRow(tw, key); if (k && k.heldAll > 0) { sc.key = key; sc.msg = ''; sc.result = null; repaint(); } return true; }
  /* a key family pressed: its keys show, the first held picked (only a family the server lists) */
  if (action === 'chest-fam') {
    const id = el.getAttribute('data-fam');
    if (!sc.pending && tw.chest && tw.chest.families.some((f) => f.family === id)) { sc.fam = id; sc.key = null; sc.msg = ''; sc.result = null; repaint(); }
    return true;
  }
  if (action === 'chest-keys') { sc.result = null; sc.msg = ''; repaint(); return true; }
  if (action !== 'chest-stoke' && action !== 'chest-use' && action !== 'chest-use-all') return false;
  if (sc.pending || !ctx.account) return true;
  const k = keyPicked(sc, tw);
  if (!k) { repaint(); return true; }
  if (action === 'chest-stoke') {
    const n = Number(el.getAttribute('data-n'));
    if (!(n === 0 || stokeRow(k, n)) || n === k.stokesDefault) return true;
    runIntent(sc, repaint, () => saveStokes(ctx.account, cs, k.key, n), t('tower.busy_stoke'), () => '', cs);
    return true;
  }
  if (useBlock(cs, tw, k)) { repaint(); return true; }
  const count = action === 'chest-use-all' ? useAllCount(tw, k) : 1;
  if (count < 1) { repaint(); return true; }
  /* the key pressed is the pick from now on: a refusal's re-read that finds it gone leaves it picked, Use off (A20) */
  sc.result = null; sc.key = k.key;
  runIntent(sc, repaint, async () => { const r = await openChest(ctx.account, cs, CHEST_ID, k.key, count); if (r.ok) sc.result = Object.assign({}, r, { key: k.key, metal: metalOfKey(tw, k) }); return r; },
    t('tower.busy_open'), () => '', cs);
  return true;
}
