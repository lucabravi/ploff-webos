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

function fakeRoot() {
  var nextId = 1;
  var timers = {};
  return {
    setTimeout: function (callback) {
      var id = nextId;
      nextId += 1;
      timers[id] = callback;
      return id;
    },
    clearTimeout: function (id) { delete timers[id]; },
    runNext: function () {
      var ids = Object.keys(timers);
      var callback;
      if (!ids.length) { return false; }
      callback = timers[ids[0]];
      delete timers[ids[0]];
      callback();
      return true;
    },
    runAll: function (limit) {
      var count = 0;
      while (count < (limit || 100) && this.runNext()) { count += 1; }
      return count;
    },
    pending: function () { return Object.keys(timers).length; }
  };
}

function episode(key, season, index, progress, viewed) {
  return {
    ratingKey: key,
    type: 'episode',
    title: 'Example Show',
    showRatingKey: 'show-1',
    index: index,
    seasonIndex: season,
    episodeIndex: index,
    progress: progress || 0,
    viewed: viewed === true
  };
}

function detailFor(current, seasons, episodes, seasonIndex, episodeIndex) {
  return {
    currentDetail: current,
    seriesContext: { seasons: seasons, episodes: episodes, playlistQueue: false },
    seasonIndex: seasonIndex,
    episodeIndex: episodeIndex
  };
}

function createHarness(extra) {
  var root = fakeRoot();
  var seasonLoads = [];
  var pageLoads = [];
  var metadataLoads = [];
  var playbackRequests = [];
  var errors = [];
  var renders = [];
  var upNextItems = [];
  var backdrops = [];
  var drawerChanges = [];
  var skipResets = 0;
  var playerCloses = 0;
  var upNextCancellations = 0;
  var upNextCancellationTargets = [];
  var upNextRearms = 0;
  var homeRequests = 0;
  var currentDetail = extra && extra.detail || {};
  var detailReads = 0;
  var settings = extra && extra.settings || { delay: 4, layout: 'compact' };
  var controller = Controller.create({
    root: root,
    PlaybackQueueModel: QueueModel,
    UpNextState: UpNextState,
    UpNextTiming: UpNextTiming,
    QueueSequenceContract: Contract,
    BoundedQueueCache: Cache,
    SeriesQueueProvider: SeriesProvider,
    PlexContainerQueueProvider: ContainerProvider,
    detailSnapshot: function () { detailReads += 1; return currentDetail; },
    queueLabel: function () { return 'Queue'; },
    isRegularSeason: function (season) { return Number(season.index) > 0; },
    loadSeasonEpisodes: function (season, callback) {
      var request = { aborted: false, abort: function () { this.aborted = true; } };
      seasonLoads.push({ season: season, callback: callback, request: request });
      return request;
    },
    loadContainerPage: function (container, start, size, callback) {
      var request = { aborted: false, abort: function () { this.aborted = true; } };
      pageLoads.push({ container: container, start: start, size: size, callback: callback, request: request });
      return request;
    },
    loadMetadata: function (ratingKey, callback) {
      var request = { aborted: false, abort: function () { this.aborted = true; } };
      metadataLoads.push({ ratingKey: ratingKey, callback: callback, request: request });
      return request;
    },
    requestPlayback: function (request) { playbackRequests.push(request); },
    onPlaybackError: function (error) { errors.push(error); },
    onDrawerChanged: function (snapshot) { drawerChanges.push(snapshot); },
    autoplaySettings: function () { return settings; },
    playerActive: function () { return true; },
    renderUpNext: function (view, seconds) { renders.push({ view: view, seconds: seconds }); },
    upNextItem: function (target, layout) {
      upNextItems.push({ target: target, layout: layout });
      return { title: target.item.title };
    },
    loadUpNextBackdrop: function (item, token) { backdrops.push({ item: item, token: token }); },
    clearUpNextBackdrop: function () {},
    resetSkipPrompt: function () { skipResets += 1; },
    endOfQueueTarget: function () {
      return { action: 'home', item: { title: 'Home' } };
    },
    requestHome: function () { homeRequests += 1; },
    onUpNextCancelled: function (target) {
      upNextCancellations += 1;
      upNextCancellationTargets.push(target);
    },
    onUpNextRearmed: function () { upNextRearms += 1; },
    versionAffinity: function () { return { codec: 'hevc' }; },
    closePlayer: function () { playerCloses += 1; }
  });
  return {
    root: root,
    controller: controller,
    seasonLoads: seasonLoads,
    pageLoads: pageLoads,
    metadataLoads: metadataLoads,
    playbackRequests: playbackRequests,
    errors: errors,
    renders: renders,
    upNextItems: upNextItems,
    backdrops: backdrops,
    drawerChanges: drawerChanges,
    skipResets: function () { return skipResets; },
    playerCloses: function () { return playerCloses; },
    upNextCancellations: function () { return upNextCancellations; },
    upNextCancellationTargets: upNextCancellationTargets,
    upNextRearms: function () { return upNextRearms; },
    homeRequests: function () { return homeRequests; },
    detailReads: function () { return detailReads; },
    resetDetailReads: function () { detailReads = 0; },
    setDetail: function (detail) { currentDetail = detail; },
    setSettings: function (next) { settings = next; }
  };
}

