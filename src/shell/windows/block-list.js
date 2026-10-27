// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/block-list.js — THE PLAYERS YOU BLOCKED, WITH UNBLOCK.
//
// One panel in the Friends window; Settings reaches it through the
// `social.blocked` row of src/data/social-settings.js (its label and help are
// read from there, so the words are written once). The list is the
// account's blocks as hr_social_state answered them (src/social/blocks.js);
// Unblock is ONE hr_block_set, off until the server answered; its refusal
// reads on the host window's line (the host awaits actBlocks). A row's name
// is patched on every paint, so a rename shows at the next read. The server
// enforces the block itself: their lines and whispers never reach you, and
// their whispers, friend asks and inspects are refused.
// ════════════════════════════════════════════════════════════════════════
import { SOCIAL_SETTINGS } from '../../data/social-settings.js?v=0.2.54';
import { rows, text, cls, prop, element } from '../../render/paint.js?v=0.2.54';
import { escapeHtml as esc } from '../../utils/dom.js?v=0.2.54';

const ROW = SOCIAL_SETTINGS.find((r) => r.id === 'social.blocked');
const PENDING = new WeakSet();   // the hosts with an Unblock in flight

export function blocksHtml() {
  return '<h3 class="hs-sub">' + esc(ROW.label) + '</h3><p class="hs-note">' + esc(ROW.help) + '</p>'
    + '<ul class="hs-blocks"></ul><p class="hh-empty hs-blocks-none">You have not blocked anyone.</p>';
}

export function patchBlocks(body, ctx) {
  const social = ctx.account && ctx.account.social;
  const list = social ? social.blocks.list() : [];
  rows(body.querySelector('.hs-blocks'), list, {
    key: (p) => p.id,
    build: (p) => element(ctx.doc, '<li class="hs-block"><b></b> <button type="button" class="hh-tool" data-hs-act="unblock" data-id="' + esc(p.id) + '">Unblock</button></li>'),
    patch: (el, p) => { text(el.querySelector('b'), p.name); prop(el.querySelector('button'), 'disabled', PENDING.has(body)); },
  });
  cls(body.querySelector('.hs-blocks-none'), 'is-on', !list.length);
  text(body.querySelector('.hs-blocks-none'), social ? 'You have not blocked anyone.' : 'Blocks are not connected.');
}

/** Unblock the pressed row's player: ONE hr_block_set. Answers the store's { ok } | { ok: false, error } for the host's line. */
export async function actBlocks(ctx, body, t) {
  const social = ctx.account && ctx.account.social;
  if (!social) return { ok: false, error: 'unavailable' };
  if (PENDING.has(body)) return { ok: true };
  PENDING.add(body);
  patchBlocks(body, ctx);
  try { return await social.blocks.set(t.getAttribute('data-id'), false); } finally { PENDING.delete(body); patchBlocks(body, ctx); }
}
