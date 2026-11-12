import type { MotorSound } from '../audio/motorSound';
import type { CameraMode } from '../camera/fpvCamera';
import { getDrone } from '../drones/specs';
import { getMap } from '../maps/maps';
import {
  editedDuration,
  firstKept,
  formatClock,
  normalizeCuts,
  records,
  skipCuts,
  toEdited,
  type OtherTrack,
  type RecordMeta,
} from './recording';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export interface EditorHooks {
  /** Load the map and drone of a recording and switch the game to replay. */
  open(meta: RecordMeta, frames: Float32Array, others: OtherTrack[]): Promise<void>;
  /** Leave the replay, back to the Records tab. */
  close(): void;
  exportVideo(): void;
}

/**
 * The Records tab (every saved flight) and the replay editor: play / scrub, cut parts out,
 * OSD on or off, camera, drone sound and music. Edits are saved with the recording as you go.
 */
export class ReplayEditor {
  meta: RecordMeta | null = null;
  frames: Float32Array | null = null;
  /** Other pilots in this recording (multiplayer). */
  others: OtherTrack[] = [];
  t = 0;
  playing = false;
  private markIn: number | null = null;
  private musicBuffer: AudioBuffer | null = null;
  private saveTimer = 0;

  constructor(
    private readonly sound: MotorSound,
    private readonly hooks: EditorHooks,
  ) {
    $('rp-back').addEventListener('click', () => this.hooks.close());
    $('rp-export').addEventListener('click', () => this.hooks.exportVideo());
    $('rp-play').addEventListener('click', () => this.setPlaying(!this.playing));
    $('rp-start').addEventListener('click', () => this.seek(0));
    $('rp-back5').addEventListener('click', () => this.seek(this.t - 5));
    $('rp-fwd5').addEventListener('click', () => this.seek(this.t + 5));
    $('rp-in').addEventListener('click', () => {
      this.markIn = this.t;
      this.drawTimeline();
    });
    $('rp-cut').addEventListener('click', () => this.cutToHere());
    const tl = $('rp-timeline');
    const scrub = (e: PointerEvent) => {
      const r = tl.getBoundingClientRect();
      this.seek(((e.clientX - r.left) / r.width) * (this.meta?.duration ?? 0));
    };
    tl.addEventListener('pointerdown', (e) => {
      tl.setPointerCapture(e.pointerId);
      scrub(e);
    });
    tl.addEventListener('pointermove', (e) => e.buttons && scrub(e));

    $<HTMLInputElement>('rp-name').addEventListener('input', (e) => {
      if (!this.meta) return;
      this.meta.name = (e.target as HTMLInputElement).value.trim() || this.meta.name;
      this.save();
    });
    const edit = (fn: (m: RecordMeta) => void) => () => {
      if (!this.meta) return;
      fn(this.meta);
      this.applySound();
      this.save();
    };
    $('rp-osd').addEventListener('change', edit((m) => (m.edits.showOsd = $<HTMLInputElement>('rp-osd').checked)));
    $('rp-cam').addEventListener('change', edit((m) => (m.edits.camera = $<HTMLSelectElement>('rp-cam').value as CameraMode)));
    $('rp-names').addEventListener('change', edit((m) => (m.edits.playerNames = $<HTMLInputElement>('rp-names').checked)));
    $('rp-motor').addEventListener('change', edit((m) => (m.edits.motorSound = $<HTMLInputElement>('rp-motor').checked)));
    $('rp-motor-vol').addEventListener('input', edit((m) => (m.edits.motorVolume = +$<HTMLInputElement>('rp-motor-vol').value)));
    $('rp-music-vol').addEventListener('input', edit((m) => (m.edits.musicVolume = +$<HTMLInputElement>('rp-music-vol').value)));
    $('rp-music-pick').addEventListener('click', () => $('rp-music-file').click());
    $('rp-music-file').addEventListener('change', async () => {
      const f = $<HTMLInputElement>('rp-music-file').files?.[0];
      if (!f || !this.meta) return;
      this.meta.edits.music = { name: f.name, blob: f };
      await this.loadMusic();
      this.save();
      this.refresh();
    });
    $('rp-music-del').addEventListener('click', () => {
      if (!this.meta) return;
      this.meta.edits.music = null;
      this.musicBuffer = null;
      this.sound.stopMusic();
      this.save();
      this.refresh();
    });
  }

