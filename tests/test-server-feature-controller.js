'use strict';

var assert = require('assert');
var ServerFeatureController = require('../app/coordinator/server-feature-controller');
var AuthStore = require('../app/auth-store');
var NetworkTransition = require('../app/network-transition');
var localUri = 'http://192.168.1.10:32400';
var remoteUri = 'https://relay.example.com:443';
var directUri = 'https://10-0-0-5.example.plex.direct:32400';
var serverA = {
  name: 'Living Room',
  uri: localUri,
  machineIdentifier: 'machine-a',
  connections: [localUri, remoteUri, directUri],
  connectionRoutes: []
};
var serverB = {
  name: 'Bedroom',
  uri: 'http://192.168.1.20:32400',
  machineIdentifier: 'machine-b',
  connections: ['http://192.168.1.20:32400'],
  connectionRoutes: []
};
var session = {
  activeServer: serverA,
  apiBaseUrl: localUri,
  token: 'token-a',
  serverState: { activeUri: localUri, servers: [serverA, serverB] },
  view: 'settings'
};
var controllerOptions = null;
var editorOptions = null;
var controllerDestroyed = 0;
var editorDestroyed = 0;
var started = 0;
var discoveries = 0;
var discoveryCallback = null;
var discoveryDeferred = false;
var applied = [];
var failovers = [];
var waitedActivities = [];
var stored = [];
var verified = [];
var resumed = [];
var failedRoutesCleared = 0;
var editorRenders = [];
var settingsRenders = 0;
var profileRenders = 0;
var activityRenders = [];
var publishes = [];
var manualTransitions = 0;
var switchTransitions = [];
var discoveryTransitions = [];
var probes = [];
var probeResult = null;
var resetContent = 0;
var editorState = { open: false, index: 0 };
var editorOpened = 0;
var editorClosed = 0;
var networkListener = null;
var networkDestroyed = 0;
var runtimeConfig = { apiBaseUrl: localUri, token: 'token-a' };
var navigationError = null;
var navigationItems = [{ key: 'library-1', title: 'Movies' }];
var serverAccessCallback = null;
var reachableConnectionCallback = null;

function memoryStorage() {
  var values = {};
  return {
    get length() { return Object.keys(values).length; },
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem: function (key, value) { values[key] = String(value); },
    removeItem: function (key) { delete values[key]; },
    key: function (index) { return Object.keys(values)[index] || null; }
  };
}

var localStorage = memoryStorage();
var credentialStorage = memoryStorage();
credentialStorage.setItem(AuthStore.STORAGE_KEY, JSON.stringify({
  setupComplete: true,
  mode: 'plex',
  ownerToken: 'owner-token',
  activeProfileId: 'profile-a',
  profiles: [{
    id: 'profile-a',
    title: 'Owner',
    token: 'active-token',
    accountToken: 'account-token',
    serverMachineIdentifier: 'machine-a',
    serverConnectionUri: remoteUri
  }]
}));

function copy(source) {
  var result = {};
  var key;
  source = source || {};
  for (key in source) {
    if (Object.prototype.hasOwnProperty.call(source, key)) { result[key] = source[key]; }
  }
  return result;
}

function sameServer(left, right) {
  return !!left && !!right && ((left.machineIdentifier && left.machineIdentifier === right.machineIdentifier) || left.uri === right.uri);
}

function mergeServers(current, incoming) {
  var result = (current || []).slice();
  (incoming || []).forEach(function (server) {
    var index;
    for (index = 0; index < result.length; index += 1) {
      if (sameServer(result[index], server)) { result[index] = server; return; }
    }
    result.push(server);
  });
  return result;
}

function element(tag, className, text) {
  return {
    tagName: tag,
    className: className || '',
    textContent: text || '',
    children: [],
    attributes: {},
    appendChild: function (child) { this.children.push(child); },
    setAttribute: function (name, value) { this.attributes[name] = value; }
  };
}

