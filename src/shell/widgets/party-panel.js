// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/party-panel.js — THE PARTY BOARD (parity PP-01..PP-14),
// THE ONLY ROSTER (PARTY_SPEC §2).
//
// The roster is the character's party MEMBERSHIP (party-sections.js
// partyMembershipOf: works in town, every seat, who leads, who is away and how
// long its seat is kept), overlaid BY SEAT with the hunt's live numbers
// (hunt-sections.js partyOf: HP and mana, DPS / total, HPS / total, eating,
// targeted). A solo hunt has no membership: its party of one comes from partyOf.
// The role icon is the equipped WEAPON's (never the outfit). Peers' numbers come
// only from the sections the server projects into THIS character's envelope.
//
// Leave, Disband (leader) and Kick (leader, any row but its own, hunting or
// not) are ONE intent each from src/session/party-intents.js, run through
// runIntent: the buttons go off at once, the answer's words replace "Leaving…",
// and the roster changes only from the re-read envelopes. "DPS and HPS" shows
// only while somebody hunts.
//
// WHO HOLDS THE PACK (bug #59, Andy 10-22; Tyler 2026-10-22): with two or more
// tanks, each tank's row says when it holds ("Holding this lap", "Holds every
// lap", "Guards your healer" ...), from the live engine's world (live-engine.js
// tankTurns: the engine's own holderTank over the server's start point, judged
// at every commit), never a guess here; a seat in town, or no engine running,
// shows none. The leader's "Take turns | One tank holds" switch, the note under
// the roster and the weak-pick warning are ./party-hold.js.
//
// LEAVE TOGETHER (Tyler 2026-10-22): the viewer's OWN row carries its hero's box
// "Leave if anyone leaves the hunt or dies" from the server (./party-leave.js);
// other rows show nothing of theirs.
//
// Built once; each member is a keyed row (src/render/paint.js rows), patched in
// place. The expand toggle and the intent scratch live on the panel element.
// ════════════════════════════════════════════════════════════════════════
import { HUNT_ROLES } from '../../data/hunt-roles.js?v=0.2.49';
import { ROLE_GLYPH } from '../../data/hunt-hud.js?v=0.2.49';
import { partyOf, liveHpOf } from '../../session/hunt-sections.js?v=0.2.49';
import { partyMembershipOf } from '../../session/party-sections.js?v=0.2.49';
import { heroVitalsOf } from '../../session/character-sections.js?v=0.2.49';
import { afterLeave, disbandParty } from '../../session/party-intents.js?v=0.2.49';
import { runIntent } from '../intent-words.js?v=0.2.49';
import { rows, text, cls, attr, prop, element } from '../../render/paint.js?v=0.2.49';
import { short, whole } from '../../render/format.js?v=0.2.49';
import { glyphSvg } from '../launcher.js?v=0.2.49';
import { markPlayer } from '../context-menu.js?v=0.2.49';
import { gaugeHtml, patchGauge, panelHtml } from './bits.js?v=0.2.49';
import { turnWords, holdView, holdHtml, patchHold, holdAct } from './party-hold.js?v=0.2.49';
import { togetherHtml, patchTogether, togetherAct } from './party-leave.js?v=0.2.49';

function memberHtml(glyphs) {
  return '<li class="hp-m">'
    + '<span class="hp-portrait" aria-hidden="true"></span>'
    + '<div class="hp-main">'
    + '<div class="hp-line"><b class="hp-name"></b>'
    + '<span class="hp-lead" title="Party leader">' + glyphSvg(glyphs, 'uiCrown') + '</span><span class="hp-lv"></span></div>'
    + '<div class="hp-line is-sub"><span class="hp-role"></span><span class="hp-state"></span>'
    + '<button type="button" class="hh-tool hp-kick" data-hs-act="kick" hidden>Remove</button></div>'
    + '<p class="hp-turn"></p>'
    + gaugeHtml('hp', 'Health') + gaugeHtml('mana', 'Mana')
    + togetherHtml()
    + '<dl class="hp-stats"><dt>DPS</dt><dd class="hp-dps"></dd><dt>Total</dt><dd class="hp-dealt"></dd>'
    + '<dt>HPS</dt><dd class="hp-hps"></dd><dt>Total</dt><dd class="hp-healed"></dd></dl>'
    + '</div></li>';
}

