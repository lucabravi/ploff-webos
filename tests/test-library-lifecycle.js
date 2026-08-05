'use strict';

var assert = require('assert');
var LibraryLifecycle = require('../app/library-lifecycle');

function createFixture() {
  var gridState = { items: [], totalSize: 0, recommendations: [], focus: { index: 0 } };
  var requests = [];
  var events = [];
  var deferred = [];
  var active = true;
  var scrollTop = 42;
  var gridCalls = { appendItems: 0, setItems: 0, snapshot: 0 };
  var lifecycle = LibraryLifecycle.create({
    grid: {
      snapshot: function () { gridCalls.snapshot += 1; return gridState; },
      navigationSnapshot: function () {
        return {
          itemCount: gridState.items.length,
          recommendationItemCount: gridState.recommendations.reduce(function (total, row) { return total + (row.items || []).length; }, 0),
          totalSize: gridState.totalSize,
          focus: gridState.focus
        };
      },
      reset: function () { gridState.items = []; gridState.totalSize = 0; gridState.recommendations = []; gridState.focus = { index: 0 }; },
      setItems: function (items, totalSize) { gridCalls.setItems += 1; gridState.items = items; gridState.totalSize = totalSize; },
      appendItems: function (items, totalSize) { gridCalls.appendItems += 1; Array.prototype.push.apply(gridState.items, items); gridState.totalSize = totalSize; },
      setRecommendations: function (rows) { gridState.recommendations = rows; },
      focusCatalog: function (index) { gridState.focus = { index: index }; }
    },
    scrollTop: function () { return scrollTop; },
    setScrollTop: function (value) { scrollTop = value; },
    defer: function (callback) { deferred.push(callback); },
    isActive: function () { return active; },
    loadRecommendations: function (library, callback) {
      return requestFor('recommendations', callback, { library: library });
    },
    loadContainerPage: function (container, start, limit, callback) {
      return requestFor('container', callback, { container: container, start: start, limit: limit });
    },
    loadContainerSummaryPage: function (container, start, limit, callback) {
      return requestFor('container-summary', callback, { container: container, start: start, limit: limit });
    },
    shouldSummarizeContainer: function (container) {
      return container && (container.containerType === 'playlist' || container.containerType === 'collection');
    },
    initialContainerFocusIndex: function (items, container) {
      var index;
      if (!container || container.containerType !== 'playlist') { return -1; }
      for (index = 0; index < items.length; index += 1) {
        if (items[index].viewed !== true || (Number(items[index].progress || 0) > 0 && Number(items[index].progress || 0) < 100)) {
          return index;
        }
      }
      return items.length ? 0 : -1;
    },
    summarizeContainerItems: function (items) { return { count: items.length, keys: items.map(function (item) { return item.ratingKey; }) }; },
    loadLibraryPage: function (library, viewKey, query, start, limit, callback) {
      return requestFor('library', callback, { library: library, viewKey: viewKey, query: query, start: start, limit: limit });
    },
    onReset: function () { events.push('reset'); },
    onStatus: function (snapshot) { events.push('status:' + (snapshot.loading ? 'loading' : 'idle')); },
    onRender: function (result) { events.push('render:' + result.kind); },
    onEmpty: function (result) { events.push('empty:' + result.kind); },
    onContinueAvailable: function (available) { events.push('continue:' + available); },
    onCollectionsAvailable: function (available) { events.push('collections:' + available); },
    onContainerSummary: function (snapshot) { events.push('summary:' + (snapshot.containerSummaryLoading ? 'loading' : (snapshot.containerSummary ? 'ready' : 'idle'))); }
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
    lifecycle: lifecycle, requests: requests, events: events, grid: gridState, gridCalls: gridCalls,
    context: context,
    flushDeferred: function () {
      var pending = deferred.slice();
      deferred = [];
      pending.forEach(function (callback) { callback(); });
    },
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
assert.strictEqual(incremental.gridCalls.appendItems, 1, 'ordinary incremental pages must use the grid append path');
assert.strictEqual(incremental.gridCalls.setItems, 0, 'ordinary incremental pages must not replace the complete catalog');
assert.strictEqual(incremental.gridCalls.snapshot, 0, 'ordinary incremental pages must not copy the complete catalog');

var recent = createFixture();
recent.lifecycle.load(recent.context({ viewKey: 'recent' }), true);
recent.requests[0].callback(null, {
  libraryKey: 'anime',
  items: [{ ratingKey: 'season-1', type: 'season', detail: '2 episodes', detailKey: 'media.episodeCount', detailParameters: { count: 2 }, viewed: true }],
  totalSize: 4,
  nextStart: 2,
  hasMore: true
});
assert.strictEqual(recent.grid.totalSize, 2, 'grouped recent pages must expose one sentinel item while more raw Plex entries remain');
recent.lifecycle.load(recent.context({ viewKey: 'recent' }), false);
assert.strictEqual(recent.requests[1].data.start, 2, 'grouped recent pagination must continue from the raw Plex offset');
recent.requests[1].callback(null, {
  libraryKey: 'anime',
  items: [{ ratingKey: 'season-1', type: 'season', detail: '2 episodes', detailKey: 'media.episodeCount', detailParameters: { count: 2 } }],
  totalSize: 4,
  nextStart: 4,
  hasMore: false
});
assert.strictEqual(recent.grid.items.length, 1, 'a season split across recent pages must remain one card');
assert.strictEqual(recent.grid.items[0].detailParameters.count, 4, 'split recent season groups must accumulate their episode counts');
assert.strictEqual(recent.grid.items[0].viewed, undefined, 'a merged recent season is viewed only when every grouped page is viewed');
assert.strictEqual(recent.grid.totalSize, 1, 'the grouped recent grid must stop requesting pages at the raw terminal boundary');
assert.ok(recent.gridCalls.snapshot >= 2, 'recent grouping may read the complete resident catalog to merge page boundaries');
recent.lifecycle.setNextStart(8);
assert.strictEqual(recent.lifecycle.snapshot().nextStart, 8, 'cached library state may restore an explicit raw Plex offset');
recent.lifecycle.clearContainer();
assert.strictEqual(recent.lifecycle.snapshot().nextStart, null, 'clearing a container context must discard unrelated pagination state');

var recentBoundary = createFixture();
var seasonTemplate = { ratingKey: 'season-boundary', type: 'season', title: 'Show', meta: 'Season 1' };
recentBoundary.lifecycle.load(recentBoundary.context({ viewKey: 'recent' }), true);
recentBoundary.requests[0].callback(null, {
  libraryKey: 'anime',
  items: [{
    ratingKey: 'episode-1', type: 'episode', title: 'Show', detail: 'E01',
    recentGroup: { key: 'season-boundary', count: 1, viewedCount: 1, seasonItem: seasonTemplate }
  }],
  totalSize: 2,
  nextStart: 1,
  hasMore: true
});
assert.strictEqual(recentBoundary.grid.items[0].type, 'episode', 'a recent singleton must remain an episode until another page confirms the group');
recentBoundary.lifecycle.load(recentBoundary.context({ viewKey: 'recent' }), false);
recentBoundary.requests[1].callback(null, {
  libraryKey: 'anime',
  items: [{
    ratingKey: 'episode-2', type: 'episode', title: 'Show', detail: 'E02',
    recentGroup: { key: 'season-boundary', count: 1, viewedCount: 0, seasonItem: seasonTemplate }
  }],
  totalSize: 2,
  nextStart: 2,
  hasMore: false
});
assert.strictEqual(recentBoundary.grid.items.length, 1, 'singleton episodes split across pages must merge into one season card');
assert.strictEqual(recentBoundary.grid.items[0].type, 'season', 'a confirmed cross-page group must use season presentation');
assert.strictEqual(recentBoundary.grid.items[0].detailParameters.count, 2, 'cross-page singleton groups must accumulate their raw episode counts');
assert.strictEqual(recentBoundary.grid.items[0].viewed, undefined, 'cross-page grouped viewed state must require every episode to be viewed');

var refresh = createFixture();
refresh.grid.items = [{ ratingKey: 'cached-one' }, { ratingKey: 'cached-two' }];
refresh.grid.totalSize = 2;
refresh.lifecycle.load(refresh.context(), false, true);
assert.strictEqual(refresh.requests[0].data.start, 0, 'a silent cached refresh must restart from the first server page');
assert.strictEqual(refresh.grid.items[0].ratingKey, 'cached-one', 'a silent cached refresh must preserve visible data while the request is pending');
refresh.requests[0].callback(null, { libraryKey: 'anime', items: [{ ratingKey: 'fresh-one' }], totalSize: 1 });
assert.deepStrictEqual(refresh.grid.items.map(function (item) { return item.ratingKey; }), ['fresh-one'], 'a silent cached refresh must replace stale items in place');

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

var playlistInitialFocus = createFixture();
playlistInitialFocus.grid.items = [{ ratingKey: 'playlist-card', containerKey: '/playlists/focus', containerType: 'playlist' }];
playlistInitialFocus.grid.totalSize = 1;
playlistInitialFocus.lifecycle.openContainer({ containerKey: '/playlists/focus', containerType: 'playlist', title: 'Queue' });
playlistInitialFocus.lifecycle.load(playlistInitialFocus.context({ container: playlistInitialFocus.lifecycle.snapshot().container }), true);
playlistInitialFocus.requests.filter(function (request) { return request.kind === 'container'; })[0].callback(null, {
  items: [
    { ratingKey: 'watched', viewed: true, progress: 100 },
    { ratingKey: 'partial', viewed: false, progress: 37 },
    { ratingKey: 'unwatched', viewed: false, progress: 0 }
  ],
  totalSize: 3
});
assert.strictEqual(playlistInitialFocus.grid.focus.index, 1,
  'playlist detail must focus the first unfinished item, including partially watched media');

var allWatchedPlaylistInitialFocus = createFixture();
allWatchedPlaylistInitialFocus.lifecycle.openContainer({ containerKey: '/playlists/watched', containerType: 'playlist' });
allWatchedPlaylistInitialFocus.lifecycle.load(allWatchedPlaylistInitialFocus.context({ container: allWatchedPlaylistInitialFocus.lifecycle.snapshot().container }), true);
allWatchedPlaylistInitialFocus.requests.filter(function (request) { return request.kind === 'container'; })[0].callback(null, {
  items: [{ ratingKey: 'first', viewed: true, progress: 100 }, { ratingKey: 'second', viewed: true, progress: 100 }],
  totalSize: 2
});
assert.strictEqual(allWatchedPlaylistInitialFocus.grid.focus.index, 0,
  'an all-watched playlist must keep the first item as its fallback focus');

var continueProbe = createFixture();
continueProbe.lifecycle.probeContinue({ key: 'anime' });
continueProbe.lifecycle.probeContinue({ key: 'movies' });
assert.strictEqual(continueProbe.requests[0].aborted, true, 'a newer continue probe must abort the previous probe');
continueProbe.requests[0].callback(null, { items: [{ ratingKey: 'stale' }] });
assert.strictEqual(continueProbe.lifecycle.snapshot().continueAvailable, null, 'stale continue probes must not change availability');
continueProbe.requests[1].callback(null, { items: [{ ratingKey: 'current' }] });
assert.strictEqual(continueProbe.lifecycle.snapshot().continueAvailable, true, 'the current continue probe must publish availability');



var collectionsProbe = createFixture();
collectionsProbe.lifecycle.probeCollections({ key: 'anime' });
collectionsProbe.lifecycle.probeCollections({ key: 'movies' });
assert.strictEqual(collectionsProbe.requests[0].aborted, true, 'a newer Collections probe must abort the previous probe');
collectionsProbe.requests[0].callback(null, { items: [{ ratingKey: 'stale-collection' }] });
assert.strictEqual(collectionsProbe.lifecycle.snapshot().collectionsAvailable, null, 'stale Collections probes must not change availability');
collectionsProbe.requests[1].callback(null, { items: [] });
assert.strictEqual(collectionsProbe.lifecycle.snapshot().collectionsAvailable, false, 'an empty current Collections probe must disable the tab');
assert.ok(collectionsProbe.events.indexOf('collections:false') !== -1, 'Collections availability changes must notify the shell');

var collectionsLeave = createFixture();
collectionsLeave.lifecycle.probeCollections({ key: 'anime' });
var collectionsLeaveRequest = collectionsLeave.requests[0];
collectionsLeave.lifecycle.leave();
assert.strictEqual(collectionsLeaveRequest.aborted, true, 'leaving the library must abort a pending Collections probe');
collectionsLeaveRequest.callback(null, { items: [{ ratingKey: 'late' }] });
assert.strictEqual(collectionsLeave.lifecycle.snapshot().collectionsAvailable, null, 'late Collections callbacks after leave must be ignored');

var playlistSummary = createFixture();
playlistSummary.grid.items = [{ ratingKey: 'playlist-card', containerKey: '/playlists/1', containerType: 'playlist' }];
playlistSummary.grid.totalSize = 1;
assert.strictEqual(playlistSummary.lifecycle.openContainer({ containerKey: '/playlists/1', containerType: 'playlist', title: 'Queue' }), true);
playlistSummary.lifecycle.load(playlistSummary.context({ container: playlistSummary.lifecycle.snapshot().container }), true);
assert.strictEqual(playlistSummary.requests.filter(function (request) { return request.kind === 'container-summary'; }).length, 0, 'playlist summary hydration must not compete with the visible container page');
var playlistPageRequest = playlistSummary.requests.filter(function (request) { return request.kind === 'container'; })[0];
playlistPageRequest.callback(null, { items: [{ ratingKey: 'one' }], totalSize: 2 });
assert.strictEqual(playlistSummary.requests.filter(function (request) { return request.kind === 'container-summary'; }).length, 0, 'playlist summary hydration must wait until the rendered page has yielded');
assert.ok(playlistSummary.events.indexOf('render:page') !== -1, 'the visible playlist page must render before summary hydration starts');
playlistSummary.flushDeferred();
var summaryRequest = playlistSummary.requests.filter(function (request) { return request.kind === 'container-summary'; })[0];
assert.ok(summaryRequest, 'opening a playlist container must start deferred summary hydration after its visible page');
assert.strictEqual(playlistSummary.lifecycle.snapshot().containerSummaryLoading, true, 'playlist summary hydration must publish its loading state');
assert.strictEqual(summaryRequest.data.start, 1, 'playlist summary hydration must continue after the already rendered prefix');
summaryRequest.callback(null, { items: [{ ratingKey: 'two' }], totalSize: 2 });
assert.deepStrictEqual(playlistSummary.lifecycle.snapshot().containerSummary, { count: 2, keys: ['one', 'two'] }, 'the completed playlist summary must use every paginated item');
assert.strictEqual(playlistSummary.lifecycle.snapshot().containerSummaryLoading, false, 'summary loading must stop after the final page');
playlistSummary.lifecycle.setContainerSummary({ count: 3, keys: ['one', 'two', 'three'] });
assert.deepStrictEqual(playlistSummary.lifecycle.snapshot().containerSummary, { count: 3, keys: ['one', 'two', 'three'] }, 'a complete playback queue may hydrate the active container summary without another request');

var completePlaylistSummary = createFixture();
completePlaylistSummary.lifecycle.openContainer({ containerKey: '/playlists/complete', containerType: 'playlist' });
completePlaylistSummary.lifecycle.load(completePlaylistSummary.context({ container: completePlaylistSummary.lifecycle.snapshot().container }), true);
completePlaylistSummary.requests.filter(function (request) { return request.kind === 'container'; })[0].callback(null, {
  items: [{ ratingKey: 'only' }],
  totalSize: 1
});
completePlaylistSummary.flushDeferred();
assert.strictEqual(completePlaylistSummary.requests.filter(function (request) { return request.kind === 'container-summary'; }).length, 0, 'a fully rendered playlist must calculate its summary without another Plex request');
assert.deepStrictEqual(completePlaylistSummary.lifecycle.snapshot().containerSummary, { count: 1, keys: ['only'] }, 'a fully rendered playlist must publish its summary from resident records');

var completeCollectionSummary = createFixture();
completeCollectionSummary.lifecycle.openContainer({ containerKey: '/collections/complete', containerType: 'collection' });
completeCollectionSummary.lifecycle.load(completeCollectionSummary.context({ container: completeCollectionSummary.lifecycle.snapshot().container }), true);
completeCollectionSummary.requests.filter(function (request) { return request.kind === 'container'; })[0].callback(null, {
  items: [{ ratingKey: 'first' }, { ratingKey: 'second' }],
  totalSize: 2
});
completeCollectionSummary.flushDeferred();
assert.strictEqual(completeCollectionSummary.requests.filter(function (request) { return request.kind === 'container-summary'; }).length, 0, 'a fully rendered collection must calculate its summary without another Plex request');
assert.deepStrictEqual(completeCollectionSummary.lifecycle.snapshot().containerSummary, { count: 2, keys: ['first', 'second'] }, 'a fully rendered collection must publish its summary from resident records');

var staleSummary = createFixture();
staleSummary.grid.items = [{ ratingKey: 'playlist-card' }];
staleSummary.grid.totalSize = 1;
staleSummary.lifecycle.openContainer({ containerKey: '/playlists/old', containerType: 'playlist' });
staleSummary.lifecycle.load(staleSummary.context({ container: staleSummary.lifecycle.snapshot().container }), true);
staleSummary.requests.filter(function (request) { return request.kind === 'container'; })[0].callback(null, { items: [{ ratingKey: 'old' }], totalSize: 2 });
staleSummary.flushDeferred();
var staleSummaryRequest = staleSummary.requests.filter(function (request) { return request.kind === 'container-summary'; })[0];
staleSummary.lifecycle.clearContainer();
assert.strictEqual(staleSummaryRequest.aborted, true, 'closing a playlist container must abort summary hydration');
staleSummaryRequest.callback(null, { items: [{ ratingKey: 'stale' }], totalSize: 1 });
assert.strictEqual(staleSummary.lifecycle.snapshot().containerSummary, null, 'late summary callbacks must not repopulate a closed container');

var leaveSummary = createFixture();
leaveSummary.grid.items = [{ ratingKey: 'playlist-card' }];
leaveSummary.grid.totalSize = 1;
leaveSummary.lifecycle.openContainer({ containerKey: '/playlists/leave', containerType: 'playlist' });
leaveSummary.lifecycle.load(leaveSummary.context({ container: leaveSummary.lifecycle.snapshot().container }), true);
leaveSummary.requests.filter(function (request) { return request.kind === 'container'; })[0].callback(null, { items: [{ ratingKey: 'leave' }], totalSize: 2 });
leaveSummary.flushDeferred();
var leaveSummaryRequest = leaveSummary.requests.filter(function (request) { return request.kind === 'container-summary'; })[0];
leaveSummary.lifecycle.leave();
assert.strictEqual(leaveSummaryRequest.aborted, true, 'leaving the library must abort playlist summary hydration');

console.log('Library lifecycle checks passed');
