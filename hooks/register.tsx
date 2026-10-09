import { atom, update } from 'claude-code'
import type { Register } from 'claude-code'
import { AUTO_RECOMMEND_COMMANDS, registerAutoRecommend } from './auto-recommend'
import { AGENTS_BAND_STORE_KEY, AGENTS_COMMANDS, registerAgents } from './agents'
import { registerBand } from './band'
import { CACHE_COMMANDS, registerCache } from './cache'
import { REBORN_COMMANDS, registerReborn } from './reborn'
import { registerUsage } from './usage'

const now = atom({ plugin: 'my-mods', key: 'now' } as const, 0)
const phase = atom({ plugin: 'my-mods', key: 'phase' } as const, null)
const autoHistory = atom({ plugin: 'my-mods', key: 'autoHistory' } as const, [])
const agentsBandOn = atom({ plugin: 'my-mods', key: 'agentsBandEnabled' } as const, true)
const autoRecommend = atom({ plugin: 'my-mods', key: 'autoRecommend' } as const, true)

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
    for (const command of [...CACHE_COMMANDS, ...REBORN_COMMANDS, ...AUTO_RECOMMEND_COMMANDS, ...AGENTS_COMMANDS]) {
      await $.command.register(command)
    }

    const showAgents = await $.store.get(AGENTS_BAND_STORE_KEY)
    if (typeof showAgents === 'boolean') await update($, agentsBandOn, () => showAgents)

    return next(e)
  })

  registerCache(on)
  registerUsage(on)
  registerReborn(on)
  registerAutoRecommend(on)
  registerAgents(on)
  registerBand(on)
}
