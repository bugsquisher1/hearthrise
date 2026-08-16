// ════════════════════════════════════════════════════════════════════════
// src/features/combat-screens.js — THE WAR TABLE and THE FIGHT (b362)
//
// Phase 1 of docs/design/combat-screen-rework.md — cards COMBAT-UI-01…16.
// One panel, two views, one job each:
//
//   THE WAR TABLE   a MENU. "What am I going to fight?" — every combat entry
//                   point in the game as one destination row, then a portrait
//                   grid dense enough to show a whole tier without scrolling.
//   THE FIGHT       a STAGE. One foe, full attention: symmetric five-row
//                   grammar, in-bar HP numerics, swing bars, six stat tiles,
//                   gear quick-swap, an action bar where every control carries
//                   live data, a measured metrics strip, log + loot rail.
//
// ── WHY THIS IS A RENDER LAYER AND NOT A REWRITE ─────────────────────────
// The combat ENGINE is untouched. So is the arena's own paint loop: this
// module BUILDS the `.arena-vs` markup (with the extra rows the new grammar
// needs) and leaves it exactly where `setupArenaVs()` in legacy.js looks for
// it — a direct child of `.combat-arena`. legacy's `ensureArenaVs()` therefore
// finds it instead of creating one, and everything already wired to those ids
// keeps working with no second copy: HP bars, the foe icon guard, the pet
// perch, the floating damage numbers, the DEFEATED stamp, and the two action
// MOUNTS that `HearthriseCombatHud` paints Eat / Loot / Stats into.
//
// The three things this module refuses to duplicate, because a second copy is
// how a HUD comes to disagree with the fight it describes:
//   • the damage maths     → `HearthriseCombatHud._forecast()`
//   • the Eat button       → the HUD's own mount and its own click handler
//   • the swing clock      → `combatTick` is wrapped to STAMP the last tick;
//                            the bars read that stamp against `combatTickMs()`,
//                            the same value the engine divides the span by.
//                            There is one clock. A bar out of phase with the
//                            damage is worse than no bar (spec §8, Phase 3).
//
// ── THE HONESTY GATE ON THE METRICS STRIP (spec §6, last row) ────────────
// Design will not advertise a rate the server pays as zero. So the strip is
// NOT a DPS extrapolation: it is a MEASUREMENT of credits that actually
// landed — combat XP and lifetime-gold deltas sampled against a wall clock
// since this fight began. Until a real credit has landed it says so, and for a
// fight long enough that nothing has been paid yet it says
// "long fight — pays on the kill" rather than quoting a number.
// ════════════════════════════════════════════════════════════════════════

import { MONSTERS } from '../data/monsters.js?v=363';
import { ITEMS } from '../data/items.js?v=363';

/* ── small shared helpers ────────────────────────────────────────────────*/
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));
const num = (n) => (Number.isFinite(n) ? Math.round(n).toLocaleString() : '—');
const G = () => window.G;
const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);

function fmtRun(s) {
  if (s == null || !isFinite(s)) return '—';
  if (s < 90) return Math.round(s) + 's';
  if (s < 3600) return Math.round(s / 60) + 'm';
  const h = Math.floor(s / 3600); const mm = Math.round((s % 3600) / 60);
  return h + 'h' + (mm ? ' ' + mm + 'm' : '');
}
function fmtCountdown(ms) {
  if (!isFinite(ms) || ms <= 0) return 'soon';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  if (d >= 1) return d + 'd ' + Math.floor((s % 86400) / 3600) + 'h';
  const h = Math.floor(s / 3600);
  if (h >= 1) return h + 'h ' + Math.floor((s % 3600) / 60) + 'm';
  return Math.floor(s / 60) + 'm';
}
function weaponLabel(t) { return (window.WEAPON_TYPES && window.WEAPON_TYPES[t]) || t || '—'; }
function combatLevel() { return typeof window.getCombatLevel === 'function' ? window.getCombatLevel() : 1; }
function tickMs() {
  if (typeof window.combatTickMs === 'function') { try { return window.combatTickMs(); } catch (e) { /* fall through */ } }
  return (window.COMBAT_BALANCE && window.COMBAT_BALANCE.tickMs) || 2400;
}
/** The unlock gate the whole game uses for a tier. One formula, one place. */
function reqLevelFor(m) { return (((m && m.tier) || 1) - 1) * 15; }

function monsterArt(id, cls) {
  const path = window._monsterIcon && window._monsterIcon[id];
  if (path) return `<img class="${cls}" src="${path}" alt="" loading="lazy" />`;
  const IS = window.HearthriseIconSet;
  if (IS && typeof IS.medallionMon === 'function') {
    const g = IS.medallionMon(id, 96);
    if (g) return `<span class="${cls} is-glyph">${g}</span>`;
  }
  const m = MONSTERS[id];
  return `<span class="${cls} is-emoji">${(m && m.icon) || '👾'}</span>`;
}

/* ══════════════════════════════════════════════════════════════════════
   1 · THE LEDGER — measured credits, not predicted ones
   ══════════════════════════════════════════════════════════════════════
   The metrics strip, the session loot history and the log's loot rail are all
   fed from ONE sampler that watches real state change. Nothing here predicts:
   if the server has not paid it, this ledger does not know about it, which is
   exactly the property the strip needs.

   Sampled at 1s, which is well under the 2.4s swing, and each sample is a
   handful of numeric reads plus one pass over the inventory keys. */
const COMBAT_XP_SKILLS = ['attack', 'strength', 'defense', 'defence', 'hitpoints', 'ranged', 'magic'];

