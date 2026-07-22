'use strict';

var fs = require('fs');
var path = require('path');

var SOURCE_FILES = [
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
];

function bundle(parts) {
  return parts.join('');
}

function readBundle(root) {
  var sourceDirectory = path.join(root, 'app', 'source');
  return bundle(SOURCE_FILES.map(function (fileName) {
    return fs.readFileSync(path.join(sourceDirectory, fileName), 'utf8');
  }));
}

function outputPath(root) {
  return path.join(root, 'app', 'app.js');
}

function check(root) {
  var expected = readBundle(root);
  var target = outputPath(root);
  return fs.existsSync(target) && fs.readFileSync(target, 'utf8') === expected;
}

function write(root) {
  var target = outputPath(root);
  fs.writeFileSync(target, readBundle(root), 'utf8');
  return target;
}

if (require.main === module) {
  var projectRoot = path.resolve(__dirname, '..');
  if (process.argv.indexOf('--check') !== -1) {
    if (!check(projectRoot)) {
      console.error('app/app.js is stale. Run: npm run build:app');
      process.exitCode = 1;
    } else {
      console.log('Application bundle is current');
    }
  } else {
    console.log('Built ' + path.relative(projectRoot, write(projectRoot)));
  }
}

module.exports = {
  SOURCE_FILES: SOURCE_FILES,
  bundle: bundle,
  check: check,
  readBundle: readBundle,
  write: write
};
