'use strict';

var assert = require('assert');
var Controller = require('../app/coordinator/library-controller');
var Containers = require('../app/library-containers');

function timerRoot() {
  var nextId = 1;
  var timers = {};
  return {
    timers: timers,
    setTimeout: function (callback) { var id = nextId; nextId += 1; timers[id] = callback; return id; },
    clearTimeout: function (id) { delete timers[id]; },
    requestIdleCallback: function (callback) { var id = nextId; nextId += 1; timers[id] = callback; return id; },
    cancelIdleCallback: function (id) { delete timers[id]; },
    run: function (id) { var callback = timers[id]; delete timers[id]; if (callback) { callback(); } },
    runAll: function () { Object.keys(timers).map(Number).forEach(function (id) { this.run(id); }, this); }
  };
}

function grid(items, columns) {
  var state = { items: items || [], index: 0, totalSize: (items || []).length, columns: columns || 3 };
  return {
    focusedItem: function () { return state.items[state.index] || null; },
    handleDirection: function (direction) {
      var next;
      if (!state.items.length && direction === 'up') { return { leave: 'content' }; }
      if (direction === 'up') {
        next = state.index - state.columns;
        if (next < 0) { return { leave: 'content' }; }
        state.index = next;
      } else if (direction === 'down') {
        state.index = Containers.moveGridDown(state.index, state.items.length, state.columns);
      }
      return { moved: true };
    },
    pointerFocus: function () {},
    onScroll: function () { state.scrolled = true; },
    snapshot: function () {
      return {
        items: state.items.slice(), totalSize: state.totalSize,
        focus: { index: state.index }, layout: { columns: state.columns }
      };
    }
  };
}

(function testLibrarySpecificStateAndCachedReturn() {
  var entered = [];
  var filterState = {};
  var restoredCollectionsAvailability = null;
  var restoredNextStart = null;
  var controller = Controller.create({
    root: timerRoot(), LibraryContainers: Containers,
    onEnterLibrary: function (library, options, saved) { entered.push({ library: library, options: options, saved: saved }); }
  });
  controller.bindViews({
    filter: {
      setActiveFilters: function (value) { filterState = value; },
      filters: function () { return filterState; }, dismiss: function () {}
    },
    lifecycle: {
      prepareLibrary: function () {},
      setContinueAvailable: function () {},
      setCollectionsAvailable: function (value) { restoredCollectionsAvailability = value; },
      setNextStart: function (value) { restoredNextStart = value; },
      leave: function () {}
    }
  });
  controller.enterLibrary({ key: 'movies' });
  controller.setSort('year');
  controller.setWatchedFilter('unwatched');
  controller.cacheCurrent({
    tabIndex: 3, zone: 'grid', controlIndex: 2, actionIndex: 1,
    sort: 'year', sortDirection: 'desc', watchedFilter: 'unwatched',
    filters: { genre: 'Drama' }, continueAvailable: true, collectionsAvailable: false, nextStart: 120, dom: { retained: true }
  });
  controller.enterLibrary({ key: 'shows' });
  assert.strictEqual(controller.snapshot().sort, 'titleSort');
  controller.enterLibrary({ key: 'movies' }, { keepNavigationFocus: false });
  assert.strictEqual(controller.snapshot().sort, 'year');
  assert.strictEqual(controller.snapshot().watchedFilter, 'unwatched');
  assert.strictEqual(filterState.genre, 'Drama');
  assert.strictEqual(entered[2].saved.dom.retained, true, 'cached DOM must be handed back for a flash-free return');
  assert.strictEqual(restoredCollectionsAvailability, false, 'cached Collections availability must be restored without a visible enabled-tab flash');
  assert.strictEqual(restoredNextStart, 120, 'cached library pagination must restore its raw Plex continuation offset');
}());

