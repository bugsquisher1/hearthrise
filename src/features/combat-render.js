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

import { MONSTERS } from '../data/monsters.js?v=226';

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
      /* b217: the second line was one dot-separated dev string —
         "Vermin · Weak: sword · HP 8 · ATK 2". It reads as a debug printout,
         and it buries HP and ATK (the only two numbers a player compares
         between foes) at the end of a sentence, at different x-positions on
         every row. Flavour stays left; the numbers move into a fixed right
         column so the list can be scanned straight down. */
      const weak = m.weaponWeak ? ` · weak to ${m.weaponWeak}` : '';
      const fighting = window.G && window.G.activeMonster === id;
      const right = fighting
        ? '<span class="mr-fighting">Fighting</span>'
        : `<span class="mr-stats"><i>${m.hp}<em>HP</em></i><i>${m.atk}<em>ATK</em></i></span>`;
      return `<button class="monster-row ${tooHigh ? 'too-high' : ''} ${fighting ? 'fighting' : ''}" onclick="startCombat('${id}')" title="${m.name}">
        <span class="mi">${getMonsterIconHtml(id)}</span>
        <div style="flex:1;min-width:0">
          <span class="mn">${m.name}${m.boss ? ' <span class="tag">Boss</span>' : ''}</span>
          <span class="ms">${m.family}${weak}</span>
        </div>
        ${right}
      </button>`;
    }).join('');
  el.innerHTML = list || '<div class="empty">No monsters in this tier.</div>';
}

/* b213 (phase 2): the tier is saved on G, but the chips' active state was
   static markup — after a reload the list showed the saved tier while the
   "Tier 1" chip stayed highlighted, and the first chip click looked like it
   did nothing. Sync the chips (and sub-label) to the real tier. */
function syncTierChips() {
  const tier = (window.G && window.G.currentCombatTier) || 1;
  document.querySelectorAll('#tier-chips .chip').forEach((c) => {
    c.classList.toggle('active', parseInt(c.dataset.tier || '1', 10) === tier);
  });
  const sub = document.getElementById('combat-picker-sub');
  if (sub) sub.textContent = `Tier ${tier}`;
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
          syncTierChips();
          renderMonsterList();
        }, 30);
      }
      return r;
    };
  }
  console.log('[Combat Render ESM] loaded');
}
