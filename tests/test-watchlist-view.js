'use strict';

var assert = require('assert');
var WatchlistState = require('../app/watchlist-state');
var WatchlistView = require('../app/watchlist-view');

function createFixture() {
  var requests = [];
  var events = [];
  var available = true;
  var view = WatchlistView.create({
    WatchlistState: WatchlistState,
    available: function () { return available; },
    identity: function () { return 'server|profile'; },
    accountToken: function () { return 'token'; },
    discover: function (options, callback) { return request('discover', callback, options); },
    load: function (options, callback) { return request('load', callback, options); },
    set: function (options, key, enabled, callback) { return request('set', callback, { options: options, key: key, enabled: enabled }); },
    findByGuid: function (guid, callback) { return request('local', callback, { guid: guid }); },
    render: function () { events.push('render'); },
    renderStatus: function (key) { events.push('status:' + key); },
    renderFocus: function (snapshot) { events.push('focus:' + snapshot.zone + ':' + snapshot.focusIndex); },
    onItemsChanged: function () { events.push('items'); },
    onOpenDetail: function (item) { events.push('detail:' + item.ratingKey); },
    onPlay: function (item) { events.push('play:' + item.ratingKey); },
    onNavigate: function (direction) { events.push('nav:' + direction); },
    onBack: function () { events.push('back'); },
    columns: function () { return 4; }
  });

  function request(kind, callback, data) {
    var value = { kind: kind, callback: callback, data: data, aborted: false, abort: function () { this.aborted = true; } };
    requests.push(value);
    return value;
  }

  return { view: view, requests: requests, events: events, setAvailable: function (value) { available = value; } };
}

var stale = createFixture();
stale.view.load(true);
assert.strictEqual(stale.requests[0].kind, 'discover', 'initial load must discover the Plex provider');
stale.view.load(true);
assert.strictEqual(stale.requests[0].aborted, true, 'a replacement load must abort the stale provider request');
stale.requests[0].callback(null, { baseUrl: 'stale' });
assert.strictEqual(stale.requests.length, 2, 'a stale provider callback must not start a Watchlist load');
stale.requests[1].callback(null, { baseUrl: 'fresh' });
assert.strictEqual(stale.requests[2].kind, 'load', 'the current provider must load cloud Watchlist items');
stale.requests[2].callback(null, [{ ratingKey: 'cloud-a', guid: 'guid-a' }, { ratingKey: 'cloud-b', guid: 'guid-b' }]);
assert.strictEqual(stale.requests[3].data.guid, 'guid-a', 'local resolution must preserve cloud item order');
assert.strictEqual(stale.requests[4].data.guid, 'guid-b', 'local resolution must use each cloud guid');
stale.requests[4].callback(null, { ratingKey: 'local-b', title: 'B' });
stale.requests[3].callback(null, { ratingKey: 'local-a', title: 'A' });
assert.deepStrictEqual(stale.view.snapshot().items.map(function (item) { return item.ratingKey; }), ['local-a', 'local-b'], 'resolved local media must retain cloud Watchlist order');
assert.strictEqual(stale.view.getProvider().baseUrl, 'fresh', 'the discovered provider must be reusable by search');
stale.view.cancel();
assert.strictEqual(stale.requests[2].aborted, false, 'completed cloud loads must not remain owned by the Watchlist view');
assert.strictEqual(stale.requests[3].aborted, false, 'completed local resolutions must be released after the Watchlist load');
assert.strictEqual(stale.requests[4].aborted, false, 'all completed local resolutions must be released after the Watchlist load');

var cache = createFixture();
cache.view.load(true);
cache.requests[0].callback(null, { baseUrl: 'provider' });
cache.requests[1].callback(null, []);
cache.view.load(false);
assert.strictEqual(cache.requests.length, 2, 'a completed matching identity must use cached Watchlist data');

var retryAfterFailure = createFixture();
retryAfterFailure.view.load(true);
retryAfterFailure.requests[0].callback(null, { baseUrl: 'provider' });
retryAfterFailure.requests[1].callback(new Error('offline'));
retryAfterFailure.view.load(false);
assert.strictEqual(retryAfterFailure.requests.length, 3, 'a failed Watchlist load must not cache the identity and must retry on the next entry');
assert.strictEqual(retryAfterFailure.requests[2].kind, 'load', 'a retry after a failed Watchlist load must reuse the discovered provider');

var partialResolution = createFixture();
partialResolution.view.load(true);
partialResolution.requests[0].callback(null, { baseUrl: 'provider' });
partialResolution.requests[1].callback(null, [
  { ratingKey: 'cloud-ok', guid: 'guid-ok' },
  { ratingKey: 'cloud-fail', guid: 'guid-fail' }
]);
partialResolution.requests[2].callback(null, { ratingKey: 'local-ok', title: 'OK' });
partialResolution.requests[3].callback(new Error('offline'));
assert.ok(partialResolution.view.snapshot().error, 'a local-resolution transport failure must remain visible as a retryable Watchlist error');
assert.deepStrictEqual(partialResolution.view.snapshot().items.map(function (item) { return item.ratingKey; }), ['local-ok'], 'resolved Watchlist items should remain visible when another local lookup fails');
assert.strictEqual(partialResolution.view.snapshot().loadedIdentity, '', 'a partially resolved Watchlist must not be cached as complete');
partialResolution.view.load(false);
assert.strictEqual(partialResolution.requests[4].kind, 'load', 're-entering after a partial resolution error must retry the cloud Watchlist using the discovered provider');