(function testIdentityResetClearsCachedLibraryState() {
  var gridResets = 0;
  var lifecycleLeaves = 0;
  var filterDismisses = 0;
  var watchlistResets = 0;
  var controller = Controller.create({ root: timerRoot(), LibraryContainers: Containers });
  controller.bindViews({
    grid: { reset: function () { gridResets += 1; } },
    lifecycle: { prepareLibrary: function () {}, leave: function () { lifecycleLeaves += 1; } },
    filter: { dismiss: function () { filterDismisses += 1; } },
    watchlist: { reset: function () { watchlistResets += 1; } }
  });
  controller.enterLibrary({ key: '1', title: 'Old server library' });
  controller.cacheCurrent({ grid: { items: [{ ratingKey: 'old' }] }, dom: { retained: true } });
  assert.deepStrictEqual(controller.snapshot().cacheKeys, ['1'], 'library state must be cached before the identity reset');
  controller.resetContent();
  assert.deepStrictEqual(controller.snapshot().cacheKeys, [], 'server/profile changes must discard cached libraries from the previous identity');
  assert.deepStrictEqual(controller.snapshot().domCacheOrder, [], 'server/profile changes must release detached library DOM');
  assert.strictEqual(controller.snapshot().activeLibrary, null, 'server/profile changes must release the previous active library');
  assert.strictEqual(gridResets, 1, 'identity reset must clear the rendered catalog');
  assert.strictEqual(lifecycleLeaves, 1, 'identity reset must cancel active library requests');
  assert.strictEqual(filterDismisses, 1, 'identity reset must dismiss library filters');
  assert.strictEqual(watchlistResets, 1, 'identity reset must clear Watchlist state');
}());

(function testWatchedMutationCanInvalidateCachedLibrariesWithoutResettingActiveState() {
  var controller = Controller.create({ root: timerRoot(), LibraryContainers: Containers });
  controller.bindViews({
    lifecycle: { prepareLibrary: function () {}, leave: function () {} },
    filter: { dismiss: function () {} }
  });
  controller.enterLibrary({ key: 'movies', title: 'Movies' });
  controller.cacheCurrent({ grid: { items: [{ ratingKey: 'movie-1' }] }, dom: { retained: true } });
  controller.enterLibrary({ key: 'shows', title: 'Shows' });
  controller.cacheCurrent({ grid: { items: [{ ratingKey: 'show-1' }] }, dom: { retained: true } });
  var invalidated = controller.clearAllCached ? controller.clearAllCached() : false;
  assert.strictEqual(invalidated, true, 'watched-state mutations need a cache-only invalidation path');
  assert.deepStrictEqual(controller.snapshot().cacheKeys, [], 'cache-only invalidation must drop every potentially stale Library snapshot');
  assert.deepStrictEqual(controller.snapshot().domCacheOrder, [], 'cache-only invalidation must release detached Library DOM');
  assert.strictEqual(controller.snapshot().activeLibrary.key, 'shows', 'cache-only invalidation must preserve the active Library identity');
}());

(function testTabNavigationDoesNotActivateHomeAndEmptyContentReturnsToTabs() {
  var selected = [];
  var activatedNavigation = 0;
  var controller = Controller.create({
    root: timerRoot(), LibraryContainers: Containers,
    selectTab: function (index) { selected.push(index); },
    activateNavigation: function () { activatedNavigation += 1; },
    updateFocus: function () {}
  });
  controller.bindViews({
    grid: grid([], 3),
    lifecycle: { snapshot: function () { return { continueAvailable: true }; }, prepareLibrary: function () {}, leave: function () {} }
  });
  controller.enterLibrary({ key: 'movies' });
  controller.handleKey({ keyCode: 39 }, 'right');
  assert.deepStrictEqual(selected, [1]);
  assert.strictEqual(activatedNavigation, 0, 'tab activation must not leak into Home navigation');
  controller.setZone('grid');
  controller.handleKey({ keyCode: 38 }, 'up');
  assert.strictEqual(controller.snapshot().zone, 'tabs', 'an empty surface returns to tabs rather than stealing navbar focus');
}());

(function testDisabledFinalTabDoesNotBlockRefreshActions() {
  var controller;
  controller = Controller.create({
    root: timerRoot(), LibraryContainers: Containers,
    nextTab: function (direction) {
      var current = controller.snapshot().tabIndex;
      return direction > 0 && current === 3 ? current : Math.max(0, current + direction);
    },
    selectTab: function () {},
    updateFocus: function () {}
  });
  controller.bindViews({
    grid: grid([], 3),
    lifecycle: { snapshot: function () { return { continueAvailable: true, collectionsAvailable: false }; }, prepareLibrary: function () {}, leave: function () {} }
  });
  controller.enterLibrary({ key: 'movies' });
  controller.setTabIndex(3);
  controller.setZone('tabs');
  controller.handleKey({ keyCode: 39 }, 'right');
  assert.strictEqual(controller.snapshot().zone, 'actions', 'a disabled final tab must not block navigation to Refresh');
  assert.strictEqual(controller.snapshot().actionIndex, 0, 'navigation enters the first refresh action');
  controller.handleKey({ keyCode: 37 }, 'left');
  assert.strictEqual(controller.snapshot().zone, 'tabs', 'Left from Refresh returns to the tab row');
  assert.strictEqual(controller.snapshot().tabIndex, 3, 'returning from Refresh preserves the last enabled tab');
}());

