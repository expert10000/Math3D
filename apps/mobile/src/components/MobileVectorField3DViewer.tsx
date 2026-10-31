import React, { useEffect, useMemo, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View, type GestureResponderEvent } from "react-native";
import { Canvas, useFrame, useThree } from "@react-three/fiber/native";
import type { VectorField3DArrowArtifact, VectorField3DDocument } from "@math3d/core";
import { buildMobileVectorField3DGeometry } from "../models/mobileVectorField3DGeometry";
import { sampleMobileVectorField3DExpressions, verifyMobileVectorField3DBundle } from "../models/mobileVectorField3D";
import { mobileVectorField3DDirectoryReader, pickMobileVectorField3DBundle } from "../services/mobileVectorField3DBundle";

type Orbit = { azimuth: number; polar: number; distance: number };
const initialOrbit: Orbit = { azimuth: .8, polar: 1.1, distance: 3.8 };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const now = () => typeof performance !== "undefined" ? performance.now() : Date.now();

const CameraRig: React.FC<{ orbit: Orbit }> = ({ orbit }) => {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    camera.position.set(orbit.distance * Math.sin(orbit.polar) * Math.cos(orbit.azimuth),
      orbit.distance * Math.sin(orbit.polar) * Math.sin(orbit.azimuth),
      orbit.distance * Math.cos(orbit.polar));
    camera.up.set(0, 0, 1);
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate, orbit]);
  return null;
};

const FirstFrame: React.FC<{ serial: number; onReady: (serial: number) => void }> = ({ serial, onReady }) => {
  const sent = useRef(false);
  useFrame(() => {
    if (sent.current) return;
    sent.current = true;
    requestAnimationFrame(() => onReady(serial));
  });
  return null;
};

