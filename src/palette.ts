import type { Color } from '@/game/types'

/**
 * The game's signal colours, in one place.
 *
 * Three surfaces need the same values in different forms: the 2D board draws
 * them into SVG, three.js wants 24-bit numbers, and the stylesheets need them as
 * CSS. The CSS side mirrors the owner colours as `--owner-white` / `--owner-black`
 * in index.css — a stylesheet cannot read this module, so those two are the one
 * pair that has to be kept in step by hand.
 *
 * Some of these values appear elsewhere in the CSS meaning something else
 * entirely — `.btn--danger` is the same red as a capture, `.presence-dot--in-game`
 * the same green as a legal move. Those are coincidences, not references, and
 * deliberately left spelled out where they are.
 */

/** Which side a piece, arrow or label belongs to. */
export const OWNER_COLOR: Record<Color, string> = { white: '#4a90d9', black: '#d64545' }

/** A move that takes a piece and cannot be answered. */
export const CAPTURE_COLOR = '#e23b34'

/** A move that takes a piece which can strike back — a duel, so not a certainty.
 *  Sits between the capture red it qualifies and the archer's amber. Worth
 *  knowing that red against orange is the one pair red-green blindness flattens,
 *  so this carries the distinction on its own for fewer players than it looks:
 *  a shape or a mark would carry it for everyone. */
export const DUEL_COLOR = '#ef8a1f'

/** A move to an empty square. */
export const MOVE_COLOR = '#3fae5a'

/** An archer's shot, which travels without the piece following it. */
export const ARCHER_SHOT_COLOR = '#f0b84b'

const hex = (color: string): number => Number.parseInt(color.slice(1), 16)

/** The same values as three.js wants them. */
export const OWNER_HEX: Record<Color, number> = {
  white: hex(OWNER_COLOR.white),
  black: hex(OWNER_COLOR.black),
}
export const CAPTURE_HEX = hex(CAPTURE_COLOR)
export const DUEL_HEX = hex(DUEL_COLOR)
export const MOVE_HEX = hex(MOVE_COLOR)
export const ARCHER_SHOT_HEX = hex(ARCHER_SHOT_COLOR)
