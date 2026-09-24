'use strict';

var assert = require('assert');
var PlaybackQueueModel = require('../app/playback-queue-model');
var LibraryFeatureController = require('../app/coordinator/library-feature-controller');
var PlexSourceRouter = require('../app/coordinator/plex-source-router');
var NavigationModel = require('../app/navigation-model');

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
      if (child && child.parentNode && child.parentNode.removeChild) { child.parentNode.removeChild(child); }
      this.children.push(child);
      this.firstChild = this.children[0] || null;
      child.parentNode = this;
      return child;
    },
    removeChild: function (child) {
      var index = this.children.indexOf(child);
      if (index !== -1) { this.children.splice(index, 1); }
      this.firstChild = this.children[0] || null;
      if (child && child.parentNode === this) { child.parentNode = null; }
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
var prefetchCancelOptions = [];
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
var recommendationLoads = 0;
var recommendationConfigs = [];
var filterConfigs = [];
var containerConfigs = [];
var libraryPageConfigs = [];
var sourceResolutions = [];
var deferredSourceResolution = null;
var deferredSourceRequest = null;
var watchlistClientLoads = [];
var watchlistFindLocalCalls = [];
var watchlistWatchedReconciles = [];
var contentRequestInvalidations = 0;
var catalogWindowRefreshes = [];
var multiServerPlaylistLoads = [];
var multiServerContainerLoads = [];
var multiServerGuidResolutions = [];
var availabilityReports = [];
var availabilityVerifications = [];
var libraryStatuses = [];
var failSharedContainerRequest = false;
var failPrimaryLibraryPageOnce = false;
var primaryLibraryRecoveryCalls = 0;

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
      cancelPrefetch: function (options) { prefetchCancelOptions.push(options || null); calls.push('cancel-prefetch'); return true; },
      touchDomCache: function () {},
      setActiveLibrary: function (library) { controllerState.activeLibrary = library; },
      setZone: function (zone, index) {
        controllerState.zone = zone;
        if (zone === 'actions') { controllerState.actionIndex = Number(index || 0); }
        if (zone === 'sort' || zone === 'filter') { controllerState.controlIndex = Number(index || 0); }
      },
      setTabIndex: function (index) { controllerState.tabIndex = Number(index || 0); },
      setControlIndex: function (index) { controllerState.controlIndex = Number(index || 0); },
      setWatchedFilter: function (value) { controllerState.watchedFilter = value; },
      scheduleAdjacentPrefetch: function (index, items, options) { calls.push('prefetch:' + index + ':' + items.length + ':' + (options && options.immediate === true ? 'immediate' : options && options.delay || 'default')); },
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
      prefetchLimit: function () { return 1; },
      buildDetachedTab: function (viewKey, _result, _maximumCards, _callback, posterScope) {
        warmTabBuilds.push({ viewKey: viewKey, scope: posterScope });
        return { grid: document.createDocumentFragment(), recommendations: document.createDocumentFragment() };
      },
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
      buildDetachedRecommendations: function (_rows, _maximumCards, callback) { detachedRecommendationBuilds += 1; if (callback) { callback(); } return { grid: { detached: true }, recommendations: { detached: true } }; },
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
      reload: function (context) {
        contentRequestInvalidations += 1;
        lifecycleLoads.push({ context: context, reset: false, preserve: true, reload: true });
      },
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
      findLocal: function (key, machineIdentifier) {
        watchlistFindLocalCalls.push([key, machineIdentifier]);
        return key === 'local' ? { ratingKey: key, serverMachineIdentifier: machineIdentifier || '' } : null;
      },
      reconcileWatchedState: function (key, watched, machineIdentifier) {
        watchlistWatchedReconciles.push([key, watched, machineIdentifier]);
        return true;
      },
      reconcilePlaybackProgress: function (key, seconds, machineIdentifier) {
        watchlistWatchedReconciles.push(['progress', key, seconds, machineIdentifier]);
        return true;
      },
      toggle: function (key, enabled, local, callback) { calls.push('watchlist-toggle:' + key + ':' + enabled); callback(null); },
      reset: function () { calls.push('watchlist-reset'); },
      destroy: function () { destroyCounts.watchlist += 1; }
    };
  }
};

var libraryRouterCalls = 0;
var libraryBaseConfig = { apiBaseUrl: 'http://primary', token: 'primary-token', requestTimeout: 1500, itemLimit: 77 };
var libraryLiveContexts = {};
var libraryBaseRouter = PlexSourceRouter.create({
  config: libraryBaseConfig,
  sources: {
    primaryContext: function () { return { serverMachineIdentifier: 'primary', apiBaseUrl: 'http://primary', token: 'primary-token', requestTimeout: 1500, primary: true }; },
    contextForMachine: function (machineIdentifier) { return libraryLiveContexts[String(machineIdentifier || '')] || null; }
  }
});
var librarySourceRouter = {
  configFor: function (item, context) { libraryRouterCalls += 1; return libraryBaseRouter.configFor(item, context); },
  contextForItem: function (item, context) { return libraryBaseRouter.contextForItem(item, context); },
  routeFor: function (item, context) { return libraryBaseRouter.routeFor(item, context); },
  decorateItem: function (item, context) { return libraryBaseRouter.decorateItem(item, context); }
};

