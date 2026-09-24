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
    var transport = values.transport || {};
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
      /** @type {Object<string, *>} */
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
        startup: call(providers.startup) || {},
        error: identityValues.error || lastError
      });
    }

    function supportSnapshot(runtime, identityState) {
      var identityValues = identityState || {};
      var server = call(providers.server, identityValues) || {};
      return runtime.SupportSnapshot.create({
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
      preloadSupportRuntime: function () {
        if (destroyed || typeof transport.loadSupportRuntime !== 'function') { return false; }
        transport.loadSupportRuntime(function () {});
        return true;
      },
      requestSupportReport: function (identityState, callback) {
        if (destroyed || typeof callback !== 'function') { return; }
        if (typeof transport.loadSupportRuntime !== 'function') {
          callback(new Error('Diagnostics support runtime is unavailable'), null, null);
          return;
        }
        transport.loadSupportRuntime(function (error, runtime) {
          var report;
          if (destroyed) { return; }
          if (error || !runtime || !runtime.SupportSnapshot || !runtime.SupportQr) {
            callback(error || new Error('Diagnostics support runtime is unavailable'), null, null);
            return;
          }
          try { report = supportSnapshot(runtime, identityState); }
          catch (_error) { callback(new Error('Support report could not be created'), null, null); return; }
          callback(null, report, runtime.SupportQr);
        });
      },
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