(function testSeriesProviderLoadsOnlyTheCrossedSeason() {
  var seasons = [{ ratingKey: 's1', index: 1, leafCount: 2 }, { ratingKey: 'specials', index: 0, leafCount: 1 }, { ratingKey: 's2', index: 2, leafCount: 2 }];
  var s1 = [episode('s1e1', 1, 1), episode('s1e2', 1, 2)];
  var s2 = [episode('s2e1', 2, 1), episode('s2e2', 2, 2)];
  var h = createHarness({ detail: detailFor(s1[1], seasons, s1, 0, 1) });
  var queue = h.controller.activeQueue();
  var target = null;
  assert.deepStrictEqual(queue.items.map(function (item) { return item.ratingKey; }), ['s1e1', 's1e2']);
  assert.strictEqual(h.seasonLoads.length, 0, 'future seasons must not be hydrated during Player setup');
  h.controller.resolveAdjacentState(1, function (error, result) { assert.ifError(error); target = result; });
  assert.strictEqual(h.seasonLoads.length, 1, 'crossing the boundary must load only the next regular season');
  assert.strictEqual(Number(h.seasonLoads[0].season.index), 2, 'Specials must remain outside regular traversal');
  h.seasonLoads[0].callback(null, s2);
  assert.strictEqual(target.item.ratingKey, 's2e1');
  h.setDetail(detailFor(s2[0], seasons, s2, 2, 0));
  h.controller.resolveAdjacentState(-1, function (error, result) { assert.ifError(error); target = result; });
  assert.strictEqual(target.item.ratingKey, 's1e2', 'previous navigation must cross season boundaries');
}());

(function testQueueEndOffersHomeAndCountdownNavigatesThere() {
  var only = episode('terminal-e1', 1, 1);
  var seasons = [{ ratingKey: 's1', index: 1 }];
  var h = createHarness({ detail: detailFor(only, seasons, [only], 0, 0), settings: { delay: 2, layout: 'compact' } });
  h.controller.activeQueue();
  assert.strictEqual(h.controller.playbackEnded({ actualEnd: true }), true);
  assert.strictEqual(h.controller.upNextSnapshot().visible, true, 'an exhausted queue must still expose the terminal autoplay prompt');
  assert.strictEqual(h.controller.upNextSnapshot().target.action, 'home', 'the terminal autoplay target must be Home');
  assert.strictEqual(h.backdrops.length, 0, 'the Home target must not request a Plex backdrop');
  h.root.runAll(2);
  assert.strictEqual(h.homeRequests(), 1, 'countdown expiry must leave the player for Home');
  assert.strictEqual(h.playbackRequests.length, 0, 'Home completion must not be routed as media playback');
}());

(function testCancellingTerminalAutoplayPublishesItsHomeTarget() {
  var only = episode('terminal-cancel-e1', 1, 1);
  var seasons = [{ ratingKey: 's1', index: 1 }];
  var h = createHarness({ detail: detailFor(only, seasons, [only], 0, 0), settings: { delay: 3, layout: 'compact' } });
  h.controller.activeQueue();
  h.controller.playbackEnded({ actualEnd: true });
  h.controller.cancelUpNext(true);
  assert.strictEqual(h.upNextCancellations(), 1);
  assert.strictEqual(h.upNextCancellationTargets[0].action, 'home', 'the player must know that the dismissed prompt represented Home');
}());

