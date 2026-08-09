// Character page renderer — the combined Character screen (b229 rework).
//
// Three sub-tabs, Skills default:
//   • Skills    — the OSRS-our-own skills grid (relocated #skills-list) + the
//                 skill's activity detail (#skill-detail), reusing the existing
//                 activities-grid renderers by id. Each tile routes to its
//                 activity via the existing openSkillDetail / quest-nav seam.
//   • Equipment — window.buildTibiaDoll() reused WHOLESALE (its internal
//                 Equipment / Stats / Companion panes come free, _tdPane intact).
//   • Hero      — identity header + the OSRS-style Account stat grid (every cell
//                 a real source) + Melee/Ranged/Magic breakdown + best rates.
//
// The old two-screen split (separate Skills tab) folds in here: showTab('skills')
// is aliased to Character/Skills, and the live-progress guards in legacy.js are
// broadened via isSkillsVisible() so the training bar keeps moving with the
// Character screen open on the Skills sub-tab.
//
// Imports: SKILLS_DEF, action tables
// Exports: setupCharacterPage()

import { SKILLS_DEF } from '../data/skills.js?v=230';
import { TREES, ROCKS, FISH_SPOTS, CROPS, EQUIP_SLOTS } from '../data/gathering.js?v=230';
import { ARTISAN_RECIPES } from '../data/recipes.js?v=230';

function deriveClass() {
  const G = window.G;
  if (!G?.skills) return { name: 'Adventurer', tagline: 'Path: Wanderer' };
  const entries = Object.entries(G.skills);
  if (entries.length === 0) return { name: 'Adventurer', tagline: 'Path: Wanderer' };
  const top = entries.reduce((a, b) => ((b[1] || 0) > (a[1] || 0) ? b : a));
  const topId = top[0];
  const topXp = top[1];
  const classMap = {
    attack: 'Warrior', strength: 'Berserker', defense: 'Guardian', hitpoints: 'Brawler',
    prayer: 'Devotee', magic: 'Mage', ranged: 'Ranger', bountyHunter: 'Bounty Hunter',
    woodcutting: 'Lumberjack', mining: 'Miner', fishing: 'Angler', farming: 'Farmhand',
    cooking: 'Chef', crafting: 'Artificer', smithing: 'Smith',
  };
  const cn = classMap[topId] || 'Adventurer';
  let tag;
  if (topXp < 100) tag = 'Path: ' + cn;
  else if (topXp < 1000) tag = 'Aspiring ' + cn;
  else if (topXp < 10000) tag = 'Skilled ' + cn;
  else tag = 'Master ' + cn;
  return { name: cn, tagline: tag };
}

// b221: the identity seam owns the portrait now — it resolves the player's
// uploaded avatar and falls back to the painted default, so this never
// renders a broken image. Reading the topbar <img> first was a hidden
// dependency on DOM order; it stays only as a last resort.
function getActiveAvatar() {
  const id = window.HearthriseIdentity;
  if (id && typeof id.getAvatarUrl === 'function') {
    const u = id.getAvatarUrl();
    if (u) return u;
  }
  const pa = document.querySelector('.player-avatar img');
  if (pa?.src) return pa.src;
  // b186: painted player portrait (was an unshipped raw-bundle path → 404)
  return window._playerAvatar || 'assets/icons-bundle/painted/npc/player.png';
}

// b214 lesson, applied preventatively: a display name is player-supplied
// text and this file interpolates it into innerHTML. It is self-only today,
// but a name that survives a cloud restore is a name that arrived over the
// network — escape it at the boundary, every time.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function playerName() {
  const id = window.HearthriseIdentity;
  if (id && typeof id.getDisplayName === 'function') {
    const n = id.getDisplayName();
    if (n) return n;
  }
  return window.G?.playerName || 'Adventurer';
}

