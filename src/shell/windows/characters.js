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
// RENAME (Tyler 2026-10-22: the first name is free, a new one costs a lot of
// gold): each row's Rename opens one panel under the list with the price the
// server quotes for THAT hero (the `rename` section: base + per Level), the
// hero's own gold and why it may not (in a hunt, renamed today). The name is
// typed, then confirmed with the price in words; one press sends ONE
// hr_hero_rename carrying the quoted price (CharacterSession.renameHero), which
// the server refuses rather than charge another sum. Refusals in plain words.
// Built once, patched in place.
// ════════════════════════════════════════════════════════════════════════
import { ALERT_KINDS } from '../../data/alerts.js?v=0.2.61';
import { summaryOf } from '../command-model.js?v=0.2.61';
import { alertShown, setAlertShown } from '../alerts.js?v=0.2.61';
import { huntName } from '../../session/party-sections.js?v=0.2.61';
import { rows, text, cls, prop, element } from '../../render/paint.js?v=0.2.61';
import { gold, whole, hoursMinutes } from '../../render/format.js?v=0.2.61';
import { renameOf, goldOf } from '../../session/item-sections.js?v=0.2.61';
import { runIntent } from '../intent-words.js?v=0.2.61';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.61';
import { gaugeHtml, patchGauge, patchRoleGlyph } from '../widgets/bits.js?v=0.2.61';
import { glyphSvg } from '../launcher.js?v=0.2.61';

/* The rename panel's scratch, per viewed character: which hero, the typed name, the confirm step. */
const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { slot: null, typed: '', confirm: false, pending: false, msg: '' }; SCRATCH.set(cs, s); } return s; };
const cleanName = (v) => String(v || '').trim().replace(/\s+/g, ' ');
const RENAME_WHY = Object.freeze({ hunt_open: ' is hunting. Rename once the hunt ends.', renamed_today: ' changed name today. One change a day.' });

/** The skeleton (built once per opening). */
export function renderCharacters(ctx) {
  return '<div class="hw-command">'
    + '<ul class="hw-chars"></ul>'
    + '<div class="hw-rename"><h3 class="hs-sub hw-rename-head"></h3>'
    + '<p class="hs-note hw-rename-quote"></p>'
    + '<div class="hw-add"><input type="text" class="hh-num hw-rename-in" maxlength="20" placeholder="New name" aria-label="New name">'
    + '<button type="button" class="hh-tool" data-hs-act="rename-ask"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="rename-close">Close</button></div>'
    + '<div class="hw-confirm" role="alertdialog" aria-label="Confirm the new name"><p class="hw-confirm-q"></p><p class="hw-confirm-note"></p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary" data-hs-act="rename-yes"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="rename-no">Cancel</button></div></div>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>'
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
    + '<span class="hw-char-do"><button type="button" class="hh-tool hw-char-show" data-hs-act="show">Show</button>'
    + '<button type="button" class="hh-tool hw-char-rename" data-hs-act="rename">Rename</button></span></li>');
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
  const ren = li.querySelector('.hw-char-rename');
  ren.setAttribute('data-slot', String(x.slot));
  prop(ren, 'disabled', scratchOf(ctx.character).pending);
}

