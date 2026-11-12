/**
 * Drives every menu with a gamepad, so the sim never needs a keyboard or mouse:
 * D-pad / left stick moves a highlight between buttons, cards, lists and sliders,
 * A selects, B goes back, LB / RB switch tabs, Start flies, right stick scrolls.
 * Lists and sliders change with left / right.
 */

// Standard Gamepad API button numbers (Xbox names; PlayStation in brackets).
const A = 0; // Cross
const B = 1; // Circle
const Y = 3; // Triangle
const LB = 4; // L1
const RB = 5; // R1
const START = 9; // Options
const UP = 12;
const DOWN = 13;
const LEFT = 14;
const RIGHT = 15;

type Dir = 'up' | 'down' | 'left' | 'right';

const FOCUSABLE = 'button, select, input[type=range], .card';
const FIRST_DELAY = 380; // ms before a held direction starts repeating
const REPEAT = 110;

export interface PadNavHooks {
  /** Index of a pad that must be ignored (the one being calibrated), or -1. */
  ignorePad(): number;
  /** Menu tab ids in order, and the active one. */
  tabs(): string[];
  activeTab(): string;
  showTab(tab: string): void;
}

interface Layer {
  root: HTMLElement;
  /** Element to highlight when the layer opens. */
  first(): HTMLElement | null;
  back(): void;
  start?(): void;
}

export class PadNav {
  private prev: boolean[] = [];
  private focused: HTMLElement | null = null;
  private lastRect: DOMRect | null = null;
  private layerRoot: HTMLElement | null = null;
  private heldDir: Dir | null = null;
  private nextRepeat = 0;
  private padActive = false;
  /** A tab was just opened; its contents may draw a frame or two later. */
  private tabPending = false;
  private readonly hints = document.createElement('div');

  constructor(private readonly hooks: PadNavHooks) {
    this.hints.id = 'pad-hints';
    this.hints.className = 'hidden';
    document.body.appendChild(this.hints);
    // Back to the mouse: hide the highlight until the pad is used again.
    window.addEventListener('mousemove', () => this.setPadActive(false));
  }

  /** Call once per rendered frame, after the game has handled its own input. */
  update(now = performance.now()): void {
    const pad = this.readPads();
    const layer = this.layer();
    if (!layer) {
      this.setFocus(null);
      this.layerRoot = null;
      this.hints.classList.add('hidden');
      this.prev = pad.buttons;
      return;
    }
    if (pad.used) this.setPadActive(true);

    if (layer.root !== this.layerRoot) {
      // A new screen opened: start on its natural first item.
      this.layerRoot = layer.root;
      this.setFocus(layer.first());
    } else if (this.focused && !this.focused.isConnected) {
      // The panel redrew itself (e.g. after picking a drone): find the same spot again.
      this.setFocus(this.nearestTo(this.lastRect, layer.root) ?? layer.first());
    } else if (this.focused && !this.isVisible(this.focused)) {
      this.setFocus(layer.first());
    }
    if (this.tabPending && layer.root.id === 'menu') {
      const tab = document.querySelector<HTMLElement>('.tab.active');
      const first = tab && (tab.querySelector<HTMLElement>('.card.selected') ?? this.focusables(tab)[0]);
      if (first) {
        this.setFocus(first);
        this.tabPending = false;
      }
    }
    this.renderHints(layer);

    const prev = this.prev;
    const edge = (i: number) => pad.buttons[i] && !prev[i];
    this.prev = pad.buttons;

    if (edge(A)) this.activate();
    else if (edge(B)) layer.back();
    else if (edge(START)) layer.start?.();
    else if (edge(Y) && layer.root.id === 'menu') this.clickIfVisible('vr');
    else if ((edge(LB) || edge(RB)) && layer.root.id === 'menu') this.switchTab(edge(RB) ? 1 : -1);

    // Directions repeat while held, like a TV remote.
    const dir = pad.dir;
    if (dir !== this.heldDir) {
      this.heldDir = dir;
      if (dir) {
        this.move(dir, layer, false);
        this.nextRepeat = now + FIRST_DELAY;
      }
    } else if (dir && now >= this.nextRepeat) {
      this.move(dir, layer, true);
      this.nextRepeat = now + REPEAT;
    }

    // Right stick scrolls long pages.
    if (Math.abs(pad.scroll) > 0.25) this.scroller(layer.root)?.scrollBy(0, pad.scroll * 18);
  }

  // ------------------------------------------------------------------ pads

