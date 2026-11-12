import { CalibrationWizard, WIZARD_STEPS } from '../input/calibration';
import { DjiRemote } from '../input/djiSerial';
import { isAndroidApp } from '../platform/android';
import type { InputManager } from '../input/input';
import { ControllerKind, KIND_LABEL, needsCalibration, ThrottleStyle } from '../input/profiles';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

const HELP: Record<ControllerKind, string> = {
  xbox: 'Xbox 360 / One / Series pads work out of the box (Mode 2: left stick throttle + yaw, right stick pitch + roll). A = arm, B = reset, X = camera, Y = flight mode, Start = menu.',
  playstation:
    'PS4 and PS5 pads work over USB or Bluetooth. Same layout as Xbox: Cross = arm, Circle = reset, Square = camera, Triangle = flight mode, Options = menu.',
  ps3: 'PS3 (DualShock 3) on Windows needs a driver that exposes it as a gamepad, e.g. DsHidMini (DS4Windows mode) or the Sony PS3 driver with SCP. If sticks feel wrong, run Calibrate.',
  radio:
    'FPV radios (RadioMaster, TBS Tango/Mambo, FrSky, Jumper, BetaFPV): plug in USB and choose "USB Joystick (HID)" on the radio. Run Calibrate once to map AETR/TAER, switch directions and the arm switch.',
  dji: 'DJI FPV Remote Controller 2/3: put it in its USB simulator / joystick mode and run Calibrate. DJI RC-N phone controllers (Neo, Mini, Air) are not USB joysticks on a PC, so they cannot be read by the browser.',
  quest:
    'In VR you can fly with the Quest Touch controllers: left thumbstick = throttle + yaw, right thumbstick = pitch + roll. A = arm, B = reset, X = camera, Y = flight mode, left stick click = pause/exit VR.',
  generic:
    'Any USB HID controller works after Calibrate, including PS2 pads through a USB adapter. The wizard asks you to move each stick and flip your arm switch.',
};

/** Controller list, live stick check, throttle style and the calibration wizard. */
export class ControlsPanel {
  private wizard: CalibrationWizard | null = null;
  private wizardPad = -1;
  private lastSig = '';

  constructor(private readonly input: InputManager) {
    $('#wiz-next').addEventListener('click', () => this.wizNext());
    $('#wiz-back').addEventListener('click', () => this.wizard?.back());
    $('#wiz-skip').addEventListener('click', () => {
      this.wizard?.skip();
      this.finishIfDone();
    });
    $('#wiz-cancel').addEventListener('click', () => this.closeWizard());
    window.addEventListener('keydown', (e) => {
      if (!this.wizard) return;
      if (e.code === 'Enter') this.wizNext();
      if (e.code === 'Escape') this.closeWizard();
    });
  }

  /** Real and virtual pads (Quest Touch, DJI serial) by index. */
  private findPad(index: number): Gamepad | null {
    return this.input.pads().find((p) => p.index === index) ?? null;
  }

  /** The pad being calibrated (its buttons must not also drive the menus), or -1. */
  get calibratingPad(): number {
    return this.wizard ? this.wizardPad : -1;
  }

  get wizardOpen(): boolean {
    return this.wizard !== null;
  }

  /** Called every frame while the controls tab or wizard is visible. */
  update(): void {
    if (this.wizard) {
      this.updateWizard();
      return;
    }
    const pads = this.input.pads();
    const sig = pads.map((p) => `${p.index}:${p.id}:${this.input.profileFor(p).calibrated}:${this.input.profileFor(p).throttleStyle}`).join('|') + `#${this.input.activePad}#${this.input.dji.status}#${this.input.dji.error}#${this.djiError}`;
    if (sig !== this.lastSig) {
      this.lastSig = sig;
      this.render(pads);
    }
    this.updateLive();
  }

