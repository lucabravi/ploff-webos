'use strict';

var assert = require('assert');
var PlaybackQueueModel = require('../app/playback-queue-model');
var Fixture = require('./helpers/player-feature-controller-harness');
var createDeferredClock = Fixture.createDeferredClock;
var createHarness = Fixture.createHarness;

(function rejectedPlaylistDirectStartAlwaysFinishesTransition() {
  var clock = createDeferredClock();
  var playlist = { containerType: 'playlist', containerKey: '/playlists/9/items', title: 'Playlist' };
  var h = createHarness({
    root: clock.root,
    queueSnapshot: { playlistQueue: null, drawer: { open: false }, directPlayPending: false },
    state: { currentView: function () { return 'library'; } },
    library: {
      snapshot: function () { return { library: { zone: 'grid' } }; },
      focusedItem: function () { return playlist; }
    },
    startContainer: function () { return false; }
  });
  assert.strictEqual(h.controller.handleQueueCapture({
    keyCode: 415,
    preventDefault: function () {},
    stopImmediatePropagation: function () {}
  }), true);
  assert.strictEqual(clock.pending(), 1, 'a rejected direct start must schedule transition cleanup');
  clock.runAll();
  assert.strictEqual(/is-container-direct-start/.test(h.document.body.className), false, 'a rejected direct start must not leave the transition class behind');
}());

(function playStartsCollectionContainerQueueFromLibrary() {
  var collection = {
    containerType: 'collection',
    containerKey: '/library/collections/7/children',
    ratingKey: '7',
    title: 'Collection'
  };
  var h = createHarness({
    queueSnapshot: { playlistQueue: null, drawer: { open: false }, directPlayPending: false },
    state: { currentView: function () { return 'library'; } },
    library: {
      snapshot: function () { return { library: { zone: 'grid' } }; },
      focusedItem: function () { return collection; },
      activeContainer: function () { return null; }
    },
    startContainer: function (container) {
      assert.strictEqual(container, collection, 'collection playback must preserve the focused container');
      return true;
    }
  });
  assert.strictEqual(h.controller.handleQueueCapture({
    keyCode: 415,
    preventDefault: function () {},
    stopImmediatePropagation: function () {}
  }), true, 'Play on a collection must start its generic playback queue');
  assert.strictEqual(h.calls.filter(function (entry) { return entry[0] === 'start-container'; }).length, 1);
}());

(function failedPlaylistDirectStartAlwaysFinishesTransition() {
  var clock = createDeferredClock();
  var playlist = { containerType: 'playlist', containerKey: '/playlists/9/items', title: 'Playlist' };
  var h = createHarness({
    root: clock.root,
    queueSnapshot: { playlistQueue: null, drawer: { open: false }, directPlayPending: false },
    state: { currentView: function () { return 'library'; } },
    library: {
      snapshot: function () { return { library: { zone: 'grid' } }; },
      focusedItem: function () { return playlist; },
      restoreContainerOrigin: function () { return false; }
    },
    startContainer: function (container, callback) { callback(new Error('unavailable')); return true; },
    restoreContainerOrigin: function (options) {
      options.onRestoreOrigin({ kind: 'playlist', key: '9' });
      return true;
    }
  });
  assert.strictEqual(h.controller.handleQueueCapture({
    keyCode: 415,
    preventDefault: function () {},
    stopImmediatePropagation: function () {}
  }), true);
  assert.ok(/is-container-direct-start/.test(h.document.body.className), 'failed direct playback must keep the transition until deferred cleanup');
  assert.strictEqual(clock.pending(), 1, 'failed direct playback must schedule exactly one transition cleanup');
  clock.runAll();
  assert.strictEqual(/is-container-direct-start/.test(h.document.body.className), false, 'failed direct playback must always remove the transition class');
}());

(function cancelledPlaylistDirectStartAlwaysFinishesTransition() {
  var clock = createDeferredClock();
  var h = createHarness({
    root: clock.root,
    queueSnapshot: { playlistQueue: null, drawer: { open: false }, directPlayPending: true },
    state: { currentView: function () { return 'library'; } },
    library: { restoreContainerOrigin: function () { return false; } },
    restoreContainerOrigin: function (options) {
      options.onRestoreOrigin({ kind: 'playlist', key: '9' });
      return true;
    }
  });
  h.document.body.className = 'app is-container-direct-start';
  assert.strictEqual(h.controller.handleQueueCapture({
    keyCode: 461,
    preventDefault: function () {},
    stopImmediatePropagation: function () {}
  }), true);
  assert.strictEqual(clock.pending(), 1, 'Back during direct playback must schedule exactly one transition cleanup');
  clock.runAll();
  assert.strictEqual(/is-container-direct-start/.test(h.document.body.className), false, 'Back must remove the direct-play transition even when origin presentation cannot be restored');
}());

