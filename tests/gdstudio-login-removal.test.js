'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'desktop/main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'desktop/preload.js'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'public/js/index-loader.js'), 'utf8');

test('Electron startup uses the GD server without credential migration or login gate', () => {
  const startupStart = main.indexOf('async function ensureLocalServerStarted()');
  const startupEnd = main.indexOf('function showMainWindowSafely', startupStart);
  const startup = main.slice(startupStart, startupEnd);
  assert.match(startup, /server-gdstudio\.js/);
  assert.doesNotMatch(startup, /migrateLegacyAuthStorage|initializeLoginEasterEggGate|clearAllProviderLoginState/);
});

test('preload exposes no account login, cookie export, or login easter egg IPC', () => {
  assert.doesNotMatch(preload, /MusicLogin|LoginEasterEgg|exportLoginCookie|music-open-login|music-clear-login/);
});

test('no login modules are loaded into the renderer runtime', () => {
  assert.doesNotMatch(loader, /00-login-easter-egg|01-login-modal-utils|02-login-status|03-login-modal-flows|04-user-modal-logout|05-startup-login-guide/);
  assert.match(loader, /01-gdstudio-runtime/);
});

test('active main-process imports exclude legacy provider modules', () => {
  const imports = main.slice(0, main.indexOf('registerWallpaperEngineScheme'));
  assert.doesNotMatch(imports, /kugou-api|qishui-api|spotify-api|login-easter-egg-gate|NeteaseCloudMusicApi/);
});
