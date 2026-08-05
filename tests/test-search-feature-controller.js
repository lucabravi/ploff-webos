'use strict';

var assert = require('assert');
var SearchFeatureController = require('../app/coordinator/search-feature-controller');
var calls = [];
var opened = [];
var controllerOptions = null;
var destroyedCount = 0;
var controllerState = {
  open: true,
  query: 'matrix',
  results: [{ ratingKey: 'one', title: 'One' }],
  focus: { zone: 'results', index: 0, navIndex: 1 }
};

function fakeRequest(name) {
  return {
    name: name,
    aborted: false,
    abort: function () { this.aborted = true; }
  };
}

var fakeController = {
  open: function (keepNavigationFocus, navigationIndex) {
    calls.push('open:' + (keepNavigationFocus ? '1' : '0') + ':' + navigationIndex);
  },
  close: function (keepImages, preserveBackgroundAudio) { calls.push('close:' + (keepImages ? '1' : '0') + ':' + (preserveBackgroundAudio ? '1' : '0')); },
  resume: function () { calls.push('resume'); return controllerState; },
  cancel: function (keepImages) { calls.push('cancel:' + (keepImages ? '1' : '0')); },
  handleKey: function (event, direction) { calls.push('key:' + event.keyCode + ':' + direction); return true; },
  pointerFocus: function (target) { calls.push('pointer:' + target.id); return controllerState; },
  applyKey: function (key) { calls.push('apply:' + key); return controllerState; },
  focusNavigation: function (index) {
    controllerState.focus = { zone: 'nav', index: 0, navIndex: index };
    calls.push('nav:' + index);
    return controllerState;
  },
  focusKeyboard: function (row, column) {
    controllerState.focus = { zone: 'keyboard', row: row, column: column, index: 0, navIndex: 1 };
    calls.push('keyboard:' + row + ':' + column);
    return controllerState;
  },
  focusResult: function (index) {
    controllerState.focus = { zone: 'results', index: index, navIndex: 1 };
    calls.push('result:' + index);
    return controllerState;
  },
  refreshFocus: function () { calls.push('focus'); },
  refreshResults: function () { calls.push('results'); },
  schedule: function () { calls.push('schedule'); },
  snapshot: function () { return controllerState; },
  destroy: function () { destroyedCount += 1; calls.push('destroy'); }
};

var FakeSearchController = {
  create: function (options) {
    controllerOptions = options;
    return fakeController;
  }
};

var localRequest = fakeRequest('local');
var cloudRequest = fakeRequest('cloud');
var guidRequest = fakeRequest('guid');
var localArguments = null;
var cloudArguments = null;
var guidArguments = null;
var providerValue = null;
var ensureProviderCount = 0;

var fakeRoot = {
  getComputedStyle: function () {
    return { marginLeft: '3', marginRight: '4', marginTop: '5', marginBottom: '6' };
  }
};
var fakeDocument = {};
var fakeModel = {
  measureLayout: function (width, height, cardWidth, cardHeight, count) {
    calls.push('measure:' + width + ':' + height + ':' + cardWidth + ':' + cardHeight + ':' + count);
    return { columns: 2, visibleRows: 3, totalRows: 4 };
  }
};
var fakePlexClient = {
  search: function (config, query, navigationItems, callback) {
    localArguments = { config: config, query: query, navigationItems: navigationItems, callback: callback };
    return localRequest;
  },
  findByGuid: function (config, guid, callback) {
    guidArguments = { config: config, guid: guid, callback: callback };
    return guidRequest;
  }
};
var fakeWatchlistClient = {
  search: function (root, options, query, limit, callback) {
    cloudArguments = { root: root, options: options, query: query, limit: limit, callback: callback };
    return cloudRequest;
  }
};

