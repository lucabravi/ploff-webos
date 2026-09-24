'use strict';

var assert = require('assert');
var Harness = require('./helpers/player-feature-controller-harness');
var PlexSourceRouter = require('../app/coordinator/plex-source-router');

(function sharedPlaybackFreezesSourceTransportForTheSession() {
  var activeServer = { machineIdentifier: 'server-a' };
  var metadataConfigs = [];
  var queueMetadata = null;
  var queueSeasonEpisodes = null;
  var queueContainerPage = null;
  var assIdentitySource = null;
  var sourceContext = {
    sourceId: 'server-b|4',
    serverMachineIdentifier: 'server-b',
    serverName: 'Marco',
    owned: false,
    apiBaseUrl: 'https://relay-b.example',
    token: 'shared-token-b',
    requestTimeout: 9000
  };
  var h = Harness.createHarness({
    data: {
      config: { apiBaseUrl: 'https://primary.example', token: 'primary-token', requestTimeout: 1500, itemLimit: 77 },
      PlexClient: {
        posterUrl: function () { return ''; },
        loadMetadata: function (config, ratingKey, callback) {
          metadataConfigs.push({ config: config, ratingKey: ratingKey });
          callback(null, { ratingKey: ratingKey, type: 'movie' });
          return null;
        },
        loadSeasonEpisodes: function (_config, _seasonKey, _selectedKey, callback) { callback(null, [{ ratingKey: 'queue-episode', type: 'episode' }]); return null; },
        loadLibraryContainerPage: function (_config, _container, _start, _size, callback) { callback(null, { items: [{ ratingKey: 'queue-container-item', type: 'movie' }], totalSize: 1 }); return null; }
      },
      activeServer: function () { return activeServer; },
      mediaIdentity: function () { return { server: activeServer.machineIdentifier, profile: 'profile-a' }; },
      assSubtitlePrefetchIdentity: function (source) { assIdentitySource = source; return String(source && source.serverMachineIdentifier || ''); }
    },
    library: {
      refreshAfterPlayback: function (ratingKey, seconds, context) {
        h.calls.push(['library-playback-refresh', ratingKey, seconds, context]);
      }
    },
    detail: {
      snapshot: function () {
        return {
          selectedItem: { ratingKey: '42', type: 'movie' },
          currentDetail: { ratingKey: '42', type: 'movie', viewOffset: 0 }
        };
      },
      sourceContext: function () { return sourceContext; },
      selectedMediaProfile: function () { return null; },
      resolvedTracks: function () { return null; },
      playbackPreferences: function () { return {}; },
      setPlayPending: function () {},
      hideSurface: function () {},
      showSurface: function () {}
    }
  });

  h.controller.open();
  assert.strictEqual(h.captured.playbackOptions.config.apiBaseUrl, 'https://relay-b.example', 'PlaybackController must receive the source PMS route');
  assert.strictEqual(h.captured.playbackOptions.config.token, 'shared-token-b', 'PlaybackController must receive the source-specific token');
  assert.strictEqual(h.captured.playbackOptions.config.itemLimit, 77, 'playback source config must retain application preferences');
  assert.strictEqual(typeof h.captured.playbackOptions.compatibilityIdentity, 'function',
    'Playback compatibility memory must receive a stable source-owner identity callback');
  assert.strictEqual(h.captured.playbackOptions.compatibilityIdentity(), 'server-b',
    'Playback compatibility memory must be scoped to the media owner rather than the persisted primary PMS or Relay route');
  assert.strictEqual(h.captured.playbackOptions.assSubtitlePrefetchIdentity({ ratingKey: '42' }, { id: 'subtitle-1' }), 'server-b',
    'active Player ASS identity must inherit the frozen session PMS owner even when playback metadata lacks source fields');
  assert.strictEqual(assIdentitySource.serverMachineIdentifier, 'server-b',
    'Player must decorate ASS identity input with the frozen session source context');

  activeServer = { machineIdentifier: 'server-c' };
  h.captured.queueOptions.loadMetadata('99', function (error, detail) { assert.ifError(error); queueMetadata = detail; });
  assert.strictEqual(metadataConfigs[0].config.apiBaseUrl, 'https://relay-b.example', 'queue metadata must stay pinned to the playback source after primary-server state changes');
  assert.strictEqual(metadataConfigs[0].config.token, 'shared-token-b', 'queue metadata must keep the playback session token');
  assert.strictEqual(queueMetadata.serverMachineIdentifier, 'server-b', 'queue metadata reloads must retain the playback PMS identifier');
  assert.strictEqual(queueMetadata.sourceId, 'server-b|4', 'queue metadata reloads must retain the playback source identity');
  h.captured.queueOptions.loadSeasonEpisodes({ ratingKey: 'season-b' }, function (error, items) { assert.ifError(error); queueSeasonEpisodes = items; });
  assert.strictEqual(queueSeasonEpisodes[0].serverMachineIdentifier, 'server-b', 'queue season reloads must retain the playback PMS identifier on each episode');
  assert.strictEqual(queueSeasonEpisodes[0].sourceId, 'server-b|4', 'queue season reloads must retain the playback source identity');
  h.captured.queueOptions.loadContainerPage({ ratingKey: 'playlist-b' }, 0, 40, function (error, page) { assert.ifError(error); queueContainerPage = page; });
  assert.strictEqual(queueContainerPage.items[0].serverMachineIdentifier, 'server-b', 'container queue page items must retain the playback PMS identifier');
  assert.strictEqual(queueContainerPage.items[0].sourceId, 'server-b|4', 'container queue page items must retain the playback source identity');
  h.captured.playbackOptions.onClosed(123, true, '42');
  assert.deepStrictEqual(h.calls.filter(function (entry) { return entry[0] === 'library-playback-refresh'; }).slice(-1)[0],
    ['library-playback-refresh', '42', 123, sourceContext],
    'final playback reconciliation must retain the frozen PMS source context');
}());

