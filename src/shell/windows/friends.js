// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/friends.js — FRIENDS: WHO IS ON, WHAT THEY ARE DOING, AND ASKS.
//
// Reads the account's FriendStore (ctx.account.social.friends), which holds
// only what hr_social_state answered: names, online, and "Hunting in <ground>"
// or "In town" — told only to accepted friends. Rows carry data-hs-player, so
// a right-click (or a long press) opens the same player menu as anywhere; the
// row's own Message and Invite to party buttons run that menu's entries
// (src/shell/menu-providers.js), never a copy of their logic.
//   Add a friend   by claimed name (the server resolves it; a block refuses it)
//   Asks for you   Accept / Decline
//   Your asks      Withdraw
//   Blocked        the block list with Unblock (./block-list.js; Settings'
//                  `social.blocked` row opens this window)
// Every button is ONE rpc and stays off until the server answered.
// ════════════════════════════════════════════════════════════════════════
import { refusalWords } from '../intent-words.js?v=0.2.40';
import { huntName } from '../../session/party-sections.js?v=0.2.40';
import { menuProvidersOf } from '../menu-providers.js?v=0.2.40';
import { entriesFor } from '../context-menu.js?v=0.2.40';
import { blocksHtml, patchBlocks, actBlocks } from './block-list.js?v=0.2.40';
import { rows, text, cls, prop, element } from '../../render/paint.js?v=0.2.40';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.40';

const STATE = new WeakMap();
const stateOf = (body) => { let s = STATE.get(body); if (!s) { s = { pending: false, msg: '', asked: false }; STATE.set(body, s); } return s; };

/** What a friend is doing, in words. Pure. */
export function doingWords(f) {
  const where = f.doing && f.doing.kind === 'hunting' ? 'Hunting in ' + huntName(f.doing.hunt) : f.doing ? 'In town' : '';
  return (f.online ? 'Online' : 'Offline') + (where ? ' · ' + where : '');
}

export function renderFriends() {
  return '<div class="hf-friends">'
    + '<div class="hf-add"><input type="text" class="hf-name" data-hs-act="ask-name" maxlength="20" autocomplete="off" aria-label="A player’s name" placeholder="A player’s name">'
    + '<button type="button" class="hh-tool" data-hs-act="ask">Add friend</button></div>'
    + '<p class="hf-msg" role="status" aria-live="polite"></p>'
    + '<h3 class="hs-sub hf-head is-in">Asks for you</h3><ul class="hf-list is-in"></ul>'
    + '<h3 class="hs-sub">Friends</h3><ul class="hf-list is-friends"></ul><p class="hh-empty hf-none">No friends yet. Right-click a name in chat to add one.</p>'
    + '<h3 class="hs-sub hf-head is-out">Your asks</h3><ul class="hf-list is-out"></ul>' + blocksHtml() + '</div>';
}

const personAttrs = (p) => ' data-hs-player data-hs-player-id="' + esc(p.id) + '" data-hs-player-name="' + esc(p.name) + '"';

