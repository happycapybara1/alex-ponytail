#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');

const { DEFAULT_MODE, getDefaultMode, writeDefaultMode } = require('../hooks/ponytail-config');
const { getPonytailInstructions } = require('../hooks/ponytail-instructions');

// Keep the base env clean so the default-dir / native-Claude checks are
// deterministic; the CLAUDE_CONFIG_DIR and codex/copilot cases set these
// explicitly where needed. run() spreads process.env, so a PLUGIN_DATA /
// COPILOT_PLUGIN_DATA leaked from the dev or CI shell would otherwise steer
// writeHookOutput into the wrong branch and mis-fire the native assertions.
delete process.env.CLAUDE_CONFIG_DIR;
delete process.env.PLUGIN_DATA;
delete process.env.COPILOT_PLUGIN_DATA;
// A VS Code Copilot install path here would steer the native cases into Copilot JSON (#528).
delete process.env.CLAUDE_PLUGIN_ROOT;
// A leaked subagent matcher would scope the inject-into-every-subagent assertions.
delete process.env.PONYTAIL_SUBAGENT_MATCHER;
// A leaked project dir would move the flag into ponytail-modes/ (#662).
delete process.env.CLAUDE_PROJECT_DIR;
// A leaked default would change every start level asserted below.
delete process.env.PONYTAIL_DEFAULT_MODE;

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ponytail-hooks-'));
// Runs on normal exit and on assertion-throw exit; force makes it idempotent.
process.on('exit', () => fs.rmSync(temp, { recursive: true, force: true }));

const home = path.join(temp, 'home');
const pluginData = path.join(temp, 'plugin-data');
fs.mkdirSync(home, { recursive: true });

// Every hook run gets a throwaway home and config dirs, so no case can read or
// delete the real ~/.claude, ~/.config/ponytail or %APPDATA%\ponytail state.
// USERPROFILE alongside HOME: os.homedir() reads USERPROFILE on Windows, HOME on POSIX.
const isolated = {
  HOME: home,
  USERPROFILE: home,
  XDG_CONFIG_HOME: path.join(temp, 'xdg-config'),
  APPDATA: path.join(temp, 'appdata'),
};

function run(script, env, input = '') {
  return spawnSync(process.execPath, [path.join(root, 'hooks', script)], {
    env: { ...process.env, ...isolated, ...env },
    input,
    encoding: 'utf8',
  });
}

// Off-mode SessionStart records "off" over a stale level, so a later compaction
// or resume stays off, and emits no model-visible output on any harness.
for (const { label, env, statePath } of [
  {
    label: 'Claude',
    env: { HOME: home, USERPROFILE: home, PONYTAIL_DEFAULT_MODE: 'off' },
    statePath: path.join(home, '.claude', '.ponytail-active'),
  },
  {
    label: 'Codex',
    env: {
      HOME: home,
      USERPROFILE: home,
      PLUGIN_DATA: pluginData,
      PONYTAIL_DEFAULT_MODE: 'off',
    },
    statePath: path.join(pluginData, '.ponytail-active'),
  },
  {
    label: 'Copilot',
    env: {
      HOME: home,
      USERPROFILE: home,
      COPILOT_PLUGIN_DATA: path.join(temp, 'copilot-off-data'),
      PONYTAIL_DEFAULT_MODE: 'off',
    },
    statePath: path.join(temp, 'copilot-off-data', '.ponytail-active'),
  },
]) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, 'full');
  const offResult = run('ponytail-activate.js', env);
  assert.equal(offResult.status, 0, offResult.stderr);
  assert.equal(offResult.stdout, '', `${label} SessionStart must stay silent when ponytail is off`);
  assert.equal(fs.readFileSync(statePath, 'utf8'), 'off', `${label} stale mode state must be replaced by off`);
}

function collectManifestCommands(file, field) {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const commands = [];

  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (typeof value[field] === 'string') commands.push(value[field]);
    for (const child of Object.values(value)) {
      if (Array.isArray(child)) child.forEach(visit);
      else visit(child);
    }
  }

  visit(manifest);
  return commands;
}

function runShell(command, env, input = '') {
  return spawnSync('/bin/sh', ['-c', command], {
    env,
    input,
    encoding: 'utf8',
  });
}

let result;

