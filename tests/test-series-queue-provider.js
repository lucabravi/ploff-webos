'use strict';

var assert = require('assert');
var Contract = require('../app/coordinator/queue-sequence-contract');
var Cache = require('../app/coordinator/bounded-queue-cache');
var Provider;

try {
  Provider = require('../app/coordinator/series-queue-provider');
} catch (error) {
  Provider = null;
}

assert.ok(Provider, 'the Series queue provider module must exist');

function season(number, key, leafCount) {
  return {
    ratingKey: key || 'season-' + number,
    index: number,
    title: number === 0 ? 'Specials' : 'Season ' + number,
    leafCount: leafCount
  };
}

function episode(seasonNumber, episodeNumber, key, playable) {
  return {
    ratingKey: key || 's' + seasonNumber + 'e' + episodeNumber,
    type: playable === false ? 'clip' : 'episode',
    title: 'Episode ' + episodeNumber,
    parentIndex: seasonNumber,
    seasonIndex: seasonNumber,
    index: episodeNumber,
    episodeIndex: episodeNumber,
    image: '/art/' + (key || 's' + seasonNumber + 'e' + episodeNumber)
  };
}

function harness(config) {
  var loads = [];
  var pending = [];
  var map = config.episodesBySeason || {};
  var provider = Provider.create({
    QueueSequenceContract: config.contract || Contract,
    BoundedQueueCache: config.cache || Cache,
    pageSize: 40,
    maxPages: config.maxPages || 5,
    maxRecords: config.maxRecords || 200,
    loadSeasonEpisodes: function (seasonRecord, callback) {
      var request = {
        aborted: false,
        abort: function () {
          this.aborted = true;
          if (config.abortSynchronously) { callback(new Error('aborted')); }
        }
      };
      loads.push({ season: seasonRecord, callback: callback, request: request });
      if (!config.defer) {
        callback(null, map[String(seasonRecord.index)] || []);
      } else {
        pending.push({ season: seasonRecord, callback: callback, request: request });
      }
      return request;
    }
  });
  return { provider: provider, loads: loads, pending: pending };
}

function open(provider, values) {
  provider.open({
    kind: 'series',
    id: values.id || 'show-1',
    title: values.title || 'Example Show',
    seasons: values.seasons,
    currentItem: values.current,
    currentSeasonNumber: values.currentSeasonNumber,
    currentEpisodeNumber: values.currentEpisodeNumber,
    currentSeasonEpisodes: values.currentSeasonEpisodes
  });
  return provider.current();
}

(function regularOriginsNeverEnterSpecials() {
  var seasons = [season(0), season(1), season(2)];
  var s1e1 = episode(1, 1);
  var s2e1 = episode(2, 1);
  var h = harness({ episodesBySeason: { 0: [episode(0, 1)], 2: [s2e1] } });
  var current = open(h.provider, {
    seasons: seasons,
    current: s1e1,
    currentSeasonNumber: 1,
    currentEpisodeNumber: 1,
    currentSeasonEpisodes: [s1e1]
  });
  var result;
  h.provider.resolveAdjacent(current, 1, function (error, state) {
    assert.ifError(error);
    result = state;
  });
  assert.strictEqual(result.state, 'available');
  assert.strictEqual(result.item.ratingKey, s2e1.ratingKey);
  assert.deepStrictEqual(h.loads.map(function (entry) { return Number(entry.season.index); }), [2],
    'regular traversal must not load or enter Specials');
}());

(function specialsOriginsRemainSpecialsOnly() {
  var specials = [episode(0, 1), episode(0, 2)];
  var h = harness({ episodesBySeason: { 1: [episode(1, 1)] } });
  var current = open(h.provider, {
    seasons: [season(0), season(1)],
    current: specials[0],
    currentSeasonNumber: 0,
    currentEpisodeNumber: 1,
    currentSeasonEpisodes: specials
  });
  var next;
  var end;
  h.provider.resolveAdjacent(current, 1, function (error, state) {
    assert.ifError(error);
    next = state;
  });
  assert.strictEqual(next.state, 'available');
  assert.strictEqual(next.item.ratingKey, specials[1].ratingKey);
  h.provider.resolveAdjacent(next, 1, function (error, state) {
    assert.ifError(error);
    end = state;
  });
  assert.deepStrictEqual(end, { state: 'unavailable' });
  assert.strictEqual(h.loads.length, 0, 'Specials traversal must not inspect regular seasons');
}());

