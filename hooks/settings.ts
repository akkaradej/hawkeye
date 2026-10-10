import { DEFAULT_WARM_HOURS, WARM_HOURS } from './format'

export type Settings = { cacheWarmHours: number; autoRecommend: boolean }

export const SETTINGS_STORE_KEY = 'settings'

// The mod's settings live in this object: a /clear (the Reborn hand-off) resets atoms, not the module, so they
// are read from here, never from an atom. Each file keeps an atom only as a redraw ping, flipped at every change.
// The store keeps a copy for a reload, which loses the module. `$` cannot cross a file, so callers use the store.
export const settings: Settings = { cacheWarmHours: DEFAULT_WARM_HOURS, autoRecommend: true }

/** Remember one setting; returns all of them, to put in the store. */
export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Settings {
  settings[key] = value
  return { ...settings }
}

/** Fills the settings from what the store kept (after a reload, which loses the module). */
export function restoreSettings(kept?: unknown) {
  const stored = (kept ?? {}) as Record<string, unknown>
  if (typeof stored.cacheWarmHours === 'number' && WARM_HOURS.includes(stored.cacheWarmHours)) settings.cacheWarmHours = stored.cacheWarmHours
  if (typeof stored.autoRecommend === 'boolean') settings.autoRecommend = stored.autoRecommend
}
