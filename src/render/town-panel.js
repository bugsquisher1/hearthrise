// ============================================================
// src/render/town-panel.js — THE COMMON, rendered (presence rail + The Crier).
//
// The display half of the live-world week-1 slice. src/net/town.js parks a
// projection of the realm in `G._town` and the player's own presence block in
// `G._place`; this turns them into one row on Home and does nothing else. No
// fetch, no timer, no state: `townPanelHtml(view, now, place)` is a PURE
// function of what it is handed, which is why the suite can quote every line of
// it from a fixture instead of a live account.
//
// Extracted here rather than added to the monolith on purpose — the render
// layer is where new presentation goes (CLAUDE.md §7). home-dashboard.js asks
// for a string and drops it into its own row.
//
// ── THE FIVE DESIGN RULES THIS FILE ENFORCES ────────────────────────────────
//  1. NEVER a raw online count. The realm is two people at once today, so
//     "3 online" is a number that makes the world look empty; the rail states
//     WHERE people are ("At the Fire 3 · In the Quarry 1 · Out hunting 6"),
//     which reads as a place with corners rather than a population figure. The
//     server's true `here` is used for exactly ONE sentence — "60 of many
//     shown", and only when it capped the list — and is never printed itself.
//  2. AWAY PEOPLE ARE REAL PEOPLE, DIMMER. A semi-idle realm is mostly away by
//     design; hiding away characters would empty the Common every evening. They
//     are listed, grouped by what they are still doing, and marked `is-away` —
//     dimmed through a token, never a literal colour.
//  3. NAMES COME FROM THE CATALOGUES, NOT THE WIRE. `activity_id` and the
//     crier's item/source ids are looked up in the game's own data (ITEMS,
//     MONSTERS, the gather pools, ARTISAN_RECIPES) through the SAME resolvers
//     the Hearthfind feature uses; the server's `activity_label` is the
//     fallback for an id this build does not know. A second hand-typed copy of
//     a monster name is a thing that drifts.
//  4. THE GROUP HEADINGS ARE A TABLE, NOT A CHAIN OF IFS. An `activity_kind`
//     this build has never heard of is grouped under the label the server sent
//     — the AWAY_SCOPE discipline: the unknown kind shows up as people.
//  5. ABSENT MEANS INVISIBLE. Anything other than a view the server actually
//     answered returns the empty string, and an empty string renders no row, no
//     heading and no frame. See the fail-safe block in src/net/town.js.
//
// ── THE TWO CONTROLS ────────────────────────────────────────────────────────
// QUIET is the opt-out the study named as the one real Security concern: a
// public activity projection is a stalking surface. It is a real control here,
// not a settings-screen afterthought, and it reflects the SERVER's answer.
// A PEER NAME carries `data-town-peer="<name>"`. There is no player-inspect
// surface in this client yet (nothing reads a public profile by name — the
// leaderboard prints names and stops), so a tap is a deliberate no-op: the
// attribute is the seam the inspect sheet will attach to, and a handler that
// did nothing today would be dead code pretending to be a feature.
// ============================================================

import { agoText } from '../net/sync.js?v=554';

const STYLE_ID = 'town-panel-css';

/* How many names the roster prints. The counts beside the headings already say
   how many are where, so the list is the people you can actually read — at a
   thousand players this stays one glanceable row instead of a wall. */
const MAX_NAMES = 12;

/* The last five lines, per the study. `G._town.crier` may hold a few more so a
   burst is not lost between polls; the panel shows five. */
const CRIER_SHOWN = 5;

/* WHERE, BY KIND. Ordered — the hearth first (the place you return to), then
   the work, then the hunt. Adding a kind is a row here; nothing else changes. */
const GROUPS = [
  { kind: 'idle', label: 'At the Fire' },
  { kind: 'gather', label: 'Out gathering' },
  { kind: 'artisan', label: 'At the benches' },
  { kind: 'combat', label: 'Out hunting' },
];
const GROUP_LABEL = GROUPS.reduce((m, g) => { m[g.kind] = g.label; return m; }, Object.create(null));
const KIND_ORDER = GROUPS.reduce((m, g, i) => { m[g.kind] = i; return m; }, Object.create(null));

const w = () => (typeof window !== 'undefined' ? window : {});

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** A kind's heading: the table, else what the server called it, else the catch-all. */
export function groupLabel(kind, serverLabel) {
  return GROUP_LABEL[kind] || (serverLabel ? String(serverLabel) : 'About the realm');
}

/**
 * What a peer is DOING, resolved out of the client's own catalogues by the
 * catalogue key the server sent. Returns the server's `activity_label` when the
 * id is unknown here (a monster added by a data lane this build predates), and
 * '' when neither is available — never a half-rendered id.
 */
