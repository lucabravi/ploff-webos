'use strict';

var assert = require('assert');
var Controller = require('../app/coordinator/playback-queue-controller');
var QueueModel = require('../app/playback-queue-model');
var UpNextState = require('../app/up-next-state');
var UpNextTiming = require('../app/up-next-timing');
var Contract = require('../app/coordinator/queue-sequence-contract');
var Cache = require('../app/coordinator/bounded-queue-cache');
var SeriesProvider = require('../app/coordinator/series-queue-provider');
var ContainerProvider = require('../app/coordinator/plex-container-queue-provider');

function root() {
  return {
    setTimeout: function (callback) { callback(); return 1; },
    clearTimeout: function () {}
  };
}

function season(number, leafCount) {
  return {
    ratingKey: 'season-' + number,
    index: number,
    title: number === 0 ? 'Specials' : 'Season ' + number,
    leafCount: leafCount
  };
}

function episode(seasonNumber, episodeNumber, key) {
  return {
    ratingKey: key || 's' + seasonNumber + 'e' + episodeNumber,
    type: 'episode',
    title: 'Example Show',
    detail: 'Episode ' + episodeNumber,
    showRatingKey: 'show-1',
    parentIndex: seasonNumber,
    seasonIndex: seasonNumber,
    index: episodeNumber,
    episodeIndex: episodeNumber
  };
}

function detail(current, seasons, episodes, seasonIndex, episodeIndex, playlistQueue) {
  return {
    currentDetail: current,
    seriesContext: { seasons: seasons || [], episodes: episodes || [], playlistQueue: playlistQueue === true },
    seasonIndex: seasonIndex || 0,
    episodeIndex: episodeIndex || 0
  };
}

function harness(configuration) {
  var currentDetail = configuration.detail;
  var requests = [];
  var gaps = [];
  var loads = [];
  var containerLoads = [];
  var pendingContainerPages = [];
  var pendingMetadata = [];
  var playbackErrors = [];
  var container = configuration.container || null;
  var controller = Controller.create({
    root: root(),
    PlaybackQueueModel: QueueModel,
    UpNextState: UpNextState,
    UpNextTiming: UpNextTiming,
    QueueSequenceContract: Contract,
    BoundedQueueCache: Cache,
    SeriesQueueProvider: SeriesProvider,
    PlexContainerQueueProvider: ContainerProvider,
    detailSnapshot: function () { return currentDetail; },
    currentDetailSnapshot: function () { return currentDetail; },
    queueLabel: function () { return 'Queue'; },
    isRegularSeason: function (value) { return Number(value.index) > 0; },
    loadSeasonEpisodes: function (value, callback) {
      loads.push(Number(value.index));
      callback(null, configuration.episodesBySeason && configuration.episodesBySeason[String(value.index)] || []);
      return { abort: function () {} };
    },
    loadContainerPage: function (_container, start, size, callback) {
      var items = configuration.containerItems || [];
      var request;
      containerLoads.push({ start: start, size: size });
      if (configuration.deferContainerPages) {
        request = {
          aborted: false,
          abort: function () {
            this.aborted = true;
            if (configuration.abortContainerSynchronously) { callback(new Error('aborted')); }
          }
        };
        pendingContainerPages.push({ callback: callback, request: request, start: start, size: size });
        return request;
      }
      if (configuration.containerError) {
        callback(configuration.containerError);
        return { abort: function () {} };
      }
      if (configuration.deferLegacyHydration === true && size === 60) { return { abort: function () {} }; }
      callback(null, { items: items.slice(start, start + size), totalSize: items.length });
      return { abort: function () {} };
    },
    loadMetadata: function (ratingKey, callback) {
      var request;
      if (configuration.deferMetadata) {
        request = {
          aborted: false,
          abort: function () {
            this.aborted = true;
            if (configuration.abortMetadataSynchronously) { callback(new Error('aborted')); }
          }
        };
        pendingMetadata.push({ ratingKey: ratingKey, callback: callback, request: request });
        return request;
      }
      callback(null, {});
      return { abort: function () {} };
    },
    requestPlayback: function (request) { requests.push(request); },
    onPlaybackError: function (error) { playbackErrors.push(error); },
    onGapRequired: function (confirmation, source) { gaps.push({ confirmation: confirmation, source: source }); },
    autoplaySettings: function () { return { delay: 5, layout: 'compact' }; },
    playerActive: function () { return true; },
    renderUpNext: function () {},
    upNextItem: function (target) { return target.item; },
    loadUpNextBackdrop: function () {},
    clearUpNextBackdrop: function () {},
    onQueueChanged: function (snapshot) { if (configuration.onQueueChanged) { configuration.onQueueChanged(snapshot); } }
  });
  if (container) {
    controller.prepareContainer(
      container,
      configuration.initialItems || configuration.containerItems || [],
      (configuration.containerItems || [])[configuration.currentIndex || 0],
      configuration.currentIndex || 0,
      currentDetail
    );
  }
  return {
    controller: controller,
    requests: requests,
    gaps: gaps,
    loads: loads,
    containerLoads: containerLoads,
    pendingContainerPages: pendingContainerPages,
    pendingMetadata: pendingMetadata,
    playbackErrors: playbackErrors,
    setDetail: function (next) { currentDetail = next; }
  };
}