function patchMember(el, m, party, glyphs) {
  const role = m.role && HUNT_ROLES[m.role];
  const portrait = el.querySelector('.hp-portrait');
  if (portrait.getAttribute('data-role') !== String(m.role)) {
    portrait.innerHTML = glyphSvg(glyphs, ROLE_GLYPH[m.role] || 'uiPeople');
    attr(portrait, 'data-role', String(m.role));
  }
  text(el.querySelector('.hp-name'), m.name);
  text(el.querySelector('.hp-role'), role ? role.label : 'No weapon');
  text(el.querySelector('.hp-lv'), m.level === null ? '' : 'Lv ' + m.level);
  cls(el.querySelector('.hp-lead'), 'is-on', m.seat === party.leaderSeat);
  text(el.querySelector('.hp-state'), stateWords(m));
  text(el.querySelector('.hp-turn'), m.turn || '');
  cls(el.querySelector('.hp-turn'), 'is-holding', m.holdIn === 'every' || m.holdIn === 'now');
  cls(el, 'is-self', m.seat === party.selfSeat);
  cls(el, 'is-away', m.away);
  const kick = el.querySelector('.hp-kick');
  prop(kick, 'hidden', !party.canKick || m.seat === party.selfSeat);
  prop(kick, 'disabled', party.pending);
  attr(kick, 'data-seat', String(m.seat));
  markPlayer(el, m.seat === party.selfSeat ? null : { name: m.name });   // the player menu (src/shell/context-menu.js)
  patchGauge(el.querySelector('.is-hp'), m.hp, m.hpMax, m.hp === null ? '–' : whole(m.hp) + ' / ' + whole(m.hpMax));
  patchGauge(el.querySelector('.is-mana'), m.mana, m.manaMax, m.mana === null ? '–' : whole(m.mana) + ' / ' + whole(m.manaMax));
  text(el.querySelector('.hp-dps'), short(m.dps));
  text(el.querySelector('.hp-dealt'), short(m.dealt));
  text(el.querySelector('.hp-hps'), short(m.hps));
  text(el.querySelector('.hp-healed'), short(m.healed));
  patchTogether(el, m, party.roster, party.pending);
}

/* "Away, seat kept 7 min" (the server's seat_ms, whole minutes up); else what the hunt says it is doing. Exported for tests/party-ui.mjs (PR-4). */
export function stateWords(m) {
  if (m.away) return m.seatMs === null ? 'Away' : 'Away, seat kept ' + Math.max(1, Math.ceil(m.seatMs / 60000)) + ' min';
  if (m.eating) return 'Eating';
  if (m.drinking) return 'Drinking';
  if (m.aggro) return 'Targeted';
  return m.hunting ? '' : 'In town';
}

/* The live engine's tank turns for this character's hunt (null: no engine, or it runs no world). */
function turnsOf(cs) {
  const live = cs && cs.live;
  return live && typeof live.tankTurns === 'function' ? live.tankTurns() : null;
}

const NO_HUNT = { mana: null, manaMax: null, dps: null, dealt: null, hps: null, healed: null, eating: false, drinking: false, aggro: false };

/**
 * The roster: the membership's seats overlaid with the hunt's member by seat, or (a solo hunt, no
 * membership) the hunt's party of one. { members, leaderSeat, selfSeat, isLeader, inParty, anyHunting, holdSeat,
 * pullSeat (the seat of the hunt's pull leader, hunt-sections.js partyOf `leader`; null in town) }.
 * Pure; exported for tests/party-ui.mjs.
 */
export function rosterOf(cs) {
  const p = partyMembershipOf(cs);
  const h = partyOf(cs);
  const bySeat = new Map(h ? h.members.map((m) => [m.seat, m]) : []);
  const pullSeat = h && Number.isInteger(h.leader) ? (h.members.find((m) => m.unit === h.leader) || {}).seat ?? null : null;
  if (p) {
    const members = p.seats.map((s) => {
      const live = s.hunting ? bySeat.get(s.seat) : null;
      return Object.assign({}, NO_HUNT, live || {}, {
        seat: s.seat, name: s.name, level: s.level, role: s.role, hunting: s.hunting, away: s.away, seatMs: s.seatMs,
        hp: live ? live.hp : s.hp, hpMax: live ? live.hpMax : s.hpMax,
      });
    });
    return { members, leaderSeat: p.leader, selfSeat: p.me, isLeader: p.isLeader, inParty: true, anyHunting: p.anyHunting, holdSeat: p.holdSeat, pullSeat,
      together: p.leaveTogether };
  }
  if (!h) return { members: [], leaderSeat: null, selfSeat: null, isLeader: false, inParty: false, anyHunting: false, holdSeat: null, pullSeat: null, together: null };
  const members = h.members.map((m) => Object.assign({}, m, { hunting: true, away: false, seatMs: null }));
  return { members, leaderSeat: h.leaderSeat, selfSeat: h.selfSeat, isLeader: false, inParty: false, anyHunting: true, holdSeat: null, pullSeat, together: null };
}

/** The roster with each hunting member's HP as the live timeline plays it (hunt-sections.js liveHpOf: the
    bar over its head), never the last commit's. The viewed character's own seat reads its Level, HP and
    mana from heroVitalsOf, the one reader the HUD and the Character tab share (r09). A hunting tank's row
    carries its turn at holding the pack (`holdIn`, `turn`) once the hunt has two or more tanks (by its unit:
    a seat in town has none), and the roster the hold switch's view (`hold`, party-hold.js holdView).
    Exported for tests/party-ui.mjs. */
