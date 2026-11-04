// ════════════════════════════════════════════════════════════════════════
// src/shell/windows/account-delete.js — DELETE ACCOUNT: WHAT GOES, WHEN, THE TYPED WORD AND THE PASSWORD.
//
// One component (CLAUDE.md §1): a centered window on desktop and a sheet on a phone (the `account-delete` row,
// opened from Settings, Account), and the same form on the card boot.js draws for an account with no hero to open
// Settings from (the characters screen, the closed notice). It holds no state beyond its fields.
//
// WHY THE PASSWORD: a session left open on a shared computer must not be able to destroy the account. The server
// doesn't take this form's word for it; it reads the signed token the password check just refreshed
// (src/session/account-leaving.js, hr_account_delete_request's stale_signin).
//
// The press stays off until both fields are filled, and off again while the server answers. A retry of the same
// press keeps its key; new words make a new one. On the server's yes the AccountSession moves every screen to the
// way back (src/app/account-leaving.js), so this form has nothing more to say.
// ════════════════════════════════════════════════════════════════════════
import { ACCOUNT_GRACE_DAYS } from '../../data/account-rules.js?v=0.2.87';
import { DELETE_WORD, requestDeletion, wordTyped } from '../../session/account-leaving.js?v=0.2.87';
import { newIdem } from '../../session/catch-up.js?v=0.2.87';

const WORDS = Object.freeze({
  what: 'This deletes your whole account, not just one hero: every hero with their levels, gear and items, your Storage, house and farm, all your gold, your hero names, your friends list and your chat messages.',
  now: 'Your account stops playing as soon as you confirm. Running hunts end, your heroes leave their parties, and anything you have on the market goes back to your Storage.',
  grace: 'You have ' + ACCOUNT_GRACE_DAYS + ' days to change your mind: sign in and press Keep my account. After that it is gone for good and nobody can bring it back.',
});

function formHtml(titled) {
  return (titled ? '<h1 class="auth-title">Delete account</h1>' : '')
    + '<p class="auth-lead">' + WORDS.what + '</p><p class="auth-lead">' + WORDS.now + '</p><p class="auth-lead ad-grace">' + WORDS.grace + '</p>'
    + '<label class="auth-field"><span>Type ' + DELETE_WORD + ' to confirm</span><input name="ad-word" type="text" autocomplete="off" autocapitalize="characters" spellcheck="false"></label>'
    + '<label class="auth-field"><span>Your password</span><input name="ad-password" type="password" autocomplete="current-password"></label>'
    + '<p class="auth-message" role="status" aria-live="polite"></p>'
    + '<div class="ad-foot"><button type="button" class="hh-tool" data-ad="back">Keep playing</button>'
    + '<button type="button" class="hh-tool is-primary" data-ad="delete" disabled>Delete my account</button></div>';
}

/**
 * Draw and wire the form in `host`.
 * @param {HTMLElement} host
 * @param {object} o
 * @param {object} o.account   the AccountSession
 * @param {() => void} o.back  the player changed their mind
 * @param {boolean} [o.titled] this card has no window frame to name it
 */
export function mountDeleteForm(host, o) {
  host.classList.add('ad');
  host.innerHTML = formHtml(!!o.titled);
  const word = host.querySelector('[name="ad-word"]');
  const pass = host.querySelector('[name="ad-password"]');
  const go = host.querySelector('[data-ad="delete"]');
  const line = host.querySelector('.auth-message');
  let asking = false, key = null;
  const paint = () => { go.disabled = asking || !wordTyped(word.value) || !pass.value; };
  host.addEventListener('input', () => { key = null; line.textContent = ''; paint(); });
  host.addEventListener('click', async (e) => {
    const t = e.target.closest ? e.target.closest('[data-ad]') : null;
    if (!t || t.disabled) return;
    if (t.getAttribute('data-ad') === 'back') { pass.value = ''; o.back(); return; }
    if (asking) return;
    asking = true;
    key = key || newIdem();
    line.textContent = '';
    go.textContent = 'Deleting…';
    paint();
    const r = await requestDeletion(o.account, pass.value, word.value, key);
    asking = false;
    if (!host.isConnected || r.ok) return;
    pass.value = '';
    go.textContent = 'Delete my account';
    line.textContent = r.message;
    paint();
  });
}

/** The window: built once; its body is rebuilt each time it opens, so a closed window keeps no password. */
export function renderAccountDelete() { return '<div class="ad-host"></div>'; }

renderAccountDelete.patch = function patchAccountDelete(body, ctx) {
  const host = body.querySelector('.ad-host');
  if (!host || host.hasChildNodes() || !ctx.account) return;
  mountDeleteForm(host, { account: ctx.account, back: () => ctx.wm.close('account-delete') });
};
