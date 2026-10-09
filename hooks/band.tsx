import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Timer } from 'claude-code'
import { TTL_MS, WARN_MS, clock, minutes } from './format'

const lastHitAt = atom({ plugin: 'my-mods', key: 'lastHitAt' } as const, null)
const now = atom({ plugin: 'my-mods', key: 'now' } as const, 0)
const percent = atom({ plugin: 'my-mods', key: 'percent' } as const, null)
const limits = atom({ plugin: 'my-mods', key: 'limits' } as const, { fiveHour: null, sevenDay: null })
// Forecast bands, by percent of the context window used.
const FORECAST = [
  { upTo: 25, icon: '☀', word: 'Clear', color: 'yellow' },
  { upTo: 40, icon: '☁', word: 'Cloudy', color: 'cyan' },
  { upTo: 55, icon: '☂', word: 'Showers', color: 'blue' },
  { upTo: 70, icon: '☇', word: 'Storm', color: 'magenta' },
  { upTo: 85, icon: '❄', word: 'Blizzard', color: 'red' },
  { upTo: Infinity, icon: '↯', word: 'Compact soon', color: 'red' },
] as const

async function row($: EngineInterface, e: any) {
  const hit = await read($, lastHitAt)
  const { Box, Text } = $.ui.resolve(e)
  const pct = await read($, percent)
  const f = pct === null ? null : (FORECAST.find(b => pct < b.upTo) ?? FORECAST[FORECAST.length - 1])
  const context = f && (
    <Text color={f.color} bold>{f.icon} Context {pct}%</Text>
  )
  const lim = await read($, limits)
  const limitStyle = (p: number) => (p >= 90 ? { color: 'red' } : p >= 70 ? { color: 'yellow' } : { dimColor: true })
  const usage = (lim.fiveHour !== null || lim.sevenDay !== null) && (
    <Text>
      {lim.fiveHour !== null && <Text {...limitStyle(lim.fiveHour)}>⧖ 5h {Math.round(lim.fiveHour)}%</Text>}
      {lim.fiveHour !== null && lim.sevenDay !== null && <Text dimColor> · </Text>}
      {lim.sevenDay !== null && <Text {...limitStyle(lim.sevenDay)}>7d {Math.round(lim.sevenDay)}%</Text>}
    </Text>
  )
  // items sit on one line with a gap between each one that is present
  const line = (...items: any[]) => (
    <Box>
      {items.filter(Boolean).map((item, i) => (
        <Box key={i}>
          {i > 0 && <Text>  </Text>}
          {item}
        </Box>
      ))}
    </Box>
  )
  if (hit === null) {
    // no cache reading yet: show the other items, the countdown joins once a turn finishes
    return line(context, usage)
  }
  // read the clock on every render: the stored tick can lag or stall, which left "expired" on screen
  await read($, now) // keeps the 1 s re-render subscription
  const t = await $.clock.now()
  const left = hit + TTL_MS - t

  if (left <= 0) {
    return line(
      <Text dimColor>• Cache expired</Text>,
      context,
      usage,
    )
  }
  if (left > WARN_MS) {
    return line(<Text color="green" bold>• Cache {minutes(left)}</Text>, context, usage)
  }
  return line(<Text color="red" bold>• Cache {clock(left)} left</Text>, context, usage)
}

let ticker: Timer | undefined

// the 1 s tick the countdown and the spinner read; started by the first draw
function startTicker($: EngineInterface) {
  if (ticker) return
  ticker = $.clock.every(1000, async () => {
    const t = await $.clock.now()
    await update($, now, () => t)
  })
}

export function registerBand(on: On) {
  // One band is shared with other plugins (Context draws there too):
  // draw our row and stack whatever the plugins beneath draw under it.
  let warned = false
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    startTicker($)
    const below = await next(e)
    try {
      if ((e.props ?? e).hasSurvey) return below
      const mine = await row($, e)
      const { Box } = $.ui.resolve(e)
      // the buttons are drawn by the features that own them, each in its own hook around this one
      return below ? (
        <Box flexDirection="column">
          <Box flexGrow={1}>{mine}</Box>
          {below}
        </Box>
      ) : (
        <Box flexGrow={1}>{mine}</Box>
      )
    } catch (error) {
      if (!warned) {
        warned = true
        $.ui.toast(`cache band failed: ${String(error)}`, { timeoutMs: 20000 })
      }
      return below
    }
  })
}
