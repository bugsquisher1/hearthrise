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
import { ALERT_KINDS } from '../../data/alerts.js?v=0.2.106';
import { summaryOf } from '../command-model.js?v=0.2.106';
import { alertShown, setAlertShown } from '../alerts.js?v=0.2.106';
import { huntName } from '../../session/party-sections.js?v=0.2.106';
import { rows, text, cls, prop, element } from '../../render/paint.js?v=0.2.106';
import { gold, whole, hoursMinutes } from '../../render/format.js?v=0.2.106';
import { renameOf, goldOf } from '../../session/item-sections.js?v=0.2.106';
import { gmOf } from '../../session/character-sections.js?v=0.2.106';
import { runIntent } from '../intent-words.js?v=0.2.106';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.106';
import { gaugeHtml, patchGauge, patchRoleGlyph } from '../widgets/bits.js?v=0.2.106';
import { glyphSvg } from '../launcher.js?v=0.2.106';
import { entriesFor } from '../context-menu.js?v=0.2.106';
import { menuProvidersOf } from '../menu-providers.js?v=0.2.106';
import { t } from '../../render/player-text.js?v=0.2.106';

/* The rename panel's scratch, per viewed character: which hero, the typed name, the confirm step. */
const SCRATCH = new WeakMap();
const scratchOf = (cs) => { let s = SCRATCH.get(cs); if (!s) { s = { slot: null, typed: '', confirm: false, pending: false, msg: '', inviting: false, partyMsg: '' }; SCRATCH.set(cs, s); } return s; };
const cleanName = (v) => String(v || '').trim().replace(/\s+/g, ' ');
/* Why a hero can't be renamed now, by the server's reason (else heroes.rename_cant). */
const RENAME_WHY = Object.freeze({ hunt_open: 'heroes.rename_hunting', renamed_today: 'heroes.rename_today' });

/* THE PHONE'S ROUTES (playtest 2026-10-31, shown under the phone query only, windows.css): a hero's Invite button (the
   right-click menu's own entry, so its rule and its words stay in one place); every icon of the top row by name, each a
   press (the row has no words and a phone no hover); the windows the phone's row has no room for (shell-windows.js
   phoneIcon: they have no other press here); and Characters and Sign out, which no longer fit beside the row. */
const iconNames = (ctx, rows) => rows.map((r) => '<li><button type="button" class="hw-icon-name" data-hs-open="' + esc(r.id) + '">'
  + glyphSvg(ctx.glyphs, r.glyph) + '<span>' + esc(r.label) + '</span></button></li>').join('');
const iconRows = (ctx) => ctx.wm.rows().filter((r) => r.launcher !== false && (r.gm !== true || gmOf(ctx.character)));
const iconListHtml = (ctx) => '<div class="hw-phone-only"><h3 class="hw-ledger-head is-on">' + esc(t('heroes.icons_head')) + '</h3><ul class="hw-icon-names">'
  + iconNames(ctx, iconRows(ctx).filter((r) => r.phoneIcon !== false)) + '</ul></div>';
/* "Also here" is the sheet's first row: these have no icon on a phone, so a long scroll hid them (panel 2026-11-01: ~700 px down). */
const alsoHereHtml = (ctx) => '<div class="hw-phone-only"><ul class="hw-icon-names is-more" aria-label="' + esc(t('heroes.also_here_aria')) + '">'
  + iconNames(ctx, iconRows(ctx).filter((r) => r.phoneIcon === false)) + '</ul></div>';
const ACCOUNT_HTML = '<div class="hw-phone-only hw-account"><button type="button" class="hh-tool" data-app="characters">' + esc(t('heroes.character_list')) + '</button>'
  + '<button type="button" class="hh-tool" data-app="sign-out">' + esc(t('heroes.sign_out')) + '</button></div>';

