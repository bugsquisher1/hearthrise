// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/characters.js — THE COMMAND CENTRE: EVERY CHARACTER ON ONE SCREEN.
//
// QoL 3 (Tyler 10-18): the character strip widened into a dashboard. One row
// per open character (src/shell/command-model.js): role, name, HP / mana /
// stamina, what it is doing, its bag's worth, whether it is ready to hunt, its
// party and its waiting alerts, with Show to switch the screen to it (the
// others keep running on the server). Below, how many of them are partied and
// where the party controls live (PARTY_SPEC §2, one way to do each thing: the
// Party panel's Leave, the strip's right-click, the Hunts window's Start with
// party). Last, which alerts the character on screen raises (display-only
// residue).
// Built once, patched in place.
// ════════════════════════════════════════════════════════════════════════
import { ALERT_KINDS } from '../../data/alerts.js?v=0.2.19';
import { summaryOf } from '../command-model.js?v=0.2.19';
import { alertShown, setAlertShown } from '../alerts.js?v=0.2.19';
import { huntName } from '../../session/party-sections.js?v=0.2.19';
import { rows, text, cls, prop, element } from '../../render/paint.js?v=0.2.19';
import { gold, whole, hoursMinutes } from '../../render/format.js?v=0.2.19';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.19';
import { gaugeHtml, patchGauge, patchRoleGlyph } from '../widgets/bits.js?v=0.2.19';
import { glyphSvg } from '../launcher.js?v=0.2.19';

/** The skeleton (built once per opening). */
export function renderCharacters(ctx) {
  return '<div class="hw-command">'
    + '<ul class="hw-chars"></ul>'
    + '<h3 class="hw-ledger-head is-on">Parties</h3>'
    + '<p class="hs-note hw-parties-line"></p>'
    + '<h3 class="hw-ledger-head is-on hw-alerts-head"></h3>'
    + '<ul class="hw-alert-kinds">' + ALERT_KINDS.map((k) => '<li><label class="hs-hudset-show">'
      + '<input type="checkbox" data-hs-act="alert-kind" data-kind="' + esc(k.id) + '"> ' + glyphSvg(ctx.glyphs, k.glyph) + ' ' + esc(k.label) + '</label></li>').join('') + '</ul>'
    + '</div>';
}

function charRow(ctx) {
  return element(ctx.doc, '<li class="hw-char">'
    + '<span class="hw-ico hw-roleglyph" aria-hidden="true"></span>'
    + '<div class="hw-char-main"><p class="hw-char-line"><b class="hw-char-name"></b><span class="hw-char-doing"></span>'
    + '<span class="hw-badge" aria-label="Alerts waiting"></span></p>'
    + '<div class="hw-char-gauges">' + gaugeHtml('hp', 'Health') + gaugeHtml('mana', 'Mana') + gaugeHtml('stamina', 'Stamina') + '</div>'
    + '<p class="hw-char-facts"><span class="hw-char-bag"></span><span class="hw-char-ready"></span><span class="hw-char-party"></span></p></div>'
    + '<button type="button" class="hh-tool hw-char-show" data-hs-act="show">Show</button></li>');
}

function patchRow(li, x, ctx) {
  const v = x.vitals;
  patchRoleGlyph(li.querySelector('.hw-roleglyph'), x.role, ctx.glyphs);
  text(li.querySelector('.hw-char-name'), x.name);
  text(li.querySelector('.hw-char-doing'), x.doing.text);
  const badge = li.querySelector('.hw-badge');
  text(badge, x.alerts ? String(x.alerts) : '');
  cls(badge, 'is-on', x.alerts > 0);
  patchGauge(li.querySelector('.is-hp'), v.hp, v.hpMax, v.hp === null ? 'HP –' : whole(v.hp) + ' / ' + whole(v.hpMax));
  patchGauge(li.querySelector('.is-mana'), v.mana, v.manaMax, v.mana === null ? 'Mana –' : whole(v.mana) + ' / ' + whole(v.manaMax));
  patchGauge(li.querySelector('.is-stamina'), v.staminaMs, v.staminaCapMs, hoursMinutes(v.staminaMs));
  text(li.querySelector('.hw-char-bag'), 'Bag ' + gold(x.bagValue));
  text(li.querySelector('.hw-char-ready'), x.readyLine);
  cls(li.querySelector('.hw-char-ready'), 'is-short', x.loaded && !x.ready);
  text(li.querySelector('.hw-char-party'), x.party ? 'Party: ' + huntName(x.party.hunt) + (x.party.isLeader ? ', leads' : '') : 'No party');
  cls(li, 'is-shown', x.slot === ctx.character.slot);
  const show = li.querySelector('.hw-char-show');
  show.setAttribute('data-slot', String(x.slot));
  prop(show, 'disabled', x.slot === ctx.character.slot || !ctx.goTo);
  text(show, x.slot === ctx.character.slot ? 'On screen' : 'Show');
}

renderCharacters.patch = function patchCharacters(body, ctx) {
  const root = body.querySelector('.hw-command');
  const peers = ctx.peers();
  rows(root.querySelector('.hw-chars'), peers.map((cs) => summaryOf(cs, ctx.alerts)), {
    key: (x) => String(x.slot),
    build: () => charRow(ctx),
    patch: (li, x) => patchRow(li, x, ctx),
  });
  const inParty = peers.filter((cs) => summaryOf(cs).party).length;
  text(root.querySelector('.hw-parties-line'), (inParty ? inParty + ' of your ' + peers.length + ' characters ' + (inParty === 1 ? 'is' : 'are') + ' in a party. '
    : 'None of your characters is in a party. ') + 'Right-click a player, or one of your character tabs, to invite. Party (Y) finds open parties.');
  text(root.querySelector('.hw-alerts-head'), 'Alerts from ' + summaryOf(ctx.character).name);
  for (const box of root.querySelectorAll('[data-hs-act="alert-kind"]')) prop(box, 'checked', alertShown(ctx.character, box.getAttribute('data-kind')));
};

renderCharacters.act = function actCharacters(ctx, body, action, ev, t) {
  if (action === 'alert-kind' && ev.type === 'change') { setAlertShown(ctx.character, t.getAttribute('data-kind'), t.checked); return true; }
  if (ev.type !== 'click') return false;
  if (action === 'show') { if (ctx.goTo) ctx.goTo(Number(t.getAttribute('data-slot'))); return true; }
  return false;
};