// These run the manifest commands through /bin/sh, which native Windows lacks
// (#774); skip them there so the rest of this file still runs.
if (fs.existsSync('/bin/sh')) {
  // The shared Claude/Codex command must stay guard-free: VS Code runs it in
  // Windows PowerShell, which cannot parse `||` (see hooks-windows.test.js), so
  // it only has to run clean with node.
  // WSL2 can hand hooks a backslashed root (\home\user\...); the commands turn it
  // back into a POSIX path, so both shapes must load the script (#646).
  const roots = [root, root.split(path.sep).join('\\')];

  for (const command of collectManifestCommands('hooks/claude-codex-hooks.json', 'command')) {
    for (const pluginRoot of roots) {
      result = runShell(command, { ...process.env, ...isolated, CLAUDE_PLUGIN_ROOT: pluginRoot });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, '', command);
    }
  }

  // Copilot CLI has a separate bash field, so it can exit 0 without node (#645).
  // `|| exit 0` also hides a broken hook, so the with-node run must leave stderr empty.
  for (const command of collectManifestCommands('hooks/copilot-hooks.json', 'bash')) {
    for (const pluginRoot of roots) {
      const env = { ...isolated, PLUGIN_ROOT: pluginRoot, COPILOT_PLUGIN_DATA: path.join(temp, 'copilot-manifest-data') };
      result = runShell(command, { ...process.env, ...env });
      assert.equal(result.status, 0, result.stderr);
      assert.equal(result.stderr, '', command);

      result = runShell(command, { ...env, PATH: '' });
      assert.equal(result.status, 0, result.stderr);
    }
  }
}

const codexEnv = {
  HOME: home,
  USERPROFILE: home,
  PLUGIN_DATA: pluginData,
  PONYTAIL_DEFAULT_MODE: 'ultra',
};
const codexState = path.join(pluginData, '.ponytail-active');

result = run('ponytail-activate.js', codexEnv);
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.readFileSync(codexState, 'utf8'), 'ultra');
let output = JSON.parse(result.stdout);
assert.equal(output.systemMessage, undefined, 'Codex must not emit systemMessage — Codex renders it as a yellow warning: line (#605)');
assert.equal(output.additionalContext, undefined, 'Codex must not emit additionalContext at top level (#573)');
assert.equal(output.hookSpecificOutput.hookEventName, 'SessionStart');
assert.match(
  output.hookSpecificOutput.additionalContext,
  /PONYTAIL MODE ACTIVE — level: ultra/,
);

result = run(
  'ponytail-mode-tracker.js',
  codexEnv,
  JSON.stringify({ prompt: '@ponytail lite' }),
);
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.readFileSync(codexState, 'utf8'), 'lite');
output = JSON.parse(result.stdout);
assert.equal(output.systemMessage, undefined, 'Codex must not emit systemMessage (#605)');
assert.match(
  output.hookSpecificOutput.additionalContext,
  /level: lite/,
  'mode still surfaces via the hook context line',
);
// The switch carries the new level's ruleset: the SessionStart one is filtered
// to the start level, and `$ponytail lite` does not load the skill body.
assert.ok(output.hookSpecificOutput.additionalContext.endsWith(getPonytailInstructions('lite')));

for (const [prompt, mode] of [
  ['$ponytail full', 'full'],
  ['@ponytail ultra', 'ultra'],
  ['/alex-ponytail:ponytail ultra', 'ultra'],
  ['/ponytail:ponytail lite', 'lite'],
]) {
  result = run('ponytail-mode-tracker.js', codexEnv, JSON.stringify({ prompt }));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(codexState, 'utf8'), mode);
  output = JSON.parse(result.stdout);
  assert.equal(output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
  assert.ok(output.hookSpecificOutput.additionalContext.endsWith(getPonytailInstructions(mode)));
}

// Querying bare @ponytail should report the active level ('lite') without resetting it to default ('ultra')
result = run(
  'ponytail-mode-tracker.js',
  codexEnv,
  JSON.stringify({ prompt: '@ponytail' }),
);
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.readFileSync(codexState, 'utf8'), 'lite');
output = JSON.parse(result.stdout);
assert.equal(output.additionalContext, undefined, 'Codex must not emit additionalContext at top level (#573)');
assert.equal(output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
assert.match(
  output.hookSpecificOutput.additionalContext,
  /PONYTAIL MODE ACTIVE — level: lite/,
);

// i-have-adhd uses "normal mode" for its own mode, so it must leave ponytail on.
result = run('ponytail-mode-tracker.js', codexEnv, JSON.stringify({ prompt: 'normal mode' }));
assert.equal(result.status, 0, result.stderr);
assert.equal(result.stdout, '', '"normal mode" must not answer for ponytail');
assert.equal(fs.readFileSync(codexState, 'utf8'), 'lite', '"normal mode" must not turn ponytail off');

// "stop ponytail" is the stop phrase, as the whole message, in any case, with trailing punctuation.
result = run('ponytail-mode-tracker.js', codexEnv, JSON.stringify({ prompt: 'Stop ponytail.' }));
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.readFileSync(codexState, 'utf8'), 'off');
output = JSON.parse(result.stdout);
assert.equal(output.systemMessage, undefined, 'Codex must not emit systemMessage (#605)');
assert.match(
  output.hookSpecificOutput.additionalContext,
  /PONYTAIL MODE OFF/,
  'deactivation still surfaces via the hook context line',
);

// A request that merely contains the phrase must not deactivate ponytail.
result = run('ponytail-mode-tracker.js', codexEnv, JSON.stringify({ prompt: '@ponytail lite' }));
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.readFileSync(codexState, 'utf8'), 'lite');

