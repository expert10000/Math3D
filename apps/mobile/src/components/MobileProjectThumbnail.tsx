import React from "react";
import { Text, View } from "react-native";
import type { MobileSceneThumbnail } from "../viewer/mobileSceneThumbnail";
import { styles } from "../mobileAppStyles";

const WIDTH = 76;
const HEIGHT = 58;

export const MobileProjectThumbnail: React.FC<{
  thumbnail?: MobileSceneThumbnail;
  title: string;
}> = ({ thumbnail, title }) => (
  <View style={styles.projectThumbnail} accessibilityLabel={`Preview of ${title}`}>
    <View style={[styles.projectThumbnailAxis, { left: 8, right: 8, top: HEIGHT * 0.58, transform: [{ rotateZ: "-10deg" }] }]} />
    <View style={[styles.projectThumbnailAxis, { left: WIDTH * 0.49, top: 6, width: 1, height: HEIGHT - 12 }]} />
    {thumbnail?.kind === "ready" ? thumbnail.segments.map((segment, index) => {
      const x1 = segment.x1 * WIDTH;
      const y1 = segment.y1 * HEIGHT;
      const x2 = segment.x2 * WIDTH;
      const y2 = segment.y2 * HEIGHT;
      const dx = x2 - x1;
      const dy = y2 - y1;
      const length = Math.hypot(dx, dy);
      const angle = Math.atan2(dy, dx);
      return <View
        key={`thumbnail-segment-${index}`}
        style={[
          styles.projectThumbnailSegment,
          {
            backgroundColor: segment.color,
            width: length,
            left: (x1 + x2) * 0.5 - length * 0.5,
            top: (y1 + y2) * 0.5,
            transform: [{ rotateZ: `${angle}rad` }],
          },
        ]}
      />;
    }) : (
      <Text style={styles.projectThumbnailFallback}>
        {thumbnail?.kind === "uncomputed" ? "ƒ = 0" : title.slice(0, 2).toUpperCase()}
      </Text>
    )}
  </View>
);