renderFriends.patch = function patchFriends(body, ctx) {
  const st = stateOf(body);
  const social = ctx.account && ctx.account.social;
  if (!social) { text(body.querySelector('.hf-msg'), 'Friends are not connected.'); return; }
  if (!st.asked) { st.asked = true; social.reread(); }
  const f = social.friends;
  rows(body.querySelector('.hf-list.is-friends'), f.friends(), {
    key: (p) => p.id,
    build: (p) => element(ctx.doc, '<li class="hf-row"' + personAttrs(p) + '><span class="hf-dot"></span><b class="hf-who"></b><small class="hf-doing"></small>'
      + '<span class="hf-acts"><button type="button" class="hh-tool" data-hs-act="run" data-entry="message">Message</button>'
      + '<button type="button" class="hh-tool" data-hs-act="run" data-entry="party-invite">Invite to party</button></span></li>'),
    patch: (el, p) => {
      text(el.querySelector('.hf-who'), p.name);
      text(el.querySelector('.hf-doing'), doingWords(p));
      cls(el, 'is-online', p.online);
      const list = entriesFor({ kind: 'player', id: p.id, name: p.name, slot: null }, menuProvidersOf(ctx));
      for (const b of el.querySelectorAll('[data-entry]')) {
        const e = list.find((x) => x.id === b.getAttribute('data-entry'));
        /* The menu's own entry, its words and state ("Party full" off); hidden where the menu hides it. */
        prop(b, 'hidden', !e);
        prop(b, 'disabled', st.pending || !e || !!e.off);
        if (e) text(b, e.label);
      }
    },
  });
  rows(body.querySelector('.hf-list.is-in'), f.incoming(), {
    key: (p) => p.id,
    build: (p) => element(ctx.doc, '<li class="hf-row"' + personAttrs(p) + '><b class="hf-who">' + esc(p.name) + '</b><span class="hf-acts">'
      + '<button type="button" class="hh-tool" data-hs-act="accept" data-id="' + esc(p.id) + '">Accept</button>'
      + '<button type="button" class="hh-tool" data-hs-act="decline" data-id="' + esc(p.id) + '">Decline</button></span></li>'),
    patch: (el) => { for (const b of el.querySelectorAll('button')) prop(b, 'disabled', st.pending); },
  });
  rows(body.querySelector('.hf-list.is-out'), f.outgoing(), {
    key: (p) => p.id,
    build: (p) => element(ctx.doc, '<li class="hf-row"' + personAttrs(p) + '><b class="hf-who">' + esc(p.name) + '</b><small class="hf-doing">Waiting for an answer</small>'
      + '<span class="hf-acts"><button type="button" class="hh-tool" data-hs-act="withdraw" data-id="' + esc(p.id) + '">Withdraw</button></span></li>'),
    patch: (el) => { for (const b of el.querySelectorAll('button')) prop(b, 'disabled', st.pending); },
  });
  cls(body.querySelector('.hf-head.is-in'), 'is-on', f.incoming().length > 0);
  cls(body.querySelector('.hf-head.is-out'), 'is-on', f.outgoing().length > 0);
  cls(body.querySelector('.hf-none'), 'is-on', f.read && !f.friends().length);
  prop(body.querySelector('[data-hs-act="ask"]'), 'disabled', st.pending);
  text(body.querySelector('.hf-msg'), st.msg || (f.read ? '' : 'Reading your friends…'));
  patchBlocks(body, ctx);
};

renderFriends.events = Object.freeze(['keydown']);

async function settle(ctx, body, st, p, done) {
  st.pending = true;
  st.msg = '';
  renderFriends.patch(body, ctx);
  const r = await p;
  st.pending = false;
  st.msg = r && r.ok === false ? refusalWords(r.error) : r && typeof r.say === 'string' ? r.say : done || '';
  renderFriends.patch(body, ctx);
}

renderFriends.act = function actFriends(ctx, body, action, ev, t) {
  const st = stateOf(body);
  const social = ctx.account && ctx.account.social;
  if (!social || st.pending) return false;
  if (actBlocks(ctx, body, action, ev, t)) return true;
  const ask = () => {
    const field = body.querySelector('.hf-name');
    const name = field.value.trim();
    if (!name) { st.msg = 'Type a name first.'; renderFriends.patch(body, ctx); return; }
    settle(ctx, body, st, social.friends.request(name).then((r) => { if (r.ok) field.value = ''; return r; }),
      'Asked. They will see it in their friends list.');
  };
  if (action === 'ask-name') { if (ev.type === 'keydown' && ev.key === 'Enter') { ask(); return true; } return false; }
  if (ev.type !== 'click') return false;
  const id = t.getAttribute('data-id');
  if (action === 'ask') ask();
  else if (action === 'accept') settle(ctx, body, st, social.friends.answer(id, true), 'You are friends now.');
  else if (action === 'decline') settle(ctx, body, st, social.friends.answer(id, false), '');
  else if (action === 'withdraw') settle(ctx, body, st, social.friends.remove(id), '');
  else if (action === 'run') {
    const row = t.closest('[data-hs-player]');
    const target = { kind: 'player', id: row.getAttribute('data-hs-player-id'), name: row.getAttribute('data-hs-player-name'), slot: null };
    const e = entriesFor(target, menuProvidersOf(ctx)).find((x) => x.id === t.getAttribute('data-entry'));
    if (e) settle(ctx, body, st, Promise.resolve(e.run(target, { open: (w) => ctx.show(w) })), '');
  } else return false;
  return true;
};
