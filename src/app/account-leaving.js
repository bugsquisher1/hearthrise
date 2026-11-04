// ════════════════════════════════════════════════════════════════════════
// src/app/account-leaving.js — THE ONE SCREEN OF AN ACCOUNT SET TO BE DELETED: KEEP IT, OR SIGN OUT.
//
// While a deletion waits (2027-02-25-account-delete.sql) the server refuses this account everything but keeping it
// (403 hr_account_leaving), so a sign-in lands here. The date is the server's. Keep my account is ONE intent, the
// press off until it answers; on the yes the page reloads and signs back in from the stored session, no second
// sign-in. Sign out stays on the card: its press is boot.js's (data-app).
// ════════════════════════════════════════════════════════════════════════
import { AUTH_BRAND } from './sign-in.js?v=0.2.88';
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.88';

const KEEP = Object.freeze({ idle: 'Keep my account', busy: 'Keeping it…' });

/** The server's instant as a date a person reads ("March 4, 2027"), in the player's own time zone. Pure but for that zone. */
function leavingDate(iso) {
  const t = Date.parse(String(iso || ''));
  return Number.isFinite(t) ? new Date(t).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : null;
}

/**
 * @param {HTMLElement} root
 * @param {object} o
 * @param {string|null} o.purgeAt   the server's instant
 * @param {Window} o.win
 * @param {() => Promise<{ok: boolean, message?: string}>} o.keep  one hr_account_keep
 */
export function renderAccountLeaving(root, o) {
  const when = leavingDate(o.purgeAt);
  root.innerHTML = '<main class="auth">' + AUTH_BRAND + '<div class="auth-card" data-account-leaving>'
    + '<h1 class="auth-title">Your account is set to be deleted</h1>'
    + '<p class="auth-lead">' + (when ? 'It will be deleted for good on <b>' + esc(when) + '</b>.' : 'It will be deleted for good soon.')
    + ' Nothing is gone yet, but your heroes aren\'t playing.</p>'
    + '<p class="auth-lead">Changed your mind? Keep your account and everything is as you left it, with your heroes in town.</p>'
    + '<p class="auth-message" role="status" aria-live="polite"></p>'
    + '<button type="button" class="hh-tool is-primary auth-submit" data-leaving="keep">' + KEEP.idle + '</button>'
    + '<p class="auth-links"><button type="button" class="auth-link" data-app="sign-out">Sign out</button></p></div></main>';
  const card = root.querySelector('[data-account-leaving]');
  const btn = card.querySelector('[data-leaving="keep"]');
  btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    btn.disabled = true;
    btn.textContent = KEEP.busy;
    card.querySelector('.auth-message').textContent = '';
    const r = await o.keep();
    if (!card.isConnected) return;   // signed out while it asked
    if (r.ok) { o.win.location.reload(); return; }
    btn.disabled = false;
    btn.textContent = KEEP.idle;
    card.querySelector('.auth-message').textContent = r.message || '';
  });
}
