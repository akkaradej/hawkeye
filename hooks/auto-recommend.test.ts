import { test, expect } from 'claude-code/testing'
import { run } from './test-kit'

const ask = (...questions: any[]) => ({ tool: 'AskUserQuestion', questions }) as any
const choice = (question: string, ...labels: string[]) => ({ question, header: 'q', multiSelect: false, options: labels.map(label => ({ label, description: '' })) })

test('/auto-recommend opens the pane', async ($, on) => {
  let opened: any
  on('ui.open', async (_$, e) => {
    opened = e
    return { value: { isPlaced: true } } as any
  })
  const r = await run($, 'auto-recommend')
  expect(r.text).toContain('pane')
  expect(JSON.stringify(opened)).toContain('auto-recommend')
})

test('AskUserQuestion is answered with the (Recommended) option', async ($, on) => {
  const q = choice('Which?', 'A', 'B (Recommended)')
  const r: any = await $.tool.call(ask(q))
  expect(JSON.stringify(r)).toContain('B (Recommended)')
})

test('a question without a recommended option falls through to the dialog', async ($, on) => {
  let reached = false
  on('tool.call', { tool: 'AskUserQuestion' }, async () => {
    reached = true
    return { result: 'dialog' } as any
  })
  await $.tool.call(ask(choice('Which?', 'A', 'B')))
  expect(reached).toBe(true)
})
