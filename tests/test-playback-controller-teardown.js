'use strict';
var assert = require('assert');
var Harness = require('./helpers/playback-controller-harness');
var failures = 0;
function test(name, run) {
  try { run(); console.log('PASS ' + name); }
  catch (error) { failures += 1; console.error('FAIL ' + name + '\n' + error.stack); }
}
function fixture(key) { var item = Harness.playbackFixture(); item.ratingKey = key; return item; }

test('the stopped report for A cannot inherit the next candidate B config', function () {
  var candidate = { apiBaseUrl: 'https://a.example', token: 'token-a' };
  var reports = [];
  var loads = [];
  var h = Harness.harness({
    prepare: function (options) { options.config = candidate; },
    loadPlayback: function (config, key, session, preferences, callback) {
      loads.push(config.apiBaseUrl); callback(null, fixture(key));
    },
    sendTimeline: function (config, current, state, milliseconds, callback) {
      reports.push({ server: config.apiBaseUrl, token: config.token, item: current.ratingKey, state: state });
      if (callback) { callback(null); }
    }
  });
  h.controller.open({ detail: { ratingKey: 'a' }, startOffset: 120 });
  candidate.apiBaseUrl = 'https://b.example'; candidate.token = 'token-b';
  h.controller.open({ detail: { ratingKey: 'b' }, startOffset: 90 });
  assert.deepStrictEqual(reports[0], { server: 'https://a.example', token: 'token-a', item: 'a', state: 'stopped' });
  assert.deepStrictEqual(loads, ['https://a.example', 'https://b.example']);
  h.controller.close();
  assert.strictEqual(reports[reports.length - 1].server, 'https://b.example');
  h.controller.destroy();
});

test('asynchronous metadata binds the requested route through open', function () {
  var candidate = { apiBaseUrl: 'https://a.example' };
  var metadataComplete;
  var metadataServer;
  var openedServer;
  var h = Harness.harness({
    prepare: function (options) { options.config = candidate; },
    loadMetadata: function (config, key, callback) {
      metadataServer = config.apiBaseUrl; metadataComplete = callback;
      return { abort: function () {} };
    },
    loadPlayback: function (config, key, session, preferences, callback) {
      openedServer = config.apiBaseUrl; callback(null, fixture(key));
    }
  });
  h.controller.open({ detail: { ratingKey: 'a' }, startOffset: 0 });
  candidate.apiBaseUrl = 'https://b.example';
  h.controller.startItem({ ratingKey: 'b' });
  candidate.apiBaseUrl = 'https://c.example';
  metadataComplete(null, { ratingKey: 'b' });
  assert.strictEqual(metadataServer, 'https://b.example');
  assert.strictEqual(openedServer, 'https://b.example', 'metadata and playback must share the same route');
  h.controller.destroy();
});

test('late editor offset compensation retains the originating PMS', function () {
  var candidate = { apiBaseUrl: 'https://a.example' };
  var callbacks = [];
  var writes = [];
  var h = Harness.harness({
    prepare: function (options) { options.config = candidate; },
    loadPlayback: function (config, key, session, preferences, callback) {
      var item = fixture(key);
      if (key === 'a') { item.options.playbackMode = 'transcode'; item.options.subtitleStreamID = 's1'; }
      callback(null, item);
    },
    setSubtitleOffset: function (config, id, offset, callback) {
      writes.push({ server: config.apiBaseUrl, offset: offset }); callbacks.push(callback);
    }
  });
  h.controller.open({ detail: { ratingKey: 'a' }, startOffset: 40 });
  h.video.dispatch('canplay'); h.root.runAllTimeouts(20); h.video.dispatch('playing');
  h.controller.openSubtitleEditor();
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 250 });
  h.root.runNextTimeout();
  assert.strictEqual(callbacks.length, 1);
  candidate.apiBaseUrl = 'https://b.example';
  h.controller.open({ detail: { ratingKey: 'b' }, startOffset: 0 });
  callbacks.shift()(null);
  assert.deepStrictEqual(writes, [
    { server: 'https://a.example', offset: 250 }, { server: 'https://a.example', offset: 0 }
  ]);
  callbacks.shift()(null);
  assert.strictEqual(h.controller.snapshot().playback.ratingKey, 'b');
  h.controller.destroy();
});

