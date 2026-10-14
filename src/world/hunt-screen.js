// ════════════════════════════════════════════════════════════════════════
// src/world/hunt-screen.js — THE HUNT SCREEN'S CONTROLLER (lane B1).
//
// Glue between the server's word and the three surfaces that show it: the HUD
// (hunt-chrome.js), the Configure Action sheet (hunt-config.js) and the supply
// bag (hunt-pack.js). It READS window.G (the server scratch src/net/hunt.js
// writes, the record's inventory, HP and skills, the stamina projection, the
// bestiary mirror) and SENDS every gesture through window.HearthriseHunt — it
// writes nothing to G and talks to no server itself (world-no-authority).
// Its own state is view state only: Details open, the tracker closed, a rename
// in progress. A refusal is told to the player in the server's own terms
// (HearthriseHunt.refusalSentence) through the game's toast.
// ════════════════════════════════════════════════════════════════════════
import { MONSTERS } from '../data/monsters.js?v=582';
import { HUNT_INDEX } from '../data/hunts.js?v=582';
import { DEFAULT_PRESET, ACTION_SET_LIMITS } from '../data/rule-subjects.js?v=582';
import { xpPct, levelFromXp } from '../core/xp.js?v=582';
import { createConfigSheet } from './hunt-config.js?v=582';
import { createPackSheet } from './hunt-pack.js?v=582';
import { huntTier } from './hunt-bar.js?v=582';

/** The presets to offer: the saved rows, with the catalogue default standing in for an unsaved preset 0. */
export function setsOf(rows) {
  const out = (Array.isArray(rows) ? rows : []).map((r) => ({ preset: Number(r.preset), name: String(r.name || ''), slots: Array.isArray(r.slots) ? r.slots : [] }));
  if (!out.some((r) => r.preset === 0)) out.push({ preset: 0, name: DEFAULT_PRESET.name, slots: DEFAULT_PRESET.slots });
  return out.sort((a, b) => a.preset - b.preset);
}

/**
 * @param {{win: Window, doc: Document, art: (id: string) => string}} o
 * @returns {{handlers, input(G, now), active(G): boolean, watch(on), takePack(), destroy()}}
 */
