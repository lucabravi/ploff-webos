'use strict';
var assert = require('assert');
var LibrarySource = require('../app/library-source');
var LibraryTabStore = require('../app/library-tab-store');
var LibrarySourceCatalog = require('../app/library-source-catalog');
var Controller = require('../app/coordinator/library-sources-controller');
function storage() { var map = {}; return { getItem: function (k) { return map[k] || null; }, setItem: function (k, v) { map[k] = String(v); } }; }
var resolveCalls = [];
var recovered = [];
var serverStateChanges = [];
var serverAliasChanges = [];
var preferenceStorage = storage();
var navigationRenderCalls = 0;
var controller = Controller.create({
  storage: preferenceStorage,
  modules: { LibrarySource: LibrarySource, LibraryTabStore: LibraryTabStore, LibrarySourceCatalog: LibrarySourceCatalog },
  config: { requestTimeout: 8000 },
  server: {
    servers: function () { return [{ machineIdentifier: 'a' }, { machineIdentifier: 'b' }, { machineIdentifier: 'offline' }]; },
    activeServer: function () { return { machineIdentifier: 'a', name: 'Primary', owned: true }; },
    watchlistIdentity: function () { return 'a|profile'; },
    queryAccountServers: function (callback) { callback(null, [{ machineIdentifier: 'a', name: 'Primary', owned: true }, { machineIdentifier: 'b', name: 'Shared', owned: false }]); return { abort: function () {} }; },
    resolveContentSource: function (machine, callback) {
      resolveCalls.push(machine);
      callback(null, { serverMachineIdentifier: machine, serverName: machine === 'a' ? 'Primary' : 'Shared', apiBaseUrl: 'https://' + machine + '.example', token: machine + '-token', owned: machine === 'a' });
      return { abort: function () {} };
    }
  },
  transport: { loadLibrarySections: function (_config, callback) { callback(null, [{ key: '1', title: 'Film', type: 'movie' }]); return { abort: function () {} }; } },
  presentation: { applyNavigation: function () {}, renderNavigation: function () { navigationRenderCalls += 1; } },
  lifecycle: {
    onAvailabilityRecovered: function (machineIdentifier) { recovered.push(machineIdentifier); },
    onServerAliasChanged: function (machineIdentifier) { serverAliasChanges.push(machineIdentifier); },
    onServerEnabledChanged: function (machineIdentifier, enabled) { serverStateChanges.push({ machineIdentifier: machineIdentifier, enabled: enabled }); }
  }
});
controller.applyPrimaryNavigation([{ kind: 'home', title: 'Home' }, { kind: 'library', key: '1', title: 'Film', type: 'movie' }]);
controller.refresh(function (error) { assert.ifError(error); });
assert.deepStrictEqual(recovered, ['b'], 'a newly discovered secondary PMS must notify Home after its library catalog is ready');
recovered = [];
var servers = null;
controller.resolveServers(function (error, value) { assert.ifError(error); servers = value; });
assert.deepStrictEqual(servers.map(function (entry) { return entry.serverMachineIdentifier; }), ['a', 'b']);
assert.strictEqual(servers[0].primary, true);
assert.strictEqual(servers[1].primary, false);
assert.strictEqual(controller.contextForMachine('b').token, 'b-token');
assert.strictEqual(controller.homeRecentEnabled('b|1'), true, 'new external libraries must appear in Home Recently Added by default');
controller.updateServerAlias('b', 'Marco');
assert.deepStrictEqual(controller.sourceWarnings(), [], 'pending or healthy sources must not warn');
controller.reportLibraryStatus('b|1', true);
assert.strictEqual(controller.sourceWarnings().length, 1, 'failed libraries must warn even when their server is reachable');
controller.updateServerEnabled('b', false);
assert.deepStrictEqual(controller.sourceWarnings(), [], 'disabled sources must not warn');
controller.updateServerEnabled('b', true);
controller.reportLibraryStatus('b|1', false);
assert.deepStrictEqual(controller.sourceWarnings(), [], 'successful library retry must clear its warning');
controller.reportLibraryStatus('b|1', true, 'page');
controller.reportLibraryStatus('b|1', true, 'filters');
controller.reportLibraryStatus('b|1', false, 'recommendations');
assert.strictEqual(controller.sourceWarnings().length, 1, 'unrelated success must not erase library failures');
controller.reportLibraryStatus('b|1', false, 'page');
assert.strictEqual(controller.sourceWarnings().length, 1, 'remaining failed filters keep the warning');
controller.reportAvailability('b', true);
assert.strictEqual(controller.sourceWarnings().length, 1, 'server reachability is not library recovery');
controller.reportLibraryStatus('b|1', false, 'filters');
assert.deepStrictEqual(controller.sourceWarnings(), [], 'warning clears only when every failed operation recovers');
serverStateChanges = [];
assert.deepStrictEqual(serverAliasChanges, ['b'], 'server alias changes must invalidate already composed media badges immediately');
controller.updateTab('b|1', { homeRecentEnabled: false });
assert.strictEqual(controller.homeRecentEnabled('b|1'), false, 'Library source registry must expose the persisted Home Recently Added visibility');
controller.updateServerEnabled('b', false);
assert.deepStrictEqual(serverStateChanges.pop(), { machineIdentifier: 'b', enabled: false }, 'server-level visibility changes must notify application composition so cached Home rows can be recomposed immediately');
assert.strictEqual(controller.contextForMachine('b'), null, 'disabled servers must not remain routable through cached content contexts');
var disabledServers = null;
controller.resolveServers(function (error, value) { assert.ifError(error); disabledServers = value; }, true);
assert.deepStrictEqual(disabledServers.map(function (entry) { return entry.serverMachineIdentifier; }), ['a'], 'global content server resolution must exclude disabled servers at the source boundary');
var disabledSourceError = null;
controller.resolveSource('b|1', function (error) { disabledSourceError = error; });
assert.ok(disabledSourceError, 'direct source resolution must reject a library owned by a disabled server');
var disabledVerifyError = null;
var resolveCountBeforeDisabledVerify = resolveCalls.length;
controller.verifyAvailability('b', function (error) { disabledVerifyError = error; });
assert.ok(disabledVerifyError, 'availability probes must not reactivate or contact a server while it is disabled');
assert.strictEqual(resolveCalls.length, resolveCountBeforeDisabledVerify, 'disabled-server availability checks must fail before transport resolution');
controller.updateServerEnabled('b', true);
assert.deepStrictEqual(serverStateChanges.pop(), { machineIdentifier: 'b', enabled: true }, 'reenabling a server must notify the same Home refresh path');
assert.strictEqual(resolveCalls.filter(function (value) { return value === 'b'; }).length, 1, 'secondary context must be reused from discovery');
assert.strictEqual(resolveCalls.filter(function (value) { return value === 'a'; }).length, 1, 'primary context must be resolved only once for global features');
controller.updateServerEnabled('offline', false);
assert.deepStrictEqual(serverStateChanges.pop(), { machineIdentifier: 'offline', enabled: false }, 'a known offline PMS without resolved libraries must remain disableable');
assert.strictEqual(controller.serverEnabled('offline'), false, 'offline PMS state must be persisted even when it has no source rows');
controller.resolveServers(function () {});
assert.strictEqual(resolveCalls.filter(function (value) { return value === 'a'; }).length, 1, 'resolved primary context must be cached');
var navigationRenderCallsBeforeAvailability = navigationRenderCalls;
controller.reportAvailability('b', false);
controller.reportAvailability('b', false);
controller.reportAvailability('b', true);
controller.reportAvailability('b', true);
assert.strictEqual(navigationRenderCalls - navigationRenderCallsBeforeAvailability, 2, 'availability reports must rebuild navigation only for real online/offline transitions');
assert.deepStrictEqual(recovered, ['b'], 'secondary PMS recovery must be emitted once only for an actual offline-to-online transition');
var restoredState = controller.preferenceState();
restoredState.serverStates = [{ serverMachineIdentifier: 'b', enabled: false }];
preferenceStorage.setItem(LibraryTabStore.STORAGE_KEY, JSON.stringify(restoredState));
controller.reloadPreferences();
assert.ok(serverStateChanges.some(function (entry) { return entry.machineIdentifier === 'b' && entry.enabled === false; }), 'restoring preferences must emit the same server visibility lifecycle used by interactive disable');
controller.destroy();
console.log('Library sources multi-server checks passed');
