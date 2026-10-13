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
    return { value: undefined } as any
  })
  on('turn.complete', async () => ({ text: '' }) as any)
  await $.turn.complete(TURN)
  expect(lines.some(l => l.endsWith('5h 12% · 7d 51%'))).toBe(true)
})

test('in a repo the status line shows the repo folder, the path below it and the branch', async ($, on) => {
  mock.clock(on)
  const lines: any[] = []
  on('session.usage', async () => ({ value: { startedAt: 0, rateLimits: [{ kind: 'five_hour', percentUsed: 12 }] } }) as any)
  on('session.cwd', async () => ({ value: '/Users/me/work/app/sub' }) as any)
  on('env.get', async () => ({ value: '/Users/me' }) as any)
  on('process.run', async (_$: any, e: any) => ({ value: { exitCode: 0, stdout: e.argv[2] === '--show-toplevel' ? '/Users/me/work/app\n' : 'main\n', stderr: '' } }) as any)
  on('ui.status', async (_$, e) => {
    lines.push(e.text)
    return { value: undefined } as any
  })
  on('turn.complete', async () => ({ text: '' }) as any)
  await $.turn.complete(TURN)
  expect(lines).toContain('$ app/sub ⎇ main · 5h 12%')
})

test('outside a git repo only the last two directories show', async ($, on) => {
  mock.clock(on)
  const lines: any[] = []
  on('session.usage', async () => ({ value: { startedAt: 0, rateLimits: [] } }) as any)
  on('session.cwd', async () => ({ value: '/Users/me/work/app' }) as any)
  on('env.get', async () => ({ value: '/Users/me' }) as any)
  on('process.run', async () => ({ value: { exitCode: 128, stdout: '', stderr: 'not a git repository' } }) as any)
  on('ui.status', async (_$, e) => {
    lines.push(e.text)
    return { value: undefined } as any
  })
  on('turn.complete', async () => ({ text: '' }) as any)
  await $.turn.complete(TURN)
  expect(lines).toContain('$ …/work/app')
})

test('each part of the status line can be switched off in the settings pane', async ($, on) => {
  mock.clock(on)
  const lines: any[] = []
  on('session.usage', async () => ({ value: { startedAt: 0, rateLimits: [{ kind: 'five_hour', percentUsed: 12 }] } }) as any)
  on('session.cwd', async () => ({ value: '/tmp/x' }) as any)
  on('env.get', async () => ({ value: '/Users/me' }) as any)
  on('process.run', async () => ({ value: { exitCode: 128, stdout: '', stderr: '' } }) as any)
  on('store.set', async () => ({ value: undefined }) as any)
  on('ui.status', async (_$, e) => {
    lines.push(e.text)
    return { value: undefined } as any
  })
  on('turn.complete', async () => ({ text: '' }) as any)
  const pane = await $.ui.mount({ plugin: 'hawkeye', surface: 'terminal', component: 'Pane', requestId: 'settings', props: {} as any })
  await pane.select({ key: 'show-location', value: 'off' })
  await $.turn.complete(TURN)
  expect(lines.at(-1)).toBe('5h 12%')
  await pane.select({ key: 'show-location', value: 'on' })
  await pane.select({ key: 'show-limits', value: 'off' })
  await $.turn.complete(TURN)
  expect(lines.at(-1)).toBe('$ /tmp/x')
  await pane.select({ key: 'show-location', value: 'off' })
  await $.turn.complete(TURN)
  expect(lines.at(-1)).toBeUndefined()
})