(function sharedPlaybackPreservesExplicitEmptyToken() {
  var sourceContext = {
    sourceId: 'server-b|4',
    serverMachineIdentifier: 'server-b',
    apiBaseUrl: 'https://relay-b.example',
    token: '',
    requestTimeout: 9000
  };
  var h = Harness.createHarness({
    data: {
      config: { apiBaseUrl: 'https://primary.example', token: 'primary-token', requestTimeout: 1500, itemLimit: 77 }
    },
    detail: {
      snapshot: function () {
        return {
          selectedItem: { ratingKey: '42', type: 'movie', serverMachineIdentifier: 'server-b' },
          currentDetail: { ratingKey: '42', type: 'movie', viewOffset: 0, serverMachineIdentifier: 'server-b' }
        };
      },
      sourceContext: function () { return sourceContext; },
      selectedMediaProfile: function () { return null; },
      resolvedTracks: function () { return null; },
      playbackPreferences: function () { return {}; },
      setPlayPending: function () {},
      hideSurface: function () {},
      showSurface: function () {}
    }
  });

  h.controller.open();
  assert.strictEqual(h.captured.playbackOptions.config.apiBaseUrl, 'https://relay-b.example');
  assert.strictEqual(h.captured.playbackOptions.config.token, '', 'Player session config must never inherit the primary token over an explicit empty external token');
}());

(function activePlaybackKeepsItsBoundPmsRouteWhenDiscoveryMarksItOffline() {
  var available = true;
  var metadataConfigs = [];
  var queueMetadata = null;
  var primary = { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true };
  var sourceContext = {
    sourceId: 'server-b|4',
    serverMachineIdentifier: 'server-b',
    serverName: 'Secondary',
    apiBaseUrl: 'https://b.example',
    token: 'b-token'
  };
  var sourceRouter = PlexSourceRouter.create({ config: { apiBaseUrl: primary.apiBaseUrl, token: primary.token }, sources: {
    primaryContext: function () { return primary; },
    contextForMachine: function (machine) { return machine === 'server-a' ? primary : (machine === 'server-b' ? sourceContext : null); },
    serverAvailable: function (machine) { return machine !== 'server-b' || available; }
  } });
  var h = Harness.createHarness({
    data: {
      config: { apiBaseUrl: primary.apiBaseUrl, token: primary.token },
      sourceRouter: sourceRouter,
      PlexClient: {
        posterUrl: function () { return ''; },
        loadMetadata: function (config, ratingKey, callback) {
          metadataConfigs.push({ config: config, ratingKey: ratingKey });
          callback(null, { ratingKey: ratingKey, type: 'episode' });
          return null;
        }
      }
    },
    detail: {
      snapshot: function () {
        return {
          selectedItem: { ratingKey: 'b-current', type: 'episode', serverMachineIdentifier: 'server-b', sourceId: 'server-b|4' },
          currentDetail: { ratingKey: 'b-current', type: 'episode', serverMachineIdentifier: 'server-b', sourceId: 'server-b|4', viewOffset: 0 }
        };
      },
      sourceContext: function () { return sourceContext; },
      selectedMediaProfile: function () { return null; },
      resolvedTracks: function () { return null; },
      playbackPreferences: function () { return {}; },
      setPlayPending: function () {},
      hideSurface: function () {},
      showSurface: function () {}
    }
  });

  assert.notStrictEqual(h.controller.open(), false, 'playback must start while the PMS route is live');
  available = false;

  h.captured.queueOptions.loadMetadata({ ratingKey: 'b-queue', type: 'episode', serverMachineIdentifier: 'server-b', sourceId: 'server-b|4' }, function (error, detail) {
    assert.ifError(error);
    queueMetadata = detail;
  });
  assert.ok(queueMetadata, 'an active Player session must keep loading queue metadata through its bound PMS route');
  assert.strictEqual(metadataConfigs[0].config.apiBaseUrl, 'https://b.example', 'queue metadata must keep the frozen playback transport');

}());

