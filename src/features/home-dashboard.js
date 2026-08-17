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
      R + '.hd-eyebrow{font-family:var(--f-label);font-size:calc(14.5px * var(--ui-scale, 1));letter-spacing:.06em;text-transform:uppercase;',
      'color:var(--scene-gilt) !important;font-weight:700;margin-bottom:2px;text-shadow:0 1px 6px rgba(0,0,0,.9)}',
      R + '.hd-name{font-family:var(--f-display);font-size:31px;font-weight:600;line-height:1.05;',
      'color:var(--scene-ink) !important;display:flex;align-items:center;gap:8px;',
      'text-shadow:0 2px 10px rgba(0,0,0,.9),0 1px 2px rgba(0,0,0,.9)}',
      R + '.hd-sub{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--scene-ink-2) !important;margin-top:5px;display:flex;align-items:center;gap:7px;flex-wrap:wrap;',
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
      R + '.hd-led span{font-family:var(--f-label);font-size:calc(14.5px * var(--ui-scale, 1));letter-spacing:.05em;text-transform:uppercase;',
      'color:var(--scene-ink-3) !important;font-weight:700;display:block;margin-top:5px;text-shadow:0 1px 5px rgba(0,0,0,.9)}',
      '@media(max-width:760px){' + R + '.hd-ledger{display:none}}',
      '@media(max-width:640px),(max-height:520px){' +
        R + '.hd-name{font-size:23px}' + R + '.hd-ava{width:52px;height:52px}' +
        R + '.hd-sub{font-size:calc(14.5px * var(--ui-scale, 1))}' + R + '.hd-hearth-in{padding:0 12px 11px;gap:12px}}',

      /* b315 · COMPACT HERO STRIP for the short landscape phone.
         On a ~430px-tall landscape screen the clamp(104px…) picture plus its
         22px skirt ate a third of the viewport and shoved "Next up" off the
         bottom. Here the band collapses to a single ~56px strip: a small
         avatar beside the name, rank/status on a tight second line, the
         backdrop reduced to a thin lit horizon. The homestead eyebrow is the
         one line dropped — it is the least load-bearing, and the name below it
         already carries identity. Every readable string stays ≥14.5px; only
         the CHROME (backdrop height, avatar, vertical padding, the big ledger
         numerals) shrinks. Same #panel-profile #hd-root prefix + later source
         order as the base rules, so it wins without a specificity fight.
         Scoped to the landscape-rail query only → desktop + portrait untouched. */
      '@media (max-height:540px) and (orientation:landscape) and (max-width:1024px){' +
        R + '.hd-hearth{height:56px;margin:-10px -10px 10px}' +
        R + '.hd-hearth-in{padding:0 12px;align-items:center;gap:12px}' +
        R + '.hd-who{align-items:center;gap:11px}' +
        R + '.hd-ava{width:40px;height:40px}' +
        R + '.hd-eyebrow{display:none}' +
        R + '.hd-name{font-size:19px}' +
        R + '.hd-sub{margin-top:1px}' +
        R + '.hd-ledger{align-items:center;padding-bottom:0}' +
        R + '.hd-led b{font-size:19px}' +
      '}',

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
      '@media(max-width:900px), (max-height:540px) and (max-width:1024px){' + R + '.hd-grid{grid-template-columns:1fr;gap:22px}}',
      R + '.hd-col{display:flex;flex-direction:column;gap:22px;min-width:0}',

      /* Section heading — small caps over a fading incised rule. This is the
         ONLY grouping device on the screen; no section gets a box. */
      R + '.hd-h{display:flex;align-items:baseline;justify-content:space-between;gap:10px;',
      'padding-bottom:6px;margin-bottom:11px;position:relative}',
      R + '.hd-h::after{content:"";position:absolute;left:0;right:0;bottom:0;height:1px;',
      'background:linear-gradient(90deg,var(--line-strong),rgba(201,162,74,.10) 62%,transparent)}',
      R + '.hd-h h3{margin:0;font-family:var(--f-label);font-size:calc(14.5px * var(--ui-scale, 1));letter-spacing:.02em;',
      'color:var(--gold-2) !important;font-weight:700;text-transform:none}',
      R + '.hd-h a{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3) !important;font-weight:600;text-decoration:none;cursor:pointer}',
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
      R + '.hd-mile-sub{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3) !important;margin:3px 0 8px;font-variant-numeric:tabular-nums}',
      R + '.hd-rn-eyebrow{font-family:var(--f-label);font-size:calc(14.5px * var(--ui-scale, 1));letter-spacing:.02em;',
      'color:var(--ink-3) !important;font-weight:700;margin-bottom:2px}',
      R + '.hd-rn-claimdot{font-family:var(--f-label);font-size:calc(14.5px * var(--ui-scale, 1));background:var(--gold) !important;',
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
      R + '.hd-qmeta .p{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3) !important;font-weight:600;font-variant-numeric:tabular-nums}',
      R + '.hd-qmeta .r{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--gold-2) !important;font-weight:600;display:inline-flex;align-items:center;gap:4px}',

      /* Buttons follow the global hierarchy: gilt = primary, quiet = the rest.
         Every row used to ship a filled gold slab, so nothing was primary. */
      R + '.hd-cta{flex:0 0 auto;align-self:center;min-height:34px;display:inline-flex;align-items:center;',
      'justify-content:center;gap:6px;padding:0 15px;border-radius:var(--r);cursor:pointer;',
      /* P2: was bare 13.5px — below the 14.5px type floor and ignored UI scale. */
      'font-weight:700;font-size:calc(14.5px * var(--ui-scale, 1));line-height:1;font-family:var(--f-ui);white-space:nowrap;',
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

      R + '.hd-mini{padding:10px 4px;font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-2) !important;display:flex;align-items:center;gap:11px}',
      R + '.hd-mini .mi{flex:0 0 30px;height:30px;display:grid;place-items:center;opacity:.8}',
      R + '.hd-mini b{color:var(--ink) !important;font-size:calc(15px * var(--ui-scale, 1));font-weight:700}',
      R + '.hd-mini div:not([data-hd]),' + R + '.hd-mini span:not([data-hd]){color:var(--ink-2) !important}',
      R + '.hd-mini .go{margin-left:auto}',
      /* ── b326: the buff ladder (Upkeep) ────────────────────────────────
         Declared AFTER the generic .hd-mini colour blanket above, at equal
         specificity, so it wins on source order rather than by escalating
         another !important war. Running = moss; paused = the muted ink and
         a pill, never --red: a frozen buff is withheld, not lost, and the
         preserved time beside it IS the reassurance. */
      R + '.hd-buff .hd-buff-mag{color:var(--green) !important;font-weight:800}',
      R + '.hd-buff .hd-buff-time{font-variant-numeric:tabular-nums;color:var(--ink) !important}',
      R + '.hd-buff.is-paused .hd-buff-mag{color:var(--ink-3) !important}',
      R + '.hd-buff.is-paused .hd-buff-time{color:var(--ink-2) !important}',
      R + '.hd-buff .hd-buff-paused{margin-left:auto;font-family:var(--f-label);',
      'font-size:calc(14.5px * var(--ui-scale, 1));letter-spacing:.05em;text-transform:uppercase;',
      'font-weight:700;color:var(--ink-3) !important;border:1px solid var(--line);',
      'border-radius:999px;padding:0 8px;white-space:nowrap}',
      /* When the pill is present it takes the auto margin, so the clock must
         stop claiming it or the two fight over the same slack. */
      R + '.hd-buff .hd-buff-paused + .hd-buff-time{margin-left:10px}',
      R + '.hd-buff-note{color:var(--ink-3) !important;align-items:flex-start;padding-top:2px}',
      R + '.hd-buff-note .mi{margin-top:-4px}',
      R + '.hd-buff-note div:not([data-hd]){color:var(--ink-3) !important;line-height:1.35}',

      /* ── b219 · two-line status row ───────────────────────────────────────
         Used by "The realm" (world events) and the homestead's next tier: a
         name, a consequence, and a right-aligned when. Same hairline-separated
         row language as everything else — no new box types. */
      R + '.hd-duo{display:flex;align-items:flex-start;gap:11px;padding:11px 4px}',
      R + '.hd-duo .mi{flex:0 0 30px;height:30px;display:grid;place-items:center;opacity:.85;margin-top:1px}',
      R + '.hd-duo .bd{flex:1;min-width:0}',
      R + '.hd-duo .t{font-size:calc(15px * var(--ui-scale, 1));font-weight:700;color:var(--ink) !important;line-height:1.2}',
      R + '.hd-duo .s{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3) !important;margin-top:3px;line-height:1.35}',
      R + '.hd-duo .when{flex:0 0 auto;font-family:var(--f-label);font-size:calc(14.5px * var(--ui-scale, 1));letter-spacing:.05em;',
      'text-transform:uppercase;color:var(--ink-3) !important;font-weight:700;padding-top:3px;white-space:nowrap}',
      /* ── b326: the welcome-back honesty band ──────────────────────────────
         Deliberately NOT a card. The dashboard is a rhythm of unframed rows
         under section headings (b217 killed the wall-of-cards); this band earns
         its emphasis from POSITION — it leads the whole grid — and from its own
         note ladder, not from a box. Every colour is a token, so it keeps its
         meaning in either theme and cannot drift to a raw gilt.

         The band is a two-part flex: the TOTALS (what you got) and the NOTES
         (why that is the number). Side by side on desktop, where the width
         exists; stacked below 640px, where it does not. `flex:1 1 <basis>` on
         both halves is what makes that one rule instead of two media queries. */
      R + '.hd-awayband{margin-bottom:20px}',
      R + '.hd-away{display:flex;align-items:flex-start;gap:10px 22px;flex-wrap:wrap;padding:10px 4px 2px}',
      R + '.hd-away-sum{flex:1 1 260px;min-width:0;display:flex;align-items:flex-start;gap:11px}',
      R + '.hd-away .mi{flex:0 0 26px;height:26px;display:grid;place-items:center;opacity:.9;margin-top:1px}',
      R + '.hd-away .bd{min-width:0}',
      /* Wide screens only: adopt the dashboard grid's own column ratio so the
         notes start on exactly the same vertical as the right-hand rail below.
         A lead band whose second column is 110px off the columns it leads reads
         as a mistake, and flex basis alone cannot promise that alignment. */
      '@media(min-width:1000px){' + R + '.hd-away{display:grid;grid-template-columns:1.55fr 1fr;gap:34px}}',
      R + '.hd-away .t{font-size:calc(16px * var(--ui-scale, 1));font-weight:700;',
      'color:var(--ink) !important;line-height:1.25}',
      /* Kills + crits: the PROOF line ("142 kills · 21 crits"). Crits are the
         thing away combat used never to roll, so the count is evidence and
         reads a step brighter than a supporting caption. */
      R + '.hd-away-fight{margin-top:3px;font-size:calc(14.5px * var(--ui-scale, 1));',
      'color:var(--ink-2) !important;font-weight:600;font-variant-numeric:tabular-nums;line-height:1.3}',
      R + '.hd-away-notes{flex:1 1 300px;min-width:0;display:flex;flex-direction:column;gap:4px}',
      R + '.hd-away-note{display:flex;align-items:flex-start;gap:7px;line-height:1.35;',
      'font-size:calc(14.5px * var(--ui-scale, 1))}',
      R + '.hd-away-note .ic{flex:0 0 14px;height:14px;display:grid;place-items:center;margin-top:2px;opacity:.9}',
      /* Three tones, three roles: the RULE is quiet, what it PAID is gilt,
         what it HELD BACK is the muted ink — never red. A paused buff is not
         a penalty; the ruling's whole point is that its time was preserved. */
      R + '.hd-away-note.is-base{color:var(--ink-3) !important}',
      R + '.hd-away-note.is-good{color:var(--gold-2) !important}',
      R + '.hd-away-note.is-held{color:var(--ink-3) !important}',
      /* b341 — a FOURTH tone, and the only one that is allowed to be red: the
         absence ended in a death. The comment above is still right that a held
         buff is not a penalty — this is, and it is the one clause on the card
         a player must not skim past. `--red` is a per-theme token (rust in
         cozy-light, ember in hearthlight), never a hardcoded colour. */
      R + '.hd-away-note.is-bad{color:var(--red) !important;font-weight:600}',
      /* b342 — the declined night's one ACTION, at the foot of the reasons it
         answers. Sized to its own content (align-self) so it never stretches
         to the notes column on a wide screen. Styling is inherited from
         `.hd-cta`; this rule contributes position only, and no colour. */
      R + '.hd-away-cta{align-self:flex-start;margin-top:7px}',
      /* Short landscape phone: the band is the first thing on screen and must
         not eat it. Tighter rhythm only — no size drops, the 14.5px floor
         holds, and nothing is hidden (every clause is load-bearing honesty). */
      '@media (max-height:540px) and (orientation:landscape) and (max-width:1024px){',
      R + '.hd-awayband{margin-bottom:14px}',
      R + '.hd-away{gap:8px 16px;padding:8px 4px 0}',
      R + '.hd-away-notes{gap:3px}',
      '}',
      /* The holding's own line: cost list reads as a shopping list, tabular. */
      R + '.hd-cost{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:5px;font-size:calc(14.5px * var(--ui-scale, 1));',
      'color:var(--ink-3) !important;font-variant-numeric:tabular-nums}',
      R + '.hd-cost i{font-style:normal;color:var(--ink-2) !important;font-weight:600}',
      R + '.hd-cost i.short{color:var(--red) !important}',
      /* An inline link inside a supporting line — gilt, never a raw accent. */
      R + '.hd-link{color:var(--gold-2) !important;font-weight:600;cursor:pointer}',
      R + '.hd-link:hover{color:var(--gold) !important;text-decoration:underline;text-underline-offset:3px}',

      /* ── mobile hardening ─────────────────────────────────────────────────
         Phone-only fixes: real 44px tap targets on the primary CTAs and the
         rename glyph, and the daily ledger relocated (below) instead of hidden.
         Same selector prefix as the base rules (no !important on those props),
         so these later declarations win at equal specificity. */
      '@media (max-width:540px),(max-height:540px) and (max-width:1024px){' +
        /* P2: Claim/Train/Build/Play buttons were 34px — under the 44px touch min. */
        R + '.hd-cta,' + R + '.hd-cta.ghost{min-height:44px;padding:0 18px}' +
        /* P3: rename glyph was an ~18px target beside the name — grow it, keep glyph centred. */
        R + '.hd-rename{min-width:44px;min-height:44px;display:inline-flex;align-items:center;justify-content:center;padding:0;line-height:1}}',
      /* P3: relocated ledger shown wherever the in-band .hd-ledger hides
         (max-width:760px), so no 541–760px gap loses the figures. */
      '@media(max-width:760px){' + R + '.hd-ledger-m{display:flex}}',
      /* Mobile-only ledger row (desktop keeps the in-band .hd-ledger). */
      R + '.hd-ledger-m{display:none;gap:22px;padding:9px 4px 2px;border-bottom:1px solid rgba(236,225,204,.075) !important}',
      R + '.hd-ledger-m .hd-led{text-align:left}',
      R + '.hd-ledger-m .hd-led b{font-family:var(--f-display);font-size:calc(18px * var(--ui-scale, 1));font-weight:600;',
      'color:var(--ink) !important;display:block;line-height:1;font-variant-numeric:tabular-nums}',
      R + '.hd-ledger-m .hd-led span{font-family:var(--f-label);font-size:calc(14.5px * var(--ui-scale, 1));letter-spacing:.05em;',
      'text-transform:uppercase;color:var(--ink-3) !important;font-weight:700;display:block;margin-top:3px}'
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
  /* ══════════════════════════════════════════════════════════════════════
     b326 — THE WELCOME-BACK HONESTY CARD
     (docs/design/away-time-ruling.md §"Player-facing honesty", items 1–3)

     The ruling's point is not decoration: "the silent penalty was the actual
     sin", so the game must now SAY what it paid you. Every clause below is
     read from `G.lastOfflineSummary`'s honesty payload — `blessed`,
     `buffsPaused`, `crits`, `featuredMs`, `featuredDropMult`, `capped`,
     `rateMult` — and NOTHING is inferred. A renderer that infers a bonus will
     eventually quote one nobody paid, which is the failure being fixed.

     Two conditional clauses are deliberately conditional:
       • the Boss-of-the-Day line prints `featuredMs`, NOT the whole absence,
         because the featured boss is resolved per UTC-day segment and an
         8h featured stretch inside a 14h night must not read as 14h;
       • the paused-buff line only appears when a buff was actually HELD
         (`buffsPaused` is false when there were none) — "your buffs were
         paused" beside an empty buff list is a lie in the other direction.
     ══════════════════════════════════════════════════════════════════════ */

  /* "8h 12m" / "47m". Prefers the exact span (`awayMs`, b326); falls back to
     the 0.1h-rounded `hrs` for summaries written by an older build. */
  function fmtAway(off) {
    var ms = (off && typeof off.awayMs === 'number' && isFinite(off.awayMs) && off.awayMs > 0)
      ? off.awayMs : Math.max(0, (off && off.hrs) || 0) * 3600000;
    var mins = Math.max(0, Math.round(ms / 60000));
    if (mins < 60) return mins + 'm';
    var h = Math.floor(mins / 60), m = mins % 60;
    return m ? (h + 'h ' + m + 'm') : (h + 'h');
  }
  /* Short form for the featured-boss stretch — "8h", "45m". Rounded DOWN to
     the hour once past one, so the line never claims a minute it did not pay. */
  function fmtSpanShort(ms) {
    var mins = Math.max(0, Math.floor((Number(ms) || 0) / 60000));
    if (mins < 60) return mins + 'm';
    var h = Math.floor(mins / 60), m = mins % 60;
    return m >= 5 ? (h + 'h ' + m + 'm') : (h + 'h');
  }
  function pctOver(mult) { return Math.round(((Number(mult) || 1) - 1) * 100); }
  /* "6:00" / "1:04:30". A buff's preserved time is read as a clock, and a
     clock is the whole point of clause 3 — it must be legible at a glance and
     identical to the number the engine is holding. */
  function fmtClock(ms) {
    var s = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
    var p2 = function (n) { return (n < 10 ? '0' : '') + n; };
    return h ? (h + ':' + p2(m) + ':' + p2(sec)) : (m + ':' + p2(sec));
  }

  /* b341 — DID THE ABSENCE END IN A DEATH, and when?
     Reads the flat payload first (`died` / `diedAfterMs` / `diedTo`, written by
     processOffline) and falls back to the nested `combat` block, which is the
     shape the server-accrual receipt writes. Returns null when nobody died, so
     every caller is one truthy check. NOTHING here is inferred: no `died` flag
     means no death line, and a missing span means the line simply omits the
     "N in" clause rather than guessing one. */
  function awayDeath(off) {
    var c = (off && off.combat) || {};
    var died = !!(off && (off.died || c.died));
    if (!died) return null;
    var afterMs = Number((off && off.diedAfterMs) || c.survivedMs || 0);
    if (!isFinite(afterMs) || afterMs < 0) afterMs = 0;
    var id = (off && off.diedTo) || c.diedTo || null;
    var M = window.MONSTERS;
    return { afterMs: afterMs, name: (id && M && M[id] && M[id].name) || null };
  }

  /* "31s" / "4m" / "2h 5m". SECONDS BELOW A MINUTE — b341's death line already
     needed this (`fmtSpanShort` floors to whole minutes, so the sixty-second
     death rendered "0m in"), and b345's supply stop needs exactly the same
     thing for exactly the same reason: the case it exists for is 30.7 seconds
     of an eight-hour night. One helper, both lines, so the two can never
     describe the same length of time differently. */
  function fmtSince(ms) {
    var n = Math.max(0, Number(ms) || 0);
    if (n < 60000) return Math.max(1, Math.round(n / 1000)) + 's';
    return fmtSpanShort(n);
  }

  /* ── b345 — DID THE RUN END BEFORE THE ABSENCE DID, AND WHAT ENDED IT? ──
     `lastOfflineSummary` had 21 fields and not one could express "the supplies
     ran out", so a cooking session that burned through eight shrimp in 30.7
     seconds rendered here as "8h away — +11 items · +80 XP · at the base rate".
     Every clause below reads a field processOffline STATED (`stoppedBy`,
     `stoppedById`, `stoppedSkill`, `paidMs`, `stoppedPerHour`); nothing is
     inferred, and in particular "paidMs < awayMs" is NOT the test — flooring a
     tick count makes that true on a perfectly ordinary night.

     Death returns null on purpose: it is a stop too, and it reports through
     the same seam, but it already owns richer copy above (who killed you).
     One reason, one line. A future reason — a full bank, a despawn — is a new
     row in COPY below and nothing else. */
  var STOP_COPY = {
    supplies: function (s) {
      return s.skill + ' ran out of ' + s.what + ' ' + fmtSince(s.paidMs) + ' in'
        + (s.restMs >= 60000
            ? ' — the remaining ' + fmtSpanShort(s.restMs) + ' paid nothing.'
            : ' — nothing was earned after that.');
    },
  };
  function awayStop(off) {
    var by = off && off.stoppedBy;
    if (!by || by === 'death' || !STOP_COPY[by]) return null;
    var awayMs = (typeof off.awayMs === 'number' && isFinite(off.awayMs) && off.awayMs > 0)
      ? off.awayMs : Math.max(0, off.hrs || 0) * 3600000;
    var paidMs = Math.max(0, Number(off.paidMs) || 0);
    var id = off.stoppedById || null;
    var sk = off.stoppedSkill || null;
    return {
      by: by,
      paidMs: paidMs,
      restMs: Math.max(0, awayMs - paidMs),
      what: (id && window.ITEMS && window.ITEMS[id] && window.ITEMS[id].n) || 'materials',
      skill: (sk && window.SKILLS_DEF && window.SKILLS_DEF[sk] && window.SKILLS_DEF[sk].name) || 'Your run',
      perHour: Math.max(0, Number(off.stoppedPerHour) || 0),
    };
  }


  function awayCardHtml(off) {
    var bits = [];
    if (off.gainedXp) bits.push('+' + num(off.gainedXp) + ' XP');
    if (off.gainedItems) bits.push('+' + num(off.gainedItems) + ' items');
    if (off.gainedGold) bits.push('+' + num(off.gainedGold) + ' gold');
    if (off.burnt) bits.push(num(off.burnt) + ' burnt on the fire');

    /* Ruling item 2 — away combat reports its crits. Crit is GEAR: it applies
       away, and the count is the proof. Kills and crits ride together on
       their own line because they are one fact about one night's fighting. */
    var combatBits = [];
    if (off.gainedKills) combatBits.push(num(off.gainedKills) + ' kills');
    if (off.crits) combatBits.push(num(off.crits) + ' crits');

    /* The notes, in the order a returning player needs them: what the rule is,
       then what it paid on top, then what it held back, then the ceiling. */
    var notes = [];
    /* THE DEATH LINE COMES FIRST, because it changes the meaning of every
       number above it. Without it the card reads "8h away — +53 XP · +5 gold ·
       at the base rate", which a player correctly understands as "eight hours
       of honest pay" — when the truth was sixty seconds of fighting and then
       nothing. Three clauses, each only printed when its fact is known:
         • that you died, and to what (omitted when the id is unknown);
         • how far into the absence (omitted when the span is unknown);
         • that the remainder paid nothing (omitted when there is no remainder,
           i.e. the death landed in the last minute of the window).
       See docs/design/away-time-ruling.md §"Player-facing honesty". */
    var death = awayDeath(off);
    if (death) {
      var awayMs = (typeof off.awayMs === 'number' && isFinite(off.awayMs) && off.awayMs > 0)
        ? off.awayMs : Math.max(0, off.hrs || 0) * 3600000;
      var restMs = death.afterMs > 0 ? Math.max(0, awayMs - death.afterMs) : 0;
      var t = 'You died' + (death.name ? ' to ' + death.name : '');
      /* SECONDS, below a minute. This is not a nicety: the case that started
         b341 is a new character on the game's own Recommended foe dying about
         sixty seconds into an eight-hour night, and `fmtSpanShort` floors to
         whole minutes — so the most important number on the card would have
         rendered "0m in", which reads as a bug and tells the player nothing. */
      if (death.afterMs > 0) {
        t += ' ' + (death.afterMs < 60000
          ? Math.max(1, Math.round(death.afterMs / 1000)) + 's'
          : fmtSpanShort(death.afterMs)) + ' in';
      }
      /* One minute of slack: a death 30s from the end is "the whole absence",
         not "and then 42 seconds paid nothing". */
      t += (restMs >= 60000)
        ? ' — the remaining ' + fmtSpanShort(restMs) + ' paid nothing.'
        : ' — nothing was earned after that.';
      notes.push({ tone: 'bad', icon: 'uiSkull', text: t });
    }
    /* ── b345: THE RUN THAT STOPPED, on the same durable surface and for the
       same reason the death line is here — it changes the meaning of every
       number above it. "8h away — +11 items · +80 XP" over a cook that ended
       30.7 seconds in is the death card's exact failure with a different
       cause. Second clause is the answer to the first: how much of the
       missing material a night of this run actually eats, so "stock up" is a
       number instead of an instruction nobody can size. */
    var stop = awayStop(off);
    if (stop) {
      notes.push({ tone: 'bad', icon: 'uiHourglass', text: STOP_COPY[stop.by](stop) });
      if (stop.perHour > 0) {
        notes.push({ tone: 'held', icon: 'uiInfo',
          text: 'Away, this run uses about ' + num(stop.perHour) + ' ' + stop.what
            + ' an hour — stock up before you log off.' });
      }
    }
    /* ── AN EMPTY NIGHT (b342, generalised in b343) ────────────────────────
       b342 detected this from the away-combat gate's `licence.declined` flag.
       The gate is gone, so the card asks the only question that was ever
       load-bearing and asks it of the RESULT rather than of a rule: did this
       absence pay the player anything at all?

       That is strictly better than the flag it replaces. A night can now come
       back empty for reasons the flag never covered — you fell on the first
       tick, an artisan session ran out of inputs immediately — and every one
       of them used to render as a bare span with "at the base rate" under it,
       which reads as eight hours of honest pay for nothing. */
    var quiet = !bits.length && !combatBits.length;
    if (quiet && !death) {
      notes.push({ tone: 'held', icon: 'uiSprout',
        text: 'Nothing was running that pays while you are away. Gathering, cooking and '
          + 'smithing bank the whole time you are gone — set one going before you close the tab.' });
    }
    /* "At the base rate" on a night that paid nothing is noise standing where
       an explanation should be. Every other case keeps it. */
    if (!quiet) {
      notes.push({ tone: 'base', icon: 'uiInfo',
        text: 'At the base rate — blessings and food buffs pay while you play.' });
    }
    /* b343: A MINUTE, not a millisecond. `fmtSpanShort` floors to whole
       minutes, so `featuredMs > 0` printed "0m on the Boss of the Day (+100%
       drops)" — a bonus line boasting about nothing — on exactly the night
       this card exists to explain. MEASURED on a fresh character who died 2.4s
       into an eight-hour absence, which was unreachable while away combat was
       gated (the span was never simulated) and is now the FIRST card a new
       player sees. Same one-minute slack the death line above uses. */
    if (off.featuredMs >= 60000) {
      /* The multiplier is PRINTED ONLY IF THE PAYLOAD CARRIES IT. A summary
         written before b326 has no `featuredDropMult`, and defaulting to the
         daily x1.5 would state a number nobody verified — on a weekly boss it
         would understate the night by half. No field, no percentage. */
      var lift = (typeof off.featuredDropMult === 'number') ? pctOver(off.featuredDropMult) : 0;
      notes.push({ tone: 'good', icon: 'uiSkull',
        text: fmtSpanShort(off.featuredMs) + ' on the Boss of the Day' +
          (lift > 0 ? ' (+' + lift + '% drops)' : '') });
    }
    if (off.buffsPaused) {
      notes.push({ tone: 'held', icon: 'uiHourglass',
        text: 'Food buffs paused — their time was kept, not spent.' });
    }
    /* ── b361: WHAT THE MARKET DID WHILE YOU WERE OUT ──────────────────────
       A listing selling is the one economic event that happens TO the player
       rather than because of them, and since market-v2 it happened in total
       silence: gold appeared and nothing said why. Keyed by the RECEIPT's own
       window (`windowFrom`/`windowTo`, stated by the server), read from rows
       the player can already SELECT for themselves — no new save field, no new
       server state, and no line at all when nothing sold or the ledger has not
       been read. Purchases are excluded on purpose: those were the player's
       own actions and are not news on a welcome-back card. */
    try {
      var MH = window.HearthriseMarketHistory;
      var saleLine = MH && MH.salesLineFor(off);
      if (saleLine) {
        notes.push({ tone: 'good', icon: 'gold',
          text: 'Your market stall: ' + saleLine + '.' });
      }
    } catch (e) { /* the ledger is never load-bearing for this card */ }
    /* b345 — THE CEILING ONLY COST YOU SOMETHING IF YOU WERE STILL EARNING
       WHEN IT CLOSED. Measured on the card this fix was written for:
       "Cooking ran out of Raw Shrimp 30s in — the remaining 11h 59m paid
       nothing." sat directly above "Capped at your 12h away max — upgrades
       raise this.", which invites the player to buy an upgrade that would
       have bought them nothing. A true sentence in a place where it reads as
       a cause is the same species of lie this whole card exists to end, and
       the ruling already covers it — away-combat-licence.md §3.3.1: a night
       that paid nothing must not read as though it cost the allowance.
       Keyed on the STATED stop (which covers death too, for the same
       reason), never on the numbers. */
    if (off.capped && !off.stoppedBy) {
      notes.push({ tone: 'held', icon: 'uiClock',
        text: 'Capped at your ' + (off.budgetHrs || 12) + 'h away max — upgrades raise this.' });
    }

    var noteHtml = notes.map(function (n) {
      return '<div class="hd-away-note is-' + n.tone + '">' +
        '<span class="ic">' + gly(n.icon, 13, '', 'currentColor') + '</span>' +
        '<span>' + esc(n.text) + '</span></div>';
    }).join('');

    /* THE CTA — the only part of the card that is an ACTION rather than a
       report, and the game's own answer to "then what do I do tonight?".
       Shown only when the night paid nothing at all: a player whose absence
       banked something does not need to be told to go do something else. It
       reuses the dashboard's own `.hd-cta` (tokens only, no new colour) and
       routes through the same delegated `data-hd` handler every other Home
       button uses. */
    var ctaHtml = quiet
      ? '<button class="hd-cta hd-away-cta" data-hd="trainskill">Train a skill</button>'
      : '';

    return '<div class="hd-awayband"><div class="hd-h"><h3>While you were away</h3></div>' +
      '<div class="hd-away">' +
        '<div class="hd-away-sum">' +
          '<div class="mi">' + gly('uiIdle', 22, '', 'var(--gold-2)') + '</div>' +
          '<div class="bd">' +
            '<div class="t">' + esc(fmtAway(off)) + ' away' +
              (bits.length ? ' — ' + esc(bits.join(' · '))
                : (quiet ? ' — your camp was quiet.' : '')) + '</div>' +
            (combatBits.length ? '<div class="hd-away-fight">' + esc(combatBits.join(' · ')) + '</div>' : '') +
          '</div>' +
        '</div>' +
        '<div class="hd-away-notes">' + noteHtml + ctaHtml + '</div>' +
      '</div></div>';
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
  /* Returns NULL for a balance the client has not been told, rather than 0.
     "0/400 Gold" is a claim about the player's purse; the caller renders the
     pending dash instead, because a cost line that says you have nothing is
     the single most alarming way to spell "still loading". */
  function itemHeld(G, id) {
    if (id === 'gold' || id === 'gems') {
      return (typeof window.balNum === 'function') ? window.balNum(id)
        : (typeof G[id] === 'number' ? G[id] : null);
    }
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

    /* b341: this read `today.xp`, falling back to `today.totalXp`. getTodayDelta()
       returns NEITHER — the field is `xpGained` (profile-launchpad.js) — so the
       tile printed a hardcoded 0 for every player forever, while the Kills tile
       beside it read `today.kills`, which does exist. The visible symptom was the
       ledger contradicting itself: "0 XP TODAY" sitting directly above a
       welcome-back card reading "+15,000 XP". Away XP was never the problem; it
       lands in G.skills and getTodayDelta counts it correctly. */
    var xp = today && (today.xpGained != null ? today.xpGained
      : (today.xp != null ? today.xp : today.totalXp));
    var kills = today && (today.kills != null ? today.kills : (G.stats && G.stats.kills));
    var harvest = today && (today.harvested != null ? today.harvested : today.gathered);

    var scene = '';
    try { scene = window.HearthriseBackdrop && window.HearthriseBackdrop.homesteadScene(hsTier) || ''; } catch (e) {}

    html += '<div class="hd-hearth">' + scene + '<div class="hd-hearth-in">';
    html += '<div class="hd-who"><div class="hd-ava">' +
      /* b371 (F22): data-hr-avatar makes this one of the surfaces the identity
         seam repaints. This banner is built as an innerHTML string and only
         rebuilds on the Home panel's own schedule, so before the registry it
         held the PREVIOUS portrait until the next boot — the measured half of
         "one reload behind". */
      '<img src="' + esc(window._playerAvatar || 'assets/avatars/placeholder-portrait.webp') + '" alt="" data-hr-avatar style="width:100%;height:100%;object-fit:cover;display:block"></div><div style="min-width:0">';
    html += '<div class="hd-eyebrow">' + esc((hsDef && hsDef.name) || "Wanderer's Camp") + '</div>';
    html += '<div class="hd-name">' + esc(playerName()) +
      '<button class="hd-rename" title="Rename" data-hd="rename">' + gly('uiEdit', 14, '', 'var(--ink-3)') + '</button></div>';
    html += '<div class="hd-sub">' + rankLine +
      (rankLine ? '<span class="sep">·</span>' : '') +
      /* b224: see legacy.js updateNetStatus — with accounts required, the
         un-synced state is a connection problem, not an offer. */
      /* b371: the save claim is derived from the last CONFIRMED game_saves
         upsert (legacy.js cloudSaveLine → sync.js write channel), not from
         being signed in. See the note at cloudSaveLine. */
      (isOnline()
        ? ('Online · ' + esc((window.cloudSaveLine ? window.cloudSaveLine() : { text: 'Cloud save connecting…' }).text))
        : 'Offline · progress saved on this device') + '</div>';
    html += '</div></div>';
    html += '<div class="hd-ledger">' +
      '<div class="hd-led"><b>' + (xp != null ? num(xp) : '0') + '</b><span>XP today</span></div>' +
      '<div class="hd-led"><b>' + (kills != null ? num(kills) : '0') + '</b><span>Kills</span></div>' +
      '<div class="hd-led"><b>' + (harvest != null ? num(harvest) : '0') + '</b><span>Harvest</span></div>' +
      '</div>';
    html += '</div></div>';
    // Mobile-only copy of the daily ledger (in-band .hd-ledger is hidden on
    // phones by the media query above); keeps XP/Kills/Harvest visible.
    html += '<div class="hd-ledger-m">' +
      '<div class="hd-led"><b>' + (xp != null ? num(xp) : '0') + '</b><span>XP today</span></div>' +
      '<div class="hd-led"><b>' + (kills != null ? num(kills) : '0') + '</b><span>Kills</span></div>' +
      '<div class="hd-led"><b>' + (harvest != null ? num(harvest) : '0') + '</b><span>Harvest</span></div>' +
      '</div>';

    // ── grid ──
    html += '<div class="hd-wrap">';

    /* b326 — "While you were away" LEADS THE DASHBOARD, full width, above the
       two columns (docs/design/away-time-ruling.md §"Player-facing honesty").

       It used to sit in the right-hand rail, fifth item down, and the rail is
       the SECOND column — so on the 852x339 landscape phone the grid collapses
       to one column and the one thing a returning player opens the game to read
       was three screens down, after Next up and Your holding. A welcome-back
       summary below the fold is not a welcome-back summary.

       Full width also earns its keep on desktop: the ledger of notes lays out
       beside the totals instead of wrapping in a 300px rail. It is time-boxed
       to 30 minutes off `summary.at`, so it leads only while it is news and
       then vanishes — the rest of the session's composition is unchanged. */
    var _off = G.lastOfflineSummary;
    /* The `>= 0.1h` liveness gate keeps a tab-flip off the dashboard. b343:
       a DEATH is admitted on its own terms regardless of the claimed hours —
       the absence that most needs explaining is the one that ended sixty
       seconds in, and a receipt whose paid span rounds to nothing is exactly
       that receipt. FRESHNESS is unchanged: 30 minutes off `summary.at`. */
    var _bad = !!(_off && (_off.died || (_off.combat && _off.combat.died)));
    /* b361: the LIVENESS gate is now the SAME classifier the toast reads
       (`HearthriseAccrual.receiptNotice`), so a live settle cannot be narrated
       as an absence on one surface and a sync on the other — the exact
       two-surfaces-one-absence failure b342 was built to end. It is a strictly
       tighter gate than the `>= 0.1h` it replaces (6 min → 10 min) and keeps
       b343's ruling verbatim: a DEATH is admitted on its own terms regardless
       of the claimed span, because the absence that most needs explaining is
       the one that ended sixty seconds in. `>= 0.1h` survives as the fallback
       for a build where the accrual module never published.
       FRESHNESS is unchanged: 30 minutes off `summary.at`. */
    var _A = window.HearthriseAccrual;
    var _away = _off && (_A && typeof _A.classifyReceipt === 'function'
      ? _A.classifyReceipt(_off) === 'away'
      : ((_off.hrs || 0) >= 0.1 || _bad));
    if (_off && _off.at && (Date.now() - _off.at) < 30 * 60000 && _away) {
      html += awayCardHtml(_off);
    }

    html += '<div class="hd-grid"><div class="hd-col">';

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
            // UNKNOWN reads as pending, not as a shortfall — and it is NOT
            // marked `short`, because we do not know that it is.
            if (have === null) {
              return '<span><i class="bal-pending" role="status" title="Waiting for the server">—</i>/'
                + num(need) + ' ' + esc(itemName(k)) + '</span>';
            }
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


    // Your heroes — the REAL multi-character selector (b229). The fake 3-slot
    // paywall MOCKUP that used to sit on the Character screen is CUT; this
    // account-gated block is the primary switch surface now, and it shares
    // HearthriseProfile.slotRows() / selectSlot() with the topbar drawer so the
    // two can never drift. Account gate: HearthriseProfile.profile is null until
    // the account wall opens, so signed-out we render nothing at all.
    var HP = window.HearthriseProfile;
    if (HP && HP.profile && typeof HP.slotRows === 'function') {
      try {
        var heroRows = HP.slotRows();
        if (heroRows.length) {
          var heroesHtml = heroRows.map(function (r) {
            if (r.kind === 'char') {
              return '<div class="hd-card hd-duo">' +
                '<div class="mi">' + gly('uiShield', 20, '', r.active ? 'var(--gold-2)' : 'var(--ink-2)') + '</div>' +
                '<div class="bd"><div class="t">' + esc(r.name) +
                  (r.active ? ' <span class="hd-rn-claimdot">active</span>' : '') + '</div>' +
                  '<div class="s">Combat ' + (r.combatLv || 1) + ' · Total ' + (r.totalLv || 1) +
                    (r.active ? '' : ' · ' + (HP.timeSince ? HP.timeSince(r.lastSeen) : '')) + '</div></div>' +
                (r.active
                  ? '<div class="when">now</div>'
                  : '<button class="hd-cta ghost" data-hero="' + r.id + '">Play</button>') +
              '</div>';
            }
            return '<div class="hd-card hd-duo">' +
              '<div class="mi">' + gly('uiLock', 20, '', 'var(--ink-3)') + '</div>' +
              '<div class="bd"><div class="t">Hero slot ' + (r.slotId + 1) + '</div>' +
                '<div class="s">' + (r.free ? 'Included with Hearth Hall' : (r.cost + ' gems')) + '</div></div>' +
              (r.canBuy
                ? '<button class="hd-cta ghost" data-herobuy="' + r.slotId + '">' + (r.free ? 'Unlock' : 'Buy') + '</button>'
                : '<div class="when">locked</div>') +
            '</div>';
          }).join('');
          html += '<div><div class="hd-h"><h3>Your heroes</h3></div><div class="hd-rows">' + heroesHtml + '</div></div>';
        }
      } catch (e) { /* multi-character optional */ }
    }

    // Right now / jump back in — first, because "what am I doing" is the
    // question an idle game has to answer on sight.
    html += '<div><div class="hd-h"><h3>Right now</h3></div>';
    if (activeName) {
      html += '<div class="hd-card hd-mini"><div class="mi">' +
        (G.activeMonster ? gly('navCombat', 20, '', 'var(--red)') : gly(G.activeSkill || 'smithing', 20, '', 'var(--green)')) + '</div>' +
        '<div><b>' + esc(activeName) + '</b><div style="font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3)">' + (G.activeMonster ? 'In combat' : 'Training') + '</div></div>' +
        '<button class="hd-cta ghost go" data-hd="active">Open</button></div>';
    } else if (resume) {
      html += '<div class="hd-card hd-mini"><div class="mi">' + gly(resume.skill || resume.id, 20, '', 'var(--ink-2)') + '</div>' +
        '<div><b>' + esc(resume.label) + '</b><div style="font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3)">Idle — nothing running</div></div>' +
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
              ? 'Blessings remain active while you are online.'
              : 'Reconnecting — blessings resume when you are back online.') + '</div>' +
          '</div>' +
          '</div></div>';
      } catch (e) { /* world events optional */ }
    }

    // Upkeep — buffs + collection progress. Two one-line facts, not two cards.
    /* b326 — THE BUFF LADDER, and why it had to be built here.
       The row used to read "Food buff active." — no name, no magnitude, no
       clock. That was the ONLY visible buff surface in the game: the legacy
       Active Effects card, which is where `__renderBuffsSection` draws, is
       `display:none` on Home (this component's own b213 reset hides every
       legacy `> .card` in the panel). So the ruling's honesty clause 3 —
       "a paused buff renders as paused with its time preserved" — had nowhere
       to render at all. It renders here. Each buff states its effect, its
       PRESERVED time, and whether that clock is running. */
    var _buffs = (Array.isArray(G.buffs) ? G.buffs : []).filter(function (b) { return b && b.remainingMs > 0; });
    var _bfrozen = (typeof window.buffsFrozen === 'function') ? window.buffsFrozen() : false;
    html += '<div><div class="hd-h"><h3>Upkeep</h3></div><div class="hd-rows">';
    if (!_buffs.length) {
      html += '<div class="hd-card hd-mini"><div class="mi">' + gly('cooking', 20, '', 'var(--ink-2)') + '</div>' +
        '<div>No food buff. <span class="hd-link" data-hd="cook">Cook something →</span></div></div>';
    } else {
      var BD = window.BUFFS_DEF || {};
      html += _buffs.map(function (b) {
        var def = BD[b.type] || { label: b.type, isPercent: true };
        var mag = (def.isPercent ? '+' + b.magnitude + '%' : '+' + b.magnitude);
        return '<div class="hd-card hd-mini hd-buff' + (_bfrozen ? ' is-paused' : '') + '">' +
          '<div class="mi">' + gly((window.BUFF_GLYPH || {})[b.type] || 'uiPotion', 20, '',
            _bfrozen ? 'var(--ink-3)' : 'var(--green)') + '</div>' +
          '<div>' + esc(def.label) + ' <b class="hd-buff-mag">' + esc(mag) + '</b></div>' +
          (_bfrozen ? '<span class="hd-buff-paused">paused</span>' : '') +
          '<b class="go hd-buff-time">' + esc(fmtClock(b.remainingMs)) + '</b>' +
        '</div>';
      }).join('');
      if (_bfrozen) {
        /* The rule, stated once under the ladder rather than on every row.
           This is the clause the ruling exists for: a frozen buff is not
           being spent, so the number above is a promise, not a countdown. */
        html += '<div class="hd-card hd-mini hd-buff-note"><div class="mi">' +
          gly('uiHourglass', 20, '', 'var(--ink-3)') + '</div>' +
          '<div>Time kept, not spent — buff clocks only run while an activity ' +
          'is running, and freeze entirely while you are away.</div></div>';
      }
    }
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
    // Your heroes — switch / buy, both routed through the SHARED helpers so Home
    // and the drawer act identically (switchSlot → reload is preserved inside
    // selectSlot). Separate from the [data-hd] table below because these carry a
    // slot id, not a fixed kind string.
    root.querySelectorAll('[data-hero]').forEach(function (el) {
      el.onclick = function (e) {
        e.preventDefault();
        var id = parseInt(el.getAttribute('data-hero'), 10);
        var HP = window.HearthriseProfile;
        // b371: selectSlot is a Promise now (the native confirm() that froze the
        // tab is gone). Consume it, and never let a rejection go unhandled.
        if (HP && typeof HP.selectSlot === 'function') {
          Promise.resolve(HP.selectSlot(id)).catch(function () {});
        }
      };
    });
    root.querySelectorAll('[data-herobuy]').forEach(function (el) {
      el.onclick = function (e) {
        e.preventDefault();
        var id = parseInt(el.getAttribute('data-herobuy'), 10);
        var HP = window.HearthriseProfile;
        // b371: buySlot = confirm-then-unlock, SHARED with the topbar drawer, so
        // a premium-currency spend can never be one click on either surface.
        if (!HP || typeof HP.buySlot !== 'function') return;
        HP.buySlot(id).then(function (r) {
          if (r && r.ok) render();
          else if (r && !r.cancelled && typeof window.notify === 'function') window.notify(r.reason, 'kill');
        }).catch(function () {});
      };
    });
    root.querySelectorAll('[data-hd]').forEach(function (el) {
      var kind = el.getAttribute('data-hd');
      el.onclick = function (e) {
        e.preventDefault();
        try {
          if (kind === 'rename') {
            // b373: in-game modal, never prompt(). See
            // HearthriseLaunchpad.openRename — a native dialog blocks the
            // renderer, and this path also has to go through the server-side
            // display-name claim so the realm's name rules actually apply.
            var lp = LP();
            if (lp && lp.openRename) lp.openRename();
          } else if (kind === 'collection') { if (window.HearthriseCollection) window.HearthriseCollection.open(); }
          else if (kind === 'daily') { if (window.HearthriseDaily) window.HearthriseDaily.open(); }
          else if (kind === 'renown') { if (window.HearthriseRenown) window.HearthriseRenown.openLadder(); }
          else if (kind === 'mile' && mile && mile.deepLink) { mile.deepLink(); }
          else if (kind === 'allquests') { openQuests(); }
          else if (kind === 'q') { var i = +el.getAttribute('data-i'); var t = tasks[i]; if (t) questRoute(t).go(); }
          else if (kind === 'active') { nav('profile'); if (window.G.activeMonster) nav('combat'); else nav('skills'); }
          else if (kind === 'resume' && resume && resume.action) { resume.action(); }
          else if (kind === 'cook') { nav('skills'); openSkill('cooking'); }
          /* b342 — the away card's Case A action (§4.4). Skills are the
             activity that DOES pay a whole night from the first session, so
             the button that answers "combat paid nothing" lands on the screen
             where the alternative is chosen. */
          else if (kind === 'trainskill') { nav('skills'); }
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

  /* b341: `__awayCardHtml` is a TEST SEAM. The welcome-back card's whole job is
     telling the truth about what a night paid, and until b341 nothing in the
     suite could read a single sentence of it — which is how "you died sixty
     seconds in" stayed unsaid for a whole build. A renderer that no test can
     quote is a renderer that will lie again. It takes a summary and returns
     HTML; it touches nothing. */
  window.HearthriseHome = { render: render, __awayCardHtml: awayCardHtml };
  console.log('[home-dashboard] loaded');
})();
