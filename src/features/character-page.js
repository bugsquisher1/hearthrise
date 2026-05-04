// Character page renderer. Hero showcase + multi-character paywall slots +
// combat stat breakdown + best XP/hr per skill + equipment summary.
//
// Imports: SKILLS_DEF, ITEMS, ARTISAN_RECIPES, action tables
// Exports: setupCharacterPage()

import { SKILLS_DEF } from '../data/skills.js';
import { TREES, ROCKS, FISH_SPOTS, CROPS, EQUIP_SLOTS } from '../data/gathering.js';
import { ARTISAN_RECIPES } from '../data/recipes.js';

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

function getActiveAvatar() {
  const pa = document.querySelector('.player-avatar img');
  if (pa?.src) return pa.src;
  return 'assets/raw-bundle/rpg-avatar-dwarf-icons/background/3.png';
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
        const speed = typeof window.getBonus === 'function' ? window.getBonus('gatherSpeed') : 0;
        const ms = Math.max(500, Math.floor(best.ms * (1 - speed)));
        out.push({ id, lv, action: best.name, xpHr: Math.floor(3600000 / ms * best.xp), icon: SKILLS_DEF[id]?.icon || '?' });
        continue;
      }
    }
    if (ARTISAN_RECIPES[id]) {
      const rec = ARTISAN_RECIPES[id].filter((r) => lv >= (r.req || 1));
      if (rec.length) {
        const b = rec.reduce((a, b) => ((b.xp / b.ms * 1000) > (a.xp / a.ms * 1000) ? b : a));
        out.push({ id, lv, action: b.name, xpHr: Math.floor(3600000 / (b.ms || 3000) * (b.xp || 0)), icon: SKILLS_DEF[id]?.icon || '?' });
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

function buildHeroCard() {
  const G = window.G;
  const avatarSrc = getActiveAvatar();
  const cls = deriveClass();
  const name = G?.playerName || 'Adventurer';
  const cl = typeof window.getCombatLevel === 'function' ? window.getCombatLevel() : '?';
  const tl = typeof window.getTotalLevel === 'function' ? window.getTotalLevel() : '?';
  const gold = G.gold || 0;
  const kills = G.stats?.kills || 0;
  // b127: actual fields are G.playerHp / G.playerMaxHp. Earlier code
  // read G.hp + getMaxHp() which don't exist, so the page rendered
  // "HP: — / —". Fall back through G.hp + getMaxHp() for forward
  // compat in case the canonical field names ever change.
  const hp = (typeof G.playerHp === 'number') ? G.playerHp
           : (typeof G.hp === 'number') ? G.hp : '—';
  const maxHp = (typeof G.playerMaxHp === 'number') ? G.playerMaxHp
              : (typeof window.getMaxHp === 'function') ? window.getMaxHp()
              : '—';
  const topSkill = (() => {
    const entries = Object.entries(G.skills || {});
    if (!entries.length) return '—';
    const top = entries.reduce((a, b) => ((b[1] || 0) > (a[1] || 0) ? b : a));
    const lv = typeof window.getLevel === 'function' ? window.getLevel(top[0]) : '?';
    const s = SKILLS_DEF[top[0]];
    return (s ? s.name : top[0]) + ' Lv ' + lv;
  })();

  return `<div class="cr-hero">
    <div class="cr-hero-portrait"><img src="${avatarSrc}" alt="" /></div>
    <div class="cr-hero-id">
      <div class="cr-name">${name}</div>
      <div class="cr-class">${cls.tagline}</div>
      <div class="cr-build">Top skill: <span>${topSkill}</span></div>
      <div class="cr-build">HP: <span>${hp} / ${maxHp}</span></div>
    </div>
    <div class="cr-hero-stats">
      <div class="cr-hero-stat"><b>${cl}</b><span>Combat Lv</span></div>
      <div class="cr-hero-stat"><b>${tl}</b><span>Total Lv</span></div>
      <div class="cr-hero-stat"><b>${fmt(gold)}</b><span>Gold</span></div>
      <div class="cr-hero-stat"><b>${fmt(kills)}</b><span>Kills</span></div>
    </div>
  </div>`;
}

function buildSlotsCard() {
  const avatarSrc = getActiveAvatar();
  const G = window.G;
  const name = G?.playerName || 'Adventurer';
  const cl = typeof window.getCombatLevel === 'function' ? window.getCombatLevel() : '?';
  const cls = deriveClass();
  return `<div class="cr-slots">
    <div class="cr-section-title">🛡️ Your Heroes</div>
    <div class="cr-slots-grid">
      <div class="cr-slot active">
        <span class="cr-slot-badge">Active</span>
        <div class="cr-slot-portrait"><img src="${avatarSrc}" alt="" /></div>
        <div class="cr-slot-name">${name}</div>
        <div class="cr-slot-meta">${cls.tagline} · CL ${cl}</div>
      </div>
      <div class="cr-slot locked">
        <span class="cr-slot-badge">Locked</span>
        <div class="cr-slot-portrait">🔒</div>
        <div class="cr-slot-name">Hero Slot 2</div>
        <div class="cr-slot-meta">Hearth Hall premium</div>
      </div>
      <div class="cr-slot locked">
        <span class="cr-slot-badge">Locked</span>
        <div class="cr-slot-portrait">🔒</div>
        <div class="cr-slot-name">Hero Slot 3</div>
        <div class="cr-slot-meta">Hearth Hall premium</div>
      </div>
    </div>
    <div class="cr-paywall-hint">
      <span>💎</span>
      <div><b>Hearth Hall Premium:</b> 3 character slots, +25% offline progress, exclusive cosmetics, monthly chests.</div>
      <button onclick="window.openHearthHallStore && window.openHearthHallStore()">Learn more</button>
    </div>
  </div>`;
}

function buildCombatCard() {
  const lv = (id) => (typeof window.getLevel === 'function' ? window.getLevel(id) : 0);
  const styleCard = (title, icon, lvAtk, lvStr, lvDef, st) =>
    `<div class="cr-card"><div class="cr-section-title">${icon} ${title}</div>
      <div class="cr-style-stats">
        <div class="cr-stat-row"><span>Attack</span><b>Lv ${lvAtk}</b><span class="cr-bonus">+${st.atk}</span></div>
        <div class="cr-stat-row"><span>Strength</span><b>Lv ${lvStr}</b><span class="cr-bonus">+${st.str}</span></div>
        <div class="cr-stat-row"><span>Defense</span><b>Lv ${lvDef}</b><span class="cr-bonus">+${st.def}</span></div>
        <div class="cr-stat-row"><span>Crit</span><b>${(st.crit * 100).toFixed(0)}%</b><span class="cr-bonus"></span></div>
      </div>
    </div>`;
  return `<div class="cr-row">
    ${styleCard('Melee', '🗡️', lv('attack'), lv('strength'), lv('defense'), getEquipmentBonusFor('melee'))}
    ${styleCard('Ranged', '🏹', lv('ranged'), lv('ranged'), lv('defense'), getEquipmentBonusFor('ranged'))}
    ${styleCard('Magic', '🔮', lv('magic'), lv('magic'), lv('defense'), getEquipmentBonusFor('magic'))}
  </div>`;
}

function buildRatesCard() {
  const rates = gatherRates();
  if (!rates.length) {
    return `<div class="cr-card"><div class="cr-section-title">📈 Active Rates</div>
      <div style="color:var(--ink-3);font-size:12px">Train a skill to see your rates.</div></div>`;
  }
  const rows = rates.map((r) => {
    const skillIcon = window._skillIcon?.[r.id]
      ? `<img src="${window._skillIcon[r.id]}" class="cr-rate-icon" alt="" />`
      : `<span class="cr-rate-icon">${r.icon}</span>`;
    return `<div class="cr-rate-row">${skillIcon}
      <span class="cr-rate-name">${SKILLS_DEF[r.id]?.name || r.id}</span>
      <span class="cr-rate-val">${fmt(r.xpHr)} xp/hr</span>
      <span class="cr-rate-meta">via ${r.action}</span>
    </div>`;
  }).join('');
  return `<div class="cr-card"><div class="cr-section-title">📈 Best Rates by Skill</div>
    <div class="cr-rate-table">${rows}</div></div>`;
}

function buildEquipSummaryCard() {
  let equipped = 0;
  const totalBonus = { str: 0, atk: 0, def: 0 };
  if (window.G.equipment) {
    for (const id of Object.values(window.G.equipment)) {
      if (!id) continue;
      equipped++;
      const it = window.ITEMS?.[id];
      if (!it) continue;
      totalBonus.str += (it.strB || 0) + (it.rangeStrB || 0) + (it.magicStrB || 0);
      totalBonus.atk += (it.atkB || 0) + (it.rangeAtkB || 0) + (it.magicAtkB || 0);
      totalBonus.def += (it.defB || 0);
    }
  }
  const maxSlots = EQUIP_SLOTS?.length || 13;
  return `<div class="cr-card"><div class="cr-section-title">⚔️ Equipment</div>
    <div class="cr-stat-row"><span>Slots filled</span><b>${equipped} / ${maxSlots}</b><span></span></div>
    <div class="cr-stat-row"><span>Total +STR</span><b>+${totalBonus.str}</b><span></span></div>
    <div class="cr-stat-row"><span>Total +ATK</span><b>+${totalBonus.atk}</b><span></span></div>
    <div class="cr-stat-row"><span>Total +DEF</span><b>+${totalBonus.def}</b><span></span></div>
    <div style="margin-top:8px"><button onclick="showTab('inventory')" style="width:100%;padding:6px;background:rgba(56,199,182,.18);border:1px solid rgba(56,199,182,.35);border-radius:5px;color:#7de6d4;cursor:pointer;font-size:11px;font-weight:700">Manage gear →</button></div>
  </div>`;
}

export function renderCharacter() {
  const panel = document.getElementById('panel-character');
  if (!panel) return;
  panel.innerHTML = buildHeroCard()
    + buildSlotsCard()
    + buildCombatCard()
    + `<div class="cr-rates">${buildRatesCard()}${buildEquipSummaryCard()}</div>`;
}

export function setupCharacterPage() {
  window.renderCharacter = renderCharacter;
  if (typeof window.showTab === 'function') {
    const orig = window.showTab;
    window.showTab = function (name) {
      const r = orig.apply(this, arguments);
      if (name === 'character') setTimeout(renderCharacter, 30);
      return r;
    };
  }
  console.log('[Character Page ESM] loaded');
}