(function teardownCancelsDeferredPlaylistOriginTransition() {
  var clock = createDeferredClock();
  var h = createHarness({
    root: clock.root,
    queueSnapshot: {
      playlistQueue: { items: [{ ratingKey: '42' }], index: 0 },
      containerOrigin: { kind: 'playlist', key: '9' },
      drawer: { open: false }
    },
    library: { restoreContainerOrigin: function () { return true; } },
    detail: { leave: function () {} }
  });
  h.document.body.className = 'app is-container-direct-start';
  assert.strictEqual(h.captured.queueOptions.onRestoreOrigin({ kind: 'playlist', key: '9' }), true);
  assert.strictEqual(clock.pending(), 1, 'restoring a playlist origin must defer removal of the transition class');
  h.controller.destroy();
  assert.strictEqual(clock.pending(), 0, 'destroy must cancel every feature-owned deferred callback');
  clock.runAll();
  assert.ok(/is-container-direct-start/.test(h.document.body.className), 'cancelled transition work must not mutate the DOM after destroy');
}());

(function latePlaybackCallbacksAreIgnoredAfterDestroy() {
  var h = createHarness({
    detail: {
      applyLocalPlaybackProgress: function () { h.calls.push(['late-progress']); },
      refreshPlaybackState: function () { h.calls.push(['late-refresh']); }
    },
    state: { setPlaybackIdentity: function () { h.calls.push(['late-identity']); } }
  });
  h.controller.destroy();
  h.captured.playbackOptions.onClosed(20, true, '42');
  assert.strictEqual(h.calls.some(function (entry) { return /^late-/.test(entry[0]); }), false, 'late stopped-report callbacks must not mutate feature state after destroy');
}());

(function closedPlaybackReconcilesTheActiveLibrarySurface() {
  var h = createHarness({
    state: {
      currentView: function () { return 'library'; }
    },
    library: {
      refreshAfterPlayback: function (ratingKey, seconds) {
        h.calls.push(['library-playback-refresh', ratingKey, seconds]);
      }
    }
  });
  h.captured.playbackOptions.onClosed(37, true, '42');
  assert.deepStrictEqual(h.calls.filter(function (entry) { return entry[0] === 'library-playback-refresh'; }), [
    ['library-playback-refresh', '42', 37]
  ], 'a final playback report must reconcile the active library occurrence after Player closes');
}());



(function closingPlayerInvalidatesPendingQueueGapConfirmation() {
  var h = createHarness({ diagnostics: { capturePlayback: function () {} } });
  var confirmation = {
    token: 'gap-close-player',
    kind: 'episode',
    generation: 1,
    target: { state: 'available', occurrenceId: 'series:1:3', item: { ratingKey: 's1e3' }, index: 2 }
  };
  h.captured.queueOptions.onGapRequired(confirmation, 'manual');
  assert.strictEqual(h.controller.snapshot().queueGapOpen, true);
  h.captured.controlsOptions.closePlayer();
  assert.strictEqual(h.controller.snapshot().queueGapOpen, false,
    'closing Player must invalidate a pending queue-gap confirmation');
  h.controller.handleQueueGapKey({ keyCode: 13, preventDefault: function () {} }, '');
  assert.strictEqual(h.calls.some(function (entry) { return entry[0] === 'request-resolved'; }), false,
    'a closed Player must not allow the stale confirmation to start playback');
}());