(function keepsProviderCurrentIdentityAlignedWithSameSeriesPlayback() {
  var first = episode(1, 1, 'identity-first');
  var second = episode(1, 2, 'identity-second');
  var seasons = [season(1, 2)];
  var h = harness({ detail: detail(first, seasons, [first, second], 0, 0, false) });
  h.controller.ensureSeries();
  var initial = h.controller.snapshot().sequence.provider;
  h.setDetail(detail(second, seasons, [first, second], 0, 1, false));
  h.controller.ensureSeries();
  var updated = h.controller.snapshot().sequence.provider;
  assert.strictEqual(updated.generation, initial.generation,
    'playback within the same series scope must keep the provider generation');
  assert.strictEqual(updated.currentOccurrenceId,
    Contract.seriesOccurrenceIdentity('series-show-1-regular', 1, 2, second.ratingKey),
    'the provider snapshot must track the episode currently playing');
  assert.strictEqual(h.loads.length, 0, 'updating current identity must not reload season metadata');
}());

(function providerBackedSeriesDoesNotHydrateFutureSeasonsEagerly() {
  var e1 = episode(1, 1);
  var e2 = episode(2, 1);
  var e3 = episode(3, 1);
  var h = harness({
    detail: detail(e1, [season(1), season(2), season(3)], [e1], 0, 0, false),
    episodesBySeason: { 2: [e2], 3: [e3] }
  });
  var queue = h.controller.activeQueue();
  assert.deepStrictEqual(queue.items.map(function (item) { return item.ratingKey; }), [e1.ratingKey]);
  assert.deepStrictEqual(h.loads, [],
    'the provider-backed series queue must not preload every future season during Player setup');
}());

(function pagesSeriesDrawerAcrossSeasonSegments() {
  var s1e1 = episode(1, 1);
  var s1e2 = episode(1, 2);
  var s2e1 = episode(2, 1);
  var s2e2 = episode(2, 2);
  var s3e1 = episode(3, 1);
  var s3e2 = episode(3, 2);
  var h = harness({
    detail: detail(s1e1, [season(1, 2), season(2, 2), season(3, 2)], [s1e1, s1e2], 0, 0, false),
    episodesBySeason: { 2: [s2e1, s2e2], 3: [s3e1, s3e2] }
  });
  var windowResult;
  h.controller.activeQueue();
  assert.strictEqual(h.controller.openDrawer(null, 0), true);
  assert.strictEqual(h.controller.pointDrawer(4), 4,
    'series drawer focus must use the logical total across unloaded seasons');
  h.controller.loadDrawerWindow({ viewportItems: 1, direction: 1 }, function (error, result) {
    assert.ifError(error);
    windowResult = result;
  });
  assert.strictEqual(windowResult.total, 6);
  assert.deepStrictEqual(windowResult.items.map(function (value) { return value.absoluteIndex; }), [1, 2, 3, 4, 5]);
  assert.deepStrictEqual(h.loads, [2, 3],
    'opening a distant series drawer window must load only the season segments covered by that window');
}());

(function startsAnExactNonResidentSeriesOccurrence() {
  var s1e1 = episode(1, 1);
  var s1e2 = episode(1, 2);
  var s3e1 = episode(3, 1);
  var h = harness({
    detail: detail(s1e1, [season(1, 2), season(2, 2), season(3, 2)], [s1e1, s1e2], 0, 0, false),
    episodesBySeason: { 3: [s3e1, episode(3, 2)] }
  });
  h.controller.activeQueue();
  assert.strictEqual(h.controller.requestIndex(4, {}), true,
    'selecting a non-resident series occurrence must resolve only its season segment');
  assert.deepStrictEqual(h.loads, [3]);
  assert.strictEqual(h.requests.length, 1);
  assert.strictEqual(h.requests[0].item.ratingKey, s3e1.ratingKey);
  assert.strictEqual(h.requests[0].index, 4);
  assert.strictEqual(h.requests[0].occurrenceId,
    Contract.seriesOccurrenceIdentity('series-show-1-regular', 3, 1, s3e1.ratingKey));
}());

(function startsTheRebasedSeriesOccurrenceAfterEarlierCountsShrink() {
  var s1e1 = episode(1, 1);
  var unavailable = episode(1, 2, 's1e2-unavailable');
  var s2e1 = episode(2, 1);
  var s2e2 = episode(2, 2);
  unavailable.type = 'clip';
  var h = harness({
    detail: detail(s2e1, [season(1, 3), season(2, 2)], [s2e1, s2e2], 1, 0, false),
    episodesBySeason: { 1: [s1e1, unavailable] }
  });
  h.controller.activeQueue();
  assert.strictEqual(h.controller.openDrawer(null, 0), true);
  h.controller.loadDrawerWindow({ viewportItems: 1, direction: -1 }, function (error) { assert.ifError(error); });
  assert.deepStrictEqual(h.loads, [1]);
  assert.strictEqual(h.controller.pointDrawer(2), 2);
  assert.strictEqual(h.controller.requestIndex(2, {}), true);
  assert.strictEqual(h.requests.length, 1);
  assert.strictEqual(h.requests[0].item.ratingKey, s2e2.ratingKey,
    'drawer activation must follow the rebased absolute sequence after a stale earlier leaf count shrinks');
  assert.strictEqual(h.requests[0].index, 2);
}());

(function resolvesContiguousSeriesThroughTheProvider() {
  var e1 = episode(1, 2);
  var e2 = episode(2, 1);
  var e3 = episode(2, 2);
  var h = harness({
    detail: detail(e1, [season(1), season(2)], [e1], 0, 0, false),
    episodesBySeason: { 2: [e2, e3] }
  });
  var result;
  assert.deepStrictEqual(h.controller.resolveAdjacentState(1, function (error, value) {
    assert.ifError(error);
    result = value;
  }), { state: 'resolving' });
  assert.strictEqual(result.state, 'available');
  assert.strictEqual(result.item.ratingKey, e2.ratingKey);
  assert.strictEqual(result.providerKind, 'series');
  assert.strictEqual(result.seasonNumber, 2);
  assert.strictEqual(result.episodeNumber, 1);
  assert.deepStrictEqual(result.item.queueEpisodes.map(function (item) { return item.ratingKey; }), [e2.ratingKey, e3.ratingKey],
    'a cross-season result must preserve the complete destination season for detail restoration');
}());