/** The rename panel: the chosen hero's quote, the account's gold, the typed name and the confirm step. */
function patchRename(root, ctx, peers) {
  const sc = scratchOf(ctx.character);
  const target = sc.slot === null ? null : peers.find((cs) => cs.slot === sc.slot) || null;
  if (!target) { sc.slot = null; sc.confirm = false; }
  const panel = root.querySelector('.hw-rename');
  cls(panel, 'is-on', !!target);
  if (!target) return;
  const name = summaryOf(target).name;
  const q = renameOf(target);
  const purse = goldOf(target);
  text(panel.querySelector('.hw-rename-head'), 'Rename ' + name);
  const short = !!q && purse !== null && purse < q.price;
  text(panel.querySelector('.hw-rename-quote'), !q ? 'The server has not priced a new name yet.'
    : 'A new name costs ' + gold(q.price) + ' at Level ' + whole(q.level) + ', paid from your gold. The first name was free; every change after it costs gold.'
      + (!q.available ? ' ' + name + (RENAME_WHY[q.why] || ' cannot change name right now.')
        : short ? ' You have ' + gold(purse) + '.' : ''));
  const can = !!q && q.available && !short && !sc.pending;
  if (sc.confirm && !can) sc.confirm = false;
  const ask = panel.querySelector('[data-hs-act="rename-ask"]');
  text(ask, q ? 'Rename · ' + gold(q.price) : 'Rename');
  prop(ask, 'disabled', !can || sc.confirm);
  prop(panel.querySelector('.hw-rename-in'), 'disabled', sc.pending || sc.confirm);
  const cf = panel.querySelector('.hw-confirm');
  cls(cf, 'is-on', sc.confirm);
  const yes = panel.querySelector('[data-hs-act="rename-yes"]');
  cls(yes, 'is-on', sc.confirm);
  if (sc.confirm && q) {
    text(cf.querySelector('.hw-confirm-q'), 'Change ' + name + ' to ' + sc.typed + ' for ' + gold(q.price) + '?');
    text(cf.querySelector('.hw-confirm-note'), 'The gold is gone for good, and the name ' + name + ' is free for anyone to take.');
    text(yes, 'Pay ' + gold(q.price));
  }
  prop(yes, 'disabled', sc.pending);
  text(panel.querySelector('.hh-intent-msg'), sc.msg);
  cls(panel, 'is-pending', sc.pending);
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
  patchRename(root, ctx, peers);
  text(root.querySelector('.hw-alerts-head'), 'Alerts from ' + summaryOf(ctx.character).name);
  for (const box of root.querySelectorAll('[data-hs-act="alert-kind"]')) prop(box, 'checked', alertShown(ctx.character, box.getAttribute('data-kind')));
};

renderCharacters.act = function actCharacters(ctx, body, action, ev, t) {
  if (action === 'alert-kind' && ev.type === 'change') { setAlertShown(ctx.character, t.getAttribute('data-kind'), t.checked); return true; }
  if (ev.type !== 'click') return false;
  if (action === 'show') { if (ctx.goTo) ctx.goTo(Number(t.getAttribute('data-slot'))); return true; }
  const sc = scratchOf(ctx.character);
  const repaint = () => renderCharacters.patch(body, ctx);
  if (action === 'rename') {
    if (sc.pending) return true;
    sc.slot = Number(t.getAttribute('data-slot')); sc.confirm = false; sc.msg = '';
    body.querySelector('.hw-rename-in').value = '';
    repaint();
    return true;
  }
  if (action === 'rename-close') { if (!sc.pending) { sc.slot = null; sc.confirm = false; sc.msg = ''; repaint(); } return true; }
  if (action === 'rename-no') { sc.confirm = false; repaint(); return true; }
  const target = sc.slot === null ? null : ctx.peers().find((cs) => cs.slot === sc.slot) || null;
  if (action === 'rename-ask' && target) {
    const n = cleanName(body.querySelector('.hw-rename-in').value);
    if (n.length < 3 || n.length > 20) { sc.msg = 'Names are 3 to 20 letters, numbers and spaces.'; repaint(); return true; }
    if (n === summaryOf(target).name) { sc.msg = 'That is already this hero\u2019s name.'; repaint(); return true; }
    sc.typed = n; sc.confirm = true; sc.msg = '';
    repaint();
    return true;
  }
  if (action === 'rename-yes' && sc.confirm && target) {
    const q = renameOf(target);
    sc.confirm = false;
    if (!q || !q.available) { repaint(); return true; }
    const n = sc.typed;
    runIntent(sc, repaint, () => target.renameHero(n, q.price), 'Renaming\u2026', () => {
      body.querySelector('.hw-rename-in').value = '';
      return 'Done: this hero is now ' + n + '.';
    }, target);
    return true;
  }
  return false;
};