function getEquipmentBonusFor(style) {
  const s = { str: 0, atk: 0, def: 0, crit: 0 };
  const G = window.G;
  if (!G?.equipment) return s;
  for (const id of Object.values(G.equipment)) {
    const it = window.ITEMS?.[id];
    if (!it) continue;
    if (style === 'melee') { s.str += it.strB || 0; s.atk += it.atkB || 0; }
    else if (style === 'ranged') { s.str += it.rangeStrB || 0; s.atk += it.rangeAtkB || 0; }
    else if (style === 'magic') { s.str += it.magicStrB || 0; s.atk += it.magicAtkB || 0; }
    s.def += it.defB || 0;
    s.crit += it.critB || 0;
  }
  if (typeof window.getCompanionBonus === 'function') {
    const cb = window.getCompanionBonus();
    if (style === 'melee') { s.str += cb.strB || 0; s.atk += cb.atkB || 0; }
    if (style === 'ranged') { s.str += cb.rangeStrB || 0; s.atk += cb.rangeAtkB || 0; }
    if (style === 'magic') { s.str += cb.magicStrB || 0; s.atk += cb.magicAtkB || 0; }
    s.def += cb.defB || 0;
    s.crit += cb.crit || 0;
  }
  return s;
}

/* b226: one rate calculator for the whole game (legacy.js actionRate). The
   fallback is only for the boot window before legacy publishes it. */
const rateOf = (skillId, action) => {
  if (typeof window.actionRate === 'function') {
    const r = window.actionRate(skillId, action);
    if (r) return r.xpPerHour;
  }
  return Math.floor(3600000 / Math.max(500, action.ms || 3000) * (action.xp || 0));
};

function gatherRates() {
  const skills = ['woodcutting', 'mining', 'fishing', 'farming', 'cooking', 'smithing', 'crafting'];
  const TABLES = {
    woodcutting: TREES, mining: ROCKS, fishing: FISH_SPOTS,
    farming: Object.values(CROPS),
  };
  const out = [];
  for (const id of skills) {
    const lv = typeof window.getLevel === 'function' ? window.getLevel(id) : 1;
    const actions = TABLES[id];
    if (actions?.length) {
      const unlocked = actions.filter((a) => lv >= (a.req || 1));
      if (unlocked.length) {
        const best = unlocked.reduce((a, b) => ((b.xp / b.ms * 1000) > (a.xp / a.ms * 1000) ? b : a));
        /* b226: window.actionRate is the single rate calculator — pace, tools,
           perks and presence — so no readout can quote a number the engine
           will not pay. */
        out.push({ id, lv, action: best.name, xpHr: rateOf(id, best), icon: SKILLS_DEF[id]?.icon || '?' });
        continue;
      }
    }
    if (ARTISAN_RECIPES[id]) {
      const rec = ARTISAN_RECIPES[id].filter((r) => lv >= (r.req || 1));
      if (rec.length) {
        const b = rec.reduce((a, b) => ((b.xp / b.ms * 1000) > (a.xp / a.ms * 1000) ? b : a));
        out.push({ id, lv, action: b.name, xpHr: rateOf(id, b), icon: SKILLS_DEF[id]?.icon || '?' });
      }
    }
  }
  return out;
}

const fmt = (n) => {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return Math.floor(n || 0).toLocaleString();
};

/* Time played reads as "3h 24m" — the OSRS figure, our own words. */
function fmtDuration(ms) {
  const s = Math.floor((ms || 0) / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h >= 1) return h + 'h ' + m + 'm';
  if (m >= 1) return m + 'm';
  return s + 's';
}

/* b226 — the Founder's mark (pacing-overhaul §9.3). A title, set in the
   display face, on the account of anyone who was playing before the retune.
   Display only: it is read from nothing but `createdAt` and it is queried by
   nothing but this line, so it cannot leak into a bonus, a gate or a price.
   Type, not emoji — it is a mark of standing, not a sticker. */
function founderMarkHtml() {
  const title = (typeof window.founderTitle === 'function') ? window.founderTitle() : '';
  if (!title) return '';
  return `<div class="cr-founder" title="Your save predates the pacing retune of the First Season.">${esc(title)}</div>`;
}

/* b217: section titles carried raw emoji. All resolve through the shipped icon
   set now. */
const crGlyph = (key, px) =>
  (window.HR && window.HR.icon) ? (window.HR.icon(key, px || 15, 'currentColor') || '') : '';

