!ifndef BUILD_UNINSTALLER
!include "LogicLib.nsh"
!include "WordFunc.nsh"

!define LMH_INSTALL_REGISTRY_KEY "Software\\${APP_GUID}"
!define LMH_UNINSTALL_REGISTRY_KEY "Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\${UNINSTALL_APP_KEY}"

Var /GLOBAL LMHExistingVersion
Var /GLOBAL LMHExistingLocation
Var /GLOBAL LMHExistingScope
Var /GLOBAL LMHExistingUninstall
Var /GLOBAL LMHExistingQuietUninstall

!macro customInit
  Call LmhHandleExistingInstall
!macroend

Function LmhReadExistingInstall
  StrCpy $LMHExistingVersion ""
  StrCpy $LMHExistingLocation ""
  StrCpy $LMHExistingScope ""
  StrCpy $LMHExistingUninstall ""
  StrCpy $LMHExistingQuietUninstall ""

  ReadRegStr $LMHExistingLocation HKLM "${LMH_INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $LMHExistingLocation != ""
    StrCpy $LMHExistingScope "all-users"
    ReadRegStr $LMHExistingVersion HKLM "${LMH_UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ReadRegStr $LMHExistingUninstall HKLM "${LMH_UNINSTALL_REGISTRY_KEY}" "UninstallString"
    ReadRegStr $LMHExistingQuietUninstall HKLM "${LMH_UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
    Push "found"
    Return
  ${EndIf}

  ReadRegStr $LMHExistingLocation HKCU "${LMH_INSTALL_REGISTRY_KEY}" "InstallLocation"
  ${If} $LMHExistingLocation != ""
    StrCpy $LMHExistingScope "current-user"
    ReadRegStr $LMHExistingVersion HKCU "${LMH_UNINSTALL_REGISTRY_KEY}" "DisplayVersion"
    ReadRegStr $LMHExistingUninstall HKCU "${LMH_UNINSTALL_REGISTRY_KEY}" "UninstallString"
    ReadRegStr $LMHExistingQuietUninstall HKCU "${LMH_UNINSTALL_REGISTRY_KEY}" "QuietUninstallString"
    Push "found"
    Return
  ${EndIf}

  Push "missing"
FunctionEnd

Function LmhRunExistingUninstaller
  StrCpy $0 "$LMHExistingQuietUninstall"
  ${If} $0 == ""
    StrCpy $0 "$LMHExistingUninstall"
  ${EndIf}

  ${If} $0 == ""
    Push "missing"
    Return
  ${EndIf}

  ${If} $LMHExistingQuietUninstall == ""
    StrCpy $0 '$0 /S'
  ${EndIf}

  ${If} $LMHExistingLocation != ""
    ExecWait '$0 _?=$LMHExistingLocation' $1
    ${If} $1 == 0
      Push "ok"
      Return
    ${EndIf}
  ${EndIf}

  ExecWait '$0' $1
  ${If} $1 == 0
    Push "ok"
  ${Else}
    Push "fail"
  ${EndIf}
FunctionEnd

Function LmhHandleExistingInstall
  Call LmhReadExistingInstall
  Pop $0
  ${If} $0 != "found"
    Return
  ${EndIf}

  StrCpy $1 "$LMHExistingVersion"
  ${If} $1 == ""
    StrCpy $1 "unknown"
  ${EndIf}

  StrCpy $4 "-1"
  StrCpy $3 "Version status: unknown."
  ${If} $1 != "unknown"
    ${VersionCompare} "$1" "${VERSION}" $4
    ${If} $4 == 0
      StrCpy $3 "Version status: installed and installer versions are the same."
    ${ElseIf} $4 == 1
      StrCpy $3 "Version status: installed version is newer than this installer (possible downgrade)."
    ${ElseIf} $4 == 2
      StrCpy $3 "Version status: this installer is newer than the installed version."
    ${Else}
      StrCpy $3 "Version status: unable to compare versions."
    ${EndIf}
  ${EndIf}

  MessageBox MB_ICONQUESTION|MB_YESNOCANCEL "Let's Make History is already installed.$\r$\n$\r$\nInstalled version: $1 ($LMHExistingScope)$\r$\nInstaller version: ${VERSION}$\r$\n$\r$\n$3$\r$\n$\r$\nYes = Reinstall / Update$\r$\nNo = More options$\r$\nCancel = Exit setup" /SD IDCANCEL IDYES LmhReinstall IDNO LmhMoreOptions
  Goto LmhAbort

LmhMoreOptions:
  MessageBox MB_ICONQUESTION|MB_YESNOCANCEL "Choose an action.$\r$\n$\r$\nYes = Restore (uninstall then reinstall)$\r$\nNo = Uninstall only$\r$\nCancel = Exit setup" /SD IDCANCEL IDYES LmhRestore IDNO LmhUninstallOnly
  Goto LmhAbort

LmhReinstall:
  ${If} $4 == 1
    MessageBox MB_ICONEXCLAMATION|MB_YESNO "The installed version ($1) is newer than this installer (${VERSION}).$\r$\n$\r$\nContinue anyway and downgrade?" /SD IDNO IDYES LmhDowngradeConfirmed
    Goto LmhAbort
  ${EndIf}

LmhDowngradeConfirmed:
  Return

LmhRestore:
  Call LmhRunExistingUninstaller
  Pop $2
  ${If} $2 != "ok"
    MessageBox MB_ICONSTOP "Restore failed because the existing install could not be removed."
    Quit
  ${EndIf}
  Return

LmhUninstallOnly:
  Call LmhRunExistingUninstaller
  Pop $2
  ${If} $2 == "ok"
    MessageBox MB_ICONINFORMATION "Uninstall completed. Setup will now exit."
  ${Else}
    MessageBox MB_ICONSTOP "Uninstall failed. Setup will now exit."
  ${EndIf}
  Quit

LmhAbort:
  Quit
FunctionEnd
!endif
