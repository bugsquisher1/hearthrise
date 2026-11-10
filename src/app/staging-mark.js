// ════════════════════════════════════════════════════════════════════════
// src/app/staging-mark.js — "THIS IS NOT THE LIVE GAME", ON EVERY SCREEN OF A STAGING SITE.
//
// A staging site plays the staging project (src/net/supabase-bootstrap.js): the
// release is rehearsed there before players get it, and nothing a hero does
// there is kept. So nobody takes it for the live game:
//   mountStagingMark   a small plate fixed at the top of every screen, and the
//                      tab's name. On the account screens (sign-in, the
//                      characters) the plate also says nothing here is kept.
//                      It is never pressed and takes no room (app.css
//                      .staging-mark), so the page under it lays out exactly as
//                      production's does: a rehearsal on a different layout
//                      would rehearse nothing.
//   renderNoServer     the whole page of a staging site with no server to play
//                      (not wired yet, or a host that says staging and is not
//                      listed). It never falls back to the live game's server.
// Production's pages never call either (boot.js asks SUPABASE_CONFIG.env).
// ════════════════════════════════════════════════════════════════════════
import { t } from '../render/player-text.js?v=0.2.114';

/**
 * @param {Document} doc
 * @returns {{ destroy(): void }}
 */
export function mountStagingMark(doc) {
  const el = doc.createElement('p');
  el.className = 'staging-mark';
  el.setAttribute('role', 'note');
  const name = doc.createElement('b');
  name.className = 'staging-mark-name';
  name.textContent = t('staging.mark');
  const note = doc.createElement('span');
  note.className = 'staging-mark-note';
  note.textContent = t('staging.not_kept');
  el.appendChild(name);
  el.appendChild(note);
  doc.body.appendChild(el);
  const was = doc.title;
  doc.title = t('staging.tab_title');
  return { destroy() { el.remove(); doc.title = was; } };
}

/** @param {HTMLElement} root  the app's root: one card, no form, nothing sent anywhere. */
export function renderNoServer(root) {
  const doc = root.ownerDocument;
  const loading = doc.querySelector('.boot-shell');
  if (loading) loading.remove();
  root.className = 'app is-auth';
  root.innerHTML = '<main class="auth"><div class="auth-card" data-no-server><h1 class="auth-title"></h1><p class="auth-lead"></p></div></main>';
  root.querySelector('.auth-title').textContent = t('staging.no_server_title');
  root.querySelector('.auth-lead').textContent = t('staging.no_server');
}