function buildHeroCard() {
  const G = window.G;
  const avatarSrc = getActiveAvatar();
  const cls = deriveClass();
  const name = esc(playerName());
  const cl = typeof window.getCombatLevel === 'function' ? window.getCombatLevel() : '?';
  const tl = typeof window.getTotalLevel === 'function' ? window.getTotalLevel() : '?';
  const gold = G.gold || 0;
  const kills = G.stats?.kills || 0;
  // b127: actual fields are G.playerHp / G.playerMaxHp.
  const hp = (typeof G.playerHp === 'number') ? G.playerHp
           : (typeof G.hp === 'number') ? G.hp : '—';
  const maxHp = (typeof G.playerMaxHp === 'number') ? G.playerMaxHp
              : (typeof window.getMaxHp === 'function') ? window.getMaxHp()
              : '—';
  // b229: renown rank rides the identity block — the Hero screen is where a
  // player checks their standing, and the ladder itself stays on Home.
  let rankLine = '';
  try {
    const rn = window.HearthriseRenown && window.HearthriseRenown.getState(G);
    if (rn && rn.rank) rankLine = `<div class="cr-build">Standing: <span>${esc(rn.rank.name)}</span></div>`;
  } catch (e) { /* renown optional */ }

  return `<div class="cr-hero">
    <div class="cr-hero-portrait"><img src="${avatarSrc}" alt="" data-no-fallback /></div>
    <div class="cr-hero-id">
      <div class="cr-name">${name}</div>
      ${founderMarkHtml()}
      <div class="cr-class">${cls.tagline}</div>
      <div class="cr-build">HP: <span>${hp} / ${maxHp}</span></div>
      ${rankLine}
    </div>
    <div class="cr-hero-stats">
      <div class="cr-hero-stat"><b>${cl}</b><span>Combat Lv</span></div>
      <div class="cr-hero-stat"><b>${tl}</b><span>Total Lv</span></div>
      <div class="cr-hero-stat"><b>${fmt(gold)}</b><span>Gold</span></div>
      <div class="cr-hero-stat"><b>${fmt(kills)}</b><span>Kills</span></div>
    </div>
  </div>`;
}

/* The OSRS-our-own Account panel. Every cell is a REAL source (spec §5). Total
   XP and Time Played sit behind a "click to reveal" the way OSRS hides its
   precise figures — the reveal state is a session field so it survives the 2s
   auto-refresh. Time Played reads the b229 G.stats.playMs accumulator. */
function buildAccountStatGrid() {
  const G = window.G || {};
  const clv = typeof window.getCombatLevel === 'function' ? window.getCombatLevel() : '?';
  const tlv = typeof window.getTotalLevel === 'function' ? window.getTotalLevel() : '?';
  const totalXp = Object.values(G.skills || {}).reduce((a, b) => a + (b || 0), 0);
  const quests = Array.isArray(G.quests) ? G.quests : [];
  const qDone = quests.filter((q) => q && q.done).length;
  const ach = Array.isArray(window.ACHIEVEMENTS) ? window.ACHIEVEMENTS : [];
  const achDone = Object.values(G.achievements || {}).filter((e) => e && e.unlocked).length;
  const bounties = (G.bountyHunter && G.bountyHunter.completed) || 0;
  let colPct = '0%';
  try {
    if (window.HearthriseCollection && window.HearthriseCollection.getStats) {
      colPct = Math.round(window.HearthriseCollection.getStats(G).overall * 100) + '%';
    }
  } catch (e) { /* collection optional */ }
  let rank = '—';
  try {
    const rn = window.HearthriseRenown && window.HearthriseRenown.getState(G);
    if (rn && rn.rank) rank = rn.rank.name;
  } catch (e) { /* renown optional */ }
  const playMs = (G.stats && G.stats.playMs) || 0;
  const reveal = window._charReveal || (window._charReveal = { xp: false, time: false });

  const cell = (val, label) => `<div class="cr-acct-cell"><b>${val}</b><span>${label}</span></div>`;
  const xpCell = reveal.xp
    ? `<div class="cr-acct-cell reveal" data-reveal="xp"><b>${fmt(totalXp)}</b><span>Total XP</span></div>`
    : `<div class="cr-acct-cell reveal" data-reveal="xp"><b>••••</b><span>Total XP · reveal</span></div>`;
  const timeCell = reveal.time
    ? `<div class="cr-acct-cell reveal" data-reveal="time"><b>${fmtDuration(playMs)}</b><span>Time played</span></div>`
    : `<div class="cr-acct-cell reveal" data-reveal="time"><b>••••</b><span>Time played · reveal</span></div>`;

  return `<div class="cr-card cr-acct"><div class="cr-section-title">${crGlyph('uiShield')}Account</div>
    <div class="cr-acct-grid">
      ${cell(clv, 'Combat Lv')}
      ${cell(tlv, 'Total Lv')}
      ${xpCell}
      ${cell(qDone + ' / ' + quests.length, 'Quests')}
      ${cell(achDone + ' / ' + ach.length, 'Achievements')}
      ${cell(fmt(bounties), 'Bounties')}
      ${cell(colPct, 'Collections')}
      ${cell(esc(rank), 'Renown')}
      ${timeCell}
    </div></div>`;
}