test('destroy releases source and listeners even when native pause throws', function () {
  var removed = 0;
  var h = Harness.harness({ prepare: function (options) {
    var off = options.video.removeEventListener;
    options.video.removeEventListener = function (name, handler) { removed += 1; off.call(this, name, handler); };
  } });
  h.controller.open({ detail: { ratingKey: 'a' }, startOffset: 120 });
  h.video.pause = function () { throw new Error('native pause failed'); };
  assert.throws(function () { h.controller.destroy(); }, /native pause failed/);
  assert.strictEqual(h.controller.snapshot().destroyed, true);
  assert.strictEqual(h.controller.snapshot().active, false);
  assert.strictEqual(h.video.src, '', 'source removal must not be skipped after pause failure');
  assert.ok(removed >= 10, 'every native listener must be released');
  assert.strictEqual(h.root.timeoutCount(), 0);
  assert.strictEqual(h.root.intervalCount(), 0);
  assert.doesNotThrow(function () { h.controller.destroy(); });
});

test('a renderer cleanup failure cannot leave the Player active or retain timers', function () {
  var fail = false;
  var removed = 0;
  var h = Harness.harness({ prepare: function (options) {
    var Runtime = options.SubtitleRuntime;
    var off = options.video.removeEventListener;
    options.video.removeEventListener = function (name, handler) { removed += 1; off.call(this, name, handler); };
    options.SubtitleRuntime = { create: function (values) {
      var runtime = Runtime.create(values);
      var dispose = runtime.disposeAss;
      runtime.disposeAss = function () { dispose(); if (fail) { throw new Error('renderer disposal failed'); } };
      return runtime;
    } };
  } });
  h.controller.open({ detail: { ratingKey: 'a' }, startOffset: 120 });
  h.video.dispatch('canplay');
  fail = true;
  assert.throws(function () { h.controller.destroy(); }, /renderer disposal failed/);
  assert.strictEqual(h.controller.snapshot().destroyed, true);
  assert.strictEqual(h.controller.snapshot().active, false);
  assert.strictEqual(h.video.src, '');
  assert.strictEqual(h.root.timeoutCount(), 0);
  assert.strictEqual(h.root.intervalCount(), 0);
  assert.ok(removed >= 10);
});

test('native cleanup events cannot trigger recovery or reentrant open', function () {
  var errors = 0;
  var reopened;
  var h = Harness.harness({ showError: function () { errors += 1; } });
  h.controller.open({ detail: { ratingKey: 'a' }, startOffset: 120 });
  var pause = h.video.pause;
  var once = true;
  h.video.pause = function () {
    if (once) {
      once = false;
      h.video.error = { code: 3 };
      h.video.dispatch('error');
      reopened = h.controller.open({ detail: { ratingKey: 'b' }, startOffset: 0 });
    }
    pause.call(this);
  };
  h.controller.close();
  assert.strictEqual(reopened, false, 'teardown must reject reentrant open');
  assert.strictEqual(errors, 0, 'cleanup events are not playback failures');
  assert.strictEqual(h.controller.snapshot().active, false);
  assert.strictEqual(h.root.timeoutCount(), 0);
  h.controller.destroy();
});

test('closing the surface completes even if the final report throws', function () {
  var closed = false;
  var h = Harness.harness({ sendTimeline: function () { throw new Error('timeline failed'); } });
  h.controller.open({ detail: { ratingKey: 'a' }, startOffset: 120 });
  assert.throws(function () { h.controller.close(function () { closed = true; }); }, /timeline failed/);
  assert.strictEqual(h.controller.snapshot().active, false);
  assert.strictEqual(h.video.src, '');
  assert.strictEqual(closed, true);
  h.controller.destroy();
});

if (failures) { process.exitCode = 1; }
else { console.log('Playback transport and teardown checks passed'); }
