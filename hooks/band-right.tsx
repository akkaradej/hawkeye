import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'
import { BAND_BG, BAND_EDGE } from './look'
import { SETTINGS_STORE_KEY, setSetting, settings } from './settings'

// the right band: the auto features in one card beside the left band, in the same look. The Auto effort switch with
// the effort and model in use, then the Auto-recommend button (which opens its pane, or clears it while it is up).
// The values are in ./settings and the pane's logic in ./auto-recommend; the atoms here are the ones they keep.
const settingsPing = atom({ plugin: 'my-mods', key: 'settingsPing' } as const, false)
const effortPick = atom({ plugin: 'my-mods', key: 'effortPick' } as const, null)
const appEffort = atom({ plugin: 'my-mods', key: 'appEffort' } as const, null)
const sessionModel = atom({ plugin: 'my-mods', key: 'sessionModel' } as const, null)
const judging = atom({ plugin: 'my-mods', key: 'judging' } as const, false)
const history = atom({ plugin: 'my-mods', key: 'autoHistory' } as const, [])
const paneUp = atom({ plugin: 'my-mods', key: 'autoPaneUp' } as const, false)
const PANE = 'auto-recommend'

// Auto as a switch, as in effortless: a pill with its knob right and violet when on, left and grey when off
function switchSvg(on: boolean) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="15" viewBox="0 0 26 15"><rect x=".5" y=".5" width="25" height="14" rx="7" fill="${on ? '#7566d8' : '#2c2c31'}" stroke="${on ? '#7566d8' : '#4a4a52'}"/><circle cx="${on ? 18.5 : 7.5}" cy="7.5" r="5" fill="${on ? '#ffffff' : '#8b8b93'}"/></svg>`
}

async function openPane($: EngineInterface) {
  const result = await $.ui.open({ id: PANE, title: 'Auto-recommend' })
  await update($, paneUp, () => !!(result as any)?.isPlaced)
}
async function clearAndClose($: EngineInterface) {
  await update($, history, () => [])
  await $.ui.close({ id: PANE })
  await update($, paneUp, () => false)
}

export function registerBandRight(on: On) {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const below = await next(e)
    try {
      if ((e.props ?? e).hasSurvey) return below
      await read($, settingsPing)
      const auto = settings.autoRecommend
      const isUp = await read($, paneUp)
      const els = $.ui.resolve(e)
      const { Box, Button, Text } = els
      const Svg = e.surface !== 'terminal' && 'Svg' in els ? (els as any).Svg : null
      const autoOn = settings.autoEffort
      const pickedEffort = await read($, effortPick)
      const modelId = await read($, sessionModel)
      const effort = autoOn && pickedEffort ? pickedEffort : await read($, appEffort)
      const model = modelId ? (modelId.match(/haiku|sonnet|opus|fable/)?.[0] ?? modelId) : null
      const effortText = (await read($, judging)) ? 'judging…' : [effort, model].filter(Boolean).join(' · ')
      const toggleEffort = async () => {
        const all = setSetting('autoEffort', !settings.autoEffort)
        await update($, settingsPing, p => !p)
        await $.store.set(SETTINGS_STORE_KEY, all).catch(() => undefined)
      }
      const effortItem = Svg ? (
        // the switch drawn, then the effort as the one text, which is the button that toggles it
        <Box key="right-effort" flexDirection="row" alignItems="center" gap={1}>
          <Svg source={switchSvg(autoOn)} alt={autoOn ? 'Auto on' : 'Auto off'} width={26} height={15} />
          <Button key="band-auto" plain dimColor label={effortText || 'auto'} onPress={() => void toggleEffort()} />
        </Box>
      ) : (
        <Box key="right-effort">
          <Button key="band-auto" label={autoOn ? 'Auto on' : 'Auto off'} plain dimColor={!autoOn} color={autoOn ? 'green' : undefined} onPress={() => void toggleEffort()} />
          <Text dimColor> {effortText}</Text>
        </Box>
      )
      const rightBand = (
        <Box key="right-band" flexShrink={0} flexDirection="row" alignItems="center" gap={2} paddingX={1} marginLeft={1} borderStyle="round" borderColor={BAND_EDGE} backgroundColor={BAND_BG}>
          {effortItem}
          {isUp ? (
            <Button key="auto-clear" plain label={auto ? '✓ Clear history' : '○ Clear history'} onPress={() => void clearAndClose($)} />
          ) : (
            <Button key="auto" plain label={auto ? '✓ Auto-recommend' : '○ Auto-recommend'} onPress={() => void openPane($)} />
          )}
        </Box>
      )
      return below ? (
        <Box flexGrow={1} alignItems="flex-start">
          <Box flexGrow={1}>{below}</Box>
          {rightBand}
        </Box>
      ) : (
        rightBand
      )
    } catch {
      return below
    }
  })
}
