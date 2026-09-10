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
function near(actual, expected, message) { assert.ok(Math.abs(actual - expected) < 0.000001, message + ': ' + actual + ' != ' + expected); }
function nativeFor(h, absolute) { return absolute - h.playback.offsetBase; }
function seek(h, absolute) {
  h.controller.seekAbsolute(absolute, { immediate: true });
  h.video.dispatch('seeking');
  h.video.dispatch('seeked');
}

['direct-play', 'direct-stream', 'transcode', 'safe-transcode'].forEach(function (delivery) {
  var kinds = ['ass', 'srt', 'off'];
  if (delivery === 'transcode' || delivery === 'safe-transcode') { kinds.push('burned', 'embedded-ass'); }
  kinds.forEach(function (kind) {
    test(delivery + '/' + kind + ': seek, buffer, pause, resume, close share the confirmed timeline', function () {
      var h = Harness.create(delivery, { subtitleKind: kind });
      h.start(); h.sample(nativeFor(h, 110));
      assert.strictEqual(h.playback.options.delivery, delivery);
      assert.strictEqual(h.controller.snapshot().subtitleRenderMode, kind === 'off' ? 'off' : (kind === 'burned' ? 'remote' : 'local'));
      var preparations = h.preparations.length;
      seek(h, 130);
      h.sample(nativeFor(h, 124));
      h.sample(nativeFor(h, 124.25));
      near(h.controller.snapshot().positionSeconds, 124.25, 'seek adopts the decoded absolute time');
      assert.strictEqual(h.preparations.length, preparations);
      h.video.readyState = 2; h.video.dispatch('waiting');
      if (kind === 'ass' || kind === 'embedded-ass') { assert.strictEqual(h.renderer.paused, true); }
      h.sample(nativeFor(h, 204.25)); // a transient native reading cannot move the frozen clock
      near(h.controller.snapshot().positionSeconds, 124.25, 'buffering freezes public time');
      h.video.currentTime = nativeFor(h, 123.25);
      h.video.readyState = 4; h.video.dispatch('playing');
      near(h.controller.snapshot().positionSeconds, 123.25, 'normal bounded buffer resume is authoritative');
      assert.strictEqual(h.controller.snapshot().buffering, false);
      if (kind === 'ass' || kind === 'embedded-ass') { near(h.renderer.time, 123.25, 'ASS absolute time'); }
      else if (kind === 'srt') { near(h.overlays[h.overlays.length - 1].time, 123250, 'text uses milliseconds once'); }
      else { assert.strictEqual(h.renderer.loads, 0, 'server/off subtitles do not create local ASS'); }
      h.video.dispatch('pause'); h.root.tickIntervals();
      if (kind === 'ass' || kind === 'embedded-ass') { assert.strictEqual(h.renderer.paused, true); }
      h.video.dispatch('playing'); h.sample(nativeFor(h, 123.5)); h.root.tickIntervals();
      near(h.timeline[h.timeline.length - 1].seconds, 123.5, 'Plex receives media seconds, not stream seconds');
      h.controller.close(); h.root.runAllTimeouts(20); h.root.tickIntervals();
      assert.strictEqual(h.controller.snapshot().active, false);
      assert.strictEqual(h.video.src, '');
      assert.strictEqual(h.root.intervalCount(), 0);
      assert.strictEqual(h.root.timeoutCount(), 0);
      h.controller.destroy();
    });
  });
});

[
  { name: 'remux', delivery: 'direct-stream', video: 'copy', audio: 'copy', mode: 'direct-stream' },
  { name: 'audio conversion', delivery: 'direct-stream', video: 'copy', audio: 'transcode', mode: 'transcode-audio' },
  { name: 'video conversion', delivery: 'transcode', video: 'transcode', audio: 'copy', mode: 'transcode-video' },
  { name: 'audio/video conversion', delivery: 'transcode', video: 'transcode', audio: 'transcode', mode: 'transcode-audio-video' }
].forEach(function (row) {
  test(row.name + ': the Plex decision label does not change the HLS time domain', function () {
    var h = Harness.create(row.delivery, { decisions: row });
    h.start(); h.sample(10);
    assert.strictEqual(h.playback.playbackMode, row.mode);
    seek(h, 130); h.sample(24);
    assert.strictEqual(h.controller.snapshot().positionSeconds, 124);
    assert.strictEqual(h.renderer.time, 124);
    h.video.buffered = Harness.ranges([[0, 35]]);
    h.controller.seekAbsolute(500.8, { immediate: true });
    h.sourceReady(); h.sample(0.2);
    // DS cold reopen retains a fractional origin; an in-place TC rebuild normalizes
    // to whole seconds. Both must use the exact offset sent to the source.
    var origin = row.delivery === 'direct-stream' ? 500.8 : 500;
    near(h.playback.offsetBase, origin, 'preserve the existing source offset policy');
    near(h.preparations[h.preparations.length - 1].offset, origin, 'Plex preparation owns the same origin');
    near(h.controller.snapshot().positionSeconds, origin + 0.2, 'rebuild keeps an absolute checkpoint');
    near(h.renderer.time, origin + 0.2, 'ASS follows the rebuilt source');
    near(h.renderer.epochs[h.renderer.epochs.length - 1], origin, 'ASS epoch starts at the installed origin');
    h.controller.destroy();
  });
});

