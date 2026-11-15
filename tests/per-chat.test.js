#!/usr/bin/env node
// Claude Code gives every hook the chat's session_id, so ponytail keeps its
// level per chat: another chat in the same folder, a new chat, /clear or a
// subagent's skill load never changes this chat's level.

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const hooks = path.join(__dirname, '..', 'hooks');

// A throwaway home with the ring (alex-plugins-home) installed and on, as in
// real use: a fresh chat starts off, and only the user's choice turns it on.
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ponytail-chat-'));
  const claude = path.join(root, '.claude');
  const project = path.join(root, 'project');
  fs.mkdirSync(path.join(claude, 'plugins'), { recursive: true });
  fs.mkdirSync(project, { recursive: true });
  fs.writeFileSync(path.join(claude, 'plugins', 'installed_plugins.json'),
    JSON.stringify({ version: 2, plugins: { 'alex-plugins-home@alex': [{ scope: 'user' }] } }));
  fs.writeFileSync(path.join(claude, 'settings.json'),
    JSON.stringify({ enabledPlugins: { 'alex-plugins-home@alex': true } }));
  const env = {
    PATH: process.env.PATH,
    SystemRoot: process.env.SystemRoot,
    HOME: root,
    USERPROFILE: root,
    XDG_CONFIG_HOME: path.join(root, 'xdg'),
    APPDATA: path.join(root, 'appdata'),
    CLAUDE_CONFIG_DIR: claude,
    CLAUDE_PLUGIN_DATA: path.join(root, 'plugin-data'),
    // Every chat below works in this one folder.
    CLAUDE_PROJECT_DIR: project,
  };
  const run = (script, payload, extraEnv = {}) => spawnSync(process.execPath, [path.join(hooks, script)], {
    input: typeof payload === 'string' ? payload : JSON.stringify(payload),
    env: { ...env, ...extraEnv },
    encoding: 'utf8',
    timeout: 10000,
  });
  const read = (file) => {
    try { return fs.readFileSync(file, 'utf8'); } catch (e) { return null; }
  };
  const modesDir = path.join(claude, 'ponytail-modes');
  return {
    root,
    claude,
    env,
    run,
    start: (id, source) => run('ponytail-activate.js', { session_id: id, source }),
    say: (id, prompt) => run('ponytail-mode-tracker.js', { session_id: id, prompt }),
    loadSkill: (id, fields = {}) => run('ponytail-skill-tracker.js',
      { session_id: id, tool_name: 'Skill', tool_input: { skill: 'alex-ponytail:ponytail' }, ...fields }),
    // A subagent's hooks get its parent chat's session_id, plus its own agent_id.
    subagent: (id) => run('ponytail-subagent.js', { session_id: id, agent_id: 'agent-1', agent_type: 'general-purpose' }),
    record: (id) => read(path.join(claude, 'ponytail-sessions', id)),
    // The per-folder file and the shared flag, which hooks without a session id use.
    folderState: () => ({
      flag: read(path.join(claude, '.ponytail-active')),
      modes: fs.existsSync(modesDir) ? fs.readdirSync(modesDir).map((name) => read(path.join(modesDir, name))) : [],
    }),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

// A stdin pipe that is never written or closed, as when a Windows wrapper
// swallows the hook input (#443).
function runWithOpenStdin(script, env) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const child = spawn(process.execPath, [path.join(hooks, script)], { env, stdio: ['pipe', 'pipe', 'ignore'] });
    let stdout = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    const guard = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`${script} hung on open stdin`));
    }, 5000);
    child.on('close', (code) => {
      clearTimeout(guard);
      resolve({ code, stdout, elapsed: Date.now() - t0 });
    });
    child.on('error', reject);
  });
}

