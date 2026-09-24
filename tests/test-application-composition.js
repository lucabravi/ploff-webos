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


(function setupLocaleReadyRetranslatesGlobalShell() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var before = harness.invocations.length;
  assert.strictEqual(typeof harness.capturedOptions.setup.transitions.localeReady, 'function', 'setup must expose a locale-ready transition');
  harness.capturedOptions.setup.transitions.localeReady('it');
  var delta = harness.invocations.slice(before);
  assert.strictEqual(delta.some(function (entry) { return entry.owner === 'shell' && entry.method === 'translateStaticUi'; }), true,
    'setup locale completion must retranslate static shell UI');
  assert.strictEqual(delta.some(function (entry) { return entry.owner === 'shell' && entry.method === 'renderNavigation'; }), true,
    'setup locale completion must refresh navigation labels');
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
  var harness;
  harness = createHarness({
    Settings: Settings,
    methodHandlers: {
      'settingsBackup.status': function (callback) { callback(null, status); },
      'settings.promptSettingsLoad': function (_status, _options, callback) {
        harness.capturedOptions.settings.state.setSettings(loaded);
        callback(null, { settings: loaded }, false);
      }
    }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.capturedOptions.setup.transitions.finish({ returnView: '', selectedServer: null });
  assert.strictEqual(harness.capturedOptions.settings.state.getSettings(), loaded, 'successful onboarding load must replace the shared application settings state');
  assert.strictEqual(harness.capturedOptions.settings.state.getSettings().visualTheme, 'classic', 'loaded theme must be visible to every feature after onboarding');
  application.destroy();
}());

(function onboardingTrustsTheSettingsOwnerCanonicalRestoreReference() {
  var loaded = { uiLanguage: 'it', marker: 'backup-payload' };
  var canonical = { uiLanguage: 'it', marker: 'settings-owner-canonical' };
  var status = { exists: true, currentProfile: null, profiles: [{ id: 'living', name: 'Living room', model: 'OLED55' }] };
  var harness;
  harness = createHarness({
    methodHandlers: {
      'settingsBackup.status': function (callback) { callback(null, status); },
      'settings.promptSettingsLoad': function (_status, _options, callback) {
        harness.capturedOptions.settings.state.setSettings(canonical);
        callback(null, { settings: loaded }, false);
      }
    }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.capturedOptions.setup.transitions.finish({ returnView: '', selectedServer: null });
  assert.strictEqual(harness.capturedOptions.settings.state.getSettings(), canonical,
    'onboarding must keep the canonical Settings-owned reference instead of replacing it with the raw backup payload');
  application.destroy();
}());

(function plexAccountSeedRemainsOwnedBySettingsWhenSeedReturnsANewIdentity() {
  var initial = { uiLanguage: 'en', marker: 'initial' };
  var seedCalls = 0;
  var featureOptions;
  var ownedSettings;
  var settingsFeature;
  var harness = createHarness({
    Settings: {
      load: function () { return initial; },
      seedFromPlex: function (current, account) {
        seedCalls += 1;
        return { uiLanguage: account.locale, marker: 'seeded', previousMarker: current.marker };
      }
    }
  });
  harness.root.PloffSettingsFeatureController = {
    create: function (options) {
      featureOptions = options;
      ownedSettings = options.state.getSettings();
      settingsFeature = new Proxy({
        save: function () {
          options.state.setSettings(ownedSettings);
          return ownedSettings;
        },
        seedAccount: function (account) {
          ownedSettings = options.modules.Settings.seedFromPlex(ownedSettings, account);
          options.state.setSettings(ownedSettings);
          return ownedSettings;
        },
        destroy: function () {}
      }, {
        get: function (target, property) {
          if (!Object.prototype.hasOwnProperty.call(target, property)) { target[property] = function () {}; }
          return target[property];
        }
      });
      return settingsFeature;
    }
  };
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.capturedOptions.server.application.seedAccountSettings({ locale: 'it', profile: {} });
  assert.strictEqual(seedCalls, 1, 'Plex account seeding must occur exactly once');
  assert.strictEqual(featureOptions.state.getSettings().marker, 'seeded',
    'Settings-owned Plex seed must not be overwritten by the stale object captured before seedFromPlex returned a new identity');
  assert.strictEqual(featureOptions.state.getSettings().uiLanguage, 'it', 'seeded Plex locale must remain published application state');
  application.destroy();
}());

(function startupSettingsPersistenceUsesThePureSettingsPort() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var before = harness.invocations.length;
  var delta;
  harness.capturedOptions.server.application.persistSettings();
  delta = harness.invocations.slice(before);
  assert.strictEqual(delta.some(function (entry) { return entry.owner === 'settings' && entry.method === 'persist'; }), true,
    'startup persistence must use the Settings pure-persistence port');
  assert.strictEqual(delta.some(function (entry) { return entry.owner === 'settings' && entry.method === 'save'; }), false,
    'startup persistence must not reapply Settings presentation through save()');
  application.destroy();
}());

(function plexIdentityResetCancelsGlobalMediaContextMutations() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var before = harness.invocations.length;
  var delta;
  harness.capturedOptions.server.lifecycle.resetContent();
  delta = harness.invocations.slice(before);
  assert.strictEqual(delta.some(function (entry) { return entry.owner === 'mediaContext' && entry.method === 'reset'; }), true,
    'Plex identity reset must cancel global media-context mutations owned by the previous profile/server');
  application.destroy();
}());


(function plexIdentityResetInvalidatesPendingDirectPlayIntent() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var before = harness.invocations.length;
  var delta;
  harness.capturedOptions.server.lifecycle.resetContent();
  delta = harness.invocations.slice(before);
  assert.strictEqual(delta.some(function (entry) {
    return entry.owner === 'detail' && entry.method === 'cancelPendingPlayIntent';
  }), true, 'Plex identity reset must invalidate a direct Play intent still owned by the previous PMS/profile even when Home remains active');
  application.destroy();
}());


(function browsingViewTransitionsInvalidatePendingDirectPlayIntent() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var before = harness.invocations.length;
  harness.capturedOptions.library.transitions.setView('library');
  var delta = harness.invocations.slice(before);
  assert.strictEqual(delta.some(function (entry) {
    return entry.owner === 'detail' && entry.method === 'cancelPendingPlayIntent';
  }), true, 'changing browsing view must invalidate a direct Play resolution still owned by the previous view visit');
  application.destroy();
}());

