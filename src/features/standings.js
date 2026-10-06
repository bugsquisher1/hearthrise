// src/features/standings.js — YOUR STANDING: your rival on Home, and the gap.
//
// Home's 'Your standing' block and the Social board's sentence. Every rank,
// total, rival name and score comes from ONE hr_leaderboard answer: the newest
// accepted one the leaderboard transport holds per uid|board, read through
// window.HearthriseLeaderboards.lastBoard(id), so Home and Social can never
// disagree. Nothing here computes a rank or owns a number (CLAUDE.md §6).
//
// ── WHO IS SHOWN ────────────────────────────────────────────────────────────
// The boards rank hero slot 0 only (2026-08-18-leaderboard-server-source.sql),
// so the block is drawn only for slot 0 (eligible()). An unknown skill hides the
// best-skill row rather than reading as zero, and a rank-null answer (the anon
// retry on an expired token) is omitted, never drawn as 'no place'.
//
// ── HOW OFTEN IT ASKS ───────────────────────────────────────────────────────
// Home repaints every 1.5 s while visible. A read is kicked only when signed in,
// Home is the active panel and the tab is visible, one at a time; a refusal is
// remembered per uid|board for TTL_MS. Nothing repaints on arrival: the next
// visible Home paint picks the answer up.
//
// setupStandings() publishes window.HearthriseStandings; no top-level window or
// DOM access, so tests/standings.mjs can import the module in Node.

import { STANDING_CROWNS } from '../data/standings.js?v=563';
import { SIGNPOSTS } from '../data/signposts.js?v=563';
import { fill } from './signposts.js?v=563';

export const TTL_MS = 300000;

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n).toLocaleString();
const label = (key) => SIGNPOSTS.labels[key] || '';
const lb = () => window.HearthriseLeaderboards;

const NEG = Object.create(null);
let inFlight = false;

/** The named crown of a skill board's rank 1; null for every other board. */
export function crownFor(boardId) {
  const m = /^skill:(\w+)$/.exec(String(boardId || ''));
  return (m && STANDING_CROWNS[m[1]]) || null;
}

/** The boards rank slot 0 only, so only slot 0 is told where it stands. */
export function eligible({ signedIn, slot, online } = {}) {
  return signedIn === true && slot === 0 && online === true;
}

/** The chip beside a row: the crown, a band, or '#rank of total'. */
export function bandFor(boardId, rank, total) {
  if (rank === 1) return lb().crownFor(boardId);
  if (rank >= 2 && rank <= 3) return label('standing.podium');
  if (rank >= 4 && rank <= 10) return label('standing.ten');
  if (rank >= 11 && rank <= 25) return label('standing.roll');
  return '#' + fmt(rank) + ' of ' + fmt(total);
}

function gapText(boardId, gap) {
  if (boardId === 'total_level') return fmt(gap) + (gap === 1 ? ' level' : ' levels');
  return fmt(gap) + ' xp';
}

/** {key, text} for one reduced answer, or null. Pure; the text is unescaped. */
export function standingLine(boardId, ans) {
  if (boardId !== 'total_level' && !String(boardId || '').startsWith('skill:')) return null;
  if (!ans || ans.available === false) return null;
  const board = lb().BOARDS[boardId].label;
  if (ans.rank == null) return { key: 'standing.unranked', text: fill('standing.unranked', { board }) };
  const rows = [].concat(ans.top || [], ans.near || []);
  const at = (r) => rows.find((x) => x && x.rank === r) || null;
  const me = at(ans.rank);
  if (!me) return null;
  const rival = at(ans.rank === 1 ? 2 : ans.rank - 1);
  let key, vars;
  if (ans.rank === 1 && !rival) {
    key = 'standing.crownAlone';
    vars = { board, crown: lb().crownFor(boardId) };
  } else {
    if (!rival) return null;
    const gap = ans.rank === 1 ? me.score - rival.score : rival.score - me.score;
    key = gap === 0 ? 'standing.level' : (ans.rank === 1 ? 'standing.crown' : 'standing.chase');
    vars = { rank: '#' + fmt(ans.rank), board, gap: gapText(boardId, gap), rival: rival.name, crown: lb().crownFor(boardId) };
  }
  const text = fill(key, vars);
  return text ? { key, text } : null;
}

/** Social's sentence for a signed-in player with no place on a board. */
export function unrankedText(boardId) {
  return fill('standing.unranked', { board: lb().BOARDS[boardId].label });
}

