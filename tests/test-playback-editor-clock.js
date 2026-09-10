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
function nativeFor(h, absolute) { return absolute - h.playback.offsetBase; }

['direct-play', 'direct-stream', 'transcode', 'safe-transcode'].forEach(function (delivery) {
  test(delivery + ': active ASS editor freezes immediately with its draft offset on buffering and pause', function () {
    var h = Harness.create(delivery);
    h.start(); h.sample(nativeFor(h, 110));
    assert.strictEqual(h.controller.openSubtitleEditor(), true);
    assert.strictEqual(h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 750 }), true);
    h.root.tickIntervals();
    assert.strictEqual(h.renderer.time, 109.25);
    assert.strictEqual(h.renderer.paused, false);
    var reports = h.timeline.length;
    var epochs = h.renderer.epochs.length;
    h.video.readyState = 2; h.video.dispatch('waiting');
    assert.strictEqual(h.renderer.paused, true, 'do not leave preview worker free-running until the 50ms preview timer');
    assert.strictEqual(h.renderer.time, 109.25, 'draft offset is applied once while public time is frozen');
    assert.strictEqual(h.renderer.epochs.length, epochs, 'freezing an unchanged offset is not a discontinuity');
    h.video.readyState = 4; h.video.dispatch('playing');
    assert.strictEqual(h.renderer.paused, false);
    h.video.dispatch('pause');
    assert.strictEqual(h.renderer.paused, true, 'intentional pause also reaches the editor-owned worker immediately');
    assert.strictEqual(h.timeline.length, reports, 'preview never reports draft playback positions to Plex');
    h.controller.destroy();
  });

  ['apply', 'cancel'].forEach(function (action) {
    test(delivery + ': ASS preview seek and ' + action + ' converge without a new native source', function () {
      var h = Harness.create(delivery);
      h.start(); h.sample(nativeFor(h, 110));
      var sources = h.video.sourceWrites.length;
      h.controller.openSubtitleEditor();
      h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 500 });
      h.controller.openSubtitleEditor({ action: 'seek', delta: 20 });
      h.root.runLatestTimeout();
      h.video.dispatch('seeking');
      assert.strictEqual(h.renderer.paused, true, 'the preview worker must stop extrapolating during native seeking');
      h.video.dispatch('seeked');
      h.video.currentTime = nativeFor(h, 124);
      h.root.tickIntervals();
      assert.strictEqual(h.controller.snapshot().positionSeconds, 124);
      assert.strictEqual(h.renderer.time, 123.5);
      assert.strictEqual(h.renderer.epochs[h.renderer.epochs.length - 1], 123.5);
      if (action === 'apply') { h.controller.applySubtitleEditor({}, function (error) { assert.ifError(error); }); }
      else { h.controller.cancelSubtitleEditor(function (error) { assert.ifError(error); }); }
      assert.strictEqual(h.controller.snapshot().subtitleEditor.open, false);
      h.video.dispatch('seeking'); h.video.dispatch('seeked');
      h.sample(nativeFor(h, 110.2));
      assert.strictEqual(h.controller.snapshot().timelineSuppressed, false);
      assert.strictEqual(h.controller.snapshot().localSubtitle.offsetMs, action === 'apply' ? 500 : 0);
      assert.strictEqual(h.video.sourceWrites.length, sources, 'restoring a buffered preview position keeps the source');
      assert.ok(Math.abs(h.renderer.time - (action === 'apply' ? 109.7 : 110.2)) < 0.000001);
      h.controller.destroy();
    });
  });
});

console.log('ASS editor clock cases: ' + cases + ', failures: ' + failures);
if (failures) { process.exitCode = 1; }
