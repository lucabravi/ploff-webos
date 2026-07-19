(function (root, document) {
  'use strict';

  var data = { navigation: ['Home'], rows: [] };
  var FocusModel = root.PloffFocusModel;
  var NavigationModel = root.PloffNavigationModel;
  var SearchModel = root.PloffSearchModel;
  var HomeState = root.PloffHomeState;
  var ActivityState = root.PloffActivityState;
  var MetadataRefresh = root.PloffMetadataRefresh;
  var SkipMarkerState = root.PloffSkipMarkerState;
  var PlayerControlsState = root.PloffPlayerControlsState;
  var ChapterState = root.PloffChapterState;
  var PlaybackStrategy = root.PloffPlaybackStrategy;
  var PlaybackRecovery = root.PloffPlaybackRecovery;
  var PlaybackClock = root.PloffPlaybackClock;
  var EpisodeNavigation = root.PloffEpisodeNavigation;
  var ResumeChoice = root.PloffResumeChoice;
  var SubtitleSync = root.PloffSubtitleSync;
  var SubtitleOffsetStore = root.PloffSubtitleOffsetStore;
  var DiagnosticsState = root.PloffDiagnosticsState;
  var NavbarWindow = root.PloffNavbarWindow;
  var LibraryContainers = root.PloffLibraryContainers;
  var ViewState = root.PloffViewState;
  var CardLayout = root.PloffCardLayout;
  var DeviceCapabilities = root.PloffDeviceCapabilities;
  var MediaPreferences = root.PloffMediaPreferences;
  var MediaProfile = root.PloffMediaProfile;
  var MediaLabels = root.PloffMediaLabels;
  var WatchlistClient = root.PloffWatchlistClient;
  var WatchlistState = root.PloffWatchlistState;
  var PlexClient = root.PloffClient;
  var ProgressiveImages = root.PloffProgressiveImages;
  var I18n = root.PloffI18n;
  var Settings = root.PloffSettings;
  var AuthStore = root.PloffAuthStore;
  var PlexAuth = root.PloffPlexAuth;
  var ServerStore = root.PloffServerStore;
  var ServerDiscovery = root.PloffServerDiscovery;
  var BackgroundAudio = root.PloffBackgroundAudio;
  var BuildInfo = root.PloffBuildInfo || { version: 'development' };
  var config = root.PloffConfig || {};
  var configuredApiBaseUrl = config.apiBaseUrl || '';
  var configuredToken = config.token || '';
  var configuredServer = ServerStore ? ServerStore.fromConfig(config) : null;
  var serverState = ServerStore ? ServerStore.load(root.localStorage) : { version: 1, activeUri: '', servers: [] };
  var authState = AuthStore ? AuthStore.load(root.localStorage) : { version: 1, setupComplete: false, mode: 'offline', ownerToken: '', activeProfileId: '', profiles: [] };
  var authOptions = {
    baseUrl: config.accountBaseUrl || 'https://plex.tv',
    clientIdentifier: PlexAuth ? PlexAuth.clientIdentifier(root.localStorage) : '',
    deviceName: 'Ploff',
    platformVersion: String(root.navigator && root.navigator.userAgent || ''),
    timeout: Math.min(6000, Number(config.requestTimeout || 5000)),
    version: BuildInfo.version
  };
  var activeServer = null;
  var serverEditorOpen = false;
  var serverEditorIndex = 0;
  var serverDiscoveryActive = false;
  var serverFailoverRequest = null;
  var serverFailoverFailedUris = {};
  var setupStage = 'servers';
  var setupFocusIndex = 0;
  var setupSelectedServer = null;
  var setupPreferredConnectionUri = '';
  var setupEnteredConnectionUri = '';
  var setupProfiles = [];
  var setupSelectedProfile = null;
  var setupPin = null;
  var setupPollTimer = null;
  var setupPollDeadline = 0;
  var setupAuthGeneration = 0;
  var setupLoginPurpose = 'profiles';
  var setupStatusKey = '';
  var setupReturnView = '';
  var setupProfileBusy = false;
  if (ServerStore && configuredServer) {
    serverState.servers = ServerStore.merge(serverState.servers, [configuredServer]);
  }
  var navigationItems = data.navigation.map(function (title, index) {
    return { title: title, kind: index === 0 ? 'home' : (title === 'Cerca' ? 'search' : 'demo'), labelKey: index === 0 ? 'nav.home' : (title === 'Cerca' ? 'nav.search' : '') };
  });
  navigationItems.push({ title: 'Watchlist', kind: 'watchlist', labelKey: 'nav.watchlist' });
  navigationItems.push({ title: 'Impostazioni', kind: 'settings', labelKey: 'nav.settings' });
  var navbarLibraryWindowStart = 0;
  var navbarResizeTimer = null;
  var appSettings = Settings.load(root.localStorage);
  var initialCardMetrics = CardLayout.metrics(appSettings.cardScale);
  var settingsViewIndex = 0;
  var settingsZone = 'list';
  var languageEditorKind = '';
  var languageEditorIndex = 0;
  var languageCatalog = ['en', 'it', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh', 'ru'];
  var accentColorValues = {
    cyan: '#13b8ad',
    amber: '#e5a00d',
    blue: '#4da3ff',
    green: '#48c774',
    pink: '#ec6aa7',
    red: '#f05d5e'
  };
  var setupUiLanguages = [
    { code: 'en', label: 'English' },
    { code: 'it', label: 'Italiano' },
    { code: 'es', label: 'Espa\u00f1ol' },
    { code: 'fr', label: 'Fran\u00e7ais' },
    { code: 'de', label: 'Deutsch' },
    { code: 'pt', label: 'Portugu\u00eas' }
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
  var searchQuery = '';
  var searchSymbolMode = false;
  var searchResults = [];
  var searchFocus = { zone: 'keyboard', row: 0, column: 0, index: 0 };
  var searchDebounceTimer = null;
  var activeSearchRequest = null;
  var searchGeneration = 0;
  var searchResultLayout = { columns: CardLayout.columns(1612, appSettings.cardScale), visibleRows: 1, totalRows: 0, cardWidth: initialCardMetrics.columnStep, cardHeight: initialCardMetrics.rowStep };
  var searchRenderWindow = { start: 0, end: 0, visibleStartRow: 0, offsetRows: 0 };
  var searchVisibleStartRow = 0;
  var searchCardRenderToken = 0;
  var resultOverscanRows = 3;
  var activeLibrary = null;
  var libraryTabIndex = 0;
  var libraryZone = 'tabs';
  var libraryControlIndex = 0;
  var libraryItems = [];
  var libraryTotalSize = 0;
  var libraryFocusIndex = 0;
  var librarySort = 'titleSort';
  var librarySortDirection = 'asc';
  var libraryWatchedFilter = 'all';
  var libraryGeneration = 0;
  var libraryRequest = null;
  var libraryContinueRequest = null;
  var libraryContinueProbeToken = 0;
  var libraryContinueAvailable = null;
  var libraryActionIndex = 0;
  var libraryRefreshPending = false;
  var libraryLoading = false;
  var libraryError = null;
  var libraryLayout = { columns: CardLayout.columns(1612, appSettings.cardScale), visibleRows: 2, totalRows: 0, cardWidth: initialCardMetrics.width, cardHeight: initialCardMetrics.rowStep };
  var libraryWindow = { start: 0, end: 0, visibleStartRow: 0, offsetRows: 0 };
  var libraryVisibleStartRow = 0;
  var libraryScrollRenderTimer = null;
  var libraryBackLockedUntil = 0;
  var libraryContainer = null;
  var libraryContainerParentState = null;
  var watchlistItems = [];
  var watchlistFocusIndex = 0;
  var watchlistZone = 'grid';
  var watchlistProvider = null;
  var watchlistGeneration = 0;
  var watchlistRequest = null;
  var watchlistLocalRequests = [];
  var watchlistLoading = false;
  var watchlistError = null;
  var watchlistLoadedIdentity = '';
  var watchlistByLocalKey = {};
  var watchlistMutationPending = false;
  var selectedItem = null;
  var seriesContext = null;
  var detailZone = 'play';
  var detailSeasonIndex = 0;
  var detailEpisodeIndex = 0;
  var detailMetadataTimer = null;
  var seasonPreviewTimer = null;
  var seasonPreviewToken = 0;
  var episodePanTimers = [];
  var episodePanToken = 0;
  var currentDetail = null;
  var currentMediaProfile = null;
  var currentMediaOverride = null;
  var detailMediaProfileRequest = null;
  var detailMediaProfileTimer = null;
  var detailMediaProfileToken = 0;
  var detailMediaProfileRatingKey = '';
  var detailMediaProfileLoading = false;
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
  var playbackCapabilities = { directPlay: false, codecs: [], containers: [], known: false, uhd: false, hdr10: false };

  var playerStreamSwitching = false;
  var playbackClock = PlaybackClock.create(2);
  var playerBuffering = false;
  var playerNativeSeekPending = false;
  var playerClockRepairTimer = null;
  var playerClockRepairFallbackTimer = null;
  var timelineTimer = null;
  var transcodeKeepaliveTimer = null;
  var playerResumeTimer = null;
  var playerButtonIndex = 1;
  var playerZone = 'buttons';
  var playerControlsTimer = null;
  var playerControlsMode = 'full';
  var playerControlsVisible = true;
  var chapterState = ChapterState.create();
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
  var subtitleEditorIndex = 0;
  var subtitleEditorRequest = null;
  var subtitleEditorGeneration = 0;
  var failedSubtitleStreams = {};
  var playerTimelineSuppressed = false;
  var pendingPlaybackRestore = null;
  var localSubtitleState = null;
  var localSubtitleRequest = null;
  var localSubtitleGeneration = 0;
  var estimatedEndTimer = null;
  var detailActionIndex = 0;
  var detailRefreshPending = false;
  var detailMetadataStatusTimer = null;
  var detailMetadataStatusTemporary = false;
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
  var diagnosticsTimer = null;
  var diagnosticsIdentityRequest = null;
  var diagnosticsIdentity = null;
  var diagnosticsReachable = false;
  var diagnosticsFocusIndex = 0;
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
        document.body.className = document.body.className.replace(/\s*is-booting/g, '');
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
      return appView === 'home' && !document.hidden && !!config.apiBaseUrl && (!root.navigator || root.navigator.onLine !== false);
    },
    isLoading: function () { return homeRefreshCoordinator.isLoading(); },
    refresh: function () { homeRefreshCoordinator.refresh(); }
  });

  function t(key, parameters) {
    return I18n.t(appSettings.uiLanguage, key, parameters);
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
    style.setProperty('--poster-title-font', Math.max(16, Math.round(23 * appSettings.cardScale / 100)) + 'px');
    style.setProperty('--poster-meta-font', Math.max(13, Math.round(18 * appSettings.cardScale / 100)) + 'px');
  }

  function navigationTitle(item) {
    return item.labelKey ? t(item.labelKey) : item.title;
  }

  function mediaTitle(item) { return MediaLabels.title(item, t); }
  function mediaMeta(item) { return MediaLabels.meta(item, t); }
  function mediaDetail(item) { return MediaLabels.detail(item, t); }
  function mediaDescription(item) { return MediaLabels.description(item, t); }

  function watchlistAccountToken() {
    var profile = AuthStore ? AuthStore.activeProfile(authState) : null;
    return authState.mode === 'plex' ? String(profile && profile.accountToken || authState.ownerToken || '') : '';
  }

  function watchlistAvailable() {
    return !!(WatchlistState && WatchlistClient && WatchlistState.available(authState.mode, watchlistAccountToken()));
  }

  function watchlistIdentity() {
    var profile = AuthStore ? AuthStore.activeProfile(authState) : null;
    return [activeServer && (activeServer.machineIdentifier || activeServer.uri) || config.apiBaseUrl || '', profile && (profile.id || profile.uuid || profile.title) || 'local'].join('|');
  }

  function translateStaticUi() {
    document.getElementById('navigation').setAttribute('aria-label', t('nav.main'));
    setText('detail-play', t('detail.play'));
    setText('detail-refresh-metadata', t('detail.refreshMetadata'));
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
      if (navReorderMode) { item.className += ' is-reordering'; }
    }
    return item;
  }

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
    updateNodeText(card.querySelector('.card-meta'), mediaMeta(item));
    if (mediaDetail(item)) {
      if (!detail) { detail = element('span', 'card-detail'); caption.appendChild(detail); }
      updateNodeText(detail, mediaDetail(item));
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

  function searchRows() {
    return searchSymbolMode ? SearchModel.symbolRows : SearchModel.letterRows;
  }

  function searchKeyLabel(key) {
    if (key === 'shift') { return searchSymbolMode ? t('search.letters') : t('search.symbols'); }
    if (key === 'space') { return t('search.space'); }
    if (key === 'backspace') { return t('search.backspace'); }
    if (key === 'clear') { return t('search.clear'); }
    return key;
  }

  function renderSearchQuery() {
    var query = document.getElementById('search-query');
    setText('search-query', searchQuery || t('search.prompt'));
    query.className = 'search-query' + (searchQuery ? '' : ' is-placeholder');
  }

  function renderSearchKeyboard() {
    var container = document.getElementById('search-keyboard');
    var rows = searchRows();
    var rowIndex;
    var column;
    var row;
    var key;
    var button;
    container.innerHTML = '';
    for (rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      row = element('div', 'search-keyboard-row');
      for (column = 0; column < rows[rowIndex].length; column += 1) {
        key = rows[rowIndex][column];
        button = element('button', 'search-key' + (key === 'space' ? ' is-space' : (key.length > 1 ? ' is-wide' : '')), searchKeyLabel(key));
        button.type = 'button';
        button.setAttribute('data-search-key', key);
        button.setAttribute('data-search-row', rowIndex);
        button.setAttribute('data-search-column', column);
        row.appendChild(button);
      }
      container.appendChild(row);
    }
  }

  function measureSearchResults(container) {
    var probe = element('button', 'search-card search-card-probe');
    var rect;
    var computed;
    var cardWidth;
    var cardHeight;
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
    measured = SearchModel.measureLayout(container.clientWidth - 12, container.clientHeight - 12, cardWidth, cardHeight, searchResults.length);
    measured.cardWidth = Math.max(64, cardWidth);
    measured.cardHeight = Math.max(64, cardHeight);
    return measured;
  }

  function searchMediaKey(item) {
    return String(item.ratingKey || item.key || item.image || item.title || '');
  }

  function updateNodeText(node, value) {
    node.innerHTML = '';
    node.appendChild(document.createTextNode(value || ''));
  }

  function createSearchCard() {
    var card = element('button', 'search-card');
    var caption;
    card.type = 'button';
    card.appendChild(element('img', 'search-card-image'));
    card.appendChild(element('span', 'search-library-badge'));
    caption = element('span', 'search-card-caption');
    caption.appendChild(element('span', 'search-card-title'));
    caption.appendChild(element('span', 'search-card-meta'));
    card.appendChild(caption);
    return card;
  }

  function updateSearchCard(card, item, index) {
    var image = card.getElementsByTagName('img')[0];
    image.alt = '';
    card.setAttribute('data-search-index', index);
    card.setAttribute('data-media-key', searchMediaKey(item));
    card.setAttribute('aria-label', mediaTitle(item) + ', ' + item.libraryTitle);
    card.className = 'search-card' + (item.viewed ? ' is-viewed' : '');
    updateNodeText(card.querySelector('.search-library-badge'), item.libraryTitle);
    updateNodeText(card.querySelector('.search-card-title'), mediaTitle(item));
    updateNodeText(card.querySelector('.search-card-meta'), mediaMeta(item));
    return image;
  }

  function renderSearchResults() {
    var container = document.getElementById('search-results');
    var existingCardsByKey = {};
    var existingCards = [];
    var desiredKeys = {};
    var recyclableCards = [];
    var children = container.children;
    var index;
    var item;
    var key;
    var card;
    var image;
    var token;
    var focusIndex = searchFocus.zone === 'results' ? searchFocus.index : searchVisibleStartRow * searchResultLayout.columns;
    var visibleStart;
    var visibleEnd;
    var posterJobs = [];
    for (index = 0; index < children.length; index += 1) {
      if (children[index].hasAttribute('data-search-index')) {
        card = children[index];
        existingCards.push(card);
        existingCardsByKey[card.getAttribute('data-media-key') || ''] = card;
      }
    }
    if (!searchResults.length) {
      container.innerHTML = '';
      searchResultLayout = { columns: CardLayout.columns(container.clientWidth || 1612, appSettings.cardScale), visibleRows: 1, totalRows: 0, cardWidth: cardMetrics().columnStep, cardHeight: cardMetrics().rowStep };
      searchRenderWindow = { start: 0, end: 0, visibleStartRow: 0, offsetRows: 0 };
      searchVisibleStartRow = 0;
      return;
    }
    searchResultLayout = measureSearchResults(container);
    searchRenderWindow = SearchModel.virtualWindow(
      focusIndex,
      searchResults.length,
      searchResultLayout.columns,
      searchResultLayout.visibleRows,
      resultOverscanRows,
      searchVisibleStartRow
    );
    searchVisibleStartRow = searchRenderWindow.visibleStartRow;
    visibleStart = searchVisibleStartRow * searchResultLayout.columns;
    visibleEnd = Math.min(searchResults.length, visibleStart + searchResultLayout.visibleRows * searchResultLayout.columns);
    for (index = searchRenderWindow.start; index < searchRenderWindow.end; index += 1) {
      desiredKeys[searchMediaKey(searchResults[index])] = true;
    }
    for (index = 0; index < existingCards.length; index += 1) {
      if (!desiredKeys[existingCards[index].getAttribute('data-media-key') || '']) { recyclableCards.push(existingCards[index]); }
    }
    searchCardRenderToken += 1;
    token = searchCardRenderToken;
    for (index = searchRenderWindow.start; index < searchRenderWindow.end; index += 1) {
      item = searchResults[index];
      key = searchMediaKey(item);
      card = existingCardsByKey[key];
      if (!card || card.__plexSearchRenderToken === token) { card = recyclableCards.shift() || createSearchCard(); }
      card.__plexSearchRenderToken = token;
      image = updateSearchCard(card, item, index);
      container.appendChild(card);
      posterJobs.push({
        target: image,
        specification: renderedPosterSpecification(
          image,
          item.image,
          searchFocus.zone === 'results' && index === searchFocus.index ? 0 : (index >= visibleStart && index < visibleEnd ? 1 : 2),
          'search',
          cardMetrics().width,
          cardMetrics().imageHeight
        )
      });
    }
    posterLoader.loadBatch(posterJobs);
    existingCards.forEach(function (existingCard) {
      if (existingCard.__plexSearchRenderToken !== token && existingCard.parentNode === container) {
        container.removeChild(existingCard);
      }
    });
    container.scrollTop = searchRenderWindow.offsetRows * searchResultLayout.cardHeight;
  }

  function ensureSearchWindow() {
    var nextWindow;
    if (searchFocus.zone !== 'results' || !searchResults.length) { return; }
    nextWindow = SearchModel.virtualWindow(
      searchFocus.index,
      searchResults.length,
      searchResultLayout.columns,
      searchResultLayout.visibleRows,
      resultOverscanRows,
      searchVisibleStartRow
    );
    if (nextWindow.start !== searchRenderWindow.start || nextWindow.end !== searchRenderWindow.end) {
      renderSearchResults();
    }
  }

  function searchLayout() {
    return {
      keyboardRows: searchRows().map(function (row) { return row.length; }),
      resultColumns: searchResultLayout.columns,
      resultCount: searchResults.length
    };
  }

  function keepSearchFocusVisible(node) {
    var container;
    var nodeRect;
    var containerRect;
    if (!node || !node.hasAttribute('data-search-index')) { return; }
    container = document.getElementById('search-results');
    nodeRect = node.getBoundingClientRect();
    containerRect = container.getBoundingClientRect();
    if (nodeRect.bottom > containerRect.bottom) { container.scrollTop += nodeRect.bottom - containerRect.bottom + 12; }
    else if (nodeRect.top < containerRect.top) { container.scrollTop -= containerRect.top - nodeRect.top + 12; }
  }

  function updateSearchFocus() {
    var target;
    ensureSearchWindow();
    clearLogicalFocus();
    if (searchFocus.zone === 'nav') {
      target = document.querySelector(selectorForNavIndex(state.navIndex));
    } else if (searchFocus.zone === 'keyboard') {
      target = document.querySelector('[data-search-row="' + searchFocus.row + '"][data-search-column="' + searchFocus.column + '"]');
    } else {
      target = document.querySelector('[data-search-index="' + searchFocus.index + '"]');
    }
    if (target) {
      target.className += ' is-focused';
      if (searchFocus.zone === 'results') { prioritizePoster(target); }
      if (!pointerSelectionActive) {
        target.focus();
        keepSearchFocusVisible(target);
      }
    }
    if (searchFocus.zone === 'results' && searchResults[searchFocus.index]) {
      scheduleSearchBackdrop(searchResults[searchFocus.index]);
    }
  }

  function cancelSearchWork(keepImages) {
    root.clearTimeout(searchDebounceTimer);
    searchDebounceTimer = null;
    if (!keepImages) { posterLoader.cancelScope('search'); }
    if (activeSearchRequest) {
      activeSearchRequest.abort();
      activeSearchRequest = null;
    }
  }

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
    if (watchlistProvider) { searchProvider(watchlistProvider); return; }
    group.add(WatchlistClient.discover(root, {
      token: token,
      timeout: Math.min(6000, Number(config.requestTimeout || 5000))
    }, function (error, provider) {
      if (group.isAborted()) { return; }
      if (error || !provider) { callback([], error || new Error('Cloud search provider unavailable')); return; }
      watchlistProvider = provider;
      searchProvider(provider);
    }));
  }

  function applySearchResults(error, items) {
    searchResults = error ? [] : items;
    searchVisibleStartRow = 0;
    renderSearchResults();
    setText('search-status', error ? t('search.error') : (items.length ? '' : t('search.noResults')));
    if (searchFocus.zone === 'results' && !searchResults.length) {
      searchFocus = { zone: 'keyboard', row: searchRows().length - 1, column: 0, index: 0 };
    }
    updateSearchFocus();
  }

  function scheduleSearch() {
    var query = searchQuery.replace(/^\s+|\s+$/g, '');
    var generation;
    searchGeneration += 1;
    generation = searchGeneration;
    cancelSearchWork();
    if (query.length < 2) {
      searchResults = [];
      renderSearchResults();
      setText('search-status', t('search.typeMore'));
      if (searchFocus.zone === 'results') { searchFocus = { zone: 'keyboard', row: searchRows().length - 1, column: 0, index: 0 }; }
      updateSearchFocus();
      return;
    }
    setText('search-status', t('search.loading'));
    searchDebounceTimer = root.setTimeout(function () {
      var group = createSearchRequestGroup();
      var localItems = [];
      var localError = null;
      activeSearchRequest = group;
      group.add(PlexClient.search(config, query, navigationItems, function (error, items) {
        if (generation !== searchGeneration || appView !== 'search' || query !== searchQuery.replace(/^\s+|\s+$/g, '')) { return; }
        localError = error || null;
        localItems = error ? [] : items;
        applySearchResults(error && !watchlistAccountToken() ? error : null, localItems);
        if (!watchlistAccountToken()) { activeSearchRequest = null; return; }
        loadCloudSearchMatches(query, group, function (resolvedItems, cloudError) {
          if (group.isAborted() || generation !== searchGeneration || appView !== 'search' || query !== searchQuery.replace(/^\s+|\s+$/g, '')) { return; }
          activeSearchRequest = null;
          applySearchResults(localError && cloudError ? localError : null, SearchModel.mergeLocalResults(localItems, resolvedItems));
        });
      }));
    }, 300);
  }

  function applySearchKey(key) {
    var previousQuery = searchQuery;
    var result = SearchModel.applyKey(searchQuery, key, searchSymbolMode);
    searchQuery = result.query;
    searchSymbolMode = result.symbolMode;
    if (key === 'shift') {
      searchFocus = { zone: 'keyboard', row: searchSymbolMode ? 2 : 3, column: 0, index: 0 };
    }
    renderSearchQuery();
    renderSearchKeyboard();
    if (previousQuery !== searchQuery) { scheduleSearch(); }
    else { updateSearchFocus(); }
  }

  function leaveSearch() {
    searchGeneration += 1;
    cancelSearchWork();
    document.getElementById('search-view').className = 'search-view is-hidden';
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
    searchQuery = '';
    searchSymbolMode = false;
    searchResults = [];
    searchFocus = keepNavigationFocus
      ? { zone: 'nav', row: 0, column: 0, index: 0 }
      : { zone: 'keyboard', row: 0, column: 0, index: 0 };
    backgroundAudio.stop();
    document.getElementById('content').style.display = 'none';
    document.getElementById('library-view').className = 'library-view is-hidden';
    document.getElementById('app-settings-view').className = 'app-settings-view is-hidden';
    document.getElementById('detail-view').className = 'detail-view is-hidden';
    document.getElementById('search-view').className = 'search-view';
    renderNavigation();
    renderSearchQuery();
    renderSearchKeyboard();
    renderSearchResults();
    setText('search-status', t('search.typeMore'));
    updateSearchFocus();
  }

  function closeSearch() {
    leaveSearch();
    revealHome({ focus: 'preserve' });
  }

  function activateSearchNav() {
    enterActiveNavigationView();
  }

  function libraryViewKey() {
    return LibraryContainers.views()[libraryTabIndex];
  }

  function renderLibrarySubnav() {
    var container = document.getElementById('library-tabs');
    var labels = [t('library.continue'), t('library.recent'), t('library.catalog'), t('library.collections'), t('library.playlists')];
    var index;
    var button;
    container.innerHTML = '';
    for (index = 0; index < labels.length; index += 1) {
      button = element('button', 'library-tab' + (index === libraryTabIndex ? ' is-active' : '') + (index === 0 && libraryContinueAvailable === false ? ' is-disabled' : ''), labels[index]);
      button.type = 'button';
      button.setAttribute('data-library-tab', index);
      if (index === 0 && libraryContinueAvailable === false) { button.disabled = true; }
      container.appendChild(button);
    }
  }

  function nextLibraryTab(direction) {
    var next = libraryTabIndex + direction;
    while (next >= 0 && next <= 4 && next === 0 && libraryContinueAvailable === false) { next += direction; }
    return next < 0 || next > 4 ? libraryTabIndex : next;
  }

  function selectLibraryTab(index) {
    libraryContainer = null; libraryContainerParentState = null;
    libraryTabIndex = Math.max(0, Math.min(4, Number(index) || 0));
    libraryZone = 'tabs'; libraryControlIndex = 0;
    renderLibrarySubnav(); renderLibraryControls(); loadLibraryContent(true); updateLibraryFocus();
  }

  function libraryUsesGridScroll() {
    return libraryViewKey() === 'catalog' || libraryViewKey() === 'collections' || libraryViewKey() === 'playlists' || !!libraryContainer;
  }

  function sortLabel(key) {
    var active = librarySort === key;
    var label = key === 'titleSort' ? 'A-Z' : t('library.rating');
    if (active) { label += librarySortDirection === 'asc' ? ' \u2193' : ' \u2191'; }
    return label;
  }

  function libraryItemMeta(item) {
    if (item && item.containerType) { return t('library.titlesCount', { count: Number(item.childCount || 0) }); }
    return item ? mediaMeta(item) : '';
  }

  function renderLibraryControls() {
    var controls = document.getElementById('library-controls');
    var sort = document.getElementById('library-sort');
    var filter = document.getElementById('library-filter');
    var sortKeys = ['titleSort', 'audienceRating'];
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
  }

  function updateLibraryCardProgress(card, item) {
    var progress = card.querySelector('.progress-track');
    var progressValue;
    if (typeof item.progress === 'number') {
      if (!progress) {
        progress = element('span', 'progress-track');
        progress.appendChild(element('span', 'progress-value'));
        card.appendChild(progress);
      }
      progressValue = progress.querySelector('.progress-value');
      progressValue.style.width = Math.max(0, Math.min(100, item.progress)) + '%';
    } else if (progress) {
      card.removeChild(progress);
    }
  }

  function updateLibraryCard(card, item, index) {
    var title = card.querySelector('.library-card-title');
    var meta = card.querySelector('.library-card-meta');
    var badge = card.querySelector('.library-rating-badge');
    var metaText = libraryItemMeta(item) + (mediaDetail(item) ? ' - ' + mediaDetail(item) : '');
    card.setAttribute('data-library-index', index);
    card.setAttribute('data-media-key', searchMediaKey(item));
    card.setAttribute('aria-label', [mediaTitle(item), metaText].filter(function (value) { return !!value; }).join(', '));
    updateNodeText(title, mediaTitle(item));
    updateNodeText(meta, metaText);
    if (typeof item.rating === 'number' && !isNaN(item.rating)) {
      if (!badge) {
        badge = element('span', 'library-rating-badge');
        card.insertBefore(badge, card.querySelector('.library-card-caption'));
      }
      updateNodeText(badge, '\u2665 ' + item.rating.toFixed(1));
    } else if (badge) {
      card.removeChild(badge);
    }
    updateLibraryCardProgress(card, item);
  }

  function renderLibraryGrid() {
    var container = document.getElementById('library-grid');
    var content = document.getElementById('library-grid-content');
    var catalogScrollTop = container.scrollTop;
    var existingCards = {};
    var desiredCards = {};
    var children = content.children;
    var metrics = cardMetrics();
    var visibleRows = libraryUsesGridScroll() ? Math.max(1, Math.ceil((container.clientHeight || 600) / metrics.rowStep)) : 1;
    var index;
    var item;
    var card;
    var image;
    var caption;
    var nextCard;
    var nextIndex;
    var isNew;
    var totalRows;
    var startRow;
    var endRow;
    var visibleStart;
    var visibleEnd;
    var posterJobs = [];
    for (index = 0; index < children.length; index += 1) {
      if (children[index].hasAttribute('data-library-index')) {
        existingCards[children[index].getAttribute('data-library-index')] = children[index];
      }
    }
    libraryLayout = SearchModel.measureLayout((container.clientWidth || 1612) - 12, container.clientHeight || 600, metrics.columnStep, metrics.rowStep, libraryItems.length);
    libraryLayout.visibleRows = visibleRows;
    libraryLayout.cardWidth = metrics.width;
    libraryLayout.cardHeight = metrics.rowStep;
    if (libraryUsesGridScroll()) {
      totalRows = Math.ceil(libraryItems.length / libraryLayout.columns);
      libraryVisibleStartRow = Math.max(0, Math.min(Math.max(0, totalRows - visibleRows), Math.floor(container.scrollTop / metrics.rowStep)));
      startRow = Math.max(0, libraryVisibleStartRow - resultOverscanRows);
      endRow = Math.min(totalRows, libraryVisibleStartRow + visibleRows + resultOverscanRows);
      libraryWindow = {
        start: startRow * libraryLayout.columns,
        end: Math.min(libraryItems.length, endRow * libraryLayout.columns),
        visibleStartRow: libraryVisibleStartRow,
        offsetRows: libraryVisibleStartRow - startRow
      };
      content.className = 'library-grid-content is-catalog';
      content.style.height = (totalRows * metrics.rowStep) + 'px';
    } else {
      libraryWindow = SearchModel.virtualWindow(libraryFocusIndex, libraryItems.length, libraryLayout.columns, visibleRows, resultOverscanRows, libraryVisibleStartRow);
      libraryVisibleStartRow = libraryWindow.visibleStartRow;
      content.className = 'library-grid-content';
      content.style.height = 'auto';
    }
    visibleStart = libraryVisibleStartRow * libraryLayout.columns;
    visibleEnd = Math.min(libraryItems.length, visibleStart + visibleRows * libraryLayout.columns);
    for (index = libraryWindow.start; index < libraryWindow.end; index += 1) {
      item = libraryItems[index];
      card = existingCards[index];
      isNew = !card;
      if (!card) {
        card = element('button', 'library-card');
        card.type = 'button';
        image = element('img', 'library-card-image'); image.alt = ''; card.appendChild(image);
        caption = element('span', 'library-card-caption');
        caption.appendChild(element('span', 'library-card-title'));
        caption.appendChild(element('span', 'library-card-meta'));
        card.appendChild(caption);
      } else {
        image = card.getElementsByTagName('img')[0];
      }
      updateLibraryCard(card, item, index);
      card.className = 'library-card' + (item.viewed ? ' is-viewed' : '') + (libraryZone === 'grid' && index === libraryFocusIndex ? ' is-focused' : '');
      desiredCards[index] = true;
      if (libraryUsesGridScroll()) {
        card.style.left = ((index % libraryLayout.columns) * metrics.columnStep) + 'px';
        card.style.top = (Math.floor(index / libraryLayout.columns) * metrics.rowStep) + 'px';
        card.style.width = metrics.width + 'px';
      } else {
        card.style.left = '';
        card.style.top = '';
        card.style.width = '';
      }
      if (isNew) {
        nextCard = null;
        for (nextIndex = index + 1; nextIndex < libraryWindow.end; nextIndex += 1) {
          if (existingCards[nextIndex]) { nextCard = existingCards[nextIndex]; break; }
        }
        if (nextCard) { content.insertBefore(card, nextCard); }
        else { content.appendChild(card); }
      }
      posterJobs.push({
        target: image,
        specification: renderedPosterSpecification(
          image,
          item.image,
          libraryZone === 'grid' && index === libraryFocusIndex ? 0 : (index >= visibleStart && index < visibleEnd ? 1 : 2),
          'library',
          metrics.width,
          metrics.imageHeight
        )
      });
    }
    posterLoader.loadBatch(posterJobs);
    Object.keys(existingCards).forEach(function (key) {
      if (!desiredCards[key] && existingCards[key].parentNode === content) {
        content.removeChild(existingCards[key]);
      }
    });
    if (libraryUsesGridScroll()) { container.scrollTop = catalogScrollTop; }
    else { container.scrollTop = libraryWindow.offsetRows * metrics.rowStep; }
  }

  function onLibraryGridScroll() {
    var container = document.getElementById('library-grid');
    if (appView !== 'library' || !libraryUsesGridScroll()) { return; }
    root.clearTimeout(libraryScrollRenderTimer);
    libraryScrollRenderTimer = root.setTimeout(function () {
      libraryScrollRenderTimer = null;
      renderLibraryGrid();
      if (libraryItems.length < libraryTotalSize && container.scrollTop + container.clientHeight >= container.scrollHeight - cardMetrics().rowStep * 2) {
        loadLibraryContent(false);
      }
    }, 40);
  }

  function ensureLibraryWindow() {
    var next;
    if (libraryZone !== 'grid' || !libraryItems.length) { return; }
    next = SearchModel.virtualWindow(libraryFocusIndex, libraryItems.length, libraryLayout.columns, libraryLayout.visibleRows, resultOverscanRows, libraryVisibleStartRow);
    if (next.start !== libraryWindow.start || next.end !== libraryWindow.end) { renderLibraryGrid(); }
  }

  function keepLibraryFocusVisible(target) {
    var container;
    var targetRect;
    var containerRect;
    if (!target || !target.hasAttribute('data-library-index')) { return; }
    container = document.getElementById('library-grid');
    targetRect = target.getBoundingClientRect();
    containerRect = container.getBoundingClientRect();
    if (targetRect.bottom > containerRect.bottom - 12) { container.scrollTop += targetRect.bottom - containerRect.bottom + 12; }
    else if (targetRect.top < containerRect.top + 12) { container.scrollTop -= containerRect.top - targetRect.top + 12; }
  }

  function updateLibraryFocus() {
    var target;
    ensureLibraryWindow();
    clearLogicalFocus();
    if (libraryZone === 'nav') { target = document.querySelector(selectorForNavIndex(state.navIndex)); }
    else if (libraryZone === 'tabs') { target = document.querySelector('[data-library-tab="' + libraryTabIndex + '"]'); }
    else if (libraryZone === 'actions') { target = document.getElementById(libraryActionIndex === 0 ? 'library-refresh' : 'library-refresh-metadata'); }
    else if (libraryZone === 'sort') { target = document.querySelectorAll('[data-library-sort]')[libraryControlIndex]; }
    else if (libraryZone === 'filter') { target = document.querySelectorAll('[data-library-filter]')[libraryControlIndex]; }
    else { target = document.querySelector('[data-library-index="' + libraryFocusIndex + '"]'); }
    if (target) {
      target.className += ' is-focused';
      if (libraryZone === 'grid') { prioritizePoster(target); }
      if (!pointerSelectionActive && !wheelNavigationActive) { target.focus(); keepLibraryFocusVisible(target); }
    }
    if (libraryZone === 'grid' && libraryItems[libraryFocusIndex]) {
      scheduleViewBackdrop(libraryItems[libraryFocusIndex], 'library', 250);
      scheduleTheme(libraryItems[libraryFocusIndex]);
    } else {
      backgroundAudio.stop();
    }
  }

  function loadLibraryContent(reset) {
    var generation;
    var start;
    if (!activeLibrary) { return; }
    if (reset) {
      libraryGeneration += 1;
      posterLoader.cancelScope('library');
      if (libraryRequest && libraryRequest.abort) { libraryRequest.abort(); }
      libraryLoading = false;
      libraryError = null;
      libraryItems = []; libraryTotalSize = 0; libraryFocusIndex = 0; libraryVisibleStartRow = 0;
      renderLibraryGrid();
      hideViewState();
    }
    if (libraryLoading) { return; }
    generation = libraryGeneration;
    start = libraryItems.length;
    libraryLoading = true;
    updateLibraryStatus();
    if (libraryContainer) {
      libraryRequest = PlexClient.loadLibraryContainerPage(config, libraryContainer, start, 60, function (error, page) {
        finishLibraryPage(error, page, generation);
      });
    } else {
      libraryRequest = PlexClient.loadLibraryPage(config, activeLibrary, libraryViewKey(), {
        sort: librarySort, direction: librarySortDirection, watched: libraryWatchedFilter
      }, start, libraryUsesGridScroll() ? 60 : 30, function (error, page) {
        finishLibraryPage(error, page, generation);
      });
    }
  }

  function finishLibraryPage(error, page, generation) {
      libraryLoading = false;
      if (generation !== libraryGeneration || appView !== 'library') { return; }
      libraryError = error || null;
      if (!error && activeLibrary && (libraryContainer || page.libraryKey === String(activeLibrary.key))) {
        libraryItems = libraryItems.concat(page.items);
        libraryTotalSize = page.totalSize;
      }
      hideViewState();
      updateLibraryStatus();
      if (!libraryItems.length && libraryZone === 'grid') { libraryZone = 'tabs'; }
      renderLibraryGrid(); updateLibraryFocus();
  }

  function updateLibraryStatus() {
    var key = LibraryContainers.statusKey(libraryViewKey(), libraryLoading, libraryError, libraryItems.length, !!libraryContainer);
    document.getElementById('library-status').className = 'library-status' + (key && !libraryItems.length ? ' is-prominent' : '');
    setText('library-status', key ? t(key) : '');
  }

  function probeLibraryContinue() {
    var token = libraryContinueProbeToken + 1;
    var libraryKey = activeLibrary ? String(activeLibrary.key) : '';
    libraryContinueProbeToken = token;
    if (libraryContinueRequest && libraryContinueRequest.abort) { libraryContinueRequest.abort(); }
    libraryContinueRequest = PlexClient.loadLibraryPage(config, activeLibrary, 'continue', {}, 0, 1, function (error, page) {
      if (token !== libraryContinueProbeToken || appView !== 'library' || !activeLibrary || String(activeLibrary.key) !== libraryKey) { return; }
      libraryContinueRequest = null;
      if (error || !page) { return; }
      libraryContinueAvailable = page.items.length > 0;
      if (!libraryContinueAvailable && libraryTabIndex === 0) {
        libraryTabIndex = 1;
        renderLibraryControls(); loadLibraryContent(true);
      }
      renderLibrarySubnav(); updateLibraryFocus();
    });
  }

  function openLibrary(library, navIndex, keepNavigationFocus) {
    activeLibrary = library; state.navIndex = navIndex; appView = 'library';
    libraryContainer = null; libraryContainerParentState = null;
    libraryTabIndex = 0; libraryZone = keepNavigationFocus ? 'nav' : 'tabs'; libraryControlIndex = 0; libraryActionIndex = 0; libraryContinueAvailable = null;
    document.getElementById('content').style.display = 'none';
    document.getElementById('search-view').className = 'search-view is-hidden';
    document.getElementById('app-settings-view').className = 'app-settings-view is-hidden';
    document.getElementById('detail-view').className = 'detail-view is-hidden';
    document.getElementById('library-view').className = 'library-view';
    renderNavigation(); renderLibrarySubnav(); renderLibraryControls(); loadLibraryContent(true); probeLibraryContinue(); updateLibraryFocus();
  }

  function leaveLibrary() {
    hideViewState();
    libraryGeneration += 1;
    libraryContinueProbeToken += 1;
    posterLoader.cancelScope('library');
    if (libraryRequest && libraryRequest.abort) { libraryRequest.abort(); }
    if (libraryContinueRequest && libraryContinueRequest.abort) { libraryContinueRequest.abort(); }
    libraryContinueRequest = null;
    libraryContainer = null; libraryContainerParentState = null;
    document.getElementById('library-view').className = 'library-view is-hidden';
  }

  function closeLibrary() {
    leaveLibrary();
    revealHome({ focus: 'preserve' });
  }

  function openLibraryContainer(item) {
    if (!item || !item.containerKey) { return; }
    libraryContainerParentState = {
      items: libraryItems,
      totalSize: libraryTotalSize,
      focusIndex: libraryFocusIndex,
      visibleStartRow: libraryVisibleStartRow,
      scrollTop: document.getElementById('library-grid').scrollTop
    };
    libraryContainer = item;
    libraryZone = 'grid';
    loadLibraryContent(true);
  }

  function closeLibraryContainer() {
    var stateToRestore = libraryContainerParentState;
    if (!libraryContainer || !stateToRestore) { return false; }
    libraryGeneration += 1;
    if (libraryRequest && libraryRequest.abort) { libraryRequest.abort(); }
    libraryContainer = null;
    libraryContainerParentState = null;
    libraryItems = stateToRestore.items;
    libraryTotalSize = stateToRestore.totalSize;
    libraryFocusIndex = stateToRestore.focusIndex;
    libraryVisibleStartRow = stateToRestore.visibleStartRow;
    libraryError = null;
    libraryZone = 'grid';
    renderLibraryGrid();
    document.getElementById('library-grid').scrollTop = stateToRestore.scrollTop;
    updateLibraryStatus();
    updateLibraryFocus();
    return true;
  }

  function cancelWatchlistRequests() {
    if (watchlistRequest && watchlistRequest.abort) { watchlistRequest.abort(); }
    watchlistRequest = null;
    while (watchlistLocalRequests.length) {
      if (watchlistLocalRequests[0] && watchlistLocalRequests[0].abort) { watchlistLocalRequests[0].abort(); }
      watchlistLocalRequests.shift();
    }
  }

  function indexWatchlistItems() {
    watchlistByLocalKey = {};
    watchlistItems.forEach(function (item) {
      if (item.ratingKey) { watchlistByLocalKey[String(item.ratingKey)] = item; }
    });
  }

  function renderWatchlistGrid() {
    var content = document.getElementById('watchlist-grid-content');
    var jobs = [];
    var index;
    var item;
    var card;
    var image;
    var caption;
    content.innerHTML = '';
    for (index = 0; index < watchlistItems.length; index += 1) {
      item = watchlistItems[index];
      card = element('button', 'watchlist-card' + (item.viewed ? ' is-viewed' : ''));
      card.type = 'button';
      card.setAttribute('data-watchlist-index', index);
      image = element('img', 'library-card-image'); image.alt = ''; card.appendChild(image);
      if (typeof item.rating === 'number' && !isNaN(item.rating)) { card.appendChild(element('span', 'library-rating-badge', '\u2665 ' + item.rating.toFixed(1))); }
      caption = element('span', 'library-card-caption');
      caption.appendChild(element('span', 'library-card-title', mediaTitle(item)));
      caption.appendChild(element('span', 'library-card-meta', mediaMeta(item) + (mediaDetail(item) ? ' - ' + mediaDetail(item) : '')));
      card.appendChild(caption);
      content.appendChild(card);
      jobs.push({ target: image, specification: renderedPosterSpecification(image, item.image, index === watchlistFocusIndex ? 0 : 1, 'watchlist', cardMetrics().width, cardMetrics().imageHeight) });
    }
    posterLoader.loadBatch(jobs);
  }

  function updateWatchlistStatus() {
    var key = WatchlistState.statusKey(watchlistLoading, watchlistError, watchlistItems.length);
    setText('watchlist-status', key ? t(key) : '');
  }

  function updateWatchlistFocus() {
    var target;
    var container;
    var targetRect;
    var containerRect;
    clearLogicalFocus();
    if (watchlistZone === 'nav') { target = document.querySelector(selectorForNavIndex(state.navIndex)); }
    else { target = document.querySelector('[data-watchlist-index="' + watchlistFocusIndex + '"]'); }
    if (target) {
      target.className += ' is-focused';
      if (watchlistZone === 'grid') { prioritizePoster(target); }
      if (!pointerSelectionActive && !wheelNavigationActive) {
        target.focus();
        if (watchlistZone === 'grid') {
          container = document.getElementById('watchlist-grid'); targetRect = target.getBoundingClientRect(); containerRect = container.getBoundingClientRect();
          if (targetRect.bottom > containerRect.bottom - 12) { container.scrollTop += targetRect.bottom - containerRect.bottom + 12; }
          else if (targetRect.top < containerRect.top + 12) { container.scrollTop -= containerRect.top - targetRect.top + 12; }
        }
      }
    }
    if (watchlistZone === 'grid' && watchlistItems[watchlistFocusIndex]) {
      scheduleViewBackdrop(watchlistItems[watchlistFocusIndex], 'watchlist', 250);
      scheduleTheme(watchlistItems[watchlistFocusIndex]);
    } else { backgroundAudio.stop(); }
  }

  function watchlistOptions() {
    return { token: watchlistAccountToken(), provider: watchlistProvider, timeout: Math.min(8000, Number(config.requestTimeout || 6000)) };
  }

  function loadWatchlistData(force, callback) {
    var identity = watchlistIdentity();
    var generation;
    function done(error) { if (callback) { callback(error || null, watchlistItems); } }
    function resolveCloud(error, cloudItems) {
      if (error || generation !== watchlistGeneration) {
        watchlistLoading = false;
        watchlistError = error || new Error('Stale Watchlist');
        if (appView === 'watchlist') {
          updateWatchlistStatus();
          updateWatchlistFocus();
        }
        if (appView === 'detail') { renderDetailWatchlist(); }
        done(watchlistError);
        return;
      }
      WatchlistState.resolve(cloudItems, function (guid, resolved) {
        var request = PlexClient.findByGuid(config, guid, resolved);
        watchlistLocalRequests.push(request);
      }, 4, function (resolveError, localItems) {
        if (generation !== watchlistGeneration) { return; }
        watchlistLoading = false;
        watchlistError = resolveError || null;
        watchlistItems = resolveError ? [] : localItems;
        watchlistLoadedIdentity = identity;
        indexWatchlistItems();
        watchlistFocusIndex = Math.max(0, Math.min(watchlistFocusIndex, watchlistItems.length - 1));
        if (appView === 'watchlist') {
          updateWatchlistStatus(); renderWatchlistGrid(); updateWatchlistFocus();
        }
        if (appView === 'detail') { syncCurrentDetailWatchlist(); renderDetailWatchlist(); }
        done(resolveError || null);
      });
    }
    function loadProvider() {
      watchlistRequest = WatchlistClient.load(root, watchlistOptions(), 0, 200, resolveCloud);
    }
    if (!watchlistAvailable()) { done(new Error('Watchlist unavailable')); return; }
    if (!force && watchlistLoadedIdentity === identity) {
      watchlistError = null;
      if (appView === 'watchlist') { updateWatchlistStatus(); }
      done(null); return;
    }
    if (!force && watchlistLoading) { return; }
    watchlistGeneration += 1; generation = watchlistGeneration; cancelWatchlistRequests(); watchlistLoading = true; watchlistError = null;
    if (appView === 'watchlist') { updateWatchlistStatus(); }
    if (watchlistProvider) { loadProvider(); }
    else {
      watchlistRequest = WatchlistClient.discover(root, { token: watchlistAccountToken(), timeout: Math.min(8000, Number(config.requestTimeout || 6000)) }, function (error, provider) {
        if (error || generation !== watchlistGeneration) {
          watchlistLoading = false;
          watchlistError = error || new Error('Stale Watchlist');
          if (appView === 'watchlist') { updateWatchlistStatus(); updateWatchlistFocus(); }
          if (appView === 'detail') { renderDetailWatchlist(); }
          done(watchlistError);
          return;
        }
        watchlistProvider = provider; loadProvider();
      });
    }
  }

  function openWatchlist(keepNavigationFocus) {
    if (!watchlistAvailable()) { showMessage(t('watchlist.unavailable')); renderNavigation(); return; }
    appView = 'watchlist'; watchlistZone = keepNavigationFocus ? 'nav' : 'grid'; watchlistFocusIndex = 0;
    hideViewState();
    document.getElementById('content').style.display = 'none';
    document.getElementById('library-view').className = 'library-view is-hidden';
    document.getElementById('search-view').className = 'search-view is-hidden';
    document.getElementById('app-settings-view').className = 'app-settings-view is-hidden';
    document.getElementById('detail-view').className = 'detail-view is-hidden';
    document.getElementById('watchlist-view').className = 'watchlist-view';
    setText('watchlist-title', t('nav.watchlist'));
    renderNavigation(); updateWatchlistStatus(); renderWatchlistGrid(); updateWatchlistFocus(); loadWatchlistData(false);
  }

  function leaveWatchlist() {
    hideViewState();
    posterLoader.cancelScope('watchlist');
    document.getElementById('watchlist-view').className = 'watchlist-view is-hidden';
  }

  function closeWatchlist() {
    leaveWatchlist(); revealHome({ focus: 'preserve' });
  }

  function activateLibrarySort(key) {
    if (librarySort === key) { librarySortDirection = librarySortDirection === 'asc' ? 'desc' : 'asc'; }
    else { librarySort = key; librarySortDirection = key === 'audienceRating' ? 'desc' : 'asc'; }
    renderLibraryControls(); loadLibraryContent(true); updateLibraryFocus();
  }

  function activateLibraryFilter(key) {
    if (libraryWatchedFilter === key) { return; }
    libraryWatchedFilter = key; renderLibraryControls(); loadLibraryContent(true); updateLibraryFocus();
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
    loadLibraryContent(true);
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
    if (appView === 'watchlist') { return watchlistZone === 'nav'; }
    if (appView === 'search') { return searchFocus.zone === 'nav'; }
    if (appView === 'settings') { return settingsZone === 'nav'; }
    if (appView === 'detail') { return detailZone === 'nav'; }
    return false;
  }

  function navigationViewMatches(item) {
    if (!item) { return false; }
    if (item.kind === 'home') { return appView === 'home'; }
    if (item.kind === 'library') { return appView === 'library' && activeLibrary && String(activeLibrary.key) === String(item.key); }
    if (item.kind === 'watchlist') { return appView === 'watchlist'; }
    if (item.kind === 'search') { return appView === 'search'; }
    if (item.kind === 'settings') { return appView === 'settings'; }
    return false;
  }

  function focusCurrentNavigation() {
    state.area = 'nav';
    if (appView === 'home') { updateFocus(); }
    else if (appView === 'library') { libraryZone = 'nav'; updateLibraryFocus(); }
    else if (appView === 'watchlist') { watchlistZone = 'nav'; updateWatchlistFocus(); }
    else if (appView === 'search') { searchFocus.zone = 'nav'; updateSearchFocus(); }
    else if (appView === 'settings') { settingsZone = 'nav'; updateSettingsFocus(); }
    else if (appView === 'detail') { detailZone = 'nav'; updateDetailFocus(); }
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
    if (appView === 'search') { leaveSearch(); }
    else if (appView === 'library') { leaveLibrary(); }
    else if (appView === 'watchlist') { leaveWatchlist(); }
    else if (appView === 'detail') { leaveDetail(); }
    else if (appView === 'settings') { leaveAppSettings(); }
    state.navIndex = targetIndex;
    state.area = 'nav';
    renderNavigation();
    if (item.kind === 'home') { revealHome({ focus: keepNavigationFocus ? 'nav' : 'first' }); }
    else if (item.kind === 'library') { openLibrary(item, targetIndex, keepNavigationFocus); }
    else if (item.kind === 'watchlist') { openWatchlist(keepNavigationFocus); }
    else if (item.kind === 'search') { openSearch(keepNavigationFocus); }
    else if (item.kind === 'settings') { openAppSettings(keepNavigationFocus); }
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
      watchlistZone = watchlistItems.length ? 'grid' : 'nav';
      updateWatchlistFocus();
    } else if (item.kind === 'search') {
      searchFocus.zone = 'keyboard';
      updateSearchFocus();
    } else if (item.kind === 'settings') {
      settingsZone = 'list';
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

  function languageListValue(values) {
    if (!values.length) { return t('settings.notConfigured'); }
    return values.map(function (code) { return I18n.languageName(appSettings.uiLanguage, code); }).join(' > ');
  }

  function videoQualityLabel(value) {
    return value === 'original' ? t('settings.original') : (Number(value) / 1000) + ' Mbps';
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

  function settingsRows() {
    var subtitleLabels = {
      off: t('subtitle.off'),
      always: t('subtitle.always'),
      'audio-mismatch': t('subtitle.audioMismatch'),
      forced: t('subtitle.forced')
    };
    return [
      { key: 'plexServer', section: 'plex', label: t('settings.plexServer'), value: activeServer ? activeServer.name : (config.serverName || config.apiBaseUrl || t('settings.notConfigured')), serverEditor: true },
      { key: 'plexProfile', section: 'plex', label: t('settings.plexProfile'), value: activeProfileTitle(), profileEditor: true },
      { key: 'uiLanguage', section: 'interface', label: t('settings.interfaceLanguage'), value: I18n.languageName(appSettings.uiLanguage, appSettings.uiLanguage) },
      { key: 'wheelBehavior', section: 'interface', label: t('settings.wheelBehavior'), value: t(appSettings.wheelBehavior === 'page' ? 'settings.wheelPage' : 'settings.wheelItems') },
      { key: 'cardScale', section: 'interface', label: t('settings.cardSize'), value: appSettings.cardScale + '%' },
      { key: 'accentColor', section: 'interface', label: t('settings.accentColor'), value: accentColorLabel(appSettings.accentColor), swatch: accentColorValues[appSettings.accentColor] || accentColorValues.cyan },
      { key: 'showMediaInfo', section: 'interface', label: t('settings.showMediaInfo'), value: t(appSettings.showMediaInfo ? 'settings.enabled' : 'settings.disabled') },
      { key: 'backgroundMusic', section: 'audioAppearance', label: t('settings.backgroundMusic'), value: t(appSettings.backgroundMusic ? 'settings.enabled' : 'settings.disabled') },
      { key: 'backgroundVolume', section: 'audioAppearance', label: t('settings.backgroundVolume'), value: appSettings.backgroundVolume + '%' },
      { key: 'backgroundDelay', section: 'audioAppearance', label: t('settings.backgroundDelay'), value: appSettings.backgroundDelay + ' ms' },
      { key: 'videoQuality', section: 'playback', label: t('settings.videoQuality'), value: videoQualityLabel(appSettings.videoQuality) },
      { key: 'playbackMode', section: 'playback', label: t('settings.playbackMode'), value: playbackPreferenceLabel(appSettings.playbackMode) },
      { key: 'autoplayDelay', section: 'playback', label: t('settings.autoplayNext'), value: appSettings.autoplayDelay === 0 ? t('settings.disabled').toUpperCase() : appSettings.autoplayDelay + ' s' },
      { key: 'skipPromptDuration', section: 'playback', label: t('settings.skipPromptDuration'), value: appSettings.skipPromptDuration + ' s' },
      { key: 'audioLanguages', section: 'languages', label: t('settings.audioPriority'), value: languageListValue(appSettings.audioLanguages), editor: true },
      { key: 'subtitleLanguages', section: 'languages', label: t('settings.subtitlePriority'), value: languageListValue(appSettings.subtitleLanguages), editor: true },
      { key: 'subtitleSuppressedForAudio', section: 'languages', label: t('settings.subtitleSuppression'), value: languageListValue(appSettings.subtitleSuppressedForAudio), editor: true },
      { key: 'subtitleMode', section: 'languages', label: t('settings.subtitleMode'), value: subtitleLabels[appSettings.subtitleMode] },
      { key: 'diagnostics', section: 'support', label: t('settings.diagnostics'), value: '', action: true }
    ];
  }

  function settingsSectionLabel(section) {
    var keys = {
      plex: 'settings.sectionPlex',
      interface: 'settings.sectionInterface',
      audioAppearance: 'settings.sectionAudioAppearance',
      playback: 'settings.sectionPlayback',
      languages: 'settings.sectionLanguages',
      support: 'settings.sectionSupport'
    };
    return t(keys[section] || '');
  }

  function saveAppSettings() {
    appSettings = Settings.save(root.localStorage, appSettings);
    document.documentElement.lang = appSettings.uiLanguage;
    applyCardScale();
    applyAccentColor();
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
    var container = document.getElementById('app-settings-list');
    var rows = settingsRows();
    var index;
    var button;
    var value;
    var editor;
    var section = '';
    setText('app-settings-title', t('settings.title'));
    setText('app-settings-notice', t('settings.globalNotice'));
    container.innerHTML = '';
    for (index = 0; index < rows.length; index += 1) {
      if (rows[index].section !== section) {
        section = rows[index].section;
        container.appendChild(element('div', 'app-settings-section', settingsSectionLabel(section)));
      }
      button = element('button', 'app-setting-row' + (settingsZone === 'list' && index === settingsViewIndex && !serverEditorOpen ? ' is-focused' : '') + (index === 0 && serverEditorOpen ? ' has-inline-editor' : ''));
      button.type = 'button';
      button.setAttribute('data-setting-index', index);
      if (rows[index].serverEditor) { button.setAttribute('aria-expanded', serverEditorOpen ? 'true' : 'false'); }
      button.appendChild(element('span', 'app-setting-label', rows[index].label));
      value = element('span', 'app-setting-value', rows[index].value);
      if (rows[index].swatch) {
        editor = element('span', 'app-setting-swatch');
        editor.style.backgroundColor = rows[index].swatch;
        value.insertBefore(editor, value.firstChild);
      }
      button.appendChild(value);
      container.appendChild(button);
      if (settingsViewIndex === 0 && serverEditorOpen && index === 0) {
        editor = element('div', 'server-editor-inline');
        editor.id = 'server-editor';
        editor.appendChild(element('span', 'server-editor-hint', serverDiscoveryActive ? t('settings.scanning') : t('settings.serverEditorHint')));
        value = element('div', 'server-editor-list');
        value.id = 'server-editor-list';
        editor.appendChild(value);
        container.appendChild(editor);
      }
    }
    container.appendChild(element('div', 'app-settings-credit', t('settings.createdBy', { name: 'Rhapsodos93' })));
    if (serverEditorOpen) {
      renderServerEditor();
    } else { updateSettingsFocus(); }
  }

  function updateSettingsFocus() {
    var target = settingsZone === 'nav'
      ? document.querySelector(selectorForNavIndex(state.navIndex))
      : document.querySelector('[data-setting-index="' + settingsViewIndex + '"]');
    clearLogicalFocus();
    if (!target) { return; }
    target.className += ' is-focused';
    if (!pointerSelectionActive) {
      target.focus();
      if (settingsZone === 'list') { keepPanelFocusVisible(document.getElementById('app-settings-list'), target); }
    }
  }

  function changeSetting(direction) {
    var row = settingsRows()[settingsViewIndex];
    if (row.action && row.key === 'diagnostics') { openDiagnostics(); return; }
    if (row.editor) { openLanguageEditor(row.key); return; }
    if (row.serverEditor) { openServerEditor(); return; }
    if (row.profileEditor) { openProfileManager(); return; }
    if (row.key === 'uiLanguage') {
      appSettings.uiLanguage = cycleValue(Settings.supportedUiLanguages(), appSettings.uiLanguage, direction);
      appSettings.uiLanguageExplicit = true;
      homeDomDirty = true;
    } else if (row.key === 'backgroundMusic') {
      appSettings[row.key] = !appSettings[row.key];
    } else if (row.key === 'backgroundVolume') {
      appSettings.backgroundVolume = cycleValue([10, 20, 30], appSettings.backgroundVolume, direction);
    } else if (row.key === 'backgroundDelay') {
      appSettings.backgroundDelay = cycleValue([200, 500, 1000, 2000], appSettings.backgroundDelay, direction);
    } else if (row.key === 'autoplayDelay') {
      appSettings.autoplayDelay = cycleValue([0, 3, 5, 10, 15], appSettings.autoplayDelay, direction);
    } else if (row.key === 'skipPromptDuration') {
      appSettings.skipPromptDuration = cycleValue([3, 5, 10], appSettings.skipPromptDuration, direction);
    } else if (row.key === 'subtitleMode') {
      appSettings.subtitleMode = cycleValue(['off', 'always', 'audio-mismatch', 'forced'], appSettings.subtitleMode, direction);
      appSettings.subtitleModeExplicit = true;
    } else if (row.key === 'videoQuality') {
      appSettings.videoQuality = cycleValue(['original', '12000', '8000', '4000'], appSettings.videoQuality, direction);
    } else if (row.key === 'playbackMode') {
      appSettings.playbackMode = cycleValue(['auto', 'direct', 'transcode'], appSettings.playbackMode, direction);
    } else if (row.key === 'wheelBehavior') {
      appSettings.wheelBehavior = cycleValue(['items', 'page'], appSettings.wheelBehavior, direction);
    } else if (row.key === 'cardScale') {
      appSettings.cardScale = cycleValue(CardLayout.SCALES, appSettings.cardScale, direction);
    } else if (row.key === 'accentColor') {
      appSettings.accentColor = cycleValue(Settings.ACCENT_COLORS, appSettings.accentColor, direction);
    } else if (row.key === 'showMediaInfo') {
      appSettings.showMediaInfo = !appSettings.showMediaInfo;
    }
    saveAppSettings();
    if (row.key === 'cardScale') {
      if (appView === 'home') { renderRows(); updateFocus(); }
      else if (appView === 'search') { renderSearchResults(); updateSearchFocus(); }
      else if (appView === 'library') { renderLibraryGrid(); updateLibraryFocus(); }
      else if (appView === 'watchlist') { renderWatchlistGrid(); updateWatchlistFocus(); }
    }
    renderNavigation();
    renderAppSettings();
  }

  function orderedEditorLanguages() {
    var enabled = appSettings[languageEditorKind] || [];
    return enabled.concat(languageCatalog.filter(function (code) { return enabled.indexOf(code) === -1; }));
  }

  function renderLanguageEditor(selectedCode) {
    var list = document.getElementById('language-editor-list');
    var languages = orderedEditorLanguages();
    var enabled = appSettings[languageEditorKind];
    var index;
    var row;
    var rank;
    if (selectedCode) { languageEditorIndex = Math.max(0, languages.indexOf(selectedCode)); }
    setText('language-editor-title', settingsRows()[settingsViewIndex].label);
    setText('language-editor-hint', t('settings.languageEditorHint'));
    list.innerHTML = '';
    for (index = 0; index < languages.length; index += 1) {
      row = element('button', 'language-editor-row' + (index === languageEditorIndex ? ' is-focused' : ''));
      row.type = 'button';
      row.setAttribute('data-language-index', index);
      row.appendChild(element('span', '', I18n.languageName(appSettings.uiLanguage, languages[index])));
      rank = enabled.indexOf(languages[index]);
      row.appendChild(element('span', 'language-editor-rank', rank === -1 ? '' : String(rank + 1)));
      list.appendChild(row);
    }
    if (!pointerSelectionActive && list.children[languageEditorIndex]) {
      list.children[languageEditorIndex].focus();
      keepPanelFocusVisible(list, list.children[languageEditorIndex]);
    }
  }

  function openLanguageEditor(kind) {
    languageEditorKind = kind;
    languageEditorIndex = 0;
    document.getElementById('language-editor').className = 'language-editor';
    renderLanguageEditor();
  }

  function renderServerEditor() {
    var list = document.getElementById('server-editor-list');
    var index;
    var row;
    var server;
    if (!list) { return; }
    list.innerHTML = '';
    row = element('button', 'server-editor-row' + (serverEditorIndex === 0 ? ' is-focused' : ''));
    row.type = 'button'; row.setAttribute('data-server-index', 0);
    row.appendChild(element('span', '', t('settings.findServers')));
    list.appendChild(row);
    row = element('button', 'server-editor-row' + (serverEditorIndex === 1 ? ' is-focused' : ''));
    row.type = 'button'; row.setAttribute('data-server-index', 1); row.setAttribute('data-server-action', 'manual');
    row.appendChild(element('span', '', t('setup.manualAddress')));
    list.appendChild(row);
    for (index = 0; index < serverState.servers.length; index += 1) {
      server = serverState.servers[index];
      row = element('button', 'server-editor-row' + (serverEditorIndex === index + 2 ? ' is-focused' : ''));
      row.type = 'button'; row.setAttribute('data-server-index', index + 2);
      row.appendChild(element('span', '', (activeServer && activeServer.uri === server.uri ? '\u2713 ' : '') + server.name));
      appendServerEditorAddresses(row, serverConnectionAddresses(server));
      list.appendChild(row);
    }
    if (!pointerSelectionActive && serverEditorOpen && list.children[serverEditorIndex]) {
      list.children[serverEditorIndex].focus();
      keepPanelFocusVisible(list, list.children[serverEditorIndex]);
    }
  }

  function serverConnectionAddresses(server) {
    var value = server || {};
    var connections = (value.connections || []).slice();
    var profile = AuthStore ? AuthStore.activeProfile(authState) : null;
    var matchesActive = activeServer && (
      (value.machineIdentifier && value.machineIdentifier === activeServer.machineIdentifier) || value.uri === activeServer.uri
    );
    if (matchesActive && config.apiBaseUrl) { connections.push(config.apiBaseUrl); }
    if (matchesActive && profile && profile.serverConnectionUri) { connections.push(profile.serverConnectionUri); }
    return ServerStore.connectionUris({ uri: value.uri, connections: connections }).map(function (uri) {
      return { kind: ServerDiscovery.isLocalCandidate(uri) ? 'local' : 'remote', uri: uri };
    });
  }

  function appendServerEditorAddresses(row, addresses) {
    var container = element('span', 'server-editor-addresses');
    var index;
    var labelKey;
    for (index = 0; index < addresses.length; index += 1) {
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
      authState = AuthStore.save(root.localStorage, authState);
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
      return !serverFailoverFailedUris[uri];
    });
    if (!candidates.length) { callback(false, error); return; }
    serverFailoverRequest = PlexAuth.findReachableConnection(root, config.token || '', candidates, activeServer.machineIdentifier, authOptions, function (connectionError, uri) {
      serverFailoverRequest = null;
      if (connectionError || !uri || !activateServerConnection(uri)) { callback(false, error || connectionError); return; }
      callback(true, null);
    });
  }

  function openServerEditor() {
    serverEditorOpen = true;
    serverEditorIndex = 0;
    renderAppSettings();
  }

  function closeServerEditor() {
    serverEditorOpen = false;
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
      watchlistGeneration += 1;
      cancelWatchlistRequests();
      watchlistItems = [];
      watchlistByLocalKey = {};
      watchlistLoadedIdentity = '';
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
    if (serverEditorOpen) { renderServerEditor(); }
    ServerDiscovery.discover(root, config, function (servers) {
      serverDiscoveryActive = false;
      serverState.servers = ServerStore.merge(serverState.servers, servers);
      serverState = ServerStore.save(root.localStorage, serverState.servers, activeServer ? activeServer.uri : serverState.activeUri);
      if (serverEditorOpen) {
        serverEditorIndex = Math.min(serverEditorIndex, serverState.servers.length + 1);
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

  function renderServerActivities() {
    var button = document.getElementById('server-activity');
    var panel = document.getElementById('server-activity-panel');
    var focused = button.className.indexOf('is-focused') !== -1;
    var index;
    var activity;
    var row;
    var title = serverActivities.length ? (serverActivities[0].title || t('activity.working')) : '';
    var homeRefreshing = homeRefreshVisualActive && !serverActivities.length;
    if (serverActivities.length > 1) { title += ' ' + t('activity.more', { count: serverActivities.length - 1 }); }
    button.className = 'server-activity ' + (serverActivities.length ? 'is-active' : (homeRefreshing ? 'is-home-refreshing' : 'is-idle')) + (focused ? ' is-focused' : '');
    button.setAttribute('data-nav-index', navigationItems.length);
    button.setAttribute('aria-label', t('activity.label') + (title ? ': ' + title : ''));
    button.setAttribute('title', t('activity.label'));
    setText('server-activity-title', title);
    if (appView === 'detail') {
      if (title) { showDetailMetadataStatus(title, false); }
      else if (detailRefreshPending) { showDetailMetadataStatus(t('status.refreshing'), false); }
      else if (!detailMetadataStatusTemporary) { hideDetailMetadataStatus(); }
    }
    panel.innerHTML = '';
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

  function setupButton(label, action, primary) {
    var button = element('button', 'setup-action' + (primary ? ' is-primary' : ''), label);
    button.type = 'button';
    button.setAttribute('data-setup-action', action);
    return button;
  }

  function setupConnectionOption(label, action, uri) {
    var button = element('button', 'setup-option setup-connection-option');
    button.type = 'button';
    button.setAttribute('data-setup-action', action);
    button.appendChild(element('span', 'setup-connection-label', label));
    button.appendChild(element('span', 'setup-option-meta', uri || ''));
    return button;
  }

  function resetSetupSurface(step, title, message) {
    setText('setup-step', step);
    setText('setup-title', title);
    setText('setup-message', message);
    document.getElementById('setup-server-list').className = 'setup-list is-hidden';
    document.getElementById('setup-profile-list').className = 'setup-list is-hidden';
    document.getElementById('setup-login').className = 'setup-login is-hidden';
    document.getElementById('setup-manual').className = 'setup-manual is-hidden';
    document.getElementById('setup-actions').innerHTML = '';
  }

  function updateSetupFocus() {
    var buttons = document.querySelectorAll('#setup-view button');
    var index;
    if (!buttons.length) { return; }
    setupFocusIndex = Math.max(0, Math.min(setupFocusIndex, buttons.length - 1));
    for (index = 0; index < buttons.length; index += 1) {
      buttons[index].className = buttons[index].className.replace(/\s*is-focused/g, '');
    }
    buttons[setupFocusIndex].className += ' is-focused';
    if (!pointerSelectionActive) { buttons[setupFocusIndex].focus(); }
  }

  function renderSetupLanguage() {
    var list;
    var index;
    var language;
    var button;
    setupStage = 'language';
    setupFocusIndex = 0;
    resetSetupSurface(t('setup.stepLanguage'), t('setup.chooseLanguageTitle'), t('setup.chooseLanguageMessage'));
    list = document.getElementById('setup-server-list');
    list.className = 'setup-list setup-language-list';
    list.innerHTML = '';
    for (index = 0; index < setupUiLanguages.length; index += 1) {
      language = setupUiLanguages[index];
      button = element('button', 'setup-option' + (language.code === appSettings.uiLanguage ? ' is-active' : ''));
      button.type = 'button';
      button.setAttribute('data-setup-language', index);
      button.appendChild(element('span', '', language.label));
      button.appendChild(element('span', 'setup-option-meta', language.code === appSettings.uiLanguage ? '\u2713' : ''));
      list.appendChild(button);
      if (language.code === appSettings.uiLanguage) { setupFocusIndex = index; }
    }
    updateSetupFocus();
  }

  function selectSetupLanguage(index) {
    var language = setupUiLanguages[index];
    if (!language) { return; }
    appSettings.uiLanguage = language.code;
    appSettings.uiLanguageExplicit = true;
    appSettings = Settings.save(root.localStorage, appSettings);
    homeDomDirty = true;
    setupFocusIndex = 0;
    setupStatusKey = '';
    renderSetupServers();
    scanSetupServers();
  }

  function renderSetupServers() {
    var list;
    var actions;
    var index;
    var server;
    var button;
    setupStage = 'servers';
    resetSetupSurface(t('setup.stepServer'), t('setup.findServerTitle'), setupStatusKey ? t(setupStatusKey) : t('setup.findServerMessage'));
    list = document.getElementById('setup-server-list');
    list.className = 'setup-list';
    list.innerHTML = '';
    for (index = 0; index < serverState.servers.length; index += 1) {
      server = serverState.servers[index];
      button = element('button', 'setup-option');
      button.type = 'button'; button.setAttribute('data-setup-server', index);
      button.appendChild(element('span', '', server.name));
      button.appendChild(element('span', 'setup-option-meta', server.uri.replace(/^https?:\/\//, '') + (server.version ? ' - ' + server.version : '')));
      list.appendChild(button);
    }
    actions = document.getElementById('setup-actions');
    actions.appendChild(setupButton(t('setup.scanAgain'), 'scan', true));
    actions.appendChild(setupButton(t('setup.manualAddress'), 'manual', false));
    if (!serverState.servers.length) {
      actions.appendChild(setupButton(t('setup.findAccountServers'), authState.ownerToken ? 'account-servers' : 'login-servers', false));
    }
    if (setupReturnView) { actions.appendChild(setupButton(t('setup.cancel'), 'cancel', false)); }
    updateSetupFocus();
  }

  function scanSetupServers() {
    if (!ServerDiscovery || serverDiscoveryActive) { return; }
    serverDiscoveryActive = true;
    setupStatusKey = '';
    renderSetupServers();
    ServerDiscovery.discover(root, config, function (servers) {
      if (appView !== 'setup') { serverDiscoveryActive = false; return; }
      serverDiscoveryActive = false;
      serverState.servers = ServerStore.merge(serverState.servers, servers);
      serverState = ServerStore.save(root.localStorage, serverState.servers, serverState.activeUri);
      setupStatusKey = serverState.servers.length ? '' : 'setup.noServers';
      if (setupStage !== 'servers') { return; }
      setupFocusIndex = 0;
      renderSetupServers();
    });
  }

  function renderSetupManual() {
    var input;
    var actions;
    setupStage = 'manual';
    resetSetupSurface(t('setup.stepServer'), t('setup.manualAddress'), setupStatusKey ? t(setupStatusKey) : t('setup.findServerMessage'));
    document.getElementById('setup-manual').className = 'setup-manual';
    input = document.getElementById('setup-address');
    input.type = 'url'; input.maxLength = 120; input.value = setupReturnView === 'settings' ? String(config.apiBaseUrl || '') : '';
    input.placeholder = '192.168.1.10';
    actions = document.getElementById('setup-actions');
    actions.appendChild(setupButton(t('setup.connectAddress'), 'connect-manual', true));
    actions.appendChild(setupButton(t('setup.cancel'), setupReturnView ? 'cancel' : 'servers', false));
    setupFocusIndex = 0;
    input.focus();
  }

  function connectSetupAddress() {
    var input = document.getElementById('setup-address');
    var uri = ServerDiscovery.normalizeCandidate(input.value);
    if (!uri) { setupStatusKey = 'setup.invalidAddress'; renderSetupManual(); return; }
    setupStatusKey = '';
    setText('setup-message', t('setup.findServerMessage'));
    ServerDiscovery.probe(root, uri, '', config.discoveryTimeout || 1800, function (selected) {
      var stored;
      if (appView !== 'setup' || setupStage !== 'manual') { return; }
      if (!selected) { setupStatusKey = 'setup.serverUnavailable'; renderSetupManual(); return; }
      serverState.servers = ServerStore.merge(serverState.servers, [selected]);
      serverState = ServerStore.save(root.localStorage, serverState.servers, serverState.activeUri);
      stored = serverForIdentity(selected) || selected;
      setupSelectedServer = stored;
      setupEnteredConnectionUri = selected.uri;
      if (setupReturnView === 'settings' && activeServer && selected.machineIdentifier && selected.machineIdentifier === activeServer.machineIdentifier) {
        setupPreferredConnectionUri = selected.uri;
        activateServerConnection(selected.uri);
        finishSetup();
        return;
      }
      if (ServerDiscovery.shouldOfferLocalConnection(stored.uri, selected.uri)) {
        renderSetupConnectionChoice();
        return;
      }
      setupPreferredConnectionUri = selected.uri;
      renderSetupAccess();
    });
  }

  function renderSetupConnectionChoice() {
    var list;
    var actions;
    setupStage = 'connection-choice'; setupFocusIndex = 0;
    resetSetupSurface(t('setup.stepServer'), t('setup.connectionChoiceTitle'), t('setup.connectionChoiceMessage'));
    list = document.getElementById('setup-server-list');
    list.className = 'setup-list';
    list.innerHTML = '';
    list.appendChild(setupConnectionOption(t('setup.useLocalConnection'), 'use-local-connection', setupSelectedServer && setupSelectedServer.uri));
    list.appendChild(setupConnectionOption(t('setup.useEnteredConnection'), 'use-entered-connection', setupEnteredConnectionUri));
    actions = document.getElementById('setup-actions');
    actions.appendChild(setupButton(t('setup.cancel'), 'manual', false));
    updateSetupFocus();
  }

  function chooseSetupConnection(uri) {
    setupPreferredConnectionUri = uri || (setupSelectedServer && setupSelectedServer.uri) || '';
    renderSetupAccess();
  }

  function renderSetupAccess() {
    var actions;
    setupStage = 'access'; setupStatusKey = ''; setupFocusIndex = 0;
    resetSetupSurface(t('setup.stepAccess'), t('setup.chooseAccessTitle'), t('setup.chooseAccessMessage'));
    actions = document.getElementById('setup-actions');
    actions.appendChild(setupButton(t('setup.continueOffline'), 'offline', true));
    if (authState.ownerToken) {
      actions.appendChild(setupButton(t('setup.continuePlex'), 'load-profiles', false));
      actions.appendChild(setupButton(t('setup.disconnectPlex'), 'disconnect', false));
    } else {
      actions.appendChild(setupButton(t('setup.signInPlex'), 'login', false));
    }
    actions.appendChild(setupButton(t('setup.cancel'), setupReturnView ? 'cancel' : 'servers', false));
    updateSetupFocus();
  }

  function renderSetupLogin() {
    var actions;
    setupStage = 'login'; setupFocusIndex = 0;
    resetSetupSurface(t('setup.stepAccess'), t('setup.loginTitle'), t('setup.loginMessage'));
    document.getElementById('setup-login').className = 'setup-login';
    setText('setup-code', setupPin ? setupPin.code : '----');
    setText('setup-login-status', t(setupStatusKey || 'setup.loginWaiting'));
    actions = document.getElementById('setup-actions');
    if (!setupPin) { actions.appendChild(setupButton(t('setup.retry'), setupLoginPurpose === 'servers' ? 'login-servers' : 'login', true)); }
    actions.appendChild(setupButton(t('setup.continueOffline'), 'offline', !!setupPin));
    actions.appendChild(setupButton(t('setup.cancel'), setupReturnView ? 'cancel' : (setupLoginPurpose === 'servers' ? 'servers' : 'access'), false));
    updateSetupFocus();
  }

  function scheduleSetupPoll(generation, delay) {
    root.clearTimeout(setupPollTimer);
    setupPollTimer = root.setTimeout(function () { pollSetupPin(generation); }, delay);
  }

  function pollSetupPin(generation) {
    if (generation !== setupAuthGeneration || setupStage !== 'login' || !setupPin) { return; }
    if (new Date().getTime() >= setupPollDeadline) {
      setupStatusKey = 'setup.loginExpired'; setupPin = null; renderSetupLogin(); return;
    }
    PlexAuth.pollPin(root, setupPin.id, authOptions, function (error, result) {
      if (generation !== setupAuthGeneration || setupStage !== 'login') { return; }
      if (error) {
        setupStatusKey = 'setup.loginUnavailable'; renderSetupLogin(); scheduleSetupPoll(generation, 5000); return;
      }
      if (result.token) {
        if (setupLoginPurpose === 'servers') { loadSetupAccountServers(result.token, generation); }
        else { loadSetupProfiles(result.token, generation); }
        return;
      }
      setupStatusKey = 'setup.loginWaiting'; renderSetupLogin(); scheduleSetupPoll(generation, 2000);
    });
  }

  function beginSetupLogin(purpose) {
    var generation = setupAuthGeneration + 1;
    setupLoginPurpose = purpose || setupLoginPurpose || 'profiles';
    setupAuthGeneration = generation; setupPin = null; setupStatusKey = 'setup.loginWaiting';
    root.clearTimeout(setupPollTimer);
    renderSetupLogin();
    PlexAuth.createPin(root, authOptions, function (error, pin) {
      if (generation !== setupAuthGeneration || setupStage !== 'login') { return; }
      if (error || !pin || !pin.id || !pin.code) {
        setupStatusKey = 'setup.loginUnavailable'; setupPin = null; renderSetupLogin(); return;
      }
      setupPin = pin; setupPollDeadline = new Date().getTime() + Math.max(60000, pin.expiresIn * 1000);
      setupStatusKey = 'setup.loginWaiting'; renderSetupLogin(); scheduleSetupPoll(generation, 1500);
    });
  }

  function loadSetupAccountServers(ownerToken, generation) {
    authState.ownerToken = ownerToken || authState.ownerToken;
    authState = AuthStore.save(root.localStorage, authState);
    setupStatusKey = 'setup.accountServersLoading';
    renderSetupServers();
    PlexAuth.loadAccountServers(root, authState.ownerToken, authOptions, function (error, servers) {
      if (appView !== 'setup' || (generation && generation !== setupAuthGeneration)) { return; }
      if (error) {
        setupStatusKey = 'setup.accountServersUnavailable';
        renderSetupServers();
        return;
      }
      serverState.servers = ServerStore.merge(serverState.servers, servers);
      serverState = ServerStore.save(root.localStorage, serverState.servers, serverState.activeUri);
      setupStatusKey = servers.length ? 'setup.accountServersFound' : 'setup.noAccountServers';
      setupFocusIndex = 0;
      renderSetupServers();
    });
  }

  function openSetupProfilesForServer() {
    var generation = setupAuthGeneration + 1;
    setupAuthGeneration = generation;
    setupProfiles = AuthStore.mergeProfiles(authState.profiles, []);
    setupStatusKey = 'setup.loginWaiting';
    renderSetupProfiles();
    loadSetupProfiles(authState.ownerToken, generation);
  }

  function renderSetupProfiles() {
    var list;
    var actions;
    var index;
    var profile;
    var button;
    var identity;
    var avatar;
    setupStage = 'profiles'; setupFocusIndex = 0;
    resetSetupSurface(t('setup.stepProfile'), t('setup.chooseProfileTitle'), setupStatusKey ? t(setupStatusKey) : t('setup.chooseProfileMessage'));
    list = document.getElementById('setup-profile-list'); list.className = 'setup-list'; list.innerHTML = '';
    for (index = 0; index < setupProfiles.length; index += 1) {
      profile = setupProfiles[index];
      button = element('button', 'setup-option' + (profile.id === authState.activeProfileId ? ' is-active' : ''));
      button.type = 'button'; button.setAttribute('data-setup-profile', index);
      identity = element('span', 'setup-profile-identity');
      avatar = profile.thumb ? element('img', 'setup-profile-avatar') : element('span', 'setup-profile-avatar setup-profile-initial', String(profile.title || 'P').charAt(0).toUpperCase());
      if (profile.thumb) { avatar.src = profile.thumb; avatar.alt = ''; }
      identity.appendChild(avatar);
      identity.appendChild(element('span', '', profile.title));
      button.appendChild(identity);
      button.appendChild(element('span', 'setup-option-meta', profile.id === authState.activeProfileId ? '\u2713' : (profile.protected ? 'PIN' : '')));
      list.appendChild(button);
      if (profile.id === authState.activeProfileId) { setupFocusIndex = index; }
    }
    actions = document.getElementById('setup-actions');
    actions.appendChild(setupButton(authState.ownerToken ? t('setup.disconnectPlex') : t('setup.signInPlex'), authState.ownerToken ? 'disconnect' : 'login', false));
    actions.appendChild(setupButton(t('setup.continueOffline'), 'offline', false));
    if (setupReturnView) { actions.appendChild(setupButton(t('setup.cancel'), 'cancel', false)); }
    updateSetupFocus();
  }

  function loadSetupProfiles(ownerToken, generation) {
    var previousActiveProfile = AuthStore.activeProfile(authState);
    var index;
    authState.ownerToken = ownerToken || authState.ownerToken;
    authState = AuthStore.save(root.localStorage, authState);
    setupStatusKey = 'setup.loginWaiting';
    PlexAuth.loadHomeUsers(root, authState.ownerToken, authOptions, function (error, profiles) {
      if (appView !== 'setup' || (generation && generation !== setupAuthGeneration)) { return; }
      if (error) {
        setupProfiles = AuthStore.mergeProfiles(authState.profiles, []);
        setupStatusKey = 'setup.profileUnavailable'; renderSetupProfiles(); return;
      }
      setupProfiles = AuthStore.mergeProfiles(authState.profiles, profiles);
      if (previousActiveProfile) {
        for (index = 0; index < setupProfiles.length; index += 1) {
          if (AuthStore.sameProfile(setupProfiles[index], previousActiveProfile)) {
            authState.activeProfileId = setupProfiles[index].id;
            break;
          }
        }
      }
      authState.profiles = setupProfiles;
      authState = AuthStore.save(root.localStorage, authState);
      setupStatusKey = ''; renderSetupProfiles();
    });
  }

  function renderSetupProfilePin(profile) {
    var input;
    var actions;
    setupSelectedProfile = profile; setupStage = 'profile-pin'; setupFocusIndex = 0;
    resetSetupSurface(t('setup.stepProfile'), t('setup.pinTitle'), setupStatusKey ? t(setupStatusKey) : t('setup.pinMessage'));
    document.getElementById('setup-manual').className = 'setup-manual';
    input = document.getElementById('setup-address');
    input.type = 'password'; input.maxLength = 4; input.value = ''; input.placeholder = 'PIN';
    actions = document.getElementById('setup-actions');
    actions.appendChild(setupButton(t('setup.unlock'), 'unlock-profile', true));
    actions.appendChild(setupButton(t('setup.continueOffline'), 'offline', false));
    actions.appendChild(setupButton(t('setup.cancel'), 'profiles', false));
    input.focus();
  }

  function completeSetupProfile(profile, token, accountToken, machineIdentifier, connectionUri) {
    var updated = {
      id: profile.id, uuid: profile.uuid, title: profile.title, protected: profile.protected,
      thumb: profile.thumb, token: token || profile.token,
      accountToken: accountToken || profile.accountToken,
      serverMachineIdentifier: machineIdentifier || profile.serverMachineIdentifier,
      serverConnectionUri: connectionUri || profile.serverConnectionUri
    };
    setupProfileBusy = false;
    authState.profiles = AuthStore.mergeProfiles(authState.profiles, [updated].concat(setupProfiles));
    authState.mode = 'plex'; authState.activeProfileId = profile.id; authState.setupComplete = true;
    authState = AuthStore.save(root.localStorage, authState);
    finishSetup();
  }

  function resolveSetupProfileAccess(profile, accountToken, generation) {
    var server = setupSelectedServer || activeServer;
    var preferredServer;
    if (!server || !server.machineIdentifier) {
      setupProfileBusy = false;
      setupStatusKey = 'setup.serverAccessUnavailable'; renderSetupProfiles(); return;
    }
    preferredServer = {
      uri: setupPreferredConnectionUri || server.uri,
      machineIdentifier: server.machineIdentifier
    };
    PlexAuth.loadServerAccess(root, accountToken, server.machineIdentifier, authOptions, function (error, access) {
      var candidates;
      if (generation !== setupAuthGeneration || appView !== 'setup') { return; }
      if (error || !access || !access.token) {
        setupProfileBusy = false;
        setupStatusKey = 'setup.serverAccessUnavailable'; renderSetupProfiles(); return;
      }
      candidates = access.connections.slice();
      if (candidates.indexOf(preferredServer.uri) !== -1) {
        candidates.splice(candidates.indexOf(preferredServer.uri), 1);
        candidates.unshift(preferredServer.uri);
      }
      PlexAuth.findReachableConnection(root, access.token, candidates, server.machineIdentifier, authOptions, function (connectionError, connectionUri) {
        if (generation !== setupAuthGeneration || appView !== 'setup') { return; }
        if (connectionError || !connectionUri) {
          setupProfileBusy = false;
          setupStatusKey = 'setup.serverAccessUnavailable'; renderSetupProfiles(); return;
        }
        completeSetupProfile(profile, access.token, accountToken, server.machineIdentifier, connectionUri);
      });
    });
  }

  function switchSetupProfile(profile, pin) {
    var generation;
    var server = setupSelectedServer || activeServer;
    var accountToken;
    if (setupProfileBusy) { return; }
    if (profile.token && server && profile.serverMachineIdentifier === server.machineIdentifier) {
      completeSetupProfile(profile, profile.token, profile.accountToken, profile.serverMachineIdentifier, profile.serverConnectionUri); return;
    }
    if (profile.protected && typeof pin !== 'string') { setupStatusKey = ''; renderSetupProfilePin(profile); return; }
    setupProfileBusy = true;
    setupStatusKey = 'setup.profileConnecting';
    setText('setup-message', t(setupStatusKey));
    generation = setupAuthGeneration + 1; setupAuthGeneration = generation;
    accountToken = profile.accountToken || (!profile.serverMachineIdentifier ? profile.token : '');
    if (accountToken) { resolveSetupProfileAccess(profile, accountToken, generation); return; }
    PlexAuth.switchHomeUser(root, authState.ownerToken, profile, pin || '', authOptions, function (error, token) {
      if (generation !== setupAuthGeneration) { return; }
      if (error || !token) {
        setupProfileBusy = false;
        setupStatusKey = 'setup.pinIncorrect';
        if (profile.protected) { renderSetupProfilePin(profile); }
        else { renderSetupProfiles(); }
        return;
      }
      resolveSetupProfileAccess(profile, token, generation);
    });
  }

  function continueSetupOffline() {
    authState.mode = 'offline'; authState.activeProfileId = ''; authState.setupComplete = true;
    authState = AuthStore.save(root.localStorage, authState);
    finishSetup();
  }

  function disconnectPlexAccount() {
    authState = AuthStore.save(root.localStorage, AuthStore.disconnect(authState));
    setupProfiles = [];
    finishSetup();
  }

  function finishSetup() {
    var destination = setupReturnView;
    root.clearTimeout(setupPollTimer); setupAuthGeneration += 1; setupPin = null; setupStatusKey = ''; setupProfileBusy = false;
    if (setupSelectedServer) { applyServer(setupSelectedServer); }
    else if (activeServer) { applyServer(activeServer); }
    document.getElementById('setup-view').className = 'setup-view is-hidden';
    setupReturnView = '';
    renderActiveProfile();
    if (destination === 'settings') {
      appView = 'settings'; renderAppSettings(); loadPlex();
    } else {
      revealHome({ focus: 'first', refresh: false });
      loadPlex(); discoverLocalServers();
    }
  }

  function cancelSetup() {
    var destination = setupReturnView;
    root.clearTimeout(setupPollTimer); setupAuthGeneration += 1; setupPin = null; setupStatusKey = ''; setupProfileBusy = false;
    if (!setupReturnView) { renderSetupServers(); return; }
    document.getElementById('setup-view').className = 'setup-view is-hidden';
    setupReturnView = '';
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

  function openSetup() {
    appView = 'setup'; setupReturnView = ''; setupSelectedServer = null; setupPreferredConnectionUri = ''; setupEnteredConnectionUri = ''; setupFocusIndex = 0; setupStatusKey = '';
    document.getElementById('setup-view').className = 'setup-view';
    if (!appSettings.uiLanguageExplicit) { renderSetupLanguage(); }
    else { renderSetupServers(); scanSetupServers(); }
  }

  function openProfileManager() {
    var generation;
    setupReturnView = appView; setupSelectedServer = activeServer; appView = 'setup'; setupStatusKey = '';
    setupPreferredConnectionUri = config.apiBaseUrl || (activeServer && activeServer.uri) || '';
    document.getElementById('setup-view').className = 'setup-view';
    setupProfiles = AuthStore.mergeProfiles(authState.profiles, []);
    if (!authState.ownerToken && !setupProfiles.length) { renderSetupAccess(); return; }
    renderSetupProfiles();
    if (authState.ownerToken) {
      generation = setupAuthGeneration + 1;
      setupAuthGeneration = generation;
      loadSetupProfiles(authState.ownerToken, generation);
    }
  }

  function openManualServerSetup() {
    setupReturnView = 'settings';
    setupSelectedServer = activeServer;
    setupPreferredConnectionUri = config.apiBaseUrl || (activeServer && activeServer.uri) || '';
    setupEnteredConnectionUri = '';
    setupStatusKey = '';
    setupFocusIndex = 0;
    serverEditorOpen = false;
    appView = 'setup';
    document.getElementById('setup-view').className = 'setup-view';
    renderSetupManual();
  }

  function activateSetupAction(action) {
    if (action === 'scan') { scanSetupServers(); }
    else if (action === 'account-servers') { loadSetupAccountServers(authState.ownerToken, setupAuthGeneration); }
    else if (action === 'login-servers') { beginSetupLogin('servers'); }
    else if (action === 'manual') { setupStatusKey = ''; renderSetupManual(); }
    else if (action === 'use-local-connection') { chooseSetupConnection(setupSelectedServer && setupSelectedServer.uri); }
    else if (action === 'use-entered-connection') { chooseSetupConnection(setupEnteredConnectionUri); }
    else if (action === 'connect-manual') { connectSetupAddress(); }
    else if (action === 'servers') { setupStatusKey = ''; renderSetupServers(); }
    else if (action === 'access') { renderSetupAccess(); }
    else if (action === 'offline') { continueSetupOffline(); }
    else if (action === 'login') { beginSetupLogin('profiles'); }
    else if (action === 'load-profiles') { openSetupProfilesForServer(); }
    else if (action === 'disconnect') { disconnectPlexAccount(); }
    else if (action === 'profiles') { setupStatusKey = ''; renderSetupProfiles(); }
    else if (action === 'unlock-profile' && setupSelectedProfile) { switchSetupProfile(setupSelectedProfile, document.getElementById('setup-address').value); }
    else if (action === 'cancel') { cancelSetup(); }
  }

  function activateSetupButton(button) {
    var index;
    if (button.hasAttribute('data-setup-language')) {
      selectSetupLanguage(Number(button.getAttribute('data-setup-language')));
      return;
    }
    if (button.hasAttribute('data-setup-action')) { activateSetupAction(button.getAttribute('data-setup-action')); return; }
    if (button.hasAttribute('data-setup-server')) {
      index = Number(button.getAttribute('data-setup-server'));
      setupSelectedServer = serverState.servers[index];
      setupPreferredConnectionUri = setupSelectedServer ? setupSelectedServer.uri : '';
      setupEnteredConnectionUri = '';
      renderSetupAccess(); return;
    }
    if (button.hasAttribute('data-setup-profile')) {
      index = Number(button.getAttribute('data-setup-profile'));
      if (setupProfiles[index]) { switchSetupProfile(setupProfiles[index]); }
    }
  }

  function switchServer(server) {
    if (!server || (activeServer && activeServer.uri === server.uri)) { closeServerEditor(); return; }
    applyServer(server);
    serverEditorOpen = false;
    document.getElementById('app-settings-view').className = 'app-settings-view is-hidden';
    document.getElementById('content').style.display = 'block';
    document.body.className = document.body.className.indexOf('is-booting') === -1 ? document.body.className + ' is-booting' : document.body.className;
    appView = 'home';
    loadPlex();
  }

  function activateServerEditorRow() {
    if (serverEditorIndex === 0) { discoverLocalServers(); return; }
    if (serverEditorIndex === 1) { openManualServerSetup(); return; }
    switchServer(serverState.servers[serverEditorIndex - 2]);
  }

  function closeLanguageEditor() {
    languageEditorKind = '';
    document.getElementById('language-editor').className = 'language-editor is-hidden';
    renderAppSettings();
  }

  function toggleEditorLanguage() {
    var code = orderedEditorLanguages()[languageEditorIndex];
    var enabled = appSettings[languageEditorKind];
    var position = enabled.indexOf(code);
    if (position === -1) { enabled.push(code); }
    else { enabled.splice(position, 1); }
    saveAppSettings();
    renderLanguageEditor(code);
  }

  function moveEditorLanguage(direction) {
    var code = orderedEditorLanguages()[languageEditorIndex];
    var enabled = appSettings[languageEditorKind];
    var position = enabled.indexOf(code);
    var next = position + direction;
    if (position === -1 || next < 0 || next >= enabled.length) { return; }
    enabled.splice(position, 1);
    enabled.splice(next, 0, code);
    saveAppSettings();
    renderLanguageEditor(code);
  }

  function openAppSettings(keepNavigationFocus) {
    appView = 'settings';
    settingsZone = keepNavigationFocus ? 'nav' : 'list';
    settingsViewIndex = 0;
    languageEditorKind = '';
    serverEditorOpen = false;
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
    languageEditorKind = '';
    serverEditorOpen = false;
    document.getElementById('language-editor').className = 'language-editor is-hidden';
    document.getElementById('app-settings-view').className = 'app-settings-view is-hidden';
  }

  function closeAppSettings() {
    leaveAppSettings();
    revealHome({ focus: 'nav' });
  }

  function diagnosticText(value) {
    return value === null || value === undefined || value === '' ? t('diagnostics.unknown') : String(value);
  }

  function webOSVersion() {
    var agent = String(root.navigator && root.navigator.userAgent || '');
    var match = agent.match(/(?:web0s|webos)[\s\/]+([0-9.]+)/i);
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

  function diagnosticsSnapshot() {
    var profile = AuthStore ? AuthStore.activeProfile(authState) : null;
    var identity = diagnosticsIdentity || activeServer || {};
    return DiagnosticsState.snapshot({
      appVersion: authOptions.version,
      server: {
        name: identity.name || (activeServer && activeServer.name) || config.serverName,
        version: identity.version,
        machineIdentifier: identity.machineIdentifier || (activeServer && activeServer.machineIdentifier),
        reachable: diagnosticsReachable,
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
      error: lastDiagnosticsError
    });
  }

  function appendDiagnosticsRow(section, labelKey, value) {
    var row = element('div', 'diagnostics-row');
    row.appendChild(element('span', 'diagnostics-label', t(labelKey)));
    row.appendChild(element('span', 'diagnostics-value', diagnosticText(value)));
    section.appendChild(row);
  }

  function appendDiagnosticsSection(container, titleKey, rows) {
    var section = element('section', 'diagnostics-section');
    var index;
    section.appendChild(element('h2', 'diagnostics-section-title', t(titleKey)));
    for (index = 0; index < rows.length; index += 1) { appendDiagnosticsRow(section, rows[index][0], rows[index][1]); }
    container.appendChild(section);
  }

  function appendServerAddressRows(rows, addresses) {
    var index;
    var labelKey;
    for (index = 0; index < addresses.length; index += 1) {
      labelKey = addresses[index].kind === 'local' ? 'diagnostics.localAddress' : 'diagnostics.remoteAddress';
      rows.push([labelKey, addresses[index].uri]);
    }
  }

  function diagnosticsBoolean(value) {
    return t(value ? 'diagnostics.yes' : 'diagnostics.no');
  }

  function renderDiagnosticsFocus() {
    var buttons = document.querySelectorAll('[data-diagnostics-action]');
    var index;
    for (index = 0; index < buttons.length; index += 1) {
      buttons[index].className = index === diagnosticsFocusIndex ? 'is-focused' : '';
    }
    if (!pointerSelectionActive && buttons[diagnosticsFocusIndex]) { buttons[diagnosticsFocusIndex].focus(); }
  }

  function renderDiagnostics() {
    var snapshot = diagnosticsSnapshot();
    var content = document.getElementById('diagnostics-content');
    var playback = snapshot.playback;
    var serverRows;
    setText('diagnostics-title', t('diagnostics.title'));
    setText('diagnostics-notice', t('diagnostics.notice'));
    setText('diagnostics-refresh', t('diagnostics.refresh'));
    setText('diagnostics-back', t('diagnostics.back'));
    content.innerHTML = '';
    appendDiagnosticsSection(content, 'diagnostics.app', [
      ['diagnostics.appVersion', snapshot.appVersion]
    ]);
    serverRows = [
      ['diagnostics.serverName', snapshot.server.name],
      ['diagnostics.serverVersion', snapshot.server.version],
      ['diagnostics.serverId', snapshot.server.machineIdentifier],
      ['diagnostics.reachable', diagnosticsBoolean(snapshot.server.reachable)]
    ];
    appendServerAddressRows(serverRows, snapshot.server.addresses);
    appendDiagnosticsSection(content, 'diagnostics.server', serverRows);
    appendDiagnosticsSection(content, 'diagnostics.profile', [
      ['diagnostics.profileMode', snapshot.profile.mode],
      ['diagnostics.profileName', snapshot.profile.name]
    ]);
    appendDiagnosticsSection(content, 'diagnostics.device', [
      ['diagnostics.model', snapshot.device.modelName],
      ['diagnostics.webos', snapshot.device.webOSVersion],
      ['diagnostics.viewport', snapshot.device.viewport],
      ['diagnostics.capabilities', snapshot.device.known
        ? (snapshot.device.uhd ? '4K' : 'HD') + (snapshot.device.hdr10 ? ' / HDR10' : '')
        : t('diagnostics.unknownCapabilities')]
    ]);
    if (!playback) {
      appendDiagnosticsSection(content, 'diagnostics.playback', [['diagnostics.state', t('diagnostics.noPlayback')]]);
    } else {
      appendDiagnosticsSection(content, 'diagnostics.playback', [
        ['diagnostics.file', playback.fileName],
        ['diagnostics.size', formatFileSize(playback.fileSize)],
        ['diagnostics.source', playback.source],
        ['diagnostics.delivery', playback.delivery],
        ['diagnostics.strategy', playback.strategy],
        ['diagnostics.attempts', playback.attempts.join(' > ')],
        ['diagnostics.fallback', playback.fallback || t('diagnostics.none')],
        ['diagnostics.position', formatLongTime(playback.position) + ' / ' + formatLongTime(playback.duration)],
        ['diagnostics.buffered', playback.buffered || t('diagnostics.none')],
        ['diagnostics.state', playback.state]
      ]);
    }
    appendDiagnosticsSection(content, 'diagnostics.lastError', [
      ['diagnostics.lastError', snapshot.error || t('diagnostics.none')]
    ]);
    renderDiagnosticsFocus();
  }

  function refreshDiagnostics() {
    if (diagnosticsIdentityRequest && diagnosticsIdentityRequest.abort) { diagnosticsIdentityRequest.abort(); }
    diagnosticsIdentityRequest = null;
    if (!config.apiBaseUrl || !PlexClient || !PlexClient.loadServerIdentity) {
      diagnosticsReachable = false;
      renderDiagnostics();
      return;
    }
    diagnosticsIdentityRequest = PlexClient.loadServerIdentity(config, function (error, identity) {
      diagnosticsIdentityRequest = null;
      if (appView !== 'diagnostics') { return; }
      diagnosticsReachable = !error;
      if (error) { lastDiagnosticsError = DiagnosticsState.sanitizeText(error); }
      else { diagnosticsIdentity = identity; }
      renderDiagnostics();
    });
  }

  function openDiagnostics() {
    appView = 'diagnostics';
    diagnosticsFocusIndex = 0;
    backgroundAudio.stop();
    document.getElementById('app-settings-view').className = 'app-settings-view is-hidden';
    document.getElementById('diagnostics-view').className = 'diagnostics-view';
    renderDiagnostics();
    refreshDiagnostics();
    root.clearInterval(diagnosticsTimer);
    diagnosticsTimer = root.setInterval(function () { if (appView === 'diagnostics') { renderDiagnostics(); } }, 2000);
  }

  function closeDiagnostics() {
    root.clearInterval(diagnosticsTimer);
    diagnosticsTimer = null;
    if (diagnosticsIdentityRequest && diagnosticsIdentityRequest.abort) { diagnosticsIdentityRequest.abort(); }
    diagnosticsIdentityRequest = null;
    document.getElementById('diagnostics-view').className = 'diagnostics-view is-hidden';
    appView = 'settings';
    settingsZone = 'list';
    settingsViewIndex = settingsRows().length - 1;
    document.getElementById('app-settings-view').className = 'app-settings-view';
    renderNavigation();
    renderAppSettings();
  }

  function activateDiagnosticsAction() {
    if (diagnosticsFocusIndex === 0) { refreshDiagnostics(); }
    else { closeDiagnostics(); }
  }

  function handleDiagnosticsKey(event, direction) {
    event.preventDefault();
    if (event.keyCode === 27 || event.keyCode === 461) { closeDiagnostics(); return; }
    if (direction === 'left' || direction === 'up') { diagnosticsFocusIndex = 0; renderDiagnosticsFocus(); }
    else if (direction === 'right' || direction === 'down') { diagnosticsFocusIndex = 1; renderDiagnosticsFocus(); }
    else if (event.keyCode === 13) { activateDiagnosticsAction(); }
  }

  function setDetailViewMode(enabled) {
    document.body.className = document.body.className.replace(/\s*is-detail-view/g, '');
    if (enabled) { document.body.className += ' is-detail-view'; }
  }

  function detailPresentationKey(item) {
    if (!item) { return ''; }
    return [item.type || '', item.ratingKey || item.title || ''].join(':');
  }

  function clearDetailPresentation(clearPoster) {
    posterLoader.cancelScope('detail');
    if (clearPoster) { loadRenderedPoster(document.getElementById('detail-poster'), '', 0, 'detail', 360, 540); }
    setText('detail-title', '');
    setText('detail-subtitle', '');
    setText('detail-facts', '');
    setText('detail-summary', '');
    setText('detail-audio-value', '');
    setText('detail-subtitles-value', '');
    setText('detail-version-value', '');
    setText('detail-media-info-video', '');
    setText('detail-media-info-audio', '');
    setText('detail-media-info-bitrate', '');
    setText('detail-media-info-subtitle-languages', '');
    document.getElementById('season-tabs').innerHTML = '';
    document.getElementById('episode-strip').innerHTML = '';
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
    if (!MediaPreferences || !profile) { return null; }
    return MediaPreferences.resolve({
      options: {},
      audioTracks: profile.audioTracks,
      subtitleTracks: profile.subtitleTracks
    }, currentMediaOverride, appSettings);
  }

  function detailMediaVersions() {
    return currentMediaProfile && currentMediaProfile.versions && currentMediaProfile.versions.length
      ? currentMediaProfile.versions : (currentMediaProfile ? [currentMediaProfile] : []);
  }

  function selectedDetailMediaProfile() {
    var versions = detailMediaVersions();
    var requested = currentMediaOverride && currentMediaOverride.mediaIndex;
    var partIndex = currentMediaOverride && currentMediaOverride.partIndex;
    var index;
    if (requested !== null && requested !== undefined) {
      for (index = 0; index < versions.length; index += 1) {
        if (versions[index].mediaIndex === requested && (partIndex === null || partIndex === undefined || versions[index].partIndex === partIndex)) { return versions[index]; }
      }
    }
    return versions[0] || null;
  }

  function mediaVersionLabel(profile, automatic) {
    var label = profile && profile.summary || t('player.unavailable');
    return automatic ? t('player.versionAuto') + ' - ' + label : label;
  }

  function automaticTrackLabel(label) {
    return t('player.automatic') + (label ? ' - ' + label : '');
  }

  function detailChoiceState() {
    return MediaProfile.choiceState(selectedDetailMediaProfile(), detailMediaVersions());
  }

  function detailChoiceZones() {
    var choices = detailChoiceState();
    var zones = [];
    if (choices.audio) { zones.push('audio'); }
    if (choices.subtitles) { zones.push('subtitles'); }
    if (choices.versions) { zones.push('version'); }
    return zones;
  }

  function renderDetailChoiceState(button, cyclable) {
    var focused = button.className.indexOf('is-focused') !== -1;
    button.className = 'detail-choice' + (cyclable ? ' is-cyclable' : '') + (focused ? ' is-focused' : '');
    button.disabled = !cyclable;
  }

  function renderDetailMediaControls() {
    var audioButton = document.getElementById('detail-audio');
    var subtitleButton = document.getElementById('detail-subtitles');
    var versionButton = document.getElementById('detail-version');
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
    setText('detail-audio-label', t('detail.audio'));
    setText('detail-subtitles-label', t('detail.subtitles'));
    setText('detail-media-info-label', t('detail.mediaInfo'));
    setText('detail-media-info-subtitle-languages-label', t('detail.subtitleLanguages'));
    setText('detail-media-info-video-label', t('detail.video'));
    setText('detail-media-info-audio-label', t('detail.audio'));
    setText('detail-media-info-bitrate-label', t('detail.bitrate'));
    document.getElementById('detail-media-info').className = 'detail-media-info' + (appSettings.showMediaInfo ? '' : ' is-hidden');
    renderDetailChoiceState(audioButton, choices.audio);
    renderDetailChoiceState(subtitleButton, choices.subtitles);
    renderDetailChoiceState(versionButton, choices.versions);
    if (!profile || !resolved) {
      unavailableLabel = detailMediaProfileLoading ? t('detail.loadingTracks') : t('player.unavailable');
      setText('detail-audio-value', unavailableLabel);
      setText('detail-subtitles-value', unavailableLabel);
      setText('detail-version-value', unavailableLabel);
      setText('detail-media-info-video', unavailableLabel);
      setText('detail-media-info-audio', '');
      setText('detail-media-info-bitrate', '');
      setText('detail-media-info-subtitle-languages', '');
      return;
    }
    setText('detail-version-value', mediaVersionLabel(profile, !currentMediaOverride || currentMediaOverride.mediaIndex === null));
    setText('detail-audio-value', currentMediaOverride && currentMediaOverride.audioLanguage ? resolved.audioLabel : automaticTrackLabel(resolved.audioLabel));
    if (currentMediaOverride && currentMediaOverride.subtitlesOff) {
      setText('detail-subtitles-value', t('subtitle.off'));
    } else {
      setText('detail-subtitles-value', currentMediaOverride && currentMediaOverride.subtitleLanguage
        ? (resolved.subtitleLabel || t('subtitle.off'))
        : automaticTrackLabel(resolved.subtitleLabel || t('subtitle.off')));
    }
    if (profile.videoCodec) { videoParts.push(profile.videoCodec); }
    if (profile.width && profile.height) { videoParts.push(profile.width + 'x' + profile.height); }
    if (profile.videoDynamicRange) { videoParts.push(profile.videoDynamicRange); }
    if (profile.audioCodec) { audioParts.push(profile.audioCodec); }
    if (profile.audioChannels) { audioParts.push(profile.audioChannels + ' ch'); }
    video = videoParts.join(' \u00b7 ') || t('player.unavailable');
    audio = audioParts.join(' \u00b7 ') || t('player.unavailable');
    bitrate = profile.bitrate ? (Math.round(profile.bitrate / 100) / 10) + ' Mbps' : t('player.unavailable');
    setText('detail-media-info-video', video);
    setText('detail-media-info-audio', audio);
    setText('detail-media-info-bitrate', bitrate);
    subtitleLanguages = MediaProfile.subtitleLanguages(profile);
    setText('detail-media-info-subtitle-languages', subtitleLanguages.length ? subtitleLanguages.join(', ') : t('detail.noSubtitles'));
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
    currentMediaProfile = null;
    currentMediaOverride = ratingKey && MediaPreferences ? MediaPreferences.load(root.localStorage, mediaPreferenceIdentity(detail)) : null;
    if (appView === 'detail') { renderDetailMediaControls(); }
    if (!ratingKey) { detailMediaProfileLoading = false; return; }
    detailMediaProfileRequest = PlexClient.loadMediaProfile(config, ratingKey, function (error, profile) {
      if (token !== detailMediaProfileToken) { return; }
      detailMediaProfileRequest = null;
      if (!currentDetail || String(currentDetail.ratingKey) !== String(ratingKey)) { return; }
      detailMediaProfileLoading = false;
      currentMediaProfile = error ? null : profile;
      if (appView === 'detail') {
        renderDetailMediaControls();
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
    currentMediaProfile = null;
    currentMediaOverride = ratingKey && MediaPreferences ? MediaPreferences.load(root.localStorage, mediaPreferenceIdentity(detail)) : null;
    renderDetailMediaControls();
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
    if (detailMediaProfileRatingKey === ratingKey && (currentMediaProfile || detailMediaProfileLoading)) {
      renderDetailMediaControls();
      return;
    }
    queueDetailMediaProfile(detail);
  }

  function saveDetailMediaOverride() {
    var identity;
    if (!MediaPreferences || !currentDetail) { return; }
    identity = mediaPreferenceIdentity(currentDetail);
    if (!currentMediaOverride || (!currentMediaOverride.audioLanguage && !currentMediaOverride.subtitleLanguage && !currentMediaOverride.subtitlesOff && currentMediaOverride.mediaIndex === null)) {
      MediaPreferences.clear(root.localStorage, identity);
      currentMediaOverride = null;
    } else {
      currentMediaOverride = MediaPreferences.save(root.localStorage, identity, currentMediaOverride);
    }
    renderDetailMediaControls();
  }

  function distinctTrackLanguages(tracks) {
    var result = [];
    var index;
    var tag;
    for (index = 0; index < (tracks || []).length; index += 1) {
      tag = tracks[index].languageTag || tracks[index].languageCode || '';
      if (tag && result.indexOf(tag) === -1) { result.push(tag); }
    }
    return result;
  }

  function cycleDetailTrack(kind, direction) {
    var languages;
    var values;
    var current;
    var index;
    var profile = selectedDetailMediaProfile();
    if (!profile) { return; }
    currentMediaOverride = currentMediaOverride || { audioLanguage: '', subtitleLanguage: '', subtitlesOff: false, mediaIndex: null, partIndex: null };
    if (kind === 'audio') {
      languages = distinctTrackLanguages(profile.audioTracks);
      values = [''].concat(languages);
      current = currentMediaOverride.audioLanguage || '';
      index = values.indexOf(current);
      index = (Math.max(0, index) + direction + values.length) % values.length;
      currentMediaOverride.audioLanguage = values[index];
    } else {
      languages = distinctTrackLanguages(profile.subtitleTracks);
      values = ['automatic', 'off'].concat(languages);
      current = currentMediaOverride.subtitlesOff ? 'off' : (currentMediaOverride.subtitleLanguage || 'automatic');
      index = values.indexOf(current);
      index = (Math.max(0, index) + direction + values.length) % values.length;
      currentMediaOverride.subtitlesOff = values[index] === 'off';
      currentMediaOverride.subtitleLanguage = values[index] === 'automatic' || values[index] === 'off' ? '' : values[index];
    }
    saveDetailMediaOverride();
  }

  function cycleDetailVersion(direction) {
    var versions = detailMediaVersions();
    var values = [{ mediaIndex: null, partIndex: null }].concat(versions.map(function (profile) {
      return { mediaIndex: profile.mediaIndex, partIndex: profile.partIndex };
    }));
    var currentIndex = 0;
    var index;
    if (versions.length < 2) { return; }
    currentMediaOverride = currentMediaOverride || { audioLanguage: '', subtitleLanguage: '', subtitlesOff: false, mediaIndex: null, partIndex: null };
    for (index = 1; index < values.length; index += 1) {
      if (values[index].mediaIndex === currentMediaOverride.mediaIndex && values[index].partIndex === currentMediaOverride.partIndex) { currentIndex = index; break; }
    }
    currentIndex = (currentIndex + direction + values.length) % values.length;
    currentMediaOverride.mediaIndex = values[currentIndex].mediaIndex;
    currentMediaOverride.partIndex = values[currentIndex].partIndex;
    saveDetailMediaOverride();
  }

  function detailPlaybackPreferences() {
    var preferences = {};
    var key;
    var language;
    for (key in appSettings) { if (Object.prototype.hasOwnProperty.call(appSettings, key)) { preferences[key] = appSettings[key]; } }
    if (!currentMediaOverride) { return preferences; }
    if (currentMediaOverride.mediaIndex !== null) {
      preferences.mediaIndex = currentMediaOverride.mediaIndex;
      preferences.partIndex = currentMediaOverride.partIndex || 0;
    }
    if (currentMediaOverride.audioLanguage) {
      preferences.audioLanguages = [currentMediaOverride.audioLanguage].concat((appSettings.audioLanguages || []).filter(function (value) { return value !== currentMediaOverride.audioLanguage; }));
    }
    if (currentMediaOverride.subtitlesOff) {
      preferences.subtitleMode = 'off';
    } else if (currentMediaOverride.subtitleLanguage) {
      language = currentMediaOverride.subtitleLanguage;
      preferences.subtitleLanguages = [language].concat((appSettings.subtitleLanguages || []).filter(function (value) { return value !== language; }));
      preferences.subtitleMode = 'always';
      preferences.subtitleSuppressedForAudio = [];
    }
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
    cached = watchlistByLocalKey[watchlistLocalKeyForDetail(currentDetail)];
    currentDetail.inWatchlist = !!cached;
    if (cached) {
      currentDetail.cloudRatingKey = cached.cloudRatingKey;
      currentDetail.cloudGuid = cached.cloudGuid;
    }
  }

  function renderDetailWatchlist() {
    var button = document.getElementById('detail-watchlist');
    button.disabled = !watchlistAvailable() || !watchlistProvider || watchlistLoading || watchlistMutationPending || !cloudRatingKeyForDetail(currentDetail);
    setText('detail-watchlist', currentDetail && currentDetail.inWatchlist ? t('detail.removeWatchlist') : t('detail.addWatchlist'));
  }

  function toggleCurrentWatchlist() {
    var detail = currentDetail;
    var cloudKey = cloudRatingKeyForDetail(detail);
    var enabled;
    var source;
    var previousItems;
    if (!detail || !cloudKey || !watchlistAvailable() || !watchlistProvider || watchlistMutationPending) { return; }
    enabled = !detail.inWatchlist;
    source = selectedItem && String(selectedItem.ratingKey || '') === String(detail.ratingKey || '') ? selectedItem : detail;
    previousItems = watchlistItems.slice();
    watchlistMutationPending = true;
    detail.inWatchlist = enabled;
    renderDetailWatchlist();
    WatchlistClient.set(root, watchlistOptions(), cloudKey, enabled, function (error) {
      var local;
      watchlistMutationPending = false;
      if (error) {
        watchlistItems = previousItems; indexWatchlistItems(); detail.inWatchlist = !enabled;
        renderDetailWatchlist(); showMessage(t('status.updateError')); return;
      }
      if (enabled) {
        local = {};
        Object.keys(source).forEach(function (key) { local[key] = source[key]; });
        local.ratingKey = watchlistLocalKeyForDetail(detail);
        local.type = detail.type === 'episode' || detail.type === 'season' ? 'show' : detail.type;
        local.title = detail.title;
        local.meta = local.type === 'show' ? 'TV Shows' : (local.meta || 'Movie');
        local.metaKey = local.type === 'show' ? 'media.show' : 'media.movie';
        local.image = detail.image || local.image;
        local.art = detail.art || local.art;
        local.cloudRatingKey = cloudKey; local.cloudGuid = detail.watchlistGuid || detail.guid || detail.cloudGuid || ''; local.inWatchlist = true;
        watchlistItems = watchlistItems.filter(function (item) { return String(item.ratingKey || '') !== String(local.ratingKey || ''); });
        watchlistItems.push(local);
      } else {
        watchlistItems = watchlistItems.filter(function (item) { return String(item.ratingKey || '') !== watchlistLocalKeyForDetail(detail); });
      }
      indexWatchlistItems();
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
    setText('detail-title', detail.title);
    setText('detail-subtitle', detailDisplaySubtitle(detail));
    setText('detail-facts', detail.facts);
    setText('detail-summary', detail.summary || t('detail.noSummary'));
    loadRenderedPoster(poster, detail.image, 0, 'detail', 360, 540);
    setText('detail-watched', detail.viewed ? t('detail.markUnwatched') : t('detail.markWatched'));
    scheduleDetailBackdrop(detail);
    scheduleTheme(detail);
    if (deferMediaProfile) { prepareDetailMediaProfile(detail); }
    else { queueDetailMediaProfile(detail); }
    syncCurrentDetailWatchlist();
    renderDetailWatchlist();
    if (watchlistAvailable() && watchlistLoadedIdentity !== watchlistIdentity() && !watchlistLoading) {
      loadWatchlistData(false, function () { if (appView === 'detail' && currentDetail === detail) { syncCurrentDetailWatchlist(); renderDetailWatchlist(); } });
    }
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
    renderSeasonTabs();
    renderEpisodeStrip();
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
    if (appView === 'search') { cancelSearchWork(true); searchGeneration += 1; }
    prepareDetailTransition(item);
    selectedItem = item;
    seriesContext = null;
    detailZone = 'play';
    detailActionIndex = 0;
    appView = 'detail';
    setDetailViewMode(true);
    document.getElementById('content').style.display = 'none';
    document.getElementById('search-view').className = 'search-view is-hidden';
    document.getElementById('library-view').className = 'library-view is-hidden';
    document.getElementById('watchlist-view').className = 'watchlist-view is-hidden';
    document.getElementById('detail-view').className = 'detail-view';
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
    showViewState('loading', 'detail', null, closeDetail);
    loadSelectedDetail(item);
  }

  function loadSelectedDetail(item) {
    PlexClient.loadMetadata(config, item.ratingKey, function (error, detail) {
      if (appView !== 'detail' || !selectedItem || selectedItem.ratingKey !== item.ratingKey) { return; }
      if (error || !detail) {
        showViewState('error', 'detail', function () {
          showViewState('loading', 'detail', null, closeDetail);
          loadSelectedDetail(item);
        }, closeDetail);
        return;
      }
      hideViewState();
      renderDetail(detail, true);
      PlexClient.loadSeriesContext(config, detail, function (seriesError, context) {
        if (appView !== 'detail' || !currentDetail || String(currentDetail.ratingKey) !== String(detail.ratingKey)) { return; }
        if (!seriesError && context) { renderSeriesContext(context, detail); }
        else { queueDetailMediaProfile(detail); }
      });
    });
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
    renderSeasonTabs();
    renderEpisodeStrip();
    updateDetailFocus();
    if (detail.type !== 'episode' && context.episodes.length) {
      loadEpisodeDetail(context.episodes[detailEpisodeIndex], callback);
    } else {
      queueDetailMediaProfile(detail);
      if (callback) { callback(detail); }
    }
  }

  function renderSeasonTabs() {
    var container = document.getElementById('season-tabs');
    var index;
    var button;
    container.innerHTML = '';
    for (index = 0; index < seriesContext.seasons.length; index += 1) {
      button = element('button', 'season-tab' + (index === detailSeasonIndex ? ' is-current' : ''), seriesContext.seasons[index].title);
      button.type = 'button';
      button.setAttribute('data-season-position', index);
      button.onclick = function () {
        detailSeasonIndex = Number(this.getAttribute('data-season-position'));
        loadSelectedSeason();
      };
      container.appendChild(button);
    }
  }

  function episodeWindow() {
    var start = Math.max(0, detailEpisodeIndex - 2);
    start = Math.min(start, Math.max(0, seriesContext.episodes.length - 5));
    return { start: start, end: Math.min(seriesContext.episodes.length, start + 5) };
  }

  function episodeImageSpecification(image, source, priority) {
    var rect = image && image.getBoundingClientRect ? image.getBoundingClientRect() : null;
    var width = Math.ceil(rect && rect.width ? rect.width : (image.clientWidth || 310));
    var height = Math.ceil(rect && rect.height ? rect.height : (image.clientHeight || 124));
    var preview = ProgressiveImages.previewSize(width, height, 128);
    return {
      source: source,
      previewWidth: preview.width,
      previewHeight: preview.height,
      width: width,
      height: height,
      priority: priority,
      scope: 'detail'
    };
  }

  function renderEpisodeStrip() {
    var container = document.getElementById('episode-strip');
    var range = episodeWindow();
    var posterJobs = [];
    var index;
    var episode;
    var card;
    var image;
    var label;
    var progressTrack;
    var progressValue;
    container.innerHTML = '';
    for (index = range.start; index < range.end; index += 1) {
      episode = seriesContext.episodes[index];
      card = element('button', 'episode-card' + (episode.viewed ? ' is-viewed' : '') + (index === detailEpisodeIndex ? ' is-current' : ''));
      card.type = 'button';
      card.setAttribute('data-episode-position', index);
      image = element('img', 'episode-image');
      image.alt = '';
      card.appendChild(image);
      progressTrack = element('span', 'episode-progress-track');
      progressValue = element('span', 'episode-progress-value');
      progressTrack.appendChild(progressValue);
      card.appendChild(progressTrack);
      label = element('span', 'episode-label');
      label.appendChild(element('span', 'episode-label-text', 'E' + padNumber(episode.index) + ' - ' + episode.title));
      card.appendChild(label);
      card.onclick = function () {
        detailEpisodeIndex = Number(this.getAttribute('data-episode-position'));
        playSelectedEpisode(seriesContext.episodes[detailEpisodeIndex]);
      };
      container.appendChild(card);
      updateEpisodeCardPlaybackState(card, episode);
      posterJobs.push({
        target: image,
        specification: episodeImageSpecification(image, episode.image, index === detailEpisodeIndex ? 0 : 1)
      });
    }
    posterLoader.loadBatch(posterJobs);
    markOverflowingEpisodeTitles();
  }

  function updateEpisodeCardPlaybackState(card, episode) {
    var progress = Math.max(0, Math.min(100, Number(episode && episode.progress || 0)));
    var progressTrack = card.querySelector('.episode-progress-track');
    var progressValue = card.querySelector('.episode-progress-value');
    var focused = card.className.indexOf('is-focused') !== -1;
    var current = card.className.indexOf('is-current') !== -1;
    card.className = 'episode-card' + (episode.viewed ? ' is-viewed' : '') + (current ? ' is-current' : '') + (focused ? ' is-focused' : '');
    if (!progressTrack || !progressValue) { return; }
    progressTrack.className = 'episode-progress-track' + (!episode.viewed && progress > 0 ? '' : ' is-hidden');
    progressValue.style.width = progress + '%';
  }

  function updateEpisodeCardsPlaybackState() {
    var cards = document.querySelectorAll('.episode-card[data-episode-position]');
    var index;
    var position;
    for (index = 0; index < cards.length; index += 1) {
      position = Number(cards[index].getAttribute('data-episode-position'));
      if (seriesContext && seriesContext.episodes[position]) {
        updateEpisodeCardPlaybackState(cards[index], seriesContext.episodes[position]);
      }
    }
  }

  function reconcileEpisodePlaybackState(freshEpisodes) {
    var freshByKey = {};
    var episode;
    var fresh;
    var index;
    for (index = 0; index < (freshEpisodes || []).length; index += 1) {
      freshByKey[String(freshEpisodes[index].ratingKey || '')] = freshEpisodes[index];
    }
    for (index = 0; seriesContext && index < seriesContext.episodes.length; index += 1) {
      episode = seriesContext.episodes[index];
      fresh = freshByKey[String(episode.ratingKey || '')];
      if (!fresh) { continue; }
      episode.viewed = fresh.viewed;
      episode.viewOffset = fresh.viewOffset;
      episode.duration = fresh.duration;
      episode.progress = fresh.progress;
      if (currentDetail && String(currentDetail.ratingKey || '') === String(episode.ratingKey || '')) {
        currentDetail.viewed = fresh.viewed;
        currentDetail.viewOffset = fresh.viewOffset;
        currentDetail.duration = fresh.duration;
        currentDetail.progress = fresh.progress;
        setText('detail-watched', fresh.viewed ? t('detail.markUnwatched') : t('detail.markWatched'));
      }
    }
  }

  function refreshEpisodePlaybackState(ratingKey) {
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
    });
  }

  function markOverflowingEpisodeTitles() {
    var labels = document.querySelectorAll('.episode-label-text');
    var index;
    var label;
    var available;
    var naturalWidth;
    var distance;
    for (index = 0; index < labels.length; index += 1) {
      label = labels[index];
      available = label.parentNode.clientWidth - 20;
      label.style.maxWidth = 'none';
      label.style.overflow = 'visible';
      label.style.textOverflow = 'clip';
      naturalWidth = label.getBoundingClientRect().width;
      label.style.maxWidth = '';
      label.style.overflow = '';
      label.style.textOverflow = '';
      distance = Math.ceil(naturalWidth - available);
      if (distance > 1) {
        label.className += ' is-overflowing';
        label.setAttribute('data-pan-distance', distance);
      }
    }
  }

  function stopEpisodeTitlePan() {
    var labels = document.querySelectorAll('.episode-label-text');
    var index;
    episodePanToken += 1;
    while (episodePanTimers.length) {
      root.clearTimeout(episodePanTimers.pop());
    }
    for (index = 0; index < labels.length; index += 1) {
      labels[index].style.transition = 'none';
      labels[index].style.transform = 'translateX(0)';
    }
  }

  function startEpisodeTitlePan(card) {
    var label;
    var distance;
    var duration;
    var token;

    stopEpisodeTitlePan();
    if (!card || card.className.indexOf('episode-card') === -1) {
      return;
    }
    label = card.querySelector('.episode-label-text');
    distance = Number(label.getAttribute('data-pan-distance') || 0);
    if (distance === 0) {
      return;
    }
    duration = Math.max(2200, Math.min(5000, distance * 32));
    token = episodePanToken;

    function cycle() {
      episodePanTimers.push(root.setTimeout(function () {
        if (token !== episodePanToken) { return; }
        label.style.transition = 'transform ' + duration + 'ms linear';
        label.style.transform = 'translateX(-' + distance + 'px)';
      }, 800));
      episodePanTimers.push(root.setTimeout(function () {
        if (token !== episodePanToken) { return; }
        label.style.transform = 'translateX(0)';
      }, duration + 1500));
      episodePanTimers.push(root.setTimeout(function () {
        if (token === episodePanToken) { cycle(); }
      }, duration * 2 + 2300));
    }
    cycle();
  }

  function padNumber(value) {
    return value < 10 ? '0' + value : String(value);
  }

  function loadEpisodeDetail(episode, callback) {
    PlexClient.loadMetadata(config, episode.ratingKey, function (error, detail) {
      if (!error && appView === 'detail') {
        renderDetail(detail);
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
    if (appView === 'search') { cancelSearchWork(true); searchGeneration += 1; }
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
        loadEpisodeDetail(seriesContext.episodes[detailEpisodeIndex]);
      }
    }, 180);
  }

  function navigateDetail(direction) {
    var choiceZones = detailChoiceZones();
    var choiceIndex;
    if (detailZone === 'nav') {
      if (direction === 'left') {
        state.navIndex = Math.max(0, state.navIndex - 1);
      } else if (direction === 'right') {
        state.navIndex = Math.min(navigationFocusCount() - 1, state.navIndex + 1);
      } else if (direction === 'down') {
        detailZone = seriesContext ? 'seasons' : 'play';
      }
      if (direction === 'left' || direction === 'right') { scheduleNavigationPreview(state.navIndex); }
    } else if (detailZone === 'seasons') {
      if (direction === 'left') {
        detailSeasonIndex = Math.max(0, detailSeasonIndex - 1);
        scheduleSeasonPreview();
      } else if (direction === 'right') {
        detailSeasonIndex = Math.min(seriesContext.seasons.length - 1, detailSeasonIndex + 1);
        scheduleSeasonPreview();
      } else if (direction === 'down') {
        detailZone = 'play';
      }
    } else if (detailZone === 'episodes') {
      if (direction === 'left') {
        detailEpisodeIndex = Math.max(0, detailEpisodeIndex - 1);
        renderEpisodeStrip();
        scheduleEpisodeDetail();
      } else if (direction === 'right') {
        detailEpisodeIndex = Math.min(seriesContext.episodes.length - 1, detailEpisodeIndex + 1);
        renderEpisodeStrip();
        scheduleEpisodeDetail();
      } else if (direction === 'up') {
        detailZone = choiceZones.length ? choiceZones[choiceZones.length - 1] : 'play';
      }
    } else if (detailZone === 'play') {
      if (direction === 'left') {
        detailActionIndex = Math.max(0, detailActionIndex - 1);
      } else if (direction === 'right') {
        detailActionIndex = Math.min(3, detailActionIndex + 1);
      } else if (direction === 'up' && seriesContext) {
        detailZone = 'seasons';
      } else if (direction === 'up') {
        detailZone = 'nav';
      } else if (direction === 'down') {
        detailZone = choiceZones.length ? choiceZones[0] : (seriesContext ? 'episodes' : 'play');
      }
    } else if (detailZone === 'audio' || detailZone === 'subtitles' || detailZone === 'version') {
      choiceIndex = choiceZones.indexOf(detailZone);
      if (choiceIndex === -1) {
        detailZone = 'play';
      } else if (direction === 'left' || direction === 'right') {
        if (detailZone === 'version') { cycleDetailVersion(direction === 'left' ? -1 : 1); }
        else { cycleDetailTrack(detailZone, direction === 'left' ? -1 : 1); }
      } else if (direction === 'up') {
        detailZone = choiceIndex > 0 ? choiceZones[choiceIndex - 1] : 'play';
      } else if (direction === 'down') {
        detailZone = choiceIndex < choiceZones.length - 1 ? choiceZones[choiceIndex + 1] : (seriesContext ? 'episodes' : detailZone);
      }
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
        if (error || appView !== 'detail' || detailZone !== 'seasons' || token !== seasonPreviewToken || seasonIndex !== detailSeasonIndex) { return; }
        seriesContext.episodes = episodes;
        detailEpisodeIndex = selectedIndex(episodes);
        renderEpisodeStrip();
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
      detailZone = 'episodes';
      renderSeasonTabs();
      renderEpisodeStrip();
      updateDetailFocus();
      if (episodes.length) {
        loadEpisodeDetail(episodes[detailEpisodeIndex]);
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
    } else {
      target = document.getElementById(['detail-play', 'detail-watched', 'detail-watchlist', 'detail-refresh-metadata'][detailActionIndex]);
    }
    if (target) {
      target.className += ' is-focused';
      if (!pointerSelectionActive) { target.focus(); }
    }
    startEpisodeTitlePan(target);
  }

  function formatTime(seconds) {
    var value = Math.max(0, Math.round(seconds || 0));
    return Math.floor(value / 60) + ':' + (value % 60 < 10 ? '0' : '') + value % 60;
  }

  function formatLongTime(seconds) {
    var value = Math.max(0, Math.floor(Number(seconds) || 0));
    var hours = Math.floor(value / 3600);
    var minutes = Math.floor((value % 3600) / 60);
    var remaining = value % 60;
    return (hours < 10 ? '0' : '') + hours + ':' + (minutes < 10 ? '0' : '') + minutes + ':' + (remaining < 10 ? '0' : '') + remaining;
  }

  function sendPlayerTimeline(stateName) {
    var video = document.getElementById('player-video');
    if (!currentPlayback || playerTimelineSuppressed) { return; }
    if (playerAbsoluteTime() < 20) { return; }
    PlexClient.sendTimeline(config, currentPlayback, stateName, playerAbsoluteTime() * 1000);
  }

  function sendFinalPlayerTimeline(callback) {
    var playback = currentPlayback;
    var absoluteTime = playerAbsoluteTime();
    if (!playback || playerTimelineSuppressed || absoluteTime < 20) {
      callback();
      return;
    }
    PlexClient.sendTimeline(config, playback, 'stopped', absoluteTime * 1000, function () { callback(); });
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
    playbackClock = PlaybackClock.anchor(playbackClock, absoluteTime);
    playbackClock = PlaybackClock.freeze(playbackClock, !!frozen);
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
      if (!nativeSeekIsBuffered(video, observation.correctionNativeTime)) {
        rebuildCurrentStream(target, false);
        return;
      }
      playerNativeSeekPending = true;
      setPlayerLoading(true, true);
      try {
        video.currentTime = observation.correctionNativeTime;
      } catch (error) {
        playerNativeSeekPending = false;
        rebuildCurrentStream(target, false);
        return;
      }
      playerClockRepairFallbackTimer = root.setTimeout(function () {
        playerClockRepairFallbackTimer = null;
        if (!playerNativeSeekPending || appView !== 'player' || !currentPlayback) { return; }
        playerNativeSeekPending = false;
        rebuildCurrentStream(target, false);
      }, 1500);
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

  function setPlayerLoading(loading, preserveFrame) {
    document.getElementById('player-video').className = 'player-video' + (loading && !preserveFrame ? ' is-loading' : '');
    document.getElementById('player-loading').className = 'player-loading' + (loading ? (preserveFrame ? ' is-buffering' : '') : ' is-hidden');
  }

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
    var toggle = document.getElementById('player-toggle');
    var duration = currentPlayback ? currentPlayback.duration / 1000 : video.duration;
    document.getElementById('player-progress').style.width = (duration ? playerDisplayTime() / duration * 100 : 0) + '%';
    setText('player-current-time', formatTime(playerDisplayTime()));
    setText('player-duration', formatTime(duration));
    toggle.className = toggle.className.replace(/\s*is-playing/g, '') + (video.paused ? '' : ' is-playing');
    toggle.setAttribute('aria-label', video.paused ? t('player.play') : t('player.pause'));
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
      if (appView === 'player' && !settingsOpen) { hidePlayerControls(false); }
    }, delay);
  }

  function playerChapters() {
    return currentPlayback && currentPlayback.chapters ? currentPlayback.chapters : [];
  }

  function chapterTitle(chapter, index) {
    return chapter.title || t('player.chapter') + ' ' + String(index + 1);
  }

  function loadChapterImage(image, chapter, priority) {
    var rect = image.getBoundingClientRect ? image.getBoundingClientRect() : null;
    var width = Math.ceil(rect && rect.width || image.clientWidth || 300);
    var height = Math.ceil(rect && rect.height || image.clientHeight || 132);
    var preview = ProgressiveImages.previewSize(width, height, 96);
    posterLoader.load(image, {
      source: chapter.thumb,
      previewWidth: preview.width,
      previewHeight: preview.height,
      width: width,
      height: height,
      priority: priority,
      scope: 'chapters'
    });
  }

  function setChapterDrawerClass(open) {
    var view = document.getElementById('player-view');
    view.className = view.className.replace(/\s*has-chapters-open/g, '') + (open ? ' has-chapters-open' : '');
  }

  function chapterHintVisible() {
    return appView === 'player' && playerControlsMode === 'full' && playerChapters().length > 0 && !chapterState.open;
  }

  function renderChapterHint() {
    var button = document.getElementById('player-chapters-hint');
    var visible = chapterHintVisible();
    if (!visible && playerZone === 'chapter-hint') { playerZone = 'buttons'; playerButtonIndex = 1; }
    button.className = 'player-chapters-hint' + (!visible ? ' is-hidden' : '') + (visible && playerZone === 'chapter-hint' ? ' is-focused' : '');
  }

  function ensureChapterVisible(card) {
    var list = document.getElementById('player-chapters-list');
    var left;
    var right;
    if (!card || !list) { return; }
    left = card.offsetLeft;
    right = left + card.offsetWidth;
    if (left < list.scrollLeft) { list.scrollLeft = Math.max(0, left - 5); }
    else if (right > list.scrollLeft + list.clientWidth) { list.scrollLeft = right - list.clientWidth + 5; }
  }

  function updateChapterFocus() {
    var cards = document.querySelectorAll('[data-chapter-index]');
    var index;
    var image;
    for (index = 0; index < cards.length; index += 1) {
      cards[index].className = 'chapter-card' + (chapterState.open && index === chapterState.index ? ' is-focused' : '');
    }
    if (!chapterState.open || !cards[chapterState.index]) { return; }
    image = cards[chapterState.index].getElementsByTagName('img')[0];
    if (image) { posterLoader.prioritize(image); }
    ensureChapterVisible(cards[chapterState.index]);
    if (!pointerSelectionActive) { cards[chapterState.index].focus(); }
  }

  function renderChapterDrawer() {
    var drawer = document.getElementById('player-chapters-drawer');
    var list = document.getElementById('player-chapters-list');
    var chapters = playerChapters();
    var images = [];
    var index;
    var card;
    var image;
    var caption;
    if (!chapterState.open || !chapters.length) {
      drawer.className = 'player-chapters-drawer is-hidden';
      list.innerHTML = '';
      return;
    }
    list.innerHTML = '';
    for (index = 0; index < chapters.length; index += 1) {
      card = element('button', 'chapter-card');
      card.type = 'button';
      card.setAttribute('data-chapter-index', index);
      image = element('img', 'chapter-card-image');
      image.alt = '';
      caption = element('span', 'chapter-card-caption');
      caption.appendChild(element('span', 'chapter-card-title', chapterTitle(chapters[index], index)));
      caption.appendChild(element('span', 'chapter-card-time', formatTime(chapters[index].startTimeOffset / 1000)));
      card.appendChild(image);
      card.appendChild(caption);
      list.appendChild(card);
      images.push(image);
    }
    drawer.className = 'player-chapters-drawer';
    setChapterDrawerClass(true);
    loadChapterImage(images[chapterState.index], chapters[chapterState.index], 0);
    for (index = 0; index < chapters.length; index += 1) {
      if (index !== chapterState.index) { loadChapterImage(images[index], chapters[index], 1); }
    }
    updateChapterFocus();
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
    posterLoader.cancelScope('chapters');
    document.getElementById('player-chapters-drawer').className = 'player-chapters-drawer is-hidden';
    document.getElementById('player-chapters-list').innerHTML = '';
    setChapterDrawerClass(false);
    playerZone = 'buttons';
    playerButtonIndex = 1;
    renderChapterHint();
    if (restoreFocus) { updatePlayerButtonFocus(); schedulePlayerControlsTimeout(); }
  }

  function resetChapterDrawer() {
    posterLoader.cancelScope('chapters');
    chapterState = ChapterState.create();
    document.getElementById('player-chapters-drawer').className = 'player-chapters-drawer is-hidden';
    document.getElementById('player-chapters-list').innerHTML = '';
    document.getElementById('player-chapters-hint').className = 'player-chapters-hint is-hidden';
    setChapterDrawerClass(false);
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
    document.getElementById('player-controls').className = 'player-controls' +
      (mode === 'hidden' ? ' is-hidden' : (mode === 'timeline' ? ' is-timeline-only' : ''));
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
    document.getElementById('player-controls').className = 'player-controls is-hidden';
    resetChapterDrawer();
  }

  function hidePlayerControls(manual) {
    root.clearTimeout(playerControlsTimer);
    closeChapterDrawer(false);
    playerControlsMode = PlayerControlsState.next(playerControlsMode, 'hide');
    playerControlsVisible = false;
    playerBackArmed = !!manual;
    controlsHiddenAt = new Date().getTime();
    document.getElementById('player-controls').className = 'player-controls is-hidden';
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
    return document.querySelectorAll('.player-button')[index].className.indexOf('is-unavailable') === -1;
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
    document.getElementById('player-previous').className = 'player-button player-icon-button player-skip player-previous' + (!context || !episodeResolver.canMove(context, -1) ? ' is-unavailable' : '');
    document.getElementById('player-next').className = 'player-button player-icon-button player-skip player-next' + (!context || !episodeResolver.canMove(context, 1) ? ' is-unavailable' : '');
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
    var next = playerButtonIndex;
    do { next += direction; } while (next >= 0 && next < 4 && !playerButtonAvailable(next));
    if (next >= 0 && next < 4) { playerButtonIndex = next; }
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
      if (tracks[index].id === id) { return tracks[index].language + ' (' + tracks[index].codec.toUpperCase() + ')'; }
    }
    return offLabel;
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

  function movePlayerSetting(direction) {
    var rows = document.querySelectorAll('.setting-row');
    var next = settingIndex;
    do { next += direction; } while (next >= 0 && next < rows.length && rows[next].disabled);
    if (next >= 0 && next < rows.length) { settingIndex = next; }
    updateSettingsDisplay();
  }

  function updateSettingsDisplay() {
    var rows = document.querySelectorAll('.setting-row');
    var advanced = subtitleEditorAvailability();
    var disabled;
    var next;
    var settingKey;
    var index;
    setText('setting-audio', trackLabel(currentPlayback.audioTracks, currentPlayback.options.audioStreamID, t('player.automatic')));
    setText('setting-subtitles', trackLabel(currentPlayback.subtitleTracks, currentPlayback.options.subtitleStreamID, t('subtitle.off')));
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
      rows[index].className = 'setting-row' +
        (!disabled && settingKey !== 'subtitle-advanced' ? ' is-cycle' : '') +
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
    setText('player-track-subtitles', trackLabel(currentPlayback.subtitleTracks, currentPlayback.options.subtitleStreamID, t('subtitle.off')));
    setText('player-quality', t('player.quality') + ': ' + videoQualityLabel(currentPlayback.options.videoQuality));
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
    var row = document.querySelectorAll('.setting-row')[settingIndex];
    if (!row || row.disabled) { return; }
    if (settingIndex === 0) {
      currentPlayback.options.audioStreamID = cycleTrack(currentPlayback.audioTracks, currentPlayback.options.audioStreamID, direction, false);
    } else if (settingIndex === 1) {
      currentPlayback.options.subtitleStreamID = cycleTrack(currentPlayback.subtitleTracks, currentPlayback.options.subtitleStreamID, direction, true);
    } else if (settingIndex === 2) {
      index = sizes.indexOf(currentPlayback.options.subtitleSize);
      currentPlayback.options.subtitleSize = sizes[Math.max(0, Math.min(sizes.length - 1, index + direction))];
    } else if (settingIndex === 3) {
      return;
    } else if (settingIndex === 4) {
      cyclePlaybackVersion(direction);
    } else if (settingIndex === 5) {
      currentPlayback.requestedVideoQuality = cycleValue(['original', '12000', '8000', '4000'], currentPlayback.requestedVideoQuality || currentPlayback.options.videoQuality, direction);
    } else {
      currentPlayback.requestedPlaybackMode = cycleValue(['auto', 'direct', 'transcode'], currentPlayback.requestedPlaybackMode || currentPlayback.options.playbackMode, direction);
    }
    updateSettingsDisplay();
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
    if (versions.length < 2) { return; }
    for (currentIndex = 0; currentIndex < versions.length; currentIndex += 1) {
      if (versions[currentIndex].mediaIndex === currentPlayback.options.mediaIndex && versions[currentIndex].partIndex === currentPlayback.options.partIndex) { index = currentIndex; break; }
    }
    index = (index + direction + versions.length) % versions.length;
    currentPlayback.options.mediaIndex = versions[index].mediaIndex;
    currentPlayback.options.partIndex = versions[index].partIndex;
    currentMediaOverride = currentMediaOverride || { audioLanguage: '', subtitleLanguage: '', subtitlesOff: false, mediaIndex: null, partIndex: null };
    currentMediaOverride.mediaIndex = versions[index].mediaIndex;
    currentMediaOverride.partIndex = versions[index].partIndex;
    applyPlaybackVersion(currentPlayback, versions[index]);
    resolved = MediaPreferences.resolve(currentPlayback, currentMediaOverride, appSettings);
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

  function subtitleTextForDisplay(value) {
    return String(value || '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');
  }

  function renderSubtitleOverlay(cues, offsetMs, size) {
    var overlay = document.getElementById('subtitle-preview-overlay');
    var activeCues = SubtitleSync.active(cues || [], playerAbsoluteTime() * 1000, offsetMs || 0);
    var lines = [];
    overlay.innerHTML = '';
    activeCues.forEach(function (cue) {
      subtitleTextForDisplay(cue.text).split('\n').forEach(function (line) { lines.push(line); });
    });
    lines.forEach(function (line, index) {
      if (index > 0) { overlay.appendChild(document.createElement('br')); }
      overlay.appendChild(document.createTextNode(line));
    });
    overlay.style.fontSize = Math.round(42 * Number(size || 100) / 100) + 'px';
    overlay.className = 'subtitle-preview-overlay' + (lines.length ? '' : ' is-hidden');
  }

  function updateActiveSubtitleOverlay() {
    if (subtitleEditorOpen && subtitleEditorState) {
      renderSubtitleOverlay(subtitleEditorState.cues, subtitleEditorState.offsetMs, subtitleEditorState.subtitleSize);
    } else if (localSubtitleState) {
      renderSubtitleOverlay(localSubtitleState.cues, localSubtitleState.offsetMs, localSubtitleState.size);
    } else {
      document.getElementById('subtitle-preview-overlay').className = 'subtitle-preview-overlay is-hidden';
    }
  }

  function subtitleEditorControls() {
    return document.querySelectorAll('[data-subtitle-editor]');
  }

  function signedOffset(value) {
    var offset = Math.round(Number(value || 0));
    return (offset > 0 ? '+' : '') + offset + ' ms';
  }

  function updateSubtitleEditorProgress() {
    var progress = 0;
    if (!subtitleEditorState) { return; }
    if (subtitleEditorState.bounds.end > subtitleEditorState.bounds.start) {
      progress = (playerAbsoluteTime() - subtitleEditorState.bounds.start) / (subtitleEditorState.bounds.end - subtitleEditorState.bounds.start) * 100;
    }
    document.getElementById('subtitle-editor-timeline-progress').style.width = Math.max(0, Math.min(100, progress)) + '%';
  }

  function renderSubtitleEditor() {
    var controls = subtitleEditorControls();
    var track;
    var index;
    if (!subtitleEditorState) { return; }
    track = trackForId(currentPlayback.subtitleTracks, subtitleEditorState.selectedStreamID);
    setText('subtitle-editor-status', subtitleEditorState.status || '');
    setText('subtitle-editor-track', track ? trackLabel(currentPlayback.subtitleTracks, track.id, t('subtitle.off')) : t('subtitle.off'));
    setText('subtitle-editor-size', subtitleEditorState.subtitleSize + '%');
    setText('subtitle-editor-offset', signedOffset(subtitleEditorState.offsetMs));
    updateSubtitleEditorProgress();
    for (index = 0; index < controls.length; index += 1) {
      controls[index].className = (index === subtitleEditorIndex ? 'is-focused' : '') + (controls[index].getAttribute('data-subtitle-editor') === 'loop' && subtitleEditorState.loop ? ' is-active' : '');
    }
    if (!pointerSelectionActive && controls[subtitleEditorIndex]) { controls[subtitleEditorIndex].focus(); }
    updateActiveSubtitleOverlay();
  }

  function abortSubtitleEditorRequest() {
    subtitleEditorGeneration += 1;
    if (subtitleEditorRequest && subtitleEditorRequest.abort) { subtitleEditorRequest.abort(); }
    subtitleEditorRequest = null;
  }

  function loadSubtitleEditorTrack() {
    var track;
    var generation;
    abortSubtitleEditorRequest();
    if (!subtitleEditorState) { return; }
    track = trackForId(currentPlayback.subtitleTracks, subtitleEditorState.selectedStreamID);
    subtitleEditorState.cues = [];
    subtitleEditorState.offsetMs = subtitleOffsetFor(track);
    if (!track) {
      subtitleEditorState.status = '';
      renderSubtitleEditor();
      return;
    }
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
        failedSubtitleStreams[track.id] = true;
        subtitleEditorState.status = t('player.subtitlePreviewFailed');
        subtitleEditorState.cues = [];
      } else {
        subtitleEditorState.status = '';
        subtitleEditorState.cues = cues;
      }
      renderSubtitleEditor();
    });
  }

  function openSubtitleEditor() {
    var availability = subtitleEditorAvailability();
    var video = document.getElementById('player-video');
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
      bounds: SubtitleSync.loopBounds(playerAbsoluteTime(), currentPlayback.duration / 1000),
      loop: false,
      applying: false,
      cancelRequested: false,
      status: ''
    };
    subtitleEditorOpen = true;
    playerTimelineSuppressed = true;
    localSubtitleState = null;
    root.clearInterval(timelineTimer);
    root.clearInterval(estimatedEndTimer);
    settingsOpen = false;
    document.getElementById('player-settings').className = 'player-settings is-hidden';
    document.getElementById('subtitle-editor').className = 'subtitle-editor';
    subtitleEditorIndex = 0;
    currentPlayback.options = copyPlaybackOptions(originalOptions);
    currentPlayback.options.subtitleStreamID = '';
    currentPlayback.options.localSubtitleOverlay = false;
    loadSubtitleEditorTrack();
    rebuildCurrentStream(subtitleEditorState.bounds.start, false);
  }

  function cycleSubtitleEditorTrack(direction) {
    var ids = subtitleEditorTracks();
    var index;
    if (!subtitleEditorState || !ids.length) { return; }
    index = ids.indexOf(String(subtitleEditorState.selectedStreamID || ''));
    index = index < 0 ? 0 : index;
    index = Math.max(0, Math.min(ids.length - 1, index + direction));
    subtitleEditorState.selectedStreamID = ids[index];
    loadSubtitleEditorTrack();
  }

  function cycleSubtitleEditorSize(direction) {
    var sizes = [75, 100, 125, 150];
    var index = sizes.indexOf(Number(subtitleEditorState.subtitleSize || 100));
    index = index < 0 ? 1 : index;
    subtitleEditorState.subtitleSize = sizes[Math.max(0, Math.min(sizes.length - 1, index + direction))];
    renderSubtitleEditor();
  }

  function adjustSubtitleEditorOffset(delta) {
    subtitleEditorState.offsetMs = SubtitleSync.adjust(subtitleEditorState.offsetMs, delta);
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
    abortSubtitleEditorRequest();
    subtitleEditorOpen = false;
    subtitleEditorState = null;
    document.getElementById('subtitle-editor').className = 'subtitle-editor is-hidden';
    document.getElementById('subtitle-preview-overlay').className = 'subtitle-preview-overlay is-hidden';
    currentPlayback.options = options;
    localSubtitleState = localState;
    pendingPlaybackRestore = { paused: stateValue.paused };
    rebuildCurrentStream(stateValue.position, false);
  }

  function restoreCancelledSubtitleApply(stateValue, track, classification) {
    function restoreSelection() {
      PlexClient.setStreamSelection(config, currentPlayback, stateValue.originalOptions, function () {
        if (!subtitleEditorState || subtitleEditorState !== stateValue) { return; }
        stateValue.applying = false;
        restorePlaybackAfterSubtitleEditor(stateValue, copyPlaybackOptions(stateValue.originalOptions), stateValue.originalLocalSubtitleState);
      });
    }
    if (track && classification.kind === 'external-text') {
      PlexClient.setSubtitleOffset(config, track.id, Number(track.offset || 0), function () { restoreSelection(); });
    } else {
      restoreSelection();
    }
  }

  function failSubtitleApply(stateValue, restoreSelection) {
    function finish() {
      if (!subtitleEditorState || subtitleEditorState !== stateValue) { return; }
      stateValue.applying = false;
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
    if (track && failedSubtitleStreams[track.id]) { stateValue.status = t('player.subtitlePreviewFailed'); renderSubtitleEditor(); return; }
    if (track && (!stateValue.cues.length || subtitleEditorRequest)) { stateValue.status = t('player.subtitlePreviewLoading'); renderSubtitleEditor(); return; }
    options = copyPlaybackOptions(stateValue.originalOptions);
    options.subtitleStreamID = stateValue.selectedStreamID;
    options.subtitleSize = stateValue.subtitleSize;
    classification = SubtitleSync.classify(track);
    stateValue.applying = true;
    stateValue.cancelRequested = false;

    function selectTrack() {
      PlexClient.setStreamSelection(config, currentPlayback, options, function (selectionError) {
        if (!subtitleEditorState || subtitleEditorState !== stateValue) { return; }
        if (stateValue.cancelRequested) { restoreCancelledSubtitleApply(stateValue, track, classification); return; }
        if (selectionError) {
          if (track && classification.kind === 'external-text') {
            PlexClient.setSubtitleOffset(config, track.id, Number(track.offset || 0), function () { failSubtitleApply(stateValue, false); });
          } else {
            failSubtitleApply(stateValue, false);
          }
          return;
        }
        if (track && classification.kind === 'external-text') { track.offset = stateValue.offsetMs; }
        finishSubtitleEditorApply(stateValue, options, track);
      });
    }

    stateValue.status = t('status.preparing');
    renderSubtitleEditor();
    if (track && classification.kind === 'external-text') {
      PlexClient.setSubtitleOffset(config, track.id, stateValue.offsetMs, function (offsetError) {
        if (!subtitleEditorState || subtitleEditorState !== stateValue) { return; }
        if (stateValue.cancelRequested) { restoreCancelledSubtitleApply(stateValue, track, classification); return; }
        if (offsetError) { failSubtitleApply(stateValue, false); return; }
        selectTrack();
      });
    } else {
      selectTrack();
    }
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
    restorePlaybackAfterSubtitleEditor(stateValue, copyPlaybackOptions(stateValue.originalOptions), stateValue.originalLocalSubtitleState);
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
    if (name === 'track') { cycleSubtitleEditorTrack(1); }
    else if (name === 'size') { cycleSubtitleEditorSize(1); }
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
      subtitleEditorIndex = Math.max(0, Math.min(controls.length - 1, subtitleEditorIndex + (direction === 'up' ? -1 : 1)));
      renderSubtitleEditor();
    } else if (direction === 'left' || direction === 'right') {
      if (name === 'track') { cycleSubtitleEditorTrack(direction === 'left' ? -1 : 1); }
      else if (name === 'size') { cycleSubtitleEditorSize(direction === 'left' ? -1 : 1); }
      else if (name === 'minus' || name === 'plus') { adjustSubtitleEditorOffset(direction === 'left' ? -100 : 100); }
    } else if (event.keyCode === 13) {
      activateSubtitleEditorControl(name);
    }
    return true;
  }

  function syncPlayerOverrideFromOptions(previousSignature) {
    var previous = String(previousSignature || '').split('|');
    var audio;
    var subtitle;
    currentMediaOverride = currentMediaOverride || { audioLanguage: '', subtitleLanguage: '', subtitlesOff: false, mediaIndex: null, partIndex: null };
    if (String(currentPlayback.options.audioStreamID || '') !== String(previous[0] || '')) {
      audio = trackForId(currentPlayback.audioTracks, currentPlayback.options.audioStreamID);
      currentMediaOverride.audioLanguage = Settings.primaryLanguage(audio && (audio.languageTag || audio.languageCode));
    }
    if (String(currentPlayback.options.subtitleStreamID || '') !== String(previous[1] || '')) {
      subtitle = trackForId(currentPlayback.subtitleTracks, currentPlayback.options.subtitleStreamID);
      currentMediaOverride.subtitlesOff = !subtitle;
      currentMediaOverride.subtitleLanguage = subtitle ? Settings.primaryLanguage(subtitle.languageTag || subtitle.languageCode) : '';
    }
  }

  function rebuildCurrentStream(absoluteTime, updateSelection) {
    var video = document.getElementById('player-video');
    var resumeTarget = Math.max(0, Math.min(currentPlayback.duration / 1000, Math.floor(absoluteTime)));
    var playback = currentPlayback;
    var transcodeSession;
    var applySource = function () {
      var sourceUrl;
      if (appView !== 'player' || currentPlayback !== playback || playback.transcodeSession !== transcodeSession) { return; }
      try {
        sourceUrl = PlexClient.buildPlaybackUrl(config, playback, playback.options);
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
    currentPlayback.options.offset = resumeTarget;
    pendingPlayerSeek = null;
    root.clearTimeout(playerSeekTimer);
    sendPlayerTimeline('stopped');
    playerStreamSwitching = true;
    playerBuffering = false;
    anchorPlayerClock(resumeTarget, true);
    stopTranscodeKeepalive();
    PlexClient.rotateTranscodeSession(playback);
    transcodeSession = playback.transcodeSession;
    setText('player-status', t('status.preparing'));
    setPlayerLoading(true, false);
    if (!updateSelection) { applySource(); return; }
    PlexClient.setStreamSelection(config, playback, playback.options, function (selectionError) {
      if (appView !== 'player' || currentPlayback !== playback || playback.transcodeSession !== transcodeSession) { return; }
      if (selectionError) { playerStreamSwitching = false; playbackClock = PlaybackClock.freeze(playbackClock, false); setPlayerLoading(false); setText('player-status', t('status.trackError')); return; }
      applySource();
    });
  }

  function nativeSeekIsBuffered(video, target) {
    var index;
    if (!isFinite(target) || target < 0) { return false; }
    for (index = 0; index < video.buffered.length; index += 1) {
      if (target >= video.buffered.start(index) - 0.25 && target <= video.buffered.end(index) + 0.25) { return true; }
    }
    return false;
  }

  function playerDisplayTime() {
    return pendingPlayerSeek === null ? playerAbsoluteTime() : pendingPlayerSeek;
  }

  function commitPlayerSeek() {
    var video = document.getElementById('player-video');
    if (pendingPlayerSeek === null || !currentPlayback || appView !== 'player') { return; }
    if (playerStreamSwitching) {
      playerSeekTimer = root.setTimeout(commitPlayerSeek, 100);
      return;
    }
    var target = pendingPlayerSeek;
    pendingPlayerSeek = null;
    var nativeTarget = target - Number(currentPlayback.offsetBase || 0);
    if (nativeTarget < 0 || !isFinite(video.duration) || nativeTarget > video.duration || !nativeSeekIsBuffered(video, nativeTarget)) {
      rebuildCurrentStream(target, false);
      return;
    }
    anchorPlayerClock(target, false);
    playerNativeSeekPending = true;
    try {
      video.currentTime = nativeTarget;
    } catch (error) {
      playerNativeSeekPending = false;
      rebuildCurrentStream(target, false);
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
    settingsOpen = open;
    document.getElementById('player-settings').className = 'player-settings' + (open ? '' : ' is-hidden');
    if (open) {
      playerSettingsSnapshot = currentPlayerSettingsSignature();
      settingIndex = 0;
      updateSettingsDisplay();
    } else {
      if (playerSettingsChanged()) { applyPlayerSettings(); }
      updatePlayerButtonFocus();
    }
  }

  function togglePlayback() {
    var video = document.getElementById('player-video');
    if (video.paused) { video.play(); }
    else { video.pause(); }
  }

  function playerDisplayTitle(detail) {
    var subtitle = detail.subtitle || '';
    if (detail.type === 'episode') {
      subtitle = subtitle.replace(/(^| - )E([0-9]+)( - )/, function (match, prefix, episodeNumber, separator) {
        return prefix + t('player.episode') + ' ' + Number(episodeNumber) + separator;
      });
    }
    return detail.title + (subtitle ? ' - ' + subtitle : '');
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
      hdr10: playbackCapabilities.hdr10
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
    document.getElementById('player-view').className = 'player-view is-hidden';
    document.getElementById('detail-view').className = 'detail-view';
    appView = 'detail';
    updateDetailFocus();
    scheduleTheme(currentDetail);
  }

  function beginPlayer(startOffset) {
    showPlayerSurface();
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
      ResumeChoice.cancel(resumeChoiceState);
      cancelResumeChoice();
    }
    return true;
  }

  function startCurrentPlayback(startOffset) {
    var session = 'ploff-' + new Date().getTime();
    resetSkipPrompt();
    cancelLocalSubtitleRequest();
    failedSubtitleStreams = {};
    localSubtitleState = null;
    setText('player-title', playerDisplayTitle(currentDetail));
    setText('player-status', t('status.preparing'));
    playerStreamSwitching = true;
    setPlayerLoading(true);
    PlexClient.loadPlayback(config, currentDetail.ratingKey, session, detailPlaybackPreferences(), function (error, playback) {
      var video;
      var resolvedStart;
      if (error || appView !== 'player') {
        if (error) { lastDiagnosticsError = DiagnosticsState.sanitizeText(error); }
        playerStreamSwitching = false; setText('player-status', t('status.streamError')); showPlayerError(false); return;
      }
      currentPlayback = playback;
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
        playerZone = 'buttons'; playerButtonIndex = 1; updatePlayerButtonFocus(); initializePlayerControlsHidden();
        root.clearInterval(timelineTimer);
        timelineTimer = root.setInterval(function () { sendPlayerTimeline(video.paused ? 'paused' : 'playing'); }, 3000);
        startEstimatedEndTimer();
        applyCurrentPlaybackAttempt(false);
      });
    });
  }

  function openPlayer() {
    if (!currentDetail || !currentDetail.ratingKey) { showMessage(t('status.metadataUnavailable')); return; }
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
        startCurrentPlayback();
      });
    });
  }

  function closePlayer() {
    var video = document.getElementById('player-video');
    var playbackRatingKey = currentPlayback && currentPlayback.ratingKey;
    capturePlaybackDiagnostics();
    sendFinalPlayerTimeline(function () { refreshEpisodePlaybackState(playbackRatingKey); }); stopTranscodeKeepalive(); root.clearInterval(timelineTimer); root.clearInterval(estimatedEndTimer); root.clearTimeout(playerControlsTimer); root.clearTimeout(playerResumeTimer); root.clearTimeout(playerSeekTimer); root.clearTimeout(playerRecoveryTimer); root.clearTimeout(playerClockRepairTimer); root.clearTimeout(playerClockRepairFallbackTimer); cancelAutoplayCountdown(); resetSkipPrompt();
    pendingPlayerSeek = null;
    resetChapterDrawer();
    abortSubtitleEditorRequest();
    cancelLocalSubtitleRequest();
    subtitleEditorOpen = false;
    subtitleEditorState = null;
    playerTimelineSuppressed = false;
    pendingPlaybackRestore = null;
    playbackClock = PlaybackClock.create(2);
    playerBuffering = false;
    playerNativeSeekPending = false;
    playerClockRepairTimer = null;
    playerClockRepairFallbackTimer = null;
    localSubtitleState = null;
    document.getElementById('subtitle-editor').className = 'subtitle-editor is-hidden';
    document.getElementById('subtitle-preview-overlay').className = 'subtitle-preview-overlay is-hidden';
    resumeChoiceVisible = false;
    resumeChoiceState = null;
    document.getElementById('resume-choice').className = 'resume-choice is-hidden';
    episodeResolver.cancel();
    appView = 'detail'; settingsOpen = false; playerStreamSwitching = false; video.pause(); video.removeAttribute('src'); video.load(); currentPlayback = null;
    setPlayerLoading(false);
    hidePlayerError();
    playerErrorRetryAction = null;
    playerRecoveryState = PlaybackRecovery.create([]);
    playerBackArmed = false; detailBackLockedUntil = new Date().getTime() + 700;
    document.getElementById('player-settings').className = 'player-settings is-hidden';
    document.getElementById('player-view').className = 'player-view is-hidden';
    document.getElementById('detail-view').className = 'detail-view'; ensureDetailMediaProfile(currentDetail); updateDetailFocus();
    scheduleTheme(currentDetail);
  }

  function leaveDetail() {
    hideViewState();
    hideDetailMetadataStatus();
    setDetailViewMode(false);
    selectedItem = null;
    currentDetail = null;
    currentMediaProfile = null;
    currentMediaOverride = null;
    detailMediaProfileRatingKey = '';
    detailMediaProfileLoading = false;
    detailMediaProfileToken += 1;
    root.clearTimeout(detailMediaProfileTimer);
    detailMediaProfileTimer = null;
    if (detailMediaProfileRequest && detailMediaProfileRequest.abort) { detailMediaProfileRequest.abort(); }
    detailMediaProfileRequest = null;
    seriesContext = null;
    episodeResolver.cancel();
    root.clearTimeout(detailMetadataTimer);
    root.clearTimeout(seasonPreviewTimer);
    seasonPreviewToken += 1;
    stopEpisodeTitlePan();
    posterLoader.cancelScope('detail');
    document.getElementById('season-tabs').innerHTML = '';
    document.getElementById('episode-strip').innerHTML = '';
    document.getElementById('detail-play').className = 'detail-action';
    document.getElementById('detail-refresh-metadata').disabled = false;
    detailRefreshPending = false;
    document.getElementById('detail-view').className = 'detail-view is-hidden';
  }

  function closeDetail() {
    var returnToSearch = detailReturnView === 'search';
    var returnToLibrary = detailReturnView === 'library';
    var returnToWatchlist = detailReturnView === 'watchlist';
    leaveDetail();
    appView = returnToSearch ? 'search' : (returnToLibrary ? 'library' : (returnToWatchlist ? 'watchlist' : 'home'));
    if (returnToSearch) {
      document.getElementById('content').style.display = 'none';
      document.getElementById('search-view').className = 'search-view';
      if (searchQuery.length >= 2) { scheduleSearch(); }
      updateSearchFocus();
    } else if (returnToLibrary) {
      document.getElementById('content').style.display = 'none';
      document.getElementById('library-view').className = 'library-view';
      loadLibraryContent(true);
      updateLibraryFocus();
    } else if (returnToWatchlist) {
      document.getElementById('content').style.display = 'none';
      document.getElementById('watchlist-view').className = 'watchlist-view';
      renderWatchlistGrid(); updateWatchlistFocus();
    } else {
      revealHome({ focus: 'preserve' });
    }
  }

  function directionForKey(keyCode) {
    return { 37: 'left', 38: 'up', 39: 'right', 40: 'down' }[keyCode];
  }

  function recoverActiveViewAfterNetwork() {
    if (appView === 'home') { loadHomeRows(); }
    else if (appView === 'library') { loadLibraryContent(true); }
    else if (appView === 'watchlist') { loadWatchlistData(true); }
    else if (appView === 'search' && searchQuery.replace(/^\s+|\s+$/g, '').length >= 2) { scheduleSearch(); }
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
    var rows = searchRows();
    var key;
    event.preventDefault();
    if (event.keyCode === 27 || event.keyCode === 461) {
      if (searchQuery) {
        searchQuery = '';
        renderSearchQuery();
        scheduleSearch();
      } else {
        closeSearch();
      }
      return;
    }
    if (event.keyCode === 8) { applySearchKey('backspace'); return; }
    if (event.keyCode === 415 && searchFocus.zone === 'results') {
      playHomeItem(searchResults[searchFocus.index]);
      return;
    }
    if (direction) {
      if (searchFocus.zone === 'nav' && (direction === 'left' || direction === 'right')) {
        state.navIndex = Math.max(0, Math.min(navigationFocusCount() - 1, state.navIndex + (direction === 'left' ? -1 : 1)));
        renderNavigation();
        scheduleNavigationPreview(state.navIndex);
      } else {
        searchFocus = SearchModel.move(searchFocus, direction, searchLayout());
      }
      updateSearchFocus();
      return;
    }
    if (event.keyCode !== 13) { return; }
    if (searchFocus.zone === 'nav') {
      if (navigationItems[state.navIndex] && navigationItems[state.navIndex].kind === 'library') { startNavHold(state.navIndex); }
      else { activateSearchNav(); }
    } else if (searchFocus.zone === 'keyboard') {
      key = rows[searchFocus.row][searchFocus.column];
      applySearchKey(key);
    } else if (searchResults[searchFocus.index]) {
      openDetail(searchResults[searchFocus.index]);
    }
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
    var columns = libraryLayout.columns || 7;
    root.clearTimeout(libraryWheelScrollTimer);
    libraryWheelScrollTimer = null;
    wheelNavigationActive = false;
    event.preventDefault();
    if (event.keyCode === 27 || event.keyCode === 461) { handleLibraryBack(); return; }
    if (event.keyCode === 415 && libraryZone === 'grid') {
      if (!libraryItems[libraryFocusIndex] || libraryItems[libraryFocusIndex].containerKey) { return; }
      playHomeItem(libraryItems[libraryFocusIndex]); return;
    }
    if (libraryZone === 'nav') {
      if (direction === 'left' || direction === 'right') {
        state.navIndex = Math.max(0, Math.min(navigationFocusCount() - 1, state.navIndex + (direction === 'left' ? -1 : 1)));
        renderNavigation(); updateLibraryFocus();
        scheduleNavigationPreview(state.navIndex);
      } else if (direction === 'down') { libraryZone = 'tabs'; updateLibraryFocus(); }
      else if (event.keyCode === 13) {
        if (navigationItems[state.navIndex] && navigationItems[state.navIndex].kind === 'library') { startNavHold(state.navIndex); }
        else { enterActiveNavigationView(); }
      }
      return;
    }
    if (libraryZone === 'tabs') {
      if (direction === 'up') { libraryZone = 'nav'; updateLibraryFocus(); return; }
      if (direction === 'left' || direction === 'right') {
        if (direction === 'right' && libraryTabIndex === 4) { libraryZone = 'actions'; libraryActionIndex = 0; updateLibraryFocus(); return; }
        next = nextLibraryTab(direction === 'left' ? -1 : 1);
        if (next !== libraryTabIndex) {
          selectLibraryTab(next);
        }
        return;
      }
      if (direction === 'down') { libraryZone = libraryViewKey() === 'catalog' ? 'sort' : 'grid'; libraryControlIndex = 0; updateLibraryFocus(); }
      return;
    }
    if (libraryZone === 'actions') {
      if (direction === 'left') {
        if (libraryActionIndex > 0) { libraryActionIndex -= 1; }
        else { libraryZone = 'tabs'; libraryTabIndex = 4; }
        updateLibraryFocus();
      } else if (direction === 'right') {
        libraryActionIndex = Math.min(1, libraryActionIndex + 1); updateLibraryFocus();
      } else if (direction === 'up') { libraryZone = 'nav'; updateLibraryFocus(); }
      else if (direction === 'down') { libraryZone = libraryViewKey() === 'catalog' ? 'sort' : 'grid'; updateLibraryFocus(); }
      else if (event.keyCode === 13) {
        if (libraryActionIndex === 0) { refreshActiveLibrary(); }
        else { refreshActiveLibraryMetadata(); }
      }
      return;
    }
    if (libraryZone === 'sort') {
      if (direction === 'left' || direction === 'right') {
        next = LibraryContainers.moveControl('sort', libraryControlIndex, direction);
        libraryZone = next.zone; libraryControlIndex = next.index; updateLibraryFocus();
      }
      else if (direction === 'up' || direction === 'down') {
        next = LibraryContainers.moveControlVertical('sort', direction);
        if (next.zone !== 'grid' || libraryItems.length) { libraryZone = next.zone; updateLibraryFocus(); }
      }
      else if (event.keyCode === 13) { activateLibrarySort(libraryControlIndex === 0 ? 'titleSort' : 'audienceRating'); }
      return;
    }
    if (libraryZone === 'filter') {
      if (direction === 'left' || direction === 'right') {
        next = LibraryContainers.moveControl('filter', libraryControlIndex, direction);
        libraryZone = next.zone; libraryControlIndex = next.index; updateLibraryFocus();
      }
      else if (direction === 'up' || direction === 'down') {
        next = LibraryContainers.moveControlVertical('filter', direction);
        if (next.zone !== 'grid' || libraryItems.length) { libraryZone = next.zone; updateLibraryFocus(); }
      }
      else if (event.keyCode === 13) { activateLibraryFilter(['all','unwatched','watched'][libraryControlIndex]); }
      return;
    }
    if (direction === 'left' && libraryFocusIndex % columns > 0) { libraryFocusIndex -= 1; }
    else if (direction === 'right' && libraryFocusIndex + 1 < libraryItems.length && libraryFocusIndex % columns < columns - 1) { libraryFocusIndex += 1; }
    else if (direction === 'up') {
      if (libraryFocusIndex - columns >= 0) { libraryFocusIndex -= columns; }
      else { libraryZone = libraryViewKey() === 'catalog' ? 'filter' : 'tabs'; libraryControlIndex = ['all','unwatched','watched'].indexOf(libraryWatchedFilter); }
    } else if (direction === 'down') { libraryFocusIndex = LibraryContainers.moveGridDown(libraryFocusIndex, libraryItems.length, columns); }
    else if (event.keyCode === 13 && libraryItems[libraryFocusIndex]) {
      if (libraryItems[libraryFocusIndex].containerKey) { openLibraryContainer(libraryItems[libraryFocusIndex]); }
      else { openDetail(libraryItems[libraryFocusIndex]); }
      return;
    }
    if (libraryUsesGridScroll() && libraryItems.length < libraryTotalSize && libraryFocusIndex >= libraryItems.length - columns * 2) { loadLibraryContent(false); }
    updateLibraryFocus();
  }

  function handleWatchlistKeyDown(event, direction) {
    var columns = CardLayout.columns(document.getElementById('watchlist-grid').clientWidth || 1600, appSettings.cardScale);
    event.preventDefault();
    if (event.keyCode === 27 || event.keyCode === 461) { closeWatchlist(); return; }
    if (event.keyCode === 415 && watchlistZone === 'grid' && watchlistItems[watchlistFocusIndex]) { playHomeItem(watchlistItems[watchlistFocusIndex]); return; }
    if (watchlistZone === 'nav') {
      if (direction === 'left' || direction === 'right') {
        state.navIndex = Math.max(0, Math.min(navigationFocusCount() - 1, state.navIndex + (direction === 'left' ? -1 : 1)));
        renderNavigation(); updateWatchlistFocus(); scheduleNavigationPreview(state.navIndex);
      } else if (direction === 'down' && watchlistItems.length) { watchlistZone = 'grid'; updateWatchlistFocus(); }
      else if (event.keyCode === 13) { enterActiveNavigationView(); }
      return;
    }
    if (!watchlistItems.length) { if (direction === 'up') { watchlistZone = 'nav'; updateWatchlistFocus(); } return; }
    if (direction === 'left') { watchlistFocusIndex = Math.max(0, watchlistFocusIndex - 1); }
    else if (direction === 'right') { watchlistFocusIndex = Math.min(watchlistItems.length - 1, watchlistFocusIndex + 1); }
    else if (direction === 'up') {
      if (watchlistFocusIndex < columns) { watchlistZone = 'nav'; }
      else { watchlistFocusIndex -= columns; }
    } else if (direction === 'down') { watchlistFocusIndex = Math.min(watchlistItems.length - 1, watchlistFocusIndex + columns); }
    else if (event.keyCode === 13) { openDetail(watchlistItems[watchlistFocusIndex]); return; }
    updateWatchlistFocus();
  }

  function handleSetupBack() {
    if (setupReturnView) { cancelSetup(); return; }
    if (setupStage === 'servers' && appSettings.uiLanguageExplicit) { renderSetupLanguage(); }
    else if (setupStage === 'manual' || setupStage === 'access') { setupStatusKey = ''; renderSetupServers(); }
    else if (setupStage === 'connection-choice') { setupStatusKey = ''; renderSetupManual(); }
    else if (setupStage === 'login') { setupAuthGeneration += 1; root.clearTimeout(setupPollTimer); setupPin = null; renderSetupAccess(); }
    else if (setupStage === 'profiles') { setupAuthGeneration += 1; setupProfileBusy = false; renderSetupAccess(); }
    else if (setupStage === 'profile-pin') { setupStatusKey = ''; renderSetupProfiles(); }
  }

  function handleSetupKeyDown(event) {
    var buttons = document.querySelectorAll('#setup-view button');
    var active = document.activeElement;
    var keyCode = event.keyCode;
    if (keyCode === 27 || keyCode === 461) { event.preventDefault(); handleSetupBack(); return; }
    if (active && active.id === 'setup-address') {
      if (keyCode === 13) {
        event.preventDefault();
        if (setupStage === 'manual') { connectSetupAddress(); }
        else if (setupStage === 'profile-pin' && setupSelectedProfile) { switchSetupProfile(setupSelectedProfile, active.value); }
      } else if ((keyCode === 38 || keyCode === 40) && buttons.length) {
        event.preventDefault();
        setupFocusIndex = 0; updateSetupFocus();
      }
      return;
    }
    event.preventDefault();
    if (!buttons.length) { return; }
    if (keyCode === 38 || keyCode === 37) { setupFocusIndex = Math.max(0, setupFocusIndex - 1); updateSetupFocus(); }
    else if (keyCode === 40 || keyCode === 39) { setupFocusIndex = Math.min(buttons.length - 1, setupFocusIndex + 1); updateSetupFocus(); }
    else if (keyCode === 13) { activateSetupButton(buttons[setupFocusIndex]); }
  }

  function onKeyDown(event) {
    var direction = directionForKey(event.keyCode);
    var layout;

    if (direction && pageScrollPendingFocus) {
      syncFocusAfterPageScroll();
      pageScrollPendingFocus = false;
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
      event.preventDefault();
      if (event.keyCode === 27 || event.keyCode === 461) {
        if (serverEditorOpen) { closeServerEditor(); }
        else if (languageEditorKind) { closeLanguageEditor(); }
        else { closeAppSettings(); }
      } else if (settingsZone === 'nav') {
        if (direction === 'left' || direction === 'right') {
          state.navIndex = Math.max(0, Math.min(navigationFocusCount() - 1, state.navIndex + (direction === 'left' ? -1 : 1)));
          renderNavigation();
          updateSettingsFocus();
          scheduleNavigationPreview(state.navIndex);
        } else if (direction === 'down') {
          settingsZone = 'list';
          renderAppSettings();
        } else if (event.keyCode === 13) {
          if (navigationItems[state.navIndex] && navigationItems[state.navIndex].kind === 'library') { startNavHold(state.navIndex); }
          else { enterActiveNavigationView(); }
        }
      } else if (serverEditorOpen) {
        if (event.keyCode === 38 && serverEditorIndex === 0) { closeServerEditor(); }
        else if (event.keyCode === 38) { serverEditorIndex -= 1; renderServerEditor(); }
        else if (event.keyCode === 40) { serverEditorIndex = Math.min(serverState.servers.length + 1, serverEditorIndex + 1); renderServerEditor(); }
        else if (event.keyCode === 13) { activateServerEditorRow(); }
      } else if (languageEditorKind) {
        if (event.keyCode === 38) { languageEditorIndex = Math.max(0, languageEditorIndex - 1); renderLanguageEditor(); }
        else if (event.keyCode === 40) { languageEditorIndex = Math.min(orderedEditorLanguages().length - 1, languageEditorIndex + 1); renderLanguageEditor(); }
        else if (event.keyCode === 37) { moveEditorLanguage(-1); }
        else if (event.keyCode === 39) { moveEditorLanguage(1); }
        else if (event.keyCode === 13) { toggleEditorLanguage(); }
      } else if (event.keyCode === 38 && settingsViewIndex === 0) {
        settingsZone = 'nav';
        renderNavigation();
        updateSettingsFocus();
      } else if (event.keyCode === 38) {
        settingsViewIndex = Math.max(0, settingsViewIndex - 1); renderAppSettings();
      } else if (event.keyCode === 40) {
        settingsViewIndex = Math.min(settingsRows().length - 1, settingsViewIndex + 1); renderAppSettings();
      } else if (event.keyCode === 37) {
        changeSetting(-1);
      } else if (event.keyCode === 39 || event.keyCode === 13) {
        changeSetting(1);
      }
      return;
    }

    if (appView === 'search') {
      handleSearchKeyDown(event, direction);
      return;
    }

    if (appView === 'player') {
      event.preventDefault();
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
      if (playerControlsMode === 'full' && event.keyCode === 40 && playerZone === 'buttons' && playerButtonIndex === 1 && playerChapters().length) {
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
          if (document.querySelectorAll('.setting-row')[settingIndex].getAttribute('data-setting') === 'subtitle-advanced') { openSubtitleEditor(); }
          else { setSettingsOpen(false); }
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
      } else if (playerZone === 'buttons' && (event.keyCode === 37 || event.keyCode === 39)) {
        showPlayerControls();
        movePlayerButton(event.keyCode === 37 ? -1 : 1);
      } else if (event.keyCode === 13) {
        showPlayerControls();
        if (playerZone === 'skip') { activateSkipMarker(); return; }
        if (playerZone === 'timeline') { return; }
        if (playerButtonIndex === 0) { switchPlayerEpisode(-1); }
        else if (playerButtonIndex === 2) { switchPlayerEpisode(1); }
        else if (playerButtonIndex === 3) { setSettingsOpen(true); }
        else { togglePlayback(); }
      } else if (event.keyCode === 412 || event.keyCode === 417) {
        showPlayerControls();
        seekPlayerTo(playerAbsoluteTime() + (event.keyCode === 412 ? -10 : 10));
      }
      return;
    }

    if (appView === 'detail') {
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
          cycleDetailTrack('audio', 1);
        } else if (detailZone === 'subtitles') {
          cycleDetailTrack('subtitles', 1);
        } else if (detailZone === 'version') {
          cycleDetailVersion(1);
        } else if (detailActionIndex === 1) {
          toggleCurrentWatched();
        } else if (detailActionIndex === 2) {
          toggleCurrentWatchlist();
        } else if (detailActionIndex === 3) {
          refreshCurrentMetadata();
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
      document.body.className = document.body.className.replace(/\s*is-booting/g, '');
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
    document.body.className = document.body.className.replace(/\s*is-booting/g, '');
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
        navigationItems = NavigationModel.applyLibraryOrder(items, NavigationModel.load(root.localStorage));
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
      authState = AuthStore.save(root.localStorage, authState);
    }
    if (!selected && configuredServer) { selected = serverForUri(configuredServer.uri) || configuredServer; }
    if (!selected && serverState.servers.length) { selected = serverState.servers[0]; }
    if (selected) { applyServer(selected); }
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
      diagnosticsFocusIndex = button.getAttribute('data-diagnostics-action') === 'refresh' ? 0 : 1;
      renderDiagnosticsFocus();
    } else if (button.hasAttribute('data-resume-index') && resumeChoiceVisible) {
      resumeChoiceState.index = Number(button.getAttribute('data-resume-index'));
      renderResumeChoice();
    } else if (button.hasAttribute('data-setup-language') || button.hasAttribute('data-setup-action') || button.hasAttribute('data-setup-server') || button.hasAttribute('data-setup-profile')) {
      var setupButtons = document.querySelectorAll('#setup-view button');
      for (index = 0; index < setupButtons.length; index += 1) {
        if (setupButtons[index] === button) { setupFocusIndex = index; break; }
      }
      updateSetupFocus();
    } else if (button.hasAttribute('data-nav-index')) {
      state.navIndex = Number(button.getAttribute('data-nav-index'));
      state.area = 'nav';
      if (appView === 'detail') { detailZone = 'nav'; updateDetailFocus(); }
      else if (appView === 'search') { searchFocus.zone = 'nav'; updateSearchFocus(); }
      else if (appView === 'library') { libraryZone = 'nav'; updateLibraryFocus(); }
      else if (appView === 'watchlist') { watchlistZone = 'nav'; updateWatchlistFocus(); }
      else if (appView === 'settings') { settingsZone = 'nav'; updateSettingsFocus(); }
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
    } else if (button.id === 'detail-play' || button.id === 'detail-watched' || button.id === 'detail-watchlist' || button.id === 'detail-refresh-metadata') {
      detailZone = 'play';
      detailActionIndex = button.id === 'detail-play' ? 0 : (button.id === 'detail-watched' ? 1 : (button.id === 'detail-watchlist' ? 2 : 3));
      updateDetailFocus();
    } else if (button.id === 'detail-audio' || button.id === 'detail-subtitles' || button.id === 'detail-version') {
      detailZone = button.id === 'detail-audio' ? 'audio' : (button.id === 'detail-subtitles' ? 'subtitles' : 'version');
      updateDetailFocus();
    } else if (button.hasAttribute('data-setting-index')) {
      settingsZone = 'list';
      settingsViewIndex = Number(button.getAttribute('data-setting-index'));
      renderAppSettings();
    } else if (button.hasAttribute('data-language-index')) {
      languageEditorIndex = Number(button.getAttribute('data-language-index'));
      renderLanguageEditor();
    } else if (button.hasAttribute('data-server-index')) {
      serverEditorIndex = Number(button.getAttribute('data-server-index'));
      renderServerEditor();
    } else if (button.hasAttribute('data-search-key')) {
      searchFocus = {
        zone: 'keyboard',
        row: Number(button.getAttribute('data-search-row')),
        column: Number(button.getAttribute('data-search-column')),
        index: 0
      };
      updateSearchFocus();
    } else if (button.hasAttribute('data-search-index')) {
      searchFocus = {
        zone: 'results',
        row: Math.floor(Number(button.getAttribute('data-search-index')) / searchResultLayout.columns),
        column: Number(button.getAttribute('data-search-index')) % searchResultLayout.columns,
        index: Number(button.getAttribute('data-search-index'))
      };
      updateSearchFocus();
    } else if (button.hasAttribute('data-library-tab')) {
      if (button.disabled) { return; }
      libraryZone = 'tabs';
      clearLogicalFocus();
      button.className += ' is-focused';
    } else if (button.id === 'library-refresh' || button.id === 'library-refresh-metadata') {
      libraryZone = 'actions'; libraryActionIndex = button.id === 'library-refresh' ? 0 : 1; updateLibraryFocus();
    } else if (button.hasAttribute('data-library-sort')) {
      libraryZone = 'sort'; libraryControlIndex = button.getAttribute('data-library-sort') === 'titleSort' ? 0 : 1; updateLibraryFocus();
    } else if (button.hasAttribute('data-library-filter')) {
      libraryZone = 'filter'; libraryControlIndex = ['all','unwatched','watched'].indexOf(button.getAttribute('data-library-filter')); updateLibraryFocus();
    } else if (button.hasAttribute('data-library-index')) {
      libraryZone = 'grid'; libraryFocusIndex = Number(button.getAttribute('data-library-index')); updateLibraryFocus();
    } else if (button.hasAttribute('data-watchlist-index')) {
      watchlistZone = 'grid'; watchlistFocusIndex = Number(button.getAttribute('data-watchlist-index')); updateWatchlistFocus();
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
    } else if (button.className.indexOf('setting-row') !== -1) {
      var settingRows = document.querySelectorAll('.setting-row');
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
    if (appView === 'library' && libraryZone === 'grid') { return document.getElementById('library-grid'); }
    if (appView === 'watchlist' && watchlistZone === 'grid') { return document.getElementById('watchlist-grid'); }
    if (appView === 'search' && searchFocus.zone === 'results') { return document.getElementById('search-results'); }
    if (appView === 'settings' && serverEditorOpen) { return document.getElementById('app-settings-list'); }
    if (appView === 'settings' && !languageEditorKind) { return document.getElementById('app-settings-list'); }
    if (appView === 'settings' && languageEditorKind) { return document.getElementById('language-editor-list'); }
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
      button = firstVisibleButton(container, '[data-library-index]');
      if (button) { libraryZone = 'grid'; libraryFocusIndex = Number(button.getAttribute('data-library-index')); }
    } else if (appView === 'watchlist') {
      button = firstVisibleButton(container, '[data-watchlist-index]');
      if (button) { watchlistZone = 'grid'; watchlistFocusIndex = Number(button.getAttribute('data-watchlist-index')); }
    } else if (appView === 'search') {
      button = firstVisibleButton(container, '[data-search-index]');
      if (button) {
        searchFocus.zone = 'results';
        searchFocus.index = Number(button.getAttribute('data-search-index'));
        searchFocus.row = Math.floor(searchFocus.index / searchResultLayout.columns);
        searchFocus.column = searchFocus.index % searchResultLayout.columns;
      }
    } else if (appView === 'settings' && serverEditorOpen) {
      button = firstVisibleButton(container, '[data-server-index]');
      if (button) { serverEditorIndex = Number(button.getAttribute('data-server-index')); }
    } else if (appView === 'settings' && languageEditorKind) {
      button = firstVisibleButton(container, '[data-language-index]');
      if (button) { languageEditorIndex = Number(button.getAttribute('data-language-index')); }
    } else if (appView === 'settings') {
      button = firstVisibleButton(container, '[data-setting-index]');
      if (button) { settingsViewIndex = Number(button.getAttribute('data-setting-index')); }
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
    if (button.hasAttribute('data-resume-index') && resumeChoiceVisible) {
      resumeChoiceState.index = Number(button.getAttribute('data-resume-index'));
      activateResumeChoice();
    } else if (button.hasAttribute('data-diagnostics-action') && appView === 'diagnostics') {
      diagnosticsFocusIndex = button.getAttribute('data-diagnostics-action') === 'refresh' ? 0 : 1;
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
      changeSetting(1);
    } else if (button.hasAttribute('data-language-index')) {
      toggleEditorLanguage();
    } else if (button.hasAttribute('data-server-index')) {
      activateServerEditorRow();
    } else if (button.hasAttribute('data-search-key')) {
      applySearchKey(button.getAttribute('data-search-key'));
    } else if (button.hasAttribute('data-search-index')) {
      openDetail(searchResults[Number(button.getAttribute('data-search-index'))]);
    } else if (button.hasAttribute('data-library-tab')) {
      if (button.disabled) { return; }
      selectLibraryTab(Number(button.getAttribute('data-library-tab')));
    } else if (button.hasAttribute('data-library-sort')) {
      activateLibrarySort(button.getAttribute('data-library-sort'));
    } else if (button.hasAttribute('data-library-filter')) {
      activateLibraryFilter(button.getAttribute('data-library-filter'));
    } else if (button.hasAttribute('data-library-index')) {
      var libraryItem = libraryItems[Number(button.getAttribute('data-library-index'))];
      if (libraryItem && libraryItem.containerKey) { openLibraryContainer(libraryItem); }
      else { openDetail(libraryItem); }
    } else if (button.hasAttribute('data-watchlist-index')) {
      openDetail(watchlistItems[Number(button.getAttribute('data-watchlist-index'))]);
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
    } else if (button.className.indexOf('setting-row') !== -1 && settingsOpen) {
      if (button.getAttribute('data-setting') === 'subtitle-advanced') { openSubtitleEditor(); }
      else { cycleSetting(1); }
    } else if (button.hasAttribute('data-subtitle-editor') && subtitleEditorOpen) {
      activateSubtitleEditorControl(button.getAttribute('data-subtitle-editor'));
    }
  }

  applyCardScale();
  applyAccentColor();
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
    navbarResizeTimer = root.setTimeout(function () { renderNavigation(); }, 100);
  }, false);
  document.getElementById('detail-play').onclick = openPlayer;
  document.getElementById('detail-watched').onclick = toggleCurrentWatched;
  document.getElementById('detail-watchlist').onclick = toggleCurrentWatchlist;
  document.getElementById('detail-refresh-metadata').onclick = refreshCurrentMetadata;
  document.getElementById('detail-audio').onclick = function () { cycleDetailTrack('audio', 1); };
  document.getElementById('detail-subtitles').onclick = function () { cycleDetailTrack('subtitles', 1); };
  document.getElementById('detail-version').onclick = function () { cycleDetailVersion(1); };
  document.getElementById('player-previous').onclick = function () { switchPlayerEpisode(-1); };
  document.getElementById('player-toggle').onclick = function () {
    togglePlayback();
  };
  document.getElementById('player-next').onclick = function () { switchPlayerEpisode(1); };
  document.getElementById('player-settings-button').onclick = function () { setSettingsOpen(true); };
  document.getElementById('player-error-retry').onclick = retryPlaybackFromError;
  document.getElementById('player-error-settings').onclick = function () { hidePlayerError(); setSettingsOpen(true); };
  document.getElementById('player-error-back').onclick = function () { hidePlayerError(); closePlayer(); };
  document.getElementById('player-video').addEventListener('click', function () { if (subtitleEditorOpen) { return; } showPlayerControls(); togglePlayback(); }, false);
  document.getElementById('autoplay-play').onclick = confirmAutoplayCountdown;
  document.getElementById('autoplay-cancel').onclick = cancelAutoplayCountdown;
  document.getElementById('player-video').addEventListener('playing', function () {
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
    if (playerBuffering) {
      playerBuffering = false;
      playbackClock = PlaybackClock.freeze(playbackClock, false);
      setPlayerLoading(false);
    }
    if (currentPlayback && currentPlayback.directSeekTarget !== null && currentPlayback.directSeekTarget !== undefined) {
      directTarget = Number(currentPlayback.directSeekTarget || 0);
      if (directTarget > 0.25) {
        playerNativeSeekPending = true;
        try { video.currentTime = directTarget; } catch (seekError) { playerNativeSeekPending = false; recoverPlaybackError(); return; }
      }
      currentPlayback.directSeekTarget = null;
    }
    if (playerStreamSwitching) { resumeRebuiltStream(); }
    else if (video.paused) { video.play(); }
  }, false);
  document.getElementById('player-video').addEventListener('waiting', function () {
    var video = document.getElementById('player-video');
    if (appView !== 'player' || !currentPlayback || playerStreamSwitching || video.paused) { return; }
    playerBuffering = true;
    playbackClock = PlaybackClock.freeze(playbackClock, true);
    setPlayerLoading(true, true);
  }, false);
  document.getElementById('player-video').addEventListener('stalled', function () {
    var video = document.getElementById('player-video');
    if (appView !== 'player' || !currentPlayback || playerStreamSwitching || video.paused) { return; }
    playerBuffering = true;
    playbackClock = PlaybackClock.freeze(playbackClock, true);
    setPlayerLoading(true, true);
  }, false);
  document.getElementById('player-video').addEventListener('seeking', function () {
    if (appView !== 'player' || !currentPlayback) { return; }
    playbackClock = PlaybackClock.freeze(playbackClock, true);
  }, false);
  document.getElementById('player-video').addEventListener('seeked', function () {
    var video = document.getElementById('player-video');
    var observation;
    var expectedSeek = playerNativeSeekPending;
    if (appView !== 'player' || !currentPlayback) { return; }
    root.clearTimeout(playerClockRepairFallbackTimer);
    playerClockRepairFallbackTimer = null;
    playerNativeSeekPending = false;
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
  root.addEventListener('offline', function () {
    homePoller.stop();
    if (appView === 'player' && currentPlayback) { setText('player-status', t('player.waitingNetwork')); }
  }, false);
  root.addEventListener('online', function () {
    if (appView === 'player' && currentPlayback && playerRecoveryState.status === 'waiting-network') {
      playerRecoveryState = PlaybackRecovery.online(playerRecoveryState);
      hidePlayerError();
      applyCurrentPlaybackAttempt(true);
      return;
    }
    recoverActiveViewAfterNetwork();
    homePoller.schedule();
  }, false);
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
}(this, document));
