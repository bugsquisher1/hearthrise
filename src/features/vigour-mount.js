// ════════════════════════════════════════════════════════════════════════
// src/features/vigour-mount.js — WHERE A HUNTING PLAYER SEES THEIR VIGOUR
//
// src/render/hunt-panel.js has built the Vigour bar and its refill button
// since M6, and until this file nothing in the app ever MOUNTED them: on live
// (2026-09-25, 23:36 UTC) the QA hero was dry — `remaining_min 0`, hunts paying
// ×0.25 — with refills for sale and no surface on which a player could see
// either fact. This module is the mount and nothing else.
//
//   THE FIGHT      the whole block (meter, dry line, Refill) at the head of the
//                  management rail, above Loadout — the screen a hunter is on.
//   ACTIVITY BAR   a compact chip beside the fight's own readout: "Vigour 626
//                  min" or, dry, "Out of Vigour · pays ×0.25". The bar is on
//                  screen for every second of every fight, on every tab, and
//                  it is already a shortcut to the Fight screen.
//
// ── NOTHING HERE READS A NUMBER ─────────────────────────────────────────────
// Both surfaces are painted by hunt-panel.js from `G._vigour` (written only by
// accrue.js hydrateHunt out of an envelope or a refill receipt) through ONE
// switch (`vigourOn`), so they cannot disagree about whether there is a meter,
// and a meter the server does not price draws nothing at all (C-1 / cond. 5).
// The repaint is a diffed poll rather than a hook into the settle: the settle,
// the refill receipt and a reload all write the same field, and a poll cannot
// miss a writer added later.
// ════════════════════════════════════════════════════════════════════════

const G = () => window.G;

function ensureFightHost() {
  let host = document.getElementById('fs-vigour');
  if (host) return host;
  const rail = document.getElementById('fs-manage');
  if (!rail) return null;
  const block = document.createElement('section');
  block.className = 'fsm-block fsm-vigour';
  block.id = 'fsm-vigour';
  block.hidden = true;
  block.innerHTML = '<div class="fsm-head"><span>Vigour</span></div><div class="fs-vigour" id="fs-vigour"></div>';
  rail.insertBefore(block, rail.firstChild);
  return document.getElementById('fs-vigour');
}

function ensureChipHost() {
  let host = document.getElementById('ab-vigour-host');
  if (host) return host;
  const bar = document.getElementById('activity-bar');
  if (!bar) return null;
  host = document.createElement('div');
  host.id = 'ab-vigour-host';
  host.className = 'ab-vigour-host';
  /* A SIBLING of #ab-meta, never a child: legacy's refreshActivityBar rewrites
     the meta's innerHTML on every repaint and would erase the chip with it.
     BEFORE the meta, so on a narrow bar the meta clips and the chip never does. */
  const meta = document.getElementById('ab-meta');
  if (meta && meta.parentNode === bar) bar.insertBefore(host, meta);
  else bar.appendChild(host);
  return host;
}

/** One paint of both surfaces from the current projection. Exposed so the
    suite asserts what a player sees without waiting on the interval. */
export function paintVigour() {
  const g = G();
  const block = ensureFightHost();
  if (block && typeof window.renderVigourBlock === 'function') {
    const on = window.renderVigourBlock(block, () => paintVigour());
    const frame = block.parentNode;
    if (frame && frame.hidden === on) frame.hidden = !on;
  }
  const chip = ensureChipHost();
  if (chip && typeof window.vigourChipHtml === 'function') {
    /* Only while FIGHTING: Vigour is the hunting limiter, and a chip on a
       woodcutting bar would be a number about something the player is not doing. */
    const html = (g && g.activeMonster)
      ? window.vigourChipHtml(g._vigour || null, g._vigourRefill || null) : '';
    if (chip.__vigourSig !== html) { chip.__vigourSig = html; chip.innerHTML = html; }
    if (chip.hidden === !!html) chip.hidden = !html;
  }
}

export function setupVigourMount() {
  window.HearthriseVigourMount = { paint: paintVigour };
  paintVigour();
  setInterval(paintVigour, 500);
}
