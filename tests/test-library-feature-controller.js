'use strict';

var assert = require('assert');
var PlaybackQueueModel = require('../app/playback-queue-model');
var LibraryFeatureController = require('../app/coordinator/library-feature-controller');

function node(id) {
  return {
    id: id || '',
    className: '',
    style: {},
    children: [],
    firstChild: null,
    scrollTop: 0,
    clientWidth: 1600,
    disabled: false,
    attributes: {},
    listeners: {},
    appendChild: function (child) {
      this.children.push(child);
      this.firstChild = this.children[0] || null;
      child.parentNode = this;
      return child;
    },
    removeChild: function (child) {
      var index = this.children.indexOf(child);
      if (index !== -1) { this.children.splice(index, 1); }
      this.firstChild = this.children[0] || null;
      return child;
    },
    setAttribute: function (name, value) { this.attributes[name] = String(value); },
    getAttribute: function (name) { return this.attributes[name]; },
    addEventListener: function (name, handler) { this.listeners[name] = handler; },
    removeEventListener: function (name, handler) { if (this.listeners[name] === handler) { delete this.listeners[name]; } },
    focus: function () { this.focused = true; }
  };
}

var nodes = {};
[
  'content', 'search-view', 'settings-view', 'detail-view', 'library-view', 'watchlist-view',
  'library-tabs', 'library-controls', 'library-sort', 'library-filter', 'library-grid',
  'library-grid-content', 'library-recommended', 'library-status', 'library-global-title',
  'library-container-stats', 'library-container-watched-label', 'library-container-remaining-label',
  'library-container-watched-value', 'library-container-remaining-value', 'library-refresh',
  'library-refresh-metadata', 'watchlist-title', 'watchlist-grid'
].forEach(function (id) { nodes[id] = node(id); });

var document = {
  getElementById: function (id) { return nodes[id] || (nodes[id] = node(id)); },
  querySelector: function () { return node('query'); },
  querySelectorAll: function () { return []; },
  createDocumentFragment: function () { return node('fragment'); }
};

function element(tag, className, text) {
  var result = node(tag);
  result.tagName = tag;
  result.className = className || '';
  result.textContent = text || '';
  return result;
}

var calls = [];
var controllerOptions = null;
var filterOptions = null;
var gridOptions = null;
var lifecycleOptions = null;
var watchlistOptions = null;
var destroyCounts = { controller: 0, filter: 0, grid: 0, lifecycle: 0, watchlist: 0 };
var controllerState = {
  mode: 'library',
  activeLibrary: null,
  tabIndex: 0,
  zone: 'tabs',
  controlIndex: 0,
  actionIndex: 0,
  sort: 'titleSort',
  sortDirection: 'asc',
  watchedFilter: 'all',
  viewKey: 'recommended'
};
var cachedState = null;
var boundViews = null;
var gridState = {
  mode: 'recommended',
  usesGridScroll: false,
  items: [],
  recommendations: [],
  totalSize: 0,
  focus: { zone: 'grid', index: 0, recommendationRow: 0 }
};
var lifecycleState = {
  loading: false,
  error: null,
  container: null,
  containerSummary: null,
  containerSummaryLoading: false,
  containerSummaryError: null,
  hasContainer: false,
  continueAvailable: null,
  collectionsAvailable: null
};
var watchlistState = { zone: 'nav', provider: { id: 'provider' }, loading: false, mutationPending: false, loadedIdentity: 'identity' };
var lifecycleLoads = [];
var focusedCatalog = [];
var setItemsCalls = [];
var watchlistLoads = [];
var warmTimers = [];
var detachedRecommendationBuilds = 0;
var prefetchPosterLoads = 0;
var recommendationLoads = 0;
var watchlistClientLoads = [];
var contentRequestInvalidations = 0;
var catalogWindowRefreshes = [];

var FakeLibraryController = {
  create: function (options) {
    controllerOptions = options;
    return {
      snapshot: function () {
        var result = {};
        Object.keys(controllerState).forEach(function (key) { result[key] = controllerState[key]; });
        return result;
      },
      viewKey: function () { return controllerState.viewKey; },
      activeLibrary: function () { return controllerState.activeLibrary; },
      enterLibrary: function (library, options) {
        controllerState.activeLibrary = library;
        controllerState.mode = library.globalPlaylists ? 'playlists' : 'library';
        controllerState.zone = options && options.keepNavigationFocus ? 'nav' : (library.globalPlaylists ? 'grid' : 'tabs');
        calls.push('enter-library:' + library.key);
      },
      enterWatchlist: function (options) {
        controllerState.mode = 'watchlist';
        calls.push('enter-watchlist');
        if (boundViews && boundViews.watchlist) {
          boundViews.watchlist.open(options && options.keepNavigationFocus === true);
          boundViews.watchlist.load(false);
        }
      },
      leave: function () { calls.push('leave-controller'); },
      cached: function () { return cachedState; },
      cacheCurrent: function (value) { cachedState = value; calls.push('cache'); },
      clearCached: function () { cachedState = null; calls.push('clear-cache'); },
      clearAllCached: function () { cachedState = null; calls.push('clear-all-cache'); return true; },
      touchDomCache: function () {},
      setZone: function (zone, index) {
        controllerState.zone = zone;
        if (zone === 'actions') { controllerState.actionIndex = Number(index || 0); }
        if (zone === 'sort' || zone === 'filter') { controllerState.controlIndex = Number(index || 0); }
      },
      setTabIndex: function (index) { controllerState.tabIndex = Number(index || 0); },
      setControlIndex: function (index) { controllerState.controlIndex = Number(index || 0); },
      setWatchedFilter: function (value) { controllerState.watchedFilter = value; },
      scheduleAdjacentPrefetch: function (index, items) { calls.push('prefetch:' + index + ':' + items.length); },
      beginWheelNavigation: function (duration) { calls.push('wheel:' + duration); },
      isWheelNavigationActive: function () { return false; },
      handleKey: function (event, direction) { calls.push('library-key:' + event.keyCode + ':' + direction); return { handled: true }; },
      pointerFocus: function (target, index) { calls.push('library-focus:' + target + ':' + index); },
      bindViews: function (views) { boundViews = views; },
      refresh: function (kind) { calls.push('refresh:' + kind); return true; },
      destroy: function () { destroyCounts.controller += 1; }
    };
  }
};

var FakeGridView = {
  create: function (options) {
    gridOptions = options;
    return {
      snapshot: function () { return gridState; },
      setMode: function (mode, usesGridScroll) { gridState.mode = mode; gridState.usesGridScroll = usesGridScroll; },
      setContentActive: function () {},
      render: function () { calls.push('grid-render'); },
      refreshFocus: function () { calls.push('grid-focus'); },
      focusRecommendations: function (row, index) { gridState.focus = { zone: 'grid', recommendationRow: row, index: index }; },
      focusCatalog: function (index) { gridState.focus = { zone: 'grid', recommendationRow: 0, index: index }; focusedCatalog.push(index); },
      focusedItem: function () { return gridState.items[gridState.focus.index] || null; },
      setItems: function (items, totalSize, initialFocusIndex) {
        gridState.items = items.slice();
        gridState.totalSize = totalSize;
        if (initialFocusIndex !== undefined && initialFocusIndex !== null) {
          gridState.focus = { zone: 'grid', index: Number(initialFocusIndex), recommendationRow: 0 };
        }
        setItemsCalls.push(items.slice());
      },
      restore: function (saved) { gridState = saved; calls.push('grid-restore'); },
      restoreFocus: function () { calls.push('grid-restore-focus'); },
      buildDetachedRecommendations: function () { detachedRecommendationBuilds += 1; return null; },
      onScroll: function () { calls.push('grid-scroll'); },
      reset: function () { calls.push('grid-reset'); },
      destroy: function () { destroyCounts.grid += 1; }
    };
  }
};

