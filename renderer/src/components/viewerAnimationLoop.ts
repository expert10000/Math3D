// A cancelled browser frame may remain queued for a while. Clear its render
// closure as well as the request, so stale frames cannot retain an old scene.
export function startViewerAnimationLoop(
  renderFrame: () => void,
  schedule: (callback: FrameRequestCallback) => number = requestAnimationFrame,
  cancel: (id: number) => void = cancelAnimationFrame,
): () => void {
  let currentFrame: (() => void) | null = renderFrame;
  let requestId: number | null = null;
  const tick = () => {
    const render = currentFrame;
    if (!render) return;
    requestId = schedule(tick);
    render();
  };
  tick();
  return () => {
    currentFrame = null;
    if (requestId !== null) cancel(requestId);
    requestId = null;
  };
}
