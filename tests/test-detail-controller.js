'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var Controller = require('../app/coordinator/detail-controller');
var DetailNavigation = require('../app/detail-navigation');
var MetadataRefresh = require('../app/metadata-refresh');

function clock() {
  var next = 1;
  var timers = {};
  return {
    timers: timers,
    setTimeout: function (callback) { var id = next; next += 1; timers[id] = callback; return id; },
    clearTimeout: function (id) { delete timers[id]; },
    run: function (id) { var callback = timers[id]; delete timers[id]; if (callback) { callback(); } },
    runAll: function () { Object.keys(timers).map(Number).forEach(function (id) { this.run(id); }, this); }
  };
}

function harness(extra) {
  var root = clock();
  var metadata = [];
  var mediaProfiles = [];
  var playback = [];
  var focus = [];
  var pending = [];
  var actions = [];
  var now = 1000;
  var values = {
    root: root,
    DetailNavigation: DetailNavigation,
    MetadataRefresh: MetadataRefresh,
    loadMetadata: function (key, callback) { metadata.push({ key: key, callback: callback }); return { abort: function () {} }; },
    loadMediaProfile: function (key, callback) { var request = { key: key, callback: callback, abort: function () { request.aborted = true; } }; mediaProfiles.push(request); return request; },
    preparePreferences: function (identity) { actions.push(['prepare', identity]); },
    clearPreferences: function () { actions.push(['clear']); },
    setMediaProfile: function (profile) { actions.push(['profile', profile]); },
    playbackPreferences: function (affinity) { return { videoQuality: 'original', affinity: affinity || '' }; },
    selectedMediaProfile: function () { return { mediaIndex: 1, partIndex: 0 }; },
    resolvedTracks: function () { return { audioTrack: { id: 10 }, subtitleTrack: { id: 20 } }; },
    requestPlayback: function (request) { playback.push(request); },
    onFocusChanged: function (state, effect) { focus.push({ state: state, effect: effect }); },
    onRefreshPending: function (value) { pending.push(value); },
    now: function () { return now; },
    mediaInfoOpen: function () { return false; },
    summaryOpen: function () { return false; },
    openPlayer: function () { actions.push(['open-player']); },
    closeDetail: function () { actions.push(['close-detail']); },
    navigate: function (direction) { actions.push(['navigate', direction]); },
    activateNavigation: function () { actions.push(['activate-navigation']); },
    loadSeason: function () { actions.push(['load-season']); },
    playEpisode: function (episode) { actions.push(['play-episode', episode && episode.ratingKey]); },
    openChoice: function (kind) { actions.push(['choice', kind]); },
    openVersionDetails: function () { actions.push(['version-details']); },
    openSummary: function () { actions.push(['summary']); },
    toggleWatched: function () { actions.push(['watched']); },
    toggleWatchlist: function () { actions.push(['watchlist']); },
    openDetailOptions: function () { actions.push(['options']); }
  };
  Object.keys(extra || {}).forEach(function (key) { values[key] = extra[key]; });
  return {
    root: root,
    metadata: metadata,
    mediaProfiles: mediaProfiles,
    playback: playback,
    focus: focus,
    pending: pending,
    actions: actions,
    setNow: function (value) { now = value; },
    controller: Controller.create(values)
  };
}

(function testMovieOpenAndStaleMetadataSuppression() {
  var h = harness();
  h.controller.open({ ratingKey: 'm1', type: 'movie' }, { returnView: 'home' });
  h.controller.loadSelected({ ratingKey: 'm1' }, function () { h.actions.push(['m1-complete']); });
  h.controller.open({ ratingKey: 'm2', type: 'movie' }, { returnView: 'library' });
  h.controller.loadSelected({ ratingKey: 'm2' }, function () { h.actions.push(['m2-complete']); });
  h.metadata[0].callback(null, { ratingKey: 'm1', type: 'movie' });
  assert.strictEqual(h.controller.snapshot().currentDetail, null, 'metadata from an earlier detail generation must be ignored');
  h.metadata[1].callback(null, { ratingKey: 'm2', type: 'movie' });
  assert.strictEqual(h.controller.snapshot().currentDetail.ratingKey, 'm2');
  assert.strictEqual(h.controller.snapshot().returnView, 'library');
}());

