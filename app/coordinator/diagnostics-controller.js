(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.PloffDiagnosticsController = factory();
  }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var modules = values.modules || {};
    var providers = values.providers || {};
    var lifecycle = values.lifecycle || {};
    var presentation = values.presentation || {};
    var platform = values.platform || {};
    var destroyed = false;
    var lastPlayback = null;
    var lastError = '';
    var view;

    function call(callback, _arg1, _arg2, _arg3, _arg4, _arg5) {
      if (typeof callback === 'function') {
        return callback.apply(null, Array.prototype.slice.call(arguments, 1));
      }
      return undefined;
    }

    function rawPlayback() {
      var current = call(providers.playback);
      return current || lastPlayback;
    }

    function snapshot(identityState) {
      var identityValues = identityState || {};
      var server = call(providers.server, identityValues) || {};
      return modules.DiagnosticsState.snapshot({
        appVersion: call(providers.appVersion) || '',
        server: server,
        profile: call(providers.profile) || {},
        device: call(providers.device) || {},
        network: call(providers.network) || {},
        playback: rawPlayback(),
        error: identityValues.error || lastError
      });
    }

    view = modules.DiagnosticsView.create({
      document: platform.document,
      root: platform.root,
      t: presentation.t,
      element: presentation.element,
      setText: presentation.setText,
      formatFileSize: presentation.formatFileSize,
      formatLongTime: presentation.formatLongTime,
      getSnapshot: snapshot,
      loadIdentity: providers.loadIdentity,
      sanitizeError: modules.DiagnosticsState.sanitizeText,
      isPointerSelectionActive: presentation.pointerActive || function () { return false; },
      onOpen: function () { call(lifecycle.open); },
      onClose: function () { call(lifecycle.close); }
    });

    function enter() {
      if (destroyed) { return snapshot(); }
      view.open();
      return snapshot();
    }

    function leave() {
      view.close();
      return snapshot();
    }

    function refresh() {
      if (destroyed) { return snapshot(); }
      view.refresh();
      return snapshot();
    }

    function handleKey(event, direction) {
      if (destroyed || !view.isOpen()) { return { handled: false }; }
      view.handleKey(event, direction);
      return { handled: true };
    }

    function handlePointer(type, event) {
      var target;
      var action;
      if (destroyed || !view.isOpen()) { return { handled: false }; }
      target = event && event.target;
      action = target && target.getAttribute && target.getAttribute('data-diagnostics-action');
      if (type === 'focus' && action) {
        view.setFocus(action === 'refresh' ? 0 : 1);
        return { handled: true };
      }
      if (type === 'activate' && action) {
        view.setFocus(action === 'refresh' ? 0 : 1);
        view.activate();
        return { handled: true };
      }
      return { handled: false };
    }

    function render() {
      if (!destroyed && view.isOpen()) { view.render(); }
    }

    function capturePlayback() {
      var current;
      if (destroyed) { return lastPlayback; }
      current = call(providers.playback);
      if (current) { lastPlayback = modules.DiagnosticsState.playback(current); }
      return lastPlayback;
    }

    function setError(error) {
      if (destroyed) { return lastError; }
      lastError = modules.DiagnosticsState.sanitizeText(error || '');
      render();
      return lastError;
    }

    function diagnosticsSnapshot() {
      return snapshot();
    }

    function destroy() {
      if (destroyed) { return; }
      destroyed = true;
      view.destroy();
      lastPlayback = null;
      lastError = '';
    }

    return {
      enter: enter,
      leave: leave,
      refresh: refresh,
      handleKey: handleKey,
      handlePointer: handlePointer,
      snapshot: diagnosticsSnapshot,
      destroy: destroy,
      activate: function () { if (!destroyed) { view.activate(); } },
      render: render,
      isOpen: function () { return !destroyed && view.isOpen(); },
      setFocus: function (index) { if (!destroyed) { view.setFocus(index); } },
      scroll: function (direction) { if (!destroyed) { view.scroll(direction); } },
      capturePlayback: capturePlayback,
      setError: setError,
      error: function () { return lastError; }
    };
  }

  return { create: create };
}));
