import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

// auto-answer AskUserQuestion with the recommended options; per session, on at every session start
const autoRecommend = atom({ plugin: 'my-mods', key: 'autoRecommend' } as const, true)
// what was auto-answered; reset at session start, or by the pane's clear button
const history = atom({ plugin: 'my-mods', key: 'autoHistory' } as const, [])
const PANE = 'auto-recommend'

export const AUTO_RECOMMEND_COMMANDS = [
  { name: 'auto-recommend', description: 'Open the auto-recommend pane (toggle, history of auto answers)' },
]

const openPane = ($: EngineInterface, focus = true) => $.ui.open({ id: PANE, title: 'Auto-recommend', focus })

// the band button: open the pane, or close it when it is already up
async function togglePane($: EngineInterface) {
  const isUp = (await $.ui.panes()).some(pane => pane.id === PANE)
  if (isUp) await $.ui.close({ id: PANE })
  else await openPane($)
}

export function registerAutoRecommend(on: On) {
  on('command.run', { command: 'auto-recommend' }, async $ => {
    await openPane($)
    return { text: 'Auto-recommend pane opened.' }
  })
  .catch(($, e, next) => {
    const message = `/auto-recommend failed: ${String(next.error)}`
    $.ui.toast(message, { timeoutMs: 20000 })
    return { text: message }
  })

  // the pane button, at the right of the band
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    try {
      if ((e.props ?? e).hasSurvey) return below
      const auto = await read($, autoRecommend)
      const { Box, Button, Text } = $.ui.resolve(e)
      const button = (
        <Box>
          <Text> </Text>
          <Button key="auto" label={auto ? '✓ auto-recommend' : '○ auto-recommend'} onPress={() => void togglePane($)} />
        </Box>
      )
      return below ? (
        <Box flexGrow={1} alignItems="flex-start">
          <Box flexGrow={1}>{below}</Box>
          {button}
        </Box>
      ) : (
        button
      )
    } catch {
      return below
    }
  })

  // answer AskUserQuestion with each question's "(Recommended)" option(s), when every
  // question is a plain choice with one; otherwise the dialog opens as usual
  on('tool.call', { tool: 'AskUserQuestion' }, async ($, e, next) => {
    if (!(await read($, autoRecommend))) return next(e)
    const answers: Record<string, string> = {}
    for (const q of e.questions as any[]) {
      if (q.kind && q.kind !== 'choice') return next(e)
      const picked = (q.options as any[]).filter(o => /\(recommended\)/i.test(o.label))
      if (!picked.length) return next(e)
      const chosen = q.multiSelect ? picked : picked.slice(0, 1)
      answers[q.question] = chosen.map(o => o.label).join(', ')
    }
    const at = new Date().toLocaleTimeString()
    const entries = Object.entries(answers).map(([question, answer]) => ({ question, answer }))
    await update($, history, list => [...list, { at, entries }].slice(-200))
    // show the new entry, without taking the keyboard from the prompt
    await openPane($, false).catch(() => {})
    $.ui.toast('Auto-accepted recommended answers')
    return { result: { questions: e.questions, answers } } as any
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const auto = await read($, autoRecommend)
    const list = await read($, history)
    const room = Math.max(1, Math.floor(((e.viewport?.rows ?? 24) - 6) / 3))
    return (
      <Box flexDirection="column">
        <Box>
          <Button key="toggle" autoFocus label={auto ? '✓ auto-recommend: on' : '○ auto-recommend: off'} onPress={() => void update($, autoRecommend, v => !v)} />
          <Text> </Text>
          <Button key="clear" label="clear history" onPress={() => void update($, history, () => [])} />
        </Box>
        <Text> </Text>
        {list.length === 0 && <Text dimColor>No auto answers yet.</Text>}
        {list.slice(-room).reverse().map(item => (
          <Box flexDirection="column">
            <Text dimColor>{item.at}</Text>
            {item.entries.map(x => (
              <Text>{x.question} → {x.answer}</Text>
            ))}
          </Box>
        ))}
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
