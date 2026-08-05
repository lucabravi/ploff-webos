'use strict';

var assert = require('assert');
var ServerFeatureController = require('../app/coordinator/server-feature-controller');
var AuthStore = require('../app/auth-store');
var NetworkTransition = require('../app/network-transition');
var ServerStore = require('../app/server-store');
var WatchlistState = require('../app/watchlist-state');

function storage() {
  var values = {};
  return {
    get length() { return Object.keys(values).length; },
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem: function (key, value) { values[key] = String(value); },
    removeItem: function (key) { delete values[key]; },
    key: function (index) { return Object.keys(values)[index] || null; }
  };
}

function editorView() {
  var state = { open: false, index: 0 };
  return {
    open: function () { state.open = true; },
    close: function () { state.open = false; state.index = 0; },
    focus: function (index, count) { state.index = Math.max(0, Math.min(Math.max(0, count - 1), Number(index) || 0)); },
    snapshot: function () { return { open: state.open, index: state.index }; },
    render: function () {},
    destroy: function () {}
  };
}

var localStorage = storage();
var credentialStorage = storage();
var serverA = {
  name: 'Server A',
  uri: 'http://192.168.1.10:32400',
  machineIdentifier: 'machine-a',
  connections: ['http://192.168.1.10:32400', 'https://relay-a.example.com']
};
var serverB = {
  name: 'Server B',
  uri: 'http://192.168.1.20:32400',
  machineIdentifier: 'machine-b',
  connections: ['http://192.168.1.20:32400']
};
localStorage.setItem(ServerStore.STORAGE_KEY, JSON.stringify({ activeUri: serverA.uri, servers: [serverA] }));
credentialStorage.setItem(AuthStore.STORAGE_KEY, JSON.stringify({
  setupComplete: true,
  mode: 'plex',
  ownerToken: 'owner-token',
  activeProfileId: 'owner',
  profiles: [{
    id: 'owner',
    title: 'Owner',
    token: 'server-token-a',
    accountToken: 'owner-token',
    serverMachineIdentifier: 'machine-a',
    serverConnectionUri: serverA.uri
  }]
}));

var networkCurrent = { status: 'online', lanAvailable: true, internetAvailable: true, connectionType: 'wired', localAddress: '192.168.1.2' };
var networkListener = null;
var networkDestroyed = 0;
var networkUnsubscribed = 0;
var serverControllerOptions = null;
var serverControllerDestroyed = 0;
var remoteResumes = 0;
var starts = 0;
var navigationCallbacks = [];
var accountProfileCallbacks = [];
var navigationAborts = 0;
var profileAborts = 0;
var accountServerCallback = null;
var profileCallback = null;
var switchUserCallback = null;
var accessCallback = null;
var connectionCallback = null;
var networkRenders = 0;
var stopPolling = 0;
var schedulePolling = 0;
var recoveries = 0;
var appliedNavigation = [];
var homeLoads = 0;
var watchlistLoads = 0;
var seededAccounts = [];
var published = [];
var profileRenders = 0;
var settingsRenders = 0;
var setupTransitions = 0;
var reloads = 0;
var config = { apiBaseUrl: serverA.uri, token: 'server-token-a' };

var fakeServerController = {
  create: function (options) {
    serverControllerOptions = options;
    return {
      start: function () { starts += 1; },
      snapshot: function () {
        var session = options.session.read();
        return {
          activeServer: session.activeServer,
          activities: [],
          discoveryActive: false,
          failoverActive: false,
          failedUris: [],
          remoteVerificationStarted: [],
          serverState: session.serverState
        };
      },
      discover: function (callback) { callback(options.session.read().serverState.servers); return null; },
      applyServer: function (server) {
        options.session.update({
          activeServer: server,
          apiBaseUrl: server.uri,
          token: options.auth.activeToken(server.machineIdentifier, server),
          serverState: ServerStore.save(localStorage, options.session.read().serverState.servers, server.uri)
        });
        return true;
      },
      attemptFailover: function (error, callback) { callback(false, error); },
      clearFailedRoutes: function () {},
      waitForActivity: function (id, callback) { callback(null); },
      storeServer: function (server) {
        var current = options.session.read();
        options.session.update({
          serverState: ServerStore.save(localStorage, ServerStore.merge(current.serverState.servers, [server]), current.serverState.activeUri)
        });
      },
      serverForIdentity: function (server) {
        return options.session.read().serverState.servers.filter(function (item) {
          return item.machineIdentifier === server.machineIdentifier;
        })[0] || null;
      },
      verifyRemoteConnections: function () {},
      resumeRemoteVerification: function () { remoteResumes += 1; },
      destroy: function () { serverControllerDestroyed += 1; }
    };
  }
};

