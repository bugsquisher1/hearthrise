// src/features/come-back.js — COME BACK FOR: Home's reasons to return.
//
// Turns clocks the server already owns into at most MAX_ROWS rows: a ripe or
// waterable crop, the next crop to ripen, the soonest dungeon Auto-Run window,
// the Boss of the Day in reach, and the midnight UTC roll of quests and boss.
// It is read-and-navigate only: nothing here sends an intent, spends, gates or
// claims, and every number comes from a server reader (CLAUDE.md §6):
//   crops    HearthriseFarm (the farm tile's predicates over the projected plots)
//   windows  G._dungeonCooldowns (mirrored from the envelope) + serverItemCount
//   boss     HearthriseBossOfDay.botdFor / killBonusesFor (src/core/botd.js)
//
// inputs(G, now) gathers, model(inputs) is pure, card(G) renders. Home repaints
// every 1.5 s, so there is no timer here. setupComeBack() publishes
// window.HearthriseComeBack and one delegated click listener on [data-cbk].

const LOOKAHEAD_DAYS = 7;
const MAX_ROWS = 4;
const DAY_MS = 86400000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function clock(ms) {
  const m = Math.max(1, Math.ceil(ms / 60000));
  return m >= 60 ? Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm' : m + 'm';
}
const pct = (x) => Math.round((x - 1) * 100);

function cropsOf(G) {
  const F = window.HearthriseFarm, CROPS = window.CROPS || {};
  if (!F || !G || !Array.isArray(G.farmPlots)) return [];
  const out = [];
  for (const p of G.farmPlots) {
    if (!p || !CROPS[p.cropId]) continue;
    const ready = p.state === 'ready' || !!F.isReady(p);
    out.push({ name: CROPS[p.cropId].name, ready, waterable: !ready && !!F.isWaterable(p), inMs: ready ? 0 : F.readyInMs(p) });
  }
  return out;
}

function windowsOf(G, now) {
  const D = window.DUNGEONS || {}, ITEMS = window.ITEMS || {}, A = window.HearthriseAccrual;
  const out = [];
  for (const id of Object.keys((G && G._dungeonCooldowns) || {})) {
    const d = D[id];
    if (!d) continue;
    const untilMs = Date.parse((G._dungeonCooldowns[id] || {}).auto);
    if (!Number.isFinite(untilMs) || !(untilMs > now)) continue;
    const key = d.cost && d.cost.key;
    out.push({ name: d.name, untilMs, keyName: key ? ((ITEMS[key] || {}).n || key) : null,
      keys: key && A && typeof A.serverItemCount === 'function' ? A.serverItemCount(G, key) : null });
  }
  return out;
}

function bossDaysOf(now) {
  const B = window.HearthriseBossOfDay, M = window.MONSTERS || {}, C = window.HearthriseCore;
  if (!B || !C || !C.botd) return null;
  const out = [];
  for (let k = 0; k < LOOKAHEAD_DAYS; k++) {
    const t = now + k * DAY_MS, b = B.botdFor(t), m = b && M[b.dailyId];
    if (!m) return null;
    out.push({ k, t, id: b.dailyId, name: m.name, req: (m.tier - 1) * 15,
      weekday: WEEKDAYS[new Date(t).getUTCDay()], bonus: B.killBonusesFor(b.dailyId, t) });
  }
  return out;
}

function inputs(G, now) {
  const SR = window.HearthriseSkillRecord, B = window.HearthriseBossOfDay;
  const bossDays = bossDaysOf(now);
  const combatLv = SR && SR.isSkillXpKnown(G, 'attack') && typeof window.getCombatLevel === 'function'
    ? window.getCombatLevel() : null;
  return { now, crops: cropsOf(G), windows: windowsOf(G, now), combatLv, bossDays,
    msToMidnight: B ? B.msUntilRotate() : 0,
    fighting: !!(bossDays && G && G.activeMonster === bossDays[0].id) };
}

function bossRow(combatLv, days, msToMidnight, fighting) {
  if (combatLv == null || !days) return null;
  const d0 = days[0];
  if (combatLv >= d0.req) {
    return { kind: 'boss', glyph: 'uiSkull', t: d0.name + ' is today\'s Boss of the Day', when: clock(msToMidnight) + ' left',
      sHtml: esc(fighting ? 'You are fighting it now — leave this fight set.'
        : '+' + pct(d0.bonus.dropMult) + '% drop odds and +' + pct(d0.bonus.xpMult) + '% kill XP, and it pays while you are away.'),
      sort: msToMidnight };
  }
  const next = days.find((d) => d.k > 0 && combatLv >= d.req);
  if (next) {
    return { kind: 'boss', glyph: 'uiSkull', t: next.name + ' is your next Boss of the Day', sHtml: esc('Featured from midnight UTC.'),
      when: next.k === 1 ? 'Tomorrow' : next.weekday, sort: next.k * DAY_MS };
  }
  const low = days.reduce((a, d) => (d.req < a.req ? d : a));
  const on = low.k === 0 ? 'today' : low.k === 1 ? 'tomorrow' : 'on ' + low.weekday;
  return { kind: 'boss', glyph: 'uiSkull', t: 'At Combat ' + low.req + ' the Boss of the Day opens to you',
    sHtml: esc(low.name + ' is featured ' + on + '.'), when: '', sort: Infinity };
}