test('two chats in one folder keep their own level', (t) => {
  const s = setup();
  t.after(s.cleanup);
  for (const id of ['chat-a', 'chat-b']) {
    assert.equal(s.start(id, 'startup').stdout, '', 'the ring makes a fresh chat start off');
  }

  const load = s.loadSkill('chat-a');
  assert.equal(load.status, 0, load.stderr);
  assert.equal(s.subagent('chat-b').stdout, '', "chat A's skill load must not reach a subagent of chat B");
  for (const source of ['compact', 'resume']) {
    assert.equal(s.start('chat-b', source).stdout, '', `chat B's ${source} must not pick up chat A's level`);
  }
  assert.match(s.subagent('chat-a').stdout, /PONYTAIL MODE ACTIVE — level: full/, 'a subagent of chat A gets the rules');
  assert.equal(s.record('chat-a'), 'full');

  assert.equal(s.start('chat-c', 'startup').stdout, '');
  assert.equal(s.record('chat-a'), 'full', 'a new chat leaves chat A on');

  assert.equal(s.say('chat-b', 'stop ponytail').stdout, 'PONYTAIL MODE OFF');
  assert.equal(s.record('chat-a'), 'full', '"stop ponytail" in chat B leaves chat A on');
  assert.match(s.subagent('chat-a').stdout, /level: full/);

  assert.deepEqual(s.folderState(), { flag: null, modes: [] },
    'chats with a session id never write the per-folder file or the shared flag');
});

test('a chat with a session id never reads or writes the per-folder file or the shared flag', (t) => {
  const s = setup();
  t.after(s.cleanup);
  // A hook that ran without a session id left the folder at ultra.
  s.run('ponytail-activate.js', { source: 'startup' }, { PONYTAIL_DEFAULT_MODE: 'ultra' });
  const before = s.folderState();
  assert.deepEqual(before, { flag: 'ultra', modes: ['ultra'] });

  assert.equal(s.start('chat-d', 'compact').stdout, '', 'compact starts at the start level, not the folder level');
  assert.equal(s.subagent('chat-d').stdout, '', 'a subagent of chat D ignores the folder level');
  assert.match(s.say('chat-d', '/ponytail').stdout, /PONYTAIL MODE CHANGED — level: full/,
    'bare /ponytail reads only the chat record');
  s.say('chat-d', '/ponytail lite');
  s.say('chat-d', 'stop ponytail');
  s.loadSkill('chat-d');
  s.start('chat-d', 'clear');
  assert.deepEqual(s.folderState(), before, 'the per-folder file and the shared flag stay as they were');
});

test("compact and resume keep the chat's own level; startup and clear start fresh", (t) => {
  const s = setup();
  t.after(s.cleanup);
  s.say('chat-a', '/ponytail ultra');
  s.say('chat-b', '/ponytail lite');
  for (const source of ['compact', 'resume']) {
    assert.match(s.start('chat-a', source).stdout, /PONYTAIL MODE ACTIVE — level: ultra/, `${source} keeps chat A's level`);
    assert.match(s.start('chat-b', source).stdout, /PONYTAIL MODE ACTIVE — level: lite/, `${source} keeps chat B's level`);
  }

  for (const source of ['startup', 'clear']) {
    s.say('chat-a', '/ponytail ultra');
    assert.equal(s.start('chat-a', source).stdout, '', `${source} starts chat A at the start level (off while the ring asks)`);
    assert.equal(s.record('chat-a'), 'off');
    assert.equal(s.record('chat-b'), 'lite', `${source} in chat A leaves chat B alone`);
  }

  s.say('chat-b', 'stop ponytail');
  assert.equal(s.start('chat-b', 'compact').stdout, '', 'compact keeps a stopped chat off');
  assert.equal(s.record('chat-b'), 'off');

  // No record yet, e.g. a resume on a fresh machine: the start level.
  assert.equal(s.start('chat-c', 'resume').stdout, '');
  assert.equal(s.record('chat-c'), 'off');
});

