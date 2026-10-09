export const TTL_MS = 60 * 60 * 1000
export const WARN_MS = 5 * 60 * 1000

export const clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000))
  const m = Math.floor(s / 60)
  return `${m}:${String(s % 60).padStart(2, '0')}`
}

export const minutes = (ms: number) => `${Math.floor(Math.max(0, ms) / 60000)}m`
