'use strict';
var assert = require('assert');
var MultiServerMedia = require('../app/multi-server-media');
var Controller = require('../app/coordinator/multi-server-content-controller');
var servers = [
  { serverMachineIdentifier: 'a', serverName: 'Primary', primary: true, apiBaseUrl: 'https://a.example', token: 'a-token' },
  { serverMachineIdentifier: 'b', serverName: 'Shared', primary: false, apiBaseUrl: 'https://b.example', token: 'b-token' }
];
function request() { return { aborted: false, abort: function () { this.aborted = true; } }; }
var calls = [];
var sources = {
  resolveServers: function (callback) { callback(null, servers); return request(); },
  primaryContext: function () { return servers[0]; },
  contextForMachine: function (machine) { return servers.filter(function (server) { return server.serverMachineIdentifier === machine; })[0] || null; },
  sources: function () { return [
    { id: 'a|1', serverMachineIdentifier: 'a', sectionKey: '1' },
    { id: 'b|9', serverMachineIdentifier: 'b', sectionKey: '9' }
  ]; },
  displayTitle: function (sourceId) { return sourceId === 'b|9' ? 'Anime \u00b7 Marco' : 'Film'; },
  displayLibraryName: function (sourceId) { return sourceId === 'b|9' ? 'Anime' : 'Film'; },
  displayServerName: function (sourceId) { return sourceId === 'b|9' ? 'Marco' : ''; },
  displayServerNameForMachine: function (machine) { return machine === 'b' ? 'Marco' : ''; },
  aggregateHomeLibraries: function () { return false; }
};
var transport = {
  search: function (config, query, _libraries, callback) {
    calls.push(['search', config.apiBaseUrl, query]);
    callback(null, config.apiBaseUrl.indexOf('a.example') !== -1
      ? [{ ratingKey: '1', guid: 'plex://movie/same', librarySectionID: '1', title: 'Same' }, { ratingKey: '2', guid: 'plex://movie/a2', librarySectionID: '1', title: 'A2' }]
      : [{ ratingKey: '10', guid: 'plex://movie/same', librarySectionID: '9', title: 'Same B' }, { ratingKey: '11', guid: 'plex://movie/b2', librarySectionID: '9', title: 'B2' }]);
    return request();
  },
  findByGuid: function (config, guid, callback) {
    calls.push(['find', config.apiBaseUrl, guid]);
    if (guid === 'plex://movie/shared-only' && config.apiBaseUrl.indexOf('b.example') !== -1) {
      callback(null, { ratingKey: '20', guid: guid, librarySectionID: '9', title: 'Shared only' });
    } else if (guid === 'plex://movie/both') {
      callback(null, { ratingKey: config.apiBaseUrl.indexOf('a.example') !== -1 ? '3' : '30', guid: guid, librarySectionID: config.apiBaseUrl.indexOf('a.example') !== -1 ? '1' : '9', title: 'Both' });
    } else { callback(null, null); }
    return request();
  },
  loadHome: function (config, callback) {
    calls.push(['home', config.apiBaseUrl]);
    if (config.apiBaseUrl.indexOf('a.example') !== -1) {
      callback(null, [
        { kind: 'continue', items: [{ ratingKey: '4', guid: 'plex://episode/a', librarySectionID: '1', title: 'A', lastViewedAt: 100 }] },
        { kind: 'recommended', recommendation: true, items: [{ ratingKey: '5', guid: 'plex://movie/rec-same', librarySectionID: '1', title: 'Rec A' }] },
        { kind: 'recent', sectionKey: '1', sectionTitle: 'Film', title: 'Recent Film', items: [{ ratingKey: '6', guid: 'plex://movie/recent-a', librarySectionID: '1', title: 'Recent A' }] }
      ]);
    } else {
      callback(null, [
        { kind: 'continue', items: [{ ratingKey: '40', guid: 'plex://episode/a', librarySectionID: '9', title: 'A shared', lastViewedAt: 300 }, { ratingKey: '41', guid: 'plex://episode/b', librarySectionID: '9', title: 'B', lastViewedAt: 200 }] },
        { kind: 'recommended', recommendation: true, items: [{ ratingKey: '50', guid: 'plex://movie/rec-same', librarySectionID: '9', title: 'Rec B' }, { ratingKey: '51', guid: 'plex://movie/rec-b', librarySectionID: '9', title: 'Rec B2' }] },
        { kind: 'recent', sectionKey: '9', sectionTitle: 'Anime', title: 'Recent Anime', items: [{ ratingKey: '52', guid: 'plex://movie/recent-b', librarySectionID: '9', title: 'Recent B' }] }
      ]);
    }
    return request();
  },
  loadLibraryPage: function (config, _library, _view, _query, start, _size, callback) {
    calls.push(['playlists', config.apiBaseUrl, start]);
    callback(null, { items: [{ ratingKey: '7', title: config.apiBaseUrl.indexOf('a.example') !== -1 ? 'Primary playlist' : 'Shared playlist', containerType: 'playlist', containerKey: '/playlists/7/items' }], totalSize: 1, nextStart: 1, hasMore: false });
    return request();
  },
  loadLibraryContainerPage: function (config, container, start, size, callback) {
    calls.push(['playlist-items', config.apiBaseUrl, container.ratingKey, start, size]);
    callback(null, { items: [{ ratingKey: 'ep', title: 'Episode' }], totalSize: 1, nextStart: 1, hasMore: false });
    return request();
  },
  loadMetadata: function (config, ratingKey, callback) {
    calls.push(['metadata', config.apiBaseUrl, ratingKey]);
    callback(null, { ratingKey: ratingKey, title: 'Metadata' });
    return request();
  }
};
var controller = Controller.create({ sources: sources, transport: transport, MultiServerMedia: MultiServerMedia, config: { searchItemLimit: 60, itemLimit: 12 } });
var searched;
controller.search('matrix', function (error, items) { assert.ifError(error); searched = items; });
assert.deepStrictEqual(searched.map(function (item) { return item.title; }), ['Same', 'B2', 'A2']);
assert.strictEqual(searched[0].sourceVariants.length, 2, 'deduplicated Search results must retain both PMS variants');
assert.strictEqual(searched[1].serverMachineIdentifier, 'b');
assert.strictEqual(searched[1].libraryTitle, 'Anime \u00b7 Marco', 'secondary Search results must use the same source-aware library badge as other multi-server surfaces');
var resolved;
controller.resolveGuid('plex://movie/shared-only', function (error, item) { assert.ifError(error); resolved = item; });
assert.strictEqual(resolved.serverMachineIdentifier, 'b');
assert.strictEqual(resolved.libraryTitle, 'Anime \u00b7 Marco', 'resolved Watchlist media must expose library and server aliases for a secondary PMS');
sources.aggregateLibraries = function () { return true; };
sources.navigationItems = function () { return [
  { sourceId: 'a|1', title: 'Film' },
  { sourceId: 'b|9', title: 'Anime \u00b7 Marco' }
]; };
controller.resolveGuid('plex://movie/shared-only', function (error, item) { assert.ifError(error); resolved = item; });
assert.strictEqual(resolved.libraryTitle, 'Anime \u00b7 Marco', 'enabling library aggregation must not hide the server suffix from a secondary library that is not actually merged');
sources.navigationItems = function () { return [
  { virtualLibrary: true, memberSourceIds: ['a|1', 'b|9'], title: 'Anime' }
]; };
controller.resolveGuid('plex://movie/shared-only', function (error, item) { assert.ifError(error); resolved = item; });
assert.strictEqual(resolved.libraryTitle, 'Anime', 'a secondary library that belongs to an actual merged tab must use the merged library label');
delete sources.aggregateLibraries;
delete sources.navigationItems;
controller.resolveGuid('plex://movie/both', function (error, item) { assert.ifError(error); resolved = item; });
assert.strictEqual(resolved.serverMachineIdentifier, 'a', 'primary copy wins when both servers resolve the same GUID');
assert.strictEqual(resolved.sourceVariants.length, 2, 'GUID resolution must retain alternate PMS copies for later source failover');
var home;
controller.loadHome(function (error, rows) { assert.ifError(error); home = rows; });
assert.deepStrictEqual(home[0].items.map(function (item) { return item.title; }), ['A'], 'initial Home must return the primary PMS immediately without waiting for shared servers');
assert.strictEqual(home.filter(function (row) { return row.kind === 'recent'; }).length, 1, 'initial Home must contain only primary Recently Added rows');
assert.strictEqual(calls.filter(function (entry) { return entry[0] === 'home' && entry[1] === 'https://b.example'; }).length, 0,
  'shared PMS Home must not be requested on the startup-critical path');
controller.refreshExternalHome(function (error, rows) { assert.ifError(error); home = rows; });
assert.deepStrictEqual(home[0].items.map(function (item) { return item.title; }), ['A shared', 'B'], 'Continue Watching must merge and sort by activity');
assert.strictEqual(home[0].items[0].serverMachineIdentifier, 'b');
assert.strictEqual(home[0].items[0].libraryTitle, 'Anime \u00b7 Marco', 'secondary Home badges must identify both library and server aliases when Home libraries are separate');
assert.strictEqual(home[0].items[0].libraryTitle, 'Anime \u00b7 Marco', 'secondary Home badges must identify both the library alias and server alias when libraries are not aggregated');
assert.strictEqual(home[0].items[0].sourceVariants.length, 2, 'Continue Watching must retain an active alternate PMS when duplicate media is merged');
assert.strictEqual(home.filter(function (row) { return row.kind === 'recent'; }).length, 2, 'Recently Added remains one row per library');
assert.deepStrictEqual(home.filter(function (row) { return row.kind === 'recent'; }).map(function (row) { return [row.titleKey, row.titleParameters && row.titleParameters.library]; }), [['home.recentInLibrary', 'Film'], ['home.recentInLibrary', 'Anime \u00b7 Marco']], 'Recently Added rows must preserve semantic localization plus the same primary/secondary naming as navbar tabs');
assert.strictEqual(home.filter(function (row) { return row.kind === 'recommended'; })[0].items.length, 2, 'Recommended must dedupe the same GUID across PMSes');
assert.strictEqual(home.filter(function (row) { return row.kind === 'recommended'; })[0].items[0].sourceVariants.length, 2, 'Recommended duplicates must retain both PMS variants for failover');
sources.aggregateHomeLibraries = function () { return true; };
controller.refreshExternalHome(function (error, rows) { assert.ifError(error); home = rows; });
assert.strictEqual(home[0].items.filter(function (item) { return item.serverMachineIdentifier === 'b'; })[0].libraryTitle, 'Anime \u00b7 Marco',
  'Home library merging must keep the server suffix when the secondary library has no homonymous peer on another PMS');
sources.preferenceState = function () { return { items: [{ sourceId: 'a|1', mergeGroup: 'Cinema' }, { sourceId: 'b|9', mergeGroup: 'Cinema' }] }; };
controller.refreshExternalHome(function (error, rows) { assert.ifError(error); home = rows; });
assert.strictEqual(home.filter(function (row) { return row.kind === 'recent'; }).length, 1, 'explicit groups must also merge Home rows despite different aliases');
assert.strictEqual(home.filter(function (row) { return row.kind === 'recent'; })[0].titleParameters.library, 'Cinema');
delete sources.preferenceState;
sources.aggregateHomeLibraries = function () { return false; };
var refreshedHome;
controller.loadHome(function (error, rows) { assert.ifError(error); refreshedHome = rows; });
assert.deepStrictEqual(refreshedHome[0].items.map(function (item) { return item.title; }), ['A shared', 'B'],
  'later primary Home refreshes must retain the last external enrichment until the next lazy refresh completes');