(function sharedUpNextBackdropPrefetchKeyUsesOwningPmsIdentity() {
  var claimedKeys = [];
  var sourceContext = {
    sourceId: 'server-b|4',
    serverMachineIdentifier: 'server-b',
    apiBaseUrl: 'https://relay-b.example',
    token: 'shared-token-b'
  };
  var root = {
    setTimeout: function (callback) { callback(); return 1; },
    clearTimeout: function () {},
    Image: function () { this.onload = null; this.onerror = null; this.src = ''; }
  };
  var h = Harness.createHarness({
    root: root,
    claimBackdropPrefetch: function (key) { claimedKeys.push(key); return true; },
    resolveAdjacentState: function (direction, callback) {
      var result = direction < 0 ? { state: 'unavailable' } : {
        state: 'available',
        index: 1,
        item: {
          ratingKey: 'same-next',
          type: 'movie',
          art: '/same-art.jpg',
          serverMachineIdentifier: 'server-b',
          sourceId: 'server-b|4'
        }
      };
      callback(null, result);
      return result;
    },
    data: {
      config: { apiBaseUrl: 'https://primary.example', token: 'primary-token' },
      PlexClient: { posterUrl: function (_config, source) { return source; } }
    },
    shell: { artworkUrl: function (item) { return item && (item.art || item.image) || ''; } },
    detail: {
      snapshot: function () {
        return {
          selectedItem: { ratingKey: 'same-current', type: 'movie', serverMachineIdentifier: 'server-b' },
          currentDetail: { ratingKey: 'same-current', type: 'movie', serverMachineIdentifier: 'server-b' }
        };
      },
      sourceContext: function () { return sourceContext; },
      selectedMediaProfile: function () { return null; },
      resolvedTracks: function () { return null; },
      playbackPreferences: function () { return {}; },
      setPlayPending: function () {},
      hideSurface: function () {},
      showSurface: function () {}
    }
  });
  h.controller.open();
  h.captured.playbackOptions.onPlaybackLoaded({ ratingKey: 'same-current' }, { detail: { ratingKey: 'same-current' } });
  assert.ok(claimedKeys.some(function (key) { return key.indexOf('server:server-b|') === 0; }),
    'Up Next backdrop prefetch keys must be scoped by the owning PMS rather than only ratingKey/index/path');
}());

(function sharedPlaybackRejectsMismatchedOwnerContext() {
  var h = Harness.createHarness({
    data: { config: { apiBaseUrl: 'https://primary.example', token: 'primary-token', requestTimeout: 1500 } },
    detail: {
      snapshot: function () {
        return {
          selectedItem: { ratingKey: '42', type: 'movie', serverMachineIdentifier: 'server-b' },
          currentDetail: { ratingKey: '42', type: 'movie', viewOffset: 0, serverMachineIdentifier: 'server-b' }
        };
      },
      sourceContext: function () {
        return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://primary.example', token: 'primary-token' };
      },
      selectedMediaProfile: function () { return null; },
      resolvedTracks: function () { return null; },
      playbackPreferences: function () { return {}; },
      setPlayPending: function () {},
      hideSurface: function () {},
      showSurface: function () {}
    }
  });

  assert.strictEqual(h.controller.open(), false, 'Player must fail closed when media owner and session source context differ');
  assert.strictEqual(h.calls.some(function (entry) { return entry[0] === 'open-playback'; }), false, 'owner mismatch must not start playback with primary credentials');
}());


(function queueMetadataUsesTargetOwnerTransport() {
  var metadataCalls = [];
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var h = Harness.createHarness({
    data: {
      config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
      sourceRouter: sourceRouter,
      PlexClient: {
        loadMetadata: function (config, ratingKey, callback) {
          metadataCalls.push({ config: config, ratingKey: ratingKey });
          callback(null, { ratingKey: ratingKey, type: 'episode' });
          return null;
        },
        loadSeasonEpisodes: function () {},
        loadLibraryContainerPage: function () {},
        posterUrl: function () { return ''; }
      }
    }
  });
  h.controller.open();
  h.captured.queueOptions.loadMetadata({ ratingKey: 'b-e2', serverMachineIdentifier: 'server-b' }, function (error, detail) {
    assert.ifError(error);
    assert.strictEqual(detail.serverMachineIdentifier, 'server-b');
  });
  assert.strictEqual(metadataCalls[0].ratingKey, 'b-e2', 'queue metadata must use the target ratingKey');
  assert.strictEqual(metadataCalls[0].config.apiBaseUrl, 'https://b.example', 'queue metadata must use the target PMS transport');
}());


