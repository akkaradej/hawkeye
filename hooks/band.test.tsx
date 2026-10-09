import { test, expect, mock } from 'claude-code/testing'

const HOUR = 3_600_000
const MIN = 60_000
const TURN = { reason: 'answer', answer: '', durationMs: 0, isAborted: false, turnId: 't' } as any

// the world beneath the mod, with the session reporting the given usage
function world(on: any, usage: any) {
  on('session.usage', async () => ({ value: { startedAt: 0, ...usage } }) as any)
  on('turn.complete', async () => ({ text: '' }) as any)
  on('ui.toast', async () => ({ value: undefined }) as any)
  on('ui.render', async ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
}
const mount = ($: any) => $.ui.mount({ plugin: 'my-mods', surface: 'terminal', component: 'AbovePrompt', props: {} as any })

test('the band shows the cache countdown, the context forecast and the 5h/7d usage', async ($, on) => {
  mock.clock(on, { now: 1000 })
  world(on, { context: { tokens: 60, window: 100 }, rateLimits: [{ kind: 'five_hour', percentUsed: 95 }, { kind: 'seven_day', percentUsed: 40 }] })
  await $.turn.complete(TURN)
  const ui = await mount($)
  expect(await ui.find({ type: 'Text', text: /Cache 60m/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Context 60%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /5h 95%/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /7d 40%/ })).toBeDefined()
})

test('the countdown goes red in the last 5 minutes and reads expired after', async ($, on) => {
  const clock = mock.clock(on, { now: 1000 })
  world(on, { context: { window: 100 }, rateLimits: [] })
  await $.turn.complete(TURN)
  await clock.advance(HOUR - 4 * MIN)
  expect(await (await mount($)).find({ type: 'Text', text: /Cache 4:00 left/ })).toBeDefined()
  await clock.advance(5 * MIN)
  expect(await (await mount($)).find({ type: 'Text', text: /Cache expired/ })).toBeDefined()
})

test('without a turn or a reading the band shows no cache or usage text', async ($, on) => {
  mock.clock(on)
  world(on, { context: { window: 100 }, rateLimits: [] })
  const ui = await mount($)
  expect(await ui.find({ type: 'Text', text: /Cache/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /Context/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /5h/ })).toBeUndefined()
})

test('the three buttons share the band', async ($, on) => {
  mock.clock(on)
  world(on, { context: { window: 100 }, rateLimits: [] })
  const ui = await mount($)
  expect(await ui.find({ key: 'auto' })).toBeDefined()
  expect(await ui.find({ key: 'band-all' })).toBeDefined()
})

test('a survey hides the band', async ($, on) => {
  mock.clock(on)
  world(on, { context: { window: 100 }, rateLimits: [] })
  const ui = await $.ui.mount({ plugin: 'my-mods', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: true } as any })
  expect(await ui.find({ key: 'auto' })).toBeUndefined()
  expect(await ui.find({ key: 'band-all' })).toBeUndefined()
})