(function playlistReturnKeepsTheTransitionUntilTheRealContainerIsReady() {
  var clock = createDeferredClock();
  var restoreOptions = null;
  var current = { ratingKey: 's2e1', type: 'episode', seasonIndex: 2, episodeIndex: 1 };
  var h = createHarness({
    root: clock.root,
    diagnostics: { capturePlayback: function () {} },
    queueSnapshot: {
      playlistQueue: { items: [current], index: 12, currentItem: current },
      containerOrigin: { ratingKey: 'playlist-1', containerKey: '/playlists/playlist-1/items', containerType: 'playlist' },
      drawer: { open: false }
    },
    library: {
      restoreContainerOrigin: function (options) { restoreOptions = options; return true; }
    }
  });
  h.captured.controlsOptions.closePlayer();
  assert.strictEqual(restoreOptions.activeItem.ratingKey, 's2e1', 'playlist return passes the active occurrence independently of the resident queue page');
  assert.strictEqual(typeof restoreOptions.onReady, 'function', 'playlist return waits for the normal container lifecycle to finish');
  assert.ok(/is-container-origin-restoring/.test(h.document.body.className), 'playlist return keeps a transition surface visible while Plex reloads the container');
  restoreOptions.onReady(true);
  assert.strictEqual(clock.pending(), 1, 'the completed playlist load schedules one transition cleanup');
  clock.runAll();
  assert.strictEqual(/is-container-origin-restoring/.test(h.document.body.className), false, 'playlist return reveals the complete container after the transition');
}());

(function collectionReturnRestoresTheContainerAndCurrentOccurrence() {
  var restoreOptions = null;
  var detailLeft = 0;
  var current = { ratingKey: 'movie-2', type: 'movie', title: 'Second' };
  var h = createHarness({
    diagnostics: { capturePlayback: function () {} },
    queueSnapshot: {
      playlistQueue: { items: [current], index: 1, currentItem: current },
      containerOrigin: {
        ratingKey: 'collection-1',
        containerKey: '/library/collections/collection-1/children',
        containerType: 'collection',
        title: 'Saga'
      },
      drawer: { open: false }
    },
    library: {
      restoreContainerOrigin: function (options) { restoreOptions = options; return true; }
    },
    detail: { leave: function () { detailLeft += 1; } }
  });
  h.captured.controlsOptions.closePlayer();
  assert.strictEqual(restoreOptions.origin.containerType, 'collection',
    'Back from collection playback must preserve the collection origin');
  assert.strictEqual(restoreOptions.activeItem.ratingKey, 'movie-2',
    'Back from collection playback must restore focus to the playing occurrence');
  assert.strictEqual(detailLeft, 1,
    'a restored collection must discard the hidden playback detail instead of revealing it');
}());

(function stalePlaylistReturnCannotRevealANewerRestore() {
  var clock = createDeferredClock();
  var restoreOptions = [];
  var current = { ratingKey: 'episode-1', type: 'episode' };
  var h = createHarness({
    root: clock.root,
    diagnostics: { capturePlayback: function () {} },
    queueSnapshot: {
      playlistQueue: { items: [current], index: 0, currentItem: current },
      containerOrigin: { ratingKey: 'playlist-1', containerKey: '/playlists/playlist-1/items', containerType: 'playlist' },
      drawer: { open: false }
    },
    library: {
      restoreContainerOrigin: function (options) { restoreOptions.push(options); return true; }
    }
  });
  h.captured.controlsOptions.closePlayer();
  h.captured.controlsOptions.closePlayer();
  restoreOptions[0].onReady(false);
  assert.strictEqual(clock.pending(), 0, 'a stale playlist load cannot schedule removal of a newer restore transition');
  restoreOptions[1].onReady(true);
  assert.strictEqual(clock.pending(), 1, 'only the current playlist load owns transition cleanup');
}());

(function newerPlaybackInvalidatesPendingAdjacentMetadata() {
  var metadataCallback = null;
  var delivered = false;
  var h = createHarness({
    resolveAdjacent: function (direction, callback) {
      callback({ item: { ratingKey: '99' }, index: 1, queue: { kind: 'series' } });
    },
    data: {
      PlexClient: {
        loadMetadata: function (config, ratingKey, callback) {
          assert.strictEqual(ratingKey, '99');
          metadataCallback = callback;
          return { abort: function () {} };
        }
      }
    }
  });
  h.captured.playbackOptions.resolveAdjacent(1, function () { delivered = true; });
  assert.strictEqual(typeof metadataCallback, 'function', 'adjacent playback must request metadata for the selected queue item');
  h.captured.playbackOptions.onOpening();
  metadataCallback(null, { ratingKey: '99' });
  assert.strictEqual(delivered, false, 'a newer playback opening must invalidate older adjacent metadata callbacks');
}());



