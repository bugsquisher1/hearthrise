// Combat-rendering module. Just the visible UI: monster picker, arena placeholder,
// loadout panel updates. The combat ENGINE (combatTick, killMonster, damage rolls)
// stays in the monolith — too tightly coupled to engine internals to extract safely
// in this pass. Will move once the engine itself is modularised.
//
// What this module owns:
//   - Reading from MONSTERS data (now from src/data/monsters.js)
//   - Rendering #monster-list when entering Combat tab
//   - Rendering tier filter chips
//   - b227: the ARENA HUD — the controls that sit on the fighting stage itself
//     (the Eat button on your side, Loot/Stats on the enemy's) and the two
//     modals those open. See the HearthriseCombatHud block below.
//
// Imports: MONSTERS, ITEMS
// Exports: setupCombatRender()

import { MONSTERS } from '../data/monsters.js?v=325';
import { ITEMS } from '../data/items.js?v=325';

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

/* ══════════════════════════════════════════════════════════════════════════
   THE ARENA HUD (b227)
   ══════════════════════════════════════════════════════════════════════════
   Two things Tyler called out on the combat screen, which turned out to be one
   structural problem:

     "the eat food button is hard to read, and it needs to be closer to the
      character screen. Right now I have to scroll down to see it."
     "the possible loot / DPS statistics should be modals that you click on
      near the enemy avatar, not a scrollable thing across the bottom."

   The combat screen had a fixed stage (portraits + HP bars) and, underneath it,
   ONE scrolling box holding everything else: a Forecast card, a six-tile maths
   grid, the combat log, the food controls and the drop table. Measured on the
   two windows the team supports, that box was 441px tall holding 735px at
   1440×900, and 91px tall holding 796px at 900×760. The Eat button rendered
   last, so it sat 470px below the fold — during a fight, on the control that
   stops you dying.

   The fix is a division of labour rather than a reshuffle:

     ACTIONS live on the stage, beside the fighter they belong to. Eating is
     yours, so Eat sits under YOUR HP bar. Looking the foe up is about them, so
     Loot and Stats sit under THEIRS. Neither can scroll away, because the stage
     does not scroll.

     REFERENCE lives in modals. Drop rates and damage maths are things you read
     between decisions, not things you watch — so they cost a click and cost
     zero permanent screen height. They use HearthriseRoomModal, the house modal
     seam, so a player who has closed one already knows how to close these.

   Everything below reads the ENGINE's own helpers (getPlayerCombatRolls,
   getMonsterCombatRolls, getWeaknessInfo). No second copy of the damage maths:
   a stats panel that disagrees with the fight it describes is worse than none.
   ────────────────────────────────────────────────────────────────────────── */

const num = (n) => Math.round(n).toLocaleString();
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

function tickMs() {
  return (window.COMBAT_BALANCE && window.COMBAT_BALANCE.tickMs) || 2400;
}
function weaponLabel(type) {
  return (window.WEAPON_TYPES && window.WEAPON_TYPES[type]) || type || '—';
}

/* One derivation of "what happens if I stand here", used by the Stats modal.
   The kill-time formula is the one the old Forecast card used, kept verbatim so
   the numbers a player memorised before b227 still read the same. */
function forecast(m) {
  const eq = window.getEquipmentStats ? window.getEquipmentStats() : {};
  const you = window.getPlayerCombatRolls ? window.getPlayerCombatRolls(m, eq) : null;
  const foe = window.getMonsterCombatRolls ? window.getMonsterCombatRolls(m, eq) : null;
  const weak = window.getWeaknessInfo ? window.getWeaknessInfo(m, eq) : null;
  if (!you || !foe) return null;
  const swingS = tickMs() / 1000;
  const avgDmg = ((1 + you.maxHit) / 2) * you.accuracy;
  const dps = avgDmg / swingS;
  const killS = m.hp / Math.max(0.01, dps);
  const killsHr = 3600 / killS;
  const gp = m.gp || [0, 0];
  const style = window.getActiveCombatStyle ? window.getActiveCombatStyle() : null;
  const trains = style && style.xp ? Object.keys(style.xp)[0] : 'attack';
  return {
    eq, you, foe, weak, swingS, dps, killS, killsHr,
    xpHr: killsHr * (m.xp || 0),
    goldHr: killsHr * ((gp[0] + gp[1]) / 2),
    trains, trainsPct: style && style.xp ? style.xp[trains] : 1,
  };
}

/* ── The player's action: Eat ──────────────────────────────────────────────
   Three states, and all three say something true. The two disabled ones name
   the reason on the button rather than hiding it in a tooltip, because a
   greyed control with no explanation is the thing that made the old food row
   read as broken. */
