# M PlayO: đặt M PlayO làm app mặc định cho các đuôi video (Windows 10/11).
# Dùng Set-FTA của PS-SFTA (MIT, xem vendor/SFTA-LICENSE.txt). Cách làm giống app M-View.
# -Pairs "MPlayO.Video=.mp4;MPlayO.Video=.mov"
param([string]$Pairs)
. (Join-Path $PSScriptRoot 'vendor\SFTA.ps1')
foreach ($pair in $Pairs.Split(';')) {
  if (-not $pair) { continue }
  $prog, $ext = $pair.Split('=')
  try { Set-FTA -ProgId $prog -Extension $ext; Write-Output "OK $ext" }
  catch { Write-Output "ERR $ext $($_.Exception.Message)" }
}