var FakeFilterView = {
  create: function (options) {
    filterOptions = options;
    return {
      filters: function () { return { genre: 'comedy' }; },
      activeFilterCount: function () { return 1; },
      setActiveFilters: function () {},
      open: function () { calls.push('filter-open'); },
      dismiss: function () { calls.push('filter-dismiss'); },
      pointerFocus: function () { calls.push('filter-focus'); },
      destroy: function () { destroyCounts.filter += 1; }
    };
  }
};

var FakeLifecycle = {
  create: function (options) {
    lifecycleOptions = options;
    return {
      snapshot: function () { return lifecycleState; },
      load: function (context, reset, preserve) { lifecycleLoads.push({ context: context, reset: reset, preserve: preserve }); },
      probeContinue: function () { calls.push('probe-continue'); },
      probeCollections: function () { calls.push('probe-collections'); },
      setContinueAvailable: function (value) { lifecycleState.continueAvailable = value; },
      openContainer: function (item) {
        lifecycleState.container = item;
        lifecycleState.hasContainer = true;
        return true;
      },
      setContainerSummary: function (summary) {
        lifecycleState.containerSummary = summary;
        calls.push('container-summary');
      },
      refreshContainerSummary: function () {
        lifecycleState.containerSummaryLoading = true;
        lifecycleState.containerSummaryError = null;
        calls.push('container-summary-refresh');
        return true;
      },
      refreshCatalogWindow: function (context, start, limit, anchor) {
        catalogWindowRefreshes.push({ context: context, start: start, limit: limit, anchor: anchor });
        return true;
      },
      invalidateContentRequest: function () { contentRequestInvalidations += 1; return lifecycleState; },
      closeContainer: function () { return false; },
      clearContainer: function () { lifecycleState.container = null; lifecycleState.hasContainer = false; },
      leave: function () { calls.push('lifecycle-leave'); },
      destroy: function () { destroyCounts.lifecycle += 1; }
    };
  }
};

var FakeWatchlistView = {
  create: function (options) {
    watchlistOptions = options;
    return {
      snapshot: function () { return watchlistState; },
      open: function () { calls.push('watchlist-open'); },
      load: function (force, callback) { watchlistLoads.push(force); if (callback) { callback(null, []); } },
      leave: function () { calls.push('watchlist-leave'); },
      render: function () { calls.push('watchlist-render'); },
      refreshFocus: function () { calls.push('watchlist-focus'); },
      onScroll: function () { calls.push('watchlist-scroll'); },
      focusNavigation: function () { watchlistState.zone = 'nav'; },
      focusContent: function () { watchlistState.zone = 'grid'; },
      handleKeyDown: function (event) { calls.push('watchlist-key'); if (event && event.keyCode === 13) { options.onOpenDetail({ ratingKey: 'watchlist-item' }); } },
      pointerFocus: function () { calls.push('watchlist-pointer-focus'); },
      restoreFocus: function () { calls.push('watchlist-restore-focus'); },
      getProvider: function () { return watchlistState.provider; },
      ensureProvider: function (callback) { callback(null, watchlistState.provider); },
      findLocal: function (key) { return key === 'local' ? { ratingKey: key } : null; },
      toggle: function (key, enabled, local, callback) { calls.push('watchlist-toggle:' + key + ':' + enabled); callback(null); },
      reset: function () { calls.push('watchlist-reset'); },
      destroy: function () { destroyCounts.watchlist += 1; }
    };
  }
};

var currentView = 'home';
var navigationIndex = 2;
var navigationItems = [{ kind: 'home' }, { kind: 'library', key: '1' }, { kind: 'playlists' }];
var opened = [];
var posterArguments = [];
var feature = LibraryFeatureController.create({
  platform: { root: { Image: function () {}, setTimeout: function (callback, delay) { warmTimers.push({ callback: callback, delay: delay, cleared: false }); return warmTimers.length; }, clearTimeout: function (id) { if (warmTimers[id - 1]) { warmTimers[id - 1].cleared = true; } } }, document: document },
  modules: {
    LibraryController: FakeLibraryController,
    LibraryContainers: {
      views: function () { return ['recommended', 'continue', 'recent', 'catalog', 'collections']; },
      moveGridDown: function () {},
      statusKey: function () { return ''; }
    },
    LibraryFilterView: FakeFilterView,
    LibraryGridView: FakeGridView,
    LibraryLifecycle: FakeLifecycle,
    PlaybackQueueModel: PlaybackQueueModel,
    ProgressiveImages: { previewSize: function () { return { width: 10, height: 20 }; } },
    SearchModel: {},
    WatchlistState: {},
    WatchlistView: FakeWatchlistView,
    CardLayout: { columns: function () { return 5; } }
  },
  data: {
    PlexClient: {
      loadLibraryRecommendations: function (config, library, callback) { recommendationLoads += 1; callback(null, []); return { abort: function () {} }; },
      loadLibraryFilterOptions: function (config, library, callback) { callback(null, {}); return { abort: function () {} }; },
      loadLibraryContainerPage: function () {},
      loadLibraryPage: function () {},
      refreshLibrary: function () {},
      refreshLibraryMetadata: function () {},
      findByGuid: function () {}
    },
    WatchlistClient: {
      discover: function () {},
      load: function (_root, _options, start, size, callback) {
        var request = { start: start, size: size, callback: callback, aborted: false, abort: function () { this.aborted = true; } };
        watchlistClientLoads.push(request);
        return request;
      },
      set: function () {}
    },
    config: {},
    accountToken: function () { return 'token'; },
    watchlistIdentity: function () { return 'identity'; },
    watchlistAvailable: function () { return true; }
  },
  state: {
    currentView: function () { return currentView; },
    navigationIndex: function () { return navigationIndex; },
    navigationItems: function () { return navigationItems; },
    setNavigationIndex: function (index) { navigationIndex = index; },
    homeBusy: function () { return false; },
    pointerActive: function () { return false; },
    cardScale: function () { return 'normal'; }
  },
  shell: {
    t: function (key, parameters) { return parameters && parameters.title ? key + ':' + parameters.title : key; },
    element: element,
    setText: function (id, value) { nodes[id].textContent = value; },
    clearFocus: function () { calls.push('clear-focus'); },
    renderNavigation: function () { calls.push('render-navigation'); },
    navigationFocusCount: function () { return navigationItems.length; },
    navigationTarget: function () { return node('nav-target'); },
    scheduleNavigationPreview: function (index) { calls.push('nav-preview:' + index); },
    startNavigationHold: function (index) { calls.push('nav-hold:' + index); },
    enterNavigation: function () { calls.push('nav-enter'); },
    showMessage: function (message) { calls.push('message:' + message); },
    showViewState: function () {},
    hideViewState: function () { calls.push('hide-state'); },
    scheduleBackdrop: function (item) { calls.push('backdrop:' + item.ratingKey); },
    scheduleTheme: function (item) { calls.push('theme:' + item.ratingKey); },
    stopTheme: function () { calls.push('stop-theme'); },
    cardMetrics: function () { return { width: 200, imageHeight: 300 }; },
    mediaTitle: function (item) { return item.title || ''; },
    mediaCardMeta: function () { return 'meta'; },
    mediaCardDetail: function () { return 'detail'; },
    mediaKey: function (item) { return String(item.ratingKey || ''); },
    artworkUrl: function (item) { return item.art || ''; },
    renderedPosterSpecification: function () { posterArguments.push(Array.prototype.slice.call(arguments)); return {}; },
    posterLoader: { load: function (image, specification) { if (specification && specification.scope === 'library-prefetch') { prefetchPosterLoads += 1; } }, cancelScope: function () {} },
    prioritizePoster: function () {},
    suspendSettings: function () {},
    refreshHome: function () { calls.push('refresh-home'); }
  },
  server: { waitForActivity: function (id, callback) { callback(null); } },
  transitions: {
    setView: function (view) { currentView = view; },
    openDetail: function (item) { opened.push(item.ratingKey); },
    playItem: function (item) { calls.push('play:' + item.ratingKey); },
    returnHome: function () { calls.push('home'); },
    onWatchlistItemsChanged: function () { calls.push('watchlist-changed'); }
  }
});

