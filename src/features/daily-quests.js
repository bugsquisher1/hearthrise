// ════════════════════════════════════════════════════════════════════════
// src/features/daily-quests.js — THE ONE DAILY LIST (W0, coherence audit #5).
//
// Hearthrise had two daily lists: the server-paid daily quests (three a day
// from DAILY_TASK_POOL, paid by hr_claim_daily) and an older daily/weekly
// goals board drawn and counted in the browser. The board is cut
// (supabase/migrations/2026-10-16-goal-board-retire.sql); this module is the
// Quests sheet, the quest strip and the topbar badge for the one list left.
//
// EVERY NUMBER IS THE SERVER'S (CLAUDE.md §6). A row's count is today's
// `ev:<type>` counter from hr_tally_state, the one hr_claim_daily grades; its
// "Paid" mark is the server's claim row; Claim is offered only when the
// server's count has reached the goal and the server has not paid it. Unknown
// state reads the pending dash and offers nothing. The same cache feeds Home's
// "Your week" card (src/features/this-week.js) through
// window.HearthriseTally.peek().
//
// The browser's own daily-task progress (legacy.js updateDaily) still fires
// the claim the moment the player finishes in front of the screen; the server
// verifies it and this sheet repaints from the next tally.
// ════════════════════════════════════════════════════════════════════════

var PEEK_MS = 120000;          // a tally older than this is unknown, not stale-true
var AMBIENT_MS = 30000;        // the strip's gesture-less refresh, at most this often

var _tally = null;
var _tallyAt = 0;
var _inflight = false;
var _triedAt = 0;              // the last read sent, answered or not
var _claiming = Object.create(null);

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    Object.keys(o).forEach(function (k) { deepFreeze(o[k]); });
  }
  return o;
}

function transport() {
  var GC = window.HearthriseGoalClaim;
  return (GC && typeof GC.tallyState === 'function' && GC.isSignedIn && GC.isSignedIn()) ? GC : null;
}

/** The server's tally, or null when it has not been read or is older than 120 s. */
function peek() {
  return _tally && (Date.now() - _tallyAt) < PEEK_MS ? _tally : null;
}

/**
 * Re-read the tally. `maxAgeMs` skips the read while a fresh one is held.
 * done(fresh) runs once, true only when a new answer landed.
 */
function refresh(done, maxAgeMs) {
  var cb = typeof done === 'function' ? done : function () {};
  var GC = transport();
  /* An ambient read (maxAgeMs given) waits that long after the last read SENT,
     answered or not, so a refusing server is asked twice a minute, never every
     repaint. A gesture (no maxAgeMs) always asks. */
  if (!GC || _inflight || (typeof maxAgeMs === 'number' && (Date.now() - _triedAt) < maxAgeMs)) {
    cb(false); return;
  }
  _inflight = true;
  _triedAt = Date.now();
  GC.tallyState().then(function (res) {
    _inflight = false;
    if (res && res.ok === true && res.day && typeof res.day === 'object') {
      _tally = deepFreeze({
        day: res.day, week: res.week || {},
        goldDay: Number(res.gold_day) || 0, goldWeek: Number(res.gold_week) || 0,
        paid: Array.isArray(res.paid) ? res.paid.slice() : [],
        offered: Array.isArray(res.offered) ? res.offered.slice() : null,
      });
      _tallyAt = Date.now();
      cb(true);
    } else cb(false);
  }, function () { _inflight = false; cb(false); });
}

/* ── THE LIST ─────────────────────────────────────────────────────────── */

function taskDef(id) {
  var G = window.G;
  var mine = G && G.daily && Array.isArray(G.daily.tasks) ? G.daily.tasks : [];
  for (var i = 0; i < mine.length; i++) if (mine[i] && mine[i].id === id) return mine[i];
  var pool = Array.isArray(window.DAILY_TASK_POOL) ? window.DAILY_TASK_POOL : [];
  for (var j = 0; j < pool.length; j++) {
    var t = null;
    try { t = typeof pool[j] === 'function' ? pool[j]() : pool[j]; } catch (e) { t = null; }
    if (t && t.id === id) return t;
  }
  return null;
}

