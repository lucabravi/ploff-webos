'use strict';

var fs = require('fs');
var path = require('path');
var Minifier = require('./minify-javascript');

var MODULE_FILES = [
  'plex-feature-ports.js',
  'presentation-services.js',
  'choice-dialog-controller.js',
  'media-info-dialog-controller.js',
  'settings-controller.js',
  'settings-feature-controller.js',
  'diagnostics-controller.js',
  'diagnostics-feature-controller.js',
  'setup-feature-controller.js',
  'server-controller.js',
  'server-feature-controller.js',
  'search-controller.js',
  'search-feature-controller.js',
  'shell-controller.js',
  'shell-feature-controller.js',
  'library-controller.js',
  'library-feature-controller.js',
  'detail-controller.js',
  'detail-feature-controller.js',
  'queue-sequence-contract.js',
  'bounded-queue-cache.js',
  'plex-container-queue-provider.js',
  'series-queue-provider.js',
  'queue-gap-controller.js',
  'playback-queue-controller.js',
  'player-controls-controller.js',
  'playback-controller.js',
  'player-feature-controller.js',
  'media-context-controller.js',
  'input-controller.js',
  'pointer-controller.js',
  'application-controller.js',
  'application-bootstrap.js'
];

function bundle(parts) {
  return parts.join('');
}

function compactSource(source) {
  var value = String(source || '');
  if (/\\\r?\n/.test(value)) { throw new Error('Bundle compaction does not support JavaScript line continuations'); }
  return value
    .replace(/^[\t ]*\r?\n/gm, '')
    .replace(/^[\t ]+/gm, '')
    .replace(/[\t ]+$/gm, '');
}

function readFiles(root, files) {
  return files.map(function (fileName) {
    return compactSource(fs.readFileSync(path.join(root, 'app', 'coordinator', fileName), 'utf8'));
  });
}

function readSourceBundle(root, moduleFiles) {
  return bundle(readFiles(root, moduleFiles || MODULE_FILES));
}

function readBundle(root, moduleFiles) {
  return Minifier.minifySource(readSourceBundle(root, moduleFiles));
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
  MODULE_FILES: MODULE_FILES,
  bundle: bundle,
  compactSource: compactSource,
  check: check,
  readBundle: readBundle,
  readSourceBundle: readSourceBundle,
  write: write
};
