(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffSearchFeatureController = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var platformRoot = values.root || {};
    var documentRef = values.document;
    var SearchController = values.SearchController;
    var SearchModel = values.SearchModel;
    var SearchView = values.SearchView;
    var SearchSession = values.SearchSession;
    var T9Input = values.T9Input;
    var PlexClient = values.PlexClient;
    var WatchlistClient = values.WatchlistClient;
    var config = values.config || {};
    var controller = null;
    var destroyed = false;
    var cloudGeneration = 0;
    var cloudRequest = null;
    var providerRequest = null;
    var viewOptions;

    function call(callback, arg1, arg2, arg3, arg4, arg5) {
      if (typeof callback === 'function') { return callback(arg1, arg2, arg3, arg4, arg5); }
      return undefined;
    }

    function currentNavigationItems() {
      return call(values.navigationItems) || [];
    }

    function currentAccountToken() {
      return String(call(values.accountToken) || '');
    }

    function abortCloudWork() {
      if (providerRequest && typeof providerRequest.abort === 'function') { providerRequest.abort(); }
      if (cloudRequest && typeof cloudRequest.abort === 'function') { cloudRequest.abort(); }
      providerRequest = null;
      cloudRequest = null;
    }

    function createElement(tagName, className) {
      var node;
      if (viewOptions && typeof viewOptions.element === 'function') { return viewOptions.element(tagName, className); }
      if (!documentRef || !documentRef.createElement) { return null; }
      node = documentRef.createElement(tagName);
      node.className = className || '';
      return node;
    }

    function searchProvider(provider, token, query, callback, requestGeneration) {
      var completed = false;
      var request;
      if (!WatchlistClient || typeof WatchlistClient.search !== 'function') {
        call(callback, new Error('Cloud search unavailable'), []);
        return null;
      }
      request = WatchlistClient.search(platformRoot, {
        token: token,
        provider: provider,
        timeout: Math.min(6000, Number(config.requestTimeout || 5000))
      }, query, 12, function (error, cloudItems) {
        completed = true;
        if (cloudRequest === request) { cloudRequest = null; }
        if (destroyed || requestGeneration !== cloudGeneration) { return; }
        call(callback, error || null, error ? [] : (cloudItems || []));
      });
      if (!completed) { cloudRequest = request; }
      return request;
    }

    function loadCloudItems(query, callback) {
      var token = currentAccountToken();
      var provider;
      var providerCompleted = false;
      var request;
      var requestGeneration = cloudGeneration + 1;
      cloudGeneration = requestGeneration;
      abortCloudWork();
      if (!token || !WatchlistClient || typeof WatchlistClient.search !== 'function') {
        call(callback, new Error('Cloud search unavailable'), []);
        return null;
      }
      provider = call(values.provider);
      if (provider) { return searchProvider(provider, token, query, callback, requestGeneration); }
      if (typeof values.ensureProvider !== 'function') {
        call(callback, new Error('Cloud search provider unavailable'), []);
        return null;
      }
      request = values.ensureProvider(function (error, resolvedProvider) {
        providerCompleted = true;
        if (providerRequest === request) { providerRequest = null; }
        if (destroyed || requestGeneration !== cloudGeneration) { return; }
        if (error || !resolvedProvider) {
          call(callback, error || new Error('Cloud search provider unavailable'), []);
          return;
        }
        searchProvider(resolvedProvider, token, query, callback, requestGeneration);
      });
      if (!providerCompleted) { providerRequest = request; }
      return request || null;
    }

    function measureResults(container, resultCount, cardWidth, cardHeight) {
      var probe = createElement('button', 'search-card search-card-probe');
      var rect;
      var computed;
      var measured;
      var metrics;
      if (!container || !probe) {
        metrics = call(values.cardMetrics) || {};
        cardWidth = Number(metrics.columnStep || cardWidth || 64);
        cardHeight = Number(metrics.rowStep || cardHeight || 64);
        measured = SearchModel.measureLayout(0, 0, cardWidth, cardHeight, resultCount);
        measured.cardWidth = Math.max(64, cardWidth);
        measured.cardHeight = Math.max(64, cardHeight);
        return measured;
      }
      container.appendChild(probe);
      rect = probe.getBoundingClientRect();
      computed = platformRoot.getComputedStyle ? platformRoot.getComputedStyle(probe) : null;
      cardWidth = rect.width + (computed ? Number(parseFloat(computed.marginLeft) || 0) + Number(parseFloat(computed.marginRight) || 0) : 0);
      cardHeight = rect.height + (computed ? Number(parseFloat(computed.marginTop) || 0) + Number(parseFloat(computed.marginBottom) || 0) : 0);
      container.removeChild(probe);
      if (cardWidth < 1 || cardHeight < 1) {
        metrics = call(values.cardMetrics) || {};
        cardWidth = Number(metrics.columnStep || 64);
        cardHeight = Number(metrics.rowStep || 64);
      }
      measured = SearchModel.measureLayout(container.clientWidth - 12, container.clientHeight - 12, cardWidth, cardHeight, resultCount);
      measured.cardWidth = Math.max(64, cardWidth);
      measured.cardHeight = Math.max(64, cardHeight);
      return measured;
    }

    function snapshot() {
      if (!controller || typeof controller.snapshot !== 'function') {
        return { open: false, query: '', results: [], focus: { zone: 'keyboard', index: 0, navIndex: 0 } };
      }
      return controller.snapshot();
    }

    function enter(options) {
      options = options || {};
      if (destroyed) { return snapshot(); }
      controller.open(options.keepNavigationFocus === true, Number(options.navigationIndex || 0));
      return snapshot();
    }

    function leave(options) {
      options = options || {};
      if (destroyed) { return snapshot(); }
      cloudGeneration += 1;
      abortCloudWork();
      controller.close(options.keepImages === true, options.preserveBackgroundAudio === true);
      return snapshot();
    }

    function resume() {
      if (destroyed || !controller.resume) { return snapshot(); }
      controller.resume();
      return snapshot();
    }


    function handleKey(event, direction) {
      if (destroyed) { return false; }
      return controller.handleKey(event, direction);
    }

    function pointerFocus(target) {
      if (destroyed) { return snapshot(); }
      return controller.pointerFocus(target);
    }


    function focusNavigation(index) {
      if (destroyed) { return snapshot(); }
      return controller.focusNavigation(index);
    }

    function focusKeyboard(row, column) {
      if (destroyed) { return snapshot(); }
      return controller.focusKeyboard(row, column);
    }

    function restoreResultFocus(index) {
      if (destroyed) { return snapshot(); }
      return controller.focusResult(index);
    }

    function refreshFocus() {
      if (destroyed) { return snapshot(); }
      controller.refreshFocus();
      return snapshot();
    }

    function refresh() {
      if (destroyed) { return snapshot(); }
      controller.refreshResults();
      controller.refreshFocus();
      return snapshot();
    }

    function retryAfterNetwork() {
      var stateValue;
      if (destroyed) { return false; }
      stateValue = snapshot();
      if (!stateValue.open || String(stateValue.query || '').replace(/^\s+|\s+$/g, '').length < 2) { return false; }
      controller.schedule();
      return true;
    }

    function hasNavigationFocus() {
      return !destroyed && snapshot().focus && snapshot().focus.zone === 'nav';
    }

    function destroy() {
      if (destroyed) { return; }
      destroyed = true;
      cloudGeneration += 1;
      abortCloudWork();
      if (controller && typeof controller.destroy === 'function') { controller.destroy(); }
      controller = null;
    }

    if (!SearchController || typeof SearchController.create !== 'function') {
      throw new Error('SearchFeatureController requires SearchController');
    }
    if (!SearchModel || typeof SearchModel.measureLayout !== 'function') {
      throw new Error('SearchFeatureController requires SearchModel');
    }
    if (!SearchView || !SearchSession || !T9Input || !PlexClient) {
      throw new Error('SearchFeatureController dependencies are unavailable');
    }

    viewOptions = {
      root: platformRoot,
      document: documentRef,
      SearchModel: SearchModel,
      SearchSession: SearchSession,
      T9Input: T9Input,
      element: values.element,
      t: values.t,
      isActive: function () { return !destroyed && call(values.isActive) !== false; },
      t9Enabled: function () { return call(values.t9Enabled) !== false; },
      navigationCount: values.navigationCount,
      navTarget: values.navTarget,
      onNavigationChange: function (index) { call(values.onNavigationChange, index); },
      onActivateNavigation: function (index) { call(values.onActivateNavigation, index); },
      onOpenResult: function (item, index) { call(values.onOpenResult, item, index); },
      onBack: function () { call(values.onBack); },
      onBackdrop: function (item) { call(values.onBackdrop, item); },
      onFocus: function (focus) {
        var stateValue = snapshot();
        var item = focus && focus.zone === 'results' && stateValue.results ? stateValue.results[focus.index] : null;
        call(values.onFocusItem, item, focus, stateValue);
      },
      clearFocus: values.clearFocus,
      pointerSelectionActive: values.pointerSelectionActive,
      prioritizePoster: values.prioritizePoster,
      mediaTitle: values.mediaTitle,
      mediaCardMeta: values.mediaCardMeta,
      mediaCardDetail: values.mediaCardDetail,
      cardMetrics: values.cardMetrics,
      cardProfile: values.cardProfile,
      measureLayout: measureResults,
      renderedPosterSpecification: values.renderedPosterSpecification,
      fixedPosterSpecification: values.fixedPosterSpecification,
      posterLoader: values.posterLoader,
      resultOverscanRows: Number(values.resultOverscanRows || 3)
    };

    controller = SearchController.create({
      modules: { SearchModel: SearchModel, SearchView: SearchView },
      viewOptions: viewOptions,
      services: {
        localSearch: function (query, callback) { return PlexClient.search(config, query, currentNavigationItems(), callback); },
        cloudEligible: function () { return call(values.allowsCloud) === true && !!currentAccountToken(); },
        cloudSearch: loadCloudItems,
        resolveCloudItem: function (candidate, callback) { return PlexClient.findByGuid(config, candidate.guid, callback); }
      },
      actions: {
        playItem: values.playItem,
        stopBackgroundAudio: values.stopBackgroundAudio,
        cancelImages: values.cancelImages
      },
      t9Enabled: function () { return call(values.t9Enabled) !== false; }
    });

    return {
      destroy: destroy,
      enter: enter,
      focusKeyboard: focusKeyboard,
      focusNavigation: focusNavigation,
      handleKey: handleKey,
      hasNavigationFocus: hasNavigationFocus,
      leave: leave,
      pointerFocus: pointerFocus,
      refresh: refresh,
      refreshFocus: refreshFocus,
      resume: resume,
      restoreResultFocus: restoreResultFocus,
      retryAfterNetwork: retryAfterNetwork,
      snapshot: snapshot
    };
  }

  return { create: create };
}));