assert.ok(controllerOptions, 'feature constructs LibraryController');
assert.ok(filterOptions, 'feature constructs LibraryFilterView');
assert.ok(gridOptions, 'feature constructs LibraryGridView');
assert.ok(lifecycleOptions, 'feature constructs LibraryLifecycle');
assert.ok(watchlistOptions, 'feature constructs WatchlistView');
var watchlistPageResult = null;
watchlistOptions.load({}, function (error, items) { assert.ifError(error); watchlistPageResult = items; });
var firstWatchlistPage = [];
var watchlistPageIndex;
for (watchlistPageIndex = 0; watchlistPageIndex < 100; watchlistPageIndex += 1) { firstWatchlistPage.push({ ratingKey: 'watch-' + watchlistPageIndex }); }
watchlistClientLoads[0].callback(null, firstWatchlistPage);
assert.strictEqual(watchlistClientLoads.length, 2, 'a full Plex Watchlist page must trigger the next page instead of truncating the logical model at 100 items');
assert.strictEqual(watchlistClientLoads[1].start, 100, 'Watchlist paging must continue from the first unresolved cloud item');
watchlistClientLoads[1].callback(null, [{ ratingKey: 'watch-100' }, { ratingKey: 'watch-101' }]);
assert.strictEqual(watchlistPageResult.length, 102, 'Watchlist paging must merge every provider page before local resolution');
var cancelledPagedCallbacks = 0;
var pagedRequest = watchlistOptions.load({}, function () { cancelledPagedCallbacks += 1; });
watchlistClientLoads[2].callback(null, firstWatchlistPage);
assert.strictEqual(watchlistClientLoads.length, 4, 'a second paged Watchlist load must also advance after a full provider page');
pagedRequest.abort();
assert.strictEqual(watchlistClientLoads[3].aborted, true, 'cancelling a paged Watchlist load must abort the currently active provider page');
assert.strictEqual(cancelledPagedCallbacks, 0, 'cancelling between Watchlist pages must suppress completion callbacks');
assert.strictEqual(feature.scheduleWatchlistWarm(), true, 'Library feature must expose a post-Home Watchlist warm scheduler');
assert.strictEqual(watchlistLoads.length, 0, 'Watchlist warm scheduling must not load immediately');
assert.strictEqual(warmTimers[warmTimers.length - 1].delay, 900, 'Watchlist warm scheduling must leave Home a short startup head start');
warmTimers[warmTimers.length - 1].callback();
assert.strictEqual(watchlistLoads[watchlistLoads.length - 1], false, 'Watchlist warm timer must reuse the normal cached Watchlist load path');
var coldPrefetchRows = [{ title: 'Warm row', items: [{ ratingKey: 'warm-1', image: '/warm.jpg', art: '/warm-art.jpg' }] }];
var coldPrefetchState = controllerOptions.buildPrefetchedState({ key: 'warm', title: 'Warm' }, coldPrefetchRows);
assert.strictEqual(detachedRecommendationBuilds, 0, 'cold adjacent prefetch must not build detached Library DOM');
assert.strictEqual(coldPrefetchState.dom, null, 'cold adjacent prefetch cache must contain data only');
assert.strictEqual(typeof controllerOptions.warmPrefetch, 'undefined', 'cold adjacent prefetch must not expose a presentation-warming callback');
assert.strictEqual(prefetchPosterLoads, 0, 'cold adjacent prefetch must not schedule poster or backdrop work');
cachedState = coldPrefetchState;
var lifecycleLoadsBeforeWarmEntry = lifecycleLoads.length;
var recommendationLoadsBeforeWarmEntry = recommendationLoads;
var gridRestoresBeforeWarmEntry = calls.filter(function (value) { return value === 'grid-restore'; }).length;
feature.enterLibrary({ key: 'warm', title: 'Warm' }, { navigationIndex: 1, keepNavigationFocus: true });
assert.strictEqual(lifecycleLoads.length, lifecycleLoadsBeforeWarmEntry, 'intent-time entry must reuse prefetched recommendation data without a new Library lifecycle load');
assert.strictEqual(recommendationLoads, recommendationLoadsBeforeWarmEntry, 'intent-time entry must not repeat the recommendation request already completed by prefetch');
assert.strictEqual(calls.filter(function (value) { return value === 'grid-restore'; }).length, gridRestoresBeforeWarmEntry + 1, 'intent-time entry must render the cached recommendation model through the normal grid restore path');
assert.deepStrictEqual(gridState.recommendations, coldPrefetchRows, 'intent-time rendering must preserve the prefetched Plex row order');
cachedState = null;
currentView = 'home';
assert.strictEqual(lifecycleOptions.shouldSummarizeContainer({ containerType: 'playlist' }), true, 'playlist details request aggregate progress');
assert.strictEqual(lifecycleOptions.shouldSummarizeContainer({ containerType: 'collection' }), true, 'collection details request aggregate progress');
assert.strictEqual(lifecycleOptions.initialContainerFocusIndex([
  { viewed: true, progress: 100 },
  { viewed: false, progress: 42 },
  { viewed: false, progress: 0 }
], { containerType: 'playlist' }), 1, 'playlist details focus the first unfinished item, including partial progress');
assert.strictEqual(lifecycleOptions.initialContainerFocusIndex([
  { viewed: false, progress: 0 }
], { containerType: 'collection' }), -1, 'collection details keep their existing first-item focus policy');
assert.strictEqual(boundViews.grid.snapshot instanceof Function, true, 'owned views are bound to the domain controller');
assert.strictEqual(typeof nodes['library-grid'].listeners.scroll, 'function', 'feature owns the library scroll listener');
assert.strictEqual(typeof nodes['watchlist-grid'].listeners.scroll, 'function', 'feature owns the Watchlist scroll listener required by virtual page scrolling');
gridOptions.renderedPosterSpecification('library-image', '/library/poster', 2, 'library', 200, 300);
watchlistOptions.renderedPosterSpecification('watchlist-image', '/watchlist/poster', 1, 'watchlist', 210, 310);
assert.deepStrictEqual(posterArguments[0], ['library-image', '/library/poster', 2, 'library', 200, 300], 'Library poster wiring must preserve source, priority, scope and dimensions');
assert.deepStrictEqual(posterArguments[1], ['watchlist-image', '/watchlist/poster', 1, 'watchlist', 210, 310], 'Watchlist poster wiring must preserve source, priority, scope and dimensions');

feature.translateStatic();
assert.strictEqual(nodes['library-refresh-metadata'].textContent, 'library.refreshMetadata', 'feature translates its refresh command');
assert.strictEqual(nodes['library-refresh'].attributes['aria-label'], 'library.refresh', 'feature owns refresh accessibility labels');

feature.enterLibrary({ key: '1', title: 'Movies' }, { navigationIndex: 1, keepNavigationFocus: false });
assert.strictEqual(currentView, 'library', 'library entry updates the application view through a port');
assert.strictEqual(controllerState.activeLibrary.key, '1', 'library entry delegates to the domain controller');
assert.strictEqual(lifecycleLoads.length, 1, 'uncached library entry starts the owned lifecycle');
assert.ok(calls.indexOf('probe-continue') !== -1 && calls.indexOf('probe-collections') !== -1, 'ordinary libraries probe optional tabs');

