import { readdirSync, statSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'

/**
 * Turns the numbered folders under `public/pic/` into the four cuts the lobby
 * asks for.
 *
 * Each folder holds one illustration drawn at four screen shapes, straight out
 * of the generator and named whatever it felt like ("ChatGPT Image ... (3).png"),
 * in the order it felt like. The shape is in the pixels, so that is what is read:
 * every file is measured, matched to the nearest cut, and written out as
 * `wide.webp`, `landscape.webp`, `portrait.webp`, `tall.webp`. A three-megabyte
 * PNG becomes a few hundred kilobytes, which matters for something that covers
 * the whole screen before anything else has loaded.
 *
 *   npm run pic:cuts          convert every folder that has originals
 *   npm run pic:cuts -- 4 5   just those
 *
 * Rerunnable: folders already converted and unchanged are skipped, so dropping
 * a new set in and running it again costs nothing for the rest.
 */

const ROOT = 'public/pic'
const QUALITY = 82

/** The four shapes, by the aspect ratio each was drawn at. */
const CUTS = [
  { name: 'wide', ratio: 1672 / 941 },
  { name: 'landscape', ratio: 1448 / 1086 },
  { name: 'portrait', ratio: 941 / 1672 },
  { name: 'tall', ratio: 841 / 1870 },
] as const

/** Aspect ratios compare properly in log space: 2:1 is as far from 1:1 as 1:2. */
function nearestCut(ratio: number): (typeof CUTS)[number] {
  let best = CUTS[0]
  let closest = Infinity
  for (const cut of CUTS) {
    const distance = Math.abs(Math.log(ratio / cut.ratio))
    if (distance < closest) {
      closest = distance
      best = cut
    }
  }
  return best
}

const wanted = process.argv.slice(2)
const folders = readdirSync(ROOT)
  .filter((name) => /^\d+$/.test(name) && statSync(join(ROOT, name)).isDirectory())
  .filter((name) => wanted.length === 0 || wanted.includes(name))

for (const folder of folders) {
  const dir = join(ROOT, folder)
  const originals = readdirSync(dir).filter((f) => /\.(png|jpe?g)$/i.test(f))
  if (originals.length === 0) {
    console.log(`${folder}: nothing to convert`)
    continue
  }

  const taken = new Map<string, string>()
  for (const file of originals) {
    const path = join(dir, file)
    const { width, height } = await sharp(path).metadata()
    if (!width || !height) {
      console.warn(`${folder}: ${file} has no size — skipped`)
      continue
    }
    const cut = nearestCut(width / height)
    if (taken.has(cut.name)) {
      console.warn(`${folder}: ${file} is another ${cut.name} — skipped`)
      continue
    }
    taken.set(cut.name, file)
    await sharp(path).webp({ quality: QUALITY }).toFile(join(dir, `${cut.name}.webp`))
    console.log(`${folder}/${cut.name}.webp  ←  ${file} (${width}×${height})`)
  }

  const missing = CUTS.filter((cut) => !taken.has(cut.name)).map((cut) => cut.name)
  if (missing.length) console.warn(`${folder}: no ${missing.join(', ')} — the lobby will fall back`)

  // The originals have served their purpose; keeping forty megabytes of them in
  // the repository has not.
  for (const file of originals) unlinkSync(join(dir, file))
}