(function sourceRouterIsTheSingleApplicationRoutingBoundary() {
  var routeCalls = [];
  var fakeRouter = {
    contextForItem: function (_item, candidate) { return candidate || null; },
    configFor: function (item, candidate) {
      routeCalls.push(['configFor', item, candidate]);
      return { apiBaseUrl: 'https://router.example', token: 'router-token', routed: true };
    },
    identityFor: function (item, candidate) {
      routeCalls.push(['identityFor', item, candidate]);
      return 'server:router';
    },
    routeFor: function (item, candidate) {
      routeCalls.push(['routeFor', item, candidate]);
      return item && (item.rejectRoute || item.serverMachineIdentifier === 'server-disabled') ? null : { context: candidate || null, config: { apiBaseUrl: 'https://router.example', token: 'router-token', routed: true }, identity: 'server:router' };
    }
  };
  var sourceContext = { sourceId: 'server-b|4', serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://relay-b.example', token: 'shared-token-b' };
  var sharedItem = { ratingKey: 'shared-20', type: 'movie', title: 'Shared', serverMachineIdentifier: 'server-b' };
  var rejectedItem = { ratingKey: 'shared-21', serverMachineIdentifier: 'server-b', rejectRoute: true };
  var harness = createHarness({
    sourceRouter: fakeRouter,
    methodReturns: {
      'library.snapshot': { sourceId: 'server-b|4', library: { zone: 'grid', viewKey: 'all' } },
      'library.focusedItem': sharedItem,
      'library.sourceContext': sourceContext,
      'shell.rows': []
    }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  var target;
  assert.ok(harness.capturedOptions.plexSourceRouter, 'application composition must construct the central Plex source router');
  assert.strictEqual(harness.capturedOptions.plexSourceRouter.sources, harness.created.librarySources, 'the router must consume the live LibrarySources owner');
  assert.strictEqual(harness.capturedOptions.multiServerContent.sourceRouter, fakeRouter, 'multi-server content must receive the same router instance');
  assert.ok(harness.capturedOptions.mediaSourceResolver, 'composition must construct one media source resolver');
  assert.strictEqual(harness.capturedOptions.mediaSourceResolver.sourceRouter, fakeRouter);
  assert.strictEqual(harness.capturedOptions.multiServerContent.sourceResolver, harness.created.mediaSourceResolver);
  assert.strictEqual(harness.capturedOptions.detail.data.sourceResolver, harness.created.mediaSourceResolver);
  assert.strictEqual(harness.capturedOptions.shell.data.sourceRouter, fakeRouter, 'Shell must receive the same router instance');
  assert.strictEqual(harness.capturedOptions.library.data.sourceRouter, fakeRouter, 'Library must receive the same router instance');
  assert.strictEqual(harness.capturedOptions.detail.data.sourceRouter, fakeRouter, 'Detail must receive the same router instance');
  harness.warmPlayer();
  assert.strictEqual(harness.capturedOptions.player.data.sourceRouter, fakeRouter, 'Player must receive the same router instance');
  assert.strictEqual(harness.capturedOptions.player.data.sourceResolver, harness.created.mediaSourceResolver, 'deferred Player must reuse the Core resolver');
  assert.strictEqual(harness.capturedOptions.shell.state.themeIdentity(sharedItem, sourceContext), 'server:router', 'theme identity must come from the router');
  harness.capturedOptions.player.library.refreshAfterPlayback('shared-20', 61, sourceContext);
  assert.strictEqual(harness.invocations.some(function (entry) {
    return entry.owner === 'library' && entry.method === 'reconcilePlaybackProgress' && entry.args[0] === 'shared-20' &&
      entry.args[1] === 61 && entry.args[2] === sourceContext;
  }), true, 'Player playback reconciliation must preserve the source PMS through application composition');

  harness.capturedOptions.library.transitions.setView('library');
  target = harness.capturedOptions.mediaContext.resolveTarget();
  assert.strictEqual(target.config.routed, true, 'media context transport must come from the router');
  assert.strictEqual(target.config.apiBaseUrl, 'https://router.example');

  harness.capturedOptions.library.transitions.openDetail(rejectedItem, sourceContext);
  assert.strictEqual(harness.invocations.some(function (entry) {
    return entry.owner === 'detail' && entry.method === 'open' && entry.args[0] === rejectedItem;
  }), false, 'openDetail must fail closed when the router rejects the declared owner');
  assert.strictEqual(routeCalls.some(function (entry) { return entry[0] === 'routeFor' && entry[1] === rejectedItem; }), true, 'openDetail must delegate owner validation to the router');

  var staleAggregate = {
    ratingKey: 'disabled-copy',
    guid: 'plex://movie/shared-failover',
    type: 'movie',
    serverMachineIdentifier: 'server-disabled',
    sourceVariants: [
      { serverMachineIdentifier: 'server-disabled', ratingKey: 'disabled-copy', sourceId: 'server-disabled|9' },
      { serverMachineIdentifier: 'server-a', ratingKey: 'active-copy', sourceId: 'server-a|1', primarySource: true }
    ]
  };
  var openBefore = harness.invocations.length;
  harness.capturedOptions.library.transitions.openDetail(staleAggregate, null);
  assert.strictEqual(harness.invocations.slice(openBefore).some(function (entry) {
    return entry.owner === 'detail' && entry.method === 'open' && entry.args[0] === staleAggregate;
  }), true, 'a stale aggregate must still reach Detail when another PMS variant remains routeable');
  var playBefore = harness.invocations.length;
  harness.capturedOptions.library.transitions.playItem(staleAggregate, null);
  assert.strictEqual(harness.invocations.slice(playBefore).some(function (entry) {
    return entry.owner === 'detail' && entry.method === 'playItem' && entry.args[0] === staleAggregate;
  }), true, 'direct play must still reach Detail when another PMS variant remains routeable');
  application.destroy();
}());

(function watchlistLookupForwardsPlexOwnerAcrossComposition() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var start = harness.invocations.length;
  harness.capturedOptions.detail.watchlist.findLocal('same', 'server-b');
  var invocation = harness.invocations.slice(start).filter(function (entry) {
    return entry.owner === 'library' && entry.method === 'findWatchlistLocal';
  }).pop();
  assert.ok(invocation, 'Detail watchlist lookup must cross the Library feature boundary');
  assert.deepStrictEqual(invocation.args, ['same', 'server-b'], 'Application composition must preserve the PMS owner in watchlist lookups');
  application.destroy();
}());


(function diagnosticsSupportRuntimeStaysLazyBehindTheDiagnosticsPort() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var result = null;
  assert.strictEqual(harness.injectedScripts.length, 0, 'constructing Diagnostics must not load support.js');
  assert.strictEqual(typeof harness.capturedOptions.diagnostics.transport.loadSupportRuntime, 'function', 'Diagnostics must receive the support runtime through an application-owned transport port');
  harness.capturedOptions.diagnostics.transport.loadSupportRuntime(function (error, runtime) {
    assert.strictEqual(error, null);
    result = runtime;
  });
  assert.strictEqual(harness.injectedScripts.length, 1, 'support.js must load only when Diagnostics requests its post-identity preload or export');
  assert.strictEqual(harness.injectedScripts[0].src, 'support.js?v=fixture', 'lazy support runtime must inherit app.js cache identity');
  harness.root.PloffSupportSnapshot = { create: function () {} };
  harness.root.PloffSupportQr = { create: function () {}, render: function () {} };
  harness.injectedScripts[0].onload();
  assert.strictEqual(result.SupportSnapshot, harness.root.PloffSupportSnapshot);
  assert.strictEqual(result.SupportQr, harness.root.PloffSupportQr);
  application.destroy();
}());

var expectedCreation = [
  'session', 'server', 'librarySources', 'multiServerContent', 'settingsBackup', 'choice', 'mediaInfo', 'assPool', 'assPrefetch', 'shell', 'library', 'detail', 'playerLoader',
  'mediaContext', 'input', 'pointer', 'search', 'settings', 'setup', 'diagnosticsSupportLoader', 'diagnostics', 'events'
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

(function libraryFeatureResolvesContentSourcesThroughTheCatalogOwner() {
  var resolved = null;
  var harness = createHarness({
    methodHandlers: {
      'librarySources.resolveSource': function (sourceId, callback) {
        callback(null, { sourceId: sourceId, apiBaseUrl: 'https://relay.example', token: 'shared' });
        return { abort: function () {} };
      }
    }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.capturedOptions.library.data.resolveSource('server-b|4', function (error, context) {
    assert.ifError(error);
    resolved = context;
  });
  assert.strictEqual(resolved.sourceId, 'server-b|4', 'Library feature must resolve a tab through the LibrarySources owner');
  assert.ok(harness.invocations.some(function (entry) {
    return entry.owner === 'librarySources' && entry.method === 'resolveSource' && entry.args[0] === 'server-b|4';
  }), 'Application composition must keep source resolution behind the LibrarySources boundary');
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

(function sharedWatchedChangesUpdateOnlyTheMatchingHomeSource() {
  var harness = createHarness({
    methodReturns: {
      'server.activeServer': { machineIdentifier: 'server-a' },
      'library.snapshot': { sourceId: 'server-b|4' },
      'library.activeLibrary': { key: '4', title: 'Film Marco' }
    }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  var onWatchedChanged = harness.capturedOptions.detail.transitions.onWatchedChanged;
  onWatchedChanged('same-rating-key', true, { sourceId: 'server-b|4', serverMachineIdentifier: 'server-b' });
  assert.strictEqual(harness.invocations.some(function (entry) {
    return entry.owner === 'shell' && entry.method === 'updateWatched' && entry.args[0] === 'same-rating-key' &&
      entry.args[2] && entry.args[2].serverMachineIdentifier === 'server-b';
  }), true, 'shared watched state must be projected into Home with its source context so equal ratingKeys on other PMSes remain untouched');
  assert.strictEqual(harness.invocations.some(function (entry) {
    return entry.owner === 'library' && entry.method === 'reconcileWatchedState' && entry.args[0] === 'same-rating-key' &&
      entry.args[2] && entry.args[2].sourceId === 'server-b|4';
  }), true, 'watched reconciliation must retain the owning source so Library/Watchlist state can reject equal ratingKeys from another PMS');
  application.destroy();
}());

(function sharedLibraryMediaContextCarriesSourceTransport() {
  var sourceContext = {
    sourceId: 'server-b|4',
    serverMachineIdentifier: 'server-b',
    apiBaseUrl: 'https://relay-b.example',
    token: 'shared-token-b',
    requestTimeout: 9000
  };
  var harness = createHarness({
    methodReturns: {
      'library.snapshot': { sourceId: 'server-b|4', library: { zone: 'grid', viewKey: 'all' } },
      'library.focusedItem': { ratingKey: 'shared-20', type: 'movie', title: 'Shared' },
      'library.sourceContext': sourceContext,
      'shell.rows': [{ kind: 'continue', items: [{ ratingKey: 'shared-20' }] }]
    }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  var target;
  harness.capturedOptions.library.transitions.setView('library');
  target = harness.capturedOptions.mediaContext.resolveTarget();
  assert.ok(target && target.sourceContext, 'shared Library media actions must retain the originating source context');
  assert.strictEqual(target.sourceContext.sourceId, 'server-b|4');
  assert.strictEqual(target.config.apiBaseUrl, 'https://relay-b.example',
    'shared Library media actions must target the source PMS route');
  assert.strictEqual(target.config.token, 'shared-token-b',
    'shared Library media actions must use the source-specific token');
  assert.strictEqual(target.inContinueWatching, false,
    'a same-ratingKey item on the primary Home must not leak Continue Watching state into a shared PMS');
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

(function viewChangesCancelSpeculativeBackdropPrefetch() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.capturedOptions.library.transitions.setView('library');
  assert.ok(harness.invocations.some(function (entry) {
    return entry.owner === 'shell' && entry.method === 'cancelBackdropPrefetch';
  }), 'changing application surface must immediately cancel speculative backdrop work');
  application.destroy();
}());


(function postHomeWarmupsKeepAssParallelAndWaitForSdArtworkBeforeTheBackgroundChain() {
  var stored = {};
  var preloaderCalls = [];
  var settings = Settings.validate({ subtitleRenderingAss: true });
  stored['ploff.settings.v3'] = JSON.stringify(settings);
  var harness = createHarness({
    Settings: Settings,
    localStorage: {
      getItem: function (key) { return stored[key] || null; },
      setItem: function (key, value) { stored[key] = value; }
    },
    AssSubtitleWorkerPreloader: {
      start: function () { preloaderCalls.push('start'); },
      warm: function () { preloaderCalls.push('warm'); return true; }
    }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  var before = harness.timers.length;
  harness.capturedOptions.shell.transitions.onHomeReady();
  var warmTimers = harness.timers.slice(before).filter(function (entry) { return entry.active; });
  assert.strictEqual(preloaderCalls.length, 0, 'ASS worker/glyph warming must not begin synchronously with the first Home paint');
  assert.ok(warmTimers.some(function (entry) { return entry.delay === 200; }), 'ASS warm-up must start 200ms after Home becomes usable');
  assert.strictEqual(warmTimers.some(function (entry) { return entry.delay === 1000 || entry.delay === 600 || entry.delay === 2500 || entry.delay === 4000; }), false,
    'post-Home background work must no longer be driven by stagger timers');
  assert.strictEqual(harness.invocations.some(function (entry) {
    return entry.owner === 'library' && entry.method === 'scheduleAdjacentPrefetch';
  }), false, 'background chain must not start before the initial Home SD artwork batch settles');
  var assTimer = harness.timers.filter(function (entry) { return entry.active && entry.delay === 200; }).pop();
  assTimer.active = false;
  assTimer.callback();
  assert.deepStrictEqual(preloaderCalls, ['start', 'warm'], 'ASS worker and glyph warm-up must begin together when the 200ms timer fires');
  application.destroy();
}());




(function assGlyphWarmPressureEndsOnActualWarmCompletion() {
  var stored = {};
  var state = { warmComplete: false, failed: false, takenAt: null, available: true };
  var observer = null;
  var settings = Settings.validate({ subtitleRenderingAss: true });
  stored['ploff.settings.v3'] = JSON.stringify(settings);
  var harness = createHarness({
    Settings: Settings,
    localStorage: {
      getItem: function (key) { return stored[key] || null; },
      setItem: function (key, value) { stored[key] = value; }
    },
    AssSubtitleWorkerPreloader: {
      start: function () { return true; },
      warm: function () { return true; },
      snapshot: function () { return state; },
      subscribe: function (callback) { observer = callback; return function () { observer = null; }; }
    }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.capturedOptions.shell.transitions.onHomeReady();
  assert.ok(harness.invocations.some(function (entry) {
    return entry.owner === 'shell' && entry.method === 'setHomeArtworkPressure' && entry.args[0] === 'ass-warm' && entry.args[1] === true;
  }), 'pending ASS glyph warm must hold Home artwork pressure from Home-ready');
  var startTimer = harness.timers.filter(function (entry) { return entry.active && entry.delay === 200; }).pop();
  startTimer.active = false;
  startTimer.callback();
  assert.strictEqual(harness.invocations.some(function (entry) {
    return entry.owner === 'shell' && entry.method === 'setHomeArtworkPressure' && entry.args[0] === 'ass-warm' && entry.args[1] === false;
  }), false, 'ASS pressure must remain until the worker reports warm completion');
  state.warmComplete = true;
  assert.strictEqual(typeof observer, 'function', 'ASS pressure must observe the preloader lifecycle without adding a composition-root poll timer');
  observer();
  assert.ok(harness.invocations.some(function (entry) {
    return entry.owner === 'shell' && entry.method === 'setHomeArtworkPressure' && entry.args[0] === 'ass-warm' && entry.args[1] === false;
  }), 'ASS pressure must end immediately after the warm worker reports completion');
  application.destroy();
}());

(function startupBackgroundChainWarmsHiddenHomeSdBeforePrefetchPlayerWatchlist() {
  var homeArtworkDone = null;
  var prefetchDone = null;
  var order = [];
  var harness = createHarness({
    deferPlayer: true,
    methodHandlers: {
      'shell.warmHomeArtworkPreviews': function (callback) {
        order.push('home-sd');
        homeArtworkDone = callback;
        return true;
      },
      'library.scheduleAdjacentPrefetch': function (_index, _items, options) {
        order.push('prefetch');
        prefetchDone = options && options.onSettled;
        return true;
      },
      'library.warmWatchlist': function (callback) {
        order.push('watchlist');
        if (callback) { callback(); }
        return true;
      }
    }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.capturedOptions.shell.transitions.onHomeReady();
  assert.deepStrictEqual(order, [], 'Home-ready alone must not start the background chain');
  harness.capturedOptions.shell.transitions.onHomeArtworkPreviewReady();
  assert.deepStrictEqual(order, ['home-sd'], 'the chain must first warm SD artwork for Home cards outside the initial visible set');
  assert.strictEqual(typeof homeArtworkDone, 'function', 'hidden Home SD warm must expose a completion hook to the chain');
  homeArtworkDone();
  assert.deepStrictEqual(order, ['home-sd', 'prefetch'], 'adjacent-library prefetch must wait until hidden Home SD artwork settles');
  assert.strictEqual(harness.injectedScripts.length, 0, 'Player warm must wait for adjacent-library prefetch completion');
  assert.strictEqual(typeof prefetchDone, 'function', 'adjacent-library prefetch must expose a completion hook to the chain');
  prefetchDone();
  assert.strictEqual(harness.injectedScripts.length, 1, 'Player runtime warm must start immediately after adjacent-library prefetch settles');
  assert.deepStrictEqual(order, ['home-sd', 'prefetch'], 'Watchlist warm must wait until Player construction settles');
  harness.loadPlayerCode();
  assert.deepStrictEqual(order, ['home-sd', 'prefetch', 'watchlist'], 'Watchlist warm must be the final startup background step');
  application.destroy();
}());

(function startupBackgroundChainFallsBackAfterFiveSecondsWithoutSdSettlement() {
  var order = [];
  var harness = createHarness({
    methodHandlers: {
      'library.scheduleAdjacentPrefetch': function (_index, _items, options) {
        order.push('prefetch');
        if (options && options.onSettled) { options.onSettled(); }
        return true;
      },
      'library.warmWatchlist': function (callback) {
        order.push('watchlist');
        if (callback) { callback(); }
        return true;
      }
    }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.capturedOptions.shell.transitions.onHomeReady();
  assert.deepStrictEqual(order, [], 'the background chain must still wait for SD settlement before the watchdog expires');
  var watchdog = harness.timers.filter(function (entry) { return entry.active && entry.delay === 5000; }).pop();
  assert.ok(watchdog, 'Home-ready must arm a five-second SD settlement watchdog');
  watchdog.active = false;
  watchdog.callback();
  assert.strictEqual(order[0], 'prefetch', 'the watchdog must start the background chain if SD settlement never arrives');
  application.destroy();
}());

(function sdSettlementCancelsWatchdogAndDoubleTriggerCannotRestartTheChain() {
  var prefetchCalls = 0;
  var harness = createHarness({
    methodHandlers: {
      'library.scheduleAdjacentPrefetch': function (_index, _items, options) {
        prefetchCalls += 1;
        if (options && options.onSettled) { options.onSettled(); }
        return true;
      },
      'library.warmWatchlist': function (callback) {
        if (callback) { callback(); }
        return true;
      }
    }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.capturedOptions.shell.transitions.onHomeReady();
  var watchdog = harness.timers.filter(function (entry) { return entry.active && entry.delay === 5000; }).pop();
  assert.ok(watchdog, 'Home-ready must arm the SD settlement watchdog');
  harness.capturedOptions.shell.transitions.onHomeArtworkPreviewReady();
  assert.strictEqual(watchdog.active, false, 'normal SD settlement must cancel the pending watchdog');
  assert.strictEqual(prefetchCalls, 1, 'normal SD settlement must start the chain exactly once');
  watchdog.callback();
  harness.capturedOptions.shell.transitions.onHomeArtworkPreviewReady();
  assert.strictEqual(prefetchCalls, 1, 'late watchdog or duplicate SD signals must not restart the chain');
  application.destroy();
}());

(function destroyCancelsPendingSdSettlementWatchdog() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.capturedOptions.shell.transitions.onHomeReady();
  var watchdog = harness.timers.filter(function (entry) { return entry.active && entry.delay === 5000; }).pop();
  assert.ok(watchdog, 'Home-ready must arm the SD settlement watchdog before teardown');
  application.destroy();
  assert.strictEqual(watchdog.active, false, 'application teardown must cancel the pending SD settlement watchdog');
}());

(function foregroundDetailPromotionStartsPlayerWithoutWaitingForTheBackgroundChain() {
  var prefetchDone = null;
  var harness = createHarness({
    deferPlayer: true,
    sourceRouter: {
      contextForItem: function (_item, candidate) { return candidate || null; },
      configFor: function () { return {}; },
      identityFor: function () { return 'server-a'; },
      routeFor: function (_item, candidate) { return { context: candidate || null, config: {}, identity: 'server-a' }; }
    },
    methodReturns: { 'shell.rows': [] },
    methodHandlers: {
      'library.scheduleAdjacentPrefetch': function (_index, _items, options) {
        prefetchDone = options && options.onSettled;
        return true;
      },
      'library.warmWatchlist': function (callback) { if (callback) { callback(); } return true; }
    }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.capturedOptions.shell.transitions.onHomeReady();
  harness.capturedOptions.shell.transitions.onHomeArtworkPreviewReady();
  assert.strictEqual(harness.injectedScripts.length, 0, 'Player must still be waiting while adjacent prefetch is active');
  harness.capturedOptions.library.transitions.openDetail({ ratingKey: 'movie-1', serverMachineIdentifier: 'server-a' }, null);
  assert.strictEqual(harness.injectedScripts.length, 1, 'opening media Detail must promote Player loading ahead of the background chain');
  prefetchDone();
  assert.strictEqual(harness.injectedScripts.length, 1, 'reaching the Player step later must reuse the promoted load instead of injecting player.js twice');
  harness.loadPlayerCode();
  application.destroy();
}());

(function foregroundPlayPromotionStartsPlayerWithoutWaitingForTheBackgroundChain() {
  var prefetchDone = null;
  var harness = createHarness({
    deferPlayer: true,
    sourceRouter: {
      contextForItem: function (_item, candidate) { return candidate || null; },
      configFor: function () { return {}; },
      identityFor: function () { return 'server-a'; },
      routeFor: function (_item, candidate) { return { context: candidate || null, config: {}, identity: 'server-a' }; }
    },
    methodReturns: { 'shell.rows': [] },
    methodHandlers: {
      'library.scheduleAdjacentPrefetch': function (_index, _items, options) {
        prefetchDone = options && options.onSettled;
        return true;
      },
      'library.warmWatchlist': function (callback) { if (callback) { callback(); } return true; }
    }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.capturedOptions.shell.transitions.onHomeReady();
  harness.capturedOptions.shell.transitions.onHomeArtworkPreviewReady();
  assert.strictEqual(harness.injectedScripts.length, 0, 'Player must still be waiting while adjacent prefetch is active');
  harness.capturedOptions.shell.transitions.playHomeItem({ ratingKey: 'movie-2', serverMachineIdentifier: 'server-a' });
  assert.strictEqual(harness.injectedScripts.length, 1, 'pressing Play on Home media must promote Player loading ahead of the background chain');
  prefetchDone();
  assert.strictEqual(harness.injectedScripts.length, 1, 'the later Player chain step must join the foreground Play load instead of injecting player.js twice');
  harness.loadPlayerCode();
  application.destroy();
}());

(function foregroundPlayRetriesAfterSpeculativePlayerWarmFailure() {
  var harness = createHarness({ deferPlayer: true });
  var application = ApplicationController.create(harness.root, harness.document, {});
  var firstScript;

  harness.warmPlayer();
  assert.strictEqual(harness.injectedScripts.length, 1, 'startup Player warm must begin one deferred runtime load');
  firstScript = harness.injectedScripts[0];
  assert.strictEqual(typeof firstScript.onerror, 'function', 'deferred Player runtime must expose its load failure callback');
  firstScript.onerror();

  harness.capturedOptions.detail.transitions.requestPlayback();
  assert.strictEqual(harness.injectedScripts.length, 2,
    'an explicit foreground Play after a speculative warm failure must retry the Player runtime instead of remaining poisoned until app restart');
  harness.loadPlayerCode();
  assert.strictEqual(harness.invocations.some(function (entry) { return entry.owner === 'player' && entry.method === 'open'; }), true,
    'the successful foreground retry must dispatch the retained Play intent after the runtime becomes ready');
  application.destroy();
}());

(function suspendCancelsDeferredPlaybackAndDirectPlayOwnership() {
  var harness = createHarness({ deferPlayer: true });
  var application = ApplicationController.create(harness.root, harness.document, {});
  var visibility = harness.capturedOptions.events.filter(function (entry) { return entry.name === 'visibilitychange'; })[0];
  assert.ok(visibility && typeof visibility.handler === 'function', 'application must bind visibility lifecycle handling');

  harness.capturedOptions.detail.transitions.requestPlayback();
  assert.strictEqual(harness.injectedScripts.length, 1, 'this lifecycle regression requires Player readiness to still be pending');
  harness.document.hidden = true;
  visibility.handler();
  assert.strictEqual(harness.invocations.some(function (entry) {
    return entry.owner === 'detail' && entry.method === 'cancelPendingPlayIntent';
  }), true, 'suspend must invalidate a pre-Detail direct Play intent before it can resume in the background');

  harness.loadPlayerCode();
  assert.strictEqual(harness.invocations.some(function (entry) { return entry.owner === 'player' && entry.method === 'open'; }), false,
    'Player runtime readiness completing after suspend must not dispatch the deferred Play intent');
  application.destroy();
}());

(function updateCheckStartsOnlyFromFirstSettingsEntry() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var checks;
  assert.strictEqual(harness.calls.indexOf('release:check'), -1, 'application construction must not start the update request');
  harness.capturedOptions.shell.transitions.onHomeReady();
  assert.strictEqual(harness.calls.indexOf('release:check'), -1, 'Home readiness must not spend startup network work on the GitHub update check');
  assert.strictEqual(harness.invocations.some(function (entry) {
    return entry.owner === 'librarySources' && entry.method === 'refresh';
  }), false, 'the first Home paint must not immediately start external Plex discovery; lazy Home enrichment owns that work');
  harness.capturedOptions.settings.transitions.enter();
  checks = harness.calls.filter(function (entry) { return entry === 'release:check'; });
  assert.strictEqual(checks.length, 1, 'the first Settings entry must trigger the non-forced update check');
  harness.capturedOptions.settings.transitions.enter();
  checks = harness.calls.filter(function (entry) { return entry === 'release:check'; });
  assert.strictEqual(checks.length, 1, 'later Settings entries in the same application session must not repeat the automatic update check');
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
    ['pointer', 'input', 'mediaContext', 'playerLoader', 'detail', 'library', 'shell', 'assPrefetch', 'assPool', 'mediaInfo', 'choice', 'settingsBackup', 'multiServerContent', 'librarySources', 'server', 'session'],
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
    ['pointer', 'input', 'mediaContext', 'playerLoader', 'detail', 'library', 'shell', 'assPrefetch', 'assPool', 'mediaInfo', 'choice', 'settingsBackup', 'multiServerContent', 'librarySources', 'server', 'session'],
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

(function cancellingProfileManagerRestoresWatchlistOrigin() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var start;
  harness.capturedOptions.library.transitions.setView('watchlist');
  harness.capturedOptions.setup.transitions.activate();
  assert.strictEqual(application.view(), 'setup', 'profile manager must own the application view while open');
  start = harness.invocations.length;
  harness.capturedOptions.setup.transitions.cancel({ returnView: 'watchlist' });
  assert.strictEqual(application.view(), 'watchlist', 'cancelling profile manager from Watchlist must restore Watchlist instead of Home');
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'library' && entry.method === 'refreshPresentation';
  }), 'Watchlist return must refresh the LibraryFeature-owned Watchlist surface');
  assert.strictEqual(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'shell' && entry.method === 'enterHome';
  }), false, 'restoring Watchlist must not mount Home as a fallback');
  application.destroy();
}());

(function competingNavigationCancelsPendingLibraryEntry() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var transitions = harness.capturedOptions.shell.transitions;
  var start = harness.invocations.length;
  var cancelIndex;
  var enterSettingsIndex;

  transitions.commitNavigationView({ kind: 'settings' }, 2, false);
  cancelIndex = harness.invocations.slice(start).findIndex(function (entry) {
    return entry.owner === 'library' && entry.method === 'cancelPendingEntry';
  });
  enterSettingsIndex = harness.invocations.slice(start).findIndex(function (entry) {
    return entry.owner === 'settings' && entry.method === 'enter';
  });
  assert.ok(cancelIndex >= 0, 'navigating away from a pending Library entry must invalidate its source resolution');
  assert.ok(enterSettingsIndex > cancelIndex, 'pending Library ownership must be cancelled before the competing surface is entered');

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
  var restoreStart = harness.invocations.length;
  detailTransitions.restoreOrigin('library');
  assert.strictEqual(application.view(), 'library');
  var restoreInvocations = harness.invocations.slice(restoreStart);
  var renderNavigationIndex = restoreInvocations.findIndex(function (entry) { return entry.owner === 'shell' && entry.method === 'renderNavigation'; });
  var recoverLibraryIndex = restoreInvocations.findIndex(function (entry) { return entry.owner === 'library' && entry.method === 'recoverPresentation'; });
  assert.ok(renderNavigationIndex >= 0, 'returning from Detail must remeasure the top navigation after the topbar becomes visible again');
  assert.ok(recoverLibraryIndex >= 0 && renderNavigationIndex < recoverLibraryIndex, 'navbar remeasurement must happen before Library focus restoration can target the active tab');

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
  assert.deepStrictEqual(harness.calls.slice(start), ['refresh:librarySources', 'retryAfterNetwork:search']);
  assert.strictEqual(harness.invocations.filter(function (entry) {
    return entry.owner === 'librarySources' && entry.method === 'refresh' && entry.args[1] === true;
  }).length, 1, 'network recovery must force shared-server discovery to retry transiently unreachable PMS routes');

  detailTransitions.enterDetail('library', { ratingKey: 'item' });
  detailTransitions.restoreOrigin('library');
  start = harness.calls.length;
  recover();
  assert.deepStrictEqual(harness.calls.slice(start), ['refresh:librarySources', 'reloadCurrent:library']);

  detailTransitions.enterDetail('home', { ratingKey: 'item' });
  detailTransitions.restoreOrigin('home');
  start = harness.calls.length;
  recover();
  assert.deepStrictEqual(harness.calls.slice(start), ['refresh:librarySources', 'refreshHome:shell']);

  detailTransitions.enterDetail('home', { ratingKey: 'item' });
  start = harness.calls.length;
  recover();
  assert.deepStrictEqual(harness.calls.slice(start), ['refresh:librarySources', 'sourceContext:detail', 'recoverAfterNetwork:detail']);

  application.destroy();
}());


(function externalDetailNetworkRecoveryWaitsForLivePmsRoute() {
  var harness = createHarness({ methodReturns: {
    'detail.sourceContext': { serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://stale.example' },
    'librarySources.serverAvailable': false
  } });
  var application = ApplicationController.create(harness.root, harness.document, {});
  var recover = harness.capturedOptions.server.application.recoverAfterNetwork;
  var start;
  harness.capturedOptions.detail.transitions.enterDetail('home', { ratingKey: 'item' });
  start = harness.invocations.length;
  recover();
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'librarySources' && entry.method === 'refresh' && entry.args[1] === true;
  }), 'external Detail recovery must still trigger shared PMS rediscovery');
  assert.strictEqual(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'detail' && entry.method === 'recoverAfterNetwork';
  }), false, 'an external Detail must not retry through a PMS route already known offline');
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
    'loadLibraryPage', 'loadLibraryRecommendations', 'loadLibrarySections', 'refreshLibrary',
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
  assert.strictEqual(scheduled.filter(function (entry) { return entry.delay === 200; }).length, 1, 'first Home readiness must schedule exactly one ASS glyph warmup after the approved 200ms head start');
  assert.strictEqual(scheduled[0].delay, 200, 'ASS glyph warmup must wait 200ms after the first Home presentation');
  assert.strictEqual(scheduled.filter(function (entry) { return entry.delay === 5000; }).length, 1, 'Home readiness must arm exactly one five-second SD settlement watchdog');
  assert.strictEqual(scheduled.some(function (entry) { return entry.delay === 600 || entry.delay === 1000 || entry.delay === 2500 || entry.delay === 4000; }), false,
    'Player, adjacent prefetch, and Watchlist warmups must remain completion-driven rather than timer-driven');
  scheduled.shift().callback();
  assert.strictEqual(warms, 1, 'deferred Home callback must start the legacy worker glyph warmup');
  harness.capturedOptions.shell.transitions.onHomeReady();
  assert.strictEqual(scheduled.filter(function (entry) { return entry.delay === 200; }).length, 0, 'later Home presentations must not schedule another synthetic warmup');
  assert.strictEqual(warms, 1, 'legacy glyph warmup must remain one-shot for the application lifetime');
  application.destroy();
}());

(function detailAssPrefetchDownloadsOnlyAndNeverPreparesLibass() {
  var AssSubtitlePrefetch = require('../app/ass-subtitle-prefetch');
  var subtitleLoads = 0;
  var prepares = 0;
  var pool = {
    prewarm: function () {},
    prepare: function () { prepares += 1; },
    destroy: function () {}
  };
  var harness = createHarness({
    AssSubtitlePrefetch: AssSubtitlePrefetch,
    AssSubtitleRendererPool: { create: function () { return pool; } },
    methodReturns: { 'server.mediaIdentity': { server: 'server-a', profile: 'profile-a' } },
    Settings: { load: function () { return { subtitleRenderingAss: true }; }, seedFromPlex: function (settings) { return settings; } }
  });
  harness.root.PloffClient.loadSubtitleText = function (_config, _source, _track, callback) {
    subtitleLoads += 1;
    callback(null, '[Script Info]\\n[Events]');
    return { abort: function () {} };
  };
  var application = ApplicationController.create(harness.root, harness.document, {});
  assert.strictEqual(harness.capturedOptions.detail.data.onAssPrefetchCandidate(
    { ratingKey: 'ep' },
    { ratingKey: 'ep', partId: 'part' },
    { subtitleTrack: { id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/sub.ass' } }
  ), true, 'enabled local ASS rendering must allow Detail to download the selected ASS');
  assert.strictEqual(subtitleLoads, 1, 'Detail ASS speculation must download the subtitle text exactly once');
  assert.strictEqual(prepares, 0, 'Detail ASS speculation must not install or parse the track in libass before Play');
  application.destroy();
}());

(function disabledLocalAssRenderingSkipsEvenSubtitleDownload() {
  var AssSubtitlePrefetch = require('../app/ass-subtitle-prefetch');
  var subtitleLoads = 0;
  var pool = { prewarm: function () {}, prepare: function () { throw new Error('disabled ASS must never prepare libass'); }, destroy: function () {} };
  var harness = createHarness({
    AssSubtitlePrefetch: AssSubtitlePrefetch,
    AssSubtitleRendererPool: { create: function () { return pool; } },
    methodReturns: { 'server.mediaIdentity': { server: 'server-a', profile: 'profile-a' } },
    Settings: { load: function () { return { subtitleRenderingAss: false }; }, seedFromPlex: function (settings) { return settings; } }
  });
  harness.root.PloffClient.loadSubtitleText = function () { subtitleLoads += 1; throw new Error('disabled ASS must not download subtitle text'); };
  var application = ApplicationController.create(harness.root, harness.document, {});
  assert.strictEqual(harness.capturedOptions.detail.data.onAssPrefetchCandidate(
    { ratingKey: 'ep' },
    { ratingKey: 'ep', partId: 'part' },
    { subtitleTrack: { id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/sub.ass' } }
  ), false, 'disabled local ASS rendering must reject Detail subtitle prefetch before transport');
  assert.strictEqual(subtitleLoads, 0, 'disabled local ASS rendering must perform zero proactive ASS downloads');
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
  preloader.start = function () { return true; };
  harness.capturedOptions.settings.state.setSettings({ subtitleRenderingAss: true });
  assert.strictEqual(prewarms, 1, 'enabling ASS must prepare the library without waiting for another Home refresh');
  scheduled.filter(function (entry) { return entry.delay === 200; })[0].callback();
  assert.strictEqual(warms, 1, 'enabling ASS must start glyph warmup');
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
  assert.strictEqual(scheduled.filter(function (entry) { return entry.delay === 200; }).length, 1, 'enabled ASS may schedule the deferred Home warmup after 200ms');
  harness.capturedOptions.settings.state.setSettings({ subtitleRenderingAss: false });
  assert.strictEqual(cancelled, 1, 'disabling global ASS must cancel speculative prefetch already in flight');
  scheduled[0].callback();
  assert.strictEqual(warms, 0, 'a Home warmup scheduled while enabled must be skipped if ASS becomes globally disabled before it runs');
  harness.capturedOptions.settings.state.setSettings({ subtitleRenderingAss: true });
  scheduled[scheduled.length - 1].callback();
  assert.strictEqual(warms, 1, 'skipped warmup must be rearmed when ASS is enabled again');
  application.destroy();
}());


(function disablingGlobalAssCancelsForegroundSubtitleDownloadToo() {
  var cancelled = 0;
  var speculativeCancelled = 0;
  var prefetchOwner = {
    request: function () { return true; },
    snapshot: function () { return { activeIdentity: 'foreground-ass', activePriority: 'foreground', cachedIdentity: '' }; },
    cancel: function () { cancelled += 1; },
    cancelSpeculative: function () { speculativeCancelled += 1; },
    destroy: function () {}
  };
  var harness = createHarness({
    AssSubtitlePrefetch: { create: function () { return prefetchOwner; } },
    methodReturns: { 'server.mediaIdentity': { server: 'server-a', profile: 'profile-a' } },
    Settings: { load: function () { return { subtitleRenderingAss: true }; }, seedFromPlex: function (settings) { return settings; } }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.capturedOptions.settings.state.setSettings({ subtitleRenderingAss: false });
  assert.strictEqual(cancelled, 1, 'disabling local ASS rendering must abort even a foreground ASS download still in flight');
  assert.strictEqual(speculativeCancelled, 0, 'global ASS disable must not leave foreground work alive by using speculative-only cancellation');
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

(function foregroundPlayDoesNotCancelGlyphWarmBeforeRendererClaim() {
  var cancelWarmups = 0;
  var requests = 0;
  var preloader = {
    cancelWarmup: function () { cancelWarmups += 1; },
    snapshot: function () { return { available: true, warmComplete: false, failed: false, takenAt: null }; },
    subscribe: function () { return function () {}; },
    start: function () { return true; },
    warm: function () { return true; }
  };
  var prefetchOwner = {
    request: function () { requests += 1; return true; },
    snapshot: function () { return { activeIdentity: '', cachedIdentity: '' }; },
    cancelSpeculative: function () {},
    destroy: function () {}
  };
  var harness = createHarness({
    AssSubtitleWorkerPreloader: preloader,
    AssSubtitlePrefetch: { create: function () { return prefetchOwner; } },
    methodReturns: { 'server.mediaIdentity': { server: 'server-a', profile: 'profile-a' } },
    Settings: { load: function () { return { subtitleRenderingAss: true }; }, seedFromPlex: function (settings) { return settings; } }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.warmPlayer();
  assert.strictEqual(harness.capturedOptions.player.data.prefetchCurrentAss(
    { ratingKey: 'episode-1' },
    { ratingKey: 'episode-1', partId: 'part-1' },
    { subtitleTrack: { id: 'ass-1', format: 'ass', codec: 'ass', external: true, key: '/subtitles/1.ass' } }
  ), true, 'Play must still promote/download the current ASS text');
  assert.strictEqual(requests, 1, 'Play must promote the current ASS through the shared fetch owner');
  assert.strictEqual(cancelWarmups, 0,
    'Play must not cancel glyph warm until libass is actually claimed by the renderer');
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

(function assPrefetchIdentityUsesTheMediaOwnerInsteadOfThePersistedPrimaryServer() {
  var identityCalls = [];
  var fakeRouter = {
    contextForItem: function (_item, candidate) { return candidate || null; },
    configFor: function () { return { apiBaseUrl: 'https://router.example', token: 'router-token' }; },
    contextIdentity: function (context) { return context && context.serverMachineIdentifier ? 'server:' + context.serverMachineIdentifier : ''; },
    identityFor: function (item, candidate) {
      identityCalls.push([item, candidate]);
      return item && item.serverMachineIdentifier ? 'server:' + item.serverMachineIdentifier : 'server:primary';
    },
    routeFor: function (item, candidate) {
      return { context: candidate || null, config: { apiBaseUrl: 'https://router.example', token: 'router-token' }, identity: this.identityFor(item, candidate) };
    }
  };
  var harness = createHarness({
    sourceRouter: fakeRouter,
    methodReturns: { 'server.mediaIdentity': { server: 'primary-server', profile: 'profile-a' } }
  });
  var application = ApplicationController.create(harness.root, harness.document, {});
  var identity;
  harness.warmPlayer();
  identity = harness.capturedOptions.player.data.assSubtitlePrefetchIdentity({
    ratingKey: 'same-rating-key',
    partId: 'part-1',
    mediaIndex: 0,
    partIndex: 0,
    serverMachineIdentifier: 'shared-server'
  }, { id: 'subtitle-1' });
  assert.strictEqual(identity.split('|')[0], 'server:shared-server',
    'ASS prefetch identity must preserve the media owner instead of labeling shared media with the persisted primary PMS');
  assert.strictEqual(identityCalls.some(function (entry) {
    return entry[0] && entry[0].serverMachineIdentifier === 'shared-server';
  }), true, 'ASS prefetch identity must delegate owner identity to PlexSourceRouter');
  identity = harness.capturedOptions.player.data.assSubtitlePrefetchIdentity({
    ratingKey: 'same-rating-key',
    partId: 'part-1',
    mediaIndex: 0,
    partIndex: 0,
    _ploffSourceItem: { ratingKey: 'same-rating-key', serverMachineIdentifier: 'shared-server' }
  }, { id: 'subtitle-1' });
  assert.strictEqual(identity.split('|')[0], 'server:shared-server',
    'ASS prefetch identity must use the concrete owner carried by aggregated media profiles');
  application.destroy();
}());


(function assNextPrefetchRoutesThroughTheConcreteMediaOwner() {
  var AssSubtitlePrefetch = require('../app/ass-subtitle-prefetch');
  var routedConfig = null;
  var routedSubtitleConfig = null;
  var secondaryItem = { ratingKey: 'episode-secondary', serverMachineIdentifier: 'server-b', type: 'episode' };
  var sourceRouter = {
    contextForItem: function (item) {
      if (item && item.serverMachineIdentifier === 'server-b') {
        return { serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://server-b.example', token: 'token-b' };
      }
      return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://server-a.example', token: 'token-a' };
    },
    configFor: function (item) {
      return item && item.serverMachineIdentifier === 'server-b'
        ? { apiBaseUrl: 'https://server-b.example', token: 'token-b' }
        : { apiBaseUrl: 'https://server-a.example', token: 'token-a' };
    },
    contextIdentity: function (context) { return context && context.serverMachineIdentifier ? 'server:' + context.serverMachineIdentifier : ''; },
    identityFor: function (item) { return item && item.serverMachineIdentifier ? 'server:' + item.serverMachineIdentifier : 'server:server-a'; },
    routeFor: function (item) {
      var context = this.contextForItem(item);
      return { context: context, config: { apiBaseUrl: context.apiBaseUrl, token: context.token }, identity: this.contextIdentity(context) };
    }
  };
  var harness = createHarness({
    AssSubtitlePrefetch: AssSubtitlePrefetch,
    sourceRouter: sourceRouter,
    methodReturns: { 'server.mediaIdentity': { server: 'server-a', profile: 'profile-a' } },
    Settings: { load: function () { return { subtitleRenderingAss: true }; }, seedFromPlex: function (settings) { return settings; } }
  });
  harness.root.PloffConfig = { apiBaseUrl: 'https://server-a.example', token: 'token-a' };
  harness.root.PloffClient.loadPlayback = function (requestConfig, ratingKey, _session, _preferences, callback) {
    routedConfig = { apiBaseUrl: requestConfig.apiBaseUrl, token: requestConfig.token, ratingKey: ratingKey };
    callback(new Error('stop after route assertion'));
    return { abort: function () {} };
  };
  harness.root.PloffClient.loadSubtitleText = function (requestConfig, _playback, _track, callback) {
    routedSubtitleConfig = { apiBaseUrl: requestConfig.apiBaseUrl, token: requestConfig.token };
    callback(new Error('stop after subtitle route assertion'));
    return { abort: function () {} };
  };
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.warmPlayer();
  harness.capturedOptions.detail.data.onAssPrefetchCandidate(
    secondaryItem,
    { ratingKey: 'episode-secondary', _ploffSourceItem: secondaryItem },
    { subtitleTrack: { id: 'ass-secondary', format: 'ass', external: true, key: '/library/streams/ass-secondary' } }
  );
  assert.deepStrictEqual(routedSubtitleConfig, {
    apiBaseUrl: 'https://server-b.example', token: 'token-b'
  }, 'current ASS subtitle prefetch must fetch text from the concrete PMS that owns the selected media profile');
  harness.capturedOptions.player.data.prefetchNextAss({ item: secondaryItem, detail: secondaryItem }, {}, 'secondary-prefetch');
  assert.deepStrictEqual(routedConfig, {
    apiBaseUrl: 'https://server-b.example', token: 'token-b', ratingKey: 'episode-secondary'
  }, 'next ASS prefetch must load playback from the concrete PMS that owns the queued media');
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

(function serverIdentityResetClearsMultiServerSourcesBeforeReload() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var start = harness.invocations.length;

  harness.capturedOptions.server.lifecycle.resetContent();

  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'multiServerContent' && entry.method === 'resetSources';
  }), 'changing the primary PMS/profile identity must clear cached multi-server Home and virtual-library state before the new Home load starts');
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'librarySources' && entry.method === 'applyPrimaryNavigation' && Array.isArray(entry.args[0]) && entry.args[0].length === 0;
  }), 'changing the primary PMS/profile identity must discard the previous source catalog before navigation for the new identity arrives');
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'search' && entry.method === 'leave';
  }), 'changing PMS/profile identity must cancel Search work retained underneath Setup before old-profile callbacks can publish');
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'detail' && entry.method === 'leave';
  }), 'changing PMS/profile identity must cancel Detail requests retained underneath Setup before old-profile callbacks can publish');
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'shell' && entry.method === 'stopTheme';
  }), 'changing PMS/profile identity must stop background audio owned by the previous media identity');
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'shell' && entry.method === 'clearBackdrop';
  }), 'changing PMS/profile identity must invalidate backdrop work and presentation from the previous media identity');
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
    ['suspend:settings', 'prepareServerSwitch:shell', 'cancelPendingPlayIntent:detail', 'cancelBackdropPrefetch:shell', 'enterHome:shell',
      'resumeHomeEnrichment:multiServerContent', 'loadApplication:server'],
    'server switching must suspend Settings, reset/cancel speculative shell work, reveal Home, then reload through the Server owner'
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

(function externalHomeEnrichmentIsWiredBehindTheFirstHomeRender() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var rows = [{ kind: 'continue', items: [{ ratingKey: 'shared', serverMachineIdentifier: 'server-b' }] }];
  assert.strictEqual(harness.capturedOptions.multiServerContent.clock, harness.root,
    'multi-server Home enrichment must use the application clock so it can run after startup-critical rendering');
  assert.strictEqual(typeof harness.capturedOptions.multiServerContent.onHomeEnriched, 'function',
    'multi-server content owner must expose lazy Home enrichment through an application callback');
  harness.capturedOptions.multiServerContent.onHomeEnriched(rows);
  assert.ok(harness.invocations.some(function (entry) {
    return entry.owner === 'shell' && entry.method === 'applyHomeEnrichment' && entry.args[0] === rows;
  }), 'lazy external Home rows must be applied through Shell after the primary Home is already available');
  application.destroy();
}());

(function degradedPrimaryHomeOffersContinueOrServerChange() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var start = harness.invocations.length;
  var open;
  var options;
  assert.strictEqual(typeof harness.capturedOptions.multiServerContent.onPrimaryHomeUnavailable, 'function',
    'multi-server Home must surface a non-blocking degraded-primary event to application composition');
  harness.capturedOptions.multiServerContent.onPrimaryHomeUnavailable(new Error('primary offline'));
  open = harness.invocations.slice(start).filter(function (entry) {
    return entry.owner === 'choice' && entry.method === 'open';
  }).pop();
  assert.ok(open, 'a usable secondary-only Home must open a choice instead of silently hiding the primary failure');
  options = open.args[0];
  assert.strictEqual(options.title, 'home.primaryUnavailable');
  assert.deepStrictEqual(options.choices.map(function (choice) { return choice.value; }), ['continue', 'change-server']);
  assert.strictEqual(options.variant, 'confirm', 'degraded Home choice must remain a modal over the visible fallback Home and expose only the two explicit actions');
  start = harness.invocations.length;
  options.apply({ value: 'continue' });
  assert.strictEqual(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'settings' && entry.method === 'enter';
  }), false, 'Continue must keep the current secondary-only Home without navigating away');
  start = harness.invocations.length;
  options.apply({ value: 'change-server' });
  assert.strictEqual(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'settings' && entry.method === 'enter';
  }), true, 'Change server must enter Settings so the existing server editor remains the single switch UI');
  assert.strictEqual(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'server' && entry.method === 'openEditor';
  }), true, 'Change server must open the existing server selector rather than creating a second switcher');
  application.destroy();
}());

(function externalHomeEnrichmentKeepsLoadingAcrossApplicationViews() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  assert.strictEqual(harness.capturedOptions.multiServerContent.canEnrichHome(), true,
    'visible Home must allow external enrichment');
  harness.capturedOptions.library.transitions.setView('library');
  assert.strictEqual(harness.capturedOptions.multiServerContent.canEnrichHome(), true,
    'external Home enrichment must keep loading while the user browses a library');
  harness.capturedOptions.settings.transitions.enter();
  assert.strictEqual(harness.capturedOptions.multiServerContent.canEnrichHome(), true,
    'opening Settings must not suspend pending external Home enrichment');
  harness.capturedOptions.library.transitions.setView('search');
  assert.strictEqual(harness.capturedOptions.multiServerContent.canEnrichHome(), true,
    'Search must not suspend pending external Home enrichment');
  harness.capturedOptions.detail.transitions.enterDetail('home', { ratingKey: 'detail-test' });
  assert.strictEqual(harness.capturedOptions.multiServerContent.canEnrichHome(), true,
    'Detail must not suspend pending external Home enrichment');
  application.destroy();
}());

(function recoveredSecondaryPmsRefreshesHomeImmediately() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var start = harness.invocations.length;
  assert.strictEqual(typeof harness.capturedOptions.librarySources.lifecycle.onAvailabilityRecovered, 'function',
    'LibrarySources must expose secondary PMS recovery to application composition');
  harness.capturedOptions.librarySources.lifecycle.onAvailabilityRecovered('server-b', { wasOffline: true, newlyDiscovered: false });
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'multiServerContent' && entry.method === 'refreshHomeEnrichment';
  }), 'an offline-to-online secondary PMS transition must refresh external Home enrichment immediately instead of waiting for the 10 second poll');
  assert.strictEqual(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'shell' && entry.method === 'refreshHome';
  }), false, 'secondary recovery must not reload the unchanged primary Home just to refresh external rows');
  application.destroy();
}());

