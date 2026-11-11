// tools/pack/whole-loader.mjs — the whole view's load hook, registered by ./whole-hook.mjs (module.register, the loader's
// thread): src/data/grounds/index.js is served as the index naming the folded packs alone; every other module loads as it is.
const INDEX = /\/src\/data\/grounds\/index\.js(\?.*)?$/;
let source = null;

/** @param {{source: string}} data  the view's index text, written in the main thread (./whole-hook.mjs) */
export function initialize(data) { source = data.source; }

export async function load(url, context, next) {
  if (!INDEX.test(url)) return next(url, context);
  /* never the plain index in the view's place: a generator would render every pack and call it the folded ones */
  if (typeof source !== 'string') throw new Error('whole-loader: no view index (register it through tools/pack/whole-hook.mjs)');
  return { format: 'module', source, shortCircuit: true };
}