var currentView = 'home';
var watchlistVisible = true;
var navigationIndex = 2;
var navigationItems = [{ kind: 'home' }, { kind: 'library', key: '1' }, { kind: 'playlists' }];
var tabPrefetchClears = 0;
var tabPrefetchInvalidations = [];
var warmTabPrefetchResponses = [];
var warmTabBuilds = [];
var posterScopesCancelled = [];
var opened = [];
var openedSourceContexts = [];
var themeSourceContexts = [];
var ownerlessSourceContext = null;
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
    LibraryTabPrefetch: { create: function (options) {
      return {
        request: function (request, callback, onProgress) { return options.load(request, callback, onProgress); },
        ensure: function (context) {
          var response;
          while (warmTabPrefetchResponses.length) {
            response = warmTabPrefetchResponses.shift();
            context.onReady(response.viewKey, response.result, { priority: 1 });
          }
          return true;
        },
        cancelLibrary: function () {},
        cancelPending: function () {},
        clear: function () { tabPrefetchClears += 1; },
        invalidateLibrary: function (library) { tabPrefetchInvalidations.push(String(library && library.sourceId || '')); },
        invalidateLibraries: function (requests) {
          requests.forEach(function (request) { tabPrefetchInvalidations.push(String(request.library && request.library.sourceId || '')); });
        },
        destroy: function () {}
      };
    } },
    PlaybackQueueModel: PlaybackQueueModel,
    NavigationModel: NavigationModel,
    ProgressiveImages: { previewSize: function () { return { width: 10, height: 20 }; } },
    SearchModel: {},
    WatchlistState: {},
    WatchlistView: FakeWatchlistView,
    CardLayout: { columns: function () { return 5; } }
  },
  data: {
    PlexClient: {
      loadLibraryRecommendations: function (config, library, callback) { recommendationLoads += 1; recommendationConfigs.push({ config: config, library: library }); callback(null, []); return { abort: function () {} }; },
      loadLibraryFilterOptions: function (config, library, callback) { filterConfigs.push({ config: config, library: library }); callback(null, {}); return { abort: function () {} }; },
      loadLibraryContainerPage: function (config, container, start, limit, callback) { containerConfigs.push(config); if (callback) { callback(failSharedContainerRequest ? new Error('container unavailable') : null, failSharedContainerRequest ? null : { items: [] }); } return { abort: function () {} }; },
      loadLibraryPage: function (config, library, viewKey, query, start, limit, callback) {
        var error;
        libraryPageConfigs.push(config);
        if (failPrimaryLibraryPageOnce && config && config.apiBaseUrl === 'http://primary.example') {
          failPrimaryLibraryPageOnce = false;
          error = new Error('primary route failed');
          error.transportFailure = true;
          if (callback) { callback(error); }
          return { abort: function () {} };
        }
        if (callback) { callback(null, { libraryKey: library.key, items: [{ ratingKey: 'raw-page-item' }] }); }
        return { abort: function () {} };
      },
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
    config: libraryBaseConfig,
    sourceRouter: librarySourceRouter,
    resolveSource: function (sourceId, callback) {
      var contexts = {
        'server-a|1': { sourceId: 'server-a|1', serverMachineIdentifier: 'server-a', serverName: 'Primary', owned: true, primary: true, sectionKey: '1', apiBaseUrl: 'http://primary.example', token: 'primary-token' },
        'empty|1': { sourceId: 'empty|1', serverMachineIdentifier: 'empty', apiBaseUrl: 'https://empty.example', token: '' },
        'server-b|4': { sourceId: 'server-b|4', serverMachineIdentifier: 'server-b', serverName: 'Marco', owned: false, sectionKey: '4', apiBaseUrl: 'https://relay-b.example', token: 'shared-token-b', requestTimeout: 9000 },
        'server-c|1': { sourceId: 'server-c|1', serverMachineIdentifier: 'server-c', serverName: 'Paolo', owned: false, sectionKey: '1', apiBaseUrl: 'https://relay-c.example', token: 'shared-token-c', requestTimeout: 8000 }
      };
      var request = { aborted: false, abort: function () { this.aborted = true; } };
      sourceResolutions.push(sourceId);
      if (sourceId === 'server-slow|5') {
        deferredSourceResolution = callback;
        deferredSourceRequest = request;
      } else if (sourceId === 'server-down|2') { callback(new Error('shared source unavailable')); }
      else if (contexts[sourceId]) { callback(null, contexts[sourceId]); }
      else { callback(new Error('unknown source')); }
      return request;
    },
    accountToken: function () { return 'token'; },
    watchlistIdentity: function () { return 'identity'; },
    watchlistAvailable: function () { return true; },
    resolveGuid: function (guid, callback) { multiServerGuidResolutions.push(guid); callback(null, { ratingKey: 'external-watch', serverMachineIdentifier: 'server-b' }); return { abort: function () {} }; },
    loadGlobalPlaylists: function (start, limit, callback) { multiServerPlaylistLoads.push([start, limit]); callback(null, { items: [{ ratingKey: 'playlist-b', serverMachineIdentifier: 'server-b', title: 'Shared playlist' }], totalSize: 1, nextStart: 1, hasMore: false }); return { abort: function () {} }; },
    loadGlobalPlaylistItems: function (container, start, limit, callback) { multiServerContainerLoads.push([container.serverMachineIdentifier, start, limit]); callback(null, { items: [{ ratingKey: 'episode-b', serverMachineIdentifier: 'server-b' }], totalSize: 1, nextStart: 1, hasMore: false }); return { abort: function () {} }; },
    reportAvailability: function (machineIdentifier, available) { availabilityReports.push([machineIdentifier, available]); },
    verifyAvailability: function (machineIdentifier, callback) { availabilityVerifications.push(machineIdentifier); callback(null, { serverMachineIdentifier: machineIdentifier }); return { abort: function () {} }; },
    reportLibraryStatus: function (id, failed) { libraryStatuses.push([id, failed]); },
    recoverPrimary: function (_error, callback) {
      primaryLibraryRecoveryCalls += 1;
      callback(null, {
        serverMachineIdentifier: 'server-a', serverName: 'Primary', owned: true, primary: true,
        apiBaseUrl: 'https://direct-primary.example', token: 'primary-token', requestTimeout: 1500
      });
      return true;
    },
    sourceContextForItem: function (item) { return item && item.serverMachineIdentifier ? { sourceId: item.serverMachineIdentifier + '|9', serverMachineIdentifier: item.serverMachineIdentifier, apiBaseUrl: 'https://' + item.serverMachineIdentifier + '.example', token: item.serverMachineIdentifier + '-token' } : ownerlessSourceContext; }
  },
  state: {
    currentView: function () { return currentView; },
    navigationIndex: function () { return navigationIndex; },
    navigationItems: function () { return navigationItems; },
    setNavigationIndex: function (index) { navigationIndex = index; },
    homeBusy: function () { return false; },
    pointerActive: function () { return false; },
    cardScale: function () { return 'normal'; },
    watchlistVisible: function () { return watchlistVisible; }
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
    scheduleBackdropPrefetch: function (items, view) { calls.push('backdrop-prefetch:' + (items || []).map(function (item) { return item.ratingKey; }).join(',') + ':' + view); },
    scheduleTheme: function (item, sourceContext) { calls.push('theme:' + item.ratingKey); themeSourceContexts.push(sourceContext || null); },
    stopTheme: function () { calls.push('stop-theme'); },
    cardMetrics: function () { return { width: 200, imageHeight: 300 }; },
    mediaTitle: function (item) { return item.title || ''; },
    mediaCardMeta: function () { return 'meta'; },
    mediaCardDetail: function () { return 'detail'; },
    mediaKey: function (item) { return String(item.ratingKey || ''); },
    artworkUrl: function (item) { return item.art || ''; },
    renderedPosterSpecification: function () { posterArguments.push(Array.prototype.slice.call(arguments)); return {}; },
    posterLoader: { load: function () {}, cancelScope: function (scope) { posterScopesCancelled.push(scope); } },
    prioritizePoster: function () {},
    suspendSettings: function () {},
    refreshHome: function () { calls.push('refresh-home'); },
    setHomeArtworkPressure: function (reason, active) { calls.push('artwork-pressure:' + reason + ':' + active); }
  },
  server: { waitForActivity: function (id, callback) { callback(null); } },
  transitions: {
    setView: function (view) { currentView = view; },
    openDetail: function (item, sourceContext) { opened.push(item.ratingKey); openedSourceContexts.push(sourceContext || null); },
    playItem: function (item, sourceContext) { calls.push('play:' + item.ratingKey); openedSourceContexts.push(sourceContext || null); },
    returnHome: function () { calls.push('home'); },
    onWatchlistItemsChanged: function () { calls.push('watchlist-changed'); }
  }
});

assert.ok(controllerOptions, 'feature constructs LibraryController');
assert.ok(filterOptions, 'feature constructs LibraryFilterView');
assert.ok(gridOptions, 'feature constructs LibraryGridView');
assert.ok(lifecycleOptions, 'feature constructs LibraryLifecycle');
assert.ok(watchlistOptions, 'feature constructs WatchlistView');
currentView = 'library';
feature.enterLibrary({ key: 'preview-restore' }, {});
controllerState.tabIndex = 0;
controllerOptions.scheduleTabPreview(1, 0);
controllerState.tabIndex = 1;
controllerOptions.cancelTabPreview(true);
assert.strictEqual(controllerState.tabIndex, 0, 'cancelling a library tab preview must restore the last committed tab');
feature.leave();
cachedState = null;
controllerState.activeLibrary = null;
currentView = 'home';
controllerState.viewKey = 'recommended';
controllerState.tabIndex = 0;
warmTabPrefetchResponses = [
  { viewKey: 'catalog', result: { items: [{ ratingKey: 'warm-tab-cover' }] } },
  { viewKey: 'recent', result: { items: [{ ratingKey: 'warm-recent-cover' }] } }
];
feature.enterLibrary({ key: 'warm-tab-scope-test' }, {});
assert.ok(warmTabBuilds.some(function (entry) { return entry.viewKey === 'catalog' && entry.scope === 'library-tab-prefetch-catalog'; }),
  'an adjacent prefetched tab must retain a dedicated artwork cancellation scope');