const Ledger = (() => {
  let run = null;         // { foe, at, xp0, gold0, kills0, inv } — one fight
  let lastSampleAt = 0;

  /* `G.skills[id]` is a RAW XP NUMBER (legacy.js:617), not a record. Reading
     `.xp` off it returns undefined and the strip measures zero forever, which
     is the quiet way an honesty gate becomes a permanent refusal. The object
     branch is kept only so a future shape change degrades to "measuring…"
     rather than to a wrong number. */
  function combatXp() {
    const g = G(); if (!g || !g.skills) return 0;
    let t = 0;
    COMBAT_XP_SKILLS.forEach((k) => {
      const s = g.skills[k];
      if (typeof s === 'number') t += s;
      else if (s && typeof s.xp === 'number') t += s.xp;
    });
    return t;
  }
  function goldEarned() {
    const g = G();
    return (g && g.stats && Number(g.stats.totalGoldEarned)) || 0;
  }
  function kills() {
    const g = G();
    return (g && g.stats && Number(g.stats.kills)) || 0;
  }
  function invSnapshot() {
    const g = G(); const out = {};
    if (g && g.inventory) for (const k in g.inventory) out[k] = g.inventory[k] || 0;
    return out;
  }

  function begin(foe) {
    run = {
      foe, at: Date.now(),
      xp0: combatXp(), gold0: goldEarned(), kills0: kills(),
      inv: invSnapshot(), gained: {}, order: [],
    };
  }
  function end() { run = null; }

  function sample() {
    const g = G();
    if (!g || !g.activeMonster) { if (run) end(); return; }
    if (!run || run.foe !== g.activeMonster) begin(g.activeMonster);
    const now = Date.now();
    if (now - lastSampleAt < 1000) return;
    lastSampleAt = now;
    /* Loot: POSITIVE inventory deltas only. Eating a Provision is a negative
       delta and is not loot; nothing else spends from the bag mid-fight. */
    const g2 = g.inventory || {};
    for (const id in g2) {
      const before = run.inv[id] || 0;
      const after = g2[id] || 0;
      if (after > before) {
        const d = after - before;
        if (!run.gained[id]) run.order.unshift(id);
        run.gained[id] = (run.gained[id] || 0) + d;
      }
      run.inv[id] = after;
    }
    for (const id in run.inv) if (!(id in g2)) run.inv[id] = 0;
  }

  /* What the strip is allowed to say. Every branch here is a refusal or a
     measurement — there is no third kind. */
  function metrics() {
    if (!run) return null;
    const elapsedS = (Date.now() - run.at) / 1000;
    const dKills = kills() - run.kills0;
    const dXp = combatXp() - run.xp0;
    const dGold = goldEarned() - run.gold0;
    return {
      elapsedS, kills: dKills, xp: dXp, gold: dGold,
      /* A rate needs BOTH a settled credit and enough span for the average to
         mean anything. 45s is ~19 swings at the 2.4s base tick. */
      rateReady: dKills > 0 && elapsedS >= 45,
      xpPerMin: elapsedS > 0 ? (dXp / elapsedS) * 60 : 0,
      goldPerMin: elapsedS > 0 ? (dGold / elapsedS) * 60 : 0,
    };
  }
  function loot() {
    if (!run) return [];
    return run.order.map((id) => ({ id, qty: run.gained[id] }));
  }
  function lootCount() { return run ? run.order.length : 0; }

  return { sample, metrics, loot, lootCount, _end: end };
})();

/* ══════════════════════════════════════════════════════════════════════
   2 · THE SWING CLOCK — one clock, stamped by the engine's own tick
   ══════════════════════════════════════════════════════════════════════ */
const Swing = (() => {
  let lastTickAt = 0;
  function install() {
    const orig = window.combatTick;
    if (typeof orig !== 'function' || orig.__hrSwingStamped) return;
    const wrapped = function () { lastTickAt = Date.now(); return orig.apply(this, arguments); };
    wrapped.__hrSwingStamped = true;
    window.combatTick = wrapped;
  }
  /* 0..1 through the current swing. Returns 0 (a still bar) whenever we do not
     have a real stamp, which is the honest answer in preview and the frame
     after a settle correction. */
  function phase() {
    if (!lastTickAt) return 0;
    const span = Math.max(1, tickMs());
    return clamp01((Date.now() - lastTickAt) / span);
  }
  function reset() { lastTickAt = 0; }
  return { install, phase, reset };
})();

/* ══════════════════════════════════════════════════════════════════════
   3 · THE STRUCTURE
   ══════════════════════════════════════════════════════════════════════
   Built once and then only updated. The legacy cards are MOVED, never
   deleted: `.combat-picker` still owns `#monster-list`, `.combat-loadout`
   still owns `#loadout-panel`, and `.combat-arena` still owns `#combat-area`,
   so every legacy renderer, wrapper and test that addresses them by id keeps
   working. They are hidden by the stylesheet, not by removal — deleting a node
   a 17k-line engine writes into is how you get a silent null-render. */
const QUICK_SLOTS = ['weapon', 'helmet', 'body', 'pants', 'gloves', 'ring1'];

function slotMeta(slot) {
  const M = window.EQUIP_SLOT_META || {};
  return M[slot] || { label: slot, icon: '·' };
}

function panel() { return document.getElementById('panel-combat'); }

function ensureStructure() {
  const p = panel();
  if (!p || p.querySelector('.cbt-views')) return !!p;

  const views = document.createElement('div');
  views.className = 'cbt-views';
  views.innerHTML = `
    <section class="wt-view" aria-label="War Table">
      <div class="wt-ribbon" id="wt-ribbon" hidden></div>
      <div class="wt-dest-rail"><div class="wt-dests" id="wt-dests"></div></div>
      <div class="wt-bar">
        <div class="wt-chips" id="wt-tiers"></div>
        <div class="wt-chips wt-classes" id="wt-classes"></div>
      </div>
      <div class="wt-grid" id="wt-grid"></div>
    </section>
    <section class="fs-view" aria-label="The Fight">
      <div class="fs-top">
        <button type="button" class="fs-back" data-cs-act="back">◀ <span>War Table</span></button>
        <div class="fs-title" id="fs-title"></div>
        <div class="fs-gear" id="fs-gear"></div>
      </div>
      <div class="fs-stage-host" id="fs-stage-host"></div>
    </section>`;
  p.appendChild(views);

  const wt = views.querySelector('.wt-view');
  const fs = views.querySelector('.fs-view');
  const stageHost = views.querySelector('#fs-stage-host');

  const picker = p.querySelector('.combat-picker');
  if (picker) wt.appendChild(picker);
  const arena = p.querySelector('.combat-arena');
  if (arena) stageHost.appendChild(arena);
  const loadout = p.querySelector('.combat-loadout');
  if (loadout) fs.appendChild(loadout);

  buildStage(arena);
  p.addEventListener('click', onPanelClick);
  return true;
}

