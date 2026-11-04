const fs = require('fs');
const path = require('path');
const { createHash } = require('crypto');
const { getClaudeDir } = require('./ponytail-config');

const STATE_FILE = '.ponytail-active';

// ponytail: VS Code Copilot never sets COPILOT_PLUGIN_DATA — it only injects
// CLAUDE_PLUGIN_ROOT, pointed at an install path under .vscode/agent-plugins/
// (#528). Without this fallback isCopilot was false, and VS Code got Claude
// Code's raw-text output instead of Copilot's JSON.
function isVsCodeCopilotRoot(pluginRoot) {
  if (!pluginRoot) return false;
  return pluginRoot.split(/[\\/]+/).includes('agent-plugins') &&
    pluginRoot.toLowerCase().includes('.vscode');
}

const isCopilot = Boolean(process.env.COPILOT_PLUGIN_DATA) ||
  isVsCodeCopilotRoot(process.env.CLAUDE_PLUGIN_ROOT);
const isCodex = !isCopilot && Boolean(process.env.PLUGIN_DATA);

let stateDir = getClaudeDir();
if (isCodex) stateDir = process.env.PLUGIN_DATA;
// COPILOT_PLUGIN_DATA is unset under VS Code Copilot, so fall back to
// getClaudeDir() rather than building a path from undefined.
if (isCopilot) stateDir = process.env.COPILOT_PLUGIN_DATA || getClaudeDir();

const statePath = path.join(stateDir, STATE_FILE);

// Claude Code hands every hook its project dir, so the live mode is kept per
// project and concurrent sessions in different repos stop overwriting each other
// (#662, #809). Hosts without it keep the single shared flag.
// ponytail: sessions in the SAME repo still share one mode (last write wins);
// key by session_id if that matters.
const projectDir = (process.env.CLAUDE_PROJECT_DIR || '').trim();
// Replacing separators with '_' aliases e.g. /work/a/b and /work/a_b (#662).
// Do not read old sanitized keys: they cannot be assigned to one project safely.
const projectStatePath = projectDir
  ? path.join(stateDir, 'ponytail-modes',
    createHash('sha256').update(path.normalize(projectDir)).digest('hex'))
  : null;

// The shared flag is still written, for hooks that run without a project dir.
// "off" is written like any level, so a compacted or resumed session stays off.
function setMode(mode) {
  for (const file of [projectStatePath, statePath]) {
    if (!file) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, mode);
  }
}

// Live mode written by activate/mode-tracker; null when nothing is recorded.
function readMode() {
  try {
    return fs.readFileSync(projectStatePath || statePath, 'utf8').trim() || null;
  } catch (e) {
    return null;
  }
}

// Synchronous: every hook calls process.exit() right after this, and on macOS a pipe
// write is async, so a pending write died with the process (#1043).
function writeOut(text) {
  fs.writeSync(1, text);
}

function writeHookOutput(event, mode, context = '') {
  if (isCopilot) {
    // Copilot reads additionalContext on SessionStart; ignores output elsewhere.
    writeOut(JSON.stringify(
      event === 'SessionStart' && context ? { additionalContext: context } : {}));
    return;
  }
  if (isCodex) {
    // No systemMessage: Codex maps it to a yellow `warning:` entry (and de-greens the
    // completed-hook bullet), reading as an error every session (#605). The mode still
    // shows via the additionalContext "hook context:" line — active level when on,
    // "PONYTAIL MODE OFF" when off (that path passes context too).
    // ponytail: if openai/codex#16933 lands and hides additionalContext, restore a
    // non-warning mode signal here.
    const output = {};
    if (context) {
      output.hookSpecificOutput = {
        hookEventName: event,
        additionalContext: context,
      };
    }
    writeOut(JSON.stringify(output));
    return;
  }
  // Native Claude: SessionStart accepts raw stdout, but SubagentStart needs the
  // hookSpecificOutput JSON form or the context is dropped.
  if (event === 'SubagentStart') {
    writeOut(JSON.stringify(
      { hookSpecificOutput: { hookEventName: event, additionalContext: context } }));
    return;
  }
  writeOut(context);
}

module.exports = {
  isCodex,
  readMode,
  setMode,
  writeHookOutput,
};
