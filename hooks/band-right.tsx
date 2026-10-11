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

// Auto as a switch, as in effortless: a pill with its knob right and violet when on, left and grey when off.
// Right after a flip the image carries a slide (knob and colour move over SLIDE_MS) instead of jumping.
const SLIDE_MS = 260
function switchSvg(on: boolean, sinceFlipMs: number | null = null) {
  const slide = sinceFlipMs !== null && sinceFlipMs >= 0 && sinceFlipMs < SLIDE_MS
  const t = `${SLIDE_MS / 1000}s cubic-bezier(.3,.7,.2,1)`
  const css = slide
    ? `<style>.k{animation:k ${t}}.p{animation:p ${t}}@keyframes k{from{transform:translateX(${on ? -11 : 11}px);fill:${on ? '#8b8b93' : '#ffffff'}}}@keyframes p{from{fill:${on ? '#2c2c31' : '#7566d8'};stroke:${on ? '#4a4a52' : '#7566d8'}}}</style>`
    : ''
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="15" viewBox="0 0 26 15">${css}<rect class="p" x=".5" y=".5" width="25" height="14" rx="7" fill="${on ? '#7566d8' : '#2c2c31'}" stroke="${on ? '#7566d8' : '#4a4a52'}"/><circle class="k" cx="${on ? 18.5 : 7.5}" cy="7.5" r="5" fill="${on ? '#ffffff' : '#8b8b93'}"/></svg>`
  // every redraw restarts an image's animation; a negative delay resumes the slide where it was
  return slide ? svg.replace('</svg>', `<style>svg *{animation-delay:${(-sinceFlipMs / 1000).toFixed(3)}s !important}</style></svg>`) : svg
}
// when the Auto switch last changed, for the knob's slide
let autoSeen: boolean | undefined
let autoFlipAt = 0
let recSeen: boolean | undefined
let recFlipAt = 0

// outline icons, 14 px, the colour of the dim text: an open-link (a box with an arrow out of its corner) and a trash can
function linkSvg(color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"><g fill="none" stroke="${color}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M10.5 7.8V11a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1h3.2"/><path d="M8.2 2H12v3.8M12 2L6.3 7.7"/></g></svg>`
}
function trashSvg(color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"><g fill="none" stroke="${color}" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M2.2 3.8h9.6M5.3 3.8V2.4h3.4v1.4M3.5 3.8l.5 7.6a1 1 0 0 0 1 .9h4a1 1 0 0 0 1-.9l.5-7.6M5.8 6.2v3.6M8.2 6.2v3.6"/></g></svg>`
}

function closeSvg(color: string) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 14 14"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" fill="none" stroke="${color}" stroke-width="1.4" stroke-linecap="round"/></svg>`
}