/* The stage markup. Ids are legacy's — see the header note on why. Extra rows
   are new and carry `fs-` names so nothing else can claim them. */
function buildStage(arena) {
  if (!arena) return;
  if (arena.querySelector(':scope > .arena-vs')) return;
  const vs = document.createElement('div');
  vs.className = 'arena-vs fs-stage';
  vs.innerHTML = `
    <div class="fs-scrim" aria-hidden="true"></div>
    <div class="arena-side player">
      <div class="arena-portrait" id="arena-player-portrait"></div>
      <div class="arena-name" id="arena-player-name">You</div>
      <div class="fs-lv" id="fs-player-lv">Lv 1</div>
      <div class="arena-hp-bar"><i id="arena-player-hp" style="width:100%"></i><span class="arena-hp-text" id="arena-player-hp-text">10 / 10</span></div>
      <div class="fs-swing" id="fs-player-swing"><i></i><span>—</span></div>
      <div class="fs-tiles" id="fs-player-tiles"></div>
      <div class="fs-style" id="fs-style"></div>
    </div>
    <div class="arena-vs-divider">VS</div>
    <div class="arena-side foe">
      <div class="arena-portrait" id="arena-foe-portrait"></div>
      <div class="arena-name" id="arena-foe-name">—</div>
      <div class="fs-lv" id="fs-foe-lv">—</div>
      <div class="arena-hp-bar"><i id="arena-foe-hp" style="width:100%"></i><span class="arena-hp-text" id="arena-foe-hp-text">— / —</span></div>
      <div class="fs-swing" id="fs-foe-swing"><i></i><span>—</span></div>
      <div class="fs-tiles" id="fs-foe-tiles"></div>
      <div class="fs-weak" id="fs-weak"></div>
    </div>
    <div class="fs-actionbar" id="fs-actionbar">
      <div class="fs-act-primary">
        <div class="arena-act arena-act-player" id="arena-act-player"></div>
        <button type="button" class="btn btn-primary fs-fight" data-cs-act="fight">Fight ▸</button>
      </div>
      <button type="button" class="btn fs-stop" data-cs-act="stop">Stop</button>
      <div class="fs-act-ref">
        <div class="arena-act arena-act-foe" id="arena-act-foe"></div>
        <button type="button" class="btn btn-sm arena-chip fs-history" data-cs-act="history">History <em id="fs-history-badge"></em></button>
      </div>
    </div>
    <div class="fs-metrics" id="fs-metrics"></div>`;
  const head = arena.querySelector('.card-head');
  if (head && head.nextSibling) arena.insertBefore(vs, head.nextSibling);
  else arena.insertBefore(vs, arena.firstChild);

  /* The log row: legacy's `#combat-area` (which renderCombat owns outright)
     beside a loot rail this module owns. The rail is a SIBLING of the area, not
     a child, because renderCombat rewrites the area's innerHTML on every tick
     and anything parked inside it would be destroyed 25 times a minute. */
  const area = arena.querySelector('#combat-area');
  if (area) {
    const row = document.createElement('div');
    row.className = 'fs-logrow';
    area.parentNode.insertBefore(row, area);
    row.appendChild(area);
    const rail = document.createElement('div');
    rail.className = 'fs-loot-rail';
    rail.id = 'fs-loot-rail';
    row.appendChild(rail);
  }
}

/* ══════════════════════════════════════════════════════════════════════
   4 · ROUTING — the camera moves, the fight does not
   ══════════════════════════════════════════════════════════════════════
   Leaving The Fight never stops the fight: `setView` writes an attribute and
   nothing else. The only thing that stops a fight is `stopCombat()`, from the
   one button that says Stop. */
let previewId = null;

function currentFoeId() {
  const g = G();
  if (g && g.activeMonster) return g.activeMonster;
  return previewId;
}

function setView(v) {
  const p = panel(); if (!p) return;
  p.dataset.combatView = v;
  if (v === 'table') render();
  else renderFight();
}
function view() { const p = panel(); return (p && p.dataset.combatView) || 'table'; }

/** COMBAT-UI-15 — the preview state: the fight screen with the fight not started. */
function preview(id) {
  if (!MONSTERS[id]) return false;
  const g = G();
  if (g && g.activeMonster && g.activeMonster !== id) {
    /* A live fight outranks a preview: showing a still stage while a different
       fight is running would be the one lie this screen must never tell. */
    previewId = null;
    setView('fight');
    return true;
  }
  previewId = id;
  Swing.reset();
  setView('fight');
  return true;
}

/** COMBAT-UI-01 — nav opens the live fight if one is running, else the hub.
    A PREVIEW IS NOT A DESTINATION. It is a decision in progress, and a decision
    you walked away from is a decision you did not make — reopening Combat onto
    a still stage for a foe you never committed to would be the wrong-screen
    this rule exists to prevent, wearing the other hat. Only a LIVE fight
    outranks the hub. */
function openFromNav() {
  const g = G();
  if (g && g.activeMonster) { previewId = null; setView('fight'); return; }
  previewId = null;
  setView('table');
}

