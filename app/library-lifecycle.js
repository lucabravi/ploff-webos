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

  function create(options) {
    var values = options || {};
    var state = {
      generation: 0,
      request: null,
      continueRequest: null,
      continueProbeToken: 0,
      continueAvailable: null,
      loading: false,
      error: null,
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

    function notifyStatus() {
      if (values.onStatus) { values.onStatus(snapshot()); }
    }

    function notifyRender(kind, context, error) {
      var result = { kind: kind, context: context, error: error || null, snapshot: snapshot() };
      var count = kind === 'recommendations'
        ? grid().snapshot().recommendations.reduce(function (total, row) { return total + copyArray(row && row.items).length; }, 0)
        : grid().snapshot().items.length;
      if (!count && values.onEmpty) { values.onEmpty(result); }
      if (values.onRender) { values.onRender(result); }
    }

    function reset() {
      state.generation += 1;
      abort(state.request);
      state.request = null;
      state.loading = false;
      state.error = null;
      grid().reset();
      if (values.onReset) { values.onReset(snapshot()); }
      notifyStatus();
      return snapshot();
    }

    function finishPage(error, page, context, generation) {
      var snapshotBefore;
      if (!current(context, generation)) { return; }
      state.loading = false;
      state.request = null;
      state.error = error || null;
      snapshotBefore = grid().snapshot();
      if (!error && page && context.library && (context.container || String(page.libraryKey || '') === keyFor(context.library))) {
        grid().setItems(snapshotBefore.items.concat(copyArray(page.items)), Number(page.totalSize || 0));
      }
      notifyStatus();
      notifyRender('page', context, error);
    }

    function finishRecommendations(error, rows, context, generation) {
      if (!current(context, generation)) { return; }
      state.loading = false;
      state.request = null;
      state.error = error || null;
      grid().setRecommendations(error ? [] : copyArray(rows));
      notifyStatus();
      notifyRender('recommendations', context, error);
    }

    function load(context, shouldReset) {
      var generation;
      var start;
      var limit;
      if (!context || !context.library) { return snapshot(); }
      if (shouldReset) { reset(); }
      if (state.loading) { return snapshot(); }
      generation = state.generation;
      start = grid().snapshot().items.length;
      limit = context.usesGridScroll ? 60 : 30;
      state.loading = true;
      notifyStatus();
      if (context.viewKey === 'recommended' && !context.container) {
        state.request = values.loadRecommendations(context.library, function (error, rows) {
          finishRecommendations(error, rows, context, generation);
        });
      } else if (context.container) {
        state.request = values.loadContainerPage(context.container, start, 60, function (error, page) {
          finishPage(error, page, context, generation);
        });
      } else {
        state.request = values.loadLibraryPage(context.library, context.viewKey, context.query || {}, start, limit, function (error, page) {
          finishPage(error, page, context, generation);
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

    function prepareLibrary() {
      state.continueAvailable = null;
      state.container = null;
      state.containerParentState = null;
      return snapshot();
    }

    function clearContainer() {
      state.container = null;
      state.containerParentState = null;
      return snapshot();
    }

    function openContainer(item) {
      var currentSnapshot;
      if (!item || !item.containerKey) { return false; }
      currentSnapshot = grid().snapshot();
      state.containerParentState = {
        items: currentSnapshot.items,
        totalSize: currentSnapshot.totalSize,
        focus: currentSnapshot.focus,
        scrollTop: values.scrollTop ? values.scrollTop() : 0
      };
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
      state.container = null;
      state.containerParentState = null;
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
      abort(state.request);
      abort(state.continueRequest);
      state.request = null;
      state.continueRequest = null;
      state.loading = false;
      state.error = null;
      state.continueAvailable = null;
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
        continueAvailable: state.continueAvailable,
        container: state.container,
        hasContainer: !!state.container
      };
    }

    return {
      load: load,
      probeContinue: probeContinue,
      prepareLibrary: prepareLibrary,
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