gridState = {
  mode: 'recommended',
  usesGridScroll: false,
  items: [],
  recommendations: [],
  totalSize: 0,
  focus: { zone: 'grid', index: 0, recommendationRow: 0 }
};
lifecycleState.error = new Error('library load failed');
var lifecycleLoadsBeforeFailedReentry = lifecycleLoads.length;
feature.leave();
currentView = 'home';
feature.enterLibrary({ key: '1', title: 'Movies' }, { navigationIndex: 1, keepNavigationFocus: false });
assert.strictEqual(lifecycleLoads.length, lifecycleLoadsBeforeFailedReentry + 1, 'leaving after a failed Library load must not cache the empty fallback as a valid view; re-entry must retry');
lifecycleState.error = null;

lifecycleState.loading = true;
var lifecycleLoadsBeforePendingReentry = lifecycleLoads.length;
feature.leave();
currentView = 'home';
feature.enterLibrary({ key: '1', title: 'Movies' }, { navigationIndex: 1, keepNavigationFocus: false });
assert.strictEqual(lifecycleLoads.length, lifecycleLoadsBeforePendingReentry + 1, 'leaving while the initial Library load is pending must not cache an incomplete view; re-entry must restart the aborted load');
lifecycleState.loading = false;

gridState = {
  mode: 'catalog',
  usesGridScroll: true,
  items: [{ ratingKey: 'old-library-item', title: 'Old cached item' }],
  recommendations: [],
  totalSize: 1,
  focus: { zone: 'grid', index: 0, recommendationRow: 0 }
};
feature.leave();
assert.ok(cachedState, 'a successful Library view is retained for fast re-entry');
currentView = 'home';
feature.enterLibrary({ key: '1', title: 'Movies' }, { navigationIndex: 1, keepNavigationFocus: false });
nodes['library-grid-content'].children = [];
nodes['library-grid-content'].firstChild = null;
nodes['library-recommended'].children = [];
nodes['library-recommended'].firstChild = null;
gridState = {
  mode: 'catalog',
  usesGridScroll: true,
  items: [],
  recommendations: [],
  totalSize: 0,
  focus: { zone: 'grid', index: 0, recommendationRow: 0 }
};
lifecycleState.error = new Error('replacement Library load failed');
var lifecycleLoadsBeforeStaleCacheReentry = lifecycleLoads.length;
feature.leave();
currentView = 'home';
feature.enterLibrary({ key: '1', title: 'Movies' }, { navigationIndex: 1, keepNavigationFocus: false });
assert.strictEqual(lifecycleLoads.length, lifecycleLoadsBeforeStaleCacheReentry + 1, 'a failed empty replacement load must invalidate an older Library cache so re-entry retries instead of restoring stale data');
lifecycleState.error = null;

controllerState.viewKey = 'catalog';
controllerState.watchedFilter = 'unwatched';
lifecycleState.container = null;
lifecycleState.hasContainer = false;
gridState = {
  mode: 'catalog',
  usesGridScroll: true,
  items: Array.apply(null, Array(1200)).map(function (_, itemIndex) {
    return { ratingKey: 'deep-' + itemIndex, title: 'Deep ' + itemIndex, viewed: false };
  }),
  recommendations: [],
  totalSize: 2400,
  focus: { zone: 'grid', index: 1167, recommendationRow: 0 }
};
currentView = 'detail';
var windowRefreshesBeforeDeepMutation = catalogWindowRefreshes.length;
var lifecycleLoadsBeforeDeepMutation = lifecycleLoads.length;
assert.strictEqual(feature.reconcileWatchedState('deep-1167', true), true,
  'a deep unwatched catalog accepts the focused watched-state mutation');
assert.strictEqual(gridState.items.length, 1199,
  'the focused item is removed locally without discarding the resident deep catalog');
currentView = 'library';
assert.strictEqual(feature.recoverPresentation(), true,
  'deep catalog recovery remains available after the watched-state mutation');
assert.strictEqual(catalogWindowRefreshes.length, windowRefreshesBeforeDeepMutation + 1,
  'deep catalog recovery must refresh one bounded Plex window instead of replaying every page from zero');
assert.strictEqual(catalogWindowRefreshes[catalogWindowRefreshes.length - 1].start, 1140,
  'the bounded refresh must start at the 60-item block containing the prior focus');
assert.strictEqual(catalogWindowRefreshes[catalogWindowRefreshes.length - 1].limit, 60,
  'the bounded refresh must keep the existing catalog page size');
assert.strictEqual(catalogWindowRefreshes[catalogWindowRefreshes.length - 1].anchor.ratingKey, 'deep-1167',
  'the bounded refresh must retain the Plex ratingKey of the prior focused item');
assert.strictEqual(catalogWindowRefreshes[catalogWindowRefreshes.length - 1].anchor.index, 1167,
  'the bounded refresh must retain the prior numeric focus as its fallback position');
assert.strictEqual(lifecycleLoads.length, lifecycleLoadsBeforeDeepMutation,
  'deep catalog recovery must not issue the old authoritative replacement from offset zero');
lifecycleOptions.onRender({ kind: 'page', error: new Error('bounded refresh failed') });
currentView = 'detail';
currentView = 'library';
assert.strictEqual(feature.recoverPresentation(), true,
  'deep catalog recovery remains retryable after a bounded Plex request fails');
assert.strictEqual(catalogWindowRefreshes.length, windowRefreshesBeforeDeepMutation + 2,
  'a failed bounded refresh must retry the same one-page reconciliation on the next recovery');
assert.strictEqual(catalogWindowRefreshes[catalogWindowRefreshes.length - 1].start, 1140,
  'a bounded retry must retain the original deep block anchor');

lifecycleOptions.onRender({ kind: 'page', error: null });

controllerState.viewKey = 'catalog';
controllerState.watchedFilter = 'unwatched';
lifecycleState.container = null;
lifecycleState.hasContainer = false;
gridState = {
  mode: 'catalog',
  usesGridScroll: true,
  items: Array.apply(null, Array(1180)).map(function (_, itemIndex) {
    return {
      ratingKey: 'offset-' + itemIndex,
      title: 'Offset ' + itemIndex,
      viewed: false,
      plexSourceOffset: itemIndex < 1167 ? itemIndex + 34 : itemIndex + 38
    };
  }),
  recommendations: [],
  totalSize: 1181,
  focus: { zone: 'grid', index: 1167, recommendationRow: 0 }
};
currentView = 'detail';
var offsetWindowRefreshesBeforeMutation = catalogWindowRefreshes.length;
assert.strictEqual(feature.reconcileWatchedState('offset-1167', true), true,
  'locally corrected unwatched catalogs still accept watched-state reconciliation');
currentView = 'library';
assert.strictEqual(feature.recoverPresentation(), true,
  'a locally corrected deep catalog remains recoverable after Detail');
assert.strictEqual(catalogWindowRefreshes.length, offsetWindowRefreshesBeforeMutation + 1,
  'locally corrected deep recovery still uses one bounded page');
assert.strictEqual(catalogWindowRefreshes[catalogWindowRefreshes.length - 1].start, 1200,
  'the bounded block must be derived from the focused card raw Plex offset, not its shorter visible index');
assert.strictEqual(catalogWindowRefreshes[catalogWindowRefreshes.length - 1].anchor.plexSourceOffset, 1205,
  'the recovery anchor must retain the focused card raw Plex offset for robust merging');

lifecycleOptions.onRender({ kind: 'page', error: null });

controllerState.viewKey = 'catalog';
controllerState.watchedFilter = 'unwatched';
gridState = {
  mode: 'catalog', usesGridScroll: true,
  items: Array.apply(null, Array(180)).map(function (_, itemIndex) {
    return { ratingKey: 'nullable-' + itemIndex, plexSourceOffset: itemIndex === 95 ? null : itemIndex };
  }),
  recommendations: [], totalSize: 180,
  focus: { zone: 'grid', index: 95, recommendationRow: 0 }
};
currentView = 'detail';
var nullableWindowRefreshesBeforeMutation = catalogWindowRefreshes.length;
feature.reconcileWatchedState('nullable-95', true);
currentView = 'library';
feature.recoverPresentation();
assert.strictEqual(catalogWindowRefreshes.length, nullableWindowRefreshesBeforeMutation + 1,
  'null source-offset metadata must still allow bounded recovery');
