'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var source = [
  fs.readFileSync(path.join(__dirname, '..', 'app', 'coordinator', 'application-controller.js'), 'utf8'),
  fs.readFileSync(path.join(__dirname, '..', 'app', 'coordinator', 'player-feature-controller.js'), 'utf8')
].join('\n');
var styles = fs.readFileSync(path.join(__dirname, '..', 'app', 'styles.css'), 'utf8');
var controllerSource = fs.readFileSync(path.join(__dirname, '..', 'app', 'coordinator', 'playback-queue-controller.js'), 'utf8');
var PlaybackQueueModel = require('../app/playback-queue-model');
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
var adjacent;


function extractFunction(functionName, nextFunctionName) {
  var start = source.indexOf('function ' + functionName + '(');
  var end = source.indexOf('function ' + nextFunctionName + '(', start);
  assert.ok(start >= 0 && end > start, 'test helper must locate ' + functionName);
  return Function('return (' + source.slice(start, end).trim() + ');')();
}

function trackedList(initialNodes) {
  var list = {
    childNodes: initialNodes.slice(0),
    insertions: 0,
    removals: 0,
    insertBefore: function (node, reference) {
      var existing = this.childNodes.indexOf(node);
      var target;
      if (existing >= 0) { this.childNodes.splice(existing, 1); }
      target = reference === null ? this.childNodes.length : this.childNodes.indexOf(reference);
      if (target < 0) { target = this.childNodes.length; }
      this.childNodes.splice(target, 0, node);
      this.insertions += 1;
    },
    removeChild: function (node) {
      var index = this.childNodes.indexOf(node);
      if (index >= 0) { this.childNodes.splice(index, 1); }
      this.removals += 1;
    }
  };
  return list;
}

queue = PlaybackQueueModel.createQueue(items, 's1e1', 'Viewing order', 0);
assert.ok(queue, 'a selected container video must create a playback queue');
assert.strictEqual(queue.items.map(function (item) { return item.ratingKey; }).join(','), 's1e1,s1e2,movie-1,s2e1');
assert.strictEqual(queue.index, 0);

series = PlaybackQueueModel.seriesContext(queue);
assert.strictEqual(series.playlistQueue, true);
assert.strictEqual(series.seasons.length, 1, 'an ordered container must behave as one virtual season');
assert.strictEqual(series.seasons[0].title, 'Viewing order');
assert.strictEqual(series.episodes.map(function (item) { return item.ratingKey; }).join(','), 's1e1,s1e2,movie-1,s2e1');
assert.strictEqual(series.episodes.filter(function (item) { return item.selected; }).length, 1, 'the virtual queue must expose one active item');
assert.strictEqual(series.episodes[2].type, 'movie', 'movies must remain in the queue between episodes');
assert.strictEqual(series.episodes[2].title, 'Movie 01');
assert.strictEqual(series.episodes[3].title, 'Season two premiere');

duplicates = [items[0], items[2], items[0]];
queue = PlaybackQueueModel.createQueue(duplicates, 's1e1', 'Duplicates', 2);
assert.strictEqual(queue.index, 2, 'the focused occurrence must win when a container repeats an item');

mixedDirectories = [{ ratingKey: 'show', type: 'show' }, items[0], items[2]];
queue = PlaybackQueueModel.createQueue(mixedDirectories, 'movie-1', 'Mixed', 2);
assert.strictEqual(queue.index, 1, 'filtering directories must preserve the selected playable occurrence');
assert.strictEqual(queue.items.map(function (item) { return item.ratingKey; }).join(','), 's1e1,movie-1');

assert.strictEqual(PlaybackQueueModel.createQueue([{ ratingKey: 'show', type: 'show' }], 'show', 'Invalid', 0), null, 'non-playable directories must not form a queue');
assert.strictEqual(PlaybackQueueModel.containerKind({ containerType: 'playlist' }), 'playlist', 'video playlists must provide a playback queue');
assert.strictEqual(PlaybackQueueModel.containerKind({ containerType: 'collection' }), 'collection', 'collections must provide the same playback queue');
assert.strictEqual(PlaybackQueueModel.containerKind({ containerType: 'library' }), '', 'ordinary library grids must not become implicit queues');

