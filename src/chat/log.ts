/**
 * One voice for everything the pieces do behind the scenes.
 *
 * All of it is invisible until it works, and "nothing happened" has half a
 * dozen possible causes — a coin toss that went the other way, a tab in the
 * background, a model that returned nothing, an order the rules refused. Each
 * of those says so, under one prefix, so the console reads as a single story.
 */
const PREFIX = '[chat]'

export const log = (...parts: unknown[]): void => console.log(PREFIX, ...parts)

export const warn = (...parts: unknown[]): void => console.warn(PREFIX, ...parts)

/**
 * A reason for staying silent is worth saying once, not every four seconds:
 * the idle timer asks the same question over and over and the answer rarely
 * changes.
 */
export function makeSkipLogger(): (reason: string) => void {
  let last = ''
  return (reason: string) => {
    if (reason === last) return
    last = reason
    log('quiet —', reason)
  }
}