(function testFinalRowAndBackSequence() {
  var now = 1000;
  var closed = 0;
  var scrolls = [];
  var controller = Controller.create({
    root: timerRoot(), LibraryContainers: Containers, now: function () { return now; },
    closeLibrary: function () { closed += 1; }, scrollTop: function (value) { scrolls.push(value); }, updateFocus: function () {}
  });
  var view = grid([{ key: 1 }, { key: 2 }, { key: 3 }, { key: 4 }, { key: 5 }], 3);
  controller.bindViews({
    grid: view,
    lifecycle: {
      snapshot: function () { return { continueAvailable: true }; },
      prepareLibrary: function () {}, closeContainer: function () { return false; }, leave: function () {}
    }
  });
  controller.enterLibrary({ key: 'movies' });
  controller.setZone('grid');
  controller.handleKey({ keyCode: 40 }, 'down');
  controller.handleKey({ keyCode: 40 }, 'down');
  assert.strictEqual(view.snapshot().focus.index, 3, 'vertical movement must remain on the last partial row');
  controller.handleKey({ keyCode: 461 }, null);
  assert.strictEqual(controller.snapshot().zone, 'tabs');
  assert.deepStrictEqual(scrolls, [0], 'first Back restores the library sub-navigation');
  now += 700;
  controller.handleKey({ keyCode: 461 }, null);
  assert.strictEqual(controller.snapshot().zone, 'nav', 'second Back focuses the current main-navigation entry');
  now += 700;
  controller.handleKey({ keyCode: 461 }, null);
  assert.strictEqual(closed, 1, 'third Back returns Home from the main navigation');
}());

(function testCatalogAndPlaylistBackHierarchy() {
  var now = 1000;
  var closed = 0;
  var controller = Controller.create({
    root: timerRoot(), LibraryContainers: Containers, now: function () { return now; },
    closeLibrary: function () { closed += 1; }, scrollTop: function () {}, updateFocus: function () {}
  });
  controller.bindViews({
    grid: grid([{ key: 1 }], 1),
    lifecycle: { snapshot: function () { return { continueAvailable: true }; }, prepareLibrary: function () {}, closeContainer: function () { return false; }, leave: function () {} }
  });
  controller.enterLibrary({ key: 'movies' });
  controller.setTabIndex(3);
  controller.setZone('grid');
  controller.handleKey({ keyCode: 461 }, null);
  assert.strictEqual(controller.snapshot().zone, 'filter', 'catalog Back must expose its filter row before the sub-navigation');
  now += 700;
  controller.handleKey({ keyCode: 461 }, null);
  assert.strictEqual(controller.snapshot().zone, 'tabs', 'Back from filters must focus the active library tab');
  now += 700;
  controller.handleKey({ keyCode: 461 }, null);
  assert.strictEqual(controller.snapshot().zone, 'nav', 'Back from the library sub-navigation must focus the current navbar item');
  controller.enterPlaylists();
  controller.setZone('grid');
  now += 700;
  controller.handleKey({ keyCode: 461 }, null);
  assert.strictEqual(controller.snapshot().zone, 'nav', 'global Playlists must skip the hidden library tab row');
  now += 700;
  controller.handleKey({ keyCode: 461 }, null);
  assert.strictEqual(closed, 1, 'Back from the Playlists navbar entry must return Home');
}());


(function testLeavingPlaylistGridDoesNotLoadAnotherPage() {
  var loadMoreCalls = 0;
  var view = grid([{ key: 1 }, { key: 2 }, { key: 3 }], 3);
  var originalSnapshot = view.snapshot;
  var controller = Controller.create({
    root: timerRoot(), LibraryContainers: Containers,
    loadMore: function () { loadMoreCalls += 1; },
    updateFocus: function () {}
  });
  view.snapshot = function () {
    var snapshot = originalSnapshot();
    snapshot.totalSize = 40;
    return snapshot;
  };
  controller.bindViews({
    grid: view,
    lifecycle: { snapshot: function () { return { continueAvailable: true }; }, prepareLibrary: function () {}, leave: function () {} }
  });
  controller.enterPlaylists();
  controller.setZone('grid');
  controller.handleKey({ keyCode: 38 }, 'up');
  assert.strictEqual(controller.snapshot().zone, 'nav', 'Up from a global Playlist card must focus the navbar');
  assert.strictEqual(loadMoreCalls, 0, 'leaving a Playlist grid must not start a background page load');
}());


