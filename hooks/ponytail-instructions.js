#!/usr/bin/env node
// Shared ponytail instruction builder for the hooks and the OpenCode plugin.

const fs = require('fs');
const path = require('path');
const { DEFAULT_MODE, normalizeMode } = require('./ponytail-config');

const SKILL_PATH = path.join(__dirname, '..', 'skills', 'ponytail', 'SKILL.md');

// The Levels table is the only mode-specific part of SKILL.md: keep the active
// level's row, drop the other levels' rows, and keep every other line verbatim.
function filterSkillBodyForMode(body, mode) {
  return String(body || '')
    .replace(/^---[\s\S]*?---\s*/, '')
    .split(/\r?\n/)
    .filter((line) => {
      const label = line.match(/^\|\s*\*\*(.+?)\*\*\s*\|/);
      const labelMode = label && normalizeMode(label[1]);
      return !labelMode || labelMode === mode;
    })
    .join('\n');
}

function getPonytailInstructions(mode) {
  const level = normalizeMode(mode) || DEFAULT_MODE;
  const header = 'PONYTAIL MODE ACTIVE — level: ' + level;
  try {
    return header + '\n\n' + filterSkillBodyForMode(fs.readFileSync(SKILL_PATH, 'utf8'), level);
  } catch (e) {
    return header + '\nThe ruleset did not load: follow skills/ponytail/SKILL.md in the ponytail plugin.';
  }
}

module.exports = { getPonytailInstructions };
