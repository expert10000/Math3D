import type { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

/**
 * React can detach a viewer canvas before its passive effect cleanup runs.
 * OrbitControls.disconnect() looks up the canvas's *current* root, which is then
 * the canvas rather than the document where its Control-key listeners were added.
 * Remove those document listeners explicitly before disposing the controls.
 */
export function disposeOrbitControls(controls: OrbitControls): void {
  const canvas = controls.domElement;
  const document = canvas?.ownerDocument;
  const interceptors = controls as OrbitControls & {
    _interceptControlDown?: EventListener;
    _interceptControlUp?: EventListener;
  };

  if (document && interceptors._interceptControlDown) {
    document.removeEventListener("keydown", interceptors._interceptControlDown, true);
  }
  if (document && interceptors._interceptControlUp) {
    document.removeEventListener("keyup", interceptors._interceptControlUp, true);
  }
  controls.dispose();
}
