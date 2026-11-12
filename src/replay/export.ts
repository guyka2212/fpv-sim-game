import { androidSaveFile, isAndroidApp } from '../platform/android';
import { notice } from '../ui/notice';

/**
 * Video export: the replay plays in real time while each rendered frame (plus the OSD, when it is
 * on) is copied to a canvas that a MediaRecorder encodes, with the drone sound and music mixed in.
 */

const _range = document.createRange();

/** Draws the visible text and canvases of an HTML overlay (the OSD) onto ctx, scaled to it. */
export function drawOverlay(ctx: CanvasRenderingContext2D, root: HTMLElement, scale: number): void {
  if (root.classList.contains('hidden')) return;
  const base = root.getBoundingClientRect();
  for (const c of root.querySelectorAll('canvas')) {
    const r = c.getBoundingClientRect();
    if (r.width && r.height && c.width && c.height) ctx.drawImage(c, (r.left - base.left) * scale, (r.top - base.top) * scale, r.width * scale, r.height * scale);
  }
  // Stick boxes and dots.
  for (const el of root.querySelectorAll<HTMLElement>('.stick, .stick i, #osd-cross')) {
    const r = el.getBoundingClientRect();
    if (!r.width) continue;
    const st = getComputedStyle(el);
    const x = (r.left - base.left) * scale;
    const y = (r.top - base.top) * scale;
    if (st.backgroundColor && st.backgroundColor !== 'rgba(0, 0, 0, 0)') {
      ctx.fillStyle = st.backgroundColor;
      ctx.fillRect(x, y, r.width * scale, r.height * scale);
    }
    if (parseFloat(st.borderTopWidth) > 0) {
      ctx.strokeStyle = st.borderTopColor;
      ctx.lineWidth = parseFloat(st.borderTopWidth) * scale;
      ctx.strokeRect(x, y, r.width * scale, r.height * scale);
    }
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const text = n.textContent ?? '';
    if (!text.trim()) continue;
    const parent = n.parentElement!;
    const st = getComputedStyle(parent);
    if (st.visibility === 'hidden' || st.display === 'none' || parseFloat(st.opacity) === 0) continue;
    _range.selectNodeContents(n);
    const rects = Array.from(_range.getClientRects()).filter((r) => r.width > 0);
    if (!rects.length) continue;
    const size = parseFloat(st.fontSize) * scale;
    ctx.font = `${st.fontWeight} ${size}px ${st.fontFamily}`;
    const lines = rects.length > 1 ? text.split('\n').filter((l) => l.trim()) : [text.replace(/\n/g, ' ')];
    const pairs = lines.length === rects.length ? lines.map((l, i) => [l, rects[i]] as const) : [[lines.join(' '), rects[0]] as const];
    for (const [line, r] of pairs) {
      const x = (r.left - base.left) * scale;
      const y = (r.top - base.top) * scale + (r.height * scale + size * 0.7) / 2;
      ctx.lineWidth = Math.max(2, size * 0.16);
      ctx.strokeStyle = 'rgba(0,0,0,0.9)';
      ctx.strokeText(line.trim(), x, y);
      ctx.fillStyle = st.color;
      ctx.fillText(line.trim(), x, y);
    }
  }
}

export interface VideoWriter {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  finish(): Promise<Blob>;
  mime: string;
}

/** Best supported format: MP4 (H.264) where the browser can, else WebM. */
function pickMime(): string {
  for (const m of ['video/mp4;codecs=avc1.640028,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return '';
}

export function startVideo(width: number, height: number, audio: MediaStream | null, fps = 60): VideoWriter {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  const stream = canvas.captureStream(fps);
  audio?.getAudioTracks().forEach((t) => stream.addTrack(t));
  const mime = pickMime();
  const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: Math.round(width * height * fps * 0.12), audioBitsPerSecond: 192000 });
  const chunks: Blob[] = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.start(500);
  return {
    canvas,
    ctx,
    mime: rec.mimeType || mime,
    finish: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          resolve(new Blob(chunks, { type: rec.mimeType || 'video/webm' }));
        };
        rec.stop();
      }),
  };
}

/** Hands a finished file to the user (a download / save dialog). */
export function saveFile(blob: Blob, name: string): void {
  if (isAndroidApp) {
    androidSaveFile(blob, name).then(
      (where) => notice(`Saved: ${where}`),
      (err: Error) => notice(`Could not save the file: ${err.message}`),
    );
    return;
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 60000);
}
