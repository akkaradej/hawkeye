import { atom, read, update } from 'claude-code'
import type { On } from 'claude-code'
import { EFFORTS, JUDGE_EFFORTS, REBORN_PCTS, SETTINGS_STORE_KEY, setSetting, settings } from './settings'
import { SPINNER, WARM_HOURS } from './format'

// the values are in ./settings; this atom only redraws
const settingsPing = atom({ plugin: 'hawkeye', key: 'settingsPing' } as const, false)
const isPinging = atom({ plugin: 'hawkeye', key: 'isPinging' } as const, false)
const now = atom({ plugin: 'hawkeye', key: 'now' } as const, 0)

export const SETTINGS_PANE = 'settings'

export function registerSettingsPane(on: On) {
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
            <Button key="warm-now" label="Warm now and restore cycle" onPress={() => void $.command.run({ command: 'cache-ping', args: 'reset', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })} />
          )}
        </Box>
      </Box>
    )
  }).catch(($, e, next) => next(e))
}