function onPanelClick(e) {
  const t = e.target;
  if (!t || typeof t.closest !== 'function') return;
  const btn = t.closest('[data-cs-act]');
  if (btn) {
    const act = btn.getAttribute('data-cs-act');
    e.preventDefault(); e.stopPropagation();
    if (act === 'back') { setView('table'); }
    else if (act === 'return') { previewId = null; setView('fight'); }
    else if (act === 'fight') {
      const id = previewId;
      if (id && typeof window.startCombat === 'function') { previewId = null; window.startCombat(id); renderFight(); }
    } else if (act === 'stop') {
      if (typeof window.stopCombat === 'function') window.stopCombat();
      previewId = null;
      setView('table');
    } else if (act === 'history') { openHistory(); }
    else if (act === 'gear') { if (typeof window.showTab === 'function') window.showTab('inventory'); }
    else if (act === 'tier') {
      const tier = parseInt(btn.dataset.tier || '1', 10);
      const g = G(); if (g) g.currentCombatTier = tier;
      if (typeof window.renderMonsterList === 'function') { try { window.renderMonsterList(); } catch (err) { /* legacy */ } }
      render();
    } else if (act === 'class') {
      classFilter = btn.dataset.cls || 'all';
      render();
    } else if (act === 'dest') {
      const go = btn.dataset.go;
      if (go === 'tab' && typeof window.showTab === 'function') window.showTab(btn.dataset.tab);
      else if (go === 'botd' && window.HearthriseBossOfDay) window.HearthriseBossOfDay.fight();
      else if (go === 'weekly' && window.HearthriseBossOfDay) window.HearthriseBossOfDay.fightWeekly();
      else if (go === 'monster' && btn.dataset.monster) preview(btn.dataset.monster);
    }
    return;
  }
  /* A style button on the stage. Reuses `.csb-btn[data-style-key]`, so the
     document-level delegated handler installed by the b334 style-picker fix
     owns the click — one handler for a decision that can be made from two
     surfaces, rather than a second call into applyCombatStyle from here. */
}

/* ══════════════════════════════════════════════════════════════════════
   5 · THE WAR TABLE
   ══════════════════════════════════════════════════════════════════════ */
let classFilter = 'all';

function tierOf() { const g = G(); return (g && g.currentCombatTier) || 1; }

function killsOf(id) {
  const g = G();
  const b = g && g.bestiary && g.bestiary[id];
  return (b && Number(b.kills)) || 0;
}

function renderRibbon() {
  const host = document.getElementById('wt-ribbon');
  if (!host) return;
  const g = G();
  const id = g && g.activeMonster;
  const m = id && MONSTERS[id];
  if (!m) { host.hidden = true; host.innerHTML = ''; return; }
  host.hidden = false;
  const fp = g.monsterMaxHp ? clamp01(g.monsterHp / g.monsterMaxHp) : 0;
  const pp = g.playerMaxHp ? clamp01(g.playerHp / g.playerMaxHp) : 0;
  const sig = [id, g.monsterHp, g.monsterMaxHp, g.playerHp, g.playerMaxHp, g.combatKillsThisFoe].join('|');
  if (host.dataset.sig === sig) return;
  host.dataset.sig = sig;
  host.innerHTML =
    `<span class="wtr-kicker">⚔ Fighting</span>` +
    `<span class="wtr-art">${monsterArt(id, 'wtr-img')}</span>` +
    `<span class="wtr-name">${esc(m.name)}</span>` +
    `<span class="wtr-hp foe"><i style="width:${(fp * 100).toFixed(1)}%"></i>` +
      `<b>${num(g.monsterHp)} / ${num(g.monsterMaxHp)}</b></span>` +
    `<span class="wtr-hp you"><i style="width:${(pp * 100).toFixed(1)}%"></i>` +
      `<b>${num(g.playerHp)} / ${num(g.playerMaxHp)}</b></span>` +
    `<span class="wtr-kills">×${num(g.combatKillsThisFoe || 0)} this fight</span>` +
    `<button type="button" class="btn btn-primary btn-sm wtr-go" data-cs-act="return">Return to the fight</button>`;
}

/* COMBAT-UI-05 — every combat entry point, one front door. A destination with
   nothing live shows its timer instead of disappearing: an empty slot in a menu
   is what teaches the rotation. */
