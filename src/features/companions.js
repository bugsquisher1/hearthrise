// Companions feature module — full lifecycle in one file.
//
// Imports:
//   - COMPANIONS data from src/data/companions.js
//   - state event bus for cloud-sync hooks
// Exports:
//   - setupCompanions() — wires hooks, renders UI, must be called once at boot
//   - getCompanionBonus() — read-only stat lookup (also exposed on window for legacy callers)
//   - awardCompanionXp(amount) — typed XP award
//   - unlockCompanion(id) — adds to stable, emits 'companionUnlock'
//   - equipCompanion(id) / unequipCompanion()
//
// Online-readiness: every state mutation here goes through emit() so a future
// network adapter can ship companion changes to the backend.

import { COMPANIONS } from '../data/companions.js';
import { emit } from '../net/events.js';

// XP curve: cumulative XP needed to reach level L. Smooth growth, ~50K at L30.
export function companionXpToReach(L) {
  if (L <= 1) return 0;
  let total = 0;
  for (let i = 1; i < L; i++) total += Math.floor(50 * Math.pow(1.18, i - 1) * i);
  return total;
}

export function companionLevelFromXp(xp) {
  for (let L = 30; L >= 1; L--) {
    if (xp >= companionXpToReach(L)) return L;
  }
  return 1;
}

function ensureState() {
  const G = window.G;
  if (!G) return;
  if (!G.companions) {
    G.companions = {
      ownedIds: ['fox'],
      xp: { fox: 0 },
      equipped: G.equipment && G.equipment.companion === 'fox_companion' ? 'fox' : null,
    };
  }
  if (G.equipment && G.equipment.companion === 'fox_companion' && !G.companions.equipped) {
    G.companions.equipped = 'fox';
  }
}

// ── Stat queries ──

export function getCompanionBonus() {
  ensureState();
  const out = {
    strB: 0, atkB: 0, defB: 0, crit: 0, xpB: 0,
    gatherSpeed: 0, farmYield: 0, cookSpeed: 0, prayerXp: 0,
    rareDrop: 0, goldBonus: 0, hpRegen: 0,
  };
  const eq = window.G?.companions?.equipped;
  if (!eq) return out;
  const def = COMPANIONS[eq];
  if (!def) return out;
  const xp = window.G.companions.xp[eq] || 0;
  const lv = companionLevelFromXp(xp);
  const scale = 1 + (lv - 1) * 0.05;  // +5% per level above 1
  for (const [k, v] of Object.entries(def.bonus || {})) {
    out[k] = (out[k] || 0) + v * scale;
  }
  return out;
}

// ── Mutations ──

export function awardCompanionXp(amount) {
  ensureState();
  const eq = window.G?.companions?.equipped;
  if (!eq) return;
  const before = window.G.companions.xp[eq] || 0;
  const beforeLv = companionLevelFromXp(before);
  const next = Math.min(50000, before + amount);
  window.G.companions.xp[eq] = next;
  const afterLv = companionLevelFromXp(next);
  if (afterLv > beforeLv) emit('companionLevelUp', { id: eq, level: afterLv });
}

export function unlockCompanion(id) {
  ensureState();
  if (!COMPANIONS[id]) return false;
  if (window.G.companions.ownedIds.includes(id)) return false;
  window.G.companions.ownedIds.push(id);
  window.G.companions.xp[id] = 0;
  if (typeof window.notify === 'function') {
    window.notify(`Companion unlocked: ${COMPANIONS[id].n} ${COMPANIONS[id].icon}`, 'loot');
  }
  emit('companionUnlock', { id });
  return true;
}

export function equipCompanion(id) {
  ensureState();
  if (!window.G.companions.ownedIds.includes(id)) {
    if (typeof window.notify === 'function') window.notify("You don't own that companion", 'kill');
    return;
  }
  window.G.companions.equipped = id;
  if (window.G.equipment) window.G.equipment.companion = id === 'fox' ? 'fox_companion' : id;
  emit('companionEquip', { id });
  if (typeof window.renderProfile === 'function') window.renderProfile();
  if (typeof window.renderInvFancy === 'function') window.renderInvFancy();
  // Re-render stable if visible
  renderStable();
}

