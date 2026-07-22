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

var cache = createFixture();
cache.view.load(true);
cache.requests[0].callback(null, { baseUrl: 'provider' });
cache.requests[1].callback(null, []);
cache.view.load(false);
assert.strictEqual(cache.requests.length, 2, 'a completed matching identity must use cached Watchlist data');

var navigation = createFixture();
navigation.view.seed([{ ratingKey: '1' }, { ratingKey: '2' }, { ratingKey: '3' }, { ratingKey: '4' }, { ratingKey: '5' }]);
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
assert.strictEqual(navigation.view.activatePointer(2).ratingKey, '3', 'pointer activation must return the pointed local media');
navigation.view.restoreFocus({ getAttribute: function () { return '4'; } });
assert.strictEqual(navigation.view.snapshot().focusIndex, 4, 'page scroll restoration must recover the visible Watchlist card');

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

console.log('Watchlist view checks passed');