  private readPads(): { buttons: boolean[]; dir: Dir | null; scroll: number; used: boolean } {
    const buttons: boolean[] = [];
    let lx = 0;
    let ly = 0;
    let ry = 0;
    const skip = this.hooks.ignorePad();
    for (const gp of navigator.getGamepads?.() ?? []) {
      // Only pads with the standard layout have a D-pad, A/B and Start where we expect them.
      if (!gp || gp.mapping !== 'standard' || gp.index === skip) continue;
      gp.buttons.forEach((b, i) => (buttons[i] = buttons[i] || b.pressed));
      if (Math.abs(gp.axes[0] ?? 0) > Math.abs(lx)) lx = gp.axes[0];
      if (Math.abs(gp.axes[1] ?? 0) > Math.abs(ly)) ly = gp.axes[1];
      if (Math.abs(gp.axes[3] ?? 0) > Math.abs(ry)) ry = gp.axes[3];
    }
    let dir: Dir | null = null;
    if (buttons[UP]) dir = 'up';
    else if (buttons[DOWN]) dir = 'down';
    else if (buttons[LEFT]) dir = 'left';
    else if (buttons[RIGHT]) dir = 'right';
    else if (Math.max(Math.abs(lx), Math.abs(ly)) > 0.6) dir = Math.abs(lx) > Math.abs(ly) ? (lx > 0 ? 'right' : 'left') : ly > 0 ? 'down' : 'up';
    const used = buttons.some(Boolean) || dir !== null || Math.abs(ry) > 0.25;
    return { buttons, dir, scroll: ry, used };
  }

  // ------------------------------------------------------------------ screens

  /** The screen on top right now, or null while flying. */
  private layer(): Layer | null {
    const open = (id: string) => {
      const el = document.getElementById(id);
      return el && !el.classList.contains('hidden') ? el : null;
    };
    const byId = (id: string) => document.getElementById(id);
    let root: HTMLElement | null;
    if ((root = open('notice'))) {
      return { root, first: () => byId('notice-ok'), back: () => byId('notice-ok')?.click(), start: () => byId('notice-ok')?.click() };
    }
    if ((root = open('wizard'))) {
      return {
        root,
        first: () => byId('wiz-next'),
        back: () => byId('wiz-cancel')?.click(),
        start: () => byId('wiz-next')?.click(),
      };
    }
    if ((root = open('rec-name'))) {
      return { root, first: () => byId('rec-save'), back: () => byId('rec-discard')?.click(), start: () => byId('rec-save')?.click() };
    }
    if ((root = open('mapview'))) {
      return { root, first: () => root!.querySelector<HTMLElement>('#mapview-spots button'), back: () => byId('mapview-close')?.click() };
    }
    if ((root = open('rp-progress'))) {
      return { root, first: () => byId('rp-progress-cancel'), back: () => byId('rp-progress-cancel')?.click() };
    }
    if ((root = open('replay'))) {
      return { root, first: () => byId('rp-play'), back: () => byId('rp-back')?.click(), start: () => byId('rp-play')?.click() };
    }
    if ((root = open('pause'))) {
      // Start (resume) is handled by the game itself while paused.
      return { root, first: () => byId('resume'), back: () => byId('resume')?.click() };
    }
    if ((root = open('menu'))) {
      return {
        root,
        first: () => this.menuFirst(),
        back: () => {
          // B: jump up to the tab bar; from there it does nothing.
          const tab = root!.querySelector<HTMLElement>('#tabs button.active');
          if (tab && this.focused !== tab) this.setFocus(tab);
        },
        start: () => byId('fly')?.click(),
      };
    }
    return null;
  }

  /** The selected card on the open tab, else its first control. */
  private menuFirst(): HTMLElement | null {
    const tab = document.querySelector<HTMLElement>('.tab.active');
    return (
      tab?.querySelector<HTMLElement>('.card.selected') ??
      this.focusables(tab ?? document.body)[0] ??
      document.getElementById('fly')
    );
  }

  private switchTab(step: number): void {
    const tabs = this.hooks.tabs();
    const i = tabs.indexOf(this.hooks.activeTab());
    this.hooks.showTab(tabs[(i + step + tabs.length) % tabs.length]);
    this.setFocus(this.menuFirst());
    this.tabPending = true;
  }

  // ------------------------------------------------------------------ actions

  private activate(): void {
    const el = this.focused;
    if (!el) return;
    if (el instanceof HTMLSelectElement) {
      // A steps through a list's options (wrapping); left / right do the same both ways.
      this.stepSelect(el, 1, true);
      return;
    }
    if (el instanceof HTMLInputElement) return; // sliders move with left / right
    if (el instanceof HTMLButtonElement && el.disabled) return;
    el.click();
  }

  private move(dir: Dir, layer: Layer, held: boolean): void {
    this.tabPending = false;
    const el = this.focused;
    if (el && (dir === 'left' || dir === 'right')) {
      const step = dir === 'right' ? 1 : -1;
      if (el instanceof HTMLSelectElement) {
        this.stepSelect(el, step, false);
        return;
      }
      if (el instanceof HTMLInputElement && el.type === 'range') {
        this.stepRange(el, step, held);
        return;
      }
    }
    const next = el ? this.neighbour(el, dir, layer.root) : layer.first();
    if (next) this.setFocus(next);
  }