(function deferredQueuePlaybackKeepsTargetOwnerWhileLoadingDetail() {
  var metadataCalls = [];
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var h = Harness.createHarness({
    data: {
      config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
      sourceRouter: sourceRouter,
      PlexClient: {
        loadMetadata: function (config, ratingKey, callback) {
          metadataCalls.push({ config: config, ratingKey: ratingKey });
          callback(null, { ratingKey: ratingKey, type: 'episode' });
          return null;
        },
        posterUrl: function () { return ''; },
        loadSeasonEpisodes: function () {},
        loadLibraryContainerPage: function () {}
      }
    },
    detail: {
      queueSnapshot: function () { return {}; },
      snapshot: function () { return {}; },
      sourceContext: function () { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token' }; },
      setPlaybackContext: function () {},
      queueMediaProfile: function () {},
      renderEpisodeContext: function () {},
      playbackPreferencesFor: function () { return {}; }
    }
  });
  h.controller.open();
  h.captured.queueOptions.requestPlayback({
    item: { ratingKey: 'b-e2', type: 'episode', serverMachineIdentifier: 'server-b' }
  });
  assert.strictEqual(metadataCalls[0].ratingKey, 'b-e2');
  assert.strictEqual(metadataCalls[0].config.apiBaseUrl, 'https://b.example', 'deferred queue detail load must retain the target owner');
}());


(function crossServerSeasonBoundaryLoadsDestinationSeasonFromItsOwningPms() {
  var seasonCalls = [];
  var loaded = null;
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var h = Harness.createHarness({
    data: {
      config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
      sourceRouter: sourceRouter,
      PlexClient: {
        loadMetadata: function (_config, ratingKey, callback) { callback(null, { ratingKey: ratingKey, type: 'episode' }); return null; },
        loadSeasonEpisodes: function (config, ratingKey, _selectedKey, callback) {
          seasonCalls.push({ config: config, ratingKey: ratingKey });
          callback(null, [{ ratingKey: 'b-s2e1', type: 'episode' }]);
          return null;
        },
        loadLibraryContainerPage: function () {},
        posterUrl: function () { return ''; }
      }
    },
    detail: {
      snapshot: function () { return { currentDetail: { ratingKey: 'a-s1e9', type: 'episode', serverMachineIdentifier: 'server-a' } }; },
      sourceContext: function () { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token' }; },
      selectedMediaProfile: function () { return null; },
      resolvedTracks: function () { return null; },
      playbackPreferences: function () { return {}; },
      setPlayPending: function () {},
      hideSurface: function () {},
      showSurface: function () {}
    }
  });
  h.controller.open();
  h.captured.queueOptions.loadSeasonEpisodes({ ratingKey: 'b-s2', index: 2, serverMachineIdentifier: 'server-b', sourceId: 'server-b|2' }, function (error, items) {
    assert.ifError(error);
    loaded = items;
  });
  assert.strictEqual(seasonCalls.length, 1);
  assert.strictEqual(seasonCalls[0].ratingKey, 'b-s2');
  assert.strictEqual(seasonCalls[0].config.apiBaseUrl, 'https://b.example', 'cross-season queue hydration must use the destination season PMS transport');
  assert.strictEqual(seasonCalls[0].config.token, 'b-token');
  assert.strictEqual(loaded[0].serverMachineIdentifier, 'server-b', 'destination season episodes must retain the PMS owner');
  assert.strictEqual(loaded[0].sourceId, 'server-b|2', 'destination season episodes must retain the destination source identity');
}());



(function queuePlaybackSwitchesPlaybackTransportToTargetPmsBeforeStartingItem() {
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      }
    }
  });
  var h = Harness.createHarness({
    data: {
      config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
      sourceRouter: sourceRouter,
      PlexClient: { posterUrl: function () { return ''; } }
    },
    detail: {
      snapshot: function () { return { currentDetail: { ratingKey: 'a-e1', type: 'episode', serverMachineIdentifier: 'server-a' } }; },
      queueSnapshot: function () { return {}; },
      sourceContext: function () { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token' }; },
      selectedMediaProfile: function () { return null; },
      resolvedTracks: function () { return null; },
      playbackPreferences: function () { return {}; },
      playbackPreferencesFor: function () { return {}; },
      setPlaybackContext: function () {},
      queueMediaProfile: function () {},
      renderEpisodeContext: function () {},
      setPlayPending: function () {},
      hideSurface: function () {},
      showSurface: function () {}
    }
  });
  h.controller.open();
  assert.strictEqual(h.captured.playbackOptions.config.apiBaseUrl, 'https://a.example');
  h.captured.queueOptions.requestPlayback({
    item: { ratingKey: 'b-e2', type: 'episode', serverMachineIdentifier: 'server-b' },
    detail: { ratingKey: 'b-e2', type: 'episode', serverMachineIdentifier: 'server-b' }
  });
  assert.strictEqual(h.captured.playbackOptions.config.apiBaseUrl, 'https://b.example', 'queue playback must switch the mutable PlaybackController transport to the target PMS');
  assert.strictEqual(h.captured.playbackOptions.config.token, 'b-token');
  var start = h.calls.filter(function (entry) { return entry[0] === 'start-item'; }).pop();
  assert.ok(start, 'queue playback must start the target item after switching transport');
  assert.strictEqual(start[1].serverMachineIdentifier, 'server-b');
}());