(function reportsForwardEpisodeGapsWithoutStartingPlayback() {
  var e1 = episode(1, 1);
  var e3 = episode(1, 3);
  var h = harness({});
  var current = open(h.provider, {
    seasons: [season(1, 's1', 3)],
    current: e1,
    currentSeasonNumber: 1,
    currentEpisodeNumber: 1,
    currentSeasonEpisodes: [e1, e3]
  });
  var result;
  h.provider.resolveAdjacent(current, 1, function (error, state) {
    assert.ifError(error);
    result = state;
  });
  assert.strictEqual(result.state, 'confirmation-required');
  assert.strictEqual(result.confirmation.kind, 'episode');
  assert.deepStrictEqual(result.confirmation.missingEpisodes, { start: 2, end: 2 });
  assert.strictEqual(result.confirmation.target.item.ratingKey, e3.ratingKey);
  assert.ok(result.confirmation.token, 'gap confirmation must have a stable token');
}());

(function reportsBackwardEpisodeGaps() {
  var e1 = episode(1, 1);
  var e4 = episode(1, 4);
  var h = harness({});
  var current = open(h.provider, {
    seasons: [season(1, 's1', 4)],
    current: e4,
    currentSeasonNumber: 1,
    currentEpisodeNumber: 4,
    currentSeasonEpisodes: [e1, e4]
  });
  var result;
  h.provider.resolveAdjacent(current, -1, function (error, state) {
    assert.ifError(error);
    result = state;
  });
  assert.strictEqual(result.state, 'confirmation-required');
  assert.strictEqual(result.confirmation.kind, 'episode');
  assert.deepStrictEqual(result.confirmation.missingEpisodes, { start: 2, end: 3 });
  assert.strictEqual(result.confirmation.direction, -1);
  assert.strictEqual(result.confirmation.target.item.ratingKey, e1.ratingKey);
}());

(function reportsSeasonGapsAcrossMissingSeasons() {
  var e2 = episode(2, 8);
  var e4 = episode(4, 1);
  var h = harness({ episodesBySeason: { 4: [e4] } });
  var current = open(h.provider, {
    seasons: [season(2), season(4)],
    current: e2,
    currentSeasonNumber: 2,
    currentEpisodeNumber: 8,
    currentSeasonEpisodes: [e2]
  });
  var result;
  h.provider.resolveAdjacent(current, 1, function (error, state) {
    assert.ifError(error);
    result = state;
  });
  assert.strictEqual(result.state, 'confirmation-required');
  assert.strictEqual(result.confirmation.kind, 'season');
  assert.deepStrictEqual(result.confirmation.missingSeasons, { start: 3, end: 3 });
  assert.strictEqual(result.confirmation.target.item.ratingKey, e4.ratingKey);
}());

(function emptySeasonsCountAsUnavailableRanges() {
  var e2 = episode(2, 8);
  var e4 = episode(4, 1);
  var h = harness({ episodesBySeason: { 3: [], 4: [e4] } });
  var current = open(h.provider, {
    seasons: [season(2), season(3), season(4)],
    current: e2,
    currentSeasonNumber: 2,
    currentEpisodeNumber: 8,
    currentSeasonEpisodes: [e2]
  });
  var result;
  h.provider.resolveAdjacent(current, 1, function (error, state) {
    assert.ifError(error);
    result = state;
  });
  assert.strictEqual(result.state, 'confirmation-required');
  assert.strictEqual(result.confirmation.kind, 'season');
  assert.deepStrictEqual(result.confirmation.missingSeasons, { start: 3, end: 3 });
  assert.deepStrictEqual(h.loads.map(function (entry) { return Number(entry.season.index); }), [3, 4]);
}());

