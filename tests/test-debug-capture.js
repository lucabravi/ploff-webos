'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var modulePath = path.join(__dirname, '..', 'app', 'debug-capture.js');
var DebugCapture;

assert.ok(fs.existsSync(modulePath), 'debug capture module must exist before its behavior can be verified');
DebugCapture = require('../app/debug-capture');

(function staysCompletelyInactiveUntilExplicitlyStarted() {
  var capture = DebugCapture.create({ now: function () { return 100; }, wallNow: function () { return 1000; } });
  assert.strictEqual(capture.isActive(), false, 'collector must expose a zero-allocation inactive gate for hot paths');
  assert.deepStrictEqual(capture.status(), {
    active: false,
    unbounded: true,
    eventCount: 0,
    generation: 0,
    startedAt: null,
    stoppedAt: null
  });
  assert.strictEqual(capture.record('playback', 'waiting', { publicTime: 10 }), false,
    'normal Ploff startup must not retain raw debug events');
  assert.strictEqual(capture.mark('should-not-exist'), false,
    'manual markers must also be no-ops before explicit start');
  assert.deepStrictEqual(capture.export().events, [], 'inactive capture must export no historical trace');
}());

(function capturesUnboundedPrivacySafeEventsOnlyAfterStart() {
  var now = 5000;
  var wall = 100000;
  var capture = DebugCapture.create({ now: function () { return now; }, wallNow: function () { return wall; } });
  var index;
  var exported;
  assert.strictEqual(capture.start(), true);
  assert.strictEqual(capture.isActive(), true);
  assert.strictEqual(capture.status().active, true);
  assert.strictEqual(capture.status().generation, 1);
  assert.strictEqual(capture.record('playback', 'buffer-start', {
    atMs: 999999,
    sourceGeneration: 7,
    bufferGeneration: 3,
    nativeTime: 97.194,
    publicTime: 1004.194,
    offsetBase: 907,
    readyState: 2,
    paused: false,
    reason: 'waiting',
    sourceUrl: 'http://10.0.0.2/video?X-Plex-Token=secret',
    token: 'secret',
    arbitrary: 'must-not-leak'
  }), true);
  assert.strictEqual(capture.mark('desync-visible'), true);
  for (index = 0; index < 1500; index += 1) {
    now += 100;
    wall += 100;
    capture.record('ass', 'controller', { requestedTime: index, playbackEpoch: 2, renderGeneration: 5 });
  }
  now += 120000;
  wall += 120000;
  capture.record('playback', 'still-recording', { publicTime: 1200 });
  exported = capture.export();
  assert.strictEqual(exported.schema, 1);
  assert.strictEqual(exported.active, true);
  assert.strictEqual(exported.unbounded, true);
  assert.ok(exported.events.length >= 1503,
    'debug capture must not evict by the historical 1024-entry or 60-second limits');
  assert.strictEqual(exported.events[0].event, 'capture-start');
  assert.strictEqual(exported.events[1].event, 'buffer-start');
  assert.strictEqual(exported.events[1].sourceGeneration, 7);
  assert.strictEqual(exported.events[1].atMs, 0, 'payloads must not overwrite collector-owned relative time');
  assert.strictEqual(exported.events[1].reason, 'waiting');
  assert.strictEqual(exported.events[1].sourceUrl, undefined, 'raw source URLs must never cross the debug capture boundary');
  assert.strictEqual(exported.events[1].token, undefined, 'Plex tokens must never cross the debug capture boundary');
  assert.strictEqual(exported.events[1].arbitrary, undefined, 'unknown payload keys must be rejected by allowlist');
  assert.strictEqual(exported.events[2].event, 'mark');
  assert.strictEqual(exported.events[2].label, 'desync-visible');
  assert.strictEqual(exported.events[exported.events.length - 1].event, 'still-recording');
}());

(function stopFreezesTheTraceAndRestartClearsIt() {
  var now = 0;
  var capture = DebugCapture.create({ now: function () { return now; }, wallNow: function () { return now + 1000; } });
  var first;
  capture.start();
  now = 10;
  capture.record('playback', 'waiting', { publicTime: 10 });
  now = 20;
  first = capture.stop();
  assert.strictEqual(first.active, false);
  assert.strictEqual(first.stoppedAt, 1020);
  assert.strictEqual(capture.record('playback', 'ignored-after-stop', { publicTime: 11 }), false);
  assert.strictEqual(capture.export().events.some(function (entry) { return entry.event === 'ignored-after-stop'; }), false);
  now = 30;
  capture.start();
  assert.strictEqual(capture.status().generation, 2);
  assert.strictEqual(capture.export().events.length, 1, 'start must begin a fresh capture instead of appending an old incident');
  assert.strictEqual(capture.export().events[0].event, 'capture-start');
}());

(function exportedSnapshotsCannotMutateTheCollector() {
  var capture = DebugCapture.create({ now: function () { return 1; }, wallNow: function () { return 2; } });
  var snapshot;
  capture.start();
  capture.record('playback', 'playing', { publicTime: 10 });
  snapshot = capture.export();
  snapshot.events[1].publicTime = 999;
  snapshot.events.push({ event: 'fake' });
  assert.strictEqual(capture.export().events[1].publicTime, 10);
  assert.strictEqual(capture.export().events.length, 2);
}());

console.log('Debug capture checks passed');
