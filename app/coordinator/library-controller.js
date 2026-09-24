(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffLibraryController = factory(); }
}(this, function () {
  'use strict';

  var BACK_COOLDOWN_MS = 300;

  function create(options) {
    var values = options || {};
    var platformRoot = values.root || {};
    var containers = values.LibraryContainers;
    var mode = 'library';
    var activeLibrary = null;
    var tabIndex = 0;
    var pointerTabIndex = null;
    var zone = 'tabs';
    var controlIndex = 0;
    var actionIndex = 0;
    var sort = 'titleSort';
    var sortDirection = 'asc';
    var watchedFilter = 'all';
    var refreshPending = false;
    var refreshGeneration = 0;
    var refreshLibraryKey = '';
    var backLockedUntil = 0;
    var cache = {};
    var cacheSourceDefinitions = {};
    var cacheOrder = [];
    var domCacheOrder = [];
    var maxCachedLibraries = Math.max(1, Number(values.maxCachedLibraries || 8));
    var maxCachedCards = Math.max(1, Number(values.maxCachedCards || 6000));
    var prefetchTimer = null;
    var prefetchQueue = [];
    var prefetchActive = false;
    var prefetchAnchor = -1;
    var prefetchRequest = null;
    var prefetchGeneration = 0;
    var prefetchWorkActive = false;
    var prefetchSettledCallbacks = [];
    var wheelScrollTimer = null;
    var wheelNavigationActive = false;
    var grid = null;
    var lifecycle = null;
    var filter = null;
    var watchlist = null;
    var destroyed = false;

    function call(callback, arg1, arg2, arg3, arg4, arg5, arg6) {
      if (typeof callback === 'function') { return callback(arg1, arg2, arg3, arg4, arg5, arg6); }
      return undefined;
    }

    function keyFor(library) { return String(library && (library.sourceId || library.key || library.title) || ''); }
    function sourceDefinitionFor(library) {
      var members = library && Object.prototype.toString.call(library.memberSourceIds) === '[object Array]' ? library.memberSourceIds : [];
      return (library && library.virtualLibrary === true ? 'virtual' : 'single') + '|' + keyFor(library) + '|' + members.map(function (sourceId) {
        return String(sourceId || '');
      }).join(',');
    }
    function actionsAvailable() { return !activeLibrary || call(values.actionsAvailable, activeLibrary) !== false; }

    function currentViewKey() {
      return activeLibrary && activeLibrary.globalPlaylists ? 'playlists' : containers.views()[tabIndex];
    }

    function usesGridScroll() {
      return currentViewKey() === 'catalog' || currentViewKey() === 'collections' ||
        currentViewKey() === 'playlists' || !!(lifecycle && lifecycle.snapshot && lifecycle.snapshot().hasContainer);
    }

    function bindViews(next) {
      next = next || {};
      if (next.grid) { grid = next.grid; }
      if (next.lifecycle) { lifecycle = next.lifecycle; }
      if (next.filter) { filter = next.filter; }
      if (next.watchlist) { watchlist = next.watchlist; }
      return snapshot();
    }

    function gridNavigationSnapshot() {
      var current;
      if (grid && grid.navigationSnapshot) { return grid.navigationSnapshot(); }
      current = grid && grid.snapshot ? grid.snapshot() : { items: [], recommendations: [], totalSize: 0, focus: { index: 0 }, layout: { columns: 1 } };
      return {
        itemCount: (current.items || []).length,
        recommendationItemCount: (current.recommendations || []).reduce(function (count, row) { return count + (row && row.items || []).length; }, 0),
        totalSize: Number(current.totalSize || 0),
        focus: current.focus || { index: 0 },
        layout: current.layout || { columns: 1 }
      };
    }

    function touchDomCache(key) {
      var index = domCacheOrder.indexOf(key);
      var evicted;
      if (index !== -1) { domCacheOrder.splice(index, 1); }
      domCacheOrder.push(key);
      while (domCacheOrder.length > 5) {
        evicted = domCacheOrder.shift();
        if (cache[evicted]) { cache[evicted].dom = null; }
      }
    }

    function cacheCardCount(saved) {
      var savedGrid = saved && saved.grid || {};
      var count = (savedGrid.items || []).length;
      (savedGrid.recommendations || []).forEach(function (row) { count += (row && row.items || []).length; });
      return count;
    }

    function retainedCardCount() {
      return Object.keys(cache).reduce(function (count, key) { return count + cacheCardCount(cache[key]); }, 0);
    }

    function removeCachedKey(key) {
      var index = cacheOrder.indexOf(key);
      var domIndex = domCacheOrder.indexOf(key);
      if (index !== -1) { cacheOrder.splice(index, 1); }
      if (domIndex !== -1) { domCacheOrder.splice(domIndex, 1); }
      delete cache[key];
      delete cacheSourceDefinitions[key];
    }

    function touchCached(key) {
      var index = cacheOrder.indexOf(key);
      if (index !== -1) { cacheOrder.splice(index, 1); }
      cacheOrder.push(key);
    }

    function putCached(library, saved) {
      var key = keyFor(library);
      var domIndex;
      if (!key || !saved) { return; }
      cache[key] = saved;
      cacheSourceDefinitions[key] = sourceDefinitionFor(library);
      touchCached(key);
      if (saved.dom) { touchDomCache(key); }
      else {
        domIndex = domCacheOrder.indexOf(key);
        if (domIndex !== -1) { domCacheOrder.splice(domIndex, 1); }
      }
      while (cacheOrder.length > maxCachedLibraries ||
          (cacheOrder.length > 1 && retainedCardCount() > maxCachedCards)) {
        removeCachedKey(cacheOrder[0]);
      }
    }

    function cached(library) {
      var key = keyFor(library);
      if (!cache[key]) { return null; }
      if (cacheSourceDefinitions[key] !== sourceDefinitionFor(library)) {
        clearCached(library);
        return null;
      }
      touchCached(key);
      return cache[key];
    }

    function clearCached(library) {
      removeCachedKey(keyFor(library));
    }

    function clearAllCached() {
      cancelPrefetch();
      cache = {};
      cacheSourceDefinitions = {};
      cacheOrder = [];
      domCacheOrder = [];
      return true;
    }

    function cancelWheelNavigation() {
      if (wheelScrollTimer !== null && platformRoot.clearTimeout) { platformRoot.clearTimeout(wheelScrollTimer); }
      wheelScrollTimer = null;
      wheelNavigationActive = false;
    }

    function beginWheelNavigation(duration) {
      cancelWheelNavigation();
      wheelNavigationActive = true;
      if (platformRoot.setTimeout) {
        wheelScrollTimer = platformRoot.setTimeout(function () {
          wheelScrollTimer = null;
          wheelNavigationActive = false;
        }, Math.max(0, Number(duration || 350)));
      }
      return wheelNavigationActive;
    }

    function setPrefetchWorkActive(active) {
      var next = active === true;
      if (prefetchWorkActive === next) { return; }
      prefetchWorkActive = next;
      call(values.onPrefetchWorkChange, next);
    }

    function flushPrefetchSettled() {
      var callbacks = prefetchSettledCallbacks.slice();
      var index;
      prefetchSettledCallbacks = [];
      for (index = 0; index < callbacks.length; index += 1) { call(callbacks[index]); }
    }

    function cancelPrefetch(options) {
      var preserveSettled = options && options.preserveSettled === true;
      prefetchGeneration += 1;
      if (prefetchTimer !== null) {
        if (platformRoot.cancelIdleCallback) { platformRoot.cancelIdleCallback(prefetchTimer); }
        if (platformRoot.clearTimeout) { platformRoot.clearTimeout(prefetchTimer); }
      }
      if (prefetchRequest && prefetchRequest.abort) { prefetchRequest.abort(); }
      call(values.cancelPrefetchWarm);
      prefetchTimer = null;
      prefetchRequest = null;
      prefetchQueue = [];
      prefetchActive = false;
      setPrefetchWorkActive(false);
      if (!preserveSettled) { flushPrefetchSettled(); }
    }

    function runPrefetch() {
      var library;
      var key;
      var requestGeneration;
      prefetchTimer = null;
      if (destroyed || prefetchActive || !prefetchQueue.length) { return; }
      if (call(values.isBusy) === true) {
        schedulePrefetch(call(values.navigationIndex), call(values.navigationItems));
        return;
      }
      library = prefetchQueue.shift();
      key = keyFor(library);
      if (!key || cached(library) || (activeLibrary && keyFor(activeLibrary) === key)) {
        schedulePrefetch(call(values.navigationIndex), call(values.navigationItems));
        return;
      }
      prefetchActive = true;
      setPrefetchWorkActive(true);
      requestGeneration = prefetchGeneration;
      prefetchRequest = call(values.loadRecommendations, library, function (error, rows) {
        var saved;
        var warmReturned = false;
        var warmSettled = false;
        var warmStarted;
        function finishItem() {
          if (destroyed || requestGeneration !== prefetchGeneration || !prefetchActive) { return; }
          if (saved && saved.dom && cached(library) === saved) { touchDomCache(key); }
          prefetchActive = false;
          schedulePrefetch(call(values.navigationIndex), call(values.navigationItems));
          if (!prefetchActive && !prefetchQueue.length && prefetchTimer === null) {
            setPrefetchWorkActive(false);
            flushPrefetchSettled();
          }
        }
        function finishWarm() {
          if (warmSettled) { return; }
          warmSettled = true;
          if (warmReturned) { finishItem(); }
        }
        if (destroyed || requestGeneration !== prefetchGeneration) { return; }
        prefetchRequest = null;
        if (!error && !cached(library) && (!activeLibrary || keyFor(activeLibrary) !== key)) {
          saved = call(values.buildPrefetchedState, library, rows || []);
          if (saved) {
            putCached(library, saved);
            if (typeof values.warmPrefetch === 'function') {
              warmStarted = call(values.warmPrefetch, library, rows || [], saved, finishWarm);
              warmReturned = true;
              if (warmStarted !== false && !warmSettled) { return; }
              finishItem();
              return;
            }
          }
        }
        finishItem();
      });
      call(values.trackPrefetchRequest, prefetchRequest);
    }

    function schedulePrefetch(navIndex, navigationItems, options) {
      var candidates = [];
      var scheduleDelay;
      var immediate;
      var distance;
      var indexes;
      var item;
      var key;
      var schedule;
      options = options || {};
      if (typeof options.onSettled === 'function') { prefetchSettledCallbacks.push(options.onSettled); }
      if (destroyed) { flushPrefetchSettled(); return; }
      immediate = options.immediate === true;
      scheduleDelay = Math.max(0, Number(options.delay || 0));
      navIndex = Number(navIndex || 0);
      navigationItems = navigationItems || [];
      if (prefetchAnchor !== navIndex) {
        prefetchAnchor = navIndex;
        prefetchQueue = [];
      }
      if (immediate && prefetchTimer !== null && !prefetchActive) {
        if (platformRoot.cancelIdleCallback) { platformRoot.cancelIdleCallback(prefetchTimer); }
        if (platformRoot.clearTimeout) { platformRoot.clearTimeout(prefetchTimer); }
        prefetchTimer = null;
        prefetchQueue = [];
      }
      if (immediate && prefetchActive) {
        prefetchQueue = [];
        return;
      }
      if (prefetchTimer !== null || prefetchActive) { return; }
      if (!prefetchQueue.length) {
        for (distance = 1; distance < navigationItems.length && candidates.length < 2; distance += 1) {
          indexes = [navIndex - distance, navIndex + distance];
          indexes.forEach(function (index) {
            item = navigationItems[index];
            key = keyFor(item);
            if (candidates.length < 2 && item && item.kind === 'library' && key &&
                !cached(item) && (!activeLibrary || keyFor(activeLibrary) !== key) && candidates.indexOf(item) === -1) {
              candidates.push(item);
            }
          });
        }
        prefetchQueue = candidates;
      }
      if (!prefetchQueue.length) {
        setPrefetchWorkActive(false);
        flushPrefetchSettled();
        return;
      }
      schedule = function () { prefetchTimer = null; runPrefetch(); };
      if (immediate && platformRoot.setTimeout) { prefetchTimer = platformRoot.setTimeout(schedule, 0); }
      else if (scheduleDelay > 0 && platformRoot.setTimeout) { prefetchTimer = platformRoot.setTimeout(schedule, scheduleDelay); }
      else if (platformRoot.requestIdleCallback) { prefetchTimer = platformRoot.requestIdleCallback(schedule, { timeout: 400 }); }
      else if (platformRoot.setTimeout) { prefetchTimer = platformRoot.setTimeout(schedule, 100); }
    }

    function prepareLibrary(library, keepNavigationFocus) {
      var saved = cached(library);
      var nextLibraryKey = keyFor(library);
      if (refreshPending && refreshLibraryKey && refreshLibraryKey !== nextLibraryKey) { invalidateRefresh(); }
      activeLibrary = library || null;
      if (lifecycle && lifecycle.prepareLibrary) { lifecycle.prepareLibrary(); }
      if (saved) {
        tabIndex = Number(saved.tabIndex || 0);
        zone = keepNavigationFocus ? 'nav' : String(saved.zone || 'tabs');
        controlIndex = Number(saved.controlIndex || 0);
        actionIndex = Number(saved.actionIndex || 0);
        sort = String(saved.sort || 'titleSort');
        sortDirection = saved.sortDirection === 'desc' ? 'desc' : 'asc';
        watchedFilter = String(saved.watchedFilter || 'all');
        if (filter && filter.setActiveFilters) { filter.setActiveFilters(saved.filters || {}); }
        if (lifecycle && lifecycle.setContinueAvailable) { lifecycle.setContinueAvailable(saved.continueAvailable); }
        if (lifecycle && lifecycle.setCollectionsAvailable) { lifecycle.setCollectionsAvailable(saved.collectionsAvailable); }
        if (lifecycle && lifecycle.setNextStart) { lifecycle.setNextStart(saved.nextStart); }
      } else {
        tabIndex = 0;
        zone = keepNavigationFocus ? 'nav' : (library && library.globalPlaylists ? 'grid' : 'tabs');
        controlIndex = 0;
        actionIndex = 0;
        sort = 'titleSort';
        sortDirection = 'asc';
        watchedFilter = 'all';
        if (filter && filter.setActiveFilters) { filter.setActiveFilters({}); }
      }
      return saved;
    }

    function enterLibrary(library, options) {
      options = options || {};
      if (destroyed || !library) { return snapshot(); }
      mode = library.globalPlaylists ? 'playlists' : 'library';
      prepareLibrary(library, options.keepNavigationFocus === true);
      call(values.onEnterLibrary, library, options, cached(library));
      return snapshot();
    }

    function enterWatchlist(options) {
      options = options || {};
      if (destroyed) { return snapshot(); }
      mode = 'watchlist';
      activeLibrary = null;
      call(values.onEnterWatchlist, options);
      if (watchlist && watchlist.open) { watchlist.open(options.keepNavigationFocus === true); }
      if (watchlist && watchlist.load) { watchlist.load(false); }
      return snapshot();
    }

    function enterPlaylists(options) {
      options = options || {};
      return enterLibrary({ key: 'playlists', title: call(values.playlistsTitle) || 'Playlists', globalPlaylists: true }, options);
    }

    function cacheCurrent(saved) { if (activeLibrary) { putCached(activeLibrary, saved); } }

    function leave() {
      cancelWheelNavigation();
      if (mode === 'watchlist' && watchlist && watchlist.leave) { watchlist.leave(); }
      if (mode !== 'watchlist' && lifecycle && lifecycle.leave) { lifecycle.leave(); }
      if (filter && filter.dismiss) { filter.dismiss(); }
      call(values.onLeave, snapshot());
      return snapshot();
    }

    function setZone(next, index) {
      zone = String(next || 'tabs');
      if (zone === 'actions' && index !== undefined) { actionIndex = Math.max(0, Number(index) || 0); }
      else if ((zone === 'sort' || zone === 'filter') && index !== undefined) { controlIndex = Math.max(0, Number(index) || 0); }
      return zone;
    }
    function setTabIndex(next) { tabIndex = Math.max(0, Math.min(containers.views().length - 1, Number(next) || 0)); return tabIndex; }
    function setControlIndex(next) { controlIndex = Math.max(0, Number(next) || 0); return controlIndex; }
    function setActionIndex(next) { actionIndex = Math.max(0, Number(next) || 0); return actionIndex; }
    function setWatchedFilter(next) { watchedFilter = String(next || 'all'); return watchedFilter; }
    function setRefreshPending(next) { refreshPending = next === true; call(values.onRefreshPending, refreshPending); return refreshPending; }

    function activateSort(key) {
      if (sort === key) { sortDirection = sortDirection === 'asc' ? 'desc' : 'asc'; }
      else { sort = key; sortDirection = key === 'titleSort' ? 'asc' : 'desc'; }
      call(values.onQueryChange, snapshot());
      return snapshot();
    }

    function activateFilter(key) {
      var filters;
      if (watchedFilter === key) { return snapshot(); }
      watchedFilter = key;
      filters = filter && filter.filters ? filter.filters() : {};
      filters.watched = key === 'all' ? '' : key;
      if (filter && filter.setActiveFilters) { filter.setActiveFilters(filters); }
      call(values.onQueryChange, snapshot());
      return snapshot();
    }

    function invalidateRefresh() {
      refreshGeneration += 1;
      refreshLibraryKey = '';
      if (refreshPending) { setRefreshPending(false); }
    }

    function finishRefresh(requestGeneration, ownerKey, error) {
      if (destroyed || requestGeneration !== refreshGeneration || refreshLibraryKey !== ownerKey) { return; }
      refreshLibraryKey = '';
      setRefreshPending(false);
      if (error) { call(values.onRefreshError, error); }
      else { call(values.onRefreshComplete, snapshot()); }
    }

    function waitForRefresh(requestGeneration, ownerKey, error, activityId) {
      if (error) { finishRefresh(requestGeneration, ownerKey, error); return; }
      if (activityId && typeof values.waitForActivity === 'function') {
        call(values.waitForActivity, activityId, function (waitError) { finishRefresh(requestGeneration, ownerKey, waitError || null); });
      } else { finishRefresh(requestGeneration, ownerKey, null); }
    }

    function refresh(kind) {
      var loader;
      var library;
      var ownerKey;
      var requestGeneration;
      if (destroyed || !activeLibrary || refreshPending || !actionsAvailable()) { return false; }
      loader = kind === 'metadata' ? values.refreshMetadata : values.refreshLibrary;
      if (typeof loader !== 'function') { return false; }
      library = activeLibrary;
      ownerKey = keyFor(library);
      refreshGeneration += 1;
      requestGeneration = refreshGeneration;
      refreshLibraryKey = ownerKey;
      setRefreshPending(true);
      call(values.onRefreshStart, kind, snapshot());
      call(loader, library, function (error, activityId) { waitForRefresh(requestGeneration, ownerKey, error, activityId); });
      return true;
    }

    function parentZone() {
      if (zone === 'grid') {
        if (activeLibrary && activeLibrary.globalPlaylists) { return 'nav'; }
        return currentViewKey() === 'catalog' ? 'filter' : 'tabs';
      }
      if (zone === 'sort' || zone === 'filter' || zone === 'actions') { return 'tabs'; }
      if (zone === 'tabs') { return 'nav'; }
      return '';
    }

    function handleBack() {
      var currentTime = call(values.now) || new Date().getTime();
      var nextZone;
      var resetCatalogFocus;
      if (lifecycle && lifecycle.closeContainer && lifecycle.closeContainer()) {
        backLockedUntil = currentTime + BACK_COOLDOWN_MS;
        call(values.updateFocus);
        return true;
      }
      if (currentTime < backLockedUntil) { return true; }
      if (zone === 'tabs') { call(values.cancelTabPreview, true); }
      if (zone === 'nav') { call(values.closeLibrary); return true; }
      nextZone = parentZone();
      if (!nextZone) { call(values.closeLibrary); return true; }
      resetCatalogFocus = zone === 'grid' && currentViewKey() === 'catalog';
      zone = nextZone;
      if (zone === 'filter') { controlIndex = Math.max(0, ['all', 'unwatched', 'watched'].indexOf(watchedFilter)); }
      backLockedUntil = currentTime + BACK_COOLDOWN_MS;
      call(values.scrollTop, 0);
      if (resetCatalogFocus && grid && grid.focusCatalog) { grid.focusCatalog(0); }
      call(values.updateFocus);
      return true;
    }

    function handleNavKey(keyCode, direction) {
      if (direction === 'left' || direction === 'right') {
        call(values.moveNavigation, direction);
        call(values.updateFocus);
      } else if (direction === 'down') {
        zone = activeLibrary && activeLibrary.globalPlaylists ? 'grid' : 'tabs';
        call(values.updateFocus);
      } else if (keyCode === 13) {
        call(values.activateNavigation);
      }
      return { handled: true };
    }

    function handleTabsKey(keyCode, direction) {
      var next;
      var previous;
      if (direction === 'up') {
        call(values.cancelTabPreview, true);
        zone = 'nav';
        call(values.updateFocus);
      } else if (direction === 'left' || direction === 'right') {
        if (direction === 'right' && tabIndex === containers.views().length - 1) {
          if (actionsAvailable()) { call(values.cancelTabPreview, true); zone = 'actions'; actionIndex = 0; }
          call(values.updateFocus);
        } else {
          next = typeof values.nextTab === 'function'
            ? call(values.nextTab, direction === 'left' ? -1 : 1)
            : Math.max(0, Math.min(containers.views().length - 1, tabIndex + (direction === 'left' ? -1 : 1)));
          if (direction === 'right' && next === tabIndex) {
            if (actionsAvailable()) { call(values.cancelTabPreview, true); zone = 'actions'; actionIndex = 0; }
            call(values.updateFocus);
          } else if (next !== undefined && next !== tabIndex) {
            previous = tabIndex;
            tabIndex = next;
            if (typeof values.scheduleTabPreview === 'function') {
              call(values.onTabFocus, next, previous);
              call(values.scheduleTabPreview, next, previous);
            } else {
              call(values.selectTab, next);
            }
          }
        }
      } else if (direction === 'down') {
        call(values.commitTabPreview);
        call(values.focusTabContent);
      } else if (keyCode === 13) {
        if (pointerTabIndex !== null) {
          setTabIndex(pointerTabIndex);
          pointerTabIndex = null;
        }
        call(values.cancelTabPreview, false);
        call(values.selectTab, tabIndex);
      }
      return { handled: true };
    }

    function handleActionsKey(keyCode, direction) {
      if (direction === 'left') {
        if (actionIndex > 0) { actionIndex -= 1; }
        else { zone = 'tabs'; }
        call(values.updateFocus);
      } else if (direction === 'right') {
        actionIndex = Math.min(1, actionIndex + 1);
        call(values.updateFocus);
      } else if (direction === 'up') {
        zone = 'nav';
        call(values.updateFocus);
      } else if (direction === 'down') {
        zone = currentViewKey() === 'catalog' ? 'filter' : 'grid';
        controlIndex = 0;
        call(values.updateFocus);
      } else if (keyCode === 13) {
        refresh(actionIndex === 0 ? 'library' : 'metadata');
      }
      return { handled: true };
    }

    function handleSortKey(keyCode, direction) {
      var next;
      var gridSnapshot = gridNavigationSnapshot();
      if (direction === 'left' || direction === 'right') {
        next = containers.moveControl('sort', controlIndex, direction);
        zone = next.zone;
        controlIndex = next.index;
        call(values.updateFocus);
      } else if (direction === 'up' || direction === 'down') {
        next = containers.moveControlVertical('sort', direction);
        if (next.zone !== 'grid' || gridSnapshot.itemCount) {
          zone = next.zone;
          call(values.updateFocus);
        }
      } else if (keyCode === 13) {
        activateSort(['titleSort', 'audienceRating', 'year'][controlIndex]);
      }
      return { handled: true };
    }

    function handleFilterKey(keyCode, direction) {
      var next;
      var gridSnapshot = gridNavigationSnapshot();
      if (direction === 'left' || direction === 'right') {
        next = containers.moveControl('filter', controlIndex, direction);
        zone = next.zone;
        controlIndex = next.index;
        call(values.updateFocus);
      } else if (direction === 'up') {
        zone = actionsAvailable() ? 'actions' : 'tabs';
        actionIndex = 0;
        call(values.updateFocus);
      } else if (direction === 'down') {
        next = containers.moveControlVertical('filter', direction);
        if (next.zone !== 'grid' || gridSnapshot.itemCount) {
          zone = next.zone;
          call(values.updateFocus);
        }
      } else if (keyCode === 13) {
        if (controlIndex === 3) { call(values.openFilter); }
        else { activateFilter(['all', 'unwatched', 'watched'][controlIndex]); }
      }
      return { handled: true };
    }

    function handleRecommendedGridKey(keyCode, direction) {
      var next = grid && grid.handleDirection ? grid.handleDirection(direction) : {};
      if (next && next.leave) {
        zone = 'tabs';
        call(values.updateFocus);
      } else if (keyCode === 13 && grid && grid.focusedItem && grid.focusedItem()) {
        call(values.openItem, grid.focusedItem());
      }
      return { handled: true };
    }

    function handleGridKey(keyCode, direction) {
      var next;
      var item;
      var gridSnapshot;
      if (currentViewKey() === 'recommended') {
        return handleRecommendedGridKey(keyCode, direction);
      }
      next = grid && grid.handleDirection ? grid.handleDirection(direction) : {};
      if (next && next.leave) {
        zone = activeLibrary && activeLibrary.globalPlaylists ? 'nav' : (currentViewKey() === 'catalog' ? 'filter' : 'tabs');
        controlIndex = ['all', 'unwatched', 'watched'].indexOf(watchedFilter);
        call(values.updateFocus);
      } else if (keyCode === 13 && grid && grid.focusedItem && grid.focusedItem()) {
        item = grid.focusedItem();
        if (item.containerKey) { call(values.openContainer, item); }
        else { call(values.openItem, item); }
        call(values.updateFocus);
      } else if (!next || next.moved !== true) {
        call(values.updateFocus);
      }
      gridSnapshot = gridNavigationSnapshot();
      if ((!next || !next.leave) && usesGridScroll() && gridSnapshot.itemCount < gridSnapshot.totalSize &&
          gridSnapshot.focus.index >= gridSnapshot.itemCount - gridSnapshot.layout.columns * 2) {
        call(values.loadMore);
      }
      return { handled: true };
    }

    function handleKey(event, direction) {
      var item;
      var keyCode = Number(event && event.keyCode);
      if (destroyed) { return { handled: false }; }
      if (keyCode !== 13 || zone !== 'tabs') { pointerTabIndex = null; }
      if (event && event.preventDefault) { event.preventDefault(); }
      if (filter && filter.isOpen && filter.isOpen()) {
        filter.handleKeyDown(event, direction);
        return { handled: true };
      }
      if (keyCode === 27 || keyCode === 461) {
        handleBack();
        return { handled: true };
      }
      if (keyCode === 415 && zone === 'grid') {
        item = grid && grid.focusedItem ? grid.focusedItem() : null;
        if (item && !item.containerKey) { call(values.playItem, item); }
        return { handled: true };
      }
      if (zone === 'nav') { return handleNavKey(keyCode, direction); }
      if (zone === 'tabs') { return handleTabsKey(keyCode, direction); }
      if (zone === 'actions') { return handleActionsKey(keyCode, direction); }
      if (zone === 'sort') { return handleSortKey(keyCode, direction); }
      if (zone === 'filter') { return handleFilterKey(keyCode, direction); }
      return handleGridKey(keyCode, direction);
    }

    function pointerFocus(target, index, element) {
      if (destroyed) { return snapshot(); }
      if (target !== 'tabs') { pointerTabIndex = null; call(values.cancelTabPreview, true); }
      else { call(values.cancelTabPreview, true); }
      if (target === 'nav') { zone = 'nav'; call(values.setNavigationIndex, index); }
      else if (target === 'tabs') { zone = 'tabs'; pointerTabIndex = Number(index); if (element) { call(values.pointerVisualFocus, element); } }
      else if (target === 'actions' && actionsAvailable()) { zone = 'actions'; setActionIndex(index); }
      else if (target === 'sort' || target === 'filter') { zone = target; setControlIndex(index); }
      else if (target === 'grid') {
        zone = 'grid';
        if (grid && grid.pointerFocus && element) { grid.pointerFocus(element); }
      }
      if (!(target === 'tabs' && element)) { call(values.updateFocus); }
      return snapshot();
    }

    function snapshot() {
      return {
        mode: mode,
        activeLibrary: activeLibrary,
        tabIndex: tabIndex,
        zone: zone,
        controlIndex: controlIndex,
        actionIndex: actionIndex,
        sort: sort,
        sortDirection: sortDirection,
        watchedFilter: watchedFilter,
        refreshPending: refreshPending,
        backLockedUntil: backLockedUntil,
        viewKey: currentViewKey(),
        usesGridScroll: usesGridScroll(),
        cacheKeys: Object.keys(cache),
        domCacheOrder: domCacheOrder.slice(),
        prefetchQueueLength: prefetchQueue.length,
        prefetchActive: prefetchActive,
        wheelNavigationActive: wheelNavigationActive,
        destroyed: destroyed
      };
    }

    function resetContent() {
      if (destroyed) { return false; }
      cancelPrefetch();
      cancelWheelNavigation();
      cache = {};
      cacheSourceDefinitions = {};
      cacheOrder = [];
      domCacheOrder = [];
      mode = 'library';
      activeLibrary = null;
      tabIndex = 0;
      pointerTabIndex = null;
      zone = 'tabs';
      controlIndex = 0;
      actionIndex = 0;
      sort = 'titleSort';
      sortDirection = 'asc';
      watchedFilter = 'all';
      invalidateRefresh();
      backLockedUntil = 0;
      if (grid && grid.reset) { grid.reset(); }
      if (lifecycle && lifecycle.leave) { lifecycle.leave(); }
      if (filter && filter.dismiss) { filter.dismiss(); }
      if (watchlist && watchlist.reset) { watchlist.reset(); }
      else if (watchlist && watchlist.leave) { watchlist.leave(); }
      return true;
    }

    function destroy() {
      if (destroyed) { return; }
      destroyed = true;
      cancelPrefetch();
      cancelWheelNavigation();
      if (grid && grid.reset) { grid.reset(); }
      if (lifecycle && lifecycle.leave) { lifecycle.leave(); }
      if (filter && filter.dismiss) { filter.dismiss(); }
      if (watchlist && watchlist.leave) { watchlist.leave(); }
    }

    return {
      activeLibrary: function () { return activeLibrary; },
      beginWheelNavigation: beginWheelNavigation,
      bindViews: bindViews,
      cacheCurrent: cacheCurrent,
      cached: cached,
      cancelPrefetch: cancelPrefetch,
      cancelWheelNavigation: cancelWheelNavigation,
      clearAllCached: clearAllCached,
      clearCached: clearCached,
      destroy: destroy,
      enterLibrary: enterLibrary,
      enterPlaylists: enterPlaylists,
      enterWatchlist: enterWatchlist,
      filter: function () { return filter; },
      grid: function () { return grid; },
      handleBack: handleBack,
      handleKey: handleKey,
      isWheelNavigationActive: function () { return wheelNavigationActive; },
      leave: leave,
      lifecycle: function () { return lifecycle; },
      pointerFocus: pointerFocus,
      refresh: refresh,
      resetContent: resetContent,
      scheduleAdjacentPrefetch: schedulePrefetch,
      setActiveLibrary: function (library) { activeLibrary = library || null; },
      setControlIndex: setControlIndex,
      setTabIndex: setTabIndex,
      setWatchedFilter: setWatchedFilter,
      setZone: setZone,
      snapshot: snapshot,
      touchDomCache: touchDomCache,
      viewKey: currentViewKey,
      watchlist: function () { return watchlist; }
    };
  }

  return { create: create };
}));
