/**
 * The art behind the lobby, and which cut of it to show.
 *
 * Each illustration is drawn four times — for a wide screen, a squarer one, a
 * phone held upright, and a tall phone — and the one nearest the shape of the
 * window is chosen. Nothing is ever cropped: what does not fit the frame is
 * left as empty margin, because these are pictures with a subject in the middle
 * rather than textures. The cut is re-chosen when the window changes shape, so
 * turning a phone over swaps the artwork rather than stretching it.
 */

/** The shapes the art is drawn at, by the ratio of each. */
export const CUTS = [
  { name: 'wide', ratio: 1672 / 941 },
  { name: 'landscape', ratio: 1448 / 1086 },
  { name: 'portrait', ratio: 941 / 1672 },
  { name: 'tall', ratio: 841 / 1870 },
] as const

export type CutName = (typeof CUTS)[number]['name']

/** One picture: either a set with a cut per screen shape, or a single file. */
export type Illustration = { readonly set: string } | { readonly file: string }

/**
 * The illustrations, in the two forms they come in.
 *
 * A set is a folder under `public/pic/<n>/` holding the same picture drawn at
 * four screen shapes; the rest are still the one flat file they have always
 * been, letterboxed on every screen alike. As the cuts for a picture arrive,
 * drop them in the folder, run `npm run pic:cuts`, and move its line from one
 * form to the other — that is the whole change.
 */
const ART: readonly Illustration[] = [
  { set: '1' },
  { set: '2' },
  { set: '3' },
  { set: '4' },
  { file: '/pic/05.webp' },
  { file: '/pic/06.webp' },
]

export function pickIllustration(): Illustration {
  return ART[Math.floor(Math.random() * ART.length)]!
}

/**
 * The cut nearest this window. Aspect ratios are compared in log space, where
 * 2:1 sits as far from a square as 1:2 does — comparing the raw numbers would
 * make every portrait shape look alike and every landscape one far apart.
 */
export function cutFor(width: number, height: number): CutName {
  const ratio = height > 0 ? width / height : 1
  let best: (typeof CUTS)[number] = CUTS[0]
  let closest = Infinity
  for (const cut of CUTS) {
    const distance = Math.abs(Math.log(ratio / cut.ratio))
    if (distance < closest) {
      closest = distance
      best = cut
    }
  }
  return best.name
}

/** Where to find the picture for a window of this shape. */
export function illustrationSrc(art: Illustration, width: number, height: number): string {
  return 'file' in art ? art.file : `/pic/${art.set}/${cutFor(width, height)}.webp`
}
