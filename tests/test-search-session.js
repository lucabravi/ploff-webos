'use strict';

var assert = require('assert');
var SearchSession = require('../app/search-session');

var timers = [];
var requests = [];
var results = [];
var loading = 0;
var typeMore = 0;
var active = true;
var root = {
  clearTimeout: function (timer) { if (timer) { timer.cleared = true; } },
  setTimeout: function (callback, delay) {
    var timer = { callback: callback, delay: delay, cleared: false };
    timers.push(timer);
    return timer;
  }
};
var session = SearchSession.create({
  root: root,
  isActive: function () { return active; },
  load: function (query, callback) {
    var request = { query: query, aborted: false, abort: function () { this.aborted = true; } };
    requests.push({ callback: callback, request: request });
    return request;
  },
  onLoading: function () { loading += 1; },
  onResults: function (error, items) { results.push({ error: error, items: items }); },
  onTypeMore: function () { typeMore += 1; }
});

session.update('r');
assert.strictEqual(typeMore, 1, 'queries shorter than two characters must not start a request');
assert.strictEqual(timers.length, 0, 'short queries must not schedule a debounce timer');

session.update('re');
assert.strictEqual(loading, 1, 'a searchable query must enter loading immediately');
assert.strictEqual(timers.length, 1, 'a searchable query must be debounced');
assert.strictEqual(timers[0].delay, 300, 'the search debounce must remain three hundred milliseconds');
timers[0].callback();
assert.strictEqual(requests.length, 1, 'the debounce must invoke the injected search adapter once');

session.update('ren');
assert.strictEqual(requests[0].request.aborted, true, 'a newer query must abort the older request');
timers[1].callback();
assert.strictEqual(requests.length, 2, 'the newer debounce must start its own request');
requests[0].callback(null, [{ ratingKey: 'old' }]);
assert.strictEqual(results.length, 0, 'a stale callback must not replace newer search results');
requests[1].callback(null, [{ ratingKey: 'new' }]);
assert.deepStrictEqual(results, [{ error: null, items: [{ ratingKey: 'new' }] }], 'only the current search callback may publish results');

session.update('rent');
timers[2].callback();
active = false;
requests[2].callback(null, [{ ratingKey: 'inactive' }]);
assert.strictEqual(results.length, 1, 'results must not render after the search view closes');

session.cancel();
assert.strictEqual(requests[2].request.aborted, true, 'cancelling the search session must abort the active request');

var partialResults = [];
var partialCallback = null;
var partialRequest = { aborted: false, abort: function () { this.aborted = true; } };
var partialSession = SearchSession.create({
  root: { clearTimeout: function () {}, setTimeout: function (callback) { callback(); return null; } },
  isActive: function () { return true; },
  load: function (query, callback) { partialCallback = callback; return partialRequest; },
  onLoading: function () {},
  onResults: function (error, items) { partialResults.push(items); },
  onTypeMore: function () {}
});
partialSession.update('cloud');
partialCallback(null, [{ ratingKey: 'local' }], false);
partialSession.cancel();
assert.strictEqual(partialRequest.aborted, true, 'a partial local result must keep its request cancellable while cloud matching continues');
partialSession.update('cloud');
partialCallback(null, [{ ratingKey: 'merged' }], true);
assert.deepStrictEqual(partialResults, [[{ ratingKey: 'local' }], [{ ratingKey: 'merged' }]], 'a search adapter must be able to publish local results before its cloud merge finishes');

console.log('Search session checks passed');
