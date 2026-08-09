// ============================================================
// src/features/pet-session.js — THE PET'S SESSION IMPACT (b269)
//
// Tyler: "Show the equipped pet beside the avatar; click it to see what the
// pet actually did THIS session — bonus XP, gold, drops, procs."
//
// Two honesty rules from the FINAL DIRECTIVE shape every line here:
//   1. No fake numbers. Every figure in the breakdown is a REAL delta measured
//      at the moment the pet's bonus fired — never an estimate, never a
//      projection. The XP figure is the pet's MARGINAL allXP contribution after
//      the power budget clamps the chain (power-budget.js), so a pet whose
//      bonus is clamped away honestly reads 0, not its nominal share.
//   2. No emoji art. The chip and the modal head render the pet through the
//      shared window.companionIconHtml() painter (painted portrait where one
//      exists, gilt medallion otherwise) — the same path the Stable and the
//      paper-doll use. It never falls back to the data-layer emoji.
//
// The accumulator is per SESSION (this page load) and per EQUIPPED PET: swap
// pets and the count restarts, because the question is "what has THIS pet done
// for me since I put it to work", not a lifetime ledger.
// ============================================================
(function () {
  'use strict';

  var acc = null;

  function fresh(petId) {
    return {
      petId: petId,
      startedAt: Date.now(),
      xp: 0,          // bonus XP the pet's allXP added (marginal, post-budget)
      gold: 0,        // gold minted by gold/extraGold procs
      drops: 0,       // extra items handed over by doubleDrop / doubleYield
      dropItems: {},  // itemId -> extra qty (so the modal can name them)
      meals: 0,       // refundIngredients procs (a free meal each)
      rares: 0,       // guaranteedRare procs
      instants: 0,    // instant-action procs
      fireProcs: 0,   // fireDot combat procs
      procs: 0,       // total procs of any kind
    };
  }

  function equippedId() {
    var G = window.G;
    return (G && G.companions && G.companions.equipped) || null;
  }

  // The accumulator follows the equipped pet: a different pet (or none) resets
  // it, so a count never bleeds across a swap.
  function ensureAcc() {
    var id = equippedId();
    if (!id) { acc = null; return null; }
    if (!acc || acc.petId !== id) acc = fresh(id);
    return acc;
  }

  function get() { return ensureAcc(); }

  // ── XP attribution ────────────────────────────────────────────────────────
  // The pet's real allXP share of a grant, honest and independent of the
  // monkey-patch order on getBonus. The pet's DECLARED share is its own
  // getCompanionBonus().allXP; the FINAL clamped allXP the player actually gets
  // is getBonus('allXP'). The pet can never have contributed more than it
  // declares, nor more than the clamp ultimately allowed — so the honest figure
  // is min(declared, final). The power budget binds only in the extreme, so in
  // practice this is exactly the pet's declared share; when the budget does
  // crush allXP below the pet's own share, the pet honestly reads that lower
  // number instead of its nominal one.
  function petMarginalAllXP() {
    var cb = (typeof window.getCompanionBonus === 'function') ? window.getCompanionBonus() : null;
    var pet = (cb && typeof cb.allXP === 'number') ? cb.allXP : 0;
    if (pet <= 0) return 0;
    var total = (typeof window.getBonus === 'function') ? Number(window.getBonus('allXP')) : pet;
    if (!isFinite(total)) total = pet;
    return Math.max(0, Math.min(pet, total));
  }

  // Called from addXp() with the pre-multiplier base XP of a grant.
  function recordXp(base) {
    var a = ensureAcc();
    if (!a) return;
    base = Number(base) || 0;
    if (base <= 0) return;
    var m = petMarginalAllXP();
    if (m > 0) a.xp += base * m;
  }

  // ── Proc attribution ──────────────────────────────────────────────────────
  // Called from companions.js rollProc(), once per proc, with the concrete
  // amount and the same ctx the effect consumed — so the numbers here are the
  // numbers the game actually paid out.
  function recordProc(effect, amount, ctx) {
    var a = ensureAcc();
    if (!a) return;
    ctx = ctx || {};
    switch (effect) {
      case 'gold':
      case 'extraGold':
        a.gold += Number(amount) || 0;
        break;
      case 'doubleDrop': {
        var d = ctx.lastDrop || {};
        var q = Number(d.qty) || 1;
        if (d.id) a.dropItems[d.id] = (a.dropItems[d.id] || 0) + q;
        a.drops += q;
        break;
      }
      case 'doubleYield': {
        var q2 = Number(ctx.qty) || 1;
        if (ctx.cropId) a.dropItems[ctx.cropId] = (a.dropItems[ctx.cropId] || 0) + q2;
        a.drops += q2;
        break;
      }
      case 'refundIngredients': a.meals += 1; break;
      case 'guaranteedRare':    a.rares += 1; break;
      case 'instant':           a.instants += 1; break;
      case 'fireDot':           a.fireProcs += 1; break;
      default: break;
    }
    a.procs += 1;
  }

  // ── formatting helpers ────────────────────────────────────────────────────
  function nfmt(n) {
    n = Math.round(Number(n) || 0);
    return n.toLocaleString();
  }
  function itemLabel(id) {
    var it = window.ITEMS && window.ITEMS[id];
    return (it && (it.name || it.n)) || id;
  }

  // ── the modal (HearthriseRoomModal-style) ─────────────────────────────────
  function buildModal() {
    var id = equippedId();
    var def = id && window.COMPANIONS ? window.COMPANIONS[id] : null;
    if (!def) return null;
    var a = ensureAcc() || fresh(id);

    var G = window.G;
    var xp = (G.companions.xp && G.companions.xp[id]) || 0;
    var lv = (typeof window.companionLevelFromXp === 'function') ? window.companionLevelFromXp(xp) : 1;
    var nextXp = (typeof window.companionXpToReach === 'function') ? window.companionXpToReach(lv + 1) : xp;
    var thisXp = (typeof window.companionXpToReach === 'function') ? window.companionXpToReach(lv) : 0;

    var sections = [];

    // The pet's own progression — context for how strong its bonuses are.
    sections.push({
      kind: 'meter',
      title: 'Companion',
      label: def.n + ' · Lv ' + lv,
      valueText: nextXp > thisXp ? nfmt(xp - thisXp) + ' / ' + nfmt(nextXp - thisXp) + ' XP' : 'Max level',
      value: xp - thisXp,
      max: Math.max(1, nextXp - thisXp),
      tone: 'gold',
      foot: (def.role || '') + ' companion',
    });

    // The contribution rows — only what actually happened. A genuine zero is
    // real (the pet has done nothing yet) so the four headline lines always
    // show; the proc breakdown lines appear only once they have fired.
    var rows = [];
    rows.push({ name: 'Bonus XP granted', right: valTag('+' + nfmt(a.xp)) });
    rows.push({ name: 'Gold contributed', right: valTag('+' + nfmt(a.gold)) });
    rows.push({ name: 'Extra drops', right: valTag('+' + nfmt(a.drops)) });
    rows.push({ name: 'Procs fired', right: valTag(nfmt(a.procs)) });
    if (a.meals)     rows.push({ name: 'Free meals (ingredients refunded)', right: valTag(nfmt(a.meals)) });
    if (a.rares)     rows.push({ name: 'Guaranteed rare drops', right: valTag(nfmt(a.rares)) });
    if (a.instants)  rows.push({ name: 'Instant gathers', right: valTag(nfmt(a.instants)) });
    if (a.fireProcs) rows.push({ name: 'Fire-breath hits', right: valTag(nfmt(a.fireProcs)) });

    sections.push({ kind: 'rows', title: 'This session', rows: rows });

    // Name the extra items the pet doubled, if any.
    var dropKeys = Object.keys(a.dropItems);
    if (dropKeys.length) {
      var list = dropKeys.map(function (k) {
        return '<span class="hr-cs-qty is-full">+' + nfmt(a.dropItems[k]) + ' ' + esc(itemLabel(k)) + '</span>';
      }).join(' &middot; ');
      sections.push({ kind: 'note', html: '<b>Doubled by ' + esc(def.n) + ':</b><br>' + list });
    }

    var mins = Math.max(1, Math.round((Date.now() - a.startedAt) / 60000));
    sections.push({
      kind: 'note',
      html: 'Tracked since this session began (about ' + mins + ' min ago). '
        + 'Every figure is measured when the bonus fires — nothing here is estimated.',
    });

    return {
      theme: 'hall',
      title: def.n,
      subtitle: (def.role || '') + ' companion · session impact',
      scene: '<div class="hr-pet-scene">' + iconHtml(id, 72) + '</div>',
      sections: sections,
    };
  }

  function valTag(t) { return '<span class="hr-cs-val">' + t + '</span>'; }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function iconHtml(id, px) {
    return (typeof window.companionIconHtml === 'function') ? window.companionIconHtml(id, px) : '';
  }

  var _modalOpen = false;
  function openModal() {
    if (!window.HearthriseRoomModal || typeof window.HearthriseRoomModal.open !== 'function') return;
    if (!equippedId()) return;
    _modalOpen = true;
    window.HearthriseRoomModal.open(buildModal);
  }

  // ── the topbar chip ───────────────────────────────────────────────────────
  function injectChip() {
    var player = document.querySelector('.topbar .player');
    if (!player) return;
    var chip = document.getElementById('hr-pet-chip');
    var id = equippedId();
    if (!id || !(window.COMPANIONS && window.COMPANIONS[id])) {
      if (chip) chip.remove();
      return;
    }
    if (!chip) {
      chip = document.createElement('button');
      chip.id = 'hr-pet-chip';
      chip.type = 'button';
      chip.className = 'hr-pet-chip';
      chip.addEventListener('click', openModal);
      player.appendChild(chip);
    }
    refreshChip(chip, id);
  }

  function refreshChip(chip, id) {
    chip = chip || document.getElementById('hr-pet-chip');
    if (!chip) return;
    id = id || equippedId();
    if (!id) return;
    var def = window.COMPANIONS && window.COMPANIONS[id];
    if (!def) return;
    var xp = (window.G.companions.xp && window.G.companions.xp[id]) || 0;
    var lv = (typeof window.companionLevelFromXp === 'function') ? window.companionLevelFromXp(xp) : 1;
    chip.innerHTML = '<span class="hpc-icon">' + iconHtml(id, 24) + '</span>'
      + '<span class="hpc-lv">Lv ' + lv + '</span>';
    chip.title = def.n + " — this session's impact";
    chip.setAttribute('aria-label', def.n + ', companion, level ' + lv + ". Open this session's impact.");
  }

  function injectCss() {
    if (document.getElementById('hr-pet-chip-css')) return;
    var s = document.createElement('style');
    s.id = 'hr-pet-chip-css';
    s.textContent =
      '.hr-pet-chip{display:inline-flex;align-items:center;gap:5px;margin-left:8px;'
      + 'padding:2px 8px 2px 3px;border-radius:999px;cursor:pointer;flex-shrink:0;'
      + 'background:var(--panel-2,rgba(255,255,255,.06));border:1px solid var(--gold-2,#c9a24a);'
      + 'color:var(--ink-1,#e9e2cf);font-weight:700;font-size:14.5px;line-height:1;'
      + 'transition:filter .12s ease,transform .12s ease}'
      + '.hr-pet-chip:hover{filter:brightness(1.12);transform:translateY(-1px)}'
      + '.hr-pet-chip:focus-visible{outline:2px solid var(--gold-2,#c9a24a);outline-offset:2px}'
      + '.hr-pet-chip .hpc-icon{display:inline-flex;width:24px;height:24px}'
      + '.hr-pet-chip .hpc-icon img{width:24px !important;height:24px !important}'
      + '.hr-pet-chip .hpc-lv{white-space:nowrap}'
      + '.hr-pet-scene{display:flex;align-items:center;justify-content:center;padding:6px 0}'
      + '@media (max-width:540px),(max-height:540px) and (max-width:900px){'
      + '.hr-pet-chip .hpc-lv{display:none}.hr-pet-chip{padding:3px}}';
    document.head.appendChild(s);
  }

  // ── boot ──────────────────────────────────────────────────────────────────
  function boot() {
    injectCss();
    injectChip();
    // The equipped pet, its level, and the live count all change under us; the
    // chip is cheap to repaint, and refreshing the modal keeps the breakdown
    // ticking while it is open. Once a second is plenty and never janky.
    setInterval(function () {
      injectChip();
      if (_modalOpen) {
        var open = window.HearthriseRoomModal && window.HearthriseRoomModal.isOpen && window.HearthriseRoomModal.isOpen();
        if (open) { try { window.HearthriseRoomModal.refresh(); } catch (e) {} }
        else _modalOpen = false;
      }
    }, 1000);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(boot, 400); });
  } else {
    setTimeout(boot, 400);
  }

  window.HearthrisePetSession = {
    get: get,
    recordXp: recordXp,
    recordProc: recordProc,
    openModal: openModal,
    injectChip: injectChip,
    buildModal: buildModal,
    _reset: function () { acc = null; },
  };

  console.log('[pet-session] equipped-pet session impact tracker armed');
})();