var feature = SearchFeatureController.create({
  root: fakeRoot,
  document: fakeDocument,
  SearchController: FakeSearchController,
  SearchModel: fakeModel,
  SearchView: { create: function () {} },
  SearchSession: { create: function () {} },
  T9Input: { create: function () {} },
  PlexClient: fakePlexClient,
  WatchlistClient: fakeWatchlistClient,
  config: { requestTimeout: 5000 },
  navigationItems: function () { return [{ kind: 'home' }, { kind: 'search' }]; },
  allowsCloud: function () { return true; },
  accountToken: function () { return 'owner-token'; },
  provider: function () { return providerValue; },
  ensureProvider: function (callback) { ensureProviderCount += 1; callback(null, { id: 'provider' }); },
  t9Enabled: function () { return true; },
  navigationCount: function () { return 4; },
  navTarget: function (index) { return { index: index }; },
  onNavigationChange: function (index) { calls.push('nav-change:' + index); },
  onActivateNavigation: function (index) { calls.push('nav-activate:' + index); },
  onOpenResult: function (item) { opened.push(item.ratingKey); },
  onBack: function () { calls.push('back'); },
  onBackdrop: function (item) { calls.push('backdrop:' + (item && item.ratingKey || '')); },
  onFocusItem: function (item) { calls.push('focus-item:' + (item && item.ratingKey || '')); },
  clearFocus: function () { calls.push('clear-focus'); },
  pointerSelectionActive: function () { return false; },
  prioritizePoster: function () { calls.push('prioritize'); },
  mediaTitle: function (item) { return item.title; },
  mediaCardMeta: function () { return 'meta'; },
  mediaCardDetail: function () { return 'detail'; },
  cardMetrics: function () { return { columnStep: 101, rowStep: 151 }; },
  renderedPosterSpecification: function () { return {}; },
  posterLoader: { cancelScope: function (scope) { calls.push('cancel-images:' + scope); } },
  resultOverscanRows: 3,
  playItem: function (item) { calls.push('play:' + item.ratingKey); },
  stopBackgroundAudio: function () { calls.push('stop-audio'); },
  cancelImages: function () { calls.push('cancel-images-action'); },
  isActive: function () { return true; },
  element: function () {}
});

assert.ok(controllerOptions, 'feature constructs the owned SearchController');
assert.strictEqual(controllerOptions.modules.SearchModel, fakeModel, 'SearchModel is injected explicitly');
assert.strictEqual(controllerOptions.modules.SearchView.create instanceof Function, true, 'SearchView is injected explicitly');
assert.strictEqual(controllerOptions.viewOptions.SearchSession.create instanceof Function, true, 'SearchSession is injected explicitly');
assert.strictEqual(controllerOptions.viewOptions.T9Input.create instanceof Function, true, 'T9Input is injected explicitly');

feature.enter({ keepNavigationFocus: false, navigationIndex: 1 });
assert.strictEqual(calls[calls.length - 1], 'open:0:1', 'enter delegates to the Search controller');
feature.resume();
assert.strictEqual(calls[calls.length - 1], 'resume', 'resume reveals retained search results without reopening the query');
assert.strictEqual(feature.handleKey({ keyCode: 13 }, ''), true, 'key input delegates to the Search controller');
feature.pointerFocus({ id: 'poster' });
assert.ok(calls.indexOf('pointer:poster') !== -1, 'pointer focus remains routed through the owned Search controller');
feature.focusNavigation(1);
assert.strictEqual(feature.hasNavigationFocus(), true, 'navigation focus stays queryable without exposing the view');
feature.focusKeyboard(0, 2);
assert.strictEqual(feature.hasNavigationFocus(), false, 'keyboard focus is reflected by the feature snapshot');
feature.restoreResultFocus(0);
feature.refresh();
assert.ok(calls.indexOf('results') >= 0 && calls.indexOf('focus') >= 0, 'refresh updates results and focus together');