assert.strictEqual(catalogWindowRefreshes[catalogWindowRefreshes.length - 1].start, 60,
  'a null raw source offset must fall back to the focused visible index rather than coercing to block zero');
lifecycleOptions.onRender({ kind: 'page', error: null });

controllerState.viewKey = 'catalog';
controllerState.sort = 'titleSort';
controllerState.sortDirection = 'asc';
controllerState.watchedFilter = 'all';
gridState = {
  mode: 'catalog',
  usesGridScroll: true,
  items: Array.apply(null, Array(120)).map(function (_, itemIndex) { return { ratingKey: 'query-' + itemIndex }; }),
  recommendations: [],
  totalSize: 240,
  focus: { zone: 'grid', index: 65, recommendationRow: 0 }
};
currentView = 'detail';
assert.strictEqual(feature.reconcileContentMutation(), true,
  'a hidden catalog mutation captures the current query together with its focus anchor');
controllerState.sort = 'audienceRating';
controllerState.sortDirection = 'desc';
var windowRefreshesBeforeQueryChange = catalogWindowRefreshes.length;
var lifecycleLoadsBeforeQueryChange = lifecycleLoads.length;
currentView = 'library';
assert.strictEqual(feature.recoverPresentation(), true,
  'catalog recovery remains available if the active query changed while the detail was open');
assert.strictEqual(catalogWindowRefreshes.length, windowRefreshesBeforeQueryChange,
  'a stale anchor from another sort/filter query must never be merged into the current catalog');
assert.strictEqual(lifecycleLoads.length, lifecycleLoadsBeforeQueryChange + 1,
  'a changed catalog query must fall back to the authoritative replacement path');
assert.strictEqual(lifecycleLoads[lifecycleLoads.length - 1].preserve, true,
  'query-mismatch fallback must keep the resident grid visible while offset zero is revalidated');
lifecycleOptions.onRender({ kind: 'page', error: null });
controllerState.sort = 'titleSort';
controllerState.sortDirection = 'asc';

controllerState.viewKey = 'catalog';
controllerState.watchedFilter = 'unwatched';
lifecycleState.continueAvailable = false;
gridState = {
  mode: 'catalog',
  usesGridScroll: true,
  items: [
    { ratingKey: 'watched-after-detail', title: 'Watched after detail', viewed: false },
    { ratingKey: 'keep-unwatched', title: 'Keep unwatched', viewed: false }
  ],
  recommendations: [],
  totalSize: 2,
  focus: { zone: 'grid', index: 0, recommendationRow: 0 }
};
currentView = 'detail';
var contentRequestInvalidationsBeforeWatched = contentRequestInvalidations;
var watchedReconcileResult = feature.reconcileWatchedState
  ? feature.reconcileWatchedState('watched-after-detail', true)
  : false;
currentView = 'library';
assert.strictEqual(watchedReconcileResult, true,
  'Library must accept an explicit watched-state invalidation from another feature');
assert.strictEqual(calls[calls.length - 1], 'clear-all-cache',
  'watched-state invalidation must discard cached Library snapshots that can no longer be trusted');
assert.strictEqual(contentRequestInvalidations, contentRequestInvalidationsBeforeWatched + 1,
  'watched-state invalidation must abort any Library request created against pre-mutation Plex state');
assert.deepStrictEqual(gridState.items.map(function (item) { return item.ratingKey; }), ['keep-unwatched'],
  'an item marked watched must disappear immediately from a resident unwatched catalog');
assert.strictEqual(gridState.totalSize, 1,
  'local watched-filter reconciliation must keep the resident total consistent until Plex replaces the page');
var lifecycleLoadsBeforeFilteredRecovery = lifecycleLoads.length;
var windowRefreshesBeforeFilteredRecovery = catalogWindowRefreshes.length;
gridOptions.onNearEnd();
assert.strictEqual(lifecycleLoads.length, lifecycleLoadsBeforeFilteredRecovery,
  'dirty watched-filter membership must block incremental pagination that still uses pre-mutation offsets');
assert.strictEqual(feature.recoverPresentation(), true, 'filtered Library recovery remains available after a watched-state mutation');
assert.strictEqual(catalogWindowRefreshes.length, windowRefreshesBeforeFilteredRecovery + 1,
  'returning from Detail must reconcile the resident unwatched catalog through one bounded Plex page');
assert.strictEqual(catalogWindowRefreshes[catalogWindowRefreshes.length - 1].start, 0,
  'a focused item in the first catalog block refreshes only that first block');
assert.strictEqual(lifecycleLoads.length, lifecycleLoadsBeforeFilteredRecovery,
  'bounded watched-filter recovery must not issue the old whole-prefix replacement load');
lifecycleOptions.onRender({ kind: 'page', error: null });
controllerState.viewKey = 'catalog';
controllerState.watchedFilter = 'watched';
gridState = {
  mode: 'catalog',
  usesGridScroll: true,
  items: [
    { ratingKey: 'unwatched-after-detail', title: 'Unwatched after detail', viewed: true },
    { ratingKey: 'keep-watched', title: 'Keep watched', viewed: true }
  ],
  recommendations: [],
  totalSize: 2,
  focus: { zone: 'grid', index: 0, recommendationRow: 0 }
};
currentView = 'detail';
assert.strictEqual(feature.reconcileWatchedState('unwatched-after-detail', false), true,
  'Library must reconcile the reverse watched-state transition as well');
assert.deepStrictEqual(gridState.items.map(function (item) { return item.ratingKey; }), ['keep-watched'],
  'an item marked unwatched must disappear immediately from a resident watched catalog');
var windowRefreshesBeforeReverseRecovery = catalogWindowRefreshes.length;
currentView = 'library';
assert.strictEqual(feature.recoverPresentation(), true,
  'reverse watched-filter reconciliation uses the same bounded recovery path');
assert.strictEqual(catalogWindowRefreshes.length, windowRefreshesBeforeReverseRecovery + 1,
  'reverse watched-filter recovery must issue exactly one bounded page request');
lifecycleOptions.onRender({ kind: 'page', error: null });
controllerState.viewKey = 'catalog';
controllerState.watchedFilter = 'unwatched';
gridState = {
  mode: 'catalog',
  usesGridScroll: true,
  items: [{ ratingKey: 'watched-after-playback', title: 'Watched after playback', duration: 1200000 }],
  recommendations: [],
  totalSize: 1,
  focus: { zone: 'grid', index: 0, recommendationRow: 0 }
};
currentView = 'player';
var lifecycleLoadsBeforePlaybackRecovery = lifecycleLoads.length;
var windowRefreshesBeforePlaybackRecovery = catalogWindowRefreshes.length;
var continueProbesBeforePlaybackRecovery = calls.filter(function (value) { return value === 'probe-continue'; }).length;
assert.strictEqual(feature.reconcilePlaybackProgress('watched-after-playback', 1200), true,
  'reported playback must invalidate Library membership even when a regular catalog is hidden behind the player');
assert.strictEqual(calls[calls.length - 1], 'clear-all-cache',
  'reported playback must invalidate cached Library snapshots because Continue/watched membership can change');
assert.strictEqual(lifecycleState.continueAvailable, null,
  'reported playback must invalidate stale Continue availability while the Library is hidden');
currentView = 'library';
assert.strictEqual(feature.recoverPresentation(), true, 'Library recovery remains available after reported playback');
assert.strictEqual(catalogWindowRefreshes.length, windowRefreshesBeforePlaybackRecovery + 1,
  'returning from playback must revalidate only the focused catalog block whose watched membership may have changed');
