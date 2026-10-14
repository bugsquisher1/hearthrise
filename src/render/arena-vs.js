// ════════════════════════════════════════════════════════════════════════
// src/render/arena-vs.js — THE FIGHT VIEW'S "YOU vs FOE" STAGE (out of legacy.js, lane W3).
//
// Toggles body.in-combat and keeps a "PLAYER vs FOE" portrait + HP bar panel in
// #panel-combat .combat-arena while a fight is active (src/features/combat-screens.js
// replaces the markup with its own `fs-stage`, keeping these ids). The two
// action slots under the bars are MOUNTS painted by HearthriseCombatHud
// (src/features/combat-render.js): the stage owns the geometry, the HUD owns
// the contents.
//
// Damage pops and the death throe are a SUBSCRIBER of the one swing observer
// (src/render/combat-observer.js): the stage no longer wraps combatTick itself.
// ════════════════════════════════════════════════════════════════════════
import { installCombatObserver } from './combat-observer.js?v=578';

const glyph = (key, px) => (window.HR && window.HR.icon ? window.HR.icon(key, px, 'currentColor') || '' : '');

function ensureArenaVs() {
  const arena = document.querySelector('#panel-combat .combat-arena');
  if (!arena) return null;
  let vs = arena.querySelector(':scope > .arena-vs');
  if (!vs) {
    vs = document.createElement('div');
    vs.className = 'arena-vs';
    vs.innerHTML = `
      <div class="arena-side player">
        <div class="arena-portrait" id="arena-player-portrait">${glyph('navCharacter', 48)}</div>
        <div class="arena-name" id="arena-player-name">You</div>
        <div class="arena-hp-bar"><i id="arena-player-hp" style="width:100%"></i></div>
        <div class="arena-hp-text" id="arena-player-hp-text">10 / 10</div>
        <div class="arena-act arena-act-player" id="arena-act-player"></div>
      </div>
      <div class="arena-vs-divider">VS</div>
      <div class="arena-side foe">
        <div class="arena-portrait" id="arena-foe-portrait">${glyph('uiSkull', 48)}</div>
        <div class="arena-name" id="arena-foe-name">—</div>
        <div class="arena-hp-bar"><i id="arena-foe-hp" style="width:100%"></i></div>
        <div class="arena-hp-text" id="arena-foe-hp-text">— / —</div>
        <div class="arena-act arena-act-foe" id="arena-act-foe"></div>
      </div>`;
    const head = arena.querySelector('.card-head');
    if (head && head.nextSibling) arena.insertBefore(vs, head.nextSibling);
    else arena.appendChild(vs);
  }
  return vs;
}

const byId = (id) => document.getElementById(id);
const hud = () => { if (window.HearthriseCombatHud) window.HearthriseCombatHud.refresh(); };

function paintPet(pp, G) {
  /* b278: the equipped companion perches beside the hero; the data-pet guard
     makes the 200 ms refresh a no-op once drawn. */
  let petHost = byId('arena-player-pet');
  if (!petHost) { petHost = document.createElement('div'); petHost.id = 'arena-player-pet'; petHost.className = 'arena-pet'; pp.appendChild(petHost); }
  const petId = (G.companions && G.companions.equipped) || null;
  if (petId && window.COMPANIONS && window.COMPANIONS[petId] && typeof window.companionIconHtml === 'function') {
    const want = 'pet:' + petId;
    if (petHost.getAttribute('data-pet') !== want) {
      petHost.innerHTML = window.companionIconHtml(petId, 30);
      petHost.setAttribute('data-pet', want);
      petHost.title = (window.COMPANIONS[petId].n || 'Companion') + ' — fighting with you';
    }
    petHost.style.display = '';
  } else petHost.style.display = 'none';
}