posterScopesCancelled = [];
controllerState.viewKey = 'catalog';
controllerState.tabIndex = 3;
assert.strictEqual(controllerOptions.selectTab(3), true, 'the warmed destination tab must be selectable');
assert.strictEqual(posterScopesCancelled.indexOf('library-tab-prefetch-catalog'), -1,
  'selecting a warmed tab must preserve its in-flight SD cover requests while its detached DOM is attached');
assert.strictEqual(posterScopesCancelled.indexOf('library-tab-prefetch-recent'), -1,
  'opening another tab must preserve the cached SD covers of a likely next destination');
controllerState.viewKey = 'recent';
controllerState.tabIndex = 2;
assert.strictEqual(controllerOptions.selectTab(2), true, 'a warmed tab can subsequently be left normally');
assert.ok(posterScopesCancelled.indexOf('library-tab-prefetch-catalog') !== -1,
  'leaving a warmed tab must cancel its remaining unpromoted background artwork');
assert.strictEqual(posterScopesCancelled.indexOf('library-tab-prefetch-recent'), -1,
  'the next warmed destination must keep its cover requests when opened');
feature.leave();
cachedState = null;
controllerState.activeLibrary = null;
currentView = 'home';
assert.strictEqual(typeof watchlistOptions.isActive, 'function', 'LibraryFeature must provide WatchlistView with an active-surface guard');
assert.strictEqual(typeof watchlistOptions.findByGuid, 'function', 'Watchlist must expose a GUID resolver');
var resolvedWatchlistItem = null;
watchlistOptions.findByGuid('plex://movie/external', function (error, item) { assert.ifError(error); resolvedWatchlistItem = item; });
assert.strictEqual(multiServerGuidResolutions[multiServerGuidResolutions.length - 1], 'plex://movie/external', 'Watchlist must resolve cloud GUIDs through all reachable PMSes');
assert.strictEqual(resolvedWatchlistItem.serverMachineIdentifier, 'server-b', 'Watchlist resolver must preserve the owning PMS identity');
lifecycleOptions.loadLibraryPage({ key: 'playlists', globalPlaylists: true }, 'playlists', {}, 0, 60, function () {});
assert.deepStrictEqual(multiServerPlaylistLoads[multiServerPlaylistLoads.length - 1], [0, 60], 'global Playlists must load through the multi-server catalog');
controllerState.activeLibrary = { key: 'playlists', globalPlaylists: true };
lifecycleOptions.loadContainerPage({ ratingKey: 'playlist-b', serverMachineIdentifier: 'server-b' }, 0, 60, function () {});
assert.deepStrictEqual(multiServerContainerLoads[multiServerContainerLoads.length - 1], ['server-b', 0, 60], 'playlist items must load from the owning PMS');
controllerOptions.openItem({ ratingKey: 'playlist-item', serverMachineIdentifier: 'server-b' });
assert.strictEqual(openedSourceContexts[openedSourceContexts.length - 1].serverMachineIdentifier, 'server-b', 'opening an aggregated playlist item must propagate its source context');
controllerState.activeLibrary = null;
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
var directWatchlistWarmSettled = 0;
var directWatchlistPressureStart = calls.length;
assert.strictEqual(feature.warmWatchlist(function () { directWatchlistWarmSettled += 1; }), true,
  'Library feature must expose an immediate Watchlist warm step for the startup chain');
assert.strictEqual(watchlistLoads[watchlistLoads.length - 1], false, 'direct Watchlist warm must reuse the normal cached Watchlist load path');
assert.strictEqual(directWatchlistWarmSettled, 1, 'direct Watchlist warm must settle its chain callback when loading completes');
assert.deepStrictEqual(calls.slice(directWatchlistPressureStart).filter(function (value) { return value.indexOf('artwork-pressure:watchlist-warm:') === 0; }),
  ['artwork-pressure:watchlist-warm:true', 'artwork-pressure:watchlist-warm:false'],
  'direct Watchlist warm must own artwork pressure only for its actual load');
assert.strictEqual(typeof controllerOptions.onPrefetchWorkChange, 'function', 'Library controller must publish actual adjacent-prefetch work to the feature');
var libraryPressureStart = calls.length;
controllerOptions.onPrefetchWorkChange(true);
controllerOptions.onPrefetchWorkChange(false);
assert.deepStrictEqual(calls.slice(libraryPressureStart), ['artwork-pressure:library-prefetch:true', 'artwork-pressure:library-prefetch:false'],
  'Library prefetch work must share the same reason-based Home artwork pressure');
var coldPrefetchRows = [{ title: 'Warm row', items: [{ ratingKey: 'warm-1', image: '/warm.jpg', art: '/warm-art.jpg' }] }];
var coldPrefetchState = controllerOptions.buildPrefetchedState({ key: 'warm', title: 'Warm' }, coldPrefetchRows);
var coldWarmSettled = 0;
assert.strictEqual(detachedRecommendationBuilds, 0, 'data mapping alone must stay presentation-free before the explicit warm phase');
assert.strictEqual(coldPrefetchState.dom, null, 'prefetched state begins without DOM until its explicit presentation warm step');
assert.strictEqual(typeof controllerOptions.warmPrefetch, 'function', 'adjacent prefetch must expose detached presentation warming to the Library domain controller');
assert.strictEqual(controllerOptions.warmPrefetch({ key: 'warm', title: 'Warm' }, coldPrefetchRows, coldPrefetchState, function () { coldWarmSettled += 1; }), true,
  'detached presentation warming must participate in the completion-driven startup prefetch');
assert.strictEqual(detachedRecommendationBuilds, 1, 'cold adjacent prefetch must prebuild Library recommendation cards before first entry');
assert.ok(coldPrefetchState.dom, 'cold adjacent prefetch must retain detached Library DOM for flash-free first entry');
assert.strictEqual(coldWarmSettled, 1, 'detached presentation warm must publish settlement after its SD poster batch is ready');
cachedState = coldPrefetchState;
var lifecycleLoadsBeforeWarmEntry = lifecycleLoads.length;
var recommendationLoadsBeforeWarmEntry = recommendationLoads;
var gridRestoresBeforeWarmEntry = calls.filter(function (value) { return value === 'grid-restore'; }).length;
feature.enterLibrary({ key: 'warm', title: 'Warm' }, { navigationIndex: 1, keepNavigationFocus: true });
assert.strictEqual(lifecycleLoads.length, lifecycleLoadsBeforeWarmEntry, 'intent-time entry must reuse prefetched recommendation data without a new Library lifecycle load');
assert.strictEqual(recommendationLoads, recommendationLoadsBeforeWarmEntry, 'intent-time entry must not repeat the recommendation request already completed by prefetch');
assert.strictEqual(calls.filter(function (value) { return value === 'grid-restore'; }).length, gridRestoresBeforeWarmEntry + 1, 'intent-time entry must render the cached recommendation model through the normal grid restore path');
assert.deepStrictEqual(gridState.recommendations, coldPrefetchRows, 'intent-time rendering must preserve the prefetched Plex row order');
// The lightweight DOM stub does not implement DocumentFragment child transfer; clear this fixture-only attachment before unrelated cache tests.
coldPrefetchState.dom = null;
nodes['library-grid-content'].children = []; nodes['library-grid-content'].firstChild = null;
nodes['library-recommended'].children = []; nodes['library-recommended'].firstChild = null;
controllerState.zone = 'grid';
gridOptions.onFocus({ zone: 'grid', index: 1 }, { ratingKey: 'library-current' }, [{ ratingKey: 'library-next' }, { ratingKey: 'library-left' }]);
assert.ok(calls.indexOf('backdrop-prefetch:library-next,library-left:library') !== -1,
  'Library focus must forward directional adjacent items to the shared backdrop prefetch scheduler');