export function activityName(kind, id, label) {
  const HF = w().HearthriseHearthfind;
  if (id) {
    if (kind === 'combat') {
      const m = (w().MONSTERS || {})[id];
      if (m && m.name) return m.name;
    } else if (kind === 'artisan') {
      const book = w().ARTISAN_RECIPES || {};
      for (const skill of Object.keys(book)) {
        const list = book[skill];
        if (!Array.isArray(list)) continue;
        const r = list.find((x) => x && x.id === id);
        if (r && r.name) return r.name;
      }
    } else if (kind === 'gather' && HF && typeof HF.sourceName === 'function') {
      /* The gather pools (TREES / ROCKS / FISH_SPOTS) are exactly what the
         Hearthfind resolver already walks — reuse it rather than keeping a
         second copy of the same walk in the render layer. It prettifies an
         unknown id, so an unresolved one is detected by comparing. */
      const n = HF.sourceName('node', id);
      if (n && n.toLowerCase() !== String(id).replace(/_/g, ' ').toLowerCase()) return n;
    }
  }
  return label ? String(label) : '';
}

/**
 * Peers → the rail's groups, in table order with unknown kinds last (stably, by
 * label) so a kind the realm starts sending never reorders the known ones.
 * PURE. Returns `[{ kind, label, count }]` — no total anywhere.
 */
export function groupPeers(peers) {
  const by = new Map();
  for (const p of (Array.isArray(peers) ? peers : [])) {
    if (!p || !p.name) continue;
    const kind = p.kind || 'idle';
    const g = by.get(kind) || { kind, label: groupLabel(kind, p.label), count: 0 };
    g.count += 1;
    by.set(kind, g);
  }
  const known = (k) => (k in KIND_ORDER ? KIND_ORDER[k] : GROUPS.length);
  return [...by.values()].sort((a, b) => (known(a.kind) - known(b.kind)) || a.label.localeCompare(b.label));
}

/**
 * One crier line, as words. The crier IS the hearthfind feed, so the item and
 * the source are named by the Hearthfind resolvers (rule 3) and the odds are
 * the server's own `one_in`.
 */
export function crierLine(c) {
  const HF = w().HearthriseHearthfind;
  const item = (HF && typeof HF.itemName === 'function') ? HF.itemName(c.itemId) : String(c.itemId || '');
  const src = (HF && typeof HF.sourceName === 'function') ? HF.sourceName(c.sourceKind, c.sourceId) : String(c.sourceId || '');
  const who = c.name || 'An adventurer';
  const odds = (c.oneIn && c.oneIn > 1) ? ' (1 in ' + c.oneIn.toLocaleString() + ')' : '';
  return who + ' found ' + item + (src ? ' from ' + src : '') + odds;
}

/**
 * The level band as words. The server sends a DECADE FLOOR off the total level
 * (40 means "somewhere in the forties") — deliberately coarse, so a peer's exact
 * level never crosses to another player. The band is the client's to phrase; the
 * number is the server's to decide.
 */
export function bandText(band) {
  const b = Number(band);
  if (!Number.isFinite(b) || b < 0) return '';
  return b < 10 ? 'Lv under 10' : 'Lv ' + b + '–' + (b + 9);
}

/** 'just now' / '4 min ago' from the SERVER's own relative seconds. */
function agoOf(secs, now) {
  const s = Number(secs);
  return Number.isFinite(s) && s >= 0 ? agoText(now - s * 1000, now) : '';
}

/** Present before away, then most recently seen. The roster is who is HERE. */
function rosterOrder(peers) {
  return [...peers].sort((a, b) => {
    if (!!a.away !== !!b.away) return a.away ? 1 : -1;
    const as = Number.isFinite(Number(a.seenAgoS)) ? Number(a.seenAgoS) : 1e9;
    const bs = Number.isFinite(Number(b.seenAgoS)) ? Number(b.seenAgoS) : 1e9;
    return as - bs;
  }).slice(0, MAX_NAMES);
}

/**
 * The whole row, or ''. `view` is `G._town`, `place` is `G._place`, and `nowMs`
 * is passed in so the suite pins the clock.
 *
 * Returns '' — no row at all — unless the server answered AND there is
 * something to say. A Common with neither people nor news is not drawn empty;
 * it is not drawn.
 */