function destinations() {
  const g = G();
  const out = [];

  // ── Bounty ─────────────────────────────────────────────────────────────
  const bh = g && g.bountyHunter;
  const active = bh && bh.active;
  if (active && MONSTERS[active.target]) {
    const m = MONSTERS[active.target];
    out.push({
      kick: 'Bounty', art: active.target, name: m.name,
      meta: `${num(active.progress || 0)} / ${num(active.required || 0)} slain`,
      verb: 'Jump ▸', go: 'monster', monster: active.target,
      counter: `${num(active.progress || 0)}/${num(active.required || 0)}`,
    });
  } else {
    out.push({
      kick: 'Bounty', glyph: '🎯', name: 'No contract',
      meta: 'Take one at the Bounty Board', verb: 'Board ▸', go: 'tab', tab: 'bounty',
    });
  }

  // ── Boss of the Day / Weekly Boss ──────────────────────────────────────
  const B = window.HearthriseBossOfDay;
  if (B) {
    const did = B.featuredId && B.featuredId();
    const dm = did && MONSTERS[did];
    if (dm) {
      out.push({
        kick: 'Boss of the Day', art: did, name: dm.name,
        meta: 'bonus drops & XP while featured',
        timer: 'new in ' + fmtCountdown(B.msUntilRotate ? B.msUntilRotate() : 0),
        verb: 'Fight ▸', go: 'botd',
        locked: combatLevel() < reqLevelFor(dm) ? `Combat Lv ${reqLevelFor(dm)}` : null,
      });
    }
    const wid = B.weeklyId && B.weeklyId();
    const wm = wid && MONSTERS[wid];
    if (wm) {
      out.push({
        kick: '★ Weekly Boss', art: wid, name: wm.name,
        meta: 'bonus drops & XP this week',
        timer: 'resets in ' + fmtCountdown(B.msUntilWeeklyRotate ? B.msUntilWeeklyRotate() : 0),
        verb: 'Fight ▸', go: 'weekly',
        locked: combatLevel() < reqLevelFor(wm) ? `Combat Lv ${reqLevelFor(wm)}` : null,
      });
    }
  }

  // ── Dungeons ───────────────────────────────────────────────────────────
  const D = window.DUNGEONS;
  if (D) {
    const lv = combatLevel();
    const ids = Object.keys(D);
    const open = ids.filter((id) => typeof window.canRunDungeon === 'function'
      && (() => { try { return window.canRunDungeon(id).ok; } catch (e) { return false; } })());
    const next = ids.filter((id) => D[id].reqLv > lv).sort((a, b) => D[a].reqLv - D[b].reqLv)[0];
    out.push({
      kick: 'Dungeon', glyph: '🏛',
      name: open.length ? D[open[0]].name : (next ? D[next].name : 'Dungeons'),
      meta: open.length ? `${open.length} ready to run` : (next ? `unlocks at Combat Lv ${D[next].reqLv}` : 'keys and cooldowns'),
      verb: 'Enter ▸', go: 'tab', tab: 'dungeons',
      counter: open.length ? String(open.length) : null,
    });
  }

  // ── Clan raid ──────────────────────────────────────────────────────────
  const R = window.HearthriseRaids;
  if (R) {
    let boss = null;
    try { boss = R.bossOfWeek && R.bossOfWeek(); } catch (e) { boss = null; }
    out.push({
      kick: 'Clan Raid', glyph: '🛡',
      name: (boss && (boss.name || boss.n)) || 'Weekly Hunt',
      meta: 'strike with your clan', verb: 'Join ▸', go: 'tab', tab: 'clan',
    });
  }

  // ── World event ────────────────────────────────────────────────────────
  const W = window.HearthriseWorldEvents;
  if (W) {
    let sum = null;
    try { sum = W.summaryFor && W.summaryFor(W.daily && W.daily()); } catch (e) { sum = null; }
    out.push({
      kick: 'World Event', glyph: '🌍',
      name: (sum && (sum.title || sum.name)) || 'Today\'s blessing',
      meta: (sum && sum.text) || 'a rotating bonus, every day',
      verb: 'Events ▸', go: 'tab', tab: 'events',
    });
  }
  return out;
}

function renderDestinations() {
  const host = document.getElementById('wt-dests');
  if (!host) return;
  const list = destinations();
  const html = list.map((d) => {
    const art = d.art ? monsterArt(d.art, 'wtd-img') : `<span class="wtd-img is-emoji">${d.glyph || '⚔'}</span>`;
    const btn = d.locked
      ? `<button type="button" class="btn btn-sm" disabled>${esc(d.locked)}</button>`
      : `<button type="button" class="btn btn-sm btn-primary" data-cs-act="dest" data-go="${esc(d.go)}"` +
        `${d.tab ? ` data-tab="${esc(d.tab)}"` : ''}${d.monster ? ` data-monster="${esc(d.monster)}"` : ''}>${esc(d.verb)}</button>`;
    return `<article class="wt-dest">
      <header><span class="wtd-kick">${esc(d.kick)}</span>` +
        (d.counter ? `<span class="wtd-count">${esc(d.counter)}</span>` : '') +
        (d.timer ? `<span class="wtd-timer">${esc(d.timer)}</span>` : '') +
      `</header>
      <div class="wtd-body">${art}<div class="wtd-main">
        <b>${esc(d.name)}</b><span>${esc(d.meta)}</span>
      </div></div>
      <footer>${btn}</footer>
    </article>`;
  }).join('');
  if (host.dataset.sig === html.length + '|' + list.map((d) => d.name + d.meta + (d.timer || '')).join()) return;
  host.dataset.sig = html.length + '|' + list.map((d) => d.name + d.meta + (d.timer || '')).join();
  host.innerHTML = html;
}

function renderFilters() {
  const tiers = document.getElementById('wt-tiers');
  const classes = document.getElementById('wt-classes');
  if (!tiers || !classes) return;
  const t = tierOf();
  tiers.innerHTML = [1, 2, 3, 4, 5, 6].map((n) =>
    `<button type="button" class="chip${n === t ? ' active' : ''}" data-cs-act="tier" data-tier="${n}">T${n}</button>`).join('');
  /* COMBAT-UI-06 — the 11-class taxonomy becomes navigable. Built from the
     TIER's own roster, so a class with nothing in this tier is not offered. */
  const inTier = Object.values(MONSTERS).filter((m) => m.tier === t);
  const fams = [];
  inTier.forEach((m) => { const f = m.family || 'Monster'; if (fams.indexOf(f) < 0) fams.push(f); });
  fams.sort();
  if (fams.indexOf(classFilter) < 0 && classFilter !== 'all') classFilter = 'all';
  classes.innerHTML = ['all'].concat(fams).map((f) =>
    `<button type="button" class="chip${f === classFilter ? ' active' : ''}" data-cs-act="class" data-cls="${esc(f)}">${f === 'all' ? 'All' : esc(f)}</button>`).join('');
}

/* COMBAT-UI-03 / 04 — the portrait grid and the browsing unit. Everything on a
   card is a decision input: art, name, the two numbers you compare between
   foes (weakness + HP) in a FIXED position so the grid scans straight down, and
   your own kill count — the cheapest collection-log hook there is. A locked
   monster stays visible; a menu that hides its own future has no pull. */
