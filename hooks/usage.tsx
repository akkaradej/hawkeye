import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Timer } from 'claude-code'
import { shortDir } from './format'
import { settings } from './settings'

const limits = atom({ plugin: 'hawkeye', key: 'limits' } as const, { fiveHour: null, sevenDay: null })
// flipped by the settings pane at every change; the status line redraws when it moves
const settingsPing = atom({ plugin: 'hawkeye', key: 'settingsPing' } as const, false)
const percent = atom({ plugin: 'hawkeye', key: 'percent' } as const, null)

// the short directory name and the git branch, when it is inside a repo
async function whereAmI($: EngineInterface) {
  const git = async (...args: string[]) => {
    const r = await $.process.run(['git', ...args], { timeoutMs: 3000 }).catch(() => null)
    return r && r.exitCode === 0 ? r.stdout.trim() : null
  }
  const root = await git('rev-parse', '--show-toplevel')
  const dir = '$ ' + shortDir(await $.session.cwd(), root ?? undefined, await $.env.get('HOME'))
  if (root === null) return dir
  const branch = (await git('branch', '--show-current')) || (await git('rev-parse', '--short', 'HEAD'))
  return branch ? `${dir} ⎇ ${branch}` : dir
}

// the directory, branch and 5h/7d limits live in the status line under the prompt (plain text: it has no colours)
async function showStatus($: EngineInterface) {
  const where = settings.showLocation ? await whereAmI($).catch(() => '') : ''
  const { fiveHour, sevenDay } = settings.showLimits ? await read($, limits) : { fiveHour: null, sevenDay: null }
  const parts = [where, fiveHour !== null && `5h ${Math.round(fiveHour)}%`, sevenDay !== null && `7d ${Math.round(sevenDay)}%`].filter(Boolean)
  $.ui.status(parts.length ? parts.join(' · ') : undefined)
}

async function takeReading($: EngineInterface) {
  try {
    const { context, rateLimits } = await $.session.usage()
    const pick = (kind: string) => rateLimits?.find(r => r.kind === kind)?.percentUsed ?? null
    await update($, limits, () => ({ fiveHour: pick('five_hour'), sevenDay: pick('seven_day') }))
    if (context?.window) {
      const tokens = context.tokens ?? 0
      if (tokens > 0) await update($, percent, () => Math.round(context.percent ?? (tokens / context.window) * 100))
    }
  } catch {}
  // usage may not be ready yet; the directory and branch show regardless
  await showStatus($).catch(() => {})
}

let ticker: Timer | undefined
let lastPing: boolean | undefined

// usage is often not ready at session start, so keep asking until the first reading lands;
// started by the first draw
function startTicker($: EngineInterface) {
  if (ticker) return
  void takeReading($)
  ticker = $.clock.every(1000, async () => {
    const lim = await read($, limits)
    if ((await read($, percent)) === null || (lim.fiveHour === null && lim.sevenDay === null)) {
      if (Math.floor((await $.clock.now()) / 1000) % 5 === 0) await takeReading($)
    }
  })
}

export function registerUsage(on: On) {
  // draws nothing: it only starts the reading
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    startTicker($)
    const ping = await read($, settingsPing)
    if (ping !== lastPing) {
      lastPing = ping
      void showStatus($).catch(() => {})
    }
    return next(e)
  })

  on('turn.complete', { reason: ['answer', 'aborted', 'refusal', 'error'] }, async ($, e, next) => {
    await takeReading($)

    return next(e)
  })
}
