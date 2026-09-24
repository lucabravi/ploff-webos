'use strict';

var assert = require('assert');
var LibrarySource = require('../app/library-source');
var LibraryTabStore = require('../app/library-tab-store');
var LibrarySourceCatalog = require('../app/library-source-catalog');
var LibrarySourcesController = require('../app/coordinator/library-sources-controller');

function memoryStorage() {
  var values = {};
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem: function (key, value) { values[key] = String(value); },
    removeItem: function (key) { delete values[key]; }
  };
}

function FakeClock() {
  this.next = 1;
  this.timers = {};
}
FakeClock.prototype.setTimeout = function (callback, delay) {
  var id = this.next;
  this.next += 1;
  this.timers[id] = { callback: callback, delay: delay };
  return id;
};
FakeClock.prototype.clearTimeout = function (id) { delete this.timers[id]; };
FakeClock.prototype.runNext = function () {
  var ids = Object.keys(this.timers).map(Number).sort(function (a, b) { return a - b; });
  var entry = ids.length ? this.timers[ids[0]] : null;
  if (ids.length) { delete this.timers[ids[0]]; }
  if (entry) { entry.callback(); }
};

var primary = { name: 'PloffNAS', machineIdentifier: 'server-a', owned: true };
var sharedReachable = { name: 'Marco', machineIdentifier: 'server-b', owned: false };
var sharedBroken = { name: 'Offline', machineIdentifier: 'server-c', owned: false };
var applied = [];
var queryCount = 0;
var resolveCalls = [];
var sectionConfigs = [];
var storage = memoryStorage();
var activeIdentity = 'server-a|profile-a';
var accountServers = [primary, sharedBroken, sharedReachable];
var sharedToken = 'shared-token';
var controller = LibrarySourcesController.create({
  storage: storage,
  modules: {
    LibrarySourceCatalog: LibrarySourceCatalog,
    LibrarySource: LibrarySource,
    LibraryTabStore: LibraryTabStore
  },
  config: { itemLimit: 73, requestTimeout: 8000, apiBaseUrl: 'http://local', token: 'primary-token' },
  server: {
    activeServer: function () { return primary; },
    watchlistIdentity: function () { return activeIdentity; },
    queryAccountServers: function (callback) {
      queryCount += 1;
      callback(null, accountServers);
      return { abort: function () {} };
    },
    resolveContentSource: function (machineIdentifier, callback) {
      resolveCalls.push(machineIdentifier);
      if (machineIdentifier === 'server-c') { callback(new Error('unreachable')); return { abort: function () {} }; }
      callback(null, {
        serverMachineIdentifier: machineIdentifier,
        serverName: machineIdentifier === 'server-b' ? 'Marco' : 'PloffNAS',
        owned: machineIdentifier !== 'server-b',
        apiBaseUrl: machineIdentifier === 'server-b' ? 'https://relay.example' : 'http://local',
        token: machineIdentifier === 'server-b' ? sharedToken : 'primary-token',
        requestTimeout: 4500
      });
      return { abort: function () {} };
    }
  },
  transport: {
    loadLibrarySections: function (config, callback) {
      sectionConfigs.push(config);
      callback(null, [{ key: '1', title: 'Film', type: 'movie' }, { key: '2', title: 'Serie TV', type: 'show' }]);
      return { abort: function () {} };
    }
  },
  presentation: {
    applyNavigation: function (items) { applied.push(items); },
    renderNavigation: function () {}
  }
});