var feature = ServerFeatureController.create({
  platform: {
    root: { setTimeout: setTimeout, clearTimeout: clearTimeout },
    document: { getElementById: function () { return null; }, createElement: function () { return {}; } },
    storage: localStorage,
    credentialStorage: credentialStorage
  },
  modules: {
    ServerController: fakeServerController,
    ServerEditorView: { create: editorView },
    ActivityState: {},
    AuthStore: AuthStore,
    LocalData: { clear: function () {} },
    NetworkPolicy: {},
    NetworkState: {
      create: function () {
        return {
          snapshot: function () { return networkCurrent; },
          allowsLocal: function () { return networkCurrent.lanAvailable !== false; },
          allowsCloud: function () { return networkCurrent.internetAvailable !== false; },
          subscribe: function (listener) {
            networkListener = listener;
            return function () { networkUnsubscribed += 1; networkListener = null; };
          },
          destroy: function () { networkDestroyed += 1; }
        };
      }
    },
    NetworkTransition: NetworkTransition,
    PlexAuth: {
      createPin: function () { return null; },
      pollPin: function () { return null; },
      loadAccountServers: function (root, token, options, callback) { accountServerCallback = callback; return { abort: function () {} }; },
      loadHomeUsers: function (root, token, options, callback) { profileCallback = callback; return { abort: function () {} }; },
      switchHomeUser: function (root, token, profile, pin, options, callback) { switchUserCallback = callback; return { abort: function () {} }; },
      loadServerAccess: function (root, token, machineIdentifier, options, callback) { accessCallback = callback; return { abort: function () {} }; },
      findReachableConnection: function (root, token, connections, machineIdentifier, options, callback) { connectionCallback = callback; return { abort: function () {} }; }
    },
    PlexClient: {
      loadNavigation: function (runtimeConfig, callback) {
        navigationCallbacks.push(callback);
        return { abort: function () { navigationAborts += 1; } };
      },
      loadAccountProfile: function (runtimeConfig, callback) {
        accountProfileCallbacks.push(callback);
        return { abort: function () { profileAborts += 1; } };
      },
      loadServerIdentity: function (runtimeConfig, callback) { callback(null, 'machine-a'); return null; }
    },
    ServerDiscovery: {
      isLocalCandidate: function (uri) { return /^http:\/\/192\.168\./.test(uri); },
      normalizeCandidate: function (uri) { return String(uri || '').replace(/\/$/, ''); },
      shouldOfferLocalConnection: function (uri) { return /^http:\/\/192\.168\./.test(uri); },
      probe: function () { return null; },
      discover: function (root, discoveryConfig, callback) { callback([]); }
    },
    ServerStore: ServerStore,
    WatchlistState: WatchlistState,
    WatchlistClient: {}
  },
  config: { application: config, authOptions: {}, discovery: function () { return {}; } },
  state: {
    view: function () { return 'home'; },
    publish: function (snapshot) { published.push(snapshot); }
  },
  presentation: {
    t: function (key) { return key; },
    element: function () { return { appendChild: function () {}, setAttribute: function () {} }; },
    renderNetwork: function () { networkRenders += 1; },
    renderProfile: function () { profileRenders += 1; },
    renderSettings: function () { settingsRenders += 1; }
  },
  application: {
    applyNavigation: function (items) { appliedNavigation.push(items); },
    loadHome: function () { homeLoads += 1; },
    preloadWatchlist: function () { watchlistLoads += 1; },
    seedAccountSettings: function (account) { seededAccounts.push(account); },
    stopHomePolling: function () { stopPolling += 1; },
    scheduleHomePolling: function () { schedulePolling += 1; },
    recoverAfterNetwork: function () { recoveries += 1; }
  },
  lifecycle: {
    whenCredentialsIdle: function (callback) { callback(); },
    reload: function () { reloads += 1; }
  },
  transitions: { openSetup: function () { setupTransitions += 1; } }
});