/** The Invite entry for one of this account's other heroes, or null (the viewed hero, or one already in a party). */
function inviteEntry(ctx, x) {
  if (!ctx.account || x.slot === ctx.character.slot) return null;
  const target = { kind: 'player', id: ctx.account.userId, name: x.name, slot: x.slot };
  const e = entriesFor(target, menuProvidersOf(ctx)).find((m) => m.id === 'party-invite');
  return e ? { entry: e, target } : null;
}

/** The skeleton (built once per opening). */
export function renderCharacters(ctx) {
  return '<div class="hw-command">'
    + alsoHereHtml(ctx)
    + '<ul class="hw-chars"></ul>'
    + '<div class="hw-rename"><h3 class="hs-sub hw-rename-head"></h3>'
    + '<p class="hs-note hw-rename-quote"></p>'
    + '<div class="hw-add"><input type="text" class="hh-num hw-rename-in" maxlength="20" placeholder="' + esc(t('heroes.new_name')) + '" aria-label="' + esc(t('heroes.new_name')) + '">'
    + '<button type="button" class="hh-tool" data-hs-act="rename-ask"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="rename-close">' + esc(t('heroes.close')) + '</button></div>'
    + '<div class="hw-confirm" role="alertdialog" aria-label="' + esc(t('heroes.confirm_aria')) + '"><p class="hw-confirm-q"></p><p class="hw-confirm-note"></p>'
    + '<div class="hw-confirm-do"><button type="button" class="hw-primary" data-hs-act="rename-yes"></button>'
    + '<button type="button" class="hh-tool" data-hs-act="rename-no">' + esc(t('heroes.cancel')) + '</button></div></div>'
    + '<p class="hh-intent-msg" role="status" aria-live="polite"></p></div>'
    + '<h3 class="hw-ledger-head is-on">' + esc(t('heroes.parties_head')) + '</h3>'
    + '<p class="hs-note hw-parties-line"></p><p class="hh-intent-msg hw-parties-msg" role="status" aria-live="polite"></p>'
    + iconListHtml(ctx)
    + '<h3 class="hw-ledger-head is-on hw-alerts-head"></h3>'
    + '<ul class="hw-alert-kinds">' + ALERT_KINDS.map((k) => '<li><label class="hs-hudset-show">'
      + '<input type="checkbox" data-hs-act="alert-kind" data-kind="' + esc(k.id) + '"> ' + glyphSvg(ctx.glyphs, k.glyph) + ' ' + esc(k.label) + '</label></li>').join('') + '</ul>'
    + ACCOUNT_HTML
    + '</div>';
}

function charRow(ctx) {
  return element(ctx.doc, '<li class="hw-char">'
    + '<span class="hw-ico hw-roleglyph" aria-hidden="true"></span>'
    + '<div class="hw-char-main"><p class="hw-char-line"><b class="hw-char-name"></b><span class="hw-char-doing"></span>'
    + '<span class="hw-badge" aria-label="' + esc(t('heroes.alerts_waiting_aria')) + '"></span></p><p class="hw-char-waits"></p>'
    + '<div class="hw-char-gauges">' + gaugeHtml('hp', t('heroes.gauge_health')) + gaugeHtml('mana', t('heroes.gauge_mana')) + gaugeHtml('stamina', t('heroes.gauge_stamina')) + '</div>'
    + '<p class="hw-char-facts"><span class="hw-char-bag"></span><span class="hw-char-ready"></span><span class="hw-char-party"></span></p></div>'
    + '<span class="hw-char-do"><button type="button" class="hh-tool hw-char-show" data-hs-act="show">' + esc(t('heroes.show')) + '</button>'
    + '<button type="button" class="hh-tool hw-char-rename" data-hs-act="rename">' + esc(t('heroes.rename')) + '</button>'
    + '<button type="button" class="hh-tool hw-char-invite" data-hs-act="invite" hidden></button></span></li>');
}