(function testGridMovementOwnsItsFocusHotPath() {
  var updates = 0;
  var view = grid([{ key: 1 }, { key: 2 }, { key: 3 }, { key: 4 }], 2);
  var controller = Controller.create({
    root: timerRoot(), LibraryContainers: Containers,
    updateFocus: function () { updates += 1; }
  });
  controller.bindViews({
    grid: view,
    lifecycle: { snapshot: function () { return { continueAvailable: true }; }, prepareLibrary: function () {}, leave: function () {} }
  });
  controller.enterLibrary({ key: 'movies' });
  controller.setZone('grid');
  updates = 0;
  controller.handleKey({ keyCode: 40 }, 'down');
  assert.strictEqual(view.snapshot().focus.index, 2, 'grid movement must still update the selected item');
  assert.strictEqual(updates, 0, 'a successful grid movement must not trigger a second outer focus refresh');
}());

(function testBoundedAdjacentPrefetchAndDestroy() {
  var clock = timerRoot();
  var loaded = [];
  var requests = [];
  var warmed = 0;
  var controller = Controller.create({
    root: clock, LibraryContainers: Containers,
    loadRecommendations: function (library, callback) {
      loaded.push(library.key);
      var request = { abort: function () { request.aborted = true; } };
      requests.push(request);
      callback(null, [{ items: [{ key: library.key + '-item' }] }]);
      return request;
    },
    buildPrefetchedState: function (library, rows) { return { libraryKey: library.key, rows: rows }; },
    warmPrefetch: function () { warmed += 1; },
    navigationIndex: function () { return 2; },
    navigationItems: function () { return []; }
  });
  var gridResets = 0;
  controller.bindViews({ grid: { reset: function () { gridResets += 1; } } });
  controller.enterLibrary({ key: 'current' });
  controller.scheduleAdjacentPrefetch(2, [
    { kind: 'library', key: 'far-left' }, { kind: 'library', key: 'left' },
    { kind: 'library', key: 'current' }, { kind: 'library', key: 'right' },
    { kind: 'library', key: 'far-right' }
  ]);
  assert.strictEqual(controller.snapshot().prefetchQueueLength, 2, 'adjacent prefetch must stay light and bounded');
  clock.runAll();
  assert.ok(loaded.length <= 2, 'one scheduling wave must not prefetch more than two libraries');
  assert.strictEqual(warmed, 0, 'cold adjacent prefetch must not trigger presentation or artwork warming');
  assert.ok(controller.cached({ key: loaded[0] }).rows.length > 0, 'cold adjacent prefetch must still cache recommendation data for intent-time reuse');
  controller.beginWheelNavigation(350);
  assert.strictEqual(controller.isWheelNavigationActive(), true);
  controller.destroy();
  controller.destroy();
  assert.strictEqual(controller.snapshot().destroyed, true);
  assert.strictEqual(controller.isWheelNavigationActive(), false);
  assert.strictEqual(gridResets, 1, 'destroy must reset the bound grid so its deferred scroll render cannot run late');
  assert.strictEqual(Object.keys(clock.timers).length, 0, 'destroy must cancel idle and wheel timers');
}());

