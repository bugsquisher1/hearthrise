// ============================================================
// src/features/raids.js  (b209 · hardened Wave 1b · THE HUNT, Wave 3b b223)
//
// docs/design/clan-boss-events.md — "Clan Boss Events: The Tiered Hunt"
// (backlog #16), as amended by the Clan Seat v2 reconciliation (§3.3, §5.4,
// §9, §10, §11).
//
// ── WHAT CHANGED IN b223, AND WHY ────────────────────────────
// The weekly raid shipped in b209 with a FLAT 250,000 HP pool for every clan.
// The designer's arithmetic (§2.2-2.3) condemned it: a 10-member mid-level
// clan at realistic attendance produces ~145,000 — 58% of the pool. It has
// never been downed in production and no chest has ever been claimed. One
// number cannot serve a 3-person clan and a 60-person clan.
//
// So the raid becomes THE HUNT: a tiered ladder the clan DECLARES, with a pool
// that scales to the roster at declaration:
//
//     pool_hp = TIER_BASE + TIER_PER_MEMBER × members_at_declaration
//
// That one formula does three jobs (§3.2): it matches difficulty to clan size
// without a difficulty slider; it makes alt-stuffing self-defeating (every alt
// raises your own boss's HP); and it makes freeloaders a visible cost, which is
// what ties the Hunt to the castle's promote/kick tools instead of leaving them
// two features that happen to share a table.
//
// This is deliberately ONE clan combat loop, not two. The source design doc's
// live "Siege" is absorbed into it (§10): there is no shared real-time combat
// instance in Hearthrise — simulateStrike runs 120 offline ticks for ONE
// player — so four synchronous defender roles would be UI over a simulation,
// i.e. a fake, and the Final Directive forbids fakes.
//
// ── WHERE THE RULES LIVE ─────────────────────────────────────
// The SERVER owns the Hunt economy. Everything in this file is a MIRROR for
// UX — a fast local "no" so the player isn't waiting on a round trip to be
// told they already struck today. The server alone decides:
//   • which tier is declared, by whom, and the pool it fixes
//   • one strike per UTC day                (raid_strike day gate)
//   • which UTC day/week it is              (hr_utc_day_key / hr_utc_week_key)
//   • the damage clamp                      (max(5000, pool × 10%))
//   • the contribution band and the chest   (raid_claim, median over ≥3-strike
//     contributors — the client may PREVIEW it, never bank it)
//   • the clan Standing a kill pays, ONCE   (clan_raids.standing_paid)
// See supabase/migrations/2026-08-08-hunt.sql, which builds on
// 2026-08-08-raid-hardening.sql and keeps every one of its rules intact.
//
// This file works against THREE server generations, because the client always
// ships before the migration is run:
//   1. pre-hardening  — raid_strike with no day gate, no raid_claim RPC
//   2. hardened       — day gate + raid_claim, flat 250,000 pool, no tiers
//   3. Hunt           — clan_hunt_declare, tiered pools, banded chests
// Every new RPC is FEATURE-DETECTED (404 / PGRST202 / 42883 / 42P01 →
// 'unsupported'), and generation 2's response shape still reads as a normal
// strike. Nothing here breaks when the migration has not been applied.
//
// Bosses are ORIGINAL (no OSRS IP), rotating weekly WITHIN their tier band.
// ============================================================
(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════════
     1. THE BOSSES (§3.4)

     The three b209 bosses are kept VERBATIM — ids, defence, weakness and
     reward — because they are good and they are already original IP. Three
     new ones extend the ladder upward.

     `tiers` is the band a boss may be drawn for; each Hunt tier rotates
     weekly within its own set, by FNV1a('hr-hunt-' + tier + '-' + weekKey).

     `sig` is the boss's SIGNATURE MATERIAL. Per §3.4 these are the top of the
     crafting ladder, not vendor trash: every one of the six ships in this same
     commit with a recipe that consumes it (src/data/recipes.js — the six
     Hunt-forged pieces). A boss material with no use teaches the player that
     boss loot is meaningless, which is worse than no drop at all.

     `glyph` is a typographic mark, never an emoji. Six painted portraits are
     an open Art hand-off (§6).
     ══════════════════════════════════════════════════════════════ */
  var BOSSES = [
    { id: 'emberclad_tyrant', name: 'The Emberclad Tyrant', glyph: '☲',
      desc: 'A furnace given a crown. Its slag-armor weeps molten iron.',
      def: 55, weak: 'hammer', tiers: [1, 2], sig: 'slagheart_core',
      reward: { gold: 12000, gems: 25, items: { mithril_bar: 6, hell_ember: 2 } } },
    { id: 'hollow_regent', name: 'The Hollow Regent', glyph: '♔',
      desc: 'A king who outlived his own bones. The crown remembers.',
      def: 48, weak: 'magic', tiers: [1, 2], sig: 'hollow_sigil',
      reward: { gold: 10000, gems: 25, items: { ancient_rune: 4, grave_dust: 8 } } },
    { id: 'maw_below', name: 'The Maw Below', glyph: '◎',
      desc: 'The lake was never empty. It was waiting.',
      def: 62, weak: 'ranged', tiers: [2, 3], sig: 'abyssal_pearl',
      reward: { gold: 14000, gems: 30, items: { dragon_scale: 3, silk_thread: 10 } } },
    { id: 'sunken_choir', name: 'The Sunken Choir', glyph: '☵',
      desc: 'Nine drowned cantors beneath the ice, holding one note. It has not changed in six hundred years.',
      def: 70, weak: 'magic', tiers: [3, 4], sig: 'choirbone',
      reward: { gold: 28000, gems: 30, items: { void_chitin: 3, ancient_rune: 8, shadow_thread: 4 } } },
    { id: 'warden_long_dark', name: 'Warden of the Long Dark', glyph: '◈',
      desc: 'It was set to guard a door. The door is gone. It still guards.',
      def: 78, weak: 'hammer', tiers: [4, 5], sig: 'warden_seal',
      reward: { gold: 50000, gems: 45, items: { death_steel: 5, void_chitin: 4, ruby: 3 } } },
    { id: 'crownless_wyrm', name: 'The Crownless Wyrm', glyph: '❖',
      desc: 'It ate the king who named it, and took nothing else.',
      def: 88, weak: 'ranged', tiers: [5], sig: 'wyrm_gilding',
      reward: { gold: 90000, gems: 60, items: { dragon_scale: 8, dragon_bones: 10, hell_ember: 6 } } }
  ];

  /* Asset pass (b224+): six painted portraits promoted from _archive/reserve-art
     (same CraftPix house style as the shipped painted/monsters set), matched to
     each boss's flavour — furnace demon, crowned skull, a literal gaping maw,
     an ice-pale undead, a stone guardian, a dragon skull. `bossPortraitHtml`
     is the only render seam: it degrades to nothing (never a broken-image icon)
     if a file is ever missing, leaving the typographic `glyph` in the title as
     the fallback identity mark. */
  var BOSS_PORTRAIT = {
    emberclad_tyrant: 'assets/icons-bundle/painted/monsters/emberclad_tyrant.png',
    hollow_regent:    'assets/icons-bundle/painted/monsters/hollow_regent.png',
    maw_below:        'assets/icons-bundle/painted/monsters/maw_below.png',
    sunken_choir:     'assets/icons-bundle/painted/monsters/sunken_choir.png',
    warden_long_dark: 'assets/icons-bundle/painted/monsters/warden_long_dark.png',
    crownless_wyrm:   'assets/icons-bundle/painted/monsters/crownless_wyrm.png'
  };
  function bossPortraitHtml(boss) {
    var path = boss && BOSS_PORTRAIT[boss.id];
    if (!path) return '';
    return '<img src="' + path + '" alt="" loading="lazy" draggable="false" ' +
      'style="width:40px;height:40px;border-radius:50%;object-fit:cover;flex-shrink:0;' +
      'border:2px solid var(--gold-2);box-shadow:0 0 6px rgba(0,0,0,.45)" ' +
      'onerror="this.remove()" />';
  }

  /* ══════════════════════════════════════════════════════════════
     2. THE TIER LADDER (§3.3, §5.4, §10.4)

     base / perMember are the Designer's numbers, tuned against the measured
     strike table in §2.2 for a kill when ~70% of the roster strikes ~5 of 7
     days. `castleReq` / `warRoomReq` are the two gates:

         max_hunt_tier = min( castle_tier , 1 + floor(war_room_level / 3) )

     Clan `level` is NOT a gate and cannot be — clan_contribute's ×4 ladder
     puts level 10 at 655,360,000 gold, which would freeze the Hunt at Tier I
     forever (clan-overhaul v2 §2.3, CONFLICTS #1).

     `standing` is the clan Standing a kill pays into the castle. It is FLAT
     PER KILL, not per claimer (§10.4) — it is the hold's achievement, not a
     payout. A 40-member clan paying itself 40× the Standing for one kill would
     make the Hunt the whole castle economy. The server guards it with
     clan_raids.standing_paid; this table is only the number.

     `sig` is the signature-drop chance ON KILL. `sigChampionOnly` is the Tier
     II rule from §5.4 ("15%, Champion only").
     ══════════════════════════════════════════════════════════════ */
  var HUNT_TIERS = [
    { tier: 1, name: 'Warband Hunt',  castleReq: 1, warRoomReq: 0,  base: 5000,  perMember: 3000,
      gold: 7000,  gems: 12, mats: 4,  standing: 1200,  sig: 0,    sigChampionOnly: false, phase: 'A' },
    { tier: 2, name: 'Keep Hunt',     castleReq: 2, warRoomReq: 3,  base: 15000, perMember: 7500,
      gold: 14000, gems: 20, mats: 6,  standing: 3000,  sig: 0.15, sigChampionOnly: true,  phase: 'A' },
    { tier: 3, name: 'Fortress Hunt', castleReq: 3, warRoomReq: 6,  base: 30000, perMember: 12500,
      gold: 28000, gems: 30, mats: 8,  standing: 7000,  sig: 0.25, sigChampionOnly: false, phase: 'A' },
    { tier: 4, name: 'Citadel Hunt',  castleReq: 4, warRoomReq: 9,  base: 50000, perMember: 16000,
      gold: 50000, gems: 45, mats: 10, standing: 15000, sig: 0.40, sigChampionOnly: false, phase: 'A' },
    { tier: 5, name: 'Crown Hunt',    castleReq: 5, warRoomReq: 12, base: 80000, perMember: 21000,
      gold: 90000, gems: 60, mats: 12, standing: 32000, sig: 1.00, sigChampionOnly: false, phase: 'C' }
  ];
  var ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
  var MIN_TIER = 1, MAX_TIER = 5;

  /* The Lone Hunt (§3.5). Solo has NO tiers — tiers are the clan's reward for
     being a clan — and keeps the 0.4× chest, which is the social pull. */
  var SOLO_CHEST = { gold: 2800, gems: 5, mats: 2 };
  var SOLO_SCALE = 0.4;

  // §3.5: solo_pool = clamp(5 × your first strike of the week, 20k, 200k),
  // set on the first strike and frozen for the week. It calibrates to the
  // player's ACTUAL measured power, so it always takes 5-6 strikes — a real
  // weekly loop at CL 30 and at CL 99 alike. SOLO_POOL_HP is obsolete.
  var SOLO_POOL_MULT = 5, SOLO_POOL_MIN = 20000, SOLO_POOL_MAX = 200000;
  var SOLO_CLAMP_FRAC = 0.25;   // a one-tap is arithmetically impossible

  // The pre-Hunt server's flat pool. Kept ONLY so a client talking to a
  // generation-1/2 server still renders a truthful bar (§2.1).
  var CLAN_POOL_HP = 250000;
  var REQ_COMBAT_LV = 30;

  // §5.5: the damage clamp is SELF-SCALING — max(5000, floor(pool × 0.10)) —
  // so no single strike can ever do more than a tenth of any boss, at any
  // tier, without a per-tier table to keep in sync. The 50,000 constant is the
  // generation-2 server's clamp and is the fallback when the pool is unknown.
  var LEGACY_CLAMP = 50000;
  var CLAMP_FLOOR = 5000, CLAMP_FRAC = 0.10;

  /* Bands, measured against the clan's MEDIAN contributor (§5.2). An absolute
     percentage band punishes members of large clans (in a 40-person clan the
     average member is 2.5% of the pool; in a 10-person clan, 10%). Banding
     against the median is size-independent and directly anti-freeload.
     Bands, not a linear share, because a linear split would punish lower-geared
     members for owning worse gear — and a clan needs its newer members to feel
     welcome. Anyone who genuinely turned up gets a full share. */
  var BANDS = [
    { key: 'champion', label: 'Champion of the Hunt', ratio: 1.5, scale: 1.3 },
    { key: 'full',     label: 'Full share',           ratio: 0.6, scale: 1.0 },
    { key: 'partisan', label: "Partisan's share",     ratio: 0.2, scale: 0.6 }
  ];
  var MIN_STRIKES_FOR_CHEST = 2;   // §5.2 — this alone kills the one-tap
  var MEDIAN_MIN_STRIKES = 3;      // a swarm of one-strike alts cannot depress it
  var PARTIAL_CAP = 0.6;           // §5.3 — no all-or-nothing cliff
  var FALTERING_AT = 0.10;         // §4.1 — the social moment without a clock

  function W() { return window.HearthriseWorldEvents; }
  function seat() { return window.HearthriseClanSeat; }

  // ── Clock ───────────────────────────────────────────────────
  // HearthriseWorldEvents is the shared clock for every timed system —
  // read it, never reimplement it. The server derives the same two keys
  // itself (hr_utc_day_key / hr_utc_week_key) and is authoritative. If a
  // device clock is wrong enough to straddle a boundary the server tells
  // us its key and we adopt it — but only while OUR key is still the one
  // it disagreed with, so the correction expires on its own.
  var clockFix = { week: null, day: null };
  function localWeekKey() { return W() ? W().utcWeekKey() : 'w0'; }
  function localDayKey() { return W() ? W().utcDayKey() : 'd0'; }
  function weekKey() {
    var l = localWeekKey();
    return (clockFix.week && clockFix.week.local === l) ? clockFix.week.server : l;
  }
  function dayKey() {
    var l = localDayKey();
    return (clockFix.day && clockFix.day.local === l) ? clockFix.day.server : l;
  }
  function adoptWeek(w) {
    if (!w) return;                                   // old server: says nothing, we keep ours
    var l = localWeekKey();
    clockFix.week = (w === l) ? null : { local: l, server: w };
  }
  function adoptDay(d) {
    if (!d) return;
    var l = localDayKey();
    clockFix.day = (d === l) ? null : { local: l, server: d };
  }

  /* ══════════════════════════════════════════════════════════════
     3. PURE HUNT MATHS — no fetch, no DOM, directly testable.
     ══════════════════════════════════════════════════════════════ */
  function tierDef(t) {
    var n = Math.max(MIN_TIER, Math.min(MAX_TIER, t | 0)) || MIN_TIER;
    for (var i = 0; i < HUNT_TIERS.length; i++) if (HUNT_TIERS[i].tier === n) return HUNT_TIERS[i];
    return HUNT_TIERS[0];
  }
  function tierName(t) { return tierDef(t).name; }
  function tierRoman(t) { return ROMAN[Math.max(1, Math.min(5, t | 0))] || 'I'; }

  // §3.2 — the one formula. members_at_declaration is snapshotted SERVER-side
  // when the Hunt is declared; this is the client's preview of the same number.
  function poolFor(tier, members) {
    var d = tierDef(tier);
    var n = Math.max(0, Math.floor(Number(members) || 0));
    return d.base + d.perMember * n;
  }

  // §5.5 — self-scaling, so a new tier never needs a new clamp.
  function strikeClamp(pool) {
    var p = Math.max(0, Math.floor(Number(pool) || 0));
    if (p <= 0) return LEGACY_CLAMP;
    return Math.max(CLAMP_FLOOR, Math.floor(p * CLAMP_FRAC));
  }

  // §3.3 — the two-way interlock with the castle. Reads the SHARED reducer in
  // clan-seat.js rather than re-deriving it: two copies of a gate is how the
  // client and the panel end up disagreeing about what a clan may declare.
  function maxHuntTier(castleTier, warRoomLevel) {
    var s = seat();
    var v = s && typeof s.maxHuntTier === 'function'
      ? s.maxHuntTier(castleTier, warRoomLevel)
      : Math.min(Math.max(1, castleTier | 0), 1 + Math.floor(Math.max(0, warRoomLevel | 0) / 3));
    return Math.max(MIN_TIER, Math.min(MAX_TIER, v));
  }

  /* The median contributor, over members with ≥ MEDIAN_MIN_STRIKES strikes
     (§5.2). If nobody has struck three times — a young or a quiet clan — the
     median falls back to every contributor, and then to 0. A 0 median must NOT
     read as "everyone is a Champion", so bandFor treats it as a full share for
     anyone who met the strike minimum: the band exists to rank effort against
     effort, and with no distribution to rank against, turning up IS the effort. */
  function medianContribution(rows) {
    var list = (rows || []).filter(function (r) {
      return r && (r.strikes | 0) >= MEDIAN_MIN_STRIKES && (+r.damage || 0) > 0;
    });
    if (!list.length) {
      list = (rows || []).filter(function (r) { return r && (+r.damage || 0) > 0; });
    }
    if (!list.length) return 0;
    var vals = list.map(function (r) { return +r.damage || 0; }).sort(function (a, b) { return a - b; });
    var mid = vals.length >> 1;
    return vals.length % 2 ? vals[mid] : Math.floor((vals[mid - 1] + vals[mid]) / 2);
  }

  function bandFor(damage, median, strikes) {
    var s = Math.max(0, strikes | 0);
    var d = Math.max(0, +damage || 0);
    if (s < MIN_STRIKES_FOR_CHEST || d <= 0) return null;
    var m = Math.max(0, +median || 0);
    if (m <= 0) return BANDS[1];                       // no distribution to rank against
    var r = d / m;
    for (var i = 0; i < BANDS.length; i++) if (r >= BANDS[i].ratio) return BANDS[i];
    return null;
  }

  // §5.3 — partial credit, capped. An idle game cannot punish a clan for one
  // bad week of attendance; but the kill stays clearly better (full value PLUS
  // the signature drop), so it remains the goal.
  function partialFactor(damage, pool) {
    var p = Math.max(0, +pool || 0);
    if (p <= 0) return 0;
    return Math.min(PARTIAL_CAP, Math.max(0, +damage || 0) / p);
  }

  // The full client-side preview of what the server will pay. The server
  // recomputes all of it and its answer always wins — this exists so the card
  // can say "Full share" before you press Claim, not so the client can bank it.
  function previewScale(o) {
    o = o || {};
    var band = bandFor(o.damage, o.median, o.strikes);
    if (!band) return { band: null, label: 'No chest', scale: 0 };
    var f = o.downed ? 1 : partialFactor(o.clanDamage != null ? o.clanDamage : o.damage, o.pool);
    return { band: band.key, label: band.label, scale: band.scale * f, partial: !o.downed, factor: f };
  }

  // §3.5 — the solo pool, calibrated to the player's own measured power.
  function soloPoolFor(firstStrike) {
    var v = Math.max(0, Math.floor(Number(firstStrike) || 0)) * SOLO_POOL_MULT;
    return Math.max(SOLO_POOL_MIN, Math.min(SOLO_POOL_MAX, v));
  }

  function bossesForTier(tier) {
    var t = Math.max(MIN_TIER, Math.min(MAX_TIER, tier | 0));
    var set = BOSSES.filter(function (b) { return b.tiers.indexOf(t) >= 0; });
    return set.length ? set : BOSSES.slice(0, 3);
  }
  function hash(s) { return W() ? W()._hash(s) : 0; }

  /* bossOfWeek(wk, tier)
     With a tier: rotates weekly WITHIN that tier's boss set (§3.4).
     Without one: the b209 rotation over the whole roster, kept so a client
     talking to a pre-Hunt server (which has no tier to report) still names a
     boss deterministically rather than showing a blank card. */
  function bossOfWeek(wk, tier) {
    var w = wk || weekKey();
    if (tier == null || !(tier | 0)) return BOSSES[hash('hr-raid-' + w) % BOSSES.length];
    var set = bossesForTier(tier);
    return set[hash('hr-hunt-' + (tier | 0) + '-' + w) % set.length];
  }
  function bossById(id) {
    for (var i = 0; i < BOSSES.length; i++) if (BOSSES[i].id === id) return BOSSES[i];
    return null;
  }

  /* The chest (§5.4 + §10.4). Gold / gems / Standing come from the TIER; the
     materials come from the BOSS, scaled so the count matches the tier's
     line. Two sources, one for the economy's shape and one for the flavour,
     which is why a Tier IV Sunken Choir and a Tier IV Warden pay the same gold
     and different materials. */
  function chestFor(tier, boss) {
    var d = tierDef(tier);
    var b = boss || bossOfWeek(null, tier);
    var ids = Object.keys((b && b.reward && b.reward.items) || {});
    var items = {};
    if (ids.length) {
      var each = Math.max(1, Math.round(d.mats / ids.length));
      ids.forEach(function (id) { items[id] = each; });
    }
    return { tier: d.tier, name: d.name, gold: d.gold, gems: d.gems, items: items,
             standing: d.standing, sigChance: d.sig, sigChampionOnly: d.sigChampionOnly,
             sig: b ? b.sig : null };
  }
  function soloChestFor(boss) {
    var b = boss || bossOfWeek();
    var ids = Object.keys((b && b.reward && b.reward.items) || {}).slice(0, 2);
    var items = {};
    ids.forEach(function (id) { items[id] = 1; });
    return { tier: 0, name: 'Lone Hunt', gold: SOLO_CHEST.gold, gems: SOLO_CHEST.gems,
             items: items, standing: 0, sigChance: 0, sig: null };
  }

  /* ══════════════════════════════════════════════════════════════
     4. THE CASTLE, READ ONLY.

     The War Room sets the Hunt's tier ceiling and the Great Hall sets its
     hard cap. Both live in the castle's state, which this file READS and never
     owns — clans.js and the castle panel are another surface. If the castle
     has not been fetched yet we answer Tier I, which is the founding state,
     never a locked one.
     ══════════════════════════════════════════════════════════════ */
  function myClanRow() {
    try {
      var C = window.HearthriseClans;
      return (C && typeof C.myClan === 'function' && C.myClan()) || null;
    } catch (e) { return null; }
  }
  function castleState() {
    var c = myClanRow() || {};
    var up = c.upgrades && typeof c.upgrades === 'object' ? c.upgrades : {};
    return {
      castleTier: Math.max(1, (+c.castle_tier || 1)),
      warRoom: Math.max(0, (+up.war_room || 0)),
      role: c.myRole || 'member'
    };
  }
  function tierCeiling() {
    var s = castleState();
    return maxHuntTier(s.castleTier, s.warRoom);
  }
  // Declaration is officer/leader only (§3.1). The server re-checks it; this
  // only decides whether to render the control.
  function canDeclare() {
    var r = castleState().role;
    return r === 'leader' || r === 'officer';
  }

  /* ══════════════════════════════════════════════════════════════
     5. raidPower — the War Room's whole reason to exist (§7 client work).

     `getBonus('raidPower')` was a declared-but-unread key: clan-overhaul v2 §7
     hangs the War Room's +1%/level (→ +10% at L10) on it, and nothing consumed
     it, so the building buffed nothing. ONE choke point, the same discipline
     b222 used for goldFind, so a second source can never be wired half-way.

     Clamped at ≥ 0 so a future negative contributor can never make a strike
     deal less than the player's honest rolls.
     ══════════════════════════════════════════════════════════════ */
  function raidPower() {
    try {
      if (typeof window.getBonus !== 'function') return 0;
      return Math.max(0, Number(window.getBonus('raidPower')) || 0);
    } catch (e) { return 0; }
  }
  function raidPowerMult() { return 1 + raidPower(); }

  function cfg() { return (window.HearthriseSupabase && window.HearthriseSupabase.getConfig && window.HearthriseSupabase.getConfig()) || null; }
  function session() { return (window.HearthriseAuth && window.HearthriseAuth.getSession && window.HearthriseAuth.getSession()) || null; }
  function myUserId() { var s = session(); return (s && s.user && s.user.id) || null; }
  function headers(j) {
    var c = cfg(), s = session();
    var h = { 'apikey': c.anonKey, 'Authorization': 'Bearer ' + ((s && s.access_token) || c.anonKey) };
    if (j) { h['Content-Type'] = 'application/json'; h['Prefer'] = 'return=representation'; }
    return h;
  }
  function inClan() { return !!(window.G && window.G.clanId && cfg() && session()); }
  function persist() { if (typeof window.saveLocal === 'function') window.saveLocal(); }

  function ensureState() {
    var G = window.G || {};
    if (!G.raids) G.raids = { lastStrikeDay: null, solo: null, claimed: {} };
    if (!G.raids.claimed || typeof G.raids.claimed !== 'object') G.raids.claimed = {};
    var wk = weekKey();
    /* The solo pool resets each week and is UNMEASURED until the first strike
       (§3.5): hp/max stay null so the card can say so honestly instead of
       inventing a number the player has not earned a reading for. */
    if (!G.raids.solo || G.raids.solo.week !== wk) {
      G.raids.solo = { week: wk, hp: null, max: null, damage: 0, strikes: 0 };
    }
    if (G.raids.solo.strikes == null) G.raids.solo.strikes = G.raids.solo.damage > 0 ? 1 : 0;
    /* The claim mirror needs the current week AND the one before it — §5.3's
       partial-credit grace runs for 24h after the roll, and a mirror that
       forgot last week would offer a chest that the server has already paid.
       Two keys, not a growing map: without the prune this grows one key per
       week forever inside the save. */
    var cur = +String(wk).replace(/^w/, '');
    if (isFinite(cur)) {
      Object.keys(G.raids.claimed).forEach(function (k) {
        var n = +String(k).replace(/^w/, '');
        if (isFinite(n) && n < cur - 1) delete G.raids.claimed[k];
      });
    }
    return G.raids;
  }

  /* §5.3 — the grace window. An idle game cannot punish a clan for one bad
     week of attendance, so a Hunt that was not downed still pays
     chest × band × min(0.6, damage/pool) for 24 hours after the week rolls.
     Both halves are derived from the week key, never stored: the server
     computes the same boundary from hr_week_start(). */
  var GRACE_MS = 24 * 3600 * 1000, WEEK_MS = 7 * 86400000;
  function weekNumber(wk) { var n = +String(wk == null ? '' : wk).replace(/^w/, ''); return isFinite(n) ? n : NaN; }
  function weekStartMs(wk) { var n = weekNumber(wk); return isFinite(n) ? n * WEEK_MS : NaN; }
  function prevWeekKey(wk) { var n = weekNumber(wk); return isFinite(n) ? 'w' + (n - 1) : null; }
  function graceOpen(nowMs) {
    var s = weekStartMs(weekKey());
    var t = Number(nowMs) || Date.now();
    return isFinite(s) && (t - s) >= 0 && (t - s) < GRACE_MS;
  }

  /* Real combat math: simulate N ticks of the player's rolls vs the boss.
     `opts.clamp` is the pool-scaled ceiling (§5.5); it defaults to the
     generation-2 server's flat 50,000 so an un-migrated server still agrees
     with us. raidPower multiplies the TOTAL, before the clamp, so the War Room
     can never push a strike past a tenth of the pool. */
  function simulateStrike(boss, opts) {
    var ticks = 120, total = 0;
    var mob = { def: boss.def, weaponWeak: boss.weak, family: 'Mythic' };
    for (var i = 0; i < ticks; i++) {
      try {
        var r = window.getPlayerCombatRolls(mob);
        if (Math.random() < (r.accuracy || 0.5)) {
          total += Math.max(1, Math.floor(Math.random() * (r.maxHit || 2)) + 1);
        }
      } catch (e) { total += 1; }
    }
    total = Math.floor(total * raidPowerMult());
    var cap = (opts && opts.clamp) ? Math.max(1, opts.clamp | 0) : LEGACY_CLAMP;
    return Math.max(10, Math.min(cap, total));
  }

  // ── Honest messages for every server refusal ────────────────
  // A player who is told "try again" for something that will never succeed
  // learns to spam the button. Every code the server can return gets its
  // own truthful sentence, and none of them invite a retry loop.
  var STRIKE_ERRORS = {
    already_struck_today: 'You already struck the Hunt today — return tomorrow',
    not_member: 'You are no longer a member of that clan',
    not_signed_in: 'Sign in to strike the clan Hunt',
    bad_damage: 'The server refused that strike',
    no_hunt: 'No Hunt is declared this week — an officer must call it',
    week_mismatch: 'Your clock is out of step with the server — reload and try again'
  };
  var CLAIM_ERRORS = {
    already_claimed: 'You have already claimed a Hunt chest this week',
    not_downed: 'The boss still stands — keep striking!',
    no_contribution: 'You never struck this boss — no chest this week',
    too_few_strikes: 'Two strikes are the price of a share — one is not turning up',
    below_band: 'Your contribution fell short of a share this week',
    joined_after_kill: 'You joined after the boss fell — no chest this week',
    joined_after_declare: 'You joined after the Hunt was declared — no chest this week',
    grace_expired: 'The claim window for that Hunt has closed',
    not_member: 'You are no longer a member of that clan',
    not_signed_in: 'Sign in to claim your Hunt chest',
    bad_scope: 'The server refused that claim',
    bad_clan: 'The server refused that claim',
    week_mismatch: 'Your clock is out of step with the server — reload and try again',
    network: 'Could not reach the server — try again in a moment'
  };
  var DECLARE_ERRORS = {
    not_officer: 'Only the leader or an officer may declare the Hunt',
    already_declared: 'This week\'s Hunt is already declared — it locks for the week',
    tier_too_high: 'Your hold cannot field a Hunt at that tier yet',
    bad_tier: 'That is not a Hunt tier',
    not_member: 'You are no longer a member of that clan',
    not_signed_in: 'Sign in to declare the Hunt',
    week_mismatch: 'Your clock is out of step with the server — reload and try again',
    network: 'Could not reach the server — try again in a moment'
  };
  function strikeErrorText(err) { return STRIKE_ERRORS[err] || 'Strike failed — the boss is untouched'; }
  function claimErrorText(err) { return CLAIM_ERRORS[err] || 'The server refused that claim'; }
  function declareErrorText(err) { return DECLARE_ERRORS[err] || 'The server refused that declaration'; }

  /* ══════════════════════════════════════════════════════════════
     6. REDUCERS — the server contract, pure and directly testable.

     reduceStrike tolerates the PRE-MIGRATION response shapes: generation 1
     carries only {ok, hp_remaining, downed}; generation 2 adds day/week/max_hp;
     generation 3 adds tier/pool/members/faltering. Each reads as a normal hit.
     ══════════════════════════════════════════════════════════════ */
  function isMissingRpc(status, out) {
    return status === 404 || (out && (out.code === 'PGRST202' || out.code === '42883' || out.code === '42P01'));
  }

  function reduceStrike(out, attempt) {
    // Contract check first: the RPC always answers with a boolean `ok`. A
    // PostgREST error envelope, an HTML error page or a null body must never
    // fall through to the success branch.
    if (!out || typeof out !== 'object' || typeof out.ok !== 'boolean') {
      return { action: 'fail', message: strikeErrorText('') };
    }
    if (out.ok === false) {
      var err = out.error || '';
      if (err === 'week_mismatch' && out.week && !attempt) {
        return { action: 'retry', week: out.week, day: out.day };
      }
      if (err === 'already_struck_today') {
        return { action: 'blocked', week: out.week, day: out.day, message: strikeErrorText(err) };
      }
      if (err === 'no_hunt') {
        return { action: 'undeclared', week: out.week, day: out.day,
                 ceiling: +out.tier_ceiling || 1, message: strikeErrorText(err) };
      }
      return { action: 'fail', error: err, message: strikeErrorText(err) };
    }
    var max = +out.max_hp || CLAN_POOL_HP;
    var hp = Math.max(0, +out.hp_remaining || 0);
    return {
      action: 'accept', week: out.week, day: out.day,
      hp: hp, max: max,
      damage: +out.damage || 0,
      tier: out.tier == null ? null : Math.max(1, +out.tier || 1),
      members: +out.members || 0,
      strikes: +out.strikes || 0,
      mine: +out.my_damage || 0,
      downed: !!out.downed,
      // §4.1 The Faltering — the social moment, without a clock. Derived here
      // rather than trusted, so an old server produces it too.
      faltering: hp > 0 && max > 0 && (hp / max) <= FALTERING_AT
    };
  }

  // reduceClaim also decides "this server has no raid_claim RPC yet", which
  // is what lets this client ship before the migration is applied.
  function reduceClaim(status, out, attempt) {
    if (isMissingRpc(status, out)) return { action: 'unsupported' };
    // Anything that isn't the RPC's own {ok:boolean,…} envelope — a 401, a
    // 500, an error object — is a refusal, never a chest.
    if (status >= 400 || !out || typeof out !== 'object' || typeof out.ok !== 'boolean') {
      return { action: 'fail', message: claimErrorText('') };
    }
    if (out.ok === false) {
      var err = out.error || '';
      if (err === 'week_mismatch' && out.week && !attempt) return { action: 'retry', week: out.week };
      if (err === 'already_claimed') return { action: 'spent', message: claimErrorText(err) };
      return { action: 'fail', error: err, message: claimErrorText(err) };
    }
    return {
      action: 'accept', scale: +out.scale || null, week: out.week,
      tier: out.tier == null ? null : Math.max(1, +out.tier || 1),
      band: out.band || null,
      median: +out.median || 0,
      partial: !!out.partial,
      // The signature drop is rolled by the SERVER — a client-rolled drop is a
      // client-chosen drop, and this is the rarest material in the game.
      sig: !!out.sig,
      boss: out.boss_id || null,
      standing: +out.standing || 0
    };
  }

  function reduceDeclare(status, out, attempt) {
    if (isMissingRpc(status, out)) return { action: 'unsupported' };
    if (status >= 400 || !out || typeof out !== 'object' || typeof out.ok !== 'boolean') {
      return { action: 'fail', message: declareErrorText('network') };
    }
    if (out.ok === false) {
      var err = out.error || '';
      if (err === 'week_mismatch' && out.week && !attempt) return { action: 'retry', week: out.week };
      return { action: 'fail', error: err, message: declareErrorText(err),
               ceiling: out.ceiling == null ? null : +out.ceiling };
    }
    return {
      action: 'accept', week: out.week,
      tier: Math.max(1, +out.tier || 1),
      pool: Math.max(0, +out.pool_hp || 0),
      members: Math.max(0, +out.members || 0),
      boss: out.boss_id || null
    };
  }

  // ── Transport ───────────────────────────────────────────────
  // Feature detection for the newer RPCs. A NEGATIVE probe expires after ten
  // minutes so a session that was open while the migration was applied starts
  // using the hardened path without a reload.
  var rpcKnown = {};
  function rpcMissing(name) {
    var r = rpcKnown[name];
    return !!(r && r.known === false && (Date.now() - r.at) < 600000);
  }
  function noteRpc(name, present) { rpcKnown[name] = { known: present, at: Date.now() }; }

  async function rpc(name, body) {
    var res = await fetch(cfg().url + '/rest/v1/rpc/' + name, {
      method: 'POST', headers: headers(true), body: JSON.stringify(body)
    });
    var json = null;
    try { json = await res.json(); } catch (e) { json = null; }
    return { status: res.status, ok: res.ok, json: json };
  }

  /* ══════════════════════════════════════════════════════════════
     7. THE HUNT STATE — one fetch of the truth, cached briefly.
     ══════════════════════════════════════════════════════════════ */
  var huntCache = { at: 0, week: null, raid: null, rows: null };
  function invalidate() { huntCache = { at: 0, week: null, raid: null, rows: null }; }

  async function clanStatus(force) {
    if (!inClan()) return null;
    var wk = weekKey();
    if (!force && huntCache.week === wk && (Date.now() - huntCache.at) < 8000) return huntCache.raid;
    try {
      var url = cfg().url + '/rest/v1/clan_raids?clan_id=eq.' + window.G.clanId +
        '&week_key=eq.' + encodeURIComponent(wk);
      var res = await fetch(url, { headers: headers() });
      var rows = res.ok ? await res.json() : [];
      huntCache = { at: Date.now(), week: wk, raid: rows[0] || null, rows: huntCache.rows };
      return huntCache.raid;
    } catch (e) { return null; }
  }

  // The contribution ledger is world-readable (RLS `using (true)`), which is
  // what lets the card show you your standing against the median BEFORE you
  // claim. It is a preview; the server recomputes the band.
  async function contributions(force) {
    if (!inClan()) return [];
    var wk = weekKey();
    if (!force && huntCache.rows && huntCache.week === wk && (Date.now() - huntCache.at) < 8000) return huntCache.rows;
    try {
      var url = cfg().url + '/rest/v1/raid_contributions?clan_id=eq.' + window.G.clanId +
        '&week_key=eq.' + encodeURIComponent(wk) + '&select=user_id,damage,strikes';
      var res = await fetch(url, { headers: headers() });
      var rows = res.ok ? await res.json() : [];
      huntCache.rows = rows;
      huntCache.week = wk;
      return rows;
    } catch (e) { return []; }
  }

  /* ══════════════════════════════════════════════════════════════
     8. DECLARE (§3.1, §7.2)

     Officer/leader only, once per UTC week, and it LOCKS for the week. That
     lock is the point: it makes difficulty a decision the leadership argues
     about in clan chat rather than a slider anyone can nudge.
     ══════════════════════════════════════════════════════════════ */
  async function declare(tier) {
    var t = Math.max(MIN_TIER, Math.min(MAX_TIER, tier | 0));
    if (!inClan()) { notify('Join a clan to declare a Hunt', 'kill'); return null; }
    if (!canDeclare()) { notify(DECLARE_ERRORS.not_officer, 'kill'); return null; }
    var ceil = tierCeiling();
    if (t > ceil) {
      notify('Your hold can field the ' + tierName(ceil) + ' at most — raise the War Room', 'kill');
      return null;
    }
    return await declareOnce(t, 0);
  }

  async function declareOnce(t, attempt) {
    if (rpcMissing('clan_hunt_declare')) {
      notify('This realm has not raised its War Room yet — the Hunt runs untiered', 'info');
      return null;
    }
    var boss = bossOfWeek(weekKey(), t);
    var r;
    try {
      r = await rpc('clan_hunt_declare', {
        p_clan_id: window.G.clanId, p_week: weekKey(), p_tier: t, p_boss: boss.id
      });
    } catch (e) { notify(DECLARE_ERRORS.network, 'kill'); return null; }
    var d = reduceDeclare(r.status, r.json, attempt);
    noteRpc('clan_hunt_declare', d.action !== 'unsupported');

    if (d.action === 'retry') { adoptWeek(d.week); return await declareOnce(t, attempt + 1); }
    if (d.action === 'unsupported') {
      notify('This realm has not raised its War Room yet — the Hunt runs untiered', 'info');
      return null;
    }
    if (d.action !== 'accept') { notify(d.message, 'kill'); return null; }

    invalidate();
    notify('⚔ ' + tierName(d.tier) + ' declared — ' + boss.name + ', ' +
      d.pool.toLocaleString() + ' HP across ' + d.members + ' member' + (d.members === 1 ? '' : 's'), 'levelup');
    render();
    return d;
  }

  /* ══════════════════════════════════════════════════════════════
     9. STRIKE
     ══════════════════════════════════════════════════════════════ */
  function canStrike() {
    var st = ensureState();
    var lv = (typeof window.getCombatLevel === 'function' ? window.getCombatLevel() : 0);
    if (lv < REQ_COMBAT_LV) return { ok: false, reason: 'level', message: 'Reach combat level ' + REQ_COMBAT_LV + ' to hunt' };
    if (st.lastStrikeDay === dayKey()) return { ok: false, reason: 'struck_today', message: STRIKE_ERRORS.already_struck_today };
    return { ok: true, reason: '' };
  }

  async function strike() {
    var gate = canStrike();                 // fast local mirror — UX only
    if (!gate.ok) { notify(gate.message, 'kill'); return null; }
    if (inClan()) {
      var raid = await clanStatus(true);
      var tier = raid && raid.tier != null ? (+raid.tier || 1) : null;
      var pool = raid && +raid.max_hp ? +raid.max_hp : 0;
      var boss = (raid && bossById(raid.boss_id)) || bossOfWeek(weekKey(), tier);
      var dmg = simulateStrike(boss, { clamp: strikeClamp(pool) });
      return await clanStrike(boss, dmg, 0);
    }
    return soloStrike();
  }

  async function clanStrike(boss, dmg, attempt) {
    var st = ensureState(), G = window.G, r;
    try {
      r = await rpc('raid_strike', {
        p_clan_id: G.clanId, p_week: weekKey(), p_boss: boss.id,
        p_max_hp: CLAN_POOL_HP, p_damage: dmg      // p_max_hp: ignored since b219
      });
    } catch (e) {
      notify('Strike failed (network) — the boss is untouched', 'kill');
      return null;
    }
    var d = reduceStrike(r.ok ? r.json : null, attempt);

    if (d.action === 'retry') {                     // exactly one, never a loop
      adoptWeek(d.week); adoptDay(d.day);
      ensureState();                                // the solo pool follows the corrected week
      return await clanStrike(boss, dmg, attempt + 1);
    }
    if (d.action === 'blocked') {                   // the server's day gate said no
      adoptDay(d.day); adoptWeek(d.week);
      st.lastStrikeDay = dayKey();                  // resync the mirror to the truth
      persist(); invalidate(); render();
      notify(d.message, 'kill');
      return null;
    }
    if (d.action === 'undeclared') {                // §3.1 — nobody has called it
      adoptDay(d.day); adoptWeek(d.week);
      invalidate(); render();
      notify(canDeclare()
        ? 'No Hunt is declared — call one below and the week begins'
        : d.message, 'kill');
      return null;
    }
    if (d.action !== 'accept') { notify(d.message, 'kill'); return null; }

    // Accepted. The mirror moves only AFTER the server has recorded it, so a
    // failed request can never leave the player locked out of a real strike.
    adoptDay(d.day); adoptWeek(d.week);
    st.lastStrikeDay = dayKey();
    var dealt = d.damage || dmg;
    var pct = Math.round(100 * d.hp / (d.max || CLAN_POOL_HP));
    notify('⚔ You dealt ' + dealt.toLocaleString() + ' to ' + boss.name + ' — ' +
      (d.downed ? 'THE BOSS FALLS! Claim your chest.' : pct + '% remains'),
      d.downed ? 'levelup' : 'loot');
    // §4.1 The Faltering: people convene because the boss is nearly dead, not
    // because a calendar said so. Naturally distributed across timezones.
    if (d.faltering && !d.downed) {
      notify(boss.name + ' is faltering — ' + pct + '% remains. Call the clan.', 'levelup');
    }
    persist(); invalidate(); render();
    return { dmg: dealt, downed: d.downed, tier: d.tier };
  }

  /* Solo (§3.5). The pool is set by the FIRST strike of the week and frozen:
     5× your own measured output, floored at 20,000 and capped at 200,000, so
     the Lone Hunt is 5-6 strikes at CL 30 and at CL 99 alike. The strike clamp
     is 25% of that pool, which makes a one-tap arithmetically impossible. */
  function soloStrike() {
    var st = ensureState();
    var boss = bossOfWeek();
    if (!st.solo.max) {
      var first = simulateStrike(boss, { clamp: LEGACY_CLAMP });
      st.solo.max = soloPoolFor(first);
      st.solo.hp = st.solo.max;
      var opening = Math.min(first, Math.floor(st.solo.max * SOLO_CLAMP_FRAC));
      return applySolo(boss, opening);
    }
    var dmg = simulateStrike(boss, { clamp: Math.floor(st.solo.max * SOLO_CLAMP_FRAC) });
    return applySolo(boss, dmg);
  }
  function applySolo(boss, dmg) {
    var st = ensureState();
    st.lastStrikeDay = dayKey();
    st.solo.hp = Math.max(0, st.solo.hp - dmg);
    st.solo.damage += dmg;
    st.solo.strikes = (st.solo.strikes | 0) + 1;
    var downed = st.solo.hp === 0;
    notify('⚔ You dealt ' + dmg.toLocaleString() + ' to ' + boss.name + ' — ' +
      (downed ? 'THE BOSS FALLS! Claim your chest.' : Math.round(100 * st.solo.hp / st.solo.max) + '% remains'),
      downed ? 'levelup' : 'loot');
    persist(); render();
    return { dmg: dmg, downed: downed, tier: 0 };
  }

  /* ══════════════════════════════════════════════════════════════
     10. THE CHEST

     grantReward takes the chest the SERVER described (tier + scale + band +
     signature roll) and pays it. Nothing here decides how much — the client
     computing its own chest is the b209 bug this whole wave exists to close.
     ══════════════════════════════════════════════════════════════ */
  function grantReward(chest, scale, sig) {
    var G = window.G;
    var s = Math.max(0, Number(scale) || 0);
    if (s <= 0) return;
    var gold = Math.floor(chest.gold * s);
    var gems = Math.floor(chest.gems * s);
    G.gold = (G.gold || 0) + gold;
    G.gems = (G.gems || 0) + gems;
    var mats = [];
    Object.keys(chest.items || {}).forEach(function (id) {
      var q = Math.max(1, Math.floor(chest.items[id] * s));
      if (typeof window.addItem === 'function') addItem(id, q);
      mats.push(q + '× ' + itemName(id));
    });
    if (sig && chest.sig && typeof window.addItem === 'function') {
      addItem(chest.sig, 1);
      mats.push('1× ' + itemName(chest.sig));
    }
    notify('🏆 ' + chest.name + ' chest: +' + gold.toLocaleString() + 'g, +' + gems + ' gems' +
      (mats.length ? ', ' + mats.join(', ') : ''), 'levelup');
    if (sig && chest.sig) {
      notify('The ' + itemName(chest.sig) + ' is yours — the Hunt\'s signature spoil.', 'levelup');
    }
    persist();
    if (typeof window.updateTopbar === 'function') updateTopbar();
  }
  function itemName(id) {
    var I = window.ITEMS || {};
    return (I[id] && I[id].n) || id;
  }

  async function serverClaim(scope, clanId, wk, attempt) {
    if (!cfg() || !session()) return { action: 'unsupported' };
    if (rpcMissing('raid_claim')) return { action: 'unsupported' };
    var r;
    try {
      r = await rpc('raid_claim', { p_scope: scope, p_clan_id: clanId || null, p_week: wk });
    } catch (e) {
      return { action: 'fail', message: claimErrorText('network') };
    }
    var d = reduceClaim(r.status, r.json, attempt);
    noteRpc('raid_claim', d.action !== 'unsupported');
    return d;
  }

  async function claim() {
    var st = ensureState();
    var wk = weekKey();
    if (st.claimed[wk]) { notify(CLAIM_ERRORS.already_claimed, 'kill'); return false; }
    return inClan() ? await clanClaim(wk, 0) : await soloClaim(wk, 0);
  }

  async function clanClaim(wk, attempt) {
    var st = ensureState();
    var raid = await clanStatus(true);
    // §5.3 — partial credit means a claim is legal on a live pool too, once
    // the week has rolled. The server owns that window; the client only
    // refuses the obviously-hopeless case of an untouched pool.
    if (!raid) { notify(CLAIM_ERRORS.not_downed, 'kill'); return false; }
    var d = await serverClaim('clan', window.G.clanId, wk, attempt);

    if (d.action === 'retry') { adoptWeek(d.week); return await clanClaim(weekKey(), attempt + 1); }
    if (d.action === 'unsupported') return await legacyClanClaim(wk, raid);   // pre-migration server
    if (d.action === 'spent') {
      st.claimed[wk] = true; persist(); render();
      notify(d.message, 'kill'); return false;
    }
    if (d.action !== 'accept') { notify(d.message, 'kill'); return false; }

    st.claimed[wk] = true;
    var tier = d.tier != null ? d.tier : (raid.tier != null ? +raid.tier : null);
    var boss = bossById(d.boss || raid.boss_id) || bossOfWeek(wk, tier);
    var chest = tier ? chestFor(tier, boss) : legacyChest(boss);
    grantReward(chest, d.scale || 1.0, d.sig);
    if (d.band) {
      notify(bandLabel(d.band) + (d.partial ? ' · partial credit' : ''), 'info');
    }
    invalidate(); render();
    return true;
  }
  /* The grace claim (§5.3). A separate control and a separate call, never a
     silent redirect of the normal Claim button — a player pressing "claim"
     must always know which week they are being paid for. */
  async function claimGrace() {
    var st = ensureState();
    if (!inClan()) { notify('The grace window is a clan Hunt rule', 'kill'); return false; }
    if (!graceOpen()) { notify(CLAIM_ERRORS.grace_expired, 'kill'); return false; }
    var pw = prevWeekKey(weekKey());
    if (!pw) return false;
    if (st.claimed[pw]) { notify(CLAIM_ERRORS.already_claimed, 'kill'); return false; }
    var d = await serverClaim('clan', window.G.clanId, pw, 0);
    if (d.action === 'unsupported') { notify(CLAIM_ERRORS.grace_expired, 'kill'); return false; }
    if (d.action === 'spent') { st.claimed[pw] = true; persist(); render(); notify(d.message, 'kill'); return false; }
    if (d.action !== 'accept') { notify(d.message, 'kill'); return false; }
    st.claimed[pw] = true;
    var boss = bossById(d.boss) || bossOfWeek(pw, d.tier);
    var chest = d.tier ? chestFor(d.tier, boss) : legacyChest(boss);
    grantReward(chest, d.scale || 0, d.sig);
    notify(bandLabel(d.band) + ' · partial credit for last week', 'info');
    invalidate(); render();
    return true;
  }
  // Last week's row, read only during the grace window so the card can offer
  // the partial share truthfully instead of showing a button that will fail.
  async function graceStatus() {
    if (!inClan() || !graceOpen()) return null;
    var pw = prevWeekKey(weekKey());
    if (!pw || ensureState().claimed[pw]) return null;
    try {
      var res = await fetch(cfg().url + '/rest/v1/clan_raids?clan_id=eq.' + window.G.clanId +
        '&week_key=eq.' + encodeURIComponent(pw), { headers: headers() });
      var rows = res.ok ? await res.json() : [];
      return rows[0] || null;
    } catch (e) { return null; }
  }

  function bandLabel(key) {
    for (var i = 0; i < BANDS.length; i++) if (BANDS[i].key === key) return BANDS[i].label;
    return 'Share of the Hunt';
  }
  // The chest a pre-Hunt server implies: the boss's own b209 reward, verbatim.
  function legacyChest(boss) {
    return { tier: 0, name: 'Weekly Raid', gold: boss.reward.gold, gems: boss.reward.gems,
             items: boss.reward.items, standing: 0, sigChance: 0, sig: null };
  }

  // The b209 path: a conditional PATCH that only flips MY own claimed=false
  // row. Kept solely so this client works against a server that hasn't had
  // the hardening migration run yet. Once it has, the RLS update policy is
  // gone and this branch is unreachable.
  async function legacyClanClaim(wk, raid) {
    var st = ensureState();
    var boss = bossById(raid && raid.boss_id) || bossOfWeek(wk);
    if (!raid || +raid.hp_remaining > 0) { notify(CLAIM_ERRORS.not_downed, 'kill'); return false; }
    var uid = myUserId();
    if (!uid) { notify(CLAIM_ERRORS.not_signed_in, 'kill'); return false; }
    var flipped;
    try {
      var res = await fetch(cfg().url + '/rest/v1/raid_contributions?clan_id=eq.' + window.G.clanId +
        '&week_key=eq.' + encodeURIComponent(wk) + '&user_id=eq.' + uid + '&claimed=eq.false', {
        method: 'PATCH', headers: headers(true), body: JSON.stringify({ claimed: true })
      });
      flipped = res.ok ? await res.json() : [];
    } catch (e) { notify(CLAIM_ERRORS.network, 'kill'); return false; }
    if (!flipped || !flipped.length) { notify(CLAIM_ERRORS.no_contribution, 'kill'); return false; }
    st.claimed[wk] = true;
    grantReward(legacyChest(boss), 1.0, false);
    invalidate(); render();
    return true;
  }

  async function soloClaim(wk, attempt) {
    var st = ensureState(), boss = bossOfWeek(wk);
    if (!st.solo.max || st.solo.hp > 0) { notify(CLAIM_ERRORS.not_downed, 'kill'); return false; }
    var d = await serverClaim('solo', null, wk, attempt);

    if (d.action === 'retry') { adoptWeek(d.week); return await soloClaim(weekKey(), attempt + 1); }
    if (d.action === 'spent') {
      st.claimed[wk] = true; persist(); render();
      notify(d.message, 'kill'); return false;
    }
    // 'unsupported' = signed out, offline-only, or a server without the
    // migration. That is the b209 behaviour: local ledger, local chest.
    if (d.action !== 'accept' && d.action !== 'unsupported') { notify(d.message, 'kill'); return false; }

    st.claimed[wk] = true;
    grantReward(soloChestFor(boss), (d.action === 'accept' && d.scale) || SOLO_SCALE, false);
    render();
    return true;
  }

  /* ══════════════════════════════════════════════════════════════
     11. THE HUNT CARD (§6) — the ACTION surface, in the Events panel.

     b220 (#14) moved this card out of #panel-dungeons — a panel whose nav
     entry was injected and then hidden in CSS, so the game's flagship SOCIAL
     feature was nested inside an unreachable COMBAT sub-panel. It now lives in
     the top-level Events destination next to the muster, and it renders at its
     true height there (#panel-dungeons was `.panel.active{display:grid}` with
     no row template, so the injected card became an implicit grid row in a
     fixed-height container and collapsed to 16px).

     The castle panel carries the STATUS surface ("what does my clan need") and
     is another agent's file. Both read the same state; neither duplicates the
     other's controls.
     ══════════════════════════════════════════════════════════════ */
  function ensureStyle() {
    if (document.getElementById('hr-hunt-css')) return;
    var s = document.createElement('style');
    s.id = 'hr-hunt-css';
    // Tokens only — no hardcoded colours (CLAUDE.md hard rule).
    s.textContent = [
      '#hr-raid-card .hunt-bar{height:10px;background:rgba(0,0,0,.35);border-radius:99px;',
      '  overflow:hidden;border:1px solid var(--line-soft)}',
      '#hr-raid-card .hunt-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--red),#d4633f)}',
      '#hr-raid-card .hunt-bar.is-faltering i{background:linear-gradient(90deg,var(--gold-2),#e3c77e)}',
      '#hr-raid-card .hunt-tier{display:inline-block;font-family:var(--f-display,inherit);font-size:11px;',
      '  font-weight:800;letter-spacing:.12em;text-transform:uppercase;color:var(--gold-2);',
      '  border:1px solid rgba(201,162,74,.45);border-radius:99px;padding:2px 8px;margin-right:8px}',
      '#hr-raid-card .hunt-declare{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}',
      '#hr-raid-card .hunt-you{display:flex;justify-content:space-between;gap:10px;',
      '  border-top:1px solid var(--line-soft);margin-top:10px;padding-top:8px}'
    ].join('');
    (document.head || document.documentElement).appendChild(s);
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  async function render() {
    var host = document.getElementById('hr-raid-card');
    var slot = document.getElementById('hr-events-raid') || document.getElementById('panel-dungeons');
    if (!slot) return;
    ensureStyle();
    ensureState();
    if (!host) {
      host = document.createElement('div');
      host.id = 'hr-raid-card';
      host.className = 'card';
      host.style.cssText = 'margin-bottom:10px';
    }
    if (host.parentNode !== slot) {
      // In the Events panel the slot carries its own section label, so append;
      // in the legacy dungeons panel the card is the first thing on the screen.
      if (slot.id === 'hr-events-raid') slot.appendChild(host);
      else slot.insertBefore(host, slot.firstChild);
    }
    /* The solo card is painted BEFORE the first await, deliberately. An async
       function runs synchronously up to its first `await`, so a signed-out or
       offline player — who needs no network at all — gets a card in the same
       tick that render() is called, exactly as the pre-Hunt version did. Only
       the clan card, which genuinely has to ask the server what the Hunt is,
       pays a microtask. */
    /* b224: was `window.G.raids` — a bare deref of a global that legacy.js
       only publishes from boot(). Any render() before the engine has booted
       threw here, and because render() is async the throw escaped boot()'s
       try/catch as an unhandled rejection. The account wall makes that state
       reachable on purpose (nothing boots behind the gate), but the bug was
       always there for anyone who called render() early. ensureState() has
       handled a missing G since it was written — use it. */
    var st = ensureState(), wk = weekKey();
    var struckToday = st.lastStrikeDay === dayKey();
    var claimed = !!st.claimed[wk];
    if (!inClan()) { host.innerHTML = soloCardHtml(st, wk, struckToday, claimed); return; }
    host.innerHTML = await clanCardHtml(wk, struckToday, claimed);
  }

  async function clanCardHtml(wk, struckToday, claimed) {
    var raid = await clanStatus();
    var tier = raid && raid.tier != null ? (+raid.tier || 1) : null;
    var boss = (raid && bossById(raid.boss_id)) || bossOfWeek(wk, tier);
    var ceiling = tierCeiling();

    /* No row for this week: nothing has been declared and nobody has struck.
       The card's job here is to say who can fix that — WITHOUT hiding Strike,
       because against a pre-Hunt server (which has no declare RPC) the first
       strike is what opens the week. On a Hunt server that strike comes back
       `no_hunt` with an honest sentence rather than a silent no-op. */
    if (!raid) return preHuntHtml(ceiling, wk, struckToday);

    var max = (raid && +raid.max_hp) || CLAN_POOL_HP;
    var hp = raid ? Math.max(0, +raid.hp_remaining) : max;
    var pct = max > 0 ? Math.max(0, Math.min(100, Math.round(100 * hp / max))) : 0;
    var downed = hp === 0;
    var faltering = !downed && max > 0 && (hp / max) <= FALTERING_AT;

    var rows = await contributions();
    var uid = myUserId();
    var mine = null;
    (rows || []).forEach(function (r) { if (uid && r.user_id === uid) mine = r; });
    var median = medianContribution(rows);
    var clanDamage = (rows || []).reduce(function (a, r) { return a + (+r.damage || 0); }, 0);
    var pv = previewScale({
      damage: mine ? +mine.damage : 0, strikes: mine ? mine.strikes | 0 : 0,
      median: median, downed: downed, clanDamage: clanDamage, pool: max
    });

    var title = (tier ? '<span class="hunt-tier">Tier ' + tierRoman(tier) + ' · ' + esc(tierName(tier)) + '</span>' : '') +
      esc(boss.glyph + ' ' + boss.name);
    var sub = tier
      ? 'Clan Hunt · pool scaled to ' + ((raid && +raid.members_at_declare) || 0) + ' members at declaration'
      : 'Clan raid';

    var action = downed
      ? (claimed
        ? '<div class="tiny" style="color:var(--gold-2)">Chest claimed — a new quarry rises next week.</div>'
        : '<button class="btn btn-primary btn-sm" onclick="window.HearthriseRaids.claim()">Claim raid chest</button>')
      : '<button class="btn ' + (struckToday ? '' : 'btn-primary') + ' btn-sm" ' + (struckToday ? 'disabled' : '') +
        ' onclick="window.HearthriseRaids.strike()">' +
        (struckToday ? 'Struck today — return tomorrow' : 'Strike the boss (1/day)') + '</button>';

    // §5.3 — last week's Hunt fell short but is still worth something, for 24h.
    var grace = await graceStatus();
    var graceRow = grace
      ? '<div style="margin-top:8px"><button class="btn btn-sm" onclick="window.HearthriseRaids.claimGrace()">' +
        'Claim last week\'s partial share</button>' +
        '<div class="tiny muted" style="margin-top:4px">The ' + esc(tierName(grace.tier || 1)) +
        ' was not downed — a partial share is claimable for 24h after the week rolls.</div></div>'
      : '';

    return '<div class="card-head">' + bossPortraitHtml(boss) + '<div class="card-title">' + title + '</div>' +
      '<div class="card-sub">' + esc(sub) + '</div></div>' +
      '<div class="card-body" style="padding:12px 14px">' +
        '<div class="tiny muted" style="margin-bottom:8px">' + esc(boss.desc) +
          ' Weak to <b style="color:var(--gold-2)">' + esc(boss.weak) + '</b>.</div>' +
        '<div class="hunt-bar' + (faltering ? ' is-faltering' : '') + '"><i style="width:' + pct + '%"></i></div>' +
        '<div class="tiny muted" style="margin:4px 0 10px">' + hp.toLocaleString() + ' / ' + max.toLocaleString() +
          ' HP · resets weekly' + (faltering ? ' · <b style="color:var(--gold-2)">faltering</b>' : '') + '</div>' +
        action + graceRow +
        '<div class="hunt-you tiny muted">' +
          '<span>Your damage <b>' + (mine ? (+mine.damage).toLocaleString() : '0') + '</b>' +
            ' · ' + (mine ? (mine.strikes | 0) : 0) + ' strike' + ((mine && (mine.strikes | 0) === 1) ? '' : 's') + '</span>' +
          '<span>Median <b>' + median.toLocaleString() + '</b> · ' +
            esc(mine ? pv.label : 'strike to earn a share') + '</span>' +
        '</div>' +
      '</div>';
  }

  function preHuntHtml(ceiling, wk, struckToday) {
    var mine = canDeclare();
    var buttons = '';
    for (var t = MIN_TIER; t <= ceiling; t++) {
      var b = bossOfWeek(wk, t);
      buttons += '<button class="btn btn-sm ' + (t === ceiling ? 'btn-primary' : '') +
        '" title="' + esc(b.name) + '" onclick="window.HearthriseRaids.declare(' + t + ')">Tier ' +
        tierRoman(t) + ' · ' + esc(tierName(t)) + '</button>';
    }
    var s = castleState();
    return '<div class="card-head"><div class="card-title">The Hunt — undeclared</div>' +
      '<div class="card-sub">The quarry is chosen once a week, and it locks</div></div>' +
      '<div class="card-body" style="padding:12px 14px">' +
        '<div class="tiny muted">Your hold can field up to <b style="color:var(--gold-2)">Tier ' +
          tierRoman(ceiling) + ' · ' + esc(tierName(ceiling)) + '</b> ' +
          '(Great Hall ' + s.castleTier + ', War Room ' + s.warRoom + '). ' +
          'The pool scales to the roster the moment it is declared — every member raises it, ' +
          'so a freeloader is a real cost.</div>' +
        (mine ? '<div class="hunt-declare">' + buttons + '</div>'
              : '<div class="tiny muted" style="margin-top:8px">Only the leader or an officer may declare it. ' +
                'Ask in clan chat.</div>') +
        '<div style="margin-top:10px">' +
          '<button class="btn ' + (struckToday ? '' : 'btn-primary') + ' btn-sm" ' +
            (struckToday ? 'disabled' : '') + ' onclick="window.HearthriseRaids.strike()">' +
            (struckToday ? 'Struck today — return tomorrow' : 'Strike the boss (1/day)') + '</button>' +
        '</div>' +
      '</div>';
  }

  function soloCardHtml(st, wk, struckToday, claimed) {
    var boss = bossOfWeek(wk);
    var measured = !!st.solo.max;
    var max = st.solo.max || 0;
    var hp = measured ? st.solo.hp : 0;
    var pct = measured && max > 0 ? Math.max(0, Math.min(100, Math.round(100 * hp / max))) : 100;
    var downed = measured && hp === 0;
    return '<div class="card-head">' + bossPortraitHtml(boss) + '<div class="card-title">' + esc(boss.glyph + ' Lone Hunt — ' + boss.name) + '</div>' +
      '<div class="card-sub">Solo hunt (join a clan for the tiered pool + a bigger chest)</div></div>' +
      '<div class="card-body" style="padding:12px 14px">' +
        '<div class="tiny muted" style="margin-bottom:8px">' + esc(boss.desc) +
          ' Weak to <b style="color:var(--gold-2)">' + esc(boss.weak) + '</b>.</div>' +
        '<div class="hunt-bar"><i style="width:' + pct + '%"></i></div>' +
        '<div class="tiny muted" style="margin:4px 0 10px">' +
          (measured
            ? hp.toLocaleString() + ' / ' + max.toLocaleString() + ' HP · resets weekly'
            : 'Unmeasured — your first strike of the week sets the quarry\'s size') + '</div>' +
        (downed
          ? (claimed
            ? '<div class="tiny" style="color:var(--gold-2)">Chest claimed — a new quarry rises next week.</div>'
            : '<button class="btn btn-primary btn-sm" onclick="window.HearthriseRaids.claim()">Claim raid chest</button>')
          : '<button class="btn ' + (struckToday ? '' : 'btn-primary') + ' btn-sm" ' + (struckToday ? 'disabled' : '') +
            ' onclick="window.HearthriseRaids.strike()">' +
            (struckToday ? 'Struck today — return tomorrow' : 'Strike the boss (1/day)') + '</button>') +
      '</div>';
  }

  /* ══════════════════════════════════════════════════════════════
     12. THE BLUEPRINT GATE, client half (§10.2)

     Castle tiers 4 and 5 require a Hunt clear at the matching tier inside 28
     days. clan_tier_up enforces it server-side (the clan-seat migration reads
     clan_raids.tier defensively; this wave's migration is what creates that
     column, so the gate goes live the moment both are applied). This is the
     client's read of the same rule, exposed so the castle panel can grey a
     button and say WHY instead of letting the player press it and be refused.
     ══════════════════════════════════════════════════════════════ */
  var HUNT_GATE_MS = 28 * 24 * 3600 * 1000;
  function huntGateMet(rows, requiredTier, nowMs) {
    var req = Math.max(0, requiredTier | 0);
    if (req <= 0) return true;
    var now = Number(nowMs) || Date.now();
    return (rows || []).some(function (r) {
      if (!r || !r.downed_at) return false;
      var at = Date.parse(r.downed_at);
      if (!isFinite(at) || now - at > HUNT_GATE_MS) return false;
      return (r.tier == null ? 1 : (+r.tier || 1)) >= req;
    });
  }
  async function recentClears(days) {
    if (!inClan()) return [];
    var since = new Date(Date.now() - (days || 28) * 86400000).toISOString();
    try {
      var url = cfg().url + '/rest/v1/clan_raids?clan_id=eq.' + window.G.clanId +
        '&downed_at=gte.' + encodeURIComponent(since) + '&select=week_key,tier,downed_at,boss_id';
      var res = await fetch(url, { headers: headers() });
      return res.ok ? await res.json() : [];
    } catch (e) { return []; }
  }

  function boot() {
    try {
      ensureState();
      render();
      setInterval(function () {
        var p = document.getElementById('panel-events') || document.getElementById('panel-dungeons');
        if (p && p.classList.contains('active')) render();
      }, 15000);
      // re-render when the Events tab is shown (or the legacy dungeons route)
      document.addEventListener('click', function (e) {
        var t = e.target && e.target.closest && e.target.closest('[data-tab="events"],[data-tab="dungeons"]');
        if (t) setTimeout(render, 150);
      });
    } catch (e) {}
  }
  // b224: raids are a signed-in social surface, and this boot renders against
  // the engine's state — so it waits for the account wall like the other
  // first-run flows. (The null-deref fix at render() stands on its own: it was
  // a latent bug for any early caller, gate or no gate.)
  function arm() {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 400); });
    else setTimeout(boot, 400);
  }
  if (window.HearthriseGate && typeof window.HearthriseGate.whenOpen === 'function') window.HearthriseGate.whenOpen(arm);
  else arm();

  window.HearthriseRaids = {
    BOSSES: BOSSES,
    HUNT_TIERS: HUNT_TIERS,
    BANDS: BANDS,
    bossOfWeek: bossOfWeek,
    bossesForTier: bossesForTier,
    bossById: bossById,
    simulateStrike: simulateStrike,
    strike: strike,
    declare: declare,
    claim: claim,
    claimGrace: claimGrace,
    graceOpen: graceOpen,
    ensureState: ensureState,
    render: render,
    weekKey: weekKey,
    dayKey: dayKey,
    canStrike: canStrike,
    canDeclare: canDeclare,
    tierCeiling: tierCeiling,
    castleState: castleState,
    recentClears: recentClears,
    // Pure Hunt maths — no I/O. The castle panel and the suite share these.
    tierDef: tierDef, tierName: tierName, tierRoman: tierRoman,
    poolFor: poolFor, strikeClamp: strikeClamp, maxHuntTier: maxHuntTier,
    medianContribution: medianContribution, bandFor: bandFor,
    partialFactor: partialFactor, previewScale: previewScale,
    soloPoolFor: soloPoolFor, chestFor: chestFor, soloChestFor: soloChestFor,
    huntGateMet: huntGateMet,
    weekStartMs: weekStartMs, prevWeekKey: prevWeekKey, GRACE_MS: GRACE_MS,
    raidPower: raidPower, raidPowerMult: raidPowerMult,
    MIN_STRIKES_FOR_CHEST: MIN_STRIKES_FOR_CHEST, MEDIAN_MIN_STRIKES: MEDIAN_MIN_STRIKES,
    PARTIAL_CAP: PARTIAL_CAP, SOLO_SCALE: SOLO_SCALE,
    SOLO_POOL_MIN: SOLO_POOL_MIN, SOLO_POOL_MAX: SOLO_POOL_MAX, SOLO_POOL_MULT: SOLO_POOL_MULT,
    SOLO_CLAMP_FRAC: SOLO_CLAMP_FRAC, HUNT_GATE_MS: HUNT_GATE_MS,
    CLAN_POOL_HP: CLAN_POOL_HP,
    // Asset pass (b224+) — the six painted boss portraits + the render helper,
    // exposed so the suite can verify the wiring without needing a full DOM/
    // clan-state render.
    BOSS_PORTRAIT: BOSS_PORTRAIT,
    bossPortraitHtml: bossPortraitHtml,
    // Server-contract seams — pure, no I/O. Exposed for the regression suite.
    _reduceStrike: reduceStrike,
    _reduceClaim: reduceClaim,
    _reduceDeclare: reduceDeclare,
    _strikeErrorText: strikeErrorText,
    _claimErrorText: claimErrorText,
    _declareErrorText: declareErrorText,
    _adoptClock: function (o) { adoptWeek(o && o.week); adoptDay(o && o.day); },
    _clockFix: function () { return clockFix; },
    _resetClock: function () { clockFix = { week: null, day: null }; },
    _invalidate: invalidate
  };
})();