function patchRow(li, x, ctx) {
  const v = x.vitals;
  patchRoleGlyph(li.querySelector('.hw-roleglyph'), x.role, ctx.glyphs);
  text(li.querySelector('.hw-char-name'), x.name);
  text(li.querySelector('.hw-char-doing'), x.doing.text);
  const badge = li.querySelector('.hw-badge');
  text(badge, x.alerts ? String(x.alerts) : '');
  cls(badge, 'is-on', x.alerts > 0);
  /* What the red count is waiting for: the newest of this hero's alerts, in its own words (panel 2026-11-01). */
  const wait = x.alerts && ctx.alerts ? ctx.alerts.list().find((a) => a.slot === x.slot) : null;
  text(li.querySelector('.hw-char-waits'), wait ? wait.text : '');
  patchGauge(li.querySelector('.is-hp'), v.hp, v.hpMax, v.hp === null ? t('heroes.hp_unknown') : whole(v.hp) + ' / ' + whole(v.hpMax));
  patchGauge(li.querySelector('.is-mana'), v.mana, v.manaMax, v.mana === null ? t('heroes.mana_unknown') : whole(v.mana) + ' / ' + whole(v.manaMax));
  patchGauge(li.querySelector('.is-stamina'), v.staminaMs, v.staminaCapMs, hoursMinutes(v.staminaMs));
  /* What this hero's bag would fetch at the shop, never gold it holds: the purse is the account's (optimizer panel 11-03: "Bag 19,369 gp" beside "Your gold 51.7k" read as two purses). */
  text(li.querySelector('.hw-char-bag'), t('heroes.bag_worth', { gold: gold(x.bagValue) }));
  text(li.querySelector('.hw-char-ready'), x.readyLine);
  cls(li.querySelector('.hw-char-ready'), 'is-short', x.loaded && !x.ready);
  text(li.querySelector('.hw-char-party'), x.party ? t(x.party.isLeader ? 'heroes.party_leads' : 'heroes.party_in', { hunt: huntName(x.party.hunt) }) : t('heroes.no_party'));
  cls(li, 'is-shown', x.slot === ctx.character.slot);
  const show = li.querySelector('.hw-char-show');
  show.setAttribute('data-slot', String(x.slot));
  prop(show, 'disabled', x.slot === ctx.character.slot || !ctx.goTo);
  text(show, x.slot === ctx.character.slot ? t('heroes.on_screen') : t('heroes.show'));
  const ren = li.querySelector('.hw-char-rename');
  ren.setAttribute('data-slot', String(x.slot));
  prop(ren, 'disabled', scratchOf(ctx.character).pending);
  const inv = li.querySelector('.hw-char-invite');
  const can = inviteEntry(ctx, x);
  inv.setAttribute('data-slot', String(x.slot));
  prop(inv, 'hidden', !can);
  text(inv, can ? can.entry.label : '');
  prop(inv, 'disabled', scratchOf(ctx.character).inviting || (!!can && can.entry.off));
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
  text(panel.querySelector('.hw-rename-head'), t('heroes.rename_head', { name }));
  const short = !!q && purse !== null && purse < q.price;
  const why = q && !q.available ? t(Object.prototype.hasOwnProperty.call(RENAME_WHY, q.why) ? RENAME_WHY[q.why] : 'heroes.rename_cant', { name }) : '';
  text(panel.querySelector('.hw-rename-quote'), !q ? t('heroes.rename_unpriced')
    : [t('heroes.rename_quote', { price: gold(q.price), level: whole(q.level) }), why || (short ? t('heroes.rename_short', { gold: gold(purse) }) : '')].filter(Boolean).join(' '));
  const can = !!q && q.available && !short && !sc.pending;
  if (sc.confirm && !can) sc.confirm = false;
  const ask = panel.querySelector('[data-hs-act="rename-ask"]');
  text(ask, q ? t('heroes.rename_price', { price: gold(q.price) }) : t('heroes.rename'));
  prop(ask, 'disabled', !can || sc.confirm);
  prop(panel.querySelector('.hw-rename-in'), 'disabled', sc.pending || sc.confirm);
  const cf = panel.querySelector('.hw-confirm');
  cls(cf, 'is-on', sc.confirm);
  const yes = panel.querySelector('[data-hs-act="rename-yes"]');
  cls(yes, 'is-on', sc.confirm);
  if (sc.confirm && q) {
    text(cf.querySelector('.hw-confirm-q'), t('heroes.confirm_q', { name, typed: sc.typed, price: gold(q.price) }));
    text(cf.querySelector('.hw-confirm-note'), t('heroes.confirm_note', { name }));
    text(yes, t('heroes.pay', { price: gold(q.price) }));
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
  text(root.querySelector('.hw-parties-line'), (inParty ? t('heroes.parties_some', { count: inParty, total: peers.length }) : t('heroes.parties_none'))
    + ' ' + (ctx.isPhone && ctx.isPhone() ? t('heroes.parties_how_phone') : t('heroes.parties_how')));
  text(root.querySelector('.hw-parties-msg'), scratchOf(ctx.character).partyMsg);
  patchRename(root, ctx, peers);
  text(root.querySelector('.hw-alerts-head'), t('heroes.alerts_from', { name: summaryOf(ctx.character).name }));
  for (const box of root.querySelectorAll('[data-hs-act="alert-kind"]')) prop(box, 'checked', alertShown(ctx.character, box.getAttribute('data-kind')));
};

renderCharacters.act = function actCharacters(ctx, body, action, ev, el) {
  if (action === 'alert-kind' && ev.type === 'change') { setAlertShown(ctx.character, el.getAttribute('data-kind'), el.checked); return true; }
  if (ev.type !== 'click') return false;
  if (action === 'show') { if (ctx.goTo) ctx.goTo(Number(el.getAttribute('data-slot'))); return true; }
  const sc = scratchOf(ctx.character);
  const repaint = () => renderCharacters.patch(body, ctx);
  if (action === 'invite') {
    const x = ctx.peers().map((cs) => summaryOf(cs, ctx.alerts)).find((p) => p.slot === Number(el.getAttribute('data-slot')));
    const can = x && inviteEntry(ctx, x);
    if (!can || sc.inviting) return true;
    sc.inviting = true; sc.partyMsg = t('heroes.sending');
    repaint();
    Promise.resolve(can.entry.run(can.target, { open: (id) => ctx.show(id) })).then((r) => r, () => ({ say: t('heroes.invite_failed') })).then((r) => {
      sc.inviting = false; sc.partyMsg = (r && (r.say || r.done)) || '';
      repaint();
    });
    return true;
  }
  if (action === 'rename') {
    if (sc.pending) return true;
    sc.slot = Number(el.getAttribute('data-slot')); sc.confirm = false; sc.msg = '';
    body.querySelector('.hw-rename-in').value = '';
    repaint();
    return true;
  }
  if (action === 'rename-close') { if (!sc.pending) { sc.slot = null; sc.confirm = false; sc.msg = ''; repaint(); } return true; }
  if (action === 'rename-no') { sc.confirm = false; repaint(); return true; }
  const target = sc.slot === null ? null : ctx.peers().find((cs) => cs.slot === sc.slot) || null;
  if (action === 'rename-ask' && target) {
    const n = cleanName(body.querySelector('.hw-rename-in').value);
    if (n.length < 3 || n.length > 20) { sc.msg = t('heroes.name_length'); repaint(); return true; }
    if (n === summaryOf(target).name) { sc.msg = t('heroes.name_same'); repaint(); return true; }
    sc.typed = n; sc.confirm = true; sc.msg = '';
    repaint();
    return true;
  }
  if (action === 'rename-yes' && sc.confirm && target) {
    const q = renameOf(target);
    sc.confirm = false;
    if (!q || !q.available) { repaint(); return true; }
    const n = sc.typed;
    runIntent(sc, repaint, () => target.renameHero(n, q.price), t('heroes.renaming'), () => {
      body.querySelector('.hw-rename-in').value = '';
      return t('heroes.renamed', { name: n });
    }, target);
    return true;
  }
  return false;
};
