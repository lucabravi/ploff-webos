(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffWatchlistView = factory(); }
}(this, function () {
  'use strict';

  function array(value) {
    return Object.prototype.toString.call(value) === '[object Array]' ? value : [];
  }

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, Number(value) || 0));
  }

  function create(options) {
    var values = options || {};
    var documentRef = values.document;
    var state = {
      open: false, items: [], focusIndex: 0, zone: 'grid', provider: null,
      generation: 0, providerGeneration: 0, request: null, localRequests: [], providerRequest: null,
      loading: false, error: null, loadedIdentity: '', byLocalKey: {}, mutationPending: false,
      providerCallbacks: []
    };

    function node(id) { return documentRef && documentRef.getElementById ? documentRef.getElementById(id) : null; }
    function currentIdentity() { return values.identity ? String(values.identity() || '') : ''; }
    function available() { return values.available ? !!values.available() : true; }
    function timeout() { return Math.min(8000, Number(values.timeout ? values.timeout() : 6000) || 6000); }
    function title(item) { return values.mediaTitle ? values.mediaTitle(item) : String(item && item.title || ''); }
    function meta(item) { return values.mediaCardMeta ? values.mediaCardMeta(item) : ''; }
    function detail(item) { return values.mediaCardDetail ? values.mediaCardDetail(item) : ''; }
    function columns() { return Math.max(1, Number(values.columns ? values.columns() : 1) || 1); }
    function pointerActive() { return values.pointerSelectionActive ? !!values.pointerSelectionActive() : false; }
    function setText(target, text) { if (target) { target.textContent = String(text || ''); } }
    function element(tagName, className, text) {
      var value;
      if (values.element) { return values.element(tagName, className, text); }
      value = documentRef.createElement(tagName); value.className = className || '';
      if (text !== undefined) { value.textContent = String(text); }
      return value;
    }
    function optionsForProvider() {
      return { token: values.accountToken ? values.accountToken() : '', provider: state.provider, timeout: timeout() };
    }
    function snapshot() {
      return {
        open: state.open, items: state.items.slice(), focusIndex: state.focusIndex, zone: state.zone,
        provider: state.provider, loading: state.loading, error: state.error, loadedIdentity: state.loadedIdentity,
        mutationPending: state.mutationPending
      };
    }
    function notifyItemsChanged() { if (values.onItemsChanged) { values.onItemsChanged(snapshot()); } }
    function indexItems() {
      state.byLocalKey = {};
      state.items.forEach(function (item) { if (item && item.ratingKey) { state.byLocalKey[String(item.ratingKey)] = item; } });
    }
    function cancelRequest(request) { if (request && request.abort) { request.abort(); } }
    function cancel() {
      cancelRequest(state.request); state.request = null;
      cancelRequest(state.providerRequest); state.providerRequest = null;
      while (state.localRequests.length) { cancelRequest(state.localRequests.shift()); }
      state.providerGeneration += 1;
      state.providerCallbacks = [];
    }
    function statusKey() {
      return values.WatchlistState && values.WatchlistState.statusKey ? values.WatchlistState.statusKey(state.loading, state.error, state.items.length) : '';
    }
    function renderStatus() {
      var key = statusKey();
      setText(node(values.statusId || 'watchlist-status'), key && values.t ? values.t(key) : '');
      if (values.renderStatus) { values.renderStatus(key); }
    }
    function applyFocus() {
      var target;
      var container;
      var targetRect;
      var containerRect;
      if (values.clearFocus) { values.clearFocus(); }
      if (state.zone === 'nav') { target = values.navTarget ? values.navTarget() : null; }
      else { target = documentRef && documentRef.querySelector ? documentRef.querySelector('[data-watchlist-index="' + state.focusIndex + '"]') : null; }
      if (target) {
        target.className += ' is-focused';
        if (state.zone === 'grid' && values.prioritizePoster) { values.prioritizePoster(target); }
        if (!pointerActive() && target.focus) {
          target.focus();
          if (state.zone === 'grid') {
            container = node(values.gridId || 'watchlist-grid');
            if (container && target.getBoundingClientRect && container.getBoundingClientRect) {
              targetRect = target.getBoundingClientRect(); containerRect = container.getBoundingClientRect();
              if (targetRect.bottom > containerRect.bottom - 12) { container.scrollTop += targetRect.bottom - containerRect.bottom + 12; }
              else if (targetRect.top < containerRect.top + 12) { container.scrollTop -= containerRect.top - targetRect.top + 12; }
            }
          }
        }
      }
      if (state.zone === 'grid' && state.items[state.focusIndex]) {
        if (values.onFocus) { values.onFocus(state.items[state.focusIndex]); }
      } else if (values.onNavigationFocus) { values.onNavigationFocus(); }
      if (values.renderFocus) { values.renderFocus(snapshot()); }
    }
    function renderGrid() {
      var content = node(values.contentId || 'watchlist-grid-content');
      var jobs = [];
      var index;
      var item;
      var card;
      var image;
      var caption;
      var metrics;
      if (!content) { if (values.render) { values.render(snapshot()); } return; }
      if (values.posterLoader && values.posterLoader.cancelScope) { values.posterLoader.cancelScope(values.scope || 'watchlist'); }
      content.innerHTML = '';
      metrics = values.cardMetrics ? values.cardMetrics() : { width: 200, imageHeight: 300 };
      for (index = 0; index < state.items.length; index += 1) {
        item = state.items[index];
        card = element('button', 'watchlist-card' + (item.viewed ? ' is-viewed' : ''));
        card.type = 'button'; card.setAttribute('data-watchlist-index', index);
        image = element('img', 'library-card-image'); image.alt = ''; card.appendChild(image);
        if (typeof item.rating === 'number' && !isNaN(item.rating)) { card.appendChild(element('span', 'library-rating-badge', '\u2665 ' + item.rating.toFixed(1))); }
        caption = element('span', 'library-card-caption');
        caption.appendChild(element('span', 'library-card-title', title(item)));
        caption.appendChild(element('span', 'library-card-meta', meta(item)));
        caption.appendChild(element('span', 'library-card-detail', detail(item)));
        card.appendChild(caption); content.appendChild(card);
        if (values.renderedPosterSpecification) {
          jobs.push({ target: image, specification: values.renderedPosterSpecification(image, item.image, index === state.focusIndex ? 0 : 1, values.scope || 'watchlist', metrics.width, metrics.imageHeight) });
        }
      }
      if (values.posterLoader && values.posterLoader.loadBatch) { values.posterLoader.loadBatch(jobs); }
      if (values.render) { values.render(snapshot()); }
    }
    function render() {
      if (!state.open) { return; }
      renderStatus(); renderGrid(); applyFocus();
    }
    function finishProvider(error, provider) {
      var callbacks = state.providerCallbacks.slice();
      state.providerCallbacks = [];
      state.providerRequest = null;
      callbacks.forEach(function (callback) { callback(error || null, provider || null); });
    }
    function ensureProvider(callback) {
      var generation;
      if (state.provider) { callback(null, state.provider); return; }
      if (!available()) { callback(new Error('Watchlist unavailable')); return; }
      state.providerCallbacks.push(callback);
      if (state.providerRequest) { return; }
      generation = state.providerGeneration + 1;
      state.providerGeneration = generation;
      state.providerRequest = values.discover(optionsForProvider(), function (error, provider) {
        if (generation !== state.providerGeneration) { return; }
        if (error) { finishProvider(error); return; }
        state.provider = provider || null;
        finishProvider(state.provider ? null : new Error('Watchlist provider unavailable'), state.provider);
      });
    }
    function completeLoad(generation, identity, error, items, callback) {
      if (generation !== state.generation) { return; }
      state.loading = false;
      state.error = error || null;
      state.items = error ? [] : array(items);
      state.loadedIdentity = identity;
      state.focusIndex = clamp(state.focusIndex, 0, Math.max(0, state.items.length - 1));
      if (!state.items.length && state.zone === 'grid') { state.zone = 'nav'; }
      indexItems(); notifyItemsChanged(); render();
      if (callback) { callback(error || null, state.items.slice()); }
    }
    function load(force, callback) {
      var identity = currentIdentity();
      var generation;
      if (!available()) { if (callback) { callback(new Error('Watchlist unavailable'), []); } return; }
      if (!force && state.loadedIdentity === identity) {
        state.error = null; renderStatus(); if (callback) { callback(null, state.items.slice()); } return;
      }
      if (!force && state.loading) { return; }
      state.generation += 1; generation = state.generation; cancel(); state.loading = true; state.error = null; renderStatus();
      ensureProvider(function (providerError, provider) {
        if (generation !== state.generation) { return; }
        if (providerError || !provider) { completeLoad(generation, identity, providerError || new Error('Watchlist provider unavailable'), [], callback); return; }
        state.request = values.load(optionsForProvider(), function (loadError, cloudItems) {
          if (generation !== state.generation) { return; }
          if (loadError) { completeLoad(generation, identity, loadError, [], callback); return; }
          values.WatchlistState.resolve(cloudItems, function (guid, resolved) {
            var request = values.findByGuid(guid, resolved);
            state.localRequests.push(request);
          }, 4, function (resolveError, localItems) { completeLoad(generation, identity, resolveError, localItems, callback); });
        });
      });
    }
    function open(keepNavigationFocus) {
      state.open = true; state.zone = keepNavigationFocus ? 'nav' : (state.items.length ? 'grid' : 'nav'); state.focusIndex = 0; render();
    }
    function leave() {
      state.open = false;
      if (values.posterLoader && values.posterLoader.cancelScope) { values.posterLoader.cancelScope(values.scope || 'watchlist'); }
    }
    function reset() {
      state.generation += 1; cancel();
      state.items = []; state.focusIndex = 0; state.zone = 'nav'; state.provider = null;
      state.loading = false; state.error = null; state.loadedIdentity = ''; state.byLocalKey = {}; state.mutationPending = false;
      notifyItemsChanged();
    }
    function setFocus(index) { state.zone = 'grid'; state.focusIndex = clamp(index, 0, Math.max(0, state.items.length - 1)); applyFocus(); }
    function focusNavigation() { state.zone = 'nav'; applyFocus(); }
    function focusContent() { if (state.items.length) { state.zone = 'grid'; } else { state.zone = 'nav'; } applyFocus(); }
    function focusedItem() { return state.items[state.focusIndex] || null; }
    function handleKeyDown(event, direction) {
      var item;
      var next;
      if (event && event.preventDefault) { event.preventDefault(); }
      if (event && (event.keyCode === 27 || event.keyCode === 461)) { if (values.onBack) { values.onBack(); } return; }
      if (event && event.keyCode === 415 && state.zone === 'grid' && focusedItem()) { if (values.onPlay) { values.onPlay(focusedItem()); } return; }
      if (state.zone === 'nav') {
        if (direction === 'left' || direction === 'right') { if (values.onNavigate) { values.onNavigate(direction); } applyFocus(); }
        else if (direction === 'down' && state.items.length) { state.zone = 'grid'; applyFocus(); }
        else if (event && event.keyCode === 13 && values.onEnterNavigation) { values.onEnterNavigation(); }
        return;
      }
      if (!state.items.length) { if (direction === 'up') { state.zone = 'nav'; applyFocus(); } return; }
      if (direction === 'left') { state.focusIndex = Math.max(0, state.focusIndex - 1); }
      else if (direction === 'right') { state.focusIndex = Math.min(state.items.length - 1, state.focusIndex + 1); }
      else if (direction === 'up') {
        if (state.focusIndex < columns()) { state.zone = 'nav'; }
        else { state.focusIndex -= columns(); }
      } else if (direction === 'down') {
        next = state.focusIndex + columns(); state.focusIndex = Math.min(state.items.length - 1, next);
      } else if (event && event.keyCode === 13) {
        item = focusedItem(); if (item && values.onOpenDetail) { values.onOpenDetail(item); } return;
      }
      applyFocus();
    }
    function pointerIndex(value) {
      if (typeof value === 'number') { return value; }
      return value && value.getAttribute ? Number(value.getAttribute('data-watchlist-index')) : -1;
    }
    function pointerFocus(value) { var index = pointerIndex(value); if (index >= 0) { setFocus(index); } }
    function activatePointer(value) { var index = pointerIndex(value); return index >= 0 ? state.items[index] || null : null; }
    function restoreFocus(value) { pointerFocus(value); }
    function findLocal(key) { return state.byLocalKey[String(key || '')] || null; }
    function setProvider(provider) { state.provider = provider || null; }
    function getProvider() { return state.provider; }
    function seed(items) { state.items = array(items); indexItems(); state.focusIndex = clamp(state.focusIndex, 0, Math.max(0, state.items.length - 1)); }
    function toggle(cloudKey, enabled, item, callback) {
      var previous;
      var local;
      var mutation;
      if (!available() || !state.provider || state.mutationPending || !cloudKey) { if (callback) { callback(new Error('Watchlist unavailable')); } return; }
      previous = state.items.slice(); state.mutationPending = true;
      local = item || {};
      local.ratingKey = local.ratingKey || cloudKey; local.cloudRatingKey = cloudKey; local.inWatchlist = !!enabled;
      mutation = values.WatchlistState.optimistic(state.items, local, enabled);
      state.items = mutation.items; state.focusIndex = clamp(state.focusIndex, 0, Math.max(0, state.items.length - 1)); indexItems(); notifyItemsChanged(); render();
      values.set(optionsForProvider(), cloudKey, enabled, function (error) {
        state.mutationPending = false;
        if (error) { state.items = previous; state.focusIndex = clamp(state.focusIndex, 0, Math.max(0, state.items.length - 1)); indexItems(); notifyItemsChanged(); render(); if (callback) { callback(error); } return; }
        if (callback) { callback(null, local); }
      });
    }

    return {
      snapshot: snapshot, open: open, leave: leave, close: leave, load: load, cancel: cancel, reset: reset,
      render: render, refreshFocus: applyFocus, setFocus: setFocus, focusNavigation: focusNavigation, focusContent: focusContent,
      focusedItem: focusedItem, handleKeyDown: handleKeyDown,
      pointerFocus: pointerFocus, activatePointer: activatePointer, restoreFocus: restoreFocus, findLocal: findLocal,
      setProvider: setProvider, getProvider: getProvider, ensureProvider: ensureProvider, toggle: toggle, seed: seed
    };
  }

  return { create: create };
}));
