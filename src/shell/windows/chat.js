// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/chat.js — THE CHAT WINDOW: CHANNEL TABS, WHISPERS, THE COMBAT LOG.
//
// Tabs are the rows of src/data/chat-channels.js (Global, Local, Party while in
// a party, System, Combat) plus one per open whisper conversation; each tab but
// Combat carries an unread dot. A line reads  HH:MM  Name [level ◆role]: body
// with the name coloured by its role (the role is roleForWeapon over the
// server's weapon and pick, src/social/chat-lines.js). Item links show the
// catalogue name in its rarity and open the shared item tooltip
// (./item-tip.js). A name opens the player menu (src/shell/context-menu.js),
// on a click as on a right-click.
//
// Lines come from the account's social side (ctx.account.social: ChatStore,
// WhisperStore) and are only ever APPENDED: one keyed list per tab, built once,
// so a line already drawn is never redrawn. A list stays at the bottom unless
// the player scrolled up; then a "New messages" pill brings them down.
//
// THE INPUT: its placeholder says who you are talking to. Enter sends (ONE
// rpc; Send stays off until the server answers), Esc leaves the field. The
// field never swallows a key: whether a key belongs to it is the one rule,
// keyBelongsToField (src/utils/dom.js), which the World and the window keys
// read too — so W types while the field has focus and walks once it is left.
// ════════════════════════════════════════════════════════════════════════
import { CHAT_TABS, WHISPER } from '../../data/chat-channels.js?v=0.2.25';
import { refusalWords } from '../intent-words.js?v=0.2.25';
import { ROLE_GLYPH } from '../../data/hunt-hud.js?v=0.2.25';
import { HUNT_ROLES } from '../../data/hunt-roles.js?v=0.2.25';
import { isWhisperTab } from '../../social/whispers.js?v=0.2.25';
import { linkLabel } from '../../social/chat-lines.js?v=0.2.25';
import { combatHtml, patchCombat, actCombat } from './chat-combat.js?v=0.2.25';
import { showTip, hideTip } from './item-tip.js?v=0.2.25';
import { rarityOf } from '../bag-model.js?v=0.2.25';
import { glyphSvg } from '../launcher.js?v=0.2.25';
import { rows, text, cls, attr, prop, element } from '../../render/paint.js?v=0.2.25';
import { escapeHtml as esc, keyBelongsToField } from '../../utils/dom.js?v=0.2.25';
import { playerTargetOf } from '../context-menu.js?v=0.2.25';

const STATE = new WeakMap();
const ROW = Object.freeze(Object.fromEntries(CHAT_TABS.map((t) => [t.id, t])));
const stateOf = (body) => { let s = STATE.get(body); if (!s) { s = { tab: null, sending: false, msg: '', rev: -1, built: false }; STATE.set(body, s); } return s; };
const socialOf = (ctx) => (ctx.account && ctx.account.social) || null;

/** The tabs on show now: [{ id, label, unread }]. */
function tabsOf(social) {
  if (!social) return [{ id: 'combat', label: ROW.combat.label, unread: 0 }];
  const out = CHAT_TABS.filter((t) => social.chat.shows(t.id))
    .map((t) => ({ id: t.id, label: t.label, unread: t.unread === false ? 0 : social.chat.unread(t.id) }));
  for (const c of social.whispers.conversations()) out.push({ id: c.tab, label: c.name, unread: c.unread, whisper: true });
  return out;
}

/** The skeleton (built once). */
export function renderChat() {
  return '<div class="hc-chat ph-mask">'
    + '<div class="hc-tabs" role="tablist" aria-label="Channels"></div>'
    + '<div class="hc-pane is-talk"><div class="hc-logs"></div>'
    + '<button type="button" class="hc-pill" data-hs-act="to-bottom" hidden>New messages</button>'
    + '<p class="hh-empty hc-none is-talk"></p></div>'
    + '<div class="hc-pane is-combat">' + combatHtml() + '</div>'
    + '<div class="hc-input"><input type="text" class="hc-field" data-hs-act="draft" maxlength="240" autocomplete="off" enterkeyhint="send" aria-label="Message">'
    + '<button type="button" class="hh-tool hc-send" data-hs-act="send">Send</button></div>'
    + '<p class="hc-msg" role="status" aria-live="polite"></p></div>';
}