(function unavailableSecondaryPmsDropsStaleHomeAndLibraryCacheImmediately() {
  var nav = [{ kind: 'library', sourceId: 'virtual|movie|film', virtualLibrary: true, memberSourceIds: ['server-a|1', 'server-b|1'] }];
  var harness = createHarness({ methodReturns: { 'librarySources.navigationItems': nav } });
  var application = ApplicationController.create(harness.root, harness.document, {});
  var start = harness.invocations.length;
  assert.strictEqual(typeof harness.capturedOptions.librarySources.lifecycle.onAvailabilityLost, 'function',
    'LibrarySources must expose online-to-offline PMS transitions to application composition');
  harness.capturedOptions.librarySources.lifecycle.onAvailabilityLost('server-b');
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'multiServerContent' && entry.method === 'removeHomeSource' && entry.args[0] === 'server-b';
  }), 'a PMS going offline must remove its already cached Home rows immediately');
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'library' && entry.method === 'reconcileNavigation' && entry.args[0] === nav &&
      entry.args[1] && entry.args[1].force === true && entry.args[1].invalidateMachineIdentifier === 'server-b';
  }), 'a PMS going offline must invalidate aggregate Library cache even when memberSourceIds stay unchanged');
  application.destroy();
}());

(function secondaryPmsAvailabilityRefreshesAnOpenSearch() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var start;
  harness.capturedOptions.library.transitions.setView('search');

  start = harness.invocations.length;
  harness.capturedOptions.librarySources.lifecycle.onAvailabilityLost('server-b');
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'search' && entry.method === 'retryAfterNetwork';
  }), 'an open multi-server Search must rerun its current query when a PMS goes offline so stale results disappear');

  start = harness.invocations.length;
  harness.capturedOptions.librarySources.lifecycle.onAvailabilityRecovered('server-b', { wasOffline: true, newlyDiscovered: false });
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'search' && entry.method === 'retryAfterNetwork';
  }), 'an open multi-server Search must rerun its current query when a PMS recovers so its results return');

  start = harness.invocations.length;
  harness.capturedOptions.librarySources.lifecycle.onAvailabilityRecovered('server-c', { newlyDiscovered: true });
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'search' && entry.method === 'retryAfterNetwork';
  }), 'an open multi-server Search must include a newly discovered PMS without waiting for the user to edit the query');
  application.destroy();
}());