var navigation = createFixture();
navigation.view.seed([{ ratingKey: '1' }, { ratingKey: '2' }, { ratingKey: '3' }, { ratingKey: '4' }, { ratingKey: '5' }]);
var crossServerIdentity = createFixture();
crossServerIdentity.view.seed([
  { ratingKey: 'same', serverMachineIdentifier: 'server-a', title: 'A', viewed: false, viewOffset: 1000, progress: 0.1, duration: 600000 },
  { ratingKey: 'same', serverMachineIdentifier: 'server-b', title: 'B', viewed: false, viewOffset: 2000, progress: 0.2, duration: 600000 }
]);
assert.strictEqual(crossServerIdentity.view.findLocal('same', 'server-a').serverMachineIdentifier, 'server-a',
  'Watchlist lookup must resolve the requested PMS when ratingKeys collide');
assert.strictEqual(crossServerIdentity.view.findLocal('same', 'server-b').serverMachineIdentifier, 'server-b',
  'Watchlist lookup must keep colliding ratingKeys separated by PMS');
assert.strictEqual(typeof crossServerIdentity.view.reconcileWatchedState, 'function',
  'Watchlist must expose an in-memory watched-state reconciler for Detail returns');
crossServerIdentity.view.reconcileWatchedState('same', true, 'server-b');
assert.strictEqual(crossServerIdentity.view.findLocal('same', 'server-a').viewed, false,
  'Watchlist watched reconciliation must not mutate the same ratingKey owned by another PMS');
assert.strictEqual(crossServerIdentity.view.findLocal('same', 'server-b').viewed, true,
  'Watchlist watched reconciliation must update the matching PMS card immediately');
assert.strictEqual(crossServerIdentity.view.findLocal('same', 'server-b').viewOffset, 0,
  'marking a Watchlist item watched must clear its local resume offset');
assert.strictEqual(crossServerIdentity.view.findLocal('same', 'server-b').progress, 0,
  'marking a Watchlist item watched must clear its local progress projection');
crossServerIdentity.view.reconcilePlaybackProgress('same', 180, 'server-a');
assert.strictEqual(crossServerIdentity.view.findLocal('same', 'server-a').viewOffset, 180000,
  'Watchlist playback reconciliation must update the matching PMS resume offset');
assert.strictEqual(crossServerIdentity.view.findLocal('same', 'server-a').progress, 30,
  'Watchlist playback reconciliation must recompute progress from the local duration');
assert.strictEqual(crossServerIdentity.view.findLocal('same', 'server-b').viewOffset, 0,
  'Watchlist playback reconciliation must preserve an equal ratingKey owned by another PMS');
crossServerIdentity.view.setFocus(1);
crossServerIdentity.view.seed([{ ratingKey: 'same', serverMachineIdentifier: 'server-b', title: 'B' }]);
assert.strictEqual(crossServerIdentity.view.focusedItem().serverMachineIdentifier, 'server-b',
  'Watchlist focus identity must distinguish identical ratingKeys from different PMSes');
navigation.view.open(false);
navigation.view.setFocus(3);
navigation.view.handleKeyDown({ keyCode: 38, preventDefault: function () {} }, 'up');
assert.strictEqual(navigation.view.snapshot().zone, 'nav', 'Up from the first Watchlist row must restore navbar focus');
navigation.view.open(false);
navigation.view.setFocus(3);
navigation.view.handleKeyDown({ keyCode: 40, preventDefault: function () {} }, 'down');
assert.strictEqual(navigation.view.snapshot().focusIndex, 4, 'Down on an incomplete final row must select the final available item');
navigation.view.open(false);
navigation.view.pointerFocus(2);
assert.strictEqual(navigation.view.snapshot().focusIndex, 2, 'pointer focus must select the pointed Watchlist card');
navigation.view.handleKeyDown({ keyCode: 13, preventDefault: function () {} }, '');
assert.ok(navigation.events.indexOf('detail:3') !== -1, 'semantic OK must open the pointed local media');
navigation.view.restoreFocus({ getAttribute: function () { return '4'; } });
assert.strictEqual(navigation.view.snapshot().focusIndex, 4, 'page scroll restoration must recover the visible Watchlist card');
navigation.view.handleKeyDown({ keyCode: 461, preventDefault: function () {} }, '');
assert.strictEqual(navigation.view.snapshot().zone, 'nav', 'Back from Watchlist content must focus its current navbar entry');
assert.strictEqual(navigation.events.indexOf('back'), -1, 'the first Back must not leave Watchlist');
navigation.view.handleKeyDown({ keyCode: 461, preventDefault: function () {} }, '');
assert.ok(navigation.events.indexOf('back') !== -1, 'Back from the Watchlist navbar entry must return Home');

