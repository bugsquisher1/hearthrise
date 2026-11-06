// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/game-master.js — THE GAME MASTER WINDOW'S DOOR.
//
// Tyler 2026-11-05: admin tools "kind of like a game master character like tibia has specifically for me". The window's row and this
// small door ship to everyone; the window itself (game-master-body.js) and its asks load only once the server's `gm` section says this
// account is the Game Master (2027-03-13-gm-tools.sql), and its icon shows only then (launcher.js). The RPCs are the authority: a page
// that opened this by hand would be told `refused` by every one of them.
// ════════════════════════════════════════════════════════════════════════
import { gmOf } from '../../session/character-sections.js?v=0.2.98';

/* Not a literal import(): play.html's preload block (tests/module-preload.mjs) names every literal one, and everyone's page would fetch this. */
const BODY_URL = new URL('./game-master-body.js?v=0.2.98', import.meta.url).href;
let body = null;
let loading = null;

function load(repaint) {
  if (!loading) loading = import(BODY_URL).then((m) => { body = m; repaint(); });
  return loading;
}

export function renderGameMaster() {
  return '<div class="gm" data-gm-root></div>';
}

renderGameMaster.patch = function patchGameMaster(el, ctx) {
  if (!gmOf(ctx.character)) return;
  if (!body) { load(() => { if (el.isConnected) renderGameMaster.patch(el, ctx); }); return; }
  body.patchBody(el, ctx);
};

renderGameMaster.act = function actGameMaster(ctx, el, action, ev, t) {
  return body && gmOf(ctx.character) ? body.actBody(ctx, el, action, ev, t) : false;
};