(function recoveredSecondaryPmsRetriesAnOpenOwnedDetailAfterRouteRefresh() {
  var harness = createHarness({ methodReturns: {
    'detail.sourceContext': { serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://stale.example' }
  } });
  var application = ApplicationController.create(harness.root, harness.document, {});
  var start;
  harness.capturedOptions.detail.transitions.enterDetail('home', { ratingKey: 'item' });
  start = harness.invocations.length;
  harness.capturedOptions.librarySources.lifecycle.onAvailabilityRecovered('server-b', { wasOffline: true, newlyDiscovered: false });
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'detail' && entry.method === 'recoverAfterNetwork';
  }), 'an open Detail owned by a recovered PMS must retry after the refreshed route is published');
  start = harness.invocations.length;
  harness.capturedOptions.librarySources.lifecycle.onAvailabilityRecovered('server-c', { wasOffline: true, newlyDiscovered: false });
  assert.strictEqual(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'detail' && entry.method === 'recoverAfterNetwork';
  }), false, 'recovery of an unrelated PMS must not reload the open Detail');
  application.destroy();
}());

(function unavailableSecondaryPmsShowsToastOutsidePlaybackOnly() {
  var harness = createHarness({ methodReturns: { 'librarySources.displayServerNameForMachine': 'Living Room PMS' } });
  var application = ApplicationController.create(harness.root, harness.document, {});
  var start = harness.invocations.length;
  harness.capturedOptions.librarySources.lifecycle.onAvailabilityLost('server-b');
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'shell' && entry.method === 'showMessage' && entry.args[0] === 'Living Room PMS · common.offline';
  }), 'a secondary PMS going offline must show the existing passive toast outside playback');

  harness.capturedOptions.library.transitions.setView('player');
  start = harness.invocations.length;
  harness.capturedOptions.librarySources.lifecycle.onAvailabilityLost('server-c');
  assert.strictEqual(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'shell' && entry.method === 'showMessage';
  }), false, 'a PMS going offline during playback must not show a toast over video');
  application.destroy();
}());

