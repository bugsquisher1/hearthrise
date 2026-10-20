// bug-report-bridge — the two bounds a hostile reporter can push on.
//
// Plain JS (no types) so a Node test drives the SHIPPED bytes exactly as
// tests/edge-tick-gate.mjs drives hr-accrue/tick.js; index.ts imports it.
//
// 1. THE METERED READ. `req.arrayBuffer()` buffers the whole body before any
//    size check, and a chunked request carries no Content-Length, so the old
//    declared-length test was skipped and memory per isolate was unbounded.
//    readBodyBytes counts bytes as they arrive and cancels the stream the
//    moment the cap is passed. Same pattern as readTickBytes (hr-accrue).
//
// 2. THE STAFF EMBED. Every player-supplied string reaches a private Discord
//    channel. Markdown is escaped, so a masked link `[text](url)` cannot show
//    staff one address and open another, and every field is capped so one
//    over-long value cannot push the embed past Discord's limits (title 256,
//    description 4096, field value 1024, embed total 6000) and fail the relay.

export const MAX_BODY_BYTES = 3_000_000;

export const DISCORD_TITLE_MAX = 256;
export const DISCORD_FIELD_MAX = 1024;
export const DISCORD_EMBED_TOTAL_MAX = 6000;

const TITLE_CHARS = 250;
const DESC_CHARS = 1800;
const CELL_CHARS = 100;     // device, orientation, tab — short real values
const SCREEN_CELL_CHARS = 48;
const PLAYER_CHARS = 64;
const BLOCK_CHARS = 900;    // the fenced State / Recent errors blocks

/* -> { ok: true, bytes } | { ok: false, reason: 'too_large' | 'unreadable' } */
export async function readBodyBytes(req, limit = MAX_BODY_BYTES) {
  const declared = Number(req.headers && req.headers.get
    ? req.headers.get('content-length') : NaN);
  if (Number.isFinite(declared) && declared > limit) return { ok: false, reason: 'too_large' };
  if (!req.body) return { ok: true, bytes: new Uint8Array(0) };
  if (typeof req.body.getReader !== 'function') return { ok: false, reason: 'unreadable' };
  const reader = req.body.getReader();
  const chunks = [];
  let n = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      n += value.byteLength;
      if (n > limit) {
        try { await reader.cancel(); } catch { /* already torn down */ }
        return { ok: false, reason: 'too_large' };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  const bytes = new Uint8Array(n);
  let at = 0;
  for (const c of chunks) { bytes.set(c, at); at += c.byteLength; }
  return { ok: true, bytes };
}

/* Escape Discord markdown, then cap. Escaping `[` `]` `(` `)` is what kills a
   masked link; the rest stops headings, quotes, spoilers and code spans from
   reshaping the card. A cut that leaves a lone trailing backslash drops it. */
export function md(v, max) {
  const s = String(v ?? '')
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '')
    .replace(/[\\`*_~|>#<\[\]()-]/g, '\\$&')
    .slice(0, max);
  return /(^|[^\\])(\\\\)*\\$/.test(s) ? s.slice(0, -1) : s;
}

/* Inside a ``` block markdown does not render, so only the fence itself is
   neutralised; the cap keeps the field under 1024 with its wrapper. */
export function fence(v, max) {
  return String(v ?? '').replace(/```/g, "'''").slice(0, max);
}

function cell(v, max = CELL_CHARS) {
  return v === undefined || v === null || v === '' ? '—' : md(v, max);
}

function fieldValue(s) {
  return s.length > DISCORD_FIELD_MAX ? s.slice(0, DISCORD_FIELD_MAX) : s;
}

export function buildEmbed(reporter, summary, description, build, state, errors, reportId, hasShot) {
  const st = state && typeof state === 'object' ? state : {};
  const metrics = (st.metrics && typeof st.metrics === 'object') ? st.metrics : {};
  const safe = (metrics.safeArea && typeof metrics.safeArea === 'object') ? metrics.safeArea : {};
  const sc = (v, dflt) => (v === undefined || v === null || v === '' ? dflt : md(v, SCREEN_CELL_CHARS));
  const embed = {
    title: ('🐛 ' + md(summary, TITLE_CHARS)).slice(0, DISCORD_TITLE_MAX),
    description: md(description || '(no description)', DESC_CHARS),
    color: 0xd44a3a,
    fields: [
      { name: 'Build', value: fieldValue(cell(build || 'unknown', 64)), inline: true },
      { name: 'Device', value: fieldValue(cell(st.device) + ' · ' + cell(st.orientation)), inline: true },
      { name: 'Player', value: fieldValue(cell(reporter, PLAYER_CHARS)), inline: true },
      { name: 'Tab', value: fieldValue(cell(st.activeTab)), inline: true },
      { name: 'Report #', value: fieldValue(cell(reportId, 32)), inline: true },
      {
        name: 'Screen',
        value: fieldValue(
          `vp ${sc(st.viewport, '—')} · screen ${sc(metrics.screen, '—')} · dpr ${sc(metrics.dpr, '—')}`
          + ` · zoom ${sc(metrics.zoom, '—')} · root ${sc(metrics.rootFont, '—')}`
          + ` · safe(t/r/b/l) ${sc(safe.t, '0px')}/${sc(safe.r, '0px')}/${sc(safe.b, '0px')}/${sc(safe.l, '0px')}`
          + (metrics.desktopMode ? ' · ⚠️ DESKTOP-MODE' : ''),
        ),
        inline: false,
      },
      { name: 'State', value: '```json\n' + fence(JSON.stringify(st, null, 2), BLOCK_CHARS) + '\n```' },
      {
        name: 'Recent errors',
        value: Array.isArray(errors) && errors.length
          ? '```\n' + fence(errors.map((e) => `[${e.level}] ${e.msg}`).join('\n'), BLOCK_CHARS) + '\n```'
          : '_(none)_',
      },
    ],
    timestamp: new Date().toISOString(),
  };
  if (hasShot) embed.image = { url: 'attachment://screenshot.jpg' };
  return embed;
}