(function testEpisodeAndSeasonPreviewGeneration() {
  var h = harness();
  var callbacks = [];
  var first = { ratingKey: 'e1' };
  var second = { ratingKey: 'e2' };
  h.controller.open(first);
  h.controller.setSeriesContext({ seasons: [{ ratingKey: 's1' }, { ratingKey: 's2' }], episodes: [first, second] });
  h.controller.setFocus({ zone: 'seasons', seasonIndex: 0, episodeIndex: 0 });
  h.controller.scheduleSeasonPreview(function (season, callback) { callbacks.push({ season: season, callback: callback }); }, function (error, episodes) {
    h.actions.push(['preview', error, episodes.length]);
  }, 10);
  h.root.runAll();
  h.controller.setFocus({ seasonIndex: 1 });
  h.controller.scheduleSeasonPreview(function (season, callback) { callbacks.push({ season: season, callback: callback }); }, function (error, episodes) {
    h.actions.push(['preview-current', error, episodes.length]);
  }, 10);
  h.root.runAll();
  callbacks[0].callback(null, [first]);
  callbacks[1].callback(null, [second]);
  assert.deepStrictEqual(h.actions.filter(function (entry) { return entry[0].indexOf('preview') === 0; }), [['preview-current', null, 1]], 'stale season previews must not update the visible episode data');

  h.controller.setSeriesContext({ seasons: [{ ratingKey: 's2' }], episodes: [first, second] });
  h.controller.setFocus({ episodeIndex: 0 });
  h.controller.loadEpisode(first, function () { h.actions.push(['episode-1']); });
  h.controller.setFocus({ episodeIndex: 1 });
  h.controller.loadEpisode(second, function () { h.actions.push(['episode-2']); });
  h.metadata[h.metadata.length - 2].callback(null, { ratingKey: 'e1', type: 'episode' });
  h.metadata[h.metadata.length - 1].callback(null, { ratingKey: 'e2', type: 'episode' });
  assert.strictEqual(h.controller.snapshot().currentDetail.ratingKey, 'e2', 'only the currently focused episode may replace detail metadata');
}());

(function testMediaProfileGateAndPlainPlaybackRequest() {
  var h = harness();
  h.controller.open({ ratingKey: 'e1', type: 'episode' });
  h.controller.setCurrentDetail({ ratingKey: 'e1', type: 'episode' });
  h.controller.prepareMediaProfile({ ratingKey: 'e1' }, 'server|profile|episode');
  assert.strictEqual(h.controller.requestPlayback({ resume: true }), false, 'play must wait until required media data is ready');
  h.controller.loadMediaProfile({ ratingKey: 'e1' });
  h.mediaProfiles[0].callback(null, { mediaIndex: 1, partIndex: 0 });
  var request = h.controller.requestPlayback({ resume: true, versionAffinity: '4k-hdr' });
  assert.strictEqual(request.resume, true);
  assert.strictEqual(request.preferences.affinity, '4k-hdr');
  assert.strictEqual(request.mediaProfile.mediaIndex, 1);
  assert.strictEqual(request.resolvedTracks.audioTrack.id, 10);
  assert.strictEqual(h.playback[0], request, 'playback must be emitted as one plain request object');
  assert.strictEqual(Object.getPrototypeOf(request), Object.prototype);
}());