assert.ok(serverControllerOptions, 'ServerFeature must construct ServerController with explicit ports');
assert.strictEqual(feature.authMode(), 'plex', 'authentication state must be loaded from credential storage');
assert.strictEqual(feature.ownerToken(), 'owner-token', 'owner token must be owned by ServerFeature');
assert.strictEqual(feature.activeProfile().id, 'owner', 'active profile must be resolved internally');
assert.strictEqual(feature.watchlistAccountToken(), 'owner-token', 'watchlist must use the active account token');
assert.strictEqual(feature.watchlistAvailable(), true, 'watchlist availability must include cloud eligibility');
assert.strictEqual(feature.networkSnapshot().status, 'online', 'network snapshot must be exposed read-only');
assert.ok(published.length > 0, 'initial account/server/network state must be published');
assert.strictEqual(published[0].activeProfile.id, 'owner', 'initial publication must include the active profile without consulting a partially constructed feature');

feature.applyServer(serverA);
assert.strictEqual(feature.activeServer().machineIdentifier, 'machine-a', 'selected server must be owned internally');
assert.ok(feature.watchlistIdentity().indexOf('machine-a|owner') !== -1, 'watchlist identity must include server and profile identities');
assert.strictEqual(config.token, 'server-token-a', 'selected profile token must update the mutable runtime config');

networkCurrent = { status: 'offline', lanAvailable: false, internetAvailable: false, connectionType: null, localAddress: null };
networkListener(networkCurrent);
assert.strictEqual(stopPolling, 1, 'losing LAN access must stop Home polling');
assert.strictEqual(networkRenders, 1, 'network changes must refresh presentation through a semantic callback');
networkCurrent = { status: 'online', lanAvailable: true, internetAvailable: true, connectionType: 'wired', localAddress: '192.168.1.2' };
networkListener(networkCurrent);
assert.strictEqual(recoveries, 1, 'network recovery must request active-view recovery once');
assert.strictEqual(schedulePolling, 1, 'network recovery must re-arm Home polling');
assert.strictEqual(remoteResumes, 1, 'cloud recovery must resume remote verification through ServerController');

feature.loadAccountServers('new-owner-token', function (error, servers) {
  assert.ifError(error);
  assert.ok(servers.some(function (server) { return server.machineIdentifier === 'machine-b'; }), 'account servers must be merged into persisted server state');
});
accountServerCallback(null, [serverB]);
assert.strictEqual(feature.ownerToken(), 'new-owner-token', 'loading account servers must persist the latest owner token');

feature.loadProfiles('new-owner-token', function (error, profiles) {
  assert.ifError(error);
  assert.ok(profiles.some(function (profile) { return profile.id === 'guest'; }), 'loaded Home profiles must be merged');
});
profileCallback(null, [{ id: 'owner', title: 'Owner' }, { id: 'guest', title: 'Guest', protected: true }]);
assert.strictEqual(feature.activeProfile().id, 'owner', 'profile refresh must preserve the active profile identity');

var switchedProfile = null;
feature.switchProfile({ id: 'guest', title: 'Guest', protected: true }, '1234', {
  selectedServer: serverA,
  preferredConnectionUri: serverA.uri,
  profiles: feature.profiles(),
  isActive: function () { return true; }
}, function (error, profile) {
  assert.ifError(error);
  switchedProfile = profile;
});
switchUserCallback(null, 'guest-account-token');
accessCallback(null, {
  token: 'guest-server-token',
  connections: [serverA.uri, 'https://relay-a.example.com'],
  connectionRoutes: []
});
connectionCallback(null, serverA.uri);
assert.strictEqual(switchedProfile.id, 'guest', 'protected profile switching must resolve account and server access');
assert.strictEqual(feature.activeProfile().id, 'guest', 'successful profile switching must persist the active profile');
assert.strictEqual(feature.authMode(), 'plex', 'successful profile switching must retain Plex mode');

