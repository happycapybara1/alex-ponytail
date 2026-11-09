#!/usr/bin/env node
// ponytail — PostToolUse hook for Claude Code's Skill tool.
//
// When Claude loads the ponytail skill itself (for example after the ring's
// yes), the skill's text brings the rules into the conversation, but nothing
// recorded the level, so subagents got no rules. Record it here, exactly as
// typing /ponytail would. Prints nothing.

const { getDefaultMode, normalizeMode } = require('./ponytail-config');
const { readMode, setMode } = require('./ponytail-runtime');

let input = '';
let done = false;

function finish() {
  if (done) return;
  done = true;
  try {
    const data = JSON.parse(input.replace(/^﻿/, ''));
    const toolInput = data.tool_input || {};
    const skill = String(toolInput.skill || '').trim().toLowerCase();
    // The mode itself (ponytail or <plugin>:ponytail), not ponytail-review etc.
    if (!/^(?:[\w.-]+:)?ponytail$/.test(skill)) return;
    const arg = normalizeMode(String(toolInput.args || '').trim().split(/\s+/)[0]);
    const live = readMode();
    const fallback = getDefaultMode() === 'off' ? 'full' : getDefaultMode();
    setMode(arg || (live && live !== 'off' ? live : fallback));
  } catch (e) {
    // Best effort: never block a tool call
  }
}

process.stdin.on('data', chunk => { input += chunk; });
process.stdin.on('end', () => { finish(); process.exit(0); });
process.stdin.on('error', () => { finish(); process.exit(0); });
setTimeout(() => { finish(); process.exit(0); }, 1000);
