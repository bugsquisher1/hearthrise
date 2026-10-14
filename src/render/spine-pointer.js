// ════════════════════════════════════════════════════════════════════════
// src/render/spine-pointer.js — THE POINTER BAR AND HOME'S STEP CARD, AS HTML.
//
// Pure string builders over a model from src/core/spine-pointer.js. Every
// figure printed is the model's (the server's); an unknown one is the pending
// dash the caller hands in, never a 0. The caller supplies the lookups (item
// and skill names, the icon painter, routes) so this file reads no window.
// Skin: src/styles/spine-pointer.css (tokens only).
// ════════════════════════════════════════════════════════════════════════

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
const num = (n) => Number(n).toLocaleString('en-US');

/** What a part is called on the bar. */
function partLabel(part, o) {
  if (part.label) return part.label;
  const n = part.need;
  if (n.fact === 'item') return o.itemName(n.id);
  if (n.fact === 'gold') return 'Gold';
  if (n.fact === 'level') return o.skillName(n.skill) + ' level';
  if (n.fact === 'combat') return 'Combat level';
  return '';
}

/** "4/20", clamped at the goal; the dash when the server has not said. */
function partFigure(s, dash) {
  const have = s.known ? num(Math.min(s.have, s.min)) : dash;
  return have + '/' + num(s.min);
}

/** The server catalogue's reward, in words: "150 gold · 5× Turnip Seed".
    First Steps prints the same words on its card (src/features/spine-pointer.js
    pendingClaim), so a reward is never phrased two ways. */
export function rewardText(reward, itemName) {
  if (!reward) return '';
  const bits = [];
  if (reward.gold > 0) bits.push(num(reward.gold) + ' gold');
  Object.keys(reward.items || {}).forEach((id) => bits.push(num(reward.items[id]) + '× ' + itemName(id)));
  return bits.join(' · ');
}

/** The button: Claim, or the route of the first part not met. */
function action(m, routes) {
  if (!m || m.finished || !m.go) return null;
  if (m.go.kind === 'claim') return { verb: 'Claim', glyph: 'uiGift', claim: true };
  const r = routes[m.go.route];
  return r ? { verb: r.verb, glyph: r.glyph, claim: false } : null;
}

function partsHtml(m, o) {
  const next = m.parts.findIndex((s) => !s.met);
  return m.parts.filter((s) => !s.part.act).map((s) => {
    const i = m.parts.indexOf(s);
    const cls = 'sp-part' + (s.met ? ' is-met' : '') + (i === next ? ' is-next' : '') + (s.known ? '' : ' is-unknown');
    return '<span class="' + cls + '">' + (s.met ? o.icon('uiCheck', 13, 'var(--green)') : '')
      + '<span class="sp-pl">' + esc(partLabel(s.part, o)) + '</span> <b>' + partFigure(s, o.dash) + '</b></span>';
  }).join('');
}

function dailyHtml(d) {
  if (!d) return '';
  const fig = (d.known ? d.done : '—') + '/' + d.total;
  return '<button type="button" class="sp-daily' + (d.claim ? ' is-claim' : '') + '" data-sp="daily" title="'
    + (d.claim ? 'A daily reward is ready to claim' : 'Today\'s daily quests') + '">Daily ' + fig + '</button>';
}

/** The bar on every tab but Home. `o.pending` draws the honest loading line. */
export function barHtml(m, o) {
  if (o.pending || !m || !m.ready) {
    return '<div class="sp-in"><span class="sp-step">' + o.dash + '</span><span class="sp-title is-pending">Finding your next step</span>'
      + dailyHtml(o.daily) + '</div>';
  }
  if (m.finished) {
    /* Two lengths of the same line: a landscape phone shares the topbar with the
       pane strip and has room for the short one only (CSS picks). */
    return '<div class="sp-in"><span class="sp-title" title="Every step is done. The realm is yours.">'
      + '<span class="sp-long">Every step is done. The realm is yours.</span><span class="sp-short">Every step done</span></span>'
      + dailyHtml(o.daily) + '</div>';
  }
  const a = action(m, o.routes);
  const reward = a && a.claim ? '<span class="sp-reward">' + esc(rewardText(m.reward, o.itemName)) + '</span>' : '';
  return '<div class="sp-in"><span class="sp-step">Step ' + m.step + '</span>'
    + '<span class="sp-title">' + esc(m.row.title) + '</span>'
    + '<span class="sp-parts">' + partsHtml(m, o) + reward + '</span>'
    + dailyHtml(o.daily)
    + (a ? '<button type="button" class="sp-go' + (a.claim ? ' is-claim' : '') + '" data-sp="go">' + esc(a.verb) + '</button>' : '')
    + '</div>';
}

/** Home's top card: the same step, with its reason and its reward. */
export function cardHtml(m, o) {
  if (o.pending || !m || !m.ready) return '';
  if (m.finished) {
    return '<div class="hd-spine" data-sp-card><div class="hd-card hd-mile is-title"><div class="hd-mile-badge">'
      + o.icon('uiCrown', 22, 'var(--gold-2)') + '</div><div class="hd-mile-body"><div class="hd-mile-title">Every step is done</div>'
      + '<div class="hd-mile-sub">The road is walked. The realm is yours.</div></div>' + dailyHtml(o.daily) + '</div></div>';
  }
  const a = action(m, o.routes);
  const reward = rewardText(m.reward, o.itemName);
  return '<div class="hd-spine" data-sp-card><div class="hd-card hd-mile is-title">'
    + '<div class="hd-mile-badge">' + o.icon(a ? a.glyph : 'uiQuests', 22, 'var(--gold-2)') + '</div>'
    + '<div class="hd-mile-body"><div class="sp-step">Step ' + m.step + '</div>'
    + '<div class="hd-mile-title">' + esc(m.row.title) + '</div>'
    + '<div class="hd-mile-sub sp-why">' + esc(m.row.why) + '</div>'
    + '<div class="sp-parts">' + partsHtml(m, o) + '</div>'
    + (reward ? '<div class="sp-reward">Reward: ' + esc(reward) + '</div>' : '')
    + (m.next ? '<div class="sp-next">Next: ' + esc(m.next.title) + '</div>' : '')
    + '</div><div class="sp-acts">' + dailyHtml(o.daily)
    + (a ? '<button type="button" class="hd-cta' + (a.claim ? ' is-claim' : '') + '" data-sp="go">' + esc(a.verb) + '</button>' : '')
    + '</div></div></div>';
}