(function testSeriesQueueIncludesEpisodesBeforeTheCurrentEpisode() {
  var seasons = [{ ratingKey: 's1', index: 1 }];
  var s1 = [episode('s1e1', 1, 1), episode('s1e2', 1, 2), episode('s1e3', 1, 3)];
  var h = createHarness({ detail: detailFor(s1[1], seasons, s1, 0, 1) });
  var target = null;
  var queue = h.controller.activeQueue();
  assert.deepStrictEqual(queue.items.map(function (item) { return item.ratingKey; }), ['s1e1', 's1e2', 's1e3'],
    'the active season queue must retain episodes before the current item');
  h.controller.resolveAdjacentState(-1, function (error, result) { assert.ifError(error); target = result; });
  assert.strictEqual(target.item.ratingKey, 's1e1',
    'previous navigation must resolve the preceding episode in the current season');
  h.controller.openDrawer(null, 0);
  assert.strictEqual(h.controller.moveDrawer(-1), 0,
    'opening the drawer on an intermediate episode must allow focus to move to an earlier episode');
  assert.strictEqual(h.controller.requestIndex(0, {}), true,
    'an earlier focused episode must be selectable from the drawer');
  assert.strictEqual(h.metadataLoads[0].ratingKey, 's1e1');
  h.metadataLoads[0].callback(null, s1[0]);
  assert.strictEqual(h.playbackRequests[0].item.ratingKey, 's1e1');
  assert.strictEqual(h.playbackRequests[0].previousIndex, 1);
  assert.strictEqual(h.playbackRequests[0].index, 0);
}());

(function testSeriesQueueDrawerLoadsTheActiveSeasonWindow() {
  var seasons = [{ ratingKey: 's1', index: 1, leafCount: 3 }];
  var s1 = [episode('s1e1', 1, 1), episode('s1e2', 1, 2), episode('s1e3', 1, 3)];
  var h = createHarness({ detail: detailFor(s1[1], seasons, s1, 0, 1) });
  var windowResult = null;
  assert.strictEqual(h.controller.openDrawer(undefined, 0), true, 'a regular series must expose its playback queue drawer');
  h.controller.loadDrawerWindow({ viewportItems: 5, direction: 0 }, function (error, result) {
    assert.ifError(error);
    windowResult = result;
  });
  assert.ok(windowResult, 'the active series drawer window must resolve');
  assert.deepStrictEqual(windowResult.items.map(function (record) { return record.item.ratingKey; }), ['s1e1', 's1e2', 's1e3'],
    'the active series drawer must render the complete resident season window');
  assert.strictEqual(windowResult.total, 3, 'the active series drawer must publish its logical total');
  assert.strictEqual(h.controller.drawerSnapshot().index, 1, 'the active series episode must keep drawer focus');
}());

(function testCollectionPreparationAndHydration() {
  var h = createHarness();
  var collection = { containerType: 'collection', title: 'Collection', totalSize: 2 };
  var first = { ratingKey: 'm1', type: 'movie', title: 'One' };
  var second = { ratingKey: 'm2', type: 'movie', title: 'Two' };
  var windowResult;
  assert.strictEqual(h.controller.prepareContainer(collection, [first], first, 0, {}), true);
  h.setDetail({ currentDetail: first, seriesContext: { playlistQueue: true }, episodeIndex: 0 });
  assert.strictEqual(h.controller.snapshot().playlistQueue.items.length, 1);
  h.controller.loadDrawerWindow({ viewportItems: 5, direction: 1 }, function (error, result) {
    assert.ifError(error);
    windowResult = result;
  });
  assert.strictEqual(h.pageLoads.length, 1, 'the collection must load only when its drawer window is requested');
  h.pageLoads[0].callback(null, { items: [first, second], totalSize: 2 });
  assert.deepStrictEqual(windowResult.items.map(function (value) { return value.item.ratingKey; }), ['m1', 'm2']);
  assert.strictEqual(h.controller.snapshot().playlistQueue.items.length, 1,
    'paginated drawer loading must not materialize the complete collection in the playback queue');
}());

