import { atom, update } from 'claude-code'
import type { Register } from 'claude-code'
import { AUTO_RECOMMEND_COMMANDS, registerAutoRecommend } from './auto-recommend'
import { registerBandLeft } from './band-left'
import { registerBandRight } from './band-right'
import { registerEffort } from './effort'
import { CACHE_COMMANDS, registerCache } from './cache'
import { registerSettingsPane } from './settings-pane'
import { REBORN_COMMANDS, registerReborn } from './reborn'
import { SETTINGS_STORE_KEY, restoreSettings } from './settings'
import { registerUsage } from './usage'

const now = atom({ plugin: 'hawkeye', key: 'now' } as const, 0)
const phase = atom({ plugin: 'hawkeye', key: 'phase' } as const, null)
const autoHistory = atom({ plugin: 'hawkeye', key: 'autoHistory' } as const, [])
const settingsPing = atom({ plugin: 'hawkeye', key: 'settingsPing' } as const, false)

// Cache countdown: each feature registers its own hooks from its own file. A plugin has one
// session.start, so the features' commands are registered from it. Only `on` crosses a file;
// `$` is used inside the hooks each file registers.
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await update($, now, () => 0)
    await update($, autoHistory, () => [])
    // state outlives a reload, so a save cut off by one must not leave the button stuck
    await update($, phase, () => null)
    for (const command of [...CACHE_COMMANDS, ...REBORN_COMMANDS, ...AUTO_RECOMMEND_COMMANDS]) {
      await $.command.register(command)
    }

    // settings outlive a /clear and a reload
    restoreSettings(await $.store.get(SETTINGS_STORE_KEY))
    await update($, settingsPing, p => !p)

    return next(e)
  })

  registerCache(on)
  registerSettingsPane(on)
  registerUsage(on)
  registerReborn(on)
  registerAutoRecommend(on)
  registerEffort(on)
  registerBandRight(on)
  registerBandLeft(on)
}
