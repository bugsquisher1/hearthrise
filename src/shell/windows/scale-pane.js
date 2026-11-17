// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/scale-pane.js — SCALED HUNT ON A GROUND'S PAGE (audit F26, 2026-11-15: "scaled hunts can't be found from the
// screen"; Tyler 2026-11-07 "make it a per hour slider", "up to 24 hours", "the time only ticks down while in the spawn";
// the designer's rules: src/data/scaled-hunts.js; the mocks: .claude/coordination/mocks/2026-11-10, worded as labels per the 11-14 ruling).
//
// One section under the ground's words, on a ground the server lists in its `scaled_hunts` section (src/session/scaled-hunts.js;
// nothing at all while the server's switch is off). Labels only: the Level the ground is fought at, the price an hour and the hours
// banked, the four dials (Tyler 11-07 "+x% exp +x% more damage from monsters +x% more gold from monsters", and HP) read from the one
// data module the engine plays at the server's Level, "Use scaled hours", the hours slider, Buy and its one confirm. Every number a
// press spends is the server's: the price an hour, the bank, the day's hours and their caps. The slider is display scratch.
// The list's line says it too (scaleTag, hunts.js), so a player scanning the Hunts list finds it. hunts.js owns the window, its status
// line and the run of the press.
// ════════════════════════════════════════════════════════════════════════
import { text, prop, cls, attr } from '../../render/paint.js?v=0.2.137';
import { gold, hoursWords, withSeps } from '../../render/format.js?v=0.2.137';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.137';
import { patchParts } from '../goto.js?v=0.2.137';
import { t } from '../../render/player-text.js?v=0.2.137';
import { scaleFor } from '../../data/scaled-hunts.js?v=0.2.137';
import { scaledHuntsOf, scaledGroundOf, buyScaledHours, setScaledOn } from '../../session/scaled-hunts.js?v=0.2.137';
import { goldOf } from '../../session/item-sections.js?v=0.2.137';

const HOUR_MS = 3600000;
const SCRATCH = new WeakMap();
/* `hours`: the slider per ground (display only, sent with Buy); `asking`: the ground whose confirm is open. */
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { hours: {}, asking: null }; SCRATCH.set(cs, s); } return s; };

/* A dial's permille of the ground's own row as a multiple ("x2.4", "x47"): a Level 60 on the Cellar reads +4,627% as a percent (local world 11-16). */
const times = (pm) => { const x = pm / 1000; return x < 10 ? String(Math.round(x * 10) / 10) : String(Math.round(x)); };

/**
 * WHAT THE SECTION SHOWS for ground `hunt`, or null (no section, a ground the server does not scale). Pure over the server's section,
 * the server's gold and the slider's pick: { level, locked: fromLevel | null, price, bankedMs, on, max (hours the slider offers now,
 * 0 when the bank or the day is full), why ('bank' | 'day' | 'gold' | null), hours, cost, active }.
 */
export function scaleView(sh, hunt, o) {
  const g = scaledGroundOf(sh, hunt);
  if (!g) return null;
  if (g.level === null) return { level: null, locked: g.fromLevel };
  const room = Math.floor((sh.bankMaxMs - g.bankedMs) / HOUR_MS), day = sh.dayMaxHours - sh.todayHours;
  const max = Math.max(0, Math.min(sh.maxHours, room, day));
  const pick = o && Number.isInteger(o.hours) ? o.hours : sh.minHours;
  const hours = Math.min(Math.max(pick, sh.minHours), Math.max(max, sh.minHours));
  const cost = g.price * hours;
  const purse = o && Number.isSafeInteger(o.gold) ? o.gold : null;
  const why = max < sh.minHours ? (room < sh.minHours ? 'bank' : 'day') : purse !== null && purse < cost ? 'gold' : null;
  return { level: g.level, locked: null, price: g.price, bankedMs: g.bankedMs, on: g.on, max, why, hours, cost,
    bankMaxH: Math.floor(sh.bankMaxMs / HOUR_MS), dayMaxH: sh.dayMaxHours, active: !!sh.playing && sh.playing.hunt === hunt ? sh.playing.level : null };
}

/** The Hunts list line's tag for `hunt`: "Scaled: Level 41" while its hours are on and banked, "Scalable" where it can be bought, else ''. */
export function scaleTag(cs, hunt) {
  const g = scaledGroundOf(scaledHuntsOf(cs), hunt);
  if (!g || g.level === null) return '';
  return g.on && g.bankedMs > 0 ? t('hunts.scale_tag_on', { level: g.level }) : t('hunts.scale_tag');
}

export function scaleHtml() {
  return '<section class="hw-hd-scale" aria-label="' + esc(t('hunts.scale_head')) + '" hidden><h4 class="hw-hd-h">' + esc(t('hunts.scale_head')) + '</h4>'
    + '<p class="hw-scale-facts"></p><p class="hs-note hw-scale-dials"></p><p class="hs-note hw-scale-note"></p>'
    + '<label class="hw-scale-use"><input type="checkbox" data-hs-act="scale-use"> <span>' + esc(t('hunts.scale_use')) + '</span></label>'
    + '<div class="hw-scale-buy"><input type="range" step="1" data-hs-act="scale-hours" aria-label="' + esc(t('hunts.scale_hours_label')) + '">'
    + '<output class="hw-scale-n"></output><button type="button" class="hh-tool" data-hs-act="scale-ask"></button></div>'
    + '<div class="hw-confirm hw-scale-confirm" role="group" aria-label="' + esc(t('hunts.scale_head')) + '"><p class="hw-confirm-q"></p><p class="hw-confirm-note"></p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary is-on" data-hs-act="scale-buy">' + esc(t('hunts.scale_confirm_yes')) + '</button>'
    + '<button type="button" class="hh-tool" data-hs-act="scale-no">' + esc(t('controls.cancel')) + '</button></div></div></section>';
}

