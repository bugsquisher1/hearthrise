// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/clan.js — THE CLAN: FIND ONE, FOUND ONE, OR SEE YOURS (lane/c-social, FB-12; chapter 06 section 2.4, MM-8 first build:
// the roster, the clan chat tab and the browser; supabase/migrations/1041-social-clans.sql).
//
// One window, two faces, chosen by the server's roster answer (src/session/clan-intents.js):
//   NO CLAN   what a clan is (S-18 c: a small server's empty list still says what the room is for), the invites waiting, the clan list
//             with a search (members first), and Found a clan at the server's price
//   A CLAN    its tag, name and count, the members (rank, Level, online and what they do, as the server tells), the leader's and the
//             officers' tools (invite by name, withdraw, remove, ranks, open or invite only) and Leave, which asks once more
// Every name carries data-hs-player, so a right-click (a long press) opens the same player menu as anywhere. Every button is ONE ask and
// stays off until the server answered; after a change the roster is read again, so every number on screen is the server's.
// ════════════════════════════════════════════════════════════════════════
import { readRoster, browse, found, join, leave, invite, kick, revoke, rank, setPolicy } from '../../session/clan-intents.js';
import { refusalWords } from '../intent-words.js';
import { markPlayer } from '../context-menu.js';
import { rows, text, cls, prop, attr, element } from '../../render/paint.js';
import { whole } from '../../render/format.js';
import { escapeHtml as esc } from '../../utils/dom.js';
import { t } from '../../render/player-text.js';
import { HUNT_INDEX } from '../../data/hunts.js';
import { CLAN_RULES } from '../../data/clans.js';

const STATE = new WeakMap();
const stateOf = (body) => {
  let s = STATE.get(body);
  if (!s) { s = { roster: null, list: null, query: '', pending: false, msg: '', asked: false, leaving: false }; STATE.set(body, s); }
  return s;
};

const RANK_WORDS = Object.freeze({ leader: 'clan.rank_leader', officer: 'clan.rank_officer', member: 'clan.rank_member' });
const tagged = (c) => (c.tag ? '[' + c.tag + '] ' : '') + c.name;

/** What a member is doing, in words, from the server's answer. Pure. */
export function memberLine(m) {
  const parts = [m.level ? t('clan.level', { level: m.level }) : '', t(RANK_WORDS[m.role])];
  const where = m.doing && m.doing.kind === 'hunting' && m.doing.hunt && HUNT_INDEX[m.doing.hunt]
    ? t('clan.hunting', { ground: HUNT_INDEX[m.doing.hunt].name }) : m.doing ? t('clan.in_town') : '';
  parts.push(m.online ? t('clan.online') + (where ? ', ' + where.charAt(0).toLowerCase() + where.slice(1) : '') : t('clan.offline'));
  return parts.filter(Boolean).join(' · ');
}

