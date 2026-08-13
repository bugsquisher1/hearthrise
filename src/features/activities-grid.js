// Activities tile-grid renderer. Replaces the legacy renderSkillDetail with an
// Idle-Clans-style tile grid. Adapts column count to action count to fit ~2 rows.
//
// Imports: SKILLS_DEF + action tables (TREES, ROCKS, FISH_SPOTS, ARTISAN_RECIPES)
// Exports: setupActivitiesGrid()
// Hooks: window.renderSkillsList (filter combat out), window.renderSkillDetail (tile grid)

import { SKILLS_DEF } from '../data/skills.js?v=333';
import { TREES, ROCKS, FISH_SPOTS } from '../data/gathering.js?v=333';
import { ARTISAN_RECIPES } from '../data/recipes.js?v=333';

const fmtSec = (ms) => (ms / 1000).toFixed(1) + 's';

/* ── b226 (pacing retune) ──────────────────────────────────────────────
   These tiles are the game's price tags. `action.xp` / `recipe.xp` are BOOK
   values; what the player receives is the book value through PACE.xp, and
   what the action actually takes is its `ms` through PACE.actionMs. Printing
   the book value would mean every card in the game quotes a number the engine
   does not pay — the single most corrosive thing a retune can do. Both go
   through the same helpers the engine uses, so a card can never drift from
   the grant. Defensive fallbacks keep the module renderable if legacy.js has
   not published them yet (this module can render before boot completes). */
const effXp = (skillId, xp) =>
  (typeof window.pacedXp === 'function') ? Math.max(1, Math.floor(window.pacedXp(skillId, xp))) : xp;
const artisanMs = (skillId, ms) => {
  const base = (typeof window.pacedActionMs === 'function') ? window.pacedActionMs(ms) : ms;
  const key = { cooking:'cookSpeed', smithing:'smithSpeed', crafting:'craftSpeed', prayer:'prayerSpeed' }[skillId] || 'gatherSpeed';
  const speed = (typeof window.getBonus === 'function') ? window.getBonus(key) : 0;
  return Math.max(500, Math.floor(base * window.speedClamp(speed)));
};
/* The presence hint, rendered where the skill's XP is. Words and tokens, no
   emoji; it names the condition when it lapses rather than going quiet, so an
   idle player learns why the bonus stopped instead of never knowing it existed. */
const presenceNote = () =>
  (typeof window.HearthrisePresenceNote === 'function') ? window.HearthrisePresenceNote() : '';
const fmtQty = (n) => {
  n = n || 0;
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.0', '') + 'K';
  return String(n);
};

function actIconHtml(prod, fallbackEmoji) {
  const path = prod && window._itemPath && window._itemPath[prod];
  if (path) {
    // b217: tier tint (see window.itemTintClass) so ladders that share one
    // sprite still read as five different materials.
    const tint = (typeof window.itemTintClass === 'function') ? window.itemTintClass(prod) : '';
    return `<img class="${tint}" src="${path}" alt="" loading="lazy" draggable="false" />`;
  }
  return `<span class="at-emoji">${fallbackEmoji || '❓'}</span>`;
}