(function returnsGapConfirmationWithoutRequestingPlayback() {
  var e2 = episode(2, 10);
  var e4 = episode(4, 3);
  var h = harness({
    detail: detail(e2, [season(2), season(4)], [e2], 0, 0, false),
    episodesBySeason: { 4: [e4] }
  });
  var result;
  h.controller.resolveAdjacentState(1, function (error, value) {
    assert.ifError(error);
    result = value;
  });
  assert.strictEqual(result.state, 'confirmation-required');
  assert.strictEqual(result.confirmation.kind, 'combined');
  assert.strictEqual(result.confirmation.target.item.ratingKey, e4.ratingKey);
  assert.strictEqual(h.requests.length, 0, 'resolving a gap must not start playback');
  assert.strictEqual(h.controller.requestResolved(result), false, 'a confirmation state is not an immediately playable target');
  assert.strictEqual(h.controller.isConfirmationCurrent(result.confirmation), true, 'a freshly resolved gap confirmation must match the active provider generation');
  h.controller.clear();
  assert.strictEqual(h.controller.isConfirmationCurrent(result.confirmation), false, 'changing the logical queue must invalidate pending confirmations');
}());


(function invalidatesGapConfirmationWhenTheCurrentOccurrenceChangesInPlace() {
  var first = episode(1, 1, 'gap-current-first');
  var later = episode(1, 3, 'gap-current-later');
  var seasons = [season(1, 3)];
  var h = harness({ detail: detail(first, seasons, [first, later], 0, 0, false) });
  var confirmation = null;
  h.controller.resolveAdjacentState(1, function (error, value) {
    assert.ifError(error);
    confirmation = value.confirmation;
  });
  assert.ok(confirmation);
  assert.strictEqual(h.controller.isConfirmationCurrent(confirmation), true);
  h.setDetail(detail(later, seasons, [first, later], 0, 1, false));
  h.controller.ensureSeries();
  assert.strictEqual(h.controller.isConfirmationCurrent(confirmation), false,
    'a confirmation resolved for the previous episode must expire after playback moves inside the same series generation');
}());

(function specialsNeverResolveIntoRegularSeasons() {
  var sp1 = episode(0, 1, 'special-1');
  var h = harness({
    detail: detail(sp1, [season(0), season(1)], [sp1], 0, 0, false),
    episodesBySeason: { 1: [episode(1, 1)] }
  });
  var result;
  h.controller.resolveAdjacentState(1, function (error, value) {
    assert.ifError(error);
    result = value;
  });
  assert.deepStrictEqual(result, { state: 'unavailable' });
  assert.deepStrictEqual(h.loads, [], 'Specials boundary resolution must not inspect regular seasons');
}());

(function preservesDuplicateContainerOccurrenceIndexes() {
  var duplicateA = { ratingKey: 'same', type: 'movie', title: 'Same' };
  var duplicateB = { ratingKey: 'same', type: 'movie', title: 'Same again' };
  var last = { ratingKey: 'last', type: 'movie', title: 'Last' };
  var container = { containerType: 'playlist', containerKey: '/playlists/1/items', title: 'Playlist' };
  var h = harness({
    detail: detail(duplicateA, [{ ratingKey: 'playlist', index: 1 }], [duplicateA, duplicateB, last], 0, 0, true),
    container: container,
    containerItems: [duplicateA, duplicateB, last],
    currentIndex: 0
  });
  var result;
  h.controller.resolveAdjacentState(1, function (error, value) {
    assert.ifError(error);
    result = value;
  });
  assert.strictEqual(result.state, 'available');
  assert.strictEqual(result.absoluteIndex, 1);
  assert.notStrictEqual(result.occurrenceId, Contract.occurrenceIdentity('playlist-/playlists/1/items', 0, 'same'));
  assert.strictEqual(h.controller.requestResolved(result, { origin: 'queue' }), true);
  assert.strictEqual(h.requests[0].index, 1, 'the exact repeated occurrence index must reach playback');
  assert.strictEqual(h.requests[0].item.title, 'Same again');
}());


(function repeatedAdjacentActivationWhileResolvingKeepsTheOriginalRequestOwner() {
  var first = { ratingKey: 'repeat-0', type: 'movie', title: 'Repeat 0' };
  var second = { ratingKey: 'repeat-1', type: 'movie', title: 'Repeat 1' };
  var container = {
    containerType: 'playlist',
    containerKey: '/playlists/repeat/items',
    title: 'Repeat',
    totalSize: 2
  };
  var h = harness({
    detail: detail(first, [{ ratingKey: 'playlist', index: 1 }], [first], 0, 0, true),
    container: container,
    containerItems: [first, second],
    initialItems: [first],
    currentIndex: 0,
    deferContainerPages: true
  });
  var firstResult = null;
  var secondCallbacks = 0;
  assert.deepStrictEqual(h.controller.resolveAdjacentState(1, function (error, value) {
    assert.ifError(error);
    firstResult = value;
  }), { state: 'resolving' });
  assert.deepStrictEqual(h.controller.resolveAdjacentState(1, function () {
    secondCallbacks += 1;
  }), { state: 'resolving' }, 'a repeated activation must stay temporarily unavailable');
  assert.strictEqual(h.pendingContainerPages.length, 1,
    'a repeated activation while resolving must not start another page request');
  h.pendingContainerPages[0].callback(null, { items: [first, second], totalSize: 2 });
  assert.strictEqual(firstResult && firstResult.state, 'available',
    'the original adjacent request must retain ownership of the eventual result');
  assert.strictEqual(firstResult && firstResult.item.ratingKey, 'repeat-1');
  assert.strictEqual(secondCallbacks, 0,
    'the repeated activation must not queue an automatic start callback for later');
  assert.strictEqual(h.controller.snapshot().sequence.nextState, 'available');
}());


