'use strict';

var assert = require('assert');
var SearchController = require('../app/coordinator/search-controller');
var localCallbacks = {};
var cloudCallbacks = {};
var played = [];
var resolveCallbacks = {};
var calls = [];
var viewState = {
  results: [{ ratingKey: 'one', title: 'One' }],
  focus: { zone: 'results', index: 0 },
  query: ''
};

function request() {
  return {
    aborted: false,
    abort: function () { this.aborted = true; }
  };
}

var fakeView = {
  snapshot: function () { return viewState; },
  inputKeyCode: function (code) { calls.push('digit:' + code); return code === 50; },
  back: function () { calls.push('back'); },
  backspaceT9: function () { return false; },
  applyKey: function (key) { calls.push('key:' + key); },
  flushT9: function () { calls.push('flush'); },
  handleDirection: function (direction) { calls.push('direction:' + direction); },
  activate: function () { calls.push('activate'); },
  open: function () { calls.push('open'); },
  close: function () { calls.push('close'); },
  cancel: function () { calls.push('cancel'); },
  refreshFocus: function () { calls.push('focus'); },
  refreshResults: function () { calls.push('results'); },
  focusNavigation: function (index) { calls.push('nav:' + index); },
  focusKeyboard: function (row, column) { calls.push('keyboard:' + row + ':' + column); },
  focusResult: function (index) { calls.push('result:' + index); },
  pointerFocus: function () { calls.push('pointer'); }
};

var controller = SearchController.create({
  modules: {
    SearchModel: {
      relevantCloudItems: function (query, items) { return items; },
      mergeLocalResults: function (local, remote) { return local.concat(remote); }
    },
    SearchView: { create: function (options) { fakeView.load = options.load; return fakeView; } }
  },
  viewOptions: {},
  services: {
    localSearch: function (query, callback) {
      localCallbacks[query] = callback;
      return request();
    },
    cloudEligible: function () { return true; },
    cloudSearch: function (query, callback) {
      cloudCallbacks[query] = callback;
      return request();
    },
    resolveCloudItem: function (item, callback) {
      if (item.defer) { resolveCallbacks[item.local.ratingKey] = callback; }
      else { callback(null, item.local); }
      return request();
    }
  },
  actions: {
    playItem: function (item) { played.push(item.ratingKey); },
    stopBackgroundAudio: function () { calls.push('stopAudio'); }
  },
  t9Enabled: function () { return true; }
});

assert.strictEqual(Object.prototype.hasOwnProperty.call(controller, 'view'), false, 'SearchController must not expose its owned view');

var firstUpdates = [];
var firstRequest = fakeView.load('at', function (error, items, complete) {
  firstUpdates.push({ error: error, items: items, complete: complete });
});
localCallbacks.at(null, [{ ratingKey: 'local', title: 'Local' }]);
assert.deepStrictEqual(firstUpdates[0].items.map(function (item) { return item.ratingKey; }), ['local'], 'local results render before cloud aliases');
assert.strictEqual(firstUpdates[0].complete, false, 'local-first rendering remains open for cloud aliases');
cloudCallbacks.at(null, [{ local: { ratingKey: 'cloud', title: 'Cloud' } }]);
assert.deepStrictEqual(firstUpdates[1].items.map(function (item) { return item.ratingKey; }), ['local', 'cloud'], 'resolved cloud aliases merge into local results');
assert.strictEqual(firstUpdates[1].complete, true, 'cloud completion closes the request');

var orderedUpdates = [];
fakeView.load('order', function (error, items, complete) {
  orderedUpdates.push({ error: error, items: items, complete: complete });
});
localCallbacks.order(null, []);
cloudCallbacks.order(null, [
  { defer: true, local: { ratingKey: 'first', title: 'First' } },
  { defer: true, local: { ratingKey: 'second', title: 'Second' } }
]);
resolveCallbacks.second(null, { ratingKey: 'second', title: 'Second' });
resolveCallbacks.first(null, { ratingKey: 'first', title: 'First' });
assert.deepStrictEqual(orderedUpdates[1].items.map(function (item) { return item.ratingKey; }), ['first', 'second'], 'cloud aliases must preserve relevance order even when metadata resolves out of order');

var staleUpdates = 0;
var staleRequest = fakeView.load('old', function () { staleUpdates += 1; });
staleRequest.abort();
localCallbacks.old(null, [{ ratingKey: 'stale' }]);
assert.strictEqual(staleUpdates, 0, 'aborted generations suppress stale local responses');

controller.handleKey({ keyCode: 50, preventDefault: function () {} }, '');
assert.ok(calls.indexOf('digit:50') >= 0, 'numeric remote input routes through T9');
controller.handleKey({ keyCode: 8, preventDefault: function () {} }, '');
assert.ok(calls.indexOf('key:backspace') >= 0, 'Backspace edits the search query');
controller.handleKey({ keyCode: 39, preventDefault: function () {} }, 'right');
assert.ok(calls.indexOf('direction:right') >= 0, 'directional input stays delegated to the search view');
controller.handleKey({ keyCode: 415, preventDefault: function () {} }, '');
assert.deepStrictEqual(played, ['one'], 'Play starts the focused search result');
controller.handleKey({ keyCode: 13, preventDefault: function () {} }, '');
assert.ok(calls.indexOf('activate') >= 0, 'OK activates the focused search target');
controller.applyKey('a');
controller.focusNavigation(2);
controller.focusKeyboard(1, 3);
controller.focusResult(0);
controller.pointerFocus({});
assert.ok(calls.indexOf('key:a') >= 0, 'semantic key input delegates to the owned Search view');
assert.ok(calls.indexOf('nav:2') >= 0, 'semantic navigation focus delegates to the owned Search view');
assert.ok(calls.indexOf('keyboard:1:3') >= 0, 'semantic keyboard focus delegates to the owned Search view');
assert.ok(calls.indexOf('result:0') >= 0, 'semantic result focus delegates to the owned Search view');
assert.ok(calls.indexOf('pointer') >= 0, 'semantic pointer focus delegates to the owned Search view');

controller.open(false, 2);
calls.length = 0;
controller.close(false, true);
assert.strictEqual(calls.indexOf('stopAudio'), -1, 'closing Search for a detail transition must preserve the active theme audio');
controller.close();
assert.ok(calls.indexOf('stopAudio') >= 0, 'leaving search stops background audio');
controller.destroy();
assert.strictEqual(controller.handleKey({ keyCode: 13 }, ''), false, 'destroy makes search input inert');
assert.strictEqual(firstRequest.isAborted(), false, 'completed request groups remain observable');

console.log('Search controller checks passed');
