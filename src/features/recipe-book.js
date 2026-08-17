// Recipe Book (b239, Tyler pillar 5) — every recipe in the game, browsable.
//
// The whole crafting web in one place. A recipe you can't make yet is shown
// GRAYSCALE and LOCKED, but STILL lists its exact inputs + the level/scroll it
// needs — so a player can see the entire tree and plan toward it, never blocked
// by not-knowing. Reads live inventory so each ingredient shows what you own
// (red when short), the same language as the activity tiles.
//
// Data-only: it renders whatever is in ARTISAN_RECIPES (incl. the generated gear
// ladder merged in), so ADDING a recipe adds a Book entry for free — nothing to
// wire (the "safe to extend" pillar).
//
// Exports: setupRecipeBook() → installs window.HearthriseRecipeBook.open().

import { ARTISAN_RECIPES } from '../data/recipes.js?v=371';

const SKILL_ORDER = ['smithing', 'crafting', 'cooking', 'runecrafting', 'stonemason', 'prayer'];
const SKILL_LABEL = {
  smithing: 'Smithing', crafting: 'Crafting', cooking: 'Cooking', prayer: 'Prayer',
  runecrafting: 'Runecrafting', stonemason: 'Stonemason',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g,
  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const fmtQty = (n) => {
  n = n || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + 'K';
  return String(n);
};

function inputsOf(r) {
  if (r.inputs) return r.inputs;
  const i = {};
  if (r.input) i[r.input] = r.inputQty || 1;
  if (r.secondary) Object.entries(r.secondary).forEach(([k, v]) => { i[k] = v; });
  return i;
}

function iconHtml(id) {
  const path = window._itemPath && window._itemPath[id];
  if (path) {
    const tint = (typeof window.itemTintClass === 'function') ? window.itemTintClass(id) : '';
    return `<img class="${tint}" src="${path}" alt="" loading="lazy" draggable="false" />`;
  }
  const d = window.ITEMS && window.ITEMS[id];
  return `<span class="rb-emoji">${(d && d.icon) || '❓'}</span>`;
}
const nameOf = (id) => { const d = window.ITEMS && window.ITEMS[id]; return d ? d.n : id; };
const shortName = (id) => nameOf(id).split(' ').slice(0, 2).join(' ');

// b226: quote the paced XP the engine actually pays, never the book value.
const pacedXpOf = (skill, xp) => (typeof window.pacedXp === 'function')
  ? Math.max(1, Math.floor(window.pacedXp(skill, xp))) : xp;

function recipeCard(r, skill) {
  const G = window.G || {};
  const lv = (typeof window.getLevel === 'function') ? window.getLevel(skill) : 1;
  const gatedLocked = !!(r.gated && !(G.unlockedRecipes && G.unlockedRecipes[r.gated]));
  const lvLocked = lv < (r.req || 1);
  const locked = lvLocked || gatedLocked;
  const outId = r.output;
  const outQty = r.outputQty || 1;
  const inputs = inputsOf(r);
  const ings = Object.entries(inputs).map(([id, q]) => {
    const have = (G.inventory && G.inventory[id]) || 0;
    return `<span class="rb-ing${have < q ? ' short' : ''}" title="${esc(nameOf(id))} — you have ${have}">
      <span class="rb-ing-ic">${iconHtml(id)}</span>${q > 1 ? q + '× ' : ''}${esc(shortName(id))} <b>${fmtQty(have)}</b></span>`;
  }).join('<span class="rb-plus">+</span>');
  let lock = '';
  if (gatedLocked) lock = `<div class="rb-lockmsg">Locked · needs the ${esc(nameOf(r.gated))}</div>`;
  else if (lvLocked) lock = `<div class="rb-lockmsg">Locked · ${SKILL_LABEL[skill]} Lv ${r.req}</div>`;
  return `<div class="rb-card${locked ? ' locked' : ''}" data-name="${esc((nameOf(outId) + ' ' + Object.keys(inputs).map(nameOf).join(' ')).toLowerCase())}">
    <div class="rb-out">
      <span class="rb-out-ic">${iconHtml(outId)}</span>
      <div class="rb-out-meta">
        <div class="rb-out-name">${outQty > 1 ? outQty + '× ' : ''}${esc(nameOf(outId))}</div>
        <div class="rb-out-sub">${SKILL_LABEL[skill] || skill} · Lv ${r.req || 1} · ${pacedXpOf(skill, r.xp)} XP</div>
      </div>
    </div>
    <div class="rb-arrow">made from</div>
    <div class="rb-ings">${ings || '<span class="rb-ing">—</span>'}</div>
    ${lock}
  </div>`;
}

function skillsInBook() {
  const R = window.ARTISAN_RECIPES || ARTISAN_RECIPES || {};
  const ordered = SKILL_ORDER.filter((s) => R[s] && R[s].length);
  Object.keys(R).forEach((s) => { if (!ordered.includes(s) && R[s] && R[s].length) ordered.push(s); });
  return ordered;
}

function renderBody(filter) {
  const R = window.ARTISAN_RECIPES || ARTISAN_RECIPES || {};
  const f = (filter || '').trim().toLowerCase();
  let html = '';
  let shown = 0;
  skillsInBook().forEach((skill) => {
    const cards = R[skill].map((r) => recipeCard(r, skill))
      .filter((c) => !f || /data-name="([^"]*)"/.exec(c)[1].includes(f));
    if (!cards.length) return;
    shown += cards.length;
    html += `<div class="rb-section"><div class="rb-section-h">${SKILL_LABEL[skill] || skill} <span>${cards.length}</span></div>
      <div class="rb-grid">${cards.join('')}</div></div>`;
  });
  if (!shown) html = `<div class="rb-empty">No recipes match “${esc(filter)}”.</div>`;
  return html;
}

