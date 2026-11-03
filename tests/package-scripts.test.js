#!/usr/bin/env node

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

test('root npm test runs the test suite', () => {
  const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));

  assert.match(packageJson.scripts.test, /node --test tests\/\*\.test\.js/);
});

test('CI has no publish credentials and pins its actions', () => {
  const ci = fs.readFileSync(path.join(root, '.github', 'workflows', 'test.yml'), 'utf8').replace(/\r\n/g, '\n');

  assert.doesNotMatch(ci, /id-token:/);
  for (const action of ci.matchAll(/^\s+- uses: (.+)$/gm)) {
    assert.match(action[1], /^actions\/[\w-]+@[a-f0-9]{40} # v\d+\.\d+\.\d+\r?$/);
  }
});
