---
name: ponytail-audit
description: >
  Audit a whole repo or folder: bugs, security, real load, untested risky
  code, slow paths, and what to delete, merge or split; ranked, in plain
  English, changes nothing. Use for "audit this codebase", "review the whole
  repo", "find bloat", "what can I delete", /ponytail-audit.
---

Audit the repo like the senior developer who just inherited it and gets paged when it breaks. Priority: correct, safe, holds under load, tested, fast, lean (every extra line must be read, tested and fixed later). The user asked for this report: give it in full. Change no code.

## 1. Map first

- Audit what the user names (a folder, a package). Nothing named: the whole repo.
- Read the README, deploy and build config, dependency list, entry points (main, routes, handlers, jobs, CLI commands) and tests.
- Find the expected load: one person running a script, or many users and processes at once. Judge scale against it and say which load you assumed.
- Trace the main flows end to end (data in, stored, out). Read fully the paths where mistakes cost most: user input, money, auth, data writes, background jobs, state shared between processes.
- Big repo: go deep where a mistake costs the most, not file by file, and say which parts you did not read.

## 2. Look for

1. **Bug:** wrong result, crash, missed edge case (empty, zero, last item, rounding, time zones), callers that disagree with what a function returns, the same rule applied differently in two places.
2. **Risk:** security holes (injection, weak randomness, secrets in code, unchecked user input), data loss (swallowed errors, writes in the wrong order, no transaction).
3. **Scale:** fine for one user, wrong for many: check-then-write races, the same work in every process, memory or lists that only grow, a query per item, O(n^2) on big input, per-process state that must be shared.
4. **Missing test:** risky logic (a branch, parser, money, security, data writes) with no test that fails when it breaks. One good test, not coverage.
5. **Speed:** big slowdowns are problems; small wins (repeated work in a hot loop) are suggestions.
6. **Lean:** dead code, unused options, flags and config, speculative features; two helpers doing the same job (keep one, name the path); the standard library or platform already does it, or a dependency does what a few lines could; an interface with one implementation, a factory with one product, a wrapper that only passes calls through; near-copies that must change together (merge); a function or class doing unrelated jobs (split by job, never by line count, never into helpers that only make it shorter).

## 3. Check before you report

- Every finding needs a concrete case: this input or situation leads to this wrong result. No case, no finding.
- Before calling code unused, grep the whole tree for it, including tests, fixtures, config, and string or dynamic references.
- A `shortcut:` (or older `ponytail:`) comment that names its limit is a decision, not a finding, unless the expected load already crosses it.
- Propose the smallest fix that works, preferably one that deletes code. Never add layers, frameworks or config the problem does not need.
- No style taste, no "consider", no vague worries.

## 4. Output

Very simple English: short sentences, everyday words, each technical term explained the first time. The reader may never have seen this code.

First line: `Verdict:` healthy, or what to fix first. Then `What this repo does:` in two or three sentences, and the load you assumed.

Then at most 20 findings, most important first, numbered across groups so the user can say "fix 2 and 5"; if you left smaller ones out, say how many. Skip empty groups:
- **Must fix:** bug, security, data loss, breaks at the expected load.
- **Should fix:** risky code without a test, real slowness, duplication, a function that mixes jobs, code that should not exist.
- **Nice to have:** small speed-ups, shorter forms.

Each finding has a bold title with `file:lines` and four bullets of one or two short sentences:

2. **Orders land on the wrong day** (`billing/close_day.py:L40-52`)
   - **What this is:** At midnight this job bills all orders of the day.
   - **Problem:** It takes "today" from the server clock, which runs in UTC, so an order placed at 00:30 in Berlin is billed on the day before.
   - **Fix:** Compute the day in the shop's time zone: `datetime.now(ZoneInfo("Europe/Berlin")).date()`. One line.
   - **If we skip it:** Late orders show the wrong date, and accounting fixes them by hand.

End with `Lean: -<N> lines, -<M> dependencies possible.` when lean findings exist, and `Not checked:` the parts you did not read or could not run.

Nothing found: `Verdict: Healthy. Nothing to fix.`, then `What this repo does:` and one line on what you checked.
