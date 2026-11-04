#!/usr/bin/env node
// ponytail — SessionStart activation hook for Claude Code, Codex and Copilot.
//
// Runs on every session start: records the level in the mode flag (see
// ponytail-runtime.js) and emits the ponytail ruleset for that level as hidden
// SessionStart context.

const { getConfiguredDefaultMode, getDefaultMode, isRingActive } = require('./ponytail-config');
const { getPonytailInstructions } = require('./ponytail-instructions');
const { isCodex, isCopilot, readMode, setMode, writeHookOutput } = require('./ponytail-runtime');

// With alex-ring on in Claude Code, a fresh session starts off: the ring asks
// the user first, and loading the ponytail skill turns it on (see
// ponytail-skill-tracker.js). A default level the user set still wins.
function startMode() {
  if (!isCodex && !isCopilot && !getConfiguredDefaultMode() && isRingActive()) return 'off';
  return getDefaultMode();
}

function activate(mode) {
  try {
    setMode(mode);
  } catch (e) {
    // Silent fail -- flag is best-effort, don't block the hook
  }
  // "off" is recorded above and emits nothing.
  if (mode === 'off') return;

  try {
    writeHookOutput('SessionStart', mode, getPonytailInstructions(mode));
  } catch (e) {
    // Silent fail — stdout closed/EPIPE at hook exit must not surface as a hook failure
  }
}

// Compaction and resume continue a conversation, so they keep its recorded level
// (or stay off after "stop ponytail") instead of resetting to the default. With
// nothing recorded, e.g. a resume on a fresh machine or container, they start at
// the default like startup and clear. Claude Code, Codex and Copilot CLI pass
// the trigger as `source` on stdin; reading it there keeps the hook entry, and
// the trust Codex gave it, unchanged.
let input = '';
let done = false;

function finish() {
  if (done) return;
  done = true;
  let source = '';
  try {
    // Strip UTF-8 BOM some shells prepend when piping (breaks JSON.parse)
    source = JSON.parse(input.replace(/^﻿/, '')).source;
  } catch (e) {
    // No payload, or an unparseable one: treat it as a fresh session
  }
  const continues = source === 'compact' || source === 'resume';
  activate((continues && readMode()) || startMode());
}

process.stdin.on('data', chunk => { input += chunk; });
// Never hang the session start (#443, #790): like the mode tracker, recover on a
// stdin error or after a short ref'd fallback, and start at the default level.
process.stdin.on('end', () => { finish(); process.exit(0); });
process.stdin.on('error', () => { finish(); process.exit(0); });
setTimeout(() => { finish(); process.exit(0); }, 1000);
