---
name: ponytail-review
description: >
  Review a change (diff, commit, branch, PR): bugs, security, real load,
  missing tests, speed and code to cut, in plain English. Use for "review
  this", "code review", "review the last commit", "review my PR", "is this
  over-engineered", /ponytail-review.
---

Review the change like the senior developer who gets paged when it breaks. Priority: correct, safe, holds under load, tested, fast, lean (every extra line must be read, tested and fixed later). The user asked for this report: give it in full. Change no code.

## 1. Understand first

- Review what the user names (uncommitted or staged changes, a branch, a PR, files). Nothing named: the uncommitted changes, or the last commit if there are none.
- Read the diff, then the code around it: callers of every changed function, the functions it calls, the tests, the README. A change can break code it does not touch: when a signature, return value or behavior changes, grep every caller.
- Trace the real flow: where data comes in, what is stored, what goes out.
- Find the expected load (README, deploy config): one person running a script, or many users and processes at once. Judge scale against it and say which load you assumed.

## 2. Look for

1. **Bug:** wrong result, crash, missed edge case (empty, zero, last item, rounding, time zones), a caller broken by the change, a fix in one caller while the shared function stays broken.
2. **Risk:** security holes (injection, weak randomness, secrets, unchecked user input), data loss (swallowed errors, writes in the wrong order, no transaction).
3. **Scale:** fine for one user, wrong for many: check-then-write races, the same work in every process, memory or lists that only grow, a query per item, O(n^2) on big input, per-process state that must be shared.
4. **Missing test:** risky new logic (a branch, parser, money, security, data writes, a bug fix) with no test that fails when it breaks. One good test, not coverage.
5. **Speed:** big slowdowns are problems; small wins (repeated work in a hot loop) are suggestions.
6. **Lean:** dead code, unused options, speculative features; a helper the repo already has (name the path); the standard library or platform already does it, or a new dependency for a few lines; an abstraction with one implementation, config nobody sets; near-copies that must change together (merge); one function doing unrelated jobs (split by job, never by line count, never into helpers that only make it shorter).

## 3. Check before you report

- Every finding needs a concrete case: this input or situation leads to this wrong result. No case, no finding.
- Re-read the lines and confirm: the caller exists, the value can really be empty, the code really is unused.
- A `shortcut:` (or older `ponytail:`) comment that names its limit is a decision, not a finding, unless the expected load already crosses it.
- Propose the smallest fix that works, preferably one that deletes code. Never add layers, frameworks or config the problem does not need.
- No style taste, no "consider", no vague worries.

## 4. Output

Very simple English: short sentences, everyday words, each technical term explained the first time. The reader may never have seen this code.

First line: `Verdict: Ship.` or `Verdict: fix 1 and 3 first.` Then `What this change does:` in two or three sentences.

Then the findings, numbered across groups so the user can say "fix 2 and 5". Skip empty groups:
- **Must fix:** bug, security, data loss, breaks at the expected load.
- **Should fix:** risky code without a test, real slowness, duplication, a function that mixes jobs, code that should not exist.
- **Nice to have:** small speed-ups, shorter forms.

Each finding has a bold title with `file:lines` and four bullets of one or two short sentences:

2. **Orders land on the wrong day** (`billing/close_day.py:L40-52`)
   - **What this is:** At midnight this job bills all orders of the day.
   - **Problem:** It takes "today" from the server clock, which runs in UTC, so an order placed at 00:30 in Berlin is billed on the day before.
   - **Fix:** Compute the day in the shop's time zone: `datetime.now(ZoneInfo("Europe/Berlin")).date()`. One line.
   - **If we skip it:** Late orders show the wrong date, and accounting fixes them by hand.

End with `Lean: -<N> lines possible.` when lean findings exist, and `Not checked:` in one line if something mattered and you could not check it.

Nothing found: `Verdict: Ship.`, then `What this change does:` and one line on what you checked.
