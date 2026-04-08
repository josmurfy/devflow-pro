# DevFlow Pro

AI-powered bug fixing automation for VS Code with GitHub Copilot.

## Features

- **Auto-Update System** — Automatically checks for new versions every 6 hours and installs them in one click
- **Update Channels** — Choose between `stable` (recommended) and `beta` channels
- **Rollback** — Roll back to the previous version if something goes wrong
- **Status Bar** — Quick access to update check from the VS Code status bar

## Commands

| Command | Description |
|---|---|
| `DevFlow: Check for Updates` | Manually check for a new version |
| `DevFlow: Rollback to Previous Version` | Revert to the last installed version |
| `DevFlow: Switch Update Channel` | Toggle between stable and beta |

## Settings

| Setting | Default | Description |
|---|---|---|
| `devflow.updates.autoCheck` | `true` | Check for updates on startup |
| `devflow.updates.channel` | `stable` | Update channel (`stable` or `beta`) |
| `devflow.updates.checkInterval` | `6` | Hours between automatic checks |
| `devflow.updates.autoInstall` | `false` | Install automatically without confirmation |

## Requirements

- VS Code `^1.85.0`

## License

MIT

