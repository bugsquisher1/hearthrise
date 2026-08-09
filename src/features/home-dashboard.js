// ============================================================
// src/features/home-dashboard.js  (revamp b154)
//
// A REAL rebuild of the Home/Profile screen — not a recolor of the
// old layout. Matches the revamp pitch: header + legible pills, an
// illuminated "next milestone" hero, actionable quests ("every card
// is a door"), today tiles, resume, and buffs.
//
// Architecture note (per CLAUDE.md): this is the first screen of the
// new component layer. It is styled with DESIGN TOKENS ONLY, so it
// renders correctly in every theme automatically — cream on Cozy Day,
// warm-dark on Hearthlight — with zero per-theme overrides. That is
// the whole point: build it right once, and theming is free.
//
// Integration is non-destructive: it renders into #panel-profile and
// hides the legacy dash cards via a scoped rule. The old renderer keeps
// running harmlessly against the (hidden) legacy nodes, so nothing else
// that depends on them breaks. Reads real state through the existing
// HearthriseLaunchpad API + window.G.
// ============================================================
(function () {
  'use strict';

  var STYLE_ID = 'home-dashboard-css';
  var ROOT_ID = 'hd-root';

  // Gate: the new Home is ON by default (solo build weekend — Tyler is the only
  // player). Easy opt-out if it misbehaves:
  //   localStorage.setItem('hearthrise:home-v2','0')   → old Home back
  //   localStorage.removeItem('hearthrise:home-v2')    → new Home again
  function enabled() {
    try { return localStorage.getItem('hearthrise:home-v2') !== '0'; }
    catch (e) { return true; }
  }

  function css() {
    // Every rule is prefixed with #hd-root and uses !important on colour /
    // background / border, so the legacy sheets' broad !important rules can't
    // leak cozy values into this component. Token VALUES still come from the
    // active theme — so it's cream on Cozy, warm-dark on Hearthlight, for free.
    // Two-ID prefix (#panel-profile #hd-root): the legacy theme has broad
    // always-on rules like `#panel-x [class*="tile"] { ... !important }` that
    // match our .hd-* classes and outrank a single-ID selector. Two IDs beat
    // any one-ID theme rule regardless of its class count.
    var R = '#panel-profile #' + ROOT_ID + ' ';
    return [
      '#panel-profile.active:has(#' + ROOT_ID + ') > .card,',
      '#panel-profile.active:has(#' + ROOT_ID + ') > .feat-buttons,',
      '#panel-profile.active:has(#' + ROOT_ID + ') > .prof-toolbar,',
      '#panel-profile.active:has(#' + ROOT_ID + ') > .dash-grid{display:none !important}',
      /* b213 (phase 2): legacy "block 30" forces the profile panel into a
         two-column dashboard grid (450px cells). This component owns the
         whole panel — without this reset it gets crushed into one cell and
         renders as a broken half-width column. */
      '#panel-profile.active:has(#' + ROOT_ID + '){display:block !important}',
      /* b219: the root is now full-bleed so the hearth band can reach the panel
         edge; .hd-wrap carries the old 1120px measure for everything else. */
      '#panel-profile #' + ROOT_ID + '{display:block;margin:0;padding:0 0 20px;font-family:var(--f-ui);color:var(--ink) !important}',
      R + '.hd-wrap{max-width:1120px;margin:0 auto;padding:0 4px}',

      /* ── b219 · THE HEARTH BAND ───────────────────────────────────────────
         Home had no background at all: `body` and every `.panel` paint an
         opaque surface, so the global backdrop scene (backdrop.js, b158) was
         occluded on literally every screen — the atmosphere existed in code
         and was invisible in the game. Rather than un-paint the shell (which
         would drag every other panel with it), Home composes the scene INTO
         the page: a dusk vista of the player's own holding, with identity
         standing on the ridge in front of it.

         It is a picture, so it is allowed to be a contained object — that is
         what "containment is earned" means. It is also the only such object
         above the fold, so it reads as the focal point instead of card #18. */
      /* Height scales with the viewport instead of stepping at breakpoints: the
         picture is always ~a quarter of the screen, so it stays generous on a
         desktop monitor and never eats a landscape phone's working area. */
      R + '.hd-hearth{position:relative;height:clamp(104px,24vh,204px);overflow:hidden;isolation:isolate;',
      'margin:-10px -10px 22px;border-bottom:1px solid var(--line) !important;',
      'box-shadow:0 10px 26px -22px rgba(0,0,0,.95)}',
      /* Scrim: light hand over the sky, heavy under the identity block, so the
         picture survives and the type still clears contrast. */
      R + '.hd-hearth::after{content:"";position:absolute;inset:0;pointer-events:none;',
      'background:linear-gradient(180deg,var(--scene-scrim-1) 0%,transparent 34%,var(--scene-scrim-2) 100%),',
      'linear-gradient(90deg,var(--scene-scrim-2) 0%,transparent 44%)}',
      R + '.hd-hearth-in{position:relative;z-index:2;height:100%;max-width:1120px;margin:0 auto;',
      'padding:0 14px 16px;display:flex;align-items:flex-end;gap:16px}',

      R + '.hd-who{display:flex;align-items:flex-end;gap:15px;min-width:0}',
      R + '.hd-ava{width:74px;height:74px;border-radius:var(--r);flex:0 0 auto;overflow:hidden;',
      'background:var(--bg-2) !important;border:1px solid var(--line-strong) !important;',
      'box-shadow:inset 0 1px 0 rgba(255,232,190,.14),0 6px 16px -6px rgba(0,0,0,.95)}',
      R + '.hd-eyebrow{font-family:var(--f-label);font-size:13.5px;letter-spacing:.06em;text-transform:uppercase;',
      'color:var(--scene-gilt) !important;font-weight:700;margin-bottom:2px;text-shadow:0 1px 6px rgba(0,0,0,.9)}',
      R + '.hd-name{font-family:var(--f-display);font-size:31px;font-weight:600;line-height:1.05;',
      'color:var(--scene-ink) !important;display:flex;align-items:center;gap:8px;',
      'text-shadow:0 2px 10px rgba(0,0,0,.9),0 1px 2px rgba(0,0,0,.9)}',
      R + '.hd-sub{font-size:13.5px;color:var(--scene-ink-2) !important;margin-top:5px;display:flex;align-items:center;gap:7px;flex-wrap:wrap;',
      'text-shadow:0 1px 6px rgba(0,0,0,.85)}',
      R + '.hd-sub b{font-family:var(--f-label);color:var(--scene-gilt) !important;font-weight:700;letter-spacing:.02em}',
      R + '.hd-sub .sep{opacity:.4}',
      R + '.hd-rename{background:none !important;border:0;cursor:pointer;opacity:.45;padding:2px;line-height:0}',
      R + '.hd-rename:hover{opacity:1}',
      /* Today's ledger rides the band's dark corner: three numbers a player
         glances at, out of the working rail and into the picture. */
      R + '.hd-ledger{margin-left:auto;display:flex;align-items:flex-end;gap:22px;padding-bottom:2px}',
      R + '.hd-led{text-align:right}',
      R + '.hd-led b{font-family:var(--f-display);font-size:22px;font-weight:600;color:var(--scene-ink) !important;',
      'display:block;line-height:1;font-variant-numeric:tabular-nums;text-shadow:0 2px 8px rgba(0,0,0,.9)}',
      R + '.hd-led span{font-family:var(--f-label);font-size:13.5px;letter-spacing:.05em;text-transform:uppercase;',
      'color:var(--scene-ink-3) !important;font-weight:700;display:block;margin-top:5px;text-shadow:0 1px 5px rgba(0,0,0,.9)}',
      '@media(max-width:760px){' + R + '.hd-ledger{display:none}}',
      '@media(max-width:640px),(max-height:520px){' +
        R + '.hd-name{font-size:23px}' + R + '.hd-ava{width:52px;height:52px}' +
        R + '.hd-sub{font-size:13.5px}' + R + '.hd-hearth-in{padding:0 12px 11px;gap:12px}}',

      /* ── b217 art direction ───────────────────────────────────────────────
         Home was seventeen bordered rounded boxes of identical weight: five
         stat pills that duplicated the topbar verbatim, six hero/quest cards,
         three "Today" tiles and three mini cards. Squinting at it produced a
         uniform grey field with no focal point, and the right column ran out
         of content two-thirds of the way down, leaving ~700px of unexplained
         black.

         Rebuilt around one idea: the LEFT column is what to DO, the RIGHT
         column is how you're DOING. Grouping comes from small-caps headings
         over an incised rule; only the claimable reward is allowed to be a lit
         object, because it is the only thing on the screen that is urgent. */

      R + '.hd-grid{display:grid;grid-template-columns:1.55fr 1fr;gap:34px;align-items:start}',
      '@media(max-width:900px){' + R + '.hd-grid{grid-template-columns:1fr;gap:22px}}',
      R + '.hd-col{display:flex;flex-direction:column;gap:22px;min-width:0}',

      /* Section heading — small caps over a fading incised rule. This is the
         ONLY grouping device on the screen; no section gets a box. */
      R + '.hd-h{display:flex;align-items:baseline;justify-content:space-between;gap:10px;',
      'padding-bottom:6px;margin-bottom:11px;position:relative}',
      R + '.hd-h::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;',
      'background:linear-gradient(90deg,var(--line-strong),rgba(201,162,74,.10) 62%,transparent)}',
      R + '.hd-h h3{margin:0;font-family:var(--f-label);font-size:13.5px;letter-spacing:.02em;',
      'color:var(--gold-2) !important;font-weight:700;text-transform:none}',
      R + '.hd-h a{font-size:13.5px;color:var(--ink-3) !important;font-weight:600;text-decoration:none;cursor:pointer}',
      R + '.hd-h a:hover{color:var(--gold-2) !important}',

      /* Rows sit on the world. A hairline separates them; no card, no radius. */
      R + '.hd-card{background:transparent !important;border:0 !important;border-radius:0;box-shadow:none}',
      R + '.hd-rows{display:flex;flex-direction:column}',
      R + '.hd-rows > .hd-card + .hd-card{border-top:1px solid rgba(236,225,204,.075) !important}',

      R + '.hd-mile{display:flex;align-items:center;gap:15px;padding:13px 4px;position:relative}',
      /* Struck-metal disc, not a gold ring around a floating glyph. */
      R + '.hd-mile-badge{flex:0 0 46px;height:46px;border-radius:50%;display:grid;place-items:center;',
      'background:radial-gradient(circle at 38% 28%,#2e2418,#15100a 78%) !important;',
      'border:1px solid rgba(201,162,74,.5) !important;',
      'box-shadow:inset 0 1px 0 rgba(255,232,190,.13),inset 0 -2px 4px rgba(0,0,0,.55)}',
      R + '.hd-mile-body{flex:1;min-width:0}',
      /* Cinzel is a titling face. Setting a TASK in it ("Defeat 5 monsters")
         renders a sentence as engraved capitals, which shouts louder than the
         section heading above it and doesn't match the identical quest rows
         directly below. Tasks are sentences; only names and ranks are titles. */
      R + '.hd-mile-title{font-size:15.5px;font-weight:600;color:var(--ink) !important;line-height:1.25}',
      R + '.hd-mile.is-title .hd-mile-title{font-family:var(--f-display);font-size:17px;font-weight:600;letter-spacing:.01em}',
      R + '.hd-mile-sub{font-size:13.5px;color:var(--ink-3) !important;margin:3px 0 8px;font-variant-numeric:tabular-nums}',
      R + '.hd-rn-eyebrow{font-family:var(--f-label);font-size:13.5px;letter-spacing:.02em;',
      'color:var(--ink-3) !important;font-weight:700;margin-bottom:2px}',
      R + '.hd-rn-claimdot{font-family:var(--f-label);font-size:13.5px;background:var(--gold) !important;',
      'color:#1b1305 !important;border-radius:2px;padding:2px 7px;font-weight:700;vertical-align:middle;margin-left:8px;white-space:nowrap}',

      /* THE one lit object on the screen. A claimable reward is the only thing
         that is genuinely urgent, so it is the only thing that glows. */
      R + '.hd-daily{cursor:pointer;padding:15px 16px;border-radius:var(--r) !important;',
      'background:linear-gradient(115deg,rgba(201,162,74,.20),rgba(201,162,74,.07) 58%,rgba(201,162,74,.02)) !important;',
      'border:1px solid rgba(201,162,74,.55) !important;',
      'box-shadow:inset 0 1px 0 rgba(255,240,205,.16),0 0 22px -12px rgba(201,162,74,.8);transition:box-shadow .18s}',
      R + '.hd-daily:hover{box-shadow:inset 0 1px 0 rgba(255,240,205,.22),0 0 26px -8px rgba(201,162,74,.9)}',
      R + '.hd-daily .hd-mile-badge{border-color:rgba(227,199,126,.75) !important;animation:hd-daily-pulse 2.6s ease-in-out infinite}',
      R + '.hd-daily .hd-mile-title{color:var(--gold-2) !important}',
      '@keyframes hd-daily-pulse{0%,100%{box-shadow:inset 0 1px 0 rgba(255,232,190,.13),inset 0 -2px 4px rgba(0,0,0,.55),0 0 0 0 rgba(201,162,74,.34)}' +
        '50%{box-shadow:inset 0 1px 0 rgba(255,232,190,.13),inset 0 -2px 4px rgba(0,0,0,.55),0 0 0 7px rgba(201,162,74,0)}}',

      /* Gauge, not a hairline. Recessed channel + lit fill. */
      R + '.hd-bar{height:7px;border-radius:1px;background:rgba(0,0,0,.42) !important;overflow:hidden;',
      'box-shadow:inset 0 1px 2px rgba(0,0,0,.7),inset 0 -1px 0 rgba(255,232,190,.05)}',
      'html:not([data-theme]) ' + R + '.hd-bar,body[data-theme="cozy-light"] ' + R + '.hd-bar{background:rgba(90,60,20,.14) !important}',
      R + '.hd-bar i{display:block;height:100%;border-radius:0;',
      'background:linear-gradient(180deg,color-mix(in srgb,var(--accent,var(--green)) 82%,#fff2cf),var(--accent,var(--green))) !important;',
      'box-shadow:inset 0 1px 0 rgba(255,255,255,.22)}',

      /* Quest row. The 4px coloured spine is gone — it was applying oxblood,
         moss and gilt to rows that differ only in which skill they route to,
         which spent the game's whole colour vocabulary on decoration. */
      R + '.hd-quest{display:flex;align-items:center;gap:13px;padding:12px 4px;position:relative}',
      R + '.hd-quest:hover{background:rgba(255,236,200,.028) !important}',
      R + '.hd-qic{flex:0 0 34px;height:34px;display:grid;place-items:center;opacity:.85}',
      R + '.hd-qbody{flex:1;min-width:0}',
      R + '.hd-qtitle{font-size:15.5px;font-weight:600;color:var(--ink) !important;line-height:1.25}',
      R + '.hd-qmeta{display:flex;justify-content:flex-start;gap:10px;align-items:baseline;margin:4px 0 7px}',
      R + '.hd-qmeta .p{font-size:13.5px;color:var(--ink-3) !important;font-weight:600;font-variant-numeric:tabular-nums}',
      R + '.hd-qmeta .r{font-size:13.5px;color:var(--gold-2) !important;font-weight:600;display:inline-flex;align-items:center;gap:4px}',

      /* Buttons follow the global hierarchy: gilt = primary, quiet = the rest.
         Every row used to ship a filled gold slab, so nothing was primary. */
      R + '.hd-cta{flex:0 0 auto;align-self:center;min-height:34px;display:inline-flex;align-items:center;',
      'justify-content:center;gap:6px;padding:0 15px;border-radius:var(--r);cursor:pointer;',
      'font:700 13.5px/1 var(--f-ui);white-space:nowrap;',
      'color:#221803 !important;border:1px solid #e6cd93 !important;',
      'background:linear-gradient(180deg,#d9b361 0%,#c09539 52%,#a67c28 100%) !important;',
      'box-shadow:inset 0 1px 0 rgba(255,246,220,.55),inset 0 -2px 3px rgba(90,60,8,.4),0 2px 5px -2px rgba(0,0,0,.7);',
      'transition:filter .12s,transform .06s}',
      R + '.hd-cta:active{transform:translateY(1px)}',
      R + '.hd-cta:hover{filter:brightness(1.07)}',
      /* Secondary, not invisible. These are the actual affordance on every
         quest row — at --ink-3 on near-black they read as disabled text. */
      R + '.hd-cta.ghost{color:var(--ink-2) !important;font-weight:600;',
      'border:1px solid var(--line) !important;',
      'background:linear-gradient(180deg,rgba(255,236,200,.075),rgba(255,236,200,.018) 55%,rgba(0,0,0,.1)) !important;',
      'box-shadow:inset 0 1px 0 rgba(255,240,210,.09),0 1px 0 rgba(0,0,0,.45)}',
      R + '.hd-cta.ghost:hover{color:var(--gold-2) !important;border-color:rgba(201,162,74,.45) !important;',
      'background:linear-gradient(180deg,rgba(255,236,200,.13),rgba(255,236,200,.04)) !important}',

      R + '.hd-mini{padding:10px 4px;font-size:13.5px;color:var(--ink-2) !important;display:flex;align-items:center;gap:11px}',
      R + '.hd-mini .mi{flex:0 0 30px;height:30px;display:grid;place-items:center;opacity:.8}',
      R + '.hd-mini b{color:var(--ink) !important;font-size:15px;font-weight:700}',
      R + '.hd-mini div:not([data-hd]),' + R + '.hd-mini span:not([data-hd]){color:var(--ink-2) !important}',
      R + '.hd-mini .go{margin-left:auto}',

      /* ── b219 · two-line status row ───────────────────────────────────────
         Used by "The realm" (world events) and the homestead's next tier: a
         name, a consequence, and a right-aligned when. Same hairline-separated
         row language as everything else — no new box types. */
      R + '.hd-duo{display:flex;align-items:flex-start;gap:11px;padding:11px 4px}',
      R + '.hd-duo .mi{flex:0 0 30px;height:30px;display:grid;place-items:center;opacity:.85;margin-top:1px}',
      R + '.hd-duo .bd{flex:1;min-width:0}',
      R + '.hd-duo .t{font-size:15px;font-weight:700;color:var(--ink) !important;line-height:1.2}',
      R + '.hd-duo .s{font-size:13.5px;color:var(--ink-3) !important;margin-top:3px;line-height:1.35}',
      R + '.hd-duo .when{flex:0 0 auto;font-family:var(--f-label);font-size:13.5px;letter-spacing:.05em;',
      'text-transform:uppercase;color:var(--ink-3) !important;font-weight:700;padding-top:3px;white-space:nowrap}',
      /* The holding's own line: cost list reads as a shopping list, tabular. */
      R + '.hd-cost{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:5px;font-size:13.5px;',
      'color:var(--ink-3) !important;font-variant-numeric:tabular-nums}',
      R + '.hd-cost i{font-style:normal;color:var(--ink-2) !important;font-weight:600}',
      R + '.hd-cost i.short{color:var(--red) !important}',
      /* An inline link inside a supporting line — gilt, never a raw accent. */
      R + '.hd-link{color:var(--gold-2) !important;font-weight:600;cursor:pointer}',
      R + '.hd-link:hover{color:var(--gold) !important;text-decoration:underline;text-underline-offset:3px}'
    ].join('\n');
  }

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = css();
    document.head.appendChild(s);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function num(n) { try { return (n | 0).toLocaleString(); } catch (e) { return String(n || 0); } }

  var LP = function () { return window.HearthriseLaunchpad || {}; };
  var call = function (fn) { try { return typeof fn === 'function' ? fn() : null; } catch (e) { return null; } };

  // Map a quest to a place ("every card is a door").
  /* b213 (phase 2): gilt SVG glyph from the shared icon set. Falls back to
     the supplied emoji only until the icon paths finish their one-time
     fetch — after that the dashboard is emoji-free (directive). */
  function gly(key, px, fallback, color) {
    var IS = window.HearthriseIconSet;
    var p = key && IS && IS.path && IS.path(key);
    if (!p) return fallback || '';
    return '<svg viewBox="0 0 512 512" style="width:' + (px || 20) + 'px;height:' + (px || 20) + 'px;' +
      'display:inline-block;vertical-align:middle" aria-hidden="true"><path fill="' + (color || 'var(--gold-2)') + '" d="' + p + '"/></svg>';
  }
  /* b227 — this used to be a private regex table that only ever saw a task's
     LABEL, so it could not tell "Gather 50 resources" from "Gather 250 ores"
     and its gold rule navigated to `market` two builds before a market panel
     existed. Worse, its fallback was View → open the Quests modal, which is
     precisely the audit's finding #2: the button opened a window that did not
     contain the quest you clicked.

     The mapping now lives in src/features/quest-nav.js and is derived from the
     task's own `type` / `source` fields with the label only as a net, so Home
     and the Quests modal cannot disagree about where a quest is played. */
  function questRoute(task) {
    var QN = window.HearthriseQuestNav;
    var d = (QN && typeof QN.destination === 'function') ? QN.destination(task) : null;
    if (!d) {
      // quest-nav is a separate <script>; a missing resolver is a wiring break.
      return { key: 'bountyHunter', verb: 'Go', go: function () { nav('skills'); } };
    }
    return {
      key: d.glyph,
      verb: d.verb,
      label: d.label,
      go: function () { if (QN && typeof QN.go === 'function') QN.go(task); },
    };
  }
  function nav(t) { if (typeof window.showTab === 'function') window.showTab(t); }
  function openSkill(id) { if (typeof window.openSkillDetail === 'function') window.openSkillDetail(id); }
  function openQuests() { if (typeof window.openQuestsModal === 'function') window.openQuestsModal(); else nav('profile'); }

  /* Homestead tiers and world events both carry an emoji `icon`/`glyph` in
     their data (⛺, 🏡, 🔥, 🎪). Nothing renders emoji as art in Hearthrise, so
     the ids are mapped onto the baked atlas here instead. */
  var HOLDING_GLYPH = {
    camp: 'uiCamp', homestead: 'uiHome', farmstead: 'uiBarn',
    manor: 'uiBanner', keep: 'uiCastle', castle: 'uiCrown'
  };
  var EVENT_GLYPH = {
    gather_surge: 'uiPickaxe', forge_fires: 'uiFlame', harvest_fest: 'uiWheat',
    scholars_day: 'uiScroll', hunters_moon: 'uiBow', feast_day: 'uiPot',
    quiet_vigil: 'prayer', grand_fair: 'uiBanner', deep_veins: 'uiOre',
    war_drums: 'uiSword', guild_works: 'uiHammer'
  };
  // Item ids in an upgrade cost read as `normal_log`; the player sees names.
  // `ITEMS[id].n` is the display name (not `.name`) — same source homestead.js
  // reads, so Home and the House panel can never disagree about a cost.
  function itemName(id) {
    if (id === 'gold') return 'Gold';
    return (window.ITEMS && window.ITEMS[id] && window.ITEMS[id].n) || String(id).replace(/_/g, ' ');
  }
  function itemHeld(G, id) {
    if (id === 'gold') return G.gold || 0;
    return (G.inventory && G.inventory[id]) || 0;
  }

  function playerName() {
    var G = window.G || {};
    var sess = call(function () { return window.HearthriseAuth && window.HearthriseAuth.getSession(); });
    var u = sess && sess.user;
    var custom = (typeof G.playerName === 'string' && G.playerName && G.playerName !== 'Adventurer') ? G.playerName : null;
    return custom || (u && (u.user_metadata && u.user_metadata.display_name || (u.email || '').split('@')[0])) || G.playerName || 'Adventurer';
  }
  function isOnline() {
    var sess = call(function () { return window.HearthriseAuth && window.HearthriseAuth.getSession(); });
    return !!((sess && sess.user) || (window.G && window.G.account));
  }

  function render() {
    if (!enabled()) return;
    var panel = document.getElementById('panel-profile');
    if (!panel || !panel.classList.contains('active') || !window.G) return;
    ensureStyle();

    var root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      panel.insertBefore(root, panel.firstChild);
    }

    var G = window.G;
    var cl = (typeof window.getCombatLevel === 'function') ? window.getCombatLevel() : 0;
    var tl = (typeof window.getTotalLevel === 'function') ? window.getTotalLevel() : 0;
    var mile = LP().getNextMilestone ? call(LP().getNextMilestone) : null;
    var today = LP().getTodayDelta ? call(LP().getTodayDelta) : null;
    var resume = LP().getResumePayload ? call(LP().getResumePayload) : null;
    var tasks = (G.daily && Array.isArray(G.daily.tasks)) ? G.daily.tasks.filter(function (t) { return !t.done; }).slice(0, 3) : [];

    // current activity
    var activeName = G.activeMonster ? (window.MONSTERS && window.MONSTERS[G.activeMonster] && window.MONSTERS[G.activeMonster].name)
      : G.activeSkill ? (window.SKILLS_DEF && window.SKILLS_DEF[G.activeSkill] && window.SKILLS_DEF[G.activeSkill].name) : null;

    // Homestead standing — drives both the scene and the "Your holding" rows.
    var HS = window.HearthriseHomestead;
    var hsTier = 0, hsDef = null, hsNext = null;
    try {
      // These read window.G themselves and take no arguments — passing G in
      // made tierDef() index TIERS by an object and silently return undefined.
      if (HS && HS.getTier) { hsTier = HS.getTier() | 0; hsDef = HS.tierDef(); hsNext = HS.nextTier(); }
    } catch (e) {}

    var html = '';
    // ── the hearth band ───────────────────────────────────────────────────
    // Identity stands in front of the player's own holding at dusk, and the
    // day's ledger rides the dark corner. The five stat pills that used to sit
    // here (Total Lv / Combat / Gold / Gems / Log) stay gone — they are pinned
    // in the topbar 40px above and two of them disagreed with it.
    var rankLine = '';
    try {
      var _rn = window.HearthriseRenown && window.HearthriseRenown.getState(G);
      if (_rn) rankLine = '<b>' + esc(_rn.rank.name) + '</b><span class="sep">·</span>' + num(_rn.renown) + ' Renown';
    } catch (e) {}

    var xp = today && (today.xp != null ? today.xp : today.totalXp);
    var kills = today && (today.kills != null ? today.kills : (G.stats && G.stats.kills));
    var harvest = today && (today.harvested != null ? today.harvested : today.gathered);

    var scene = '';
    try { scene = window.HearthriseBackdrop && window.HearthriseBackdrop.homesteadScene(hsTier) || ''; } catch (e) {}

    html += '<div class="hd-hearth">' + scene + '<div class="hd-hearth-in">';
    html += '<div class="hd-who"><div class="hd-ava">' +
      '<img src="assets/icons-bundle/painted/npc/player.png" alt="" style="width:100%;height:100%;object-fit:cover;display:block"></div><div style="min-width:0">';
    html += '<div class="hd-eyebrow">' + esc((hsDef && hsDef.name) || "Wanderer's Camp") + '</div>';
    html += '<div class="hd-name">' + esc(playerName()) +
      '<button class="hd-rename" title="Rename" data-hd="rename">' + gly('uiEdit', 14, '', 'var(--ink-3)') + '</button></div>';
    html += '<div class="hd-sub">' + rankLine +
      (rankLine ? '<span class="sep">·</span>' : '') +
      /* b224: see legacy.js updateNetStatus — with accounts required, the
         un-synced state is a connection problem, not an offer. */
      (isOnline() ? 'Online · cloud save active' : 'Offline · progress saved on this device') + '</div>';
    html += '</div></div>';
    html += '<div class="hd-ledger">' +
      '<div class="hd-led"><b>' + (xp != null ? num(xp) : '0') + '</b><span>XP today</span></div>' +
      '<div class="hd-led"><b>' + (kills != null ? num(kills) : '0') + '</b><span>Kills</span></div>' +
      '<div class="hd-led"><b>' + (harvest != null ? num(harvest) : '0') + '</b><span>Harvest</span></div>' +
      '</div>';
    html += '</div></div>';

    // ── grid ──
    html += '<div class="hd-wrap"><div class="hd-grid"><div class="hd-col">';

    // Daily reward — top priority when a reward is waiting to be claimed
    var DL = window.HearthriseDaily;
    if (DL && DL.isClaimable && DL.isClaimable(G)) {
      try {
        var dlrw = DL.rewardFor(G);
        var dlt = [];
        if (dlrw.gold) dlt.push(gly('gold', 13, '', 'var(--gold-2)') + ' ' + num(dlrw.gold) + (gly('gold', 1) ? '' : ' gold'));
        if (dlrw.gems) dlt.push(gly('gems', 13, '', 'var(--gem)') + ' ' + num(dlrw.gems) + (gly('gems', 1) ? '' : ' gems'));
        html += '<div class="hd-card hd-mile hd-daily is-title" data-hd="daily">' +
          '<div class="hd-mile-badge">' + gly('uiGift', 22, '', '#f0dfb8') + '</div>' +
          '<div class="hd-mile-body">' +
            '<div class="hd-rn-eyebrow">Daily reward · Day ' + DL.cycleDay(G) + '</div>' +
            '<div class="hd-mile-title">Reward ready</div>' +
            '<div class="hd-mile-sub">' + dlt.join(' · ') + ' waiting to claim</div>' +
          '</div>' +
          '<button class="hd-cta">Claim</button>' +
        '</div>';
      } catch (e) { /* daily optional */ }
    }

    // ── LEFT: what to do ──────────────────────────────────────────────────
    // Milestone + quests are one list ("Next up"), not four separate hero
    // cards competing for the same job. Renown moved to the status rail: it
    // is a measure of how you're doing, not an action.
    html += '<div><div class="hd-h"><h3>Next up</h3><a data-hd="allquests">All quests →</a></div><div class="hd-rows">';
    var anyNext = false;
    if (mile) {
      anyNext = true;
      var mpct = Math.round((mile.pct || 0) * 100);
      var isQuest = mile.kind === 'quest';
      html += '<div class="hd-card hd-mile">' +
        '<div class="hd-mile-badge">' + gly('bountyHunter', 22, '', '#e6d6b4') + '</div>' +
        '<div class="hd-mile-body">' +
        '<div class="hd-mile-title">' + esc(mile.label) + '</div>' +
        '<div class="hd-mile-sub">' + num(mile.current) + ' / ' + num(mile.target) + ' · ' + mpct + '%</div>' +
        '<div class="hd-bar" style="--accent:var(--gold)"><i style="width:' + mpct + '%"></i></div>' +
        '</div>' +
        /* b227: a quest milestone's button used to say "View" and open a modal
           that did not contain it. It now carries the destination's own verb
           ("Go fish") and lands on the screen the quest is played on. */
        '<button class="hd-cta" data-hd="mile">' + esc(isQuest ? (mile.verb || 'Go') : 'Train') + '</button>' +
        '</div>';
    }
    if (tasks.length) {
      anyNext = true;
      tasks.forEach(function (t, i) {
        var r = questRoute(t);
        var pct = t.goal ? Math.round(((t.progress || 0) / t.goal) * 100) : 0;
        // Rewards are plain numbers in the data ("400"). Pairing them with the
        // gold glyph is what makes a number read as currency instead of as a
        // second progress figure sitting next to "0 / 50".
        var reward = t.reward != null ? String(t.reward) : (t.rewardText || '');
        var rewardHtml = reward
          ? (/^\d[\d,]*$/.test(reward.trim())
              ? gly('gold', 13, '', 'var(--gold-2)') + '<span>' + esc(reward) + '</span>'
              : '<span>' + esc(reward) + '</span>')
          : '';
        html += '<div class="hd-card hd-quest">' +
          '<div class="hd-qic">' + gly(r.key, 22, '', 'var(--ink-2)') + '</div>' +
          '<div class="hd-qbody">' +
          '<div class="hd-qtitle">' + esc(t.label) + '</div>' +
          '<div class="hd-qmeta"><span class="p">' + num(t.progress || 0) + ' / ' + num(t.goal || 0) + '</span>' +
          (rewardHtml ? '<span class="r">' + rewardHtml + '</span>' : '') + '</div>' +
          '<div class="hd-bar" style="--accent:var(--green)"><i style="width:' + pct + '%"></i></div>' +
          '</div>' +
          '<button class="hd-cta ghost" data-hd="q" data-i="' + i + '"' +
            (r.label ? ' title="' + esc(r.label) + '"' : '') + '>' + esc(r.verb) + '</button>' +
          '</div>';
      });
    }
    if (!anyNext) {
      html += '<div class="hd-card hd-mini"><div class="mi">' + gly('uiCheck', 20, '', 'var(--green)') +
        '</div><div>All daily quests done — new ones at reset.</div></div>';
    }
    html += '</div></div>';

    // ── Your holding ──────────────────────────────────────────────────────
    // The game is called Idle Homestead and the homestead was nowhere on Home.
    // This is the long-arc build order: what you live in, what it grants you,
    // and exactly what the next tier costs — with what you're short of called
    // out, so the section is a plan rather than a boast.
    if (hsDef) {
      html += '<div><div class="hd-h"><h3>Your holding</h3><a data-hd="house">Homestead →</a></div><div class="hd-rows">';
      var grants = [];
      grants.push((HS.maxPlots ? HS.maxPlots() : hsDef.plots) + ' farm plots');
      var ws = HS.workerSlots ? HS.workerSlots() : hsDef.workers;
      grants.push(ws ? (ws + ' worker' + (ws === 1 ? '' : 's')) : 'no hired hands');
      var oh = hsDef.offlineHours || 0;
      grants.push(oh ? ('+' + oh + 'h offline cap') : 'base offline cap');
      html += '<div class="hd-card hd-mile is-title" data-hd="house" style="cursor:pointer;padding-left:0">' +
        '<div class="hd-mile-badge">' + gly(HOLDING_GLYPH[hsDef.id] || 'uiHome', 22, '', '#e6d6b4') + '</div>' +
        '<div class="hd-mile-body">' +
          '<div class="hd-mile-title">' + esc(hsDef.name) + '</div>' +
          '<div class="hd-mile-sub">' + esc(grants.join(' · ')) + '</div>' +
        '</div></div>';
      if (hsNext) {
        var costHtml = '';
        try {
          costHtml = Object.keys(hsNext.cost || {}).map(function (k) {
            var need = hsNext.cost[k], have = itemHeld(G, k);
            // Clamp to the requirement: "1,000/400 Gold" reads as a shortfall
            // at a glance even though it is a surplus. Same as the House panel.
            return '<span><i class="' + (have >= need ? '' : 'short') + '">' +
              num(Math.min(have, need)) + '/' + num(need) + '</i> ' + esc(itemName(k)) + '</span>';
          }).join('');
        } catch (e) {}
        html += '<div class="hd-card hd-duo">' +
          '<div class="mi">' + gly(HOLDING_GLYPH[hsNext.id] || 'uiHome', 20, '', 'var(--ink-2)') + '</div>' +
          '<div class="bd"><div class="t">' + esc(hsNext.name) + '</div>' +
            '<div class="s">' + esc(hsNext.desc) + '</div>' +
            (costHtml ? '<div class="hd-cost">' + costHtml + '</div>' : '') +
          '</div>' +
          '<button class="hd-cta ghost" data-hd="house">Build</button></div>';
      }
      html += '</div></div>';
    }

    html += '</div><div class="hd-col">';

    // ── RIGHT: how you're doing ───────────────────────────────────────────
    // This rail used to hold three items and then ~700px of nothing. It now
    // carries the four things a player checks between actions.

    // Right now / jump back in — first, because "what am I doing" is the
    // question an idle game has to answer on sight.
    html += '<div><div class="hd-h"><h3>Right now</h3></div>';
    if (activeName) {
      html += '<div class="hd-card hd-mini"><div class="mi">' +
        (G.activeMonster ? gly('navCombat', 20, '', 'var(--red)') : gly(G.activeSkill || 'smithing', 20, '', 'var(--green)')) + '</div>' +
        '<div><b>' + esc(activeName) + '</b><div style="font-size:13.5px;color:var(--ink-3)">' + (G.activeMonster ? 'In combat' : 'Training') + '</div></div>' +
        '<button class="hd-cta ghost go" data-hd="active">Open</button></div>';
    } else if (resume) {
      html += '<div class="hd-card hd-mini"><div class="mi">' + gly(resume.skill || resume.id, 20, '', 'var(--ink-2)') + '</div>' +
        '<div><b>' + esc(resume.label) + '</b><div style="font-size:13.5px;color:var(--ink-3)">Idle — nothing running</div></div>' +
        '<button class="hd-cta ghost go" data-hd="resume">Resume</button></div>';
    } else {
      html += '<div class="hd-card hd-mini"><div class="mi">' + gly('uiIdle', 20, '', 'var(--ink-3)') + '</div>' +
        '<div>Idle — pick a skill or a monster to start earning.</div></div>';
    }
    html += '</div>';

    // Renown — the long game. Status, so it lives in the status rail.
    var RN = window.HearthriseRenown;
    if (RN && RN.getState) {
      try {
        var rs = RN.getState(G);
        var claimN = (RN.getClaimable ? RN.getClaimable(G) : []).length;
        var rpct = Math.round((rs.progress || 0) * 100);
        var nextTxt = rs.isMax ? 'Summit reached' : (num(rs.toNext) + ' to ' + esc(rs.next.name));
        html += '<div><div class="hd-h"><h3>Rise to the throne</h3><a data-hd="renown">Ladder →</a></div>' +
          '<div class="hd-card hd-mile is-title" data-hd="renown" style="cursor:pointer;padding-left:0">' +
            '<div class="hd-mile-badge">' + gly('totalLvl', 22, '', '#e6d6b4') + '</div>' +
            '<div class="hd-mile-body">' +
              '<div class="hd-mile-title">' + esc(rs.rank.name) +
                (claimN ? '<span class="hd-rn-claimdot">' + claimN + ' ready</span>' : '') + '</div>' +
              '<div class="hd-mile-sub">' + num(rs.renown) + ' Renown · ' + nextTxt + '</div>' +
              '<div class="hd-bar" style="--accent:var(--gold)"><i style="width:' + rpct + '%"></i></div>' +
            '</div>' +
          '</div></div>';
      } catch (e) { /* renown optional */ }
    }

    // The realm — world events. They already change how fast every skill runs,
    // but the only place they were stated was a one-line ticker pinned in the
    // bottom-right corner behind the chat button. A modifier the player is
    // supposed to plan around belongs where they plan.
    var WE = window.HearthriseWorldEvents;
    if (WE && WE.daily) {
      try {
        var wd = WE.daily(), ww = WE.weekly && WE.weekly();
        // b227: read the world-events module's own glyph map when it has one,
        // so Home and the Events panel cannot disagree about what an event
        // looks like. The local copy stays as the pre-boot fallback.
        var GLY = (WE.EVENT_GLYPH || EVENT_GLYPH);
        var evLive = !!(WE.isActive && WE.isActive());
        var evRow = function (e, when) {
          return '<div class="hd-card hd-duo"' + (evLive ? '' : ' style="opacity:.62"') + '>' +
            '<div class="mi">' + gly(GLY[e.id] || 'uiEvent', 20, '', 'var(--gold-2)') + '</div>' +
            '<div class="bd"><div class="t">' + esc(e.name) + '</div>' +
              '<div class="s">' + esc(e.desc) + '</div></div>' +
            '<div class="when">' + when + '</div></div>';
        };
        // b227: the blessings are session-gated, so the panel that announces
        // them is the panel that must state the condition. A player who reads
        // "+25% gather speed" here and then banks a night at the base rate has
        // been misled by omission, which is still being misled. b229: the
        // condition is being in the game, not being at the screen — and the
        // only mid-session way to lose it is a real disconnection.
        html += '<div><div class="hd-h"><h3>The realm</h3></div><div class="hd-rows">' +
          evRow(wd, 'Today') + (ww ? evRow(ww, 'This week') : '') +
          '<div class="hd-card hd-mini"><div class="mi">' + gly('uiInfo', 20, '', 'var(--ink-2)') + '</div>' +
            '<div>' + (evLive
              ? 'Blessings are alive while you’re in the game. Away? You earn the steady base rate.'
              : 'Reconnecting — blessings resume the moment you’re back online.') + '</div>' +
          '</div>' +
          '</div></div>';
      } catch (e) { /* world events optional */ }
    }

    // Upkeep — buffs + collection progress. Two one-line facts, not two cards.
    var hasFood = G.foodSlot || (G.buffs && G.buffs.length);
    html += '<div><div class="hd-h"><h3>Upkeep</h3></div><div class="hd-rows">';
    html += '<div class="hd-card hd-mini"><div class="mi">' + gly('cooking', 20, '', 'var(--ink-2)') + '</div>' +
      (hasFood
        ? '<div>Food buff active.</div>'
        : '<div>No food buff. <span class="hd-link" data-hd="cook">Cook something →</span></div>') +
      '</div>';
    if (window.HearthriseCollection && window.HearthriseCollection.getStats) {
      try {
        var _clp = Math.round(window.HearthriseCollection.getStats(G).overall * 100);
        html += '<div class="hd-card hd-mini" data-hd="collection" style="cursor:pointer">' +
          '<div class="mi">' + gly('uiBook', 20, '', 'var(--ink-2)') + '</div>' +
          '<div>Collection log</div>' +
          '<b class="go" style="font-variant-numeric:tabular-nums">' + _clp + '%</b></div>';
      } catch (e) {}
    }
    html += '</div></div>';

    html += '</div></div></div>';

    root.innerHTML = html;
    wire(root, tasks, mile, resume);
  }

  function wire(root, tasks, mile, resume) {
    root.querySelectorAll('[data-hd]').forEach(function (el) {
      var kind = el.getAttribute('data-hd');
      el.onclick = function (e) {
        e.preventDefault();
        try {
          if (kind === 'rename') {
            var nm = prompt('Display name:', (window.G && window.G.playerName) || 'Adventurer');
            if (nm && LP().setDisplayName) { LP().setDisplayName(nm); render(); }
          } else if (kind === 'collection') { if (window.HearthriseCollection) window.HearthriseCollection.open(); }
          else if (kind === 'daily') { if (window.HearthriseDaily) window.HearthriseDaily.open(); }
          else if (kind === 'renown') { if (window.HearthriseRenown) window.HearthriseRenown.openLadder(); }
          else if (kind === 'mile' && mile && mile.deepLink) { mile.deepLink(); }
          else if (kind === 'allquests') { openQuests(); }
          else if (kind === 'q') { var i = +el.getAttribute('data-i'); var t = tasks[i]; if (t) questRoute(t).go(); }
          else if (kind === 'active') { nav('profile'); if (window.G.activeMonster) nav('combat'); else nav('skills'); }
          else if (kind === 'resume' && resume && resume.action) { resume.action(); }
          else if (kind === 'cook') { nav('skills'); openSkill('cooking'); }
          else if (kind === 'house') { nav('house'); }
        } catch (err) { /* no-op */ }
      };
    });
  }

  // ── triggers ──
  function maybeRender() {
    var p = document.getElementById('panel-profile');
    if (p && p.classList.contains('active')) render();
  }
  // wrap the global showTab (nav clicks) so switching to Profile draws us
  var _st = window.showTab;
  window.showTab = function (t) {
    var r = (typeof _st === 'function') ? _st.apply(this, arguments) : undefined;
    if (t === 'profile') setTimeout(render, 30);
    return r;
  };
  // keep fresh while visible (progress bars, live activity)
  setInterval(maybeRender, 1500);
  // initial
  if (document.readyState !== 'loading') setTimeout(maybeRender, 300);
  else document.addEventListener('DOMContentLoaded', function () { setTimeout(maybeRender, 300); });

  window.HearthriseHome = { render: render };
  console.log('[home-dashboard] loaded');
})();
