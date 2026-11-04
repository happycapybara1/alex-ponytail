#!/usr/bin/env node
// ponytail — removes state ponytail wrote outside the plugin's own files: the
// mode flags and the config file. Plugin files themselves are removed by each
// host's own uninstall command (see INSTALL.md); this only cleans up what those
// commands can't see.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { getConfigPath, getClaudeDir } = require('../hooks/ponytail-config');

function removeIfExists(filePath, label) {
  try {
    fs.unlinkSync(filePath);
    console.log(`Removed ${label}: ${filePath}`);
  } catch (e) {
    if (e.code !== 'ENOENT') throw e;
  }
}

removeIfExists(path.join(getClaudeDir(), '.ponytail-active'), 'mode flag');
const modesDir = path.join(getClaudeDir(), 'ponytail-modes');
if (fs.existsSync(modesDir)) {
  fs.rmSync(modesDir, { recursive: true });
  console.log(`Removed per-project mode flags: ${modesDir}`);
}
removeIfExists(path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'opencode', '.ponytail-active'), 'OpenCode mode flag');
removeIfExists(getConfigPath(), 'config file');
