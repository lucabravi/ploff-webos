'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var vm = require('vm');

var source = fs.readFileSync(path.join(__dirname, '..', 'app', 'source', '69-playlist-queue.js'), 'utf8');
var styles = fs.readFileSync(path.join(__dirname, '..', 'app', 'styles.css'), 'utf8');
var start = source.indexOf('function playlistQueuePlayable');
var end = source.indexOf('  var playlistPlaybackQueue');
var context = { isFinite: isFinite, Number: Number, String: String };
var items = [
  { ratingKey: 's1e1', type: 'episode', title: 'Example Show', detail: 'E01 - First episode', seasonIndex: 1, episodeIndex: 1, viewed: true },
  { ratingKey: 's1e2', type: 'episode', title: 'Example Show', detail: 'E02 - Second episode', seasonIndex: 1, episodeIndex: 2 },
  { ratingKey: 'movie-1', type: 'movie', title: 'Movie 01' },
  { ratingKey: 's2e1', type: 'episode', title: 'Example Show', detail: 'E01 - Season two premiere' }
];
var queue;
var series;
var duplicates;
var mixedDirectories;
var upcoming;
var seriesItems;

assert.ok(start >= 0 && end > start, 'playback queue helpers must remain independently testable');
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

queue = context.createPlaylistQueue(items, 's1e1', 'Viewing order', 0);
assert.ok(queue, 'a selected container video must create a playback queue');
assert.strictEqual(queue.items.map(function (item) { return item.ratingKey; }).join(','), 's1e1,s1e2,movie-1,s2e1');
assert.strictEqual(queue.index, 0);

series = context.playlistQueueSeriesContext(queue);
assert.strictEqual(series.playlistQueue, true);
assert.strictEqual(series.seasons.length, 1, 'an ordered container must behave as one virtual season');
assert.strictEqual(series.seasons[0].title, 'Viewing order');
assert.strictEqual(series.episodes.map(function (item) { return item.ratingKey; }).join(','), 's1e1,s1e2,movie-1,s2e1');
assert.strictEqual(series.episodes.filter(function (item) { return item.selected; }).length, 1, 'the virtual queue must expose one active item');
assert.strictEqual(series.episodes[2].type, 'movie', 'movies must remain in the queue between episodes');
assert.strictEqual(series.episodes[2].title, 'Movie 01');
assert.strictEqual(series.episodes[3].title, 'Season two premiere');

duplicates = [items[0], items[2], items[0]];
queue = context.createPlaylistQueue(duplicates, 's1e1', 'Duplicates', 2);
assert.strictEqual(queue.index, 2, 'the focused occurrence must win when a container repeats an item');

mixedDirectories = [{ ratingKey: 'show', type: 'show' }, items[0], items[2]];
queue = context.createPlaylistQueue(mixedDirectories, 'movie-1', 'Mixed', 2);
assert.strictEqual(queue.index, 1, 'filtering directories must preserve the selected playable occurrence');
assert.strictEqual(queue.items.map(function (item) { return item.ratingKey; }).join(','), 's1e1,movie-1');

assert.strictEqual(context.createPlaylistQueue([{ ratingKey: 'show', type: 'show' }], 'show', 'Invalid', 0), null, 'non-playable directories must not form a queue');
assert.strictEqual(context.playbackQueueContainerKind({ containerType: 'playlist' }), 'playlist', 'video playlists must provide a playback queue');
assert.strictEqual(context.playbackQueueContainerKind({ containerType: 'collection' }), 'collection', 'collections must provide the same playback queue');
assert.strictEqual(context.playbackQueueContainerKind({ containerType: 'library' }), '', 'ordinary library grids must not become implicit queues');

seriesItems = context.seriesQueueItems({ index: 2 }, 1, [
  { ratingKey: 's2e3', type: 'episode', title: 'Third', index: 3 },
  { ratingKey: 's2e4', type: 'episode', title: 'Fourth', index: 4 }
], 0);
assert.strictEqual(seriesItems.map(function (item) { return item.ratingKey; }).join(','), 's2e3,s2e4', 'series queues must preserve episode order');
assert.strictEqual(seriesItems[0].queueSeasonIndex, 1, 'series queue entries must retain the source season');
assert.strictEqual(seriesItems[0].queueEpisodeIndex, 0, 'series queue entries must retain the source episode index');
assert.strictEqual(seriesItems[1].queueSeasonNumber, 2, 'series queue cards must expose season numbering');
assert.strictEqual(seriesItems[1].queueEpisodeNumber, 4, 'series queue cards must expose episode numbering');
assert.strictEqual(context.playbackQueueItemDisplayTitle(items[0]), 'S01E01 - First episode', 'episode cards must combine padded season, episode, and title');
assert.strictEqual(context.playbackQueueItemDisplayTitle(items[2]), 'Movie 01', 'movie cards must retain their title');
assert.strictEqual(context.playlistQueueFirstUnwatchedIndex(items), 1, 'playlist playback must begin from the first item not marked viewed');
assert.strictEqual(context.playlistQueueFirstUnwatchedIndex([{ viewed: true }, { viewed: true }]), 0, 'fully viewed playlists must restart from the first item');

