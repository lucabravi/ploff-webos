'use strict';
var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');
var Composition = require('../app/coordinator/player-composition');
var createHarness = require('./helpers/player-feature-controller-harness').createHarness;
(function definitionDoesNotReadPlayerGlobalsOrCreateResources() {
  var context = {};
  ['PloffPlayerFeatureController', 'PloffPlaybackController', 'PloffAssSubtitleRendererPool'].forEach(function (name) {
    Object.defineProperty(context, name, { get: function () { throw new Error('premature read: ' + name); } });
  });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../app/coordinator/player-composition.js'), 'utf8'), context);
  assert.strictEqual(typeof context.PloffPlayerComposition.create, 'function');
}());
(function mapsAllRequiredCapabilitiesAndForwardsPortsWithoutCopyingTheirState() {
  var names = [
    'PlaybackController', 'PlaybackQueueController', 'PlayerQueueController', 'InputCommandRouter',
    'PlayerSubtitleEditorController', 'QueueSequenceContract', 'BoundedQueueCache', 'SeriesQueueProvider',
    'PlexContainerQueueProvider', 'QueueGapController', 'QueueGapView', 'PlayerControlsController',
    'PlaybackQueueModel', 'PlayerControlsState', 'PlayerControlsView', 'PlayerChaptersView', 'PlayerBufferingIndicator',
    'ChapterState', 'SkipMarkerState', 'PlaybackClock', 'PlaybackRecovery', 'NativeVideoDriver',
    'PlaybackReposition', 'PlaybackSession', 'PlaybackTimeline', 'SubtitleRuntime', 'PlaybackStrategy',
    'PlayerSeekController', 'PlayerTimelinePolicy', 'EpisodeNavigation', 'ResumeChoice', 'SubtitleSync',
    'SubtitleEditorSession', 'SubtitleEditorView', 'SubtitleOffsetStore', 'SubtitleSeriesOffset',
    'SubtitleStyleDialog', 'Settings', 'VersionSelection', 'MediaInfo', 'MediaProfile', 'MediaChoiceModel',
    'ProgressiveImages', 'UpNextState', 'UpNextTiming', 'UpNextView'
  ];
  var root = {};
  var received;
  var feature = {};
  var ports = { assRendererPool: { create: function () {} } };
  ['platform', 'data', 'shell', 'detail', 'library', 'dialogs', 'settings', 'diagnostics', 'state'].forEach(function (name) { ports[name] = {}; });
  names.forEach(function (name) { root['Ploff' + name] = { name: name }; });
  root.PloffPlayerFeatureController = { create: function (options) { received = options; return feature; } };
  assert.strictEqual(Composition.create(root, ports), feature);
  assert.deepStrictEqual(Object.keys(received.modules).sort(), names.concat('AssSubtitleRenderer').sort());
  names.forEach(function (name) { assert.strictEqual(received.modules[name], root['Ploff' + name], name); });
  assert.strictEqual(received.modules.AssSubtitleRenderer, ports.assRendererPool, 'reuse the application pool, never construct a replacement worker');
  Object.keys(ports).filter(function (name) { return name !== 'assRendererPool'; }).forEach(function (name) { assert.strictEqual(received[name], ports[name]); });
}());
(function realPlayerFeatureCanBeConstructedThroughTheNewCompositionBoundary() {
  var compositionCalls = 0;
  var h = createHarness({ createFeature: function (options) {
    var root = options.platform.root;
    Object.keys(options.modules).forEach(function (name) { root['Ploff' + name] = options.modules[name]; });
    root.PloffPlayerFeatureController = require('../app/coordinator/player-feature-controller');
    options.assRendererPool = options.modules.AssSubtitleRenderer;
    compositionCalls += 1;
    return Composition.create(root, options);
  } });
  assert.strictEqual(compositionCalls, 1);
  assert.deepStrictEqual(h.creates, { queue: 1, playerQueue: 1, playback: 1, controls: 1, subtitleEditor: 1, gapView: 1 });
  h.controller.destroy();
  assert.deepStrictEqual(h.destroyed, ['controls', 'subtitle-editor', 'playback', 'player-queue', 'queue']);
}());
console.log('Player composition capability and real feature checks passed');