/** Today's daily quests: the server's offered set when known, else the slate. */
function tasks() {
  var t = peek();
  var G = window.G;
  var ids = (t && t.offered) ? t.offered
    : ((G && G.daily && Array.isArray(G.daily.tasks)) ? G.daily.tasks.map(function (x) { return x && x.id; }) : []);
  return ids.map(taskDef).filter(Boolean);
}

/** The server's count for a task today, capped at its goal; null when unknown. */
function serverCount(task) {
  var t = peek();
  if (!t || !task || !task.type) return null;
  var n = Number(t.day['ev:' + task.type]);
  return Math.min(Number(task.goal) || 0, Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);
}
/** Is a task's payout the server's? daily_harvest has a dynamic goal and no server row. */
function serverPays(task) { return !!task && task.id !== 'daily_harvest'; }
function isPaid(task) { var t = peek(); return !!(t && task && t.paid.indexOf(task.id) >= 0); }
function isComplete(task) { var n = serverCount(task); return n !== null && n >= (Number(task.goal) || 0) && task.goal > 0; }
function isClaimable(task) { return serverPays(task) && isComplete(task) && !isPaid(task); }

/* ── CLAIM: an intent; the payout and the Paid mark come back from the server ── */
function claim(id) {
  var GC = window.HearthriseGoalClaim;
  var task = taskDef(id);
  if (!task || !isClaimable(task) || _claiming[id]) return null;
  if (!(GC && typeof GC.claimDaily === 'function')) return null;
  _claiming[id] = true;
  var heldAt = _tallyAt;
  var p = GC.claimDaily(id);
  return Promise.resolve(p).then(function (res) {
    delete _claiming[id];
    var notify = typeof window.notify === 'function' ? window.notify : function () {};
    if (res && res.ok) {
      var got = (GC.grantedReward && GC.grantedReward(res)) || null;
      notify('Daily quest paid: ' + (got && got.gold ? got.gold.toLocaleString() + ' gold' : task.label), 'loot');
    } else if (res && res.error === 'already_claimed') {
      notify('Already paid — your reward is safe', 'loot');
    } else {
      var sf = window.HearthriseSettleFirst && window.HearthriseSettleFirst.settleRefusalText(res);
      notify(sf || 'That claim did not go through — your progress is safe, try again in a moment', 'kill');
    }
    if (_tallyAt === heldAt) _tallyAt = 0;   // the verdict stales THIS picture (a newer one stands)
    refresh(function () { render(); });
    return res;
  }, function () { delete _claiming[id]; render(); return null; });
}

/* ── RENDER ───────────────────────────────────────────────────────────── */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function glyph(key, px, col) {
  var HR = window.HR;
  return (HR && HR.icon) ? (HR.icon(key, px, col || 'currentColor') || HR.icon('uiTarget', px, col || 'currentColor') || '') : '';
}
function glyphFor(task) {
  var map = { kill_any: 'uiSword', gather: 'uiPickaxe', harvest: 'uiWheat', cooked: 'uiPot', smithed: 'uiAnvil', crafted: 'crafting' };
  return map[task.type] || 'uiTarget';
}
function pending() {
  var HB = window.HearthriseBalance;
  return (HB && HB.countMarkup) ? HB.countMarkup(null, { label: 'Not counted yet' }) : '—';
}
function hoursLeft() {
  return typeof window.hoursTillUTCMidnight === 'function' ? window.hoursTillUTCMidnight() : null;
}
function goldHtml(n) {
  var HR = window.HR;
  return (HR && HR.amount) ? HR.amount('gold', Number(n || 0).toLocaleString(), 14, '--gold-2') : (Number(n || 0).toLocaleString() + ' gold');
}

