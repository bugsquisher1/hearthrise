// desktop/src/offline.js — the one button on the offline page; the shell also retries on its own.
document.getElementById('again').addEventListener('click', () => { window.hearthriseShell.retry(); });