test("a subagent's skill load records nothing", (t) => {
  const s = setup();
  t.after(s.cleanup);
  s.start('chat-a', 'startup');
  const load = s.loadSkill('chat-a', { agent_id: 'agent-1', agent_type: 'general-purpose' });
  assert.equal(load.status, 0, load.stderr);
  assert.equal(load.stdout, '');
  assert.equal(s.subagent('chat-a').stdout, '', "a subagent's skill load must not turn its parent chat on");
  assert.equal(s.record('chat-a'), 'off');
  assert.deepEqual(s.folderState(), { flag: null, modes: [] });
});

test('the subagent hook injects nothing without a valid session id, and never hangs', async (t) => {
  const s = setup();
  t.after(s.cleanup);
  // Chat A and the folder state are both on, so a fallback to either would show.
  s.loadSkill('chat-a');
  s.run('ponytail-activate.js', { source: 'startup' }, { PONYTAIL_DEFAULT_MODE: 'ultra' });

  for (const [label, input] of [
    ['empty stdin', ''],
    ['bad JSON', 'not json'],
    ['no session id', { agent_type: 'general-purpose' }],
    ['a path as session id', { session_id: '../ponytail-sessions/chat-a', agent_type: 'general-purpose' }],
  ]) {
    const t0 = Date.now();
    const result = s.run('ponytail-subagent.js', input);
    const elapsed = Date.now() - t0;
    assert.equal(result.status, 0, `${label}: ${result.stderr}`);
    assert.equal(result.stdout, '', `${label} must inject nothing`);
    assert.ok(elapsed < 1500, `${label} took ${elapsed} ms`);
  }

  const open = await runWithOpenStdin('ponytail-subagent.js', s.env);
  assert.equal(open.code, 0, 'the 1000 ms fallback must exit 0');
  assert.equal(open.stdout, '', 'the 1000 ms fallback must inject nothing');
  assert.ok(open.elapsed < 2500, `the fallback took ${open.elapsed} ms`);
});

test('off words in the typed text turn this chat off', (t) => {
  const s = setup();
  t.after(s.cleanup);
  const reply = (prompt) => {
    s.say('chat-a', '/ponytail full');
    const result = s.say('chat-a', prompt);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout;
  };

  for (const prompt of [
    'load superpowers and remove ponytail',
    'stop ponytail',
    'stop ponytail.',
    'please turn off ponytail',
    'Ponytail off.',
    "don't stop ponytail. No, wait: stop ponytail",
    // The desktop app puts a status block before the typed words in side chats.
    '<system-reminder>x</system-reminder>\nstop ponytail',
    '<system-reminder>x</system-reminder>\n/ponytail off',
  ]) {
    assert.equal(reply(prompt), 'PONYTAIL MODE OFF', prompt);
    assert.equal(s.record('chat-a'), 'off', prompt);
  }

  for (const prompt of [
    'do not remove ponytail',
    "don't stop ponytail",
    'don\u2019t stop ponytail',
    'normal mode',
    'stop adhd mode',
    // A hyphen makes it a skill name, not the mode.
    'remove ponytail-audit output',
    'drop the ponytail-review findings',
    // Pasted text and task results are not typed words.
    '<pasted_content id="1">stop ponytail</pasted_content id="1">',
    '<task-notification>the agent said: stop ponytail</task-notification>',
  ]) {
    assert.equal(reply(prompt), '', prompt);
    assert.equal(s.record('chat-a'), 'full', prompt);
  }
});

test('/ponytail commands act on this chat only; /ponytail default still writes the config', (t) => {
  const s = setup();
  t.after(s.cleanup);
  assert.equal(s.say('chat-a', '/ponytail ultra').stdout, 'PONYTAIL MODE CHANGED — level: ultra');
  s.say('chat-b', '$ponytail lite');
  assert.equal(s.say('chat-a', '/ponytail').stdout, 'PONYTAIL MODE ACTIVE — level: ultra', "bare /ponytail reports this chat's level");
  assert.equal(s.record('chat-b'), 'lite');

  assert.equal(s.say('chat-b', '/alex-ponytail:ponytail off').stdout, 'PONYTAIL MODE OFF');
  assert.equal(s.record('chat-b'), 'off');
  assert.equal(s.record('chat-a'), 'ultra', '/ponytail off in chat B leaves chat A alone');

  assert.match(s.say('chat-a', '/ponytail default lite').stdout, /PONYTAIL DEFAULT SET/);
  const config = JSON.parse(fs.readFileSync(path.join(s.root, 'xdg', 'ponytail', 'config.json'), 'utf8'));
  assert.equal(config.defaultMode, 'lite');
  assert.equal(s.record('chat-a'), 'ultra', '/ponytail default leaves the chat level alone');
  assert.deepEqual(s.folderState(), { flag: null, modes: [] });
});