export function unequipCompanion() {
  ensureState();
  window.G.companions.equipped = null;
  if (window.G.equipment) window.G.equipment.companion = null;
  emit('companionEquip', { id: null });
  if (typeof window.renderProfile === 'function') window.renderProfile();
  if (typeof window.renderInvFancy === 'function') window.renderInvFancy();
  renderStable();
}

// ── Hooks (XP gain + procs + drops) ──

const DROP_CHANCES = {
  wolf_pup: 0.01, badger: 0.005, hawk: 0.01, scorpion: 0.005, tortoise: 0.005,
};

function parseSource(src) {
  if (!src) return null;
  const [kind, arg1, arg2] = src.split(':');
  return { kind, arg1, arg2 };
}

function awardXpForRole(activityType) {
  const G = window.G;
  if (!G || !G.companions) return;
  const eq = G.companions.equipped;
  if (!eq) return;
  const role = COMPANIONS[eq]?.role;
  if (!role) return;
  let xp = 0;
  const isUtility = role === 'utility' || role === 'hybrid';
  if (activityType === 'combat-kill' && (role === 'combat' || isUtility)) xp = isUtility ? 0.5 : 1;
  if (activityType === 'gather' && (role === 'gather' || isUtility)) xp = isUtility ? 0.5 : 1;
  if (activityType === 'artisan' && (role === 'artisan' || isUtility)) xp = isUtility ? 0.5 : 1;
  if (xp) awardCompanionXp(xp);
}

function showProc(label) {
  if (typeof window.notify === 'function') window.notify(label, 'loot');
  try {
    const el = document.createElement('div');
    el.textContent = label;
    el.style.cssText = 'position:fixed;top:60px;right:20px;z-index:99998;background:rgba(95,204,124,.95);'
      + 'color:#0f1320;padding:6px 12px;border-radius:6px;font-weight:800;font-size:12px;'
      + 'box-shadow:0 4px 12px rgba(0,0,0,.3);animation:proc-fade 1.6s ease-out forwards';
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1700);
  } catch {}
}

function rollProc(triggerType, ctx) {
  const G = window.G;
  if (!G?.companions?.equipped) return;
  const def = COMPANIONS[G.companions.equipped];
  if (!def?.proc || def.proc.trigger !== triggerType) return;
  if (Math.random() > def.proc.chance) return;
  const e = def.proc.effect;
  switch (e) {
    case 'gold': G.gold = (G.gold || 0) + (def.proc.amount || 1); break;
    case 'extraGold': G.gold = (G.gold || 0) + (def.proc.amount || 5); break;
    case 'doubleDrop':
      if (ctx?.lastDrop?.id && G.inventory) {
        G.inventory[ctx.lastDrop.id] = (G.inventory[ctx.lastDrop.id] || 0) + (ctx.lastDrop.qty || 1);
      } break;
    case 'doubleYield':
      if (ctx?.cropId && G.inventory) {
        G.inventory[ctx.cropId] = (G.inventory[ctx.cropId] || 0) + (ctx.qty || 1);
      } break;
    case 'instant': if (typeof G.skillProgress === 'number') G.skillProgress = 1; break;
    case 'refundIngredients':
      if (ctx?.inputs && G.inventory) {
        for (const [k, v] of Object.entries(ctx.inputs)) G.inventory[k] = (G.inventory[k] || 0) + v;
      } break;
    case 'guaranteedRare': G._companionRareNext = true; break;
    case 'fireDot':
      if (G.activeMonster) G.activeMonster.hp = Math.max(0, (G.activeMonster.hp || 0) - 5);
      break;
  }
  showProc((def.icon || '') + ' ' + def.proc.label);
  emit('companionProc', { id: G.companions.equipped, effect: e });
}

