// App has a very large render scope. A memoized callback created inside that
// scope can retain an older render, including hundreds of unrelated closures.
// Move each eligible callback body to a module-level factory with explicit
// captures. React still owns the original useCallback and dependency list.
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
        let skippedForward = 0;
        let transformed = 0;
        app.traverse({
          CallExpression(call) {
            if (!call.get("callee").isIdentifier({ name: "useCallback" })) return;
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
            // Those callbacks remain in App until their declarations move.
            if ([...captures.values()].some(binding => binding.node.start > call.node.start)) {
              skippedForward++;
              return;
            }
            const factoryId = program.scope.generateUidIdentifier("appCallback");
            const captureNames = [...captures.keys()];
            const factory = t.functionDeclaration(factoryId,
              captureNames.map(name => t.identifier(name)),
              t.blockStatement([t.returnStatement(t.cloneNode(callback.node, true))]));
            factories.push(factory);
            callback.replaceWith(t.callExpression(t.cloneNode(factoryId), captureNames.map(name => t.identifier(name))));
            transformed++;
          },
        });
        if (factories.length) declaration.parentPath.insertBefore(factories);
        state.file.metadata.math3dAppCallbackScopes = { transformed, skippedForward };
      },
    },
  };
}
