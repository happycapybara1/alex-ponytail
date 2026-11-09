<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-dark.png">
    <img src="assets/logo.png" width="220" alt="Ponytail, the lazy senior dev">
  </picture>
</p>

<h1 align="center">Ponytail</h1>

<p align="center">
  <em>He says nothing. He writes one line. It works.</em>
</p>

<p align="center">
  <img src="assets/v5/hero.jpg" width="880" alt="Ponytail 5, upstream benchmark: -53% code, -41% time, -26% cost, -45% tokens. 98% of risky logic ships with a test, without Ponytail 68%.">
</p>

> Fork of [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail), trimmed to Claude Code, Codex, GitHub Copilot, OpenCode and Gemini CLI. Here superpowers and i-have-adhd come first when their instructions differ.

You know him. Long ponytail. Oval glasses. Has been at the company longer than the version control. You show him fifty lines; he looks at them, says nothing, and replaces them with one.

Ponytail puts him inside your AI agent: the smallest change that fully solves the task, and one line on what was skipped or not checked.

## Numbers

<p align="center">
  <img src="assets/v5/chart.png" width="880" alt="Share of the no-skill baseline. Lines of code: Ponytail v4.13 52%, Ponytail 5 47%. Output tokens: 57% and 55%. Cost: 84% and 74%. Time: 62% and 59%.">
</p>

<p align="center">
  <img src="assets/v5/tests.png" width="880" alt="98% of risky logic ships with a test (no skill 68%); the agent's own tests catch 66% of injected bugs (no skill 46%).">
</p>

Upstream's benchmark: headless Claude Code, Opus 5.5, 39 tasks, 5 runs each, the same agent with and without the skill. Correctness did not drop (hidden checks 97% vs 96%), and all 30 runs of the six security tasks passed.

Read it with care:
- One model, one tool, the author's own run, on tasks the rules were tuned on.
- This fork changed the rules and has not re-run it.
- On GPT reasoning models an older version cost 26–39% more, because the rules are re-sent on every call. Gemini was never measured.
- A blind judge preferred the no-skill replies, 106 to 82.

Details: [benchmarks/](benchmarks/README.md).

## Before / after

<p align="center">
  <img src="assets/v5/beforeafter.png" width="880" alt="Add a date picker to the frontend. No skill: 335 lines, a calendar and a date picker built by hand. Ponytail 5: one 10-line file that reuses the repo's Input with type date, so the browser brings the calendar.">
</p>

You ask for a date picker. Without Ponytail, the agent builds a whole calendar by hand: 335 lines. Ponytail first looks at what is already there: the repo has an `Input` component, and every browser has a date picker. 10 lines. More small cases in [examples/](examples/).

## How it works

<p align="center">
  <img src="assets/v5/ladder.png" width="880" alt="Before writing code, stop at the first rung that holds: does this need to exist, already in this codebase, the standard library, a native platform feature, an installed dependency, one line, only then the minimum that works.">
</p>

It reads the code the change touches first, then takes the first rung that fully works. Lazy about the solution, never about the change: every caller, test and fixture the change breaks gets fixed. Validation at trust boundaries, data-loss handling, security and accessibility are never cut. New logic leaves one small test, unless a test-first workflow such as superpowers' TDD is in use, which then wins.

The whole thing is one prompt: [`skills/ponytail/SKILL.md`](skills/ponytail/SKILL.md), with a copy for rules files in [`AGENTS.md`](AGENTS.md). Everything else loads that prompt into different agents.

## Install

**Claude Code** (CLI, desktop app or web), as two separate prompts:

```
/plugin marketplace add happycapybara1/alex-ponytail
```
```
/plugin install alex-ponytail@alex-ponytail
```

**Codex:**

```bash
codex plugin marketplace add happycapybara1/alex-ponytail
codex plugin add alex-ponytail@alex-ponytail
```

Then open `/hooks` in Codex, trust its two lifecycle hooks, and start a new thread.

**GitHub Copilot, OpenCode and Gemini CLI:** see [INSTALL.md](INSTALL.md).

It is on in every session at the `full` level. Turn it off with "stop ponytail" or `/ponytail off`.

## Commands

| Command | What it does |
|---------|--------------|
| `/ponytail [lite \| full \| ultra \| off]` | Set the level, or turn it off. No argument keeps the current level, or turns it on at the default level if it was off. `ultra` also pushes back on the request. |
| `/ponytail-review` | Review a change like the senior dev who gets paged when it breaks: bugs, security, real load, risky code without a test, slow paths, and what to cut. Verdict first, then numbered findings in plain English. |
| `/ponytail-audit` | The same check for the whole repo, most important first. |
| `/ponytail-debt` | List the `shortcut:` comments you deferred, so "later" doesn't become "never". |
| `/ponytail-help` | Quick reference. |

`/ponytail-debt` and `/ponytail-help` only run when you type them. In Codex, commands are skills: `$alex-ponytail:ponytail-review`. Copilot Chat in the editor gets the always-on rules from `.github/copilot-instructions.md`, without the commands.

## FAQ

**Does it need a config file?**
No. `PONYTAIL_DEFAULT_MODE` or `~/.config/ponytail/config.json` can set the default level (see [INSTALL.md](INSTALL.md#settings)).

**Why does it write `shortcut:` comments?**
They mark a deliberate shortcut and when to revisit it, and `/ponytail-debt` collects them. Want another word, or none? Say so in your project's `CLAUDE.md` or `AGENTS.md`, then run `/ponytail-debt <your word>`.

**What if I really need the 120-line cache class?**
Ask for it. He'll build it. Slowly. Correctly. While looking at you.

## License

[MIT](LICENSE).
