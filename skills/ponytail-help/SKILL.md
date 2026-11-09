---
name: ponytail-help
description: >
  Quick reference for ponytail levels, skills and commands. Use for
  /ponytail-help.
disable-model-invocation: true
---

Show this card. Change nothing: no mode switch, no flag files.

## Levels

| Level | Command | What changes |
|-------|---------|--------------|
| **Lite** | `/ponytail lite` | Builds what was asked and names the smaller option in one line. |
| **Full** | `/ponytail` | The smallest complete change, a check where the logic needs one, and one line on what was skipped and any risk. Default. |
| **Ultra** | `/ponytail ultra` | Also pushes back on the request before building. |

The level lasts until you change it or the session ends. Off: say "stop ponytail" or use `/ponytail off`. Back on: `/ponytail`.

## Commands

| Command | What it does |
|---------|--------------|
| `/ponytail` | The mode itself: least new code, one line on skipped work and risks. |
| `/ponytail-review` | Review a change: bugs, security, real load, missing tests, speed, code to cut. |
| `/ponytail-audit` | The same review for the whole repo, ranked. |
| `/ponytail-debt` | List `shortcut:` comments as a debt ledger. |
| `/ponytail-help` | This card. |

In Codex, use `$alex-ponytail:ponytail`, `$alex-ponytail:ponytail-review` and so on.

## Default level

`full`, on in every session. To change it, set `PONYTAIL_DEFAULT_MODE=ultra` (wins over the file) or put `{ "defaultMode": "lite" }` in `~/.config/ponytail/config.json` (Windows: `%APPDATA%\ponytail\config.json`). `"off"` stops auto-start; then turn it on with `/ponytail` when you want it.

## Update

Claude Code: `/plugin marketplace update alex-ponytail`, then `/reload-plugins`. To update automatically, open `/plugin`, go to Marketplaces, pick alex-ponytail and enable auto-update. Other tools: see INSTALL.md.

Docs: https://github.com/happycapybara1/alex-ponytail
