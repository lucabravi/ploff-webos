/* Behavioral checks of the queue-to-screen lifecycle boundary. */
'use strict';
var assert = require('assert');
var Harness = require('./helpers/player-feature-controller-harness');
var failures = 0;
function test(name, run) {
  try { run(); console.log('PASS ' + name); }
  catch (error) { failures += 1; console.error('FAIL ' + name + '\n' + error.stack); }
}
function fixture() {
  var pending;
  var h = Harness.createHarness({
    data: { config: { apiBaseUrl: 'https://a.example' } },
    waitForDetail: function (item, callback) { pending = callback; },
    detail: {
      setPlaybackContext: function () { h.calls.push(['set-playback-context']); },
      queueMediaProfile: function () {}, renderEpisodeContext: function () {}
    }
  });
  return { h: h, finish: function () { pending(null, { ratingKey: 'next' }); } };
}

test('closing the Player retires a pending queue-to-playback handoff', function () {
  var f = fixture();
  f.h.captured.queueOptions.requestPlayback({ item: { ratingKey: 'next' } });
  f.h.captured.controlsOptions.closePlayer();
  f.finish();
  assert.strictEqual(f.h.calls.filter(function (call) { return call[0] === 'set-playback-context'; }).length, 0);
  f.h.controller.destroy();
});

test('a new playback retires the preceding queue-to-playback handoff', function () {
  var f = fixture();
  f.h.captured.queueOptions.requestPlayback({ item: { ratingKey: 'next' } });
  f.h.captured.playbackOptions.onOpening();
  f.finish();
  assert.strictEqual(f.h.calls.filter(function (call) { return call[0] === 'set-playback-context'; }).length, 0);
  f.h.controller.destroy();
});

test('a delayed stopped report cannot clear the new playback end-pause UI', function () {
  var h = Harness.createHarness();
  h.captured.playbackOptions.onEnded();
  h.captured.queueOptions.onUpNextCancelled({ action: 'home' });
  assert.strictEqual(h.nodes['player-end-pause'].className, 'player-end-pause');
  h.captured.playbackOptions.onClosed(80, false, 'previous');
  assert.strictEqual(h.nodes['player-end-pause'].className, 'player-end-pause', 'the active playback owns its own end state');
  h.controller.destroy();
});

if (failures) { throw new Error(failures + ' Player feature lifecycle regressions'); }
console.log('Player feature lifecycle checks passed');