result = run(
  'ponytail-mode-tracker.js',
  codexEnv,
  JSON.stringify({ prompt: 'why did you stop ponytail mode in the last session?' }),
);
assert.equal(result.status, 0, result.stderr);
assert.equal(
  fs.readFileSync(codexState, 'utf8'),
  'lite',
  'an incidental "stop ponytail" in a request must not turn ponytail off',
);

const claudeEnv = {
  HOME: home,
  USERPROFILE: home,
  PONYTAIL_DEFAULT_MODE: 'full',
};
delete claudeEnv.PLUGIN_DATA;

result = run('ponytail-activate.js', claudeEnv);
assert.equal(result.status, 0, result.stderr);
assert.equal(
  fs.readFileSync(path.join(home, '.claude', '.ponytail-active'), 'utf8'),
  'full',
);

// CLAUDE_CONFIG_DIR overrides ~/.claude for the flag file (issue #34).
const home2 = path.join(temp, 'home2');
fs.mkdirSync(home2, { recursive: true });
const customConfigDir = path.join(temp, 'custom-claude');
result = run('ponytail-activate.js', {
  HOME: home2,
  USERPROFILE: home2,
  CLAUDE_CONFIG_DIR: customConfigDir,
  PONYTAIL_DEFAULT_MODE: 'lite',
});
assert.equal(result.status, 0, result.stderr);
assert.equal(
  fs.readFileSync(path.join(customConfigDir, '.ponytail-active'), 'utf8'),
  'lite',
);
assert.equal(
  fs.existsSync(path.join(home2, '.claude', '.ponytail-active')),
  false,
  'flag must not land in ~/.claude when CLAUDE_CONFIG_DIR is set',
);

const copilotData = path.join(temp, 'copilot-data');
const codexData = path.join(temp, 'codex-data-shadow');
result = run('ponytail-activate.js', {
  HOME: home,
  USERPROFILE: home,
  COPILOT_PLUGIN_DATA: copilotData,
  PLUGIN_DATA: codexData,
  PONYTAIL_DEFAULT_MODE: 'full',
});
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.readFileSync(path.join(copilotData, '.ponytail-active'), 'utf8'), 'full');
assert.equal(
  fs.existsSync(path.join(codexData, '.ponytail-active')),
  false,
  'copilot hooks must not write mode state to codex PLUGIN_DATA',
);
output = JSON.parse(result.stdout);
assert.match(output.additionalContext, /PONYTAIL MODE ACTIVE — level: full/);

// VS Code Copilot never sets COPILOT_PLUGIN_DATA — it only injects
// CLAUDE_PLUGIN_ROOT pointed at an agent-plugins/.../.vscode install path
// (#528). Without a fallback, isCopilot was false, so ponytail assumed
// native Claude Code and wrote raw text instead of Copilot's JSON.
const vscodeHome = path.join(temp, 'vscode-copilot-home');
const vscodePluginRoot = path.join(
  vscodeHome, '.vscode', 'agent-plugins', 'github.com', 'DietrichGebert', 'ponytail', 'hooks',
);
fs.mkdirSync(vscodeHome, { recursive: true });
result = run('ponytail-activate.js', {
  HOME: vscodeHome,
  USERPROFILE: vscodeHome,
  CLAUDE_PLUGIN_ROOT: vscodePluginRoot,
  PONYTAIL_DEFAULT_MODE: 'full',
});
assert.equal(result.status, 0, result.stderr);
assert.match(
  JSON.parse(result.stdout).additionalContext,
  /PONYTAIL MODE ACTIVE — level: full/,
  'VS Code Copilot (detected via CLAUDE_PLUGIN_ROOT) must get the Copilot JSON output',
);
// isCopilot must still resolve a state dir even though COPILOT_PLUGIN_DATA
// is unset under VS Code — falling back to ~/.claude, not crashing on an
// undefined path.
assert.equal(
  fs.readFileSync(path.join(vscodeHome, '.claude', '.ponytail-active'), 'utf8'),
  'full',
  'VS Code Copilot must persist mode state under getClaudeDir(), not a path built from the unset COPILOT_PLUGIN_DATA',
);

result = run(
  'ponytail-mode-tracker.js',
  {
    HOME: home,
    USERPROFILE: home,
    COPILOT_PLUGIN_DATA: copilotData,
    PLUGIN_DATA: codexData,
  },
  JSON.stringify({ prompt: '/ponytail ultra' }),
);
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.readFileSync(path.join(copilotData, '.ponytail-active'), 'utf8'), 'ultra');
assert.equal(
  fs.existsSync(path.join(codexData, '.ponytail-active')),
  false,
  'copilot mode tracker must keep codex PLUGIN_DATA untouched',
);
output = JSON.parse(result.stdout);
assert.deepEqual(output, {});

