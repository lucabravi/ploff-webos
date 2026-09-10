'use strict';

var assert = require('assert');
var ApplicationController = require('../app/coordinator/application-controller');
var Settings = require('../app/settings');
var createHarness = require('./helpers/application-composition-harness').createHarness;

(function onboardingDelegatesToTheReusableSettingsLoadFlow() {
  var status = {
    exists: true,
    currentProfile: null,
    profiles: [
      { id: 'living-id', name: 'Living room', model: 'OLED55' },
      { id: 'bedroom-id', name: 'Bedroom', model: 'OLED42' }
    ]
  };
  var harness = createHarness({
    methodHandlers: {
      'settingsBackup.status': function (callback) { callback(null, status); }
    }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  var finish = harness.capturedOptions.setup.transitions.finish;
  var invocation;

  finish({ returnView: '', selectedServer: null });
  invocation = harness.invocations.filter(function (entry) {
    return entry.owner === 'settings' && entry.method === 'promptSettingsLoad';
  }).pop();

  assert.ok(invocation, 'onboarding must delegate saved-settings decisions to SettingsFeature');
  assert.strictEqual(invocation.args[0], status, 'onboarding must pass the discovered device saves unchanged');
  assert.strictEqual(invocation.args[1].confirmFirst, true, 'onboarding must first ask whether saved settings should be loaded');
  application.destroy();
}());

(function coldStartupMigratesPersistedSettingsBeforeFeatureConstruction() {
  var stored = {};
  stored['ploff.settings.v2'] = JSON.stringify({ version: 2, visualTheme: 'classic', cardScale: 70, settingsBackupMode: 'sync' });
  var harness = createHarness({ Settings: Settings, localStorage: {
    getItem: function (key) { return stored[key] || null; },
    setItem: function (key, value) { stored[key] = value; }
  } });
  var application = ApplicationController.create(harness.root, harness.document, {});
  var activeSettings = harness.capturedOptions.settings.state.getSettings();
  assert.strictEqual(activeSettings.version, Settings.CURRENT_VERSION, 'cold startup must migrate persisted settings before feature construction');
  assert.strictEqual(activeSettings.visualTheme, 'classic', 'cold startup must preserve the saved visual theme through migration');
  assert.strictEqual(activeSettings.settingsBackupMode, 'on', 'cold startup must migrate legacy sync mode before SettingsFeature sees it');
  application.destroy();
}());

(function onboardingLoadedSettingsBecomeTheApplicationStateBeforeHome() {
  var loaded = Settings.validate({ visualTheme: 'classic', cardScale: 70, settingsBackupMode: 'on' });
  var status = { exists: true, currentProfile: null, profiles: [{ id: 'living', name: 'Living room', model: 'OLED55' }] };
  var harness = createHarness({
    Settings: Settings,
    methodHandlers: {
      'settingsBackup.status': function (callback) { callback(null, status); },
      'settings.promptSettingsLoad': function (_status, _options, callback) { callback(null, { settings: loaded }, false); }
    }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.capturedOptions.setup.transitions.finish({ returnView: '', selectedServer: null });
  assert.strictEqual(harness.capturedOptions.settings.state.getSettings(), loaded, 'successful onboarding load must replace the shared application settings state');
  assert.strictEqual(harness.capturedOptions.settings.state.getSettings().visualTheme, 'classic', 'loaded theme must be visible to every feature after onboarding');
  application.destroy();
}());

var expectedCreation = [
  'session', 'server', 'settingsBackup', 'choice', 'mediaInfo', 'assPool', 'assPrefetch', 'shell', 'library', 'detail', 'playerLoader',
  'mediaContext', 'input', 'pointer', 'search', 'settings', 'setup', 'diagnostics', 'events'
];

(function compatibilityMemoryReceivesCurrentDeviceMetadataProvider() {
  var captured = null;
  var memory = {
    clear: function () {}, clearFileExceptions: function () {}, clearFormatRules: function () {},
    recordFailure: function () {}, recordSuccess: function () {}, shouldSkip: function () { return false; },
    snapshot: function () { return { formatRuleCount: 0, fileExceptionCount: 0, fileExceptionTtlDays: 30 }; },
    destroy: function () {}
  };
  var harness = createHarness({
    BuildInfo: { version: '1.0.7' },
    deviceCapabilities: { modelName: 'OLED42' },
    PlaybackCompatibilityMemory: { create: function (options) { captured = options; return memory; } }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  assert.strictEqual(typeof captured.metadata, 'function', 'composition must provide compatibility memory with dynamic device metadata');
  assert.deepStrictEqual(captured.metadata(), { model: 'OLED42', runtime: 'composition-test', appVersion: '1.0.7' }, 'compatibility metadata must identify the current TV/runtime/app without media identities');
  application.destroy();
}());

(function watchedChangesInvalidateLibraryStateAcrossFeatureBoundaries() {
  var harness = createHarness({
    methodReturns: { 'library.activeLibrary': { key: '1', title: 'Anime' } }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  var onWatchedChanged = harness.capturedOptions.detail.transitions.onWatchedChanged;
  onWatchedChanged('show-42', true);
  assert.ok(harness.invocations.some(function (entry) {
    return entry.owner === 'library' && entry.method === 'reconcileWatchedState' &&
      entry.args[0] === 'show-42' && entry.args[1] === true;
  }), 'watched changes must invalidate Library membership/cache state before returning from Detail');
  application.destroy();
}());

(function mediaContextMutationsInvalidateLibraryDataOutsideTheLibrarySurface() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.capturedOptions.mediaContext.refresh({ item: { ratingKey: 'movie-7' }, view: 'home' });
  assert.ok(harness.invocations.some(function (entry) {
    return entry.owner === 'library' && entry.method === 'reconcileContentMutation';
  }), 'media-context mutations from Home/Search/Detail must invalidate cached Library data before a later re-entry');
  application.destroy();
}());

(function updateCheckStartsOnlyFromThePostHomeHook() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  assert.strictEqual(harness.calls.indexOf('release:check'), -1, 'application construction must not start the update request');
  harness.capturedOptions.shell.transitions.onHomeReady();
  assert.ok(harness.calls.indexOf('release:check') >= 0, 'the first successful Home presentation owns the lazy update trigger');
  assert.ok(harness.calls.indexOf('scheduleWatchlistWarm:library') >= 0, 'the first successful Home presentation must schedule background Watchlist warming');
  application.destroy();
}());

(function destroysOwnersInExactReverseConstructionOrder() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});

  assert.deepStrictEqual(harness.createOrder, expectedCreation, 'composition must register owners in actual construction order');
  application.destroy();
  assert.deepStrictEqual(
    harness.destroyOrder,
    expectedCreation.slice().reverse(),
    'composition teardown must be the exact reverse of successful owner construction'
  );
  application.destroy();
  assert.strictEqual(harness.destroyOrder.length, expectedCreation.length, 'composition teardown must remain idempotent');
}());

(function constructorFailureCleansEveryPreviouslyCreatedOwner() {
  var harness = createHarness({ failCreate: 'search' });
  assert.throws(function () {
    ApplicationController.create(harness.root, harness.document, {});
  }, /create failed: search/, 'the original constructor error must be rethrown');
  assert.deepStrictEqual(
    harness.destroyOrder,
    ['pointer', 'input', 'mediaContext', 'playerLoader', 'detail', 'library', 'shell', 'assPrefetch', 'assPool', 'mediaInfo', 'choice', 'settingsBackup', 'server', 'session'],
    'a middle constructor failure must clean every earlier owner in reverse order'
  );
}());

(function constructorFailureWinsOverCleanupFailure() {
  var harness = createHarness({ failCreate: 'search', failDestroy: 'pointer' });
  assert.throws(function () {
    ApplicationController.create(harness.root, harness.document, {});
  }, /create failed: search/, 'cleanup failure must not replace the original construction error');
  assert.deepStrictEqual(
    harness.destroyOrder,
    ['pointer', 'input', 'mediaContext', 'playerLoader', 'detail', 'library', 'shell', 'assPrefetch', 'assPool', 'mediaInfo', 'choice', 'settingsBackup', 'server', 'session'],
    'cleanup must continue after one owner destroy throws'
  );
}());

(function eventBindingFailureCleansAllFeatureOwners() {
  var harness = createHarness({ failCreate: 'events' });
  assert.throws(function () {
    ApplicationController.create(harness.root, harness.document, {});
  }, /create failed: events/);
  assert.deepStrictEqual(
    harness.destroyOrder,
    expectedCreation.slice(0, -1).reverse(),
    'event binding failure must clean all already-created feature owners'
  );
}());

(function startupFailureBeforeEventBindingCleansAllFeatureOwners() {
  var harness = createHarness({ failStartup: 'shell.start' });
  assert.throws(function () {
    ApplicationController.create(harness.root, harness.document, {});
  }, /startup failed: shell\.start/);
  assert.deepStrictEqual(
    harness.destroyOrder,
    expectedCreation.slice(0, -1).reverse(),
    'startup failure before event binding must clean all feature owners'
  );
}());

(function visualPreferencesAreAppliedBeforeTheFirstShellRender() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var themeIndex = harness.calls.indexOf('applyVisualTheme:settings');
  var shellIndex = harness.calls.indexOf('start:shell');
  var accessibilityIndex = harness.calls.indexOf('applyAccessibilityPreferences:settings');
  assert.ok(themeIndex !== -1 && shellIndex !== -1, 'startup must apply the visual theme and start the shell');
  assert.ok(themeIndex < shellIndex, 'the visual theme must be active before the first Home render');
  assert.ok(accessibilityIndex < shellIndex, 'safe-area preferences must be active before the first Home render');
  application.destroy();
}());

(function startupFailureAfterEventBindingDestroysEventsFirst() {
  var harness = createHarness({ failStartup: 'server.bootstrap' });
  assert.throws(function () {
    ApplicationController.create(harness.root, harness.document, {});
  }, /startup failed: server\.bootstrap/);
  assert.deepStrictEqual(
    harness.destroyOrder,
    expectedCreation.slice().reverse(),
    'startup failure after event binding must destroy the event binding before feature owners'
  );
}());

(function detailOriginsAreRestoredThroughExecutableCompositionPorts() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var transitions = harness.capturedOptions.detail.transitions;
  var searchCallStart;
  var libraryCallStart;
  var homeCallStart;

  transitions.enterDetail('search', { ratingKey: 'search-item' });
  assert.strictEqual(application.view(), 'detail');
  assert.strictEqual(application.session().returnView, 'search');
  assert.strictEqual(application.session().selectedItem.ratingKey, 'search-item');
  searchCallStart = harness.calls.length;
  transitions.restoreOrigin('search');
  assert.strictEqual(application.view(), 'search');
  assert.ok(harness.calls.slice(searchCallStart).indexOf('hideHomeSurface:shell') !== -1);
  assert.ok(harness.calls.slice(searchCallStart).indexOf('resume:search') !== -1);

  transitions.enterDetail('library', { ratingKey: 'library-item' });
  libraryCallStart = harness.calls.length;
  transitions.restoreOrigin('library');
  assert.strictEqual(application.view(), 'library');
  assert.ok(harness.calls.slice(libraryCallStart).indexOf('recoverPresentation:library') !== -1);

  transitions.enterDetail('watchlist', { ratingKey: 'watchlist-item' });
  libraryCallStart = harness.calls.length;
  transitions.restoreOrigin('watchlist');
  assert.strictEqual(application.view(), 'watchlist');
  assert.ok(harness.calls.slice(libraryCallStart).indexOf('recoverPresentation:library') !== -1);

  transitions.enterDetail('home', { ratingKey: 'home-item' });
  homeCallStart = harness.calls.length;
  transitions.restoreOrigin('home');
  assert.strictEqual(application.view(), 'home');
  assert.ok(harness.calls.slice(homeCallStart).indexOf('enterHome:shell') !== -1);

  application.destroy();
}());

(function enteringLibraryFromHomeClosesTheHomeSurface() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var transitions = harness.capturedOptions.shell.transitions;
  var start = harness.calls.length;

  assert.strictEqual(application.view(), 'home');
  transitions.commitNavigationView({ kind: 'library', key: 'anime' }, 1, false);
  assert.ok(harness.calls.slice(start).indexOf('hideHomeSurface:shell') !== -1, 'entering a library from Home must hide the Immersive Home surface');
  assert.ok(harness.calls.slice(start).indexOf('enterLibrary:library') !== -1, 'entering a library must delegate content loading to the library feature');

  application.destroy();
}());

