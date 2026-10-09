import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'

// 'saving' while the summary is forked, 'clearing' while /clear runs, null otherwise
const phase = atom({ plugin: 'my-mods', key: 'phase' } as const, null)

const now = atom({ plugin: 'my-mods', key: 'now' } as const, 0)

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

const SUMMARY_PROMPT = `This conversation is about to be cleared. Write a hand-off note so a fresh session can carry on without me repeating anything. Plain markdown, no preamble, with these sections: Goal, State (what is done, files touched, branch), Open work, Next up (ordered), Decisions and constraints, Lessons. Be specific and brief; do not call tools.`

// fork a summary, /clear, then hand the summary to the new session in its first prompt
async function reborn($: EngineInterface) {
  if (await read($, phase)) return
  try {
    await update($, phase, () => 'saving')
    $.ui.toast('Reborning…')
    const r = await $.model.fork({ prompt: SUMMARY_PROMPT })
    if (!r.isAnswered) throw new Error(r.reason)
    const summary = r.text?.trim()
    if (!summary) throw new Error('the summary came back empty')
    await update($, phase, () => 'clearing')
    await $.command.run({ command: 'clear' })
    // the summary rides in the first prompt of the new session (a system-prompt section did not survive /clear)
    // (not awaited: it resolves with the turn, and the button must free up now)
    $.prompt.submit({ text: `Context carried over from the previous session (it was cleared):\n\n${summary}\n\nContinue from it: start on the first item of "Next up", or resume the open work.` }).catch(error => {
      $.ui.toast(`Reborn could not start the new session: ${String(error)}`, { timeoutMs: 20000 })
    })
  } catch (error) {
    $.ui.toast(`Reborn failed: ${String(error)}`, { timeoutMs: 20000 })
  } finally {
    await update($, phase, () => null)
  }
}

export const REBORN_COMMANDS = [
  { name: 'reborn', description: 'Summarize this session, clear it, and carry on in a new one' },
]

export function registerReborn(on: On) {
  on('command.run', { command: 'reborn' }, async $ => {
    void reborn($)
    return { text: 'Reborning…' }
  })
  .catch(($, e, next) => {
    const message = `/reborn failed: ${String(next.error)}`
    $.ui.toast(message, { timeoutMs: 20000 })
    return { text: message }
  })

  // the button, at the right of the band; a spinner replaces it while a step runs
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    try {
      if ((e.props ?? e).hasSurvey) return below
      const p = await read($, phase)
      const { Box, Button, Text } = $.ui.resolve(e)
      let item
      if (p) {
        // reading the tick keeps the 1 s re-render subscription, so the spinner turns while a step runs
        await read($, now)
        const frame = SPINNER[Math.floor((await $.clock.now()) / 1000) % SPINNER.length]
        item = <Text color="cyan" bold>{frame} {p === 'saving' ? 'Reborning…' : 'Clearing…'}</Text>
      } else {
        item = <Button key="band-all" label="reborn" onPress={() => void reborn($)} />
      }
      const button = (
        <Box>
          <Text> </Text>
          {item}
        </Box>
      )
      return below ? (
        <Box alignItems="flex-start">
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
}