var rebuiltNavTarget = { className: 'nav-item is-focused', focus: function () {} };
var rebuiltNav = WatchlistView.create({
  WatchlistState: WatchlistState,
  document: { getElementById: function () { return null; } },
  available: function () { return true; },
  navTarget: function () { return rebuiltNavTarget; },
  clearFocus: function () { rebuiltNavTarget.className = rebuiltNavTarget.className.replace(/\s*is-focused/g, ''); },
  pointerSelectionActive: function () { return true; },
  onNavigate: function () { rebuiltNavTarget = { className: 'nav-item is-focused', focus: function () {} }; }
});
rebuiltNav.open(true);
rebuiltNav.handleKeyDown({ keyCode: 39, preventDefault: function () {} }, 'right');
assert.strictEqual((rebuiltNavTarget.className.match(/(?:^|\s)is-focused(?=\s|$)/g) || []).length, 1, 'navbar rebuilds during Watchlist navigation must not duplicate the focus class');

(function testWatchlistPublishesDirectionalAdjacentBackdropCandidates() {
  var adjacent = [];
  var view = WatchlistView.create({
    WatchlistState: WatchlistState,
    document: { getElementById: function () { return null; } },
    available: function () { return true; },
    active: function () { return true; },
    columns: function () { return 3; },
    render: function () {},
    onFocus: function (item, candidates) { if (item) { adjacent.push((candidates || []).map(function (entry) { return entry.ratingKey; })); } }
  });
  view.seed([
    { ratingKey: 'a' }, { ratingKey: 'b' }, { ratingKey: 'c' },
    { ratingKey: 'd' }, { ratingKey: 'e' }, { ratingKey: 'f' },
    { ratingKey: 'g' }, { ratingKey: 'h' }, { ratingKey: 'i' }
  ]);
  view.open(false);
  view.setFocus(4);
  adjacent.length = 0;
  view.handleKeyDown({ keyCode: 39, preventDefault: function () {} }, 'right');
  assert.deepStrictEqual(adjacent[adjacent.length - 1], ['e', 'i', 'c'],
    'Watchlist focus must publish right, opposite and vertical adjacent backdrop candidates after movement');
}());

var mutation = createFixture();
mutation.view.seed([{ ratingKey: 'existing', cloudRatingKey: 'cloud-existing', inWatchlist: true }]);
mutation.view.setProvider({ baseUrl: 'provider' });
mutation.view.toggle('cloud-new', true, { ratingKey: 'new', title: 'New' }, function () {});
assert.strictEqual(mutation.view.snapshot().mutationPending, true, 'Watchlist mutation state must be private to the view');
assert.deepStrictEqual(mutation.view.snapshot().items.map(function (item) { return item.ratingKey; }), ['existing', 'new'], 'Watchlist mutations must update the local view optimistically');
mutation.requests[0].callback(new Error('nope'));
assert.strictEqual(mutation.view.snapshot().items.length, 1, 'failed mutations must rollback the prior local Watchlist state');
mutation.view.toggle('cloud-new', true, { ratingKey: 'new', title: 'New' }, function () {});
mutation.requests[1].callback(null);
assert.deepStrictEqual(mutation.view.snapshot().items.map(function (item) { return item.ratingKey; }), ['existing', 'new'], 'successful mutations must update the local Watchlist state');
mutation.view.reset();
assert.strictEqual(mutation.view.snapshot().items.length, 0, 'reset must clear Watchlist state after a server or profile change');

var staleMutation = createFixture();
var staleMutationCallbacks = 0;
staleMutation.view.seed([{ ratingKey: 'old', cloudRatingKey: 'cloud-old', inWatchlist: true }]);
staleMutation.view.setProvider({ baseUrl: 'provider' });
var staleMutationRequest = staleMutation.view.toggle('cloud-new', true, { ratingKey: 'new' }, function () { staleMutationCallbacks += 1; });
assert.strictEqual(staleMutationRequest, staleMutation.requests[0], 'Watchlist mutations must expose their cancellable request to feature owners');
staleMutation.view.reset();
assert.strictEqual(staleMutation.requests[0].aborted, true, 'reset must abort an in-flight Watchlist mutation');
staleMutation.requests[0].callback(new Error('late failure'));
assert.deepStrictEqual(staleMutation.view.snapshot().items, [], 'a stale Watchlist mutation must not restore items from the previous profile or server');
assert.strictEqual(staleMutationCallbacks, 0, 'stale Watchlist mutation callbacks must not patch the current screen');

var background = createFixture();
background.view.seed([{ ratingKey: 'existing' }]);
background.view.setProvider({ baseUrl: 'provider' });
background.view.toggle('cloud-new', true, { ratingKey: 'new' }, function () {});
assert.strictEqual(background.events.filter(function (event) { return event.indexOf('focus:') === 0; }).length, 0, 'background Watchlist mutations must not steal focus from an open detail view');

