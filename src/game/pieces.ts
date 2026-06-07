// The 16 unique pieces. Each is defined purely by a movement PATTERN and a
// RANGE (max number of cells it slides). Movement is sliding: the path must be
// clear; a piece captures by stopping on an enemy at the end of its path.
//
//   pattern 'ortho' (+) — 4 straight directions
//   pattern 'diag'  (x) — 4 diagonal directions
//   pattern 'zh'    (Ж) — vertical + diagonals (no east/west)
//   pattern 'all'   (*) — all 8 directions

export type Pattern = 'ortho' | 'diag' | 'zh' | 'all'
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
  /** Ranged striker: slides to empty squares; shoots an enemy first on a ray from place. */
  archer?: boolean
}

export const PIECES: Record<PieceKind, PieceDef> = {
  nazgul: { kind: 'nazgul', name: 'Nazgul', pattern: 'zh', range: 2 },
  tomBombadil: { kind: 'tomBombadil', name: 'Tom Bombadil', pattern: 'all', range: 2 },
  orcArcher: { kind: 'orcArcher', name: 'Orc Archer', pattern: 'ortho', range: 2, archer: true },
  gondorWarrior: { kind: 'gondorWarrior', name: 'Gondor Warrior', pattern: 'diag', range: 2 },
  balrog: { kind: 'balrog', name: 'Balrog', pattern: 'zh', range: 3 },
  wizard: { kind: 'wizard', name: 'Wizard', pattern: 'all', range: 3, archer: true },
  elvenWarrior: { kind: 'elvenWarrior', name: 'Elven Warrior', pattern: 'diag', range: 2, archer: true },
  king: { kind: 'king', name: 'King', pattern: 'diag', range: 3 },
  shelob: { kind: 'shelob', name: 'Shelob', pattern: 'all', range: 2, archer: true },
  ent: { kind: 'ent', name: 'Ent', pattern: 'ortho', range: 3 },
  dwarf: { kind: 'dwarf', name: 'Dwarf', pattern: 'zh', range: 1 },
  farmer: { kind: 'farmer', name: 'Farmer', pattern: 'diag', range: 1 },
  orcChief: { kind: 'orcChief', name: 'Orc Chief', pattern: 'all', range: 1 },
  elvenQueen: { kind: 'elvenQueen', name: 'Elven Queen', pattern: 'all', range: 3 },
  hobbit: { kind: 'hobbit', name: 'Hobbit', pattern: 'ortho', range: 1 },
  rohanWarrior: { kind: 'rohanWarrior', name: 'Rohan Warrior', pattern: 'ortho', range: 2 },
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

const ZH: Array<[number, number]> = [
  [-1, 0],
  [1, 0],
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
    case 'zh':
      return ZH
    case 'all':
      return [...ORTHO, ...DIAG]
  }
}

export const PATTERN_I18N: Record<Pattern, string> = {
  ortho: 'rules.patternOrtho',
  diag: 'rules.patternDiag',
  zh: 'rules.patternZh',
  all: 'rules.patternAll',
}

export function pieceName(kind: PieceKind, t: (key: string) => string): string {
  return t(`pieces.${kind}`)
}

export function pieceBadgeAria(kind: PieceKind, t: (key: string) => string): string {
  const def = PIECES[kind]
  const archer = isArcher(kind) ? `${t('rules.colArcher')}, ` : ''
  return `${archer}${def.range}, ${t(PATTERN_I18N[def.pattern])}`
}

export function isArcher(kind: PieceKind): boolean {
  return PIECES[kind].archer === true
}
