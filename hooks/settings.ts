import { DEFAULT_WARM_HOURS, WARM_HOURS } from './format'

export type Settings = { cacheWarmHours: number; autoRecommend: boolean; rebornFromPct: number }

// the Reborn button shows once the context is above this many percent; 0 shows it always
export const REBORN_PCTS = [0, 10, 15, 20, 25, 30, 35, 40, 45, 50]
export const DEFAULT_REBORN_PCT = 15

export const SETTINGS_STORE_KEY = 'settings'

// The mod's settings live in this object: a /clear (the Reborn hand-off) resets atoms, not the module, so they
// are read from here, never from an atom. Each file keeps an atom only as a redraw ping, flipped at every change.
// The store keeps a copy for a reload, which loses the module. `$` cannot cross a file, so callers use the store.
export const settings: Settings = { cacheWarmHours: DEFAULT_WARM_HOURS, autoRecommend: true, rebornFromPct: DEFAULT_REBORN_PCT }

/** Remember one setting; returns all of them, to put in the store. */
export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): Settings {
  settings[key] = value
  return { ...settings }
}

/** Fills the settings from what the store kept (after a reload, which loses the module). */
export function restoreSettings(kept?: unknown) {
  const stored = (kept ?? {}) as Record<string, unknown>
  if (typeof stored.cacheWarmHours === 'number' && WARM_HOURS.includes(stored.cacheWarmHours)) settings.cacheWarmHours = stored.cacheWarmHours
  if (typeof stored.rebornFromPct === 'number' && REBORN_PCTS.includes(stored.rebornFromPct)) settings.rebornFromPct = stored.rebornFromPct
  if (typeof stored.autoRecommend === 'boolean') settings.autoRecommend = stored.autoRecommend
}
