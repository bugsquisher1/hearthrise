// tools/balance-lab/api.mjs — what dist/engine.js exports: the runner, the dials, the target sheet and the worker's
// own message handler (so a node caller, tools/balance-lab/parity.mjs, drives the exact road the page drives).
export * from './lab-core.mjs';
export * from './dials.mjs';
export * from './targets.mjs';
export { handle } from './worker-main.mjs';
