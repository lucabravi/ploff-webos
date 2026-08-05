'use strict';

var assert = require('assert');
var Provider;
var Contract = require('../app/coordinator/queue-sequence-contract');
var Cache = require('../app/coordinator/bounded-queue-cache');

try {
  Provider = require('../app/coordinator/plex-container-queue-provider');
} catch (error) {
  Provider = null;
}

assert.ok(Provider, 'the Plex container queue provider module must exist');

function item(key) {
  return { ratingKey: key, type: 'movie', title: key };
}

(function preservesOrderDuplicatesAndAbsolutePositions() {
  var calls = [];
  var provider = Provider.create({
    QueueSequenceContract: Contract,
    BoundedQueueCache: Cache,
    pageSize: 2,
    maxPages: 5,
    maxRecords: 10,
    loadPage: function (request, callback) {
      calls.push(request);
      callback(null, {
        total: 5,
        items: request.start === 0 ? [item('same'), item('same')] :
          request.start === 2 ? [item('same'), item('last')] : [item('tail')]
      });
    }
  });
  var generation = provider.open({ kind: 'playlist', id: 'playlist-1' });
  var resolved = [];
  provider.resolveAt(0, function (_error, value) { resolved.push(value); });
  provider.resolveAt(1, function (_error, value) { resolved.push(value); });
  provider.resolveAt(2, function (_error, value) { resolved.push(value); });
  assert.strictEqual(generation, 1);
  assert.deepStrictEqual(calls.map(function (request) { return request.start; }), [0, 2], 'each metadata page must load once');
  assert.deepStrictEqual(resolved.map(function (value) { return value.absoluteIndex; }), [0, 1, 2], 'server order must remain exact');
  assert.strictEqual(resolved[0].item.ratingKey, 'same');
  assert.strictEqual(resolved[1].item.ratingKey, 'same');
  assert.strictEqual(resolved[2].item.ratingKey, 'same');
  assert.notStrictEqual(resolved[0].occurrenceId, resolved[1].occurrenceId);
  assert.notStrictEqual(resolved[1].occurrenceId, resolved[2].occurrenceId);
}());

(function reportsKnownAbsoluteBoundariesSynchronouslyForBothContainerKinds() {
  ['playlist', 'collection'].forEach(function (kind) {
    var provider = Provider.create({
      QueueSequenceContract: Contract,
      BoundedQueueCache: Cache,
      pageSize: 2,
      loadPage: function (request, callback) { callback(null, { total: 2, items: [item('a'), item('b')] }); }
    });
    var first = { absoluteIndex: 0, occurrenceId: kind + ':0:a', item: item('a') };
    var last = { absoluteIndex: 1, occurrenceId: kind + ':1:b', item: item('b') };
    var previous;
    var next;
    provider.open({ kind: kind, id: kind + '-bounds', total: 2 });
    assert.deepStrictEqual(provider.resolveAdjacent(first, -1, function (error, state) { assert.ifError(error); previous = state; }),
      { state: 'unavailable' }, kind + ' Previous must be disabled immediately at the first occurrence');
    assert.deepStrictEqual(previous, { state: 'unavailable' });
    assert.deepStrictEqual(provider.resolveAdjacent(last, 1, function (error, state) { assert.ifError(error); next = state; }),
      { state: 'unavailable' }, kind + ' Next must be disabled immediately at the final occurrence');
    assert.deepStrictEqual(next, { state: 'unavailable' });
  });
}());

(function discoversTerminalPagesAndReportsAdjacentStates() {
  var provider = Provider.create({
    QueueSequenceContract: Contract,
    BoundedQueueCache: Cache,
    pageSize: 2,
    loadPage: function (request, callback) {
      callback(null, { items: request.start === 0 ? [item('a'), item('b')] : [item('c')] });
    }
  });
  provider.open({ kind: 'collection', id: 'collection-4' });
  provider.resolveAt(2, function (error, current) {
    assert.ifError(error);
    assert.deepStrictEqual(provider.resolveAdjacent(current, 1, function (nextError, state) {
      assert.ifError(nextError);
      assert.deepStrictEqual(state, { state: 'unavailable' });
    }), { state: 'unavailable' });
  });
}());