var scrollGrid = {
  scrollTop: 0,
  getBoundingClientRect: function () { return { top: 0, bottom: 100 }; }
};
var scrollCard = {
  className: 'watchlist-card',
  focus: function () { this.focused = true; },
  getBoundingClientRect: function () { return { top: 80, bottom: 140 }; }
};
var scrollView = WatchlistView.create({
  WatchlistState: WatchlistState,
  document: {
    getElementById: function (id) { return id === 'watchlist-grid' ? scrollGrid : null; },
    querySelector: function () { return scrollCard; }
  },
  available: function () { return true; },
  columns: function () { return 4; },
  clearFocus: function () {},
  pointerSelectionActive: function () { return false; }
});
scrollView.seed([{ ratingKey: 'scroll' }]);
scrollView.setFocus(0);
assert.ok(scrollGrid.scrollTop > 0 && scrollCard.focused, 'focused Watchlist cards must restore page scroll without leaving navigation focus behind');


function renderNode(tagName, className, text) {
  var value = {
    tagName: String(tagName || '').toUpperCase(), className: className || '', textContent: text || '', children: [], attributes: {}, style: {}, parentNode: null,
    appendChild: function (child) { child.parentNode = this; this.children.push(child); return child; },
    setAttribute: function (key, attributeValue) { this.attributes[key] = String(attributeValue); },
    getAttribute: function (key) { return this.attributes[key]; },
    focus: function () {},
    getBoundingClientRect: function () { return { top: 0, bottom: 80 }; }
  };
  value.querySelector = function (selector) {
    var found = null;
    function visit(node) {
      node.children.forEach(function (child) {
        if (!found && selector.charAt(0) === '.' && (' ' + child.className + ' ').indexOf(' ' + selector.slice(1) + ' ') !== -1) { found = child; }
        if (!found) { visit(child); }
      });
    }
    visit(value);
    return found;
  };
  Object.defineProperty(value, 'innerHTML', { set: function () { value.children = []; } });
  return value;
}

var renderedNodes = {
  'watchlist-grid-content': renderNode('div'),
  'watchlist-grid': renderNode('div'),
  'watchlist-status': renderNode('div')
};
var renderedView = WatchlistView.create({
  WatchlistState: WatchlistState,
  document: {
    getElementById: function (id) { return renderedNodes[id] || null; },
    querySelector: function (selector) {
      var match = selector.match(/data-watchlist-index="(\d+)"/);
      var index;
      if (!match) { return null; }
      for (index = 0; index < renderedNodes['watchlist-grid-content'].children.length; index += 1) {
        if (renderedNodes['watchlist-grid-content'].children[index].getAttribute('data-watchlist-index') === match[1]) {
          return renderedNodes['watchlist-grid-content'].children[index];
        }
      }
      return null;
    }
  },
  element: renderNode,
  mediaTitle: function (item) { return item.title; },
  mediaCardMeta: function () { return ''; },
  mediaCardDetail: function () { return ''; },
  available: function () { return true; },
  columns: function () { return 4; },
  clearFocus: function () {},
  pointerSelectionActive: function () { return true; }
});
(function unresolvedWatchlistArtworkKeepsDeclaredOwner() {
  var nodes = {
    'watchlist-grid-content': renderNode('div'),
    'watchlist-grid': renderNode('div'),
    'watchlist-status': renderNode('div')
  };
  var capturedItem = null;
  var jobs = [];
  var item = { ratingKey: 'offline-watchlist', title: 'Offline Watchlist', image: '/offline-watchlist.jpg', serverMachineIdentifier: 'server-offline' };
  var view = WatchlistView.create({
    WatchlistState: WatchlistState,
    document: { getElementById: function (id) { return nodes[id] || null; } },
    element: renderNode,
    available: function () { return true; },
    columns: function () { return 4; },
    cardProfile: function () { return { metrics: { width: 200, imageHeight: 300, height: 400 }, poster: { width: 200, height: 300 } }; },
    sourceContextForItem: function () { return null; },
    fixedPosterSpecification: function (source, size, priority, scope, sourceContext, sourceItem) {
      capturedItem = sourceItem;
      return { source: source, width: size.width, height: size.height, priority: priority, scope: scope, sourceContext: sourceContext };
    },
    posterLoader: { loadBatch: function (batch) { jobs = batch.slice(); }, cancelScope: function () {} },
    clearFocus: function () {},
    pointerSelectionActive: function () { return true; }
  });
  view.seed([item]);
  view.open(false);
  assert.strictEqual(jobs.length, 1, 'unresolved external Watchlist artwork must still be represented by one poster job');
  assert.strictEqual(capturedItem, item, 'Watchlist poster specifications must retain the declaring media item when its owner route is unavailable');
}());

renderedView.seed([{ ratingKey: 'one', title: 'One', libraryTitle: 'Film' }, { ratingKey: 'two', title: 'Two' }]);
renderedView.open(false);
assert.strictEqual(renderedNodes['watchlist-grid-content'].children[0].querySelector('.watchlist-library-badge').textContent, 'Film', 'Watchlist cards display their resolved local library');
assert.strictEqual(renderedNodes['watchlist-grid-content'].children[1].querySelector('.watchlist-library-badge'), null, 'Watchlist cards omit empty source badges');

