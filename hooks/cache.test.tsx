import { test, expect, mock } from 'claude-code/testing'
import { run } from './test-kit'

const HOUR = 3_600_000
const MIN = 60_000
const usage = { cache_read_input_tokens: 10, cache_creation_input_tokens: 2, output_tokens: 1 }
const TURN = { reason: 'answer', answer: '', durationMs: 0, isAborted: false, turnId: 't' } as any

// the world beneath the mod: toasts go nowhere, the fork answers
const quiet = (on: any) => on('ui.toast', async () => ({ value: undefined }) as any)
// nothing else draws in the band
const emptyBand = (on: any) =>
  on('ui.render', async ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
// finish a turn, as the engine does beneath the mod
const finishTurn = async ($: any, on: any) => {
  on('turn.complete', async () => ({ text: '' }) as any)
  await $.turn.complete(TURN)
}
const answered = (on: any, calls?: { n: number }) => {
  quiet(on)
  on('model.fork', async () => {
    if (calls) calls.n++
    return { value: { isAnswered: true, text: 'ok', usage } } as any
  })
}

test('/cache-status before any turn says nothing finished', async ($, on) => {
  mock.clock(on)
  const r = await run($, 'cache-status')
  expect(r.text).toContain('no turn finished')
})

test('/cache-status counts down from the last turn and then reports expiry', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  await finishTurn($, on)
  expect((await run($, 'cache-status')).text).toBe('Cache expires in 60:00.')
  await clock.advance(HOUR - 5 * MIN)
  expect((await run($, 'cache-status')).text).toBe('Cache expires in 5:00.')
  await clock.advance(5 * MIN)
  expect((await run($, 'cache-status')).text).toBe('Cache expired.')
})

test('/cache-ping forks a request and reports the usage', async ($, on) => {
  mock.clock(on)
  const calls = { n: 0 }
  answered(on, calls)
  const r = await run($, 'cache-ping')
  expect(calls.n).toBe(1)
  expect(r.text).toContain('Cache refreshed (10 tokens read, 2 written, 1 out)')
})

test('/cache-ping restarts the countdown', async ($, on) => {
  const clock = mock.clock(on)
  answered(on)
  await clock.advance(10 * MIN)
  await run($, 'cache-ping')
  expect((await run($, 'cache-status')).text).toBe('Cache expires in 60:00.')
})

test('/cache-ping reports a failed fork', async ($, on) => {
  mock.clock(on)
  quiet(on)
  on('model.fork', async () => ({ value: { isAnswered: false, reason: 'boom' } }) as any)
  const r = await run($, 'cache-ping')
  expect(r.text).toBe('Ping failed: boom')
})

// the band's 1 s tickers start with the first draw, so the long waits come before it
const mount = ($: any) => $.ui.mount({ plugin: 'my-mods', surface: 'terminal', component: 'AbovePrompt', props: {} as any })

test('no Ping button while the cache is fresh', async ($, on) => {
  mock.clock(on, { now: 1000 })
  emptyBand(on)
  await finishTurn($, on)
  expect(await (await mount($)).find({ key: 'ping' })).toBeUndefined()
})

test('the Ping button appears in the last 5 minutes and goes once the cache expires', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  emptyBand(on)
  quiet(on)
  on('tool.call', async () => ({ result: 'ok' }) as any)
  await finishTurn($, on)
  await clock.advance(HOUR - 4 * MIN)
  const ui = await mount($)
  expect(await ui.find({ key: 'ping' })).toBeDefined()
  await clock.advance(5 * MIN)
  expect(await (await mount($)).find({ key: 'ping' })).toBeUndefined()
})

test('pressing Ping refreshes the cache', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const calls = { n: 0 }
  answered(on, calls)
  emptyBand(on)
  await finishTurn($, on)
  await clock.advance(HOUR - 4 * MIN)
  const ui = await mount($)
  await ui.press({ key: 'ping' })
  expect(calls.n).toBe(1)
  expect((await run($, 'cache-status')).text).toBe('Cache expires in 60:00.')
})

// advance in steps: each tick is a wait, and one advance resolves at most 10000 of them
const advanceBy = async (clock: any, ms: number) => {
  for (let left = ms; left > 0; left -= 10 * MIN) await clock.advance(Math.min(left, 10 * MIN))
}

test('the 5-minute warning toast fires once and fires again after a ping', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const toasts: string[] = []
  const pushed: string[] = []
  on('ui.toast', async (_$: any, e: any) => {
    toasts.push(e.text ?? e.message ?? JSON.stringify(e))
    return { value: undefined } as any
  })
  on('tool.call', async (_$: any, e: any) => {
    pushed.push(e.message)
    return { result: 'ok' } as any
  })
  on('model.fork', async () => ({ value: { isAnswered: true, text: 'ok', usage } }) as any)
  emptyBand(on)
  const warnings = () => toasts.filter(t => t.includes('Prompt cache expires'))
  await finishTurn($, on)
  await clock.advance(HOUR - 8 * MIN)
  await mount($) // the first draw starts the expiry watch

  await clock.advance(2 * MIN)
  expect(warnings()).toEqual([]) // 6 min left
  await clock.advance(2 * MIN)
  expect(warnings().length).toBe(1) // inside the last 5 minutes
  expect(warnings()[0]).toContain('expires in 5:00')
  expect(pushed.length).toBe(1)
  await clock.advance(MIN)
  expect(warnings().length).toBe(1) // not again while the cache runs down

  // a ping restarts the cache and re-arms the warning
  await run($, 'cache-ping')
  await advanceBy(clock, HOUR - 6 * MIN)
  expect(warnings().length).toBe(1) // 6 min left on the new cache
  await clock.advance(2 * MIN)
  expect(warnings().length).toBe(2)
  expect(pushed.length).toBe(2)
})
