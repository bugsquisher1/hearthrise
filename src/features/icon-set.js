// ============================================================
// src/features/icon-set.js  (rebuilt b217)
//
// ONE icon language for the whole game: game-icons.net line art, recolored to
// parchment, drawn either as a bare gilt glyph (UI chrome) or seated in a
// medallion (subjects — skills, monsters, currencies).
//
// b217 changed two things that were quietly undermining the whole look:
//
//   1. PATHS ARE NOW BAKED (src/data/glyphs.js). This module used to fetch
//      every icon from raw.githubusercontent.com on boot and cache it in
//      localStorage. That meant a player's first session showed emoji
//      fallbacks until the network came back, an offline player never saw the
//      icon set at all, and the icon vocabulary silently depended on a third
//      party staying up. Now the paths ship with the build and draw on the
//      first frame.
//
//   2. THERE IS A PUBLIC RENDER API (`HR.icon` / `HR.medallion`). The emoji
//      that survived earlier purges survived because the only cleanup tool was
//      a regex that stripped pictographs out of already-rendered DOM. Stripping
//      leaves a hole; it doesn't give the renderer anything to draw. Render
//      sites now ask for a glyph by name instead.
//
// Source: game-icons.net (CC BY 3.0) — credited in Settings > About.
// ============================================================
(function () {
  'use strict';

  var paths = window.HR_GLYPHS || {};
  var monPaths = window.HR_MONSTER_GLYPHS || {};

  // Category accent per key — the medallion ring colour. Roles are fixed:
  // oxblood = combat, moss = gathering, sapphire = arcane/premium, gilt =
  // economy + everything else. Nothing else gets to introduce a hue.
  var ACCENT = {
    attack: '--red', strength: '--red', defense: '--red', hitpoints: '--red',
    ranged: '--red', bountyHunter: '--red',
    magic: '--gem', prayer: '--gem', gems: '--gem',
    woodcutting: '--green', mining: '--green', fishing: '--green',
    farming: '--green', foraging: '--green',
    cooking: '--gold', crafting: '--gold', smithing: '--gold', gold: '--gold'
  };

  // Aliases so callers can ask for the thing they mean ("log", "coin") rather
  // than the atlas key. Keeps render sites readable.
  var ALIAS = {
    coin: 'gold', money: 'gold', gp: 'gold', gem: 'gems', diamond: 'gems',
    log: 'uiLog', wood: 'uiLog', plank: 'uiPlank', ore: 'uiOre', bar: 'uiBar',
    ingot: 'uiBar', stone: 'uiOre', brick: 'uiOre', fish: 'uiFish',
    bone: 'uiBone', seed: 'uiSeed', herb: 'uiHerb', tree: 'uiTree',
    lock: 'uiLock', locked: 'uiLock', check: 'uiCheck', close: 'uiClose',
    search: 'uiSearch', info: 'uiInfo', warn: 'uiWarn', chat: 'uiChat',
    clock: 'uiClock', time: 'uiClock', star: 'uiStar', idle: 'uiIdle',
    spark: 'uiSpark', trend: 'uiTrend', xp: 'uiXp', crown: 'uiCrown',
    shield: 'uiShield', heart: 'uiHeart', hp: 'uiHeart', skull: 'uiSkull',
    target: 'uiTarget', scroll: 'uiScroll', quest: 'uiQuests', gift: 'uiGift',
    chest: 'uiChest', castle: 'uiCastle', camp: 'uiCamp', anvil: 'uiAnvil',
    forge: 'uiAnvil', pot: 'uiPot', kitchen: 'uiPot', bed: 'uiBed',
    barn: 'uiBarn', well: 'uiWell', people: 'uiPeople', clan: 'uiPeople',
    hammer: 'uiHammer', book: 'uiBook', sprout: 'uiSprout', noads: 'uiNoAds',
    hourglass: 'uiHourglass', key: 'uiKey', door: 'uiDoor', map: 'uiMap',
    paw: 'uiPaw', pet: 'uiPaw', egg: 'uiEgg', potion: 'uiPotion',
    food: 'uiFood', meat: 'uiFood', fire: 'uiFire', flame: 'uiFlame',
    leaf: 'uiLeaf', sword: 'uiSword', bow: 'uiBow', staff: 'uiStaff',
    helm: 'uiHelm', head: 'uiHelm', boots: 'uiBoots', feet: 'uiBoots',
    gloves: 'uiGloves', hands: 'uiGloves', ring: 'uiRing', amulet: 'uiAmulet',
    neck: 'uiAmulet', cape: 'uiCape', back: 'uiCape', body: 'uiBody',
    chestArmour: 'uiBody', legs: 'uiLegs', arrow: 'uiArrow', ammo: 'uiArrow',
    wheat: 'uiWheat', carrot: 'uiCarrot', potato: 'uiPotato',
    tomato: 'uiTomato', pumpkin: 'uiPumpkin', corn: 'uiCorn',
    turnip: 'uiTurnip', pickaxe: 'uiPickaxe', axe: 'uiAxe', rod: 'uiRod',
    worker: 'uiWorker', raid: 'uiRaid', event: 'uiEvent', trophy: 'uiTrophy',
    medal: 'uiMedal', banner: 'uiBanner', home: 'uiHome', house: 'uiHome',
    token: 'token', tokens: 'token', settings: 'uiSettings', edit: 'uiEdit',
    save: 'uiSave', bell: 'uiBell', trash: 'uiTrash', plus: 'uiPlus'
  };

  function resolve(key) {
    if (!key) return null;
    if (paths[key]) return key;
    var a = ALIAS[key];
    if (a && paths[a]) return a;
    return null;
  }

  function ensureStyle() {
    if (document.getElementById('hr-iconset-css')) return;
    var s = document.createElement('style');
    s.id = 'hr-iconset-css';
    s.textContent = [
      // Medallion — a struck-metal disc. Subjects only (skills, monsters,
      // currencies), never chrome, so a medallion always means "this is a
      // thing in the world" rather than "this is a control".
      '.hr-med{display:inline-grid;place-items:center;width:var(--sz,40px);height:var(--sz,40px);border-radius:50%;',
      'background:radial-gradient(circle at 38% 28%,#2e2418,#15100a 78%);',
      'border:1px solid color-mix(in srgb,var(--ring,#c9a24a) 55%,transparent);',
      'box-shadow:inset 0 1px 0 rgba(255,232,190,.13),inset 0 -2px 4px rgba(0,0,0,.55),0 1px 2px rgba(0,0,0,.5);',
      'vertical-align:middle;flex:0 0 auto}',
      '.hr-med svg{width:60%;height:60%;display:block;filter:drop-shadow(0 1px 0 rgba(0,0,0,.55))}',
      '.skill-tile .sicon .hr-med,.sk-icon .hr-med{--sz:34px}',
      // Flat glyph — chrome. No frame, no fill, inherits colour.
      '.hr-glyph{display:inline-flex;align-items:center;justify-content:center;',
      'width:var(--gsz,18px);height:var(--gsz,18px);vertical-align:-.14em;flex:0 0 auto}',
      '.hr-glyph svg{width:100%;height:100%;display:block}',
      // Inline glyph sitting next to a number (costs, rewards, requirements).
      '.hr-inline{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}',
      '.hr-inline .hr-glyph{--gsz:14px}'
    ].join('');
    document.head.appendChild(s);
  }

  // ── public render helpers ────────────────────────────────────────────────
  function svgFor(d, fill) {
    return '<svg viewBox="0 0 512 512" aria-hidden="true" focusable="false">' +
      '<path fill="' + fill + '" d="' + d + '"/></svg>';
  }

  function medallion(key, px) {
    var k = resolve(key); if (!k) return null;
    ensureStyle();
    var ring = 'var(' + (ACCENT[k] || '--gold') + ',#c9a24a)';
    return '<span class="hr-med" style="--sz:' + (px || 40) + 'px;--ring:' + ring + '">' +
      svgFor(paths[k], '#e6d6b4') + '</span>';
  }

  function medallionMon(id, px) {
    var d = monPaths[id]; if (!d) return null;
    ensureStyle();
    return '<span class="hr-med" style="--sz:' + (px || 40) + 'px;--ring:var(--red,#b23a2c)">' +
      svgFor(d, '#e6d6b4') + '</span>';
  }

  // Flat gilt glyph for chrome. `color` may be a token name (--gold) or any
  // CSS colour; default inherits so glyphs tint with their button's state.
  function glyph(key, sizePx, color) {
    var k = resolve(key); if (!k) return null;
    ensureStyle();
    var col = !color ? 'currentColor'
      : (color.charAt(0) === '-' ? 'var(' + color + ',#c9a24a)' : color);
    return '<span class="hr-glyph" style="--gsz:' + (sizePx || 18) + 'px;color:' + col + '">' +
      svgFor(paths[k], 'currentColor') + '</span>';
  }

  // Glyph + value, for costs and rewards ("<coin> 400"). One helper means
  // every cost in the game reads the same way.
  function amount(key, value, sizePx, color) {
    var g = glyph(key, sizePx || 14, color);
    return '<span class="hr-inline">' + (g || '') +
      '<span class="hr-amt">' + value + '</span></span>';
  }

  // ── DOM sweeps (legacy render sites that build HTML strings) ─────────────
  function paintSkills() {
    ensureStyle();
    document.querySelectorAll('.skill-tile, .skill-card').forEach(function (el) {
      var oc = el.getAttribute('onclick') || '';
      var m = oc.match(/openSkillDetail\('([^']+)'\)/) || oc.match(/showSkill\('([^']+)'\)/);
      if (!m || !paths[m[1]]) return;
      var iconEl = el.querySelector('.sicon, .icon');
      if (!iconEl || iconEl.querySelector('.hr-med')) return;
      var mv = medallion(m[1], 34);
      if (mv) iconEl.innerHTML = mv;
    });
  }

  function monIdByName(nm) {
    if (!window.MONSTERS) return null;
    nm = (nm || '').trim().toLowerCase();
    for (var id in window.MONSTERS) {
      if ((window.MONSTERS[id].name || '').toLowerCase() === nm) return id;
    }
    return null;
  }
  function paintMonsters() {
    if (!window.MONSTERS) return;
    ensureStyle();
    document.querySelectorAll('.monster-row, .mon-row').forEach(function (el) {
      var iconEl = el.querySelector('.mi, .mon-icon, .m-icon');
      if (!iconEl || iconEl.querySelector('.hr-med')) return;
      // Painted portrait art wins when the monster has one — the medallion is
      // the fallback, not a replacement for shipped art.
      if (iconEl.querySelector('img')) return;
      var id = null;
      var oc = el.getAttribute('onclick') || '';
      var m = oc.match(/startCombat\('([^']+)'\)/) || oc.match(/openMonster\('([^']+)'\)/);
      if (m) id = m[1];
      if (!id) { var nmEl = el.querySelector('.mn, .mon-name, .m-name'); if (nmEl) id = monIdByName(nmEl.textContent); }
      if (!id || !monPaths[id]) return;
      var mv = medallionMon(id, 40);
      if (mv) iconEl.innerHTML = mv;
    });
  }

  var TOPBAR_MAP = { 'CL': ['combatLvl', '--gold-2'], 'TL': ['totalLvl', '--gold-2'], 'Gold': ['gold', '--gold'], 'Gems': ['gems', '--gem'] };
  function paintTopbar() {
    document.querySelectorAll('.topbar .t-stat').forEach(function (st) {
      var lab = st.querySelector('.lab'), ic = st.querySelector('.ic');
      if (!lab || !ic) return;
      var m = TOPBAR_MAP[(lab.textContent || '').trim()];
      if (!m || !paths[m[0]] || ic.querySelector('.hr-glyph')) return;
      var g = glyph(m[0], 16, m[1]);
      if (g) ic.innerHTML = g;
    });
  }

  var NAV_MAP = {
    profile: 'navProfile', character: 'navCharacter', combat: 'navCombat', bounty: 'navBounty',
    skills: 'navSkills', inventory: 'navInventory', shop: 'navStore', farming: 'navFarm',
    house: 'navHouse', social: 'navSocial', more: 'navMore', stable: 'navStable',
    market: 'navMarket', dungeons: 'navDungeons', events: 'uiEvent',
    // b225 (#18): the Clan Seat's own nav entry. `uiCastle` and not a banner or
    // a shield — the destination is a keep you build, and it has to read as a
    // different KIND of thing from navSocial's podium sitting under it.
    clan: 'uiCastle',
    // b230: one door for all three shops. `navStore` (a shopfront) and not
    // `navMarket` (a balance) or `gems` — the entry has to read as a PLACE you
    // walk into, the way the other two Realm entries are a castle and a
    // podium; a balance names one of the three toggles behind the door, not
    // the door. `shop`/`market` stay mapped below for any host that still
    // paints an old button.
    shops: 'navStore'
  };
  function paintNav() {
    document.querySelectorAll('.nav-btn[data-tab], .bn-btn[data-tab]').forEach(function (btn) {
      var key = NAV_MAP[btn.getAttribute('data-tab')];
      if (!key || !paths[key]) return;
      var ic = btn.querySelector('.ic');
      if (!ic || ic.querySelector('.hr-glyph')) return;
      // Nav glyphs inherit the button's colour so the active state actually
      // reads on the icon too, instead of every icon being the same gold.
      var g = glyph(key, 19, null);
      if (g) ic.innerHTML = g;
    });
  }

  var UI_BTN_MAP = { 'btn-notif': 'uiBell', 'btn-settings': 'uiSettings' };
  function paintUiButtons() {
    Object.keys(UI_BTN_MAP).forEach(function (id) {
      var btn = document.getElementById(id);
      var key = UI_BTN_MAP[id];
      if (!btn || !paths[key] || btn.querySelector('.hr-glyph')) return;
      var g = glyph(key, 16, '--gold-2');
      if (!g) return;
      Array.prototype.slice.call(btn.childNodes).forEach(function (n) {
        if (n.nodeType === 3) n.remove();
      });
      btn.insertAdjacentHTML('afterbegin', g);
    });
    // b316: the rail Settings footer actions (desktop sidebar + landscape
    // bottom-nav rail). Not data-tab nav entries (Settings is a modal), so
    // paintNav skips them — paint the gilt gear into each .ic, inheriting the
    // button's colour like the other nav glyphs.
    document.querySelectorAll('#btn-settings-rail .ic, #btn-settings-rail-m .ic').forEach(function (railSet) {
      if (paths.uiSettings && !railSet.querySelector('.hr-glyph')) {
        var sg = glyph('uiSettings', 19, null);
        if (sg) railSet.innerHTML = sg;
      }
    });
    var qic = document.querySelector('#hr-quests-btn .hr-q-ic');
    if (qic && paths.uiQuests && !qic.querySelector('.hr-glyph')) {
      var qg = glyph('uiQuests', 14, '--gold-2');
      if (qg) qic.innerHTML = qg;
    }
    var flame = document.querySelector('.streak-badge .flame');
    if (flame && paths.uiFlame && !flame.querySelector('.hr-glyph')) {
      var fg = glyph('uiFlame', 14, '--red');
      if (fg) flame.innerHTML = fg;
    }
  }

  // Last-resort sweep for legacy render sites not yet migrated to HR.icon().
  // Stripping is strictly worse than drawing the right glyph, so this list
  // should shrink over time, never grow.
  var EMOJI_RE = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;
  function stripChromeEmoji() {
    document.querySelectorAll(
      '.chips .chip, .cmt-btn, .imt-btn, .ams-btn, #more-modal .mm-item, #more-modal button, .card-title, #panel-bounty .si, #panel-bounty .price, #panel-bounty .ic'
    ).forEach(function (el) {
      if (el.dataset.hrDeemoji) return;
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      var n, touched = false;
      while ((n = walker.nextNode())) {
        if (EMOJI_RE.test(n.nodeValue)) {
          n.nodeValue = n.nodeValue.replace(EMOJI_RE, '').replace(/^\s+/, '');
          touched = true;
        }
      }
      if (touched || el.textContent.trim()) el.dataset.hrDeemoji = '1';
    });
  }

  function paintAll() {
    paintSkills(); paintMonsters(); paintTopbar();
    paintNav(); paintUiButtons(); stripChromeEmoji();
  }

  ensureStyle();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintAll);
  else paintAll();
  setInterval(paintAll, 1200);

  var api = {
    icon: glyph,            // chrome glyph
    medallion: medallion,   // subject medallion
    medallionMon: medallionMon,
    amount: amount,         // glyph + value pair
    has: function (k) { return !!resolve(k); },
    path: function (k) { var r = resolve(k); return r ? paths[r] : null; },
    repaint: paintAll
  };
  window.HearthriseIconSet = api;
  // Short alias — render sites call HR.icon('coin', 14).
  window.HR = Object.assign(window.HR || {}, api);
})();