feature.loadApplication();
assert.strictEqual(starts, 1, 'application loading must start server activity polling');
assert.strictEqual(navigationCallbacks.length, 1, 'application loading must request navigation');
navigationCallbacks[0](null, [{ title: 'Home', kind: 'home' }]);
accountProfileCallbacks[0](null, { locale: 'it' });
assert.strictEqual(appliedNavigation.length, 1, 'loaded navigation must be published through the application port');
assert.strictEqual(homeLoads, 1, 'successful navigation loading must refresh Home');
assert.strictEqual(watchlistLoads, 1, 'available Watchlist data must be preloaded');
assert.deepStrictEqual(seededAccounts, [{ locale: 'it' }], 'account profile settings must be seeded through the application port');

feature.loadApplication();
feature.loadApplication();
assert.strictEqual(navigationAborts >= 1, true, 'replacing an application load must abort transport handles when available');
var staleNavigation = navigationCallbacks[navigationCallbacks.length - 2];
var currentNavigation = navigationCallbacks[navigationCallbacks.length - 1];
staleNavigation(null, [{ title: 'Stale' }]);
currentNavigation(null, [{ title: 'Current' }]);
assert.strictEqual(appliedNavigation[appliedNavigation.length - 1][0].title, 'Current', 'late navigation callbacks must not replace the newest load');

var setupTransitionsBeforeBootstrap = setupTransitions;
assert.strictEqual(feature.bootstrap(), true, 'loaded setup state must complete the semantic bootstrap path');
assert.strictEqual(setupTransitions, setupTransitionsBeforeBootstrap, 'loaded setup state must bypass onboarding');
feature.disconnect();
assert.strictEqual(feature.authMode(), 'offline', 'disconnect must clear Plex account state');
assert.strictEqual(reloads, 1, 'disconnect must reload only after credential persistence is idle');

var lateNavigation = navigationCallbacks[navigationCallbacks.length - 1];
var appliedBeforeDestroy = appliedNavigation.length;
feature.destroy();
feature.destroy();
lateNavigation(null, [{ title: 'Too late' }]);
assert.strictEqual(appliedNavigation.length, appliedBeforeDestroy, 'late application callbacks must remain inert after destroy');
assert.strictEqual(networkUnsubscribed, 1, 'network subscription teardown must be idempotent');
assert.strictEqual(networkDestroyed, 1, 'owned NetworkState must be destroyed exactly once');
assert.strictEqual(serverControllerDestroyed, 1, 'owned ServerController must be destroyed exactly once');
assert.ok(profileAborts >= 1, 'pending account-profile requests must be aborted during replacement or teardown');
assert.ok(profileRenders >= 1 && settingsRenders >= 1 && setupTransitions >= 0, 'presentation and transition ports remain explicit');