(function testPublicSnapshotDoesNotExposeQueueState() {
  var h = createHarness();
  var playlist = { containerType: 'playlist', containerKey: '/playlists/1/items', title: 'Playlist' };
  var first = { ratingKey: 'm1', type: 'movie', title: 'One' };
  var second = { ratingKey: 'm2', type: 'movie', title: 'Two' };
  var published;
  h.controller.prepareContainer(playlist, [first, second], first, 0, {});
  published = h.controller.snapshot();
  published.playlistQueue.items[0].title = 'Mutated';
  published.playlistQueue.items.push({ ratingKey: 'm3', type: 'movie', title: 'Three' });
  published.containerOrigin.title = 'Mutated origin';
  assert.strictEqual(h.controller.snapshot().playlistQueue.items[0].title, 'One', 'public queue snapshots must copy item records');
  assert.strictEqual(h.controller.snapshot().playlistQueue.items.length, 2, 'public queue snapshots must copy the item array');
  assert.strictEqual(h.controller.snapshot().containerOrigin.title, 'Playlist', 'public queue snapshots must copy the origin record');
}());

(function testPlaylistFirstUnfinishedResumeAndVersionAffinity() {
  var h = createHarness();
  var playlist = { containerType: 'playlist', title: 'Playlist' };
  var watched = { ratingKey: 'm1', type: 'movie', title: 'One', viewed: true };
  var partial = { ratingKey: 'm2', type: 'movie', title: 'Two', viewed: false, progress: 37 };
  assert.strictEqual(h.controller.startContainer(playlist, { origin: 'playlist' }), true);
  h.pageLoads[0].callback(null, { items: [watched, partial], totalSize: 2 });
  assert.strictEqual(h.metadataLoads[0].ratingKey, 'm2', 'direct playlist playback must select the first unfinished item');
  h.metadataLoads[0].callback(null, { ratingKey: 'm2', type: 'movie', viewOffset: 37 });
  assert.strictEqual(h.playbackRequests[0].resumeOffset, 37, 'partially watched items must preserve their resume request');

  h.controller.completeDirect();
  h.controller.requestIndex(1, { versionAffinity: { codec: 'hevc' } }, {
    currentDetail: { ratingKey: 'm1' },
    seriesContext: { playlistQueue: true },
    episodeIndex: 0
  });
  h.metadataLoads[1].callback(null, { ratingKey: 'm2', type: 'movie' });
  assert.deepStrictEqual(h.playbackRequests[1].versionAffinity, { codec: 'hevc' }, 'selected-version affinity must reach the single playback callback');
}());

(function testAllWatchedFallback() {
  var h = createHarness();
  var playlist = { containerType: 'playlist', title: 'Watched' };
  var first = { ratingKey: 'm1', type: 'movie', title: 'One', viewed: true };
  var second = { ratingKey: 'm2', type: 'movie', title: 'Two', viewed: true };
  h.controller.startContainer(playlist, {});
  h.pageLoads[0].callback(null, { items: [first, second], totalSize: 2 });
  assert.strictEqual(h.metadataLoads[0].ratingKey, 'm1', 'all-watched playlists must restart from the first item');
}());

(function testUpNextStartsOnlyAtActualEndAndSupportsLayouts() {
  var first = episode('e1', 1, 1);
  var second = episode('e2', 1, 2);
  var seasons = [{ ratingKey: 's1', index: 1 }];
  var h = createHarness({ detail: detailFor(first, seasons, [first, second], 0, 0), settings: { delay: 3, layout: 'compact' } });
  h.controller.activeQueue();
  assert.strictEqual(h.controller.playbackEnded({ actualEnd: false }), false);
  assert.strictEqual(h.renders.length, 0, 'Up Next must not appear before the native ended event');
  assert.strictEqual(h.controller.playbackEnded({ actualEnd: true }), true);
  assert.strictEqual(h.renders[0].view.layout, 'compact');
  assert.strictEqual(h.upNextItems[0].layout, 'compact', 'the presentation mapper must receive the active Up Next layout');
  assert.strictEqual(h.renders[0].seconds, 3, 'countdown must begin at the actual end');
  assert.strictEqual(h.backdrops[0].item.ratingKey, 'e2', 'the next item backdrop must be requested');
  assert.strictEqual(h.skipResets(), 1, 'Up Next must take precedence over the skip prompt');
  h.controller.cancelUpNext(false);
  h.setSettings({ delay: 2, layout: 'bottom-panel' });
  h.controller.playbackEnded({ actualEnd: true });
  assert.strictEqual(h.renders[h.renders.length - 1].view.layout, 'bottom-panel', 'lower-band layout must be preserved');
  assert.strictEqual(h.upNextItems[h.upNextItems.length - 1].layout, 'bottom-panel', 'layout-specific artwork mapping must receive the lower-band layout');
}());

