// Character page renderer — the Character OVERVIEW screen (b232 rework, Tyler).
//
// Three sub-tabs, Skills default:
//   • Skills    — the character OVERVIEW: an identity banner (portrait, name,
//                 rank · renown, TOTAL LEVEL) + a dense grid of EVERY skill
//                 (icon + level + xp bar) + the Hero·Account stat panel. It does
//                 NOT embed the activity tiles — each tile routes OUT via
//                 window.hrOpenActivity: combat→Combat, farm→Farm, and every
//                 gathering/artisan skill→the standalone Adventure→Skills screen
//                 (#panel-skills) where training actually happens.
//   • Equipment — window.buildTibiaDoll() reused WHOLESALE (its internal
//                 Equipment / Stats / Companion panes come free, _tdPane intact).
//   • Hero      — identity header + the Account stat grid + Melee/Ranged/Magic
//                 breakdown + best rates.
//
// b232 REVERTED the b229 fold: activities live back under Adventure (their own
// #panel-skills), so showTab('skills') no longer aliases to Character — it lands
// on the activity screen, and isSkillsVisible() is `activeTab==='skills'` again.
//
// Imports: SKILLS_DEF, action tables
// Exports: setupCharacterPage()

import { SKILLS_DEF } from '../data/skills.js?v=302';
import { TREES, ROCKS, FISH_SPOTS, CROPS, EQUIP_SLOTS } from '../data/gathering.js?v=302';
import { ARTISAN_RECIPES } from '../data/recipes.js?v=302';

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

/* The identity banner that heads the Skills sub-tab — portrait, name, the
   rank · renown line, and TOTAL LEVEL as the headline figure on the right.
   This is the top of the character overview Tyler designed: who you are, at a
   glance, above the skills grid. */
function buildSkillsHeader() {
  const G = window.G || {};
  const avatarSrc = getActiveAvatar();
  const name = esc(playerName());
  const tl = typeof window.getTotalLevel === 'function' ? window.getTotalLevel() : '?';
  let sub = '';
  try {
    const rn = window.HearthriseRenown && window.HearthriseRenown.getState(G);
    if (rn && rn.rank) {
      const score = (rn.score != null ? rn.score : (G.renownHigh || 0));
      sub = `${esc(rn.rank.name)} · ${fmt(score)} Renown`;
    }
  } catch (e) { /* renown optional */ }
  if (!sub) sub = esc(deriveClass().tagline);
  return `<div class="csk-hero">
    <div class="csk-hero-portrait"><img src="${avatarSrc}" alt="" data-no-fallback /></div>
    <div class="csk-hero-id">
      <div class="csk-hero-name">${name}</div>
      <div class="csk-hero-sub">${sub}</div>
      ${founderMarkHtml()}
    </div>
    <div class="csk-hero-total">
      <b>${fmt(tl)}</b><span>Total level</span>
    </div>
  </div>`;
}

/* Grid order — the making/gathering skills lead (that is what the game is
   mostly about), combat trails. Any skill in SKILLS_DEF not listed here still
   renders, appended at the end, so adding a skill can never drop it silently. */
const SKILL_ORDER = [
  'woodcutting', 'mining', 'fishing', 'farming',
  'cooking', 'crafting', 'smithing',
  'attack', 'strength', 'defense', 'hitpoints',
  'magic', 'ranged', 'prayer', 'bountyHunter',
];

function orderedSkillIds() {
  const defs = window.SKILLS_DEF || SKILLS_DEF;
  const seen = new Set();
  const ids = [];
  SKILL_ORDER.forEach((id) => { if (defs[id]) { ids.push(id); seen.add(id); } });
  Object.keys(defs).forEach((id) => { if (!seen.has(id)) ids.push(id); });
  return ids;
}

function skillTile(id) {
  const defs = window.SKILLS_DEF || SKILLS_DEF;
  const s = defs[id];
  if (!s) return '';
  const G = window.G || {};
  const xp = (G.skills && G.skills[id]) || 0;
  const lv = typeof window.getLevel === 'function' ? window.getLevel(id) : 1;
  const pct = (typeof window.xpPct === 'function') ? Math.min(100, Math.max(0, window.xpPct(xp) * 100)) : 0;
  const active = (G.activeSkill === id) ? ' active' : '';
  const iconHtml = window._skillIcon && window._skillIcon[id]
    ? `<img src="${window._skillIcon[id]}" alt="" loading="lazy" />`
    : ((window.HearthriseIconSet && window.HearthriseIconSet.medallion && window.HearthriseIconSet.medallion(id, 26)) || `<span class="csk-emoji">${s.icon || ''}</span>`);
  const maxed = lv >= 99;
  return `<button type="button" class="csk-tile${active}" onclick="window.hrOpenActivity&&window.hrOpenActivity('${id}')" title="${esc(s.name)} — Level ${lv}${maxed ? ' (max)' : ', ' + Math.round(pct) + '% to next'}">
    <span class="csk-ic">${iconHtml}</span>
    <span class="csk-tile-body">
      <span class="csk-nm">${esc(s.name)}</span>
      <span class="csk-bar${maxed ? ' maxed' : ''}"><i style="width:${maxed ? 100 : pct.toFixed(1)}%"></i></span>
    </span>
    <span class="csk-lv">${lv}</span>
  </button>`;
}

