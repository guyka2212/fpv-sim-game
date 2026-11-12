// DJI RC-N1 / RC-N2 / RC-N3 over USB.
//
// These remotes are not USB joysticks: on a PC they appear as a serial port named
// "DJI USB VCOM For Protocol" (driver comes with DJI Assistant 2). They speak DJI's DUML
// protocol. We switch the remote into simulator mode and poll its stick channels, then
// present the result as a standard gamepad. Protocol from the community RC-N1 simulator
// projects (Matsemann/mDjiController and forks); RC-N3 is the same family but unconfirmed.

// ---------------------------------------------------------------- DUML framing

function reflectedTable(poly: number, bits: 8 | 16): number[] {
  const t: number[] = [];
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ poly : c >>> 1;
    t.push(bits === 8 ? c & 0xff : c & 0xffff);
  }
  return t;
}

// Header: CRC-8/Maxim table, seed 0x77. Packet: reflected CRC-16 (0x8408), seed 0x3692.
const CRC8 = reflectedTable(0x8c, 8);
const CRC16 = reflectedTable(0x8408, 16);

export function crc8(data: ArrayLike<number>, len: number, seed = 0x77): number {
  let c = seed;
  for (let i = 0; i < len; i++) c = CRC8[(data[i] ^ c) & 0xff];
  return c;
}

export function crc16(data: ArrayLike<number>, len: number, seed = 0x3692): number {
  let v = seed;
  for (let i = 0; i < len; i++) v = (v >>> 8) ^ CRC16[(data[i] ^ v) & 0xff];
  return v & 0xffff;
}

export function dumlPacket(src: number, dst: number, cmdType: number, cmdSet: number, cmdId: number, payload: number[] = [], seq = 0x34eb): Uint8Array {
  const length = 13 + payload.length;
  const p = [0x55, length & 0xff, (length >> 8) | 0x04];
  p.push(crc8(p, 3));
  p.push(src, dst, seq & 0xff, seq >> 8, cmdType, cmdSet, cmdId, ...payload);
  const c = crc16(p, p.length);
  p.push(c & 0xff, c >> 8);
  return Uint8Array.from(p);
}

/** Puts the remote in simulator mode (otherwise it reports sticks very slowly). */
export const ENABLE_SIM = dumlPacket(0x0a, 0x06, 0x40, 0x06, 0x24, [0x01]);
/** Asks for the current stick channels. */
export const REQUEST_STICKS = dumlPacket(0x0a, 0x06, 0x40, 0x06, 0x01);

export interface DjiSticks {
  rh: number; // right stick horizontal, -1..1
  rv: number; // right stick vertical
  lv: number; // left stick vertical
  lh: number; // left stick horizontal
  dial: number; // camera dial
}

const STICK_FRAME = 38;
const norm = (raw: number) => Math.max(-1, Math.min(1, (raw - 1024) / 660)); // 364..1024..1684

/** Pulls complete DUML frames out of a byte stream and decodes stick reports. */
export class DumlParser {
  private buf: number[] = [];