controller.applyPrimaryNavigation([
  { title: 'Home', kind: 'home', labelKey: 'nav.home' },
  { title: 'Film', kind: 'library', key: '1', type: 'movie' },
  { title: 'Watchlist', kind: 'watchlist', labelKey: 'nav.watchlist' },
  { title: 'Cerca', kind: 'search', labelKey: 'nav.search' },
  { title: 'Impostazioni', kind: 'settings', labelKey: 'nav.settings' }
]);
assert.strictEqual(applied.length, 1, 'primary navigation must be available before account discovery starts');
assert.strictEqual(applied[0][1].sourceId, 'server-a|1', 'primary navigation must be source-aware immediately');
var immediatePrimaryContext = controller.primaryContext();
assert.strictEqual(immediatePrimaryContext.serverMachineIdentifier, 'server-a', 'primary PMS context must be available synchronously before shared-server discovery');
assert.strictEqual(immediatePrimaryContext.apiBaseUrl, 'http://local', 'primary PMS context must reuse the active application route without network discovery');
assert.strictEqual(immediatePrimaryContext.token, 'primary-token', 'primary PMS context must reuse the active application token without network discovery');
assert.strictEqual(immediatePrimaryContext.primary, true, 'primary PMS context must be explicitly marked primary');

var refreshError = 'pending';
controller.refresh(function (error) { refreshError = error; });
assert.strictEqual(refreshError, null, 'one unreachable shared PMS must not fail the whole source refresh');
assert.strictEqual(queryCount, 1, 'account PMS discovery must run once for the active identity');
assert.deepStrictEqual(resolveCalls, ['server-c', 'server-b'], 'primary PMS must not be redundantly re-resolved during secondary discovery');
assert.strictEqual(sectionConfigs.length, 1, 'only reachable secondary PMS must load library sections');
assert.strictEqual(sectionConfigs[0].apiBaseUrl, 'https://relay.example', 'Relay-only PMS must use its verified route');
assert.strictEqual(sectionConfigs[0].token, 'shared-token', 'secondary sections must use the server-specific token');
assert.strictEqual(sectionConfigs[0].itemLimit, 73, 'source transport must preserve non-connection application settings');
assert.strictEqual(sectionConfigs[0].requestTimeout, 4500, 'source transport must override connection-specific timeout');
assert.ok(controller.navigationItems().some(function (item) { return item.sourceId === 'server-b|1'; }), 'reachable shared libraries must be exposed as normal navigation tabs');
assert.strictEqual(controller.navigationItems().some(function (item) { return item.sourceId === 'server-c|1'; }), false, 'unreachable PMS must not create broken tabs');

var resolved = null;
controller.resolveSource('server-b|1', function (error, context) { assert.ifError(error); resolved = context; });
assert.strictEqual(resolved.sourceId, 'server-b|1', 'resolved tab context must carry its stable source id');
assert.strictEqual(resolved.sectionKey, '1', 'resolved tab context must carry its section key');
assert.strictEqual(resolved.apiBaseUrl, 'https://relay.example', 'tab resolution must reuse the route verified during background discovery');
assert.strictEqual(resolveCalls.filter(function (id) { return id === 'server-b'; }).length, 1, 'resolved secondary transport must be cached for the active Plex identity');

controller.reorder(['server-b|1', 'server-a|1']);
assert.deepStrictEqual(JSON.parse(storage.getItem(LibraryTabStore.LEGACY_ORDER_KEY)), ['1'], 'reorder must keep the primary-only legacy projection for backup compatibility');
controller.refresh(function () {});
assert.strictEqual(queryCount, 1, 'repeated Home-ready hooks must not duplicate discovery for the same server/profile identity');

activeIdentity = 'server-a|profile-b';
accountServers = [primary, sharedReachable];
sharedToken = 'profile-b-shared-token';
controller.refresh(function (error) { assert.ifError(error); });
assert.strictEqual(queryCount, 2, 'a Plex Home profile change must refresh the account server inventory');
assert.strictEqual(resolveCalls.filter(function (id) { return id === 'server-b'; }).length, 2,
  'a Plex Home profile change must invalidate and re-resolve the shared PMS access context');
assert.strictEqual(sectionConfigs[sectionConfigs.length - 1].token, 'profile-b-shared-token',
  'a Plex Home profile change must never reuse the previous profile shared-server token');
assert.strictEqual(controller.navigationItems().some(function (item) { return item.sourceId === 'server-b|1'; }), true,
  'a shared source that remains accessible to the new profile must stay visible after revalidation');

