'use strict';

var assert = require('assert');
var QueueModel = require('../app/playback-queue-model');
var movie = { ratingKey: 'movie-1', type: 'movie', title: 'Movie One', viewed: false };
var episode = {
  ratingKey: 's1e2',
  type: 'episode',
  title: 'Example Show',
  detail: 'E02 - The second episode',
  seasonIndex: 1,
  episodeIndex: 2,
  viewed: false
};
var special = {
  ratingKey: 'special-1',
  type: 'episode',
  title: 'Example Show',
  detail: 'E01 - Holiday special',
  queueSeasonNumber: 0,
  queueEpisodeNumber: 1,
  viewed: false
};
var queue;
var target;
var affinity;

assert.deepStrictEqual(QueueModel.playableItems([]), [], 'empty queues must stay empty');
assert.deepStrictEqual(
  QueueModel.playableItems([{ ratingKey: 'show', type: 'show' }, episode, movie]).map(function (item) { return item.ratingKey; }),
  ['s1e2', 'movie-1'],
  'only playable movies and episodes may enter a playback queue'
);
assert.strictEqual(QueueModel.currentIndex([], 'missing', 0), -1, 'empty queues have no current item');
assert.strictEqual(QueueModel.currentIndex([null, episode], 's1e2', 0), 1, 'malformed queue slots must not crash current item resolution');
assert.strictEqual(QueueModel.currentIndex([episode, movie, episode], 's1e2', 2), 2, 'the preferred duplicate occurrence must win');
assert.strictEqual(QueueModel.currentIndex([episode, movie], 'movie-1', 0), 1, 'rating key fallback must find the current item');

assert.strictEqual(
  QueueModel.originFocusIndex({ items: [movie, episode], index: 1 }, [movie, episode]),
  1,
  'playlist return must focus the queue item that is currently playing'
);
assert.strictEqual(
  QueueModel.originFocusIndex({ items: [movie, episode], index: 1 }, [episode, movie]),
  0,
  'playlist return must resolve the current item by media identity instead of stale queue position'
);
assert.strictEqual(
  QueueModel.originFocusIndex({ items: [movie, episode], index: 1 }, [movie]),
  -1,
  'playlist return must keep the existing grid focus when the current item is not loaded'
);
assert.strictEqual(
  QueueModel.originFocusIndex({ items: [episode, movie, episode], index: 2 }, [{ ratingKey: 'folder', type: 'show' }, episode, movie, episode]),
  3,
  'playlist return must restore the selected duplicate occurrence even when the source grid contains non-playable entries'
);

assert.deepStrictEqual(QueueModel.seriesContext(null), { playlistQueue: true, seasons: [{ ratingKey: 'playlist', index: 1, title: '', selected: true }], episodes: [] }, 'missing series context must degrade to an empty deterministic queue');

assert.strictEqual(QueueModel.firstUnfinishedIndex([]), -1, 'empty queues have no unfinished item');
assert.strictEqual(QueueModel.firstUnfinishedIndex([{ viewed: true }, { viewed: true }]), 0, 'all-watched queues restart from the first item');
assert.strictEqual(QueueModel.firstUnfinishedIndex([{ viewed: true }, { viewed: false, progress: 45 }, { viewed: false }]), 1, 'partially watched media must be the first unfinished item');
assert.strictEqual(QueueModel.firstUnfinishedIndex([{ viewed: true, progress: 37 }, { viewed: false }]), 0, 'partial progress must remain unfinished even when stale metadata marks the item viewed');

assert.strictEqual(QueueModel.itemDisplayTitle(movie), 'Movie One', 'movies retain their display title');
assert.strictEqual(QueueModel.itemDisplayTitle(episode), 'S01E02 - The second episode', 'episodes include padded season and episode numbers');
assert.strictEqual(QueueModel.itemDisplayTitle(special), 'S00E01 - Holiday special', 'specials preserve season zero');
assert.deepStrictEqual(QueueModel.episodeNumbers({ type: 'episode', meta: 'Stagione 03', detail: 'E07 - Finale' }), { season: 3, episode: 7 }, 'localized metadata may supply episode numbering');
assert.strictEqual(QueueModel.itemTypeLabel(episode, 'it-IT'), 'SERIE', 'Italian episodes use the series badge');
assert.strictEqual(QueueModel.itemTypeLabel(movie, 'en'), 'MOVIE', 'English movies use the movie badge');

