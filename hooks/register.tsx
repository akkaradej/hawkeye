import { atom, update } from 'claude-code'
import type { Register } from 'claude-code'
import { AUTO_RECOMMEND_COMMANDS, registerAutoRecommend } from './auto-recommend'
import { registerBand } from './band'
import { CACHE_COMMANDS, CACHE_WARM_STORE_KEY, registerCache } from './cache'
import { DEFAULT_WARM_HOURS, WARM_HOURS } from './format'
import { REBORN_COMMANDS, registerReborn } from './reborn'
import { registerUsage } from './usage'

const now = atom({ plugin: 'my-mods', key: 'now' } as const, 0)
const phase = atom({ plugin: 'my-mods', key: 'phase' } as const, null)
const autoHistory = atom({ plugin: 'my-mods', key: 'autoHistory' } as const, [])
const autoRecommend = atom({ plugin: 'my-mods', key: 'autoRecommend' } as const, true)
const warmHours = atom({ plugin: 'my-mods', key: 'cacheWarmHours' } as const, DEFAULT_WARM_HOURS)

// Cache countdown: each feature registers its own hooks from its own file. A plugin has one
// session.start, so the features' commands are registered from it. Only `on` crosses a file;
// `$` is used inside the hooks each file registers.
export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await update($, now, () => 0)
    await update($, autoRecommend, () => true)
    await update($, autoHistory, () => [])
    // state outlives a reload, so a save cut off by one must not leave the button stuck
    await update($, phase, () => null)
    for (const command of [...CACHE_COMMANDS, ...REBORN_COMMANDS, ...AUTO_RECOMMEND_COMMANDS]) {
      await $.command.register(command)
    }

    // the auto ping setting outlives the session
    const warm = await $.store.get(CACHE_WARM_STORE_KEY)
    if (typeof warm === 'number' && WARM_HOURS.includes(warm)) await update($, warmHours, () => warm)


    return next(e)
  })

  registerCache(on)
  registerUsage(on)
  registerReborn(on)
  registerAutoRecommend(on)
  registerBand(on)
}
