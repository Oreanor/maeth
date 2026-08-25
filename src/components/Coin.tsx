import type { CSSProperties } from 'react'
import './Coin.css'

/**
 * The coin that decides who moves first.
 *
 * Two faces and a rim of thin slices standing on edge around them: with
 * `preserve-3d` that is a solid disc, and turning the whole thing about its
 * vertical axis is a real spin with a real edge — no renderer involved. The
 * game still rolls a die underneath (the server is the one who decides), and
 * the coin simply shows which way it came out: one pip up, or two.
 */

/** Slices around the rim. Enough that the edge reads as a curve, few enough
 *  that the browser is not compositing a hundred elements for one spin. */
const RIM_SLICES = 28

export interface CoinProps {
  /** 'one' or 'two' — the side that ends up facing the player. */
  side: 'one' | 'two' | null
  /** True while it is still turning and nobody knows the answer. */
  spinning: boolean
  className?: string
}

export function Coin({ side, spinning, className = '' }: CoinProps) {
  // Two whole turns into its answer — whole, because a half-turn would leave
  // the coin showing its own back. The second face is that half-turn further
  // round, which is what makes the last stretch read as a choice.
  const landing = 720 + (side === 'two' ? 180 : 0)

  return (
    <span
      className={[
        'coin',
        spinning ? 'coin--spinning' : 'coin--landed',
        side === 'two' ? 'coin--two' : 'coin--one',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ '--coin-landing': `${landing}deg` } as CSSProperties}
      aria-hidden
    >
      <span className="coin__face coin__face--one" />
      <span className="coin__face coin__face--two" />
      <span className="coin__rim">
        {Array.from({ length: RIM_SLICES }, (_, i) => (
          <i key={i} style={{ '--slice': `${(360 / RIM_SLICES) * i}deg` } as CSSProperties} />
        ))}
      </span>
    </span>
  )
}
