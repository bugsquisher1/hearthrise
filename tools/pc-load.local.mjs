// tools/pc-load.local.mjs — what is loading Tyler's PC right now, in one screen. Windows only.
//
//   node tools/pc-load.local.mjs               CPU %, free RAM, top processes, lane test runs
//   node tools/pc-load.local.mjs --stop-lanes  also ends every lane test run (lane-done, tests/*, headless Chrome)
//
// Never touches Huntera-Stream, the Claude app or the user's own Chrome. Local tool, not in CI.
import { execFileSync } from 'node:child_process';

const ps = (cmd) => execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', cmd], { encoding: 'utf8', maxBuffer: 1 << 24 }).trim();

const json = ps(`
$cpu = [math]::Round((Get-Counter '\\Processor(_Total)\\% Processor Time' -SampleInterval 1 -MaxSamples 2).CounterSamples[-1].CookedValue)
$os = Get-CimInstance Win32_OperatingSystem
$procs = Get-CimInstance Win32_Process | Select-Object ProcessId, Name, WorkingSetSize, CommandLine
@{ cpu = $cpu; freeGb = [math]::Round($os.FreePhysicalMemory / 1MB, 1); totalGb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 1);
   procs = @($procs | ForEach-Object { @{ id = $_.ProcessId; name = $_.Name; mb = [math]::Round($_.WorkingSetSize / 1MB); cmd = [string]$_.CommandLine } }) } | ConvertTo-Json -Depth 4 -Compress`);
const s = JSON.parse(json);

const isLaneRun = (p) => (p.name === 'node.exe' && /lane-done\.mjs|[\\/ ]tests[\\/][^ ]+\.mjs|run-ci-local|run-smoke/.test(p.cmd))
  || p.name === 'chrome-headless-shell.exe';
const lane = s.procs.filter(isLaneRun);
const laneMb = lane.reduce((a, p) => a + p.mb, 0);

/* Group by program so 30 chrome.exe rows read as one line. */
const groups = new Map();
for (const p of s.procs) { const g = groups.get(p.name) || { n: 0, mb: 0 }; g.n++; g.mb += p.mb; groups.set(p.name, g); }
const top = [...groups.entries()].sort((a, b) => b[1].mb - a[1].mb).slice(0, 8);

console.log(`CPU ${s.cpu}% · RAM free ${s.freeGb} of ${s.totalGb} GB`);
console.log('Top programs by memory: ' + top.map(([n, g]) => `${n.replace(/\.exe$/, '')} ×${g.n} ${(g.mb / 1024).toFixed(1)} GB`).join(' · '));
const runs = lane.filter((p) => p.name === 'node.exe').map((p) => (p.cmd.match(/(lane-done\.mjs|tests[\\/][^ "]+\.mjs[^"]*?)(?:"|$)/) || [, p.cmd.slice(-60)])[1].trim());
console.log(lane.length
  ? `Lane test runs: ${lane.length} processes, ${(laneMb / 1024).toFixed(1)} GB (${runs.filter((r) => r.startsWith('lane-done')).length} lane-done, ${lane.filter((p) => p.name === 'chrome-headless-shell.exe').length} headless Chrome)`
  : 'Lane test runs: none');
for (const r of [...new Set(runs)].slice(0, 12)) console.log('  ' + r);

if (process.argv.includes('--stop-lanes') && lane.length) {
  for (const p of lane) { try { execFileSync('taskkill', ['/PID', String(p.id), '/T', '/F'], { stdio: 'ignore' }); } catch (e) { /* already gone */ } }
  console.log(`Stopped ${lane.length} lane test processes.`);
}
