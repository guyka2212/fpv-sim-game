@echo off
rem Builds the FPV Sim Android app: android-app\FlySim.apk (installs on any Android 8+ phone).
rem Double-click it or run it from cmd. Needs Node.js and Android Studio (for its SDK and Java).
rem With a phone plugged in by USB (USB debugging on) it also installs the app on the phone.
setlocal
cd /d "%~dp0.."

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get it from https://nodejs.org and run this again.
  goto :fail
)
if not exist "node_modules\three" (
  echo Installing packages...
  call npm install
  if errorlevel 1 goto :fail
)

rem Android Studio brings the Java and the SDK the build uses.
if not defined JAVA_HOME if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
if not defined ANDROID_HOME set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
if not exist "%JAVA_HOME%\bin\java.exe" (
  echo Java not found. Install Android Studio from https://developer.android.com/studio and run this again.
  goto :fail
)
if not exist "%ANDROID_HOME%\platforms" (
  echo Android SDK not found at %ANDROID_HOME%. Open Android Studio once so it downloads the SDK.
  goto :fail
)
set "SDK=%ANDROID_HOME:\=/%"
> "%~dp0local.properties" echo sdk.dir=%SDK%

echo Building the game...
call npx tsc --noEmit
if errorlevel 1 goto :fail
call npx vite build --outDir "%~dp0app\src\main\assets\www" --emptyOutDir
if errorlevel 1 goto :fail

echo Building the Android app...
rem Full paths from here on: npm's scripts can leave the folder changed.
pushd "%~dp0"
call "%~dp0gradlew.bat" assembleRelease --console=plain
set ERR=%errorlevel%
popd
if not "%ERR%"=="0" goto :fail
copy /y "%~dp0app\build\outputs\apk\release\app-release.apk" "%~dp0FlySim.apk" >nul
if errorlevel 1 goto :fail

echo.
echo Build finished: %~dp0FlySim.apk

rem Install straight away when a phone is connected with USB debugging (never on a Meta Quest,
rem which is Android too: it has the PC version for VR).
set "ADB=%ANDROID_HOME%\platform-tools\adb.exe"
if not exist "%ADB%" goto :done
"%ADB%" get-state >nul 2>nul
if errorlevel 1 goto :done
set "MODEL="
for /f "delims=" %%m in ('"%ADB%" shell getprop ro.product.model') do set "MODEL=%%m"
echo %MODEL% | findstr /i "Quest" >nul
if not errorlevel 1 (
  echo %MODEL% connected: not installing on a VR headset.
  goto :done
)
echo Installing on the connected phone (%MODEL%)...
"%ADB%" install -r "%~dp0FlySim.apk"
:done
if "%~1"=="" pause
exit /b 0

:fail
echo.
echo Build FAILED.
if "%~1"=="" pause
exit /b 1