function buildCombatCard() {
  const lv = (id) => (typeof window.getLevel === 'function' ? window.getLevel(id) : 0);
  const styleCard = (title, icon, lvAtk, lvStr, lvDef, st) =>
    `<div class="cr-card"><div class="cr-section-title">${icon}${title}</div>
      <div class="cr-style-stats">
        <div class="cr-stat-row"><span>Attack</span><b>Lv ${lvAtk}</b><span class="cr-bonus">+${st.atk}</span></div>
        <div class="cr-stat-row"><span>Strength</span><b>Lv ${lvStr}</b><span class="cr-bonus">+${st.str}</span></div>
        <div class="cr-stat-row"><span>Defense</span><b>Lv ${lvDef}</b><span class="cr-bonus">+${st.def}</span></div>
        <div class="cr-stat-row"><span>Crit</span><b>${(st.crit * 100).toFixed(0)}%</b><span class="cr-bonus"></span></div>
      </div>
    </div>`;
  return `<div class="cr-row">
    ${styleCard('Melee', crGlyph('uiSword'), lv('attack'), lv('strength'), lv('defense'), getEquipmentBonusFor('melee'))}
    ${styleCard('Ranged', crGlyph('uiBow'), lv('ranged'), lv('ranged'), lv('defense'), getEquipmentBonusFor('ranged'))}
    ${styleCard('Magic', crGlyph('uiStaff'), lv('magic'), lv('magic'), lv('defense'), getEquipmentBonusFor('magic'))}
  </div>`;
}

function buildRatesCard() {
  const rates = gatherRates();
  if (!rates.length) {
    return `<div class="cr-card"><div class="cr-section-title">${crGlyph('uiTrend')}Active Rates</div>
      <div style="color:var(--ink-3);font-size:calc(14.5px * var(--ui-scale, 1))">Train a skill to see your rates.</div></div>`;
  }
  const rows = rates.map((r) => {
    const skillIcon = window._skillIcon?.[r.id]
      ? `<img src="${window._skillIcon[r.id]}" class="cr-rate-icon" alt="" />`
      : `<span class="cr-rate-icon">${crGlyph(r.id, 18)}</span>`;
    return `<div class="cr-rate-row">${skillIcon}
      <span class="cr-rate-name">${SKILLS_DEF[r.id]?.name || r.id}</span>
      <span class="cr-rate-val">${fmt(r.xpHr)} xp/hr</span>
      <span class="cr-rate-meta">via ${r.action}</span>
    </div>`;
  }).join('');
  return `<div class="cr-card"><div class="cr-section-title">${crGlyph('uiTrend')}Best Rates by Skill</div>
    <div class="cr-rate-table">${rows}</div></div>`;
}

/* The compact identity strip that heads the Skills sub-tab — avatar, name,
   founder mark, and the two headline levels, so the front door shows who you
   are without leaving the grid. Total level lives here (the OSRS footer). */
function buildSkillsIdStrip() {
  const G = window.G || {};
  const avatarSrc = getActiveAvatar();
  const name = esc(playerName());
  const cl = typeof window.getCombatLevel === 'function' ? window.getCombatLevel() : '?';
  const tl = typeof window.getTotalLevel === 'function' ? window.getTotalLevel() : '?';
  return `<div class="cs-id-portrait"><img src="${avatarSrc}" alt="" data-no-fallback /></div>
    <div class="cs-id-meta"><div class="cs-id-name">${name}</div>${founderMarkHtml()}</div>
    <div class="cs-id-levels">
      <div class="cs-id-lv"><b>${cl}</b><span>Combat</span></div>
      <div class="cs-id-lv"><b>${tl}</b><span>Total level</span></div>
    </div>`;
}

