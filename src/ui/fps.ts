/** Small frame-rate readout in the corner, updated twice a second. */
export class FpsCounter {
  private readonly el = document.createElement('div');
  private frames = 0;
  private since = 0;

  constructor() {
    this.el.id = 'fps';
    document.body.appendChild(this.el);
  }

  show(on: boolean): void {
    this.el.classList.toggle('hidden', !on);
  }

  tick(now: number): void {
    this.frames++;
    if (!this.since) this.since = now;
    const span = now - this.since;
    if (span < 500) return;
    this.el.textContent = `${Math.round((this.frames * 1000) / span)} FPS`;
    this.frames = 0;
    this.since = now;
  }
}
