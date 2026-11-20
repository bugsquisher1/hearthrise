// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/first-target.js — THE FIRST TARGET: the monster kind a hero goes for first on a ground.
//
// The Krell's Hold design's engine piece 4 (lane/c-target-kind): the menders, a captain's adds, the Pyre Priest. One
// select in the bar's fight settings, beside Target: None, then every monster that ground holds (hunt-grounds.js
// monstersOn, the rows the engine spawns there, which the server's catalogue of the ground holds whole: tests/
// target-kind-db.mjs TK-5). It is remembered PER GROUND, so the ground is named under it: the open hunt's, else the
// ground the Hunts window has picked, else the last hunt's (configurable in town, Tyler 10-25); a ground with one kind
// offers no choice.
// It SHOWS the server's `hunt_target_kind` section and nothing else. A change is ONE intent (target-intents.js
// setTargetKind): the panel goes pending at once, every control off, and comes back only when the server has answered
// and the re-read envelope has replaced the section (CLAUDE.md §6). A refusal keeps the server's pick and says why.
// ════════════════════════════════════════════════════════════════════════
import { MONSTERS } from '../../data/monsters.js?v=0.2.143';
import { groundOfHunt, monstersOn } from '../../data/hunt-grounds.js?v=0.2.143';
import { huntOf, huntTargetKindOf } from '../../session/hunt-sections.js?v=0.2.143';
import { huntName } from '../../session/party-sections.js?v=0.2.143';
import { setTargetKind } from '../../session/target-intents.js?v=0.2.143';
import { pickedHuntOf } from '../windows/hunts.js?v=0.2.143';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.143';
import { text, attr, prop } from '../../render/paint.js?v=0.2.143';
import { answerWithin } from '../bar-draft.js?v=0.2.143';
import { refusalText } from '../intent-words.js?v=0.2.143';
import { t } from '../../render/player-text.js?v=0.2.143';

/** The row (built once): the label, the select (its options follow the ground) and the line naming the ground. */
export function firstTargetHtml() {
  return '<div class="hb-pl-first" hidden><label class="hb-pl-row is-first"><span class="hb-label">' + esc(t('bar.first_target')) + '</span>'
    + '<select class="hh-select" data-hs-act="first-target" aria-label="' + esc(t('bar.first_target')) + '"></select></label>'
    + '<p class="hb-pl-note"></p></div>';
}

/** THE HERO'S GROUND, the one a setting or a card is about: the open hunt's, else the Hunts window's pick, else the last hunt's;
    null = none known (the First target row hides; an item card says nothing of a ground, windows/item-tip.js). */
export function heroGroundOf(cs) {
  const h = huntOf(cs);
  if (h && !h.ended && h.huntId) return h.huntId;
  return pickedHuntOf(cs) || (h && h.huntId) || null;
}

/* The kinds a hero can name first on `hunt`, by name: [{ id, name }], [] for a ground the data does not hold. Data only, so
   read once per ground: the bar patches every display tick. */
const KINDS = new Map();
function kindsOf(hunt) {
  if (!hunt) return [];
  if (!KINDS.has(hunt)) {
    const g = groundOfHunt(hunt);
    KINDS.set(hunt, g ? [...monstersOn(g)].filter((id) => MONSTERS[id]).map((id) => ({ id, name: MONSTERS[id].name }))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0)) : []);
  }
  return KINDS.get(hunt);
}

/* The server's pick on `hunt` ('' = none) when it is a kind of that ground, else ''; null = the server sent no section. */
function shownKind(cs, hunt, kinds) {
  const s = huntTargetKindOf(cs);
  if (!s) return null;
  const k = s.picks[hunt];
  return k && kinds.some((x) => x.id === k) ? k : '';
}

/** Patch the row under the fight settings `root` to the server's pick on this character's ground; off while pending or unknown. */
export function patchFirstTarget(root, ctx) {
  const box = root.querySelector('.hb-pl-first');
  if (!box) return;
  const cs = ctx.character;
  const hunt = heroGroundOf(cs);
  const kinds = kindsOf(hunt);
  prop(box, 'hidden', kinds.length < 2);
  if (kinds.length < 2) return;
  const sel = box.querySelector('select');
  /* the options follow the ground: rebuilt only when it changes */
  if (sel.getAttribute('data-hunt') !== hunt) {
    sel.innerHTML = '<option value="">' + esc(t('bar.first_target_none')) + '</option>'
      + kinds.map((k) => '<option value="' + esc(k.id) + '">' + esc(k.name) + '</option>').join('');
    attr(sel, 'data-hunt', hunt);
  }
  const pending = root.hasAttribute('data-pending');
  const v = shownKind(cs, hunt, kinds);
  prop(sel, 'disabled', pending || v === null);
  /* the server's pick, in flight too: the one chosen shows only once the re-read envelope says so (CLAUDE.md §6) */
  if (v !== null) prop(sel, 'value', v);
  attr(sel, 'aria-label', t('bar.first_target_on', { ground: huntName(hunt) }));
  const named = v ? kinds.find((k) => k.id === v) : null;
  /* off with no pick from the server (no `hunt_target_kind` section): the line under it says so, never a silent grey select */
  text(box.querySelector('.hb-pl-note'), v === null ? t('bar.first_target_unknown')
    : named ? t('bar.first_target_note_on', { ground: huntName(hunt), monster: named.name })
    : t('bar.first_target_note_off', { ground: huntName(hunt) }));
}

/**
 * Send ONE First target intent from the select `el` under the fight settings `root`. Resolves when the server has
 * answered (and, on ok, the character was re-read).
 */
export async function sendFirstTarget(ctx, root, el, repaint) {
  const cs = ctx.character;
  const hunt = el.getAttribute('data-hunt');
  const kinds = kindsOf(hunt);
  const now = shownKind(cs, hunt, kinds);
  const want = el.value || null;
  /* only a kind of this ground, and only a change, is sent; anything else snaps back to the server's pick */
  if (!hunt || now === null || (want !== null && !kinds.some((k) => k.id === want)) || (want || '') === now || root.hasAttribute('data-pending')) { repaint(); return false; }
  attr(root, 'data-pending', true);
  text(root.querySelector('.hh-intent-msg'), t('prep.saving'));
  repaint();
  /* never left pending: the answer, a refusal or the timeout always turns the controls back on */
  const r = await answerWithin(() => setTargetKind(ctx.account, cs, hunt, want));
  attr(root, 'data-pending', null);
  text(root.querySelector('.hh-intent-msg'), r.ok ? '' : refusalText(r, cs));
  repaint();
  return r.ok;
}
