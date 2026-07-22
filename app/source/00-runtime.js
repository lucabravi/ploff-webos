// Generated bundle entry: edit app/source fragments, then run npm run build:app.
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
  var MediaPreferences = root.PloffMediaPreferences;
  var MediaProfile = root.PloffMediaProfile;
  var MediaLabels = root.PloffMediaLabels;
  var WatchlistClient = root.PloffWatchlistClient;
  var WatchlistState = root.PloffWatchlistState;
  var WatchlistView = root.PloffWatchlistView;
  var PlexClient = root.PloffClient;
  var ProgressiveImages = root.PloffProgressiveImages;
  var I18n = root.PloffI18n;
  var Settings = root.PloffSettings;
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
  var startupStartedAt = new Date().getTime();
  var startupComplete = false;
  var startupTimer = null;
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
    { code: 'en', label: 'English' },
    { code: 'it', label: 'Italiano' },
    { code: 'es', label: 'Espa\u00f1ol' },
    { code: 'fr', label: 'Fran\u00e7ais' },
    { code: 'de', label: 'Deutsch' },
    { code: 'pt', label: 'Portugu\u00eas' },
    { code: 'ja', label: '\u65e5\u672c\u8a9e' },
    { code: 'ko', label: '\ud55c\uad6d\uc5b4' }
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
  var detailMediaProfileRequest = null;
  var detailMediaProfileTimer = null;
  var detailMediaProfileToken = 0;
  var detailMediaProfileRatingKey = '';
  var detailMediaProfileLoading = false;
  var detailMediaLoadingLabelTimer = null;
  var detailMediaLoadingLabelVisible = false;
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
      return appView === 'home' && !document.hidden && !!config.apiBaseUrl && (!root.navigator || root.navigator.onLine !== false);
    },
    isLoading: function () { return homeRefreshCoordinator.isLoading(); },
    refresh: function () { homeRefreshCoordinator.refresh(); }
  });
