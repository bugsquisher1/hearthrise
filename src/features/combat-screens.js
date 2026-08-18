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

import { MONSTERS } from '../data/monsters.js?v=380';
import { ITEMS } from '../data/items.js?v=380';

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

/* A chrome glyph from the baked atlas (src/data/glyphs.js). NEVER an emoji:
   the War Table's destination cards shipped in b365 drawing 🎯 🏛 🛡 🌍 at 26px
   as their ART, which is the one thing this project's art direction forbids
   outright. Returns '' when the atlas has no key rather than a pictograph. */
function uiGlyph(key, px) {
  return (window.HR && window.HR.icon) ? (window.HR.icon(key, px || 16, 'currentColor') || '') : '';
}

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
      inv: invSnapshot(), gained: {}, declared: {}, order: [],
    };
  }
  function end() { run = null; }

  /* WHO PAID IT (b370) — the rail is an ALLOWLIST.
     Loot here is measured as a positive inventory delta, which is honest about
     WHETHER something was paid but blind to WHO paid it. Everything that
     credited the bag mid-fight was claimed as a drop: first the workers' hauls
     ("we can see the stuff your workers are collecting as well... we should
     remove that"), then, once that was filtered, Tyler found the rest — "when
     you are in combat and buying items from the shop (seeds or equipment) it is
     also mentioned under 'drops this fight'."

     The first fix asked every non-combat source to declare itself. That is a
     DENYLIST, and it fails OPEN: the list is ~20 callers of addItem today and
     every feature added later is a new leak nobody will remember to plug. So
     it is inverted. There is exactly ONE combat-drop credit in the game
     (`COMBAT_FX.addItem`, fed by the single `call(fx,'addItem')` in
     core/combat-sim.js), and it declares into `window.__hrCombatCredits`. The
     rail shows the intersection of what was DECLARED and what the inventory
     ACTUALLY GAINED. Shop, market, rewards, farm, pets and accrue envelopes
     need no code at all — they are excluded by not being combat.

     Measure-don't-predict survives, and is in fact stronger: a declaration
     alone shows nothing (a full bag refuses the drop, so there is no delta and
     no row), and a delta alone shows nothing. Both must be true. */
  function drainDeclared() {
    const b = window.__hrCombatCredits;
    if (!b) return;
    for (const id in b) {
      const q = b[id] || 0;
      /* Drained even with no run, so a drop declared between fights can never
         be attributed to the next one. */
      if (run && q > 0) {
        if (!run.declared[id]) run.order.unshift(id);
        run.declared[id] = (run.declared[id] || 0) + q;
      }
      delete b[id];
    }
  }

  /* `force` skips the 1s throttle. Used only by the suite, which has to observe
     two credits inside one second to prove the attribution filter. */
  function sample(force) {
    const g = G();
    if (!g || !g.activeMonster) { if (run) end(); drainDeclared(); return; }
    if (!run || run.foe !== g.activeMonster) begin(g.activeMonster);
    drainDeclared();
    const now = Date.now();
    if (!force && now - lastSampleAt < 1000) return;
    lastSampleAt = now;
    /* The MEASURED half. Positive inventory deltas only — eating a Provision
       is a negative delta and is not loot. Recorded for every id, combat or
       not; `loot()` is what applies the allowlist, so a delta that is never
       declared simply never surfaces. */
    const g2 = g.inventory || {};
    for (const id in g2) {
      const before = run.inv[id] || 0;
      const after = g2[id] || 0;
      if (after > before) run.gained[id] = (run.gained[id] || 0) + (after - before);
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
  /* The intersection. A row needs BOTH a declaration (it was a combat drop)
     and a measured credit (the bag actually took it) — `min` of the two, so a
     drop refused by a full bag reads zero and a worker banking the same item
     cannot inflate a real drop's count. */
  function loot() {
    if (!run) return [];
    return run.order
      .map((id) => ({ id, qty: Math.min(run.declared[id] || 0, run.gained[id] || 0) }))
      .filter((r) => r.qty > 0);
  }
  function lootCount() { return loot().length; }

  return { sample, metrics, loot, lootCount, _end: end };
})();

/* ══════════════════════════════════════════════════════════════════════
   2 · THE SWING CLOCK — one clock, stamped by the engine's own tick
   ══════════════════════════════════════════════════════════════════════ */