(function mergedSeriesQueueUsesMultiServerSeasonLoader() {
  var mergedCalls = 0;
  var fallbackCalls = 0;
  var items = null;
  var h = Harness.createHarness({
    data: {
      config: { apiBaseUrl: 'https://primary.example', token: 'primary-token' },
      loadMergedSeasonEpisodes: function (season, callback) {
        mergedCalls += 1;
        callback(null, [
          { ratingKey: 'a-e1', type: 'episode', seasonIndex: 1, episodeIndex: 1, serverMachineIdentifier: 'server-a' },
          { ratingKey: 'b-e2', type: 'episode', seasonIndex: 1, episodeIndex: 2, serverMachineIdentifier: 'server-b' }
        ]);
        return null;
      },
      PlexClient: {
        posterUrl: function () { return ''; },
        loadMetadata: function (_config, ratingKey, callback) { callback(null, { ratingKey: ratingKey, type: 'episode' }); return null; },
        loadSeasonEpisodes: function (_config, _seasonKey, _selectedKey, callback) { fallbackCalls += 1; callback(null, []); return null; },
        loadLibraryContainerPage: function (_config, _container, _start, _size, callback) { callback(null, { items: [], totalSize: 0 }); return null; }
      }
    }
  });
  h.controller.open();
  h.captured.queueOptions.loadSeasonEpisodes({
    ratingKey: 'a-s1',
    sourceVariants: [
      { serverMachineIdentifier: 'server-a', ratingKey: 'a-s1' },
      { serverMachineIdentifier: 'server-b', ratingKey: 'b-s1' }
    ]
  }, function (error, value) { assert.ifError(error); items = value; });
  assert.strictEqual(mergedCalls, 1, 'merged series queue must delegate season loading to the multi-server loader');
  assert.strictEqual(fallbackCalls, 0, 'merged series queue must not reload the season from the current single-PMS session');
  assert.deepStrictEqual(items.map(function (item) { return item.episodeIndex; }), [1, 2]);
}());

