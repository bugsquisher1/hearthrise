// Hearthrise — Edge Function `bug-report-bridge`
//
// The Discord webhook lives ONLY here, as the Edge Function secret
// DISCORD_WEBHOOK_URL. It is never in source, never in the client bundle,
// never in a response body, never in a log line.
//
// CONTRACT
//   POST /functions/v1/bug-report-bridge   (verify_jwt = true)
//   Body (JSON, <= 3 MB): { summary, description, build, state, errors[],
//                           screenshot?, idem_key }
//   Any identity field in the body is IGNORED. The reporter is auth.uid() and
//   the name printed in Discord is read from public.profiles server-side.
//
//   200 {ok:true,  status:'accepted'|'duplicate'|'stored', report_id, relayed}
//   400 {ok:false, status:'bad_request'}
//   401 {ok:false, status:'unauthenticated'}
//   405 {ok:false, status:'method_not_allowed'}
//   413 {ok:false, status:'payload_too_large'}
//   429 {ok:false, status:'rate_limited', retry_after_s}
//   503 {ok:false, status:'not_provisioned'}   RPC missing (migration unrun)
//   502 {ok:false, status:'store_failed'}
//
// EDGE FUNCTIONS NEVER WRITE TABLES. This computes a proposal;
// public.bug_report_submit (SECURITY DEFINER) takes a per-user advisory lock,
// re-validates every bound, enforces the hour/day cap and the idempotency key,
// and is the only writer. Discord is forwarded to ONLY on relay:true, so the
// rate limit is durable across isolate recycles and scale-out.
//
// SCREENSHOTS: accepted, bounded, NOT stored. Only desktop sends one (b316 made
// mobile text-only). Validated as a data: URL of jpeg/png that decodes to
// <= 1.5 MB with real magic bytes, forwarded as a Discord multipart attachment.

const MAX_BODY_BYTES = 3_000_000;
const MAX_IMAGE_BYTES = 1_500_000;
const MAX_SUMMARY = 200;
const MAX_DESC = 4000;
const MAX_BUILD = 64;
const MAX_ERRORS = 20;
const MAX_ERROR_MSG = 500;
const MAX_STATE_CHARS = 8000;
const DISCORD_TIMEOUT_MS = 8000;

const ALLOWED_ORIGINS = [
  'https://hearthrise.net',
  'https://www.hearthrise.net',
  'https://bugsquisher1.github.io',
];

function corsHeaders(origin: string | null): Record<string, string> {
  const ok = origin && (ALLOWED_ORIGINS.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin));
  return {
    'Access-Control-Allow-Origin': ok ? (origin as string) : ALLOWED_ORIGINS[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '3600',
    'Vary': 'Origin',
  };
}

function json(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function clamp(v: unknown, max: number): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

async function withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
  let t: number | undefined;
  const timer = new Promise<T>((res) => { t = setTimeout(() => res(fallback), ms); });
  try { return await Promise.race([p, timer]); }
  finally { if (t !== undefined) clearTimeout(t); }
}

function decodeScreenshot(dataUrl: unknown): { bytes: Uint8Array; mime: string } | null {
  if (typeof dataUrl !== 'string') return null;
  const m = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png));base64,([A-Za-z0-9+/=\s]+)$/);
  if (!m) return null;
  const b64 = m[2].replace(/\s+/g, '');
  if ((b64.length * 3) / 4 > MAX_IMAGE_BYTES) return null;
  let bin: string;
  try { bin = atob(b64); } catch { return null; }
  if (bin.length > MAX_IMAGE_BYTES) return null;
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (!jpeg && !png) return null;
  return { bytes, mime: jpeg ? 'image/jpeg' : 'image/png' };
}

