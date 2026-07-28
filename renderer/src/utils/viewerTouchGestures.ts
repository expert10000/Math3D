import * as THREE from "three";

export type ViewerTouchGesturePoint = {
  pointerId: number;
  pointerType?: string;
  clientX: number;
  clientY: number;
  preventDefault?: () => void;
  stopPropagation?: () => void;
};

export type ViewerTouchGestureOptions = {
  doubleTapMaxMs?: number;
  longPressMs?: number;
  tapMaxMs?: number;
  moveSlopPx?: number;
  doubleTapSlopPx?: number;
  now?: () => number;
  setTimeout?: (handler: () => void, timeout: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
  onDoubleTap?: (event: ViewerTouchGesturePoint) => void;
  onLongPress?: (event: ViewerTouchGesturePoint) => void;
};

type ActiveTouch = {
  pointerId: number;
  pointerType?: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  startedAt: number;
  moved: boolean;
  longPressFired: boolean;
  event: ViewerTouchGesturePoint;
};

const isTouchLikePointer = (event: ViewerTouchGesturePoint) =>
  event.pointerType === "touch" || event.pointerType === "pen";

export const configureOrbitControlsForTouch = (controls: OrbitTouchControlTarget) => {
  controls.touches = {
    ONE: THREE.TOUCH.ROTATE,
    TWO: THREE.TOUCH.DOLLY_PAN,
  };
  controls.screenSpacePanning = true;
};

export type OrbitTouchControlTarget = {
  touches?: {
    ONE?: number | null;
    TWO?: number | null;
  };
  screenSpacePanning?: boolean;
};

export const createViewerTouchGestureTracker = (options: ViewerTouchGestureOptions = {}) => {
  const doubleTapMaxMs = options.doubleTapMaxMs ?? 320;
  const longPressMs = options.longPressMs ?? 560;
  const tapMaxMs = options.tapMaxMs ?? 260;
  const moveSlopPx = options.moveSlopPx ?? 14;
  const doubleTapSlopPx = options.doubleTapSlopPx ?? 36;
  const now = options.now ?? (() => performance.now());
  const schedule = options.setTimeout ?? ((handler, timeout) => window.setTimeout(handler, timeout));
  const clearScheduled = options.clearTimeout ?? ((handle) => window.clearTimeout(handle as number));

  const activePointers = new Set<number>();
  let activeTouch: ActiveTouch | null = null;
  let longPressTimer: unknown = null;
  let multiTouchActive = false;
  let lastTap: { x: number; y: number; at: number } | null = null;

  const cancelLongPress = () => {
    if (longPressTimer == null) return;
    clearScheduled(longPressTimer);
    longPressTimer = null;
  };

  const cancel = () => {
    cancelLongPress();
    activePointers.clear();
    activeTouch = null;
    multiTouchActive = false;
  };

  const markMoved = (event: ViewerTouchGesturePoint) => {
    if (!activeTouch || event.pointerId !== activeTouch.pointerId) return;
    activeTouch.lastX = event.clientX;
    activeTouch.lastY = event.clientY;
    const dx = event.clientX - activeTouch.startX;
    const dy = event.clientY - activeTouch.startY;
    if (Math.hypot(dx, dy) > moveSlopPx) {
      activeTouch.moved = true;
      cancelLongPress();
    }
  };

  const down = (event: ViewerTouchGesturePoint) => {
    if (!isTouchLikePointer(event)) return;

    activePointers.add(event.pointerId);
    if (activePointers.size > 1) {
      multiTouchActive = true;
      cancelLongPress();
      return;
    }

    multiTouchActive = false;
    activeTouch = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      startedAt: now(),
      moved: false,
      longPressFired: false,
      event,
    };

    cancelLongPress();
    longPressTimer = schedule(() => {
      longPressTimer = null;
      if (!activeTouch || activeTouch.moved || multiTouchActive) return;
      activeTouch.longPressFired = true;
      options.onLongPress?.({
        ...activeTouch.event,
        clientX: activeTouch.lastX,
        clientY: activeTouch.lastY,
      });
    }, longPressMs);
  };

  const move = (event: ViewerTouchGesturePoint) => {
    markMoved(event);
  };

  const up = (event: ViewerTouchGesturePoint) => {
    activePointers.delete(event.pointerId);
    if (!activeTouch || event.pointerId !== activeTouch.pointerId) {
      if (activePointers.size === 0) multiTouchActive = false;
      return;
    }

    markMoved(event);
    cancelLongPress();

    const endedAt = now();
    const duration = endedAt - activeTouch.startedAt;
    const canTap = !activeTouch.moved && !activeTouch.longPressFired && !multiTouchActive && duration <= tapMaxMs;
    if (canTap) {
      const previous = lastTap;
      const isDoubleTap =
        !!previous &&
        endedAt - previous.at <= doubleTapMaxMs &&
        Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= doubleTapSlopPx;

      if (isDoubleTap) {
        lastTap = null;
        event.preventDefault?.();
        event.stopPropagation?.();
        options.onDoubleTap?.(event);
      } else {
        lastTap = { x: event.clientX, y: event.clientY, at: endedAt };
      }
    }

    activeTouch = null;
    if (activePointers.size === 0) multiTouchActive = false;
  };

  return {
    down,
    move,
    up,
    cancel,
    dispose: cancel,
  };
};

export const installViewerTouchGestures = (
  target: HTMLElement,
  options: ViewerTouchGestureOptions & { preventTouchContextMenu?: boolean } = {}
) => {
  const tracker = createViewerTouchGestureTracker(options);
  const win = target.ownerDocument?.defaultView ?? window;

  const handlePointerDown = (event: PointerEvent) => tracker.down(event);
  const handlePointerMove = (event: PointerEvent) => tracker.move(event);
  const handlePointerUp = (event: PointerEvent) => tracker.up(event);
  const handlePointerCancel = () => tracker.cancel();
  const handleContextMenu = (event: MouseEvent) => {
    if (options.preventTouchContextMenu === false) return;
    event.preventDefault();
  };

  target.addEventListener("pointerdown", handlePointerDown);
  win.addEventListener("pointermove", handlePointerMove);
  win.addEventListener("pointerup", handlePointerUp);
  win.addEventListener("pointercancel", handlePointerCancel);
  target.addEventListener("lostpointercapture", handlePointerCancel);
  target.addEventListener("contextmenu", handleContextMenu);

  return () => {
    tracker.dispose();
    target.removeEventListener("pointerdown", handlePointerDown);
    win.removeEventListener("pointermove", handlePointerMove);
    win.removeEventListener("pointerup", handlePointerUp);
    win.removeEventListener("pointercancel", handlePointerCancel);
    target.removeEventListener("lostpointercapture", handlePointerCancel);
    target.removeEventListener("contextmenu", handleContextMenu);
  };
};