  private render(pads: Gamepad[]): void {
    const el = $('#controls');
    const active = this.input.pad();
    const padRows = pads.length
      ? pads
          .map((p) => {
            const prof = this.input.profileFor(p);
            const need = needsCalibration(prof, p.mapping);
            const status = prof.calibrated
              ? '<span class="badge ok">calibrated</span>'
              : need
                ? '<span class="badge warn">needs calibration</span>'
                : '<span class="badge ok">auto-mapped</span>';
            const act = p.index === this.input.activePad ? '<span class="badge ok">in use</span>' : '';
            return `<div class="pad"><div class="name">${KIND_LABEL[prof.kind]} ${act} ${status}<small>${p.id}</small></div>
              <button data-cal="${p.index}">Calibrate</button>
              ${prof.calibrated ? `<button data-reset="${p.index}">Reset</button>` : ''}</div>`;
          })
          .join('')
      : '<p>No controller detected. Plug one in and <b>press any button or move a stick</b> — browsers only report a controller after it is used.</p>';

    const prof = active ? this.input.profileFor(active) : null;
    const styleSel = prof
      ? `<div class="field"><label>Throttle stick</label><select id="thr-style">
          ${(
            [
              ['full', 'Full range: down = 0%, center = 50%, up = 100%'],
              ['center-hover', 'Height hold (DJI-style): center holds height, up climbs, down descends'],
              ['trigger', 'Right trigger (RT / R2) is throttle'],
            ] as [ThrottleStyle, string][]
          )
            .map(([v, l]) => `<option value="${v}" ${prof.throttleStyle === v ? 'selected' : ''}>${l}</option>`)
            .join('')}
        </select><span></span></div>`
      : '';

    el.innerHTML = `
      <div class="block"><h3>Controllers</h3>${padRows}</div>
      ${this.djiBlock()}
      <div class="block"><h3>Live check</h3>
        <div class="live">
          <div class="stickbox" id="lv-left"><i></i><b>Throttle / Yaw</b></div>
          <div class="stickbox" id="lv-right"><i></i><b>Pitch / Roll</b></div>
          <div style="flex:1;font-size:15px;color:#c3ccd6" id="lv-text"></div>
        </div>
        <div style="height:16px"></div>
        ${styleSel}
      </div>
      <div class="block"><h3>${prof ? KIND_LABEL[prof.kind] : 'Setup'} tips</h3><p>${HELP[prof?.kind ?? 'generic']}</p></div>
      <div class="block"><h3>Keyboard</h3><p>W/S throttle (holds), Shift punch, X cut · A/D yaw · arrows pitch/roll · Space arm · R reset · C camera · M flight mode · Esc menu. Keyboard is for testing — a controller is much better.</p></div>`;

    el.querySelectorAll<HTMLButtonElement>('[data-cal]').forEach((b) => b.addEventListener('click', () => this.openWizard(Number(b.dataset.cal))));
    el.querySelectorAll<HTMLButtonElement>('[data-reset]').forEach((b) =>
      b.addEventListener('click', () => {
        const gp = this.findPad(Number(b.dataset.reset));
        if (gp) this.input.resetProfile(gp.id);
        this.lastSig = '';
      }),
    );
    el.querySelector('#dji-connect')?.addEventListener('click', async () => {
      this.djiError = '';
      try {
        await this.input.dji.connect();
      } catch (e) {
        // NotFoundError = the picker was closed without choosing; the remote sets its own error text.
        if ((e as Error).name !== 'NotFoundError' && !this.input.dji.error) this.djiError = (e as Error).message;
      }
      this.lastSig = '';
    });
    el.querySelector('#dji-disconnect')?.addEventListener('click', async () => {
      await this.input.dji.disconnect();
      this.lastSig = '';
    });
    el.querySelector<HTMLSelectElement>('#thr-style')?.addEventListener('change', (e) => {
      this.input.setThrottleStyle((e.target as HTMLSelectElement).value as ThrottleStyle);
      this.lastSig = '';
    });
  }

  private djiError = '';

  private djiBlock(): string {
    const d = this.input.dji;
    if (!DjiRemote.supported) {
      return `<div class="block"><h3>DJI RC-N1 / RC-N2 / RC-N3</h3><p>Needs Chrome or Edge on a PC (Web Serial).</p></div>`;
    }
    const state =
      d.status === 'connected'
        ? '<span class="badge ok">connected — move the sticks</span>'
        : d.status === 'no-data'
          ? '<span class="badge warn">port open, but no stick data</span>'
          : d.status === 'connecting'
            ? '<span class="badge">connecting…</span>'
            : '<span class="badge">not connected</span>';
    const err = d.error || this.djiError;
    return `<div class="block"><h3>DJI RC-N1 / RC-N2 / RC-N3 ${state}</h3>
      <p>DJI's phone remotes are not USB joysticks, so they never show up in the list above. The sim talks to them directly over USB instead:</p>
      ${isAndroidApp ? ANDROID_DJI_STEPS : PC_DJI_STEPS}
      ${err ? `<p style="color:#ff8a8a">${err}</p>` : ''}
      <div style="display:flex;gap:8px">${
        d.status === 'disconnected' ? '<button id="dji-connect" class="fly">Connect DJI remote</button>' : '<button id="dji-disconnect">Disconnect</button>'
      }</div>
      <p style="font-size:13px;color:var(--muted)">Mode 2 like DJI Fly: left stick throttle + yaw (untouched = 50% throttle), right stick pitch + roll. Arm: hold throttle down and turn the camera dial right, or left stick down + right for 1 s. Camera dial left = reset. Works with the RC-N1; the RC-N3 uses the same family protocol but hasn't been confirmed.</p>
      ${isAndroidApp ? '' : PC_DJI_TROUBLE}
    </div>`;
  }

