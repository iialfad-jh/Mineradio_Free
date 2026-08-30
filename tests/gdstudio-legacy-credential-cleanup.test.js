'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'desktop/main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'desktop/preload.js'), 'utf8');
const ui = fs.readFileSync(path.join(root, 'public/js/modules/07-fx/08-cache-storage-settings.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');

test('legacy credential cleanup is explicit, scoped to known files, and exposed in settings', () => {
  assert.match(main, /mineradio-clear-legacy-credentials/);
  assert.match(main, /showMessageBox/);
  assert.match(main, /\.cookie|\.qq-cookie|\.kugou-cookie|\.qishui-cookie|\.spotify-token\.json/);
  assert.match(preload, /clearLegacyCredentials/);
  assert.match(ui, /clearLegacyCredentials/);
  assert.match(html, /clearLegacyCredentials/);
});
