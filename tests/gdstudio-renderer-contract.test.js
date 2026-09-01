'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('public/index.html');
const loader = read('public/js/index-loader.js');
const core = read('public/js/modules/00-state/00-core-stores.js');
const quality = read('public/js/modules/05-playback/00-api-quality-output.js');
const search = read('public/js/modules/05-playback/07-search.js');
const playback = read('public/js/modules/05-playback/13-playback-start-audio.js');
const lyrics = read('public/js/modules/06-lyrics/00-lyrics-fetch-parse.js');

test('UI exposes one GD Studio search surface and no provider login surface', () => {
  assert.match(html, /data-online-source="gdstudio"/);
  assert.doesNotMatch(html, /id="search-mode-(?:netease|qq|kugou|qishui|spotify|podcast)"/);
  assert.doesNotMatch(html, /id="login-modal"|id="user-btn"|id="account-modal"/);
  assert.doesNotMatch(html, /data-home-recommend-source="(?:netease|qq|kugou|qishui|spotify)"/);
  assert.doesNotMatch(html, /id="tab-podcast"/);
});

test('loader excludes old account runtime and loads GD Studio compatibility runtime', () => {
  assert.match(loader, /08-account\/01-gdstudio-runtime\.js/);
  assert.doesNotMatch(loader, /00-login-easter-egg|01-login-modal-utils|02-login-status|03-login-modal-flows|04-user-modal-logout|05-startup-login-guide/);
});

test('local playlist runtime is loaded without restoring online playlist APIs', () => {
  assert.match(loader, /05-playback\/02a-local-playlists\.js/);
  const playlistShell = read('public/js/modules/06-lyrics/01-playlist-panel-shell.js');
  const playlistDetail = read('public/js/modules/06-lyrics/02-playlist-detail.js');
  assert.match(playlistShell, /localPlaylistCatalogRows\(\)/);
  assert.match(playlistDetail, /labels\s*=\s*\{[^}]*local:\s*['"]本地歌单['"]/);
  assert.match(playlistDetail, /order\s*=\s*\[['"]local['"]/);
  assert.match(playlistDetail, /groups\s*=\s*\{\s*local:\s*\[\]/);
  assert.doesNotMatch(playlistShell, /\/api\/(?:qq|kugou|qishui|spotify|login)\/playlist/);
});

test('renderer uses one GD Studio provider and bitrate quality choices', () => {
  assert.match(core, /gdstudio/);
  assert.match(core, /\b128\b/);
  assert.match(core, /\b192\b/);
  assert.match(core, /\b320\b/);
  assert.match(core, /\b740\b/);
  assert.match(core, /\b999\b/);
  assert.match(quality, /provider === 'gdstudio'/);
  assert.match(search, /MUSIC_SEARCH_PROVIDER_ORDER = \['gdstudio'\]/);
  assert.match(search, /return '\/api\/search\?keywords='/);
});

test('renderer initializes first-play state before playback starts', () => {
  assert.match(core, /var firstPlayDone = false;/);
});

test('online playback and lyrics use only GD Studio routes', () => {
  assert.match(playback, /gdstudioSource/);
  assert.match(playback, /\/api\/song\/url\?id=/);
  assert.match(playback, /\/api\/audio\?url=/);
  assert.doesNotMatch(playback, /\/api\/(?:qq|kugou|qishui|spotify)\/song\/url/);
  assert.match(lyrics, /gdstudioSource/);
  assert.match(lyrics, /\/api\/lyric\?id=/);
  assert.doesNotMatch(lyrics, /\/api\/(?:qq|kugou|qishui|spotify)\/lyric/);
});

test('loaded renderer modules contain no legacy online provider routes or identities', () => {
  const modulePaths = Array.from(loader.matchAll(/'([^']+\.js)'/g)).map((match) => match[1]);
  const loaded = modulePaths.map((file) => read(`public/${file}`)).join('\n');
  assert.doesNotMatch(loaded, /\/api\/(?:qq|kugou|qishui|spotify|login)\//);
  assert.doesNotMatch(loaded, /provider\s*===\s*['"](?:netease|qq|kugou|qishui|spotify)['"]/);
  assert.doesNotMatch(loaded, /source\s*===\s*['"](?:netease|qq|kugou|qishui|spotify)['"]/);
});