function tabEl(doc, t) {
  return element(doc, '<span class="hc-tab' + (t.whisper ? ' is-whisper' : '') + '" role="presentation">'
    + '<button type="button" role="tab" class="ha-tab" data-hs-act="tab" data-tab="' + esc(t.id) + '"><span class="hc-tab-label"></span><i class="hc-dot" aria-hidden="true"></i></button>'
    + (t.whisper ? '<button type="button" class="hc-x" data-hs-act="close-tab" data-tab="' + esc(t.id) + '" aria-label="Close this conversation">×</button>' : '')
    + '</span>');
}

function partsHtml(parts) {
  return parts.map((p) => {
    if (!p.item) return esc(p.text);
    const rar = rarityOf(p.item);
    return '<button type="button" class="hc-link' + (rar ? ' rar-' + esc(rar) : '') + '" data-hs-act="link" data-item="' + esc(p.item) + '">' + esc(linkLabel(p.item)) + '</button>';
  }).join('');
}

/** One line's element, written once: time, name [level role], body. */
function lineEl(ctx, l) {
  if (l.system) return element(ctx.doc, '<li class="hc-line is-system"><time class="hc-time">' + esc(l.time) + '</time> <span class="hc-body">' + partsHtml(l.parts) + '</span></li>');
  const role = l.role && HUNT_ROLES[l.role] ? l.role : null;
  const tag = (l.level !== null || role)
    ? ' <span class="hc-tag">[' + (l.level !== null ? esc(l.level) : '') + (role ? '<span class="hc-role" title="' + esc(HUNT_ROLES[role].label) + '">' + glyphSvg(ctx.glyphs, ROLE_GLYPH[role] || 'uiPeople') + '</span>' : '') + ']</span>'
    : '';
  const who = '<button type="button" class="hc-name' + (role ? ' is-' + esc(role) : '') + '" data-hs-act="name" data-hs-player'
    + (l.fromId ? ' data-hs-player-id="' + esc(l.fromId) + '"' : '') + ' data-hs-player-name="' + esc(l.name) + '"'
    + (l.slot !== null ? ' data-hs-player-slot="' + esc(l.slot) + '"' : '') + '>' + esc(l.name) + '</button>';
  return element(ctx.doc, '<li class="hc-line"><time class="hc-time">' + esc(l.time) + '</time> ' + who + tag + ': <span class="hc-body">' + partsHtml(l.parts) + '</span></li>');
}

/* The keyed list for one tab, made the first time it is shown. */
function logOf(body, tab) {
  const box = body.querySelector('.hc-logs');
  let list = Array.from(box.children).find((el) => el.getAttribute('data-log') === tab);
  if (!list) {
    list = body.ownerDocument.createElement('ol');
    list.className = 'hc-log is-talk';
    list.setAttribute('data-log', tab);
    list.setAttribute('aria-live', 'polite');
    box.appendChild(list);
  }
  return list;
}

renderChat.patch = function patchChat(body, ctx) {
  const st = stateOf(body);
  const social = socialOf(ctx);
  if (social && social.wanted) { st.tab = social.wanted; social.wanted = null; }
  const tabs = tabsOf(social);
  if (!tabs.some((t) => t.id === st.tab)) st.tab = social ? (social.chatTab && tabs.some((t) => t.id === social.chatTab) ? social.chatTab : 'global') : 'combat';
  if (social) social.chatTab = st.tab;
  const tab = st.tab;
  rows(body.querySelector('.hc-tabs'), tabs, {
    key: (t) => t.id,
    build: (t) => tabEl(ctx.doc, t),
    patch: (el, t) => {
      const b = el.firstElementChild;
      text(b.querySelector('.hc-tab-label'), t.label);
      attr(b, 'aria-selected', String(t.id === tab));
      cls(b, 'is-unread', t.unread > 0 && t.id !== tab);
      attr(b, 'aria-label', t.label + (t.unread > 0 && t.id !== tab ? ', ' + t.unread + ' unread' : ''));
    },
  });
  const combat = tab === 'combat';
  cls(body.querySelector('.hc-pane.is-combat'), 'is-on', combat);
  cls(body.querySelector('.hc-pane.is-talk'), 'is-on', !combat);
  patchCombat(body.querySelector('.hc-pane.is-combat'), ctx);
  if (!combat && social) patchTalk(body, ctx, social, st);
  patchInput(body, ctx, social, st);
};