function renderGrid() {
  const host = document.getElementById('wt-grid');
  if (!host) return;
  const t = tierOf();
  const lv = combatLevel();
  const g = G();
  const rows = Object.entries(MONSTERS)
    .filter(([, m]) => m.tier === t)
    .filter(([, m]) => classFilter === 'all' || (m.family || 'Monster') === classFilter);
  const html = rows.map(([id, m]) => {
    const req = reqLevelFor(m);
    const locked = lv < req;
    const k = killsOf(id);
    const fighting = g && g.activeMonster === id;
    const drops = (m.drops || []).slice().sort((a, b) => b.ch - a.ch).slice(0, 2)
      .map((d) => `${esc((ITEMS[d.id] || {}).n || d.id)} ${d.ch >= 1 ? 'always' : (d.ch * 100 >= 1 ? Math.round(d.ch * 100) : (d.ch * 100).toFixed(1)) + '%'}`)
      .join(' · ');
    const badge = fighting ? '<span class="wtc-kills is-live">Fighting</span>'
      : locked ? `<span class="wtc-kills is-locked">Lv ${req}</span>`
      : k > 0 ? `<span class="wtc-kills">×${num(k)}</span>`
      : '<span class="wtc-kills is-new">NEW</span>';
    return `<button type="button" class="wt-card${locked ? ' is-locked' : ''}${fighting ? ' is-live' : ''}"` +
      `${locked ? ' disabled' : ''} data-monster="${esc(id)}" title="${esc(m.name)}">
      <span class="wtc-art">${monsterArt(id, 'wtc-img')}</span>
      <span class="wtc-name">${esc(m.name)}</span>
      <span class="wtc-stats"><em>${esc(weaponLabel(m.weaponWeak))}</em><b>${num(m.hp)} HP</b></span>
      ${badge}
      ${drops ? `<span class="wtc-drops">${drops}</span>` : ''}
    </button>`;
  }).join('');
  const sig = t + '|' + classFilter + '|' + lv + '|' + rows.length + '|' + (g && g.activeMonster) + '|' + rows.map(([id]) => killsOf(id)).join(',');
  if (host.dataset.sig === sig) return;
  host.dataset.sig = sig;
  host.innerHTML = html || '<div class="empty">No monsters match this filter.</div>';
}

function render() {
  if (!ensureStructure()) return;
  renderRibbon();
  renderDestinations();
  renderFilters();
  renderGrid();
}

/* ══════════════════════════════════════════════════════════════════════
   6 · THE FIGHT
   ══════════════════════════════════════════════════════════════════════ */
function forecastFor(m) {
  const HUD = window.HearthriseCombatHud;
  if (!HUD || typeof HUD._forecast !== 'function') return null;
  try { return HUD._forecast(m); } catch (e) { return null; }
}

function tiles(host, rows) {
  const html = rows.map((r) => `<span class="fs-tile"><em>${esc(r[0])}</em><b>${esc(r[1])}</b></span>`).join('');
  if (host.dataset.sig === html) return;
  host.dataset.sig = html;
  host.innerHTML = html;
}

/* COMBAT-UI-12 — the quick-swap strip. The paper doll leaves combat for the
   Character screen (where it already fits); what a fighting player needs is to
   SEE the six slots that matter and their totals, and one click to the full
   loadout. The weapon chip carries the swing time, which is how weapon speed
   becomes a visible stat for the first time. */
function renderGearStrip() {
  const host = document.getElementById('fs-gear');
  if (!host) return;
  const g = G(); if (!g) return;
  const eq = typeof window.getEquipmentStats === 'function' ? window.getEquipmentStats() : {};
  const cells = QUICK_SLOTS.map((slot) => {
    const id = g.equipment && g.equipment[slot];
    const def = id && ITEMS[id];
    const path = id && window._itemPath && window._itemPath[id];
    const meta = slotMeta(slot);
    const extra = slot === 'weapon' ? ` · ${(tickMs() / 1000).toFixed(2)}s` : '';
    const label = def ? def.n + extra : meta.label;
    return `<span class="fsg-slot${def ? '' : ' is-empty'}" title="${esc(label)}">` +
      (def && path ? `<img src="${path}" alt="" />` : `<i>${esc(def ? def.icon : meta.icon)}</i>`) + '</span>';
  }).join('');
  const totals = `<span class="fsg-totals">+${Math.round(eq.atkB || 0)} atk · +${Math.round(eq.defB || 0)} def</span>`;
  const html = cells + totals + '<button type="button" class="btn btn-sm fsg-more" data-cs-act="gear">Loadout</button>';
  if (host.dataset.sig === html) return;
  host.dataset.sig = html;
  host.innerHTML = html;
}

/* COMBAT-UI-14 — style moves to The Fight, beside the fighter it re-tunes.
   IT IS MOVED, NOT REBUILT. `renderStyleSelector()` in legacy.js already owns
   exactly one `.combat-style-block` and — since the b334 fix — updates it IN
   PLACE precisely so a button cannot be torn out between a player's mousedown
   and their mouseup (a detached node dispatches no click at all; that bug cost
   7.5% of style presses during a fight). Building a second picker here would
   reintroduce the two-surfaces problem that fix exists to end, so the Fight
   screen ADOPTS the one block instead: same node, same identity, same single
   delegated handler, and the ribbon that used to run 270px tall on a narrow
   window is gone because its host is gone. */
function adoptStyleBlock() {
  const host = document.getElementById('fs-style');
  if (!host) return;
  const block = document.querySelector('#panel-combat .combat-style-block');
  if (block && block.parentElement !== host) host.appendChild(block);
}

