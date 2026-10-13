# Hawkeye

Claude Code mod: status dot, extend prompt cache, context ring, reborn, auto effort and more.

## Features

- **Status dot**: coral pulse while a turn is running, an empty ring when idle, and a wait state for permission prompts or questions.
- **Extend prompt cache**: shows a countdown of how long the prompt cache stays warm, and can ping the cache with a tiny forked request to keep it warm for a chosen number of hours after your last turn.
- **Context ring**: shows how much of the context window is used, with a forecast (Clear, and so on) by percent.
- **Usage limits**: 5-hour and 7-day rate-limit usage in the status line under the prompt.
- **Directory and branch**: the status line also starts with `$` and the short directory, then the git branch when inside a repo (`$ hawkeye/hooks ⎇ main`). In a repo it shows the repo folder plus the path below it; elsewhere the last two segments, with `~` for home.
- **Reborn**: writes a handoff of the current session (goal, git state and so on), clears, and continues in a fresh session. The button appears once the context passes a set percent.
- **Auto effort**: a simplified version of [effortless](https://github.com/HeyCubit/effortless). Haiku reads each message and picks the reasoning effort for it, between a lowest and highest you choose. The model is never switched.
- **Auto-recommend**: answers `AskUserQuestion` prompts with the recommended options, with a pane showing the history.
- **Suggest**: a switch for the [next-steps](https://github.com/anthropics/claude-plugins-community/blob/main/next-steps) plugin's suggestions. It has no switch of its own, so Hawkeye toggles its "Shortest answer to suggest after" setting. The switch shows only while next-steps is enabled.

## Commands

| Command | Description |
| --- | --- |
| `/cache-ping` | Refresh the prompt cache with a tiny forked request |
| `/cache-status` | Show the prompt cache countdown |
| `/reborn` | Write a handoff, clear this session, and carry on in a new one |
| `/auto-recommend` | Open the auto-recommend pane (toggle, history of auto answers) |

Settings live in the settings pane (cache warm hours, Reborn threshold, auto effort and effort range, and the status line). The status line has two separate On/Off switches, one for the directory and branch and one for the usage limits, so you can show either or both.

## Layout

```
.claude-plugin/plugin.json   plugin manifest
hooks/hooks.json             entry point (register.tsx)
hooks/                       one module per feature, with *.test.ts(x) beside it
types/index.d.ts             types for the mod API
```

## Development

Tests sit next to the modules in `hooks/`. The mod is loaded through Claude Code's plugin system using `.claude-plugin/plugin.json`.

## License

[MIT](LICENSE). Auto effort is adapted from [effortless](https://github.com/HeyCubit/effortless), also MIT, Copyright (c) 2026 HeyCubit.
