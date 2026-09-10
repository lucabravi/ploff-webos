'use strict';

var assert = require('assert');
var Harness = require('./helpers/playback-delivery-harness');
var failures = 0;
var cases = 0;
function test(name, callback) {
  cases += 1;
  try { callback(); console.log('PASS ' + name); }
  catch (error) { failures += 1; console.error('FAIL ' + name + '\n' + error.stack); }
}

['transcode', 'safe-transcode'].forEach(function (delivery) {
  test(delivery + ': replacement rejects late playing until its own source is ready', function () {
    var h = Harness.create(delivery);
    h.start();
    assert.strictEqual(h.playback.options.delivery, delivery);
    h.sample(25);
    h.video.buffered = Harness.ranges([[0, 40]]);
    h.controller.seekAbsolute(500, { immediate: true });
    var reports = h.timeline.length;
    h.video.dispatch('playing'); // queued event from the preceding source, native time still 25
    assert.strictEqual(h.controller.snapshot().streamSwitching, true);
    assert.strictEqual(h.controller.snapshot().positionSeconds, 500, 'old native time must never be added to the new offset');
    assert.strictEqual(h.timeline.length, reports, 'a rejected source cannot report playing');
    assert.strictEqual(h.renderer.visible, false);
    h.sourceReady();
    h.sample(0.2);
    assert.strictEqual(h.controller.snapshot().positionSeconds, 500.2);
    assert.strictEqual(h.renderer.time, 500.2);
    h.controller.destroy();
  });

  test(delivery + ': fractional rebuild starts the ASS epoch at the installed source target', function () {
    var h = Harness.create(delivery, { subtitleOffset: 250 });
    h.start();
    h.sample(20);
    h.video.buffered = Harness.ranges([[0, 30]]);
    var loads = h.renderer.loads;
    var disposals = h.renderer.disposals;
    h.controller.seekAbsolute(350.8, { immediate: true });
    assert.strictEqual(h.playback.offsetBase, 350);
    assert.strictEqual(h.renderer.epochs[h.renderer.epochs.length - 1], 349.75,
      'epoch uses actual absolute start minus subtitle offset, not the discarded fractional request');
    assert.strictEqual(h.renderer.time, 349.75, 'worker must be frozen at the normalized replacement checkpoint');
    assert.strictEqual(h.renderer.paused, true);
    h.sourceReady();
    h.sample(0.2);
    assert.strictEqual(h.renderer.time, 349.95);
    assert.strictEqual(h.renderer.loads, loads, 'same ASS track must retain its worker/track');
    assert.strictEqual(h.renderer.disposals, disposals);
    h.controller.destroy();
  });
});

test('a superseded HLS resume cannot start while the newer Plex preparation is pending', function () {
  var requests = 0;
  var release;
  var h = Harness.create('transcode', {
    preparePlayback: function (config, playback, options, callback) {
      requests += 1;
      if (requests === 3) { release = callback; return { abort: function () {} }; }
      callback(null, 'https://example.invalid/' + playback.transcodeSession);
      return null;
    }
  });
  h.start();
  h.sample(10);
  h.video.buffered = Harness.ranges([[0, 40]]);
  h.controller.seekAbsolute(500, { immediate: true });
  h.video.currentTime = 0;
  h.video.dispatch('canplay'); // schedules the old source's delayed play
  var plays = h.video.playCalls;
  h.controller.seekAbsolute(800, { immediate: true });
  assert.strictEqual(typeof release, 'function');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.video.playCalls, plays, 'neither old resume nor its retry may start the superseded source');
  assert.strictEqual(h.controller.snapshot().streamSwitching, true);
  assert.strictEqual(h.controller.snapshot().positionSeconds, 800);
  release(null, 'https://example.invalid/newest');
  h.sourceReady();
  assert.strictEqual(h.video.playCalls, plays + 1);
  h.sample(0.2);
  assert.strictEqual(h.controller.snapshot().positionSeconds, 800.2);
  h.controller.destroy();
});