// ── the combined-screen shell ─────────────────────────────────────────────
const SHELL_HTML = `<div id="char-shell">
  <div class="char-subtabs">
    <button class="char-subtab" data-cpane="skills" type="button">Skills</button>
    <button class="char-subtab" data-cpane="equip" type="button">Equipment</button>
    <button class="char-subtab" data-cpane="hero" type="button">Hero</button>
  </div>
  <div class="char-pane" id="char-skills">
    <div class="cs-idstrip" id="cs-idstrip"></div>
    <div class="cs-cols">
      <div class="card cs-list"><div class="card-head"><div class="card-title">Skills</div></div>
        <div class="card-body" id="skills-list"></div></div>
      <div class="card cs-detail"><div class="card-head"><div class="card-title" id="skill-detail-title">Skill</div></div>
        <div class="card-body" id="skill-detail"><div class="empty"><span class="em-icon"></span>Tap a skill to train it.</div></div></div>
    </div>
  </div>
  <div class="char-pane" id="char-equip"></div>
  <div class="char-pane" id="char-hero"></div>
</div>`;

const PANES = { skills: 'char-skills', equip: 'char-equip', hero: 'char-hero' };
function paneOf(p) { return (p === 'equip' || p === 'hero') ? p : 'skills'; }

function refreshSkillsPane() {
  const strip = document.getElementById('cs-idstrip');
  if (strip) strip.innerHTML = buildSkillsIdStrip();
  if (typeof window.renderSkillsList === 'function') window.renderSkillsList();
  const detailEl = document.getElementById('skill-detail');
  const cur = window._actLastRender && window._actLastRender.skillId;
  if (cur && typeof window.renderSkillDetail === 'function') {
    window.renderSkillDetail(cur);
  } else if (detailEl && !detailEl.querySelector('.act-grid')) {
    // Auto-open the first gathering/artisan skill, exactly like the old Skills
    // tab did — but via renderSkillDetail directly (openSkillDetail would loop
    // back through the skills→character alias and re-enter renderCharacter).
    const firstId = Object.keys(SKILLS_DEF).find((k) => SKILLS_DEF[k].cat === 'gather' || SKILLS_DEF[k].cat === 'artisan');
    if (firstId && typeof window.renderSkillDetail === 'function') window.renderSkillDetail(firstId);
  }
}

function refreshEquipPane() {
  const host = document.getElementById('char-equip');
  if (!host) return;
  // Reuse the b218 paper-doll WHOLESALE — its Equipment / Stats / Companion
  // internal panes and _tdPane persistence come free. Rebuilt each time this
  // pane is shown so it reflects the current loadout, the same way the
  // Inventory copy rebuilds; _tdPane keeps the chosen internal pane.
  host.innerHTML = '';
  if (typeof window.buildTibiaDoll === 'function') {
    const doll = window.buildTibiaDoll();
    if (doll) host.appendChild(doll);
  }
  const link = document.createElement('div');
  link.className = 'cr-equip-link';
  link.innerHTML = `<button type="button" onclick="showTab('inventory')">Full inventory →</button>`;
  host.appendChild(link);
}

function refreshHeroPane() {
  const host = document.getElementById('char-hero');
  if (!host) return;
  host.innerHTML = buildHeroCard()
    + buildAccountStatGrid()
    + buildCombatCard()
    + `<div class="cr-rates">${buildRatesCard()}</div>`;
  host.querySelectorAll('[data-reveal]').forEach((el) => {
    el.onclick = function () {
      const k = el.getAttribute('data-reveal');
      const r = window._charReveal || (window._charReveal = { xp: false, time: false });
      r[k] = true;
      refreshHeroPane();
    };
  });
}

function applyCharPane(pane) {
  const shell = document.getElementById('char-shell');
  if (!shell) return;
  shell.querySelectorAll('.char-subtab').forEach((b) => b.classList.toggle('active', b.getAttribute('data-cpane') === pane));
  Object.keys(PANES).forEach((k) => {
    const el = document.getElementById(PANES[k]);
    if (el) el.style.display = (k === pane) ? '' : 'none';
  });
}

