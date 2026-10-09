import { test, expect, mock } from 'claude-code/testing'
import { run } from './test-kit'

const usage = { cache_read_input_tokens: 0, cache_creation_input_tokens: 0, output_tokens: 0 }

// the world beneath the mod: toasts go nowhere, /clear and prompt submission are recorded
function world(on: any, fork: () => any) {
  const seen = { clear: 0, prompts: [] as string[], toasts: [] as string[] }
  on('ui.toast', async (_$: any, e: any) => {
    seen.toasts.push(e.text ?? e.message ?? JSON.stringify(e))
    return { value: undefined } as any
  })
  on('model.fork', async () => ({ value: fork() }) as any)
  on('command.run', { command: 'clear' }, async () => {
    seen.clear++
    return { text: 'cleared' } as any
  })
  on('prompt.submit', async (_$: any, e: any) => {
    seen.prompts.push(e.text)
    return { text: e.text } as any
  })
  return seen
}

test('/reborn forks a summary, clears, and submits the summary as the first prompt', async ($, on) => {
  const clock = mock.clock(on)
  const seen = world(on, () => ({ isAnswered: true, text: '  ## Goal\nship it  ', usage }))
  const r = await run($, 'reborn')
  expect(r.text).toBe('Reborning…')
  await clock.settle()
  expect(seen.clear).toBe(1)
  expect(seen.prompts.length).toBe(1)
  expect(seen.prompts[0]).toContain('## Goal\nship it')
  expect(seen.prompts[0]).toContain('Next up')
})

test('a failed fork reports it and does not clear', async ($, on) => {
  const clock = mock.clock(on)
  const seen = world(on, () => ({ isAnswered: false, reason: 'boom' }))
  await run($, 'reborn')
  await clock.settle()
  expect(seen.clear).toBe(0)
  expect(seen.prompts).toEqual([])
  expect(seen.toasts.join('\n')).toContain('Reborn failed')
  expect(seen.toasts.join('\n')).toContain('boom')
})

test('an empty summary does not clear the session', async ($, on) => {
  const clock = mock.clock(on)
  const seen = world(on, () => ({ isAnswered: true, text: '   ', usage }))
  await run($, 'reborn')
  await clock.settle()
  expect(seen.clear).toBe(0)
  expect(seen.toasts.join('\n')).toContain('summary came back empty')
})

test('the reborn button sits in the band and runs the same flow', async ($, on) => {
  const clock = mock.clock(on)
  const seen = world(on, () => ({ isAnswered: true, text: 'summary', usage }))
  on('ui.render', async ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  const ui = await $.ui.mount({ plugin: 'my-mods', surface: 'terminal', component: 'AbovePrompt', props: {} as any })
  expect(await ui.find({ key: 'band-all' })).toBeDefined()
  await ui.press({ key: 'band-all' })
  await clock.settle()
  expect(seen.clear).toBe(1)
  expect(seen.prompts[0]).toContain('summary')
})
