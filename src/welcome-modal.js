// ============================================================
// src/welcome-modal.js
//
// Shows a "what's new" modal once per build version. Reads
// CHANGELOG.md, parses out the latest section, displays it.
//
// Trigger:
//   • Player opens the game
//   • localStorage shows they last saw a version != current build
//
// Skipped:
//   • First-ever load (FTUE handles welcome)
//   • Same build seen already
//   • If FTUE is currently running (don't stack modals)
// ============================================================

(function(){
  'use strict';
  const SEEN_KEY = 'hearthrise:changelog:lastSeen';
  const CHANGELOG_URL = 'CHANGELOG.md';

  function currentBuildKey() {
    const b = window.HearthriseBuild;
    if (!b) return 'unknown';
    return `${b.version}-${b.cache}`;
  }

  function lastSeen() {
    try { return localStorage.getItem(SEEN_KEY); } catch { return null; }
  }
  function markSeen(key) {
    try { localStorage.setItem(SEEN_KEY, key); } catch {}
  }

  function parseFirstSection(md) {
    // Normalize line endings first — a CRLF checkout/serve made the regex miss
    // every heading and dump the ENTIRE file (maintenance preamble included)
    // into the modal.
    md = md.replace(/\r\n?/g, '\n');
    // Line-based scan: the old regex used a `(?=\n##\s+|\n*$)` lookahead whose
    // multiline `$` matched at the first blank line, so the captured body was
    // always EMPTY. Plain loop, no cleverness.
    const lines = md.split('\n');
    let title = null; const body = [];
    for (const line of lines) {
      if (/^##\s+/.test(line)) {
        if (title !== null) break;            // next section — stop
        title = line.replace(/^##\s+/, '').trim();
        continue;
      }
      if (title !== null) body.push(line);
    }
    // Never fall back to the raw file — it starts with the format documentation,
    // which is not player content.
    if (title === null) return null;
    return { title, body: body.join('\n').trim() };
  }

  // Tiny markdown → HTML for our limited syntax (** bold **, * bullets *, blank lines).
  function mdToHtml(md) {
    // CHANGELOG entries may use emoji as list markers for human readers; the
    // in-game modal must render none (0-emoji rule), so strip pictographs here.
    // NB: Extended_Pictographic includes ASCII `*`/`#`/digits (keycap bases) —
    // keep anything below U+2000 or the markdown itself gets eaten.
    md = md.replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, c => c.codePointAt(0) < 0x2000 ? c : '').replace(/^([-*]\s+)\s+/gm, '$1');
    const esc = (s) => s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'})[c]);
    const lines = md.split('\n');
    const out = [];
    let inList = false;
    function closeList(){ if (inList) { out.push('</ul>'); inList = false; } }
    for (const raw of lines) {
      const line = raw.trimEnd();
      if (!line) { closeList(); continue; }
      if (/^[-*]\s+/.test(line)) {
        if (!inList) { out.push('<ul style="margin:8px 0 8px 20px;padding:0">'); inList = true; }
        out.push('<li style="margin:4px 0">' + inlineFmt(esc(line.replace(/^[-*]\s+/, ''))) + '</li>');
      } else if (/^\*\*(.+)\*\*$/.test(line)) {
        closeList();
        out.push('<p style="margin:10px 0 4px;font-weight:700;color:var(--gold,#f3d181)">' + esc(line.replace(/^\*\*|\*\*$/g, '')) + '</p>');
      } else {
        closeList();
        out.push('<p style="margin:6px 0">' + inlineFmt(esc(line)) + '</p>');
      }
    }
    closeList();
    return out.join('\n');
  }
  function inlineFmt(s) {
    return s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/`([^`]+?)`/g, '<code style="background:var(--bg-0,#0f1320);padding:1px 5px;border-radius:3px;font-size:calc(14.5px * var(--ui-scale, 1))">$1</code>');
  }

  function render({ title, body, version }) {
    if (document.getElementById('hr-welcome-modal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'hr-welcome-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99998;display:flex;align-items:center;justify-content:center;padding:20px';
    // Colors come from theme tokens (with dark fallbacks) so the modal matches
    // the active theme — cream on cozy-light, dark on hearthlight — instead of
    // being a hardcoded dark box (per the "no hardcoded colors" rule).
    overlay.innerHTML = `
      <div style="background:var(--bg-1,#1a1f2e);border:2px solid var(--gold,#f3d181);border-radius:10px;padding:22px;max-width:480px;width:100%;color:var(--ink,#dfe9ee);font-family:var(--f-ui,system-ui,sans-serif);max-height:85vh;overflow:auto">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px">
          <div>
            <div style="font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3,#9aa3b0);letter-spacing:.5px;text-transform:uppercase">What's new</div>
            <h2 style="margin:2px 0 0;color:var(--gold,#f3d181);font-size:calc(19px * var(--ui-scale, 1));font-family:var(--f-display,inherit)">${title}</h2>
          </div>
          <span style="font-size:calc(14.5px * var(--ui-scale, 1));color:var(--ink-3,#9aa3b0);background:var(--bg-0,#0f1320);border:1px solid var(--bg-3,#2a3142);border-radius:4px;padding:3px 8px">${version}</span>
        </div>
        <div style="font-size:calc(14.5px * var(--ui-scale, 1));line-height:1.55;color:var(--ink,#dfe9ee)">${mdToHtml(body)}</div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
          <button id="hr-welcome-ok" style="padding:8px 16px;background:var(--gold,#f3d181);color:var(--bg-0,#0f1320);border:none;border-radius:5px;font-weight:700;cursor:pointer">Got it</button>
        </div>
      </div>
    `;
    function close(){ overlay.remove(); }
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#hr-welcome-ok').addEventListener('click', close);
    document.body.appendChild(overlay);
  }

  // The front-door overlays this modal must never land on top of. FTUE renders
  // `.ftue-root > .ftue-card.show` (src/ftue.js) — NOT `.hr-ftue`, which is the
  // selector this file guarded on until b223 and which has matched nothing
  // since b141. post-signup-welcome.js:88 and identity.js:1043 were corrected
  // to the real selector in b221; this file was the last straggler, so a
  // returning player who had not finished the tutorial met the What's-New
  // sheet (z 99998) underneath the tour card (z 99999) — two modals at once,
  // and the tour's spotlight blocked by a full-screen scrim it cannot see.
  // `.hr-id-scrim` is the b221 name modal: naming comes before news.
  var BLOCKING_OVERLAYS = '.ftue-root .ftue-card.show, .hr-id-scrim, .hr-dl-scrim';
  function anotherModalUp() {
    return !!document.querySelector(BLOCKING_OVERLAYS);
  }

  async function maybeShow() {
    // Don't stack on FTUE / the name modal / the daily-reward sheet.
    if (anotherModalUp()) {
      setTimeout(maybeShow, 2000);
      return;
    }
    const cur = currentBuildKey();
    const prev = lastSeen();
    if (prev === cur) return;          // already saw this build
    if (!prev) { markSeen(cur); return; } // first-ever load — skip, FTUE has them

    try {
      const res = await fetch(CHANGELOG_URL + '?t=' + Date.now());
      if (!res.ok) { markSeen(cur); return; }
      const md = await res.text();
      const section = parseFirstSection(md);
      if (!section) { markSeen(cur); return; } // malformed changelog — never show raw file
      render({ title: section.title, body: section.body, version: cur });
      markSeen(cur);
    } catch (e) {
      // No CHANGELOG, no problem — just mark seen so we don't retry every load
      markSeen(cur);
    }
  }

  // Public manual trigger (Settings → "Show what's new")
  // force(): removing the key made maybeShow() take the "first-ever load" skip
  // branch — Settings → "Show what's new" never showed anything. Set a stale
  // sentinel instead so the "already saw this build" check misses.
  window.HearthriseWelcome = { show: maybeShow, force: () => { try { localStorage.setItem(SEEN_KEY, '__force__'); } catch{} maybeShow(); } };
  // Test seam (smoke suite asserts CRLF parsing + emoji stripping, and that
  // the front-door guard matches the overlays that actually exist)
  window.__hrWelcomeParse = { parseFirstSection, mdToHtml, anotherModalUp, BLOCKING_OVERLAYS };

  // Run on DOM ready, slight delay so FTUE / build-info finish booting first.
  // b224: and behind the account wall — the What's-New sheet is news for a
  // player who is IN, not a thing to stack on the front door.
  function boot() { setTimeout(maybeShow, 1500); }
  function arm() {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }
  if (window.HearthriseGate && typeof window.HearthriseGate.whenOpen === 'function') window.HearthriseGate.whenOpen(arm);
  else arm();
})();