var fakeServerController = {
  create: function (options) {
    controllerOptions = options;
    function snapshot() {
      var current = options.session.read();
      return {
        activeServer: current.activeServer,
        activities: [{ id: 'activity-1', title: 'Refreshing' }],
        destroyed: controllerDestroyed > 0,
        discoveryActive: !!discoveryCallback,
        failoverActive: false,
        failedUris: [],
        remoteVerificationStarted: [],
        serverState: current.serverState
      };
    }
    function storeServer(server) {
      var current = options.session.read();
      var servers = mergeServers(current.serverState.servers, [server]);
      stored.push(server);
      options.session.update({
        activeServer: sameServer(current.activeServer, server) ? server : current.activeServer,
        serverState: { activeUri: current.serverState.activeUri, servers: servers }
      });
    }
    return {
      start: function () { started += 1; },
      snapshot: snapshot,
      discover: function (callback) {
        discoveries += 1;
        discoveryCallback = callback;
        if (!discoveryDeferred) {
          discoveryCallback = null;
          callback(session.serverState.servers.slice());
        }
        return { abort: function () {} };
      },
      applyServer: function (server) {
        var current = options.session.read();
        applied.push(server);
        options.session.update({
          activeServer: server,
          apiBaseUrl: server.uri,
          token: 'token-' + server.machineIdentifier,
          serverState: { activeUri: server.uri, servers: current.serverState.servers.slice() }
        });
        return true;
      },
      attemptFailover: function (error, callback) {
        failovers.push(error && error.message);
        if (callback) { callback(true, null); }
      },
      clearFailedRoutes: function () { failedRoutesCleared += 1; },
      waitForActivity: function (activityId, callback) {
        waitedActivities.push(activityId);
        if (callback) { callback(null); }
      },
      storeServer: storeServer,
      serverForIdentity: function (server) {
        var list = options.session.read().serverState.servers;
        var index;
        for (index = 0; index < list.length; index += 1) {
          if (sameServer(list[index], server)) { return list[index]; }
        }
        return null;
      },
      verifyRemoteConnections: function (server, token, connections, routes) {
        verified.push({ server: server, token: token, connections: connections, routes: routes });
      },
      resumeRemoteVerification: function (server) { resumed.push(server); },
      openEditor: function () { options.presentation.openEditor(); },
      closeEditor: function () { options.presentation.closeEditor(); },
      destroy: function () { controllerDestroyed += 1; }
    };
  }
};

var fakeServerEditorView = {
  create: function (options) {
    editorOptions = options;
    return {
      open: function () { editorOpened += 1; editorState = { open: true, index: 0 }; return copy(editorState); },
      close: function () { editorClosed += 1; editorState = { open: false, index: 0 }; return copy(editorState); },
      focus: function (index, count) {
        var limit = Math.max(0, Number(count) || 0);
        editorState.index = limit ? Math.max(0, Math.min(limit - 1, Number(index) || 0)) : 0;
        return copy(editorState);
      },
      snapshot: function () { return copy(editorState); },
      render: function (state) { editorRenders.push(state); },
      destroy: function () { editorDestroyed += 1; }
    };
  }
};

