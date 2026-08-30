'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server-gdstudio.js'), 'utf8');
const main = fs.readFileSync(path.join(root, 'desktop', 'main.js'), 'utf8');

test('active server imports the GD Studio adapter and exposes normalized routes', () => {
  assert.match(server, /require\('\.\/gdstudio-api'\)/);
  assert.match(server, /createGdStudioClient/);
  assert.match(server, /gd\.search/);
  assert.match(server, /gd\.songUrl/);
  assert.match(server, /gd\.lyric/);
  assert.match(server, /gd\.cover/);
  assert.match(server, /\/api\/gdstudio\/cover/);
  assert.match(server, /PLATFORM_REMOVED/);
  assert.match(main, /server-gdstudio\.js/);
  assert.doesNotMatch(main, /path\.join\(__dirname, '\.\.', 'server\.js'\)/);
});

test('active server does not read legacy provider cookies at request start', () => {
  assert.doesNotMatch(server, /COOKIE_FILE|TOKEN_FILE|refreshConfiguredCookieStores/);
  assert.doesNotMatch(server, /NeteaseCloudMusicApi|qq-vip-api|kugou-api|qishui-api|spotify-api/);
});

test('platform capability response is limited to GD Studio and local music', () => {
  const blockStart = server.indexOf("if (pathname === '/api/platform/capabilities')");
  const blockEnd = server.indexOf('if (REMOVED_ROUTE_RE.test(pathname)', blockStart);
  assert.ok(blockStart >= 0 && blockEnd > blockStart);
  const block = server.slice(blockStart, blockEnd);
  assert.match(block, /gdstudio/);
  assert.match(block, /local/);
  assert.doesNotMatch(block, /netease|qq|kugou|qishui|spotify/);
});

test('active server preserves external update, beat cache, and Cuefield routes', () => {
  assert.match(server, /\/api\/update\/latest/);
  assert.match(server, /UPDATE_EXTERNAL_ONLY/);
  assert.match(server, /\/api\/beatmap\/cache/);
  assert.match(server, /planCuefieldTransitionFromCache/);
  assert.match(server, /appendCuefieldFeedback/);
});