(function observedFullPagesPreventAdvertisedTotalsFromShrinkingTheQueue() {
  var provider = Provider.create({
    QueueSequenceContract: Contract,
    BoundedQueueCache: Cache,
    pageSize: 2,
    loadPage: function (request, callback) {
      callback(null, {
        total: request.start === 0 ? 1 : 2,
        items: request.start === 0 ? [item('a'), item('b')] : [item('c'), item('d')]
      });
    }
  });
  var first;
  var adjacent;
  provider.open({ kind: 'playlist', id: 'underreported-total', total: 4 });
  provider.resolveAt(0, function (error, value) { assert.ifError(error); first = value; });
  assert.strictEqual(provider.snapshot().knownTotal, 4,
    'a smaller advertised total must not erase an already-known logical boundary');
  provider.resolveAdjacent(first, 1, function (error, value) { assert.ifError(error); adjacent = value; });
  assert.strictEqual(adjacent.state, 'available');
  assert.strictEqual(adjacent.item.ratingKey, 'b',
    'records already observed inside a full page must remain reachable despite an underreported total');
  provider.resolveAt(2, function (error) { assert.ifError(error); });
  assert.strictEqual(provider.snapshot().knownTotal, 4,
    'later full pages with smaller totals must not shrink the sequence without a terminal page');
}());

(function shortTerminalPagesOverrideStaleAdvertisedTotals() {
  var provider = Provider.create({
    QueueSequenceContract: Contract,
    BoundedQueueCache: Cache,
    pageSize: 2,
    loadPage: function (request, callback) {
      callback(null, { total: 6, items: request.start === 4 ? [item('e')] : [] });
    }
  });
  var result;
  var adjacent;
  provider.open({ kind: 'playlist', id: 'shrunk', total: 6 });
  provider.window(4, 6, function (error, value) {
    assert.ifError(error);
    result = value;
  });
  assert.strictEqual(result.total, 5, 'a short terminal page must shrink an obsolete Plex total');
  assert.strictEqual(result.end, 5, 'the returned window must not expose phantom positions after the terminal page');
  assert.strictEqual(provider.snapshot().knownTotal, 5);
  assert.deepStrictEqual(provider.resolveAdjacent(result.items[0], 1, function (error, state) {
    assert.ifError(error);
    adjacent = state;
  }), { state: 'unavailable' });
  assert.deepStrictEqual(adjacent, { state: 'unavailable' }, 'Next must become unavailable at the discovered terminal occurrence');
}());


(function keepsAdvertisedTerminalBoundariesAcrossConflictingConcurrentTotals() {
  var pending = [];
  var result;
  var provider = Provider.create({
    QueueSequenceContract: Contract,
    BoundedQueueCache: Cache,
    pageSize: 2,
    loadPage: function (request, callback) { pending.push({ request: request, callback: callback }); }
  });
  provider.open({ kind: 'playlist', id: 'advertised-terminal', total: 4 });
  provider.window(0, 4, function (error, value) { assert.ifError(error); result = value; });
  pending[1].callback(null, { total: 4, items: [item('c'), item('d')] });
  pending[0].callback(null, { total: 6, items: [item('a'), item('b')] });
  assert.strictEqual(result.total, 4,
    'a full page ending at the established Plex total must prevent stale concurrent expansion');
  assert.strictEqual(provider.snapshot().knownTotal, 4);
  assert.deepStrictEqual(result.items.map(function (entry) { return entry.item.ratingKey; }), ['a', 'b', 'c', 'd']);
}());

(function keepsDiscoveredTerminalBoundariesAcrossConcurrentPages() {
  var pending = [];
  var result;
  var provider = Provider.create({
    QueueSequenceContract: Contract,
    BoundedQueueCache: Cache,
    pageSize: 2,
    loadPage: function (request, callback) {
      pending.push({ request: request, callback: callback });
    }
  });
  provider.open({ kind: 'playlist', id: 'concurrent-shrink', total: 4 });
  provider.window(0, 4, function (error, value) {
    assert.ifError(error);
    result = value;
  });
  assert.deepStrictEqual(pending.map(function (entry) { return entry.request.start; }), [0, 2]);
  pending[1].callback(null, { total: 4, items: [item('stale-c'), item('stale-d')] });
  pending[0].callback(null, { total: 4, items: [item('a')] });
  assert.strictEqual(result.total, 1, 'a later page beyond a discovered terminal boundary must not expand the queue again');
  assert.strictEqual(result.end, 1);
  assert.deepStrictEqual(result.items.map(function (entry) { return entry.item.ratingKey; }), ['a']);
  assert.strictEqual(provider.snapshot().knownTotal, 1);
  assert.strictEqual(provider.snapshot().residentRecords, 1, 'out-of-range pages loaded before the terminal response must be discarded');
}());

