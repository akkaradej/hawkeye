import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Timer } from 'claude-code'
import { TTL_MS, WARN_MS, clock } from './format'

const lastHitAt = atom({ plugin: 'my-mods', key: 'lastHitAt' } as const, null)
const now = atom({ plugin: 'my-mods', key: 'now' } as const, 0)
const notified = atom({ plugin: 'my-mods', key: 'notified' } as const, false)
const isPinging = atom({ plugin: 'my-mods', key: 'isPinging' } as const, false)

export const CACHE_COMMANDS = [
  { name: 'cache-ping', description: 'Refresh the prompt cache with a tiny forked request' },
  { name: 'cache-status', description: 'Show the prompt cache countdown' },
]

let ticker: Timer | undefined

// warn once when the cache is about to expire; started by the first draw
function startTicker($: EngineInterface) {
  if (ticker) return
  ticker = $.clock.every(1000, async () => {
    const hit = await read($, lastHitAt)
    if (hit === null) return
    const left = hit + TTL_MS - (await $.clock.now())
    if (await read($, notified)) return
    if (left > 0 && left <= WARN_MS) {
      await update($, notified, () => true)
      const text = `Prompt cache expires in ${clock(left)}. Ping or reborn now.`
      $.ui.toast(text, { timeoutMs: 15000 })
      try {
        await $.tool.call({ tool: 'PushNotification', message: text, status: 'proactive' })
      } catch {}
    }
  })
}

async function ping($: EngineInterface): Promise<string> {
  if (await read($, isPinging)) return 'Ping already running.'
  await update($, isPinging, () => true)
  try {
    const r = await $.model.fork({ prompt: 'Reply with exactly: ok' })
    if (r.isAnswered) {
      const t = await $.clock.now()
      await update($, lastHitAt, () => t)
      await update($, notified, () => false)
      const text = `Cache refreshed (${r.usage.cache_read_input_tokens} tokens read, ${r.usage.cache_creation_input_tokens} written, ${r.usage.output_tokens} out)`
      $.ui.toast(text)
      return text
    }
    $.ui.toast(`Ping failed: ${r.reason}`)
    return `Ping failed: ${r.reason}`
  } finally {
    await update($, isPinging, () => false)
  }
}

export function registerCache(on: On) {
  // starts the expiry watch and puts the Ping button at the right of the band once the cache runs low
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    startTicker($)
    const below = await next(e)
    try {
      if ((e.props ?? e).hasSurvey) return below
      const hit = await read($, lastHitAt)
      if (hit === null) return below
      await read($, now) // keeps the 1 s re-render subscription
      const left = hit + TTL_MS - (await $.clock.now())
      if (left <= 0 || left > WARN_MS) return below
      const busy = await read($, isPinging)
      const { Box, Button, Text } = $.ui.resolve(e)
      const button = (
        <Box>
          <Text> </Text>
          <Button key="ping" label={busy ? 'Pinging…' : 'Ping'} onPress={() => void ping($)} />
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

  on('command.run', { command: 'cache-ping' }, async $ => ({ text: await ping($) }))
  .catch(($, e, next) => {
    const message = `/cache-ping failed: ${String(next.error)}`
    $.ui.toast(message, { timeoutMs: 20000 })
    return { text: message }
  })

  on('command.run', { command: 'cache-status' }, async $ => {
    const hit = await read($, lastHitAt)
    if (hit === null) return { text: 'Cache: no turn finished since the mod loaded.' }
    const left = hit + TTL_MS - (await $.clock.now())
    return { text: left > 0 ? `Cache expires in ${clock(left)}.` : 'Cache expired.' }
  })
  .catch(($, e, next) => {
    const message = `/cache-status failed: ${String(next.error)}`
    $.ui.toast(message, { timeoutMs: 20000 })
    return { text: message }
  })

  // the last request of a turn read or wrote the cache: the TTL starts over
  on('turn.complete', async ($, e, next) => {
    const t = await $.clock.now()
    await update($, lastHitAt, () => t)
    await update($, now, () => t)
    await update($, notified, () => false)

    return next(e)
  })
}
