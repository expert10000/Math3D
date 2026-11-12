import { useLayoutEffect, useMemo, useRef, type DependencyList } from "react";

// Create the function handed to children outside App's render closure. The
// current implementation is retained only until the next committed render;
// the function passed through props holds this small ref, not an old App scope.
function proxyCurrent<T extends (...args: never[]) => unknown>(current: { current: T }): T {
  return ((...args: Parameters<T>): ReturnType<T> => current.current(...args) as ReturnType<T>) as T;
}

export function useScopedCallback<T extends (...args: never[]) => unknown>(
  callback: T,
  dependencies: DependencyList
): T {
  const current = useRef(callback);
  useLayoutEffect(() => {
    current.current = callback;
  });
  return useMemo(() => proxyCurrent(current), dependencies);
}
