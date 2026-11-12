@echo off
rem Builds the Windows installer release\FPV-Sim-Setup.exe from the desktop app.
rem Builds the app first (build-app.bat) unless "noapp" is given. Needs Inno Setup 6.7+
rem (winget install JRSoftware.InnoSetup).
setlocal
cd /d "%~dp0"
if /i not "%~1"=="noapp" (
  call "%~dp0build-app.bat" nopause
  if errorlevel 1 goto :fail
)
if not exist "%~dp0app\FlySim\FlySim.exe" (
  echo app\FlySim\FlySim.exe is missing: run build-app.bat first.
  goto :fail
)
set "ISCC=%LOCALAPPDATA%\Programs\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" set "ISCC=%ProgramFiles(x86)%\Inno Setup 6\ISCC.exe"
if not exist "%ISCC%" (
  echo Inno Setup 6 not found. Install it:  winget install JRSoftware.InnoSetup
  goto :fail
)
for /f "delims=" %%v in ('node -p "require('./package.json').version"') do set "FLYSIM_VERSION=%%v"
echo Building the installer for FPV Sim %FLYSIM_VERSION%...
"%ISCC%" /Q "%~dp0desktop\installer\FlySim.iss"
if errorlevel 1 goto :fail
echo.
echo Installer: %~dp0release\FPV-Sim-Setup.exe
if "%~1"=="" pause
exit /b 0

:fail
echo.
echo Installer build FAILED.
if "%~1"=="" pause
exit /b 1