test('forced transcoding retains server ASS even when local rendering is enabled globally', function () {
  var h = Harness.create('transcode', { forcedTranscode: true });
  h.start(); h.sample(10);
  assert.strictEqual(h.controller.snapshot().subtitleRenderMode, 'remote');
  assert.strictEqual(h.renderer.loads, 0);
  seek(h, 130); h.sample(24);
  assert.strictEqual(h.controller.snapshot().positionSeconds, 124);
  assert.strictEqual(h.renderer.loads, 0);
  h.controller.destroy();
});

['direct-stream', 'transcode', 'safe-transcode'].forEach(function (delivery) {
  test(delivery + ': queued old canplay with no new data cannot authorize a replacement', function () {
    var h = Harness.create(delivery);
    h.start(); h.sample(25);
    h.video.buffered = Harness.ranges([[0, 40]]);
    h.controller.seekAbsolute(500, { immediate: true });
    h.video.readyState = 0;
    h.video.dispatch('canplay'); h.video.dispatch('playing');
    assert.strictEqual(h.controller.snapshot().streamSwitching, true);
    assert.strictEqual(h.controller.snapshot().positionSeconds, 500);
    assert.strictEqual(h.renderer.visible, false);
    h.sourceReady(); h.sample(0.2);
    near(h.renderer.time, 500.2, 'a genuinely ready source resumes');
    h.controller.destroy();
  });

  [false, true].forEach(function (userPaused) {
  test(delivery + ': terminal seek preserves original pause intent (' + userPaused + ') on backward seek', function () {
    var h = Harness.create(delivery);
    h.start(); h.sample(10);
    if (userPaused) { h.video.dispatch('pause'); }
    h.controller.seekAbsolute(1800, { immediate: true });
    h.sourceReady(undefined, false);
    assert.strictEqual(h.controller.snapshot().positionSeconds, 1800);
    assert.strictEqual(h.video.paused, true);
    assert.strictEqual(h.ended(), 1);
    h.video.dispatch('playing'); h.video.dispatch('ended');
    assert.strictEqual(h.video.paused, true);
    assert.strictEqual(h.ended(), 1, 'late native end must not complete twice');
    h.controller.seekAbsolute(900, { immediate: true });
    h.sourceReady(undefined, false);
    assert.strictEqual(h.controller.snapshot().positionSeconds, 900);
    assert.strictEqual(h.video.paused, userPaused, 'terminal auto-pause must not overwrite the original user intent');
    if (userPaused) { h.controller.toggle(); }
    h.video.dispatch('playing'); h.sample(0.2);
    near(h.controller.snapshot().positionSeconds, 900.2, 'explicit Play resumes the new origin');
    h.controller.destroy();
  });

  });

  test(delivery + ': audio and subtitle selection replace sources at the same absolute checkpoint', function () {
    var h = Harness.create(delivery);
    h.start(); h.sample(25);
    h.controller.changeTrack('audio', 'a2', function (error) { assert.ifError(error); });
    var position = h.controller.snapshot().positionSeconds;
    near(position, 125, 'track selection captures absolute position');
    h.video.dispatch('playing');
    assert.strictEqual(h.controller.snapshot().streamSwitching, true);
    h.sourceReady(); h.sample(0.2);
    near(h.controller.snapshot().positionSeconds, 125.2, 'new audio stream has a new relative clock');
    h.controller.changeTrack('subtitles', '', function (error) { assert.ifError(error); });
    h.sourceReady();
    assert.strictEqual(h.controller.snapshot().subtitleRenderMode, 'off');
    assert.strictEqual(h.renderer.visible, false);
    h.controller.destroy();
  });
});

console.log('Playback delivery matrix cases: ' + cases + ', failures: ' + failures);
if (failures) { process.exitCode = 1; }