(function combinesSeasonAndInitialEpisodeGapsIntoOneConfirmation() {
  var e2 = episode(2, 10);
  var e4 = episode(4, 3);
  var h = harness({ episodesBySeason: { 4: [e4] } });
  var current = open(h.provider, {
    seasons: [season(2), season(4)],
    current: e2,
    currentSeasonNumber: 2,
    currentEpisodeNumber: 10,
    currentSeasonEpisodes: [e2]
  });
  var result;
  h.provider.resolveAdjacent(current, 1, function (error, state) {
    assert.ifError(error);
    result = state;
  });
  assert.strictEqual(result.state, 'confirmation-required');
  assert.strictEqual(result.confirmation.kind, 'combined');
  assert.deepStrictEqual(result.confirmation.missingSeasons, { start: 3, end: 3 });
  assert.deepStrictEqual(result.confirmation.missingEpisodes, { start: 1, end: 2 });
  assert.strictEqual(result.confirmation.target.item.ratingKey, e4.ratingKey);
}());

(function adjacentSeasonAndEpisodeOneRemainImmediatelyAvailable() {
  var e1 = episode(1, 2);
  var e2 = episode(2, 1);
  var h = harness({ episodesBySeason: { 2: [e2] } });
  var current = open(h.provider, {
    seasons: [season(1), season(2)],
    current: e1,
    currentSeasonNumber: 1,
    currentEpisodeNumber: 2,
    currentSeasonEpisodes: [e1]
  });
  var result;
  h.provider.resolveAdjacent(current, 1, function (error, state) {
    assert.ifError(error);
    result = state;
  });
  assert.strictEqual(result.state, 'available');
  assert.strictEqual(result.item.ratingKey, e2.ratingKey);
}());

(function crossSeasonTargetsCarryTheCompleteDestinationSeason() {
  var current = episode(1, 12);
  var next = episode(2, 1);
  var following = episode(2, 2);
  var h = harness({ episodesBySeason: { 2: [next, following] } });
  var result;
  open(h.provider, {
    seasons: [season(1, 's1', 12), season(2, 's2', 2)],
    current: current,
    currentSeasonNumber: 1,
    currentEpisodeNumber: 12,
    currentSeasonEpisodes: [current]
  });
  h.provider.resolveAdjacent(current, 1, function (error, state) {
    assert.ifError(error);
    result = state;
  });
  assert.strictEqual(result.state, 'available');
  assert.deepStrictEqual(result.item.queueEpisodes.map(function (item) { return item.ratingKey; }), [
    next.ratingKey,
    following.ratingKey
  ], 'a cross-season target must carry the complete playable destination season');
}());

(function repeatedActivationDoesNotDuplicatePendingResolution() {
  var e1 = episode(1, 1);
  var e2 = episode(2, 1);
  var h = harness({ defer: true, episodesBySeason: { 2: [e2] } });
  var current = open(h.provider, {
    seasons: [season(1), season(2)],
    current: e1,
    currentSeasonNumber: 1,
    currentEpisodeNumber: 1,
    currentSeasonEpisodes: [e1]
  });
  var completed = 0;
  h.provider.resolveAdjacent(current, 1, function () { completed += 1; });
  h.provider.resolveAdjacent(current, 1, function () { completed += 100; });
  assert.strictEqual(h.loads.length, 1, 'repeated activation must not duplicate a season request');
  h.pending[0].callback(null, [e2]);
  assert.strictEqual(completed, 1, 'repeated activation must not queue a second future playback action');
}());

(function staleAndSynchronousAbortResponsesCannotPublish() {
  var e1 = episode(1, 1);
  var e2 = episode(2, 1);
  var h = harness({ defer: true, abortSynchronously: true });
  var current = open(h.provider, {
    id: 'old-show',
    seasons: [season(1), season(2)],
    current: e1,
    currentSeasonNumber: 1,
    currentEpisodeNumber: 1,
    currentSeasonEpisodes: [e1]
  });
  var completed = 0;
  h.provider.resolveAdjacent(current, 1, function () { completed += 1; });
  open(h.provider, {
    id: 'new-show',
    seasons: [season(1)],
    current: e1,
    currentSeasonNumber: 1,
    currentEpisodeNumber: 1,
    currentSeasonEpisodes: [e1]
  });
  h.pending[0].callback(null, [e2]);
  assert.strictEqual(completed, 0, 'old callbacks must be ignored after an origin replacement');
  assert.strictEqual(h.provider.snapshot().originId, 'new-show');
}());


