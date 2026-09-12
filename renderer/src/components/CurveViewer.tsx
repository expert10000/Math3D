import React, { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { configureOrbitControlsForTouch, installViewerTouchGestures } from "../utils/viewerTouchGestures";

export type CurveViewerVec3 = { x: number; y: number; z: number };

export type CurveViewerGlyph = {
  point: CurveViewerVec3;
  tangent?: CurveViewerVec3 | null;
  normal?: CurveViewerVec3 | null;
  binormal?: CurveViewerVec3 | null;
};

export type CurveViewerProps = {
  samples: CurveViewerVec3[];
  dimension: 2 | 3;
  closed?: boolean;
  frameGlyphs?: CurveViewerGlyph[];
  probeGlyph?: CurveViewerGlyph | null;
  showTangent?: boolean;
  showNormal?: boolean;
  showBinormal?: boolean;
  frameScale?: number;
  resetToken?: number;
  showCurve?: boolean;
  showSamples?: boolean;
  showAxes?: boolean;
  showGrid?: boolean;
  curvatureComb?: ReadonlyArray<readonly [CurveViewerVec3, CurveViewerVec3]>;
  evolutePoints?: CurveViewerVec3[];
  osculatingCircle?: { center: CurveViewerVec3; radius: number; normal: CurveViewerVec3 } | null;
  evidencePlanes?: Array<{ point: CurveViewerVec3; normal: CurveViewerVec3; color: number }>;
  onSelectSample?: (sampleIndex: number) => void;
};

const TANGENT_COLOR = new THREE.Color(0x0ea5e9);
const NORMAL_COLOR = new THREE.Color(0x22c55e);
const BINORMAL_COLOR = new THREE.Color(0xf97316);

const vecFrom = (value: CurveViewerVec3) => new THREE.Vector3(value.x, value.y, value.z);

const finiteVec = (value: CurveViewerVec3 | null | undefined): value is CurveViewerVec3 =>
  !!value && Number.isFinite(value.x) && Number.isFinite(value.y) && Number.isFinite(value.z);

const safeUnit = (value: CurveViewerVec3 | null | undefined) => {
  if (!finiteVec(value)) return null;
  const v = vecFrom(value);
  const len = v.length();
  if (len <= 1e-9) return null;
  return v.multiplyScalar(1 / len);
};

const disposeSceneObjects = (root: THREE.Object3D) => {
  root.traverse((node) => {
    const withGeometry = node as THREE.Object3D & { geometry?: THREE.BufferGeometry };
    if (withGeometry.geometry) withGeometry.geometry.dispose();

    const withMaterial = node as THREE.Object3D & {
      material?: THREE.Material | THREE.Material[] | null;
    };
    if (Array.isArray(withMaterial.material)) {
      withMaterial.material.forEach((material) => material.dispose());
    } else if (withMaterial.material) {
      withMaterial.material.dispose();
    }
  });
};

export const CurveViewer: React.FC<CurveViewerProps> = ({
  samples,
  dimension,
  closed = false,
  frameGlyphs = [],
  probeGlyph = null,
  showTangent = true,
  showNormal = true,
  showBinormal = true,
  frameScale = 0.5,
  resetToken = 0,
  showCurve = true,
  showSamples = false,
  showAxes = true,
  showGrid = true,
  curvatureComb = [],
  evolutePoints = [],
  osculatingCircle = null,
  evidencePlanes = [],
  onSelectSample,
}) => {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const width = Math.max(2, host.clientWidth);
    const height = Math.max(2, host.clientHeight);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0xf8fafc, 1);
    host.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf8fafc);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 5000);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    configureOrbitControlsForTouch(controls);

    scene.add(new THREE.AmbientLight(0xffffff, 0.75));
    const keyLight = new THREE.DirectionalLight(0xffffff, 0.75);
    keyLight.position.set(4, 6, 5);
    scene.add(keyLight);

    const fitPoints: THREE.Vector3[] = [];
    const curvePoints = samples.filter(finiteVec).map((point) => vecFrom(point));
    curvePoints.forEach((point) => fitPoints.push(point.clone()));

    const visualGroup = new THREE.Group();
    scene.add(visualGroup);

    if (showCurve && curvePoints.length >= 2) {
      const curveGeometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
      const curveLine = new THREE.Line(
        curveGeometry,
        new THREE.LineBasicMaterial({ color: 0x1d4ed8, transparent: true, opacity: 0.95 })
      );
      visualGroup.add(curveLine);

      if (closed) {
        const first = curvePoints[0];
        const last = curvePoints[curvePoints.length - 1];
        if (first.distanceToSquared(last) > 1e-8) {
          const closeGeometry = new THREE.BufferGeometry().setFromPoints([last, first]);
          visualGroup.add(
            new THREE.Line(
              closeGeometry,
              new THREE.LineBasicMaterial({ color: 0x1d4ed8, transparent: true, opacity: 0.55 })
            )
          );
        }
      }
    }

    if (showSamples && curvePoints.length) {
      const sampleGeometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
      const sampleMaterial = new THREE.PointsMaterial({ color: 0x7c3aed, size: Math.max(0.025, frameScale * 0.08), sizeAttenuation: true });
      visualGroup.add(new THREE.Points(sampleGeometry, sampleMaterial));
    }

    for (const segment of curvatureComb) {
      if (!finiteVec(segment[0]) || !finiteVec(segment[1])) continue;
      const geometry = new THREE.BufferGeometry().setFromPoints([vecFrom(segment[0]), vecFrom(segment[1])]);
      visualGroup.add(new THREE.Line(geometry, new THREE.LineBasicMaterial({ color: 0xdb2777, transparent: true, opacity: 0.7 })));
    }

    const evolute = evolutePoints.filter(finiteVec).map(vecFrom);
    if (evolute.length >= 2) {
      visualGroup.add(new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(evolute),
        new THREE.LineBasicMaterial({ color: 0x9333ea, transparent: true, opacity: 0.8 })
      ));
    }

    if (osculatingCircle && finiteVec(osculatingCircle.center) && finiteVec(osculatingCircle.normal) && Number.isFinite(osculatingCircle.radius)) {
      const normal = safeUnit(osculatingCircle.normal);
      if (normal && osculatingCircle.radius > 0) {
        const reference = Math.abs(normal.z) < 0.9 ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
        const axisA = new THREE.Vector3().crossVectors(reference, normal).normalize();
        const axisB = new THREE.Vector3().crossVectors(normal, axisA).normalize();
        const center = vecFrom(osculatingCircle.center);
        const points = Array.from({ length: 65 }, (_, index) => {
          const angle = Math.PI * 2 * index / 64;
          return center.clone().addScaledVector(axisA, Math.cos(angle) * osculatingCircle.radius).addScaledVector(axisB, Math.sin(angle) * osculatingCircle.radius);
        });
        visualGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xf59e0b })));
      }
    }

    for (const plane of evidencePlanes) {
      if (!finiteVec(plane.point) || !finiteVec(plane.normal)) continue;
      const normal = safeUnit(plane.normal);
      if (!normal) continue;
      const mesh = new THREE.Mesh(
        new THREE.PlaneGeometry(Math.max(0.2, frameScale * 1.5), Math.max(0.2, frameScale * 1.5)),
        new THREE.MeshBasicMaterial({ color: plane.color, transparent: true, opacity: 0.14, side: THREE.DoubleSide, depthWrite: false })
      );
      mesh.position.copy(vecFrom(plane.point));
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
      visualGroup.add(mesh);
    }

    const addGlyphSegment = (origin: THREE.Vector3, direction: CurveViewerVec3 | null | undefined, color: THREE.Color) => {
      const dir = safeUnit(direction);
      if (!dir) return;
      const tip = origin.clone().addScaledVector(dir, Math.max(1e-6, frameScale));
      const geometry = new THREE.BufferGeometry().setFromPoints([origin, tip]);
      const line = new THREE.Line(
        geometry,
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: 0.85,
        })
      );
      visualGroup.add(line);
      fitPoints.push(tip);
    };

    for (const glyph of frameGlyphs) {
      if (!finiteVec(glyph.point)) continue;
      const origin = vecFrom(glyph.point);
      fitPoints.push(origin.clone());
      if (showTangent) addGlyphSegment(origin, glyph.tangent, TANGENT_COLOR);
      if (showNormal) addGlyphSegment(origin, glyph.normal, NORMAL_COLOR);
      if (showBinormal) addGlyphSegment(origin, glyph.binormal, BINORMAL_COLOR);
    }

    if (probeGlyph && finiteVec(probeGlyph.point)) {
      const origin = vecFrom(probeGlyph.point);
      fitPoints.push(origin.clone());
      const markerGeometry = new THREE.SphereGeometry(Math.max(0.015, frameScale * 0.08), 16, 12);
      const markerMaterial = new THREE.MeshStandardMaterial({
        color: 0xf59e0b,
        emissive: 0x78350f,
        emissiveIntensity: 0.25,
      });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.copy(origin);
      visualGroup.add(marker);

      const arrowLength = Math.max(frameScale * 1.35, 0.08);
      if (showTangent) {
        const tangent = safeUnit(probeGlyph.tangent);
        if (tangent) {
          const tangentArrow = new THREE.ArrowHelper(tangent, origin, arrowLength, TANGENT_COLOR.getHex(), arrowLength * 0.25, arrowLength * 0.14);
          visualGroup.add(tangentArrow);
          fitPoints.push(origin.clone().addScaledVector(tangent, arrowLength));
        }
      }
      if (showNormal) {
        const normal = safeUnit(probeGlyph.normal);
        if (normal) {
          const normalArrow = new THREE.ArrowHelper(normal, origin, arrowLength, NORMAL_COLOR.getHex(), arrowLength * 0.25, arrowLength * 0.14);
          visualGroup.add(normalArrow);
          fitPoints.push(origin.clone().addScaledVector(normal, arrowLength));
        }
      }
      if (showBinormal) {
        const binormal = safeUnit(probeGlyph.binormal);
        if (binormal) {
          const binormalArrow = new THREE.ArrowHelper(binormal, origin, arrowLength, BINORMAL_COLOR.getHex(), arrowLength * 0.25, arrowLength * 0.14);
          visualGroup.add(binormalArrow);
          fitPoints.push(origin.clone().addScaledVector(binormal, arrowLength));
        }
      }
    }

    const fallbackRadius = 1.5;
    const fitBox = new THREE.Box3();
    if (fitPoints.length) {
      fitBox.setFromPoints(fitPoints);
    } else {
      fitBox.min.set(-1, -1, -1);
      fitBox.max.set(1, 1, 1);
    }
    const fitCenter = fitBox.getCenter(new THREE.Vector3());
    const fitSize = fitBox.getSize(new THREE.Vector3());
    const fitRadius = Math.max(fallbackRadius, fitSize.length() * 0.5);

    if (showAxes) {
      const axisHelper = new THREE.AxesHelper(fitRadius * 0.85);
      visualGroup.add(axisHelper);
    }

    const gridSize = Math.max(2, Math.ceil(fitRadius * 2.5));
    const grid = new THREE.GridHelper(gridSize, 20, 0x94a3b8, 0xcbd5e1);
    if (dimension === 2) {
      grid.rotation.x = Math.PI / 2;
    }
    if (showGrid) visualGroup.add(grid);

    camera.near = Math.max(0.001, fitRadius / 150);
    camera.far = Math.max(100, fitRadius * 80);
    camera.updateProjectionMatrix();

    const refitCamera = () => {
      if (dimension === 2) {
        camera.position.set(fitCenter.x, fitCenter.y, fitCenter.z + fitRadius * 2.6);
        camera.up.set(0, 1, 0);
      } else {
        camera.position.set(fitCenter.x + fitRadius * 1.65, fitCenter.y + fitRadius * 1.15, fitCenter.z + fitRadius * 1.45);
        camera.up.set(0, 1, 0);
      }
      controls.target.copy(fitCenter);
      camera.lookAt(fitCenter);
      controls.update();
    };
    refitCamera();

    const disposeTouchGestures = installViewerTouchGestures(renderer.domElement, {
      onDoubleTap: refitCamera,
    });
    const handleClick = (event: MouseEvent) => {
      if (!onSelectSample || !curvePoints.length) return;
      const bounds = renderer.domElement.getBoundingClientRect();
      const px = event.clientX - bounds.left;
      const py = event.clientY - bounds.top;
      let bestIndex = -1;
      let bestDistance = Number.POSITIVE_INFINITY;
      curvePoints.forEach((point, index) => {
        const projected = point.clone().project(camera);
        const x = (projected.x * 0.5 + 0.5) * bounds.width;
        const y = (-projected.y * 0.5 + 0.5) * bounds.height;
        const distance = Math.hypot(x - px, y - py);
        if (distance < bestDistance) { bestDistance = distance; bestIndex = index; }
      });
      if (bestIndex >= 0 && bestDistance <= 24) onSelectSample(bestIndex);
    };
    renderer.domElement.addEventListener("click", handleClick);

    let animationFrame = 0;
    const renderLoop = () => {
      animationFrame = window.requestAnimationFrame(renderLoop);
      controls.update();
      renderer.render(scene, camera);
    };
    renderLoop();

    const resizeObserver = new ResizeObserver(() => {
      const nextWidth = Math.max(2, host.clientWidth);
      const nextHeight = Math.max(2, host.clientHeight);
      renderer.setSize(nextWidth, nextHeight);
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
    });
    resizeObserver.observe(host);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      disposeTouchGestures();
      renderer.domElement.removeEventListener("click", handleClick);
      controls.dispose();
      disposeSceneObjects(scene);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [
    samples,
    dimension,
    closed,
    frameGlyphs,
    probeGlyph,
    showTangent,
    showNormal,
    showBinormal,
    frameScale,
    resetToken,
    showCurve,
    showSamples,
    showAxes,
    showGrid,
    curvatureComb,
    evolutePoints,
    osculatingCircle,
    evidencePlanes,
    onSelectSample,
  ]);

  return <div ref={hostRef} style={{ width: "100%", height: "100%", minHeight: 280 }} />;
};
