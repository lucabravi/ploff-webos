'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');

var source = [
  fs.readFileSync(path.join(__dirname, '..', 'app', 'coordinator', 'application-controller.js'), 'utf8'),
  fs.readFileSync(path.join(__dirname, '..', 'app', 'coordinator', 'player-feature-controller.js'), 'utf8')
].join('\n');
var playerQueueSource = fs.readFileSync(path.join(__dirname, '..', 'app', 'coordinator', 'player-queue-controller.js'), 'utf8');
var inputCommandRouterSource = fs.readFileSync(path.join(__dirname, '..', 'app', 'coordinator', 'input-command-router.js'), 'utf8');
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


function extractFunction(sourceText, functionName, nextFunctionName) {
  var start = sourceText.indexOf('function ' + functionName + '(');
  var end = sourceText.indexOf('function ' + nextFunctionName + '(', start);
  assert.ok(start >= 0 && end > start, 'test helper must locate ' + functionName);
  return Function('return (' + sourceText.slice(start, end).trim() + ');')();
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

assert.ok(playerQueueSource.indexOf("row.insertBefore(button, settings)") !== -1, 'the queue command must be placed immediately before settings');
assert.ok(/if \(code === 38\) \{ return 'drawer-up'; \}/.test(inputCommandRouterSource) && /command === 'drawer-up' \|\| command === 'drawer-down'[\s\S]*playerQueueController\.move/.test(source) && /function move\(direction\)[\s\S]*queueController\.moveDrawer/.test(playerQueueSource), 'remote Up must route through the command router and queue presentation owner into the queue domain controller');
assert.ok(/if \(code === 40\) \{ return 'drawer-down'; \}/.test(inputCommandRouterSource) && /command === 'drawer-up' \|\| command === 'drawer-down'/.test(source), 'remote Down must route through the command router before navigating the queue');
assert.ok(/if \(code === 13\) \{ return 'drawer-activate'; \}/.test(inputCommandRouterSource) && /command === 'drawer-activate'[\s\S]*switchPlayerQueueItem\(queueState\.drawer\.index\)/.test(source), 'remote OK must route through the command router before playing the controller-focused queue item');
assert.ok(styles.indexOf('.player-playlist-queue { box-sizing:border-box; position:absolute; z-index:32; top:0; right:0;') !== -1, 'the queue drawer must open on the right above the player');
assert.ok(/function openDrawer\([\s\S]*playlistQueueDrawerFocusReady = false[\s\S]*setTimer\('drawer'/.test(controllerSource) && /queueController\.openDrawer\(detailSnapshot\(\), call\(options\.animationDuration, 220\)\)/.test(playerQueueSource), 'DOM focus must wait until the controller reports the overlaid queue as visible');
assert.ok(styles.indexOf('.player-playlist-queue:before') !== -1 && styles.indexOf('linear-gradient(to right, rgba(5,6,8,0), rgba(14,16,20,.97))') !== -1, 'the overlay drawer must retain a soft background edge');
assert.ok(styles.indexOf('.player-view.has-playlist-queue-open .player-video { width:') === -1, 'opening the queue must not resize the native TV video plane');
assert.ok(styles.indexOf('.player-view.has-playlist-queue-open > :not(.player-playlist-queue) { filter:blur') === -1, 'opening the queue must not filter the native video plane');
assert.ok(styles.indexOf('.playlist-queue-card-badge') !== -1, 'queue previews must include a movie or series badge');
assert.ok(styles.indexOf('body.is-container-direct-start #library-view') !== -1, 'direct playlist playback must hide selection work behind a detail-style transition');
assert.strictEqual(styles.indexOf('body.is-container-origin-restoring:after'), -1,
  'returning from playback must reveal the restored origin without a dimming overlay');
assert.ok(playerQueueSource.indexOf("element('span', 'playlist-queue-card-badge')") !== -1 &&
  playerQueueSource.indexOf('setText(card.__playlistQueueBadge, typeLabel)') !== -1,
  'queue cards must render their type badge');
assert.ok(/function cardClass\([^)]*viewed[\s\S]*is-viewed/.test(playerQueueSource) &&
  /function updateCard\([\s\S]*item\.viewed/.test(playerQueueSource),
  'queue cards must retain the shared watched-state class across focus updates');
assert.ok(playerQueueSource.indexOf("t('library.watched')") !== -1,
  'viewed queue items must expose their state in the accessible label');
assert.ok(playerQueueSource.indexOf("element('span', 'playlist-queue-card-image-frame'") !== -1 &&
  /imageFrame\.appendChild\(image\);[\s\S]*card\.appendChild\(imageFrame\)/.test(playerQueueSource),
  'queue artwork must use a positioning frame inside the complete card');
assert.ok(styles.indexOf('.playlist-queue-card.is-viewed .playlist-queue-card-image-frame:after {') !== -1 &&
  styles.indexOf('.playlist-queue-card.is-viewed:after') === -1 &&
  styles.indexOf('.playlist-queue-card-image-frame { position:relative;') !== -1,
  'the watched checkmark must anchor to the bottom-right corner of the queue image');
assert.ok(playerQueueSource.indexOf("element('span', 'playlist-queue-card-now-playing'") !== -1,
  'the current queue card must render a playback-state marker');
assert.ok(styles.indexOf('.playlist-queue-card-now-playing') !== -1 &&
  styles.indexOf('.playlist-queue-card-now-playing.is-playing:before') !== -1 &&
  styles.indexOf('var(--accent') !== -1,
  'the current playback marker must support pause and play states with the accent treatment');
assert.ok(/function applyDrawerWindow\([\s\S]*paused = playbackSnapshot\(\)\.paused === true[\s\S]*updateCard\([^;]*paused\)/.test(playerQueueSource),
  'opening the queue must derive the current marker from the live paused state');
assert.ok(/onState: function \(snapshot\)[\s\S]*playerQueueController\.updatePlaybackMarkers\(snapshot\.paused === true\)/.test(source),
  'an open queue must refresh its playback marker when Play or Pause changes');
assert.ok(styles.indexOf('@keyframes playlist-queue-focus-breathe') !== -1 && /\.playlist-queue-card\.is-focused[^\n]*animation:playlist-queue-focus-breathe/.test(styles), 'the selected queue card must use a subtle looping scale cue');
assert.ok(/function scrollFocus\(direction, card, next\)[\s\S]*PlaybackQueueModel\.drawerScrollTop/.test(playerQueueSource), 'queue scrolling must use the pure direction-aware viewport policy');
assert.ok(/function updateDrawerFocus\([\s\S]*Object\.keys\(cards\)/.test(playerQueueSource),
  'queue focus updates must reuse the retained-card index instead of querying the DOM tree');
assert.strictEqual(/querySelectorAll/.test(playerQueueSource.slice(
  playerQueueSource.indexOf('function updateDrawerFocus('),
  playerQueueSource.indexOf('function applyDrawerWindow(')
)), false, 'remote focus movement must not run a full drawer selector query');
assert.ok(/function renderDrawer\([^)]*\)[\s\S]*queueController\.loadDrawerWindow/.test(playerQueueSource), 'the queue drawer must request a bounded provider window from the focused occurrence');
assert.ok(/function applyDrawerWindow\([\s\S]*records = windowResult && windowResult\.items/.test(playerQueueSource), 'the drawer must render only occurrence records returned for the retained window');
assert.ok(playerQueueSource.indexOf('playlist-queue-spacer') !== -1, 'virtualized queue cards must preserve logical scroll geometry with spacers');
assert.ok(playerQueueSource.indexOf('var cards = {}') !== -1 &&
  /function releaseCards\(retained\)[\s\S]*source: ''[\s\S]*delete cards/.test(playerQueueSource),
  'evicted queue nodes must cancel only their own progressive artwork jobs');
assert.ok(/card = cards\[key\]/.test(playerQueueSource) && /cards\[key\] = card/.test(playerQueueSource),
  'retained queue occurrences must reuse their existing DOM cards across focus moves');
assert.strictEqual(/function applyDrawerWindow\([\s\S]*list\.innerHTML\s*=/.test(playerQueueSource), false,
  'queue focus movement must not clear and rebuild the complete drawer DOM');
assert.ok(/function reconcileNodes\(list, desiredNodes\)[\s\S]*removeChild/.test(playerQueueSource) &&
  /function reconcileNodes\(list, desiredNodes\)[\s\S]*insertBefore/.test(playerQueueSource),
  'queue window updates must reconcile only changed DOM nodes');
assert.ok(playerQueueSource.indexOf('var spacers = {}') !== -1,
  'virtual queue spacers must be retained across drawer renders');
assert.ok(/function spacer\(name, count\)[\s\S]*node\.style\.height !== height[\s\S]*node\.style\.height = height/.test(playerQueueSource),
  'unchanged virtual spacer geometry must not rewrite inline styles');
assert.ok(playerQueueSource.indexOf('function setText') !== -1 &&
  playerQueueSource.indexOf('function setClass') !== -1,
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
assert.ok(/function prefetchAutoplayBackdrop\(target\)[\s\S]*var detailState = detailSnapshot\(\);[\s\S]*var currentKey/.test(source) &&
  /function updateEpisodeCommands\(\)[\s\S]*result\.state === 'available'[\s\S]*prefetchAutoplayBackdrop\(result\)/.test(source),
  'Up Next backdrop prefetch must reuse the resolved Next target and read detail state only once');
assert.ok(/function updatePresentation\(\)[\s\S]*sequence && state\.sequence\.identity[\s\S]*releaseCards\(null\)/.test(playerQueueSource),
  'changing the logical queue origin must release retained drawer cards even while the drawer is closed');
assert.ok(playerQueueSource.indexOf('image.__playlistQueueArtworkKey === requestKey') !== -1 &&
  playerQueueSource.indexOf('image.__playlistQueueArtworkKey = requestKey') !== -1,
  'retained queue cards must not restart an identical artwork request on every focus move');
assert.ok(playerQueueSource.indexOf('image.__playlistQueuePrefetchKey === requestKey') !== -1 &&
  playerQueueSource.indexOf('image.__playlistQueuePrefetchKey = requestKey') !== -1,
  'detached SD prefetch nodes must not restart an identical request while the prefetch window is stable');
assert.ok(playerQueueSource.indexOf('var prefetchImages = {}') !== -1 &&
  /function prefetchArtwork\(records\)[\s\S]*playlist-queue-prefetch/.test(playerQueueSource) &&
  /function applyDrawerWindow\([\s\S]*windowResult && windowResult\.prefetchItems/.test(playerQueueSource),
  'the directional SD viewport must prefetch detached artwork without adding queue cards');
assert.ok(playerQueueSource.indexOf('PlaybackQueueModel.windowTier(windowValue, absoluteIndex)') !== -1, 'queue artwork must distinguish final, SD, and non-resident tiers');
assert.ok(/function move\(direction\)[\s\S]*PlaybackQueueModel\.prefetchDirection/.test(playerQueueSource) &&
  /loadDrawerWindow\(\{[\s\S]*direction: prefetchDirection\.direction/.test(playerQueueSource),
  'rapid direction reversals must use the stabilized prefetch direction rather than restarting the opposite window immediately');
assert.ok(/function renderDrawer\([^)]*\)[\s\S]*queueController\.loadDrawerWindow/.test(playerQueueSource), 'the drawer must request its bounded data window through the queue controller');
assert.ok(playerQueueSource.indexOf('var renderToken = 0') !== -1 &&
  /function renderDrawer\([\s\S]*token = renderToken \+= 1[\s\S]*token !== renderToken/.test(playerQueueSource),
  'only the latest coalesced drawer render may apply its provider result');
assert.ok(/function renderDrawer\([\s\S]*detailState = detailStateValue \|\| detailSnapshot\(\);[\s\S]*activeQueue\(detailState\)[\s\S]*loadDrawerWindow\([\s\S]*detailState\)/.test(playerQueueSource),
  'one drawer render must reuse one detail snapshot for queue, bounds, and provider loading');
assert.ok(/function updateDrawerFocus\(queueValue, drawerValue, currentIndexValue\)/.test(playerQueueSource) &&
  /function applyDrawerWindow\([\s\S]*updateDrawerFocus\(queueValue, drawerState, currentIndex\)/.test(playerQueueSource),
  'applying a drawer window must reuse resolved queue and focus state instead of reading snapshots again');
assert.ok(playerQueueSource.indexOf('windowResult && windowResult.items') !== -1, 'the drawer must render provider occurrences rather than assuming the complete queue is resident');
assert.ok(playerQueueSource.indexOf('PlaybackQueueModel.itemDisplayTitle(item)') !== -1, 'queue cards must render SxxExx episode titles');
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
  var markerClass = extractFunction(playerQueueSource, 'nowPlayingClass', 'cardClass');
  assert.strictEqual(markerClass(true, true), 'playlist-queue-card-now-playing',
    'opening the queue while paused must retain the existing pause symbol');
  assert.strictEqual(markerClass(true, false), 'playlist-queue-card-now-playing is-playing',
    'opening the queue while playing must show the play symbol');
  assert.strictEqual(markerClass(false, false), 'playlist-queue-card-now-playing is-hidden',
    'non-current media must not expose a playback-state symbol');
}());

(function testOpenQueuePlaybackMarkerToggle() {
  var start = playerQueueSource.indexOf('function updatePlaybackMarkers(');
  var end = playerQueueSource.indexOf('function scrollFocus(', start);
  var writes = 0;
  var currentMarker = { className: '' };
  var otherMarker = { className: '' };
  var cards = {
    current: { className: 'chapter-card playlist-queue-card is-current', __playlistQueueNowPlaying: currentMarker },
    other: { className: 'chapter-card playlist-queue-card', __playlistQueueNowPlaying: otherMarker }
  };
  var markerClass = extractFunction(playerQueueSource, 'nowPlayingClass', 'cardClass');
  var update = Function('cards', 'setClass', 'nowPlayingClass',
    'var destroyed = false; var playbackPaused = null; return (' + playerQueueSource.slice(start, end).trim() + ');')(
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
  var functionStart = playerQueueSource.indexOf('function spacer(');
  var functionEnd = playerQueueSource.indexOf('function reconcileNodes(', functionStart);
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
  var createSpacer = Function('spacers', 'element',
    'return (' + playerQueueSource.slice(functionStart, functionEnd).trim() + ');')(
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
  var reconcile = extractFunction(playerQueueSource, 'reconcileNodes', 'loadArtwork');
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
