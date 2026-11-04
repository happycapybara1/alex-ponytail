#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'ponytail-uninstall-'));
process.on('exit', () => fs.rmSync(temp, { recursive: true, force: true }));

// Every run gets a throwaway home, Claude dir and config dirs: uninstall deletes
// what it finds, so a missing override would delete the real ponytail state
// (on Windows, %APPDATA%\ponytail\config.json).
function runUninstall(dir) {
  return spawnSync(process.execPath, [path.join(root, 'scripts', 'uninstall.js')], {
    env: {
      ...process.env,
      HOME: dir,
      USERPROFILE: dir,
      CLAUDE_CONFIG_DIR: path.join(dir, '.claude'),
      XDG_CONFIG_HOME: path.join(dir, 'config-home'),
      APPDATA: path.join(dir, 'appdata'),
    },
    encoding: 'utf8',
  });
}

const home = path.join(temp, 'home');
const claudeDir = path.join(home, '.claude');
fs.mkdirSync(claudeDir, { recursive: true });

const flagPath = path.join(claudeDir, '.ponytail-active');
fs.writeFileSync(flagPath, 'full');

// #662: per-project flags live in ponytail-modes/; a leftover "off" would start
// a reinstall switched off.
const modesDir = path.join(claudeDir, 'ponytail-modes');
fs.mkdirSync(modesDir, { recursive: true });
fs.writeFileSync(path.join(modesDir, 'abc123'), 'off');

// OpenCode keeps its flag beside its own config; a leftover "off" would start a
// reinstall switched off.
const opencodeFlagPath = path.join(home, 'config-home', 'opencode', '.ponytail-active');
fs.mkdirSync(path.dirname(opencodeFlagPath), { recursive: true });
fs.writeFileSync(opencodeFlagPath, 'off');

const configPath = path.join(home, 'config-home', 'ponytail', 'config.json');
fs.mkdirSync(path.dirname(configPath), { recursive: true });
fs.writeFileSync(configPath, JSON.stringify({ defaultMode: 'ultra' }));

// A user's own Claude settings are not ponytail's to touch.
const settingsPath = path.join(claudeDir, 'settings.json');
const settings = JSON.stringify({ theme: 'dark' });
fs.writeFileSync(settingsPath, settings);

let result = runUninstall(home);
assert.equal(result.status, 0, result.stderr);
assert.equal(fs.existsSync(flagPath), false, 'mode flag must be removed');
assert.equal(fs.existsSync(modesDir), false, 'per-project mode flags must be removed');
assert.equal(fs.existsSync(opencodeFlagPath), false, 'OpenCode mode flag must be removed');
assert.equal(fs.existsSync(configPath), false, 'config file must be removed');
assert.equal(fs.readFileSync(settingsPath, 'utf8'), settings, 'settings.json must be left unchanged');

// Running again, or on an already-clean machine, must not throw.
result = runUninstall(home);
assert.equal(result.status, 0, result.stderr);
result = runUninstall(path.join(temp, 'home-empty'));
assert.equal(result.status, 0, result.stderr);

console.log('uninstall script checks passed');
