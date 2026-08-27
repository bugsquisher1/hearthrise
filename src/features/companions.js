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

import { COMPANIONS } from '../data/companions.js?v=485';
import { emit } from '../net/events.js?v=485';
/* THE SERVER-OF-RECORD ARM SWITCH for companion XP. While false (DORMANT) the
   client awards companion XP locally exactly as before. When flipped true, the
   accrual engine becomes the sole writer (a `stat companion_xp:<id>` op priced
   at settle/away) and the local award below MUST stop, or the two double-count:
   the server accrues the same role-matched actions this client seam does. The
   passive bonus already reads server companion XP through hr_perks_of, so under
   arm the level shown reconciles to server truth. */
import { COMPANION_XP_SERVER_BACKED } from '../core/companion-xp.js?v=485';

// b229 (Asset Director — "pet icons"): every companion in COMPANIONS still
// carries an emoji `icon` field (data stays as-authored — other consumers may
// still want a text label), but render sites bypass it through the shared
// helper legacy.js defines (`companionIconHtml()`, alongside the
// COMPANION_PORTRAIT map + the honest-match reasoning for why only 2 of the
// 22 have painted art yet). legacy.js loads before this module's render
// functions ever run, so the window binding is always present by call time;
// the ternary is defense-in-depth only, and it degrades to nothing — never
// back to the emoji — if it's ever missing.
function companionIconHtml(id, px) {
  return (typeof window.companionIconHtml === 'function') ? window.companionIconHtml(id, px) : '';
}

// ── b371 (F20) — THE LOCK HINT IS COPY, NOT A KEY ────────────────────────
//
// The Stable printed `Locked · ${def.source}` straight from the data, so the
// player was shown "Locked · shop:8000:cooking25", "Locked · drop:small_wolf",
// "Locked · hatch:dragon_egg" and "Locked · skill:fishing:2500" — nineteen
// internal identifiers, on the screen whose entire job is to tell you how to
// get the thing. `small_wolf` is not even the monster's name (it is "Wolf
// Cub"), so the one hint a player could half-parse pointed at a creature that
// does not exist under that name anywhere in the game.
//
// Every part is resolved from the same tables the rest of the UI reads, so a
// renamed monster or a re-tuned rate updates here for free. Anything this
// function cannot resolve degrades to the id it was given rather than to a
// blank — an unhelpful hint beats a missing one, and it stays greppable.
export function companionSourceLabel(source) {
  const raw = String(source || '');
  const p = raw.split(':');
  /* Last-resort humaniser. `hatch:dragon_egg` was the case that proved it is
     needed: there is no `dragon_egg` row in ITEMS at all (it is a hatch source
     with no inventory entry), so the lookup fell through and my first pass
     printed "Hatched from a dragon_egg" — the very defect this function
     exists to remove, reintroduced by its own fallback. Caught by reading the
     render, not the code. */
  const titleize = (id) => String(id || '')
    .split(/[_\-:]/).filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
  const monster = (id) => {
    const m = window.MONSTERS && window.MONSTERS[id];
    return (m && (m.name || m.n)) || titleize(id);
  };
  const item = (id) => {
    const it = window.ITEMS && window.ITEMS[id];
    return (it && (it.n || it.name)) || titleize(id);
  };
  const skill = (id) => {
    const s = window.SKILLS_DEF && window.SKILLS_DEF[id];
    return (s && s.name) || titleize(id);
  };
  const num = (n) => Number(n || 0).toLocaleString();

  switch (p[0]) {
    case 'starter': return 'Yours from the start';
    case 'drop':    return `Rare drop from ${monster(p[1])}`;
    case 'hatch':   return `Hatched from a ${item(p[1])}`;
    /* Exactly one quest source exists today (`quest:harvest100`, the Bunny).
       A table rather than a parse, because "harvest100" is a milestone name,
       not a grammar — guessing a sentence out of it would be inventing copy. */
    case 'quest':   return ({ harvest100: 'Reward for harvesting 100 crops' })[p[1]] || 'Quest reward';
    case 'shop':
      // shop:GOLD  |  shop:GOLD:skillLEVEL  (e.g. shop:8000:cooking25)
      if (p[2]) {
        const gate = /^([a-z]+)(\d+)$/.exec(p[2]);
        if (gate) return `Stable shop · ${num(p[1])} gold · needs ${skill(gate[1])} ${gate[2]}`;
        return `Stable shop · ${num(p[1])} gold`;
      }
      return `Stable shop · ${num(p[1])} gold`;
    case 'skill':   return `1 in ${num(p[2])} ${skill(p[1])} actions`;
    case 'boss':    return `1 in ${num(p[2])} ${monster(p[1])} kills`;
    default:        return `Locked · ${raw}`;
  }
}

