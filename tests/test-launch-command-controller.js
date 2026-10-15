'use strict';
var assert = require('assert');
var Controller = require('../app/coordinator/launch-command-controller');
var Events = require('../app/application-events');
var count = 0;
function test(name, fn) { fn(); count += 1; console.log('PASS ' + name); }
function target() {
  var handlers = {};
  return {addEventListener: function (name, fn) { (handlers[name] || (handlers[name] = [])).push(fn); },
    removeEventListener: function (name, fn) { handlers[name] = (handlers[name] || []).filter(function (x) { return x !== fn; }); },
    emit: function (name) { (handlers[name] || []).slice().forEach(function (fn) { fn(); }); }};
}
function command(id, type) {
  return {ploff: {version: 1, action: 'play', requestId: id || 'test-1',
    serverMachineIdentifier: 'server-A', type: type || 'item', ratingKey: '12345'}};
}
function harness(options) {
  options = options || {};
  var time = 100000, timers = {}, seq = 0, loadCallback, readyCallback, startCallback;
  var video = target(), document = target(), started = [], cancelled = 0, aborted = 0, contextReady = true;
  var status = {playing: false, ratingKey: '12345', serverMachineIdentifier: 'server-A'};
  var ports = {
    root: {setTimeout: function (fn, delay) { var id = ++seq; timers[id] = {at: time + delay, fn: fn}; return id; }, clearTimeout: function (id) { delete timers[id]; }},
    now: function () { return time; }, document: document, video: video, Events: Events,
    hidden: function () { return document.hidden === true; },
    context: function (id) { return contextReady && id === 'server-A' ? {serverMachineIdentifier: id} : null; },
    load: function (cmd, context, done) { loadCallback = done; if (!options.deferLoad) { done(options.loadError, {ratingKey: cmd.ratingKey, type: cmd.type}); } return {abort: function () { aborted += 1; }}; },
    ready: function (done) { readyCallback = done; if (!options.deferReady) { done(options.readyError); } },
    start: function (item, context, resume, done) {
      started.push({item: item, context: context, resume: resume}); startCallback = done;
      if (!options.deferStart) { done(options.startError, item.ratingKey); }
      return !options.startRefused;
    },
    observe: function () { return status; },
    cancelStart: function () { cancelled += 1; }
  };
  var controller = Controller.create(ports);
  return {controller: controller, video: video, document: document, started: started, status: status,
    setContextReady: function (value) { contextReady = value; },
    load: function () { return loadCallback; }, ready: function () { return readyCallback; }, start: function () { return startCallback; },
    cancellations: function () { return cancelled; }, aborts: function () { return aborted; },
    advance: function (ms) {
      var until = time + ms, ids, next;
      for (;;) {
        ids = Object.keys(timers).sort(function (a, b) { return timers[a].at - timers[b].at; });
        if (!ids.length || timers[ids[0]].at > until) { break; }
        next = timers[ids[0]]; delete timers[ids[0]]; time = next.at; next.fn();
      }
      time = until;
    }};
}