async function openPane($: EngineInterface) {
  const result = await $.ui.open({ id: PANE, title: 'Auto-recommend' })
  await update($, paneUp, () => !!(result as any)?.isPlaced)
}
async function closePane($: EngineInterface) {
  await $.ui.close({ id: PANE })
  await update($, paneUp, () => false)
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
      // nothing to clear: the pane's button just closes it
      const hasHistory = ((await read($, history)) as unknown[]).length > 0
      const els = $.ui.resolve(e)
      const { Box, Button, Text } = els
      const Svg = e.surface !== 'terminal' && 'Svg' in els ? (els as any).Svg : null
      const autoOn = settings.autoEffort
      const nowMs = await $.clock.now()
      if (autoSeen !== undefined && autoSeen !== autoOn) autoFlipAt = nowMs
      autoSeen = autoOn
      if (recSeen !== undefined && recSeen !== auto) recFlipAt = nowMs
      recSeen = auto
      const pickedEffort = await read($, effortPick)
      const modelId = await read($, sessionModel)
      const effort = autoOn && pickedEffort ? pickedEffort : await read($, appEffort)
      const model = modelId ? (modelId.match(/haiku|sonnet|opus|fable/)?.[0] ?? modelId) : null
      const effortText = (await read($, judging)) ? 'judging…' : [effort, model].filter(Boolean).map(w => String(w).replace(/^./, c => c.toUpperCase())).join(' · ')
      const toggleEffort = async () => {
        const all = setSetting('autoEffort', !settings.autoEffort)
        await update($, settingsPing, p => !p)
        await $.store.set(SETTINGS_STORE_KEY, all).catch(() => undefined)
      }
      const toggleRecommend = async () => {
        const all = setSetting('autoRecommend', !settings.autoRecommend)
        await update($, settingsPing, p => !p)
        await $.store.set(SETTINGS_STORE_KEY, all).catch(() => undefined)
      }
      const recommendItem = Svg ? (
        <Box key="right-recommend" flexDirection="row" alignItems="center">
          <Box key="recommend-switch" position="relative" alignItems="center" justifyContent="center" paddingX={1} marginRight={-1}>
            <Svg source={switchSvg(auto, nowMs - recFlipAt)} alt={auto ? 'Recommend on' : 'Recommend off'} width={26} height={15} />
            <Box position="absolute" top={0} bottom={0} left={0} right={0} alignItems="center" justifyContent="center">
              <Button key="recommend-pill" plain hover={{ backgroundColor: 'rgba(20,20,22,0)' }} label={'\u00a0'.repeat(6)} onPress={() => void toggleRecommend()} />
            </Box>
          </Box>
          <Button key="recommend-text" plain dimColor hover={{ backgroundColor: BAND_BG }} label="Recommend" onPress={() => void toggleRecommend()} />
        </Box>
      ) : (
        <Button key="recommend-text" plain dimColor={!auto} color={auto ? 'green' : undefined} label={auto ? 'Recommend on' : 'Recommend off'} onPress={() => void toggleRecommend()} />
      )
      const effortItem = Svg ? (
        // the switch drawn, then the effort as the one text, which is the button that toggles it
        <Box key="right-effort" flexDirection="row" alignItems="center">
          {/* the pill drawn with a blank button laid over just it (the cog's pattern); the text is a button of its own */}
          <Box key="right-switch" position="relative" alignItems="center" justifyContent="center" paddingX={1} marginRight={-1}>
            <Svg source={switchSvg(autoOn, nowMs - autoFlipAt)} alt={autoOn ? 'Auto on' : 'Auto off'} width={26} height={15} />
            <Box position="absolute" top={0} bottom={0} left={0} right={0} alignItems="center" justifyContent="center">
              <Button key="band-auto-switch" plain hover={{ backgroundColor: 'rgba(20,20,22,0)' }} label={'\u00a0'.repeat(6)} onPress={() => void toggleEffort()} />
            </Box>
          </Box>
          <Button key="band-auto" plain dimColor hover={{ backgroundColor: BAND_BG }} label={effortText || 'auto'} onPress={() => void toggleEffort()} />
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
          {/* Recommend and its history icon sit together, closer than the band's gap between items */}
          <Box key="right-recommend-group" flexDirection="row" alignItems="center">
            {recommendItem}
            {/* the pane's button as an icon with a blank button over it (the cog's pattern): a trash can to clear the history while the pane is up, else an open-link to open it */}
            {Svg ? (
              <Box key="right-pane" position="relative" alignItems="center" justifyContent="center" paddingX={1}>
                <Svg source={isUp ? (hasHistory ? trashSvg('#a1a1aa') : closeSvg('#a1a1aa')) : linkSvg('#a1a1aa')} alt={isUp ? (hasHistory ? 'Clear history' : 'Close history') : 'Open history'} width={14} height={14} />
                <Box position="absolute" top={0} bottom={0} left={0} right={0} alignItems="center" justifyContent="center">
                  <Button key={isUp ? 'auto-clear' : 'auto'} plain label={'\u00a0'.repeat(3)} onPress={() => void (isUp ? (hasHistory ? clearAndClose($) : closePane($)) : openPane($))} />
                </Box>
              </Box>
            ) : isUp ? (
              <Button key="auto-clear" plain label={hasHistory ? 'Clear history' : 'Close'} onPress={() => void (hasHistory ? clearAndClose($) : closePane($))} />
            ) : (
              <Button key="auto" plain label="History" onPress={() => void openPane($)} />
            )}
          </Box>
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
