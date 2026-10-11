import { test, expect, mock } from 'claude-code/testing'

const TURN = { reason: 'answer', answer: '', durationMs: 0, isAborted: false, turnId: 't' } as any

// the session reports these readings; the mod shows them in the band (see band.test.tsx)
test('a finished turn takes a usage reading', async ($, on) => {
  mock.clock(on)
  let asked = 0
  on('session.usage', async () => {
    asked++
    return { value: { startedAt: 0, context: { tokens: 50, window: 100 }, rateLimits: [{ kind: 'five_hour', percentUsed: 12 }] } } as any
  })
  on('turn.complete', async () => ({ text: '' }) as any)
  await $.turn.complete(TURN)
  expect(asked).toBe(1)
})

test('a usage failure does not break the turn', async ($, on) => {
  mock.clock(on)
  on('session.usage', async () => {
    throw new Error('not ready')
  })
  on('turn.complete', async () => ({ text: 'done' }) as any)
  const r = await $.turn.complete(TURN)
  expect(r.text).toBe('done')
})

test('the 5h and 7d limits go to the status line', async ($, on) => {
  mock.clock(on)
  const lines: any[] = []
  on('session.usage', async () => ({ value: { startedAt: 0, rateLimits: [{ kind: 'five_hour', percentUsed: 12.4 }, { kind: 'seven_day', percentUsed: 51 }] } }) as any)
  on('ui.status', async (_$, e) => {
    lines.push(e.text)
    return {} as any
  })
  on('turn.complete', async () => ({ text: '' }) as any)
  await $.turn.complete(TURN)
  expect(lines).toContain('5h 12% · 7d 51%')
})