upcoming = context.playlistQueueUpcoming(items, 2);
assert.strictEqual(upcoming.map(function (item) { return item.ratingKey; }).join(','), 'movie-1,s2e1', 'the drawer must show the current and future queue only');
assert.strictEqual(context.playlistQueueFocusedIndex(2, 0, items.length), 2, 'queue focus must not move above the current item');
assert.strictEqual(context.playlistQueueFocusedIndex(2, 99, items.length), 3, 'queue focus must stay inside the queue');

assert.ok(source.indexOf("row.insertBefore(button, settings)") !== -1, 'the queue command must be placed immediately before settings');
assert.ok(source.indexOf("if (event.keyCode === 38) { movePlaylistQueueDrawerFocus(-1); }") !== -1, 'remote Up must navigate the queue');
assert.ok(source.indexOf("else if (event.keyCode === 40) { movePlaylistQueueDrawerFocus(1); }") !== -1, 'remote Down must navigate the queue');
assert.ok(source.indexOf("switchPlayerQueueItem(playlistQueueDrawerIndex)") !== -1, 'remote OK must play the focused queue item');
assert.ok(styles.indexOf('.player-playlist-queue { box-sizing:border-box; position:absolute; z-index:32; top:0; right:0;') !== -1, 'the queue drawer must open on the right above the player');
assert.ok(styles.indexOf('transform:translateX(100%)') === -1, 'the webOS queue drawer must never focus content while translated outside the viewport');
assert.ok(styles.indexOf('width:440px') !== -1 && styles.indexOf('.player-playlist-queue.is-open { right:0;') !== -1, 'the queue drawer must use stable explicit right-edge geometry on Chromium 53');
assert.ok(source.indexOf('playlistQueueDrawerFocusReady = false') !== -1 && source.indexOf('interfaceAnimationDuration(220)') !== -1, 'DOM focus must wait until the overlaid queue is visible');
assert.ok(source.indexOf('function resetPlaylistQueueViewportScroll()') !== -1 && source.indexOf('document.documentElement.scrollLeft = 0') !== -1, 'queue focus must neutralize legacy Chromium viewport scrolling');
assert.ok(styles.indexOf('.player-playlist-queue:before') !== -1 && styles.indexOf('linear-gradient(to right, rgba(5,6,8,0), rgba(14,16,20,.97))') !== -1, 'the overlay drawer must retain a soft background edge');
assert.ok(styles.indexOf('.player-view.has-playlist-queue-open .player-video { width:') === -1, 'opening the queue must not resize the native TV video plane');
assert.ok(styles.indexOf('.player-view.has-playlist-queue-open > :not(.player-playlist-queue) { filter:blur') === -1, 'opening the queue must not filter the native video plane');
assert.ok(styles.indexOf('.playlist-queue-card-badge') !== -1, 'queue previews must include a movie or series badge');
assert.ok(styles.indexOf('body.is-playlist-direct-start #library-view') !== -1, 'direct playlist playback must hide selection work behind a detail-style transition');
assert.ok(source.indexOf("badge = element('span', 'playlist-queue-card-badge', playbackQueueTypeLabel(item))") !== -1, 'queue cards must render their type badge');
assert.ok(source.indexOf('itemTitle = playbackQueueItemDisplayTitle(item)') !== -1, 'queue cards must render SxxExx episode titles');
assert.ok(source.indexOf('function startPlaylistContainerPlayback(container)') !== -1, 'the Play key must support playlist containers');
assert.ok(source.indexOf('targetIndex = playlistQueueFirstUnwatchedIndex(playable)') !== -1, 'playlist containers must select the first unwatched item');
assert.ok(source.indexOf('PlexClient.loadLibraryContainerPage(config, container, start, 60') !== -1, 'direct playlist playback must load every page before choosing its start item');
assert.ok(source.indexOf('PlexClient.loadMetadata(config, target.ratingKey') !== -1 && source.indexOf('openPlayer();') !== -1, 'direct playlist playback must enter the player without revealing detail selection');

console.log('Generic playback queue checks passed');
