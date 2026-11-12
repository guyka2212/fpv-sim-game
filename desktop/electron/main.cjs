// FPV Sim desktop app (Electron): the game in its own window, no browser needed.
// The built game (dist/) is served from a private "app://" origin, which counts as secure
// (needed for Web Serial) and keeps saved settings stable between runs.
const { app, BrowserWindow, protocol, net, session, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { XrBridge, helperPath } = require('./xr.cjs');

const DJI_VENDOR = 0x2ca3;
const SITE = app.isPackaged ? path.join(process.resourcesPath, 'dist') : path.join(__dirname, '..', '..', 'dist');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

// Frame rate: Chromium normally waits for the monitor (VSync) and caps at its refresh rate.
// With VSync off (the default) the game runs as fast as the GPU allows, which also cuts the
// stick-to-screen delay. The choice lives in launch.json because switches only apply at start.
const LAUNCH_FILE = path.join(app.getPath('userData'), 'launch.json');
function readLaunch() {
  try {
    return JSON.parse(fs.readFileSync(LAUNCH_FILE, 'utf8'));
  } catch {
    return {};
  }
}
const launchVsync = readLaunch().vsync === true;
if (!launchVsync) {
  app.commandLine.appendSwitch('disable-frame-rate-limit');
  app.commandLine.appendSwitch('disable-gpu-vsync');
}
// Keep GPU acceleration even on drivers Chromium is unsure about.
app.commandLine.appendSwitch('ignore-gpu-blocklist');

// One copy at a time: a second launch just focuses the open window.
if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let xr = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: 'FPV Sim',
    backgroundColor: '#0b0f14',
    icon: path.join(__dirname, 'icon.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  Menu.setApplicationMenu(null);
  // FLYSIM_URL=http://localhost:5173 runs the app against the dev server (for development and tests).
  win.loadURL(process.env.FLYSIM_URL || 'app://flysim/index.html');

  // F11 / Alt+Enter: full screen (that is the "goggles" view in Quest Link's Desktop).
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.alt && input.key === 'Enter')) {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
    if (input.key === 'F12' && input.control && input.shift) win.webContents.toggleDevTools();
  });
  // Links (DJI downloads etc.) open in the system browser, never inside the game window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(() => {
  protocol.handle('app', (req) => {
    const u = new URL(req.url);
    let p = decodeURIComponent(u.pathname);
    if (p === '/' || p === '') p = '/index.html';
    const file = path.normalize(path.join(SITE, p));
    // Stay inside the game folder.
    if (!file.startsWith(SITE)) return new Response('not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });

  const ses = session.defaultSession;
  // Web Serial: the game asks for a port; pick the DJI remote automatically, no picker.
  ses.on('select-serial-port', (event, portList, _wc, callback) => {
    event.preventDefault();
    const vid = (p) => (typeof p.vendorId === 'string' ? parseInt(p.vendorId, p.vendorId.startsWith('0x') ? 16 : 10) : p.vendorId);
    const dji =
      portList.find((p) => vid(p) === DJI_VENDOR) ||
      portList.find((p) => /DJI|For Protocol/i.test(`${p.displayName || ''} ${p.portName || ''}`));
    callback(dji ? dji.portId : '');
  });
  ses.setPermissionCheckHandler((_wc, permission) => ['serial', 'hid', 'gamepad', 'fullscreen', 'media'].includes(permission) || permission === 'xr-spatial-tracking');
  ses.setDevicePermissionHandler((d) => d.deviceType === 'serial');

  // Exported replay videos go straight to Videos\FPV Sim (no save dialog); the folder opens on the file.
  ses.on('will-download', (_e, item) => {
    const dir = path.join(app.getPath('videos'), 'FPV Sim');
    fs.mkdirSync(dir, { recursive: true });
    const ext = path.extname(item.getFilename());
    const base = path.basename(item.getFilename(), ext);
    let file = path.join(dir, base + ext);
    for (let n = 2; fs.existsSync(file); n++) file = path.join(dir, `${base} (${n})${ext}`);
    item.setSavePath(file);
    item.once('done', (_ev, state) => {
      if (state === 'completed') shell.showItemInFolder(file);
    });
  });

  // Multiplayer relay (see preload.cjs): one WebSocket per id, events back to the page that opened it.
  const sockets = new Map();
  let nextSocket = 1;
  ipcMain.handle('flysim:net-open', (e, url) => {
    if (typeof url !== 'string' || !/^ws:\/\/[^/\s]+\/?$/i.test(url)) throw new Error('Only ws://host:port addresses');
    const id = nextSocket++;
    const ws = new WebSocket(url);
    sockets.set(id, ws);
    const emit = (type, data) => !e.sender.isDestroyed() && e.sender.send('flysim:net', id, type, data);
    ws.onopen = () => emit('open');
    ws.onmessage = (m) => emit('message', String(m.data));
    ws.onerror = () => emit('error');
    ws.onclose = () => {
      sockets.delete(id);
      emit('close');
    };
    return id;
  });
  ipcMain.on('flysim:net-send', (_e, id, text) => {
    const ws = sockets.get(id);
    if (ws && ws.readyState === 1 && typeof text === 'string') ws.send(text);
  });
  ipcMain.on('flysim:net-close', (_e, id) => sockets.get(id)?.close());
  ipcMain.handle('flysim:net-status', async (_e, url) => {
    if (typeof url !== 'string' || !/^http:\/\/[^/\s]+\/status$/i.test(url)) throw new Error('Only http://host:port/status');
    const r = await fetch(url, { signal: AbortSignal.timeout(4000) });
    return await r.json();
  });

  // Native OpenXR goggles (FlySimXR.exe). Status lines go back to the game.
  ipcMain.handle('flysim:xr', (_e, opts) => {
    if (!win) return false;
    if (!xr) xr = new XrBridge(win, (line) => win && win.webContents.send('flysim:xr-status', line));
    if (opts && opts.on) return xr.start(opts.fov || 48, opts.distance || 1.6);
    xr.stop();
    return false;
  });
  ipcMain.handle('flysim:xr-available', () => !!helperPath());

  ipcMain.handle('flysim:quit', () => {
    if (xr) xr.stop();
    app.quit();
  });

  ipcMain.handle('flysim:set-vsync', (_e, on) => {
    if (!!on === launchVsync) return;
    try {
      fs.mkdirSync(path.dirname(LAUNCH_FILE), { recursive: true });
      fs.writeFileSync(LAUNCH_FILE, JSON.stringify({ ...readLaunch(), vsync: !!on }));
    } catch {
      return; // can't save it: keep running as is
    }
    if (xr) xr.stop();
    app.relaunch();
    app.exit(0);
  });

  ipcMain.handle('flysim:fullscreen', (_e, on) => {
    if (win) win.setFullScreen(on === undefined ? !win.isFullScreen() : !!on);
    return win ? win.isFullScreen() : false;
  });

  createWindow();
});

app.on('window-all-closed', () => {
  if (xr) xr.stop();
  app.quit();
});
