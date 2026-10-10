declare module 'claude-code' {
  interface PluginState {
    'my-mods': {
      lastHitAt: number | null
      lastTurnAt: number | null
      cacheWarmHours: number
      cachePings: number
      now: number
      notified: boolean
      isPinging: boolean
      phase: 'saving' | 'clearing' | null
      rebornAsk: boolean
      autoRecommend: boolean
      autoPaneUp: boolean
      autoHistory: { at: string; entries: { question: string; answer: string }[] }[]
      percent: number | null
      limits: { fiveHour: number | null; sevenDay: number | null }
    }
  }
}