function patchTalk(body, ctx, social, st) {
  const tab = st.tab;
  const whisper = isWhisperTab(tab);
  const lines = whisper ? social.whispers.lines(tab) : social.chat.lines(tab);
  for (const el of body.querySelectorAll('.hc-log.is-talk')) cls(el, 'is-on', el.getAttribute('data-log') === tab);
  const list = logOf(body, tab);
  cls(list, 'is-on', true);
  const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 4;
  const before = list.childElementCount;
  rows(list, lines, { key: (l) => l.id, build: (l) => lineEl(ctx, l), patch: () => {} });
  const added = list.childElementCount > before;
  const pill = body.querySelector('.hc-pill');
  if (atBottom || st.jump) { list.scrollTop = list.scrollHeight; st.jump = false; prop(pill, 'hidden', true); }
  else if (added) prop(pill, 'hidden', false);
  const none = body.querySelector('.hc-none.is-talk');
  text(none, lines.length ? '' : social.chat.loading ? 'Reading the chat…' : 'Nothing said here yet.');
  cls(none, 'is-on', !lines.length);
  social.chat.view(whisper ? null : tab, true);
  social.whispers.view(whisper ? tab : null, true);
}

function patchInput(body, ctx, social, st) {
  const field = body.querySelector('.hc-field');
  const send = body.querySelector('.hc-send');
  const whisper = isWhisperTab(st.tab);
  const row = ROW[st.tab];
  const can = !!social && (whisper || !!(row && row.send));
  const place = whisper ? WHISPER.placeholder(social.whispers.nameOf(st.tab) || 'them') : row ? row.placeholder : '';
  attr(field, 'placeholder', place);
  attr(field, 'aria-label', place);
  prop(field, 'disabled', !can);
  prop(send, 'disabled', !can || st.sending);
  text(body.querySelector('.hc-msg'), st.msg);
  if (social && social.chat.draft.rev !== st.rev) { st.rev = social.chat.draft.rev; prop(field, 'value', social.chat.draft.text); }
  if (!st.built) {
    st.built = true;
    if (can && !ctx.isPhone() && field.ownerDocument.activeElement !== field) field.focus({ preventScroll: true });
  }
}

async function doSend(ctx, body, st) {
  const social = socialOf(ctx);
  const field = body.querySelector('.hc-field');
  if (!social || st.sending) return;
  const textNow = field.value;
  if (!textNow.trim()) { field.blur(); return; }
  st.sending = true;
  st.msg = '';
  renderChat.patch(body, ctx);
  const store = isWhisperTab(st.tab) ? social.whispers : social.chat;
  const r = await store.send(st.tab, textNow, social.chat.draft.links);
  st.sending = false;
  if (r.ok) { social.chat.draft = { text: '', links: [], rev: social.chat.draft.rev + 1 }; st.jump = true; }
  else st.msg = refusalWords(r.error);
  renderChat.patch(body, ctx);
}

renderChat.events = Object.freeze(['keydown', 'input', 'mouseover', 'mouseout']);

renderChat.act = function actChat(ctx, body, action, ev, t) {
  const st = stateOf(body);
  const social = socialOf(ctx);
  const type = ev.type;
  if (actCombat(ctx, body.querySelector('.hc-pane.is-combat'), action, ev, t)) return true;
  if (action === 'draft') {
    if (type === 'input' && social) { social.chat.setDraft(t.value); st.msg = ''; return false; }
    if (type === 'keydown' && !keyBelongsToField(t, ev.key)) return false;   // the one key rule (src/utils/dom.js)
    if (type === 'keydown' && ev.key === 'Enter' && !ev.isComposing) { doSend(ctx, body, st); return true; }
    if (type === 'keydown' && ev.key === 'Escape') { t.blur(); return true; }
    return false;
  }
  if (action === 'link') {
    const id = t.getAttribute('data-item');
    if (type === 'mouseover' || type === 'click') showTip(ctx.doc, t, id, {});
    else if (type === 'mouseout') hideTip(ctx.doc);
    return type === 'click';
  }
  if (type !== 'click') return false;
  if (action === 'tab') { st.tab = t.getAttribute('data-tab'); st.msg = ''; st.jump = true; renderChat.patch(body, ctx); return true; }
  if (action === 'close-tab' && social) { social.whispers.close(t.getAttribute('data-tab')); renderChat.patch(body, ctx); return true; }
  if (action === 'send') { doSend(ctx, body, st); return true; }
  if (action === 'to-bottom') { st.jump = true; renderChat.patch(body, ctx); return true; }
  if (action === 'name' && ctx.menu) {
    const r = t.getBoundingClientRect();
    ctx.menu.open(playerTargetOf(t), { x: r.left, y: r.bottom + 2 });
    return true;
  }
  return false;
};
