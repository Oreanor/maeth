// Shared pacing for the blind-draw "pick" ceremony, used by both the local and
// remote game hooks so the timing stays identical on either side.

/** Linger on the drawn portrait after it settles, before the close animation. */
export const PICK_REVEAL_MS = 1000
/** Duration of the shrink-to-a-point close animation. */
export const PICK_CLOSE_MS = 300
/** Beat after a piece lands before the next pick modal opens. */
export const PICK_OPEN_DELAY_MS = 1000