/** The Home block: null is the pending card (no number), else the drawn rows. */
export function cardHtml(model) {
  const head = (door) => '<div class="hd-h"><h3>' + esc(label('standing.heading')) + '</h3>' + door + '</div>';
  if (!model) {
    return '<div>' + head('') + '<div class="hd-rows"><div class="hd-card hd-duo">' +
      '<div class="mi">' + icon('totalLvl') + '</div>' +
      '<div class="bd"><div class="s">' + esc(label('standing.pending')) + '</div></div>' +
      '</div></div></div>';
  }
  const rows = (model.rows || []).map((r) => ({ r, line: standingLine(r.boardId, r.ans) })).filter((x) => x.line);
  if (!rows.length) return '';
  const first = rows[0].r.boardId;
  const ago = lb().agoText(model.refreshedAt);
  return '<div>' + head('<a data-st-open="' + esc(first) + '">' + esc(label('standing.boards')) + ' →</a>') +
    '<div class="hd-rows">' + rows.map(({ r, line }) => {
      const b = lb().BOARDS[r.boardId];
      return '<div class="hd-card hd-duo">' +
        '<div class="mi">' + icon(b.glyph) + '</div>' +
        '<div class="bd"><div class="t">' + esc(b.label) + '</div><div class="s">' + esc(line.text) + '</div></div>' +
        '<div class="when">' + esc(bandFor(r.boardId, r.ans.rank, r.ans.total)) + '</div>' +
      '</div>';
    }).join('') +
    '<div class="hd-card hd-mini">' + esc(fill('standing.read')) + (ago ? ' · ' + esc(ago) : '') + '</div>' +
    '</div></div>';
}

function icon(glyph) {
  const HR = window.HR;
  return (HR && typeof HR.icon === 'function') ? (HR.icon(glyph, 20, 'var(--gold-2)') || '') : '';
}

function uid() {
  const A = window.HearthriseAuth;
  return (A && typeof A.currentUserId === 'function' && A.currentUserId()) || '';
}

/** The best skill board by the server's xp, or null while any skill is unknown. */
function bestSkillBoard(G) {
  const SR = window.HearthriseSkillRecord;
  if (!SR || typeof SR.skillXpNum !== 'function') return null;
  let best = null, bestXp = 0;
  for (const id of lb().SKILL_ORDER) {
    const xp = SR.skillXpNum(G, id);
    if (xp == null) return null;
    if (xp > bestXp) { best = id; bestXp = xp; }
  }
  return best ? 'skill:' + best : null;
}

async function kick(id) {
  if (inFlight) return;
  if (document.visibilityState !== 'visible') return;
  const panel = document.getElementById('panel-profile');
  if (!panel || !panel.classList.contains('active')) return;
  const key = uid() + '|' + id;
  if (NEG[key] > Date.now()) return;
  inFlight = true;
  try {
    const res = await lb().fetchBoard(id, 1);
    if (!res || res.action !== 'accept' || res.available === false) NEG[key] = Date.now() + TTL_MS;
  } catch (e) {
    NEG[key] = Date.now() + TTL_MS;
  } finally {
    inFlight = false;
  }
}

/** Home's block for this hero, '' when it must not be drawn. */
export function card(G) {
  const LB = lb();
  const A = window.HearthriseAuth, P = window.HearthriseProfile;
  if (!LB || typeof LB.lastBoard !== 'function' || typeof LB.capability !== 'function') return '';
  if (!A || typeof A.isSignedIn !== 'function' || !P || typeof P.activeSlot !== 'function') return '';
  if (!eligible({ signedIn: A.isSignedIn(), slot: P.activeSlot(), online: LB.capability() !== 'offline' })) return '';
  const boards = [bestSkillBoard(G), 'total_level'].filter(Boolean);
  const rows = [];
  let waiting = false, oldest = null;
  for (const id of boards) {
    const hit = LB.lastBoard(id);
    if (!hit || Date.now() - hit.at >= TTL_MS) kick(id);
    if (!hit) { if (!(NEG[uid() + '|' + id] > Date.now())) waiting = true; continue; }
    const res = hit.res;
    if (res.available === false || res.rank == null || !standingLine(id, res)) continue;
    rows.push({ boardId: id, ans: res });
    const t = Date.parse(res.refreshedAt);
    if (isFinite(t) && (oldest == null || t < Date.parse(oldest))) oldest = res.refreshedAt;
  }
  if (!rows.length) return waiting ? cardHtml(null) : '';
  return cardHtml({ rows, refreshedAt: oldest });
}

export function setupStandings() {
  window.HearthriseStandings = Object.freeze({ crownFor, eligible, bandFor, standingLine, unrankedText, cardHtml, card, TTL_MS });
  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest ? e.target.closest('[data-st-open]') : null;
    if (!t) return;
    const id = t.getAttribute('data-st-open');
    if (typeof window.showTab === 'function') window.showTab('social');
    const LB = lb();
    if (LB && typeof LB.selectBoard === 'function') LB.selectBoard(id);
  });
}