controllerState.zone = 'tabs';
controllerOptions.updateFocus();
assert.ok(calls.indexOf('backdrop-prefetch::library') !== -1,
  'leaving Library media cards for tabs/controls must cancel same-view speculative backdrop work');
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
var externalPosterContext = { sourceId: 'server-b|4', serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://server-b.example', token: 'server-b-token' };
var externalPosterItem = { ratingKey: 'external-poster', serverMachineIdentifier: 'server-b' };
gridOptions.renderedPosterSpecification('external-image', '/external/poster', 0, 'library', 220, 320, externalPosterContext, externalPosterItem);
assert.deepStrictEqual(posterArguments[2], ['external-image', '/external/poster', 0, 'library', 220, 320, externalPosterContext, externalPosterItem],
  'Library poster wiring must preserve the media owner item as the eighth argument instead of truncating it at the feature boundary');

feature.translateStatic();
assert.strictEqual(nodes['library-refresh-metadata'].textContent, 'library.refreshMetadata', 'feature translates its refresh command');
assert.strictEqual(nodes['library-refresh'].attributes['aria-label'], 'library.refresh', 'feature owns refresh accessibility labels');

var sharedLibrary = { kind: 'library', key: '4', title: 'Movies', sourceId: 'server-b|4', serverMachineIdentifier: 'server-b', owned: false };
var sharedLoadsBeforeEntry = lifecycleLoads.length;
feature.enterLibrary(sharedLibrary, { navigationIndex: 1, keepNavigationFocus: false });
assert.strictEqual(sourceResolutions[sourceResolutions.length - 1], 'server-b|4',
  'opening a source-aware Library tab must resolve its PMS transport before loading content');
assert.strictEqual(controllerState.activeLibrary.sourceId, 'server-b|4',
  'the Library controller must retain the stable multi-server source identity');
assert.strictEqual(lifecycleLoads.length, sharedLoadsBeforeEntry + 1,
  'a resolved shared Library must enter through the normal lifecycle exactly once');
assert.strictEqual(feature.snapshot().sourceId, 'server-b|4',
  'the Library feature snapshot must expose the active source identity for downstream Detail/Player ownership');
assert.strictEqual(feature.matchesNavigation(sharedLibrary), true,
  'the active source-aware Library must match its own navigation tab');
assert.strictEqual(feature.matchesNavigation({ kind: 'library', key: '4', sourceId: 'server-a|4' }), false,
  'equal Plex section keys on different servers must not be treated as the same Library');
controllerState.zone = 'grid';
ownerlessSourceContext = { sourceId: 'primary|1', serverMachineIdentifier: 'primary', apiBaseUrl: 'http://primary', token: 'primary-token' };
gridOptions.onFocus({ zone: 'grid', index: 0 }, { ratingKey: 'shared-current' }, []);
assert.strictEqual(themeSourceContexts[themeSourceContexts.length - 1].sourceId, 'server-b|4',
  'focused shared Library items must pass the resolved source context to theme scheduling');
assert.strictEqual(themeSourceContexts[themeSourceContexts.length - 1].token, 'shared-token-b',
  'focused shared Library themes must retain the source-specific Plex token');
gridOptions.onFocus({ zone: 'grid', index: 0 }, { ratingKey: 'external-current', serverMachineIdentifier: 'server-c' }, []);
assert.strictEqual(themeSourceContexts[themeSourceContexts.length - 1].sourceId, 'server-c|9',
  'focused mixed-library items must override the active Library context for theme scheduling');
assert.strictEqual(themeSourceContexts[themeSourceContexts.length - 1].token, 'server-c-token',
  'mixed-library themes must retain the item server token');
assert.strictEqual(controllerOptions.actionsAvailable(sharedLibrary), false,
  'management actions must be unavailable for an owned=false shared Library');
var resolutionsBeforeActiveLifecycle = sourceResolutions.length;
lifecycleOptions.loadRecommendations(sharedLibrary, function () {});
assert.strictEqual(sourceResolutions.length, resolutionsBeforeActiveLifecycle,
  'active Library lifecycle requests must reuse the resolved source context without repeating account route resolution');
assert.strictEqual(recommendationConfigs[recommendationConfigs.length - 1].config.apiBaseUrl, 'https://relay-b.example',
  'shared Library lifecycle requests must use the resolved Relay/direct source URL rather than the primary PMS');
assert.strictEqual(recommendationConfigs[recommendationConfigs.length - 1].config.token, 'shared-token-b',
  'shared Library lifecycle requests must use the server-specific token');
assert.strictEqual(recommendationConfigs[recommendationConfigs.length - 1].config.itemLimit, 77,
  'source transport overrides must preserve application-level Plex client settings');
filterOptions.loadOptions(sharedLibrary, function () {});
assert.strictEqual(filterConfigs[filterConfigs.length - 1].config.apiBaseUrl, 'https://relay-b.example',
  'shared Library filter requests must remain on the active source PMS');
var decoratedSharedPage = null;
lifecycleOptions.loadLibraryPage(sharedLibrary, 'catalog', {}, 0, 30, function (error, page) { assert.ifError(error); decoratedSharedPage = page; });
assert.deepStrictEqual(libraryStatuses[libraryStatuses.length - 1], ['server-b|4', false], 'concrete library success must clear source warnings');
assert.strictEqual(decoratedSharedPage.items[0].serverMachineIdentifier, 'server-b',
  'raw Plex Library page items must retain the active shared PMS identifier before reaching the grid');
assert.strictEqual(decoratedSharedPage.items[0].sourceId, 'server-b|4',
  'raw Plex Library page items must retain the active source identity before reaching the grid');
controllerOptions.openItem({ ratingKey: 'shared-detail' });
assert.strictEqual(openedSourceContexts[openedSourceContexts.length - 1].sourceId, 'server-b|4',
  'opening Detail from a shared Library must propagate the active source context');
assert.strictEqual(openedSourceContexts[openedSourceContexts.length - 1].token, 'shared-token-b',
  'opening Detail from a shared Library must retain the source-specific token in memory');
ownerlessSourceContext = null;

lifecycleOptions.loadContainerPage({ ratingKey: 'collection-1' }, 0, 20, function () {});
assert.strictEqual(containerConfigs[containerConfigs.length - 1].apiBaseUrl, 'https://relay-b.example',
  'shared Library container requests must remain on the active source PMS');
failSharedContainerRequest = true;
var sharedContainerError = null;
lifecycleOptions.loadContainerPage({ ratingKey: 'collection-error' }, 0, 20, function (error) { sharedContainerError = error; });
assert.ok(sharedContainerError, 'a secondary Library content error must still be surfaced to the current view');
assert.strictEqual(availabilityVerifications[availabilityVerifications.length - 1], 'server-b',
  'a secondary Library content error must verify PMS connectivity before changing global availability');
assert.deepStrictEqual(availabilityReports, [],
  'a Library content error alone must never mark every Library on that PMS offline');
failSharedContainerRequest = false;

var prefetchResolutionsBefore = sourceResolutions.length;
controllerOptions.loadRecommendations({ key: '1', title: 'Movies', sourceId: 'server-c|1', owned: false }, function () {});
assert.strictEqual(sourceResolutions.length, prefetchResolutionsBefore + 1,
  'adjacent prefetch must resolve the candidate Library source instead of reusing the active PMS');
assert.strictEqual(sourceResolutions[sourceResolutions.length - 1], 'server-c|1');
assert.strictEqual(recommendationConfigs[recommendationConfigs.length - 1].config.apiBaseUrl, 'https://relay-c.example',
  'adjacent prefetch must issue its recommendation request against the candidate PMS');

var activeBeforeUnavailable = controllerState.activeLibrary.sourceId;
var loadsBeforeUnavailable = lifecycleLoads.length;
var homeReturnsBeforeUnavailable = calls.filter(function (entry) { return entry === 'home'; }).length;
feature.enterLibrary({ key: '2', title: 'Shows', sourceId: 'server-down|2', owned: false }, { navigationIndex: 1 });
assert.strictEqual(controllerState.activeLibrary.sourceId, activeBeforeUnavailable,
  'an unavailable secondary PMS must not replace the currently active Library surface');
assert.strictEqual(lifecycleLoads.length, loadsBeforeUnavailable,
  'an unavailable secondary PMS must not start a Library lifecycle with the primary config');
assert.strictEqual(calls.filter(function (entry) { return entry === 'home'; }).length, homeReturnsBeforeUnavailable + 1,
  'a failed external Library entry must restore Home after the caller has hidden the previous surface');

var lifecycleLoadsBeforePrimaryEntry = lifecycleLoads.length;
feature.enterLibrary({ key: '1', title: 'Movies' }, { navigationIndex: 1, keepNavigationFocus: false });
assert.strictEqual(currentView, 'library', 'library entry updates the application view through a port');
assert.strictEqual(controllerState.activeLibrary.key, '1', 'library entry delegates to the domain controller');
assert.strictEqual(lifecycleLoads.length, lifecycleLoadsBeforePrimaryEntry + 1, 'uncached library entry starts the owned lifecycle');
assert.ok(calls.indexOf('probe-continue') !== -1 && calls.indexOf('probe-collections') !== -1, 'ordinary libraries probe optional tabs');
var resetsBeforeTabSwitch = calls.filter(function (entry) { return entry === 'grid-reset'; }).length;
gridState.items = [{ ratingKey: 'resident' }];
controllerState.viewKey = 'recent';
controllerOptions.selectTab(2);
assert.strictEqual(lifecycleLoads[lifecycleLoads.length - 1].reset, false, 'tab switch retains the previous grid while its data loads');
assert.strictEqual(lifecycleLoads[lifecycleLoads.length - 1].preserve, true, 'new tab data replaces the resident grid from the first page');
assert.strictEqual(calls.filter(function (entry) { return entry === 'grid-reset'; }).length, resetsBeforeTabSwitch,
  'tab switch must not blank the mounted grid before the next result');
assert.strictEqual(nodes['library-grid'].style.pointerEvents, 'none', 'resident cards are not interactive under a pending tab');
assert.strictEqual(controllerOptions.focusTabContent(), false, 'Down must not enter the stale grid during a pending tab');
assert.strictEqual(controllerOptions.selectTab(2), true, 'a superseding tab request remains possible');
lifecycleLoads[lifecycleLoads.length - 1].context.beforeReplace();
assert.strictEqual(calls.filter(function (entry) { return entry === 'grid-reset'; }).length, resetsBeforeTabSwitch + 1,
  'the previous grid is cleared only when replacement data is ready');
assert.strictEqual(nodes['library-grid'].style.pointerEvents, '', 'replacement re-enables grid pointer input');
controllerState.viewKey = 'recommended';
controllerState.tabIndex = 0;
var residentTabButton = nodes['library-tabs'].children[1];
lifecycleState.continueAvailable = false;
lifecycleOptions.onContinueAvailable();
assert.strictEqual(nodes['library-tabs'].children[1], residentTabButton,
  'availability updates must retain mounted subnavigation buttons and their focus identity');
assert.strictEqual(residentTabButton.disabled, true, 'availability updates must still disable an empty Continue tab');
lifecycleState.continueAvailable = null;
lifecycleOptions.onContinueAvailable();
assert.strictEqual(residentTabButton.disabled, false, 'the retained Continue button must become available again');

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

(function testCatalogFocusDelegatesClearingAndPosterPriorityToGridView() {
  var previousView = currentView;
  var previousZone = controllerState.zone;
  var previousViewKey = controllerState.viewKey;
  var originalRefreshFocus = boundViews.grid.refreshFocus;
  var originalQuerySelector = document.querySelector;
  var clearFocusBefore = calls.filter(function (value) { return value === 'clear-focus'; }).length;
  var querySelectorCalls = 0;
  currentView = 'library';
  controllerState.zone = 'grid';
  controllerState.viewKey = 'catalog';
  boundViews.grid.refreshFocus = function () {
    calls.push('grid-focus');
    gridOptions.clearFocus();
  };
  document.querySelector = function () {
    querySelectorCalls += 1;
    return node('query');
  };
  controllerOptions.updateFocus();
  assert.strictEqual(calls.filter(function (value) { return value === 'clear-focus'; }).length - clearFocusBefore, 1,
    'catalog focus movement must clear focus exactly once through LibraryGridView');
  assert.strictEqual(querySelectorCalls, 0,
    'catalog focus movement must not re-query the document after LibraryGridView resolves and prioritizes the mounted card');
  document.querySelector = originalQuerySelector;
  boundViews.grid.refreshFocus = originalRefreshFocus;
  currentView = previousView;
  controllerState.zone = previousZone;
  controllerState.viewKey = previousViewKey;
}());

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
assert.strictEqual(gridOptions.showLibraryBadge(), true, 'the global playlist list must show source-server badges before a playlist is opened');
assert.strictEqual(nodes['library-view'].className.indexOf('is-global-playlists') !== -1, true, 'playlist entry owns the library presentation class');

feature.enterWatchlist({ keepNavigationFocus: true });
assert.strictEqual(currentView, 'watchlist', 'Watchlist entry updates the application view');
assert.strictEqual(watchlistOptions.isActive(), true, 'WatchlistView must identify itself as the active focus owner while visible');
watchlistOptions.onFocus({ ratingKey: 'watch-current' }, [{ ratingKey: 'watch-next' }]);
assert.ok(calls.indexOf('backdrop-prefetch:watch-next:watchlist') !== -1,
  'Watchlist focus must forward directional adjacent items to the shared backdrop prefetch scheduler');
watchlistOptions.onNavigationFocus();
assert.ok(calls.indexOf('backdrop-prefetch::watchlist') !== -1,
  'entering Watchlist navigation must cancel same-view speculative backdrop work');
currentView = 'detail';
assert.strictEqual(watchlistOptions.isActive(), false, 'WatchlistView must become inactive while Detail is presented on top');
assert.strictEqual(feature.reconcileWatchedState('watchlist-item', true, { serverMachineIdentifier: 'server-b' }), true,
  'Watchlist must accept watched-state reconciliation while Detail owns the visible surface');
assert.deepStrictEqual(watchlistWatchedReconciles[watchlistWatchedReconciles.length - 1], ['watchlist-item', true, 'server-b'],
  'Watchlist reconciliation must retain the owning PMS when Detail returns over colliding ratingKeys');
assert.strictEqual(feature.reconcilePlaybackProgress('watchlist-item', 45, { serverMachineIdentifier: 'server-b' }), true,
  'Watchlist must accept final playback progress while Player owns the visible surface');
assert.deepStrictEqual(watchlistWatchedReconciles[watchlistWatchedReconciles.length - 1], ['progress', 'watchlist-item', 45, 'server-b'],
  'Watchlist playback progress must retain the owning PMS');
currentView = 'watchlist';
assert.strictEqual(watchlistLoads[watchlistLoads.length - 1], false, 'Watchlist entry loads data through the owned view');
nodes['watchlist-grid'].listeners.scroll();
assert.ok(calls.indexOf('watchlist-scroll') !== -1, 'Watchlist page scrolling must ask the virtual view to remount the visible window');
feature.handleKey({ keyCode: 40 }, 'down');
assert.ok(calls.indexOf('watchlist-key') !== -1, 'Watchlist input is routed inside the feature');
feature.pointerFocus('watchlist', 0, node('watch-card'));
feature.handleKey({ keyCode: 13, preventDefault: function () {} }, '');
assert.strictEqual(opened[opened.length - 1], 'watchlist-item', 'Watchlist pointer activation opens detail through a transition port');

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
assert.strictEqual(feature.restoreContainerOrigin({
  origin: { kind: 'playlist', containerRatingKey: 'playlist-1', serverMachineIdentifier: 'other-server' }
}), false, 'matching container IDs from another server must not restore the open playlist');
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
feature.scheduleAdjacentPrefetch(2, navigationItems, { immediate: true });
assert.ok(calls.indexOf('prefetch:2:3:immediate') !== -1, 'adjacent prefetch stays feature-owned and preserves intent scheduling options');
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

currentView = 'detail';
var watchlistLoadsBeforeAwayWarm = watchlistLoads.length;
assert.strictEqual(feature.warmWatchlist(function () {}), true, 'the startup Watchlist chain step must remain valid after the user leaves Home');
assert.strictEqual(watchlistLoads.length, watchlistLoadsBeforeAwayWarm + 1, 'view changes must not suspend an already-reached Watchlist warm step');
watchlistVisible = false;
var watchlistLoadsBeforeHiddenWarm = watchlistLoads.length;
assert.strictEqual(feature.warmWatchlist(function () {}), false, 'hidden Watchlist navigation must skip unnecessary startup warming');
assert.strictEqual(watchlistLoads.length, watchlistLoadsBeforeHiddenWarm, 'a hidden Watchlist must not start background work');
watchlistVisible = true;

currentView = 'home';
feature.resetContent();
lifecycleState.container = null;
lifecycleState.hasContainer = false;
var initialVirtualLibrary = {
  kind: 'library', key: '1', sourceId: 'server-a|1', title: 'Film', libraryName: 'Film',
  type: 'movie', virtualLibrary: false, serverMachineIdentifier: 'server-a'
};
var expandedVirtualLibrary = {
  kind: 'library', key: 'virtual|movie|film', sourceId: 'virtual|movie|film', title: 'Film', libraryName: 'Film',
  type: 'movie', virtualLibrary: true, memberSourceIds: ['server-a|1', 'server-b|1']
};
cachedState = { dom: { retained: true }, grid: { items: [{ ratingKey: 'cached-a-only' }] } };
var cacheClearsBeforeRecoveredPrefetch = calls.filter(function (value) { return value === 'clear-cache'; }).length;
var prefetchCancelsBeforeRecoveredPrefetch = calls.filter(function (value) { return value === 'cancel-prefetch'; }).length;
var tabClearsBeforeRecoveredPrefetch = tabPrefetchClears;
var tabInvalidationsBeforeRecoveredPrefetch = tabPrefetchInvalidations.length;
assert.strictEqual(feature.reconcileNavigation([expandedVirtualLibrary], {
  force: true,
  invalidateMachineIdentifier: 'server-b'
}), true, 'recovering a PMS must invalidate prefetched aggregate state even while no Library is open');
assert.strictEqual(calls.filter(function (value) { return value === 'clear-cache'; }).length, cacheClearsBeforeRecoveredPrefetch + 1,
  'an inactive aggregate containing the recovered PMS must not retain prefetch data created while that PMS was offline');
assert.strictEqual(calls.filter(function (value) { return value === 'cancel-prefetch'; }).length, prefetchCancelsBeforeRecoveredPrefetch + 1,
  'availability changes must cancel an in-flight adjacent prefetch before it can repopulate the invalidated aggregate cache');
assert.strictEqual(prefetchCancelOptions[prefetchCancelOptions.length - 1].preserveSettled, true,
  'availability-driven replacement prefetch must preserve the startup-chain settled callback until replacement work completes');
assert.strictEqual(tabPrefetchClears, tabClearsBeforeRecoveredPrefetch,
  'availability changes must not discard every Library tab-prefetch result');
assert.deepStrictEqual(tabPrefetchInvalidations.slice(tabInvalidationsBeforeRecoveredPrefetch), ['virtual|movie|film'],
  'availability changes must invalidate only tabs that depend on the affected PMS');
feature.enterLibrary(initialVirtualLibrary, { navigationIndex: 1 });
var unaffectedLibraryLoads = lifecycleLoads.length;
var tabInvalidationsBeforeUnrelatedChange = tabPrefetchInvalidations.length;
feature.reconcileNavigation([initialVirtualLibrary, {
  kind: 'library', key: '9', sourceId: 'server-b|9', title: 'Other', serverMachineIdentifier: 'server-b'
}], { force: true, invalidateMachineIdentifier: 'server-b' });
assert.strictEqual(lifecycleLoads.length, unaffectedLibraryLoads,
  'an unrelated PMS availability change must not reload the visible Library');
assert.deepStrictEqual(tabPrefetchInvalidations.slice(tabInvalidationsBeforeUnrelatedChange), ['server-b|9'],
  'an unrelated PMS availability change must preserve the active Library tab cache');
var virtualLoadsBeforeReconcile = lifecycleLoads.length;
var tabInvalidationsBeforeReconcile = tabPrefetchInvalidations.length;
assert.strictEqual(feature.reconcileNavigation([expandedVirtualLibrary]), true,
  'an open aggregated Library must accept a newly discovered external member');
assert.deepStrictEqual(controllerState.activeLibrary.memberSourceIds, ['server-a|1', 'server-b|1'],
  'the active aggregate must immediately adopt the expanded member list');
assert.strictEqual(lifecycleLoads.length, virtualLoadsBeforeReconcile + 1,
  'expanding the active aggregate must reload page zero immediately so the external member is merged without re-entry');
assert.deepStrictEqual(lifecycleLoads[lifecycleLoads.length - 1].context.library.memberSourceIds, ['server-a|1', 'server-b|1'],
  'the reload must use the expanded aggregate definition');
assert.deepStrictEqual(tabPrefetchInvalidations.slice(tabInvalidationsBeforeReconcile), ['server-a|1', 'virtual|movie|film'],
  'changing a visible aggregate definition must invalidate both old and new Library tab identities');

currentView = 'detail';
var detailLoadsBeforeReconcile = lifecycleLoads.length;
assert.strictEqual(feature.reconcileNavigation([{
  kind: 'library', key: 'virtual|movie|film', sourceId: 'virtual|movie|film', title: 'Film', libraryName: 'Film',
  type: 'movie', virtualLibrary: true, memberSourceIds: ['server-a|1', 'server-b|1', 'server-c|1']
}]), true, 'an aggregate discovered while Detail is open must still reconcile the retained Library origin');
assert.deepStrictEqual(controllerState.activeLibrary.memberSourceIds, ['server-a|1', 'server-b|1', 'server-c|1'],
  'Detail reconciliation must update the retained active Library definition');
assert.strictEqual(lifecycleLoads.length, detailLoadsBeforeReconcile,
  'reconciling behind Detail must defer catalog I/O until the Library surface is restored');
currentView = 'library';
feature.recoverPresentation();
assert.strictEqual(lifecycleLoads.length, detailLoadsBeforeReconcile + 1,
  'returning from Detail must reload a Library whose source membership changed while hidden');
gridState = {
  mode: 'catalog', usesGridScroll: true,
  items: [
    { ratingKey: 'shared-progress', serverMachineIdentifier: 'server-a', duration: 600000 },
    { ratingKey: 'shared-progress', serverMachineIdentifier: 'server-b', duration: 600000 }
  ],
  recommendations: [], totalSize: 2,
  focus: { zone: 'grid', index: 0, recommendationRow: 0 }
};
controllerState.viewKey = 'catalog';
assert.strictEqual(feature.reconcilePlaybackProgress('shared-progress', 300, { sourceId: 'server-b|1', serverMachineIdentifier: 'server-b' }), true,
  'aggregate playback reconciliation must accept the owning PMS context');
assert.strictEqual(gridState.items[0].viewOffset, undefined,
  'aggregate playback reconciliation must not mutate an equal ratingKey owned by another PMS');
assert.strictEqual(gridState.items[1].viewOffset, 300000,
  'aggregate playback reconciliation must patch the matching PMS occurrence');
gridState = {
  mode: 'catalog', usesGridScroll: true,
  items: [
    { ratingKey: 'shared-watched', serverMachineIdentifier: 'server-a', viewed: false },
    { ratingKey: 'shared-watched', serverMachineIdentifier: 'server-b', viewed: false }
  ],
  recommendations: [], totalSize: 2,
  focus: { zone: 'grid', index: 0, recommendationRow: 0 }
};
controllerState.viewKey = 'catalog';
controllerState.watchedFilter = 'unwatched';
assert.strictEqual(feature.reconcileWatchedState('shared-watched', true, { sourceId: 'server-b|1', serverMachineIdentifier: 'server-b' }), true,
  'aggregate watched reconciliation must accept the owning PMS context');
assert.strictEqual(gridState.items.length, 1,
  'marking one aggregate occurrence watched must remove only that occurrence from an unwatched filter');
assert.strictEqual(gridState.items[0].serverMachineIdentifier, 'server-a',
  'an equal ratingKey owned by another PMS must remain visible in the unwatched aggregate');
controllerState.watchedFilter = 'all';

feature.resetContent();
lifecycleState.container = null;
lifecycleState.hasContainer = false;
feature.enterLibrary(initialVirtualLibrary, { navigationIndex: 1 });
lifecycleState.container = { ratingKey: 'season-1', containerKey: 'season-1', title: 'Season 1' };
lifecycleState.hasContainer = true;
var containerLoadsBeforeReconcile = lifecycleLoads.length;
assert.strictEqual(feature.reconcileNavigation([expandedVirtualLibrary]), true,
  'an open container must retain a parent-Library membership change for later reconciliation');
assert.strictEqual(lifecycleLoads.length, containerLoadsBeforeReconcile,
  'parent Library reconciliation must not replace an open container in-place');
lifecycleState.containerSummary = { total: 10, watched: 2 };
lifecycleState.containerSummaryLoading = false;
lifecycleState.containerSummaryError = null;
lifecycleOptions.onContainerSummary();
lifecycleState.container = null;
lifecycleState.hasContainer = false;
lifecycleOptions.onRestoreContainer();
assert.strictEqual(lifecycleLoads.length, containerLoadsBeforeReconcile + 1,
  'closing a container after source membership changes must reload the parent Library instead of restoring stale items');

feature.resetContent();
lifecycleState.container = null;
lifecycleState.hasContainer = false;
feature.enterLibrary(expandedVirtualLibrary, { navigationIndex: 1 });
var collapseLoadsBeforeReconcile = lifecycleLoads.length;
assert.strictEqual(feature.reconcileNavigation([initialVirtualLibrary]), true,
  'an aggregate Library must reconcile back to its surviving single source');
assert.strictEqual(controllerState.activeLibrary.sourceId, 'server-a|1',
  'aggregate collapse must replace the virtual source identity with the surviving concrete source');
assert.strictEqual(lifecycleLoads.length, collapseLoadsBeforeReconcile + 1,
  'aggregate collapse must refresh the visible Library immediately');

feature.resetContent();
lifecycleState.container = null;
lifecycleState.hasContainer = false;
feature.enterLibrary(expandedVirtualLibrary, { navigationIndex: 1 });
var recoveredLoadsBeforeReconcile = lifecycleLoads.length;
assert.strictEqual(feature.reconcileNavigation([expandedVirtualLibrary], { force: true }), true,
  'availability recovery must be able to refresh an aggregate even when its member ids are unchanged');
assert.strictEqual(lifecycleLoads.length, recoveredLoadsBeforeReconcile + 1,
  'forced availability reconciliation must reload page zero so recovered PMS items can join the aggregate');

feature.resetContent();
lifecycleState.container = null;
lifecycleState.hasContainer = false;
libraryLiveContexts['server-b'] = {
  sourceId: 'server-b|4', serverMachineIdentifier: 'server-b', serverName: 'Marco', owned: false,
  sectionKey: '4', apiBaseUrl: 'https://relay-b.example', token: 'shared-token-b', requestTimeout: 9000
};
feature.enterLibrary({
  kind: 'library', key: '4', title: 'Film · Marco', sourceId: 'server-b|4', serverMachineIdentifier: 'server-b'
}, { navigationIndex: 1 });
assert.strictEqual(feature.sourceContext().apiBaseUrl, 'https://relay-b.example',
  'external Library entry must retain the resolved PMS route');
libraryLiveContexts['server-b'] = {
  sourceId: 'server-b|4', serverMachineIdentifier: 'server-b', serverName: 'Marco', owned: false,
  sectionKey: '4', apiBaseUrl: 'https://direct-b.example', token: 'shared-token-b-new', requestTimeout: 7000
};
assert.strictEqual(feature.reconcileNavigation([{
  kind: 'library', key: '4', title: 'Film · Marco', sourceId: 'server-b|4', serverMachineIdentifier: 'server-b'
}], { force: true, invalidateMachineIdentifier: 'server-b' }), true,
  'a recovered concrete Library must reconcile even when its source id is unchanged');
assert.strictEqual(feature.sourceContext().apiBaseUrl, 'https://direct-b.example',
  'recovery through a different PMS route must replace the retained source context');
lifecycleOptions.loadLibraryPage(controllerState.activeLibrary, 'catalog', {}, 0, 50, function () {});
assert.strictEqual(libraryPageConfigs[libraryPageConfigs.length - 1].apiBaseUrl, 'https://direct-b.example',
  'the first Library reload after PMS recovery must use the new route instead of the stale endpoint');
delete libraryLiveContexts['server-b'];
var offlineLoadsBeforeReconcile = lifecycleLoads.length;
currentView = 'detail';
assert.strictEqual(feature.reconcileNavigation([{
  kind: 'library', key: '4', title: 'Film · Marco · Offline', sourceId: 'server-b|4', serverMachineIdentifier: 'server-b', offline: true
}], { force: true, invalidateMachineIdentifier: 'server-b' }), true,
  'an offline concrete Library must reconcile even when its source id is unchanged');
assert.strictEqual(feature.sourceContext(), null,
  'an offline PMS must clear the retained route instead of leaving a dead endpoint attached to the Library');
assert.strictEqual(controllerOptions.actionsAvailable(controllerState.activeLibrary), false,
  'management actions must be disabled while a concrete external Library is offline so refresh cannot use a missing route');
assert.strictEqual(lifecycleLoads.length, offlineLoadsBeforeReconcile,
  'an offline Library hidden behind Detail must not reload while the source is unavailable');
controllerState.tabIndex = 3;
controllerState.viewKey = 'catalog';
nodes['library-controls'].className = 'library-controls';
currentView = 'library';
feature.recoverPresentation();
assert.strictEqual(nodes['library-refresh'].style.display, 'none',
  'returning to an offline Library must hide refresh controls that can no longer reach the PMS');
assert.ok(String(nodes['library-controls'].className || '').indexOf('is-hidden') !== -1,
  'returning to an offline catalog must hide query controls whose requests cannot reach the PMS');
var offlineTabIndex = controllerState.tabIndex;
assert.strictEqual(controllerOptions.selectTab(2), false,
  'an offline Library must reject tab changes that cannot load their corresponding content');
assert.strictEqual(controllerState.tabIndex, offlineTabIndex,
  'rejecting an offline tab change must preserve the currently displayed tab state');
var filterOpenCallsBeforeOffline = calls.filter(function (entry) { return entry === 'filter-open'; }).length;
controllerOptions.openFilter();
assert.strictEqual(calls.filter(function (entry) { return entry === 'filter-open'; }).length, filterOpenCallsBeforeOffline,
  'an offline Library must not open the advanced filter drawer because its option request has no live PMS route');
assert.strictEqual(lifecycleLoads.length, offlineLoadsBeforeReconcile,
  'returning from Detail must not reload an offline concrete Library without a live PMS route');

feature.resetContent();
feature.enterLibrary({ key: '1', title: 'Empty token', sourceId: 'empty|1' }, {});
lifecycleOptions.loadRecommendations(controllerState.activeLibrary, function () {});
assert.strictEqual(recommendationConfigs[recommendationConfigs.length - 1].config.token, '', 'empty external token must never inherit primary credentials');
assert.ok(libraryRouterCalls > 0, 'Library request configuration must delegate to the central source router');

feature.resetContent();
feature.enterLibrary({
  kind: 'library', key: '1', title: 'Film', sourceId: 'server-a|1', serverMachineIdentifier: 'server-a'
}, { navigationIndex: 1 });
var tabClearsBeforeRefresh = tabPrefetchClears;
var tabInvalidationsBeforeRefresh = tabPrefetchInvalidations.length;
controllerOptions.onRefreshComplete();
assert.strictEqual(tabPrefetchClears, tabClearsBeforeRefresh,
  'an explicit Library refresh must leave other libraries cached');
assert.deepStrictEqual(tabPrefetchInvalidations.slice(tabInvalidationsBeforeRefresh), ['server-a|1'],
  'an explicit Library refresh must invalidate only its own completed tab results before reloading');
var primaryLibraryRecoveryCallsBefore = primaryLibraryRecoveryCalls;
var primaryLibraryConfigsBefore = libraryPageConfigs.length;
var primaryLibraryPage = null;
failPrimaryLibraryPageOnce = true;
lifecycleOptions.loadLibraryPage(controllerState.activeLibrary, 'catalog', {}, 0, 50, function (error, page) {
  assert.ifError(error);
  primaryLibraryPage = page;
});
assert.strictEqual(primaryLibraryRecoveryCalls, primaryLibraryRecoveryCallsBefore + 1,
  'a concrete primary Library must request bounded route recovery after a transport failure');
assert.deepStrictEqual(libraryPageConfigs.slice(primaryLibraryConfigsBefore).map(function (entry) { return entry && entry.apiBaseUrl; }), [
  'http://primary.example', 'https://direct-primary.example'
], 'a concrete primary Library must retry once on the promoted runtime route');
assert.ok(primaryLibraryPage && primaryLibraryPage.items.length === 1,
  'the recovered concrete Library request must publish the successful retry result');
assert.strictEqual(feature.sourceContext().apiBaseUrl, 'https://direct-primary.example',
  'primary Library recovery must replace the retained source context so subsequent requests use the promoted route');

feature.leave();
currentView = 'home';
deferredSourceResolution = null;
deferredSourceRequest = null;
feature.enterLibrary({ key: '5', title: 'Slow shared', sourceId: 'server-slow|5' }, { navigationIndex: 1 });
assert.ok(deferredSourceResolution, 'slow external Library entry must remain pending until source resolution completes');
feature.enterWatchlist({ navigationIndex: 2 });
assert.strictEqual(currentView, 'watchlist', 'a competing Watchlist navigation must become the active surface immediately');
deferredSourceResolution(null, {
  sourceId: 'server-slow|5', serverMachineIdentifier: 'server-slow', serverName: 'Slow', owned: false,
  sectionKey: '5', apiBaseUrl: 'https://slow.example', token: 'slow-token'
});
assert.strictEqual(currentView, 'watchlist',
  'a stale external Library source callback must not remount Library after the user has navigated to Watchlist');
assert.strictEqual(deferredSourceRequest.aborted, true,
  'competing navigation should abort the pending external Library source resolution');
var watchlistLoadsBeforeAvailability = watchlistLoads.length;
assert.strictEqual(feature.reconcileNavigation([{
  kind: 'library', key: 'virtual|movie|film', sourceId: 'virtual|movie|film', title: 'Film',
  virtualLibrary: true, memberSourceIds: ['server-a|1']
}], { force: true, invalidateMachineIdentifier: 'server-b' }), true,
  'Watchlist must reconcile a live PMS availability change');
assert.strictEqual(watchlistLoads.length, watchlistLoadsBeforeAvailability + 1,
  'an open Watchlist must reload when PMS availability changes so stale/local resolutions are recomputed');
assert.strictEqual(watchlistLoads[watchlistLoads.length - 1], true,
  'availability reconciliation must bypass the retained Watchlist model');
feature.destroy();
feature.destroy();
assert.deepStrictEqual(destroyCounts, { controller: 1, filter: 1, grid: 1, lifecycle: 1, watchlist: 1 }, 'feature teardown is idempotent and destroys every owned component once');
assert.strictEqual(nodes['library-grid'].listeners.scroll, undefined, 'feature teardown removes its owned scroll listener');
assert.strictEqual(nodes['watchlist-grid'].listeners.scroll, undefined, 'feature teardown removes its owned Watchlist scroll listener');
assert.strictEqual(feature.handleKey({ keyCode: 13 }, ''), false, 'destroy makes feature input inert');
(function watchlistLookupForwardsPlexOwner() {
  watchlistFindLocalCalls.length = 0;
  feature.findWatchlistLocal('local', 'server-b');
  assert.deepStrictEqual(watchlistFindLocalCalls[0], ['local', 'server-b'], 'Library feature must preserve the PMS owner in watchlist lookups');
}());

console.log('Library feature controller checks passed');
