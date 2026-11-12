@echo off
rem Builds the FPV Sim desktop app into the "app" folder (FlySim\FlySim.exe + FlySim.zip).
rem Double-click it or run it from cmd. Needs Node.js; installs the project's packages if missing.
setlocal
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get it from https://nodejs.org and run this again.
  goto :fail
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo Installing packages...
  call npm install
  if errorlevel 1 goto :fail
)

rem Bypass applies to this one run only; it does not change the PC's PowerShell policy.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0desktop\build.ps1"
if errorlevel 1 goto :fail

echo.
echo Build finished: %~dp0app\FlySim\FlySim.exe
if "%~1"=="" pause
exit /b 0

:fail
echo.
echo Build FAILED.
if "%~1"=="" pause
exit /b 1