test('a queued resume callback already copied by the event loop is source-identity guarded', function () {
  var callbacks = [];
  var h = Harness.create('transcode', { prepare: function (options) {
    var schedule = options.root.setTimeout;
    options.root.setTimeout = function (callback, delay) {
      if (delay === 120) { callbacks.push(callback); }
      return schedule(callback, delay);
    };
  } });
  h.start();
  h.video.buffered = Harness.ranges([[0, 30]]);
  h.controller.seekAbsolute(500, { immediate: true });
  h.video.currentTime = 0;
  h.video.dispatch('canplay');
  var obsolete = callbacks[callbacks.length - 1];
  var plays = h.video.playCalls;
  h.controller.seekAbsolute(800, { immediate: true });
  obsolete();
  assert.strictEqual(h.video.playCalls, plays);
  assert.strictEqual(h.controller.snapshot().streamSwitching, true);
  assert.strictEqual(h.controller.snapshot().positionSeconds, 800);
  h.sourceReady();
  h.controller.destroy();
});

test('old canplay during asynchronous HLS preparation cannot ready the new source', function () {
  var release;
  var requests = 0;
  var h = Harness.create('transcode', { preparePlayback: function (config, playback, options, callback) {
    requests += 1;
    if (requests === 2) { release = callback; return { abort: function () {} }; }
    callback(null, 'https://example.invalid/' + playback.transcodeSession);
    return null;
  } });
  h.start();
  h.sample(25);
  h.video.buffered = Harness.ranges([[0, 30]]);
  var plays = h.video.playCalls;
  h.controller.seekAbsolute(500, { immediate: true });
  h.video.dispatch('canplay');
  h.video.dispatch('seeked');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.video.playCalls, plays, 'events from the unretired old element cannot start the replacement');
  assert.strictEqual(h.controller.snapshot().streamSwitching, true);
  assert.strictEqual(h.controller.snapshot().positionSeconds, 500);
  release(null, 'https://example.invalid/replacement');
  h.sourceReady();
  assert.strictEqual(h.video.playCalls, plays + 1);
  h.controller.destroy();
});

test('delivery fallback rejects the preceding source playing event', function () {
  var h = Harness.create('transcode');
  h.start();
  h.sample(25);
  h.video.error = { code: 3 };
  h.video.dispatch('error');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.playback.options.delivery, 'safe-transcode');
  var target = h.controller.snapshot().positionSeconds;
  h.video.dispatch('playing');
  assert.strictEqual(h.controller.snapshot().streamSwitching, true);
  assert.strictEqual(h.controller.snapshot().positionSeconds, target);
  h.video.error = null;
  h.sourceReady();
  assert.strictEqual(h.controller.snapshot().streamSwitching, false);
  h.controller.destroy();
});

test('paused HLS replacement preserves pause intent and does not restart its worker clock', function () {
  var h = Harness.create('transcode');
  h.start();
  h.sample(20);
  h.video.dispatch('pause');
  h.video.buffered = Harness.ranges([[0, 30]]);
  var plays = h.video.playCalls;
  h.controller.seekAbsolute(400, { immediate: true });
  h.sourceReady(0, false);
  assert.strictEqual(h.video.paused, true);
  assert.strictEqual(h.video.playCalls, plays);
  assert.strictEqual(h.renderer.paused, true);
  assert.strictEqual(h.controller.snapshot().positionSeconds, 400);
  h.controller.destroy();
});

test('closing an HLS replacement retires every delayed native play', function () {
  var h = Harness.create('transcode');
  h.start();
  h.video.buffered = Harness.ranges([[0, 30]]);
  h.controller.seekAbsolute(400, { immediate: true });
  h.video.dispatch('canplay');
  var plays = h.video.playCalls;
  h.controller.close();
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.video.playCalls, plays);
  assert.strictEqual(h.controller.snapshot().active, false);
  assert.strictEqual(h.root.timeoutCount(), 0);
  h.controller.destroy();
});

console.log('Source clock checks: ' + cases + ' cases, ' + failures + ' failures');
if (failures) { process.exitCode = 1; }