(function paginatedContainerPlaybackPreservesTheExactOccurrence() {
  var current = { ratingKey: 'current', type: 'movie', title: 'Current' };
  var target = { ratingKey: 'target', type: 'movie', title: 'Target' };
  var queue = { kind: 'container', title: 'Large queue', items: [current], index: 0 };
  var context = { playlistQueue: true, queueAbsoluteIndex: 250, queueTotal: 1000, episodes: [target], seasons: [{ ratingKey: 'playlist', index: 1 }] };
  var applied = [];
  var h = createHarness({
    activeQueue: function () { return queue; },
    activatePlaylist: function (ratingKey, index, item, occurrenceId) {
      assert.strictEqual(ratingKey, 'target');
      assert.strictEqual(index, 250);
      assert.strictEqual(item, target, 'the resolved non-resident record must reach queue activation');
      assert.strictEqual(occurrenceId, 'playlist:250:target');
      return { queue: queue, context: context, index: 0, absoluteIndex: 250 };
    },
    detail: {
      snapshot: function () { return { currentDetail: current, seriesContext: { playlistQueue: true, queueAbsoluteIndex: 0 }, episodeIndex: 0 }; },
      queueSnapshot: function () { return { currentDetail: current, seriesContext: { playlistQueue: true, queueAbsoluteIndex: 0 }, episodeIndex: 0 }; },
      preferenceSnapshot: function () { return {}; },
      setPlaybackContext: function (detail, item, nextContext, seasonIndex, episodeIndex) {
        applied.push({ detail: detail, item: item, context: nextContext, seasonIndex: seasonIndex, episodeIndex: episodeIndex });
      },
      queueMediaProfile: function () {},
      renderEpisodeContext: function () {},
      playbackPreferences: function () { return {}; }
    }
  });
  assert.strictEqual(h.captured.queueOptions.requestPlayback({
    origin: 'queue', item: target, detail: { ratingKey: 'target', type: 'movie' }, queue: queue,
    index: 250, occurrenceId: 'playlist:250:target', versionAffinity: { codec: 'hevc' }
  }), true);
  assert.strictEqual(applied.length, 1);
  assert.strictEqual(applied[0].context.queueAbsoluteIndex, 250);
  assert.strictEqual(applied[0].episodeIndex, 0, 'the bounded local episode context must use its local index');
  assert.ok(h.calls.some(function (entry) { return entry[0] === 'start-item' && entry[1] === target; }),
    'the exact resolved occurrence must reach PlaybackController without changing its API');
}());

(function adjacentSeriesPlaybackPreservesTheSeriesQueueContext() {
  var first = { ratingKey: 's1e1', type: 'episode', title: 'Episode 1', seasonIndex: 1, episodeIndex: 1 };
  var second = {
    ratingKey: 's1e2', type: 'episode', title: 'Episode 2', seasonIndex: 1, episodeIndex: 2,
    queueSeasonIndex: 0, queueEpisodeIndex: 1, queueEpisodes: [first]
  };
  second.queueEpisodes.push(second);
  var seasons = [{ ratingKey: 'season-1', index: 1, title: 'Season 1' }];
  var seriesContext = { seasons: seasons, episodes: [first, second], playlistQueue: false, type: 'show' };
  var applied = [];
  var queue = { kind: 'series', title: 'Example Show', items: [first, second], index: 0 };
  var h = createHarness({
    PlaybackQueueModel: PlaybackQueueModel,
    detail: {
      snapshot: function () {
        return { currentDetail: first, seriesContext: seriesContext, seasonIndex: 0, episodeIndex: 0 };
      },
      queueSnapshot: function () {
        return { currentDetail: first, seriesContext: seriesContext, seasonIndex: 0, episodeIndex: 0 };
      },
      preferenceSnapshot: function () { return {}; },
      setPlaybackContext: function (detail, item, nextContext, seasonIndex, episodeIndex) {
        applied.push({ detail: detail, item: item, context: nextContext, seasonIndex: seasonIndex, episodeIndex: episodeIndex });
      },
      queueMediaProfile: function () {},
      renderEpisodeContext: function () {}
    }
  });
  h.captured.playbackOptions.onAdjacentStarted({
    detail: { ratingKey: 's1e2', type: 'episode' },
    item: second,
    queueTarget: { queue: queue, item: second, index: 1 }
  });
  assert.strictEqual(applied.length, 1);
  assert.strictEqual(applied[0].context.playlistQueue, false,
    'series Previous/Next must not turn the active detail context into a playlist queue');
  assert.strictEqual(applied[0].context.seasons, seasons,
    'series Previous/Next must retain the real season catalog used by the drawer provider');
  assert.deepStrictEqual(applied[0].context.episodes, [first, second]);
  assert.strictEqual(applied[0].seasonIndex, 0);
  assert.strictEqual(applied[0].episodeIndex, 1);
}());

