import React, { useState } from "react";
import { Image, Pressable, Text, View, useWindowDimensions } from "react-native";
import { getGraph2DPresetCatalog } from "@math3d/core";
import { mobileGraphGalleryAssets } from "./data/mobileGraphGalleryAssets";
import type { MobileAppController } from "./mobileAppController";
import { styles } from "./mobileAppStyles";

// Reviewed, bundled previews only: one mounted image, no autoplay, network fetch or tracking.
const featured = getGraph2DPresetCatalog().entries.filter(item => item.featuredOrder !== null)
  .sort((a, b) => (a.featuredOrder ?? 0) - (b.featuredOrder ?? 0));

export const MobileGraphShowcase: React.FC<{ model: MobileAppController }> = ({ model }) => {
  const [index, setIndex] = useState(0), [busy, setBusy] = useState(false);
  const { width, fontScale } = useWindowDimensions();
  const item = featured[index];
  if (!item) return null;
  const imageWidth = Math.min(520, Math.max(180, width - 64));
  return <View style={styles.panel} accessibilityLabel="Featured Graph showcase" testID="mobile-featured-graph-showcase">
    <Text style={styles.panelTitle}>Featured Graphs</Text>
    <Text style={styles.note}>Manually browse offline examples. Opening preserves your current project.</Text>
    {mobileGraphGalleryAssets[item.id] && <Image source={mobileGraphGalleryAssets[item.id]}
      accessibilityLabel={`${item.title} graph preview`} resizeMode="contain"
      style={{ width: imageWidth, height: Math.min(260, imageWidth * 9 / 16), alignSelf: "center" }} />}
    <Text accessibilityRole="header" style={styles.itemTitle}>{item.title}</Text>
    <Text style={styles.itemMeta}>{item.description}</Text>
    <Text style={styles.itemMeta}>{index + 1} of {featured.length} · {item.category} · {item.attribution.author}</Text>
    <View style={[styles.viewerToolbarRow, { flexWrap: fontScale > 1.3 || width < 430 ? "wrap" : "nowrap" }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="Previous featured Graph" testID="mobile-featured-previous"
        onPress={() => setIndex(current => (current - 1 + featured.length) % featured.length)} style={styles.secondaryBtn}>
        <Text style={styles.secondaryBtnText}>Previous</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open featured Graph ${item.title}`} testID="mobile-featured-open"
        disabled={busy} onPress={() => { setBusy(true); void model.openGraphGalleryPreset(item).finally(() => setBusy(false)); }} style={styles.primaryBtn}>
        <Text style={styles.primaryBtnText}>{busy ? "Opening…" : "Open Graph"}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="Next featured Graph" testID="mobile-featured-next"
        onPress={() => setIndex(current => (current + 1) % featured.length)} style={styles.secondaryBtn}>
        <Text style={styles.secondaryBtnText}>Next</Text>
      </Pressable>
    </View>
  </View>;
};