function bootstrapFeature(localState, credentials, runtimeConfig, counters) {
  return ServerFeatureController.create({
    platform: {
      root: { setTimeout: function (callback) { callback(); return 1; }, clearTimeout: function () {} },
      document: { getElementById: function () { return null; }, createElement: function () { return {}; } },
      storage: localState,
      credentialStorage: credentials
    },
    modules: {
      ServerController: {
        create: function (options) {
          return {
            snapshot: function () {
              var session = options.session.read();
              return { activeServer: session.activeServer, activities: [], discoveryActive: false, failoverActive: false, failedUris: [], remoteVerificationStarted: [], serverState: session.serverState };
            },
            applyServer: function (server) {
              counters.applied += 1;
              options.session.update({ activeServer: server, apiBaseUrl: server.uri, token: options.auth.activeToken(server.machineIdentifier, server), serverState: ServerStore.save(localState, options.session.read().serverState.servers, server.uri) });
              return true;
            },
            resumeRemoteVerification: function () { counters.resumed += 1; },
            start: function () { counters.started += 1; },
            discover: function (callback) { counters.discovered += 1; callback(options.session.read().serverState.servers); return null; },
            clearFailedRoutes: function () {},
            destroy: function () { counters.destroyed += 1; }
          };
        }
      },
      ServerEditorView: { create: editorView },
      ActivityState: {},
      AuthStore: AuthStore,
      LocalData: { clear: function () {} },
      NetworkPolicy: {},
      NetworkState: {
        create: function () {
          return {
            snapshot: function () { return { status: 'online', lanAvailable: true, internetAvailable: true }; },
            allowsLocal: function () { return true; },
            allowsCloud: function () { return true; },
            subscribe: function () { return function () {}; },
            destroy: function () {}
          };
        }
      },
      NetworkTransition: NetworkTransition,
      PlexAuth: {
        createPin: function () {}, pollPin: function () {}, loadAccountServers: function () {}, loadHomeUsers: function () {},
        switchHomeUser: function () {}, loadServerAccess: function () {}, findReachableConnection: function () {}
      },
      PlexClient: {
        loadNavigation: function (configValue, callback) { counters.navigation += 1; callback(null, []); return null; },
        loadAccountProfile: function () { counters.accountProfile += 1; return null; }
      },
      ServerDiscovery: {
        isLocalCandidate: function () { return true; }, normalizeCandidate: function (value) { return String(value || ''); },
        shouldOfferLocalConnection: function () { return true; }, probe: function () { return null; }, discover: function (root, configValue, callback) { callback([]); }
      },
      ServerStore: ServerStore,
      WatchlistState: WatchlistState,
      WatchlistClient: {}
    },
    config: { application: runtimeConfig, authOptions: {}, discovery: function () { return {}; } },
    state: { view: function () { return 'home'; }, publish: function () {} },
    presentation: { t: function (key) { return key; }, element: function () { return { appendChild: function () {} }; }, renderProfile: function () {} },
    application: {
      persistSettings: function () { counters.persisted += 1; },
      loadHome: function () { counters.home += 1; },
      applyNavigation: function () {}, preloadWatchlist: function () {}, seedAccountSettings: function () {}
    },
    transitions: { openSetup: function () { counters.setup += 1; } }
  });
}

var emptyLocalState = storage();
var emptyCredentials = storage();
var onboardingCounters = { applied: 0, resumed: 0, started: 0, discovered: 0, destroyed: 0, navigation: 0, accountProfile: 0, persisted: 0, home: 0, setup: 0 };
var onboardingFeature = bootstrapFeature(emptyLocalState, emptyCredentials, { apiBaseUrl: '', token: '' }, onboardingCounters);
assert.strictEqual(onboardingFeature.bootstrap(), 'setup', 'bootstrap must enter onboarding when neither setup nor a selected server exists');
assert.strictEqual(onboardingCounters.setup, 1, 'onboarding bootstrap must use the explicit setup transition');
assert.strictEqual(onboardingCounters.navigation, 0, 'onboarding bootstrap must not start Plex application transport');
onboardingFeature.destroy();

var readyLocalState = storage();
var readyCredentials = storage();
readyLocalState.setItem(ServerStore.STORAGE_KEY, JSON.stringify({ activeUri: serverA.uri, servers: [serverA] }));
readyCredentials.setItem(AuthStore.STORAGE_KEY, JSON.stringify({ setupComplete: true, mode: 'offline', ownerToken: '', activeProfileId: '', profiles: [] }));
var readyCounters = { applied: 0, resumed: 0, started: 0, discovered: 0, destroyed: 0, navigation: 0, accountProfile: 0, persisted: 0, home: 0, setup: 0 };
var readyFeature = bootstrapFeature(readyLocalState, readyCredentials, { apiBaseUrl: serverA.uri, token: '' }, readyCounters);
assert.strictEqual(readyFeature.bootstrap(), true, 'bootstrap must continue when a selected server is already configured');
assert.strictEqual(readyCounters.applied, 1, 'ready bootstrap must apply the persisted server exactly once');
assert.strictEqual(readyCounters.resumed, 1, 'ready bootstrap must resume persisted remote verification');
assert.strictEqual(readyCounters.started, 1, 'ready bootstrap must start server activity polling through application loading');
assert.strictEqual(readyCounters.navigation, 1, 'ready bootstrap must start navigation loading');
assert.strictEqual(readyCounters.discovered, 1, 'ready bootstrap must still refresh local discovery');
assert.strictEqual(readyCounters.setup, 0, 'ready bootstrap must not reopen onboarding');
readyFeature.destroy();

console.log('Server feature runtime ownership checks passed');