(function oppositeAdjacentDirectionsKeepIndependentRequestOwnership() {
  var items = [];
  var index;
  var current;
  var container = {
    containerType: 'playlist',
    containerKey: '/playlists/opposite/items',
    title: 'Opposite',
    totalSize: 100
  };
  for (index = 0; index < 100; index += 1) {
    items.push({ ratingKey: 'opposite-' + index, type: 'movie', title: 'Opposite ' + index });
  }
  current = items[40];
  var h = harness({
    detail: detail(current, [{ ratingKey: 'playlist', index: 1 }], [current], 0, 40, true),
    container: container,
    containerItems: items,
    initialItems: [current],
    currentIndex: 40,
    deferContainerPages: true
  });
  var nextResult = null;
  var previousResult = null;
  h.controller.resolveAdjacentState(1, function (error, value) {
    assert.ifError(error);
    nextResult = value;
  });
  h.controller.resolveAdjacentState(-1, function (error, value) {
    assert.ifError(error);
    previousResult = value;
  });
  assert.strictEqual(h.pendingContainerPages.length, 2,
    'opposite directions may resolve their independent page boundaries concurrently');
  h.pendingContainerPages.forEach(function (pending) {
    pending.callback(null, {
      items: items.slice(pending.start, pending.start + pending.size),
      totalSize: items.length
    });
  });
  assert.strictEqual(nextResult && nextResult.item.ratingKey, 'opposite-41',
    'starting Previous must not invalidate the owning Next request');
  assert.strictEqual(previousResult && previousResult.item.ratingKey, 'opposite-39',
    'Previous must retain its own result independently');
  assert.strictEqual(h.controller.snapshot().sequence.nextState, 'available');
  assert.strictEqual(h.controller.snapshot().sequence.previousState, 'available');
}());


(function upNextDoesNotRemainPreparingBehindAnOwnedManualResolution() {
  var first = { ratingKey: 'up-next-owned-0', type: 'movie', title: 'Owned 0' };
  var second = { ratingKey: 'up-next-owned-1', type: 'movie', title: 'Owned 1' };
  var container = {
    containerType: 'playlist',
    containerKey: '/playlists/up-next-owned/items',
    title: 'Owned',
    totalSize: 2
  };
  var h = harness({
    detail: detail(first, [{ ratingKey: 'playlist', index: 1 }], [first], 0, 0, true),
    container: container,
    containerItems: [first, second],
    initialItems: [first],
    currentIndex: 0,
    deferContainerPages: true
  });
  h.controller.resolveAdjacentState(1, function () {});
  assert.strictEqual(h.pendingContainerPages.length, 1);
  assert.strictEqual(h.controller.playbackEnded({ actualEnd: true, delay: 5, layout: 'compact' }), false,
    'Up Next must not attach itself behind a manual Next request that already owns resolution');
  assert.strictEqual(h.controller.upNextSnapshot().preparing, false,
    'an already-owned adjacent request must not leave Up Next stuck in preparing');
  h.pendingContainerPages[0].callback(null, { items: [first, second], totalSize: 2 });
  assert.strictEqual(h.controller.upNextSnapshot().visible, false,
    'the unrelated manual resolution must not open Up Next when it completes');
}());


(function adjacentLoadFailuresRemainRetryable() {
  var first = { ratingKey: 'retry-0', type: 'movie', title: 'Retry 0' };
  var second = { ratingKey: 'retry-1', type: 'movie', title: 'Retry 1' };
  var container = {
    containerType: 'playlist',
    containerKey: '/playlists/retry/items',
    title: 'Retry',
    totalSize: 2
  };
  var h = harness({
    detail: detail(first, [{ ratingKey: 'playlist', index: 1 }], [first], 0, 0, true),
    container: container,
    containerItems: [first, second],
    initialItems: [first],
    currentIndex: 0,
    containerError: new Error('temporary queue failure')
  });
  var receivedError;
  h.controller.resolveAdjacentState(1, function (error) { receivedError = error; });
  assert.strictEqual(receivedError && receivedError.message, 'temporary queue failure');
  assert.strictEqual(h.controller.snapshot().sequence.nextState, 'available',
    'a transient adjacent-page failure must restore a retryable control state');
  assert.strictEqual(h.requests.length, 0, 'a failed resolution must never start playback');
}());




(function providerBackedPreparationDoesNotHydrateTheWholeContainer() {
  var items = [];
  var index;
  var container = { containerType: 'playlist', containerKey: '/playlists/no-hydrate/items', title: 'No hydrate', totalSize: 1000 };
  for (index = 0; index < 1000; index += 1) {
    items.push({ ratingKey: 'no-hydrate-' + index, type: 'movie', title: 'No hydrate ' + index });
  }
  var h = harness({
    detail: detail(items[0], [{ ratingKey: 'playlist', index: 1 }], [items[0]], 0, 0, true),
    container: container,
    containerItems: items,
    initialItems: [items[0]],
    currentIndex: 0
  });
  assert.deepStrictEqual(h.containerLoads, [],
    'provider-backed preparation must not start the legacy full-container hydration');
  assert.strictEqual(h.controller.snapshot().playlistQueue.items.length, 1,
    'only the already-visible item window should remain in the compatibility queue');
}());