// SubagentStart hook: when ponytail mode is active it injects the ruleset into
// each subagent (issue #252). Native Claude must get the hookSpecificOutput JSON
// form, not raw stdout, or the context is dropped.
const subHome = path.join(temp, 'sub-home');
const subFlag = path.join(subHome, '.claude', '.ponytail-active');
fs.mkdirSync(path.dirname(subFlag), { recursive: true });
const subEnv = { HOME: subHome, USERPROFILE: subHome };

fs.writeFileSync(subFlag, 'full');
result = run('ponytail-subagent.js', subEnv);
assert.equal(result.status, 0, result.stderr);
output = JSON.parse(result.stdout);
assert.equal(output.hookSpecificOutput.hookEventName, 'SubagentStart');
assert.match(
  output.hookSpecificOutput.additionalContext,
  /PONYTAIL MODE ACTIVE — level: full/,
);

// No flag → ponytail off → inject nothing (empty stdout, no failure).
fs.unlinkSync(subFlag);
result = run('ponytail-subagent.js', subEnv);
assert.equal(result.status, 0, result.stderr);
assert.equal(result.stdout, '', 'SubagentStart must stay silent when ponytail is off');

// Codex shares claude-codex-hooks.json, so SubagentStart is reachable under Codex
// too — assert the codex branch emits hookSpecificOutput and no systemMessage (#605).
const subCodex = path.join(temp, 'sub-codex');
fs.mkdirSync(subCodex, { recursive: true });
fs.writeFileSync(path.join(subCodex, '.ponytail-active'), 'full');
result = run('ponytail-subagent.js', { HOME: subHome, USERPROFILE: subHome, PLUGIN_DATA: subCodex });
assert.equal(result.status, 0, result.stderr);
output = JSON.parse(result.stdout);
assert.equal(output.systemMessage, undefined, 'Codex must not emit systemMessage (#605)');
assert.equal(output.additionalContext, undefined, 'Codex must not emit additionalContext at top level (#573)');
assert.equal(output.hookSpecificOutput.hookEventName, 'SubagentStart');
assert.match(output.hookSpecificOutput.additionalContext, /PONYTAIL MODE ACTIVE — level: full/);

// SubagentStart scoping (issue #506): PONYTAIL_SUBAGENT_MATCHER limits the
// injection to agent types whose name matches the regex. Unset keeps the
// inject-into-every-subagent behavior asserted above. The matcher is
// case-insensitive and unanchored, and every uncertain case fails open.
const scopeHome = path.join(temp, 'scope-home');
const scopeFlag = path.join(scopeHome, '.claude', '.ponytail-active');
fs.mkdirSync(path.dirname(scopeFlag), { recursive: true });
fs.writeFileSync(scopeFlag, 'full');
const scopeEnv = { HOME: scopeHome, USERPROFILE: scopeHome };

// Matching agent_type → inject; the match is case-insensitive.
result = run(
  'ponytail-subagent.js',
  { ...scopeEnv, PONYTAIL_SUBAGENT_MATCHER: 'general|plan' },
  JSON.stringify({ agent_type: 'General-purpose' }),
);
assert.equal(result.status, 0, result.stderr);
output = JSON.parse(result.stdout);
assert.equal(output.hookSpecificOutput.hookEventName, 'SubagentStart');
assert.match(output.hookSpecificOutput.additionalContext, /PONYTAIL MODE ACTIVE — level: full/);

// agent_type the matcher rejects → stay silent.
result = run(
  'ponytail-subagent.js',
  { ...scopeEnv, PONYTAIL_SUBAGENT_MATCHER: 'general|plan' },
  JSON.stringify({ agent_type: 'Explore' }),
);
assert.equal(result.status, 0, result.stderr);
assert.equal(result.stdout, '', 'a non-matching agent_type must skip the injection');

// Anchored regex → exact match only; a superset name is rejected.
result = run(
  'ponytail-subagent.js',
  { ...scopeEnv, PONYTAIL_SUBAGENT_MATCHER: '^general$' },
  JSON.stringify({ agent_type: 'general-purpose' }),
);
assert.equal(result.status, 0, result.stderr);
assert.equal(result.stdout, '', 'an anchored matcher must not match a superset agent_type');

// Matcher set but agent_type absent → the platform didn't report it; fail
// open and inject rather than silently dropping the persona (issue #252).
result = run(
  'ponytail-subagent.js',
  { ...scopeEnv, PONYTAIL_SUBAGENT_MATCHER: 'general' },
  JSON.stringify({}),
);
assert.equal(result.status, 0, result.stderr);
output = JSON.parse(result.stdout);
assert.match(output.hookSpecificOutput.additionalContext, /PONYTAIL MODE ACTIVE — level: full/);

