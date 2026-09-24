'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var filename = path.join(__dirname, '../app/playback-operation.js');
assert.ok(fs.existsSync(filename), 'PlaybackOperation must provide one owner for replaceable asynchronous work');
var Operation = require('../app/playback-operation');

(function synchronousCompletionReleasesTheHandleAndDeliversOnlyOnce() {
  var slot = Operation.create();
  var operation = slot.begin();
  var complete;
  var calls = [];
  var aborts = 0;
  operation.run(function (done) {
    complete = done;
    done(null, 'ready');
    return { abort: function () { aborts += 1; } };
  }, function (error, value) { assert.ifError(error); calls.push(value); });
  complete(null, 'duplicate');
  assert.deepStrictEqual(calls, ['ready']);
  assert.strictEqual(slot.pending(), false);
  assert.strictEqual(operation.current(), true, 'a completed transport may still own a renderer continuation');
  slot.cancel();
  assert.strictEqual(operation.current(), false);
  assert.strictEqual(aborts, 0, 'completed requests must not be retained for later cancellation');
}());

(function replacementInvalidatesBeforeCallingAbort() {
  var slot = Operation.create();
  var first = slot.begin();
  var calls = [];
  var aborted = 0;
  first.run(function (done) {
    return { abort: function () { aborted += 1; done(null, 'stale'); } };
  }, function (error, value) { calls.push(value); });
  var second = slot.begin();
  assert.strictEqual(first.current(), false);
  assert.strictEqual(second.current(), true);
  assert.strictEqual(aborted, 1);
  assert.deepStrictEqual(calls, []);
  assert.strictEqual(first.run(function () { throw new Error('must not start'); }, function () {}), false);
}());

(function lateRequestHandleCannotEscapeSupersession() {
  var slot = Operation.create();
  var first = slot.begin();
  var latest;
  var aborted = 0;
  first.run(function () {
    latest = slot.begin();
    return { abort: function () { aborted += 1; } };
  }, function () { throw new Error('superseded request must not complete'); });
  assert.strictEqual(aborted, 1);
  assert.strictEqual(latest.current(), true);
  assert.strictEqual(slot.pending(), false);
}());

(function synchronousCallbackMayStartTheNextRequestWithoutLosingItsHandle() {
  var slot = Operation.create();
  var operation = slot.begin();
  var aborted = [];
  operation.run(function (done) {
    done(null, 'first');
    return { abort: function () { aborted.push('completed'); } };
  }, function () {
    operation.run(function () {
      return { abort: function () { aborted.push('second'); } };
    }, function () {});
  });
  assert.strictEqual(slot.pending(), true);
  slot.cancel();
  assert.deepStrictEqual(aborted, ['second']);
}());

(function reentrantAbortCannotOverwriteANewerOperation() {
  var slot = Operation.create();
  var newest;
  slot.begin().run(function () {
    return { abort: function () { newest = slot.begin(); } };
  }, function () {});
  var superseded = slot.begin();
  assert.strictEqual(superseded.current(), false);
  assert.strictEqual(newest.current(), true);
}());

(function cancellationFailuresAreReportedWithoutBreakingInvalidation() {
  var errors = [];
  var slot = Operation.create({ onAbortError: function (error) { errors.push(error.message); } });
  var first = slot.begin();
  first.run(function () { return { abort: function () { throw new Error('abort failed'); } }; }, function () {});
  assert.doesNotThrow(function () { slot.cancel(); });
  assert.deepStrictEqual(errors, ['abort failed']);
  assert.strictEqual(first.current(), false);
  assert.strictEqual(slot.pending(), false);
  assert.strictEqual(slot.begin().current(), true);
}());

(function destroyIsTerminalEvenWhenAbortReenters() {
  var slot = Operation.create();
  var calls = 0;
  slot.begin().run(function () {
    return { abort: function () { slot.begin().run(function () { calls += 1; }, function () {}); } };
  }, function () {});
  slot.destroy();
  slot.destroy();
  assert.strictEqual(slot.begin().current(), false);
  assert.strictEqual(calls, 0);
  assert.strictEqual(slot.pending(), false);
}());

(function transportThrowsAreDeliveredButCallbackThrowsAreNotSwallowed() {
  var slot = Operation.create();
  var errors = [];
  slot.begin().run(function () { throw new Error('transport failed'); }, function (error) { errors.push(error.message); });
  assert.deepStrictEqual(errors, ['transport failed']);
  assert.strictEqual(slot.pending(), false);
  assert.throws(function () {
    slot.begin().run(function (done) { done(null); }, function () { throw new Error('consumer failed'); });
  }, /consumer failed/);
}());

(function deferredCompletionAndRepeatedReplacementRemainBounded() {
  var slot = Operation.create();
  var callbacks = [];
  var results = [];
  var aborted = 0;
  var i;
  for (i = 0; i < 100; i += 1) {
    slot.begin().run(function (done) { callbacks.push(done); return { abort: function () { aborted += 1; } }; }, function (error, value) { results.push(value); });
  }
  callbacks.forEach(function (done, index) { done(null, index); done(null, 'duplicate'); });
  assert.deepStrictEqual(results, [99]);
  assert.strictEqual(aborted, 99);
  assert.strictEqual(slot.pending(), false);
  slot.destroy();
}());

console.log('Playback operation ownership checks passed');
