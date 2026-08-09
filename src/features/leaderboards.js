// ============================================================
// src/features/leaderboards.js  (b222, backlog #11 — leaderboards.md)
//
// TWENTY-ONE BOARDS, AND YOU ARE ON EVERY ONE OF THEM.
//
// The old leaderboard had three boards, showed the top fifteen, and stopped.
// A player ranked #412 opened the Social tab, read fifteen names that were not
// theirs, and closed it. That is the single most demotivating thing a
// leaderboard can do (leaderboards.md §1), and it is what this file fixes:
//
//   • THE SELF BLOCK. Every board pins your rank plus the rival directly above
//     and directly below you, always, at any rank. "I can catch #411 tonight"
//     is the entire retention mechanism of a leaderboard; without it a board is
//     a spectator sport.
//   • THE THRONE BOARD. Renown is the game's meta-spine ("Rise to the Throne")
//     and it was absent from the one screen built to show off rank. It is now
//     the flagship board, and its third column is your RANK TITLE, so the board
//     reads as a social hierarchy rather than a number.
//   • FIFTEEN SKILL BOARDS. "All skills to 99" is the game's stated fantasy and
//     it had no board at all.
//
// ── WHERE THE RANKS COME FROM ───────────────────────────────
// The server, always. `hr_leaderboard(board, limit, span)` reads a materialized
// view that pre-computes `row_number()` per board, so top-N, your rank and your
// two rivals are three index scans rather than three full scans — the same call
// costs the same at fifty players and at fifty thousand. See
// supabase/migrations/2026-08-08-leaderboards.sql.
//
// Ranks are never computed here. A client-computed rank is a client-computed
// claim, and the cosmetic titles this file draws (rank 1 on a board is "the
// Throne", "Grandmaster Miner", …) are honest precisely because the rank behind
// them came from the server.
//
// ── CLIENT-FIRST COMPATIBILITY ──────────────────────────────
// This file ships BEFORE the migration is applied and must work anyway. The RPC
// is FEATURE-DETECTED (404 / PGRST202 → 'legacy') with a negative probe that
// expires after ten minutes, so a session left open across the migration heals
// itself without a reload. Degraded, the module serves exactly the three boards
// the pre-existing `public.leaderboard` view can answer honestly — Total Level,
// Combat Level, Wealth — and STILL shows the self block, deriving your rank
// from a PostgREST exact-count query. The boards that need data the old view
// does not carry (Throne, the fifteen skills, Bosses, Clan Power) are not
// offered until the server can serve them. They are not shown greyed out with
// a "coming soon" note: a roadmap is not a player-facing feature.
//
// ── ECONOMY ─────────────────────────────────────────────────
// Ranking grants NOTHING. There is no claim button, no currency and no code
// path in this file that names gold, gems or hearth_token. Rewards are
// prestige-only: a title drawn from a rank the server computed. Seasonal gem
// awards and the "Climbers" board (leaderboards.md §5–6) need a claim ledger
// and a season-baseline table on the server and are deliberately NOT faked here.
// ============================================================
(function () {
  'use strict';

  // ── The board namespace ─────────────────────────────────────
  // MUST match public.hr_lb_boards() in the migration, including the camelCase
  // `bountyHunter`. The migration's self-check asserts the count from its side.
  var SKILL_ORDER = [
    'attack', 'strength', 'defense', 'hitpoints', 'prayer', 'magic', 'ranged',
    'woodcutting', 'mining', 'fishing', 'farming',
    'cooking', 'crafting', 'smithing', 'bountyHunter'
  ];

  var TOP_N = 25;      // leaderboards.md §4 — an honour roll, not a podium
  var SPAN  = 1;       // one rival above, one below

  // `legacy` marks the boards the pre-migration `public.leaderboard` view can
  // answer, and names the column to sort and count on.
  var BOARDS = {
    renown:       { cat: 'throne',  label: 'Renown',       glyph: 'uiCrown',  crown: 'the Throne' },
    total_level:  { cat: 'overall', label: 'Total Level',  glyph: 'totalLvl', legacy: 'total_level',  crown: 'the Peerless' },
    wealth:       { cat: 'overall', label: 'Wealth',       glyph: 'gold',     legacy: 'gold',         crown: 'the Magnate' },
    combat_level: { cat: 'combat',  label: 'Combat Level', glyph: 'combatLvl', legacy: 'combat_level', crown: 'the Champion' },
    bosses:       { cat: 'combat',  label: 'Bosses',       glyph: 'uiSkull',  crown: 'the Bane' },
    clan_power:   { cat: 'clans',   label: 'Clan Power',   glyph: 'uiCastle', subject: 'clan', crown: 'the High Seat' }
  };
  SKILL_ORDER.forEach(function (s) {
    BOARDS['skill:' + s] = { cat: 'skills', label: skillName(s), glyph: s, skill: s, crown: 'Grandmaster' };
  });

  var CATEGORIES = [
    { id: 'throne',  label: 'Throne' },
    { id: 'overall', label: 'Overall' },
    { id: 'skills',  label: 'Skills' },
    { id: 'combat',  label: 'Combat' },
    { id: 'clans',   label: 'Clans' }
  ];

  function skillName(id) {
    var d = window.SKILLS_DEF && window.SKILLS_DEF[id];
    if (d && d.name) return d.name;
    // Fallback only for a skill the data layer has not merged yet.
    return id.replace(/([A-Z])/g, ' $1').replace(/^./, function (c) { return c.toUpperCase(); });
  }
  function boardsIn(cat, caps) {
    return Object.keys(BOARDS).filter(function (id) {
      return BOARDS[id].cat === cat && available(id, caps);
    });
  }
  function available(id, caps) {
    return caps === 'full' ? true : !!BOARDS[id].legacy;
  }
  function categoriesFor(caps) {
    return CATEGORIES.filter(function (c) { return boardsIn(c.id, caps).length > 0; });
  }

  // ── Transport ───────────────────────────────────────────────
  function cfg() {
    return (window.HearthriseSupabase && window.HearthriseSupabase.getConfig && window.HearthriseSupabase.getConfig()) || null;
  }
  function session() {
    return (window.HearthriseAuth && window.HearthriseAuth.getSession && window.HearthriseAuth.getSession()) || null;
  }
  function online() { return !!cfg(); }
  function signedIn() { var s = session(); return !!(s && s.access_token && s.user && cfg()); }
  function myId() { return signedIn() ? session().user.id : null; }
  function headers(json, anonOnly) {
    var c = cfg(), s = anonOnly ? null : session();
    var h = { 'apikey': c.anonKey, 'Authorization': 'Bearer ' + ((s && s.access_token) || c.anonKey) };
    if (json) h['Content-Type'] = 'application/json';
    return h;
  }

  /**
   * A read, with ONE retry as the anonymous reader if the session's token has
   * expired. Boards are public: an expired token should cost you the self block
   * (nobody can know your rank without knowing who you are), never the whole
   * honour roll. Without this, a stale JWT turns the entire screen into an
   * error — which is what an expired session looked like before b222.
   */
  async function req(url, extra, json) {
    var res = await fetch(url, { headers: Object.assign(headers(json), extra || {}) });
    if ((res.status === 401 || res.status === 403) && session()) {
      res = await fetch(url, { headers: Object.assign(headers(json, true), extra || {}) });
    }
    return res;
  }

  // Feature detection, one probe. A NEGATIVE result expires after ten minutes
  // so a session that was open while the migration was applied upgrades itself.
  var probe = null;                  // {known:boolean, at:number} | null
  function capability() {
    if (!online()) return 'offline';
    if (!probe) return 'unknown';
    if (probe.known) return 'full';
    return (Date.now() - probe.at) < 600000 ? 'legacy' : 'unknown';
  }
  function noteRpc(present) { probe = { known: !!present, at: Date.now() }; }
  function _resetProbe() { probe = null; }

  async function rpc(name, body) {
    var url = cfg().url + '/rest/v1/rpc/' + name;
    var payload = JSON.stringify(body || {});
    var res = await fetch(url, { method: 'POST', headers: headers(true), body: payload });
    if ((res.status === 401 || res.status === 403) && session()) {
      res = await fetch(url, { method: 'POST', headers: headers(true, true), body: payload });
    }
    var json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    return { status: res.status, ok: res.ok, json: json };
  }

  // ── Pure reducers (no fetch, no DOM — the whole server contract) ──
  function isMissingRpc(status, out) {
    return status === 404 || (out && (out.code === 'PGRST202' || out.code === '42883' || out.code === '42P01'));
  }
  function normRow(r) {
    if (!r || typeof r !== 'object') return null;
    return {
      rank: Math.max(0, +r.rank || 0),
      id: r.id || null,
      name: typeof r.name === 'string' && r.name ? r.name : 'Adventurer',
      clan: r.clan || null,
      score: +r.score || 0,
      savedAt: r.saved_at || null
    };
  }
  function normRows(a) {
    return Array.isArray(a) ? a.map(normRow).filter(Boolean) : [];
  }
  /**
   * The server's answer, or an honest refusal. Anything that is not the RPC's
   * own {ok:boolean,…} envelope is a refusal — a 401 body carries no `ok`, and
   * treating one as an empty board would tell the player nobody is ranked.
   */
  function reduceBoard(status, out) {
    if (isMissingRpc(status, out)) return { action: 'unsupported' };
    if (status >= 400 || !out || typeof out !== 'object' || typeof out.ok !== 'boolean') {
      return { action: 'fail', error: 'network' };
    }
    if (out.ok === false) return { action: 'fail', error: out.error || 'refused' };
    return {
      action: 'accept',
      board: out.board || null,
      refreshedAt: out.refreshed_at || null,
      total: Math.max(0, +out.total || 0),
      top: normRows(out.top),
      rank: (out.rank == null ? null : Math.max(0, +out.rank || 0)) || null,
      near: normRows(out.near)
    };
  }

  /**
   * The rendered shape: the honour roll, plus the pinned self block.
   *
   * The block is SUPPRESSED when you are already inside the honour roll —
   * repeating three rows you can already see is noise, so instead your row up
   * there is highlighted and the summary line says where you stand. This is the
   * one piece of leaderboard logic with a real edge case (rank 1, rank N, rank
   * exactly at the fold), so it is pure and directly unit-tested.
   */
  function buildView(res, meId) {
    var top = (res && res.top) || [];
    var rank = (res && res.rank) || null;
    var inTop = rank != null && top.some(function (r) { return r.rank === rank; });
    var block = (rank != null && !inTop) ? ((res && res.near) || []) : [];
    return {
      top: top,
      block: block,
      rank: rank,
      total: (res && res.total) || 0,
      inTop: inTop,
      meId: meId || null,
      refreshedAt: (res && res.refreshedAt) || null
    };
  }

  // ── The degraded reader (pre-migration) ─────────────────────
  // Reads the pre-existing `public.leaderboard` view. Everything it returns is
  // real; it simply cannot answer the boards whose data that view never carried.
  function lbUrl(q) { return cfg().url + '/rest/v1/leaderboard?' + q; }
  var LEGACY_SELECT = 'select=user_id,name,total_level,combat_level,gold,clan_name,saved_at';

  function legacyRow(r, key, rank) {
    return {
      rank: rank,
      id: r.user_id || null,
      name: r.name || 'Adventurer',
      clan: r.clan_name || null,
      score: Math.max(0, +r[key] || 0),
      savedAt: r.saved_at || null
    };
  }

  /** Total rows matching a filter, via PostgREST's exact count header. */
  async function countWhere(filter) {
    var res = await req(lbUrl(filter + '&select=user_id&limit=1'),
      { 'Prefer': 'count=exact', 'Range-Unit': 'items', 'Range': '0-0' });
    var cr = res.headers.get('content-range') || '';
    var n = parseInt(String(cr).split('/')[1], 10);
    return isFinite(n) ? n : null;
  }

  async function legacyBoard(boardId) {
    var key = BOARDS[boardId].legacy;
    var res = await req(lbUrl('order=' + key + '.desc.nullslast&limit=' + TOP_N + '&' + LEGACY_SELECT));
    if (!res.ok) return { action: 'fail', error: 'network' };
    var rows = await res.json();
    var top = (rows || []).map(function (r, i) { return legacyRow(r, key, i + 1); });

    var out = { action: 'accept', board: boardId, refreshedAt: null, total: 0, top: top, rank: null, near: [] };
    out.total = (await countWhere(key + '=gte.0')) || top.length;

    var uid = myId();
    if (!uid) return out;

    // My row, then my exact rank as "how many are strictly above me", then the
    // single rival on each side. Four small indexed queries — acceptable at
    // beta scale, and the whole reason the matview exists for the real thing.
    var mineRes = await req(lbUrl('user_id=eq.' + encodeURIComponent(uid) + '&' + LEGACY_SELECT));
    if (!mineRes.ok) return out;
    var mineRows = await mineRes.json();
    if (!mineRows || !mineRows.length) return out;         // no cloud save yet
    var mine = mineRows[0];
    var score = +mine[key];
    if (!isFinite(score)) return out;

    var above = await countWhere(key + '=gt.' + score);
    if (above == null) return out;
    out.rank = above + 1;

    var near = [];
    if (out.rank > 1) {
      var aRes = await req(lbUrl(key + '=gt.' + score + '&order=' + key + '.asc.nullslast&limit=1&' + LEGACY_SELECT));
      if (aRes.ok) { var aRows = await aRes.json(); if (aRows && aRows[0]) near.push(legacyRow(aRows[0], key, out.rank - 1)); }
    }
    near.push(legacyRow(mine, key, out.rank));
    var bRes = await req(lbUrl(key + '=lt.' + score + '&order=' + key + '.desc.nullslast&limit=1&' + LEGACY_SELECT));
    if (bRes.ok) { var bRows = await bRes.json(); if (bRows && bRows[0]) near.push(legacyRow(bRows[0], key, out.rank + 1)); }
    out.near = near;
    return out;
  }

  // ── Fetch one board ─────────────────────────────────────────
  async function fetchBoard(boardId) {
    if (!online()) return { action: 'offline' };
    if (!BOARDS[boardId]) return { action: 'fail', error: 'unknown_board' };

    if (capability() !== 'legacy') {
      var r;
      try { r = await rpc('hr_leaderboard', { p_board: boardId, p_limit: TOP_N, p_span: SPAN }); }
      catch (e) { return { action: 'fail', error: 'network' }; }
      var d = reduceBoard(r.status, r.json);
      noteRpc(d.action !== 'unsupported');
      if (d.action !== 'unsupported') return d;
      // fall through to the degraded reader
    }
    if (!BOARDS[boardId].legacy) return { action: 'unsupported' };
    try { return await legacyBoard(boardId); }
    catch (e) { return { action: 'fail', error: 'network' }; }
  }

  // ── Formatting ──────────────────────────────────────────────
  function fmt(n) { return (+n || 0).toLocaleString(); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function gly(key, px, col) {
    return (window.HR && window.HR.icon) ? (window.HR.icon(key, px || 14, col || 'currentColor') || '') : '';
  }
  function lvlFromXp(xp) {
    var T = window.XP_TABLE;
    if (!T || !T.length) return null;
    for (var i = T.length - 1; i >= 0; i--) if (xp >= T[i]) return Math.min(i + 1, 99);
    return 1;
  }
  /** The renown ladder's title for a score — the Throne board's third column. */
  function renownTitle(score) {
    var R = window.HearthriseRenown;
    if (!R || !R.RANKS || typeof R.rankIndexFor !== 'function') return '';
    var r = R.RANKS[R.rankIndexFor(score)];
    return (r && r.title) || '';
  }
  /** The score column. */
  function scoreText(boardId, score) {
    var b = BOARDS[boardId];
    if (b.skill) { var lv = lvlFromXp(score); return lv == null ? fmt(score) : ('Lv ' + lv); }
    if (boardId === 'total_level') return 'Lv ' + fmt(score);
    if (boardId === 'combat_level') return 'CL ' + fmt(score);
    if (boardId === 'wealth') return fmt(score) + 'g';
    if (boardId === 'clan_power') return 'Castle ' + Math.floor(score / 1000000000);
    if (boardId === 'bosses') return fmt(score) + ' felled';
    return fmt(score);
  }
  /** The context column — what the score MEANS on this board. */
  function contextText(boardId, row) {
    var b = BOARDS[boardId];
    if (boardId === 'renown') return renownTitle(row.score);
    if (b.skill) return fmt(row.score) + ' xp';
    if (boardId === 'clan_power') return fmt(row.score % 1000000000) + 'g';
    return row.clan ? row.clan : '';
  }
  /** The cosmetic title held by rank 1 — prestige, never currency. */
  function crownFor(boardId) {
    var b = BOARDS[boardId];
    if (!b || !b.crown) return '';
    return b.skill ? (b.crown + ' ' + b.label) : b.crown;
  }
  function agoText(iso) {
    if (!iso) return '';
    var t = Date.parse(iso);
    if (!isFinite(t)) return '';
    var m = Math.max(0, Math.floor((Date.now() - t) / 60000));
    if (m < 1) return 'updated just now';
    if (m < 60) return 'updated ' + m + 'm ago';
    var h = Math.floor(m / 60);
    return 'updated ' + h + 'h ago';
  }

  // ── Style (scoped; tokens only) ─────────────────────────────
  var STYLE_ID = 'hr-lb-style';
  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      // The board picker is a second, quieter rank of chips under the category
      // row — one underline for the section, not two.
      '#lb-boards{margin-top:-4px;border-bottom:none;overflow-x:auto;flex-wrap:nowrap;',
      '  scrollbar-width:thin;padding-bottom:2px}',
      '#lb-boards .chip{white-space:nowrap;display:inline-flex;align-items:center;gap:5px}',
      '#lb-boards .chip .hr-glyph{--gsz:13px;opacity:.85}',
      '#lb-boards::-webkit-scrollbar{height:5px}',
      '#lb-boards::-webkit-scrollbar-thumb{background:var(--line-soft);border-radius:99px}',
      // The self block. A rule plus a caption, so the pinned rows read as a
      // separate statement about you rather than a continuation of the roll.
      '#leaderboard .lb-fold{display:flex;align-items:center;gap:8px;margin:12px 0 6px;',
      '  font-size:calc(14.5px * var(--ui-scale, 1));letter-spacing:.14em;text-transform:uppercase;font-weight:800;color:var(--ink-3)}',
      '#leaderboard .lb-fold::after{content:"";flex:1;height:1px;background:var(--line-soft)}',
      '#leaderboard .lb-row.you{border-left:2px solid var(--gold-2)}',
      '#leaderboard .lb-ctx{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3);font-weight:600;',
      '  max-width:38%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#leaderboard .lb-crown{font-size:calc(14.5px * var(--ui-scale, 1));letter-spacing:.06em;text-transform:uppercase;',
      '  color:var(--gold-2);font-weight:800;margin-left:6px}',
      '#leaderboard .lb-note{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3);margin-top:10px}',
      '#leaderboard .lb-empty{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3);padding:14px 2px}',
      '@media (max-width:540px){#leaderboard .lb-ctx{display:none}}'
    ].join('');
    document.head.appendChild(s);
  }

  // ── Selection state (persisted, like every other sub-tab) ───
  var CAT_KEY = 'hearthrise:lb-category';
  var BOARD_KEY = 'hearthrise:lb-board';
  function readPref(k) {
    try { return window.HearthriseStorage ? window.HearthriseStorage.get(k) : localStorage.getItem(k); }
    catch (e) { return null; }
  }
  function writePref(k, v) {
    try { if (window.HearthriseStorage) window.HearthriseStorage.set(k, v); else localStorage.setItem(k, v); }
    catch (e) {}
  }

  // INTENT and RESOLUTION are deliberately separate. `want*` is what the player
  // asked for; `cur*` is what the server can currently serve. Collapsing the two
  // is a bug with a long tail: pre-migration the Throne board does not exist, so
  // a first render would "choose" Overall, persist it, and the flagship board
  // would never become the default even after the migration landed.
  var wantCat = null, wantBoard = null;
  var curCat = null, curBoard = null;

  function intentCat() { return wantCat || readPref(CAT_KEY) || 'throne'; }
  function intentBoard() { return wantBoard || readPref(BOARD_KEY) || 'renown'; }
  function capsForPicker() { var c = capability(); return c === 'full' ? 'full' : 'legacy'; }

  /**
   * Resolve the selection against what the server can actually serve. Pure —
   * given the capability it always lands on a board that exists, which is what
   * lets the picker change shape when the migration lands without ever leaving
   * the player looking at a board that has quietly disappeared.
   */
  function resolveSelection(caps, cat0, board0) {
    var cats = categoriesFor(caps);
    if (!cats.length) return { cat: null, board: null };
    var cat = cats.filter(function (c) { return c.id === cat0; })[0] || cats[0];
    var list = boardsIn(cat.id, caps);
    var board = list.indexOf(board0) >= 0 ? board0 : list[0];
    return { cat: cat.id, board: board };
  }

  /** Fold intent into what is on screen. Synchronous, so `current()` is honest
   *  the instant a chip is clicked rather than one network round trip later. */
  function applyIntent() {
    var sel = resolveSelection(capsForPicker(), intentCat(), intentBoard());
    curCat = sel.cat; curBoard = sel.board;
    return sel;
  }

  // ── Render ──────────────────────────────────────────────────
  function rankCell(n, isMe) {
    var c = n === 1 ? 'var(--gold)' : n === 2 ? 'var(--ink-2)' : n === 3 ? 'var(--gold-2)' : null;
    if (c) return '<span class="lb-rank" style="color:' + c + ';font-family:var(--f-display)">' + n + '</span>';
    return '<span class="lb-rank"' + (isMe ? ' style="color:var(--gold-2)"' : '') + '>' + fmt(n) + '</span>';
  }
  function rowHtml(boardId, row, meId, isMe) {
    var mine = isMe || (meId && row.id === meId);
    var ctx = contextText(boardId, row);
    return '<div class="lb-row' + (mine ? ' you' : '') + '">' +
      rankCell(row.rank, mine) +
      '<span class="lb-name">' + esc(row.name) + (mine ? ' (you)' : '') +
        (row.rank === 1 ? '<span class="lb-crown">' + esc(crownFor(boardId)) + '</span>' : '') +
      '</span>' +
      '<span class="lb-ctx">' + esc(ctx) + '</span>' +
      '<span class="lb-stat gold">' + esc(scoreText(boardId, row.score)) + '</span>' +
    '</div>';
  }

  function boardHtml(boardId, view) {
    var meId = view.meId;
    var html = view.top.map(function (r) { return rowHtml(boardId, r, meId, false); }).join('');
    if (!view.top.length) {
      html = '<div class="lb-empty">No one has ranked on this board yet. Be first.</div>';
    }
    if (view.block.length) {
      html += '<div class="lb-fold">Your standing</div>' +
        view.block.map(function (r) {
          return rowHtml(boardId, r, meId, view.rank != null && r.rank === view.rank);
        }).join('');
    }
    if (view.rank != null) {
      html += '<div class="lb-note">You are <b style="color:var(--gold-2)">#' + fmt(view.rank) + '</b> of ' +
        fmt(view.total) + ' ranked.</div>';
    } else if (!signedIn()) {
      html += '<div class="lb-note">Sign in to take your place on the board.</div>';
    } else if (view.top.length) {
      html += '<div class="lb-note">You are not ranked here yet — play, and your next cloud save puts you on it.</div>';
    }
    return html;
  }

  function pickerHtml(caps) {
    var cats = categoriesFor(caps);
    var catRow = cats.map(function (c) {
      return '<button class="chip' + (c.id === curCat ? ' active' : '') + '" data-lb-cat="' + c.id + '">' + esc(c.label) + '</button>';
    }).join('');
    var list = boardsIn(curCat, caps);
    var boardRow = (list.length > 1) ? list.map(function (id) {
      var b = BOARDS[id];
      return '<button class="chip' + (id === curBoard ? ' active' : '') + '" data-lb-board="' + esc(id) + '" title="' + esc(b.label) + '">' +
        gly(b.glyph, 13) + '<span>' + esc(b.label) + '</span></button>';
    }).join('') : '';
    return { cats: catRow, boards: boardRow };
  }

  var renderSeq = 0;

  // Never throws and never rejects: it is called from a click handler, from
  // renderSocial, and from itself, and a rejected promise from any of those
  // paths is an unhandled rejection the error boundary would report as a crash.
  async function render() {
    try { await paint(); }
    catch (e) { try { console.warn('[leaderboards] render failed', e); } catch (e2) {} }
  }

  async function paint() {
    var host = document.getElementById('leaderboard');
    if (!host) return;
    ensureStyle();

    var caps = capability();
    applyIntent();

    var catEl = document.getElementById('lb-cats');
    var boardEl = document.getElementById('lb-boards');
    var subEl = document.getElementById('lb-sub');

    if (!online()) {
      if (catEl) catEl.innerHTML = '';
      if (boardEl) boardEl.innerHTML = '';
      if (subEl) subEl.textContent = 'Offline';
      host.innerHTML = '<div class="lb-empty">Leaderboards are live multiplayer — they need a connection.</div>';
      return;
    }
    if (!curBoard) { host.innerHTML = '<div class="lb-empty">No boards available.</div>'; return; }

    var pick = pickerHtml(capsForPicker());
    if (catEl) catEl.innerHTML = pick.cats;
    if (boardEl) { boardEl.innerHTML = pick.boards; boardEl.style.display = pick.boards ? '' : 'none'; }

    var seq = ++renderSeq;
    host.innerHTML = '<div class="lb-empty">Reading the rolls…</div>';
    if (subEl) subEl.textContent = BOARDS[curBoard].label;

    var res = await fetchBoard(curBoard);
    if (seq !== renderSeq) return;                 // a newer board won the race

    // The capability may have changed under us (first successful probe) —
    // repaint the picker so the new categories appear without a reload.
    var caps2 = capability();
    if (caps2 !== caps) return render();

    if (res.action === 'offline' || res.action === 'unsupported') {
      host.innerHTML = '<div class="lb-empty">This board is not available right now.</div>';
      if (subEl) subEl.textContent = BOARDS[curBoard].label;
      return;
    }
    if (res.action !== 'accept') {
      host.innerHTML = '<div class="lb-empty">Could not reach the leaderboard server. It will be back.</div>';
      if (subEl) subEl.textContent = 'Unavailable';
      return;
    }

    var view = buildView(res, myId());
    host.innerHTML = boardHtml(curBoard, view);
    if (subEl) {
      // Your standing goes in the CARD HEAD as well as the pinned block. The
      // block sits below twenty-five rows, which on a tall board is a thousand
      // pixels of scrolling — and "every player sees themselves, always" has to
      // survive the player who never scrolls.
      var stamp = agoText(res.refreshedAt);
      var standing = view.rank != null
        ? '#' + fmt(view.rank) + (view.total ? ' of ' + fmt(view.total) : '')
        : (view.total ? fmt(view.total) + ' ranked' : '');
      subEl.textContent = [BOARDS[curBoard].label, standing, stamp]
        .filter(function (x) { return !!x; }).join(' · ');
    }
  }

  function selectCategory(id) {
    if (!id || id === curCat) return;
    wantCat = id; wantBoard = null;
    writePref(CAT_KEY, id);
    var sel = applyIntent();
    writePref(BOARD_KEY, sel.board || '');
    wantBoard = sel.board;
    return render();
  }
  function selectBoard(id) {
    if (!id || id === curBoard || !BOARDS[id]) return;
    wantBoard = id; wantCat = BOARDS[id].cat;
    writePref(CAT_KEY, wantCat);
    writePref(BOARD_KEY, id);
    applyIntent();
    return render();
  }

  // One delegated listener on the panel — the chips are re-rendered constantly,
  // so binding per chip would leak a handler on every repaint.
  function wire() {
    var panel = document.getElementById('panel-social');
    if (!panel || panel.__lbWired) return;
    panel.__lbWired = true;
    panel.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest('[data-lb-cat],[data-lb-board]') : null;
      if (!t) return;
      var c = t.getAttribute('data-lb-cat');
      if (c) { selectCategory(c); return; }
      var b = t.getAttribute('data-lb-board');
      if (b) selectBoard(b);
    });
  }

  // ── Boot ────────────────────────────────────────────────────
  // Probe early so that by the time the player opens Social the picker already
  // knows its true shape. A failed probe costs one request and degrades.
  async function probeOnce() {
    if (!online() || probe) return;
    try {
      var r = await rpc('hr_leaderboard', { p_board: 'total_level', p_limit: 1, p_span: 0 });
      noteRpc(!isMissingRpc(r.status, r.json));
    } catch (e) { /* leave unknown — the first render will try again */ }
  }

  function boot() {
    try {
      ensureStyle();
      wire();
      setTimeout(function () { probeOnce().catch(function () {}); }, 2600);
    } catch (e) { try { console.warn('[leaderboards] boot failed', e); } catch (e2) {} }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  window.HearthriseLeaderboards = {
    BOARDS: BOARDS, CATEGORIES: CATEGORIES, SKILL_ORDER: SKILL_ORDER,
    TOP_N: TOP_N, SPAN: SPAN,
    render: render, wire: wire,
    selectCategory: selectCategory, selectBoard: selectBoard,
    current: function () { return { cat: curCat, board: curBoard }; },
    capability: capability,
    // Server-contract + layout seams — pure, no I/O. For the regression suite.
    _reduceBoard: reduceBoard,
    _buildView: buildView,
    _resolveSelection: resolveSelection,
    _boardsIn: boardsIn,
    _categoriesFor: categoriesFor,
    _scoreText: scoreText,
    _contextText: contextText,
    _crownFor: crownFor,
    _rowHtml: rowHtml,
    _boardHtml: boardHtml,
    _renownTitle: renownTitle,
    _agoText: agoText,
    _noteRpc: noteRpc,
    _resetProbe: _resetProbe
  };
})();
