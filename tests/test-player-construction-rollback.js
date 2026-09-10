'use strict';
var assert = require('assert');
var createHarness = require('./helpers/player-feature-controller-harness').createHarness;

(function partialConstructionReleasesEveryCompletedOwnerInReverseOrder() {
  var original = new Error('controls construction failed');
  var fixture;
  assert.throws(function () {
    createHarness({ prepare: function (options, state) {
      fixture = state;
      options.modules.PlayerControlsController = { create: function () { throw original; } };
      options.modules.QueueGapController = { create: function () { return { destroy: function () { state.destroyed.push('gap'); } }; } };
      state.playback.destroy = function () { state.destroyed.push('playback'); throw new Error('cleanup failed'); };
    } });
  }, function (error) { return error === original; }, 'cleanup must retain the original constructor failure');
  assert.deepStrictEqual(fixture.destroyed, ['subtitle-editor', 'playback', 'player-queue', 'queue', 'gap'],
    'all completed Player owners must roll back even when one teardown throws');
}());

(function bindingFailureRemovesAlreadyInstalledListenersAndCallbacks() {
  var fixture;
  var original = new Error('binding failed');
  assert.throws(function () {
    createHarness({ prepare: function (_options, state) {
      fixture = state;
      var get = state.document.getElementById;
      state.document.getElementById = function (id) {
        if (id === 'player-next') { throw original; }
        return get(id);
      };
    } });
  }, function (error) { return error === original; });
  assert.strictEqual(fixture.nodes['player-video'].listener('click'), null);
  assert.strictEqual(fixture.nodes['player-previous'].onclick, null);
  assert.strictEqual(fixture.nodes['player-toggle'].onclick, null);
  assert.deepStrictEqual(fixture.destroyed, ['controls', 'subtitle-editor', 'playback', 'player-queue', 'queue']);
}());
(function failedInitialTranslationRollsBackWithoutCancellingCoreAssWork() {
  var fixture;
  var original = new Error('translation failed');
  var cancelled = 0;
  assert.throws(function () {
    createHarness({ prepare: function (options, state) {
      fixture = state;
      options.shell.setText = function () { throw original; };
      options.data.cancelAssPrefetch = function () { cancelled += 1; };
    } });
  }, function (error) { return error === original; });
  assert.strictEqual(cancelled, 0);
  assert.strictEqual(fixture.nodes['player-video'].listener('click'), null);
  assert.strictEqual(fixture.nodes['player-next'].onclick, null);
  assert.deepStrictEqual(fixture.destroyed, ['controls', 'subtitle-editor', 'playback', 'player-queue', 'queue']);
}());
console.log('Player partial-construction rollback checks passed');