seriesItems = PlaybackQueueModel.seriesItems({ index: 2 }, 1, [
  { ratingKey: 's2e3', type: 'episode', title: 'Third', index: 3 },
  { ratingKey: 's2e4', type: 'episode', title: 'Fourth', index: 4 }
], 0);
assert.strictEqual(seriesItems.map(function (item) { return item.ratingKey; }).join(','), 's2e3,s2e4', 'series queues must preserve episode order');
assert.strictEqual(seriesItems[0].queueSeasonIndex, 1, 'series queue entries must retain the source season');
assert.strictEqual(seriesItems[0].queueEpisodeIndex, 0, 'series queue entries must retain the source episode index');
assert.strictEqual(seriesItems[1].queueSeasonNumber, 2, 'series queue cards must expose season numbering');
assert.strictEqual(seriesItems[1].queueEpisodeNumber, 4, 'series queue cards must expose episode numbering');
assert.strictEqual(PlaybackQueueModel.itemDisplayTitle(items[0]), 'S01E01 - First episode', 'episode cards must combine padded season, episode, and title');
assert.strictEqual(PlaybackQueueModel.itemDisplayTitle(items[2]), 'Movie 01', 'movie cards must retain their title');
assert.strictEqual(PlaybackQueueModel.firstUnfinishedIndex(items), 1, 'playlist playback must begin from the first item not marked viewed');
assert.strictEqual(PlaybackQueueModel.firstUnfinishedIndex([{ viewed: true }, { viewed: true }]), 0, 'fully viewed playlists must restart from the first item');

upcoming = PlaybackQueueModel.upcomingItems(items, 2);
assert.strictEqual(upcoming.map(function (item) { return item.ratingKey; }).join(','), 'movie-1,s2e1', 'the upcoming helper must retain the current and future queue slice');
assert.strictEqual(PlaybackQueueModel.focusedIndex(0, items.length), 0, 'queue focus must reach earlier visible items');
assert.strictEqual(PlaybackQueueModel.focusedIndex(99, items.length), 3, 'queue focus must stay inside the queue');

queue = PlaybackQueueModel.createQueue(items, 's1e1', 'Viewing order', 0);
adjacent = PlaybackQueueModel.adjacentItem(queue, queue.index, 1);
assert.strictEqual(adjacent.item.ratingKey, 's1e2', 'Up Next must resolve the following item from a generic playback queue');
assert.strictEqual(PlaybackQueueModel.adjacentItem(queue, queue.items.length - 1, 1), null, 'the final queue item must not expose an Up Next target');

