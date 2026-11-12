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
    const memo = useMemo(() => ({ value: source.value }), [source]);
    useEffect(() => { globalThis.effect = source.value; }, [source]);
    const later = 9;
    return { read, readLater, memo };
  };
  globalThis.result = App();
`;
const result = transformSync(source, {
  filename: resolve('renderer/src/App.tsx'),
  babelrc: false,
  configFile: false,
  plugins: [appCallbackScopes],
});
assert.deepEqual(result.metadata.math3dAppCallbackScopes, {
  transformed: { useCallback: 1, useMemo: 1, useEffect: 1, useLayoutEffect: 0 },
  scopedForward: 1,
  skippedForward: 0,
});
assert.match(result.code, /function _appCallback\(source\)/);
assert.match(result.code, /useScopedCallback\(\(\) => later/);
const context = { useCallback: callback => callback, useScopedCallback: callback => callback,
  useMemo: callback => callback(), useEffect: callback => callback() };
vm.runInNewContext(result.code, context);
assert.equal(context.result.read(), 7);
assert.equal(context.result.readLater(), 9);
assert.equal(context.result.memo.value, 7);
assert.equal(context.effect, 7);

const unrelated = transformSync(source, {
  filename: resolve('renderer/src/Other.tsx'),
  babelrc: false,
  configFile: false,
  plugins: [appCallbackScopes],
});
assert.equal(unrelated.metadata.math3dAppCallbackScopes, undefined);
console.log('App callback capture and forward-reference checks passed');
