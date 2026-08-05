(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffApplicationController = factory(); }
}(this, function () {
  'use strict';
  function create(root, document, credentialStorage) {
    'use strict';
    var FocusModel = root.PloffFocusModel, NavigationModel = root.PloffNavigationModel,
      HomeState = root.PloffHomeState, ActivityState = root.PloffActivityState,
      NavbarWindow = root.PloffNavbarWindow, ViewState = root.PloffViewState,
      CardLayout = root.PloffCardLayout, MediaLabels = root.PloffMediaLabels,
      ProgressiveImages = root.PloffProgressiveImages, BackgroundAudio = root.PloffBackgroundAudio,
      I18n = root.PloffI18n, PresentationServices = root.PloffPresentationServices,
      ShellController = root.PloffShellController,
      ShellFeatureController = root.PloffShellFeatureController;
    var SearchModel = root.PloffSearchModel, PloffSearchView = root.PloffSearchView,
      T9Input = root.PloffT9Input, SearchSession = root.PloffSearchSession,
      SearchController = root.PloffSearchController, SearchFeatureController = root.PloffSearchFeatureController;
    var LibraryFilterView = root.PloffLibraryFilterView, PloffLibraryGridView = root.PloffLibraryGridView,
      LibraryLifecycle = root.PloffLibraryLifecycle, LibraryContainers = root.PloffLibraryContainers,
      LibraryController = root.PloffLibraryController, LibraryFeatureController = root.PloffLibraryFeatureController,
      WatchlistClient = root.PloffWatchlistClient, WatchlistState = root.PloffWatchlistState,
      WatchlistView = root.PloffWatchlistView;
    var DetailEpisodeView = root.PloffDetailEpisodeView, DetailNavigation = root.PloffDetailNavigation,
      DetailPresentationView = root.PloffDetailPresentationView, DetailPreferenceState = root.PloffDetailPreferenceState,
      DetailController = root.PloffDetailController, DetailFeatureController = root.PloffDetailFeatureController,
      MetadataRefresh = root.PloffMetadataRefresh, MediaPreferences = root.PloffMediaPreferences,
      MediaProfile = root.PloffMediaProfile, MediaChoiceModel = root.PloffMediaChoiceModel, MediaInfo = root.PloffMediaInfo;
    var ChoiceDialogView = root.PloffChoiceDialogView, ChoiceDialogController = root.PloffChoiceDialogController,
      MediaInfoView = root.PloffMediaInfoView, MediaInfoDialogController = root.PloffMediaInfoDialogController;
    var UpNextLayoutDialog = root.PloffUpNextLayoutDialog, UpNextState = root.PloffUpNextState,
      UpNextTiming = root.PloffUpNextTiming, UpNextView = root.PloffUpNextView;
    var SkipMarkerState = root.PloffSkipMarkerState, PlayerControlsState = root.PloffPlayerControlsState,
      PlayerControlsView = root.PloffPlayerControlsView, PlayerBufferingIndicator = root.PloffPlayerBufferingIndicator,
      ChapterState = root.PloffChapterState, PlayerChaptersView = root.PloffPlayerChaptersView,
      PlaybackStrategy = root.PloffPlaybackStrategy, VersionSelection = root.PloffVersionSelection,
      PlaybackQueueModel = root.PloffPlaybackQueueModel, PlaybackRecovery = root.PloffPlaybackRecovery,
      PlaybackClock = root.PloffPlaybackClock, PlayerSeekController = root.PloffPlayerSeekController,
      PlayerTimelinePolicy = root.PloffPlayerTimelinePolicy, EpisodeNavigation = root.PloffEpisodeNavigation,
      ResumeChoice = root.PloffResumeChoice, SubtitleSync = root.PloffSubtitleSync,
      SubtitleEditorView = root.PloffSubtitleEditorView, SubtitleOffsetStore = root.PloffSubtitleOffsetStore;
    var QueueSequenceContract = root.PloffQueueSequenceContract,
      BoundedQueueCache = root.PloffBoundedQueueCache,
      SeriesQueueProvider = root.PloffSeriesQueueProvider,
      PlexContainerQueueProvider = root.PloffPlexContainerQueueProvider,
      QueueGapController = root.PloffQueueGapController,
      QueueGapView = root.PloffQueueGapView,
      PlaybackQueueController = root.PloffPlaybackQueueController,
      PlayerControlsController = root.PloffPlayerControlsController, PlaybackController = root.PloffPlaybackController,
      PlayerFeatureController = root.PloffPlayerFeatureController;
    var DiagnosticsState = root.PloffDiagnosticsState, DiagnosticsView = root.PloffDiagnosticsView,
      DiagnosticsController = root.PloffDiagnosticsController,
      DiagnosticsFeatureController = root.PloffDiagnosticsFeatureController;
    var Settings = root.PloffSettings, LocalData = root.PloffLocalData,
      SettingsCatalog = root.PloffSettingsCatalog, SettingsView = root.PloffSettingsView,
      SettingsController = root.PloffSettingsController,
      SettingsFeatureController = root.PloffSettingsFeatureController;
    var SetupView = root.PloffSetupView, SetupScanIndicator = root.PloffSetupScanIndicator,
      SetupFocus = root.PloffSetupFocus, SetupAuthSession = root.PloffSetupAuthSession,
      SetupController = root.PloffSetupController, SetupFeatureController = root.PloffSetupFeatureController;
    var ServerController = root.PloffServerController, ServerFeatureController = root.PloffServerFeatureController,
      ServerEditorView = root.PloffServerEditorView, AuthStore = root.PloffAuthStore,
      PlexAuth = root.PloffPlexAuth, ServerStore = root.PloffServerStore,
      ServerDiscovery = root.PloffServerDiscovery, NetworkState = root.PloffNetworkState,
      NetworkPolicy = root.PloffNetworkPolicy, NetworkTransition = root.PloffNetworkTransition;
    var PlexClient = root.PloffClient, PlexFeaturePorts = root.PloffPlexFeaturePorts,
      DeviceCapabilities = root.PloffDeviceCapabilities,
      DeviceLocale = root.PloffDeviceLocale, ApplicationEvents = root.PloffApplicationEvents,
      ApplicationSession = root.PloffApplicationSession, InputTargetRouter = root.PloffInputTargetRouter,
      InputController = root.PloffInputController, PointerController = root.PloffPointerController,
      ReleaseStatus = root.PloffReleaseStatus, BuildInfo = root.PloffBuildInfo || { version: 'development' };
    var formatTime = PlayerTimelinePolicy.formatTime;
    var formatLongTime = PlayerTimelinePolicy.formatLongTime;
    var config = root.PloffConfig || {};
    if (!PlexFeaturePorts) { throw new Error('ApplicationController requires PlexFeaturePorts'); }
    var serverPlexClient = PlexFeaturePorts.server(PlexClient);
    var shellPlexClient = PlexFeaturePorts.shell(PlexClient);
    var searchPlexClient = PlexFeaturePorts.search(PlexClient);
    var libraryPlexClient = PlexFeaturePorts.library(PlexClient);
    var detailPlexClient = PlexFeaturePorts.detail(PlexClient);
    var playerPlexClient = PlexFeaturePorts.player(PlexClient);
    var authOptions = {
      baseUrl: config.accountBaseUrl || 'https://plex.tv', clientIdentifier: PlexAuth ? PlexAuth.clientIdentifier(root.localStorage) : '', deviceName: 'Ploff', platformVersion: String(root.navigator && root.navigator.userAgent || ''), timeout: Math.min(6000, Number(config.requestTimeout || 5000)),
      version: BuildInfo.version
    };
    var serverFeature = null;
    var setupFeature = null;
    var navigationItems = [{ title: 'Home', kind: 'home', labelKey: 'nav.home' }];
    navigationItems.push({ title: 'Watchlist', kind: 'watchlist', labelKey: 'nav.watchlist' });
    navigationItems.push({ title: 'Playlists', kind: 'playlists', labelKey: 'nav.playlists' });
    navigationItems.push({ title: 'Impostazioni', kind: 'settings', labelKey: 'nav.settings' });
    var availableNavigationItems = navigationItems.slice();
    var destroyed = false;
    var owned = [];
    function destroyOne(value) {
      if (value && typeof value.destroy === 'function') { value.destroy(); }
    }
    function destroyOwned() {
      var cleanupError = null;
      var value;
      while (owned.length) {
        value = owned.pop();
        try { destroyOne(value); }
        catch (error) { if (!cleanupError) { cleanupError = error; } }
      }
      return cleanupError;
    }
    function failConstruction(error) {
      destroyed = true;
      destroyOwned();
      throw error;
    }
    function constructOwner(createOwner) {
      var value;
      try { value = createOwner(); }
      catch (error) { failConstruction(error); }
      owned.push(value);
      return value;
    }
    function constructStep(step) {
      try { return step(); }
      catch (error) { failConstruction(error); }
      return undefined;
    }
    var appSettings = Settings.load(root.localStorage);
    var presentationServices = constructStep(function () {
      if (!PresentationServices || typeof PresentationServices.create !== 'function') {
        throw new Error('ApplicationController requires PresentationServices');
      }
      return PresentationServices.create({
        document: document,
        I18n: I18n,
        MediaLabels: MediaLabels,
        settings: function () { return appSettings; }
      });
    });
    var languageCatalog = ['en', 'it', 'es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh', 'ru'];
    var accentColorValues = {
      cyan: '#13b8ad', amber: '#e5a00d', blue: '#4da3ff', green: '#48c774', pink: '#ec6aa7', purple: '#a66cff', red: '#f05d5e',
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
    var shellFeature = null;
    var releaseStatus = null;
    var applicationSession = constructOwner(function () {
      return ApplicationSession.create({ view: 'home', settings: appSettings, config: config });
    });
    function currentView() {
      return String(applicationSession.view() || 'home');
    }
    function setAppView(nextView) {
      var view = String(nextView || 'home');
      applicationSession.update({ view: view });
      return view;
    }
    function shellFocusSnapshot() {
      if (shellFeature && typeof shellFeature.focusState === 'function') { return shellFeature.focusState(); }
      return { area: 'media', navIndex: 0, rowIndex: 0, column: 0 };
    }
    function setShellFocus(patch) {
      var next = shellFocusSnapshot();
      patch = patch || {};
      if (patch.area !== undefined) { next.area = patch.area; }
      if (patch.navIndex !== undefined) { next.navIndex = Math.max(0, Number(patch.navIndex) || 0); }
      if (patch.rowIndex !== undefined) { next.rowIndex = Math.max(0, Number(patch.rowIndex) || 0); }
      if (patch.column !== undefined) { next.column = Math.max(0, Number(patch.column) || 0); }
      return shellFeature && typeof shellFeature.setFocus === 'function' ? shellFeature.setFocus(next) : next;
    }
    function shellNavigationIndex() { return shellFocusSnapshot().navIndex; }
    var searchFeature = null;
    var settingsFeature = null;
    var diagnosticsFeature = null;
    var libraryFeature = null;
    var detailFeature = null;
    var playerFeature = null;
    var inputController = null;
    var pointerController = null;
    function detailSnapshot() { return detailFeature ? detailFeature.snapshot() : {}; }
    serverFeature = constructOwner(function () {
      return ServerFeatureController.create({
      platform: {
        root: root, document: document, storage: root.localStorage,
        credentialStorage: credentialStorage
      },
      modules: {
        ServerController: ServerController, ServerEditorView: ServerEditorView, ActivityState: ActivityState, AuthStore: AuthStore, LocalData: LocalData, NetworkPolicy: NetworkPolicy, NetworkState: NetworkState, NetworkTransition: NetworkTransition, PlexAuth: PlexAuth, PlexClient: serverPlexClient, ServerDiscovery: ServerDiscovery,
        ServerStore: ServerStore, WatchlistClient: WatchlistClient,
        WatchlistState: WatchlistState
      },
      config: {
        application: config, authOptions: authOptions,
        discovery: function () { return config; }
      },
      state: {
        view: function () { return currentView(); },
        publish: function (snapshot) {
          applicationSession.update({
            activeProfile: snapshot.activeProfile || null,
            activeServer: snapshot.activeServer,
            config: snapshot.config
          });
        }
      },
      presentation: {
        t: presentationServices.t,
        element: presentationServices.element,
        keepFocusVisible: function (container, target) {
          if (settingsFeature) { settingsFeature.keepFocusVisible(container, target); }
        },
        pointerActive: function () { return !!(pointerController && pointerController.isSelectionActive()); }, renderActivities: function () { if (shellFeature) { shellFeature.renderServerActivities(); } }, renderProfile: function () { if (shellFeature) { shellFeature.renderActiveProfile(); } },
        renderSettings: function () { if (settingsFeature && currentView() === 'settings') { settingsFeature.refresh(); } },
        renderNetwork: function () { if (shellFeature) { shellFeature.onNetworkPresentation(); } }
      },
      application: {
        applyNavigation: function (items) {
          shellFeature.applyNavigationVisibility(NavigationModel.applyLibraryOrder(items, NavigationModel.load(root.localStorage)));
          shellFeature.renderNavigation();
        },
        loadHome: function () { shellFeature.refreshHome(); }, preloadWatchlist: function () { if (libraryFeature) { libraryFeature.loadWatchlist(false); } },
        seedAccountSettings: function (account) {
          appSettings = Settings.seedFromPlex(appSettings, account);
          if (settingsFeature) { settingsFeature.save(); }
          shellFeature.renderNavigation();
          if (settingsFeature && currentView() === 'settings') { settingsFeature.refresh(); }
        },
        persistSettings: function () { if (settingsFeature) { settingsFeature.save(); } }, recoverAfterNetwork: function () { recoverActiveViewAfterNetwork(); }, stopHomePolling: function () { if (shellFeature) { shellFeature.stopHomePolling(); } },
        scheduleHomePolling: function () { if (shellFeature) { shellFeature.scheduleHomePolling(); } }
      },
      lifecycle: {
        resetContent: function () {
          if (!shellFeature) { return; }
          shellFeature.resetHome();
          if (libraryFeature) { libraryFeature.resetContent(); }
          shellFeature.cancelImages('home');
          shellFeature.clearHome();
          shellFeature.clearHomeSurface();
        },
        whenCredentialsIdle: function (callback) {
          if (root.PloffCredentialVault) { root.PloffCredentialVault.whenIdle(callback); }
          else { callback(); }
        },
        reload: function () { if (root.location && root.location.reload) { root.location.reload(); } }
      },
      transitions: {
        openSetup: function () { openSetup(); }, openManualSetup: function () { openManualSetup(); },
        serverSwitched: function () {
          if (settingsFeature) { settingsFeature.suspend(); }
          if (shellFeature) { shellFeature.prepareServerSwitch(); }
          setAppView('home');
          serverFeature.loadApplication();
        }
      }
    });
    });
    var choiceDialogController = constructOwner(function () {
      return ChoiceDialogController.create({ document: document, ChoiceDialogView: ChoiceDialogView, t: t });
    });
    var mediaInfoDialogController = constructOwner(function () {
      return MediaInfoDialogController.create({
      document: document, MediaInfoView: MediaInfoView, t: t,
      onClosed: function (origin) {
        if (origin === 'player' && playerFeature) { playerFeature.onMediaInfoClosed(); }
        else if (currentView() === 'detail' && detailFeature) { detailFeature.updateFocus(); }
      }
    });
    });
    var playbackCapabilities = {
      directPlay: false, codecs: [], containers: [], known: false,
      uhd: false, hdr10: false, dolbyVision: false, hdrKnown: false
    };
    releaseStatus = constructOwner(function () {
      if (!ReleaseStatus || typeof ReleaseStatus.create !== 'function') { throw new Error('ApplicationController requires ReleaseStatus'); }
      return ReleaseStatus.create({
        root: root, storage: root.localStorage, installedVersion: BuildInfo.version,
        onChange: function () { if (settingsFeature && currentView() === 'settings') { settingsFeature.refresh(); } }
      });
    });
    shellFeature = constructOwner(function () {
      return ShellFeatureController.create({
      platform: { root: root, document: document, storage: root.localStorage },
      modules: {
        ShellController: ShellController, HomeState: HomeState, FocusModel: FocusModel, NavigationModel: NavigationModel, NavbarWindow: NavbarWindow, CardLayout: CardLayout, MediaLabels: MediaLabels, ProgressiveImages: ProgressiveImages, BackgroundAudio: BackgroundAudio, ViewState: ViewState,
        I18n: I18n
      },
      presentationServices: presentationServices,
      data: {
        PlexClient: shellPlexClient, config: config, initialNavigationItems: availableNavigationItems, initialRows: [],
        initialFocus: { area: 'media', navIndex: 0, rowIndex: 0, column: 0 }
      },
      state: {
        settings: function () { return appSettings; }, authState: function () { return serverFeature.authSnapshot(); }, activeProfileVisible: function () { return !!serverFeature.activeProfile(); }, activeProfile: function () { return serverFeature.activeProfile(); }, authMode: function () { return serverFeature.authMode(); },
        setupComplete: function () { return serverFeature.setupComplete(); }, publishActiveProfile: function (profile) { applicationSession.update({ activeProfile: profile }); }, serverActivities: function () { return serverFeature ? serverFeature.snapshot().activities : []; },
        networkSnapshot: function () { return serverFeature.networkSnapshot(); }, currentView: function () { return currentView(); }, setView: setAppView, pointerSelectionActive: function () { return !!(pointerController && pointerController.isSelectionActive()); }, navigationHasFocus: navigationHasFocus,
        watchlistAvailable: serverFeature.watchlistAvailable,
        themeIdentity: function () { return String(config.apiBaseUrl || '') + '|' + String(config.token || ''); },
        homeCanRefresh: function () {
          return currentView() === 'home' && !document.hidden && !!config.apiBaseUrl && serverFeature.allowsLocal();
        }
      },
      presentation: {
        networkStatusLabel: function (snapshot) { return settingsFeature ? settingsFeature.networkStatusLabel(snapshot) : ''; }, networkStatusClass: function (snapshot) { return settingsFeature ? settingsFeature.networkStatusClass(snapshot) : ''; },
        animationDuration: function (milliseconds) { return settingsFeature ? settingsFeature.animationDuration(milliseconds) : milliseconds; },
        onActivityTitle: function (title) {
          if (currentView() !== 'detail' || !detailFeature) { return; }
          if (title) { showDetailMetadataStatus(title, false); }
          else if (detailSnapshot().refreshPending) { showDetailMetadataStatus(t('status.refreshing'), false); }
          else if (!detailSnapshot().metadataStatusTemporary) { hideDetailMetadataStatus(); }
        },
        translateDetail: function () { if (detailFeature) { detailFeature.translateStatic(); } }, translateLibrary: function () { if (libraryFeature) { libraryFeature.translateStatic(); } }, translatePlayer: function () { if (playerFeature) { playerFeature.translateStatic(); } },
        refreshSettings: function () { if (settingsFeature && currentView() === 'settings') { settingsFeature.refresh(); } }, refreshDiagnostics: function () { if (diagnosticsFeature && diagnosticsFeature.isOpen()) { diagnosticsFeature.render(); } },
        hideNonHomeViews: function () {
          if (searchFeature) { searchFeature.leave({ keepImages: true, preserveBackgroundAudio: true }); }
          if (libraryFeature) { libraryFeature.hidePresentation(); }
          if (detailFeature) { detailFeature.hideSurface(); }
          if (settingsFeature) { settingsFeature.suspend(); }
          shellFeature.showHomeSurface();
        },
        onResizeCurrentView: function () { if (currentView() === 'detail' && detailFeature) { detailFeature.updateSummaryOverflow(); } },
        openSetup: openSetup
      },
      transitions: {
        activateHome: activate, playHomeItem: playHomeItem, requestExit: requestApplicationExit, navigationMatches: navigationViewMatches, commitNavigationView: commitNavigationView, enterNavigationContent: enterNavigationContent, focusNavigationForCurrentView: focusCurrentNavigation, openProfileManager: openProfileManager, focusActivity: focusCurrentNavigation,
        scheduleAdjacentLibraryPrefetch: function () {
          if (libraryFeature) { libraryFeature.scheduleAdjacentPrefetch(shellNavigationIndex(), navigationItems); }
        },
        onHomeReady: function () { if (releaseStatus) { releaseStatus.check(false); } }
      }
    });
    });
    navigationItems = constructStep(function () { return shellFeature.navigationItems(); });
    libraryFeature = constructOwner(function () {
      return LibraryFeatureController.create({
      platform: { root: root, document: document },
      modules: {
        LibraryController: LibraryController, LibraryContainers: LibraryContainers, LibraryFilterView: LibraryFilterView, LibraryGridView: PloffLibraryGridView, LibraryLifecycle: LibraryLifecycle, PlaybackQueueModel: PlaybackQueueModel, ProgressiveImages: ProgressiveImages, SearchModel: SearchModel,
        WatchlistState: WatchlistState, WatchlistView: WatchlistView,
        CardLayout: CardLayout
      },
      data: {
        PlexClient: libraryPlexClient, WatchlistClient: WatchlistClient, config: config, accountToken: serverFeature.watchlistAccountToken, watchlistIdentity: serverFeature.watchlistIdentity,
        watchlistAvailable: serverFeature.watchlistAvailable
      },
      state: {
        currentView: function () { return currentView(); }, navigationIndex: shellNavigationIndex, navigationItems: function () { return navigationItems; }, setNavigationIndex: function (index) { setShellFocus({ navIndex: index }); }, homeBusy: function () { return shellFeature.isHomeLoading(); },
        pointerActive: function () {
          return !!(pointerController && (pointerController.isSelectionActive() || pointerController.isWheelNavigationActive()));
        },
        cardScale: function () { return appSettings.cardScale; },
        uiLanguage: function () { return appSettings.uiLanguage; }
      },
      shell: {
        t: t, element: presentationServices.element, setText: presentationServices.setText, clearFocus: shellFeature.clearLogicalFocus, renderNavigation: shellFeature.renderNavigation, navigationFocusCount: shellFeature.navigationFocusCount,
        navigationTarget: function (index) { return document.querySelector(shellFeature.selectorForNavIndex(index)); }, scheduleNavigationPreview: shellFeature.scheduleNavigationPreview, startNavigationHold: shellFeature.startNavigationHold, enterNavigation: shellFeature.enterActiveNavigation,
        showMessage: shellFeature.showMessage, showViewState: shellFeature.showViewState, hideViewState: shellFeature.hideViewState, scheduleBackdrop: shellFeature.scheduleBackdrop, scheduleTheme: shellFeature.scheduleTheme, stopTheme: function () { shellFeature.stopTheme(); }, animateLibrarySurface: shellFeature.animateLibrarySurface, cardMetrics: shellFeature.cardMetrics, cardProfile: shellFeature.cardProfile,
        mediaTitle: presentationServices.mediaTitle, mediaCardMeta: presentationServices.mediaCardMeta, mediaCardDetail: presentationServices.mediaCardDetail, mediaKey: presentationServices.mediaKey, artworkUrl: presentationServices.artworkUrl, renderedPosterSpecification: shellFeature.renderedPosterSpecification, fixedPosterSpecification: shellFeature.fixedPosterSpecification, posterLoader: shellFeature.posterLoader(),
        prioritizePoster: shellFeature.prioritizePoster, suspendSettings: function () { if (settingsFeature) { settingsFeature.suspend(); } },
        refreshHome: function () { shellFeature.refreshHome(); }
      },
      server: {
        waitForActivity: function (activityId, callback) {
          if (serverFeature) { serverFeature.waitForActivity(activityId, callback); }
          else if (callback) { callback({ cancelled: true }); }
        }
      },
      transitions: {
        setView: setAppView, openDetail: openDetail, playItem: playHomeItem, returnHome: transitionToHome,
        onWatchlistItemsChanged: function () {
          if (currentView() === 'detail') { detailFeature.onWatchlistChanged(); }
        }
      }
    });
    });
    detailFeature = constructOwner(function () {
      return DetailFeatureController.create({
      platform: { root: root, document: document, storage: root.localStorage },
      modules: {
        DetailController: DetailController, DetailNavigation: DetailNavigation, DetailPresentationView: DetailPresentationView, DetailEpisodeView: DetailEpisodeView, DetailPreferenceState: DetailPreferenceState, MetadataRefresh: MetadataRefresh, MediaInfo: MediaInfo, MediaPreferences: MediaPreferences,
        MediaProfile: MediaProfile, MediaChoiceModel: MediaChoiceModel, VersionSelection: VersionSelection,
        ProgressiveImages: ProgressiveImages
      },
      data: {
        PlexClient: detailPlexClient, config: config, mediaPreferenceIdentity: mediaPreferenceIdentity, playbackCapabilities: function () { return playbackCapabilities; }, settings: function () { return appSettings; }, activeVideoQuality: function () { return settingsFeature ? settingsFeature.activeVideoQuality() : 'original'; },
        waitForActivity: function (activityId, callback) {
          if (serverFeature) { serverFeature.waitForActivity(activityId, callback); }
          else if (callback) { callback({ cancelled: true }); }
        }
      },
      shell: {
        t: t, element: presentationServices.element, setText: presentationServices.setText, mediaTitle: presentationServices.mediaTitle, mediaMeta: presentationServices.mediaMeta, mediaDetail: presentationServices.mediaDetail, artworkUrl: presentationServices.artworkUrl, posterLoader: function () { return shellFeature.posterLoader(); },
        loadRenderedPoster: shellFeature.loadRenderedPoster, cancelImages: shellFeature.cancelImages, activeBackdropSource: shellFeature.activeBackdropSource, scheduleBackdrop: shellFeature.scheduleDetailBackdrop, clearBackdrop: shellFeature.clearBackdrop, scheduleTheme: shellFeature.scheduleTheme,
        showMessage: shellFeature.showMessage, showViewState: shellFeature.showViewState, hideViewState: shellFeature.hideViewState, clearFocus: shellFeature.clearLogicalFocus, navigationTarget: function (index) { return document.querySelector(shellFeature.selectorForNavIndex(index)); }, navigationIndex: shellNavigationIndex,
        navigationCount: shellFeature.navigationFocusCount,
        moveNavigation: function (effect) {
          var currentNavigationIndex = shellNavigationIndex();
          var nextNavigationIndex = effect === 'nav-left' ? Math.max(0, currentNavigationIndex - 1) : Math.min(shellFeature.navigationFocusCount() - 1, currentNavigationIndex + 1);
          setShellFocus({ navIndex: nextNavigationIndex });
          shellFeature.scheduleNavigationPreview(nextNavigationIndex);
        },
        activateNavigation: function () {
          var index = shellNavigationIndex();
          if (navigationItems[index] && navigationItems[index].kind === 'library') { shellFeature.startNavigationHold(index); }
          else { shellFeature.enterActiveNavigation(); }
        }
      },
      watchlist: {
        available: serverFeature.watchlistAvailable, identity: serverFeature.watchlistIdentity, snapshot: function () { return libraryFeature.watchlistSnapshot(); }, findLocal: function (ratingKey) { return libraryFeature.findWatchlistLocal(ratingKey); },
        load: function (force, callback) { return libraryFeature.loadWatchlist(force, callback); },
        toggle: function (cloudKey, enabled, local, callback) { return libraryFeature.toggleWatchlist(cloudKey, enabled, local, callback); }
      },
      dialogs: {
        openChoice: openChoiceDialog, mediaInfoOpen: function () { return mediaInfoDialogController.snapshot().open; }, openMediaInfo: function (model, origin) { return mediaInfoDialogController.open(model, origin); }, closeMediaInfo: function () { return mediaInfoDialogController.close(); },
        scrollMediaInfo: function (direction) { return mediaInfoDialogController.scroll(direction); }
      },
      state: {
        currentView: function () { return currentView(); }, pointerSelectionActive: function () { return !!(pointerController && pointerController.isSelectionActive()); }, animationsEnabled: function () { return appSettings.interfaceAnimations; },
        animationDuration: function (milliseconds) { return settingsFeature ? settingsFeature.animationDuration(milliseconds) : milliseconds; }
      },
      transitions: {
        enterDetail: function (returnView, item) {
          applicationSession.update({ returnView: returnView, selectedItem: item });
          setAppView('detail');
        },
        hideBrowsingSurfaces: function () {
          shellFeature.hideHomeSurface();
          if (searchFeature) { searchFeature.leave({ keepImages: true, preserveBackgroundAudio: true }); }
          libraryFeature.hidePresentation();
          if (settingsFeature) { settingsFeature.suspend(); }
        },
        restoreOrigin: restoreDetailOrigin, requestPlayback: function () { return playerFeature && playerFeature.open(); },
        onWatchedChanged: updateWatchedAcrossFeatures
      }
    });
    });
    playerFeature = constructOwner(function () {
      return PlayerFeatureController.create({
      platform: { root: root, document: document, storage: root.localStorage },
      modules: {
        PlaybackController: PlaybackController, PlaybackQueueController: PlaybackQueueController, QueueSequenceContract: QueueSequenceContract, BoundedQueueCache: BoundedQueueCache, SeriesQueueProvider: SeriesQueueProvider, PlexContainerQueueProvider: PlexContainerQueueProvider, QueueGapController: QueueGapController, QueueGapView: QueueGapView, PlayerControlsController: PlayerControlsController, PlaybackQueueModel: PlaybackQueueModel, PlayerControlsState: PlayerControlsState, PlayerControlsView: PlayerControlsView, PlayerChaptersView: PlayerChaptersView,
        PlayerBufferingIndicator: PlayerBufferingIndicator, ChapterState: ChapterState, SkipMarkerState: SkipMarkerState, PlaybackClock: PlaybackClock, PlaybackRecovery: PlaybackRecovery, PlaybackStrategy: PlaybackStrategy, PlayerSeekController: PlayerSeekController, PlayerTimelinePolicy: PlayerTimelinePolicy,
        EpisodeNavigation: EpisodeNavigation, ResumeChoice: ResumeChoice, SubtitleSync: SubtitleSync, SubtitleEditorView: SubtitleEditorView, SubtitleOffsetStore: SubtitleOffsetStore, VersionSelection: VersionSelection, MediaInfo: MediaInfo, MediaProfile: MediaProfile, MediaChoiceModel: MediaChoiceModel, ProgressiveImages: ProgressiveImages,
        UpNextState: UpNextState, UpNextTiming: UpNextTiming,
        UpNextView: UpNextView
      },
      data: {
        PlexClient: playerPlexClient, config: config, playbackCapabilities: function () { return playbackCapabilities; }, activeServer: function () { return serverFeature.activeServer(); }, subscribeNetwork: function (listener) { return serverFeature.subscribeNetwork(listener); },
        networkAvailable: function (snapshot) { return snapshot && snapshot.lanAvailable !== false; }
      },
      shell: {
        t: t, element: presentationServices.element, setText: presentationServices.setText, showMessage: shellFeature.showMessage, stopTheme: function () { return shellFeature.stopTheme(); }, artworkUrl: presentationServices.artworkUrl, loadRenderedPoster: shellFeature.loadRenderedPoster,
        posterLoader: function () { return shellFeature.posterLoader(); },
        cancelImages: function (scope) { return shellFeature.cancelImages(scope); }
      },
      detail: {
        snapshot: detailSnapshot, queueSnapshot: function () { return detailFeature ? detailFeature.queueSnapshot() : {}; }, playbackPreferences: function (versionAffinity) { return detailFeature ? detailFeature.playbackPreferences(versionAffinity) : {}; },
        selectedMediaProfile: function () { return detailFeature ? detailFeature.selectedMediaProfile() : null; }, resolvedTracks: function () { return detailFeature ? detailFeature.resolvedTracks() : null; },
        resolvePlaybackTracks: function (playback) { return detailFeature ? detailFeature.resolvePlaybackTracks(playback) : null; }, preferenceSnapshot: function () { return detailFeature ? detailFeature.preferenceSnapshot() : {}; },
        setTrackPreference: function (kind, track, disabled) { return detailFeature && detailFeature.setTrackPreference(kind, track, disabled); }, setPlaybackVersion: function (mediaIndex, partIndex) { return detailFeature && detailFeature.setPlaybackVersion(mediaIndex, partIndex); },
        saveMediaOverride: function () { return detailFeature && detailFeature.saveMediaOverride(); }, applyLocalPlaybackProgress: function (ratingKey, seconds) { return detailFeature && detailFeature.applyLocalPlaybackProgress(ratingKey, seconds); },
        refreshPlaybackState: function (ratingKey, seconds) { return detailFeature && detailFeature.refreshPlaybackState(ratingKey, seconds); },
        setPlaybackContext: function (detail, item, context, seasonIndex, episodeIndex) { return detailFeature && detailFeature.setPlaybackContext(detail, item, context, seasonIndex, episodeIndex); }, setPlaylistContext: function (context, index) { return detailFeature && detailFeature.setPlaylistContext(context, index); },
        queueMediaProfile: function (detail) { return detailFeature && detailFeature.queueMediaProfile(detail); }, renderEpisodeContext: function () { return detailFeature && detailFeature.renderEpisodeContext(); }, openLoaded: function (detail, options) { return detailFeature && detailFeature.openLoaded(detail, options); },
        openItem: function (item) { return openDetail(item); }, setPlayPending: function (pending) { return detailFeature && detailFeature.setPlayPending(pending); }, setFocus: function (focus) { return detailFeature && detailFeature.setFocus(focus); }, leave: function () { return detailFeature && detailFeature.leave(); },
        hideSurface: function () { return detailFeature && detailFeature.hideSurface(); }, showSurface: function (options) { return detailFeature && detailFeature.showSurface(options); },
        resumeAfterPlayer: function (lockedUntil) { return detailFeature && detailFeature.resumeAfterPlayer(lockedUntil); }
      },
      library: {
        snapshot: function () { return libraryFeature ? libraryFeature.snapshot() : {}; }, activeContainer: function () { return libraryFeature ? libraryFeature.activeContainer() : null; }, playbackContext: function () { return libraryFeature ? libraryFeature.playbackContext() : {}; },
        focusedItem: function () { return libraryFeature ? libraryFeature.focusedItem() : null; }, pointerFocus: function (target, index, button) { return libraryFeature && libraryFeature.pointerFocus(target, index, button); },
        restoreContainerOrigin: function (options) { return libraryFeature && libraryFeature.restoreContainerOrigin(options); }
      },
      dialogs: {
        openChoice: function (options) { return choiceDialogController.open(options); }, openMediaInfo: function (model, origin) { return mediaInfoDialogController.open(model, origin); }, closeMediaInfo: function () { return mediaInfoDialogController.close(); },
        mediaInfoOpen: function () { return mediaInfoDialogController.snapshot().open; }, handleMediaInfoKey: function (event, direction) { return mediaInfoDialogController.handleKey(event, direction); },
        scrollMediaInfo: function (direction) { return mediaInfoDialogController.scroll(direction); }
      },
      settings: {
        settings: function () { return appSettings; }, animationDuration: function (milliseconds) { return settingsFeature ? settingsFeature.animationDuration(milliseconds) : milliseconds; }, videoQualityLabel: function (value) { return settingsFeature ? settingsFeature.videoQualityLabel(value) : String(value || ''); },
        playbackPreferenceLabel: function (value) { return settingsFeature ? settingsFeature.playbackPreferenceLabel(value) : String(value || ''); },
        connectionRouteLabel: function () { return settingsFeature ? settingsFeature.connectionRouteLabel() : ''; }
      },
      diagnostics: {
        setError: function (error) { return diagnosticsFeature && diagnosticsFeature.setError(error); }, error: function () { return diagnosticsFeature ? diagnosticsFeature.error() : null; },
        capturePlayback: function () { return diagnosticsFeature && diagnosticsFeature.capturePlayback(); }
      },
      state: {
        currentView: function () { return currentView(); }, setView: setAppView, enterHome: function () { return revealHome({ focus: 'first' }); }, setPlaybackIdentity: function (identity) { return applicationSession.update({ playbackIdentity: identity || null }); }, pointerSelectionActive: function () { return !!(pointerController && pointerController.isSelectionActive()); },
        navigationHasFocus: navigationHasFocus
      }
    });
    });
    inputController = constructOwner(function () {
      return InputController.create({
      InputTargetRouter: InputTargetRouter,
      sessionSnapshot: function () {
        var activeView = currentView();
        var homeFocus = activeView === 'home' ? shellFocusSnapshot() : null;
        var navigationFocused = homeFocus ? homeFocus.area === 'nav' : navigationHasFocus(activeView);
        var playerSnapshot = activeView === 'player' ? playerFeature.snapshot() : {};
        var settingsSnapshot = activeView === 'settings' ? settingsFeature.snapshot() : {};
        var shellNavigation = shellFeature.navigationSnapshot(homeFocus);
        return {
          appView: activeView, choiceDialogOpen: choiceDialogController.snapshot().open, upNextLayoutOpen: activeView === 'settings' && settingsSnapshot.upNext && settingsSnapshot.upNext.open, privacyDialogOpen: activeView === 'settings' && settingsSnapshot.privacyOpen, updateDialogOpen: activeView === 'settings' && settingsSnapshot.updateOpen, viewStateOpen: shellFeature.viewStateOpen(),
          playerMediaInfoOpen: activeView === 'player' && mediaInfoDialogController.snapshot().open, resumeChoiceOpen: activeView === 'player' && playerSnapshot.resumeChoiceOpen, queueGapOpen: activeView === 'player' && playerSnapshot.queueGapOpen, playerErrorOpen: activeView === 'player' && playerSnapshot.errorOpen, subtitleEditorOpen: activeView === 'player' && playerSnapshot.subtitleEditorOpen,
          playerUpNextOpen: activeView === 'player' && !!(playerSnapshot.queue && playerSnapshot.queue.upNext && playerSnapshot.queue.upNext.visible),
          navReorderActive: navigationFocused && shellNavigation.reorderMode, navReorderReady: shellNavigation.reorderReady, navigationHasFocus: navigationFocused, navigationContentEntryFocused: navigationFocused && shellNavigation.index < navigationItems.length, navHoldActive: shellNavigation.holdActive, navHoldTriggered: shellNavigation.holdTriggered, navReorderMode: shellNavigation.reorderMode,
          pageScrollPendingFocus: !!(pointerController && pointerController.snapshot().pageScrollPendingFocus)
        };
      },
      overlays: {
        choiceDialog: function (event, direction) { return choiceDialogController.handleKey(event, direction); }, upNextLayout: function (event) { return settingsFeature.handleUpNextKey(event); }, privacy: function (event) { return settingsFeature.handlePrivacyKey(event); }, viewState: shellFeature.handleViewStateKey,
        queueGap: function (event, direction) { return playerFeature.handleQueueGapKey(event, direction); }, playerMediaInfo: function (event, direction) { return mediaInfoDialogController.handleKey(event, direction); }, resumeChoice: function (event, direction) { return playerFeature.handleResumeKey(event, direction); }, playerError: function (event, direction) { return playerFeature.handleErrorKey(event, direction); },
        subtitleEditor: function (event, direction) { return playerFeature.handleSubtitleEditorKey(event, direction); }
      },
      domains: {
        queueCapture: function (event) { return playerFeature.handleQueueCapture(event); }, playerQueue: function (event, direction) { return playerFeature.handleQueueKey(event, direction); }, playerControls: function (event, direction) { return playerFeature.handleControlsKey(event, direction); },
        setup: function (event) { return setupFeature.handleKey(event); }, diagnostics: function (event, direction) { return diagnosticsFeature.handleKey(event, direction); }, settings: function (event, direction) { return settingsFeature.handleKey(event, direction); },
        detail: function (event, direction) { return detailFeature.handleKey(event, direction); }, library: function (event, direction) { return libraryFeature.handleKey(event, direction); }, watchlist: function (event, direction) { return libraryFeature.handleKey(event, direction); },
        search: function (event, direction) { return searchFeature.handleKey(event, direction); }, home: function (event, direction) { return shellFeature.handleHomeKey(event, direction); },
        resetSeekRepeat: function () { playerFeature.resetSeekRepeat(); }
      },
      navigation: {
        moveReorderedLibrary: shellFeature.moveReorderedLibrary, finishReorder: shellFeature.finishReorder, markReorderReady: shellFeature.markReorderReady, cancelHold: shellFeature.cancelNavigationHold,
        enterActiveView: shellFeature.enterActiveNavigation
      },
      lifecycle: {
        clearWheelNavigation: function () { if (pointerController) { pointerController.clearWheelNavigation(); } }, syncPageScrollFocus: function () { if (pointerController) { pointerController.syncPageFocus(); } },
        clearPageScrollPendingFocus: function () { if (pointerController) { pointerController.clearPageScrollPendingFocus(); } }
      }
    });
    });
    pointerController = constructOwner(function () {
      return PointerController.create({
      root: root, document: document,
      sessionSnapshot: function () {
        var activeView = currentView();
        var controls = activeView === 'player' ? playerFeature.controlsSnapshot() : {};
        var playerSnapshot = activeView === 'player' ? playerFeature.snapshot() : {};
        var settingsSnapshot = activeView === 'settings' ? settingsFeature.snapshot() : {};
        var librarySnapshot = activeView === 'library' || activeView === 'watchlist' ? libraryFeature.snapshot() : {};
        var libraryState = librarySnapshot.library || {};
        var watchlistState = librarySnapshot.watchlist || {};
        var searchState = activeView === 'search' ? searchFeature.snapshot() : {};
        var searchFocus = searchState.focus || {};
        var homeFocus = activeView === 'home' ? shellFocusSnapshot() : null;
        var shellNavigation = shellFeature.navigationSnapshot(homeFocus);
        return {
          appView: activeView, homeArea: homeFocus ? homeFocus.area : '', libraryZone: libraryState.zone, libraryViewKey: libraryState.viewKey, watchlistZone: watchlistState.zone, searchZone: searchFocus.zone, serverEditorOpen: activeView === 'settings' && !!(serverFeature && serverFeature.editorSnapshot().open),
          languageKind: activeView === 'settings' ? settingsSnapshot.languageKind : '', summaryDialogOpen: activeView === 'detail' && detailFeature.summaryOpen(), navigationHasFocus: homeFocus ? homeFocus.area === 'nav' : navigationHasFocus(activeView), navReorderMode: shellNavigation.reorderMode, navReorderReady: shellNavigation.reorderReady, navHoldTriggered: shellNavigation.holdTriggered,
          choiceDialogOpen: choiceDialogController.snapshot().open, privacyDialogOpen: activeView === 'settings' && settingsSnapshot.privacyOpen, updateDialogOpen: activeView === 'settings' && settingsSnapshot.updateOpen, resumeChoiceOpen: activeView === 'player' && playerSnapshot.resumeChoiceOpen, queueGapOpen: activeView === 'player' && playerSnapshot.queueGapOpen, subtitleEditorOpen: activeView === 'player' && playerSnapshot.subtitleEditorOpen, playerControlsMode: controls.mode, playerChapterOpen: !!(controls.chapter && controls.chapter.open),
          playerSettingsOpen: controls.settingsOpen
        };
      },
      wheelBehavior: function () { return appSettings.wheelBehavior; }, inputKey: function (event) { inputController.handleKeyDown(event); },
      inputPress: function (event) { inputController.handleKeyDown(event); inputController.handleKeyUp(event); },
      capture: {
        focus: function (button, session) { return playerFeature.pointerCaptureFocus(button, session); },
        click: function (event, button, session) { return playerFeature.pointerCaptureClick(event, button, session); }
      },
      focus: {
        subtitleEditor: function (button) { return playerFeature.pointerSubtitleFocus(button); }, diagnostics: function (index) { diagnosticsFeature.focusAction(index); }, resume: function (index) { return playerFeature.pointerFocus('resume', index); }, setup: function (button) { setupFeature.focusButton(button); },
        navigation: function (index, view) {
          setShellFocus({ area: 'nav', navIndex: index });
          if (view === 'detail') { detailFeature.focusNavigation(); }
          else if (view === 'search') { searchFeature.focusNavigation(index); }
          else if (view === 'library' || view === 'watchlist') { libraryFeature.focusNavigation(); }
          else if (view === 'settings') { settingsFeature.focusNavigation(); }
          else if (view === 'home') { shellFeature.updateFocus(); }
        },
        home: function (row, column) { setShellFocus({ area: 'media', rowIndex: row, column: column }); shellFeature.updateFocus(); },
        detail: function (zone, index) {
          detailFeature.pointerFocus(zone, index);
        },
        settings: function (index) { settingsFeature.focusSetting(index); }, updateDialog: function (index) { settingsFeature.focusUpdate(index); }, privacy: function (button) { settingsFeature.focusPrivacy(button); }, language: function (index) { settingsFeature.focusLanguage(index); }, server: function (index) { if (serverFeature) { serverFeature.focusEditor(index); } },
        search: function (button) { searchFeature.pointerFocus(button); }, library: function (zone, index, button) { libraryFeature.pointerFocus(zone, index, button); }, libraryFilter: function (button) { libraryFeature.pointerFocus('library-filter', 0, button); },
        watchlist: function (button) { libraryFeature.pointerFocus('watchlist', 0, button); }, player: function (zone, index) { return playerFeature.pointerFocus(zone, index); },
        choice: function (index) { choiceDialogController.pointerFocus(index); }
      },
      selectAccent: function (color) { settingsFeature.selectAccentColor(color); },
      navigation: {
        startHold: shellFeature.startNavigationHold, cancelHold: shellFeature.cancelNavigationHold, markReorderReady: shellFeature.markReorderReady,
        finishReorder: shellFeature.finishReorder
      },
      page: {
        restoreHome: function (row, column) { setShellFocus({ area: 'media', rowIndex: row, column: column }); }, restoreLibrary: function (button) { libraryFeature.restorePageFocus('library', button); }, restoreWatchlist: function (button) { libraryFeature.restorePageFocus('watchlist', button); },
        restoreSearch: function (index) { searchFeature.restoreResultFocus(index); }, restoreServer: function (index) { if (serverFeature) { serverFeature.focusEditor(index); } }, restoreLanguage: function (index) { settingsFeature.focusLanguage(index); },
        restoreSettings: function (index) { settingsFeature.focusSetting(index); }, scrollSummary: function (direction) { detailFeature.scrollSummary(direction); },
        beginLibraryWheel: function (duration) { libraryFeature.onWheelNavigation(duration); }
      },
      player: {
        playbackSnapshot: function () { return playerFeature.playbackSnapshot(); }, activity: function () { return playerFeature.pointerActivity(); }, renewControls: function () { return playerFeature.pointerActivity(); }, seekTimeline: function (seconds) { return playerFeature.pointerSeek(seconds); },
        settingRows: function () { return playerFeature.settingRows(); },
        settingIndex: function () { return playerFeature.settingIndex(); }
      }
    });
    });
    function t(key, parameters) { return presentationServices.t(key, parameters); }
    function hideDetailMetadataStatus() {
      if (detailFeature) { detailFeature.hideMetadataStatus(); }
    }
    function showDetailMetadataStatus(text, temporary) {
      if (detailFeature) { detailFeature.showMetadataStatus(text, temporary); }
    }
    // Search presentation, provider transport, focus, and request lifecycle are owned vertically.
    searchFeature = constructOwner(function () {
      return SearchFeatureController.create({
      root: root, document: document, SearchController: SearchController, SearchModel: SearchModel, SearchView: PloffSearchView, SearchSession: SearchSession, T9Input: T9Input, PlexClient: searchPlexClient, WatchlistClient: WatchlistClient, config: config, navigationItems: function () { return navigationItems; },
      allowsCloud: function () { return serverFeature.allowsCloud(); }, accountToken: serverFeature.watchlistAccountToken, provider: function () { return libraryFeature.watchlistProvider(); },
      ensureProvider: function (callback) {
        return libraryFeature.ensureWatchlistProvider(callback);
      },
      t9Enabled: function () { return appSettings.searchT9Input; }, navigationCount: shellFeature.navigationFocusCount, navTarget: function (index) { return document.querySelector(shellFeature.selectorForNavIndex(index)); },
      onNavigationChange: function (index) {
        setShellFocus({ navIndex: index });
        shellFeature.renderNavigation();
        shellFeature.scheduleNavigationPreview(index);
      },
      onActivateNavigation: function (index) {
        setShellFocus({ navIndex: index });
        if (navigationItems[index] && navigationItems[index].kind === 'library') { shellFeature.startNavigationHold(index); }
        else { shellFeature.enterActiveNavigation(); }
      },
      onOpenResult: openDetail, onBack: function () { transitionToHome('preserve'); }, onBackdrop: shellFeature.scheduleSearchBackdrop, onFocusItem: function (item) { shellFeature.scheduleTheme(item); }, clearFocus: shellFeature.clearLogicalFocus,
      pointerSelectionActive: function () { return !!(pointerController && pointerController.isSelectionActive()); }, prioritizePoster: shellFeature.prioritizePoster, mediaTitle: presentationServices.mediaTitle, mediaCardMeta: presentationServices.mediaCardMeta, mediaCardDetail: presentationServices.mediaCardDetail,
      cardMetrics: shellFeature.cardMetrics, cardProfile: shellFeature.cardProfile, renderedPosterSpecification: shellFeature.renderedPosterSpecification, fixedPosterSpecification: shellFeature.fixedPosterSpecification, posterLoader: shellFeature.posterLoader(), playItem: playHomeItem, stopBackgroundAudio: shellFeature.stopTheme, cancelImages: function () { shellFeature.cancelImages('search'); },
      isActive: function () { return currentView() === 'search'; }, element: presentationServices.element,
      t: t
    });
    });
    function revealHome(options) { return shellFeature.enterHome(options); }
    function openSearch(keepNavigationFocus) {
      setAppView('search');
      shellFeature.hideHomeSurface();
      libraryFeature.hidePresentation();
      settingsFeature.suspend();
      if (detailFeature) { detailFeature.hideSurface(); }
      shellFeature.renderNavigation();
      searchFeature.enter({ keepNavigationFocus: keepNavigationFocus, navigationIndex: shellNavigationIndex() });
    }
    // Library, playlist, collection, and Watchlist orchestration is owned by LibraryFeatureController.
    function activate() {
      var focus = shellFocusSnapshot();
      var item;
      if (focus.area === 'nav') {
        shellFeature.enterActiveNavigation();
        return;
      }
      item = shellFeature.rows()[focus.rowIndex].items[focus.column];
      if (item.ratingKey) {
        openDetail(item);
      } else {
        shellFeature.showMessage(t('status.opening', { title: presentationServices.mediaTitle(item) }));
      }
    }
    function navigationHasFocus(view) {
      var activeView = String(view || currentView());
      if (activeView === 'home') { return shellFocusSnapshot().area === 'nav'; }
      if (activeView === 'library' || activeView === 'watchlist') { return libraryFeature.navigationHasFocus(); }
      if (activeView === 'search') { return searchFeature.hasNavigationFocus(); }
      if (activeView === 'settings') { return settingsFeature.snapshot().zone === 'nav'; }
      if (activeView === 'detail') { return detailSnapshot().zone === 'nav'; }
      return false;
    }
    function navigationViewMatches(item) {
      if (!item) { return false; }
      if (item.kind === 'home') { return currentView() === 'home'; }
      if (item.kind === 'library' || item.kind === 'watchlist' || item.kind === 'playlists') { return libraryFeature.matchesNavigation(item); }
      if (item.kind === 'search') { return currentView() === 'search'; }
      if (item.kind === 'settings') { return currentView() === 'settings'; }
      return false;
    }
    function focusCurrentNavigation() {
      var index = shellNavigationIndex();
      setShellFocus({ area: 'nav' });
      if (currentView() === 'home') { shellFeature.updateFocus(); }
      else if (currentView() === 'library' || currentView() === 'watchlist') { libraryFeature.focusNavigation(); }
      else if (currentView() === 'search') { searchFeature.focusNavigation(index); }
      else if (currentView() === 'settings') { settingsFeature.focusNavigation(); }
      else if (currentView() === 'detail') { detailFeature.focusNavigation(); }
    }
    function transitionToHome(focus) {
      if (currentView() === 'search') { searchFeature.leave(); }
      else if (currentView() === 'library' || currentView() === 'watchlist') { libraryFeature.leave(); }
      else if (currentView() === 'settings') { settingsFeature.leave(); }
      revealHome({ focus: focus || 'preserve' });
    }
    function commitNavigationView(item, targetIndex, keepNavigationFocus) {
      if (currentView() === 'search') { searchFeature.leave(); }
      else if (currentView() === 'library' || currentView() === 'watchlist') { libraryFeature.leave(); }
      else if (currentView() === 'detail') { detailFeature.leave(); }
      else if (currentView() === 'settings') { settingsFeature.leave(); }
      setShellFocus({ area: 'nav', navIndex: targetIndex });
      if (item.kind === 'home') { revealHome({ focus: keepNavigationFocus ? 'nav' : 'first' }); }
      else if (item.kind === 'library') { libraryFeature.enterLibrary(item, { navigationIndex: targetIndex, keepNavigationFocus: keepNavigationFocus }); }
      else if (item.kind === 'watchlist') { libraryFeature.enterWatchlist({ navigationIndex: targetIndex, keepNavigationFocus: keepNavigationFocus }); }
      else if (item.kind === 'playlists') { libraryFeature.enterPlaylists({ navigationIndex: targetIndex, keepNavigationFocus: keepNavigationFocus }); }
      else if (item.kind === 'search') { openSearch(keepNavigationFocus); }
      else if (item.kind === 'settings') { settingsFeature.enter({ keepNavigationFocus: keepNavigationFocus }); }
      libraryFeature.scheduleAdjacentPrefetch(shellNavigationIndex(), navigationItems);
    }
    function enterNavigationContent(item, _index) {
      if (!item) { return; }
      if (item.kind === 'home') { shellFeature.focusHomeStart(); }
      else if (item.kind === 'library' || item.kind === 'watchlist' || item.kind === 'playlists') { libraryFeature.enterActiveContent(item.kind); }
      else if (item.kind === 'search') { searchFeature.focusKeyboard(0, 0); }
      else if (item.kind === 'settings') { settingsFeature.focusSetting(0); }
    }
    // Shared application presentation helpers used by the modular settings controller.
    function openChoiceDialog(title, choices, selectedValue, apply, returnFocus) {
      return choiceDialogController.open({
        title: title, choices: choices, selectedValue: selectedValue, apply: apply,
        returnFocus: returnFocus
      });
    }
    function closeApplication() {
      if (root && typeof root.close === 'function') { root.close(); return; }
      if (root && root.PalmSystem && typeof root.PalmSystem.platformBack === 'function') { root.PalmSystem.platformBack(); return; }
      if (root && root.webOS && typeof root.webOS.platformBack === 'function') { root.webOS.platformBack(); }
    }
    function requestApplicationExit() {
      return choiceDialogController.open({
        title: t('app.exitConfirm'),
        choices: [{ value: 'exit', label: t('app.exit') }],
        selectedValue: 'exit',
        variant: 'full-screen',
        apply: function (choice) {
          if (!choice || choice.value !== 'exit') { return; }
          closeApplication();
        },
        returnFocus: function () { if (shellFeature) { shellFeature.focusHomeStart(); } }
      });
    }
    settingsFeature = constructOwner(function () {
      return SettingsFeatureController.create({
      platform: {
        root: root, document: document,
        credentialStorage: credentialStorage
      },
      modules: {
        SettingsController: SettingsController, Settings: Settings, SettingsCatalog: SettingsCatalog, SettingsView: SettingsView, I18n: I18n, CardLayout: CardLayout, VersionSelection: VersionSelection, ServerStore: ServerStore, ServerDiscovery: ServerDiscovery,
        UpNextLayoutDialog: UpNextLayoutDialog
      },
      state: {
        getSettings: function () { return appSettings; }, setSettings: function (next) { appSettings = next; },
        publishSettings: function (next) { applicationSession.update({ settings: next }); }
      },
      presentation: {
        t: t, element: presentationServices.element, setText: presentationServices.setText, clearFocus: shellFeature.clearLogicalFocus,
        pointerActive: function () { return !!(pointerController && pointerController.isSelectionActive()); }
      },
      shell: {
        navigationIndex: shellNavigationIndex, setNavigationIndex: function (index) { setShellFocus({ navIndex: index }); }, navigationCount: shellFeature.navigationFocusCount, navigationTarget: function (navIndex) { return document.querySelector(shellFeature.selectorForNavIndex(navIndex)); },
        renderNavigation: shellFeature.renderNavigation, scheduleNavigationPreview: shellFeature.scheduleNavigationPreview,
        activateNavigation: function () {
          var index = shellNavigationIndex();
          if (navigationItems[index] && navigationItems[index].kind === 'library') { shellFeature.startNavigationHold(index); }
          else { shellFeature.enterActiveNavigation(); }
        },
        applyCardScale: shellFeature.applyCardScale, translateStaticUi: shellFeature.translateStaticUi,
        clearBackdrop: shellFeature.clearBackdrop,
        refreshCardsForCurrentView: function () {
          if (currentView() === 'home') { shellFeature.renderRows(); shellFeature.updateFocus(); }
          else if (currentView() === 'search') { searchFeature.refresh(); }
          else if (currentView() === 'library' || currentView() === 'watchlist') { libraryFeature.refreshPresentation(); }
        },
        applyNavigationVisibility: shellFeature.applyNavigationVisibility, markHomeDirty: function () { shellFeature.markHomeDirty(); },
        stopBackgroundAudio: function () { shellFeature.stopTheme(); }
      },
      server: {
        config: function () { return config; }, active: function () { return serverFeature.activeServer(); }, discoveryActive: function () { return !!(serverFeature && serverFeature.snapshot().discoveryActive); }, editorSnapshot: function () { return serverFeature ? serverFeature.editorSnapshot() : { open: false, index: 0 }; },
        renderEditor: function () { if (serverFeature) { serverFeature.renderEditor(); } }, openEditor: function () { if (serverFeature) { serverFeature.openEditor(); } }, closeEditor: function () { if (serverFeature) { serverFeature.closeEditor(); } },
        focusEditor: function (index) { if (serverFeature) { serverFeature.focusEditor(index); } },
        activateEditor: function () { if (serverFeature) { serverFeature.activateEditor(); } }
      },
      account: {
        activeProfileTitle: shellFeature.activeProfileTitle, connected: function () { return !!serverFeature.ownerToken(); }, disconnect: function () { serverFeature.disconnect(); },
        deleteLocalData: function () { serverFeature.deleteLocalData(); }
      },
      dialogs: {
        openChoice: openChoiceDialog, openDiagnostics: function () { diagnosticsFeature.enter(); },
        openProfileManager: openProfileManager
      },
      environment: {
        networkSnapshot: function () { return serverFeature.networkSnapshot(); }, playbackCapabilities: function () { return playbackCapabilities; }, languageCatalog: languageCatalog,
        accentColorValues: accentColorValues,
        appVersion: BuildInfo.version,
        releaseStatusSnapshot: function () { return releaseStatus ? releaseStatus.snapshot() : {}; },
        checkForUpdates: function (force, callback) { return releaseStatus ? releaseStatus.check(force === true, callback) : false; }
      },
      transitions: {
        enter: function () {
          setAppView('settings');
          shellFeature.hideHomeSurface();
          searchFeature.leave({ keepImages: true });
          libraryFeature.hidePresentation();
          if (detailFeature) { detailFeature.hideSurface(); }
          if (diagnosticsFeature) { diagnosticsFeature.suspend(); }
        },
        leave: function () {},
        home: transitionToHome
      }
    });
    });
    // Onboarding and profile selection lifecycle. Plex/server transport stays injected.
    setupFeature = constructOwner(function () {
      return SetupFeatureController.create({
      platform: { root: root, document: document },
      modules: {
        SetupController: SetupController, SetupView: SetupView, SetupFocus: SetupFocus, SetupScanIndicator: SetupScanIndicator,
        SetupAuthSession: SetupAuthSession
      },
      presentation: {
        t: t, setText: presentationServices.setText, element: presentationServices.element,
        pointerActive: function () { return !!(pointerController && pointerController.isSelectionActive()); }
      },
      state: {
        isActive: function () { return currentView() === 'setup'; }
      },
      settings: {
        get: function () { return appSettings; },
        setSetupLanguage: function (language, explicit) { return settingsFeature.setSetupLanguage(language, explicit); }
      },
      language: {
        available: setupUiLanguages, detect: function (supported, callback) { return DeviceLocale.detect(root, supported, callback); },
        select: function (language) { return settingsFeature.setSetupLanguage(language, true); }
      },
      server: {
        servers: function () { return serverFeature.servers(); }, active: function () { return serverFeature.activeServer(); }, apiBaseUrl: function () { return config.apiBaseUrl || ''; },
        scan: function (snapshot, callback) {
          return serverFeature.discover(function (servers) { callback(null, servers); });
        },
        normalizeManualAddress: function (value) { return serverFeature.normalizeManualAddress(value); }, probeManualAddress: function (uri, callback) { return serverFeature.probeManualAddress(uri, callback); },
        shouldOfferConnection: function (localUri, enteredUri) {
          return serverFeature.shouldOfferConnection(localUri, enteredUri);
        }
      },
      account: {
        authSnapshot: function () { return serverFeature.authSnapshot(); }, profiles: function () { return serverFeature.profiles(); }, ownerToken: function () { return serverFeature.ownerToken(); }, createPin: function (purpose, callback) { return serverFeature.createPin(purpose, callback); },
        pollPin: function (pinId, callback) { return serverFeature.pollPin(pinId, callback); }, loadAccountServers: function (ownerToken, callback) { return serverFeature.loadAccountServers(ownerToken, callback); }, loadProfiles: function (ownerToken, callback) { return serverFeature.loadProfiles(ownerToken, callback); },
        switchProfile: function (profile, pin, callback) {
          var snapshot = setupFeature.snapshot();
          return serverFeature.switchProfile(profile, pin, {
            selectedServer: snapshot.selectedServer || serverFeature.activeServer(), preferredConnectionUri: snapshot.preferredConnectionUri, profiles: snapshot.profiles,
            isActive: function () { return currentView() === 'setup'; }
          }, callback);
        },
        continueOffline: function () { serverFeature.continueOffline(); },
        disconnect: function () { serverFeature.disconnect(); }
      },
      transitions: {
        activate: function () { setAppView('setup'); }, completeStartup: shellFeature.completeStartup, finish: function (snapshot) { finishSetup(snapshot); },
        cancel: function (snapshot) { cancelSetup(snapshot); }
      }
    });
    });
    function finishSetup(snapshot) {
      var destination = snapshot.returnView;
      if (snapshot.selectedServer) { serverFeature.applyServer(snapshot.selectedServer); }
      else if (serverFeature.activeServer()) { serverFeature.applyServer(serverFeature.activeServer()); }
      shellFeature.renderActiveProfile();
      if (destination === 'settings') {
        setAppView('settings'); settingsFeature.refresh(); serverFeature.loadApplication();
      } else {
        revealHome({ focus: 'first', refresh: false });
        serverFeature.loadApplication(); serverFeature.discover();
      }
    }
    function cancelSetup(snapshot) {
      var destination = snapshot.returnView;
      restoreSetupReturnView(destination);
    }
    function restoreSetupReturnView(destination) {
      setAppView(destination || 'home');
      if (currentView() === 'settings') { settingsFeature.refresh(); }
      else if (currentView() === 'search') { searchFeature.refreshFocus(); }
      else if (currentView() === 'library') { libraryFeature.refreshPresentation(); }
      else if (currentView() === 'detail') { detailFeature.updateFocus(); }
      else {
        revealHome({ focus: 'preserve', refresh: false });
      }
    }
    function openSetup() { return setupFeature.openFirstRun(); }
    function openProfileManager() { return setupFeature.openProfiles(currentView()); }
    function openManualSetup() { return setupFeature.openManual('settings'); }

    diagnosticsFeature = constructOwner(function () {
      return DiagnosticsFeatureController.create({
      platform: { root: root, document: document },
      modules: {
        DiagnosticsController: DiagnosticsController, DiagnosticsState: DiagnosticsState,
        DiagnosticsView: DiagnosticsView
      },
      presentation: {
        t: t, element: presentationServices.element, setText: presentationServices.setText, formatFileSize: function (bytes) { return MediaProfile.detailedSize(bytes, t('player.unavailable')); }, formatLongTime: formatLongTime, formatTime: formatTime,
        pointerActive: function () { return !!(pointerController && pointerController.isSelectionActive()); }
      },
      state: {
        appVersion: function () { return authOptions.version; }, config: function () { return config; }, activeServer: function () { return serverFeature.activeServer(); }, serverAddresses: function (server) { return serverFeature.addressesFor(server, false); }, authMode: function () { return serverFeature.authMode(); },
        activeProfile: function () { return serverFeature.activeProfile(); }, playbackCapabilities: function () { return playbackCapabilities; }, networkSnapshot: function () { return serverFeature.networkSnapshot(); }, playbackSnapshot: function () { return playerFeature ? playerFeature.playbackSnapshot() : null; },
        playbackDiagnostics: function () { return playerFeature ? playerFeature.playbackDiagnostics() : null; }
      },
      transport: {
        loadIdentity: function (callback) { return serverFeature.loadServerIdentity(callback); }
      },
      transitions: {
        enter: function () {
          setAppView('diagnostics');
          shellFeature.stopTheme();
          settingsFeature.suspend();
        },
        leave: function () {
          setAppView('settings');
          settingsFeature.resume({ focusLast: true });
        }
      }
    });
    });
    // Media detail, seasons, episodes, preferences, and metadata refresh.
    function mediaPreferenceIdentity(detail) {
      var identity = serverFeature.mediaIdentity();
      return MediaPreferences ? MediaPreferences.key(identity.server, identity.profile, detail) : '';
    }
    function openDetail(item) {
      return detailFeature && detailFeature.open(item, { returnView: currentView() });
    }
    function playHomeItem(item) {
      return detailFeature && detailFeature.playItem(item);
    }
    // Global input dispatch, view closure, event wiring, Home loading, bootstrap.
    function updateWatchedAcrossFeatures(ratingKey, watched) {
      shellFeature.updateWatched(ratingKey, watched);
      if (libraryFeature.activeLibrary()) { libraryFeature.probeContinue(); }
    }
    function restoreDetailOrigin(returnView) {
      var returnToSearch = returnView === 'search';
      var returnToLibrary = returnView === 'library';
      var returnToWatchlist = returnView === 'watchlist';
      setAppView(returnToSearch ? 'search' : (returnToLibrary ? 'library' : (returnToWatchlist ? 'watchlist' : 'home')));
      if (returnToSearch) {
        shellFeature.hideHomeSurface();
        searchFeature.resume();
      } else if (returnToLibrary || returnToWatchlist) {
        shellFeature.hideHomeSurface();
        libraryFeature.recoverPresentation();
      } else {
        revealHome({ focus: 'preserve' });
      }
    }
    function recoverActiveViewAfterNetwork() {
      if (currentView() === 'home') { shellFeature.refreshHome(); }
      else if (currentView() === 'library' || currentView() === 'watchlist') { libraryFeature.reloadCurrent(true); }
      else if (currentView() === 'search') { searchFeature.retryAfterNetwork(); }
      else if (currentView() === 'detail') { detailFeature.recoverAfterNetwork(); }
    }
    function destroy() {
      if (destroyed) { return; }
      destroyed = true;
      destroyOwned();
    }
    try {
      shellFeature.start();
      settingsFeature.applyAccentColor();
      settingsFeature.applyAnimationPreference();
      constructOwner(function () {
        return ApplicationEvents.bind([
        { target: document, name: 'keydown', handler: inputController.handleKeyDown },
        { target: document, name: 'mouseover', handler: pointerController.handleOver },
        { target: document, name: 'mousemove', handler: pointerController.handleMove },
        { target: document, name: 'wheel', handler: pointerController.handleWheel, options: { passive: false } },
        { target: document, name: 'mousewheel', handler: pointerController.handleWheel, options: { passive: false } },
        { target: document, name: 'mousedown', handler: pointerController.handleDown },
        { target: document, name: 'mouseup', handler: pointerController.handleUp },
        { target: document, name: 'click', handler: pointerController.handleClick, options: true },
        { target: document.getElementById('up-next-layout-dialog'), name: 'click', handler: settingsFeature.handleUpNextLayoutClick },
        { target: document.getElementById('up-next-layout-cancel'), name: 'click', handler: settingsFeature.cancelUpNext },
        { target: document.getElementById('up-next-layout-apply'), name: 'click', handler: settingsFeature.applyUpNext },
        { target: document, name: 'keyup', handler: inputController.handleKeyUp },
        { target: document, name: 'visibilitychange', handler: shellFeature.onVisibilityChange },
        { target: root, name: 'resize', handler: shellFeature.onResize }
      ]);
      });
      DeviceCapabilities.detect(root, function (capabilities) {
        if (!destroyed) { playbackCapabilities = capabilities; }
      });
      serverFeature.bootstrap();
    } catch (error) {
      if (!destroyed) { failConstruction(error); }
      throw error;
    }
    return {
      destroy: destroy, session: function () { return applicationSession.snapshot(); },
      view: function () { return currentView(); }
    };
  }
  return { create: create };
}));
