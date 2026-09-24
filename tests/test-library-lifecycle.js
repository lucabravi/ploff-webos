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
  var gridCalls = { appendItems: 0, setItems: 0, snapshot: 0, initialFocusIndex: -1, focusCatalog: 0 };
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
      setItems: function (items, totalSize, initialFocusIndex) {
        gridCalls.setItems += 1;
        gridCalls.initialFocusIndex = Number(initialFocusIndex === undefined ? -1 : initialFocusIndex);
        gridState.items = items;
        gridState.totalSize = totalSize;
        if (gridCalls.initialFocusIndex >= 0) { gridState.focus = { index: gridCalls.initialFocusIndex }; }
      },
      appendItems: function (items, totalSize) { gridCalls.appendItems += 1; Array.prototype.push.apply(gridState.items, items); gridState.totalSize = totalSize; },
      setRecommendations: function (rows) { gridState.recommendations = rows; },
      focusCatalog: function (index) { gridCalls.focusCatalog += 1; gridState.focus = { index: index }; }
    },
    scrollTop: function () { return scrollTop; },
    setScrollTop: function (value) { scrollTop = value; },
    defer: function (callback) { deferred.push(callback); },
    isActive: function () { return active; },
    loadRecommendations: function (library, callback, onProgress) {
      return requestFor('recommendations', callback, { library: library }, onProgress);
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
    loadLibraryPage: function (library, viewKey, query, start, limit, callback, onProgress) {
      return requestFor('library', callback, { library: library, viewKey: viewKey, query: query, start: start, limit: limit }, onProgress);
    },
    onReset: function () { events.push('reset'); },
    onStatus: function (snapshot) { events.push('status:' + (snapshot.loading ? 'loading' : 'idle')); },
    onRender: function (result) { events.push('render:' + result.kind); },
    onEmpty: function (result) { events.push('empty:' + result.kind); },
    onContinueAvailable: function (available) { events.push('continue:' + available); },
    onCollectionsAvailable: function (available) { events.push('collections:' + available); },
    onContainerSummary: function (snapshot) { events.push('summary:' + (snapshot.containerSummaryLoading ? 'loading' : (snapshot.containerSummary ? 'ready' : 'idle'))); }
  });

  function requestFor(kind, callback, data, onProgress) {
    var request = {
      kind: kind, callback: callback, progress: onProgress, data: data, aborted: false,
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

var stagedTab = createFixture();
stagedTab.grid.items = [{ ratingKey: 'resident' }];
var stagedReplacements = 0;
stagedTab.lifecycle.load(stagedTab.context({ beforeReplace: function () {
  stagedReplacements += 1;
  stagedTab.grid.items = [];
} }), false, true);
assert.strictEqual(stagedTab.grid.items[0].ratingKey, 'resident', 'staged tab load preserves resident cards until progress arrives');
stagedTab.requests[0].progress(null, { libraryKey: 'anime', items: [{ ratingKey: 'partial' }], totalSize: 2 });
assert.strictEqual(stagedReplacements, 1, 'replacement hook runs before the first progressive page');
assert.strictEqual(stagedTab.grid.items[0].ratingKey, 'partial', 'the first progressive page becomes visible');
stagedTab.requests[0].callback(null, { libraryKey: 'anime', items: [{ ratingKey: 'final' }], totalSize: 2, nextStart: 1 });
assert.strictEqual(stagedReplacements, 1, 'the replacement hook only runs once for a progressive load');
assert.strictEqual(stagedTab.grid.items[0].ratingKey, 'final', 'the final page replaces progress without restoring stale cards');

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

(function progressiveCatalogKeepsLoadingUntilTheFinalMember() {
  var fixture = createFixture();
  fixture.lifecycle.load(fixture.context(), true);
  fixture.requests[0].progress(null, {
    libraryKey: 'anime', items: [{ ratingKey: 'first' }], totalSize: 2, nextStart: 1, hasMore: true
  });
  assert.strictEqual(fixture.grid.items[0].ratingKey, 'first', 'the first member must populate the catalog immediately');
  assert.strictEqual(fixture.lifecycle.snapshot().loading, true, 'progress must not release the outstanding load');
  fixture.requests[0].callback(null, {
    libraryKey: 'anime', items: [{ ratingKey: 'first' }, { ratingKey: 'second' }], totalSize: 2, nextStart: 2, hasMore: false
  });
  assert.deepStrictEqual(fixture.grid.items.map(function (item) { return item.ratingKey; }), ['first', 'second']);
  assert.strictEqual(fixture.lifecycle.snapshot().loading, false, 'the final response must release the load');
  fixture.lifecycle.load(fixture.context(), true);
  fixture.lifecycle.load(fixture.context(), true);
  fixture.requests[1].progress(null, {
    libraryKey: 'anime', items: [{ ratingKey: 'stale' }], totalSize: 1, nextStart: 1, hasMore: false
  });
  assert.strictEqual(fixture.grid.items.length, 0, 'late progress from an aborted request must not repopulate the active grid');
}());


var locallyFilteredCatalog = createFixture();
locallyFilteredCatalog.lifecycle.load(locallyFilteredCatalog.context({ query: { sort: 'titleSort', direction: 'asc', watched: 'unwatched', filters: {} } }), true);
locallyFilteredCatalog.requests[0].callback(null, {
  libraryKey: 'anime',
  items: Array.apply(null, Array(59)).map(function (_, index) { return { ratingKey: 'visible-a-' + index, plexSourceOffset: index < 20 ? index : index + 1 }; }),
  totalSize: 120,
  nextStart: 60,
  hasMore: true,
  localFilteredCount: 1
});
assert.strictEqual(locallyFilteredCatalog.lifecycle.snapshot().nextStart, 60,
  'unwatched local filtering must retain the raw Plex continuation offset rather than the visible item count');
assert.strictEqual(locallyFilteredCatalog.grid.items.length, 59,
  'the resident catalog must contain only locally accepted unwatched cards');
assert.strictEqual(locallyFilteredCatalog.grid.totalSize, 60,
  'while raw Plex pages remain, locally filtered catalogs need only one sentinel slot to keep lazy loading active');
locallyFilteredCatalog.lifecycle.load(locallyFilteredCatalog.context({ query: { sort: 'titleSort', direction: 'asc', watched: 'unwatched', filters: {} } }), false);
assert.strictEqual(locallyFilteredCatalog.requests[1].data.start, 60,
  'the next page after a local rejection must begin at the raw Plex offset, not at the shorter visible length');
locallyFilteredCatalog.requests[1].callback(null, {
  libraryKey: 'anime',
  items: Array.apply(null, Array(58)).map(function (_, index) { return { ratingKey: 'visible-b-' + index, plexSourceOffset: 60 + index + (index > 10 ? 2 : 0) }; }),
  totalSize: 120,
  nextStart: 120,
  hasMore: false,
  localFilteredCount: 2
});
assert.strictEqual(locallyFilteredCatalog.grid.items.length, 117,
  'all surviving cards across locally corrected pages must remain resident');
assert.strictEqual(locallyFilteredCatalog.grid.totalSize, 117,
  'a terminal locally corrected unwatched page must collapse the visible total to the actual resident count');
assert.strictEqual(locallyFilteredCatalog.lifecycle.snapshot().nextStart, 120,
  'terminal local filtering must still remember the consumed raw Plex boundary');


var emptyCorrectedPage = createFixture();
emptyCorrectedPage.lifecycle.load(emptyCorrectedPage.context({ query: { sort: 'titleSort', direction: 'asc', watched: 'unwatched', filters: {} } }), true);
emptyCorrectedPage.requests[0].callback(null, {
  libraryKey: 'anime',
  items: [],
  totalSize: 120,
  nextStart: 60,
  hasMore: true,
  localFilteredCount: 60
});
assert.strictEqual(emptyCorrectedPage.requests.length, 2,
  'an unwatched page containing only locally rejected Plex rows must automatically continue to the next raw page');
assert.strictEqual(emptyCorrectedPage.requests[1].data.start, 60,
  'automatic empty-page recovery must continue from the raw Plex boundary');
emptyCorrectedPage.requests[1].callback(null, {
  libraryKey: 'anime',
  items: [{ ratingKey: 'first-real-unwatched', plexSourceOffset: 95 }],
  totalSize: 120,
  nextStart: 120,
  hasMore: false,
  localFilteredCount: 59
});
assert.strictEqual(emptyCorrectedPage.grid.items.length, 1,
  'automatic empty-page recovery must surface later legitimate unwatched rows');
assert.strictEqual(emptyCorrectedPage.grid.totalSize, 1,
  'a terminal recovered page must expose the exact visible total');

var terminalEmptyCorrectedPage = createFixture();
terminalEmptyCorrectedPage.lifecycle.load(terminalEmptyCorrectedPage.context({ query: { sort: 'titleSort', direction: 'asc', watched: 'unwatched', filters: {} } }), true);
terminalEmptyCorrectedPage.requests[0].callback(null, {
  libraryKey: 'anime',
  items: [],
  totalSize: 60,
  nextStart: 60,
  hasMore: false,
  localFilteredCount: 60
});
assert.strictEqual(terminalEmptyCorrectedPage.requests.length, 1,
  'a terminal page containing only locally rejected rows must not issue another request');
assert.strictEqual(terminalEmptyCorrectedPage.grid.totalSize, 0,
  'a terminal all-rejected unwatched catalog must become truly empty');

var invalidatedContent = createFixture();
invalidatedContent.lifecycle.load(invalidatedContent.context(), true);
invalidatedContent.requests[0].callback(null, { libraryKey: 'anime', items: [{ ratingKey: 'resident' }], totalSize: 2 });
invalidatedContent.lifecycle.load(invalidatedContent.context(), false);
assert.strictEqual(invalidatedContent.lifecycle.snapshot().loading, true,
  'incremental Library content may have an active request before another feature mutates Plex state');
assert.strictEqual(typeof invalidatedContent.lifecycle.invalidateContentRequest, 'function',
  'Library lifecycle must expose a non-destructive content invalidation for watched/progress mutations');
invalidatedContent.lifecycle.invalidateContentRequest();
assert.strictEqual(invalidatedContent.requests[1].aborted, true,
  'content invalidation must abort a request created against pre-mutation Plex state');
assert.strictEqual(invalidatedContent.lifecycle.snapshot().loading, false,
  'content invalidation must release the loading lock so an authoritative replacement can start immediately');
invalidatedContent.requests[1].callback(null, { libraryKey: 'anime', items: [{ ratingKey: 'stale-after-mutation' }], totalSize: 2 });
assert.strictEqual(invalidatedContent.grid.items.length, 1,
  'a late pre-mutation response must not alter the resident grid after content invalidation');
assert.strictEqual(invalidatedContent.grid.items[0].ratingKey, 'resident',
  'content invalidation must preserve the resident grid until the replacement arrives');
invalidatedContent.lifecycle.load(invalidatedContent.context(), false, true);
assert.strictEqual(invalidatedContent.requests.length, 3,
  'an authoritative replacement load must be allowed immediately after invalidation');
assert.strictEqual(invalidatedContent.requests[2].data.start, 0,
  'authoritative replacement after invalidation must restart from Plex offset zero');
invalidatedContent.requests[2].callback(null, { libraryKey: 'anime', items: [{ ratingKey: 'fresh-after-mutation' }], totalSize: 1 });
assert.strictEqual(invalidatedContent.grid.items[0].ratingKey, 'fresh-after-mutation',
  'the post-mutation replacement must become the authoritative resident grid');

(function reloadKeepsResidentCardsUntilTheAuthoritativePageArrives() {
  var fixture = createFixture();
  var oldCard = { ratingKey: 'resident' };
  fixture.lifecycle.load(fixture.context(), true);
  fixture.requests[0].callback(null, { libraryKey: 'anime', items: [oldCard], totalSize: 2, nextStart: 1 });
  fixture.lifecycle.load(fixture.context(), false);
  fixture.lifecycle.reload(fixture.context());
  assert.strictEqual(fixture.requests[1].aborted, true, 'reload must abort a stale incremental request');
  assert.strictEqual(fixture.requests[2].data.start, 0, 'reload must replace from the first Plex offset');
  assert.strictEqual(fixture.grid.items[0], oldCard, 'reload must leave resident cards mounted while loading');
  fixture.requests[2].progress(null, { libraryKey: 'anime', items: [{ ratingKey: 'partial' }], totalSize: 2 });
  assert.strictEqual(fixture.grid.items[0], oldCard, 'partial member data must not clear resident cards during reload');
  fixture.requests[1].callback(null, { libraryKey: 'anime', items: [{ ratingKey: 'stale' }], totalSize: 1 });
  assert.strictEqual(fixture.grid.items[0], oldCard, 'aborted pagination must not replace resident cards');
  fixture.requests[2].callback(null, { libraryKey: 'anime', items: [{ ratingKey: 'fresh' }], totalSize: 1 });
  assert.strictEqual(fixture.grid.items[0].ratingKey, 'fresh', 'final reload response must replace resident cards');
  fixture.lifecycle.reload(fixture.context());
  fixture.requests[3].callback(new Error('offline'));
  assert.strictEqual(fixture.grid.items[0].ratingKey, 'fresh', 'failed reload must retain the last usable cards');
}());

(function reloadKeepsResidentRecommendationsOnError() {
  var fixture = createFixture();
  var rows = [{ title: 'Resident', items: [{ ratingKey: 'resident' }] }];
  fixture.lifecycle.load(fixture.context({ viewKey: 'recommended' }), true);
  fixture.requests[0].callback(null, rows);
  fixture.lifecycle.reload(fixture.context({ viewKey: 'recommended' }));
  fixture.requests[1].progress(null, [{ title: 'Partial', items: [{ ratingKey: 'partial' }] }]);
  assert.strictEqual(fixture.grid.recommendations[0], rows[0], 'partial recommendations must not displace resident rows');
  fixture.requests[1].callback(new Error('offline'));
  assert.strictEqual(fixture.grid.recommendations[0], rows[0], 'failed recommendations reload must keep resident rows');
}());

var boundedCatalog = createFixture();
boundedCatalog.grid.items = Array.apply(null, Array(180)).map(function (_, index) { return { ratingKey: 'item-' + index }; });
boundedCatalog.grid.totalSize = 180;
boundedCatalog.grid.focus = { index: 95 };
assert.strictEqual(typeof boundedCatalog.lifecycle.refreshCatalogWindow, 'function',
  'Library lifecycle must expose a bounded catalog reconciliation path');
boundedCatalog.lifecycle.refreshCatalogWindow(boundedCatalog.context(), 60, 60, { ratingKey: 'item-95', index: 95 });
assert.strictEqual(boundedCatalog.requests[0].kind, 'library',
  'bounded catalog reconciliation must use the regular Plex library page adapter');
assert.strictEqual(boundedCatalog.requests[0].data.start, 60,
  'bounded catalog reconciliation must request the selected resident block directly');
assert.strictEqual(boundedCatalog.requests[0].data.limit, 60,
  'bounded catalog reconciliation must never scale with the number of previously loaded pages');
boundedCatalog.requests[0].callback(null, {
  libraryKey: 'anime',
  items: Array.apply(null, Array(60)).map(function (_, index) {
    var oldIndex = index < 30 ? 60 + index : 61 + index;
    return { ratingKey: 'item-' + oldIndex };
  }),
  totalSize: 179,
  nextStart: 120
});
assert.strictEqual(boundedCatalog.grid.items.length, 179,
  'bounded catalog reconciliation must preserve the already resident suffix while removing duplicates at the refreshed boundary');
assert.strictEqual(boundedCatalog.grid.items[94].ratingKey, 'item-95',
  'the refreshed block may shift the focused Plex item without losing its identity');
assert.strictEqual(boundedCatalog.grid.focus.index, 94,
  'bounded reconciliation must reselect the prior ratingKey when it still exists');
assert.strictEqual(boundedCatalog.lifecycle.snapshot().nextStart, 179,
  'the next incremental request must continue after the reconciled resident prefix, not after the refreshed block');

var missingCatalogAnchor = createFixture();
missingCatalogAnchor.grid.items = Array.apply(null, Array(180)).map(function (_, index) { return { ratingKey: 'item-' + index }; });
missingCatalogAnchor.grid.totalSize = 180;
missingCatalogAnchor.grid.focus = { index: 95 };
missingCatalogAnchor.lifecycle.refreshCatalogWindow(missingCatalogAnchor.context(), 60, 60, { ratingKey: 'item-95', index: 95 });
missingCatalogAnchor.requests[0].callback(null, {
  libraryKey: 'anime',
  items: Array.apply(null, Array(60)).map(function (_, index) {
    var oldIndex = index < 35 ? 60 + index : 61 + index;
    return { ratingKey: 'item-' + oldIndex };
  }),
  totalSize: 179,
  nextStart: 120
});
assert.strictEqual(missingCatalogAnchor.grid.items[95].ratingKey, 'item-96',
  'when the prior Plex item leaves the filtered result, its numeric position must be occupied by the next result');
assert.strictEqual(missingCatalogAnchor.grid.focus.index, 95,
  'when the prior ratingKey disappears, bounded reconciliation must preserve the prior numeric focus');


var sourceOffsetCatalog = createFixture();
sourceOffsetCatalog.grid.items = Array.apply(null, Array(1180)).map(function (_, index) {
  return { ratingKey: 'source-' + index, plexSourceOffset: index < 1167 ? index + 34 : index + 38 };
});
sourceOffsetCatalog.grid.totalSize = 1181;
sourceOffsetCatalog.grid.focus = { index: 1167 };
sourceOffsetCatalog.lifecycle.setNextStart(1218);
sourceOffsetCatalog.lifecycle.refreshCatalogWindow(
  sourceOffsetCatalog.context({ query: { sort: 'titleSort', direction: 'asc', watched: 'unwatched', filters: {} } }),
  1200,
  60,
  { ratingKey: 'source-1167', index: 1167, plexSourceOffset: 1205 }
);
assert.strictEqual(sourceOffsetCatalog.requests[0].data.start, 1200,
  'bounded unwatched reconciliation must request the raw Plex block rather than a visible-index block');
sourceOffsetCatalog.requests[0].callback(null, {
  libraryKey: 'anime',
  items: [
    { ratingKey: 'replacement-1200', plexSourceOffset: 1200 },
    { ratingKey: 'source-1167', plexSourceOffset: 1205 },
    { ratingKey: 'replacement-1259', plexSourceOffset: 1259 }
  ],
  totalSize: 2400,
  nextStart: 1260,
  hasMore: true,
  localFilteredCount: 57
});
assert.strictEqual(sourceOffsetCatalog.lifecycle.snapshot().nextStart, 1260,
  'refreshing a raw block that extends beyond the resident prefix must advance continuation to the fetched raw boundary');
assert.strictEqual(sourceOffsetCatalog.grid.items.some(function (item) { return item.ratingKey === 'source-1167'; }), true,
  'bounded source-offset reconciliation must retain an anchored card that remains in the refreshed raw block');
assert.strictEqual(sourceOffsetCatalog.grid.focus.index,
  sourceOffsetCatalog.grid.items.map(function (item) { return item.ratingKey; }).indexOf('source-1167'),
  'bounded source-offset reconciliation must reselect the prior ratingKey after local filtering changes visible indexes');


var emptySourceWindow = createFixture();
emptySourceWindow.grid.items = Array.apply(null, Array(100)).map(function (_, index) {
  return {
    ratingKey: 'empty-window-' + index,
    plexSourceOffset: index < 50 ? index : index + 20
  };
});
emptySourceWindow.grid.totalSize = 101;
emptySourceWindow.grid.focus = { index: 55 };
emptySourceWindow.lifecycle.setNextStart(120);
emptySourceWindow.lifecycle.refreshCatalogWindow(
  emptySourceWindow.context({ query: { sort: 'titleSort', direction: 'asc', watched: 'unwatched', filters: {} } }),
  60,
  60,
  { ratingKey: 'empty-window-55', index: 55, plexSourceOffset: 75 }
);
emptySourceWindow.requests[0].callback(null, {
  libraryKey: 'anime',
  items: [],
  totalSize: 180,
  nextStart: 120,
  hasMore: true,
  localFilteredCount: 60
});
assert.strictEqual(emptySourceWindow.grid.items.length, 50,
  'an all-rejected bounded raw block must remove every resident card whose raw Plex offset belongs to that block');
assert.strictEqual(emptySourceWindow.grid.items[49].plexSourceOffset, 49,
  'an empty bounded correction must preserve only cards before the refreshed raw range');
assert.strictEqual(emptySourceWindow.grid.totalSize, 51,
  'an empty bounded correction with later raw pages must retain one lazy-load sentinel');


var nullableSourceWindow = createFixture();
nullableSourceWindow.grid.items = [
  { ratingKey: 'before-null', plexSourceOffset: 0 },
  { ratingKey: 'nullable-offset', plexSourceOffset: null },
  { ratingKey: 'after-null', plexSourceOffset: 2 }
];
nullableSourceWindow.grid.totalSize = 3;
nullableSourceWindow.lifecycle.refreshCatalogWindow(nullableSourceWindow.context(), 1, 1, { ratingKey: 'nullable-offset', index: 1 });
nullableSourceWindow.requests[0].callback(null, {
  libraryKey: 'anime',
  items: [{ ratingKey: 'replacement-null', plexSourceOffset: 1 }],
  totalSize: 3,
  nextStart: 2,
  hasMore: true
});
assert.deepStrictEqual(nullableSourceWindow.grid.items.map(function (item) { return item.ratingKey; }),
  ['before-null', 'replacement-null', 'after-null'],
  'a null source offset must be treated as missing metadata, never coerced to raw Plex offset zero');

var rejectedCatalogWindow = createFixture();
rejectedCatalogWindow.grid.items = [{ ratingKey: 'resident' }];
rejectedCatalogWindow.grid.totalSize = 1;
rejectedCatalogWindow.lifecycle.refreshCatalogWindow(rejectedCatalogWindow.context(), 0, 60, { ratingKey: 'resident', index: 0 });
rejectedCatalogWindow.requests[0].callback(null, {
  libraryKey: 'different-library',
  items: [{ ratingKey: 'foreign' }],
  totalSize: 1
});
assert.ok(rejectedCatalogWindow.lifecycle.snapshot().error,
  'a bounded response for another library must be treated as a failed reconciliation, not as authoritative success');
assert.strictEqual(rejectedCatalogWindow.grid.items[0].ratingKey, 'resident',
  'an invalid bounded response must preserve the resident catalog for a later retry');

var invalidatedSummary = createFixture();
invalidatedSummary.lifecycle.openContainer({ containerKey: '/playlists/stale-summary', containerType: 'playlist' });
assert.strictEqual(invalidatedSummary.lifecycle.refreshContainerSummary(), true,
  'container summary can be loading when playback/watched state changes elsewhere');
assert.strictEqual(invalidatedSummary.requests[0].kind, 'container-summary');
assert.strictEqual(invalidatedSummary.lifecycle.snapshot().containerSummaryLoading, true);
invalidatedSummary.lifecycle.invalidateContentRequest();
assert.strictEqual(invalidatedSummary.requests[0].aborted, true,
  'content invalidation must abort a pre-mutation container summary request');
assert.strictEqual(invalidatedSummary.lifecycle.snapshot().containerSummaryLoading, false,
  'content invalidation must release stale container-summary loading state');
invalidatedSummary.requests[0].callback(null, { items: [{ ratingKey: 'stale-summary-item' }], totalSize: 1 });
assert.strictEqual(invalidatedSummary.lifecycle.snapshot().containerSummary, null,
  'a late pre-mutation container summary must never become authoritative after invalidation');

var librarySwitch = createFixture();
librarySwitch.lifecycle.load(librarySwitch.context(), true);
assert.strictEqual(librarySwitch.lifecycle.snapshot().loading, true);
librarySwitch.lifecycle.prepareLibrary();
assert.strictEqual(librarySwitch.requests[0].aborted, true, 'preparing another library must abort the previous content request');
assert.strictEqual(librarySwitch.lifecycle.snapshot().loading, false, 'a cached destination library must not inherit the previous library loading lock');

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
var recentSeasonTemplate = { ratingKey: 'season-1', type: 'season', title: 'Show', meta: 'Season 1' };
recent.lifecycle.load(recent.context({ viewKey: 'recent' }), true);
recent.requests[0].callback(null, {
  libraryKey: 'anime',
  items: [{
    ratingKey: 'season-1', type: 'season', title: 'Show', detail: '3 new episodes',
    detailKey: 'media.newEpisodeCount', detailParameters: { count: 3 }, viewed: true,
    recentGroup: { key: 'season-1', count: 3, viewedCount: 3, seasonItem: recentSeasonTemplate }
  }],
  totalSize: 4,
  nextStart: 3,
  hasMore: true
});
assert.strictEqual(recent.grid.totalSize, 2, 'grouped recent pages must expose one sentinel item while more raw Plex entries remain');
recent.lifecycle.load(recent.context({ viewKey: 'recent' }), false);
assert.strictEqual(recent.requests[1].data.start, 3, 'grouped recent pagination must continue from the raw Plex offset');
recent.requests[1].callback(null, {
  libraryKey: 'anime',
  items: [{
    ratingKey: 'episode-4', type: 'episode', title: 'Show', detail: 'Episode 4',
    recentGroup: { key: 'season-1', count: 1, viewedCount: 0, seasonItem: recentSeasonTemplate }
  }],
  totalSize: 4,
  nextStart: 4,
  hasMore: false
});
assert.strictEqual(recent.grid.items.length, 1, 'an adjacent recent run may continue across Plex page boundaries');
assert.strictEqual(recent.grid.items[0].detailParameters.count, 4, 'cross-page adjacent runs must accumulate their episode counts');
assert.strictEqual(recent.grid.items[0].detailKey, 'media.newEpisodeCount', 'recent groups must be labeled as newly added episodes');
assert.strictEqual(recent.grid.items[0].viewed, undefined, 'a merged recent group is viewed only when every grouped episode is viewed');
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
    ratingKey: 'episode-1', type: 'episode', title: 'Show', detail: 'Episode 1',
    recentGroup: { key: 'season-boundary', count: 1, viewedCount: 1, seasonItem: seasonTemplate }
  }],
  totalSize: 3,
  nextStart: 1,
  hasMore: true
});
recentBoundary.lifecycle.load(recentBoundary.context({ viewKey: 'recent' }), false);
recentBoundary.requests[1].callback(null, {
  libraryKey: 'anime',
  items: [{
    ratingKey: 'episode-2', type: 'episode', title: 'Show', detail: 'Episode 2',
    recentGroup: { key: 'season-boundary', count: 1, viewedCount: 0, seasonItem: seasonTemplate }
  }],
  totalSize: 3,
  nextStart: 2,
  hasMore: true
});
assert.deepStrictEqual(recentBoundary.grid.items.map(function (item) { return item.type; }), ['episode', 'episode'],
  'two adjacent recent episodes must remain separate cards even across Plex pages');
