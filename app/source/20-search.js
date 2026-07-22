  // Search request adapters and cross-view routing. UI state belongs to PloffSearchView.
  function createSearchRequestGroup() {
    var requests = [];
    var aborted = false;
    return {
      add: function (request) {
        if (!request) { return; }
        if (aborted && request.abort) { request.abort(); return; }
        requests.push(request);
      },
      isAborted: function () { return aborted; },
      abort: function () {
        aborted = true;
        while (requests.length) {
          if (requests[0] && requests[0].abort) { requests[0].abort(); }
          requests.shift();
        }
      }
    };
  }

  function resolveCloudSearchLocally(query, cloudItems, group, callback) {
    var candidates = SearchModel.relevantCloudItems(query, cloudItems).slice(0, 12);
    var remaining = candidates.length;
    var resolved = [];
    if (!remaining) { callback([], null); return; }
    candidates.forEach(function (candidate) {
      group.add(PlexClient.findByGuid(config, candidate.guid, function (error, item) {
        if (group.isAborted()) { return; }
        if (!error && item && (item.type === 'movie' || item.type === 'show') && item.ratingKey) { resolved.push(item); }
        remaining -= 1;
        if (!remaining) { callback(resolved, null); }
      }));
    });
  }

  function loadCloudSearchMatches(query, group, callback) {
    var token = watchlistAccountToken();
    function searchProvider(provider) {
      group.add(WatchlistClient.search(root, {
        token: token,
        provider: provider,
        timeout: Math.min(6000, Number(config.requestTimeout || 5000))
      }, query, 12, function (error, cloudItems) {
        if (group.isAborted()) { return; }
        if (error) { callback([], error); return; }
        resolveCloudSearchLocally(query, cloudItems, group, callback);
      }));
    }
    if (!token || !WatchlistClient || !WatchlistClient.search) { callback([], new Error('Cloud search unavailable')); return; }
    if (watchlistView.getProvider()) { searchProvider(watchlistView.getProvider()); return; }
    watchlistView.ensureProvider(function (error, provider) {
      if (group.isAborted()) { return; }
      if (error || !provider) { callback([], error || new Error('Cloud search provider unavailable')); return; }
      searchProvider(provider);
    });
  }

  function loadSearchResults(query, callback) {
    var group = createSearchRequestGroup();
    var localItems = [];
    var localError = null;
    group.add(PlexClient.search(config, query, navigationItems, function (error, items) {
      if (group.isAborted()) { return; }
      localError = error || null;
      localItems = error ? [] : items;
      if (!watchlistAccountToken()) {
        callback(localError, localItems, true);
        return;
      }
      callback(null, localItems, false);
      loadCloudSearchMatches(query, group, function (resolvedItems, cloudError) {
        if (group.isAborted()) { return; }
        callback(localError && cloudError ? localError : null, SearchModel.mergeLocalResults(localItems, resolvedItems), true);
      });
    }));
    return group;
  }

  function measureSearchResults(container, resultCount, cardWidth, cardHeight) {
    var probe = element('button', 'search-card search-card-probe');
    var rect;
    var computed;
    var measured;
    container.appendChild(probe);
    rect = probe.getBoundingClientRect();
    computed = root.getComputedStyle ? root.getComputedStyle(probe) : null;
    cardWidth = rect.width + (computed ? Number(parseFloat(computed.marginLeft) || 0) + Number(parseFloat(computed.marginRight) || 0) : 0);
    cardHeight = rect.height + (computed ? Number(parseFloat(computed.marginTop) || 0) + Number(parseFloat(computed.marginBottom) || 0) : 0);
    container.removeChild(probe);
    if (cardWidth < 1 || cardHeight < 1) {
      cardWidth = cardMetrics().columnStep;
      cardHeight = cardMetrics().rowStep;
    }
    measured = SearchModel.measureLayout(container.clientWidth - 12, container.clientHeight - 12, cardWidth, cardHeight, resultCount);
    measured.cardWidth = Math.max(64, cardWidth);
    measured.cardHeight = Math.max(64, cardHeight);
    return measured;
  }

  searchView = PloffSearchView.create({
    root: root,
    document: document,
    SearchModel: SearchModel,
    SearchSession: SearchSession,
    T9Input: T9Input,
    element: element,
    t: t,
    load: loadSearchResults,
    isActive: function () { return appView === 'search'; },
    t9Enabled: function () { return appSettings.searchT9Input; },
    navigationCount: navigationFocusCount,
    navTarget: function (index) { return document.querySelector(selectorForNavIndex(index)); },
    onNavigationChange: function (index) {
      state.navIndex = index;
      renderNavigation();
      scheduleNavigationPreview(index);
    },
    onActivateNavigation: function (index) {
      state.navIndex = index;
      if (navigationItems[index] && navigationItems[index].kind === 'library') { startNavHold(index); }
      else { activateSearchNav(); }
    },
    onOpenResult: function (item) { openDetail(item); },
    onBack: function () {
      posterLoader.cancelScope('search');
      revealHome({ focus: 'preserve' });
    },
    onBackdrop: scheduleSearchBackdrop,
    clearFocus: clearLogicalFocus,
    pointerSelectionActive: function () { return pointerSelectionActive; },
    prioritizePoster: prioritizePoster,
    mediaTitle: mediaTitle,
    mediaCardMeta: mediaCardMeta,
    mediaCardDetail: mediaCardDetail,
    cardMetrics: cardMetrics,
    measureLayout: measureSearchResults,
    renderedPosterSpecification: renderedPosterSpecification,
    posterLoader: posterLoader,
    resultOverscanRows: resultOverscanRows
  });

  function searchSnapshot() { return searchView.snapshot(); }
  function scheduleSearch() { searchView.schedule(); }
  function updateSearchFocus() { searchView.refreshFocus(); }
  function renderSearchResults() { searchView.refreshResults(); }

  function cancelSearchWork(keepImages) {
    searchView.cancel();
    if (!keepImages) { posterLoader.cancelScope('search'); }
  }

  function leaveSearch() {
    cancelSearchWork();
    searchView.close();
  }

  function revealHome(options) {
    var focus;
    var baseState;
    options = options || {};
    focus = options.focus || 'preserve';
    appView = 'home';
    state.navIndex = 0;
    renderNavigation();
    if (data.rows.length) { hideViewState(); }
    document.getElementById('search-view').className = 'search-view is-hidden';
    document.getElementById('library-view').className = 'library-view is-hidden';
    document.getElementById('watchlist-view').className = 'watchlist-view is-hidden';
    document.getElementById('detail-view').className = 'detail-view is-hidden';
    document.getElementById('app-settings-view').className = 'app-settings-view is-hidden';
    document.getElementById('content').style.display = 'block';
    if (data.rows.length) {
      if (homeDomDirty) {
        usePlexRows(data.rows, 0, { focus: focus, selectionKey: lastHomeSelectionKey });
      } else {
        baseState = focus === 'nav'
          ? { area: 'nav', navIndex: 0, rowIndex: 0, column: 0 }
          : (focus === 'first'
            ? { area: 'media', navIndex: 0, rowIndex: 0, column: 0 }
            : { area: 'media', navIndex: 0, rowIndex: state.rowIndex || 0, column: state.column || 0 });
        state = HomeState.restoreFocus(data.rows, baseState, focus === 'preserve' ? lastHomeSelectionKey : '');
        if (focus === 'first') { document.getElementById('content').scrollTop = 0; }
        updateFocus();
      }
    }
    homePoller.schedule();
    if (options.refresh !== false) { loadHomeRows(); }
  }

  function openSearch(keepNavigationFocus) {
    appView = 'search';
    backgroundAudio.stop();
    document.getElementById('content').style.display = 'none';
    document.getElementById('library-view').className = 'library-view is-hidden';
    document.getElementById('app-settings-view').className = 'app-settings-view is-hidden';
    document.getElementById('detail-view').className = 'detail-view is-hidden';
    renderNavigation();
    searchView.open(keepNavigationFocus, state.navIndex);
    if (keepNavigationFocus) { searchView.focusNavigation(state.navIndex); }
  }

  function activateSearchNav() {
    enterActiveNavigationView();
  }
