'use strict';

var fs = require('fs');
var path = require('path');
var ApplicationSession = require('../../app/application-session');
var PlexFeaturePorts = require('../../app/coordinator/plex-feature-ports');
var PresentationServices = require('../../app/coordinator/presentation-services');
var PlayerRuntimeLoader = require('../../app/player-runtime-loader');

function eventTarget(name) {
  return {
    name: name,
    addEventListener: function () {},
    removeEventListener: function () {}
  };
}

function createHarness(options) {
  var values = options || {};
  var sourcePath = path.join(__dirname, '../../app/coordinator/application-controller.js');
  var source = fs.readFileSync(sourcePath, 'utf8');
  var compositionPath = path.join(__dirname, '../../app/coordinator/player-composition.js');
  if (fs.existsSync(compositionPath)) { source += fs.readFileSync(compositionPath, 'utf8'); }
  var moduleNames = source.match(/root\.Ploff[A-Za-z0-9_]+/g) || [];
  var root = { localStorage: values.localStorage || {}, navigator: { userAgent: 'composition-test' }, location: {} };
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
  var timers = [];
  var injectedScripts = [];
  var nextTimer = 0;

  moduleNames.forEach(function (entry) { root[entry.slice(5)] = {}; });

  root.PloffNativeVideoDriver = values.NativeVideoDriver || { create: function () {} };
  root.PloffPlaybackReposition = values.PlaybackReposition || { create: function () {} };
  root.PloffPlaybackSession = values.PlaybackSession || { create: function () {} };
  root.PloffPlaybackTimeline = values.PlaybackTimeline || { create: function () {} };
  root.PloffSubtitleRuntime = values.SubtitleRuntime || { create: function () {} };
  root.PloffAssHtml5SubtitleRenderer = values.AssHtml5SubtitleRenderer || null;
  root.PloffAssSubtitleRenderer = values.AssSubtitleRenderer || null;
  root.PloffAssSubtitleRendererPool = values.AssSubtitleRendererPool || factory('assPool');
  root.PloffAssSubtitlePrefetch = values.AssSubtitlePrefetch || factory('assPrefetch');
  root.PloffAssSubtitleWorkerPreloader = values.AssSubtitleWorkerPreloader || null;
  root.setTimeout = function (callback, delay) {
    var entry = { id: ++nextTimer, callback: callback, delay: delay, active: true };
    timers.push(entry);
    if (values.setTimeout) { entry.externalId = values.setTimeout(callback, delay); }
    return entry.id;
  };
  root.clearTimeout = function (id) {
    timers.forEach(function (entry) {
      if (entry.id === id) {
        entry.active = false;
        if (values.clearTimeout) { values.clearTimeout(entry.externalId); }
      }
    });
  };
  root.PloffPlayerQueueController = values.PlayerQueueController || { create: function () {} };
  root.PloffPlexFeaturePorts = PlexFeaturePorts;
  root.PloffBuildInfo = values.BuildInfo || { version: 'test' };
  if (values.PlaybackCompatibilityMemory) { root.PloffPlaybackCompatibilityMemory = values.PlaybackCompatibilityMemory; }
  root.PloffPresentationServices = PresentationServices;
  root.PloffClient = {};
  [
    'findByGuid', 'loadAccountProfile', 'loadActivities', 'loadHome',
    'loadLibraryContainerPage', 'loadLibraryFilterOptions', 'loadLibraryPage',
    'loadLibraryRecommendations', 'loadMediaProfile', 'loadMetadata', 'loadExtras',
    'loadNavigation', 'loadPlayback', 'loadSeasonEpisodes', 'loadSeriesContext',
    'loadServerIdentity', 'loadSubtitleText', 'pingTranscode', 'posterUrl',
    'preparePlayback', 'refreshLibrary', 'refreshLibraryMetadata',
    'refreshMetadata', 'rotateTranscodeSession', 'search', 'sendTimeline',
    'setStreamSelection', 'setSubtitleOffset', 'setWatchedAndReset', 'resetProgress', 'removeFromContinueWatching', 'unexpected'
    , 'loadSettingsBackupPlaylists', 'createSettingsBackupPlaylist', 'updateSettingsBackupPlaylist', 'deleteSettingsBackupPlaylist'
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
            if (values.methodHandlers && Object.prototype.hasOwnProperty.call(values.methodHandlers, methodKey)) {
              return values.methodHandlers[methodKey].apply(null, args);
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

  root.PloffSettings = values.Settings || {
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
    ['PloffPlexSettingsBackupStore', 'settingsBackup'],
    ['PloffChoiceDialogController', 'choice'],
    ['PloffMediaInfoDialogController', 'mediaInfo'],
    ['PloffShellFeatureController', 'shell'],
    ['PloffLibraryFeatureController', 'library'],
    ['PloffDetailFeatureController', 'detail'],
    ['PloffPlayerFeatureController', 'player'],
    ['PloffMediaContextController', 'mediaContext'],
    ['PloffInputController', 'input'],
    ['PloffPointerController', 'pointer'],
    ['PloffSearchFeatureController', 'search'],
    ['PloffSettingsFeatureController', 'settings'],
    ['PloffSetupFeatureController', 'setup'],
    ['PloffDiagnosticsFeatureController', 'diagnostics']
  ].forEach(function (pair) { root[pair[0]] = factory(pair[1]); });

  if (!values.deferPlayer && fs.existsSync(compositionPath)) { root.PloffPlayerComposition = require(compositionPath); }
  root.PloffPlayerRuntimeLoader = {
    create: function (options) {
      recordCall('create:playerLoader');
      createOrder.push('playerLoader');
      capturedOptions.playerLoader = options;
      var loader = PlayerRuntimeLoader.create(options);
      var originalDestroy = loader.destroy;
      loader.destroy = function () { recordCall('destroy:playerLoader'); destroyOrder.push('playerLoader'); originalDestroy(); };
      created.playerLoader = loader;
      return loader;
    }
  };

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
      else { callback(values.deviceCapabilities || {}); }
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
      head: {
        appendChild: function (script) { injectedScripts.push(script); script.parentNode = this; },
        removeChild: function (script) { script.parentNode = null; }
      },
      getElementsByTagName: function () { return [{ src: 'app.js?v=fixture' }]; },
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
    injectedScripts: injectedScripts,
    timers: timers,
    runTimers: function (delay) {
      timers.slice().forEach(function (entry) {
        if (entry.active && (delay === undefined || entry.delay === delay)) { entry.active = false; entry.callback(); }
      });
    },
    warmPlayer: function () {
      capturedOptions.shell.transitions.onHomeReady();
      timers.slice().forEach(function (entry) {
        if (entry.active && entry.delay > 0) { entry.active = false; entry.callback(); }
      });
    },
    loadPlayerCode: function () {
      root.PloffPlayerComposition = require(compositionPath);
      var script = injectedScripts[injectedScripts.length - 1];
      if (script && script.onload) { script.onload(); }
    },
    completeDevice: function (capabilities) { if (deviceCallback) { deviceCallback(capabilities || {}); } }
  };
}



module.exports = { createHarness: createHarness };
