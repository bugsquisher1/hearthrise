// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/game-master-body.js — THE GAME MASTER WINDOW (2027-03-13-gm-tools.sql).
//
// Plain and small on purpose, the first version: who's playing, one hero and what can be done to it, one line to everyone, and what
// this account's own walled hero may be given. Every number and name is the server's answer; a press is one ask, and its buttons stay off
// until the server answers. A stop, a mute and a ban ask once more, naming the target. Refusals read through refusalText, never a code.
// One component, shown as a window on a desktop and a sheet on a phone (CLAUDE.md §1).
// ════════════════════════════════════════════════════════════════════════
import { attr, cls, element, prop, rows, text } from '../../render/paint.js?v=0.2.118';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.118';
import { huntFor } from '../../core/hunt-spawn.js?v=0.2.118';
import { refusalText } from '../intent-words.js?v=0.2.118';
import { gmBan, gmGrantGold, gmGrantItem, gmGrantLevel, gmHero, gmMute, gmOnline, gmSay, gmStop, gmUnban, gmUnmute } from '../../session/gm-intents.js?v=0.2.118';

const MUTE_MINUTES = Object.freeze([[15, '15 minutes'], [60, '1 hour'], [1440, '1 day'], [10080, '1 week']]);
const STATES = new WeakMap();
/* Per account, not per open: closing the window keeps who was being looked at. */
const stateOf = (ctx) => { if (!STATES.has(ctx.account)) STATES.set(ctx.account, { heroes: null, hero: null, pending: false, confirm: null, said: '' }); return STATES.get(ctx.account); };

const SKELETON = '<section class="gm-part"><h3 class="hs-sub">Who\'s playing</h3>'
  + '<button type="button" class="hh-tool" data-hs-act="gm-online">Refresh</button>'
  + '<ul class="gm-list"></ul><p class="hh-empty gm-none">Press Refresh to see who\'s playing.</p></section>'
  + '<section class="gm-part"><h3 class="hs-sub">One hero</h3><div class="gm-row"><input class="hh-num gm-field gm-find" type="text" maxlength="20" aria-label="A hero\'s name" placeholder="A hero\'s name">'
  + '<button type="button" class="hh-tool" data-hs-act="gm-look">Look</button></div>'
  + '<div class="gm-hero" hidden><p class="gm-facts"></p><ul class="gm-more"></ul>'
  + '<input class="hh-num gm-field gm-why" type="text" maxlength="200" aria-label="Why" placeholder="Why? A few words, kept in the log">'
  + '<div class="gm-row"><button type="button" class="hh-tool" data-hs-act="gm-stop">Stop</button>'
  + '<select class="hh-select gm-minutes" aria-label="For how long">' + MUTE_MINUTES.map(([m, w]) => '<option value="' + m + '">' + w + '</option>').join('') + '</select>'
  + '<button type="button" class="hh-tool" data-hs-act="gm-mute">Mute</button><button type="button" class="hh-tool" data-hs-act="gm-unmute">Unmute</button>'
  + '<button type="button" class="hh-tool" data-hs-act="gm-ban">Ban</button><button type="button" class="hh-tool" data-hs-act="gm-unban">Unban</button></div>'
  + '<div class="gm-confirm" hidden><p class="gm-ask"></p><div class="gm-row"><button type="button" class="hh-tool is-primary" data-hs-act="gm-yes"></button>'
  + '<button type="button" class="hh-tool" data-hs-act="gm-no">Cancel</button></div></div></div></section>'
  + '<section class="gm-part"><h3 class="hs-sub">Say to everyone</h3><div class="gm-row"><input class="hh-num gm-field gm-say" type="text" maxlength="240" aria-label="A line to everyone" placeholder="Everyone reads this as the Game Master">'
  + '<button type="button" class="hh-tool" data-hs-act="gm-say">Say</button></div></section>'
  + '<section class="gm-part"><h3 class="hs-sub">This test hero</h3><p class="hs-note">Only this account can be given anything, and it can\'t trade, use the market or reach a leaderboard. The hero must be idle.</p>'
  + '<input class="hh-num gm-field gm-grant-why" type="text" maxlength="200" aria-label="Why" placeholder="Why? A few words, kept in the log">'
  + '<div class="gm-row"><input class="hh-num gm-field gm-gold" type="number" min="1" aria-label="Gold" placeholder="Gold"><button type="button" class="hh-tool" data-hs-act="gm-give-gold">Give gold</button></div>'
  + '<div class="gm-row"><input class="hh-num gm-field gm-item" type="text" maxlength="64" aria-label="Item id" placeholder="Item id"><input class="hh-num gm-field gm-qty" type="number" min="1" aria-label="How many" placeholder="How many"><button type="button" class="hh-tool" data-hs-act="gm-give-item">Give item</button></div>'
  + '<div class="gm-row"><input class="hh-num gm-field gm-level" type="number" min="2" aria-label="Level" placeholder="Level"><button type="button" class="hh-tool" data-hs-act="gm-give-level">Raise Level</button></div></section>'
  + '<p class="gm-said" role="status" aria-live="polite"></p>';