var playlists;
controller.loadPlaylists(0, 60, function (error, page) { assert.ifError(error); playlists = page; });
assert.strictEqual(playlists.libraryKey, 'playlists', 'aggregated playlist pages must identify the global playlist library');
assert.deepStrictEqual(playlists.items.map(function (item) { return item.title; }), ['Primary playlist', 'Shared playlist']);
assert.strictEqual(playlists.items[1].serverMachineIdentifier, 'b');
assert.strictEqual(playlists.items[1].libraryTitle, 'Marco', 'secondary playlist badges must identify only the owning server');
var playlistPage;
controller.loadPlaylistItems(playlists.items[1], 0, 60, function (error, page) { assert.ifError(error); playlistPage = page; });
assert.strictEqual(playlistPage.items[0].serverMachineIdentifier, 'b');
assert.strictEqual(playlistPage.items[0].libraryTitle, 'Marco', 'items inside a secondary playlist must keep the server-only source badge');
assert.ok(calls.some(function (entry) { return entry[0] === 'playlist-items' && entry[1] === 'https://b.example'; }), 'secondary playlist items must load from the owning PMS');
assert.strictEqual(controller.contextForItem(searched[1]).token, 'b-token');
assert.strictEqual(controller.contextForItem(searched[1]).sourceId, 'b|9', 'media context must preserve the concrete library source for downstream watched/progress routing');
var externalMetadata;
controller.loadMetadata(searched[1], function (error, detail) { assert.ifError(error); externalMetadata = detail; });
assert.strictEqual(externalMetadata.ratingKey, searched[1].ratingKey, 'source-aware metadata loading must return the requested media detail');
assert.strictEqual(externalMetadata.serverMachineIdentifier, 'b', 'source-aware metadata must retain the owning PMS for downstream theme/backdrop rendering');
assert.ok(calls.some(function (entry) { return entry[0] === 'metadata' && entry[1] === 'https://b.example'; }),
  'source-aware metadata loading must route through the owning PMS rather than the composition root');
controller.destroy();