activeIdentity = 'server-a|profile-c';
accountServers = [primary];
controller.refresh(function (error) { assert.ifError(error); });
assert.strictEqual(queryCount, 3, 'another profile/account inventory change must run a fresh discovery');
assert.strictEqual(controller.navigationItems().some(function (item) { return item.sourceId === 'server-b|1'; }), false,
  'a shared source revoked or inaccessible to the new profile must disappear from active navigation after inventory refresh');
assert.strictEqual(LibraryTabStore.load(storage).items.some(function (item) { return item.sourceId === 'server-b|1'; }), true,
  'removed shared sources must retain bounded tab preferences for later restoration');
controller.destroy();

(function forcedRefreshRetriesPreviouslyUnreachableSecondarySources() {
  var localStorage = memoryStorage();
  var localPrimary = { name: 'Primary', machineIdentifier: 'retry-a', owned: true };
  var localShared = { name: 'Recovered', machineIdentifier: 'retry-b', owned: false };
  var reachable = false;
  var localQueryCount = 0;
  var recoveredSnapshots = [];
  var lostMachines = [];
  var localController = LibrarySourcesController.create({
    storage: localStorage,
    modules: {
      LibrarySourceCatalog: LibrarySourceCatalog,
      LibrarySource: LibrarySource,
      LibraryTabStore: LibraryTabStore
    },
    config: { itemLimit: 20, requestTimeout: 5000 },
    server: {
      activeServer: function () { return localPrimary; },
      watchlistIdentity: function () { return 'retry-a|profile'; },
      queryAccountServers: function (callback) {
        localQueryCount += 1;
        callback(null, [localPrimary, localShared]);
        return { abort: function () {} };
      },
      resolveContentSource: function (_machineIdentifier, callback) {
        if (!reachable) { callback(new Error('temporarily offline')); }
        else {
          callback(null, {
            serverMachineIdentifier: 'retry-b', serverName: 'Recovered', owned: false,
            apiBaseUrl: 'https://relay-recovered.example', token: 'recovered-token', requestTimeout: 4500
          });
        }
        return { abort: function () {} };
      }
    },
    transport: {
      loadLibrarySections: function (_config, callback) {
        callback(null, [{ key: '7', title: 'Recovered Film', type: 'movie' }]);
        return { abort: function () {} };
      }
    },
    presentation: {
      applyNavigation: function () {}, renderNavigation: function () {},
      t: function (key) { return key === 'common.offline' ? 'Sin conexi\u00f3n' : key; }
    },
    lifecycle: {
      onAvailabilityRecovered: function () {
        recoveredSnapshots.push(localController.sources().map(function (source) { return source.id; }));
      },
      onAvailabilityLost: function (machineIdentifier) {
        lostMachines.push(machineIdentifier);
      }
    }
  });

  localController.applyPrimaryNavigation([
    { title: 'Home', kind: 'home', labelKey: 'nav.home' },
    { title: 'Film', kind: 'library', key: '1', type: 'movie' }
  ]);
  localController.refresh(function (error) { assert.ifError(error); });
  assert.strictEqual(localQueryCount, 1);
  assert.strictEqual(localController.navigationItems().some(function (item) { return item.sourceId === 'retry-b|7'; }), false,
    'an unreachable PMS must stay hidden rather than create a broken tab');

  reachable = true;
  localController.refresh(function (error) { assert.ifError(error); }, true);
  assert.strictEqual(localQueryCount, 2,
    'a forced refresh must bypass the completed-identity dedupe after network recovery');
  assert.strictEqual(localController.navigationItems().some(function (item) { return item.sourceId === 'retry-b|7'; }), true,
    'a secondary PMS that becomes reachable must appear without restarting the application');
  assert.deepStrictEqual(recoveredSnapshots, [['retry-a|1', 'retry-b|7']],
    'Home recovery must be notified only after the recovered source is available in the catalog');
  reachable = false;
  localController.refresh(function (error) { assert.ifError(error); }, true);
  var offlineTab = localController.navigationItems().filter(function (item) { return item.sourceId === 'retry-b|7'; })[0];
  assert.ok(offlineTab && offlineTab.offline && /Sin conexi\u00f3n/.test(offlineTab.title),
    'known unreachable libraries must use the active locale for their offline suffix');
  assert.strictEqual(typeof localController.serverAvailable, 'function', 'library sources must expose known server availability to aggregate loaders');
  assert.strictEqual(localController.serverAvailable('retry-b'), false, 'known offline PMS must be reported unavailable without another route timeout');
  assert.deepStrictEqual(lostMachines, ['retry-b'],
    'a known secondary PMS becoming unavailable must notify cache/Home owners exactly once');
  localController.resolveSource('retry-b|7', function (error) { assert.ok(error, 'offline library must fail promptly'); });
  reachable = true;
  localController.refresh(function (error) { assert.ifError(error); }, true);
  assert.strictEqual(localController.navigationItems().filter(function (item) { return item.sourceId === 'retry-b|7'; })[0].offline, false);
  assert.strictEqual(localController.serverAvailable('retry-b'), true, 'recovered PMS must become eligible for aggregate fan-out immediately');
  localController.destroy();
}());

