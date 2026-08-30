'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('package includes only the GD Studio active server and adapter', () => {
  assert.ok(pkg.build.files.includes('server-gdstudio.js'));
  assert.ok(pkg.build.files.includes('gdstudio-api.js'));
  assert.ok(!pkg.build.files.includes('server.js'));
  assert.ok(!pkg.build.files.includes('*-api.js'));
  assert.equal(pkg.dependencies.NeteaseCloudMusicApi, undefined);
  assert.equal(typeof pkg.dependencies.qrcode, 'string');
});

test('documentation declares GD Studio attribution and non-commercial boundary', () => {
  const readme = read('README.md');
  const privacy = read('PRIVACY.md');
  assert.match(readme, /GD Studio/);
  assert.match(readme, /CC BY-NC 4\.0/);
  assert.match(readme, /非商业|商用/);
  assert.match(privacy, /GD Studio/);
  assert.match(privacy, /Cookie|Token/);
});
