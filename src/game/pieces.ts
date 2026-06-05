// The 16 unique pieces. Each is defined purely by a movement PATTERN and a
// RANGE (max number of cells it slides). Movement is sliding: the path must be
// clear; a piece captures by stopping on an enemy at the end of its path.
//
//   pattern 'ortho' (+) — 4 straight directions
//   pattern 'diag'  (x) — 4 diagonal directions
//   pattern 'all'   (*) — all 8 directions

export type Pattern = 'ortho' | 'diag' | 'all'
export type Range = 1 | 2 | 3

export type PieceKind =
  | 'nazgul'
  | 'tomBombadil'
  | 'orcArcher'
  | 'gondorWarrior'
  | 'balrog'
  | 'wizard'
  | 'elvenWarrior'
  | 'king'
  | 'shelob'
  | 'ent'
  | 'dwarf'
  | 'farmer'
  | 'orcChief'
  | 'elvenQueen'
  | 'hobbit'
  | 'rohanWarrior'

export interface PieceDef {
  kind: PieceKind
  name: string
  pattern: Pattern
  range: Range
  emoji: string
}

export const PIECES: Record<PieceKind, PieceDef> = {
  nazgul: { kind: 'nazgul', name: 'Nazgul', pattern: 'all', range: 2, emoji: '🦇' },
  tomBombadil: { kind: 'tomBombadil', name: 'Tom Bombadil', pattern: 'all', range: 2, emoji: '🎩' },
  orcArcher: { kind: 'orcArcher', name: 'Orc Archer', pattern: 'ortho', range: 1, emoji: '🏹' },
  gondorWarrior: { kind: 'gondorWarrior', name: 'Gondor Warrior', pattern: 'diag', range: 2, emoji: '🛡️' },
  balrog: { kind: 'balrog', name: 'Balrog', pattern: 'all', range: 3, emoji: '🔥' },
  wizard: { kind: 'wizard', name: 'Wizard', pattern: 'all', range: 2, emoji: '🧙' },
  elvenWarrior: { kind: 'elvenWarrior', name: 'Elven Warrior', pattern: 'all', range: 1, emoji: '🗡️' },
  king: { kind: 'king', name: 'King', pattern: 'diag', range: 3, emoji: '👑' },
  shelob: { kind: 'shelob', name: 'Shelob', pattern: 'diag', range: 2, emoji: '🕷️' },
  ent: { kind: 'ent', name: 'Ent', pattern: 'ortho', range: 3, emoji: '🌳' },
  dwarf: { kind: 'dwarf', name: 'Dwarf', pattern: 'all', range: 1, emoji: '⛏️' },
  farmer: { kind: 'farmer', name: 'Farmer', pattern: 'diag', range: 1, emoji: '🌾' },
  orcChief: { kind: 'orcChief', name: 'Orc Chief', pattern: 'all', range: 1, emoji: '👹' },
  elvenQueen: { kind: 'elvenQueen', name: 'Elven Queen', pattern: 'all', range: 3, emoji: '👸' },
  hobbit: { kind: 'hobbit', name: 'Hobbit', pattern: 'ortho', range: 1, emoji: '🧒' },
  rohanWarrior: { kind: 'rohanWarrior', name: 'Rohan Warrior', pattern: 'ortho', range: 2, emoji: '🐴' },
}

export const ALL_KINDS: PieceKind[] = Object.keys(PIECES) as PieceKind[]

const ORTHO: Array<[number, number]> = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
]
const DIAG: Array<[number, number]> = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
]

export function dirsFor(pattern: Pattern): Array<[number, number]> {
  switch (pattern) {
    case 'ortho':
      return ORTHO
    case 'diag':
      return DIAG
    case 'all':
      return [...ORTHO, ...DIAG]
  }
}

export function patternSymbol(pattern: Pattern): '+' | 'x' | '*' {
  return pattern === 'ortho' ? '+' : pattern === 'diag' ? 'x' : '*'
}

/** Compact label like "3*" used on the board and in the draft tray. */
export function pieceBadge(kind: PieceKind): string {
  const def = PIECES[kind]
  return `${def.range}${patternSymbol(def.pattern)}`
}