(function repeatedSameSeasonPlaybackReturnsToTheLastActiveEpisode() {
  var episodes = [1, 2, 3, 4].map(function (number) {
    return {
      ratingKey: 's1e' + number,
      type: 'episode',
      title: 'Episode ' + number,
      queueSeasonIndex: 0,
      queueEpisodeIndex: number - 1,
      queueSeasonNumber: 1,
      queueEpisodeNumber: number
    };
  });
  var context = { seasons: [{ ratingKey: 'season-1', index: 1 }], episodes: episodes, playlistQueue: false, type: 'show' };
  var detailState = { currentDetail: episodes[0], selectedItem: episodes[0], seriesContext: context, seasonIndex: 0, episodeIndex: 0 };
  var restored = null;
  var queue = { kind: 'series', title: 'Example Show', items: episodes, index: 0 };
  var h;
  episodes.forEach(function (episode) { episode.queueEpisodes = episodes; });
  h = createHarness({
    PlaybackQueueModel: PlaybackQueueModel,
    activeQueue: function () { return queue; },
    detail: {
      snapshot: function () { return detailState; },
      queueSnapshot: function () { return detailState; },
      preferenceSnapshot: function () { return {}; },
      playbackPreferences: function () { return {}; },
      setPlaybackContext: function (detail, item, nextContext, seasonIndex, episodeIndex) {
        detailState.currentDetail = detail;
        detailState.selectedItem = item;
        detailState.seriesContext = nextContext;
        detailState.seasonIndex = seasonIndex;
        detailState.episodeIndex = episodeIndex;
      },
      queueMediaProfile: function () {},
      renderEpisodeContext: function () {},
      resumeAfterPlayer: function () {
        restored = {
          ratingKey: detailState.currentDetail && detailState.currentDetail.ratingKey,
          episodeIndex: detailState.episodeIndex
        };
      },
      leave: function () {}
    }
  });

  [1, 2, 3].forEach(function (index) {
    assert.strictEqual(h.captured.queueOptions.requestPlayback({
      origin: 'up-next',
      item: episodes[index],
      detail: episodes[index],
      queue: queue,
      index: index,
      occurrenceId: 'series:1:' + (index + 1)
    }), true);
  });
  h.captured.playbackOptions.showError(false, function () {});
  h.controller.handleErrorKey({ keyCode: 461 }, '');

  assert.deepStrictEqual(restored, { ratingKey: 's1e4', episodeIndex: 3 }, 'Back from a playback error after repeated same-season playback must restore the last active episode, not the episode that opened Player');
}());


(function manualAdjacentGapRequiresExplicitConfirmation() {
  var target = { state: 'available', occurrenceId: 'series:4:3', item: { ratingKey: 's4e3', title: 'Episode 3' }, index: 0 };
  var confirmation = {
    token: 'gap-1', kind: 'combined', target: target,
    missingSeasons: { from: 3, to: 3 }, missingEpisodes: { season: 4, from: 1, to: 2 }
  };
  var h = createHarness({
    resolveAdjacentState: function (_direction, callback) {
      callback(null, { state: 'confirmation-required', confirmation: confirmation });
      return { state: 'resolving' };
    }
  });
  h.captured.controlsOptions.startAdjacent(1);
  assert.strictEqual(h.controller.snapshot().queueGapOpen, true, 'manual Next must open the queue-gap confirmation');
  assert.strictEqual(h.calls.some(function (entry) { return entry[0] === 'legacy-start-adjacent'; }), false,
    'manual gap resolution must not invoke PlaybackController.startAdjacent');
  assert.strictEqual(h.calls.some(function (entry) { return entry[0] === 'request-resolved'; }), false,
    'resolving a gap must not start playback before confirmation');
  h.controller.handleQueueGapKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  h.controller.handleQueueGapKey({ keyCode: 13, preventDefault: function () {} }, '');
  assert.strictEqual(h.controller.snapshot().queueGapOpen, false);
  assert.strictEqual(h.calls.filter(function (entry) { return entry[0] === 'request-resolved'; }).length, 1,
    'confirming the modal must send the already-resolved target to the queue controller exactly once');
}());


