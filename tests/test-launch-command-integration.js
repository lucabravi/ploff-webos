'use strict';
var assert = require('assert');
var Bootstrap = require('../app/coordinator/application-bootstrap');
var Events = require('../app/application-events');
var Transport = require('../app/coordinator/launch-command-transport');
var Fixture = require('./helpers/player-feature-controller-harness');
var PlaybackQueueModel = require('../app/playback-queue-model');
var count = 0;
function test(name, fn) { fn(); count += 1; console.log('PASS ' + name); }
function target() {
  var listeners = {};
  return {addEventListener: function (name, fn) { listeners[name] = fn; },
    removeEventListener: function (name) { delete listeners[name]; },
    emit: function (name, detail) { if (listeners[name]) { listeners[name]({detail: detail}); } }};
}
test('cold launch survives credential readiness; warm relaunch reaches the same app', function () {
  var root = target(), document = target(), prepared, received = [];
  root.PalmSystem = {launchParams: JSON.stringify({ploff: {requestId: 'cold'}})};
  root.PloffApplicationEvents = Events;
  root.PloffCredentialVault = {prepare: function (_root, _storage, callback) { prepared = callback; }};
  var handle = Bootstrap.start(root, document, {createApplication: function () {
    return {launchCommand: function (params) { received.push(params); }, destroy: function () {}};
  }});
  assert.strictEqual(received.length, 0); prepared({});
  assert.strictEqual(JSON.parse(received[0]).ploff.requestId, 'cold');
  document.emit('webOSRelaunch', {ploff: {requestId: 'warm'}});
  assert.strictEqual(received[1].ploff.requestId, 'warm');
  handle.destroy(); document.emit('webOSRelaunch', {ploff: {requestId: 'late'}});
  assert.strictEqual(received.length, 2);
});
test('server-bound transport loads video metadata and rejects a wrong ID or unsupported media', function () {
  var requested, response = {ratingKey: '42', type: 'movie'};
  var transport = Transport.create({loadMetadata: function (config, key, callback) {
    requested = {config: config, key: key}; callback(null, response);
  }}, {routeFor: function () { return {config: {apiBaseUrl: 'http://local.example'}}; },
    decorateItem: function (item, context) { return Object.assign({}, item, {serverMachineIdentifier: context.serverMachineIdentifier}); }});
  var cmd = {type: 'item', ratingKey: '42', serverMachineIdentifier: 'server-A'}, value, error;
  transport.load(cmd, {serverMachineIdentifier: 'server-A'}, function (err, item) { error = err; value = item; });
  assert.strictEqual(error, null); assert.strictEqual(value.serverMachineIdentifier, 'server-A'); assert.strictEqual(requested.key, '42');
  response = {ratingKey: '43', type: 'movie'};
  transport.load(cmd, {}, function (err) { assert.ok(err); });
  response = {ratingKey: '42', type: 'track'};
  transport.load(cmd, {}, function (err) { assert.ok(err); });
});
test('bootstrap teardown prevents a queued command from surviving credential readiness', function () {
  var root = target(), document = target(), prepared, created = 0;
  root.PalmSystem = {launchParams: JSON.stringify({ploff: {requestId: 'pending'}})};
  root.PloffApplicationEvents = Events;
  root.PloffCredentialVault = {prepare: function (_root, _storage, callback) { prepared = callback; }};
  var handle = Bootstrap.start(root, document, {createApplication: function () { created += 1; return {}; }});
  handle.destroy(); prepared({});
  document.emit('webOSLaunch', {ploff: {requestId: 'late'}});
  assert.strictEqual(created, 0); assert.strictEqual(handle.instance(), null);
});
test('playlist and collection commands retain their paged Plex endpoints', function () {
  var transport = Transport.create({}, {routeFor: function () { return {config: {}}; }});
  ['playlist', 'collection'].forEach(function (kind) {
    transport.load({type: kind, ratingKey: '42', serverMachineIdentifier: 'server-A'}, {}, function (err, item) {
      assert.strictEqual(err, null); assert.strictEqual(item.containerType, kind);
      assert.strictEqual(item.containerKey, kind === 'playlist' ? '/playlists/42/items' : '/library/collections/42/children');
    });
  });
});
function playerHarness(options) {
  var view = 'home';
  var h = Fixture.createHarness(Object.assign({
    root: Fixture.createDeferredClock().root,
    state: {currentView: function () { return view; }, setView: function (next) { view = next; }, enterHome: function () { view = 'home'; }},
    modules: {PlaybackQueueModel: PlaybackQueueModel},
    detail: {setPlayPending: function () {}, hideSurface: function () {}, playbackPreferences: function () { return {}; }}
  }, options));
  return h;
}
test('movie command starts decoder directly with resume seconds and no resume dialog', function () {
  [true, false].forEach(function (resume) {
    var h = playerHarness(), result;
    assert.strictEqual(h.controller.playCommand({ratingKey: '42', type: 'movie', viewOffset: 65000},
      {apiBaseUrl: 'http://local.example', serverMachineIdentifier: 'server-A'}, resume,
      function (err, key) { assert.strictEqual(err, null); result = key; }), true);
    var opened = h.calls.filter(function (x) { return x[0] === 'open-playback'; });
    assert.strictEqual(opened.length, 1); assert.strictEqual(opened[0][1].startOffset, resume ? 65 : 0);
    assert.strictEqual(h.controller.snapshot().resumeChoiceOpen, false); assert.strictEqual(result, '42');
    assert.strictEqual(h.controller.playbackSnapshot().serverMachineIdentifier, 'server-A');
    h.controller.destroy();
  });
});
test('container command delegates to the original queue and returns its actual leaf', function () {
  ['playlist', 'collection'].forEach(function (kind) {
    var received, result;
    var h = playerHarness({startContainer: function (container, callback) { received = container; callback(null, {ratingKey: 'leaf'}); return true; }});
    var item = {ratingKey: '42', containerType: kind, containerKey: '/items', serverMachineIdentifier: 'server-A'};
    assert.strictEqual(h.controller.playCommand(item, {apiBaseUrl: 'http://local.example', serverMachineIdentifier: 'server-A'}, true,
      function (err, key) { assert.strictEqual(err, null); result = key; }), true);
    assert.strictEqual(received, item); assert.strictEqual(result, 'leaf'); h.controller.destroy();
  });
});
test('first playlist leaf resumes without an interactive dialog', function () {
  var detailState = {}, h;
  h = playerHarness({
    detail: {snapshot: function () { return detailState; }, queueSnapshot: function () { return {}; },
      preferenceSnapshot: function () { return {}; }, leave: function () {},
      openLoaded: function () {}, setPlaybackContext: function (detail, item) { detailState = {currentDetail: detail, selectedItem: item}; },
      setPlayPending: function () {}, setFocus: function () {}, hideSurface: function () {}, playbackPreferences: function () { return {}; }},
    activatePlaylist: function () { return {context: {episodes: []}, index: 0}; },
    startContainer: function (container, callback) {
      var leaf = {ratingKey: '42', type: 'movie', serverMachineIdentifier: 'server-A', viewOffset: 45000};
      h.captured.queueOptions.requestPlayback({item: leaf, detail: leaf, queue: {kind: 'playlist'}, index: 0});
      callback(null, leaf); return true;
    }
  });
  h.controller.playCommand({ratingKey: '1', containerType: 'playlist', containerKey: '/playlists/1/items'},
    {apiBaseUrl: 'http://local.example', serverMachineIdentifier: 'server-A'}, true, function (err) { assert.ifError(err); });
  var opened = h.calls.filter(function (x) { return x[0] === 'open-playback'; });
  assert.strictEqual(opened.length, 1); assert.strictEqual(opened[0][1].startOffset, 45);
  assert.strictEqual(h.controller.snapshot().resumeChoiceOpen, false); h.controller.destroy();
});
test('replacement during an asynchronous close starts only the newest command', function () {
  var view = 'player', closed;
  var h = playerHarness({
    closePlayback: function (callback) { assert.strictEqual(closed, undefined); closed = callback; return true; },
    state: {currentView: function () { return view; }, setView: function (value) { view = value; }, enterHome: function () { view = 'home'; }}
  });
  var context = {apiBaseUrl: 'http://local.example', serverMachineIdentifier: 'server-A'};
  h.controller.playCommand({ratingKey: 'old', type: 'movie'}, context, false, function () { throw new Error('old command revived'); });
  h.controller.cancelCommand();
  h.controller.playCommand({ratingKey: 'new', type: 'movie'}, context, false, function (err, key) { assert.ifError(err); assert.strictEqual(key, 'new'); });
  assert.strictEqual(h.calls.filter(function (x) { return x[0] === 'open-playback'; }).length, 0);
  closed();
  var opened = h.calls.filter(function (x) { return x[0] === 'open-playback'; });
  assert.strictEqual(opened.length, 1); assert.strictEqual(opened[0][1].detail.ratingKey, 'new'); h.controller.destroy();
});
console.log('Launch command integration checks passed: ' + count);