function eatState() {
  const G = window.G;
  if (!G) return null;
  const id = typeof window.bestProvisionId === 'function' ? window.bestProvisionId() : null;
  const info = id && typeof window.foodUseInfo === 'function' ? window.foodUseInfo(id) : null;
  if (!info) {
    return { key: 'none', label: 'No healing food', meta: 'Cook fish or bake bread',
      title: 'You have no Provisions — cook fish or bake bread to get some' };
  }
  if (G.playerHp >= G.playerMaxHp) {
    return { key: 'full', label: 'Full health', meta: `${ITEMS[id].n} · ${G.inventory[id]} held`,
      title: 'Your health is already full' };
  }
  return {
    key: 'eat', id,
    label: `Eat ${ITEMS[id].n}`,
    meta: `+${info.heals} HP · ${G.inventory[id]} left`,
    title: `${ITEMS[id].n} — heals ${info.heals}, you have ${G.inventory[id]}`,
  };
}

const HUD = (() => {
  let openKind = null;   // 'loot' | 'stats' | null — which of OUR modals is up
  let openFor = null;    // the monster id it was opened for
  let lastSig = '';      // last painted modal payload, so a live refresh is a no-op when nothing moved

  function modal() { return window.HearthriseRoomModal || null; }

  /* ── Paint: the player's Eat button ─────────────────────────────────────
     Diffed before it is written. This runs on the arena's 200ms tick, and
     replacing the node every tick would cancel a press mid-click and throw
     away :hover — a button you cannot reliably click is a worse bug than the
     one being fixed. */
  function paintPlayer(mount) {
    const s = eatState();
    if (!s) { mount.innerHTML = ''; mount.dataset.sig = ''; return; }
    /* b267 (paione, Android landscape): the auto-eat FOOD PICKER lived only in the
       scrolling combat area, which is below the fold on a short landscape screen —
       "on landscape I don't have the option to select food". Surface it here in
       the always-visible HUD, beside the Eat button, when the player owns the
       Auto-Eat trait. */
    const hasAuto = typeof window.hasTrait === 'function' && window.hasTrait('auto_eat');
    const eatCfg = (window.HearthriseAuto && window.HearthriseAuto.getEat) ? window.HearthriseAuto.getEat() : null;
    const autoName = hasAuto
      ? ((eatCfg && eatCfg.enabled && eatCfg.foodId && window.ITEMS[eatCfg.foodId]) ? window.ITEMS[eatCfg.foodId].n : 'Off')
      : '';
    const sig = [s.key, s.label, s.meta, autoName].join('|');
    if (mount.dataset.sig === sig) return;
    mount.dataset.sig = sig;
    const on = s.key === 'eat';
    let html =
      `<button type="button" class="btn arena-eat${on ? ' btn-primary' : ' is-idle'}"` +
      `${on ? '' : ' disabled'} data-arena-act="eat" title="${esc(s.title)}">` +
      `<span class="ae-lbl">${esc(s.label)}</span>` +
      `<span class="ae-meta">${esc(s.meta)}</span></button>`;
    if (hasAuto) {
      html +=
        `<button type="button" class="btn btn-sm arena-autoeat" data-arena-act="autoeat" ` +
        `title="Choose which food auto-eat uses">Auto-eat: ${esc(autoName)} ▾</button>`;
    }
    mount.innerHTML = html;
  }

  /* ── Paint: the foe's two reference chips ───────────────────────────────*/
  function paintFoe(mount) {
    if (mount.dataset.sig === 'chips') return;
    mount.dataset.sig = 'chips';
    mount.innerHTML =
      '<button type="button" class="btn btn-sm arena-chip" data-arena-act="loot" ' +
        'title="What this foe drops, and how often">Loot</button>' +
      '<button type="button" class="btn btn-sm arena-chip" data-arena-act="stats" ' +
        'title="The combat maths for this fight">Stats</button>';
  }

  function onClick(e) {
    const btn = e.target.closest && e.target.closest('[data-arena-act]');
    if (!btn || btn.disabled) return;
    e.preventDefault();
    const act = btn.getAttribute('data-arena-act');
    if (act === 'eat') {
      if (typeof window.eatBestProvision === 'function') window.eatBestProvision();
      refresh();
    } else if (act === 'loot') { openLoot(); }
    else if (act === 'stats') { openStats(); }
    else if (act === 'autoeat') { if (typeof window.openAutoEatPicker === 'function') window.openAutoEatPicker(); }
  }

  // ── The Loot modal ──────────────────────────────────────────────────────
  // The drop rows reuse `.combat-drop-row` and its rarity bands from
  // legacy.css — the same list players already read under the arena, now with
  // somewhere to live. There is no icon column: 35 of the 59 items that drop
  // in the game have no painted art yet, and the alternative in the old strip
  // was an emoji, which this project does not ship as art.
  function rarityBand(ch) {
    if (ch >= 0.5) return 'r-common';
    if (ch >= 0.15) return 'r-uncommon';
    if (ch >= 0.05) return 'r-rare';
    if (ch >= 0.01) return 'r-vrare';
    return 'r-legendary';
  }

  function buildLoot() {
    const G = window.G;
    const m = G && G.activeMonster ? MONSTERS[G.activeMonster] : null;
    if (!m) return null;
    const eq = window.getEquipmentStats ? window.getEquipmentStats() : {};
    const weak = window.getWeaknessInfo ? window.getWeaknessInfo(m, eq) : { dropMult: 1 };
    const mult = weak.dropMult || 1;
    const rows = (m.drops || []).map((d) => {
      const base = d.ch;
      const eff = base >= 1 ? 1 : Math.min(0.95, base * mult);
      const def = ITEMS[d.id];
      const pct = eff >= 1 ? 'always' : (eff * 100 >= 1 ? (eff * 100).toFixed(0) : (eff * 100).toFixed(1)) + '%';
      const lifted = mult > 1 && base < 1;
      return {
        name: `<span class="cdr-name">${esc(def ? def.n : d.id)}</span>`,
        meta: lifted ? `${(base * 100).toFixed(base * 100 >= 1 ? 0 : 1)}% base, lifted by your matchup` : '',
        right: `<span class="hr-cs-amt cdr-pct">${pct}</span>`,
        band: rarityBand(eff),
      };
    });
    const gp = m.gp || [0, 0];
    const sections = [
      { kind: 'rows', title: 'Drops', rows, empty: 'This foe carries nothing worth taking.' },
      { kind: 'rows', title: 'Coin', rows: [{
        name: 'Gold', meta: 'rolled fresh on every kill',
        right: `<span class="hr-cs-amt">${gp[0]}–${gp[1]}</span>`,
      }] },
      { kind: 'note', html:
        'Every line rolls on its own, so one kill can pay out several — or none. ' +
        (mult > 1
          ? `${esc(m.name)} fears no weapon, and an even matchup pays <b>${Math.round((mult - 1) * 100)}% better</b> — the rates above already include it.`
          : `${esc(m.name)} is weak to <b>${esc(weaponLabel(m.weaponWeak))}</b>; bringing one raises your damage and accuracy, not your drop rates.`) },
    ];
    return {
      id: 'combat-loot', theme: 'vault',
      title: `${m.name} — what it drops`,
      subtitle: `Tier ${m.tier || 1} &middot; ${esc(m.family || 'monster')}`,
      sections,
    };
  }

  // ── The Stats modal ─────────────────────────────────────────────────────
  function buildStats() {
    const G = window.G;
    const m = G && G.activeMonster ? MONSTERS[G.activeMonster] : null;
    if (!m) return null;
    const f = forecast(m);
    if (!f) return null;
    const amt = (v) => `<span class="hr-cs-amt">${v}</span>`;
    const matched = f.weak && f.weak.matched;
    const neutral = m.weaponWeak === 'neutral';
    return {
      id: 'combat-stats', theme: 'warroom',
      title: `${m.name} — the maths`,
      subtitle: 'Read live from the same rolls the fight is using',
      sections: [
        { kind: 'rows', title: 'Your swing', rows: [
          { name: 'Hit chance', meta: 'how often a swing connects at all', right: amt(Math.round(f.you.accuracy * 100) + '%') },
          { name: 'Max hit', meta: 'damage rolls between 1 and this', right: amt(f.you.maxHit) },
          { name: 'Damage per second', meta: `averaged over one swing every ${f.swingS}s`, right: amt(f.dps.toFixed(1)) },
        ] },
        { kind: 'rows', title: 'Their swing', rows: [
          { name: 'Hit chance', meta: 'against your Defence and armour', right: amt(Math.round(f.foe.accuracy * 100) + '%') },
          { name: 'Max hit', meta: 'the worst single blow you can take', right: amt(f.foe.maxHit) },
          { name: 'Their health', meta: 'restored in full on respawn', right: amt(m.hp) },
        ] },
        { kind: 'rows', title: 'Matchup', rows: [
          { name: 'You are carrying', meta: 'the weapon decides which skills swing', right: amt(weaponLabel(f.eq.weaponType)) },
          { name: 'It fears', meta: neutral
              ? 'nothing — an even fight, and 15% better drops for it'
              : (matched ? 'you brought it: +20% damage, +15% accuracy' : 'bring this and both go up'),
            right: amt(weaponLabel(m.weaponWeak)) },
        ] },
        { kind: 'rows', title: 'If you stay here', rows: [
          { name: 'Time to kill', meta: 'one foe, from full health', right: amt(f.killS.toFixed(1) + 's') },
          { name: 'Kills per hour', right: amt(f.killsHr.toFixed(1)) },
          { name: 'Combat XP per hour', meta: `split by your style — mostly ${esc(f.trains)} at ${Math.round(f.trainsPct * 100)}%`, right: amt(num(f.xpHr)) },
          { name: 'Gold per hour', meta: 'coin only; drops are worth more', right: amt(num(f.goldHr)) },
        ] },
        { kind: 'note', html:
          'These are averages over a long session, not a promise about the next swing. ' +
          'Anything that changes your gear or your levels changes them while you watch.' },
      ],
    };
  }

  /* HearthriseRoomModal is a shared singleton and its `rows` section has no
     slot for a per-row class, so two combat-specific things are stamped on
     after each paint: a `data-combat-hud` marker (so this module can tell its
     own modal from anyone else's before touching it) and the rarity band on
     the drop rows. Both keep the shared component free of combat vocabulary. */
  function stamp(kind, desc) {
    const scrim = document.querySelector('.hr-room-scrim');
    if (!scrim) return;
    scrim.dataset.combatHud = kind;
    scrim.classList.add('hr-room-combat');
    const bands = [];
    (desc.sections || []).forEach((s) => {
      if (s.kind === 'rows') (s.rows || []).forEach((r) => bands.push(r.band || null));
    });
    scrim.querySelectorAll('.hr-cs-row').forEach((el, i) => {
      if (bands[i]) el.classList.add('combat-drop-row', bands[i]);
    });
  }
  /* The open modal, but only if it is one of ours. */
  function mine() {
    const RM = modal();
    if (!RM || !RM.isOpen()) return null;
    const scrim = document.querySelector('.hr-room-scrim');
    return scrim && scrim.dataset.combatHud ? scrim : null;
  }

  function show(kind, build) {
    const RM = modal();
    if (!RM) return false;
    const desc = build();
    if (!desc) return false;
    RM.open(build);
    openKind = kind;
    openFor = window.G && window.G.activeMonster;
    lastSig = JSON.stringify(desc);
    stamp(kind, desc);
    return true;
  }
  function openLoot() { return show('loot', buildLoot); }
  function openStats() { return show('stats', buildStats); }

  function closeMine() {
    const RM = modal();
    if (RM && mine()) RM.close();
    openKind = null; openFor = null; lastSig = '';
  }

  /* Keep an open modal honest. Repaint only when the payload actually changed
     (a level-up mid-fight moves every number; a swing moves none of them), so
     the common case is a string compare and no DOM work at all. */
  function syncModal() {
    if (!openKind) return;
    if (!mine()) { openKind = null; openFor = null; lastSig = ''; return; }
    const G = window.G;
    if (!G || !G.activeMonster || G.activeMonster !== openFor) { closeMine(); return; }
    const desc = (openKind === 'loot' ? buildLoot : buildStats)();
    if (!desc) { closeMine(); return; }
    const sig = JSON.stringify(desc);
    if (sig === lastSig) return;
    lastSig = sig;
    modal().refresh();
    stamp(openKind, desc);
  }

  function refresh() {
    const G = window.G;
    const fighting = !!(G && G.activeMonster);
    if (!fighting) { closeMine(); return; }
    if (window.HearthriseArenaStage) window.HearthriseArenaStage.ensure();
    const you = document.getElementById('arena-act-player');
    const foe = document.getElementById('arena-act-foe');
    if (you) paintPlayer(you);
    if (foe) paintFoe(foe);
    /* Delegated from the stage, and the flag lives on the ELEMENT rather than
       in this closure: if anything ever rebuilds .arena-vs, a module-level
       "already wired" boolean would leave every control on the new stage dead
       with nothing to show for it. */
    const vs = document.querySelector('#panel-combat .arena-vs');
    if (vs && !vs.__hudWired) { vs.addEventListener('click', onClick); vs.__hudWired = true; }
    syncModal();
  }

  return { refresh, openLoot, openStats, close: closeMine, _forecast: forecast, _eatState: eatState };
})();

export function setupArenaHud() {
  window.HearthriseCombatHud = HUD;
  HUD.refresh();
}

export function setupCombatRender() {
  // Replace the legacy renderer
  window.renderMonsterList = renderMonsterList;
  setupArenaHud();

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