(function hiddenWatchlistMutationDoesNotStealDetailFocus() {
  var active = true;
  var clearFocusCalls = 0;
  var focusedNodes = 0;
  var request = null;
  var nodes = {
    'watchlist-grid-content': renderNode('div'),
    'watchlist-grid': renderNode('div'),
    'watchlist-status': renderNode('div')
  };
  var originalFocus = nodes['watchlist-grid-content'].focus;
  var view = WatchlistView.create({
    WatchlistState: WatchlistState,
    document: { getElementById: function (id) { return nodes[id] || null; } },
    element: function (tagName, className, text) {
      var target = renderNode(tagName, className, text);
      target.focus = function () { focusedNodes += 1; };
      return target;
    },
    available: function () { return true; },
    isActive: function () { return active; },
    columns: function () { return 4; },
    clearFocus: function () { clearFocusCalls += 1; },
    pointerSelectionActive: function () { return false; },
    set: function (options, key, enabled, callback) {
      request = { abort: function () {}, callback: callback };
      return request;
    }
  });
  nodes['watchlist-grid-content'].focus = originalFocus;
  view.seed([{ ratingKey: 'one', cloudRatingKey: 'cloud-one', title: 'One' }]);
  view.setProvider({ baseUrl: 'provider' });
  view.open(false);
  clearFocusCalls = 0;
  focusedNodes = 0;
  active = false;
  view.toggle('cloud-one', false, { ratingKey: 'one', title: 'One' }, function () {});
  assert.strictEqual(clearFocusCalls, 0, 'a Watchlist mutation behind Detail must not clear focus on the active Detail surface');
  assert.strictEqual(focusedNodes, 0, 'a hidden Watchlist mutation must not focus hidden card or navigation nodes');
  assert.strictEqual(view.snapshot().zone, 'nav', 'removing the final Watchlist item must leave a valid navbar focus zone for Back recovery');
  request.callback(new Error('rollback'));
  assert.strictEqual(view.focusedItem().ratingKey, 'one', 'a failed hidden Watchlist mutation must restore the removed focused item');
  assert.strictEqual(view.snapshot().zone, 'grid', 'a failed Watchlist mutation must restore the previous focus zone together with its items');
  assert.strictEqual(clearFocusCalls, 0, 'rolling back a hidden Watchlist mutation must still not touch Detail focus');
  assert.strictEqual(focusedNodes, 0, 'rolling back a hidden Watchlist mutation must not focus hidden Watchlist DOM');
}());

(function watchlistRefreshPreservesFocusedItemIdentityWhenIndicesShift() {
  var view = createFixture().view;
  view.seed([
    { ratingKey: 'a' }, { ratingKey: 'b' }, { ratingKey: 'c' }, { ratingKey: 'd' }
  ]);
  view.open(false);
  view.setFocus(2);
  assert.strictEqual(view.focusedItem().ratingKey, 'c', 'fixture must focus the expected Watchlist item before mutation');
  view.seed([{ ratingKey: 'b' }, { ratingKey: 'c' }, { ratingKey: 'd' }]);
  assert.strictEqual(view.focusedItem().ratingKey, 'c', 'Watchlist refreshes must preserve the focused media identity when earlier items disappear');
  view.seed([{ ratingKey: 'b' }, { ratingKey: 'd' }]);
  assert.strictEqual(view.focusedItem().ratingKey, 'd', 'if the focused Watchlist item itself disappears, focus must fall to the nearest valid numeric slot');
  view.seed([]);
  assert.strictEqual(view.snapshot().zone, 'nav', 'an emptied Watchlist refresh must leave grid focus and fall back to navigation');
}());

(function asyncWatchlistReloadPreservesFocusedItemIdentityWhenIndicesShift() {
  var fixture = createFixture();
  var view = fixture.view;
  view.seed([{ ratingKey: 'a' }, { ratingKey: 'b' }, { ratingKey: 'c' }]);
  view.open(false);
  view.setFocus(1);
  view.setProvider({ baseUrl: 'provider' });
  view.load(true);
  assert.strictEqual(fixture.requests[0].kind, 'load', 'a known Watchlist provider must refresh without rediscovery');
  fixture.requests[0].callback(null, [
    { ratingKey: 'cloud-b', guid: 'guid-b' },
    { ratingKey: 'cloud-c', guid: 'guid-c' }
  ]);
  fixture.requests[1].callback(null, { ratingKey: 'b', title: 'B' });
  fixture.requests[2].callback(null, { ratingKey: 'c', title: 'C' });
  assert.strictEqual(view.focusedItem().ratingKey, 'b', 'an async Watchlist reload must keep the same focused media when earlier entries disappear');
  assert.strictEqual(view.snapshot().focusIndex, 0, 'an async Watchlist reload must update the logical focus index to the focused media new position');
}());


