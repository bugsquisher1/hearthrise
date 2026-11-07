// tools/balance-lab/shims/node-stub.mjs — `node:url` and `node:path` for the browser bundle.
//
// tools/balance-sim/gear.mjs (the one home of STYLES, the ways to fight) imports these for its node-only loader. The
// Balance Lab reads STYLES and never calls the loader, so the bundle maps both modules here: any call is a bug in
// the bundle's graph and says so instead of answering a wrong path.
const notHere = (name) => () => { throw new Error('balance-lab: ' + name + ' is node-only and has no place in the browser bundle'); };
export const pathToFileURL = notHere('pathToFileURL');
export const fileURLToPath = notHere('fileURLToPath');
export const join = notHere('join');
export const resolve = notHere('resolve');
export const dirname = notHere('dirname');
export default { pathToFileURL, fileURLToPath, join, resolve, dirname };
