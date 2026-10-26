import { chromium } from 'playwright';
const b = await chromium.launch();
for (const [n,q] of [['11-farm-plots-1440','x=60&y=84'],['12-mountain-quarry-1440','x=176&y=40'],['13-north-wall-gate-1440','x=96&y=10']]) {
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto('http://localhost:8232/art/review/havora-art-3-2026-10-26/view.html?' + q);
  await p.waitForFunction(() => document.body.dataset.ready === '1', null, { timeout: 30000 }); await p.waitForTimeout(600);
  await p.screenshot({ path: 'R:/the game/the game/.claude/worktrees/agent-a2cfce87094916d67/art/review/havora-art-3-2026-10-26/' + n + '.png' }); await p.close();
}
await b.close();