export function renderClan() {
  return '<div class="hcl">'
    + '<p class="hcl-msg" role="status" aria-live="polite"></p>'
    + '<section class="hcl-none">'
    + '<h3 class="hs-sub">' + esc(t('clan.none_title')) + '</h3><p class="hcl-explain">' + esc(t('clan.none_explain')) + '</p>'
    + '<h3 class="hs-sub hcl-inv-head">' + esc(t('clan.invites_head')) + '</h3><ul class="hcl-list is-invites"></ul>'
    + '<div class="hcl-line"><input type="text" class="hcl-q" data-hs-act="q" maxlength="24" autocomplete="off" aria-label="' + esc(t('clan.search_label'))
    + '" placeholder="' + esc(t('clan.search_hint')) + '"><button type="button" class="hh-tool" data-hs-act="search">' + esc(t('clan.search_go')) + '</button></div>'
    + '<h3 class="hs-sub">' + esc(t('clan.list_head')) + '</h3><ul class="hcl-list is-clans"></ul><p class="hh-empty hcl-empty"></p>'
    + '<h3 class="hs-sub">' + esc(t('clan.found_head')) + '</h3>'
    + '<div class="hcl-found"><input type="text" class="hcl-fname" maxlength="' + CLAN_RULES.nameMax + '" autocomplete="off" aria-label="' + esc(t('clan.found_name'))
    + '" placeholder="' + esc(t('clan.found_name')) + '"><input type="text" class="hcl-ftag" maxlength="' + CLAN_RULES.tagMax + '" autocomplete="off" aria-label="'
    + esc(t('clan.found_tag')) + '" placeholder="' + esc(t('clan.found_tag_hint')) + '">'
    + '<label class="hcl-check"><input type="checkbox" class="hcl-fopen" checked> ' + esc(t('clan.found_open')) + '</label>'
    + '<button type="button" class="hh-tool is-primary" data-hs-act="found"></button></div>'
    + '</section>'
    + '<section class="hcl-mine">'
    + '<h3 class="hcl-title"><span class="hcl-tag"></span><b class="hcl-name"></b></h3><p class="hcl-count"></p>'
    + '<h3 class="hs-sub">' + esc(t('clan.roster_head')) + '</h3><ul class="hcl-list is-roster"></ul><p class="hh-empty hcl-alone">' + esc(t('clan.only_you')) + '</p>'
    + '<div class="hcl-admin"><h3 class="hs-sub">' + esc(t('clan.invite_head')) + '</h3>'
    + '<div class="hcl-line"><input type="text" class="hcl-who" data-hs-act="who" maxlength="40" autocomplete="off" aria-label="' + esc(t('clan.invite_hint'))
    + '" placeholder="' + esc(t('clan.invite_hint')) + '"><button type="button" class="hh-tool" data-hs-act="invite">' + esc(t('clan.invite_go')) + '</button></div>'
    + '<h3 class="hs-sub hcl-out-head">' + esc(t('clan.invited_head')) + '</h3><ul class="hcl-list is-invited"></ul>'
    + '<button type="button" class="hh-tool" data-hs-act="policy"></button></div>'
    + '<button type="button" class="hh-tool hcl-leave" data-hs-act="leave"></button>'
    + '</section></div>';
}

async function load(ctx, body, st) {
  const r = await readRoster(ctx.account);
  st.roster = r.ok ? r : st.roster;
  if (!r.ok) st.msg = refusalWords(r.error, 'clan');
  if (r.ok && !r.clan) {
    const b = await browse(ctx.account, st.query);
    st.list = b.ok ? b.clans : st.list;
  }
  renderClan.patch(body, ctx);
}

renderClan.patch = function patchClan(body, ctx) {
  const st = stateOf(body);
  if (!ctx.account) return;
  if (!st.asked) { st.asked = true; load(ctx, body, st); }
  const r = st.roster;
  const mine = !!(r && r.clan);
  cls(body.querySelector('.hcl-none'), 'is-on', !!r && !mine);
  cls(body.querySelector('.hcl-mine'), 'is-on', mine);
  text(body.querySelector('.hcl-msg'), st.msg || (r ? '' : t('clan.loading')));
  if (!r) return;
  if (!mine) patchNone(body, ctx, st, r); else patchMine(body, ctx, st, r);
};

