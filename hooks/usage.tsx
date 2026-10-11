import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Timer } from 'claude-code'

const limits = atom({ plugin: 'hawkeye', key: 'limits' } as const, { fiveHour: null, sevenDay: null })
const percent = atom({ plugin: 'hawkeye', key: 'percent' } as const, null)

async function takeReading($: EngineInterface) {
  try {
    const { context, rateLimits } = await $.session.usage()
    const pick = (kind: string) => rateLimits?.find(r => r.kind === kind)?.percentUsed ?? null
    const fiveHour = pick('five_hour')
    const sevenDay = pick('seven_day')
    await update($, limits, () => ({ fiveHour, sevenDay }))
    // the 5h and 7d limits live in the status line under the prompt (plain text: it has no colours)
    const parts = [fiveHour !== null && `5h ${Math.round(fiveHour)}%`, sevenDay !== null && `7d ${Math.round(sevenDay)}%`].filter(Boolean)
    $.ui.status(parts.length ? parts.join(' · ') : undefined)
    if (!context || !context.window) return
    const tokens = context.tokens ?? 0
    if (tokens > 0) await update($, percent, () => Math.round(context.percent ?? (tokens / context.window) * 100))
  } catch {}
}

let ticker: Timer | undefined

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
    return next(e)
  })

  on('turn.complete', { reason: ['answer', 'aborted', 'refusal', 'error'] }, async ($, e, next) => {
    await takeReading($)

    return next(e)
  })
}
