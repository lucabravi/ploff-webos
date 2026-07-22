(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffSearchSession = factory();
  }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var timer = null;
    var request = null;
    var generation = 0;

    function cancelRequest() {
      if (request && request.abort) { request.abort(); }
      request = null;
    }

    function cancel() {
      generation += 1;
      values.root.clearTimeout(timer);
      timer = null;
      cancelRequest();
    }

    function update(query) {
      var normalized = String(query || '').replace(/^\s+|\s+$/g, '');
      var nextGeneration;
      cancel();
      if (normalized.length < 2) {
        values.onTypeMore();
        return;
      }
      nextGeneration = generation;
      values.onLoading();
      timer = values.root.setTimeout(function () {
        var completed = false;
        var nextRequest;
        if (nextGeneration !== generation || !values.isActive()) { return; }
        nextRequest = values.load(normalized, function (error, items, complete) {
          if (nextGeneration !== generation || !values.isActive()) { return; }
          values.onResults(error || null, items || []);
          if (complete === false) { return; }
          completed = true;
          request = null;
        });
        if (!completed && nextGeneration === generation) { request = nextRequest || null; }
      }, 300);
    }

    return {
      cancel: cancel,
      destroy: cancel,
      update: update
    };
  }

  return { create: create };
}));