(function aggregateRecentlyAddedRowsByDisplayedLibraryName() {
  var mergeHomeLibraries = false;
  var aggregateSources = {
    resolveServers: function (callback) { callback(null, servers); return request(); },
    primaryContext: function () { return servers[0]; },
    contextForMachine: sources.contextForMachine,
    sources: function () { return [
      { id: 'a|1', serverMachineIdentifier: 'a', sectionKey: '1', sectionType: 'movie' },
      { id: 'b|9', serverMachineIdentifier: 'b', sectionKey: '9', sectionType: 'movie' }
    ]; },
    source: function (sourceId) { return this.sources().filter(function (entry) { return entry.id === sourceId; })[0] || null; },
    displayLibraryName: function () { return 'Film'; },
    displayTitle: function (sourceId) { return sourceId === 'b|9' ? 'Film \u00b7 Shared' : 'Film'; },
    aggregateHomeLibraries: function () { return mergeHomeLibraries; }
  };
  var local = Controller.create({
    sources: aggregateSources,
    transport: {
      loadHome: function (config, callback) {
        if (config.apiBaseUrl.indexOf('a.example') !== -1) {
          callback(null, [
            { kind: 'continue', items: [{ ratingKey: 'pc', guid: 'plex://movie/continue-primary', librarySectionID: '1', title: 'Continue Primary', lastViewedAt: 20 }] },
            { kind: 'recommended', items: [{ ratingKey: 'pr', guid: 'plex://movie/recommended-primary', librarySectionID: '1', title: 'Recommended Primary' }] },
            { kind: 'recent', sectionKey: '1', sectionTitle: 'Film', sectionType: 'movie', items: [
              { ratingKey: 'p1', guid: 'plex://movie/same', librarySectionID: '1', title: 'Same', addedAt: 20 },
              { ratingKey: 'p2', guid: 'plex://movie/primary', librarySectionID: '1', title: 'Primary', addedAt: 10 }
            ] }
          ]);
        } else {
          callback(null, [
            { kind: 'continue', items: [{ ratingKey: 'sc', guid: 'plex://movie/continue-shared', librarySectionID: '9', title: 'Continue Shared', lastViewedAt: 30 }] },
            { kind: 'recommended', items: [{ ratingKey: 'sr', guid: 'plex://movie/recommended-shared', librarySectionID: '9', title: 'Recommended Shared' }] },
            { kind: 'recent', sectionKey: '9', sectionTitle: 'Film', sectionType: 'movie', items: [
              { ratingKey: 's1', guid: 'plex://movie/same', librarySectionID: '9', title: 'Same secondary', addedAt: 30 },
              { ratingKey: 's2', guid: 'plex://movie/shared', librarySectionID: '9', title: 'Shared', addedAt: 15 }
            ] }
          ]);
        }
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia,
    config: { itemLimit: 12 }
  });
  var rows;
  var recent;
  var continueRow;
  var recommendedRow;
  var sharedContinue;
  var sharedRecommended;
  local.loadHome(function (error) { assert.ifError(error); });
  local.refreshExternalHome(function (error, value) { assert.ifError(error); rows = value; });
  recent = rows.filter(function (row) { return row.kind === 'recent'; });
  continueRow = rows.filter(function (row) { return row.kind === 'continue'; })[0];
  recommendedRow = rows.filter(function (row) { return row.kind === 'recommended'; })[0];
  sharedContinue = continueRow.items.filter(function (item) { return item.serverMachineIdentifier === 'b'; })[0];
  sharedRecommended = recommendedRow.items.filter(function (item) { return item.serverMachineIdentifier === 'b'; })[0];
  assert.strictEqual(rows.filter(function (row) { return row.kind === 'continue'; }).length, 1, 'Continue Watching must remain a single cross-server row when Home library merging is disabled');
  assert.strictEqual(rows.filter(function (row) { return row.kind === 'recommended'; }).length, 1, 'Recommended must remain a single cross-server row when Home library merging is disabled');
  assert.strictEqual(sharedContinue.libraryTitle, 'Film \u00b7 Shared', 'disabled Home library merging must keep library and server in Continue Watching badges');
  assert.strictEqual(sharedRecommended.libraryTitle, 'Film \u00b7 Shared', 'disabled Home library merging must keep library and server in Recommended badges');
  assert.strictEqual(recent.length, 2, 'disabled Home library merging must keep matching Recently Added libraries separate');
  mergeHomeLibraries = true;
  rows = local.recomposeHome();
  recent = rows.filter(function (row) { return row.kind === 'recent'; });
  continueRow = rows.filter(function (row) { return row.kind === 'continue'; })[0];
  recommendedRow = rows.filter(function (row) { return row.kind === 'recommended'; })[0];
  sharedContinue = continueRow.items.filter(function (item) { return item.serverMachineIdentifier === 'b'; })[0];
  sharedRecommended = recommendedRow.items.filter(function (item) { return item.serverMachineIdentifier === 'b'; })[0];
  assert.strictEqual(rows.filter(function (row) { return row.kind === 'continue'; }).length, 1, 'Continue Watching must stay merged when Home library merging is enabled');
  assert.strictEqual(rows.filter(function (row) { return row.kind === 'recommended'; }).length, 1, 'Recommended must stay merged when Home library merging is enabled');
  assert.strictEqual(sharedContinue.libraryTitle, 'Film', 'enabled Home library merging must suppress the server suffix for homonymous Continue Watching libraries');
  assert.strictEqual(sharedRecommended.libraryTitle, 'Film', 'enabled Home library merging must suppress the server suffix for homonymous Recommended libraries');
  assert.strictEqual(recent.length, 1, 'Home library merging must recompose matching Recently Added rows immediately from retained data');
  assert.strictEqual(recent[0].titleKey, 'home.recentInLibrary');
  assert.strictEqual(recent[0].titleParameters.library, 'Film', 'aggregated Recently Added rows must keep the library name as a localization parameter');
  assert.strictEqual(recent[0].items.filter(function (item) { return item.guid === 'plex://movie/same'; }).length, 1, 'duplicate GUIDs must appear once in an aggregated row');
  var same = recent[0].items.filter(function (item) { return item.guid === 'plex://movie/same'; })[0];
  assert.strictEqual(same.serverMachineIdentifier, 'a', 'primary PMS copy must be the default canonical source when duplicates exist');
  assert.strictEqual(same.sourceVariants.length, 2, 'deduplicated media must retain both lightweight source variants');
  local.destroy();
}());

(function mergedSeriesPublishesFirstUsefulPmsBeforeSlowPeerCompletes() {
  var serverA = { serverMachineIdentifier: 'incremental-a', apiBaseUrl: 'https://incremental-a', token: 'a', primary: true };
  var serverB = { serverMachineIdentifier: 'incremental-b', apiBaseUrl: 'https://incremental-b', token: 'b' };
  var pending = {};
  var partials = [];
  var finalContext = null;
  var localController = Controller.create({
    sources: {
      resolveServers: function (callback) { callback(null, [serverA, serverB]); return request(); },
      primaryContext: function () { return serverA; },
      contextForMachine: function (machine) { return machine === 'incremental-a' ? serverA : (machine === 'incremental-b' ? serverB : null); }
    },
    transport: {
      loadSeriesContext: function (config, _detail, callback) {
        pending[config.apiBaseUrl] = callback;
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia,
    config: {}
  });
  var merged = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'incremental-show-a', guid: 'plex://show/incremental', type: 'show' }, serverA),
    MultiServerMedia.decorateItem({ ratingKey: 'incremental-show-b', guid: 'plex://show/incremental', type: 'show' }, serverB)
  );
  localController.loadMergedSeriesContext(merged, function (error, context) {
    assert.ifError(error);
    finalContext = context;
  }, function (context) { partials.push(context); });

  pending['https://incremental-a'](null, {
    seasons: [{ ratingKey: 'incremental-a-s1', index: 1, seasonNumber: 1 }],
    episodes: [{ ratingKey: 'incremental-a-e1', type: 'episode', seasonIndex: 1, episodeIndex: 1 }]
  });
  assert.strictEqual(partials.length, 1, 'the first successful PMS must publish a partial series context immediately');
  assert.strictEqual(partials[0].seasons.length, 1);
  assert.strictEqual(partials[0].episodes.length, 1);
  assert.strictEqual(finalContext, null, 'the final merged callback must still wait for the remaining PMS');

  pending['https://incremental-b'](null, {
    seasons: [{ ratingKey: 'incremental-b-s1', index: 1, seasonNumber: 1 }],
    episodes: [{ ratingKey: 'incremental-b-e1', type: 'episode', seasonIndex: 1, episodeIndex: 1 }]
  });
  assert.ok(finalContext, 'the completed fan-out must publish the reconciled context');
  assert.strictEqual(finalContext.seasons[0].sourceVariants.length, 2);
  assert.strictEqual(finalContext.episodes[0].sourceVariants.length, 2);
  assert.strictEqual(partials.length, 1, 'the final PMS completion must not duplicate the progress notification');
  localController.destroy();
}());

(function playlistContainerFailureDoesNotOfflineOwningServerWithoutConnectivityFailure() {
  var reports = [];
  var verifies = [];
  var playlistError = null;
  var playlistAttempts = 0;
  var localSources = {
    resolveServers: function (callback) { callback(null, servers); return request(); },
    primaryContext: function () { return servers[0]; },
    contextForMachine: function (machine) { return machine === 'b' ? servers[1] : servers[0]; },
    sources: sources.sources,
    reportAvailability: function (machine, available) { reports.push([machine, available]); },
    verifyAvailability: function (machine, callback) { verifies.push(machine); callback(null, servers[1]); return request(); }
  };
  var localController = Controller.create({
    sources: localSources,
    transport: {
      loadLibraryContainerPage: function (_config, _container, _start, _size, callback) {
        playlistAttempts += 1;
        callback(new Error('Plex playlist request failed: 404'));
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia
  });
  var playlist = { ratingKey: '77', containerType: 'playlist', containerKey: '/playlists/77/items', serverMachineIdentifier: 'b', sourceId: 'b|9', title: 'Sample Playlist' };
  localController.loadPlaylistItems(playlist, 0, 60, function (error) { playlistError = error; });
  assert.ok(playlistError, 'a failing playlist container must still report its own error to the caller');
  assert.deepStrictEqual(verifies, ['b'], 'a secondary playlist error must trigger an independent connectivity verification');
  assert.deepStrictEqual(reports, [], 'a playlist/container error alone must never mark the whole PMS offline');
  assert.strictEqual(playlistAttempts, 1, 'a logical playlist error on an unchanged healthy route must not be retried');
  assert.strictEqual(playlist.serverMachineIdentifier, 'b', 'the visible playlist container must retain its PMS owner after its content request fails');
  localController.destroy();
}());

(function staleSecondaryRouteRetriesOnceAfterVerifiedRefresh() {
  var route = { serverMachineIdentifier: 'b', serverName: 'Shared', primary: false, apiBaseUrl: 'https://old-b.example', token: 'old-b-token' };
  var attempts = [];
  var result = null;
  var localSources = {
    resolveServers: function (callback) { callback(null, [servers[0], route]); return request(); },
    primaryContext: function () { return servers[0]; },
    contextForMachine: function (machine) { return machine === 'b' ? route : servers[0]; },
    sources: sources.sources,
    verifyAvailability: function (machine, callback) {
      assert.strictEqual(machine, 'b');
      route = { serverMachineIdentifier: 'b', serverName: 'Shared', primary: false, apiBaseUrl: 'https://fresh-b.example', token: 'fresh-b-token' };
      callback(null, route);
      return request();
    }
  };
  var localController = Controller.create({
    sources: localSources,
    transport: {
      loadLibraryContainerPage: function (config, _container, _start, _size, callback) {
        attempts.push([config.apiBaseUrl, config.token]);
        if (config.apiBaseUrl === 'https://old-b.example') { callback(new Error('stale route')); }
        else { callback(null, { items: [{ ratingKey: 'ep-recovered' }], totalSize: 1, nextStart: 1, hasMore: false }); }
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia
  });
  localController.loadPlaylistItems({ ratingKey: '77', containerKey: '/playlists/77/items', serverMachineIdentifier: 'b', sourceId: 'b|9' }, 0, 60, function (error, page) {
    assert.ifError(error);
    result = page;
  });
  assert.deepStrictEqual(attempts, [
    ['https://old-b.example', 'old-b-token'],
    ['https://fresh-b.example', 'fresh-b-token']
  ], 'a secondary content request must retry exactly once when connectivity verification refreshes its route/token');
  assert.strictEqual(result.items[0].serverMachineIdentifier, 'b', 'recovered playlist items must still retain the owning PMS');
  localController.destroy();
}());


(function stalePrimaryRouteRetriesOnceAfterRuntimeFailover() {
  var primaryRoute = { serverMachineIdentifier: 'a', serverName: 'Primary', primary: true, apiBaseUrl: 'https://old-a.example', token: 'a-token' };
  var attempts = [];
  var recoveries = 0;
  var result = null;
  var localSources = {
    resolveServers: function (callback) { callback(null, [primaryRoute]); return request(); },
    primaryContext: function () { return primaryRoute; },
    contextForMachine: function (machine) { return machine === 'a' ? primaryRoute : null; },
    recoverPrimary: function (_error, callback) {
      recoveries += 1;
      primaryRoute = { serverMachineIdentifier: 'a', serverName: 'Primary', primary: true, apiBaseUrl: 'https://fresh-a.example', token: 'a-token' };
      callback(null, primaryRoute);
      return true;
    }
  };
  var localController = Controller.create({
    sources: localSources,
    transport: {
      loadMetadata: function (config, ratingKey, callback) {
        var connectivityError;
        attempts.push(config.apiBaseUrl);
        if (config.apiBaseUrl === 'https://old-a.example') {
          connectivityError = new Error('Plex request failed');
          connectivityError.transportFailure = true;
          callback(connectivityError);
        } else { callback(null, { ratingKey: ratingKey, title: 'Recovered primary metadata' }); }
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia
  });
  localController.loadMetadata({ ratingKey: 'primary-item', serverMachineIdentifier: 'a' }, function (error, detail) {
    assert.ifError(error);
    result = detail;
  });
  assert.deepStrictEqual(attempts, ['https://old-a.example', 'https://fresh-a.example'],
    'a primary content request must retry once on the newly promoted route after a transport failure');
  assert.strictEqual(recoveries, 1, 'a primary transport failure must invoke runtime failover exactly once');
  assert.strictEqual(result.title, 'Recovered primary metadata');
  localController.destroy();
}());

(function logicalPrimaryContentErrorDoesNotTriggerRouteFailover() {
  var recoveries = 0;
  var logicalError = null;
  var localSources = {
    resolveServers: function (callback) { callback(null, [servers[0]]); return request(); },
    primaryContext: function () { return servers[0]; },
    contextForMachine: function (machine) { return machine === 'a' ? servers[0] : null; },
    recoverPrimary: function (_error, callback) { recoveries += 1; callback(null, servers[0]); return true; }
  };
  var localController = Controller.create({
    sources: localSources,
    transport: {
      loadMetadata: function (_config, _ratingKey, callback) {
        callback(new Error('Plex request failed with status 404'));
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia
  });
  localController.loadMetadata({ ratingKey: 'missing-primary-item', serverMachineIdentifier: 'a' }, function (error) { logicalError = error; });
  assert.ok(logicalError, 'the original logical content error must still reach the caller');
  assert.strictEqual(recoveries, 0, 'HTTP/content errors must not poison the active primary route or trigger failover');
  localController.destroy();
}());

(function primaryHomeRetriesOnPromotedRuntimeRoute() {
  var primaryRoute = { serverMachineIdentifier: 'a', serverName: 'Primary', primary: true, apiBaseUrl: 'https://old-home-a.example', token: 'a-token' };
  var attempts = [];
  var recoveries = 0;
  var rows = null;
  var localSources = {
    resolveServers: function (callback) { callback(null, [primaryRoute]); return request(); },
    primaryContext: function () { return primaryRoute; },
    contextForMachine: function (machine) { return machine === 'a' ? primaryRoute : null; },
    recoverPrimary: function (_error, callback) {
      recoveries += 1;
      primaryRoute = { serverMachineIdentifier: 'a', serverName: 'Primary', primary: true, apiBaseUrl: 'https://fresh-home-a.example', token: 'a-token' };
      callback(null, primaryRoute);
      return true;
    }
  };
  var localController = Controller.create({
    sources: localSources,
    transport: {
      loadHome: function (config, callback) {
        var connectivityError;
        attempts.push(config.apiBaseUrl);
        if (config.apiBaseUrl === 'https://old-home-a.example') {
          connectivityError = new Error('Plex request timed out');
          connectivityError.transportFailure = true;
          callback(connectivityError);
        } else { callback(null, [{ kind: 'recommended', items: [{ ratingKey: 'fresh', title: 'Fresh primary Home' }] }]); }
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia
  });
  localController.loadHome(function (error, value) { assert.ifError(error); rows = value; });
  assert.deepStrictEqual(attempts, ['https://old-home-a.example', 'https://fresh-home-a.example'],
    'primary Home must recover through the same runtime failover path as other primary content');
  assert.strictEqual(recoveries, 1);
  assert.strictEqual(rows[0].items[0].title, 'Fresh primary Home');
  localController.destroy();
}());

(function explicitOwnerRejectsMismatchedCandidateContext() {
  var PlexSourceRouter = require('../app/coordinator/plex-source-router');
  var metadataCalls = 0;
  var metadataError = null;
  var isolatedSources = {
    resolveServers: function (callback) { callback(null, []); return request(); },
    primaryContext: function () { return servers[0]; },
    contextForMachine: function () { return null; }
  };
  var sourceRouter = PlexSourceRouter.create({ config: { apiBaseUrl: 'https://a.example', token: 'a-token' }, sources: isolatedSources });
  var localController = Controller.create({
    sources: isolatedSources,
    sourceRouter: sourceRouter,
    transport: { loadMetadata: function () { metadataCalls += 1; return request(); } },
    MultiServerMedia: MultiServerMedia,
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' }
  });
  localController.loadMetadata({ ratingKey: 'same-key', serverMachineIdentifier: 'b' }, function (error) {
    metadataError = error;
  }, { serverMachineIdentifier: 'a', apiBaseUrl: 'https://a.example', token: 'a-token' });
  assert.ok(metadataError, 'an explicit media owner with no matching route must fail closed');
  assert.strictEqual(metadataCalls, 0, 'a mismatched candidate must never issue metadata against the primary PMS');
  localController.destroy();
}());


(function disabledServerIsExcludedFromHomeRows() {
  var visible = { a: true, b: false };
  var localSources = {
    resolveServers: function (callback) { callback(null, servers); return request(); },
    primaryContext: function () { return servers[0]; },
    contextForMachine: sources.contextForMachine,
    sources: sources.sources,
    displayTitle: sources.displayTitle,
    displayLibraryName: function (sourceId) { return sourceId === 'b|9' ? 'Anime' : 'Film'; },
    aggregateHomeLibraries: function () { return false; },
    serverEnabled: function (machineIdentifier) { return visible[String(machineIdentifier || '')] !== false; }
  };
  var localController = Controller.create({ sources: localSources, transport: transport, MultiServerMedia: MultiServerMedia, config: { itemLimit: 12 } });
  var rows = null;
  localController.loadHome(function (error, value) { assert.ifError(error); rows = value; });
  localController.refreshExternalHome(function (error, value) { assert.ifError(error); rows = value; });
  assert.strictEqual(rows.some(function (row) { return row.items.some(function (item) { return item.serverMachineIdentifier === 'b'; }); }), false,
    'disabling a server must remove its content from merged Home rows such as Recommended and Continue Watching');
  assert.strictEqual(rows.some(function (row) { return row.kind === 'recent' && row.serverMachineIdentifier === 'b'; }), false,
    'disabling a server must remove all of its Recently Added library rows from Home');
  localController.destroy();
}());

(function unavailableServerIsRemovedFromAlreadyEnrichedHomeWithoutReloadingPrimary() {
  var publications = [];
  var available = true;
  var localSources = {
    resolveServers: sources.resolveServers,
    primaryContext: sources.primaryContext,
    contextForMachine: sources.contextForMachine,
    sources: sources.sources,
    displayTitle: sources.displayTitle,
    displayLibraryName: function (sourceId) { return sourceId === 'b|9' ? 'Anime' : 'Film'; },
    aggregateHomeLibraries: function () { return false; },
    serverAvailable: function (machine) { return machine !== 'b' || available; },
    serverEnabled: function () { return true; }
  };
  var localController = Controller.create({
    sources: localSources,
    transport: { loadHome: transport.loadHome },
    MultiServerMedia: MultiServerMedia,
    onHomeEnriched: function (rows) { publications.push(rows); },
    config: { itemLimit: 12 }
  });
  localController.loadHome(function (error) { assert.ifError(error); });
  localController.refreshExternalHome(function (error) { assert.ifError(error); });
  assert.strictEqual(typeof localController.removeHomeSource, 'function',
    'multi-server Home must expose targeted eviction when a secondary PMS goes offline');
  available = false;
  localController.removeHomeSource('b');
  assert.ok(publications.length > 0, 'targeted PMS eviction must republish the retained Home model');
  var offlineRows = publications[publications.length - 1];
  assert.ok(offlineRows.some(function (row) {
    return row.items.some(function (item) { return item.serverMachineIdentifier === 'b' && item.unavailable; });
  }), 'offline-only items remain visible but unavailable');
  assert.ok(offlineRows.some(function (row) {
    return row.items.some(function (item) { return item.sourceVariants && item.sourceVariants.length > 1 && !item.unavailable; });
  }), 'a surviving alternate copy keeps the item available');
  available = true;
  localController.recomposeHome();
  assert.ok(publications[publications.length - 1].every(function (row) {
    return row.items.every(function (item) { return !item.unavailable; });
  }), 'recovery clears unavailable markers');
  localController.destroy();
}());

(function unavailableServerCannotRepublishLateTargetedHomeResult() {
  var sourceRows = [{ id: 'a|1', serverMachineIdentifier: 'a', sectionKey: '1' }];
  var available = { a: true, b: true };
  var secondaryCallback = null;
  var publications = [];
  var localController = Controller.create({
    sources: {
      resolveServers: function (callback) { callback(null, [servers[0]]); return request(); },
      primaryContext: function () { return servers[0]; },
      contextForMachine: function (machine) { return machine === 'a' ? servers[0] : (machine === 'b' ? servers[1] : null); },
      sources: function () { return sourceRows.slice(); },
      serverAvailable: function (machine) { return available[String(machine || '')] !== false; },
      resolveSource: function (_sourceId, callback) { callback(null, servers[1]); return request(); }
    },
    transport: {
      loadHome: function (config, callback) {
        if (config.apiBaseUrl === servers[0].apiBaseUrl) {
          callback(null, [{ kind: 'recommended', items: [{ ratingKey: 'primary', title: 'Primary' }] }]);
        } else { secondaryCallback = callback; }
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia,
    onHomeEnriched: function (rows) { publications.push(rows); },
    config: { itemLimit: 12 }
  });
  localController.loadHome(function (error) { assert.ifError(error); });
  sourceRows.push({ id: 'b|9', serverMachineIdentifier: 'b', sectionKey: '9' });
  localController.refreshHomeSource('b');
  assert.strictEqual(typeof secondaryCallback, 'function', 'precondition: targeted Home enrichment must be in flight');
  available.b = false;
  localController.removeHomeSource('b');
  available.b = true;
  secondaryCallback(null, [{ kind: 'continue', items: [{ ratingKey: 'late-b', title: 'Late B', lastViewedAt: 40 }] }]);
  assert.strictEqual(publications.some(function (rows) {
    return rows.some(function (row) {
      return (row.items || []).some(function (item) { return item.serverMachineIdentifier === 'b'; });
    });
  }), false, 'a pre-loss targeted Home callback must stay invalid even if the PMS recovered before that stale callback arrives');
  localController.destroy();
}());


(function disabledServerIsExcludedFromGlobalFanOut() {
  var visible = { a: true, b: false };
  var searchCalls = [];
  var localSources = {
    resolveServers: function (callback) { callback(null, servers); return request(); },
    primaryContext: function () { return servers[0]; },
    contextForMachine: sources.contextForMachine,
    serverEnabled: function (machineIdentifier) { return visible[String(machineIdentifier || '')] !== false; }
  };
  var localController = Controller.create({
    sources: localSources,
    transport: {
      search: function (config, _query, _libraries, callback) {
        searchCalls.push(config.apiBaseUrl);
        callback(null, [{ ratingKey: 'x', title: config.apiBaseUrl }]);
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia,
    config: { searchItemLimit: 60 }
  });
  var items = null;
  localController.search('test', function (error, value) { assert.ifError(error); items = value; });
  assert.deepStrictEqual(searchCalls, ['https://a.example'], 'global search must not query disabled servers');
  assert.strictEqual(items.length, 1, 'disabled-server search results must never reach the merged result');
  localController.destroy();
}());


(function serverVisibilityResetDropsCachedExternalHomeRows() {
  var enabled = { a: true, b: true };
  var localSources = {
    resolveServers: function (callback) { callback(null, servers); return request(); },
    primaryContext: function () { return servers[0]; },
    contextForMachine: sources.contextForMachine,
    sources: sources.sources,
    serverEnabled: function (machine) { return enabled[String(machine || '')] !== false; }
  };
  var localController = Controller.create({
    sources: localSources,
    transport: { loadHome: transport.loadHome },
    MultiServerMedia: MultiServerMedia,
    config: { itemLimit: 12 }
  });
  var rows = [];
  localController.loadHome(function (error) { assert.ifError(error); });
  localController.refreshExternalHome(function (error, value) { assert.ifError(error); rows = value; });
  assert.ok(rows.some(function (row) { return (row.items || []).some(function (item) { return item.serverMachineIdentifier === 'b'; }); }),
    'precondition: external Home enrichment must cache shared-server rows');
  assert.strictEqual(typeof localController.resetSources, 'function',
    'multi-server content must expose source-state invalidation for server enable/disable lifecycle');
  enabled.b = false;
  localController.resetSources();
  enabled.b = true;
  localController.loadHome(function (error, value) { assert.ifError(error); rows = value; });
  assert.strictEqual(rows.some(function (row) { return (row.items || []).some(function (item) { return item.serverMachineIdentifier === 'b'; }); }), false,
    'reenabling a server must not republish stale cached Home rows before fresh external enrichment');
  localController.destroy();
}());

console.log('Multi-server content controller checks passed');

(function silentExternalServerCannotBlockSearch() {
  var timers = [];
  var late;
  var results;
  var notifications = 0;
  var external = request();
  var local = Controller.create({
    sources: sources,
    clock: { setTimeout: function (callback) { timers.push(callback); return timers.length; }, clearTimeout: function () {} },
    transport: { search: function (config, _query, _libraries, callback) {
      if (config.apiBaseUrl === servers[0].apiBaseUrl) { callback(null, [{ ratingKey: 'local', title: 'Local' }]); return request(); }
      late = callback;
      return external;
    } }
  });
  local.search('test', function (error, items) { assert.ifError(error); notifications += 1; results = items; });
  timers.forEach(function (callback) { callback(); });
  assert.strictEqual(results.length, 1, 'healthy server results must survive an external timeout');
  assert.strictEqual(external.aborted, true);
  late(null, [{ ratingKey: 'late' }]);
  assert.strictEqual(notifications, 1, 'late response must not republish or corrupt results');
  local.destroy();
}());

(function fastSecondaryHomeWaitsForFirstPrimaryPresentation() {
  var primaryCallback = null;
  var initialRows = null;
  var publications = [];
  var localController = Controller.create({
    sources: {
      primaryContext: function () { return servers[0]; },
      resolveServers: function (callback) { callback(null, servers); return request(); },
      contextForMachine: sources.contextForMachine,
      sources: function () { return []; }
    },
    transport: {
      loadHome: function (config, callback) {
        if (config.apiBaseUrl.indexOf('a.example') !== -1) { primaryCallback = callback; }
        else { callback(null, [{ kind: 'continue', items: [{ ratingKey: 's-fast', title: 'Shared fast', lastViewedAt: 20 }] }]); }
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia,
    onHomeEnriched: function (rows) { publications.push(rows); },
    config: { itemLimit: 12 }
  });
  localController.loadHome(function (error, rows) { assert.ifError(error); initialRows = rows; });
  assert.strictEqual(publications.length, 0, 'a secondary PMS that responds first must not publish Home before the primary PMS');
  assert.strictEqual(initialRows, null, 'the foreground Home callback must still wait for the primary PMS');
  primaryCallback(null, [{ kind: 'continue', items: [{ ratingKey: 'p-slow', title: 'Primary slow', lastViewedAt: 10 }] }]);
  assert.deepStrictEqual(initialRows[0].items.map(function (item) { return item.title; }), ['Primary slow'],
    'the first Home presentation must contain the primary PMS before external enrichment is applied');
  assert.strictEqual(publications.length, 1, 'already-ready external Home content must publish immediately after the first primary presentation');
  assert.deepStrictEqual(publications[0][0].items.map(function (item) { return item.title; }), ['Shared fast', 'Primary slow'],
    'the deferred enrichment must retain the secondary result that completed before the primary PMS');
  localController.destroy();
}());

(function unavailablePrimaryFallsBackToFirstReadySecondaryHome() {
  var primaryCallback = null;
  var secondaryCallback = null;
  var initialError = null;
  var initialRows = null;
  var callbackCount = 0;
  var degradedCount = 0;
  var localController = Controller.create({
    sources: {
      primaryContext: function () { return servers[0]; },
      resolveServers: function (callback) { callback(null, servers); return request(); },
      contextForMachine: sources.contextForMachine,
      sources: function () { return [{ id: 'b|9', serverMachineIdentifier: 'b' }]; },
      resolveSource: function (_sourceId, callback) { callback(null, servers[1]); return request(); }
    },
    transport: {
      loadHome: function (config, callback) {
        if (config.apiBaseUrl.indexOf('a.example') !== -1) { primaryCallback = callback; }
        else { secondaryCallback = callback; }
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia,
    onHomeEnriched: function () {},
    onPrimaryHomeUnavailable: function () { degradedCount += 1; },
    config: { itemLimit: 12, discoveryTimeout: 1800 }
  });
  localController.loadHome(function (error, rows) {
    callbackCount += 1;
    initialError = error || null;
    initialRows = rows || null;
  });
  primaryCallback(new Error('primary offline'));
  assert.strictEqual(callbackCount, 0,
    'a failed primary PMS must not fail Home while a concurrently-started secondary Home can still provide fallback content');
  secondaryCallback(null, [{ kind: 'continue', items: [{ ratingKey: 's-fallback', title: 'Shared fallback', lastViewedAt: 20 }] }]);
  assert.strictEqual(callbackCount, 1, 'the first successful secondary PMS must settle the pending Home exactly once');
  assert.strictEqual(initialError, null, 'a usable secondary Home must hide the failed primary request from the Home surface');
  assert.deepStrictEqual(initialRows[0].items.map(function (item) { return item.title; }), ['Shared fallback'],
    'secondary Home content must become the initial fallback when the primary PMS is unavailable');
  assert.strictEqual(degradedCount, 1, 'a secondary-only Home must report the degraded primary state exactly once');
  localController.destroy();
}());

(function unavailablePrimaryWaitsForSecondaryHomeOnlyWithinDiscoveryGrace() {
  var primaryCallback = null;
  var callbackCount = 0;
  var initialError = null;
  var timers = [];
  var localController = Controller.create({
    sources: {
      primaryContext: function () { return servers[0]; },
      resolveServers: function (callback) { callback(null, servers); return request(); },
      contextForMachine: sources.contextForMachine,
      sources: function () { return [{ id: 'b|9', serverMachineIdentifier: 'b' }]; },
      resolveSource: function (_sourceId, _callback) { return request(); }
    },
    transport: {
      loadHome: function (config, callback) {
        if (config.apiBaseUrl.indexOf('a.example') !== -1) { primaryCallback = callback; }
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia,
    clock: {
      setTimeout: function (callback, delay) {
        var timer = { callback: callback, delay: delay, active: true };
        timers.push(timer);
        return timer;
      },
      clearTimeout: function (timer) { if (timer) { timer.active = false; } }
    },
    onHomeEnriched: function () {},
    config: { itemLimit: 12, discoveryTimeout: 1800 }
  });
  localController.loadHome(function (error) {
    callbackCount += 1;
    initialError = error || null;
  });
  primaryCallback(new Error('primary offline'));
  assert.strictEqual(callbackCount, 0, 'an immediate primary failure must leave a short grace window for already-started secondary Home requests');
  var grace = timers.filter(function (timer) { return timer.active && timer.delay === 1800; })[0];
  assert.ok(grace, 'primary Home fallback must reuse the configured 1800 ms discovery window instead of waiting for the full content watchdog');
  grace.callback();
  assert.strictEqual(callbackCount, 1, 'Home must stop waiting once the secondary fallback grace expires');
  assert.ok(initialError, 'Home must surface the original primary failure when no secondary Home became available within the grace window');
  localController.destroy();
}());

(function alreadyReadySecondaryHomeStillReportsPrimaryDegradationOnce() {
  var primaryCallbacks = [];
  var degradedCount = 0;
  var results = [];
  var localController = Controller.create({
    sources: {
      primaryContext: function () { return servers[0]; },
      resolveServers: function (callback) { callback(null, servers); return request(); },
      contextForMachine: sources.contextForMachine,
      sources: function () { return [{ id: 'b|9', serverMachineIdentifier: 'b' }]; },
      resolveSource: function (_sourceId, callback) { callback(null, servers[1]); return request(); }
    },
    transport: {
      loadHome: function (config, callback) {
        if (config.apiBaseUrl.indexOf('a.example') !== -1) { primaryCallbacks.push(callback); }
        else { callback(null, [{ kind: 'continue', items: [{ ratingKey: 's-ready', title: 'Shared ready', lastViewedAt: 20 }] }]); }
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia,
    onHomeEnriched: function () {},
    onPrimaryHomeUnavailable: function () { degradedCount += 1; },
    config: { itemLimit: 12, discoveryTimeout: 1800 }
  });
  localController.loadHome(function (error, rows) { assert.ifError(error); results.push(rows); });
  primaryCallbacks.shift()(new Error('primary offline'));
  assert.strictEqual(results.length, 1, 'a secondary Home that completed before the primary failure must become the foreground Home immediately');
  assert.strictEqual(degradedCount, 1, 'an already-ready secondary fallback must still surface the primary outage warning');
  localController.loadHome(function (error, rows) { assert.ifError(error); results.push(rows); });
  primaryCallbacks.shift()(new Error('primary still offline'));
  assert.strictEqual(degradedCount, 1, 'the same continuous primary outage must not reopen the degraded-Home warning on every Home refresh');
  localController.destroy();
}());

(function deferredPrimaryDegradationCanBeReportedOnTheNextVisibleHomeRefresh() {
  var primaryCallbacks = [];
  var degradedCount = 0;
  var localController = Controller.create({
    sources: {
      primaryContext: function () { return servers[0]; },
      resolveServers: function (callback) { callback(null, servers); return request(); },
      contextForMachine: sources.contextForMachine,
      sources: function () { return [{ id: 'b|9', serverMachineIdentifier: 'b' }]; },
      resolveSource: function (_sourceId, callback) { callback(null, servers[1]); return request(); }
    },
    transport: {
      loadHome: function (config, callback) {
        if (config.apiBaseUrl.indexOf('a.example') !== -1) { primaryCallbacks.push(callback); }
        else { callback(null, [{ kind: 'continue', items: [{ ratingKey: 's-ready', title: 'Shared ready', lastViewedAt: 20 }] }]); }
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia,
    onHomeEnriched: function () {},
    onPrimaryHomeUnavailable: function () { degradedCount += 1; return degradedCount > 1; },
    config: { itemLimit: 12, discoveryTimeout: 1800 }
  });
  localController.loadHome(function (error) { assert.ifError(error); });
  primaryCallbacks.shift()(new Error('primary offline'));
  assert.strictEqual(degradedCount, 1, 'a consumer may defer the degraded-primary notification while another surface owns the UI');
  localController.loadHome(function (error) { assert.ifError(error); });
  primaryCallbacks.shift()(new Error('primary still offline'));
  assert.strictEqual(degradedCount, 2, 'a deferred degraded-primary notification must be offered again on the next Home refresh');
  localController.destroy();
}());

(function startupHomeLoadsSharedServersImmediatelyWithoutBlockingPrimary() {
  var externalCalls = 0;
  var externalCallback = null;
  var initialRows = null;
  var enrichedRows = null;
  var localSources = {
    primaryContext: function () { return servers[0]; },
    resolveServers: function (callback) { callback(null, servers); return request(); },
    contextForMachine: sources.contextForMachine,
    sources: sources.sources
  };
  var localTransport = {
    loadHome: function (config, callback) {
      if (config.apiBaseUrl.indexOf('a.example') !== -1) {
        callback(null, [{ kind: 'continue', items: [{ ratingKey: 'p', title: 'Primary', lastViewedAt: 10 }] }]);
      } else {
        externalCalls += 1;
        externalCallback = callback;
      }
      return request();
    }
  };
  var localController = Controller.create({
    sources: localSources,
    transport: localTransport,
    MultiServerMedia: MultiServerMedia,
    onHomeEnriched: function (rows) { enrichedRows = rows; },
    config: { itemLimit: 12 }
  });
  localController.loadHome(function (error, rows) { assert.ifError(error); initialRows = rows; });
  assert.deepStrictEqual(initialRows[0].items.map(function (item) { return item.title; }), ['Primary'],
    'startup-critical Home must complete without waiting for a pending shared PMS');
  assert.strictEqual(externalCalls, 1, 'external PMS Home requests must start concurrently with startup Home');
  assert.strictEqual(enrichedRows, null, 'a pending shared PMS must not publish a loading-only Home state');
  localController.loadHome(function (error) { assert.ifError(error); });
  assert.strictEqual(externalCalls, 1, 'a primary refresh must reuse the running shared enrichment');
  externalCallback(null, [{ kind: 'continue', items: [{ ratingKey: 's', title: 'Shared', lastViewedAt: 20 }] }]);
  assert.deepStrictEqual(enrichedRows[0].items.map(function (item) { return item.title; }), ['Shared', 'Primary'],
    'shared content must merge incrementally as soon as its PMS responds');
  localController.destroy();
}());

(function startupHomePublishesEachSharedServerIndependently() {
  var threeServers = servers.concat([{
    serverMachineIdentifier: 'c', serverName: 'Other', primary: false,
    apiBaseUrl: 'https://c.example', token: 'c-token'
  }]);
  var pending = {};
  var publications = [];
  var localController = Controller.create({
    sources: {
      primaryContext: function () { return threeServers[0]; },
      resolveServers: function (callback) { callback(null, threeServers); return request(); },
      contextForMachine: function (machine) {
        return threeServers.filter(function (server) { return server.serverMachineIdentifier === machine; })[0] || null;
      },
      sources: function () { return []; }
    },
    transport: {
      loadHome: function (config, callback) {
        if (config.apiBaseUrl === threeServers[0].apiBaseUrl) {
          callback(null, [{ kind: 'recommended', items: [{ ratingKey: 'p', title: 'Primary' }] }]);
        } else { pending[config.apiBaseUrl] = callback; }
        return request();
      }
    },
    onHomeEnriched: function (rows) { publications.push(rows); }
  });
  localController.loadHome(function (error) { assert.ifError(error); });
  assert.ok(pending['https://b.example'] && pending['https://c.example'],
    'every external PMS must begin loading without a serial discovery barrier');
  pending['https://c.example'](null, [{ kind: 'continue', items: [{ ratingKey: 'c1', title: 'Other ready' }] }]);
  assert.strictEqual(publications.length, 1, 'one ready external PMS must publish without waiting for another PMS');
  assert.strictEqual(publications[0][0].items[0].title, 'Other ready',
    'incremental Home publication must contain the independently completed PMS');
  localController.destroy();
}());

(function startupHomeResolvesExternalServersProgressivelyAndSkipsDisabledServers() {
  var contexts = {
    a: servers[0],
    b: null,
    c: null
  };
  var pending = {};
  var resolveCalls = [];
  var publications = [];
  var localController = Controller.create({
    sources: {
      primaryContext: function () { return servers[0]; },
      resolveServers: function () { throw new Error('Home must not use the all-server resolution barrier'); },
      contextForMachine: function (machine) { return contexts[machine] || null; },
      resolveSource: function (sourceId, callback) {
        var machine = sourceId.split('|')[0];
        resolveCalls.push(machine);
        pending[machine] = callback;
        return request();
      },
      serverEnabled: function (machine) { return machine !== 'd'; },
      sources: function () { return [
        { id: 'a|1', serverMachineIdentifier: 'a', sectionKey: '1' },
        { id: 'b|2', serverMachineIdentifier: 'b', sectionKey: '2' },
        { id: 'c|3', serverMachineIdentifier: 'c', sectionKey: '3' },
        { id: 'd|4', serverMachineIdentifier: 'd', sectionKey: '4' }
      ]; }
    },
    transport: {
      loadHome: function (config, callback) {
        if (config.apiBaseUrl === servers[0].apiBaseUrl) {
          callback(null, [{ kind: 'recommended', items: [{ ratingKey: 'p', title: 'Primary' }] }]);
        } else {
          callback(null, [{ kind: 'continue', items: [{ ratingKey: config.apiBaseUrl, title: config.apiBaseUrl }] }]);
        }
        return request();
      }
    },
    onHomeEnriched: function (rows) { publications.push(rows); }
  });
  localController.loadHome(function (error) { assert.ifError(error); });
  assert.deepStrictEqual(resolveCalls.sort(), ['b', 'c'], 'Home must resolve every enabled external PMS independently and skip disabled PMSes');
  pending.c(null, { serverMachineIdentifier: 'c', serverName: 'Fast', primary: false, apiBaseUrl: 'https://c.example', token: 'c-token' });
  assert.strictEqual(publications.length, 1, 'a fast PMS must enrich Home while another PMS resolution remains pending');
  assert.strictEqual(publications[0][0].items[0].title, 'https://c.example');
  localController.destroy();
}());

(function recoveredSourceForcesImmediateHomeEnrichment() {
  var timers = {};
  var nextTimer = 1;
  var externalCalls = 0;
  var enrichedRows = null;
  var localController = Controller.create({
    sources: {
      primaryContext: function () { return servers[0]; },
      resolveServers: function (callback) { callback(null, servers); return request(); },
      contextForMachine: sources.contextForMachine,
      sources: sources.sources
    },
    transport: {
      loadHome: function (config, callback) {
        if (config.apiBaseUrl.indexOf('a.example') !== -1) {
          callback(null, [{ kind: 'recommended', items: [{ ratingKey: 'p', title: 'Primary' }] }]);
        } else {
          externalCalls += 1;
          callback(null, [{ kind: 'continue', items: [{ ratingKey: 's', title: 'Recovered', lastViewedAt: 20 }] }]);
        }
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia,
    clock: {
      setTimeout: function (callback, delay) {
        var id = nextTimer;
        nextTimer += 1;
        timers[id] = { callback: callback, delay: delay };
        return id;
      },
      clearTimeout: function (id) { delete timers[id]; }
    },
    homeEnrichmentDelay: 350,
    onHomeEnriched: function (rows) { enrichedRows = rows; },
    config: { itemLimit: 12 }
  });
  localController.loadHome(function (error) { assert.ifError(error); });
  assert.strictEqual(externalCalls, 1, 'startup must begin secondary Home enrichment immediately');
  assert.strictEqual(Object.keys(timers).length, 0, 'startup enrichment must not depend on a delayed timer');
  assert.strictEqual(typeof localController.refreshHomeEnrichment, 'function', 'multi-server Home must expose an immediate enrichment refresh for source recovery');
  localController.refreshHomeEnrichment();
  assert.strictEqual(Object.keys(timers).length, 0, 'source recovery must cancel the stale lazy enrichment timer');
  assert.strictEqual(externalCalls, 2, 'source recovery must request fresh secondary Home content immediately');
  assert.strictEqual(enrichedRows[0].kind, 'continue', 'immediate recovery enrichment must publish newly available Continue Watching content');
  localController.destroy();
}());

(function recoveredSourceReplacesStaleRunningEnrichment() {
  var timer = null;
  var externalCalls = 0;
  var pending = [];
  var requests = [];
  var localController = Controller.create({
    sources: {
      primaryContext: function () { return servers[0]; },
      resolveServers: function (callback) { callback(null, servers); return request(); },
      contextForMachine: sources.contextForMachine,
      sources: sources.sources
    },
    transport: {
      loadHome: function (config, callback) {
        var handle;
        if (config.apiBaseUrl.indexOf('a.example') !== -1) {
          callback(null, [{ kind: 'recommended', items: [{ ratingKey: 'p' }] }]);
          return request();
        }
        externalCalls += 1;
        pending.push(callback);
        handle = request();
        requests.push(handle);
        return handle;
      }
    },
    MultiServerMedia: MultiServerMedia,
    clock: {
      setTimeout: function (callback) { timer = callback; return 1; },
      clearTimeout: function () { timer = null; }
    },
    onHomeEnriched: function () {},
    config: { itemLimit: 12 }
  });
  localController.loadHome(function (error) { assert.ifError(error); });
  var start = timer;
  timer = null;
  start();
  assert.strictEqual(externalCalls, 1, 'lazy enrichment must have one secondary request in flight');
  localController.refreshHomeEnrichment();
  assert.strictEqual(requests[0].aborted, true, 'source recovery must cancel stale in-flight enrichment');
  assert.strictEqual(externalCalls, 2, 'source recovery must start a fresh secondary Home request immediately');
  localController.destroy();
}());

(function newlyDiscoveredSourceDoesNotRestartRunningEnrichment() {
  var localServers = {
    a: { serverMachineIdentifier: 'a', serverName: 'Primary', primary: true, apiBaseUrl: 'https://a.example', token: 'a-token' },
    b: { serverMachineIdentifier: 'b', serverName: 'Shared B', primary: false, apiBaseUrl: 'https://b.example', token: 'b-token' },
    c: { serverMachineIdentifier: 'c', serverName: 'Shared C', primary: false, apiBaseUrl: 'https://c.example', token: 'c-token' }
  };
  var sourceRows = [
    { id: 'a|1', serverMachineIdentifier: 'a', sectionKey: '1' },
    { id: 'b|2', serverMachineIdentifier: 'b', sectionKey: '2' }
  ];
  var bRequest = request();
  var bCallback = null;
  var bCalls = 0;
  var cCalls = 0;
  var publications = [];
  var localController = Controller.create({
    sources: {
      primaryContext: function () { return localServers.a; },
      resolveServers: function (callback) { callback(null, [localServers.a, localServers.b, localServers.c]); return request(); },
      contextForMachine: function (machine) { return localServers[machine] || null; },
      sources: function () { return sourceRows.slice(); },
      resolveSource: function (sourceId, callback) {
        var machine = String(sourceId || '').split('|')[0];
        callback(null, localServers[machine] || null);
        return request();
      }
    },
    transport: {
      loadHome: function (config, callback) {
        if (config.apiBaseUrl === localServers.a.apiBaseUrl) {
          callback(null, [{ kind: 'recommended', items: [{ ratingKey: 'primary', title: 'Primary' }] }]);
          return request();
        }
        if (config.apiBaseUrl === localServers.b.apiBaseUrl) {
          bCalls += 1;
          bCallback = callback;
          return bRequest;
        }
        cCalls += 1;
        callback(null, [{ kind: 'continue', items: [{ ratingKey: 'c', title: 'C', lastViewedAt: 30 }] }]);
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia,
    onHomeEnriched: function (rows) { publications.push(rows); },
    config: { itemLimit: 12 }
  });
  localController.loadHome(function (error) { assert.ifError(error); });
  assert.strictEqual(bCalls, 1, 'the first discovered secondary PMS must already be enriching Home');
  sourceRows.push({ id: 'c|3', serverMachineIdentifier: 'c', sectionKey: '3' });
  assert.strictEqual(typeof localController.refreshHomeSource, 'function',
    'progressive discovery must expose a per-PMS Home enrichment path');
  localController.refreshHomeSource('c');
  assert.strictEqual(bRequest.aborted, false,
    'discovering another PMS must not abort Home enrichment already in flight for an earlier PMS');
  assert.strictEqual(bCalls, 1, 'the earlier PMS must not be restarted when a later PMS becomes available');
  assert.strictEqual(cCalls, 1, 'the newly discovered PMS must start enriching Home immediately and independently');
  bCallback(null, [{ kind: 'continue', items: [{ ratingKey: 'b', title: 'B', lastViewedAt: 20 }] }]);
  assert.ok(publications[publications.length - 1][0].items.some(function (item) { return item.title === 'C'; }),
    'completion of the older enrichment batch must not discard a later PMS that already joined Home');
  localController.destroy();
}());

(function externalHomeCancellationOwnsTransport() {
  var pending;
  var externalRequest = request();
  var callbacks = 0;
  var localController = Controller.create({
    sources: sources,
    transport: { loadHome: function (_config, callback) { pending = callback; return externalRequest; } }
  });
  var operation = localController.refreshExternalHome(function () { callbacks += 1; });
  operation.abort();
  assert.strictEqual(externalRequest.aborted, true, 'cancel must abort the actual external Home request after discovery');
  pending(null, []);
  assert.strictEqual(callbacks, 0, 'cancelled Home work must not publish stale results');
  localController.destroy();
}());

(function primaryRefreshReusesRunningEnrichment() {
  var externalCalls = 0;
  var externalRequest = request();
  var localController = Controller.create({
    sources: sources,
    onHomeEnriched: function () {},
    transport: { loadHome: function (config, callback) {
      if (config.apiBaseUrl === servers[0].apiBaseUrl) {
        callback(null, [{ kind: 'continue', items: [{ ratingKey: 'p' }] }]);
        return request();
      }
      externalCalls += 1;
      return externalRequest;
    } }
  });
  localController.loadHome(function (error) { assert.ifError(error); });
  localController.loadHome(function (error) { assert.ifError(error); });
  assert.strictEqual(externalCalls, 1, 'primary refresh must retain the existing immediate enrichment request');
  assert.strictEqual(externalCalls, 1);
  assert.strictEqual(externalRequest.aborted, false);
  localController.destroy();
  assert.strictEqual(externalRequest.aborted, true, 'teardown must cancel retained in-flight enrichment');
}());

(function homeEnrichmentWaitsWhenHomeCannotAcceptResults() {
  var active = false;
  var externalCalls = 0;
  var localController = Controller.create({
    sources: {
      primaryContext: function () { return servers[0]; },
      resolveServers: function (callback) { callback(null, servers); return request(); },
      contextForMachine: sources.contextForMachine,
      sources: sources.sources
    },
    transport: {
      loadHome: function (config, callback) {
        if (config.apiBaseUrl.indexOf('b.example') !== -1) { externalCalls += 1; }
        callback(null, [{ kind: 'continue', items: [{ ratingKey: 'x', title: 'X' }] }]);
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia,
    canEnrichHome: function () { return active; },
    onHomeEnriched: function () {},
    config: { itemLimit: 12 }
  });
  localController.loadHome(function (error) { assert.ifError(error); });
  assert.strictEqual(externalCalls, 0, 'external Home work must not start while its results cannot be presented');
  active = true;
  localController.resumeHomeEnrichment();
  assert.strictEqual(externalCalls, 1, 'pending external Home work must start immediately when Home can accept results');
  localController.destroy();
}());

(function sourceRecoveryRemainsPendingUntilHomeCanAcceptEnrichment() {
  var active = false;
  var externalCalls = 0;
  var enriched = 0;
  var localController = Controller.create({
    sources: {
      primaryContext: function () { return servers[0]; },
      resolveServers: function (callback) { callback(null, servers); return request(); },
      contextForMachine: sources.contextForMachine,
      sources: sources.sources
    },
    transport: {
      loadHome: function (config, callback) {
        if (config.apiBaseUrl.indexOf('b.example') !== -1) { externalCalls += 1; }
        callback(null, [{ kind: 'continue', items: [{ ratingKey: 'x', title: 'X' }] }]);
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia,
    canEnrichHome: function () { return active; },
    onHomeEnriched: function () { enriched += 1; },
    config: { itemLimit: 12 }
  });
  localController.loadHome(function (error) { assert.ifError(error); });
  assert.strictEqual(externalCalls, 0, 'the inactive Home must establish the primary row without starting external enrichment');
  assert.strictEqual(localController.refreshHomeEnrichment(), true,
    'source recovery must retain an enrichment request while Home is not active yet');
  assert.strictEqual(externalCalls, 0, 'pending startup recovery must not fetch Home before it can be applied');
  active = true;
  assert.strictEqual(localController.resumeHomeEnrichment(), true,
    'entering Home must consume the retained source recovery immediately');
  assert.strictEqual(externalCalls, 1, 'retained recovery must not wait for the periodic Home poll');
  assert.strictEqual(enriched, 1, 'retained recovery must publish the merged Home exactly once');
  assert.strictEqual(localController.resumeHomeEnrichment(), false,
    'the consumed recovery must not repeat on later Home entry calls');
  localController.destroy();
}());

(function externalHomeRefreshUsesAlreadyVerifiedSourcesWithoutDiscoveryBarrier() {
  var modes = [];
  var localController = Controller.create({
    sources: {
      primaryContext: function () { return servers[0]; },
      resolveServers: function (callback, useAvailable) {
        modes.push(useAvailable === true);
        callback(null, servers);
        return request();
      },
      contextForMachine: sources.contextForMachine,
      sources: sources.sources
    },
    transport: {
      loadHome: function (_config, callback) { callback(null, []); return request(); }
    },
    MultiServerMedia: MultiServerMedia,
    config: { itemLimit: 12 }
  });
  localController.refreshExternalHome(function (error) { assert.ifError(error); });
  assert.deepStrictEqual(modes, [true],
    'source recovery Home refresh must use verified sources immediately instead of waiting for account discovery timeouts');
  localController.destroy();
}());

(function virtualLibraryPageMergesAndDeduplicatesMemberSources() {
  var memberSources = {
    'a|1': { id: 'a|1', serverMachineIdentifier: 'a', serverName: 'Primary', primary: true, sectionKey: '1', sectionTitle: 'Film', sectionType: 'movie' },
    'b|9': { id: 'b|9', serverMachineIdentifier: 'b', serverName: 'Shared', primary: false, sectionKey: '9', sectionTitle: 'Film', sectionType: 'movie' }
  };
  var localSources = {
    resolveServers: function (callback) { callback(null, servers); return request(); },
    primaryContext: function () { return servers[0]; },
    contextForMachine: sources.contextForMachine,
    sources: function () { return [memberSources['a|1'], memberSources['b|9']]; },
    source: function (sourceId) { return memberSources[sourceId] || null; },
    resolveSource: function (sourceId, callback) {
      callback(null, sourceId === 'a|1'
        ? { sourceId: sourceId, serverMachineIdentifier: 'a', serverName: 'Primary', primary: true, apiBaseUrl: 'https://a.example', token: 'a-token' }
        : { sourceId: sourceId, serverMachineIdentifier: 'b', serverName: 'Shared', primary: false, apiBaseUrl: 'https://b.example', token: 'b-token' });
      return request();
    }
  };
  var pageCalls = [];
  var localController = Controller.create({
    sources: localSources,
    transport: {
      loadLibraryPage: function (config, library, _view, _query, start, size, callback) {
        pageCalls.push([config.apiBaseUrl, library.key, start, size]);
        var primary = config.apiBaseUrl.indexOf('a.example') !== -1;
        var all = primary
          ? [
            { ratingKey: 'a1', guid: 'plex://movie/alpha', title: 'Alpha', titleSort: 'Alpha', librarySectionID: '1' },
            { ratingKey: 'a2', guid: 'plex://movie/same', title: 'Same primary', titleSort: 'Same', librarySectionID: '1' }
          ]
          : [
            { ratingKey: 'b1', guid: 'plex://movie/beta', title: 'Beta', titleSort: 'Beta', librarySectionID: '9' },
            { ratingKey: 'b2', guid: 'plex://movie/same', title: 'Same shared', titleSort: 'Same', librarySectionID: '9' }
          ];
        var items = all.slice(start, start + size);
        callback(null, { items: items, totalSize: all.length, nextStart: start + items.length, hasMore: start + items.length < all.length });
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia,
    config: { itemLimit: 12 }
  });
  var result = null;
  localController.loadVirtualLibraryPage({ sourceId: 'virtual|movie|film', key: 'virtual|movie|film', type: 'movie', virtualLibrary: true, memberSourceIds: ['a|1', 'b|9'] }, 'catalog', { sort: 'titleSort', direction: 'asc' }, 0, 10, function (error, page) {
    assert.ifError(error);
    result = page;
  });
  assert.deepStrictEqual(result.items.map(function (item) { return item.guid; }), ['plex://movie/alpha', 'plex://movie/beta', 'plex://movie/same']);
  assert.strictEqual(result.items[2].serverMachineIdentifier, 'a', 'primary duplicate must remain the default canonical source');
  assert.strictEqual(result.items[2].sourceVariants.length, 2, 'deduplicated virtual items must retain all source variants');
  assert.strictEqual(result.hasMore, false);
  assert.strictEqual(pageCalls.length, 2, 'virtual browse must query only the member libraries lazily when opened');
  localController.destroy();
}());

(function virtualPageSessionChangesWhenMemberSourcesChange() {
  var memberSources = {
    'a|1': { id: 'a|1', serverMachineIdentifier: 'a', sectionKey: '1', sectionTitle: 'Film', sectionType: 'movie' },
    'b|9': { id: 'b|9', serverMachineIdentifier: 'b', sectionKey: '9', sectionTitle: 'Film', sectionType: 'movie' }
  };
  var pageCalls = [];
  var localController = Controller.create({
    sources: {
      resolveServers: function (callback) { callback(null, servers); return request(); },
      source: function (sourceId) { return memberSources[sourceId] || null; },
      resolveSource: function (sourceId, callback) {
        callback(null, { sourceId: sourceId, serverMachineIdentifier: sourceId === 'a|1' ? 'a' : 'b',
          apiBaseUrl: sourceId === 'a|1' ? 'https://a.example' : 'https://b.example', token: 'example-token' });
        return request();
      }
    },
    transport: {
      loadLibraryPage: function (config, library, _view, _query, start, size, callback) {
        var items = library.key === '1'
          ? [{ ratingKey: 'a1', guid: 'plex://movie/alpha', title: 'Alpha', titleSort: 'Alpha' }]
          : [{ ratingKey: 'b1', guid: 'plex://movie/bravo', title: 'Bravo', titleSort: 'Bravo' }];
        var page = items.slice(start, start + size);
        pageCalls.push(config.apiBaseUrl);
        callback(null, { items: page, nextStart: start + page.length, hasMore: false });
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia,
    config: { itemLimit: 12 }
  });
  var library = { sourceId: 'virtual|movie|film', key: 'virtual|movie|film', type: 'movie', virtualLibrary: true, memberSourceIds: ['a|1'] };
  var nextPage = null;
  localController.loadVirtualLibraryPage(library, 'catalog', {}, 0, 1, function (error) { assert.ifError(error); });
  library.memberSourceIds = ['a|1', 'b|9'];
  localController.loadVirtualLibraryPage(library, 'catalog', {}, 1, 1, function (error, page) { assert.ifError(error); nextPage = page; });
  assert.deepStrictEqual(nextPage.items.map(function (item) { return item.title; }), ['Bravo'],
    'continuing an aggregate after its member list changes must use a new session containing the new source');
  assert.deepStrictEqual(pageCalls, ['https://a.example', 'https://a.example', 'https://b.example'],
    'changed virtual membership must rebuild the member cursors instead of continuing the old session');
  localController.destroy();
}());

(function virtualLibraryPageWaitsForEveryMemberAfterOneFails() {
  [true, false].forEach(function (failureFirst) {
    var memberSources = {
      'a|1': { id: 'a|1', serverMachineIdentifier: 'a', sectionKey: '1', sectionType: 'movie' },
      'b|9': { id: 'b|9', serverMachineIdentifier: 'b', sectionKey: '9', sectionType: 'movie' }
    };
    var pending = [];
    var progress = 0;
    var completed = 0;
    var result = null;
    var localController = Controller.create({
      sources: {
        resolveServers: function (callback) { callback(null, servers); return request(); },
        source: function (sourceId) { return memberSources[sourceId] || null; },
        resolveSource: function (sourceId, callback) {
          callback(null, sourceId === 'a|1' ? servers[0] : servers[1]);
          return request();
        }
      },
      transport: {
        loadLibraryPage: function (config, _library, _view, _query, start, _size, callback) {
          pending.push({ server: config.apiBaseUrl, start: start, callback: callback });
          return request();
        }
      },
      MultiServerMedia: MultiServerMedia
    });
    localController.loadVirtualLibraryPage({
      sourceId: 'virtual|movie|film', key: 'virtual|movie|film', memberSourceIds: ['a|1', 'b|9']
    }, 'catalog', {}, 0, 10, function (error, page) {
      assert.ifError(error);
      completed += 1;
      result = page;
    }, function () { progress += 1; });
    assert.deepStrictEqual(pending.map(function (entry) { return entry.server + ':' + entry.start; }),
      ['https://a.example:0', 'https://b.example:0']);
    if (failureFirst) { pending[0].callback(new Error('Primary member unavailable')); }
    else {
      pending[1].callback(null, {
        items: [{ ratingKey: 'b1', guid: 'plex://movie/beta', title: 'Beta', librarySectionID: '9' }],
        nextStart: 1, hasMore: false
      });
    }
    assert.strictEqual(pending.length, 2, 'an in-flight member must never be requested a second time');
    assert.strictEqual(completed, 0, 'the first member result must not finish the aggregate page');
    if (failureFirst) {
      pending[1].callback(null, {
        items: [{ ratingKey: 'b1', guid: 'plex://movie/beta', title: 'Beta', librarySectionID: '9' }],
        nextStart: 1, hasMore: false
      });
    } else { pending[0].callback(new Error('Primary member unavailable')); }
    assert.strictEqual(completed, 1, 'the aggregate page must settle exactly once');
    assert.strictEqual(progress, failureFirst ? 0 : 1, 'only an early successful member publishes progress');
    assert.deepStrictEqual(result.items.map(function (item) { return item.title; }), ['Beta']);
    localController.destroy();
  });
}());

(function virtualLibraryPageSkipsKnownOfflineMembers() {
  var memberSources = {
    'a|1': { id: 'a|1', serverMachineIdentifier: 'a', serverName: 'Primary', primary: true, sectionKey: '1', sectionTitle: 'Film', sectionType: 'movie' },
    'b|9': { id: 'b|9', serverMachineIdentifier: 'b', serverName: 'Shared', primary: false, sectionKey: '9', sectionTitle: 'Film', sectionType: 'movie' }
  };
  var offlineResolveCalls = 0;
  var result = null;
  var localController = Controller.create({
    sources: {
      resolveServers: function (callback) { callback(null, []); return request(); },
      source: function (sourceId) { return memberSources[sourceId] || null; },
      serverAvailable: function (machineIdentifier) { return machineIdentifier !== 'b'; },
      resolveSource: function (sourceId, callback) {
        if (sourceId === 'b|9') {
          offlineResolveCalls += 1;
          return request();
        }
        callback(null, { serverMachineIdentifier: 'a', serverName: 'Primary', primary: true, apiBaseUrl: 'https://a.example', token: 'a-token' });
        return request();
      }
    },
    transport: {
      loadLibraryPage: function (_config, _library, _view, _query, start, _size, callback) {
        callback(null, {
          items: start === 0 ? [{ ratingKey: 'a1', guid: 'plex://movie/alpha', title: 'Alpha', titleSort: 'Alpha', librarySectionID: '1' }] : [],
          totalSize: 1, nextStart: 1, hasMore: false
        });
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia,
    config: { itemLimit: 12 }
  });
  localController.loadVirtualLibraryPage({ sourceId: 'virtual|movie|film', key: 'virtual|movie|film', type: 'movie', virtualLibrary: true, memberSourceIds: ['a|1', 'b|9'] }, 'catalog', { sort: 'titleSort', direction: 'asc' }, 0, 10, function (error, page) {
    assert.ifError(error);
    result = page;
  });
  assert.ok(result, 'known offline virtual members must not hold the aggregate page open');
  assert.deepStrictEqual(result.items.map(function (item) { return item.title; }), ['Alpha']);
  assert.strictEqual(offlineResolveCalls, 0, 'known offline virtual members must not be re-resolved on aggregate entry');
  localController.destroy();
}());

(function virtualLibraryFanOutSkipsKnownOfflineMembers() {
  var memberSources = {
    'a|1': { id: 'a|1', serverMachineIdentifier: 'a', serverName: 'Primary', primary: true, sectionKey: '1', sectionTitle: 'Film', sectionType: 'movie' },
    'b|9': { id: 'b|9', serverMachineIdentifier: 'b', serverName: 'Shared', primary: false, sectionKey: '9', sectionTitle: 'Film', sectionType: 'movie' }
  };
  var offlineResolveCalls = 0;
  var result = null;
  var localController = Controller.create({
    sources: {
      resolveServers: function (callback) { callback(null, []); return request(); },
      source: function (sourceId) { return memberSources[sourceId] || null; },
      serverAvailable: function (machineIdentifier) { return machineIdentifier !== 'b'; },
      resolveSource: function (sourceId, callback) {
        if (sourceId === 'b|9') {
          offlineResolveCalls += 1;
          return request();
        }
        callback(null, { serverMachineIdentifier: 'a', serverName: 'Primary', primary: true, apiBaseUrl: 'https://a.example', token: 'a-token' });
        return request();
      }
    },
    transport: {
      loadLibraryRecommendations: function (_config, _library, callback) {
        callback(null, [{ title: 'Recommended', items: [{ ratingKey: 'a1', guid: 'plex://movie/alpha', title: 'Alpha', librarySectionID: '1' }] }]);
        return request();
      }
    },
    MultiServerMedia: MultiServerMedia,
    config: { itemLimit: 12 }
  });
  localController.loadVirtualLibraryRecommendations({ sourceId: 'virtual|movie|film', key: 'virtual|movie|film', type: 'movie', virtualLibrary: true, memberSourceIds: ['a|1', 'b|9'] }, function (error, rows) {
    assert.ifError(error);
    result = rows;
  });
  assert.ok(result, 'known offline virtual members must not hold recommendation fan-out open');
  assert.deepStrictEqual(result[0].items.map(function (item) { return item.title; }), ['Alpha']);
  assert.strictEqual(offlineResolveCalls, 0, 'known offline virtual members must not be re-resolved by recommendation fan-out');
  localController.destroy();
}());

(function mergedSeriesContextAndSeasonQueueSpanAllPmses() {
  var serverA = { serverMachineIdentifier: 'server-a', machineIdentifier: 'server-a', apiBaseUrl: 'https://a', token: 'a', primary: true };
  var serverB = { serverMachineIdentifier: 'server-b', machineIdentifier: 'server-b', apiBaseUrl: 'https://b', token: 'b', primary: false };
  var sourceMap = {
    'server-a|1': { id: 'server-a|1', sectionKey: '1', sectionTitle: 'Serie', sectionType: 'show', serverMachineIdentifier: 'server-a' },
    'server-b|9': { id: 'server-b|9', sectionKey: '9', sectionTitle: 'Serie', sectionType: 'show', serverMachineIdentifier: 'server-b' }
  };
  var sources = {
    resolveServers: function (callback) { callback(null, [serverA, serverB]); },
    resolveSource: function (sourceId, callback) { callback(null, sourceId === 'server-a|1' ? serverA : serverB); },
    source: function (sourceId) { return sourceMap[sourceId] || null; },
    contextForMachine: function (machine) { return machine === 'server-a' ? serverA : (machine === 'server-b' ? serverB : null); },
    primaryContext: function () { return serverA; }
  };
  function episode(server, number) {
    return {
      ratingKey: server === 'server-a' ? 'a-e' + number : 'b-e' + number,
      guid: number === 3 ? 'plex://episode/shared-3' : 'plex://episode/' + number,
      type: 'episode', seasonIndex: 1, episodeIndex: number, index: number,
      title: 'Episode ' + number, parentIndex: 1
    };
  }
  var transport = {
    loadSeriesContext: function (config, detail, callback) {
      var a = config.apiBaseUrl === 'https://a';
      callback(null, {
        seasons: [{ ratingKey: a ? 'a-s1' : 'b-s1', index: 1, title: 'Season 1', leafCount: a ? 3 : 5 }],
        episodes: (a ? [1,2,3] : [3,4,5,6,7]).map(function (n) { return episode(a ? 'server-a' : 'server-b', n); })
      });
      return null;
    },
    loadSeasonEpisodes: function (config, seasonKey, _selected, callback) {
      var a = config.apiBaseUrl === 'https://a';
      callback(null, (a ? [1,2,3] : [3,4,5,6,7]).map(function (n) { return episode(a ? 'server-a' : 'server-b', n); }));
      return null;
    }
  };
  var controller = Controller.create({ sources: sources, transport: transport, MultiServerMedia: MultiServerMedia, config: {} });
  var primaryShow = MultiServerMedia.decorateItem({ ratingKey: 'a-show', guid: 'plex://show/demo', type: 'show', librarySectionID: '1' }, serverA, 'server-a|1');
  var secondaryShow = MultiServerMedia.decorateItem({ ratingKey: 'b-show', guid: 'plex://show/demo', type: 'show', librarySectionID: '9' }, serverB, 'server-b|9');
  var merged = MultiServerMedia.mergeSourceVariants(primaryShow, secondaryShow);

  var mergedCallbackCalled = false;
  var mergedError = null;
  var mergedContext = null;
  var seasonError = null;
  var seasonQueue = null;
  assert.strictEqual(typeof controller.loadMergedSeriesContext, 'function', 'multi-server controller must expose merged series context loading');
  controller.loadMergedSeriesContext(merged, function (error, context) {
    mergedCallbackCalled = true;
    mergedError = error || null;
    mergedContext = context || null;
    if (context && context.seasons && context.seasons[0]) {
      controller.loadMergedSeasonEpisodes(context.seasons[0], function (queueError, episodes) {
        seasonError = queueError || null;
        seasonQueue = episodes || [];
      });
    }
  });
  assert.strictEqual(mergedCallbackCalled, true, 'merged series context test must complete synchronously with the fixture transport');
  assert.ifError(mergedError);
  assert.ok(mergedContext, 'merged series context must be returned');
  assert.deepStrictEqual(mergedContext.episodes.map(function (item) { return item.episodeIndex; }), [1,2,3,4,5,6,7], 'merged series must expose all episodes across PMSes');
  assert.strictEqual(mergedContext.episodes[2].sourceVariants.length, 2, 'overlapping episode must retain both PMS copies');
  assert.ok(mergedContext.episodes.every(function (episodeItem) { return episodeItem.sourcePreferenceGuid === 'plex://show/demo'; }), 'merged episodes inherit parent series source preference identity');
  assert.strictEqual(mergedContext.seasons.length, 1, 'matching season numbers must collapse into one season');
  assert.strictEqual(mergedContext.seasons[0].sourceVariants.length, 2, 'merged season must retain both PMS variants');
  assert.strictEqual(mergedContext.seasons[0].sourcePreferenceGuid, 'plex://show/demo', 'merged seasons inherit parent series source preference identity');
  assert.ifError(seasonError);
  assert.ok(seasonQueue, 'queue season loader must return merged episodes');
  assert.deepStrictEqual(seasonQueue.map(function (item) { return item.episodeIndex; }), [1,2,3,4,5,6,7], 'queue season loader must preserve the merged episode sequence');
  assert.ok(seasonQueue.every(function (episodeItem) { return episodeItem.sourcePreferenceGuid === 'plex://show/demo'; }), 'queue episodes preserve parent series source preference identity');
})();

['missing', 'same', 'different', 'mixed', 'renumbered'].forEach(function mergedEpisodesRespectGuidBeforeNumber(guidMode) {
  var separate = guidMode === 'different' || guidMode === 'mixed';
  var serverA = { serverMachineIdentifier: 'position-a', machineIdentifier: 'position-a', apiBaseUrl: 'https://position-a', token: 'a', primary: true };
  var serverB = { serverMachineIdentifier: 'position-b', machineIdentifier: 'position-b', apiBaseUrl: 'https://position-b', token: 'b', primary: false };
  var sources = {
    resolveServers: function (callback) { callback(null, [serverA, serverB]); return request(); },
    contextForMachine: function (machine) { return machine === 'position-a' ? serverA : (machine === 'position-b' ? serverB : null); },
    primaryContext: function () { return serverA; }
  };
  function episode(server, number) {
    return {
      ratingKey: server.serverMachineIdentifier + '-e' + number,
      guid: guidMode === 'missing' || (guidMode === 'mixed' && server === serverB) ? '' : 'plex://episode/' + (guidMode === 'different' ? server.serverMachineIdentifier : '') + number,
      type: 'episode', seasonIndex: 1, episodeIndex: guidMode === 'renumbered' && server === serverB ? number + 10 : number, index: number,
      title: 'Episode ' + number, parentIndex: 1
    };
  }
  function contextFor(server) {
    return {
      seasons: [{ ratingKey: server.serverMachineIdentifier + '-s1', index: 1, seasonNumber: 1 }],
      episodes: [episode(server, 1), episode(server, 2)]
    };
  }
  var transport = {
    loadSeriesContext: function (config, _detail, callback) {
      callback(null, contextFor(config.apiBaseUrl === serverA.apiBaseUrl ? serverA : serverB));
      return null;
    },
    loadSeasonEpisodes: function (config, _seasonKey, _selected, callback) {
      callback(null, contextFor(config.apiBaseUrl === serverA.apiBaseUrl ? serverA : serverB).episodes);
      return null;
    }
  };
  var controller = Controller.create({ sources: sources, transport: transport, MultiServerMedia: MultiServerMedia, config: {} });
  var show = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'position-show-a', guid: 'plex://show/position', type: 'show' }, serverA),
    MultiServerMedia.decorateItem({ ratingKey: 'position-show-b', guid: 'plex://show/position', type: 'show' }, serverB)
  );
  var context = null;
  var seasonEpisodes = null;

  controller.loadMergedSeriesContext(show, function (error, value) {
    assert.ifError(error);
    context = value;
  });
  assert.deepStrictEqual(context.episodes.map(function (item) { return item.episodeIndex; }), separate ? [1, 1, 2, 2] : [1, 2],
    'conflicting GUIDs must not merge by episode number');
  assert.ok(context.episodes.every(function (item) { return (item.sourceVariants || [item]).length === (separate ? 1 : 2); }),
    'every overlapping episode must retain both PMS source variants');

  controller.loadMergedSeasonEpisodes(context.seasons[0], function (error, value) {
    assert.ifError(error);
    seasonEpisodes = value;
  });
  assert.deepStrictEqual(seasonEpisodes.map(function (item) { return item.episodeIndex; }), separate ? [1, 1, 2, 2] : [1, 2],
    'season hydration must follow the same identity rules');
  assert.ok(seasonEpisodes.every(function (item) { return (item.sourceVariants || [item]).length === (separate ? 1 : 2); }),
    'season hydration must retain both PMS copies for every overlapping episode');
  controller.destroy();
});

(function mergedSeriesWithPrimarySeasonsOneToNineAndSecondarySeasonNineOnly() {
  var serverA = { serverMachineIdentifier: 'server-a', machineIdentifier: 'server-a', apiBaseUrl: 'https://a', token: 'a', primary: true, serverName: 'MAIN' };
  var serverB = { serverMachineIdentifier: 'server-b', machineIdentifier: 'server-b', apiBaseUrl: 'https://b', token: 'b', primary: false, serverName: 'NUC LUCA' };
  var sources = {
    resolveServers: function (callback) { callback(null, [serverA, serverB]); },
    resolveSource: function (sourceId, callback) { callback(null, sourceId === 'server-a|1' ? serverA : serverB); },
    source: function () { return null; },
    contextForMachine: function (machine) { return machine === 'server-a' ? serverA : (machine === 'server-b' ? serverB : null); },
    primaryContext: function () { return serverA; }
  };
  function season(server, number) {
    return { ratingKey: (server === 'server-a' ? 'a-s' : 'b-s') + number, index: number, title: 'Season ' + number };
  }
  function episode(server, number) {
    return { ratingKey: server === 'server-a' ? 'a-e9-' + number : 'b-e9-' + number, type: 'episode', seasonIndex: 9, episodeIndex: number, index: number, title: 'Episode ' + number, parentIndex: 9 };
  }
  var transport = {
    loadSeriesContext: function (config, _detail, callback) {
      var primary = config.apiBaseUrl === 'https://a';
      var seasons = [];
      var index;
      if (primary) {
        for (index = 1; index <= 9; index += 1) { seasons.push(season('server-a', index)); }
        callback(null, { seasons: seasons, episodes: [{ ratingKey: 'a-e1-1', type: 'episode', seasonIndex: 1, episodeIndex: 1, index: 1, title: 'Episode 1', parentIndex: 1 }] });
      } else {
        callback(null, { seasons: [season('server-b', 9)], episodes: [episode('server-b', 1)] });
      }
      return null;
    },
    loadSeasonEpisodes: function (config, seasonKey, _selected, callback) {
      assert.ok(seasonKey === 'a-s9' || seasonKey === 'b-s9', 'merged season 9 must use each PMS concrete season key');
      callback(null, [episode(config.apiBaseUrl === 'https://a' ? 'server-a' : 'server-b', 1)]);
      return null;
    }
  };
  var controller = Controller.create({ sources: sources, transport: transport, MultiServerMedia: MultiServerMedia, config: {} });
  var merged = MultiServerMedia.mergeSourceVariants(
    MultiServerMedia.decorateItem({ ratingKey: 'a-show', guid: 'plex://show/seasons-1-9', type: 'show', librarySectionID: '1' }, serverA, 'server-a|1'),
    MultiServerMedia.decorateItem({ ratingKey: 'b-show', guid: 'plex://show/seasons-1-9', type: 'show', librarySectionID: '9' }, serverB, 'server-b|9')
  );
  var context = null;
  var episodes = null;
  controller.loadMergedSeriesContext(merged, function (error, value) { assert.ifError(error); context = value; });
  assert.ok(context, 'distributed season fixture must return a merged series context');
  assert.strictEqual(context.seasons.length, 9, 'secondary season 9 must merge into the primary 1-9 season list without duplication');
  assert.strictEqual(context.seasons[8].index, 9, 'the ninth season must remain the ninth logical season');
  assert.strictEqual(context.seasons[8].sourceVariants.length, 2, 'season 9 must retain both primary and external PMS copies');
  controller.loadMergedSeasonEpisodes(context.seasons[8], function (error, value) { assert.ifError(error); episodes = value; });
  assert.ok(episodes && episodes.length === 1, 'season 9 must fan out to both PMSes and deduplicate equivalent episodes');
  assert.strictEqual(episodes[0].sourceVariants.length, 2, 'the matching season 9 episode must retain both PMS copies for the Version browser');
  assert.deepStrictEqual(episodes[0].sourceVariants.map(function (variant) { return variant.serverMachineIdentifier; }).sort(), ['server-a', 'server-b']);
  controller.destroy();
}());

(function staleAggregateMetadataFallsBackToActiveVariant() {
  var serverA = { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true };
  var serverB = { serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://b.example', token: 'b-token', primary: false };
  var enabled = { 'server-a': true, 'server-b': false };
  var metadataLoads = [];
  var localSources = {
    resolveServers: function (callback) { callback(null, [serverA, serverB]); return request(); },
    primaryContext: function () { return serverA; },
    serverEnabled: function (machine) { return enabled[machine] !== false; },
    contextForMachine: function (machine) {
      if (enabled[machine] === false) { return null; }
      return machine === 'server-a' ? serverA : (machine === 'server-b' ? serverB : null);
    },
    resolveSource: function (sourceId, callback) {
      var machine = String(sourceId || '').split('|')[0];
      var context = machine === 'server-a' ? serverA : (machine === 'server-b' ? serverB : null);
      if (!context || enabled[machine] === false) { callback(new Error('disabled')); return request(); }
      callback(null, context); return request();
    },
    sources: function () { return []; }
  };
  var localController = Controller.create({
    sources: localSources,
    MultiServerMedia: MultiServerMedia,
    transport: {
      loadMetadata: function (config, ratingKey, callback) {
        metadataLoads.push({ config: config, ratingKey: ratingKey });
        callback(null, { ratingKey: ratingKey, type: 'movie', title: 'Metadata' });
        return request();
      }
    },
    config: {}
  });
  var active = MultiServerMedia.decorateItem({ ratingKey: 'a-theme', guid: 'plex://movie/theme', type: 'movie', librarySectionID: '1' }, serverA, 'server-a|1');
  var stale = MultiServerMedia.decorateItem({ ratingKey: 'b-theme', guid: 'plex://movie/theme', type: 'movie', librarySectionID: '9' }, serverB, 'server-b|9');
  var merged = MultiServerMedia.mergeSourceVariants(stale, active);
  var loaded = null;
  localController.loadMetadata(merged, function (error, detail) { assert.ifError(error); loaded = detail; });
  assert.strictEqual(metadataLoads[0].ratingKey, 'a-theme', 'theme/backdrop metadata must rebase stale aggregate media to an active PMS variant');
  assert.strictEqual(metadataLoads[0].config.apiBaseUrl, 'https://a.example');
  assert.strictEqual(loaded.serverMachineIdentifier, 'server-a', 'fallback metadata must retain the active PMS owner');
  localController.destroy();
}());

(function mergedSeriesExcludesDisabledPmsButRestoresItAfterReenable() {
  var serverA = { serverMachineIdentifier: 'series-a', apiBaseUrl: 'https://series-a', token: 'a', primary: true };
  var serverB = { serverMachineIdentifier: 'series-b', apiBaseUrl: 'https://series-b', token: 'b', primary: false };
  var enabled = { 'series-a': true, 'series-b': false };
  var loads = [];
  var localSources = {
    resolveServers: function (callback) { callback(null, [serverA, serverB]); return request(); },
    primaryContext: function () { return serverA; },
    serverEnabled: function (machine) { return enabled[machine] !== false; },
    contextForMachine: function (machine) {
      if (enabled[machine] === false) { return null; }
      return machine === 'series-a' ? serverA : (machine === 'series-b' ? serverB : null);
    },
    resolveSource: function (sourceId, callback) {
      var machine = String(sourceId || '').split('|')[0];
      var context = machine === 'series-a' ? serverA : (machine === 'series-b' ? serverB : null);
      if (!context || enabled[machine] === false) { callback(new Error('disabled')); return request(); }
      callback(null, context); return request();
    },
    sources: function () { return []; }
  };
  function episode(machine, number) {
    return { ratingKey: machine + '-e' + number, guid: 'plex://episode/series-' + number, type: 'episode', seasonIndex: 1, episodeIndex: number, index: number, title: 'E' + number };
  }
  var localController = Controller.create({
    sources: localSources,
    MultiServerMedia: MultiServerMedia,
    transport: {
      loadSeriesContext: function (config, detail, callback) {
        var isA = config.apiBaseUrl === 'https://series-a';
        loads.push([config.apiBaseUrl, detail.ratingKey]);
        callback(null, {
          seasons: [{ ratingKey: isA ? 'series-a-s1' : 'series-b-s1', index: 1, title: 'Season 1' }],
          episodes: (isA ? [1, 2, 3] : [3, 4, 5]).map(function (number) { return episode(isA ? 'series-a' : 'series-b', number); })
        });
        return null;
      }
    },
    config: {}
  });
  var showA = MultiServerMedia.decorateItem({ ratingKey: 'series-a-show', guid: 'plex://show/series-demo', type: 'show', librarySectionID: '1' }, serverA, 'series-a|1');
  var showB = MultiServerMedia.decorateItem({ ratingKey: 'series-b-show', guid: 'plex://show/series-demo', type: 'show', librarySectionID: '9' }, serverB, 'series-b|9');
  var merged = MultiServerMedia.mergeSourceVariants(showA, showB);
  var disabledContext;
  var enabledContext;

  localController.loadMergedSeriesContext(merged, function (error, context) { assert.ifError(error); disabledContext = context; });
  assert.deepStrictEqual(disabledContext.episodes.map(function (item) { return item.episodeIndex; }), [1, 2, 3], 'disabled PMS episodes must be excluded from a merged series context');
  assert.deepStrictEqual(loads.map(function (entry) { return entry[0]; }), ['https://series-a'], 'disabled PMS must not be queried while composing a merged series');

  enabled['series-b'] = true;
  loads.length = 0;
  localController.loadMergedSeriesContext(merged, function (error, context) { assert.ifError(error); enabledContext = context; });
  assert.deepStrictEqual(enabledContext.episodes.map(function (item) { return item.episodeIndex; }), [1, 2, 3, 4, 5], 're-enabling a PMS must restore its missing episodes to the merged series');
  assert.strictEqual(enabledContext.episodes[2].sourceVariants.length, 2, 'overlapping episodes must regain both source variants after re-enable');
  assert.deepStrictEqual(loads.map(function (entry) { return entry[0]; }).sort(), ['https://series-a', 'https://series-b']);
  localController.destroy();
}());