(function watchlistScrollCoalescesIntoOneAnimationFrame() {
  var nodes = {
    'watchlist-grid-content': renderNode('div'),
    'watchlist-grid': renderNode('div'),
    'watchlist-status': renderNode('div')
  };
  var frames = [];
  var renders = 0;
  var fullDeferrals = [];
  var view = WatchlistView.create({
    root: {
      requestAnimationFrame: function (callback) { frames.push(callback); return frames.length; },
      cancelAnimationFrame: function (id) { frames[id - 1] = null; }
    },
    WatchlistState: WatchlistState,
    document: { getElementById: function (id) { return nodes[id] || null; } },
    element: renderNode,
    render: function () { renders += 1; },
    available: function () { return true; },
    columns: function () { return 5; },
    cardProfile: function () { return { metrics: { width: 200, imageHeight: 300, height: 400 }, poster: { width: 200, height: 300 }, posterGap: 20 }; },
    posterLoader: { deferFullLoads: function (delay) { fullDeferrals.push(delay); } },
    clearFocus: function () {},
    pointerSelectionActive: function () { return true; }
  });
  var items = [];
  var index;
  for (index = 0; index < 200; index += 1) { items.push({ ratingKey: String(index), title: 'Item ' + index }); }
  view.seed(items);
  view.open(false);
  var baselineRenders = renders;
  nodes['watchlist-grid'].scrollTop = 8 * 420;
  view.onScroll();
  for (var scrollBurst = 9; scrollBurst <= 16; scrollBurst += 1) {
    nodes['watchlist-grid'].scrollTop = scrollBurst * 420;
    view.onScroll();
  }
  assert.deepStrictEqual(fullDeferrals, [120], 'coalesced Watchlist scrolling must open one artwork idle window per scheduled frame');
  assert.strictEqual(frames.length, 1, 'rapid Watchlist scroll events must schedule one animation-frame callback');
  assert.strictEqual(renders, baselineRenders, 'Watchlist must not rebuild its virtual window synchronously inside the scroll event');
  frames[0]();
  assert.strictEqual(renders, baselineRenders + 1, 'the coalesced Watchlist frame must reconcile the virtual window once');
  var cards = nodes['watchlist-grid-content'].children.filter(function (child) { return child.getAttribute('data-watchlist-index') !== undefined; });
  assert.strictEqual(cards[0].getAttribute('data-watchlist-index'), '70', 'the coalesced frame must use the latest scroll position rather than the first event');
}());

(function staleWatchlistScrollFrameCannotCrossLeaveAndReenter() {
  var nodes = {
    'watchlist-grid-content': renderNode('div'),
    'watchlist-grid': renderNode('div'),
    'watchlist-status': renderNode('div')
  };
  var frames = [];
  var renders = 0;
  var view = WatchlistView.create({
    root: {
      requestAnimationFrame: function (callback) { frames.push(callback); return frames.length; }
    },
    WatchlistState: WatchlistState,
    document: { getElementById: function (id) { return nodes[id] || null; } },
    element: renderNode,
    render: function () { renders += 1; },
    available: function () { return true; },
    columns: function () { return 5; },
    cardProfile: function () { return { metrics: { width: 200, imageHeight: 300, height: 400 }, poster: { width: 200, height: 300 }, posterGap: 20 }; },
    clearFocus: function () {},
    pointerSelectionActive: function () { return true; }
  });
  var list = [];
  var index;
  for (index = 0; index < 200; index += 1) { list.push({ ratingKey: 'stale-' + index, title: 'Stale ' + index }); }
  view.seed(list);
  view.open(false);
  nodes['watchlist-grid'].scrollTop = 8 * 420;
  view.onScroll();
  assert.strictEqual(frames.length, 1, 'fixture must retain the first pending Watchlist frame');
  view.leave();
  view.open(false);
  nodes['watchlist-grid'].scrollTop = 14 * 420;
  view.onScroll();
  assert.strictEqual(frames.length, 2, 're-entering Watchlist must own a new scroll frame');
  var rendersBeforeStaleFrame = renders;
  frames[0]();
  assert.strictEqual(renders, rendersBeforeStaleFrame, 'a pre-leave Watchlist frame must not reconcile the re-entered surface when cancellation is unavailable');
  view.onScroll();
  assert.strictEqual(frames.length, 2, 'a stale pre-leave frame must not clear ownership of the current re-entry frame');
}());