export function liveRoster(cs, r) {
  const all = turnsOf(cs);
  const turns = all && all.size > 1 ? all : null;   // a lone tank always holds: nothing to explain
  const healer = r.members.some((m) => m.role === 'healer');
  const members = r.members.map((row) => {
    const holdIn = turns && Number.isInteger(row.unit) && turns.has(row.unit) ? turns.get(row.unit) : undefined;
    const m = holdIn === undefined ? row : Object.assign({}, row, { holdIn, turn: turnWords(holdIn, healer) });
    if (m.seat === r.selfSeat) {
      const v = heroVitalsOf(cs);
      return Object.assign({}, m, { level: v.level, hp: v.hp, hpMax: v.hpMax, mana: v.mana, manaMax: v.manaMax });
    }
    const live = m.hunting ? liveHpOf(cs, m.unit) : null;
    return live ? Object.assign({}, m, { hp: live.hp, hpMax: live.maxHp }) : m;
  });
  return Object.assign({}, r, { members, hold: holdView(Object.assign({}, r, { members }), turns) });
}

const scratch = new WeakMap();
function scOf(el) {
  let sc = scratch.get(el);
  if (!sc) { sc = { pending: false, msg: '' }; scratch.set(el, sc); }
  return sc;
}

/** The skeleton (built once). */
export function renderPartyPanel() {
  return panelHtml('hp-party', 'Party',
    '<button type="button" class="hh-tool" data-hs-act="expand" aria-pressed="false" hidden>DPS and HPS</button>',
    '<p class="hh-empty">Not in a party.</p><ol class="hp-members"></ol>' + holdHtml()
    + '<div class="hp-acts"><button type="button" class="hh-tool" data-hs-act="leave" hidden>Leave party</button>'
    + '<button type="button" class="hh-tool" data-hs-act="disband" hidden>Disband</button></div>'
    + '<p class="hh-intent-msg hp-msg" role="status"></p><p class="hp-foot">Costs are personal.</p>');
}

renderPartyPanel.patch = function patchPartyPanel(el, ctx) {
  const r = liveRoster(ctx.character, rosterOf(ctx.character));
  const sc = scOf(el);
  const view = { leaderSeat: r.leaderSeat, selfSeat: r.selfSeat, canKick: r.inParty && r.isLeader, pending: sc.pending, roster: r };
  cls(el.querySelector('.hp-party'), 'is-empty', !r.members.length);
  rows(el.querySelector('.hp-members'), r.members, {
    key: (m) => m.seat,
    build: () => element(ctx.doc, memberHtml(ctx.glyphs)),
    patch: (row, m) => patchMember(row, m, view, ctx.glyphs),
  });
  const expand = el.querySelector('[data-hs-act="expand"]');
  prop(expand, 'hidden', !r.anyHunting);
  if (!r.anyHunting) { attr(expand, 'aria-pressed', 'false'); cls(el.querySelector('.hp-party'), 'is-expanded', false); }
  const leave = el.querySelector('[data-hs-act="leave"]');
  const disband = el.querySelector('[data-hs-act="disband"]');
  prop(leave, 'hidden', !r.inParty);
  prop(disband, 'hidden', !(r.inParty && r.isLeader));
  prop(leave, 'disabled', sc.pending);
  prop(disband, 'disabled', sc.pending);
  cls(el.querySelector('.hp-acts'), 'is-off', !r.inParty);
  text(el.querySelector('.hp-msg'), sc.msg);
  patchHold(el, r.hold, sc.pending, ctx.doc);
};

renderPartyPanel.act = function actPartyPanel(ctx, el, action, ev, btn) {
  /* the own row's "Leave if anyone leaves the hunt or dies" box answers its change (./party-leave.js) */
  if (action === 'together' && ctx.character) {
    togetherAct(ctx, ctx.character, scOf(el), () => renderPartyPanel.patch(el, ctx), action, ev, btn, rosterOf(ctx.character));
    return;
  }
  if (ev.type !== 'click') return;
  if (action === 'expand') {
    const on = btn.getAttribute('aria-pressed') !== 'true';
    attr(btn, 'aria-pressed', String(on));
    cls(el.querySelector('.hp-party'), 'is-expanded', on);
    return;
  }
  const cs = ctx.character;
  if (!cs) return;
  const sc = scOf(el);
  const repaint = () => renderPartyPanel.patch(el, ctx);
  if (holdAct(ctx, cs, sc, repaint, action, btn, liveRoster(cs, rosterOf(cs)).hold)) return;
  if (action === 'leave') runIntent(sc, repaint, () => afterLeave(ctx.account, cs, () => cs.leaveParty()), 'Leaving…', () => 'You left the party.');
  else if (action === 'disband') runIntent(sc, repaint, () => disbandParty(ctx.account, cs), 'Disbanding…', () => 'The party is disbanded.');
  else if (action === 'kick') {
    const seat = Number(btn.getAttribute('data-seat'));
    if (Number.isInteger(seat)) runIntent(sc, repaint, () => afterLeave(ctx.account, cs, () => cs.kickSeat(seat)), 'Removing…', () => 'Removed from the party.');
  }
};