(function testUpNextKeyboardContract() {
  var first = episode('e1', 1, 1);
  var second = episode('e2', 1, 2);
  var seasons = [{ ratingKey: 's1', index: 1 }];
  var h = createHarness({ detail: detailFor(first, seasons, [first, second], 0, 0), settings: { delay: 3, layout: 'compact' } });
  h.controller.activeQueue();
  assert.strictEqual(h.controller.handleKey({ keyCode: 13 }, ''), false, 'hidden Up Next must not capture input');
  h.controller.playbackEnded({ actualEnd: true });
  assert.strictEqual(h.controller.handleKey({ keyCode: 461 }, ''), false, 'Back must fall through to player controls');
  assert.strictEqual(h.controller.handleKey({ keyCode: 37 }, 'left'), true, 'visible Up Next must capture directional input');
  assert.strictEqual(h.controller.handleKey({ keyCode: 40 }, 'down'), true, 'visible Up Next must suppress unrelated player input');
  assert.strictEqual(h.controller.handleKey({ keyCode: 415 }, ''), true, 'Play must confirm the next item');
  assert.strictEqual(h.playbackRequests.length, 1);
  h.controller.playbackEnded({ actualEnd: true });
  assert.strictEqual(h.controller.handleKey({ keyCode: 413 }, ''), true, 'Stop must cancel Up Next and close playback');
  assert.strictEqual(h.playerCloses(), 1);
}());

(function testVisibleUpNextCancelsWhenPlaybackMovesAwayFromEnd() {
  var first = episode('seek-visible-e1', 1, 1);
  var second = episode('seek-visible-e2', 1, 2);
  var seasons = [{ ratingKey: 's1', index: 1 }];
  var h = createHarness({ detail: detailFor(first, seasons, [first, second], 0, 0), settings: { delay: 3, layout: 'compact' } });
  h.controller.activeQueue();
  assert.strictEqual(h.controller.playbackEnded({ actualEnd: true }), true);
  assert.strictEqual(h.controller.upNextSnapshot().visible, true);
  assert.strictEqual(h.root.pending(), 1);
  assert.strictEqual(h.controller.observePlayback(90, 120), true,
    'rewinding away from the end must cancel a visible automatic transition');
  assert.strictEqual(h.controller.upNextSnapshot().visible, false);
  assert.strictEqual(h.root.pending(), 0, 'rewinding must cancel the active countdown timer');
  assert.strictEqual(h.playbackRequests.length, 0, 'rewinding must not start the queued item');
  assert.strictEqual(h.controller.playbackEnded({ actualEnd: true }), true,
    'the next native end must be allowed to offer Up Next again');
  assert.strictEqual(h.controller.upNextSnapshot().visible, true);
}());

(function testDismissedUpNextRearmsAfterPlaybackMovesAwayFromEnd() {
  var first = episode('e1', 1, 1);
  var second = episode('e2', 1, 2);
  var seasons = [{ ratingKey: 's1', index: 1 }];
  var h = createHarness({ detail: detailFor(first, seasons, [first, second], 0, 0), settings: { delay: 3, layout: 'compact' } });
  h.controller.activeQueue();
  assert.strictEqual(h.controller.playbackEnded({ actualEnd: true }), true);
  h.controller.cancelUpNext(true);
  assert.strictEqual(h.upNextCancellations(), 1, 'dismissing a visible Up Next prompt must notify the player surface once');
  assert.strictEqual(h.controller.playbackEnded({ actualEnd: true }), false, 'dismissal must suppress an immediate duplicate end event');
  h.controller.observePlayback(116, 120);
  assert.strictEqual(h.controller.upNextSnapshot().dismissed, true, 'remaining within five seconds of the end must keep dismissal armed');
  h.controller.observePlayback(90, 120);
  assert.strictEqual(h.controller.upNextSnapshot().dismissed, false, 'rewinding away from the end must rearm Up Next');
  assert.strictEqual(h.upNextRearms(), 1, 'rewinding away from the end must notify the player surface to resume normal controls hiding');
  assert.strictEqual(h.controller.playbackEnded({ actualEnd: true }), true, 'Up Next must be offered again after rewinding');
}());