export function townPanelHtml(view, nowMs, place) {
  const v = view && typeof view === 'object' ? view : null;
  if (!v || v.status !== 'ok') return '';
  const peers = Array.isArray(v.peers) ? v.peers.filter((p) => p && p.name) : [];
  const crier = Array.isArray(v.crier) ? v.crier.filter((c) => c && c.itemId).slice(0, CRIER_SHOWN) : [];
  if (!peers.length && !crier.length) return '';
  const now = Number(nowMs) || Number(v.at) || Date.now();
  const quiet = !!(place && place.quiet);

  let h = '<div class="hd-wrap tc-row"><div class="hd-h"><h3>The Common</h3>'
    /* The opt-out sits in the heading, where it reads as a property of this
       panel rather than a stray control. It states the CURRENT state as a verb
       the player can act on, and it is the server's state, never a local wish. */
    + '<a class="tc-quiet-btn' + (quiet ? ' is-on' : '') + '" data-town-quiet="' + (quiet ? '0' : '1') + '">'
    + (quiet ? 'Hidden — rejoin' : 'Go quiet') + '</a></div><div class="tc-body">';

  h += '<div class="tc-rail">';
  if (peers.length) {
    h += '<div class="tc-groups">' + groupPeers(peers).map((g) =>
      '<span class="tc-grp">' + esc(g.label) + ' <b>' + g.count + '</b></span>').join('');
    /* RULE 1, THE ONE PERMITTED SENTENCE. Only when the server capped the list,
       and even then the realm's population is "many", never a figure. */
    if (v.here !== null && v.shown !== null && v.here > v.shown) {
      h += '<span class="tc-more">' + v.shown + ' of many shown</span>';
    }
    h += '</div>';
    h += '<ul class="tc-folk">' + rosterOrder(peers).map((p) => {
      const seen = agoOf(p.seenAgoS, now);
      const what = activityName(p.kind, p.activityId, p.label) || groupLabel(p.kind, '');
      const band = bandText(p.band);
      return '<li class="tc-peer' + (p.away ? ' is-away' : '') + '" data-town-peer="' + esc(p.name) + '">'
        + '<span class="tc-nm">' + esc(p.name) + '</span>'
        + (band ? '<span class="tc-band">' + esc(band) + '</span>' : '')
        + '<span class="tc-what">' + esc(what) + (seen ? ' · ' + esc(seen) : '') + '</span>'
        + '</li>';
    }).join('') + '</ul>';
  } else {
    h += '<div class="tc-quiet">The Common is quiet. The crier still has news.</div>';
  }
  h += '</div>';

  if (crier.length) {
    h += '<div class="tc-crier"><div class="tc-crier-h">The Crier</div>' + crier.map((c) => {
      const when = agoOf(c.foundAgoS, now);
      return '<div class="tc-line"><span class="tc-when">' + esc(when) + '</span>'
        + '<span class="tc-said">' + esc(crierLine(c)) + '</span></div>';
    }).join('') + '</div>';
  }

  return h + '</div></div>';
}

/**
 * The sheet. Tokens only — every colour is a theme variable, so the row is
 * correct in both themes with no per-theme override, and the away dim is an
 * opacity plus a quieter ink token rather than a hand-picked grey.
 *
 * Two-ID prefix (`#panel-profile #hd-root`) for the same reason home-dashboard
 * uses one: legacy.css carries broad always-on `!important` rules that match
 * generic class names inside the profile panel, and two IDs beat any one-ID
 * theme rule regardless of its class count.
 */
