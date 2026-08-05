(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffLibraryLifecycle = factory(); }
}(this, function () {
  'use strict';

  function copyArray(value) {
    return Object.prototype.toString.call(value) === '[object Array]' ? value.slice() : [];
  }

  function keyFor(library) {
    return String(library && library.key || '');
  }

  function copyObject(value) {
    var result = {};
    Object.keys(value || {}).forEach(function (key) { result[key] = value[key]; });
    return result;
  }

  function recentCount(item) {
    return Math.max(0, Number(item && item.detailParameters && item.detailParameters.count || 0));
  }

  function cloneCard(item) {
    var result = copyObject(item);
    if (result.detailParameters) { result.detailParameters = copyObject(result.detailParameters); }
    delete result.recentGroup;
    return result;
  }

  function cloneItem(item) {
    var result = cloneCard(item);
    var group = item && item.recentGroup;
    if (group) {
      result.recentGroup = {
        key: String(group.key || ''),
        count: Math.max(0, Number(group.count || 0)),
        viewedCount: Math.max(0, Number(group.viewedCount || 0)),
        seasonItem: cloneCard(group.seasonItem)
      };
    }
    return result;
  }

  function recentGroup(item) {
    var group = item && item.recentGroup;
    var count;
    if (group && group.key) {
      return {
        key: String(group.key),
        count: Math.max(0, Number(group.count || 0)),
        viewedCount: Math.max(0, Number(group.viewedCount || 0)),
        seasonItem: group.seasonItem || item
      };
    }
    if (!item || item.type !== 'season' || !item.ratingKey) { return null; }
    count = recentCount(item);
    return {
      key: String(item.ratingKey),
      count: count,
      viewedCount: item.viewed === true ? count : 0,
      seasonItem: item
    };
  }

  function mergeRecentPage(existingItems, pageItems, replaceExisting) {
    var result = replaceExisting ? [] : copyArray(existingItems);
    var indexes = {};
    result.forEach(function (item, index) {
      var group = recentGroup(item);
      if (group) { indexes[group.key] = index; }
    });
    copyArray(pageItems).forEach(function (item) {
      var incomingGroup = recentGroup(item);
      var index = incomingGroup && indexes[incomingGroup.key] !== undefined ? indexes[incomingGroup.key] : -1;
      var existingGroup;
      var merged;
      var count;
      var viewedCount;
      if (index < 0) {
        merged = cloneItem(item);
        result.push(merged);
        if (incomingGroup) { indexes[incomingGroup.key] = result.length - 1; }
        return;
      }
      existingGroup = recentGroup(result[index]);
      count = existingGroup.count + incomingGroup.count;
      viewedCount = existingGroup.viewedCount + incomingGroup.viewedCount;
      merged = cloneCard(existingGroup.seasonItem || incomingGroup.seasonItem || result[index]);
      merged.detailParameters = { count: count };
      merged.detailKey = merged.detailKey || item.detailKey || 'media.episodeCount';
      merged.detail = count + (count === 1 ? ' episode' : ' episodes');
      if (count > 0 && viewedCount >= count) { merged.viewed = true; }
      else { delete merged.viewed; }
      merged.recentGroup = {
        key: incomingGroup.key,
        count: count,
        viewedCount: viewedCount,
        seasonItem: cloneCard(existingGroup.seasonItem || incomingGroup.seasonItem || merged)
      };
      result[index] = merged;
    });
    return result;
  }

  function recentTotalSize(items, page) {
    if (page.hasMore === true) { return items.length + 1; }
    if (page.hasMore === false) { return items.length; }
    return Number(page.totalSize || 0);
  }

  function create(options) {
    var values = options || {};
    var state = {
      generation: 0,
      request: null,
      continueRequest: null,
      continueProbeToken: 0,
      continueAvailable: null,
      collectionsRequest: null,
      collectionsProbeToken: 0,
      collectionsAvailable: null,
      containerSummaryRequest: null,
      containerSummaryToken: 0,
      containerSummaryLoading: false,
      containerSummaryError: null,
      containerSummary: null,
      containerSummaryScheduled: null,
      loading: false,
      error: null,
      nextStart: null,
      container: null,
      containerParentState: null
    };

    function grid() { return values.grid; }
    function current(context, generation) {
      return generation === state.generation && (!values.isActive || values.isActive(context));
    }

    function abort(request) {
      if (request && request.abort) { request.abort(); }
    }

    function gridNavigationSnapshot() {
      var currentGrid = grid();
      if (currentGrid && currentGrid.navigationSnapshot) { return currentGrid.navigationSnapshot(); }
      currentGrid = currentGrid && currentGrid.snapshot ? currentGrid.snapshot() : {};
      return {
        itemCount: copyArray(currentGrid.items).length,
        recommendationItemCount: copyArray(currentGrid.recommendations).reduce(function (total, row) {
          return total + copyArray(row && row.items).length;
        }, 0),
        totalSize: Number(currentGrid.totalSize || 0),
        focus: currentGrid.focus || null,
        layout: currentGrid.layout || null,
        window: currentGrid.window || null
      };
    }

    function notifyStatus() {
      if (values.onStatus) { values.onStatus(snapshot()); }
    }

    function notifyContainerSummary() {
      if (values.onContainerSummary) { values.onContainerSummary(snapshot()); }
    }

    function cancelContainerSummary(clearValue) {
      state.containerSummaryToken += 1;
      abort(state.containerSummaryRequest);
      state.containerSummaryRequest = null;
      state.containerSummaryScheduled = null;
      state.containerSummaryLoading = false;
      state.containerSummaryError = null;
      if (clearValue !== false) { state.containerSummary = null; }
    }

    function loadContainerSummary(container, residentItems, knownTotal) {
      var token;
      var items = copyArray(residentItems);
      var expectedTotal = Math.max(items.length, Number(knownTotal || 0));
      if (!container || !values.loadContainerSummaryPage || !values.summarizeContainerItems ||
          values.shouldSummarizeContainer && values.shouldSummarizeContainer(container) !== true) { return false; }
      cancelContainerSummary(true);
      token = state.containerSummaryToken;
      state.containerSummaryLoading = true;
      notifyContainerSummary();

      function finish(error) {
        if (token !== state.containerSummaryToken) { return; }
        state.containerSummaryRequest = null;
        state.containerSummaryLoading = false;
        state.containerSummaryError = error || null;
        state.containerSummary = error ? null : values.summarizeContainerItems(items);
        notifyContainerSummary();
      }

      function loadPage(start) {
        var completed = false;
        var request = values.loadContainerSummaryPage(container, start, 60, function (error, page) {
          var pageItems;
          var total;
          completed = true;
          if (token !== state.containerSummaryToken || state.container !== container) { return; }
          state.containerSummaryRequest = null;
          if (error || !page) { finish(error || new Error('container summary unavailable')); return; }
          pageItems = copyArray(page.items);
          items = items.concat(pageItems);
          total = Math.max(expectedTotal, items.length, Number(page.totalSize || 0));
          if (items.length < total && pageItems.length) { loadPage(items.length); return; }
          finish(null);
        });
        if (!completed) { state.containerSummaryRequest = request || null; }
      }

      loadPage(items.length);
      return true;
    }

    function scheduleContainerSummary(container, context, generation) {
      var scheduled;
      var currentGrid;
      var defer = values.defer || function (callback) { setTimeout(callback, 0); };
      if (!container || state.containerSummaryLoading || state.containerSummary ||
          values.shouldSummarizeContainer && values.shouldSummarizeContainer(container) !== true ||
          !current(context, generation)) { return false; }
      if (!state.containerSummaryScheduled) {
        state.containerSummaryScheduled = {
          container: container,
          context: context,
          generation: generation,
          token: state.containerSummaryToken
        };
      }
      scheduled = state.containerSummaryScheduled;
      defer(function () {
        if (state.containerSummaryScheduled !== scheduled) { return; }
        if (scheduled.token !== state.containerSummaryToken ||
            state.container !== scheduled.container ||
            !current(scheduled.context, scheduled.generation)) {
          state.containerSummaryScheduled = null;
          return;
        }
        if (state.loading) { return; }
        state.containerSummaryScheduled = null;
        currentGrid = grid().snapshot();
        if (copyArray(currentGrid.items).length >= Number(currentGrid.totalSize || 0)) {
          setContainerSummary(values.summarizeContainerItems(copyArray(currentGrid.items)));
          return;
        }
        loadContainerSummary(scheduled.container, currentGrid.items, currentGrid.totalSize);
      });
      return true;
    }

    function setContainerSummary(summary) {
      cancelContainerSummary(true);
      state.containerSummary = summary || null;
      notifyContainerSummary();
      return snapshot();
    }

    function notifyRender(kind, context, error) {
      var result = { kind: kind, context: context, error: error || null, snapshot: snapshot() };
      var currentGrid = gridNavigationSnapshot();
      var count = kind === 'recommendations' ? currentGrid.recommendationItemCount : currentGrid.itemCount;
      if (!count && values.onEmpty) { values.onEmpty(result); }
      if (values.onRender) { values.onRender(result); }
    }

    function reset() {
      state.generation += 1;
      abort(state.request);
      state.request = null;
      cancelContainerSummary(true);
      state.loading = false;
      state.error = null;
      state.nextStart = null;
      grid().reset();
      if (values.onReset) { values.onReset(snapshot()); }
      notifyStatus();
      return snapshot();
    }

    function finishPage(error, page, context, generation, start) {
      var snapshotBefore;
      var nextItems;
      var pageItems;
      var pageNextStart;
      var totalSize;
      var initialFocusIndex;
      if (!current(context, generation)) { return; }
      state.loading = false;
      state.request = null;
      state.error = error || null;
      if (!error && page && context.library && (context.container || String(page.libraryKey || '') === keyFor(context.library))) {
        pageItems = copyArray(page.items);
        pageNextStart = Number(page.nextStart);
        state.nextStart = isFinite(pageNextStart) && pageNextStart >= start ? pageNextStart : start + pageItems.length;
        totalSize = Number(page.totalSize || 0);
        if (context.viewKey === 'recent' && !context.container) {
          snapshotBefore = grid().snapshot();
          nextItems = mergeRecentPage(snapshotBefore.items, pageItems, context.replace);
          grid().setItems(nextItems, recentTotalSize(nextItems, page));
        } else if (context.replace || !grid().appendItems) {
          if (context.replace) { nextItems = pageItems; }
          else {
            snapshotBefore = grid().snapshot();
            nextItems = copyArray(snapshotBefore.items).concat(pageItems);
          }
          grid().setItems(nextItems, totalSize);
        } else {
          grid().appendItems(pageItems, totalSize);
        }
        if (context.initialContainerFocus === true) {
          context.initialContainerFocus = false;
          initialFocusIndex = values.initialContainerFocusIndex
            ? Number(values.initialContainerFocusIndex(copyArray(nextItems || grid().snapshot().items), context.container))
            : -1;
          if (isFinite(initialFocusIndex) && initialFocusIndex >= 0 && grid().focusCatalog) {
            grid().focusCatalog(initialFocusIndex);
          }
        }
      }
      notifyStatus();
      notifyRender('page', context, error);
      if (!error && page && context.container) {
        scheduleContainerSummary(context.container, context, generation);
      }
    }

    function finishRecommendations(error, rows, context, generation) {
      if (!current(context, generation)) { return; }
      state.loading = false;
      state.request = null;
      state.error = error || null;
      state.nextStart = null;
      grid().setRecommendations(error ? [] : copyArray(rows));
      notifyStatus();
      notifyRender('recommendations', context, error);
    }

    function load(context, shouldReset, replaceExisting) {
      var generation;
      var start;
      var limit;
      if (!context || !context.library) { return snapshot(); }
      if (shouldReset) { reset(); }
      if (state.loading) { return snapshot(); }
      generation = state.generation;
      context.replace = !!replaceExisting;
      context.initialContainerFocus = !!(context.container && shouldReset === true);
      start = replaceExisting ? 0 : (state.nextStart === null ? gridNavigationSnapshot().itemCount : state.nextStart);
      limit = context.usesGridScroll ? 60 : 30;
      state.loading = true;
      notifyStatus();
      if (context.viewKey === 'recommended' && !context.container) {
        state.request = values.loadRecommendations(context.library, function (error, rows) {
          finishRecommendations(error, rows, context, generation);
        });
      } else if (context.container) {
        state.request = values.loadContainerPage(context.container, start, 60, function (error, page) {
          finishPage(error, page, context, generation, start);
        });
      } else {
        state.request = values.loadLibraryPage(context.library, context.viewKey, context.query || {}, start, limit, function (error, page) {
          finishPage(error, page, context, generation, start);
        });
      }
      return snapshot();
    }

    function probeContinue(library) {
      var token = state.continueProbeToken + 1;
      var libraryKey = keyFor(library);
      state.continueProbeToken = token;
      abort(state.continueRequest);
      state.continueRequest = values.loadLibraryPage(library, 'continue', {}, 0, 1, function (error, page) {
        if (token !== state.continueProbeToken || !values.isActive || !values.isActive({ library: library }) || keyFor(library) !== libraryKey) { return; }
        state.continueRequest = null;
        if (error || !page) { return; }
        state.continueAvailable = copyArray(page.items).length > 0;
        if (values.onContinueAvailable) { values.onContinueAvailable(state.continueAvailable, snapshot()); }
      });
      return snapshot();
    }

    function probeCollections(library) {
      var token = state.collectionsProbeToken + 1;
      var libraryKey = keyFor(library);
      state.collectionsProbeToken = token;
      abort(state.collectionsRequest);
      state.collectionsRequest = values.loadLibraryPage(library, 'collections', {}, 0, 1, function (error, page) {
        if (token !== state.collectionsProbeToken || !values.isActive || !values.isActive({ library: library }) || keyFor(library) !== libraryKey) { return; }
        state.collectionsRequest = null;
        if (error || !page) { return; }
        state.collectionsAvailable = copyArray(page.items).length > 0;
        if (values.onCollectionsAvailable) { values.onCollectionsAvailable(state.collectionsAvailable, snapshot()); }
      });
      return snapshot();
    }

    function prepareLibrary() {
      state.continueProbeToken += 1;
      state.collectionsProbeToken += 1;
      abort(state.continueRequest);
      abort(state.collectionsRequest);
      state.continueRequest = null;
      state.collectionsRequest = null;
      state.continueAvailable = null;
      state.collectionsAvailable = null;
      cancelContainerSummary(true);
      state.nextStart = null;
      state.container = null;
      state.containerParentState = null;
      return snapshot();
    }

    function setContinueAvailable(value) {
      state.continueAvailable = value === true || value === false ? value : null;
      return snapshot();
    }

    function setCollectionsAvailable(value) {
      state.collectionsAvailable = value === true || value === false ? value : null;
      return snapshot();
    }

    function setNextStart(value) {
      value = Number(value);
      state.nextStart = isFinite(value) && value >= 0 ? value : null;
      return snapshot();
    }

    function clearContainer() {
      cancelContainerSummary(true);
      state.nextStart = null;
      state.container = null;
      state.containerParentState = null;
      return snapshot();
    }

    function openContainer(item) {
      var currentSnapshot;
      if (!item || !item.containerKey) { return false; }
      cancelContainerSummary(true);
      currentSnapshot = grid().snapshot();
      state.containerParentState = {
        items: currentSnapshot.items,
        totalSize: currentSnapshot.totalSize,
        focus: currentSnapshot.focus,
        nextStart: state.nextStart,
        scrollTop: values.scrollTop ? values.scrollTop() : 0
      };
      state.nextStart = null;
      state.container = item;
      return true;
    }

    function closeContainer() {
      var parent = state.containerParentState;
      if (!state.container || !parent) { return false; }
      state.generation += 1;
      abort(state.request);
      state.request = null;
      state.loading = false;
      state.error = null;
      cancelContainerSummary(true);
      state.container = null;
      state.containerParentState = null;
      state.nextStart = parent.nextStart;
      grid().setItems(parent.items, parent.totalSize);
      grid().focusCatalog(parent.focus.index);
      notifyStatus();
      if (values.onRestoreContainer) { values.onRestoreContainer(snapshot()); }
      if (values.setScrollTop) { values.setScrollTop(parent.scrollTop); }
      return true;
    }

    function leave() {
      state.generation += 1;
      state.continueProbeToken += 1;
      state.collectionsProbeToken += 1;
      abort(state.request);
      abort(state.continueRequest);
      abort(state.collectionsRequest);
      cancelContainerSummary(true);
      state.request = null;
      state.continueRequest = null;
      state.collectionsRequest = null;
      state.loading = false;
      state.error = null;
      state.continueAvailable = null;
      state.collectionsAvailable = null;
      state.nextStart = null;
      state.container = null;
      state.containerParentState = null;
      grid().reset();
      notifyStatus();
      return snapshot();
    }

    function snapshot() {
      return {
        generation: state.generation,
        loading: state.loading,
        error: state.error,
        nextStart: state.nextStart,
        continueAvailable: state.continueAvailable,
        collectionsAvailable: state.collectionsAvailable,
        container: state.container,
        hasContainer: !!state.container,
        containerSummaryLoading: state.containerSummaryLoading,
        containerSummaryError: state.containerSummaryError,
        containerSummary: state.containerSummary
      };
    }

    return {
      load: load,
      probeContinue: probeContinue,
      probeCollections: probeCollections,
      prepareLibrary: prepareLibrary,
      setContainerSummary: setContainerSummary,
      setContinueAvailable: setContinueAvailable,
      setCollectionsAvailable: setCollectionsAvailable,
      setNextStart: setNextStart,
      clearContainer: clearContainer,
      openContainer: openContainer,
      closeContainer: closeContainer,
      reset: reset,
      leave: leave,
      snapshot: snapshot
    };
  }

  return { create: create };
}));