(function testIdentityResetRejectsLatePrefetchFromPreviousServer() {
  var clock = timerRoot();
  var pending = [];
  var controller = Controller.create({
    root: clock, LibraryContainers: Containers,
    loadRecommendations: function (library, callback) {
      var request = { abort: function () { request.aborted = true; } };
      pending.push({ library: library, callback: callback, request: request });
      return request;
    },
    buildPrefetchedState: function (library, rows) { return { libraryKey: library.key, rows: rows }; },
    navigationIndex: function () { return 1; },
    navigationItems: function () { return []; }
  });
  controller.bindViews({
    grid: { reset: function () {} },
    lifecycle: { prepareLibrary: function () {}, leave: function () {} }
  });

  controller.enterLibrary({ key: 'old-current' });
  controller.scheduleAdjacentPrefetch(1, [
    { kind: 'library', key: 'old-left' },
    { kind: 'library', key: 'old-current' },
    { kind: 'library', key: 'old-right' }
  ]);
  clock.runAll();
  assert.strictEqual(pending.length, 1, 'old identity must have one active prefetch');

  controller.resetContent();
  assert.strictEqual(pending[0].request.aborted, true, 'identity reset must abort the old prefetch request');
  controller.enterLibrary({ key: 'new-current' });
  controller.scheduleAdjacentPrefetch(1, [
    { kind: 'library', key: 'new-left' },
    { kind: 'library', key: 'new-current' },
    { kind: 'library', key: 'new-right' }
  ]);
  clock.runAll();
  assert.strictEqual(pending.length, 2, 'new identity must be able to start a replacement prefetch');
  assert.strictEqual(controller.snapshot().prefetchActive, true, 'replacement prefetch must remain active');

  pending[0].callback(null, [{ items: [{ key: 'stale-item' }] }]);
  assert.strictEqual(controller.cached({ key: 'old-left' }), null, 'late data from the previous server must never repopulate the fresh cache');
  assert.strictEqual(controller.snapshot().prefetchActive, true, 'late old callback must not clear the replacement prefetch state');

  pending[1].callback(null, [{ items: [{ key: 'fresh-item' }] }]);
  assert.ok(controller.cached({ key: 'new-left' }), 'replacement prefetch must still publish current-server data');
}());

(function testRefreshOwnershipAndActivityCompletion() {
  var pending = [];
  var completed = 0;
  var metadataCalls = 0;
  var waitCallback;
  var controller = Controller.create({
    root: timerRoot(), LibraryContainers: Containers,
    refreshMetadata: function (library, callback) { metadataCalls += 1; callback(null, 'activity-1'); },
    waitForActivity: function (activityId, callback) { assert.strictEqual(activityId, 'activity-1'); waitCallback = callback; },
    onRefreshPending: function (value) { pending.push(value); },
    onRefreshComplete: function () { completed += 1; }
  });
  controller.bindViews({ lifecycle: { prepareLibrary: function () {}, leave: function () {} } });
  controller.enterLibrary({ key: 'movies' });
  assert.strictEqual(controller.refresh('metadata'), true);
  assert.strictEqual(controller.refresh('metadata'), false, 'a refresh already in flight must not duplicate requests');
  assert.strictEqual(metadataCalls, 1);
  waitCallback(null);
  assert.deepStrictEqual(pending, [true, false]);
  assert.strictEqual(completed, 1, 'visible data updates only after the server activity completes');
}());


(function testSwitchingLibrariesSupersedesPendingRefreshOwnership() {
  var waitCallbacks = {};
  var completed = [];
  var pending = [];
  var controller = Controller.create({
    root: timerRoot(), LibraryContainers: Containers,
    refreshMetadata: function (library, callback) { callback(null, 'activity-' + library.key); },
    waitForActivity: function (activityId, callback) { waitCallbacks[activityId] = callback; },
    onRefreshPending: function (value) { pending.push(value); },
    onRefreshComplete: function (snapshot) { completed.push(snapshot.activeLibrary && snapshot.activeLibrary.key); }
  });
  controller.bindViews({ lifecycle: { prepareLibrary: function () {}, leave: function () {} } });

  controller.enterLibrary({ key: 'movies' });
  assert.strictEqual(controller.refresh('metadata'), true, 'first library refresh must start');
  controller.enterLibrary({ key: 'shows' });
  assert.strictEqual(controller.snapshot().refreshPending, false, 'a different library must not inherit the previous refresh lock');
  assert.strictEqual(controller.refresh('metadata'), true, 'the new library must be able to start its own refresh');

  waitCallbacks['activity-movies'](null);
  assert.strictEqual(controller.snapshot().refreshPending, true, 'late completion from the old library must not clear the new refresh');
  assert.deepStrictEqual(completed, [], 'late completion from the old library must not publish against the new library');

  waitCallbacks['activity-shows'](null);
  assert.strictEqual(controller.snapshot().refreshPending, false);
  assert.deepStrictEqual(completed, ['shows']);
  assert.deepStrictEqual(pending, [true, false, true, false]);
}());

