# FPV Sim

Browser FPV drone simulator with a 1 kHz flight model, 25 drones (five starters, twenty to unlock) and twelve maps. All 3D models were built procedurally in Blender (scripts in `blender/`) and exported to `public/models/`.

```
npm install
npm run dev      # http://localhost:5173
npm test         # physics / flight-controller tests
```

**Open source (MIT).** Download the game: https://guyka2212.github.io/fpv-sim/ · Make plugins: https://guyka2212.github.io/fpv-sim/plugins.html · Host a server: https://guyka2212.github.io/flysim-servers/ (server code: [guyka2212/flysim-servers](https://github.com/guyka2212/flysim-servers)). Builds of the Windows app and APK aren't in this repo: run `build-installer.bat` and `android-appuild.bat` (see below), or get them from the [releases](https://github.com/guyka2212/fpv-sim/releases). Accounts and the Flight Path use a Supabase project; its key in `src/progress/account.ts` is the public (publishable) one, and the database's access rules are in `supabase/migrations/`.

## Make your own version

You're welcome to change anything and release your own app (MIT license: keep the `LICENSE`
file with its copyright line). Fork this repo, then give your copy its own identity so it
installs next to FPV Sim instead of over it, and uses your own accounts database:

| What | Where | Why |
|---|---|---|
| Android app id | `android-app/app/build.gradle.kts`: `applicationId` (and `namespace`) | Same id = Android treats it as FPV Sim and replaces it |
| Android app name | `android-app/app/src/main/AndroidManifest.xml`: `android:label` | Name under the icon |
| Windows app name | `desktop/electron/package.json`: `name`, `productName` | Window title, install folder, saved data |
| Installer | `desktop/installer/FlySim.iss`: `AppName`, `Site`, `ServersSite`, and a **new** `AppId` GUID | Same AppId = the installer upgrades FPV Sim instead of adding yours |
| Accounts / Flight Path | `src/progress/account.ts`: `SUPABASE_URL`, `SUPABASE_KEY` | Make a free Supabase project, run `supabase/migrations/` on it, put its URL and publishable key here |
| Links | `index.html` and `src/net/multiplayer.ts` (server site), `src/plugins/pluginsTab.ts` (plugin docs) | Point them at your own sites, or keep them |
| Look | `public/` (icons, models), `src/style.css`, `desktop/installer/*.png` | Your own branding |

