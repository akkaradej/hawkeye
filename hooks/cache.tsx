import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Timer } from 'claude-code'
import { EFFORTS, JUDGE_EFFORTS, REBORN_PCTS, SETTINGS_STORE_KEY, setSetting, settings } from './settings'
import { HOUR_MS, MIN_MS, PING_BEFORE_MIN, SPINNER, TTL_MS, WARM_HOURS, WARN_MS, clock } from './format'

const lastHitAt = atom({ plugin: 'my-mods', key: 'lastHitAt' } as const, null)
// the last finished turn; pings refresh the cache but do not count as use
const lastTurnAt = atom({ plugin: 'my-mods', key: 'lastTurnAt' } as const, null)
const now = atom({ plugin: 'my-mods', key: 'now' } as const, 0)
const notified = atom({ plugin: 'my-mods', key: 'notified' } as const, false)
const isPinging = atom({ plugin: 'my-mods', key: 'isPinging' } as const, false)
// how long the cache is kept warm after the last turn, and how long before a cache cycle ends the ping goes out
// the value is in ./settings; this atom only redraws
const settingsPing = atom({ plugin: 'my-mods', key: 'settingsPing' } as const, false)
// pings since the last turn: the band counts the cache cycles with it
const cachePings = atom({ plugin: 'my-mods', key: 'cachePings' } as const, 0)

const SETTINGS_PANE = 'settings'
const RETRY_MS = 60 * 1000

export const CACHE_COMMANDS = [
  { name: 'cache-ping', description: 'Refresh the prompt cache with a tiny forked request' },
  { name: 'cache-status', description: 'Show the prompt cache countdown' },
]

let ticker: Timer | undefined
let lastAutoTryAt = 0

// a cache cycle ends TTL_MS after its last hit; the cache is kept warm until warmHours after the last turn
const cycleEnd = (hit: number) => hit + TTL_MS
const warmEnd = (turn: number, hours: number) => turn + hours * HOUR_MS
const needsAnotherPing = (hit: number, turn: number, hours: number) => cycleEnd(hit) < warmEnd(turn, hours)

