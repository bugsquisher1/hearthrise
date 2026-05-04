// ============================================================
// cloudflare-workers/bug-report-bridge.js
//
// Cloudflare Worker — Hearthrise bug report bridge.
//
// Receives a POST from the in-game bug-report tool and fans out to:
//   1. Discord channel via webhook → Tyler sees notification on phone
//   2. GitHub Issues API → Claude reads via WebFetch during co-pilot
//   3. (Optional) Supabase via the game's existing direct path
//
// Why a bridge: keeps secrets (GitHub PAT) off the public web client.
// Game POSTs to this Worker URL with no auth; the Worker holds the
// PAT as an environment secret and creates issues server-side.
//
// Setup: see BUG_REPORT_PIPELINE.md
//
// Deploy:
//   1. Sign up free at https://workers.cloudflare.com
//   2. `npm install -g wrangler`
//   3. `wrangler login`
//   4. `wrangler deploy bug-report-bridge.js --name hearthrise-bug-bridge`
//   5. Set secrets:
//        wrangler secret put DISCORD_WEBHOOK_URL
//        wrangler secret put GITHUB_PAT
//        wrangler secret put GITHUB_REPO    # e.g. "bugsquisher1/hearthrise"
// ============================================================

export default {
  async fetch(request, env) {
    // CORS preflight — game lives on a different origin.
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: corsHeaders(),
      });
    }
    if (request.method !== 'POST') {
      return new Response('POST only', { status: 405, headers: corsHeaders() });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response('invalid JSON', { status: 400, headers: corsHeaders() });
    }

    // Strip the screenshot from logs but keep it for outbound calls.
    const logSafe = { ...payload, screenshot: payload.screenshot ? '<base64 omitted>' : null };
    console.log('[bug-bridge] incoming:', logSafe.summary, '|', logSafe.user);

    // Fan out in parallel. Each branch is fail-soft — one failing
    // shouldn't block the other.
    const [discord, github] = await Promise.allSettled([
      sendToDiscord(payload, env),
      createGitHubIssue(payload, env),
    ]);

    const result = {
      ok: true,
      discord: settled(discord),
      github: settled(github),
    };
    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function settled(s) {
  if (s.status === 'fulfilled') return { ok: true, ...s.value };
  return { ok: false, error: String(s.reason).slice(0, 200) };
}

// ── Discord ─────────────────────────────────────────────────

async function sendToDiscord(payload, env) {
  const url = env.DISCORD_WEBHOOK_URL;
  if (!url) return { skipped: 'DISCORD_WEBHOOK_URL not set' };

  const truncatedState = JSON.stringify(payload.state || {}, null, 2).slice(0, 900);
  const errors = payload.errors || [];
  const errorsText = errors.length
    ? errors.map(e => `[${e.level}] ${e.msg}`).join('\n').slice(0, 900)
    : '(none)';

  const body = {
    username: 'Hearthrise Bug Bot',
    embeds: [{
      title: '🐛 ' + (payload.summary || 'Bug report'),
      description: payload.description || '(no description)',
      color: 0xd44a3a,
      fields: [
        { name: 'Build',  value: '`' + (payload.build || '?') + '`', inline: true },
        { name: 'Player', value: payload.user || 'guest',             inline: true },
        { name: 'Tab',    value: String(payload.state?.activeTab || '—'), inline: true },
        { name: 'Viewport', value: String(payload.state?.viewport || '—'), inline: true },
        { name: 'State',  value: '```json\n' + truncatedState + '\n```' },
        { name: 'Errors', value: '```\n' + errorsText + '\n```' },
      ],
      timestamp: new Date().toISOString(),
    }],
  };

  // Attach screenshot if present. Discord accepts up to 8MB per file.
  let res;
  if (payload.screenshot && payload.screenshot.startsWith('data:image/')) {
    const formData = new FormData();
    formData.append('payload_json', JSON.stringify(body));
    const blob = dataUrlToBlob(payload.screenshot);
    formData.append('file', blob, 'screenshot.jpg');
    res = await fetch(url, { method: 'POST', body: formData });
  } else {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  if (!res.ok) throw new Error('Discord ' + res.status + ': ' + (await res.text()).slice(0, 200));
  return { status: res.status };
}

function dataUrlToBlob(dataUrl) {
  const [head, b64] = dataUrl.split(',');
  const mime = head.match(/data:([^;]+)/)?.[1] || 'image/jpeg';
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ── GitHub Issues ───────────────────────────────────────────

async function createGitHubIssue(payload, env) {
  const repo = env.GITHUB_REPO;        // "owner/name"
  const pat  = env.GITHUB_PAT;
  if (!repo || !pat) return { skipped: 'GITHUB_REPO or GITHUB_PAT not set' };

  // Build the issue body in markdown. Screenshot is uploaded separately
  // via GitHub's image-attach endpoint (not used here; instead we embed
  // a base64 data URL — works in GitHub for files <1MB; otherwise we
  // fall back to a "screenshot omitted, see Discord" note).
  const screenshotOk = payload.screenshot && payload.screenshot.length < 900_000;
  const screenshotBlock = screenshotOk
    ? '\n\n![screenshot](' + payload.screenshot + ')\n'
    : (payload.screenshot
        ? '\n\n_Screenshot too large for GitHub embed — see Discord._\n'
        : '\n\n_(no screenshot)_\n');

  const stateBlock = '<details><summary>State</summary>\n\n```json\n'
    + JSON.stringify(payload.state || {}, null, 2)
    + '\n```\n\n</details>';
  const errors = payload.errors || [];
  const errorsBlock = errors.length
    ? '<details><summary>Recent errors (' + errors.length + ')</summary>\n\n```\n'
        + errors.map(e => '[' + e.level + '] ' + e.msg).join('\n')
        + '\n```\n\n</details>'
    : '_(no errors captured)_';

  const body = ''
    + (payload.description || '_(no description)_') + '\n\n'
    + '---\n\n'
    + '**Build:** `' + (payload.build || '?') + '`  \n'
    + '**Player:** ' + (payload.user || 'guest') + '  \n'
    + '**Tab:** ' + (payload.state?.activeTab || '—') + '  \n'
    + '**Viewport:** ' + (payload.state?.viewport || '—') + '  \n'
    + '**Reported:** ' + (payload.ts || new Date().toISOString())
    + screenshotBlock + '\n'
    + stateBlock + '\n\n'
    + errorsBlock;

  const labels = ['bug-report', 'beta'];
  // Add a build-specific label so we can filter "bugs from b117" etc.
  if (payload.build) labels.push(String(payload.build).slice(0, 30));

  const res = await fetch('https://api.github.com/repos/' + repo + '/issues', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + pat,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'hearthrise-bug-bridge',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: '🐛 ' + (payload.summary || 'Bug report').slice(0, 200),
      body,
      labels,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('GitHub ' + res.status + ': ' + txt.slice(0, 300));
  }
  const issue = await res.json();
  return { status: res.status, issueNumber: issue.number, url: issue.html_url };
}
