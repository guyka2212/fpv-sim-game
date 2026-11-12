# Builds the standalone FPV Sim desktop app (Electron) into ..\app, in the same layout as the
# other games-launcher apps:
#   app\DESCRIPTION.md, icon.png, cover.png, screenshot-*.png, FlySim.zip
#   app\FlySim\FlySim.exe + its runtime files   (the unzipped app, ready to run)
# Needs Node with the project's devDependencies (electron, @electron/packager).
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$app = Join-Path $root 'app'
$out = Join-Path $app 'FlySim'
Add-Type -AssemblyName System.Drawing

Write-Host '1/5 Building the game'
Push-Location $root
# Vite prints warnings on stderr; only the exit code decides success.
$ErrorActionPreference = 'Continue'
try { npm run build 2>&1 | Out-Host; if ($LASTEXITCODE -ne 0) { throw 'game build failed' } } finally { Pop-Location; $ErrorActionPreference = 'Stop' }

Write-Host '2/5 Preparing the app folder'
if (Test-Path $app) { Remove-Item $app -Recurse -Force }
New-Item -ItemType Directory -Force $app | Out-Null

Write-Host '3/5 Drawing icon and cover'
function New-Icon([int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = 'AntiAlias'
  $s = $size / 256.0
  $bg = New-Object System.Drawing.Drawing2D.GraphicsPath
  $r = 56 * $s; $w = $size - 1
  $bg.AddArc(0, 0, $r, $r, 180, 90); $bg.AddArc($w - $r, 0, $r, $r, 270, 90)
  $bg.AddArc($w - $r, $w - $r, $r, $r, 0, 90); $bg.AddArc(0, $w - $r, $r, $r, 90, 90); $bg.CloseFigure()
  $g.FillPath((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(11, 15, 20))), $bg)
  $orange = [System.Drawing.Color]::FromArgb(255, 106, 26)
  $arm = New-Object System.Drawing.Pen $orange, (22 * $s)
  $arm.StartCap = 'Round'; $arm.EndCap = 'Round'
  $a = 66 * $s; $b = 190 * $s
  $g.DrawLine($arm, $a, $a, $b, $b); $g.DrawLine($arm, $b, $a, $a, $b)
  $prop = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(232, 238, 245)), (9 * $s)
  foreach ($p in @(@($a, $a), @($b, $a), @($a, $b), @($b, $b))) {
    $pr = 42 * $s
    $g.DrawEllipse($prop, $p[0] - $pr, $p[1] - $pr, 2 * $pr, 2 * $pr)
  }
  $g.FillRectangle((New-Object System.Drawing.SolidBrush $orange), 100 * $s, 92 * $s, 56 * $s, 72 * $s)
  $g.FillEllipse((New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(11, 15, 20))), 117 * $s, 100 * $s, 22 * $s, 22 * $s)
  $g.Dispose()
  return $bmp
}
$icon = New-Icon 256
$icon.Save((Join-Path $app 'icon.png'), [System.Drawing.Imaging.ImageFormat]::Png)

# Windows .ico with PNG frames for the exe.
$sizes = 16, 24, 32, 48, 64, 128, 256
$frames = foreach ($sz in $sizes) { $m = New-Object IO.MemoryStream; (New-Icon $sz).Save($m, [System.Drawing.Imaging.ImageFormat]::Png); , $m.ToArray() }
$ico = New-Object IO.MemoryStream
$bw = New-Object IO.BinaryWriter $ico
$bw.Write([uint16]0); $bw.Write([uint16]1); $bw.Write([uint16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($i = 0; $i -lt $sizes.Count; $i++) {
  $sz = $sizes[$i]; $len = $frames[$i].Length
  $bw.Write([byte]($sz % 256)); $bw.Write([byte]($sz % 256)); $bw.Write([byte]0); $bw.Write([byte]0)
  $bw.Write([uint16]1); $bw.Write([uint16]32); $bw.Write([uint32]$len); $bw.Write([uint32]$offset)
  $offset += $len
}
foreach ($f in $frames) { $bw.Write($f) }
$bw.Flush()
$icoPath = Join-Path $PSScriptRoot 'electron\icon.ico'
[IO.File]::WriteAllBytes($icoPath, $ico.ToArray())

# Cover: the bando preview with the logo on top. Screenshots: the five map previews.
$previews = Join-Path $root 'public\previews'
$cover = New-Object System.Drawing.Bitmap 1280, 720
$g = [System.Drawing.Graphics]::FromImage($cover)
$g.SmoothingMode = 'AntiAlias'; $g.InterpolationMode = 'HighQualityBicubic'; $g.TextRenderingHint = 'AntiAliasGridFit'
$g.DrawImage([System.Drawing.Image]::FromFile((Join-Path $previews 'bando.jpg')), 0, 0, 1280, 720)
$shade = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point 900, 0), ([System.Drawing.Color]::FromArgb(235, 11, 15, 20)), ([System.Drawing.Color]::FromArgb(0, 11, 15, 20))
$g.FillRectangle($shade, 0, 0, 900, 720)
$g.DrawImage($icon, 70, 170, 150, 150)
$g.DrawString('FPV', (New-Object System.Drawing.Font 'Segoe UI', 88, ([System.Drawing.FontStyle]::Bold)), [System.Drawing.Brushes]::White, 60, 330)
$g.DrawString('SIM', (New-Object System.Drawing.Font 'Segoe UI', 88, ([System.Drawing.FontStyle]::Bold)), (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 106, 26))), 310, 330)
$dot = ' ' + [char]0x00B7 + ' '
$g.DrawString(('5 real FPV drones' + $dot + 'Quest VR' + $dot + 'DJI RC-N remotes'), (New-Object System.Drawing.Font 'Segoe UI', 24), (New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(220, 232, 238, 245))), 70, 480)
$g.Dispose()
$cover.Save((Join-Path $app 'cover.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$n = 1
foreach ($m in 'racetrack', 'house', 'town', 'mountains', 'bando') {
  $img = [System.Drawing.Image]::FromFile((Join-Path $previews "$m.jpg"))
  $img.Save((Join-Path $app "screenshot-$n.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $img.Dispose(); $n++
}

Write-Host '4/5 Building the OpenXR helper and packaging FlySim.exe'
& (Join-Path $PSScriptRoot 'xr\build-xr.ps1')
$tmp = Join-Path $env:TEMP 'flysim-pack'
if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
$ErrorActionPreference = 'Continue'
node (Join-Path $PSScriptRoot 'package.cjs') $tmp 2>&1 | Out-Host
$code = $LASTEXITCODE
$ErrorActionPreference = 'Stop'
if ($code -ne 0) { throw 'packaging failed' }
Move-Item (Join-Path $tmp 'FlySim-win32-x64') $out
Remove-Item $tmp -Recurse -Force
Copy-Item (Join-Path $PSScriptRoot 'DESCRIPTION.md') $app

Write-Host '5/5 Packing FlySim.zip'
Compress-Archive -Path $out -DestinationPath (Join-Path $app 'FlySim.zip') -CompressionLevel Optimal
Write-Host "Done: $app"
