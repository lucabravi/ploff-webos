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
    'mark-watched', 'mark-unwatched', 'clear-progress', 'play-beginning', 'remove-continue'
  ], 'partially watched Continue Watching media must expose watched, unwatched, progress, restart, and removal actions');
  assert.strictEqual(controller.startHold(), true);
  assert.strictEqual(controller.holding(), true);
  assert.strictEqual(controller.releaseHold(), false, 'releasing before the hold threshold must preserve normal short-press activation');
  assert.strictEqual(dialog, null);
  assert.strictEqual(controller.startHold(), true);
  root.run(800);
  assert.ok(dialog && dialog.variant === 'media-context', 'long press must open the shared vertical choice dialog');
  assert.strictEqual(dialog.title, 'Actions · Movie');
  assert.strictEqual(controller.releaseHold(), true, 'release after the dialog opens must suppress the normal short-press action');

  target = { item: { ratingKey: '13', type: 'episode', title: 'Partial by percent', viewed: false, viewOffset: 0, progress: 25 }, inContinueWatching: false };
  assert.deepStrictEqual(controller.choicesFor(target).map(function (choice) { return choice.value; }), [
    'mark-watched', 'mark-unwatched', 'clear-progress', 'play-beginning'
  ], 'progress metadata must count as partial playback even when viewOffset is temporarily absent');
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
    transport: {
      setWatchedAndReset: function (config, key, watched, cb) { return request('watched', [key, watched], cb); },
      resetProgress: function (config, key, cb) { return request('progress', [key], cb); },
      removeFromContinueWatching: function (config, key, cb) { return request('remove', [key], cb); }
    },
    config: { apiBaseUrl: '/plex' },
    openChoice: function (options) { dialog = options; return true; },
    playFromBeginning: function (item, sourceContext) { calls.push(['play', item.ratingKey, sourceContext && sourceContext.sourceId || '']); },
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
  dialog.apply({ value: 'mark-watched' });
  callback(new Error('progress reset failed'), { watchedApplied: true, progressReset: false });
  assert.deepStrictEqual(calls.slice(1), [['refresh'], ['message', 'mediaActions.error']],
    'a partial watched mutation must refresh authoritative Plex state before reporting the error');

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
  target.sourceContext = { sourceId: 'server-b|4', serverMachineIdentifier: 'server-b' };
  controller.open();
  dialog.apply({ value: 'play-beginning' });
  assert.deepStrictEqual(calls, [['play', '20', 'server-b|4']],
    'Play from beginning must preserve the originating Plex source without clearing progress first');
}());

(function testSupersededMutationCannotPublishLateCompletion() {
  var callbacks = [];
  var aborts = 0;
  var refreshes = [];
  var messages = [];
  var completions = [];
  var first = { item: { ratingKey: '31', type: 'movie', title: 'First' }, inContinueWatching: true };
  var second = { item: { ratingKey: '32', type: 'movie', title: 'Second' }, inContinueWatching: true };
  var controller = MediaContextController.create({
    root: timerRoot(),
    transport: {
      removeFromContinueWatching: function (_config, key, callback) {
        callbacks.push({ key: key, callback: callback });
        return { abort: function () { aborts += 1; } };
      }
    },
    refresh: function (target) { refreshes.push(target.item.ratingKey); },
    showMessage: function (message) { messages.push(message); },
    t: function (key) { return key; }
  });

  assert.strictEqual(controller.removeFromContinueWatching(first, function () { completions.push('first'); }), true);
  assert.strictEqual(controller.removeFromContinueWatching(second, function () { completions.push('second'); }), true);
  assert.strictEqual(aborts, 1, 'starting a newer mutation must abort the previous transport request');

  callbacks[0].callback(null);
  assert.deepStrictEqual(refreshes, [], 'a superseded transport callback must not refresh the stale media target');
  assert.deepStrictEqual(messages, [], 'a superseded transport callback must not publish stale success UI');
  assert.deepStrictEqual(completions, [], 'a superseded transport callback must not complete the stale caller');

  callbacks[1].callback(null);
  assert.deepStrictEqual(refreshes, ['32'], 'only the latest mutation may refresh application state');
  assert.deepStrictEqual(messages, ['mediaActions.updated']);
  assert.deepStrictEqual(completions, ['second']);
}());

