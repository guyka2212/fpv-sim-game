import type { Chemistry } from '../drones/specs';

// Resting cell voltage against state of charge, from discharge curves at low C.
const OCV: Record<Chemistry, [number, number][]> = {
  lipo: [
    [0, 3.3],
    [0.05, 3.5],
    [0.1, 3.62],
    [0.2, 3.7],
    [0.5, 3.82],
    [0.8, 4.0],
    [0.9, 4.08],
    [1, 4.2],
  ],
  liion: [
    [0, 2.8],
    [0.05, 3.05],
    [0.1, 3.25],
    [0.3, 3.5],
    [0.5, 3.65],
    [0.8, 3.95],
    [1, 4.2],
  ],
};

function interp(table: [number, number][], x: number): number {
  if (x <= table[0][0]) return table[0][1];
  for (let i = 1; i < table.length; i++) {
    const [x1, y1] = table[i];
    if (x <= x1) {
      const [x0, y0] = table[i - 1];
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return table[table.length - 1][1];
}

export class Battery {
  soc = 1;
  current = 0;
  voltage: number;
  usedMah = 0;

  constructor(
    readonly cells: number,
    readonly chemistry: Chemistry,
    readonly capacityMah: number,
    readonly rInternal: number,
  ) {
    this.voltage = this.restingVoltage();
  }

  restingVoltage(): number {
    return this.cells * interp(OCV[this.chemistry], this.soc);
  }

  /** Nominal voltage the thrust figures are rated at. */
  get nominal(): number {
    return this.cells * (this.chemistry === 'lipo' ? 3.95 : 3.8);
  }

  update(dt: number, current: number): void {
    this.current = current;
    const dMah = (current * dt * 1000) / 3600;
    this.usedMah += dMah;
    this.soc = Math.max(0, this.soc - dMah / this.capacityMah);
    // Sag grows as the pack empties (internal resistance rises at low charge).
    const r = this.rInternal * (1 + (1 - this.soc) * 0.6);
    this.voltage = Math.max(this.cells * 2.5, this.restingVoltage() - current * r);
  }

  reset(): void {
    this.soc = 1;
    this.current = 0;
    this.usedMah = 0;
    this.voltage = this.restingVoltage();
  }

  get cellVoltage(): number {
    return this.voltage / this.cells;
  }
}