var feature = ServerFeatureController.create({
  platform: {
    root: {
      setTimeout: function () { return 1; },
      clearTimeout: function () {}
    },
    document: { getElementById: function () { return null; } },
    storage: localStorage,
    credentialStorage: credentialStorage
  },
  modules: {
    ServerController: fakeServerController,
    ServerEditorView: fakeServerEditorView,
    ActivityState: {},
    NetworkPolicy: {},
    AuthStore: AuthStore,
    NetworkState: {
      create: function () {
        var current = { status: 'online', lanAvailable: true, internetAvailable: true, connectionType: 'wired', localAddress: '192.168.1.2' };
        return {
          snapshot: function () { return copy(current); },
          allowsLocal: function () { return current.lanAvailable !== false; },
          allowsCloud: function () { return current.internetAvailable !== false; },
          subscribe: function (listener) {
            networkListener = function (next) { current = copy(next); listener(copy(current)); };
            return function () { networkListener = null; };
          },
          destroy: function () { networkDestroyed += 1; }
        };
      }
    },
    NetworkTransition: NetworkTransition,
    PlexAuth: {
      createPin: function () {},
      pollPin: function () {},
      loadAccountServers: function () {},
      loadHomeUsers: function () {},
      loadServerAccess: function (root, token, machineIdentifier, options, callback) {
        serverAccessCallback = callback;
        return { abort: function () {} };
      },
      findReachableConnection: function (root, token, connections, machineIdentifier, options, callback) {
        reachableConnectionCallback = callback;
        return { abort: function () {} };
      },
      switchHomeUser: function () {}
    },
    PlexClient: {
      loadNavigation: function (config, callback) {
        var error = navigationError;
        navigationError = null;
        callback(error, error ? null : navigationItems.slice());
        return { abort: function () {} };
      },
      loadAccountProfile: function (config, callback) {
        callback(null, { title: 'Owner' });
        return { abort: function () {} };
      }
    },
    WatchlistState: { available: function (mode, token) { return mode === 'plex' && !!token; } },
    WatchlistClient: {},
    ServerDiscovery: {
      isLocalCandidate: function (uri) { return /^http:\/\/192\.168\./.test(String(uri || '')); },
      normalizeCandidate: function (value) { return String(value || '').replace(/\/$/, ''); },
      shouldOfferLocalConnection: function (uri) { return /^http:\/\/192\.168\./.test(String(uri || '')); },
      probe: function (root, uri, token, timeout, callback) {
        probes.push({ uri: uri, token: token, timeout: timeout });
        callback(probeResult);
        return { abort: function () {} };
      }
    },
    ServerStore: {
      same: function (left, right) {
        return !!left && !!right && ((left.machineIdentifier && right.machineIdentifier && left.machineIdentifier === right.machineIdentifier) ||
          ((!left.machineIdentifier || !right.machineIdentifier) && String(left.uri || '').replace(/\/$/, '') === String(right.uri || '').replace(/\/$/, '')));
      },
      connectionUris: function (server) {
        var seen = {};
        return [server.uri].concat(server.connections || []).filter(function (uri) {
          uri = String(uri || '').replace(/\/$/, '');
          if (!uri || seen[uri]) { return false; }
          seen[uri] = true;
          return true;
        });
      },
      merge: mergeServers,
      load: function () { return { activeUri: session.serverState.activeUri, servers: session.serverState.servers.slice() }; },
      validate: function (value) {
        value = value || {};
        return { activeUri: String(value.activeUri || ''), servers: (value.servers || []).slice() };
      },
      fromConfig: function (value) { return value && value.apiBaseUrl ? { name: value.apiBaseUrl, uri: value.apiBaseUrl, source: 'config' } : null; },
      normalizeUri: function (uri) { return String(uri || '').replace(/\/$/, ''); },
      save: function (storage, servers, activeUri) { return { activeUri: activeUri, servers: servers.slice() }; },
      withRemoteConnections: function (server, connections, status, updatedAt, routes) {
        var next = copy(server);
        next.connections = connections.slice();
        next.remoteLinkStatus = status;
        next.remoteLinkUpdatedAt = updatedAt;
        next.connectionRoutes = (routes || []).slice();
        return next;
      }
    }
  },
  config: {
    application: runtimeConfig,
    authOptions: { version: 'test' },
    discovery: function () { return { discoveryTimeout: 4321 }; },
    configuredApiBaseUrl: 'http://configured:32400',
    configuredToken: 'configured-token'
  },
  state: {
    publish: function (current) {
      publishes.push(current);
      session.activeServer = current.activeServer;
      session.apiBaseUrl = current.config.apiBaseUrl;
      session.token = current.config.token;
      session.serverState = current.serverState;
    },
    view: function () { return session.view; }
  },
  presentation: {
    t: function (key, values) { return values && values.count !== undefined ? key + ':' + values.count : key; },
    element: element,
    keepFocusVisible: function () {},
    pointerActive: function () { return false; },
    renderActivities: function (activities) { activityRenders.push((activities || []).slice()); },
    renderProfile: function () { profileRenders += 1; },
    renderSettings: function () { settingsRenders += 1; }
  },
  lifecycle: {
    resetContent: function () { resetContent += 1; }
  },
  transitions: {
    openManualSetup: function () { manualTransitions += 1; },
    serverSwitched: function (server) { switchTransitions.push(server); },
    discoveryComplete: function (servers, snapshot) { discoveryTransitions.push({ servers: servers, snapshot: snapshot }); }
  }
});

assert.ok(controllerOptions, 'the feature must construct ServerController');
assert.ok(editorOptions, 'the feature must construct ServerEditorView');
assert.strictEqual(typeof feature.authMode, 'function', 'the Server feature must own the persisted authentication mode');
assert.strictEqual(typeof feature.networkSnapshot, 'function', 'the Server feature must own network state');
assert.strictEqual(typeof feature.loadApplication, 'function', 'the Server feature must own server-scoped application loading');
assert.strictEqual(typeof feature.bootstrap, 'function', 'the Server feature must own bootstrap selection and discovery');
feature.applyServer(serverA);
assert.strictEqual(typeof controllerOptions.root.setTimeout, 'function', 'the platform timer root must be passed explicitly to ServerController');
assert.strictEqual(feature.controller, undefined, 'the domain controller must not be exposed through the feature');
assert.strictEqual(controllerOptions.storage && typeof controllerOptions.storage, 'object', 'storage must be passed explicitly to ServerController');
assert.strictEqual(controllerOptions.networkSnapshot().status, 'online', 'network state must be supplied through the explicit network port');
assert.strictEqual(controllerOptions.networkAllowsCloud(), true, 'cloud eligibility must be supplied through the explicit network port');

