import { describe, expect, it } from 'vitest'
import { buildActionLog, type StoredAction } from '../actionLog'

const names = { white: 'Alice', black: 'Bob' }
// Echo the key (with its vars) so we can assert which branch produced each line.
const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}:${JSON.stringify(vars)}` : key
const keys = (actions: StoredAction[]) => buildActionLog(actions, names, t).map((l) => l.text.split(':')[0])

let nextId = 1
const place = (by: 'white' | 'black', cell: number, kind: string): StoredAction => ({
  id: nextId++,
  action_type: 'place',
  payload: { by, cell, kind: kind as never },
})

// Eight placements that lead to a play position where White's rohan on 0 can
// drive down through 4 onto Black's balrog on 8 (a contested capture).
const draftActions = (): StoredAction[] => {
  nextId = 1
  return [
    place('white', 0, 'rohanWarrior'),
    place('black', 8, 'balrog'),
    place('white', 1, 'ent'),
    place('black', 14, 'farmer'),
    place('white', 2, 'dwarf'),
    place('black', 13, 'king'),
    place('white', 3, 'wizard'),
    place('black', 12, 'shelob'),
  ]
}

describe('buildActionLog', () => {
  it('contains one useful line per placement without a synthetic start event', () => {
    const out = buildActionLog(draftActions(), names, t)
    expect(out).toHaveLength(8)
    expect(out[0].text).toContain('log.place')
    expect(out[0].text).toContain('Alice') // actor name threaded through
    expect(out[0].color).toBe('white')
    expect(out[1].color).toBe('black')
  })

  it('labels a won duel, a quiet move and a plain capture', () => {
    const actions = draftActions()
    actions.push({
      id: nextId++,
      action_type: 'move',
      payload: { by: 'white', from: 0, to: 8, duel: { attacker: 5, success: true } },
    })
    actions.push({ id: nextId++, action_type: 'move', payload: { by: 'black', from: 14, to: 9 } })
    actions.push({ id: nextId++, action_type: 'move', payload: { by: 'white', from: 1, to: 9 } })

    const k = keys(actions)
    expect(k).toContain('log.duelWin')
    expect(k).toContain('log.move')
    expect(k).toContain('log.capture')
  })

  it('labels a failed duel', () => {
    const actions = draftActions()
    actions.push({
      id: nextId++,
      action_type: 'move',
      payload: { by: 'white', from: 0, to: 8, duel: { attacker: 2, success: false } },
    })
    expect(keys(actions)).toContain('log.duelFail')
  })

  it('skips malformed actions (no piece on the from-square, bad payloads)', () => {
    const actions: StoredAction[] = [
      { id: 1, action_type: 'move', payload: { by: 'white', from: 5, to: 6 } }, // empty board → no attacker
      { id: 2, action_type: 'place', payload: { by: 'white' } }, // no cell
      { id: 3, action_type: 'move', payload: { by: 'white', from: 0 } }, // no `to`
    ]
    expect(buildActionLog(actions, names, t)).toEqual([])
  })
})
