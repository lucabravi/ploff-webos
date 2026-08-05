'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var ApplicationController = require('../app/coordinator/application-controller');
var ApplicationSession = require('../app/application-session');
var PlexFeaturePorts = require('../app/coordinator/plex-feature-ports');
var PresentationServices = require('../app/coordinator/presentation-services');

function eventTarget(name) {
  return {
    name: name,
    addEventListener: function () {},
    removeEventListener: function () {}
  };
}

function createHarness(options) {
  var values = options || {};
  var sourcePath = path.join(__dirname, '../app/coordinator/application-controller.js');
  var source = fs.readFileSync(sourcePath, 'utf8');
  var moduleNames = source.match(/root\.Ploff[A-Za-z0-9_]+/g) || [];
  var root = { localStorage: {}, navigator: { userAgent: 'composition-test' }, location: {} };
  var calls = [];
  var createOrder = [];
  var destroyOrder = [];
  var created = {};
  var capturedOptions = {};
  var nodes = {};
  var deviceCallback = null;
  var sessionUpdates = [];
  var sessionSnapshotCalls = 0;
  var invocations = [];

  moduleNames.forEach(function (entry) { root[entry.slice(5)] = {}; });

  root.PloffPlexFeaturePorts = PlexFeaturePorts;
  root.PloffPresentationServices = PresentationServices;
  root.PloffClient = {};
  [
    'findByGuid', 'loadAccountProfile', 'loadActivities', 'loadHome',
    'loadLibraryContainerPage', 'loadLibraryFilterOptions', 'loadLibraryPage',
    'loadLibraryRecommendations', 'loadMediaProfile', 'loadMetadata',
    'loadNavigation', 'loadPlayback', 'loadSeasonEpisodes', 'loadSeriesContext',
    'loadServerIdentity', 'loadSubtitleText', 'pingTranscode', 'posterUrl',
    'preparePlayback', 'refreshLibrary', 'refreshLibraryMetadata',
    'refreshMetadata', 'rotateTranscodeSession', 'search', 'sendTimeline',
    'setStreamSelection', 'setSubtitleOffset', 'setWatchedAndReset', 'unexpected'
  ].forEach(function (name) { root.PloffClient[name] = function () {}; });

  function recordCall(name) {
    calls.push(name);
    if (typeof values.onCall === 'function') { values.onCall(name); }
  }

  function owner(name) {
    var target = {
      destroy: function () {
        recordCall('destroy:' + name);
        destroyOrder.push(name);
        if (values.failDestroy === name) { throw new Error('destroy failed: ' + name); }
      }
    };
    return new Proxy(target, {
      get: function (object, property) {
        if (!Object.prototype.hasOwnProperty.call(object, property)) {
          object[property] = function () {
            var args = Array.prototype.slice.call(arguments);
            var methodKey = name + '.' + String(property);
            recordCall(String(property) + ':' + name);
            invocations.push({ owner: name, method: String(property), args: args });
            if (values.failStartup === methodKey) {
              throw new Error('startup failed: ' + methodKey);
            }
            if (values.methodReturns && Object.prototype.hasOwnProperty.call(values.methodReturns, methodKey)) {
              return values.methodReturns[methodKey];
            }
            if (property === 'navigationItems') { return []; }
            if (property === 'focusState') { return { area: 'media', navIndex: 0, rowIndex: 0, column: 0 }; }
            if (property === 'snapshot') { return {}; }
            return undefined;
          };
        }
        return object[property];
      }
    });
  }

  function factory(name) {
    return {
      create: function (factoryOptions) {
        recordCall('create:' + name);
        createOrder.push(name);
        capturedOptions[name] = factoryOptions;
        if (values.failCreate === name) { throw new Error('create failed: ' + name); }
        created[name] = owner(name);
        return created[name];
      }
    };
  }

  root.PloffSettings = {
    load: function () { return {}; },
    seedFromPlex: function (settings) { return settings; }
  };
  root.PloffPlexAuth = { clientIdentifier: function () { return 'composition-test'; } };
  root.PloffReleaseStatus = {
    create: function () {
      return { check: function () { recordCall('release:check'); }, snapshot: function () { return { status: 'unknown', installedVersion: 'test' }; }, destroy: function () { recordCall('release:destroy'); } };
    }
  };
  root.PloffPlayerTimelinePolicy = {
    formatTime: function () { return ''; },
    formatLongTime: function () { return ''; }
  };
  root.PloffNavigationModel = {
    load: function () { return []; },
    applyLibraryOrder: function (items) { return items || []; }
  };
  root.PloffDeviceLocale = { detect: function (_root, _supported, callback) { callback('en'); } };
  root.PloffApplicationSession = {
    create: function (initial) {
      var session;
      var destroySession;
      var updateSession;
      recordCall('create:session');
      createOrder.push('session');
      if (values.failCreate === 'session') { throw new Error('create failed: session'); }
      session = ApplicationSession.create(initial);
      destroySession = session.destroy;
      updateSession = session.update;
      var snapshotSession = session.snapshot;
      session.snapshot = function () {
        sessionSnapshotCalls += 1;
        return snapshotSession();
      };
      session.update = function (patch) {
        sessionUpdates.push(patch);
        return updateSession(patch);
      };
      session.destroy = function () {
        recordCall('destroy:session');
        destroyOrder.push('session');
        if (values.failDestroy === 'session') { throw new Error('destroy failed: session'); }
        destroySession();
      };
      created.session = session;
      return session;
    }
  };

  [
    ['PloffServerFeatureController', 'server'],
    ['PloffChoiceDialogController', 'choice'],
    ['PloffMediaInfoDialogController', 'mediaInfo'],
    ['PloffShellFeatureController', 'shell'],
    ['PloffLibraryFeatureController', 'library'],
    ['PloffDetailFeatureController', 'detail'],
    ['PloffPlayerFeatureController', 'player'],
    ['PloffInputController', 'input'],
    ['PloffPointerController', 'pointer'],
    ['PloffSearchFeatureController', 'search'],
    ['PloffSettingsFeatureController', 'settings'],
    ['PloffSetupFeatureController', 'setup'],
    ['PloffDiagnosticsFeatureController', 'diagnostics']
  ].forEach(function (pair) { root[pair[0]] = factory(pair[1]); });

  root.PloffApplicationEvents = {
    bind: function (entries) {
      recordCall('create:events');
      createOrder.push('events');
      capturedOptions.events = entries;
      if (values.failCreate === 'events') { throw new Error('create failed: events'); }
      created.events = owner('events');
      return created.events;
    }
  };
  root.PloffDeviceCapabilities = {
    detect: function (_root, callback) {
      recordCall('startup:device');
      if (values.failStartup === 'device') { throw new Error('startup failed: device'); }
      if (values.deferDevice) { deviceCallback = callback; }
      else { callback({}); }
    }
  };

  nodes.document = eventTarget('document');
  nodes.root = eventTarget('root');
  root.addEventListener = nodes.root.addEventListener;
  root.removeEventListener = nodes.root.removeEventListener;

  return {
    root: root,
    document: {
      hidden: false,
      getElementById: function (id) {
        if (!nodes[id]) { nodes[id] = eventTarget(id); }
        return nodes[id];
      },
      createElement: function (tagName) { return eventTarget(tagName); },
      querySelector: function () { return null; }
    },
    calls: calls,
    createOrder: createOrder,
    destroyOrder: destroyOrder,
    created: created,
    capturedOptions: capturedOptions,
    sessionUpdates: sessionUpdates,
    sessionSnapshotCalls: function () { return sessionSnapshotCalls; },
    invocations: invocations,
    completeDevice: function (capabilities) { if (deviceCallback) { deviceCallback(capabilities || {}); } }
  };
}