(function providerBackedDirectStartStopsAtTheFirstUnfinishedPage() {
  var items = [];
  var index;
  var container = {
    containerType: 'playlist',
    containerKey: '/playlists/direct-start/items',
    title: 'Direct start',
    totalSize: 1000
  };
  for (index = 0; index < 1000; index += 1) {
    items.push({
      ratingKey: 'direct-' + index,
      type: 'movie',
      title: 'Direct ' + index,
      viewed: index < 45
    });
  }
  var h = harness({
    detail: {},
    containerItems: items
  });
  assert.strictEqual(h.controller.startContainer(container, function (error) {
    assert.ifError(error);
  }), true);
  assert.deepStrictEqual(h.containerLoads, [
    { start: 0, size: 40 },
    { start: 40, size: 40 }
  ], 'direct playback must stop paging as soon as the first unfinished occurrence is found');
  assert.strictEqual(h.requests.length, 1);
  assert.strictEqual(h.requests[0].item.ratingKey, 'direct-45');
  assert.strictEqual(h.requests[0].index, 45, 'the absolute provider position must reach playback');
  assert.strictEqual(h.requests[0].occurrenceId,
    Contract.occurrenceIdentity('playlist-/playlists/direct-start/items', 45, 'direct-45'));
  assert.strictEqual(h.requests[0].queue.index, 45);
  assert.strictEqual(h.requests[0].queue.currentItem.ratingKey, 'direct-45');
  assert.strictEqual(h.requests[0].queue.currentOccurrenceId, h.requests[0].occurrenceId,
    'direct start must publish the exact occurrence through the compatibility queue');
  assert.ok(h.controller.snapshot().sequence.provider.residentRecords <= 200,
    'direct-start scanning must retain only the bounded provider cache');
}());


(function restoringAProviderBackedPlaylistPreservesTheExactOccurrence() {
  var item = { ratingKey: 'restore-current', type: 'movie', title: 'Restore current' };
  var container = {
    containerType: 'playlist',
    containerKey: '/playlists/restore-current/items',
    title: 'Restore current',
    totalSize: 100
  };
  var occurrenceId = Contract.occurrenceIdentity('playlist-/playlists/restore-current/items', 45, item.ratingKey);
  var h = harness({
    detail: detail(item, [{ ratingKey: 'playlist', index: 1 }], [item], 0, 45, true),
    container: container,
    containerItems: [item],
    initialItems: [item],
    currentIndex: 0
  });
  var activated = h.controller.activatePlaylist(item.ratingKey, 45, item, occurrenceId);
  var restored = h.controller.activatePlaylist(item.ratingKey);
  assert.strictEqual(activated.absoluteIndex, 45);
  assert.strictEqual(restored.absoluteIndex, 45,
    'restoring by media key must not collapse an absolute provider index to the local compatibility index');
  assert.strictEqual(restored.context.queueAbsoluteIndex, 45);
  assert.strictEqual(restored.context.queueOccurrenceId, occurrenceId,
    'restoring a duplicate-safe queue must retain the exact active occurrence identity');
  assert.strictEqual(h.controller.snapshot().playlistQueue.index, 45);
}());

(function providerBackedDirectStartKeepsAllWatchedScanningBounded() {
  var items = [];
  var index;
  var container = {
    containerType: 'collection',
    containerKey: '/collections/all-watched/children',
    title: 'All watched',
    totalSize: 1000
  };
  for (index = 0; index < 1000; index += 1) {
    items.push({ ratingKey: 'watched-' + index, type: 'movie', title: 'Watched ' + index, viewed: true });
  }
  var h = harness({ detail: {}, containerItems: items });
  assert.strictEqual(h.controller.startContainer(container, function (error) { assert.ifError(error); }), true);
  assert.strictEqual(h.requests[0].item.ratingKey, 'watched-0',
    'an all-watched container must restart from the first playable occurrence');
  assert.strictEqual(h.requests[0].index, 0);
  assert.strictEqual(h.containerLoads.length, 25, 'the all-watched fallback may scan every page without materializing the container');
  assert.ok(h.controller.snapshot().sequence.provider.peakResidentRecords <= 200,
    'even the worst-case all-watched scan must remain within the metadata hard bound');
}());

(function directStartIgnoresSynchronousAbortAndLatePagesAfterClear() {
  var container = {
    containerType: 'playlist',
    containerKey: '/playlists/stale-direct/items',
    title: 'Stale direct',
    totalSize: 80
  };
  var callbacks = 0;
  var h = harness({
    detail: {},
    containerItems: [{ ratingKey: 'stale-0', type: 'movie', title: 'Stale' }],
    deferContainerPages: true,
    abortContainerSynchronously: true
  });
  h.controller.startContainer(container, function () { callbacks += 1; });
  assert.strictEqual(h.pendingContainerPages.length, 1);
  h.controller.clear();
  assert.strictEqual(h.pendingContainerPages[0].request.aborted, true,
    'clearing direct playback must abort the provider page request');
  h.pendingContainerPages[0].callback(null, {
    totalSize: 80,
    items: [{ ratingKey: 'late', type: 'movie', title: 'Late' }]
  });
  assert.strictEqual(callbacks, 0, 'synchronous abort and late page callbacks must remain silent after clear');
  assert.strictEqual(h.requests.length, 0, 'a stale direct-start page must never reach playback');
}());

