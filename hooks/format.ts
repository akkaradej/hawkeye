export const TTL_MS = 60 * 60 * 1000
export const WARN_MS = 5 * 60 * 1000
export const MIN_MS = 60 * 1000
export const HOUR_MS = 60 * MIN_MS

// auto ping: how long to keep the cache warm after the last turn; each ping goes out this long before a cache cycle ends
export const WARM_HOURS = Array.from({ length: 24 }, (_, i) => i + 1)
export const PING_BEFORE_MIN = 10
export const DEFAULT_WARM_HOURS = 1

export const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export const minutes = (ms: number) => `${Math.floor(Math.max(0, ms) / 60000)}m`

export const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

/** Shows a path under the home directory as `~/...`. */
export const tildify = (path: string, home?: string) => {
  if (!home) return path
  const base = home.replace(/\/+$/, '')
  return path === base ? '~' : path.startsWith(base + '/') ? '~' + path.slice(base.length) : path
}
