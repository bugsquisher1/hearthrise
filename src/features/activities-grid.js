// Activities tile-grid renderer. Replaces the legacy renderSkillDetail with an
// Idle-Clans-style tile grid. Adapts column count to action count to fit ~2 rows.
//
// Imports: SKILLS_DEF + action tables (TREES, ROCKS, FISH_SPOTS, ARTISAN_RECIPES)
// Exports: setupActivitiesGrid()
// Hooks: window.renderSkillsList (filter combat out), window.renderSkillDetail (tile grid)

import { SKILLS_DEF } from '../data/skills.js';
import { TREES, ROCKS, FISH_SPOTS } from '../data/gathering.js';
import { ARTISAN_RECIPES } from '../data/recipes.js';

const fmtSec = (ms) => (ms / 1000).toFixed(1) + 's';
const fmtQty = (n) => {
  n = n || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + 'K';
  return String(n);
};

function actIconHtml(prod, fallbackEmoji) {
  const path = prod && window._itemPath && window._itemPath[prod];
  if (path) return `<img src="${path}" alt="" loading="lazy" draggable="false" />`;
  return `<span class="at-emoji">${fallbackEmoji || '❓'}</span>`;
}

function buildHead(skillId) {
  const s = SKILLS_DEF[skillId];
  if (!s) return '';
  const xp = window.G.skills[skillId] || 0;
  const lv = window.getLevel(skillId);
  const pct = window.xpPct(xp) * 100;
  const toNext = window.xpToNext(xp);
  const iconHtml = window._skillIcon?.[skillId]
    ? `<img src="${window._skillIcon[skillId]}" alt="" style="width:36px;height:36px;object-fit:contain;image-rendering:pixelated" />`
    : `<span class="ah-icon">${s.icon}</span>`;
  return `<div class="act-head">${iconHtml}
    <div class="ah-meta">
      <div class="ah-row1"><span class="ah-name">${s.name}</span><span class="ah-lvl">Level: ${lv}</span></div>
      <div class="ah-xp">Experience: ${xp.toLocaleString()}${lv < 99 ? ' / ' + (xp + toNext).toLocaleString() : ' MAX'}</div>
      <div class="ah-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
    </div>
  </div>`;
}

function tileForGather(action, skillId) {
  const lv = window.getLevel(skillId);
  const unlocked = lv >= action.req;
  const active = window.G.activeSkill === skillId && window.G.skillTargetId === action.id;
  const qty = window.G.inventory?.[action.prod] || 0;
  const speed = typeof window.getBonus === 'function' ? window.getBonus('gatherSpeed') : 0;
  const ms = Math.max(500, Math.floor(action.ms * (1 - speed)));
  const click = active ? 'stopSkill()' : (unlocked ? `startSkill('${skillId}','${action.id}',${action.ms})` : '');
  const qtyClass = qty > 0 ? 'at-qty' : 'at-qty muted';
  return `<div class="act-tile ${unlocked ? '' : 'locked'} ${active ? 'active' : ''}"
    data-prod="${action.prod}" onclick="${click}" title="${(action.name || '').replace(/"/g, '&quot;')}">
    ${active ? '<span class="at-stop">Active · click to stop</span>' : ''}
    <div class="at-name">${action.name || action.id}</div>
    <div class="at-meta">Level requirement: <b>${action.req}</b></div>
    <div class="at-meta">${action.xp} XP / ${fmtSec(ms)}</div>
    <div class="at-icon">${actIconHtml(action.prod, action.icon)}</div>
    <div class="${qtyClass}">Qty: ${fmtQty(qty)}</div>
    ${unlocked ? '<div class="at-prog"><div class="at-prog-fill"></div></div>' : ''}
  </div>`;
}

