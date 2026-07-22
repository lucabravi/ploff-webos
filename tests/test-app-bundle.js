'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var Builder = require('../scripts/build-app');
var root = path.join(__dirname, '..');

assert.deepStrictEqual(Builder.SOURCE_FILES, [
  '00-runtime.js',
  '10-shell-home.js',
  '20-search.js',
  '30-library.js',
  '40-settings.js',
  '42-server.js',
  '45-setup.js',
  '46-server-actions.js',
  '47-settings-navigation.js',
  '48-diagnostics.js',
  '50-detail.js',
  '60-player-controls.js',
  '65-player-subtitles-playback.js',
  '70-input-bootstrap.js'
], 'the application source order must be explicit and stable');

assert.strictEqual(
  Builder.bundle(['first\n', 'second\n']),
  'first\nsecond\n',
  'bundle concatenation must preserve source bytes without hidden separators'
);

if (fs.existsSync(path.join(root, 'app', 'source', Builder.SOURCE_FILES[0]))) {
  assert.strictEqual(
    Builder.readBundle(root),
    fs.readFileSync(path.join(root, 'app', 'app.js'), 'utf8'),
    'the checked-in browser bundle must match the canonical source fragments'
  );
}

console.log('Application bundle checks passed');