recentBoundary.lifecycle.load(recentBoundary.context({ viewKey: 'recent' }), false);
recentBoundary.requests[2].callback(null, {
  libraryKey: 'anime',
  items: [{
    ratingKey: 'episode-3', type: 'episode', title: 'Show', detail: 'Episode 3',
    recentGroup: { key: 'season-boundary', count: 1, viewedCount: 0, seasonItem: seasonTemplate }
  }],
  totalSize: 3,
  nextStart: 3,
  hasMore: false
});
assert.strictEqual(recentBoundary.grid.items.length, 1, 'the third adjacent episode must compact the complete run into one season card');
assert.strictEqual(recentBoundary.grid.items[0].type, 'season');
assert.strictEqual(recentBoundary.grid.items[0].detailKey, 'media.newEpisodeCount');
assert.strictEqual(recentBoundary.grid.items[0].detailParameters.count, 3);

var interruptedRecent = createFixture();
var interruptedSeason = { ratingKey: 'season-interrupted', type: 'season', title: 'Show', meta: 'Season 1' };
interruptedRecent.lifecycle.load(interruptedRecent.context({ viewKey: 'recent' }), true);
interruptedRecent.requests[0].callback(null, {
  libraryKey: 'anime',
  items: [
    { ratingKey: 'a1', type: 'episode', title: 'Show', detail: 'Episode 1', recentGroup: { key: 'season-interrupted', count: 1, viewedCount: 0, seasonItem: interruptedSeason } },
    { ratingKey: 'a2', type: 'episode', title: 'Show', detail: 'Episode 2', recentGroup: { key: 'season-interrupted', count: 1, viewedCount: 0, seasonItem: interruptedSeason } }
  ],
  totalSize: 4,
  nextStart: 2,
  hasMore: true
});
interruptedRecent.lifecycle.load(interruptedRecent.context({ viewKey: 'recent' }), false);
interruptedRecent.requests[1].callback(null, {
  libraryKey: 'anime',
  items: [
    { ratingKey: 'movie-between', type: 'movie', title: 'Movie' },
    { ratingKey: 'a3', type: 'episode', title: 'Show', detail: 'Episode 3', recentGroup: { key: 'season-interrupted', count: 1, viewedCount: 0, seasonItem: interruptedSeason } }
  ],
  totalSize: 4,
  nextStart: 4,
  hasMore: false
});
assert.deepStrictEqual(interruptedRecent.grid.items.map(function (item) { return item.ratingKey; }), ['a1', 'a2', 'movie-between', 'a3'],
  'a different feed item must prevent same-season episodes on either side from being grouped');

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
assert.strictEqual(inactive.lifecycle.snapshot().loading, false,
  'the current request completing while Library is temporarily hidden must release its loading lock for recovery');

