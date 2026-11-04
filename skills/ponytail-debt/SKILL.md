---
name: ponytail-debt
description: >
  List every `shortcut:` comment (and older `ponytail:` ones) as a debt
  ledger; changes nothing. Use for /ponytail-debt.
disable-model-invocation: true
---

Each deliberate shortcut is marked `shortcut: <the limit>, <when to upgrade>` (older code may say `ponytail:`). This collects them into one ledger so a deferral can't quietly become permanent.

## Scan

Grep comment markers, skipping `.git` and everything the `.gitignore` files ignore:

`git grep --no-index --exclude-standard -nE '(#|//|/[*]) ?(shortcut|ponytail):'`  (add other comment prefixes if your stack uses them)

If the user names their own marker word (`/ponytail-debt TODO`), grep for that word instead. Each hit is one row; skip hits that are not a deferral, like a note about a keyboard shortcut.

## Output

One row per marker, grouped by file:

`<file>:<line>, <what was simplified>. ceiling: <the limit named>. upgrade: <the trigger to revisit>.`

Tag a marker that names no upgrade trigger `no-trigger`: those rot silently. For an owner per row, add `git blame -L<line>,<line>`.

End with `<N> markers, <M> with no trigger.` Nothing found: `No shortcut debt. Clean ledger.`

Change nothing. If the user asks, write the ledger to a file (e.g. `PONYTAIL-DEBT.md`).
