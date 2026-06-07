import { mkdirSync } from 'node:fs'
import sharp from 'sharp'

const SRC = 'public/m.png'
const OUT_DIR = 'public'

const TRIM_THRESHOLD = 254
const CIRCLE_INSET = 0.88
const SUPER_SAMPLE = 4

mkdirSync(OUT_DIR, { recursive: true })

function isInk(r: number, g: number, b: number): boolean {
  return Math.max(r, g, b) < 230
}

function keepLargestInkBlob(ink: boolean[], width: number, height: number): boolean[] {
  const visited = new Uint8Array(width * height)
  let bestSize = 0
  let best: number[] = []

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const start = y * width + x
      if (!ink[start] || visited[start]) continue

      const stack = [start]
      const component: number[] = []
      visited[start] = 1

      while (stack.length > 0) {
        const i = stack.pop()!
        component.push(i)
        const cx = i % width
        const cy = (i / width) | 0
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = cx + dx
          const ny = cy + dy
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue
          const ni = ny * width + nx
          if (ink[ni] && !visited[ni]) {
            visited[ni] = 1
            stack.push(ni)
          }
        }
      }

      if (component.length > bestSize) {
        bestSize = component.length
        best = component
      }
    }
  }

  const out = ink.map(() => false)
  for (const i of best) out[i] = true
  return out
}

/** Remove a detached vertical spur on the far left (common m.png artifact). */
function stripLeftSpur(ink: boolean[], width: number, height: number): boolean[] {
  const out = ink.slice()
  for (let x = 0; x < width; x++) {
    let rows = 0
    let isolated = 0
    for (let y = 0; y < height; y++) {
      if (!ink[y * width + x]) continue
      rows++
      if (x + 1 >= width || !ink[y * width + x + 1]) isolated++
    }
    if (rows === 0) break
    if (rows > height * 0.35 && isolated / rows > 0.8) {
      for (let y = 0; y < height; y++) out[y * width + x] = false
    } else {
      break
    }
  }
  return out
}

async function cleanLetterSource(trimmed: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(trimmed).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width, height, channels } = info
  const pixels = width * height

  let ink = Array.from({ length: pixels }, (_, i) => {
    const p = i * channels
    return isInk(data[p], data[p + 1], data[p + 2])
  })
  ink = keepLargestInkBlob(ink, width, height)
  ink = stripLeftSpur(ink, width, height)

  let minX = width
  let minY = height
  let maxX = 0
  let maxY = 0
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!ink[y * width + x]) continue
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
    }
  }

  const outW = maxX - minX + 1
  const outH = maxY - minY + 1
  const out = Buffer.alloc(outW * outH * 4)
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const o = (y * outW + x) * 4
      if (ink[(minY + y) * width + (minX + x)]) {
        out[o] = 0
        out[o + 1] = 0
        out[o + 2] = 0
        out[o + 3] = 255
      }
    }
  }

  return sharp(out, { raw: { width: outW, height: outH, channels: 4 } }).png().toBuffer()
}

const letter = await cleanLetterSource(
  await sharp(SRC).trim({ threshold: TRIM_THRESHOLD }).png().toBuffer(),
)

const letterMeta = await sharp(letter).metadata()
if (!letterMeta.width || !letterMeta.height) throw new Error('Could not read trimmed letter')

async function blackGlyph(width: number, height: number): Promise<Buffer> {
  return sharp(letter)
    .resize(width, height, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer()
}

function whiteCirclePng(size: number): Buffer {
  const buf = Buffer.alloc(size * size * 4)
  const cx = size / 2
  const cy = size / 2
  const radius = size / 2 - 1

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x + 0.5 - cx
      const dy = y + 0.5 - cy
      const i = (y * size + x) * 4
      if (dx * dx + dy * dy <= radius * radius) {
        buf[i] = 255
        buf[i + 1] = 255
        buf[i + 2] = 255
        buf[i + 3] = 255
      }
    }
  }

  return buf
}

async function renderIcon(size: number): Promise<Buffer> {
  const renderSize = size * SUPER_SAMPLE
  const radius = renderSize / 2 - 1
  const maxSide = 2 * radius * CIRCLE_INSET
  const scale = maxSide / Math.hypot(letterMeta.width!, letterMeta.height!)
  const glyphW = Math.max(1, Math.round(letterMeta.width! * scale))
  const glyphH = Math.max(1, Math.round(letterMeta.height! * scale))

  const circle = await sharp(whiteCirclePng(renderSize), {
    raw: { width: renderSize, height: renderSize, channels: 4 },
  })
    .png()
    .toBuffer()

  const glyph = await blackGlyph(glyphW, glyphH)

  const composed = await sharp(circle)
    .composite([{ input: glyph, gravity: 'center' }])
    .png()
    .toBuffer()

  return sharp(composed)
    .resize(size, size, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer()
}

async function writeIcon(size: number, path: string) {
  await sharp(await renderIcon(size)).toFile(path)
}

await writeIcon(32, `${OUT_DIR}/favicon-32.png`)
await writeIcon(180, `${OUT_DIR}/apple-touch-icon.png`)

console.log('Wrote public/favicon-32.png, apple-touch-icon.png from public/m.png')