(function newlyDiscoveredSecondaryPmsJoinsHomeWithoutRestartingExistingEnrichment() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var start = harness.invocations.length;
  harness.capturedOptions.librarySources.lifecycle.onAvailabilityRecovered('server-c', { newlyDiscovered: true });
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'multiServerContent' && entry.method === 'refreshHomeSource' && entry.args[0] === 'server-c';
  }), 'a newly discovered secondary PMS must join Home through its own progressive enrichment request');
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'library' && entry.method === 'reconcileNavigation' && entry.args[1] &&
      entry.args[1].invalidateMachineIdentifier === 'server-c';
  }), 'new discovery must invalidate cached virtual tabs that were built without the newly reachable PMS');
  assert.strictEqual(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'multiServerContent' && entry.method === 'refreshHomeEnrichment';
  }), false, 'new PMS discovery must not cancel and restart enrichment already running for earlier servers');
  application.destroy();
}());

(function serverVisibilityChangeRefreshesCachedHomeRows() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var start = harness.invocations.length;
  assert.strictEqual(typeof harness.capturedOptions.librarySources.lifecycle.onServerEnabledChanged, 'function',
    'LibrarySources must expose server visibility changes to application composition');
  harness.capturedOptions.librarySources.lifecycle.onServerEnabledChanged('server-b', false);
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'shell' && entry.method === 'refreshHome';
  }), 'disabling a server must refresh Home immediately so cached Continue Watching and Recommended rows lose that server content');
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'library' && entry.method === 'resetContent';
  }), 'server visibility changes must invalidate cached libraries, global playlists, and Watchlist items owned by the disabled server');
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'multiServerContent' && entry.method === 'resetSources';
  }), 'server visibility changes must invalidate multi-server Home and virtual-library caches before refresh');
  application.destroy();
}());