function buildHead(skillId) {
  const s = SKILLS_DEF[skillId];
  if (!s) return '';
  const xp = window.G.skills[skillId] || 0;
  const lv = window.getLevel(skillId);
  const pct = window.xpPct(xp) * 100;
  const toNext = window.xpToNext(xp);
  // b213 (phase 2): the detail header carried a raw emoji glyph — use the
  // same gilt medallion as the skills grid (emoji only pre-cache).
  const medallion = window.HearthriseIconSet && window.HearthriseIconSet.medallion
    && window.HearthriseIconSet.medallion(skillId, 36);
  const iconHtml = window._skillIcon?.[skillId]
    ? `<img src="${window._skillIcon[skillId]}" alt="" style="width:36px;height:36px;object-fit:contain;image-rendering:pixelated" />`
    : (medallion || `<span class="ah-icon">${s.icon}</span>`);

  // b134: train-to-level goal control. Reads + writes G.autoActions.trainGoal
  // via HearthriseAuto. Active only when goal.skillId matches THIS skill.
  // Engine self-disables after firing (in addXp() level-up branch).
  const goal = (window.HearthriseAuto && window.HearthriseAuto.getTrainGoal()) || { enabled: false };
  const isMyGoal = !!(goal.enabled && goal.skillId === skillId);
  const goalLv = isMyGoal && goal.targetLevel ? goal.targetLevel : (lv + 5);
  const goalControl = lv >= 99 ? '' : `
    <div class="ah-traingoal" style="margin-top:6px;display:flex;align-items:center;gap:6px;font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3)">
      <label><input type="checkbox" ${isMyGoal ? 'checked' : ''}
        onchange="if(window.HearthriseAuto){window.HearthriseAuto.setTrainGoal({enabled:this.checked, skillId:'${skillId}', targetLevel:Math.max(${lv + 1}, parseInt(document.getElementById('hr-goal-${skillId}').value,10) || ${lv + 1})});if(this.checked)window.notify?.('Stop ${s.name} at Lv '+document.getElementById('hr-goal-${skillId}').value,'info');}"
        style="margin:0"
      /> Stop at Lv</label>
      <input id="hr-goal-${skillId}" type="number" min="${lv + 1}" max="99" value="${goalLv}"
        onchange="if(window.HearthriseAuto && document.querySelector('.ah-traingoal input[type=checkbox]').checked){window.HearthriseAuto.setTrainGoal({skillId:'${skillId}', targetLevel:Math.max(${lv + 1}, parseInt(this.value,10) || ${lv + 1}), enabled:true});}"
        style="width:50px;padding:2px 4px;background:rgba(255,255,255,.04);border:1px solid var(--line-soft);border-radius:4px;color:var(--ink);font-size:calc(14.5px * var(--ui-scale, 1))"
      />
    </div>`;

  return `<div class="act-head">${iconHtml}
    <div class="ah-meta">
      <div class="ah-row1"><span class="ah-name">${s.name}</span><span class="ah-lvl"><em>Level</em>${lv}</span></div>
      <div class="ah-xp">${xp.toLocaleString()}${lv < 99 ? ' / ' + (xp + toNext).toLocaleString() + ' XP' : ' XP · MAX'}${presenceNote()}</div>
      <div class="ah-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
      ${goalControl}
    </div>
  </div>`;
}

function tileForGather(action, skillId) {
  const lv = window.getLevel(skillId);
  const unlocked = lv >= action.req;
  const active = window.G.activeSkill === skillId && window.G.skillTargetId === action.id;
  const qty = window.G.inventory?.[action.prod] || 0;
  /* b226: the tile must state the paced duration, tool speed included — the
     number on the card is a promise, and startSkill() honours PACE.actionMs. */
  const toolSpeed = (window.HearthriseTools && window.HearthriseTools.bestToolSpeed) ? window.HearthriseTools.bestToolSpeed(skillId) : 0;
  const speed = (typeof window.getBonus === 'function' ? window.getBonus('gatherSpeed') : 0) + toolSpeed;
  const baseMs = (typeof window.pacedActionMs === 'function') ? window.pacedActionMs(action.ms) : action.ms;
  /* b227: through the same fuse the live loop uses. This file is the renderer
     TWIN of legacy.js's tile builder — patch both or you patch neither, or the
     card quotes a rate the engine does not honour. */
  const ms = Math.max(500, Math.floor(baseMs * window.speedClamp(speed)));
  // b129: locked tiles toast their level requirement instead of silently
  // doing nothing — players need feedback, not a dead click.
  const skillName = (window.SKILLS_DEF?.[skillId]?.name) || skillId;
  const click = active
    ? 'stopSkill()'
    : (unlocked
        ? `startSkill('${skillId}','${action.id}',${action.ms})`
        : `notify('Requires ${skillName} Lv ${action.req}','kill')`);
  /* b217: the tile put its name at the top, two grey meta lines under it, then
     a big gap, then the icon floating at the BOTTOM, then a "Qty: 0" pill in
     the corner — so the subject of the card was the last thing you reached and
     the tile was mostly empty space. Icon leads (it's a material; the art is
     the identity), name under it, one meta line, and the level requirement is
     only shown when it actually gates you. "Qty: 0" is not information — the
     count appears only when you own some. */
  return `<div class="act-tile ${unlocked ? '' : 'locked'} ${active ? 'active' : ''}"
    data-prod="${action.prod}" onclick="${click}" title="${(action.name || '').replace(/"/g, '&quot;')}">
    <div class="at-icon">${actIconHtml(action.prod, action.icon)}</div>
    <div class="at-name">${action.name || action.id}</div>
    <div class="at-meta">${effXp(skillId, action.xp)} XP · ${fmtSec(ms)}</div>
    ${qty > 0 ? `<div class="at-qty">${fmtQty(qty)}</div>` : ''}
    ${unlocked ? '' : `<div class="at-lock">${lockGlyph()}Level ${action.req}</div>`}
    ${active ? '<span class="at-stop">Active</span>' : ''}
    ${unlocked ? '<div class="at-prog"><div class="at-prog-fill"></div></div>' : ''}
  </div>`;
}

