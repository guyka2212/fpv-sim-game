// The Android app (android-app/) runs the game in a WebView and passes in what the WebView can't
// do itself: USB controllers and radios (read by Android, so every axis of an RC radio comes
// through) and USB serial for the DJI remotes. This module turns that bridge into the browser
// APIs the rest of the game already uses: navigator.getGamepads() and navigator.serial.

/** Calls the Android app answers (android-app/.../MainActivity.java, `FlySimAndroid`). */
interface AndroidBridge {
  /** JSON list of connected controllers: {id, index, mapping, axes, buttons}. */
  pads(): string;
  quit(): void;
  /** JSON list of USB devices with bulk endpoints: {id, vendorId, productId, name, permission}. */
  usbList(): string;
  usbRequest(id: number): void;
  /** '' when open, otherwise the reason it failed. */
  usbOpen(id: number, baud: number): string;
  /** Base64 of the bytes received since the last call; '' = nothing new, '!' = port gone. */
  usbRead(): string;
  usbWrite(base64: string): boolean;
  usbClose(): void;
  /** Saving a file (exported video): '' when ready, else why not. */
  fileBegin(name: string, mime: string): string;
  fileAppend(base64: string): boolean;
  /** Where the file was saved ('' = failed). */
  fileEnd(): string;
}

const bridge = (window as unknown as { FlySimAndroid?: AndroidBridge }).FlySimAndroid;

/** Running inside the Android app. */
export const isAndroidApp = !!bridge;

/** Closes the Android app (null outside it). */
export const androidQuit = bridge ? () => bridge.quit() : null;

/** Saves a file through the app (a WebView can't download); resolves to where it went. */
export async function androidSaveFile(blob: Blob, name: string): Promise<string> {
  if (!bridge) throw new Error('not the Android app');
  const err = bridge.fileBegin(name, blob.type || 'application/octet-stream');
  if (err) throw new Error(err);
  // Chunks a multiple of 3 bytes long, so each base64 piece decodes on its own.
  const CHUNK = 3 * 256 * 1024;
  for (let o = 0; o < blob.size; o += CHUNK) {
    const bytes = new Uint8Array(await blob.slice(o, o + CHUNK).arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    if (!bridge.fileAppend(btoa(bin))) throw new Error('writing failed');
  }
  const where = bridge.fileEnd();
  if (!where) throw new Error('could not finish the file');
  return where;
}

/**
 * The Android back button: true when the game used it (pause / resume), false to leave the app.
 * Set by main.ts.
 */
export const androidBack: { handler: () => boolean } = { handler: () => false };

interface NativePad {
  id: string;
  index: number;
  mapping: string;
  axes: number[];
  buttons: number[];
}

function installGamepads(b: AndroidBridge): void {
  let lastJson = '';
  let lastRead = -1;
  let pads: Gamepad[] = [];
  const read = (): Gamepad[] => {
    // Several callers poll in one frame; one trip over the bridge is enough.
    const now = performance.now();
    if (now - lastRead < 2) return pads;
    lastRead = now;
    const json = b.pads();
    if (json === lastJson) return pads;
    lastJson = json;
    pads = (JSON.parse(json) as NativePad[]).map(
      (p) =>
        ({
          id: p.id,
          index: p.index,
          mapping: p.mapping,
          connected: true,
          timestamp: now,
          axes: p.axes,
          buttons: p.buttons.map((v) => ({ pressed: v > 0.5, touched: v > 0, value: v })),
          hapticActuators: [],
          vibrationActuator: null,
        }) as unknown as Gamepad,
    );
    return pads;
  };
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: read });

  // The game listens for these to pick up a controller as soon as it's plugged in.
  let known = new Map<number, Gamepad>();
  window.setInterval(() => {
    const now = new Map(read().map((p) => [p.index, p]));
    const fire = (type: string, gamepad: Gamepad) => window.dispatchEvent(Object.assign(new Event(type), { gamepad }));
    for (const [i, p] of now) if (!known.has(i)) fire('gamepadconnected', p);
    for (const [i, p] of known) if (!now.has(i)) fire('gamepaddisconnected', p);
    known = now;
  }, 500);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function toBase64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromBase64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

interface UsbDevice {
  id: number;
  vendorId: number;
  productId: number;
  name: string;
  permission: boolean;
}

/** One USB device as a Web Serial port (only what djiSerial.ts uses). */
class AndroidSerialPort {
  readable: ReadableStream<Uint8Array> | null = null;
  writable: WritableStream<Uint8Array> | null = null;

  constructor(
    private b: AndroidBridge,
    private dev: UsbDevice,
  ) {}

  getInfo() {
    return { usbVendorId: this.dev.vendorId, usbProductId: this.dev.productId };
  }

  async open(o: { baudRate: number }): Promise<void> {
    const err = this.b.usbOpen(this.dev.id, o.baudRate);
    if (err) throw new Error(err);
    const b = this.b;
    this.readable = new ReadableStream<Uint8Array>({
      async pull(ctrl) {
        for (;;) {
          const s = b.usbRead();
          if (s === '!') return ctrl.error(new Error('the USB device was unplugged'));
          if (s) return ctrl.enqueue(fromBase64(s));
          await sleep(4);
        }
      },
    });
    this.writable = new WritableStream<Uint8Array>({
      write(chunk) {
        if (!b.usbWrite(toBase64(chunk))) throw new Error('write failed');
      },
    });
  }

  async close(): Promise<void> {
    this.b.usbClose();
    this.readable = this.writable = null;
  }
}

const DJI_VENDOR = 0x2ca3;

function installSerial(b: AndroidBridge): void {
  const list = (): UsbDevice[] => JSON.parse(b.usbList());
  const serial = {
    async getPorts() {
      return list()
        .filter((d) => d.permission)
        .map((d) => new AndroidSerialPort(b, d));
    },
    /** Picks the DJI remote (or the only USB serial device) and asks Android for access. */
    async requestPort() {
      const devs = list();
      const dev = devs.find((d) => d.vendorId === DJI_VENDOR) ?? devs[0];
      if (!dev) throw new Error('No USB remote found. Plug it in with a data cable (and the USB-C adapter), switch it on, then try again.');
      if (!dev.permission) {
        b.usbRequest(dev.id);
        // Android shows its own "Allow FPV Sim to access…" dialog; wait for the answer.
        for (let i = 0; i < 600 && !list().find((d) => d.id === dev.id)?.permission; i++) await sleep(100);
        if (!list().find((d) => d.id === dev.id)?.permission) throw new Error('Android did not allow access to the remote.');
      }
      return new AndroidSerialPort(b, dev);
    },
  };
  Object.defineProperty(navigator, 'serial', { configurable: true, value: serial });
}

if (bridge) {
  installGamepads(bridge);
  installSerial(bridge);
  (window as unknown as { flysimBack: () => boolean }).flysimBack = () => androidBack.handler();
  document.documentElement.classList.add('android');
}