function buildSkillGrid() {
  const tiles = orderedSkillIds().map(skillTile).join('');
  return `<div class="csk-grid">${tiles}</div>`;
}

// ── the combined-screen shell ─────────────────────────────────────────────
const SHELL_HTML = `<div id="char-shell">
  <div class="char-subtabs">
    <button class="char-subtab" data-cpane="skills" type="button">Skills</button>
    <button class="char-subtab" data-cpane="equip" type="button">Equipment</button>
    <button class="char-subtab" data-cpane="hero" type="button">Hero</button>
  </div>
  <div class="char-pane" id="char-skills">
    <div id="csk-header"></div>
    <div id="csk-grid-host"></div>
    <div id="csk-account"></div>
  </div>
  <div class="char-pane" id="char-equip"></div>
  <div class="char-pane" id="char-hero"></div>
</div>`;

const PANES = { skills: 'char-skills', equip: 'char-equip', hero: 'char-hero' };
function paneOf(p) { return (p === 'equip' || p === 'hero') ? p : 'skills'; }

/* The Skills sub-tab is the character OVERVIEW (Tyler's design): identity
   banner → dense grid of every skill → the Hero·Account stat panel. It does NOT
   embed the activity tiles — clicking a skill routes OUT to where you train it
   (Combat / Farm / the Adventure → Skills activity screen) via hrOpenActivity.
   The activities themselves live under Adventure, not on this screen. */
function refreshSkillsPane() {
  const header = document.getElementById('csk-header');
  if (header) header.innerHTML = buildSkillsHeader();
  const gridHost = document.getElementById('csk-grid-host');
  if (gridHost) gridHost.innerHTML = buildSkillGrid();
  const acct = document.getElementById('csk-account');
  if (acct) acct.innerHTML = buildAccountStatGrid();
  // The account panel's "click to reveal" cells (Total XP / Time played).
  if (acct) acct.querySelectorAll('[data-reveal]').forEach((el) => {
    el.onclick = function () {
      const k = el.getAttribute('data-reveal');
      const r = window._charReveal || (window._charReveal = { xp: false, time: false });
      r[k] = true;
      refreshSkillsPane();
    };
  });
}

/* Route a skill tile to where that skill is actually trained. Combat skills →
   the Combat screen; farming → the Farm; every gathering/artisan skill → the
   Adventure activity screen (openSkillDetail, which now lands on #panel-skills).
   This is the "activities live in Adventure, not on the character sheet" rule. */
