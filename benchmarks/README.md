# Benchmark

## Current numbers: Ponytail 5 (2026-10-07, upstream)

The headline benchmark is the [agentic benchmark](agentic/): a headless Claude Code session per task, the same agent with and without the skill, scored on what it leaves behind. 39 tasks, Opus 5.5, 5 runs each, Ponytail 5, the previous Ponytail (v4.13) and no skill in one interleaved run.

| vs no skill | lines of code | output tokens | cost | time | hidden checks passed |
|---|--:|--:|--:|--:|--:|
| **Ponytail 5** | **-53%** | **-45%** | **-26%** | **-41%** | **97%** |
| Ponytail (v4.13) | -48% | -43% | -16% | -38% | 96% |
| no skill | | | | | 96% |

98% of risky logic ships with a test (no skill: 68%). Full method, per-task tables and limits: [results/2026-10-07-agentic.md](results/2026-10-07-agentic.md).

## Read these numbers with care

- **One model, one tool, the author's own run.** Opus 5.5 in Claude Code only. The rules were tuned on this same task set, and Opus 5.5 also judged completeness.
- **Not this fork's rules.** This fork changed the ruleset (superpowers and i-have-adhd come first, a test-first workflow wins, scope is agreed first) and nothing was re-run.
- **Other models may cost more.** The only cross-provider data, for an older version, found ponytail 26% more expensive on gpt-5.4-mini and 39% on gpt-5.5, because the ruleset is re-sent on every call ([results/2026-06-17-cost-verification.md](results/2026-06-17-cost-verification.md)). Gemini was never measured.
- **Replies and tests, both ways.** A blind judge preferred the no-skill replies 106 to 82 (p=0.09). Where a test exists, the no-skill tests catch more injected bugs (77% vs 69%), and ponytail writes more tests nobody needed (45% vs 36%).

## Independent benchmarks

Run by other people on their own harnesses. Only plugin-installed runs are listed.

| Source | Method | Headline | Date |
|---|---|---|---|
| [KuldeepB19](https://kuldeepb19.github.io/ponytail-benchmark/) | Installed plugin, 24 tasks, no-skill vs Lite/Full/Ultra, 5 runs each (480 builds), Opus 4.8, graded by executing the code | ~44% less code (53% fewer statements), no correctness or security regression; trims everyday bad-input handling on 5/24 tasks | 2026-06-24 |
| [RicardoCostaGit](https://github.com/RicardoCostaGit/ponytail-benchmark-from-cursor) | Multi-turn agentic runs via the Cursor SDK, isolated git worktrees, rule file toggled per run | Leaner output but higher process cost (more tool calls/tokens) on large completion-forced tasks; savings land on blocked/snowball-prone tasks | 2026-06-16 |

Both agree: ponytail reliably writes less code; whether it saves money depends on the workload.
