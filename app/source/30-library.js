  // Libraries, filters, recommendations, Watchlist, Playlists, and previews.
  function libraryViewKey() {
    return activeLibrary && activeLibrary.globalPlaylists ? 'playlists' : LibraryContainers.views()[libraryTabIndex];
  }

  function renderLibrarySubnav() {
    var container = document.getElementById('library-tabs');
    var labels = [t('library.recommended'), t('library.continue'), t('library.recent'), t('library.catalog'), t('library.collections')];
    var index;
    var button;
    container.innerHTML = '';
    for (index = 0; index < labels.length; index += 1) {
      button = element('button', 'library-tab' + (index === libraryTabIndex ? ' is-active' : '') + (index === 1 && libraryLifecycle.snapshot().continueAvailable === false ? ' is-disabled' : ''), labels[index]);
      button.type = 'button';
      button.setAttribute('data-library-tab', index);
      if (index === 1 && libraryLifecycle.snapshot().continueAvailable === false) { button.disabled = true; }
      container.appendChild(button);
    }
  }

  function nextLibraryTab(direction) {
    var next = libraryTabIndex + direction;
    var count = LibraryContainers.views().length;
    while (next >= 0 && next < count && next === 1 && libraryLifecycle.snapshot().continueAvailable === false) { next += direction; }
    return next < 0 || next >= count ? libraryTabIndex : next;
  }

  function selectLibraryTab(index) {
    libraryLifecycle.clearContainer();
    libraryTabIndex = Math.max(0, Math.min(LibraryContainers.views().length - 1, Number(index) || 0));
    libraryZone = 'tabs'; libraryControlIndex = 0;
    renderLibrarySubnav(); renderLibraryControls(); loadLibraryContent(true); updateLibraryFocus();
  }

  function focusLibraryTabContent() {
    var firstRecommendation;
    if (libraryViewKey() === 'catalog') {
      libraryZone = 'sort';
      libraryControlIndex = 0;
    } else if (libraryViewKey() === 'recommended') {
      firstRecommendation = libraryGridView.snapshot().recommendations[0];
      if (!firstRecommendation || !firstRecommendation.items.length) { return false; }
      libraryZone = 'grid';
      libraryGridView.focusRecommendations(0, 0);
    } else {
      if (!libraryGridView.snapshot().items.length) { return false; }
      libraryZone = 'grid';
      libraryGridView.focusCatalog(libraryGridView.snapshot().focus.index);
    }
    updateLibraryFocus();
    return true;
  }

  function libraryUsesGridScroll() {
    return libraryViewKey() === 'catalog' || libraryViewKey() === 'collections' || libraryViewKey() === 'playlists' || libraryLifecycle.snapshot().hasContainer;
  }

  function sortLabel(key) {
    var active = librarySort === key;
    var label = key === 'titleSort' ? 'A-Z' : (key === 'year' ? t('library.year') : t('library.rating'));
    if (active) { label += librarySortDirection === 'asc' ? ' \u2193' : ' \u2191'; }
    return label;
  }

  function libraryCardMeta(item) {
    return mediaCardMeta(item);
  }

  function renderLibraryControls() {
    var controls = document.getElementById('library-controls');
    var sort = document.getElementById('library-sort');
    var filter = document.getElementById('library-filter');
    var sortKeys = ['titleSort', 'audienceRating', 'year'];
    var filterKeys = ['all', 'unwatched', 'watched'];
    var index;
    var button;
    controls.className = libraryViewKey() === 'catalog' ? 'library-controls' : 'library-controls is-hidden';
    sort.innerHTML = '';
    filter.innerHTML = '';
    for (index = 0; index < sortKeys.length; index += 1) {
      button = element('button', 'library-control' + (librarySort === sortKeys[index] ? ' is-active' : ''), sortLabel(sortKeys[index]));
      button.type = 'button'; button.setAttribute('data-library-sort', sortKeys[index]); sort.appendChild(button);
    }
    for (index = 0; index < filterKeys.length; index += 1) {
      button = element('button', 'library-control' + (libraryWatchedFilter === filterKeys[index] ? ' is-active' : ''), t('library.' + filterKeys[index]));
      button.type = 'button'; button.setAttribute('data-library-filter', filterKeys[index]); filter.appendChild(button);
    }
    button = element('button', 'library-control' + (libraryFilterView.activeFilterCount() ? ' is-active' : ''), t('library.filters'));
    button.type = 'button';
    button.setAttribute('data-library-filter-open', '1');
    if (libraryFilterView.activeFilterCount()) { button.appendChild(element('span', 'library-control-badge', String(libraryFilterView.activeFilterCount()))); }
    filter.appendChild(button);
  }

  function openLibraryFilterDrawer() {
    libraryFilterView.open(activeLibrary);
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

  function createLibraryGridView() {
    libraryGridView = PloffLibraryGridView.create({
      root: root, document: document, SearchModel: SearchModel, element: element,
      moveGridDown: LibraryContainers.moveGridDown,
      cardMetrics: cardMetrics, mediaTitle: mediaTitle, mediaCardMeta: libraryCardMeta,
      mediaCardDetail: mediaCardDetail, mediaKey: searchMediaKey,
      recommendationTitle: libraryRecommendationTitle, renderedPosterSpecification: renderedPosterSpecification,
      posterLoader: posterLoader, overscanRows: resultOverscanRows, clearFocus: clearLogicalFocus,
      pointerSelectionActive: function () { return pointerSelectionActive || wheelNavigationActive; },
      onNearEnd: function () { loadLibraryContent(false); },
      onFocus: function (focus, item) {
        if (libraryZone !== 'grid' || !item) { return; }
        scheduleViewBackdrop(item, 'library', 250); scheduleTheme(item);
      }
    });
  }

  function renderLibraryGrid() {
    libraryGridView.setMode(libraryViewKey(), libraryUsesGridScroll());
    libraryGridView.setContentActive(libraryZone === 'grid');
    libraryGridView.render();
  }

  function onLibraryGridScroll() {
    if (appView === 'library' && libraryUsesGridScroll()) { libraryGridView.onScroll(); }
  }

  function updateLibraryFocus() {
    var target;
    clearLogicalFocus();
    if (libraryZone === 'grid') {
      libraryGridView.setMode(libraryViewKey(), libraryUsesGridScroll());
      libraryGridView.setContentActive(true);
      libraryGridView.refreshFocus();
      prioritizePoster(libraryViewKey() === 'recommended'
        ? document.querySelector('[data-library-recommendation-row="' + libraryGridView.snapshot().focus.recommendationRow + '"][data-library-recommendation-column="' + libraryGridView.snapshot().focus.index + '"]')
        : document.querySelector('[data-library-index="' + libraryGridView.snapshot().focus.index + '"]'));
      return;
    }
    libraryGridView.setContentActive(false);
    if (libraryZone === 'nav') { target = document.querySelector(selectorForNavIndex(state.navIndex)); }
    else if (libraryZone === 'tabs') { target = document.querySelector('[data-library-tab="' + libraryTabIndex + '"]'); }
    else if (libraryZone === 'actions') { target = document.getElementById(libraryActionIndex === 0 ? 'library-refresh' : 'library-refresh-metadata'); }
    else if (libraryZone === 'sort') { target = document.querySelectorAll('[data-library-sort]')[libraryControlIndex]; }
    else if (libraryZone === 'filter') { target = document.querySelectorAll('[data-library-filter], [data-library-filter-open]')[libraryControlIndex]; }
    if (target) { target.className += ' is-focused'; if (!pointerSelectionActive && !wheelNavigationActive) { target.focus(); } }
    backgroundAudio.stop();
  }

  createLibraryGridView();

  function libraryLoadContext() {
    return {
      library: activeLibrary,
      viewKey: libraryViewKey(),
      container: libraryLifecycle.snapshot().container,
      usesGridScroll: libraryUsesGridScroll(),
      query: {
        sort: librarySort,
        direction: librarySortDirection,
        watched: libraryWatchedFilter,
        filters: libraryFilterView.filters()
      }
    };
  }

  function createLibraryLifecycle() {
    libraryLifecycle = LibraryLifecycle.create({
      grid: libraryGridView,
      scrollTop: function () { return document.getElementById('library-grid').scrollTop; },
      setScrollTop: function (value) { document.getElementById('library-grid').scrollTop = value; },
      isActive: function (context) {
        return appView === 'library' && !!activeLibrary && !!context && !!context.library &&
          String(activeLibrary.key) === String(context.library.key);
      },
      loadRecommendations: function (library, callback) {
        return PlexClient.loadLibraryRecommendations(config, library, callback);
      },
      loadContainerPage: function (container, start, limit, callback) {
        return PlexClient.loadLibraryContainerPage(config, container, start, limit, callback);
      },
      loadLibraryPage: function (library, viewKey, query, start, limit, callback) {
        return PlexClient.loadLibraryPage(config, library, viewKey, query, start, limit, callback);
      },
      onReset: function () {
        renderLibraryGrid();
        hideViewState();
      },
      onStatus: function () { updateLibraryStatus(); },
      onEmpty: function (result) {
        if (libraryZone !== 'grid') { return; }
        libraryZone = activeLibrary && activeLibrary.globalPlaylists ? 'nav' : 'tabs';
        if (result.kind === 'recommendations') { libraryZone = 'tabs'; }
      },
      onRender: function () {
        hideViewState();
        renderLibraryGrid();
        updateLibraryFocus();
      },
      onContinueAvailable: function () {
        renderLibrarySubnav();
        updateLibraryFocus();
      },
      onRestoreContainer: function () {
        libraryZone = 'grid';
        renderLibraryGrid();
        updateLibraryFocus();
      }
    });
  }

  createLibraryLifecycle();

  function loadLibraryContent(reset) {
    if (!activeLibrary) { return; }
    libraryLifecycle.load(libraryLoadContext(), !!reset);
  }

  function updateLibraryStatus() {
    var snapshot = libraryGridView.snapshot();
    var itemCount = libraryViewKey() === 'recommended' ? snapshot.recommendations.reduce(function (count, row) { return count + row.items.length; }, 0) : snapshot.items.length;
    var lifecycle = libraryLifecycle.snapshot();
    var key = LibraryContainers.statusKey(libraryViewKey(), lifecycle.loading, lifecycle.error, itemCount, lifecycle.hasContainer);
    document.getElementById('library-status').className = 'library-status' + (key && !snapshot.items.length ? ' is-prominent' : '');
    setText('library-status', key ? t(key) : '');
  }

  function probeLibraryContinue() {
    if (activeLibrary) { libraryLifecycle.probeContinue(activeLibrary); }
  }

  function openLibrary(library, navIndex, keepNavigationFocus) {
    activeLibrary = library; state.navIndex = navIndex; appView = 'library';
    libraryWatchedFilter = 'all';
    libraryFilterView.setActiveFilters({});
    libraryLifecycle.prepareLibrary();
    libraryTabIndex = 0; libraryZone = keepNavigationFocus ? 'nav' : (library.globalPlaylists ? 'grid' : 'tabs'); libraryControlIndex = 0; libraryActionIndex = 0;
    document.getElementById('content').style.display = 'none';
    document.getElementById('search-view').className = 'search-view is-hidden';
    document.getElementById('app-settings-view').className = 'app-settings-view is-hidden';
    document.getElementById('detail-view').className = 'detail-view is-hidden';
    document.getElementById('library-view').className = 'library-view' + (library.globalPlaylists ? ' is-global-playlists' : '');
    setText('library-global-title', library.globalPlaylists ? t('nav.playlists') : '');
    renderNavigation(); renderLibrarySubnav(); renderLibraryControls(); loadLibraryContent(true); if (!library.globalPlaylists) { probeLibraryContinue(); } updateLibraryFocus();
  }

  function leaveLibrary() {
    hideViewState();
    libraryLifecycle.leave();
    libraryFilterView.dismiss();
    document.getElementById('library-view').className = 'library-view is-hidden';
  }

  function closeLibrary() {
    leaveLibrary();
    revealHome({ focus: 'preserve' });
  }

  function openLibraryContainer(item) {
    if (!libraryLifecycle.openContainer(item)) { return; }
    libraryZone = 'grid';
    loadLibraryContent(true);
  }

  function closeLibraryContainer() {
    return libraryLifecycle.closeContainer();
  }

  function createWatchlistView() {
    watchlistView = WatchlistView.create({
      root: root, document: document, WatchlistState: WatchlistState, element: element,
      available: watchlistAvailable, identity: watchlistIdentity, accountToken: watchlistAccountToken,
      timeout: function () { return Math.min(8000, Number(config.requestTimeout || 6000)); },
      discover: function (options, callback) { return WatchlistClient.discover(root, options, callback); },
      load: function (options, callback) { return WatchlistClient.load(root, options, 0, 200, callback); },
      set: function (options, key, enabled, callback) { return WatchlistClient.set(root, options, key, enabled, callback); },
      findByGuid: function (guid, callback) { return PlexClient.findByGuid(config, guid, callback); },
      cardMetrics: cardMetrics, mediaTitle: mediaTitle, mediaCardMeta: libraryCardMeta, mediaCardDetail: mediaCardDetail,
      renderedPosterSpecification: renderedPosterSpecification, posterLoader: posterLoader, scope: 'watchlist',
      clearFocus: clearLogicalFocus, navTarget: function () { return document.querySelector(selectorForNavIndex(state.navIndex)); },
      pointerSelectionActive: function () { return pointerSelectionActive || wheelNavigationActive; },
      prioritizePoster: prioritizePoster,
      columns: function () { return CardLayout.columns(document.getElementById('watchlist-grid').clientWidth || 1600, appSettings.cardScale); },
      onFocus: function (item) { scheduleViewBackdrop(item, 'watchlist', 250); scheduleTheme(item); },
      onNavigationFocus: function () { backgroundAudio.stop(); },
      onItemsChanged: function () { if (appView === 'detail') { syncCurrentDetailWatchlist(); renderDetailWatchlist(); } },
      onNavigate: function (direction) {
        state.navIndex = Math.max(0, Math.min(navigationFocusCount() - 1, state.navIndex + (direction === 'left' ? -1 : 1)));
        renderNavigation(); scheduleNavigationPreview(state.navIndex);
      },
      onEnterNavigation: enterActiveNavigationView, onBack: closeWatchlist, onPlay: playHomeItem, onOpenDetail: openDetail
    });
  }

  createWatchlistView();

  function watchlistSnapshot() { return watchlistView.snapshot(); }
  function renderWatchlistGrid() { watchlistView.render(); }
  function updateWatchlistFocus() { watchlistView.refreshFocus(); }
  function loadWatchlistData(force, callback) { watchlistView.load(force, callback); }

  function openWatchlist(keepNavigationFocus) {
    if (!watchlistAvailable()) { showMessage(t('watchlist.unavailable')); renderNavigation(); return; }
    appView = 'watchlist';
    hideViewState();
    document.getElementById('content').style.display = 'none';
    document.getElementById('library-view').className = 'library-view is-hidden';
    document.getElementById('search-view').className = 'search-view is-hidden';
    document.getElementById('app-settings-view').className = 'app-settings-view is-hidden';
    document.getElementById('detail-view').className = 'detail-view is-hidden';
    document.getElementById('watchlist-view').className = 'watchlist-view';
    setText('watchlist-title', t('nav.watchlist'));
    renderNavigation(); watchlistView.open(keepNavigationFocus); loadWatchlistData(false);
  }

  function leaveWatchlist() {
    hideViewState();
    watchlistView.leave();
    document.getElementById('watchlist-view').className = 'watchlist-view is-hidden';
  }

  function closeWatchlist() {
    leaveWatchlist(); revealHome({ focus: 'preserve' });
  }

  function activateLibrarySort(key) {
    if (librarySort === key) { librarySortDirection = librarySortDirection === 'asc' ? 'desc' : 'asc'; }
    else { librarySort = key; librarySortDirection = key === 'titleSort' ? 'asc' : 'desc'; }
    renderLibraryControls(); loadLibraryContent(true); updateLibraryFocus();
  }

  function handleLibraryFilterKeyDown(event, direction) {
    libraryFilterView.handleKeyDown(event, direction);
  }

  function activateLibraryFilter(key) {
    var filters;
    if (libraryWatchedFilter === key) { return; }
    libraryWatchedFilter = key;
    filters = libraryFilterView.filters();
    filters.watched = key === 'all' ? '' : key;
    libraryFilterView.setActiveFilters(filters);
    renderLibraryControls(); loadLibraryContent(true); updateLibraryFocus();
  }

  function setLibraryRefreshPending(pending) {
    libraryRefreshPending = pending;
    document.getElementById('library-refresh').disabled = pending;
    document.getElementById('library-refresh-metadata').disabled = pending;
  }

  function finishLibraryRefresh(error) {
    setLibraryRefreshPending(false);
    if (error) { showMessage(t('status.updateError')); return; }
    showMessage(t('status.refreshComplete'));
    probeLibraryContinue();
    loadLibraryContent(true);
    homeRefreshCoordinator.refresh();
    updateLibraryFocus();
  }

  function waitForLibraryRefresh(error, activityId) {
    if (error) { finishLibraryRefresh(error); return; }
    waitForServerActivity(activityId, function () { finishLibraryRefresh(null); });
  }

  function refreshActiveLibrary() {
    if (!activeLibrary || libraryRefreshPending) { return; }
    setLibraryRefreshPending(true); showMessage(t('status.refreshing'));
    PlexClient.refreshLibrary(config, activeLibrary.key, waitForLibraryRefresh);
  }

  function refreshActiveLibraryMetadata() {
    if (!activeLibrary || libraryRefreshPending) { return; }
    setLibraryRefreshPending(true); showMessage(t('status.refreshing'));
    PlexClient.refreshLibraryMetadata(config, activeLibrary.key, waitForLibraryRefresh);
  }

  function activate() {
    var item;
    if (state.area === 'nav') {
      enterActiveNavigationView();
      return;
    }
    item = data.rows[state.rowIndex].items[state.column];
    if (item.ratingKey) {
      openDetail(item);
    } else {
      showMessage(t('status.opening', { title: mediaTitle(item) }));
    }
  }

  function activateNavigationSelection() {
    if (isProfileNavIndex(state.navIndex)) { openProfileManager(); return; }
    if (isActivityNavIndex(state.navIndex)) { focusCurrentNavigation(); return; }
    enterActiveNavigationView();
  }

  function navigationHasFocus() {
    if (appView === 'home') { return state.area === 'nav'; }
    if (appView === 'library') { return libraryZone === 'nav'; }
    if (appView === 'watchlist') { return watchlistSnapshot().zone === 'nav'; }
    if (appView === 'search') { return searchSnapshot().focus.zone === 'nav'; }
    if (appView === 'settings') { return settingsView.snapshot().zone === 'nav'; }
    if (appView === 'detail') { return detailZone === 'nav'; }
    return false;
  }

  function navigationViewMatches(item) {
    if (!item) { return false; }
    if (item.kind === 'home') { return appView === 'home'; }
    if (item.kind === 'library') { return appView === 'library' && activeLibrary && String(activeLibrary.key) === String(item.key); }
    if (item.kind === 'watchlist') { return appView === 'watchlist'; }
    if (item.kind === 'playlists') { return appView === 'library' && activeLibrary && activeLibrary.globalPlaylists; }
    if (item.kind === 'search') { return appView === 'search'; }
    if (item.kind === 'settings') { return appView === 'settings'; }
    return false;
  }

  function focusCurrentNavigation() {
    state.area = 'nav';
    if (appView === 'home') { updateFocus(); }
    else if (appView === 'library') { libraryZone = 'nav'; updateLibraryFocus(); }
    else if (appView === 'watchlist') { watchlistView.focusNavigation(); }
    else if (appView === 'search') { searchView.focusNavigation(state.navIndex); }
    else if (appView === 'settings') { settingsView.focusNavigation(); updateSettingsFocus(); }
    else if (appView === 'detail') { detailZone = 'nav'; updateDetailFocus(); }
  }

  function showNavigationView(index, keepNavigationFocus) {
    var targetIndex = Number(index);
    var item = navigationItems[targetIndex];
    navigationPreviewScheduler.cancel();
    if (!item) { return; }
    if (item.kind === 'watchlist' && !watchlistAvailable()) { showMessage(t('watchlist.unavailable')); renderNavigation(); return; }
    state.navIndex = targetIndex;
    if (navigationViewMatches(item)) {
      renderNavigation();
      if (keepNavigationFocus) { focusCurrentNavigation(); }
      else { enterActiveNavigationView(); }
      return;
    }
    if (appView === 'search') { leaveSearch(); }
    else if (appView === 'library') { leaveLibrary(); }
    else if (appView === 'watchlist') { leaveWatchlist(); }
    else if (appView === 'detail') { leaveDetail(); }
    else if (appView === 'settings') { leaveAppSettings(); }
    state.navIndex = targetIndex;
    state.area = 'nav';
    renderNavigation();
    if (item.kind === 'home') { revealHome({ focus: keepNavigationFocus ? 'nav' : 'first' }); }
    else if (item.kind === 'library') { openLibrary(item, targetIndex, keepNavigationFocus); }
    else if (item.kind === 'watchlist') { openWatchlist(keepNavigationFocus); }
    else if (item.kind === 'playlists') { openLibrary({ key: 'playlists', title: t('nav.playlists'), globalPlaylists: true }, targetIndex, keepNavigationFocus); }
    else if (item.kind === 'search') { openSearch(keepNavigationFocus); }
    else if (item.kind === 'settings') { openAppSettings(keepNavigationFocus); }
  }

  function showNavigationPreview(index) {
    if (Number(index) !== state.navIndex || !navigationHasFocus() || Number(index) >= navigationItems.length) { return; }
    showNavigationView(index, true);
  }

  function scheduleNavigationPreview(index) {
    if (navReorderMode || Number(index) >= navigationItems.length) { navigationPreviewScheduler.cancel(); return; }
    navigationPreviewScheduler.schedule(Number(index));
  }

  function enterActiveNavigationView() {
    var item;
    navigationPreviewScheduler.cancel();
    if (isProfileNavIndex(state.navIndex)) { openProfileManager(); return; }
    if (isActivityNavIndex(state.navIndex)) { focusCurrentNavigation(); return; }
    item = navigationItems[state.navIndex];
    if (!navigationViewMatches(item)) { showNavigationView(state.navIndex, false); return; }
    if (item.kind === 'home') {
      focusHomeStart();
    } else if (item.kind === 'library') {
      libraryZone = 'tabs';
      updateLibraryFocus();
    } else if (item.kind === 'watchlist') {
      watchlistView.focusContent();
    } else if (item.kind === 'playlists') {
      libraryZone = libraryGridView.snapshot().items.length ? 'grid' : 'nav';
      updateLibraryFocus();
    } else if (item.kind === 'search') {
      searchView.focusKeyboard(0, 0);
    } else if (item.kind === 'settings') {
      settingsView.focusList(0, settingsRows().length);
      renderAppSettings();
    }
  }

  function activateNavigationIndex(index) {
    var targetIndex = Number(index);
    navigationPreviewScheduler.cancel();
    if (!isFinite(targetIndex) || targetIndex < 0 || targetIndex >= navigationFocusCount()) { return; }
    state.navIndex = targetIndex;
    state.area = 'nav';
    if (isProfileNavIndex(targetIndex)) { openProfileManager(); return; }
    if (isActivityNavIndex(targetIndex)) { focusCurrentNavigation(); return; }
    showNavigationView(targetIndex, false);
  }