(function closingTheDrawerSuppressesItsPendingWindowCallback() {
  var first = { ratingKey: 'drawer-0', type: 'movie', title: 'Drawer 0' };
  var container = {
    containerType: 'playlist',
    containerKey: '/playlists/stale-drawer/items',
    title: 'Stale drawer',
    totalSize: 80
  };
  var published = 0;
  var h = harness({
    detail: detail(first, [{ ratingKey: 'playlist', index: 1 }], [first], 0, 0, true),
    container: container,
    containerItems: [first],
    initialItems: [first],
    currentIndex: 0,
    deferContainerPages: true
  });
  h.controller.openDrawer(null, 0);
  h.controller.loadDrawerWindow({ viewportItems: 5, direction: 1 }, function () { published += 1; });
  assert.strictEqual(h.pendingContainerPages.length, 1);
  h.controller.closeDrawer();
  h.pendingContainerPages[0].callback(null, { totalSize: 80, items: [first] });
  assert.strictEqual(published, 0, 'a drawer closed during paging must ignore the completed window');
}());


(function loadsOnlyTheBoundedContainerDrawerWindow() {
  var items = [];
  var index;
  var windowResult;
  var container = { containerType: 'playlist', containerKey: '/playlists/large/items', title: 'Large', totalSize: 1000 };
  for (index = 0; index < 1000; index += 1) {
    items.push({ ratingKey: 'item-' + index, type: 'movie', title: 'Item ' + index });
  }
  var h = harness({
    detail: detail(items[0], [{ ratingKey: 'playlist', index: 1 }], [items[0]], 0, 0, true),
    container: container,
    containerItems: items,
    initialItems: [items[0]],
    currentIndex: 0
  });
  assert.deepStrictEqual(h.controller.loadDrawerWindow({ viewportItems: 5, direction: 1 }, function (error, result) {
    assert.ifError(error);
    windowResult = result;
  }), { state: 'resolving' });
  assert.strictEqual(windowResult.total, 1000);
  assert.strictEqual(windowResult.items.length, 20, 'the first drawer window must retain only four clamped viewports at the leading edge');
  assert.strictEqual(windowResult.items[0].absoluteIndex, 0);
  assert.strictEqual(windowResult.items[19].absoluteIndex, 19);
  assert.strictEqual(windowResult.prefetchItems.length, 5,
    'one additional directional viewport must be available for SD artwork prefetch without adding DOM cards');
  assert.strictEqual(windowResult.prefetchItems[0].absoluteIndex, 20);
  assert.strictEqual(windowResult.prefetchItems[4].absoluteIndex, 24);
  assert.ok(h.controller.snapshot().sequence.provider.residentRecords <= 200, 'drawer paging must preserve the metadata hard bound');
}());



(function navigatesTheLogicalContainerRangeBeyondResidentItems() {
  var items = [];
  var index;
  var windowResult;
  var container = { containerType: 'playlist', containerKey: '/playlists/huge/items', title: 'Huge', totalSize: 1000 };
  for (index = 0; index < 1000; index += 1) {
    items.push({ ratingKey: 'huge-' + index, type: 'movie', title: 'Huge ' + index });
  }
  var h = harness({
    detail: detail(items[0], [{ ratingKey: 'playlist', index: 1 }], [items[0]], 0, 0, true),
    container: container,
    containerItems: items,
    initialItems: [items[0]],
    currentIndex: 0,
    deferLegacyHydration: true
  });
  assert.strictEqual(h.controller.openDrawer(null, 0), true);
  for (index = 0; index < 7; index += 1) { h.controller.moveDrawer(1); }
  assert.strictEqual(h.controller.drawerSnapshot().index, 7, 'remote focus must use the logical provider total, not the resident queue length');
  assert.strictEqual(h.controller.pointDrawer(999), 999, 'pointer focus must reach the absolute last occurrence');
  assert.strictEqual(h.controller.moveDrawer(1), 999, 'focus must stop at the absolute provider boundary');
  h.controller.loadDrawerWindow({ viewportItems: 5, direction: 1 }, function (error, result) {
    assert.ifError(error);
    windowResult = result;
  });
  assert.strictEqual(windowResult.total, 1000);
  assert.strictEqual(windowResult.bounds.focusIndex, 999);
  assert.strictEqual(windowResult.items[0].absoluteIndex, 980);
  assert.strictEqual(windowResult.items[windowResult.items.length - 1].absoluteIndex, 999);
}());



(function startsAnExactNonResidentContainerOccurrence() {
  var items = [];
  var index;
  var container = { containerType: 'playlist', containerKey: '/playlists/select/items', title: 'Select', totalSize: 1000 };
  for (index = 0; index < 1000; index += 1) {
    items.push({ ratingKey: 'select-' + index, type: 'movie', title: 'Select ' + index });
  }
  var h = harness({
    detail: detail(items[0], [{ ratingKey: 'playlist', index: 1 }], [items[0]], 0, 0, true),
    container: container,
    containerItems: items,
    initialItems: [items[0]],
    currentIndex: 0,
    deferLegacyHydration: true
  });
  assert.strictEqual(h.controller.requestIndex(250, { versionAffinity: { codec: 'hevc' } }), true,
    'selecting a non-resident occurrence must start an asynchronous provider resolution');
  assert.strictEqual(h.requests.length, 1);
  assert.strictEqual(h.requests[0].item.ratingKey, 'select-250');
  assert.strictEqual(h.requests[0].index, 250);
  assert.strictEqual(h.requests[0].occurrenceId,
    Contract.occurrenceIdentity('playlist-/playlists/select/items', 250, 'select-250'));
  assert.strictEqual(h.requests[0].queue.index, 250);
  assert.strictEqual(h.requests[0].queue.currentItem.ratingKey, 'select-250');
  assert.strictEqual(h.requests[0].queue.currentOccurrenceId, h.requests[0].occurrenceId,
    'the compatibility queue passed to playback must identify the exact selected occurrence');
  assert.deepStrictEqual(h.requests[0].versionAffinity, { codec: 'hevc' });
}());



