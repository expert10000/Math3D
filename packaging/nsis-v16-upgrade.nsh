; Published Math3D v1.6.0 can exit with code 2, and v1.7.0 can hang, when
; their uninstallers are invoked by a silent NSIS upgrade. Scope the repair to
; either registered per-user installation at this installer's exact destination.
; The new package then replaces managed files in place and writes its own
; uninstall entry. User data lives outside INSTDIR and is never removed here.
!macro customInit
  ReadRegStr $R0 HKCU "${UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
  ${If} $R0 == "1.6.0"
  ${OrIf} $R0 == "1.7.0"
    ReadRegStr $R1 HKCU "${INSTALL_REGISTRY_KEY}" "InstallLocation"
    ${If} $R1 != ""
    ${AndIf} $R1 == $INSTDIR
    ${AndIf} ${FileExists} "$R1\Math3D.exe"
      ReadRegStr $R2 HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
      ${If} $R2 != ""
        WriteRegStr HKCU "${UNINSTALL_REGISTRY_KEY}" "Math3DPreviousUninstallString" "$R2"
        DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
        WriteRegStr HKCU "${INSTALL_REGISTRY_KEY}" "Math3DUpgradeFrom" "$R0"
        DetailPrint "Preserving the Math3D v$R0 profile during the upgrade"
      ${EndIf}
    ${EndIf}
  ${EndIf}
!macroend

!macro customInstall
  ReadRegStr $R0 HKCU "${INSTALL_REGISTRY_KEY}" "Math3DUpgradeFrom"
  ${If} $R0 == "1.6.0"
  ${OrIf} $R0 == "1.7.0"
    DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "Math3DPreviousUninstallString"
    DeleteRegValue HKCU "${INSTALL_REGISTRY_KEY}" "Math3DUpgradeFrom"
  ${EndIf}
!macroend

!macro restorePreviousUninstall
  ReadRegStr $R0 HKCU "${INSTALL_REGISTRY_KEY}" "Math3DUpgradeFrom"
  ${If} $R0 == "1.6.0"
  ${OrIf} $R0 == "1.7.0"
    ReadRegStr $R1 HKCU "${UNINSTALL_REGISTRY_KEY}" "Math3DPreviousUninstallString"
    ReadRegStr $R2 HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString"
    ${If} $R1 != ""
    ${AndIf} $R2 == ""
      WriteRegStr HKCU "${UNINSTALL_REGISTRY_KEY}" "UninstallString" "$R1"
      DeleteRegValue HKCU "${UNINSTALL_REGISTRY_KEY}" "Math3DPreviousUninstallString"
      DeleteRegValue HKCU "${INSTALL_REGISTRY_KEY}" "Math3DUpgradeFrom"
    ${EndIf}
  ${EndIf}
!macroend

!ifndef BUILD_UNINSTALLER
Function .onInstFailed
  !insertmacro restorePreviousUninstall
FunctionEnd

Function .onUserAbort
  !insertmacro restorePreviousUninstall
FunctionEnd
!endif
