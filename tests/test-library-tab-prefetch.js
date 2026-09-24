'use strict';

var assert = require('assert');
var Prefetch = require('../app/coordinator/library-tab-prefetch');

var requests = [];

function loader(request, callback) {
  var record = { request: request, callback: callback, aborted: false };
  requests.push(record);
  return {
    abort: function () { record.aborted = true; }
  };
}

function finish(record, result) {
  record.callback(null, result);
}

function create(options) {
  return Prefetch.create(Object.assign({
    views: ['recommended', 'recent', 'catalog'],
    maxConcurrent: 1,
    maxEntries: 4,
    sourceIdentity: function (_library, context) { return context && context.serverMachineIdentifier; },
    load: loader
  }, options || {}));
}

(function testEnsurePrioritizesActiveTabAndCachesEachExactView() {
  requests = [];
  var controller = create();
  var library = { key: 'library-1' };
  controller.ensure({
    library: library,
    sourceContext: { serverMachineIdentifier: 'server-a' },
    activeViewKey: 'recent',
    activeQuery: { sort: 'titleSort', filters: { genre: 'Drama' } }
  });
  assert.strictEqual(requests.length, 1, 'only the active tab starts while the concurrency budget is one');
  assert.strictEqual(requests[0].request.viewKey, 'recent');
  finish(requests[0], { items: [{ ratingKey: 'recent-1' }], totalSize: 1 });
  assert.strictEqual(requests.length, 2, 'the next tab starts after the active tab settles');
  assert.strictEqual(requests[1].request.viewKey, 'recommended');
  finish(requests[1], [{ title: 'Recommended', items: [{ ratingKey: 'recommendation-1' }] }]);
  assert.strictEqual(controller.cached({
    library: library, sourceContext: { serverMachineIdentifier: 'server-a' },
    viewKey: 'recent', query: { sort: 'titleSort', filters: { genre: 'Drama' } }, start: 0, limit: 30
  }).items[0].ratingKey, 'recent-1', 'the exact active view/query is reusable');
  assert.strictEqual(controller.cached({
    library: library, sourceContext: { serverMachineIdentifier: 'server-a' },
    viewKey: 'recent', query: { sort: 'titleSort', filters: { genre: 'Comedy' } }, start: 0, limit: 30
  }), null, 'a different filter set cannot reuse the active tab cache');
}());

(function testEnsurePublishesReadyBackgroundTabsForPresentationWarming() {
  requests = [];
  var controller = create();
  var ready = [];
  var library = { key: 'library-ready' };
  controller.ensure({
    library: library,
    sourceContext: { serverMachineIdentifier: 'server-a' },
    activeViewKey: 'recent',
    activeQuery: {},
    onReady: function (viewKey, result, request) {
      ready.push({ viewKey: viewKey, result: result, priority: request.priority });
    }
  });
  finish(requests[0], { items: [{ ratingKey: 'recent-ready' }], totalSize: 1 });
  finish(requests[1], { items: [{ ratingKey: 'recommended-ready' }], totalSize: 1 });
  assert.strictEqual(ready.length, 2, 'ready tab data must notify the presentation warmer once per request');
  assert.strictEqual(ready[0].viewKey, 'recent', 'the active tab must settle through the ready callback first');
  assert.strictEqual(ready[0].priority, 0, 'the active tab must retain foreground priority');
  assert.strictEqual(ready[1].viewKey, 'recommended', 'background tabs must also become warmable when their data settles');
  assert.strictEqual(ready[1].priority, 20, 'background tab presentation work must remain low priority');
  assert.strictEqual(ready[1].result.items[0].ratingKey, 'recommended-ready');
}());

(function testSourceAndLibraryIdentityPreventCrossServerMixing() {
  requests = [];
  var controller = create({ maxConcurrent: 2 });
  var callbackResult = null;
  controller.request({
    library: { key: 'library-1' }, sourceContext: { serverMachineIdentifier: 'server-a' },
    viewKey: 'catalog', query: {}, start: 0, limit: 60
  }, function (_error, result) { callbackResult = result; });
  controller.request({
    library: { key: 'library-1' }, sourceContext: { serverMachineIdentifier: 'server-b' },
    viewKey: 'catalog', query: {}, start: 0, limit: 60
  }, null);
  assert.strictEqual(requests.length, 2, 'the same library key on two servers has two independent requests');
  finish(requests[0], { items: [{ ratingKey: 'server-a-item' }], totalSize: 1 });
  assert.strictEqual(callbackResult.items[0].ratingKey, 'server-a-item');
}());