// XP curve: cumulative XP needed to reach level L.
//
// b228 — THE CAP DID NOT MATCH THE CURVE. The comment here said "~50K at L30"
// and awardCompanionXp clamped cumulative XP to 50,000; the curve actually
// needs 792,783 to reach 30. So every pet in the game stopped dead at level 14,
// halfway up a bar the Stable draws as "Lv N / 30", and the last sixteen levels
// were unreachable. Found by the rebase, because the power budget's companion
// share is stated at level 30 (×2.45) and a pet that can never get there is a
// budget line nobody can spend.
//
// The cap is now DERIVED from the curve — one source of truth, so the two can
// never disagree again. This is a power increase, and it lands in the same
// commit as the magnitudes that pay for it: a maxed pet is +2.45% on its key,
// which is the share §2.2 budgets for "a 1-in-2,500 pet at level 30".
export const COMPANION_MAX_LEVEL = 30;
export function companionXpToReach(L) {
  if (L <= 1) return 0;
  let total = 0;
  for (let i = 1; i < L; i++) total += Math.floor(50 * Math.pow(1.18, i - 1) * i);
  return total;
}
export const COMPANION_XP_CAP = companionXpToReach(COMPANION_MAX_LEVEL);

export function companionLevelFromXp(xp) {
  for (let L = 30; L >= 1; L--) {
    if (xp >= companionXpToReach(L)) return L;
  }
  return 1;
}

/* Is the blob-retire capstone armed? Read at call time off the window global —
   companions.js must stay free of an import cycle with the net layer, and the
   capstone flag is published there. Dormant (prod) → false, so every gate below is
   byte-for-byte today's behaviour. */
function blobRetired() {
  try {
    return !!(window.HearthriseCapstone
      && typeof window.HearthriseCapstone.isBlobRetired === 'function'
      && window.HearthriseCapstone.isBlobRetired());
  } catch (e) { return false; }
}

function ensureState() {
  const G = window.G;
  if (!G) return;
  /* ⚠ FAIL-CLOSED UNDER ARM (critical blocker) — mirror of legacy.js
     ensureCompanionState. Under the blob-retire arm the SERVER owns the roster
     (rebuilt by accrue.js reconcileCompanions from the envelope); seeding the
     starter fox here BEFORE that envelope arrives would silently reset the player.
     So under arm we seed an EMPTY roster, never fox, and never read a client
     equip value. Dormant, the original block runs unchanged. */
  if (blobRetired()) {
    if (!G.companions) G.companions = { ownedIds: [], xp: {}, equipped: null };
    return;
  }
  if (!G.companions) {
    G.companions = {
      ownedIds: ['fox'],
      xp: { fox: 0 },
      equipped: (window.HearthriseEquipRead ? window.HearthriseEquipRead.equippedItem(G, 'companion') : (G.equipment && G.equipment.companion)) === 'fox_companion' ? 'fox' : null,
    };
  }
  if ((window.HearthriseEquipRead ? window.HearthriseEquipRead.equippedItem(G, 'companion') : (G.equipment && G.equipment.companion)) === 'fox_companion' && !G.companions.equipped) {
    G.companions.equipped = 'fox';
  }
}

// ── Stat queries ──

