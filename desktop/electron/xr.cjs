// Streams the game window into FlySimXR.exe (native OpenXR), which shows it in the headset
// as a head-locked goggle screen. See desktop/xr/FlySimXR.cs for the wire format.
const { app } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const MAX_WIDTH = 1600; // plenty for a goggle screen; keeps the pipe at ~150-350 MB/s

function helperPath() {
  const p = app.isPackaged
    ? path.join(process.resourcesPath, 'xr', 'FlySimXR.exe')
    : path.join(__dirname, '..', 'xr', 'out', 'xr', 'FlySimXR.exe');
  return fs.existsSync(p) ? p : null;
}

class XrBridge {
  constructor(win, onStatus) {
    this.win = win;
    this.onStatus = onStatus;
    this.proc = null;
    this.busy = false; // pipe backpressure: drop frames until it drains
  }

  get running() {
    return !!this.proc;
  }

  start(fov, distance) {
    if (this.proc) {
      this.config(fov, distance);
      return true;
    }
    const exe = helperPath();
    if (!exe) {
      this.onStatus('ERROR FlySimXR.exe is missing from the app');
      return false;
    }
    const proc = spawn(exe, [], { cwd: path.dirname(exe), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.proc = proc;
    this.busy = false;
    let buf = '';
    proc.stdout.on('data', (d) => {
      buf += d.toString();
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        // The OpenXR runtime logs to the same stdout; only our own lines matter.
        if (line.startsWith('STATE ') || line.startsWith('ERROR ')) this.onStatus(line);
      }
    });
    proc.stderr.on('data', () => {});
    proc.stdin.on('drain', () => (this.busy = false));
    proc.stdin.on('error', () => {});
    proc.on('exit', (code) => {
      if (this.proc === proc) {
        this.proc = null;
        this.stopCapture();
        this.onStatus(code === 0 ? 'STATE stopped' : `STATE exited ${code}`);
      }
    });
    this.config(fov, distance);
    this.startCapture();
    return true;
  }

  /** Goggle screen size; mode 0 = fixed screen in front of the eyes, like real FPV goggles. */
  config(fov, distance) {
    if (!this.proc) return;
    const m = Buffer.alloc(16);
    m.write('FXRC', 0, 'ascii');
    m.writeFloatLE(fov, 4);
    m.writeFloatLE(distance, 8);
    m.writeUInt32LE(0, 12);
    this.proc.stdin.write(m);
  }

  startCapture() {
    const wc = this.win.webContents;
    // Every painted frame of the page (game + OSD), as BGRA.
    wc.beginFrameSubscription(false, (image) => {
      if (!this.proc || this.busy) return;
      let img = image;
      let { width, height } = img.getSize();
      if (!width || !height) return;
      if (width > MAX_WIDTH) {
        img = img.resize({ width: MAX_WIDTH, quality: 'good' });
        ({ width, height } = img.getSize());
      }
      const px = img.toBitmap();
      if (px.length !== width * height * 4) return;
      const head = Buffer.alloc(16);
      head.write('FXRF', 0, 'ascii');
      head.writeUInt32LE(width, 4);
      head.writeUInt32LE(height, 8);
      head.writeUInt32LE(px.length, 12);
      const ok1 = this.proc.stdin.write(head);
      const ok2 = this.proc.stdin.write(px);
      if (!ok1 || !ok2) this.busy = true;
    });
    this.capturing = true;
  }

  stopCapture() {
    if (!this.capturing) return;
    try {
      this.win.webContents.endFrameSubscription();
    } catch {
      /* window gone */
    }
    this.capturing = false;
  }

  stop() {
    this.stopCapture();
    if (!this.proc) return;
    const proc = this.proc;
    // Closing stdin asks the helper to end the OpenXR session cleanly; kill it if it hangs.
    try {
      proc.stdin.end();
    } catch {
      /* already closed */
    }
    setTimeout(() => {
      if (!proc.killed && proc.exitCode === null) proc.kill();
    }, 3000);
  }
}

module.exports = { XrBridge, helperPath };