(function serverAliasChangeRefreshesEveryCachedBadgeSurface() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var start = harness.invocations.length;
  assert.strictEqual(typeof harness.capturedOptions.librarySources.lifecycle.onServerAliasChanged, 'function',
    'LibrarySources must expose server alias changes to application composition');
  harness.capturedOptions.librarySources.lifecycle.onServerAliasChanged('server-b');
  assert.ok(harness.invocations.slice(start).some(function (entry) { return entry.owner === 'shell' && entry.method === 'refreshHome'; }),
    'server alias changes must immediately recompose Home badges, including Recently Added');
  assert.ok(harness.invocations.slice(start).some(function (entry) { return entry.owner === 'library' && entry.method === 'resetContent'; }),
    'server alias changes must invalidate cached Playlist and Watchlist card badges');
  assert.ok(harness.invocations.slice(start).some(function (entry) { return entry.owner === 'multiServerContent' && entry.method === 'resetSources'; }),
    'server alias changes must invalidate cached multi-server labels before reloading');
  application.destroy();
}());

(function primaryNavigationStartsSecondaryDiscoveryImmediately() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var start = harness.invocations.length;
  var items = [{ kind: 'home', title: 'Home' }, { kind: 'library', key: '1', title: 'Film', type: 'movie' }];
  harness.capturedOptions.server.application.applyNavigation(items);
  var delta = harness.invocations.slice(start);
  var applyIndex = delta.findIndex(function (entry) { return entry.owner === 'librarySources' && entry.method === 'applyPrimaryNavigation'; });
  var refreshIndex = delta.findIndex(function (entry) { return entry.owner === 'librarySources' && entry.method === 'refresh'; });
  assert.ok(applyIndex >= 0, 'primary navigation must still be published immediately');
  assert.ok(refreshIndex > applyIndex, 'secondary PMS discovery must start immediately after primary navigation without waiting for Home/background warmups');
  application.destroy();
}());

