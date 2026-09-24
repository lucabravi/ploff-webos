'use strict';

var assert = require('assert');
var LibraryTabStore = require('../app/library-tab-store');

var now = 200 * 24 * 60 * 60 * 1000;
var sources = [
  { id: 'server-a|1', serverMachineIdentifier: 'server-a', serverName: 'PloffNAS', primary: true, owned: true, sectionKey: '1', sectionTitle: 'Serie TV', sectionType: 'show', defaultTitle: 'Serie TV', defaultIcon: 'tv' },
  { id: 'server-a|2', serverMachineIdentifier: 'server-a', serverName: 'PloffNAS', primary: true, owned: true, sectionKey: '2', sectionTitle: 'Film', sectionType: 'movie', defaultTitle: 'Film', defaultIcon: 'movie' },
  { id: 'server-b|2', serverMachineIdentifier: 'server-b', serverName: 'PLEX-SERVER-8492', primary: false, owned: false, sectionKey: '2', sectionTitle: 'Film', sectionType: 'movie', defaultTitle: 'Film \u00b7 PLEX-SERVER-8492', defaultIcon: 'movie' }
];
var state = LibraryTabStore.reconcile(null, sources, {
  primaryMachineIdentifier: 'server-a',
  legacyOrder: ['2', '1'],
  now: now
});

assert.strictEqual(state.legacyMigrated, true, 'legacy section order must migrate only once');
assert.deepStrictEqual(state.items.map(function (entry) { return entry.sourceId; }), ['server-a|2', 'server-a|1', 'server-b|2'], 'legacy primary order must be preserved and new secondary sources appended');
assert.strictEqual(state.items[2].enabled, true, 'newly discovered shared libraries must be enabled automatically');
assert.strictEqual(state.items[2].homeRecentEnabled, true, 'newly discovered shared libraries must appear in Home Recently Added by default');
assert.strictEqual(state.items[2].icon, 'movie', 'new tabs receive a deterministic default icon');
assert.strictEqual(state.displayMode, 'text', 'navigation presentation defaults globally to text-only');
assert.deepStrictEqual(state.home, { icon: 'home' }, 'Home keeps a fixed semantic icon and no per-item presentation mode');
assert.deepStrictEqual(state.serverAliases, [], 'server aliases must start empty');
assert.deepStrictEqual(LibraryTabStore.homeOrder(state, ['continue', 'recommended', 'recent']), ['kind:continue', 'kind:recommended', 'source:server-a|2', 'source:server-a|1', 'source:server-b|2'], 'Home order must expand Recently Added into source-specific rows without changing navbar order');

state = LibraryTabStore.update(state, 'server-b|2', { alias: 'Cinema', enabled: false, icon: 'star', homeRecentEnabled: false });
var shared = state.items.filter(function (entry) { return entry.sourceId === 'server-b|2'; })[0];
assert.strictEqual(shared.alias, 'Cinema', 'library aliases must be persisted independently');
assert.strictEqual(shared.enabled, false, 'library visibility must be configurable');
assert.strictEqual(shared.homeRecentEnabled, false, 'Home Recently Added visibility must be configurable independently from navbar visibility');
assert.strictEqual(shared.icon, 'star', 'library icon must be configurable');
assert.strictEqual(Object.prototype.hasOwnProperty.call(shared, 'displayMode'), false, 'per-library display mode must not remain in the simplified preference model');

state = LibraryTabStore.updateDisplayMode(state, 'icon-text');
assert.strictEqual(state.displayMode, 'icon-text', 'one global display mode must control Home and all libraries');
state = LibraryTabStore.updateServerAlias(state, 'server-b', 'Marco');
assert.strictEqual(LibraryTabStore.serverAlias(state, 'server-b'), 'Marco', 'shared PMS aliases must be stored independently from library aliases');
state = LibraryTabStore.updateServerEnabled(state, 'server-b', false);
assert.strictEqual(LibraryTabStore.serverEnabled(state, 'server-b'), false, 'a server can be disabled without changing its individual library preferences');
assert.strictEqual(LibraryTabStore.serverAlias(state, 'server-b'), 'Marco', 'disabling a server must preserve its custom name');