  // ---------------------------------------------------------------- list

  async renderList(): Promise<void> {
    const list = $('records-list');
    let all: RecordMeta[] = [];
    try {
      all = await records.list();
    } catch (err) {
      list.innerHTML = `<div class="rec-empty">Recordings are not available here: ${(err as Error).message}</div>`;
      return;
    }
    list.innerHTML = '';
    if (!all.length) {
      list.innerHTML =
        '<div class="rec-empty">No recordings yet.<br>While flying press <b>V</b> (or <b>Start recording</b> in the pause menu) to record, and again to stop. ' +
        'Recordings keep the flight itself, so the replay is always a clean picture, even where the video link broke up.</div>';
      return;
    }
    for (const m of all) {
      const c = document.createElement('div');
      c.className = 'card rec-card';
      const date = new Date(m.created).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
      const len = editedDuration(m.duration, m.edits.cuts);
      c.innerHTML = `<h3></h3><div class="sub">${getMap(m.mapId).name} · ${getDrone(m.droneId).name} · ${formatClock(len)}${m.edits.cuts.length ? ' (cut)' : ''}${m.others ? ` · 👥 ${m.others + 1} pilots` : ''}</div>
        <div class="sub">${date}${m.edits.music ? ' · ♪ ' : ''}</div>
        <div class="row"><button class="fly rec-edit">Edit</button><button class="rec-del">Delete</button></div>`;
      c.querySelector('h3')!.textContent = m.name;
      c.querySelector('.rec-edit')!.addEventListener('click', () => void this.edit(m));
      c.querySelector('.rec-del')!.addEventListener('click', async () => {
        if (!confirm(`Delete "${m.name}"?`)) return;
        await records.remove(m.id);
        void this.renderList();
      });
      list.appendChild(c);
    }
  }

  private async edit(m: RecordMeta): Promise<void> {
    const frames = await records.frames(m.id);
    this.others = m.others ? await records.others(m.id).catch(() => []) : [];
    this.meta = m;
    this.frames = frames;
    m.edits.cuts = normalizeCuts(m.edits.cuts, m.duration);
    this.t = firstKept(m.edits.cuts);
    this.playing = false;
    this.markIn = null;
    this.musicBuffer = null;
    await this.hooks.open(m, frames, this.others);
    await this.loadMusic();
    this.refresh();
    $('replay').classList.remove('hidden');
  }

  hide(): void {
    this.setPlaying(false);
    $('replay').classList.add('hidden');
    this.meta = null;
    this.frames = null;
    this.others = [];
  }

  // ---------------------------------------------------------------- playback

  /** Advances the playhead (skipping cuts) and returns the raw time to show. */
  advance(dt: number): number {
    const m = this.meta;
    if (!m) return 0;
    if (this.playing) {
      this.t = skipCuts(this.t + dt, m.edits.cuts);
      if (this.t >= m.duration) {
        this.t = m.duration;
        this.setPlaying(false);
      }
      this.drawTimeline();
    }
    return this.t;
  }

  /** Edited (output) time of the playhead. */
  get editedTime(): number {
    return this.meta ? toEdited(this.t, this.meta.edits.cuts) : 0;
  }

  get editedLength(): number {
    return this.meta ? editedDuration(this.meta.duration, this.meta.edits.cuts) : 0;
  }

  setPlaying(on: boolean): void {
    if (!this.meta) return;
    if (on && this.t >= this.meta.duration - 0.05) this.t = firstKept(this.meta.edits.cuts);
    this.playing = on;
    $('rp-play').textContent = on ? '⏸ Pause' : '▶ Play';
    this.applySound();
  }

  seek(t: number): void {
    if (!this.meta) return;
    this.t = skipCuts(Math.max(0, Math.min(this.meta.duration, t)), this.meta.edits.cuts);
    if (this.playing) this.applySound();
    this.drawTimeline();
  }