function lockGlyph() {
  return (window.HR && window.HR.icon) ? (window.HR.icon('uiLock', 12, 'currentColor') || '') : '';
}

function tileForArtisan(recipe, skillId) {
  const lv = window.getLevel(skillId);
  const unlocked = lv >= recipe.req;
  // b226: startArtisan writes activeSkill+skillTargetId, NEVER activeArtisanRecipe
  // — that key made no artisan tile ever .active, so the progress fill never
  // moved (Tyler's "no progress bar when cooking shrimp").
  const active = window.G.activeSkill === skillId && window.G.skillTargetId === recipe.id;
  const outId = recipe.output;
  const outDef = window.ITEMS?.[outId];
  const qty = window.G.inventory?.[outId] || 0;
  // b129: locked artisan tiles toast required level too.
  const skillName = (window.SKILLS_DEF?.[skillId]?.name) || skillId;
  const click = active
    ? 'stopSkill()'
    : (unlocked
        ? `window.startArtisan('${skillId}','${recipe.id}')`
        : `notify('Requires ${skillName} Lv ${recipe.req}','kill')`);
  const inputs = recipe.inputs || (recipe.input ? { [recipe.input]: recipe.inputQty || 1 } : {});
  /* b237 (tester): each input shows what you OWN (e.g. "2× Willow 200"), brightened
     and turned red when you're short of one action's worth. data-have/data-need let
     lightUpdate() refresh the count live as you consume stock. */
  const inputsLine = Object.entries(inputs).map(([id, q]) => {
    const d = window.ITEMS?.[id];
    const nm = d ? d.n.split(' ')[0] : id;
    const have = (window.G.inventory && window.G.inventory[id]) || 0;
    return `${q > 1 ? q + '× ' : ''}${nm} <span class="at-have${have < q ? ' low' : ''}" data-have="${id}" data-need="${q}">${fmtQty(have)}</span>`;
  }).join(' + ');
  // b225: the campfire ruling — cooking is ungated but the open fire burns, so
  // every cooking tile carries its live burn risk. Built by the SAME helper the
  // legacy renderer uses (window.burnRiskLine), which reads the same
  // cookBurnChance() the cook itself rolls — one number, three surfaces.
  const burnLine = (typeof window.burnRiskLine === 'function') ? window.burnRiskLine(recipe, skillId) : '';
  const burnText = (typeof window.burnRiskText === 'function') ? window.burnRiskText(recipe, skillId) : '';
  const tileTitle = (recipe.name || '') + (burnText ? ' — ' + burnText : '');
  return `<div class="act-tile ${unlocked ? '' : 'locked'} ${active ? 'active' : ''}"
    data-prod="${outId}" onclick="${click}" title="${tileTitle.replace(/"/g, '&quot;')}">
    <div class="at-icon">${actIconHtml(outId, outDef ? outDef.icon : '')}</div>
    <div class="at-name">${recipe.name || recipe.id}</div>
    <div class="at-meta">${effXp(skillId, recipe.xp)} XP · ${fmtSec(artisanMs(skillId, recipe.ms || 3000))}</div>
    <div class="at-inputs">${inputsLine}</div>
    ${burnLine}
    ${qty > 0 ? `<div class="at-qty">${fmtQty(qty)}</div>` : ''}
    ${unlocked ? '' : `<div class="at-lock">${lockGlyph()}Level ${recipe.req}</div>`}
    ${active ? '<span class="at-stop">Active</span>' : ''}
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
  /* b226: innerHTML, and the presence note is re-rendered on every light
     update — it has to DIM the moment the input window lapses, or the hint
     would keep promising a bonus the player is no longer getting. */
  if (ahXp) ahXp.innerHTML = `Experience: ${xp.toLocaleString()}${lv < 99 ? ' / ' + (xp + toNext).toLocaleString() : ' MAX'}` + presenceNote();
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
  // b237: keep each input's owned-count live as it's consumed (saw planks →
  // watch the log count fall, turn red when you're short of one action's worth).
  detail.querySelectorAll('.at-inputs .at-have[data-have]').forEach((el) => {
    const id = el.getAttribute('data-have');
    const need = parseInt(el.getAttribute('data-need'), 10) || 1;
    const have = (window.G.inventory && window.G.inventory[id]) || 0;
    el.textContent = fmtQty(have);
    el.classList.toggle('low', have < need);
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

  // b220: the artisan category strip lives in legacy.js block 27 (the copy
  // that actually paints the Skills screen) and is published as
  // window.HearthriseArtisanCat so this twin renders identically rather than
  // holding a second implementation that can drift. Selection is part of the
  // render key so switching lanes forces a rebuild, not a lightUpdate.
  const artCat = window.HearthriseArtisanCat || null;
  const catSel = artCat ? artCat.selected(id) : null;
  // Level is in the key too: lightUpdate never repaints tiles, so a level-up
  // used to leave newly-unlocked activities greyed out until something else
  // forced a rebuild. (Kept identical to the legacy twin in block 27.)
  const catLv = typeof window.getLevel === 'function' ? window.getLevel(id) : 0;
  // b225: the Kitchen's noBurn joins the key, because the cooking tiles print a
  // live burn risk — building or upgrading a Kitchen must repaint them rather
  // than leave the old odds on screen. (Kept identical to the legacy twin.)
  const catBurn = (id === 'cooking' && typeof window.getBonus === 'function') ? window.getBonus('noBurn') : '';
  const activeKey = `${window.G.activeSkill || ''}|${window.G.skillTargetId || ''}|${window.G.activeArtisanRecipe || ''}|${catSel || ''}|${catLv}|${catBurn}`;
  const detailEl = document.getElementById('skill-detail');
  const alreadyRendered = detailEl && detailEl.querySelector('.act-grid');
  if (alreadyRendered && window._actLastRender.skillId === id && window._actLastRender.activeKey === activeKey) {
    lightUpdate(id);
    return;
  }
  window._actLastRender = { skillId: id, activeKey };

  const titleEl = document.getElementById('skill-detail-title');
  // b217: was `s.icon + ' ' + s.name` — an emoji plus a name already shown
  // in the identity block below. Headings label the region, not the content.
  if (titleEl) titleEl.textContent = 'Train';

  const head = buildHead(id);
  let tiles = '';
  let count = 0;
  let cats = '';

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
    const recipes = artCat ? artCat.recipesFor(id) : ARTISAN_RECIPES[id];
    cats = artCat ? artCat.strip(id) : '';
    tiles = recipes.map((r) => tileForArtisan(r, id)).join('');
    count = recipes.length;
  } else {
    tiles = `<div class="act-tile" style="grid-column:1/-1"><div class="at-name">No activities</div><div class="at-meta">This skill has no available activities.</div></div>`;
    count = 1;
  }

  // b215: size tiles by a readable MINIMUM WIDTH and let the grid reflow.
  //
  // This used to be a hand-tuned count table ("keeps everything in ~2 rows
  // max") that topped out at "more than 15 recipes → 6 columns". Smithing now
  // has 81 recipes, which squeezed every tile to 94px wide and 26px tall —
  // names clipped to "FORGE", stats invisible. A column count tuned to
  // today's content breaks the moment content grows; a minimum width doesn't.
  // auto-fit (not auto-fill) so a skill with 3 activities still fills the row.
  const grid = `<div class="act-grid" style="grid-template-columns:repeat(auto-fit,minmax(186px,1fr))">${tiles}</div>`;
  if (detailEl) detailEl.innerHTML = head + cats + grid;
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
      /* b217: the tile stacked icon / "Lv 1" / bar / name vertically in a
         185px square, which left ~60px of dead space per tile and — worse —
         set "Lv 1" at 14px bold while the skill's own NAME was 10px grey. The
         stat was louder than the thing it described, across sixteen tiles.
         Now a row: medallion, name as the subject, level as a right-aligned
         figure, bar underneath. Denser, and the hierarchy is the right way up. */
      // b217: see the matching note in legacy.js — the emoji branch was the
      // live path, since no skill has a PNG mapped.
      const iconHtml = window._skillIcon?.[id]
        ? `<img src="${window._skillIcon[id]}" alt="" loading="lazy" />`
        : `<span class="sicon">${(window.HearthriseIconSet?.medallion?.(id, 30)) || ''}</span>`;
      return `<button class="skill-tile ${active}" onclick="openSkillDetail('${id}')">
        <span class="st-ic">${iconHtml}</span>
        <span class="st-body">
          <span class="snm">${s.name}</span>
          <span class="bar xp"><i style="width:${pct}%"></i></span>
        </span>
        <span class="slv">${lv}</span>
      </button>`;
    }).join('');
    return `<div class="skill-cat">${label}</div>
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
