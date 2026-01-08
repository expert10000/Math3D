// src/components/AxisGizmo.tsx
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";

export type CameraView = "xy" | "xz" | "yz";

export interface AxisGizmoProps {
  size?: number;
  onSelectView?: (view: CameraView) => void;
  getMainCamera?: () => THREE.Camera | null;
}

/**
 * 2D canvas gizmo:
 * - draws a circle and 3 colored arrows X/Y/Z
 * - orientation follows main camera (if provided)
 * - clicking near Z/Y/X arrows selects XY / XZ / YZ views
 */
const AxisGizmo: React.FC<AxisGizmoProps> = ({
  size = 110,
  onSelectView,
  getMainCamera,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const getMainCameraRef = useRef<AxisGizmoProps["getMainCamera"] | undefined>(
    undefined
  );
  const onSelectViewRef = useRef<AxisGizmoProps["onSelectView"] | undefined>(
    undefined
  );

  // last drawn 2D directions of axes, for hit-test
  const axis2DRef = useRef<{
    x: { x: number; y: number };
    y: { x: number; y: number };
    z: { x: number; y: number };
  } | null>(null);

  useEffect(() => {
    getMainCameraRef.current = getMainCamera;
  }, [getMainCamera]);

  useEffect(() => {
    onSelectViewRef.current = onSelectView;
  }, [onSelectView]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) * 0.38;

    let frameId: number;

    const draw = () => {
      frameId = requestAnimationFrame(draw);

      // background
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#f2f2f2";
      ctx.fillRect(0, 0, w, h);

      // outer circle
      ctx.beginPath();
      ctx.arc(cx, cy, radius + 4, 0, Math.PI * 2);
      ctx.strokeStyle = "#cccccc";
      ctx.lineWidth = 1;
      ctx.stroke();

      // get camera orientation (world -> camera)
      const getCam = getMainCameraRef.current;
      let qInv = new THREE.Quaternion(); // identity

      if (getCam) {
        const cam = getCam();
        if (cam) {
          // camera.quaternion is camera -> world, so invert
          qInv = cam.quaternion.clone().invert();
        }
      }

      // helper: project 3D axis to 2D
      const projectAxis = (vWorld: THREE.Vector3) => {
        const vCam = vWorld.clone().applyQuaternion(qInv); // in camera coords
        const v2d = new THREE.Vector2(vCam.x, vCam.y);
        if (v2d.lengthSq() < 1e-6) v2d.set(0, 1); // avoid degenerate
        v2d.normalize();
        return v2d;
      };

      const xAxis2d = projectAxis(new THREE.Vector3(1, 0, 0));
      const yAxis2d = projectAxis(new THREE.Vector3(0, 1, 0));
      const zAxis2d = projectAxis(new THREE.Vector3(0, 0, 1));

      // store directions for click hit-test
      axis2DRef.current = {
        x: { x: xAxis2d.x, y: xAxis2d.y },
        y: { x: yAxis2d.x, y: yAxis2d.y },
        z: { x: zAxis2d.x, y: zAxis2d.y },
      };

      // helper: draw arrow
      const drawArrow = (
        v: THREE.Vector2,
        color: string,
        label: string
      ) => {
        const endX = cx + v.x * radius;
        const endY = cy - v.y * radius; // flip Y for canvas

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // little circle at end
        ctx.beginPath();
        ctx.arc(endX, endY, 3, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // label a bit further out
        const labelX = cx + v.x * (radius + 14);
        const labelY = cy - v.y * (radius + 14);
        ctx.fillStyle = "#333";
        ctx.font = "bold 11px system-ui, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, labelX, labelY);
      };

      drawArrow(xAxis2d, "#ff5555", "X");
      drawArrow(yAxis2d, "#55aa55", "Y");
      drawArrow(zAxis2d, "#5555ff", "Z");
    };

    draw();

    return () => {
      cancelAnimationFrame(frameId);
    };
  }, [size]);

  // hit-test: which arrow is click closest to?
  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const axes = axis2DRef.current;
    if (!axes) return;

    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    const cx = canvas.width / 2;
    const cy = canvas.height / 2;

    const dx = x - cx;
    const dy = cy - y; // flip Y

    const vClick = new THREE.Vector2(dx, dy);
    if (vClick.lengthSq() < 1e-4) return;
    vClick.normalize();

    const dot = (ax: { x: number; y: number }) =>
      vClick.x * ax.x + vClick.y * ax.y;

    const dX = dot(axes.x);
    const dY = dot(axes.y);
    const dZ = dot(axes.z);

    // choose axis with maximum dot (pointing closest to click)
    const absX = Math.abs(dX);
    const absY = Math.abs(dY);
    const absZ = Math.abs(dZ);

    let chosen: CameraView = "xy";

    if (absZ >= absX && absZ >= absY) {
      chosen = "xy"; // clicked near Z arrow -> look along Z -> XY plane
    } else if (absY >= absX && absY >= absZ) {
      chosen = "xz"; // clicked near Y arrow -> look along Y -> XZ plane
    } else {
      chosen = "yz"; // clicked near X arrow -> look along X -> YZ plane
    }

    const cb = onSelectViewRef.current;
    if (cb) cb(chosen);
  };

  return (
    <canvas
      ref={canvasRef}
      width={size}
      height={size}
      onPointerDown={handlePointerDown}
      style={{
        display: "block",
        width: size,
        height: size,
        cursor: "pointer",
        borderRadius: 4,
        border: "1px solid #ccc",
        backgroundColor: "#f2f2f2",
      }}
    />
  );
};

export default AxisGizmo;
