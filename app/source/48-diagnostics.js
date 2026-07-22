  function webOSVersion() {
    var agent = String(root.navigator && root.navigator.userAgent || '');
    var match = agent.match(/(?:web0s|webos)[\s/]+([0-9.]+)/i);
    if (match) { return match[1]; }
    match = agent.match(/chrome\/([0-9.]+)/i);
    return match ? 'Chrome ' + match[1] : t('diagnostics.unknown');
  }

  function bufferedPlaybackRanges(video) {
    var values = [];
    var index;
    if (!video || !video.buffered) { return ''; }
    try {
      for (index = 0; index < video.buffered.length; index += 1) {
        values.push(formatTime(video.buffered.start(index)) + '-' + formatTime(video.buffered.end(index)));
      }
    } catch (error) { return ''; }
    return values.join(', ');
  }

  function playbackSourceSummary(playback) {
    var values = [];
    if (!playback) { return ''; }
    if (playback.sourceWidth && playback.sourceHeight) { values.push(playback.sourceWidth + 'x' + playback.sourceHeight); }
    if (playback.originalVideoCodec) { values.push(String(playback.originalVideoCodec).toUpperCase()); }
    if (playback.originalContainer) { values.push(String(playback.originalContainer).toUpperCase()); }
    if (playback.videoDynamicRange) { values.push(playback.videoDynamicRange); }
    return values.join(' / ');
  }

  function currentPlaybackDiagnostics() {
    var playback = currentPlayback;
    var video = document.getElementById('player-video');
    var currentStep;
    var attempts = [];
    var index;
    if (!playback) { return lastPlaybackDiagnostics; }
    currentStep = PlaybackRecovery.current(playerRecoveryState);
    for (index = 0; index < playerRecoveryState.plan.length && index <= playerRecoveryState.index; index += 1) {
      attempts.push(playerRecoveryState.plan[index].kind);
    }
    return {
      fileName: playback.fileName,
      fileSize: playback.fileSize,
      source: playbackSourceSummary(playback),
      delivery: playback.playbackMode,
      strategy: currentStep && currentStep.kind,
      attempts: attempts,
      fallback: playerRecoveryState.index > 0 && currentStep ? currentStep.kind : '',
      position: playerAbsoluteTime(),
      duration: Number(playback.duration || 0) / 1000,
      buffered: bufferedPlaybackRanges(video),
      state: playerStreamSwitching ? 'loading' : (video.paused ? 'paused' : playerRecoveryState.status || 'playing')
    };
  }

  function capturePlaybackDiagnostics() {
    if (currentPlayback) { lastPlaybackDiagnostics = currentPlaybackDiagnostics(); }
  }

  function diagnosticsSnapshot(identityState) {
    var profile = AuthStore ? AuthStore.activeProfile(authState) : null;
    var values = identityState || {};
    var identity = values.identity || activeServer || {};
    return DiagnosticsState.snapshot({
      appVersion: authOptions.version,
      server: {
        name: identity.name || (activeServer && activeServer.name) || config.serverName,
        version: identity.version,
        machineIdentifier: identity.machineIdentifier || (activeServer && activeServer.machineIdentifier),
        reachable: values.reachable === true,
        addresses: serverConnectionAddresses(activeServer || { uri: config.apiBaseUrl })
      },
      profile: {
        mode: authState.mode === 'plex' ? 'Plex' : 'Offline',
        name: authState.mode === 'plex' && profile ? profile.title : t('profile.offline')
      },
      device: {
        modelName: playbackCapabilities.modelName,
        webOSVersion: webOSVersion(),
        viewport: String(root.innerWidth || 0) + 'x' + String(root.innerHeight || 0),
        known: playbackCapabilities.known,
        uhd: playbackCapabilities.uhd,
        hdr10: playbackCapabilities.hdr10
      },
      playback: currentPlaybackDiagnostics(),
      error: values.error || lastDiagnosticsError
    });
  }

  var diagnosticsView = DiagnosticsView.create({
    document: document,
    root: root,
    t: t,
    element: element,
    setText: setText,
    formatFileSize: formatFileSize,
    formatLongTime: formatLongTime,
    getSnapshot: diagnosticsSnapshot,
    loadIdentity: function (callback) {
      if (!config.apiBaseUrl || !PlexClient || !PlexClient.loadServerIdentity) { return null; }
      return PlexClient.loadServerIdentity(config, callback);
    },
    sanitizeError: DiagnosticsState.sanitizeText,
    isPointerSelectionActive: function () { return pointerSelectionActive; },
    onOpen: function () {
      appView = 'diagnostics';
      backgroundAudio.stop();
      document.getElementById('app-settings-view').className = 'app-settings-view is-hidden';
    },
    onClose: function () {
      appView = 'settings';
      settingsView.focusList(settingsRows().length - 1, settingsRows().length);
      document.getElementById('app-settings-view').className = 'app-settings-view';
      renderNavigation();
      renderAppSettings();
    }
  });

  function openDiagnostics() { diagnosticsView.open(); }

  function activateDiagnosticsAction() { diagnosticsView.activate(); }

  function handleDiagnosticsKey(event, direction) { diagnosticsView.handleKey(event, direction); }