function patchNone(body, ctx, st, r) {
  rows(body.querySelector('.hcl-list.is-invites'), r.invites, {
    key: (c) => c.id,
    build: (c) => element(ctx.doc, '<li class="hcl-row"><b class="hcl-who-name"></b><small class="hcl-sub"></small>'
      + '<span class="hcl-acts"><button type="button" class="hh-tool" data-hs-act="join" data-id="' + esc(c.id) + '">' + esc(t('clan.join')) + '</button></span></li>'),
    patch: (el, c) => {
      text(el.querySelector('.hcl-who-name'), tagged(c));
      text(el.querySelector('.hcl-sub'), c.invitedBy ? t('clan.invited_by', { name: c.invitedBy }) : '');
      prop(el.querySelector('button'), 'disabled', st.pending);
    },
  });
  cls(body.querySelector('.hcl-inv-head'), 'is-on', r.invites.length > 0);
  const list = st.list || [];
  rows(body.querySelector('.hcl-list.is-clans'), list, {
    key: (c) => c.id,
    build: (c) => element(ctx.doc, '<li class="hcl-row"><b class="hcl-who-name"></b><small class="hcl-sub"></small>'
      + '<span class="hcl-acts"><button type="button" class="hh-tool" data-hs-act="join" data-id="' + esc(c.id) + '">' + esc(t('clan.join')) + '</button></span></li>'),
    patch: (el, c) => {
      text(el.querySelector('.hcl-who-name'), tagged(c));
      text(el.querySelector('.hcl-sub'), [t('clan.members', { n: whole(c.members), cap: c.cap === null ? '?' : whole(c.cap) }),
        t(c.policy === 'invite' ? 'clan.policy_invite' : 'clan.policy_open'), c.leader ? t('clan.leader', { name: c.leader }) : ''].filter(Boolean).join(' · '));
      const b = el.querySelector('button'), full = c.cap !== null && c.members >= c.cap;
      prop(b, 'hidden', c.policy === 'invite' && !c.invited);
      text(b, full ? t('clan.full') : t('clan.join'));   // a full clan's press says so, beside its "12 of 12 members"
      prop(b, 'disabled', st.pending || full);
    },
  });
  const empty = body.querySelector('.hcl-empty');
  cls(empty, 'is-on', st.list !== null && !list.length);
  text(empty, st.query ? t('clan.list_no_match') : t('clan.list_empty'));
  const go = body.querySelector('[data-hs-act="found"]');
  const quoted = r.price !== null;   // the founding price is the server's (hr_clan_roster): until it says one, the press says it waits
  text(go, quoted ? t('clan.found_go', { gold: whole(r.price) }) : t('clan.found_wait'));
  prop(go, 'disabled', st.pending || !quoted);
  prop(body.querySelector('[data-hs-act="search"]'), 'disabled', st.pending);
}

function patchMine(body, ctx, st, r) {
  const c = r.clan;
  text(body.querySelector('.hcl-tag'), c.tag ? '[' + c.tag + '] ' : '');
  text(body.querySelector('.hcl-name'), c.name);
  text(body.querySelector('.hcl-count'), t('clan.members', { n: whole(c.members), cap: c.cap === null ? '?' : whole(c.cap) }) + ' · '
    + t(c.policy === 'invite' ? 'clan.policy_invite' : 'clan.policy_open'));
  const lead = r.role === 'leader';
  const admin = lead || r.role === 'officer';
  rows(body.querySelector('.hcl-list.is-roster'), r.members, {
    key: (m) => m.id,
    build: (m) => element(ctx.doc, '<li class="hcl-row"><span class="hf-dot"></span><b class="hcl-who-name"></b><small class="hcl-sub"></small><span class="hcl-acts">'
      + '<button type="button" class="hh-tool" data-hs-act="rank" data-id="' + esc(m.id) + '"></button>'
      + '<button type="button" class="hh-tool" data-hs-act="hand" data-id="' + esc(m.id) + '">' + esc(t('clan.hand_over')) + '</button>'
      + '<button type="button" class="hh-tool" data-hs-act="kick" data-id="' + esc(m.id) + '">' + esc(t('clan.remove')) + '</button></span></li>'),
    patch: (el, m) => {
      markPlayer(el, { kind: 'player', id: m.id, name: m.name, slot: m.slot });
      text(el.querySelector('.hcl-who-name'), m.name);
      text(el.querySelector('.hcl-sub'), memberLine(m));
      cls(el, 'is-online', m.online);
      const self = m.id === r.me;
      const rk = el.querySelector('[data-hs-act="rank"]');
      prop(rk, 'hidden', !lead || self);
      text(rk, t(m.role === 'officer' ? 'clan.make_member' : 'clan.make_officer'));
      attr(rk, 'data-rank', m.role === 'officer' ? 'member' : 'officer');
      prop(el.querySelector('[data-hs-act="hand"]'), 'hidden', !lead || self);
      prop(el.querySelector('[data-hs-act="kick"]'), 'hidden', self || !admin || m.role === 'leader' || (r.role === 'officer' && m.role !== 'member'));
      for (const b of el.querySelectorAll('button')) prop(b, 'disabled', st.pending);
    },
  });
  cls(body.querySelector('.hcl-alone'), 'is-on', r.members.length <= 1);
  cls(body.querySelector('.hcl-admin'), 'is-on', admin);
  rows(body.querySelector('.hcl-list.is-invited'), admin ? r.invited : [], {
    key: (p) => p.id,
    build: (p) => element(ctx.doc, '<li class="hcl-row"><b class="hcl-who-name"></b><span class="hcl-acts">'
      + '<button type="button" class="hh-tool" data-hs-act="revoke" data-id="' + esc(p.id) + '">' + esc(t('clan.withdraw')) + '</button></span></li>'),
    patch: (el, p) => { text(el.querySelector('.hcl-who-name'), p.name); prop(el.querySelector('button'), 'disabled', st.pending); },
  });
  cls(body.querySelector('.hcl-out-head'), 'is-on', admin && r.invited.length > 0);
  const pol = body.querySelector('[data-hs-act="policy"]');
  text(pol, t(c.policy === 'invite' ? 'clan.set_open' : 'clan.set_invite'));
  prop(pol, 'disabled', st.pending);
  const lv = body.querySelector('[data-hs-act="leave"]');
  text(lv, t(st.leaving ? 'clan.leave_confirm' : 'clan.leave'));
  cls(lv, 'is-danger', st.leaving);
  prop(lv, 'disabled', st.pending);
  prop(body.querySelector('[data-hs-act="invite"]'), 'disabled', st.pending);
}

