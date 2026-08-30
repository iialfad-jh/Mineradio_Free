'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server-gdstudio.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'public/js/modules/05-playback/02-listen-stats.js'), 'utf8');

assert.match(server, /provider:\s*'gdstudio'/);
assert.doesNotMatch(server, /listen_data_total|scrobble|COOKIE_FILE|NeteaseCloudMusicApi/);
assert.doesNotMatch(renderer, /\/api\/listen\/report/);
assert.match(renderer, /mineradio-listen-rollup-v2/);
console.log('[OK] GD Studio-only runtime keeps local listen rollups and removes platform account sync.');
