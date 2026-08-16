'use strict';

var assert = require('assert');
var MediaContextController = require('../app/coordinator/media-context-controller');

function timerRoot() {
  var next = 1;
  var timers = {};
  return {
    timers: timers,
    setTimeout: function (callback, delay) { var id = next++; timers[id] = { callback: callback, delay: delay }; return id; },
    clearTimeout: function (id) { delete timers[id]; },
    run: function (delay) {
      Object.keys(timers).map(Number).forEach(function (id) {
        if (timers[id] && timers[id].delay === delay) {
          var callback = timers[id].callback;
          delete timers[id];
          callback();
        }
      });
    }
  };
}

(function testDynamicChoicesAndHoldSemantics() {
  var root = timerRoot();
  var target = { item: { ratingKey: '10', type: 'movie', title: 'Movie', viewed: false, viewOffset: 12000 }, inContinueWatching: true };
  var dialog = null;
  var controller = MediaContextController.create({
    root: root,
    holdDelay: 800,
    resolveTarget: function () { return target; },
    openChoice: function (options) { dialog = options; return true; },
    mediaTitle: function (item) { return item.title; },
    t: function (key, values) { return key === 'mediaActions.title' ? 'Actions · ' + values.title : key; }
  });
  assert.deepStrictEqual(controller.choicesFor(target).map(function (choice) { return choice.value; }), [
    'mark-watched', 'clear-progress', 'play-beginning', 'remove-continue'
  ], 'partially watched Continue Watching media must expose only meaningful contextual actions');
  assert.strictEqual(controller.startHold(), true);
  assert.strictEqual(controller.holding(), true);
  assert.strictEqual(controller.releaseHold(), false, 'releasing before the hold threshold must preserve normal short-press activation');
  assert.strictEqual(dialog, null);
  assert.strictEqual(controller.startHold(), true);
  root.run(800);
  assert.ok(dialog && dialog.variant === 'media-context', 'long press must open the shared vertical choice dialog');
  assert.strictEqual(dialog.title, 'Actions · Movie');
  assert.strictEqual(controller.releaseHold(), true, 'release after the dialog opens must suppress the normal short-press action');

  target = { item: { ratingKey: '11', type: 'episode', title: 'Episode', viewed: true, viewOffset: 0 }, inContinueWatching: false };
  assert.deepStrictEqual(controller.choicesFor(target).map(function (choice) { return choice.value; }), [
    'mark-unwatched'
  ], 'watched media without resume progress must hide redundant progress, restart, and removal actions');
  target = { item: { ratingKey: '12', type: 'show', title: 'Show' }, inContinueWatching: true };
  assert.deepStrictEqual(controller.choicesFor(target), [], 'bulk show operations must stay out of the first contextual-action tranche');
}());

(function testActionExecutionUsesDistinctPlexOperations() {
  var root = timerRoot();
  var calls = [];
  var dialog;
  var callback;
  var target = { item: { ratingKey: '20', type: 'episode', title: 'Episode', viewed: false, viewOffset: 45000 }, inContinueWatching: true };
  function request(name, args, cb) { calls.push([name].concat(args)); callback = cb; return { abort: function () { calls.push(['abort']); } }; }
  var controller = MediaContextController.create({
    root: root,
    resolveTarget: function () { return target; },
    PlexClient: {
      setWatchedAndReset: function (config, key, watched, cb) { return request('watched', [key, watched], cb); },
      resetProgress: function (config, key, cb) { return request('progress', [key], cb); },
      removeFromContinueWatching: function (config, key, cb) { return request('remove', [key], cb); }
    },
    config: { apiBaseUrl: '/plex' },
    openChoice: function (options) { dialog = options; return true; },
    playFromBeginning: function (item) { calls.push(['play', item.ratingKey]); },
    refresh: function () { calls.push(['refresh']); },
    restoreFocus: function () { calls.push(['focus']); },
    showMessage: function (message) { calls.push(['message', message]); },
    mediaTitle: function (item) { return item.title; },
    t: function (key) { return key; }
  });

  controller.open();
  dialog.apply({ value: 'mark-watched' });
  assert.deepStrictEqual(calls[0], ['watched', '20', true]);
  callback(null);
  assert.deepStrictEqual(calls.slice(1), [['refresh'], ['message', 'mediaActions.updated']]);

  calls.length = 0;
  controller.open();
  dialog.apply({ value: 'clear-progress' });
  assert.deepStrictEqual(calls[0], ['progress', '20']);
  callback(null);
  assert.ok(calls.some(function (entry) { return entry[0] === 'refresh'; }));

  calls.length = 0;
  controller.open();
  dialog.apply({ value: 'remove-continue' });
  assert.deepStrictEqual(calls[0], ['remove', '20'], 'Continue Watching removal must use its dedicated PMS action');
  callback(new Error('fail'));
  assert.deepStrictEqual(calls.slice(1), [['message', 'mediaActions.error']], 'failed mutations must not refresh stale optimistic state');

  calls.length = 0;
  var completionError = 'pending';
  assert.strictEqual(controller.removeFromContinueWatching(target, function (error) { completionError = error; }), true, 'the shared Continue Watching mutation port must accept a completion callback');
  assert.deepStrictEqual(calls[0], ['remove', '20']);
  callback(null);
  assert.strictEqual(completionError, null, 'the shared mutation port must report successful completion');
  assert.ok(calls.some(function (entry) { return entry[0] === 'refresh'; }));

  calls.length = 0;
  controller.open();
  dialog.apply({ value: 'play-beginning' });
  assert.deepStrictEqual(calls, [['play', '20']], 'Play from beginning must not clear stored progress before playback starts');
}());

console.log('Media context controller checks passed');