(function newlyDiscoveredSecondarySourceNotifiesHomeAfterCatalogMerge() {
  var localPrimary = { name: 'Primary', machineIdentifier: 'new-a', owned: true };
  var localShared = { name: 'Shared', machineIdentifier: 'new-b', owned: false };
  var snapshots = [];
  var recoveryDetails = [];
  var localController = LibrarySourcesController.create({
    storage: memoryStorage(),
    modules: {
      LibrarySourceCatalog: LibrarySourceCatalog,
      LibrarySource: LibrarySource,
      LibraryTabStore: LibraryTabStore
    },
    config: { requestTimeout: 5000 },
    server: {
      activeServer: function () { return localPrimary; },
      watchlistIdentity: function () { return 'new-a|profile'; },
      queryAccountServers: function (callback) { callback(null, [localPrimary, localShared]); return { abort: function () {} }; },
      resolveContentSource: function (_machineIdentifier, callback) {
        callback(null, { serverMachineIdentifier: 'new-b', apiBaseUrl: 'https://new-b.example', token: 'token' });
        return { abort: function () {} };
      }
    },
    transport: {
      loadLibrarySections: function (_config, callback) {
        callback(null, [{ key: '4', title: 'Shared shows', type: 'show' }]);
        return { abort: function () {} };
      }
    },
    presentation: { applyNavigation: function () {}, renderNavigation: function () {} },
    lifecycle: {
      onAvailabilityRecovered: function (_machineIdentifier, details) {
        snapshots.push(localController.sources().map(function (source) { return source.id; }));
        recoveryDetails.push(details || null);
      }
    }
  });
  localController.applyPrimaryNavigation([{ title: 'Home', kind: 'home' }]);
  localController.refresh(function (error) { assert.ifError(error); });
  assert.deepStrictEqual(snapshots, [['new-b|4']],
    'a newly discovered secondary source must refresh Home immediately after its catalog entries exist');
  assert.strictEqual(recoveryDetails[0] && recoveryDetails[0].newlyDiscovered, true,
    'new secondary discovery must be distinguishable from an offline-to-online recovery');
  localController.destroy();
}());