(function testIdentityResetCancelsPendingMutation() {
  var callback = null;
  var aborts = 0;
  var refreshes = 0;
  var messages = 0;
  var completions = 0;
  var target = { item: { ratingKey: 'identity-41', type: 'movie', title: 'Old profile' }, inContinueWatching: true };
  var controller = MediaContextController.create({
    root: timerRoot(),
    transport: {
      removeFromContinueWatching: function (_config, _key, done) {
        callback = done;
        return { abort: function () { aborts += 1; } };
      }
    },
    refresh: function () { refreshes += 1; },
    showMessage: function () { messages += 1; },
    t: function (key) { return key; }
  });

  assert.strictEqual(controller.removeFromContinueWatching(target, function () { completions += 1; }), true);
  assert.strictEqual(typeof controller.reset, 'function', 'media-context ownership must expose a reset boundary for Plex identity changes');
  controller.reset();
  assert.strictEqual(aborts, 1, 'identity reset must abort the old profile mutation');
  callback(null);
  assert.strictEqual(refreshes, 0, 'a mutation completed after identity reset must not reconcile the new profile UI');
  assert.strictEqual(messages, 0, 'a mutation completed after identity reset must not publish stale success UI');
  assert.strictEqual(completions, 0, 'a mutation completed after identity reset must not complete the old caller');
}());

(function testTargetTransportOverridesPrimaryConfig() {
  var usedConfig = null;
  var target = {
    item: { ratingKey: 'shared-20', type: 'movie', title: 'Shared' },
    inContinueWatching: true,
    config: { apiBaseUrl: 'https://relay-b.example', token: 'shared-token-b' }
  };
  var controller = MediaContextController.create({
    root: timerRoot(),
    config: { apiBaseUrl: 'https://primary.example', token: 'primary-token' },
    transport: {
      removeFromContinueWatching: function (config, _key, callback) { usedConfig = config; callback(null); return null; }
    },
    refresh: function () {}, showMessage: function () {}, t: function (key) { return key; }
  });
  assert.strictEqual(controller.removeFromContinueWatching(target, function () {}), true);
  assert.strictEqual(usedConfig.apiBaseUrl, 'https://relay-b.example', 'media-context mutations must honor a source-scoped target config');
  assert.strictEqual(usedConfig.token, 'shared-token-b');
}());


(function testIdentityResetRetiresOpenContextDialogCallbacks() {
  var dialog = null;
  var plays = [];
  var mutations = [];
  var focusRestores = 0;
  var target = {
    item: { ratingKey: 'old-profile-51', type: 'movie', title: 'Old profile movie', viewed: false, viewOffset: 12000 },
    sourceContext: { sourceId: 'old-server|1', serverMachineIdentifier: 'old-server' },
    config: { apiBaseUrl: 'https://old.example', token: 'old-token' }
  };
  var controller = MediaContextController.create({
    root: timerRoot(),
    resolveTarget: function () { return target; },
    openChoice: function (options) { dialog = options; return true; },
    playFromBeginning: function (item, sourceContext) { plays.push([item.ratingKey, sourceContext && sourceContext.sourceId]); },
    restoreFocus: function () { focusRestores += 1; },
    transport: {
      setWatchedAndReset: function (config, key, watched, callback) {
        mutations.push([config.apiBaseUrl, key, watched]);
        callback(null);
        return null;
      }
    },
    refresh: function () {},
    showMessage: function () {},
    mediaTitle: function (item) { return item.title; },
    t: function (key) { return key; }
  });

  assert.strictEqual(controller.open(target), true);
  assert.ok(dialog && typeof dialog.apply === 'function' && typeof dialog.returnFocus === 'function');
  controller.reset();
  dialog.apply({ value: 'play-beginning' });
  dialog.apply({ value: 'mark-watched' });
  dialog.returnFocus();
  assert.deepStrictEqual(plays, [], 'identity reset must retire Play from beginning captured by an old media-context dialog');
  assert.deepStrictEqual(mutations, [], 'identity reset must retire mutations captured by an old media-context dialog');
  assert.strictEqual(focusRestores, 0, 'identity reset must not restore focus through a dialog owned by the old identity');
}());

console.log('Media context controller checks passed');
