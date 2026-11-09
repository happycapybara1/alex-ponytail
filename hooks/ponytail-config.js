#!/usr/bin/env node
// ponytail — shared configuration resolver
//
// Resolution order for default mode:
//   1. PONYTAIL_DEFAULT_MODE environment variable
//   2. Config file defaultMode field:
//      - $XDG_CONFIG_HOME/ponytail/config.json (any platform, if set)
//      - ~/.config/ponytail/config.json (macOS / Linux fallback)
//      - %APPDATA%\ponytail\config.json (Windows fallback)
//   3. 'full'

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_MODE = 'full';
const RUNTIME_MODES = ['off', 'lite', 'full', 'ultra'];

function normalizeMode(mode) {
  if (typeof mode !== 'string') return null;
  const normalized = mode.trim().toLowerCase();
  return RUNTIME_MODES.includes(normalized) ? normalized : null;
}

// "stop ponytail" turns ponytail off, but only as the whole message (ignoring
// case and trailing punctuation), so a request that merely contains it does not.
// It is the only stop phrase, so i-have-adhd's own mode phrases leave ponytail on.
function isDeactivationCommand(text) {
  return String(text || '').trim().toLowerCase().replace(/[.!?\s]+$/, '') === 'stop ponytail';
}

function getConfigDir() {
  if (process.env.XDG_CONFIG_HOME) {
    return path.join(process.env.XDG_CONFIG_HOME, 'ponytail');
  }
  if (process.platform === 'win32') {
    return path.join(
      process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'),
      'ponytail'
    );
  }
  return path.join(os.homedir(), '.config', 'ponytail');
}

function getConfigPath() {
  return path.join(getConfigDir(), 'config.json');
}

function getClaudeDir() {
  // ponytail: CLAUDE_CONFIG_DIR overrides ~/.claude, matching Claude Code.
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

// The default the user set (env var, then config file), or null when unset.
function getConfiguredDefaultMode() {
  // 1. Environment variable (highest priority)
  // A default must be a level (off/lite/full/ultra); normalizeMode also
  // accepts values with whitespace or mixed casing.
  const envMode = normalizeMode(process.env.PONYTAIL_DEFAULT_MODE);
  if (envMode) {
    return envMode;
  }

  // 2. Config file
  try {
    const configPath = getConfigPath();
    // Strip UTF-8 BOM (common on Windows-saved files) so JSON.parse doesn't choke
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
    const configMode = normalizeMode(config.defaultMode);
    if (configMode) {
      return configMode;
    }
  } catch (e) {
    // Config file doesn't exist or is invalid — fall through
  }
  return null;
}

function getDefaultMode() {
  return getConfiguredDefaultMode() || DEFAULT_MODE;
}

// alex-plugins-home (the ring; formerly alex-ring) asks the user before loading
// ponytail in Claude Code. It counts as
// on when it is installed and the most specific settings file that names it
// enables it (project local, then project, then user), as Claude Code resolves
// enabledPlugins.
function isRingActive(projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd()) {
  const read = (file) => {
    try { return fs.readFileSync(file, 'utf8'); } catch (e) { return ''; }
  };
  const claudeDir = getClaudeDir();
  const installed = read(path.join(claudeDir, 'plugins', 'installed_plugins.json'));
  if (!installed.includes('"alex-plugins-home@') && !installed.includes('"alex-ring@')) return false;
  for (const file of [
    path.join(projectDir, '.claude', 'settings.local.json'),
    path.join(projectDir, '.claude', 'settings.json'),
    path.join(claudeDir, 'settings.json'),
  ]) {
    const match = read(file).match(/"(?:alex-plugins-home|alex-ring)@[^"]*"\s*:\s*(true|false)/);
    if (match) return match[1] === 'true';
  }
  return false;
}

function writeDefaultMode(mode) {
  const normalized = normalizeMode(mode);
  if (!normalized) return null;

  const configPath = getConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  let config = {};
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^\uFEFF/, ''));
    if (!config || typeof config !== 'object' || Array.isArray(config)) config = {};
  } catch (_) {}
  config.defaultMode = normalized;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  return normalized;
}

module.exports = {
  DEFAULT_MODE,
  getConfiguredDefaultMode,
  getDefaultMode,
  getConfigPath,
  isRingActive,
  getClaudeDir,
  normalizeMode,
  isDeactivationCommand,
  writeDefaultMode,
};