const Swing = (() => {
  let lastTickAt = 0;
  let animAt = 0;          // when the CSS animation was (re)started
  let animSpan = 0;        // the span it was started for
  let animRun = false;     // whether it is running or parked at zero
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
  function reset() { lastTickAt = 0; animAt = 0; animSpan = 0; animRun = false; }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  /* ── THE FILL IS ANIMATED, NOT REPAINTED (b366) ────────────────────────
     Tyler, on b365: "the bar for attack swing not being smooth is giving me a
     headache, but I love the addition." He was watching the truth: the fill's
     width was written from a 200ms poll, so a 2.4s swing advanced in TWELVE
     visible steps. The bar was never a clock, it was a stopwatch photographed
     twelve times.

     The fix is to stop writing the geometry at all. The fill runs one linear
     `transform: scaleX()` animation whose DURATION IS THE SWING — the same
     `combatTickMs()` the engine divides the span by, so there is still exactly
     one clock — and this function only ever RESYNCS it: when the swing span
     changes (a weapon swap, a speed bonus), when the fight starts or stops, or
     when the engine's own tick stamp has drifted more than a fifth of a swing
     out of phase with the animation. A restart is a class of event, not a
     frame. Reduced motion keeps the stepped render, which is what that setting
     asks for: no continuous movement. */
  const DRIFT = 0.2;
  function sync(bars, live) {
    const span = Math.max(1, tickMs());
    const stepped = reducedMotion();
    const now = Date.now();
    let restart = stepped ? false
      : (live !== animRun || span !== animSpan || (!animAt && live));
    if (!restart && live && lastTickAt) {
      /* Where the ANIMATION thinks we are, against where the ENGINE says we
         are. Both are phases in 0..1, and the comparison is circular. */
      const a = ((now - animAt) % span) / span;
      const e = clamp01((now - lastTickAt) / span);
      const d = Math.abs(a - e);
      if (Math.min(d, 1 - d) > DRIFT) restart = true;
    }
    bars.forEach((bar) => {
      if (!bar) return;
      const fill = bar.querySelector('i');
      if (!fill) return;
      if (stepped) {
        bar.dataset.swing = 'step';
        fill.style.setProperty('--fs-phase', live ? phase().toFixed(3) : '0');
        return;
      }
      bar.dataset.swing = live ? 'run' : 'still';
      fill.style.removeProperty('--fs-phase');
      fill.style.animationDuration = (span / 1000).toFixed(3) + 's';
      if (restart) {
        /* Restart, IN PHASE WITH THE ENGINE. A resync can only happen on a
           200ms poll, which is never the instant of a swing — so the animation
           starts with a NEGATIVE delay equal to the time already elapsed since
           the engine's own tick stamp, and lands exactly where the damage is.
           Restarting at zero instead would make every resync a visible jump
           backwards, which is the stutter this change exists to remove.
           `animation: none` + a forced reflow is the one reliable way to re-run
           a running CSS animation; without the reflow the writes coalesce. */
        const into = live && lastTickAt ? ((now - lastTickAt) % span) : 0;
        fill.style.animationName = 'none';
        void fill.offsetWidth;
        fill.style.animationName = '';
        fill.style.animationDelay = (-into / 1000).toFixed(3) + 's';
      }
    });
    if (restart) { animAt = live && lastTickAt ? lastTickAt : now; animSpan = span; animRun = live; }
    else if (span !== animSpan) { animSpan = span; }
  }
  return { install, phase, reset, sync, _reduced: reducedMotion };
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
/* THE MANAGEMENT PANEL'S SLOT ORDER (b366). Four columns, three rows, read in
   the order a player thinks about a fight: what you swing, what you block with,
   then armour head-to-foot, then the trinkets. `companion` and `belt` are not
   here — the companion has its own pane on Character and is not a mid-fight
   decision, and belt carries no combat stat in any live item. */
const MANAGE_SLOTS = [
  'weapon', 'shield', 'ammo', 'necklace',
  'helmet', 'body', 'pants', 'cape',
  'gloves', 'boots', 'ring1', 'ring2',
];

function slotMeta(slot) {
  const M = window.EQUIP_SLOT_META || {};
  return M[slot] || { label: slot, icon: '·' };
}

/* The EMPTY-slot mark. legacy's own paper-doll glyph set, exposed rather than
   copied — `EQUIP_SLOT_META[slot].icon` is a raw emoji and this project does
   not render emoji as art. Returns '' if the monolith has not booted, which is
   the honest empty rather than a pictograph fallback. */
function slotGlyph(slot) {
  return typeof window.slotGlyphSVG === 'function' ? window.slotGlyphSVG(slot) : '';
}

/* Which equipment slots an item can legitimately go into. This mirrors
   legacy's `getPreferredSlot()` (legacy.js:2559) rather than calling it,
   because that function ANSWERS ONE slot for an item (and for a ring it
   answers "whichever finger is free") whereas a picker has to ask the
   reverse question — "what could go HERE" — for both fingers at once. */
function slotsForItem(def) {
  if (!def) return [];
  const s = def.slot || (def.type === 'weapon' ? 'weapon' : null);
  if (!s) return [];
  if (s === 'ring') return ['ring1', 'ring2'];
  if (s === 'head') return ['helmet'];
  if (s === 'legs') return ['pants'];
  if (s === 'hands') return ['gloves'];
  if (s === 'feet') return ['boots'];
  return [s];
}

/* The one-line stat summary a gear row needs to be a decision rather than a
   name. Only the fields that are non-zero, so a plain cape says nothing rather
   than "+0 atk +0 str +0 def". */
const GEAR_FIELDS = [['atkB', 'atk'], ['strB', 'str'], ['defB', 'def'],
  ['rangeAtkB', 'rng'], ['magicAtkB', 'mag']];
function gearLine(def) {
  if (!def) return '';
  const out = [];
  GEAR_FIELDS.forEach(([k, lbl]) => { if (def[k]) out.push((def[k] > 0 ? '+' : '') + def[k] + ' ' + lbl); });
  if (def.critB) out.push('+' + Math.round(def.critB * 100) + '% crit');
  return out.join(' · ');
}

function panel() { return document.getElementById('panel-combat'); }

/* b368 — the stage, re-asserted on every render. Cheap (one child query and a
   class test) and it is the half of the resume-into-a-fight fix that survives a
   LATER rebuild: `setupArenaVs`'s interval can create a legacy `.arena-vs` at
   any moment, not only during boot. */
function ensureStage() {
  const p = panel(); if (!p) return;
  buildStage(p.querySelector('.combat-arena'));
}

function ensureStructure() {
  const p = panel();
  if (!p || p.querySelector('.cbt-views')) { if (p) ensureStage(); return !!p; }

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
      </div>
      <div class="fs-body">
        <aside class="fs-manage" id="fs-manage" aria-label="Loadout, provisions and drops">
          <section class="fsm-block">
            <div class="fsm-head"><span>Loadout</span><b id="fsm-totals"></b></div>
            <div class="fsm-doll" id="fsm-doll"></div>
          </section>
          <section class="fsm-block">
            <div class="fsm-head"><span>Provisions</span></div>
            <div class="fsm-food" id="fsm-food"></div>
          </section>
          <section class="fsm-block fsm-block-grow">
            <div class="fsm-head"><span id="fsm-drops-head">Drops</span></div>
            <div class="fsm-drops" id="fsm-drops"></div>
          </section>
        </aside>
        <div class="fs-stage-host" id="fs-stage-host"></div>
      </div>
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
  /* ── b368: THE STAGE IS CLAIMED, NOT CONCEDED ──────────────────────────
     This used to bail on ANY `.arena-vs` already in the arena, and that one
     line cost the entire Fight screen on the single most common way a player
     arrives at it: RESUMING A FIGHT THAT WAS ALREADY RUNNING. `setupArenaVs`
     in legacy.js builds its own pre-b365 `.arena-vs` (portrait / name / HP /
     action slot — no level, no swing bar, no forecast tiles, no style row)
     from a 200ms interval, and on a cold load with `G.activeMonster` set it
     wins the race against this module's setup. buildStage then found "an
     `.arena-vs`", concluded its work was done, and left the player on the
     legacy stage for the rest of the session — which is why Tyler's swing bar
     "disappeared mid-fight" while every fresh-start probe showed it animating.
     The element was not hidden or unanimated. It was never in the document.

     The test for "is the stage mine" is therefore the `fs-stage` class, not the
     presence of a div, and a legacy stage is REPLACED rather than left alone.
     That also makes this function self-healing: anything that ever rebuilds
     `.arena-vs` gets undone on the next render instead of permanently
     downgrading the screen. */
  const existing = arena.querySelector(':scope > .arena-vs');
  if (existing && existing.classList.contains('fs-stage')) return;
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
  if (existing) {
    /* Replace, so the ids this markup shares with the legacy stage
       (`arena-player-hp`, `arena-foe-portrait`, …) are never duplicated in the
       document — a second `#arena-foe-hp` would silently take every write. Any
       inline `display:none` legacy parked on it goes with it. */
    existing.replaceWith(vs);
  } else {
    const head = arena.querySelector('.card-head');
    if (head && head.nextSibling) arena.insertBefore(vs, head.nextSibling);
    else arena.insertBefore(vs, arena.firstChild);
  }

  /* The log row: legacy's `#combat-area` (which renderCombat owns outright) in
     a wrapper this module owns, so the log can be given a fixed slice of the
     stage's height without touching a node renderCombat rewrites every tick. */
  const area = arena.querySelector('#combat-area');
  if (area && !(area.parentNode && area.parentNode.classList.contains('fs-logrow'))) {
    const row = document.createElement('div');
    row.className = 'fs-logrow';
    area.parentNode.insertBefore(row, area);
    row.appendChild(area);
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
    else if (act === 'slot') { openSlotPicker(btn.dataset.slot); }
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
    `<span class="wtr-kicker">${uiGlyph('attack', 12)}Fighting</span>` +
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
      kick: 'Bounty', glyph: 'uiTarget', name: 'No contract',
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
        kick: 'Weekly Boss', art: wid, name: wm.name,
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
      kick: 'Dungeon', glyph: 'uiCastle',
      name: open.length ? D[open[0]].name : (next ? D[next].name : 'Dungeons'),
      meta: open.length ? `${open.length} ready to run` : (next ? `unlocks at Combat Lv ${D[next].reqLv}` : 'keys and cooldowns'),
      verb: 'Enter ▸', go: 'tab', tab: 'dungeons',
      counter: open.length ? String(open.length) : null,
      /* b371 (F25) — THE CARD ALREADY SAID "unlocks at Combat Lv 25" AND OFFERED
         A LIT "Enter ▸" BUTTON UNDER IT. The two boss cards above use the
         `locked` field for exactly this and render a disabled chip naming the
         requirement; the dungeon card was the one destination that stated its
         gate in prose and then contradicted it with an affordance. A player at
         CL8 clicked through to a list where every row said no. */
      locked: (!open.length && next) ? `Combat Lv ${D[next].reqLv}` : null,
    });
  }

  // ── Clan raid ──────────────────────────────────────────────────────────
  const R = window.HearthriseRaids;
  if (R) {
    let boss = null;
    try { boss = R.bossOfWeek && R.bossOfWeek(); } catch (e) { boss = null; }
    out.push({
      kick: 'Clan Raid', glyph: 'uiShield',
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
      kick: 'World Event', glyph: 'uiStar',
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
    const art = d.art ? monsterArt(d.art, 'wtd-img')
      : `<span class="wtd-img is-glyph">${uiGlyph(d.glyph || 'attack', 30)}</span>`;
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

/* ══════════════════════════════════════════════════════════════════════════
   THE MANAGEMENT PANEL (b366) — COMBAT-UI-12, rebuilt against Tyler's ruling
   ══════════════════════════════════════════════════════════════════════════
   b362 answered "equipment needs scrolling" by deleting the loadout column and
   leaving six 34px chips in the title bar. That reading was too literal:
   Melvor's fight screen keeps the EQUIPMENT PANEL, the FOOD SLOT and the LOOT
   CONTAINER permanently on the stage, and the b217 loadout column it replaced
   at least let you change your gear. So the rail comes back — narrower, denser,
   and PERSISTENT ACROSS BOTH STATES, which the old one was not:

     LOADOUT     twelve slots wearing their real painted item art, click to
                 swap from a picker filtered to that slot. Live pre-fight AND
                 mid-fight — you can re-arm without leaving the fight.
     PROVISIONS  the food slot: what you will eat, what it heals, how many are
                 left. Visible BEFORE the fight, which is the one time the
                 answer can still change your mind. The Eat BUTTON stays in the
                 action bar (it is the HUD's mount and its own handler); this
                 is the slot, not a second button.
     DROPS       pre-fight, the foe's drop table with real chances — "what do I
                 win". Mid-fight, what has actually landed. Same container,
                 same place, so it never pops in and out.

   Nothing here re-implements a number: worn art comes from `itemArt()`, the
   totals from `getEquipmentStats()`, the food from `foodUseInfo()`, the drop
   chances from the monster row the War Table card already reads. */

function itemImg(id, cls) {
  if (typeof window.itemArt === 'function') {
    const html = window.itemArt(id, 26);
    if (html) return `<span class="${cls}">${html}</span>`;
  }
  const path = window._itemPath && window._itemPath[id];
  return path ? `<span class="${cls}"><img src="${path}" alt="" /></span>` : `<span class="${cls}"></span>`;
}

function renderDoll() {
  const host = document.getElementById('fsm-doll');
  if (!host) return;
  const g = G(); if (!g) return;
  const eqp = g.equipment || {};
  const html = MANAGE_SLOTS.map((slot) => {
    const id = eqp[slot];
    const def = id && ITEMS[id];
    const meta = slotMeta(slot);
    const title = def ? `${meta.label}: ${def.n} — click to change` : `${meta.label} — empty, click to equip`;
    return `<button type="button" class="fsm-slot${def ? '' : ' is-empty'}" data-cs-act="slot"` +
      ` data-slot="${esc(slot)}" title="${esc(title)}" aria-label="${esc(title)}">` +
      (def ? itemImg(id, 'fsm-slot-art') : `<span class="fsm-slot-gly">${slotGlyph(slot)}</span>`) +
      `<em>${esc(meta.label)}</em></button>`;
  }).join('');
  if (host.dataset.sig === html) return;
  host.dataset.sig = html;
  host.innerHTML = html;
}

function renderTotals() {
  const host = document.getElementById('fsm-totals');
  if (!host) return;
  const eq = typeof window.getEquipmentStats === 'function' ? window.getEquipmentStats() : {};
  const txt = `+${Math.round(eq.atkB || 0)} atk · +${Math.round(eq.strB || 0)} str · +${Math.round(eq.defB || 0)} def`;
  if (host.textContent !== txt) host.textContent = txt;
}

/* The food slot. Reads the SAME `bestProvisionId` / `foodUseInfo` pair the Eat
   button reads, so the slot and the button can never name different food. */
function renderFood() {
  const host = document.getElementById('fsm-food');
  if (!host) return;
  const g = G();
  const id = typeof window.bestProvisionId === 'function' ? window.bestProvisionId() : null;
  const info = id && typeof window.foodUseInfo === 'function' ? window.foodUseInfo(id) : null;
  let html;
  if (!info) {
    html = '<div class="fsm-food-slot is-empty" title="You have no Provisions">' +
      '<span class="fsm-slot-gly"></span></div>' +
      '<div class="fsm-food-txt"><b>No provisions</b><span>Cook fish or bake bread</span></div>';
  } else {
    const qty = (g && g.inventory && g.inventory[id]) || 0;
    const def = ITEMS[id] || {};
    html = `<div class="fsm-food-slot" title="${esc(def.n || id)}">${itemImg(id, 'fsm-slot-art')}` +
      `<i>×${num(qty)}</i></div>` +
      `<div class="fsm-food-txt"><b>${esc(def.n || id)}</b>` +
      `<span>+${num(info.heals)} HP each · ${num(qty)} held</span></div>`;
  }
  if (host.dataset.sig === html) return;
  host.dataset.sig = html;
  host.innerHTML = html;
}

/* The rarity ladder is the one already used by the Loot modal's drop rows
   (combat-render.js), repeated here rather than imported because that function
   is a closure inside the HUD. Same thresholds; if they ever diverge the guard
   in the smoke suite says so. */
function rarityBand(ch) {
  if (ch >= 0.5) return 'r-common';
  if (ch >= 0.15) return 'r-uncommon';
  if (ch >= 0.05) return 'r-rare';
  if (ch >= 0.01) return 'r-vrare';
  return 'r-legendary';
}
function pctText(ch) {
  const p = ch * 100;
  if (ch >= 1) return 'always';
  if (p >= 1) return Math.round(p) + '%';
  if (p >= 0.1) return p.toFixed(1) + '%';
  return p.toFixed(2) + '%';
}

/* DROPS — one container, two truths.
   PRE-FIGHT it is the foe's table: every drop it can pay and how often, which
   is the "what do I win" half of the decision the preview exists to inform.
   MID-FIGHT it is the ledger: what has actually landed, measured, never
   predicted. Both are the same box in the same place, so the panel never pops
   in and out under a player's cursor. */
function renderDrops(m) {
  const host = document.getElementById('fsm-drops');
  const head = document.getElementById('fsm-drops-head');
  if (!host) return;
  const live = !!(G() && G().activeMonster);
  let html;
  if (live) {
    if (head && head.textContent !== 'Drops this fight') head.textContent = 'Drops this fight';
    const rows = Ledger.loot().slice(0, 24);
    html = rows.length
      ? rows.map((r) => {
        const def = ITEMS[r.id] || {};
        return `<div class="fsm-drop">${itemImg(r.id, 'fsm-drop-art')}` +
          `<span>${esc(def.n || r.id)}</span><b>×${num(r.qty)}</b></div>`;
      }).join('')
      : '<div class="fsm-empty">No spoils yet — they land on the kill.</div>';
  } else {
    if (head && head.textContent !== 'What it drops') head.textContent = 'What it drops';
    const drops = ((m && m.drops) || []).slice().sort((a, b) => b.ch - a.ch);
    const coin = m && m.gp ? `<div class="fsm-drop is-coin"><span class="fsm-drop-art">${uiGlyph('gold', 16)}</span>` +
      `<span>Gold</span><b>${num(m.gp[0])}–${num(m.gp[1])}</b></div>` : '';
    html = coin + (drops.length
      ? drops.map((d) => {
        const def = ITEMS[d.id] || {};
        return `<div class="fsm-drop ${rarityBand(d.ch)}">${itemImg(d.id, 'fsm-drop-art')}` +
          `<span>${esc(def.n || d.id)}</span><b>${pctText(d.ch)}</b></div>`;
      }).join('')
      : '<div class="fsm-empty">This one carries nothing but coin.</div>');
    if (m) html += `<div class="fsm-foot">${num(m.xp)} combat XP a kill</div>`;
  }
  if (host.dataset.sig === html) return;
  host.dataset.sig = html;
  host.innerHTML = html;
}

/* The gear half of the rail, repaintable WITHOUT a monster.
   b369: the equip rollback in legacy.js (`restoreEquipSnapshot`) put
   `G.equipment` back when the server refused a swap and then repainted the
   inventory — `renderInventory`, `_renderInvFancy`, `renderLoadout` — and
   stopped there. This rail is a fourth surface that draws `G.equipment`, and
   it is the one the player is LOOKING AT when they equip from the Fight
   screen, so a refused equip left the sword worn in the rail and back in the
   bag at the same time. That is Tyler's report, and it is not a paint bug so
   much as a missing entry on a list: the list of surfaces that must be
   repainted has to be reachable from the rollback, not re-derived at each
   call site. `renderDrops` is deliberately excluded — it needs the current
   foe and gear does not change the drop table. */
export function repaintGear() {
  renderDoll();
  renderTotals();
  renderFood();
}

function renderManage(m) {
  repaintGear();
  renderDrops(m);
}

/* ── THE SLOT PICKER ──────────────────────────────────────────────────────
   Click a slot, get everything in the bag that could go in it, equip in one
   press without leaving the fight. It EQUIPS THROUGH `equipItem()` and
   `unequip()` — legacy's own functions, which carry the b246 wield gate, the
   grandfather record and the inventory bookkeeping. Re-implementing any of
   that here would be a second, wrong copy of the equip rules. */
function openSlotPicker(slot) {
  const RM = window.HearthriseRoomModal;
  const g = G();
  if (!RM || !g) {
    if (typeof window.showTab === 'function') window.showTab('inventory');
    return false;
  }
  const meta = slotMeta(slot);

  const build = () => {
    const gg = G();
    const wornId = gg.equipment && gg.equipment[slot];
    const worn = wornId && ITEMS[wornId];
    const inv = gg.inventory || {};
    const cands = Object.keys(inv)
      .filter((id) => (inv[id] || 0) > 0 && ITEMS[id] && slotsForItem(ITEMS[id]).indexOf(slot) >= 0)
      .sort((a, b) => (ITEMS[b].tier || 0) - (ITEMS[a].tier || 0)
        || String(ITEMS[a].n).localeCompare(String(ITEMS[b].n)));

    const rows = cands.map((id) => {
      const def = ITEMS[id];
      const w = typeof window.canWield === 'function' ? window.canWield(id) : { ok: true };
      const line = gearLine(def);
      const right = w.ok
        ? `<button class="btn btn-sm btn-primary" data-cs="equip" data-item="${esc(id)}">Equip</button>`
        : `<span class="hr-cs-amt">Lv ${esc(w.req.lv)} ${esc(w.req.skill)}</span>`;
      return {
        name: `${itemImg(id, 'fsm-pick-art')}${esc(def.n)}`,
        meta: line || `×${num(inv[id])} held`,
        right,
      };
    });

    const sections = [];
    sections.push({
      kind: 'rows', title: 'Worn now',
      empty: 'Nothing in this slot.',
      rows: worn ? [{
        name: `${itemImg(wornId, 'fsm-pick-art')}${esc(worn.n)}`,
        meta: gearLine(worn) || meta.label,
        right: '<button class="btn btn-sm" data-cs="unequip">Take off</button>',
      }] : [],
    });
    sections.push({
      kind: 'rows', title: 'In your bag',
      empty: 'Nothing in your bag fits this slot.',
      rows,
    });
    return {
      id: 'combat-slot-' + slot, theme: 'vault',
      title: meta.label,
      subtitle: 'Change your gear without leaving the fight',
      sections,
      onAction: (act, el) => {
        if (act === 'equip') {
          const id = el.getAttribute('data-item');
          if (id && typeof window.equipItem === 'function') window.equipItem(id);
        } else if (act === 'unequip') {
          if (typeof window.unequip === 'function') window.unequip(slot);
        }
        renderFight();
        try { RM.refresh(); } catch (e) { /* the modal closed under us */ }
      },
    };
  };
  RM.open(build);
  return true;
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

/* The log-row loot rail is GONE (b366) — not lost, MOVED. It only existed
   while the fight was live and only under the log; the management rail carries
   the same ledger in a container that is also there before the fight, holding
   the drop table. Two lists of the same spoils on one screen is how a HUD comes
   to disagree with itself. */

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

/* ── THE CHAMPION PLATE (b368) ──────────────────────────────────────────────
   Tyler: "the avatar seems to be bugging back to the original even after being
   changed on the combat screen."

   Both painters of this node — this module's preview paint and legacy's
   `refreshArenaVs` — wrote it as `if (!pp.querySelector('img')) pp.innerHTML =
   …`. The guard is there for a real reason (b186: the portrait accumulates
   floating damage numbers and the DEFEATED stamp as CHILDREN, and an innerHTML
   rewrite every 200ms would erase them mid-swing) but it makes the plate
   WRITE-ONCE: it captures whatever `window._playerAvatar` happened to be at the
   first paint and can never be corrected. Change your portrait afterwards and
   `identity.applyAvatar()` updates `window._playerAvatar`, the topbar and the
   Character page — and the arena keeps the old face for the life of the
   document, which is the "bugging back to the original" being reported.

   The fix is not to drop the guard, it is to stop rewriting markup at all:
   the `<img>` is created once and thereafter only its `src` ATTRIBUTE is
   diffed. Children survive, the portrait tracks the live value, and there is
   still exactly one write per change rather than one per tick. The <img> is
   also inserted FIRST so damage numbers appended later paint over it.

   `window._playerAvatar` is deliberately the source rather than
   `HearthriseIdentity.avatarUrl()`: it is the seam the topbar, Character page
   and home dashboard already read, so the arena cannot disagree with them. */
function championAvatar() {
  return window._playerAvatar || 'assets/icons-bundle/painted/npc/player.png';
}
function syncChampionPortrait() {
  const pp = document.getElementById('arena-player-portrait');
  if (!pp) return null;
  let img = pp.querySelector('img');
  if (!img) {
    img = document.createElement('img');
    img.alt = '';
    pp.insertBefore(img, pp.firstChild);
  }
  const want = championAvatar();
  if (img.getAttribute('src') !== want) img.setAttribute('src', want);
  return img;
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
    /* b371 (F22): data-hr-avatar. This node is painted ONCE (the `!querySelector`
       guard above), so before the registry a portrait changed mid-session never
       reached the combat plate at all. syncChampionPortrait (the earlier b371
       plate fix) diffs the src attribute afterwards; the two guards compose. */
    pp.innerHTML = `<img src="${window._playerAvatar || 'assets/icons-bundle/painted/npc/player.png'}" alt="" data-hr-avatar />`;
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
  p.dataset.foeClass = m.cls || '';
  p.dataset.foeTier = m.tier || '';

  const title = document.getElementById('fs-title');
  const tsig = m.name + '|' + (m.family || '') + '|' + m.tier;
  if (title && title.dataset.sig !== tsig) {
    title.dataset.sig = tsig;
    title.innerHTML = `<b>${esc(m.name)}</b><span>${esc(m.family || 'Monster')} · Tier ${m.tier}</span>`;
  }

  if (!live) paintPreviewStage(id, m);
  /* b368 — OUTSIDE the preview branch on purpose. The champion plate is the
     player's own face and it is wrong in exactly the same way mid-fight; a fix
     that only lands in preview would look fixed until they pressed Fight. */
  syncChampionPortrait();

  // Levels — COMBAT-UI-09's second row, both sides.
  const plv = document.getElementById('fs-player-lv');
  if (plv) plv.textContent = 'Lv ' + combatLevel();
  const flv = document.getElementById('fs-foe-lv');
  if (flv) flv.textContent = 'Lv ' + ((m.tier - 1) * 15 + 1);

  /* Swing bars — COMBAT-UI-19, and since b366 the FILL IS NOT WRITTEN HERE.
     `Swing.sync` owns the geometry and only ever resyncs a CSS animation; this
     block owns the two labels. See the Swing module's header. */
  const eq = typeof window.getEquipmentStats === 'function' ? window.getEquipmentStats() : {};
  const wid = g && g.equipment && g.equipment.weapon;
  /* b368 — EMPTY HANDS ARE "Unarmed", not "Neutral". The `|| 'Unarmed'` tail was
     dead code: with no weapon worn, `eq.weaponType` is the engine's neutral
     class and `weaponLabel` returns the WEAPON_TYPES string "Neutral", which is
     truthy — so a player who has taken their sword off read "Neutral · 2.40s"
     on the one row that is supposed to tell them what they are swinging.
     Tyler is in exactly that state today. The weapon id is the test, not the
     label's truthiness. */
  const wname = (wid && ITEMS[wid] && ITEMS[wid].n) || (wid ? weaponLabel(eq.weaponType) : 'Unarmed');
  const swingS = (tickMs() / 1000).toFixed(2) + 's';
  const ps = document.getElementById('fs-player-swing');
  if (ps) {
    const lbl = `${wname} · ${swingS}`;
    const sp = ps.querySelector('span'); if (sp.textContent !== lbl) sp.textContent = lbl;
  }
  const fsw = document.getElementById('fs-foe-swing');
  if (fsw) {
    const lbl = `${esc(weaponLabel(m.weaponWeak) !== '—' ? m.family || 'Foe' : 'Foe')} · ${swingS}`;
    const sp = fsw.querySelector('span'); if (sp.textContent !== lbl) sp.textContent = lbl;
  }
  Swing.sync([ps, fsw], live);

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

  renderManage(m);
  adoptStyleBlock();
  renderMetrics(m, f);

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
    preview, setView, view, render, renderFight, openFromNav, openSlotPicker,
    repaintGear,
    _ledger: Ledger, _swing: Swing, _champion: syncChampionPortrait,
    /* b371 (F25): the destination list is pure and it is where the "Enter ▸ on
       a gated dungeon" defect lived, so the guard reads it directly rather
       than trying to find a disabled button in a strip the tick repaints. */
    _destinations: destinations,
    get previewId() { return previewId; },
  };

  setInterval(tick, 200);
  setInterval(slowTick, 1000);
  openFromNav();
  console.log('[Combat Screens] War Table + The Fight loaded');
}