controllerState.open = true;
controllerState.query = ' matrix ';
feature.retryAfterNetwork();
assert.strictEqual(calls[calls.length - 1], 'schedule', 'network recovery retries a ready query');
controllerState.query = 'x';
feature.retryAfterNetwork();
assert.strictEqual(calls.filter(function (entry) { return entry === 'schedule'; }).length, 1, 'short queries are not retried');

var localCallback = function () {};
assert.strictEqual(controllerOptions.services.localSearch('alien', localCallback), localRequest, 'local search returns the Plex request');
assert.strictEqual(localArguments.query, 'alien', 'local search preserves the query');
assert.strictEqual(localArguments.navigationItems.length, 2, 'local search receives current navigation libraries');
assert.strictEqual(localArguments.callback, localCallback, 'local search preserves the callback');
assert.strictEqual(controllerOptions.services.cloudEligible(), true, 'cloud search requires cloud access and an account token');

var cloudCallback = function () {};
assert.strictEqual(controllerOptions.services.cloudSearch('alien', cloudCallback), null, 'provider discovery is asynchronous from the feature boundary');
assert.strictEqual(ensureProviderCount, 1, 'missing provider is resolved through the injected provider port');
assert.strictEqual(cloudArguments.options.token, 'owner-token', 'cloud search uses the current owner token');
assert.strictEqual(cloudArguments.options.provider.id, 'provider', 'cloud search uses the resolved provider');
assert.strictEqual(cloudArguments.options.timeout, 5000, 'cloud search uses the bounded configured timeout');
assert.strictEqual(cloudArguments.query, 'alien', 'cloud search preserves the query');
assert.strictEqual(cloudArguments.limit, 12, 'cloud search preserves the bounded result limit');

providerValue = { id: 'cached-provider' };
assert.strictEqual(controllerOptions.services.cloudSearch('matrix', cloudCallback), cloudRequest, 'cached provider returns the provider request');
assert.strictEqual(cloudArguments.options.provider.id, 'cached-provider', 'cached provider is used without discovery');
assert.strictEqual(ensureProviderCount, 1, 'cached provider skips provider discovery');
assert.strictEqual(controllerOptions.services.resolveCloudItem({ guid: 'plex://movie/one' }, localCallback), guidRequest, 'GUID resolution returns the Plex request');
assert.strictEqual(guidArguments.guid, 'plex://movie/one', 'GUID resolution preserves the candidate identity');

var removedProbe = null;
var probe = {
  getBoundingClientRect: function () { return { width: 80, height: 120 }; }
};
var container = {
  clientWidth: 500,
  clientHeight: 400,
  appendChild: function (value) { assert.strictEqual(value, probe); },
  removeChild: function (value) { removedProbe = value; }
};
controllerOptions.viewOptions.element = function () { return probe; };
var measured = controllerOptions.viewOptions.measureLayout(container, 9, 0, 0);
assert.strictEqual(removedProbe, probe, 'measurement removes its temporary DOM probe');
assert.strictEqual(measured.cardWidth, 87, 'measurement includes horizontal margins');
assert.strictEqual(measured.cardHeight, 131, 'measurement includes vertical margins');
assert.ok(calls.indexOf('measure:488:388:87:131:9') >= 0, 'measurement delegates the resolved geometry to SearchModel');

feature.leave({ keepImages: true, preserveBackgroundAudio: true });
assert.ok(calls.indexOf('close:1:1') >= 0, 'detail transitions preserve image work and the active theme audio');

