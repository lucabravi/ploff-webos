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
    var lastFailurePlayback = null;
    var lastError = '';
    var eventHistory = [];
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

    function copyPlayback(value) {
      var result;
      var index;
      if (!value || typeof value !== 'object') { return value || null; }
      result = {};
      for (index in value) {
        if (Object.prototype.hasOwnProperty.call(value, index) && index !== 'sourceUrl' && index !== 'hlsUrl') { result[index] = value[index]; }
      }
      if (value.options) {
        result.options = {};
        for (index in value.options) {
          if (Object.prototype.hasOwnProperty.call(value.options, index)) { result.options[index] = value.options[index]; }
        }
      }
      ['audioTracks', 'subtitleTracks', 'mediaVersions'].forEach(function (key) {
        if (Object.prototype.toString.call(value[key]) === '[object Array]') {
          result[key] = value[key].map(function (item) {
            var copy = {};
            var itemKey;
            for (itemKey in item) {
              if (Object.prototype.hasOwnProperty.call(item, itemKey) && itemKey !== 'key') { copy[itemKey] = item[itemKey]; }
            }
            return copy;
          });
        }
      });
      if (value.mediaProfile) {
        result.mediaProfile = copyPlayback(value.mediaProfile);
      }
      if (value.mediaProfile && value.mediaProfile.videoDetails) {
        result.mediaProfile.videoDetails = copyPlayback(value.mediaProfile.videoDetails);
      }
      if (value.mediaProfile && value.mediaProfile.audioTracks) {
        result.mediaProfile.audioTracks = copyPlayback({ audioTracks: value.mediaProfile.audioTracks }).audioTracks;
      }
      if (value.mediaProfile && value.mediaProfile.subtitleTracks) {
        result.mediaProfile.subtitleTracks = copyPlayback({ subtitleTracks: value.mediaProfile.subtitleTracks }).subtitleTracks;
      }
      return result;
    }

    function recordEvent(event) {
      var item;
      if (destroyed) { return; }
      item = event && typeof event === 'object' ? event : { type: 'event', detail: event };
      eventHistory.push({ type: item.type || item.kind || 'event', state: item.state || '', detail: item.detail || item.message || '', at: item.at || new Date().getTime() });
      if (eventHistory.length > 32) { eventHistory.shift(); }
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

    function supportSnapshot(identityState) {
      var identityValues = identityState || {};
      var server = call(providers.server, identityValues) || {};
      return modules.SupportSnapshot.create({
        appVersion: call(providers.appVersion) || '',
        server: server,
        profile: call(providers.profile) || {},
        device: call(providers.device) || {},
        network: call(providers.network) || {},
        settings: call(providers.settings) || {},
        compatibility: call(providers.compatibility) || {},
        playback: lastPlayback || call(providers.playback),
        failurePlayback: lastFailurePlayback,
        error: identityValues.error || lastError,
        events: eventHistory,
        jsErrors: call(providers.jsErrors) || []
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
      getSupportReport: supportSnapshot,
      SupportQr: modules.SupportQr,
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
      if (target && target.getAttribute && target.getAttribute('data-diagnostics-qr-action') === 'close') {
        if (type === 'focus' || type === 'activate') { view.closeSupportQr(); return { handled: true }; }
      }
      action = target && target.getAttribute && target.getAttribute('data-diagnostics-action');
      if (type === 'focus' && action) {
        view.setFocus(action === 'refresh' ? 0 : (action === 'export' ? 1 : 2));
        return { handled: true };
      }
      if (type === 'activate' && action) {
        view.setFocus(action === 'refresh' ? 0 : (action === 'export' ? 1 : 2));
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
      if (current) { lastPlayback = copyPlayback(current); recordEvent({ type: 'playback-captured', state: current.state || '' }); }
      return lastPlayback ? modules.DiagnosticsState.playback(lastPlayback) : null;
    }

    function setError(error) {
      var current;
      if (destroyed) { return lastError; }
      current = call(providers.playback);
      if (current) { lastPlayback = copyPlayback(current); lastFailurePlayback = copyPlayback(current); }
      lastError = modules.DiagnosticsState.sanitizeText(error || '');
      recordEvent({ type: 'playback-error', state: current && current.state || '', detail: lastError });
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
      lastFailurePlayback = null;
      lastError = '';
      eventHistory = [];
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
      recordEvent: recordEvent,
      setError: setError,
      error: function () { return lastError; }
    };
  }

  return { create: create };
}));