// Invalid regex → must not crash; fall back to injecting everywhere.
result = run(
  'ponytail-subagent.js',
  { ...scopeEnv, PONYTAIL_SUBAGENT_MATCHER: '(' },
  JSON.stringify({ agent_type: 'anything' }),
);
assert.equal(result.status, 0, result.stderr);
output = JSON.parse(result.stdout);
assert.equal(output.hookSpecificOutput.hookEventName, 'SubagentStart');

// Catastrophic-backtracking matcher → must not hang the hook (#658); the
// match is time-boxed and a timeout fails open and injects.
result = run(
  'ponytail-subagent.js',
  { ...scopeEnv, PONYTAIL_SUBAGENT_MATCHER: '(a+)+$' },
  JSON.stringify({ agent_type: 'a'.repeat(40) + '!' }),
);
assert.equal(result.status, 0, result.stderr);
output = JSON.parse(result.stdout);
assert.match(output.hookSpecificOutput.additionalContext, /PONYTAIL MODE ACTIVE — level: full/);

// The default (no matcher) path must not depend on stdin: even with stdin
// closed empty it injects synchronously, preserving the #252 behavior on
// Windows where the piped JSON can be swallowed (#443).
result = run('ponytail-subagent.js', scopeEnv, '');
assert.equal(result.status, 0, result.stderr);
output = JSON.parse(result.stdout);
assert.match(output.hookSpecificOutput.additionalContext, /PONYTAIL MODE ACTIVE — level: full/);

// writeDefaultMode must merge into existing config, not overwrite it (#490).
const mergeHome = path.join(temp, 'merge-home');
const mergeConfigDir = path.join(mergeHome, '.config', 'ponytail');
fs.mkdirSync(mergeConfigDir, { recursive: true });
const mergeConfigPath = path.join(mergeConfigDir, 'config.json');
fs.writeFileSync(mergeConfigPath, JSON.stringify({ defaultMode: 'full', customSetting: 42 }, null, 2));

const prevXdg = process.env.XDG_CONFIG_HOME;
process.env.XDG_CONFIG_HOME = path.join(mergeHome, '.config');
try {
  writeDefaultMode('ultra');
  const merged = JSON.parse(fs.readFileSync(mergeConfigPath, 'utf8'));
  assert.equal(merged.defaultMode, 'ultra', 'writeDefaultMode must update defaultMode');
  assert.equal(merged.customSetting, 42, 'writeDefaultMode must preserve existing config fields');
} finally {
  if (prevXdg === undefined) delete process.env.XDG_CONFIG_HOME;
  else process.env.XDG_CONFIG_HOME = prevXdg;
}

// #329: `/ponytail default <mode>` persists the default to config (survives
// restart), while a plain switch stays session-scoped and never touches config.
const defHome = path.join(temp, 'default-cmd-home');
const defEnv = { HOME: defHome, USERPROFILE: defHome, XDG_CONFIG_HOME: path.join(defHome, '.config') };
const defConfig = path.join(defHome, '.config', 'ponytail', 'config.json');
const defFlag = path.join(defHome, '.claude', '.ponytail-active');

result = run('ponytail-mode-tracker.js', defEnv, JSON.stringify({ prompt: '/ponytail default lite' }));
assert.equal(result.status, 0, result.stderr);
assert.equal(JSON.parse(fs.readFileSync(defConfig, 'utf8')).defaultMode, 'lite', '/ponytail default must persist the default');
assert.equal(fs.existsSync(defFlag), false, '/ponytail default must not change the session mode');

// A plain switch is transient: sets the session flag, leaves the default alone.
result = run('ponytail-mode-tracker.js', defEnv, JSON.stringify({ prompt: '/ponytail ultra' }));
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.readFileSync(defFlag, 'utf8'), 'ultra', 'plain switch must set the session mode');
assert.equal(JSON.parse(fs.readFileSync(defConfig, 'utf8')).defaultMode, 'lite', 'plain switch must not persist the default');

// An unsupported mode is a no-op: it must not reset the active session mode
// to the configured default.
result = run('ponytail-mode-tracker.js', defEnv, JSON.stringify({ prompt: '/ponytail ulta' }));
assert.equal(result.status, 0, result.stderr);
assert.equal(result.stdout, '');
assert.equal(fs.readFileSync(defFlag, 'utf8'), 'ultra', 'invalid mode must preserve the active session mode');

// The band add-on is removed in this fork: `/ponytail band` is an unknown argument now.
result = run('ponytail-mode-tracker.js', defEnv, JSON.stringify({ prompt: '/ponytail band' }));
assert.equal(result.status, 0, result.stderr);
assert.equal(result.stdout, '');
assert.equal(fs.existsSync(path.join(defHome, '.claude', '.ponytail-band')), false, '/ponytail band must not write a band flag');
assert.equal(fs.readFileSync(defFlag, 'utf8'), 'ultra', '/ponytail band must not change the level');

// review is not a valid default (#377) — the command is ignored, config unchanged.
result = run('ponytail-mode-tracker.js', defEnv, JSON.stringify({ prompt: '/ponytail default review' }));
assert.equal(result.status, 0, result.stderr);
assert.equal(JSON.parse(fs.readFileSync(defConfig, 'utf8')).defaultMode, 'lite', 'review must not be accepted as a default');