(function clampsConcurrentWindowsAfterATerminalShrink() {
  var pending = [];
  var distantResult;
  var leadingResult;
  var provider = Provider.create({
    QueueSequenceContract: Contract,
    BoundedQueueCache: Cache,
    pageSize: 2,
    loadPage: function (request, callback) {
      pending.push({ request: request, callback: callback });
    }
  });
  provider.open({ kind: 'playlist', id: 'concurrent-window-clamp', total: 4 });
  provider.window(2, 4, function (error, value) {
    assert.ifError(error);
    distantResult = value;
  });
  provider.window(0, 2, function (error, value) {
    assert.ifError(error);
    leadingResult = value;
  });
  assert.deepStrictEqual(pending.map(function (entry) { return entry.request.start; }), [2, 0]);
  pending[1].callback(null, { total: 4, items: [item('a')] });
  pending[0].callback(null, { total: 4, items: [item('stale-c'), item('stale-d')] });
  assert.deepStrictEqual({ start: leadingResult.start, end: leadingResult.end, total: leadingResult.total },
    { start: 0, end: 1, total: 1 });
  assert.deepStrictEqual({ start: distantResult.start, end: distantResult.end, total: distantResult.total },
    { start: 1, end: 1, total: 1 }, 'a stale window must collapse to the discovered boundary instead of returning start greater than end');
  assert.deepStrictEqual(distantResult.items, []);
}());

(function rejectsStaleResponsesAfterOriginReplacement() {
  var pending = [];
  var delivered = 0;
  var provider = Provider.create({
    QueueSequenceContract: Contract,
    BoundedQueueCache: Cache,
    pageSize: 2,
    loadPage: function (request, callback) { pending.push({ request: request, callback: callback }); }
  });
  provider.open({ kind: 'playlist', id: 'old' });
  provider.resolveAt(0, function () { delivered += 1; });
  provider.open({ kind: 'playlist', id: 'new' });
  pending[0].callback(null, { total: 1, items: [item('stale')] });
  assert.strictEqual(delivered, 0, 'responses from an old origin generation must be ignored');
  assert.strictEqual(provider.snapshot().residentRecords, 0, 'stale responses must not populate the new cache');
}());

(function reloadsEvictedPagesWithoutChangingIdentity() {
  var loads = {};
  var provider = Provider.create({
    QueueSequenceContract: Contract,
    BoundedQueueCache: Cache,
    pageSize: 1,
    maxPages: 2,
    maxRecords: 2,
    loadPage: function (request, callback) {
      loads[request.start] = (loads[request.start] || 0) + 1;
      callback(null, { total: 4, items: [item('item-' + request.start)] });
    }
  });
  var firstIdentity;
  provider.open({ kind: 'playlist', id: 'reload' });
  provider.resolveAt(0, function (_error, value) { firstIdentity = value.occurrenceId; });
  provider.resolveAt(1, function () {});
  provider.resolveAt(2, function () {});
  provider.resolveAt(0, function (_error, value) {
    assert.strictEqual(value.occurrenceId, firstIdentity, 'reloaded occurrences must retain stable identity');
  });
  assert.strictEqual(loads[0], 2, 'reverse navigation must reload an evicted page');
}());


(function rejectsAChangedPageAfterEvictionWithoutRemappingOccurrences() {
  var version = 0;
  var provider = Provider.create({
    QueueSequenceContract: Contract,
    BoundedQueueCache: Cache,
    pageSize: 1,
    maxPages: 1,
    maxRecords: 1,
    loadPage: function (request, callback) {
      var key = request.start === 0 && version > 0 ? 'replacement' : 'item-' + request.start;
      callback(null, { total: request.start === 0 && version > 0 ? 100 : 2, items: [item(key)] });
    }
  });
  var original;
  var changedError;
  provider.open({ kind: 'playlist', id: 'stable-session', total: 2 });
  provider.resolveAt(0, function (error, value) { assert.ifError(error); original = value; });
  provider.resolveAt(1, function (error) { assert.ifError(error); });
  version = 1;
  provider.resolveAt(0, function (error) { changedError = error; });
  assert.strictEqual(original.item.ratingKey, 'item-0');
  assert.ok(changedError, 'a remotely reordered or replaced page must not silently remap the active session');
  assert.strictEqual(provider.snapshot().residentRecords, 1, 'the incompatible replacement page must not enter the bounded cache');
  assert.strictEqual(provider.snapshot().knownTotal, 2, 'an incompatible replacement page must not change the established sequence boundary');
}());