var inactiveRecommendations = createFixture();
inactiveRecommendations.lifecycle.load(inactiveRecommendations.context({ viewKey: 'recommended' }), true);
inactiveRecommendations.setActive(false);
inactiveRecommendations.requests[0].callback(null, [{ identifier: 'ignored' }]);
assert.deepStrictEqual(inactiveRecommendations.grid.recommendations, [],
  'recommendations completing while Library is hidden must not mutate the resident surface');
assert.strictEqual(inactiveRecommendations.lifecycle.snapshot().loading, false,
  'a hidden recommendation request must also release its loading lock when the current request completes');

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
assert.strictEqual(playlistInitialFocus.gridCalls.initialFocusIndex, 1,
  'playlist detail must provide the first unfinished index before the initial grid render');
assert.strictEqual(playlistInitialFocus.gridCalls.focusCatalog, 0,
  'playlist detail must not repair initial focus with a second post-render focus pass');

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

var refreshedContainerSummary = createFixture();
refreshedContainerSummary.grid.items = [{ ratingKey: 'stale-resident' }];
refreshedContainerSummary.grid.totalSize = 2;
refreshedContainerSummary.lifecycle.openContainer({ containerKey: '/playlists/refresh-summary', containerType: 'playlist' });
assert.strictEqual(refreshedContainerSummary.lifecycle.refreshContainerSummary ? refreshedContainerSummary.lifecycle.refreshContainerSummary() : false, true,
  'active containers must expose an explicit authoritative summary refresh after playback/watched mutations');
var refreshedSummaryRequest = refreshedContainerSummary.requests.filter(function (request) { return request.kind === 'container-summary'; })[0];
assert.ok(refreshedSummaryRequest, 'container summary refresh must query Plex rather than trusting potentially stale resident records');
assert.strictEqual(refreshedSummaryRequest.data.start, 0,
  'authoritative container summary refresh must restart from the first container item');
refreshedSummaryRequest.callback(null, { items: [{ ratingKey: 'fresh-one' }, { ratingKey: 'fresh-two' }], totalSize: 2 });
assert.deepStrictEqual(refreshedContainerSummary.lifecycle.snapshot().containerSummary, { count: 2, keys: ['fresh-one', 'fresh-two'] },
  'authoritative container summary refresh must publish only fresh server records');

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
