import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { styles } from "../mobileAppStyles";
import { prepareMobileStorageRecoveryCheck, finishMobileStorageRecoveryCheck, exportMobileStorageRecoveryCheck } from "../services/mobileSceneStorageRecoveryCheck";

export const MobileStorageRecoveryCheck = () => {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const run = async (action: "prepare" | "finish" | "export") => {
    if (busy) return;
    setBusy(true);
    try {
      if (action === "export") { await exportMobileStorageRecoveryCheck(); setMessage("Recovery report exported."); }
      else {
        const report = await (action === "prepare" ? prepareMobileStorageRecoveryCheck() : finishMobileStorageRecoveryCheck());
        const passed = report.checks.filter(check => check.passed).length;
        const ok = passed === report.checks.length && report.libraryUnchanged;
        setMessage(`${ok ? "PASS" : "FAIL"}: ${passed}/${report.checks.length} recovery checks; library ${report.libraryUnchanged ? "unchanged" : "changed"}. ${report.phase === "restart-pending" ? "Close and restart the app, then verify recovery." : "Restart recovery verified."}`);
      }
    } catch (error) { setMessage(`Recovery check: ${String((error as Error).message ?? error)}`); }
    finally { setBusy(false); }
  };
  return <View style={styles.settingRow}>
    <Text style={styles.itemMeta}>Project recovery check</Text>
    <Text style={styles.note}>Uses isolated sample projects. Your library stays intact.</Text>
    <View style={styles.viewerToolbarRow}>
      <Pressable testID="mobile-storage-recovery-prepare" disabled={busy} onPress={() => void run("prepare")} style={styles.secondaryBtn}>
        <Text style={styles.secondaryBtnText}>Prepare recovery check</Text>
      </Pressable>
      <Pressable testID="mobile-storage-recovery-finish" disabled={busy} onPress={() => void run("finish")} style={styles.secondaryBtn}>
        <Text style={styles.secondaryBtnText}>Verify after restart</Text>
      </Pressable>
      <Pressable testID="mobile-storage-recovery-export" disabled={busy} onPress={() => void run("export")} style={styles.secondaryBtn}>
        <Text style={styles.secondaryBtnText}>Export recovery report</Text>
      </Pressable>
    </View>
    <Text testID="mobile-storage-recovery-result" style={styles.note}>{busy ? "Checking recovery…" : message}</Text>
  </View>;
};