(function returningFromPlayerClosesTheHomeSurfaceBeforeDetailIsShown() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.warmPlayer();
  var state = harness.capturedOptions.player.state;
  var start = harness.calls.length;

  state.enterDetail();
  assert.strictEqual(application.view(), 'detail');
  assert.ok(harness.calls.slice(start).indexOf('hideHomeSurface:shell') !== -1, 'Player return must remove the Home hero for every visual theme');

  application.destroy();
}());

(function openingDetailPreservesTheThemeWhileBrowsingSurfacesClose() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var transitions = harness.capturedOptions.detail.transitions;
  var invocation;

  transitions.enterDetail('home', { ratingKey: 'home-item' });
  transitions.hideBrowsingSurfaces();
  invocation = harness.invocations.filter(function (entry) {
    return entry.owner === 'search' && entry.method === 'leave';
  }).pop();

  assert.ok(invocation, 'opening Detail must close the Search surface');
  assert.strictEqual(invocation.args[0].keepImages, true, 'Detail keeps already-rendered browsing images during its transition');
  assert.strictEqual(invocation.args[0].preserveBackgroundAudio, true, 'closing inactive Search must not stop the theme selected on Home');
  application.destroy();
}());

(function homeInputSnapshotAvoidsInactiveFeatureSnapshots() {
  var harness = createHarness({
    methodReturns: {
      'settings.snapshot': { upNext: { open: false }, privacyOpen: false },
      'shell.navigationSnapshot': {
        reorderMode: false,
        reorderReady: false,
        holdActive: false,
        holdTriggered: false
      },
      'shell.focusState': { area: 'media', navIndex: 0, rowIndex: 0, column: 0 },
      'shell.viewStateOpen': false,
      'player.snapshot': {
        resumeChoiceOpen: false,
        errorOpen: false,
        subtitleEditorOpen: false
      }
    }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  var snapshotsBefore = harness.sessionSnapshotCalls();
  var invocationsBefore = harness.invocations.length;
  var sessionState = harness.capturedOptions.input.sessionSnapshot();
  var eventInvocations = harness.invocations.slice(invocationsBefore);

  assert.strictEqual(sessionState.appView, 'home');
  assert.strictEqual(
    harness.sessionSnapshotCalls() - snapshotsBefore,
    0,
    'input routing must read the active view without cloning the full application session'
  );
  assert.strictEqual(
    eventInvocations.filter(function (entry) { return entry.owner === 'player' && entry.method === 'snapshot'; }).length,
    0,
    'a Home key event must not clone Player state'
  );
  assert.strictEqual(
    eventInvocations.filter(function (entry) { return entry.owner === 'settings' && entry.method === 'snapshot'; }).length,
    0,
    'a Home key event must not clone Settings state'
  );
  assert.strictEqual(
    eventInvocations.filter(function (entry) { return entry.owner === 'shell' && entry.method === 'focusState'; }).length,
    1,
    'a Home key event must read Shell focus only once'
  );
  assert.strictEqual(
    eventInvocations.filter(function (entry) { return entry.owner === 'shell' && entry.method === 'navigationSnapshot'; })[0].args[0].area,
    'media',
    'the navigation snapshot must reuse the already-read Home focus'
  );
  application.destroy();
}());

(function inputSnapshotDistinguishesContentEntriesFromSpecialNavbarControls() {
  var harness = createHarness({
    methodReturns: {
      'shell.navigationItems': [{ kind: 'home' }, { kind: 'settings' }],
      'shell.navigationSnapshot': { index: 1, reorderMode: false, reorderReady: false, holdActive: false, holdTriggered: false },
      'shell.focusState': { area: 'nav', navIndex: 1, rowIndex: 0, column: 0 },
      'shell.viewStateOpen': false
    }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  var sessionState = harness.capturedOptions.input.sessionSnapshot();

  assert.strictEqual(sessionState.navigationHasFocus, true);
  assert.strictEqual(sessionState.navigationContentEntryFocused, true, 'normal navbar entries must synchronize their page before focus leaves navigation');
  application.destroy();

  harness = createHarness({
    methodReturns: {
      'shell.navigationItems': [{ kind: 'home' }, { kind: 'settings' }],
      'shell.navigationSnapshot': { index: 2, reorderMode: false, reorderReady: false, holdActive: false, holdTriggered: false },
      'shell.focusState': { area: 'nav', navIndex: 2, rowIndex: 0, column: 0 },
      'shell.viewStateOpen': false
    }
  });
  application = ApplicationController.create(harness.root, harness.document, {});
  sessionState = harness.capturedOptions.input.sessionSnapshot();

  assert.strictEqual(sessionState.navigationContentEntryFocused, false, 'activity and profile controls must keep their dedicated Down behavior');
  application.destroy();
}());

(function playerInputSnapshotKeepsPlayerOverlaysWithoutInactiveSettingsState() {
  var harness = createHarness({
    methodReturns: {
      'shell.navigationSnapshot': { reorderMode: false, reorderReady: false, holdActive: false, holdTriggered: false },
      'shell.viewStateOpen': false,
      'player.snapshot': { resumeChoiceOpen: true, queueGapOpen: true, errorOpen: true, subtitleEditorOpen: true }
    }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.warmPlayer();
  var invocationsBefore;
  var sessionState;
  var eventInvocations;

  harness.capturedOptions.player.state.setView('player');
  invocationsBefore = harness.invocations.length;
  sessionState = harness.capturedOptions.input.sessionSnapshot();
  eventInvocations = harness.invocations.slice(invocationsBefore);

  assert.strictEqual(sessionState.appView, 'player');
  assert.strictEqual(sessionState.resumeChoiceOpen, true);
  assert.strictEqual(sessionState.queueGapOpen, true);
  assert.strictEqual(sessionState.playerErrorOpen, true);
  assert.strictEqual(sessionState.subtitleEditorOpen, true);
  assert.strictEqual(eventInvocations.filter(function (entry) { return entry.owner === 'player' && entry.method === 'snapshot'; }).length, 1, 'Player input must read one compact feature snapshot');
  assert.strictEqual(eventInvocations.filter(function (entry) { return entry.owner === 'settings' && entry.method === 'snapshot'; }).length, 0, 'Player input must not query inactive Settings state');
  application.destroy();
}());

(function homePointerSnapshotAvoidsInactiveFeatureSnapshots() {
  var harness = createHarness({
    methodReturns: {
      'shell.navigationSnapshot': {
        reorderMode: false,
        reorderReady: false,
        holdActive: false,
        holdTriggered: false
      },
      'shell.focusState': { area: 'media', navIndex: 0, rowIndex: 0, column: 0 },
      'player.controlsSnapshot': { mode: 'hidden', chapter: { open: false }, settingsOpen: false },
      'player.snapshot': { resumeChoiceOpen: false, subtitleEditorOpen: false },
      'settings.snapshot': { privacyOpen: false, languageKind: 'ui' },
      'library.snapshot': { library: {}, watchlist: {} },
      'search.snapshot': { focus: {} }
    }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  var invocationsBefore = harness.invocations.length;
  var sessionState = harness.capturedOptions.pointer.sessionSnapshot();
  var eventInvocations = harness.invocations.slice(invocationsBefore);
  var inactiveOwners = ['player', 'settings', 'library', 'search', 'detail', 'server'];

  assert.strictEqual(sessionState.appView, 'home');
  inactiveOwners.forEach(function (ownerName) {
    assert.strictEqual(
      eventInvocations.filter(function (entry) { return entry.owner === ownerName; }).length,
      0,
      'a Home pointer event must not query inactive ' + ownerName + ' state'
    );
  });
  assert.strictEqual(
    eventInvocations.filter(function (entry) { return entry.owner === 'shell' && entry.method === 'focusState'; }).length,
    1,
    'a Home pointer event must read Shell focus only once'
  );
  assert.strictEqual(
    eventInvocations.filter(function (entry) { return entry.owner === 'shell' && entry.method === 'navigationSnapshot'; })[0].args[0].area,
    'media',
    'pointer routing must reuse the already-read Home focus for navigation state'
  );
  application.destroy();
}());

(function playlistRestorePortPreservesOriginAndCurrentQueueItem() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.warmPlayer();
  var restore = harness.capturedOptions.player.library.restoreContainerOrigin;
  var received = null;
  var request = {
    origin: { kind: 'playlist', containerKey: '/playlists/42/items', ratingKey: '42' },
    queueItems: [
      { ratingKey: 'episode-a', title: 'A' },
      { ratingKey: 'episode-b', title: 'B' },
      { ratingKey: 'episode-c', title: 'C' }
    ],
    queueIndex: 1,
    openUnopened: true
  };

  harness.created.library.restoreContainerOrigin = function (options) {
    received = options;
    return true;
  };

  assert.strictEqual(restore(request), true);
  assert.strictEqual(received.origin.containerKey, '/playlists/42/items');
  assert.strictEqual(received.queueIndex, 1);
  assert.strictEqual(received.queueItems[received.queueIndex].ratingKey, 'episode-b');
  assert.strictEqual(received.openUnopened, true);
  application.destroy();
}());

(function playerMediaInfoCloseRestoresPlayerSettingsThroughComposition() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.warmPlayer();
  var openMediaInfo = harness.capturedOptions.player.dialogs.openMediaInfo;
  var closeCallback = harness.capturedOptions.mediaInfo.onClosed;
  var start;

  harness.created.mediaInfo.open = function (model, origin) {
    assert.deepStrictEqual(model, { title: 'Episode' });
    assert.strictEqual(origin, 'player');
    return true;
  };
  assert.strictEqual(openMediaInfo({ title: 'Episode' }, 'player'), true);

  start = harness.calls.length;
  closeCallback('player');
  assert.deepStrictEqual(
    harness.calls.slice(start),
    ['onMediaInfoClosed:player'],
    'closing player media information must restore the existing player settings owner'
  );
  application.destroy();
}());


(function libraryAndWatchlistDetailTransitionsPreserveTheirOrigins() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var libraryTransitions = harness.capturedOptions.library.transitions;
  var detailTransitions = harness.capturedOptions.detail.transitions;
  var libraryItem = { ratingKey: 'library-card' };
  var watchlistItem = { ratingKey: 'watchlist-card' };
  var invocation;

  libraryTransitions.setView('library');
  libraryTransitions.openDetail(libraryItem);
  invocation = harness.invocations[harness.invocations.length - 1];
  assert.strictEqual(invocation.owner, 'detail');
  assert.strictEqual(invocation.method, 'open');
  assert.strictEqual(invocation.args[0], libraryItem);
  assert.strictEqual(invocation.args[1].returnView, 'library', 'Library detail opening must capture Library as its origin');
  detailTransitions.enterDetail('library', libraryItem);
  detailTransitions.restoreOrigin('library');
  assert.strictEqual(application.view(), 'library');

  libraryTransitions.setView('watchlist');
  libraryTransitions.openDetail(watchlistItem);
  invocation = harness.invocations[harness.invocations.length - 1];
  assert.strictEqual(invocation.args[1].returnView, 'watchlist', 'Watchlist detail opening must capture Watchlist as its origin');
  detailTransitions.enterDetail('watchlist', watchlistItem);
  detailTransitions.restoreOrigin('watchlist');
  assert.strictEqual(application.view(), 'watchlist');
  application.destroy();
}());

(function playlistAndPlayerMediaInfoPortsPreserveReturnContext() {
  var harness = createHarness({ methodReturns: { 'library.restoreContainerOrigin': true } });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.warmPlayer();
  var queueItems = [{ ratingKey: 'first' }, { ratingKey: 'playing' }, { ratingKey: 'last' }];
  var origin = { kind: 'playlist', containerRatingKey: 'playlist-7' };
  var invocation;

  assert.strictEqual(harness.capturedOptions.player.library.restoreContainerOrigin({
    origin: origin,
    queueItems: queueItems,
    queueIndex: 1,
    openUnopened: true
  }), true, 'Player must receive the Library restoration result');
  invocation = harness.invocations[harness.invocations.length - 1];
  assert.strictEqual(invocation.owner, 'library');
  assert.strictEqual(invocation.method, 'restoreContainerOrigin');
  assert.strictEqual(invocation.args[0].origin, origin);
  assert.strictEqual(invocation.args[0].queueItems, queueItems);
  assert.strictEqual(invocation.args[0].queueIndex, 1, 'the currently playing queue index must cross the composition boundary unchanged');
  assert.strictEqual(invocation.args[0].queueItems[invocation.args[0].queueIndex].ratingKey, 'playing');

  harness.capturedOptions.mediaInfo.onClosed('player');
  invocation = harness.invocations[harness.invocations.length - 1];
  assert.strictEqual(invocation.owner, 'player');
  assert.strictEqual(invocation.method, 'onMediaInfoClosed', 'closing Player media info must return focus to Player settings');
  application.destroy();
}());

(function activeViewNetworkRecoveryUsesTheOwningFeature() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var detailTransitions = harness.capturedOptions.detail.transitions;
  var recover = harness.capturedOptions.server.application.recoverAfterNetwork;
  var start;

  detailTransitions.enterDetail('search', { ratingKey: 'item' });
  detailTransitions.restoreOrigin('search');
  start = harness.calls.length;
  recover();
  assert.deepStrictEqual(harness.calls.slice(start), ['retryAfterNetwork:search']);

  detailTransitions.enterDetail('library', { ratingKey: 'item' });
  detailTransitions.restoreOrigin('library');
  start = harness.calls.length;
  recover();
  assert.deepStrictEqual(harness.calls.slice(start), ['reloadCurrent:library']);

  detailTransitions.enterDetail('home', { ratingKey: 'item' });
  detailTransitions.restoreOrigin('home');
  start = harness.calls.length;
  recover();
  assert.deepStrictEqual(harness.calls.slice(start), ['refreshHome:shell']);

  detailTransitions.enterDetail('home', { ratingKey: 'item' });
  start = harness.calls.length;
  recover();
  assert.deepStrictEqual(harness.calls.slice(start), ['recoverAfterNetwork:detail']);

  application.destroy();
}());


(function serverPublicationUsesOnlyDocumentedSessionFields() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var publish = harness.capturedOptions.server.state.publish;
  var patch;

  publish({
    activeProfile: { id: 'profile' },
    activeServer: { id: 'server' },
    config: { apiBaseUrl: 'http://server' },
    networkSnapshot: { online: true },
    serverState: { phase: 'ready' }
  });
  patch = harness.sessionUpdates[harness.sessionUpdates.length - 1];
  assert.deepStrictEqual(
    Object.keys(patch).sort(),
    ['activeProfile', 'activeServer', 'config'],
    'server publication must not pretend that undocumented session fields are shared'
  );
  application.destroy();
}());

(function lateDeviceCapabilityCallbackCannotMutateDestroyedComposition() {
  var harness = createHarness({ deferDevice: true });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.warmPlayer();
  var playbackCapabilities = harness.capturedOptions.player.data.playbackCapabilities;
  assert.strictEqual(playbackCapabilities().directPlay, false);
  application.destroy();
  harness.completeDevice({ directPlay: true });
  assert.strictEqual(playbackCapabilities().directPlay, false, 'late startup callbacks must be ignored after root teardown');
}());


(function diagnosticsPortsResolveLivePlaybackAndServerOwners() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.warmPlayer();
  var options = harness.capturedOptions.diagnostics;
  var start = harness.calls.length;

  options.state.playbackSnapshot();
  options.state.playbackDiagnostics();
  options.transport.loadIdentity(function () {});
  assert.deepStrictEqual(harness.calls.slice(start), [
    'playbackSnapshot:player',
    'playbackDiagnostics:player',
    'loadServerIdentity:server'
  ], 'diagnostics must resolve live playback and local identity through its explicit composition ports');
  application.destroy();
}());




(function injectsSharedPresentationServicesOutsideShell() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.warmPlayer();
  var services = harness.capturedOptions.shell.presentationServices;

  assert.strictEqual(typeof services.t, 'function', 'composition must construct the shared translation service');
  assert.strictEqual(harness.capturedOptions.library.shell.element, services.element, 'Library must receive element creation directly from presentation services');
  assert.strictEqual(harness.capturedOptions.detail.shell.mediaTitle, services.mediaTitle, 'Detail must receive media labels directly from presentation services');
  assert.strictEqual(harness.capturedOptions.player.shell.artworkUrl, services.artworkUrl, 'Player must receive artwork formatting directly from presentation services');
  assert.strictEqual(harness.capturedOptions.settings.presentation.setText, services.setText, 'Settings must receive text updates directly from presentation services');
  assert.strictEqual(harness.capturedOptions.setup.presentation.element, services.element, 'Setup must receive element creation directly from presentation services');
  assert.strictEqual(harness.capturedOptions.diagnostics.presentation.setText, services.setText, 'Diagnostics must receive text updates directly from presentation services');

  application.destroy();
}());

(function injectsNarrowPlexPortsPerFeature() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.warmPlayer();
  function keys(value) { return Object.keys(value || {}).sort(); }

  assert.deepStrictEqual(keys(harness.capturedOptions.server.modules.PlexClient), [
    'loadAccountProfile', 'loadActivities', 'loadNavigation', 'loadServerIdentity'
  ], 'Server must receive only account, activity, navigation, and identity transport');
  assert.deepStrictEqual(keys(harness.capturedOptions.shell.data.PlexClient), [
    'loadHome', 'loadMetadata', 'posterUrl'
  ], 'Shell must receive only Home, theme metadata, and artwork transport');
  assert.deepStrictEqual(keys(harness.capturedOptions.search.PlexClient), [
    'findByGuid', 'search'
  ], 'Search must receive only local search and GUID resolution transport');
  assert.deepStrictEqual(keys(harness.capturedOptions.library.data.PlexClient), [
    'findByGuid', 'loadLibraryContainerPage', 'loadLibraryFilterOptions',
    'loadLibraryPage', 'loadLibraryRecommendations', 'refreshLibrary',
    'refreshLibraryMetadata'
  ], 'Library must receive only library and container transport');
  assert.deepStrictEqual(keys(harness.capturedOptions.detail.data.PlexClient), [
    'loadExtras', 'loadMediaProfile', 'loadMetadata', 'loadSeasonEpisodes', 'loadSeriesContext',
    'refreshMetadata', 'setWatchedAndReset'
  ], 'Detail must receive only detail, series, mutation, and refresh transport');
  assert.deepStrictEqual(keys(harness.capturedOptions.player.data.PlexClient), [
    'loadLibraryContainerPage', 'loadMetadata', 'loadPlayback', 'loadSeasonEpisodes',
    'loadSubtitleText', 'pingTranscode', 'posterUrl', 'preparePlayback',
    'rotateTranscodeSession', 'sendTimeline', 'setStreamSelection', 'setSubtitleOffset'
  ], 'Player must receive only playback, queue, metadata, artwork, subtitle, and timeline transport');
  assert.deepStrictEqual(keys(harness.capturedOptions.mediaContext.transport), [
    'removeFromContinueWatching', 'resetProgress', 'setWatchedAndReset'
  ], 'Media Context must receive only its three mutation operations');
  assert.strictEqual(harness.capturedOptions.mediaContext.PlexClient, undefined, 'Media Context must not receive the complete Plex client');
  assert.deepStrictEqual(keys(harness.capturedOptions.settingsBackup.transport), [
    'create', 'list', 'remove', 'update'
  ], 'Settings backup must receive only its four playlist persistence operations');
  assert.notStrictEqual(harness.capturedOptions.settingsBackup.transport.list, harness.root.PloffClient.loadSettingsBackupPlaylists,
    'Settings backup transport must come through the reviewed Plex feature-port boundary instead of the raw client');

  application.destroy();
}());


