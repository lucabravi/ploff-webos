(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffSearchController = factory();
  }
}(this, function () {
  'use strict';

  function createRequestGroup() {
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

  function create(options) {
    var values = options || {};
    var modules = values.modules || {};
    var SearchModel = modules.SearchModel;
    var SearchView = modules.SearchView;
    var services = values.services || {};
    var actions = values.actions || {};
    var destroyed = false;
    var viewOptions = values.viewOptions || {};
    var view;

    function resolveCloudItems(query, cloudItems, group, callback) {
      var candidates = SearchModel.relevantCloudItems(query, cloudItems || []).slice(0, 12);
      var remaining = candidates.length;
      var resolved = new Array(candidates.length);
      if (!remaining) { callback([], null); return; }
      candidates.forEach(function (candidate, candidateIndex) {
        group.add(services.resolveCloudItem(candidate, function (error, item) {
          if (group.isAborted()) { return; }
          if (!error && item && (item.type === 'movie' || item.type === 'show' || !item.type) && item.ratingKey) {
            resolved[candidateIndex] = item;
          }
          remaining -= 1;
          if (!remaining) { callback(resolved.filter(function (item) { return !!item; }), null); }
        }));
      });
    }

    function load(query, callback) {
      var group = createRequestGroup();
      var localItems = [];
      var localError = null;
      group.add(services.localSearch(query, function (error, items) {
        if (group.isAborted() || destroyed) { return; }
        localError = error || null;
        localItems = error ? [] : (items || []);
        if (!services.cloudEligible || !services.cloudEligible()) {
          callback(localError, localItems, true);
          return;
        }
        callback(null, localItems, false);
        group.add(services.cloudSearch(query, function (cloudError, cloudItems) {
          if (group.isAborted() || destroyed) { return; }
          if (cloudError) {
            callback(localError && cloudError ? localError : null, localItems, true);
            return;
          }
          resolveCloudItems(query, cloudItems, group, function (resolvedItems) {
            if (group.isAborted() || destroyed) { return; }
            callback(localError, SearchModel.mergeLocalResults(localItems, resolvedItems), true);
          });
        }));
      }));
      return group;
    }

    viewOptions.load = load;
    view = SearchView.create(viewOptions);

    function handleKey(event, direction) {
      var snapshot;
      if (destroyed) { return false; }
      snapshot = view.snapshot();
      if (event && event.preventDefault) { event.preventDefault(); }
      if (values.t9Enabled && values.t9Enabled() && view.inputKeyCode(event.keyCode)) { return true; }
      if (event.keyCode === 27 || event.keyCode === 461) { view.back(); return true; }
      if (event.keyCode === 8) {
        if (!view.backspaceT9()) { view.applyKey('backspace'); }
        return true;
      }
      if (event.keyCode === 415 && snapshot.focus.zone === 'results') {
        if (actions.playItem) { actions.playItem(snapshot.results[snapshot.focus.index]); }
        return true;
      }
      if (direction) {
        view.flushT9();
        view.handleDirection(direction);
        return true;
      }
      if (event.keyCode === 13) {
        view.flushT9();
        view.activate();
        return true;
      }
      return false;
    }

    function open(keepNavigationFocus, navigationIndex) {
      if (destroyed) { return; }
      if (actions.stopBackgroundAudio) { actions.stopBackgroundAudio(); }
      view.open(keepNavigationFocus, navigationIndex);
      if (keepNavigationFocus) { view.focusNavigation(navigationIndex); }
    }

    function close(keepImages, preserveBackgroundAudio) {
      if (destroyed) { return; }
      view.cancel();
      if (!keepImages && actions.cancelImages) { actions.cancelImages(); }
      view.close();
      if (!preserveBackgroundAudio && actions.stopBackgroundAudio) { actions.stopBackgroundAudio(); }
    }

    function resume() {
      if (destroyed || !view.resume) { return; }
      return view.resume();
    }

    function destroy() {
      if (destroyed) { return; }
      close(false);
      destroyed = true;
    }

    return {
      handleKey: handleKey,
      open: open,
      close: close,
      resume: resume,
      cancel: function (keepImages) {
        view.cancel();
        if (!keepImages && actions.cancelImages) { actions.cancelImages(); }
      },
      schedule: function () { if (!destroyed) { return view.schedule(); } },
      refreshFocus: function () { if (!destroyed) { return view.refreshFocus(); } },
      refreshResults: function () { if (!destroyed) { return view.refreshResults(); } },
      applyKey: function (key) { if (!destroyed) { return view.applyKey(key); } },
      focusNavigation: function (index) { if (!destroyed) { return view.focusNavigation(index); } },
      focusKeyboard: function (row, column) { if (!destroyed) { return view.focusKeyboard(row, column); } },
      focusResult: function (index) { if (!destroyed) { return view.focusResult(index); } },
      pointerFocus: function (target) { if (!destroyed) { return view.pointerFocus(target); } },
      snapshot: function () { return view.snapshot(); },
      destroy: destroy
    };
  }

  return {
    create: create,
    createRequestGroup: createRequestGroup
  };
}));