// each second: auto ping when a cycle is about to end and the warm window runs on; otherwise warn once before expiry
function startTicker($: EngineInterface) {
  if (ticker) return
  ticker = $.clock.every(1000, async () => {
    const hit = await read($, lastHitAt)
    if (hit === null) return
    const t = await $.clock.now()
    const left = cycleEnd(hit) - t
    const turn = (await read($, lastTurnAt)) ?? hit
    const hours = settings.cacheWarmHours
    // one ping fewer than the warm hours: a window of N hours is N cycles, and a ping that close to the cycle end would otherwise repeat
    if (needsAnotherPing(hit, turn, hours) && (await read($, cachePings)) < hours - 1) {
      const trigger = PING_BEFORE_MIN * MIN_MS
      if (left > 0 && left <= trigger && t - lastAutoTryAt >= RETRY_MS && !(await read($, isPinging))) {
        lastAutoTryAt = t
        await ping($, true)
      }
      return // another ping is planned: nothing to warn about
    }
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

// resetWindow: the ping also starts the warm window over, as if a turn had just finished
async function ping($: EngineInterface, isAuto = false, resetWindow = false): Promise<string> {
  if (await read($, isPinging)) return 'Ping already running.'
  await update($, isPinging, () => true)
  try {
    const r = await $.model.fork({ prompt: 'Reply with exactly: ok' })
    if (r.isAnswered) {
      const t = await $.clock.now()
      await update($, lastHitAt, () => t)
      if (resetWindow) {
        await update($, lastTurnAt, () => t)
        await update($, cachePings, () => 0)
      } else {
        await update($, cachePings, n => n + 1)
      }
      await update($, notified, () => false)
      const text = `Cache warmed: used ${r.usage.output_tokens} tokens to save ${r.usage.cache_read_input_tokens + r.usage.cache_creation_input_tokens} tokens`
      $.ui.toast(isAuto ? `Auto ping: ${text}` : text)
      return text
    }
    $.ui.toast(`${isAuto ? 'Auto ping' : 'Ping'} failed: ${r.reason}`)
    return `Ping failed: ${r.reason}`
  } finally {
    await update($, isPinging, () => false)
  }
}

export function registerCache(on: On) {
  // starts the ping watch; the gear button is drawn by the band, next to the countdown
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    startTicker($)
    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: SETTINGS_PANE }, async ($, e) => {
    const { Box, Button, Select, Text } = $.ui.resolve(e)
    await read($, settingsPing)
    const hours = settings.cacheWarmHours
    const isWarming = await read($, isPinging)
    let frame = ''
    if (isWarming) {
      await read($, now) // keeps the 1 s re-render subscription, so the spinner turns as the Reborn one does
      frame = SPINNER[Math.floor((await $.clock.now()) / 1000) % SPINNER.length]
    }
    const chooseWarm = async (value: number) => {
      const all = setSetting('cacheWarmHours', value)
      await update($, settingsPing, p => !p)
      await $.store.set(SETTINGS_STORE_KEY, all).catch(() => undefined)
    }
    const chooseReborn = async (value: number) => {
      const all = setSetting('rebornFromPct', value)
      await update($, settingsPing, p => !p)
      await $.store.set(SETTINGS_STORE_KEY, all).catch(() => undefined)
    }
    const chooseEffort = async (key: 'judgeEffort' | 'effortMin' | 'effortMax', value: string) => {
      let all = setSetting(key, value)
      // the lowest never passes the highest: the one just set pulls the other along
      if (EFFORTS.indexOf(settings.effortMin) > EFFORTS.indexOf(settings.effortMax)) all = setSetting(key === 'effortMin' ? 'effortMax' : 'effortMin', value)
      await update($, settingsPing, p => !p)
      await $.store.set(SETTINGS_STORE_KEY, all).catch(() => undefined)
    }
    // one short line: a longer one wraps in a narrow pane and drew two
    const rule = <Text dimColor>{'─'.repeat(24)}</Text>
    const effortOptions = (list: string[]) => list.map(v => ({ value: v, label: v }))
    return (
      <Box flexDirection="column">
        <Text bold>Auto effort: Haiku judges at</Text>
        <Box marginY={1}>
          <Select key="judge-effort" options={effortOptions(JUDGE_EFFORTS)} value={settings.judgeEffort} onSelect={value => void chooseEffort('judgeEffort', value)} />
        </Box>
        <Text bold>Auto effort: lowest</Text>
        <Box marginY={1}>
          <Select key="effort-min" options={effortOptions(EFFORTS)} value={settings.effortMin} onSelect={value => void chooseEffort('effortMin', value)} />
        </Box>
        <Text bold>Auto effort: highest</Text>
        <Box marginY={1}>
          <Select key="effort-max" options={effortOptions(EFFORTS)} value={settings.effortMax} onSelect={value => void chooseEffort('effortMax', value)} />
        </Box>
        <Text dimColor>Auto turns off when you pick an effort yourself.</Text>
        <Text dimColor>Haiku and Fable keep their own effort: only Sonnet and Opus 5.5 are steered.</Text>
        {rule}
        <Text bold>Suggest Reborn from context</Text>
        <Box marginY={1}>
          <Select
            key="reborn-at"
            options={REBORN_PCTS.map(pct => ({ value: String(pct), label: pct === 0 ? 'always' : `${pct}%` }))}
            value={String(settings.rebornFromPct)}
            onSelect={value => void chooseReborn(Number(value))}
          />
        </Box>
        {rule}
        <Text bold>Keep cache warm for</Text>
        <Box marginY={1}>
          <Select
            key="warm"
            options={WARM_HOURS.map(hr => ({ value: String(hr), label: `${hr} hour` }))}
            value={String(hours)}
            onSelect={value => void chooseWarm(Number(value))}
          />
        </Box>
        <Text dimColor>Auto ping 10 min before each cycle ends.</Text>
        <Text> </Text>
        <Box columnGap={1}>
          {isWarming ? (
            <Text color="cyan" bold>{frame} Warming…</Text>
          ) : (
            <Button key="warm-now" label="Warm now and restore cycle" onPress={() => void ping($, false, true)} />
          )}
          <Button key="close" label="close" onPress={() => void $.ui.close({ id: SETTINGS_PANE })} />
        </Box>
      </Box>
    )
  }).catch(($, e, next) => next(e))

  on('command.run', { command: 'cache-ping' }, async $ => ({ text: await ping($) }))
  .catch(($, e, next) => {
    const message = `/cache-ping failed: ${String(next.error)}`
    $.ui.toast(message, { timeoutMs: 20000 })
    return { text: message }
  })

  on('command.run', { command: 'cache-status' }, async $ => {
    const hit = await read($, lastHitAt)
    if (hit === null) return { text: 'Cache: no turn finished since the mod loaded.' }
    const left = cycleEnd(hit) - (await $.clock.now())
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
    await update($, lastTurnAt, () => t)
    await update($, cachePings, () => 0)
    await update($, now, () => t)
    await update($, notified, () => false)

    return next(e)
  })
}