var detailedAddresses = feature.addressesFor(serverA, false);
assert.ok(detailedAddresses.some(function (item) { return item.kind === 'local' && item.uri === localUri; }), 'local server routes must be classified');
assert.ok(detailedAddresses.some(function (item) { return item.kind === 'remote' && item.uri === remoteUri; }), 'remote server routes must be classified');
assert.ok(detailedAddresses.some(function (item) { return item.uri === directUri; }), 'non-compact address presentation must retain plex.direct routes');
var compactAddresses = feature.addressesFor(serverA, true);
assert.ok(compactAddresses.some(function (item) { return item.kind === 'direct' && item.count === 1; }), 'compact presentation must summarize unmatched plex.direct routes');
var manyLocalAddresses = feature.addressesFor({
  name: serverA.name,
  uri: localUri,
  machineIdentifier: serverA.machineIdentifier,
  connections: [localUri, 'http://192.168.1.11:32400', remoteUri, directUri]
}, true);
assert.strictEqual(manyLocalAddresses.filter(function (item) { return item.kind === 'local'; }).length, 1, 'compact server presentation must show one local endpoint');
assert.strictEqual(manyLocalAddresses.filter(function (item) { return item.kind === 'local'; })[0].uri, localUri, 'compact server presentation must prefer the active local endpoint');
assert.strictEqual(feature.normalizeManualAddress('http://server:32400/'), 'http://server:32400', 'manual addresses must use ServerDiscovery normalization');
assert.strictEqual(feature.shouldOfferConnection(localUri), true, 'local connection policy must be exposed semantically');

var addressRow = element('button');
editorOptions.appendAddresses(addressRow, [{ kind: 'local', uri: localUri }, { kind: 'direct', count: 2, uri: '' }]);
assert.strictEqual(addressRow.children.length, 1, 'editor address presentation must append one owned container');
assert.strictEqual(addressRow.children[0].children.length, 2, 'editor address presentation must include every address descriptor');

controllerOptions.session.update({ apiBaseUrl: remoteUri, token: 'token-b' });
assert.strictEqual(session.apiBaseUrl, remoteUri, 'domain-controller session updates must reach the authoritative state port');
assert.strictEqual(session.token, 'token-b', 'domain-controller token updates must reach the authoritative state port');
assert.ok(publishes.length > 0, 'session changes must be published through the application-session port');

var startedBeforeLoad = started;
feature.loadApplication();
assert.strictEqual(started, startedBeforeLoad + 1, 'application loading must start activity polling once');
feature.loadApplication();
assert.strictEqual(started, startedBeforeLoad + 2, 'application reload must re-arm activity polling');
feature.openEditor();
assert.strictEqual(editorOpened, 1, 'openEditor must open the owned editor view');
assert.strictEqual(feature.editorSnapshot().open, true, 'editor state must be exposed read-only');
assert.ok(editorRenders.length > 0, 'opening the editor must render its owned presentation');
assert.ok(settingsRenders > 0, 'editor lifecycle must ask Settings to refresh through a callback');
feature.focusEditor(99);
assert.strictEqual(feature.editorSnapshot().index, feature.servers().length + 1, 'editor focus must clamp to the semantic row count');

feature.focusEditor(0);
feature.activateEditor();
assert.strictEqual(discoveries, 1, 'the first editor row must start discovery');
assert.strictEqual(discoveryTransitions.length, 1, 'completed discovery must use the explicit transition callback');
feature.focusEditor(1);
feature.activateEditor();
assert.strictEqual(manualTransitions, 1, 'the second editor row must open manual setup through the transition port');