(function testDrawerRemoteAndPointerNavigation() {
  var first = episode('e1', 1, 1);
  var second = episode('e2', 1, 2);
  var seasons = [{ ratingKey: 's1', index: 1 }];
  var h = createHarness({ detail: detailFor(first, seasons, [first, second], 0, 0) });
  h.controller.activeQueue();
  assert.strictEqual(h.controller.openDrawer(null, 10), true);
  assert.strictEqual(h.controller.drawerSnapshot().index, 0);
  h.controller.moveDrawer(1);
  assert.strictEqual(h.controller.drawerSnapshot().index, 1, 'remote navigation must move drawer focus');
  h.controller.pointDrawer(0);
  assert.strictEqual(h.controller.drawerSnapshot().index, 0, 'pointer navigation must set drawer focus');
  h.root.runNext();
  assert.strictEqual(h.controller.drawerSnapshot().focusReady, true, 'drawer focus timer must be owned by the controller');
}());

(function testDrawerMoveNotificationDoesNotCloneResidentItems() {
  var items = [];
  var titleReads = 0;
  var index;
  var tracked;
  var h;
  for (index = 0; index < 120; index += 1) { items.push(episode('e' + index, 1, index + 1)); }
  tracked = items[60];
  Object.defineProperty(tracked, 'title', {
    enumerable: true,
    configurable: true,
    get: function () { titleReads += 1; return 'Tracked'; }
  });
  h = createHarness({ detail: detailFor(items[0], [{ ratingKey: 's1', index: 1, leafCount: items.length }], items, 0, 0) });
  h.controller.activeQueue();
  h.controller.openDrawer(null, 0);
  titleReads = 0;
  h.controller.moveDrawer(1);
  assert.strictEqual(titleReads, 0, 'drawer movement notifications must not clone resident queue items');
  assert.strictEqual(h.drawerChanges[h.drawerChanges.length - 1].queue.title, 'Example Show');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(h.drawerChanges[h.drawerChanges.length - 1].queue, 'items'), false,
    'drawer render events must expose an explicit queue summary rather than a semantically empty queue');
  h.resetDetailReads();
  h.controller.moveDrawer(1);
  assert.strictEqual(h.detailReads(), 1, 'drawer movement must normalize detail state once per event');
}());

(function testDrawerFocusTimerUsesLivePlaybackPosition() {
  var first = episode('e1', 1, 1);
  var second = episode('e2', 1, 2);
  var seasons = [{ ratingKey: 's1', index: 1, leafCount: 2 }];
  var h = createHarness({ detail: detailFor(first, seasons, [first, second], 0, 0) });
  h.controller.openDrawer(null, 10);
  h.setDetail(detailFor(second, seasons, [first, second], 0, 1));
  h.root.runNext();
  assert.strictEqual(h.drawerChanges[h.drawerChanges.length - 1].currentIndex, 1,
    'drawer focus readiness must use the live playback occurrence after the animation delay');
}());

(function testDrawerSnapshotClampsWithoutReentrantNotification() {
  var first = episode('e1', 1, 1);
  var second = episode('e2', 1, 2);
  var replacement = episode('other-e1', 1, 1);
  var seasons = [{ ratingKey: 's1', index: 1, leafCount: 2 }];
  var h = createHarness({ detail: detailFor(first, seasons, [first, second], 0, 0) });
  replacement.showRatingKey = 'show-2';
  h.controller.activeQueue();
  h.controller.openDrawer(null, 10);
  h.controller.moveDrawer(1);
  assert.strictEqual(h.controller.drawerSnapshot().index, 1);
  h.drawerChanges.length = 0;
  h.setDetail(detailFor(replacement, [{ ratingKey: 'other-s1', index: 1, leafCount: 1 }], [replacement], 0, 0));
  assert.strictEqual(h.controller.drawerSnapshot().index, 0, 'snapshot reads must normalize a stale drawer index after queue changes');
  assert.strictEqual(h.drawerChanges.length, 0, 'snapshot normalization must not synchronously notify and re-enter the renderer');
}());



(function testCancellationAndDestroy() {
  var h = createHarness();
  var collection = { containerType: 'collection', title: 'Collection', totalSize: 1 };
  var item = { ratingKey: 'm1', type: 'movie', title: 'One' };
  h.controller.prepareContainer(collection, [item], item, 0, {});
  h.setDetail({ currentDetail: item, seriesContext: { playlistQueue: true }, episodeIndex: 0 });
  h.controller.loadDrawerWindow({ viewportItems: 5 }, function () {});
  h.controller.waitForDetail('m1', function () { throw new Error('destroyed wait must not complete'); });
  h.controller.destroy();
  assert.strictEqual(h.pageLoads[0].request.aborted, true, 'destroy must abort provider page loading');
  assert.strictEqual(h.metadataLoads[0].request.aborted, true, 'destroy must abort metadata loading');
  assert.strictEqual(h.root.pending(), 0, 'destroy must cancel every owned timer');
  h.pageLoads[0].callback(null, { items: [item], totalSize: 1 });
  assert.strictEqual(h.controller.snapshot().destroyed, true);
}());

