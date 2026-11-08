// ════════════════════════════════════════════════════════════════════════
// src/app/closed-notice.js — THE FIRST SCREEN OF AN ACCOUNT THAT IS NOT ON THE LIST YET.
//
// Hearthrise is invite-only: a signed-in account the server does not admit yet (403 hr_closed) lands here,
// usually someone invited who signed up before being added. The screen gives them their next step:
//   their account id   the session's own uuid (auth.userId), the one thing whoever invited them needs to add
//                      them; nothing else about the account shows. A press copies it, and a clipboard that
//                      refuses leaves it selected and says what to do instead.
//   Check again        admission takes effect at once on the server, so ONE read asks (AccountSession.admission,
//                      the button off until it answers). In: the page reloads and signs back in from the stored
//                      session, no second sign-in. Not yet, or no answer: the line says which.
// Sign out stays on the card: its press is boot.js's (data-app).
// ════════════════════════════════════════════════════════════════════════
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.108';
import { AUTH_BRAND } from './sign-in.js?v=0.2.108';

const CHECK = Object.freeze({ idle: 'Check again', busy: 'Checking…' });
const SAY = Object.freeze({
  closed: 'You\'re not on the list yet. Send your account id to whoever invited you, then check again.',
  unanswered: 'The server didn\'t answer, so that check didn\'t count. Check your connection and try again.',
  copied: 'Copied. Send it to whoever invited you.',
  selected: 'Your browser blocked the copy, so the id is selected for you. Copy it from there.',
});

/** Copy `value`: the clipboard, else the browser's copy of a selection. 'copied', or 'selected' with `el` left selected. */
async function copyText(win, el, value) {
  const select = () => { const s = win.getSelection(), r = win.document.createRange(); r.selectNodeContents(el); s.removeAllRanges(); s.addRange(r); };
  try { await win.navigator.clipboard.writeText(value); select(); return 'copied'; } catch (e) { /* no permission, or no clipboard here: next way */ }
  select();
  try { return win.document.execCommand('copy') ? 'copied' : 'selected'; } catch (e) { return 'selected'; }
}

/**
 * Draw the notice in `root`.
 * @param {HTMLElement} root
 * @param {object} o
 * @param {string} o.id           the account's own id
 * @param {string} o.discord      the Discord invite
 * @param {Window} o.win
 * @param {() => Promise<'in'|'closed'|'unanswered'>} o.admission  one read of the server's answer for this account
 */
/** A banned account's screen: the door's own word, plain, and the way out. It offers no Check again: nothing the player does lifts it. */
export function renderBannedNotice(root, o) {
  root.innerHTML = '<main class="auth">' + AUTH_BRAND + '<div class="auth-card" data-banned-notice>'
    + '<h1 class="auth-title">This account has been banned</h1>'
    + '<p class="auth-lead">The Game Master has banned this account from Hearthrise. If you think this is a mistake, ask on the Discord.</p>'
    + '<p class="auth-links"><a class="auth-link" href="' + esc(o.discord) + '" rel="noopener">Join the Discord</a>'
    + '<button type="button" class="auth-link" data-app="sign-out">Sign out</button></p></div></main>';
}

export function renderClosedNotice(root, o) {
  root.innerHTML = '<main class="auth">' + AUTH_BRAND + '<div class="auth-card" data-closed-notice>'
    + '<h1 class="auth-title">You\'re signed up</h1>'
    + '<p class="auth-lead">Hearthrise is invite-only right now, and your account isn\'t on the list yet.</p>'
    + '<p class="auth-lead">Send this account id to whoever invited you. Once they\'ve added you, press Check again.</p>'
    + '<div class="auth-id"><code class="auth-id-value">' + esc(o.id || '') + '</code>'
    + '<button type="button" class="hh-tool" data-closed="copy">Copy</button></div>'
    + '<p class="auth-message" role="status" aria-live="polite"></p>'
    + '<button type="button" class="hh-tool is-primary auth-submit" data-closed="check">' + CHECK.idle + '</button>'
    + '<p class="auth-links"><a class="auth-link" href="' + esc(o.discord) + '" rel="noopener">Join the Discord</a>'
    + '<button type="button" class="auth-link" data-app="sign-out">Sign out</button></p></div></main>';
  const card = root.querySelector('[data-closed-notice]');
  const line = card.querySelector('.auth-message');
  const check = card.querySelector('[data-closed="check"]');
  const say = (words, good) => { line.classList.toggle('is-good', !!good); line.textContent = words; };

  card.addEventListener('click', async (e) => {
    const t = e.target.closest ? e.target.closest('[data-closed]') : null;
    if (!t) return;
    if (t.getAttribute('data-closed') === 'copy') {
      const how = await copyText(o.win, card.querySelector('.auth-id-value'), o.id);
      if (card.isConnected) say(SAY[how], how === 'copied');
      return;
    }
    if (check.disabled) return;
    check.disabled = true;
    check.textContent = CHECK.busy;
    say('');
    const answer = await o.admission();
    if (!card.isConnected) return;   // signed out while it asked
    if (answer === 'in') { o.win.location.reload(); return; }
    check.disabled = false;
    check.textContent = CHECK.idle;
    say(SAY[answer] || SAY.unanswered);
  });
}
