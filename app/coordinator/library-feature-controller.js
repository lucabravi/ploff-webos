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
    var PlaybackQueueModel = modules.PlaybackQueueModel;
    var ProgressiveImages = modules.ProgressiveImages;
    var SearchModel = modules.SearchModel;
    var WatchlistState = modules.WatchlistState;
    var WatchlistView = modules.WatchlistView;
    var CardLayout = modules.CardLayout;
    var PlexClient = data.PlexClient;
    var WatchlistClient = data.WatchlistClient;
    var config = data.config || {};
    var libraryOverscanRows = Math.max(0, Number(values.libraryOverscanRows === undefined ? 3 : values.libraryOverscanRows) || 0);
    var controller = null;
    var gridView = null;
    var lifecycle = null;
    var filterView = null;
    var watchlistView = null;
    var scrollTarget = null;
    var scrollHandler = null;
    var activeMode = '';
    var generation = 0;
    var pendingContainerRestore = null;
    var librarySurfaceAnimationPending = false;
    var destroyed = false;

    function call(callback, arg1, arg2, arg3, arg4, arg5, arg6) {
      if (typeof callback === 'function') { return callback(arg1, arg2, arg3, arg4, arg5, arg6); }
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
    function libraryState() { return controller && controller.snapshot ? controller.snapshot() : {}; }
    function libraryViewKey() { return controller && controller.viewKey ? controller.viewKey() : ''; }
    function watchlistSnapshot() { return watchlistView && watchlistView.snapshot ? watchlistView.snapshot() : {}; }
    function lifecycleSnapshot() { return lifecycle && lifecycle.snapshot ? lifecycle.snapshot() : {}; }
    function gridSnapshot() { return gridView && gridView.snapshot ? gridView.snapshot() : { items: [], recommendations: [], focus: { index: 0, recommendationRow: 0 } }; }
    function gridFocusSnapshot() { return gridView && gridView.focusSnapshot ? gridView.focusSnapshot() : gridSnapshot().focus; }
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
    function isLibraryActive(context) {
      var active = activeLibrary();
      return !destroyed && activeMode === 'library' && currentView() === 'library' && !!active &&
        (!context || !context.library || String(active.key || '') === String(context.library.key || ''));
    }
    function isWatchlistActive() { return !destroyed && activeMode === 'watchlist' && currentView() === 'watchlist'; }

    function libraryCacheKey(library) { return String(library && (library.key || library.title) || ''); }

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
        dom: gridView && gridView.buildDetachedRecommendations
          ? gridView.buildDetachedRecommendations(rows || [], 30) : null
      };
    }

    function prefetchLibraryPosterPreviews(rows) {
      var profile;
      var preview;
      var sources = [];
      if (!shell.posterLoader || !shell.posterLoader.load || !timerRoot.Image) { return; }
      profile = call(shell.cardProfile);
      if (profile && profile.poster) {
        preview = { width: profile.poster.previewWidth, height: profile.poster.previewHeight };
      } else {
        if (!ProgressiveImages || !ProgressiveImages.previewSize) { return; }
        profile = { metrics: call(shell.cardMetrics) || { width: 200, imageHeight: 300 } };
        preview = ProgressiveImages.previewSize(profile.metrics.width, profile.metrics.imageHeight, 96);
      }
      (rows || []).forEach(function (row) {
        (row && row.items || []).forEach(function (item) {
          if (item && item.image && sources.indexOf(item.image) === -1 && sources.length < 30) { sources.push(item.image); }
        });
      });
      sources.forEach(function (source) {
        shell.posterLoader.load(new timerRoot.Image(), {
          source: source,
          previewWidth: preview.width,
          previewHeight: preview.height,
          width: preview.width,
          height: preview.height,
          priority: 3,
          scope: 'library-prefetch'
        });
      });
    }

    function prefetchLibraryBackdropPreview(rows) {
      var item = rows && rows[0] && rows[0].items && rows[0].items[0];
      var source = item && call(shell.artworkUrl, item);
      if (!source || !shell.posterLoader || !shell.posterLoader.load || !timerRoot.Image) { return; }
      shell.posterLoader.load(new timerRoot.Image(), {
        source: source,
        previewWidth: 320,
        previewHeight: 180,
        width: 320,
        height: 180,
        priority: 3,
        scope: 'library-prefetch'
      });
    }

    function scheduleAdjacentPrefetch(navIndex, items) {
      if (destroyed || !controller || !controller.scheduleAdjacentPrefetch) { return false; }
      controller.scheduleAdjacentPrefetch(navIndex === undefined ? navigationIndex() : navIndex, items || navigationItems());
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
      var gridContainer = node('library-grid');
      if (!active || activeContainer() || !controller || !controller.cacheCurrent) { return false; }
      controller.cacheCurrent({
        tabIndex: current.tabIndex,
        zone: current.zone,
        controlIndex: current.controlIndex,
        actionIndex: current.actionIndex,
        sort: current.sort,
        sortDirection: current.sortDirection,
        watchedFilter: current.watchedFilter,
        filters: filterView && filterView.filters ? filterView.filters() : {},
        continueAvailable: lifecycleSnapshot().continueAvailable,
        collectionsAvailable: lifecycleSnapshot().collectionsAvailable,
        nextStart: lifecycleSnapshot().nextStart,
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
      container.innerHTML = '';
      clearChildren(container);
      for (index = 0; index < labels.length; index += 1) {
        disabled = libraryTabDisabled(index);
        button = element('button', 'library-tab' + (index === libraryState().tabIndex ? ' is-active' : '') + (disabled ? ' is-disabled' : ''), labels[index]);
        if (!button) { continue; }
        button.type = 'button';
        button.setAttribute('data-library-tab', index);
        button.disabled = disabled;
        container.appendChild(button);
      }
    }

    function nextLibraryTab(direction) {
      var next = libraryState().tabIndex + direction;
      var count = LibraryContainers.views().length;
      while (next >= 0 && next < count && libraryTabDisabled(next)) { next += direction; }
      return next < 0 || next >= count ? libraryState().tabIndex : next;
    }

    function selectLibraryTab(index) {
      if (libraryTabDisabled(index)) { return false; }
      lifecycle.clearContainer();
      updateLibraryPresentationClass();
      renderLibraryGlobalHeader();
      controller.setTabIndex(index);
      controller.setZone('tabs');
      controller.setControlIndex(0);
      renderLibrarySubnav();
      renderLibraryControls();
      librarySurfaceAnimationPending = true;
      loadLibraryContent(true);
      updateLibraryFocus();
      return true;
    }

    function focusLibraryTabContent() {
      var firstRecommendation;
      var currentGrid = gridSnapshot();
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
      controls.className = libraryViewKey() === 'catalog' ? 'library-controls' : 'library-controls is-hidden';
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
      if (filterView && filterView.open) { filterView.open(activeLibrary()); }
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
      if (!gridView) { return; }
      gridView.setMode(libraryViewKey(), libraryUsesGridScroll());
      gridView.setContentActive(libraryState().zone === 'grid');
      gridView.render();
    }

    function onGridScroll() {
      if (!destroyed && isLibraryActive() && libraryUsesGridScroll() && gridView && gridView.onScroll) { gridView.onScroll(); }
    }

    function bindEvents() {
      scrollTarget = node('library-grid');
      if (!scrollTarget || !scrollTarget.addEventListener) { return; }
      scrollHandler = onGridScroll;
      scrollTarget.addEventListener('scroll', scrollHandler, false);
    }

    function updateLibraryFocus() {
      var target;
      var current = libraryState();
      var currentGrid = gridFocusSnapshot();
      if (destroyed || !isLibraryActive()) { return; }
      call(shell.clearFocus);
      if (current.zone === 'grid') {
        gridView.setMode(libraryViewKey(), libraryUsesGridScroll());
        gridView.setContentActive(true);
        gridView.refreshFocus();
        call(shell.prioritizePoster, libraryViewKey() === 'recommended'
          ? document.querySelector('[data-library-recommendation-row="' + currentGrid.recommendationRow + '"][data-library-recommendation-column="' + currentGrid.index + '"]')
          : document.querySelector('[data-library-index="' + currentGrid.index + '"]'));
        return;
      }
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

    function loadLibraryContent(reset, replaceExisting) {
      if (destroyed || !activeLibrary() || !lifecycle) { return false; }
      lifecycle.load(libraryLoadContext(), reset === true, replaceExisting === true);
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
      itemCount = libraryViewKey() === 'recommended' ? currentGrid.recommendationItemCount : currentGrid.itemCount;
      currentLifecycle = lifecycleSnapshot();
      key = LibraryContainers.statusKey(libraryViewKey(), currentLifecycle.loading, currentLifecycle.error, itemCount, currentLifecycle.hasContainer);
      status = node('library-status');
      if (status) { status.className = 'library-status' + (key && !currentGrid.itemCount ? ' is-prominent' : ''); }
      setText('library-status', key ? t(key) : '');
    }

    function probeContinue() {
      if (!destroyed && activeLibrary() && lifecycle && lifecycle.probeContinue) { lifecycle.probeContinue(activeLibrary()); return true; }
      return false;
    }

    function probeCollections() {
      if (!destroyed && activeLibrary() && lifecycle && lifecycle.probeCollections) { lifecycle.probeCollections(activeLibrary()); return true; }
      return false;
    }

    function renderWatchlistGrid() { if (watchlistView && watchlistView.render) { watchlistView.render(); } }
    function updateWatchlistFocus() { if (isWatchlistActive() && watchlistView && watchlistView.refreshFocus) { watchlistView.refreshFocus(); } }
    function loadWatchlist(force, callback) {
      if (destroyed || !watchlistView || !watchlistView.load) { call(callback, new Error('Watchlist unavailable')); return null; }
      return watchlistView.load(force === true, callback);
    }

    function setLibraryRefreshPendingPresentation(pending) {
      var refresh = node('library-refresh');
      var metadata = node('library-refresh-metadata');
      if (refresh) { refresh.disabled = pending === true; }
      if (metadata) { metadata.disabled = pending === true; }
    }

    function finishLibraryRefreshPresentation() {
      if (!isLibraryActive()) { return; }
      call(shell.showMessage, t('status.refreshComplete'));
      probeContinue();
      loadLibraryContent(false, true);
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
        loadRecommendations: function (library, callback) { return PlexClient.loadLibraryRecommendations(config, library, callback); },
        buildPrefetchedState: prefetchedLibraryState,
        warmPrefetch: function (rows, saved) {
          if (saved && saved.dom) { return; }
          prefetchLibraryPosterPreviews(rows);
          prefetchLibraryBackdropPreview(rows);
        },
        onQueryChange: function () {
          if (!isLibraryActive()) { return; }
          renderLibraryControls();
          loadLibraryContent(true);
          updateLibraryFocus();
        },
        onRefreshPending: setLibraryRefreshPendingPresentation,
        onRefreshStart: function () { if (isLibraryActive()) { call(shell.showMessage, t('status.refreshing')); } },
        onRefreshError: function () { if (isLibraryActive()) { call(shell.showMessage, t('status.updateError')); updateLibraryFocus(); } },
        onRefreshComplete: finishLibraryRefreshPresentation,
        refreshLibrary: function (library, callback) { return PlexClient.refreshLibrary(config, library.key, callback); },
        refreshMetadata: function (library, callback) { return PlexClient.refreshLibraryMetadata(config, library.key, callback); },
        waitForActivity: function (activityId, callback) { call(server.waitForActivity, activityId, callback); },
        scrollTop: function (value) { var target = node('library-grid'); if (target) { target.scrollTop = Number(value || 0); } },
        updateFocus: updateLibraryFocus,
        pointerVisualFocus: function (target) {
          call(shell.clearFocus);
          if (target && String(target.className || '').indexOf('is-focused') === -1) { target.className = String(target.className || '') + ' is-focused'; }
        },
        closeLibrary: close,
        moveNavigation: function (direction) {
          var next = Math.max(0, Math.min(Math.max(0, Number(call(shell.navigationFocusCount)) - 1), navigationIndex() + (direction === 'left' ? -1 : 1)));
          call(state.setNavigationIndex, next);
          call(shell.renderNavigation);
          call(shell.scheduleNavigationPreview, next);
        },
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
        openItem: function (item) { call(transitions.openDetail, item); },
        playItem: function (item) { call(transitions.playItem, item); },
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
        loadOptions: function (library, callback) { return PlexClient.loadLibraryFilterOptions(config, library, callback); },
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
          return String(call(state.uiLanguage) || 'en') + '|' + (detailContainerKind(activeContainer()) === 'playlist' ? 'playlist' : 'plain');
        },
        showLibraryBadge: function () { return detailContainerKind(activeContainer()) === 'playlist'; },
        mediaTitle: function (item) { return call(shell.mediaTitle, item); },
        mediaCardMeta: function (item) { return call(shell.mediaCardMeta, item); },
        mediaCardDetail: function (item) { return call(shell.mediaCardDetail, item); },
        mediaKey: function (item) { return call(shell.mediaKey, item); },
        recommendationTitle: libraryRecommendationTitle,
        renderedPosterSpecification: function (image, source, priority, scope, fallbackWidth, fallbackHeight) {
          return call(shell.renderedPosterSpecification, image, source, priority, scope, fallbackWidth, fallbackHeight);
        },
        fixedPosterSpecification: function (source, size, priority, scope) {
          return call(shell.fixedPosterSpecification, source, size, priority, scope);
        },
        posterLoader: shell.posterLoader,
        overscanRows: libraryOverscanRows,
        clearFocus: function () { call(shell.clearFocus); },
        pointerSelectionActive: pointerActive,
        onNearEnd: function () { if (isLibraryActive()) { loadLibraryContent(false); } },
        onFocus: function (focus, item) {
          if (!isLibraryActive() || libraryState().zone !== 'grid' || !item) { return; }
          call(shell.scheduleBackdrop, item, 'library', 250);
          call(shell.scheduleTheme, item);
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
        loadRecommendations: function (library, callback) { return PlexClient.loadLibraryRecommendations(config, library, callback); },
        loadContainerPage: function (container, start, limit, callback) { return PlexClient.loadLibraryContainerPage(config, container, start, limit, callback); },
        loadContainerSummaryPage: function (container, start, limit, callback) { return PlexClient.loadLibraryContainerPage(config, container, start, limit, callback); },
        shouldSummarizeContainer: function (container) { return !!detailContainerKind(container); },
        initialContainerFocusIndex: function (items, container) {
          if (detailContainerKind(container) !== 'playlist' || !PlaybackQueueModel || !PlaybackQueueModel.firstUnfinishedIndex) { return -1; }
          return PlaybackQueueModel.firstUnfinishedIndex(items || []);
        },
        summarizeContainerItems: function (items) { return PlaybackQueueModel.progressSummary(items); },
        loadLibraryPage: function (library, viewKey, query, start, limit, callback) { return PlexClient.loadLibraryPage(config, library, viewKey, query, start, limit, callback); },
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
          call(shell.hideViewState);
          renderLibraryGrid();
          renderLibraryGlobalHeader();
          completeContainerRestore(result);
          updateLibraryFocus();
          if (librarySurfaceAnimationPending) {
            librarySurfaceAnimationPending = false;
            call(shell.animateLibrarySurface);
          }
          scheduleAdjacentPrefetch();
        },
        onContainerSummary: function () { if (isLibraryActive()) { renderLibraryGlobalHeader(); } },
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
          renderLibraryGrid();
          renderLibraryGlobalHeader();
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
        load: function (requestOptions, callback) { return WatchlistClient.load(timerRoot, requestOptions, 0, 200, callback); },
        set: function (requestOptions, key, enabled, callback) { return WatchlistClient.set(timerRoot, requestOptions, key, enabled, callback); },
        findByGuid: function (guid, callback) { return PlexClient.findByGuid(config, guid, callback); },
        cardMetrics: function () { return call(shell.cardMetrics); },
        cardProfile: function () { return call(shell.cardProfile); },
        mediaTitle: function (item) { return call(shell.mediaTitle, item); },
        mediaCardMeta: function (item) { return call(shell.mediaCardMeta, item); },
        mediaCardDetail: function (item) { return call(shell.mediaCardDetail, item); },
        renderedPosterSpecification: function (image, source, priority, scope, fallbackWidth, fallbackHeight) {
          return call(shell.renderedPosterSpecification, image, source, priority, scope, fallbackWidth, fallbackHeight);
        },
        fixedPosterSpecification: function (source, size, priority, scope) {
          return call(shell.fixedPosterSpecification, source, size, priority, scope);
        },
        posterLoader: shell.posterLoader,
        scope: 'watchlist',
        clearFocus: function () { call(shell.clearFocus); },
        navTarget: function () { return call(shell.navigationTarget, navigationIndex()); },
        pointerSelectionActive: pointerActive,
        prioritizePoster: function (target) { call(shell.prioritizePoster, target); },
        columns: function () {
          var grid = node('watchlist-grid');
          return CardLayout && CardLayout.columns ? CardLayout.columns(grid && grid.clientWidth || 1600, call(state.cardScale)) : 1;
        },
        onFocus: function (item) {
          if (!isWatchlistActive()) { return; }
          call(shell.scheduleBackdrop, item, 'watchlist', 250);
          call(shell.scheduleTheme, item);
        },
        onNavigationFocus: function () { call(shell.stopTheme); },
        onItemsChanged: function () { if (!destroyed) { call(transitions.onWatchlistItemsChanged); } },
        onNavigate: function (direction) {
          var next = Math.max(0, Math.min(Math.max(0, Number(call(shell.navigationFocusCount)) - 1), navigationIndex() + (direction === 'left' ? -1 : 1)));
          call(state.setNavigationIndex, next);
          call(shell.renderNavigation);
          call(shell.scheduleNavigationPreview, next);
        },
        onEnterNavigation: function () { call(shell.enterNavigation); },
        onBack: close,
        onPlay: function (item) { call(transitions.playItem, item); },
        onOpenDetail: function (item) { call(transitions.openDetail, item); }
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

    function enterLibrary(library, entryOptions) {
      var saved;
      entryOptions = entryOptions || {};
      if (destroyed || !library) { return false; }
      generation += 1;
      activeMode = 'library';
      librarySurfaceAnimationPending = false;
      if (entryOptions.navigationIndex !== undefined) { call(state.setNavigationIndex, Number(entryOptions.navigationIndex) || 0); }
      saved = controller.cached ? controller.cached(library) : null;
      call(transitions.setView, 'library');
      controller.enterLibrary(library, { keepNavigationFocus: entryOptions.keepNavigationFocus === true });
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

    function enterPlaylists(entryOptions) {
      return enterLibrary({ key: 'playlists', title: t('nav.playlists'), globalPlaylists: true }, entryOptions || {});
    }

    function enterWatchlist(entryOptions) {
      var watchlistViewNode;
      entryOptions = entryOptions || {};
      if (destroyed) { return false; }
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
      librarySurfaceAnimationPending = false;
      cancelContainerRestore(true);
      generation += 1;
      call(shell.hideViewState);
      if (mode === 'library') {
        cacheActiveLibraryView();
        controller.leave();
        if (node('library-view')) { node('library-view').className = 'library-view is-hidden'; }
      } else if (mode === 'watchlist') {
        controller.leave();
        if (node('watchlist-view')) { node('watchlist-view').className = 'watchlist-view is-hidden'; }
      }
      activeMode = '';
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
      if (!item) { return false; }
      if (item.kind === 'watchlist') { return currentView() === 'watchlist'; }
      if (item.kind === 'library') {
        return currentView() === 'library' && !!active && String(active.key || '') === String(item.key || '');
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
      return String(value && (value.containerKey || value.containerRatingKey || value.ratingKey || value.key || '') || '');
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
        if (!loadLibraryContent(true)) { cancelContainerRestore(true); return false; }
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

    function recoverPresentation() {
      var libraryView;
      var watchlistViewNode;
      if (destroyed) { return false; }
      if (node('content')) { node('content').style.display = 'none'; }
      if (node('search-view')) { node('search-view').className = 'search-view is-hidden'; }
      if (node('detail-view')) { node('detail-view').className = 'detail-view is-hidden'; }
      if (currentView() === 'library') {
        activeMode = 'library';
        libraryView = node('library-view');
        watchlistViewNode = node('watchlist-view');
        if (watchlistViewNode) { watchlistViewNode.className = 'watchlist-view is-hidden'; }
        updateLibraryPresentationClass();
        loadLibraryContent(false, true);
        updateLibraryFocus();
        return true;
      }
      if (currentView() === 'watchlist') {
        activeMode = 'watchlist';
        libraryView = node('library-view');
        watchlistViewNode = node('watchlist-view');
        if (libraryView) { libraryView.className = 'library-view is-hidden'; }
        if (watchlistViewNode) { watchlistViewNode.className = 'watchlist-view'; }
        renderWatchlistGrid();
        updateWatchlistFocus();
        return true;
      }
      return false;
    }

    function reloadCurrent(force) {
      if (destroyed) { return false; }
      if (currentView() === 'library') { return loadLibraryContent(force !== false); }
      if (currentView() === 'watchlist') { loadWatchlist(force !== false); return true; }
      return false;
    }

    function resetContent() {
      if (destroyed) { return false; }
      cancelContainerRestore(false);
      generation += 1;
      activeMode = '';
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
        shell.posterLoader.cancelScope('library-prefetch');
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
    function findWatchlistLocal(key) { return watchlistView && watchlistView.findLocal ? watchlistView.findLocal(key) : null; }
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
      cancelContainerRestore(false);
      destroyed = true;
      generation += 1;
      activeMode = '';
      if (scrollTarget && scrollHandler && scrollTarget.removeEventListener) {
        scrollTarget.removeEventListener('scroll', scrollHandler, false);
      }
      scrollTarget = null;
      scrollHandler = null;
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
      if (shell.posterLoader && shell.posterLoader.cancelScope) {
        shell.posterLoader.cancelScope('library-prefetch');
        shell.posterLoader.cancelScope('library');
        shell.posterLoader.cancelScope('watchlist');
      }
    }

    if (!LibraryController || !LibraryController.create || !LibraryContainers || !LibraryFilterView || !LibraryGridView ||
        !LibraryLifecycle || !PlaybackQueueModel || !WatchlistView || !PlexClient || !WatchlistClient) {
      throw new Error('LibraryFeatureController dependencies are unavailable');
    }

    controller = constructController();
    constructFilterView();
    constructGridView();
    constructLifecycle();
    constructWatchlistView();
    if (controller.bindViews) { controller.bindViews({ grid: gridView, lifecycle: lifecycle, filter: filterView, watchlist: watchlistView }); }
    bindEvents();

    return {
      activeContainer: function () { return copyRecord(activeContainer()); },
      activeLibrary: function () { return copyRecord(activeLibrary()); },
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
      recoverPresentation: recoverPresentation,
      refreshPresentation: refreshPresentation,
      reloadCurrent: reloadCurrent,
      resetContent: resetContent,
      restorePageFocus: restorePageFocus,
      restoreContainerOrigin: restoreContainerOrigin,
      scheduleAdjacentPrefetch: scheduleAdjacentPrefetch,
      snapshot: snapshot,
      toggleWatchlist: toggleWatchlist,
      translateStatic: translateStatic,
      watchlistProvider: watchlistProvider,
      watchlistSnapshot: watchlistSnapshot
    };
  }

  return { create: create };
}));
