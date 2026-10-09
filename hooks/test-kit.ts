import type { Engine } from 'claude-code/testing'

// a slash command typed at the composer
export const run = ($: Engine, command: string) =>
  $.command.run({ command, args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 80 } })