state = LibraryTabStore.reorder(state, ['server-b|2', 'server-a|1', 'server-a|2']);
assert.deepStrictEqual(state.items.map(function (entry) { return entry.sourceId; }), ['server-b|2', 'server-a|1', 'server-a|2'], 'Settings and navbar reorder use one source-aware ordering model');
state = LibraryTabStore.reorderHome(state, ['source:server-a|1', 'kind:continue', 'source:server-b|2', 'kind:recommended', 'source:server-a|2']);
assert.deepStrictEqual(state.homeOrder, ['source:server-a|1', 'kind:continue', 'source:server-b|2', 'kind:recommended', 'source:server-a|2'], 'Home rows from generic groups and concrete Recently Added libraries must be reorderable together');
assert.deepStrictEqual(state.items.map(function (entry) { return entry.sourceId; }), ['server-b|2', 'server-a|1', 'server-a|2'], 'Home Recently Added ordering must not reorder navbar libraries');

var disabledOrderState = LibraryTabStore.validate({
  version: 1, legacyMigrated: true, displayMode: 'text', home: { icon: 'home' },
  serverStates: [{ serverMachineIdentifier: 'server-b', enabled: false }],
  homeOrder: ['kind:continue', 'source:server-a|1', 'source:server-b|1', 'source:server-a|2', 'source:server-b|2', 'kind:recommended'],
  items: [
    { sourceId: 'server-a|1', serverMachineIdentifier: 'server-a', sectionKey: '1', enabled: true, homeRecentEnabled: true, order: 0 },
    { sourceId: 'server-b|1', serverMachineIdentifier: 'server-b', sectionKey: '1', enabled: true, homeRecentEnabled: true, order: 1 },
    { sourceId: 'server-a|2', serverMachineIdentifier: 'server-a', sectionKey: '2', enabled: true, homeRecentEnabled: true, order: 2 },
    { sourceId: 'server-b|2', serverMachineIdentifier: 'server-b', sectionKey: '2', enabled: true, homeRecentEnabled: true, order: 3 }
  ]
});
disabledOrderState = LibraryTabStore.reorder(disabledOrderState, ['server-a|2', 'server-a|1']);
assert.deepStrictEqual(disabledOrderState.items.map(function (entry) { return entry.sourceId; }),
  ['server-a|2', 'server-b|1', 'server-a|1', 'server-b|2'],
  'reordering visible libraries must preserve the slots of libraries hidden by a disabled server');
disabledOrderState = LibraryTabStore.reorderHome(disabledOrderState, ['source:server-a|2', 'kind:continue', 'source:server-a|1', 'kind:recommended']);
assert.deepStrictEqual(disabledOrderState.homeOrder,
  ['source:server-a|2', 'kind:continue', 'source:server-b|1', 'source:server-a|1', 'source:server-b|2', 'kind:recommended'],
  'reordering visible Home rows must preserve disabled-server Recently Added positions for later reenable');

var originalArraySort = Array.prototype.sort;
var navigationSortCalls = 0;
Array.prototype.sort = function () { navigationSortCalls += 1; return originalArraySort.apply(this, arguments); };
var navigation;
try { navigation = LibraryTabStore.navigation(sources, state); }
finally { Array.prototype.sort = originalArraySort; }
assert.strictEqual(navigationSortCalls, 1, 'navigation must validate and sort preference state only once per composition');
assert.deepStrictEqual(navigation.map(function (entry) { return entry.sourceId; }), ['server-a|1', 'server-a|2'], 'disabled servers and hidden libraries must be absent from active navigation without losing their preferences');
assert.strictEqual(navigation[0].displayMode, 'icon-text', 'global display mode must be projected onto every active library tab');
assert.strictEqual(navigation[0].title, 'Serie TV', 'primary libraries must not receive a redundant server suffix');

state = LibraryTabStore.update(state, 'server-b|2', { enabled: true });
assert.strictEqual(LibraryTabStore.navigation(sources, state).some(function (entry) { return entry.sourceId === 'server-b|2'; }), false, 'reenabling a library must not bypass a disabled server');
state = LibraryTabStore.updateServerEnabled(state, 'server-b', true);
navigation = LibraryTabStore.navigation(sources, state);
assert.strictEqual(navigation[0].title, 'Cinema \u00b7 Marco', 'shared library labels must combine library alias and server alias');
assert.strictEqual(LibraryTabStore.displayLibraryName(sources[2], state), 'Cinema', 'displayed library names must reuse the configured library alias');
assert.strictEqual(LibraryTabStore.displayTitle(sources[2], state), 'Cinema \u00b7 Marco', 'shared Home/library labels must reuse the navbar display title');
assert.strictEqual(LibraryTabStore.displayTitle(sources[0], state), 'Serie TV', 'primary display titles must omit the server suffix');
assert.strictEqual(navigation[0].serverMachineIdentifier, 'server-b', 'navigation items must retain source identity');
assert.strictEqual(navigation[0].key, '2', 'navigation items keep the Plex section key for existing library code');


