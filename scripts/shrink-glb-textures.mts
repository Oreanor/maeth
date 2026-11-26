// Downscales the textures baked into the piece GLBs, in place.
//
// The sets arrived with 2048² base colour, metal/rough and normal maps. Seen at
// the closest the camera is allowed (7.2 units, 35° fov) a piece stands about a
// quarter of the screen tall, and the side facing the camera covers about half
// of its UV atlas — so 1024² already has a texel for every device pixel of a
// 2× phone held upright. The other three quarters of a 2048² map were download
// and video memory (each map decodes to 16 MB with mips) that no screen showed.
//
// Usage: npx tsx scripts/shrink-glb-textures.mts [maxSize=1024] [files...]
// With no files, every GLB under public/models/. Already-small maps are left
// alone, so running it twice changes nothing. Originals stay in git history.

import fs from 'node:fs'
import path from 'node:path'
import sharp from 'sharp'

const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942

interface Gltf {
  images?: { bufferView?: number; mimeType?: string }[]
  bufferViews: { buffer: number; byteOffset?: number; byteLength: number; byteStride?: number }[]
  buffers: { byteLength: number }[]
  textures?: { source?: number; extensions?: Record<string, { source?: number }> }[]
  materials?: {
    normalTexture?: { index: number }
  }[]
}

function readGlb(file: string): { json: Gltf; bin: Buffer } {
  const buf = fs.readFileSync(file)
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`not a glb: ${file}`)
  let off = 12
  let json: Gltf | null = null
  let bin: Buffer | null = null
  while (off < buf.length) {
    const len = buf.readUInt32LE(off)
    const type = buf.readUInt32LE(off + 4)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === JSON_CHUNK) json = JSON.parse(data.toString('utf8'))
    else if (type === BIN_CHUNK) bin = Buffer.from(data)
    off += 8 + len
  }
  if (!json || !bin) throw new Error(`missing chunk: ${file}`)
  if (json.buffers.length !== 1) throw new Error(`expected one buffer: ${file}`)
  return { json, bin }
}

function pad4(buf: Buffer, fill: number): Buffer {
  const extra = (4 - (buf.length % 4)) % 4
  return extra ? Buffer.concat([buf, Buffer.alloc(extra, fill)]) : buf
}

function writeGlb(file: string, json: Gltf, bin: Buffer) {
  const jsonBuf = pad4(Buffer.from(JSON.stringify(json), 'utf8'), 0x20)
  const binBuf = pad4(bin, 0)
  const header = Buffer.alloc(12)
  header.writeUInt32LE(0x46546c67, 0)
  header.writeUInt32LE(2, 4)
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8)
  const chunk = (type: number, data: Buffer) => {
    const h = Buffer.alloc(8)
    h.writeUInt32LE(data.length, 0)
    h.writeUInt32LE(type, 4)
    return Buffer.concat([h, data])
  }
  fs.writeFileSync(file, Buffer.concat([header, chunk(JSON_CHUNK, jsonBuf), chunk(BIN_CHUNK, binBuf)]))
}

/** Image indices used as normal maps: those keep more quality, since block
 *  artefacts in a normal map show up as lighting rather than as colour. */
function normalImages(json: Gltf): Set<number> {
  const out = new Set<number>()
  for (const material of json.materials ?? []) {
    const tex = material.normalTexture && json.textures?.[material.normalTexture.index]
    if (!tex) continue
    const source = tex.extensions?.EXT_texture_webp?.source ?? tex.source
    if (source != null) out.add(source)
  }
  return out
}

async function shrink(file: string, maxSize: number): Promise<[number, number]> {
  const before = fs.statSync(file).size
  const { json, bin } = readGlb(file)
  const normals = normalImages(json)
  const replaced = new Map<number, Buffer>()

  for (const [index, image] of (json.images ?? []).entries()) {
    if (image.bufferView == null) continue
    const view = json.bufferViews[image.bufferView]
    const start = view.byteOffset ?? 0
    const data = bin.subarray(start, start + view.byteLength)
    const meta = await sharp(data).metadata()
    if (!meta.width || !meta.height || Math.max(meta.width, meta.height) <= maxSize) continue
    const out = await sharp(data)
      .resize({ width: maxSize, height: maxSize, fit: 'inside', kernel: 'lanczos3' })
      .webp(normals.has(index) ? { quality: 92, effort: 6 } : { quality: 86, effort: 6 })
      .toBuffer()
    // Keep the format the file already declares (EXT_texture_webp).
    if (image.mimeType && image.mimeType !== 'image/webp') {
      throw new Error(`${file}: image ${index} is ${image.mimeType}, expected webp`)
    }
    replaced.set(image.bufferView, out)
  }
  if (replaced.size === 0) return [before, before]

  // Lay the buffer out again in the original order, every view 4-byte aligned
  // (vertex data requires it; images do not mind).
  const parts: Buffer[] = []
  let offset = 0
  json.bufferViews.forEach((view, i) => {
    const start = view.byteOffset ?? 0
    const data = replaced.get(i) ?? bin.subarray(start, start + view.byteLength)
    const aligned = pad4(data, 0)
    view.byteOffset = offset
    view.byteLength = data.length
    parts.push(aligned)
    offset += aligned.length
  })
  const newBin = Buffer.concat(parts)
  json.buffers[0].byteLength = newBin.length
  writeGlb(file, json, newBin)
  return [before, fs.statSync(file).size]
}

const [maxArg, ...fileArgs] = process.argv.slice(2)
const maxSize = Number(maxArg ?? 1024) || 1024
const files = fileArgs.length
  ? fileArgs
  : fs
      .readdirSync('public/models', { recursive: true, encoding: 'utf8' })
      .filter((f) => f.endsWith('.glb'))
      .map((f) => path.join('public/models', f))

let totalBefore = 0
let totalAfter = 0
for (const file of files) {
  const [before, after] = await shrink(file, maxSize)
  totalBefore += before
  totalAfter += after
  console.log(`${file}: ${(before / 1024).toFixed(0)} KB → ${(after / 1024).toFixed(0)} KB`)
}
console.log(`total: ${(totalBefore / 1048576).toFixed(1)} MB → ${(totalAfter / 1048576).toFixed(1)} MB`)
