'use strict';

var assert = require('assert');
var NavigationModel = require('../app/navigation-model');

var items = [
  { kind: 'home', title: 'Home' },
  { kind: 'library', key: '2', title: 'Film' },
  { kind: 'library', key: '4', title: 'Anime' },
  { kind: 'library', key: '1', title: 'TV' },
  { kind: 'watchlist', title: 'Watchlist' },
  { kind: 'search', title: 'Search' },
  { kind: 'settings', title: 'Settings' }
];

assert.deepStrictEqual(
  NavigationModel.applyLibraryOrder(items, ['4', '2']).map(function (item) { return item.title; }),
  ['Home', 'Anime', 'Film', 'TV', 'Watchlist', 'Search', 'Settings'],
  'saved libraries must be ordered by Plex section key and unknown libraries appended'
);

var moved = NavigationModel.moveLibrary(items, 2, -1);
assert.deepStrictEqual(moved.items.map(function (item) { return item.title; }), ['Home', 'Anime', 'Film', 'TV', 'Watchlist', 'Search', 'Settings'], 'a library must move across adjacent libraries');
assert.strictEqual(moved.index, 1, 'focus must follow the moved library');
assert.deepStrictEqual(NavigationModel.moveLibrary(items, 1, -1).items, items, 'Home must remain fixed');
assert.deepStrictEqual(NavigationModel.moveLibrary(items, 3, 1).items, items, 'Watchlist, Search, and Settings must remain fixed');
assert.deepStrictEqual(NavigationModel.libraryKeys(moved.items), ['4', '2', '1'], 'only library keys must be persisted');

var stored = {};
var storage = {
  getItem: function (key) { return stored[key] || null; },
  setItem: function (key, value) { stored[key] = value; }
};
NavigationModel.save(storage, ['4', '2', '1']);
assert.deepStrictEqual(NavigationModel.load(storage), ['4', '2', '1'], 'the library order must survive a storage round trip');

var previewTimers = [];
var clearedPreviewTimers = [];
var previewedIndexes = [];
assert.strictEqual(typeof NavigationModel.createPreviewScheduler, 'function', 'navigation model must expose a cancellable preview scheduler');
var previewScheduler = NavigationModel.createPreviewScheduler({
  setTimeout: function (callback, delay) {
    previewTimers.push({ callback: callback, delay: delay });
    return previewTimers.length;
  },
  clearTimeout: function (timer) { clearedPreviewTimers.push(timer); }
}, 250, function (index) { previewedIndexes.push(index); });
previewScheduler.schedule(2);
previewScheduler.schedule(3);
assert.deepStrictEqual(clearedPreviewTimers, [1], 'moving across the navbar must cancel the previous preview');
assert.strictEqual(previewTimers[1].delay, 250, 'navbar previews must wait 250 ms');
previewTimers[1].callback();
assert.deepStrictEqual(previewedIndexes, [3], 'only the last focused navbar entry must open');
previewScheduler.schedule(4);
previewScheduler.cancel();
assert.deepStrictEqual(clearedPreviewTimers, [1, 3], 'explicit navigation must cancel pending previews without clearing an elapsed timer twice');

console.log('Navigation model checks passed');
