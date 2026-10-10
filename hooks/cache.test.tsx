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
  expect(r.text).toContain('Cache warmed: used 1 tokens to save 12 tokens')
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

// the settings pane, as the person opens it; press its buttons by key
const settings = ($: any) => $.ui.mount({ plugin: 'my-mods', surface: 'terminal', component: 'Pane', requestId: 'cache-settings', props: {} as any })

test('the band has a settings button and no manual Ping button', async ($, on) => {
  mock.clock(on, { now: 1000 })
  emptyBand(on)
  await finishTurn($, on)
  const ui = await mount($)
  expect(await ui.find({ key: 'cache-settings' })).toBeDefined()
  expect(await ui.find({ key: 'ping' })).toBeUndefined()
})

test('the settings pane offers an hours dropdown and says auto ping is 10 min before', async ($, on) => {
  mock.clock(on)
  on('store.set', async () => ({ value: undefined }) as any)
  const ui = await settings($)
  expect(await ui.find({ key: 'warm' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Auto ping 10 min before/ })).toBeDefined()
})

test('with the default 1 hour the cache is not pinged', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const calls = { n: 0 }
  answered(on, calls)
  emptyBand(on)
  on('tool.call', async () => ({ result: 'ok' }) as any)
  await finishTurn($, on)
  await advanceBy(clock, HOUR - 12 * MIN)
  await mount($) // the first draw starts the watch
  await advanceBy(clock, 11 * MIN)
  expect(calls.n).toBe(0)
})

test('with 2 hours the cache is pinged 10 minutes before each cycle ends', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const calls = { n: 0 }
  answered(on, calls)
  emptyBand(on)
  on('store.set', async () => ({ value: undefined }) as any)
  on('tool.call', async () => ({ result: 'ok' }) as any)
  on('turn.complete', async () => ({ text: '' }) as any)
  await (await settings($)).select({ key: 'warm', value: '2' })
  await $.turn.complete(TURN)
  await advanceBy(clock, 45 * MIN)
  await mount($)
  await clock.advance(4 * MIN)
  expect(calls.n).toBe(0) // 11 min left of the cycle
  await clock.advance(2 * MIN)
  expect(calls.n).toBe(1) // inside the last 10 minutes
  expect((await run($, 'cache-status')).text).toContain('Cache expires in 59:')
})

test('auto pings stop once the warm window is covered', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const calls = { n: 0 }
  answered(on, calls)
  emptyBand(on)
  on('store.set', async () => ({ value: undefined }) as any)
  on('tool.call', async () => ({ result: 'ok' }) as any)
  on('turn.complete', async () => ({ text: '' }) as any)
  await (await settings($)).select({ key: 'warm', value: '2' })
  await $.turn.complete(TURN)
  await advanceBy(clock, 45 * MIN)
  await mount($)
  await advanceBy(clock, 70 * MIN)
  expect(calls.n).toBe(1) // 50 min after the turn: that is the cap for 2 hours, so no ping at 1 h 40
  expect((await run($, 'cache-status')).text).toBe('Cache expired.')
})

test('Warm now in the settings warms the cache', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  const calls = { n: 0 }
  answered(on, calls)
  emptyBand(on)
  on('store.set', async () => ({ value: undefined }) as any)
  on('tool.call', async () => ({ result: 'ok' }) as any)
  on('turn.complete', async () => ({ text: '' }) as any)
  const pane = await settings($)
  await $.turn.complete(TURN)
  await advanceBy(clock, 30 * MIN)
  await pane.press({ key: 'warm-now' })
  expect(calls.n).toBe(1)
  expect((await run($, 'cache-status')).text).toContain('Cache expires in 60:')
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
