#!/usr/bin/env node
// art/review/town-zoom-2026-10-26/gpu.mjs — which renderer the headless shots ran on (the draw timings are only as
// real as the canvas under them). NOT a test.  node art/review/town-zoom-2026-10-26/gpu.mjs [--gpu]
import { chromium } from 'playwright';
const gpu = process.argv.includes('--gpu');
const browser = await chromium.launch(gpu ? { args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=d3d11'] } : {});
const page = await browser.newPage();
await page.setContent('<canvas id=c></canvas>');
console.log(await page.evaluate(() => {
  const g = document.createElement('canvas').getContext('webgl');
  const d = g && g.getExtension('WEBGL_debug_renderer_info');
  return d ? g.getParameter(d.UNMASKED_RENDERER_WEBGL) : 'no webgl';
}));
await browser.close();
