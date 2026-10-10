/** What a sub-agent's last tool call was, for its mood. */
export type AgentActivity = 'reading' | 'building' | 'running' | 'testing' | 'teamwork'
/** Where a sub-agent's loop stands, as `$.agent.list()` says. */
export type AgentRowStatus = 'pending' | 'running' | 'waiting' | 'idle' | 'completed' | 'failed' | 'killed'
/** One step a sub-agent took: a tool call, in plain words. */
export type AgentStep = { text: string; at: number }
/** A sub-agent's own to-do list, as its last TodoWrite left it. */
export type AgentPlan = { done: number; total: number; current: string | null }
/** One task a sub-agent made with TaskCreate, kept to count its plan. */
export type AgentTask = { id: string; subject: string; activeForm: string | null; status: 'pending' | 'in_progress' | 'completed' }
/** One sub-agent, as the Agents band and panel show it. */
export type AgentRow = {
  id: string
  description: string
  type: string
  parentId: string | null
  status: AgentRowStatus
  startedAt: number
  finishedAt: number | null
  activity: AgentActivity | null
  activityAt: number | null
  step: string | null
  tools: number
  /** Its to-do list, once it has written one; null while it works without a plan. */
  plan: AgentPlan | null
  /** The tasks it made with TaskCreate (a TodoWrite list needs none); its plan is counted from them. */
  tasks: AgentTask[]
  recent: AgentStep[]
  result: string | null
  tint: number
  /** The model it runs on, as the engine named it; null until known. */
  model: string | null
  /** Its reasoning effort (`low`..`max` or a budget); null until a request shows it. */
  effort: string | null
  /** Tokens its last request carried, and how full of the context window that is (0 to 100); null until one answers. */
  ctxTokens: number | null
  ctxPercent: number | null
}
/** The sub-agents of this session. */
export type AgentsState = {
  rows: AgentRow[]
  roundStartedAt: number | null
  isSettled: boolean
}

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
      agentsBandEnabled: boolean
      agents: AgentsState
      agentsTick: number
      agentsOpenSteps: string[]
      percent: number | null
      limits: { fiveHour: number | null; sevenDay: number | null }
    }
  }
}