(function testAsyncOwnershipTokensReplaceCompatibilityState() {
  var h = createHarness();
  assert.strictEqual(typeof h.controller.compatibilityState, 'undefined', 'queue controller must not expose a mutable legacy state facade');
  var generation = h.controller.capturePlaylistGeneration();
  assert.strictEqual(h.controller.isPlaylistGenerationCurrent(generation), true);
  h.controller.clear();
  assert.strictEqual(h.controller.isPlaylistGenerationCurrent(generation), false, 'clearing a queue must invalidate deferred playlist work');
  assert.strictEqual(h.controller.claimBackdropPrefetch('episode-2'), true);
  assert.strictEqual(h.controller.claimBackdropPrefetch('episode-2'), false, 'the same backdrop must not be prefetched twice');
  assert.strictEqual(h.controller.claimBackdropPrefetch('episode-3'), true);
  var token = h.controller.beginBackdropLoad();
  assert.strictEqual(h.controller.isBackdropLoadCurrent(token, false), true);
  h.controller.invalidateBackdropLoad();
  assert.strictEqual(h.controller.isBackdropLoadCurrent(token, false), false, 'invalidated backdrop callbacks must become stale');
  h.controller.destroy();
  assert.strictEqual(h.controller.isPlaylistGenerationCurrent(h.controller.capturePlaylistGeneration()), false);
  assert.strictEqual(h.controller.claimBackdropPrefetch('late'), false, 'destroyed queue controllers must reject late prefetch claims');
  var destroyedBackdropToken = h.controller.beginBackdropLoad();
  assert.strictEqual(h.controller.invalidateBackdropLoad(), destroyedBackdropToken, 'destroyed queue controllers must not advance backdrop generations');
}());

(function testNativePlaybackIsolation() {
  var source = require('fs').readFileSync(require('path').join(__dirname, '../app/coordinator/playback-queue-controller.js'), 'utf8');
  assert.ok(!/video\s*\.\s*src|video\s*\.\s*currentTime|timelineTimer|playbackClock|clockOffset/.test(source), 'queue controller must not own native stream or clock state');
}());

(function testIdenticalConcurrentDrawerWindowsShareOneProviderRequest() {
  var h = createHarness();
  var playlist = { containerType: 'playlist', containerKey: '/playlists/coalesce/items', title: 'Coalesce', totalSize: 80 };
  var first = { ratingKey: 'm1', type: 'movie', title: 'One' };
  var results = [];
  h.controller.prepareContainer(playlist, [first], first, 0, {});
  h.setDetail({ currentDetail: first, seriesContext: { playlistQueue: true }, episodeIndex: 0 });
  h.controller.loadDrawerWindow({ viewportItems: 5, direction: 1 }, function (error, result) {
    assert.ifError(error);
    results.push(result);
  });
  h.controller.loadDrawerWindow({ viewportItems: 5, direction: 1 }, function (error, result) {
    assert.ifError(error);
    results.push(result);
  });
  assert.strictEqual(h.pageLoads.length, 1,
    'identical concurrent drawer windows must share one provider request');
  h.pageLoads[0].callback(null, { items: [first], totalSize: 80 });
  assert.strictEqual(results.length, 2,
    'all callers waiting for the shared drawer window must receive the result');
  assert.strictEqual(results[0].items[0].item.ratingKey, 'm1');
  assert.strictEqual(results[1].items[0].item.ratingKey, 'm1');
}());


(function testAdjacentResolutionWithoutQueueIsUnavailable() {
  var h = createHarness({ detail: {} });
  var delivered = null;
  var immediate = h.controller.resolveAdjacentState(1, function (error, result) {
    assert.ifError(error);
    delivered = result;
  });
  assert.deepStrictEqual(immediate, { state: 'unavailable' },
    'an unsupported playback origin must report an unavailable adjacent target immediately');
  assert.deepStrictEqual(delivered, { state: 'unavailable' },
    'an unsupported playback origin must notify the caller without recursive fallback resolution');
}());

console.log('Playback queue controller checks passed');