(function loadsOnlyRequestedWindowsWithinHardCacheBounds() {
  var provider = Provider.create({
    QueueSequenceContract: Contract,
    BoundedQueueCache: Cache,
    pageSize: 40,
    maxPages: 5,
    maxRecords: 200,
    loadPage: function (request, callback) {
      var records = [];
      var index;
      for (index = request.start; index < Math.min(10000, request.start + request.size); index += 1) {
        records.push(item('item-' + index));
      }
      callback(null, { total: 10000, items: records });
    }
  });
  var windowValue;
  provider.open({ kind: 'playlist', id: 'large', total: 10000 });
  provider.window(483, 518, function (error, result) {
    assert.ifError(error);
    windowValue = result;
  });
  assert.strictEqual(windowValue.items.length, 35, 'the provider must return only the requested logical window');
  assert.strictEqual(windowValue.items[0].absoluteIndex, 483);
  assert.strictEqual(windowValue.items[34].absoluteIndex, 517);
  assert.strictEqual(windowValue.total, 10000);
  assert.ok(provider.snapshot().residentPages <= 5, 'window loading must preserve the page cache bound');
  assert.ok(provider.snapshot().residentRecords <= 200, 'window loading must preserve the record cache bound');
  assert.ok(provider.snapshot().peakResidentRecords <= 200, 'transient loading must never exceed the record bound');
}());

(function resolvesWindowsByPageInsteadOfPerItemCacheLookups() {
  var getPageCalls = 0;
  var CountingCache = {
    create: function (options) {
      var cache = Cache.create(options);
      var originalGetPage = cache.getPage;
      cache.getPage = function (start) { getPageCalls += 1; return originalGetPage(start); };
      return cache;
    }
  };
  var provider = Provider.create({
    QueueSequenceContract: Contract,
    BoundedQueueCache: CountingCache,
    pageSize: 40,
    loadPage: function (request, callback) {
      var records = [];
      var index;
      for (index = request.start; index < request.start + request.size; index += 1) {
        records.push(item('batch-' + index));
      }
      callback(null, { total: 1000, items: records });
    }
  });
  provider.open({ kind: 'playlist', id: 'batched-window', total: 1000 });
  provider.window(483, 518, function (error, result) {
    assert.ifError(error);
    assert.strictEqual(result.items.length, 35);
  });
  assert.ok(getPageCalls <= 6,
    'a bounded window must read each covered page only a small constant number of times, not once per item');
}());

(function staleWindowCallbacksDoNotPublishAfterOriginReplacement() {
  var pending;
  var delivered = 0;
  var provider = Provider.create({
    QueueSequenceContract: Contract,
    BoundedQueueCache: Cache,
    pageSize: 40,
    loadPage: function (_request, callback) {
      pending = callback;
      return { abort: function () {} };
    }
  });
  provider.open({ kind: 'playlist', id: 'old', total: 80 });
  provider.window(0, 20, function () { delivered += 1; });
  provider.open({ kind: 'playlist', id: 'new', total: 80 });
  pending(null, { total: 80, items: [item('late')] });
  assert.strictEqual(delivered, 0, 'old window callbacks must not publish into a replacement origin');
}());


(function reportsSynchronousTransportThrowsAndAllowsRetry() {
  var attempts = 0;
  var receivedError = null;
  var resolved = null;
  var provider = Provider.create({
    QueueSequenceContract: Contract,
    BoundedQueueCache: Cache,
    pageSize: 2,
    loadPage: function (_request, callback) {
      attempts += 1;
      if (attempts === 1) { throw new Error('transport failed'); }
      callback(null, { total: 1, items: [item('retry-ok')] });
    }
  });
  provider.open({ kind: 'playlist', id: 'throw-retry', total: 1 });
  assert.doesNotThrow(function () {
    provider.resolveAt(0, function (error) { receivedError = error; });
  }, 'a synchronous transport failure must be reported through the provider callback');
  assert.ok(receivedError);
  assert.strictEqual(provider.snapshot().pendingPages, 0, 'a synchronous throw must release page ownership');
  provider.resolveAt(0, function (error, value) { assert.ifError(error); resolved = value; });
  assert.strictEqual(resolved.item.ratingKey, 'retry-ok', 'the same page must remain retryable after a transport throw');
}());

