import { test, expect, mock } from 'claude-code/testing'
import { run } from './test-kit'

// the world beneath the mod: /clear, prompt submission and toasts are recorded
function world(on: any) {
  const seen = { clear: 0, forks: [] as string[], turns: 0, prompts: [] as string[], toasts: [] as string[], notes: [] as string[] }
  let reply: any = { isAnswered: true, text: '## Goal\nship it', usage: {} }
  on('command.run', { command: 'clear' }, async () => {
    seen.clear++
    return { text: 'cleared' } as any
  })
  // the fork writes the handoff; git is beneath the mod too
  on('model.fork', async (_$: any, e: any) => {
    seen.forks.push(e.prompt)
    return { value: reply } as any
  })
  on('process.run', async (_$: any, e: any) => ({ value: { exitCode: 0, stdout: `git ${e.argv.slice(1).join(' ')} output\n`, stderr: '' } }) as any)
  on('ui.toast', async (_$: any, e: any) => {
    seen.toasts.push(e.text ?? e.message ?? JSON.stringify(e))
    return { value: undefined } as any
  })
  on('session.append', { door: 'note' }, async (_$: any, e: any, next: any) => {
    seen.notes.push(JSON.stringify(e.message.content))
    return next(e)
  })
  on('prompt.submit', async (_$: any, e: any) => {
    seen.prompts.push(e.text)
    return { text: e.text } as any
  })
  return Object.assign(seen, { fail: (r: any) => { reply = r } })
}

const mountBand = ($: any, on: any) => {
  on('ui.render', async ($: any, e: any) => {
    const { Box } = $.ui.resolve(e)
    return <Box />
  })
  return $.ui.mount({ plugin: 'my-mods', surface: 'terminal', component: 'AbovePrompt', props: { hasSurvey: false, bodyColumns: 80 } as any })
}

test('the reborn button forks a handoff with the git state, then clears and sends it, waiting for the user', async ($, on) => {
  const clock = mock.clock(on)
  const seen = world(on)
  const ui = await mountBand($, on)
  expect(await ui.find({ key: 'band-all' })).toBeDefined()
  await ui.press({ key: 'band-all' })
  await clock.advance(1000)
  expect(seen.forks.length).toBe(1)
  expect(seen.forks[0]).toContain('git branch --show-current output')
  expect(seen.forks[0]).toContain('git log --oneline -5 output')
  await clock.advance(1000)
  expect(seen.clear).toBe(1)
  expect(seen.prompts.length).toBe(1)
  expect(seen.prompts[0]).toContain('then wait for me')
  expect(seen.prompts[0]).not.toContain('ship it')
  expect(seen.notes.join('\n')).toContain('ship it')
})

test('/reborn runs the same flow as the button', async ($, on) => {
  const clock = mock.clock(on)
  const seen = world(on)
  await mountBand($, on)
  const r = await run($, 'reborn')
  expect(r.text).toBe('Reborning…')
  await clock.advance(1000)
  expect(seen.forks.length).toBe(1)
  await clock.advance(1000)
  expect(seen.clear).toBe(1)
  expect(seen.notes.join('\n')).toContain('## Goal')
})

test('a fork that gives no handoff clears nothing', async ($, on) => {
  const clock = mock.clock(on)
  const seen = world(on)
  seen.fail({ isAnswered: false, reason: 'empty-reply', usage: {} })
  const ui = await mountBand($, on)
  await ui.press({ key: 'band-all' })
  await clock.advance(1000)
  await clock.advance(2000)
  expect(seen.clear).toBe(0)
  expect(seen.prompts.length).toBe(0)
  expect(seen.toasts.join('\n')).toContain('Reborn failed')
  expect(await ui.find({ key: 'band-all' })).toBeDefined()
})
