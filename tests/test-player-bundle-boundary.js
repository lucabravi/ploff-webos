'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var Builder = require('../scripts/build-app');
var root = path.join(__dirname, '..');
var playerFiles = [
  'skip-marker-state.js', 'player-controls-state.js', 'player-controls-view.js', 'player-buffering-indicator.js',
  'chapter-state.js', 'player-chapters-view.js', 'playback-recovery.js', 'playback-clock.js', 'native-video-driver.js',
  'player-seek-controller.js', 'playback-reposition.js', 'playback-session.js', 'playback-timeline.js',
  'episode-navigation.js', 'resume-choice.js', 'subtitle-sync.js', 'subtitle-runtime.js', 'subtitle-editor-session.js',
  'subtitle-editor-view.js', 'subtitle-offset-store.js', 'up-next-state.js', 'up-next-timing.js', 'up-next-view.js', 'queue-gap-view.js',
  'coordinator/queue-sequence-contract.js', 'coordinator/bounded-queue-cache.js', 'coordinator/plex-container-queue-provider.js',
  'coordinator/series-queue-provider.js', 'coordinator/queue-gap-controller.js', 'coordinator/playback-queue-controller.js',
  'coordinator/player-queue-controller.js', 'coordinator/player-controls-controller.js', 'coordinator/playback-controller.js',
  'coordinator/player-subtitle-editor-controller.js', 'coordinator/player-feature-controller.js', 'coordinator/player-composition.js'
];
assert.deepStrictEqual(Builder.PLAYER_FILES, playerFiles, 'one ordered authoritative Player manifest must define the deferred closure');
var html = fs.readFileSync(path.join(root, 'app/index.html'), 'utf8');
var scripts = Array.from(html.matchAll(/<script[^>]+src="([^"?]+)/g), function (match) { return match[1]; });
playerFiles.forEach(function (name) { assert.strictEqual(scripts.indexOf(name), -1, name + ' must not load statically'); });
assert.strictEqual(scripts.indexOf('player.js'), -1, 'generated Player bundle must not load statically');
var context = vm.createContext({ console: console, setTimeout: setTimeout, clearTimeout: clearTimeout, navigator: { userAgent: 'webOS test' }, location: { protocol: 'file:' } });
context.window = context;
context.self = context;
scripts.forEach(function (name) { vm.runInContext(fs.readFileSync(path.join(root, 'app', name), 'utf8'), context, { filename: name }); });
[
  'PlayerFeatureController', 'PlayerComposition', 'PlaybackController', 'PlaybackQueueController', 'PlayerQueueController',
  'PlayerControlsController', 'PlayerSubtitleEditorController', 'NativeVideoDriver', 'PlaybackReposition', 'PlaybackSession',
  'PlaybackTimeline', 'SubtitleRuntime', 'SubtitleSync', 'UpNextView'
].forEach(function (name) { assert.strictEqual(context['Ploff' + name], undefined, name + ' must be absent after actual Core script evaluation'); });
[
  'ApplicationController', 'PlayerRuntimeLoader', 'VersionSelection', 'PlaybackStrategy', 'PlayerTimelinePolicy',
  'PlaybackQueueModel', 'AssSubtitleRenderer', 'AssSubtitleRendererPool', 'AssSubtitlePrefetch', 'StartupMetrics'
].forEach(function (name) { assert.ok(context['Ploff' + name], name + ' must remain available to Core'); });
vm.runInContext(Builder.readPlayerBundle(root), context, { filename: 'player.js' });
assert.strictEqual(typeof context.PloffPlayerComposition.create, 'function');
assert.strictEqual(typeof context.PloffPlayerFeatureController.create, 'function');
assert.strictEqual(typeof context.PloffNativeVideoDriver.create, 'function');
assert.strictEqual(Builder.readPlayerBundle(root), fs.readFileSync(path.join(root, 'app/player.js'), 'utf8'));
assert.strictEqual(Builder.check(root), true, 'both generated bundles must be fresh');
console.log('Real Core/Player browser bundle boundary checks passed');