(function publishedLibraryNavigationReconcilesAnOpenLibraryImmediately() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var nav = [{ kind: 'library', sourceId: 'virtual|movie|film', virtualLibrary: true, memberSourceIds: ['server-a|1', 'server-b|1'] }];
  var start = harness.invocations.length;
  harness.capturedOptions.librarySources.presentation.applyNavigation(nav);
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'library' && entry.method === 'reconcileNavigation' && entry.args[0] === nav;
  }), 'every newly published source catalog must reconcile an already-open Library as soon as external members are discovered');
  application.destroy();
}());

(function lateVirtualNavigationRewarmsAdjacentLibraryPrefetch() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var nav = [
    { kind: 'home', title: 'Home' },
    { kind: 'library', sourceId: 'virtual|movie|film', virtualLibrary: true, memberSourceIds: ['server-a|1', 'server-b|1'] }
  ];
  harness.capturedOptions.shell.transitions.onHomeArtworkPreviewReady();
  var start = harness.invocations.length;
  harness.capturedOptions.librarySources.presentation.applyNavigation(nav);
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'library' && entry.method === 'scheduleAdjacentPrefetch' && entry.args[1] === nav &&
      entry.args[2] && entry.args[2].immediate === true;
  }), 'a navigation identity change after startup prefetch must immediately warm the final virtual Library key');
  application.destroy();
}());