function rowHtml(task) {
  var n = serverCount(task);
  var goal = Number(task.goal) || 0;
  var paid = isPaid(task);
  var pct = n === null ? 0 : Math.min(100, goal > 0 ? (n / goal) * 100 : 0);
  var btn = '';
  if (paid) btn = '<span class="qm-q-claimed">✓ Paid</span>';
  else if (isClaimable(task)) btn = '<button class="qm-q-claim" data-hr-settle-latch data-qid="' + esc(task.id) + '">Claim</button>';
  else if (!serverPays(task)) btn = '<span class="qm-q-confirming">No reward yet</span>';
  var QN = window.HearthriseQuestNav;
  var dest = (!paid && !isComplete(task) && QN && QN.destination) ? QN.destination(task) : null;
  var go = dest ? '<button class="qm-q-go" data-goto="' + esc(task.id) + '" title="' + esc(dest.label) + '">' + esc(dest.verb) + '</button>' : '';
  var reward = serverPays(task)
    ? '<div class="qm-q-reward"><div class="qm-r-label">Reward</div><div class="qm-r-val">' + goldHtml(task.reward) + '</div></div>'
    : '';
  return '<div class="qm-quest' + (isClaimable(task) ? ' claimable' : (paid || isComplete(task) ? ' done' : '')) + '"'
    + (go ? ' data-goto="' + esc(task.id) + '"' : '') + '>'
    + '<div class="qm-q-icon">' + glyph(glyphFor(task), 26, '--gold-2') + '</div>'
    + '<div class="qm-q-info"><div class="qm-q-name">' + esc(task.label) + '</div>'
    + '<div class="qm-q-progbar"><i style="width:' + pct.toFixed(1) + '%"></i></div>'
    + '<div class="qm-q-progtext">' + (n === null ? pending() : n) + ' / ' + goal + '</div></div>'
    + reward + go + btn + '</div>';
}

function renderModal() {
  var overlay = document.getElementById('quests-modal-overlay');
  if (!overlay) return;
  var list = tasks();
  var box = overlay.querySelector('#qm-list');
  if (box) {
    box.innerHTML = list.length ? list.map(rowHtml).join('')
      : '<div class="qm-info-text">Today\'s quests arrive with your character.</div>';
  }
  var paid = list.filter(isPaid).length;
  var ready = list.filter(isClaimable).length;
  var sum = overlay.querySelector('#qm-summary');
  if (sum) {
    sum.innerHTML = '<div class="qm-sum-row"><span>Today\'s quests</span><b>' + list.length + '</b></div>'
      + '<div class="qm-sum-row claimable"><span>Ready to claim</span><b>' + ready + '</b></div>'
      + '<div class="qm-sum-row"><span>Paid</span><b>' + paid + '</b></div>';
  }
  var reset = overlay.querySelector('#qm-reset');
  var h = hoursLeft();
  if (reset) reset.textContent = h ? 'New quests in ' + h + 'h (UTC midnight)' : '';
}

function ensureStrip() {
  var strip = document.getElementById('global-quests-strip');
  if (strip) return strip;
  var main = document.querySelector('main.main') || document.querySelector('main');
  if (!main) return null;
  strip = document.createElement('div');
  strip.id = 'global-quests-strip';
  strip.className = 'global-quests-strip';
  strip.innerHTML = '<span class="gq-label">' + glyph('uiQuests', 14, '--gold-2') + ' Quests</span>'
    + '<div class="gq-list"></div><span class="gq-meta" id="gq-reset"></span><span class="gq-open-hint">Click to open ▸</span>';
  strip.addEventListener('click', openQuestsModal);
  var topbar = main.querySelector('.topbar');
  if (topbar && topbar.nextSibling) main.insertBefore(strip, topbar.nextSibling);
  else main.insertBefore(strip, main.firstChild);
  return strip;
}

var _ambientParked = false;
function renderStrip() {
  var P = window.HearthrisePresence;
  if (P && P.inOfflineReplay && P.inOfflineReplay()) return;
  var strip = ensureStrip();
  if (!strip) return;
  if (!_ambientParked) refresh(function (fresh) { if (fresh) renderStrip(); }, AMBIENT_MS);
  var list = strip.querySelector('.gq-list');
  var rows = tasks();
  if (list) {
    list.innerHTML = rows.map(function (task) {
      var n = serverCount(task);
      var mark = isPaid(task) ? '✓ ' : (isClaimable(task) ? glyph('uiGift', 13, '--gold') + ' ' : '');
      return '<span class="gq-quest' + (isPaid(task) || isComplete(task) ? ' done' : '') + '">'
        + '<span class="gq-icon">' + glyph(glyphFor(task), 15) + '</span>'
        + '<span class="gq-name">' + mark + esc(task.label) + '</span>'
        + '<span class="gq-prog">' + (n === null ? pending() : n) + ' / ' + (Number(task.goal) || 0) + '</span></span>';
    }).join('');
  }
  var meta = strip.querySelector('#gq-reset');
  var h = hoursLeft();
  if (meta) meta.textContent = h ? 'Resets in ' + h + 'h' : '';
}

