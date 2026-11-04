---
description: "List shortcut: comments as a debt ledger"
---

List every `shortcut:` comment (and older `ponytail:` ones) in this repository as a debt ledger, so deferrals do not quietly become permanent. Grep the whole tree for comment markers (git grep --no-index --exclude-standard -nE '(#|//|/[*]) ?(shortcut|ponytail):', which skips .git and everything .gitignore ignores; if the user names their own marker word, grep for that instead; skip hits that are not a deferral, like a keyboard-shortcut note). One row per marker, grouped by file: <file>:<line>, <what was simplified>. ceiling: <the limit named in the comment>. upgrade: <the trigger to revisit>. Tag a marker that names no upgrade trigger as no-trigger: those rot silently. End with '<N> markers, <M> with no trigger.' If none: 'No shortcut debt. Clean ledger.' Report only, change nothing.
