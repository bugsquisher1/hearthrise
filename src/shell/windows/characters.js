// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/characters.js — THE COMMAND CENTRE: EVERY CHARACTER ON ONE SCREEN.
//
// QoL 3 (Tyler 10-18): the character strip widened into a dashboard. One row
// per open character (src/shell/command-model.js): role, name, HP / mana /
// stamina, what it is doing, its bag's worth, whether it is ready to hunt, its
// party and its waiting alerts, with Show to switch the screen to it (the
// others keep running on the server). Below, the party commands across the
// account — start each party one of these characters leads, leave every party
// — each one intent per character, off until the server answered. Last, which
// alerts the character on screen raises (display-only residue).
// Built once, patched in place.
// ════════════════════════════════════════════════════════════════════════
import { ALERT_KINDS } from '../../data/alerts.js?v=0.2.7';
import { summaryOf } from '../command-model.js?v=0.2.7';
import { alertShown, setAlertShown } from '../alerts.js?v=0.2.7';
import { huntName } from '../../session/party-sections.js?v=0.2.7';
import { rows, text, cls, prop, element } from '../../render/paint.js?v=0.2.7';
import { gold, whole, hoursMinutes } from '../../render/format.js?v=0.2.7';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.7';
import { gaugeHtml, patchGauge, patchRoleGlyph } from '../widgets/bits.js?v=0.2.7';
import { glyphSvg } from '../launcher.js?v=0.2.7';
import { refusalWords } from '../intent-words.js?v=0.2.7';

const SCRATCH = { pending: false, msg: '' };

/** The skeleton (built once per opening). */
export function renderCharacters(ctx) {
  return '<div class="hw-command">'
    + '<ul class="hw-chars"></ul>'
    + '<h3 class="hw-ledger-head is-on">Parties</h3>'
    + '<p class="hs-note hw-parties-line"></p>'
    + '<div class="hw-tools"><button type="button" class="hw-primary" data-hs-act="start-all">Start the party hunt</button>'
    + '<button type="button" class="hh-tool" data-hs-act="leave-all">Leave every party</button></div>'
    + '<h3 class="hw-ledger-head is-on hw-alerts-head"></h3>'
    + '<ul class="hw-alert-kinds">' + ALERT_KINDS.map((k) => '<li><label class="hs-hudset-show">'
      + '<input type="checkbox" data-hs-act="alert-kind" data-kind="' + esc(k.id) + '"> ' + glyphSvg(ctx.glyphs, k.glyph) + ' ' + esc(k.label) + '</label></li>').join('') + '</ul>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>';
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

/* The parties this account's characters lead that could start now, and the characters that could leave one. */
function partyPlan(peers) {
  const leads = [], leavers = [];
  for (const cs of peers) {
    const x = summaryOf(cs);
    if (!x.party) continue;
    if (x.party.isLeader && !x.party.anyHunting) leads.push(cs);
    if (!x.party.seats.some((s) => s.seat === x.party.me && s.hunting)) leavers.push(cs);
  }
  return { leads, leavers };
}

renderCharacters.patch = function patchCharacters(body, ctx) {
  const root = body.querySelector('.hw-command');
  const peers = ctx.peers();
  rows(root.querySelector('.hw-chars'), peers.map((cs) => summaryOf(cs, ctx.alerts)), {
    key: (x) => String(x.slot),
    build: () => charRow(ctx),
    patch: (li, x) => patchRow(li, x, ctx),
  });
  const plan = partyPlan(peers);
  const inParty = peers.filter((cs) => summaryOf(cs).party).length;
  text(root.querySelector('.hw-parties-line'), inParty ? inParty + ' of your ' + peers.length + ' characters ' + (inParty === 1 ? 'is' : 'are') + ' in a party.'
    : 'None of your characters is in a party. Open Party (Y) to make or find one.');
  const start = root.querySelector('[data-hs-act="start-all"]');
  cls(start, 'is-on', plan.leads.length > 0);
  prop(start, 'disabled', SCRATCH.pending);
  prop(root.querySelector('[data-hs-act="leave-all"]'), 'disabled', SCRATCH.pending || !plan.leavers.length);
  text(root.querySelector('.hw-alerts-head'), 'Alerts from ' + summaryOf(ctx.character).name);
  for (const box of root.querySelectorAll('[data-hs-act="alert-kind"]')) prop(box, 'checked', alertShown(ctx.character, box.getAttribute('data-kind')));
  text(root.querySelector('.hh-intent-msg'), SCRATCH.msg);
};

/* One intent per character, in turn; the first refusal is what the line says. */
async function each(list, send, busy, done, repaint) {
  if (SCRATCH.pending || !list.length) return;
  SCRATCH.pending = true;
  SCRATCH.msg = busy;
  repaint();
  let refused = null;
  for (const cs of list) {
    let r;
    try { r = await send(cs); } catch (e) { r = { ok: false, error: 'network' }; }
    if (!r.ok && !refused) refused = r.error;
  }
  SCRATCH.pending = false;
  SCRATCH.msg = refused ? refusalWords(refused) : done;
  repaint();
}

renderCharacters.act = function actCharacters(ctx, body, action, ev, t) {
  const repaint = () => renderCharacters.patch(body, ctx);
  if (action === 'alert-kind' && ev.type === 'change') { setAlertShown(ctx.character, t.getAttribute('data-kind'), t.checked); return true; }
  if (ev.type !== 'click') return false;
  if (action === 'show') { if (ctx.goTo) ctx.goTo(Number(t.getAttribute('data-slot'))); return true; }
  const plan = partyPlan(ctx.peers());
  if (action === 'start-all') { each(plan.leads, (cs) => cs.startPartyHunt(), 'Starting…', 'The party is on its way.', repaint); return true; }
  if (action === 'leave-all') { each(plan.leavers, (cs) => cs.leaveParty(), 'Leaving…', 'Your characters left their parties.', repaint); return true; }
  return false;
};