assert.strictEqual(lifecycleLoads.length, lifecycleLoadsBeforePlaybackRecovery,
  'playback reconciliation must avoid replaying the resident catalog prefix from offset zero');
assert.strictEqual(calls.filter(function (value) { return value === 'probe-continue'; }).length, continueProbesBeforePlaybackRecovery + 1,
  'returning from playback must re-probe Continue availability after progress can change its membership');
lifecycleOptions.onRender({ kind: 'page', error: null });
controllerState.viewKey = 'recommended';
controllerState.watchedFilter = 'all';
currentView = 'detail';
var genericMutationResult = feature.reconcileContentMutation ? feature.reconcileContentMutation() : false;
assert.strictEqual(genericMutationResult, true,
  'non-watched Plex mutations must share the Library cache invalidation contract');
var lifecycleLoadsBeforeRecommendedRecovery = lifecycleLoads.length;
currentView = 'library';
assert.strictEqual(feature.recoverPresentation(), true,
  'recommended Library recovery remains available after a generic content mutation');
assert.strictEqual(lifecycleLoads.length, lifecycleLoadsBeforeRecommendedRecovery + 1,
  'watched/progress/content mutations must revalidate recommendation rows because their membership can depend on playback state');
assert.strictEqual(lifecycleLoads[lifecycleLoads.length - 1].preserve, true,
  'recommendation reconciliation must remain non-destructive while the authoritative response is pending');
lifecycleOptions.onRender({ kind: 'recommendations', error: new Error('mutation refresh failed') });
currentView = 'detail';
currentView = 'library';
assert.strictEqual(feature.recoverPresentation(), true,
  'Library recovery remains callable after a failed mutation refresh');
assert.strictEqual(lifecycleLoads.length, lifecycleLoadsBeforeRecommendedRecovery + 2,
  'a failed authoritative mutation refresh must remain dirty and retry on the next recovery');
lifecycleOptions.onRender({ kind: 'recommendations', error: null });
currentView = 'detail';
currentView = 'library';
assert.strictEqual(feature.recoverPresentation(), true,
  'Library recovery remains stable after a successful mutation refresh');
assert.strictEqual(lifecycleLoads.length, lifecycleLoadsBeforeRecommendedRecovery + 2,
  'a successful authoritative mutation refresh must clear the dirty state and avoid redundant reloads');

controllerState.viewKey = 'catalog';
controllerState.watchedFilter = 'all';
lifecycleState.container = { containerKey: '/collections/edge', containerType: 'collection', title: 'Edge collection' };
lifecycleState.hasContainer = true;
currentView = 'detail';
var summaryRefreshCountBefore = calls.filter(function (value) { return value === 'container-summary-refresh'; }).length;
assert.strictEqual(feature.reconcileContentMutation(), true,
  'container-origin mutations must invalidate derived progress statistics');
currentView = 'library';
assert.strictEqual(feature.recoverPresentation(), true,
  'container Library recovery remains available after a content mutation');
assert.strictEqual(calls.filter(function (value) { return value === 'container-summary-refresh'; }).length, summaryRefreshCountBefore + 1,
  'returning to a playlist/collection after watched/progress changes must refresh its authoritative summary');
lifecycleState.containerSummaryLoading = false;
lifecycleState.containerSummaryError = new Error('summary refresh failed');
lifecycleOptions.onContainerSummary();
currentView = 'detail';
currentView = 'library';
assert.strictEqual(feature.recoverPresentation(), true,
  'container Library recovery remains callable after a failed summary refresh');
assert.strictEqual(calls.filter(function (value) { return value === 'container-summary-refresh'; }).length, summaryRefreshCountBefore + 2,
  'a failed container summary refresh must remain dirty and retry on the next recovery');
lifecycleState.containerSummaryLoading = false;
lifecycleState.containerSummaryError = null;
lifecycleState.containerSummary = { count: 1 };
lifecycleOptions.onContainerSummary();
currentView = 'detail';
currentView = 'library';
assert.strictEqual(feature.recoverPresentation(), true,
  'container Library recovery remains stable after a successful summary refresh');
assert.strictEqual(calls.filter(function (value) { return value === 'container-summary-refresh'; }).length, summaryRefreshCountBefore + 2,
  'a successful container summary refresh must clear the dirty state');
lifecycleState.container = null;
lifecycleState.hasContainer = false;

controllerState.viewKey = 'catalog';
controllerState.watchedFilter = 'all';
currentView = 'library';
var lifecycleLoadsBeforeVisibleMutation = lifecycleLoads.length;
assert.strictEqual(feature.reconcileContentMutation(), true,
  'visible Library mutations still invalidate detached Library caches');
assert.strictEqual(feature.reloadCurrent(true), true,
  'a visible Library mutation can immediately start its authoritative reload');
assert.strictEqual(lifecycleLoads.length, lifecycleLoadsBeforeVisibleMutation + 1,
  'visible Library mutation reload must be issued exactly once');
lifecycleOptions.onRender({ kind: 'page', error: new Error('visible mutation refresh failed') });
currentView = 'detail';
currentView = 'library';
assert.strictEqual(feature.recoverPresentation(), true,
  'Library can recover after a failed visible mutation reload');
assert.strictEqual(lifecycleLoads.length, lifecycleLoadsBeforeVisibleMutation + 2,
  'a failed visible mutation refresh must remain dirty and retry after leaving and returning');
lifecycleOptions.onRender({ kind: 'page', error: null });
currentView = 'detail';
currentView = 'library';
assert.strictEqual(feature.recoverPresentation(), true,
  'Library remains recoverable after the visible mutation retry succeeds');
assert.strictEqual(lifecycleLoads.length, lifecycleLoadsBeforeVisibleMutation + 2,
  'a successful visible mutation refresh must clear the dirty flag and avoid a third reload');

feature.enterPlaylists({ navigationIndex: 2, keepNavigationFocus: false });
assert.strictEqual(controllerState.activeLibrary.globalPlaylists, true, 'playlist entry uses a global playlist library');
assert.strictEqual(nodes['library-view'].className.indexOf('is-global-playlists') !== -1, true, 'playlist entry owns the library presentation class');

feature.enterWatchlist({ keepNavigationFocus: true });
assert.strictEqual(currentView, 'watchlist', 'Watchlist entry updates the application view');
assert.strictEqual(watchlistLoads[watchlistLoads.length - 1], false, 'Watchlist entry loads data through the owned view');
nodes['watchlist-grid'].listeners.scroll();
assert.ok(calls.indexOf('watchlist-scroll') !== -1, 'Watchlist page scrolling must ask the virtual view to remount the visible window');
feature.handleKey({ keyCode: 40 }, 'down');
assert.ok(calls.indexOf('watchlist-key') !== -1, 'Watchlist input is routed inside the feature');
feature.pointerFocus('watchlist', 0, node('watch-card'));
feature.handleKey({ keyCode: 13, preventDefault: function () {} }, '');
assert.deepStrictEqual(opened, ['watchlist-item'], 'Watchlist pointer activation opens detail through a transition port');