(function openQueueGapBlocksFurtherAdjacentResolution() {
  var resolutions = 0;
  var confirmation = {
    token: 'gap-blocking', kind: 'episode', generation: 1,
    target: { state: 'available', occurrenceId: 'series:1:3', item: { ratingKey: 's1e3' }, index: 2 }
  };
  var h = createHarness({
    resolveAdjacentState: function (_direction, callback) {
      resolutions += 1;
      callback(null, { state: 'unavailable' });
      return { state: 'unavailable' };
    }
  });
  h.captured.queueOptions.onGapRequired(confirmation, 'manual');
  assert.strictEqual(h.controller.snapshot().queueGapOpen, true);
  h.captured.controlsOptions.startAdjacent(1);
  assert.strictEqual(resolutions, 0,
    'an open confirmation must block new adjacent provider requests at the Player boundary');
  h.captured.playbackOptions.onEnded();
  assert.strictEqual(resolutions, 0,
    'a repeated playback-ended notification must not start a second Up Next resolution behind the modal');
}());

(function duplicateGapNotificationsPreserveTheOpeningOwner() {
  var confirmation = {
    token: 'gap-owner', kind: 'episode', generation: 1,
    target: { state: 'available', occurrenceId: 'series:1:3', item: { ratingKey: 's1e3' }, index: 2 }
  };
  var h = createHarness();
  h.captured.queueOptions.onGapRequired(confirmation, 'manual');
  h.captured.queueOptions.onGapRequired(confirmation, 'up-next');
  h.controller.handleQueueGapKey({ keyCode: 461, preventDefault: function () {} }, '');
  assert.strictEqual(h.calls.some(function (entry) {
    return entry[0] === 'cancel-up-next';
  }), false, 'a rejected duplicate notification must not steal ownership from the open manual gap');
}());

(function laterGapResultsCannotReplaceTheVisibleDecision() {
  var first = {
    token: 'gap-first', kind: 'episode', generation: 1,
    target: { state: 'available', occurrenceId: 'series:1:3', item: { ratingKey: 's1e3' }, index: 2 }
  };
  var later = {
    token: 'gap-later', kind: 'episode', generation: 1,
    target: { state: 'available', occurrenceId: 'series:1:0', item: { ratingKey: 's1e0' }, index: 0 }
  };
  var h = createHarness();
  h.captured.queueOptions.onGapRequired(first, 'manual');
  h.captured.queueOptions.onGapRequired(later, 'manual');
  h.controller.handleQueueGapKey({ keyCode: 39, preventDefault: function () {} }, 'right');
  h.controller.handleQueueGapKey({ keyCode: 13, preventDefault: function () {} }, '');
  assert.strictEqual(h.calls.filter(function (entry) { return entry[0] === 'request-resolved'; })[0][1].occurrenceId,
    first.target.occurrenceId, 'a late adjacent result must not replace the decision already shown to the user');
}());

(function queueReplacementImmediatelyInvalidatesTheVisibleGap() {
  var confirmation = {
    token: 'gap-queue-replaced', kind: 'episode', generation: 1,
    target: { state: 'available', occurrenceId: 'series:1:3', item: { ratingKey: 's1e3' }, index: 2 }
  };
  var h = createHarness();
  h.captured.queueOptions.onGapRequired(confirmation, 'manual');
  assert.strictEqual(h.controller.snapshot().queueGapOpen, true);
  h.captured.queueOptions.onQueueChanged();
  assert.strictEqual(h.controller.snapshot().queueGapOpen, false,
    'replacing the logical queue must dismiss a stale confirmation immediately');
  assert.strictEqual(h.controller.handleQueueGapKey({ keyCode: 13, preventDefault: function () {} }, ''), false);
}());


(function upNextGapUsesTheSameConfirmationSurface() {
  var h = createHarness();
  var confirmation = {
    token: 'gap-up-next', kind: 'season',
    target: { state: 'available', occurrenceId: 'series:4:1', item: { ratingKey: 's4e1', title: 'Episode 1' }, index: 0 },
    missingSeasons: { from: 3, to: 3 }
  };
  h.captured.queueOptions.onGapRequired(confirmation, 'up-next');
  assert.strictEqual(h.controller.snapshot().queueGapOpen, true, 'Up Next must reuse the generic queue-gap modal');
  h.controller.handleQueueGapKey({ keyCode: 461, preventDefault: function () {} }, '');
  assert.strictEqual(h.controller.snapshot().queueGapOpen, false);
}());


console.log('Player feature queue checks passed');
