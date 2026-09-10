'use strict';

var assert = require('assert');
var Harness = require('./helpers/playback-delivery-harness');
var cases = 0;
var failures = 0;
function test(name, callback) {
  cases += 1;
  try { callback(); console.log('PASS ' + name); }
  catch (error) { failures += 1; console.error('FAIL ' + name + '\n' + error.stack); }
}
function seek(h, target, completion) {
  h.controller.seekAbsolute(target, { immediate: true });
  h.video.dispatch('seeking');
  if (completion !== undefined) { h.video.currentTime = completion; }
  h.video.dispatch('seeked');
}

['direct-stream', 'transcode', 'safe-transcode'].forEach(function (delivery) {
  test(delivery + ': provisional native target stays hidden until decoded advance', function () {
    var h = Harness.create(delivery);
    h.start(); h.sample(10);
    var sources = h.video.sourceWrites.length;
    seek(h, 130);
    h.sample(30);
    h.root.tickIntervals();
    assert.strictEqual(h.renderer.visible, false, 'assigning currentTime is not evidence of a decoded frame');
    assert.strictEqual(h.controller.snapshot().positionSeconds, 130);
    h.sample(30.2);
    assert.strictEqual(h.renderer.visible, true);
    assert.strictEqual(h.renderer.time, 130.2);
    assert.strictEqual(h.video.sourceWrites.length, sources, 'in-buffer seeking must not restart Plex');
    h.controller.destroy();
  });

  test(delivery + ': delayed small rollback resets public clock and ASS epoch together', function () {
    var h = Harness.create(delivery, { subtitleOffset: 250 });
    h.start(); h.sample(10);
    seek(h, 130);
    var epochs = h.renderer.epochs.length;
    h.sample(29.5);
    assert.strictEqual(h.controller.snapshot().positionSeconds, 129.5);
    assert.strictEqual(h.renderer.time, 129.25);
    assert.strictEqual(h.renderer.epochs.length, epochs + 1);
    assert.strictEqual(h.renderer.epochs[epochs], 129.25);
    assert.strictEqual(h.renderer.visible, true);
    h.sample(29.7);
    h.root.tickIntervals();
    assert.strictEqual(h.renderer.epochs.length, epochs + 1, 'ordinary advance must not churn ASS epochs');
    assert.strictEqual(h.timeline[h.timeline.length - 1].seconds, 129.7);
    assert.strictEqual(h.renderer.time, 129.45);
    h.controller.destroy();
  });

  test(delivery + ': decoded keyframe on seeked is accepted without needless source replacement', function () {
    var h = Harness.create(delivery);
    h.start(); h.sample(10);
    var preparations = h.preparations.length;
    seek(h, 130, 24);
    h.sample(24.1);
    assert.strictEqual(h.controller.snapshot().streamSwitching, false);
    assert.strictEqual(h.controller.snapshot().positionSeconds, 124.1);
    assert.strictEqual(h.renderer.epochs[h.renderer.epochs.length - 1], 124);
    assert.strictEqual(h.renderer.time, 124.1);
    assert.strictEqual(h.preparations.length, preparations);
    h.controller.destroy();
  });

  test(delivery + ': buffering during seek still adopts a bounded buffered keyframe once', function () {
    var h = Harness.create(delivery);
    h.start(); h.sample(10);
    var preparations = h.preparations.length;
    seek(h, 130);
    h.video.readyState = 2;
    h.video.dispatch('waiting');
    h.video.currentTime = 24;
    h.video.readyState = 4;
    h.video.dispatch('playing');
    assert.strictEqual(h.controller.snapshot().positionSeconds, 124);
    assert.strictEqual(h.controller.snapshot().buffering, false);
    assert.strictEqual(h.renderer.visible, true);
    assert.strictEqual(h.renderer.time, 124);
    h.root.runAllTimeouts(20);
    assert.strictEqual(h.preparations.length, preparations);
    assert.strictEqual(h.controller.snapshot().clockRepairCount, 0);
    h.controller.destroy();
  });

  test(delivery + ': timeout verification retains seek identity for late decoder settlement', function () {
    var h = Harness.create(delivery);
    h.start(); h.sample(10);
    h.controller.seekAbsolute(130, { immediate: true });
    h.video.dispatch('seeking');
    h.root.runAllTimeouts(20); // decoded target, but the device omitted seeked
    h.sample(30);
    assert.strictEqual(h.renderer.visible, false);
    h.sample(29.5);
    assert.strictEqual(h.controller.snapshot().positionSeconds, 129.5);
    assert.strictEqual(h.renderer.epochs[h.renderer.epochs.length - 1], 129.5);
    assert.strictEqual(h.renderer.visible, true);
    h.controller.destroy();
  });
});

test('HLS settlement rejects unbuffered keyframes and uses normal mismatch recovery', function () {
  var h = Harness.create('transcode');
  h.start(); h.sample(10);
  h.video.buffered = Harness.ranges([[28, 50]]);
  seek(h, 130, 24);
  assert.strictEqual(h.controller.snapshot().streamSwitching, true);
  assert.strictEqual(h.playback.offsetBase, 130);
  assert.strictEqual(h.renderer.visible, false);
  h.controller.destroy();
});

test('seek settlement is scoped to the newest HLS seek and is one-shot', function () {
  var h = Harness.create('transcode');
  h.start(); h.sample(10);
  seek(h, 130);
  seek(h, 170);
  var epochs = h.renderer.epochs.length;
  h.sample(64);
  assert.strictEqual(h.controller.snapshot().positionSeconds, 164);
  assert.strictEqual(h.renderer.epochs.length, epochs + 1);
  h.sample(63.5);
  assert.strictEqual(h.controller.snapshot().positionSeconds, 164, 'a second unrelated rollback must not lower the clock');
  assert.strictEqual(h.renderer.epochs.length, epochs + 1);
  h.controller.destroy();
});

test('HLS source rebuild clears the prior in-buffer seek settlement', function () {
  var h = Harness.create('transcode');
  h.start(); h.sample(10);
  seek(h, 130);
  h.video.buffered = Harness.ranges([[0, 40]]);
  h.controller.seekAbsolute(500, { immediate: true });
  h.sourceReady();
  h.sample(0.2);
  assert.strictEqual(h.controller.snapshot().positionSeconds, 500.2);
  assert.strictEqual(h.renderer.time, 500.2);
  assert.strictEqual(h.renderer.epochs[h.renderer.epochs.length - 1], 500);
  h.controller.destroy();
});

console.log('HLS clock integration cases: ' + cases + ', failures: ' + failures);
if (failures) { process.exitCode = 1; }