var expectedCreation = [
  'session', 'server', 'choice', 'mediaInfo', 'shell', 'library', 'detail', 'player',
  'input', 'pointer', 'search', 'settings', 'setup', 'diagnostics', 'events'
];

(function updateCheckStartsOnlyFromThePostHomeHook() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
  assert.strictEqual(harness.calls.indexOf('release:check'), -1, 'application construction must not start the update request');
  harness.capturedOptions.shell.transitions.onHomeReady();
  assert.ok(harness.calls.indexOf('release:check') >= 0, 'the first successful Home presentation owns the lazy update trigger');
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
    ['pointer', 'input', 'player', 'detail', 'library', 'shell', 'mediaInfo', 'choice', 'server', 'session'],
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
    ['pointer', 'input', 'player', 'detail', 'library', 'shell', 'mediaInfo', 'choice', 'server', 'session'],
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
  var playbackCapabilities = harness.capturedOptions.player.data.playbackCapabilities;
  assert.strictEqual(playbackCapabilities().directPlay, false);
  application.destroy();
  harness.completeDevice({ directPlay: true });
  assert.strictEqual(playbackCapabilities().directPlay, false, 'late startup callbacks must be ignored after root teardown');
}());


(function diagnosticsPortsResolveLivePlaybackAndServerOwners() {
  var harness = createHarness();
  var application = ApplicationController.create(harness.root, harness.document, {});
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
    'loadMediaProfile', 'loadMetadata', 'loadSeasonEpisodes', 'loadSeriesContext',
    'refreshMetadata', 'setWatchedAndReset'
  ], 'Detail must receive only detail, series, mutation, and refresh transport');
  assert.strictEqual(
    harness.capturedOptions.player.data.PlexClient,
    harness.root.PloffClient,
    'Player must receive the exact original PlexClient object so playback APIs and semantics remain unchanged'
  );

  application.destroy();
}());

console.log('Application composition checks passed');
