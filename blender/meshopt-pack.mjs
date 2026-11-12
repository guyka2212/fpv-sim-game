// Lossless meshopt compression for a GLB: node blender/meshopt-pack.mjs in.glb out.glb
//
// Blender's own meshopt export rounds every vertex to a grid (about 6 cm on a 220 m map), which
// snaps glass panes, trims and signs back into the wall they sit on: they flicker (z-fighting).
// This keeps the exact float positions and only packs the bytes (EXT_meshopt_compression, which
// the game already decodes): vertex buffers in ATTRIBUTES mode, triangle lists in TRIANGLES mode.
import { readFileSync, writeFileSync } from 'node:fs';
import { MeshoptEncoder } from 'meshoptimizer';

const [, , inPath, outPath] = process.argv;
await MeshoptEncoder.ready;

const glb = readFileSync(inPath);
if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error('not a GLB file');
let jsonChunk = null;
let bin = Buffer.alloc(0);
for (let off = 12; off < glb.length; ) {
  const len = glb.readUInt32LE(off);
  const type = glb.readUInt32LE(off + 4);
  const data = glb.subarray(off + 8, off + 8 + len);
  if (type === 0x4e4f534a) jsonChunk = JSON.parse(data.toString('utf8'));
  else if (type === 0x004e4942) bin = data;
  off += 8 + len;
}
const gltf = jsonChunk;
const views = gltf.bufferViews ?? [];
const SIZES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
const BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };

// Which views hold indices of triangle lists, and how many accessors share each view.
const useCount = new Map();
for (const a of gltf.accessors ?? []) if (a.bufferView !== undefined) useCount.set(a.bufferView, (useCount.get(a.bufferView) ?? 0) + 1);
const triangleIndex = new Set();
const otherIndex = new Set();
for (const m of gltf.meshes ?? [])
  for (const p of m.primitives) {
    if (p.indices === undefined) continue;
    ((p.mode ?? 4) === 4 ? triangleIndex : otherIndex).add(p.indices);
  }

const pad4 = (n) => (n + 3) & ~3;
const chunks = []; // pieces of the new BIN chunk
let binLen = 0;
let fallbackLen = 0;
const push = (bytes) => {
  const at = binLen;
  chunks.push(bytes);
  binLen += bytes.length;
  const pad = pad4(binLen) - binLen;
  if (pad) {
    chunks.push(Buffer.alloc(pad));
    binLen += pad;
  }
  return at;
};

let packed = 0;
views.forEach((v, vi) => {
  const src = bin.subarray(v.byteOffset ?? 0, (v.byteOffset ?? 0) + v.byteLength);
  const acc = (gltf.accessors ?? []).filter((a) => a.bufferView === vi);
  let enc = null;
  if (acc.length === 1 && useCount.get(vi) === 1 && (v.buffer ?? 0) === 0) {
    const a = acc[0];
    const ai = gltf.accessors.indexOf(a);
    const elem = SIZES[a.type] * BYTES[a.componentType];
    const isIndex = triangleIndex.has(ai) || otherIndex.has(ai);
    if (triangleIndex.has(ai) && !otherIndex.has(ai) && a.count % 3 === 0 && (elem === 2 || elem === 4) && !(a.byteOffset > 0)) {
      enc = { mode: 'TRIANGLES', count: a.count, stride: elem };
    } else if (!isIndex && !(a.byteOffset > 0)) {
      const stride = v.byteStride ?? elem;
      if (stride % 4 === 0 && stride <= 256 && stride * a.count === v.byteLength) enc = { mode: 'ATTRIBUTES', count: a.count, stride };
    }
  }
  if (!enc) {
    v.buffer = 0;
    v.byteOffset = push(Buffer.from(src));
    return;
  }
  const data = MeshoptEncoder.encodeGltfBuffer(new Uint8Array(src), enc.count, enc.stride, enc.mode);
  const at = push(Buffer.from(data.buffer, data.byteOffset, data.byteLength));
  // The view now points into an empty "fallback" buffer; the extension holds the packed bytes.
  v.buffer = 1;
  v.byteOffset = fallbackLen;
  fallbackLen = pad4(fallbackLen + v.byteLength);
  v.extensions = {
    ...v.extensions,
    EXT_meshopt_compression: { buffer: 0, byteOffset: at, byteLength: data.byteLength, byteStride: enc.stride, count: enc.count, mode: enc.mode },
  };
  if (enc.mode === 'ATTRIBUTES') v.byteStride ??= enc.stride;
  packed++;
});

gltf.buffers = [{ byteLength: binLen }, { byteLength: fallbackLen, extensions: { EXT_meshopt_compression: { fallback: true } } }];
for (const key of ['extensionsUsed', 'extensionsRequired']) {
  gltf[key] = Array.from(new Set([...(gltf[key] ?? []), 'EXT_meshopt_compression']));
}

let json = Buffer.from(JSON.stringify(gltf), 'utf8');
json = Buffer.concat([json, Buffer.alloc(pad4(json.length) - json.length, 0x20)]);
const body = Buffer.concat(chunks);
const header = Buffer.alloc(12);
header.writeUInt32LE(0x46546c67, 0);
header.writeUInt32LE(2, 4);
header.writeUInt32LE(12 + 8 + json.length + 8 + body.length, 8);
const ch = (len, type) => {
  const b = Buffer.alloc(8);
  b.writeUInt32LE(len, 0);
  b.writeUInt32LE(type, 4);
  return b;
};
writeFileSync(outPath, Buffer.concat([header, ch(json.length, 0x4e4f534a), json, ch(body.length, 0x004e4942), body]));
console.log(`meshopt-pack: ${views.length} views, ${packed} packed, ${(glb.length / 1e6).toFixed(2)} MB -> ${((12 + 16 + json.length + body.length) / 1e6).toFixed(2)} MB`);