Multiplayer servers come from [guyka2212/flysim-servers](https://github.com/guyka2212/flysim-servers);
copies of the game can join the same servers as long as the network protocol (`PROTOCOL` in
`src/net/client.ts`) matches.

## Drones and maps

| Drone | Based on | Home map |
|---|---|---|
| Freestyle 5" | 650 g, 2207 1850KV, 6S, 5.1" tri-blades, 10:1 T/W | The Bando (abandoned building + skate park) |
| Racer 5" | 480 g, 2306 1950KV, 6S, 13:1 T/W, 42° uptilt | Race Field (12 gates, dive gate, ladder, lap timer) |
| Tiny Whoop 65 | 28 g, 0802 19000KV, 1S, ducted | The House (furnished rooms, 6 hoops) |
| Cinewhoop 3" | 400 g with GoPro, 1506, 6S, ducted | Old Town (streets, church tower, park) |
| Long Range 7" | 950 g, 2807 1300KV, 6S Li-ion, GPS | Alpine Valley (1.8 km terrain, lake, forest) |

Extra maps:

| Map | Built for | What's there |
|---|---|---|
| Skylight Mall | Freestyle 5" | Three-storey mall with the roof open over a 112 m atrium: sky bridges, galleries with glass rails, escalators, a fountain court, palms, hanging hoops and shops you can fly into. Through the east entrance is the round **Dome Court**: its roof is a 104 m open lattice ball resting on the outer wall, so it covers the whole court. It is open at the top, so you can fly up from the pool, through the glowing hoop in its middle and out into the sky. |
| Grand Prix Circuit | Racer 5" | 2.1 km road course with kerbs, gravel traps, pit lane and garages, grandstands, a start gantry and a bridge. 10 F1 cars race laps. |
| Speedway | Long Range 7" | 1.7 km oval with 24° banked turns, SAFER wall and catch fence, a huge grandstand and an infield. 16 stock cars race in a drafting pack. |
| Crystal Lake | Freestyle 5" | 500 m summer lake in forested hills: an island with a lighthouse, a long pier with moored boats, a boathouse on stilts open at both ends, sailboats, a swim platform with a diving tower, lakeside cabins and a stone arch bridge over the outlet river. |
| Hollywood Hills | Freestyle 5" | Palm-lined boulevard with a walk of stars, a movie palace you can fly into (lobby, seats, screen), a round tower, a studio lot with sound stages open at both ends, a backlot of fake fronts and a water tower. In the hills behind: the giant hillside sign on its scaffold, cliff houses on stilts with pools and a domed observatory. |
| Paris | Freestyle 5" | A 200 m iron lattice tower (dive between the legs, through the arches and up the shaft), the Seine with three stone arch bridges to fly under and tour boats, the triumphal arch on its star roundabout with eight tree-lined avenues, Haussmann blocks with zinc mansard roofs and a palace courtyard with a glass pyramid. |
| Stadium | Freestyle 5" | Empty football stadium: two tiers of seats with an open slot between them that leads out under the upper deck, open corners, a ring roof on cantilever masts with a gap above the top row, floodlights, giant screens behind the goals and car parks outside. |

Any drone can fly any map.

**Water.** Lakes, rivers, ponds, pools and fountains are real water, not a hard floor. Touch it with the props and the quad drowns: the motors cut out, it splashes in, sinks slowly to the bottom with heavy water drag, the FPV view turns murky and the video dies within two seconds (DROWNED; reset with R / B). Flying low over water, the prop wash churns the surface under the quad, sends rings running out and blows spray sideways, stronger the lower you are and the harder you push. The code is `src/maps/water.ts`: any mesh whose material starts with `water` is left out of the collision world.

**Race cars.** On the Grand Prix Circuit and the Speedway the cars race for real.
- They brake for corners, draft and pull out to pass.
- They make engine noise that rises and falls as they pass you (Doppler).
- You can chase them, hit them (an armed hit at speed is a crash), or land on a stock car's roof and ride along.
- **Settings → Flight → Race car speed** sets their pace, from 30% to 100% of real race speed (default 70%, so a 5" quad can keep up).

## On-screen display

**Settings → Camera → On-screen display** has two styles. Both also show in VR.

- **Real FPV** (default): a Betaflight OSD as it looks in DJI or Walksnail goggles, in white text with a black outline.
  - Top: pack and cell voltage (left), flight timer (centre), mAh and amps (right).
  - Centre: the crosshair, the artificial horizon and the side bars.
  - Bottom: LQ and throttle (left); warnings such as DISARMED, LOW BATTERY and LQ LOW, plus the flight mode ACRO, ANGL or HOR (centre); altitude, speed and home distance with an arrow (right).
- **Stick overlay** (both styles, on by default; Settings → Camera → Stick overlay): two boxes at the bottom show where the sticks are. The left one is yaw and throttle, the right one is roll and pitch.
- **Iron Man style**: a helmet HUD.
  - Centre: horizon and pitch ladder that line up with the real horizon in the camera, a roll arc, and a flight-path marker.
  - Tapes: heading across the top, speed on the left, and height above ground on the right.
  - Readouts: pitch, roll and yaw, throttle, motor RPM and G-force.
  - Corner panels: DRONE, MAP, POWER and LINK.

## Map and teleport

Press **M** (gamepad: Back / Select / View, or **Map / teleport** in the pause menu) for a top-down map of where you are, drawn from the map itself, with your drone as an arrow. Click anywhere to drop the drone there (on a roof, a bridge, the ground; not into water), or pick one of the named spots, such as the tower top deck in Paris, the hillside sign in Hollywood or the lighthouse island. Spots are listed per map in `SPOTS` in `src/maps/maps.ts`.

## Recording and the replay editor

Press **V** while flying (or **Start recording** in the pause menu) to record, and **V** again to stop; the game asks for a name. The recording keeps the flight itself (position, attitude, motor speeds, sticks and OSD values, 60 times a second), not the screen, so a replay always shows a clean picture: no static or breakup where the video link was weak, and no underwater blackout.

The **Records** tab lists every recording by name. **Edit** opens the replay editor:

- Play, pause, jump 5 s and scrub on the timeline.
- Cut parts out: **Mark start**, move to the end of the part, **Cut to here**. Cut parts show striped on the timeline and are skipped; click one in the list to put it back.
- **OSD / UI** on or off, and the camera: FPV, chase or line of sight.
- Drone sound on or off with a volume, and music: add any audio file, with its own volume. The music runs from the start of the edited video.
- Player names: for multiplayer later (shown, not usable yet).
- **Export video**: the edited flight plays once in real time and is saved as MP4 (WebM where MP4 is not available), with the OSD and sound you chose. The desktop app saves to `Videos\FPV Sim` and opens the folder; the Android app saves to `Movies/FPV Sim`.

Edits save as you go. Recordings live in the browser's / app's own storage (IndexedDB), code in `src/replay/`.

## Accounts, the Flight Path and unlocks

Sign in (or create an account) on the **Flight Path** tab or with the chip at the top right. An account keeps your **Pilot Level** (1 to 50) and what you unlock. Signed out you fly the five starter drones and tricks don't earn XP.

- **Tricks earn XP**, in single player and multiplayer (+25% on a server): front / back flips, rolls (doubles and more score extra), power loops, Split-S, dives, 360 spins, proximity (fast and low), inverted hang time and gaps (fast under something). Chain tricks within 3 s for up to x3. Points wait 1.5 s; crash or drown before that and they're lost (BAILED). Code: `src/progress/tricks.ts`.
- **30 more drones** unlock along the way: whoops (65 mm Pro to 85 mm 2S), cinewhoops and a 3" trainer, a 2.5" micro and a 3" toothpick, freestyle from 3.5" to a 7" basher (Hybrid-X, Squashed-X, HD Heavy), racers from 3" to a 15:1 pro 5" and the Carbon Blade, long range from a sub-250 4" to a 13" endurance cruiser, 8" and 10" camera lifters, a 13" X-Class, the Gold Rush trophy (level 45) and the Titan 5" prototype at level 50. They're defined once in `src/drones/catalog.json`: the game derives the physics from it (`fromCatalog` in specs.ts) and `blender/drones/catalog.py` builds the models from it.
- **31 skins** recolour any drone's bells, props, printed parts, battery, ducts and, for the special finishes, the frame (metal and glowing finishes too). Pick one under the drone in the Drones tab. Other pilots see your skin.
- **Claim** each unlock on the Flight Path when your level reaches it ("Claim all" does the lot). Locked drones show their level; you can look at them, and they show in the 3D view, but not fly them.
- In multiplayer your **level shows next to your name** in the lobby and on your drone's name tag; signed in, your account name is your multiplayer name.

The data lives in the Supabase project **fpv-sim** (`supabase/migrations/`): `profiles` (username, XP), `rewards` (what each level unlocks), `claims` and `game_config`. Players can only read; XP and claims change through `add_xp` and `claim_reward`, which check everything on the server.

**Balance is tuned in Supabase, no game update needed.** The game loads `game_config` and `rewards` when it starts (and caches them for offline play):

| `game_config` column | Now | What it does |
| --- | --- | --- |
| `xp_base`, `xp_growth` | 3000, 1005 | XP to reach level L = xp_base (L-1) + xp_growth (L-1)^2; level 50 = 2,560,005 XP |
| `max_level` | 50 | Top level |
| `per_day_cap` | 120,000 | Most XP that counts per day (UTC). Finishing takes at least total / cap = 21.3 days |
| `per_minute_cap`, `per_call_cap` | 8,000, 5,000 | Anti-cheat limits |
| `trick_points` | JSON | Points per trick, combo step and max, multiplayer bonus, and `xp_scale` (multiplies every trick) |

To move an unlock, change its `level` in `rewards`. New drones and skins still need a game update (their models and colours ship with the game), plus a row in `rewards`. The client is `src/progress/account.ts`; its publishable key is public by design.

## Multiplayer

The **Multiplayer** tab asks for a user name the first time (change it later in Settings), then lists your servers: add one with its address, an IP like `192.168.1.20:25580` or a tunnel address like `name.gl.joinmc.link:12345`. Each shows Online / Offline, the player count and the message of the day. **Join** opens the server's lobby: who is in, the rules (collisions, visibility, names), your drone, and a chat. The owner (the name in the server's `Owner-user-name`) gets **Start**: everyone votes for a map, the most votes wins (a tie is random), and everyone flies it together. The owner can end the round for a new vote, and has a console for server commands in the lobby. **Chat:** in the lobby, and in flight press **T** to type (Enter sends, Esc closes); lines fade after ten seconds. Settings → Multiplayer → Chat switches it off.

In a round you see the other drones with their names (if the server allows), you can bump into them (`drone-collision`), the server can teleport you (`tp`), and the map / recording keys follow the server's rules. A recording made on a server keeps the other pilots too; the replay editor shows them, with a **Player names** switch.

The server and its website are in `Servers-Website/` (published as the `flysim-servers` repository with GitHub Pages): installers for Windows and Linux that download the server and, if needed, Node.js; `server.settings`, `eula.txt`, console commands, an optional admin window (`gui`), and `Tunnel.md` for playit.gg. Servers speak plain `ws://`: in a browser on `http://` the game connects directly; the desktop app relays the connection through its main process and the Android app through `NetRelay.java`, so the page itself never loads insecure content. Code: `src/net/`.

## Plugins

JavaScript modules players add in the **Plugins** tab (stored in localStorage `flysim.plugins`, started at launch). `src/plugins/host.ts` loads each one from a Blob URL with `import()`, calls its default export with the `api` object and tracks everything it adds (text, panels, menu tabs, settings sections, keys, scene objects, timers) so turning it off removes it all; 50 errors in a row switch a plugin off. Game events reach plugins through `PluginHost.emit` calls in `main.ts` (`frame`, `flightStart`, `flightEnd`, `reset`, `crash`, `trick`, `chat`, `pause`, `resume`, `tab`). Bump `API_VERSION` when the API changes incompatibly.

- Examples (also in the tab's Examples list): `examples/plugins/*.js`; types for editors: `examples/plugins/flysim-plugin.d.ts`.
- Docs: `Game-Website/plugins.html` (https://guyka2212.github.io/fpv-sim/plugins.html), with copies of the examples in `Game-Website/plugins/`. Keep them in sync with `examples/plugins/`.

## Graphics and frame rate

**Settings → Graphics & frame rate**:

- **Graphics quality**:
  - Ultra: sharpest on high-DPI screens, 4K shadows, full-quality ambient occlusion and bloom.
  - High (default): anti-aliased, full shadows, ambient occlusion and bloom.
  - Medium: lighter shadows, bloom only, no anti-aliasing.
  - Low: max FPS; no shadows or effects, 75% resolution.
- **FPS limit**: Unlimited (default), or 360 / 240 / 165 / 144 / 120 / 60. Menus and the pause screen always run at 60 to keep the GPU cool; native VR runs at up to 120.
- **VSync** (desktop app): Off (default) runs past the monitor's refresh rate for the lowest stick-to-screen delay, but may tear. On stops tearing and caps at the refresh rate. Changing it restarts the app. A browser is always capped at the refresh rate.
- **FPS counter**: top-left corner.

The scene renders into an HDR target with a 32-bit reversed depth buffer. It then goes through three steps:
- **Ambient occlusion** (GTAO): soft contact shadows in corners and under objects. It is computed from the same depth buffer, so the scene is not drawn a second time.
- **Bloom**: only lamps, signs and the sun pass its threshold, so the sky stays clear.
- **Tone mapping and grading**: a little extra saturation, contrast and warmth, plus a soft vignette.

Every surface gets a procedural 512 px texture with a matching normal map for relief. Large surfaces (grass, asphalt, concrete, tile) blend in a much larger copy of the same texture, so the repeating tile does not show. Water ripples move. Building windows are opaque and reflect the sky.

On a GTX 1650 at 1600×900 with High settings, the maps run at roughly 200–400 FPS.

Map files use lossless meshopt compression: Blender exports them plain and `blender/meshopt-pack.mjs` packs them, keeping every vertex exactly where it was (Blender's own meshopt option rounds positions to about 6 cm, which snapped window glass and trims back into their walls and made them flicker). Before export, any two parts whose surfaces lie flat on each other (closer than 6 mm, facing the same way) are pulled apart by about a centimetre so they do not flicker; `overlap_report()` in `blender/maplib.py` lists what is left.

The reversed depth buffer keeps the 4 mm to 3 km view range free of flicker without a logarithmic depth buffer, which turned off the GPU's early depth test and cost about half the frame rate. The sun's shadow map is redrawn at a fixed rate (144 Hz on High), since the drone is the only thing that moves.

## Physics

- Per-motor model: first-order spool-up with a torque limit, thrust and drag torque ∝ ω², thrust loss with inflow (climbing / fast flight), ground effect, prop wash / vortex-ring turbulence, rotor H-force drag, gyroscopic precession, yaw kick from prop acceleration.
- Rigid body with full inertia (Euler's equations), quadratic per-axis body drag, wind with gusts.
- Battery: LiPo / Li-ion discharge curves, internal resistance, voltage sag under load (less thrust when sagging or empty).
- Betaflight-style flight controller: Actual rates, rate PID with feed-forward and I-term relax, airmode mixer, Acro / Angle / Horizon.
- Contacts: sphere set per drone against a BVH of the map, with restitution, friction and crash detection by impact speed (whoops just bounce).

## Controllers

Everything goes through the browser Gamepad API. Open **Controls** in the menu, press a button on the controller so the browser sees it, check the live sticks, and run **Calibrate** if anything is off.

- **Xbox 360 / One / Series, PS4, PS5**: auto-mapped, Mode 2. A/Cross arm, B/Circle reset, X/Square camera, Y/Triangle flight mode, Start/Options menu. With the throttle stick untouched (centred) the throttle is 50%; down is 0%, up is 100%. Hold it down to arm. Controls also offers height hold (DJI-style: centre holds height) and right-trigger throttle.
- **PS3**: needs a Windows driver that exposes it as a gamepad (DsHidMini, or SCP / Sony driver). Then Calibrate.
- **PS2**: through a USB PS2 adapter; Calibrate.
- **FPV radios** (RadioMaster, TBS, FrSky, Jumper, BetaFPV, EdgeTX/OpenTX): set the radio's USB mode to Joystick (HID), Calibrate once, including the arm switch and an optional 3-position mode switch.
- **DJI FPV Remote Controller 2/3**: use its USB simulator/joystick mode, then Calibrate.
- **DJI RC-N1 / RC-N2 / RC-N3** (Neo, Mini, Air remotes): these are not USB joysticks, so the sim reads them over USB serial (Web Serial, Chrome/Edge). Install DJI Assistant 2 once for the driver, close it, plug into the remote's bottom USB-C port, then Controls → **Connect DJI remote** → pick "DJI USB VCOM For Protocol". Camera dial right = arm, left = reset. Confirmed protocol for the RC-N1; the RC-N3 is the same family but untested. If the port list is empty, Windows doesn't see the remote: check Device Manager → Ports for "DJI USB VCOM For Protocol" (needs the DJI Assistant 2 driver, the remote switched on, and a data USB-C cable in its bottom port).
- **Arming**: throttle must be in its "off" position (bottom on a radio, center or below on a spring-centred stick). Arm with A / Cross, Space, a calibrated arm switch, or Betaflight stick arming: throttle down + yaw right for 1 s. While disarmed the screen says what is blocking arming.
- **Keyboard**: W/S throttle, Shift punch, X cut, A/D yaw, arrows pitch/roll, Space arm, R reset, C camera, N flight mode, M map, V record, Esc menu. On a gamepad Back / Select / View opens the map.

Mappings are saved per controller in the browser.

### Controller only, no keyboard or mouse

Every screen works with an Xbox or PlayStation pad alone. A hint bar at the bottom shows the buttons, and moving the mouse hides the highlight again.

| Button | Menus | Flying |
|---|---|---|
| D-pad / left stick | Move the highlight | — |
| A / Cross | Select; steps through a list | Arm / disarm (throttle down) |
| B / Circle | Back (to the tab bar); resume from pause | Reset |
| ◀ ▶ on a list or slider | Change the value (hold to go faster) | — |
| LB / RB | Previous / next tab | — |
| Y / Triangle | VR (Quest) | Flight mode |
| Start / Options | Fly | Pause |
| Right stick | Scroll | — |

The desktop app has a **Quit** button in the menu. Messages such as VR errors appear as a box closed with A. While a pad is being calibrated, its own buttons don't move the menus.

## Downloads and websites

- **Game website:** https://guyka2212.github.io/fpv-sim/ (repo `guyka2212/fpv-sim`, source in `Game-Website/`). Downloads come from the repo's GitHub releases: `FPV-Sim-Setup.exe` and `FPV-Sim.apk`.
- **Server website:** https://guyka2212.github.io/flysim-servers/ (repo `guyka2212/flysim-servers`, source in `Servers-Website/`).
- **Windows installer:** `build-installer.bat` builds the app and then `release\FPV-Sim-Setup.exe` with Inno Setup 6.7+ (`winget install JRSoftware.InnoSetup`). Script and artwork: `desktop/installer/`. It installs per user (no admin), in a dark wizard in English or Hebrew, with Start menu and desktop shortcuts and an uninstaller.
- **New release:** bump `version` in package.json, run `build-installer.bat` and `android-appuild.bat`, copy the APK to `release\FPV-Sim.apk`, then `gh release create vX.Y.Z release/FPV-Sim-Setup.exe release/FPV-Sim.apk --repo guyka2212/fpv-sim`.

## Desktop app

`app/` holds the standalone Windows app in the games-launcher layout (`DESCRIPTION.md`, `icon.png`, `cover.png`, screenshots, `FlySim.zip`), plus the unzipped `app/FlySim/FlySim.exe`. It runs the game in its own window (Electron), with no browser and no dev server. The DJI remote connects without a port picker.

Rebuild it by double-clicking **`build-app.bat`**, or from cmd:

```
build-app.bat nopause
```

(`nopause` skips the "press any key" at the end. The batch file runs `desktopuild.ps1`.)

VR in the app: Electron has no WebXR, so the app ships `FlySimXR.exe`, a small native OpenXR program, just as VrFsim uses Unity's OpenXR plugin. The app streams its window (FPV view and OSD) to it, and it shows that picture in the headset as a head-locked goggle screen, on the graphics card Quest Link asks for. Source: `desktop/xr/FlySimXR.cs`. It uses the Khronos `openxr_loader.dll` (Apache-2.0), copied from the VrFsim build by `desktop/xr/build-xr.ps1`.

VR works like real FPV goggles: the FPV view and OSD sit on a screen in front of your eyes and do not move with your head.

In VR the display adjusts itself to the headset. Real goggle lenses are only sharp in the middle, so the OSD (or Iron Man HUD) and the stick boxes move in toward the centre with bigger text. The desktop-only keyboard help and FPS counter are hidden, and the horizon lines stay on the real horizon. **Settings → VR headset → OSD area in the headset** sets how much of the screen the display uses (default 78%). The layout switches back to full screen when VR stops.

**Settings → VR headset → OpenXR headset view** turns this on (default) or off. With it off, **Goggles (Quest)** makes the sim full screen instead, for Quest Link's **Desktop** panel.

## Android app

`android-app/` is the same game as an Android app (Android 8 or newer, landscape, full screen). It needs no internet: the maps and code are inside the APK.

Build it by double-clicking **`android-app\build.bat`**, or from cmd:

```
android-app\build.bat nopause
```

It builds the game, packs it into `android-app\FlySim.apk` and, when a phone is plugged in with USB debugging on, installs it. Otherwise copy the APK to the phone and open it there (allow "install unknown apps" for your file manager once). The build uses the Java and Android SDK that Android Studio installs.

Controllers: plug the controller into the phone's USB-C port; a USB-A controller or radio needs an OTG adapter (USB-A female to USB-C). Android reads it, not the WebView, so every axis of an FPV radio comes through (run **Controls → Calibrate** once, as on the PC). Xbox and PlayStation pads work without calibrating. A DJI RC-N remote connects from **Controls → Connect DJI remote**; Android asks once for permission. Menus work by tapping the screen; flying needs a controller (there are no on-screen sticks). The Android back button pauses and resumes.

How it works: `MainActivity.java` shows the built game in a WebView, served from `https://appassets.androidplatform.net` (so it counts as a secure site). `Pads.java` reads controllers and `UsbSerial.java` the DJI remote; `src/platform/android.ts` hands both to the game as `navigator.getGamepads()` and `navigator.serial`. Graphics start at Medium on phones. To debug, open `chrome://inspect` on the PC while the phone is plugged in.

## Meta Quest (VR goggles)

1. Connect the Quest to the PC with **Quest Link** (cable) or **Air Link**, and in the Meta Quest Link PC app set it as the active OpenXR runtime.
2. Open the sim in **Chrome or Edge on the PC** (`npm run dev`, http://localhost:5173).
3. Press **VR (Quest)** in the menu (or **Back into VR** on the pause screen).

It works like real DJI / Walksnail / analog goggles: the drone's camera is a flat video screen fixed in front of your eyes, with the OSD on it. Turning your head doesn't move the picture. Screen size is adjustable in Settings → VR headset.

Fly with any controller or radio as usual, or with the Touch controllers: left stick throttle + yaw (centre = 50% throttle), right stick pitch + roll, A arm, B reset, X camera, Y flight mode, left stick click = pause and leave VR.

## Rebuilding models

With Blender + the MCP addon (or Blender's Python console), run any script in `blender/drones/` or `blender/maps/`; each rebuilds the scene and exports its GLB into `public/models/`.

`blender/maplib.py` also has the helpers for big structures: `Mesher` merges thousands of boxes and beams into one mesh per material (the Paris tower, facades, stands), `sweep()` runs a profile along a path (stadium tiers, bridges), `terrain()` builds height-field ground and `boat()` makes boats.

`blender/detail.py` holds the shared scenery used by every map:
- Trees: leafy trees, pines, curved palms with drooping fronds, bushes, rocks and grass tufts.
- Buildings: framed window grids and rooftop units.
- Street furniture: lamps, benches, bins, bollards, planters, railings, cones, barriers, tyre stacks, parasols and flags.
- Vehicles and crowds: cars with real silhouettes, team trucks, and spectators for the grandstands.

The race cars come from `blender/cars.py` (`public/models/cars/`). The track maps (`f1.py`, `oval.py`) also write the cars' driving line, `public/models/maps/<map>.track.json`, using `blender/tracklib.py`.

Map preview images in `public/previews/` are rendered from the exported map GLBs by `blender/previews.py`; re-run it after changing a map.