var lateControllerOptions = null;
var lateProviderCallback = null;
var lateCloudSearches = 0;
var lateCloudRequest = null;
var lateFeature = SearchFeatureController.create({
  root: fakeRoot,
  document: fakeDocument,
  SearchController: {
    create: function (options) {
      lateControllerOptions = options;
      return {
        open: function () {}, close: function () {}, cancel: function () {}, handleKey: function () { return false; },
        pointerFocus: function () {}, applyKey: function () {}, focusNavigation: function () {}, focusKeyboard: function () {},
        focusResult: function () {}, refreshFocus: function () {}, refreshResults: function () {}, schedule: function () {},
        snapshot: function () { return { open: true, query: 'old', results: [], focus: { zone: 'keyboard' } }; },
        destroy: function () {}
      };
    }
  },
  SearchModel: fakeModel,
  SearchView: { create: function () {} },
  SearchSession: { create: function () {} },
  T9Input: { create: function () {} },
  PlexClient: fakePlexClient,
  WatchlistClient: {
    search: function () {
      lateCloudSearches += 1;
      lateCloudRequest = fakeRequest('late-cloud');
      return lateCloudRequest;
    }
  },
  config: {},
  navigationItems: function () { return []; },
  allowsCloud: function () { return true; },
  accountToken: function () { return 'owner-token'; },
  provider: function () { return null; },
  ensureProvider: function (callback) { lateProviderCallback = callback; },
  t9Enabled: function () { return true; },
  cardMetrics: function () { return { columnStep: 100, rowStep: 150 }; }
});
lateControllerOptions.services.cloudSearch('old', function () {});
lateFeature.leave({ keepImages: true });
lateProviderCallback(null, { id: 'late-provider' });
assert.strictEqual(lateCloudSearches, 0, 'leaving Search invalidates provider discovery before it can start stale cloud work');
lateFeature.enter({ keepNavigationFocus: true });
lateControllerOptions.services.cloudSearch('current', function () {});
lateProviderCallback(null, { id: 'current-provider' });
assert.strictEqual(lateCloudSearches, 1, 'active provider discovery starts its cloud request');
lateFeature.leave({ keepImages: true });
assert.strictEqual(lateCloudRequest.aborted, true, 'leaving Search aborts cloud work started after provider discovery');
lateFeature.destroy();

var replacementControllerOptions = null;
var replacementCallback = null;
var staleCloudCallbacks = 0;
var replacementFeature = SearchFeatureController.create({
  root: fakeRoot,
  document: fakeDocument,
  SearchController: {
    create: function (options) {
      replacementControllerOptions = options;
      return {
        open: function () {}, close: function () {}, cancel: function () {}, handleKey: function () { return false; },
        pointerFocus: function () {}, applyKey: function () {}, focusNavigation: function () {}, focusKeyboard: function () {},
        focusResult: function () {}, refreshFocus: function () {}, refreshResults: function () {}, schedule: function () {},
        snapshot: function () { return { open: true, query: 'new', results: [], focus: { zone: 'keyboard' } }; },
        destroy: function () {}
      };
    }
  },
  SearchModel: fakeModel,
  SearchView: { create: function () {} },
  SearchSession: { create: function () {} },
  T9Input: { create: function () {} },
  PlexClient: fakePlexClient,
  WatchlistClient: {
    search: function (root, options, query, limit, callback) {
      replacementCallback = callback;
      return { abort: function () { callback(new Error('aborted'), []); } };
    }
  },
  config: {},
  navigationItems: function () { return []; },
  allowsCloud: function () { return true; },
  accountToken: function () { return 'owner-token'; },
  provider: function () { return { id: 'cached-provider' }; },
  t9Enabled: function () { return true; },
  cardMetrics: function () { return { columnStep: 100, rowStep: 150 }; }
});
replacementControllerOptions.services.cloudSearch('old', function () { staleCloudCallbacks += 1; });
replacementControllerOptions.services.cloudSearch('new', function () {});
assert.strictEqual(staleCloudCallbacks, 0, 'replacing cloud work invalidates the old callback before aborting its request');
replacementCallback(null, []);
replacementFeature.destroy();

feature.destroy();
feature.destroy();
assert.strictEqual(destroyedCount, 1, 'destroy is idempotent');
assert.strictEqual(feature.handleKey({ keyCode: 13 }, ''), false, 'destroy makes Search input inert');

console.log('Search feature controller checks passed');
