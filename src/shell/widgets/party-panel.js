// ════════════════════════════════════════════════════════════════════════
// src/shell/widgets/party-panel.js — THE PARTY BOARD (parity PP-01..PP-14).
//
// One row per hero in the character's `party` section (a solo hunt is a party
// of one): the role icon from the equipped WEAPON (never the outfit), the
// role's name (no vocations), name and level, the leader's crown, HP and mana
// gauges, and — on expand — DPS / total and HPS / total. Peers' numbers come
// only from the instance-scoped `party` section the server projects into THIS
// character's envelope, never another player's envelope.
//
// Built once; each member is a keyed row (src/render/paint.js rows), patched
// in place, so a composition change adds or drops one row and nothing else.
// The expand toggle is display scratch on the panel itself.
// ════════════════════════════════════════════════════════════════════════
import { HUNT_ROLES } from '../../data/hunt-roles.js?v=0.2.5';
import { ROLE_GLYPH } from '../../data/hunt-hud.js?v=0.2.5';
import { partyOf } from '../../session/hunt-sections.js?v=0.2.5';
import { rows, text, cls, attr, element } from '../../render/paint.js?v=0.2.5';
import { short, whole } from '../../render/format.js?v=0.2.5';
import { glyphSvg } from '../launcher.js?v=0.2.5';
import { markPlayer } from '../context-menu.js?v=0.2.5';
import { gaugeHtml, patchGauge, panelHtml } from './bits.js?v=0.2.5';

function memberHtml(glyphs) {
  return '<li class="hp-m">'
    + '<span class="hp-portrait" aria-hidden="true"></span>'
    + '<div class="hp-main">'
    + '<div class="hp-line"><b class="hp-name"></b>'
    + '<span class="hp-lead" title="Party leader">' + glyphSvg(glyphs, 'uiCrown') + '</span><span class="hp-lv"></span></div>'
    + '<div class="hp-line is-sub"><span class="hp-role"></span><span class="hp-state"></span></div>'
    + gaugeHtml('hp', 'Health') + gaugeHtml('mana', 'Mana')
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
  cls(el.querySelector('.hp-lead'), 'is-on', m.unit === party.leader);
  text(el.querySelector('.hp-state'), m.down ? 'Down' : m.eating ? 'Eating' : m.drinking ? 'Drinking' : m.aggro ? 'Targeted' : '');
  cls(el, 'is-down', m.down);
  cls(el, 'is-self', m.unit === party.self);
  markPlayer(el, m.unit === party.self ? null : { name: m.name });   // the player menu (src/shell/context-menu.js)
  patchGauge(el.querySelector('.is-hp'), m.hp, m.hpMax, m.hp === null ? '–' : whole(m.hp) + ' / ' + whole(m.hpMax));
  patchGauge(el.querySelector('.is-mana'), m.mana, m.manaMax, m.mana === null ? '–' : whole(m.mana) + ' / ' + whole(m.manaMax));
  text(el.querySelector('.hp-dps'), short(m.dps));
  text(el.querySelector('.hp-dealt'), short(m.dealt));
  text(el.querySelector('.hp-hps'), short(m.hps));
  text(el.querySelector('.hp-healed'), short(m.healed));
}

/** The skeleton (built once). */
export function renderPartyPanel() {
  return panelHtml('hp-party', 'Party',
    '<button type="button" class="hh-tool" data-hs-act="expand" aria-pressed="false">DPS and HPS</button>',
    '<p class="hh-empty">Not in a hunt.</p><ol class="hp-members"></ol><p class="hp-foot">Costs are personal.</p>');
}

renderPartyPanel.patch = function patchPartyPanel(el, ctx) {
  const party = partyOf(ctx.character);
  const members = party ? party.members : [];
  cls(el.querySelector('.hp-party'), 'is-empty', !members.length);
  rows(el.querySelector('.hp-members'), members, {
    key: (m) => m.unit,
    build: () => element(ctx.doc, memberHtml(ctx.glyphs)),
    patch: (row, m) => patchMember(row, m, party, ctx.glyphs),
  });
};

renderPartyPanel.act = function actPartyPanel(ctx, el, action, ev, btn) {
  if (action !== 'expand' || ev.type !== 'click') return;
  const on = btn.getAttribute('aria-pressed') !== 'true';
  attr(btn, 'aria-pressed', String(on));
  cls(el.querySelector('.hp-party'), 'is-expanded', on);
};