function wireKillHook() {
  if (typeof window.killMonster !== 'function') return;
  const orig = window.killMonster;
  window.killMonster = function (m) {
    const r = orig.apply(this, arguments);
    let monsterId = (typeof m === 'string') ? m : (m?.id || m?.key);
    if (!monsterId && typeof window.MONSTERS === 'object') {
      for (const k in window.MONSTERS) {
        if (window.MONSTERS[k] === m) { monsterId = k; break; }
      }
    }
    if (monsterId) {
      awardXpForRole('combat-kill');
      rollProc('kill', {});
      // Drop check
      for (const [id, def] of Object.entries(COMPANIONS)) {
        const src = parseSource(def.source);
        if (src?.kind !== 'drop' || src.arg1 !== monsterId) continue;
        if (window.G.companions?.ownedIds?.includes(id)) continue;
        const chance = DROP_CHANCES[id] ?? 0.01;
        if (Math.random() < chance) {
          unlockCompanion(id);
          showCompanionUnlockedToast(def);
        }
      }
      emit('kill', { monsterId });
    }
    return r;
  };
}

function showCompanionUnlockedToast(def) {
  try {
    const t = document.createElement('div');
    t.textContent = `🎉 New companion unlocked: ${def.icon} ${def.n}!`;
    t.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);z-index:99999;'
      + 'background:linear-gradient(180deg,#5fcc7c,#3a8a52);color:#fff;padding:14px 22px;border-radius:8px;'
      + 'font-weight:800;font-size:14px;box-shadow:0 8px 32px rgba(0,0,0,.5);'
      + 'border:2px solid #f3d181;animation:bigtoast 4s ease-out forwards';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 4500);
  } catch {}
}

function wireCombatTickProc() {
  if (typeof window.combatTick !== 'function') return;
  const orig = window.combatTick;
  window.combatTick = function () {
    const r = orig.apply(this, arguments);
    if (window.G?.activeMonster) rollProc('combatHit', {});
    return r;
  };
}

function wireAddItemForGather() {
  if (typeof window.addItem !== 'function') return;
  const orig = window.addItem;
  window.addItem = function (id, qty) {
    const r = orig.apply(this, arguments);
    const G = window.G;
    if (G?.activeArtisanRecipe) {
      awardXpForRole('artisan');
      rollProc('cook', { inputs: {} });
    } else if (G?.activeSkill && ['mining', 'woodcutting', 'fishing', 'farming'].includes(G.activeSkill)) {
      awardXpForRole('gather');
      rollProc('gather', { lastDrop: { id, qty } });
      emit('gather', { skill: G.activeSkill, item: id, qty });
    }
    return r;
  };
}

function wireBunnyQuest() {
  if (typeof window.harvestPlot !== 'function') return;
  const orig = window.harvestPlot;
  window.harvestPlot = function () {
    const r = orig.apply(this, arguments);
    const G = window.G;
    if (!G) return r;
    G.stats = G.stats || {};
    G.stats.cropsHarvested = (G.stats.cropsHarvested || 0) + 1;
    if (G.stats.cropsHarvested >= 100 && !G.companions?.ownedIds?.includes('bunny')) {
      unlockCompanion('bunny');
    }
    return r;
  };
}

function wireDragonEggHatch() {
  if (typeof window.invItemTap !== 'function') return;
  const orig = window.invItemTap;
  window.invItemTap = function (id) {
    if (id === 'dragon_egg' && window.G?.inventory?.dragon_egg > 0) {
      if (confirm('Hatch a Dragon Egg to gain a Whelp companion?')) {
        window.G.inventory.dragon_egg--;
        unlockCompanion('whelp');
        if (typeof window.renderInvFancy === 'function') window.renderInvFancy();
        return;
      }
    }
    return orig.apply(this, arguments);
  };
}

// ── UI: Stable panel, profile card, sidebar nav ──

function injectNavButton() {
  const sidebar = document.querySelector('.sidebar') || document.querySelector('aside');
  if (!sidebar || document.querySelector('[data-tab="stable"]')) return;
  // Insert into Adventure group
  const labels = sidebar.querySelectorAll('.nav-group-label');
  let advLabel = null;
  labels.forEach((l) => { if (l.textContent.trim() === 'Adventure') advLabel = l; });
  const btn = document.createElement('button');
  btn.className = 'nav-btn';
  btn.dataset.tab = 'stable';
  btn.innerHTML = '<span class="ic">🐾</span><span class="lbl">Stable</span>';
  btn.addEventListener('click', () => window.showTab && window.showTab('stable'));
  if (advLabel) {
    let next = advLabel.nextElementSibling;
    while (next && !next.classList.contains('nav-group-label')) next = next.nextElementSibling;
    if (next) sidebar.insertBefore(btn, next);
    else sidebar.appendChild(btn);
  } else {
    sidebar.appendChild(btn);
  }
}

