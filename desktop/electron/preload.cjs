// Tells the game it is running as the desktop app and gives it full-screen control.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('flysimApp', {
  isApp: true,
  /** Toggle (no argument) or set full screen; resolves to the new state. */
  fullscreen: (on) => ipcRenderer.invoke('flysim:fullscreen', on),
  /** Whether the native OpenXR goggles helper is bundled. */
  xrAvailable: () => ipcRenderer.invoke('flysim:xr-available'),
  /** Start ({ on: true, fov, distance }) or stop ({ on: false }) the headset goggle screen. */
  xr: (opts) => ipcRenderer.invoke('flysim:xr', opts),
  /** Status lines from the helper: "STATE ready", "STATE streaming", "ERROR ...". */
  onXrStatus: (fn) => ipcRenderer.on('flysim:xr-status', (_e, line) => fn(line)),
  /** VSync is fixed at launch; this saves the choice and restarts the app when it changes. */
  setVsync: (on) => ipcRenderer.invoke('flysim:set-vsync', on),
  /** Close the app (so it can be left with a controller alone). */
  quit: () => ipcRenderer.invoke('flysim:quit'),
  /**
   * Multiplayer: the page (app://) can't open plain ws:// itself, so the main process holds the
   * connection to the player's server and relays it. Only ws:// and http://.../status are allowed.
   */
  net: {
    open: (url) => ipcRenderer.invoke('flysim:net-open', url),
    send: (id, text) => ipcRenderer.send('flysim:net-send', id, text),
    close: (id) => ipcRenderer.send('flysim:net-close', id),
    status: (url) => ipcRenderer.invoke('flysim:net-status', url),
    onEvent: (fn) => ipcRenderer.on('flysim:net', (_e, id, type, data) => fn(id, type, data)),
  },
});
