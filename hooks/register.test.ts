import { test, expect } from 'claude-code/testing'

test('session.start registers every command', async ($, on) => {
  const names: string[] = []
  on('command.register', async (_$: any, e: any) => {
    names.push(e.name)
    return { value: { registered: true } } as any
  })
  on('store.get', async () => ({ value: undefined }) as any)
  on('session.start', async (_$: any, e: any) => ({ cwd: e.cwd }) as any)
  await $.session.start({ cwd: '/', surface: 'terminal', isInteractive: true })
  expect(names.sort()).toEqual(['auto-recommend', 'cache-ping', 'cache-status', 'reborn'])
})
