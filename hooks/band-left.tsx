import { atom, read, update } from 'claude-code'
import type { EngineInterface, On, Timer } from 'claude-code'
import { SPINNER, TTL_MS, minutes } from './format'
import { settings } from './settings'
import { BAND_BG, BAND_EDGE, CARD_BG } from './look'
import { handoffArt, hawkSvg } from './card'

const lastHitAt = atom({ plugin: 'my-mods', key: 'lastHitAt' } as const, null)
const now = atom({ plugin: 'my-mods', key: 'now' } as const, 0)
const settingsPing = atom({ plugin: 'my-mods', key: 'settingsPing' } as const, false)
const cachePings = atom({ plugin: 'my-mods', key: 'cachePings' } as const, 0)
// Reborn: reborn.tsx runs the flow; the button here asks for it, and the spinner follows its phase
const phase = atom({ plugin: 'my-mods', key: 'phase' } as const, null)
const rebornAsk = atom({ plugin: 'my-mods', key: 'rebornAsk' } as const, false)
const percent = atom({ plugin: 'my-mods', key: 'percent' } as const, null)
// the context as a ring: a faint track with the used share drawn over it, in the forecast's colour
function ringSvg(percent: number, color: string, spin = false) {
  const p = Math.max(0, Math.min(100, percent))
  const c = 2 * Math.PI * 6
  return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">${spin ? '<style>.s{transform-origin:8px 8px;animation:s 1.1s linear infinite}@keyframes s{to{transform:rotate(360deg)}}</style>' : ''}<circle cx="8" cy="8" r="6" fill="none" stroke="${color}" stroke-opacity=".25" stroke-width="2.2"/><g${spin ? ' class="s"' : ''}><circle cx="8" cy="8" r="6" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round" stroke-dasharray="${((c * p) / 100).toFixed(2)} ${c.toFixed(2)}" transform="rotate(-90 8 8)"/></g></svg>`
}
// Forecast bands, by percent of the context window used.
const FORECAST = [
  { upTo: 25, icon: '☀', word: 'Clear', color: 'yellow', hex: '#facc15' },
  { upTo: 40, icon: '☁', word: 'Cloudy', color: 'cyan', hex: '#22d3ee' },
  { upTo: 55, icon: '☂', word: 'Showers', color: 'blue', hex: '#60a5fa' },
  { upTo: 70, icon: '☇', word: 'Storm', color: 'magenta', hex: '#e879f9' },
  { upTo: 85, icon: '❄', word: 'Blizzard', color: 'red', hex: '#f87171' },
  { upTo: Infinity, icon: '↯', word: 'Compact soon', color: 'red', hex: '#f87171' },
] as const

// the left band: the cache countdown, the context and Reborn
async function leftBand($: EngineInterface, e: any) {
  const hit = await read($, lastHitAt)
  const els = $.ui.resolve(e)
  const { Box, Button, Text } = els
  const Svg = e.surface !== 'terminal' && 'Svg' in els ? (els as any).Svg : null
  const pct = await read($, percent)
  // the Reborn button: on the desktop a hawk icon and the word, with a blank button laid over both to
  // take the press. The highlight is the row's own hover (scoped to the button), so it always fits the row, not the blanks (no-break spaces, as the cog; the font is proportional, so a letter is wider than a blank: about 1.8 blanks); the terminal keeps the ☀ glyph
  const rebornButton = (word: string, onPress: () => void) =>
    Svg ? (
      <Box key="band-all" position="relative" flexDirection="row" alignItems="center" paddingLeft={0} paddingRight={0} hover={{ scope: 'reborn', backgroundColor: '#242424' }}>
        <Box width={2} height={1} position="relative" alignItems="center" justifyContent="center">
          <Svg source={hawkSvg('#acacac', 14)} alt="Reborn" width={14} height={14} />
          <Box position="absolute" top={0} bottom={0} left={0} right={0} alignItems="center" justifyContent="center" display="none" hover={{ scope: 'reborn', display: 'flex' }}>
            <Svg source={hawkSvg('#ffffff', 14)} alt="Reborn" width={14} height={14} />
          </Box>
        </Box>
        <Text color="#acacac" hover={{ scope: 'reborn', color: '#ffffff' }}>{word}{'\u2009\u2009'}</Text>
        <Box position="absolute" top={0} bottom={0} left={0} right={0} alignItems="center" justifyContent="flex-end">
          <Button key="band-all-press" label={'\u00a0'.repeat(Math.round(word.length * 1.8) + 6)} plain hover={{ scope: 'reborn', backgroundColor: '#00000000' }} onPress={onPress} />
        </Box>
      </Box>
    ) : (
      <Button key="band-all" label={`☀ ${word}`} plain dimColor onPress={onPress} />
    )
  const p = await read($, phase)
  const f = pct === null ? null : (FORECAST.find(b => pct < b.upTo) ?? FORECAST[FORECAST.length - 1])
  const forecast = f && (
    <Box alignItems="center">
      {Svg ? <Svg source={ringSvg(pct, f.hex, !!p)} alt="Context" width={16} height={16} /> : <Text color={f.color} bold>{f.icon}</Text>}
      <Text color={f.color} bold> {pct}%</Text>
    </Box>
  )
  // the Reborn button sits right next to the context; a spinner replaces it while it works
  // Reborn stays out of the way until the context is above the chosen share (0 = always)
  const showReborn = settings.rebornFromPct === 0 || (pct !== null && pct > settings.rebornFromPct)
  let rebornItem
  if (p) {
    // on the desktop the art is the progress: a 1 s redraw would restart it and make it jerk, so no spinner there
    const word = p === 'writing' ? 'Reborning…' : 'Clearing…'
    if (Svg) {
      // the gold card and the hawks are the progress, so the button is hidden while it works
      rebornItem = null
    } else {
      await read($, now) // keeps the 1 s re-render subscription, so the spinner turns
      const frame = SPINNER[Math.floor((await $.clock.now()) / 1000) % SPINNER.length]
      rebornItem = <Text color="cyan" bold>{frame} {word}</Text>
    }
  } else {
    rebornItem = (
      <Box>
        {showReborn &&
          rebornButton('Reborn', () => {
            void update($, rebornAsk, () => true)
            void update($, phase, () => 'writing')
          })}
      </Box>
    )
  }
  const nowMs = await $.clock.now()
  const context = (
    <Box>
      {forecast}
      {forecast && <Text> </Text>}
      {rebornItem}
    </Box>
  )
  // while Reborn works the band card itself takes the handoff look: warm ground and the hawks flying behind its
  // content (desktop only)
  const working = !!p
  // the band is one rounded card: cache on the left, context and Reborn in the middle
  const card = (cache: any) => (
    <Box key="left-band" position="relative" overflow="hidden" flexGrow={1} flexDirection="row" alignItems="center" gap={2} paddingX={1} borderStyle="round" borderColor={working ? CARD_BG : BAND_EDGE} backgroundColor={working ? CARD_BG : BAND_BG}>
      {working && Svg && (
        <Box key="band-art" position="absolute" top={-1} left={0} bottom={-1}>
          <Svg source={handoffArt(nowMs)} alt="handing off" width={1600} height={128} />
        </Box>
      )}
      <Box key="band-cache" position="relative">{cache}</Box>
      <Box key="band-context" position="relative">{context}</Box>
      <Box key="band-spacer" flexGrow={1} />
    </Box>
  )
  const line = (cache: any) => card(cache)
  const cacheItem = (text: any) => text
  if (hit === null) {
    // no cache reading yet: show the settings button and the other items, the countdown joins once a turn finishes
    return line(cacheItem(null))
  }
  // read the clock on every render: the stored tick can lag or stall, which left "expired" on screen
  // not while the art plays: each redraw restarts its animation, which showed as jerking
  if (!working || !Svg) await read($, now) // keeps the 1 s re-render subscription
  const t = await $.clock.now()
  const left = hit + TTL_MS - t
  // with auto ping the cache lives several 1 hour cycles: show which one this is
  await read($, settingsPing)
  const hours = settings.cacheWarmHours
  // the last ping is the cap: while one is left the next ping renews the cache, so the cycle shows without the time; after it, the time
  const pings = await read($, cachePings)
  const hasPingLeft = hours > 1 && pings < hours - 1

  if (left <= 0) {
    return line(cacheItem(<Text dimColor>Cache expired</Text>))
  }
  const shown = hasPingLeft ? `${pings + 1}/${hours}h` : minutes(left)
  return line(cacheItem(<Text color="green" bold>Cache {shown}</Text>))
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

export function registerBandLeft(on: On) {
  // One band is shared with other plugins (Context draws there too):
  // draw our row and stack whatever the plugins beneath draw under it.
  let warned = false
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    startTicker($)
    const below = await next(e)
    try {
      if ((e.props ?? e).hasSurvey) return below
      const mine = await leftBand($, e)
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