(function recoveredSecondaryPmsReconcilesAnOpenAggregatedLibrary() {
  var nav = [{ kind: 'library', sourceId: 'virtual|movie|film', virtualLibrary: true, memberSourceIds: ['server-a|1', 'server-b|1'] }];
  var harness = createHarness({ methodReturns: { 'librarySources.navigationItems': nav } });
  var application = ApplicationController.create(harness.root, harness.document, {});
  harness.capturedOptions.shell.transitions.onHomeArtworkPreviewReady();
  var start = harness.invocations.length;
  harness.capturedOptions.librarySources.lifecycle.onAvailabilityRecovered('server-b', { wasOffline: true, newlyDiscovered: false });
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'library' && entry.method === 'reconcileNavigation' && entry.args[0] === nav &&
      entry.args[1] && entry.args[1].force === true;
  }), 'a recovered secondary PMS must force an aggregate refresh even when its member ids are unchanged');
  assert.ok(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'library' && entry.method === 'scheduleAdjacentPrefetch' && entry.args[1] === nav &&
      entry.args[2] && entry.args[2].immediate === true;
  }), 'recovery invalidation must immediately restart adjacent prefetch on the fresh aggregate definition');
  application.destroy();
}());

(function degradedPrimaryHomeDoesNotInterruptAnotherView() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  var start;
  harness.capturedOptions.library.transitions.setView('library');
  start = harness.invocations.length;
  harness.capturedOptions.multiServerContent.onPrimaryHomeUnavailable(new Error('primary offline'));
  assert.strictEqual(harness.invocations.slice(start).some(function (entry) {
    return entry.owner === 'choice' && entry.method === 'open';
  }), false, 'a late degraded-primary Home callback must not open a modal over Library/Settings/Detail');
  application.destroy();
}());