  push(chunk: Uint8Array): DjiSticks[] {
    for (const b of chunk) this.buf.push(b);
    const out: DjiSticks[] = [];
    for (;;) {
      const start = this.buf.indexOf(0x55);
      if (start < 0) {
        this.buf.length = 0;
        break;
      }
      if (start > 0) this.buf.splice(0, start);
      if (this.buf.length < 4) break;
      const len = (this.buf[1] | (this.buf[2] << 8)) & 0x3ff;
      if (len < 13 || crc8(this.buf, 3) !== this.buf[3]) {
        this.buf.shift(); // not a real frame start
        continue;
      }
      if (this.buf.length < len) break;
      const f = this.buf.splice(0, len);
      if (len === STICK_FRAME) {
        const u16 = (o: number) => f[o] | (f[o + 1] << 8);
        out.push({ rh: norm(u16(13)), rv: norm(u16(16)), lv: norm(u16(19)), lh: norm(u16(22)), dial: norm(u16(25)) });
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------- Web Serial connection

interface SerialPortLike {
  open(o: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  getInfo(): { usbVendorId?: number; usbProductId?: number };
}
interface SerialLike {
  requestPort(o?: { filters?: { usbVendorId: number }[] }): Promise<SerialPortLike>;
  getPorts(): Promise<SerialPortLike[]>;
}

const DJI_VENDOR = 0x2ca3;
export const QUEST_PAD_INDEX = 100;
export const DJI_PAD_INDEX = 101;

const serial = (): SerialLike | undefined => (navigator as unknown as { serial?: SerialLike }).serial;

/** A DJI remote read over Web Serial, exposed as a Mode 2 "standard" gamepad. */
export class DjiRemote {
  sticks: DjiSticks | null = null;
  status: 'disconnected' | 'connecting' | 'connected' | 'no-data' = 'disconnected';
  error = '';
  private port: SerialPortLike | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private lastFrame = 0;
  private timer = 0;
  private reading = false;

  static get supported(): boolean {
    return !!serial();
  }

  /** Reconnect a port the user already granted on an earlier visit, without a prompt. */
  async reconnect(): Promise<void> {
    const s = serial();
    if (!s || this.port) return;
    const ports = await s.getPorts();
    const dji = ports.find((p) => p.getInfo().usbVendorId === DJI_VENDOR) ?? ports.find((p) => p.getInfo().usbVendorId !== undefined);
    if (dji) await this.open(dji);
  }

  /** Must run from a click: the browser shows its port picker. */
  async connect(): Promise<void> {
    const s = serial();
    if (!s) throw new Error('This browser has no Web Serial. Use Chrome or Edge on a PC.');
    // No vendor filter: some driver versions report the VCOM port under another USB ID,
    // and an empty picker gives no clue. The DJI port is easy to spot by its name.
    const port = await s.requestPort();
    await this.open(port);
  }

  private async open(port: SerialPortLike): Promise<void> {
    this.error = '';
    // Built-in ports like COM1 have no USB IDs: the remote can't be on the other end.
    if (port.getInfo().usbVendorId === undefined) {
      this.error =
        'That port is built into the PC (like COM1), not the DJI remote. Windows has not detected the remote yet: in Device Manager it must appear as "DJI USB VCOM For Protocol". If you see "Unknown USB Device" instead, try a different data USB-C cable and a USB port on the back of the PC.';
      throw new Error(this.error);
    }
    this.status = 'connecting';
    try {
      await port.open({ baudRate: 115200 });
    } catch (e) {
      this.status = 'disconnected';
      this.error = `Could not open the port (is DJI Assistant or another app using it?): ${(e as Error).message}`;
      throw new Error(this.error);
    }
    this.port = port;
    this.writer = port.writable!.getWriter();
    await this.write(ENABLE_SIM);
    await this.write(REQUEST_STICKS);
    this.lastFrame = performance.now();
    void this.readLoop();
    // Keep polling even if a reply goes missing.
    this.timer = window.setInterval(() => {
      const idle = performance.now() - this.lastFrame;
      if (idle > 60) void this.write(REQUEST_STICKS);
      if (idle > 1500 && this.status !== 'no-data') {
        this.status = 'no-data';
        this.error =
          'The port is open but the remote is not answering. Make sure it is switched on, DJI Assistant 2 is closed, and you picked "DJI USB VCOM For Protocol" (not another COM port). Then Disconnect and Connect again.';
      }
    }, 30);
  }

  private async write(p: Uint8Array): Promise<void> {
    try {
      await this.writer?.write(p);
    } catch {
      /* port gone; the read loop reports it */
    }
  }

  private async readLoop(): Promise<void> {
    if (!this.port?.readable || this.reading) return;
    this.reading = true;
    const parser = new DumlParser();
    const reader = this.port.readable.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        if (!value) continue;
        const frames = parser.push(value);
        if (frames.length) {
          this.sticks = frames[frames.length - 1];
          this.lastFrame = performance.now();
          this.status = 'connected';
          void this.write(REQUEST_STICKS);
        }
      }
    } catch (e) {
      this.error = `Lost the remote: ${(e as Error).message}`;
    } finally {
      reader.releaseLock();
      this.reading = false;
      void this.disconnect();
    }
  }

  async disconnect(): Promise<void> {
    window.clearInterval(this.timer);
    this.sticks = null;
    this.status = 'disconnected';
    try {
      this.writer?.releaseLock();
      await this.port?.close();
    } catch {
      /* already closed */
    }
    this.writer = null;
    this.port = null;
  }

  /**
   * As a "standard" gamepad (Mode 2, like DJI's default): left stick throttle/yaw,
   * right stick pitch/roll; up on a standard pad is -1. Camera dial right = arm, left = reset.
   */
  asGamepad(): Gamepad | null {
    const s = this.sticks;
    if (!s) return null;
    const btn = (on: boolean): GamepadButton => ({ pressed: on, touched: on, value: on ? 1 : 0 });
    const buttons = Array.from({ length: 17 }, () => btn(false));
    buttons[0] = btn(s.dial > 0.6);
    buttons[1] = btn(s.dial < -0.6);
    return {
      id: 'DJI RC-N remote (USB serial, Vendor: 2ca3)',
      index: DJI_PAD_INDEX,
      mapping: 'standard',
      connected: true,
      timestamp: this.lastFrame,
      axes: [s.lh, -s.lv, s.rh, -s.rv],
      buttons,
      hapticActuators: [],
      vibrationActuator: null,
    } as unknown as Gamepad;
  }
}
