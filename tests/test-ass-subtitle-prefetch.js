'use strict';

var assert = require('assert');
var path = require('path');
var Prefetch = require(path.join(__dirname, '..', 'app', 'ass-subtitle-prefetch.js'));

function harness() {
  var requests = [];
  var owner = Prefetch.create({
    load: function (target, callback) {
      var request = { target: target, callback: callback, aborted: false };
      requests.push(request);
      return { abort: function () { request.aborted = true; } };
    }
  });
  return { owner: owner, requests: requests };
}

function target(identity) { return { identity: identity, track: { id: identity } }; }

(function duplicateRequestsShareOneTransport() {
  var h = harness();
  var results = [];
  h.owner.request(target('a'), { priority: 'speculative' }, function (error, value) { results.push(['one', error, value]); });
  h.owner.request(target('a'), { priority: 'foreground' }, function (error, value) { results.push(['two', error, value]); });
  assert.strictEqual(h.requests.length, 1, 'equal requests must use one transport');
  h.requests[0].callback(null, '[Events]');
  assert.deepStrictEqual(results, [['one', null, '[Events]'], ['two', null, '[Events]']], 'all equal requesters must receive the result');
  assert.deepStrictEqual(h.owner.claim('a'), { identity: 'a', content: '[Events]' }, 'successful content must be claimable once');
  assert.strictEqual(h.owner.claim('a'), null, 'claimed content must leave the bounded cache');
}());

(function foregroundReplacesSpeculativeWork() {
  var h = harness();
  var cancelled = null;
  h.owner.request(target('next'), { priority: 'speculative' }, function (error) { cancelled = error; });
  h.owner.request(target('current'), { priority: 'foreground' }, function () {});
  assert.strictEqual(h.requests[0].aborted, true, 'foreground work must abort replaceable speculative work');
  assert.strictEqual(cancelled.cancelled, true, 'replaced speculative callbacks must complete as cancelled');
  assert.strictEqual(h.requests.length, 2, 'foreground work must start immediately');
  h.requests[0].callback(null, 'stale');
  assert.strictEqual(h.owner.claim('next'), null, 'late stale callbacks must not populate cache');
}());

(function foregroundWorkRejectsDifferentSpeculation() {
  var h = harness();
  var rejected = null;
  h.owner.request(target('current'), { priority: 'foreground' }, function () {});
  h.owner.request(target('next'), { priority: 'speculative' }, function (error) { rejected = error; });
  assert.strictEqual(h.requests.length, 1, 'speculative work must not replace foreground work');
  assert.strictEqual(rejected.cancelled, true, 'rejected speculation must complete as cancelled');
}());

(function cancellationAndDestroyAbortTransport() {
  var h = harness();
  var cancelled = 0;
  h.owner.request(target('a'), { priority: 'speculative' }, function (error) { if (error && error.cancelled) { cancelled += 1; } });
  h.owner.cancel('closed');
  assert.strictEqual(h.requests[0].aborted, true, 'cancel must abort the active transport');
  assert.strictEqual(cancelled, 1, 'cancel must settle active callbacks');
  h.owner.destroy();
  assert.strictEqual(h.owner.snapshot().destroyed, true, 'destroy must expose terminal state');
}());

(function matchingInFlightClaimJoinsAndMissIsImmediate() {
  var h = harness();
  var joined = null;
  h.owner.request(target('a'), { priority: 'speculative' }, function () {});
  h.owner.claim('a', function (error, value) { joined = [error, value]; });
  assert.strictEqual(h.requests.length, 1, 'claiming an in-flight record must not duplicate transport');
  h.requests[0].callback(null, 'cached');
  assert.deepStrictEqual(joined, [null, 'cached'], 'in-flight claim must join completion');
  var miss = null;
  h.owner.claim('missing', function (error, value) { miss = [error, value]; });
  assert.deepStrictEqual(miss, [null, null], 'cache miss must complete immediately');
}());


(function successfulFetchPublishesColdStartTimingWithoutIdentityData() {
  var requests = [];
  var events = [];
  var owner = Prefetch.create({
    metrics: {
      beginRealAssFetch: function () { events.push(['start']); },
      endRealAssFetch: function () { events.push(['end']); }
    },
    load: function (candidate, callback) {
      requests.push({ candidate: candidate, callback: callback });
      return { abort: function () {} };
    }
  });
  owner.request({ identity: 'server|profile|secret-track', track: { id: 'secret-track' } }, { priority: 'speculative' }, function () {});
  requests[0].callback(null, '[Script Info]');
  assert.deepStrictEqual(events, [['start'], ['end']], 'successful ASS fetches must publish timing without payload metadata');
}());

console.log('ASS subtitle prefetch owner checks passed');
