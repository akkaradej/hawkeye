# Hawkeye

A Claude Code mod that adds bands above the prompt and keeps an eye on your session.

## Features

- **Session status dot**: coral pulse while a turn is running, an empty ring when idle, and a wait state for permission prompts or questions.
- **Prompt-cache countdown**: shows how long the prompt cache stays warm. It can ping the cache with a tiny forked request to keep it warm for a chosen number of hours after your last turn.
- **Context ring**: shows how much of the context window is used, with a forecast (Clear, and so on) by percent.
- **Usage limits**: 5-hour and 7-day rate-limit usage in the status line under the prompt.
- **Reborn**: writes a handoff of the current session (goal, git state and so on), clears, and continues in a fresh session. The button appears once the context passes a set percent.
- **Auto effort**: Haiku reads each message and picks the reasoning effort for it, between a lowest and highest you choose. The model is never switched.
- **Auto-recommend**: answers `AskUserQuestion` prompts with the recommended options, with a pane showing the history.
- **Suggest**: next-step suggestions.

## Commands

| Command | Description |
| --- | --- |
| `/cache-ping` | Refresh the prompt cache with a tiny forked request |
| `/cache-status` | Show the prompt cache countdown |
| `/auto-recommend` | Open the auto-recommend pane (toggle, history of auto answers) |

Settings live in the settings pane (cache warm hours, auto-recommend, auto effort, effort range, Reborn threshold and more).

## Layout

```
.claude-plugin/plugin.json   plugin manifest
hooks/hooks.json             entry point (register.tsx)
hooks/                       one module per feature, with *.test.ts(x) beside it
types/index.d.ts             types for the mod API
```

## Development

Tests sit next to the modules in `hooks/`. The mod is loaded through Claude Code's plugin system using `.claude-plugin/plugin.json`.
