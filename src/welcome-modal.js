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
    // Find the first `## ` heading and grab everything until the next `## ` heading.
    const re = /^##\s+(.+?)\n([\s\S]*?)(?=\n##\s+|\n*$)/m;
    const m = md.match(re);
    if (!m) return { title: 'What\'s new', body: md };
    return { title: m[1].trim(), body: m[2].trim() };
  }

  // Tiny markdown → HTML for our limited syntax (** bold **, * bullets *, blank lines).
  function mdToHtml(md) {
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
        out.push('<p style="margin:10px 0 4px;font-weight:700;color:#f3d181">' + esc(line.replace(/^\*\*|\*\*$/g, '')) + '</p>');
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
            .replace(/`([^`]+?)`/g, '<code style="background:#0f1320;padding:1px 5px;border-radius:3px;font-size:11px">$1</code>');
  }

  function render({ title, body, version }) {
    if (document.getElementById('hr-welcome-modal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'hr-welcome-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:99998;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div style="background:#1a1f2e;border:2px solid #f3d181;border-radius:10px;padding:22px;max-width:480px;width:100%;color:#dfe9ee;font-family:system-ui,sans-serif;max-height:85vh;overflow:auto">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:8px">
          <div>
            <div style="font-size:11px;color:#9aa3b0;letter-spacing:.5px;text-transform:uppercase">What's new</div>
            <h2 style="margin:2px 0 0;color:#f3d181;font-size:18px">${title}</h2>
          </div>
          <span style="font-size:11px;color:#9aa3b0;background:#0f1320;border:1px solid #2a3142;border-radius:4px;padding:3px 8px">${version}</span>
        </div>
        <div style="font-size:13px;line-height:1.55;color:#dfe9ee">${mdToHtml(body)}</div>
        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">
          <button id="hr-welcome-ok" style="padding:8px 16px;background:#f3d181;color:#0f1320;border:none;border-radius:5px;font-weight:700;cursor:pointer">Got it</button>
        </div>
      </div>
    `;
    function close(){ overlay.remove(); }
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('#hr-welcome-ok').addEventListener('click', close);
    document.body.appendChild(overlay);
  }

  async function maybeShow() {
    // Don't stack on FTUE
    if (document.querySelector('.hr-ftue, .hr-ftue-overlay')) {
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
      render({ title: section.title, body: section.body, version: cur });
      markSeen(cur);
    } catch (e) {
      // No CHANGELOG, no problem — just mark seen so we don't retry every load
      markSeen(cur);
    }
  }

  // Public manual trigger (Settings → "Show what's new")
  window.HearthriseWelcome = { show: maybeShow, force: () => { try { localStorage.removeItem(SEEN_KEY); } catch{} maybeShow(); } };

  // Run on DOM ready, slight delay so FTUE / build-info finish booting first
  function boot() { setTimeout(maybeShow, 1500); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
