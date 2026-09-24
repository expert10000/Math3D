import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { styles } from "../mobileAppStyles";

export const MobileWorkerPairingScanner: React.FC<{
  onCancel: () => void;
  onScanned: (value: string) => void;
}> = ({ onCancel, onScanned }) => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handleBarcode = (result: BarcodeScanningResult) => {
    if (scanned) return;
    setScanned(true);
    onScanned(result.data);
  };

  return (
    <View style={styles.pairingPanel} testID="mobile-worker-pairing-scanner">
      <Text style={styles.backendPanelTitle}>Scan desktop pairing code</Text>
      {!permission?.granted ? (
        <>
          <Text style={styles.note}>Camera access is used only to scan the temporary Math3D pairing QR code.</Text>
          <Pressable testID="mobile-worker-camera-permission" onPress={() => void requestPermission()} style={styles.primaryBtn}>
            <Text style={styles.primaryBtnText}>Allow camera</Text>
          </Pressable>
        </>
      ) : (
        <CameraView
          style={styles.pairingCamera}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={scanned ? undefined : handleBarcode}
        />
      )}
      <Text style={styles.itemMeta}>The pairing token expires automatically and is kept only for this app session.</Text>
      <Pressable onPress={onCancel} style={styles.secondaryBtn}>
        <Text style={styles.secondaryBtnText}>Cancel</Text>
      </Pressable>
    </View>
  );
};
