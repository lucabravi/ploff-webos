'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var root = path.join(__dirname, '..');
var coordinatorRoot = path.join(root, 'app', 'coordinator');
var controllerFiles = [
  'application-controller.js',
  'choice-dialog-controller.js',
  'media-info-dialog-controller.js',
  'shell-controller.js',
  'shell-feature-controller.js',
  'search-controller.js',
  'search-feature-controller.js',
  'library-controller.js',
  'library-feature-controller.js',
  'settings-controller.js',
  'settings-feature-controller.js',
  'server-controller.js',
  'server-feature-controller.js',
  'setup-feature-controller.js',
  'diagnostics-controller.js',
  'diagnostics-feature-controller.js',
  'detail-controller.js',
  'detail-feature-controller.js',
  'playback-queue-controller.js',
  'player-controls-controller.js',
  'player-feature-controller.js',
  'playback-controller.js',
  'input-controller.js',
  'pointer-controller.js'
];

assert.strictEqual(fs.existsSync(path.join(coordinatorRoot, 'choice-dialog-controller.js')), true, 'choice-dialog-controller.js must exist');
assert.strictEqual(fs.existsSync(path.join(coordinatorRoot, 'media-info-dialog-controller.js')), true, 'media-info-dialog-controller.js must exist');
assert.strictEqual(fs.existsSync(path.join(coordinatorRoot, 'shell-feature-controller.js')), true, 'shell-feature-controller.js must exist');
assert.strictEqual(fs.existsSync(path.join(coordinatorRoot, 'library-feature-controller.js')), true, 'library-feature-controller.js must exist');
assert.strictEqual(fs.existsSync(path.join(coordinatorRoot, 'settings-feature-controller.js')), true, 'settings-feature-controller.js must exist');
assert.strictEqual(fs.existsSync(path.join(coordinatorRoot, 'diagnostics-feature-controller.js')), true, 'diagnostics-feature-controller.js must exist');
assert.strictEqual(fs.existsSync(path.join(coordinatorRoot, 'setup-feature-controller.js')), true, 'setup-feature-controller.js must exist');
assert.strictEqual(fs.existsSync(path.join(coordinatorRoot, 'server-feature-controller.js')), true, 'server-feature-controller.js must exist');
assert.strictEqual(fs.existsSync(path.join(coordinatorRoot, 'detail-feature-controller.js')), true, 'detail-feature-controller.js must exist');
assert.strictEqual(fs.existsSync(path.join(coordinatorRoot, 'player-feature-controller.js')), true, 'player-feature-controller.js must exist');

controllerFiles.forEach(function (filename) {
  var modulePath = path.join(coordinatorRoot, filename);
  var exported;

  if (!fs.existsSync(modulePath)) {
    return;
  }

  exported = require(modulePath);
  assert(exported && typeof exported === 'object', filename + ' must export an object');
  assert.strictEqual(typeof exported.create, 'function', filename + ' must export create()');
});



(function playbackPublicContractRemainsStable() {
  var PlaybackController = require(path.join(coordinatorRoot, 'playback-controller.js'));
  var video = {
    paused: true,
    addEventListener: function () {},
    removeEventListener: function () {},
    pause: function () {},
    removeAttribute: function () {},
    load: function () {},
    buffered: { length: 0 },
    seekable: { length: 0 }
  };
  var controller = PlaybackController.create({
    root: {},
    document: {},
    video: video,
    PlexClient: {},
    PlaybackClock: { create: function () { return {}; } },
    PlaybackRecovery: { create: function () { return { plan: [], index: 0, status: 'idle', attempts: 0 }; } },
    PlaybackStrategy: {},
    PlayerSeekController: {},
    PlayerTimelinePolicy: {},
    PlayerBufferingIndicator: { create: function () { return { stop: function () {}, signal: function () {} }; } },
    SubtitleSync: {},
    SubtitleOffsetStore: {}
  });
  assert.deepStrictEqual(Object.keys(controller).sort(), [
    'applySubtitleEditor', 'cancelSubtitleEditor', 'changeTrack', 'changeVersion', 'close', 'destroy',
    'diagnostics', 'open', 'openSubtitleEditor', 'seekAbsolute', 'snapshot', 'startAdjacent', 'startItem', 'toggle'
  ], 'PlaybackController public methods must remain unchanged during composition-root cleanup');
  controller.destroy();
}());

var bootstrap = require(path.join(coordinatorRoot, 'application-bootstrap.js'));
assert(bootstrap && typeof bootstrap.start === 'function', 'application-bootstrap.js must export start()');

console.log('Controller contract checks passed');