currentView = 'library';
controllerState.activeLibrary = { key: 'playlists', title: 'Playlists', globalPlaylists: true };
lifecycleState.container = null;
lifecycleState.hasContainer = false;
gridState.items = [
  { ratingKey: 'playlist-1', containerKey: '/playlists/playlist-1/items', containerType: 'playlist', title: 'Queue' },
  { ratingKey: 'playlist-2', containerKey: '/playlists/playlist-2/items', containerType: 'playlist', title: 'Other' }
];
gridState.focus = { zone: 'grid', index: 0, recommendationRow: 0 };
var queueItems = [
  { ratingKey: 'dup', type: 'episode', duration: 600000, viewed: true },
  { ratingKey: 'other', type: 'episode', duration: 1200000, viewOffset: 300000 },
  { ratingKey: 'dup', type: 'episode', duration: 600000 },
  { ratingKey: 'late', type: 'episode', duration: 900000 }
];
var setItemsCountBeforePlaylistRestore = setItemsCalls.length;
var cacheCountBeforePlaylistOpen = calls.filter(function (value) { return value === 'cache'; }).length;
lifecycleState.containerSummary = null;
assert.strictEqual(feature.restoreContainerOrigin({
  origin: gridState.items[0],
  queueItems: queueItems,
  queueIndex: 2
}), false, 'pending direct-play cancellation must leave an unopened playlist list unchanged');
assert.strictEqual(feature.restoreContainerOrigin({
  origin: gridState.items[0],
  queueItems: queueItems,
  queueIndex: 2,
  activeItem: queueItems[2],
  openUnopened: true
}), true, 'direct playlist playback restoration opens an unopened playlist container');
assert.strictEqual(lifecycleState.container.ratingKey, 'playlist-1', 'direct restoration retains the playlist as the active container');
assert.strictEqual(calls.filter(function (value) { return value === 'cache'; }).length, cacheCountBeforePlaylistOpen + 1, 'opening a playlist container must preserve the parent playlist list in the library cache');
assert.strictEqual(setItemsCalls.length, setItemsCountBeforePlaylistRestore, 'direct restoration must not expose queue-resident items as playlist contents');
assert.strictEqual(lifecycleState.containerSummary, null, 'direct restoration must not publish counters synthesized from the resident playback queue');
assert.strictEqual(lifecycleLoads[lifecycleLoads.length - 1].context.container.ratingKey, 'playlist-1', 'playlist restoration loads the original Plex container');
assert.strictEqual(lifecycleLoads[lifecycleLoads.length - 1].reset, true, 'playlist restoration uses the normal container-opening lifecycle');
gridState.items = queueItems.slice();
gridState.totalSize = queueItems.length;
lifecycleOptions.onRender({ kind: 'page' });
assert.strictEqual(focusedCatalog[focusedCatalog.length - 1], 2, 'the active playlist occurrence receives focus only after the real page has rendered');

controllerState.activeLibrary = { key: 'anime', title: 'Anime' };
lifecycleState.container = null;
lifecycleState.hasContainer = false;
gridState.items = [
  { ratingKey: 'collection-1', containerKey: '/library/collections/collection-1/children', containerType: 'collection', title: 'Saga' }
];
gridState.totalSize = 1;
var collectionItems = [
  { ratingKey: 'movie-1', type: 'movie', title: 'First' },
  { ratingKey: 'movie-2', type: 'movie', title: 'Second' }
];
assert.strictEqual(feature.restoreContainerOrigin({
  origin: gridState.items[0],
  queueItems: collectionItems,
  queueIndex: 1,
  activeItem: collectionItems[1],
  openUnopened: true
}), true, 'collection playback restoration opens the original collection container');
assert.strictEqual(lifecycleState.container.ratingKey, 'collection-1', 'collection restoration retains the collection as the active container');
lifecycleState.containerSummary = {
  watchedCount: 1,
  totalCount: 2,
  remainingCount: 1,
  watchedDuration: 600000,
  remainingDuration: 1200000
};
gridState.items = collectionItems.slice();
gridState.totalSize = collectionItems.length;
lifecycleOptions.onRender({ kind: 'page' });
assert.strictEqual(focusedCatalog[focusedCatalog.length - 1], 1, 'collection restoration focuses the item that was playing');
assert.strictEqual(nodes['library-view'].className, 'library-view is-container-detail', 'an opened collection uses the shared container-detail surface');
assert.strictEqual(nodes['library-global-title'].textContent, 'library.collectionTitle:Saga', 'collection detail renders its collection title');
assert.strictEqual(nodes['library-container-stats'].className, 'library-container-stats', 'collection detail renders aggregate progress');
assert.strictEqual(nodes['library-container-watched-value'].textContent, '1/2 \u00b7 10 min', 'collection detail renders watched count and duration');
lifecycleState.containerSummary.watchedCount = 0;
lifecycleState.containerSummary.watchedDuration = 0;
lifecycleOptions.onContainerSummary();
assert.strictEqual(nodes['library-container-watched-value'].textContent, 'library.containerNone', 'containers without watched items replace a zero counter with a readable empty state');
assert.strictEqual(nodes['library-container-remaining-value'].textContent, '1/2 \u00b7 20 min', 'remaining statistics keep their numeric count');
lifecycleState.containerSummary.watchedCount = 2;
lifecycleState.containerSummary.watchedDuration = 1200000;
lifecycleState.containerSummary.remainingCount = 0;
lifecycleState.containerSummary.remainingDuration = 0;
lifecycleOptions.onContainerSummary();
assert.strictEqual(nodes['library-container-watched-value'].textContent, '2/2 \u00b7 20 min', 'watched statistics keep their numeric count when all items are complete');
assert.strictEqual(nodes['library-container-remaining-value'].textContent, 'library.containerNone', 'completed containers replace a zero remaining counter with the same readable empty state');
lifecycleState.container = null;
lifecycleState.containerSummary = null;
lifecycleState.hasContainer = false;
lifecycleOptions.onRestoreContainer();
assert.strictEqual(nodes['library-view'].className, 'library-view', 'closing a collection restores the owning library presentation');

controllerState.activeLibrary = { key: 'playlists', title: 'Playlists', globalPlaylists: true };
lifecycleState.container = { ratingKey: 'playlist-1', containerType: 'playlist', title: 'Queue' };
lifecycleState.hasContainer = true;
gridState.items = [{ ratingKey: 'dup' }, { ratingKey: 'other' }, { ratingKey: 'dup' }];
assert.strictEqual(feature.restoreContainerOrigin({
  origin: { kind: 'playlist', containerRatingKey: 'playlist-1' },
  queueItems: queueItems,
  queueIndex: 2,
  activeItem: queueItems[2]
}), true, 'playlist origin restoration accepts the matching open playlist');
gridState.items = [{ ratingKey: 'dup' }, { ratingKey: 'other' }, { ratingKey: 'dup' }];
lifecycleOptions.onRender({ kind: 'page' });
assert.strictEqual(focusedCatalog[focusedCatalog.length - 1], 2, 'duplicate rating keys restore the matching queue occurrence');
assert.strictEqual(feature.restoreContainerOrigin({
  origin: { kind: 'playlist', containerRatingKey: 'playlist-1' },
  queueItems: queueItems,
  queueIndex: 3,
  activeItem: queueItems[3]
}), true, 'playlist restoration reloads an active item outside the previously loaded page');
gridState.items = queueItems.slice();
lifecycleOptions.onRender({ kind: 'page' });
assert.strictEqual(focusedCatalog[focusedCatalog.length - 1], 3, 'the reloaded playlist page focuses the active queue item');

var distantItem = { ratingKey: 'distant', type: 'episode' };
lifecycleState.container = { ratingKey: 'playlist-1', containerType: 'playlist', title: 'Queue' };
lifecycleState.hasContainer = true;
gridState.items = Array.apply(null, Array(60)).map(function (_, itemIndex) { return { ratingKey: 'item-' + itemIndex }; });
gridState.totalSize = 80;
assert.strictEqual(feature.restoreContainerOrigin({
  origin: { kind: 'playlist', containerRatingKey: 'playlist-1' },
  queueItems: [distantItem],
  queueIndex: 65,
  activeItem: distantItem
}), true, 'playlist restoration accepts an occurrence beyond the first Plex page');
var lifecycleLoadCountBeforeDistantRender = lifecycleLoads.length;
lifecycleOptions.onRender({ kind: 'page' });
assert.strictEqual(lifecycleLoads.length, lifecycleLoadCountBeforeDistantRender + 1, 'playlist restoration loads another real Plex page when the active occurrence is not resident');
assert.strictEqual(lifecycleLoads[lifecycleLoads.length - 1].reset, false, 'distant playlist restoration appends the next page without resetting the real list');
gridState.focus = { zone: 'grid', index: 0, recommendationRow: 0 };
assert.strictEqual(feature.reconcilePlaybackProgress('distant', 420), true,
  'a stopped report may arrive before the distant playlist occurrence is rendered');
