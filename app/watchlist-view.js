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
    var rootRef = values.root || {};
    var documentRef = values.document;
    var mountedCardsByIndex = {};
    var focusTarget = null;
    var focusZone = '';
    var focusIndex = -1;
    var scrollFrame = null;
    var scrollFrameKind = '';
    var scrollGeneration = 0;
    var state = {
      open: false, items: [], focusIndex: 0, zone: 'grid', provider: null,
      generation: 0, providerGeneration: 0, request: null, localRequests: [], providerRequest: null, mutationRequest: null,
      loading: false, error: null, loadedIdentity: '', byLocalKey: {}, mutationPending: false,
      providerCallbacks: [], mountedStart: 0, mountedEnd: 0, mountedItemCount: -1,
      mountedColumns: 0, mountedRowHeight: 0, lastDirection: 'right'
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
    function active() { return values.isActive ? !!values.isActive() : true; }
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
    function itemKey(item) {
      var machine = String(item && item.serverMachineIdentifier || '');
      var local = String(item && item.ratingKey || '');
      return machine && local ? machine + '|' + local : local;
    }
    function indexItems() {
      state.byLocalKey = {};
      state.items.forEach(function (item) {
        var key = itemKey(item);
        if (key) { state.byLocalKey[key] = item; }
      });
    }
    function adjacentItems(direction) {
      var result = [];
      var seen = {};
      var columnCount = columns();
      var current = state.focusIndex;
      var offsets;
      var index;
      function add(targetIndex, horizontal) {
        var item;
        var key;
        if (targetIndex < 0 || targetIndex >= state.items.length) { return; }
        if (horizontal && Math.floor(targetIndex / columnCount) !== Math.floor(current / columnCount)) { return; }
        item = state.items[targetIndex];
        key = itemKey(item);
        if (!item || !key || seen[key] || targetIndex === current) { return; }
        seen[key] = true;
        result.push(item);
      }
      if (direction === 'left') { offsets = ['left', 'right', 'down', 'up']; }
      else if (direction === 'down') { offsets = ['down', 'up', 'right', 'left']; }
      else if (direction === 'up') { offsets = ['up', 'down', 'right', 'left']; }
      else { offsets = ['right', 'left', 'down', 'up']; }
      for (index = 0; index < offsets.length; index += 1) {
        if (offsets[index] === 'left') { add(current - 1, true); }
        else if (offsets[index] === 'right') { add(current + 1, true); }
        else if (offsets[index] === 'down') { add(current + columnCount, false); }
        else { add(current - columnCount, false); }
      }
      return result;
    }
    function restoreItemFocus(previousKey, previousIndex) {
      var index;
      var match = -1;
      if (previousKey) {
        for (index = 0; index < state.items.length; index += 1) {
          if (itemKey(state.items[index]) === previousKey) { match = index; break; }
        }
      }
      state.focusIndex = match >= 0 ? match : clamp(previousIndex, 0, Math.max(0, state.items.length - 1));
      if (!state.items.length && state.zone === 'grid') { state.zone = 'nav'; }
    }
    function cancelRequest(request) { if (request && request.abort) { request.abort(); } }
    function cancel() {
      cancelRequest(state.request); state.request = null;
      cancelRequest(state.providerRequest); state.providerRequest = null;
      cancelRequest(state.mutationRequest); state.mutationRequest = null;
      while (state.localRequests.length) { cancelRequest(state.localRequests.shift()); }
      state.providerGeneration += 1;
      state.providerCallbacks = [];
      state.mutationPending = false;
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
      if (focusTarget && focusZone === 'grid' && state.zone === 'grid' && mountedCardsByIndex[focusIndex] === focusTarget) {
        focusTarget.className = String(focusTarget.className || '').replace(/\s*is-focused/g, '');
      } else if (values.clearFocus) { values.clearFocus(); }
      if (state.zone === 'nav') { target = values.navTarget ? values.navTarget() : null; }
      else {
        target = mountedCardsByIndex[state.focusIndex] || null;
        if (!target && documentRef && documentRef.querySelector) { target = documentRef.querySelector('[data-watchlist-index="' + state.focusIndex + '"]'); }
      }
      if (target) {
        if ((' ' + String(target.className || '') + ' ').indexOf(' is-focused ') === -1) { target.className += ' is-focused'; }
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
      focusTarget = target || null;
      focusZone = state.zone;
      focusIndex = state.focusIndex;
      if (state.zone === 'grid' && state.items[state.focusIndex]) {
        if (values.onFocus) { values.onFocus(state.items[state.focusIndex], adjacentItems(state.lastDirection)); }
      } else if (values.onNavigationFocus) { values.onNavigationFocus(); }
      if (values.renderFocus) { values.renderFocus(snapshot()); }
    }
    function rangeForRow(row) {
      var columnCount = columns();
      var totalRows = Math.ceil(state.items.length / columnCount);
      var startRow;
      var endRow;
      row = totalRows ? clamp(row, 0, totalRows - 1) : 0;
      startRow = Math.max(0, row - 2);
      endRow = Math.min(totalRows, row + 3);
      return { start: startRow * columnCount, end: Math.min(state.items.length, endRow * columnCount) };
    }
    function mountedRange() {
      return rangeForRow(Math.floor(state.focusIndex / columns()));
    }
    function virtualRowHeight(profile, metrics) {
      var height = profile && profile.metrics ? Number(profile.metrics.height || 0) : Number(metrics && metrics.height || 0);
      var gap = profile ? Number(profile.posterGap || 0) : 0;
      if (!height) { height = Number(metrics && metrics.imageHeight || 0); }
      return Math.max(0, height + gap);
    }
    function spacerFor(className, itemCount, columnCount, rowHeight) {
      var rowCount;
      var spacer;
      if (!itemCount || !rowHeight) { return null; }
      rowCount = Math.ceil(itemCount / columnCount);
      if (!rowCount) { return null; }
      spacer = element('div', className);
      spacer.style.width = '100%';
      spacer.style.height = String(rowCount * rowHeight) + 'px';
      spacer.style.flex = '0 0 100%';
      spacer.setAttribute('aria-hidden', 'true');
      return spacer;
    }
    function cardSignature(item) {
      return [itemKey(item), title(item), meta(item), detail(item), item && item.libraryTitle || '',
        item && item.image || '', item && item.rating, item && item.viewed === true].join('\u001f');
    }
    function posterJob(image, item, index, profile, metrics) {
      var sourceContext = values.sourceContextForItem ? values.sourceContextForItem(item) : null;
      var specification;
      if (values.fixedPosterSpecification && profile && profile.poster) {
        specification = values.fixedPosterSpecification(item.image, profile.poster, index === state.focusIndex ? 0 : 1, values.scope || 'watchlist', sourceContext, item);
      } else if (values.renderedPosterSpecification) {
        specification = values.renderedPosterSpecification(image, item.image, index === state.focusIndex ? 0 : 1, values.scope || 'watchlist', metrics.width, metrics.imageHeight, sourceContext, item);
      }
      return specification ? { target: image, specification: specification } : null;
    }
    function focusIsMounted() {
      return state.focusIndex >= state.mountedStart && state.focusIndex < state.mountedEnd;
    }
    function ensureFocusMounted() {
      if (state.open && state.items.length && !focusIsMounted()) { renderGrid(); }
    }

    function renderGrid(rangeOverride) {
      var content = node(values.contentId || 'watchlist-grid-content');
      var jobs = [];
      var previousCards = mountedCardsByIndex;
      var nextCards = {};
      var desiredNodes = [];
      var index;
      var item;
      var card;
      var image;
      var caption;
      var profile;
      var metrics;
      var range;
      var columnCount;
      var rowHeight;
      var signature;
      var spacer;
      var unchanged;
      if (!content) {
        mountedCardsByIndex = {};
        state.mountedStart = -1;
        state.mountedEnd = -1;
        state.mountedItemCount = -1;
        if (values.render) { values.render(snapshot()); }
        return;
      }
      profile = values.cardProfile ? values.cardProfile() : null;
      metrics = profile ? profile.metrics : (values.cardMetrics ? values.cardMetrics() : { width: 200, imageHeight: 300 });
      range = rangeOverride || mountedRange();
      columnCount = columns();
      rowHeight = virtualRowHeight(profile, metrics);
      unchanged = range.end > range.start && range.start === state.mountedStart && range.end === state.mountedEnd &&
        state.mountedItemCount === state.items.length && state.mountedColumns === columnCount && state.mountedRowHeight === rowHeight;
      for (index = range.start; unchanged && index < range.end; index += 1) {
        card = previousCards[index];
        if (!card || card.__ploffWatchlistSignature !== cardSignature(state.items[index])) { unchanged = false; }
      }
      if (unchanged) {
        if (!rangeOverride && values.posterLoader && values.posterLoader.loadBatch) {
          for (index = range.start; index < range.end; index += 1) {
            card = previousCards[index];
            image = card.querySelector('.library-card-image');
            if (image) {
              var existingJob = posterJob(image, state.items[index], index, profile, metrics);
              if (existingJob) { jobs.push(existingJob); }
            }
          }
          values.posterLoader.loadBatch(jobs);
        }
        if (values.render) { values.render(snapshot()); }
        return;
      }
      state.mountedStart = range.start;
      state.mountedEnd = range.end;
      state.mountedItemCount = state.items.length;
      state.mountedColumns = columnCount;
      state.mountedRowHeight = rowHeight;
      spacer = spacerFor('watchlist-virtual-spacer is-before', range.start, columnCount, rowHeight);
      if (spacer) { desiredNodes.push(spacer); }
      for (index = range.start; index < range.end; index += 1) {
        item = state.items[index];
        signature = cardSignature(item);
        card = previousCards[index];
        if (!card || card.__ploffWatchlistSignature !== signature) {
          card = element('button', 'watchlist-card' + (item.viewed ? ' is-viewed' : ''));
          card.type = 'button'; card.setAttribute('data-watchlist-index', index);
          card.__ploffWatchlistSignature = signature;
          image = element('img', 'library-card-image'); image.alt = ''; card.appendChild(image);
          if (item.libraryTitle) { card.appendChild(element('span', 'watchlist-library-badge media-library-badge', item.libraryTitle)); }
          card.setAttribute('aria-label', title(item) + (item.libraryTitle ? ', ' + item.libraryTitle : ''));
          if (typeof item.rating === 'number' && !isNaN(item.rating)) { card.appendChild(element('span', 'library-rating-badge', '\u2665 ' + item.rating.toFixed(1))); }
          caption = element('span', 'library-card-caption');
          caption.appendChild(element('span', 'library-card-title', title(item)));
          caption.appendChild(element('span', 'library-card-meta', meta(item)));
          caption.appendChild(element('span', 'library-card-detail', detail(item)));
          card.appendChild(caption);
        }
        if (!rangeOverride || card !== previousCards[index]) {
          image = card.querySelector('.library-card-image');
          if (image) {
            var nextJob = posterJob(image, item, index, profile, metrics);
            if (nextJob) { jobs.push(nextJob); }
          }
        }
        nextCards[index] = card;
        desiredNodes.push(card);
      }
      spacer = spacerFor('watchlist-virtual-spacer is-after', state.items.length - range.end, columnCount, rowHeight);
      if (spacer) { desiredNodes.push(spacer); }
      for (index in previousCards) {
        if (Object.prototype.hasOwnProperty.call(previousCards, index) && previousCards[index] !== nextCards[index] &&
            values.posterLoader && values.posterLoader.cancel) {
          values.posterLoader.cancel(previousCards[index].querySelector('.library-card-image'));
        }
      }
      content.innerHTML = '';
      for (index = 0; index < desiredNodes.length; index += 1) { content.appendChild(desiredNodes[index]); }
      mountedCardsByIndex = nextCards;
      if (values.posterLoader && values.posterLoader.loadBatch) { values.posterLoader.loadBatch(jobs); }
      if (values.render) { values.render(snapshot()); }
    }
    function reconcileScroll() {
      var container = node(values.gridId || 'watchlist-grid');
      var profile;
      var metrics;
      var rowHeight;
      var row;
      var range;
      scrollFrame = null;
      scrollFrameKind = '';
      if (!state.open || !state.items.length || !container) { return; }
      profile = values.cardProfile ? values.cardProfile() : null;
      metrics = profile ? profile.metrics : (values.cardMetrics ? values.cardMetrics() : { width: 200, imageHeight: 300 });
      rowHeight = virtualRowHeight(profile, metrics);
      if (!rowHeight) { return; }
      row = Math.max(0, Math.floor((Number(container.scrollTop) || 0) / rowHeight));
      range = rangeForRow(row);
      if (range.start !== state.mountedStart || range.end !== state.mountedEnd) { renderGrid(range); }
    }
    function cancelScrollUpdate() {
      scrollGeneration += 1;
      if (scrollFrame === null) { return; }
      if (scrollFrameKind === 'raf' && rootRef.cancelAnimationFrame) { rootRef.cancelAnimationFrame(scrollFrame); }
      else if (scrollFrameKind === 'timeout' && rootRef.clearTimeout) { rootRef.clearTimeout(scrollFrame); }
      scrollFrame = null;
      scrollFrameKind = '';
    }
    function onScroll() {
      var generation;
      if (!state.open || !state.items.length || !node(values.gridId || 'watchlist-grid')) { return; }
      if (scrollFrame !== null) { return; }
      if (values.posterLoader && values.posterLoader.deferFullLoads) { values.posterLoader.deferFullLoads(120); }
      generation = scrollGeneration;
      if (rootRef.requestAnimationFrame) {
        scrollFrameKind = 'raf';
        scrollFrame = rootRef.requestAnimationFrame(function () {
          if (generation !== scrollGeneration) { return; }
          reconcileScroll();
        });
        return;
      }
      if (rootRef.setTimeout) {
        scrollFrameKind = 'timeout';
        scrollFrame = rootRef.setTimeout(function () {
          if (generation !== scrollGeneration) { return; }
          reconcileScroll();
        }, 0);
        return;
      }
      reconcileScroll();
    }
    function render() {
      if (!state.open) { return; }
      renderStatus(); renderGrid();
      if (active()) { applyFocus(); }
      else { focusTarget = null; focusZone = ''; focusIndex = -1; }
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
      var previousKey = itemKey(state.items[state.focusIndex]);
      var previousIndex = state.focusIndex;
      if (generation !== state.generation) { return; }
      state.request = null;
      state.localRequests = [];
      state.loading = false;
      state.error = error || null;
      state.items = array(items);
      state.loadedIdentity = error ? '' : identity;
      restoreItemFocus(previousKey, previousIndex);
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
      cancelScrollUpdate();
      focusTarget = null;
      focusZone = '';
      focusIndex = -1;
      if (values.posterLoader && values.posterLoader.cancelScope) { values.posterLoader.cancelScope(values.scope || 'watchlist'); }
      mountedCardsByIndex = {};
      state.mountedStart = -1;
      state.mountedEnd = -1;
      state.mountedItemCount = -1;
    }
    function reset() {
      cancelScrollUpdate();
      state.generation += 1; cancel();
      state.items = []; state.focusIndex = 0; state.zone = 'nav'; state.provider = null;
      state.mountedStart = 0; state.mountedEnd = 0;
      state.mountedItemCount = -1;
      mountedCardsByIndex = {};
      focusTarget = null; focusZone = ''; focusIndex = -1;
      state.loading = false; state.error = null; state.loadedIdentity = ''; state.byLocalKey = {}; state.mutationPending = false;
      notifyItemsChanged();
    }
    function setFocus(index) { state.zone = 'grid'; state.focusIndex = clamp(index, 0, Math.max(0, state.items.length - 1)); ensureFocusMounted(); applyFocus(); }
    function focusNavigation() { state.zone = 'nav'; applyFocus(); }
    function focusContent() { if (state.items.length) { state.zone = 'grid'; } else { state.zone = 'nav'; } applyFocus(); }
    function focusedItem() { return state.items[state.focusIndex] || null; }
    function handleKeyDown(event, direction) {
      var item;
      var next;
      if (event && event.preventDefault) { event.preventDefault(); }
      if (event && (event.keyCode === 27 || event.keyCode === 461)) {
        if (state.zone !== 'nav') { state.zone = 'nav'; applyFocus(); }
        else if (values.onBack) { values.onBack(); }
        return;
      }
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
      if (direction) { state.lastDirection = direction; }
      ensureFocusMounted();
      applyFocus();
    }
    function pointerIndex(value) {
      if (typeof value === 'number') { return value; }
      return value && value.getAttribute ? Number(value.getAttribute('data-watchlist-index')) : -1;
    }
    function pointerFocus(value) { var index = pointerIndex(value); if (index >= 0) { setFocus(index); } }
    function restoreFocus(value) { pointerFocus(value); }
    function findLocal(key, machineIdentifier) {
      var local = String(key || '');
      var machine = String(machineIdentifier || '');
      var match = null;
      var index;
      if (!local) { return null; }
      if (machine) { return state.byLocalKey[machine + '|' + local] || null; }
      for (index = 0; index < state.items.length; index += 1) {
        if (String(state.items[index] && state.items[index].ratingKey || '') !== local) { continue; }
        if (match) { return null; }
        match = state.items[index];
      }
      return match;
    }
    function reconcileWatchedState(key, watched, machineIdentifier) {
      var item = findLocal(key, machineIdentifier);
      if (!item) { return false; }
      item.viewed = watched === true;
      item.viewOffset = 0;
      item.progress = 0;
      render();
      return true;
    }
    function reconcilePlaybackProgress(key, seconds, machineIdentifier) {
      var item = findLocal(key, machineIdentifier);
      var duration;
      var offset;
      if (!item) { return false; }
      offset = Math.max(0, Math.round(Number(seconds || 0) * 1000));
      duration = Number(item.duration || 0);
      item.viewOffset = offset;
      if (duration > 0) { item.progress = Math.max(0, Math.min(100, Math.round(offset / duration * 100))); }
      render();
      return true;
    }
    function setProvider(provider) { state.provider = provider || null; }
    function getProvider() { return state.provider; }
    function seed(items) {
      var previousKey = itemKey(state.items[state.focusIndex]);
      var previousIndex = state.focusIndex;
      state.items = array(items); indexItems(); restoreItemFocus(previousKey, previousIndex);
    }
    function toggle(cloudKey, enabled, item, callback) {
      var previous;
      var previousFocusKey;
      var previousFocusIndex;
      var previousZone;
      var local;
      var mutation;
      var generation;
      var request;
      if (!available() || !state.provider || state.mutationPending || !cloudKey) { if (callback) { callback(new Error('Watchlist unavailable')); } return; }
      generation = state.generation;
      previous = state.items.slice(); previousFocusKey = itemKey(state.items[state.focusIndex]); previousFocusIndex = state.focusIndex; previousZone = state.zone; state.mutationPending = true;
      local = item || {};
      local.ratingKey = local.ratingKey || cloudKey; local.cloudRatingKey = cloudKey; local.inWatchlist = !!enabled;
      mutation = values.WatchlistState.optimistic(state.items, local, enabled);
      state.items = mutation.items; restoreItemFocus(previousFocusKey, previousFocusIndex);
      indexItems(); notifyItemsChanged(); render();
      request = values.set(optionsForProvider(), cloudKey, enabled, function (error) {
        if (generation !== state.generation) { return; }
        state.mutationRequest = null;
        state.mutationPending = false;
        if (error) { state.items = previous; state.zone = previousZone; restoreItemFocus(previousFocusKey, previousFocusIndex); indexItems(); notifyItemsChanged(); render(); if (callback) { callback(error); } return; }
        if (callback) { callback(null, local); }
      });
      if (generation === state.generation && state.mutationPending) { state.mutationRequest = request || null; }
      return request || null;
    }

    return {
      snapshot: snapshot, open: open, leave: leave, close: leave, load: load, cancel: cancel, reset: reset,
      render: render, refreshFocus: applyFocus, onScroll: onScroll, setFocus: setFocus, focusNavigation: focusNavigation, focusContent: focusContent,
      focusedItem: focusedItem, handleKeyDown: handleKeyDown,
      pointerFocus: pointerFocus, restoreFocus: restoreFocus, findLocal: findLocal,
      reconcileWatchedState: reconcileWatchedState, reconcilePlaybackProgress: reconcilePlaybackProgress,
      setProvider: setProvider, getProvider: getProvider, ensureProvider: ensureProvider, toggle: toggle, seed: seed
    };
  }

  return { create: create };
}));