function injectPanel() {
  if (document.getElementById('panel-stable')) return;
  const main = document.querySelector('main.main') || document.querySelector('main');
  if (!main) return;
  const panel = document.createElement('section');
  panel.className = 'panel';
  panel.id = 'panel-stable';
  panel.innerHTML = '<div class="card" style="flex:1;overflow:auto"><div class="card-head">'
    + '<div class="card-title">Stable</div>'
    + '<span class="card-sub" id="stable-sub">0 companions owned</span></div>'
    + '<div class="card-body" id="stable-body"></div></div>';
  main.appendChild(panel);
}

function renderStable() {
  ensureState();
  const G = window.G;
  if (!G?.companions) return;
  const body = document.getElementById('stable-body');
  if (!body) return;
  const sub = document.getElementById('stable-sub');
  if (sub) sub.textContent = `${G.companions.ownedIds.length}/${Object.keys(COMPANIONS).length} companions owned`;

  const roleColor = { combat: '#e88a8a', gather: '#7de6d4', artisan: '#f3d181', utility: '#d4a8e8', hybrid: '#9aa3b0' };
  const labelMap = {
    strB: 'STR', atkB: 'ATK', defB: 'DEF', crit: 'Crit', xpB: 'XP',
    gatherSpeed: 'Gather', farmYield: 'Farm yield', cookSpeed: 'Cook speed',
    rareDrop: 'Rare drop', goldBonus: 'Gold', hpRegen: 'HP/sec',
  };
  const isPercent = (k) => ['crit', 'xpB', 'gatherSpeed', 'farmYield', 'cookSpeed', 'rareDrop', 'goldBonus'].includes(k);

  const cards = Object.entries(COMPANIONS).map(([id, def]) => {
    const owned = G.companions.ownedIds.includes(id);
    const equipped = G.companions.equipped === id;
    const xp = (G.companions.xp && G.companions.xp[id]) || 0;
    const lv = companionLevelFromXp(xp);
    const nextXp = companionXpToReach(lv + 1);
    const thisLvXp = companionXpToReach(lv);
    const pct = nextXp > thisLvXp ? Math.min(100, ((xp - thisLvXp) / (nextXp - thisLvXp)) * 100) : 100;
    const bonuses = Object.entries(def.bonus || {}).map(([k, v]) => {
      const display = isPercent(k) ? `+${(v * 100).toFixed(0)}%` : `+${v}`;
      return `<span><b>${display}</b> ${labelMap[k] || k}</span>`;
    }).join(' &nbsp;·&nbsp; ');

    return `<div class="stable-card ${equipped ? 'equipped' : ''} ${owned ? '' : 'locked'}">
      <span class="sc-lvl">Lv ${lv}</span>
      <div class="sc-row">
        <span class="sc-icon">${def.icon}</span>
        <div>
          <div class="sc-name">${def.n}</div>
          <div class="sc-role" style="color:${roleColor[def.role] || '#9aa3b0'}">${def.role}</div>
        </div>
      </div>
      <div class="sc-bonuses">${bonuses}</div>
      ${owned ? `
        <div class="sc-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
        <div style="font-size:10px;color:var(--ink-3)">${xp.toLocaleString()} / ${nextXp.toLocaleString()} XP</div>
        ${def.proc ? `<div class="sc-bonuses" style="font-size:10px;font-style:italic">⚡ ${def.proc.label} (${(def.proc.chance * 100).toFixed(0)}% on ${def.proc.trigger})</div>` : ''}
        <button class="sc-equip" onclick="${equipped ? 'window.unequipCompanion()' : `window.equipCompanion('${id}')`}">${equipped ? 'Unequip' : 'Equip'}</button>
      ` : `<div class="sc-source">🔒 ${def.source}</div>`}
    </div>`;
  }).join('');

  body.innerHTML = `<div class="stable-grid">${cards}</div>`;
}