(function testRefreshOrderAndSingleFlight() {
  var refreshes = [];
  var waits = [];
  var reloads = [];
  var callbacks = {};
  var h = harness({
    refreshMetadata: function (key, callback) { refreshes.push(key); callbacks['refresh-' + key] = callback; },
    waitForActivity: function (activity, callback) { waits.push(activity); callbacks['wait-' + activity] = callback; }
  });
  h.controller.open({ ratingKey: 'episode' });
  h.controller.setCurrentDetail({ ratingKey: 'episode', type: 'episode' });
  assert.strictEqual(h.controller.refresh(['episode', 'season', 'series'], function (key, callback) {
    reloads.push(key); callbacks['reload-' + key] = callback;
  }, function (error) { assert.ifError(error); h.actions.push(['refresh-complete']); }), true);
  assert.strictEqual(h.controller.refresh(['duplicate'], function () {}, function () {}), false, 'metadata refresh must remain single-flight');
  callbacks['refresh-episode'](null, 'a1'); callbacks['wait-a1'](); callbacks['reload-episode'](null);
  callbacks['refresh-season'](null, 'a2'); callbacks['wait-a2'](); callbacks['reload-season'](null);
  callbacks['refresh-series'](null, 'a3'); callbacks['wait-a3'](); callbacks['reload-series'](null);
  assert.deepStrictEqual(refreshes, ['episode', 'season', 'series']);
  assert.deepStrictEqual(reloads, ['episode', 'season', 'series']);
  assert.deepStrictEqual(h.pending, [true, false]);
}());

(function testFocusRoutesInputAndBackGracePeriod() {
  var h = harness();
  h.controller.open({ ratingKey: 'e1' }, { backLockedUntil: 1500 });
  h.controller.setSeriesContext({ seasons: [{ ratingKey: 's1' }], episodes: [{ ratingKey: 'e1' }] });
  h.controller.setFocus({ zone: 'episodes', episodeIndex: 0 });
  h.controller.handleKey({ keyCode: 415 }, null);
  assert.deepStrictEqual(h.actions.pop(), ['play-episode', 'e1']);
  h.controller.setFocus({ zone: 'audio' }); h.controller.handleKey({ keyCode: 13 }, null);
  assert.deepStrictEqual(h.actions.pop(), ['choice', 'audio']);
  h.controller.setFocus({ zone: 'version' }); h.controller.handleKey({ keyCode: 13 }, null);
  assert.deepStrictEqual(h.actions.pop(), ['version-details'], 'OK on Version must open the technical version browser rather than the generic choice dialog');
  h.controller.setFocus({ zone: 'play', actionIndex: 3 }); h.controller.handleKey({ keyCode: 13 }, null);
  assert.deepStrictEqual(h.actions.pop(), ['options']);
  assert.strictEqual(h.controller.handleKey({ keyCode: 461 }, null).handled, true);
  assert.strictEqual(h.actions.some(function (entry) { return entry[0] === 'close-detail'; }), false, 'Back must respect the opening grace period');
  h.setNow(1600); h.controller.handleKey({ keyCode: 461 }, null);
  assert.strictEqual(h.actions[h.actions.length - 1][0], 'close-detail');
}());