(function transientSharedFailureSchedulesBoundedAutomaticRetry() {
  var clock = new FakeClock();
  var reachable = false;
  var queryCount = 0;
  var localController = LibrarySourcesController.create({
    clock: clock,
    storage: memoryStorage(),
    modules: {
      LibrarySourceCatalog: LibrarySourceCatalog,
      LibrarySource: LibrarySource,
      LibraryTabStore: LibraryTabStore
    },
    config: { requestTimeout: 8000 },
    server: {
      activeServer: function () { return primary; },
      watchlistIdentity: function () { return 'server-a|retry-profile'; },
      queryAccountServers: function (callback) {
        queryCount += 1;
        callback(null, [primary, sharedReachable]);
        return { abort: function () {} };
      },
      resolveContentSource: function (_machineIdentifier, callback) {
        callback(reachable ? null : new Error('temporary route failure'), reachable ? {
          serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://relay.example', token: 'shared-token'
        } : null);
        return { abort: function () {} };
      }
    },
    transport: {
      loadLibrarySections: function (_config, callback) {
        callback(null, [{ key: '1', title: 'Film', type: 'movie' }]);
        return { abort: function () {} };
      }
    },
    presentation: { applyNavigation: function () {}, renderNavigation: function () {} }
  });
  localController.applyPrimaryNavigation([{ title: 'Film', kind: 'library', key: '1', type: 'movie' }]);
  localController.refresh(function (error) { assert.ifError(error); });
  assert.strictEqual(Object.keys(clock.timers).length, 1, 'a transient missing shared PMS must schedule one automatic retry');
  assert.strictEqual(clock.timers[Object.keys(clock.timers)[0]].delay, 5000, 'the first retry must be prompt but non-blocking');
  reachable = true;
  clock.runNext();
  assert.strictEqual(queryCount, 2, 'the scheduled retry must refresh account sources without an app restart');
  assert.strictEqual(localController.navigationItems().some(function (item) { return item.sourceId === 'server-b|1'; }), true,
    'the recovered shared library must become visible automatically');
  assert.strictEqual(Object.keys(clock.timers).length, 0, 'successful discovery must stop the retry loop');
  localController.destroy();
}());

(function librarySectionFailureDoesNotOfflineReachableSecondaryServer() {
  var sectionFails = false;
  var localPrimary = { name: 'Primary', machineIdentifier: 'sections-a', owned: true };
  var localSecondary = { name: 'Mac M4', machineIdentifier: 'sections-b', owned: true };
  var local = LibrarySourcesController.create({
    modules: { LibrarySourceCatalog: LibrarySourceCatalog, LibrarySource: LibrarySource, LibraryTabStore: LibraryTabStore },
    storage: memoryStorage(),
    config: { apiBaseUrl: 'http://primary', token: 'primary-token', requestTimeout: 8000 },
    server: {
      activeServer: function () { return localPrimary; },
      watchlistIdentity: function () { return 'sections-a|profile'; },
      queryAccountServers: function (callback) { callback(null, [localPrimary, localSecondary]); return { abort: function () {} }; },
      resolveContentSource: function (machineIdentifier, callback) {
        callback(null, { serverMachineIdentifier: machineIdentifier, serverName: 'Mac M4', owned: true, apiBaseUrl: 'https://mac-m4.example', token: 'mac-token' });
        return { abort: function () {} };
      }
    },
    transport: {
      loadLibrarySections: function (_config, callback) {
        callback(sectionFails ? new Error('sections unavailable') : null, sectionFails ? null : [{ key: '2', title: 'Anime', type: 'show' }]);
        return { abort: function () {} };
      }
    },
    presentation: { applyNavigation: function () {}, renderNavigation: function () {} }
  });
  local.applyPrimaryNavigation([{ title: 'Film', kind: 'library', key: '1', type: 'movie' }]);
  local.refresh(function (error) { assert.ifError(error); });
  assert.strictEqual(local.navigationItems().filter(function (item) { return item.sourceId === 'sections-b|2'; })[0].offline, false);
  sectionFails = true;
  local.refresh(function (error) { assert.ifError(error); }, true);
  assert.strictEqual(local.navigationItems().filter(function (item) { return item.sourceId === 'sections-b|2'; })[0].offline, false,
    'a library-sections error after successful PMS route verification must not mark the whole server offline');
  var resolved = null;
  local.resolveSource('sections-b|2', function (error, context) { assert.ifError(error); resolved = context; });
  assert.strictEqual(resolved.apiBaseUrl, 'https://mac-m4.example',
    'a reachable PMS must retain its verified transport context even when section refresh fails');
  local.destroy();
}());

