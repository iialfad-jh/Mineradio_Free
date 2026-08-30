'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const splash = fs.readFileSync(path.join(root, 'public/js/modules/10-shell/03-splash.js'), 'utf8');
const loader = fs.readFileSync(path.join(root, 'public/js/index-loader.js'), 'utf8');

test('splash registers an early click fallback that can dismiss before splash-ready timer', () => {
  assert.match(splash, /splashReadyToEnter\s*=\s*true/);
  assert.match(splash, /dismissSplash\(\)/);
  assert.match(splash, /splash-early|earlySplash|splashEarly/i);
  assert.match(loader, /__mineradioSplashEarlyExitRequested/);
  assert.match(loader, /addEventListener\('click'/);
  assert.match(loader, /addEventListener\('keydown'/);
  assert.match(loader, /typeof window\.dismissSplash === 'function'/);
});