window.hrOpenActivity = function (id) {
  const defs = window.SKILLS_DEF || SKILLS_DEF;
  const s = defs[id];
  if (!s) return;
  if (s.cat === 'combat') { if (typeof window.showTab === 'function') window.showTab('combat'); return; }
  if (id === 'farming') { if (typeof window.showTab === 'function') window.showTab('farming'); return; }
  if (typeof window.openSkillDetail === 'function') window.openSkillDetail(id);
  else if (typeof window.showTab === 'function') window.showTab('skills');
};

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
      // b232: only the standalone Skills activity screen shows a live bar.
      return window.activeTab === 'skills';
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
      // b232 (Tyler): the Character screen is now an OVERVIEW (grid + account),
      // and the activities live back under Adventure on their own #panel-skills
      // screen. So showTab('skills') NO LONGER aliases to Character — it lands on
      // the real Skills/activity panel (base showTab handles it, activities-grid
      // auto-opens the first skill). Every deep link (quest-nav, Home "cook",
      // openSkillDetail, FTUE) funnels through showTab('skills') and keeps
      // working, now arriving at the activity screen where training happens.
      const r = orig.apply(this, arguments);
      if (name === 'character') {
        window._charPane = paneOf(window._charPane);
        setTimeout(renderCharacter, 30);
      }
      return r;
    };
  }
  console.log('[Character Page ESM] overview screen loaded');
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
    // b230 mobile: the 3 top tabs were ~36px tall (under the 44px tap floor)
    // and the strip could not wrap. Taller padding + wrap so they never clip.
    '@media (max-width:540px),(max-height:540px) and (max-width:900px){'
      + R + '.char-subtabs{flex-wrap:wrap}'
      + R + '.char-subtab{padding:11px 16px}}',
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
    // ── Skills OVERVIEW (b232): identity banner + dense skill grid + account ──
    R + '#char-skills{display:flex;flex-direction:column;gap:14px}',
    R + '.csk-hero{display:flex;align-items:center;gap:14px;background:var(--bg-card);border:1px solid var(--line);'
      + 'border-radius:10px;padding:14px 16px;flex-wrap:wrap}',
    R + '.csk-hero-portrait{width:54px;height:54px;border-radius:8px;overflow:hidden;flex:0 0 auto;'
      + 'border:1px solid var(--gold-2);background:rgba(0,0,0,.3)}',
    R + '.csk-hero-portrait img{width:100%;height:100%;object-fit:cover}',
    R + '.csk-hero-id{flex:1;min-width:120px}',
    R + '.csk-hero-name{font-family:var(--f-display);font-size:calc(22px * var(--ui-scale, 1));font-weight:800;'
      + 'color:var(--gold-2);letter-spacing:.03em;overflow-wrap:anywhere;line-height:1.1}',
    R + '.csk-hero-sub{font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3);margin-top:3px;'
      + 'text-transform:uppercase;letter-spacing:.04em}',
    R + '.csk-hero-id .cr-founder{margin-top:4px}',
    R + '.csk-hero-total{flex:0 0 auto;text-align:right;margin-left:auto}',
    R + '.csk-hero-total b{display:block;font-size:calc(30px * var(--ui-scale, 1));font-weight:800;color:var(--gold-2);'
      + 'line-height:1;font-variant-numeric:tabular-nums}',
    R + '.csk-hero-total span{display:block;font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3);'
      + 'text-transform:uppercase;letter-spacing:.06em;margin-top:4px}',
    /* b284 (player's-eye QA): 150px tiles were too narrow for the longest skill
       names — "Woodcutting" (79px) and "Bounty Hunter" (89px) ellipsis-truncated
       even on a 1440px desktop, which reads as broken rather than dense. 178px
       fits every name in SKILLS_DEF with the icon + level chip beside it. */
    R + '.csk-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(178px,1fr));gap:8px}',
    R + '.csk-tile{position:relative;display:flex;align-items:center;gap:10px;padding:11px 12px 13px;'
      + 'background:var(--bg-card);border:1px solid var(--line);border-radius:9px;cursor:pointer;text-align:left;'
      + 'font-family:var(--f-ui);transition:border-color .12s,background .12s}',
    R + '.csk-tile:hover{border-color:var(--gold-2);background:rgba(201,162,74,.07)}',
    R + '.csk-tile.active{border-color:var(--gold-2);box-shadow:inset 0 0 0 1px var(--gold-2)}',
    R + '.csk-ic{width:30px;height:30px;flex:0 0 30px;display:flex;align-items:center;justify-content:center}',
    R + '.csk-ic img{width:100%;height:100%;object-fit:contain}',
    R + '.csk-emoji{font-size:22px;line-height:1}',
    R + '.csk-tile-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:6px}',
    R + '.csk-nm{font-size:calc(15px * var(--ui-scale, 1));font-weight:700;color:var(--ink);'
      + 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
    R + '.csk-bar{display:block;height:3px;background:rgba(255,255,255,.09);border-radius:2px;overflow:hidden}',
    R + '.csk-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--gold-3,#b8893e),var(--gold-2));border-radius:2px}',
    R + '.csk-bar.maxed i{background:linear-gradient(90deg,#6fae6f,#b8e6b8)}',
    R + '.csk-lv{flex:0 0 auto;font-size:calc(21px * var(--ui-scale, 1));font-weight:800;color:var(--gold-2);'
      + 'font-variant-numeric:tabular-nums;line-height:1}',
    '@media (max-width:420px){' + R + '.csk-grid{grid-template-columns:repeat(2,1fr);gap:6px}'
      + R + '.csk-tile{padding:9px 10px 11px;gap:8px}}',
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
    // ── The standalone Adventure→Skills activity screen (#panel-skills) ──
    // Two columns (skill picker | activity tiles) on desktop, stacked on mobile.
    // Scoped to .active so the base `.panel{display:none}` still hides it when
    // it is not the current tab (an id rule would otherwise always show it).
    // legacy.css already gives #panel-skills.active its desktop 2-col grid
    // (minmax(260,300) | 1fr) at media:all — but media:all means it also fires on
    // phones, squeezing the activity column to ~39px and overflowing. That legacy
    // rule is `#panel-skills.active` (id+class); this mobile override is
    // `#panel-skills.panel.active` (id+2 classes) so it out-specifies it and
    // stacks to one column on a phone. Desktop keeps the legacy 2-col.
    '#panel-skills.panel.active > .card{min-width:0}',
    '#panel-skills #skills-list{max-height:calc(100vh - 220px);overflow-y:auto}',
    // !important because the legacy rule it overrides is itself !important.
    '@media (max-width:900px){#panel-skills.panel.active{grid-template-columns:1fr !important}}',
  ].join('\n');
  document.head.appendChild(s);
}