(function verifiedConnectivityControlsSecondaryOfflineState() {
  var reachable = true;
  var localPrimary = { name: 'Primary', machineIdentifier: 'verify-a', owned: true };
  var localSecondary = { name: 'Mac M4', machineIdentifier: 'verify-b', owned: true };
  var local = LibrarySourcesController.create({
    modules: { LibrarySourceCatalog: LibrarySourceCatalog, LibrarySource: LibrarySource, LibraryTabStore: LibraryTabStore },
    storage: memoryStorage(),
    config: { apiBaseUrl: 'http://primary', token: 'primary-token', requestTimeout: 8000 },
    server: {
      activeServer: function () { return localPrimary; },
      watchlistIdentity: function () { return 'verify-a|profile'; },
      queryAccountServers: function (callback) { callback(null, [localPrimary, localSecondary]); return { abort: function () {} }; },
      resolveContentSource: function (machineIdentifier, callback) {
        if (!reachable) { callback(new Error('No reachable Plex connection')); return { abort: function () {} }; }
        callback(null, {
          serverMachineIdentifier: machineIdentifier, serverName: 'Mac M4', owned: true,
          apiBaseUrl: 'https://mac-m4.example', token: 'mac-token', requestTimeout: 4500
        });
        return { abort: function () {} };
      }
    },
    transport: {
      loadLibrarySections: function (_config, callback) { callback(null, [{ key: '2', title: 'Anime', type: 'show' }]); return { abort: function () {} }; }
    },
    presentation: { applyNavigation: function () {}, renderNavigation: function () {} }
  });
  local.applyPrimaryNavigation([{ title: 'Film', kind: 'library', key: '1', type: 'movie' }]);
  local.refresh(function (error) { assert.ifError(error); });
  assert.strictEqual(typeof local.verifyAvailability, 'function', 'library sources must expose an explicit connectivity verification boundary');
  reachable = false;
  var failure = null;
  local.verifyAvailability('verify-b', function (error) { failure = error; });
  assert.ok(failure, 'a failed connectivity verification must report the route failure');
  assert.strictEqual(local.navigationItems().filter(function (item) { return item.sourceId === 'verify-b|2'; })[0].offline, true,
    'only a failed connectivity verification may mark every library of the secondary PMS offline');
  reachable = true;
  local.verifyAvailability('verify-b', function (error) { assert.ifError(error); });
  assert.strictEqual(local.navigationItems().filter(function (item) { return item.sourceId === 'verify-b|2'; })[0].offline, false,
    'a successful connectivity verification must restore the PMS without rediscovering its libraries');
  local.destroy();
}());

console.log('Library sources controller checks passed');

(function refreshingExternalSourcesKeepsVerifiedArtworkRoutesUntilReplacement() {
  var primaryServer = { name: 'Primary', machineIdentifier: 'refresh-primary', owned: true };
  var externalServer = { name: 'External', machineIdentifier: 'refresh-external', owned: false };
  var pendingQuery = null;
  var queryCount = 0;
  var route = 'https://first.example';
  var local = LibrarySourcesController.create({
    storage: memoryStorage(),
    modules: { LibrarySourceCatalog: LibrarySourceCatalog, LibrarySource: LibrarySource, LibraryTabStore: LibraryTabStore },
    config: { apiBaseUrl: 'http://primary', token: 'primary-token' },
    server: {
      activeServer: function () { return primaryServer; },
      watchlistIdentity: function () { return 'refresh-profile'; },
      queryAccountServers: function (callback) {
        queryCount += 1;
        if (queryCount === 1) { callback(null, [primaryServer, externalServer]); }
        else { pendingQuery = callback; }
        return { abort: function () {} };
      },
      resolveContentSource: function (_machine, callback) {
        callback(null, { serverMachineIdentifier: 'refresh-external', apiBaseUrl: route, token: 'external-token' });
        return { abort: function () {} };
      }
    },
    transport: {
      loadLibrarySections: function (_config, callback) {
        callback(null, [{ key: '7', title: 'Serie TV', type: 'show' }]);
        return { abort: function () {} };
      }
    },
    presentation: { applyNavigation: function () {}, renderNavigation: function () {} }
  });
  local.applyPrimaryNavigation([{ title: 'Film', kind: 'library', key: '1', type: 'movie' }]);
  local.refresh(function (error) { assert.ifError(error); });
  assert.strictEqual(local.contextForMachine('refresh-external').apiBaseUrl, 'https://first.example');
  route = 'https://second.example';
  local.refresh(function (error) { assert.ifError(error); }, true);
  assert.strictEqual(local.contextForMachine('refresh-external').apiBaseUrl, 'https://first.example',
    'cover requests must retain the verified external route while discovery refreshes it');
  pendingQuery(null, [primaryServer, externalServer]);
  assert.strictEqual(local.contextForMachine('refresh-external').apiBaseUrl, 'https://second.example',
    'the newly verified route must replace the old one after discovery');
  local.refresh(function (error) { assert.ifError(error); }, true);
  pendingQuery(null, [primaryServer]);
  assert.strictEqual(local.contextForMachine('refresh-external'), null,
    'a server removed from the account must not retain a stale artwork route');
  local.destroy();
}());