(function playerCompositionPublishesNativeVideoDriverCapability() {
  var NativeVideoDriver = { create: function () {} };
  var harness = createHarness({ NativeVideoDriver: NativeVideoDriver });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.warmPlayer();

  assert.strictEqual(harness.capturedOptions.player.modules.NativeVideoDriver, NativeVideoDriver,
    'Application composition must pass NativeVideoDriver through the Player module boundary');
  application.destroy();
}());

(function playerCompositionPublishesPlaybackRepositionCapability() {
  var PlaybackReposition = { create: function () {} };
  var harness = createHarness({ PlaybackReposition: PlaybackReposition });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.warmPlayer();

  assert.strictEqual(harness.capturedOptions.player.modules.PlaybackReposition, PlaybackReposition,
    'Application composition must pass PlaybackReposition through the Player module boundary');
  application.destroy();
}());

(function playerCompositionPublishesPlaybackSessionCapability() {
  var PlaybackSession = { create: function () {} };
  var harness = createHarness({ PlaybackSession: PlaybackSession });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.warmPlayer();

  assert.strictEqual(harness.capturedOptions.player.modules.PlaybackSession, PlaybackSession,
    'Application composition must pass PlaybackSession through the Player module boundary');
  application.destroy();
}());

(function playerCompositionPublishesPlaybackTimelineCapability() {
  var PlaybackTimeline = { create: function () {} };
  var harness = createHarness({ PlaybackTimeline: PlaybackTimeline });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.warmPlayer();

  assert.strictEqual(harness.capturedOptions.player.modules.PlaybackTimeline, PlaybackTimeline,
    'Application composition must pass PlaybackTimeline through the Player module boundary');
  application.destroy();
}());

