const { blobRetireGuard } = await import('./blob-retire.mjs');
await blobRetireGuard();
console.log('blobRetireGuard ran');
const { bootReplay } = await import('./schema-replay.mjs');
try { const r = await bootReplay(); console.log('bootReplay OK', !!r.db); }
catch(e){ console.log('BOOT FAIL:', e.message); console.log(e.stack.split('\n').slice(0,12).join('\n')); }