function tileForArtisan(recipe, skillId) {
  const lv = window.getLevel(skillId);
  const unlocked = lv >= recipe.req;
  const active = window.G.activeArtisanRecipe === recipe.id;
  const outId = recipe.output;
  const outDef = window.ITEMS?.[outId];
  const qty = window.G.inventory?.[outId] || 0;
  const click = active ? 'stopSkill()' : (unlocked ? `window.startArtisan('${skillId}','${recipe.id}')` : '');
  const inputs = recipe.inputs || (recipe.input ? { [recipe.input]: recipe.inputQty || 1 } : {});
  const inputsLine = Object.entries(inputs).map(([id, q]) => {
    const d = window.ITEMS?.[id];
    return (q > 1 ? q + 'x ' : '') + (d ? d.n.split(' ')[0] : id);
  }).join(' + ');
  const qtyClass = qty > 0 ? 'at-qty' : 'at-qty muted';
  return `<div class="act-tile ${unlocked ? '' : 'locked'} ${active ? 'active' : ''}"
    data-prod="${outId}" onclick="${click}" title="${(recipe.name || '').replace(/"/g, '&quot;')}">
    ${active ? '<span class="at-stop">Active · click to stop</span>' : ''}
    <div class="at-name">${recipe.name || recipe.id}</div>
    <div class="at-meta">Level requirement: <b>${recipe.req}</b></div>
    <div class="at-meta">${recipe.xp} XP / ${fmtSec(recipe.ms || 3000)}</div>
    <div class="at-icon">${actIconHtml(outId, outDef ? outDef.icon : '❓')}</div>
    <div class="at-meta" style="font-size:10px;opacity:.85">${inputsLine}</div>
    <div class="${qtyClass}">Qty: ${fmtQty(qty)}</div>
    ${unlocked ? '<div class="at-prog"><div class="at-prog-fill"></div></div>' : ''}
  </div>`;
}

window._actLastRender = window._actLastRender || { skillId: null, activeKey: null };

function lightUpdate(skillId) {
  const detail = document.getElementById('skill-detail');
  if (!detail) return;
  const prog = typeof window.G?.skillProgress === 'number' ? window.G.skillProgress : 0;
  const pctStr = (Math.min(1, Math.max(0, prog)) * 100).toFixed(1) + '%';
  const activeTile = detail.querySelector('.act-tile.active');
  if (activeTile) {
    const fill = activeTile.querySelector('.at-prog-fill');
    if (fill) fill.style.width = pctStr;
  }
  const xp = window.G.skills[skillId] || 0;
  const lv = window.getLevel(skillId);
  const pct = window.xpPct(xp) * 100;
  const toNext = window.xpToNext(xp);
  const ahLvl = detail.querySelector('.ah-lvl');
  if (ahLvl) ahLvl.textContent = 'Level: ' + lv;
  const ahXp = detail.querySelector('.ah-xp');
  if (ahXp) ahXp.textContent = `Experience: ${xp.toLocaleString()}${lv < 99 ? ' / ' + (xp + toNext).toLocaleString() : ' MAX'}`;
  const ahBar = detail.querySelector('.ah-bar i');
  if (ahBar) ahBar.style.width = pct.toFixed(1) + '%';
  detail.querySelectorAll('.act-tile').forEach((tile) => {
    const qe = tile.querySelector('.at-qty');
    const prodId = tile.getAttribute('data-prod');
    if (qe && prodId && window.G.inventory) {
      const q = window.G.inventory[prodId] || 0;
      qe.textContent = 'Qty: ' + fmtQty(q);
      qe.classList.toggle('muted', q === 0);
    }
  });
}

