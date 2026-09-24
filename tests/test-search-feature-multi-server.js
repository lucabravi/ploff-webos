'use strict';
var assert = require('assert');
var Feature = require('../app/coordinator/search-feature-controller');
var options = null;
var localCalls = 0;
var resolveCalls = 0;
var localRequest = { abort: function () {} };
var resolveRequest = { abort: function () {} };
Feature.create({
  root: {}, document: {},
  SearchController: { create: function (value) { options = value; return { snapshot: function () { return { open: false, query: '', results: [], focus: { zone: 'keyboard' } }; }, destroy: function () {} }; } },
  SearchModel: { measureLayout: function () { return {}; } }, SearchView: {}, SearchSession: {}, T9Input: {},
  PlexClient: { search: function () { throw new Error('primary search fallback must not run'); }, findByGuid: function () { throw new Error('primary GUID fallback must not run'); } },
  WatchlistClient: {}, config: {},
  localSearch: function (query, callback) { localCalls += 1; assert.strictEqual(query, 'alien'); assert.strictEqual(typeof callback, 'function'); return localRequest; },
  resolveCloudItem: function (candidate, callback) { resolveCalls += 1; assert.strictEqual(candidate.guid, 'plex://movie/external'); assert.strictEqual(typeof callback, 'function'); return resolveRequest; },
  cardMetrics: function () { return { columnStep: 100, rowStep: 150 }; }
});
assert.strictEqual(options.services.localSearch('alien', function () {}), localRequest);
assert.strictEqual(localCalls, 1);
assert.strictEqual(options.services.resolveCloudItem({ guid: 'plex://movie/external' }, function () {}), resolveRequest);
assert.strictEqual(resolveCalls, 1);
console.log('Search feature multi-server ports checks passed');