(function testOverlayAndAllActionFocusRoutes() {
  var mediaInfoOpen = true;
  var summaryOpen = false;
  var h = harness({
    mediaInfoOpen: function () { return mediaInfoOpen; },
    summaryOpen: function () { return summaryOpen; },
    handleMediaInfoKey: function (event, direction) {
      h.actions.push(['media-info-key', event && event.keyCode, direction]);
      if (event && event.keyCode === 13) { mediaInfoOpen = false; }
      return { handled: true };
    },
    closeSummary: function () { h.actions.push(['close-summary']); summaryOpen = false; },
    scrollSummary: function (direction) { h.actions.push(['scroll-summary', direction]); }
  });
  h.controller.open({ ratingKey: 'm1', type: 'movie' });
  h.controller.handleKey({ keyCode: 40 }, 'down');
  assert.deepStrictEqual(h.actions.pop(), ['media-info-key', 40, 'down'], 'the shared media dialog must own directional input while open');
  h.controller.handleKey({ keyCode: 13 }, null);
  assert.deepStrictEqual(h.actions.pop(), ['media-info-key', 13, null], 'the shared media dialog must own confirmation while open');
  summaryOpen = true;
  h.controller.handleKey({ keyCode: 38 }, 'up');
  assert.deepStrictEqual(h.actions.pop(), ['scroll-summary', -1], 'summary overflow must own its scroll input');
  h.controller.handleKey({ keyCode: 461 }, null);
  assert.deepStrictEqual(h.actions.pop(), ['close-summary']);
  summaryOpen = true;
  h.controller.handleKey({ keyCode: 13 }, null);
  assert.deepStrictEqual(h.actions.pop(), ['close-summary'], 'the visible Close action and remote OK must use the summary close command');

  [[1, 'watched'], [2, 'watchlist'], [3, 'options']].forEach(function (entry) {
    h.controller.setFocus({ zone: 'play', actionIndex: entry[0] });
    h.controller.handleKey({ keyCode: 13 }, null);
    assert.strictEqual(h.actions.pop()[0], entry[1]);
  });
  h.controller.setFocus({ zone: 'summary' }); h.controller.handleKey({ keyCode: 13 }, null);
  assert.strictEqual(h.actions.pop()[0], 'summary');
  h.controller.setFocus({ zone: 'seasons' }); h.controller.handleKey({ keyCode: 13 }, null);
  assert.strictEqual(h.actions.pop()[0], 'load-season');
  h.controller.setFocus({ zone: 'nav' }); h.controller.handleKey({ keyCode: 13 }, null);
  assert.strictEqual(h.actions.pop()[0], 'activate-navigation');
}());

(function testClosePreservesReturnSurfaceWithoutReopeningDetail() {
  var closed = [];
  var h = harness({ onClose: function (returnView, snapshot) { closed.push({ returnView: returnView, snapshot: snapshot }); } });
  h.controller.open({ ratingKey: 'e1', type: 'episode', viewOffset: 12000 }, { returnView: 'watchlist' });
  h.controller.setCurrentDetail({ ratingKey: 'e1', type: 'episode', viewOffset: 12000 });
  h.controller.close();
  assert.strictEqual(closed[0].returnView, 'watchlist');
  assert.strictEqual(closed[0].snapshot.currentDetail, null, 'closing detail must not flash stale metadata back onto the restored surface');
  assert.strictEqual(h.controller.snapshot().selectedItem, null);
}());

(function testContinueWatchingOriginIsExplicitAndResettable() {
  var h = harness();
  h.controller.open({ ratingKey: 'continue-1', type: 'movie' }, { returnView: 'home', fromContinueWatching: true });
  assert.strictEqual(h.controller.snapshot().fromContinueWatching, true, 'detail controller must preserve Continue Watching origin');
  h.controller.setFromContinueWatching(false);
  assert.strictEqual(h.controller.snapshot().fromContinueWatching, false, 'detail controller must clear the contextual action after removal');
}());

(function testTransitionsAndDestroyAreIdempotent() {
  var h = harness();
  h.controller.open({ ratingKey: 'm1' });
  h.controller.beginTransition(100, function () { throw new Error('cancelled transition ran'); });
  h.controller.beginTransitionEnd(100, function () { throw new Error('cancelled transition end ran'); });
  h.controller.prepareMediaProfile({ ratingKey: 'm1' }, 'identity');
  h.controller.loadMediaProfile({ ratingKey: 'm1' });
  h.controller.destroy();
  h.controller.destroy();
  assert.strictEqual(h.mediaProfiles[0].aborted, true);
  assert.strictEqual(Object.keys(h.root.timers).length, 0, 'destroy must cancel every owned timer');
  assert.strictEqual(h.controller.snapshot().destroyed, true);
}());