function wireSubtabs(shell) {
  shell.querySelectorAll('.char-subtab').forEach((b) => {
    b.addEventListener('click', function () {
      window._charPane = paneOf(b.getAttribute('data-cpane'));
      // Go through window.renderCharacter (not the local fn) so every render
      // wrapper fires — chiefly identity.js's, which re-attaches the b227
      // avatar-upload affordance to the Hero portrait after each rebuild.
      (window.renderCharacter || renderCharacter)();
    });
  });
}

export function renderCharacter() {
  const panel = document.getElementById('panel-character');
  if (!panel) return;
  let shell = document.getElementById('char-shell');
  if (!shell) {
    // Build the shell ONCE. Rebuilding it every tick would wipe #skills-list /
    // #skill-detail and freeze the live bar — the whole point of the shell/
    // content split (this is the b218 snap-back lesson applied to the grid).
    panel.innerHTML = SHELL_HTML;
    shell = document.getElementById('char-shell');
    wireSubtabs(shell);
  }
  const pane = paneOf(window._charPane);
  window._charPane = pane;
  // Only the visible pane is (re)painted on the 2s refresh. The live training
  // bar itself is driven by legacy.js's skill/artisan progress intervals, which
  // gate on isSkillsVisible() — so it advances even while this refresh sleeps.
  if (pane === 'skills') refreshSkillsPane();
  else if (pane === 'equip') refreshEquipPane();
  else if (pane === 'hero') refreshHeroPane();
  applyCharPane(pane);
}

// ── the Skills → Character/Skills alias + isSkillsVisible seam ──────────────
function ensureSkillsHelper() {
  // isSkillsVisible() is the single source of truth for "the player can see a
  // training bar right now". legacy.js defines it too (so its hot-path guards
  // don't depend on ESM boot order); this is the belt-and-braces publish.
  if (typeof window.isSkillsVisible !== 'function') {
    window.isSkillsVisible = function () {
      const at = window.activeTab;
      return at === 'skills' || (at === 'character' && paneOf(window._charPane) === 'skills');
    };
  }
}

export function setupCharacterPage() {
  ensureCharStyle();
  ensureSkillsHelper();
  window.renderCharacter = renderCharacter;
  if (typeof window.showTab === 'function') {
    const orig = window.showTab;
    window.showTab = function (name) {
      // The Skills route folds into the Character screen's Skills sub-tab. Every
      // deep link (quest-nav, Home "cook", the legacy skill tiles, FTUE) funnels
      // through showTab('skills') / openSkillDetail, so aliasing here keeps them
      // all working without touching a single caller.
      if (name === 'skills') {
        window._charPane = 'skills';
        const r = orig.call(this, 'character');
        // Build the shell SYNCHRONOUSLY so #skill-detail exists before
        // openSkillDetail's deferred renderSkillDetail(id) fires (it runs on a
        // setTimeout(0), which would otherwise beat the shell into existence).
        try { renderCharacter(); } catch (e) { /* never break navigation */ }
        return r;
      }
      const r = orig.apply(this, arguments);
      if (name === 'character') {
        window._charPane = paneOf(window._charPane);
        setTimeout(renderCharacter, 30);
      }
      return r;
    };
  }
  console.log('[Character Page ESM] combined screen loaded');
}

