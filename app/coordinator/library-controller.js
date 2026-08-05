(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffLibraryController = factory(); }
}(this, function () {
  'use strict';

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
    var backLockedUntil = 0;
    var cache = {};
    var domCacheOrder = [];
    var prefetchTimer = null;
    var prefetchQueue = [];
    var prefetchActive = false;
    var prefetchAnchor = -1;
    var prefetchRequest = null;
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

    function keyFor(library) { return String(library && (library.key || library.title) || ''); }

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

    function putCached(library, saved) {
      var key = keyFor(library);
      if (!key || !saved) { return; }
      cache[key] = saved;
      if (saved.dom) { touchDomCache(key); }
    }

    function cached(library) { return cache[keyFor(library)] || null; }

    function clearCached(library) {
      var key = keyFor(library);
      var index = domCacheOrder.indexOf(key);
      if (index !== -1) { domCacheOrder.splice(index, 1); }
      delete cache[key];
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

    function cancelPrefetch() {
      if (prefetchTimer !== null) {
        if (platformRoot.cancelIdleCallback) { platformRoot.cancelIdleCallback(prefetchTimer); }
        if (platformRoot.clearTimeout) { platformRoot.clearTimeout(prefetchTimer); }
      }
      if (prefetchRequest && prefetchRequest.abort) { prefetchRequest.abort(); }
      prefetchTimer = null;
      prefetchRequest = null;
      prefetchQueue = [];
      prefetchActive = false;
    }

    function runPrefetch() {
      var library;
      var key;
      prefetchTimer = null;
      if (destroyed || prefetchActive || !prefetchQueue.length) { return; }
      if (call(values.isBusy) === true) {
        schedulePrefetch(call(values.navigationIndex), call(values.navigationItems));
        return;
      }
      library = prefetchQueue.shift();
      key = keyFor(library);
      if (!key || cache[key] || (activeLibrary && keyFor(activeLibrary) === key)) {
        schedulePrefetch(call(values.navigationIndex), call(values.navigationItems));
        return;
      }
      prefetchActive = true;
      prefetchRequest = call(values.loadRecommendations, library, function (error, rows) {
        var saved;
        prefetchRequest = null;
        prefetchActive = false;
        if (destroyed) { return; }
        if (!error && !cache[key] && (!activeLibrary || keyFor(activeLibrary) !== key)) {
          saved = call(values.buildPrefetchedState, library, rows || []);
          if (saved) { putCached(library, saved); }
          call(values.warmPrefetch, rows || [], saved);
        }
        schedulePrefetch(call(values.navigationIndex), call(values.navigationItems));
      });
      call(values.trackPrefetchRequest, prefetchRequest);
    }

    function schedulePrefetch(navIndex, navigationItems) {
      var candidates = [];
      var distance;
      var indexes;
      var item;
      var key;
      var schedule;
      if (destroyed) { return; }
      navIndex = Number(navIndex || 0);
      navigationItems = navigationItems || [];
      if (prefetchAnchor !== navIndex) {
        prefetchAnchor = navIndex;
        prefetchQueue = [];
      }
      if (prefetchTimer !== null || prefetchActive) { return; }
      if (!prefetchQueue.length) {
        for (distance = 1; distance < navigationItems.length && candidates.length < 2; distance += 1) {
          indexes = [navIndex - distance, navIndex + distance];
          indexes.forEach(function (index) {
            item = navigationItems[index];
            key = keyFor(item);
            if (candidates.length < 2 && item && item.kind === 'library' && key &&
                !cache[key] && (!activeLibrary || keyFor(activeLibrary) !== key) && candidates.indexOf(item) === -1) {
              candidates.push(item);
            }
          });
        }
        prefetchQueue = candidates;
      }
      if (!prefetchQueue.length) { return; }
      schedule = function () { prefetchTimer = null; runPrefetch(); };
      if (platformRoot.requestIdleCallback) { prefetchTimer = platformRoot.requestIdleCallback(schedule, { timeout: 400 }); }
      else if (platformRoot.setTimeout) { prefetchTimer = platformRoot.setTimeout(schedule, 100); }
    }

    function prepareLibrary(library, keepNavigationFocus) {
      var saved = cached(library);
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
    function setSort(next) { sort = String(next || 'titleSort'); return sort; }
    function setSortDirection(next) { sortDirection = next === 'desc' ? 'desc' : 'asc'; return sortDirection; }
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

    function finishRefresh(error) {
      setRefreshPending(false);
      if (destroyed) { return; }
      if (error) { call(values.onRefreshError, error); }
      else { call(values.onRefreshComplete, snapshot()); }
    }

    function waitForRefresh(error, activityId) {
      if (error) { finishRefresh(error); return; }
      if (activityId && typeof values.waitForActivity === 'function') {
        call(values.waitForActivity, activityId, function (waitError) { finishRefresh(waitError || null); });
      } else { finishRefresh(null); }
    }

    function refresh(kind) {
      var loader;
      if (destroyed || !activeLibrary || refreshPending) { return false; }
      loader = kind === 'metadata' ? values.refreshMetadata : values.refreshLibrary;
      if (typeof loader !== 'function') { return false; }
      setRefreshPending(true);
      call(values.onRefreshStart, kind, snapshot());
      call(loader, activeLibrary, waitForRefresh);
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
      if (lifecycle && lifecycle.closeContainer && lifecycle.closeContainer()) {
        backLockedUntil = currentTime + 600;
        call(values.updateFocus);
        return true;
      }
      if (currentTime < backLockedUntil) { return true; }
      if (zone === 'nav') { call(values.closeLibrary); return true; }
      nextZone = parentZone();
      if (!nextZone) { call(values.closeLibrary); return true; }
      zone = nextZone;
      if (zone === 'filter') { controlIndex = Math.max(0, ['all', 'unwatched', 'watched'].indexOf(watchedFilter)); }
      backLockedUntil = currentTime + 600;
      call(values.scrollTop, 0);
      call(values.updateFocus);
      return true;
    }

    function handleKey(event, direction) {
      var next;
      var item;
      var gridSnapshot;
      var keyCode = Number(event && event.keyCode);
      if (destroyed) { return { handled: false }; }
      if (keyCode !== 13 || zone !== 'tabs') { pointerTabIndex = null; }
      if (event && event.preventDefault) { event.preventDefault(); }
      if (filter && filter.isOpen && filter.isOpen()) {
        filter.handleKeyDown(event, direction);
        return { handled: true };
      }
      if (keyCode === 27 || keyCode === 461) { handleBack(); return { handled: true }; }
      if (keyCode === 415 && zone === 'grid') {
        item = grid && grid.focusedItem ? grid.focusedItem() : null;
        if (item && !item.containerKey) { call(values.playItem, item); }
        return { handled: true };
      }
      if (zone === 'nav') {
        if (direction === 'left' || direction === 'right') { call(values.moveNavigation, direction); call(values.updateFocus); }
        else if (direction === 'down') { zone = activeLibrary && activeLibrary.globalPlaylists ? 'grid' : 'tabs'; call(values.updateFocus); }
        else if (keyCode === 13) { call(values.activateNavigation); }
        return { handled: true };
      }
      if (zone === 'tabs') {
        if (direction === 'up') { zone = 'nav'; call(values.updateFocus); }
        else if (direction === 'left' || direction === 'right') {
          if (direction === 'right' && tabIndex === containers.views().length - 1) {
            zone = 'actions'; actionIndex = 0; call(values.updateFocus);
          } else {
            next = typeof values.nextTab === 'function'
              ? call(values.nextTab, direction === 'left' ? -1 : 1)
              : Math.max(0, Math.min(containers.views().length - 1, tabIndex + (direction === 'left' ? -1 : 1)));
            if (direction === 'right' && next === tabIndex) {
              zone = 'actions'; actionIndex = 0; call(values.updateFocus);
            } else if (next !== undefined && next !== tabIndex) {
              tabIndex = next; call(values.selectTab, next);
            }
          }
        } else if (direction === 'down') { call(values.focusTabContent); }
        else if (keyCode === 13) {
          if (pointerTabIndex !== null) { setTabIndex(pointerTabIndex); pointerTabIndex = null; }
          call(values.selectTab, tabIndex);
        }
        return { handled: true };
      }
      if (zone === 'actions') {
        if (direction === 'left') {
          if (actionIndex > 0) { actionIndex -= 1; }
          else { zone = 'tabs'; }
          call(values.updateFocus);
        } else if (direction === 'right') { actionIndex = Math.min(1, actionIndex + 1); call(values.updateFocus); }
        else if (direction === 'up') { zone = 'nav'; call(values.updateFocus); }
        else if (direction === 'down') { zone = currentViewKey() === 'catalog' ? 'filter' : 'grid'; controlIndex = 0; call(values.updateFocus); }
        else if (keyCode === 13) { refresh(actionIndex === 0 ? 'library' : 'metadata'); }
        return { handled: true };
      }
      gridSnapshot = gridNavigationSnapshot();
      if (currentViewKey() === 'recommended' && zone === 'grid') {
        next = grid && grid.handleDirection ? grid.handleDirection(direction) : {};
        if (next && next.leave) { zone = 'tabs'; call(values.updateFocus); }
        else if (keyCode === 13 && grid && grid.focusedItem && grid.focusedItem()) { call(values.openItem, grid.focusedItem()); }
        return { handled: true };
      }
      if (zone === 'sort') {
        if (direction === 'left' || direction === 'right') {
          next = containers.moveControl('sort', controlIndex, direction);
          zone = next.zone; controlIndex = next.index; call(values.updateFocus);
        } else if (direction === 'up' || direction === 'down') {
          next = containers.moveControlVertical('sort', direction);
          if (next.zone !== 'grid' || gridSnapshot.itemCount) { zone = next.zone; call(values.updateFocus); }
        } else if (keyCode === 13) { activateSort(['titleSort', 'audienceRating', 'year'][controlIndex]); }
        return { handled: true };
      }
      if (zone === 'filter') {
        if (direction === 'left' || direction === 'right') {
          next = containers.moveControl('filter', controlIndex, direction);
          zone = next.zone; controlIndex = next.index; call(values.updateFocus);
        } else if (direction === 'up') { zone = 'actions'; actionIndex = 0; call(values.updateFocus); }
        else if (direction === 'down') {
          next = containers.moveControlVertical('filter', direction);
          if (next.zone !== 'grid' || gridSnapshot.itemCount) { zone = next.zone; call(values.updateFocus); }
        } else if (keyCode === 13) {
          if (controlIndex === 3) { call(values.openFilter); }
          else { activateFilter(['all', 'unwatched', 'watched'][controlIndex]); }
        }
        return { handled: true };
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
      } else if (!next || next.moved !== true) { call(values.updateFocus); }
      gridSnapshot = gridNavigationSnapshot();
      if (usesGridScroll() && gridSnapshot.itemCount < gridSnapshot.totalSize &&
          gridSnapshot.focus.index >= gridSnapshot.itemCount - gridSnapshot.layout.columns * 2) {
        call(values.loadMore);
      }
      return { handled: true };
    }

    function pointerFocus(target, index, element) {
      if (destroyed) { return snapshot(); }
      if (target !== 'tabs') { pointerTabIndex = null; }
      if (target === 'nav') { zone = 'nav'; call(values.setNavigationIndex, index); }
      else if (target === 'tabs') { zone = 'tabs'; pointerTabIndex = Number(index); if (element) { call(values.pointerVisualFocus, element); } }
      else if (target === 'actions') { zone = 'actions'; setActionIndex(index); }
      else if (target === 'sort' || target === 'filter') { zone = target; setControlIndex(index); }
      else if (target === 'grid') {
        zone = 'grid';
        if (grid && grid.pointerFocus && element) { grid.pointerFocus(element); }
      }
      if (!(target === 'tabs' && element)) { call(values.updateFocus); }
      return snapshot();
    }

    function onGridScroll() {
      if (!destroyed && usesGridScroll() && grid && grid.onScroll) { grid.onScroll(); }
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
      refreshPending = false;
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
      activateFilter: activateFilter,
      activateSort: activateSort,
      activeLibrary: function () { return activeLibrary; },
      beginWheelNavigation: beginWheelNavigation,
      bindViews: bindViews,
      cacheCurrent: cacheCurrent,
      cached: cached,
      cancelPrefetch: cancelPrefetch,
      cancelWheelNavigation: cancelWheelNavigation,
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
      onGridScroll: onGridScroll,
      pointerFocus: pointerFocus,
      putCached: putCached,
      refresh: refresh,
      resetContent: resetContent,
      scheduleAdjacentPrefetch: schedulePrefetch,
      setActionIndex: setActionIndex,
      setActiveLibrary: function (library) { activeLibrary = library || null; },
      setControlIndex: setControlIndex,
      setRefreshPending: setRefreshPending,
      setSort: setSort,
      setSortDirection: setSortDirection,
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