function render() {
  renderStrip();
  renderModal();
}

function closeQuestsModal() {
  var existing = document.getElementById('quests-modal-overlay');
  if (existing) existing.remove();
}

function openQuestsModal() {
  closeQuestsModal();
  var overlay = document.createElement('div');
  overlay.className = 'qm-overlay';
  overlay.id = 'quests-modal-overlay';
  overlay.innerHTML = '<div class="qm-modal" style="position:relative">'
    + '<button class="qm-close" aria-label="Close">✕</button>'
    + '<div class="qm-tabs"><span class="qm-tab active">Daily quests</span></div>'
    + '<div class="qm-body"><div class="qm-list" id="qm-list"></div>'
    + '<aside class="qm-aside"><div><h4>Today</h4><div class="qm-summary" id="qm-summary"></div></div>'
    + '<div><p class="qm-info-text">Three quests a day, paid in gold when the realm has counted your work. '
    + 'Fights and gathering while you are away count too.</p></div>'
    + '<div class="qm-reset" id="qm-reset"></div></aside></div></div>';
  overlay.querySelector('.qm-close').addEventListener('click', closeQuestsModal);
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) { closeQuestsModal(); return; }
    var btn = e.target.closest && e.target.closest('.qm-q-claim');
    if (btn) { claim(btn.dataset.qid); return; }
    var hit = e.target.closest && e.target.closest('[data-goto]');
    if (!hit || !overlay.contains(hit)) return;
    var task = taskDef(hit.dataset.goto);
    var QN = window.HearthriseQuestNav;
    if (!task || !QN || typeof QN.go !== 'function') return;
    closeQuestsModal();
    QN.go(task);
  });
  document.body.appendChild(overlay);
  renderModal();
  refresh(function (fresh) { if (fresh) render(); });
}

/** The topbar badge: quests not yet paid, and how many are ready to claim. */
function questBadgeState() {
  var out = { active: 0, claimable: 0 };
  tasks().forEach(function (task) {
    if (isPaid(task)) return;
    out.active++;
    if (isClaimable(task)) out.claimable++;
  });
  return out;
}

window.HearthriseTally = {
  peek: peek,
  refresh: refresh,
  /* Test seams: feed a tally in the server's shape (null forgets it), and park
     the strip's gesture-less read for the suite's run. */
  __feed: function (res) {
    if (res === null) { _tally = null; _tallyAt = 0; _triedAt = 0; return; }
    _tally = deepFreeze({
      day: res.day || {}, week: res.week || {}, goldDay: Number(res.gold_day) || 0,
      goldWeek: Number(res.gold_week) || 0, paid: (res.paid || []).slice(),
      offered: Array.isArray(res.offered) ? res.offered.slice() : null,
    });
    _tallyAt = typeof res.__at === 'number' ? res.__at : Date.now();
  },
  __park: function (on) { var was = _ambientParked; _ambientParked = !!on; return was; },
};
window.HearthriseDailyQuests = {
  tasks: tasks, serverCount: serverCount, isPaid: isPaid, isClaimable: isClaimable, claim: claim, render: render,
};
window.openQuestsModal = openQuestsModal;
window.closeQuestsModal = closeQuestsModal;
window.questBadgeState = questBadgeState;
window.renderQuestStrip = renderStrip;

function boot(tries) {
  var E = window.HearthriseEvents;
  if (!E || typeof E.on !== 'function') {
    if (tries > 0) setTimeout(function () { boot(tries - 1); }, 200);
    return;
  }
  E.on('*', function () {
    renderStrip();
    if (document.getElementById('quests-modal-overlay')) renderModal();
  });
}
if (typeof document !== 'undefined') {
  setInterval(function () { renderStrip(); if (document.getElementById('quests-modal-overlay')) renderModal(); }, 2000);
  boot(50);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeQuestsModal(); });
}