(function testLeavingLibraryCancelsOnlyPendingWorkAndReturnResumesIt() {
  requests = [];
  var controller = create({ maxConcurrent: 1 });
  var library = { key: 'library-1' };
  controller.request({
    library: library, sourceContext: { serverMachineIdentifier: 'server-a' },
    viewKey: 'recent', query: {}, start: 0, limit: 30
  }, null);
  controller.request({
    library: library, sourceContext: { serverMachineIdentifier: 'server-a' },
    viewKey: 'catalog', query: {}, start: 0, limit: 60
  }, null);
  assert.strictEqual(requests.length, 1);
  finish(requests[0], { items: [{ ratingKey: 'cached' }], totalSize: 1 });
  assert.strictEqual(requests.length, 2);
  controller.cancelLibrary(library, { serverMachineIdentifier: 'server-a' });
  assert.strictEqual(requests[1].aborted, true, 'the in-flight request is cancelled when leaving');
  assert.strictEqual(controller.cached({
    library: library, sourceContext: { serverMachineIdentifier: 'server-a' },
    viewKey: 'recent', query: {}, start: 0, limit: 30
  }).items[0].ratingKey, 'cached', 'completed data survives leaving the library');
  controller.request({
    library: library, sourceContext: { serverMachineIdentifier: 'server-a' },
    viewKey: 'catalog', query: {}, start: 0, limit: 60
  }, null);
  assert.strictEqual(requests.length, 3, 'a missing tab is requested again on return');
}());

(function testActiveTabCanPreemptBackgroundWork() {
  requests = [];
  var controller = create({ maxConcurrent: 2 });
  var library = { key: 'library-1' };
  controller.request({
    library: library, sourceContext: { serverMachineIdentifier: 'server-a' },
    viewKey: 'recent', query: {}, start: 0, limit: 30, priority: 20
  }, null);
  controller.request({
    library: library, sourceContext: { serverMachineIdentifier: 'server-a' },
    viewKey: 'collections', query: {}, start: 0, limit: 60, priority: 20
  }, null);
  assert.strictEqual(requests.length, 2);
  controller.request({
    library: library, sourceContext: { serverMachineIdentifier: 'server-a' },
    viewKey: 'catalog', query: {}, start: 0, limit: 60, priority: 0
  }, null);
  assert.strictEqual(requests.some(function (record) { return record.aborted; }), true, 'a background request yields a slot to the active tab');
  assert.strictEqual(requests.length, 3);
  assert.strictEqual(requests[2].request.viewKey, 'catalog');
}());

(function testActiveTabPromotesQueuedBackgroundRequest() {
  requests = [];
  var controller = create({ maxConcurrent: 1 });
  var library = { key: 'library-1' };
  controller.request({
    library: library, sourceContext: { serverMachineIdentifier: 'server-a' },
    viewKey: 'recent', query: {}, start: 0, limit: 30, priority: 20
  }, null);
  controller.request({
    library: library, sourceContext: { serverMachineIdentifier: 'server-a' },
    viewKey: 'catalog', query: {}, start: 0, limit: 60, priority: 20
  }, null);
  controller.request({
    library: library, sourceContext: { serverMachineIdentifier: 'server-a' },
    viewKey: 'catalog', query: {}, start: 0, limit: 60, priority: 0
  }, null);
  finish(requests[0], { items: [{ ratingKey: 'recent' }], totalSize: 1 });
  assert.strictEqual(requests[1].request.viewKey, 'catalog', 'the promoted active request must keep its queued slot');
  assert.strictEqual(requests[1].request.priority, 0, 'reusing a background request for the active tab must promote its priority');
}());

(function testCancelPendingSuppressesLatePresentationCallbacks() {
  requests = [];
  var controller = create({ maxConcurrent: 1 });
  var callbacks = 0;
  controller.request({
    library: { key: 'library-1' }, sourceContext: { serverMachineIdentifier: 'server-a' },
    viewKey: 'recent', query: {}, start: 0, limit: 30, priority: 20
  }, function () { callbacks += 1; });
  controller.cancelPending();
  finish(requests[0], { items: [{ ratingKey: 'late' }], totalSize: 1 });
  assert.strictEqual(callbacks, 0, 'cancelled tab requests must not publish late presentation data');
}());

(function testLruEvictsOnlyCompletedEntries() {
  requests = [];
  var controller = create({ maxConcurrent: 1, maxEntries: 2 });
  function load(view) {
    controller.request({
      library: { key: view }, sourceContext: { serverMachineIdentifier: 'server-a' },
      viewKey: 'catalog', query: {}, start: 0, limit: 60
    }, null);
    finish(requests[requests.length - 1], { items: [{ ratingKey: view }], totalSize: 1 });
  }
  load('one');
  load('two');
  load('three');
  assert.strictEqual(controller.snapshot().ready, 2, 'the cache remains bounded');
  assert.strictEqual(controller.cached({
    library: { key: 'one' }, sourceContext: { serverMachineIdentifier: 'server-a' },
    viewKey: 'catalog', query: {}, start: 0, limit: 60
  }), null, 'the least recently used completed entry is evicted');
}());

