// tools/pack/whole-hook.mjs — the whole view's module hook (tools/pack/whole.mjs): loaded with `node --import`, it serves
// src/data/grounds/index.js naming only the packs in HR_WHOLE_PACKS (comma ids), so a whole generator's data is the base and
// the folded packs, exactly. Every other module loads as it is.
// module.register (Node 20.6+), not registerHooks (22.15+): the CI runners are Node 20 (.github/workflows/smoke.yml), and
// release run 42519810819 failed on the missing export. The hooks themselves run in ./whole-loader.mjs, the loader's thread.
import { register } from 'node:module';
import { indexText, buildVersion } from './files.mjs';

const want = (process.env.HR_WHOLE_PACKS || '').split(',').filter(Boolean).sort();

register('./whole-loader.mjs', import.meta.url, { data: { source: indexText(want, buildVersion()) } });