test('normal app launch is ignored', function () { assert.strictEqual(Controller.parse({}), null); });
test('JSON launch parameters are supported', function () { assert.strictEqual(Controller.parse(JSON.stringify(command())).ratingKey, '12345'); });
test('HA integer IDs are normalized without permitting fractions or unsafe precision', function () {
  var c = command(); c.ploff.ratingKey = 12345; assert.strictEqual(Controller.parse(c).ratingKey, '12345');
  [1.5, -1, 9007199254740992, Infinity].forEach(function (id) { c.ploff.ratingKey = id; assert.throws(function () { Controller.parse(c); }); });
});
test('arbitrary URLs, tokens, traversal, invalid types and malformed commands are rejected', function () {
  ['http://elsewhere', '../1', '1?token=secret', '-1', ''].forEach(function (key) { var c = command(); c.ploff.ratingKey = key; assert.throws(function () { Controller.parse(c); }); });
  ['token', 'url', 'shuffle'].forEach(function (key) { var c = command(); c.ploff[key] = 'x'; assert.throws(function () { Controller.parse(c); }); });
  assert.throws(function () { Controller.parse('{'); });
  var c = command(); c.ploff.type = 'music'; assert.throws(function () { Controller.parse(c); });
});
test('item, playlist and collection preserve server and resume mode', function () {
  ['item', 'playlist', 'collection'].forEach(function (kind) {
    var h = harness(), c = command('kind-' + kind, kind); c.ploff.resume = false;
    assert.strictEqual(h.controller.submit(c), true);
    assert.strictEqual(h.started[0].item.type, kind); assert.strictEqual(h.started[0].resume, false);
    assert.strictEqual(h.started[0].context.serverMachineIdentifier, 'server-A');
    h.controller.destroy();
  });
});
test('success needs a fresh native playing event and matching item/server', function () {
  var h = harness(); h.video.emit('playing'); h.status.playing = true;
  h.controller.submit(command()); h.advance(250); assert.strictEqual(h.controller.snapshot().state, 'starting');
  h.video.emit('playing'); h.status.ratingKey = 'other'; h.advance(250); assert.strictEqual(h.controller.snapshot().state, 'starting');
  h.status.ratingKey = '12345'; h.status.serverMachineIdentifier = 'server-B'; h.advance(250); assert.strictEqual(h.controller.snapshot().state, 'starting');
  h.status.serverMachineIdentifier = 'server-A'; h.advance(250); assert.strictEqual(h.controller.snapshot().state, 'playing');
  assert.strictEqual(h.cancellations(), 0); h.controller.destroy(); assert.strictEqual(h.cancellations(), 0);
});
test('duplicate events and retries do not restart pending or successful playback', function () {
  var h = harness(); h.controller.submit(command()); h.controller.submit(command()); assert.strictEqual(h.started.length, 1);
  h.status.playing = true; h.video.emit('playing'); h.advance(250);
  h.controller.submit(command()); assert.strictEqual(h.started.length, 1);
  var c = command(); c.ploff.ratingKey = '999'; assert.strictEqual(h.controller.submit(c), false);
});
test('readiness waits without cloud or a fallback to another server', function () {
  var h = harness(); h.setContextReady(false); h.controller.submit(command()); h.advance(10000); assert.strictEqual(h.started.length, 0);
  h.setContextReady(true); h.advance(250); assert.strictEqual(h.started.length, 1); h.controller.destroy();
});
test('a background relaunch waits for webOS foreground activation', function () {
  var h = harness(); h.document.hidden = true; h.controller.submit(command());
  h.advance(500); assert.strictEqual(h.started.length, 0); assert.strictEqual(h.controller.snapshot().state, 'waiting');
  h.document.hidden = false; h.document.emit('visibilitychange'); h.advance(250);
  assert.strictEqual(h.started.length, 1); h.controller.destroy();
});
test('timeout is exactly 90 seconds and a retry never extends it', function () {
  var h = harness(); h.controller.submit(command()); h.advance(89999); h.controller.submit(command());
  assert.strictEqual(h.controller.snapshot().state, 'starting'); h.advance(1);
  assert.strictEqual(h.controller.snapshot().reason, 'launch_timeout'); assert.strictEqual(h.cancellations(), 1);
});
test('hidden TV cancels and late metadata cannot start a ghost playback', function () {
  var h = harness({deferLoad: true}); h.controller.submit(command()); var late = h.load();
  h.document.hidden = true; h.document.emit('visibilitychange'); late(null, {ratingKey: '12345'});
  assert.strictEqual(h.controller.snapshot().reason, 'app_hidden'); assert.strictEqual(h.started.length, 0); assert.strictEqual(h.aborts(), 1);
});
test('manual input cancels only a pending command', function () {
  var h = harness(); h.controller.submit(command()); h.document.emit('keydown');
  assert.strictEqual(h.controller.snapshot().reason, 'manual_input'); assert.strictEqual(h.cancellations(), 1);
});
test('a new request replaces an older one; late callbacks stay cancelled', function () {
  var h = harness({deferLoad: true}); h.controller.submit(command('old')); var late = h.load();
  h.controller.submit(command('new')); late(null, {ratingKey: '12345'}); assert.strictEqual(h.started.length, 0);
  h.load()(null, {ratingKey: '12345'}); assert.strictEqual(h.started.length, 1);
  h.controller.destroy();
});
test('late player readiness after timeout cannot begin playback', function () {
  var h = harness({deferReady: true}); h.controller.submit(command()); h.advance(90000); h.ready()(null);
  assert.strictEqual(h.started.length, 0); assert.strictEqual(h.controller.snapshot().reason, 'launch_timeout');
});
test('expired commands are rejected before loading', function () {
  var h = harness(), c = command(); c.ploff.issuedAt = 10000;
  assert.strictEqual(h.controller.submit(c), false); assert.strictEqual(h.started.length, 0);
});
test('metadata, readiness, start and decoder failures cannot report success', function () {
  [{loadError: new Error('missing')}, {readyError: new Error('offline')}, {startError: new Error('bad')}, {startRefused: true}].forEach(function (options) {
    var h = harness(options); h.controller.submit(command()); assert.strictEqual(h.controller.snapshot().state, 'error'); h.controller.destroy();
  });
  var h = harness(); h.controller.submit(command()); h.status.error = true; h.advance(250); assert.strictEqual(h.controller.snapshot().state, 'error');
});
test('destroy cancels loading and rejects further commands', function () {
  var h = harness({deferLoad: true}); h.controller.submit(command()); var late = h.load(); h.controller.destroy();
  late(null, {ratingKey: '12345'}); assert.strictEqual(h.started.length, 0); assert.strictEqual(h.controller.submit(command('new')), false);
});
console.log('Launch command checks passed: ' + count);