function injectProfileCard() {
  const dashUserBody = document.getElementById('dash-user-body');
  if (!dashUserBody) return;
  if (dashUserBody.querySelector('.companion-card')) return;
  const G = window.G;
  if (!G?.companions?.equipped) return;
  const id = G.companions.equipped;
  const def = COMPANIONS[id];
  if (!def) return;
  const xp = (G.companions.xp && G.companions.xp[id]) || 0;
  const lv = companionLevelFromXp(xp);
  const nextXp = companionXpToReach(lv + 1);
  const thisLvXp = companionXpToReach(lv);
  const pct = nextXp > thisLvXp ? Math.min(100, ((xp - thisLvXp) / (nextXp - thisLvXp)) * 100) : 100;
  const card = document.createElement('div');
  card.className = 'companion-card';
  card.innerHTML = `<div class="cc-icon">${def.icon}</div>
    <div class="cc-info">
      <div class="cc-name">${def.n} (Lv ${lv})</div>
      <div class="cc-meta">${def.role} companion</div>
      <div class="cc-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
    </div>`;
  dashUserBody.appendChild(card);
}

// ── Boot ──

export function setupCompanions() {
  // Expose APIs on window for legacy code paths
  window.COMPANIONS = COMPANIONS;
  window.companionXpToReach = companionXpToReach;
  window.companionLevelFromXp = companionLevelFromXp;
  window.getCompanionBonus = getCompanionBonus;
  window.awardCompanionXp = awardCompanionXp;
  window.unlockCompanion = unlockCompanion;
  window.equipCompanion = equipCompanion;
  window.unequipCompanion = unequipCompanion;

  // Hook into existing engine functions
  wireKillHook();
  wireCombatTickProc();
  wireAddItemForGather();
  wireBunnyQuest();
  wireDragonEggHatch();

  // Hook into existing getBonus + getEquipmentStats so companion bonuses apply
  if (typeof window.getBonus === 'function') {
    const orig = window.getBonus;
    window.getBonus = function (key) {
      let v = orig.apply(this, arguments) || 0;
      const cb = getCompanionBonus();
      if (typeof cb[key] === 'number') v += cb[key];
      return v;
    };
  }
  if (typeof window.getEquipmentStats === 'function') {
    const orig = window.getEquipmentStats;
    window.getEquipmentStats = function () {
      const s = orig.apply(this, arguments) || {};
      const cb = getCompanionBonus();
      for (const k of ['strB', 'atkB', 'defB', 'rangeStrB', 'rangeAtkB', 'magicStrB', 'magicAtkB']) {
        if (typeof cb[k] === 'number') s[k] = (s[k] || 0) + cb[k];
      }
      if (typeof cb.crit === 'number') s.critB = (s.critB || 0) + cb.crit;
      return s;
    };
  }

  // Hook showTab for stable rendering
  if (typeof window.showTab === 'function') {
    const orig = window.showTab;
    window.showTab = function (name) {
      const r = orig.apply(this, arguments);
      if (name === 'stable') setTimeout(renderStable, 30);
      return r;
    };
  }

  // Hook renderProfile for companion card
  if (typeof window.renderProfile === 'function') {
    const orig = window.renderProfile;
    window.renderProfile = function () {
      const r = orig.apply(this, arguments);
      setTimeout(injectProfileCard, 30);
      return r;
    };
  }

  // Boot UI
  function boot() {
    injectNavButton();
    injectPanel();
    ensureState();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(boot, 300));
  } else {
    setTimeout(boot, 300);
  }

  // Inject toast keyframe once
  if (!document.getElementById('comp-bigtoast-css')) {
    const s = document.createElement('style');
    s.id = 'comp-bigtoast-css';
    s.textContent = `
      @keyframes proc-fade{0%{opacity:0;transform:translateY(-10px)}20%{opacity:1;transform:translateY(0)}100%{opacity:0;transform:translateY(20px)}}
      @keyframes bigtoast{0%{opacity:0;transform:translate(-50%,-20px)}15%{opacity:1;transform:translate(-50%,0)}80%{opacity:1}100%{opacity:0;transform:translate(-50%,20px)}}
    `;
    document.head.appendChild(s);
  }

  console.log(`[Companions ESM] loaded — ${Object.keys(COMPANIONS).length} companions`);
}
