declare module 'claude-code' {
  interface PluginState {
    'hawkeye': {
      lastHitAt: number | null
      lastTurnAt: number | null
      settingsPing: boolean
      cachePings: number
      now: number
      notified: boolean
      isPinging: boolean
      phase: 'saving' | 'clearing' | null
      rebornAsk: boolean
      sessionState: 'idle' | 'running' | 'asking'
      autoPaneUp: boolean
      autoHistory: { at: string; entries: { question: string; answer: string }[] }[]
      percent: number | null
      effortPick: string | null
      appEffort: string | null
      sessionModel: string | null
      judging: boolean
      limits: { fiveHour: number | null; sevenDay: number | null }
    }
  }
}
