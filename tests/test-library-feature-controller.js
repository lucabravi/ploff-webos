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
  hasContainer: false,
  continueAvailable: null,
  collectionsAvailable: null
};
var watchlistState = { zone: 'nav', provider: { id: 'provider' }, loading: false, mutationPending: false, loadedIdentity: 'identity' };
var lifecycleLoads = [];
var focusedCatalog = [];
var setItemsCalls = [];
var watchlistLoads = [];

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
      buildDetachedRecommendations: function () { return null; },
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
      openContainer: function (item) {
        lifecycleState.container = item;
        lifecycleState.hasContainer = true;
        return true;
      },
      setContainerSummary: function (summary) {
        lifecycleState.containerSummary = summary;
        calls.push('container-summary');
      },
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
  platform: { root: { Image: function () {} }, document: document },
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
      loadLibraryRecommendations: function (config, library, callback) { callback(null, []); return { abort: function () {} }; },
      loadLibraryFilterOptions: function (config, library, callback) { callback(null, {}); return { abort: function () {} }; },
      loadLibraryContainerPage: function () {},
      loadLibraryPage: function () {},
      refreshLibrary: function () {},
      refreshLibraryMetadata: function () {},
      findByGuid: function () {}
    },
    WatchlistClient: { discover: function () {}, load: function () {}, set: function () {} },
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
    posterLoader: { load: function () {}, cancelScope: function () {} },
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

feature.enterPlaylists({ navigationIndex: 2, keepNavigationFocus: false });
assert.strictEqual(controllerState.activeLibrary.globalPlaylists, true, 'playlist entry uses a global playlist library');
assert.strictEqual(nodes['library-view'].className.indexOf('is-global-playlists') !== -1, true, 'playlist entry owns the library presentation class');

feature.enterWatchlist({ keepNavigationFocus: true });
assert.strictEqual(currentView, 'watchlist', 'Watchlist entry updates the application view');
assert.strictEqual(watchlistLoads[watchlistLoads.length - 1], false, 'Watchlist entry loads data through the owned view');
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
gridState.focus = { zone: 'grid', index: 3, recommendationRow: 0 };

nodes.content.style.display = 'block';
nodes['library-view'].className = 'library-view is-hidden';
currentView = 'library';
assert.strictEqual(feature.recoverPresentation(), true, 'library detail returns recover the owned surface');
assert.strictEqual(nodes.content.style.display, 'none', 'library recovery keeps the Home surface hidden');
assert.strictEqual(nodes['library-view'].className, 'library-view is-global-playlists is-container-detail', 'library recovery restores the active playlist container surface');

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

feature.destroy();
feature.destroy();
assert.deepStrictEqual(destroyCounts, { controller: 1, filter: 1, grid: 1, lifecycle: 1, watchlist: 1 }, 'feature teardown is idempotent and destroys every owned component once');
assert.strictEqual(nodes['library-grid'].listeners.scroll, undefined, 'feature teardown removes its owned scroll listener');
assert.strictEqual(feature.handleKey({ keyCode: 13 }, ''), false, 'destroy makes feature input inert');

console.log('Library feature controller checks passed');
