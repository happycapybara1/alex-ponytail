#!/usr/bin/env node
// ponytail — Claude Code SubagentStart hook
//
// SessionStart context is parent-thread only and never reaches subagents, so
// without this every Task-spawned agent runs ponytail-unaware (issue #252).
// When ponytail mode is active, inject the same ruleset into each subagent.
// In Claude Code that means active in the parent chat: the hook input carries
// the parent chat's session_id, and only that chat's own record counts.
//
// Scoping (opt-in, issue #506): set PONYTAIL_SUBAGENT_MATCHER to a regex and
// the ruleset is injected only into subagents whose agent_type matches. The
// regex is unanchored and case-insensitive — "explore|general" matches either,
// "^general$" is exact. Unset means inject into every subagent, as before.

const { getPonytailInstructions } = require('./ponytail-instructions');
const { isCodex, isCopilot, isSessionId, readMode, writeHookOutput } = require('./ponytail-runtime');
const vm = require('vm');

// Claude Code names the chat only on stdin, so its level is read in finish().
const native = !isCodex && !isCopilot;
let mode = native ? null : readMode();

// Absent flag or off → ponytail isn't active; inject nothing.
if (!native && (!mode || mode === 'off')) {
  process.exit(0);
}

function inject() {
  try {
    writeHookOutput('SubagentStart', mode, getPonytailInstructions(mode));
  } catch (e) {
    // Silent fail — a stdout error at hook exit must not surface as a hook failure.
  }
}

// A bad regex must never crash the hook; treat it as "no matcher" and inject.
let matcherRe = null;
try {
  if (process.env.PONYTAIL_SUBAGENT_MATCHER) {
    matcherRe = new RegExp(process.env.PONYTAIL_SUBAGENT_MATCHER, 'i');
  }
} catch (e) {
  matcherRe = null;
}

// No matcher → the other hosts keep the original synchronous, stdin-independent
// path. On Windows the PowerShell `if {}` wrapper can swallow the piped JSON so
// stdin 'end' never fires (#443); that path must not wait on stdin or it would
// stall every subagent spawn.
if (!native && !matcherRe) {
  inject();
  process.exit(0);
}

// Read stdin. Claude Code injects only when the record of the chat named by
// session_id holds a level. Matcher set → skip only on a definite agent_type
// mismatch. Missing/unparseable agent_type fails open (inject), and on the
// other hosts so do a stdin error and the timeout, so scoping never silently
// drops the persona.
let input = '';
let done = false;

function finish() {
  if (done) return;
  done = true;

  let data = {};
  try {
    // Strip UTF-8 BOM some shells prepend when piping (breaks JSON.parse)
    data = JSON.parse(input.replace(/^\uFEFF/, '')) || {};
  } catch (e) {
    // Unparseable payload — the other hosts fall through and inject to be safe;
    // Claude Code then has no session id and injects nothing.
  }
  if (native) {
    mode = isSessionId(data.session_id) ? readMode(data.session_id) : null;
    if (!['lite', 'full', 'ultra'].includes(mode)) return;
  }
  const agentType = String(data.agent_type || '').trim();
  // .test() is synchronous, so a backtracking-heavy matcher like (a+)+$ would
  // block the event loop and the fallback timer below could never fire (#658).
  // Run it under a vm timeout; a timeout fails open like every other doubt.
  let matches = true;
  try {
    if (matcherRe && agentType) {
      matches = vm.runInNewContext('re.test(s)', { re: matcherRe, s: agentType }, { timeout: 100 });
    }
  } catch (e) {
    matches = true;
  }
  if (!matches) {
    process.exit(0);
  }
  inject();
}

process.stdin.on('data', chunk => { input += chunk; });
// Exit on 'end' (not just finish()) so the ref'd fallback timer below can't
// add its full 1000ms to the normal fast path.
process.stdin.on('end', () => { finish(); process.exit(0); });
// Never block the session (#443): recover on stdin error or a short fallback.
// The fallback stays ref'd: on Windows a stuck ref'd stdin keeps the loop
// alive and an unref'd timer is never scheduled, so the hook hung to the
// external watchdog instead of exiting at 1s (#790). Without the whole input
// Claude Code knows no chat, so it injects nothing; the other hosts fail open.
const stopWaiting = () => {
  if (!native) finish();
  process.exit(0);
};
process.stdin.on('error', stopWaiting);
setTimeout(stopWaiting, 1000);
