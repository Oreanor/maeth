import { describe, expect, it } from 'vitest'
import { cutFor, illustrationSrc } from '../illustrations'

describe('choosing a cut for the window', () => {
  it('takes the shape nearest the window', () => {
    expect(cutFor(1920, 1080)).toBe('wide')
    expect(cutFor(1440, 1080)).toBe('landscape')
    expect(cutFor(390, 844)).toBe('tall')
    expect(cutFor(768, 1024)).toBe('portrait')
  })

  it('swaps the cut when the window crosses into another shape', () => {
    // A phone turned over: the same picture, a different cut.
    expect(cutFor(844, 390)).toBe('wide')
    expect(cutFor(390, 844)).toBe('tall')
  })

  it('reads a square as the squarest cut there is', () => {
    expect(cutFor(800, 800)).toBe('landscape')
  })

  it('never divides by a height of nothing', () => {
    expect(cutFor(800, 0)).toBe('landscape')
  })

  it('points at the file for that cut, and leaves flat art alone', () => {
    expect(illustrationSrc({ set: '2' }, 1920, 1080)).toBe('/pic/2/wide.webp')
    expect(illustrationSrc({ set: '2' }, 390, 844)).toBe('/pic/2/tall.webp')
    expect(illustrationSrc({ file: '/pic/03.webp' }, 390, 844)).toBe('/pic/03.webp')
  })
})