(function offlinePrimaryLibrariesReuseTheActiveRoute() {
  var resolveCount = 0;
  var resolved = null;
  var local = LibrarySourcesController.create({
    modules: { LibrarySourceCatalog: LibrarySourceCatalog, LibrarySource: LibrarySource, LibraryTabStore: LibraryTabStore },
    storage: memoryStorage(),
    config: { apiBaseUrl: 'http://192.168.0.7:32400', token: '', requestTimeout: 8000 },
    server: {
      activeServer: function () { return primary; },
      queryAccountServers: function (callback) {
        callback(new Error('account access unavailable'));
        return { abort: function () {} };
      },
      resolveContentSource: function (_machineIdentifier, callback) {
        resolveCount += 1;
        callback(new Error('account access unavailable'));
      }
    },
    presentation: { applyNavigation: function () {}, renderNavigation: function () {} }
  });
  local.applyPrimaryNavigation([{ title: 'Film', kind: 'library', key: '1', type: 'movie' }]);
  local.resolveSource('server-a|1', function (error, context) {
    assert.ifError(error);
    resolved = context;
  });
  assert.strictEqual(resolveCount, 0, 'the primary PMS must not require account-based source resolution');
  assert.strictEqual(resolved.apiBaseUrl, 'http://192.168.0.7:32400', 'the primary library must reuse the active local route');
  assert.strictEqual(resolved.token, '', 'local unauthenticated access must preserve its empty token');
  assert.strictEqual(resolved.sourceId, 'server-a|1');
  var primaryMediaContext = local.contextForMachine('server-a');
  assert.ok(primaryMediaContext, 'Home media from the primary PMS must retain a resolvable local context');
  assert.strictEqual(primaryMediaContext.apiBaseUrl, 'http://192.168.0.7:32400',
    'Home media from the primary PMS must retain a resolvable local context');
  var availableServers = null;
  local.resolveServers(function (error, servers) {
    assert.ifError(error);
    availableServers = servers;
  });
  assert.strictEqual(availableServers.length, 1, 'global search must retain the primary PMS when account discovery is unavailable');
  assert.strictEqual(availableServers[0].apiBaseUrl, 'http://192.168.0.7:32400');
  local.destroy();
}());

(function silentDiscoverySettlesAndIgnoresLateResponses() {
  var clock = new FakeClock();
  var late;
  var count = 0;
  var aborted = false;
  var local = LibrarySourcesController.create({
    clock: clock,
    modules: { LibrarySourceCatalog: LibrarySourceCatalog, LibrarySource: LibrarySource, LibraryTabStore: LibraryTabStore },
    storage: memoryStorage(),
    server: {
      activeServer: function () { return primary; },
      watchlistIdentity: function () { return 'timeout-profile'; },
      queryAccountServers: function (callback) { late = callback; return { abort: function () { aborted = true; } }; }
    }
  });
  local.refresh(function (error) { assert.ok(error); count += 1; });
  clock.runNext();
  assert.strictEqual(count, 1, 'silent discovery must release its caller');
  assert.strictEqual(aborted, true);
  late(null, []);
  assert.strictEqual(count, 1, 'late discovery must not complete twice');
  local.destroy();
  assert.strictEqual(Object.keys(clock.timers).length, 0, 'teardown must remove retry timers');
}());

