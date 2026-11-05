// ════════════════════════════════════════════════════════════════════════
// src/app/legal-reader.js — THE PRIVACY POLICY AND THE TERMS, READ ON THE SIGN-IN SCREENS.
//
// The two pages are plain files the repo already carries (legal/*.md, a plain path on the
// built site too: tools/build-site.mjs PLAIN_DIRS), fetched from our own origin when a
// player presses a link and drawn over the screen, so a half-typed sign-up is never lost.
// There is no page of its own and no library: legalHtml() reads the few Markdown shapes
// those files use (headings, paragraphs, bullets, quotes, bold, https and mailto links),
// escapes everything first, and drops <!-- comments --> (the notes to the owner and the
// lawyer that sit beside the claims they check).
//
//   openLegal(box, which, opener)   the reader over `box`; which: 'privacy' | 'terms'
//   legalHtml(md, { dropTitle })    the pure Markdown reader (tested on its own)
// ════════════════════════════════════════════════════════════════════════
import { escapeHtml as esc } from '../utils/dom.js?v=0.2.97';
import { readLegal } from '../session/server.js?v=0.2.97';

export const LEGAL_DOCS = Object.freeze({
  privacy: Object.freeze({ title: 'Privacy Policy', file: 'legal/PRIVACY_POLICY.md' }),
  terms: Object.freeze({ title: 'Terms of Service', file: 'legal/TERMS_OF_SERVICE.md' }),
});

/* Inline marks on text that is already escaped: **bold** and [words](https://… or mailto:…); no other link ever becomes one. */
function inline(text) {
  return esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
}

/**
 * Markdown (the shapes legal/*.md use) as HTML. Every character is escaped before a mark is read, so a page can say
 * only what these rules draw. `dropTitle`: leave out a first "# Title" line (the reader's own title band says it).
 */
export function legalHtml(md, { dropTitle = false } = {}) {
  const lines = String(md == null ? '' : md).replace(/\r/g, '').replace(/<!--[\s\S]*?-->/g, '').split('\n');
  const out = [];
  let para = [];
  let quote = [];
  let list = null;
  let titled = !dropTitle;
  const flush = () => {
    if (para.length) out.push('<p>' + inline(para.join(' ')) + '</p>');
    if (quote.length) out.push('<blockquote><p>' + inline(quote.join(' ')) + '</p></blockquote>');
    if (list) out.push('<ul>' + list.map((t) => '<li>' + inline(t) + '</li>').join('') + '</ul>');
    para = []; quote = []; list = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    let m;
    if (!line) { flush(); continue; }
    if ((m = /^(#{1,3})\s+(.+)$/.exec(line))) {
      flush();
      if (!titled && m[1].length === 1) { titled = true; continue; }
      out.push('<h' + (m[1].length + 1) + '>' + inline(m[2]) + '</h' + (m[1].length + 1) + '>');
    } else if (/^[-*]\s+/.test(line)) {
      if (!list) { flush(); list = []; }
      list.push(line.replace(/^[-*]\s+/, ''));
    } else if (line.startsWith('>')) {
      if (para.length || list) flush();
      quote.push(line.replace(/^>\s?/, ''));
    } else if (/^-{3,}$/.test(line)) {
      flush(); out.push('<hr>');
    } else {
      if (list || quote.length) flush();
      para.push(line);
    }
  }
  flush();
  return out.join('');
}

/**
 * The reader, over `box` (the screen's own element, so a screen change takes it away with it): the page's title and a Close,
 * the text below it, which scrolls. Close, Escape or a press outside the card closes it and gives the focus back to `opener`.
 * @returns {HTMLElement|null} the reader's element
 */
export function openLegal(box, which, opener) {
  const d = Object.prototype.hasOwnProperty.call(LEGAL_DOCS, which) ? LEGAL_DOCS[which] : null;
  const doc = box.ownerDocument;
  if (!d || box.querySelector('.auth-doc')) return null;
  const host = doc.createElement('div');
  host.className = 'auth-doc';
  host.setAttribute('role', 'dialog');
  host.setAttribute('aria-modal', 'true');
  host.setAttribute('aria-labelledby', 'auth-doc-title');
  host.innerHTML = '<div class="auth-card auth-doc-card">'
    + '<div class="auth-title auth-doc-head"><h1 class="auth-doc-name" id="auth-doc-title">' + esc(d.title) + '</h1>'
    + '<button type="button" class="auth-link auth-doc-close" data-auth-doc-close>Close</button></div>'
    + '<div class="auth-doc-body" tabindex="0" data-auth-doc-body><p>Loading…</p></div></div>';
  box.appendChild(host);
  const body = host.querySelector('[data-auth-doc-body]');
  const close = host.querySelector('[data-auth-doc-close]');
  const shut = () => {
    host.remove();
    if (opener && typeof opener.focus === 'function' && opener.isConnected) opener.focus();
  };
  host.addEventListener('click', (e) => { if (e.target === host || e.target.closest('[data-auth-doc-close]')) shut(); });
  host.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); shut(); return; }
    if (e.key === 'Tab') { e.preventDefault(); (doc.activeElement === close ? body : close).focus(); }   // the reader holds the focus: two stops
  });
  close.focus();
  const win = doc.defaultView;
  readLegal(d.file, win.location.href).then((text) => {
    if (!host.isConnected) return;
    body.innerHTML = text === null ? '<p>This page could not be loaded. Check your connection and try again.</p>' : legalHtml(text, { dropTitle: true });
  });
  return host;
}