/** Write the section for ground `v.hunt` (`v.party`: partyMembershipOf, `v.pending`: a press in flight). */
export function patchScale(det, ctx, v) {
  const box = det.querySelector('.hw-hd-scale');
  const pending = !!v.pending;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  const s = scaleView(scaledHuntsOf(cs), v.hunt, { hours: sc.hours[v.hunt], gold: goldOf(cs) });
  prop(box, 'hidden', !s);
  if (!s) return;
  const open = s.level !== null;
  const dials = open ? scaleFor(v.hunt, s.level) : null;
  patchParts(box.querySelector('.hw-scale-facts'), open ? withSeps([t('hunts.scale_level', { level: s.level }), t('hunts.scale_price', { price: gold(s.price) }),
    s.bankedMs > 0 ? t('hunts.scale_banked', { time: hoursWords(s.bankedMs) }) : t('hunts.scale_banked_none')]) : [t('hunts.scale_locked', { level: s.locked })]);
  patchParts(box.querySelector('.hw-scale-dials'), dials ? withSeps([t('hunts.scale_xp', { times: times(dials.xpPm) }), t('hunts.scale_gold', { times: times(dials.coinPm) }),
    t('hunts.scale_dmg', { times: times(dials.dmgPm) }), t('hunts.scale_hp', { times: times(dials.hpPm) }), t('hunts.scale_drops')]) : []);
  prop(box.querySelector('.hw-scale-dials'), 'hidden', !dials);
  /* the line under it: where this hunt stands now (the server's), the party's rule, and why Buy is off */
  const note = !open ? [] : [s.active ? t('hunts.scale_active', { level: s.active }) : '', v.party && !v.party.isLeader ? t('hunts.scale_party') : '',
    s.why === 'bank' ? t('hunts.scale_bank_full', { max: s.bankMaxH }) : s.why === 'day' ? t('hunts.scale_day_full', { max: s.dayMaxH }) : s.why === 'gold' ? t('hunts.scale_short') : ''].filter(Boolean);
  patchParts(box.querySelector('.hw-scale-note'), withSeps(note));
  prop(box.querySelector('.hw-scale-note'), 'hidden', !note.length);
  const use = box.querySelector('.hw-scale-use');
  prop(use, 'hidden', !open || s.bankedMs <= 0);
  const tick = use.querySelector('input');
  prop(tick, 'checked', open && s.on);
  prop(tick, 'disabled', pending);
  const asking = open && sc.asking === v.hunt && !s.why;
  const buy = box.querySelector('.hw-scale-buy');
  prop(buy, 'hidden', !open || s.max < 1 || asking);
  if (open && s.max >= 1) {
    const range = buy.querySelector('input');
    attr(range, 'min', '1');
    attr(range, 'max', String(s.max));
    prop(range, 'value', String(s.hours));
    prop(range, 'disabled', pending);
    text(buy.querySelector('.hw-scale-n'), t('hunts.scale_hours', { hours: s.hours }));
    const ask = buy.querySelector('[data-hs-act="scale-ask"]');
    text(ask, t('hunts.scale_buy', { hours: s.hours, price: gold(s.cost) }));
    prop(ask, 'disabled', pending || !!s.why);
  }
  const cf = box.querySelector('.hw-scale-confirm');
  cls(cf, 'is-on', asking);
  if (asking) {
    const purse = goldOf(cs);
    text(cf.querySelector('.hw-confirm-q'), t('hunts.scale_confirm_q', { hours: s.hours, price: gold(s.cost) }));
    text(cf.querySelector('.hw-confirm-note'), Number.isSafeInteger(purse) ? t('hunts.scale_confirm_after', { gold: gold(purse - s.cost) }) : '');
    prop(cf.querySelector('[data-hs-act="scale-buy"]'), 'disabled', pending);
  }
}

/**
 * The section's presses on ground `hunt`. `run(send, busy, done)` is hunts.js's (its status line). Answers true when the event was this
 * section's. The slider moves on 'input' (renderHunts.events); the rest on a click.
 */
export function actScale(ctx, hunt, action, ev, el, repaint, run) {
  if (!action || !action.startsWith('scale-')) return false;
  const cs = ctx.character;
  const sc = scratchOf(cs);
  if (action === 'scale-hours') {
    if (ev.type !== 'input' && ev.type !== 'change') return false;
    const n = Number(el.value);
    if (Number.isInteger(n) && n >= 1) { sc.hours[hunt] = n; repaint(); }
    return false;
  }
  if (ev.type !== 'click') return false;
  if (action === 'scale-ask') { sc.asking = hunt; repaint(); return true; }
  if (action === 'scale-no') { sc.asking = null; repaint(); return true; }
  const s = scaleView(scaledHuntsOf(cs), hunt, { hours: sc.hours[hunt], gold: goldOf(cs) });
  if (!s || s.level === null) return true;
  if (action === 'scale-use') {
    const on = !!el.checked;
    run(() => setScaledOn(ctx.account, cs, hunt, on), t('hunts.scale_saving'), () => '');
    return true;
  }
  if (action === 'scale-buy') {
    sc.asking = null;
    if (s.why) { repaint(); return true; }
    /* the total the player saw: the server's price an hour x the hours on the slider; the server prices it again under its lock */
    run(() => buyScaledHours(ctx.account, cs, hunt, s.hours, s.cost), t('hunts.scale_buying'), () => t('hunts.scale_bought', { hours: s.hours }));
    return true;
  }
  return false;
}
