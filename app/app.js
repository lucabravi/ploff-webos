// Generated bundle entry: edit app/source fragments, then run npm run build:app.
this.PloffCredentialVault.prepare(this, this.localStorage, function (credentialStorage) {
/**
 * The legacy shell deliberately avoids framework-specific DOM types. Runtime
 * element kinds are fixed by app/index.html and covered by shell tests.
 * @param {*} root
 * @param {*} document
 */
(function (root, document) {
  'use strict';

  var data = { navigation: ['Home'], rows: [] };
  var FocusModel = root.PloffFocusModel;
  var NavigationModel = root.PloffNavigationModel;
  var SearchModel = root.PloffSearchModel;
  var PloffSearchView = root.PloffSearchView;
  var LibraryFilterView = root.PloffLibraryFilterView;
  var PloffLibraryGridView = root.PloffLibraryGridView;
  var LibraryLifecycle = root.PloffLibraryLifecycle;
  var DetailEpisodeView = root.PloffDetailEpisodeView;
  var DetailNavigation = root.PloffDetailNavigation;
  var DetailPresentationView = root.PloffDetailPresentationView;
  var DetailPreferenceState = root.PloffDetailPreferenceState;
  var ChoiceDialogView = root.PloffChoiceDialogView;
  var T9Input = root.PloffT9Input;
  var SearchSession = root.PloffSearchSession;
  var HomeState = root.PloffHomeState;
  var ActivityState = root.PloffActivityState;
  var MetadataRefresh = root.PloffMetadataRefresh;
  var SkipMarkerState = root.PloffSkipMarkerState;
  var PlayerControlsState = root.PloffPlayerControlsState;
  var PlayerControlsView = root.PloffPlayerControlsView;
  var PlayerBufferingIndicator = root.PloffPlayerBufferingIndicator;
  var ChapterState = root.PloffChapterState;
  var PlayerChaptersView = root.PloffPlayerChaptersView;
  var PlaybackStrategy = root.PloffPlaybackStrategy;
  var VersionSelection = root.PloffVersionSelection;
  var PlaybackRecovery = root.PloffPlaybackRecovery;
  var PlaybackClock = root.PloffPlaybackClock;
  var PlayerSeekController = root.PloffPlayerSeekController;
  var PlayerTimelinePolicy = root.PloffPlayerTimelinePolicy;
  var EpisodeNavigation = root.PloffEpisodeNavigation;
  var ResumeChoice = root.PloffResumeChoice;
  var SubtitleSync = root.PloffSubtitleSync;
  var SubtitleEditorView = root.PloffSubtitleEditorView;
  var SubtitleOffsetStore = root.PloffSubtitleOffsetStore;
  var DiagnosticsState = root.PloffDiagnosticsState;
  var DiagnosticsView = root.PloffDiagnosticsView;
  var NavbarWindow = root.PloffNavbarWindow;
  var LibraryContainers = root.PloffLibraryContainers;
  var ViewState = root.PloffViewState;
  var CardLayout = root.PloffCardLayout;
  var DeviceCapabilities = root.PloffDeviceCapabilities;
  var DeviceLocale = root.PloffDeviceLocale;
  var MediaPreferences = root.PloffMediaPreferences;
  var MediaProfile = root.PloffMediaProfile;
  var MediaInfo = root.PloffMediaInfo;
  var MediaInfoView = root.PloffMediaInfoView;
  var MediaLabels = root.PloffMediaLabels;
  var NetworkState = root.PloffNetworkState;
  var NetworkPolicy = root.PloffNetworkPolicy;
  var NetworkTransition = root.PloffNetworkTransition;
  var WatchlistClient = root.PloffWatchlistClient;
  var WatchlistState = root.PloffWatchlistState;
  var WatchlistView = root.PloffWatchlistView;
  var PlexClient = root.PloffClient;
  var ProgressiveImages = root.PloffProgressiveImages;
  var I18n = root.PloffI18n;
  var Settings = root.PloffSettings;
  var LocalData = root.PloffLocalData;
  var SettingsCatalog = root.PloffSettingsCatalog;
  var SettingsView = root.PloffSettingsView;
  var ServerEditorView = root.PloffServerEditorView;
  var SetupView = root.PloffSetupView;
  var SetupScanIndicator = root.PloffSetupScanIndicator;
  var SetupFocus = root.PloffSetupFocus;
  var SetupAuthSession = root.PloffSetupAuthSession;
  var SetupController = root.PloffSetupController;
  var AuthStore = root.PloffAuthStore;
  var PlexAuth = root.PloffPlexAuth;
  var ServerStore = root.PloffServerStore;
  var ServerDiscovery = root.PloffServerDiscovery;
  var BackgroundAudio = root.PloffBackgroundAudio;
  var BuildInfo = root.PloffBuildInfo || { version: 'development' };
  var formatTime = PlayerTimelinePolicy.formatTime;
  var formatLongTime = PlayerTimelinePolicy.formatLongTime;
  var config = root.PloffConfig || {};
  var networkState = NetworkState.create(root);
  var networkSnapshot = networkState.snapshot();
  var networkTransition = NetworkTransition.create(networkSnapshot, function (server) { resumeRemoteConnectionVerification(server); });
  var startupStartedAt = new Date().getTime();
  var startupComplete = false;
  var startupTimer = null;
  var configuredApiBaseUrl = config.apiBaseUrl || '';
  var configuredToken = config.token || '';
  var configuredServer = ServerStore ? ServerStore.fromConfig(config) : null;
  var serverState = ServerStore ? ServerStore.load(root.localStorage) : { version: 1, activeUri: '', servers: [] };
  var authState = AuthStore ? AuthStore.load(credentialStorage) : { version: 1, setupComplete: false, mode: 'offline', ownerToken: '', activeProfileId: '', profiles: [] };
  var authOptions = {
    baseUrl: config.accountBaseUrl || 'https://plex.tv',
    clientIdentifier: PlexAuth ? PlexAuth.clientIdentifier(root.localStorage) : '',
    deviceName: 'Ploff',
    platformVersion: String(root.navigator && root.navigator.userAgent || ''),
    timeout: Math.min(6000, Number(config.requestTimeout || 5000)),
    version: BuildInfo.version
  };
  var activeServer = null;
  var serverDiscoveryActive = false;
  var serverFailoverRequest = null;
  var serverFailoverFailedUris = {};
  var remoteConnectionVerificationStarted = {};
  var setupStage = 'servers';
  var setupPin = null;
  var setupAuthGeneration = 0;
  var setupStatusKey = '';
  var setupController = null;
  if (ServerStore && configuredServer) {
    serverState.servers = ServerStore.merge(serverState.servers, [configuredServer]);
  }
  var navigationItems = data.navigation.map(function (title, index) {
    return { title: title, kind: index === 0 ? 'home' : (title === 'Cerca' ? 'search' : 'demo'), labelKey: index === 0 ? 'nav.home' : (title === 'Cerca' ? 'nav.search' : '') };
  });
  navigationItems.push({ title: 'Watchlist', kind: 'watchlist', labelKey: 'nav.watchlist' });
  navigationItems.push({ title: 'Playlists', kind: 'playlists', labelKey: 'nav.playlists' });
  navigationItems.push({ title: 'Impostazioni', kind: 'settings', labelKey: 'nav.settings' });
  var availableNavigationItems = navigationItems.slice();
  var navbarLibraryWindowStart = 0;
  var navbarResizeTimer = null;
  var appSettings = Settings.load(root.localStorage);
  var languageCatalog = ['en', 'it', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh', 'ru'];
  var accentColorValues = {
    cyan: '#13b8ad',
    amber: '#e5a00d',
    blue: '#4da3ff',
    green: '#48c774',
    pink: '#ec6aa7',
    purple: '#a66cff',
    red: '#f05d5e',
    white: '#ffffff'
  };
  var setupUiLanguages = [
    { code: 'en', label: 'English', changeLabel: 'Change language' },
    { code: 'it', label: 'Italiano', changeLabel: 'Cambia lingua' },
    { code: 'es', label: 'Espa\u00f1ol', changeLabel: 'Cambiar idioma' },
    { code: 'fr', label: 'Fran\u00e7ais', changeLabel: 'Changer de langue' },
    { code: 'de', label: 'Deutsch', changeLabel: 'Sprache \u00e4ndern' },
    { code: 'pt', label: 'Portugu\u00eas', changeLabel: 'Mudar idioma' },
    { code: 'ja', label: '\u65e5\u672c\u8a9e', changeLabel: '\u8a00\u8a9e\u3092\u5909\u66f4' },
    { code: 'ko', label: '\ud55c\uad6d\uc5b4', changeLabel: '\uc5b8\uc5b4 \ubcc0\uacbd' }
  ];
  var backgroundAudio = BackgroundAudio.create(document.getElementById('theme-audio'), root, 20);
  var themeLookupTimer = null;
  var themeLookupToken = 0;
  var themeLookupKeys = [];
  var themeLookupCache = {};
  var state = { area: 'media', navIndex: 0, rowIndex: 0, column: 0 };
  var lastHomeSelectionKey = '';
  var homeDomDirty = true;
  var homeRefreshCoordinator = null;
  var homePoller = null;
  var homeRefreshVisualActive = false;
  var messageTimer = null;
  var activeBackdrop = 0;
  var activeBackdropSource = '';
  var backdropRequest = 0;
  var backdropTimer = null;
  var appView = 'home';
  var detailReturnView = 'home';
  var lastDetailPresentationKey = '';
  var searchView = null;
  var resultOverscanRows = 3;
  var libraryGridView = null;
  var libraryLifecycle = null;
  var libraryViewCache = {};
  var libraryDomCacheOrder = [];
  var libraryPrefetchTimer = null;
  var libraryPrefetchQueue = [];
  var libraryPrefetchActive = false;
  var libraryPrefetchAnchor = -1;
  var activeLibrary = null;
  var libraryTabIndex = 0;
  var libraryZone = 'tabs';
  var libraryControlIndex = 0;
  var librarySort = 'titleSort';
  var librarySortDirection = 'asc';
  var libraryWatchedFilter = 'all';
  var libraryFilterView = LibraryFilterView.create({
    document: document,
    root: root,
    element: element,
    setText: setText,
    t: t,
    libraryTitle: function (library) { return library ? library.title : ''; },
    loadOptions: function (library, callback) { return PlexClient.loadLibraryFilterOptions(config, library, callback); },
    fallbackOptions: function () {
      return { year: [], genre: [], actor: [], director: [], resolution: [], hdr: [
        { value: '1', label: t('library.filterHdr') }, { value: '0', label: t('library.filterSdr') }
      ] };
    },
    clearFocus: clearLogicalFocus,
    isPointerSelectionActive: function () { return pointerSelectionActive; },
    onApply: function (filters) {
      libraryWatchedFilter = filters && filters.watched ? filters.watched : 'all';
      renderLibraryControls(); loadLibraryContent(true);
    },
    onClose: function () {
      if (appView !== 'library') { return; }
      libraryZone = 'filter'; libraryControlIndex = 3; updateLibraryFocus();
    }
  });
  var libraryActionIndex = 0;
  var libraryRefreshPending = false;
  var libraryBackLockedUntil = 0;
  var watchlistView = null;
  var selectedItem = null;
  var seriesContext = null;
  var detailZone = 'play';
  var detailPresentationView = null;
  var mediaInfoView = MediaInfoView.create({ document: document, t: t });
  var detailSeasonIndex = 0;
  var detailEpisodeIndex = 0;
  var detailEpisodeView = null;
  var detailNavigation = DetailNavigation.create();
  var detailMetadataTimer = null;
  var episodeDetailToken = 0;
  var seasonPreviewTimer = null;
  var seasonPreviewToken = 0;
  var seasonTransitionMediaKey = '';
  var currentDetail = null;
  var detailPreferenceState = DetailPreferenceState.create({ MediaPreferences: MediaPreferences, MediaProfile: MediaProfile, storage: root.localStorage });
  var choiceDialogView = ChoiceDialogView.create({ document: document });
  var choiceDialogApply = null;
  var choiceDialogReturnFocus = null;
  var privacyDialogOpen = false;
  var detailMediaProfileRequest = null;
  var detailMediaProfileTimer = null;
  var detailMediaProfileToken = 0;
  var detailMediaProfileRatingKey = '';
  var detailMediaProfileLoading = false;
  var detailMediaLoadingLabelTimer = null;
  var detailMediaLoadingLabelVisible = false;
  var detailTransitionTimer = null;
  var detailTransitionEndTimer = null;
  var currentPlayback = null;
  var episodeResolver = EpisodeNavigation.createResolver(function (season, callback) {
    PlexClient.loadSeasonEpisodes(config, season.ratingKey, '', callback);
  });
  var playerRecoveryState = PlaybackRecovery.create([]);
  var playerRecoveryTimer = null;
  var playerErrorVisible = false;
  var playerErrorIndex = 0;
  var playerErrorRetryAction = null;
  var resumeChoiceState = null;
  var resumeChoiceVisible = false;
  var activeViewState = null;
  var playbackCapabilities = {
    directPlay: false, codecs: [], containers: [], known: false,
    uhd: false, hdr10: false, dolbyVision: false, hdrKnown: false
  };

  var playerStreamSwitching = false;
  var playbackClock = PlaybackClock.create(2);
  var playerBuffering = false;
  var playerNativeSeekPending = false;
  var playerNativeSeekTarget = null;
  var playerNativeSeekVerificationTimer = null;
  var playerClockRepairTimer = null;
  var playerClockRepairFallbackTimer = null;
  var timelineTimer = null;
  var transcodeKeepaliveTimer = null;
  var playerResumeTimer = null;
  var playerButtonIndex = 1;
  var playerZone = 'buttons';
  var playerControlsTimer = null;
  var playerControlsMode = 'full';
  var playerControlsView = null;
  var playerControlsVisible = true;
  var chapterState = ChapterState.create();
  var playerChaptersView = null;
  var controlsHiddenAt = 0;
  var playerBackArmed = false;
  var detailBackLockedUntil = 0;
  var seekRepeatCount = 0;
  var pendingPlayerSeek = null;
  var playerSeekTimer = null;
  var settingsOpen = false;
  var settingIndex = 0;
  var playerSettingsSnapshot = '';
  var subtitleEditorOpen = false;
  var subtitleEditorState = null;
  var subtitleEditorView = null;
  var subtitleEditorIndex = 0;
  var subtitleEditorRequest = null;
  var subtitleEditorGeneration = 0;
  var subtitlePanelTransitionTimer = null;
  var subtitlePreviewTimer = null;
  var failedSubtitleStreams = {};
  var playerTimelineSuppressed = false;
  var pendingPlaybackRestore = null;
  var localSubtitleState = null;
  var localSubtitleRequest = null;
  var localSubtitleGeneration = 0;
  var estimatedEndTimer = null;
  var detailActionIndex = 0;
  var detailRefreshPending = false;
  var pendingDetailProgress = null;
  var detailMetadataStatusTimer = null;
  var detailMetadataStatusTemporary = false;
  var detailPlayPending = false;
  var autoplayTimer = null;
  var autoplaySeconds = 0;
  var autoplayVisible = false;
  var skipMarkerState = SkipMarkerState.create();
  var skipPromptTimer = null;
  var skipPromptTimerDeadline = 0;
  var navHoldTimer = null;
  var navHoldTriggered = false;
  var navReorderMode = false;
  var navReorderReady = false;
  var navReorderOriginalItems = null;
  var suppressNextPointerClick = false;
  var pointerOriginX = null;
  var pointerOriginY = null;
  var pointerOriginTarget = null;
  var pointerPrimed = false;
  var pointerSelectionActive = false;
  var pointerSuppressedUntil = 0;
  var pointerCurrentButton = null;
  var wheelDebounceTimer = null;
  var wheelNavigationActive = false;
  var libraryWheelScrollTimer = null;
  var pageScrollPendingFocus = false;
  var wheelPointerLocked = false;
  var wheelPointerLockX = null;
  var wheelPointerLockY = null;
  var wheelPointerUnlockDistance = Math.max(1, Number(root.innerHeight) || 0) * 0.3;
  var pointerLastX = null;
  var pointerLastY = null;
  var serverActivities = [];
  var serverActivityFingerprint = '';
  var serverActivityPollTimer = null;
  var serverActivityRequest = null;
  var serverActivityWaiters = [];
  var lastPlaybackDiagnostics = null;
  var lastDiagnosticsError = '';
  var navigationPreviewScheduler = NavigationModel.createPreviewScheduler(root, 250, showNavigationPreview);
  var posterLoader = ProgressiveImages.create({
    Image: root.Image,
    previewConcurrency: 6,
    fullConcurrency: 3,
    isAttached: function (target) { return document.body.contains(target); },
    urlFor: function (source, width, height) { return PlexClient.posterUrl(config, source, width, height); }
  });
  homeRefreshCoordinator = HomeState.createRefreshCoordinator(function (callback) {
    setHomeRefreshVisualActive(true);
    try {
      PlexClient.loadHome(config, function (error, rows) {
        setHomeRefreshVisualActive(false);
        (rows || []).forEach(function (row) {
          if (row.recommendation) { row.title = t('home.recommended'); }
        });
        callback(error, rows);
      });
    } catch (error) {
      setHomeRefreshVisualActive(false);
      throw error;
    }
  }, function (error, rows, changed, initial) {
    if (homePoller) { homePoller.schedule(); }
    if (error) {
      if (appView === 'home' && !data.rows.length) {
        completeStartup();
        if (!passiveHomeState('state.homeError')) { showViewState('error', 'home', loadHomeRows, openSetup); }
      }
      return;
    }
    if (!changed) { if (appView === 'home' && data.rows.length) { hideViewState(); } return; }
    if (appView === 'home') {
      usePlexRows(rows, 0, { focus: initial ? 'first' : 'preserve', selectionKey: lastHomeSelectionKey });
    } else {
      data.rows = rows;
      homeDomDirty = true;
    }
  });
  homePoller = HomeState.createPoller(root, {
    interval: 10000,
    canRefresh: function () {
      return appView === 'home' && !document.hidden && !!config.apiBaseUrl && networkState.allowsLocal();
    },
    isLoading: function () { return homeRefreshCoordinator.isLoading(); },
    refresh: function () { homeRefreshCoordinator.refresh(); }
  });
  // Shared shell, navigation, Home, focus, artwork, and backdrop behavior.
  function searchMediaKey(item) {
    return String(item.ratingKey || item.key || item.image || item.title || '');
  }

  function updateNodeText(node, value) {
    node.innerHTML = '';
    node.appendChild(document.createTextNode(value || ''));
  }

  function t(key, parameters) {
    return I18n.t(appSettings.uiLanguage, key, parameters);
  }

  function completeStartup() {
    var splash = document.getElementById('startup-splash');
    var elapsed;
    var delay;
    function finish() {
      document.body.className = document.body.className.replace(/\s*is-booting/g, '');
      if (!splash) { return; }
      splash.className = 'startup-splash is-leaving';
      root.setTimeout(function () { splash.className = 'startup-splash is-hidden'; }, 250);
    }
    if (startupComplete) {
      document.body.className = document.body.className.replace(/\s*is-booting/g, '');
      return;
    }
    startupComplete = true;
    elapsed = new Date().getTime() - startupStartedAt;
    delay = Math.max(0, 1000 - elapsed);
    root.clearTimeout(startupTimer);
    startupTimer = root.setTimeout(finish, delay);
  }

  function setHomeRefreshVisualActive(active) {
    active = !!active;
    if (homeRefreshVisualActive === active) { return; }
    homeRefreshVisualActive = active;
    renderServerActivities();
  }

  function cardMetrics() {
    return CardLayout.metrics(appSettings.cardScale);
  }

  function applyCardScale() {
    var metrics = cardMetrics();
    var wide = CardLayout.wideMetrics(appSettings.cardScale);
    var style = document.documentElement.style;
    style.setProperty('--poster-card-width', metrics.width + 'px');
    style.setProperty('--poster-image-height', metrics.imageHeight + 'px');
    style.setProperty('--poster-caption-height', metrics.captionHeight + 'px');
    style.setProperty('--poster-card-height', metrics.height + 'px');
    style.setProperty('--poster-card-gap', Math.max(7, metrics.columnStep - metrics.width) + 'px');
    style.setProperty('--wide-card-width', wide.width + 'px');
    style.setProperty('--wide-image-height', wide.imageHeight + 'px');
    style.setProperty('--wide-card-height', wide.height + 'px');
    style.setProperty('--poster-title-font', Math.max(20, Math.round(23 * appSettings.cardScale / 100)) + 'px');
    style.setProperty('--poster-meta-font', Math.max(20, Math.round(20 * appSettings.cardScale / 100)) + 'px');
  }

  function navigationTitle(item) {
    return item.labelKey ? t(item.labelKey) : item.title;
  }

  function mediaTitle(item) { return MediaLabels.title(item, t); }
  function mediaMeta(item) { return MediaLabels.meta(item, t); }
  function mediaDetail(item) { return MediaLabels.detail(item, t); }
  function mediaCardMeta(item) { return MediaLabels.cardMeta(item, t); }
  function mediaCardDetail(item) { return MediaLabels.cardDetail(item, t); }
  function mediaDescription(item) { return MediaLabels.description(item, t); }

  function watchlistAccountToken() {
    var profile = AuthStore ? AuthStore.activeProfile(authState) : null;
    return authState.mode === 'plex' ? String(profile && profile.accountToken || authState.ownerToken || '') : '';
  }

  function watchlistAvailable() {
    return !!(networkState.allowsCloud() && WatchlistState && WatchlistClient && WatchlistState.available(authState.mode, watchlistAccountToken()));
  }

  function renderNetworkPresentation() {
    renderNavigation();
    renderServerActivities();
    if (appView === 'settings') { renderAppSettings(); }
    if (typeof diagnosticsView !== 'undefined' && diagnosticsView && diagnosticsView.isOpen()) { diagnosticsView.render(); }
  }

  function watchlistIdentity() {
    var profile = AuthStore ? AuthStore.activeProfile(authState) : null;
    return [activeServer && (activeServer.machineIdentifier || activeServer.uri) || config.apiBaseUrl || '', profile && (profile.id || profile.uuid || profile.title) || 'local'].join('|');
  }

  function translateStaticUi() {
    setText('startup-splash-label', t('startup.loading'));
    document.getElementById('navigation').setAttribute('aria-label', t('nav.main'));
    setText('detail-play', t('detail.play'));
    setText('detail-refresh-metadata', t('detail.refreshMetadata'));
    document.getElementById('detail-file-info').setAttribute('aria-label', t('detail.mediaDetails'));
    setText('detail-version-label', t('detail.version'));
    setText('detail-media-info-subtitle-languages-label', t('detail.subtitleLanguages'));
    setText('detail-media-info-video-label', t('detail.video'));
    setText('detail-media-info-audio-label', t('detail.audio'));
    setText('detail-media-info-bitrate-label', t('detail.bitrate'));
    setText('library-refresh-metadata', t('library.refreshMetadata'));
    document.getElementById('library-refresh').title = t('library.refresh');
    document.getElementById('library-refresh').setAttribute('aria-label', t('library.refresh'));
    setText('player-settings-title', t('player.settings'));
    setText('setting-audio-label', t('player.audio'));
    setText('setting-subtitles-label', t('player.subtitles'));
    setText('setting-size-label', t('player.subtitleSize'));
    setText('setting-subtitle-advanced-label', t('player.advancedSubtitles'));
    setText('setting-version-label', t('detail.version'));
    setText('setting-quality-label', t('settings.videoQuality'));
    setText('setting-playback-mode-label', t('settings.playbackMode'));
    setText('player-track-audio-label', t('player.audio') + ': ');
    setText('player-track-subtitles-label', t('player.subtitles') + ': ');
    setText('playback-info-file-label', t('player.infoFile'));
    setText('playback-info-size-label', t('player.infoSize'));
    setText('playback-info-source-label', t('player.infoSource'));
    setText('playback-info-hdr-label', t('player.infoHdr'));
    setText('playback-info-mode-label', t('player.infoMode'));
    setText('autoplay-play', t('detail.play'));
    setText('autoplay-cancel', t('player.cancel'));
    setText('player-error-title', t('player.errorTitle'));
    setText('player-error-retry', t('player.retry'));
    setText('player-error-settings', t('player.settings'));
    setText('player-error-back', t('player.back'));
    setText('player-chapters-hint-label', t('player.chapters'));
    setText('player-chapters-title', t('player.chapters'));
    document.getElementById('player-previous').setAttribute('aria-label', t('player.previous'));
    document.getElementById('player-next').setAttribute('aria-label', t('player.next'));
    document.getElementById('player-timeline-button').setAttribute('aria-label', t('player.timeline'));
    document.getElementById('player-settings-button').setAttribute('aria-label', t('player.settings'));
    setText('subtitle-editor-title', t('player.advancedSubtitles'));
    setText('subtitle-editor-track-label', t('player.subtitles'));
    setText('subtitle-editor-size-label', t('player.subtitleSize'));
    setText('subtitle-editor-loop-label', t('player.subtitleLoop'));
    setText('subtitle-editor-apply-label', t('player.subtitleApply'));
    setText('subtitle-editor-cancel-label', t('player.cancel'));
  }

  function element(tagName, className, text) {
    var node = document.createElement(tagName);
    node.className = className || '';
    if (typeof text === 'string') {
      node.appendChild(document.createTextNode(text));
    }
    return node;
  }

  function updateViewStateFocus() {
    var buttons = document.querySelectorAll('#view-state-actions button');
    var index;
    if (!activeViewState || !buttons.length) { return; }
    for (index = 0; index < buttons.length; index += 1) { buttons[index].className = index === activeViewState.index ? 'is-focused' : ''; }
    buttons[activeViewState.index].focus();
  }

  function showViewState(kind, scope, retryAction, backAction) {
    var model = ViewState.model(kind, scope);
    var actions = document.getElementById('view-state-actions');
    var section = document.getElementById('view-state');
    activeViewState = { model: model, index: 0, retry: retryAction || null, back: backAction || null };
    setText('view-state-title', t(model.titleKey));
    setText('view-state-message', t(model.messageKey));
    actions.innerHTML = '';
    model.actions.forEach(function (action) {
      var button = element('button', '', t('state.' + action));
      button.type = 'button';
      button.setAttribute('data-view-state-action', action);
      button.onclick = function () {
        if (action === 'retry' && activeViewState && activeViewState.retry) { hideViewState(); activeViewState = null; retryAction(); }
        else if (action === 'back') { hideViewState(); if (backAction) { backAction(); } }
      };
      actions.appendChild(button);
    });
    section.className = 'view-state' + (kind === 'loading' ? ' is-loading' : '');
    updateViewStateFocus();
  }

  function hideViewState() {
    document.getElementById('view-state').className = 'view-state is-hidden';
    activeViewState = null;
  }

  function handleViewStateKey(event, direction) {
    var actions;
    var action;
    if (!activeViewState) { return false; }
    actions = activeViewState.model.actions;
    if ((event.keyCode === 27 || event.keyCode === 461) && activeViewState.back) {
      var loadingBack = activeViewState.back; hideViewState(); loadingBack(); return true;
    }
    if (!actions.length) { return true; }
    if (direction === 'left' || direction === 'right') {
      activeViewState.index = ViewState.focusIndex(activeViewState.index, actions.length, direction === 'left' ? -1 : 1);
      updateViewStateFocus();
    } else if (event.keyCode === 13) {
      action = actions[activeViewState.index];
      if (action === 'retry' && activeViewState.retry) { var retry = activeViewState.retry; hideViewState(); retry(); }
      else if (action === 'back') { var back = activeViewState.back; hideViewState(); if (back) { back(); } }
    } else if (event.keyCode === 27 || event.keyCode === 461) {
      var backAction = activeViewState.back; hideViewState(); if (backAction) { backAction(); }
    }
    return true;
  }

  function progressivePosterSpecification(source, width, height, priority, scope) {
    var preview = ProgressiveImages.previewSize(width, height, 96);
    return {
      source: source,
      previewWidth: preview.width,
      previewHeight: preview.height,
      width: width,
      height: height,
      priority: priority,
      scope: scope
    };
  }

  function renderedPosterSpecification(image, source, priority, scope, fallbackWidth, fallbackHeight) {
    var rect = image && image.getBoundingClientRect ? image.getBoundingClientRect() : null;
    var width;
    var height;
    if (rect && rect.width && rect.height) {
      width = Math.ceil(rect.width);
      height = Math.ceil(rect.height);
    } else {
      width = Math.ceil(image.clientWidth || fallbackWidth || 154);
      height = Math.ceil(image.clientHeight || fallbackHeight || 224);
    }
    return progressivePosterSpecification(source, width, height, priority, scope);
  }

  function loadRenderedPoster(image, source, priority, scope, fallbackWidth, fallbackHeight) {
    posterLoader.load(image, renderedPosterSpecification(image, source, priority, scope, fallbackWidth, fallbackHeight));
  }

  function prioritizePoster(card) {
    var images = card ? card.getElementsByTagName('img') : [];
    if (images.length) { posterLoader.prioritize(images[0]); }
  }

  function navigationButton(entry) {
    var item = element('button', 'nav-item', navigationTitle(entry.item));
    item.type = 'button';
    item.setAttribute('data-nav-index', entry.index);
    if (entry.item.kind === 'watchlist' && !watchlistAvailable()) {
      item.className += ' is-disabled';
      item.setAttribute('aria-disabled', 'true');
    }
    if (entry.index === state.navIndex) {
      item.className += ' is-selected';
      if (navigationHasFocus()) { item.className += ' is-focused'; }
      if (navReorderMode) { item.className += ' is-reordering'; }
    }
    return item;
  }

  function visibleNavigationItems(items) {
    return (items || []).filter(function (item) {
      if (item.kind === 'watchlist') { return appSettings.showWatchlist; }
      if (item.kind === 'playlists') { return appSettings.showPlaylists; }
      return true;
    });
  }

  function applyNavigationVisibility(items) {
    var activeItem = navigationItems[state.navIndex];
    var activeIndex;
    availableNavigationItems = (items || availableNavigationItems).slice();
    navigationItems = visibleNavigationItems(availableNavigationItems);
    activeIndex = navigationItems.indexOf(activeItem);
    state.navIndex = activeIndex >= 0 ? activeIndex : Math.max(0, Math.min(state.navIndex, navigationItems.length - 1));
  }

  applyNavigationVisibility();

  function renderNavigation() {
    var navigation = document.getElementById('navigation');
    var home = element('div', 'navigation-home');
    var libraries = element('div', 'navigation-libraries');
    var fixed = element('div', 'navigation-fixed');
    var libraryEntries = [];
    var libraryButtons = [];
    var widths = [];
    var focusedLibraryIndex = navbarLibraryWindowStart;
    var windowState;
    var index;
    var entry;
    var button;

    navigation.innerHTML = '';
    for (index = 0; index < navigationItems.length; index += 1) {
      entry = { item: navigationItems[index], index: index };
      if (entry.item.kind === 'home') {
        home.appendChild(navigationButton(entry));
      } else if (entry.item.kind === 'library') {
        if (index === state.navIndex) { focusedLibraryIndex = libraryEntries.length; }
        libraryEntries.push(entry);
      } else {
        fixed.appendChild(navigationButton(entry));
      }
    }
    navigation.appendChild(home);
    navigation.appendChild(libraries);
    navigation.appendChild(fixed);
    for (index = 0; index < libraryEntries.length; index += 1) {
      button = navigationButton(libraryEntries[index]);
      libraries.appendChild(button);
      libraryButtons.push(button);
      widths.push(button.offsetWidth + 12);
    }
    if (NavbarWindow && libraryEntries.length) {
      windowState = NavbarWindow.calculate(widths, libraries.clientWidth, focusedLibraryIndex, navbarLibraryWindowStart);
      navbarLibraryWindowStart = windowState.start;
      libraries.className += windowState.canScrollLeft ? ' is-clipped-left' : '';
      libraries.className += windowState.canScrollRight ? ' is-clipped-right' : '';
      for (index = libraryButtons.length - 1; index >= 0; index -= 1) {
        if (index < windowState.start || index >= windowState.end) { libraries.removeChild(libraryButtons[index]); }
      }
    }
    renderActiveProfile();
    renderServerActivities();
  }

  function activeProfileShortcutVisible() {
    if (authState.mode !== 'plex') { return !!authState.setupComplete; }
    return !!(AuthStore && AuthStore.activeProfile(authState));
  }

  function navigationFocusCount() {
    return navigationItems.length + 1 + (activeProfileShortcutVisible() ? 1 : 0);
  }

  function isActivityNavIndex(index) {
    return Number(index) === navigationItems.length;
  }

  function isProfileNavIndex(index) {
    return activeProfileShortcutVisible() && Number(index) === navigationItems.length + 1;
  }

  function selectorForNavIndex(index) {
    var selector;
    if (isProfileNavIndex(index)) { return '[data-profile-shortcut]'; }
    if (isActivityNavIndex(index)) { return '[data-activity-shortcut]'; }
    selector = '[data-nav-index="' + index + '"]';
    if (!document.querySelector(selector) && navigationItems[index] && navigationItems[index].kind === 'library') {
      renderNavigation();
    }
    return selector;
  }

  function createCard(item, rowIndex, column, shape) {
    var card = element('button', 'media-card ' + shape + (item.viewed ? ' is-viewed' : ''));
    var image = element('img', 'card-image');
    var caption = element('span', 'card-caption');

    card.type = 'button';
    image.alt = '';
    caption.appendChild(element('span', 'card-title'));
    caption.appendChild(element('span', 'card-meta'));
    card.appendChild(image);
    card.appendChild(caption);
    updateHomeCard(card, item, rowIndex, column, shape);
    return card;
  }

  function updateHomeCard(card, item, rowIndex, column, shape) {
    var caption = card.querySelector('.card-caption');
    var detail = card.querySelector('.card-detail');
    var progress = card.querySelector('.progress-track');
    var progressValue;
    card.className = 'media-card ' + shape + (item.viewed ? ' is-viewed' : '');
    card.setAttribute('data-row-index', rowIndex);
    card.setAttribute('data-column', column);
    card.setAttribute('data-media-key', HomeState.mediaKey(item));
    card.setAttribute('aria-label', mediaDescription(item));
    updateNodeText(card.querySelector('.card-title'), mediaTitle(item));
    updateNodeText(card.querySelector('.card-meta'), mediaCardMeta(item));
    if (mediaCardDetail(item)) {
      if (!detail) { detail = element('span', 'card-detail'); caption.appendChild(detail); }
      updateNodeText(detail, mediaCardDetail(item));
    } else if (detail) {
      caption.removeChild(detail);
    }

    if (typeof item.progress === 'number') {
      if (!progress) {
        progress = element('span', 'progress-track');
        progress.appendChild(element('span', 'progress-value'));
        card.appendChild(progress);
      }
      progressValue = progress.querySelector('.progress-value');
      progressValue.style.width = item.progress + '%';
    } else if (progress) {
      card.removeChild(progress);
    }
  }

  function startNavHold(index) {
    var item = navigationItems[index];
    if (navHoldTimer || navReorderMode) { return; }
    navHoldTriggered = false;
    if (!navigationHasFocus() || !item || item.kind !== 'library') { return; }
    navHoldTimer = root.setTimeout(function () {
      navHoldTimer = null;
      navHoldTriggered = true;
      navReorderMode = true;
      navReorderReady = false;
      navReorderOriginalItems = navigationItems.slice();
      navigationPreviewScheduler.cancel();
      renderNavigation();
      focusCurrentNavigation();
    }, 800);
  }

  function cancelNavHold() {
    root.clearTimeout(navHoldTimer);
    navHoldTimer = null;
  }

  function moveNavLibrary(direction) {
    var moved = NavigationModel.moveLibrary(navigationItems, state.navIndex, direction);
    navigationItems = moved.items;
    state.navIndex = moved.index;
    renderNavigation();
    focusCurrentNavigation();
  }

  function finishNavReorder(save) {
    if (!navReorderMode) { return; }
    if (save) {
      NavigationModel.save(root.localStorage, NavigationModel.libraryKeys(navigationItems));
    } else if (navReorderOriginalItems) {
      navigationItems = navReorderOriginalItems;
    }
    navReorderMode = false;
    navReorderReady = false;
    navReorderOriginalItems = null;
    renderNavigation();
    focusCurrentNavigation();
  }

  function focusHomeStart() {
    var rowIndex;
    for (rowIndex = 0; rowIndex < data.rows.length; rowIndex += 1) {
      if (data.rows[rowIndex].items && data.rows[rowIndex].items.length) {
        state = { area: 'media', navIndex: 0, rowIndex: rowIndex, column: 0 };
        document.getElementById('content').scrollTop = 0;
        updateFocus();
        return;
      }
    }
  }

  function renderRows() {
    var content = document.getElementById('content');
    var existingSections = [];
    var sectionsByKey = {};
    var renderToken = String(new Date().getTime()) + ':' + String(Math.random());
    var rowIndex;
    var column;
    var rowData;
    var rowKey;
    var section;
    var row;
    var image;
    var posterJobs = [];

    function reconcileCards() {
      var existingCards = [];
      var cardsByKey = {};
      var assignments = [];
      var used = [];
      var recyclable = [];
      var children = row.children;
      var card;
      var key;
      var index;
      for (index = 0; index < children.length; index += 1) {
        card = children[index];
        if (!card.hasAttribute('data-media-key')) { continue; }
        existingCards.push(card);
        key = card.getAttribute('data-media-key') || '';
        cardsByKey[key] = cardsByKey[key] || [];
        cardsByKey[key].push(card);
      }
      for (index = 0; index < rowData.items.length; index += 1) {
        key = HomeState.mediaKey(rowData.items[index]);
        card = cardsByKey[key] && cardsByKey[key].length ? cardsByKey[key].shift() : null;
        assignments[index] = card;
        if (card) { used.push(card); }
      }
      for (index = 0; index < existingCards.length; index += 1) {
        if (used.indexOf(existingCards[index]) === -1) { recyclable.push(existingCards[index]); }
      }
      for (index = 0; index < rowData.items.length; index += 1) {
        card = assignments[index] || recyclable.shift() || createCard(rowData.items[index], rowIndex, index, rowData.shape);
        updateHomeCard(card, rowData.items[index], rowIndex, index, rowData.shape);
        row.appendChild(card);
        image = card.getElementsByTagName('img')[0];
        posterJobs.push({
          target: image,
          specification: renderedPosterSpecification(
            image,
            rowData.items[index].image,
            rowIndex < 2 ? 1 : 2,
            'home',
            rowData.shape === 'wide' ? CardLayout.wideMetrics(appSettings.cardScale).width : cardMetrics().width,
            rowData.shape === 'wide' ? CardLayout.wideMetrics(appSettings.cardScale).imageHeight : cardMetrics().imageHeight
          )
        });
      }
      recyclable.forEach(function (cardToRemove) {
        if (cardToRemove.parentNode === row) { row.removeChild(cardToRemove); }
      });
    }

    for (rowIndex = 0; rowIndex < content.children.length; rowIndex += 1) {
      section = content.children[rowIndex];
      if (!section.hasAttribute('data-home-row-key')) { continue; }
      existingSections.push(section);
      rowKey = section.getAttribute('data-home-row-key') || '';
      sectionsByKey[rowKey] = sectionsByKey[rowKey] || [];
      sectionsByKey[rowKey].push(section);
    }

    for (rowIndex = 0; rowIndex < data.rows.length; rowIndex += 1) {
      rowData = data.rows[rowIndex];
      rowKey = HomeState.rowKey(rowData);
      section = sectionsByKey[rowKey] && sectionsByKey[rowKey].length ? sectionsByKey[rowKey].shift() : null;
      if (!section) {
        section = element('section', 'media-section');
        section.appendChild(element('h2', 'section-title'));
        section.appendChild(element('div', 'media-row'));
      }
      section.setAttribute('data-home-row-key', rowKey);
      section.setAttribute('data-home-render-token', renderToken);
      updateNodeText(section.querySelector('.section-title'), rowData.title);
      row = section.querySelector('.media-row');
      reconcileCards();
      content.appendChild(section);
    }
    for (column = 0; column < existingSections.length; column += 1) {
      section = existingSections[column];
      if (section.getAttribute('data-home-render-token') !== renderToken && section.parentNode === content) {
        content.removeChild(section);
      }
    }
    posterLoader.loadBatch(posterJobs);
  }

  function selectorForState() {
    if (state.area === 'nav') {
      return selectorForNavIndex(state.navIndex);
    }
    return '[data-row-index="' + state.rowIndex + '"][data-column="' + state.column + '"]';
  }

  function artworkUrl(item) {
    var source = item.art || item.image || '';
    return source
      .replace('/400/600', '/1280/720')
      .replace('/640/360', '/1280/720');
  }

  function clearBackdropPresentation() {
    var first = document.getElementById('backdrop-a');
    var second = document.getElementById('backdrop-b');
    backdropRequest += 1;
    root.clearTimeout(backdropTimer);
    backdropTimer = null;
    posterLoader.cancelScope('backdrop');
    posterLoader.load(first, { source: '', scope: 'backdrop' });
    posterLoader.load(second, { source: '', scope: 'backdrop' });
    first.className = 'backdrop-image';
    second.className = 'backdrop-image';
    activeBackdrop = 0;
    activeBackdropSource = '';
  }

  function activateBackdrop(nextIndex, source, request) {
    var current;
    var next;
    if (request !== backdropRequest) { return; }
    current = document.getElementById(activeBackdrop === 0 ? 'backdrop-a' : 'backdrop-b');
    next = document.getElementById(nextIndex === 0 ? 'backdrop-a' : 'backdrop-b');
    current.className = current.className.replace(/\s*is-active/g, '');
    if (next.className.indexOf('is-active') === -1) { next.className += ' is-active'; }
    activeBackdrop = nextIndex;
    activeBackdropSource = source;
  }

  function loadBackdropItem(item, request) {
    var nextIndex;
    var next;
    var source = artworkUrl(item);
    if (!source) { if (request === backdropRequest) { clearBackdropPresentation(); } return; }
    if (source === activeBackdropSource) { return; }
    nextIndex = activeBackdrop === 0 ? 1 : 0;
    next = document.getElementById(nextIndex === 0 ? 'backdrop-a' : 'backdrop-b');
    if (next.__plexProgressiveSource === source && (next.__plexProgressiveState === 'preview' || next.__plexProgressiveState === 'full')) {
      activateBackdrop(nextIndex, source, request);
      return;
    }
    posterLoader.cancelScope('backdrop');
    next.className = next.className.replace(/\s*is-active/g, '');
    posterLoader.load(next, {
      source: source,
      previewWidth: 320,
      previewHeight: 180,
      width: 1920,
      height: 1080,
      priority: 0,
      scope: 'backdrop',
      onPreview: function () { activateBackdrop(nextIndex, source, request); }
    });
  }

  function loadBackdrop(request) {
    if (state.area !== 'media') { return; }
    loadBackdropItem(data.rows[state.rowIndex].items[state.column], request);
  }

  function scheduleBackdrop() {
    backdropRequest += 1;
    root.clearTimeout(backdropTimer);
    backdropTimer = root.setTimeout(function () {
      loadBackdrop(backdropRequest);
    }, 250);
  }

  function scheduleViewBackdrop(item, expectedView, delay) {
    var request;
    backdropRequest += 1;
    request = backdropRequest;
    root.clearTimeout(backdropTimer);
    backdropTimer = root.setTimeout(function () {
      if (appView === expectedView && request === backdropRequest) {
        loadBackdropItem(item, request);
      }
    }, delay);
  }

  function scheduleDetailBackdrop(detail) {
    scheduleViewBackdrop(detail, 'detail', 0);
  }

  function scheduleSearchBackdrop(item) {
    scheduleViewBackdrop(item, 'search', 250);
  }

  function scheduleTheme(item) {
    var cached;
    var cacheKey;
    var token;
    themeLookupToken += 1;
    token = themeLookupToken;
    root.clearTimeout(themeLookupTimer);
    if (!appSettings.backgroundMusic || !item) {
      backgroundAudio.stop();
      return;
    }
    cacheKey = item.themeLookupKey || item.ratingKey;
    cached = cacheKey ? themeLookupCache[cacheKey] : null;
    if (item.themeUrl || cached) {
      backgroundAudio.schedule(item.themeUrl ? item : cached, { delay: appSettings.backgroundDelay, volume: appSettings.backgroundVolume });
      return;
    }
    backgroundAudio.stop();
    if (!item.ratingKey) { return; }
    themeLookupTimer = root.setTimeout(function () {
      PlexClient.loadMetadata(config, item.ratingKey, function (error, detail) {
        var oldKey;
        if (error || token !== themeLookupToken || !detail || !detail.themeUrl) { return; }
        themeLookupCache[cacheKey] = detail;
        themeLookupKeys.push(cacheKey);
        while (themeLookupKeys.length > 20) {
          oldKey = themeLookupKeys.shift();
          delete themeLookupCache[oldKey];
        }
        backgroundAudio.schedule(detail, { delay: 1, volume: appSettings.backgroundVolume });
      });
    }, appSettings.backgroundDelay);
  }

  function clearLogicalFocus() {
    var focused = document.querySelectorAll('.is-focused');
    var index;
    for (index = 0; index < focused.length; index += 1) {
      focused[index].className = focused[index].className.replace(/\s*is-focused/g, '');
    }
  }

  function updateFocus() {
    var next;

    clearLogicalFocus();
    next = document.querySelector(selectorForState());
    if (next) {
      next.className += ' is-focused';
      if (state.area === 'media') { prioritizePoster(next); }
      if (!pointerSelectionActive) {
        next.focus();
        keepFocusVisible(next);
      }
    }
    if (appView === 'home' && state.area === 'media' && data.rows[state.rowIndex] && data.rows[state.rowIndex].items[state.column]) {
      lastHomeSelectionKey = HomeState.mediaKey(data.rows[state.rowIndex].items[state.column]);
    }
    scheduleBackdrop();
    if (state.area === 'media') { scheduleTheme(data.rows[state.rowIndex].items[state.column]); }
    else { backgroundAudio.stop(); }
  }

  function keepFocusVisible(focused) {
    var content;
    var section;
    var contentRect;
    var sectionRect;
    var margin = 18;
    var lowerComfortLine;

    if (state.area !== 'media') {
      return;
    }
    content = document.getElementById('content');
    section = focused.parentNode.parentNode;
    contentRect = content.getBoundingClientRect();
    sectionRect = section.getBoundingClientRect();
    lowerComfortLine = contentRect.top + contentRect.height * 0.75;

    if (sectionRect.bottom > lowerComfortLine) {
      content.scrollTop += sectionRect.bottom - lowerComfortLine + margin;
    } else if (sectionRect.top < contentRect.top + margin) {
      content.scrollTop -= contentRect.top - sectionRect.top + margin;
    }
  }

  function showMessage(text) {
    var message = document.getElementById('message');
    root.clearTimeout(messageTimer);
    message.innerHTML = '';
    message.appendChild(document.createTextNode(text));
    message.className = 'message is-visible';
    messageTimer = root.setTimeout(function () {
      message.className = 'message';
    }, 1600);
  }

  function hideDetailMetadataStatus() {
    root.clearTimeout(detailMetadataStatusTimer);
    detailMetadataStatusTimer = null;
    detailMetadataStatusTemporary = false;
    document.getElementById('detail-metadata-status').className = 'detail-metadata-status is-hidden';
  }

  function showDetailMetadataStatus(text, temporary) {
    root.clearTimeout(detailMetadataStatusTimer);
    detailMetadataStatusTemporary = !!temporary;
    setText('detail-metadata-status', text);
    document.getElementById('detail-metadata-status').className = 'detail-metadata-status';
    if (temporary) {
      detailMetadataStatusTimer = root.setTimeout(hideDetailMetadataStatus, 2200);
    }
  }
  // Search request adapters and cross-view routing. UI state belongs to PloffSearchView.
  function createSearchRequestGroup() {
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

  function resolveCloudSearchLocally(query, cloudItems, group, callback) {
    var candidates = SearchModel.relevantCloudItems(query, cloudItems).slice(0, 12);
    var remaining = candidates.length;
    var resolved = [];
    if (!remaining) { callback([], null); return; }
    candidates.forEach(function (candidate) {
      group.add(PlexClient.findByGuid(config, candidate.guid, function (error, item) {
        if (group.isAborted()) { return; }
        if (!error && item && (item.type === 'movie' || item.type === 'show') && item.ratingKey) { resolved.push(item); }
        remaining -= 1;
        if (!remaining) { callback(resolved, null); }
      }));
    });
  }

  function loadCloudSearchMatches(query, group, callback) {
    var token = watchlistAccountToken();
    function searchProvider(provider) {
      group.add(WatchlistClient.search(root, {
        token: token,
        provider: provider,
        timeout: Math.min(6000, Number(config.requestTimeout || 5000))
      }, query, 12, function (error, cloudItems) {
        if (group.isAborted()) { return; }
        if (error) { callback([], error); return; }
        resolveCloudSearchLocally(query, cloudItems, group, callback);
      }));
    }
    if (!token || !WatchlistClient || !WatchlistClient.search) { callback([], new Error('Cloud search unavailable')); return; }
    if (watchlistView.getProvider()) { searchProvider(watchlistView.getProvider()); return; }
    watchlistView.ensureProvider(function (error, provider) {
      if (group.isAborted()) { return; }
      if (error || !provider) { callback([], error || new Error('Cloud search provider unavailable')); return; }
      searchProvider(provider);
    });
  }

  function loadSearchResults(query, callback) {
    var group = createSearchRequestGroup();
    var localItems = [];
    var localError = null;
    group.add(PlexClient.search(config, query, navigationItems, function (error, items) {
      if (group.isAborted()) { return; }
      localError = error || null;
      localItems = error ? [] : items;
      if (!networkState.allowsCloud() || !watchlistAccountToken()) {
        callback(localError, localItems, true);
        return;
      }
      callback(null, localItems, false);
      loadCloudSearchMatches(query, group, function (resolvedItems, cloudError) {
        if (group.isAborted()) { return; }
        callback(localError && cloudError ? localError : null, SearchModel.mergeLocalResults(localItems, resolvedItems), true);
      });
    }));
    return group;
  }

  function measureSearchResults(container, resultCount, cardWidth, cardHeight) {
    var probe = element('button', 'search-card search-card-probe');
    var rect;
    var computed;
    var measured;
    container.appendChild(probe);
    rect = probe.getBoundingClientRect();
    computed = root.getComputedStyle ? root.getComputedStyle(probe) : null;
    cardWidth = rect.width + (computed ? Number(parseFloat(computed.marginLeft) || 0) + Number(parseFloat(computed.marginRight) || 0) : 0);
    cardHeight = rect.height + (computed ? Number(parseFloat(computed.marginTop) || 0) + Number(parseFloat(computed.marginBottom) || 0) : 0);
    container.removeChild(probe);
    if (cardWidth < 1 || cardHeight < 1) {
      cardWidth = cardMetrics().columnStep;
      cardHeight = cardMetrics().rowStep;
    }
    measured = SearchModel.measureLayout(container.clientWidth - 12, container.clientHeight - 12, cardWidth, cardHeight, resultCount);
    measured.cardWidth = Math.max(64, cardWidth);
    measured.cardHeight = Math.max(64, cardHeight);
    return measured;
  }

  searchView = PloffSearchView.create({
    root: root,
    document: document,
    SearchModel: SearchModel,
    SearchSession: SearchSession,
    T9Input: T9Input,
    element: element,
    t: t,
    load: loadSearchResults,
    isActive: function () { return appView === 'search'; },
    t9Enabled: function () { return appSettings.searchT9Input; },
    navigationCount: navigationFocusCount,
    navTarget: function (index) { return document.querySelector(selectorForNavIndex(index)); },
    onNavigationChange: function (index) {
      state.navIndex = index;
      renderNavigation();
      scheduleNavigationPreview(index);
    },
    onActivateNavigation: function (index) {
      state.navIndex = index;
      if (navigationItems[index] && navigationItems[index].kind === 'library') { startNavHold(index); }
      else { activateSearchNav(); }
    },
    onOpenResult: function (item) { openDetail(item); },
    onBack: function () {
      transitionToHome('preserve');
    },
    onBackdrop: scheduleSearchBackdrop,
    onFocus: function (focus) {
      var snapshot = searchView.snapshot();
      var item = focus && focus.zone === 'results' ? snapshot.results[focus.index] : null;
      scheduleTheme(item);
    },
    clearFocus: clearLogicalFocus,
    pointerSelectionActive: function () { return pointerSelectionActive; },
    prioritizePoster: prioritizePoster,
    mediaTitle: mediaTitle,
    mediaCardMeta: mediaCardMeta,
    mediaCardDetail: mediaCardDetail,
    cardMetrics: cardMetrics,
    measureLayout: measureSearchResults,
    renderedPosterSpecification: renderedPosterSpecification,
    posterLoader: posterLoader,
    resultOverscanRows: resultOverscanRows
  });

  function searchSnapshot() { return searchView.snapshot(); }
  function scheduleSearch() { searchView.schedule(); }
  function updateSearchFocus() { searchView.refreshFocus(); }
  function renderSearchResults() { searchView.refreshResults(); }

  function cancelSearchWork(keepImages) {
    searchView.cancel();
    if (!keepImages) { posterLoader.cancelScope('search'); }
  }

  function leaveSearch() {
    cancelSearchWork();
    searchView.close();
  }

  function revealHome(options) {
    var focus;
    var baseState;
    options = options || {};
    focus = options.focus || 'preserve';
    appView = 'home';
    state.navIndex = 0;
    renderNavigation();
    if (data.rows.length) { hideViewState(); }
    document.getElementById('search-view').className = 'search-view is-hidden';
    document.getElementById('library-view').className = 'library-view is-hidden';
    document.getElementById('watchlist-view').className = 'watchlist-view is-hidden';
    document.getElementById('detail-view').className = 'detail-view is-hidden';
    document.getElementById('app-settings-view').className = 'app-settings-view is-hidden';
    document.getElementById('content').style.display = 'block';
    if (data.rows.length) {
      if (homeDomDirty) {
        usePlexRows(data.rows, 0, { focus: focus, selectionKey: lastHomeSelectionKey });
      } else {
        baseState = focus === 'nav'
          ? { area: 'nav', navIndex: 0, rowIndex: 0, column: 0 }
          : (focus === 'first'
            ? { area: 'media', navIndex: 0, rowIndex: 0, column: 0 }
            : { area: 'media', navIndex: 0, rowIndex: state.rowIndex || 0, column: state.column || 0 });
        state = HomeState.restoreFocus(data.rows, baseState, focus === 'preserve' ? lastHomeSelectionKey : '');
        if (focus === 'first') { document.getElementById('content').scrollTop = 0; }
        updateFocus();
      }
    }
    homePoller.schedule();
    if (options.refresh !== false) { loadHomeRows(); }
  }

  function openSearch(keepNavigationFocus) {
    appView = 'search';
    backgroundAudio.stop();
    document.getElementById('content').style.display = 'none';
    document.getElementById('library-view').className = 'library-view is-hidden';
    document.getElementById('app-settings-view').className = 'app-settings-view is-hidden';
    document.getElementById('detail-view').className = 'detail-view is-hidden';
    renderNavigation();
    searchView.open(keepNavigationFocus, state.navIndex);
    if (keepNavigationFocus) { searchView.focusNavigation(state.navIndex); }
  }

  function activateSearchNav() {
    enterActiveNavigationView();
  }
  // Libraries, filters, recommendations, Watchlist, Playlists, and previews.
  function libraryViewKey() {
    return activeLibrary && activeLibrary.globalPlaylists ? 'playlists' : LibraryContainers.views()[libraryTabIndex];
  }

  function libraryCacheKey(library) {
    return String(library && (library.key || library.title) || '');
  }

  function touchLibraryDomCache(key) {
    var index = libraryDomCacheOrder.indexOf(key);
    var evicted;
    if (index !== -1) { libraryDomCacheOrder.splice(index, 1); }
    libraryDomCacheOrder.push(key);
    while (libraryDomCacheOrder.length > 5) {
      evicted = libraryDomCacheOrder.shift();
      if (libraryViewCache[evicted]) { libraryViewCache[evicted].dom = null; }
    }
  }

  function prefetchedLibraryState(library, rows) {
    return {
      tabIndex: 0,
      zone: 'tabs',
      controlIndex: 0,
      actionIndex: 0,
      sort: 'titleSort',
      sortDirection: 'asc',
      watchedFilter: 'all',
      filters: {},
      continueAvailable: null,
      scrollTop: 0,
      grid: {
        mode: 'recommended',
        usesGridScroll: false,
        items: [],
        recommendations: rows || [],
        totalSize: 0,
        focus: { zone: 'grid', index: 0, recommendationRow: 0 }
      },
      usesGridScroll: false,
      dom: null
    };
  }

  function prefetchLibraryPosterPreviews(rows) {
    var metrics = cardMetrics();
    var preview = ProgressiveImages.previewSize(metrics.width, metrics.imageHeight, 96);
    var sources = [];
    (rows || []).forEach(function (row) {
      (row && row.items || []).forEach(function (item) {
        if (item && item.image && sources.indexOf(item.image) === -1 && sources.length < 30) {
          sources.push(item.image);
        }
      });
    });
    sources.forEach(function (source) {
      posterLoader.load(new root.Image(), {
        source: source,
        previewWidth: preview.width,
        previewHeight: preview.height,
        width: preview.width,
        height: preview.height,
        priority: 3,
        scope: 'library-prefetch'
      });
    });
  }

  function prefetchLibraryBackdropPreview(rows) {
    var item = rows && rows[0] && rows[0].items && rows[0].items[0];
    var source = item && artworkUrl(item);
    if (!source) { return; }
    posterLoader.load(new root.Image(), {
      source: source,
      previewWidth: 320,
      previewHeight: 180,
      width: 320,
      height: 180,
      priority: 3,
      scope: 'library-prefetch'
    });
  }

  function runAdjacentLibraryPrefetch() {
    var library;
    var key;
    var saved;
    libraryPrefetchTimer = null;
    if (libraryPrefetchActive || !libraryPrefetchQueue.length) { return; }
    if ((libraryLifecycle && libraryLifecycle.snapshot().loading) ||
        (homeRefreshCoordinator && homeRefreshCoordinator.isLoading())) {
      scheduleAdjacentLibraryPrefetch();
      return;
    }
    library = libraryPrefetchQueue.shift();
    key = libraryCacheKey(library);
    if (!key || libraryViewCache[key] || (activeLibrary && libraryCacheKey(activeLibrary) === key)) {
      scheduleAdjacentLibraryPrefetch();
      return;
    }
    libraryPrefetchActive = true;
    PlexClient.loadLibraryRecommendations(config, library, function (error, rows) {
      libraryPrefetchActive = false;
      if (!error && !libraryViewCache[key] && (!activeLibrary || libraryCacheKey(activeLibrary) !== key)) {
        saved = prefetchedLibraryState(library, rows);
        if (libraryGridView && libraryGridView.buildDetachedRecommendations) {
          saved.dom = libraryGridView.buildDetachedRecommendations(rows, 30);
        }
        libraryViewCache[key] = saved;
        if (saved.dom) { touchLibraryDomCache(key); }
        if (!saved.dom) { prefetchLibraryPosterPreviews(rows); }
        prefetchLibraryBackdropPreview(rows);
      }
      scheduleAdjacentLibraryPrefetch();
    });
  }

  function scheduleAdjacentLibraryPrefetch() {
    var candidates = [];
    var distance;
    var indexes;
    var item;
    var key;
    var schedule;
    if (libraryPrefetchAnchor !== state.navIndex) {
      libraryPrefetchAnchor = state.navIndex;
      libraryPrefetchQueue = [];
    }
    if (libraryPrefetchTimer || libraryPrefetchActive) { return; }
    if (!libraryPrefetchQueue.length) {
      for (distance = 1; distance < navigationItems.length && candidates.length < 2; distance += 1) {
        indexes = [state.navIndex - distance, state.navIndex + distance];
        indexes.forEach(function (index) {
          item = navigationItems[index];
          key = libraryCacheKey(item);
          if (candidates.length < 2 && item && item.kind === 'library' && key && !libraryViewCache[key] && candidates.indexOf(item) === -1) {
            candidates.push(item);
          }
        });
      }
      libraryPrefetchQueue = candidates;
    }
    if (!libraryPrefetchQueue.length) { return; }
    schedule = function () {
      libraryPrefetchTimer = null;
      runAdjacentLibraryPrefetch();
    };
    if (root.requestIdleCallback) {
      libraryPrefetchTimer = root.requestIdleCallback(schedule, { timeout: 400 });
    } else {
      libraryPrefetchTimer = root.setTimeout(schedule, 100);
    }
  }

  function detachLibraryDom() {
    var grid = document.createDocumentFragment();
    var recommendations = document.createDocumentFragment();
    var gridContent = document.getElementById('library-grid-content');
    var recommendationContent = document.getElementById('library-recommended');
    while (gridContent.firstChild) { grid.appendChild(gridContent.firstChild); }
    while (recommendationContent.firstChild) { recommendations.appendChild(recommendationContent.firstChild); }
    return { grid: grid, recommendations: recommendations };
  }

  function attachLibraryDom(saved) {
    var gridContent = document.getElementById('library-grid-content');
    var recommendationContent = document.getElementById('library-recommended');
    while (gridContent.firstChild) { gridContent.removeChild(gridContent.firstChild); }
    while (recommendationContent.firstChild) { recommendationContent.removeChild(recommendationContent.firstChild); }
    if (saved.dom) {
      gridContent.appendChild(saved.dom.grid);
      recommendationContent.appendChild(saved.dom.recommendations);
    }
  }

  function cacheActiveLibraryView() {
    var key;
    if (!activeLibrary) { return; }
    key = libraryCacheKey(activeLibrary);
    if (!key) { return; }
    libraryViewCache[key] = {
      tabIndex: libraryTabIndex,
      zone: libraryZone,
      controlIndex: libraryControlIndex,
      actionIndex: libraryActionIndex,
      sort: librarySort,
      sortDirection: librarySortDirection,
      watchedFilter: libraryWatchedFilter,
      filters: libraryFilterView.filters(),
      continueAvailable: libraryLifecycle.snapshot().continueAvailable,
      scrollTop: document.getElementById('library-grid').scrollTop,
      grid: libraryGridView.snapshot(),
      usesGridScroll: libraryUsesGridScroll(),
      dom: detachLibraryDom()
    };
    touchLibraryDomCache(key);
  }

  function restoreCachedLibraryState(saved, keepNavigationFocus) {
    libraryTabIndex = saved.tabIndex;
    libraryZone = keepNavigationFocus ? 'nav' : saved.zone;
    libraryControlIndex = saved.controlIndex;
    libraryActionIndex = saved.actionIndex;
    librarySort = saved.sort;
    librarySortDirection = saved.sortDirection;
    libraryWatchedFilter = saved.watchedFilter;
    libraryFilterView.setActiveFilters(saved.filters || {});
    libraryLifecycle.setContinueAvailable(saved.continueAvailable);
  }

  function restoreCachedLibraryGrid(saved, resetFocus) {
    var focus = resetFocus ? { zone: 'grid', index: 0, recommendationRow: 0 } : saved.grid.focus;
    attachLibraryDom(saved);
    libraryGridView.restore({
      mode: saved.grid.mode,
      usesGridScroll: saved.usesGridScroll,
      items: saved.grid.items,
      recommendations: saved.grid.recommendations,
      totalSize: saved.grid.totalSize,
      focus: focus
    });
    document.getElementById('library-grid').scrollTop = resetFocus ? 0 : Number(saved.scrollTop || 0);
    if (resetFocus) { document.getElementById('library-recommended').scrollTop = 0; }
    if (saved.dom) { touchLibraryDomCache(libraryCacheKey(activeLibrary)); }
  }

  function renderLibrarySubnav() {
    var container = document.getElementById('library-tabs');
    var labels = [t('library.recommended'), t('library.continue'), t('library.recent'), t('library.catalog'), t('library.collections')];
    var index;
    var button;
    container.innerHTML = '';
    for (index = 0; index < labels.length; index += 1) {
      button = element('button', 'library-tab' + (index === libraryTabIndex ? ' is-active' : '') + (index === 1 && libraryLifecycle.snapshot().continueAvailable === false ? ' is-disabled' : ''), labels[index]);
      button.type = 'button';
      button.setAttribute('data-library-tab', index);
      if (index === 1 && libraryLifecycle.snapshot().continueAvailable === false) { button.disabled = true; }
      container.appendChild(button);
    }
  }

  function nextLibraryTab(direction) {
    var next = libraryTabIndex + direction;
    var count = LibraryContainers.views().length;
    while (next >= 0 && next < count && next === 1 && libraryLifecycle.snapshot().continueAvailable === false) { next += direction; }
    return next < 0 || next >= count ? libraryTabIndex : next;
  }

  function selectLibraryTab(index) {
    libraryLifecycle.clearContainer();
    libraryTabIndex = Math.max(0, Math.min(LibraryContainers.views().length - 1, Number(index) || 0));
    libraryZone = 'tabs'; libraryControlIndex = 0;
    renderLibrarySubnav(); renderLibraryControls(); loadLibraryContent(true); updateLibraryFocus();
  }

  function focusLibraryTabContent() {
    var firstRecommendation;
    if (libraryViewKey() === 'catalog') {
      libraryZone = 'sort';
      libraryControlIndex = 0;
    } else if (libraryViewKey() === 'recommended') {
      firstRecommendation = libraryGridView.snapshot().recommendations[0];
      if (!firstRecommendation || !firstRecommendation.items.length) { return false; }
      libraryZone = 'grid';
      libraryGridView.focusRecommendations(0, 0);
    } else {
      if (!libraryGridView.snapshot().items.length) { return false; }
      libraryZone = 'grid';
      libraryGridView.focusCatalog(libraryGridView.snapshot().focus.index);
    }
    updateLibraryFocus();
    return true;
  }

  function libraryUsesGridScroll() {
    return libraryViewKey() === 'catalog' || libraryViewKey() === 'collections' || libraryViewKey() === 'playlists' || libraryLifecycle.snapshot().hasContainer;
  }

  function sortLabel(key) {
    var active = librarySort === key;
    var label = key === 'titleSort' ? 'A-Z' : (key === 'year' ? t('library.year') : t('library.rating'));
    if (active) { label += librarySortDirection === 'asc' ? ' \u2193' : ' \u2191'; }
    return label;
  }

  function libraryCardMeta(item) {
    return mediaCardMeta(item);
  }

  function renderLibraryControls() {
    var controls = document.getElementById('library-controls');
    var sort = document.getElementById('library-sort');
    var filter = document.getElementById('library-filter');
    var sortKeys = ['titleSort', 'audienceRating', 'year'];
    var filterKeys = ['all', 'unwatched', 'watched'];
    var index;
    var button;
    controls.className = libraryViewKey() === 'catalog' ? 'library-controls' : 'library-controls is-hidden';
    sort.innerHTML = '';
    filter.innerHTML = '';
    for (index = 0; index < sortKeys.length; index += 1) {
      button = element('button', 'library-control' + (librarySort === sortKeys[index] ? ' is-active' : ''), sortLabel(sortKeys[index]));
      button.type = 'button'; button.setAttribute('data-library-sort', sortKeys[index]); sort.appendChild(button);
    }
    for (index = 0; index < filterKeys.length; index += 1) {
      button = element('button', 'library-control' + (libraryWatchedFilter === filterKeys[index] ? ' is-active' : ''), t('library.' + filterKeys[index]));
      button.type = 'button'; button.setAttribute('data-library-filter', filterKeys[index]); filter.appendChild(button);
    }
    button = element('button', 'library-control' + (libraryFilterView.activeFilterCount() ? ' is-active' : ''), t('library.filters'));
    button.type = 'button';
    button.setAttribute('data-library-filter-open', '1');
    if (libraryFilterView.activeFilterCount()) { button.appendChild(element('span', 'library-control-badge', String(libraryFilterView.activeFilterCount()))); }
    filter.appendChild(button);
  }

  function openLibraryFilterDrawer() {
    libraryFilterView.open(activeLibrary);
  }

  function libraryRecommendationTitle(row) {
    var identifier = String(row && row.identifier || '').toLowerCase();
    if (identifier.indexOf('startwatching') !== -1) { return t('recommendation.startWatching'); }
    if (identifier.indexOf('.genre.') !== -1 || identifier.indexOf('moreingenre') !== -1) { return t('recommendation.byGenre'); }
    if (identifier.indexOf('by.actor.or.director') !== -1) { return t('recommendation.byPeople'); }
    if (identifier.indexOf('topunwatched') !== -1) { return t('recommendation.topUnwatched'); }
    if (identifier.indexOf('toprated') !== -1) { return t('recommendation.topRated'); }
    return row && row.title || t('library.recommended');
  }

  function createLibraryGridView() {
    libraryGridView = PloffLibraryGridView.create({
      root: root, document: document, SearchModel: SearchModel, element: element,
      moveGridDown: LibraryContainers.moveGridDown,
      cardMetrics: cardMetrics, mediaTitle: mediaTitle, mediaCardMeta: libraryCardMeta,
      mediaCardDetail: mediaCardDetail, mediaKey: searchMediaKey,
      recommendationTitle: libraryRecommendationTitle, renderedPosterSpecification: renderedPosterSpecification,
      posterLoader: posterLoader, overscanRows: resultOverscanRows, clearFocus: clearLogicalFocus,
      pointerSelectionActive: function () { return pointerSelectionActive || wheelNavigationActive; },
      onNearEnd: function () { loadLibraryContent(false); },
      onFocus: function (focus, item) {
        if (libraryZone !== 'grid' || !item) { return; }
        scheduleViewBackdrop(item, 'library', 250); scheduleTheme(item);
      }
    });
  }

  function renderLibraryGrid() {
    libraryGridView.setMode(libraryViewKey(), libraryUsesGridScroll());
    libraryGridView.setContentActive(libraryZone === 'grid');
    libraryGridView.render();
  }

  function onLibraryGridScroll() {
    if (appView === 'library' && libraryUsesGridScroll()) { libraryGridView.onScroll(); }
  }

  function updateLibraryFocus() {
    var target;
    clearLogicalFocus();
    if (libraryZone === 'grid') {
      libraryGridView.setMode(libraryViewKey(), libraryUsesGridScroll());
      libraryGridView.setContentActive(true);
      libraryGridView.refreshFocus();
      prioritizePoster(libraryViewKey() === 'recommended'
        ? document.querySelector('[data-library-recommendation-row="' + libraryGridView.snapshot().focus.recommendationRow + '"][data-library-recommendation-column="' + libraryGridView.snapshot().focus.index + '"]')
        : document.querySelector('[data-library-index="' + libraryGridView.snapshot().focus.index + '"]'));
      return;
    }
    libraryGridView.setContentActive(false);
    if (libraryZone === 'nav') { target = document.querySelector(selectorForNavIndex(state.navIndex)); }
    else if (libraryZone === 'tabs') { target = document.querySelector('[data-library-tab="' + libraryTabIndex + '"]'); }
    else if (libraryZone === 'actions') { target = document.getElementById(libraryActionIndex === 0 ? 'library-refresh' : 'library-refresh-metadata'); }
    else if (libraryZone === 'sort') { target = document.querySelectorAll('[data-library-sort]')[libraryControlIndex]; }
    else if (libraryZone === 'filter') { target = document.querySelectorAll('[data-library-filter], [data-library-filter-open]')[libraryControlIndex]; }
    if (target) {
      if (target.className.indexOf('is-focused') === -1) { target.className += ' is-focused'; }
      if (!pointerSelectionActive && !wheelNavigationActive) { target.focus(); }
    }
    backgroundAudio.stop();
  }

  createLibraryGridView();

  function libraryLoadContext() {
    return {
      library: activeLibrary,
      viewKey: libraryViewKey(),
      container: libraryLifecycle.snapshot().container,
      usesGridScroll: libraryUsesGridScroll(),
      query: {
        sort: librarySort,
        direction: librarySortDirection,
        watched: libraryWatchedFilter,
        filters: libraryFilterView.filters()
      }
    };
  }

  function createLibraryLifecycle() {
    libraryLifecycle = LibraryLifecycle.create({
      grid: libraryGridView,
      scrollTop: function () { return document.getElementById('library-grid').scrollTop; },
      setScrollTop: function (value) { document.getElementById('library-grid').scrollTop = value; },
      isActive: function (context) {
        return appView === 'library' && !!activeLibrary && !!context && !!context.library &&
          String(activeLibrary.key) === String(context.library.key);
      },
      loadRecommendations: function (library, callback) {
        return PlexClient.loadLibraryRecommendations(config, library, callback);
      },
      loadContainerPage: function (container, start, limit, callback) {
        return PlexClient.loadLibraryContainerPage(config, container, start, limit, callback);
      },
      loadLibraryPage: function (library, viewKey, query, start, limit, callback) {
        return PlexClient.loadLibraryPage(config, library, viewKey, query, start, limit, callback);
      },
      onReset: function () {
        renderLibraryGrid();
        hideViewState();
      },
      onStatus: function () { updateLibraryStatus(); },
      onEmpty: function (result) {
        if (libraryZone !== 'grid') { return; }
        libraryZone = activeLibrary && activeLibrary.globalPlaylists ? 'nav' : 'tabs';
        if (result.kind === 'recommendations') { libraryZone = 'tabs'; }
      },
      onRender: function () {
        hideViewState();
        renderLibraryGrid();
        updateLibraryFocus();
        scheduleAdjacentLibraryPrefetch();
      },
      onContinueAvailable: function () {
        renderLibrarySubnav();
        updateLibraryFocus();
      },
      onRestoreContainer: function () {
        libraryZone = 'grid';
        renderLibraryGrid();
        updateLibraryFocus();
      }
    });
  }

  createLibraryLifecycle();

  function loadLibraryContent(reset) {
    if (!activeLibrary) { return; }
    libraryLifecycle.load(libraryLoadContext(), !!reset);
  }

  function updateLibraryStatus() {
    var snapshot = libraryGridView.snapshot();
    var itemCount = libraryViewKey() === 'recommended' ? snapshot.recommendations.reduce(function (count, row) { return count + row.items.length; }, 0) : snapshot.items.length;
    var lifecycle = libraryLifecycle.snapshot();
    var key = LibraryContainers.statusKey(libraryViewKey(), lifecycle.loading, lifecycle.error, itemCount, lifecycle.hasContainer);
    document.getElementById('library-status').className = 'library-status' + (key && !snapshot.items.length ? ' is-prominent' : '');
    setText('library-status', key ? t(key) : '');
  }

  function probeLibraryContinue() {
    if (activeLibrary) { libraryLifecycle.probeContinue(activeLibrary); }
  }

  function openLibrary(library, navIndex, keepNavigationFocus) {
    var saved = libraryViewCache[libraryCacheKey(library)];
    activeLibrary = library; state.navIndex = navIndex; appView = 'library';
    libraryLifecycle.prepareLibrary();
    if (saved) {
      restoreCachedLibraryState(saved, keepNavigationFocus);
    } else {
      libraryWatchedFilter = 'all';
      libraryFilterView.setActiveFilters({});
      libraryTabIndex = 0; libraryZone = keepNavigationFocus ? 'nav' : (library.globalPlaylists ? 'grid' : 'tabs'); libraryControlIndex = 0; libraryActionIndex = 0;
    }
    document.getElementById('content').style.display = 'none';
    document.getElementById('search-view').className = 'search-view is-hidden';
    document.getElementById('app-settings-view').className = 'app-settings-view is-hidden';
    document.getElementById('detail-view').className = 'detail-view is-hidden';
    document.getElementById('library-view').className = 'library-view' + (library.globalPlaylists ? ' is-global-playlists' : '');
    setText('library-global-title', library.globalPlaylists ? t('nav.playlists') : '');
    renderNavigation(); renderLibrarySubnav(); renderLibraryControls();
    if (saved) {
      restoreCachedLibraryGrid(saved, true);
      updateLibraryStatus();
    }
    if (!saved) {
      loadLibraryContent(true);
      if (!library.globalPlaylists) { probeLibraryContinue(); }
    } else {
      if (!library.globalPlaylists && saved.continueAvailable === null) { probeLibraryContinue(); }
      scheduleAdjacentLibraryPrefetch();
    }
    updateLibraryFocus();
  }

  function leaveLibrary() {
    hideViewState();
    cacheActiveLibraryView();
    libraryLifecycle.leave();
    libraryFilterView.dismiss();
    document.getElementById('library-view').className = 'library-view is-hidden';
  }

  function closeLibrary() {
    transitionToHome('preserve');
  }

  function openLibraryContainer(item) {
    if (!libraryLifecycle.openContainer(item)) { return; }
    libraryZone = 'grid';
    loadLibraryContent(true);
  }

  function closeLibraryContainer() {
    return libraryLifecycle.closeContainer();
  }

  function createWatchlistView() {
    watchlistView = WatchlistView.create({
      root: root, document: document, WatchlistState: WatchlistState, element: element,
      available: watchlistAvailable, identity: watchlistIdentity, accountToken: watchlistAccountToken,
      timeout: function () { return Math.min(8000, Number(config.requestTimeout || 6000)); },
      discover: function (options, callback) { return WatchlistClient.discover(root, options, callback); },
      load: function (options, callback) { return WatchlistClient.load(root, options, 0, 200, callback); },
      set: function (options, key, enabled, callback) { return WatchlistClient.set(root, options, key, enabled, callback); },
      findByGuid: function (guid, callback) { return PlexClient.findByGuid(config, guid, callback); },
      cardMetrics: cardMetrics, mediaTitle: mediaTitle, mediaCardMeta: libraryCardMeta, mediaCardDetail: mediaCardDetail,
      renderedPosterSpecification: renderedPosterSpecification, posterLoader: posterLoader, scope: 'watchlist',
      clearFocus: clearLogicalFocus, navTarget: function () { return document.querySelector(selectorForNavIndex(state.navIndex)); },
      pointerSelectionActive: function () { return pointerSelectionActive || wheelNavigationActive; },
      prioritizePoster: prioritizePoster,
      columns: function () { return CardLayout.columns(document.getElementById('watchlist-grid').clientWidth || 1600, appSettings.cardScale); },
      onFocus: function (item) { scheduleViewBackdrop(item, 'watchlist', 250); scheduleTheme(item); },
      onNavigationFocus: function () { backgroundAudio.stop(); },
      onItemsChanged: function () { if (appView === 'detail') { syncCurrentDetailWatchlist(); renderDetailWatchlist(); } },
      onNavigate: function (direction) {
        state.navIndex = Math.max(0, Math.min(navigationFocusCount() - 1, state.navIndex + (direction === 'left' ? -1 : 1)));
        renderNavigation(); scheduleNavigationPreview(state.navIndex);
      },
      onEnterNavigation: enterActiveNavigationView, onBack: closeWatchlist, onPlay: playHomeItem, onOpenDetail: openDetail
    });
  }

  createWatchlistView();

  function watchlistSnapshot() { return watchlistView.snapshot(); }
  function renderWatchlistGrid() { watchlistView.render(); }
  function updateWatchlistFocus() { watchlistView.refreshFocus(); }
  function loadWatchlistData(force, callback) { watchlistView.load(force, callback); }

  function openWatchlist(keepNavigationFocus) {
    if (!watchlistAvailable()) { showMessage(t('watchlist.unavailable')); renderNavigation(); return; }
    appView = 'watchlist';
    hideViewState();
    document.getElementById('content').style.display = 'none';
    document.getElementById('library-view').className = 'library-view is-hidden';
    document.getElementById('search-view').className = 'search-view is-hidden';
    document.getElementById('app-settings-view').className = 'app-settings-view is-hidden';
    document.getElementById('detail-view').className = 'detail-view is-hidden';
    document.getElementById('watchlist-view').className = 'watchlist-view';
    setText('watchlist-title', t('nav.watchlist'));
    renderNavigation(); watchlistView.open(keepNavigationFocus); loadWatchlistData(false);
  }

  function leaveWatchlist() {
    hideViewState();
    watchlistView.leave();
    document.getElementById('watchlist-view').className = 'watchlist-view is-hidden';
  }

  function closeWatchlist() {
    transitionToHome('preserve');
  }

  function activateLibrarySort(key) {
    if (librarySort === key) { librarySortDirection = librarySortDirection === 'asc' ? 'desc' : 'asc'; }
    else { librarySort = key; librarySortDirection = key === 'titleSort' ? 'asc' : 'desc'; }
    renderLibraryControls(); loadLibraryContent(true); updateLibraryFocus();
  }

  function handleLibraryFilterKeyDown(event, direction) {
    libraryFilterView.handleKeyDown(event, direction);
  }

  function activateLibraryFilter(key) {
    var filters;
    if (libraryWatchedFilter === key) { return; }
    libraryWatchedFilter = key;
    filters = libraryFilterView.filters();
    filters.watched = key === 'all' ? '' : key;
    libraryFilterView.setActiveFilters(filters);
    renderLibraryControls(); loadLibraryContent(true); updateLibraryFocus();
  }

  function setLibraryRefreshPending(pending) {
    libraryRefreshPending = pending;
    document.getElementById('library-refresh').disabled = pending;
    document.getElementById('library-refresh-metadata').disabled = pending;
  }

  function finishLibraryRefresh(error) {
    setLibraryRefreshPending(false);
    if (error) { showMessage(t('status.updateError')); return; }
    showMessage(t('status.refreshComplete'));
    probeLibraryContinue();
    libraryLifecycle.load(libraryLoadContext(), false, true);
    homeRefreshCoordinator.refresh();
    updateLibraryFocus();
  }

  function waitForLibraryRefresh(error, activityId) {
    if (error) { finishLibraryRefresh(error); return; }
    waitForServerActivity(activityId, function () { finishLibraryRefresh(null); });
  }

  function refreshActiveLibrary() {
    if (!activeLibrary || libraryRefreshPending) { return; }
    setLibraryRefreshPending(true); showMessage(t('status.refreshing'));
    PlexClient.refreshLibrary(config, activeLibrary.key, waitForLibraryRefresh);
  }

  function refreshActiveLibraryMetadata() {
    if (!activeLibrary || libraryRefreshPending) { return; }
    setLibraryRefreshPending(true); showMessage(t('status.refreshing'));
    PlexClient.refreshLibraryMetadata(config, activeLibrary.key, waitForLibraryRefresh);
  }

  function activate() {
    var item;
    if (state.area === 'nav') {
      enterActiveNavigationView();
      return;
    }
    item = data.rows[state.rowIndex].items[state.column];
    if (item.ratingKey) {
      openDetail(item);
    } else {
      showMessage(t('status.opening', { title: mediaTitle(item) }));
    }
  }

  function activateNavigationSelection() {
    if (isProfileNavIndex(state.navIndex)) { openProfileManager(); return; }
    if (isActivityNavIndex(state.navIndex)) { focusCurrentNavigation(); return; }
    enterActiveNavigationView();
  }

  function navigationHasFocus() {
    if (appView === 'home') { return state.area === 'nav'; }
    if (appView === 'library') { return libraryZone === 'nav'; }
    if (appView === 'watchlist') { return watchlistSnapshot().zone === 'nav'; }
    if (appView === 'search') { return searchSnapshot().focus.zone === 'nav'; }
    if (appView === 'settings') { return settingsView.snapshot().zone === 'nav'; }
    if (appView === 'detail') { return detailZone === 'nav'; }
    return false;
  }

  function navigationViewMatches(item) {
    if (!item) { return false; }
    if (item.kind === 'home') { return appView === 'home'; }
    if (item.kind === 'library') { return appView === 'library' && activeLibrary && String(activeLibrary.key) === String(item.key); }
    if (item.kind === 'watchlist') { return appView === 'watchlist'; }
    if (item.kind === 'playlists') { return appView === 'library' && activeLibrary && activeLibrary.globalPlaylists; }
    if (item.kind === 'search') { return appView === 'search'; }
    if (item.kind === 'settings') { return appView === 'settings'; }
    return false;
  }

  function focusCurrentNavigation() {
    state.area = 'nav';
    if (appView === 'home') { updateFocus(); }
    else if (appView === 'library') { libraryZone = 'nav'; updateLibraryFocus(); }
    else if (appView === 'watchlist') { watchlistView.focusNavigation(); }
    else if (appView === 'search') { searchView.focusNavigation(state.navIndex); }
    else if (appView === 'settings') { settingsView.focusNavigation(); updateSettingsFocus(); }
    else if (appView === 'detail') { detailZone = 'nav'; updateDetailFocus(); }
  }

  function transitionToHome(focus) {
    if (appView === 'search') { leaveSearch(); }
    else if (appView === 'library') { leaveLibrary(); }
    else if (appView === 'watchlist') { leaveWatchlist(); }
    else if (appView === 'settings') { leaveAppSettings(); }
    revealHome({ focus: focus || 'preserve' });
  }

  function commitNavigationView(item, targetIndex, keepNavigationFocus) {
    if (appView === 'search') { leaveSearch(); }
    else if (appView === 'library') { leaveLibrary(); }
    else if (appView === 'watchlist') { leaveWatchlist(); }
    else if (appView === 'detail') { leaveDetail(); }
    else if (appView === 'settings') { leaveAppSettings(); }
    state.navIndex = targetIndex;
    state.area = 'nav';
    if (item.kind === 'home') { revealHome({ focus: keepNavigationFocus ? 'nav' : 'first' }); }
    else if (item.kind === 'library') { openLibrary(item, targetIndex, keepNavigationFocus); }
    else if (item.kind === 'watchlist') { openWatchlist(keepNavigationFocus); }
    else if (item.kind === 'playlists') { openLibrary({ key: 'playlists', title: t('nav.playlists'), globalPlaylists: true }, targetIndex, keepNavigationFocus); }
    else if (item.kind === 'search') { openSearch(keepNavigationFocus); }
    else if (item.kind === 'settings') { openAppSettings(keepNavigationFocus); }
    scheduleAdjacentLibraryPrefetch();
  }

  function showNavigationView(index, keepNavigationFocus) {
    var targetIndex = Number(index);
    var item = navigationItems[targetIndex];
    navigationPreviewScheduler.cancel();
    if (!item) { return; }
    if (item.kind === 'watchlist' && !watchlistAvailable()) { showMessage(t('watchlist.unavailable')); renderNavigation(); return; }
    state.navIndex = targetIndex;
    if (navigationViewMatches(item)) {
      renderNavigation();
      if (keepNavigationFocus) { focusCurrentNavigation(); }
      else { enterActiveNavigationView(); }
      return;
    }
    commitNavigationView(item, targetIndex, keepNavigationFocus);
  }

  function showNavigationPreview(index) {
    if (Number(index) !== state.navIndex || !navigationHasFocus() || Number(index) >= navigationItems.length) { return; }
    showNavigationView(index, true);
  }

  function scheduleNavigationPreview(index) {
    if (navReorderMode || Number(index) >= navigationItems.length) { navigationPreviewScheduler.cancel(); return; }
    navigationPreviewScheduler.schedule(Number(index));
  }

  function enterActiveNavigationView() {
    var item;
    navigationPreviewScheduler.cancel();
    if (isProfileNavIndex(state.navIndex)) { openProfileManager(); return; }
    if (isActivityNavIndex(state.navIndex)) { focusCurrentNavigation(); return; }
    item = navigationItems[state.navIndex];
    if (!navigationViewMatches(item)) { showNavigationView(state.navIndex, false); return; }
    if (item.kind === 'home') {
      focusHomeStart();
    } else if (item.kind === 'library') {
      libraryZone = 'tabs';
      updateLibraryFocus();
    } else if (item.kind === 'watchlist') {
      watchlistView.focusContent();
    } else if (item.kind === 'playlists') {
      libraryZone = libraryGridView.snapshot().items.length ? 'grid' : 'nav';
      updateLibraryFocus();
    } else if (item.kind === 'search') {
      searchView.focusKeyboard(0, 0);
    } else if (item.kind === 'settings') {
      settingsView.focusList(0, settingsRows());
      renderAppSettings();
    }
  }

  function activateNavigationIndex(index) {
    var targetIndex = Number(index);
    navigationPreviewScheduler.cancel();
    if (!isFinite(targetIndex) || targetIndex < 0 || targetIndex >= navigationFocusCount()) { return; }
    state.navIndex = targetIndex;
    state.area = 'nav';
    if (isProfileNavIndex(targetIndex)) { openProfileManager(); return; }
    if (isActivityNavIndex(targetIndex)) { focusCurrentNavigation(); return; }
    showNavigationView(targetIndex, false);
  }
  // Application settings, server state, profiles, and Plex activities.
  function setText(id, value) {
    var node = document.getElementById(id);
    node.innerHTML = '';
    node.appendChild(document.createTextNode(value || ''));
  }

  function cycleValue(values, current, direction) {
    var index = values.indexOf(current);
    index = index < 0 ? 0 : index;
    index = (index + direction + values.length) % values.length;
    return values[index];
  }

  function videoQualityLabel(value) {
    return value === 'original' ? t('settings.original') : (Number(value) / 1000) + ' Mbps';
  }

  function activeConnectionRoute() {
    var uri = ServerStore.normalizeUri(config.apiBaseUrl);
    var routes = activeServer && activeServer.connectionRoutes || [];
    var index;
    for (index = 0; index < routes.length; index += 1) {
      if (ServerStore.normalizeUri(routes[index].uri) !== uri) { continue; }
      if (routes[index].relay === true) { return 'relay'; }
      if (routes[index].local === true) { return 'lan'; }
      return 'remote';
    }
    if (/^https:\/\/[^/]+\.plex\.direct(?::443)?$/i.test(uri) && (!String(uri).match(/:\d+$/) || /:443$/i.test(uri))) {
      return 'relay';
    }
    return ServerDiscovery.isLocalCandidate(uri) ? 'lan' : 'remote';
  }

  function connectionRouteLabel(route) {
    return t('connection.' + (route || activeConnectionRoute()));
  }

  function activeVideoQuality() {
    return activeConnectionRoute() === 'lan' ? appSettings.lanVideoQuality : appSettings.remoteVideoQuality;
  }

  function activeServerSettingsLabel() {
    var label = activeServer ? activeServer.name : (config.serverName || config.apiBaseUrl || t('settings.notConfigured'));
    return config.apiBaseUrl ? label + ' \u00b7 ' + connectionRouteLabel() : label;
  }

  function networkStatusLabel(snapshot) {
    var status = String((snapshot || networkSnapshot || {}).status || 'unknown');
    return t('network.' + (/^(online|local-only|offline|unknown)$/.test(status) ? status : 'unknown'));
  }

  function networkStatusClass(snapshot) {
    var status = String((snapshot || networkSnapshot || {}).status || 'unknown');
    return 'is-network-' + (/^(online|local-only|offline|unknown)$/.test(status) ? status : 'unknown');
  }

  function playbackPreferenceLabel(value) {
    if (value === 'transcode') { return t('settings.forceTranscode'); }
    if (value === 'direct') { return t('settings.directOnly'); }
    return t('settings.auto');
  }

  function accentColorLabel(value) {
    var normalized = String(value || 'cyan');
    return t('settings.color' + normalized.charAt(0).toUpperCase() + normalized.slice(1));
  }

  function applyAccentColor() {
    var value = accentColorValues[appSettings.accentColor] || accentColorValues.cyan;
    document.documentElement.style.setProperty('--accent', value);
  }

  function applyAnimationPreference() {
    var className = document.body.className.replace(/\s*animations-disabled/g, '');
    document.body.className = className + (appSettings.interfaceAnimations ? '' : ' animations-disabled');
  }

  function interfaceAnimationDuration(milliseconds) {
    return appSettings.interfaceAnimations ? milliseconds : 0;
  }

  var settingsCatalog = SettingsCatalog.create({
    t: t,
    languageName: function (language, code) { return I18n.languageName(language, code); },
    nativeLanguageName: I18n.nativeLanguageName,
    activeServerLabel: activeServerSettingsLabel,
    activeProfileTitle: activeProfileTitle,
    networkStatusLabel: networkStatusLabel,
    plexConnected: function () { return !!authState.ownerToken; },
    videoQualityLabel: videoQualityLabel,
    playbackPreferenceLabel: playbackPreferenceLabel,
    accentColorLabel: accentColorLabel,
    supportedUiLanguages: Settings.supportedUiLanguages,
    cardScales: CardLayout.SCALES,
    accentColors: Settings.ACCENT_COLORS,
    accentValues: accentColorValues
  });

  var settingsView = SettingsView.create({
    document: document,
    element: element,
    setText: setText,
    t: t,
    accentColors: Settings.ACCENT_COLORS,
    accentValues: accentColorValues,
    renderServerEditor: renderServerEditor,
    clearFocus: clearLogicalFocus,
    navTarget: function (navIndex) { return document.querySelector(selectorForNavIndex(navIndex)); },
    keepFocusVisible: keepPanelFocusVisible,
    isPointerSelectionActive: function () { return pointerSelectionActive; }
  });

  function settingsRows() { return settingsCatalog.rows(appSettings); }

  function settingsSectionLabel(section) { return settingsCatalog.sectionLabel(section); }

  function saveAppSettings() {
    appSettings = Settings.save(root.localStorage, appSettings);
    document.documentElement.lang = appSettings.uiLanguage;
    applyCardScale();
    applyAccentColor();
    applyAnimationPreference();
    translateStaticUi();
  }

  function keepPanelFocusVisible(container, target) {
    var top;
    var bottom;
    if (!container || !target) { return; }
    top = target.offsetTop;
    bottom = top + target.offsetHeight;
    if (top < container.scrollTop) { container.scrollTop = top; }
    else if (bottom > container.scrollTop + container.clientHeight) { container.scrollTop = bottom - container.clientHeight; }
  }

  function renderAppSettings() {
    var viewState = settingsView.snapshot();
    var serverViewState = serverEditorView.snapshot();
    if (viewState.zone === 'list') {
      settingsView.focusList(viewState.index, settingsRows());
      viewState = settingsView.snapshot();
    }
    settingsView.render({
      title: t('settings.title'), notice: t('settings.globalNotice'), rows: settingsRows(),
      sectionLabel: settingsSectionLabel, zone: viewState.zone, index: viewState.index,
      navIndex: state.navIndex, serverEditorOpen: serverViewState.open,
      serverDiscoveryActive: serverDiscoveryActive, accentColor: appSettings.accentColor,
      credit: t('settings.createdBy', { name: 'Rhapsodos93' })
    });
  }

  function updateSettingsFocus() {
    var viewState = settingsView.snapshot();
    settingsView.focus({ zone: viewState.zone, index: viewState.index, navIndex: state.navIndex });
  }

  function appendPrivacyParagraph(container, key) {
    container.appendChild(element('p', '', t(key)));
  }

  function openPrivacyPolicy() {
    var content = document.getElementById('privacy-dialog-content');
    privacyDialogOpen = true;
    setText('privacy-dialog-title', t('settings.privacyPolicy'));
    content.innerHTML = '';
    content.scrollTop = 0;
    appendPrivacyParagraph(content, 'privacy.summary');
    appendPrivacyParagraph(content, 'privacy.storage');
    appendPrivacyParagraph(content, 'privacy.transmission');
    appendPrivacyParagraph(content, 'privacy.controls');
    appendPrivacyParagraph(content, 'privacy.contact');
    setText('privacy-dialog-close', t('state.back'));
    document.getElementById('privacy-dialog').className = 'privacy-dialog';
    document.getElementById('privacy-dialog-close').className = 'privacy-dialog-close is-focused';
    if (!pointerSelectionActive) { document.getElementById('privacy-dialog-close').focus(); }
  }

  function closePrivacyPolicy() {
    privacyDialogOpen = false;
    document.getElementById('privacy-dialog').className = 'privacy-dialog is-hidden';
    document.getElementById('privacy-dialog-close').className = 'privacy-dialog-close';
    updateSettingsFocus();
  }

  function scrollPrivacyPolicy(direction) {
    var content = document.getElementById('privacy-dialog-content');
    content.scrollTop += direction * 120;
  }

  function reloadApplication() {
    if (root.location && typeof root.location.reload === 'function') { root.location.reload(); }
  }

  function reloadAfterCredentialWrite() {
    if (root.PloffCredentialVault) {
      root.PloffCredentialVault.whenIdle(reloadApplication);
      return;
    }
    reloadApplication();
  }

  function disconnectPlexAccount() {
    authState = AuthStore.save(credentialStorage, AuthStore.disconnect(authState));
    reloadAfterCredentialWrite();
  }

  function deleteAllLocalData() {
    if (LocalData) { LocalData.clear(root.localStorage); }
    if (credentialStorage && credentialStorage.removeItem) { credentialStorage.removeItem(AuthStore.STORAGE_KEY); }
    reloadAfterCredentialWrite();
  }

  function activateSettingsAction(row) {
    if (row.key === 'diagnostics') { openDiagnostics(); return true; }
    if (row.key === 'privacy') { openPrivacyPolicy(); return true; }
    if (row.key === 'disconnectPlex') {
      if (!authState.ownerToken) {
        openChoiceDialog(t('setup.disconnectPlex'), [{ value: 'cancel', label: t('settings.notConnected') }], 'cancel', null, function () { updateSettingsFocus(); });
        return true;
      }
      openChoiceDialog(t('settings.disconnectConfirm'), [
        { value: 'cancel', label: t('common.cancel') },
        { value: 'disconnect', label: t('setup.disconnectPlex') }
      ], 'cancel', function (choice) {
        if (choice.value === 'disconnect') { disconnectPlexAccount(); }
      }, function () { updateSettingsFocus(); });
      return true;
    }
    if (row.key === 'deleteLocalData') {
      openChoiceDialog(t('settings.deleteLocalDataConfirm'), [
        { value: 'cancel', label: t('common.cancel') },
        { value: 'delete', label: t('settings.deleteLocalData') }
      ], 'cancel', function (choice) {
        if (choice.value === 'delete') { deleteAllLocalData(); }
      }, function () { updateSettingsFocus(); });
      return true;
    }
    return false;
  }

  function afterSettingChange(row) {
    saveAppSettings();
    if (row.key === 'cardScale') {
      if (appView === 'home') { renderRows(); updateFocus(); }
      else if (appView === 'search') { renderSearchResults(); updateSearchFocus(); }
      else if (appView === 'library') { renderLibraryGrid(); updateLibraryFocus(); }
      else if (appView === 'watchlist') { renderWatchlistGrid(); updateWatchlistFocus(); }
    }
    if (row.key === 'showWatchlist' || row.key === 'showPlaylists') { applyNavigationVisibility(); }
    renderNavigation();
    renderAppSettings();
  }

  function applySettingValue(row, value) {
    appSettings[row.key] = value;
    if (row.key === 'uiLanguage') { appSettings.uiLanguageExplicit = true; homeDomDirty = true; }
    if (row.key === 'subtitleMode') { appSettings.subtitleModeExplicit = true; }
    afterSettingChange(row);
  }

  function changeSetting(direction) {
    var row = settingsRows()[settingsView.snapshot().index];
    if (row.action) { activateSettingsAction(row); return; }
    if (row.editor || row.priorityEditor) { openLanguageEditor(row.key); return; }
    if (row.serverEditor) { openServerEditor(); return; }
    if (row.profileEditor) { openProfileManager(); return; }
    if (row.choices && row.choices.length) {
      applySettingValue(row, cycleValue(row.choices.map(function (choice) { return choice.value; }), appSettings[row.key], direction));
    }
  }

  function openAppSettingChoice() {
    var row = settingsRows()[settingsView.snapshot().index];
    if (row.action) { activateSettingsAction(row); return; }
    if (row.editor || row.priorityEditor) { openLanguageEditor(row.key); return; }
    if (row.serverEditor) { openServerEditor(); return; }
    if (row.profileEditor) { openProfileManager(); return; }
    if (!row.choices || !row.choices.length) { return; }
    openChoiceDialog(row.label, row.choices, appSettings[row.key], function (choice) {
      applySettingValue(row, choice.value);
    }, function () { updateSettingsFocus(); });
  }

  function selectAccentColor(color) {
    if (Settings.ACCENT_COLORS.indexOf(color) === -1) { return; }
    appSettings.accentColor = color;
    saveAppSettings();
    renderNavigation();
    renderAppSettings();
  }

  function orderedEditorLanguages() {
    var enabled = appSettings[settingsView.snapshot().languageKind] || [];
    if (settingsView.snapshot().languageKind === 'videoVersionPriorities') { return enabled.slice(); }
    return enabled.concat(languageCatalog.filter(function (code) { return enabled.indexOf(code) === -1; }));
  }

  function editorItemDisabled(code) {
    return settingsView.snapshot().languageKind === 'videoVersionPriorities' &&
      !VersionSelection.isPrioritySupported(code, playbackCapabilities);
  }

  function renderLanguageEditor(selectedCode) {
    var viewState = settingsView.snapshot();
    var languages = orderedEditorLanguages();
    var enabled = appSettings[viewState.languageKind];
    var index;
    var rank;
    var rendered = [];
    if (selectedCode) {
      settingsView.focusLanguage(Math.max(0, languages.indexOf(selectedCode)), languages.length);
      viewState = settingsView.snapshot();
    }
    for (index = 0; index < languages.length; index += 1) {
      rank = enabled.indexOf(languages[index]);
      rendered.push({
        code: languages[index],
        label: viewState.languageKind === 'videoVersionPriorities'
          ? t('settings.versionPriority.' + languages[index])
          : I18n.languageName(appSettings.uiLanguage, languages[index]),
        rank: rank === -1 ? 0 : rank + 1,
        disabled: editorItemDisabled(languages[index])
      });
    }
    if (rendered[viewState.languageIndex] && rendered[viewState.languageIndex].disabled) {
      for (index = 0; index < rendered.length; index += 1) {
        if (!rendered[index].disabled) {
          settingsView.focusLanguage(index, rendered.length);
          viewState = settingsView.snapshot();
          break;
        }
      }
    }
    settingsView.renderLanguages({
      title: settingsRows()[viewState.index].label,
      hint: t(viewState.languageKind === 'videoVersionPriorities' ? 'settings.priorityEditorHint' : 'settings.languageEditorHint'),
      index: viewState.languageIndex, languages: rendered
    });
  }

  function openLanguageEditor(kind) {
    settingsView.openLanguages(kind);
    document.getElementById('language-editor').className = 'language-editor';
    renderLanguageEditor();
  }
  var serverEditorView = ServerEditorView.create({
    document: document,
    t: t,
    element: element,
    appendAddresses: appendServerEditorAddresses,
    keepFocusVisible: keepPanelFocusVisible,
    isPointerSelectionActive: function () { return pointerSelectionActive; }
  });

  function renderServerEditor() {
    var viewState = serverEditorView.snapshot();
    serverEditorView.render({
      activeUri: activeServer && activeServer.uri,
      addressesFor: function (server) { return serverConnectionAddresses(server, true); },
      index: viewState.index,
      open: viewState.open,
      servers: serverState.servers
    });
  }

  function serverConnectionAddresses(server, compactDirect) {
    var value = server || {};
    var connections = (value.connections || []).slice();
    var profile = AuthStore ? AuthStore.activeProfile(authState) : null;
    var directCount = 0;
    var localHosts = [];
    var result = [];
    var matchesActive = activeServer && (
      (value.machineIdentifier && value.machineIdentifier === activeServer.machineIdentifier) || value.uri === activeServer.uri
    );
    if (matchesActive && config.apiBaseUrl) { connections.push(config.apiBaseUrl); }
    if (matchesActive && profile && profile.serverConnectionUri) { connections.push(profile.serverConnectionUri); }
    connections = ServerStore.connectionUris({ uri: value.uri, connections: connections });
    connections.forEach(function (uri) {
      var host = String(uri).match(/^https?:\/\/([^/:]+)/i);
      if (ServerDiscovery.isLocalCandidate(uri) && host) { localHosts.push(host[1]); }
    });
    connections.forEach(function (uri) {
      var host = String(uri).match(/^https?:\/\/([^/:]+)/i);
      var direct = host && host[1].match(/^(\d+)-(\d+)-(\d+)-(\d+)\..*\.plex\.direct$/i);
      var embeddedHost = direct ? [direct[1], direct[2], direct[3], direct[4]].join('.') : '';
      if (compactDirect && direct) {
        if (localHosts.indexOf(embeddedHost) === -1) { directCount += 1; }
        return;
      }
      result.push({ kind: ServerDiscovery.isLocalCandidate(uri) ? 'local' : 'remote', uri: uri });
    });
    if (compactDirect && directCount) { result.push({ kind: 'direct', count: directCount, uri: '' }); }
    return result;
  }

  function appendServerEditorAddresses(row, addresses) {
    var container = element('span', 'server-editor-addresses');
    var index;
    var labelKey;
    for (index = 0; index < addresses.length; index += 1) {
      if (addresses[index].kind === 'direct') {
        container.appendChild(element('span', 'server-editor-meta', t('settings.remoteDirect') + ': ' + t('settings.addressCount', { count: addresses[index].count })));
        continue;
      }
      labelKey = addresses[index].kind === 'local' ? 'settings.localAddress' : 'settings.remoteAddress';
      container.appendChild(element('span', 'server-editor-meta', t(labelKey) + ': ' + addresses[index].uri));
    }
    row.appendChild(container);
  }

  function replaceStoredServer(server) {
    var index;
    var replaced = false;
    var servers = serverState.servers.slice();
    for (index = 0; index < servers.length; index += 1) {
      if ((server.machineIdentifier && servers[index].machineIdentifier === server.machineIdentifier) || servers[index].uri === server.uri) {
        servers[index] = server;
        replaced = true;
        break;
      }
    }
    if (!replaced) { servers.push(server); }
    serverState = ServerStore.save(root.localStorage, servers, server.uri);
  }

  function activateServerConnection(uri) {
    var promoted;
    if (!activeServer || !uri) { return false; }
    promoted = ServerStore.preferConnection(activeServer, uri);
    if (!promoted) { return false; }
    activeServer = promoted;
    config.apiBaseUrl = promoted.uri;
    replaceStoredServer(promoted);
    if (AuthStore && authState.mode === 'plex') {
      authState = AuthStore.setActiveProfileConnection(authState, promoted.machineIdentifier, promoted.uri);
      authState = AuthStore.save(credentialStorage, authState);
    }
    renderActiveProfile();
    if (appView === 'settings') { renderAppSettings(); }
    return true;
  }

  function attemptServerFailover(error, callback) {
    var currentUri = ServerStore.normalizeUri(config.apiBaseUrl);
    var candidates;
    if (!activeServer || !PlexAuth || !PlexAuth.findReachableConnection || serverFailoverRequest) { callback(false, error); return; }
    if (currentUri) { serverFailoverFailedUris[currentUri] = true; }
    candidates = serverConnectionAddresses(activeServer).map(function (address) { return address.uri; }).filter(function (uri) {
      return !serverFailoverFailedUris[uri] && NetworkPolicy.allowsFailover(networkSnapshot, activeServer.connectionRoutes, uri, ServerStore.normalizeUri, ServerDiscovery.isLocalCandidate);
    });
    if (!candidates.length) { callback(false, error); return; }
    serverFailoverRequest = PlexAuth.findReachableConnection(root, config.token || '', candidates, activeServer.machineIdentifier, authOptions, function (connectionError, uri) {
      serverFailoverRequest = null;
      if (connectionError || !uri || !activateServerConnection(uri)) { callback(false, error || connectionError); return; }
      callback(true, null);
    });
  }

  function openServerEditor() {
    serverEditorView.open();
    renderAppSettings();
  }

  function closeServerEditor() {
    serverEditorView.close();
    renderAppSettings();
  }

  function serverForUri(uri) {
    var index;
    for (index = 0; index < serverState.servers.length; index += 1) {
      if (serverState.servers[index].uri === uri) { return serverState.servers[index]; }
    }
    return null;
  }

  function serverForIdentity(server) {
    var index;
    if (!server) { return null; }
    for (index = 0; index < serverState.servers.length; index += 1) {
      if ((server.machineIdentifier && serverState.servers[index].machineIdentifier === server.machineIdentifier) || serverState.servers[index].uri === server.uri) {
        return serverState.servers[index];
      }
    }
    return null;
  }

  function applyServer(server) {
    var cachedToken;
    var profile;
    var previousIdentity = String(config.apiBaseUrl || '') + '|' + String(config.token || '');
    var nextIdentity;
    if (!server) { return; }
    if (serverFailoverRequest && serverFailoverRequest.abort) { serverFailoverRequest.abort(); }
    serverFailoverRequest = null;
    serverFailoverFailedUris = {};
    activeServer = server;
    config.apiBaseUrl = server.uri;
    cachedToken = AuthStore ? AuthStore.activeToken(authState, server.machineIdentifier) : '';
    profile = AuthStore ? AuthStore.activeProfile(authState) : null;
    if (cachedToken && profile && profile.serverConnectionUri) { config.apiBaseUrl = profile.serverConnectionUri; }
    config.token = cachedToken || (authState.mode !== 'plex' && server.uri === ServerStore.normalizeUri(configuredApiBaseUrl) ? configuredToken : '');
    serverState = ServerStore.save(root.localStorage, serverState.servers, server.uri);
    nextIdentity = String(config.apiBaseUrl || '') + '|' + String(config.token || '');
    if (previousIdentity !== nextIdentity && homeRefreshCoordinator) {
      if (serverActivityRequest && serverActivityRequest.abort) { serverActivityRequest.abort(); }
      serverActivityRequest = null;
      root.clearTimeout(serverActivityPollTimer);
      serverActivities = [];
      serverActivityFingerprint = '';
      serverActivityWaiters = [];
      renderServerActivities();
      homeRefreshCoordinator.reset();
      watchlistView.reset();
      posterLoader.cancelScope('home');
      data.rows = [];
      homeDomDirty = true;
      lastHomeSelectionKey = '';
      document.getElementById('content').innerHTML = '';
    }
  }

  function discoverLocalServers(callback) {
    if (!ServerDiscovery || serverDiscoveryActive) { if (callback) { callback(); } return; }
    serverDiscoveryActive = true;
    if (serverEditorView.snapshot().open) { renderServerEditor(); }
    ServerDiscovery.discover(root, config, function (servers) {
      serverDiscoveryActive = false;
      serverState.servers = ServerStore.merge(serverState.servers, servers);
      serverState = ServerStore.save(root.localStorage, serverState.servers, activeServer ? activeServer.uri : serverState.activeUri);
      if (serverEditorView.snapshot().open) {
        serverEditorView.focus(serverEditorView.snapshot().index, serverState.servers.length + 2);
        renderServerEditor();
      }
      if (config.apiBaseUrl && serverFailoverFailedUris[ServerStore.normalizeUri(config.apiBaseUrl)] && !serverFailoverRequest) {
        loadPlex();
      }
      if (callback) { callback(); }
    });
  }

  function activeProfileTitle() {
    var profile = AuthStore ? AuthStore.activeProfile(authState) : null;
    return authState.mode === 'plex' && profile ? profile.title : t('settings.localNoAuth');
  }

  function renderActiveProfile() {
    var profile = AuthStore ? AuthStore.activeProfile(authState) : null;
    var button = document.getElementById('active-profile');
    var avatar = document.getElementById('active-profile-avatar');
    var initial = document.getElementById('active-profile-initial');
    if (authState.mode !== 'plex' && authState.setupComplete) {
      button.className = 'active-profile is-offline';
      button.disabled = false;
      setText('active-profile-name', t('profile.offline'));
      avatar.style.display = 'none';
      avatar.removeAttribute('src');
      initial.style.display = 'none';
      button.setAttribute('data-nav-index', navigationItems.length + 1);
      return;
    }
    if (!profile) {
      button.className = 'active-profile is-hidden';
      button.disabled = true;
      button.removeAttribute('data-nav-index');
      return;
    }
    button.className = 'active-profile';
    button.disabled = false;
    button.setAttribute('data-nav-index', navigationItems.length + 1);
    setText('active-profile-name', profile.title);
    setText('active-profile-initial', String(profile.title || 'P').charAt(0).toUpperCase());
    avatar.style.display = profile.thumb ? 'block' : 'none';
    avatar.src = profile.thumb || '';
    avatar.onerror = function () { avatar.style.display = 'none'; initial.style.display = 'flex'; };
    initial.style.display = profile.thumb ? 'none' : 'flex';
  }

  var serverActivityVisualState = 'idle';
  var serverActivityVisualTarget = 'idle';
  var serverActivityTransitionTimer = null;

  function serverActivityDesiredVisualState(homeRefreshing) {
    if (serverActivities.length) { return 'active'; }
    return homeRefreshing ? 'home-refreshing' : 'idle';
  }

  function updateServerActivityVisualState(target) {
    serverActivityVisualTarget = target;
    if (target === 'idle') {
      if (serverActivityVisualState === 'idle' || serverActivityVisualState === 'stopping') { return serverActivityVisualState; }
      root.clearTimeout(serverActivityTransitionTimer);
      serverActivityVisualState = 'stopping';
      serverActivityTransitionTimer = root.setTimeout(function () {
        serverActivityTransitionTimer = null;
        if (serverActivityVisualTarget !== 'idle' || serverActivityVisualState !== 'stopping') { return; }
        serverActivityVisualState = 'idle';
        renderServerActivities();
      }, interfaceAnimationDuration(900));
      return serverActivityVisualState;
    }
    if (serverActivityVisualState === 'idle' || serverActivityVisualState === 'stopping') {
      root.clearTimeout(serverActivityTransitionTimer);
      serverActivityVisualState = 'starting';
      serverActivityTransitionTimer = root.setTimeout(function () {
        serverActivityTransitionTimer = null;
        if (serverActivityVisualState !== 'starting') { return; }
        serverActivityVisualState = serverActivityVisualTarget === 'idle' ? 'idle' : serverActivityVisualTarget;
        renderServerActivities();
      }, interfaceAnimationDuration(520));
    } else if (serverActivityVisualState === 'active' || serverActivityVisualState === 'home-refreshing') {
      serverActivityVisualState = target;
    }
    return serverActivityVisualState;
  }

  function renderServerActivities() {
    var button = document.getElementById('server-activity');
    var panel = document.getElementById('server-activity-panel');
    var focused = button.className.indexOf('is-focused') !== -1;
    var index;
    var activity;
    var row;
    var networkLabel = networkStatusLabel(networkSnapshot);
    var title = serverActivities.length ? (serverActivities[0].title || t('activity.working')) : '';
    var homeRefreshing = homeRefreshVisualActive && !serverActivities.length;
    var desiredVisualState = serverActivityDesiredVisualState(homeRefreshing);
    var visualState = updateServerActivityVisualState(desiredVisualState);
    if (serverActivities.length > 1) { title += ' ' + t('activity.more', { count: serverActivities.length - 1 }); }
    button.className = 'server-activity ' + networkStatusClass(networkSnapshot) + ' is-' + visualState +
      (desiredVisualState === 'home-refreshing' ? ' is-home-refreshing-source' : '') + (focused ? ' is-focused' : '');
    button.setAttribute('data-nav-index', navigationItems.length);
    button.setAttribute('aria-label', t('activity.label') + ': ' + networkLabel + (title ? ' \u00b7 ' + title : ''));
    button.setAttribute('aria-busy', desiredVisualState === 'idle' ? 'false' : 'true');
    button.setAttribute('title', t('activity.label') + ': ' + networkLabel);
    setText('server-activity-title', title);
    if (appView === 'detail') {
      if (title) { showDetailMetadataStatus(title, false); }
      else if (detailRefreshPending) { showDetailMetadataStatus(t('status.refreshing'), false); }
      else if (!detailMetadataStatusTemporary) { hideDetailMetadataStatus(); }
    }
    panel.innerHTML = '';
    panel.appendChild(element('div', 'activity-network-status', t('settings.networkStatus') + ': ' + networkLabel));
    if (!serverActivities.length) {
      panel.appendChild(element('div', 'activity-empty', t('activity.idle')));
      return;
    }
    for (index = 0; index < serverActivities.length; index += 1) {
      activity = serverActivities[index];
      row = element('div', 'activity-row');
      row.appendChild(element('span', 'activity-heading', activity.title || t('activity.working')));
      if (activity.subtitle) { row.appendChild(element('span', 'activity-subtitle', activity.subtitle)); }
      if (activity.progress >= 0) { renderActivityProgress(row, activity); }
      panel.appendChild(row);
    }
  }

  function renderActivityProgress(row, activity) {
    var progress = element('span', 'activity-progress');
    var value = element('span', 'activity-progress-value');
    value.style.width = Math.max(0, Math.min(100, activity.progress)) + '%';
    progress.appendChild(value);
    row.appendChild(progress);
  }

  function processServerActivityWaiters() {
    var now = new Date().getTime();
    var remaining = [];
    var completed = [];
    serverActivityWaiters.forEach(function (entry) {
      if (ActivityState.advanceWaiter(entry.waiter, serverActivities, now)) { completed.push(entry.callback); }
      else { remaining.push(entry); }
    });
    serverActivityWaiters = remaining;
    completed.forEach(function (callback) { callback(); });
  }

  function scheduleServerActivityPoll(delay) {
    root.clearTimeout(serverActivityPollTimer);
    serverActivityPollTimer = root.setTimeout(pollServerActivities, typeof delay === 'number' ? delay : 3000);
  }

  function pollServerActivities() {
    var identity;
    serverActivityPollTimer = null;
    if (!config.apiBaseUrl || appView === 'player') { scheduleServerActivityPoll(3000); return; }
    if (serverActivityRequest) { scheduleServerActivityPoll(500); return; }
    identity = String(config.apiBaseUrl || '') + '|' + String(config.token || '');
    serverActivityRequest = PlexClient.loadActivities(config, function (error, activities) {
      var nextFingerprint;
      serverActivityRequest = null;
      if (identity !== String(config.apiBaseUrl || '') + '|' + String(config.token || '')) { scheduleServerActivityPoll(0); return; }
      if (!error) {
        nextFingerprint = ActivityState.fingerprint(activities);
        serverActivities = activities;
        if (nextFingerprint !== serverActivityFingerprint) {
          serverActivityFingerprint = nextFingerprint;
          renderServerActivities();
        }
      }
      processServerActivityWaiters();
      scheduleServerActivityPoll(3000);
    });
  }

  function waitForServerActivity(activityId, callback) {
    serverActivityWaiters.push({
      waiter: ActivityState.createWaiter(activityId, serverActivities, new Date().getTime()),
      callback: callback
    });
    scheduleServerActivityPoll(100);
  }
  // Onboarding, account linking, editors, profile switching, and diagnostics.
  var setupScanIndicator = SetupScanIndicator.create({
    root: root,
    shouldContinue: function () { return appView === 'setup' && setupStage === 'servers' && serverDiscoveryActive && !serverState.servers.length; },
    message: function (count) {
      setText('setup-message', t('setup.findServerMessage') + ' ' + new Array(count + 1).join('.'));
    }
  });

  function stopSetupScanMessage() { setupScanIndicator.stop(); }

  function startSetupScanMessage() {
    if (serverDiscoveryActive && !serverState.servers.length) { setupScanIndicator.start(); }
  }

  var setupFocus = SetupFocus.create({
    buttons: function () { return document.querySelectorAll('#setup-view button'); },
    isPointerSelectionActive: function () { return pointerSelectionActive; }
  });

  var setupView = SetupView.create({
    root: root,
    document: document,
    element: element,
    setText: setText,
    t: t,
    languages: setupUiLanguages,
    presentation: function () {
      return {
        activeLanguage: appSettings.uiLanguage,
        activeProfileId: authState.activeProfileId,
        ownerToken: authState.ownerToken,
        serverDiscoveryActive: serverDiscoveryActive,
        manualAddress: config.apiBaseUrl || '',
        loginPin: setupPin,
        statusKey: setupStatusKey
      };
    },
    focus: function (index) { setupFocus.apply(index); },
    scanIndicator: setupScanIndicator
  });

  var setupAuthSession = SetupAuthSession.create({
    root: root,
    createPin: function (purpose, callback) { return PlexAuth.createPin(root, authOptions, callback); },
    pollPin: function (pinId, callback) { return PlexAuth.pollPin(root, pinId, authOptions, callback); },
    onState: function (snapshot) {
      setupPin = snapshot.pin;
      if (snapshot.phase === 'idle' || appView !== 'setup' || setupStage !== 'login') { return; }
      if (snapshot.phase === 'expired') { setupStatusKey = 'setup.loginExpired'; }
      else if (snapshot.phase === 'error') { setupStatusKey = 'setup.loginUnavailable'; }
      else { setupStatusKey = 'setup.loginWaiting'; }
      setupView.render(setupController.snapshot());
    },
    onAuthenticated: function (result) {
      if (appView !== 'setup' || setupStage !== 'login' || !result || !result.token) { return; }
      setupController.activate('login-authenticated', result);
    }
  });

  function renderSetupControllerState(snapshot) {
    setupStage = snapshot.stage;
    setupStatusKey = snapshot.statusKey;
    if (appView === 'setup') { setupView.render(snapshot); }
  }

  setupController = SetupController.create({
    root: root,
    authSession: setupAuthSession,
    render: renderSetupControllerState,
    scan: function (snapshot, callback) {
      serverDiscoveryActive = true;
      startSetupScanMessage();
      ServerDiscovery.discover(root, config, function (servers) {
        serverDiscoveryActive = false;
        stopSetupScanMessage();
        serverState.servers = ServerStore.merge(serverState.servers, servers);
        serverState = ServerStore.save(root.localStorage, serverState.servers, serverState.activeUri);
        callback(null, serverState.servers);
      });
      return null;
    },
    selectLanguage: function (language) {
      appSettings.uiLanguage = language;
      appSettings.uiLanguageExplicit = true;
      appSettings = Settings.save(root.localStorage, appSettings);
      homeDomDirty = true;
    },
    normalizeManualAddress: ServerDiscovery.normalizeCandidate,
    probeManualAddress: function (uri, callback) {
      ServerDiscovery.probe(root, uri, '', config.discoveryTimeout || 1800, function (server) {
        if (!server) { callback(new Error('Plex server unavailable')); return; }
        serverState.servers = ServerStore.merge(serverState.servers, [server]);
        serverState = ServerStore.save(root.localStorage, serverState.servers, serverState.activeUri);
        callback(null, serverForIdentity(server) || server);
      });
      return null;
    },
    shouldOfferConnection: ServerDiscovery.shouldOfferLocalConnection,
    loadAccountServers: function (ownerToken, callback) {
      authState.ownerToken = ownerToken || authState.ownerToken;
      authState = AuthStore.save(credentialStorage, authState);
      return PlexAuth.loadAccountServers(root, authState.ownerToken, authOptions, function (error, servers) {
        if (!error) {
          serverState.servers = ServerStore.merge(serverState.servers, servers);
          serverState = ServerStore.save(root.localStorage, serverState.servers, serverState.activeUri);
        }
        callback(error, error ? [] : serverState.servers);
      });
    },
    loadProfiles: function (ownerToken, callback) {
      var previousActiveProfile = AuthStore.activeProfile(authState);
      authState.ownerToken = ownerToken || authState.ownerToken;
      authState = AuthStore.save(credentialStorage, authState);
      return PlexAuth.loadHomeUsers(root, authState.ownerToken, authOptions, function (error, profiles) {
        var merged;
        var index;
        if (error) { callback(error); return; }
        merged = AuthStore.mergeProfiles(authState.profiles, profiles);
        if (previousActiveProfile) {
          for (index = 0; index < merged.length; index += 1) {
            if (AuthStore.sameProfile(merged[index], previousActiveProfile)) { authState.activeProfileId = merged[index].id; break; }
          }
        }
        authState.profiles = merged;
        authState = AuthStore.save(credentialStorage, authState);
        callback(null, merged);
      });
    },
    switchProfile: function (profile, pin, callback) { return switchSetupProfile(profile, pin, callback); },
    continueOffline: function () {
      authState.mode = 'offline'; authState.activeProfileId = ''; authState.setupComplete = true;
      authState = AuthStore.save(credentialStorage, authState);
    },
    disconnect: function () {
      authState = AuthStore.save(credentialStorage, AuthStore.disconnect(authState));
    },
    finish: function (snapshot) { finishSetup(snapshot); },
    cancel: function (snapshot) { cancelSetup(snapshot); }
  });

  function completeSetupProfile(profile, token, accountToken, machineIdentifier, connectionUri, callback) {
    var setupSnapshot = setupController.snapshot();
    var updated = {
      id: profile.id, uuid: profile.uuid, title: profile.title, protected: profile.protected,
      thumb: profile.thumb, token: token || profile.token,
      accountToken: accountToken || profile.accountToken,
      serverMachineIdentifier: machineIdentifier || profile.serverMachineIdentifier,
      serverConnectionUri: connectionUri || profile.serverConnectionUri
    };
    authState.profiles = AuthStore.mergeProfiles(authState.profiles, [updated].concat(setupSnapshot.profiles));
    authState.mode = 'plex'; authState.activeProfileId = profile.id; authState.setupComplete = true;
    authState = AuthStore.save(credentialStorage, authState);
    if (callback) { callback(null, updated); }
    else { finishSetup(); }
  }

  function persistRemoteConnectionState(server, connections, status, connectionRoutes) {
    var current = serverForIdentity(server) || server;
    var updated = ServerStore.withRemoteConnections(current, connections, status, new Date().getTime(), connectionRoutes);
    if (!updated) { return; }
    replaceStoredServer(updated);
    if (activeServer && (
      (updated.machineIdentifier && updated.machineIdentifier === activeServer.machineIdentifier) ||
      updated.uri === activeServer.uri
    )) {
      activeServer = updated;
    }
  }

  function verifyRemoteConnectionsInBackground(server, token, connections, connectionRoutes) {
    var verificationKey = String(server && (server.machineIdentifier || server.uri) || '');
    var remoteConnections = (connections || []).filter(function (uri) {
      return !ServerDiscovery.isLocalCandidate(uri);
    });
    if (!networkState.allowsCloud()) { return; }
    if (!verificationKey || remoteConnectionVerificationStarted[verificationKey]) { return; }
    remoteConnectionVerificationStarted[verificationKey] = true;
    persistRemoteConnectionState(server, connections, remoteConnections.length ? 'pending' : 'unavailable', connectionRoutes);
    if (!remoteConnections.length) { return; }
    NetworkPolicy.deferCloudWork(root, function () { return networkState.allowsCloud(); }, function () {
      PlexAuth.findReachableConnection(root, token, remoteConnections, server.machineIdentifier, authOptions, function (error) {
        persistRemoteConnectionState(server, connections, error ? 'failed' : 'linked', connectionRoutes);
        if (serverEditorView.snapshot().open) { renderServerEditor(); }
      });
    }, function () {
      delete remoteConnectionVerificationStarted[verificationKey];
    });
  }

  function resumeRemoteConnectionVerification(server) {
    var status = String(server && server.remoteLinkStatus || '');
    var token = AuthStore ? AuthStore.activeToken(authState, server && server.machineIdentifier) : '';
    if (!server || !token || status === 'linked' || status === 'unavailable') { return; }
    verifyRemoteConnectionsInBackground(server, token, server.connections || [], server.connectionRoutes || []);
  }

  function resolveSetupProfileAccess(profile, accountToken, generation, callback) {
    var setupSnapshot = setupController.snapshot();
    var server = setupSnapshot.selectedServer || activeServer;
    var preferredServer;
    var preferredIndex;
    if (!server || !server.machineIdentifier) {
      callback(new Error('Plex server access unavailable'));
      return;
    }
    preferredServer = {
      uri: setupSnapshot.preferredConnectionUri || server.uri,
      machineIdentifier: server.machineIdentifier
    };
    PlexAuth.loadServerAccess(root, accountToken, server.machineIdentifier, authOptions, function (error, access) {
      var candidates;
      if (generation !== setupAuthGeneration || appView !== 'setup') { return; }
      if (error || !access || !access.token) {
        callback(error || new Error('Plex server access unavailable'));
        return;
      }
      candidates = access.connections.slice();
      if (preferredServer.uri) {
        preferredIndex = candidates.indexOf(preferredServer.uri);
        if (preferredIndex !== -1) { candidates.splice(preferredIndex, 1); }
        candidates.unshift(preferredServer.uri);
      }
      PlexAuth.findReachableConnection(root, access.token, candidates, server.machineIdentifier, authOptions, function (connectionError, connectionUri) {
        if (generation !== setupAuthGeneration || appView !== 'setup') { return; }
        if (connectionError || !connectionUri) {
          callback(connectionError || new Error('No reachable Plex connection'));
          return;
        }
        verifyRemoteConnectionsInBackground(server, access.token, access.connections, access.connectionRoutes);
        completeSetupProfile(profile, access.token, accountToken, server.machineIdentifier, connectionUri, callback);
      });
    });
  }

  function switchSetupProfile(profile, pin, callback) {
    var generation;
    var setupSnapshot = setupController.snapshot();
    var server = setupSnapshot.selectedServer || activeServer;
    var accountToken;
    if (profile.token && server && profile.serverMachineIdentifier === server.machineIdentifier) {
      completeSetupProfile(profile, profile.token, profile.accountToken, profile.serverMachineIdentifier, profile.serverConnectionUri, callback);
      return null;
    }
    generation = setupAuthGeneration + 1; setupAuthGeneration = generation;
    accountToken = profile.accountToken || (!profile.serverMachineIdentifier ? profile.token : '');
    if (accountToken) { resolveSetupProfileAccess(profile, accountToken, generation, callback); return null; }
    return PlexAuth.switchHomeUser(root, authState.ownerToken, profile, pin || '', authOptions, function (error, token) {
      if (generation !== setupAuthGeneration) { return; }
      if (error || !token) {
        callback(error || new Error('Plex profile token missing'));
        return;
      }
      resolveSetupProfileAccess(profile, token, generation, callback);
    });
  }

  function finishSetup(snapshot) {
    var destination = snapshot.returnView;
    setupAuthSession.cancel(); setupAuthGeneration += 1; setupPin = null; setupStatusKey = '';
    if (snapshot.selectedServer) { applyServer(snapshot.selectedServer); }
    else if (activeServer) { applyServer(activeServer); }
    document.getElementById('setup-view').className = 'setup-view is-hidden';
    renderActiveProfile();
    if (destination === 'settings') {
      appView = 'settings'; renderAppSettings(); loadPlex();
    } else {
      revealHome({ focus: 'first', refresh: false });
      loadPlex(); discoverLocalServers();
    }
  }

  function cancelSetup(snapshot) {
    var destination = snapshot.returnView;
    setupAuthSession.cancel(); setupAuthGeneration += 1; setupPin = null; setupStatusKey = '';
    if (!snapshot.returnView) { setupController.activate('servers'); return; }
    document.getElementById('setup-view').className = 'setup-view is-hidden';
    restoreSetupReturnView(destination);
  }

  function restoreSetupReturnView(destination) {
    appView = destination || 'home';
    if (appView === 'settings') { renderAppSettings(); }
    else if (appView === 'search') { updateSearchFocus(); }
    else if (appView === 'library') { updateLibraryFocus(); }
    else if (appView === 'detail') { updateDetailFocus(); }
    else {
      revealHome({ focus: 'preserve', refresh: false });
    }
  }

  function setupLanguageIndex(language) {
    var index;
    for (index = 0; index < setupUiLanguages.length; index += 1) {
      if (setupUiLanguages[index].code === language) { return index; }
    }
    return 0;
  }

  function setupProfileIndex(profiles) {
    var index;
    for (index = 0; index < profiles.length; index += 1) {
      if (profiles[index].id === authState.activeProfileId) { return index; }
    }
    return 0;
  }

  function openSetupWithLanguage(language) {
    if (!appSettings.uiLanguageExplicit && language && appSettings.uiLanguage !== language) {
      appSettings.uiLanguage = language;
      appSettings = Settings.save(root.localStorage, appSettings);
    }
    appView = 'setup';
    document.getElementById('setup-view').className = 'setup-view';
    setupController.open({
      firstRun: !authState.setupComplete,
      prefetchScan: !authState.setupComplete,
      languageExplicit: appSettings.uiLanguageExplicit,
      language: appSettings.uiLanguage,
      servers: serverState.servers,
      profiles: AuthStore.mergeProfiles(authState.profiles, []),
      selectedServer: null,
      focusIndex: setupLanguageIndex(appSettings.uiLanguage),
      returnView: ''
    });
    completeStartup();
  }

  function openSetup() {
    var supported;
    if (authState.setupComplete || appSettings.uiLanguageExplicit || !DeviceLocale) {
      openSetupWithLanguage(appSettings.uiLanguage);
      return;
    }
    supported = setupUiLanguages.map(function (item) { return item.code; });
    DeviceLocale.detect(root, supported, function (language) {
      openSetupWithLanguage(language);
    });
  }

  function openProfileManager() {
    var destination = appView;
    var profiles = AuthStore.mergeProfiles(authState.profiles, []);
    appView = 'setup';
    document.getElementById('setup-view').className = 'setup-view';
    setupController.open({
      stage: authState.ownerToken || authState.profiles.length ? 'profiles' : 'access',
      scan: false,
      languageExplicit: true,
      language: appSettings.uiLanguage,
      servers: serverState.servers,
      profiles: profiles,
      selectedServer: activeServer,
      preferredConnectionUri: config.apiBaseUrl || (activeServer && activeServer.uri) || '',
      focusIndex: setupProfileIndex(profiles),
      returnView: destination
    });
    if (authState.ownerToken) { setupController.activate('load-profiles', { token: authState.ownerToken }); }
  }

  function openManualServerSetup() {
    serverEditorView.close();
    appView = 'setup';
    document.getElementById('setup-view').className = 'setup-view';
    setupController.open({
      stage: 'manual', scan: false, languageExplicit: true, language: appSettings.uiLanguage,
      servers: serverState.servers, profiles: AuthStore.mergeProfiles(authState.profiles, []),
      selectedServer: activeServer,
      preferredConnectionUri: config.apiBaseUrl || (activeServer && activeServer.uri) || '',
      returnView: 'settings'
    });
  }

  function activateSetupAction(action) {
    var payload = null;
    if (action === 'connect-manual') { payload = { address: document.getElementById('setup-address').value }; }
    else if (action === 'account-servers' || action === 'load-profiles') { payload = { token: authState.ownerToken }; }
    setupController.activate(action, payload);
  }

  function activateSetupButton(button) {
    var index;
    if (button.hasAttribute('data-setup-language')) {
      index = Number(button.getAttribute('data-setup-language'));
      if (setupUiLanguages[index]) { setupController.activate('language', setupUiLanguages[index].code); }
      return;
    }
    if (button.hasAttribute('data-setup-action')) { activateSetupAction(button.getAttribute('data-setup-action')); return; }
    if (button.hasAttribute('data-setup-server')) {
      index = Number(button.getAttribute('data-setup-server'));
      setupController.activate('select-server', index); return;
    }
    if (button.hasAttribute('data-setup-profile')) {
      index = Number(button.getAttribute('data-setup-profile'));
      if (setupController.snapshot().profiles[index]) { setupController.activate('select-profile', index); }
    }
  }
  function switchServer(server) {
    if (!server || (activeServer && activeServer.uri === server.uri)) { closeServerEditor(); return; }
    applyServer(server);
    serverEditorView.close();
    document.getElementById('app-settings-view').className = 'app-settings-view is-hidden';
    document.getElementById('content').style.display = 'block';
    document.body.className = document.body.className.indexOf('is-booting') === -1 ? document.body.className + ' is-booting' : document.body.className;
    appView = 'home';
    loadPlex();
  }

  function activateServerEditorRow() {
    var index = serverEditorView.snapshot().index;
    if (index === 0) { discoverLocalServers(); return; }
    if (index === 1) { openManualServerSetup(); return; }
    switchServer(serverState.servers[index - 2]);
  }
  function closeLanguageEditor() {
    settingsView.closeLanguages();
    document.getElementById('language-editor').className = 'language-editor is-hidden';
    renderAppSettings();
  }

  function toggleEditorLanguage() {
    var viewState = settingsView.snapshot();
    if (viewState.languageKind === 'videoVersionPriorities' || editorItemDisabled(orderedEditorLanguages()[viewState.languageIndex])) { return; }
    var code = orderedEditorLanguages()[viewState.languageIndex];
    var enabled = appSettings[viewState.languageKind];
    var position = enabled.indexOf(code);
    if (position === -1) { enabled.push(code); }
    else { enabled.splice(position, 1); }
    saveAppSettings();
    renderLanguageEditor(code);
  }

  function moveEditorLanguage(direction) {
    var viewState = settingsView.snapshot();
    var code = orderedEditorLanguages()[viewState.languageIndex];
    var enabled = appSettings[viewState.languageKind];
    var position = enabled.indexOf(code);
    var next = position + direction;
    if (position === -1 || next < 0 || next >= enabled.length || editorItemDisabled(code)) { return; }
    while (next >= 0 && next < enabled.length && editorItemDisabled(enabled[next])) { next += direction; }
    if (next < 0 || next >= enabled.length) { return; }
    if (viewState.languageKind === 'videoVersionPriorities') {
      enabled[position] = enabled[next];
      enabled[next] = code;
      saveAppSettings();
      renderLanguageEditor(code);
      return;
    }
    enabled.splice(position, 1);
    enabled.splice(next, 0, code);
    saveAppSettings();
    renderLanguageEditor(code);
  }

  function moveEditorFocus(direction) {
    var viewState = settingsView.snapshot();
    var items = orderedEditorLanguages();
    var next = viewState.languageIndex + direction;
    while (next >= 0 && next < items.length && editorItemDisabled(items[next])) { next += direction; }
    if (next < 0 || next >= items.length) { return; }
    settingsView.focusLanguage(next, items.length);
    renderLanguageEditor();
  }

  function openAppSettings(keepNavigationFocus) {
    appView = 'settings';
    settingsView.open(keepNavigationFocus);
    serverEditorView.close();
    backgroundAudio.stop();
    document.getElementById('content').style.display = 'none';
    document.getElementById('search-view').className = 'search-view is-hidden';
    document.getElementById('library-view').className = 'library-view is-hidden';
    document.getElementById('detail-view').className = 'detail-view is-hidden';
    document.getElementById('diagnostics-view').className = 'diagnostics-view is-hidden';
    document.getElementById('app-settings-view').className = 'app-settings-view';
    renderNavigation();
    renderAppSettings();
  }

  function leaveAppSettings() {
    if (privacyDialogOpen) {
      privacyDialogOpen = false;
      document.getElementById('privacy-dialog').className = 'privacy-dialog is-hidden';
    }
    settingsView.close();
    serverEditorView.close();
    document.getElementById('language-editor').className = 'language-editor is-hidden';
    document.getElementById('app-settings-view').className = 'app-settings-view is-hidden';
  }

  function closeAppSettings() {
    transitionToHome('nav');
  }
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
        hdr10: playbackCapabilities.hdr10,
        dolbyVision: playbackCapabilities.dolbyVision,
        hdrKnown: playbackCapabilities.hdrKnown
      },
      network: networkSnapshot,
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
      settingsView.focusList(settingsRows().length - 1, settingsRows());
      document.getElementById('app-settings-view').className = 'app-settings-view';
      renderNavigation();
      renderAppSettings();
    }
  });

  function openDiagnostics() { diagnosticsView.open(); }

  function activateDiagnosticsAction() { diagnosticsView.activate(); }

  function handleDiagnosticsKey(event, direction) { diagnosticsView.handleKey(event, direction); }
  // Media detail, seasons, episodes, preferences, and metadata refresh.
  function setDetailViewMode(enabled) {
    document.body.className = document.body.className.replace(/\s*is-detail-view/g, '');
    if (enabled) { document.body.className += ' is-detail-view'; }
  }

  function ensureDetailEpisodeView() {
    if (detailEpisodeView) { return detailEpisodeView; }
    detailEpisodeView = DetailEpisodeView.create({
      root: root,
      document: document,
      element: element,
      ProgressiveImages: ProgressiveImages,
      posterLoader: posterLoader,
      onSeasonActivate: function (index) {
        detailSeasonIndex = detailEpisodeView.setSeasonIndex(index, false);
        loadSelectedSeason();
      },
      onEpisodeActivate: function (index) {
        detailEpisodeIndex = detailEpisodeView.setEpisodeIndex(index, false);
        playSelectedEpisode(seriesContext.episodes[detailEpisodeIndex]);
      }
    });
    return detailEpisodeView;
  }

  function ensureDetailPresentationView() {
    if (detailPresentationView) { return detailPresentationView; }
    detailPresentationView = DetailPresentationView.create({
      root: root, document: document, setText: setText, t: t,
      getZone: function () { return detailZone; },
      onInvalidZone: function (name) {
        if (name === 'summary') { detailZone = 'play'; }
        else { detailZone = seriesContext ? 'episodes' : 'play'; }
        updateDetailFocus();
      },
      onDialogClose: function () { if (appView === 'detail') { updateDetailFocus(); } }
    });
    return detailPresentationView;
  }

  function detailPresentationSnapshot() { return ensureDetailPresentationView().snapshot(); }

  function detailPresentationKey(item) {
    if (!item) { return ''; }
    return [item.type || '', item.ratingKey || item.title || ''].join(':');
  }

  function clearDetailPresentation(clearPoster) {
    episodeDetailToken += 1;
    seasonTransitionMediaKey = '';
    posterLoader.cancelScope('detail');
    if (clearPoster) { loadRenderedPoster(document.getElementById('detail-poster'), '', 0, 'detail', 360, 540); }
    ensureDetailPresentationView().clear();
    setText('detail-audio-value', '');
    setText('detail-subtitles-value', '');
    setText('detail-version-value', '');
    setText('detail-media-info-video', '');
    setText('detail-media-info-audio', '');
    setText('detail-media-info-bitrate', '');
    setText('detail-media-info-subtitle-languages', '');
    closeDetailMediaInfo();
    document.getElementById('season-tabs').innerHTML = '';
    document.getElementById('episode-strip').innerHTML = '';
    if (detailEpisodeView) { detailEpisodeView.reset(); }
  }

  function prepareDetailTransition(item) {
    var nextKey = detailPresentationKey(item);
    var nextArtwork = artworkUrl(item);
    if (lastDetailPresentationKey && nextKey !== lastDetailPresentationKey) {
      clearDetailPresentation(true);
      scheduleTheme(null);
    }
    if (activeBackdropSource && activeBackdropSource !== nextArtwork) {
      clearBackdropPresentation();
    }
    lastDetailPresentationKey = nextKey;
  }

  function mediaPreferenceIdentity(detail) {
    var profile = AuthStore ? AuthStore.activeProfile(authState) : null;
    var serverId = activeServer && (activeServer.machineIdentifier || activeServer.uri) || config.apiBaseUrl || 'local';
    var profileId = profile && (profile.id || profile.uuid || profile.title) || 'local';
    return MediaPreferences ? MediaPreferences.key(serverId, profileId, detail) : '';
  }

  function resolvedDetailTracks() {
    var profile = selectedDetailMediaProfile();
    var override = detailPreferenceState.snapshot().override;
    return MediaPreferences && profile
      ? MediaPreferences.resolve({ options: {}, audioTracks: profile.audioTracks, subtitleTracks: profile.subtitleTracks }, override, appSettings)
      : null;
  }

  function detailMediaVersions() {
    return detailPreferenceState.versions();
  }

  function selectedDetailMediaProfile() {
    var snapshot = detailPreferenceState.snapshot();
    if (snapshot.override && snapshot.override.mediaIndex !== null) { return detailPreferenceState.selectedProfile(); }
    return VersionSelection.selectAutomatic(detailMediaVersions(), {
      directPlay: playbackCapabilities.directPlay,
      codecs: playbackCapabilities.codecs,
      containers: playbackCapabilities.containers,
      uhd: playbackCapabilities.uhd,
      hdr10: playbackCapabilities.hdr10,
      dolbyVision: playbackCapabilities.dolbyVision,
      hdrKnown: playbackCapabilities.hdrKnown
    }, appSettings.playbackMode, appSettings.videoVersionPriorities) || detailPreferenceState.selectedProfile();
  }

  function mediaInfoModel(profile, options) {
    return MediaInfo.create(profile || {}, options || {}, t);
  }

  function openAdvancedMediaInfo(origin) {
    var profile = origin === 'player' && currentPlayback ? currentPlayback.mediaProfile : selectedDetailMediaProfile();
    var options = origin === 'player' && currentPlayback ? currentPlayback.options : (resolvedDetailTracks() || {});
    if (!profile) { return false; }
    return mediaInfoView.open(mediaInfoModel(profile, options), origin);
  }

  function closeAdvancedMediaInfo() {
    var origin = mediaInfoView.snapshot().origin;
    mediaInfoView.close();
    if (origin === 'player') { updateSettingsDisplay(); }
    else if (appView === 'detail') { updateDetailFocus(); }
  }

  function mediaVersionLabel(profile, automatic) {
    var label = profile && profile.summary || t('player.unavailable');
    return automatic ? t('player.versionAuto') + ' - ' + label : label;
  }

  function automaticTrackLabel(label) {
    return t('player.automatic') + (label ? ' - ' + label : '');
  }

  function detailChoiceState() {
    return detailPreferenceState.choiceState();
  }

  function detailChoiceZones() {
    var choices = detailChoiceState();
    var zones = [];
    if (choices.audio) { zones.push('audio'); }
    if (choices.subtitles) { zones.push('subtitles'); }
    if (choices.versions) { zones.push('version'); }
    return zones;
  }

  function renderDetailMediaControls() {
    var resolved = resolvedDetailTracks();
    var profile = selectedDetailMediaProfile();
    var versions = detailMediaVersions();
    var choices = MediaProfile.choiceState(profile, versions);
    var subtitleLanguages = [];
    var videoParts = [];
    var audioParts = [];
    var video = '';
    var audio = '';
    var bitrate = '';
    var unavailableLabel;
    var override = detailPreferenceState.snapshot().override;
    var values = { audio: '', subtitles: '', version: '', video: '', mediaAudio: '', bitrate: '', subtitleLanguages: '' };
    if (!profile || !resolved) {
      unavailableLabel = detailMediaProfileLoading ?
        (detailMediaLoadingLabelVisible ? t('detail.loadingTracks') : '') : t('player.unavailable');
      values.audio = unavailableLabel;
      values.subtitles = unavailableLabel;
      values.version = unavailableLabel;
      values.video = unavailableLabel;
    } else {
      values.version = mediaVersionLabel(profile, !override || override.mediaIndex === null);
      values.audio = MediaProfile.trackDisplayLabel(resolved.audioTrack, t('detail.external'));
      values.audio = override && override.audioTrack ? values.audio : automaticTrackLabel(values.audio);
      values.subtitles = override && override.subtitlesOff ? t('subtitle.off') : (override && override.subtitleTrack
        ? (MediaProfile.trackDisplayLabel(resolved.subtitleTrack, t('detail.external')) || t('subtitle.off'))
        : automaticTrackLabel(MediaProfile.trackDisplayLabel(resolved.subtitleTrack, t('detail.external')) || t('subtitle.off')));
      if (profile.videoCodec) { videoParts.push(profile.videoCodec); }
      if (profile.width && profile.height) { videoParts.push(profile.width + 'x' + profile.height); }
      if (profile.videoDynamicRange) { videoParts.push(profile.videoDynamicRange); }
      if (profile.audioCodec) { audioParts.push(profile.audioCodec); }
      if (profile.audioChannels) { audioParts.push(profile.audioChannels + ' ch'); }
      video = videoParts.join(' \u00b7 ') || t('player.unavailable');
      audio = audioParts.join(' \u00b7 ') || t('player.unavailable');
      bitrate = profile.bitrate ? (Math.round(profile.bitrate / 100) / 10) + ' Mbps' : t('player.unavailable');
      subtitleLanguages = MediaProfile.subtitleLanguages(profile);
      values.video = video;
      values.mediaAudio = audio;
      values.bitrate = bitrate;
      values.subtitleLanguages = subtitleLanguages.length ? subtitleLanguages.join(', ') : t('detail.noSubtitles');
    }
    ensureDetailPresentationView().renderMediaControls({
      labels: { audio: t('detail.audio'), subtitles: t('detail.subtitles'), mediaInfo: t('detail.mediaInfo'), subtitleLanguages: t('detail.subtitleLanguages'), video: t('detail.video'), bitrate: t('detail.bitrate') },
      choices: choices,
      values: values,
      mediaInfoVisible: appSettings.showMediaInfo
    });
  }

  function animateSeasonContent(elementId) {
    var node = document.getElementById(elementId);
    if (!node) { return; }
    node.className = node.className.replace(/\s*is-season-updating/g, '');
    node.offsetWidth;
    node.className += ' is-season-updating';
    root.setTimeout(function () {
      node.className = node.className.replace(/\s*is-season-updating/g, '');
    }, interfaceAnimationDuration(220));
  }

  function animateDetailEntry() {
    var view = document.getElementById('detail-view');
    if (!view) { return; }
    view.className = view.className.replace(/\s*is-entering/g, '');
    view.offsetWidth;
    view.className += ' is-entering';
    root.setTimeout(function () {
      view.className = view.className.replace(/\s*is-entering/g, '');
    }, interfaceAnimationDuration(220));
  }

  function revealDetailSurface() {
    var view = document.getElementById('detail-view');
    var awaitingMetadata = view && view.className.indexOf('is-awaiting-metadata') !== -1;
    setDetailViewMode(true);
    document.getElementById('content').style.display = 'none';
    document.getElementById('search-view').className = 'search-view is-hidden';
    document.getElementById('library-view').className = 'library-view is-hidden';
    document.getElementById('watchlist-view').className = 'watchlist-view is-hidden';
    view.className = 'detail-view' + (awaitingMetadata ? ' is-awaiting-metadata' : '');
    updateDetailFocus();
  }

  function finishDetailTransition() {
    revealDetailSurface();
    if (!appSettings.interfaceAnimations) {
      document.body.className = document.body.className.replace(/\s*is-detail-transitioning|\s*is-detail-transition-revealing/g, '');
      return;
    }
    document.body.className = document.body.className.replace(/\s*is-detail-transitioning/g, '') + ' is-detail-transition-revealing';
    root.clearTimeout(detailTransitionEndTimer);
    detailTransitionEndTimer = root.setTimeout(function () {
      detailTransitionEndTimer = null;
      document.body.className = document.body.className.replace(/\s*is-detail-transition-revealing/g, '');
    }, interfaceAnimationDuration(200));
  }

  function completeDetailTransition() {
    var view = document.getElementById('detail-view');
    if (view) { view.className = view.className.replace(/\s*is-awaiting-metadata/g, ''); }
  }

  function transitionToDetailSurface() {
    root.clearTimeout(detailTransitionTimer);
    root.clearTimeout(detailTransitionEndTimer);
    document.body.className = document.body.className.replace(/\s*is-detail-transitioning|\s*is-detail-transition-revealing|\s*is-detail-closing|\s*is-detail-returning/g, '');
    if (!appSettings.interfaceAnimations) {
      finishDetailTransition();
      return;
    }
    document.body.className += ' is-detail-transitioning';
    detailTransitionTimer = root.setTimeout(function () {
      detailTransitionTimer = null;
      if (appView === 'detail') { finishDetailTransition(); }
    }, interfaceAnimationDuration(200));
  }

  function updateDetailMediaInfoOverflow() {
    var button = document.getElementById('detail-media-info-button');
    var visible = appSettings.showMediaInfo && button.className.indexOf('is-hidden') === -1;
    ensureDetailPresentationView().updateMediaInfoOverflow(visible);
  }

  function openDetailMediaInfo() {
    openAdvancedMediaInfo('detail');
  }

  function closeDetailMediaInfo() {
    ensureDetailPresentationView().closeMediaInfo();
  }

  function scrollDetailMediaInfo(direction) {
    ensureDetailPresentationView().scrollMediaInfo(direction);
  }

  function loadDetailMediaProfile(detail) {
    var token;
    var ratingKey = detail && detail.ratingKey;
    if (detailMediaProfileRequest && detailMediaProfileRequest.abort) { detailMediaProfileRequest.abort(); }
    detailMediaProfileRequest = null;
    detailMediaProfileToken += 1;
    token = detailMediaProfileToken;
    detailMediaProfileRatingKey = String(ratingKey || '');
    detailMediaProfileLoading = !!ratingKey;
    detailPreferenceState.prepare(mediaPreferenceIdentity(detail));
    if (appView === 'detail') { renderDetailMediaControls(); }
    if (!ratingKey) { detailMediaProfileLoading = false; return; }
    detailMediaProfileRequest = PlexClient.loadMediaProfile(config, ratingKey, function (error, profile) {
      if (token !== detailMediaProfileToken) { return; }
      detailMediaProfileRequest = null;
      if (!currentDetail || String(currentDetail.ratingKey) !== String(ratingKey)) { return; }
      detailMediaProfileLoading = false;
      detailMediaLoadingLabelVisible = false;
      root.clearTimeout(detailMediaLoadingLabelTimer);
      detailMediaLoadingLabelTimer = null;
      detailPreferenceState.setProfile(error ? null : profile);
      if (appView === 'detail') {
        renderDetailMediaControls();
        if (String(ratingKey) === seasonTransitionMediaKey) {
          seasonTransitionMediaKey = '';
          animateSeasonContent('detail-playback-controls');
        }
        updateDetailFocus();
      }
    });
  }

  function prepareDetailMediaProfile(detail) {
    var ratingKey = detail && detail.ratingKey;
    root.clearTimeout(detailMediaProfileTimer);
    detailMediaProfileTimer = null;
    if (detailMediaProfileRequest && detailMediaProfileRequest.abort) { detailMediaProfileRequest.abort(); }
    detailMediaProfileRequest = null;
    detailMediaProfileToken += 1;
    detailMediaProfileRatingKey = String(ratingKey || '');
    detailMediaProfileLoading = !!ratingKey;
    detailMediaLoadingLabelVisible = false;
    root.clearTimeout(detailMediaLoadingLabelTimer);
    detailMediaLoadingLabelTimer = null;
    detailPreferenceState.prepare(mediaPreferenceIdentity(detail));
    renderDetailMediaControls();
    if (ratingKey) {
      detailMediaLoadingLabelTimer = root.setTimeout(function () {
        detailMediaLoadingLabelTimer = null;
        if (!detailMediaProfileLoading || String(detailMediaProfileRatingKey) !== String(ratingKey)) { return; }
        detailMediaLoadingLabelVisible = true;
        if (appView === 'detail') { renderDetailMediaControls(); }
      }, 500);
    }
  }

  function queueDetailMediaProfile(detail) {
    var ratingKey = detail && detail.ratingKey;
    prepareDetailMediaProfile(detail);
    if (!ratingKey) { return; }
    detailMediaProfileTimer = root.setTimeout(function () {
      detailMediaProfileTimer = null;
      if ((appView !== 'detail' && appView !== 'player') || !currentDetail || String(currentDetail.ratingKey) !== String(ratingKey)) { return; }
      loadDetailMediaProfile(detail);
    }, 120);
  }

  function ensureDetailMediaProfile(detail) {
    var ratingKey = String(detail && detail.ratingKey || '');
    if (!ratingKey) { return; }
    if (detailMediaProfileRatingKey === ratingKey && (detailPreferenceState.snapshot().profile || detailMediaProfileLoading)) {
      renderDetailMediaControls();
      return;
    }
    queueDetailMediaProfile(detail);
  }

  function saveDetailMediaOverride() {
    if (!MediaPreferences || !currentDetail) { return; }
    detailPreferenceState.save();
    renderDetailMediaControls();
  }

  function cycleDetailTrack(kind, direction) {
    if (!selectedDetailMediaProfile()) { return; }
    detailPreferenceState.cycleTrack(kind, direction);
    renderDetailMediaControls();
  }

  function cycleDetailVersion(direction) {
    if (detailMediaVersions().length < 2) { return; }
    detailPreferenceState.cycleVersion(direction);
    renderDetailMediaControls();
  }

  function detailTrackChoices(tracks) {
    var choices = [];
    var index;
    for (index = 0; index < (tracks || []).length; index += 1) {
      choices.push({ value: String(tracks[index].id || index), label: MediaProfile.trackDisplayLabel(tracks[index], t('detail.external')), track: tracks[index] });
    }
    return choices;
  }

  function openDetailChoice(kind) {
    var profile = selectedDetailMediaProfile();
    var override = detailPreferenceState.snapshot().override;
    var resolved = resolvedDetailTracks();
    var choices = [];
    var selected = '';
    var versions;
    var automaticLabel;
    var selectedTrack;
    if (!profile) { return; }
    if (kind === 'audio') {
      automaticLabel = automaticTrackLabel(MediaProfile.trackDisplayLabel(resolved && resolved.audioTrack, t('detail.external')));
      choices = [{ value: '', label: automaticLabel, track: null }].concat(detailTrackChoices(profile.audioTracks));
      selectedTrack = override && override.audioTrack ? MediaPreferences.findTrack(profile.audioTracks, override.audioTrack, false) : null;
      selected = selectedTrack ? String(selectedTrack.id || profile.audioTracks.indexOf(selectedTrack)) : '';
    } else if (kind === 'subtitles') {
      automaticLabel = automaticTrackLabel(MediaProfile.trackDisplayLabel(resolved && resolved.subtitleTrack, t('detail.external')) || t('subtitle.off'));
      choices = [{ value: 'automatic', label: automaticLabel, track: null }, { value: 'off', label: t('subtitle.off'), track: null }].concat(detailTrackChoices(profile.subtitleTracks));
      selectedTrack = override && override.subtitleTrack ? MediaPreferences.findTrack(profile.subtitleTracks, override.subtitleTrack, false) : null;
      selected = override && override.subtitlesOff ? 'off' : (selectedTrack ? String(selectedTrack.id || profile.subtitleTracks.indexOf(selectedTrack)) : 'automatic');
    } else {
      versions = detailMediaVersions();
      choices = [{ value: 'auto', label: t('player.versionAuto') }];
      versions.forEach(function (version) { choices.push({ value: version.mediaIndex + ':' + version.partIndex, label: mediaVersionLabel(version, false) }); });
      selected = override && override.mediaIndex !== null ? override.mediaIndex + ':' + override.partIndex : 'auto';
    }
    openChoiceDialog(kind === 'audio' ? t('detail.audio') : (kind === 'subtitles' ? t('detail.subtitles') : t('detail.version')), choices, selected, function (choice) {
      var parts;
      if (kind === 'version') {
        parts = choice.value === 'auto' ? null : String(choice.value).split(':');
        detailPreferenceState.setVersion(parts ? Number(parts[0]) : null, parts ? Number(parts[1]) : null);
      } else { detailPreferenceState.setTrack(kind, choice.track || null, choice.value === 'off'); }
      renderDetailMediaControls();
    }, function () { updateDetailFocus(); });
  }

  function detailPlaybackPreferences(versionAffinity) {
    var preferences = detailPreferenceState.playbackPreferences(appSettings, activeVideoQuality());
    preferences.playbackCapabilities = {
      directPlay: playbackCapabilities.directPlay,
      codecs: playbackCapabilities.codecs.slice(),
      containers: playbackCapabilities.containers.slice(),
      uhd: playbackCapabilities.uhd,
      hdr10: playbackCapabilities.hdr10,
      dolbyVision: playbackCapabilities.dolbyVision,
      hdrKnown: playbackCapabilities.hdrKnown
    };
    if (versionAffinity) { preferences.versionAffinity = versionAffinity; }
    return preferences;
  }

  function cloudRatingKeyForDetail(detail) {
    var guid = detail && (detail.cloudGuid || detail.watchlistGuid || detail.guid) || '';
    if (detail && detail.cloudRatingKey) { return String(detail.cloudRatingKey); }
    if (/^plex:\/\//.test(guid)) { return guid.split('/').pop(); }
    return '';
  }

  function watchlistLocalKeyForDetail(detail) {
    if (!detail) { return ''; }
    return String((detail.type === 'episode' || detail.type === 'season') ? (detail.showRatingKey || detail.ratingKey || '') : (detail.ratingKey || ''));
  }

  function syncCurrentDetailWatchlist() {
    var cached;
    if (!currentDetail || !currentDetail.ratingKey) { return; }
    cached = watchlistView.findLocal(watchlistLocalKeyForDetail(currentDetail));
    currentDetail.inWatchlist = !!cached;
    if (cached) {
      currentDetail.cloudRatingKey = cached.cloudRatingKey;
      currentDetail.cloudGuid = cached.cloudGuid;
    }
  }

  function renderDetailWatchlist() {
    var button = document.getElementById('detail-watchlist');
    var watchlist = watchlistSnapshot();
    button.disabled = !watchlistAvailable() || !watchlist.provider || watchlist.loading || watchlist.mutationPending || !cloudRatingKeyForDetail(currentDetail);
    setText('detail-watchlist', currentDetail && currentDetail.inWatchlist ? t('detail.removeWatchlist') : t('detail.addWatchlist'));
  }

  function toggleCurrentWatchlist() {
    var detail = currentDetail;
    var cloudKey = cloudRatingKeyForDetail(detail);
    var enabled;
    var source;
    var local;
    var watchlist = watchlistSnapshot();
    if (!detail || !cloudKey || !watchlistAvailable() || !watchlist.provider || watchlist.mutationPending) { return; }
    enabled = !detail.inWatchlist;
    source = selectedItem && String(selectedItem.ratingKey || '') === String(detail.ratingKey || '') ? selectedItem : detail;
    detail.inWatchlist = enabled;
    renderDetailWatchlist();
    local = {};
    Object.keys(source).forEach(function (key) { local[key] = source[key]; });
    local.ratingKey = watchlistLocalKeyForDetail(detail);
    local.type = detail.type === 'episode' || detail.type === 'season' ? 'show' : detail.type;
    local.title = detail.title;
    local.meta = local.type === 'show' ? 'TV Shows' : (local.meta || 'Movie');
    local.metaKey = local.type === 'show' ? 'media.show' : 'media.movie';
    local.image = detail.image || local.image;
    local.art = detail.art || local.art;
    local.cloudGuid = detail.watchlistGuid || detail.guid || detail.cloudGuid || '';
    watchlistView.toggle(cloudKey, enabled, local, function (error) {
      if (error) {
        detail.inWatchlist = !enabled;
        renderDetailWatchlist(); showMessage(t('status.updateError')); return;
      }
      if (selectedItem) { selectedItem.inWatchlist = enabled; selectedItem.cloudRatingKey = cloudKey; }
      detail.inWatchlist = enabled; detail.cloudRatingKey = cloudKey;
      renderDetailWatchlist();
    });
  }

  function detailDisplaySubtitle(detail) {
    var subtitle = detail && detail.subtitle || '';
    if (!detail || detail.type !== 'episode') { return subtitle; }
    return subtitle.replace(/(^| - )E0*([0-9]+)( - )/, function (match, prefix, episodeNumber, separator) {
      return prefix + t('player.episode') + ' ' + Number(episodeNumber) + separator;
    });
  }

  function renderDetail(detail, deferMediaProfile) {
    var poster = document.getElementById('detail-poster');
    currentDetail = detail;
    if (selectedItem && String(selectedItem.ratingKey || '') === String(detail.ratingKey || '')) {
      if (!detail.guid && selectedItem.guid) { detail.guid = selectedItem.guid; }
      if (selectedItem.cloudRatingKey) { detail.cloudRatingKey = selectedItem.cloudRatingKey; }
      if (selectedItem.cloudGuid) { detail.cloudGuid = selectedItem.cloudGuid; }
    }
    ensureDetailPresentationView().renderMetadata(detail, detailDisplaySubtitle(detail));
    loadRenderedPoster(poster, detail.image, 0, 'detail', 360, 540);
    setText('detail-watched', detail.viewed ? t('detail.markUnwatched') : t('detail.markWatched'));
    scheduleDetailBackdrop(detail);
    scheduleTheme(detail);
    if (detail.ratingKey) {
      if (deferMediaProfile) { prepareDetailMediaProfile(detail); }
      else { queueDetailMediaProfile(detail); }
    }
    syncCurrentDetailWatchlist();
    renderDetailWatchlist();
    if (watchlistAvailable() && watchlistSnapshot().loadedIdentity !== watchlistIdentity() && !watchlistSnapshot().loading) {
      loadWatchlistData(false, function () { if (appView === 'detail' && currentDetail === detail) { syncCurrentDetailWatchlist(); renderDetailWatchlist(); } });
    }
  }

  function updateDetailSummaryOverflow() {
    ensureDetailPresentationView().updateSummaryOverflow();
  }

  function openDetailSummary() {
    ensureDetailPresentationView().openSummary();
  }

  function closeDetailSummary() {
    ensureDetailPresentationView().closeSummary();
  }

  function scrollDetailSummary(direction) {
    ensureDetailPresentationView().scrollSummary(direction);
  }

  function toggleCurrentWatched() {
    var watched;
    var item;
    var rowIndex;
    var itemIndex;
    if (!currentDetail || !currentDetail.ratingKey) { return; }
    watched = !currentDetail.viewed;
    PlexClient.setWatchedAndReset(config, currentDetail.ratingKey, watched, function (error) {
      if (error || appView !== 'detail') { showMessage(t('status.updateError')); return; }
      currentDetail.viewed = watched;
      currentDetail.viewOffset = 0;
      currentDetail.progress = 0;
      if (selectedItem && String(selectedItem.ratingKey || '') === String(currentDetail.ratingKey)) {
        selectedItem.viewed = watched; selectedItem.viewOffset = 0; selectedItem.progress = 0;
      }
      for (rowIndex = 0; rowIndex < data.rows.length; rowIndex += 1) {
        for (itemIndex = 0; itemIndex < data.rows[rowIndex].items.length; itemIndex += 1) {
          item = data.rows[rowIndex].items[itemIndex];
          if (String(item.ratingKey || '') === String(currentDetail.ratingKey)) {
            item.viewed = watched; item.viewOffset = 0; item.progress = 0;
          }
        }
      }
      setText('detail-watched', watched ? t('detail.markUnwatched') : t('detail.markWatched'));
      if (seriesContext && seriesContext.episodes[detailEpisodeIndex]) {
        seriesContext.episodes[detailEpisodeIndex].viewed = watched;
        seriesContext.episodes[detailEpisodeIndex].viewOffset = 0;
        seriesContext.episodes[detailEpisodeIndex].progress = 0;
        renderEpisodeStrip();
        updateDetailFocus();
      }
      homeRefreshCoordinator.refresh();
      if (activeLibrary) { probeLibraryContinue(); }
    });
  }

  function metadataRefreshKeys(detail) {
    if (!detail) { return []; }
    if (detail.type === 'episode') { return [detail.ratingKey, detail.seasonRatingKey, detail.showRatingKey]; }
    if (detail.type === 'season') { return [detail.ratingKey, detail.showRatingKey]; }
    return [detail.ratingKey];
  }

  function ratingKeyIndex(items, ratingKey, fallback) {
    var index;
    for (index = 0; index < (items || []).length; index += 1) {
      if (String(items[index].ratingKey || '') === String(ratingKey || '')) { return index; }
    }
    return Math.max(0, Math.min((items || []).length - 1, Number(fallback || 0)));
  }

  function currentRefreshTargetIsVisible(refreshContext) {
    return appView === 'detail' && currentDetail && String(currentDetail.ratingKey || '') === refreshContext.targetKey;
  }

  function applyReloadedSeriesContext(context, refreshContext) {
    if (!context || !currentRefreshTargetIsVisible(refreshContext)) { return; }
    seriesContext = context;
    detailSeasonIndex = ratingKeyIndex(context.seasons, refreshContext.seasonKey, detailSeasonIndex);
    detailEpisodeIndex = ratingKeyIndex(context.episodes, refreshContext.episodeKey, detailEpisodeIndex);
    ensureDetailEpisodeView().setContext(context, {
      seasonKey: context.seasons[detailSeasonIndex] && context.seasons[detailSeasonIndex].ratingKey,
      episodeKey: context.episodes[detailEpisodeIndex] && context.episodes[detailEpisodeIndex].ratingKey
    });
    updateDetailFocus();
  }

  function reloadCurrentMetadataLevel(key, refreshContext, callback) {
    if (String(key) === refreshContext.targetKey) {
      PlexClient.loadMetadata(config, refreshContext.targetKey, function (error, detail) {
        if (error) { callback(error); return; }
        refreshContext.detail = detail;
        if (currentRefreshTargetIsVisible(refreshContext)) { renderDetail(detail); }
        if (detail.type !== 'show' && detail.type !== 'season') { callback(null); return; }
        PlexClient.loadSeriesContext(config, detail, function (contextError, context) {
          if (!contextError) { applyReloadedSeriesContext(context, refreshContext); }
          callback(contextError || null);
        });
      });
      return;
    }
    PlexClient.loadSeriesContext(config, refreshContext.detail, function (error, context) {
      if (!error) { applyReloadedSeriesContext(context, refreshContext); }
      callback(error || null);
    });
  }

  function refreshCurrentMetadata() {
    var button = document.getElementById('detail-refresh-metadata');
    var currentSeason = seriesContext && seriesContext.seasons[detailSeasonIndex];
    var currentEpisode = seriesContext && seriesContext.episodes[detailEpisodeIndex];
    var refreshContext;
    if (!currentDetail || !currentDetail.ratingKey || detailRefreshPending) { return; }
    refreshContext = {
      targetKey: String(currentDetail.ratingKey),
      detail: currentDetail,
      seasonKey: currentSeason ? currentSeason.ratingKey : currentDetail.seasonRatingKey,
      episodeKey: currentEpisode ? currentEpisode.ratingKey : currentDetail.ratingKey
    };
    detailRefreshPending = true; button.disabled = true; showDetailMetadataStatus(t('status.refreshing'));
    MetadataRefresh.run({
      keys: metadataRefreshKeys(currentDetail),
      refresh: function (key, callback) { PlexClient.refreshMetadata(config, key, callback); },
      wait: function (activityId, callback) { waitForServerActivity(activityId, callback); },
      reload: function (key, callback) { reloadCurrentMetadataLevel(key, refreshContext, callback); }
    }, function (error) {
      detailRefreshPending = false; button.disabled = false;
      if (appView === 'detail' && currentDetail && String(currentDetail.ratingKey) === refreshContext.targetKey) {
        showDetailMetadataStatus(error ? t('status.updateError') : t('status.refreshComplete'), true);
      }
      if (appView === 'detail') { updateDetailFocus(); }
    });
  }

  function openDetail(item) {
    detailReturnView = appView === 'search' ? 'search' : (appView === 'library' ? 'library' : (appView === 'watchlist' ? 'watchlist' : 'home'));
    if (appView === 'search') { cancelSearchWork(true); }
    prepareDetailTransition(item);
    selectedItem = item;
    detailPlayPending = false;
    seriesContext = null;
    detailZone = 'play';
    detailActionIndex = 0;
    appView = 'detail';
    document.getElementById('detail-view').className = 'detail-view is-hidden is-awaiting-metadata';
    transitionToDetailSurface();
    renderDetail({
      type: item.type,
      title: mediaTitle(item),
      subtitle: mediaMeta(item) + (mediaDetail(item) ? ' - ' + mediaDetail(item) : ''),
      facts: '',
      summary: '',
      image: item.image,
      art: item.art || item.image
    });
    document.getElementById('detail-play').className = 'detail-action is-focused';
    document.getElementById('detail-play').focus();
    hideViewState();
    loadSelectedDetail(item);
  }

  function loadSelectedDetail(item) {
    PlexClient.loadMetadata(config, item.ratingKey, function (error, detail) {
      if (appView !== 'detail' || !selectedItem || selectedItem.ratingKey !== item.ratingKey) { return; }
      if (error || !detail) {
        showViewState('error', 'detail', function () {
          hideViewState();
          loadSelectedDetail(item);
        }, closeDetail);
        completeDetailTransition();
        return;
      }
      renderDetail(detail, true);
      hideViewState();
      animateDetailEntry();
      completeDetailTransition();
      PlexClient.loadSeriesContext(config, detail, function (seriesError, context) {
        if (appView !== 'detail' || !currentDetail || String(currentDetail.ratingKey) !== String(detail.ratingKey)) { return; }
        if (!seriesError && context) { renderSeriesContext(context, detail, completePendingDetailPlay); }
        else {
          queueDetailMediaProfile(detail);
          completePendingDetailPlay();
        }
      });
    });
  }

  function completePendingDetailPlay() {
    if (!detailPlayPending || appView !== 'detail' || !currentDetail || !currentDetail.ratingKey ||
        currentDetail.type === 'show' || currentDetail.type === 'season') { return; }
    detailPlayPending = false;
    openPlayer();
  }

  function selectedIndex(items) {
    var index;
    for (index = 0; index < items.length; index += 1) {
      if (items[index].selected) {
        return index;
      }
    }
    return 0;
  }

  function renderSeriesContext(context, detail, callback) {
    seriesContext = context;
    detailSeasonIndex = selectedIndex(context.seasons);
    detailEpisodeIndex = selectedIndex(context.episodes);
    ensureDetailEpisodeView().setContext(context);
    updateDetailFocus();
    if (detail.type !== 'episode' && context.episodes.length) {
      loadEpisodeDetail(context.episodes[detailEpisodeIndex], callback);
    } else {
      queueDetailMediaProfile(detail);
      if (callback) { callback(detail); }
    }
  }

  function renderSeasonTabs() {
    ensureDetailEpisodeView().setSeasonIndex(detailSeasonIndex, true);
  }

  function renderEpisodeStrip() {
    ensureDetailEpisodeView().setEpisodeIndex(detailEpisodeIndex, true);
  }

  function updateEpisodeCardsPlaybackState() {
    ensureDetailEpisodeView().refreshPlaybackCards();
  }

  function applyLocalPlaybackProgress(ratingKey, seconds) {
    var offset = Math.max(0, Math.round(Number(seconds || 0) * 1000));
    var episode;
    var index;
    if (!ratingKey || !offset) { return; }
    pendingDetailProgress = { ratingKey: String(ratingKey), viewOffset: offset, expiresAt: new Date().getTime() + 6000 };
    if (currentDetail && String(currentDetail.ratingKey || '') === pendingDetailProgress.ratingKey) {
      currentDetail.viewOffset = offset;
      currentDetail.progress = currentDetail.duration ? Math.min(1, offset / Number(currentDetail.duration)) : currentDetail.progress;
    }
    for (index = 0; seriesContext && index < seriesContext.episodes.length; index += 1) {
      episode = seriesContext.episodes[index];
      if (String(episode.ratingKey || '') === pendingDetailProgress.ratingKey) {
        episode.viewOffset = offset;
        episode.progress = episode.duration ? Math.min(1, offset / Number(episode.duration)) : episode.progress;
      }
    }
    updateEpisodeCardsPlaybackState();
  }

  function reconcileEpisodePlaybackState(freshEpisodes) {
    var episode;
    var fresh;
    var index;
    var freshByKey = {};
    for (index = 0; index < (freshEpisodes || []).length; index += 1) {
      freshByKey[String(freshEpisodes[index].ratingKey || '')] = freshEpisodes[index];
    }
    for (index = 0; seriesContext && index < seriesContext.episodes.length; index += 1) {
      episode = seriesContext.episodes[index];
      fresh = freshByKey[String(episode.ratingKey || '')];
      if (!fresh) { continue; }
      if (pendingDetailProgress && pendingDetailProgress.expiresAt > new Date().getTime() &&
          String(fresh.ratingKey || '') === pendingDetailProgress.ratingKey) {
        if (Number(fresh.viewOffset || 0) + 2000 < pendingDetailProgress.viewOffset) {
          fresh.viewOffset = pendingDetailProgress.viewOffset;
          fresh.progress = fresh.duration ? Math.min(1, fresh.viewOffset / Number(fresh.duration)) : fresh.progress;
        } else {
          pendingDetailProgress = null;
        }
      }
      if (currentDetail && String(currentDetail.ratingKey || '') === String(episode.ratingKey || '')) {
        currentDetail.viewed = fresh.viewed;
        currentDetail.viewOffset = fresh.viewOffset;
        currentDetail.duration = fresh.duration;
        currentDetail.progress = fresh.progress;
        setText('detail-watched', fresh.viewed ? t('detail.markUnwatched') : t('detail.markWatched'));
      }
    }
    ensureDetailEpisodeView().reconcilePlayback(freshEpisodes);
  }

  function refreshEpisodePlaybackState(ratingKey, expectedSeconds, retried) {
    var season;
    var seasonKey;
    if (appView !== 'detail' || !seriesContext || !seriesContext.seasons.length) { return; }
    season = seriesContext.seasons[detailSeasonIndex];
    seasonKey = season && String(season.ratingKey || '');
    if (!seasonKey) { return; }
    PlexClient.loadSeasonEpisodes(config, seasonKey, ratingKey || '', function (error, episodes) {
      var activeSeason = seriesContext && seriesContext.seasons[detailSeasonIndex];
      if (error || appView !== 'detail' || !activeSeason || String(activeSeason.ratingKey || '') !== seasonKey) { return; }
      reconcileEpisodePlaybackState(episodes);
      updateEpisodeCardsPlaybackState();
      if (!retried && pendingDetailProgress && String(pendingDetailProgress.ratingKey) === String(ratingKey || '') &&
          pendingDetailProgress.expiresAt > new Date().getTime()) {
        root.setTimeout(function () { refreshEpisodePlaybackState(ratingKey, expectedSeconds, true); }, 650);
      }
    });
  }

  function startEpisodeTitlePan(card) {
    ensureDetailEpisodeView().startTitlePan(card);
  }

  function loadEpisodeDetail(episode, callback, animateSeason) {
    var token = ++episodeDetailToken;
    var ratingKey = String(episode && episode.ratingKey || '');
    PlexClient.loadMetadata(config, episode.ratingKey, function (error, detail) {
      var selectedEpisode = seriesContext && seriesContext.episodes[detailEpisodeIndex];
      if (!error && appView === 'detail' && token === episodeDetailToken &&
          (!selectedEpisode || String(selectedEpisode.ratingKey || '') === ratingKey)) {
        if (animateSeason) { seasonTransitionMediaKey = ratingKey; }
        renderDetail(detail);
        if (animateSeason) {
          animateSeasonContent('detail-copy');
        }
        if (callback) { callback(detail); }
      }
    });
  }

  function playSelectedEpisode(episode) {
    loadEpisodeDetail(episode, function () {
      renderEpisodeStrip();
      openPlayer();
    });
  }

  function playHomeDetail(detail) {
    detailReturnView = appView === 'search' ? 'search' : (appView === 'library' ? 'library' : (appView === 'watchlist' ? 'watchlist' : 'home'));
    if (appView === 'search') { cancelSearchWork(true); }
    currentDetail = detail;
    seriesContext = null;
    appView = 'detail';
    setDetailViewMode(true);
    document.getElementById('content').style.display = 'none';
    document.getElementById('search-view').className = 'search-view is-hidden';
    document.getElementById('library-view').className = 'library-view is-hidden';
    document.getElementById('watchlist-view').className = 'watchlist-view is-hidden';
    document.getElementById('detail-view').className = 'detail-view';
    renderDetail(detail);
    PlexClient.loadSeriesContext(config, detail, function (error, context) {
      if (appView !== 'detail') { return; }
      if (detail.type === 'show' && (error || !context)) {
        showMessage(t('status.mediaUnavailable'));
        return;
      }
      if (!error && context) {
        if (detail.type === 'show' && !context.episodes.length) {
          showMessage(t('status.mediaUnavailable'));
          return;
        }
        renderSeriesContext(context, detail, function () { openPlayer(); });
        return;
      }
      openPlayer();
    });
  }

  function playHomeItem(item) {
    if (!item || !item.ratingKey) { return; }
    if (item.type === 'season') {
      PlexClient.loadSeasonEpisodes(config, item.ratingKey, '', function (error, episodes) {
        if (error || !episodes.length || (appView !== 'home' && appView !== 'search' && appView !== 'library' && appView !== 'watchlist')) { showMessage(t('status.mediaUnavailable')); return; }
        detailEpisodeIndex = selectedIndex(episodes);
        PlexClient.loadMetadata(config, episodes[detailEpisodeIndex].ratingKey, function (metadataError, detail) {
          if (metadataError || (appView !== 'home' && appView !== 'search' && appView !== 'library' && appView !== 'watchlist')) { showMessage(t('status.mediaUnavailable')); return; }
          playHomeDetail(detail);
        });
      });
      return;
    }
    PlexClient.loadMetadata(config, item.ratingKey, function (error, detail) {
      if (error || (appView !== 'home' && appView !== 'search' && appView !== 'library' && appView !== 'watchlist')) { showMessage(t('status.mediaUnavailable')); return; }
      playHomeDetail(detail);
    });
  }

  function scheduleEpisodeDetail() {
    root.clearTimeout(detailMetadataTimer);
    detailMetadataTimer = root.setTimeout(function () {
      if (seriesContext && seriesContext.episodes[detailEpisodeIndex]) {
        loadEpisodeDetail(seriesContext.episodes[detailEpisodeIndex], null, true);
      }
    }, 180);
  }

  function navigateDetail(direction) {
    var choiceZones = detailChoiceZones();
    var presentation = detailPresentationSnapshot();
    var result;
    detailNavigation.set({ zone: detailZone, actionIndex: detailActionIndex, seasonIndex: detailSeasonIndex, episodeIndex: detailEpisodeIndex });
    result = detailNavigation.navigate(direction, {
      hasSeries: !!seriesContext,
      actionCount: 5,
      seasonCount: seriesContext ? seriesContext.seasons.length : 0,
      episodeCount: seriesContext ? seriesContext.episodes.length : 0,
      choiceZones: choiceZones,
      summaryOverflowing: presentation.summaryOverflowing,
      mediaInfoOverflowing: presentation.mediaInfoOverflowing
    });
    detailZone = result.state.zone;
    detailActionIndex = result.state.actionIndex;
    detailSeasonIndex = result.state.seasonIndex;
    detailEpisodeIndex = result.state.episodeIndex;
    if (result.effect === 'nav-left' || result.effect === 'nav-right') {
      state.navIndex = result.effect === 'nav-left' ? Math.max(0, state.navIndex - 1) : Math.min(navigationFocusCount() - 1, state.navIndex + 1);
      scheduleNavigationPreview(state.navIndex);
    } else if (result.effect === 'season-preview') {
      renderSeasonTabs(); scheduleSeasonPreview();
    } else if (result.effect === 'episode-preview') {
      ensureDetailEpisodeView().setEpisodeIndex(detailEpisodeIndex, false);
      ensureDetailEpisodeView().refreshSelection();
      scheduleEpisodeDetail();
    } else if (result.effect.indexOf('cycle-') === 0) {
      if (detailZone === 'version') { cycleDetailVersion(direction === 'left' ? -1 : 1); }
      else { cycleDetailTrack(detailZone, direction === 'left' ? -1 : 1); }
    }
    updateDetailFocus();
  }

  function scheduleSeasonPreview() {
    var token;
    root.clearTimeout(seasonPreviewTimer);
    seasonPreviewToken += 1;
    token = seasonPreviewToken;
    seasonPreviewTimer = root.setTimeout(function () {
      var seasonIndex = detailSeasonIndex;
      if (appView !== 'detail' || detailZone !== 'seasons' || token !== seasonPreviewToken) { return; }
      var season = seriesContext.seasons[seasonIndex];
      PlexClient.loadSeasonEpisodes(config, season.ratingKey, '', function (error, episodes) {
        var index;
        if (error || appView !== 'detail' || detailZone !== 'seasons' || token !== seasonPreviewToken || seasonIndex !== detailSeasonIndex) { return; }
        for (index = 0; index < seriesContext.seasons.length; index += 1) {
          seriesContext.seasons[index].selected = index === seasonIndex;
        }
        seriesContext.episodes = episodes;
        detailEpisodeIndex = selectedIndex(episodes);
        ensureDetailEpisodeView().setEpisodes(episodes, episodes[detailEpisodeIndex] && episodes[detailEpisodeIndex].ratingKey);
        renderSeasonTabs();
        renderEpisodeStrip();
        animateSeasonContent('episode-strip');
        updateDetailFocus();
        if (episodes.length) { loadEpisodeDetail(episodes[detailEpisodeIndex], null, true); }
      });
    }, 200);
  }

  function loadSelectedSeason() {
    var season = seriesContext.seasons[detailSeasonIndex];
    PlexClient.loadSeasonEpisodes(config, season.ratingKey, '', function (error, episodes) {
      var index;
      if (error || appView !== 'detail') {
        return;
      }
      for (index = 0; index < seriesContext.seasons.length; index += 1) {
        seriesContext.seasons[index].selected = index === detailSeasonIndex;
      }
      seriesContext.episodes = episodes;
      detailEpisodeIndex = selectedIndex(episodes);
      ensureDetailEpisodeView().setEpisodes(episodes, episodes[detailEpisodeIndex] && episodes[detailEpisodeIndex].ratingKey);
      detailZone = 'episodes';
      renderSeasonTabs();
      renderEpisodeStrip();
      updateDetailFocus();
      if (episodes.length) {
        animateSeasonContent('episode-strip');
        loadEpisodeDetail(episodes[detailEpisodeIndex], null, true);
      }
    });
  }

  function updateDetailFocus() {
    var target;
    clearLogicalFocus();
    if (detailZone === 'nav') {
      target = document.querySelector(selectorForNavIndex(state.navIndex));
    } else if (detailZone === 'seasons') {
      target = document.querySelector('[data-season-position="' + detailSeasonIndex + '"]');
    } else if (detailZone === 'episodes') {
      target = document.querySelector('[data-episode-position="' + detailEpisodeIndex + '"]');
    } else if (detailZone === 'audio') {
      target = document.getElementById('detail-audio');
    } else if (detailZone === 'subtitles') {
      target = document.getElementById('detail-subtitles');
    } else if (detailZone === 'version') {
      target = document.getElementById('detail-version');
    } else if (detailZone === 'summary') {
      target = document.getElementById('detail-summary-button');
    } else if (detailZone === 'media-info') {
      target = document.getElementById('detail-media-info-button');
    } else {
      target = document.getElementById(['detail-play', 'detail-watched', 'detail-watchlist', 'detail-refresh-metadata', 'detail-file-info'][detailActionIndex]);
    }
    if (target) {
      target.className += ' is-focused';
      if (!pointerSelectionActive) { target.focus(); }
    }
    startEpisodeTitlePan(target);
  }
  // Player clock, progress, controls, chapters, tracks, and summaries.
  function sendPlayerTimeline(stateName) {
    var absoluteTime = playerAbsoluteTime();
    if (!PlayerTimelinePolicy.shouldReport({
      hasPlayback: !!currentPlayback,
      suppressed: playerTimelineSuppressed,
      position: absoluteTime
    })) { return; }
    PlexClient.sendTimeline(config, currentPlayback, stateName, absoluteTime * 1000);
  }

  function sendFinalPlayerTimeline(callback) {
    var playback = currentPlayback;
    var absoluteTime = playerAbsoluteTime();
    if (!PlayerTimelinePolicy.shouldReport({
      hasPlayback: !!playback,
      suppressed: playerTimelineSuppressed,
      position: absoluteTime
    })) {
      callback(absoluteTime, false);
      return;
    }
    PlexClient.sendTimeline(config, playback, 'stopped', absoluteTime * 1000, function () { callback(absoluteTime, true); });
  }

  function stopTranscodeKeepalive() {
    root.clearInterval(transcodeKeepaliveTimer);
    transcodeKeepaliveTimer = null;
  }

  function startTranscodeKeepalive() {
    var playback = currentPlayback;
    stopTranscodeKeepalive();
    if (!playback || !playback.transcodeSession || playback.options.delivery === 'direct-play') { return; }
    PlexClient.pingTranscode(config, playback);
    transcodeKeepaliveTimer = root.setInterval(function () {
      if (appView !== 'player' || currentPlayback !== playback) {
        stopTranscodeKeepalive();
        return;
      }
      PlexClient.pingTranscode(config, playback);
    }, 30000);
  }

  function anchorPlayerClock(absoluteTime, frozen) {
    root.clearTimeout(playerClockRepairTimer);
    root.clearTimeout(playerClockRepairFallbackTimer);
    playerClockRepairTimer = null;
    playerClockRepairFallbackTimer = null;
    playerNativeSeekPending = false;
    playerNativeSeekTarget = null;
    root.clearTimeout(playerNativeSeekVerificationTimer);
    playerNativeSeekVerificationTimer = null;
    playbackClock = PlaybackClock.anchor(playbackClock, absoluteTime);
    playbackClock = PlaybackClock.freeze(playbackClock, !!frozen);
  }

  function armNativeSeekVerification(absoluteTarget, nativeTarget) {
    root.clearTimeout(playerNativeSeekVerificationTimer);
    playerNativeSeekTarget = nativeTarget;
    playerNativeSeekVerificationTimer = root.setTimeout(function () {
      playerNativeSeekVerificationTimer = null;
      if (!playerNativeSeekPending || appView !== 'player' || !currentPlayback) { return; }
      playerNativeSeekPending = false;
      playerNativeSeekTarget = null;
      rebuildCurrentStream(absoluteTarget, false);
    }, 5000);
  }

  function schedulePlayerClockRepair() {
    if (playerClockRepairTimer || playerClockRepairFallbackTimer || playerBuffering || playerStreamSwitching || playerNativeSeekPending) { return; }
    playerClockRepairTimer = root.setTimeout(function () {
      var video = document.getElementById('player-video');
      var observation;
      var target;
      if (appView !== 'player' || !currentPlayback || playerBuffering || playerStreamSwitching || playerNativeSeekPending) {
        playerClockRepairTimer = null;
        return;
      }
      observation = PlaybackClock.observe(playbackClock, Number(currentPlayback.offsetBase || 0), Number(video.currentTime || 0), false);
      playbackClock = observation.state;
      playerClockRepairTimer = null;
      if (!observation.desynced) { return; }
      target = observation.time;
      if (PlayerSeekController.repair() === 'rebuild') {
        rebuildCurrentStream(target, false);
        return;
      }
    }, 400);
  }

  function playerAbsoluteTime() {
    var video = document.getElementById('player-video');
    var observation;
    if (!currentPlayback) { return 0; }
    if (playerStreamSwitching || playerBuffering || playerNativeSeekPending) { return PlaybackClock.position(playbackClock); }
    observation = PlaybackClock.observe(playbackClock, Number(currentPlayback.offsetBase || 0), Number(video.currentTime || 0), false);
    playbackClock = observation.state;
    if (observation.desynced) { schedulePlayerClockRepair(); }
    return observation.time;
  }

  function ensurePlayerControlsView() {
    if (!playerControlsView) { playerControlsView = PlayerControlsView.create({ document: document, setText: setText }); }
    return playerControlsView;
  }

  function setPlayerLoading(loading, preserveFrame) {
    ensurePlayerControlsView().renderLoading(loading, preserveFrame);
  }

  var playerBufferingIndicator = PlayerBufferingIndicator.create({
    root: root,
    isEligible: function () {
      var video = document.getElementById('player-video');
      return appView === 'player' && !!currentPlayback && !playerStreamSwitching && !playerNativeSeekPending && !video.paused;
    },
    position: function () { return Number(document.getElementById('player-video').currentTime || 0); },
    onShow: function () {
      playerBuffering = true;
      playbackClock = PlaybackClock.freeze(playbackClock, true);
      setPlayerLoading(true, true);
    },
    onHide: function () {
      playerBuffering = false;
      playbackClock = PlaybackClock.freeze(playbackClock, false);
      setPlayerLoading(false);
    }
  });

  function resumeRebuiltStream() {
    root.clearTimeout(playerResumeTimer);
    playerResumeTimer = root.setTimeout(function () {
      var video = document.getElementById('player-video');
      if (appView !== 'player' || video.readyState < 2) { return; }
      if (pendingPlaybackRestore && pendingPlaybackRestore.paused) {
        playerStreamSwitching = false;
        playerBuffering = false;
        playbackClock = PlaybackClock.freeze(playbackClock, false);
        video.pause();
        setPlayerLoading(false);
        setText('player-status', t('status.paused'));
        restartTimelineAfterSubtitleRestore();
        updatePlayerDisplay();
        return;
      }
      playerStreamSwitching = false;
      try { video.play(); } catch (error) { return; }
      playerResumeTimer = root.setTimeout(function () {
        if (appView === 'player' && video.paused && video.readyState >= 2) {
          try { video.play(); } catch (error) { return; }
        }
      }, 250);
    }, 120);
  }

  function updatePlayerDisplay() {
    var video = document.getElementById('player-video');
    var duration = currentPlayback ? currentPlayback.duration / 1000 : video.duration;
    var displayTime = playerDisplayTime();
    ensurePlayerControlsView().renderProgress({
      progress: duration ? displayTime / duration * 100 : 0,
      currentTime: formatTime(displayTime), duration: formatTime(duration), paused: video.paused,
      playLabel: t('player.play'), pauseLabel: t('player.pause')
    });
    updateSkipPrompt();
  }

  function playerSkipMarkerClass(hidden) {
    var className = 'player-skip-marker';
    if (playerControlsMode === 'full') { className += ' is-controls-full'; }
    else if (playerControlsMode === 'timeline') { className += ' is-controls-timeline'; }
    if (hidden) { className += ' is-hidden'; }
    else if (playerZone === 'skip') { className += ' is-focused'; }
    return className;
  }

  function resetSkipPrompt() {
    root.clearTimeout(skipPromptTimer);
    skipPromptTimer = null;
    skipPromptTimerDeadline = 0;
    skipMarkerState = SkipMarkerState.create();
    document.getElementById('player-skip-marker').className = playerSkipMarkerClass(true);
    if (playerZone === 'skip') { playerZone = 'buttons'; playerButtonIndex = 1; }
  }

  function scheduleSkipPromptExpiry() {
    var delay;
    if (!skipMarkerState.visible || skipMarkerState.mode !== 'timed') {
      root.clearTimeout(skipPromptTimer);
      skipPromptTimer = null;
      skipPromptTimerDeadline = 0;
      return;
    }
    if (skipPromptTimer && skipPromptTimerDeadline === skipMarkerState.deadline) { return; }
    root.clearTimeout(skipPromptTimer);
    skipPromptTimerDeadline = skipMarkerState.deadline;
    delay = Math.max(0, skipMarkerState.deadline - new Date().getTime());
    skipPromptTimer = root.setTimeout(function () {
      skipPromptTimer = null;
      skipPromptTimerDeadline = 0;
      updateSkipPrompt();
    }, delay + 20);
  }

  function renderSkipPrompt() {
    var button = document.getElementById('player-skip-marker');
    var requestedFocus = skipMarkerState.focusRequested;
    if (!skipMarkerState.visible || !skipMarkerState.marker) {
      button.className = playerSkipMarkerClass(true);
      if (playerZone === 'skip') {
        playerZone = 'buttons';
        playerButtonIndex = 1;
        if (playerControlsVisible) { updatePlayerButtonFocus(); }
      }
      scheduleSkipPromptExpiry();
      return;
    }
    setText('player-skip-marker', t(skipMarkerState.marker.type === 'intro' ? 'player.skipIntro' : 'player.skipCredits'));
    if (requestedFocus) {
      skipMarkerState = SkipMarkerState.clearFocusRequest(skipMarkerState);
      playerZone = 'skip';
    }
    button.className = playerSkipMarkerClass(false);
    if (requestedFocus) { updatePlayerButtonFocus(); }
    scheduleSkipPromptExpiry();
  }

  function updateSkipPrompt() {
    var timeOffset;
    var marker;
    if (!currentPlayback || appView !== 'player') { return; }
    timeOffset = playerAbsoluteTime() * 1000;
    marker = SkipMarkerState.activeMarker(currentPlayback.markers, timeOffset);
    skipMarkerState = SkipMarkerState.update(
      skipMarkerState,
      currentPlayback.markers,
      timeOffset,
      new Date().getTime(),
      appSettings.skipPromptDuration
    );
    if (marker && playerControlsVisible) {
      skipMarkerState = SkipMarkerState.showForControls(skipMarkerState, marker);
    }
    renderSkipPrompt();
  }

  function showSkipPromptForControls() {
    var marker;
    if (!currentPlayback) { return; }
    marker = SkipMarkerState.activeMarker(currentPlayback.markers, playerAbsoluteTime() * 1000);
    if (!marker) { updateSkipPrompt(); return; }
    skipMarkerState = SkipMarkerState.showForControls(skipMarkerState, marker);
    renderSkipPrompt();
  }

  function hideSkipPromptWithControls() {
    skipMarkerState = SkipMarkerState.hideWithControls(skipMarkerState);
    renderSkipPrompt();
  }

  function dismissSkipPrompt() {
    skipMarkerState = SkipMarkerState.dismiss(skipMarkerState);
    renderSkipPrompt();
  }

  function activateSkipMarker() {
    var marker = skipMarkerState.marker;
    if (!skipMarkerState.visible || !marker) { return; }
    dismissSkipPrompt();
    seekPlayerTo(Number(marker.endTimeOffset) / 1000);
  }

  function updateEstimatedEndTime() {
    var duration;
    var remaining;
    var end;
    var hours;
    var minutes;
    if (!currentPlayback || appView !== 'player') { setText('player-end-time', ''); return; }
    duration = currentPlayback.duration / 1000;
    remaining = Math.max(0, duration - playerAbsoluteTime());
    end = new Date(new Date().getTime() + remaining * 1000);
    hours = String(end.getHours());
    minutes = String(end.getMinutes());
    setText('player-end-time', t('player.endsAt', {
      time: (hours.length < 2 ? '0' : '') + hours + ':' + (minutes.length < 2 ? '0' : '') + minutes
    }));
  }

  function startEstimatedEndTimer() {
    root.clearInterval(estimatedEndTimer);
    updateEstimatedEndTime();
    estimatedEndTimer = root.setInterval(updateEstimatedEndTime, 10000);
  }

  function schedulePlayerControlsTimeout() {
    var delay = PlayerControlsState.timeout(playerControlsMode);
    root.clearTimeout(playerControlsTimer);
    if (!delay) { return; }
    playerControlsTimer = root.setTimeout(function () {
      if (appView === 'player' && !settingsOpen && !playlistQueueDrawerOpen) { hidePlayerControls(false); }
    }, delay);
  }

  function playerChapters() {
    return currentPlayback && currentPlayback.chapters ? currentPlayback.chapters : [];
  }

  function ensurePlayerChaptersView() {
    if (!playerChaptersView) {
      playerChaptersView = PlayerChaptersView.create({
        document: document, element: element, t: t, formatTime: formatTime,
        pointerActive: function () { return pointerSelectionActive; },
        ProgressiveImages: ProgressiveImages, posterLoader: posterLoader
      });
    }
    return playerChaptersView;
  }

  function chapterHintVisible() {
    return appView === 'player' && playerControlsMode === 'full' && playerChapters().length > 0 && !chapterState.open;
  }

  function renderChapterHint() {
    var visible = chapterHintVisible();
    if (!visible && playerZone === 'chapter-hint') { playerZone = 'buttons'; playerButtonIndex = 1; }
    ensurePlayerChaptersView().renderHint(visible, visible && playerZone === 'chapter-hint');
  }

  function updateChapterFocus() {
    ensurePlayerChaptersView().updateFocus(chapterState.index, chapterState.open);
  }

  function renderChapterDrawer() {
    ensurePlayerChaptersView().render(playerChapters(), chapterState);
  }

  function openChapterDrawer() {
    var chapters = playerChapters();
    if (!chapters.length) { return; }
    showPlayerControls();
    chapterState = ChapterState.open(chapterState, chapters, playerAbsoluteTime() * 1000);
    playerZone = 'chapters';
    renderChapterHint();
    renderChapterDrawer();
    schedulePlayerControlsTimeout();
  }

  function closeChapterDrawer(restoreFocus) {
    if (!chapterState.open) { return; }
    chapterState = ChapterState.close(chapterState);
    ensurePlayerChaptersView().close();
    playerZone = 'buttons';
    playerButtonIndex = 1;
    renderChapterHint();
    if (restoreFocus) {
      updatePlayerButtonFocus();
      ensurePlayerChaptersView().markHintReturning();
      schedulePlayerControlsTimeout();
    }
  }

  function resetChapterDrawer() {
    chapterState = ChapterState.create();
    ensurePlayerChaptersView().reset();
  }

  function activateChapter() {
    var selection = ChapterState.select(chapterState, playerChapters());
    if (!selection.chapter || selection.seekSeconds === null) { return; }
    seekPlayerTo(selection.seekSeconds);
    closeChapterDrawer(true);
    chapterState = selection.state;
  }

  function applyPlayerControlsMode(mode) {
    playerControlsMode = mode;
    playerControlsVisible = PlayerControlsState.visible(mode);
    ensurePlayerControlsView().renderMode(mode);
    renderChapterHint();
    schedulePlayerControlsTimeout();
  }

  function showPlayerControls() {
    var previousMode = playerControlsMode;
    applyPlayerControlsMode('full');
    playerBackArmed = false;
    if (previousMode !== 'full') { showSkipPromptForControls(); }
    else { renderSkipPrompt(); }
  }

  function showPlayerTimeline() {
    applyPlayerControlsMode('timeline');
    playerBackArmed = false;
    renderSkipPrompt();
  }

  function initializePlayerControlsHidden() {
    root.clearTimeout(playerControlsTimer);
    playerControlsMode = 'hidden';
    playerControlsVisible = false;
    playerBackArmed = false;
    controlsHiddenAt = 0;
    ensurePlayerControlsView().renderMode('hidden');
    resetChapterDrawer();
    closePlaylistQueueDrawer(false);
  }

  function hidePlayerControls(manual) {
    root.clearTimeout(playerControlsTimer);
    closeChapterDrawer(false);
    playerControlsMode = PlayerControlsState.next(playerControlsMode, 'hide');
    playerControlsVisible = false;
    playerBackArmed = !!manual;
    controlsHiddenAt = new Date().getTime();
    ensurePlayerControlsView().renderMode('hidden');
    renderChapterHint();
    hideSkipPromptWithControls();
  }

  function handlePlayerBack() {
    if (autoplayVisible) { cancelAutoplayCountdown(); return; }
    if (chapterState.open) { closeChapterDrawer(true); return; }
    if (settingsOpen) { setSettingsOpen(false); showPlayerControls(); return; }
    if (playerControlsVisible) { hidePlayerControls(true); return; }
    if (skipMarkerState.visible) { dismissSkipPrompt(); return; }
    if (playerBackArmed) { closePlayer(); return; }
    if (new Date().getTime() - controlsHiddenAt < 1000) { return; }
    closePlayer();
  }

  function playerButtonAvailable(index) {
    return ensurePlayerControlsView().buttonAvailable(index);
  }

  function updatePlayerButtonFocus() {
    var buttons = document.querySelectorAll('.player-button');
    var skipButton = document.getElementById('player-skip-marker');
    var chapterHint = document.getElementById('player-chapters-hint');
    var index;
    document.getElementById('player-timeline-button').className = 'player-timeline-button' + (playerZone === 'timeline' ? ' is-focused' : '');
    skipButton.className = playerSkipMarkerClass(!skipMarkerState.visible);
    renderChapterHint();
    for (index = 0; index < buttons.length; index += 1) {
      buttons[index].className = buttons[index].className.replace(/\s*is-focused/g, '') + (playerZone === 'buttons' && index === playerButtonIndex ? ' is-focused' : '');
    }
    if (playerZone === 'chapters') { updateChapterFocus(); }
    else if (playerZone === 'chapter-hint' && chapterHintVisible()) { chapterHint.focus(); }
    else if (playerZone === 'skip' && skipMarkerState.visible) { skipButton.focus(); }
    else if (playerZone === 'timeline') { document.getElementById('player-timeline-button').focus(); }
    else { buttons[playerButtonIndex].focus(); }
  }

  function updateEpisodeCommands() {
    var context = episodeNavigationContext();
    ensurePlayerControlsView().renderEpisodeCommands(!!context && episodeResolver.canMove(context, -1), !!context && episodeResolver.canMove(context, 1));
  }

  function episodeNavigationContext() {
    if (!seriesContext || !seriesContext.seasons || !seriesContext.episodes) { return null; }
    return {
      seasons: seriesContext.seasons,
      seasonIndex: detailSeasonIndex,
      episodes: seriesContext.episodes,
      episodeIndex: detailEpisodeIndex
    };
  }

  function movePlayerButton(direction) {
    var buttons = document.querySelectorAll('.player-button');
    var next = playerButtonIndex;
    do { next += direction; } while (next >= 0 && next < buttons.length && !playerButtonAvailable(next));
    if (next >= 0 && next < buttons.length) { playerButtonIndex = next; }
    updatePlayerButtonFocus();
  }

  function seekPlayer(direction) {
    var step = seekRepeatCount >= 10 ? 60 : (seekRepeatCount >= 4 ? 30 : 10);
    seekRepeatCount += 1;
    seekPlayerTo(playerDisplayTime() + direction * step);
  }

  function trackLabel(tracks, id, offLabel) {
    var index;
    if (!id) { return offLabel; }
    for (index = 0; index < tracks.length; index += 1) {
      if (tracks[index].id === id) { return MediaProfile.trackDisplayLabel(tracks[index], t('detail.external')); }
    }
    return offLabel;
  }

  function formatSignedSubtitleOffset(offsetMs) {
    var offset = Math.round(Number(offsetMs || 0));
    return (offset > 0 ? '+' : '') + offset + ' ms';
  }

  function subtitleTrackLabelWithOffset() {
    var track = trackForId(currentPlayback.subtitleTracks, currentPlayback.options.subtitleStreamID);
    var label = trackLabel(currentPlayback.subtitleTracks, currentPlayback.options.subtitleStreamID, t('subtitle.off'));
    var offset = subtitleOffsetFor(track);
    return offset ? label + ' \u00b7 ' + formatSignedSubtitleOffset(offset) : label;
  }

  function playerSettingDisabled(settingKey, advanced) {
    var audioTracks = currentPlayback.audioTracks || [];
    var subtitleTracks = currentPlayback.subtitleTracks || [];
    var mediaVersions = currentPlayback.mediaVersions || [];
    if (settingKey === 'audio') { return audioTracks.length < 2; }
    if (settingKey === 'subtitles') { return subtitleTracks.length === 0; }
    if (settingKey === 'size') { return subtitleTracks.length === 0 || !currentPlayback.options.subtitleStreamID; }
    if (settingKey === 'subtitle-advanced') { return !advanced.enabled; }
    if (settingKey === 'version') { return mediaVersions.length < 2; }
    return false;
  }

  function playerSettingRows() {
    return document.querySelectorAll('.setting-row, .playback-info');
  }

  function movePlayerSetting(direction) {
    var rows = playerSettingRows();
    var next = settingIndex;
    do { next += direction; } while (next >= 0 && next < rows.length && rows[next].disabled);
    if (next >= 0 && next < rows.length) { settingIndex = next; }
    updateSettingsDisplay();
  }

  function updateSettingsDisplay() {
    var rows = playerSettingRows();
    var advanced = subtitleEditorAvailability();
    var disabled;
    var next;
    var settingKey;
    var index;
    setText('setting-audio', trackLabel(currentPlayback.audioTracks, currentPlayback.options.audioStreamID, t('player.automatic')));
    setText('setting-subtitles', subtitleTrackLabelWithOffset());
    setText('setting-size', currentPlayback.options.subtitleSize + '%');
    setText('setting-subtitle-advanced', t(advanced.enabled ? 'player.subtitleAvailable' : 'player.subtitleUnsupported'));
    setText('setting-version', mediaVersionLabelForPlayback());
    setText('setting-quality', videoQualityLabel(currentPlayback.requestedVideoQuality || currentPlayback.options.videoQuality));
    setText('setting-playback-mode', playbackPreferenceLabel(currentPlayback.requestedPlaybackMode || currentPlayback.options.playbackMode));
    renderPlayerPlaybackSummary();
    renderPlaybackInfo();
    for (index = 0; index < rows.length; index += 1) {
      settingKey = rows[index].getAttribute('data-setting');
      disabled = playerSettingDisabled(settingKey, advanced);
      rows[index].disabled = disabled;
      rows[index].className = (settingKey === 'media-info' ? 'playback-info' : 'setting-row') +
        (!disabled && settingKey !== 'subtitle-advanced' && settingKey !== 'media-info' ? ' is-cycle' : '') +
        (disabled ? ' is-disabled' : '');
    }
    if (!rows[settingIndex] || rows[settingIndex].disabled) {
      next = 0;
      while (next < rows.length && rows[next].disabled) { next += 1; }
      settingIndex = Math.min(next, rows.length - 1);
    }
    for (index = 0; index < rows.length; index += 1) {
      if (index === settingIndex && !rows[index].disabled) { rows[index].className += ' is-focused'; }
    }
    if (rows[settingIndex] && !rows[settingIndex].disabled) { rows[settingIndex].focus(); }
  }

  function formatFileSize(bytes) {
    var value = Number(bytes || 0);
    if (!value) { return t('player.unavailable'); }
    if (value >= 1073741824) { return (value / 1073741824).toFixed(2) + ' GB'; }
    if (value >= 1048576) { return (value / 1048576).toFixed(1) + ' MB'; }
    return Math.round(value / 1024) + ' KB';
  }

  function playbackModeLabel(mode) {
    var keys = {
      'direct-play': 'player.directPlay',
      'direct-stream': 'player.directStream',
      'transcode-audio': 'player.transcodeAudio',
      'transcode-video': 'player.transcodeVideo',
      'transcode-audio-video': 'player.transcodeAudioVideo'
    };
    return t(keys[mode] || 'player.unavailable');
  }

  function compactPlaybackModeLabel(mode) {
    if (mode === 'direct-play') { return t('player.directShort'); }
    if (mode === 'direct-stream') { return t('player.directShort'); }
    if (mode === 'transcode-audio' || mode === 'transcode-video' || mode === 'transcode-audio-video') { return t('player.transcodeShort'); }
    return t('player.unavailable');
  }

  function renderPlayerPlaybackSummary() {
    if (!currentPlayback) {
      setText('player-track-audio', t('player.unavailable'));
      setText('player-track-subtitles', t('subtitle.off'));
      setText('player-quality', '');
      setText('player-delivery-mode', '');
      return;
    }
    setText('player-track-audio', trackLabel(currentPlayback.audioTracks, currentPlayback.options.audioStreamID, t('player.automatic')));
    setText('player-track-subtitles', subtitleTrackLabelWithOffset());
    setText('player-quality', t('player.quality') + ': ' + videoQualityLabel(currentPlayback.options.videoQuality));
    setText('player-connection-route', connectionRouteLabel());
    setText('player-delivery-mode', compactPlaybackModeLabel(currentPlayback.playbackMode));
  }

  function renderPlaybackInfo() {
    var fileNode;
    var sourceParts;
    var dynamicRange;
    var isTranscoded;
    if (!currentPlayback) { return; }
    setText('playback-info-file', currentPlayback.fileName || t('player.unavailable'));
    setText('playback-info-size', formatFileSize(currentPlayback.fileSize));
    sourceParts = [];
    if (currentPlayback.sourceWidth && currentPlayback.sourceHeight) { sourceParts.push(currentPlayback.sourceWidth + 'x' + currentPlayback.sourceHeight); }
    if (currentPlayback.originalVideoCodec) { sourceParts.push(String(currentPlayback.originalVideoCodec).toUpperCase()); }
    if (currentPlayback.originalContainer) { sourceParts.push(String(currentPlayback.originalContainer).toUpperCase()); }
    dynamicRange = String(currentPlayback.videoDynamicRange || '');
    if (dynamicRange) { sourceParts.push(dynamicRange); }
    setText('playback-info-source', sourceParts.join(' / ') || t('player.unavailable'));
    isTranscoded = currentPlayback.playbackMode === 'transcode-audio-video' || currentPlayback.playbackMode === 'transcode-video';
    setText('playback-info-hdr', dynamicRange ? t(isTranscoded ? 'player.hdrTranscoded' : 'player.hdrDirect', { range: dynamicRange }) : t('player.sdr'));
    setText('playback-info-mode', playbackModeLabel(currentPlayback.playbackMode));
    renderPlayerPlaybackSummary();
    fileNode = document.getElementById('playback-info-file');
    fileNode.title = currentPlayback.fileName || '';
  }

  function cycleTrack(tracks, currentId, direction, allowOff) {
    var ids = allowOff ? [''] : [];
    var index;
    for (index = 0; index < tracks.length; index += 1) { ids.push(tracks[index].id); }
    index = Math.max(0, ids.indexOf(currentId));
    return ids[Math.max(0, Math.min(ids.length - 1, index + direction))] || '';
  }

  function cycleSetting(direction) {
    var sizes = [75, 100, 125, 150];
    var index;
    var row = playerSettingRows()[settingIndex];
    var key;
    if (!row || row.disabled) { return; }
    key = row.getAttribute('data-setting');
    if (key === 'audio') {
      currentPlayback.options.audioStreamID = cycleTrack(currentPlayback.audioTracks, currentPlayback.options.audioStreamID, direction, false);
      detailPreferenceState.setTrack('audio', trackForId(currentPlayback.audioTracks, currentPlayback.options.audioStreamID), false);
    } else if (key === 'subtitles') {
      currentPlayback.options.subtitleStreamID = cycleTrack(currentPlayback.subtitleTracks, currentPlayback.options.subtitleStreamID, direction, true);
      detailPreferenceState.setTrack('subtitles', trackForId(currentPlayback.subtitleTracks, currentPlayback.options.subtitleStreamID), !currentPlayback.options.subtitleStreamID);
    } else if (key === 'size') {
      index = sizes.indexOf(currentPlayback.options.subtitleSize);
      currentPlayback.options.subtitleSize = sizes[Math.max(0, Math.min(sizes.length - 1, index + direction))];
    } else if (key === 'subtitle-advanced' || key === 'media-info') {
      return;
    } else if (key === 'version') {
      cyclePlaybackVersion(direction);
    } else if (key === 'quality') {
      currentPlayback.requestedVideoQuality = cycleValue(['original', '12000', '8000', '4000'], currentPlayback.requestedVideoQuality || currentPlayback.options.videoQuality, direction);
    } else if (key === 'playback-mode') {
      currentPlayback.requestedPlaybackMode = cycleValue(['auto', 'direct', 'transcode'], currentPlayback.requestedPlaybackMode || currentPlayback.options.playbackMode, direction);
    } else {
      return;
    }
    updateSettingsDisplay();
  }

  function openChoiceDialog(title, choices, selectedValue, apply, returnFocus) {
    if (!choices || !choices.length) { return; }
    choiceDialogApply = apply || null;
    choiceDialogReturnFocus = returnFocus || null;
    choiceDialogView.open(title, choices, selectedValue);
  }

  function closeChoiceDialog(apply) {
    var selected = choiceDialogView.selected();
    var callback = choiceDialogReturnFocus;
    if (apply && selected && choiceDialogApply) { choiceDialogApply(selected); }
    choiceDialogView.close();
    choiceDialogApply = null;
    choiceDialogReturnFocus = null;
    if (callback) { callback(); }
  }

  function playerTrackChoices(tracks, includeOff) {
    var choices = includeOff ? [{ value: '', label: t('subtitle.off') }] : [];
    (tracks || []).forEach(function (track) {
      choices.push({ value: String(track.id || ''), label: MediaProfile.trackDisplayLabel(track, t('detail.external')) });
    });
    return choices;
  }

  function setPlaybackVersionChoice(value) {
    var versions = currentPlayback.mediaVersions || [];
    var parts = String(value).split(':');
    var index;
    var resolved;
    var override;
    for (index = 0; index < versions.length; index += 1) {
      if (String(versions[index].mediaIndex) === parts[0] && String(versions[index].partIndex) === parts[1]) {
        currentPlayback.options.mediaIndex = versions[index].mediaIndex;
        currentPlayback.options.partIndex = versions[index].partIndex;
        override = detailPreferenceState.ensureOverride();
        override.mediaIndex = versions[index].mediaIndex;
        override.partIndex = versions[index].partIndex;
        applyPlaybackVersion(currentPlayback, versions[index]);
        resolved = MediaPreferences.resolve(currentPlayback, override, appSettings);
        currentPlayback.options.audioStreamID = resolved.audioStreamID;
        currentPlayback.options.subtitleStreamID = resolved.subtitleStreamID;
        return;
      }
    }
  }

  function openPlayerSettingChoice() {
    var row = playerSettingRows()[settingIndex];
    var key;
    var choices = [];
    var selected = '';
    var versions;
    if (!row || row.disabled) { return; }
    key = row.getAttribute('data-setting');
    if (key === 'subtitle-advanced') { openSubtitleEditor(); return; }
    if (key === 'media-info') { openAdvancedMediaInfo('player'); return; }
    if (key === 'audio') {
      choices = playerTrackChoices(currentPlayback.audioTracks, false); selected = currentPlayback.options.audioStreamID;
    } else if (key === 'subtitles') {
      choices = playerTrackChoices(currentPlayback.subtitleTracks, true); selected = currentPlayback.options.subtitleStreamID;
    } else if (key === 'size') {
      choices = [75, 100, 125, 150].map(function (size) { return { value: String(size), label: size + '%' }; }); selected = String(currentPlayback.options.subtitleSize);
    } else if (key === 'version') {
      versions = currentPlayback.mediaVersions || [];
      choices = versions.map(function (version) { return { value: version.mediaIndex + ':' + version.partIndex, label: mediaVersionLabel(version, false) }; });
      selected = currentPlayback.options.mediaIndex + ':' + currentPlayback.options.partIndex;
    } else if (key === 'quality') {
      choices = ['original', '12000', '8000', '4000'].map(function (value) { return { value: value, label: videoQualityLabel(value) }; });
      selected = currentPlayback.requestedVideoQuality || currentPlayback.options.videoQuality;
    } else if (key === 'playback-mode') {
      choices = ['auto', 'direct', 'transcode'].map(function (value) { return { value: value, label: playbackPreferenceLabel(value) }; });
      selected = currentPlayback.requestedPlaybackMode || currentPlayback.options.playbackMode;
    }
    openChoiceDialog(row.firstChild.textContent, choices, selected, function (choice) {
      if (key === 'audio') { currentPlayback.options.audioStreamID = choice.value; detailPreferenceState.setTrack('audio', trackForId(currentPlayback.audioTracks, choice.value), false); }
      else if (key === 'subtitles') { currentPlayback.options.subtitleStreamID = choice.value; detailPreferenceState.setTrack('subtitles', trackForId(currentPlayback.subtitleTracks, choice.value), !choice.value); }
      else if (key === 'size') { currentPlayback.options.subtitleSize = Number(choice.value); }
      else if (key === 'version') { setPlaybackVersionChoice(choice.value); }
      else if (key === 'quality') { currentPlayback.requestedVideoQuality = choice.value; }
      else if (key === 'playback-mode') { currentPlayback.requestedPlaybackMode = choice.value; }
      updateSettingsDisplay();
    }, function () { updateSettingsDisplay(); });
  }

  function mediaVersionLabelForPlayback() {
    var versions = currentPlayback && currentPlayback.mediaVersions || [];
    var index;
    for (index = 0; index < versions.length; index += 1) {
      if (versions[index].mediaIndex === currentPlayback.options.mediaIndex && versions[index].partIndex === currentPlayback.options.partIndex) {
        return mediaVersionLabel(versions[index], false);
      }
    }
    return t('player.versionAuto');
  }

  function cyclePlaybackVersion(direction) {
    var versions = currentPlayback.mediaVersions || [];
    var index = 0;
    var currentIndex;
    var resolved;
    var override;
    if (versions.length < 2) { return; }
    for (currentIndex = 0; currentIndex < versions.length; currentIndex += 1) {
      if (versions[currentIndex].mediaIndex === currentPlayback.options.mediaIndex && versions[currentIndex].partIndex === currentPlayback.options.partIndex) { index = currentIndex; break; }
    }
    index = (index + direction + versions.length) % versions.length;
    currentPlayback.options.mediaIndex = versions[index].mediaIndex;
    currentPlayback.options.partIndex = versions[index].partIndex;
    override = detailPreferenceState.ensureOverride();
    override.mediaIndex = versions[index].mediaIndex;
    override.partIndex = versions[index].partIndex;
    applyPlaybackVersion(currentPlayback, versions[index]);
    resolved = MediaPreferences.resolve(currentPlayback, override, appSettings);
    currentPlayback.options.audioStreamID = resolved.audioStreamID;
    currentPlayback.options.subtitleStreamID = resolved.subtitleStreamID;
  }

  function trackForId(tracks, id) {
    var index;
    for (index = 0; index < (tracks || []).length; index += 1) {
      if (String(tracks[index].id || '') === String(id || '')) { return tracks[index]; }
    }
    return null;
  }
  // Subtitle synchronization, seek/rebuild, recovery, resume, and lifecycle.
  function copyPlaybackOptions(options) {
    var result = {};
    var key;
    for (key in (options || {})) {
      if (Object.prototype.hasOwnProperty.call(options, key)) { result[key] = options[key]; }
    }
    return result;
  }

  function copyLocalSubtitleState(stateValue) {
    if (!stateValue) { return null; }
    return {
      cues: stateValue.cues,
      offsetMs: stateValue.offsetMs,
      streamId: stateValue.streamId,
      size: stateValue.size
    };
  }

  function subtitleServerIdentity() {
    return activeServer && (activeServer.machineIdentifier || activeServer.uri) || config.apiBaseUrl || 'local';
  }

  function subtitleEditorAvailability() {
    if (!currentPlayback || !SubtitleSync) { return { enabled: false, reason: 'unsupported', track: null }; }
    return SubtitleSync.availability(currentPlayback.options.subtitleStreamID, currentPlayback.subtitleTracks || [], failedSubtitleStreams);
  }

  function subtitleOffsetFor(track) {
    var classification;
    if (!track) { return 0; }
    classification = SubtitleSync.classify(track);
    if (classification.kind === 'external-text') { return Math.round(Number(track.offset || 0)); }
    if (classification.kind === 'embedded-text') {
      return SubtitleOffsetStore.get(root.localStorage, subtitleServerIdentity(), currentPlayback.partId, track.id);
    }
    return 0;
  }

  function rememberSubtitlePreviewOffset(stateValue, track) {
    var id;
    if (!stateValue || !track) { return; }
    id = String(track.id || '');
    if (!id || Object.prototype.hasOwnProperty.call(stateValue.originalServerOffsets, id)) { return; }
    stateValue.originalServerOffsets[id] = Math.round(Number(track.offset || 0));
  }

  function drainSubtitlePreviewWaiters(stateValue) {
    var callbacks;
    var index;
    if (!stateValue || stateValue.previewWriteInFlight || stateValue.previewPendingOffset || stateValue.previewDebounceTimer || stateValue.previewSizeTimer) { return; }
    callbacks = stateValue.previewIdleCallbacks.splice(0);
    for (index = 0; index < callbacks.length; index += 1) { callbacks[index](); }
  }

  function subtitleEditorPreviewPosition(stateValue) {
    return stateValue && stateValue.loop ? stateValue.bounds.start : playerAbsoluteTime();
  }

  function rebuildExternalSubtitlePreview(stateValue, streamId) {
    if (!subtitleEditorOpen || subtitleEditorState !== stateValue || stateValue.finalizing ||
        stateValue.previewMode !== 'server' || String(stateValue.selectedStreamID || '') !== String(streamId || '')) { return; }
    rebuildCurrentStream(subtitleEditorPreviewPosition(stateValue), false);
  }

  function queueSubtitlePreviewSize(stateValue) {
    if (!stateValue || stateValue.previewMode !== 'server') { return; }
    root.clearTimeout(stateValue.previewSizeTimer);
    stateValue.previewSizeTimer = root.setTimeout(function () {
      stateValue.previewSizeTimer = null;
      if (!subtitleEditorOpen || subtitleEditorState !== stateValue || stateValue.finalizing) { return; }
      rebuildCurrentStream(subtitleEditorPreviewPosition(stateValue), false);
      drainSubtitlePreviewWaiters(stateValue);
    }, 300);
  }

  function flushSubtitlePreviewOffset(stateValue) {
    var pending;
    if (!stateValue || stateValue.previewWriteInFlight || !stateValue.previewPendingOffset) {
      drainSubtitlePreviewWaiters(stateValue);
      return;
    }
    pending = stateValue.previewPendingOffset;
    stateValue.previewPendingOffset = null;
    stateValue.previewWriteInFlight = true;
    PlexClient.setSubtitleOffset(config, pending.streamId, pending.offsetMs, function (error) {
      if (!stateValue) { return; }
      stateValue.previewWriteInFlight = false;
      if (error) {
        stateValue.previewWriteError = error;
        stateValue.status = t('status.trackError');
        renderSubtitleEditor();
      } else {
        stateValue.previewServerOffsets[pending.streamId] = pending.offsetMs;
      }
      if (stateValue.previewPendingOffset) {
        flushSubtitlePreviewOffset(stateValue);
        return;
      }
      if (!error) { rebuildExternalSubtitlePreview(stateValue, pending.streamId); }
      drainSubtitlePreviewWaiters(stateValue);
    });
  }

  function queueSubtitlePreviewOffset(stateValue, track) {
    if (!stateValue || !track) { return; }
    rememberSubtitlePreviewOffset(stateValue, track);
    stateValue.previewWriteError = null;
    stateValue.previewPendingOffset = {
      streamId: String(track.id || ''),
      offsetMs: Math.round(Number(stateValue.offsetMs || 0))
    };
    root.clearTimeout(stateValue.previewDebounceTimer);
    stateValue.previewDebounceTimer = root.setTimeout(function () {
      stateValue.previewDebounceTimer = null;
      flushSubtitlePreviewOffset(stateValue);
    }, 150);
  }

  function whenSubtitlePreviewIdle(stateValue, callback) {
    if (!stateValue) { callback(); return; }
    stateValue.previewIdleCallbacks.push(callback);
    if (stateValue.previewDebounceTimer) {
      root.clearTimeout(stateValue.previewDebounceTimer);
      stateValue.previewDebounceTimer = null;
    }
    if (stateValue.previewSizeTimer) {
      root.clearTimeout(stateValue.previewSizeTimer);
      stateValue.previewSizeTimer = null;
    }
    if (stateValue.previewPendingOffset && !stateValue.previewWriteInFlight) { flushSubtitlePreviewOffset(stateValue); }
    drainSubtitlePreviewWaiters(stateValue);
  }

  function restoreSubtitlePreviewOffsets(stateValue, keepStreamId, callback) {
    var ids;
    var index = 0;
    var firstError = null;
    if (!stateValue) { callback(null); return; }
    ids = Object.keys(stateValue.previewServerOffsets).filter(function (id) {
      return String(id) !== String(keepStreamId || '') &&
        Number(stateValue.previewServerOffsets[id]) !== Number(stateValue.originalServerOffsets[id]);
    });
    function next() {
      var id;
      var track;
      if (index >= ids.length) { callback(firstError); return; }
      id = ids[index];
      index += 1;
      PlexClient.setSubtitleOffset(config, id, stateValue.originalServerOffsets[id], function (error) {
        if (error && !firstError) { firstError = error; }
        if (!error) {
          track = trackForId(currentPlayback && currentPlayback.subtitleTracks || [], id);
          if (track) { track.offset = stateValue.originalServerOffsets[id]; }
          delete stateValue.previewServerOffsets[id];
        }
        next();
      });
    }
    whenSubtitlePreviewIdle(stateValue, next);
  }

  function cancelLocalSubtitleRequest() {
    localSubtitleGeneration += 1;
    if (localSubtitleRequest && localSubtitleRequest.abort) { localSubtitleRequest.abort(); }
    localSubtitleRequest = null;
  }

  function configureLocalSubtitlePlayback(playback, callback) {
    var track = trackForId(playback.subtitleTracks, playback.options.subtitleStreamID);
    var classification = SubtitleSync.classify(track);
    var offset = subtitleOffsetFor(track);
    var generation;
    cancelLocalSubtitleRequest();
    localSubtitleState = null;
    playback.options.localSubtitleOverlay = false;
    if (!track || classification.kind !== 'embedded-text' || offset === 0 || failedSubtitleStreams[track.id]) {
      callback();
      return;
    }
    generation = localSubtitleGeneration;
    localSubtitleRequest = PlexClient.loadSubtitleText(config, playback, track, function (error, subtitleText) {
      var cues;
      if (generation !== localSubtitleGeneration || playback !== currentPlayback) { return; }
      localSubtitleRequest = null;
      cues = error ? [] : SubtitleSync.parse(subtitleText);
      if (error || !cues.length) {
        lastDiagnosticsError = DiagnosticsState.sanitizeText(error || t('player.subtitlePreviewFailed'));
        failedSubtitleStreams[track.id] = true;
        playback.options.localSubtitleOverlay = false;
      } else {
        playback.options.localSubtitleOverlay = true;
        localSubtitleState = { cues: cues, offsetMs: offset, streamId: track.id, size: playback.options.subtitleSize || 100 };
      }
      callback();
    });
  }

  function subtitleEditorTracks() {
    return [''].concat((currentPlayback.subtitleTracks || []).filter(function (track) {
      return SubtitleSync.classify(track).supported && !failedSubtitleStreams[track.id];
    }).map(function (track) { return String(track.id || ''); }));
  }

  function ensureSubtitleEditorView() {
    if (!subtitleEditorView) {
      subtitleEditorView = SubtitleEditorView.create({ document: document, setText: setText, SubtitleSync: SubtitleSync });
    }
    return subtitleEditorView;
  }

  function renderSubtitleOverlay(cues, offsetMs, size) {
    ensureSubtitleEditorView().renderOverlay(cues, playerAbsoluteTime() * 1000, offsetMs, size);
  }

  function updateActiveSubtitleOverlay() {
    if (subtitleEditorOpen && subtitleEditorState) {
      renderSubtitleOverlay(subtitleEditorState.cues, subtitleEditorState.offsetMs, subtitleEditorState.subtitleSize);
    } else if (localSubtitleState) {
      renderSubtitleOverlay(localSubtitleState.cues, localSubtitleState.offsetMs, localSubtitleState.size);
    } else {
      ensureSubtitleEditorView().hideOverlay();
    }
  }

  function stopSubtitlePreviewClock() {
    root.clearInterval(subtitlePreviewTimer);
    subtitlePreviewTimer = null;
  }

  function startSubtitlePreviewClock() {
    stopSubtitlePreviewClock();
    subtitlePreviewTimer = root.setInterval(updateActiveSubtitleOverlay, 50);
  }

  function subtitleEditorControls() {
    return ensureSubtitleEditorView().controls();
  }

  function subtitleEditorControlIndex(name) {
    var controls = subtitleEditorControls();
    var index;
    for (index = 0; index < controls.length; index += 1) {
      if (controls[index].getAttribute('data-subtitle-editor') === name) { return index; }
    }
    return -1;
  }

  function moveSubtitleEditorFocus(direction) {
    var rows = [['track'], ['size'], ['timeline'], ['minus', 'plus', 'loop', 'apply', 'cancel']];
    var controls = subtitleEditorControls();
    var current = controls[subtitleEditorIndex] && controls[subtitleEditorIndex].getAttribute('data-subtitle-editor');
    var row = 0;
    var column = 0;
    var targetRow;
    var targetColumn;
    var index;
    for (index = 0; index < rows.length; index += 1) {
      if (rows[index].indexOf(current) !== -1) {
        row = index;
        column = rows[index].indexOf(current);
        break;
      }
    }
    if (direction === 'left' || direction === 'right') {
      targetColumn = Math.max(0, Math.min(rows[row].length - 1, column + (direction === 'left' ? -1 : 1)));
      subtitleEditorIndex = subtitleEditorControlIndex(rows[row][targetColumn]);
      return;
    }
    targetRow = Math.max(0, Math.min(rows.length - 1, row + (direction === 'up' ? -1 : 1)));
    targetColumn = Math.max(0, Math.min(rows[targetRow].length - 1, column));
    subtitleEditorIndex = subtitleEditorControlIndex(rows[targetRow][targetColumn]);
  }

  function updateSubtitleEditorProgress() {
    var duration;
    if (!subtitleEditorState) { return; }
    duration = currentPlayback && Number(currentPlayback.duration || 0) / 1000;
    if (!duration) { return 0; }
    return Math.max(0, Math.min(100, playerAbsoluteTime() / duration * 100));
  }

  function renderSubtitleEditor() {
    var track;
    if (!subtitleEditorState) { return; }
    track = trackForId(currentPlayback.subtitleTracks, subtitleEditorState.selectedStreamID);
    ensureSubtitleEditorView().render({
      status: subtitleEditorState.status || '',
      track: track ? trackLabel(currentPlayback.subtitleTracks, track.id, t('subtitle.off')) : t('subtitle.off'),
      size: subtitleEditorState.subtitleSize, offsetMs: subtitleEditorState.offsetMs,
      progress: updateSubtitleEditorProgress(), index: subtitleEditorIndex,
      currentTime: formatTime(playerAbsoluteTime()),
      duration: formatTime(Number(currentPlayback.duration || 0) / 1000),
      loop: subtitleEditorState.loop, pointerActive: pointerSelectionActive
    });
    updateActiveSubtitleOverlay();
  }

  function abortSubtitleEditorRequest() {
    subtitleEditorGeneration += 1;
    if (subtitleEditorRequest && subtitleEditorRequest.abort) { subtitleEditorRequest.abort(); }
    subtitleEditorRequest = null;
  }

  function loadSubtitleEditorTrack(preserveStream) {
    var track;
    var classification;
    var generation;
    abortSubtitleEditorRequest();
    if (!subtitleEditorState) { return; }
    track = trackForId(currentPlayback.subtitleTracks, subtitleEditorState.selectedStreamID);
    classification = SubtitleSync.classify(track);
    subtitleEditorState.cues = [];
    subtitleEditorState.previewError = false;
    subtitleEditorState.offsetMs = track && Object.prototype.hasOwnProperty.call(subtitleEditorState.previewServerOffsets, String(track.id || ''))
      ? subtitleEditorState.previewServerOffsets[String(track.id || '')]
      : subtitleOffsetFor(track);
    subtitleEditorState.previewMode = classification.kind === 'external-text' ? 'server' :
      (classification.kind === 'embedded-text' ? 'overlay' : 'none');
    if (!track) {
      stopSubtitlePreviewClock();
      ensureSubtitleEditorView().hideOverlay();
      subtitleEditorState.status = '';
      currentPlayback.options.subtitleStreamID = '';
      currentPlayback.options.localSubtitleOverlay = false;
      renderSubtitleEditor();
      if (!preserveStream) { rebuildCurrentStream(subtitleEditorPreviewPosition(subtitleEditorState), false); }
      return;
    }
    if (classification.kind === 'external-text') {
      rememberSubtitlePreviewOffset(subtitleEditorState, track);
      stopSubtitlePreviewClock();
      ensureSubtitleEditorView().hideOverlay();
      subtitleEditorState.status = '';
      currentPlayback.options.subtitleStreamID = String(track.id || '');
      currentPlayback.options.localSubtitleOverlay = false;
      renderSubtitleEditor();
      if (!preserveStream) { rebuildCurrentStream(subtitleEditorPreviewPosition(subtitleEditorState), true); }
      return;
    }
    startSubtitlePreviewClock();
    currentPlayback.options.subtitleStreamID = '';
    currentPlayback.options.localSubtitleOverlay = false;
    subtitleEditorState.status = t('player.subtitlePreviewLoading');
    generation = subtitleEditorGeneration;
    renderSubtitleEditor();
    subtitleEditorRequest = PlexClient.loadSubtitleText(config, currentPlayback, track, function (error, subtitleText) {
      var cues;
      if (!subtitleEditorState || generation !== subtitleEditorGeneration || String(subtitleEditorState.selectedStreamID) !== String(track.id)) { return; }
      subtitleEditorRequest = null;
      cues = error ? [] : SubtitleSync.parse(subtitleText);
      if (error || !cues.length) {
        lastDiagnosticsError = DiagnosticsState.sanitizeText(error || t('player.subtitlePreviewFailed'));
        subtitleEditorState.previewError = true;
        subtitleEditorState.status = t('player.subtitlePreviewFailed');
        subtitleEditorState.cues = [];
      } else {
        subtitleEditorState.status = '';
        subtitleEditorState.cues = cues;
      }
      renderSubtitleEditor();
    });
    if (!preserveStream) { rebuildCurrentStream(subtitleEditorPreviewPosition(subtitleEditorState), false); }
  }

  function openSubtitleEditor() {
    var availability = subtitleEditorAvailability();
    var video = document.getElementById('player-video');
    var controls = document.getElementById('player-controls');
    var settings = document.getElementById('player-settings');
    var editor = document.getElementById('subtitle-editor');
    var originalOptions;
    if (!availability.enabled || subtitleEditorOpen || !currentPlayback) { return; }
    originalOptions = copyPlaybackOptions(currentPlayback.options);
    subtitleEditorState = {
      position: playerAbsoluteTime(),
      paused: video.paused,
      originalOptions: originalOptions,
      originalLocalSubtitleState: copyLocalSubtitleState(localSubtitleState),
      selectedStreamID: String(originalOptions.subtitleStreamID || ''),
      subtitleSize: Number(originalOptions.subtitleSize || 100),
      offsetMs: 0,
      cues: [],
      previewError: false,
      bounds: SubtitleSync.loopBounds(playerAbsoluteTime(), currentPlayback.duration / 1000),
      loop: false,
      applying: false,
      cancelRequested: false,
      status: '',
      previewMode: 'none',
      originalServerOffsets: {},
      previewServerOffsets: {},
      previewPendingOffset: null,
      previewWriteInFlight: false,
      previewWriteError: null,
      previewIdleCallbacks: [],
      previewDebounceTimer: null,
      previewSizeTimer: null,
      finalizing: false
    };
    subtitleEditorOpen = true;
    playerTimelineSuppressed = true;
    localSubtitleState = null;
    root.clearInterval(timelineTimer);
    root.clearInterval(estimatedEndTimer);
    settingsOpen = false;
    ensureSubtitleEditorView().setOpen(false);
    root.clearTimeout(subtitlePanelTransitionTimer);
    controls.style.transition = 'opacity 100ms linear';
    settings.style.transition = 'opacity 100ms linear';
    controls.style.opacity = '0';
    controls.style.pointerEvents = 'none';
    settings.style.opacity = '0';
    settings.style.pointerEvents = 'none';
    subtitlePanelTransitionTimer = root.setTimeout(function () {
      subtitlePanelTransitionTimer = null;
      settings.className = 'player-settings is-hidden';
      editor.className = 'subtitle-editor is-transitioning-in';
    }, interfaceAnimationDuration(100));
    subtitleEditorIndex = 0;
    currentPlayback.options = copyPlaybackOptions(originalOptions);
    currentPlayback.options.localSubtitleOverlay = false;
    loadSubtitleEditorTrack(true);
    if (subtitleEditorState.previewMode !== 'server') {
      currentPlayback.options.subtitleStreamID = '';
      rebuildCurrentStream(subtitleEditorState.bounds.start, false);
    }
  }

  function cycleSubtitleEditorTrack(direction) {
    var ids = subtitleEditorTracks();
    var index;
    if (!subtitleEditorState || !ids.length) { return; }
    index = ids.indexOf(String(subtitleEditorState.selectedStreamID || ''));
    index = index < 0 ? 0 : index;
    index = Math.max(0, Math.min(ids.length - 1, index + direction));
    subtitleEditorState.selectedStreamID = ids[index];
    loadSubtitleEditorTrack(false);
  }

  function setSubtitleEditorSize(value) {
    if (!subtitleEditorState) { return; }
    subtitleEditorState.subtitleSize = Number(value || 100);
    currentPlayback.options.subtitleSize = subtitleEditorState.subtitleSize;
    renderSubtitleEditor();
    queueSubtitlePreviewSize(subtitleEditorState);
  }

  function cycleSubtitleEditorSize(direction) {
    var sizes = [75, 100, 125, 150];
    var index = sizes.indexOf(Number(subtitleEditorState.subtitleSize || 100));
    index = index < 0 ? 1 : index;
    setSubtitleEditorSize(sizes[Math.max(0, Math.min(sizes.length - 1, index + direction))]);
  }

  function subtitleEditorTrackChoices() {
    return subtitleEditorTracks().map(function (id) {
      var track = trackForId(currentPlayback.subtitleTracks, id);
      return { value: id, label: track ? trackLabel(currentPlayback.subtitleTracks, track.id, t('subtitle.off')) : t('subtitle.off') };
    });
  }

  function openSubtitleEditorChoice(name) {
    var choices;
    var selected;
    if (!subtitleEditorState) { return; }
    if (name === 'track') {
      choices = subtitleEditorTrackChoices();
      selected = String(subtitleEditorState.selectedStreamID || '');
      openChoiceDialog(t('player.subtitles'), choices, selected, function (choice) {
        if (!subtitleEditorState) { return; }
        subtitleEditorState.selectedStreamID = String(choice.value || '');
        loadSubtitleEditorTrack(false);
      }, renderSubtitleEditor);
    } else if (name === 'size') {
      choices = [75, 100, 125, 150].map(function (size) { return { value: String(size), label: size + '%' }; });
      selected = String(subtitleEditorState.subtitleSize || 100);
      openChoiceDialog(t('player.subtitleSize'), choices, selected, function (choice) {
        setSubtitleEditorSize(choice.value);
      }, renderSubtitleEditor);
    }
  }

  function adjustSubtitleEditorOffset(delta) {
    var track;
    subtitleEditorState.offsetMs = SubtitleSync.adjust(subtitleEditorState.offsetMs, delta);
    renderSubtitleEditor();
    track = trackForId(currentPlayback.subtitleTracks, subtitleEditorState.selectedStreamID);
    if (track && subtitleEditorState.previewMode === 'server') {
      queueSubtitlePreviewOffset(subtitleEditorState, track);
    }
  }

  function seekSubtitleEditor(direction) {
    var duration = Number(currentPlayback.duration || 0) / 1000;
    var target = Math.max(0, Math.min(duration, playerAbsoluteTime() + direction * 10));
    subtitleEditorState.bounds = {
      start: target,
      end: Math.min(duration, target + 5)
    };
    seekPlayerTo(target);
    renderSubtitleEditor();
  }

  function restartTimelineAfterSubtitleRestore() {
    var video = document.getElementById('player-video');
    playerTimelineSuppressed = false;
    pendingPlaybackRestore = null;
    root.clearInterval(timelineTimer);
    timelineTimer = root.setInterval(function () { sendPlayerTimeline(video.paused ? 'paused' : 'playing'); }, 3000);
    startEstimatedEndTimer();
    updateActiveSubtitleOverlay();
    showPlayerControls();
  }

  function restorePlaybackAfterSubtitleEditor(stateValue, options, localState) {
    var controls = document.getElementById('player-controls');
    var settings = document.getElementById('player-settings');
    var editor = document.getElementById('subtitle-editor');
    stopSubtitlePreviewClock();
    root.clearTimeout(stateValue && stateValue.previewDebounceTimer);
    root.clearTimeout(stateValue && stateValue.previewSizeTimer);
    abortSubtitleEditorRequest();
    subtitleEditorOpen = false;
    subtitleEditorState = null;
    ensureSubtitleEditorView().hideOverlay();
    currentPlayback.options = options;
    localSubtitleState = localState;
    root.clearTimeout(subtitlePanelTransitionTimer);
    settingsOpen = true;
    playerSettingsSnapshot = currentPlayerSettingsSignature();
    updateSettingsDisplay();
    editor.className = 'subtitle-editor is-transitioning-out';
    subtitlePanelTransitionTimer = root.setTimeout(function () {
      subtitlePanelTransitionTimer = null;
      ensureSubtitleEditorView().setOpen(false);
      settings.className = 'player-settings';
      controls.style.transition = 'opacity 100ms linear';
      settings.style.transition = 'opacity 100ms linear';
      controls.style.opacity = '0';
      controls.style.pointerEvents = 'none';
      settings.style.opacity = '1';
      settings.style.pointerEvents = '';
    }, interfaceAnimationDuration(100));
    pendingPlaybackRestore = { paused: stateValue.paused };
    rebuildCurrentStream(stateValue.position, false);
  }

  function restoreCancelledSubtitleApply(stateValue) {
    function restoreSelection() {
      PlexClient.setStreamSelection(config, currentPlayback, stateValue.originalOptions, function () {
        if (!subtitleEditorState || subtitleEditorState !== stateValue) { return; }
        stateValue.applying = false;
        restorePlaybackAfterSubtitleEditor(stateValue, copyPlaybackOptions(stateValue.originalOptions), stateValue.originalLocalSubtitleState);
      });
    }
    stateValue.finalizing = true;
    restoreSubtitlePreviewOffsets(stateValue, '', function () { restoreSelection(); });
  }

  function failSubtitleApply(stateValue, restoreSelection) {
    function finish() {
      if (!subtitleEditorState || subtitleEditorState !== stateValue) { return; }
      stateValue.applying = false;
      stateValue.finalizing = false;
      stateValue.status = t('status.trackError');
      renderSubtitleEditor();
    }
    if (restoreSelection) {
      PlexClient.setStreamSelection(config, currentPlayback, stateValue.originalOptions, finish);
    } else {
      finish();
    }
  }

  function finishSubtitleEditorApply(stateValue, options, track) {
    var classification = SubtitleSync.classify(track);
    var localState = null;
    var stored = true;
    if (track && classification.kind === 'embedded-text' && stateValue.offsetMs !== 0) {
      stored = SubtitleOffsetStore.set(root.localStorage, subtitleServerIdentity(), currentPlayback.partId, track.id, stateValue.offsetMs);
      options.localSubtitleOverlay = true;
      localState = { cues: stateValue.cues, offsetMs: stateValue.offsetMs, streamId: track.id, size: stateValue.subtitleSize };
    } else {
      options.localSubtitleOverlay = false;
      if (track && classification.kind === 'embedded-text') {
        stored = SubtitleOffsetStore.remove(root.localStorage, subtitleServerIdentity(), currentPlayback.partId, track.id);
      }
    }
    if (!stored) {
      failSubtitleApply(stateValue, true);
      return;
    }
    currentPlayback.options = options;
    syncPlayerOverrideFromOptions(playerSettingsSnapshot);
    saveDetailMediaOverride();
    restorePlaybackAfterSubtitleEditor(stateValue, options, localState);
  }

  function applySubtitleEditor() {
    var stateValue = subtitleEditorState;
    var options;
    var track;
    var classification;
    if (!stateValue || stateValue.applying) { return; }
    track = trackForId(currentPlayback.subtitleTracks, stateValue.selectedStreamID);
    if (track && stateValue.previewMode === 'overlay' && stateValue.previewError) { stateValue.status = t('player.subtitlePreviewFailed'); renderSubtitleEditor(); return; }
    if (track && stateValue.previewMode === 'overlay' && (!stateValue.cues.length || subtitleEditorRequest)) { stateValue.status = t('player.subtitlePreviewLoading'); renderSubtitleEditor(); return; }
    options = copyPlaybackOptions(stateValue.originalOptions);
    options.subtitleStreamID = stateValue.selectedStreamID;
    options.subtitleSize = stateValue.subtitleSize;
    classification = SubtitleSync.classify(track);
    stateValue.applying = true;
    stateValue.cancelRequested = false;
    stateValue.finalizing = true;

    function selectTrack() {
      PlexClient.setStreamSelection(config, currentPlayback, options, function (selectionError) {
        if (!subtitleEditorState || subtitleEditorState !== stateValue) { return; }
        if (stateValue.cancelRequested) { restoreCancelledSubtitleApply(stateValue); return; }
        if (selectionError) {
          restoreSubtitlePreviewOffsets(stateValue, '', function () { failSubtitleApply(stateValue, false); });
          return;
        }
        if (track && classification.kind === 'external-text') { track.offset = stateValue.offsetMs; }
        finishSubtitleEditorApply(stateValue, options, track);
      });
    }

    stateValue.status = t('status.preparing');
    renderSubtitleEditor();
    restoreSubtitlePreviewOffsets(stateValue, track && classification.kind === 'external-text' ? track.id : '', function (offsetError) {
      if (!subtitleEditorState || subtitleEditorState !== stateValue) { return; }
      if (stateValue.cancelRequested) { restoreCancelledSubtitleApply(stateValue); return; }
      if (offsetError || stateValue.previewWriteError) { failSubtitleApply(stateValue, false); return; }
      selectTrack();
    });
  }

  function closeSubtitleEditor(apply) {
    var stateValue = subtitleEditorState;
    if (!stateValue) { return; }
    if (apply) { applySubtitleEditor(); return; }
    if (stateValue.applying) {
      stateValue.cancelRequested = true;
      stateValue.status = t('status.preparing');
      renderSubtitleEditor();
      return;
    }
    stateValue.applying = true;
    stateValue.finalizing = true;
    stateValue.status = t('status.preparing');
    renderSubtitleEditor();
    restoreCancelledSubtitleApply(stateValue);
  }

  function updateSubtitleEditorPlayback() {
    if (!subtitleEditorOpen || !subtitleEditorState) { updateActiveSubtitleOverlay(); return; }
    if (subtitleEditorState.loop && playerAbsoluteTime() >= subtitleEditorState.bounds.end - 0.05 && !playerStreamSwitching) {
      seekPlayerTo(subtitleEditorState.bounds.start);
    }
    updateSubtitleEditorProgress();
    updateActiveSubtitleOverlay();
  }

  function activateSubtitleEditorControl(name) {
    if (subtitleEditorState && subtitleEditorState.applying) {
      if (name === 'cancel') { closeSubtitleEditor(false); }
      return;
    }
    if (name === 'track') { openSubtitleEditorChoice('track'); }
    else if (name === 'size') { openSubtitleEditorChoice('size'); }
    else if (name === 'minus') { adjustSubtitleEditorOffset(-100); }
    else if (name === 'plus') { adjustSubtitleEditorOffset(100); }
    else if (name === 'loop' && subtitleEditorState.bounds.end > subtitleEditorState.bounds.start) { subtitleEditorState.loop = !subtitleEditorState.loop; renderSubtitleEditor(); }
    else if (name === 'apply') { closeSubtitleEditor(true); }
    else if (name === 'cancel') { closeSubtitleEditor(false); }
  }

  function handleSubtitleEditorKey(event, direction) {
    var controls;
    var name;
    if (!subtitleEditorOpen || !subtitleEditorState) { return false; }
    controls = subtitleEditorControls();
    name = controls[subtitleEditorIndex] && controls[subtitleEditorIndex].getAttribute('data-subtitle-editor');
    if (event.keyCode === 27 || event.keyCode === 461) { closeSubtitleEditor(false); return true; }
    if (subtitleEditorState.applying) { return true; }
    if (event.keyCode === 415) { document.getElementById('player-video').play(); return true; }
    if (event.keyCode === 19) { document.getElementById('player-video').pause(); return true; }
    if (direction === 'up' || direction === 'down') {
      moveSubtitleEditorFocus(direction);
      renderSubtitleEditor();
    } else if (direction === 'left' || direction === 'right') {
      if (name === 'track') { cycleSubtitleEditorTrack(direction === 'left' ? -1 : 1); }
      else if (name === 'size') { cycleSubtitleEditorSize(direction === 'left' ? -1 : 1); }
      else if (name === 'timeline') { seekSubtitleEditor(direction === 'left' ? -1 : 1); }
      else {
        moveSubtitleEditorFocus(direction);
        renderSubtitleEditor();
      }
    } else if (event.keyCode === 13) {
      activateSubtitleEditorControl(name);
    }
    return true;
  }

  function syncPlayerOverrideFromOptions(previousSignature) {
    var previous = String(previousSignature || '').split('|');
    var audio;
    var subtitle;
    var override = detailPreferenceState.ensureOverride();
    if (String(currentPlayback.options.audioStreamID || '') !== String(previous[0] || '')) {
      audio = trackForId(currentPlayback.audioTracks, currentPlayback.options.audioStreamID);
      override.audioLanguage = Settings.primaryLanguage(audio && (audio.languageTag || audio.languageCode));
    }
    if (String(currentPlayback.options.subtitleStreamID || '') !== String(previous[1] || '')) {
      subtitle = trackForId(currentPlayback.subtitleTracks, currentPlayback.options.subtitleStreamID);
      override.subtitlesOff = !subtitle;
      override.subtitleLanguage = subtitle ? Settings.primaryLanguage(subtitle.languageTag || subtitle.languageCode) : '';
    }
  }

  function rebuildCurrentStream(absoluteTime, updateSelection) {
    var video = document.getElementById('player-video');
    var resumeTarget = Math.max(0, Math.min(currentPlayback.duration / 1000, Math.floor(absoluteTime)));
    var playback = currentPlayback;
    var recoveryStep = PlaybackRecovery.current(playerRecoveryState);
    var transcodeSession;
    var applySource = function (sourceUrl) {
      if (appView !== 'player' || currentPlayback !== playback || playback.transcodeSession !== transcodeSession) { return; }
      try {
        playback.sourceUrl = sourceUrl;
        playback.hlsUrl = sourceUrl;
        startTranscodeKeepalive();
        renderPlaybackInfo();
        video.pause();
        currentPlayback.offsetBase = resumeTarget;
        video.src = sourceUrl;
        video.load();
      } catch (error) {
        playerStreamSwitching = false;
        playbackClock = PlaybackClock.freeze(playbackClock, false);
        setPlayerLoading(false);
        setText('player-status', t('status.streamError'));
        if (pendingPlaybackRestore) { restartTimelineAfterSubtitleRestore(); }
      }
    };
    var prepareSource = function () {
      PlexClient.preparePlayback(config, playback, playback.options, function (error, sourceUrl) {
        if (appView !== 'player' || currentPlayback !== playback || playback.transcodeSession !== transcodeSession) { return; }
        if (error || !sourceUrl) {
          playerStreamSwitching = false;
          playbackClock = PlaybackClock.freeze(playbackClock, false);
          setPlayerLoading(false);
          setText('player-status', t('status.streamError'));
          recoverPlaybackError();
          return;
        }
        applySource(sourceUrl);
      });
    };
    if (recoveryStep && recoveryStep.kind === 'direct-play') {
      playerRecoveryState = PlaybackRecovery.rebuild(playerRecoveryState, resumeTarget);
      applyCurrentPlaybackAttempt(false);
      return;
    }
    currentPlayback.options.offset = resumeTarget;
    pendingPlayerSeek = null;
    root.clearTimeout(playerSeekTimer);
    sendPlayerTimeline('stopped');
    playerBufferingIndicator.stop();
    playerStreamSwitching = true;
    playerBuffering = false;
    anchorPlayerClock(resumeTarget, true);
    stopTranscodeKeepalive();
    PlexClient.rotateTranscodeSession(playback);
    transcodeSession = playback.transcodeSession;
    setText('player-status', t('status.preparing'));
    setPlayerLoading(true, false);
    if (!updateSelection) { prepareSource(); return; }
    PlexClient.setStreamSelection(config, playback, playback.options, function (selectionError) {
      if (appView !== 'player' || currentPlayback !== playback || playback.transcodeSession !== transcodeSession) { return; }
      if (selectionError) { playerStreamSwitching = false; playbackClock = PlaybackClock.freeze(playbackClock, false); setPlayerLoading(false); setText('player-status', t('status.trackError')); return; }
      prepareSource();
    });
  }

  function playerBufferedRanges(video) {
    var ranges = [];
    var index;
    for (index = 0; index < video.buffered.length; index += 1) {
      ranges.push({ start: video.buffered.start(index), end: video.buffered.end(index) });
    }
    return ranges;
  }

  function playerSeekableRanges(video) {
    var ranges = [];
    var index;
    for (index = 0; index < video.seekable.length; index += 1) {
      ranges.push({ start: video.seekable.start(index), end: video.seekable.end(index) });
    }
    return ranges;
  }

  function playerDisplayTime() {
    return pendingPlayerSeek === null ? playerAbsoluteTime() : pendingPlayerSeek;
  }

  function commitPlayerSeek() {
    var video = document.getElementById('player-video');
    var decision;
    var target;
    if (pendingPlayerSeek === null || !currentPlayback || appView !== 'player') { return; }
    if (playerStreamSwitching) {
      playerSeekTimer = root.setTimeout(commitPlayerSeek, 100);
      return;
    }
    target = pendingPlayerSeek;
    pendingPlayerSeek = null;
    decision = PlayerSeekController.decide({
      target: target,
      duration: Number(currentPlayback.duration || 0) / 1000,
      nativeDuration: video.duration,
      offset: Number(currentPlayback.offsetBase || 0),
      buffered: playerBufferedRanges(video),
      seekable: playerSeekableRanges(video),
      directPlay: currentPlayback.options.delivery === 'direct-play'
    });
    if (!decision) { return; }
    if (decision.operation === 'rebuild') {
      rebuildCurrentStream(decision.target, false);
      return;
    }
    anchorPlayerClock(decision.target, false);
    playerNativeSeekPending = true;
    armNativeSeekVerification(decision.target, decision.nativeTime);
    try {
      video.currentTime = decision.nativeTime;
    } catch (error) {
      playerNativeSeekPending = false;
      playerNativeSeekTarget = null;
      root.clearTimeout(playerNativeSeekVerificationTimer);
      rebuildCurrentStream(decision.target, false);
      return;
    }
    updatePlayerDisplay();
    updateEstimatedEndTime();
    sendPlayerTimeline(video.paused ? 'paused' : 'playing');
  }

  function seekPlayerTo(absoluteTime) {
    var duration;
    if (!currentPlayback || !isFinite(absoluteTime)) { return; }
    duration = Number(currentPlayback.duration || 0) / 1000;
    if (!isFinite(duration) || duration <= 0) { return; }
    var target = Math.max(0, Math.min(duration, absoluteTime));
    pendingPlayerSeek = target;
    root.clearTimeout(playerSeekTimer);
    playerSeekTimer = root.setTimeout(commitPlayerSeek, 250);
    updatePlayerDisplay();
    updateEstimatedEndTime();
  }

  function applyPlayerSettings() {
    var position = playerAbsoluteTime();
    syncPlayerOverrideFromOptions(playerSettingsSnapshot);
    saveDetailMediaOverride();
    applyPlaybackVersion(currentPlayback, {
      mediaIndex: currentPlayback.options.mediaIndex,
      partIndex: currentPlayback.options.partIndex
    });
    PlexClient.setStreamSelection(config, currentPlayback, currentPlayback.options, function (selectionError) {
      if (selectionError || appView !== 'player') { recoverPlaybackError(); return; }
      configureLocalSubtitlePlayback(currentPlayback, function () {
        if (appView !== 'player') { return; }
        playerRecoveryState = PlaybackRecovery.create(playbackPlanFor(currentPlayback));
        playerRecoveryState.position = position;
        applyCurrentPlaybackAttempt(false);
      });
    });
  }

  function currentPlayerSettingsSignature() {
    if (!currentPlayback) { return ''; }
    return [
      currentPlayback.options.audioStreamID || '',
      currentPlayback.options.subtitleStreamID || '',
      currentPlayback.options.subtitleSize || 100,
      currentPlayback.options.mediaIndex === undefined ? '' : currentPlayback.options.mediaIndex,
      currentPlayback.options.partIndex === undefined ? '' : currentPlayback.options.partIndex,
      currentPlayback.requestedVideoQuality || currentPlayback.options.videoQuality || 'original',
      currentPlayback.requestedPlaybackMode || currentPlayback.options.playbackMode || 'auto'
    ].join('|');
  }

  function playerSettingsChanged() {
    return playerSettingsSnapshot !== currentPlayerSettingsSignature();
  }

  function setSettingsOpen(open) {
    var controls = document.getElementById('player-controls');
    var settings = document.getElementById('player-settings');
    root.clearTimeout(subtitlePanelTransitionTimer);
    settingsOpen = open;
    if (open) {
      playerSettingsSnapshot = currentPlayerSettingsSignature();
      settingIndex = 0;
      updateSettingsDisplay();
      settings.className = 'player-settings is-hidden';
      controls.style.transition = 'opacity 100ms linear';
      controls.style.opacity = '0';
      controls.style.pointerEvents = 'none';
      subtitlePanelTransitionTimer = root.setTimeout(function () {
        subtitlePanelTransitionTimer = null;
        settings.style.opacity = '1';
        settings.style.pointerEvents = '';
        settings.className = 'player-settings is-transitioning-in';
      }, interfaceAnimationDuration(100));
    } else {
      if (playerSettingsChanged()) { applyPlayerSettings(); }
      settings.className = 'player-settings is-transitioning-out';
      subtitlePanelTransitionTimer = root.setTimeout(function () {
        subtitlePanelTransitionTimer = null;
        settings.className = 'player-settings is-hidden';
        settings.style.opacity = '';
        settings.style.pointerEvents = '';
        controls.style.transition = 'opacity 100ms linear';
        controls.style.opacity = '1';
        controls.style.pointerEvents = '';
        updatePlayerButtonFocus();
      }, interfaceAnimationDuration(100));
    }
  }

  function togglePlayback() {
    var video = document.getElementById('player-video');
    if (video.paused) { video.play(); }
    else { video.pause(); }
  }

  function playerDisplayTitle(detail) {
    var subtitle = detail.subtitle || '';
    var episodeTitle;
    var episodeMarker;
    var titleMarker;
    if (detail.type === 'episode') {
      episodeTitle = subtitle;
      episodeMarker = subtitle.indexOf(' - E');
      titleMarker = episodeMarker === -1 ? -1 : subtitle.indexOf(' - ', episodeMarker + 3);
      if (titleMarker !== -1) { episodeTitle = subtitle.substring(titleMarker + 3); }
      subtitle = 'S' + Number(detail.seasonIndex || 0) + ' E' + Number(detail.episodeIndex || 0) +
        (episodeTitle ? ' - ' + episodeTitle : '');
    }
    return { primary: detail.title || '', secondary: subtitle };
  }

  function renderPlayerTitle(detail) {
    var title = document.getElementById('player-title');
    var display = playerDisplayTitle(detail);
    title.innerHTML = '';
    title.appendChild(element('span', 'player-title-primary', display.primary));
    if (display.secondary) {
      title.appendChild(element('span', 'player-title-secondary', display.secondary));
    }
  }

  function updatePlayerErrorFocus() {
    var buttons = document.querySelectorAll('.player-error-actions button');
    var index;
    for (index = 0; index < buttons.length; index += 1) {
      buttons[index].className = index === playerErrorIndex ? 'is-focused' : '';
    }
    if (buttons[playerErrorIndex]) { buttons[playerErrorIndex].focus(); }
  }

  function showPlayerError(waitingForNetwork, retryAction) {
    playerErrorVisible = true;
    playerErrorIndex = 0;
    playerErrorRetryAction = retryAction || null;
    if (waitingForNetwork || !lastDiagnosticsError) {
      lastDiagnosticsError = t(waitingForNetwork ? 'player.waitingNetwork' : 'player.errorMessage');
    }
    setText('player-error-message', t(waitingForNetwork ? 'player.waitingNetwork' : 'player.errorMessage'));
    document.getElementById('player-error').className = 'player-error';
    document.getElementById('player-error-retry').disabled = !!waitingForNetwork;
    setPlayerLoading(false);
    updatePlayerErrorFocus();
  }

  function hidePlayerError() {
    playerErrorVisible = false;
    document.getElementById('player-error').className = 'player-error is-hidden';
  }

  function playbackPlanFor(playback) {
    var requestedMode = playback.requestedPlaybackMode || playback.options.playbackMode || 'auto';
    var requestedQuality = playback.requestedVideoQuality || playback.options.videoQuality || 'original';
    var capabilities = {
      directPlay: playbackCapabilities.directPlay,
      codecs: playbackCapabilities.codecs,
      containers: playbackCapabilities.containers,
      uhd: playbackCapabilities.uhd,
      hdr10: playbackCapabilities.hdr10,
      dolbyVision: playbackCapabilities.dolbyVision,
      hdrKnown: playbackCapabilities.hdrKnown
    };
    var selectedAudio = String(playback.options.audioStreamID || '');
    var defaultAudio = '';
    (playback.audioTracks || []).forEach(function (track) { if (track.selected) { defaultAudio = String(track.id || ''); } });
    if (playback.options.subtitleStreamID || (selectedAudio && defaultAudio && selectedAudio !== defaultAudio)) {
      capabilities.directPlay = false;
    }
    return PlaybackStrategy.plan(
      requestedMode,
      capabilities,
      playback.mediaVersions || [],
      playback.options.mediaIndex,
      requestedQuality
    );
  }

  function playbackViolatesDirectOnly(playback) {
    return !!playback && playback.requestedPlaybackMode === 'direct' && /^transcode-/.test(String(playback.playbackMode || ''));
  }

  function applyPlaybackVersion(playback, step) {
    var versions = playback.mediaVersions || [];
    var version;
    var index;
    for (index = 0; index < versions.length; index += 1) {
      if (versions[index].mediaIndex === step.mediaIndex && versions[index].partIndex === step.partIndex) {
        version = versions[index];
        break;
      }
    }
    if (!version) { return; }
    playback.mediaIndex = version.mediaIndex;
    playback.partIndex = version.partIndex;
    playback.partId = version.partId;
    playback.partKey = version.partKey;
    playback.fileName = version.fileName;
    playback.fileSize = version.fileSize;
    playback.originalContainer = version.container;
    playback.originalVideoCodec = version.videoCodec;
    playback.videoDynamicRange = version.videoDynamicRange;
    playback.sourceWidth = version.width;
    playback.sourceHeight = version.height;
    playback.mediaProfile = version.profile || playback.mediaProfile;
    playback.audioTracks = version.audioTracks || playback.audioTracks;
    playback.subtitleTracks = version.subtitleTracks || playback.subtitleTracks;
  }

  function applyCurrentPlaybackAttempt(preserveFrame) {
    var step = PlaybackRecovery.current(playerRecoveryState);
    var video = document.getElementById('player-video');
    var position = Math.max(0, Number(playerRecoveryState.position || 0));
    if (!currentPlayback || !step || appView !== 'player') { showPlayerError(false); return; }
    playerRecoveryState = PlaybackRecovery.start(playerRecoveryState, position);
    applyPlaybackVersion(currentPlayback, step);
    currentPlayback.options.delivery = step.kind === 'direct-play' ? 'direct-play' : step.kind;
    currentPlayback.options.mediaIndex = step.mediaIndex;
    currentPlayback.options.partIndex = step.partIndex;
    currentPlayback.options.videoQuality = step.videoQuality;
    currentPlayback.options.videoResolution = step.videoResolution;
    currentPlayback.options.playbackMode = step.kind === 'transcode' || step.kind === 'safe-transcode' ? 'transcode' : 'auto';
    currentPlayback.options.offset = step.kind === 'direct-play' ? 0 : position;
    currentPlayback.offsetBase = step.kind === 'direct-play' ? 0 : position;
    currentPlayback.directSeekTarget = step.kind === 'direct-play' ? position : null;
    stopTranscodeKeepalive();
    PlexClient.rotateTranscodeSession(currentPlayback);
    playerBufferingIndicator.stop();
    playerStreamSwitching = true;
    playerBuffering = false;
    anchorPlayerClock(position, true);
    hidePlayerError();
    setText('player-status', t('status.preparing'));
    setPlayerLoading(true, !!preserveFrame);
    PlexClient.preparePlayback(config, currentPlayback, currentPlayback.options, function (error, sourceUrl) {
      if (appView !== 'player') { return; }
      if (error || !sourceUrl) { recoverPlaybackError(); return; }
      if (playbackViolatesDirectOnly(currentPlayback)) { recoverPlaybackError(); return; }
      startTranscodeKeepalive();
      renderPlaybackInfo();
      video.pause();
      video.src = sourceUrl;
      video.load();
    });
  }

  function recoverPlaybackError() {
    var position = !currentPlayback ? 0 : (playerStreamSwitching ? Number(playerRecoveryState.position || 0) : playerAbsoluteTime());
    var offline = root.navigator && root.navigator.onLine === false;
    root.clearTimeout(playerRecoveryTimer);
    if (!currentPlayback || !playerRecoveryState.plan.length) {
      playerStreamSwitching = false;
      showPlayerError(false);
      return;
    }
    playerRecoveryState = PlaybackRecovery.fail(playerRecoveryState, offline, position);
    if (playerRecoveryState.status === 'waiting-network') {
      playerStreamSwitching = false;
      showPlayerError(true);
      return;
    }
    if (playerRecoveryState.status === 'failed') {
      playerStreamSwitching = false;
      showPlayerError(false);
      return;
    }
    playerRecoveryTimer = root.setTimeout(function () { applyCurrentPlaybackAttempt(true); }, 350);
  }

  function retryPlaybackFromError() {
    var retryAction = playerErrorRetryAction;
    hidePlayerError();
    playerErrorRetryAction = null;
    if (retryAction) { retryAction(); return; }
    if (!currentPlayback) { startCurrentPlayback(); return; }
    playerRecoveryState = PlaybackRecovery.retry(playerRecoveryState);
    applyCurrentPlaybackAttempt(true);
  }

  function handlePlayerErrorKey(event, direction) {
    if (!playerErrorVisible) { return false; }
    if (direction === 'left' || direction === 'right') {
      playerErrorIndex = Math.max(0, Math.min(2, playerErrorIndex + (direction === 'left' ? -1 : 1)));
      if (document.querySelectorAll('.player-error-actions button')[playerErrorIndex].disabled) {
        playerErrorIndex = direction === 'left' ? 2 : 1;
      }
      updatePlayerErrorFocus();
    } else if (event.keyCode === 13) {
      if (playerErrorIndex === 0) { retryPlaybackFromError(); }
      else if (playerErrorIndex === 1) { hidePlayerError(); setSettingsOpen(true); }
      else { hidePlayerError(); closePlayer(); }
    } else if (event.keyCode === 27 || event.keyCode === 461) {
      hidePlayerError(); closePlayer();
    }
    return true;
  }

  function renderResumeChoice() {
    var buttons = document.querySelectorAll('.resume-choice-actions button');
    var index;
    setText('resume-choice-title', t('player.resumeTitle'));
    setText('resume-choice-resume', t('player.resumeFrom', { time: formatLongTime(resumeChoiceState.offset) }));
    setText('resume-choice-restart', t('player.playFromBeginning'));
    setText('resume-choice-cancel', t('player.cancel'));
    for (index = 0; index < buttons.length; index += 1) {
      buttons[index].className = index === resumeChoiceState.index ? 'is-focused' : '';
    }
    if (!pointerSelectionActive && buttons[resumeChoiceState.index]) { buttons[resumeChoiceState.index].focus(); }
  }

  function showPlayerSurface() {
    appView = 'player';
    hidePlayerError();
    backgroundAudio.stop();
    resetSkipPrompt();
    initializePlayerControlsHidden();
    document.getElementById('detail-view').className = 'detail-view is-hidden';
    document.getElementById('player-view').className = 'player-view';
    document.getElementById('player-view').style.backgroundImage = 'none';
  }

  function cancelResumeChoice() {
    resumeChoiceVisible = false;
    resumeChoiceState = null;
    document.getElementById('resume-choice').className = 'resume-choice is-hidden';
    if (typeof restorePlaylistDirectPlayOrigin === 'function' && restorePlaylistDirectPlayOrigin()) { return; }
    document.getElementById('player-view').className = 'player-view is-hidden';
    document.getElementById('detail-view').className = 'detail-view';
    appView = 'detail';
    updateDetailFocus();
    scheduleTheme(currentDetail);
  }

  function beginPlayer(startOffset) {
    showPlayerSurface();
    if (typeof completePlaylistDirectPlayStart === 'function') { completePlaylistDirectPlayStart(); }
    resumeChoiceVisible = false;
    resumeChoiceState = null;
    document.getElementById('resume-choice').className = 'resume-choice is-hidden';
    startCurrentPlayback(startOffset);
  }

  function activateResumeChoice() {
    var result = ResumeChoice.select(resumeChoiceState);
    if (result.action === 'cancel') { cancelResumeChoice(); return; }
    beginPlayer(result.offset);
  }

  function handleResumeChoiceKey(event, direction) {
    if (!resumeChoiceVisible) { return false; }
    if (direction === 'left' || direction === 'right') {
      resumeChoiceState = ResumeChoice.move(resumeChoiceState, direction === 'left' ? -1 : 1);
      renderResumeChoice();
    } else if (event.keyCode === 13 || event.keyCode === 415) {
      activateResumeChoice();
    } else if (event.keyCode === 27 || event.keyCode === 461) {
      ResumeChoice.cancel();
      cancelResumeChoice();
    }
    return true;
  }

  function startCurrentPlayback(startOffset, versionAffinity) {
    var session = 'ploff-' + new Date().getTime();
    resetSkipPrompt();
    cancelLocalSubtitleRequest();
    failedSubtitleStreams = {};
    localSubtitleState = null;
    renderPlayerTitle(currentDetail);
    setText('player-status', t('status.preparing'));
    playerBufferingIndicator.stop();
    playerStreamSwitching = true;
    setPlayerLoading(true);
    PlexClient.loadPlayback(config, currentDetail.ratingKey, session, detailPlaybackPreferences(versionAffinity), function (error, playback) {
      var video;
      var resolvedStart;
      if (error || appView !== 'player') {
        if (error) { lastDiagnosticsError = DiagnosticsState.sanitizeText(error); }
        playerStreamSwitching = false; setText('player-status', t('status.streamError')); showPlayerError(false); return;
      }
      currentPlayback = playback;
      if (versionAffinity) {
        detailPreferenceState.setVersion(playback.mediaIndex, playback.partIndex);
      }
      resolvedStart = startOffset === null || startOffset === undefined
        ? Math.max(0, Number(playback.resumePosition || 0))
        : Math.max(0, Number(startOffset || 0));
      currentPlayback.resumePosition = resolvedStart;
      currentPlayback.options.offset = resolvedStart;
      currentPlayback.offsetBase = resolvedStart;
      anchorPlayerClock(resolvedStart, true);
      currentPlayback.requestedPlaybackMode = playback.options.playbackMode || 'auto';
      currentPlayback.requestedVideoQuality = playback.options.videoQuality || 'original';
      configureLocalSubtitlePlayback(currentPlayback, function () {
        if (appView !== 'player' || currentPlayback !== playback) { return; }
        playerRecoveryState = PlaybackRecovery.create(playbackPlanFor(playback));
        playerRecoveryState.position = resolvedStart;
        renderPlaybackInfo();
        video = document.getElementById('player-video');
        video.autoplay = true;
        updateEpisodeCommands();
        updatePlaylistQueueButton();
        playerZone = 'buttons'; playerButtonIndex = 1; updatePlayerButtonFocus(); initializePlayerControlsHidden();
        root.clearInterval(timelineTimer);
        timelineTimer = root.setInterval(function () { sendPlayerTimeline(video.paused ? 'paused' : 'playing'); }, 3000);
        startEstimatedEndTimer();
        applyCurrentPlaybackAttempt(false);
      });
    });
  }

  function openPlayer() {
    if (appView === 'detail' && (!currentDetail || !currentDetail.ratingKey ||
        currentDetail.type === 'show' || currentDetail.type === 'season')) {
      detailPlayPending = true;
      return;
    }
    if (!currentDetail || !currentDetail.ratingKey) { showMessage(t('status.metadataUnavailable')); return; }
    detailPlayPending = false;
    resumeChoiceState = ResumeChoice.create(currentDetail.viewOffset);
    if (!resumeChoiceState.visible) { beginPlayer(null); return; }
    showPlayerSurface();
    resumeChoiceVisible = true;
    document.getElementById('resume-choice').className = 'resume-choice';
    renderResumeChoice();
  }

  function switchPlayerEpisode(direction) {
    var context = episodeNavigationContext();
    var video = document.getElementById('player-video');
    var preferenceSnapshot = detailPreferenceState.snapshot();
    var versionAffinity = null;
    var versionIndex;
    if (preferenceSnapshot.override && preferenceSnapshot.override.mediaIndex !== null && currentPlayback && VersionSelection) {
      for (versionIndex = 0; versionIndex < (currentPlayback.mediaVersions || []).length; versionIndex += 1) {
        if (currentPlayback.mediaVersions[versionIndex].mediaIndex === currentPlayback.mediaIndex &&
            currentPlayback.mediaVersions[versionIndex].partIndex === currentPlayback.partIndex) {
          versionAffinity = VersionSelection.signature(currentPlayback.mediaVersions[versionIndex]);
          break;
        }
      }
    }
    if (!context || !episodeResolver.canMove(context, direction)) { return; }
    episodeResolver.resolve(context, direction, function (navigationError, target) {
      if (navigationError || appView !== 'player') {
        if (appView === 'player') {
          lastDiagnosticsError = DiagnosticsState.sanitizeText(navigationError || t('status.streamError'));
          setText('player-status', t('status.streamError'));
          showPlayerError(false, function () { switchPlayerEpisode(direction); });
        }
        return;
      }
      PlexClient.loadMetadata(config, target.episode.ratingKey, function (metadataError, detail) {
        var index;
        if (metadataError || appView !== 'player') {
          if (appView === 'player') {
            lastDiagnosticsError = DiagnosticsState.sanitizeText(metadataError || t('status.metadataUnavailable'));
            setText('player-status', t('status.streamError'));
            showPlayerError(false, function () { switchPlayerEpisode(direction); });
          }
          return;
        }
        resetSkipPrompt();
        cancelAutoplayCountdown();
        sendPlayerTimeline('stopped');
        playerBufferingIndicator.stop();
        playerStreamSwitching = true;
        setPlayerLoading(true);
        root.clearInterval(timelineTimer);
        root.clearInterval(estimatedEndTimer);
        video.pause();
        video.removeAttribute('src');
        video.load();
        detailSeasonIndex = target.seasonIndex;
        seriesContext.episodes = target.episodes;
        detailEpisodeIndex = target.episodeIndex;
        for (index = 0; index < seriesContext.seasons.length; index += 1) {
          seriesContext.seasons[index].selected = index === detailSeasonIndex;
        }
        currentDetail = detail;
        queueDetailMediaProfile(detail);
        renderSeasonTabs();
        renderEpisodeStrip();
        startCurrentPlayback(null, versionAffinity);
      });
    });
  }

  function closePlayer() {
    var video = document.getElementById('player-video');
    var playbackRatingKey = currentPlayback && currentPlayback.ratingKey;
    playerBufferingIndicator.stop();
    capturePlaybackDiagnostics();
    sendFinalPlayerTimeline(function (absoluteTime, reported) {
      if (reported) { applyLocalPlaybackProgress(playbackRatingKey, absoluteTime); }
      refreshEpisodePlaybackState(playbackRatingKey, absoluteTime);
    }); stopTranscodeKeepalive(); root.clearInterval(timelineTimer); root.clearInterval(estimatedEndTimer); root.clearTimeout(playerControlsTimer); root.clearTimeout(playerResumeTimer); root.clearTimeout(playerSeekTimer); root.clearTimeout(playerRecoveryTimer); root.clearTimeout(playerClockRepairTimer); root.clearTimeout(playerClockRepairFallbackTimer); root.clearTimeout(playerNativeSeekVerificationTimer); cancelAutoplayCountdown(); resetSkipPrompt();
    pendingPlayerSeek = null;
    resetChapterDrawer();
    closePlaylistQueueDrawer(false);
    abortSubtitleEditorRequest();
    if (subtitleEditorState) {
      subtitleEditorState.finalizing = true;
      restoreSubtitlePreviewOffsets(subtitleEditorState, '', function () {});
    }
    stopSubtitlePreviewClock();
    root.clearTimeout(subtitlePanelTransitionTimer);
    subtitlePanelTransitionTimer = null;
    cancelLocalSubtitleRequest();
    subtitleEditorOpen = false;
    subtitleEditorState = null;
    playerTimelineSuppressed = false;
    pendingPlaybackRestore = null;
    playbackClock = PlaybackClock.create(2);
    playerBuffering = false;
    playerNativeSeekPending = false;
    playerNativeSeekTarget = null;
    playerNativeSeekVerificationTimer = null;
    playerClockRepairTimer = null;
    playerClockRepairFallbackTimer = null;
    localSubtitleState = null;
    document.getElementById('subtitle-editor').className = 'subtitle-editor is-hidden';
    document.getElementById('player-controls').style.opacity = '';
    document.getElementById('player-controls').style.pointerEvents = '';
    document.getElementById('player-controls').style.transition = '';
    document.getElementById('player-settings').style.opacity = '';
    document.getElementById('player-settings').style.pointerEvents = '';
    document.getElementById('player-settings').style.transition = '';
    document.getElementById('subtitle-preview-overlay').className = 'subtitle-preview-overlay is-hidden';
    resumeChoiceVisible = false;
    resumeChoiceState = null;
    document.getElementById('resume-choice').className = 'resume-choice is-hidden';
    episodeResolver.cancel();
    settingsOpen = false; playerStreamSwitching = false; video.pause(); video.removeAttribute('src'); video.load(); currentPlayback = null;
    setPlayerLoading(false);
    hidePlayerError();
    playerErrorRetryAction = null;
    playerRecoveryState = PlaybackRecovery.create([]);
    playerBackArmed = false;
    document.getElementById('player-settings').className = 'player-settings is-hidden';
    document.getElementById('player-view').className = 'player-view is-hidden';
    if (typeof restorePlaylistDirectPlayOrigin === 'function' && restorePlaylistDirectPlayOrigin()) { return; }
    appView = 'detail'; detailBackLockedUntil = new Date().getTime() + 700;
    document.getElementById('detail-view').className = 'detail-view'; ensureDetailMediaProfile(currentDetail); updateDetailFocus();
    scheduleTheme(currentDetail);
  }
  function playlistQueuePlayable(items) {
    return (items || []).filter(function (item) {
      return !!(item && item.ratingKey && (item.type === 'episode' || item.type === 'movie'));
    });
  }

  function playlistQueueFindIndex(items, ratingKey, preferredIndex) {
    var preferred = Number(preferredIndex);
    var index;
    if (isFinite(preferred) && items[preferred] && String(items[preferred].ratingKey) === String(ratingKey || '')) {
      return preferred;
    }
    for (index = 0; index < items.length; index += 1) {
      if (String(items[index].ratingKey || '') === String(ratingKey || '')) { return index; }
    }
    return -1;
  }

  function playlistQueueItemTitle(item) {
    var detail = String(item && item.detail || '');
    if (item && item.type === 'episode' && detail) {
      return detail.replace(/^E0*[0-9]+\s*-\s*/, '') || String(item.title || '');
    }
    return String(item && item.title || '');
  }

  function playlistQueuePad(value) {
    var text = String(Math.max(0, Number(value || 0)));
    return text.length < 2 ? '0' + text : text;
  }

  function playlistQueueEpisodeNumbers(item) {
    var hasSeason = !!(item && (item.queueSeasonNumber !== undefined || item.seasonIndex !== undefined));
    var hasEpisode = !!(item && (item.queueEpisodeNumber !== undefined || item.episodeIndex !== undefined));
    var season = Number(item && (item.queueSeasonNumber !== undefined ? item.queueSeasonNumber : item.seasonIndex) || 0);
    var episode = Number(item && (item.queueEpisodeNumber !== undefined ? item.queueEpisodeNumber : item.episodeIndex) || 0);
    var match;
    if (!hasSeason && item && item.meta) {
      match = String(item.meta).match(/(?:Season|Stagione)\s+0*([0-9]+)/i);
      if (match) { season = Number(match[1]); hasSeason = true; }
    }
    if (!hasEpisode && item && item.detail) {
      match = String(item.detail).match(/^E0*([0-9]+)/i);
      if (match) { episode = Number(match[1]); hasEpisode = true; }
    }
    return item && item.type === 'episode' && hasEpisode
      ? { season: hasSeason ? season : 0, episode: episode }
      : null;
  }

  function playbackQueueItemDisplayTitle(item) {
    var title = playlistQueueItemTitle(item);
    var numbers = playlistQueueEpisodeNumbers(item);
    if (!numbers) { return title; }
    return 'S' + playlistQueuePad(numbers.season) + 'E' + playlistQueuePad(numbers.episode) +
      (title ? ' - ' + title : '');
  }

  function playbackQueueTypeLabel(item) {
    var italian = String(appSettings && appSettings.uiLanguage || 'en').toLowerCase().indexOf('it') === 0;
    return item && item.type === 'episode' ? (italian ? 'SERIE' : 'SERIES') : (italian ? 'FILM' : 'MOVIE');
  }

  function playlistQueueFirstUnwatchedIndex(items) {
    var source = items || [];
    var index;
    for (index = 0; index < source.length; index += 1) {
      if (!source[index].viewed) { return index; }
    }
    return source.length ? 0 : -1;
  }

  function createPlaylistQueue(items, ratingKey, title, preferredIndex) {
    var sourceItems = items || [];
    var preferred = Number(preferredIndex);
    var playable = playlistQueuePlayable(sourceItems);
    var playablePreferredIndex = preferred;
    var index;
    if (isFinite(preferred) && preferred >= 0 && preferred < sourceItems.length &&
        playlistQueuePlayable([sourceItems[preferred]]).length) {
      playablePreferredIndex = playlistQueuePlayable(sourceItems.slice(0, preferred)).length;
    }
    index = playlistQueueFindIndex(playable, ratingKey, playablePreferredIndex);
    if (index < 0) { return null; }
    return { kind: 'container', items: playable, index: index, title: String(title || 'Queue') };
  }

  function playlistQueueSeriesContext(context) {
    return {
      playlistQueue: true,
      seasons: [{ ratingKey: 'playlist', index: 1, title: context.title, selected: true }],
      episodes: context.items.map(function (item, index) {
        return {
          ratingKey: item.ratingKey,
          type: item.type,
          title: playlistQueueItemTitle(item),
          index: index + 1,
          image: item.image || '',
          viewed: !!item.viewed,
          progress: Number(item.progress || 0),
          selected: index === context.index
        };
      })
    };
  }


  function playlistQueueUpcoming(items, currentIndex) {
    var source = items || [];
    var start = Math.max(0, Math.min(source.length, Number(currentIndex) || 0));
    return source.slice(start);
  }

  function playlistQueueFocusedIndex(currentIndex, requestedIndex, length) {
    var maximum = Math.max(0, Number(length || 0) - 1);
    var minimum = Math.max(0, Math.min(maximum, Number(currentIndex) || 0));
    return Math.max(minimum, Math.min(maximum, Number(requestedIndex) || 0));
  }

  function playbackQueueContainerKind(container) {
    var kind = String(container && container.containerType || '');
    return kind === 'playlist' || kind === 'collection' ? kind : '';
  }

  function seriesQueueItems(season, seasonIndex, episodes, startIndex) {
    var source = episodes || [];
    var start = Math.max(0, Math.min(source.length, Number(startIndex) || 0));
    var result = [];
    var episode;
    var index;
    for (index = start; index < source.length; index += 1) {
      episode = source[index];
      if (!episode || !episode.ratingKey) { continue; }
      result.push({
        ratingKey: episode.ratingKey,
        type: 'episode',
        title: playlistQueueItemTitle(episode),
        detail: episode.detail || '',
        image: episode.image || '',
        viewed: !!episode.viewed,
        progress: Number(episode.progress || 0),
        index: Number(episode.index || index + 1),
        queueSeasonIndex: Number(seasonIndex || 0),
        queueEpisodeIndex: index,
        queueSeasonNumber: Number(season && season.index || Number(seasonIndex || 0) + 1),
        queueEpisodeNumber: Number(episode.index || index + 1),
        queueEpisodes: source
      });
    }
    return result;
  }

  var playlistPlaybackQueue = null;
  var playlistPlaybackRequest = null;
  var playlistPlaybackLoadToken = 0;
  var playlistPlaybackAutoToken = 0;
  var seriesPlaybackQueue = null;
  var seriesPlaybackRequest = null;
  var seriesPlaybackLoadToken = 0;
  var playlistQueueDrawerOpen = false;
  var playlistQueueDrawerIndex = 0;
  var playlistQueueDrawerFocusReady = false;
  var playlistQueueDrawerFocusTimer = null;
  var playlistDirectPlayToken = 0;
  var playlistDirectPlayOrigin = false;
  var playlistDirectPlayPending = false;


  function playlistQueueLabel() {
    return String(appSettings && appSettings.uiLanguage || 'en').toLowerCase().indexOf('it') === 0 ? 'Coda' : 'Queue';
  }

  function seriesQueueEligible() {
    return !!(seriesContext && !seriesContext.playlistQueue && currentDetail && currentDetail.type === 'episode' &&
      seriesContext.seasons && seriesContext.seasons.length && seriesContext.episodes && seriesContext.episodes.length);
  }

  function seriesQueueIdentity() {
    var showKey = currentDetail && (currentDetail.showRatingKey || currentDetail.title) || '';
    var seasonKeys = seriesContext && seriesContext.seasons ? seriesContext.seasons.map(function (season) {
      return String(season && season.ratingKey || '');
    }).join(',') : '';
    return String(showKey) + '|' + seasonKeys;
  }

  function resetSeriesPlaybackQueue() {
    seriesPlaybackLoadToken += 1;
    if (seriesPlaybackRequest && seriesPlaybackRequest.abort) { seriesPlaybackRequest.abort(); }
    seriesPlaybackRequest = null;
    seriesPlaybackQueue = null;
  }

  function seriesQueueCurrentIndex(queue) {
    var items = queue && queue.items || [];
    var ratingKey = currentDetail && currentDetail.ratingKey;
    var index;
    for (index = 0; index < items.length; index += 1) {
      if (Number(items[index].queueSeasonIndex) === Number(detailSeasonIndex) &&
          Number(items[index].queueEpisodeIndex) === Number(detailEpisodeIndex)) { return index; }
    }
    return playlistQueueFindIndex(items, ratingKey, 0);
  }

  function seriesQueueContainsCurrent(queue) {
    return seriesQueueCurrentIndex(queue) >= 0;
  }

  function createSeriesPlaybackQueue() {
    var season;
    var items;
    if (!seriesQueueEligible()) { return null; }
    season = seriesContext.seasons[detailSeasonIndex];
    items = seriesQueueItems(season, detailSeasonIndex, seriesContext.episodes, detailEpisodeIndex);
    if (!items.length) { return null; }
    return {
      kind: 'series',
      identity: seriesQueueIdentity(),
      title: String(currentDetail.title || playlistQueueLabel()),
      items: items,
      index: 0,
      loadedThrough: detailSeasonIndex,
      loading: false,
      complete: false
    };
  }

  function hydrateSeriesPlaybackQueue(queue) {
    var seasons = seriesContext.seasons.slice(0);
    var token = seriesPlaybackLoadToken += 1;
    function renderIfOpen() {
      if (playlistQueueDrawerOpen && seriesPlaybackQueue === queue) {
        renderPlaylistQueueDrawer();
        updatePlaylistQueueDrawerFocus();
      }
    }
    function loadNext(seasonIndex) {
      var season;
      if (token !== seriesPlaybackLoadToken || seriesPlaybackQueue !== queue) { return; }
      while (seasonIndex < seasons.length && !EpisodeNavigation.isRegularSeason(seasons[seasonIndex])) { seasonIndex += 1; }
      if (seasonIndex >= seasons.length) {
        queue.loading = false;
        queue.complete = true;
        seriesPlaybackRequest = null;
        renderIfOpen();
        return;
      }
      season = seasons[seasonIndex];
      queue.loading = true;
      seriesPlaybackRequest = PlexClient.loadSeasonEpisodes(config, season.ratingKey, '', function (error, episodes) {
        if (token !== seriesPlaybackLoadToken || seriesPlaybackQueue !== queue) { return; }
        seriesPlaybackRequest = null;
        if (!error && episodes && episodes.length) {
          queue.items = queue.items.concat(seriesQueueItems(season, seasonIndex, episodes, 0));
          queue.loadedThrough = seasonIndex;
          renderIfOpen();
        }
        loadNext(seasonIndex + 1);
      });
    }
    loadNext(detailSeasonIndex + 1);
  }

  function ensureSeriesPlaybackQueue() {
    var identity;
    if (!seriesQueueEligible()) { resetSeriesPlaybackQueue(); return null; }
    identity = seriesQueueIdentity();
    if (seriesPlaybackQueue && seriesPlaybackQueue.identity === identity && seriesQueueContainsCurrent(seriesPlaybackQueue)) {
      return seriesPlaybackQueue;
    }
    resetSeriesPlaybackQueue();
    seriesPlaybackQueue = createSeriesPlaybackQueue();
    if (seriesPlaybackQueue) { hydrateSeriesPlaybackQueue(seriesPlaybackQueue); }
    return seriesPlaybackQueue;
  }

  function playbackQueueModel() {
    if (playlistPlaybackQueue && playlistPlaybackQueue.items && playlistPlaybackQueue.items.length &&
        seriesContext && seriesContext.playlistQueue) { return playlistPlaybackQueue; }
    return ensureSeriesPlaybackQueue();
  }

  function ensurePlaylistQueueUi() {
    var row;
    var settings;
    var button;
    var drawer;
    var header;
    if (document.getElementById('player-playlist-queue-button')) { return; }
    row = document.querySelector('.player-buttons');
    settings = document.getElementById('player-settings-button');
    if (!row || !settings) { return; }
    button = element('button', 'player-button player-icon-button player-playlist-queue-command is-unavailable');
    button.id = 'player-playlist-queue-button';
    button.type = 'button';
    button.setAttribute('aria-controls', 'player-playlist-queue');
    button.setAttribute('aria-expanded', 'false');
    button.appendChild(element('span', 'playlist-queue-icon-line'));
    button.appendChild(element('span', 'playlist-queue-icon-line'));
    button.appendChild(element('span', 'playlist-queue-icon-line'));
    row.insertBefore(button, settings);
    drawer = element('aside', 'player-playlist-queue');
    drawer.id = 'player-playlist-queue';
    drawer.setAttribute('aria-hidden', 'true');
    header = element('div', 'player-playlist-queue-header');
    header.appendChild(element('h3', 'player-playlist-queue-title'));
    header.appendChild(element('span', 'player-playlist-queue-position'));
    drawer.appendChild(header);
    drawer.appendChild(element('div', 'player-playlist-queue-list'));
    document.getElementById('player-view').appendChild(drawer);
  }

  function playlistQueueCurrentIndex(queue) {
    if (queue && queue.kind === 'series') { return Math.max(0, seriesQueueCurrentIndex(queue)); }
    if (seriesContext && seriesContext.playlistQueue && detailEpisodeIndex >= 0) { return detailEpisodeIndex; }
    return queue ? Math.max(0, Number(queue.index || 0)) : 0;
  }

  function playlistQueueAvailable() {
    return !!((playlistPlaybackQueue && playlistPlaybackQueue.items && playlistPlaybackQueue.items.length &&
      seriesContext && seriesContext.playlistQueue) || seriesQueueEligible());
  }

  function updatePlaylistQueueButton() {
    var button;
    var available;
    ensurePlaylistQueueUi();
    button = document.getElementById('player-playlist-queue-button');
    if (!button) { return; }
    available = playlistQueueAvailable();
    button.className = 'player-button player-icon-button player-playlist-queue-command' +
      (available ? '' : ' is-unavailable');
    button.setAttribute('aria-label', playlistQueueLabel());
    button.setAttribute('aria-expanded', playlistQueueDrawerOpen ? 'true' : 'false');
    if (!available && playlistQueueDrawerOpen) { closePlaylistQueueDrawer(false); }
  }

  function playlistQueueCardClass(index, currentIndex, focused) {
    return 'chapter-card playlist-queue-card' +
      (index === currentIndex ? ' is-current' : '') +
      (focused ? ' is-focused' : '');
  }

  function scrollPlaylistQueueFocus() {
    var list = document.querySelector('.player-playlist-queue-list');
    var card = list && list.querySelector('[data-playlist-queue-index="' + playlistQueueDrawerIndex + '"]');
    var top;
    var bottom;
    if (!list || !card) { return; }
    top = Number(card.offsetTop || 0);
    bottom = top + Number(card.offsetHeight || 0);
    if (top < list.scrollTop) { list.scrollTop = top; }
    else if (bottom > list.scrollTop + list.clientHeight) { list.scrollTop = bottom - list.clientHeight; }
  }

  function resetPlaylistQueueViewportScroll() {
    var drawer = document.getElementById('player-playlist-queue');
    var player = document.getElementById('player-view');
    if (root.scrollTo) { root.scrollTo(0, 0); }
    if (document.documentElement) { document.documentElement.scrollLeft = 0; }
    if (document.body) { document.body.scrollLeft = 0; }
    if (player) { player.scrollLeft = 0; }
    if (drawer) { drawer.scrollLeft = 0; }
  }

  function focusPlaylistQueueDrawerCard(card) {
    if (!card || !card.focus) { return; }
    resetPlaylistQueueViewportScroll();
    card.focus();
    resetPlaylistQueueViewportScroll();
  }

  function updatePlaylistQueueDrawerFocus() {
    var queue = playbackQueueModel();
    var cards = document.querySelectorAll('[data-playlist-queue-index]');
    var currentIndex;
    var cardIndex;
    var index;
    if (!queue) { return; }
    currentIndex = playlistQueueCurrentIndex(queue);
    for (index = 0; index < cards.length; index += 1) {
      cardIndex = Number(cards[index].getAttribute('data-playlist-queue-index'));
      cards[index].className = playlistQueueCardClass(cardIndex, currentIndex, cardIndex === playlistQueueDrawerIndex);
    }
    scrollPlaylistQueueFocus();
    resetPlaylistQueueViewportScroll();
    if (!pointerSelectionActive && playlistQueueDrawerFocusReady) {
      for (index = 0; index < cards.length; index += 1) {
        if (Number(cards[index].getAttribute('data-playlist-queue-index')) === playlistQueueDrawerIndex) {
          focusPlaylistQueueDrawerCard(cards[index]);
          break;
        }
      }
    }
  }

  function playbackQueueItemPosition(item, absoluteIndex, total) {
    return (absoluteIndex + 1) + '/' + total;
  }

  function renderPlaylistQueueDrawer() {
    var queue = playbackQueueModel();
    var drawer;
    var list;
    var title;
    var position;
    var currentIndex;
    var upcoming;
    var offset;
    var absoluteIndex;
    var item;
    var itemPosition;
    var itemTitle;
    var card;
    var image;
    var badge;
    var caption;
    ensurePlaylistQueueUi();
    drawer = document.getElementById('player-playlist-queue');
    list = drawer && drawer.querySelector('.player-playlist-queue-list');
    title = drawer && drawer.querySelector('.player-playlist-queue-title');
    position = drawer && drawer.querySelector('.player-playlist-queue-position');
    if (!drawer || !list || !queue) { return; }
    currentIndex = playlistQueueCurrentIndex(queue);
    playlistQueueDrawerIndex = playlistQueueFocusedIndex(currentIndex, playlistQueueDrawerIndex, queue.items.length);
    title.textContent = queue.title || playlistQueueLabel();
    position.textContent = (currentIndex + 1) + ' / ' + queue.items.length;
    list.innerHTML = '';
    upcoming = playlistQueueUpcoming(queue.items, currentIndex);
    for (offset = 0; offset < upcoming.length; offset += 1) {
      absoluteIndex = currentIndex + offset;
      item = upcoming[offset];
      itemPosition = playbackQueueItemPosition(item, absoluteIndex, queue.items.length);
      itemTitle = playbackQueueItemDisplayTitle(item);
      card = element('button', playlistQueueCardClass(absoluteIndex, currentIndex, absoluteIndex === playlistQueueDrawerIndex));
      card.type = 'button';
      card.setAttribute('data-playlist-queue-index', absoluteIndex);
      card.setAttribute('aria-label', playbackQueueTypeLabel(item) + ', ' + itemTitle + ', ' + itemPosition);
      image = element('img', 'chapter-card-image playlist-queue-card-image');
      image.alt = '';
      card.appendChild(image);
      badge = element('span', 'playlist-queue-card-badge', playbackQueueTypeLabel(item));
      card.appendChild(badge);
      caption = element('span', 'chapter-card-caption playlist-queue-card-caption');
      caption.appendChild(element('span', 'chapter-card-title playlist-queue-card-title', itemTitle));
      caption.appendChild(element('span', 'chapter-card-time', itemPosition));
      card.appendChild(caption);
      list.appendChild(card);
      if (item.image) { loadRenderedPoster(image, item.image, absoluteIndex === playlistQueueDrawerIndex ? 0 : 1, 'playlist-queue', 390, 160); }
    }
    root.setTimeout(scrollPlaylistQueueFocus, 0);
  }

  function openPlaylistQueueDrawer() {
    var queue;
    var drawer;
    var player;
    if (!playlistQueueAvailable() || appView !== 'player') { return; }
    queue = playbackQueueModel();
    if (!queue) { return; }
    ensurePlaylistQueueUi();
    closeChapterDrawer(false);
    cancelAutoplayCountdown();
    showPlayerControls();
    root.clearTimeout(playerControlsTimer);
    root.clearTimeout(playlistQueueDrawerFocusTimer);
    playlistQueueDrawerFocusTimer = null;
    playlistQueueDrawerOpen = true;
    playlistQueueDrawerFocusReady = false;
    playlistQueueDrawerIndex = playlistQueueCurrentIndex(queue);
    drawer = document.getElementById('player-playlist-queue');
    player = document.getElementById('player-view');
    drawer.className = 'player-playlist-queue is-open';
    drawer.setAttribute('aria-hidden', 'false');
    player.className = player.className.replace(/\s*has-playlist-queue-open/g, '') + ' has-playlist-queue-open';
    renderPlaylistQueueDrawer();
    updatePlaylistQueueButton();
    updatePlaylistQueueDrawerFocus();
    resetPlaylistQueueViewportScroll();
    playlistQueueDrawerFocusTimer = root.setTimeout(function () {
      playlistQueueDrawerFocusTimer = null;
      if (!playlistQueueDrawerOpen) { return; }
      playlistQueueDrawerFocusReady = true;
      updatePlaylistQueueDrawerFocus();
      resetPlaylistQueueViewportScroll();
    }, interfaceAnimationDuration(220));
  }

  function closePlaylistQueueDrawer(restoreFocus) {
    var drawer;
    var player;
    ensurePlaylistQueueUi();
    drawer = document.getElementById('player-playlist-queue');
    player = document.getElementById('player-view');
    playlistQueueDrawerOpen = false;
    playlistQueueDrawerFocusReady = false;
    root.clearTimeout(playlistQueueDrawerFocusTimer);
    playlistQueueDrawerFocusTimer = null;
    if (drawer) {
      drawer.className = 'player-playlist-queue';
      drawer.setAttribute('aria-hidden', 'true');
    }
    if (player) { player.className = player.className.replace(/\s*has-playlist-queue-open/g, ''); }
    resetPlaylistQueueViewportScroll();
    updatePlaylistQueueButton();
    if (restoreFocus && appView === 'player') {
      playerZone = 'buttons';
      playerButtonIndex = 3;
      showPlayerControls();
      updatePlayerButtonFocus();
    }
  }

  function movePlaylistQueueDrawerFocus(direction) {
    var queue = playbackQueueModel();
    if (!queue) { return; }
    playlistQueueDrawerIndex = playlistQueueFocusedIndex(
      playlistQueueCurrentIndex(queue),
      playlistQueueDrawerIndex + direction,
      queue.items.length
    );
    updatePlaylistQueueDrawerFocus();
  }

  function playlistQueueVersionAffinity() {
    var snapshot = detailPreferenceState.snapshot();
    var index;
    if (!snapshot.override || snapshot.override.mediaIndex === null || !currentPlayback || !VersionSelection) { return null; }
    for (index = 0; index < (currentPlayback.mediaVersions || []).length; index += 1) {
      if (currentPlayback.mediaVersions[index].mediaIndex === currentPlayback.mediaIndex &&
          currentPlayback.mediaVersions[index].partIndex === currentPlayback.partIndex) {
        return VersionSelection.signature(currentPlayback.mediaVersions[index]);
      }
    }
    return null;
  }

  function switchPlayerQueueItem(index) {
    var queue = playbackQueueModel();
    var video = document.getElementById('player-video');
    var currentIndex;
    var target;
    var versionAffinity;
    if (!queue || appView !== 'player') { return; }
    currentIndex = playlistQueueCurrentIndex(queue);
    index = playlistQueueFocusedIndex(currentIndex, index, queue.items.length);
    if (index === currentIndex) { closePlaylistQueueDrawer(true); return; }
    target = queue.items[index];
    if (!target) { return; }
    versionAffinity = playlistQueueVersionAffinity();
    closePlaylistQueueDrawer(false);
    PlexClient.loadMetadata(config, target.ratingKey, function (metadataError, detail) {
      var itemIndex;
      if (metadataError || appView !== 'player') {
        if (appView === 'player') {
          lastDiagnosticsError = DiagnosticsState.sanitizeText(metadataError || t('status.metadataUnavailable'));
          setText('player-status', t('status.streamError'));
          showPlayerError(false, function () { switchPlayerQueueItem(index); });
        }
        return;
      }
      resetSkipPrompt();
      cancelAutoplayCountdown();
      sendPlayerTimeline('stopped');
      playerBufferingIndicator.stop();
      playerStreamSwitching = true;
      setPlayerLoading(true);
      root.clearInterval(timelineTimer);
      root.clearInterval(estimatedEndTimer);
      video.pause();
      video.removeAttribute('src');
      video.load();
      if (queue.kind === 'series') {
        detailSeasonIndex = Number(target.queueSeasonIndex || 0);
        seriesContext.episodes = target.queueEpisodes || [];
        detailEpisodeIndex = Number(target.queueEpisodeIndex || 0);
        for (itemIndex = 0; itemIndex < seriesContext.seasons.length; itemIndex += 1) {
          seriesContext.seasons[itemIndex].selected = itemIndex === detailSeasonIndex;
        }
      } else {
        detailSeasonIndex = 0;
        detailEpisodeIndex = index;
        playlistPlaybackQueue.index = index;
      }
      for (itemIndex = 0; itemIndex < seriesContext.episodes.length; itemIndex += 1) {
        seriesContext.episodes[itemIndex].selected = itemIndex === detailEpisodeIndex;
      }
      currentDetail = detail;
      queueDetailMediaProfile(detail);
      renderSeasonTabs();
      renderEpisodeStrip();
      updatePlaylistQueueButton();
      startCurrentPlayback(null, versionAffinity);
    });
  }

  function handlePlaylistQueuePointerOverCapture(event) {
    var button = closestButton(event.target);
    if (!playlistQueueDrawerOpen || !button || !button.hasAttribute('data-playlist-queue-index')) { return; }
    pointerSelectionActive = true;
    playlistQueueDrawerIndex = Number(button.getAttribute('data-playlist-queue-index'));
    updatePlaylistQueueDrawerFocus();
  }

  function clearPlaylistPlaybackQueue() {
    playlistPlaybackLoadToken += 1;
    playlistPlaybackAutoToken += 1;
    if (playlistPlaybackRequest && playlistPlaybackRequest.abort) { playlistPlaybackRequest.abort(); }
    playlistPlaybackRequest = null;
    playlistPlaybackQueue = null;
    resetSeriesPlaybackQueue();
    closePlaylistQueueDrawer(false);
    updatePlaylistQueueButton();
  }

  function playlistQueueContainer() {
    var snapshot = libraryLifecycle && libraryLifecycle.snapshot ? libraryLifecycle.snapshot() : null;
    var container = snapshot && snapshot.container;
    return playbackQueueContainerKind(container) ? container : null;
  }

  function applyHydratedPlaylistQueue(items, item, container, preferredIndex, token) {
    var activeIndex = preferredIndex;
    var activeRatingKey = item.ratingKey;
    var nextQueue;
    if (token !== playlistPlaybackLoadToken) { return; }
    if (seriesContext && seriesContext.playlistQueue && detailEpisodeIndex >= 0 && currentDetail) {
      activeIndex = detailEpisodeIndex;
      activeRatingKey = currentDetail.ratingKey;
    }
    nextQueue = createPlaylistQueue(items, activeRatingKey, container.title, activeIndex);
    if (!nextQueue) { return; }
    playlistPlaybackQueue = nextQueue;
    if (seriesContext && seriesContext.playlistQueue) {
      seriesContext = playlistQueueSeriesContext(nextQueue);
      detailSeasonIndex = 0;
      detailEpisodeIndex = nextQueue.index;
      if (appView === 'player') { updateEpisodeCommands(); }
    }
    updatePlaylistQueueButton();
    if (playlistQueueDrawerOpen) { renderPlaylistQueueDrawer(); updatePlaylistQueueDrawerFocus(); }
  }

  function hydratePlaylistPlaybackQueue(container, item, preferredIndex) {
    var token = playlistPlaybackLoadToken += 1;
    var items = [];
    function loadPage(start) {
      playlistPlaybackRequest = PlexClient.loadLibraryContainerPage(config, container, start, 60, function (error, page) {
        var total;
        if (token !== playlistPlaybackLoadToken) { return; }
        playlistPlaybackRequest = null;
        if (error || !page) { return; }
        items = items.concat(page.items || []);
        total = Math.max(items.length, Number(page.totalSize || 0));
        if (items.length < total) { loadPage(items.length); return; }
        applyHydratedPlaylistQueue(items, item, container, preferredIndex, token);
      });
    }
    loadPage(0);
  }

  function preparePlaylistPlaybackQueue(item) {
    var container = playlistQueueContainer();
    var grid = libraryGridView && libraryGridView.snapshot ? libraryGridView.snapshot() : null;
    var preferredIndex = grid && grid.focus ? Number(grid.focus.index || 0) : 0;
    clearPlaylistPlaybackQueue();
    if (!container || !grid || !item) { return false; }
    playlistPlaybackQueue = createPlaylistQueue(grid.items || [], item.ratingKey, container.title, preferredIndex);
    if (!playlistPlaybackQueue) { return false; }
    updatePlaylistQueueButton();
    hydratePlaylistPlaybackQueue(container, item, preferredIndex);
    return true;
  }

  function activatePlaylistPlaybackQueue() {
    var ratingKey = currentDetail && currentDetail.ratingKey;
    var activeIndex;
    if (!playlistPlaybackQueue || !ratingKey) { return false; }
    if (seriesContext && seriesContext.playlistQueue && seriesContext.episodes[detailEpisodeIndex] &&
        String(seriesContext.episodes[detailEpisodeIndex].ratingKey || '') === String(ratingKey)) {
      activeIndex = detailEpisodeIndex;
    } else {
      activeIndex = playlistQueueFindIndex(playlistPlaybackQueue.items, ratingKey, playlistPlaybackQueue.index);
    }
    if (activeIndex < 0) { clearPlaylistPlaybackQueue(); return false; }
    playlistPlaybackQueue.index = activeIndex;
    seriesContext = playlistQueueSeriesContext(playlistPlaybackQueue);
    detailSeasonIndex = 0;
    detailEpisodeIndex = activeIndex;
    updatePlaylistQueueButton();
    return true;
  }

  function finishPlaylistDirectPlayTransition() {
    root.setTimeout(function () {
      document.body.className = document.body.className.replace(/\s*is-playlist-direct-start/g, '');
    }, 0);
  }

  function completePlaylistDirectPlayStart() {
    playlistDirectPlayPending = false;
  }

  function restorePlaylistDirectPlayOrigin() {
    var focused;
    if (!playlistDirectPlayOrigin) { return false; }
    playlistDirectPlayToken += 1;
    playlistDirectPlayOrigin = false;
    playlistDirectPlayPending = false;
    finishPlaylistDirectPlayTransition();
    clearPlaylistPlaybackQueue();
    leaveDetail();
    appView = 'library';
    document.getElementById('content').style.display = 'none';
    document.getElementById('search-view').className = 'search-view is-hidden';
    document.getElementById('watchlist-view').className = 'watchlist-view is-hidden';
    document.getElementById('player-view').className = 'player-view is-hidden';
    document.getElementById('library-view').className = 'library-view' +
      (activeLibrary && activeLibrary.globalPlaylists ? ' is-global-playlists' : '');
    updateLibraryFocus();
    focused = libraryGridView && libraryGridView.focusedItem ? libraryGridView.focusedItem() : null;
    if (focused) { scheduleTheme(focused); }
    return true;
  }

  function failPlaylistDirectPlayStart(message) {
    restorePlaylistDirectPlayOrigin();
    showMessage(message || t('status.metadataUnavailable'));
  }

  function startPlaylistContainerPlayback(container) {
    var token;
    var items = [];
    if (!container || playbackQueueContainerKind(container) !== 'playlist' || playlistDirectPlayPending) { return false; }
    clearPlaylistPlaybackQueue();
    playlistDirectPlayOrigin = true;
    playlistDirectPlayPending = true;
    token = playlistDirectPlayToken += 1;
    document.body.className = document.body.className.replace(/\s*is-playlist-direct-start/g, '') + ' is-playlist-direct-start';

    function openTarget(playable) {
      var targetIndex = playlistQueueFirstUnwatchedIndex(playable);
      var target = targetIndex >= 0 ? playable[targetIndex] : null;
      if (!target || token !== playlistDirectPlayToken) { failPlaylistDirectPlayStart(t('status.mediaUnavailable')); return; }
      playlistPlaybackQueue = createPlaylistQueue(playable, target.ratingKey, container.title, targetIndex);
      if (!playlistPlaybackQueue) { failPlaylistDirectPlayStart(t('status.mediaUnavailable')); return; }
      prepareDetailTransition(target);
      selectedItem = target;
      detailReturnView = 'library';
      detailPlayPending = false;
      detailPreferenceState.clear();
      seriesContext = playlistQueueSeriesContext(playlistPlaybackQueue);
      detailSeasonIndex = 0;
      detailEpisodeIndex = playlistPlaybackQueue.index;
      detailZone = 'play';
      detailActionIndex = 0;
      appView = 'detail';
      setDetailViewMode(false);
      document.getElementById('detail-view').className = 'detail-view is-hidden';
      PlexClient.loadMetadata(config, target.ratingKey, function (error, detail) {
        if (token !== playlistDirectPlayToken || !playlistDirectPlayOrigin) { return; }
        if (error || !detail) { failPlaylistDirectPlayStart(t('status.metadataUnavailable')); return; }
        renderDetail(detail, true);
        activatePlaylistPlaybackQueue();
        openPlayer();
        finishPlaylistDirectPlayTransition();
      });
    }

    function loadPage(start) {
      playlistPlaybackRequest = PlexClient.loadLibraryContainerPage(config, container, start, 60, function (error, page) {
        var total;
        if (token !== playlistDirectPlayToken) { return; }
        playlistPlaybackRequest = null;
        if (error || !page) { failPlaylistDirectPlayStart(t('status.libraryUnavailable')); return; }
        items = items.concat(page.items || []);
        total = Math.max(items.length, Number(page.totalSize || 0));
        if (items.length < total) { loadPage(items.length); return; }
        openTarget(playlistQueuePlayable(items));
      });
    }

    loadPage(0);
    return true;
  }

  function consumePlaylistEvent(event) {
    if (event.preventDefault) { event.preventDefault(); }
    if (event.stopImmediatePropagation) { event.stopImmediatePropagation(); }
    else if (event.stopPropagation) { event.stopPropagation(); }
  }

  function openPlaylistLibraryItem(item, playImmediately) {
    var token;
    var attempts = 0;
    if (!preparePlaylistPlaybackQueue(item)) { return false; }
    if (!playImmediately) { openDetail(item); return true; }
    token = playlistPlaybackAutoToken;
    openDetail(item);
    function attemptPlayback() {
      if (token !== playlistPlaybackAutoToken || appView !== 'detail') { return; }
      if (currentDetail && currentDetail.ratingKey && String(currentDetail.ratingKey) === String(item.ratingKey)) {
        activatePlaylistPlaybackQueue();
        openPlayer();
        return;
      }
      attempts += 1;
      if (attempts < 240) { root.setTimeout(attemptPlayback, 25); }
    }
    root.setTimeout(attemptPlayback, 0);
    return true;
  }

  function clearPlaylistQueueForExternalSelection(button) {
    if (!button) { return; }
    if (button.hasAttribute('data-row-index') || button.hasAttribute('data-search-index') ||
        button.hasAttribute('data-watchlist-index') || button.hasAttribute('data-episode-position') ||
        button.hasAttribute('data-nav-index')) {
      clearPlaylistPlaybackQueue();
    }
  }

  function handlePlaylistQueueKeyCapture(event) {
    var item;
    var playImmediately;
    if (playlistDirectPlayPending && appView !== 'player') {
      consumePlaylistEvent(event);
      if (event.keyCode === 27 || event.keyCode === 461) { restorePlaylistDirectPlayOrigin(); }
      return;
    }
    if (appView === 'player') {
      if (playlistQueueDrawerOpen) {
        consumePlaylistEvent(event);
        if (event.keyCode === 38) { movePlaylistQueueDrawerFocus(-1); }
        else if (event.keyCode === 40) { movePlaylistQueueDrawerFocus(1); }
        else if (event.keyCode === 13 || event.keyCode === 415) { switchPlayerQueueItem(playlistQueueDrawerIndex); }
        else if (event.keyCode === 27 || event.keyCode === 461 || event.keyCode === 37) { closePlaylistQueueDrawer(true); }
        return;
      }
      if (playerControlsMode === 'full' && playerZone === 'buttons' && playerButtonIndex === 3 &&
          (event.keyCode === 13 || event.keyCode === 415)) {
        consumePlaylistEvent(event);
        openPlaylistQueueDrawer();
        return;
      }
    }
    if (appView === 'library' && libraryZone === 'grid' && event.keyCode === 415) {
      item = libraryGridView.focusedItem();
      if (item && item.containerKey && playbackQueueContainerKind(item) === 'playlist') {
        consumePlaylistEvent(event);
        startPlaylistContainerPlayback(item);
        return;
      }
    }
    if (appView === 'library' && libraryZone === 'grid' && (event.keyCode === 13 || event.keyCode === 415)) {
      item = libraryGridView.focusedItem();
      if (playlistQueueContainer() && item && !item.containerKey && playlistQueuePlayable([item]).length) {
        consumePlaylistEvent(event);
        playImmediately = event.keyCode === 415;
        openPlaylistLibraryItem(item, playImmediately);
        return;
      }
      clearPlaylistPlaybackQueue();
      return;
    }
    if (appView === 'detail' && playlistPlaybackQueue && currentDetail &&
        (event.keyCode === 13 || event.keyCode === 415) && detailZone === 'episodes') {
      clearPlaylistPlaybackQueue();
      return;
    }
    if (appView === 'detail' && playlistPlaybackQueue && currentDetail &&
        ((event.keyCode === 415 && detailZone !== 'episodes') ||
         (event.keyCode === 13 && detailZone === 'play' && detailActionIndex === 0))) {
      if (activatePlaylistPlaybackQueue()) {
        consumePlaylistEvent(event);
        openPlayer();
      }
      return;
    }
    if ((event.keyCode === 13 || event.keyCode === 415) && navigationHasFocus()) {
      clearPlaylistPlaybackQueue();
      return;
    }
    if ((appView === 'home' || appView === 'search' || appView === 'watchlist') &&
        (event.keyCode === 13 || event.keyCode === 415)) {
      clearPlaylistPlaybackQueue();
    }
  }

  function handlePlaylistQueuePointerCapture(event) {
    var button = closestButton(event.target);
    var item;
    if (playlistDirectPlayPending && appView !== 'player') { consumePlaylistEvent(event); return; }
    if (!button || button.disabled) { return; }
    if (appView === 'player' && button.id === 'player-playlist-queue-button') {
      consumePlaylistEvent(event);
      openPlaylistQueueDrawer();
      return;
    }
    if (appView === 'player' && playlistQueueDrawerOpen && button.hasAttribute('data-playlist-queue-index')) {
      consumePlaylistEvent(event);
      playlistQueueDrawerIndex = Number(button.getAttribute('data-playlist-queue-index'));
      switchPlayerQueueItem(playlistQueueDrawerIndex);
      return;
    }
    if (appView === 'player' && playlistQueueDrawerOpen) { consumePlaylistEvent(event); return; }
    if (appView === 'library' && (button.hasAttribute('data-library-index') || button.hasAttribute('data-library-recommendation-row'))) {
      libraryGridView.pointerFocus(button);
      item = libraryGridView.focusedItem();
      if (playlistQueueContainer() && item && !item.containerKey && playlistQueuePlayable([item]).length) {
        consumePlaylistEvent(event);
        openPlaylistLibraryItem(item, false);
        return;
      }
      clearPlaylistPlaybackQueue();
      return;
    }
    if (appView === 'detail' && button.id === 'detail-play' && activatePlaylistPlaybackQueue()) {
      consumePlaylistEvent(event);
      openPlayer();
      return;
    }
    clearPlaylistQueueForExternalSelection(button);
  }

  ensurePlaylistQueueUi();
  updatePlaylistQueueButton();
  document.addEventListener('keydown', handlePlaylistQueueKeyCapture, true);
  document.addEventListener('click', handlePlaylistQueuePointerCapture, true);
  document.addEventListener('mouseover', handlePlaylistQueuePointerOverCapture, true);
  // Global input dispatch, view closure, event wiring, Home loading, bootstrap.
  function leaveDetail() {
    root.clearTimeout(detailTransitionTimer);
    root.clearTimeout(detailTransitionEndTimer);
    detailTransitionTimer = null;
    detailTransitionEndTimer = null;
    document.body.className = document.body.className.replace(/\s*is-detail-transitioning|\s*is-detail-transition-revealing|\s*is-detail-closing|\s*is-detail-returning/g, '');
    hideViewState();
    hideDetailMetadataStatus();
    setDetailViewMode(false);
    document.body.className = document.body.className.replace(/\s*is-movie-detail/g, '');
    selectedItem = null;
    detailPlayPending = false;
    currentDetail = null;
    detailPreferenceState.clear();
    detailMediaProfileRatingKey = '';
    detailMediaProfileLoading = false;
    seasonTransitionMediaKey = '';
    detailMediaLoadingLabelVisible = false;
    detailMediaProfileToken += 1;
    root.clearTimeout(detailMediaProfileTimer);
    detailMediaProfileTimer = null;
    root.clearTimeout(detailMediaLoadingLabelTimer);
    detailMediaLoadingLabelTimer = null;
    if (detailMediaProfileRequest && detailMediaProfileRequest.abort) { detailMediaProfileRequest.abort(); }
    detailMediaProfileRequest = null;
    seriesContext = null;
    episodeResolver.cancel();
    root.clearTimeout(detailMetadataTimer);
    root.clearTimeout(seasonPreviewTimer);
    seasonPreviewToken += 1;
    if (detailEpisodeView) { detailEpisodeView.reset(); }
    posterLoader.cancelScope('detail');
    document.getElementById('detail-play').className = 'detail-action';
    document.getElementById('detail-refresh-metadata').disabled = false;
    detailRefreshPending = false;
    document.getElementById('detail-view').className = 'detail-view is-hidden';
  }

  function finishCloseDetail() {
    var returnToSearch = detailReturnView === 'search';
    var returnToLibrary = detailReturnView === 'library';
    var returnToWatchlist = detailReturnView === 'watchlist';
    leaveDetail();
    appView = returnToSearch ? 'search' : (returnToLibrary ? 'library' : (returnToWatchlist ? 'watchlist' : 'home'));
    if (returnToSearch) {
      document.getElementById('content').style.display = 'none';
      document.getElementById('search-view').className = 'search-view';
      updateSearchFocus();
    } else if (returnToLibrary) {
      document.getElementById('content').style.display = 'none';
      document.getElementById('library-view').className = 'library-view' + (activeLibrary && activeLibrary.globalPlaylists ? ' is-global-playlists' : '');
      libraryLifecycle.load(libraryLoadContext(), false, true);
      updateLibraryFocus();
    } else if (returnToWatchlist) {
      document.getElementById('content').style.display = 'none';
      document.getElementById('watchlist-view').className = 'watchlist-view';
      renderWatchlistGrid(); updateWatchlistFocus();
    } else {
      revealHome({ focus: 'preserve' });
    }
  }

  function closeDetail() {
    if (!appSettings.interfaceAnimations) {
      finishCloseDetail();
      return;
    }
    if (document.body.className.indexOf('is-detail-transitioning') !== -1) {
      finishCloseDetail();
      return;
    }
    root.clearTimeout(detailTransitionTimer);
    root.clearTimeout(detailTransitionEndTimer);
    document.body.className = document.body.className.replace(/\s*is-detail-transitioning|\s*is-detail-transition-revealing|\s*is-detail-closing|\s*is-detail-returning/g, '') + ' is-detail-closing';
    detailTransitionTimer = root.setTimeout(function () {
      detailTransitionTimer = null;
      finishCloseDetail();
      document.body.className += ' is-detail-returning';
      detailTransitionEndTimer = root.setTimeout(function () {
        detailTransitionEndTimer = null;
        document.body.className = document.body.className.replace(/\s*is-detail-returning/g, '');
      }, interfaceAnimationDuration(200));
    }, interfaceAnimationDuration(200));
  }

  function directionForKey(keyCode) {
    return { 37: 'left', 38: 'up', 39: 'right', 40: 'down' }[keyCode];
  }

  function recoverActiveViewAfterNetwork() {
    if (appView === 'home') { loadHomeRows(); }
    else if (appView === 'library') { loadLibraryContent(true); }
    else if (appView === 'watchlist') { loadWatchlistData(true); }
    else if (appView === 'search' && searchSnapshot().query.replace(/^\s+|\s+$/g, '').length >= 2) { scheduleSearch(); }
    else if (appView === 'detail' && selectedItem) { loadSelectedDetail(selectedItem); }
  }

  function renderAutoplayCountdown() {
    setText('autoplay-title', t('player.nextEpisode', { seconds: autoplaySeconds }));
  }

  function cancelAutoplayCountdown() {
    autoplayVisible = false;
    root.clearTimeout(autoplayTimer);
    autoplayTimer = null;
    document.getElementById('autoplay-prompt').className = 'autoplay-prompt is-hidden';
  }

  function confirmAutoplayCountdown() {
    if (!autoplayVisible) { return; }
    cancelAutoplayCountdown();
    switchPlayerEpisode(1);
  }

  function startAutoplayCountdown() {
    var context = episodeNavigationContext();
    if (appSettings.autoplayDelay === 0 || !context || !episodeResolver.canMove(context, 1)) { return; }
    autoplayVisible = true;
    autoplaySeconds = appSettings.autoplayDelay;
    document.getElementById('autoplay-prompt').className = 'autoplay-prompt';
    renderAutoplayCountdown();
    function tick() {
      autoplayTimer = root.setTimeout(function () {
        if (!autoplayVisible || appView !== 'player') { return; }
        autoplaySeconds -= 1;
        if (autoplaySeconds <= 0) { confirmAutoplayCountdown(); }
        else { renderAutoplayCountdown(); tick(); }
      }, 1000);
    }
    tick();
  }

  function handleSearchKeyDown(event, direction) {
    var snapshot = searchSnapshot();
    event.preventDefault();
    if (appSettings.searchT9Input && searchView.inputKeyCode(event.keyCode)) { return; }
    if (event.keyCode === 27 || event.keyCode === 461) {
      searchView.back();
      return;
    }
    if (event.keyCode === 8) {
      if (searchView.backspaceT9()) { return; }
      searchView.applyKey('backspace');
      return;
    }
    if (event.keyCode === 415 && snapshot.focus.zone === 'results') {
      playHomeItem(snapshot.results[snapshot.focus.index]);
      return;
    }
    if (direction) {
      searchView.flushT9();
      searchView.handleDirection(direction);
      return;
    }
    if (event.keyCode !== 13) { return; }
    searchView.flushT9();
    searchView.activate();
  }

  function handleLibraryBack() {
    var now = new Date().getTime();
    if (closeLibraryContainer()) { libraryBackLockedUntil = now + 600; return; }
    if (libraryZone === 'nav') { closeLibrary(); return; }
    if (libraryZone !== 'tabs') {
      libraryZone = 'tabs';
      libraryBackLockedUntil = now + 600;
      document.getElementById('library-grid').scrollTop = 0;
      updateLibraryFocus();
      return;
    }
    if (now < libraryBackLockedUntil) { return; }
    closeLibrary();
  }

  function handleLibraryKeyDown(event, direction) {
    var next;
    wheelNavigationActive = false;
    if (libraryFilterView.isOpen()) { handleLibraryFilterKeyDown(event, direction); return; }
    event.preventDefault();
    if (event.keyCode === 27 || event.keyCode === 461) { handleLibraryBack(); return; }
    if (event.keyCode === 415 && libraryZone === 'grid') {
      var playItem = libraryGridView.focusedItem();
      if (!playItem || playItem.containerKey) { return; }
      playHomeItem(playItem); return;
    }
    if (libraryZone === 'nav') {
      if (direction === 'left' || direction === 'right') {
        state.navIndex = Math.max(0, Math.min(navigationFocusCount() - 1, state.navIndex + (direction === 'left' ? -1 : 1)));
        renderNavigation(); updateLibraryFocus();
        scheduleNavigationPreview(state.navIndex);
      } else if (direction === 'down') { libraryZone = activeLibrary && activeLibrary.globalPlaylists ? 'grid' : 'tabs'; updateLibraryFocus(); }
      else if (event.keyCode === 13) {
        if (navigationItems[state.navIndex] && navigationItems[state.navIndex].kind === 'library') { startNavHold(state.navIndex); }
        else { enterActiveNavigationView(); }
      }
      return;
    }
    if (libraryZone === 'tabs') {
      if (direction === 'up') { libraryZone = 'nav'; updateLibraryFocus(); return; }
      if (direction === 'left' || direction === 'right') {
        if (direction === 'right' && libraryTabIndex === LibraryContainers.views().length - 1) { libraryZone = 'actions'; libraryActionIndex = 0; updateLibraryFocus(); return; }
        next = nextLibraryTab(direction === 'left' ? -1 : 1);
        if (next !== libraryTabIndex) {
          selectLibraryTab(next);
        }
        return;
      }
      if (direction === 'down' || event.keyCode === 13) { focusLibraryTabContent(); }
      return;
    }
    if (libraryZone === 'actions') {
      if (direction === 'left') {
        if (libraryActionIndex > 0) { libraryActionIndex -= 1; }
        else { libraryZone = 'tabs'; libraryTabIndex = LibraryContainers.views().length - 1; }
        updateLibraryFocus();
      } else if (direction === 'right') {
        libraryActionIndex = Math.min(1, libraryActionIndex + 1); updateLibraryFocus();
      } else if (direction === 'up') { libraryZone = 'nav'; updateLibraryFocus(); }
      else if (direction === 'down') { libraryZone = libraryViewKey() === 'catalog' ? 'filter' : 'grid'; libraryControlIndex = 0; updateLibraryFocus(); }
      else if (event.keyCode === 13) {
        if (libraryActionIndex === 0) { refreshActiveLibrary(); }
        else { refreshActiveLibraryMetadata(); }
      }
      return;
    }
    if (libraryViewKey() === 'recommended') {
      next = libraryGridView.handleDirection(direction);
      if (next.leave) { libraryZone = 'tabs'; updateLibraryFocus(); return; }
      if (event.keyCode === 13 && libraryGridView.focusedItem()) {
        openDetail(libraryGridView.focusedItem());
        return;
      }
      updateLibraryFocus();
      return;
    }
    if (libraryZone === 'sort') {
      if (direction === 'left' || direction === 'right') {
        next = LibraryContainers.moveControl('sort', libraryControlIndex, direction);
        libraryZone = next.zone; libraryControlIndex = next.index; updateLibraryFocus();
      }
      else if (direction === 'up' || direction === 'down') {
        next = LibraryContainers.moveControlVertical('sort', direction);
        if (next.zone !== 'grid' || libraryGridView.snapshot().items.length) { libraryZone = next.zone; updateLibraryFocus(); }
      }
      else if (event.keyCode === 13) { activateLibrarySort(['titleSort', 'audienceRating', 'year'][libraryControlIndex]); }
      return;
    }
    if (libraryZone === 'filter') {
      if (direction === 'left' || direction === 'right') {
        next = LibraryContainers.moveControl('filter', libraryControlIndex, direction);
        libraryZone = next.zone; libraryControlIndex = next.index; updateLibraryFocus();
      }
      else if (direction === 'up') {
        libraryZone = 'actions'; libraryActionIndex = 0; updateLibraryFocus();
      }
      else if (direction === 'down') {
        next = LibraryContainers.moveControlVertical('filter', direction);
        if (next.zone !== 'grid' || libraryGridView.snapshot().items.length) { libraryZone = next.zone; updateLibraryFocus(); }
      }
      else if (event.keyCode === 13) {
        if (libraryControlIndex === 3) { openLibraryFilterDrawer(); }
        else { activateLibraryFilter(['all','unwatched','watched'][libraryControlIndex]); }
      }
      return;
    }
    next = libraryGridView.handleDirection(direction);
    if (next.leave) {
      libraryZone = activeLibrary && activeLibrary.globalPlaylists ? 'nav' : (libraryViewKey() === 'catalog' ? 'filter' : 'tabs');
      libraryControlIndex = ['all','unwatched','watched'].indexOf(libraryWatchedFilter);
    } else if (event.keyCode === 13 && libraryGridView.focusedItem()) {
      if (libraryGridView.focusedItem().containerKey) { openLibraryContainer(libraryGridView.focusedItem()); }
      else { openDetail(libraryGridView.focusedItem()); }
      return;
    }
    var librarySnapshot = libraryGridView.snapshot();
    if (libraryUsesGridScroll() && librarySnapshot.items.length < librarySnapshot.totalSize && librarySnapshot.focus.index >= librarySnapshot.items.length - librarySnapshot.layout.columns * 2) { loadLibraryContent(false); }
    updateLibraryFocus();
  }

  function handleWatchlistKeyDown(event, direction) {
    watchlistView.handleKeyDown(event, direction);
  }

  function handleSetupBack() {
    setupController.back();
  }

  function handleSetupKeyDown(event) {
    var buttons = document.querySelectorAll('#setup-view button');
    var active = document.activeElement;
    var keyCode = event.keyCode;
    if (keyCode === 27 || keyCode === 461) { event.preventDefault(); handleSetupBack(); return; }
    if (setupStage === 'profile-pin') {
      if (keyCode === 8) { event.preventDefault(); setupController.backspace(); return; }
      if ((keyCode >= 48 && keyCode <= 57) || (keyCode >= 96 && keyCode <= 105)) {
        event.preventDefault(); setupController.inputDigit(keyCode); return;
      }
      if (keyCode === 13 && active && active.id === 'setup-address') {
        event.preventDefault(); setupController.activate('unlock-profile'); return;
      }
    }
    if (active && active.id === 'setup-address') {
      if (keyCode === 13) {
        event.preventDefault();
        if (setupStage === 'manual') { setupController.activate('connect-manual', { address: active.value }); }
      } else if ((keyCode === 38 || keyCode === 40) && buttons.length) {
        event.preventDefault();
        setupController.setFocus(0, buttons.length);
      }
      return;
    }
    event.preventDefault();
    if (!buttons.length) { return; }
    if (keyCode === 38 || keyCode === 37) { setupController.moveFocus(-1, buttons.length); }
    else if (keyCode === 40 || keyCode === 39) { setupController.moveFocus(1, buttons.length); }
    else if (keyCode === 13 && buttons[setupController.snapshot().focusIndex]) {
      activateSetupButton(buttons[setupController.snapshot().focusIndex]);
    }
  }

  function onKeyDown(event) {
    var direction = directionForKey(event.keyCode);
    var layout;

    if (direction && pageScrollPendingFocus) {
      syncFocusAfterPageScroll();
      pageScrollPendingFocus = false;
    }

    if (choiceDialogView.snapshot().open) {
      event.preventDefault();
      if (event.keyCode === 38) { choiceDialogView.move(-1); }
      else if (event.keyCode === 40) { choiceDialogView.move(1); }
      else if (event.keyCode === 13) { closeChoiceDialog(true); }
      else if (event.keyCode === 27 || event.keyCode === 461) { closeChoiceDialog(false); }
      return;
    }

    if (privacyDialogOpen) {
      event.preventDefault();
      if (event.keyCode === 38) { scrollPrivacyPolicy(-1); }
      else if (event.keyCode === 40) { scrollPrivacyPolicy(1); }
      else if (event.keyCode === 13 || event.keyCode === 27 || event.keyCode === 461) { closePrivacyPolicy(); }
      return;
    }

    if (appView === 'setup') {
      handleSetupKeyDown(event);
      return;
    }

    if (appView === 'diagnostics') {
      handleDiagnosticsKey(event, direction);
      return;
    }

    if (handleViewStateKey(event, direction)) { event.preventDefault(); return; }

    if (navigationHasFocus() && navReorderMode) {
      event.preventDefault();
      if (direction === 'left') { moveNavLibrary(-1); }
      else if (direction === 'right') { moveNavLibrary(1); }
      else if (event.keyCode === 27 || event.keyCode === 461) { finishNavReorder(false); }
      else if (event.keyCode === 13 && navReorderReady) { finishNavReorder(true); }
      return;
    }

    if (appView === 'library') {
      handleLibraryKeyDown(event, direction);
      return;
    }

    if (appView === 'watchlist') {
      handleWatchlistKeyDown(event, direction);
      return;
    }

    if (appView === 'settings') {
      var settingsSnapshot = settingsView.snapshot();
      event.preventDefault();
      if (event.keyCode === 27 || event.keyCode === 461) {
        if (serverEditorView.snapshot().open) { closeServerEditor(); }
        else if (settingsSnapshot.languageKind) { closeLanguageEditor(); }
        else { closeAppSettings(); }
      } else if (settingsSnapshot.zone === 'nav') {
        if (direction === 'left' || direction === 'right') {
          state.navIndex = Math.max(0, Math.min(navigationFocusCount() - 1, state.navIndex + (direction === 'left' ? -1 : 1)));
          renderNavigation();
          updateSettingsFocus();
          scheduleNavigationPreview(state.navIndex);
        } else if (direction === 'down') {
          settingsView.focusList(settingsSnapshot.index, settingsRows());
          renderAppSettings();
        } else if (event.keyCode === 13) {
          if (navigationItems[state.navIndex] && navigationItems[state.navIndex].kind === 'library') { startNavHold(state.navIndex); }
          else { enterActiveNavigationView(); }
        }
      } else if (serverEditorView.snapshot().open) {
        if (event.keyCode === 38 && serverEditorView.snapshot().index === 0) { closeServerEditor(); }
        else if (event.keyCode === 38) { serverEditorView.focus(serverEditorView.snapshot().index - 1, serverState.servers.length + 2); renderServerEditor(); }
        else if (event.keyCode === 40) { serverEditorView.focus(serverEditorView.snapshot().index + 1, serverState.servers.length + 2); renderServerEditor(); }
        else if (event.keyCode === 13) { activateServerEditorRow(); }
      } else if (settingsSnapshot.languageKind) {
        if (event.keyCode === 38) { moveEditorFocus(-1); }
        else if (event.keyCode === 40) { moveEditorFocus(1); }
        else if (event.keyCode === 37) { moveEditorLanguage(-1); }
        else if (event.keyCode === 39) { moveEditorLanguage(1); }
        else if (event.keyCode === 13) { toggleEditorLanguage(); }
      } else if (event.keyCode === 38 && settingsSnapshot.index === 0) {
        settingsView.focusNavigation();
        renderNavigation();
        updateSettingsFocus();
      } else if (event.keyCode === 38) {
        settingsView.focusList(settingsSnapshot.index - 1, settingsRows(), -1); renderAppSettings();
      } else if (event.keyCode === 40) {
        settingsView.focusList(settingsSnapshot.index + 1, settingsRows(), 1); renderAppSettings();
      } else if (event.keyCode === 37) {
        changeSetting(-1);
      } else if (event.keyCode === 39) {
        changeSetting(1);
      } else if (event.keyCode === 13) {
        openAppSettingChoice();
      }
      return;
    }

    if (appView === 'search') {
      handleSearchKeyDown(event, direction);
      return;
    }

    if (appView === 'player') {
      event.preventDefault();
      if (mediaInfoView.snapshot().open) {
        if (event.keyCode === 27 || event.keyCode === 461) { closeAdvancedMediaInfo(); }
        else if (event.keyCode === 13) { closeAdvancedMediaInfo(); }
        else if (direction === 'up') { mediaInfoView.scroll(-1); }
        else if (direction === 'down') { mediaInfoView.scroll(1); }
        return;
      }
      if (handleResumeChoiceKey(event, direction)) { return; }
      if (handlePlayerErrorKey(event, direction)) { return; }
      if (handleSubtitleEditorKey(event, direction)) { return; }
      if (event.keyCode === 27 || event.keyCode === 461) { handlePlayerBack(); return; }
      if (autoplayVisible && (event.keyCode === 13 || event.keyCode === 415)) { confirmAutoplayCountdown(); return; }
      if (event.keyCode === 415) {
        document.getElementById('player-video').play();
        return;
      }
      if (event.keyCode === 19) {
        document.getElementById('player-video').pause();
        return;
      }
      if (chapterState.open) {
        showPlayerControls();
        if (event.keyCode === 37 || event.keyCode === 39) {
          chapterState = ChapterState.move(chapterState, playerChapters().length, event.keyCode === 37 ? -1 : 1);
          updateChapterFocus();
        } else if (event.keyCode === 38) {
          closeChapterDrawer(true);
        } else if (event.keyCode === 13) {
          activateChapter();
        }
        return;
      }
      if (!settingsOpen && playerControlsMode === 'full' && event.keyCode === 40 &&
          (playerZone === 'buttons' || playerZone === 'chapter-hint') &&
          playerChapters().length) {
        openChapterDrawer();
        return;
      }
      if (event.keyCode === 13 && playerZone === 'skip' && skipMarkerState.visible) {
        activateSkipMarker();
        return;
      }
      if (event.keyCode === 413) {
        closePlayer();
      } else if (settingsOpen) {
        showPlayerControls();
        if (event.keyCode === 38) { movePlayerSetting(-1); }
        else if (event.keyCode === 40) { movePlayerSetting(1); }
        else if (event.keyCode === 37) { cycleSetting(-1); }
        else if (event.keyCode === 39) { cycleSetting(1); }
        else if (event.keyCode === 13) {
          openPlayerSettingChoice();
        }
      } else if (playerControlsMode === 'hidden' && event.keyCode === 13) {
        playerControlsMode = PlayerControlsState.next(playerControlsMode, 'ok');
        playerZone = 'buttons';
        playerButtonIndex = 1;
        showPlayerControls();
        updatePlayerButtonFocus();
        return;
      } else if (playerControlsMode !== 'full' && (event.keyCode === 37 || event.keyCode === 39 || event.keyCode === 412 || event.keyCode === 417)) {
        playerControlsMode = PlayerControlsState.next(playerControlsMode, 'seek');
        playerZone = 'timeline';
        seekPlayer(event.keyCode === 37 || event.keyCode === 412 ? -1 : 1);
        showPlayerTimeline();
        updatePlayerButtonFocus();
        return;
      } else if (playerControlsMode === 'timeline' && event.keyCode === 13) {
        playerControlsMode = PlayerControlsState.next(playerControlsMode, 'ok');
        playerZone = 'buttons';
        playerButtonIndex = 1;
        showPlayerControls();
        updatePlayerButtonFocus();
        return;
      } else if (playerControlsMode !== 'full' && (event.keyCode === 38 || event.keyCode === 40)) {
        playerControlsMode = PlayerControlsState.next(playerControlsMode, 'navigate');
        playerZone = 'buttons';
        playerButtonIndex = 1;
        showPlayerControls();
        updatePlayerButtonFocus();
        return;
      } else if (event.keyCode === 38 && playerZone === 'timeline' && skipMarkerState.visible) {
        showPlayerControls();
        playerZone = 'skip'; updatePlayerButtonFocus();
      } else if (event.keyCode === 40 && playerZone === 'skip') {
        showPlayerControls();
        playerZone = 'timeline'; updatePlayerButtonFocus();
      } else if (event.keyCode === 38) {
        showPlayerControls();
        playerZone = 'timeline'; updatePlayerButtonFocus();
      } else if (event.keyCode === 40) {
        showPlayerControls();
        playerZone = 'buttons'; updatePlayerButtonFocus();
      } else if (playerZone === 'skip' && (event.keyCode === 37 || event.keyCode === 39)) {
        showPlayerControls();
        playerZone = 'buttons'; playerButtonIndex = 1; updatePlayerButtonFocus();
      } else if (playerZone === 'timeline' && (event.keyCode === 37 || event.keyCode === 39)) {
        showPlayerControls();
        seekPlayer(event.keyCode === 37 ? -1 : 1);
      } else if (playerZone === 'buttons' && event.keyCode === 37 && chapterHintVisible() &&
          (playerButtonIndex === 0 || (playerButtonIndex === 1 && !playerButtonAvailable(0)))) {
        showPlayerControls();
        playerZone = 'chapter-hint'; updatePlayerButtonFocus();
      } else if (playerZone === 'chapter-hint' && event.keyCode === 39) {
        showPlayerControls();
        playerZone = 'buttons'; playerButtonIndex = playerButtonAvailable(0) ? 0 : 1; updatePlayerButtonFocus();
      } else if (playerZone === 'buttons' && (event.keyCode === 37 || event.keyCode === 39)) {
        showPlayerControls();
        movePlayerButton(event.keyCode === 37 ? -1 : 1);
      } else if (event.keyCode === 13) {
        showPlayerControls();
        if (playerZone === 'skip') { activateSkipMarker(); return; }
        if (playerZone === 'chapter-hint') { openChapterDrawer(); return; }
        if (playerZone === 'timeline') { return; }
        if (playerButtonIndex === 0) { switchPlayerEpisode(-1); }
        else if (playerButtonIndex === 2) { switchPlayerEpisode(1); }
        else if (playerButtonIndex === 4) { setSettingsOpen(true); }
        else { togglePlayback(); }
      } else if (event.keyCode === 412 || event.keyCode === 417) {
        showPlayerControls();
        seekPlayerTo(playerAbsoluteTime() + (event.keyCode === 412 ? -10 : 10));
      }
      return;
    }

    if (appView === 'detail') {
      if (mediaInfoView.snapshot().open) {
        event.preventDefault();
        if (event.keyCode === 27 || event.keyCode === 461) { closeAdvancedMediaInfo(); }
        else if (event.keyCode === 13) { closeAdvancedMediaInfo(); }
        else if (direction === 'up') { mediaInfoView.scroll(-1); }
        else if (direction === 'down') { mediaInfoView.scroll(1); }
        return;
      }
      if (detailPresentationSnapshot().mediaInfoDialogOpen) {
        event.preventDefault();
        if (event.keyCode === 27 || event.keyCode === 461) { closeDetailMediaInfo(); }
        else if (direction === 'up') { scrollDetailMediaInfo(-1); }
        else if (direction === 'down') { scrollDetailMediaInfo(1); }
        return;
      }
      if (detailPresentationSnapshot().summaryDialogOpen) {
        event.preventDefault();
        if (event.keyCode === 27 || event.keyCode === 461) { closeDetailSummary(); }
        else if (direction === 'up') { scrollDetailSummary(-1); }
        else if (direction === 'down') { scrollDetailSummary(1); }
        return;
      }
      if (event.keyCode === 415) {
        event.preventDefault();
        if (detailZone === 'episodes' && seriesContext) { playSelectedEpisode(seriesContext.episodes[detailEpisodeIndex]); }
        else { openPlayer(); }
      } else if ((event.keyCode === 27 || event.keyCode === 461) && new Date().getTime() >= detailBackLockedUntil) {
        event.preventDefault();
        closeDetail();
      } else if (direction) {
        event.preventDefault();
        navigateDetail(direction);
      } else if (event.keyCode === 13) {
        event.preventDefault();
        if (detailZone === 'nav') {
          if (navigationItems[state.navIndex] && navigationItems[state.navIndex].kind === 'library') { startNavHold(state.navIndex); }
          else { enterActiveNavigationView(); }
        } else if (detailZone === 'seasons') {
          loadSelectedSeason();
        } else if (detailZone === 'episodes') {
          playSelectedEpisode(seriesContext.episodes[detailEpisodeIndex]);
        } else if (detailZone === 'audio') {
          openDetailChoice('audio');
        } else if (detailZone === 'subtitles') {
          openDetailChoice('subtitles');
        } else if (detailZone === 'version') {
          openDetailChoice('version');
        } else if (detailZone === 'summary') {
          openDetailSummary();
        } else if (detailZone === 'media-info') {
          openDetailMediaInfo();
        } else if (detailActionIndex === 1) {
          toggleCurrentWatched();
        } else if (detailActionIndex === 2) {
          toggleCurrentWatchlist();
        } else if (detailActionIndex === 3) {
          refreshCurrentMetadata();
        } else if (detailActionIndex === 4) {
          openAdvancedMediaInfo('detail');
        } else {
          openPlayer();
        }
      }
      return;
    }

    if (appView === 'home' && state.area === 'nav') {
      if (event.keyCode === 13) {
        event.preventDefault();
        if (navigationItems[state.navIndex] && navigationItems[state.navIndex].kind === 'library') {
          startNavHold(state.navIndex);
        } else {
          activateNavigationSelection();
        }
        return;
      }
    }

    if (event.keyCode === 415 && state.area === 'media') {
      event.preventDefault();
      playHomeItem(data.rows[state.rowIndex].items[state.column]);
      return;
    }

    if (direction) {
      event.preventDefault();
      layout = {
        navCount: navigationFocusCount(),
        rowLengths: data.rows.map(function (row) { return row.items.length; })
      };
      state = FocusModel.move(state, direction, layout);
      updateFocus();
      if (state.area === 'nav' && (direction === 'left' || direction === 'right')) { scheduleNavigationPreview(state.navIndex); }
    } else if (event.keyCode === 13) {
      event.preventDefault();
      activate();
    } else if (event.keyCode === 27 || event.keyCode === 461) {
      event.preventDefault();
      focusHomeStart();
    }
  }

  function updateClock() {
    var now = new Date();
    var hours = String(now.getHours());
    var minutes = String(now.getMinutes());
    document.getElementById('clock').innerHTML =
      (hours.length < 2 ? '0' : '') + hours + ':' +
      (minutes.length < 2 ? '0' : '') + minutes;
  }

  function passiveHomeState(messageKey) {
    if (state.area !== 'nav') { return false; }
    hideViewState();
    showMessage(t(messageKey));
    updateFocus();
    return true;
  }

  function usePlexRows(rows, navIndex, options) {
    var availableRows = HomeState.normalizeRows(rows);
    var baseState;
    var selectedKey;
    options = options || {};

    if (!availableRows.length) {
      completeStartup();
      if (appView === 'home' && !passiveHomeState('state.homeEmpty')) { showViewState('empty', 'home', null, openSetup); }
      return;
    }
    hideViewState();
    data.rows = availableRows;
    renderRows();
    baseState = options.focus === 'nav'
      ? { area: 'nav', navIndex: navIndex || 0, rowIndex: 0, column: 0 }
      : (options.focus === 'first'
        ? { area: 'media', navIndex: navIndex || 0, rowIndex: 0, column: 0 }
        : { area: 'media', navIndex: navIndex || 0, rowIndex: state.rowIndex || 0, column: state.column || 0 });
    selectedKey = options.focus === 'preserve' ? (options.selectionKey || lastHomeSelectionKey) : '';
    state = HomeState.restoreFocus(availableRows, baseState, selectedKey);
    homeDomDirty = false;
    if (options.focus === 'first') { document.getElementById('content').scrollTop = 0; }
    updateFocus();
    completeStartup();
    scheduleAdjacentLibraryPrefetch();
  }

  function loadHomeRows() {
    if (appView === 'home' && !data.rows.length && !passiveHomeState('state.homeLoading')) { showViewState('loading', 'home', null, null); }
    homeRefreshCoordinator.refresh();
  }

  function loadPlex() {
    if (!config.apiBaseUrl || !PlexClient) {
      return;
    }
    scheduleServerActivityPoll(0);
    PlexClient.loadNavigation(config, function (error, items) {
      if (error) {
        attemptServerFailover(error, function (switched) {
          if (switched) { loadPlex(); return; }
          loadHomeRows();
        });
        return;
      }
      serverFailoverFailedUris = {};
      if (!error && items.length) {
        applyNavigationVisibility(NavigationModel.applyLibraryOrder(items, NavigationModel.load(root.localStorage)));
        data.navigation = items.map(function (item) { return item.title; });
        renderNavigation();
      }
      loadHomeRows();
      if (watchlistAvailable()) { loadWatchlistData(false); }
    });
    if (!config.token) { return; }
    PlexClient.loadAccountProfile(config, function (error, account) {
      if (!error && account) {
        appSettings = Settings.seedFromPlex(appSettings, account);
        saveAppSettings();
        renderNavigation();
        if (appView === 'settings') { renderAppSettings(); }
      }
    });
  }

  function bootstrapPlex() {
    var selected = serverForUri(serverState.activeUri);
    saveAppSettings();
    renderActiveProfile();
    if (AuthStore && AuthStore.needsOnboarding(serverState, authState)) {
      openSetup();
      return;
    }
    if (!authState.setupComplete && serverState.activeUri) {
      authState.setupComplete = true;
      authState.mode = 'offline';
      authState = AuthStore.save(credentialStorage, authState);
    }
    if (!selected && configuredServer) { selected = serverForUri(configuredServer.uri) || configuredServer; }
    if (!selected && serverState.servers.length) { selected = serverState.servers[0]; }
    if (selected) {
      applyServer(selected);
      resumeRemoteConnectionVerification(selected);
    }
    if (config.apiBaseUrl) { loadPlex(); }
    discoverLocalServers(function () {
      if (!config.apiBaseUrl && serverState.servers.length) {
        applyServer(serverState.servers[0]);
        loadPlex();
      }
    });
  }

  function closestButton(node) {
    while (node && node !== document) {
      if (node.tagName && node.tagName.toLowerCase() === 'button') { return node; }
      node = node.parentNode;
    }
    return null;
  }

  function syncPointerFocus(button) {
    var index;
    if (!button || button.disabled) { return; }
    pageScrollPendingFocus = false;
    pointerSelectionActive = true;
    if (button.hasAttribute('data-subtitle-editor') && subtitleEditorOpen) {
      var subtitleControls = subtitleEditorControls();
      for (index = 0; index < subtitleControls.length; index += 1) {
        if (subtitleControls[index] === button) { subtitleEditorIndex = index; break; }
      }
      renderSubtitleEditor();
    } else if (button.hasAttribute('data-diagnostics-action') && appView === 'diagnostics') {
      diagnosticsView.setFocus(button.getAttribute('data-diagnostics-action') === 'refresh' ? 0 : 1);
    } else if (button.hasAttribute('data-resume-index') && resumeChoiceVisible) {
      resumeChoiceState.index = Number(button.getAttribute('data-resume-index'));
      renderResumeChoice();
    } else if (button.hasAttribute('data-setup-language') || button.hasAttribute('data-setup-action') || button.hasAttribute('data-setup-server') || button.hasAttribute('data-setup-profile')) {
      var setupButtons = document.querySelectorAll('#setup-view button');
      for (index = 0; index < setupButtons.length; index += 1) {
        if (setupButtons[index] === button) { setupController.setFocus(index, setupButtons.length); break; }
      }
    } else if (button.hasAttribute('data-nav-index')) {
      state.navIndex = Number(button.getAttribute('data-nav-index'));
      state.area = 'nav';
      if (appView === 'detail') { detailZone = 'nav'; updateDetailFocus(); }
      else if (appView === 'search') { searchView.focusNavigation(state.navIndex); }
      else if (appView === 'library') { libraryZone = 'nav'; updateLibraryFocus(); }
      else if (appView === 'watchlist') { watchlistView.focusNavigation(); }
      else if (appView === 'settings') { settingsView.focusNavigation(); updateSettingsFocus(); }
      else if (appView === 'home') { updateFocus(); }
    } else if (button.hasAttribute('data-row-index')) {
      state.area = 'media';
      state.rowIndex = Number(button.getAttribute('data-row-index'));
      state.column = Number(button.getAttribute('data-column'));
      updateFocus();
    } else if (button.hasAttribute('data-season-position')) {
      detailZone = 'seasons';
      detailSeasonIndex = Number(button.getAttribute('data-season-position'));
      updateDetailFocus();
    } else if (button.hasAttribute('data-episode-position')) {
      detailZone = 'episodes';
      detailEpisodeIndex = Number(button.getAttribute('data-episode-position'));
      updateDetailFocus();
    } else if (button.id === 'detail-play' || button.id === 'detail-watched' || button.id === 'detail-watchlist' || button.id === 'detail-refresh-metadata' || button.id === 'detail-file-info') {
      detailZone = 'play';
      detailActionIndex = button.id === 'detail-play' ? 0 : (button.id === 'detail-watched' ? 1 : (button.id === 'detail-watchlist' ? 2 : (button.id === 'detail-refresh-metadata' ? 3 : 4)));
      updateDetailFocus();
    } else if (button.id === 'detail-audio' || button.id === 'detail-subtitles' || button.id === 'detail-version') {
      detailZone = button.id === 'detail-audio' ? 'audio' : (button.id === 'detail-subtitles' ? 'subtitles' : 'version');
      updateDetailFocus();
    } else if (button.id === 'detail-summary-button') {
      detailZone = 'summary';
      updateDetailFocus();
    } else if (button.id === 'detail-media-info-button') {
      detailZone = 'media-info';
      updateDetailFocus();
    } else if (button.hasAttribute('data-setting-index')) {
      settingsView.focusList(Number(button.getAttribute('data-setting-index')), settingsRows());
      renderAppSettings();
    } else if (button.id === 'privacy-dialog-close') {
      clearLogicalFocus();
      button.className = 'privacy-dialog-close is-focused';
    } else if (button.hasAttribute('data-language-index')) {
      settingsView.focusLanguage(Number(button.getAttribute('data-language-index')), orderedEditorLanguages().length);
      renderLanguageEditor();
    } else if (button.hasAttribute('data-server-index')) {
      serverEditorView.focus(Number(button.getAttribute('data-server-index')), serverState.servers.length + 2);
      renderServerEditor();
    } else if (button.hasAttribute('data-search-key')) {
      searchView.pointerFocus(button);
    } else if (button.hasAttribute('data-search-index')) {
      searchView.pointerFocus(button);
    } else if (button.hasAttribute('data-library-tab')) {
      if (button.disabled) { return; }
      libraryZone = 'tabs';
      clearLogicalFocus();
      button.className += ' is-focused';
    } else if (button.id === 'library-refresh' || button.id === 'library-refresh-metadata') {
      libraryZone = 'actions'; libraryActionIndex = button.id === 'library-refresh' ? 0 : 1; updateLibraryFocus();
    } else if (button.hasAttribute('data-library-sort')) {
      libraryZone = 'sort'; libraryControlIndex = ['titleSort', 'audienceRating', 'year'].indexOf(button.getAttribute('data-library-sort')); updateLibraryFocus();
    } else if (button.hasAttribute('data-library-filter')) {
      libraryZone = 'filter'; libraryControlIndex = ['all','unwatched','watched'].indexOf(button.getAttribute('data-library-filter')); updateLibraryFocus();
    } else if (button.hasAttribute('data-library-filter-open')) {
      libraryZone = 'filter'; libraryControlIndex = 3; updateLibraryFocus();
    } else if (button.hasAttribute('data-library-advanced-filter') || button.hasAttribute('data-library-filter-option') || button.hasAttribute('data-library-filter-action')) {
      libraryFilterView.pointerFocus(button);
    } else if (button.hasAttribute('data-library-index')) {
      libraryZone = 'grid'; libraryGridView.pointerFocus(button); updateLibraryFocus();
    } else if (button.hasAttribute('data-library-recommendation-row')) {
      libraryZone = 'grid'; libraryGridView.pointerFocus(button); updateLibraryFocus();
    } else if (button.hasAttribute('data-watchlist-index')) {
      watchlistView.pointerFocus(button);
    } else if (button.id === 'player-timeline-button') {
      playerZone = 'timeline'; updatePlayerButtonFocus();
    } else if (button.id === 'player-skip-marker') {
      playerZone = 'skip'; updatePlayerButtonFocus();
    } else if (button.id === 'player-chapters-hint') {
      playerZone = 'chapter-hint'; updatePlayerButtonFocus();
    } else if (button.hasAttribute('data-chapter-index')) {
      chapterState.index = Number(button.getAttribute('data-chapter-index'));
      playerZone = 'chapters'; updatePlayerButtonFocus();
    } else if (button.className.indexOf('player-button') !== -1) {
      var buttons = document.querySelectorAll('.player-button');
      for (index = 0; index < buttons.length; index += 1) {
        if (buttons[index] === button) { playerButtonIndex = index; break; }
      }
      playerZone = 'buttons'; updatePlayerButtonFocus();
    } else if (button.hasAttribute('data-choice-index') && choiceDialogView.snapshot().open) {
      choiceDialogView.focus(Number(button.getAttribute('data-choice-index')));
    } else if (button.className.indexOf('setting-row') !== -1 || button.id === 'player-media-info') {
      var settingRows = playerSettingRows();
      for (index = 0; index < settingRows.length; index += 1) {
        if (settingRows[index] === button) { settingIndex = index; break; }
      }
      updateSettingsDisplay();
    }
    pointerSelectionActive = false;
  }

  function notePlayerPointerActivity(button) {
    var controls;
    var settings;
    if (appView !== 'player' || playerControlsMode !== 'full' || !button) { return; }
    controls = document.getElementById('player-controls');
    settings = document.getElementById('player-settings');
    if ((controls && controls.contains(button)) ||
        (settings && settings.contains(button)) ||
        button.id === 'player-skip-marker' ||
        button.id === 'player-chapters-hint' ||
        button.hasAttribute('data-chapter-index')) {
      schedulePlayerControlsTimeout();
    }
  }

  function onPointerOver(event) {
    var button = closestButton(event.target);
    if (wheelPointerLocked || new Date().getTime() < pointerSuppressedUntil) {
      return;
    }
    if (!pointerPrimed) {
      if (!pointerOriginTarget) { pointerOriginTarget = button; }
      return;
    }
    if (!button || (event.relatedTarget && button.contains(event.relatedTarget))) { return; }
    if (button !== pointerCurrentButton) {
      pointerCurrentButton = button;
      syncPointerFocus(button);
      notePlayerPointerActivity(button);
    }
  }

  function onPointerMove(event) {
    var x = Number(event.clientX);
    var y = Number(event.clientY);
    var button = closestButton(event.target);
    var distance;
    if (!isFinite(x) || !isFinite(y)) { return; }
    pointerLastX = x;
    pointerLastY = y;
    if (wheelPointerLocked) {
      if (wheelPointerLockX === null || wheelPointerLockY === null) {
        wheelPointerLockX = x;
        wheelPointerLockY = y;
        return;
      }
      distance = Math.sqrt(Math.pow(x - wheelPointerLockX, 2) + Math.pow(y - wheelPointerLockY, 2));
      if (distance < wheelPointerUnlockDistance) { return; }
      wheelPointerLocked = false;
      wheelPointerLockX = null;
      wheelPointerLockY = null;
      pointerCurrentButton = null;
    }
    if (new Date().getTime() < pointerSuppressedUntil) { return; }
    if (pointerOriginX === null || pointerOriginY === null) {
      pointerOriginX = x;
      pointerOriginY = y;
      pointerOriginTarget = button;
      return;
    }
    if (!pointerPrimed) {
      distance = Math.sqrt(Math.pow(x - pointerOriginX, 2) + Math.pow(y - pointerOriginY, 2));
      if (distance < 20 || button === pointerOriginTarget) { return; }
      pointerPrimed = true;
    }
    if (appView === 'player' && playerControlsMode === 'timeline' && !settingsOpen) {
      playerControlsMode = PlayerControlsState.next(playerControlsMode, 'pointer');
      playerZone = 'buttons';
      playerButtonIndex = 1;
      showPlayerControls();
      updatePlayerButtonFocus();
    }
    if (button && button !== pointerCurrentButton) {
      pointerCurrentButton = button;
      syncPointerFocus(button);
      notePlayerPointerActivity(button);
    }
  }

  function wheelKeyEvent(direction) {
    return { keyCode: direction < 0 ? 38 : 40, preventDefault: function () {} };
  }

  function pageScrollContainer() {
    if (appView === 'home' && state.area === 'media') { return document.getElementById('content'); }
    if (appView === 'library' && libraryZone === 'grid') { return document.getElementById(libraryViewKey() === 'recommended' ? 'library-recommended' : 'library-grid'); }
    if (appView === 'watchlist' && watchlistSnapshot().zone === 'grid') { return document.getElementById('watchlist-grid'); }
    if (appView === 'search' && searchSnapshot().focus.zone === 'results') { return document.getElementById('search-results'); }
    if (appView === 'settings' && serverEditorView.snapshot().open) { return document.getElementById('app-settings-list'); }
    if (appView === 'settings' && !settingsView.snapshot().languageKind) { return document.getElementById('app-settings-list'); }
    if (appView === 'settings' && settingsView.snapshot().languageKind) { return document.getElementById('language-editor-list'); }
    return null;
  }

  function firstVisibleButton(container, selector) {
    var buttons = container ? container.querySelectorAll(selector) : [];
    var containerRect = container ? container.getBoundingClientRect() : null;
    var best = null;
    var bestScore = Infinity;
    var index;
    var rect;
    var score;
    for (index = 0; index < buttons.length; index += 1) {
      rect = buttons[index].getBoundingClientRect();
      if (!containerRect || rect.bottom <= containerRect.top || rect.top >= containerRect.bottom) { continue; }
      score = Math.abs(rect.top - containerRect.top) + Math.abs(rect.left - containerRect.left) / 100;
      if (score < bestScore) { best = buttons[index]; bestScore = score; }
    }
    return best;
  }

  function syncFocusAfterPageScroll() {
    var container = pageScrollContainer();
    var button;
    if (!container) { return; }
    if (appView === 'home') {
      button = firstVisibleButton(container, '[data-row-index][data-column]');
      if (button) {
        state.area = 'media';
        state.rowIndex = Number(button.getAttribute('data-row-index'));
        state.column = Number(button.getAttribute('data-column'));
      }
    } else if (appView === 'library') {
      button = firstVisibleButton(container, libraryViewKey() === 'recommended' ? '[data-library-recommendation-row]' : '[data-library-index]');
      if (button) {
        libraryZone = 'grid';
        libraryGridView.restoreFocus(button);
      }
    } else if (appView === 'watchlist') {
      button = firstVisibleButton(container, '[data-watchlist-index]');
      if (button) { watchlistView.restoreFocus(button); }
    } else if (appView === 'search') {
      button = firstVisibleButton(container, '[data-search-index]');
      if (button) {
        searchView.focusResult(Number(button.getAttribute('data-search-index')));
      }
    } else if (appView === 'settings' && serverEditorView.snapshot().open) {
      button = firstVisibleButton(container, '[data-server-index]');
      if (button) { serverEditorView.focus(Number(button.getAttribute('data-server-index')), serverState.servers.length + 2); }
    } else if (appView === 'settings' && settingsView.snapshot().languageKind) {
      button = firstVisibleButton(container, '[data-language-index]');
      if (button) { settingsView.focusLanguage(Number(button.getAttribute('data-language-index')), orderedEditorLanguages().length); }
    } else if (appView === 'settings') {
      button = firstVisibleButton(container, '[data-setting-index]');
      if (button) { settingsView.focusList(Number(button.getAttribute('data-setting-index')), settingsRows()); }
    }
  }

  function scrollCurrentPage(direction) {
    var container = pageScrollContainer();
    var amount;
    if (!container) { return false; }
    pageScrollPendingFocus = true;
    amount = Math.max(180, Math.round(container.clientHeight * 0.55));
    wheelNavigationActive = true;
    root.clearTimeout(libraryWheelScrollTimer);
    if (document.activeElement && document.activeElement.blur) { document.activeElement.blur(); }
    libraryWheelScrollTimer = root.setTimeout(function () {
      libraryWheelScrollTimer = null;
      wheelNavigationActive = false;
    }, 350);
    if (container.scrollBy) { container.scrollBy({ top: direction * amount, left: 0, behavior: 'smooth' }); }
    else { container.scrollTop += direction * amount; }
    return true;
  }

  function onWheel(event) {
    var delta = Number(event.deltaY);
    var direction;
    if (!isFinite(delta) || delta === 0) { delta = -Number(event.wheelDelta || 0); }
    if (!isFinite(delta) || delta === 0) { return; }
    event.preventDefault();
    if (wheelDebounceTimer) { return; }
    direction = delta < 0 ? -1 : 1;
    wheelPointerLocked = true;
    wheelPointerLockX = pointerLastX;
    wheelPointerLockY = pointerLastY;
    pointerSuppressedUntil = new Date().getTime() + 500;
    wheelDebounceTimer = root.setTimeout(function () { wheelDebounceTimer = null; }, 70);
    if (detailPresentationSnapshot().mediaInfoDialogOpen) {
      scrollDetailMediaInfo(direction);
      return;
    }
    if (detailPresentationSnapshot().summaryDialogOpen) {
      scrollDetailSummary(direction);
      return;
    }
    if (appSettings.wheelBehavior === 'items') {
      onKeyDown(wheelKeyEvent(direction));
    } else if (appSettings.wheelBehavior === 'page' && scrollCurrentPage(direction)) {
      return;
    } else {
      onKeyDown(wheelKeyEvent(direction));
    }
  }

  function onPointerDown(event) {
    var button = closestButton(event.target);
    if (!button || !button.hasAttribute('data-nav-index') || !navigationHasFocus() || navReorderMode) { return; }
    syncPointerFocus(button);
    startNavHold(Number(button.getAttribute('data-nav-index')));
  }

  function onPointerUp() {
    if (navHoldTriggered && navReorderMode) {
      navReorderReady = true;
      suppressNextPointerClick = true;
      navHoldTriggered = false;
    }
    cancelNavHold();
  }

  function seekTimelineFromPointer(event, button) {
    var rect = button.getBoundingClientRect();
    var clientX = Number(event.clientX);
    var ratio;
    var total;
    if (!isFinite(clientX) && isFinite(Number(event.pageX))) { clientX = Number(event.pageX) - Number(root.pageXOffset || 0); }
    if (rect.width <= 0 || !isFinite(clientX) || !currentPlayback || playerStreamSwitching) { return; }
    total = Number(currentPlayback.duration || 0) / 1000;
    if (!isFinite(total) || total <= 0) { return; }
    ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    if (!isFinite(ratio)) { return; }
    event.preventDefault();
    seekPlayerTo(ratio * total);
  }

  function onPointerClick(event) {
    var button = closestButton(event.target);
    var accentColor = event.target && event.target.getAttribute ? event.target.getAttribute('data-accent-color') : '';
    if (!button || button.disabled) { return; }
    if (suppressNextPointerClick) { suppressNextPointerClick = false; return; }
    if (typeof button.onclick === 'function') {
      notePlayerPointerActivity(button);
      return;
    }
    if (navReorderMode && button.hasAttribute('data-nav-index')) {
      if (navReorderReady) { finishNavReorder(true); }
      return;
    }
    syncPointerFocus(button);
    notePlayerPointerActivity(button);
    if (button.hasAttribute('data-choice-index') && choiceDialogView.snapshot().open) {
      choiceDialogView.focus(Number(button.getAttribute('data-choice-index')));
      closeChoiceDialog(true);
    } else if (button.id === 'privacy-dialog-close' && privacyDialogOpen) {
      closePrivacyPolicy();
    } else if (accentColor && button.hasAttribute('data-setting-index')) {
      selectAccentColor(accentColor);
    } else if (button.hasAttribute('data-resume-index') && resumeChoiceVisible) {
      resumeChoiceState.index = Number(button.getAttribute('data-resume-index'));
      activateResumeChoice();
    } else if (button.hasAttribute('data-diagnostics-action') && appView === 'diagnostics') {
      diagnosticsView.setFocus(button.getAttribute('data-diagnostics-action') === 'refresh' ? 0 : 1);
      activateDiagnosticsAction();
    } else if (button.hasAttribute('data-profile-shortcut')) {
      openProfileManager();
    } else if (button.hasAttribute('data-setup-language') || button.hasAttribute('data-setup-action') || button.hasAttribute('data-setup-server') || button.hasAttribute('data-setup-profile')) {
      activateSetupButton(button);
    } else if (button.hasAttribute('data-nav-index')) {
      if (appView === 'search') { activateSearchNav(); return; }
      activateNavigationIndex(Number(button.getAttribute('data-nav-index')));
    } else if (button.hasAttribute('data-row-index')) {
      activate();
    } else if (button.hasAttribute('data-setting-index')) {
      openAppSettingChoice();
    } else if (button.hasAttribute('data-language-index')) {
      toggleEditorLanguage();
    } else if (button.hasAttribute('data-server-index')) {
      activateServerEditorRow();
    } else if (button.hasAttribute('data-search-key')) {
      searchView.applyKey(button.getAttribute('data-search-key'));
    } else if (button.hasAttribute('data-search-index')) {
      openDetail(searchSnapshot().results[Number(button.getAttribute('data-search-index'))]);
    } else if (button.hasAttribute('data-library-tab')) {
      if (button.disabled) { return; }
      selectLibraryTab(Number(button.getAttribute('data-library-tab')));
    } else if (button.hasAttribute('data-library-sort')) {
      activateLibrarySort(button.getAttribute('data-library-sort'));
    } else if (button.hasAttribute('data-library-filter')) {
      activateLibraryFilter(button.getAttribute('data-library-filter'));
    } else if (button.hasAttribute('data-library-filter-open')) {
      openLibraryFilterDrawer();
    } else if (button.hasAttribute('data-library-advanced-filter') || button.hasAttribute('data-library-filter-option') || button.hasAttribute('data-library-filter-action')) {
      libraryFilterView.activatePointer(button);
    } else if (button.hasAttribute('data-library-index')) {
      libraryGridView.pointerFocus(button);
      var libraryItem = libraryGridView.focusedItem();
      if (libraryItem && libraryItem.containerKey) { openLibraryContainer(libraryItem); }
      else { openDetail(libraryItem); }
    } else if (button.hasAttribute('data-library-recommendation-row')) {
      libraryGridView.pointerFocus(button);
      openDetail(libraryGridView.focusedItem());
    } else if (button.hasAttribute('data-watchlist-index')) {
      button = watchlistView.activatePointer(button);
      if (button) { openDetail(button); }
    } else if (button.id === 'library-refresh') {
      refreshActiveLibrary();
    } else if (button.id === 'library-refresh-metadata') {
      refreshActiveLibraryMetadata();
    } else if (button.id === 'player-timeline-button') {
      seekTimelineFromPointer(event, button);
    } else if (button.id === 'player-skip-marker') {
      activateSkipMarker();
    } else if (button.id === 'player-chapters-hint') {
      openChapterDrawer();
    } else if (button.hasAttribute('data-chapter-index') && chapterState.open) {
      chapterState.index = Number(button.getAttribute('data-chapter-index'));
      activateChapter();
    } else if ((button.className.indexOf('setting-row') !== -1 || button.id === 'player-media-info') && settingsOpen) {
      openPlayerSettingChoice();
    } else if (button.hasAttribute('data-subtitle-editor') && subtitleEditorOpen) {
      activateSubtitleEditorControl(button.getAttribute('data-subtitle-editor'));
    }
  }

  applyCardScale();
  applyAccentColor();
  applyAnimationPreference();
  translateStaticUi();
  renderNavigation();
  updateClock();
  root.setInterval(updateClock, 30000);
  document.addEventListener('keydown', onKeyDown, false);
  document.addEventListener('mouseover', onPointerOver, false);
  document.addEventListener('mousemove', onPointerMove, false);
  document.addEventListener('wheel', onWheel, { passive: false });
  document.addEventListener('mousewheel', onWheel, { passive: false });
  document.addEventListener('mousedown', onPointerDown, false);
  document.addEventListener('mouseup', onPointerUp, false);
  document.addEventListener('click', onPointerClick, false);
  document.getElementById('library-grid').addEventListener('scroll', onLibraryGridScroll, false);
  document.addEventListener('keyup', function (event) {
    if (event.keyCode === 37 || event.keyCode === 39) { seekRepeatCount = 0; }
    if (event.keyCode === 13 && navigationHasFocus()) {
      if (navHoldTriggered && navReorderMode) {
        navReorderReady = true;
        navHoldTriggered = false;
      } else if (navHoldTimer) {
        cancelNavHold();
        enterActiveNavigationView();
      }
    }
  }, false);
  root.addEventListener('resize', function () {
    root.clearTimeout(navbarResizeTimer);
    navbarResizeTimer = root.setTimeout(function () {
      renderNavigation();
      if (appView === 'detail') { updateDetailSummaryOverflow(); updateDetailMediaInfoOverflow(); }
    }, 100);
  }, false);
  document.getElementById('detail-play').onclick = openPlayer;
  document.getElementById('detail-watched').onclick = toggleCurrentWatched;
  document.getElementById('detail-watchlist').onclick = toggleCurrentWatchlist;
  document.getElementById('detail-refresh-metadata').onclick = refreshCurrentMetadata;
  document.getElementById('detail-file-info').onclick = function () { openAdvancedMediaInfo('detail'); };
  document.getElementById('detail-audio').onclick = function () { openDetailChoice('audio'); };
  document.getElementById('detail-subtitles').onclick = function () { openDetailChoice('subtitles'); };
  document.getElementById('detail-version').onclick = function () { openDetailChoice('version'); };
  document.getElementById('detail-summary-button').onclick = openDetailSummary;
  document.getElementById('detail-media-info-button').onclick = openDetailMediaInfo;
  document.getElementById('player-previous').onclick = function () { switchPlayerEpisode(-1); };
  document.getElementById('player-toggle').onclick = function () {
    togglePlayback();
  };
  document.getElementById('player-next').onclick = function () { switchPlayerEpisode(1); };
  document.getElementById('player-settings-button').onclick = function () { setSettingsOpen(true); };
  document.getElementById('player-media-info').onclick = function () { openAdvancedMediaInfo('player'); };
  document.getElementById('media-info-dialog-close').onclick = closeAdvancedMediaInfo;
  document.getElementById('player-error-retry').onclick = retryPlaybackFromError;
  document.getElementById('player-error-settings').onclick = function () { hidePlayerError(); setSettingsOpen(true); };
  document.getElementById('player-error-back').onclick = function () { hidePlayerError(); closePlayer(); };
  document.getElementById('player-video').addEventListener('click', function () { if (subtitleEditorOpen) { return; } showPlayerControls(); togglePlayback(); }, false);
  document.getElementById('autoplay-play').onclick = confirmAutoplayCountdown;
  document.getElementById('autoplay-cancel').onclick = cancelAutoplayCountdown;
  document.getElementById('player-video').addEventListener('playing', function () {
    playerBufferingIndicator.stop();
    root.clearTimeout(playerResumeTimer);
    playerStreamSwitching = false;
    playerBuffering = false;
    playbackClock = PlaybackClock.freeze(playbackClock, false);
    playerRecoveryState = PlaybackRecovery.playing(playerRecoveryState);
    hidePlayerError();
    startTranscodeKeepalive();
    if (!playerNativeSeekPending) { setPlayerLoading(false); }
    setText('player-status', t('status.playing'));
    if (pendingPlaybackRestore) { restartTimelineAfterSubtitleRestore(); }
    sendPlayerTimeline('playing');
    updatePlayerDisplay();
  }, false);
  document.getElementById('player-video').addEventListener('canplay', function () {
    var video = document.getElementById('player-video');
    var directTarget;
    if (appView !== 'player') { return; }
    playerBufferingIndicator.stop();
    if (playerBuffering) {
      playerBuffering = false;
      playbackClock = PlaybackClock.freeze(playbackClock, false);
      setPlayerLoading(false);
    }
    if (currentPlayback && currentPlayback.directSeekTarget !== null && currentPlayback.directSeekTarget !== undefined) {
      directTarget = Number(currentPlayback.directSeekTarget || 0);
      if (directTarget > 0.25) {
        playerNativeSeekPending = true;
        armNativeSeekVerification(directTarget, directTarget);
        try { video.currentTime = directTarget; } catch (seekError) { playerNativeSeekPending = false; playerNativeSeekTarget = null; root.clearTimeout(playerNativeSeekVerificationTimer); recoverPlaybackError(); return; }
      }
      currentPlayback.directSeekTarget = null;
    }
    if (playerStreamSwitching) { resumeRebuiltStream(); }
    else if (video.paused) { video.play(); }
  }, false);
  document.getElementById('player-video').addEventListener('waiting', function () {
    var video = document.getElementById('player-video');
    if (appView !== 'player' || !currentPlayback || playerStreamSwitching || video.paused) { return; }
    playerBufferingIndicator.signal();
  }, false);
  document.getElementById('player-video').addEventListener('stalled', function () {
    var video = document.getElementById('player-video');
    if (appView !== 'player' || !currentPlayback || playerStreamSwitching || video.paused) { return; }
    playerBufferingIndicator.signal();
  }, false);
  document.getElementById('player-video').addEventListener('seeking', function () {
    if (appView !== 'player' || !currentPlayback) { return; }
    playbackClock = PlaybackClock.freeze(playbackClock, true);
  }, false);
  document.getElementById('player-video').addEventListener('seeked', function () {
    var video = document.getElementById('player-video');
    var observation;
    var expectedSeek = playerNativeSeekPending;
    var expectedNativeTime = playerNativeSeekTarget;
    if (appView !== 'player' || !currentPlayback) { return; }
    root.clearTimeout(playerClockRepairFallbackTimer);
    root.clearTimeout(playerNativeSeekVerificationTimer);
    playerNativeSeekVerificationTimer = null;
    playerClockRepairFallbackTimer = null;
    playerNativeSeekPending = false;
    playerNativeSeekTarget = null;
    if (expectedSeek && expectedNativeTime !== null && !PlayerSeekController.reached(expectedNativeTime, video.currentTime)) {
      rebuildCurrentStream(Number(currentPlayback.offsetBase || 0) + Number(expectedNativeTime || 0), false);
      return;
    }
    if (!playerStreamSwitching && !playerBuffering) {
      playbackClock = PlaybackClock.freeze(playbackClock, false);
      observation = PlaybackClock.observe(playbackClock, Number(currentPlayback.offsetBase || 0), Number(video.currentTime || 0), expectedSeek);
      playbackClock = observation.state;
      if (observation.desynced) { schedulePlayerClockRepair(); }
      setPlayerLoading(false);
      updatePlayerDisplay();
    }
  }, false);
  document.getElementById('player-video').addEventListener('pause', function () {
    playerBufferingIndicator.stop();
    if (playerStreamSwitching) { return; }
    if (appView === 'player') {
      playerBuffering = false;
      playbackClock = PlaybackClock.freeze(playbackClock, false);
      setPlayerLoading(false);
      setText('player-status', t('status.paused'));
      sendPlayerTimeline('paused');
      updatePlayerDisplay();
    }
  }, false);
  document.getElementById('player-video').addEventListener('timeupdate', updatePlayerDisplay, false);
  document.getElementById('player-video').addEventListener('timeupdate', updateSubtitleEditorPlayback, false);
  document.getElementById('player-video').addEventListener('ended', function () { if (playerStreamSwitching) { return; } sendPlayerTimeline('stopped'); setText('player-status', t('status.ended')); startAutoplayCountdown(); }, false);
  document.getElementById('player-video').addEventListener('error', function () { if (appView === 'player') { setText('player-status', t('status.playbackError')); recoverPlaybackError(); } }, false);
  networkState.subscribe(function (snapshot) {
    var transition = networkTransition.update(snapshot, activeServer);
    var localWasAvailable = transition.localWasAvailable;
    var cloudRecovered = transition.cloudRecovered;
    var localAvailable = networkState.allowsLocal();
    networkSnapshot = snapshot;
    renderNetworkPresentation();
    if (!localAvailable) {
      homePoller.stop();
      if (appView === 'player' && currentPlayback) { setText('player-status', t('player.waitingNetwork')); }
      return;
    }
    if (!localWasAvailable && appView === 'player' && currentPlayback && playerRecoveryState.status === 'waiting-network') {
      playerRecoveryState = PlaybackRecovery.online(playerRecoveryState);
      hidePlayerError();
      applyCurrentPlaybackAttempt(true);
      return;
    }
    if (!localWasAvailable || cloudRecovered) {
      recoverActiveViewAfterNetwork();
      homePoller.schedule();
    }
  });
  document.addEventListener('visibilitychange', function () {
    var video = document.getElementById('player-video');
    if (document.hidden) {
      homePoller.stop();
      root.clearInterval(timelineTimer);
      root.clearInterval(estimatedEndTimer);
    } else {
      homePoller.schedule();
      if (appView === 'player' && currentPlayback) {
        root.clearInterval(timelineTimer);
        timelineTimer = root.setInterval(function () { sendPlayerTimeline(video.paused ? 'paused' : 'playing'); }, 3000);
        startEstimatedEndTimer();
      }
    }
  }, false);
  DeviceCapabilities.detect(root, function (capabilities) { playbackCapabilities = capabilities; });
  bootstrapPlex();
}(this, /** @type {*} */ (document)));
});