(function rejectsMalformedOrOversizedPagesWithoutCorruptingTheCache() {
  var responses = [
    { total: 2, items: { ratingKey: 'not-an-array' } },
    { total: 3, items: [item('a'), item('b'), item('c')] },
    { total: 1, items: [item('valid')] }
  ];
  var errors = [];
  var resolved = null;
  var provider = Provider.create({
    QueueSequenceContract: Contract,
    BoundedQueueCache: Cache,
    pageSize: 2,
    loadPage: function (_request, callback) { callback(null, responses.shift()); }
  });
  provider.open({ kind: 'collection', id: 'malformed-pages' });
  assert.doesNotThrow(function () {
    provider.resolveAt(0, function (error) { errors.push(error); });
  });
  assert.doesNotThrow(function () {
    provider.resolveAt(0, function (error) { errors.push(error); });
  });
  assert.ok(errors[0]);
  assert.ok(errors[1]);
  assert.strictEqual(provider.snapshot().residentRecords, 0, 'invalid responses must never enter the bounded cache');
  assert.strictEqual(provider.snapshot().pendingPages, 0, 'invalid responses must release every waiter');
  provider.resolveAt(0, function (error, value) { assert.ifError(error); resolved = value; });
  assert.strictEqual(resolved.item.ratingKey, 'valid', 'a valid retry must recover after malformed responses');
}());


(function ignoresLateErrorsBeyondADiscoveredTerminalBoundary() {
  var pending = [];
  var result = null;
  var receivedError = null;
  var provider = Provider.create({
    QueueSequenceContract: Contract,
    BoundedQueueCache: Cache,
    pageSize: 2,
    loadPage: function (request, callback) {
      pending.push({ request: request, callback: callback });
      return { abort: function () {} };
    }
  });
  provider.open({ kind: 'playlist', id: 'terminal-error-race' });
  provider.window(0, 4, function (error, value) {
    receivedError = error;
    result = value;
  });
  assert.deepStrictEqual(pending.map(function (entry) { return entry.request.start; }), [0, 2]);
  pending[0].callback(null, { total: 4, items: [item('only')] });
  pending[1].callback(new Error('obsolete distant page failed'));
  assert.ifError(receivedError);
  assert.ok(result, 'a request beyond the discovered terminal boundary must resolve as an empty page');
  assert.strictEqual(result.total, 1);
  assert.deepStrictEqual(result.items.map(function (entry) { return entry.item.ratingKey; }), ['only']);
}());

console.log('Plex container queue provider checks passed');

(function abortsPendingRequestsOnCloseAndRejectsSynchronousAbortCallbacks() {
  var pending;
  var delivered = 0;
  var provider = Provider.create({
    QueueSequenceContract: Contract,
    BoundedQueueCache: Cache,
    pageSize: 2,
    loadPage: function (_request, callback) {
      pending = {
        callback: callback,
        request: {
          aborted: false,
          abort: function () { this.aborted = true; callback(new Error('aborted')); }
        }
      };
      return pending.request;
    }
  });
  provider.open({ kind: 'playlist', id: 'close-me' });
  provider.resolveAt(0, function () { delivered += 1; });
  assert.strictEqual(provider.close(), true);
  assert.strictEqual(pending.request.aborted, true, 'closing the provider must abort its page request');
  pending.callback(null, { total: 1, items: [item('late')] });
  assert.strictEqual(delivered, 0, 'synchronous abort and late responses must not publish after close');
  assert.strictEqual(provider.snapshot().kind, '');
}());

(function repeatedAdjacentActivationDoesNotQueueDuplicateStarts() {
  var pageCallback;
  var loads = 0;
  var completions = 0;
  var provider = Provider.create({
    QueueSequenceContract: Contract,
    BoundedQueueCache: Cache,
    pageSize: 2,
    loadPage: function (_request, callback) {
      loads += 1;
      pageCallback = callback;
      return { abort: function () {} };
    }
  });
  provider.open({ kind: 'playlist', id: 'repeat', total: 3 });
  provider.resolveAdjacent({ absoluteIndex: 0, occurrenceId: 'repeat:0:a' }, 1, function () { completions += 1; });
  provider.resolveAdjacent({ absoluteIndex: 0, occurrenceId: 'repeat:0:a' }, 1, function () { completions += 100; });
  assert.strictEqual(loads, 1, 'repeated activation must share the same page resolution');
  pageCallback(null, { total: 3, items: [item('a'), item('b')] });
  assert.strictEqual(completions, 1, 'repeated activation must not enqueue a second future start');
}());