(function changingTheCurrentOccurrenceInvalidatesPendingAdjacentResults() {
  var first = episode(1, 1);
  var replacement = episode(1, 2);
  var nextSeason = episode(2, 1);
  var h = harness({ defer: true });
  var current = open(h.provider, {
    seasons: [season(1), season(2)],
    current: first,
    currentSeasonNumber: 1,
    currentEpisodeNumber: 1,
    currentSeasonEpisodes: [first]
  });
  var delivered = 0;
  var resolved = null;
  h.provider.resolveAdjacent(current, 1, function () { delivered += 1; });
  assert.strictEqual(h.pending.length, 1);
  assert.strictEqual(h.provider.setCurrent(replacement), true);
  h.pending[0].callback(null, [nextSeason]);
  assert.strictEqual(delivered, 0,
    'an adjacent result calculated for the previous episode must not publish after current identity changes');
  h.provider.resolveAdjacent(h.provider.current(), 1, function (error, value) {
    assert.ifError(error);
    resolved = value;
  });
  assert.strictEqual(resolved.state, 'available');
  assert.strictEqual(resolved.item.ratingKey, nextSeason.ratingKey);
  assert.strictEqual(h.loads.length, 1,
    'invalidating the old decision must retain the completed season request for the new current occurrence');
}());

(function exposesAbsolutePositionsAndLoadsOnlyIntersectingSeasonWindows() {
  var s1e1 = episode(1, 1);
  var s1e2 = episode(1, 2);
  var s2e1 = episode(2, 1);
  var s2e2 = episode(2, 2);
  var h = harness({ episodesBySeason: { 2: [s2e1, s2e2], 3: [episode(3, 1), episode(3, 2)] } });
  var current = open(h.provider, {
    seasons: [season(1, 's1', 2), season(2, 's2', 2), season(3, 's3', 2)],
    current: s1e1,
    currentSeasonNumber: 1,
    currentEpisodeNumber: 1,
    currentSeasonEpisodes: [s1e1, s1e2]
  });
  var result;
  assert.strictEqual(current.absoluteIndex, 0, 'the active series occurrence must expose its logical queue index');
  h.provider.window(1, 4, function (error, value) {
    assert.ifError(error);
    result = value;
  });
  assert.deepStrictEqual(h.loads.map(function (entry) { return Number(entry.season.index); }), [2],
    'a series window must load only the unloaded season intersecting the requested range');
  assert.strictEqual(result.total, 6);
  assert.deepStrictEqual(result.items.map(function (value) { return value.absoluteIndex; }), [1, 2, 3]);
  assert.deepStrictEqual(result.items.map(function (value) { return value.item.ratingKey; }),
    [s1e2.ratingKey, s2e1.ratingKey, s2e2.ratingKey]);
}());

(function resolvesAnUnloadedAbsolutePositionWithoutHydratingOtherSeasons() {
  var s1e1 = episode(1, 1);
  var s3e1 = episode(3, 1);
  var h = harness({ episodesBySeason: { 3: [s3e1, episode(3, 2)] } });
  var resolved;
  open(h.provider, {
    seasons: [season(1, 's1', 2), season(2, 's2', 2), season(3, 's3', 2)],
    current: s1e1,
    currentSeasonNumber: 1,
    currentEpisodeNumber: 1,
    currentSeasonEpisodes: [s1e1, episode(1, 2)]
  });
  h.provider.resolveAt(4, function (error, value) {
    assert.ifError(error);
    resolved = value;
  });
  assert.deepStrictEqual(h.loads.map(function (entry) { return Number(entry.season.index); }), [3],
    'resolving a distant occurrence must not hydrate intermediate seasons');
  assert.strictEqual(resolved.absoluteIndex, 4);
  assert.strictEqual(resolved.item.ratingKey, s3e1.ratingKey);
}());