(function paginatedSelectionAllowsEarlierAbsoluteOccurrences() {
  var items = [];
  var index;
  var container = { containerType: 'playlist', containerKey: '/playlists/current/items', title: 'Current', totalSize: 1000 };
  for (index = 0; index < 1000; index += 1) {
    items.push({ ratingKey: 'current-' + index, type: 'movie', title: 'Current ' + index });
  }
  var h = harness({
    detail: detail(items[400], [{ ratingKey: 'playlist', index: 1 }], [items[400]], 0, 400, true),
    container: container,
    containerItems: items,
    initialItems: [items[400]],
    currentIndex: 400,
    deferLegacyHydration: true
  });
  assert.strictEqual(h.controller.requestIndex(200, {}), true,
    'the drawer must allow selecting an earlier visible absolute occurrence');
  assert.strictEqual(h.requests[0].previousIndex, 400,
    'backward selection must retain the current absolute occurrence for transition bookkeeping');
  assert.strictEqual(h.requests[0].index, 200);
}());


(function queueReplacementSuppressesLateMetadataStarts() {
  var first = { ratingKey: 'late-meta-0', type: 'movie', title: 'First' };
  var second = { ratingKey: 'late-meta-1', type: 'movie', title: 'Second' };
  var container = {
    containerType: 'playlist',
    containerKey: '/playlists/late-metadata/items',
    title: 'Late metadata',
    totalSize: 2
  };
  var h = harness({
    detail: detail(first, [{ ratingKey: 'playlist', index: 1 }], [first], 0, 0, true),
    container: container,
    containerItems: [first, second],
    initialItems: [first],
    currentIndex: 0,
    deferMetadata: true,
    abortMetadataSynchronously: true
  });
  assert.strictEqual(h.controller.requestIndex(1, {}), true);
  assert.strictEqual(h.pendingMetadata.length, 1);
  h.controller.clear();
  assert.strictEqual(h.pendingMetadata[0].request.aborted, true, 'queue replacement must abort pending metadata');
  h.pendingMetadata[0].callback(null, { ratingKey: second.ratingKey });
  assert.strictEqual(h.requests.length, 0, 'late metadata from a replaced queue must never start playback');
}());


(function upNextPreservesTheResolvedContainerOccurrence() {
  var duplicate = { ratingKey: 'same-up-next', type: 'movie', title: 'Same again' };
  var queue = { kind: 'container', title: 'Duplicates', items: [duplicate], index: 0 };
  var target = {
    state: 'available',
    item: duplicate,
    queue: queue,
    index: 41,
    absoluteIndex: 41,
    occurrenceId: 'playlist-duplicates:41:same-up-next'
  };
  var h = harness({ detail: {} });
  assert.strictEqual(h.controller.showUpNext(target, 1, 'compact'), true);
  assert.strictEqual(h.requests.length, 1, 'the immediate test clock must confirm Up Next once');
  assert.strictEqual(h.requests[0].occurrenceId, target.occurrenceId,
    'Up Next must preserve the exact resolved occurrence for duplicate playlist entries');
  assert.strictEqual(h.requests[0].queue.index, 41);
  assert.strictEqual(h.requests[0].queue.currentItem.ratingKey, duplicate.ratingKey);
  assert.strictEqual(h.requests[0].queue.currentOccurrenceId, target.occurrenceId,
    'the queue passed through Up Next must move to the exact duplicate occurrence');
}());

(function replacingAQueueSelectionSuppressesSynchronousAbortErrors() {
  var items = [
    { ratingKey: 'replace-0', type: 'movie', title: 'Zero' },
    { ratingKey: 'replace-1', type: 'movie', title: 'One' },
    { ratingKey: 'replace-2', type: 'movie', title: 'Two' }
  ];
  var container = {
    containerType: 'playlist',
    containerKey: '/playlists/replace-selection/items',
    title: 'Replace selection',
    totalSize: items.length
  };
  var h = harness({
    detail: detail(items[0], [{ ratingKey: 'playlist', index: 1 }], [items[0]], 0, 0, true),
    container: container,
    containerItems: items,
    initialItems: [items[0]],
    currentIndex: 0,
    deferMetadata: true,
    abortMetadataSynchronously: true
  });
  assert.strictEqual(h.controller.requestIndex(1, {}), true);
  assert.strictEqual(h.pendingMetadata.length, 1);
  assert.strictEqual(h.controller.requestIndex(2, {}), true);
  assert.strictEqual(h.pendingMetadata[0].request.aborted, true);
  assert.strictEqual(h.playbackErrors.length, 0,
    'a synchronously aborted obsolete metadata request must not publish an error');
  h.pendingMetadata[0].callback(null, { ratingKey: items[1].ratingKey });
  assert.strictEqual(h.requests.length, 0, 'late metadata from the replaced selection must remain silent');
  h.pendingMetadata[1].callback(null, { ratingKey: items[2].ratingKey });
  assert.strictEqual(h.requests.length, 1);
  assert.strictEqual(h.requests[0].item.ratingKey, items[2].ratingKey);
}());

(function waitForDetailPublishesOnlyTheLatestMetadataRequest() {
  var delivered = [];
  var h = harness({ detail: {}, deferMetadata: true, abortMetadataSynchronously: true });
  h.controller.waitForDetail('detail-a', function (error, value) {
    delivered.push({ key: 'a', error: error, value: value });
  });
  h.controller.waitForDetail('detail-b', function (error, value) {
    delivered.push({ key: 'b', error: error, value: value });
  });
  assert.strictEqual(h.pendingMetadata[0].request.aborted, true);
  assert.deepStrictEqual(delivered, [], 'synchronous abort must not publish the obsolete detail callback');
  h.pendingMetadata[0].callback(null, { ratingKey: 'detail-a' });
  assert.deepStrictEqual(delivered, [], 'late detail metadata must remain stale');
  h.pendingMetadata[1].callback(null, { ratingKey: 'detail-b' });
  assert.strictEqual(delivered.length, 1);
  assert.strictEqual(delivered[0].key, 'b');
  assert.ifError(delivered[0].error);
  assert.strictEqual(delivered[0].value.ratingKey, 'detail-b');
}());


