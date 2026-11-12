; FPV Sim installer (Inno Setup 6.7+). Built by build-installer.bat into release\FPV-Sim-Setup.exe.
; Installs for the current user (no admin prompt) into %LOCALAPPDATA%\Programs\FPV Sim, with a dark
; wizard in the game's colours, Start menu and optional desktop shortcuts, and an uninstaller.

#define AppName "FPV Sim"
#define AppVersion GetEnv("FLYSIM_VERSION")
#if AppVersion == ""
  #define AppVersion "1.0.0"
#endif
#define AppExe "FlySim.exe"
#define Site "https://guyka2212.github.io/fpv-sim/"
#define ServersSite "https://guyka2212.github.io/flysim-servers/"

[Setup]
AppId={{6F1E2D7A-3C4B-4E8F-9A10-F1A5D0C0FFEE}
AppName={#AppName}
AppVersion={#AppVersion}
AppVerName={#AppName} {#AppVersion}
AppPublisher=FPV Sim
AppPublisherURL={#Site}
AppSupportURL={#Site}
AppUpdatesURL={#Site}
AppComments=FPV drone simulator: 12 maps, 5 drones, multiplayer, VR goggles and replays.
DefaultDirName={autopf}\{#AppName}
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\..\release
OutputBaseFilename=FPV-Sim-Setup
SetupIconFile=..\electron\icon.ico
UninstallDisplayIcon={app}\{#AppExe}
UninstallDisplayName={#AppName}
Compression=lzma2/ultra64
SolidCompression=yes
LZMAUseSeparateProcess=yes
WizardStyle=modern dark includetitlebar
WizardSizePercent=120
WizardImageFile=wizard.png,wizard@2x.png
WizardSmallImageFile=small.png,small@2x.png
WizardImageBackColor=#0b0f14
WizardImageStretch=no
ShowLanguageDialog=auto
CloseApplications=yes
RestartApplications=no
VersionInfoDescription={#AppName} installer
VersionInfoProductName={#AppName}

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "hebrew"; MessagesFile: "compiler:Languages\Hebrew.isl"

[CustomMessages]
english.Tagline=Fly real FPV quads: 12 maps from a bando to Paris, five drones from a Tiny Whoop to a 7" long-range, multiplayer with your friends, VR goggles and a replay editor.
english.DesktopIcon=Put an FPV Sim shortcut on the desktop
english.LaunchNow=Fly now
english.OpenServers=Open the server website (host your own multiplayer server)
english.Controllers=Plug in your controller or radio before you start: Xbox / PlayStation pads, RC radios over USB and DJI remotes all work.
hebrew.Tagline=טיסת רחפני FPV אמיתית: 12 מפות, 5 רחפנים, משחק מרובה משתתפים, משקפי VR ועורך הקלטות.
hebrew.DesktopIcon=צור קיצור דרך בשולחן העבודה
hebrew.LaunchNow=טוס עכשיו
hebrew.OpenServers=פתח את אתר השרתים (הקמת שרת משלך)
hebrew.Controllers=חבר את השלט או הבקר לפני שמתחילים: בקרי Xbox / PlayStation, שלטי RC ב-USB ושלטי DJI.

[Messages]
english.WelcomeLabel1=Welcome to FPV Sim
english.WelcomeLabel2={cm:Tagline}%n%nThis installs FPV Sim {#AppVersion} on your computer. It takes about 450 MB.%n%n{cm:Controllers}
english.FinishedHeadingLabel=Ready for take-off
english.FinishedLabel=FPV Sim is installed. You'll find it in the Start menu.

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\..\app\FlySim\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\{#AppName}"; Filename: "{app}\{#AppExe}"; Comment: "FPV drone simulator"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#AppExe}"; Description: "{cm:LaunchNow}"; Flags: nowait postinstall skipifsilent
Filename: "{#ServersSite}"; Description: "{cm:OpenServers}"; Flags: shellexec postinstall skipifsilent unchecked nowait

[UninstallDelete]
; Settings, recordings and maps cache live in the user's app data, not here; nothing else to clean.
Type: filesandordirs; Name: "{app}\resources"