// review must be refused as a default by the config functions too, not only the
// mode-tracker command path (#377): writing it is a no-op, and a stray
// PONYTAIL_DEFAULT_MODE=review falls back to the built-in default.
const revHome = path.join(temp, 'review-default-home');
const revConfigDir = path.join(revHome, '.config', 'ponytail');
fs.mkdirSync(revConfigDir, { recursive: true });
const revConfigPath = path.join(revConfigDir, 'config.json');
fs.writeFileSync(revConfigPath, JSON.stringify({ defaultMode: 'lite' }, null, 2));

const prevXdgRev = process.env.XDG_CONFIG_HOME;
const prevEnvModeRev = process.env.PONYTAIL_DEFAULT_MODE;
process.env.XDG_CONFIG_HOME = path.join(revHome, '.config');
try {
  assert.equal(writeDefaultMode('review'), null, 'writeDefaultMode must refuse review as a default (#377)');
  assert.equal(JSON.parse(fs.readFileSync(revConfigPath, 'utf8')).defaultMode, 'lite', 'a refused review write must leave the config unchanged');

  delete process.env.PONYTAIL_DEFAULT_MODE;
  fs.rmSync(revConfigPath);
  process.env.PONYTAIL_DEFAULT_MODE = 'review';
  assert.equal(getDefaultMode(), DEFAULT_MODE, 'PONYTAIL_DEFAULT_MODE=review must fall back to the built-in default');
} finally {
  if (prevXdgRev === undefined) delete process.env.XDG_CONFIG_HOME; else process.env.XDG_CONFIG_HOME = prevXdgRev;
  if (prevEnvModeRev === undefined) delete process.env.PONYTAIL_DEFAULT_MODE; else process.env.PONYTAIL_DEFAULT_MODE = prevEnvModeRev;
}

// Normal path stays fast: 'end' exits explicitly, so the (now ref'd) fallback
// timer never adds its full 1000ms to a prompt that does reach EOF.
{
  const t0 = Date.now();
  const r = run('ponytail-mode-tracker.js', codexEnv, JSON.stringify({ prompt: 'hi' }));
  assert.equal(r.status, 0, r.stderr);
  const elapsed = Date.now() - t0;
  assert.ok(elapsed < 800, `normal path took ${elapsed}ms; ref'd fallback timer is delaying EOF exits`);
}

// #790: when stdin never emits 'end' (the Windows PowerShell wrapper can
// swallow the piped JSON, #443), the hook must still exit on its own via the
// 1000ms fallback timer — not hang until the host's external watchdog kills
// it. An unref'd timer never fired in that state on Windows (a ref'd stdin
// keeps the loop alive and the unref'd timer is never scheduled), so the
// fallback was dead code exactly where it was needed. The timer is now ref'd;
// the normal 'end' path exits explicitly (checked above) so the ref'd timer
// adds no latency. spawnSync's timeout acts as the watchdog: status null /
// SIGTERM means the hook hung past 2500ms instead of exiting on its 1s
// fallback. The unref starvation itself is Windows-only (a POSIX pipe lets the
// unref'd timer fire), so the ref'd-timer contract is also asserted
// statically below.
{
  const hangHome = path.join(temp, 'hang-home');
  fs.mkdirSync(hangHome, { recursive: true });
  const hangEnv = { HOME: hangHome, USERPROFILE: hangHome, CLAUDE_CONFIG_DIR: hangHome };
  for (const script of ['ponytail-mode-tracker.js', 'ponytail-subagent.js']) {
    const r = spawnSync(process.execPath, [path.join(root, 'hooks', script)], {
      env: { ...process.env, ...isolated, ...hangEnv },
      timeout: 2500,
      encoding: 'utf8',
    });
    assert.notEqual(r.status, null, `${script} never exited on its fallback with open stdin (#790)`);
    assert.equal(r.status, 0, `${script} exited non-zero on its fallback (#790): ${r.stderr}`);
    assert.ok(r.signal === null || r.signal === undefined, `${script} was watchdog-killed; 1s fallback did not fire (#790)`);

    const src = fs.readFileSync(path.join(root, 'hooks', script), 'utf8');
    assert.ok(
      !src.includes('.unref('),
      `${script} fallback timer must stay ref'd (#790): an unref'd timer never fires while a stuck ref'd stdin keeps the loop alive on Windows`,
    );
  }
}

// #736: /ponytail-review is a one-shot skill, not a session level. Persisting
// `review` makes every later getPonytailInstructions() return a pointer line.
const latchHome = path.join(temp, 'review-latch-home');
const latchFlag = path.join(latchHome, '.claude', '.ponytail-active');
fs.mkdirSync(path.dirname(latchFlag), { recursive: true });
const latchEnv = { HOME: latchHome, USERPROFILE: latchHome };