export const MobileVectorField3DViewer: React.FC<{ document: VectorField3DDocument }> = ({ document }) => {
  const [artifact, setArtifact] = useState<VectorField3DArrowArtifact | null>(null);
  const [status, setStatus] = useState("No arrows shown. Verify this source to render a fresh preview.");
  const [busy, setBusy] = useState(false);
  const [orbit, setOrbit] = useState<Orbit>(initialOrbit);
  const [serial, setSerial] = useState(0);
  const [firstFrameMs, setFirstFrameMs] = useState<number | null>(null);
  const directory = useRef<string | null>(null);
  const requestId = useRef(0);
  const startedAt = useRef(0);
  const touch = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => () => { requestId.current++; }, []);
  useEffect(() => { requestId.current++; setArtifact(null); directory.current = null;
    setStatus("No arrows shown. Verify this source to render a fresh preview.");
    setFirstFrameMs(null); }, [document.identity.id, document.identity.revision, document.identity.structuralHash]);
  const geometry = useMemo(() => artifact && artifact.source.documentId === document.identity.id &&
    artifact.source.revision === document.identity.revision &&
    artifact.source.structuralHash === document.identity.structuralHash ?
      buildMobileVectorField3DGeometry(document, artifact) : null,
    [document, artifact]);
  const render = async (chooseDirectory = false) => {
    const token = ++requestId.current;
    setArtifact(null); setFirstFrameMs(null); setBusy(true);
    setStatus("Verifying source and preparing bounded arrows…");
    try {
      let fresh: VectorField3DArrowArtifact;
      if (document.source.field.kind === "expressions") {
        startedAt.current = now();
        fresh = sampleMobileVectorField3DExpressions(document);
      }
      else {
        if (!directory.current || chooseDirectory) directory.current = await pickMobileVectorField3DBundle();
        if (!directory.current) throw new TypeError("Choose a local .sscene bundle to verify.");
        startedAt.current = now();
        fresh = await verifyMobileVectorField3DBundle(document,
          mobileVectorField3DDirectoryReader(directory.current));
      }
      if (token !== requestId.current) return;
      setArtifact(fresh); setSerial(token);
      setStatus(`Verified revision ${fresh.source.revision}; ${fresh.accepted} of ${fresh.evaluated} samples, ` +
        `${fresh.stationary} stationary, ${fresh.rejected} rejected. Rendering up to 512 arrows.`);
    } catch (error) {
      if (token !== requestId.current) return;
      setStatus(`No arrows shown. ${error instanceof Error ? error.message : String(error)}`);
    } finally { if (token === requestId.current) setBusy(false); }
  };
  const move = (azimuth: number, polar: number, zoom = 1) => setOrbit(current => ({
    azimuth: current.azimuth + azimuth, polar: clamp(current.polar + polar, .1, Math.PI - .1),
    distance: clamp(current.distance * zoom, 1.8, 14),
  }));
  const touchPoint = (event: GestureResponderEvent) => ({ x: event.nativeEvent.pageX, y: event.nativeEvent.pageY });
  const shown = geometry?.shown ?? 0;
  return <View testID="mobile-vector-field3d-viewer" style={local.container}>
    <Text accessibilityRole="header" style={local.title}>{document.metadata.title} · 3D vector field</Text>
    <Text style={local.note}>Read-only Project document · {document.source.field.kind === "expressions" ?
      "saved expressions" : "external scientific bundle"} · revision {document.identity.revision}.</Text>
    <Text style={local.note}>Domain {document.source.axes.map(axis =>
      `${axis.label} ${axis.min}…${axis.max} ${axis.unit}`).join(" · ")}. Vector units {document.source.axes.map(axis =>
      `${axis.unit}/${document.source.timeUnit}`).join(", ")}.</Text>
    {document.source.field.kind === "scientific-bundle" && <Text style={local.note}>
      Saved source {document.source.field.references[0].sceneId}/{document.source.field.references[0].datasetId} ·
      {" "}components {document.source.field.references.map(item => item.component).join(", ")}.
      Choose its local .sscene folder; all declared bytes and all three components are checked on every render.
    </Text>}
    <View style={local.actions}>
      <Pressable testID="mobile-vector-field3d-render" accessibilityRole="button" disabled={busy}
        accessibilityState={{ disabled: busy }} style={local.button} onPress={() => void render()}>
        <Text style={local.buttonText}>{busy ? "Verifying…" : "Verify and render arrows"}</Text>
      </Pressable>
      {document.source.field.kind === "scientific-bundle" && <Pressable testID="mobile-vector-field3d-choose-bundle"
        accessibilityRole="button" disabled={busy} accessibilityState={{ disabled: busy }}
        style={local.button} onPress={() => void render(true)}><Text style={local.buttonText}>Choose another bundle</Text></Pressable>}
    </View>
    <Text testID="mobile-vector-field3d-status" accessibilityRole={artifact ? "text" : "alert"}
      accessibilityLiveRegion="polite" style={local.note}>{status}</Text>
    {artifact && geometry && Platform.OS === "android" && <>
      <View style={local.viewport} onStartShouldSetResponder={() => true} onMoveShouldSetResponder={() => true}
        onResponderGrant={event => { touch.current = touchPoint(event); }}
        onResponderMove={event => { const next = touchPoint(event), previous = touch.current;
          if (previous) move((next.x - previous.x) * .008, (next.y - previous.y) * .008);
          touch.current = next; }} onResponderRelease={() => { touch.current = null; }}>
        <Canvas style={local.canvas} camera={{ position: [2.5, 2.5, 2.5], fov: 48, near: .01, far: 100 }}
          gl={{ antialias: true }} frameloop="demand">
          <lineSegments>
            <bufferGeometry>
              <bufferAttribute attach="attributes-position" args={[geometry.positions, 3]} />
              <bufferAttribute attach="attributes-color" args={[geometry.colors, 3]} />
            </bufferGeometry>
            <lineBasicMaterial vertexColors toneMapped={false} />
          </lineSegments>
          <points>
            <bufferGeometry><bufferAttribute attach="attributes-position" args={[geometry.stationary, 3]} /></bufferGeometry>
            <pointsMaterial color="#f8b44c" size={.055} sizeAttenuation />
          </points>
          <axesHelper args={[1.15]} />
          <CameraRig orbit={orbit} />
          <FirstFrame key={serial} serial={serial} onReady={ready => {
            if (ready === requestId.current) setFirstFrameMs(Math.round(now() - startedAt.current)); }} />
        </Canvas>
      </View>
      <Text testID="mobile-vector-field3d-render-summary" style={local.note} accessibilityLiveRegion="polite">
        {shown} displayed of {artifact.accepted} verified arrows · density {artifact.density.join(" × ")} ·
        {" "}color by {artifact.colorBy}. {firstFrameMs === null ? "Preparing first frame…" :
          `First frame after ${document.source.field.kind === "expressions" ? "Verify" : "folder selection"}: ${firstFrameMs} ms including source verification.`}
      </Text>
      <View style={local.actions}>
        {([ ["Left", -.25, 0, 1], ["Right", .25, 0, 1], ["Up", 0, -.2, 1],
          ["Down", 0, .2, 1], ["Zoom in", 0, 0, .8], ["Zoom out", 0, 0, 1.25] ] as const)
          .map(([label, azimuth, polar, zoom]) => <Pressable key={label} accessibilityRole="button"
            accessibilityLabel={label} style={local.cameraButton} onPress={() => move(azimuth, polar, zoom)}>
            <Text style={local.buttonText}>{label}</Text></Pressable>)}
        <Pressable accessibilityRole="button" accessibilityLabel="Reset camera" style={local.cameraButton}
          onPress={() => setOrbit({ ...initialOrbit })}><Text style={local.buttonText}>Reset</Text></Pressable>
      </View>
      <Text accessibilityLiveRegion="polite" style={local.note}>Camera azimuth {Math.round(orbit.azimuth * 180 / Math.PI)}°, polar
        {" "}{Math.round(orbit.polar * 180 / Math.PI)}°, distance {orbit.distance.toFixed(2)}. Drag to orbit.</Text>
    </>}
    {artifact && Platform.OS !== "android" && <Text style={local.note}>Native 3D arrows are available on Android.</Text>}
    <Text style={local.note}>Mobile trajectories are deferred until the Android renderer passes device measurement.</Text>
  </View>;
};

const local = StyleSheet.create({
  container: { borderWidth: 1, borderColor: "#c8d8ea", borderRadius: 12, padding: 12, gap: 8, backgroundColor: "#f6faff" },
  title: { color: "#173454", fontSize: 17, fontWeight: "700" },
  note: { color: "#344b63", fontSize: 13, lineHeight: 19 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  button: { backgroundColor: "#163b66", borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, justifyContent: "center" },
  cameraButton: { backgroundColor: "#31567b", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, minHeight: 44, justifyContent: "center" },
  buttonText: { color: "#ffffff", fontSize: 13, fontWeight: "600" },
  viewport: { height: 310, borderRadius: 10, overflow: "hidden", backgroundColor: "#0d1726" },
  canvas: { flex: 1 },
});