(function rebasesAbsoluteResolutionAfterEarlierCountsShrink() {
  var s1e1 = episode(1, 1);
  var unavailable = episode(1, 2, 's1e2-unavailable', false);
  var s2e1 = episode(2, 1);
  var s2e2 = episode(2, 2);
  var h = harness({ episodesBySeason: { 1: [s1e1, unavailable] } });
  var resolved;
  open(h.provider, {
    seasons: [season(1, 's1', 2), season(2, 's2', 2)],
    current: s2e1,
    currentSeasonNumber: 2,
    currentEpisodeNumber: 1,
    currentSeasonEpisodes: [s2e1, s2e2]
  });
  h.provider.resolveAt(1, function (error, value) {
    assert.ifError(error);
    resolved = value;
  });
  assert.deepStrictEqual(h.loads.map(function (entry) { return Number(entry.season.index); }), [1],
    'absolute resolution must load only the season initially covering the requested index');
  assert.ok(resolved, 'the requested absolute position must be resolved again after the layout changes');
  assert.strictEqual(resolved.absoluteIndex, 1);
  assert.strictEqual(resolved.item.ratingKey, s2e1.ratingKey,
    'a stale declared count must not make an absolute position disappear after loading the earlier season');
}());

(function specialsWindowsNeverInspectRegularSeasons() {
  var special1 = episode(0, 1);
  var special2 = episode(0, 2);
  var h = harness({ episodesBySeason: { 1: [episode(1, 1)] } });
  var result;
  open(h.provider, {
    seasons: [season(0, 'specials', 2), season(1, 's1', 1)],
    current: special1,
    currentSeasonNumber: 0,
    currentEpisodeNumber: 1,
    currentSeasonEpisodes: [special1, special2]
  });
  h.provider.window(0, 2, function (error, value) {
    assert.ifError(error);
    result = value;
  });
  assert.strictEqual(result.total, 2);
  assert.deepStrictEqual(result.items.map(function (value) { return value.item.ratingKey; }),
    [special1.ratingKey, special2.ratingKey]);
  assert.strictEqual(h.loads.length, 0, 'a Specials window must never inspect a regular season');
}());

(function loadedSeasonsCountOnlyPlayableOccurrences() {
  var e1 = episode(1, 1);
  var unavailable = episode(1, 2, 's1e2-unavailable', false);
  var e3 = episode(1, 3);
  var h = harness({});
  var result;
  open(h.provider, {
    seasons: [season(1, 's1', 3)],
    current: e1,
    currentSeasonNumber: 1,
    currentEpisodeNumber: 1,
    currentSeasonEpisodes: [e1, unavailable, e3]
  });
  h.provider.window(0, 3, function (error, value) {
    assert.ifError(error);
    result = value;
  });
  assert.strictEqual(result.total, 2,
    'a loaded season must not expose phantom drawer positions for unplayable records');
  assert.deepStrictEqual(result.items.map(function (value) { return value.item.ratingKey; }),
    [e1.ratingKey, e3.ratingKey]);
  assert.strictEqual(h.provider.resolveAt(2, function () {}), false,
    'absolute positions beyond the playable sequence must be unavailable');
}());


(function updatesTheCurrentOccurrenceWithoutReplacingTheSeriesGeneration() {
  var first = episode(1, 1);
  var second = episode(1, 2);
  var h = harness({});
  open(h.provider, {
    seasons: [season(1)],
    current: first,
    currentSeasonNumber: 1,
    currentEpisodeNumber: 1,
    currentSeasonEpisodes: [first, second]
  });
  var generation = h.provider.snapshot().generation;
  assert.strictEqual(h.provider.setCurrent(second), true);
  assert.strictEqual(h.provider.current().item.ratingKey, second.ratingKey);
  assert.strictEqual(h.provider.snapshot().currentOccurrenceId,
    Contract.seriesOccurrenceIdentity('series-show-1-regular', 1, 2, second.ratingKey));
  assert.strictEqual(h.provider.snapshot().generation, generation,
    'moving inside the same logical series origin must preserve provider generation and cache ownership');
  assert.strictEqual(h.loads.length, 0, 'updating the current occurrence must not trigger Plex I/O');
}());

