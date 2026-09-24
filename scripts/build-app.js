'use strict';

var fs = require('fs');
var path = require('path');
var Minifier = require('./minify-javascript');

var PRELUDE_FILES = ['player-runtime-loader.js', 'diagnostics-support-runtime-loader.js'];

var PLAYER_FILES = [
  'skip-marker-state.js', 'player-controls-state.js', 'player-controls-view.js', 'player-buffering-indicator.js',
  'chapter-state.js', 'player-chapters-view.js', 'playback-recovery.js', 'playback-clock.js', 'native-video-driver.js',
  'player-seek-controller.js', 'playback-reposition.js', 'playback-session.js', 'playback-operation.js', 'playback-timeline.js',
  'resume-choice.js', 'subtitle-sync.js', 'subtitle-runtime.js', 'subtitle-editor-session.js',
  'subtitle-editor-view.js', 'subtitle-offset-store.js', 'up-next-state.js', 'up-next-timing.js', 'up-next-view.js', 'queue-gap-view.js',
  'coordinator/queue-sequence-contract.js', 'coordinator/bounded-queue-cache.js', 'coordinator/plex-container-queue-provider.js',
  'coordinator/series-queue-provider.js', 'coordinator/queue-gap-controller.js', 'coordinator/playback-queue-controller.js',
  'coordinator/player-queue-controller.js', 'coordinator/player-controls-controller.js', 'coordinator/playback-controller.js',
  'coordinator/player-subtitle-editor-controller.js', 'coordinator/player-feature-controller.js', 'coordinator/player-composition.js'
];

var MODULE_FILES = [
  'plex-feature-ports.js',
  'presentation-services.js',
  'input-command-router.js',
  'choice-dialog-controller.js',
  'media-info-dialog-controller.js',
  'settings-controller.js',
  'settings-feature-controller.js',
  'diagnostics-controller.js',
  'diagnostics-feature-controller.js',
  'setup-feature-controller.js',
  'server-controller.js',
  'server-feature-controller.js',
  'plex-source-router.js',
  'media-source-resolver.js',
  'library-sources-controller.js',
  'multi-server-content-controller.js',
  'search-controller.js',
  'search-feature-controller.js',
  'shell-controller.js',
  'shell-feature-controller.js',
  'library-controller.js',
  'library-tab-prefetch.js',
  '../library-grid-view.js',
  'library-feature-controller.js',
  'detail-controller.js',
  'detail-feature-controller.js',
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

function readPreludeFiles(root, files) {
  return (files || PRELUDE_FILES).map(function (fileName) {
    return compactSource(fs.readFileSync(path.join(root, 'app', fileName), 'utf8'));
  });
}

function readSourceBundle(root, moduleFiles) {
  var parts = moduleFiles ? [] : readPreludeFiles(root);
  return bundle(parts.concat(readFiles(root, moduleFiles || MODULE_FILES)));
}

function readBundle(root, moduleFiles) {
  return Minifier.minifySource(readSourceBundle(root, moduleFiles));
}

function readPlayerSourceBundle(root) {
  return bundle(readPreludeFiles(root, PLAYER_FILES));
}

function readPlayerBundle(root) { return Minifier.minifySource(readPlayerSourceBundle(root)); }

function outputPath(root) {
  return path.join(root, 'app', 'app.js');
}

function check(root) {
  var target = outputPath(root);
  var playerTarget = path.join(root, 'app', 'player.js');
  return fs.existsSync(target) && fs.readFileSync(target, 'utf8') === readBundle(root) &&
    fs.existsSync(playerTarget) && fs.readFileSync(playerTarget, 'utf8') === readPlayerBundle(root);
}

function write(root) {
  var target = outputPath(root);
  // Assemble both first, so a bad manifest cannot leave a half-rebuilt pair.
  var core = readBundle(root);
  var player = readPlayerBundle(root);
  fs.writeFileSync(target, core, 'utf8');
  fs.writeFileSync(path.join(root, 'app', 'player.js'), player, 'utf8');
  return target;
}

if (require.main === module) {
  var projectRoot = path.resolve(__dirname, '..');
  if (process.argv.indexOf('--check') !== -1) {
    if (!check(projectRoot)) {
      console.error('Application bundles (app/app.js, app/player.js) are stale. Run: npm run build:app');
      process.exitCode = 1;
    } else {
      console.log('Core and Player bundles are current');
    }
  } else {
    console.log('Built ' + path.relative(projectRoot, write(projectRoot)) + ' and app/player.js');
  }
}

module.exports = {
  PRELUDE_FILES: PRELUDE_FILES,
  MODULE_FILES: MODULE_FILES,
  PLAYER_FILES: PLAYER_FILES,
  readPlayerSourceBundle: readPlayerSourceBundle,
  readPlayerBundle: readPlayerBundle,
  bundle: bundle,
  compactSource: compactSource,
  check: check,
  readBundle: readBundle,
  readSourceBundle: readSourceBundle,
  write: write
};
