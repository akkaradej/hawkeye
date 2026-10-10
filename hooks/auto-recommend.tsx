import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

// auto-answer AskUserQuestion with the recommended options; per session, on at every session start
const autoRecommend = atom({ plugin: 'my-mods', key: 'autoRecommend' } as const, true)
// what was auto-answered; reset at session start, or by the pane's clear button
const history = atom({ plugin: 'my-mods', key: 'autoHistory' } as const, [])
// whether the pane is drawn now, so the band button can offer to clear it
const paneUp = atom({ plugin: 'my-mods', key: 'autoPaneUp' } as const, false)
const PANE = 'auto-recommend'

export const AUTO_RECOMMEND_COMMANDS = [
  { name: 'auto-recommend', description: 'Open the auto-recommend pane (toggle, history of auto answers)' },
]

// opens the pane and records it, so the band button follows even if the ui.open hook does not run for our own call
async function openPane($: EngineInterface) {
  const result = await $.ui.open({ id: PANE, title: 'Auto-recommend' })
  await update($, paneUp, () => !!(result as any)?.isPlaced)
  return result
}

// empty the history and close the pane: the pane's clear button, and the band's while the pane is up
async function clearAndClose($: EngineInterface) {
  await update($, history, () => [])
  await $.ui.close({ id: PANE })
  await update($, paneUp, () => false)
}

// the band button while the pane is down: open it
const openFromBand = ($: EngineInterface) => void openPane($)

export function registerAutoRecommend(on: On) {
  // keep paneUp in step with the pane, however it opens or closes
  on('ui.open', { id: PANE }, async ($, e, next) => {
    const result = await next(e)
    await update($, paneUp, () => !!(result as any)?.isPlaced)
    return result
  }).catch(($, e, next) => next(e))
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const result = await next(e)
    await update($, paneUp, () => false)
    return result
  }).catch(($, e, next) => next(e))

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
      const isUp = await read($, paneUp)
      const { Box, Button, Text } = $.ui.resolve(e)
      const button = (
        <Box>
          <Text> </Text>
          {isUp ? (
            <Button key="auto-clear" label={auto ? '✓ Clear history' : '○ Clear history'} onPress={() => void clearAndClose($)} />
          ) : (
            <Button key="auto" label={auto ? '✓ Auto-recommend' : '○ Auto-recommend'} onPress={() => openFromBand($)} />
          )}
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
    await openPane($).catch(err => $.ui.toast(`Auto-recommend pane failed to open: ${String(err)}`, { timeoutMs: 20000 }))
    $.ui.toast('Auto-accepted recommended answers')
    return { result: { questions: e.questions, answers } } as any
  }).catch(($, e, next) => next(e))

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const auto = await read($, autoRecommend)
    const list = await read($, history)
    const room = Math.max(1, Math.floor(((e.viewport?.rows ?? 24) - 6) / 4))
    return (
      <Box flexDirection="column">
        <Box>
          <Button key="toggle" label={auto ? '✓ Auto-recommend: on' : '○ Auto-recommend: off'} onPress={() => void update($, autoRecommend, v => !v)} />
          <Text> </Text>
          <Button key="clear" label="clear history and close" onPress={() => void clearAndClose($)} />
        </Box>
        <Text> </Text>
        {list.length === 0 && <Text dimColor>No auto answers yet.</Text>}
        {list.slice(-room).reverse().map(item => (
          <Box flexDirection="column" marginBottom={1}>
            <Text dimColor>{'── '}{item.at}{' ──'}</Text>
            {item.entries.map((x, i) => (
              <Box flexDirection="column" marginTop={i === 0 ? 0 : 1}>
                <Box alignItems="flex-start">
                  <Text bold dimColor>Q  </Text>
                  <Box flexShrink={1}><Text bold wrap="wrap">{x.question}</Text></Box>
                </Box>
                <Box alignItems="flex-start">
                  <Text bold color="success">A  </Text>
                  <Box flexShrink={1}><Text color="success" wrap="wrap">{x.answer.replace(/\s*\(recommended\)/gi, '')}</Text></Box>
                </Box>
              </Box>
            ))}
          </Box>
        ))}
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