fs.writeFileSync(latchFlag, 'full');
result = run('ponytail-mode-tracker.js', latchEnv, JSON.stringify({ prompt: '/ponytail-review' }));
assert.equal(result.status, 0, result.stderr);
assert.equal(
  fs.readFileSync(latchFlag, 'utf8'),
  'full',
  '/ponytail-review must leave an active level untouched (#736)',
);

result = run(
  'ponytail-mode-tracker.js',
  latchEnv,
  JSON.stringify({ prompt: '/ponytail:ponytail-review src/app.js' }),
);
assert.equal(result.status, 0, result.stderr);
assert.equal(
  fs.readFileSync(latchFlag, 'utf8'),
  'full',
  'namespaced /ponytail:ponytail-review must not latch review either (#736)',
);
result = run(
  'ponytail-mode-tracker.js',
  latchEnv,
  JSON.stringify({ prompt: '/alex-ponytail:ponytail-review src/app.js' }),
);
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.readFileSync(latchFlag, 'utf8'), 'full', 'the alex-ponytail: prefix must not latch review either');

fs.unlinkSync(latchFlag);
result = run('ponytail-mode-tracker.js', latchEnv, JSON.stringify({ prompt: '/ponytail-review' }));
assert.equal(result.status, 0, result.stderr);
assert.equal(
  fs.existsSync(latchFlag),
  false,
  '/ponytail-review must not create a review flag on a fresh session (#736)',
);

// #662/#809: two Claude Code sessions in different repos keep their own mode.
{
  const projHome = path.join(temp, 'per-project-home');
  fs.mkdirSync(projHome, { recursive: true });
  const repoA = { HOME: projHome, USERPROFILE: projHome, CLAUDE_PROJECT_DIR: '/work/repo-a' };
  const repoB = { HOME: projHome, USERPROFILE: projHome, CLAUDE_PROJECT_DIR: '/work/repo-b' };
  const subagentLevel = (env) => {
    const r = run('ponytail-subagent.js', env);
    assert.equal(r.status, 0, r.stderr);
    if (!r.stdout) return null;
    return JSON.parse(r.stdout).hookSpecificOutput.additionalContext.match(/level: (\w+)/)[1];
  };

  run('ponytail-activate.js', repoA);
  run('ponytail-activate.js', { ...repoB, PONYTAIL_DEFAULT_MODE: 'off' });
  assert.equal(subagentLevel(repoA), 'full', 'an off session in repo B must not clear repo A');
  assert.equal(subagentLevel(repoB), null, 'repo B is off');

  run('ponytail-mode-tracker.js', repoA, JSON.stringify({ prompt: '/ponytail ultra' }));
  run('ponytail-mode-tracker.js', repoB, JSON.stringify({ prompt: '/ponytail lite' }));
  assert.equal(subagentLevel(repoA), 'ultra');
  assert.equal(subagentLevel(repoB), 'lite');

  run('ponytail-mode-tracker.js', repoB, JSON.stringify({ prompt: '/ponytail off' }));
  assert.equal(subagentLevel(repoB), null, '/ponytail off works in repo B');
  assert.equal(subagentLevel(repoA), 'ultra', '/ponytail off in repo B leaves repo A alone');

  // Paths with a directory separator and an underscore must not share a mode.
  const nested = path.join(temp, 'project', 'nested');
  const sibling = path.join(temp, 'project_nested');
  fs.mkdirSync(nested, { recursive: true });
  fs.mkdirSync(sibling, { recursive: true });
  const nestedEnv = { HOME: projHome, USERPROFILE: projHome, CLAUDE_PROJECT_DIR: nested };
  const siblingEnv = { HOME: projHome, USERPROFILE: projHome, CLAUDE_PROJECT_DIR: sibling };
  run('ponytail-activate.js', { ...nestedEnv, PONYTAIL_DEFAULT_MODE: 'ultra' });
  if (process.platform === 'win32') {
    assert.equal(subagentLevel({ ...nestedEnv, CLAUDE_PROJECT_DIR: nested.replace(/\\/g, '/') }), 'ultra',
      'alternate path separators still identify the same project');
  }
  run('ponytail-activate.js', { ...siblingEnv, PONYTAIL_DEFAULT_MODE: 'off' });
  assert.equal(subagentLevel(nestedEnv), 'ultra', 'an off sibling must not clear the nested project');
  run('ponytail-mode-tracker.js', siblingEnv, JSON.stringify({ prompt: '/ponytail lite' }));
  assert.equal(subagentLevel(nestedEnv), 'ultra', 'a sibling mode switch must not change the nested project');
  assert.equal(subagentLevel(siblingEnv), 'lite');
}

