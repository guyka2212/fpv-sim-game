---
name: FPV Sim
type: game
version: 0.1.0
platform: Windows
developer: guyka2212
released: 2026-10-30
tags: FPV, drone, simulator, Quest, Quest Link, VR, DJI, RC-N3, Betaflight
summary: Realistic FPV drone simulator with 5 real drone classes, Quest VR goggles (OpenXR) and DJI RC-N remote support.
file: FlySim.zip
launch: FlySim/FlySim.exe
---
FPV Sim is a realistic FPV drone simulator. Pick a real class of FPV quad, fly it on the map built for it, and see the world through its FPV camera on your monitor or in your Meta Quest like real FPV goggles.

It is a standalone app: everything runs inside its own window, no browser and no internet needed.

## Drones and maps
- **Freestyle 5"**: 6S, 2207 motors, 10:1 thrust. Map: The Bando (abandoned building + skate park)
- **Racer 5"**: 13:1 thrust, 42° camera. Map: Race Field (12 gates, dive gate, lap timer)
- **Tiny Whoop 65**: 1S ducted. Map: The House (furnished rooms, 6 hoops)
- **Cinewhoop 3"**: GoPro on top, ducted. Map: Old Town (church tower, park)
- **Long Range 7"**: Li-ion, GPS. Map: Alpine Valley (1.8 km terrain, lake)

## Physics
1 kHz flight model: per-motor spool-up and torque limits, battery sag, prop wash, ground effect, wind gusts, and a Betaflight-style flight controller (Actual rates, airmode, Acro / Angle / Horizon).

## Controllers
- Xbox, PS4, PS5, PS3 (with driver), PS2 (USB adapter), any USB pad
- FPV radios in USB joystick mode (RadioMaster, TBS, FrSky, Jumper, BetaFPV)
- **DJI RC-N1 / RC-N2 / RC-N3**: read over USB serial and connected automatically (install DJI Assistant 2 once for the driver)
- Meta Quest Touch controllers in VR, or the keyboard

## How to use
1. Run **FlySim.exe** and click **FLY**
2. DJI remote: **Controls → Connect DJI remote**
3. Quest: start Quest Link, click **VR (Quest)** and put the headset on. The FPV view and OSD appear in front of your eyes like real FPV goggles (native OpenXR, like VrFsim). You can turn this off in Settings -> VR headset to use Link's Desktop panel instead
4. **F11** toggles full screen

## System requirements
- Windows 10 or 11, 64-bit
- For VR: a Meta Quest with Quest Link or Air Link (any OpenXR headset works)
