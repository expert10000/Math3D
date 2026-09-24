import React, { useEffect, useMemo, useState } from "react";
import { Text, View } from "react-native";
import type { MobileSurfacePreview } from "../viewer/mobileSurfacePreview";
import { projectMobileSceneWireframe, type MobileProjectionOrbit } from "../viewer/mobileProjectedScene";

export const MobileProjectedScene: React.FC<{
  previews: MobileSurfacePreview[];
  orbit: MobileProjectionOrbit;
  selectedSurfaceId: string | null;
  onReady?: () => void;
}> = ({ previews, orbit, selectedSurfaceId, onReady }) => {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const lines = useMemo(() => projectMobileSceneWireframe(
    previews,
    orbit,
    size.width,
    size.height,
    selectedSurfaceId
  ), [previews, orbit.azimuth, orbit.polar, orbit.distance, orbit.targetX, orbit.targetY, orbit.targetZ, size, selectedSurfaceId]);

  useEffect(() => {
    if (size.width > 0 && size.height > 0) onReady?.();
  }, [onReady, size]);

  return (
    <View
      accessibilityLabel={`iOS compatibility renderer, ${previews.length} visible surface${previews.length === 1 ? "" : "s"}`}
      pointerEvents="none"
      style={{ flex: 1, backgroundColor: "#eaf2fa", overflow: "hidden" }}
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setSize((current) => current.width === width && current.height === height ? current : { width, height });
      }}
    >
      {lines.map((line, index) => {
        const dx = line.x2 - line.x1;
        const dy = line.y2 - line.y1;
        const length = Math.hypot(dx, dy);
        if (length < 0.4) return null;
        return <View key={index} pointerEvents="none" style={{
          position: "absolute",
          left: (line.x1 + line.x2 - length) / 2,
          top: (line.y1 + line.y2) / 2,
          width: length,
          height: line.emphasized ? 1.4 : 0.8,
          backgroundColor: line.color,
          opacity: line.emphasized ? 0.92 : 0.58,
          transform: [{ rotate: `${Math.atan2(dy, dx)}rad` }],
        }} />;
      })}
      <View pointerEvents="none" style={{ position: "absolute", right: 8, top: 8, borderRadius: 7, backgroundColor: "rgba(22,59,102,0.84)", paddingHorizontal: 7, paddingVertical: 4 }}>
        <Text style={{ color: "#ffffff", fontSize: 9, fontWeight: "700" }}>iOS projected preview</Text>
      </View>
    </View>
  );
};