(function snapshotBuildsTheCurrentOccurrenceOnce() {
  var identityCalls = 0;
  var contract = Object.create(Contract);
  var originalIdentity = Contract.seriesOccurrenceIdentity;
  var e1 = episode(1, 1);
  var h;
  contract.seriesOccurrenceIdentity = function () {
    identityCalls += 1;
    return originalIdentity.apply(null, arguments);
  };
  h = harness({ contract: contract });
  open(h.provider, {
    seasons: [season(1, 's1', 1)],
    current: e1,
    currentSeasonNumber: 1,
    currentEpisodeNumber: 1,
    currentSeasonEpisodes: [e1]
  });
  identityCalls = 0;
  h.provider.snapshot();
  assert.strictEqual(identityCalls, 1,
    'one provider snapshot must not reconstruct the current occurrence twice');
}());

(function snapshotDoesNotTouchResidentSeasonPages() {
  var reads = 0;
  var cache = {
    create: function (options) {
      var instance = Cache.create(options);
      var getPage = instance.getPage;
      instance.getPage = function (start) { reads += 1; return getPage(start); };
      return instance;
    }
  };
  var e1 = episode(1, 1);
  var h = harness({ cache: cache });
  open(h.provider, {
    seasons: [season(1, 's1', 1)],
    current: e1,
    currentSeasonNumber: 1,
    currentEpisodeNumber: 1,
    currentSeasonEpisodes: [e1]
  });
  reads = 0;
  h.provider.snapshot();
  assert.strictEqual(reads, 0,
    'publishing provider state must not refresh metadata-page recency or rebuild a resident segment');
}());

(function rejectsChangedSeasonSegmentsAfterEviction() {
  var config = {
    maxPages: 1,
    maxRecords: 40,
    episodesBySeason: {
      2: [episode(2, 1, 'original-s2e1')],
      3: [episode(3, 1, 's3e1')]
    }
  };
  var h = harness(config);
  var changedError;
  open(h.provider, {
    seasons: [season(1, 's1', 1), season(2, 's2', 1), season(3, 's3', 1)],
    current: episode(1, 1),
    currentSeasonNumber: 1,
    currentEpisodeNumber: 1,
    currentSeasonEpisodes: [episode(1, 1)]
  });
  h.provider.resolveAt(1, function (error) { assert.ifError(error); });
  h.provider.resolveAt(2, function (error) { assert.ifError(error); });
  config.episodesBySeason['2'] = [episode(2, 1, 'replacement-s2e1')];
  h.provider.resolveAt(1, function (error) { changedError = error; });
  assert.ok(changedError, 'an evicted season that changed remotely must not remap logical queue positions');
  assert.strictEqual(h.provider.snapshot().residentRecords, 1,
    'an incompatible replacement segment must not enter the bounded cache');
}());

(function keepsThousandEpisodeSeriesWindowsWithinMetadataBounds() {
  var seasons = [];
  var episodesBySeason = {};
  var seasonNumber;
  var episodeNumber;
  var records;
  var h;
  var result;
  for (seasonNumber = 1; seasonNumber <= 50; seasonNumber += 1) {
    seasons.push(season(seasonNumber, 'large-s' + seasonNumber, 20));
    records = [];
    for (episodeNumber = 1; episodeNumber <= 20; episodeNumber += 1) {
      records.push(episode(seasonNumber, episodeNumber));
    }
    episodesBySeason[String(seasonNumber)] = records;
  }
  h = harness({ episodesBySeason: episodesBySeason });
  open(h.provider, {
    seasons: seasons,
    current: episodesBySeason['1'][0],
    currentSeasonNumber: 1,
    currentEpisodeNumber: 1,
    currentSeasonEpisodes: episodesBySeason['1']
  });
  h.provider.window(483, 518, function (error, value) {
    assert.ifError(error);
    result = value;
  });
  assert.strictEqual(result.total, 1000);
  assert.strictEqual(result.items.length, 35);
  assert.strictEqual(result.items[0].absoluteIndex, 483);
  assert.strictEqual(result.items[34].absoluteIndex, 517);
  assert.ok(h.provider.snapshot().residentPages <= 5);
  assert.ok(h.provider.snapshot().residentRecords <= 200);
  assert.ok(h.provider.snapshot().peakResidentRecords <= 200,
    'transient series window loading must respect the metadata hard bound');
}());