function fence(s: string, limit: number): string {
  return s.replace(/```/g, "'''").slice(0, limit);
}

function buildEmbed(
  reporter: string, summary: string, description: string, build: string,
  state: Record<string, unknown>, errors: Array<{ level?: string; msg?: string }>,
  reportId: unknown, hasShot: boolean,
) {
  const metrics = (state.metrics || {}) as Record<string, unknown>;
  const safe = (metrics.safeArea || {}) as Record<string, string>;
  const embed: Record<string, unknown> = {
    title: '🐛 ' + fence(summary, 240),
    description: fence(description || '(no description)', 1800),
    color: 0xd44a3a,
    fields: [
      { name: 'Build', value: '`' + (build || 'unknown') + '`', inline: true },
      { name: 'Device', value: String(state.device || '—') + ' · ' + String(state.orientation || '—'), inline: true },
      { name: 'Player', value: fence(reporter, 64), inline: true },
      { name: 'Tab', value: String(state.activeTab || '—'), inline: true },
      { name: 'Report #', value: String(reportId ?? '—'), inline: true },
      {
        name: 'Screen',
        value: `vp ${state.viewport || '—'} · screen ${metrics.screen || '—'} · dpr ${metrics.dpr ?? '—'}`
          + ` · zoom ${metrics.zoom ?? '—'} · root ${metrics.rootFont || '—'}`
          + ` · safe(t/r/b/l) ${safe.t || '0px'}/${safe.r || '0px'}/${safe.b || '0px'}/${safe.l || '0px'}`
          + (metrics.desktopMode ? ' · ⚠️ DESKTOP-MODE' : ''),
        inline: false,
      },
      { name: 'State', value: '```json\n' + fence(JSON.stringify(state, null, 2), 900) + '\n```' },
      {
        name: 'Recent errors',
        value: errors.length
          ? '```\n' + fence(errors.map((e) => `[${e.level}] ${e.msg}`).join('\n'), 900) + '\n```'
          : '_(none)_',
      },
    ],
    timestamp: new Date().toISOString(),
  };
  if (hasShot) embed.image = { url: 'attachment://screenshot.jpg' };
  return embed;
}

Deno.serve(async (req: Request): Promise<Response> => {
  const origin = req.headers.get('origin');

  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(origin) });
  }
  if (req.method !== 'POST') {
    return json({ ok: false, status: 'method_not_allowed' }, 405, origin);
  }

  const authHeader = req.headers.get('authorization') || '';
  if (!/^Bearer\s+[\w-]+\.[\w-]+\.[\w-]+$/.test(authHeader)) {
    return json({ ok: false, status: 'unauthenticated' }, 401, origin);
  }
  // ── CHEAP REJECT. THIS IS NOT AUTHENTICATION. SAY IT OUT LOUD. ────────────
  // The signature is NOT checked here and cannot be: verifying it needs the
  // project JWKS, which is hr-accrue's jwt.js, and a second copy of a
  // security-critical module is a drift generator. The AUTHORITY remains
  // PostgREST — bug_report_submit runs as the caller and reads auth.uid(), so a
  // forged token still stores nothing and still relays nothing.
  //
  // What this DOES buy, and why it is worth six lines: on 2026-08-23 the
  // deployed function was measured with `verify_jwt = false` at the gateway
  // (probe + control in tests/edge-jwt-gate.mjs) despite supabase/config.toml
  // pinning it true. In that state every unauthenticated request on the
  // internet got a 3 MB body read, a JSON parse, a base64 image decode and an
  // outbound PostgREST round trip, free, at line rate. This moves the refusal
  // to BEFORE the body is read, so the unauthenticated cost is a header parse.
  //
  // THE REAL FIX IS THE GATEWAY FLAG. This is the cost brake that holds while
  // somebody is asleep, not a replacement for it, and edge-jwt-gate.mjs stays
  // red until the flag is right.
  try {
    const seg = authHeader.slice(7).split('.')[1];
    const pad = seg.replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(pad + '='.repeat((4 - pad.length % 4) % 4)));
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const now = Math.floor(Date.now() / 1000);
    if (claims.role !== 'authenticated' || !uuid.test(String(claims.sub || ''))
        || !(Number(claims.exp) > now)) {
      return json({ ok: false, status: 'unauthenticated' }, 401, origin);
    }
  } catch {
    return json({ ok: false, status: 'unauthenticated' }, 401, origin);
  }

  const declared = Number(req.headers.get('content-length') || '0');
  if (declared > MAX_BODY_BYTES) {
    return json({ ok: false, status: 'payload_too_large' }, 413, origin);
  }

  let raw: string;
  try {
    const buf = new Uint8Array(await req.arrayBuffer());
    if (buf.byteLength > MAX_BODY_BYTES) {
      return json({ ok: false, status: 'payload_too_large' }, 413, origin);
    }
    raw = new TextDecoder().decode(buf);
  } catch {
    return json({ ok: false, status: 'bad_request', detail: 'unreadable_body' }, 400, origin);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ ok: false, status: 'bad_request', detail: 'invalid_json' }, 400, origin);
  }

  const summary = clamp(body.summary, MAX_SUMMARY).trim();
  if (!summary) {
    return json({ ok: false, status: 'bad_request', detail: 'summary_required' }, 400, origin);
  }
  const description = clamp(body.description, MAX_DESC);
  const build = clamp(body.build, MAX_BUILD);
  const idemKey = clamp(body.idem_key, 64).trim();

  let state: Record<string, unknown> = {};
  if (body.state && typeof body.state === 'object' && !Array.isArray(body.state)) {
    state = body.state as Record<string, unknown>;
    if (JSON.stringify(state).length > MAX_STATE_CHARS) state = { _truncated: true };
  }
  const errors = Array.isArray(body.errors)
    ? (body.errors as Array<Record<string, unknown>>).slice(-MAX_ERRORS).map((e) => ({
        level: clamp(e && e.level, 24) || 'log',
        msg: clamp(e && e.msg, MAX_ERROR_MSG),
      }))
    : [];

  const shot = decodeScreenshot(body.screenshot);

  // The screenshot itself is NOT stored (see the SCREENSHOTS note above and
  // 2026-08-17-bug-triage.sql §(b) — it is already a Discord attachment, and a
  // base64 copy would inflate the only database holding player progression,
  // whose restores run off daily backups). But the automated triage loop reads
  // the TABLE, not Discord, so it must know whether an image exists to go and
  // look at. Recording that inside the state jsonb the RPC already receives
  // keeps bug_report_submit at SIX arguments: `create or replace` keys on
  // arity, so a seventh parameter would be a new overload beside the one pinned
  // in tests/rpc-resolution.targets.json and mirrored by the A9
  // bug_report_submit__ungated twin — PostgREST resolution would go ambiguous.
  // Server-derived from a shot that actually DECODED, so it cannot be forged by
  // a client sending the flag with no image.
  state = { ...state, hasScreenshot: !!shot };

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  let rpc: Record<string, unknown>;
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/bug_report_submit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': anonKey,
        'Authorization': authHeader,
      },
      body: JSON.stringify({
        p_summary: summary,
        p_description: description,
        p_build: build,
        p_state: state,
        p_errors: errors,
        p_idem_key: idemKey || null,
      }),
    });
    if (res.status === 404 || res.status === 400) {
      const text = await res.text();
      if (/PGRST202|does not exist|schema cache/i.test(text)) {
        return json({ ok: false, status: 'not_provisioned' }, 503, origin);
      }
      return json({ ok: false, status: 'store_failed' }, 502, origin);
    }
    if (res.status === 401 || res.status === 403) {
      return json({ ok: false, status: 'unauthenticated' }, 401, origin);
    }
    if (!res.ok) return json({ ok: false, status: 'store_failed' }, 502, origin);
    rpc = await res.json();
  } catch (_err) {
    console.error('[bug-report-bridge] rpc call failed');
    return json({ ok: false, status: 'store_failed' }, 502, origin);
  }

  if (!rpc || typeof rpc !== 'object') {
    return json({ ok: false, status: 'store_failed' }, 502, origin);
  }
  const rpcStatus = String(rpc.status || '');
  if (rpcStatus === 'unauthenticated') {
    return json({ ok: false, status: 'unauthenticated' }, 401, origin);
  }
  if (rpcStatus === 'bad_request') {
    return json({ ok: false, status: 'bad_request', detail: String(rpc.detail || '') }, 400, origin);
  }
  if (rpcStatus === 'rate_limited') {
    const retry = Number(rpc.retry_after_s || 60);
    return new Response(
      JSON.stringify({ ok: false, status: 'rate_limited', retry_after_s: retry, scope: rpc.scope }),
      {
        status: 429,
        headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Retry-After': String(retry) },
      },
    );
  }

  const reportId = rpc.report_id;
  const reporter = String(rpc.display_name || 'player');
  if (rpc.relay !== true) {
    return json({ ok: true, status: 'duplicate', report_id: reportId, relayed: false }, 200, origin);
  }

  const webhook = (Deno.env.get('DISCORD_WEBHOOK_URL') || '').trim();
  const webhookOk = /^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(webhook);
  if (!webhook || !webhookOk) {
    console.warn('[bug-report-bridge] DISCORD_WEBHOOK_URL is unset or malformed — stored without relay');
    return json({
      ok: true, status: 'stored', report_id: reportId, relayed: false,
      reason: 'not_configured',
    }, 200, origin);
  }

  const embed = buildEmbed(reporter, summary, description, build, state, errors, reportId, !!shot);
  const payload = {
    username: 'Hearthrise Bug Bot',
    allowed_mentions: { parse: [] as string[] },
    embeds: [embed],
    ...(shot ? { attachments: [{ id: 0, filename: 'screenshot.jpg', description: 'Bug report screenshot' }] } : {}),
  };

  let relayed = false;
  try {
    let res: Response;
    if (shot) {
      const fd = new FormData();
      fd.append('payload_json', JSON.stringify(payload));
      fd.append('files[0]', new Blob([shot.bytes], { type: shot.mime }), 'screenshot.jpg');
      res = await withTimeout(
        fetch(webhook, { method: 'POST', body: fd }),
        DISCORD_TIMEOUT_MS,
        new Response(null, { status: 504 }),
      );
    } else {
      res = await withTimeout(
        fetch(webhook, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
        DISCORD_TIMEOUT_MS,
        new Response(null, { status: 504 }),
      );
    }
    relayed = res.ok;
    if (!relayed) console.error('[bug-report-bridge] discord relay rejected, status', res.status);
  } catch {
    console.error('[bug-report-bridge] discord relay threw');
  }

  return json({
    ok: true,
    status: relayed ? 'accepted' : 'stored',
    report_id: reportId,
    relayed,
  }, 200, origin);
});