(function seekingBackInvalidatesPendingUpNextResolution() {
  var first = { ratingKey: 'seek-back-up-next-0', type: 'movie', title: 'First' };
  var second = { ratingKey: 'seek-back-up-next-1', type: 'movie', title: 'Second' };
  var container = {
    containerType: 'playlist',
    containerKey: '/playlists/seek-back-up-next/items',
    title: 'Seek back Up Next',
    totalSize: 2
  };
  var h = harness({
    detail: detail(first, [{ ratingKey: 'playlist', index: 1 }], [first], 0, 0, true),
    container: container,
    containerItems: [first, second],
    initialItems: [first],
    currentIndex: 0,
    deferContainerPages: true
  });
  assert.strictEqual(h.controller.playbackEnded({ actualEnd: true, delay: 5, layout: 'compact' }), true);
  assert.strictEqual(h.controller.upNextSnapshot().preparing, true);
  assert.strictEqual(h.controller.observePlayback(20, 60), true,
    'moving away from the end must invalidate the pending automatic decision');
  assert.strictEqual(h.controller.upNextSnapshot().preparing, false);
  h.pendingContainerPages[0].callback(null, { totalSize: 2, items: [first, second] });
  assert.strictEqual(h.controller.upNextSnapshot().visible, false,
    'the late adjacent result must not reopen Up Next after seeking backward');
  assert.strictEqual(h.requests.length, 0);
  assert.strictEqual(h.gaps.length, 0);
  assert.strictEqual(h.controller.playbackEnded({ actualEnd: true, delay: 5, layout: 'compact' }), true,
    'a later native end must be allowed to start a fresh automatic decision');
  assert.strictEqual(h.requests.length, 1, 'the fresh automatic decision must reach the resolved next item');
  assert.strictEqual(h.requests[0].item.ratingKey, second.ratingKey);
}());

(function queueReplacementInvalidatesPendingUpNextResolution() {
  var first = { ratingKey: 'pending-up-next-0', type: 'movie', title: 'First' };
  var second = { ratingKey: 'pending-up-next-1', type: 'movie', title: 'Second' };
  var container = {
    containerType: 'playlist',
    containerKey: '/playlists/pending-up-next/items',
    title: 'Pending Up Next',
    totalSize: 2
  };
  var h = harness({
    detail: detail(first, [{ ratingKey: 'playlist', index: 1 }], [first], 0, 0, true),
    container: container,
    containerItems: [first, second],
    initialItems: [first],
    currentIndex: 0,
    deferContainerPages: true
  });
  assert.strictEqual(h.controller.playbackEnded({ actualEnd: true, delay: 5, layout: 'compact' }), true);
  assert.strictEqual(h.controller.upNextSnapshot().preparing, true);
  assert.strictEqual(h.pendingContainerPages.length, 1);
  h.controller.clear();
  assert.strictEqual(h.controller.upNextSnapshot().preparing, false,
    'replacing the logical queue must invalidate pending Up Next preparation');
  h.pendingContainerPages[0].callback(null, { totalSize: 2, items: [first, second] });
  assert.strictEqual(h.requests.length, 0);
  assert.strictEqual(h.gaps.length, 0, 'late Up Next resolution must not publish after queue replacement');
}());

(function upNextRequiresConfirmationBeforeCrossingAGap() {
  var e2 = episode(2, 10);
  var e4 = episode(4, 3);
  var h = harness({
    detail: detail(e2, [season(2), season(4)], [e2], 0, 0, false),
    episodesBySeason: { 4: [e4] }
  });
  assert.strictEqual(h.controller.playbackEnded({ actualEnd: true, delay: 5, layout: 'compact' }), true);
  assert.strictEqual(h.gaps.length, 1, 'Up Next must surface a gap confirmation instead of starting a target');
  assert.strictEqual(h.gaps[0].source, 'up-next');
  assert.strictEqual(h.gaps[0].confirmation.target.item.ratingKey, e4.ratingKey);
  assert.strictEqual(h.controller.upNextSnapshot().visible, false, 'the countdown must remain hidden until a contiguous target exists');
  assert.strictEqual(h.requests.length, 0, 'gap resolution must not start playback automatically');
}());

(function cancellingAnUpNextGapSuppressesOnlyAutomaticCrossing() {
  var e2 = episode(2, 10);
  var e4 = episode(4, 3);
  var h = harness({
    detail: detail(e2, [season(2), season(4)], [e2], 0, 0, false),
    episodesBySeason: { 4: [e4] }
  });
  var manualResult;
  assert.strictEqual(h.controller.playbackEnded({ actualEnd: true, delay: 5, layout: 'compact' }), true);
  assert.strictEqual(h.gaps.length, 1);
  h.controller.cancelUpNext(true);
  assert.strictEqual(h.controller.playbackEnded({ actualEnd: true, delay: 5, layout: 'compact' }), false,
    'cancelling an automatic gap must suppress repeated end notifications for the current occurrence');
  h.controller.resolveAdjacentState(1, function (error, value) {
    assert.ifError(error);
    manualResult = value;
  });
  assert.strictEqual(manualResult.state, 'confirmation-required',
    'manual Next may request a fresh confirmation after automatic crossing was dismissed');
  assert.notStrictEqual(manualResult.confirmation.token, h.gaps[0].confirmation.token);
}());

console.log('Playback queue sequence integration checks passed');