(function aggregateMatchingNavigationLibrariesWhenEnabled() {
  var localPrimary = { name: 'PloffNAS', machineIdentifier: 'merge-a', owned: true };
  var localSecondary = { name: 'Mac M4', machineIdentifier: 'merge-b', owned: true };
  var local = LibrarySourcesController.create({
    storage: memoryStorage(),
    settings: function () { return { aggregateLibraries: true }; },
    modules: { LibrarySourceCatalog: LibrarySourceCatalog, LibrarySource: LibrarySource, LibraryTabStore: LibraryTabStore },
    config: { apiBaseUrl: 'http://merge-a', token: 'a-token', requestTimeout: 8000 },
    server: {
      activeServer: function () { return localPrimary; },
      watchlistIdentity: function () { return 'merge-a|profile'; },
      queryAccountServers: function (callback) { callback(null, [localPrimary, localSecondary]); return { abort: function () {} }; },
      resolveContentSource: function (_machineIdentifier, callback) {
        callback(null, { serverMachineIdentifier: 'merge-b', serverName: 'Mac M4', owned: true, apiBaseUrl: 'http://merge-b', token: 'b-token' });
        return { abort: function () {} };
      }
    },
    transport: {
      loadLibrarySections: function (_config, callback) { callback(null, [{ key: '7', title: 'Film', type: 'movie' }]); return { abort: function () {} }; }
    },
    presentation: { applyNavigation: function () {}, renderNavigation: function () {} }
  });
  local.applyPrimaryNavigation([{ title: 'Home', kind: 'home' }, { title: 'Film', kind: 'library', key: '1', type: 'movie' }]);
  local.refresh(function (error) { assert.ifError(error); });
  var libraries = local.navigationItems().filter(function (item) { return item.kind === 'library'; });
  assert.strictEqual(libraries.length, 1, 'matching libraries must collapse to one virtual navigation tab when aggregation is enabled');
  assert.strictEqual(libraries[0].virtualLibrary, true);
  assert.deepStrictEqual(libraries[0].memberSourceIds, ['merge-a|1', 'merge-b|7']);
  assert.strictEqual(libraries[0].title, 'Film');
  local.destroy();
}());

(function primaryRuntimeRecoveryPublishesPromotedRoute() {
  var runtimeConfig = { apiBaseUrl: 'http://primary-old:32400', token: 'primary-token', requestTimeout: 8000 };
  var active = { name: 'Primary', machineIdentifier: 'primary-recovery', owned: true, uri: runtimeConfig.apiBaseUrl };
  var failovers = 0;
  var recovered = null;
  var local = LibrarySourcesController.create({
    storage: memoryStorage(),
    modules: { LibrarySourceCatalog: LibrarySourceCatalog, LibrarySource: LibrarySource, LibraryTabStore: LibraryTabStore },
    config: runtimeConfig,
    server: {
      activeServer: function () { return active; },
      attemptFailover: function (_error, callback) {
        failovers += 1;
        runtimeConfig.apiBaseUrl = 'https://primary-direct.example';
        active = { name: 'Primary', machineIdentifier: 'primary-recovery', owned: true, uri: runtimeConfig.apiBaseUrl };
        callback(true, null);
        return true;
      }
    }
  });
  assert.strictEqual(typeof local.recoverPrimary, 'function', 'source routing must expose bounded recovery for the active primary PMS');
  local.recoverPrimary(new Error('network failed'), function (error, context) {
    assert.ifError(error);
    recovered = context;
  });
  assert.strictEqual(failovers, 1, 'primary source recovery must delegate to the server failover owner exactly once');
  assert.strictEqual(recovered.apiBaseUrl, 'https://primary-direct.example', 'source recovery must publish the route promoted by server failover');
  assert.strictEqual(recovered.serverMachineIdentifier, 'primary-recovery');
  local.destroy();
}());
