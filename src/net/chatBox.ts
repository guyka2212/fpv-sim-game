const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

/**
 * The in-flight multiplayer chat: the latest lines in the corner, fading after a few seconds;
 * T opens a box to type (Enter sends, Esc closes), and while it is open every line shows.
 */
export class ChatBox {
  private readonly root = $('chat');
  private readonly lines = $('chat-lines');
  private readonly input = $<HTMLInputElement>('chat-input');
  onSend: (text: string) => void = () => {};

  constructor() {
    this.input.addEventListener('keydown', (e) => {
      // Typing must not fly the drone.
      e.stopPropagation();
      // Holding T a moment too long must not type it into the empty box.
      if (e.repeat && e.code === 'KeyT' && !this.input.value) {
        e.preventDefault();
        return;
      }
      if (e.key === 'Enter') {
        const text = this.input.value.trim();
        if (text) this.onSend(text);
        this.close();
      } else if (e.key === 'Escape') this.close();
    });
    this.input.addEventListener('keyup', (e) => e.stopPropagation());
    this.input.addEventListener('blur', () => this.close());
  }

  get typing(): boolean {
    return !this.input.classList.contains('hidden');
  }

  show(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
    if (!on) this.close();
  }

  clear(): void {
    this.lines.innerHTML = '';
  }

  add(from: string, text: string, system = false): void {
    const d = document.createElement('div');
    if (system) {
      d.className = 'sys';
      d.textContent = text;
    } else {
      const b = document.createElement('b');
      b.textContent = `${from}: `;
      d.append(b, text);
    }
    this.lines.appendChild(d);
    while (this.lines.childElementCount > 8) this.lines.firstElementChild?.remove();
    setTimeout(() => d.classList.add('old'), 10000);
  }

  open(): void {
    if (this.root.classList.contains('hidden')) return;
    this.root.classList.add('typing');
    this.input.classList.remove('hidden');
    this.input.value = '';
    // After this key press, so the T itself is not typed.
    setTimeout(() => this.input.focus(), 0);
  }

  close(): void {
    this.root.classList.remove('typing');
    this.input.classList.add('hidden');
    this.input.blur();
  }
}