/* THE METRICS STRIP — the honesty gate lives here, not in the copy. */
function renderMetrics(m, f) {
  const host = document.getElementById('fs-metrics');
  if (!host) return;
  const g = G();
  const parts = [];
  if (!g || !g.activeMonster) {
    parts.push('rates begin when the fight does');
  } else {
    const mt = Ledger.metrics();
    if (mt && mt.rateReady) {
      parts.push(`<b>${mt.xpPerMin.toFixed(0)}</b> XP/min`);
      if (mt.gold > 0) parts.push(`<b>${mt.goldPerMin.toFixed(0)}</b> gold/min`);
      parts.push(`<b>${num(mt.kills)}</b> kills this fight`);
    } else if (mt && mt.kills === 0 && mt.elapsedS >= 45) {
      /* THE REFUSAL (spec §6): a fight whose first kill has not landed inside
         the measuring window is a fight that has paid nothing yet, and we will
         not extrapolate a number the server has not paid. */
      parts.push('long fight — pays on the kill');
    } else {
      parts.push('measuring…');
    }
  }
  if (f) {
    parts.push(f.survivesAnHour
      ? `you last <b>${fmtRun(f.survivalSeconds)}</b>`
      : `you last <b>≈${num(f.survivalKills)} kills</b> · ${fmtRun(f.survivalSeconds)}`);
  }
  const html = parts.join(' <s>·</s> ');
  if (host.dataset.sig === html) return;
  host.dataset.sig = html;
  host.innerHTML = html;
}

function renderLootRail() {
  const host = document.getElementById('fs-loot-rail');
  if (!host) return;
  const rows = Ledger.loot().slice(0, 12);
  const html = rows.length
    ? '<div class="fsl-head">This fight</div>' + rows.map((r) => {
      const def = ITEMS[r.id];
      const path = window._itemPath && window._itemPath[r.id];
      return `<div class="fsl-row">${path ? `<img src="${path}" alt="" />` : `<i>${esc((def && def.icon) || '📦')}</i>`}` +
        `<span>${esc((def && def.n) || r.id)}</span><b>×${num(r.qty)}</b></div>`;
    }).join('')
    : '<div class="fsl-head">This fight</div><div class="fsl-empty">no spoils yet</div>';
  if (host.dataset.sig === html) return;
  host.dataset.sig = html;
  host.innerHTML = html;
}

function openHistory() {
  const RM = window.HearthriseRoomModal;
  const rows = Ledger.loot();
  if (!RM) return false;
  RM.open(() => ({
    id: 'combat-history', theme: 'vault',
    title: 'Loot history',
    subtitle: 'Everything this fight has actually paid you',
    sections: [{
      kind: 'rows', title: 'This fight',
      empty: 'Nothing has dropped yet.',
      rows: Ledger.loot().map((r) => ({
        name: esc((ITEMS[r.id] || {}).n || r.id),
        right: `<span class="hr-cs-amt">×${num(r.qty)}</span>`,
      })),
    }],
  }));
  return rows.length >= 0;
}

/* The preview paint. In a live fight legacy's own 200ms arena refresh owns
   these nodes; in preview it returns early (there is no active monster), so
   this module paints the same nodes with the same shapes — full bars, still
   swing bars — rather than inventing a second set. */
function paintPreviewStage(id, m) {
  const setHtmlOnce = (el, html, key) => {
    if (!el || el.dataset.paint === key) return;
    el.dataset.paint = key; el.innerHTML = html;
  };
  setHtmlOnce(document.getElementById('arena-foe-portrait'), monsterArt(id, 'fs-foe-img'), 'prev:' + id);
  const pp = document.getElementById('arena-player-portrait');
  if (pp && !pp.querySelector('img')) {
    pp.innerHTML = `<img src="${window._playerAvatar || 'assets/icons-bundle/painted/npc/player.png'}" alt="" />`;
  }
  const fn = document.getElementById('arena-foe-name');
  if (fn) fn.textContent = m.name;
  const pn = document.getElementById('arena-player-name');
  const g = G();
  if (pn) pn.textContent = (g && g.playerName) || 'You';
  const fhp = document.getElementById('arena-foe-hp');
  if (fhp) fhp.style.width = '100%';
  const fht = document.getElementById('arena-foe-hp-text');
  if (fht) fht.textContent = num(m.hp) + ' / ' + num(m.hp);
  const php = document.getElementById('arena-player-hp');
  const pht = document.getElementById('arena-player-hp-text');
  if (g && php) php.style.width = ((g.playerMaxHp ? clamp01(g.playerHp / g.playerMaxHp) : 0) * 100).toFixed(1) + '%';
  if (g && pht) pht.textContent = num(g.playerHp) + ' / ' + num(g.playerMaxHp);
}