const where = (h) => {
  if (h.hunt) { const g = huntFor(h.hunt); return (g && g.name ? g.name : h.hunt) + (h.leaving ? ' (leaving)' : ''); }
  if (h.job) return (h.job === 'gather' ? 'Gathering ' : 'Crafting ') + String(h.job_id || '').replace(/_/g, ' ');
  return h.online ? 'In town' : 'Offline';
};
const flags = (h) => [h.gm ? 'Game Master' : '', h.banned ? 'Banned' : '', h.muted || h.muted_until ? 'Muted' : ''].filter(Boolean).join(', ');
const LINE = (v) => (v === null || v === undefined ? '' : String(v));

function factsOf(h) {
  const open = h.hunt ? { hunt: h.hunt.id, leaving: h.hunt.leaving } : { job: h.job, job_id: h.job_id, online: true };
  return [h.name + ' · Level ' + h.level, where(open), LINE(h.gold) + ' gold', flags(h)].filter(Boolean).join(' · ');
}
function moreOf(h) {
  const out = [];
  if (h.hunt) out.push('On this hunt ' + LINE(h.hunt.lag_s) + ' s behind the server, seat ' + LINE(h.hunt.seat));
  if (h.party) out.push('Party: ' + h.party.map((m) => m.name).join(', '));
  for (const s of h.hunts || []) out.push('Hunted ' + (huntFor(s.id) ? huntFor(s.id).name : s.id) + ', ended: ' + LINE(s.end_reason));
  for (const r of h.refusals || []) out.push('Refused today: ' + r.intent + ' ' + r.code + ' x' + r.n);
  for (const l of h.ledger || []) out.push('Ledger: ' + l.kind + ' ' + LINE(l.intent) + (l.gold ? ' ' + l.gold + ' gold' : '') + (l.item ? ' ' + l.item + ' x' + LINE(l.qty) : ''));
  return out;
}

export function patchBody(el, ctx) {
  const root = el.querySelector('[data-gm-root]');
  if (!root) return;
  if (!root.firstChild) root.innerHTML = SKELETON;
  const st = stateOf(ctx);
  rows(root.querySelector('.gm-list'), st.heroes || [], {
    key: (h) => h.id + ':' + h.slot,
    build: (h) => element(ctx.doc, '<li><button type="button" class="hh-tool gm-pick" data-hs-act="gm-pick" data-id="' + esc(h.id) + '" data-slot="' + esc(h.slot) + '"></button></li>'),
    patch: (li, h) => { text(li.querySelector('button'), [h.name + ' · ' + h.level, where(h), flags(h)].filter(Boolean).join(' · ')); },
  });
  cls(root.querySelector('.gm-none'), 'is-on', !st.heroes || !st.heroes.length);
  if (st.heroes) text(root.querySelector('.gm-none'), 'Nobody is online or playing.');
  const h = st.hero;
  attr(root.querySelector('.gm-hero'), 'hidden', h ? null : '');
  if (h) {
    text(root.querySelector('.gm-facts'), factsOf(h));
    rows(root.querySelector('.gm-more'), moreOf(h), { key: (l, i) => i, build: () => element(ctx.doc, '<li></li>'), patch: (li, l) => text(li, l) });
    /* Off only while a press is out: the server decides the rest and the line says why. */
    for (const a of ['gm-stop', 'gm-mute', 'gm-unmute', 'gm-ban', 'gm-unban']) prop(root.querySelector('[data-hs-act="' + a + '"]'), 'disabled', st.pending);
  }
  const c = st.confirm;
  attr(root.querySelector('.gm-confirm'), 'hidden', c ? null : '');
  if (c) { text(root.querySelector('.gm-ask'), c.ask); text(root.querySelector('[data-hs-act="gm-yes"]'), c.yes); prop(root.querySelector('[data-hs-act="gm-yes"]'), 'disabled', st.pending); }
  for (const a of ['gm-online', 'gm-look', 'gm-say', 'gm-give-gold', 'gm-give-item', 'gm-give-level']) prop(root.querySelector('[data-hs-act="' + a + '"]'), 'disabled', st.pending);
  text(root.querySelector('.gm-said'), st.said);
}

/* One ask at a time: its buttons stay off until the server answers. */
async function asking(ctx, el, run) {
  const st = stateOf(ctx);
  if (st.pending) return;
  st.pending = true; st.said = '';
  patchBody(el, ctx);
  try { await run(st); } finally { st.pending = false; if (el.isConnected) patchBody(el, ctx); }
}
const said = (st, r, done, cs) => { st.said = r && r.ok ? done : refusalText(r || { error: 'network' }, cs); };