(function testVirtualMembershipAndExplicitInvalidationDoNotReuseStaleTabs() {
  requests = [];
  var controller = create();
  var library = { key: 'virtual|movie|film', sourceId: 'virtual|movie|film', virtualLibrary: true, memberSourceIds: ['a|1'] };
  var request = { library: library, viewKey: 'catalog', query: {}, start: 0, limit: 60 };
  var result = null;
  controller.request(request, function (_error, page) { result = page; });
  finish(requests[0], { items: [{ ratingKey: 'a-only' }] });
  assert.strictEqual(result.items[0].ratingKey, 'a-only');

  request.library = { key: library.key, sourceId: library.sourceId, virtualLibrary: true, memberSourceIds: ['a|1', 'b|9'] };
  controller.request(request, function (_error, page) { result = page; });
  assert.strictEqual(requests.length, 2, 'a changed virtual member list must start a fresh tab request');
  finish(requests[1], { items: [{ ratingKey: 'a-and-b' }] });
  assert.strictEqual(result.items[0].ratingKey, 'a-and-b');

  controller.cancelPending();
  controller.request(request, function (_error, page) { result = page; });
  assert.strictEqual(requests.length, 2, 'ordinary tab navigation may reuse a ready result');
  controller.invalidateLibrary(request.library);
  assert.strictEqual(controller.cached({ library: library, viewKey: 'catalog', query: {}, start: 0, limit: 60 }), null,
    'invalidating a virtual library must also remove results for its previous member definition');
  controller.request(request, function (_error, page) { result = page; });
  assert.strictEqual(requests.length, 3, 'an explicit content invalidation must remove ready tab results too');
  finish(requests[2], { items: [{ ratingKey: 'refreshed' }] });
  assert.strictEqual(result.items[0].ratingKey, 'refreshed');
}());

(function testTargetedInvalidationKeepsUnrelatedLibraryReady() {
  requests = [];
  var controller = create();
  var first = { key: '1', sourceId: 'server-a|1' };
  var second = { key: '1', sourceId: 'server-b|1' };
  var firstRequest = { library: first, sourceContext: { serverMachineIdentifier: 'server-a' }, viewKey: 'catalog', query: {}, start: 0, limit: 60 };
  var secondRequest = { library: second, sourceContext: { serverMachineIdentifier: 'server-b' }, viewKey: 'catalog', query: {}, start: 0, limit: 60 };
  controller.request(firstRequest, null);
  finish(requests[0], { items: [{ ratingKey: 'a-item' }] });
  controller.request(secondRequest, null);
  finish(requests[1], { items: [{ ratingKey: 'b-item' }] });
  controller.request({ library: first, sourceContext: firstRequest.sourceContext, viewKey: 'recent', query: {}, start: 0, limit: 30 }, null);
  assert.strictEqual(requests.length, 3);

  controller.invalidateLibrary({ key: '1', sourceId: 'server-a|1' });
  assert.strictEqual(requests[2].aborted, true, 'targeted invalidation must abort pending work for the affected source');
  assert.strictEqual(controller.cached(firstRequest), null, 'targeted invalidation must remove ready results for the affected source');
  assert.strictEqual(controller.cached(secondRequest).items[0].ratingKey, 'b-item',
    'the same Plex section key on another server must remain cached');
  controller.request(secondRequest, null);
  assert.strictEqual(requests.length, 3, 'an unaffected library must not issue a replacement request');
  controller.request(firstRequest, null);
  assert.strictEqual(requests.length, 4, 'the affected library must fetch fresh content on its next visit');
}());

(function testBatchedInvalidationDoesNotStartAnotherAffectedRequest() {
  requests = [];
  var controller = create({ maxConcurrent: 1 });
  var libraries = [
    { key: '1', sourceId: 'server-a|1' },
    { key: '2', sourceId: 'server-a|2' },
    { key: '3', sourceId: 'server-b|3' }
  ];
  libraries.forEach(function (library) {
    controller.request({ library: library, viewKey: 'catalog', query: {}, start: 0, limit: 60 }, null);
  });
  assert.strictEqual(requests.length, 1);
  controller.invalidateLibraries([{ library: libraries[0] }, { library: libraries[1] }]);
  assert.strictEqual(requests[0].aborted, true);
  assert.strictEqual(requests.length, 2, 'only unaffected queued work may start after batched invalidation');
  assert.strictEqual(requests[1].request.library.sourceId, 'server-b|3',
    'another affected library must not briefly start a request that is immediately cancelled');
}());

console.log('library tab prefetch tests passed');