assert.deepStrictEqual(
  QueueModel.progressSummary([
    { ratingKey: 'done', type: 'episode', duration: 600000, viewOffset: 120000, viewed: true },
    { ratingKey: 'partial', type: 'episode', duration: 1200000, viewOffset: 300000, viewed: false },
    { ratingKey: 'percent', type: 'movie', duration: 600000, progress: 50, viewed: false },
    { ratingKey: 'zero', type: 'movie', duration: 0, viewed: false },
    { ratingKey: 'directory', type: 'show', duration: 999999, viewed: true }
  ]),
  { totalCount: 4, watchedCount: 1, remainingCount: 3, totalDuration: 2400000, watchedDuration: 1200000, remainingDuration: 1200000 },
  'playlist progress must combine completed and partial viewing while ignoring non-playable containers'
);

assert.strictEqual(
  QueueModel.drawerScrollTop({ scrollTop: 0, clientHeight: 600, focusedTop: 416, focusedHeight: 190, nextTop: 624, nextHeight: 190, direction: 1, isLast: false }),
  214,
  'downward drawer navigation must scroll enough to keep one complete following card visible'
);
assert.strictEqual(
  QueueModel.drawerScrollTop({ scrollTop: 208, clientHeight: 600, focusedTop: 208, focusedHeight: 190, nextTop: 416, nextHeight: 190, direction: 1, isLast: false }),
  208,
  'downward drawer navigation must not move an already well-positioned focus'
);
assert.strictEqual(
  QueueModel.drawerScrollTop({ scrollTop: 416, clientHeight: 600, focusedTop: 208, focusedHeight: 190, direction: -1, isLast: false }),
  208,
  'upward drawer navigation must reveal the focused card at the nearest top edge'
);
assert.strictEqual(
  QueueModel.drawerScrollTop({ scrollTop: 0, clientHeight: 600, focusedTop: 416, focusedHeight: 190, nextTop: 624, nextHeight: 190, direction: -1, isLast: false }),
  214,
  'upward drawer navigation must also reserve one complete following card for every non-final focus'
);
assert.strictEqual(
  QueueModel.drawerScrollTop({ scrollTop: 0, clientHeight: 600, focusedTop: 624, focusedHeight: 190, direction: 1, isLast: true }),
  214,
  'the final queue card may occupy the bottom visible slot without reserving another row'
);

queue = QueueModel.createQueue([{ ratingKey: 'directory', type: 'show' }, episode, movie], 'movie-1', 'Playlist', 2);
assert.ok(queue, 'playlist items must create a queue');
assert.strictEqual(queue.index, 1, 'filtering directories must preserve the preferred playable occurrence');
assert.strictEqual(queue.title, 'Playlist');
assert.strictEqual(QueueModel.containerKind({ containerType: 'playlist' }), 'playlist', 'playlist containers are queue origins');
assert.strictEqual(QueueModel.containerKind({ containerType: 'collection' }), 'collection', 'collection containers are queue origins');
assert.strictEqual(QueueModel.containerKind({ containerType: 'library' }), '', 'ordinary libraries are not queue origins');
assert.strictEqual(QueueModel.createQueue([{ ratingKey: 'show', type: 'show' }], 'show', 'Invalid', 0), null, 'non-playable containers cannot form queues');

queue = {
  kind: 'series',
  items: [
    { ratingKey: 's1e10', type: 'episode', queueSeasonNumber: 1, queueEpisodeNumber: 10 },
    { ratingKey: 's2e1', type: 'episode', queueSeasonNumber: 2, queueEpisodeNumber: 1 }
  ]
};
target = QueueModel.adjacentItem(queue, 0, 1);
assert.strictEqual(target.item.ratingKey, 's2e1', 'adjacency must cross season boundaries without changing order');
assert.strictEqual(QueueModel.adjacentItem(queue, 0, -1), null, 'the first item has no previous target');
assert.strictEqual(QueueModel.adjacentItem(queue, 1, 1), null, 'the final item has no next target');

assert.deepStrictEqual(
  QueueModel.seriesItems({ index: 2 }, 1, [{ ratingKey: 's2e3', type: 'episode', title: 'Third', index: 3 }], 0)[0],
  {
    ratingKey: 's2e3',
    type: 'episode',
    title: 'Third',
    grandparentTitle: '',
    parentTitle: '',
    detail: '',
    image: '',
    art: '',
    viewed: false,
    progress: 0,
    index: 3,
    queueSeasonIndex: 1,
    queueEpisodeIndex: 0,
    queueSeasonNumber: 2,
    queueEpisodeNumber: 3,
    queueEpisodes: [{ ratingKey: 's2e3', type: 'episode', title: 'Third', index: 3 }]
  },
  'series queue entries retain their source coordinates'
);

queue = QueueModel.seriesItems({ index: 5 }, 4, [{
  ratingKey: 's5e9',
  type: 'episode',
  title: 'Rent-a-Girlfriend',
  meta: 'Stagione 5',
  detail: 'E09 - Il reggiseno e la ragazza',
  index: 9
}], 0);
assert.strictEqual(queue[0].grandparentTitle, 'Rent-a-Girlfriend', 'series queue entries preserve the show title for Up Next');
assert.strictEqual(queue[0].parentTitle, 'Stagione 5', 'series queue entries preserve the season title for Up Next');
assert.strictEqual(queue[0].title, 'Il reggiseno e la ragazza', 'series queue entries keep the episode title separate from its show');