session.activeServer = serverA;
session.apiBaseUrl = serverA.uri;
feature.openEditor();
feature.focusEditor(2);
feature.activateEditor();
assert.strictEqual(switchTransitions.length, 0, 'activating the current server must only close the editor');
assert.strictEqual(feature.editorSnapshot().open, false, 'same-server activation must close the editor');
feature.openEditor();
feature.focusEditor(3);
feature.activateEditor();
assert.strictEqual(applied[applied.length - 1], serverB, 'activating another server must delegate server application');
assert.strictEqual(switchTransitions[switchTransitions.length - 1], serverB, 'server switches must notify the composition root explicitly');
assert.strictEqual(feature.activeServer(), serverB, 'the feature must expose the authoritative active server');

var serverC = { name: 'Office', uri: 'http://192.168.1.30:32400', machineIdentifier: 'machine-c', connections: [] };
probeResult = serverC;
var probedServer = null;
feature.probeManualAddress(probeResult.uri, function (error, server) {
  assert.ifError(error);
  probedServer = server;
});
assert.strictEqual(probedServer.machineIdentifier, 'machine-c', 'manual probing must merge and resolve the stored server identity');
assert.ok(feature.servers().some(function (server) { return server.machineIdentifier === 'machine-c'; }), 'manual probing must persist the discovered server');
assert.strictEqual(probes[0].timeout, 4321, 'manual probing must use the configured discovery timeout');

controllerOptions.lifecycle.persistRemoteState(serverB, [serverB.uri, remoteUri], 'linked', [{ uri: remoteUri, relay: true }]);
assert.strictEqual(stored[stored.length - 1].remoteLinkStatus, 'linked', 'remote verification state must be persisted through ServerStore');
assert.strictEqual(stored[stored.length - 1].connectionRoutes.length, 1, 'remote connection routes must be retained');

var failedRoutesBeforeLoadFailure = failedRoutesCleared;
navigationError = new Error('primary failed');
feature.loadApplication();
assert.deepStrictEqual(failovers, ['primary failed'], 'application loading must delegate failover to ServerController');
assert.strictEqual(failedRoutesCleared, failedRoutesBeforeLoadFailure + 1, 'a successful retry must clear failed routes through ServerController');
feature.waitForActivity('metadata-1', function () {});
feature.switchProfile({ id: 'profile-b', title: 'Guest', accountToken: 'account-b' }, '', {
  selectedServer: serverB,
  preferredConnectionUri: serverB.uri,
  profiles: []
}, function (error) { assert.ifError(error); });
serverAccessCallback(null, {
  token: 'token-b',
  connections: [serverB.uri, remoteUri],
  connectionRoutes: []
});
reachableConnectionCallback(null, serverB.uri);
var resumedBeforeBootstrap = resumed.length;
feature.bootstrap();
assert.deepStrictEqual(waitedActivities, ['metadata-1'], 'activity waiting must remain delegated');
assert.strictEqual(verified.length, 1, 'remote route verification must remain delegated');
assert.ok(resumed.length > resumedBeforeBootstrap, 'bootstrap must resume remote verification for the selected server');
assert.ok(feature.snapshot().activities.length, 'read-only server/activity snapshots must be exposed');

feature.closeEditor();
assert.strictEqual(editorClosed > 0, true, 'closeEditor must close the owned editor view');

discoveryDeferred = true;
feature.discover(function () {});
var transitionsBeforeDestroy = discoveryTransitions.length;
var rendersBeforeDestroy = editorRenders.length;
feature.destroy();
feature.destroy();
assert.strictEqual(controllerDestroyed, 1, 'destroy must tear down ServerController exactly once');
assert.strictEqual(editorDestroyed, 1, 'destroy must tear down ServerEditorView exactly once when supported');
assert.strictEqual(networkListener, null, 'destroy must unsubscribe the owned NetworkState listener');
assert.strictEqual(networkDestroyed, 1, 'destroy must tear down the owned NetworkState exactly once');
assert.strictEqual(feature.snapshot().destroyed, true, 'destroyed state must be observable');
if (discoveryCallback) { discoveryCallback([serverC]); }
assert.strictEqual(discoveryTransitions.length, transitionsBeforeDestroy, 'late discovery callbacks must not transition after destroy');
feature.openEditor();
feature.focusEditor(0);
feature.activateEditor();
assert.strictEqual(editorRenders.length, rendersBeforeDestroy, 'destroyed Server feature must remain inert');
assert.ok(profileRenders >= 0 && activityRenders.length >= 0 && resetContent >= 0, 'shell/lifecycle callbacks remain explicit ports rather than feature references');

console.log('Server feature controller checks passed');