(function testSemanticMutationApiReplacesCompatibilityState() {
  var h = harness();
  var selected = { ratingKey: 'e1', viewed: false };
  var detail = { ratingKey: 'e1', type: 'episode', viewOffset: 0 };
  var seasons = [{ ratingKey: 's1' }, { ratingKey: 's2' }];
  var episodes = [{ ratingKey: 'e1' }, { ratingKey: 'e2' }];
  assert.strictEqual(typeof h.controller.compatibilityState, 'undefined', 'detail controller must not expose a mutable legacy state facade');
  h.controller.setSelectedItem(selected);
  h.controller.setCurrentDetail(detail);
  h.controller.setSeriesContext({ seasons: seasons, episodes: episodes });
  h.controller.setReturnView('library');
  h.controller.selectSeason(1);
  h.controller.selectEpisode(1);
  h.controller.setFocus({ zone: 'episodes', actionIndex: 2 });
  h.controller.setPlayPending(true);
  h.controller.setBackLockedUntil(900);
  assert.strictEqual(h.controller.snapshot().returnView, 'library');
  assert.strictEqual(h.controller.snapshot().zone, 'episodes');
  assert.strictEqual(h.controller.snapshot().playPending, true);
  h.controller.patchCurrentDetail({ viewOffset: 12000 });
  h.controller.patchSelectedItem({ viewed: true });
  h.controller.patchEpisode(1, { progress: 40 });
  assert.strictEqual(h.controller.snapshot().currentDetail.viewOffset, 12000);
  assert.strictEqual(h.controller.snapshot().selectedItem.viewed, true);
  assert.strictEqual(h.controller.snapshot().seriesContext.episodes[1].progress, 40);
  h.controller.selectSeason(0);
  h.controller.setEpisodes([{ ratingKey: 'e3' }, { ratingKey: 'e4' }], 1);
  assert.strictEqual(h.controller.snapshot().seasonIndex, 0);
  assert.strictEqual(h.controller.snapshot().episodeIndex, 1);
  assert.strictEqual(h.controller.snapshot().seriesContext.episodes[1].selected, true);
  h.controller.setSeasonTransitionMediaKey('e4');
  h.controller.setMetadataStatusTemporary(true);
  assert.strictEqual(h.controller.snapshot().seasonTransitionMediaKey, 'e4');
  assert.strictEqual(h.controller.snapshot().metadataStatusTemporary, true);
  h.controller.scheduleEpisodePreview(function () { throw new Error('cancelled preview ran'); }, 10);
  h.controller.cancelEpisodePreview();
  h.root.runAll();

  var detached = harness();
  assert.strictEqual(detached.controller.selectEpisode(3), 3, 'episode selection must preserve a requested index before a series context is attached');
  detached.controller.destroy();
  detached.controller.setSelectedItem({ ratingKey: 'late' });
  detached.controller.setCurrentDetail({ ratingKey: 'late' });
  detached.controller.setPlayPending(true);
  detached.controller.patchCurrentDetail({ viewed: true });
  assert.strictEqual(detached.controller.snapshot().selectedItem, null, 'destroyed detail controllers must ignore late semantic mutations');
  assert.strictEqual(detached.controller.snapshot().currentDetail, null, 'destroyed detail controllers must not resurrect detail state');
  assert.strictEqual(detached.controller.snapshot().playPending, false, 'destroyed detail controllers must keep transient state cleared');
}());

(function testNativePlaybackIsolationAndLegacyOwnership() {
  var source = fs.readFileSync(path.join(__dirname, '../app/coordinator/detail-controller.js'), 'utf8');
  var runtime = fs.readFileSync(path.join(__dirname, '../app/coordinator/application-controller.js'), 'utf8');
  assert.ok(!/player-video|\.currentTime\s*=|\.src\s*=/.test(source), 'detail controller must never touch native playback');
  assert.ok(!/var (selectedItem|seriesContext|detailZone|detailSeasonIndex|detailEpisodeIndex|detailMetadataTimer|episodeDetailToken|seasonPreviewTimer|seasonPreviewToken|currentDetail|detailMediaProfileRequest|detailTransitionTimer|detailBackLockedUntil|detailActionIndex|detailRefreshPending|detailPlayPending)\b/.test(runtime), 'detail state ownership must not remain duplicated in the application controller');
}());

console.log('Detail controller checks passed');