  private updateLive(): void {
    const s = this.input.sticks;
    const l = document.querySelector<HTMLElement>('#lv-left i');
    const r = document.querySelector<HTMLElement>('#lv-right i');
    if (!l || !r) return;
    l.style.left = `${50 + s.yaw * 45}%`;
    l.style.top = `${95 - s.throttle * 90}%`;
    r.style.left = `${50 + s.roll * 45}%`;
    r.style.top = `${50 - s.pitch * 45}%`;
    const arm = this.input.armSwitch === null ? 'button/key' : this.input.armSwitch ? 'ON' : 'off';
    $('#lv-text').innerHTML = `Throttle ${(s.throttle * 100).toFixed(0)}% · Yaw ${s.yaw.toFixed(2)}<br>Pitch ${s.pitch.toFixed(2)} · Roll ${s.roll.toFixed(2)}<br>Arm switch: ${arm}<br><small>Push throttle UP: the left dot should go up. Pitch forward: right dot up. Roll/yaw right: dots go right. If not, Calibrate.</small>`;
  }

  // ---------------------------------------------------------------- wizard

  openWizard(padIndex: number): void {
    const gp = this.findPad(padIndex);
    if (!gp) return;
    this.wizard = new CalibrationWizard(gp.id);
    this.wizardPad = padIndex;
    $('#wizard').classList.remove('hidden');
  }

  private closeWizard(): void {
    this.wizard = null;
    $('#wizard').classList.add('hidden');
    this.lastSig = '';
  }

  private wizNext(): void {
    const w = this.wizard;
    if (!w) return;
    w.next();
    this.finishIfDone();
  }

  private finishIfDone(): void {
    const w = this.wizard;
    if (!w?.done) return;
    const gp = this.findPad(this.wizardPad);
    if (gp) {
      const base = this.input.profileFor(gp);
      this.input.saveProfile(gp.id, w.buildProfile(base));
      this.input.activePad = gp.index;
    }
    this.closeWizard();
  }

  private updateWizard(): void {
    const w = this.wizard!;
    const gp = this.findPad(this.wizardPad);
    if (!gp) {
      $('#wiz-text').textContent = 'Controller disconnected.';
      return;
    }
    w.sample(gp);
    const step = w.step;
    $('#wiz-title').textContent = `Calibrate: ${step.title}`;
    $('#wiz-step').textContent = `Step ${w.stepIndex + 1} of ${WIZARD_STEPS.length}`;
    $('#wiz-text').textContent = step.text;
    const det = w.detected;
    $('#wiz-axes').innerHTML =
      '<div class="axes">' +
      w.axes
        .map((v, i) => {
          const hl = det?.kind === 'axis' && det.index === i ? 'hl' : '';
          return `<span class="${hl}">axis ${i}</span><div class="track"><i style="left:${((v + 1) / 2) * 100}%"></i></div><span class="${hl}">${v.toFixed(2)}</span>`;
        })
        .join('') +
      '</div>' +
      `<div style="margin-top:8px;font-family:var(--mono);font-size:12px;color:var(--muted)">buttons: ${w.buttons
        .map((v, i) => (v > 0.5 ? `<b style="color:var(--accent2)">${i}</b>` : i))
        .join(' ')}</div>`;
    $('#wiz-detected').textContent = det
      ? det.kind === 'axis'
        ? `Detected axis ${det.index} (${det.sign > 0 ? '+' : '−'}) — let go and press Next (or Enter)`
        : `Detected button ${det.index} — press Next (or Enter)`
      : step.key === 'rest' || step.key === 'range'
        ? 'Press Next (or Enter) when ready'
        : 'Waiting for movement…';
    ($('#wiz-next') as HTMLButtonElement).disabled = !w.canAdvance;
    ($('#wiz-skip') as HTMLButtonElement).classList.toggle('hidden', !step.optional);
    ($('#wiz-back') as HTMLButtonElement).disabled = w.stepIndex === 0;
  }
}

const PC_DJI_STEPS = `<ol>
        <li>Install <b>DJI Assistant 2 (Consumer Drones Series)</b> once — it installs the USB driver. Close it afterwards.</li>
        <li>Turn the remote on and plug the PC into its <b>bottom USB-C port</b> (the phone cable can stay unplugged).</li>
        <li>Click Connect and choose <b>DJI USB VCOM For Protocol (COM…)</b> — not "Communications Port (COM1)", that is the PC's own port.</li>
      </ol>`;

const PC_DJI_TROUBLE = `<p style="font-size:13px;color:var(--muted)"><b>Port list empty?</b> Windows doesn't see the remote yet. Open Device Manager → <i>Ports (COM &amp; LPT)</i>: you should see "DJI USB VCOM For Protocol". If not, the driver is missing (install DJI Assistant 2), the remote is off, or the cable only charges — try another USB-C cable that carries data.</p>`;

const ANDROID_DJI_STEPS = `<ol>
        <li>Turn the remote on and plug its <b>bottom USB-C port</b> into the phone (a USB-A to USB-C adapter with an A-to-C cable works).</li>
        <li>Tap Connect and allow FPV Sim to use the remote when Android asks. Tick "always open" and next time it connects by itself.</li>
      </ol>`;
