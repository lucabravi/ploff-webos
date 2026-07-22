'use strict';

var assert = require('assert');
var LibraryLifecycle = require('../app/library-lifecycle');

function createFixture() {
  var gridState = { items: [], totalSize: 0, recommendations: [], focus: { index: 0 } };
  var requests = [];
  var events = [];
  var active = true;
  var scrollTop = 42;
  var lifecycle = LibraryLifecycle.create({
    grid: {
      snapshot: function () { return gridState; },
      reset: function () { gridState.items = []; gridState.totalSize = 0; gridState.recommendations = []; gridState.focus = { index: 0 }; },
      setItems: function (items, totalSize) { gridState.items = items; gridState.totalSize = totalSize; },
      setRecommendations: function (rows) { gridState.recommendations = rows; },
      focusCatalog: function (index) { gridState.focus = { index: index }; }
    },
    scrollTop: function () { return scrollTop; },
    setScrollTop: function (value) { scrollTop = value; },
    isActive: function () { return active; },
    loadRecommendations: function (library, callback) {
      return requestFor('recommendations', callback, { library: library });
    },
    loadContainerPage: function (container, start, limit, callback) {
      return requestFor('container', callback, { container: container, start: start, limit: limit });
    },
    loadLibraryPage: function (library, viewKey, query, start, limit, callback) {
      return requestFor('library', callback, { library: library, viewKey: viewKey, query: query, start: start, limit: limit });
    },
    onReset: function () { events.push('reset'); },
    onStatus: function (snapshot) { events.push('status:' + (snapshot.loading ? 'loading' : 'idle')); },
    onRender: function (result) { events.push('render:' + result.kind); },
    onEmpty: function (result) { events.push('empty:' + result.kind); },
    onContinueAvailable: function (available) { events.push('continue:' + available); }
  });

  function requestFor(kind, callback, data) {
    var request = {
      kind: kind, callback: callback, data: data, aborted: false,
      abort: function () { this.aborted = true; }
    };
    requests.push(request);
    return request;
  }

  function context(overrides) {
    var value = {
      library: { key: 'anime', title: 'Anime' }, viewKey: 'catalog', container: null,
      usesGridScroll: true,
      query: { sort: 'titleSort', direction: 'asc', watched: 'all', filters: {} }
    };
    Object.keys(overrides || {}).forEach(function (key) { value[key] = overrides[key]; });
    return value;
  }

  return {
    lifecycle: lifecycle, requests: requests, events: events, grid: gridState,
    context: context,
    setActive: function (value) { active = value; },
    scrollTop: function () { return scrollTop; }
  };
}

var stale = createFixture();
stale.lifecycle.load(stale.context(), true);
assert.strictEqual(stale.requests[0].kind, 'library', 'catalog load must use the injected library page adapter');
assert.strictEqual(stale.requests[0].data.start, 0, 'reset catalog loads must start at the first result');
assert.strictEqual(stale.requests[0].data.limit, 60, 'grid-scroll catalog loads must request the incremental page size');
stale.lifecycle.load(stale.context(), true);
assert.strictEqual(stale.requests[0].aborted, true, 'a reset load must abort the superseded request');
stale.requests[0].callback(null, { libraryKey: 'anime', items: [{ ratingKey: 'stale' }], totalSize: 1 });
assert.strictEqual(stale.grid.items.length, 0, 'an aborted stale response must not update the grid');
assert.strictEqual(stale.lifecycle.snapshot().loading, true, 'an aborted stale response must not clear the active request loading state');
stale.requests[1].callback(null, { libraryKey: 'anime', items: [{ ratingKey: 'fresh' }], totalSize: 5 });
assert.strictEqual(stale.grid.items[0].ratingKey, 'fresh', 'the active response must update the grid');
assert.strictEqual(stale.lifecycle.snapshot().loading, false, 'a completed response must clear loading state');

var incremental = createFixture();
incremental.grid.items = [{ ratingKey: 'one' }, { ratingKey: 'two' }];
incremental.grid.totalSize = 4;
incremental.lifecycle.load(incremental.context({ usesGridScroll: false }), false);
assert.strictEqual(incremental.requests[0].data.start, 2, 'incremental loads must continue from the loaded item count');
assert.strictEqual(incremental.requests[0].data.limit, 30, 'non-grid rows must retain the compact page size');
incremental.requests[0].callback(null, { libraryKey: 'anime', items: [{ ratingKey: 'three' }], totalSize: 4 });
assert.deepStrictEqual(incremental.grid.items.map(function (item) { return item.ratingKey; }), ['one', 'two', 'three'], 'incremental pages must append rather than replace current items');

var recommendations = createFixture();
recommendations.lifecycle.load(recommendations.context({ viewKey: 'recommended' }), true);
assert.strictEqual(recommendations.requests[0].kind, 'recommendations', 'recommendation tabs must use their dedicated adapter');
recommendations.requests[0].callback(null, []);
assert.deepStrictEqual(recommendations.grid.recommendations, [], 'empty recommendations must be stored in the grid');
assert.ok(recommendations.events.indexOf('empty:recommendations') !== -1, 'empty recommendations must notify the shell so focus can return to tabs');

var inactive = createFixture();
inactive.lifecycle.load(inactive.context(), true);
inactive.setActive(false);
inactive.requests[0].callback(null, { libraryKey: 'anime', items: [{ ratingKey: 'ignored' }], totalSize: 1 });
assert.strictEqual(inactive.grid.items.length, 0, 'responses received after leaving the library must be ignored');

var containers = createFixture();
containers.grid.items = [{ ratingKey: 'parent' }];
containers.grid.totalSize = 1;
containers.grid.focus = { index: 0 };
assert.strictEqual(containers.lifecycle.openContainer({ containerKey: '/collections/1' }), true, 'opening a container must capture the parent grid state');
containers.lifecycle.load(containers.context({ container: containers.lifecycle.snapshot().container }), true);
assert.strictEqual(containers.requests[0].kind, 'container', 'container loads must use their dedicated adapter');
containers.requests[0].callback(null, { libraryKey: 'anime', items: [{ ratingKey: 'child' }], totalSize: 1 });
assert.strictEqual(containers.lifecycle.closeContainer(), true, 'closing a container must restore its parent state');
assert.strictEqual(containers.grid.items[0].ratingKey, 'parent', 'container close must restore the parent items');
assert.strictEqual(containers.scrollTop(), 42, 'container close must restore the parent scroll position');

var continueProbe = createFixture();
continueProbe.lifecycle.probeContinue({ key: 'anime' });
continueProbe.lifecycle.probeContinue({ key: 'movies' });
assert.strictEqual(continueProbe.requests[0].aborted, true, 'a newer continue probe must abort the previous probe');
continueProbe.requests[0].callback(null, { items: [{ ratingKey: 'stale' }] });
assert.strictEqual(continueProbe.lifecycle.snapshot().continueAvailable, null, 'stale continue probes must not change availability');
continueProbe.requests[1].callback(null, { items: [{ ratingKey: 'current' }] });
assert.strictEqual(continueProbe.lifecycle.snapshot().continueAvailable, true, 'the current continue probe must publish availability');

console.log('Library lifecycle checks passed');
