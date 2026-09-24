(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffPlaybackOperation = factory(); }
}(this, function () {
  'use strict';

  // One replaceable operation, not a scheduler. Transport completion and operation
  // lifetime differ: a completed request can still own a renderer continuation.
  function create(options) {
    var values = options || {};
    var current = null;
    var destroyed = false;

    function abort(handle) {
      if (!handle || typeof handle.abort !== 'function') { return; }
      try { handle.abort(); }
      catch (error) {
        // Cancellation has already invalidated ownership. A diagnostic observer
        // must not prevent release of the other playback resources.
        try { if (values.onAbortError) { values.onAbortError(error); } } catch (_error) {}
      }
    }

    function release(token) {
      var request = token && token.request;
      var handle = request && request.handle;
      if (!request) { return; }
      token.request = null;
      request.handle = null;
      abort(handle);
    }

    function begin() {
      var previous = current;
      var token = { request: null };
      if (!destroyed) { current = token; }
      // Publish the replacement before abort: abort may complete synchronously
      // or even reenter begin(). Such a newer operation must remain the owner.
      release(previous);

      function isCurrent() { return !destroyed && current === token; }

      function run(start, callback) {
        var previousRequest = token.request;
        var request = { handle: null, settled: false };
        var handle;
        if (!isCurrent()) { return false; }
        token.request = request;
        if (previousRequest) {
          handle = previousRequest.handle;
          previousRequest.handle = null;
          abort(handle);
        }
        if (!isCurrent() || token.request !== request) { return false; }
        function done(_error) {
          if (request.settled) { return; }
          request.settled = true;
          request.handle = null;
          if (!isCurrent() || token.request !== request) { return; }
          token.request = null;
          if (typeof callback === 'function') { callback.apply(null, arguments); }
        }
        try { handle = start(done); }
        catch (error) {
          if (request.settled) { throw error; }
          done(error);
        }
        if (!request.settled) {
          if (isCurrent() && token.request === request) { request.handle = handle || null; }
          else { abort(handle); }
        }
        return true;
      }

      return { current: isCurrent, run: run };
    }

    function cancel() {
      var previous = current;
      current = null;
      release(previous);
    }

    function destroy() {
      destroyed = true;
      cancel();
    }

    return {
      begin: begin,
      pending: function () { return !!(current && current.request); },
      cancel: cancel,
      destroy: destroy
    };
  }

  return { create: create };
}));
