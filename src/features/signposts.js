// src/features/signposts.js — renders the dead-end copy in src/data/signposts.js.
//
// Pure helpers plus one publisher: setupSignposts() puts them on
// window.HearthriseSignposts for the classic-script screens (bag, farm, home,
// chronicle) and legacy.js, which read it at call time. No top-level window or
// DOM access. Every fact a line names is read from its owner at call time: the
// bounty ladder from core/bounty.js, item sources from the item index.

import { SIGNPOSTS } from '../data/signposts.js?v=565';
import { ITEMS } from '../data/items.js?v=565';
import { SKILLS_DEF } from '../data/skills.js?v=565';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** The line's text with its vars filled; '' when a declared var is missing. */
export function fill(key, vars) {
  const line = SIGNPOSTS.lines[key];
  if (!line) return '';
  const v = vars || {};
  if ((line.vars || []).some((n) => v[n] == null || v[n] === '')) return '';
  return line.text.replace(/\{(\w+)\}/g, (m, n) => String(v[n]));
}

function label(key) { return SIGNPOSTS.labels[key] || ''; }

function door(key) { return (SIGNPOSTS.lines[key] || {}).door || null; }

function stallLine(skillId, res) {
  const skill = (SKILLS_DEF[skillId] && SKILLS_DEF[skillId].name) || String(skillId);
  if (res && res.reason === 'gate') return fill('stall.locked', { skill });
  const id = res && res.missing;
  const item = (id && ITEMS[id] && ITEMS[id].n) || 'materials';
  let source = '';
  try { if (id && typeof window.itemSourceLine === 'function') source = window.itemSourceLine(id) || ''; } catch (e) { source = ''; }
  return source ? fill('stall.outOf', { item, skill, source }) : fill('stall.outOfBare', { item, skill });
}

function bagEmptyKey({ catId, heldInCat }) {
  return heldInCat > 0 ? 'bag.hidden' : 'bag.' + catId;
}

function listText(names) {
  return names.length > 1 ? names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1] : names.join('');
}

function bountyStripHtml({ level, clientMayPay, bounty }) {
  let hardLv = 0;
  for (let lv = 1; lv <= 120 && !hardLv; lv++) if (bounty.unlockedTypes(lv).indexOf('streak') >= 0) hardLv = lv;
  const notPosted = Object.keys(bounty.BOUNTY_TURN_IN)
    .filter((t) => !bounty.isOfferableType(t, clientMayPay))
    .map((t) => bounty.BOUNTY_TYPE_LABEL[t] || t);
  const chip = (lv, text, on) => `<span class="bh-unlock${on ? ' is-on' : ''}"><em>${lv}</em>${esc(text)}</span>`;
  const note = notPosted.length ? `<div class="muted">${esc(fill('bounty.notPosted', { types: listText(notPosted) }))}</div>` : '';
  return `<div class="bh-unlocks-h">${esc(label('bounty.heading'))}</div>`
    + `<div class="bh-unlocks">${chip(1, label('bounty.cull'), true)}${hardLv ? chip(hardLv, label('bounty.hard'), level >= hardLv) : ''}</div>`
    + note;
}

function doorHtml(d) {
  if (!d) return '';
  const arg = d.tab ? `{tab:'${esc(d.tab)}'}` : `{skill:'${esc(d.skill)}'}`;
  return `<button class="btn btn-sm" onclick="window.HearthriseSignposts.go(${arg})">${esc(d.label || '')}</button>`;
}

function go(d) {
  if (!d) return;
  if (d.tab && typeof window.showTab === 'function') window.showTab(d.tab);
  else if (d.skill && typeof window.hrOpenActivity === 'function') window.hrOpenActivity(d.skill);
}

export function setupSignposts() {
  window.HearthriseSignposts = Object.freeze({
    SIGNPOSTS, fill, label, door, stallLine, bagEmptyKey, bountyStripHtml, doorHtml, go,
  });
}
