// Dumps a GLB's connected geometry islands (extent, size, width) without a
// browser — how the leftover pedestals on tom/shelob were found.
// Usage: node scripts/inspect-glb.mjs public/models/tom.glb
import fs from 'fs'

const COMPONENT = { 5120: [Int8Array, 1], 5121: [Uint8Array, 1], 5122: [Int16Array, 2], 5123: [Uint16Array, 2], 5125: [Uint32Array, 4], 5126: [Float32Array, 4] }
const NUM = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }

function parseGlb(file) {
  const buf = fs.readFileSync(file)
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('not a glb: ' + file)
  let off = 12
  let json = null
  let bin = null
  while (off < buf.length) {
    const len = buf.readUInt32LE(off)
    const type = buf.readUInt32LE(off + 4)
    const data = buf.subarray(off + 8, off + 8 + len)
    if (type === 0x4e4f534a) json = JSON.parse(data.toString('utf8'))
    else if (type === 0x004e4942) bin = data
    off += 8 + len + ((4 - (len % 4)) % 4)
  }
  return { json, bin }
}

function readAccessor(json, bin, index) {
  const acc = json.accessors[index]
  const view = json.bufferViews[acc.bufferView]
  const [Ctor, size] = COMPONENT[acc.componentType]
  const n = NUM[acc.type]
  const base = (view.byteOffset ?? 0) + (acc.byteOffset ?? 0)
  const stride = view.byteStride ?? 0
  const out = new (Ctor === Float32Array ? Float32Array : Ctor)(acc.count * n)
  for (let i = 0; i < acc.count; i++) {
    const at = base + (stride ? i * stride : i * n * size)
    for (let c = 0; c < n; c++) {
      const o = at + c * size
      out[i * n + c] =
        Ctor === Float32Array ? bin.readFloatLE(o)
        : Ctor === Uint16Array ? bin.readUInt16LE(o)
        : Ctor === Uint32Array ? bin.readUInt32LE(o)
        : Ctor === Int16Array ? bin.readInt16LE(o)
        : Ctor === Uint8Array ? bin.readUInt8(o) : bin.readInt8(o)
    }
  }
  return out
}

// same union-find islands the runtime cleanup uses, incl. welding equal positions
function islands(pos, idx) {
  const count = pos.length / 3
  const parent = new Int32Array(count)
  for (let i = 0; i < count; i++) parent[i] = i
  const find = (v) => { while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v] } return v }
  const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[b] = a }

  const weld = new Map()
  for (let v = 0; v < count; v++) {
    const key = `${pos[v * 3].toFixed(5)}|${pos[v * 3 + 1].toFixed(5)}|${pos[v * 3 + 2].toFixed(5)}`
    const m = weld.get(key)
    if (m == null) weld.set(key, v); else union(v, m)
  }
  for (let i = 0; i < idx.length; i += 3) { union(idx[i], idx[i + 1]); union(idx[i + 1], idx[i + 2]) }

  const groups = new Map()
  for (let v = 0; v < count; v++) {
    const r = find(v)
    let g = groups.get(r)
    if (!g) groups.set(r, (g = { n: 0, minY: Infinity, maxY: -Infinity, maxR: 0, tris: 0 }))
    g.n++
    const y = pos[v * 3 + 1]
    g.minY = Math.min(g.minY, y); g.maxY = Math.max(g.maxY, y)
    g.maxR = Math.max(g.maxR, Math.hypot(pos[v * 3], pos[v * 3 + 2]))
    g.minX = Math.min(g.minX ?? Infinity, pos[v*3]); g.maxX = Math.max(g.maxX ?? -Infinity, pos[v*3]);
    g.minZ = Math.min(g.minZ ?? Infinity, pos[v*3+2]); g.maxZ = Math.max(g.maxZ ?? -Infinity, pos[v*3+2]);
  }
  for (let i = 0; i < idx.length; i += 3) groups.get(find(idx[i])).tris++
  return [...groups.values()].filter((g) => g.tris > 0)
}

export { parseGlb, readAccessor, islands }

if (process.argv[1].endsWith('inspect-glb.mjs'))
for (const file of process.argv.slice(2)) {
  const { json, bin } = parseGlb(file)
  if (JSON.stringify(json.extensionsUsed ?? []).includes('draco')) { console.log(file, 'DRACO — skipped'); continue }
  console.log(`\n=== ${file}`)
  for (const mesh of json.meshes) {
    for (const prim of mesh.primitives) {
      const pos = readAccessor(json, bin, prim.attributes.POSITION)
      const idx = readAccessor(json, bin, prim.indices)
      const gs = islands(pos, idx).sort((a, b) => a.minY - b.minY)
      let gMin = Infinity, gMax = -Infinity
      for (let v = 0; v < pos.length / 3; v++) { const y = pos[v * 3 + 1]; if (y < gMin) gMin = y; if (y > gMax) gMax = y }
      const h = gMax - gMin
      console.log(`  mesh "${mesh.name ?? '?'}"  height=${h.toFixed(3)}  islands=${gs.length}`)
      for (const g of gs) {
        const bottom = ((g.minY - gMin) / h * 100).toFixed(1)
        const top = ((g.maxY - gMin) / h * 100).toFixed(1)
        console.log(`    verts=${String(g.n).padStart(6)} tris=${String(g.tris).padStart(6)}  y=${bottom.padStart(5)}%..${top.padStart(6)}%  radius=${g.maxR.toFixed(3)}`)
      }
    }
  }
}
