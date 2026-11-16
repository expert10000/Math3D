// App has a very large render scope. A memoized callback created inside that
// scope can retain an older render, including hundreds of unrelated closures.
// Move eligible hook bodies to module-level factories with explicit captures.
// React still owns the original hook call and dependency list.
const inPath = (path, ancestor) => {
  for (let current = path; current; current = current.parentPath) {
    if (current === ancestor) return true;
  }
  return false;
};

export default function appCallbackScopes({ types: t }) {
  return {
    name: "math3d-app-callback-scopes",
    visitor: {
      Program(program, state) {
        if (!/[\\/]src[\\/]App\.tsx$/.test(state.filename ?? "")) return;
        const declaration = program.scope.getBinding("App")?.path;
        const app = declaration?.isVariableDeclarator() ? declaration.get("init") : null;
        if (!app?.isFunction()) return;
        const factories = [];
        let scopedForward = 0;
        let skippedForward = 0;
        const transformed = { useCallback: 0, useMemo: 0, useEffect: 0, useLayoutEffect: 0 };
        app.traverse({
          CallExpression(call) {
            const callee = call.get("callee");
            if (!callee.isIdentifier() || !(callee.node.name in transformed)) return;
            const hook = callee.node.name;
            const callback = call.get("arguments.0");
            if (!callback?.isFunction()) return;
            const captures = new Map();
            callback.traverse({
              ReferencedIdentifier(reference) {
                const binding = reference.scope.getBinding(reference.node.name);
                if (!binding || !inPath(binding.path, app) || inPath(binding.path, callback)) return;
                captures.set(reference.node.name, binding.path);
              },
            });
            // Reading a later const at the factory call would introduce TDZ.
            // Keep delayed reads in App, but hand descendants the scoped hook's
            // proxy so old App renders are not retained by these callbacks.
            if ([...captures.values()].some(binding => binding.node.start > call.node.start)) {
              if (hook === "useCallback") {
                callee.replaceWith(t.identifier("useScopedCallback"));
                scopedForward++;
              } else skippedForward++;
              return;
            }
            const factoryId = program.scope.generateUidIdentifier("appCallback");
            const captureNames = [...captures.keys()];
            const factory = t.functionDeclaration(factoryId,
              captureNames.map(name => t.identifier(name)),
              t.blockStatement([t.returnStatement(t.cloneNode(callback.node, true))]));
            factories.push(factory);
            callback.replaceWith(t.callExpression(t.cloneNode(factoryId), captureNames.map(name => t.identifier(name))));
            transformed[hook]++;
          },
        });
        if (factories.length) declaration.parentPath.insertBefore(factories);
        state.file.metadata.math3dAppCallbackScopes = { transformed, scopedForward, skippedForward };
      },
    },
  };
}