renderClan.events = Object.freeze(['keydown']);

/* One ask: the window waits, then reads the roster again (every number on screen is the server's), then says the answer. */
async function settle(ctx, body, st, p, done) {
  st.pending = true;
  st.msg = '';
  renderClan.patch(body, ctx);
  const r = await p;
  st.pending = false;
  st.leaving = false;
  st.msg = r && r.ok === false ? refusalWords(r.error, 'clan') : typeof done === 'function' ? done(r) : done || '';
  await load(ctx, body, st);
}

renderClan.act = function actClan(ctx, body, action, ev, el) {
  const st = stateOf(body);
  if (!ctx.account || st.pending) return false;
  const field = (sel) => body.querySelector(sel);
  const search = () => { st.query = field('.hcl-q').value.trim(); settle(ctx, body, st, Promise.resolve({ ok: true }), ''); };
  const ask = () => {
    const name = field('.hcl-who').value.trim();
    if (!name) return;
    settle(ctx, body, st, invite(ctx.account, name).then((r) => { if (r.ok) field('.hcl-who').value = ''; return r; }), () => t('clan.invite_sent', { name }));
  };
  if (action === 'q' || action === 'who') {
    if (ev.type === 'keydown' && ev.key === 'Enter') { if (action === 'q') search(); else ask(); return true; }
    return false;
  }
  if (ev.type !== 'click') return false;
  const id = el.getAttribute('data-id');
  const r = st.roster;
  if (action === 'search') search();
  else if (action === 'join') {
    const c = (r && r.invites.concat(st.list || []).find((x) => x.id === id)) || null;
    settle(ctx, body, st, join(ctx.account, id), () => (c ? t('clan.joined', { name: c.name }) : ''));
  } else if (action === 'found') {
    const name = field('.hcl-fname').value.trim();
    const tag = field('.hcl-ftag').value.trim();
    const policy = field('.hcl-fopen').checked ? 'open' : 'invite';
    settle(ctx, body, st, found(ctx.account, ctx.character, name, tag, policy, r ? r.price : null), () => t('clan.found_done', { name }));
  } else if (action === 'invite') ask();
  else if (action === 'revoke') settle(ctx, body, st, revoke(ctx.account, id), '');
  else if (action === 'kick') settle(ctx, body, st, kick(ctx.account, id), '');
  else if (action === 'rank') settle(ctx, body, st, rank(ctx.account, id, el.getAttribute('data-rank')), '');
  else if (action === 'hand') settle(ctx, body, st, rank(ctx.account, id, 'leader'), '');
  else if (action === 'policy') settle(ctx, body, st, setPolicy(ctx.account, r && r.clan && r.clan.policy === 'invite' ? 'open' : 'invite'), '');
  else if (action === 'leave') {
    if (!st.leaving) { st.leaving = true; renderClan.patch(body, ctx); return true; }
    settle(ctx, body, st, leave(ctx.account), () => t('clan.left'));
  } else return false;
  return true;
};
