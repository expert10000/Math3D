import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import vm from 'node:vm';
import appCallbackScopes from '../renderer/appCallbackScopes.mjs';

const requireRenderer = createRequire(resolve('renderer/package.json'));
const { transformSync } = requireRenderer('@babel/core');
const source = `
  const App = () => {
    const source = { value: 7 };
    const read = useCallback(() => source.value, [source]);
    const readLater = useCallback(() => later, []);
    const later = 9;
    return { read, readLater };
  };
  globalThis.result = App();
`;
const result = transformSync(source, {
  filename: resolve('renderer/src/App.tsx'),
  babelrc: false,
  configFile: false,
  plugins: [appCallbackScopes],
});
assert.deepEqual(result.metadata.math3dAppCallbackScopes, { transformed: 1, skippedForward: 1 });
assert.match(result.code, /function _appCallback\(source\)/);
const context = { useCallback: callback => callback };
vm.runInNewContext(result.code, context);
assert.equal(context.result.read(), 7);
assert.equal(context.result.readLater(), 9);

const unrelated = transformSync(source, {
  filename: resolve('renderer/src/Other.tsx'),
  babelrc: false,
  configFile: false,
  plugins: [appCallbackScopes],
});
assert.equal(unrelated.metadata.math3dAppCallbackScopes, undefined);
console.log('App callback capture and forward-reference checks passed');