function refreshArenaVs() {
  const G = window.G;
  const inCombat = !!(G && G.activeMonster);
  document.body.classList.toggle('in-combat', inCombat);
  const existing = document.querySelector('#panel-combat .combat-arena > .arena-vs');
  if (!inCombat) {
    if (existing) existing.style.display = 'none';   // no stale portraits between fights
    hud();
    return;
  }
  ensureArenaVs();
  if (existing) existing.style.display = '';
  const id = G.activeMonster;
  const m = window.MONSTERS && window.MONSTERS[id];
  const foeIcon = (window._monsterIcon && window._monsterIcon[id])
    ? '<img src="' + window._monsterIcon[id] + '" alt="">'
    : (typeof window.monsterFallbackIcon === 'function' ? window.monsterFallbackIcon(id, 64) : '');
  /* b297: rewrite the foe icon only when it changes, so a damage pop or the
     DEFEATED stamp appended to the portrait survives the 200 ms refresh. */
  const pf = byId('arena-foe-portrait');
  if (pf) {
    const want = id + '|' + foeIcon;
    if (pf.getAttribute('data-foe') !== want) { pf.innerHTML = foeIcon; pf.setAttribute('data-foe', want); }
  }
  const pn = byId('arena-foe-name'), phb = byId('arena-foe-hp'), pht = byId('arena-foe-hp-text');
  if (pn) pn.textContent = (m && m.name) || id;
  const foePct = G.monsterMaxHp ? Math.max(0, (G.monsterHp / G.monsterMaxHp) * 100) : 0;
  if (phb) phb.style.width = foePct.toFixed(1) + '%';
  if (pht) pht.textContent = (G.monsterHp || 0) + ' / ' + (G.monsterMaxHp || 0);

  const pp = byId('arena-player-portrait');
  /* b186/b371: the painted portrait, set once (damage pops survive) and on the
     identity seam's repaint registry through data-hr-avatar. */
  if (pp && !pp.querySelector('img')) {
    pp.innerHTML = '<img src="' + (window._playerAvatar || 'assets/icons-bundle/painted/npc/player.png') + '" alt="" data-hr-avatar>';
  }
  const pnp = byId('arena-player-name'), php = byId('arena-player-hp'), phpt = byId('arena-player-hp-text');
  if (pnp) pnp.textContent = G.playerName || 'You';
  const pPct = G.playerMaxHp ? Math.max(0, (G.playerHp / G.playerMaxHp) * 100) : 0;
  if (php) php.style.width = pPct.toFixed(1) + '%';
  if (phpt) phpt.textContent = (G.playerHp || 0) + ' / ' + (G.playerMaxHp || 0);
  if (pp) paintPet(pp, G);
  /* b227: the action slots ride the same tick as the HP bars, so "Eat · +8 HP"
     can never disagree with the HP printed above it. */
  hud();
}

function popDmg(target, value, opts) {
  if (!target) return;
  const o = opts || {};
  const num = document.createElement('div');
  num.className = 'dmg-num-vs' + (o.kill ? ' kill' : '') + (o.crit ? ' crit' : '') + (o.miss ? ' miss' : '');
  num.textContent = o.miss ? 'miss' : (value > 0 ? '-' + value : '0');
  target.appendChild(num);
  if (!o.miss) {
    target.classList.add('hit-shake');
    setTimeout(() => target.classList.remove('hit-shake'), 320);
  }
  setTimeout(() => num.remove(), 1100);
}

/* b297: the death throe. The engine has already respawned the foe by the time
   the beat arrives, so the killing number is the HP it had before the blow. */
function deathFx(target, beat) {
  if (!target) return;
  popDmg(target, beat.foeDmg, { kill: true, crit: beat.crit });
  const tag = document.createElement('div');
  tag.className = 'defeat-tag';
  tag.textContent = 'Defeated';
  target.appendChild(tag);
  setTimeout(() => { if (tag.parentNode) tag.parentNode.removeChild(tag); }, 1300);
  target.classList.add('foe-dying');
  setTimeout(() => target.classList.remove('foe-dying'), 760);
}

function onBeat(beat) {
  const foeP = document.querySelector('#panel-combat .arena-vs .arena-side.foe .arena-portrait');
  const youP = document.querySelector('#panel-combat .arena-vs .arena-side.player .arena-portrait');
  if (beat.killed) deathFx(foeP, beat);
  else if (beat.foeDmg > 0) popDmg(foeP, beat.foeDmg, { crit: beat.crit });
  else if (beat.miss) popDmg(foeP, 0, { miss: true });
  if (beat.heroDmg > 0) popDmg(youP, beat.heroDmg, {});
}

export function setupArenaVs() {
  /* b227: the build step is published so the HUD can paint into the stage on
     demand instead of waiting for the next refresh. */
  window.HearthriseArenaStage = { ensure: ensureArenaVs, refresh: refreshArenaVs };
  setInterval(refreshArenaVs, 200);
  installCombatObserver(window).subscribe(onBeat);
}