function ensureStyle() {
  if (document.getElementById('rb-css')) return;
  const s = document.createElement('style');
  s.id = 'rb-css';
  const R = '#rb-overlay ';
  s.textContent = [
    R + '{position:fixed;inset:0;z-index:3000;display:none;flex-direction:column;background:var(--bg-0,#0b1117);color:var(--ink,#ece1cc)}',
    R + '.rb-head{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--gold-2);flex:0 0 auto}',
    R + '.rb-title{font-family:var(--f-display);font-size:calc(22px * var(--ui-scale,1));font-weight:800;color:var(--gold-2);letter-spacing:.03em}',
    R + '.rb-search{flex:1;min-width:0;max-width:360px;padding:9px 12px;background:rgba(0,0,0,.3);border:1px solid var(--line);border-radius:8px;color:var(--ink);font-size:calc(15px * var(--ui-scale,1));font-family:var(--f-ui)}',
    R + '.rb-x{margin-left:auto;flex:0 0 auto;min-width:44px;min-height:44px;padding:0 14px;background:rgba(201,162,74,.14);border:1px solid var(--gold-2);border-radius:8px;color:var(--gold-2);font-weight:700;font-family:var(--f-ui);cursor:pointer;font-size:calc(15px * var(--ui-scale,1))}',
    R + '.rb-body{flex:1;min-height:0;overflow-y:auto;padding:14px 16px 40px}',
    R + '.rb-section{margin-bottom:22px}',
    R + '.rb-section-h{font-family:var(--f-label);font-size:calc(15px * var(--ui-scale,1));font-weight:800;color:var(--gold-2);text-transform:uppercase;letter-spacing:.06em;margin:0 0 10px;border-bottom:1px solid var(--line);padding-bottom:6px}',
    R + '.rb-section-h span{color:var(--ink-3);font-weight:600}',
    R + '.rb-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:10px}',
    R + '.rb-card{background:var(--bg-card,rgba(255,255,255,.03));border:1px solid var(--line);border-radius:10px;padding:11px 12px}',
    R + '.rb-card.locked{opacity:.55;filter:grayscale(.85)}',
    R + '.rb-out{display:flex;align-items:center;gap:10px}',
    R + '.rb-out-ic{width:38px;height:38px;flex:0 0 38px;display:flex;align-items:center;justify-content:center}',
    R + '.rb-out-ic img{width:100%;height:100%;object-fit:contain}',
    R + '.rb-emoji{font-size:26px;line-height:1}',
    R + '.rb-out-name{font-size:calc(15.5px * var(--ui-scale,1));font-weight:700;color:var(--ink)}',
    R + '.rb-out-sub{font-size:calc(14.5px * var(--ui-scale,1));color:var(--ink-3);margin-top:2px}',
    R + '.rb-arrow{font-size:calc(14.5px * var(--ui-scale,1));color:var(--ink-3);margin:8px 0 5px;text-transform:uppercase;letter-spacing:.05em;opacity:.75}',
    R + '.rb-ings{display:flex;flex-wrap:wrap;align-items:center;gap:5px}',
    R + '.rb-ing{display:inline-flex;align-items:center;gap:5px;font-size:calc(14.5px * var(--ui-scale,1));color:var(--ink-2);background:rgba(0,0,0,.22);border:1px solid var(--line);border-radius:7px;padding:4px 8px}',
    R + '.rb-ing-ic{width:20px;height:20px;display:inline-flex;align-items:center;justify-content:center}',
    R + '.rb-ing-ic img{width:100%;height:100%;object-fit:contain}',
    R + '.rb-ing-ic .rb-emoji{font-size:15px}',
    R + '.rb-ing b{color:var(--gold-2);font-variant-numeric:tabular-nums}',
    R + '.rb-ing.short b{color:var(--danger,#d9534f)}',
    R + '.rb-plus{color:var(--ink-3);font-weight:700;padding:0 1px}',
    R + '.rb-lockmsg{margin-top:8px;font-size:calc(14.5px * var(--ui-scale,1));color:var(--gold-2);font-weight:700;letter-spacing:.02em}',
    R + '.rb-empty{color:var(--ink-3);text-align:center;padding:40px 0;font-size:calc(15px * var(--ui-scale,1))}',
    '@media (max-width:540px){' + R + '.rb-grid{grid-template-columns:1fr}' + R + '.rb-search{max-width:none}}',
  ].join('\n');
  document.head.appendChild(s);
}

function open() {
  ensureStyle();
  let ov = document.getElementById('rb-overlay');
  if (!ov) {
    ov = document.createElement('div');
    ov.id = 'rb-overlay';
    ov.innerHTML =
      '<div class="rb-head">'
      + '<div class="rb-title">Recipe Book</div>'
      + '<input class="rb-search" id="rb-search" type="text" placeholder="Search recipes or ingredients…" />'
      + '<button class="rb-x" id="rb-x" type="button">Close</button>'
      + '</div><div class="rb-body" id="rb-body"></div>';
    document.body.appendChild(ov);
    ov.querySelector('#rb-x').addEventListener('click', close);
    ov.querySelector('#rb-search').addEventListener('input', (e) => {
      const b = document.getElementById('rb-body');
      if (b) b.innerHTML = renderBody(e.target.value);
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && ov.style.display === 'flex') close(); });
  }
  document.getElementById('rb-search').value = '';
  document.getElementById('rb-body').innerHTML = renderBody('');
  ov.style.display = 'flex';
}

function close() {
  const ov = document.getElementById('rb-overlay');
  if (ov) ov.style.display = 'none';
}

export function setupRecipeBook() {
  window.HearthriseRecipeBook = { open, close, renderBody };
  console.log('[Recipe Book ESM] loaded');
}
