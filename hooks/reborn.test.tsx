import { test, expect, mock } from 'claude-code/testing'
import { run } from './test-kit'

// the world beneath the mod: /clear, prompt submission and toasts are recorded
function world(on: any) {
  const seen = { clear: 0, prompts: [] as string[], toasts: [] as string[], notes: [] as string[] }
  on('command.run', { command: 'clear' }, async () => {
    seen.clear++
    return { text: 'cleared' } as any
  })
  on('ui.toast', async (_$: any, e: any) => {
    seen.toasts.push(e.text ?? e.message ?? JSON.stringify(e))
    return { value: undefined } as any
  })
  on('session.append', { door: 'note' }, async (_$: any, e: any, next: any) => {
    seen.notes.push(JSON.stringify(e.message.content))
    return next(e)
  })
  on('turn.complete', (_: any, e: any) => ({ text: e.answer }))
  on('prompt.submit', async (_$: any, e: any) => {
    seen.prompts.push(e.text)
    return { text: e.text } as any
  })
  return seen
}

const mountBand = ($: any, on: any) => {
  on('ui.render', async ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  return $.ui.mount({ plugin: 'my-mods', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 80 } as any })
}

const answer = (text: string, reason = 'answer') =>
  ({ answer: text, durationMs: 1000, isAborted: reason === 'aborted', turnId: 't1', reason }) as any

test('the reborn button writes a handoff turn, then clears and sends it, waiting for the user', async ($, on) => {
  const clock = mock.clock(on)
  const seen = world(on)
  const ui = await mountBand($, on)
  expect(await ui.find({ key: 'band-all' })).toBeDefined()
  await ui.press({ key: 'band-all' })
  await clock.advance(1000)
  expect(seen.prompts.length).toBe(1)
  expect(seen.prompts[0]).toContain('git status --short')
  expect(seen.prompts[0]).toContain('Do not write or change any file')
  expect(seen.clear).toBe(0)
  await $.turn.complete(answer('## Goal\nship it'))
  await clock.advance(1000)
  expect(seen.clear).toBe(1)
  expect(seen.prompts.length).toBe(2)
  expect(seen.prompts[1]).toContain('then wait for me')
  expect(seen.prompts[1]).not.toContain('ship it')
  expect(seen.notes.join('\n')).toContain('ship it')
})

test('/reborn runs the same flow as the button', async ($, on) => {
  const clock = mock.clock(on)
  const seen = world(on)
  await mountBand($, on)
  const r = await run($, 'reborn')
  expect(r.text).toBe('Reborning…')
  await clock.advance(1000)
  expect(seen.prompts.length).toBe(1)
  await $.turn.complete(answer('## Goal\nship it'))
  await clock.advance(1000)
  expect(seen.clear).toBe(1)
  expect(seen.notes.join('\n')).toContain('## Goal')
})

test('a handoff turn that gives no answer clears nothing', async ($, on) => {
  const clock = mock.clock(on)
  const seen = world(on)
  const ui = await mountBand($, on)
  await ui.press({ key: 'band-all' })
  await clock.advance(1000)
  await $.turn.complete(answer('', 'aborted'))
  await clock.advance(2000)
  expect(seen.clear).toBe(0)
  expect(seen.prompts.length).toBe(1)
  expect(seen.toasts.join('\n')).toContain('nothing was cleared')
  expect(await ui.find({ key: 'band-all' })).toBeDefined()
})
