'use strict';
var assert = require('assert');
var Controller = require('../app/coordinator/multi-server-content-controller');
var Store = require('../app/library-tab-store');
var sources = ['a', 'b'].map(function (id) {
  return { id: id + '|1', serverMachineIdentifier: id, sectionKey: '1', sectionTitle: id, sectionType: 'movie', primary: id === 'a' };
});
var library = { virtualLibrary: true, key: 'virtual', sourceId: 'virtual', memberSourceIds: ['a|1', 'b|1'] };
function create(transport, extra) {
  var options = extra || {};
  options.transport = transport;
  options.sources = {
    resolveServers: function (done) { done(null, []); },
    source: function (id) { return sources.filter(function (source) { return source.id === id; })[0]; },
    resolveSource: function (id, done) { done(null, { serverMachineIdentifier: id.charAt(0), primary: id.charAt(0) === 'a', apiBaseUrl: 'https://' + id.charAt(0), token: 'test' }); }
  };
  return Controller.create(options);
}

(function filtersTranslatePerSourceAndDoNotLeakLocalIds() {
  var calls = [];
  var controller = create({
    loadLibraryFilterOptions: function (config, _library, done) {
      done(null, { genre: config.apiBaseUrl === 'https://a'
        ? [{ label: 'Drama', value: '1' }, { label: 'Comedy', value: '2' }]
        : [{ label: 'Drama', value: '9' }, { label: 'Action', value: '1' }] });
    },
    loadLibraryPage: function (config, _library, _view, query, start, size, done) {
      calls.push([config.apiBaseUrl, query.filters.genre]);
      done(null, { items: [], nextStart: 0, hasMore: false });
    }
  });
  var filters;
  controller.loadVirtualLibraryFilterOptions(library, function (error, result) { assert.ifError(error); filters = result; });
  assert.deepStrictEqual(filters.genre.map(function (option) { return option.label; }), ['Action', 'Comedy', 'Drama']);
  var query = { filters: { genre: filters.genre[2].value } };
  controller.loadVirtualLibraryPage(library, 'catalog', query, 0, 10, function (error) { assert.ifError(error); });
  assert.deepStrictEqual(calls, [['https://a', '1'], ['https://b', '9']]);
  assert.strictEqual(query.filters.genre, filters.genre[2].value, 'member translation must not mutate shared query');
  calls = [];
  controller.loadVirtualLibraryPage(library, 'catalog', { filters: { genre: filters.genre[1].value } }, 10, 10, function (error) { assert.ifError(error); });
  assert.deepStrictEqual(calls, [['https://a', '2']], 'changed nested filter needs its own session; sources lacking the option are excluded');
  controller.destroy();
}());

(function explicitGroupsSurvivePersistenceAndAliases() {
  var state = Store.reconcile(null, sources, { now: Date.now() });
  state = Store.update(state, 'a|1', { mergeGroup: 'Cinema', alias: 'Movies' });
  state = Store.update(state, 'b|1', { mergeGroup: 'Cinema', alias: 'Film' });
  var encoded;
  var storage = { setItem: function (_key, value) { encoded = value; }, getItem: function () { return encoded; } };
  Store.save(storage, state);
  var navigation = Store.aggregateNavigation(Store.navigation(sources, Store.load(storage)));
  assert.strictEqual(navigation.length, 1);
  assert.strictEqual(navigation[0].title, 'Cinema');
  assert.deepStrictEqual(navigation[0].memberSourceIds, ['a|1', 'b|1']);
}());

(function failedMemberCanRetryWithoutDiscardingSuccessfulPages() {
  var failing = true;
  var calls = [];
  var statuses = [];
  var controller = create({ loadLibraryPage: function (config, _library, _view, _query, start, size, done) {
    calls.push([config.apiBaseUrl, start]);
    if (config.apiBaseUrl === 'https://b' && failing) { done(new Error('unavailable')); return; }
    done(null, { items: [{ guid: 'plex://movie/' + config.apiBaseUrl + start, ratingKey: String(start), title: 'Title ' + start }], nextStart: start + 1, hasMore: start < 2 });
  } }, { onLibraryStatus: function (source, failed) { statuses.push([source, failed]); } });
  controller.loadVirtualLibraryPage(library, 'catalog', {}, 0, 1, function (error) { assert.ifError(error); });
  assert.ok(statuses.some(function (entry) { return entry[0] === 'b|1' && entry[1]; }));
  failing = false;
  calls = [];
  controller.loadVirtualLibraryPage(library, 'catalog', {}, 1, 1, function (error) { assert.ifError(error); });
  assert.ok(calls.some(function (entry) { return entry[0] === 'https://b' && entry[1] === 0; }), 'failed member must retry its unchanged cursor on the next page');
  assert.ok(statuses.some(function (entry) { return entry[0] === 'b|1' && !entry[1]; }));
  controller.destroy();
}());

(function recoveringEarlierTitlesDoesNotRepeatDeliveredItems() {
  var failing = true;
  var controller = create({ loadLibraryPage: function (config, _library, _view, _query, start, size, done) {
    if (config.apiBaseUrl === 'https://b' && failing) { done(new Error('unavailable')); return; }
    var titles = config.apiBaseUrl === 'https://a' ? ['Beta', 'Delta'] : ['Alpha', 'Gamma'];
    done(null, { items: titles.slice(start, start + size).map(function (title) { return { guid: 'plex://movie/' + title, ratingKey: title, title: title }; }), nextStart: Math.min(2, start + size), hasMore: start + size < 2 });
  } });
  var received = [];
  function page(offset) {
    controller.loadVirtualLibraryPage(library, 'catalog', {}, offset, 1, function (error, result) {
      assert.ifError(error);
      received = received.concat(result.items.map(function (item) { return item.title; }));
    });
  }
  page(0);
  failing = false;
  page(1); page(2); page(3);
  assert.deepStrictEqual(received, ['Beta', 'Alpha', 'Delta', 'Gamma'], 'recovery sorts unseen items without shifting the delivered prefix');
  controller.destroy();
}());

console.log('Library merge regression checks passed');
