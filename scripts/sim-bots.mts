import { performance } from 'node:perf_hooks'
import { beginDraft, placePiece, resolveMove } from '../src/game/engine'
import { chooseBotMove, chooseBotPlacement } from '../src/game/bot'
import type { GameState } from '../src/game/types'

interface Sample { phase: string; ms: number; ply: number; game: number }

const samples: Sample[] = []
const GAMES = Number(process.argv[2] ?? 30)

const time = <T>(phase: string, ply: number, game: number, fn: () => T): T => {
  const t0 = performance.now()
  const out = fn()
  samples.push({ phase, ms: performance.now() - t0, ply, game })
  return out
}

let totalPlies = 0
let duels = 0
let overLimit = 0

for (let game = 0; game < GAMES; game++) {
  let state: GameState = beginDraft(Math.random() < 0.5 ? 'white' : 'black')
  let ply = 0

  while (state.phase !== 'over' && ply < 400) {
    if (state.phase === 'draft') {
      const cell = time('draft', ply, game, () => chooseBotPlacement(state))
      if (cell == null) break
      state = placePiece(state, cell)
    } else {
      const move = time('move', ply, game, () => chooseBotMove(state))
      if (!move) break
      const res = resolveMove(state, move)
      if (res.duel) duels++
      state = res.next
    }
    ply++
  }
  totalPlies += ply
  if (ply >= 400) overLimit++
}

const stat = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b)
  const q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))]
  return {
    n: s.length,
    mean: s.reduce((a, b) => a + b, 0) / s.length,
    p50: q(0.5), p90: q(0.9), p99: q(0.99), max: s[s.length - 1],
  }
}

const fmt = (label: string, xs: number[]) => {
  if (!xs.length) return
  const s = stat(xs)
  console.log(
    `${label.padEnd(8)} n=${String(s.n).padStart(5)}  mean=${s.mean.toFixed(1).padStart(6)}ms  ` +
    `p50=${s.p50.toFixed(1).padStart(6)}  p90=${s.p90.toFixed(1).padStart(6)}  ` +
    `p99=${s.p99.toFixed(1).padStart(6)}  max=${s.max.toFixed(1).padStart(7)}`,
  )
}

console.log(`${GAMES} games, ${totalPlies} plies, ${overLimit} hit the ply cap\n`)
fmt('draft', samples.filter((s) => s.phase === 'draft').map((s) => s.ms))
fmt('move', samples.filter((s) => s.phase === 'move').map((s) => s.ms))
fmt('all', samples.map((s) => s.ms))

const worst = [...samples].sort((a, b) => b.ms - a.ms).slice(0, 8)
console.log('\nworst decisions:')
for (const w of worst) console.log(`  ${w.ms.toFixed(1).padStart(7)}ms  ${w.phase} ply=${w.ply} game=${w.game}`)

const budget = samples.filter((s) => s.ms > 120)
console.log(`\nover the 120ms search budget: ${budget.length}/${samples.length} (${(budget.length / samples.length * 100).toFixed(1)}%)`)

const moves = samples.filter((s) => s.phase === 'move')
const byPly = new Map<number, number[]>()
for (const m of moves) {
  if (!byPly.has(m.ply)) byPly.set(m.ply, [])
  byPly.get(m.ply)!.push(m.ms)
}
console.log('\nmove cost by ply (first 10 move plies):')
for (const ply of [...byPly.keys()].sort((a, b) => a - b).slice(0, 10)) {
  const xs = byPly.get(ply)!
  const capped = xs.filter((x) => x > 110).length
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length
  console.log(`  ply ${String(ply).padStart(2)}  n=${String(xs.length).padStart(3)}  mean=${mean.toFixed(1).padStart(6)}ms  at-cap=${capped}/${xs.length}`)
}
