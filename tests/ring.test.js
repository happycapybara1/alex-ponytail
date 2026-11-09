#!/usr/bin/env node
// The ring (alex-plugins-home) asks the user before loading ponytail in Claude Code. While the
// ring is on, a fresh session starts off, and loading the ponytail skill turns
// ponytail on (so subagents get the rules too).

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hooks = path.join(__dirname, '..', 'hooks');

function setup({ installed = true, user, local } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ponytail-ring-'));
  const claude = path.join(root, '.claude');
  const project = path.join(root, 'project');
  fs.mkdirSync(path.join(claude, 'plugins'), { recursive: true });
  fs.mkdirSync(path.join(project, '.claude'), { recursive: true });
  const plugins = installed ? { 'alex-plugins-home@alex': [{ scope: 'user' }] } : {};
  fs.writeFileSync(path.join(claude, 'plugins', 'installed_plugins.json'), JSON.stringify({ version: 2, plugins }));
  if (user !== undefined) {
    fs.writeFileSync(path.join(claude, 'settings.json'), JSON.stringify({ enabledPlugins: { 'alex-plugins-home@alex': user } }));
  }
  if (local !== undefined) {
    fs.writeFileSync(path.join(project, '.claude', 'settings.local.json'), JSON.stringify({ enabledPlugins: { 'alex-plugins-home@alex': local } }));
  }
  const env = { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot };
  Object.assign(env, {
    HOME: root,
    USERPROFILE: root,
    XDG_CONFIG_HOME: path.join(root, 'xdg'),
    APPDATA: path.join(root, 'appdata'),
    CLAUDE_CONFIG_DIR: claude,
    CLAUDE_PROJECT_DIR: project,
  });
  const run = (script, payload, extraEnv = {}) => spawnSync(process.execPath, [path.join(hooks, script)], {
    input: JSON.stringify(payload),
    env: { ...env, ...extraEnv },
    encoding: 'utf8',
    timeout: 10000,
  });
  const flag = () => fs.readFileSync(path.join(claude, '.ponytail-active'), 'utf8');
  return { root, run, flag, cleanup: () => fs.rmSync(root, { recursive: true, force: true }) };
}

const skillCall = (skill, args) => ({ hook_event_name: 'PostToolUse', tool_name: 'Skill', tool_input: { skill, args } });

test('ring on: a fresh session starts off and injects nothing', (t) => {
  const s = setup({ user: true });
  t.after(s.cleanup);
  const result = s.run('ponytail-activate.js', { source: 'startup' });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '');
  assert.equal(s.flag(), 'off');
});

test('ring on: a default level the user set still wins', (t) => {
  const s = setup({ user: true });
  t.after(s.cleanup);
  const result = s.run('ponytail-activate.js', { source: 'startup' }, { PONYTAIL_DEFAULT_MODE: 'ultra' });
  assert.match(result.stdout, /PONYTAIL MODE ACTIVE — level: ultra/);
});

test('ring disabled, off in this project, or not installed: ponytail starts as usual', (t) => {
  for (const options of [{ user: false }, { user: true, local: false }, { installed: false, user: true }]) {
    const s = setup(options);
    t.after(s.cleanup);
    const result = s.run('ponytail-activate.js', { source: 'startup' });
    assert.match(result.stdout, /PONYTAIL MODE ACTIVE — level: full/, JSON.stringify(options));
  }
});

test('ring on only in this project: ponytail waits there too', (t) => {
  const s = setup({ local: true });
  t.after(s.cleanup);
  assert.equal(s.run('ponytail-activate.js', { source: 'startup' }).stdout, '');
});

test("the ring's old name (alex-ring) still counts", (t) => {
  const s = setup({ user: true });
  t.after(s.cleanup);
  const claude = path.join(s.root, '.claude');
  for (const file of [path.join(claude, 'plugins', 'installed_plugins.json'), path.join(claude, 'settings.json')]) {
    fs.writeFileSync(file, fs.readFileSync(file, 'utf8').replace('alex-plugins-home@alex', 'alex-ring@alex'));
  }
  assert.equal(s.run('ponytail-activate.js', { source: 'startup' }).stdout, '');
});

test('the ring is Claude Code only: Codex starts as usual', (t) => {
  const s = setup({ user: true });
  t.after(s.cleanup);
  const result = s.run('ponytail-activate.js', { source: 'startup' }, { PLUGIN_DATA: path.join(s.root, 'codex-data') });
  assert.match(result.stdout, /PONYTAIL MODE ACTIVE — level: full/);
});

test('loading the ponytail skill turns ponytail on for this session and its subagents', (t) => {
  const s = setup({ user: true });
  t.after(s.cleanup);
  s.run('ponytail-activate.js', { source: 'startup' });
  assert.equal(s.run('ponytail-subagent.js', { agent_type: 'general-purpose' }).stdout, '', 'off before the yes');
  const result = s.run('ponytail-skill-tracker.js', skillCall('alex-ponytail:ponytail'));
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout, '', 'the skill text carries the rules; the hook adds nothing');
  assert.equal(s.flag(), 'full');
  assert.match(s.run('ponytail-subagent.js', { agent_type: 'general-purpose' }).stdout, /PONYTAIL MODE ACTIVE — level: full/);
  // A compaction keeps the level the yes recorded.
  assert.match(s.run('ponytail-activate.js', { source: 'compact' }).stdout, /level: full/);
});

test('the skill hook honors a level argument and ignores the other ponytail skills', (t) => {
  const s = setup({ user: true });
  t.after(s.cleanup);
  s.run('ponytail-activate.js', { source: 'startup' });
  s.run('ponytail-skill-tracker.js', skillCall('alex-ponytail:ponytail-review'));
  assert.equal(s.flag(), 'off', 'ponytail-review is a one-shot report, not the mode');
  s.run('ponytail-skill-tracker.js', skillCall('ponytail', 'ultra'));
  assert.equal(s.flag(), 'ultra');
});

test('the skill hook never blocks on bad input', (t) => {
  const s = setup({ user: true });
  t.after(s.cleanup);
  const result = spawnSync(process.execPath, [path.join(hooks, 'ponytail-skill-tracker.js')], {
    input: 'not json',
    env: { PATH: process.env.PATH, HOME: s.root, USERPROFILE: s.root, CLAUDE_CONFIG_DIR: path.join(s.root, '.claude') },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
});