(function rebasesLaterSeasonOffsetsAfterPlayableCountsBecomeKnown() {
  var s1e1 = episode(1, 1);
  var unavailable = episode(1, 2, 's1e2-unavailable', false);
  var s1e3 = episode(1, 3);
  var s2e1 = episode(2, 1);
  var s2e2 = episode(2, 2);
  var h = harness({ episodesBySeason: { 1: [s1e1, unavailable, s1e3] } });
  var result;
  open(h.provider, {
    seasons: [season(1, 's1', 3), season(2, 's2', 2)],
    current: s2e1,
    currentSeasonNumber: 2,
    currentEpisodeNumber: 1,
    currentSeasonEpisodes: [s2e1, s2e2]
  });
  h.provider.window(0, 5, function (error, value) {
    assert.ifError(error);
    result = value;
  });
  assert.strictEqual(result.total, 4,
    'the sequence total must shrink to the playable occurrence count');
  assert.deepStrictEqual(result.items.map(function (value) { return value.absoluteIndex; }), [0, 1, 2, 3],
    'later seasons must be rebased after an earlier playable count changes');
  assert.deepStrictEqual(result.items.map(function (value) { return value.item.ratingKey; }),
    [s1e1.ratingKey, s1e3.ratingKey, s2e1.ratingKey, s2e2.ratingKey]);
  assert.strictEqual(h.loads.length, 1,
    'layout stabilization must reuse the loaded season instead of repeating Plex I/O');
}());


(function reportsSynchronousSeasonTransportThrowsAndAllowsRetry() {
  var current = episode(1, 1);
  var next = episode(2, 1);
  var attempts = 0;
  var receivedError = null;
  var resolved = null;
  var provider = Provider.create({
    QueueSequenceContract: Contract,
    BoundedQueueCache: Cache,
    pageSize: 40,
    maxPages: 5,
    maxRecords: 200,
    loadSeasonEpisodes: function (_season, callback) {
      attempts += 1;
      if (attempts === 1) { throw new Error('season transport failed'); }
      callback(null, [next]);
    }
  });
  var occurrence = open(provider, {
    seasons: [season(1), season(2)],
    current: current,
    currentSeasonNumber: 1,
    currentEpisodeNumber: 1,
    currentSeasonEpisodes: [current]
  });
  assert.doesNotThrow(function () {
    provider.resolveAdjacent(occurrence, 1, function (error) { receivedError = error; });
  }, 'a synchronous season transport failure must be reported through the provider callback');
  assert.ok(receivedError);
  assert.strictEqual(provider.snapshot().pendingSeasons, 0, 'a synchronous throw must release season ownership');
  provider.resolveAdjacent(occurrence, 1, function (error, value) { assert.ifError(error); resolved = value; });
  assert.strictEqual(resolved.state, 'available');
  assert.strictEqual(resolved.item.ratingKey, next.ratingKey, 'the season must remain retryable after a transport throw');
}());

console.log('Series queue provider checks passed');

(function closeAbortsPendingSeasonResolutionAndClearsOrigin() {
  var e1 = episode(1, 1);
  var h = harness({ defer: true, abortSynchronously: true });
  var current = open(h.provider, {
    seasons: [season(1), season(2)],
    current: e1,
    currentSeasonNumber: 1,
    currentEpisodeNumber: 1,
    currentSeasonEpisodes: [e1]
  });
  var delivered = 0;
  h.provider.resolveAdjacent(current, 1, function () { delivered += 1; });
  assert.strictEqual(h.provider.close(), true);
  assert.strictEqual(h.pending[0].request.aborted, true);
  h.pending[0].callback(null, [episode(2, 1)]);
  assert.strictEqual(delivered, 0);
  assert.strictEqual(h.provider.snapshot().kind, '');
}());
