; Thêm mục "Mở bằng M PlayO (cửa sổ mới)" vào menu click phải của file video trong Windows Explorer
!macro MPlayOVerb EXT
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\MPlayONewWindow" "" "Mở bằng M PlayO (cửa sổ mới)"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\MPlayONewWindow" "Icon" "$INSTDIR\${APP_EXECUTABLE_FILENAME},0"
  WriteRegStr HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\MPlayONewWindow\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" --new-window "%1"'
!macroend
!macro MPlayOVerbRemove EXT
  DeleteRegKey HKCU "Software\Classes\SystemFileAssociations\${EXT}\shell\MPlayONewWindow"
!macroend

!macro MPlayOOpenWithRemove EXT
  DeleteRegValue HKCU "Software\Classes\${EXT}\OpenWithProgids" "MPlayO.Video"
!macroend

!macro customInstall
  !insertmacro MPlayOVerb ".mp4"
  !insertmacro MPlayOVerb ".m4v"
  !insertmacro MPlayOVerb ".mov"
  !insertmacro MPlayOVerb ".avi"
  !insertmacro MPlayOVerb ".mkv"
  !insertmacro MPlayOVerb ".webm"
  !insertmacro MPlayOVerb ".wmv"
  !insertmacro MPlayOVerb ".mpg"
  !insertmacro MPlayOVerb ".mts"
!macroend

!macro customUnInstall
  DeleteRegKey HKCU "Software\Classes\MPlayO.Video"
  DeleteRegKey HKCU "Software\Mondiro\MPlayO"
  DeleteRegValue HKCU "Software\RegisteredApplications" "M PlayO"
  DeleteRegKey HKCU "Software\Classes\Applications\${APP_EXECUTABLE_FILENAME}"
  !insertmacro MPlayOOpenWithRemove ".mp4"
  !insertmacro MPlayOOpenWithRemove ".m4v"
  !insertmacro MPlayOOpenWithRemove ".mov"
  !insertmacro MPlayOOpenWithRemove ".avi"
  !insertmacro MPlayOOpenWithRemove ".mkv"
  !insertmacro MPlayOOpenWithRemove ".webm"
  !insertmacro MPlayOOpenWithRemove ".wmv"
  !insertmacro MPlayOOpenWithRemove ".mpg"
  !insertmacro MPlayOOpenWithRemove ".mpeg"
  !insertmacro MPlayOOpenWithRemove ".mts"
  !insertmacro MPlayOOpenWithRemove ".m2ts"
  !insertmacro MPlayOVerbRemove ".mp4"
  !insertmacro MPlayOVerbRemove ".m4v"
  !insertmacro MPlayOVerbRemove ".mov"
  !insertmacro MPlayOVerbRemove ".avi"
  !insertmacro MPlayOVerbRemove ".mkv"
  !insertmacro MPlayOVerbRemove ".webm"
  !insertmacro MPlayOVerbRemove ".wmv"
  !insertmacro MPlayOVerbRemove ".mpg"
  !insertmacro MPlayOVerbRemove ".mts"
!macroend