// #639: bare /ponytail switches ponytail on when it is off, and only reports
// (never resets) the level when it is already on.
{
  const bareHome = path.join(temp, 'bare-home');
  const bareFlag = path.join(bareHome, '.claude', '.ponytail-active');
  fs.mkdirSync(path.dirname(bareFlag), { recursive: true });
  const bareEnv = { HOME: bareHome, USERPROFILE: bareHome };
  const bare = (env) => run('ponytail-mode-tracker.js', env, JSON.stringify({ prompt: '/ponytail' }));

  fs.writeFileSync(bareFlag, 'ultra');
  assert.match(bare(bareEnv).stdout, /PONYTAIL MODE ACTIVE — level: ultra/);
  assert.equal(fs.readFileSync(bareFlag, 'utf8'), 'ultra', 'checking the level must not reset ultra');

  fs.unlinkSync(bareFlag);
  assert.match(bare(bareEnv).stdout, /PONYTAIL MODE CHANGED — level: full/);
  assert.equal(fs.readFileSync(bareFlag, 'utf8'), 'full', 'bare /ponytail switches an unrecorded session on');

  fs.writeFileSync(bareFlag, 'off');
  assert.match(bare(bareEnv).stdout, /PONYTAIL MODE CHANGED — level: full/);
  assert.equal(fs.readFileSync(bareFlag, 'utf8'), 'full', 'bare /ponytail switches a stopped session on');

  fs.unlinkSync(bareFlag);
  bare({ ...bareEnv, PONYTAIL_DEFAULT_MODE: 'off' });
  assert.equal(fs.readFileSync(bareFlag, 'utf8'), 'full', 'an off default still switches on at full');
}

// Compaction and resume continue the conversation: they keep the live level, and
// keep ponytail off after "stop ponytail" or "/ponytail off", instead of
// resetting to the default. startup and clear start at the default.
{
  const keepHome = path.join(temp, 'keep-home');
  const keepFlag = path.join(keepHome, '.claude', '.ponytail-active');
  const keepEnv = { HOME: keepHome, USERPROFILE: keepHome };
  const start = (source) => run('ponytail-activate.js', keepEnv, JSON.stringify({ source }));
  const say = (prompt) => run('ponytail-mode-tracker.js', keepEnv, JSON.stringify({ prompt }));

  for (const source of ['compact', 'resume']) {
    start('startup');
    say('/ponytail ultra');
    assert.match(start(source).stdout, /PONYTAIL MODE ACTIVE — level: ultra/, `${source} must keep the live level`);
    assert.equal(fs.readFileSync(keepFlag, 'utf8'), 'ultra', `${source} must keep the live level`);

    for (const stop of ['stop ponytail', '/ponytail off']) {
      say('/ponytail lite');
      say(stop);
      assert.equal(start(source).stdout, '', `${source} must not switch a session back on after "${stop}"`);
      assert.equal(fs.readFileSync(keepFlag, 'utf8'), 'off', `${source} must keep ponytail off after "${stop}"`);
      // A second continuation still finds the session off.
      assert.equal(start(source).stdout, '', `a second ${source} must stay off after "${stop}"`);
    }
  }

  // Nothing recorded, e.g. a resume on a fresh machine or container: the default level.
  fs.rmSync(keepFlag);
  assert.match(start('resume').stdout, /PONYTAIL MODE ACTIVE — level: full/, 'an unrecorded resume starts at the default');

  // startup and clear start a new conversation at the default level, even after "stop ponytail".
  for (const source of ['startup', 'clear']) {
    say('/ponytail ultra');
    say('stop ponytail');
    assert.match(start(source).stdout, /PONYTAIL MODE ACTIVE — level: full/, `${source} must start at the default level`);
  }
}

// The Levels table is the only part of SKILL.md filtered by level: each ruleset
// keeps its own row and drops the other levels' rows.
for (const level of ['lite', 'full', 'ultra']) {
  const rules = getPonytailInstructions(level);
  assert.ok(rules.startsWith('PONYTAIL MODE ACTIVE — level: ' + level + '\n\n'), level);
  assert.match(rules, /lazy senior developer/);
  for (const other of ['lite', 'full', 'ultra']) {
    assert.equal(rules.includes('| **' + other + '** |'), other === level, `${level} ruleset and the ${other} row`);
  }
}

// Without a readable SKILL.md the hooks still name the level, and point at the
// skill instead of carrying a stale copy of the rules.
{
  const plugin = path.join(temp, 'plugin-without-skills');
  fs.cpSync(path.join(root, 'hooks'), path.join(plugin, 'hooks'), { recursive: true });
  const r = spawnSync(process.execPath, [path.join(plugin, 'hooks', 'ponytail-activate.js')], {
    env: { ...process.env, ...isolated, HOME: path.join(temp, 'no-skill-home'), USERPROFILE: path.join(temp, 'no-skill-home') },
    input: '',
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(
    r.stdout,
    'PONYTAIL MODE ACTIVE — level: full\nThe ruleset did not load: follow skills/ponytail/SKILL.md in the ponytail plugin.',
  );
}

console.log('hook compatibility checks passed');