assert.ok(source.indexOf("row.insertBefore(button, settings)") !== -1, 'the queue command must be placed immediately before settings');
assert.ok(source.indexOf("if (event.keyCode === 38) { movePlaylistQueueDrawerFocus(-1); }") !== -1 && /function movePlaylistQueueDrawerFocus\(direction\)[\s\S]*playbackQueueController\.moveDrawer/.test(source), 'remote Up must navigate through the queue controller');
assert.ok(source.indexOf("else if (event.keyCode === 40) { movePlaylistQueueDrawerFocus(1); }") !== -1, 'remote Down must navigate the queue');
assert.ok(/event\.keyCode === 13[\s\S]*switchPlayerQueueItem\(queueState\.drawer\.index\)/.test(source), 'remote OK must play the controller-focused queue item');
assert.ok(styles.indexOf('.player-playlist-queue { box-sizing:border-box; position:absolute; z-index:32; top:0; right:0;') !== -1, 'the queue drawer must open on the right above the player');
assert.ok(styles.indexOf('transform:translateX(100%)') === -1, 'the webOS queue drawer must never focus content while translated outside the viewport');
assert.ok(styles.indexOf('width:440px') !== -1 && styles.indexOf('.player-playlist-queue.is-open { right:0;') !== -1, 'the queue drawer must use stable explicit right-edge geometry on Chromium 53');
assert.ok(/function openDrawer\([\s\S]*playlistQueueDrawerFocusReady = false[\s\S]*setTimer\('drawer'/.test(controllerSource) && source.indexOf('settingsPorts.animationDuration(220)') !== -1, 'DOM focus must wait until the controller reports the overlaid queue as visible');
assert.ok(source.indexOf('function resetPlaylistQueueViewportScroll()') !== -1 && source.indexOf('document.documentElement.scrollLeft = 0') !== -1, 'queue focus must neutralize legacy Chromium viewport scrolling');
assert.ok(styles.indexOf('.player-playlist-queue:before') !== -1 && styles.indexOf('linear-gradient(to right, rgba(5,6,8,0), rgba(14,16,20,.97))') !== -1, 'the overlay drawer must retain a soft background edge');
assert.ok(styles.indexOf('.player-view.has-playlist-queue-open .player-video { width:') === -1, 'opening the queue must not resize the native TV video plane');
assert.ok(styles.indexOf('.player-view.has-playlist-queue-open > :not(.player-playlist-queue) { filter:blur') === -1, 'opening the queue must not filter the native video plane');
assert.ok(styles.indexOf('.playlist-queue-card-badge') !== -1, 'queue previews must include a movie or series badge');
assert.ok(styles.indexOf('body.is-container-direct-start #library-view') !== -1, 'direct playlist playback must hide selection work behind a detail-style transition');
assert.strictEqual(styles.indexOf('body.is-container-origin-restoring:after'), -1,
  'returning from playback must reveal the restored origin without a dimming overlay');
assert.ok(source.indexOf("element('span', 'playlist-queue-card-badge')") !== -1 &&
  source.indexOf('setPlaylistQueueText(card.__playlistQueueBadge, typeLabel)') !== -1,
  'queue cards must render their type badge');
assert.ok(/function playlistQueueCardClass\([^)]*viewed[\s\S]*is-viewed/.test(source) &&
  /updatePlaylistQueueCard\([\s\S]*item\.viewed/.test(source),
  'queue cards must retain the shared watched-state class across focus updates');
assert.ok(source.indexOf("t('library.watched')") !== -1,
  'viewed queue items must expose their state in the accessible label');
assert.ok(source.indexOf("element('span', 'playlist-queue-card-image-frame'") !== -1 &&
  /imageFrame\.appendChild\(image\);[\s\S]*card\.appendChild\(imageFrame\)/.test(source),
  'queue artwork must use a positioning frame inside the complete card');
assert.ok(styles.indexOf('.playlist-queue-card.is-viewed .playlist-queue-card-image-frame:after {') !== -1 &&
  styles.indexOf('.playlist-queue-card.is-viewed:after') === -1 &&
  styles.indexOf('.playlist-queue-card-image-frame { position:relative;') !== -1,
  'the watched checkmark must anchor to the bottom-right corner of the queue image');
assert.ok(source.indexOf("element('span', 'playlist-queue-card-now-playing'") !== -1,
  'the current queue card must render a playback-state marker');
assert.ok(styles.indexOf('.playlist-queue-card-now-playing') !== -1 &&
  styles.indexOf('.playlist-queue-card-now-playing.is-playing:before') !== -1 &&
  styles.indexOf('var(--accent') !== -1,
  'the current playback marker must support pause and play states with the accent treatment');
assert.ok(/applyPlaylistQueueDrawerWindow\([\s\S]*playbackPaused = playbackSnapshot\(\)\.paused === true[\s\S]*updatePlaylistQueueCard\([^;]*playbackPaused\)/.test(source),
  'opening the queue must derive the current marker from the live paused state');
assert.ok(/onState: function \(snapshot\)[\s\S]*updatePlaylistQueuePlaybackMarkers\(snapshot\.paused === true\)/.test(source),
  'an open queue must refresh its playback marker when Play or Pause changes');
assert.ok(styles.indexOf('@keyframes playlist-queue-focus-breathe') !== -1 && /\.playlist-queue-card\.is-focused[^\n]*animation:playlist-queue-focus-breathe/.test(styles), 'the selected queue card must use a subtle looping scale cue');
assert.ok(/function scrollPlaylistQueueFocus\(direction, card, next\)[\s\S]*PlaybackQueueModel\.drawerScrollTop/.test(source), 'queue scrolling must use the pure direction-aware viewport policy');
assert.ok(/function updatePlaylistQueueDrawerFocus\([\s\S]*Object\.keys\(playlistQueueCards\)/.test(source),
  'queue focus updates must reuse the retained-card index instead of querying the DOM tree');
assert.strictEqual(/querySelectorAll/.test(source.slice(
  source.indexOf('function updatePlaylistQueueDrawerFocus('),
  source.indexOf('function playbackQueueItemPosition(')
)), false, 'remote focus movement must not run a full drawer selector query');
assert.ok(/function renderPlaylistQueueDrawer\([^)]*\)[\s\S]*playbackQueueController\.loadDrawerWindow/.test(source), 'the queue drawer must request a bounded provider window from the focused occurrence');
assert.ok(/function applyPlaylistQueueDrawerWindow\([\s\S]*records = windowResult && windowResult\.items/.test(source), 'the drawer must render only occurrence records returned for the retained window');
assert.ok(source.indexOf('playlist-queue-spacer') !== -1, 'virtualized queue cards must preserve logical scroll geometry with spacers');
assert.ok(source.indexOf('var playlistQueueCards = {}') !== -1 &&
  /function releasePlaylistQueueCards\(retained\)[\s\S]*source: ''[\s\S]*delete playlistQueueCards/.test(source),
  'evicted queue nodes must cancel only their own progressive artwork jobs');
assert.ok(/card = playlistQueueCards\[cardKey\]/.test(source) && /playlistQueueCards\[cardKey\] = card/.test(source),
  'retained queue occurrences must reuse their existing DOM cards across focus moves');
assert.strictEqual(/function applyPlaylistQueueDrawerWindow\([\s\S]*list\.innerHTML\s*=/.test(source), false,
  'queue focus movement must not clear and rebuild the complete drawer DOM');
assert.ok(/function reconcilePlaylistQueueNodes\(list, desiredNodes\)[\s\S]*removeChild/.test(source) &&
  /function reconcilePlaylistQueueNodes\(list, desiredNodes\)[\s\S]*insertBefore/.test(source),
  'queue window updates must reconcile only changed DOM nodes');
assert.ok(source.indexOf('var playlistQueueSpacers = {}') !== -1,
  'virtual queue spacers must be retained across drawer renders');
assert.ok(/function playlistQueueSpacer\(name, count\)[\s\S]*spacer\.style\.height !== height[\s\S]*spacer\.style\.height = height/.test(source),
  'unchanged virtual spacer geometry must not rewrite inline styles');
assert.ok(source.indexOf('function setPlaylistQueueText') !== -1 &&
  source.indexOf('function setPlaylistQueueClass') !== -1,
  'queue focus movement must avoid rewriting unchanged text and class values');
assert.ok(/function updateEpisodeCommands\(\)[\s\S]*playbackQueueController\.resolveAdjacentState/.test(source),
  'episode command availability must resolve through the active playback queue');
assert.strictEqual(/episodeResolver\.canMove/.test(source), false,
  'episode command availability must not use the legacy detail-only resolver');
assert.ok(/function startCurrentPlayback\([\s\S]*var detailState = detailSnapshot\(\);[\s\S]*item: detailState\.selectedItem/.test(source),
  'starting playback must reuse one detail snapshot');
assert.ok(/function openPlayer\([^)]*\)[\s\S]*var detailState = state \|\| detailSnapshot\(\);[\s\S]*var detail = detailState\.currentDetail;[\s\S]*ResumeChoice\.create\(detail\.viewOffset\)/.test(source),
  'opening the player must reuse one detail snapshot');
assert.ok(/function openPlaylistLibraryItem\([\s\S]*function attemptPlayback\(\)[\s\S]*var detailState = detailSnapshot\(\);[\s\S]*detailState\.currentDetail/.test(source),
  'direct playlist startup polling must read the detail snapshot once per attempt');
assert.ok(/function prefetchAutoplayBackdrop\(\)[\s\S]*var detailState = detailSnapshot\(\);[\s\S]*var currentKey/.test(source),
  'Up Next backdrop prefetch must not clone detail state repeatedly before resolving');
assert.ok(/function updatePlaybackQueuePresentation\(\)[\s\S]*sequence\.identity[\s\S]*releasePlaylistQueueCards\(null\)/.test(source),
  'changing the logical queue origin must release retained drawer cards even while the drawer is closed');
assert.ok(source.indexOf('image.__playlistQueueArtworkKey === requestKey') !== -1 &&
  source.indexOf('image.__playlistQueueArtworkKey = requestKey') !== -1,
  'retained queue cards must not restart an identical artwork request on every focus move');
assert.ok(source.indexOf('image.__playlistQueuePrefetchKey === requestKey') !== -1 &&
  source.indexOf('image.__playlistQueuePrefetchKey = requestKey') !== -1,
  'detached SD prefetch nodes must not restart an identical request while the prefetch window is stable');
assert.ok(source.indexOf('var playlistQueuePrefetchImages = {}') !== -1 &&
  /function prefetchPlaylistQueueArtwork\(records\)[\s\S]*playlist-queue-prefetch/.test(source) &&
  /applyPlaylistQueueDrawerWindow\([\s\S]*windowResult\.prefetchItems/.test(source),
  'the directional SD viewport must prefetch detached artwork without adding queue cards');
assert.ok(source.indexOf('PlaybackQueueModel.windowTier(windowValue, absoluteIndex)') !== -1, 'queue artwork must distinguish final, SD, and non-resident tiers');
assert.ok(/function movePlaylistQueueDrawerFocus\(direction\)[\s\S]*PlaybackQueueModel\.prefetchDirection/.test(source) &&
  /loadDrawerWindow\(\{[\s\S]*direction: playlistQueuePrefetchDirection\.direction/.test(source),
  'rapid direction reversals must use the stabilized prefetch direction rather than restarting the opposite window immediately');
assert.ok(/function renderPlaylistQueueDrawer\([^)]*\)[\s\S]*playbackQueueController\.loadDrawerWindow/.test(source), 'the drawer must request its bounded data window through the queue controller');
assert.ok(source.indexOf('var playlistQueueRenderToken = 0') !== -1 &&
  /function renderPlaylistQueueDrawer\([\s\S]*renderToken = playlistQueueRenderToken \+= 1[\s\S]*renderToken !== playlistQueueRenderToken/.test(source),
  'only the latest coalesced drawer render may apply its provider result');
assert.ok(/function renderPlaylistQueueDrawer\([\s\S]*var detailState = detailStateValue \|\| detailQueueSnapshot\(\);[\s\S]*playbackQueueModel\(detailState\)[\s\S]*loadDrawerWindow\([\s\S]*detailState\)/.test(source),
  'one drawer render must reuse one detail snapshot for queue, bounds, and provider loading');
assert.ok(/function updatePlaylistQueueDrawerFocus\(queueValue, drawerValue, currentIndexValue\)/.test(source) &&
  /applyPlaylistQueueDrawerWindow\([\s\S]*updatePlaylistQueueDrawerFocus\(queue, drawerState, currentIndex\)/.test(source),
  'applying a drawer window must reuse resolved queue and focus state instead of reading snapshots again');
assert.ok(source.indexOf('windowResult.items') !== -1, 'the drawer must render provider occurrences rather than assuming the complete queue is resident');
assert.ok(source.indexOf('itemTitle = playbackQueueItemDisplayTitle(item)') !== -1, 'queue cards must render SxxExx episode titles');
assert.ok(source.indexOf('function startContainerPlayback(container)') !== -1, 'the Play key must support every queue container');
assert.ok(/function startContainer\([\s\S]*function firstUnfinishedOccurrence\([\s\S]*scanProvider/.test(controllerSource),
  'playlist containers must select the first unfinished paginated occurrence');
assert.ok(/function startContainer\([\s\S]*provider\.window\(start, start \+ 40[\s\S]*scanProvider\(nextStart/.test(controllerSource) &&
  /loadContainerPage: function \(container, start, size, callback\)/.test(source),
  'direct container playback must scan bounded provider pages through the injected client callback');
assert.ok(/function startContainer\([\s\S]*loadCurrentMetadata[\s\S]*requestPlayback/.test(controllerSource) &&
  /function applyPlaybackQueueRequest\([\s\S]*openPlayer\(\)/.test(source),
  'direct playlist playback must enter the player through one injected playback callback');
assert.ok(/function resolveAdjacent\([\s\S]*resolveAdjacentState/.test(controllerSource) &&
  /function resolvePlaybackQueueAdjacent\([\s\S]*playbackQueueController\.resolveAdjacent/.test(source),
  'Up Next and background prefetch must consume the generic provider resolver');
assert.ok(/function confirmUpNext\([\s\S]*requestPlayback/.test(controllerSource), 'Up Next confirmation must activate the resolved queue target through the controller');



(function testQueuePlaybackMarkerStates() {
  var markerClass = extractFunction('playlistQueueNowPlayingClass', 'playlistQueueCardClass');
  assert.strictEqual(markerClass(true, true), 'playlist-queue-card-now-playing',
    'opening the queue while paused must retain the existing pause symbol');
  assert.strictEqual(markerClass(true, false), 'playlist-queue-card-now-playing is-playing',
    'opening the queue while playing must show the play symbol');
  assert.strictEqual(markerClass(false, false), 'playlist-queue-card-now-playing is-hidden',
    'non-current media must not expose a playback-state symbol');
}());

(function testOpenQueuePlaybackMarkerToggle() {
  var start = source.indexOf('function updatePlaylistQueuePlaybackMarkers(');
  var end = source.indexOf('function scrollPlaylistQueueFocus(', start);
  var writes = 0;
  var currentMarker = { className: '' };
  var otherMarker = { className: '' };
  var cards = {
    current: { className: 'chapter-card playlist-queue-card is-current', __playlistQueueNowPlaying: currentMarker },
    other: { className: 'chapter-card playlist-queue-card', __playlistQueueNowPlaying: otherMarker }
  };
  var markerClass = extractFunction('playlistQueueNowPlayingClass', 'playlistQueueCardClass');
  var update = Function('playlistQueueCards', 'setPlaylistQueueClass', 'playlistQueueNowPlayingClass',
    'var playlistQueuePlaybackPaused = null; return (' + source.slice(start, end).trim() + ');')(
      cards,
      function (node, value) { node.className = value; writes += 1; },
      markerClass
    );
  update(true);
  assert.strictEqual(currentMarker.className, 'playlist-queue-card-now-playing',
    'Play/Pause while the drawer is open must switch the current marker to Pause');
  assert.strictEqual(otherMarker.className, 'playlist-queue-card-now-playing is-hidden');
  update(false);
  assert.strictEqual(currentMarker.className, 'playlist-queue-card-now-playing is-playing',
    'Play/Pause while the drawer is open must switch the current marker to Play');
  update(false);
  assert.strictEqual(writes, 4, 'unchanged playback state must not rewrite retained queue markers');
}());

(function testVirtualSpacerSkipsUnchangedStyleWrites() {
  var functionStart = source.indexOf('function playlistQueueSpacer(');
  var functionEnd = source.indexOf('function reconcilePlaylistQueueNodes(', functionStart);
  var spacers = {};
  var writes = 0;
  var height = '';
  var style = {};
  var spacer;
  Object.defineProperty(style, 'height', {
    get: function () { return height; },
    set: function (value) { height = value; writes += 1; }
  });
  spacer = { style: style, setAttribute: function () {} };
  var createSpacer = Function('playlistQueueSpacers', 'element',
    'return (' + source.slice(functionStart, functionEnd).trim() + ');')(
      spacers,
      function () { return spacer; }
    );
  createSpacer('is-before', 3);
  createSpacer('is-before', 3);
  assert.strictEqual(writes, 1, 'identical spacer geometry must write its height once');
  createSpacer('is-before', 4);
  assert.strictEqual(writes, 2, 'changed spacer geometry must still update its height');
}());

(function testDrawerDomReconciliationBudget() {
  var reconcile = extractFunction('reconcilePlaylistQueueNodes', 'loadPlaylistQueueArtwork');
  var first = { id: 'first' };
  var second = { id: 'second' };
  var third = { id: 'third' };
  var fourth = { id: 'fourth' };
  var list = trackedList([first, second, third]);
  reconcile(list, [first, second, third]);
  assert.strictEqual(list.insertions + list.removals, 0,
    'an unchanged queue window must not mutate the DOM');
  reconcile(list, [second, third, fourth]);
  assert.deepStrictEqual(list.childNodes, [second, third, fourth]);
  assert.ok(list.insertions + list.removals <= 2,
    'a one-card window shift must remove and append only the changed edge cards');

  var largeWindow = [];
  var shiftedWindow;
  var largeList;
  var index;
  for (index = 0; index < 35; index += 1) { largeWindow.push({ id: index }); }
  shiftedWindow = largeWindow.slice(1);
  shiftedWindow.push({ id: 35 });
  largeList = trackedList(largeWindow);
  reconcile(largeList, shiftedWindow);
  assert.strictEqual(largeList.insertions + largeList.removals, 2,
    'a full overscan window shift must keep DOM work constant rather than scaling with 35 cards');
  largeList = trackedList(shiftedWindow);
  reconcile(largeList, largeWindow);
  assert.strictEqual(largeList.insertions + largeList.removals, 2,
    'reverse scrolling must keep the same constant edge-mutation budget');
}());

console.log('Generic playback queue checks passed');