export function createHuntScreen(o) {
  const win = o.win;
  const H = () => win.HearthriseHunt || null;
  let details = false, trackerOpen = true, renaming = false, seenAt = -1;

  const snap = () => { const h = H(); return h ? h.snapshot() : { known: false, view: null, sets: null, nextPreset: 0, busy: false, at: 0 }; };
  const say = (res) => {
    if (!res || res.ok === true || res.local) return res;
    const h = H(), text = h ? h.refusalSentence(res) : 'That did not go through.';
    if (typeof win.notify === 'function') win.notify(text, 'warn');
    return res;
  };
  const shownPreset = (sn) => {
    const s = sn.view && sn.view.session;
    return s && !s.ended_at ? Number(s.preset) || 0 : sn.nextPreset | 0;
  };
  const slotsOf = (sn, p) => (setsOf(sn.sets).find((r) => r.preset === p) || { slots: [] }).slots;
  const G = () => win.G || {};

  /* ── the two sheets ── */
  const save = (i, slot) => {
    const sn = snap(), p = shownPreset(sn);
    return H().putSet(p, (slots) => {
      if (i < 0 || i >= slots.length) slots.push(slot); else slots[i] = slot;
      return slots.slice(0, ACTION_SET_LIMITS.slots);
    }).then(say);
  };
  const cfg = createConfigSheet(o.doc, {
    art: o.art, paint: win.HearthrisePaint,
    inputs: () => {
      const sn = snap(), s = sn.view && sn.view.session, open = s && !s.ended_at;
      const counts = {};
      if (open) for (const l of (sn.view.bag || s.bag || [])) counts[l.item] = Number(l.left) || 0;
      else for (const [k, v] of Object.entries(G().inventory || {})) counts[k] = Number(v) || 0;
      const eq = G().equipment || {};
      return { tier: huntTier((s && s.hunt) || pack.hunt() || ''), counts, ammo: eq.ammo || null, counted: open ? 'bag' : 'inventory' };
    },
    save,
    remove: (i) => H().putSet(shownPreset(snap()), (slots) => { slots.splice(i, 1); return slots; }).then(say),
  });
  const openSlot = (i, shift) => {
    const sn = snap(), slots = slotsOf(sn, shownPreset(sn));
    if (i >= 0 && i < slots.length && shift) {
      return H().putSet(shownPreset(sn), (cur) => { if (cur[i]) cur[i].on = cur[i].on === false; return cur; }).then(say);
    }
    cfg.open(i >= 0 && i < slots.length ? i : -1, i >= 0 && i < slots.length ? slots[i] : null);
    return null;
  };
  let packHunt = null;
  const pack = Object.assign(createPackSheet(o.doc, {
    art: o.art, paint: win.HearthrisePaint,
    inputs: (mode) => {
      const sn = snap(), s = sn.view && sn.view.session, p = shownPreset(sn);
      return { have: G().inventory || {}, bag: mode === 'restock' && s ? (sn.view.bag || s.bag || []) : null,
        slots: slotsOf(sn, p), sets: setsOf(sn.sets), preset: p };
    },
    go: (mode, hunt, bag, preset) => {
      if (mode === 'pack') return H().enter(hunt, bag, preset).then(say);
      return bag.reduce((p, l) => p.then((r) => (r && r.ok === false ? r : H().restock(l.item, l.qty))), Promise.resolve(null)).then(say);
    },
    shop: () => {
      const sn = snap();
      return H().putSet(shownPreset(sn), (cur) => {
        const at = cur.findIndex((x) => x && x.item === '*heal_shop');
        if (at >= 0) cur[at].on = cur[at].on === false;
        else cur.push({ item: '*heal_shop', on: true, conditions: [{ subject: 'self_hp_pct', op: '<=', value: 50 }] });
        return cur.slice(0, ACTION_SET_LIMITS.slots);
      }).then(say);
    },
    set: (p) => H().setPreset(p).then(say),
    slot: openSlot,
  }), { hunt: () => packHunt });
  const openPack = (mode, hunt) => { packHunt = hunt; pack.open(mode, hunt, shownPreset(snap())); };

  const handlers = {
    slot: openSlot,
    quick: (i) => H().use(i).then(say),
    set: (v) => {
      const sn = snap();
      if (v === 'rename') { renaming = true; return null; }
      if (v !== 'new') return H().setPreset(Number(v) | 0).then(say);
      const used = new Set(setsOf(sn.sets).map((r) => r.preset));
      let p = 0;
      while (used.has(p) && p < ACTION_SET_LIMITS.presets) p++;
      if (p >= ACTION_SET_LIMITS.presets) return null;
      return H().putSet(p, () => [], 'Set ' + (p + 1)).then((r) => (r && r.ok ? H().setPreset(p) : r)).then(say);
    },
    renameTo: (name) => { renaming = false; return H().putSet(shownPreset(snap()), (cur) => cur, String(name).slice(0, 32)).then(say); },
    'rename-cancel': () => { renaming = false; },
    restock: () => { const s = snap().view.session; openPack('restock', s.hunt); },
    leave: () => {
      const s = snap().view && snap().view.session;
      if (s && !s.ended_at) return H().leave().then(say);
      if (typeof win.stopCombat === 'function') win.stopCombat();
      return null;
    },
    eat: () => { if (typeof win.eatBestProvision === 'function') win.eatBestProvision(); },
    details: () => { details = !details; },
    'tracker-close': () => { trackerOpen = false; },
    'tracker-open': () => { trackerOpen = true; },
    again: () => {
      const s = snap().view.session;
      const bag = (s.bag || []).filter((l) => Number(l.loaded) > 0).map((l) => ({ item: l.item, qty: Number(l.loaded) }));
      return H().enter(s.hunt, bag, Number(s.preset) || 0).then(say);
    },
    'end-close': () => {
      const v = snap().view, s = v.session;
      const ids = (v.recent || []).filter((e) => e.session === s.id).map((e) => Number(e.id));
      return H().markSeen(s.id, ids.length ? Math.max(...ids) : 0).then(say);
    },
  };

  function tracker(huntId) {
    const T = win.HearthriseTrophies;
    const ids = HUNT_INDEX[huntId] ? HUNT_INDEX[huntId].spawns.map((x) => x.monster) : [huntId];
    const known = !!(T && typeof T.countsKnown === 'function' && T.countsKnown());
    return { open: trackerOpen, known, rows: known ? ids.filter((id) => MONSTERS[id]).map((id) => {
      const nx = T.nextOfMonster(id);
      return { name: MONSTERS[id].name, kills: T.killsOfMonster(id), next: nx && nx.row ? nx.row.at : null };
    }) : null };
  }

  /** The HUD's session input, or null when there is nothing to show (no hunt, or an ended one already seen). */
  function input(g, now) {
    const sn = snap(), v = sn.view, s = v && v.session;
    if (sn.at !== seenAt) { seenAt = sn.at; if (cfg.isOpen()) cfg.render(); if (pack.isOpen()) pack.render(); }
    if (!s || (s.ended_at && !(Number(v.unseen) > 0))) return null;
    const p = shownPreset(sn);
    const n = (x) => (x != null && Number.isFinite(Number(x)) ? Number(x) : null);
    const skills = typeof win.hrDisplaySkills === 'function' ? win.hrDisplaySkills() : g.skills;
    const hpXp = skills && n(skills.hitpoints);
    const lv = typeof win.getCombatLevel === 'function' ? n(win.getCombatLevel()) : null;
    const st = g._stamina;
    return {
      view: v, slots: slotsOf(sn, p), sets: setsOf(sn.sets), preset: p, tier: huntTier(s.hunt),
      hp: n(g.playerHp) != null && n(g.playerMaxHp) > 0 ? { hp: n(g.playerHp), max: n(g.playerMaxHp) } : null,
      level: lv != null ? { lv, pct: hpXp != null ? xpPct(hpXp) : 0,
        note: hpXp != null ? 'Hitpoints ' + levelFromXp(hpXp) + ': ' + Math.floor(xpPct(hpXp) * 100) + '% to the next level' : null } : null,
      stamina: st && n(st.ms) != null && n(st.maxMs) > 0 ? { ms: n(st.ms), maxMs: n(st.maxMs) } : null,
      tracker: tracker(s.hunt), details, busy: sn.busy, renaming,
    };
  }

  return {
    handlers, input,
    active: (g) => !!input(g, Date.now()),
    watch: (on) => { const h = H(); if (h) h.watch(on); },
    takePack: () => { const h = H(), p = h && h.takePack(); if (p) openPack('pack', p.hunt); return p; },
    sheets: () => ({ config: cfg.isOpen(), pack: pack.isOpen() }),
    destroy: () => { cfg.close(); pack.close(); const h = H(); if (h) h.watch(false); },
  };
}