  /** Music and drone sound follow the playhead; silent while paused. */
  applySound(): void {
    const e = this.meta?.edits;
    if (!e) return;
    this.sound.setDroneLevel(this.playing && e.motorSound ? e.motorVolume : 0);
    if (this.playing && this.musicBuffer) this.sound.playMusic(this.musicBuffer, this.editedTime, e.musicVolume);
    else this.sound.stopMusic();
  }

  private async loadMusic(): Promise<void> {
    const music = this.meta?.edits.music;
    const ctx = this.sound.context;
    if (!music || !ctx) {
      this.musicBuffer = null;
      return;
    }
    try {
      this.musicBuffer = await ctx.decodeAudioData(await music.blob.arrayBuffer());
    } catch {
      this.musicBuffer = null;
      alert(`Could not read "${music.name}" as audio.`);
    }
  }

  get music(): AudioBuffer | null {
    return this.musicBuffer;
  }

  private cutToHere(): void {
    const m = this.meta;
    if (!m) return;
    const a = this.markIn ?? firstKept(m.edits.cuts);
    if (Math.abs(this.t - a) < 0.1) return;
    m.edits.cuts = normalizeCuts([...m.edits.cuts, [a, this.t]], m.duration);
    this.markIn = null;
    this.seek(Math.max(a, this.t));
    this.save();
    this.refresh();
  }

  // ---------------------------------------------------------------- UI

  refresh(): void {
    const m = this.meta;
    if (!m) return;
    const e = m.edits;
    $<HTMLInputElement>('rp-name').value = m.name;
    $('rp-info').textContent = `${getMap(m.mapId).name} · ${getDrone(m.droneId).name}`;
    $<HTMLInputElement>('rp-osd').checked = e.showOsd;
    $<HTMLSelectElement>('rp-cam').value = e.camera;
    $<HTMLInputElement>('rp-motor').checked = e.motorSound;
    $<HTMLInputElement>('rp-motor-vol').value = String(e.motorVolume);
    $<HTMLInputElement>('rp-music-vol').value = String(e.musicVolume);
    const names = $<HTMLInputElement>('rp-names');
    names.checked = e.playerNames;
    names.disabled = !this.others.length;
    names.parentElement!.title = this.others.length ? `${this.others.length} other pilot${this.others.length > 1 ? 's' : ''} in this flight` : 'Only for flights recorded on a multiplayer server';
    names.parentElement!.querySelector('small')!.textContent = this.others.length ? `(${this.others.length} other pilot${this.others.length > 1 ? 's' : ''})` : '(multiplayer flights only)';
    $('rp-music-name').textContent = e.music ? e.music.name : 'none';
    $('rp-music-del').classList.toggle('hidden', !e.music);
    $('rp-music-vol').classList.toggle('hidden', !e.music);
    const list = $('rp-cutlist');
    list.innerHTML = '';
    e.cuts.forEach(([a, b], i) => {
      const btn = document.createElement('button');
      btn.textContent = `✂ ${formatClock(a)}–${formatClock(b)} ✕`;
      btn.title = 'Put this part back';
      btn.addEventListener('click', () => {
        e.cuts.splice(i, 1);
        this.save();
        this.refresh();
      });
      list.appendChild(btn);
    });
    this.drawTimeline();
  }

  drawTimeline(): void {
    const m = this.meta;
    if (!m) return;
    const pct = (t: number) => `${(t / m.duration) * 100}%`;
    $('rp-head').style.left = pct(this.t);
    const mark = $('rp-mark');
    mark.style.display = this.markIn === null ? 'none' : 'block';
    if (this.markIn !== null) mark.style.left = pct(this.markIn);
    const cuts = $('rp-cuts');
    if (cuts.childElementCount !== m.edits.cuts.length || cuts.dataset.k !== JSON.stringify(m.edits.cuts)) {
      cuts.dataset.k = JSON.stringify(m.edits.cuts);
      cuts.innerHTML = m.edits.cuts.map(([a, b]) => `<i style="left:${pct(a)};width:${pct(b - a)}"></i>`).join('');
    }
    $('rp-time').textContent = `${formatClock(this.editedTime)} / ${formatClock(this.editedLength)}`;
  }

  private save(): void {
    const m = this.meta;
    if (!m) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => void records.save(m), 300);
  }
}
