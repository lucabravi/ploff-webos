'use strict';

var assert = require('assert');
var LibrarySource = require('../app/library-source');
var LibraryTabStore = require('../app/library-tab-store');
var LibrarySourceCatalog = require('../app/library-source-catalog');

function memoryStorage() {
  var values = {};
  return {
    getItem: function (key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem: function (key, value) { values[key] = String(value); },
    removeItem: function (key) { delete values[key]; }
  };
}

var storage = memoryStorage();
var catalog = LibrarySourceCatalog.create({
  storage: storage,
  LibrarySource: LibrarySource,
  LibraryTabStore: LibraryTabStore,
  now: function () { return 1000; }
});
var primary = { name: 'PloffNAS', machineIdentifier: 'server-a', owned: true };
var marco = { name: 'Marco', machineIdentifier: 'server-b', owned: false };
var primaryNavigation = [
  { title: 'Home', kind: 'home', labelKey: 'nav.home' },
  { title: 'Film', kind: 'library', key: '1', type: 'movie' },
  { title: 'Serie TV', kind: 'library', key: '2', type: 'show' },
  { title: 'Watchlist', kind: 'watchlist', labelKey: 'nav.watchlist' },
  { title: 'Playlists', kind: 'playlists', labelKey: 'nav.playlists' },
  { title: 'Cerca', kind: 'search', labelKey: 'nav.search' },
  { title: 'Impostazioni', kind: 'settings', labelKey: 'nav.settings' }
];

var nav = catalog.applyPrimaryNavigation(primary, primaryNavigation);
assert.deepStrictEqual(nav.map(function (item) { return item.kind; }), ['home', 'library', 'library', 'watchlist', 'playlists', 'search', 'settings'], 'primary navigation must preserve fixed rows around library tabs');
assert.strictEqual(nav[1].sourceId, 'server-a|1', 'primary library must receive a stable source id');
assert.strictEqual(nav[1].title, 'Film', 'primary library must keep its plain title by default');

nav = catalog.mergeServerSections(marco, [
  { title: 'Film', key: '1', type: 'movie' },
  { title: 'Anime', key: '9', type: 'show' }
]);
assert.deepStrictEqual(nav.filter(function (item) { return item.kind === 'library'; }).map(function (item) { return item.sourceId; }), [
  'server-a|1', 'server-a|2', 'server-b|1', 'server-b|9'
], 'secondary libraries must append without colliding with identical section keys');
assert.strictEqual(nav[3].title, 'Film \u00b7 Marco', 'secondary libraries must identify their server in the default title');
assert.strictEqual(nav[3].owned, false, 'shared server ownership must remain attached to the navigation source');
assert.strictEqual(catalog.source('server-b|9').sectionTitle, 'Anime', 'catalog must resolve a navigation source by stable id');

var saved = LibraryTabStore.load(storage);
assert.strictEqual(saved.items.filter(function (entry) { return entry.sourceId === 'server-b|1'; })[0].enabled, true, 'new shared libraries must be visible automatically');

catalog.updateTab('server-b|1', { alias: 'Cinema', icon: 'movie' });
catalog.updateServerAlias('server-b', 'Marco Plex');
catalog.updateDisplayMode('icon-text');
nav = catalog.navigationItems();
assert.strictEqual(nav.filter(function (item) { return item.sourceId === 'server-b|1'; })[0].title, 'Cinema \u00b7 Marco Plex', 'catalog navigation must combine saved library and server aliases');
assert.strictEqual(nav.filter(function (item) { return item.sourceId === 'server-b|1'; })[0].displayMode, 'icon-text', 'catalog navigation must apply the global display mode');

catalog.updateTab('server-b|9', { enabled: false });
assert.strictEqual(catalog.navigationItems().some(function (item) { return item.sourceId === 'server-b|9'; }), false, 'disabled libraries must disappear from the navbar');
catalog.updateServerEnabled('server-b', false);
assert.strictEqual(catalog.navigationItems().some(function (item) { return item.serverMachineIdentifier === 'server-b'; }), false, 'disabling a server must hide all of its libraries from navigation');
assert.strictEqual(catalog.homeOrder(['continue', 'recommended', 'recent']).some(function (token) { return token.indexOf('source:server-b|') === 0; }), false, 'disabled-server Recently Added rows must disappear from the Home ordering editor');
assert.strictEqual(catalog.canDisableServer('server-a'), false, 'the only enabled server must not be disableable');
catalog.updateServerEnabled('server-a', false);
assert.strictEqual(catalog.serverEnabled('server-a'), true, 'disabling the last enabled server must be rejected at the catalog boundary');
assert.strictEqual(catalog.navigationItems().some(function (item) { return item.serverMachineIdentifier === 'server-a'; }), true, 'rejecting last-server disable must keep its libraries available');
catalog.updateServerEnabled('server-b', true);
assert.strictEqual(catalog.canDisableServer('server-a'), true, 'a server becomes disableable again when another server is enabled');
assert.strictEqual(catalog.navigationItems().some(function (item) { return item.sourceId === 'server-b|1'; }), true, 'reenabling a server must restore libraries that were individually enabled before server disable');

catalog.reorder(['server-b|1', 'server-a|2', 'server-a|1']);
assert.deepStrictEqual(catalog.navigationItems().filter(function (item) { return item.kind === 'library'; }).map(function (item) { return item.sourceId; }), [
  'server-b|1', 'server-a|2', 'server-a|1'
], 'catalog reorder must use source ids across PMS boundaries');
assert.deepStrictEqual(catalog.primaryOrder(), ['2', '1'], 'catalog must expose the primary-only legacy order projection');

catalog.updateDisplayMode('icon');
catalog.updateHome({ icon: 'home' });
assert.deepStrictEqual(catalog.homePreference(), { displayMode: 'icon', icon: 'home' }, 'Home presentation must use the same global display mode without becoming a library source');
nav = catalog.navigationItems();
assert.strictEqual(nav[0].displayMode, 'icon', 'Home navigation item must expose its saved presentation mode');
assert.strictEqual(nav[0].icon, 'home', 'Home navigation item must expose its saved icon');

var ownedSecondaryCatalog = LibrarySourceCatalog.create({
  storage: memoryStorage(), LibrarySource: LibrarySource, LibraryTabStore: LibraryTabStore, now: function () { return 1000; }
});
ownedSecondaryCatalog.applyPrimaryNavigation(primary, [
  { title: 'Home', kind: 'home', labelKey: 'nav.home' },
  { title: 'Film', kind: 'library', key: '1', type: 'movie' },
  { title: 'Cerca', kind: 'search', labelKey: 'nav.search' },
  { title: 'Impostazioni', kind: 'settings', labelKey: 'nav.settings' }
]);
var ownedSecondaryNav = ownedSecondaryCatalog.mergeServerSections(
  { name: 'Studio', machineIdentifier: 'server-c', owned: true },
  [{ title: 'Film', key: '1', type: 'movie' }]
);
assert.strictEqual(ownedSecondaryNav.filter(function (item) { return item.sourceId === 'server-c|1'; })[0].title, 'Film \u00b7 Studio', 'owned secondary PMS libraries must stay distinguishable from same-named primary libraries');


storage.setItem(LibraryTabStore.STORAGE_KEY, JSON.stringify({
  version: 1, legacyMigrated: true, displayMode: 'icon-text',
  home: { icon: 'home' },
  serverAliases: [{ serverMachineIdentifier: 'server-b', alias: 'Marco Restore' }],
  items: [
    { sourceId: 'server-b|1', serverMachineIdentifier: 'server-b', sectionKey: '1', enabled: true, alias: 'Ripristinato Marco', displayMode: 'icon', icon: 'star', order: 0, lastSeenAt: 1000 },
    { sourceId: 'server-a|1', serverMachineIdentifier: 'server-a', sectionKey: '1', enabled: false, alias: '', displayMode: 'text', icon: 'movie', order: 1, lastSeenAt: 1000 },
    { sourceId: 'server-a|2', serverMachineIdentifier: 'server-a', sectionKey: '2', enabled: true, alias: 'Serie Restore', displayMode: 'text', icon: 'tv', order: 2, lastSeenAt: 1000 },
    { sourceId: 'server-b|9', serverMachineIdentifier: 'server-b', sectionKey: '9', enabled: true, alias: '', displayMode: 'text', icon: 'anime', order: 3, lastSeenAt: 1000 }
  ]
}));
nav = catalog.reloadPreferences();
assert.strictEqual(nav[0].displayMode, 'icon-text', 'reloading preferences must apply restored Home presentation immediately');
assert.deepStrictEqual(nav.filter(function (item) { return item.kind === 'library'; }).map(function (item) { return item.sourceId; }), [
  'server-b|1', 'server-a|2', 'server-b|9'
], 'reloading preferences must apply restored visibility and ordering to the live source catalog');
assert.strictEqual(nav.filter(function (item) { return item.sourceId === 'server-b|1'; })[0].title, 'Ripristinato Marco \u00b7 Marco Restore', 'reloading preferences must apply restored library and server aliases immediately');

storage.setItem(LibraryTabStore.STORAGE_KEY, JSON.stringify({
  version: 1, legacyMigrated: true, displayMode: 'text', home: { icon: 'home' },
  serverStates: [
    { serverMachineIdentifier: 'server-a', enabled: false },
    { serverMachineIdentifier: 'server-b', enabled: false }
  ],
  items: LibraryTabStore.load(storage).items
}));
catalog.reloadPreferences();
assert.strictEqual(catalog.serverEnabled('server-a'), true, 'restoring an all-disabled server state must keep the primary server enabled as the deterministic last-server fallback');
assert.strictEqual(catalog.serverEnabled('server-b'), false, 'restoring an all-disabled state must not reenable every server');
assert.deepStrictEqual(catalog.primaryOrder(), ['1', '2'], 'reloading preferences must expose the restored primary projection even when one primary tab is hidden');


var legacyDisabledStorage = memoryStorage();
legacyDisabledStorage.setItem(LibraryTabStore.STORAGE_KEY, JSON.stringify({
  version: 1, legacyMigrated: true, displayMode: 'text', home: { icon: 'home' },
  serverStates: [
    { serverMachineIdentifier: 'server-a', enabled: false },
    { serverMachineIdentifier: 'server-b', enabled: false }
  ]
}));
var legacyDisabledCatalog = LibrarySourceCatalog.create({
  storage: legacyDisabledStorage,
  LibrarySource: LibrarySource,
  LibraryTabStore: LibraryTabStore,
  now: function () { return 1000; }
});
legacyDisabledCatalog.applyPrimaryNavigation(primary, primaryNavigation);
legacyDisabledCatalog.mergeServerSections(marco, [{ title: 'Film', key: '1', type: 'movie' }]);
legacyDisabledCatalog.retainServerSources(['server-b']);
assert.strictEqual(legacyDisabledCatalog.serverEnabled('server-a'), true,
  'cold-start discovery must repair legacy all-disabled server preferences once the known server set is complete');
assert.strictEqual(legacyDisabledCatalog.serverEnabled('server-b'), false,
  'cold-start all-disabled repair must reenable one deterministic server only');

(function testRepeatedCatalogReadsReuseTheCurrentProjection() {
  var originalValidate = LibraryTabStore.validate;
  var validateCalls = 0;
  var cachedCatalog;
  var index;
  LibraryTabStore.validate = function (value) {
    validateCalls += 1;
    return originalValidate(value);
  };
  try {
    cachedCatalog = LibrarySourceCatalog.create({
      storage: memoryStorage(),
      LibrarySource: LibrarySource,
      LibraryTabStore: LibraryTabStore,
      now: function () { return 1000; }
    });
    cachedCatalog.applyPrimaryNavigation(primary, primaryNavigation);
    cachedCatalog.mergeServerSections(marco, [
      { title: 'Film', key: '1', type: 'movie' },
      { title: 'Anime', key: '9', type: 'show' }
    ]);
    assert.strictEqual(typeof cachedCatalog.homeRecentEnabled, 'function',
      'catalog must own the hot-path Recently Added preference lookup');
    validateCalls = 0;
    for (index = 0; index < 20; index += 1) {
      cachedCatalog.displayLibraryName('server-b|1');
      cachedCatalog.displayTitle('server-b|1');
      cachedCatalog.displayServerNameForMachine('server-b');
      cachedCatalog.serverEnabled('server-a');
      cachedCatalog.homePreference();
      cachedCatalog.displayMode();
      cachedCatalog.primaryOrder();
    }
    assert.strictEqual(validateCalls, 0,
      'repeated catalog reads must use the cached normalized projection instead of revalidating unchanged preferences');
  } finally {
    LibraryTabStore.validate = originalValidate;
  }
}());

console.log('Library source catalog checks passed');
