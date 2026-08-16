(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffDiagnosticsFeatureController = factory(); }
}(this, function () {
  'use strict';

  function create(options) {
    var values = options || {};
    var platform = values.platform || {};
    var modules = values.modules || {};
    var presentation = values.presentation || {};
    var state = values.state || {};
    var transport = values.transport || {};
    var transitions = values.transitions || {};
    var platformRoot = platform.root || {};
    var controller = null;
    var restoreOnClose = true;
    var destroyed = false;

    function call(callback, arg1, arg2, arg3, arg4, arg5) {
      if (typeof callback === 'function') { return callback(arg1, arg2, arg3, arg4, arg5); }
      return undefined;
    }

    function active() { return !destroyed && !!controller; }

    function setDiagnosticsSurface(enabled) {
      var body = platform.document && platform.document.body;
      var className;
      if (!body) { return; }
      className = String(body.className || '').replace(/\s*is-diagnostics-view/g, '');
      body.className = className + (enabled ? ' is-diagnostics-view' : '');
    }

    function webOSVersion() {
      var agent = String(platformRoot.navigator && platformRoot.navigator.userAgent || '');
      var match = agent.match(/(?:web0s|webos)[\s/]+([0-9.]+)/i);
      if (match) { return match[1]; }
      match = agent.match(/chrome\/([0-9.]+)/i);
      return match ? 'Chrome ' + match[1] : call(presentation.t, 'diagnostics.unknown');
    }

    function bufferedPlaybackRanges(ranges) {
      var result = [];
      var index;
      ranges = ranges || [];
      for (index = 0; index < ranges.length; index += 1) {
        result.push(call(presentation.formatTime, ranges[index].start) + '-' + call(presentation.formatTime, ranges[index].end));
      }
      return result.join(', ');
    }

    function playbackSourceSummary(playback) {
      var result = [];
      if (!playback) { return ''; }
      if (playback.sourceWidth && playback.sourceHeight) { result.push(playback.sourceWidth + 'x' + playback.sourceHeight); }
      if (playback.originalVideoCodec) { result.push(String(playback.originalVideoCodec).toUpperCase()); }
      if (playback.originalContainer) { result.push(String(playback.originalContainer).toUpperCase()); }
      if (playback.videoDynamicRange) { result.push(playback.videoDynamicRange); }
      return result.join(' / ');
    }

    function serverSnapshot(identityState) {
      var identityValues = identityState || {};
      var config = call(state.config) || {};
      var activeServer = call(state.activeServer) || null;
      var identity = identityValues.identity || activeServer || {};
      var addressTarget = activeServer || { uri: config.apiBaseUrl };
      return {
        name: identity.name || (activeServer && activeServer.name) || config.serverName,
        version: identity.version,
        machineIdentifier: identity.machineIdentifier || (activeServer && activeServer.machineIdentifier),
        reachable: identityValues.reachable === true,
        addresses: call(state.serverAddresses, addressTarget) || []
      };
    }

    function profileSnapshot() {
      var mode = call(state.authMode);
      var profile = call(state.activeProfile) || null;
      return {
        mode: mode === 'plex' ? 'Plex' : 'Offline',
        name: mode === 'plex' && profile ? profile.title : call(presentation.t, 'profile.offline')
      };
    }

    function deviceSnapshot() {
      var capabilities = call(state.playbackCapabilities) || {};
      return {
        modelName: capabilities.modelName,
        webOSVersion: webOSVersion(),
        viewport: String(platformRoot.innerWidth || 0) + 'x' + String(platformRoot.innerHeight || 0),
        known: capabilities.known,
        uhd: capabilities.uhd,
        hdr10: capabilities.hdr10,
        dolbyVision: capabilities.dolbyVision,
        hdrKnown: capabilities.hdrKnown
      };
    }

    function activeSubtitleOffset(playback, current) {
      var local = current && current.localSubtitle;
      var options = playback && playback.options || {};
      var tracks = playback && playback.subtitleTracks || [];
      var selectedId = String(options.subtitleStreamID || '');
      var index;
      if (local && local.offsetMs !== undefined) { return Number(local.offsetMs); }
      for (index = 0; index < tracks.length; index += 1) {
        if ((!selectedId || String(tracks[index].id || '') === selectedId) && tracks[index].offset !== undefined) { return Number(tracks[index].offset); }
        if ((!selectedId || String(tracks[index].id || '') === selectedId) && tracks[index].offsetMs !== undefined) { return Number(tracks[index].offsetMs); }
      }
      return null;
    }

    function playbackSnapshot() {
      var current = call(state.playbackSnapshot) || null;
      var diagnostics = call(state.playbackDiagnostics) || null;
      var playback = current && current.playback;
      if (!playback || !diagnostics) { return null; }
      return {
        title: playback.title,
        fileName: playback.fileName,
        fileSize: playback.fileSize,
        source: playbackSourceSummary(playback),
        delivery: playback.playbackMode,
        requestedMode: playback.requestedPlaybackMode,
        strategy: diagnostics.fallback || diagnostics.delivery,
        attempts: diagnostics.attempts || [],
        fallback: diagnostics.fallback || '',
        position: diagnostics.position,
        duration: Number(playback.duration || 0) / 1000,
        buffered: bufferedPlaybackRanges(diagnostics.buffered),
        state: diagnostics.state,
        buffering: diagnostics.buffering === true,
        nativeSeekPending: diagnostics.nativeSeekPending === true,
        clockRepairCount: diagnostics.clockRepairCount || 0,
        nativeReadyState: diagnostics.nativeReadyState,
        nativeNetworkState: diagnostics.nativeNetworkState,
        nativeErrorCode: diagnostics.nativeErrorCode,
        subtitleOffsetMs: activeSubtitleOffset(playback, current),
        subtitleSize: current.localSubtitle && current.localSubtitle.size !== undefined
          ? Number(current.localSubtitle.size) : Number(playback.options && playback.options.subtitleSize || 0) || null,
        queue: call(state.queueSnapshot) || null,
        mediaProfile: playback.mediaProfile,
        audioTracks: playback.audioTracks || [],
        subtitleTracks: playback.subtitleTracks || [],
        options: playback.options || {}
      };
    }

    if (!modules.DiagnosticsController || typeof modules.DiagnosticsController.create !== 'function') {
      throw new Error('DiagnosticsFeatureController requires DiagnosticsController');
    }

    controller = modules.DiagnosticsController.create({
      platform: { root: platformRoot, document: platform.document },
      modules: {
        DiagnosticsState: modules.DiagnosticsState,
        DiagnosticsView: modules.DiagnosticsView,
        SupportSnapshot: modules.SupportSnapshot,
        SupportQr: modules.SupportQr
      },
      presentation: {
        t: presentation.t,
        element: presentation.element,
        setText: presentation.setText,
        formatFileSize: presentation.formatFileSize,
        formatLongTime: presentation.formatLongTime,
        pointerActive: presentation.pointerActive
      },
      providers: {
        appVersion: state.appVersion,
        server: serverSnapshot,
        profile: profileSnapshot,
        device: deviceSnapshot,
        network: state.networkSnapshot,
        settings: state.settingsSnapshot,
        compatibility: state.playbackCompatibility,
        playback: playbackSnapshot,
        jsErrors: state.jsErrors,
        loadIdentity: transport.loadIdentity
      },
      lifecycle: {
        open: function () { call(transitions.enter); },
        close: function () {
          setDiagnosticsSurface(false);
          if (restoreOnClose) { call(transitions.leave); }
        }
      }
    });

    function enter() {
      if (!active()) { return false; }
      restoreOnClose = true;
      setDiagnosticsSurface(true);
      return controller.enter();
    }

    function suspend() {
      var result;
      if (!active()) { return false; }
      restoreOnClose = false;
      result = controller.leave();
      setDiagnosticsSurface(false);
      restoreOnClose = true;
      return result;
    }


    function invoke(name, arg1, arg2) {
      if (!active() || typeof controller[name] !== 'function') { return false; }
      return controller[name](arg1, arg2);
    }

    function handleKey(event, direction) {
      if (!active()) { return { handled: false }; }
      return controller.handleKey(event, direction);
    }

    function destroy() {
      if (destroyed) { return; }
      restoreOnClose = false;
      if (controller && typeof controller.destroy === 'function') { controller.destroy(); }
      setDiagnosticsSurface(false);
      controller = null;
      destroyed = true;
    }

    return {
      capturePlayback: function () { return invoke('capturePlayback'); },
      destroy: destroy,
      enter: enter,
      error: function () { return invoke('error'); },
      focusAction: function (index) { return invoke('setFocus', index); },
      handleKey: handleKey,
      isOpen: function () { return active() && controller.isOpen(); },
      render: function () { return invoke('render'); },
      setError: function (error) { return invoke('setError', error); },
      suspend: suspend
    };
  }

  return { create: create };
}));
