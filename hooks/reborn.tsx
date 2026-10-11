import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'
import { SPINNER } from './format'

// 'writing' while the handoff is written, 'clearing' while /clear runs, null otherwise
const phase = atom({ plugin: 'hawkeye', key: 'phase' } as const, null)
// ticks every second while Reborn works, to turn the spinner
const now = atom({ plugin: 'hawkeye', key: 'now' } as const, 0)
// set by the band's button, which cannot call reborn() from its own file; the timer takes the ask
const rebornAsk = atom({ plugin: 'hawkeye', key: 'rebornAsk' } as const, false)

const PENDING_KEY = 'rebornPending'

// The handoff is written by a fork: the same model over this chat, no tools and no turn in the chat, so nothing is
// printed. It cannot run git, so the hook runs it and puts the output in the prompt.
// The handoff goes in as a row the person never sees; only this short prompt shows, to start the reply.
const GIT_STATE: [string, string[]][] = [
  ['Branch', ['branch', '--show-current']],
  ['Status (the first line says if it is ahead of or behind its upstream)', ['status', '-sb']],
  ['Last commits', ['log', '--oneline', '-5']],
]

const handoffPrompt = (git: string) => [
  'This conversation is about to be cleared. Write a handoff so a fresh session can carry on with no other context.',
  '',
  'The git state, read just now:',
  git,
  '',
  'Reply with the handoff only, no preamble or farewell, in plain markdown with these sections:',
  '- Goal: one or two lines.',
  '- State: what is done and how it was checked, the files touched, and the git state above (branch, uncommitted files, unpushed commits).',
  '- Open work: what is half done, and the concrete blocker.',
  '- Next up: ordered. Make the first one runnable: a command, a file path or a decision. Mark every step that needs the user with "needs user".',
  '- Decisions and constraints: what was decided and why, and the limits on what is allowed.',
  '- Lessons: approaches that failed, and how the user wants the work done.',
  '',
  'Do not use tools. Never include secrets, environment values or raw logs. Write in the language the user writes in. Short bullets.',
].join('\n')

async function gitState($: EngineInterface) {
  const parts = await Promise.all(
    GIT_STATE.map(async ([title, args]) => {
      const r = await $.process.run(['git', ...args], { timeoutMs: 10_000 }).catch(() => null)
      return `${title}:\n${r && r.exitCode === 0 ? r.stdout.trim() || '(empty)' : '(not available)'}`
    }),
  )
  return parts.join('\n\n')
}

const handoffNote = (handoff: string) => `Handoff from the previous session (it was cleared):\n\n${handoff.trim()}`
const CONTINUE_PROMPT = 'Read the handoff, say in two lines where things stand and what is next, then wait for me.'

// The flow lives in these, not in atoms: a /clear resets the atoms, not the module.
let stage: 'writing' | 'clearing' | null = null
let queued = false
let handoff: string | undefined
let driving = false
let timer: { cancel(): void } | null = null

// A press only asks; the timer does the work, since a press may hold the turn and a prompt sent from it is refused.
async function reborn($: EngineInterface) {
  if (stage !== null) return
  stage = 'writing'
  queued = true
  handoff = undefined
  await update($, phase, () => 'writing')
}

async function finish($: EngineInterface) {
  if (stage === 'writing' && queued) {
    queued = false
    $.ui.toast('Reborn started: writing the handoff…', { timeoutMs: 5000 })
    try {
      const forked = await $.model.fork({ prompt: handoffPrompt(await gitState($)) })
      if (forked.isAnswered && forked.text.trim()) {
        handoff = forked.text
        const session = await $.session.id().catch(() => '')
        await $.store.set(PENDING_KEY, { session, text: forked.text }).catch(() => undefined)
      } else {
        const why = forked.isAnswered ? 'empty-reply' : forked.reason
        throw new Error(why === 'nothing-to-fork' ? 'nothing to hand off yet' : `the fork gave no handoff (${why})`)
      }
    } catch (error) {
      stage = null
      await update($, phase, () => null)
      $.ui.toast(`Reborn failed: ${error instanceof Error ? error.message : String(error)}`, { timeoutMs: 20000 })
      return
    }
  }
  // Kept in the store too: a reload between the writing and the clear loses the module, not the store.
  if (handoff === undefined && stage === null) {
    const kept = (await $.store.get(PENDING_KEY).catch(() => null)) as { session?: string; text?: string } | null
    if (kept?.text && kept.session === (await $.session.id().catch(() => null))) {
      handoff = kept.text
      stage = 'writing'
    }
  }
  if (handoff === undefined || driving) return
  driving = true
  const text = handoff
  handoff = undefined
  try {
    stage = 'clearing'
    await update($, phase, () => 'clearing')
    await $.command.run({ command: 'clear', args: '' })
    await $.store.delete(PENDING_KEY).catch(() => undefined)
    await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: handoffNote(text) }] } })
    await $.prompt.submit({ text: CONTINUE_PROMPT, asUser: true })
  } catch (error) {
    $.ui.toast(`Reborn failed: ${String(error)}`, { timeoutMs: 20000 })
  } finally {
    driving = false
    stage = null
    await update($, phase, () => null)
  }
}

// the band's button asked: start the flow
async function takeAsk($: EngineInterface) {
  if (!(await read($, rebornAsk))) return
  await update($, rebornAsk, () => false)
  await reborn($)
}

// The timer is started from a draw: one begun inside a request may end with it.
function startTimer($: EngineInterface) {
  if (timer) return
  timer = $.clock.every(1000, () => {
    void $.clock.now().then(t => update($, now, () => t)).catch(() => undefined)
    // the ask is taken first, so the flow starts on the same tick
    void takeAsk($).then(() => finish($)).catch(() => undefined)
  })
}

export const REBORN_COMMANDS = [
  { name: 'reborn', description: 'Write a handoff, clear this session, and carry on in a new one' },
]

export function registerReborn(on: On) {
  on('command.run', async ($, e, next) => {
    if (e.command !== 'reborn') return next(e)
    await reborn($)
    return { text: 'Reborning…' }
  })
  .catch(($, e, next) => {
    const message = `/reborn failed: ${String(next.error)}`
    $.ui.toast(message, { timeoutMs: 20000 })
    return { text: message }
  })

  // the band draws the button next to the context; this starts the timer that runs the flow
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    startTimer($)
    return next(e)
  })
}