assert.strictEqual(QueueModel.versionAffinity({}, {}, function () {}), null, 'automatic version selection has no affinity descriptor');
affinity = QueueModel.versionAffinity(
  { override: { mediaIndex: 1, partIndex: 0 } },
  {
    mediaIndex: 1,
    partIndex: 0,
    mediaVersions: [
      { mediaIndex: 0, partIndex: 0, videoCodec: 'h264' },
      { mediaIndex: 1, partIndex: 0, videoCodec: 'hevc', width: 3840, height: 2160 }
    ]
  },
  function (version) {
    return { codec: version.videoCodec, dimensions: version.width + 'x' + version.height };
  }
);
assert.deepStrictEqual(affinity, { codec: 'hevc', dimensions: '3840x2160' }, 'selected-version affinity must describe the active version only');
assert.strictEqual(
  QueueModel.versionAffinity(
    { override: { mediaIndex: 1 } },
    { mediaIndex: 9, partIndex: 0, mediaVersions: [{ mediaIndex: 1, partIndex: 0 }] },
    function () { return {}; }
  ),
  null,
  'missing active versions cannot produce an affinity descriptor'
);



assert.deepStrictEqual(
  QueueModel.windowBounds({ focusIndex: 500, total: 1000, viewportItems: 5, direction: 1 }),
  {
    focusIndex: 500,
    total: 1000,
    visibleStart: 498,
    visibleEnd: 503,
    retainedStart: 483,
    retainedEnd: 518,
    sdStart: 483,
    sdEnd: 523,
    finalStart: 495,
    finalEnd: 506
  },
  'queue windows must retain three viewports per side and prefetch one extra viewport only in the active direction'
);
assert.deepStrictEqual(
  QueueModel.windowBounds({ focusIndex: 1, total: 4, viewportItems: 5, direction: -1 }),
  {
    focusIndex: 1,
    total: 4,
    visibleStart: 0,
    visibleEnd: 4,
    retainedStart: 0,
    retainedEnd: 4,
    sdStart: 0,
    sdEnd: 4,
    finalStart: 0,
    finalEnd: 4
  },
  'queue windows must clamp every cache tier to short queue boundaries'
);
assert.strictEqual(
  QueueModel.windowBounds({ focusIndex: 9999, total: 10000, viewportItems: 5, direction: 1 }).retainedEnd,
  10000,
  'the retained window must never exceed the logical queue total'
);

var boundedWindow = QueueModel.windowBounds({ focusIndex: 500, total: 1000, viewportItems: 5, direction: 1 });
assert.strictEqual(boundedWindow.retainedEnd - boundedWindow.retainedStart, 35, 'five visible cards may retain at most seven viewports of DOM');
assert.strictEqual(QueueModel.windowTier(boundedWindow, 500), 'final', 'visible queue artwork must use the final exact-size tier');
assert.strictEqual(QueueModel.windowTier(boundedWindow, 495), 'final', 'three items before the visible range remain eligible for final artwork');
assert.strictEqual(QueueModel.windowTier(boundedWindow, 506), 'sd', 'items outside the final range but inside SD prefetch use the SD tier');
assert.strictEqual(QueueModel.windowTier(boundedWindow, 522), 'sd', 'directional SD prefetch includes one viewport beyond retained DOM');
assert.strictEqual(QueueModel.windowTier(boundedWindow, 482), 'none', 'artwork outside every bounded window must not be requested');

var directionState = QueueModel.prefetchDirection(null, 1);
assert.deepStrictEqual(directionState, { direction: 1, pendingDirection: 0, pendingCount: 0 },
  'the first directional move must establish prefetch priority immediately');
directionState = QueueModel.prefetchDirection(directionState, -1);
assert.deepStrictEqual(directionState, { direction: 1, pendingDirection: -1, pendingCount: 1 },
  'one opposite move must not reverse prefetch priority');
directionState = QueueModel.prefetchDirection(directionState, 1);
assert.deepStrictEqual(directionState, { direction: 1, pendingDirection: 0, pendingCount: 0 },
  'returning to the stable direction must cancel the pending reversal');
directionState = QueueModel.prefetchDirection(directionState, -1);
directionState = QueueModel.prefetchDirection(directionState, -1);
assert.deepStrictEqual(directionState, { direction: -1, pendingDirection: 0, pendingCount: 0 },
  'two consecutive opposite moves must reverse prefetch priority');

console.log('Playback queue model checks passed');