function renderSkillDetail(id) {
  if (!id) return;
  const s = SKILLS_DEF[id];
  if (!s) return;
  if (s.cat === 'combat') {
    if (typeof window.showTab === 'function') window.showTab('combat');
    return;
  }

  const activeKey = `${window.G.activeSkill || ''}|${window.G.skillTargetId || ''}|${window.G.activeArtisanRecipe || ''}`;
  const detailEl = document.getElementById('skill-detail');
  const alreadyRendered = detailEl && detailEl.querySelector('.act-grid');
  if (alreadyRendered && window._actLastRender.skillId === id && window._actLastRender.activeKey === activeKey) {
    lightUpdate(id);
    return;
  }
  window._actLastRender = { skillId: id, activeKey };

  const titleEl = document.getElementById('skill-detail-title');
  if (titleEl) titleEl.textContent = s.icon + ' ' + s.name;

  const head = buildHead(id);
  let tiles = '';
  let count = 0;

  const tableMap = { woodcutting: TREES, mining: ROCKS, fishing: FISH_SPOTS };
  if (tableMap[id]) {
    const arr = tableMap[id];
    tiles = arr.map((a) => tileForGather(a, id)).join('');
    count = arr.length;
  } else if (id === 'farming') {
    tiles = `<div class="act-tile" onclick="showTab('farming')" style="grid-column:1/-1">
      <div class="at-name">Open the Farm tab</div>
      <div class="at-meta">Plant and harvest crops on your plots.</div>
      <div class="at-icon"><span class="at-emoji">🌾</span></div>
    </div>`;
    count = 1;
  } else if (ARTISAN_RECIPES[id]) {
    const recipes = ARTISAN_RECIPES[id];
    tiles = recipes.map((r) => tileForArtisan(r, id)).join('');
    count = recipes.length;
  } else {
    tiles = `<div class="act-tile" style="grid-column:1/-1"><div class="at-name">No activities</div><div class="at-meta">This skill has no available activities.</div></div>`;
    count = 1;
  }

  // Pick a column count that keeps everything in ~2 rows max
  let cols = 4;
  if (count <= 3) cols = count;
  else if (count <= 4) cols = 4;
  else if (count <= 6) cols = 3;
  else if (count <= 8) cols = 4;
  else if (count <= 10) cols = 5;
  else if (count <= 12) cols = 6;
  else if (count <= 15) cols = 5;
  else cols = 6;

  const grid = `<div class="act-grid" style="grid-template-columns:repeat(${cols},minmax(0,1fr))">${tiles}</div>`;
  if (detailEl) detailEl.innerHTML = head + grid;
}

function renderSkillsList() {
  const el = document.getElementById('skills-list');
  if (!el) return;
  const cats = { gather: 'Gathering', artisan: 'Artisan' };
  const html = Object.entries(cats).map(([cat, label]) => {
    const skills = Object.entries(SKILLS_DEF).filter(([, s]) => s.cat === cat);
    const rows = skills.map(([id, s]) => {
      const xp = window.G.skills[id] || 0;
      const lv = window.getLevel(id);
      const pct = Math.floor(window.xpPct(xp) * 100);
      const active = window.G.activeSkill === id ? 'active' : '';
      const iconHtml = window._skillIcon?.[id]
        ? `<img src="${window._skillIcon[id]}" alt="" loading="lazy" />`
        : `<span class="sicon">${s.icon}</span>`;
      return `<button class="skill-tile ${active}" onclick="openSkillDetail('${id}')">
        ${iconHtml}<span class="slv">Lv ${lv}</span>
        <div class="bar xp"><i style="width:${pct}%"></i></div>
        <span class="snm">${s.name}</span>
      </button>`;
    }).join('');
    return `<div class="muted tiny" style="text-transform:uppercase;letter-spacing:.08em;margin:8px 0 5px;font-weight:700">${label}</div>
      <div class="skill-board">${rows}</div>`;
  }).join('');
  el.innerHTML = html;
  // Update card title
  const card = el.closest('.card');
  if (card) {
    const title = card.querySelector('.card-title');
    if (title) title.textContent = 'Activities';
  }
}

export function setupActivitiesGrid() {
  // Replace the existing renders with our patched versions
  window.renderSkillDetail = renderSkillDetail;
  window.renderSkillsList = renderSkillsList;

  // Auto-open first non-combat skill on entering Activities tab
  if (typeof window.showTab === 'function') {
    const orig = window.showTab;
    window.showTab = function (name) {
      const r = orig.apply(this, arguments);
      if (name === 'skills') {
        const detailEl = document.getElementById('skill-detail');
        const alreadyHasGrid = detailEl && detailEl.querySelector('.act-grid');
        if (!alreadyHasGrid) {
          const firstId = Object.keys(SKILLS_DEF).find((k) => SKILLS_DEF[k].cat === 'gather' || SKILLS_DEF[k].cat === 'artisan');
          if (firstId && typeof window.openSkillDetail === 'function') {
            setTimeout(() => window.openSkillDetail(firstId), 30);
          }
        }
      }
      return r;
    };
  }

  // First paint
  if (typeof renderSkillsList === 'function') setTimeout(renderSkillsList, 100);
  console.log('[Activities Grid ESM] loaded');
}