(function staleQueuedVariantFallsBackToActivePmsAfterServerDisable() {
  var enabled = { 'server-a': true, 'server-b': false };
  var metadataLoads = [];
  var sourceRouter = PlexSourceRouter.create({
    config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
    sources: {
      primaryContext: function () { return { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; },
      contextForMachine: function (machine) {
        if (machine === 'server-a') { return { serverMachineIdentifier: 'server-a', sourceId: 'server-a|1', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true }; }
        if (machine === 'server-b') { return { serverMachineIdentifier: 'server-b', sourceId: 'server-b|9', apiBaseUrl: 'https://b.example', token: 'b-token' }; }
        return null;
      },
      serverEnabled: function (machine) { return enabled[machine] !== false; }
    }
  });
  var stale = {
    ratingKey: 'b-next',
    type: 'episode',
    guid: 'plex://episode/next',
    serverMachineIdentifier: 'server-b',
    sourceId: 'server-b|9',
    image: '/b-next.jpg',
    art: '/b-next-art.jpg',
    sourceVariants: [
      { serverMachineIdentifier: 'server-b', ratingKey: 'b-next', sourceId: 'server-b|9', librarySectionID: '9', image: '/b-next.jpg', art: '/b-next-art.jpg' },
      { serverMachineIdentifier: 'server-a', ratingKey: 'a-next', sourceId: 'server-a|1', librarySectionID: '1', image: '/a-next.jpg', art: '/a-next-art.jpg', primarySource: true }
    ]
  };
  var loaded = null;
  var h = Harness.createHarness({
    data: {
      config: { apiBaseUrl: 'https://a.example', token: 'a-token' },
      sourceRouter: sourceRouter,
      PlexClient: {
        posterUrl: function () { return ''; },
        loadMetadata: function (config, ratingKey, callback) {
          metadataLoads.push({ config: config, ratingKey: ratingKey });
          callback(null, { ratingKey: ratingKey, type: 'episode' });
          return null;
        }
      }
    },
    detail: {
      snapshot: function () {
        return {
          selectedItem: { ratingKey: 'a-current', type: 'episode', serverMachineIdentifier: 'server-a', sourceId: 'server-a|1' },
          currentDetail: { ratingKey: 'a-current', type: 'episode', serverMachineIdentifier: 'server-a', sourceId: 'server-a|1' },
          seriesContext: null
        };
      },
      sourceContext: function () { return { serverMachineIdentifier: 'server-a', sourceId: 'server-a|1', apiBaseUrl: 'https://a.example', token: 'a-token' }; },
      queueSnapshot: function () { return {}; },
      selectedMediaProfile: function () { return null; },
      resolvedTracks: function () { return null; },
      playbackPreferences: function () { return {}; },
      preferenceSnapshot: function () { return {}; },
      setPlayPending: function () {},
      hideSurface: function () {},
      showSurface: function () {},
      setPlaybackContext: function () {},
      queueMediaProfile: function () {},
      renderEpisodeContext: function () {},
      openLoaded: function () {},
      setFocus: function () {}
    }
  });

  h.controller.open();
  var queuePresentation = h.captured.playerQueueOptions.resolvePresentationItem(stale);
  assert.ok(queuePresentation, 'playlist queue presentation must resolve stale items through the same source router');
  assert.strictEqual(queuePresentation.item.serverMachineIdentifier, 'server-a');
  assert.strictEqual(queuePresentation.item.ratingKey, 'a-next');
  assert.strictEqual(queuePresentation.item.image, '/a-next.jpg');
  assert.strictEqual(queuePresentation.sourceContext.serverMachineIdentifier, 'server-a');
  var upNextPreview = h.captured.queueOptions.upNextItem({ item: stale }, 'poster');
  assert.strictEqual(upNextPreview.serverMachineIdentifier, 'server-a', 'Up Next presentation must rebase stale ownership to the active PMS');
  assert.strictEqual(upNextPreview.ratingKey, 'a-next', 'Up Next presentation must expose the active PMS rating key');
  assert.strictEqual(upNextPreview.imageSource, '/a-next.jpg', 'Up Next presentation must use artwork belonging to the active PMS variant');
  h.captured.queueOptions.loadMetadata(stale, function (error, detail) { assert.ifError(error); loaded = detail; });
  assert.strictEqual(metadataLoads[0].ratingKey, 'a-next', 'queue metadata must rebase a stale disabled owner to its active PMS variant');
  assert.strictEqual(metadataLoads[0].config.apiBaseUrl, 'https://a.example');
  assert.strictEqual(loaded.serverMachineIdentifier, 'server-a', 'rebased queue metadata must carry the active PMS owner');
  assert.strictEqual(loaded.sourceId, 'server-a|1', 'rebased queue metadata must carry the active source identity');

  metadataLoads.length = 0;
  assert.strictEqual(h.captured.queueOptions.requestPlayback({ item: stale, detail: { ratingKey: 'b-next', type: 'episode', serverMachineIdentifier: 'server-b' } }), true,
    'queue playback must remain startable when the queued canonical owner was disabled after queue construction');
  assert.strictEqual(metadataLoads[0].ratingKey, 'a-next', 'queue playback must refresh metadata for the active variant before starting');
  var start = h.calls.filter(function (entry) { return entry[0] === 'start-item'; }).pop();
  assert.ok(start, 'rebased queue playback must reach PlaybackController');
  assert.strictEqual(start[1].serverMachineIdentifier, 'server-a', 'PlaybackController must receive the active PMS variant');
  assert.strictEqual(start[1].ratingKey, 'a-next');
}());

(function unavailableQueuedSourceCannotBorrowSessionArtworkCredentials() {
  var primary = { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token' };
  var stale = { ratingKey: 'b-only', type: 'episode', serverMachineIdentifier: 'server-b', image: '/b-thumb', art: '/b-art' };
  var images = 0;
  var posterLoads = [];
  var router = PlexSourceRouter.create({
    config: { apiBaseUrl: primary.apiBaseUrl, token: primary.token },
    sources: {
      primaryContext: function () { return primary; },
      contextForMachine: function (machine) { return machine === 'server-a' ? primary : null; },
      serverEnabled: function (machine) { return machine !== 'server-b'; }
    }
  });
  var h = Harness.createHarness({
    root: { setTimeout: function (fn) { fn(); return 1; }, clearTimeout: function () {}, Image: function () { images += 1; } },
    settings: { settings: function () { return { autoplayDelay: 10 }; } },
    data: { config: { apiBaseUrl: primary.apiBaseUrl, token: primary.token }, sourceRouter: router,
      PlexClient: { posterUrl: function () { return 'https://a.example/wrong-source-art'; } } },
    shell: { artworkUrl: function (item) { return item.art || item.image || ''; },
      posterLoader: function () { return { load: function (_image, options) { posterLoads.push(options); } }; } },
    detail: {
      snapshot: function () { return { currentDetail: { ratingKey: 'a-current', type: 'episode', serverMachineIdentifier: 'server-a' } }; },
      sourceContext: function () { return primary; },
      setPlayPending: function () {}, hideSurface: function () {}, showSurface: function () {},
      selectedMediaProfile: function () { return null; }, resolvedTracks: function () { return null; },
      playbackPreferences: function () { return {}; }
    },
    resolveAdjacentState: function (direction, callback) {
      callback(null, direction === 1 ? { state: 'available', item: stale, index: 1 } : { state: 'unavailable' });
      return { state: 'resolving' };
    },
    prepare: function (_options, runtime) {
      runtime.queue.beginBackdropLoad = function () { return 1; };
      runtime.queue.isBackdropLoadCurrent = function () { return true; };
    }
  });
  h.controller.open();
  h.captured.playbackOptions.onPlaybackLoaded({ ratingKey: 'a-current' }, { detail: { ratingKey: 'a-current' } });
  assert.strictEqual(images, 0, 'unresolved artwork must not be prefetched with the active session token');
  h.captured.queueOptions.loadUpNextBackdrop(stale);
  assert.strictEqual(posterLoads.some(function (entry) { return !!entry.source; }), false,
    'unresolved backdrop must not be loaded using the active session context');
  assert.strictEqual(h.captured.queueOptions.upNextItem({ item: stale }, 'poster').imageSource, '',
    'Up Next must not expose another server artwork after failed source resolution');
  assert.strictEqual(h.captured.playerQueueOptions.resolvePresentationItem(stale), null);
}());

(function primaryStartupTransportRecoveryPromotesTheFrozenSessionRoute() {
  var primary = { sourceId: 'server-a|7', sectionKey: '7', sectionTitle: 'Movies', serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://route-a.example', token: 'token-a', primary: true };
  var recoveries = 0;
  var sourceRouter = PlexSourceRouter.create({ config: {}, sources: {
    primaryContext: function () { return primary; },
    contextForMachine: function (machine) { return machine === 'server-a' ? primary : null; },
    serverAvailable: function () { return true; }
  } });
  var h = Harness.createHarness({
    data: {
      config: {},
      sourceRouter: sourceRouter,
      activeServer: function () { return { machineIdentifier: 'server-a' }; },
      recoverPrimary: function (error, callback) {
        recoveries += 1;
        primary = { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://route-b.example', token: 'token-a', primary: true };
        callback(null, primary);
        return null;
      }
    },
    detail: {
      snapshot: function () {
        return {
          selectedItem: { ratingKey: '42', type: 'movie', serverMachineIdentifier: 'server-a', sourceId: 'server-a|7' },
          currentDetail: { ratingKey: '42', type: 'movie', serverMachineIdentifier: 'server-a', sourceId: 'server-a|7', viewOffset: 0 }
        };
      },
      sourceContext: function () { return primary; },
      selectedMediaProfile: function () { return null; },
      resolvedTracks: function () { return null; },
      playbackPreferences: function () { return {}; },
      setPlayPending: function () {}, hideSurface: function () {}, showSurface: function () {}
    }
  });
  var failure = new Error('route A unavailable');
  var recoveredConfig = null;
  failure.transportFailure = true;
  h.controller.open();
  h.captured.playbackOptions.onOpening();
  assert.strictEqual(typeof h.captured.playbackOptions.recoverStartupRoute, 'function', 'Player startup must expose bounded primary-route recovery to PlaybackController');
  h.captured.playbackOptions.recoverStartupRoute(failure, { detail: { ratingKey: '42', serverMachineIdentifier: 'server-a', sourceId: 'server-a|7' } }, function (error, config) {
    assert.ifError(error);
    recoveredConfig = config;
  });
  assert.strictEqual(recoveries, 1);
  assert.strictEqual(recoveredConfig.apiBaseUrl, 'https://route-b.example', 'startup retry must receive the promoted primary route');
  assert.strictEqual(h.captured.playbackOptions.config.apiBaseUrl, 'https://route-b.example', 'the frozen Player session context must move to the promoted route before retry');
  assert.strictEqual(h.captured.playerQueueOptions.sourceContext().sourceId, 'server-a|7', 'route promotion must preserve the concrete library source identity');
  assert.strictEqual(h.captured.playerQueueOptions.sourceContext().sectionKey, '7', 'route promotion must preserve the concrete library section context');
}());

(function secondaryStartupTransportFailureNeverRequestsPrimaryFailover() {
  var primary = { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://a.example', token: 'a-token', primary: true };
  var secondary = { serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://b.example', token: 'b-token', primary: false };
  var recoveries = 0;
  var sourceRouter = PlexSourceRouter.create({ config: {}, sources: {
    primaryContext: function () { return primary; },
    contextForMachine: function (machine) { return machine === 'server-a' ? primary : (machine === 'server-b' ? secondary : null); },
    serverAvailable: function () { return true; }
  } });
  var h = Harness.createHarness({
    data: {
      config: {}, sourceRouter: sourceRouter,
      activeServer: function () { return { machineIdentifier: 'server-a' }; },
      recoverPrimary: function () { recoveries += 1; }
    },
    detail: {
      snapshot: function () { return {
        selectedItem: { ratingKey: '42', type: 'movie', serverMachineIdentifier: 'server-b' },
        currentDetail: { ratingKey: '42', type: 'movie', serverMachineIdentifier: 'server-b', viewOffset: 0 }
      }; },
      sourceContext: function () { return secondary; },
      selectedMediaProfile: function () { return null; }, resolvedTracks: function () { return null; },
      playbackPreferences: function () { return {}; }, setPlayPending: function () {}, hideSurface: function () {}, showSurface: function () {}
    }
  });
  var failure = new Error('secondary route unavailable');
  var callbackError = null;
  failure.transportFailure = true;
  h.controller.open();
  h.captured.playbackOptions.onOpening();
  h.captured.playbackOptions.recoverStartupRoute(failure, { detail: { ratingKey: '42', serverMachineIdentifier: 'server-b' } }, function (error) { callbackError = error; });
  assert.strictEqual(recoveries, 0, 'media owned by a secondary PMS must never invoke primary failover');
  assert.strictEqual(callbackError, failure);
  assert.strictEqual(h.captured.playbackOptions.config.apiBaseUrl, 'https://b.example');
}());

(function stalePrimaryRecoveryCannotOverwriteASupersedingSecondarySession() {
  var primary = { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://route-a.example', token: 'a-token', primary: true };
  var secondary = { serverMachineIdentifier: 'server-b', apiBaseUrl: 'https://b.example', token: 'b-token', primary: false };
  var currentOwner = 'server-a';
  var recoveryComplete;
  var staleCallbackCalls = 0;
  var sourceRouter = PlexSourceRouter.create({ config: {}, sources: {
    primaryContext: function () { return primary; },
    contextForMachine: function (machine) { return machine === 'server-a' ? primary : (machine === 'server-b' ? secondary : null); },
    serverAvailable: function () { return true; }
  } });
  var h = Harness.createHarness({
    data: {
      config: {}, sourceRouter: sourceRouter,
      activeServer: function () { return { machineIdentifier: 'server-a' }; },
      recoverPrimary: function (error, callback) { recoveryComplete = callback; return null; }
    },
    detail: {
      snapshot: function () { return {
        selectedItem: { ratingKey: currentOwner === 'server-a' ? 'a' : 'b', type: 'movie', serverMachineIdentifier: currentOwner },
        currentDetail: { ratingKey: currentOwner === 'server-a' ? 'a' : 'b', type: 'movie', serverMachineIdentifier: currentOwner, viewOffset: 0 }
      }; },
      sourceContext: function () { return currentOwner === 'server-a' ? primary : secondary; },
      selectedMediaProfile: function () { return null; }, resolvedTracks: function () { return null; },
      playbackPreferences: function () { return {}; }, setPlayPending: function () {}, hideSurface: function () {}, showSurface: function () {}
    }
  });
  var failure = new Error('route A unavailable');
  failure.transportFailure = true;
  h.controller.open();
  h.captured.playbackOptions.onOpening();
  h.captured.playbackOptions.recoverStartupRoute(failure, { detail: { ratingKey: 'a', serverMachineIdentifier: 'server-a' } }, function () { staleCallbackCalls += 1; });
  assert.strictEqual(typeof recoveryComplete, 'function');
  currentOwner = 'server-b';
  h.controller.open();
  h.captured.playbackOptions.onOpening();
  assert.strictEqual(h.captured.playbackOptions.config.apiBaseUrl, 'https://b.example');
  primary = { serverMachineIdentifier: 'server-a', apiBaseUrl: 'https://route-b.example', token: 'a-token', primary: true };
  recoveryComplete(null, primary);
  assert.strictEqual(staleCallbackCalls, 0, 'a superseded primary recovery must not complete into the new Player session');
  assert.strictEqual(h.captured.playbackOptions.config.apiBaseUrl, 'https://b.example', 'late primary recovery must not overwrite a superseding secondary session route');
}());

console.log('Player feature source checks passed');