(function pendingWatchlistScrollFrameUsesCurrentItemsAfterListShrink() {
  var nodes = {
    'watchlist-grid-content': renderNode('div'),
    'watchlist-grid': renderNode('div'),
    'watchlist-status': renderNode('div')
  };
  var frames = [];
  var view = WatchlistView.create({
    root: { requestAnimationFrame: function (callback) { frames.push(callback); return frames.length; } },
    WatchlistState: WatchlistState,
    document: { getElementById: function (id) { return nodes[id] || null; } },
    element: renderNode,
    available: function () { return true; },
    columns: function () { return 5; },
    cardProfile: function () { return { metrics: { width: 200, imageHeight: 300, height: 400 }, poster: { width: 200, height: 300 }, posterGap: 20 }; },
    clearFocus: function () {},
    pointerSelectionActive: function () { return true; }
  });
  var list = [];
  var index;
  for (index = 0; index < 100; index += 1) { list.push({ ratingKey: 'shrink-' + index, title: 'Shrink ' + index }); }
  view.seed(list);
  view.open(false);
  nodes['watchlist-grid'].scrollTop = 10 * 420;
  view.onScroll();
  assert.strictEqual(frames.length, 1, 'fixture must retain a pending Watchlist scroll frame before list shrink');
  view.seed([{ ratingKey: 'new-0' }, { ratingKey: 'new-1' }, { ratingKey: 'new-2' }]);
  view.render();
  frames[0]();
  assert.strictEqual(view.snapshot().items.length, 3, 'a pending scroll frame must never restore items removed by a newer Watchlist state');
  nodes['watchlist-grid-content'].children.filter(function (card) {
    return card && card.hasAttribute && card.hasAttribute('data-watchlist-index');
  }).forEach(function (card) {
    assert.ok(Number(card.getAttribute('data-watchlist-index')) < 3, 'a pending scroll frame after list shrink must render only indices from the current item set');
  });
}());

var largeNodes = {
  'watchlist-grid-content': renderNode('div'),
  'watchlist-grid': renderNode('div'),
  'watchlist-status': renderNode('div')
};
var largeQuerySelectorCalls = 0;
var largeClearFocusCalls = 0;
var largeView = WatchlistView.create({
  WatchlistState: WatchlistState,
  document: {
    getElementById: function (id) { return largeNodes[id] || null; },
    querySelector: function (selector) {
      var match = selector.match(/data-watchlist-index="(\d+)"/);
      var index;
      largeQuerySelectorCalls += 1;
      if (!match) { return null; }
      if (!largeNodes['watchlist-grid-content']) { return null; }
      for (index = 0; index < largeNodes['watchlist-grid-content'].children.length; index += 1) {
        if (largeNodes['watchlist-grid-content'].children[index].getAttribute('data-watchlist-index') === match[1]) {
          return largeNodes['watchlist-grid-content'].children[index];
        }
      }
      return null;
    }
  },
  element: renderNode,
  mediaTitle: function (item) { return item.title; },
  mediaCardMeta: function () { return ''; },
  mediaCardDetail: function () { return ''; },
  available: function () { return true; },
  columns: function () { return 5; },
  cardProfile: function () { return { metrics: { width: 200, imageHeight: 300, height: 400 }, poster: { width: 200, height: 300 }, posterGap: 20 }; },
  clearFocus: function () { largeClearFocusCalls += 1; },
  pointerSelectionActive: function () { return true; }
});
var largeItems = [];
var largeIndex;
for (largeIndex = 0; largeIndex < 10000; largeIndex += 1) {
  largeItems.push({ ratingKey: String(largeIndex), title: 'Item ' + largeIndex });
}
largeView.seed(largeItems);
largeView.open(false);
largeQuerySelectorCalls = 0;
largeClearFocusCalls = 0;
largeView.setFocus(1);
assert.strictEqual(largeQuerySelectorCalls, 0, 'same-window Watchlist focus must use mounted card references instead of a document-wide selector');
assert.strictEqual(largeClearFocusCalls, 0, 'same-window Watchlist card movement must clear its tracked mounted card without scanning global focus');
var detachedWatchlistGrid = largeNodes['watchlist-grid-content'];
var detachedWatchlistCard = detachedWatchlistGrid.children.filter(function (child) { return child.getAttribute('data-watchlist-index') === '2'; })[0];
largeNodes['watchlist-grid-content'] = null;
largeView.render();
largeQuerySelectorCalls = 0;
largeView.setFocus(2);
assert.strictEqual(largeQuerySelectorCalls, 1, 'a missing Watchlist container must invalidate mounted-card references and fall back safely');
assert.ok(detachedWatchlistCard.className.indexOf('is-focused') === -1, 'a missing Watchlist container must not refocus a stale detached card');
largeNodes['watchlist-grid-content'] = detachedWatchlistGrid;
largeView.render();
assert.strictEqual(largeView.snapshot().items.length, 10000, 'Watchlist virtualization must keep the complete logical item list at stress scale');
assert.ok(largeNodes['watchlist-grid-content'].children.length <= 27, 'Watchlist virtualization must keep at most five card rows plus two spacers mounted');
assert.strictEqual(largeNodes['watchlist-grid-content'].children[0].getAttribute('data-watchlist-index'), '0', 'the initial mounted window must preserve logical Plex order');
largeView.setFocus(50);
var mountedLargeCards = largeNodes['watchlist-grid-content'].children.filter(function (child) { return child.getAttribute('data-watchlist-index') !== undefined; });
assert.ok(largeNodes['watchlist-grid-content'].children.length <= 27, 'moving through a large Watchlist must keep the mounted window bounded');
assert.strictEqual(mountedLargeCards[0].getAttribute('data-watchlist-index'), '40', 'window remount must preserve the logical index of the first retained card');
assert.strictEqual(mountedLargeCards[mountedLargeCards.length - 1].getAttribute('data-watchlist-index'), '64', 'window remount must preserve the logical index of the last retained card');
var retainedLargeCard = mountedLargeCards[0];
largeView.setFocus(51);
mountedLargeCards = largeNodes['watchlist-grid-content'].children.filter(function (child) { return child.getAttribute('data-watchlist-index') !== undefined; });
assert.strictEqual(mountedLargeCards[0], retainedLargeCard, 'same-window focus movement must not rebuild Watchlist cards');
largeQuerySelectorCalls = 0;
largeView.restoreFocus(9999);
mountedLargeCards = largeNodes['watchlist-grid-content'].children.filter(function (child) { return child.getAttribute('data-watchlist-index') !== undefined; });
assert.strictEqual(largeView.snapshot().focusIndex, 9999, 'restoring a logical Watchlist index must remount and focus that item at stress scale');
assert.strictEqual(largeQuerySelectorCalls, 0, 'far Watchlist focus jumps must rebuild the mounted window without a document-wide target query');
assert.strictEqual(mountedLargeCards[mountedLargeCards.length - 1].getAttribute('data-watchlist-index'), '9999', 'restoring the final Watchlist item must mount the final logical card');
largeView.setFocus(0);
largeNodes['watchlist-grid'].scrollTop = 12 * 420;
largeView.onScroll();
mountedLargeCards = largeNodes['watchlist-grid-content'].children.filter(function (child) { return child.getAttribute('data-watchlist-index') !== undefined; });
assert.strictEqual(largeView.snapshot().focusIndex, 0, 'page scrolling must not change logical Watchlist focus before pointer focus synchronization');
assert.strictEqual(mountedLargeCards[0].getAttribute('data-watchlist-index'), '50', 'page scrolling must remount cards around the visible virtual row instead of exposing a blank spacer');
assert.strictEqual(mountedLargeCards[mountedLargeCards.length - 1].getAttribute('data-watchlist-index'), '74', 'page scrolling must retain a bounded five-row Watchlist window around the visible row');
largeNodes['watchlist-grid'].scrollTop = 999999;
largeView.onScroll();
mountedLargeCards = largeNodes['watchlist-grid-content'].children.filter(function (child) { return child.getAttribute('data-watchlist-index') !== undefined; });
assert.strictEqual(mountedLargeCards[mountedLargeCards.length - 1].getAttribute('data-watchlist-index'), '9999', 'out-of-range page scroll positions must clamp to the final logical Watchlist row');

