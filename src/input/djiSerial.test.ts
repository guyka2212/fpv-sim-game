import { describe, expect, it } from 'vitest';
import { dumlPacket, DumlParser, ENABLE_SIM, REQUEST_STICKS } from './djiSerial';

const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join(' ');

describe('DJI DUML', () => {
  it('builds the stick request byte-for-byte like the RC-N1 tools', () => {
    expect(hex(REQUEST_STICKS)).toBe('55 0d 04 33 0a 06 eb 34 40 06 01 74 24');
  });

  it('builds the simulator-mode packet with a valid header', () => {
    expect(hex(ENABLE_SIM).startsWith('55 0e 04 66 0a 06 eb 34 40 06 24 01')).toBe(true);
    expect(ENABLE_SIM.length).toBe(14);
  });

  it('parses a 38-byte stick frame split across reads, with junk before it', () => {
    // A reply-shaped frame: header from dumlPacket, then raw channels at the known offsets.
    const payload = new Array(38 - 13).fill(0);
    const frame = Array.from(dumlPacket(0x06, 0x0a, 0x80, 0x06, 0x01, payload));
    const put = (o: number, v: number) => {
      frame[o] = v & 0xff;
      frame[o + 1] = v >> 8;
    };
    put(13, 1684); // right horizontal full right
    put(16, 1024); // right vertical centred
    put(19, 364); // left vertical full down
    put(22, 1354); // left horizontal half right
    put(25, 1024);
    const bytes = [0x00, 0x13, ...frame];
    const p = new DumlParser();
    expect(p.push(Uint8Array.from(bytes.slice(0, 20)))).toEqual([]);
    const out = p.push(Uint8Array.from(bytes.slice(20)));
    expect(out).toHaveLength(1);
    expect(out[0].rh).toBeCloseTo(1);
    expect(out[0].rv).toBeCloseTo(0);
    expect(out[0].lv).toBeCloseTo(-1);
    expect(out[0].lh).toBeCloseTo(0.5);
  });
});