(function testIdentityResetRejectsPendingRefreshFromPreviousServer() {
  var waitCallbacks = {};
  var completed = [];
  var activityIndex = 0;
  var controller = Controller.create({
    root: timerRoot(), LibraryContainers: Containers,
    refreshMetadata: function (library, callback) {
      activityIndex += 1;
      callback(null, 'activity-' + activityIndex);
    },
    waitForActivity: function (activityId, callback) { waitCallbacks[activityId] = callback; },
    onRefreshComplete: function (snapshot) { completed.push(snapshot.activeLibrary && snapshot.activeLibrary.key); }
  });
  controller.bindViews({ lifecycle: { prepareLibrary: function () {}, leave: function () {} } });

  controller.enterLibrary({ key: 'movies' });
  assert.strictEqual(controller.refresh('metadata'), true);
  controller.resetContent();
  controller.enterLibrary({ key: 'movies' });

  waitCallbacks['activity-1'](null);
  assert.deepStrictEqual(completed, [], 'refresh completion from the previous identity must not publish into the same library key');
  assert.strictEqual(controller.refresh('metadata'), true, 'the fresh identity must remain able to start a new refresh');
}());

(function testPointerHoverDoesNotActivateTab() {
  var selected = [];
  var visual = [];
  var controller = Controller.create({
    root: timerRoot(), LibraryContainers: Containers,
    selectTab: function (index) { selected.push(index); },
    pointerVisualFocus: function (element) { visual.push(element.id); },
    updateFocus: function () {}
  });
  controller.bindViews({ lifecycle: { prepareLibrary: function () {}, leave: function () {}, snapshot: function () { return {}; } } });
  controller.enterLibrary({ key: 'movies' });
  controller.pointerFocus('tabs', 3, { id: 'tab-3' });
  assert.strictEqual(controller.snapshot().tabIndex, 0, 'pointer hover must not change the active library tab');
  assert.deepStrictEqual(visual, ['tab-3']);
  controller.handleKey({ keyCode: 13, preventDefault: function () {} }, '');
  assert.strictEqual(controller.snapshot().tabIndex, 3);
  assert.deepStrictEqual(selected, [3]);
}());

(function testLegacyOwnershipWasRemoved() {
  var fs = require('fs');
  var path = require('path');
  var runtime = fs.readFileSync(path.join(__dirname, '../app/coordinator/application-controller.js'), 'utf8');
  var feature = fs.readFileSync(path.join(__dirname, '../app/coordinator/library-feature-controller.js'), 'utf8');
  var input = fs.readFileSync(path.join(__dirname, '../app/coordinator/input-controller.js'), 'utf8');
  var wiring = runtime;
  var pointer = fs.readFileSync(path.join(__dirname, '../app/coordinator/pointer-controller.js'), 'utf8');
  assert.ok(!/var (libraryViewCache|libraryDomCacheOrder|libraryPrefetchTimer|libraryPrefetchQueue|libraryPrefetchActive|activeLibrary|libraryTabIndex|libraryZone|libraryControlIndex|libraryActionIndex|librarySort|libraryWatchedFilter|libraryRefreshPending|libraryBackLockedUntil|libraryWheelScrollTimer)/.test(runtime), 'library state must remain owned by the library controller');
  assert.ok(/target === 'library'[\s\S]*domains\.library/.test(input) && /library: function \(event, direction\) \{ return libraryFeature\.handleKey/.test(wiring) && /function handleKey\(event, direction\)[\s\S]*controller\.handleKey/.test(feature), 'remote input must delegate through the library feature to the library controller');
  assert.ok(/focusCall\(focus\.library, 'grid'/.test(pointer) && /inputPress/.test(pointer) && /library: function \(zone, index, button\) \{ libraryFeature\.pointerFocus/.test(wiring), 'pointer focus must delegate through the library feature before semantic OK routing');
}());


(function testInputRoutingDelegatesByFocusZone() {
  var fs = require('fs');
  var path = require('path');
  var source = fs.readFileSync(path.join(__dirname, '../app/coordinator/library-controller.js'), 'utf8');
  ['handleNavKey', 'handleTabsKey', 'handleActionsKey', 'handleSortKey', 'handleFilterKey', 'handleGridKey'].forEach(function (name) {
    assert.ok(new RegExp('function ' + name + '\\(').test(source), 'library input routing must delegate to ' + name);
  });
  var start = source.indexOf('    function handleKey(event, direction) {');
  var end = source.indexOf('    function pointerFocus(', start);
  var body = source.slice(start, end);
  assert.ok(body.split('\n').length <= 55, 'library handleKey must remain a compact top-level dispatcher');
}());

console.log('Library controller checks passed');
