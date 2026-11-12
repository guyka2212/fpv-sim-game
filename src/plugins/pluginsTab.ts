import { saveFile } from '../replay/export';
import { keyLabel, padLabel, readInfo, type PluginHost } from './host';

const DOCS = 'https://guyka2212.github.io/fpv-sim/plugins.html';

/** Example plugins that ship with the game (Plugins tab → Examples). */
const EXAMPLES = import.meta.glob('../../examples/plugins/*.js', { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** The Plugins tab: add .js files, switch them on and off, remove them, try the examples. */
export class PluginsTab {
  private readonly root = document.getElementById('plugins')!;

  constructor(private readonly host: PluginHost) {
    host.onChange = () => this.render();
  }

  render(): void {
    const h = this.host;
    const cards = h.list
      .map((p) => {
        const err = h.errors.get(p.id);
        const status = err
          ? `<span class="tag bad">Error</span>`
          : h.isRunning(p.id)
            ? `<span class="tag on">Running</span>`
            : h.blocked.has(p.id)
              ? `<span class="tag warn" title="The server you're on doesn't allow this plugin">Paused by server</span>`
              : `<span class="tag off">Off</span>`;
        const keys = Object.values(p.keys ?? {})
          .map((k) => `<span class="keychip">${esc(k.name)}: ${esc([keyLabel(k.key), k.pad !== undefined ? padLabel(k.pad) : ''].filter(Boolean).join(' / ') || 'none')}</span>`)
          .join('');
        return `<div class="card plugin-card" data-id="${esc(p.id)}">
          <h3>${esc(p.name)} ${p.version ? `<small>v${esc(p.version)}</small>` : ''} ${status}</h3>
          <div class="sub">${p.author ? `by ${esc(p.author)} · ` : ''}<code>${esc(p.id)}</code></div>
          ${p.description ? `<p>${esc(p.description)}</p>` : ''}
          ${keys ? `<div class="keychips">${keys} <span class="sub">(change in Settings → Plugin shortcuts)</span></div>` : ''}
          ${err ? `<pre class="plugin-err">${esc(err)}</pre>` : ''}
          <div class="row">
            <button data-act="toggle">${p.enabled ? 'Turn off' : 'Turn on'}</button>
            <button data-act="save">Save .js</button>
            <button data-act="remove" class="danger">Remove</button>
          </div>
        </div>`;
      })
      .join('');
    const examples = Object.entries(EXAMPLES)
      .map(([path, code]) => {
        const file = path.split('/').pop()!;
        const info = readInfo(code, file);
        const have = h.list.some((p) => p.id === info.id);
        return `<div class="card plugin-card example"><h3>${esc(info.name ?? file)}</h3><p>${esc(info.description ?? '')}</p>
          <div class="row"><button data-example="${esc(path)}" ${have ? 'disabled' : ''}>${have ? 'Added' : 'Add'}</button><button data-example-save="${esc(path)}">Save .js</button></div></div>`;
      })
      .join('');

    this.root.innerHTML = `
      <div class="mp-box">
        <div class="row mp-head"><h2>Plugins</h2><span class="rp-gap"></span>
          <a class="btn-link" href="${DOCS}" target="_blank" rel="noopener">📖 How to make plugins</a></div>
        <p class="sub">Plugins are JavaScript files that can change anything in the game: new on-screen text and panels, menu tabs, settings, keys, objects on the map, physics and more.</p>
        <p class="plugin-warn">⚠ A plugin can do anything this game can, including with your account on this device. Only add plugins you wrote yourself or got from someone you trust.</p>
        <div class="row">
          <button id="plugin-add" class="fly">+ Add plugin (.js)</button><input id="plugin-file" type="file" accept=".js,.mjs,text/javascript" multiple hidden />
          <button id="plugin-reload">Reload all</button>
        </div>
      </div>
      <h3 class="plugin-h">Installed</h3>
      <div class="cards wide">${cards || '<p class="sub">No plugins yet. Add a .js file, or start from an example below.</p>'}</div>
      <h3 class="plugin-h">Examples</h3>
      <div class="cards wide">${examples}</div>`;

    const file = this.root.querySelector<HTMLInputElement>('#plugin-file')!;
    this.root.querySelector('#plugin-add')!.addEventListener('click', () => file.click());
    file.addEventListener('change', async () => {
      for (const f of Array.from(file.files ?? [])) {
        if (f.size > 2_000_000) continue;
        await h.add(await f.text(), f.name);
      }
      file.value = '';
    });
    this.root.querySelector('#plugin-reload')!.addEventListener('click', () => void h.reloadAll());
    this.root.querySelectorAll<HTMLElement>('.plugin-card[data-id]').forEach((card) => {
      const id = card.dataset.id!;
      const p = h.list.find((s) => s.id === id)!;
      card.querySelector('[data-act="toggle"]')!.addEventListener('click', () => void h.setEnabled(id, !p.enabled));
      card.querySelector('[data-act="save"]')!.addEventListener('click', () => download(`${id}.js`, p.code));
      card.querySelector('[data-act="remove"]')!.addEventListener('click', () => {
        if (confirm(`Remove the plugin "${p.name}"?`)) h.remove(id);
      });
    });
    this.root.querySelectorAll<HTMLButtonElement>('[data-example]').forEach((b) =>
      b.addEventListener('click', () => void h.add(EXAMPLES[b.dataset.example!], b.dataset.example!.split('/').pop()!)),
    );
    this.root.querySelectorAll<HTMLButtonElement>('[data-example-save]').forEach((b) =>
      b.addEventListener('click', () => download(b.dataset.exampleSave!.split('/').pop()!, EXAMPLES[b.dataset.exampleSave!])),
    );
  }
}

function download(name: string, text: string): void {
  saveFile(new Blob([text], { type: 'text/javascript' }), name);
}