/** Pure: the rows, 'Now' first, then by clock, the new-day row always last. */
function model({ now, crops, windows, combatLv, bossDays, msToMidnight, fighting }) {
  const rows = [];
  const ready = (crops || []).filter((c) => c.ready);
  if (ready.length) {
    const n = ready.length - 1;
    rows.push({ kind: 'ready', glyph: 'navFarm', door: 'farm', when: 'Now', sort: -2, sHtml: '',
      t: n ? ready[0].name + ' and ' + n + ' more plot' + (n === 1 ? '' : 's') + ' are ready to harvest' : ready[0].name + ' is ready to harvest' });
  }
  const wet = (crops || []).filter((c) => c.waterable);
  if (wet.length) {
    rows.push({ kind: 'water', glyph: 'uiSprout', door: 'farm', when: 'Now', sort: -1,
      t: wet.length === 1 ? wet[0].name + ' can take water' : wet.length + ' plots can take water',
      sHtml: esc('Watered, a crop grows twice as fast for two hours.') });
  }
  const growing = (crops || []).filter((c) => !c.ready && Number.isFinite(c.inMs) && c.inMs > 0)
    .sort((a, b) => a.inMs - b.inMs)[0];
  if (growing) {
    rows.push({ kind: 'ripens', glyph: 'uiHourglass', door: 'farm', t: growing.name + ' ripens', sHtml: '',
      when: 'in about ' + clock(growing.inMs), sort: growing.inMs });
  }
  const win = (windows || []).slice().sort((a, b) => a.untilMs - b.untilMs)[0];
  if (win) {
    const BAL = window.HearthriseBalance;
    const count = BAL && typeof BAL.countMarkup === 'function' ? BAL.countMarkup(win.keys) : esc(win.keys == null ? '—' : win.keys);
    rows.push({ kind: 'dungeon', glyph: 'uiCastle', door: 'dungeons', t: win.name + ' Auto-Run opens again',
      sHtml: win.keyName == null ? '' : esc(win.keyName) + ' held: ' + count,
      when: 'in ' + clock(win.untilMs - now), sort: win.untilMs - now });
  }
  const boss = bossRow(combatLv, bossDays, msToMidnight, fighting);
  if (boss) rows.push(Object.assign(boss, { door: 'boss' }));
  const out = rows.map((r, i) => [r, i]).sort((a, b) => (a[0].sort - b[0].sort) || (a[1] - b[1]))
    .slice(0, MAX_ROWS - 1).map(([r]) => r);
  out.push({ kind: 'newday', glyph: 'uiScroll', door: 'quests', t: 'New daily quests and a new Boss of the Day',
    sHtml: '', when: 'in ' + clock(msToMidnight) });
  return out.map(({ kind, glyph, t, sHtml, when, door }) => ({ kind, glyph, t, sHtml, when, door }));
}

function icon(glyph, colour) {
  const HR = window.HR;
  return (HR && typeof HR.icon === 'function') ? (HR.icon(glyph, 20, colour) || '') : '';
}
const TONE = { ready: 'var(--green)', water: 'var(--green)', newday: 'var(--ink-2)' };

function card(G) {
  const rows = model(inputs(G, Date.now())).map((r) =>
    '<div class="hd-card hd-duo" data-cbk="' + esc(r.door) + '" data-cbk-row="' + esc(r.kind) + '" style="cursor:pointer">' +
      '<div class="mi">' + icon(r.glyph, r.when ? (TONE[r.kind] || 'var(--gold-2)') : 'var(--ink-3)') + '</div>' +
      '<div class="bd"><div class="t">' + esc(r.t) + '</div>' + (r.sHtml ? '<div class="s">' + r.sHtml + '</div>' : '') + '</div>' +
      (r.when ? '<div class="when">' + esc(r.when) + '</div>' : '') +
    '</div>').join('');
  return '<div data-cbk-section><div class="hd-h"><h3>Come back for</h3></div><div class="hd-rows">' + rows + '</div></div>';
}

function onClick(e) {
  const el = e.target && e.target.closest && e.target.closest('[data-cbk]');
  if (!el) return;
  const door = el.getAttribute('data-cbk');
  if (door === 'quests') { if (typeof window.openQuestsModal === 'function') window.openQuestsModal(); return; }
  const tab = { farm: 'farming', dungeons: 'dungeons', boss: 'combat' }[door];
  if (tab && typeof window.showTab === 'function') window.showTab(tab);
}

export function setupComeBack() {
  window.HearthriseComeBack = Object.freeze({ inputs, model, card, LOOKAHEAD_DAYS, MAX_ROWS });
  document.addEventListener('click', onClick);
}