var ownedSecondaryNavigation = LibraryTabStore.navigation([
  { id: 'server-c|7', serverMachineIdentifier: 'server-c', serverName: 'Studio', primary: false, owned: true, sectionKey: '7', sectionTitle: 'Film', sectionType: 'movie', defaultTitle: 'Film \u00b7 Studio', defaultIcon: 'movie' }
], {
  version: 1, legacyMigrated: true, displayMode: 'text', home: { icon: 'home' }, serverAliases: [],
  items: [{ sourceId: 'server-c|7', serverMachineIdentifier: 'server-c', sectionKey: '7', enabled: true, alias: '', icon: 'movie', order: 0, lastSeenAt: now }]
});
assert.strictEqual(ownedSecondaryNavigation[0].title, 'Film \u00b7 Studio', 'owned secondary PMS libraries must keep a server suffix just like shared secondary sources');

var aggregateState = LibraryTabStore.reconcile(null, [sources[1], sources[2]], { primaryMachineIdentifier: 'server-a', legacyOrder: [], now: now });
var aggregateNavigation = LibraryTabStore.aggregateNavigation(LibraryTabStore.navigation([sources[1], sources[2]], aggregateState));
assert.strictEqual(aggregateNavigation.length, 1, 'matching displayed names and library types must collapse into one virtual navigation entry');
assert.strictEqual(aggregateNavigation[0].virtualLibrary, true, 'collapsed navigation entries must be marked virtual');
assert.deepStrictEqual(aggregateNavigation[0].memberSourceIds, ['server-a|2', 'server-b|2'], 'virtual libraries must retain the ordered concrete member source ids');
assert.strictEqual(aggregateNavigation[0].title, 'Film', 'virtual libraries must omit server suffixes');

var retained = LibraryTabStore.reconcile(state, sources.slice(0, 2), {
  primaryMachineIdentifier: 'server-a', legacyOrder: [], now: now + 89 * 24 * 60 * 60 * 1000
});
assert.strictEqual(retained.items.some(function (entry) { return entry.sourceId === 'server-b|2'; }), true, 'temporarily missing source preferences must survive within the retention window');
var pruned = LibraryTabStore.reconcile(retained, sources.slice(0, 2), {
  primaryMachineIdentifier: 'server-a', legacyOrder: [], now: now + 181 * 24 * 60 * 60 * 1000
});
assert.strictEqual(pruned.items.some(function (entry) { return entry.sourceId === 'server-b|2'; }), false, 'stale missing source preferences must be pruned after 90 days');

var storedValue = '';
var storage = {
  setItem: function (_key, value) { storedValue = value; },
  getItem: function () { return storedValue; }
};
LibraryTabStore.save(storage, state);
assert.strictEqual(storedValue.indexOf('token'), -1, 'tab preferences must never persist tokens');
assert.strictEqual(storedValue.indexOf('http://'), -1, 'tab preferences must never persist server routes');
var loadedState = LibraryTabStore.load(storage);
assert.strictEqual(loadedState.displayMode, 'icon-text', 'global presentation must survive a persistence round trip');
assert.strictEqual(LibraryTabStore.serverAlias(loadedState, 'server-b'), 'Marco', 'server aliases must survive a persistence round trip');
assert.strictEqual(LibraryTabStore.serverEnabled(loadedState, 'server-b'), true, 'server enabled state must survive a persistence round trip');
assert.deepStrictEqual(loadedState.homeOrder, ['source:server-a|1', 'kind:continue', 'source:server-b|2', 'kind:recommended', 'source:server-a|2'], 'unified Home order must survive a persistence round trip');
assert.strictEqual(loadedState.items.filter(function (entry) { return entry.sourceId === 'server-b|2'; })[0].homeRecentEnabled, false, 'Home Recently Added visibility must survive a persistence round trip');

var migrated = LibraryTabStore.validate({
  home: { displayMode: 'icon', icon: 'home' },
  items: [{ sourceId: 'server-a|1', serverMachineIdentifier: 'server-a', sectionKey: '1', displayMode: 'icon-text', icon: 'tv' }]
});
assert.strictEqual(migrated.displayMode, 'icon', 'legacy Home presentation must migrate into the new global display mode');
assert.strictEqual(Object.prototype.hasOwnProperty.call(migrated.items[0], 'displayMode'), false, 'legacy per-item presentation must be discarded after migration');

console.log('Library tab store checks passed');
