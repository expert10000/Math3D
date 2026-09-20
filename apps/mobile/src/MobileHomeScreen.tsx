import React from "react";
import { Pressable, Text, View } from "react-native";
import { type MobileAppController } from "./mobileAppController";
import { styles } from "./mobileAppStyles";

export const MobileHomeScreen: React.FC<{ model: MobileAppController }> = ({ model }) => {
  const { setTab, viewerDocument, sceneSummaries } = model;
  return (

    <View style={styles.panel}>
      <Text style={styles.panelTitle}>Your Math3D workspace</Text>
      <Text style={styles.note}>Open the current scene, browse examples, or return to a saved file.</Text>
      <Pressable onPress={() => setTab("workspace")} style={styles.primaryBtn}>
        <Text style={styles.primaryBtnText}>Open Workspace{viewerDocument ? ` · ${viewerDocument.title}` : ""}</Text>
      </Pressable>
      <View style={styles.viewerToolbarRow}>
        <Pressable onPress={() => setTab("explore")} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>Explore examples</Text>
        </Pressable>
        <Pressable onPress={() => setTab("files")} style={styles.secondaryBtn}>
          <Text style={styles.secondaryBtnText}>Saved files ({sceneSummaries.length})</Text>
        </Pressable>
      </View>
    </View>
  );
};
