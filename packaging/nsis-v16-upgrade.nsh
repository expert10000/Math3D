; Published Math3D v1.6.0 has an uninstaller that can exit with code 2 when
; invoked by a silent NSIS upgrade. Scope the repair to the registered per-user
; v1.6.0 installation at the exact destination chosen for this installer.
; The new package then replaces managed files in place and writes its own
; uninstall entry. User data lives outside INSTDIR and is never removed here.
!macro customInit
  ReadRegStr $R0 HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ${If} $R0 == "1.6.0"
    ReadRegStr $R1 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
    ${If} $R1 != ""
    ${AndIf} $R1 == $INSTDIR
    ${AndIf} ${FileExists} "$R1\Math3D.exe"
      ReadRegStr $R2 HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
      ${If} $R2 != ""
        WriteRegStr HKCU "${UNINSTALL_REGISTRY_KEY}" "Math3DPreviousUninstallString" "$R2"
        DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
        WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" "Math3DUpgradeFrom" "1.6.0"
        DetailPrint "Preserving the Math3D v1.6.0 profile during the upgrade"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstall
  ReadRegStr $R0 HKCU "${INSTALL_REGISTRY_KEY}" "Math3DUpgradeFrom"
  ${If} $R0 == "1.6.0"
    DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "Math3DPreviousUninstallString"
  ${EndIf}
!macroend
