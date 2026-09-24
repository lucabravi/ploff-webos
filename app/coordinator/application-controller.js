(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.PloffApplicationController = factory(); }
}(this, function () {
  'use strict';
  var ASS_GLYPH_WARM_DELAY_MS = 200;
  var ADJACENT_LIBRARY_PREFETCH_DELAY_MS = 2500;
  var HOME_ARTWORK_PREVIEW_WATCHDOG_MS = 5000;

  function create(root, document, credentialStorage, startupMetrics) {
    'use strict';
    var FocusModel = root.PloffFocusModel,
      NavigationModel = root.PloffNavigationModel,
      HomeState = root.PloffHomeState,
      ActivityState = root.PloffActivityState,
      NavbarWindow = root.PloffNavbarWindow,
      NavigationIcon = root.PloffNavigationIcon,
      ViewState = root.PloffViewState,
      CardLayout = root.PloffCardLayout,
      MediaLabels = root.PloffMediaLabels,
      ProgressiveImages = root.PloffProgressiveImages,
      BackgroundAudio = root.PloffBackgroundAudio,
      I18n = root.PloffI18n,
      LocaleBootstrap = root.PloffLocaleBootstrap,
      PresentationServices = root.PloffPresentationServices,
      ShellController = root.PloffShellController,
      ShellFeatureController = root.PloffShellFeatureController;
    var SearchModel = root.PloffSearchModel,
      PloffSearchView = root.PloffSearchView,
      T9Input = root.PloffT9Input,
      SearchSession = root.PloffSearchSession,
      SearchController = root.PloffSearchController,
      SearchFeatureController = root.PloffSearchFeatureController;
    var LibraryFilterView = root.PloffLibraryFilterView,
      PloffLibraryGridView = root.PloffLibraryGridView,
      LibraryLifecycle = root.PloffLibraryLifecycle,
      LibraryContainers = root.PloffLibraryContainers,
      LibraryController = root.PloffLibraryController,
      LibraryTabPrefetch = root.PloffLibraryTabPrefetch,
      LibraryFeatureController = root.PloffLibraryFeatureController,
      LibrarySource = root.PloffLibrarySource,
      LibraryTabStore = root.PloffLibraryTabStore,
      LibrarySourceCatalog = root.PloffLibrarySourceCatalog,
      LibrarySourcesController = root.PloffLibrarySourcesController,
      PlexSourceRouter = root.PloffPlexSourceRouter,
      MediaSourceResolver = root.PloffMediaSourceResolver,
      MultiServerMedia = root.PloffMultiServerMedia,
      MultiServerContentController = root.PloffMultiServerContentController,
      WatchlistClient = root.PloffWatchlistClient,
      WatchlistState = root.PloffWatchlistState,
      WatchlistView = root.PloffWatchlistView;
    var DetailEpisodeView = root.PloffDetailEpisodeView,
      DetailExtendedView = root.PloffDetailExtendedView,
      DetailNavigation = root.PloffDetailNavigation,
      DetailPresentationView = root.PloffDetailPresentationView,
      DetailPreferenceState = root.PloffDetailPreferenceState,
      MediaSourcePreference = root.PloffMediaSourcePreference,
      DetailController = root.PloffDetailController,
      DetailFeatureController = root.PloffDetailFeatureController,
      MetadataRefresh = root.PloffMetadataRefresh,
      MediaPreferences = root.PloffMediaPreferences,
      MediaProfile = root.PloffMediaProfile,
      MediaChoiceModel = root.PloffMediaChoiceModel,
      MediaInfo = root.PloffMediaInfo;
    var ChoiceDialogView = root.PloffChoiceDialogView,
      ChoiceDialogController = root.PloffChoiceDialogController,
      MediaInfoView = root.PloffMediaInfoView,
      MediaInfoDialogController = root.PloffMediaInfoDialogController;
    var UpNextLayoutDialog = root.PloffUpNextLayoutDialog;
    var VersionSelection = root.PloffVersionSelection,
      PlaybackQueueModel = root.PloffPlaybackQueueModel,
      PlayerTimelinePolicy = root.PloffPlayerTimelinePolicy,
      SubtitleSeriesOffset = root.PloffSubtitleSeriesOffset,
      AssSubtitleRenderer = root.PloffAssSubtitleRenderer,
      AssSubtitleRendererPool = root.PloffAssSubtitleRendererPool,
      AssSubtitlePrefetch = root.PloffAssSubtitlePrefetch;
    var PlaybackCompatibilityMemory = root.PloffPlaybackCompatibilityMemory;
    var DiagnosticsState = root.PloffDiagnosticsState,
      RuntimeErrorStore = root.PloffRuntimeErrorStore,
      DiagnosticsView = root.PloffDiagnosticsView,
      DiagnosticsSupportRuntimeLoader = root.PloffDiagnosticsSupportRuntimeLoader,
      DiagnosticsController = root.PloffDiagnosticsController,
      DiagnosticsFeatureController = root.PloffDiagnosticsFeatureController;
    var Settings = root.PloffSettings,
      SettingsSchema = root.PloffSettingsSchema,
      LocalData = root.PloffLocalData,
      SettingsBackupFormat = root.PloffSettingsBackupFormat,
      PlexSettingsBackupStore = root.PloffPlexSettingsBackupStore,
      SettingsCatalog = root.PloffSettingsCatalog,
      SettingsView = root.PloffSettingsView,
      SafeAreaDialog = root.PloffSafeAreaDialog,
      SubtitleStyleDialog = root.PloffSubtitleStyleDialog,
      TextInputDialog = root.PloffTextInputDialog,
      LibraryTabsEditor = root.PloffLibraryTabsEditor,
      SettingsController = root.PloffSettingsController,
      SettingsFeatureController = root.PloffSettingsFeatureController;
    var SetupView = root.PloffSetupView,
      SetupScanIndicator = root.PloffSetupScanIndicator,
      SetupFocus = root.PloffSetupFocus,
      SetupAuthSession = root.PloffSetupAuthSession,
      SetupController = root.PloffSetupController,
      SetupFeatureController = root.PloffSetupFeatureController;
    var ServerController = root.PloffServerController,
      ServerFeatureController = root.PloffServerFeatureController,
      ServerEditorView = root.PloffServerEditorView,
      AuthStore = root.PloffAuthStore,
      PlexAuth = root.PloffPlexAuth,
      ServerStore = root.PloffServerStore,
      ServerDiscovery = root.PloffServerDiscovery,
      NetworkState = root.PloffNetworkState,
      NetworkPolicy = root.PloffNetworkPolicy,
      NetworkTransition = root.PloffNetworkTransition;
    var PlexClient = root.PloffClient,
      PlexFeaturePorts = root.PloffPlexFeaturePorts,
      DeviceCapabilities = root.PloffDeviceCapabilities,
      DeviceLocale = root.PloffDeviceLocale,
      ApplicationEvents = root.PloffApplicationEvents,
      ApplicationSession = root.PloffApplicationSession,
      InputTargetRouter = root.PloffInputTargetRouter,
      InputCommandRouter = root.PloffInputCommandRouter,
      InputController = root.PloffInputController,
      PointerController = root.PloffPointerController,
      MediaContextController = root.PloffMediaContextController,
      ReleaseStatus = root.PloffReleaseStatus,
      BuildInfo = root.PloffBuildInfo || { version: 'development' };
    var formatTime = PlayerTimelinePolicy.formatTime;
    var formatLongTime = PlayerTimelinePolicy.formatLongTime;
    var config = root.PloffConfig || {};
    var assColdStartMetrics = root.PloffAssSubtitleColdStartMetrics || null;
    if (!PlexFeaturePorts) { throw new Error('ApplicationController requires PlexFeaturePorts'); }
    var serverPlexClient = PlexFeaturePorts.server(PlexClient);
    var shellPlexClient = PlexFeaturePorts.shell(PlexClient);
    var searchPlexClient = PlexFeaturePorts.search(PlexClient);
    var globalMediaPlexClient = PlexFeaturePorts.globalMedia(PlexClient);
    var libraryPlexClient = PlexFeaturePorts.library(PlexClient);
    var detailPlexClient = PlexFeaturePorts.detail(PlexClient);
    var mediaContextPlexClient = PlexFeaturePorts.mediaContext(PlexClient);
    var settingsBackupPlexClient = PlexFeaturePorts.settingsBackup(PlexClient);
    var playerPlexClient = PlexFeaturePorts.player(PlexClient);
    function isAssSubtitleTrack(track) {
      var format = String(track && (track.format || track.codec || '') || '').toLowerCase();
      return format.indexOf('ass') !== -1 || format.indexOf('ssa') !== -1;
    }

    function showPrimaryHomeUnavailableChoice() {
      if (!choiceDialogController) { return false; }
      return choiceDialogController.open({
        title: t('home.primaryUnavailable'),
        choices: [
          { value: 'continue', label: t('home.continueSecondary') },
          { value: 'change-server', label: t('home.changeServer') }
        ],
        selectedValue: 'continue',
        variant: 'confirm',
        apply: function (choice) {
          if (!choice || choice.value !== 'change-server') { return; }
          if (settingsFeature) { settingsFeature.enter({}); }
          if (serverFeature) { serverFeature.openEditor(); }
        },
        returnFocus: function () {
          if (currentView() === 'home' && shellFeature) { shellFeature.focusHomeStart(); }
        }
      });
    }
    function assLocalRenderingEnabled() { return !!(appSettings && appSettings.subtitleRenderingAss === true); }
    function assSubtitlePrefetchIdentity(source, track, owner) {
      var value = source || {};
      var profile = value.mediaProfile || value.profile || value;
      var ownerValue = owner || value._ploffSourceItem || profile._ploffSourceItem || value;
      var serverIdentity = serverFeature && serverFeature.mediaIdentity ? serverFeature.mediaIdentity() : {};
      var ownerIdentity = plexSourceRouter && typeof plexSourceRouter.identityFor === 'function'
        ? plexSourceRouter.identityFor(ownerValue, ownerValue.sourceContext || value.sourceContext || null)
        : '';
      return [
        [ownerIdentity || serverIdentity.server || config.apiBaseUrl || 'local', serverIdentity.profile || 'local'].join('|'),
        value.ratingKey || profile.ratingKey || '',
        value.partId || profile.partId || '',
        value.mediaIndex !== undefined ? value.mediaIndex : profile.mediaIndex || 0,
        value.partIndex !== undefined ? value.partIndex : profile.partIndex || 0,
        track && track.id || ''
      ].join('|');
    }
    function prefetchAssCandidate(detail, profile, resolved, priority, playback) {
      var track = resolved && resolved.subtitleTrack;
      if (!assLocalRenderingEnabled()) { return false; }
      var target;
      if (!assSubtitlePrefetch || !profile || !track || !isAssSubtitleTrack(track) ||
          (!playback && !(track.external || track.key))) { return false; }
      target = {
        identity: assSubtitlePrefetchIdentity(playback || profile || detail, track, profile._ploffSourceItem || detail && detail._ploffSourceItem || detail),
        detail: detail || null,
        profile: profile,
        playback: playback || null,
        track: track
      };
      assSubtitlePrefetch.request(target, { priority: priority === 'foreground' ? 'foreground' : 'speculative' });
      return true;
    }
    var authOptions = {
      baseUrl: config.accountBaseUrl || 'https://plex.tv',
      clientIdentifier: PlexAuth ? PlexAuth.clientIdentifier(root.localStorage) : '',
      deviceName: 'Ploff',
      platformVersion: String(root.navigator && root.navigator.userAgent || ''),
      timeout: Math.min(6000, Number(config.requestTimeout || 5000)),
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
    function markStartup(name) {
      if (startupMetrics && typeof startupMetrics.mark === 'function') { return startupMetrics.mark(name); }
      return null;
    }
    function startupSnapshot() {
      var snapshot = startupMetrics && typeof startupMetrics.snapshot === 'function' ? startupMetrics.snapshot() : {};
      if (assColdStartMetrics && typeof assColdStartMetrics.snapshot === 'function') { snapshot.ass = assColdStartMetrics.snapshot(); }
      return snapshot;
    }
    function destroyOne(value) {
      if (value && typeof value.destroy === 'function') { value.destroy(); }
    }
    function destroyOwned() {
      playerReadyCallbacks = [];
      cancelAssGlyphWarmPressure();
      cancelPendingPlayback();
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
    var assRenderingEnabledState = !!(appSettings && appSettings.subtitleRenderingAss === true);
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
    var releaseStatusCheckedOnSettings = false;
    var applicationSession = constructOwner(function () {
      return ApplicationSession.create({ view: 'home', settings: appSettings, config: config });
    });
    var runtimeErrorStore = constructOwner(function () {
      if (!RuntimeErrorStore || typeof RuntimeErrorStore.create !== 'function') {
        return { snapshot: function () { return []; }, destroy: function () {} };
      }
      return RuntimeErrorStore.create({ root: root, DiagnosticsState: DiagnosticsState });
    });
    var playbackCompatibilityMemory = constructOwner(function () {
      if (!PlaybackCompatibilityMemory || typeof PlaybackCompatibilityMemory.create !== 'function') {
        return { shouldSkip: function () { return false; },
          recordFailure: function () {},
          recordSuccess: function () {},
          snapshot: function () { return { formatRuleCount: 0, fileExceptionCount: 0, fileExceptionTtlDays: 30 }; },
          clearFormatRules: function () {},
          clearFileExceptions: function () {},
          clear: function () {},
          destroy: function () {} };
      }
      return PlaybackCompatibilityMemory.create({
        storage: root.localStorage,
        metadata: function () {
          return {
            model: playbackCapabilities && playbackCapabilities.modelName || '',
            runtime: String(root.navigator && root.navigator.userAgent || ''),
            appVersion: BuildInfo.version
          };
        },
        onChange: function () { if (settingsBackupStore) { settingsBackupStore.scheduleAutoSave(); } }
      });
    });
    function currentView() {
      return String(applicationSession.view() || 'home');
    }
    function setAppView(nextView) {
      var view = String(nextView || 'home');
      if (view !== currentView()) {
        cancelPendingPlayback();
        cancelPendingDirectPlay();
        if (shellFeature && shellFeature.cancelBackdropPrefetch) { shellFeature.cancelBackdropPrefetch(); }
      }
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
    var librarySources = null;
    var plexSourceRouter = null;
    var mediaSourceResolver = null;
    var multiServerContent = null;
    var diagnosticsFeature = null;
    var diagnosticsSupportLoader = null;
    var libraryFeature = null;
    var detailFeature = null;
    var playerFeature = null;
    var playerLoader = null;
    var playerReadinessPending = false;
    var playerFailure = null;
    var pendingPlay = null;
    var playerReadyCallbacks = [];
    var startupBackgroundChainStarted = false;
    var startupBackgroundChainFinished = false;
    var startupBackgroundChainWatchdog = null;
    var inputController = null;
    var pointerController = null;
    var mediaContextController = null;
    function detailSnapshot() { return detailFeature ? detailFeature.snapshot() : {}; }
    serverFeature = constructOwner(function () {
      return ServerFeatureController.create({
      platform: {
        root: root, document: document, storage: root.localStorage,
        credentialStorage: credentialStorage
      },
      modules: {
        ServerController: ServerController,
        ServerEditorView: ServerEditorView,
        ActivityState: ActivityState,
        AuthStore: AuthStore,
        LocalData: LocalData,
        NetworkPolicy: NetworkPolicy,
        NetworkState: NetworkState,
        NetworkTransition: NetworkTransition,
        PlexAuth: PlexAuth,
        PlexClient: serverPlexClient,
        ServerDiscovery: ServerDiscovery,
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
        pointerActive: function () { return !!(pointerController && pointerController.isSelectionActive()); },
        renderActivities: function () { if (shellFeature) { shellFeature.renderServerActivities(); } },
        renderProfile: function () { if (shellFeature) { shellFeature.renderActiveProfile(); } },
        renderSettings: function () { if (settingsFeature && currentView() === 'settings') { settingsFeature.refresh(); } },
        renderNetwork: function () { if (shellFeature) { shellFeature.onNetworkPresentation(); } }
      },
      application: {
        ready: function () { shellFeature.completeStartup(); },
        applyNavigation: function (items) {
          if (librarySources) {
            librarySources.applyPrimaryNavigation(items);
            if (librarySources.refresh) { librarySources.refresh(function () {}); }
          }
        },
        loadHome: function () { shellFeature.refreshHome(); },
        loaded: function () { markStartup('server-ready'); },
        seedAccountSettings: function (account) {
          if (settingsFeature) { settingsFeature.seedAccount(account); }
          shellFeature.renderNavigation();
          if (settingsFeature && currentView() === 'settings') { settingsFeature.refresh(); }
        },
        persistSettings: function () { if (settingsFeature) { settingsFeature.persist(); } },
        recoverAfterNetwork: function () { recoverActiveViewAfterNetwork(); },
        stopHomePolling: function () { if (shellFeature) { shellFeature.stopHomePolling(); } },
        scheduleHomePolling: function () { if (shellFeature) { shellFeature.scheduleHomePolling(); } }
      },
      lifecycle: {
        resetContent: function () {
          cancelPendingPlayback();
          cancelPendingDirectPlay();
          if (mediaContextController && mediaContextController.reset) { mediaContextController.reset(); }
          if (searchFeature && searchFeature.leave) { searchFeature.leave(); }
          if (detailFeature && detailFeature.leave) { detailFeature.leave(); }
          if (multiServerContent && multiServerContent.resetSources) { multiServerContent.resetSources(); }
          if (librarySources && librarySources.applyPrimaryNavigation) { librarySources.applyPrimaryNavigation([]); }
          if (!shellFeature) { return; }
          shellFeature.stopTheme();
          shellFeature.clearBackdrop();
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
          revealHome({ focus: 'first', refresh: false });
          serverFeature.loadApplication();
        }
      }
    });
    });
    librarySources = constructOwner(function () {
      return LibrarySourcesController.create({
        clock: root,
        storage: root.localStorage,
        settings: function () { return appSettings; },
        modules: {
          LibrarySource: LibrarySource,
          LibraryTabStore: LibraryTabStore,
          LibrarySourceCatalog: LibrarySourceCatalog
        },
        config: config,
        server: {
          activeServer: serverFeature.activeServer,
          servers: serverFeature.servers,
          queryAccountServers: serverFeature.queryAccountServers,
          resolveContentSource: serverFeature.resolveContentSource,
          attemptFailover: serverFeature.attemptFailover,
          watchlistIdentity: serverFeature.watchlistIdentity
        },
        transport: { loadLibrarySections: libraryPlexClient.loadLibrarySections },
        presentation: {
          applyNavigation: function (items) {
            var visibleItems = items;
            if (shellFeature) { visibleItems = shellFeature.applyNavigationVisibility(items) || items; }
            if (libraryFeature && libraryFeature.reconcileNavigation) { libraryFeature.reconcileNavigation(items); }
            if (startupBackgroundChainStarted && libraryFeature && libraryFeature.scheduleAdjacentPrefetch) {
              libraryFeature.scheduleAdjacentPrefetch(shellNavigationIndex(), visibleItems || navigationItems, { immediate: true });
            }
          },
          renderNavigation: function () { if (shellFeature) { shellFeature.renderNavigation(); shellFeature.renderServerActivities(); } },
          renderSourceWarnings: function () { if (shellFeature) { shellFeature.renderServerActivities(); } },
          t: t
        },
        lifecycle: {
          onAvailabilityRecovered: function (machineIdentifier, details) {
            var reconcileOptions = { force: true, invalidateMachineIdentifier: machineIdentifier };
            var navigation;
            var detailContext;
            if (multiServerContent && details && details.newlyDiscovered === true && multiServerContent.refreshHomeSource) {
              multiServerContent.refreshHomeSource(machineIdentifier);
            } else if (multiServerContent && multiServerContent.refreshHomeEnrichment) {
              multiServerContent.refreshHomeEnrichment();
            }
            if (libraryFeature && libraryFeature.reconcileNavigation && librarySources && librarySources.navigationItems) {
              navigation = librarySources.navigationItems();
              libraryFeature.reconcileNavigation(navigation, reconcileOptions);
              if (details && details.wasOffline === true && details.newlyDiscovered !== true &&
                  startupBackgroundChainStarted && libraryFeature.scheduleAdjacentPrefetch) {
                libraryFeature.scheduleAdjacentPrefetch(shellNavigationIndex(), navigation, { immediate: true });
              }
            }
            if (currentView() === 'detail' && detailFeature && detailFeature.sourceContext && detailFeature.recoverAfterNetwork) {
              detailContext = detailFeature.sourceContext();
              if (String(detailContext && detailContext.serverMachineIdentifier || '') === String(machineIdentifier || '')) {
                detailFeature.recoverAfterNetwork();
              }
            }
            if (currentView() === 'search' && searchFeature && searchFeature.retryAfterNetwork) {
              searchFeature.retryAfterNetwork();
            }
          },
          onAvailabilityLost: function (machineIdentifier) {
            var navigation;
            var serverName;
            if (currentView() !== 'player' && shellFeature && shellFeature.showMessage) {
              serverName = librarySources && librarySources.displayServerNameForMachine
                ? librarySources.displayServerNameForMachine(machineIdentifier) : '';
              shellFeature.showMessage((serverName || t('settings.plexServer')) + ' · ' + t('common.offline'));
            }
            if (multiServerContent && multiServerContent.removeHomeSource) {
              multiServerContent.removeHomeSource(machineIdentifier);
            }
            if (libraryFeature && libraryFeature.reconcileNavigation && librarySources && librarySources.navigationItems) {
              navigation = librarySources.navigationItems();
              libraryFeature.reconcileNavigation(navigation, {
                force: true,
                invalidateMachineIdentifier: machineIdentifier
              });
              if (startupBackgroundChainStarted && libraryFeature.scheduleAdjacentPrefetch) {
                libraryFeature.scheduleAdjacentPrefetch(shellNavigationIndex(), navigation, { immediate: true });
              }
            }
            if (currentView() === 'search' && searchFeature && searchFeature.retryAfterNetwork) {
              searchFeature.retryAfterNetwork();
            }
          },
          onServerEnabledChanged: function () {
            if (multiServerContent && multiServerContent.resetSources) { multiServerContent.resetSources(); }
            if (libraryFeature && libraryFeature.resetContent) { libraryFeature.resetContent(); }
            if (shellFeature) { shellFeature.markHomeDirty(); shellFeature.refreshHome(); }
          },
          onServerAliasChanged: function () {
            if (multiServerContent && multiServerContent.resetSources) { multiServerContent.resetSources(); }
            if (libraryFeature && libraryFeature.resetContent) { libraryFeature.resetContent(); }
            if (shellFeature) { shellFeature.markHomeDirty(); shellFeature.refreshHome(); }
          }
        }
      });
    });
    plexSourceRouter = constructStep(function () {
      if (!PlexSourceRouter || typeof PlexSourceRouter.create !== 'function') { throw new Error('ApplicationController requires PlexSourceRouter'); }
      return PlexSourceRouter.create({ config: config, sources: librarySources });
    });
    mediaSourceResolver = constructStep(function () {
      if (!MediaSourceResolver || typeof MediaSourceResolver.create !== 'function') { throw new Error('ApplicationController requires MediaSourceResolver'); }
      return MediaSourceResolver.create({ sourceRouter: plexSourceRouter });
    });
    multiServerContent = constructOwner(function () {
      if (!MultiServerContentController || !MultiServerMedia) { throw new Error('ApplicationController requires multi-server content modules'); }
      return MultiServerContentController.create({
        sources: librarySources,
        sourceRouter: plexSourceRouter,
        sourceResolver: mediaSourceResolver,
        transport: globalMediaPlexClient,
        MultiServerMedia: MultiServerMedia,
        clock: root,
        canEnrichHome: function () { return true; },
        onLibraryStatus: librarySources.reportLibraryStatus,
        onHomeEnriched: function (rows) {
          if (shellFeature && shellFeature.applyHomeEnrichment) { shellFeature.applyHomeEnrichment(rows || []); }
        },
        onPrimaryHomeUnavailable: function () {
          if (currentView() !== 'home') { return false; }
          return showPrimaryHomeUnavailableChoice();
        },
        config: config
      });
    });
    var settingsBackupStore = constructOwner(function () {
      if (!SettingsBackupFormat || !PlexSettingsBackupStore) { throw new Error('ApplicationController requires settings backup modules'); }
      return PlexSettingsBackupStore.create({
        storage: root.localStorage,
        settings: function () { return appSettings; },
        config: function () { return config; },
        deviceInfo: function () { return playbackCapabilities; },
        appVersion: BuildInfo.version,
        transport: {
          list: settingsBackupPlexClient.loadSettingsBackupPlaylists,
          create: settingsBackupPlexClient.createSettingsBackupPlaylist,
          update: settingsBackupPlexClient.updateSettingsBackupPlaylist,
          remove: settingsBackupPlexClient.deleteSettingsBackupPlaylist
        }
      });
    });
    var choiceDialogController = constructOwner(function () {
      return ChoiceDialogController.create({ document: document, ChoiceDialogView: ChoiceDialogView, t: t, CardLayout: CardLayout });
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
    function checkReleaseStatusOnFirstSettingsEntry() {
      if (releaseStatusCheckedOnSettings) { return false; }
      releaseStatusCheckedOnSettings = true;
      return releaseStatus ? releaseStatus.check(false) : false;
    }
    var assRendererPool = constructOwner(function () {
      if (!AssSubtitleRendererPool || typeof AssSubtitleRendererPool.create !== 'function') {
        throw new Error('ApplicationController requires AssSubtitleRendererPool');
      }
      return AssSubtitleRendererPool.create({
        rendererModule: AssSubtitleRenderer,
        root: root,
        document: document,
        metrics: assColdStartMetrics
      });
    });
    if (assLocalRenderingEnabled()) { assRendererPool.prewarm(); }
    var assGlyphWarmScheduled = false;
    var assGlyphWarmStartTimer = null;
    var assGlyphWarmUnsubscribe = null;
    function setAssGlyphWarmPressure(active) {
      if (shellFeature && shellFeature.setHomeArtworkPressure) { shellFeature.setHomeArtworkPressure('ass-warm', active === true); }
    }
    function clearAssGlyphWarmObserver() {
      if (typeof assGlyphWarmUnsubscribe === 'function') { assGlyphWarmUnsubscribe(); }
      assGlyphWarmUnsubscribe = null;
    }
    function finishAssGlyphWarmPressure() {
      clearAssGlyphWarmObserver();
      setAssGlyphWarmPressure(false);
    }
    function assGlyphWarmFinished(preloader) {
      var snapshot;
      if (!preloader || typeof preloader.snapshot !== 'function') { return true; }
      snapshot = preloader.snapshot() || {};
      return snapshot.warmComplete === true || snapshot.failed === true || snapshot.available === false || snapshot.takenAt !== null && snapshot.takenAt !== undefined;
    }
    function observeAssGlyphWarm(preloader) {
      if (destroyed || assGlyphWarmFinished(preloader)) { finishAssGlyphWarmPressure(); return; }
      clearAssGlyphWarmObserver();
      if (!preloader || typeof preloader.subscribe !== 'function') { finishAssGlyphWarmPressure(); return; }
      assGlyphWarmUnsubscribe = preloader.subscribe(function () {
        if (destroyed || assGlyphWarmFinished(preloader)) { finishAssGlyphWarmPressure(); }
      });
      if (assGlyphWarmFinished(preloader)) { finishAssGlyphWarmPressure(); }
    }
    function cancelAssGlyphWarmPressure() {
      if (assGlyphWarmStartTimer !== null && root.clearTimeout) { root.clearTimeout(assGlyphWarmStartTimer); }
      assGlyphWarmStartTimer = null;
      finishAssGlyphWarmPressure();
    }
    function scheduleAssGlyphWarmup() {
      var preloader = root && root.PloffAssSubtitleWorkerPreloader;
      var scheduler;
      if (!assLocalRenderingEnabled() || assGlyphWarmScheduled || !preloader || typeof preloader.warm !== 'function') { return false; }
      assGlyphWarmScheduled = true;
      setAssGlyphWarmPressure(true);
      scheduler = root && typeof root.setTimeout === 'function' ? root.setTimeout :
        (typeof setTimeout === 'function' ? setTimeout : null);
      if (!scheduler) {
        if (typeof preloader.start === 'function') { preloader.start(); }
        if (preloader.warm() === false) { finishAssGlyphWarmPressure(); return false; }
        observeAssGlyphWarm(preloader);
        return true;
      }
      assGlyphWarmStartTimer = scheduler(function () {
        assGlyphWarmStartTimer = null;
        if (!destroyed && assLocalRenderingEnabled()) {
          if (typeof preloader.start === 'function') { preloader.start(); }
          if (preloader.warm() === false) { finishAssGlyphWarmPressure(); return; }
          observeAssGlyphWarm(preloader);
        } else { assGlyphWarmScheduled = false; finishAssGlyphWarmPressure(); }
      }, ASS_GLYPH_WARM_DELAY_MS);
      return true;
    }
    var assSubtitlePrefetch = constructOwner(function () {
      if (!AssSubtitlePrefetch || typeof AssSubtitlePrefetch.create !== 'function') {
        throw new Error('ApplicationController requires AssSubtitlePrefetch');
      }
      return AssSubtitlePrefetch.create({
        PlexClient: playerPlexClient,
        sourceRouter: plexSourceRouter,
        config: config,
        metrics: assColdStartMetrics
      });
    });
    var assNextPrefetchRequest = null;
    var assNextPrefetchGeneration = 0;
    var assNextPrefetchKey = '';
    function copyAssPlaybackWithoutSession(playback) {
      var result = {};
      var key;
      playback = playback || {};
      for (key in playback) {
        if (Object.prototype.hasOwnProperty.call(playback, key)) { result[key] = playback[key]; }
      }
      result.transcodeSession = '';
      result.session = '';
      return result;
    }
    function selectedAssTrack(playback) {
      var tracks = playback && playback.subtitleTracks || [];
      var selectedId = playback && playback.options && playback.options.subtitleStreamID;
      var index;
      for (index = 0; index < tracks.length; index += 1) {
        if (String(tracks[index].id || '') === String(selectedId || '')) { return tracks[index]; }
      }
      return null;
    }
    function cancelAssPrefetch(reason, preserveIdentity, includeForeground) {
      var snapshot;
      assNextPrefetchGeneration += 1;
      if (assNextPrefetchRequest && typeof assNextPrefetchRequest.abort === 'function') { assNextPrefetchRequest.abort(); }
      assNextPrefetchRequest = null;
      assNextPrefetchKey = '';
      snapshot = assSubtitlePrefetch && typeof assSubtitlePrefetch.snapshot === 'function' ? assSubtitlePrefetch.snapshot() : null;
      if (!assSubtitlePrefetch || preserveIdentity && snapshot &&
          (snapshot.activeIdentity === preserveIdentity || snapshot.cachedIdentity === preserveIdentity)) { return; }
      if (includeForeground === true && typeof assSubtitlePrefetch.cancel === 'function') {
        assSubtitlePrefetch.cancel(reason || 'ASS subtitle prefetch cancelled');
      } else if (typeof assSubtitlePrefetch.cancelSpeculative === 'function') {
        assSubtitlePrefetch.cancelSpeculative(reason || 'ASS subtitle prefetch cancelled');
      }
    }
    function prefetchCurrentAss(detail, profile, resolved) {
      var track = resolved && resolved.subtitleTrack;
      var identity;
      if (!assLocalRenderingEnabled()) { return false; }
      if (!track || !isAssSubtitleTrack(track)) { return false; }
      identity = assSubtitlePrefetchIdentity(profile || detail, track, profile && profile._ploffSourceItem || detail && detail._ploffSourceItem || detail);
      cancelAssPrefetch('current ASS playback requested', identity);
      return prefetchAssCandidate(detail, profile, resolved, 'foreground');
    }
    function prefetchNextAss(target, preferences, requestKey) {
      var item = target && (target.item || target);
      if (!assLocalRenderingEnabled()) { return false; }
      var key = String(requestKey || item && item.ratingKey || '');
      var generation;
      var request;
      if (!item || !item.ratingKey || !assSubtitlePrefetch) { return false; }
      if (key && key === assNextPrefetchKey) { return true; }
      cancelAssPrefetch('next ASS target replaced');
      assNextPrefetchKey = key;
      generation = assNextPrefetchGeneration + 1;
      assNextPrefetchGeneration = generation;
      request = assSubtitlePrefetch.loadPlayback(item,
        'ploff-ass-prefetch-' + String(new Date().getTime()), preferences || {}, function (error, loaded) {
          var track;
          if (generation !== assNextPrefetchGeneration || error || !loaded) { return; }
          assNextPrefetchRequest = null;
          track = selectedAssTrack(loaded);
          if (!track || !isAssSubtitleTrack(track)) { return; }
          prefetchAssCandidate(item, loaded, { subtitleTrack: track }, 'speculative', copyAssPlaybackWithoutSession(loaded));
        });
      if (generation === assNextPrefetchGeneration) { assNextPrefetchRequest = request || null; }
      return true;
    }
    shellFeature = constructOwner(function () {
      return ShellFeatureController.create({
      platform: { root: root, document: document, storage: root.localStorage },
      modules: {
        ShellController: ShellController,
        HomeState: HomeState,
        SettingsSchema: SettingsSchema,
        FocusModel: FocusModel,
        NavigationModel: NavigationModel,
        NavbarWindow: NavbarWindow,
        NavigationIcon: NavigationIcon,
        CardLayout: CardLayout,
        MediaLabels: MediaLabels,
        ProgressiveImages: ProgressiveImages,
        BackgroundAudio: BackgroundAudio,
        ViewState: ViewState,
        I18n: I18n
      },
      presentationServices: presentationServices,
      data: {
        PlexClient: shellPlexClient, config: config, sourceRouter: plexSourceRouter, initialNavigationItems: availableNavigationItems, initialRows: [],
        loadHome: function (callback) { return multiServerContent.loadHome(callback); },
        loadThemeMetadata: function (item, callback, sourceContext) {
          return multiServerContent.loadMetadata(item, callback, sourceContext);
        },
        sourceContextForItem: multiServerContent.contextForItem,
        homeRecentEnabled: function (sourceId) { return librarySources.homeRecentEnabled(sourceId); },
        homeRowOrder: function (kindOrder) { return librarySources.homeOrder(kindOrder); },
        initialFocus: { area: 'media', navIndex: 0, rowIndex: 0, column: 0 }
      },
      state: {
        settings: function () { return appSettings; },
        authState: function () { return serverFeature.authSnapshot(); },
        activeProfileVisible: function () { return !!serverFeature.activeProfile(); },
        activeProfile: function () { return serverFeature.activeProfile(); },
        authMode: function () { return serverFeature.authMode(); },
        setupComplete: function () { return serverFeature.setupComplete(); },
        publishActiveProfile: function (profile) { applicationSession.update({ activeProfile: profile }); },
        serverActivities: function () { return serverFeature ? serverFeature.snapshot().activities : []; },
        sourceWarnings: librarySources.sourceWarnings,
        networkSnapshot: function () { return serverFeature.networkSnapshot(); },
        currentView: function () { return currentView(); },
        setView: setAppView,
        pointerSelectionActive: function () { return !!(pointerController && pointerController.isSelectionActive()); },
        navigationHasFocus: navigationHasFocus,
        watchlistAvailable: serverFeature.watchlistAvailable,
        themeIdentity: function (item, sourceContext) {
          return plexSourceRouter.identityFor(item, sourceContext || null);
        },
        homeCanRefresh: function () {
          return currentView() === 'home' && !document.hidden && !!config.apiBaseUrl && serverFeature.allowsLocal();
        }
      },
      presentation: {
        networkStatusLabel: function (snapshot) { return settingsFeature ? settingsFeature.networkStatusLabel(snapshot) : ''; },
        networkStatusClass: function (snapshot) { return settingsFeature ? settingsFeature.networkStatusClass(snapshot) : ''; },
        animationDuration: function (milliseconds) { return settingsFeature ? settingsFeature.animationDuration(milliseconds) : milliseconds; },
        onActivityTitle: function (title) {
          if (currentView() !== 'detail' || !detailFeature) { return; }
          if (title) { showDetailMetadataStatus(title, false); }
          else if (detailSnapshot().refreshPending) { showDetailMetadataStatus(t('status.refreshing'), false); }
          else if (!detailSnapshot().metadataStatusTemporary) { hideDetailMetadataStatus(); }
        },
        translateDetail: function () { if (detailFeature) { detailFeature.translateStatic(); } },
        translateLibrary: function () { if (libraryFeature) { libraryFeature.translateStatic(); } },
        translatePlayer: function () { if (playerFeature) { playerFeature.translateStatic(); } },
        refreshSettings: function () { if (settingsFeature && currentView() === 'settings') { settingsFeature.refresh(); } },
        refreshDiagnostics: function () { if (diagnosticsFeature && diagnosticsFeature.isOpen()) { diagnosticsFeature.render(); } },
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
        activateHome: activate,
        playHomeItem: function (item) { return playHomeItem(item, multiServerContent.contextForItem(item)); },
        requestExit: requestApplicationExit,
        navigationMatches: navigationViewMatches,
        commitNavigationView: commitNavigationView,
        enterNavigationContent: enterNavigationContent,
        focusNavigationForCurrentView: focusCurrentNavigation,
        openProfileManager: openProfileManager,
        focusActivity: focusCurrentNavigation,
        scheduleAdjacentLibraryPrefetch: function (immediate) {
          if (!immediate && !startupBackgroundChainStarted) { return; }
          if (libraryFeature) {
            libraryFeature.scheduleAdjacentPrefetch(shellNavigationIndex(), navigationItems, immediate === true
              ? { immediate: true }
              : { delay: ADJACENT_LIBRARY_PREFETCH_DELAY_MS });
          }
        },
        persistLibraryOrder: function (sourceIds) {
          if (librarySources) { librarySources.reorder(sourceIds || []); }
        },
        onHomeReady: function () {
          markStartup('first-home-content');
          markStartup('first-focusable-ui');
          scheduleAssGlyphWarmup();
          armStartupBackgroundChainWatchdog();
        },
        onHomeArtworkPreviewReady: startStartupBackgroundChain
      }
    });
    });
    navigationItems = constructStep(function () { return shellFeature.navigationItems(); });
    libraryFeature = constructOwner(function () {
      return LibraryFeatureController.create({
      platform: { root: root, document: document },
      modules: {
        LibraryController: LibraryController,
        LibraryContainers: LibraryContainers,
        LibraryFilterView: LibraryFilterView,
        LibraryGridView: PloffLibraryGridView,
        LibraryLifecycle: LibraryLifecycle,
        PlaybackQueueModel: PlaybackQueueModel,
        LibraryTabPrefetch: LibraryTabPrefetch,
        NavigationModel: NavigationModel,
        ProgressiveImages: ProgressiveImages,
        SearchModel: SearchModel,
        WatchlistState: WatchlistState, WatchlistView: WatchlistView,
        CardLayout: CardLayout
      },
      data: {
        PlexClient: libraryPlexClient,
        sourceRouter: plexSourceRouter,
        WatchlistClient: WatchlistClient,
        config: config,
        resolveSource: function (sourceId, callback) {
          if (librarySources) { return librarySources.resolveSource(sourceId, callback); }
          if (callback) { callback(new Error('Library source resolver unavailable')); }
          return null;
        },
        accountToken: serverFeature.watchlistAccountToken,
        watchlistIdentity: serverFeature.watchlistIdentity,
        watchlistAvailable: serverFeature.watchlistAvailable,
        resolveGuid: multiServerContent.resolveGuid,
        loadGlobalPlaylists: multiServerContent.loadPlaylists,
        loadGlobalPlaylistItems: multiServerContent.loadPlaylistItems,
        loadVirtualLibraryPage: multiServerContent.loadVirtualLibraryPage,
        loadVirtualLibraryRecommendations: multiServerContent.loadVirtualLibraryRecommendations,
        loadVirtualLibraryFilterOptions: multiServerContent.loadVirtualLibraryFilterOptions,
        sourceContextForItem: multiServerContent.contextForItem,
        reportAvailability: librarySources.reportAvailability,
        reportLibraryStatus: librarySources.reportLibraryStatus,
        verifyAvailability: librarySources.verifyAvailability,
        recoverPrimary: librarySources.recoverPrimary
      },
      state: {
        currentView: function () { return currentView(); },
        navigationIndex: shellNavigationIndex,
        navigationItems: function () { return navigationItems; },
        setNavigationIndex: function (index) { setShellFocus({ navIndex: index }); },
        homeBusy: function () { return shellFeature.isHomeLoading(); },
        pointerActive: function () {
          return !!(pointerController && (pointerController.isSelectionActive() || pointerController.isWheelNavigationActive()));
        },
        cardScale: function () { return appSettings.cardScale; },
        artworkQuality: function () { return appSettings.artworkQuality; },
        uiLanguage: function () { return appSettings.uiLanguage; },
        watchlistVisible: function () { return appSettings.showWatchlist !== false; }
      },
      shell: {
        t: t,
        element: presentationServices.element,
        setText: presentationServices.setText,
        clearFocus: shellFeature.clearLogicalFocus,
        renderNavigation: shellFeature.renderNavigation,
        navigationFocusCount: shellFeature.navigationFocusCount,
        navigationTarget: function (index) { return document.querySelector(shellFeature.selectorForNavIndex(index)); },
        scheduleNavigationPreview: shellFeature.scheduleNavigationPreview,
        startNavigationHold: shellFeature.startNavigationHold,
        enterNavigation: shellFeature.enterActiveNavigation,
        showMessage: shellFeature.showMessage,
        showViewState: shellFeature.showViewState,
        hideViewState: shellFeature.hideViewState,
        scheduleBackdrop: shellFeature.scheduleBackdrop,
        scheduleBackdropPrefetch: shellFeature.scheduleBackdropPrefetch,
        scheduleTheme: shellFeature.scheduleTheme,
        stopTheme: function () { shellFeature.stopTheme(); },
        animateLibrarySurface: shellFeature.animateLibrarySurface,
        cardMetrics: shellFeature.cardMetrics,
        cardProfile: shellFeature.cardProfile,
        mediaTitle: presentationServices.mediaTitle,
        mediaCardMeta: presentationServices.mediaCardMeta,
        mediaCardDetail: presentationServices.mediaCardDetail,
        mediaKey: presentationServices.mediaKey,
        artworkUrl: presentationServices.artworkUrl,
        renderedPosterSpecification: shellFeature.renderedPosterSpecification,
        fixedPosterSpecification: shellFeature.fixedPosterSpecification,
        posterLoader: shellFeature.posterLoader(),
        prioritizePoster: shellFeature.prioritizePoster, suspendSettings: function () { if (settingsFeature) { settingsFeature.suspend(); } },
        setHomeArtworkPressure: shellFeature.setHomeArtworkPressure,
        refreshHome: function () { shellFeature.refreshHome(); }
      },
      server: {
        waitForActivity: function (activityId, callback) {
          if (serverFeature) { serverFeature.waitForActivity(activityId, callback); }
          else if (callback) { callback({ cancelled: true }); }
        }
      },
      transitions: {
        setView: setAppView,
        openDetail: function (item, sourceContext) { return openDetail(item, sourceContext || multiServerContent.contextForItem(item)); },
        playItem: function (item, sourceContext) { return playHomeItem(item, sourceContext || multiServerContent.contextForItem(item)); },
        returnHome: transitionToHome,
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
        DetailController: DetailController,
        DetailNavigation: DetailNavigation,
        DetailPresentationView: DetailPresentationView,
        DetailEpisodeView: DetailEpisodeView,
        DetailExtendedView: DetailExtendedView,
        DetailPreferenceState: DetailPreferenceState,
        MetadataRefresh: MetadataRefresh,
        MediaInfo: MediaInfo,
        MediaPreferences: MediaPreferences,
        SubtitleSeriesOffset: SubtitleSeriesOffset,
        MediaProfile: MediaProfile, MediaChoiceModel: MediaChoiceModel, VersionSelection: VersionSelection,
        ProgressiveImages: ProgressiveImages,
        MediaSourcePreference: MediaSourcePreference
      },
      data: {
        PlexClient: detailPlexClient,
        config: config,
        sourceRouter: plexSourceRouter,
        sourceResolver: mediaSourceResolver,
        mediaPreferenceIdentity: function (_detail, sourceContext) {
          var identity = serverFeature.mediaIdentity();
          var serverIdentity = sourceContext && sourceContext.serverMachineIdentifier ? sourceContext.serverMachineIdentifier : identity.server;
          return MediaPreferences ? MediaPreferences.identity(serverIdentity, identity.profile) : '';
        },
        playbackCapabilities: function () { return playbackCapabilities; },
        settings: function () { return appSettings; },
        activeVideoQuality: function () { return settingsFeature ? settingsFeature.activeVideoQuality() : 'original'; },
        mediaContext: {
          removeFromContinueWatching: function (target, callback) {
            return mediaContextController && mediaContextController.removeFromContinueWatching(target, callback);
          }
        },
        loadMergedSeriesContext: multiServerContent.loadMergedSeriesContext,
        displayServerName: librarySources.displayServerNameForMachine,
        loadMergedSeasonEpisodes: multiServerContent.loadMergedSeasonEpisodes,
        resolveGuid: multiServerContent.resolveGuid,
        recoverPrimary: librarySources.recoverPrimary,
        waitForActivity: function (activityId, callback) {
          if (serverFeature) { serverFeature.waitForActivity(activityId, callback); }
          else if (callback) { callback({ cancelled: true }); }
        },
        onAssPrefetchCandidate: function (detail, profile, resolved) {
          return prefetchAssCandidate(detail, profile, resolved, 'speculative');
        }
      },
      shell: {
        t: t,
        element: presentationServices.element,
        setText: presentationServices.setText,
        mediaTitle: presentationServices.mediaTitle,
        mediaMeta: presentationServices.mediaMeta,
        mediaDetail: presentationServices.mediaDetail,
        artworkUrl: presentationServices.artworkUrl,
        posterLoader: function () { return shellFeature.posterLoader(); },
        loadRenderedPoster: shellFeature.loadRenderedPoster,
        cancelImages: shellFeature.cancelImages,
        activeBackdropSource: shellFeature.activeBackdropSource,
        scheduleBackdrop: shellFeature.scheduleDetailBackdrop,
        clearBackdrop: shellFeature.clearBackdrop,
        scheduleTheme: shellFeature.scheduleTheme,
        showMessage: shellFeature.showMessage,
        showViewState: shellFeature.showViewState,
        hideViewState: shellFeature.hideViewState,
        clearFocus: shellFeature.clearLogicalFocus,
        navigationTarget: function (index) { return document.querySelector(shellFeature.selectorForNavIndex(index)); },
        navigationIndex: shellNavigationIndex,
        navigationCount: shellFeature.navigationFocusCount,
        moveNavigation: function (effect) {
          var currentNavigationIndex = shellNavigationIndex();
          var navigationCount = Math.max(0, shellFeature.navigationFocusCount());
          var nextNavigationIndex = effect === 'nav-left'
            ? (currentNavigationIndex === 0 ? Math.max(0, navigationCount - 1) : currentNavigationIndex - 1)
            : (currentNavigationIndex >= navigationCount - 1 ? 0 : currentNavigationIndex + 1);
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
        available: serverFeature.watchlistAvailable,
        identity: serverFeature.watchlistIdentity,
        snapshot: function () { return libraryFeature.watchlistSnapshot(); },
        findLocal: function (ratingKey, machineIdentifier) { return libraryFeature.findWatchlistLocal(ratingKey, machineIdentifier); },
        load: function (force, callback) { return libraryFeature.loadWatchlist(force, callback); },
        toggle: function (cloudKey, enabled, local, callback) { return libraryFeature.toggleWatchlist(cloudKey, enabled, local, callback); }
      },
      dialogs: {
        openChoice: openChoiceDialog,
        mediaInfoOpen: function () { return mediaInfoDialogController.snapshot().open; },
        openMediaInfo: function (model, origin) { return mediaInfoDialogController.open(model, origin); },
        openMediaVersions: function (options, origin) { return mediaInfoDialogController.openVersions(options, origin); },
        handleMediaInfoKey: function (event, direction) { return mediaInfoDialogController.handleKey(event, direction); }
      },
      state: {
        currentView: function () { return currentView(); },
        pointerSelectionActive: function () { return !!(pointerController && pointerController.isSelectionActive()); },
        animationsEnabled: function () { return appSettings.interfaceAnimations; },
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
        restoreOrigin: restoreDetailOrigin,
        requestPlayback: function () { return requestPlayer('detail', null); },
        requestStandalonePlayback: function (request) { return requestPlayer('standalone', request); },
        onWatchedChanged: updateWatchedAcrossFeatures
      }
    });
    });
    playerLoader = constructOwner(function () {
      return root.PloffPlayerRuntimeLoader.create({
        root: root, document: document,
        onLoadStart: function () { markStartup('player-load-start'); },
        onCodeReady: function () { markStartup('player-code-ready'); }
      });
    });
    function playerPorts() {
      return {
      platform: { root: root, document: document, storage: root.localStorage },
      assRendererPool: assRendererPool,
      data: {
        PlexClient: playerPlexClient,
        AssSubtitlePrefetch: assSubtitlePrefetch,
        assSubtitlePrefetchIdentity: assSubtitlePrefetchIdentity,
        prefetchCurrentAss: prefetchCurrentAss,
        prefetchNextAss: prefetchNextAss,
        cancelAssPrefetch: cancelAssPrefetch,
        config: config,
        sourceRouter: plexSourceRouter,
        sourceResolver: mediaSourceResolver,
        playbackCapabilities: function () { return playbackCapabilities; },
        compatibilityMemory: playbackCompatibilityMemory,
        compatibilityIdentity: function () {
          var server = serverFeature.activeServer();
          return server && (server.machineIdentifier || server.uri || server.name) || config.apiBaseUrl || 'server';
        },
        compatibilityEnabled: function () { return appSettings.adaptivePlaybackMemory !== false; },
        activeServer: function () { return serverFeature.activeServer(); },
        mediaIdentity: function () { return serverFeature.mediaIdentity(); },
        recoverPrimary: function (error, callback) { return librarySources.recoverPrimary(error, callback); },
        subscribeNetwork: function (listener) { return serverFeature.subscribeNetwork(listener); },
        networkAvailable: function (snapshot) { return snapshot && snapshot.lanAvailable !== false; }
        ,loadMergedSeasonEpisodes: multiServerContent.loadMergedSeasonEpisodes
      },
      shell: {
        t: t,
        element: presentationServices.element,
        setText: presentationServices.setText,
        showMessage: shellFeature.showMessage,
        stopTheme: function () { return shellFeature.stopTheme(); },
        artworkUrl: presentationServices.artworkUrl,
        loadRenderedPoster: shellFeature.loadRenderedPoster,
        posterLoader: function () { return shellFeature.posterLoader(); },
        cancelImages: function (scope) { return shellFeature.cancelImages(scope); }
      },
      detail: {
        snapshot: detailSnapshot,
        sourceContext: function () { return detailFeature ? detailFeature.sourceContext() : null; },
        queueSnapshot: function () { return detailFeature ? detailFeature.queueSnapshot() : {}; },
        playbackPreferences: function (versionAffinity) { return detailFeature ? detailFeature.playbackPreferences(versionAffinity) : {}; },
        playbackPreferencesFor: function (detail, versionAffinity) { return detailFeature ? detailFeature.playbackPreferencesFor(detail, versionAffinity) : {}; },
        selectedMediaProfile: function () { return detailFeature ? detailFeature.selectedMediaProfile() : null; },
        resolvedTracks: function () { return detailFeature ? detailFeature.resolvedTracks() : null; },
        resolvePlaybackTracks: function (playback) { return detailFeature ? detailFeature.resolvePlaybackTracks(playback) : null; },
        preferenceSnapshot: function () { return detailFeature ? detailFeature.preferenceSnapshot() : {}; },
        setTrackPreference: function (kind, track, disabled) { return detailFeature && detailFeature.setTrackPreference(kind, track, disabled); },
        setPlaybackVersion: function (mediaIndex, partIndex) { return detailFeature && detailFeature.setPlaybackVersion(mediaIndex, partIndex); },
        saveMediaOverride: function () { return detailFeature && detailFeature.saveMediaOverride(); },
        applyLocalPlaybackProgress: function (ratingKey, seconds) { return detailFeature && detailFeature.applyLocalPlaybackProgress(ratingKey, seconds); },
        refreshPlaybackState: function (ratingKey, seconds) { return detailFeature && detailFeature.refreshPlaybackState(ratingKey, seconds); },
        setPlaybackContext: function (detail, item, context, seasonIndex, episodeIndex) {
          return detailFeature && detailFeature.setPlaybackContext(detail, item, context, seasonIndex, episodeIndex);
        },
        setPlaylistContext: function (context, index) { return detailFeature && detailFeature.setPlaylistContext(context, index); },
        queueMediaProfile: function (detail) { return detailFeature && detailFeature.queueMediaProfile(detail); },
        renderEpisodeContext: function () { return detailFeature && detailFeature.renderEpisodeContext(); },
        openLoaded: function (detail, options) { return detailFeature && detailFeature.openLoaded(detail, options); },
        openItem: function (item) { return openDetail(item); },
        setPlayPending: function (pending) { return detailFeature && detailFeature.setPlayPending(pending); },
        setFocus: function (focus) { return detailFeature && detailFeature.setFocus(focus); },
        leave: function () { return detailFeature && detailFeature.leave(); },
        hideSurface: function () { return detailFeature && detailFeature.hideSurface(); },
        showSurface: function (options) { return detailFeature && detailFeature.showSurface(options); },
        resumeAfterPlayer: function (lockedUntil) { return detailFeature && detailFeature.resumeAfterPlayer(lockedUntil); }
      },
      library: {
        snapshot: function () { return libraryFeature ? libraryFeature.snapshot() : {}; },
        activeContainer: function () { return libraryFeature ? libraryFeature.activeContainer() : null; },
        playbackContext: function () { return libraryFeature ? libraryFeature.playbackContext() : {}; },
        focusedItem: function () { return libraryFeature ? libraryFeature.focusedItem() : null; },
        pointerFocus: function (target, index, button) { return libraryFeature && libraryFeature.pointerFocus(target, index, button); },
        restoreContainerOrigin: function (options) { return libraryFeature && libraryFeature.restoreContainerOrigin(options); },
        refreshAfterPlayback: function (ratingKey, seconds, sourceContext) {
          return libraryFeature && libraryFeature.reconcilePlaybackProgress(ratingKey, seconds, sourceContext || null);
        }
      },
      dialogs: {
        openChoice: function (options) { return choiceDialogController.open(options); },
        openMediaInfo: function (model, origin) { return mediaInfoDialogController.open(model, origin); },
        closeMediaInfo: function () { return mediaInfoDialogController.close(); },
        mediaInfoOpen: function () { return mediaInfoDialogController.snapshot().open; },
        handleMediaInfoKey: function (event, direction) { return mediaInfoDialogController.handleKey(event, direction); },
        scrollMediaInfo: function (direction) { return mediaInfoDialogController.scroll(direction); }
      },
      settings: {
        settings: function () { return appSettings; },
        animationDuration: function (milliseconds) { return settingsFeature ? settingsFeature.animationDuration(milliseconds) : milliseconds; },
        videoQualityLabel: function (value) { return settingsFeature ? settingsFeature.videoQualityLabel(value) : String(value || ''); },
        playbackPreferenceLabel: function (value) { return settingsFeature ? settingsFeature.playbackPreferenceLabel(value) : String(value || ''); },
        connectionRouteLabel: function () { return settingsFeature ? settingsFeature.connectionRouteLabel() : ''; },
        previewSubtitleStyle: function (style) { return settingsFeature && settingsFeature.previewSubtitleStyle(style); },
        restoreSubtitleStyle: function (style) { return settingsFeature && settingsFeature.restoreSubtitleStyle(style); },
        commitSubtitleStyle: function (style) { return settingsFeature && settingsFeature.commitSubtitleStyle(style); },
        commitSubtitleRendering: function (rendering) { return settingsFeature && settingsFeature.commitSubtitleRendering(rendering); },
        persistSubtitleSize: function (size) { return settingsFeature && settingsFeature.persistSubtitleSize(size); }
      },
      diagnostics: {
        setError: function (error) { return diagnosticsFeature && diagnosticsFeature.setError(error); },
        error: function () { return diagnosticsFeature ? diagnosticsFeature.error() : null; },
        capturePlayback: function () { return diagnosticsFeature && diagnosticsFeature.capturePlayback(); }
      },
      state: {
        currentView: function () { return currentView(); },
        setView: setAppView,
        enterDetail: function () { shellFeature.hideHomeSurface(); setAppView('detail'); },
        enterHome: function () { return revealHome({ focus: 'first' }); },
        setPlaybackIdentity: function (identity) { return applicationSession.update({ playbackIdentity: identity || null }); },
        pointerSelectionActive: function () { return !!(pointerController && pointerController.isSelectionActive()); },
        navigationHasFocus: navigationHasFocus
      }
      };
    }
    function cancelPendingPlayback() { pendingPlay = null; }
    function cancelPendingDirectPlay() {
      if (detailFeature && detailFeature.cancelPendingPlayIntent) { detailFeature.cancelPendingPlayIntent(); }
    }
    function handleVisibilityChange() {
      if (document && document.hidden) {
        cancelPendingPlayback();
        cancelPendingDirectPlay();
      }
      if (shellFeature && shellFeature.onVisibilityChange) { shellFeature.onVisibilityChange(); }
    }
    function flushPlayerReadyCallbacks() {
      var callbacks = playerReadyCallbacks.slice();
      var index;
      playerReadyCallbacks = [];
      for (index = 0; index < callbacks.length; index += 1) {
        try { callbacks[index](playerFailure || null, playerFeature || null); }
        catch (_callbackError) {}
      }
    }
    function finishStartupBackgroundChain() {
      if (destroyed || startupBackgroundChainFinished) { return false; }
      startupBackgroundChainFinished = true;
      return true;
    }
    function clearStartupBackgroundChainWatchdog() {
      if (startupBackgroundChainWatchdog !== null && root && typeof root.clearTimeout === 'function') {
        root.clearTimeout(startupBackgroundChainWatchdog);
      }
      startupBackgroundChainWatchdog = null;
    }
    function armStartupBackgroundChainWatchdog() {
      var scheduler;
      if (destroyed || startupBackgroundChainStarted || startupBackgroundChainWatchdog !== null) { return false; }
      scheduler = root && typeof root.setTimeout === 'function' ? root.setTimeout :
        (typeof setTimeout === 'function' ? setTimeout : null);
      if (!scheduler) { return false; }
      startupBackgroundChainWatchdog = scheduler(function () {
        startupBackgroundChainWatchdog = null;
        startStartupBackgroundChain();
      }, HOME_ARTWORK_PREVIEW_WATCHDOG_MS);
      return true;
    }
    function runStartupWatchlistWarm() {
      var settled = false;
      function finish() {
        if (settled) { return; }
        settled = true;
        finishStartupBackgroundChain();
      }
      if (destroyed || !libraryFeature || typeof libraryFeature.warmWatchlist !== 'function') { finish(); return; }
      if (libraryFeature.warmWatchlist(finish) === false) { finish(); }
    }
    function runStartupPlayerWarm() {
      if (destroyed) { return; }
      if (shellFeature && shellFeature.setHomeArtworkPressure) { shellFeature.setHomeArtworkPressure('player-warm', true); }
      ensurePlayerReady(function () {
        if (shellFeature && shellFeature.setHomeArtworkPressure) { shellFeature.setHomeArtworkPressure('player-warm', false); }
        runStartupWatchlistWarm();
      });
    }
    function runStartupHomeArtworkWarm() {
      var settled = false;
      function finish() {
        if (settled) { return; }
        settled = true;
        runStartupAdjacentLibraryPrefetch();
      }
      if (destroyed || !shellFeature || typeof shellFeature.warmHomeArtworkPreviews !== 'function') { finish(); return; }
      if (shellFeature.warmHomeArtworkPreviews(finish) === false) { finish(); }
    }
    function runStartupAdjacentLibraryPrefetch() {
      var settled = false;
      function finish() {
        if (settled) { return; }
        settled = true;
        runStartupPlayerWarm();
      }
      if (destroyed || !libraryFeature || typeof libraryFeature.scheduleAdjacentPrefetch !== 'function') { finish(); return; }
      if (libraryFeature.scheduleAdjacentPrefetch(shellNavigationIndex(), navigationItems, {
        immediate: true,
        onSettled: finish
      }) === false) { finish(); }
    }
    function startStartupBackgroundChain() {
      clearStartupBackgroundChainWatchdog();
      if (destroyed || startupBackgroundChainStarted) { return false; }
      startupBackgroundChainStarted = true;
      runStartupHomeArtworkWarm();
      return true;
    }
    function playContext() {
      var detail = detailSnapshot() || {};
      var item = detail.selectedItem || detail.currentDetail || {};
      var identity = serverFeature && serverFeature.mediaIdentity() || {};
      var library = currentView() === 'library' ? libraryFeature.snapshot() : {};
      var focus = library.grid && library.grid.focus || {};
      var focused = currentView() === 'library' ? libraryFeature.focusedItem() || {} : {};
      var container = currentView() === 'library' ? libraryFeature.activeContainer() || {} : {};
      var owner = item.serverMachineIdentifier || focused.serverMachineIdentifier || container.serverMachineIdentifier || identity.server || '';
      return {
        libraryKey: String(focused.containerKey || focused.ratingKey || ''),
        libraryIndex: focus.index, libraryRow: focus.recommendationRow,
        libraryScope: String(container.containerKey || container.ratingKey || ''),
        libraryGeneration: library.generation, libraryZone: library.library && library.library.zone,
        view: currentView(), key: String(item.ratingKey || ''), generation: detail.generation,
        detailKey: String(detail.currentDetail && detail.currentDetail.ratingKey || ''),
        season: detail.seasonIndex, episode: detail.episodeIndex,
        server: String(owner), profile: String(identity.profile || '')
      };
    }
    function validPendingPlay(intent) {
      var current;
      if (!intent || destroyed) { return false; }
      current = playContext();
      return intent.context.libraryKey === current.libraryKey && intent.context.libraryIndex === current.libraryIndex &&
        intent.context.libraryRow === current.libraryRow && intent.context.libraryScope === current.libraryScope &&
        intent.context.libraryGeneration === current.libraryGeneration && intent.context.libraryZone === current.libraryZone &&
        intent.context.view === current.view && intent.context.key === current.key &&
        intent.context.generation === current.generation && intent.context.detailKey === current.detailKey &&
        intent.context.season === current.season && intent.context.episode === current.episode && intent.context.server === current.server &&
        intent.context.profile === current.profile;
    }
    function finishPlayerReadiness() {
      var intent = pendingPlay;
      pendingPlay = null;
      playerReadinessPending = false;
      if (!validPendingPlay(intent)) { return; }
      if (playerFailure) {
        shellFeature.showMessage(t('status.playbackError'));
        return;
      }
      dispatchPlayerIntent(intent.kind, intent.request);
    }
    function dispatchPlayerIntent(kind, request) {
      if (kind === 'queue-key') { return playerFeature.handleQueueCapture({ keyCode: request.keyCode }); }
      return kind === 'standalone' ? playerFeature.openStandalone(request) : playerFeature.open();
    }
    function ensurePlayerReady(callback) {
      if (typeof callback === 'function') { playerReadyCallbacks.push(callback); }
      if (destroyed) { flushPlayerReadyCallbacks(); return false; }
      if (playerFeature || playerFailure) {
        finishPlayerReadiness();
        flushPlayerReadyCallbacks();
        return !playerFailure;
      }
      if (playerReadinessPending) { return true; }
      playerReadinessPending = true;
      playerLoader.ensure(function (error, composition) {
        var feature;
        if (destroyed) { return; }
        if (!error) {
          // Deferred construction is NOT startup-fatal: the working Core owns
          // its own lifetime. Player rolls back its partial construction locally.
          try {
            feature = composition.create(root, playerPorts());
            if (!feature || typeof feature.open !== 'function') { throw new Error('Player feature is unavailable'); }
          } catch (_error) { error = new Error('Player feature could not be initialized'); }
          if (destroyed) { if (feature) { destroyOne(feature); } return; }
          if (error && feature) {
            try { destroyOne(feature); } catch (_cleanupError) { /* Keep deferred failure isolated from Core. */ }
          }
          if (!error) {
            playerFeature = feature;
            owned.push(feature);
            markStartup('player-feature-ready');
          }
        }
        playerFailure = error || null;
        if (shellFeature && shellFeature.setHomeArtworkPressure) { shellFeature.setHomeArtworkPressure('player-warm', false); }
        if (error && diagnosticsFeature) { diagnosticsFeature.setError(new Error('Player is unavailable')); }
        finishPlayerReadiness();
        flushPlayerReadyCallbacks();
      });
      return !playerFailure;
    }
    function requestPlayer(kind, request) {
      if (destroyed) { return false; }
      if (playerFeature) { return dispatchPlayerIntent(kind, request); }
      if (playerFailure) {
        playerFailure = null;
        if (playerLoader && typeof playerLoader.reset === 'function') { playerLoader.reset(); }
      }
      pendingPlay = { kind: kind, request: request, context: playContext() };
      return ensurePlayerReady();
    }
    // Queue classification is already a shared Core policy. Retain only a key
    // intent, never the original DOM event/button or a copy of the queue.
    function deferLibraryQueueActivation(event, button) {
      var code = button ? 13 : Number(event && event.keyCode || 0);
      var library;
      var item;
      var command;
      if (destroyed || currentView() !== 'library' || (code !== 13 && code !== 415)) { return false; }
      if (button) {
        if (button.disabled || !(button.hasAttribute('data-library-index') || button.hasAttribute('data-library-recommendation-row'))) { return false; }
        libraryFeature.pointerFocus('grid', 0, button);
      }
      library = libraryFeature.snapshot().library || {};
      if (library.zone !== 'grid') { return false; }
      item = libraryFeature.focusedItem();
      command = InputCommandRouter.playerQueue({
        view: 'library', keyCode: code, libraryZone: library.zone,
        focusedContainerPlayable: !!(item && item.containerKey && PlaybackQueueModel.containerKind(item)),
        playlistContainerActive: !!PlaybackQueueModel.containerKind(libraryFeature.activeContainer()),
        focusedPlaylistPlayable: !!(item && !item.containerKey && PlaybackQueueModel.playableItems([item]).length)
      });
      if (command !== 'library-start-container' && command !== 'library-open-detail' && command !== 'library-open-play') { return false; }
      if (event && event.preventDefault) { event.preventDefault(); }
      if (event && event.stopImmediatePropagation) { event.stopImmediatePropagation(); }
      else if (event && event.stopPropagation) { event.stopPropagation(); }
      requestPlayer('queue-key', { keyCode: code });
      return true;
    }
    function itemInContinueWatching(item, sourceContext) {
      var currentRows = shellFeature ? shellFeature.rows() : [];
      var primary = serverFeature && serverFeature.activeServer ? serverFeature.activeServer() : null;
      var primaryIdentity = String(primary && (primary.machineIdentifier || primary.uri || primary.name) || '');
      var expectedIdentity = String(item && item.serverMachineIdentifier || sourceContext && sourceContext.serverMachineIdentifier || '');
      var rowIndex;
      var itemIndex;
      var candidate;
      var candidateIdentity;
      for (rowIndex = 0; rowIndex < currentRows.length; rowIndex += 1) {
        if (currentRows[rowIndex].kind !== 'continue') { continue; }
        for (itemIndex = 0; itemIndex < (currentRows[rowIndex].items || []).length; itemIndex += 1) {
          candidate = currentRows[rowIndex].items[itemIndex];
          if (!candidate || String(candidate.ratingKey || '') !== String(item && item.ratingKey || '')) { continue; }
          candidateIdentity = String(candidate.serverMachineIdentifier || primaryIdentity || '');
          if (!expectedIdentity) { return true; }
          if (candidateIdentity && candidateIdentity === expectedIdentity) { return true; }
        }
      }
      return false;
    }
    function resolveMediaContextTarget() {
      var view = currentView();
      var focus;
      var rowsValue;
      var item = null;
      var stateValue;
      var inContinue = false;
      var sourceContext = null;
      var target;
      if (view === 'home') {
        focus = shellFocusSnapshot();
        rowsValue = shellFeature.rows();
        if (focus.area !== 'media' || !rowsValue[focus.rowIndex]) { return null; }
        item = rowsValue[focus.rowIndex].items[focus.column] || null;
        inContinue = rowsValue[focus.rowIndex].kind === 'continue';
      } else if (view === 'library' || view === 'watchlist') {
        stateValue = libraryFeature && libraryFeature.snapshot ? libraryFeature.snapshot() : {};
        if (view === 'library' && (!stateValue.library || stateValue.library.zone !== 'grid')) { return null; }
        if (view === 'watchlist' && (!stateValue.watchlist || stateValue.watchlist.zone !== 'grid')) { return null; }
        item = libraryFeature && libraryFeature.focusedItem ? libraryFeature.focusedItem() : null;
        inContinue = view === 'library' && stateValue.library && stateValue.library.viewKey === 'continue';
        if (view === 'library' && libraryFeature && libraryFeature.sourceContext) { sourceContext = libraryFeature.sourceContext(); }
      } else if (view === 'search') {
        stateValue = searchFeature && searchFeature.snapshot ? searchFeature.snapshot() : {};
        focus = stateValue.focus || {};
        if (focus.zone === 'results') { item = stateValue.results && stateValue.results[focus.index] || null; }
      }
      if (!item || !item.ratingKey) { return null; }
      if (!sourceContext && multiServerContent && typeof multiServerContent.contextForItem === 'function') {
        sourceContext = multiServerContent.contextForItem(item);
      }
      var resolved = mediaSourceResolver.resolve(item, { candidateContext: sourceContext });
      if (!resolved) { return null; }
      item = resolved.item;
      var route = resolved.route;
      sourceContext = route.context || null;
      target = {
        item: item,
        view: view,
        inContinueWatching: inContinue || itemInContinueWatching(item, sourceContext)
      };
      if (sourceContext && route) {
        target.sourceContext = sourceContext;
        target.config = route.config;
      }
      return target;
    }
    function restoreMediaContextFocus(target) {
      if (!target || currentView() !== target.view) { return false; }
      if (target.view === 'home') { shellFeature.updateFocus(); return true; }
      if (target.view === 'library' || target.view === 'watchlist') { return libraryFeature.refreshPresentation(); }
      if (target.view === 'search') { searchFeature.refreshFocus(); return true; }
      return false;
    }
    function refreshAfterMediaContextMutation() {
      libraryFeature.reconcileContentMutation();
      shellFeature.refreshHome();
      if (currentView() === 'library' || currentView() === 'watchlist') { libraryFeature.reloadCurrent(true); }
      else if (currentView() === 'search') { searchFeature.refresh(); }
      return true;
    }
    if (!MediaContextController || typeof MediaContextController.create !== 'function') {
      throw new Error('ApplicationController requires MediaContextController');
    }
    mediaContextController = constructOwner(function () {
      return MediaContextController.create({
        root: root, transport: mediaContextPlexClient, config: config, holdDelay: 800,
        resolveTarget: resolveMediaContextTarget,
        openChoice: function (options) { return choiceDialogController.open(options); },
        restoreFocus: restoreMediaContextFocus,
        refresh: refreshAfterMediaContextMutation,
        playFromBeginning: playHomeItem,
        showMessage: shellFeature.showMessage,
        mediaTitle: presentationServices.mediaTitle,
        t: t
      });
    });
    inputController = constructOwner(function () {
      return InputController.create({
      InputTargetRouter: InputTargetRouter,
      sessionSnapshot: function () {
        var activeView = currentView();
        var homeFocus = activeView === 'home' ? shellFocusSnapshot() : null;
        var navigationFocused = homeFocus ? homeFocus.area === 'nav' : navigationHasFocus(activeView);
        var playerSnapshot = activeView === 'player' && playerFeature ? playerFeature.snapshot() : {};
        var settingsSnapshot = activeView === 'settings' ? settingsFeature.snapshot() : {};
        var shellNavigation = shellFeature.navigationSnapshot(homeFocus);
        return {
          appView: activeView,
          textInputDialogOpen: activeView === 'settings' && settingsSnapshot.textInputOpen,
          libraryTabsOpen: activeView === 'settings' && settingsSnapshot.libraryTabsOpen,
          choiceDialogOpen: choiceDialogController.snapshot().open,
          upNextLayoutOpen: activeView === 'settings' && settingsSnapshot.upNext && settingsSnapshot.upNext.open,
          privacyDialogOpen: activeView === 'settings' && settingsSnapshot.privacyOpen,
          playbackCompatibilityOpen: activeView === 'settings' && settingsSnapshot.compatibilityOpen,
          safeAreaOpen: activeView === 'settings' && settingsSnapshot.safeAreaOpen,
          subtitleStyleOpen: activeView === 'settings' && settingsSnapshot.subtitleStyleOpen,
          updateDialogOpen: activeView === 'settings' && settingsSnapshot.updateOpen,
          viewStateOpen: shellFeature.viewStateOpen(),
          playerMediaInfoOpen: activeView === 'player' && mediaInfoDialogController.snapshot().open,
          resumeChoiceOpen: activeView === 'player' && playerSnapshot.resumeChoiceOpen,
          queueGapOpen: activeView === 'player' && playerSnapshot.queueGapOpen,
          playerErrorOpen: activeView === 'player' && playerSnapshot.errorOpen,
          subtitleEditorOpen: activeView === 'player' && playerSnapshot.subtitleEditorOpen,
          playerUpNextOpen: activeView === 'player' && !!(playerSnapshot.queue && playerSnapshot.queue.upNext && playerSnapshot.queue.upNext.visible),
          navReorderActive: navigationFocused && shellNavigation.reorderMode,
          navReorderReady: shellNavigation.reorderReady,
          navigationHasFocus: navigationFocused,
          navigationContentEntryFocused: navigationFocused && shellNavigation.index < navigationItems.length,
          navHoldActive: shellNavigation.holdActive,
          navHoldTriggered: shellNavigation.holdTriggered,
          navReorderMode: shellNavigation.reorderMode,
          pageScrollPendingFocus: !!(pointerController && pointerController.snapshot().pageScrollPendingFocus)
        };
      },
      overlays: {
        textInput: function (event, direction) { return settingsFeature.handleTextInputKey(event, direction); },
        choiceDialog: function (event, direction) { return choiceDialogController.handleKey(event, direction); },
        upNextLayout: function (event) { return settingsFeature.handleUpNextKey(event); },
        privacy: function (event) { return settingsFeature.handlePrivacyKey(event); },
        playbackCompatibility: function (event, direction) { return settingsFeature.handlePlaybackCompatibilityKey(event, direction); },
        safeArea: function (event, direction) { return settingsFeature.handleSafeAreaKey(event, direction); },
        subtitleStyle: function (event, direction) { return settingsFeature.handleSubtitleStyleKey(event, direction); },
        viewState: shellFeature.handleViewStateKey,
        queueGap: function (event, direction) { return playerFeature ? playerFeature.handleQueueGapKey(event, direction) : false; },
        playerMediaInfo: function (event, direction) { return mediaInfoDialogController.handleKey(event, direction); },
        resumeChoice: function (event, direction) { return playerFeature ? playerFeature.handleResumeKey(event, direction) : false; },
        playerError: function (event, direction) { return playerFeature ? playerFeature.handleErrorKey(event, direction) : false; },
        subtitleEditor: function (event, direction) { return playerFeature ? playerFeature.handleSubtitleEditorKey(event, direction) : false; }
      },
      domains: {
        queueCapture: function (event) { return playerFeature ? playerFeature.handleQueueCapture(event) : deferLibraryQueueActivation(event); },
        playerQueue: function (event, direction) { return playerFeature ? playerFeature.handleQueueKey(event, direction) : false; },
        playerControls: function (event, direction) { return playerFeature ? playerFeature.handleControlsKey(event, direction) : false; },
        setup: function (event) { return setupFeature.handleKey(event); },
        diagnostics: function (event, direction) { return diagnosticsFeature.handleKey(event, direction); },
        settings: function (event, direction) { return settingsFeature.handleKey(event, direction); },
        detail: function (event, direction) { return detailFeature.handleKey(event, direction); },
        library: function (event, direction) { return libraryFeature.handleKey(event, direction); },
        watchlist: function (event, direction) { return libraryFeature.handleKey(event, direction); },
        search: function (event, direction) { return searchFeature.handleKey(event, direction); },
        home: function (event, direction) { return shellFeature.handleHomeKey(event, direction); },
        resetSeekRepeat: function () { if (playerFeature) { playerFeature.resetSeekRepeat(); } }
      },
      contextMenu: {
        canOpen: mediaContextController.canOpen, startHold: mediaContextController.startHold,
        holding: mediaContextController.holding, releaseHold: mediaContextController.releaseHold
      },
      navigation: {
        moveReorderedLibrary: shellFeature.moveReorderedLibrary,
        finishReorder: shellFeature.finishReorder,
        markReorderReady: shellFeature.markReorderReady,
        cancelHold: shellFeature.cancelNavigationHold,
        enterActiveView: shellFeature.enterActiveNavigation
      },
      lifecycle: {
        cancelPendingPlayback: cancelPendingPlayback,
        cancelPendingPlayIntent: cancelPendingDirectPlay,
        clearWheelNavigation: function () { if (pointerController) { pointerController.clearWheelNavigation(); } },
        syncPageScrollFocus: function () { if (pointerController) { pointerController.syncPageFocus(); } },
        clearPageScrollPendingFocus: function () { if (pointerController) { pointerController.clearPageScrollPendingFocus(); } }
      }
    });
    });
    pointerController = constructOwner(function () {
      return PointerController.create({
      root: root, document: document,
      sessionSnapshot: function () {
        var activeView = currentView();
        var controls = activeView === 'player' && playerFeature ? playerFeature.controlsSnapshot() : {};
        var playerSnapshot = activeView === 'player' && playerFeature ? playerFeature.snapshot() : {};
        var settingsSnapshot = activeView === 'settings' ? settingsFeature.snapshot() : {};
        var librarySnapshot = activeView === 'library' || activeView === 'watchlist' ? libraryFeature.snapshot() : {};
        var libraryState = librarySnapshot.library || {};
        var watchlistState = librarySnapshot.watchlist || {};
        var searchState = activeView === 'search' ? searchFeature.snapshot() : {};
        var searchFocus = searchState.focus || {};
        var homeFocus = activeView === 'home' ? shellFocusSnapshot() : null;
        var shellNavigation = shellFeature.navigationSnapshot(homeFocus);
        return {
          appView: activeView,
          homeArea: homeFocus ? homeFocus.area : '',
          libraryZone: libraryState.zone,
          libraryViewKey: libraryState.viewKey,
          watchlistZone: watchlistState.zone,
          searchZone: searchFocus.zone,
          serverEditorOpen: activeView === 'settings' && !!(serverFeature && serverFeature.editorSnapshot().open),
          playbackCompatibilityOpen: activeView === 'settings' && settingsSnapshot.compatibilityOpen,
          safeAreaOpen: activeView === 'settings' && settingsSnapshot.safeAreaOpen,
          subtitleStyleOpen: activeView === 'settings' && settingsSnapshot.subtitleStyleOpen,
          languageKind: activeView === 'settings' ? settingsSnapshot.languageKind : '',
          summaryDialogOpen: activeView === 'detail' && detailFeature.summaryOpen(),
          navigationHasFocus: homeFocus ? homeFocus.area === 'nav' : navigationHasFocus(activeView),
          navReorderMode: shellNavigation.reorderMode,
          navReorderReady: shellNavigation.reorderReady,
          navHoldTriggered: shellNavigation.holdTriggered,
          textInputDialogOpen: activeView === 'settings' && settingsSnapshot.textInputOpen,
          libraryTabsOpen: activeView === 'settings' && settingsSnapshot.libraryTabsOpen,
          choiceDialogOpen: choiceDialogController.snapshot().open,
          privacyDialogOpen: activeView === 'settings' && settingsSnapshot.privacyOpen,
          updateDialogOpen: activeView === 'settings' && settingsSnapshot.updateOpen,
          resumeChoiceOpen: activeView === 'player' && playerSnapshot.resumeChoiceOpen,
          queueGapOpen: activeView === 'player' && playerSnapshot.queueGapOpen,
          subtitleEditorOpen: activeView === 'player' && playerSnapshot.subtitleEditorOpen,
          playerControlsMode: controls.mode,
          playerChapterOpen: !!(controls.chapter && controls.chapter.open),
          playerSettingsOpen: controls.settingsOpen
        };
      },
      wheelBehavior: function () { return appSettings.wheelBehavior; }, inputKey: function (event) { inputController.handleKeyDown(event); },
      inputPress: function (event) { inputController.handleKeyDown(event); inputController.handleKeyUp(event); },
      capture: {
        focus: function (button, session) { return playerFeature ? playerFeature.pointerCaptureFocus(button, session) : false; },
        click: function (event, button, session) { return playerFeature ? playerFeature.pointerCaptureClick(event, button, session) : deferLibraryQueueActivation(event, button); }
      },
      focus: {
        subtitleEditor: function (button) { return playerFeature ? playerFeature.pointerSubtitleFocus(button) : false; },
        diagnostics: function (index) { diagnosticsFeature.focusAction(index); },
        resume: function (index) { return playerFeature ? playerFeature.pointerFocus('resume', index) : false; },
        setup: function (button) { setupFeature.focusButton(button); },
        navigation: function (index, view) {
          setShellFocus({ area: 'nav', navIndex: index });
          if (view === 'detail') { detailFeature.focusNavigation(); }
          else if (view === 'search') { searchFeature.focusNavigation(index); }
          else if (view === 'library' || view === 'watchlist') { libraryFeature.focusNavigation(); }
          else if (view === 'settings') { settingsFeature.focusNavigation(); }
          else if (view === 'home') {
            shellFeature.updateFocus();
            if (libraryFeature) { libraryFeature.scheduleAdjacentPrefetch(shellNavigationIndex(), navigationItems, { immediate: true }); }
          }
        },
        home: function (row, column) {
          setShellFocus({ area: 'media', rowIndex: row, column: column });
          shellFeature.updateFocus();
        },
        detail: function (zone, index) {
          detailFeature.pointerFocus(zone, index);
        },
        settings: function (index) { settingsFeature.focusSetting(index); },
        libraryTabs: function (index) { settingsFeature.focusLibraryTabs(index); },
        textInput: function (index) { settingsFeature.focusTextInput(index); },
        safeArea: function (index) { settingsFeature.focusSafeArea(index); },
        subtitleStyle: function (index) { settingsFeature.focusSubtitleStyle(index); },
        updateDialog: function (index) { settingsFeature.focusUpdate(index); },
        privacy: function (button) { settingsFeature.focusPrivacy(button); },
        playbackCompatibility: function (index) { settingsFeature.focusPlaybackCompatibility(index); },
        language: function (index) { settingsFeature.focusLanguage(index); },
        server: function (index) { if (serverFeature) { serverFeature.focusEditor(index); } },
        search: function (button) { searchFeature.pointerFocus(button); },
        library: function (zone, index, button) { libraryFeature.pointerFocus(zone, index, button); },
        libraryFilter: function (button) { libraryFeature.pointerFocus('library-filter', 0, button); },
        watchlist: function (button) { libraryFeature.pointerFocus('watchlist', 0, button); },
        player: function (zone, index) { return playerFeature ? playerFeature.pointerFocus(zone, index) : false; },
        choice: function (index) { choiceDialogController.pointerFocus(index); }
      },
      contextMenu: {
        canOpen: mediaContextController.canOpen, startHold: mediaContextController.startHold,
        holding: mediaContextController.holding, releaseHold: mediaContextController.releaseHold
      },
      selectAccent: function (color) { settingsFeature.selectAccentColor(color); },
      navigation: {
        startHold: shellFeature.startNavigationHold, cancelHold: shellFeature.cancelNavigationHold, markReorderReady: shellFeature.markReorderReady,
        finishReorder: shellFeature.finishReorder
      },
      page: {
        restoreHome: function (row, column) { setShellFocus({ area: 'media', rowIndex: row, column: column }); },
        restoreLibrary: function (button) { libraryFeature.restorePageFocus('library', button); },
        restoreWatchlist: function (button) { libraryFeature.restorePageFocus('watchlist', button); },
        restoreSearch: function (index) { searchFeature.restoreResultFocus(index); },
        restoreServer: function (index) { if (serverFeature) { serverFeature.focusEditor(index); } },
        restoreLanguage: function (index) { settingsFeature.focusLanguage(index); },
        restoreLibraryTabs: function (index) { settingsFeature.focusLibraryTabs(index); },
        restoreSettings: function (index) { settingsFeature.focusSetting(index); },
        scrollSummary: function (direction) { detailFeature.scrollSummary(direction); },
        beginLibraryWheel: function (duration) { libraryFeature.onWheelNavigation(duration); }
      },
      player: {
        playbackSnapshot: function () { return playerFeature ? playerFeature.playbackSnapshot() : false; },
        activity: function () { return playerFeature ? playerFeature.pointerActivity() : false; },
        renewControls: function () { return playerFeature ? playerFeature.pointerActivity() : false; },
        seekTimeline: function (seconds) { return playerFeature ? playerFeature.pointerSeek(seconds) : false; },
        settingRows: function () { return playerFeature ? playerFeature.settingRows() : false; },
        settingIndex: function () { return playerFeature ? playerFeature.settingIndex() : false; }
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
      root: root,
      document: document,
      SearchController: SearchController,
      SearchModel: SearchModel,
      SearchView: PloffSearchView,
      SearchSession: SearchSession,
      T9Input: T9Input,
      PlexClient: searchPlexClient,
      WatchlistClient: WatchlistClient,
      config: config,
      navigationItems: function () { return navigationItems; },
      allowsCloud: function () { return serverFeature.allowsCloud(); },
      accountToken: serverFeature.watchlistAccountToken,
      provider: function () { return libraryFeature.watchlistProvider(); },
      ensureProvider: function (callback) {
        return libraryFeature.ensureWatchlistProvider(callback);
      },
      t9Enabled: function () { return appSettings.searchT9Input; },
      navigationCount: shellFeature.navigationFocusCount,
      navTarget: function (index) { return document.querySelector(shellFeature.selectorForNavIndex(index)); },
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
      localSearch: multiServerContent.search,
      sourceContextForItem: multiServerContent.contextForItem,
      sourceContextIdentity: plexSourceRouter.contextIdentity,
      sourceIdentityForItem: plexSourceRouter.identityFor,
      resolveCloudItem: function (candidate, callback) { return multiServerContent.resolveGuid(candidate && candidate.guid, callback); },
      onOpenResult: function (item) { return openDetail(item, multiServerContent.contextForItem(item)); },
      onBack: function () { transitionToHome('preserve'); },
      onBackdrop: shellFeature.scheduleSearchBackdrop,
      onAdjacentBackdropPrefetch: function (items) { shellFeature.scheduleBackdropPrefetch(items, 'search'); },
      onFocusItem: function (item) { shellFeature.scheduleTheme(item, multiServerContent.contextForItem(item)); },
      clearFocus: shellFeature.clearLogicalFocus,
      pointerSelectionActive: function () { return !!(pointerController && pointerController.isSelectionActive()); },
      prioritizePoster: shellFeature.prioritizePoster,
      mediaTitle: presentationServices.mediaTitle,
      mediaCardMeta: presentationServices.mediaCardMeta,
      mediaCardDetail: presentationServices.mediaCardDetail,
      cardMetrics: shellFeature.cardMetrics,
      cardProfile: shellFeature.cardProfile,
      renderedPosterSpecification: shellFeature.renderedPosterSpecification,
      fixedPosterSpecification: shellFeature.fixedPosterSpecification,
      posterLoader: shellFeature.posterLoader(),
      playItem: function (item) { return playHomeItem(item, multiServerContent.contextForItem(item)); },
      stopBackgroundAudio: shellFeature.stopTheme,
      cancelImages: function () { shellFeature.cancelImages('search'); },
      isActive: function () { return currentView() === 'search'; }, element: presentationServices.element,
      t: t
    });
    });
    function revealHome(options) {
      var result = shellFeature.enterHome(options);
      if (multiServerContent && multiServerContent.resumeHomeEnrichment) { multiServerContent.resumeHomeEnrichment(); }
      return result;
    }
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
      if (libraryFeature && libraryFeature.cancelPendingEntry) { libraryFeature.cancelPendingEntry(); }
      if (currentView() === 'search') { searchFeature.leave(); }
      else if (currentView() === 'library' || currentView() === 'watchlist') { libraryFeature.leave(); }
      else if (currentView() === 'detail') { detailFeature.leave(); }
      else if (currentView() === 'settings') { settingsFeature.leave(); }
      setShellFocus({ area: 'nav', navIndex: targetIndex });
      if (item.kind === 'home') { revealHome({ focus: keepNavigationFocus ? 'nav' : 'first' }); }
      else {
        shellFeature.hideHomeSurface();
        if (item.kind === 'library') { libraryFeature.enterLibrary(item, { navigationIndex: targetIndex, keepNavigationFocus: keepNavigationFocus }); }
        else if (item.kind === 'watchlist') { libraryFeature.enterWatchlist({ navigationIndex: targetIndex, keepNavigationFocus: keepNavigationFocus }); }
        else if (item.kind === 'playlists') { libraryFeature.enterPlaylists({ navigationIndex: targetIndex, keepNavigationFocus: keepNavigationFocus }); }
        else if (item.kind === 'search') { openSearch(keepNavigationFocus); }
        else if (item.kind === 'settings') { settingsFeature.enter({ keepNavigationFocus: keepNavigationFocus }); }
      }
      libraryFeature.scheduleAdjacentPrefetch(shellNavigationIndex(), navigationItems);
    }
    function enterNavigationContent(item, _index) {
      if (!item) { return; }
      if (item.kind === 'home') { shellFeature.focusHomeStart(); }
      else if (item.kind === 'library' || item.kind === 'watchlist' || item.kind === 'playlists') { libraryFeature.enterActiveContent(item.kind); }
      else if (item.kind === 'search') { searchFeature.focusKeyboard(0, 0); }
      else if (item.kind === 'settings') { settingsFeature.enter({ keepNavigationFocus:false }); }
    }
    // Shared application presentation helpers used by the modular settings controller.
    function openChoiceDialog(title, choices, selectedValue, apply, returnFocus, variant, previewOptions, onClose) {
      return choiceDialogController.open({
        title: title, choices: choices, selectedValue: selectedValue, apply: apply,
        returnFocus: returnFocus, variant: variant, previewOptions: previewOptions || {}, onClose: onClose
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
        selectedValue: null,
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
        SettingsController: SettingsController,
        InputCommandRouter: InputCommandRouter,
        Settings: Settings,
        SettingsCatalog: SettingsCatalog,
        SettingsView: SettingsView,
        SafeAreaDialog: SafeAreaDialog,
        SubtitleStyleDialog: SubtitleStyleDialog,
        TextInputDialog: TextInputDialog,
        LibraryTabsEditor: LibraryTabsEditor,
        LibraryTabStore: LibraryTabStore,
        I18n: I18n,
        LocaleBootstrap: LocaleBootstrap,
        CardLayout: CardLayout,
        VersionSelection: VersionSelection,
        ServerStore: ServerStore,
        ServerDiscovery: ServerDiscovery,
        UpNextLayoutDialog: UpNextLayoutDialog
      },
      state: {
        getSettings: function () { return appSettings; }, setSettings: function (next) {
          var assWasEnabled = assRenderingEnabledState;
          appSettings = next;
          assRenderingEnabledState = assLocalRenderingEnabled();
          if (assWasEnabled && !assRenderingEnabledState) { cancelAssPrefetch('global ASS rendering disabled', '', true); }
          if (!assWasEnabled && assRenderingEnabledState) { assRendererPool.prewarm(); scheduleAssGlyphWarmup(); }
        },
        publishSettings: function (next) { applicationSession.update({ settings: next }); }
      },
      presentation: {
        t: t, element: presentationServices.element, setText: presentationServices.setText, clearFocus: shellFeature.clearLogicalFocus,
        pointerActive: function () { return !!(pointerController && pointerController.isSelectionActive()); }
      },
      librarySources: {
        sources: librarySources.sources,
        servers: function () { return serverFeature.servers(); },
        preferenceState: librarySources.preferenceState,
        homePreference: librarySources.homePreference,
        displayTitle: librarySources.displayTitle,
        canDisableServer: librarySources.canDisableServer,
        serverEnabled: librarySources.serverEnabled,
        homeOrder: librarySources.homeOrder,
        updateDisplayMode: librarySources.updateDisplayMode,
        updateHome: librarySources.updateHome,
        updateServerAlias: librarySources.updateServerAlias,
        updateServerEnabled: librarySources.updateServerEnabled,
        updateTab: librarySources.updateTab,
        reorder: librarySources.reorder,
        reorderHome: librarySources.reorderHome,
        reloadPreferences: librarySources.reloadPreferences
      },
      shell: {
        navigationIndex: shellNavigationIndex,
        setNavigationIndex: function (index) { setShellFocus({ navIndex: index }); },
        navigationCount: shellFeature.navigationFocusCount,
        navigationTarget: function (navIndex) { return document.querySelector(shellFeature.selectorForNavIndex(navIndex)); },
        renderNavigation: shellFeature.renderNavigation, scheduleNavigationPreview: shellFeature.scheduleNavigationPreview,
        activateNavigation: function () {
          var index = shellNavigationIndex();
          if (navigationItems[index] && navigationItems[index].kind === 'library') { shellFeature.startNavigationHold(index); }
          else { shellFeature.enterActiveNavigation(); }
        },
        applyCardScale: shellFeature.applyCardScale, translateStaticUi: shellFeature.translateStaticUi,
        clearBackdrop: shellFeature.clearBackdrop,
        loadBackdropPreview: shellFeature.loadBackdropPreview,
        refreshCardsForCurrentView: function () {
          if (currentView() === 'home') { shellFeature.renderRows(); shellFeature.updateFocus(); }
          else if (currentView() === 'search') { searchFeature.refresh(); }
          else if (currentView() === 'library' || currentView() === 'watchlist') { libraryFeature.refreshPresentation(); }
        },
        applyNavigationVisibility: shellFeature.applyNavigationVisibility, markHomeDirty: function () { shellFeature.markHomeDirty(); },
        recomposeHome: function () {
          return multiServerContent && typeof multiServerContent.recomposeHome === 'function' ? multiServerContent.recomposeHome() : [];
        },
        stopBackgroundAudio: function () { shellFeature.stopTheme(); },
        showMessage: shellFeature.showMessage
      },
      server: {
        config: function () { return config; },
        active: function () { return serverFeature.activeServer(); },
        discoveryActive: function () { return !!(serverFeature && serverFeature.snapshot().discoveryActive); },
        editorSnapshot: function () { return serverFeature ? serverFeature.editorSnapshot() : { open: false, index: 0 }; },
        renderEditor: function () { if (serverFeature) { serverFeature.renderEditor(); } },
        openEditor: function () { if (serverFeature) { serverFeature.openEditor(); } },
        closeEditor: function () { if (serverFeature) { serverFeature.closeEditor(); } },
        focusEditor: function (index) { if (serverFeature) { serverFeature.focusEditor(index); } },
        activateEditor: function () { if (serverFeature) { serverFeature.activateEditor(); } }
      },
      account: {
        activeProfileTitle: shellFeature.activeProfileTitle,
        connected: function () { return !!serverFeature.ownerToken(); },
        disconnect: function () { serverFeature.disconnect(); },
        deleteLocalData: function () { serverFeature.deleteLocalData(); }
      },
      dialogs: {
        openChoice: openChoiceDialog, openDiagnostics: function () { diagnosticsFeature.enter(); },
        openProfileManager: openProfileManager, openPlexSetup: openSetup
      },
      environment: {
        networkSnapshot: function () { return serverFeature.networkSnapshot(); },
        playbackCapabilities: function () { return playbackCapabilities; },
        languageCatalog: languageCatalog,
        accentColorValues: accentColorValues,
        playbackCompatibility: function () { return playbackCompatibilityMemory.snapshot(); },
        clearPlaybackCompatibilityFormats: function () { return playbackCompatibilityMemory.clearFormatRules(); },
        clearPlaybackCompatibilityFiles: function () { return playbackCompatibilityMemory.clearFileExceptions(); },
        clearPlaybackCompatibility: function () { return playbackCompatibilityMemory.clear(); },
        appVersion: BuildInfo.version,
        releaseStatusSnapshot: function () { return releaseStatus ? releaseStatus.snapshot() : {}; },
        checkForUpdates: function (force, callback) { return releaseStatus ? releaseStatus.check(force === true, callback) : false; },
        settingsBackup: settingsBackupStore
      },
      transitions: {
        enter: function () {
          checkReleaseStatusOnFirstSettingsEntry();
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
        SetupAuthSession: SetupAuthSession, LocaleBootstrap: LocaleBootstrap
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
        servers: function () { return serverFeature.servers(); },
        active: function () { return serverFeature.activeServer(); },
        apiBaseUrl: function () { return config.apiBaseUrl || ''; },
        scan: function (snapshot, callback) {
          return serverFeature.discover(function (servers) { callback(null, servers); });
        },
        normalizeManualAddress: function (value) { return serverFeature.normalizeManualAddress(value); },
        probeManualAddress: function (uri, callback) { return serverFeature.probeManualAddress(uri, callback); },
        resolveConnection: function (server, callback) { return serverFeature.resolveServerConnection(server, callback); },
        shouldOfferConnection: function (localUri, enteredUri) {
          return serverFeature.shouldOfferConnection(localUri, enteredUri);
        }
      },
      account: {
        authSnapshot: function () { return serverFeature.authSnapshot(); },
        profiles: function () { return serverFeature.profiles(); },
        ownerToken: function () { return serverFeature.ownerToken(); },
        createPin: function (purpose, callback) { return serverFeature.createPin(purpose, callback); },
        pollPin: function (pinId, callback) { return serverFeature.pollPin(pinId, callback); },
        loadAccountServers: function (ownerToken, callback) { return serverFeature.loadAccountServers(ownerToken, callback); },
        loadProfiles: function (ownerToken, callback) { return serverFeature.loadProfiles(ownerToken, callback); },
        switchProfile: function (profile, pin, callback) {
          var snapshot = setupFeature.snapshot();
          return serverFeature.switchProfile(profile, pin, {
            selectedServer: snapshot.selectedServer || serverFeature.activeServer(),
            preferredConnectionUri: snapshot.preferredConnectionUri,
            profiles: snapshot.profiles,
            isActive: function () { return currentView() === 'setup'; }
          }, callback);
        },
        continueOffline: function () { serverFeature.continueOffline(); },
        disconnect: function () { serverFeature.disconnect(); }
      },
      transitions: {
        activate: function () { setAppView('setup'); }, completeStartup: shellFeature.completeStartup,
        localeReady: function () { shellFeature.translateStaticUi(); shellFeature.renderNavigation(); },
        finish: function (snapshot) { finishSetup(snapshot); },
        cancel: function (snapshot) { cancelSetup(snapshot); }
      }
    });
    });
    function completeSetupDestination(destination) {
      shellFeature.renderActiveProfile();
      if (destination === 'settings') {
        checkReleaseStatusOnFirstSettingsEntry();
        setAppView('settings'); settingsFeature.refresh(); serverFeature.loadApplication();
      } else {
        revealHome({ focus: 'first', refresh: false });
        serverFeature.loadApplication(); serverFeature.discover();
      }
    }
    function finishSetup(snapshot) {
      var destination = snapshot.returnView;
      if (snapshot.selectedServer) { serverFeature.applyServer(snapshot.selectedServer); }
      else if (serverFeature.activeServer()) { serverFeature.applyServer(serverFeature.activeServer()); }
      if (destination) { completeSetupDestination(destination); return; }
      settingsBackupStore.status(function (error, status) {
        if (error || !status || !status.exists) { completeSetupDestination(destination); return; }
        settingsFeature.promptSettingsLoad(status, { confirmFirst: true }, function (loadError, loaded, skipped) {
          if (!skipped) { shellFeature.showMessage(t(loadError ? 'settings.backup.error' : 'settings.backup.loaded')); }
          completeSetupDestination(destination);
        });
      });
    }
    function cancelSetup(snapshot) {
      var destination = snapshot.returnView;
      restoreSetupReturnView(destination);
    }
    function restoreSetupReturnView(destination) {
      setAppView(destination || 'home');
      if (currentView() === 'settings') { settingsFeature.refresh(); }
      else if (currentView() === 'search') { searchFeature.refreshFocus(); }
      else if (currentView() === 'library' || currentView() === 'watchlist') { libraryFeature.refreshPresentation(); }
      else if (currentView() === 'detail') { detailFeature.updateFocus(); }
      else {
        revealHome({ focus: 'preserve', refresh: false });
      }
    }
    function openSetup() { return setupFeature.openFirstRun(); }
    function openProfileManager() { return setupFeature.openProfiles(currentView()); }
    function openManualSetup() { return setupFeature.openManual('settings'); }

    diagnosticsSupportLoader = constructOwner(function () {
      if (!DiagnosticsSupportRuntimeLoader || typeof DiagnosticsSupportRuntimeLoader.create !== 'function') {
        throw new Error('ApplicationController requires DiagnosticsSupportRuntimeLoader');
      }
      return DiagnosticsSupportRuntimeLoader.create({ root: root, document: document });
    });

    diagnosticsFeature = constructOwner(function () {
      return DiagnosticsFeatureController.create({
      platform: { root: root, document: document },
      modules: {
        DiagnosticsController: DiagnosticsController, DiagnosticsState: DiagnosticsState,
        DiagnosticsView: DiagnosticsView
      },
      presentation: {
        t: t,
        element: presentationServices.element,
        setText: presentationServices.setText,
        formatFileSize: function (bytes) { return MediaProfile.detailedSize(bytes, t('player.unavailable')); },
        formatLongTime: formatLongTime,
        formatTime: formatTime,
        pointerActive: function () { return !!(pointerController && pointerController.isSelectionActive()); }
      },
      state: {
        appVersion: function () { return authOptions.version; },
        config: function () { return config; },
        activeServer: function () { return serverFeature.activeServer(); },
        serverAddresses: function (server) { return serverFeature.addressesFor(server, false); },
        authMode: function () { return serverFeature.authMode(); },
        activeProfile: function () { return serverFeature.activeProfile(); },
        playbackCapabilities: function () { return playbackCapabilities; },
        networkSnapshot: function () { return serverFeature.networkSnapshot(); },
        playbackSnapshot: function () { return playerFeature ? playerFeature.playbackSnapshot() : null; },
        queueSnapshot: function () { return playerFeature ? playerFeature.queueSnapshot() : null; },
        playbackDiagnostics: function () { return playerFeature ? playerFeature.playbackDiagnostics() : null; },
        settingsSnapshot: function () { return appSettings; },
        playbackCompatibility: function () { return playbackCompatibilityMemory.snapshot(); },
        jsErrors: function () { return runtimeErrorStore ? runtimeErrorStore.snapshot() : []; },
        startupSnapshot: startupSnapshot
      },
      transport: {
        loadIdentity: function (callback) { return serverFeature.loadServerIdentity(callback); },
        loadSupportRuntime: function (callback) { return diagnosticsSupportLoader.ensure(callback); }
      },
      transitions: {
        enter: function () {
          setAppView('diagnostics');
          shellFeature.stopTheme();
          settingsFeature.suspend();
        },
        leave: function () {
          setAppView('settings');
          settingsFeature.resume({ focusKey: 'diagnostics' });
        }
      }
    });
    });
    // Media detail, seasons, episodes, preferences, and metadata refresh.
    function sameMediaItem(first, second) {
      var firstMachine;
      var secondMachine;
      if (!first || !second || !first.ratingKey || String(first.ratingKey) !== String(second.ratingKey)) { return false; }
      firstMachine = String(first.serverMachineIdentifier || '');
      secondMachine = String(second.serverMachineIdentifier || '');
      if (firstMachine && secondMachine && firstMachine !== secondMachine) { return false; }
      return true;
    }

    function detailOpenOptions(item, sourceContext) {
      var view = currentView();
      var focus;
      var rowsValue;
      var libraryState;
      var focused;
      var fromContinueWatching = false;
      if (view === 'home') {
        focus = shellFocusSnapshot();
        rowsValue = shellFeature.rows();
        fromContinueWatching = focus.area === 'media' &&
          rowsValue[focus.rowIndex] &&
          rowsValue[focus.rowIndex].kind === 'continue' &&
          sameMediaItem(rowsValue[focus.rowIndex].items[focus.column], item);
      } else if (view === 'library') {
        libraryState = libraryFeature && libraryFeature.snapshot ? libraryFeature.snapshot() : {};
        focused = libraryFeature && libraryFeature.focusedItem ? libraryFeature.focusedItem() : null;
        fromContinueWatching = !!(libraryState.library && libraryState.library.viewKey === 'continue' && sameMediaItem(focused, item));
      }
      return { returnView: view, fromContinueWatching: fromContinueWatching, sourceContext: sourceContext || null };
    }

    function openDetail(item, sourceContext) {
      var resolved = mediaSourceResolver.resolve(item, { candidateContext: sourceContext || null });
      if (!resolved) { shellFeature.showMessage(t('status.libraryUnavailable')); return false; }
      ensurePlayerReady();
      // Keep the logical aggregate so Detail can rank a temporary fallback.
      sourceContext = resolved.fallback ? null : resolved.route.context;
      return detailFeature && detailFeature.open(item, detailOpenOptions(item, sourceContext));
    }
    function playHomeItem(item, sourceContext) {
      var resolved = mediaSourceResolver.resolve(item, { candidateContext: sourceContext || null });
      if (!resolved) { shellFeature.showMessage(t('status.libraryUnavailable')); return false; }
      ensurePlayerReady();
      sourceContext = resolved.fallback ? null : resolved.route.context;
      return detailFeature && detailFeature.playItem(item, detailOpenOptions(item, sourceContext));
    }
    // Global input dispatch, view closure, event wiring, Home loading, bootstrap.
    function updateWatchedAcrossFeatures(ratingKey, watched, sourceContext) {
      var source = sourceContext || null;
      var libraryState = libraryFeature && libraryFeature.snapshot ? libraryFeature.snapshot() : {};
      var reconciled;
      shellFeature.updateWatched(ratingKey, watched, source);
      reconciled = libraryFeature.reconcileWatchedState(ratingKey, watched, source);
      if (reconciled !== false && libraryState.mode === 'library' && libraryFeature.activeLibrary()) {
        libraryFeature.probeContinue();
      }
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
        shellFeature.renderNavigation();
        libraryFeature.recoverPresentation();
      } else {
        revealHome({ focus: 'preserve' });
      }
    }
    function recoverActiveViewAfterNetwork() {
      var detailContext;
      var detailMachine;
      if (librarySources && librarySources.refresh) { librarySources.refresh(function () {}, true); }
      if (currentView() === 'home') { shellFeature.refreshHome(); }
      else if (currentView() === 'library' || currentView() === 'watchlist') { libraryFeature.reloadCurrent(true); }
      else if (currentView() === 'search') { searchFeature.retryAfterNetwork(); }
      else if (currentView() === 'detail') {
        detailContext = detailFeature && detailFeature.sourceContext ? detailFeature.sourceContext() : null;
        detailMachine = String(detailContext && detailContext.serverMachineIdentifier || '');
        if (detailMachine && librarySources && librarySources.serverAvailable && librarySources.serverAvailable(detailMachine) === false) { return; }
        detailFeature.recoverAfterNetwork();
      }
    }
    function destroy() {
      if (destroyed) { return; }
      destroyed = true;
      clearStartupBackgroundChainWatchdog();
      destroyOwned();
    }
    try {
      settingsFeature.applyAccentColor();
      settingsFeature.applyVisualTheme();
      settingsFeature.applyAnimationPreference();
      settingsFeature.applyAccessibilityPreferences();
      shellFeature.start();
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
        { target: document, name: 'visibilitychange', handler: handleVisibilityChange },
        { target: root, name: 'resize', handler: shellFeature.onResize }
      ]);
      });
      markStartup('composition-ready');
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