(function overlappingWatchlistWindowsRetainCardsAndArtwork() {
  var nodes = { 'watchlist-grid-content': renderNode('div'), 'watchlist-grid': renderNode('div'), 'watchlist-status': renderNode('div') };
  var batches = [];
  var cancelled = [];
  var cancelledScopes = [];
  var view = WatchlistView.create({
    WatchlistState: WatchlistState,
    document: { getElementById: function (id) { return nodes[id] || null; } },
    element: renderNode,
    columns: function () { return 5; },
    available: function () { return true; },
    cardProfile: function () { return { metrics: { width: 200, height: 400 }, poster: { width: 200, height: 300 }, posterGap: 20 }; },
    fixedPosterSpecification: function (source) { return { source: source }; },
    posterLoader: {
      loadBatch: function (batch) { batches.push(batch.slice()); },
      cancel: function (target) { cancelled.push(target); },
      cancelScope: function (scope) { cancelledScopes.push(scope); }
    },
    clearFocus: function () {},
    pointerSelectionActive: function () { return true; }
  });
  var items = [];
  var index;
  var retained;
  for (index = 0; index < 100; index += 1) { items.push({ ratingKey: String(index), title: 'Item ' + index, image: '/poster/' + index }); }
  view.seed(items);
  view.open(false);
  retained = nodes['watchlist-grid-content'].children.filter(function (card) { return card.getAttribute('data-watchlist-index') === '10'; })[0];
  var spacerHeight = nodes['watchlist-grid-content'].children[nodes['watchlist-grid-content'].children.length - 1].style.height;
  view.seed(items.slice(0, 90));
  view.render();
  assert.notStrictEqual(nodes['watchlist-grid-content'].children[nodes['watchlist-grid-content'].children.length - 1].style.height, spacerHeight,
    'a shorter Watchlist must update its trailing spacer even when the mounted cards are unchanged');
  view.seed(items);
  view.render();
  nodes['watchlist-grid'].scrollTop = 4 * 420;
  view.onScroll();
  assert.strictEqual(nodes['watchlist-grid-content'].children.filter(function (card) { return card.getAttribute('data-watchlist-index') === '10'; })[0], retained,
    'scrolling one overlapping Watchlist window must retain its mounted poster node');
  assert.strictEqual(batches[batches.length - 1].length, 20, 'only the newly exposed Watchlist cards need poster jobs');
  assert.strictEqual(cancelled.length, 10, 'only cards that leave the Watchlist window cancel their poster work');
  assert.strictEqual(cancelledScopes.length, 0, 'scrolling must not cancel artwork for the whole Watchlist');
}());

console.log('Watchlist view checks passed');