async function readHero(ctx, st, target, slot) {
  const r = await gmHero(ctx.account, target, slot);
  if (r.ok) st.hero = r.hero; else { st.hero = null; said(st, r, '', ctx.character); }
  return r;
}

/* After an act, the list a Refresh already drew says what the server says now. */
async function reread(ctx, st, h) {
  await readHero(ctx, st, h.id, h.slot);
  if (!st.heroes) return;
  const r = await gmOnline(ctx.account);
  if (r.ok) st.heroes = r.heroes;
}

const CONFIRMS = Object.freeze({
  'gm-stop': (h, m) => ({ ask: 'Stop ' + h.name + '? It keeps what it earned, as if the player had pressed Stop.', yes: 'Stop ' + h.name, verb: 'stop', m }),
  'gm-mute': (h, m) => ({ ask: 'Mute ' + h.name + '\'s account for ' + m[1] + '? Chat and whispers stop until then.', yes: 'Mute ' + h.name, verb: 'mute', m }),
  'gm-ban': (h, m) => ({ ask: 'Ban ' + h.name + '\'s account? Every hero on it leaves the game, and the player sees a notice.', yes: 'Ban ' + h.name, verb: 'ban', m }),
});

async function runConfirmed(ctx, el, root, c, st) {
  const h = st.hero, cs = ctx.character, why = root.querySelector('.gm-why').value;
  st.confirm = null;
  if (c.verb === 'stop') {
    const r = await gmStop(cs, h.id, h.slot, why);
    said(st, r, r && r.kind === 'hunt' ? h.name + ' is leaving its hunt.' : h.name + ' stopped.', cs);
  } else if (c.verb === 'mute') {
    said(st, await gmMute(ctx.account, h.id, c.m[0], why), h.name + ' is muted.', cs);
  } else {
    const r = await gmBan(ctx.account, h.id, why);
    said(st, r, h.name + '\'s account is banned.', cs);
    /* A town job needs the engine: each one the server named stops by the player's own path. */
    if (r && r.ok) for (const j of r.jobs || []) await gmStop(cs, h.id, j.slot, why);
  }
  await reread(ctx, st, h);
}

const whole = (input) => { const n = Number(input.value); return Number.isSafeInteger(n) ? n : 0; };

/** One press. `t` is the pressed control. */
export function actBody(ctx, el, action, ev, t) {
  if (ev.type !== 'click') return false;
  const st = stateOf(ctx);
  const root = el.querySelector('[data-gm-root]');
  const cs = ctx.character, account = ctx.account;
  const grantWhy = () => root.querySelector('.gm-grant-why').value;
  const minutes = () => MUTE_MINUTES.find(([m]) => String(m) === root.querySelector('.gm-minutes').value) || MUTE_MINUTES[0];
  if (CONFIRMS[action] && st.hero) { st.confirm = CONFIRMS[action](st.hero, minutes()); st.said = ''; patchBody(el, ctx); return false; }
  if (action === 'gm-no') { st.confirm = null; patchBody(el, ctx); return false; }
  const go = {
    'gm-yes': (s) => (s.confirm ? runConfirmed(ctx, el, root, s.confirm, s) : null),
    'gm-online': async (s) => { const r = await gmOnline(account); if (r.ok) s.heroes = r.heroes; else said(s, r, '', cs); },
    'gm-look': (s) => readHero(ctx, s, root.querySelector('.gm-find').value.trim(), null),
    'gm-pick': (s) => readHero(ctx, s, t.getAttribute('data-id'), Number(t.getAttribute('data-slot'))),
    'gm-unmute': async (s) => { const h = s.hero; said(s, await gmUnmute(account, h.id, root.querySelector('.gm-why').value), h.name + ' can chat again.', cs); await reread(ctx, s, h); },
    'gm-unban': async (s) => { const h = s.hero; said(s, await gmUnban(account, h.id, root.querySelector('.gm-why').value), h.name + '\'s account can play again.', cs); await reread(ctx, s, h); },
    'gm-say': async (s) => { const box = root.querySelector('.gm-say'); const r = await gmSay(account, box.value); said(s, r, 'Said.', cs); if (r.ok) box.value = ''; },
    'gm-give-gold': async (s) => said(s, await gmGrantGold(account, cs, whole(root.querySelector('.gm-gold')), grantWhy()), 'Gold given.', cs),
    'gm-give-item': async (s) => said(s, await gmGrantItem(account, cs, root.querySelector('.gm-item').value.trim(), whole(root.querySelector('.gm-qty')), grantWhy()), 'Item given.', cs),
    'gm-give-level': async (s) => said(s, await gmGrantLevel(account, cs, whole(root.querySelector('.gm-level')), grantWhy()), 'Level raised.', cs),
  }[action];
  if (go) asking(ctx, el, go);
  return false;
}
