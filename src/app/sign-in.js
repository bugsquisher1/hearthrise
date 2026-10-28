// ════════════════════════════════════════════════════════════════════════
// src/app/sign-in.js — THE SIGN-IN SCREENS.
//
// renderAuthScreen(box, auth, mode) draws one of:
//   'sign-in'       email + password; links to the other two
//   'create'        email + password + confirm
//   'forgot'        email; sends the reset link
//   'set-password'  new password + confirm (the reset link landed here)
// and wires its form to src/net/auth.js. Every message shown is the auth
// module's plain-English answer. The screens hold no state of their own beyond
// the form fields; `onSignedIn` is called once the account is signed in.
// ════════════════════════════════════════════════════════════════════════

import { escapeHtml as esc } from '../utils/dom.js?v=0.2.62';
import { AUTH_COPY } from '../net/auth.js?v=0.2.62';
import { PASSWORD_MIN_LENGTH } from '../data/account-rules.js?v=0.2.62';

const FIELD = {
  email: '<label class="auth-field"><span>Email</span><input name="email" type="email" autocomplete="email" required></label>',
  password: '<label class="auth-field"><span>Password</span><input name="password" type="password" autocomplete="current-password" required></label>',
  /* The auth server's rule, said before the press (src/data/account-rules.js); the server still decides. */
  newPassword: '<label class="auth-field"><span>Password</span><input name="password" type="password" autocomplete="new-password" minlength="' + PASSWORD_MIN_LENGTH + '" aria-describedby="auth-password-rule" required></label>'
    + '<p class="auth-lead" id="auth-password-rule">' + esc(AUTH_COPY.passwordRule) + '</p>',
  confirm: '<label class="auth-field"><span>Type it again</span><input name="confirm" type="password" autocomplete="new-password" minlength="' + PASSWORD_MIN_LENGTH + '" required></label>',
};

/** The crest and the name over every account screen (painted art at its own 1:1 or exactly 1:2, never between). */
export const AUTH_BRAND = '<header class="auth-brand"><img class="auth-crest" src="assets/brand/hearthrise-crest.png?v=0.2.62" alt="" width="311" height="384">'
  + '<p class="auth-name">Hearthrise</p></header>';

const SCREENS = Object.freeze({
  'sign-in': { title: 'Sign in', fields: ['email', 'password'], submit: 'Sign in',
    links: [['create', 'Create an account'], ['forgot', 'Forgot your password?']] },
  create: { title: 'Create an account', fields: ['email', 'newPassword', 'confirm'], submit: 'Create account',
    lead: 'If you already have an account, sign in instead.', links: [['sign-in', 'Back to sign in']] },
  forgot: { title: 'Reset your password', fields: ['email'], submit: 'Send the reset link',
    lead: 'We will email you a link to choose a new password.', links: [['sign-in', 'Back to sign in']] },
  'set-password': { title: 'Choose a new password', fields: ['newPassword', 'confirm'], submit: 'Save the new password', links: [] },
});


/**
 * @param {HTMLElement} box
 * @param {object} auth          createAuth(...)
 * @param {string} mode          'sign-in' | 'create' | 'forgot' | 'set-password'
 * @param {object} on            { signedIn(): void }
 */
export function renderAuthScreen(box, auth, mode, on) {
  const s = SCREENS[mode] || SCREENS['sign-in'];
  box.innerHTML = AUTH_BRAND + '<form class="auth-card" data-auth="' + esc(mode) + '" novalidate>'
    + '<h1 class="auth-title">' + esc(s.title) + '</h1>'
    + (s.lead ? '<p class="auth-lead">' + esc(s.lead) + '</p>' : '')
    + s.fields.map((f) => FIELD[f]).join('')
    + '<p class="auth-message" role="status" aria-live="polite"></p>'
    + '<button type="submit" class="hh-tool is-primary auth-submit">' + esc(s.submit) + '</button>'
    + (s.links.length ? '<p class="auth-links">' + s.links.map(([to, label]) => '<button type="button" class="auth-link" data-auth-go="' + esc(to) + '">' + esc(label) + '</button>').join('') + '</p>' : '')
    + '</form>';
  const form = box.querySelector('form');
  const msg = form.querySelector('.auth-message');
  const say = (text, good) => { msg.textContent = text || ''; msg.classList.toggle('is-good', !!good); };
  const val = (n) => { const el = form.elements.namedItem(n); return el ? el.value : ''; };

  form.addEventListener('click', (e) => {
    const go = e.target.closest('[data-auth-go]');
    if (go) renderAuthScreen(box, auth, go.getAttribute('data-auth-go'), on);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('.auth-submit');
    btn.disabled = true;
    say('');
    let r;
    if (mode === 'create') r = await auth.signUp(val('email'), val('password'), val('confirm'));
    else if (mode === 'forgot') r = await auth.requestReset(val('email'));
    else if (mode === 'set-password') r = await auth.setNewPassword(val('password'), val('confirm'));
    else r = await auth.signIn(val('email'), val('password'));
    btn.disabled = false;
    say(r.message, r.ok);
    if (r.ok && (mode === 'sign-in' || mode === 'set-password')) on.signedIn();
  });
  const first = form.querySelector('input');
  if (first) first.focus();
}
