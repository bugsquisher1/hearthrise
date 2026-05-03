// Combat-rendering module. Just the visible UI: monster picker, arena placeholder,
// loadout panel updates. The combat ENGINE (combatTick, killMonster, damage rolls)
// stays in the monolith — too tightly coupled to engine internals to extract safely
// in this pass. Will move once the engine itself is modularised.
//
// What this module owns:
//   - Reading from MONSTERS data (now from src/data/monsters.js)
//   - Rendering #monster-list when entering Combat tab
//   - Rendering tier filter chips
//
// Imports: MONSTERS, ITEMS
// Exports: setupCombatRender()

import { MONSTERS } from '../data/monsters.js';

function getMonsterIconHtml(id) {
  const path = window._monsterIcon?.[id];
  if (path) return `<img src="${path}" alt="" loading="lazy" style="width:32px;height:32px;object-fit:contain" />`;
  const m = MONSTERS[id];
  return `<span style="font-size:24px">${m?.icon || '👾'}</span>`;
}

function renderMonsterList() {
  const el = document.getElementById('monster-list');
  if (!el) return;
  const G = window.G;
  const tier = G.currentCombatTier || 1;
  const playerLv = typeof window.getCombatLevel === 'function' ? window.getCombatLevel() : 1;
  const list = Object.entries(MONSTERS)
    .filter(([, m]) => m.tier === tier)
    .map(([id, m]) => {
      const tooHigh = m.tier > Math.ceil(playerLv / 10) + 1;
      const weakInfo = m.weaponWeak ? ` · Weak: ${m.weaponWeak}` : '';
      return `<button class="monster-row ${tooHigh ? 'too-high' : ''}" onclick="startCombat('${id}')" title="${m.name}">
        <span class="mi">${getMonsterIconHtml(id)}</span>
        <div style="flex:1;min-width:0">
          <span class="mn">${m.name}</span>
          <span class="ms">${m.family}${weakInfo} · HP ${m.hp} · ATK ${m.atk}</span>
        </div>
      </button>`;
    }).join('');
  el.innerHTML = list || '<div class="empty">No monsters in this tier.</div>';
}

function setupTierChips() {
  document.querySelectorAll('#tier-chips .chip').forEach((c) => {
    c.addEventListener('click', () => {
      document.querySelectorAll('#tier-chips .chip').forEach((x) => x.classList.remove('active'));
      c.classList.add('active');
      const tier = parseInt(c.dataset.tier || '1', 10);
      window.G.currentCombatTier = tier;
      // Update sub-label
      const sub = document.getElementById('combat-picker-sub');
      if (sub) sub.textContent = `Tier ${tier}`;
      renderMonsterList();
    });
  });
}

export function setupCombatRender() {
  // Replace the legacy renderer
  window.renderMonsterList = renderMonsterList;

  // Wire tier chips on first combat tab activation
  let chipsWired = false;
  if (typeof window.showTab === 'function') {
    const orig = window.showTab;
    window.showTab = function (name) {
      const r = orig.apply(this, arguments);
      if (name === 'combat') {
        setTimeout(() => {
          if (!chipsWired) { setupTierChips(); chipsWired = true; }
          renderMonsterList();
        }, 30);
      }
      return r;
    };
  }
  console.log('[Combat Render ESM] loaded');
}
