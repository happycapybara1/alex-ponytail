# Install

Install guide for this fork: Claude Code, Codex, GitHub Copilot, OpenCode and Gemini CLI.

The Claude Code and Codex plugins run small Node.js lifecycle hooks, so `node` needs to be on your PATH. If it isn't, the skills still work, but every hook call shows a harmless `node: command not found` error.

## Claude Code

```
/plugin marketplace add happycapybara1/ponytail
```
```
/plugin install ponytail@ponytail
```
(You have to send two separate prompts for the install to work) 

Same steps in the Claude Code Desktop app's Code tab: type the two `/plugin` commands above into the prompt box, or click the **+** button next to it, choose **Plugins** → **Add plugin** to browse your configured marketplaces, and manage marketplaces from **Customize** in the sidebar.


## Codex

```bash
codex plugin marketplace add happycapybara1/ponytail
codex plugin add ponytail@ponytail
```

Run `codex` and open `/hooks`, review and trust its two lifecycle hooks, and start a new thread.

This same install also covers the Codex desktop app: restart the app after installing and it picks up the plugin.

## GitHub Copilot CLI

```bash
copilot plugin marketplace add happycapybara1/ponytail
copilot plugin install ponytail@ponytail
```

In an interactive Copilot CLI session, use the slash equivalents:

```
/plugin marketplace add happycapybara1/ponytail
/plugin install ponytail@ponytail
```

Copilot CLI namespaces plugin commands by plugin name. For example:

```text
/ponytail:ponytail ultra
/ponytail:ponytail-review
```

### Copilot Chat in VS Code, JetBrains or Visual Studio

Copy [`.github/copilot-instructions.md`](.github/copilot-instructions.md) into your project's `.github/` folder. Copilot Chat reads it in every chat. This gives the always-on rules only: no levels, no hooks.

## OpenCode

Run the plugin from a checkout of this fork:

```bash
git clone https://github.com/happycapybara1/ponytail ~/ponytail
```

Then add the checkout's plugin directory to your project's `opencode.json` (use the absolute path to share one checkout across projects):

```json
{ "plugins": ["/home/you/ponytail/.opencode/plugins"] }
```

Injects the ruleset every turn at the active level and adds the `/ponytail` commands (see [Commands](README.md#commands)). A `plugins` entry must name a **directory**, not a file. OpenCode 1 uses the older `plugin` key with the file path: `{ "plugin": ["/home/you/ponytail/.opencode/plugins/ponytail.mjs"] }`.

Update with `git -C ~/ponytail pull`.

## Gemini CLI

```bash
gemini extensions install https://github.com/happycapybara1/ponytail
```

Loads the ruleset as always-on context every session and registers the `/ponytail` commands; the `skills/` ship too, activated when a task needs them.
The Gemini adapter intentionally does not ship a root `hooks/hooks.json`: Gemini auto-loads that path, while Ponytail's lifecycle hooks use Claude/Codex event names.


## Settings

Set the level for every new session with the `PONYTAIL_DEFAULT_MODE` env var (`lite`/`full`/`ultra`/`off`), or a `defaultMode` field in `~/.config/ponytail/config.json` (`%APPDATA%\ponytail\config.json` on Windows). The default is `full`.

While active, the ruleset is also injected into every subagent spawned via the Agent tool. To scope that to specific agent types (say, keep it off read-only search agents), set the `PONYTAIL_SUBAGENT_MATCHER` env var to a regex tested against the subagent's `agent_type`. It is unanchored and case-insensitive: `explore|general` matches either, `^general$` is exact, and plugin agent types look like `plugin:name`. Unset means inject into every subagent (the default); an invalid regex, or a subagent whose type the platform doesn't report, also falls back to injecting.

## Uninstall

| Host | Command |
|------|---------|
| Claude Code | `/plugin remove ponytail` |
| Codex | `codex plugin remove ponytail` |
| GitHub Copilot CLI | `copilot plugin uninstall ponytail` |
| Gemini CLI | `gemini extensions uninstall ponytail` |
| OpenCode | Remove the `plugins` entry, then delete the checkout |
| Copilot Chat | Delete the copied `.github/copilot-instructions.md` |

These remove the plugin's own files. Ponytail also keeps a little state outside the plugin folder: its mode flags (such as `~/.claude/.ponytail-active`) and, if you made one, `~/.config/ponytail/config.json` (`%APPDATA%\ponytail\config.json` on Windows). To remove those too, run the uninstall script from a fresh checkout, before or after the commands above:

```bash
git clone --depth 1 https://github.com/happycapybara1/ponytail ponytail-uninstall
node ponytail-uninstall/scripts/uninstall.js
```

Then delete the `ponytail-uninstall` folder.

Versions before 5.5.0 could also leave `~/.claude/ponytail-statusline.sh` or `.ps1` and `~/.claude/.ponytail-statusline-nudged`. Delete those by hand, along with any `statusLine` entry in `~/.claude/settings.json` that points at them.
