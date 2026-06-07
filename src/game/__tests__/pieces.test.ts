import { describe, expect, it } from 'vitest'
import { ALL_KINDS, PIECES, dirsFor, isArcher, pieceBadgeAria } from '../pieces'

describe('PIECES table', () => {
  it('has 16 pieces, each keyed by its own kind with a valid range', () => {
    expect(ALL_KINDS).toHaveLength(16)
    for (const kind of ALL_KINDS) {
      const def = PIECES[kind]
      expect(def.kind).toBe(kind)
      expect([1, 2, 3]).toContain(def.range)
      expect(def.name.length).toBeGreaterThan(0)
    }
  })
})

describe('dirsFor', () => {
  it('ortho is the 4 straight directions', () => {
    expect(dirsFor('ortho')).toEqual([
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ])
  })

  it('diag is the 4 diagonals', () => {
    expect(dirsFor('diag')).toHaveLength(4)
    expect(dirsFor('diag').every(([dr, dc]) => dr !== 0 && dc !== 0)).toBe(true)
  })

  it('zh is vertical + diagonals, never east/west', () => {
    const dirs = dirsFor('zh')
    expect(dirs).toHaveLength(6)
    // no pure horizontal direction
    expect(dirs.some(([dr]) => dr === 0)).toBe(false)
  })

  it('all is the union of ortho and diag (8 directions)', () => {
    expect(dirsFor('all')).toHaveLength(8)
  })
})

describe('isArcher / pieceBadgeAria', () => {
  it('flags ranged strikers', () => {
    expect(isArcher('orcArcher')).toBe(true)
    expect(isArcher('wizard')).toBe(true)
    expect(isArcher('rohanWarrior')).toBe(false)
  })

  it('builds an aria label that mentions archer only for archers', () => {
    const t = (key: string) => key
    const archerLabel = pieceBadgeAria('orcArcher', t)
    expect(archerLabel).toContain('rules.colArcher')
    expect(archerLabel).toContain('rules.patternOrtho')

    const plainLabel = pieceBadgeAria('rohanWarrior', t)
    expect(plainLabel).not.toContain('rules.colArcher')
    expect(plainLabel).toContain('2')
  })
})
