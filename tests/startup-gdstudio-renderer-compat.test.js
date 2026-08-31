'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const shell = fs.readFileSync(path.join(root, 'public/js/modules/06-lyrics/01-playlist-panel-shell.js'), 'utf8');
const runtime = fs.readFileSync(path.join(root, 'public/js/modules/08-account/01-gdstudio-runtime.js'), 'utf8');

test('GD Studio runtime supplies modal backdrop compatibility after account modules are removed', () => {
  assert.match(shell, /bindModalBackdropClose\(\)/);
  assert.match(runtime, /function bindModalBackdropClose\(\)/);
  assert.match(runtime, /function openGsapModal\(mask\)/);
  assert.match(runtime, /function closeGsapModal\(mask, afterClose\)/);
});