function renderFight() {
  if (!ensureStructure()) return;
  const p = panel();
  const g = G();
  const live = !!(g && g.activeMonster);
  const id = currentFoeId();
  const m = id && MONSTERS[id];
  if (!m) {
    /* No foe and no preview — there is nothing this screen can honestly show,
       so it does not exist. That is what retires AWAITING A FOE: you cannot
       arrive here without having chosen someone. */
    setView('table');
    return;
  }
  p.dataset.fightState = live ? 'live' : 'preview';

  const title = document.getElementById('fs-title');
  const tsig = m.name + '|' + (m.family || '') + '|' + m.tier;
  if (title && title.dataset.sig !== tsig) {
    title.dataset.sig = tsig;
    title.innerHTML = `<b>${esc(m.name)}</b><span>${esc(m.family || 'Monster')} · Tier ${m.tier}</span>`;
  }

  if (!live) paintPreviewStage(id, m);

  // Levels — COMBAT-UI-09's second row, both sides.
  const plv = document.getElementById('fs-player-lv');
  if (plv) plv.textContent = 'Lv ' + combatLevel();
  const flv = document.getElementById('fs-foe-lv');
  if (flv) flv.textContent = 'Lv ' + ((m.tier - 1) * 15 + 1);

  // Swing bars — COMBAT-UI-19's Phase-1 landing, off the one clock.
  const ph = live ? Swing.phase() : 0;
  const eq = typeof window.getEquipmentStats === 'function' ? window.getEquipmentStats() : {};
  const wid = g && g.equipment && g.equipment.weapon;
  const wname = (wid && ITEMS[wid] && ITEMS[wid].n) || weaponLabel(eq.weaponType) || 'Unarmed';
  const swingS = (tickMs() / 1000).toFixed(2) + 's';
  const ps = document.getElementById('fs-player-swing');
  if (ps) {
    ps.querySelector('i').style.width = (ph * 100).toFixed(1) + '%';
    const lbl = `${wname} · ${swingS}`;
    const sp = ps.querySelector('span'); if (sp.textContent !== lbl) sp.textContent = lbl;
  }
  const fsw = document.getElementById('fs-foe-swing');
  if (fsw) {
    fsw.querySelector('i').style.width = (ph * 100).toFixed(1) + '%';
    const lbl = `${esc(weaponLabel(m.weaponWeak) !== '—' ? m.family || 'Foe' : 'Foe')} · ${swingS}`;
    const sp = fsw.querySelector('span'); if (sp.textContent !== lbl) sp.textContent = lbl;
  }

  // COMBAT-UI-11 — six tiles, three a side, from the ONE forecast.
  const f = forecastFor(m);
  const pt = document.getElementById('fs-player-tiles');
  const ft = document.getElementById('fs-foe-tiles');
  if (pt) {
    tiles(pt, f ? [['Hit', Math.round(f.you.accuracy * 100) + '%'], ['Max hit', f.you.maxHit], ['DPS', f.dps.toFixed(1)]]
      : [['Hit', '—'], ['Max hit', '—'], ['DPS', '—']]);
  }
  if (ft) {
    tiles(ft, f ? [['Hit', Math.round(f.foe.accuracy * 100) + '%'], ['Max hit', f.foe.maxHit], ['HP', num(m.hp)]]
      : [['Hit', '—'], ['Max hit', '—'], ['HP', num(m.hp)]]);
  }
  const weak = document.getElementById('fs-weak');
  if (weak) {
    const txt = `Weak to ${weaponLabel(m.weaponWeak)}`;
    if (weak.textContent !== txt) weak.textContent = txt;
  }

  renderGearStrip();
  adoptStyleBlock();
  renderMetrics(m, f);
  renderLootRail();

  const badge = document.getElementById('fs-history-badge');
  const n = Ledger.lootCount();
  if (badge) { const t2 = n ? '●' + n : ''; if (badge.textContent !== t2) badge.textContent = t2; }

  /* The HUD paints Eat into `#arena-act-player` and Loot/Stats into
     `#arena-act-foe`; both mounts live in the action bar. It refuses to paint
     when no fight is live, which is exactly right — in preview the primary is
     Fight, not Eat, and the CSS swaps them on `[data-fight-state]`. */
  if (live && window.HearthriseCombatHud) window.HearthriseCombatHud.refresh();
}

/* ══════════════════════════════════════════════════════════════════════
   7 · THE TICK
   ══════════════════════════════════════════════════════════════════════
   One interval for both screens, and it does nothing at all unless the Combat
   panel is on screen — an idle player sitting on the Farm pays nothing for
   this module. Every paint below diffs before it writes. */
function tick() {
  const p = panel();
  if (!p || !p.classList.contains('active')) return;
  Ledger.sample();
  const g = G();
  if (g && g.activeMonster && previewId) previewId = null;
  if (view() === 'fight') {
    if (!currentFoeId()) { setView('table'); return; }
    renderFight();
  } else {
    renderRibbon();
    renderGrid();
  }
}

let slowAt = 0;
function slowTick() {
  const p = panel();
  if (!p || !p.classList.contains('active') || view() !== 'table') return;
  const now = Date.now();
  if (now - slowAt < 5000) return;
  slowAt = now;
  renderDestinations();
}

export function setupCombatScreens() {
  if (!ensureStructure()) {
    /* The panel is static markup in index.html, so this only happens in a probe
       harness. Retry once the document settles rather than silently doing
       nothing forever. */
    setTimeout(setupCombatScreens, 200);
    return;
  }
  Swing.install();

  /* Nav rule (COMBAT-UI-01). Wrapping showTab is the established pattern on
     this panel; the wrapper is idempotent so a double boot cannot stack it. */
  const orig = window.showTab;
  if (typeof orig === 'function' && !orig.__hrCombatScreens) {
    const wrapped = function (tab) {
      const r = orig.apply(this, arguments);
      if (tab === 'combat') { try { openFromNav(); } catch (e) { console.error('[combat-screens]', e); } }
      return r;
    };
    wrapped.__hrCombatScreens = true;
    window.showTab = wrapped;
  }

  /* THE CAMERA FOLLOWS A FIGHT THAT STARTS — ONCE.
     Hooked on `renderCombat` rather than on `startCombat`, for two reasons.
     (1) COVERAGE: renderCombat is what the engine calls on EVERY combat state
     change — a boss card, a bounty jump, a resume-on-load, an away settle, a
     death — so one wrapper catches every entry point instead of six, and the
     already-heavily-wrapped `showTab` gains nothing new.
     (2) TIMING: it is synchronous with the state change, so a caller that
     starts a fight and immediately reads the DOM never sees the wrong screen.
     The edge is what matters: the camera moves when a fight BEGINS, and after
     that the player is free to walk to the War Table and stay there — leaving
     The Fight never stops the fight, and being dragged back every 200ms would
     be the same steering bug combat-mobile-tabs learned in b334. */
  const rc = window.renderCombat;
  if (typeof rc === 'function' && !rc.__hrCombatScreens) {
    let lastLive = !!(G() && G().activeMonster);
    const w = function () {
      const r = rc.apply(this, arguments);
      const live = !!(G() && G().activeMonster);
      if (live !== lastLive) {
        lastLive = live;
        if (live) { previewId = null; try { setView('fight'); } catch (e) {} }
      }
      return r;
    };
    w.__hrCombatScreens = true;
    window.renderCombat = w;
  }

  window.HearthriseCombatScreens = {
    preview, setView, view, render, renderFight, openFromNav,
    _ledger: Ledger, _swing: Swing,
    get previewId() { return previewId; },
  };

  setInterval(tick, 200);
  setInterval(slowTick, 1000);
  openFromNav();
  console.log('[Combat Screens] War Table + The Fight loaded');
}