// ── scoped styles (tokens only) ────────────────────────────────────────────
function ensureCharStyle() {
  if (document.getElementById('char-combined-css')) return;
  const s = document.createElement('style');
  s.id = 'char-combined-css';
  const R = '#panel-character ';
  s.textContent = [
    R + '#char-shell{display:flex;flex-direction:column;gap:0;min-height:0;flex:1}',
    // Sub-tab strip
    R + '.char-subtabs{display:flex;gap:6px;flex-shrink:0;border-bottom:1px solid var(--gold-2);margin-bottom:14px}',
    R + '.char-subtab{flex:0 0 auto;padding:9px 20px;border-radius:8px 8px 0 0;border:1px solid var(--line);'
      + 'border-bottom:none;background:rgba(0,0,0,.2);color:var(--ink-3);font-weight:700;font-family:var(--f-ui);'
      + 'font-size:calc(15px * var(--ui-scale, 1));cursor:pointer;letter-spacing:.02em;margin-bottom:-1px;transition:color .12s,background .12s}',
    R + '.char-subtab:hover{color:var(--ink-2)}',
    R + '.char-subtab.active{background:linear-gradient(180deg,rgba(201,162,74,.20),rgba(201,162,74,.05));'
      + 'color:var(--gold-2);border-color:var(--gold-2)}',
    R + '.char-pane{min-width:0}',
    // Skills sub-tab — identity strip + relocated two-column layout
    R + '#char-skills{display:flex;flex-direction:column;gap:14px}',
    R + '.cs-idstrip{display:flex;align-items:center;gap:14px;background:var(--bg-card);border:1px solid var(--line);'
      + 'border-radius:10px;padding:12px 16px;flex-shrink:0}',
    R + '.cs-id-portrait{width:56px;height:56px;border-radius:8px;overflow:hidden;flex:0 0 auto;'
      + 'border:1px solid var(--gold-2);background:rgba(0,0,0,.3)}',
    R + '.cs-id-portrait img{width:100%;height:100%;object-fit:cover}',
    R + '.cs-id-meta{min-width:0;flex:1}',
    R + '.cs-id-name{font-family:var(--f-display);font-size:calc(21px * var(--ui-scale, 1));font-weight:800;'
      + 'color:var(--gold-2);letter-spacing:.03em;overflow-wrap:anywhere}',
    R + '.cs-id-meta .cr-founder{margin-top:0}',
    R + '.cs-id-levels{display:flex;gap:20px;flex:0 0 auto}',
    R + '.cs-id-lv{text-align:center}',
    R + '.cs-id-lv b{display:block;font-size:calc(24px * var(--ui-scale, 1));color:var(--gold-2);font-weight:800;line-height:1;font-variant-numeric:tabular-nums}',
    R + '.cs-id-lv span{display:block;font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px}',
    R + '.cs-cols{display:grid;grid-template-columns:minmax(240px,300px) minmax(0,1fr);gap:var(--gap,12px);align-items:start;min-height:0}',
    R + '.cs-cols .card{min-width:0}',
    R + '#char-skills #skills-list{max-height:calc(100vh - 320px);overflow-y:auto}',
    R + '#char-skills #skill-detail{display:flex;flex-direction:column;gap:10px;min-height:0}',
    '@media (max-width:900px){' + R + '.cs-cols{grid-template-columns:1fr}'
      + R + '.cs-idstrip{flex-wrap:wrap}}',
    // Hero sub-tab — Account stat grid
    R + '#char-hero{display:flex;flex-direction:column;gap:12px}',
    R + '.cr-acct-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}',
    R + '.cr-acct-cell{background:rgba(0,0,0,.28);border:1px solid var(--line);border-radius:8px;padding:12px 10px;text-align:center}',
    R + '.cr-acct-cell b{display:block;font-size:calc(23px * var(--ui-scale, 1));color:var(--gold-2);font-weight:800;line-height:1.1;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}',
    R + '.cr-acct-cell span{display:block;font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em;margin-top:6px}',
    R + '.cr-acct-cell.reveal{cursor:pointer;transition:border-color .12s}',
    R + '.cr-acct-cell.reveal:hover{border-color:var(--gold-2)}',
    '@media (max-width:640px){' + R + '.cr-acct-grid{grid-template-columns:repeat(2,1fr)}}',
    // Equipment sub-tab
    R + '#char-equip{display:flex;flex-direction:column;gap:12px;align-items:center}',
    R + '.cr-equip-link{width:100%;max-width:520px}',
    R + '.cr-equip-link button{width:100%;padding:8px;background:rgba(201,162,74,.14);border:1px solid rgba(201,162,74,.32);'
      + 'border-radius:6px;color:var(--gold-2);cursor:pointer;font-size:calc(14.5px * var(--ui-scale, 1));font-weight:700;font-family:var(--f-ui)}',
    R + '.cr-equip-link button:hover{background:rgba(201,162,74,.22)}',
  ].join('\n');
  document.head.appendChild(s);
}
