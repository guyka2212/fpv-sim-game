# Compiles FlySimXR.exe into desktop\xr\out\xr with the OpenXR loader next to it
# (the folder is named "xr" so the packager puts it at resources\xr in the app).
# The loader (Khronos OpenXR Loader, Apache-2.0) is taken from the VrFsim build on this PC,
# or from desktop\xr\openxr_loader.dll if you put one there.
$ErrorActionPreference = 'Stop'
$bin = Join-Path $PSScriptRoot 'out\xr'
New-Item -ItemType Directory -Force $bin | Out-Null

$csc = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $csc /nologo /codepage:65001 /target:exe /platform:x64 /optimize+ /out:"$bin\FlySimXR.exe" (Join-Path $PSScriptRoot 'FlySimXR.cs') | Out-Host
if ($LASTEXITCODE -ne 0) { throw 'FlySimXR compile failed' }

$candidates = @(
  (Join-Path $PSScriptRoot 'openxr_loader.dll'),
  'C:\Users\User\Documents\VrFsim\Fully-Vr\VrFsim\Builds\VrFsim\VrFsim_Data\Plugins\x86_64\openxr_loader.dll'
)
$loader = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $loader) { throw 'openxr_loader.dll not found (put a 64-bit one in desktop\xr)' }
Copy-Item $loader (Join-Path $bin 'openxr_loader.dll') -Force
Write-Host "FlySimXR built: $bin (loader from $loader)"
