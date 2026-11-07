// tools/pack/whole-hook.mjs — the whole view's module hook (tools/pack/whole.mjs): loaded with `node --import`, it serves
// src/data/grounds/index.js naming only the packs in HR_WHOLE_PACKS (comma ids), so a whole generator's data is the base and
// the folded packs, exactly. Every other module loads as it is.
import { registerHooks } from 'node:module';
import { indexText, buildVersion } from './files.mjs';

const want = (process.env.HR_WHOLE_PACKS || '').split(',').filter(Boolean).sort();
const INDEX = /\/src\/data\/grounds\/index\.js(\?.*)?$/;
const source = indexText(want, buildVersion());

registerHooks({
  load(url, context, next) {
    if (INDEX.test(url)) return { format: 'module', source, shortCircuit: true };
    return next(url, context);
  },
});
