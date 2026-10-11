import { atom, read, update } from 'claude-code'
import type { EngineInterface, On } from 'claude-code'
import { EFFORTS, clampEffort, settings } from './settings'

// Auto effort, the small copy of effortless's: Haiku reads each message you send and picks the effort for it.
// Effort only; the model is never switched. The setting is in ./settings and the band toggles it; the atoms only hold what the band shows.
const effortPick = atom({ plugin: 'my-mods', key: 'effortPick' } as const, null)
const appEffort = atom({ plugin: 'my-mods', key: 'appEffort' } as const, null)
const sessionModel = atom({ plugin: 'my-mods', key: 'sessionModel' } as const, null)
const judging = atom({ plugin: 'my-mods', key: 'judging' } as const, false)

// the plain alias, so the judge follows the newest Haiku when one ships
const HAIKU = 'haiku'
// an effort change between two requests keeps the prompt cache on these models only (measured in effortless)
export const cacheSafe = (modelId: string) => /(opus|sonnet)-5-5/.test(modelId)
// a message of one or two short words ("yes", "go", "ok") keeps the effort already chosen
export const isFollowUp = (text: string) => {
  const t = text.trim()
  return t.length > 0 && t.length <= 12 && t.split(/\s+/).length <= 2
}

const JUDGE_SYSTEM = `You choose the reasoning effort an agentic assistant (it reads files, runs tools and edits things, not only code) should use for the user's next message. Pick the lowest effort that will still do the job well.

Effort: low for quick answers that need no tools and no planning, medium for normal work, high for hard problems, xhigh or max only for very hard ones. Effort is relative to the model in use ("Current" names it): a stronger model needs less effort for the same job.

Judge the SCOPE and the amount of work, not whether it is code. A short message can ask for a lot: "review the entire repo", "migrate everything" are big, tool-heavy jobs: never low, usually high.

If the message answers a question in the assistant's last reply, judge the work that answer starts, not the length of the answer: "yes" to one small action is low, "B" can mean "build the complicated section B". A message that pushes back on or adds to work under discussion keeps at least that work's effort. Thanks or a closing remark is low. If the person asks for deep thought, pick at least high; for a quick answer, low.

Reply with JSON only: {"effort":"low|medium|high|xhigh|max"}`

/** Reads the effort out of the judge's reply, or nothing. */
export function parseEffort(text: string): string | undefined {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return undefined
  try {
    const { effort } = JSON.parse(match[0]) as { effort?: unknown }
    return typeof effort === 'string' && EFFORTS.includes(effort) ? effort : undefined
  } catch {
    return undefined
  }
}

async function askHaiku($: EngineInterface, text: string, current: string): Promise<string | undefined> {
  const messages = await $.session.messages().catch(() => [])
  const lastUser = [...messages].reverse().find(m => m.role === 'user')
  const lastReply = [...messages].reverse().find(m => m.role === 'assistant' && m.text.trim())
  const prompt = [
    `Current: ${current}`,
    lastUser || lastReply
      ? `Recent conversation:\n${[lastUser ? `user: ${lastUser.text.slice(0, 400)}` : '', lastReply ? `assistant: ${lastReply.text.slice(-1500)}` : ''].filter(Boolean).join('\n')}`
      : '',
    `Next message:\n${text.slice(0, 2000)}`,
  ].filter(Boolean).join('\n\n')
  const ask = (model: string) => $.model.complete({ model, system: JUDGE_SYSTEM, prompt, maxTokens: 60, effort: settings.judgeEffort, timeoutMs: 6000 })
  const r = await ask(HAIKU)
  return r.isAnswered ? parseEffort(r.text) : undefined
}

export function registerEffort(on: On) {
  on('prompt.submit', async ($, e, next) => {
    const byPerson = e.origin.kind === 'composer' || e.origin.kind === 'bridge' || e.origin.kind === 'sdk'
    const id = await $.session.model().catch(() => '')
    if (id) await update($, sessionModel, () => id)
    // a message typed while a turn runs leaves that turn's effort alone
    if (!settings.autoEffort || !byPerson || e.text.trim().startsWith('/') || e.turnId !== undefined || !cacheSafe(id)) return next(e)
    if (isFollowUp(e.text) && (await read($, effortPick))) return next(e)
    await update($, judging, () => true)
    try {
      const current = `${id} / ${(await read($, effortPick)) ?? (await read($, appEffort)) ?? 'medium'}`
      const effort = await askHaiku($, e.text, current).catch(() => undefined)
      if (effort) await update($, effortPick, () => clampEffort(effort))
    } finally {
      await update($, judging, () => false)
    }
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    if (e.agentId === undefined) {
      await update($, sessionModel, () => e.model)
      if (typeof e.effort === 'string') {
        await update($, appEffort, () => e.effort)
      }
      const pick = await read($, effortPick)
      if (settings.autoEffort && pick && cacheSafe(e.model)) return yield* next({ ...e, effort: pick })
    }
    return yield* next(e)
  })
}
