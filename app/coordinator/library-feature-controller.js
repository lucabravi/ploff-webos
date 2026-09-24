(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffLibraryFeatureController = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var platform = values.platform || {};
    var modules = values.modules || {};
    var data = values.data || {};
    var state = values.state || {};
    var shell = values.shell || {};
    var server = values.server || {};
    var transitions = values.transitions || {};
    var timerRoot = platform.root || {};
    var document = platform.document || {};
    var LibraryController = modules.LibraryController;
    var LibraryContainers = modules.LibraryContainers;
    var LibraryFilterView = modules.LibraryFilterView;
    var LibraryGridView = modules.LibraryGridView;
    var LibraryLifecycle = modules.LibraryLifecycle;
    var LibraryTabPrefetch = modules.LibraryTabPrefetch;
    var NavigationModel = modules.NavigationModel;
    var PlaybackQueueModel = modules.PlaybackQueueModel;
    var SearchModel = modules.SearchModel;
    var WatchlistState = modules.WatchlistState;
    var WatchlistView = modules.WatchlistView;
    var CardLayout = modules.CardLayout;
    var PlexClient = data.PlexClient;
    var WatchlistClient = data.WatchlistClient;
    var config = data.config || {};
    var sourceRouter = data.sourceRouter;
    var libraryOverscanRows = Math.max(0, Number(values.libraryOverscanRows === undefined ? 3 : values.libraryOverscanRows) || 0);
    var controller = null;
    var gridView = null;
    var lifecycle = null;
    var tabPrefetch = null;
    var tabWarmCache = {};
    var tabWarmCacheOrder = [];
    var activeTabWarmArtworkScope = '';
    var filterView = null;
    var watchlistView = null;
    var scrollTarget = null;
    var scrollHandler = null;
    var libraryViewTarget = null;
    var libraryViewFocusHandler = null;
    var watchlistScrollTarget = null;
    var watchlistScrollHandler = null;
    var activeMode = '';
    var activeSourceContext = null;
    var pendingSourceRequest = null;
    var sourceGeneration = 0;
    var generation = 0;
    var pendingContainerRestore = null;
    var pendingPlaybackProgress = null;
    var pendingCatalogRefreshAnchor = null;
    var contentStateDirty = false;
    var sourceDefinitionDirty = false;
    var librarySurfaceAnimationPending = false;
    var libraryTabPreviewScheduler = null;
    var libraryTabPreviewIndex = null;
    var libraryTabCommittedIndex = null;
    var pendingTabContent = false;
    var watchlistWarmPressureActive = false;
    var destroyed = false;

    if (!sourceRouter || typeof sourceRouter.configFor !== 'function' || typeof sourceRouter.contextForItem !== 'function') {
      throw new Error('LibraryFeatureController requires sourceRouter');
    }

    function call(callback, arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8) {
      if (typeof callback === 'function') {
        if (arguments.length > 8) { return callback(arg1, arg2, arg3, arg4, arg5, arg6, arg7, arg8); }
        return arguments.length > 7
          ? callback(arg1, arg2, arg3, arg4, arg5, arg6, arg7)
          : callback(arg1, arg2, arg3, arg4, arg5, arg6);
      }
      return undefined;
    }

    function node(id) {
      return document && document.getElementById ? document.getElementById(id) : null;
    }

    function currentView() { return String(call(state.currentView) || ''); }
    function navigationIndex() { return Math.max(0, Number(call(state.navigationIndex)) || 0); }
    function navigationItems() { return call(state.navigationItems) || []; }
    function pointerActive() { return call(state.pointerActive) === true; }
    function available() { return call(data.watchlistAvailable) === true; }
    function watchlistVisible() { return call(state.watchlistVisible) !== false; }
    function watchlistIdentity() { return String(call(data.watchlistIdentity) || ''); }
    function accountToken() { return String(call(data.accountToken) || ''); }
    function t(key, parameters) { return call(shell.t, key, parameters) || key; }
    function element(tag, className, text) { return call(shell.element, tag, className, text); }
    function setText(id, text) { call(shell.setText, id, text); }
    function copyRecord(source) {
      var result;
      var key;
      if (!source || typeof source !== 'object') { return source || null; }
      result = {};
      for (key in source) {
        if (Object.prototype.hasOwnProperty.call(source, key)) { result[key] = source[key]; }
      }
      return result;
    }
    function copyRecords(source) {
      return (source || []).map(function (item) { return copyRecord(item); });
    }
    function sourceOwnedRecord(source, context) {
      var result = sourceRouter.decorateItem ? sourceRouter.decorateItem(source, context || null) : copyRecord(source);
      var recentGroup;
      if (!result || !result.recentGroup || !result.recentGroup.seasonItem) { return result; }
      recentGroup = copyRecord(result.recentGroup);
      recentGroup.seasonItem = sourceRouter.decorateItem
        ? sourceRouter.decorateItem(recentGroup.seasonItem, context || null)
        : copyRecord(recentGroup.seasonItem);
      result.recentGroup = recentGroup;
      return result;
    }
    function sourceOwnedRecords(source, context) {
      return (source || []).map(function (item) { return sourceOwnedRecord(item, context); });
    }
    function sourceOwnedResult(result, context) {
      var decorated;
      if (!result || !context) { return result; }
      if (Object.prototype.toString.call(result) === '[object Array]') {
        return result.map(function (entry) {
          var row;
          if (!entry || Object.prototype.toString.call(entry.items) !== '[object Array]') { return sourceOwnedRecord(entry, context); }
          row = copyRecord(entry);
          row.items = sourceOwnedRecords(entry.items, context);
          return row;
        });
      }
      if (Object.prototype.toString.call(result.items) === '[object Array]') {
        decorated = copyRecord(result);
        decorated.items = sourceOwnedRecords(result.items, context);
        return decorated;
      }
      return result;
    }
    function sourceIdentity(library) { return String(library && (library.sourceId || library.key || library.title) || ''); }
    function requestConfig(sourceContext, item) {
      return sourceRouter.configFor(item || null, sourceContext || null);
    }
    function routeIdentity(context) {
      return String(context && context.serverMachineIdentifier || '') + '|' +
        String(context && context.apiBaseUrl || '') + '|' + String(context && context.token || '');
    }

    function recoveredPrimaryContext(context, recovered) {
      var result = copyRecord(context) || {};
      var key;
      for (key in (recovered || {})) {
        if (Object.prototype.hasOwnProperty.call(recovered, key)) { result[key] = recovered[key]; }
      }
      ['sourceId', 'sectionKey', 'sectionType', 'sectionTitle'].forEach(function (field) {
        if (context && context[field] !== undefined) { result[field] = context[field]; }
      });
      result.primary = true;
      return result;
    }

    function retainRecoveredPrimaryContext(previous, recovered) {
      if (!activeSourceContext || !previous || !recovered) { return; }
      if (String(activeSourceContext.serverMachineIdentifier || '') !== String(previous.serverMachineIdentifier || '')) { return; }
      if (previous.sourceId && activeSourceContext.sourceId && String(activeSourceContext.sourceId) !== String(previous.sourceId)) { return; }
      activeSourceContext = copyRecord(recovered);
    }

    function sourceRequest(context, item, execute, callback, kind) {
      var cancelled = false;
      var completed = false;
      var activeRequest = null;
      var attemptGeneration = 0;

      function finish(error, result, ownerContext) {
        if (cancelled || completed) { return; }
        completed = true;
        if (item && item.sourceId && kind) { call(data.reportLibraryStatus, item.sourceId, !!error, kind); }
        if (error && ownerContext && data.verifyAvailability) {
          try { data.verifyAvailability(ownerContext.serverMachineIdentifier, function () {}); } catch (_verifyError) {}
        }
        call(callback, error || null, error ? result : sourceOwnedResult(result, ownerContext));
      }

      function attempt(ownerContext, retried) {
        var config = requestConfig(ownerContext, item || null);
        var generation;
        var settled = false;
        var request;
        if (cancelled || completed) { return; }
        if (!config) { finish(new Error('Library source unavailable'), null, ownerContext); return; }
        generation = attemptGeneration + 1;
        attemptGeneration = generation;
        request = execute(config, function (error, result) {
          var merged;
          settled = true;
          if (cancelled || completed || generation !== attemptGeneration) { return; }
          activeRequest = null;
          if (error && error.transportFailure === true && ownerContext && ownerContext.primary === true && !retried && typeof data.recoverPrimary === 'function') {
            data.recoverPrimary(error, function (recoveryError, recovered) {
              if (cancelled || completed || generation !== attemptGeneration) { return; }
              if (recoveryError || !recovered) { finish(recoveryError || error, result, ownerContext); return; }
              merged = recoveredPrimaryContext(ownerContext, recovered);
              if (routeIdentity(merged) === routeIdentity(ownerContext)) { finish(error, result, ownerContext); return; }
              retainRecoveredPrimaryContext(ownerContext, merged);
              attempt(merged, true);
            });
            return;
          }
          finish(error, result, ownerContext);
        });
        if (!settled && generation === attemptGeneration) { activeRequest = request || null; }
      }

      attempt(context || null, false);
      return {
        abort: function () {
          if (cancelled || completed) { return; }
          cancelled = true;
          attemptGeneration += 1;
          if (activeRequest && activeRequest.abort) { activeRequest.abort(); }
          activeRequest = null;
        }
      };
    }

    function tabPrefetchSourceIdentity(library, context) {
      var identity = sourceRouter && sourceRouter.contextIdentity
        ? sourceRouter.contextIdentity(context || null)
        : '';
      return String(identity || sourceIdentity(library));
    }

    function loadLibraryTabRequest(request, callback, onProgress) {
      var library = request && request.library;
      var context = request && request.sourceContext || null;
      var viewKey = String(request && request.viewKey || 'recommended');
      var query = request && request.query || {};
      var start = Math.max(0, Number(request && request.start || 0));
      var limit = Math.max(0, Number(request && request.limit || 0));
      if (!library) {
        call(callback, new Error('Library unavailable'));
        return null;
      }
      if (viewKey === 'recommended') {
        if (library.virtualLibrary && typeof data.loadVirtualLibraryRecommendations === 'function') {
          return data.loadVirtualLibraryRecommendations(library, callback, onProgress);
        }
        return sourceRequest(context, library, function (requestConfigValue, done) {
          return PlexClient.loadLibraryRecommendations(requestConfigValue, library, done);
        }, callback, 'recommendations');
      }
      if (library.virtualLibrary && typeof data.loadVirtualLibraryPage === 'function') {
        return data.loadVirtualLibraryPage(library, viewKey, query, start, limit, callback, onProgress);
      }
      return sourceRequest(context, library, function (requestConfigValue, done) {
        return PlexClient.loadLibraryPage(requestConfigValue, library, viewKey, query, start, limit, done);
      }, callback, 'page');
    }

    function currentLibraryTabQuery(_viewKey) {
      var current = libraryState();
      var filters = filterView && filterView.filters ? filterView.filters() : {};
      return {
        sort: current.sort,
        direction: current.sortDirection,
        watched: current.watchedFilter,
        filters: filters
      };
    }

    function sameLibraryForTabPrefetch(library) {
      var current = activeLibrary();
      return !!(library && current && String(library.key || '') === String(current.key || '') &&
        tabPrefetchSourceIdentity(library, activeSourceContext) === tabPrefetchSourceIdentity(current, activeSourceContext));
    }

    function tabPrefetchLimit(viewKey) {
      if (viewKey === 'recommended') { return 0; }
      return viewKey === 'catalog' || viewKey === 'collections' ? 60 : 30;
    }

    function tabWarmPosterScope(viewKey) { return 'library-tab-prefetch-' + String(viewKey || 'tab'); }

    function cancelTabWarmArtwork(preserveViewKey) {
      var loader = shell.posterLoader;
      var index;
      var preserveScope = preserveViewKey ? tabWarmPosterScope(preserveViewKey) : '';
      if (loader && loader.cancelScope) {
        loader.cancelScope('library-tab-prefetch');
        if (activeTabWarmArtworkScope && activeTabWarmArtworkScope !== preserveScope) {
          loader.cancelScope(activeTabWarmArtworkScope);
        }
        if (!preserveViewKey) {
          for (index = 0; index < tabWarmCacheOrder.length; index += 1) {
            loader.cancelScope(tabWarmPosterScope(tabWarmCacheOrder[index]));
          }
        }
      }
      activeTabWarmArtworkScope = preserveScope;
    }

    function discardTabWarmCache() {
      cancelTabWarmArtwork();
      tabWarmCache = {};
      tabWarmCacheOrder = [];
    }

    function clearTabWarmCache() {
      discardTabWarmCache();
      if (tabPrefetch && tabPrefetch.cancelPending) { tabPrefetch.cancelPending(); }
    }

    function invalidateTabPrefetchForLibrary(library, sourceContext) {
      discardTabWarmCache();
      if (tabPrefetch && tabPrefetch.invalidateLibrary) { tabPrefetch.invalidateLibrary(library, sourceContext); }
    }

    function invalidateAllLibraryTabPrefetch() {
      discardTabWarmCache();
      if (tabPrefetch && tabPrefetch.clear) { tabPrefetch.clear(); }
    }

    function retainWarmTab(viewKey, dom) {
      var index = tabWarmCacheOrder.indexOf(viewKey);
      var evicted;
      if (index !== -1) { tabWarmCacheOrder.splice(index, 1); }
      tabWarmCache[viewKey] = { dom: dom };
      tabWarmCacheOrder.push(viewKey);
      while (tabWarmCacheOrder.length > 3) {
        evicted = tabWarmCacheOrder.shift();
        if (shell.posterLoader && shell.posterLoader.cancelScope) { shell.posterLoader.cancelScope(tabWarmPosterScope(evicted)); }
        delete tabWarmCache[evicted];
      }
    }

    function removeWarmTab(viewKey) {
      var index = tabWarmCacheOrder.indexOf(viewKey);
      if (index !== -1) { tabWarmCacheOrder.splice(index, 1); }
      delete tabWarmCache[viewKey];
    }

    function warmPrefetchedTab(viewKey, result, request) {
      var limit;
      var dom;
      if (destroyed || !gridView || !tabPrefetch || request.priority === 0 ||
          typeof gridView.prefetchLimit !== 'function' || typeof gridView.buildDetachedTab !== 'function' || tabWarmCache[viewKey]) { return false; }
      limit = gridView.prefetchLimit(viewKey, viewKey === 'catalog' || viewKey === 'collections');
      dom = gridView.buildDetachedTab(viewKey, result, limit, function () {}, tabWarmPosterScope(viewKey));
      if (!dom) { return false; }
      retainWarmTab(viewKey, dom);
      return true;
    }

    function takeWarmPrefetchedTab(viewKey) {
      var saved = tabWarmCache[viewKey] || null;
      if (saved) { removeWarmTab(viewKey); }
      return saved;
    }

    function constructTabPrefetch() {
      if (!LibraryTabPrefetch || typeof LibraryTabPrefetch.create !== 'function') { return; }
      tabPrefetch = LibraryTabPrefetch.create({
        root: timerRoot,
        views: LibraryContainers.views ? LibraryContainers.views() : null,
        maxConcurrent: 2,
        maxEntries: 24,
        sourceIdentity: tabPrefetchSourceIdentity,
        queryForView: function (viewKey) { return currentLibraryTabQuery(viewKey); },
        limitForView: function (viewKey) { return tabPrefetchLimit(viewKey); },
        load: loadLibraryTabRequest
      });
    }

    function requestPrefetchedRecommendations(library, callback, onProgress) {
      if (!tabPrefetch || !isLibraryActive() || !sameLibraryForTabPrefetch(library) || activeContainer()) {
        return loadLibraryTabRequest({ library: library, sourceContext: activeSourceContext, viewKey: 'recommended' }, callback, onProgress);
      }
      return tabPrefetch.request({
        library: library,
        sourceContext: activeSourceContext,
        viewKey: 'recommended',
        query: currentLibraryTabQuery('recommended'),
        start: 0,
        limit: 0,
        priority: 0
      }, callback, onProgress);
    }

    function requestPrefetchedPage(library, viewKey, query, start, limit, callback, onProgress) {
      if (!tabPrefetch || start !== 0 || !isLibraryActive() || !sameLibraryForTabPrefetch(library) || activeContainer()) {
        return loadLibraryTabRequest({
          library: library, sourceContext: activeSourceContext, viewKey: viewKey,
          query: query, start: start, limit: limit
        }, callback, onProgress);
      }
      return tabPrefetch.request({
        library: library,
        sourceContext: activeSourceContext,
        viewKey: viewKey,
        query: query || {},
        start: start,
        limit: limit,
        priority: 0
      }, callback, onProgress);
    }

    function sourceContextForItem(item) {
      var owner = String(item && item.serverMachineIdentifier || '');
      var resolved;
      if (!owner && activeSourceContext) {
        return sourceRouter.contextForItem(item, activeSourceContext);
      }
      resolved = call(data.sourceContextForItem, item);
      return sourceRouter.contextForItem(item, resolved || activeSourceContext || null);
    }
    function renderedPosterSpecification(image, source, priority, scope, fallbackWidth, fallbackHeight, sourceContext, sourceItem) {
      var context = sourceContext === undefined ? activeSourceContext : sourceContext;
      if (!sourceItem) {
        return context
          ? call(shell.renderedPosterSpecification, image, source, priority, scope, fallbackWidth, fallbackHeight, context)
          : call(shell.renderedPosterSpecification, image, source, priority, scope, fallbackWidth, fallbackHeight);
      }
      return context
        ? call(shell.renderedPosterSpecification, image, source, priority, scope, fallbackWidth, fallbackHeight, context, sourceItem)
        : call(shell.renderedPosterSpecification, image, source, priority, scope, fallbackWidth, fallbackHeight, null, sourceItem);
    }
    function fixedPosterSpecification(source, size, priority, scope, sourceContext, sourceItem) {
      var context = sourceContext === undefined ? activeSourceContext : sourceContext;
      if (!sourceItem) {
        return context
          ? call(shell.fixedPosterSpecification, source, size, priority, scope, context)
          : call(shell.fixedPosterSpecification, source, size, priority, scope);
      }
      return context
        ? call(shell.fixedPosterSpecification, source, size, priority, scope, context, sourceItem)
        : call(shell.fixedPosterSpecification, source, size, priority, scope, null, sourceItem);
    }
    function moveNavigation(direction) {
      var count = Math.max(0, Number(call(shell.navigationFocusCount)));
      var current = navigationIndex();
      var next = Math.max(0, Math.min(Math.max(0, count - 1), current + (direction === 'left' ? -1 : 1)));
      if (direction === 'left' && current === 0) { next = Math.max(0, count - 1); }
      if (direction === 'right' && current >= count - 1) { next = 0; }
      call(state.setNavigationIndex, next);
      call(shell.renderNavigation);
      call(shell.scheduleNavigationPreview, next);
    }
    function cancelSourceResolution() {
      sourceGeneration += 1;
      if (pendingSourceRequest && pendingSourceRequest.abort) { pendingSourceRequest.abort(); }
      pendingSourceRequest = null;
    }
    function loadRecommendationsForLibrary(library, callback) {
      var cancelled = false;
      var resolver = null;
      var request = null;
      var completed = false;
      if (library && library.virtualLibrary && typeof data.loadVirtualLibraryRecommendations === 'function') {
        return data.loadVirtualLibraryRecommendations(library, callback);
      }
      function done(error, rows) { if (!cancelled) { call(callback, error || null, rows || []); } }
      function load(context) {
        if (cancelled) { return; }
        request = sourceRequest(context, library, function (routedConfig, requestDone) {
          return PlexClient.loadLibraryRecommendations(routedConfig, library, requestDone);
        }, function (error, rows) { completed = true; done(error, rows); }, 'recommendations');
      }
      if (!library || !library.sourceId || typeof data.resolveSource !== 'function') { load(null); }
      else {
        resolver = data.resolveSource(library.sourceId, function (error, context) {
          if (cancelled) { return; }
          resolver = null;
          if (error || !context) { completed = true; done(error || new Error('Library source unavailable')); return; }
          load(context);
        });
      }
      return {
        abort: function () {
          if (cancelled || completed) { return; }
          cancelled = true;
          if (resolver && resolver.abort) { resolver.abort(); }
          if (request && request.abort) { request.abort(); }
        }
      };
    }
    function libraryActionsAvailable(library) { return !(library && (library.owned === false || library.virtualLibrary || library.offline === true)); }
    function updateLibraryManagementActions() {
      var available = libraryActionsAvailable(activeLibrary());
      var refresh = node('library-refresh');
      var metadata = node('library-refresh-metadata');
      [refresh, metadata].forEach(function (target) {
        if (!target) { return; }
        target.style.display = available ? '' : 'none';
        target.disabled = !available || libraryState().refreshPending === true;
      });
      return available;
    }
    function libraryState() { return controller && controller.snapshot ? controller.snapshot() : {}; }
    function libraryViewKey() { return controller && controller.viewKey ? controller.viewKey() : ''; }
    function watchlistSnapshot() { return watchlistView && watchlistView.snapshot ? watchlistView.snapshot() : {}; }
    function lifecycleSnapshot() { return lifecycle && lifecycle.snapshot ? lifecycle.snapshot() : {}; }
    function gridSnapshot() { return gridView && gridView.snapshot ? gridView.snapshot() : { items: [], recommendations: [], focus: { index: 0, recommendationRow: 0 } }; }
    function gridNavigationSnapshot() {
      var current;
      if (gridView && gridView.navigationSnapshot) { return gridView.navigationSnapshot(); }
      current = gridSnapshot();
      return {
        itemCount: (current.items || []).length,
        recommendationItemCount: (current.recommendations || []).reduce(function (count, row) { return count + (row && row.items || []).length; }, 0),
        totalSize: Number(current.totalSize || 0),
        focus: current.focus || { index: 0, recommendationRow: 0 },
        layout: current.layout || { columns: 1 },
        window: current.window || { start: 0, end: 0, visibleStartRow: 0, offsetRows: 0 }
      };
    }
    function activeLibrary() { return controller && controller.activeLibrary ? controller.activeLibrary() : null; }
    function activeContainer() { return lifecycleSnapshot().container || null; }

    function catalogFilterIdentity(filters) {
      var source = filters || {};
      var keys = Object.keys(source).sort();
      var parts = [];
      var index;
      for (index = 0; index < keys.length; index += 1) {
        parts.push(keys[index] + '=' + String(source[keys[index]] === undefined || source[keys[index]] === null ? '' : source[keys[index]]));
      }
      return parts.join('&');
    }

    function catalogQueryIdentity() {
      var current = libraryState();
      var library = activeLibrary();
      var filters = filterView && filterView.filters ? filterView.filters() : {};
      return [
        sourceIdentity(library),
        String(libraryViewKey() || ''),
        String(current.sort || ''),
        String(current.sortDirection || ''),
        String(current.watchedFilter || ''),
        catalogFilterIdentity(filters)
      ].join('|');
    }

    function captureCatalogRefreshAnchor() {
      var currentGrid;
      var items;
      var focus;
      var index;
      var item;
      var sourceOffset;
      if (activeMode !== 'library' || !activeLibrary() || activeContainer() || libraryViewKey() !== 'catalog') { return null; }
      currentGrid = gridSnapshot();
      items = currentGrid.items || [];
      focus = currentGrid.focus || {};
      index = Math.max(0, Math.floor(Number(focus.index || 0)));
      item = items[index] || null;
      if (!item) { return null; }
      sourceOffset = item.plexSourceOffset;
      if (sourceOffset === null || sourceOffset === undefined || sourceOffset === '') { sourceOffset = index; }
      else {
        sourceOffset = Number(sourceOffset);
        if (!isFinite(sourceOffset) || sourceOffset < 0) { sourceOffset = index; }
      }
      sourceOffset = Math.floor(sourceOffset);
      pendingCatalogRefreshAnchor = {
        ratingKey: String(item.ratingKey || ''),
        index: index,
        plexSourceOffset: sourceOffset,
        blockStart: Math.floor(sourceOffset / 60) * 60,
        queryKey: catalogQueryIdentity()
      };
      return pendingCatalogRefreshAnchor;
    }

    function refreshDirtyCatalogWindow() {
      var anchor = pendingCatalogRefreshAnchor;
      if (!anchor || !lifecycle || typeof lifecycle.refreshCatalogWindow !== 'function' ||
          libraryViewKey() !== 'catalog' || activeContainer() || anchor.queryKey !== catalogQueryIdentity()) { return false; }
      return lifecycle.refreshCatalogWindow(libraryLoadContext(), anchor.blockStart, 60, anchor) === true;
    }

    function isLibraryActive(context) {
      var active = activeLibrary();
      return !destroyed && activeMode === 'library' && currentView() === 'library' && !!active &&
        (!context || !context.library || sourceIdentity(active) === sourceIdentity(context.library));
    }
    function isWatchlistActive() { return !destroyed && activeMode === 'watchlist' && currentView() === 'watchlist'; }

    function libraryCacheKey(library) { return sourceIdentity(library); }

    function prefetchedLibraryState(library, rows) {
      return {
        tabIndex: 0,
        zone: 'tabs',
        controlIndex: 0,
        actionIndex: 0,
        sort: 'titleSort',
        sortDirection: 'asc',
        watchedFilter: 'all',
        filters: {},
        continueAvailable: null,
        collectionsAvailable: null,
        scrollTop: 0,
        grid: {
          mode: 'recommended', usesGridScroll: false, items: [], recommendations: rows || [], totalSize: 0,
          focus: { zone: 'grid', index: 0, recommendationRow: 0 }
        },
        usesGridScroll: false,
        dom: null
      };
    }

    function warmLibraryPrefetch(library, rows, saved, callback) {
      var built = false;
      var settled = false;
      var dom;
      function finish() {
        settled = true;
        if (built) { call(callback); }
      }
      if (destroyed || !saved || !gridView || typeof gridView.buildDetachedRecommendations !== 'function') { call(callback); return false; }
      dom = gridView.buildDetachedRecommendations(rows || [], 60, finish);
      saved.dom = dom || null;
      built = true;
      if (!dom) { call(callback); return false; }
      if (settled) { call(callback); }
      return true;
    }

    function scheduleAdjacentPrefetch(navIndex, items, options) {
      if (destroyed || !controller || !controller.scheduleAdjacentPrefetch) { return false; }
      controller.scheduleAdjacentPrefetch(navIndex === undefined ? navigationIndex() : navIndex, items || navigationItems(), options || null);
      return true;
    }

    function detachLibraryDom() {
      var grid;
      var recommendations;
      var gridContent = node('library-grid-content');
      var recommendationContent = node('library-recommended');
      if (!document.createDocumentFragment || !gridContent || !recommendationContent) { return null; }
      grid = document.createDocumentFragment();
      recommendations = document.createDocumentFragment();
      while (gridContent.firstChild) { grid.appendChild(gridContent.firstChild); }
      while (recommendationContent.firstChild) { recommendations.appendChild(recommendationContent.firstChild); }
      return { grid: grid, recommendations: recommendations };
    }

    function clearChildren(target) {
      if (!target) { return; }
      while (target.firstChild) { target.removeChild(target.firstChild); }
    }

    function attachLibraryDom(saved) {
      var gridContent = node('library-grid-content');
      var recommendationContent = node('library-recommended');
      if (!gridContent || !recommendationContent) { return; }
      clearChildren(gridContent);
      clearChildren(recommendationContent);
      if (saved && saved.dom) {
        gridContent.appendChild(saved.dom.grid);
        recommendationContent.appendChild(saved.dom.recommendations);
      }
    }

    function libraryUsesGridScroll() {
      var viewKey = libraryViewKey();
      return viewKey === 'catalog' || viewKey === 'collections' || viewKey === 'playlists' || lifecycleSnapshot().hasContainer;
    }

    function cacheActiveLibraryView() {
      var current = libraryState();
      var active = activeLibrary();
      var currentLifecycle = lifecycleSnapshot();
      var currentGrid = gridNavigationSnapshot();
      var gridContainer = node('library-grid');
      if (pendingTabContent) {
        if (active && controller && controller.clearCached) { controller.clearCached(active); }
        return false;
      }
      if (active && !currentLifecycle.container &&
          (currentLifecycle.loading || currentLifecycle.error) && !currentGrid.itemCount && !currentGrid.recommendationItemCount &&
          controller && controller.clearCached) {
        controller.clearCached(active);
        return false;
      }
      if (!active || currentLifecycle.container ||
          !controller || !controller.cacheCurrent) { return false; }
      controller.cacheCurrent({
        tabIndex: current.tabIndex,
        zone: current.zone,
        controlIndex: current.controlIndex,
        actionIndex: current.actionIndex,
        sort: current.sort,
        sortDirection: current.sortDirection,
        watchedFilter: current.watchedFilter,
        filters: filterView && filterView.filters ? filterView.filters() : {},
        continueAvailable: currentLifecycle.continueAvailable,
        collectionsAvailable: currentLifecycle.collectionsAvailable,
        nextStart: currentLifecycle.nextStart,
        scrollTop: gridContainer ? gridContainer.scrollTop : 0,
        grid: gridSnapshot(),
        usesGridScroll: libraryUsesGridScroll(),
        dom: detachLibraryDom()
      });
      return true;
    }

    function restoreCachedLibraryGrid(saved, resetFocus) {
      var focus;
      var gridContainer = node('library-grid');
      var recommendations = node('library-recommended');
      if (!saved || !gridView || !gridView.restore) { return; }
      focus = resetFocus ? { zone: 'grid', index: 0, recommendationRow: 0 } : saved.grid.focus;
      attachLibraryDom(saved);
      gridView.restore({
        mode: saved.grid.mode,
        usesGridScroll: saved.usesGridScroll,
        items: saved.grid.items,
        recommendations: saved.grid.recommendations,
        totalSize: saved.grid.totalSize,
        focus: focus
      });
      if (gridContainer) { gridContainer.scrollTop = resetFocus ? 0 : Number(saved.scrollTop || 0); }
      if (resetFocus && recommendations) { recommendations.scrollTop = 0; }
      if (saved.dom && controller && controller.touchDomCache) { controller.touchDomCache(libraryCacheKey(activeLibrary())); }
    }

    function formatContainerProgressDuration(milliseconds) {
      var totalMinutes = Math.max(0, Math.round(Number(milliseconds || 0) / 60000));
      var hours = Math.floor(totalMinutes / 60);
      var minutes = totalMinutes % 60;
      return (hours ? hours + ' h ' : '') + minutes + ' min';
    }

    function detailContainerKind(container) {
      var kind = PlaybackQueueModel && PlaybackQueueModel.containerKind(container);
      return kind === 'playlist' || kind === 'collection' ? kind : '';
    }

    function libraryPresentationClass() {
      var active = activeLibrary();
      var className = 'library-view';
      if (active && active.globalPlaylists) { className += ' is-global-playlists'; }
      if (detailContainerKind(activeContainer())) { className += ' is-container-detail'; }
      return className;
    }

    function updateLibraryPresentationClass() {
      var view = node('library-view');
      if (view) { view.className = libraryPresentationClass(); }
    }

    function renderLibraryGlobalHeader() {
      var active = activeLibrary();
      var currentLifecycle = lifecycleSnapshot();
      var container = currentLifecycle.container;
      var kind = detailContainerKind(container);
      var summary;
      var stats = node('library-container-stats');
      if (!active || (!active.globalPlaylists && !kind)) {
        setText('library-global-title', '');
        if (stats) { stats.className = 'library-container-stats is-hidden'; }
        return;
      }
      if (kind === 'playlist') {
        setText('library-global-title', t('library.playlistTitle', { title: container.title || t('nav.playlists') }));
      } else if (kind === 'collection') {
        setText('library-global-title', t('library.collectionTitle', { title: container.title || t('library.collections') }));
      } else {
        setText('library-global-title', t('nav.playlists'));
      }
      summary = currentLifecycle.containerSummary;
      if (!stats || !kind || !summary) {
        if (stats) { stats.className = 'library-container-stats is-hidden'; }
        return;
      }
      stats.className = 'library-container-stats';
      setText('library-container-watched-label', t('library.containerWatched'));
      setText('library-container-remaining-label', t('library.containerRemaining'));
      setText('library-container-watched-value', summary.watchedCount === 0
        ? t('library.containerNone')
        : summary.watchedCount + '/' + summary.totalCount + ' \u00b7 ' + formatContainerProgressDuration(summary.watchedDuration));
      setText('library-container-remaining-value', summary.remainingCount === 0
        ? t('library.containerNone')
        : summary.remainingCount + '/' + summary.totalCount + ' \u00b7 ' + formatContainerProgressDuration(summary.remainingDuration));
    }

    function libraryTabDisabled(index) {
      var current = lifecycleSnapshot();
      var library = activeLibrary();
      if (library && library.offline === true && index !== libraryState().tabIndex) { return true; }
      return (index === 1 && current.continueAvailable === false) ||
        (index === 4 && current.collectionsAvailable === false);
    }

    function renderLibrarySubnav() {
      var container = node('library-tabs');
      var labels = [t('library.recommended'), t('library.continue'), t('library.recent'), t('library.catalog'), t('library.collections')];
      var index;
      var button;
      var disabled;
      if (!container) { return; }
      if (container.children.length !== labels.length) {
        clearChildren(container);
        for (index = 0; index < labels.length; index += 1) {
          button = element('button', 'library-tab', labels[index]);
          if (!button) { continue; }
          button.type = 'button';
          button.setAttribute('data-library-tab', index);
          container.appendChild(button);
        }
      }
      for (index = 0; index < labels.length; index += 1) {
        button = container.children[index];
        if (!button) { continue; }
        disabled = libraryTabDisabled(index);
        button.className = 'library-tab' + (index === libraryState().tabIndex ? ' is-active' : '') + (disabled ? ' is-disabled' : '');
        if (button.textContent !== labels[index]) { button.textContent = labels[index]; }
        if (button.disabled !== disabled) { button.disabled = disabled; }
      }
    }

    function cancelLibraryTabPreview(restore) {
      var committedIndex = libraryTabCommittedIndex;
      var shouldRestore = restore === true && libraryTabPreviewIndex !== null;
      libraryTabPreviewIndex = null;
      if (libraryTabPreviewScheduler && libraryTabPreviewScheduler.cancel) { libraryTabPreviewScheduler.cancel(); }
      if (shouldRestore && committedIndex !== null && controller && controller.setTabIndex) {
        controller.setTabIndex(committedIndex);
        renderLibrarySubnav();
      }
      return true;
    }

    function applyLibraryTabPreview(index) {
      var current;
      libraryTabPreviewIndex = null;
      if (destroyed || !isLibraryActive() || !controller) { return false; }
      current = controller.snapshot ? controller.snapshot() : {};
      if (Number(current.tabIndex) !== Number(index)) { return false; }
      return selectLibraryTab(index);
    }

    function scheduleLibraryTabPreview(index, previousIndex) {
      if (destroyed || !isLibraryActive() || !libraryTabPreviewScheduler) { return false; }
      if (libraryTabPreviewIndex === null && previousIndex !== undefined) { libraryTabCommittedIndex = Number(previousIndex); }
      libraryTabPreviewIndex = Number(index);
      libraryTabPreviewScheduler.schedule(libraryTabPreviewIndex);
      return true;
    }

    function focusLibraryTab() {
      if (destroyed || !isLibraryActive()) { return false; }
      renderLibrarySubnav();
      updateLibraryFocus();
      return true;
    }

    function commitLibraryTabPreview() {
      var index = libraryTabPreviewIndex;
      if (index === null) { return false; }
      cancelLibraryTabPreview(false);
      return selectLibraryTab(index);
    }

    function nextLibraryTab(direction) {
      var next = libraryState().tabIndex + direction;
      var count = LibraryContainers.views().length;
      while (next >= 0 && next < count && libraryTabDisabled(next)) { next += direction; }
      return next < 0 || next >= count ? libraryState().tabIndex : next;
    }

    function selectLibraryTab(index) {
      var warm;
      cancelLibraryTabPreview(false);
      if (libraryTabDisabled(index)) {
        if (libraryTabCommittedIndex !== null && controller && controller.setTabIndex) { controller.setTabIndex(libraryTabCommittedIndex); }
        renderLibrarySubnav();
        return false;
      }
      lifecycle.clearContainer();
      updateLibraryPresentationClass();
      renderLibraryGlobalHeader();
      controller.setTabIndex(index);
      libraryTabCommittedIndex = Number(index);
      controller.setZone('tabs');
      controller.setControlIndex(0);
      renderLibrarySubnav();
      renderLibraryControls();
      librarySurfaceAnimationPending = true;
      cancelTabWarmArtwork(libraryViewKey());
      warm = takeWarmPrefetchedTab(libraryViewKey());
      pendingTabContent = !warm;
      if (node('library-grid')) { node('library-grid').style.pointerEvents = pendingTabContent ? 'none' : ''; }
      if (pendingTabContent && lifecycle.invalidateContentRequest) { lifecycle.invalidateContentRequest(); }
      loadLibraryContent(!pendingTabContent, pendingTabContent);
      if (warm && warm.dom) {
        attachLibraryDom(warm);
        if (gridView && gridView.render && (gridNavigationSnapshot().itemCount || gridNavigationSnapshot().recommendationItemCount)) { gridView.render(); }
      }
      updateLibraryFocus();
      return true;
    }

    function focusLibraryTabContent() {
      var firstRecommendation;
      var currentGrid = gridSnapshot();
      if (pendingTabContent) { return false; }
      if (libraryViewKey() === 'catalog') {
        controller.setZone('sort', 0);
      } else if (libraryViewKey() === 'recommended') {
        firstRecommendation = currentGrid.recommendations[0];
        if (!firstRecommendation || !firstRecommendation.items.length) { return false; }
        controller.setZone('grid');
        gridView.focusRecommendations(0, 0);
      } else {
        if (!currentGrid.items.length) { return false; }
        controller.setZone('grid');
        gridView.focusCatalog(currentGrid.focus.index);
      }
      updateLibraryFocus();
      return true;
    }

    function sortLabel(key) {
      var current = libraryState();
      var active = current.sort === key;
      var label = key === 'titleSort' ? 'A-Z' : (key === 'year' ? t('library.year') : t('library.rating'));
      if (active) { label += current.sortDirection === 'asc' ? ' \u2193' : ' \u2191'; }
      return label;
    }

    function renderLibraryControls() {
      var controls = node('library-controls');
      var sort = node('library-sort');
      var filter = node('library-filter');
      var sortKeys = ['titleSort', 'audienceRating', 'year'];
      var filterKeys = ['all', 'unwatched', 'watched'];
      var index;
      var button;
      var current = libraryState();
      var activeFilterCount = filterView && filterView.activeFilterCount ? filterView.activeFilterCount() : 0;
      if (!controls || !sort || !filter) { return; }
      controls.className = libraryViewKey() === 'catalog' && !(activeLibrary() && activeLibrary().offline === true)
        ? 'library-controls' : 'library-controls is-hidden';
      if (activeLibrary() && activeLibrary().offline === true && (current.zone === 'sort' || current.zone === 'filter')) {
        controller.setZone('tabs');
        current = libraryState();
      }
      sort.innerHTML = '';
      filter.innerHTML = '';
      clearChildren(sort);
      clearChildren(filter);
      for (index = 0; index < sortKeys.length; index += 1) {
        button = element('button', 'library-control' + (current.sort === sortKeys[index] ? ' is-active' : ''), sortLabel(sortKeys[index]));
        if (!button) { continue; }
        button.type = 'button';
        button.setAttribute('data-library-sort', sortKeys[index]);
        sort.appendChild(button);
      }
      for (index = 0; index < filterKeys.length; index += 1) {
        button = element('button', 'library-control' + (current.watchedFilter === filterKeys[index] ? ' is-active' : ''), t('library.' + filterKeys[index]));
        if (!button) { continue; }
        button.type = 'button';
        button.setAttribute('data-library-filter', filterKeys[index]);
        filter.appendChild(button);
      }
      button = element('button', 'library-control' + (activeFilterCount ? ' is-active' : ''), t('library.filters'));
      if (!button) { return; }
      button.type = 'button';
      button.setAttribute('data-library-filter-open', '1');
      if (activeFilterCount) { button.appendChild(element('span', 'library-control-badge', String(activeFilterCount))); }
      filter.appendChild(button);
    }

    function openLibraryFilterDrawer() {
      if (activeLibrary() && activeLibrary().offline === true) { return false; }
      if (filterView && filterView.open) { filterView.open(activeLibrary()); }
      return true;
    }

    function libraryRecommendationTitle(row) {
      var identifier = String(row && row.identifier || '').toLowerCase();
      if (identifier.indexOf('startwatching') !== -1) { return t('recommendation.startWatching'); }
      if (identifier.indexOf('.genre.') !== -1 || identifier.indexOf('moreingenre') !== -1) { return t('recommendation.byGenre'); }
      if (identifier.indexOf('by.actor.or.director') !== -1) { return t('recommendation.byPeople'); }
      if (identifier.indexOf('topunwatched') !== -1) { return t('recommendation.topUnwatched'); }
      if (identifier.indexOf('toprated') !== -1) { return t('recommendation.topRated'); }
      return row && row.title || t('library.recommended');
    }

    function renderLibraryGrid() {
      if (!gridView || pendingTabContent) { return; }
      gridView.setMode(libraryViewKey(), libraryUsesGridScroll());
      gridView.setContentActive(libraryState().zone === 'grid');
      gridView.render();
    }

    function onGridScroll() {
      if (!destroyed && isLibraryActive() && gridView && gridView.onScroll) { gridView.onScroll(); }
    }

    function onWatchlistScroll() {
      if (!destroyed && isWatchlistActive() && watchlistView && watchlistView.onScroll) { watchlistView.onScroll(); }
    }

    function bindEvents() {
      scrollTarget = node('library-grid');
      if (scrollTarget && scrollTarget.addEventListener) {
        scrollHandler = onGridScroll;
        scrollTarget.addEventListener('scroll', scrollHandler, false);
      }
      watchlistScrollTarget = node('watchlist-grid');
      if (watchlistScrollTarget && watchlistScrollTarget.addEventListener) {
        watchlistScrollHandler = onWatchlistScroll;
        watchlistScrollTarget.addEventListener('scroll', watchlistScrollHandler, false);
      }
      libraryViewTarget = node('library-view');
      if (libraryViewTarget && libraryViewTarget.addEventListener) {
        libraryViewFocusHandler = function (event) {
          if (event && event.target && event.target !== libraryViewTarget) { ensureLibraryTabPrefetch(); }
        };
        libraryViewTarget.addEventListener('focus', libraryViewFocusHandler, true);
      }
    }

    function updateLibraryFocus() {
      var target;
      var current = libraryState();
      if (destroyed || !isLibraryActive()) { return; }
      if (current.zone === 'grid') {
        gridView.setMode(libraryViewKey(), libraryUsesGridScroll());
        gridView.setContentActive(true);
        gridView.refreshFocus();
        ensureLibraryTabPrefetch();
        return;
      }
      call(shell.scheduleBackdropPrefetch, [], 'library');
      call(shell.clearFocus);
      gridView.setContentActive(false);
      if (current.zone === 'nav') { target = call(shell.navigationTarget, navigationIndex()); }
      else if (current.zone === 'tabs' && document.querySelector) { target = document.querySelector('[data-library-tab="' + current.tabIndex + '"]'); }
      else if (current.zone === 'actions') { target = node(current.actionIndex === 0 ? 'library-refresh' : 'library-refresh-metadata'); }
      else if (current.zone === 'sort' && document.querySelectorAll) { target = document.querySelectorAll('[data-library-sort]')[current.controlIndex]; }
      else if (current.zone === 'filter' && document.querySelectorAll) { target = document.querySelectorAll('[data-library-filter], [data-library-filter-open]')[current.controlIndex]; }
      if (target) {
        if (String(target.className || '').indexOf('is-focused') === -1) { target.className = String(target.className || '') + ' is-focused'; }
        if (!pointerActive() && target.focus) { target.focus(); }
      }
      if (current.zone !== 'nav') { ensureLibraryTabPrefetch(); }
      call(shell.stopTheme);
    }

    function libraryLoadContext() {
      var current = libraryState();
      return {
        library: activeLibrary(),
        viewKey: libraryViewKey(),
        container: lifecycleSnapshot().container,
        usesGridScroll: libraryUsesGridScroll(),
        query: {
          sort: current.sort,
          direction: current.sortDirection,
          watched: current.watchedFilter,
          filters: filterView && filterView.filters ? filterView.filters() : {}
        }
      };
    }

    function ensureLibraryTabPrefetch() {
      var context;
      if (destroyed || !tabPrefetch || !isLibraryActive() || !activeLibrary() || activeLibrary().offline === true) { return false; }
      context = libraryLoadContext();
      return tabPrefetch.ensure({
        library: context.library,
        sourceContext: activeSourceContext,
        activeViewKey: context.container ? '' : context.viewKey,
        activeQuery: context.container ? null : context.query,
        onReady: function (viewKey, result, request) {
          warmPrefetchedTab(viewKey, result, request);
        }
      });
    }

    function loadLibraryContent(reset, replaceExisting) {
      var context;
      if (destroyed || !activeLibrary() || !lifecycle) { return false; }
      if (activeLibrary().offline === true) { return false; }
      if (contentStateDirty && !activeContainer() && reset !== true && replaceExisting !== true) { return false; }
      context = libraryLoadContext();
      if (pendingTabContent) {
        context.beforeReplace = function () {
          if (!pendingTabContent) { return; }
          pendingTabContent = false;
          if (node('library-grid')) { node('library-grid').style.pointerEvents = ''; }
          gridView.reset();
        };
      }
      lifecycle.load(context, reset === true, replaceExisting === true);
      return true;
    }

    function reloadLibraryContent() {
      if (destroyed || !activeLibrary() || activeLibrary().offline === true || !lifecycle || !lifecycle.reload) { return false; }
      lifecycle.reload(libraryLoadContext());
      return true;
    }

    function updateLibraryStatus() {
      var currentGrid;
      var itemCount;
      var currentLifecycle;
      var key;
      var status;
      if (!isLibraryActive()) { return; }
      currentGrid = gridNavigationSnapshot();
      itemCount = pendingTabContent ? 0 : (libraryViewKey() === 'recommended' ? currentGrid.recommendationItemCount : currentGrid.itemCount);
      currentLifecycle = lifecycleSnapshot();
      key = LibraryContainers.statusKey(libraryViewKey(), currentLifecycle.loading, currentLifecycle.error, itemCount, currentLifecycle.hasContainer);
      status = node('library-status');
      if (status) { status.className = 'library-status' + (key && !itemCount ? ' is-prominent' : ''); }
      setText('library-status', key ? t(key) : '');
    }

    function probeContinue() {
      if (!destroyed && activeLibrary() && activeLibrary().offline !== true && lifecycle && lifecycle.probeContinue) { lifecycle.probeContinue(activeLibrary()); return true; }
      return false;
    }

    function probeCollections() {
      if (!destroyed && activeLibrary() && activeLibrary().offline !== true && lifecycle && lifecycle.probeCollections) { lifecycle.probeCollections(activeLibrary()); return true; }
      return false;
    }

    function renderWatchlistGrid() { if (watchlistView && watchlistView.render) { watchlistView.render(); } }
    function updateWatchlistFocus() { if (isWatchlistActive() && watchlistView && watchlistView.refreshFocus) { watchlistView.refreshFocus(); } }
    function loadAllWatchlistItems(requestOptions, callback) {
      var pageSize = 100;
      var start = 0;
      var items = [];
      var request = null;
      var cancelled = false;
      var settled = false;

      function finish(error) {
        if (cancelled || settled) { return; }
        settled = true;
        call(callback, error || null, error ? [] : items);
      }

      function loadPage() {
        request = WatchlistClient.load(timerRoot, requestOptions, start, pageSize, function (error, pageItems) {
          var page = pageItems || [];
          if (cancelled || settled) { return; }
          request = null;
          if (error) { finish(error); return; }
          items = items.concat(page);
          if (page.length === pageSize) {
            start += page.length;
            loadPage();
            return;
          }
          finish(null);
        });
      }

      loadPage();
      return {
        abort: function () {
          if (cancelled || settled) { return; }
          cancelled = true;
          if (request && request.abort) { request.abort(); }
          request = null;
        }
      };
    }
    function loadWatchlist(force, callback) {
      if (destroyed || !watchlistView || !watchlistView.load) { call(callback, new Error('Watchlist unavailable')); return null; }
      return watchlistView.load(force === true, callback);
    }
    function setWatchlistWarmPressure(active) {
      var next = active === true;
      if (watchlistWarmPressureActive === next) { return; }
      watchlistWarmPressureActive = next;
      call(shell.setHomeArtworkPressure, 'watchlist-warm', next);
    }
    function warmWatchlist(callback) {
      if (destroyed || !available() || !watchlistVisible()) {
        call(callback);
        return false;
      }
      if (watchlistSnapshot().loading) {
        call(callback);
        return false;
      }
      setWatchlistWarmPressure(true);
      loadWatchlist(false, function (error, items) {
        setWatchlistWarmPressure(false);
        call(callback, error || null, items || []);
      });
      return true;
    }
    function setLibraryRefreshPendingPresentation(pending) {
      var refresh = node('library-refresh');
      var metadata = node('library-refresh-metadata');
      if (refresh) { refresh.disabled = pending === true || !libraryActionsAvailable(activeLibrary()); }
      if (metadata) { metadata.disabled = pending === true || !libraryActionsAvailable(activeLibrary()); }
    }

    function finishLibraryRefreshPresentation() {
      if (!isLibraryActive()) { return; }
      invalidateTabPrefetchForLibrary(activeLibrary(), activeSourceContext);
      call(shell.showMessage, t('status.refreshComplete'));
      probeContinue();
      reloadLibraryContent();
      call(shell.refreshHome);
      updateLibraryFocus();
    }

    function constructController() {
      return LibraryController.create({
        root: timerRoot,
        LibraryContainers: LibraryContainers,
        now: function () { return new Date().getTime(); },
        navigationIndex: navigationIndex,
        navigationItems: navigationItems,
        setNavigationIndex: function (index) { call(state.setNavigationIndex, Number(index) || 0); },
        isBusy: function () { return !!(lifecycleSnapshot().loading || call(state.homeBusy)); },
        loadRecommendations: loadRecommendationsForLibrary,
        actionsAvailable: libraryActionsAvailable,
        buildPrefetchedState: prefetchedLibraryState,
        warmPrefetch: warmLibraryPrefetch,
        cancelPrefetchWarm: function () { if (shell.posterLoader && shell.posterLoader.cancelScope) { shell.posterLoader.cancelScope('library-prefetch'); } },
        onPrefetchWorkChange: function (active) { call(shell.setHomeArtworkPressure, 'library-prefetch', active === true); },
        onQueryChange: function () {
          if (!isLibraryActive()) { return; }
          pendingTabContent = false;
          if (node('library-grid')) { node('library-grid').style.pointerEvents = ''; }
          clearTabWarmCache();
          renderLibraryControls();
          loadLibraryContent(true);
          updateLibraryFocus();
        },
        onRefreshPending: setLibraryRefreshPendingPresentation,
        onRefreshStart: function () { if (isLibraryActive()) { call(shell.showMessage, t('status.refreshing')); } },
        onRefreshError: function () { if (isLibraryActive()) { call(shell.showMessage, t('status.updateError')); updateLibraryFocus(); } },
        onRefreshComplete: finishLibraryRefreshPresentation,
        refreshLibrary: function (library, callback) {
          return sourceRequest(activeSourceContext, library, function (requestConfigValue, done) {
            return PlexClient.refreshLibrary(requestConfigValue, library.key, done);
          }, callback);
        },
        refreshMetadata: function (library, callback) {
          return sourceRequest(activeSourceContext, library, function (requestConfigValue, done) {
            return PlexClient.refreshLibraryMetadata(requestConfigValue, library.key, done);
          }, callback);
        },
        waitForActivity: function (activityId, callback) { call(server.waitForActivity, activityId, callback); },
        scrollTop: function (value) { var target = node('library-grid'); if (target) { target.scrollTop = Number(value || 0); } },
        updateFocus: updateLibraryFocus,
        onTabFocus: focusLibraryTab,
        scheduleTabPreview: scheduleLibraryTabPreview,
        cancelTabPreview: cancelLibraryTabPreview,
        commitTabPreview: commitLibraryTabPreview,
        pointerVisualFocus: function (target) {
          call(shell.clearFocus);
          if (target && String(target.className || '').indexOf('is-focused') === -1) { target.className = String(target.className || '') + ' is-focused'; }
        },
        closeLibrary: close,
        moveNavigation: moveNavigation,
        activateNavigation: function () {
          var items = navigationItems();
          var index = navigationIndex();
          if (items[index] && items[index].kind === 'library') { call(shell.startNavigationHold, index); }
          else { call(shell.enterNavigation); }
        },
        nextTab: nextLibraryTab,
        selectTab: selectLibraryTab,
        focusTabContent: focusLibraryTabContent,
        openFilter: openLibraryFilterDrawer,
        openContainer: openContainer,
        openItem: function (item) { captureCatalogRefreshAnchor(); call(transitions.openDetail, item, sourceContextForItem(item)); },
        playItem: function (item) { captureCatalogRefreshAnchor(); call(transitions.playItem, item, sourceContextForItem(item)); },
        loadMore: function () { loadLibraryContent(false); },
        playlistsTitle: function () { return t('nav.playlists'); }
      });
    }

    function constructFilterView() {
      filterView = LibraryFilterView.create({
        document: document,
        root: timerRoot,
        element: element,
        setText: setText,
        t: t,
        libraryTitle: function (library) { return library ? library.title : ''; },
        loadOptions: function (library, callback) {
          if (library && library.virtualLibrary && typeof data.loadVirtualLibraryFilterOptions === 'function') {
            return data.loadVirtualLibraryFilterOptions(library, callback);
          }
          return sourceRequest(activeSourceContext, library, function (requestConfigValue, done) {
            return PlexClient.loadLibraryFilterOptions(requestConfigValue, library, done);
          }, callback, 'filters');
        },
        fallbackOptions: function () {
          return {
            year: [], genre: [], actor: [], director: [], resolution: [], hdr: [
              { value: '1', label: t('library.filterHdr') },
              { value: '0', label: t('library.filterSdr') }
            ]
          };
        },
        clearFocus: function () { call(shell.clearFocus); },
        isPointerSelectionActive: pointerActive,
        onApply: function (filters) {
          if (destroyed) { return; }
          controller.setWatchedFilter(filters && filters.watched ? filters.watched : 'all');
          renderLibraryControls();
          loadLibraryContent(true);
        },
        onClose: function () {
          if (!isLibraryActive()) { return; }
          controller.setZone('filter', 3);
          updateLibraryFocus();
        }
      });
    }

    function constructGridView() {
      gridView = LibraryGridView.create({
        root: timerRoot,
        document: document,
        SearchModel: SearchModel,
        element: element,
        moveGridDown: LibraryContainers.moveGridDown,
        cardMetrics: function () { return call(shell.cardMetrics); },
        cardProfile: function () { return call(shell.cardProfile); },
        presentationVersion: function () {
          return String(call(state.uiLanguage) || 'en') + '|' + ((activeLibrary() && activeLibrary().globalPlaylists) || detailContainerKind(activeContainer()) === 'playlist' ? 'playlist' : 'plain');
        },
        artworkSignature: function () { return String(call(state.artworkQuality) || ''); },
        showLibraryBadge: function () { return !!(activeLibrary() && activeLibrary().globalPlaylists) || detailContainerKind(activeContainer()) === 'playlist'; },
        mediaTitle: function (item) { return call(shell.mediaTitle, item); },
        mediaCardMeta: function (item) { return call(shell.mediaCardMeta, item); },
        mediaCardDetail: function (item) { return call(shell.mediaCardDetail, item); },
        mediaKey: function (item) { return call(shell.mediaKey, item); },
        sourceContextForItem: sourceContextForItem,
        sourceContextIdentity: sourceRouter.contextIdentity,
        sourceIdentityForItem: sourceRouter.identityFor,
        recommendationTitle: libraryRecommendationTitle,
        renderedPosterSpecification: renderedPosterSpecification,
        fixedPosterSpecification: fixedPosterSpecification,
        posterLoader: shell.posterLoader,
        overscanRows: libraryOverscanRows,
        clearFocus: function () { call(shell.clearFocus); },
        pointerSelectionActive: pointerActive,
        onNearEnd: function () { if (isLibraryActive()) { loadLibraryContent(false); } },
        onFocus: function (focus, item, adjacent) {
          var itemSourceContext;
          if (!isLibraryActive() || libraryState().zone !== 'grid' || !item) { return; }
          itemSourceContext = sourceContextForItem(item);
          call(shell.scheduleBackdrop, item, 'library', 250);
          call(shell.scheduleBackdropPrefetch, adjacent || [], 'library');
          call(shell.scheduleTheme, item, itemSourceContext);
        }
      });
    }

    function constructLifecycle() {
      lifecycle = LibraryLifecycle.create({
        grid: gridView,
        defer: function (callback) { return timerRoot.setTimeout(callback, 0); },
        scrollTop: function () { var target = node('library-grid'); return target ? target.scrollTop : 0; },
        setScrollTop: function (value) { var target = node('library-grid'); if (target) { target.scrollTop = value; } },
        isActive: isLibraryActive,
        loadRecommendations: function (library, callback, onProgress) {
          return requestPrefetchedRecommendations(library, callback, onProgress);
        },
        actionsAvailable: libraryActionsAvailable,
        loadContainerPage: function (container, start, limit, callback) {
          if (activeLibrary() && activeLibrary().globalPlaylists && typeof data.loadGlobalPlaylistItems === 'function') { return data.loadGlobalPlaylistItems(container, start, limit, callback); }
          var context = sourceContextForItem(container);
          return sourceRequest(context, container, function (requestConfigValue, done) {
            return PlexClient.loadLibraryContainerPage(requestConfigValue, container, start, limit, done);
          }, callback);
        },
        loadContainerSummaryPage: function (container, start, limit, callback) {
          if (activeLibrary() && activeLibrary().globalPlaylists && typeof data.loadGlobalPlaylistItems === 'function') { return data.loadGlobalPlaylistItems(container, start, limit, callback); }
          var context = sourceContextForItem(container);
          return sourceRequest(context, container, function (requestConfigValue, done) {
            return PlexClient.loadLibraryContainerPage(requestConfigValue, container, start, limit, done);
          }, callback);
        },
        shouldSummarizeContainer: function (container) { return !!detailContainerKind(container); },
        initialContainerFocusIndex: function (items, container) {
          if (detailContainerKind(container) !== 'playlist' || !PlaybackQueueModel || !PlaybackQueueModel.firstUnfinishedIndex) { return -1; }
          return PlaybackQueueModel.firstUnfinishedIndex(items || []);
        },
        summarizeContainerItems: function (items) { return PlaybackQueueModel.progressSummary(items); },
        loadLibraryPage: function (library, viewKey, query, start, limit, callback, onProgress) {
          if (library && library.globalPlaylists && typeof data.loadGlobalPlaylists === 'function') { return data.loadGlobalPlaylists(start, limit, callback); }
          return requestPrefetchedPage(library, viewKey, query, start, limit, callback, onProgress);
        },
        onReset: function () {
          if (!isLibraryActive()) { return; }
          renderLibraryGrid();
          renderLibraryGlobalHeader();
          call(shell.hideViewState);
        },
        onStatus: updateLibraryStatus,
        onEmpty: function (result) {
          if (!isLibraryActive() || libraryState().zone !== 'grid') { return; }
          controller.setZone(activeLibrary() && activeLibrary().globalPlaylists ? 'nav' : 'tabs');
          if (result.kind === 'recommendations') { controller.setZone('tabs'); }
        },
        onRender: function (result) {
          if (!isLibraryActive()) { return; }
          if (pendingTabContent && result && result.error) {
            pendingTabContent = false;
            if (node('library-grid')) { node('library-grid').style.pointerEvents = ''; }
            gridView.reset();
          }
          if (!activeContainer() && (!result || !result.error)) {
            if (contentStateDirty) { contentStateDirty = false; }
            if (sourceDefinitionDirty) { sourceDefinitionDirty = false; }
            pendingCatalogRefreshAnchor = null;
          }
          call(shell.hideViewState);
          renderLibraryGrid();
          renderLibraryGlobalHeader();
          completeContainerRestore(result);
          applyPendingPlaybackProgress();
          updateLibraryFocus();
          if (librarySurfaceAnimationPending) {
            librarySurfaceAnimationPending = false;
            call(shell.animateLibrarySurface);
          }
          scheduleAdjacentPrefetch();
        },
        onContainerSummary: function () {
          var currentLifecycle = lifecycleSnapshot();
          if (contentStateDirty && !sourceDefinitionDirty && activeContainer() && !currentLifecycle.containerSummaryLoading &&
              !currentLifecycle.containerSummaryError && currentLifecycle.containerSummary) {
            contentStateDirty = false;
          }
          if (isLibraryActive()) { renderLibraryGlobalHeader(); }
        },
        onContinueAvailable: function () {
          if (!isLibraryActive()) { return; }
          renderLibrarySubnav();
          updateLibraryFocus();
        },
        onCollectionsAvailable: function () {
          if (!isLibraryActive()) { return; }
          renderLibrarySubnav();
          updateLibraryFocus();
        },
        onRestoreContainer: function () {
          if (!isLibraryActive()) { return; }
          controller.setZone('grid');
          updateLibraryPresentationClass();
          if (contentStateDirty) {
            pendingCatalogRefreshAnchor = null;
            renderLibraryGlobalHeader();
            renderLibrarySubnav();
            reloadLibraryContent();
            probeContinue();
            probeCollections();
            return;
          }
          renderLibraryGrid();
          renderLibraryGlobalHeader();
          applyPendingPlaybackProgress();
          updateLibraryFocus();
        }
      });
    }

    function constructWatchlistView() {
      watchlistView = WatchlistView.create({
        root: timerRoot,
        document: document,
        WatchlistState: WatchlistState,
        element: element,
        available: available,
        identity: watchlistIdentity,
        accountToken: accountToken,
        timeout: function () { return Math.min(8000, Number(config.requestTimeout || 6000)); },
        discover: function (requestOptions, callback) { return WatchlistClient.discover(timerRoot, requestOptions, callback); },
        load: loadAllWatchlistItems,
        set: function (requestOptions, key, enabled, callback) { return WatchlistClient.set(timerRoot, requestOptions, key, enabled, callback); },
        findByGuid: function (guid, callback) {
          if (typeof data.resolveGuid === 'function') { return data.resolveGuid(guid, callback); }
          return PlexClient.findByGuid(sourceRouter.configFor(null, null), guid, callback);
        },
        sourceContextForItem: sourceContextForItem,
        sourceIdentityForItem: sourceRouter.identityFor,
        cardMetrics: function () { return call(shell.cardMetrics); },
        cardProfile: function () { return call(shell.cardProfile); },
        mediaTitle: function (item) { return call(shell.mediaTitle, item); },
        mediaCardMeta: function (item) { return call(shell.mediaCardMeta, item); },
        mediaCardDetail: function (item) { return call(shell.mediaCardDetail, item); },
        renderedPosterSpecification: renderedPosterSpecification,
        fixedPosterSpecification: fixedPosterSpecification,
        posterLoader: shell.posterLoader,
        scope: 'watchlist',
        isActive: isWatchlistActive,
        clearFocus: function () { call(shell.clearFocus); },
        navTarget: function () { return call(shell.navigationTarget, navigationIndex()); },
        pointerSelectionActive: pointerActive,
        prioritizePoster: function (target) { call(shell.prioritizePoster, target); },
        columns: function () {
          var grid = node('watchlist-grid');
          return CardLayout && CardLayout.columns ? CardLayout.columns(grid && grid.clientWidth || 1600, call(state.cardScale)) : 1;
        },
        onFocus: function (item, adjacent) {
          var itemSourceContext;
          if (!isWatchlistActive()) { return; }
          itemSourceContext = sourceContextForItem(item);
          call(shell.scheduleBackdrop, item, 'watchlist', 250);
          call(shell.scheduleBackdropPrefetch, adjacent || [], 'watchlist');
          call(shell.scheduleTheme, item, itemSourceContext);
        },
        onNavigationFocus: function () { call(shell.scheduleBackdropPrefetch, [], 'watchlist'); call(shell.stopTheme); },
        onItemsChanged: function () { if (!destroyed) { call(transitions.onWatchlistItemsChanged); } },
        onNavigate: moveNavigation,
        onEnterNavigation: function () { call(shell.enterNavigation); },
        onBack: close,
        onPlay: function (item) { call(transitions.playItem, item, sourceContextForItem(item)); },
        onOpenDetail: function (item) { call(transitions.openDetail, item, sourceContextForItem(item)); }
      });
    }

    function openContainer(item) {
      if (destroyed || !item || !lifecycle) { return false; }
      cacheActiveLibraryView();
      if (!lifecycle.openContainer(item)) { return false; }
      controller.setZone('grid');
      updateLibraryPresentationClass();
      renderLibraryGlobalHeader();
      loadLibraryContent(true);
      return true;
    }

    function commitLibraryEntry(library, entryOptions, sourceContext) {
      var saved;
      entryOptions = entryOptions || {};
      if (destroyed || !library) { return false; }
      cancelLibraryTabPreview(false);
      pendingTabContent = false;
      if (node('library-grid')) { node('library-grid').style.pointerEvents = ''; }
      if (tabPrefetch && activeMode === 'library' && activeLibrary() &&
          (String(activeLibrary().key || '') !== String(library.key || '') ||
           tabPrefetchSourceIdentity(activeLibrary(), activeSourceContext) !== tabPrefetchSourceIdentity(library, sourceContext))) {
        tabPrefetch.cancelLibrary(activeLibrary(), activeSourceContext);
        clearTabWarmCache();
      }
      activeSourceContext = sourceContext ? copyRecord(sourceContext) : null;
      if (activeSourceContext && !activeSourceContext.sourceId && library.sourceId) { activeSourceContext.sourceId = library.sourceId; }
      pendingPlaybackProgress = null;
      contentStateDirty = false;
      sourceDefinitionDirty = false;
      generation += 1;
      activeMode = 'library';
      librarySurfaceAnimationPending = false;
      if (entryOptions.navigationIndex !== undefined) { call(state.setNavigationIndex, Number(entryOptions.navigationIndex) || 0); }
      saved = controller.cached ? controller.cached(library) : null;
      call(transitions.setView, 'library');
      controller.enterLibrary(library, { keepNavigationFocus: entryOptions.keepNavigationFocus === true });
      libraryTabCommittedIndex = Number((controller.snapshot() || {}).tabIndex || 0);
      if (node('content')) { node('content').style.display = 'none'; }
      if (node('search-view')) { node('search-view').className = 'search-view is-hidden'; }
      if (node('watchlist-view')) { node('watchlist-view').className = 'watchlist-view is-hidden'; }
      call(shell.suspendSettings);
      if (node('detail-view')) { node('detail-view').className = 'detail-view is-hidden'; }
      updateLibraryPresentationClass();
      renderLibraryGlobalHeader();
      call(shell.renderNavigation);
      renderLibrarySubnav();
      renderLibraryControls();
      updateLibraryManagementActions();
      if (saved) {
        restoreCachedLibraryGrid(saved, true);
        updateLibraryStatus();
      }
      if (!saved) {
        librarySurfaceAnimationPending = true;
        loadLibraryContent(true);
        if (!library.globalPlaylists) { probeContinue(); probeCollections(); }
      } else {
        if (!library.globalPlaylists && saved.continueAvailable === null) { probeContinue(); }
        if (!library.globalPlaylists && saved.collectionsAvailable === null) { probeCollections(); }
        scheduleAdjacentPrefetch();
        call(shell.animateLibrarySurface);
      }
      updateLibraryFocus();
      return true;
    }

    function enterLibrary(library, entryOptions) {
      var requestGeneration;
      var settled = false;
      var request;
      entryOptions = entryOptions || {};
      if (destroyed || !library) { return false; }
      call(shell.stopTheme);
      cancelSourceResolution();
      if (library.virtualLibrary) {
        activeSourceContext = null;
        return commitLibraryEntry(library, entryOptions, null);
      }
      if (!library.sourceId || typeof data.resolveSource !== 'function') {
        activeSourceContext = null;
        return commitLibraryEntry(library, entryOptions, null);
      }
      requestGeneration = sourceGeneration;
      request = data.resolveSource(library.sourceId, function (error, context) {
        settled = true;
        if (destroyed || requestGeneration !== sourceGeneration) { return; }
        pendingSourceRequest = null;
        if (error || !context) {
          call(shell.showMessage, t('status.updateError'));
          call(transitions.returnHome, 'preserve');
          return;
        }
        commitLibraryEntry(library, entryOptions, context);
      });
      pendingSourceRequest = settled ? null : request;
      return true;
    }

    function enterPlaylists(entryOptions) {
      return enterLibrary({ key: 'playlists', title: t('nav.playlists'), globalPlaylists: true }, entryOptions || {});
    }

    function enterWatchlist(entryOptions) {
      var watchlistViewNode;
      entryOptions = entryOptions || {};
      if (destroyed) { return false; }
      cancelLibraryTabPreview(false);
      cancelSourceResolution();
      pendingPlaybackProgress = null;
      if (!available()) {
        call(shell.showMessage, t('watchlist.unavailable'));
        call(shell.renderNavigation);
        return false;
      }
      generation += 1;
      activeMode = 'watchlist';
      if (entryOptions.navigationIndex !== undefined) { call(state.setNavigationIndex, Number(entryOptions.navigationIndex) || 0); }
      call(transitions.setView, 'watchlist');
      call(shell.hideViewState);
      if (node('content')) { node('content').style.display = 'none'; }
      if (node('library-view')) { node('library-view').className = 'library-view is-hidden'; }
      if (node('search-view')) { node('search-view').className = 'search-view is-hidden'; }
      call(shell.suspendSettings);
      if (node('detail-view')) { node('detail-view').className = 'detail-view is-hidden'; }
      watchlistViewNode = node('watchlist-view');
      if (watchlistViewNode) { watchlistViewNode.className = 'watchlist-view'; }
      setText('watchlist-title', t('nav.watchlist'));
      call(shell.renderNavigation);
      controller.enterWatchlist({ keepNavigationFocus: entryOptions.keepNavigationFocus === true });
      return true;
    }

    function hidePresentation() {
      cancelLibraryTabPreview(true);
      if (node('library-view')) { node('library-view').className = 'library-view is-hidden'; }
      if (node('watchlist-view')) { node('watchlist-view').className = 'watchlist-view is-hidden'; }
      return true;
    }

    function translateStatic() {
      var refresh = node('library-refresh');
      setText('library-refresh-metadata', t('library.refreshMetadata'));
      if (refresh) {
        refresh.title = t('library.refresh');
        refresh.setAttribute('aria-label', t('library.refresh'));
      }
      return true;
    }

    function leave() {
      var mode = activeMode;
      if (destroyed || !mode) { return false; }
      cancelLibraryTabPreview(true);
      librarySurfaceAnimationPending = false;
      cancelContainerRestore(true);
      pendingPlaybackProgress = null;
      generation += 1;
      call(shell.hideViewState);
      if (mode === 'library') {
        cacheActiveLibraryView();
        pendingTabContent = false;
        if (node('library-grid')) { node('library-grid').style.pointerEvents = ''; }
        if (tabPrefetch) { tabPrefetch.cancelLibrary(activeLibrary(), activeSourceContext); }
        clearTabWarmCache();
        controller.leave();
        if (node('library-view')) { node('library-view').className = 'library-view is-hidden'; }
      } else if (mode === 'watchlist') {
        controller.leave();
        if (node('watchlist-view')) { node('watchlist-view').className = 'watchlist-view is-hidden'; }
      }
      activeMode = '';
      libraryTabCommittedIndex = null;
      return true;
    }

    function close() {
      if (destroyed) { return false; }
      call(transitions.returnHome, 'preserve');
      return true;
    }

    function handleKey(event, direction) {
      if (destroyed) { return false; }
      if (currentView() === 'watchlist') {
        if (watchlistView && watchlistView.handleKeyDown) { watchlistView.handleKeyDown(event, direction); return true; }
        return false;
      }
      return controller && controller.handleKey ? controller.handleKey(event, direction) : false;
    }

    function pointerFocus(target, index, targetElement) {
      if (destroyed) { return false; }
      if (target !== 'nav' && target !== 'navigation') { ensureLibraryTabPrefetch(); }
      if (target === 'library-filter') {
        if (filterView && filterView.pointerFocus) { filterView.pointerFocus(targetElement); return true; }
        return false;
      }
      if (target === 'watchlist') {
        if (watchlistView && watchlistView.pointerFocus) { watchlistView.pointerFocus(targetElement); return true; }
        return false;
      }
      if (controller && controller.pointerFocus) { controller.pointerFocus(target, index, targetElement); return true; }
      return false;
    }

    function restorePageFocus(target, targetElement) {
      if (destroyed) { return false; }
      if (target === 'watchlist') {
        if (watchlistView && watchlistView.restoreFocus) { watchlistView.restoreFocus(targetElement); return true; }
        return false;
      }
      if (controller && controller.setZone) { controller.setZone('grid'); }
      if (gridView && gridView.restoreFocus) { gridView.restoreFocus(targetElement); return true; }
      return false;
    }

    function onWheelNavigation(duration) {
      if (destroyed || !controller || !controller.beginWheelNavigation) { return false; }
      controller.beginWheelNavigation(duration);
      return true;
    }


    function navigationHasFocus() {
      if (currentView() === 'watchlist') { return watchlistSnapshot().zone === 'nav'; }
      return libraryState().zone === 'nav';
    }

    function matchesNavigation(item) {
      var active = activeLibrary();
      var activeSourceId;
      var itemSourceId;
      if (!item) { return false; }
      if (item.kind === 'watchlist') { return currentView() === 'watchlist'; }
      if (item.kind === 'library') {
        if (currentView() !== 'library' || !active) { return false; }
        activeSourceId = String(active.sourceId || '');
        itemSourceId = String(item.sourceId || '');
        if (activeSourceId || itemSourceId) { return !!activeSourceId && activeSourceId === itemSourceId; }
        return String(active.key || '') === String(item.key || '');
      }
      if (item.kind === 'playlists') { return currentView() === 'library' && !!active && active.globalPlaylists === true; }
      return false;
    }

    function focusNavigation() {
      if (destroyed) { return false; }
      if (currentView() === 'watchlist') {
        if (watchlistView && watchlistView.focusNavigation) { watchlistView.focusNavigation(); return true; }
        return false;
      }
      controller.setZone('nav');
      updateLibraryFocus();
      return true;
    }

    function enterActiveContent(kind) {
      var currentGrid = gridNavigationSnapshot();
      if (destroyed) { return false; }
      if (kind === 'watchlist' || currentView() === 'watchlist') {
        if (watchlistView && watchlistView.focusContent) { watchlistView.focusContent(); return true; }
        return false;
      }
      if (kind === 'playlists' || activeLibrary() && activeLibrary().globalPlaylists) {
        controller.setZone(currentGrid.itemCount ? 'grid' : 'nav');
      } else {
        controller.setZone('tabs');
      }
      updateLibraryFocus();
      return true;
    }

    function playbackContext() {
      var currentGrid = gridSnapshot();
      return {
        container: copyRecord(activeContainer()),
        items: copyRecords(currentGrid.items),
        focusIndex: currentGrid.focus ? Number(currentGrid.focus.index || 0) : 0
      };
    }

    function originKey(value) {
      var key = String(value && (value.containerKey || value.containerRatingKey || value.ratingKey || value.key || '') || '');
      return key ? String(value.serverMachineIdentifier || '') + '|' + key : '';
    }

    function playbackScopeKey() {
      var container = activeContainer();
      var library = activeLibrary();
      return container ? 'container:' + originKey(container) : 'library:' + libraryCacheKey(library);
    }

    function mediaMutationItemMatches(item, ratingKey, machineIdentifier, requireOwner) {
      var owner;
      if (!item || String(item.ratingKey || '') !== String(ratingKey || '')) { return false; }
      if (!machineIdentifier) { return true; }
      owner = String(item.serverMachineIdentifier || '');
      if (!owner) { return requireOwner !== true; }
      return owner === String(machineIdentifier);
    }

    function playbackProgressIndex(items, ratingKey, focusIndex, hasContainer, machineIdentifier, requireOwner) {
      var index;
      if (focusIndex >= 0 && mediaMutationItemMatches(items[focusIndex], ratingKey, machineIdentifier, requireOwner)) {
        return focusIndex;
      }
      if (hasContainer) { return -1; }
      for (index = 0; index < items.length; index += 1) {
        if (mediaMutationItemMatches(items[index], ratingKey, machineIdentifier, requireOwner)) { return index; }
      }
      return -1;
    }

    function applyPendingPlaybackProgress() {
      var pending = pendingPlaybackProgress;
      var currentGrid;
      var items;
      var focus;
      var targetIndex;
      var target;
      var duration;
      var offset;
      if (!pending || !isLibraryActive()) { return false; }
      if (pending.scope !== playbackScopeKey()) {
        pendingPlaybackProgress = null;
        return false;
      }
      if (pendingContainerRestore) { return false; }
      currentGrid = gridSnapshot();
      items = currentGrid.items || [];
      focus = currentGrid.focus || {};
      targetIndex = playbackProgressIndex(items, pending.ratingKey, Number(focus.index), !!activeContainer(), pending.machineIdentifier, pending.requireOwner);
      if (targetIndex < 0) { return false; }
      target = copyRecord(items[targetIndex]);
      duration = Number(target.duration || 0);
      offset = Math.max(0, Math.round(Number(pending.seconds || 0) * 1000));
      target.viewOffset = offset;
      if (duration > 0) {
        target.progress = Math.max(0, Math.min(100, Math.round(offset / duration * 100)));
      }
      items = items.slice();
      items[targetIndex] = target;
      pendingPlaybackProgress = null;
      gridView.setItems(items, currentGrid.totalSize);
      updateLibraryFocus();
      return true;
    }

    function reconcilePlaybackProgress(ratingKey, seconds, sourceContext) {
      var numericSeconds = Number(seconds);
      var scope;
      var library;
      var machineIdentifier = String(sourceContext && sourceContext.serverMachineIdentifier || '');
      if (destroyed || !ratingKey || !isFinite(numericSeconds) || numericSeconds < 0) { return false; }
      if (activeMode === 'watchlist') {
        reconcileContentMutation();
        return watchlistView && watchlistView.reconcilePlaybackProgress
          ? watchlistView.reconcilePlaybackProgress(ratingKey, numericSeconds, machineIdentifier)
          : true;
      }
      if (activeMode === 'library' && !activeLibraryOwnsSource(sourceContext)) { return false; }
      reconcileContentMutation();
      library = activeLibrary();
      if (!library) { return true; }
      if (!(isLibraryActive() || (activeMode === 'library' && currentView() === 'player' && !!detailContainerKind(activeContainer())))) { return true; }
      scope = playbackScopeKey();
      if (!scope) { return true; }
      pendingPlaybackProgress = {
        ratingKey: String(ratingKey), seconds: numericSeconds, scope: scope,
        machineIdentifier: machineIdentifier,
        requireOwner: library.virtualLibrary === true && !!machineIdentifier
      };
      applyPendingPlaybackProgress();
      return true;
    }

    function containerRestoreFocusIndex(restore, items) {
      var activeItem = restore && restore.activeItem;
      var absoluteIndex = Number(restore && restore.absoluteIndex);
      var index;
      if (!activeItem || !activeItem.ratingKey) { return -1; }
      if (isFinite(absoluteIndex) && absoluteIndex >= 0 && items[absoluteIndex] &&
          String(items[absoluteIndex].ratingKey || '') === String(activeItem.ratingKey)) {
        return absoluteIndex;
      }
      for (index = 0; index < items.length; index += 1) {
        if (String(items[index] && items[index].ratingKey || '') === String(activeItem.ratingKey)) { return index; }
      }
      return -1;
    }

    function cancelContainerRestore(notify) {
      var restore = pendingContainerRestore;
      pendingContainerRestore = null;
      if (restore && notify === true) { call(restore.onReady, false); }
      return !!restore;
    }

    function completeContainerRestore(result) {
      var restore = pendingContainerRestore;
      var currentGrid;
      var focusIndex;
      if (!restore) { return false; }
      currentGrid = gridSnapshot();
      focusIndex = containerRestoreFocusIndex(restore, currentGrid.items || []);
      if (focusIndex < 0 && (!result || !result.error) &&
          Number(restore.absoluteIndex) >= (currentGrid.items || []).length &&
          (currentGrid.items || []).length < Number(currentGrid.totalSize || 0)) {
        loadLibraryContent(false);
        return false;
      }
      pendingContainerRestore = null;
      if (focusIndex >= 0) {
        controller.setZone('grid');
        gridView.focusCatalog(focusIndex);
      }
      call(restore.onReady, focusIndex >= 0);
      return true;
    }

    function restoreContainerOrigin(restoreOptions) {
      var origin;
      var queueItems;
      var queueIndex;
      var container;
      var currentGrid;
      var originKind;
      var originContainer;
      var index;
      var activeItem;
      restoreOptions = restoreOptions || {};
      if (destroyed) { return false; }
      origin = restoreOptions.origin || null;
      queueItems = restoreOptions.queueItems || restoreOptions.queue && restoreOptions.queue.items || [];
      queueIndex = restoreOptions.queueIndex === undefined ? Number(restoreOptions.queue && restoreOptions.queue.index || 0) : Number(restoreOptions.queueIndex || 0);
      activeItem = restoreOptions.activeItem || queueItems[queueIndex] || queueItems[0] || null;
      container = activeContainer();
      originKind = PlaybackQueueModel.containerKind(origin) || String(origin && origin.kind || '');
      if ((originKind !== 'playlist' && originKind !== 'collection') || !originKey(origin)) { return false; }
      currentGrid = gridSnapshot();
      if (originKey(origin) !== originKey(container)) {
        if (restoreOptions.openUnopened !== true || !activeLibrary() || !lifecycle || !lifecycle.openContainer) { return false; }
        if (originKind === 'playlist' && activeLibrary().globalPlaylists !== true) { return false; }
        if (originKind === 'collection' && activeLibrary().globalPlaylists === true) { return false; }
        originContainer = null;
        for (index = 0; index < (currentGrid.items || []).length; index += 1) {
          if (originKey(currentGrid.items[index]) === originKey(origin)) { originContainer = currentGrid.items[index]; break; }
        }
        if (!originContainer && origin.containerKey) { originContainer = origin; }
        if (!originContainer) { return false; }
      } else {
        originContainer = container;
      }
      generation += 1;
      activeMode = 'library';
      call(transitions.setView, 'library');
      if (node('content')) { node('content').style.display = 'none'; }
      if (node('search-view')) { node('search-view').className = 'search-view is-hidden'; }
      if (node('watchlist-view')) { node('watchlist-view').className = 'watchlist-view is-hidden'; }
      if (node('player-view')) { node('player-view').className = 'player-view is-hidden'; }
      updateLibraryPresentationClass();
      cancelContainerRestore(true);
      pendingContainerRestore = {
        activeItem: copyRecord(activeItem),
        absoluteIndex: queueIndex,
        onReady: restoreOptions.onReady
      };
      if (originKey(originContainer) !== originKey(container)) {
        if (!openContainer(originContainer)) { cancelContainerRestore(true); return false; }
      } else {
        controller.setZone('grid');
        renderLibraryGlobalHeader();
        if (!reloadLibraryContent()) { cancelContainerRestore(true); return false; }
      }
      return true;
    }

    function focusedItem() {
      if (currentView() === 'watchlist') { return watchlistView && watchlistView.focusedItem ? watchlistView.focusedItem() : null; }
      return gridView && gridView.focusedItem ? gridView.focusedItem() : null;
    }

    function refreshPresentation() {
      if (destroyed) { return false; }
      if (currentView() === 'library') { renderLibraryGrid(); updateLibraryFocus(); return true; }
      if (currentView() === 'watchlist') { renderWatchlistGrid(); updateWatchlistFocus(); return true; }
      return false;
    }

    function reconcileContentMutation() {
      if (destroyed) { return false; }
      if (controller && controller.clearAllCached) { controller.clearAllCached(); }
      invalidateAllLibraryTabPrefetch();
      if (activeMode === 'library') {
        if (currentView() !== 'library' && (!pendingCatalogRefreshAnchor || pendingCatalogRefreshAnchor.queryKey !== catalogQueryIdentity())) {
          captureCatalogRefreshAnchor();
        }
        if (currentView() === 'library' || !contentStateDirty) {
          if (lifecycle && lifecycle.invalidateContentRequest) { lifecycle.invalidateContentRequest(); }
        }
        if (activeLibrary() && activeLibrary().globalPlaylists !== true && lifecycle && lifecycle.setContinueAvailable) {
          lifecycle.setContinueAvailable(null);
        }
        contentStateDirty = true;
      }
      return true;
    }

    function activeLibraryOwnsSource(sourceContext) {
      var library = activeLibrary();
      var sourceId = String(sourceContext && sourceContext.sourceId || '');
      var machineIdentifier = String(sourceContext && sourceContext.serverMachineIdentifier || '');
      var members;
      if (!sourceId && !machineIdentifier) { return true; }
      if (!library) { return false; }
      if (library.virtualLibrary === true) {
        members = library.memberSourceIds || [];
        if (sourceId && members.indexOf(sourceId) !== -1) { return true; }
        if (machineIdentifier && members.some(function (memberSourceId) {
          return String(memberSourceId || '').indexOf(machineIdentifier + '|') === 0;
        })) { return true; }
        return false;
      }
      if (sourceId) {
        return String(activeSourceContext && activeSourceContext.sourceId || library.sourceId || '') === sourceId;
      }
      return String(activeSourceContext && activeSourceContext.serverMachineIdentifier || library.serverMachineIdentifier || '') === machineIdentifier;
    }

    function reconcileWatchedState(ratingKey, watched, sourceContext) {
      var current;
      var currentGrid;
      var items;
      var nextItems;
      var index;
      var removed = 0;
      var result;
      var machineIdentifier = String(sourceContext && sourceContext.serverMachineIdentifier || '');
      var requireOwner;
      if (destroyed || !ratingKey) { return false; }
      if (activeMode === 'watchlist') {
        return watchlistView && watchlistView.reconcileWatchedState
          ? watchlistView.reconcileWatchedState(ratingKey, watched, sourceContext && sourceContext.serverMachineIdentifier)
          : false;
      }
      if (activeMode !== 'library' || !activeLibraryOwnsSource(sourceContext)) { return false; }
      result = reconcileContentMutation();
      if (!result || activeContainer() || libraryViewKey() !== 'catalog') { return result; }
      current = libraryState();
      if (!((current.watchedFilter === 'unwatched' && watched === true) ||
          (current.watchedFilter === 'watched' && watched === false))) { return result; }
      currentGrid = gridSnapshot();
      items = currentGrid.items || [];
      nextItems = [];
      requireOwner = activeLibrary().virtualLibrary === true && !!machineIdentifier;
      for (index = 0; index < items.length; index += 1) {
        if (mediaMutationItemMatches(items[index], ratingKey, machineIdentifier, requireOwner)) { removed += 1; }
        else { nextItems.push(items[index]); }
      }
      if (removed && gridView && gridView.setItems) {
        gridView.setItems(nextItems, Math.max(nextItems.length, Number(currentGrid.totalSize || 0) - removed));
      }
      return result;
    }

    function recoverPresentation() {
      var libraryView;
      var watchlistViewNode;
      if (destroyed) { return false; }
      if (node('content')) { node('content').style.display = 'none'; }
      if (node('search-view')) { node('search-view').className = 'search-view is-hidden'; }
      if (node('detail-view')) { node('detail-view').className = 'detail-view is-hidden'; }
      if (currentView() === 'library') {
        activeMode = 'library';
        if (libraryTabPreviewIndex === null) { libraryTabCommittedIndex = Number(libraryState().tabIndex || 0); }
        libraryView = node('library-view');
        watchlistViewNode = node('watchlist-view');
        if (watchlistViewNode) { watchlistViewNode.className = 'watchlist-view is-hidden'; }
        updateLibraryPresentationClass();
        updateLibraryStatus();
        renderLibrarySubnav();
        renderLibraryControls();
        updateLibraryManagementActions();
        if (activeLibrary() && activeLibrary().offline === true && libraryState().zone === 'actions') { controller.setZone('tabs'); }
        updateLibraryFocus();
        if (contentStateDirty) {
          if (activeContainer()) {
            if (lifecycle && lifecycle.refreshContainerSummary) { lifecycle.refreshContainerSummary(); }
          } else if (!refreshDirtyCatalogWindow()) {
            reloadLibraryContent();
          }
        } else {
          pendingCatalogRefreshAnchor = null;
        }
        if (activeLibrary() && activeLibrary().globalPlaylists !== true && lifecycleSnapshot().continueAvailable === null) {
          probeContinue();
        }
        return true;
      }
      if (currentView() === 'watchlist') {
        activeMode = 'watchlist';
        libraryView = node('library-view');
        watchlistViewNode = node('watchlist-view');
        if (libraryView) { libraryView.className = 'library-view is-hidden'; }
        if (watchlistViewNode) { watchlistViewNode.className = 'watchlist-view'; }
        renderWatchlistGrid();
        if (watchlistSnapshot().loadedIdentity !== watchlistIdentity() && !watchlistSnapshot().loading) { loadWatchlist(false); }
        updateWatchlistFocus();
        return true;
      }
      return false;
    }

    function sameMemberSources(left, right) {
      var first = left || [];
      var second = right || [];
      var index;
      if (first.length !== second.length) { return false; }
      for (index = 0; index < first.length; index += 1) {
        if (String(first[index] || '') !== String(second[index] || '')) { return false; }
      }
      return true;
    }

    function sourceIdBelongsToMachine(sourceId, machineIdentifier) {
      var value = String(sourceId || '');
      var machine = String(machineIdentifier || '');
      return !!machine && value.indexOf(machine + '|') === 0;
    }

    function libraryUsesMachine(library, machineIdentifier) {
      var machine = String(machineIdentifier || '');
      if (!library || !machine) { return false; }
      return String(library.serverMachineIdentifier || '') === machine ||
        sourceIdBelongsToMachine(library.sourceId, machine) ||
        (library.memberSourceIds || []).some(function (sourceId) { return sourceIdBelongsToMachine(sourceId, machine); });
    }

    function invalidateNavigationCachesForMachine(items, machineIdentifier) {
      var affected = [];
      if (!controller || !controller.clearCached || !machineIdentifier) { return false; }
      (items || []).forEach(function (item) {
        if (!item || item.kind !== 'library' || !libraryUsesMachine(item, machineIdentifier)) { return; }
        controller.clearCached(item);
        affected.push({ library: item, sourceContext: { serverMachineIdentifier: item.serverMachineIdentifier || '' } });
      });
      if (affected.length) {
        if (tabPrefetch && tabPrefetch.invalidateLibraries) { tabPrefetch.invalidateLibraries(affected); }
        if (controller.cancelPrefetch) { controller.cancelPrefetch({ preserveSettled: true }); }
      }
      return affected.length > 0;
    }

    function reconcileNavigation(items, options) {
      var active;
      var activeSourceId;
      var activeMembers;
      var candidate = null;
      var candidateSourceId;
      var index;
      var invalidated = false;
      var members;
      var sameDefinition;
      var changedMachine = options && options.invalidateMachineIdentifier;
      var force = options && options.force === true;
      if (destroyed) { return false; }
      if (options && options.invalidateMachineIdentifier) {
        invalidated = invalidateNavigationCachesForMachine(items, options.invalidateMachineIdentifier);
      }
      if (force && watchlistView && watchlistView.reset) {
        watchlistView.reset();
        if (activeMode === 'watchlist' && currentView() === 'watchlist') { loadWatchlist(true); return true; }
        invalidated = true;
      }
      if (activeMode !== 'library') { return invalidated; }
      active = activeLibrary();
      if (!active || active.globalPlaylists === true) { return false; }
      activeSourceId = String(active.sourceId || '');
      activeMembers = active.memberSourceIds || [];
      items = items || [];
      for (index = 0; index < items.length; index += 1) {
        if (!items[index] || items[index].kind !== 'library') { continue; }
        candidateSourceId = String(items[index].sourceId || '');
        members = items[index].memberSourceIds || [];
        if (activeSourceId && candidateSourceId === activeSourceId) { candidate = items[index]; break; }
        if (items[index].virtualLibrary === true && activeSourceId && members.indexOf(activeSourceId) !== -1) { candidate = items[index]; break; }
        if (active.virtualLibrary === true && candidateSourceId && activeMembers.indexOf(candidateSourceId) !== -1) { candidate = items[index]; break; }
      }
      if (!candidate) { return invalidated; }
      sameDefinition = String(candidate.sourceId || '') === activeSourceId &&
        candidate.virtualLibrary === active.virtualLibrary &&
        sameMemberSources(candidate.memberSourceIds, active.memberSourceIds);
      if (sameDefinition && (!force || (changedMachine && !libraryUsesMachine(active, changedMachine) &&
          !libraryUsesMachine(candidate, changedMachine)))) { return invalidated; }
      discardTabWarmCache();
      if (tabPrefetch && tabPrefetch.invalidateLibraries) {
        tabPrefetch.invalidateLibraries([
          { library: active, sourceContext: activeSourceContext },
          { library: candidate, sourceContext: { serverMachineIdentifier: candidate.serverMachineIdentifier || '' } }
        ]);
      }
      if (controller && controller.clearCached) { controller.clearCached(active); controller.clearCached(candidate); }
      if (controller && controller.setActiveLibrary) { controller.setActiveLibrary(copyRecord(candidate)); }
      if (candidate.virtualLibrary === true) {
        activeSourceContext = null;
      } else if (options && options.invalidateMachineIdentifier &&
          (String(candidate.serverMachineIdentifier || '') === String(options.invalidateMachineIdentifier || '') ||
           sourceIdBelongsToMachine(candidate.sourceId, options.invalidateMachineIdentifier))) {
        activeSourceContext = sourceRouter.contextForItem(candidate, null);
      } else if (!activeSourceContext || String(activeSourceContext.sourceId || '') !== String(candidate.sourceId || '')) {
        activeSourceContext = null;
      }
      contentStateDirty = true;
      sourceDefinitionDirty = true;
      if (currentView() !== 'library') { return true; }
      renderLibraryGlobalHeader();
      renderLibrarySubnav();
      renderLibraryControls();
      updateLibraryManagementActions();
      if (activeContainer()) { return true; }
      if (candidate.virtualLibrary !== true && candidate.offline === true) {
        if (libraryState().zone === 'actions') { controller.setZone('tabs'); }
        updateLibraryFocus();
        return true;
      }
      loadLibraryContent(true, true);
      probeContinue();
      probeCollections();
      return true;
    }

    function reloadCurrent(force) {
      if (destroyed) { return false; }
      if (currentView() === 'library') {
        if (force !== false) { invalidateTabPrefetchForLibrary(activeLibrary(), activeSourceContext); }
        return force !== false ? reloadLibraryContent() : loadLibraryContent(false);
      }
      if (currentView() === 'watchlist') { loadWatchlist(force !== false); return true; }
      return false;
    }

    function resetContent() {
      if (destroyed) { return false; }
      cancelLibraryTabPreview(false);
      setWatchlistWarmPressure(false);
      cancelSourceResolution();
      activeSourceContext = null;
      cancelContainerRestore(false);
      pendingPlaybackProgress = null;
      pendingCatalogRefreshAnchor = null;
      contentStateDirty = false;
      sourceDefinitionDirty = false;
      generation += 1;
      activeMode = '';
      libraryTabCommittedIndex = null;
      invalidateAllLibraryTabPrefetch();
      if (controller && controller.resetContent) { controller.resetContent(); }
      else {
        if (controller && controller.cancelPrefetch) { controller.cancelPrefetch(); }
        if (gridView && gridView.reset) { gridView.reset(); }
        if (lifecycle && lifecycle.leave) { lifecycle.leave(); }
        if (filterView && filterView.dismiss) { filterView.dismiss(); }
        if (watchlistView && watchlistView.reset) { watchlistView.reset(); }
      }
      if (node('library-view')) { node('library-view').className = 'library-view is-hidden'; }
      if (node('watchlist-view')) { node('watchlist-view').className = 'watchlist-view is-hidden'; }
      if (shell.posterLoader && shell.posterLoader.cancelScope) {
        shell.posterLoader.cancelScope('library');
        shell.posterLoader.cancelScope('watchlist');
      }
      return true;
    }


    function watchlistProvider() { return watchlistView && watchlistView.getProvider ? watchlistView.getProvider() : null; }
    function ensureWatchlistProvider(callback) {
      if (destroyed || !watchlistView || !watchlistView.ensureProvider) { call(callback, new Error('Cloud search provider unavailable')); return null; }
      return watchlistView.ensureProvider(callback);
    }
    function findWatchlistLocal(key, machineIdentifier) { return watchlistView && watchlistView.findLocal ? watchlistView.findLocal(key, machineIdentifier) : null; }
    function toggleWatchlist(key, enabled, local, callback) {
      if (destroyed || !watchlistView || !watchlistView.toggle) { call(callback, new Error('Watchlist unavailable')); return false; }
      return watchlistView.toggle(key, enabled, local, callback);
    }

    /** @returns {PloffLibraryFeatureSnapshot} */
    function snapshot() {
      var library = copyRecord(libraryState()) || {};
      var grid = copyRecord(gridSnapshot()) || {};
      var lifecycleState = copyRecord(lifecycleSnapshot()) || {};
      var watchlistState = copyRecord(watchlistSnapshot()) || {};
      library.activeLibrary = copyRecord(activeLibrary());
      library.cacheKeys = (library.cacheKeys || []).slice();
      library.domCacheOrder = (library.domCacheOrder || []).slice();
      grid.items = copyRecords(grid.items);
      grid.recommendations = copyRecords(grid.recommendations);
      grid.focus = copyRecord(grid.focus);
      grid.layout = copyRecord(grid.layout);
      lifecycleState.container = copyRecord(lifecycleState.container);
      lifecycleState.summary = copyRecord(lifecycleState.summary);
      watchlistState.items = copyRecords(watchlistState.items);
      watchlistState.focus = copyRecord(watchlistState.focus);
      watchlistState.provider = copyRecord(watchlistState.provider);
      return {
        mode: activeMode,
        sourceId: activeSourceContext ? String(activeSourceContext.sourceId || '') : '',
        library: library,
        grid: grid,
        lifecycle: lifecycleState,
        watchlist: watchlistState,
        destroyed: destroyed,
        generation: generation
      };
    }

    function destroyOne(value) {
      if (value && typeof value.destroy === 'function') { value.destroy(); }
    }

    function destroy() {
      if (destroyed) { return; }
      cancelLibraryTabPreview(false);
      setWatchlistWarmPressure(false);
      clearTabWarmCache();
      cancelSourceResolution();
      activeSourceContext = null;
      cancelContainerRestore(false);
      pendingPlaybackProgress = null;
      pendingCatalogRefreshAnchor = null;
      destroyed = true;
      generation += 1;
      activeMode = '';
      if (scrollTarget && scrollHandler && scrollTarget.removeEventListener) {
        scrollTarget.removeEventListener('scroll', scrollHandler, false);
      }
      if (watchlistScrollTarget && watchlistScrollHandler && watchlistScrollTarget.removeEventListener) {
        watchlistScrollTarget.removeEventListener('scroll', watchlistScrollHandler, false);
      }
      if (libraryViewTarget && libraryViewFocusHandler && libraryViewTarget.removeEventListener) {
        libraryViewTarget.removeEventListener('focus', libraryViewFocusHandler, true);
      }
      scrollTarget = null;
      scrollHandler = null;
      libraryViewTarget = null;
      libraryViewFocusHandler = null;
      watchlistScrollTarget = null;
      watchlistScrollHandler = null;
      if (controller && controller.destroy) { controller.destroy(); }
      else {
        if (controller && controller.cancelPrefetch) { controller.cancelPrefetch(); }
        if (controller && controller.cancelWheelNavigation) { controller.cancelWheelNavigation(); }
        if (gridView && gridView.reset) { gridView.reset(); }
        if (lifecycle && lifecycle.leave) { lifecycle.leave(); }
        if (filterView && filterView.dismiss) { filterView.dismiss(); }
        if (watchlistView && watchlistView.leave) { watchlistView.leave(); }
        if (watchlistView && watchlistView.cancel) { watchlistView.cancel(); }
      }
      destroyOne(filterView);
      destroyOne(gridView);
      destroyOne(lifecycle);
      destroyOne(watchlistView);
      destroyOne(tabPrefetch);
      if (shell.posterLoader && shell.posterLoader.cancelScope) {
        shell.posterLoader.cancelScope('library');
        shell.posterLoader.cancelScope('watchlist');
      }
    }

    if (!LibraryController || !LibraryController.create || !LibraryContainers || !LibraryFilterView || !LibraryGridView ||
        !NavigationModel || typeof NavigationModel.createPreviewScheduler !== 'function' ||
        !LibraryLifecycle || !PlaybackQueueModel || !WatchlistView || !PlexClient || !WatchlistClient) {
      throw new Error('LibraryFeatureController dependencies are unavailable');
    }

    libraryTabPreviewScheduler = NavigationModel.createPreviewScheduler(timerRoot, NavigationModel.PREVIEW_DELAY_MS, applyLibraryTabPreview);
    controller = constructController();
    constructFilterView();
    constructGridView();
    constructTabPrefetch();
    constructLifecycle();
    constructWatchlistView();
    if (controller.bindViews) { controller.bindViews({ grid: gridView, lifecycle: lifecycle, filter: filterView, watchlist: watchlistView }); }
    bindEvents();

    return {
      activeContainer: function () { return copyRecord(activeContainer()); },
      activeLibrary: function () { return copyRecord(activeLibrary()); },
      cancelPendingEntry: cancelSourceResolution,
      destroy: destroy,
      ensureWatchlistProvider: ensureWatchlistProvider,
      enterActiveContent: enterActiveContent,
      enterLibrary: enterLibrary,
      enterPlaylists: enterPlaylists,
      enterWatchlist: enterWatchlist,
      findWatchlistLocal: findWatchlistLocal,
      focusNavigation: focusNavigation,
      focusedItem: focusedItem,
      handleKey: handleKey,
      hidePresentation: hidePresentation,
      leave: leave,
      loadWatchlist: loadWatchlist,
      matchesNavigation: matchesNavigation,
      navigationHasFocus: navigationHasFocus,
      onWheelNavigation: onWheelNavigation,
      playbackContext: playbackContext,
      pointerFocus: pointerFocus,
      probeContinue: probeContinue,
      reconcileContentMutation: reconcileContentMutation,
      reconcileWatchedState: reconcileWatchedState,
      recoverPresentation: recoverPresentation,
      refreshPresentation: refreshPresentation,
      reloadCurrent: reloadCurrent,
      resetContent: resetContent,
      restorePageFocus: restorePageFocus,
      restoreContainerOrigin: restoreContainerOrigin,
      reconcilePlaybackProgress: reconcilePlaybackProgress,
      reconcileNavigation: reconcileNavigation,
      scheduleAdjacentPrefetch: scheduleAdjacentPrefetch,
      warmWatchlist: warmWatchlist,
      snapshot: snapshot,
      sourceContext: function () { return copyRecord(activeSourceContext); },
      toggleWatchlist: toggleWatchlist,
      translateStatic: translateStatic,
      watchlistProvider: watchlistProvider,
      watchlistSnapshot: watchlistSnapshot
    };
  }

  return { create: create };
}));