(function playerCompositionPublishesSubtitleRuntimeCapability() {
  var SubtitleRuntime = { create: function () {} };
  var harness = createHarness({ SubtitleRuntime: SubtitleRuntime });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.warmPlayer();

  assert.strictEqual(harness.capturedOptions.player.modules.SubtitleRuntime, SubtitleRuntime,
    'Application composition must pass SubtitleRuntime through the Player module boundary');
  application.destroy();
}());

(function applicationStartupPrewarmsTheApplicationAssPoolAndPlayerReceivesItsFactory() {
  var prewarms = 0;
  var destroyed = 0;
  var receivedRendererModule = null;
  var html5Renderer = { create: function () {} };
  var libassRenderer = { create: function () {} };
  var pooledFactory = { create: function () {} };
  var pool = {
    prewarm: function () { prewarms += 1; },
    create: pooledFactory.create,
    destroy: function () { destroyed += 1; }
  };
  var harness = createHarness({
    AssHtml5SubtitleRenderer: html5Renderer,
    AssSubtitleRenderer: libassRenderer,
    AssSubtitleRendererPool: { create: function (options) { receivedRendererModule = options.rendererModule; return pool; } },
    Settings: { load: function () { return { subtitleRenderingAss: true }; }, seedFromPlex: function (settings) { return settings; } }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  assert.strictEqual(prewarms, 1, 'ASS warmup must start during application composition');
  harness.capturedOptions.shell.transitions.onHomeReady();
  assert.strictEqual(prewarms, 1, 'Home readiness must not start a second ASS warmup');
  assert.strictEqual(harness.created.player, undefined, 'ASS prewarm must not depend on Player construction');
  harness.warmPlayer();
  assert.strictEqual(harness.capturedOptions.player.modules.AssSubtitleRenderer, pool,
    'Player subtitle runtime must receive the application-owned renderer pool');
  assert.strictEqual(receivedRendererModule, libassRenderer,
    'the production local ASS pool must use the optimized libass renderer even when an experimental renderer is present');
  application.destroy();
  assert.strictEqual(destroyed, 1, 'application teardown must destroy the warm ASS worker');
}());

(function firstHomeReadyDefersOneShotLegacyGlyphWarmupUntilAfterPresentation() {
  var warms = 0;
  var scheduled = [];
  var preloader = { warm: function () { warms += 1; return true; } };
  var harness = createHarness({
    AssSubtitleWorkerPreloader: preloader,
    Settings: { load: function () { return { subtitleRenderingAss: true }; }, seedFromPlex: function (settings) { return settings; } },
    setTimeout: function (callback, delay) { scheduled.push({ callback: callback, delay: delay }); return scheduled.length; }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  assert.strictEqual(warms, 0, 'expensive glyph warmup must not compete with initial Home construction');
  harness.capturedOptions.shell.transitions.onHomeReady();
  assert.strictEqual(warms, 0, 'Home-ready hook must yield one paint before starting expensive worker-side rasterization');
  assert.strictEqual(scheduled.filter(function (entry) { return entry.delay === 0; }).length, 1, 'first Home readiness must schedule exactly one deferred ASS glyph warmup');
  assert.strictEqual(scheduled[0].delay, 0, 'ASS glyph warmup remains the earliest deferred work');
  assert.ok(scheduled[1].delay > 0, 'Player must have a separate later warm timer');
  scheduled.shift().callback();
  assert.strictEqual(warms, 1, 'deferred Home callback must start the legacy worker glyph warmup');
  harness.capturedOptions.shell.transitions.onHomeReady();
  assert.strictEqual(scheduled.filter(function (entry) { return entry.delay === 0; }).length, 0, 'later Home presentations must not schedule another synthetic warmup');
  assert.strictEqual(warms, 1, 'legacy glyph warmup must remain one-shot for the application lifetime');
  application.destroy();
}());

(function disabledGlobalAssRenderingSkipsAllProactiveAssWork() {
  var prewarms = 0;
  var warms = 0;
  var scheduled = [];
  var pool = {
    prewarm: function () { prewarms += 1; },
    create: function () {},
    destroy: function () {}
  };
  var preloader = {
    start: function () { throw new Error('disabled ASS must not start the preloader'); },
    warm: function () { warms += 1; return true; }
  };
  var harness = createHarness({
    AssSubtitleRendererPool: { create: function () { return pool; } },
    AssSubtitleWorkerPreloader: preloader,
    Settings: { load: function () { return { subtitleRenderingAss: false }; }, seedFromPlex: function (settings) { return settings; } },
    setTimeout: function (callback, delay) { scheduled.push({ callback: callback, delay: delay }); return scheduled.length; }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  assert.strictEqual(prewarms, 0, 'disabled global ASS rendering must skip application pool prewarm');
  harness.capturedOptions.shell.transitions.onHomeReady();
  assert.strictEqual(scheduled.filter(function (entry) { return entry.delay === 0; }).length, 0, 'disabled global ASS rendering must not schedule Home glyph warmup');
  assert.strictEqual(warms, 0, 'disabled global ASS rendering must not warm the worker');
  assert.strictEqual(harness.capturedOptions.detail.data.onAssPrefetchCandidate(
    { ratingKey: 'ep' },
    { ratingKey: 'ep', partId: 'part' },
    { subtitleTrack: { id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/sub.ass' } }
  ), false, 'disabled global ASS rendering must reject speculative ASS prefetch candidates');
  application.destroy();
}());

(function disablingGlobalAssCancelsPendingProactiveWork() {
  var warms = 0;
  var scheduled = [];
  var cancelled = 0;
  var prefetchOwner = {
    request: function () { return true; },
    snapshot: function () { return { activeIdentity: 'active-ass', cachedIdentity: '' }; },
    cancelSpeculative: function () { cancelled += 1; },
    destroy: function () {}
  };
  var harness = createHarness({
    AssSubtitlePrefetch: { create: function () { return prefetchOwner; } },
    AssSubtitleWorkerPreloader: { start: function () { return true; }, warm: function () { warms += 1; return true; } },
    Settings: { load: function () { return { subtitleRenderingAss: true }; }, seedFromPlex: function (settings) { return settings; } },
    setTimeout: function (callback, delay) { scheduled.push({ callback: callback, delay: delay }); return scheduled.length; }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.capturedOptions.shell.transitions.onHomeReady();
  assert.strictEqual(scheduled.filter(function (entry) { return entry.delay === 0; }).length, 1, 'enabled ASS may schedule the deferred Home warmup');
  harness.capturedOptions.settings.state.setSettings({ subtitleRenderingAss: false });
  assert.strictEqual(cancelled, 1, 'disabling global ASS must cancel speculative prefetch already in flight');
  scheduled[0].callback();
  assert.strictEqual(warms, 0, 'a Home warmup scheduled while enabled must be skipped if ASS becomes globally disabled before it runs');
  application.destroy();
}());


(function disablingGlobalAssDetectsInPlaceSettingsMutation() {
  var cancelled = 0;
  var prefetchOwner = {
    request: function () { return true; },
    snapshot: function () { return { activeIdentity: 'active-ass', cachedIdentity: '' }; },
    cancelSpeculative: function () { cancelled += 1; },
    destroy: function () {}
  };
  var harness = createHarness({
    AssSubtitlePrefetch: { create: function () { return prefetchOwner; } },
    Settings: { load: function () { return { subtitleRenderingAss: true }; }, seedFromPlex: function (settings) { return settings; } }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  var sharedSettings = harness.capturedOptions.settings.state.getSettings();
  sharedSettings.subtitleRenderingAss = false;
  harness.capturedOptions.settings.state.setSettings(sharedSettings);
  assert.strictEqual(cancelled, 1,
    'ASS disable must be detected even when SettingsController mutates the shared settings object before publishing it');
  application.destroy();
}());

(function compositionSharesOneAssPrefetchOwnerAcrossDetailAndPlayer() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.warmPlayer();
  assert.strictEqual(typeof harness.capturedOptions.assPrefetch.PlexClient.loadPlayback, 'function',
    'ASS prefetch must receive the Player playback-loading capability');
  assert.strictEqual(harness.capturedOptions.assPrefetch.PlexClient.unexpected, undefined,
    'ASS prefetch must not receive the unrestricted PlexClient compatibility surface');
  assert.strictEqual(typeof harness.capturedOptions.detail.data.onAssPrefetchCandidate, 'function',
    'Detail must receive the current-item ASS prefetch publication port');
  assert.strictEqual(harness.capturedOptions.player.data.AssSubtitlePrefetch, harness.created.assPrefetch,
    'Player must receive the application-owned one-entry ASS prefetch owner');
  assert.strictEqual(typeof harness.capturedOptions.player.data.prefetchCurrentAss, 'function',
    'Player must receive the foreground current-item promotion port');
  assert.strictEqual(typeof harness.capturedOptions.player.data.prefetchNextAss, 'function',
    'Player must receive the timed next-item prefetch port');
  application.destroy();
}());

(function playerCompositionPublishesPlayerQueueCapability() {
  var PlayerQueueController = { create: function () {} };
  var harness = createHarness({ PlayerQueueController: PlayerQueueController });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.warmPlayer();

  assert.strictEqual(harness.capturedOptions.player.modules.PlayerQueueController, PlayerQueueController,
    'Application composition must pass PlayerQueueController through the Player module boundary');
  application.destroy();
}());

(function serverSwitchLifecycleSuspendsSettingsAndReloadsHome() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.warmPlayer();
  var transition = harness.capturedOptions.server.transitions.serverSwitched;
  var start;

  harness.capturedOptions.player.state.setView('player');
  assert.strictEqual(application.view(), 'player', 'precondition: lifecycle test must leave Home before switching server');
  start = harness.calls.length;
  transition({ machineIdentifier: 'server-b', uri: 'http://server-b:32400' });

  assert.strictEqual(application.view(), 'home', 'switching Plex server must return the shared application session to Home before reload');
  assert.deepStrictEqual(
    harness.calls.slice(start),
    ['suspend:settings', 'prepareServerSwitch:shell', 'loadApplication:server'],
    'server switching must suspend Settings, reset the shell boundary, then reload through the Server owner'
  );
  application.destroy();
}());

(function accountLifecycleActionsStayOwnedByServerFeature() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var account = harness.capturedOptions.settings.account;
  var start = harness.calls.length;

  account.disconnect();
  account.deleteLocalData();

  assert.deepStrictEqual(
    harness.calls.slice(start),
    ['disconnect:server', 'deleteLocalData:server'],
    'Settings account actions must delegate disconnect and local-data reset to the Server feature owner'
  );
  application.destroy();
}());

(function playbackIdentityLifecycleUsesSharedApplicationSession() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.warmPlayer();
  var state = harness.capturedOptions.player.state;
  var identity = { ratingKey: 'episode-42', serverMachineIdentifier: 'server-a' };

  state.setPlaybackIdentity(identity);
  assert.deepStrictEqual(
    harness.created.session.snapshot().playbackIdentity,
    identity,
    'opening playback must publish playback identity through the shared application session'
  );
  identity.ratingKey = 'mutated';
  assert.strictEqual(
    harness.created.session.snapshot().playbackIdentity.ratingKey,
    'episode-42',
    'shared playback identity must remain isolated from producer mutation'
  );
  state.setPlaybackIdentity(null);
  assert.strictEqual(
    harness.created.session.snapshot().playbackIdentity,
    null,
    'closing playback must clear playback identity from the shared application session'
  );
  application.destroy();
}());

console.log('Application composition checks passed');

(function startupMilestonesUseExistingCompositionLifecycleBoundaries() {
  var marks = [];
  var snapshot = { bootstrap: 0, compositionReady: 12, serverReady: 25, firstHomeContent: 48, firstFocusableUi: 48 };
  var metrics = {
    mark: function (name) { marks.push(name); },
    snapshot: function () { return snapshot; }
  };
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {}, metrics);
  assert.deepStrictEqual(marks, ['composition-ready'], 'composition must mark readiness only after all owners are constructed');
  harness.capturedOptions.server.application.loaded();
  assert.deepStrictEqual(marks, ['composition-ready', 'server-ready'], 'server readiness must use the existing successful application-loaded boundary');
  harness.capturedOptions.shell.transitions.onHomeReady();
  assert.deepStrictEqual(marks, ['composition-ready', 'server-ready', 'first-home-content', 'first-focusable-ui'], 'Home readiness must mark content and focus only at the existing post-focus boundary');
  assert.strictEqual(harness.capturedOptions.diagnostics.state.startupSnapshot(), snapshot, 'diagnostics must expose the bounded local startup snapshot without telemetry');
  application.destroy();
}());