test('a /ponytail command counts only as the whole typed message', (t) => {
  const s = setup();
  t.after(s.cleanup);
  s.say('chat-a', '/ponytail lite');

  // A brief from another chat can start with a command and go on: it is not the user's command.
  for (const prompt of ['/ponytail ultra\nImplement the parser.', '/ponytail default full Task: review x.js']) {
    const result = s.say('chat-a', prompt);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '', prompt);
    assert.equal(s.record('chat-a'), 'lite', prompt);
  }
  assert.equal(fs.existsSync(path.join(s.root, 'xdg', 'ponytail', 'config.json')), false,
    'a brief that starts with /ponytail default writes no config file');

  // The command alone still works, also after the desktop app's status block.
  assert.equal(s.say('chat-a', '/ponytail full').stdout, 'PONYTAIL MODE CHANGED — level: full');
  assert.equal(s.record('chat-a'), 'full');
  assert.equal(s.say('chat-a', '<system-reminder>x</system-reminder>\n/ponytail off').stdout, 'PONYTAIL MODE OFF');
  assert.equal(s.record('chat-a'), 'off');
});

test('an invalid session id names no file: those hooks keep the folder state', (t) => {
  const s = setup();
  t.after(s.cleanup);
  for (const [id, level] of [['../escape', 'ultra'], ['x'.repeat(129), 'lite'], ['chat a', 'full'], [42, 'ultra']]) {
    s.say(id, `/ponytail ${level}`);
    assert.deepEqual(s.folderState(), { flag: level, modes: [level] }, JSON.stringify(id));
  }
  assert.equal(fs.existsSync(path.join(s.claude, 'ponytail-sessions')), false);
  assert.equal(fs.existsSync(path.join(s.claude, 'escape')), false);
});

test('Codex and Copilot ignore session_id and agent_id and keep the shared flag', (t) => {
  const s = setup();
  t.after(s.cleanup);
  for (const key of ['PLUGIN_DATA', 'COPILOT_PLUGIN_DATA']) {
    const data = path.join(s.root, key);
    const host = { [key]: data };
    const flag = () => fs.readFileSync(path.join(data, '.ponytail-active'), 'utf8');

    s.run('ponytail-mode-tracker.js', { session_id: 'chat-a', prompt: '/ponytail ultra' }, host);
    assert.equal(flag(), 'ultra', key);
    s.run('ponytail-mode-tracker.js', { session_id: 'chat-a', prompt: 'remove ponytail' }, host);
    assert.equal(flag(), 'ultra', `${key}: "stop ponytail" stays the only off phrase`);
    s.run('ponytail-skill-tracker.js',
      { session_id: 'chat-a', agent_id: 'agent-1', tool_name: 'Skill', tool_input: { skill: 'ponytail', args: 'lite' } }, host);
    assert.equal(flag(), 'lite', `${key}: a skill load records as before`);
    s.run('ponytail-activate.js', { session_id: 'chat-b', source: 'compact' }, host);
    assert.equal(flag(), 'lite', `${key}: compact keeps the shared level`);
    s.run('ponytail-mode-tracker.js', { session_id: 'chat-a', prompt: '/ponytail ultra\nImplement the parser.' }, host);
    assert.equal(flag(), 'ultra', `${key}: a command still needs only to start the message`);
    assert.equal(fs.existsSync(path.join(data, 'ponytail-sessions')), false, key);
  }
});
