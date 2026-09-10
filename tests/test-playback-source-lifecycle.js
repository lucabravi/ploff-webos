'use strict';
var assert = require('assert');
var PlaybackSession = require('../app/playback-session');

(function replacementReadinessBelongsToTheAssignedSource() {
  var session = PlaybackSession.create();
  session.prepare();
  session.beginStreamSwitch('starting');
  assert.strictEqual(session.nativeSourceAssigned(), false);
  session.markSourceAssigned();
  assert.strictEqual(session.nativeSourceAssigned(), true);
  assert.strictEqual(session.nativeSourceReady(), false, 'source assignment is not decoder readiness');
  session.markSourceReady();
  session.markPlaying();
  session.beginStreamSwitch('recovering');
  assert.strictEqual(session.nativeSourceAssigned(), false, 'preparation cannot expose its predecessor as an assigned source');
  assert.strictEqual(session.nativeSourceReady(), false);
  assert.strictEqual(session.shouldRejectPlaying(), true);
  session.markSourceAssigned();
  assert.strictEqual(session.shouldRejectPlaying(), true, 'assignment alone cannot release a stale playing event');
  session.markSourceReady();
  assert.strictEqual(session.shouldRejectPlaying(), false);
  session.markPlaying();
  session.resetForClose(true);
  assert.strictEqual(session.nativeSourceAssigned(), false);
  assert.strictEqual(session.nativeSourceReady(), false);
  session.destroy();
  assert.strictEqual(session.nativeSourceAssigned(), false);
}());

(function replacingAnAssignedButNotYetReadySourceStillRejectsOldPlayback() {
  var session = PlaybackSession.create();
  session.beginStreamSwitch('starting');
  session.markSourceAssigned();
  session.beginStreamSwitch('recovering');
  assert.strictEqual(session.shouldRejectPlaying(), true);
  session.markSourceAssigned();
  session.markSourceReady();
  assert.strictEqual(session.shouldRejectPlaying(), false);
  session.resetRuntime();
  assert.strictEqual(session.nativeSourceAssigned(), false);
}());

console.log('Playback source lifecycle checks passed');