function css() {
  const R = '#panel-profile #hd-root ';
  return [
    R + '.tc-row{margin:0 auto 22px}',
    R + '.tc-body{display:grid;grid-template-columns:1.55fr 1fr;gap:26px;align-items:start}',
    R + '.hd-h .tc-quiet-btn{cursor:pointer;font-family:var(--f-label);font-weight:700;',
    'font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3) !important;white-space:nowrap}',
    R + '.hd-h .tc-quiet-btn:hover{color:var(--gold-2) !important}',
    R + '.hd-h .tc-quiet-btn.is-on{color:var(--gold) !important}',
    R + '.tc-groups{display:flex;flex-wrap:wrap;gap:6px 16px;margin-bottom:9px}',
    R + '.tc-grp{font-family:var(--f-label);font-size:calc(14.5px * var(--ui-scale, 1));letter-spacing:.02em;',
    'color:var(--ink-3) !important;font-weight:700}',
    R + '.tc-grp b{color:var(--gold-2) !important;font-variant-numeric:tabular-nums;margin-left:3px}',
    R + '.tc-more{font-family:var(--f-label);font-size:calc(14.5px * var(--ui-scale, 1));' + 'color:var(--ink-3) !important;font-weight:700;opacity:.75;font-style:italic}',
    /* CAPPED AND SCROLLED, not capped by the data. The roster is the one part
       of Home whose height is set by how many OTHER people are playing, so at a
       busy hour it would push the daily reward and "Next up" down the page for
       everybody. Six rows tall, scroll past that: the row keeps the same rhythm
       at two players and at two hundred. */
    R + '.tc-folk{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;max-height:212px;overflow-y:auto}',
    R + '.tc-peer{display:flex;align-items:baseline;gap:9px;padding:6px 2px;min-width:0}',
    R + '.tc-peer + .tc-peer{border-top:1px solid var(--line-soft) !important}',
    R + '.tc-nm{font-family:var(--f-display);font-size:16px;color:var(--ink) !important;',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:11em}',
    R + '.tc-band{font-family:var(--f-label);font-size:calc(14.5px * var(--ui-scale, 1));color:var(--gold) !important;',
    'font-weight:700;white-space:nowrap}',
    R + '.tc-what{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3) !important;margin-left:auto;',
    'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    /* Rule 2: away is dimmer, not absent, and the dim is a token + opacity. */
    R + '.tc-peer.is-away .tc-nm{color:var(--ink-2) !important}',
    R + '.tc-peer.is-away{opacity:.62}',
    R + '.tc-quiet{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3) !important}',
    R + '.tc-crier{display:flex;flex-direction:column;gap:7px;min-width:0}',
    R + '.tc-crier-h{font-family:var(--f-label);font-size:calc(14.5px * var(--ui-scale, 1));letter-spacing:.02em;',
    'color:var(--gold-2) !important;font-weight:700}',
    R + '.tc-line{display:flex;gap:9px;align-items:baseline;font-size:calc(14.5px * var(--ui-scale, 1));min-width:0}',
    R + '.tc-when{color:var(--ink-3) !important;white-space:nowrap;font-variant-numeric:tabular-nums}',
    R + '.tc-said{color:var(--ink-2) !important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
    /* THE LANDSCAPE PHONE. The hearth band collapses to a 56px strip there, so
       the Common cannot ride inside it and has to hold its own row (the Art
       Director's handoff). Two columns still fit at 922px and are what keeps
       the row short; each column scrolls inside a capped height so the daily
       reward below stays reachable.
       WHOLE ROWS: 90px is exactly three roster rows here and 75px is the
       crier's heading plus two whole lines. A cap that lands mid-row clips a
       name in half and reads as a rendering fault rather than as a scroll. */
    '@media (max-height:540px) and (orientation:landscape) and (max-width:1024px){' +
      R + '.tc-row{margin-bottom:14px}' +
      R + '.tc-body{gap:14px}' +
      R + '.tc-folk{max-height:90px}' +
      R + '.tc-crier{max-height:75px;overflow-y:auto}' +
      R + '.tc-peer{padding:4px 2px}' +
      R + '.tc-nm{font-size:15px;max-width:8em}' +
    '}',
    /* The narrow-portrait fallback: one column, the crier under the rail. */
    '@media (max-width:640px){' + R + '.tc-body{grid-template-columns:1fr;gap:14px}}',
  ].join('');
}

/** Inject the sheet once. Called by the Home renderer before it uses the html. */
export function ensureTownStyle() {
  if (typeof document === 'undefined' || document.getElementById(STYLE_ID)) return;
  const el = document.createElement('style');
  el.id = STYLE_ID;
  el.textContent = css();
  (document.head || document.documentElement).appendChild(el);
}

/**
 * Publish for the classic-script Home renderer (it cannot import), and install
 * ONE delegated click handler for the Quiet control.
 *
 * DELEGATED, not bound per render: Home rebuilds its innerHTML every 1.5s, so a
 * bound handler would be re-attached forty times a minute and any handler the
 * dashboard owned would have to know about this panel. One document-level
 * listener survives every repaint and keeps home-dashboard.js ignorant of the
 * control — which is also where the peer-inspect tap will attach.
 */
export function setupTownPanel() {
  if (typeof window === 'undefined') return;
  window.HearthriseTownPanel = { townPanelHtml, ensureTownStyle, groupPeers, groupLabel, activityName, crierLine, bandText, MAX_NAMES, CRIER_SHOWN };
  if (typeof document === 'undefined') return;
  document.addEventListener('click', (e) => {
    const el = e.target && e.target.closest && e.target.closest('[data-town-quiet]');
    if (!el) return;
    e.preventDefault();
    const T = window.HearthriseTown;
    if (!T || typeof T.setQuiet !== 'function') return;
    T.setQuiet(el.getAttribute('data-town-quiet') === '1')
      .then(() => { try { window.HearthriseHome.render(); } catch (err) {} })
      .catch(() => {});
  });
}