  private stepSelect(sel: HTMLSelectElement, step: number, wrap: boolean): void {
    const n = sel.options.length;
    let i = sel.selectedIndex + step;
    if (wrap) i = (i + n) % n;
    if (i < 0 || i >= n || i === sel.selectedIndex) return;
    sel.selectedIndex = i;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  private stepRange(input: HTMLInputElement, dir: number, held: boolean): void {
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    const step = Number(input.step) || 1;
    // Held: bigger steps, so a 10-1800 slider doesn't take forever.
    const size = Math.max(step, held ? (max - min) / 50 : (max - min) / 100);
    const snapped = Math.round((Number(input.value) + dir * size - min) / step) * step + min;
    const v = Math.min(max, Math.max(min, snapped));
    if (v === Number(input.value)) return;
    input.value = String(v);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private clickIfVisible(id: string): void {
    const el = document.getElementById(id);
    if (el && this.isVisible(el)) el.click();
  }

  // ------------------------------------------------------------------ focus

  private focusables(root: HTMLElement): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => this.isVisible(el) && !(el instanceof HTMLButtonElement && el.disabled && el.id !== 'wiz-next'),
    );
  }

  private isVisible(el: HTMLElement): boolean {
    if (!el.isConnected || el.closest('.hidden')) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  /** Closest item in a direction: mostly along it, a little off to the side is fine. */
  private neighbour(from: HTMLElement, dir: Dir, root: HTMLElement): HTMLElement | null {
    const a = from.getBoundingClientRect();
    const ax = a.left + a.width / 2;
    const ay = a.top + a.height / 2;
    let best: HTMLElement | null = null;
    let bestScore = Infinity;
    for (const el of this.focusables(root)) {
      if (el === from) continue;
      const b = el.getBoundingClientRect();
      const bx = b.left + b.width / 2;
      const by = b.top + b.height / 2;
      // Distance along the direction, measured edge to edge so wide and narrow items mix well.
      let along: number;
      let side: number;
      if (dir === 'down') [along, side] = [b.top - a.bottom, gap(a.left, a.right, b.left, b.right, ax, bx)];
      else if (dir === 'up') [along, side] = [a.top - b.bottom, gap(a.left, a.right, b.left, b.right, ax, bx)];
      else if (dir === 'right') [along, side] = [b.left - a.right, gap(a.top, a.bottom, b.top, b.bottom, ay, by)];
      else [along, side] = [a.left - b.right, gap(a.top, a.bottom, b.top, b.bottom, ay, by)];
      if (along < -4) continue;
      // Sideways moves stay on the same row; only up / down may jump to another part of the screen.
      if ((dir === 'left' || dir === 'right') && (b.bottom < a.top - a.height || b.top > a.bottom + a.height)) continue;
      const score = Math.max(0, along) + side * 3;
      if (score < bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  private nearestTo(rect: DOMRect | null, root: HTMLElement): HTMLElement | null {
    if (!rect) return null;
    let best: HTMLElement | null = null;
    let bestD = Infinity;
    for (const el of this.focusables(root)) {
      const r = el.getBoundingClientRect();
      const d = Math.hypot(r.left - rect.left, r.top - rect.top);
      if (d < bestD) {
        bestD = d;
        best = el;
      }
    }
    return best;
  }

  private setFocus(el: HTMLElement | null): void {
    if (this.focused === el) return;
    this.focused?.classList.remove('pad-focus');
    this.focused = el;
    if (!el) return;
    this.lastRect = el.getBoundingClientRect();
    el.classList.toggle('pad-focus', this.padActive);
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  private setPadActive(on: boolean): void {
    if (this.padActive === on) return;
    this.padActive = on;
    this.focused?.classList.toggle('pad-focus', on);
    document.body.classList.toggle('pad-mode', on);
  }

  private scroller(root: HTMLElement): HTMLElement | null {
    if (root.id === 'menu') return root.querySelector('main');
    return root.querySelector('.panel');
  }

  private hintsFor = '';

  private renderHints(layer: Layer): void {
    const on = this.padActive;
    this.hints.classList.toggle('hidden', !on);
    if (!on) return;
    const id = layer.root.id;
    const key = (k: string, cls = '') => `<b class="${cls}">${k}</b>`;
    const html =
      id === 'menu'
        ? `${key('A', 'a')} Select ${key('B', 'b')} Back ${key('◀▶')} Change ${key('LB')}${key('RB')} Tabs ${key('Y', 'y')} VR ${key('START')} Fly`
        : id === 'pause'
          ? `${key('A', 'a')} Select ${key('B', 'b')}${key('START')} Resume`
          : id === 'wizard'
            ? `${key('A', 'a')} Select ${key('START')} Next ${key('B', 'b')} Cancel`
            : `${key('A', 'a')} OK`;
    if (html !== this.hintsFor) {
      this.hintsFor = html;
      this.hints.innerHTML = html;
    }
  }
}

/** Sideways offset between two spans: 0 when they overlap, else the centre distance. */
function gap(a0: number, a1: number, b0: number, b1: number, ac: number, bc: number): number {
  return b1 >= a0 && b0 <= a1 ? Math.abs(bc - ac) * 0.1 : Math.abs(bc - ac);
}