export function getCompanionBonus() {
  ensureState();
  const out = {
    strB: 0, atkB: 0, defB: 0, crit: 0, allXP: 0,
    gatherSpeed: 0, farmYield: 0, cookSpeed: 0, smithSpeed: 0,
    craftSpeed: 0, prayerSpeed: 0, rareDrop: 0, goldFind: 0, hpRegen: 0,
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
  /* ⚠ SERVER-OF-RECORD GATE (dormant). When companion XP is server-backed the
     accrual engine writes it (per role-matched action, at settle/away) and this
     local award would DOUBLE-COUNT — so it no-ops entirely. The equipped pet's
     level then comes from the server (hr_perks_of companion xp), reconciled on
     the next envelope, never authored here. While dormant this is inert and the
     client remains the writer, so there is no regression. */
  if (COMPANION_XP_SERVER_BACKED) return;
  /* ⚠ ALSO GATED OFF UNDER THE BLOB-RETIRE ARM. Companion XP is a SERVER-OWNED
     aggregate (player_progress kind='stat' key='companion_xp:<id>') the accrual
     engine writes, and under arm reconcileCompanions rebuilds G.companions.xp from
     the envelope every load. A local award would be authored-then-discarded (the
     blob is not uploaded under arm), so at best it makes the XP bar climb and then
     snap back to server truth on the next envelope. The client renders server
     state; it never authors an authoritative number. Dormant this is inert. */
  if (blobRetired()) return;
  ensureState();
  const eq = window.G?.companions?.equipped;
  if (!eq) return;
  const before = window.G.companions.xp[eq] || 0;
  const beforeLv = companionLevelFromXp(before);
  const next = Math.min(COMPANION_XP_CAP, before + amount);
  window.G.companions.xp[eq] = next;
  const afterLv = companionLevelFromXp(next);
  if (afterLv > beforeLv) {
    emit('companionLevelUp', { id: eq, level: afterLv });
    /* b313 (paione — companion stats mismatch): the equipment doll's Companion
       pane is only rebuilt when the doll is, so after a pet LEVELS UP it kept
       showing the old level/stats while inventory + combat (which read the live
       companion bonus every call) already showed the higher numbers. Refresh the
       doll on the level change so both agree. Guarded; only fires on a level-up. */
    try { if (typeof window.refreshAllDolls === 'function') window.refreshAllDolls(); } catch (e) {}
    try { if (typeof window.renderStable === 'function' && window.activeTab === 'stable') window.renderStable(); } catch (e) {}
  }
}

export function unlockCompanion(id) {
  ensureState();
  if (!COMPANIONS[id]) return false;
  if (window.G.companions.ownedIds.includes(id)) return false;
  window.G.companions.ownedIds.push(id);
  window.G.companions.xp[id] = 0;
  if (typeof window.notify === 'function') {
    /* b465: the trailing `${...icon}` pasted the data row's raw emoji into a
       plain-text toast — the Final Directive's no-emoji-as-art rule, in a
       string. The companion's NAME is the thing worth saying. */
    window.notify(`Companion unlocked: ${COMPANIONS[id].n}`, 'loot');
  }
  emit('companionUnlock', { id });
  maybeServerGrant(id);
  return true;
}

/* ── SERVER TRANSPORT (companion-grant) — persist a NON-SHOP acquisition ──────
   Every non-shop companion reaches G.companions.ownedIds through unlockCompanion
   (drops + hatch here, the bunny quest here, and pets.js skill/boss pets all call
   window.unlockCompanion). Under the blob-retire capstone arm the client stops
   loading the save blob and reconcileCompanions (accrue.js) rebuilds G.companions
   from the SERVER owned-set (companion:<id> unlock rows), so a companion acquired
   with no server row is DROPPED on the next reload — a real player loss. This
   fire-and-reconcile call writes that server row (hr_companion_grant), so the
   acquisition survives.

   ⚠ DORMANT = BYTE-UNCHANGED. Gated on the capstone arm (blobRetired(), the same
   signal reconcileCompanions uses), so while dormant NO network call is made and
   the local ownedIds write above is exactly today's behaviour. Under arm the
   server row is what reconcileCompanions reads back.

   SHOP companions are skipped — they already get their server row from
   hr_unlock_buy (legacy.js buy → HearthriseGold.buyUnlock), and hr_companion_grant
   would refuse them 'not_grantable' anyway. The starter fox is owned by grammar
   (no row). Fire-and-forget: a refusal costs nothing the client authored. */
function maybeServerGrant(id) {
  try {
    if (!blobRetired()) return;                       // DORMANT: no call, byte-unchanged
    const def = COMPANIONS[id];
    const kind = String((def && def.source) || '').split(':')[0];
    if (!kind || kind === 'shop' || kind === 'starter') return;
    const gc = window.HearthriseGoalClaim;
    if (gc && typeof gc.grantCompanion === 'function') {
      const p = gc.grantCompanion(id, (def && def.source) || '');
      if (p && p.catch) p.catch(function () {});
    }
  } catch (e) {}
}

export function equipCompanion(id) {
  ensureState();
  if (!window.G.companions.ownedIds.includes(id)) {
    if (typeof window.notify === 'function') window.notify("You don't own that companion", 'kill');
    return;
  }
  window.G.companions.equipped = id;
  if (window.G.equipment) window.G.equipment.companion = id === 'fox' ? 'fox_companion' : id;
  /* SERVER TRANSPORT (b420) — tell the server which companion is equipped so
     hr_perks_of prices its passive bonus at accrual. The local write above is a
     DISPLAY PREDICTION for responsiveness; the server owns the equipped id
     (player_state.companion_equipped, written only by hr_companion_equip after an
     ownership check) and reconciles on the next envelope. Fire-and-forget: a
     refusal (not_owned / collect_first) costs nothing the client authored — the
     bonus is server-priced off the SERVER's equipped id, never this local one. */
  try {
    var _gc = window.HearthriseGoalClaim;
    if (_gc && typeof _gc.equipCompanion === 'function') {
      var _p = _gc.equipCompanion(id);
      if (_p && _p.catch) _p.catch(function () {});
    }
  } catch (e) {}
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
  /* SERVER TRANSPORT (b420) — clear the server-owned equipped id (unequip is
     always allowed server-side). Same fire-and-forget display-prediction shape as
     equipCompanion above. */
  try {
    var _gc = window.HearthriseGoalClaim;
    if (_gc && typeof _gc.unequipCompanion === 'function') {
      var _p = _gc.unequipCompanion();
      if (_p && _p.catch) _p.catch(function () {});
    }
  } catch (e) {}
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
    /* Font floor (project HARD RULE, enforced by the b227 document scan): the proc
       toast was 13.5px — below the 14.5px floor. It slips past the scan only when
       no toast is live, so it was a latent violation; the headless page throttles
       the removal timer below, which can keep the toast alive long enough for the
       scan to catch it. Use the scalable floor form the rest of the UI uses
       (calc(14.5px * --ui-scale)). Colour left as-is and flagged to the Art
       Director in CONFLICTS.md (the toast bg/ink are hardcoded, not tokens). */
    el.style.cssText = 'position:fixed;top:60px;right:20px;z-index:99998;background:rgba(127,154,79,.95);'
      + 'color:#0f1320;padding:6px 12px;border-radius:6px;font-weight:800;font-size:calc(14.5px * var(--ui-scale, 1));'
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
  /* Through the SEEDED session stream, not Math.random() — the same rule the
     drop roll below and dungeons.js's key drop already follow, and the last of
     the three deferred in b342.

     Every proc trigger is reachable from the AWAY replay: 'kill' rides the
     killMonster wrapper (23 draws in a 30-minute away night on the lich,
     measured), 'gather' and 'cook' ride the addItem wrapper (400 draws in a
     400-action away gather night, measured). A proc PAYS — the raccoon's
     `extraGold` is 5 gold a kill — so a bare draw here means the server and
     the client compute different totals for the same absence from the same
     seed: measured at 7,899 gold against 7,789 for one identical pinned-seed
     night, varying nothing but Math.random(). Falls back only if the core has
     not booted. */
  const C = window.HearthriseCore;
  const hit = (C && C.rng) ? C.rng.chance(def.proc.chance) : (Math.random() < def.proc.chance);
  if (!hit) return;
  const e = def.proc.effect;
  /* ARM-SAFE (gold flip): a companion gold proc is a live client-authored grant
     (its away-replay twin is priced by combat-sim, but the LIVE tick here is not
     server-credited). Under arm the gold credit no-ops, so DEFER the whole proc —
     do NOT show a "+Xg" proc animation or record a contribution the pet did not
     make. A proc latches nothing, so deferring is simply firing nothing this
     draw. No-op until gold is armed, so seeded parity is unchanged. */
  if ((e === 'gold' || e === 'extraGold')
      && window.clientMayWriteRecordField && !window.clientMayWriteRecordField('gold')) return;
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
  showProc(def.proc.label);
  // b269: record the pet's real, concrete contribution for the session-impact
  // panel — the amount/ctx here are exactly what the effect above paid out.
  if (window.HearthrisePetSession) {
    try { window.HearthrisePetSession.recordProc(e, def.proc.amount, ctx); } catch (err) {}
  }
  emit('companionProc', { id: G.companions.equipped, effect: e });
}

/* monsterId -> [[companionId, def]] for every `drop:<monsterId>` source.
   Built once, lazily, and keyed on the table's identity so a data reload or a
   test substituting the catalogue invalidates it rather than serving a stale
   index. Scales with content: adding fifty companions adds fifty rows here,
   not fifty comparisons per kill. */
let _dropIndex = null, _dropIndexFor = null;
function dropSourcesFor(monsterId) {
  if (_dropIndexFor !== COMPANIONS) {
    _dropIndexFor = COMPANIONS;
    _dropIndex = Object.create(null);
    for (const [id, def] of Object.entries(COMPANIONS)) {
      const src = parseSource(def.source);
      if (src?.kind !== 'drop' || !src.arg1) continue;
      (_dropIndex[src.arg1] || (_dropIndex[src.arg1] = [])).push([id, def]);
    }
  }
  return _dropIndex[monsterId] || [];
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
      /* Drop check, through a PREBUILT index. This used to walk the whole
         COMPANIONS table (Object.entries + a string split per row) on every
         kill; a 12-hour away catch-up is ~1,000 kills, and since the away
         unification an away kill comes through this wrapper too. The index is
         a pure lookup — same rows, same order, no behaviour change. */
      for (const [id, def] of dropSourcesFor(monsterId)) {
        if (window.G.companions?.ownedIds?.includes(id)) continue;
        const chance = DROP_CHANCES[id] ?? 0.01;
        /* Through the SEEDED session stream, not Math.random(): this roll is
           part of what a kill pays, and a kill must be replayable end to end
           or a server-side accrual dispute cannot be adjudicated. Falls back
           only if the core has not booted. */
        const C = window.HearthriseCore;
        const hit = (C && C.rng) ? C.rng.chance(chance) : (Math.random() < chance);
        if (hit) {
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
    t.textContent = `New companion unlocked: ${def.n}!`;
    t.style.cssText = 'position:fixed;top:80px;left:50%;transform:translateX(-50%);z-index:99999;'
      + 'background:linear-gradient(180deg,#7f9a4f,#3a8a52);color:#fff;padding:14px 22px;border-radius:8px;'
      + 'font-weight:800;font-size:15px;box-shadow:0 8px 32px rgba(0,0,0,.5);'
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
      /* b373: in-game modal, never window.confirm — the native dialog blocks
         the renderer (src/utils/dialog.js). The egg is re-checked INSIDE the
         answer: the modal does not stop the game, so the stack can change (a
         second tap, a market sale) between the question and the hatch, and
         consuming an egg the player no longer has would mint a companion. */
      const D = window.HearthriseDialog;
      if (D && D.confirm) {
        D.confirm({ title: 'Hatch the Dragon Egg?',
          body: 'The egg is consumed and a Whelp joins you as a companion.',
          confirmLabel: 'Hatch' }).then(function (ok) {
          if (!ok) return;
          if (!(window.G?.inventory?.dragon_egg > 0)) return;
          window.G.inventory.dragon_egg--;
          unlockCompanion('whelp');
          if (typeof window.renderInvFancy === 'function') window.renderInvFancy();
        });
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
  // b269: the Stable belongs under Homestead (Tyler) — pets are a homestead
  // fixture, not an adventuring activity. Final placement (incl. timing retries)
  // is owned by legacy.js moveStableNav(); this just creates the button under
  // Homestead when the label is present.
  const labels = sidebar.querySelectorAll('.nav-group-label');
  let groupLabel = null;
  labels.forEach((l) => { if (l.textContent.trim() === 'Homestead') groupLabel = l; });
  const btn = document.createElement('button');
  btn.className = 'nav-btn';
  btn.dataset.tab = 'stable';
  btn.innerHTML = '<span class="ic">' + ((window.HR && window.HR.icon) ? (window.HR.icon('navStable', 19, 'currentColor') || '') : '') + '</span><span class="lbl">Stable</span>';
  btn.addEventListener('click', () => window.showTab && window.showTab('stable'));
  if (groupLabel) {
    let next = groupLabel.nextElementSibling;
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

  /* b371 — was five literal hexes, one of them (#d4a8e8) a LAVENDER, which is
     the exact palette drift the art direction forbids: there is no lavender
     anywhere else in Hearthrise. These are the project's own semantic roles,
     so they re-tint with the theme instead of being a private palette that
     only this file knows about. */
  const roleColor = {
    combat:  'var(--red-line)',
    gather:  'var(--green)',
    artisan: 'var(--gold-2)',
    utility: 'var(--steel)',
    hybrid:  'var(--ink-3)',
  };
  // b228: the three misspelled keys are gone from the data, so the Stable now
  // labels the real ones. `farmYield` moves out of the percent list — it is a
  // count of extra crops and always was.
  const labelMap = {
    strB: 'STR', atkB: 'ATK', defB: 'DEF', crit: 'Crit', allXP: 'All XP',
    gatherSpeed: 'Gather', farmYield: 'Farm yield', cookSpeed: 'Cook speed',
    smithSpeed: 'Smith speed', craftSpeed: 'Craft speed', prayerSpeed: 'Prayer speed',
    rareDrop: 'Rare drop', goldFind: 'Gold find', hpRegen: 'HP/sec',
  };
  const isPercent = (k) => ['crit', 'allXP', 'gatherSpeed', 'cookSpeed', 'smithSpeed',
    'craftSpeed', 'prayerSpeed', 'rareDrop', 'goldFind'].includes(k);

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
        <span class="sc-icon">${companionIconHtml(id, 44)}</span>
        <div>
          <div class="sc-name">${def.n}</div>
          <div class="sc-role" style="color:${roleColor[def.role] || '#9aa3b0'}">${def.role}</div>
        </div>
      </div>
      <div class="sc-bonuses">${bonuses}</div>
      ${owned ? `
        <div class="sc-bar"><i style="width:${pct.toFixed(1)}%"></i></div>
        <div style="font-size:13.5px;color:var(--ink-3)">${xp.toLocaleString()} / ${nextXp.toLocaleString()} XP</div>
        ${def.proc ? `<div class="sc-bonuses" style="font-size:13.5px;font-style:italic">${def.proc.label} (${(def.proc.chance * 100).toFixed(0)}% on ${def.proc.trigger})</div>` : ''}
        <button class="sc-equip" onclick="${equipped ? 'window.unequipCompanion()' : `window.equipCompanion('${id}')`}">${equipped ? 'Unequip' : 'Equip'}</button>
      ` : `<div class="sc-source">${companionSourceLabel(def.source)}</div>`}
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
  card.innerHTML = `<div class="cc-icon">${companionIconHtml(id, 32)}</div>
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
  // b229: expose so the smoke test can force a synchronous re-render instead
  // of racing the 30ms setTimeout the showTab hook below schedules — the
  // Stable emoji-sweep guard needs to inspect the DOM right after mutating
  // G.companions, not after an arbitrary timer fires.
  window.renderStable = renderStable;
  window.unequipCompanion = unequipCompanion;
  /* b371 (F20): the lock-hint humaniser is pure and is exactly the kind of copy
     that rots silently when a monster or a skill is renamed, so it is published
     for the guard that walks every authored `source` in the data. */
  window.HearthriseCompanions = Object.assign(window.HearthriseCompanions || {}, {
    sourceLabel: companionSourceLabel,
  });

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
  window.HearthriseShowTab.wrapShowTab('stable-render', function (name) {
    if (name === 'stable') setTimeout(renderStable, 30);
  });

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