gridState.items = Array.apply(null, Array(80)).map(function (_, itemIndex) {
  return itemIndex === 65 ? distantItem : { ratingKey: 'item-' + itemIndex };
});
lifecycleOptions.onRender({ kind: 'page' });
assert.strictEqual(focusedCatalog[focusedCatalog.length - 1], 65, 'playlist restoration focuses an occurrence loaded from a later Plex page');
assert.strictEqual(gridState.items[65].viewOffset, 420000,
  'a pending stopped report is applied to the restored playlist occurrence after its page renders');
gridState.items = queueItems.slice();
gridState.totalSize = queueItems.length;
gridState.focus = { zone: 'grid', index: 3, recommendationRow: 0 };

assert.strictEqual(feature.reconcilePlaybackProgress('dup', 420), true,
  'a closed container playback must accept the final local progress update');
assert.strictEqual(gridState.items[3].viewOffset, undefined,
  'progress reconciliation must follow the focused occurrence rather than an unrelated item');
gridState.focus = { zone: 'grid', index: 2, recommendationRow: 0 };
assert.strictEqual(feature.reconcilePlaybackProgress('dup', 420), true,
  'progress reconciliation must work when the active duplicate occurrence is focused');
assert.strictEqual(gridState.items[2].viewOffset, 420000,
  'progress reconciliation must patch the focused occurrence in milliseconds');
assert.strictEqual(gridState.items[2].progress, 70,
  'progress reconciliation must update the focused occurrence percentage');
assert.strictEqual(gridState.items[0].viewOffset, undefined,
  'progress reconciliation must preserve another occurrence with the same rating key');
gridState.items = Array.apply(null, Array(80)).map(function (_, itemIndex) {
  return { ratingKey: 'resident-' + itemIndex };
});
gridState.totalSize = gridState.items.length;
gridState.focus = { zone: 'grid', index: 65, recommendationRow: 0 };

nodes.content.style.display = 'block';
nodes['library-view'].className = 'library-view is-hidden';
currentView = 'library';
var lifecycleLoadsBeforeRecovery = lifecycleLoads.length;
var rendersBeforeRecovery = calls.filter(function (value) { return value === 'grid-render'; }).length;
assert.strictEqual(feature.recoverPresentation(), true, 'library detail returns recover the owned surface');
assert.strictEqual(nodes.content.style.display, 'none', 'library recovery keeps the Home surface hidden');
assert.strictEqual(nodes['library-view'].className, 'library-view is-global-playlists is-container-detail', 'library recovery restores the active playlist container surface');
assert.strictEqual(feature.focusedItem().ratingKey, 'resident-65', 'library recovery preserves a focused item beyond the first Plex page');
assert.strictEqual(lifecycleLoads.length, lifecycleLoadsBeforeRecovery, 'library detail recovery must reuse the resident grid instead of destructively reloading page zero');
assert.strictEqual(calls.filter(function (value) { return value === 'grid-render'; }).length, rendersBeforeRecovery, 'library detail recovery must reveal the resident DOM without rebuilding the current virtual window');

gridState.items = queueItems.slice();
gridState.totalSize = queueItems.length;
gridState.focus = { zone: 'grid', index: 3, recommendationRow: 0 };

nodes.content.style.display = 'block';
nodes['watchlist-view'].className = 'watchlist-view is-hidden';
currentView = 'watchlist';
assert.strictEqual(feature.recoverPresentation(), true, 'Watchlist detail returns recover the owned surface');
assert.strictEqual(nodes.content.style.display, 'none', 'Watchlist recovery keeps the Home surface hidden');
assert.strictEqual(nodes['watchlist-view'].className, 'watchlist-view', 'Watchlist recovery restores the owned surface without root DOM mutations');
currentView = 'library';
feature.hidePresentation();
assert.strictEqual(nodes['library-view'].className, 'library-view is-hidden', 'feature hides the Library surface semantically');
assert.strictEqual(nodes['watchlist-view'].className, 'watchlist-view is-hidden', 'feature hides the Watchlist surface semantically');

assert.strictEqual(feature.activeContainer().ratingKey, 'playlist-1', 'active container is exposed semantically');
assert.strictEqual(feature.focusedItem().ratingKey, 'late', 'focused item is exposed without leaking the grid view');
assert.strictEqual(feature.navigationHasFocus(), false, 'feature reports its navigation focus state');
feature.focusNavigation();
assert.strictEqual(feature.navigationHasFocus(), true, 'feature can restore navigation focus without exposing the controller');
feature.scheduleAdjacentPrefetch(2, navigationItems);
assert.ok(calls.indexOf('prefetch:2:3') !== -1, 'adjacent prefetch stays feature-owned');
feature.onWheelNavigation(300);
assert.ok(calls.indexOf('wheel:300') !== -1, 'wheel navigation stays feature-owned');


var exposedLibrarySnapshot = feature.snapshot();
exposedLibrarySnapshot.library.activeLibrary.key = 'mutated-library';
assert.strictEqual(controllerState.activeLibrary.key, 'playlists', 'Library snapshots must not expose the controller-owned active library');
var exposedActiveLibrary = feature.activeLibrary();
exposedActiveLibrary.key = 'mutated-semantic-getter';
assert.strictEqual(controllerState.activeLibrary.key, 'playlists', 'the semantic activeLibrary getter must return a DTO copy');

var cacheCountBeforeContainerLeave = calls.filter(function (value) { return value === 'cache'; }).length;
feature.leave();
assert.strictEqual(calls.filter(function (value) { return value === 'cache'; }).length, cacheCountBeforeContainerLeave, 'leaving an open container must not overwrite the parent library cache with container items');
var rendersBeforeLateCallback = calls.filter(function (value) { return value === 'grid-render'; }).length;
lifecycleOptions.onRender();
assert.strictEqual(calls.filter(function (value) { return value === 'grid-render'; }).length, rendersBeforeLateCallback, 'late lifecycle callbacks are ignored after leave');

feature.scheduleWatchlistWarm();
currentView = 'detail';
var warmAwayFromHome = warmTimers[warmTimers.length - 1];
var watchlistLoadsBeforeAwayWarm = watchlistLoads.length;
warmAwayFromHome.callback();
assert.strictEqual(watchlistLoads.length, watchlistLoadsBeforeAwayWarm, 'Watchlist warm timer must not start background work after the user leaves Home');
currentView = 'home';
feature.scheduleWatchlistWarm();
var warmBeforeReset = warmTimers[warmTimers.length - 1];
feature.resetContent();
assert.strictEqual(warmBeforeReset.cleared, true, 'resetContent must cancel a pending Watchlist warm timer');
feature.scheduleWatchlistWarm();
var warmBeforeDestroy = warmTimers[warmTimers.length - 1];
feature.destroy();
assert.strictEqual(warmBeforeDestroy.cleared, true, 'destroy must cancel a pending Watchlist warm timer');
feature.destroy();
assert.deepStrictEqual(destroyCounts, { controller: 1, filter: 1, grid: 1, lifecycle: 1, watchlist: 1 }, 'feature teardown is idempotent and destroys every owned component once');
assert.strictEqual(nodes['library-grid'].listeners.scroll, undefined, 'feature teardown removes its owned scroll listener');
assert.strictEqual(nodes['watchlist-grid'].listeners.scroll, undefined, 'feature teardown removes its owned Watchlist scroll listener');
assert.strictEqual(feature.handleKey({ keyCode: 13 }, ''), false, 'destroy makes feature input inert');

console.log('Library feature controller checks passed');
