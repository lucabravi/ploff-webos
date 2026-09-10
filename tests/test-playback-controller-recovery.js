'use strict';

var assert = require('assert');
var DebugCapture = require('../app/debug-capture');
var Fixture = require('./helpers/playback-controller-harness');
var harness = Fixture.harness;
var playbackFixture = Fixture.playbackFixture;
var ranges = Fixture.ranges;

(function closeAndDestroy() {
  var h = harness();
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 25 });
  h.video.dispatch('playing');
  h.controller.close();
  assert.strictEqual(h.controller.snapshot().active, false, 'close must release the current playback');
  assert.strictEqual(h.root.intervalCount(), 0, 'close must cancel reporting and keepalive intervals');
  assert.strictEqual(h.video.src, '', 'close must clear the native source');
  h.controller.destroy();
  h.controller.destroy();
  assert.strictEqual(h.controller.snapshot().destroyed, true, 'destroy must be idempotent');
}());

(function waitingFreezesPublicAndAssClocksBeforeSpinnerGraceAndCanplayCannotReleaseThem() {
  var h = harness();
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('playing');
  h.video.currentTime = 10;
  h.video.dispatch('timeupdate');
  h.video.dispatch('waiting');
  assert.strictEqual(h.controller.snapshot().buffering, true,
    'waiting must enter buffering immediately instead of waiting for the 500ms visual spinner grace');
  h.video.currentTime = 40;
  h.video.dispatch('timeupdate');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 10,
    'a native forward sample during spinner grace must not advance the public timeline');
  h.root.runNextTimeout();
  h.video.dispatch('canplay');
  h.video.dispatch('timeupdate');
  assert.strictEqual(h.controller.snapshot().buffering, true,
    'canplay alone must not end buffering before the decoder emits playing');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 10,
    'canplay must not expose the suspicious native clock to the timeline');
}());

(function transientForwardClockAfterBufferIsHeldUntilAStableSampleArrives() {
  var h = harness();
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('playing');
  h.video.currentTime = 10;
  h.video.dispatch('timeupdate');
  h.video.dispatch('waiting');
  h.video.currentTime = 40;
  h.video.dispatch('playing');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 10,
    'the first impossible playing sample must remain behind the frozen public clock barrier');
  assert.strictEqual(h.controller.snapshot().buffering, true,
    'an impossible resume sample must stay in bounded settlement rather than publishing playing');
  assert.strictEqual(h.preparations.length, 1, 'the first suspicious sample must receive a short settlement window before rebuilding');
  h.video.currentTime = 11;
  h.video.dispatch('timeupdate');
  h.root.runLatestTimeout();
  assert.strictEqual(h.controller.snapshot().buffering, false,
    'a stable sample inside the settlement window must complete buffering without replacing the source');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 11,
    'the recovered native sample must become the shared public clock');
  assert.strictEqual(h.preparations.length, 1, 'transient clock poisoning must not force a source rebuild');
}());

(function persistentForwardClockRebuildsOnceAtTheFrozenCheckpointAndLaterBufferMayRepairAgain() {
  var h = harness();
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('playing');
  h.video.currentTime = 10;
  h.video.dispatch('timeupdate');
  h.video.dispatch('waiting');
  h.video.currentTime = 40;
  h.video.dispatch('playing');
  h.root.runLatestTimeout();
  assert.strictEqual(h.preparations.length, 2, 'a persistent forward clock jump must rebuild once');
  assert.strictEqual(h.preparations[1].offset, 10, 'clock recovery must rebuild at the last confirmed pre-buffer absolute position');
  assert.strictEqual(h.controller.snapshot().clockRepairCount, 1, 'the first incident must count one bounded repair');

  h.video.currentTime = 0;
  h.video.dispatch('canplay');
  h.video.dispatch('playing');
  h.video.currentTime = 1;
  h.video.dispatch('timeupdate');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 11, 'the rebuilt offset stream must resume on the absolute clock');
  h.video.dispatch('waiting');
  h.video.currentTime = 30;
  h.video.dispatch('playing');
  h.root.runLatestTimeout();
  assert.strictEqual(h.preparations.length, 3, 'a later independent buffering incident must be allowed one new bounded repair');
  assert.strictEqual(h.preparations[2].offset, 11, 'the second incident must preserve its own confirmed checkpoint');
  assert.strictEqual(h.controller.snapshot().clockRepairCount, 2, 'repair diagnostics must remain cumulative across independent incidents');
}());

(function offsetHlsAbsoluteNativeDomainFlipCannotDoubleApplyTheStreamOffset() {
  var h = harness();
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.video.currentTime = 10;
  h.video.dispatch('timeupdate');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 130);
  h.video.dispatch('waiting');
  h.video.currentTime = 131;
  h.video.dispatch('playing');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 130,
    'a raw native sample in absolute Plex time must not be added to offsetBase and published');
  h.root.runLatestTimeout();
  assert.strictEqual(h.preparations.length, 2, 'a persistent native-domain flip must rebuild the offset stream');
  assert.strictEqual(h.preparations[1].offset, 130, 'domain-flip recovery must use the frozen absolute checkpoint');
}());

(function pausingDuringBufferingPreservesTheCheckpointAndExplicitSeekSupersedesIt() {
  var h = harness();
  var diagnostics;
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('playing');
  h.video.currentTime = 30;
  h.video.dispatch('timeupdate');
  h.video.dispatch('waiting');
  h.video.currentTime = 60;
  h.video.dispatch('pause');
  assert.strictEqual(h.controller.snapshot().buffering, true,
    'a user pause during buffering must preserve the unresolved clock checkpoint for resume validation');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 30,
    'pause reporting during buffering must use the frozen confirmed position');
  assert.strictEqual(h.timeline[h.timeline.length - 1].seconds, 30,
    'the paused Plex timeline report must not contain the suspicious native sample');
  h.controller.seekAbsolute(5, { immediate: true });
  h.video.dispatch('seeked');
  assert.strictEqual(h.controller.snapshot().buffering, false,
    'an explicit committed seek must supersede and clear the old buffering incident');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 5,
    'the explicit seek target must become authoritative after cancelling the old checkpoint');
  diagnostics = h.controller.diagnostics();
  assert.strictEqual(diagnostics.bufferRecoveryReason, 'explicit-seek');
  assert.strictEqual(diagnostics.bufferStartPublic, 30,
    'seek-superseded diagnostics must retain the buffering checkpoint that the seek replaced');
}());

(function localAssClockUsesTheSamePostBufferSettlementBarrierAsTheTimeline() {
  var playback = playbackFixture();
  var rendererInstance;
  var h;
  playback.resumePosition = 0;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/1.ass' }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadSubtitleText: function (_config, _current, _track, callback) {
      callback(null, '[Script Info]\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:10:00.00,Default,,0,0,0,,Hello');
      return { abort: function () {} };
    },
    AssSubtitleRenderer: {
      create: function () {
        rendererInstance = {
          load: function (_content, callback) { callback(null); },
          discontinuities: [],
          setTime: function (time, paused) { rendererInstance.time = time; rendererInstance.paused = paused; },
          discontinuity: function (time) { rendererInstance.discontinuities.push(time); }, show: function () {}, hide: function () {}, dispose: function () {}
        };
        return rendererInstance;
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('playing');
  h.video.currentTime = 10;
  h.video.dispatch('timeupdate');
  assert.strictEqual(rendererInstance.time, 10);
  h.video.dispatch('waiting');
  h.video.currentTime = 40;
  h.video.dispatch('timeupdate');
  h.video.dispatch('playing');
  assert.strictEqual(rendererInstance.time, 10, 'ASS must remain anchored to the same frozen position as the timeline');
  assert.strictEqual(rendererInstance.paused, true, 'ASS worker progression must remain paused while the native clock is suspect');
  h.video.currentTime = 11;
  h.root.runLatestTimeout();
  assert.strictEqual(rendererInstance.time, 11, 'ASS must resume from the validated native sample');
  assert.strictEqual(rendererInstance.paused, false, 'ASS worker progression must resume only after clock validation');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 11, 'ASS and timeline must converge on one validated clock');

  h.video.currentTime = 20;
  h.video.dispatch('timeupdate');
  h.video.dispatch('waiting');
  h.video.currentTime = 19;
  h.video.dispatch('playing');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 19,
    'a plausible decoder rollback after buffering must follow the actual video clock');
  assert.strictEqual(rendererInstance.discontinuities[rendererInstance.discontinuities.length - 1], 19,
    'an accepted post-buffer rollback must open a new ASS epoch so its monotonic barrier cannot remain ahead of the video');
  assert.strictEqual(rendererInstance.time, 19,
    'ASS must render from the same accepted rollback position as the timeline');

  h.video.currentTime = 30;
  h.video.dispatch('timeupdate');
  h.video.dispatch('waiting');
  h.video.currentTime = 60;
  h.video.dispatch('playing');
  h.root.runLatestTimeout();
  assert.strictEqual(rendererInstance.discontinuities[rendererInstance.discontinuities.length - 1], 30,
    'a persistent buffer-clock repair must open an ASS epoch at the checkpoint before replacing the source');
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-play',
    'buffer-clock recovery from Direct Play must cold-reopen and retry the normal Direct Play strategy');
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 0,
    'the reopened Direct Play source must retain its native zero-based clock');
  assert.strictEqual(h.controller.snapshot().playback.diagnosticRecoveryTrace, 'DP > REOPEN[buffer-repair] > DP',
    'buffer repair diagnostics must not report a Direct Stream fallback while Direct Play remains usable');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 30,
    'the public timeline and ASS discontinuity must retain the absolute recovery target across the cold reopen');
}());

(function bufferingDiagnosticsExposeRawNativeAndRecoveryDecision() {
  var h = harness();
  var diagnostics;
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('playing');
  h.video.currentTime = 10;
  h.video.dispatch('timeupdate');
  h.video.dispatch('waiting');
  h.video.currentTime = 40;
  h.video.dispatch('playing');
  diagnostics = h.controller.diagnostics();
  assert.strictEqual(diagnostics.nativeCurrentTime, 40, 'diagnostics must expose the raw native clock sample');
  assert.strictEqual(diagnostics.nativeAbsoluteTime, 40, 'diagnostics must expose native plus offset as a separate derived value');
  assert.strictEqual(diagnostics.bufferStartPublic, 10, 'diagnostics must preserve the last confirmed public time at buffering start');
  assert.strictEqual(diagnostics.bufferStartNative, 10, 'diagnostics must preserve the native sample seen at buffering start');
  assert.strictEqual(diagnostics.bufferStartOffsetBase, 0, 'diagnostics must preserve the stream offset at buffering start');
  assert.strictEqual(diagnostics.bufferRecoveryAccepted, false, 'diagnostics must expose the rejected first resume sample');
  assert.strictEqual(diagnostics.bufferRecoveryReason, 'forward-jump');
  assert.strictEqual(diagnostics.bufferRecoveryDelta, 30);
  h.video.currentTime = 11;
  h.root.runLatestTimeout();
  diagnostics = h.controller.diagnostics();
  assert.strictEqual(diagnostics.bufferRecoveryAccepted, true, 'diagnostics must retain the final recovery outcome');
  assert.strictEqual(diagnostics.bufferRecoveryReason, 'transient-recovered');
  assert.strictEqual(diagnostics.bufferRecoveryInitialReason, 'forward-jump');
  assert.strictEqual(diagnostics.bufferRecoveryDelta, 1);
  assert.strictEqual(diagnostics.bufferStartPublic, 10, 'completed recovery diagnostics must retain the originating public checkpoint');
  assert.strictEqual(diagnostics.bufferStartNative, 10, 'completed recovery diagnostics must retain the originating native checkpoint');
  assert.strictEqual(diagnostics.bufferStartOffsetBase, 0, 'completed recovery diagnostics must retain the originating stream offset');
}());

(function timeupdateCanFinishAPausedBufferingIncidentWhenPlayingIsMissing() {
  var h = harness();
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('playing');
  h.video.currentTime = 10;
  h.video.dispatch('timeupdate');
  h.video.dispatch('waiting');
  h.video.dispatch('pause');
  assert.strictEqual(h.controller.snapshot().buffering, true,
    'manual pause during buffering must preserve the unresolved checkpoint');
  h.video.paused = false;
  h.video.readyState = 4;
  h.video.currentTime = 10.5;
  h.video.dispatch('timeupdate');
  assert.strictEqual(h.controller.snapshot().buffering, false,
    'an advancing high-readiness timeupdate must finish recovery if webOS omits playing after manual resume');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 10.5);
  assert.strictEqual(h.statuses[h.statuses.length - 1], 'playing',
    'timeupdate fallback must restore the normal playing state, not only unfreeze the clock');
}());

(function lowReadyStateTimeupdateFreezesBeforeAForwardSampleCanPoisonTheClock() {
  var h = harness();
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('playing');
  h.video.currentTime = 10;
  h.video.dispatch('timeupdate');
  h.video.readyState = 2;
  h.video.currentTime = 40;
  h.video.dispatch('timeupdate');
  assert.strictEqual(h.controller.snapshot().buffering, true,
    'HAVE_CURRENT_DATA without waiting/stalled must still open a defensive buffering checkpoint');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 10,
    'the low-readyState timeupdate must freeze before its raw forward sample can poison the public clock');
  h.video.readyState = 4;
  h.video.currentTime = 11;
  h.video.dispatch('playing');
  assert.strictEqual(h.controller.snapshot().buffering, false);
  assert.strictEqual(h.controller.snapshot().positionSeconds, 11,
    'normal playback must resume from the validated sample after inferred buffering');
}());

(function gracePeriodNativeAdvanceCanResolveBufferingWithoutPlayingEvent() {
  var h = harness();
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('playing');
  h.video.currentTime = 10;
  h.video.dispatch('timeupdate');
  h.video.dispatch('waiting');
  h.video.currentTime = 10.3;
  h.root.runNextTimeout();
  assert.strictEqual(h.controller.snapshot().buffering, false,
    'native advance during spinner grace must resolve semantic buffering even if webOS omits a second playing event');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 10.3,
    'grace-period watchdog recovery must publish the validated native clock');
  assert.strictEqual(h.preparations.length, 1,
    'a plausible grace-period native advance must not rebuild the playback source');
}());

(function waitingDuringOwnedNativeSeekDoesNotCreateASecondBufferingLifecycle() {
  var playback = playbackFixture();
  var h = harness({
    playback: playback,
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  h.video.seekable = ranges([[0, 600]]);
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('canplay');
  h.video.dispatch('playing');
  h.controller.seekAbsolute(20, { immediate: true });
  assert.strictEqual(h.controller.snapshot().nativeSeekPending, true, 'test setup must own a native seek');
  h.video.dispatch('waiting');
  assert.strictEqual(h.controller.snapshot().buffering, false,
    'waiting emitted as part of an owned native seek must not create an independent buffering checkpoint');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 20,
    'native-seek waiting must preserve the explicit absolute target');
}());

(function terminalEndDuringBufferingRetiresTheClockIncidentAndItsTimers() {
  var h = harness();
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('playing');
  h.video.currentTime = 10;
  h.video.dispatch('timeupdate');
  h.video.dispatch('waiting');
  assert.strictEqual(h.controller.snapshot().buffering, true, 'test setup must own an active buffering checkpoint');
  h.video.dispatch('ended');
  assert.strictEqual(h.controller.snapshot().buffering, false,
    'terminal playback must retire semantic buffering instead of leaving a stale checkpoint and spinner timer');
  assert.strictEqual(h.controller.snapshot().positionSeconds, h.controller.snapshot().durationSeconds,
    'terminal playback must remain pinned to duration after retiring buffering');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.preparations.length, 1, 'a late buffering timer must not rebuild after playback already ended');
}());

(function nativeErrorDuringBufferingCancelsSettlementBeforeNormalRecovery() {
  var h = harness();
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('playing');
  h.video.currentTime = 10;
  h.video.dispatch('timeupdate');
  h.video.dispatch('waiting');
  h.video.currentTime = 40;
  h.video.dispatch('playing');
  assert.strictEqual(h.controller.snapshot().buffering, true, 'test setup must enter post-buffer clock settlement');
  h.video.error = new Error('decoder failed');
  h.video.dispatch('error');
  assert.strictEqual(h.controller.snapshot().buffering, false,
    'native playback error must cancel the independent buffering settlement before recovery begins');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.preparations.length, 2,
    'native error recovery must prepare exactly one replacement source without a second buffer-clock rebuild racing it');
}());


(function manualDebugCaptureSpansBufferSeekAndSourceReplacementWithoutSecrets() {
  var now = 1000;
  var capture = DebugCapture.create({ now: function () { return now; }, wallNow: function () { return 100000 + now; } });
  var h = harness({ debugCapture: capture });
  var events;
  var applied;
  capture.start();
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('canplay');
  h.video.dispatch('playing');
  h.video.currentTime = 10;
  h.video.dispatch('timeupdate');
  now += 100;
  h.video.dispatch('waiting');
  h.video.currentTime = 10.3;
  h.root.runNextTimeout();
  now += 100;
  h.video.readyState = 4;
  h.video.dispatch('playing');
  now += 100;
  h.controller.seekAbsolute(50, { immediate: true, source: 'debug-test' });
  h.video.dispatch('canplay');
  h.root.runNextTimeout();
  events = capture.export().events.filter(function (entry) { return entry.category === 'playback'; });
  assert.ok(events.some(function (entry) { return entry.event === 'open-request'; }), 'capture must mark playback open');
  assert.ok(events.some(function (entry) { return entry.event === 'source-prepare-start'; }), 'capture must mark source preparation');
  assert.ok(events.some(function (entry) { return entry.event === 'native-canplay'; }), 'capture must mark canplay');
  assert.ok(events.some(function (entry) { return entry.event === 'resume-rebuilt-fire'; }), 'capture must expose the delayed source-resume callback');
  assert.ok(events.some(function (entry) { return entry.event === 'native-play-request'; }), 'capture must expose when the controller asks the rebuilt native source to play');
  assert.ok(events.some(function (entry) { return entry.event === 'native-playing'; }), 'capture must mark playing');
  assert.ok(events.some(function (entry) { return entry.event === 'native-waiting'; }), 'capture must mark waiting');
  assert.ok(events.some(function (entry) { return entry.event === 'buffer-start'; }), 'capture must mark the buffering checkpoint');
  assert.ok(events.some(function (entry) { return entry.event === 'buffer-indicator-advance'; }), 'capture must expose delayed grace/watchdog callbacks so stale callback races can be reconstructed');
  assert.ok(events.some(function (entry) { return entry.event === 'buffer-resume-sample'; }), 'capture must mark the accepted/rejected resume sample');
  assert.ok(events.some(function (entry) { return entry.event === 'buffer-finish'; }), 'capture must mark the end of each buffering incident');
  assert.ok(events.some(function (entry) { return entry.event === 'seek-request'; }), 'capture must mark explicit seeks');
  assert.ok(events.some(function (entry) { return entry.event === 'seek-commit'; }), 'capture must mark the resolved seek operation before native seek or rebuild');
  assert.ok(events.some(function (entry) { return entry.event === 'rebuild-start'; }), 'capture must mark source rebuilds');
  applied = events.filter(function (entry) { return entry.event === 'source-applied'; });
  assert.ok(applied.length >= 2, 'capture must distinguish initial and rebuilt source application');
  assert.ok(applied[applied.length - 1].sourceGeneration > applied[0].sourceGeneration,
    'source replacement must advance an explicit diagnostic source generation');
  assert.strictEqual(applied[applied.length - 1].offsetBase, 50,
    'rebuilt source diagnostic must expose the new safe offsetBase');
  assert.strictEqual(events.some(function (entry) { return entry.sourceUrl !== undefined || entry.token !== undefined; }), false,
    'playback capture must never expose raw source URLs or Plex tokens');
}());

(function pendingSeekSupersedesDelayedResumeOfRebuiltSource() {
  var playback = playbackFixture();
  var h;
  var playsBeforeSupersededResume;
  playback.duration = 1431508;
  h = harness({ playback: playback });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 1007 });
  h.video.dispatch('canplay');
  h.root.runNextTimeout();
  h.video.dispatch('playing');
  h.root.runNextTimeout();

  h.controller.seekAbsolute(1421, { immediate: true, forceRebuild: true, source: 'end-seek-regression' });
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 1421,
    'test setup must own the near-end rebuilt source from the captured incident');
  h.video.dispatch('canplay');
  playsBeforeSupersededResume = h.video.playCalls;

  [1411, 1301, 1091, 791, 731].forEach(function (target) {
    h.controller.seekAbsolute(target, { source: 'remote' });
  });
  h.root.runNextTimeout();
  assert.strictEqual(h.video.playCalls, playsBeforeSupersededResume,
    'a delayed resume for the 1421 source must not play after a newer coalesced seek supersedes it');

  h.root.runNextTimeout();
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 731,
    'the existing seek debounce must rebuild only for the latest requested target');
  h.video.dispatch('canplay');
  h.root.runNextTimeout();
  assert.strictEqual(h.video.playCalls, playsBeforeSupersededResume + 1,
    'the replacement source for the latest target must still resume normally');
}());

(function directPlayRebuildStaysStickyDuringReopenGuard() {
  var loadCalls = 0;
  var h;
  function freshPlayback() {
    var current = playbackFixture();
    current.options.subtitleStreamID = '';
    return current;
  }
  h = harness({
    playback: freshPlayback(),
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadPlayback: function (config, key, session, preferences, callback) {
      loadCalls += 1;
      callback(null, freshPlayback());
      return { abort: function () {} };
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  assert.strictEqual(h.controller.snapshot().playback.options.delivery, 'direct-play', 'test setup must start in Direct Play');
  assert.strictEqual(loadCalls, 1, 'initial Direct Play must load once');
  h.video.dispatch('canplay');
  h.video.dispatch('seeked');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');

  h.controller.seekAbsolute(900, { immediate: true, forceRebuild: true, source: 'direct-play-cold-reopen' });
  assert.strictEqual(loadCalls, 2, 'the first Direct Play rebuild must cold-reopen through loadPlayback instead of falling through to Direct Stream');
  assert.strictEqual(h.controller.snapshot().playback.options.delivery, 'direct-play', 'the cold reopen must re-run the normal strategy and retry Direct Play first');
  assert.strictEqual(h.controller.snapshot().playback.diagnosticRecoveryTrace, 'DP > REOPEN[seek] > DP',
    'the TV-visible diagnostic trace must expose the Direct Play cold reopen and its retried delivery');

  h.controller.seekAbsolute(910, { immediate: true, forceRebuild: true, source: 'direct-play-reopen-guard' });
  assert.strictEqual(loadCalls, 2, 'a second rebuild before the reopened Direct Play settles must not cold-reopen again');
  assert.strictEqual(h.controller.snapshot().playback.options.delivery, 'direct-play', 'the guarded second rebuild must keep Direct Play sticky instead of treating Direct Stream as generic recovery');
  assert.strictEqual(h.controller.snapshot().playback.diagnosticRecoveryTrace, 'DP > REOPEN[seek] > DP > RETRY[seek-switch] > DP',
    'the diagnostic trace must distinguish a sticky Direct Play retry from an actual delivery fallback');
}());

(function directPlaySeekTimeoutDuringReopenStaysSticky() {
  var loadCalls = 0;
  var h;
  function freshPlayback() {
    var current = playbackFixture();
    current.options.subtitleStreamID = '';
    return current;
  }
  h = harness({
    playback: freshPlayback(),
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadPlayback: function (config, key, session, preferences, callback) {
      loadCalls += 1;
      callback(null, freshPlayback());
      return { abort: function () {} };
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('canplay');
  h.video.dispatch('seeked');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');

  h.controller.seekAbsolute(500, { immediate: true, source: 'direct-play-timeout' });
  h.video.currentTime = 100;
  h.root.runNextTimeout();
  assert.strictEqual(loadCalls, 2, 'the first failed Direct Play seek verification must cold-reopen once');
  assert.strictEqual(h.controller.snapshot().playback.options.delivery, 'direct-play', 'the timeout reopen must retry Direct Play first');

  h.video.dispatch('canplay');
  h.video.currentTime = 100;
  h.root.runNextTimeout();
  assert.strictEqual(loadCalls, 2, 'a timeout during the guarded reopen must not recurse through another loadPlayback');
  assert.strictEqual(h.controller.snapshot().playback.options.delivery, 'direct-play', 'a repeated seek timeout must not consume Direct Stream while Direct Play remains usable');
  assert.strictEqual(h.controller.snapshot().playback.diagnosticRecoveryTrace, 'DP > REOPEN[seek-timeout] > DP > RETRY[seek-timeout] > DP',
    'seek-timeout diagnostics must distinguish the guarded Direct Play retry from a delivery fallback');
}());

(function directPlaySeekMismatchDuringReopenStaysSticky() {
  var h;
  function freshPlayback() {
    var current = playbackFixture();
    current.options.subtitleStreamID = '';
    return current;
  }
  h = harness({
    playback: freshPlayback(),
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadPlayback: function (config, key, session, preferences, callback) {
      callback(null, freshPlayback());
      return { abort: function () {} };
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('canplay');
  h.video.dispatch('seeked');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');

  h.controller.seekAbsolute(900, { immediate: true, forceRebuild: true, source: 'direct-play-mismatch' });
  h.video.dispatch('canplay');
  h.video.currentTime = 100;
  h.video.dispatch('seeked');
  assert.strictEqual(h.controller.snapshot().playback.options.delivery, 'direct-play', 'a seek mismatch during Direct Play reopen must keep the same delivery');
  assert.strictEqual(h.controller.snapshot().playback.diagnosticRecoveryTrace, 'DP > REOPEN[seek] > DP > RETRY[seek-mismatch] > DP',
    'seek-mismatch diagnostics must not report a Direct Stream fallback');
}());

(function directPlayReopenPrepareFailureDoesNotConsumeDirectStreamWithoutCompatibilityEvidence() {
  var prepareCount = 0;
  var h;
  function freshPlayback() {
    var current = playbackFixture();
    current.options.subtitleStreamID = '';
    return current;
  }
  h = harness({
    playback: freshPlayback(),
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadPlayback: function (config, key, session, preferences, callback) {
      callback(null, freshPlayback());
      return { abort: function () {} };
    },
    preparePlayback: function (config, current, options, callback) {
      prepareCount += 1;
      if (prepareCount === 2 && options.delivery === 'direct-play') { callback(new Error('reopened Direct Play prepare failed')); }
      else { callback(null, 'https://stream/' + current.transcodeSession + '/' + Number(options.offset || 0)); }
      return null;
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('canplay');
  h.video.dispatch('seeked');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  h.controller.seekAbsolute(900, { immediate: true, forceRebuild: true, source: 'direct-play-cold-reopen' });
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.preparations.length, 2, 'an unclassified Direct Play prepare error must stop bounded recovery instead of trying another delivery');
  assert.strictEqual(h.controller.snapshot().playback.options.delivery, 'direct-play', 'a transient or unclassified Direct Play prepare failure must not consume Direct Stream');
  assert.strictEqual(h.controller.snapshot().playback.diagnosticRecoveryTrace, 'DP > REOPEN[seek] > DP',
    'the diagnostic trace must not claim a fallback when Direct Play compatibility has not been disproved');
  assert.strictEqual(h.errors.length, 1, 'the blocked Direct Play recovery must still surface the original preparation error');
}());

(function settledDirectPlayReopenAllowsFutureColdReopen() {
  var loadCalls = 0;
  var h;
  function freshPlayback() {
    var current = playbackFixture();
    current.options.subtitleStreamID = '';
    return current;
  }
  h = harness({
    playback: freshPlayback(),
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadPlayback: function (config, key, session, preferences, callback) {
      loadCalls += 1;
      callback(null, freshPlayback());
      return { abort: function () {} };
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('canplay');
  h.video.dispatch('seeked');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');

  h.controller.seekAbsolute(900, { immediate: true, forceRebuild: true, source: 'first-direct-play-cold-reopen' });
  assert.strictEqual(loadCalls, 2, 'first Direct Play rebuild must cold-reopen');
  h.video.dispatch('canplay');
  h.video.dispatch('seeked');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');

  h.controller.seekAbsolute(1000, { immediate: true, forceRebuild: true, source: 'later-direct-play-cold-reopen' });
  assert.strictEqual(loadCalls, 3, 'once reopened Direct Play reaches playing, a later independent rebuild must be allowed to cold-reopen again');
}());

(function seekRebuildColdReopensPlaybackButNativeSeekDoesNot() {
  var playback = playbackFixture();
  var loadCalls = [];
  var prepareCount = 0;
  var h;
  playback.options.subtitleStreamID = '';
  h = harness({
    playback: playback,
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadPlayback: function (config, key, session, preferences, callback) {
      loadCalls.push({ key: key, session: session, preferences: JSON.parse(JSON.stringify(preferences || {})) });
      callback(null, playback);
      return { abort: function () {} };
    },
    preparePlayback: function (config, current, options, callback) {
      prepareCount += 1;
      if (prepareCount === 1) { callback(new Error('unsupported codec')); }
      else { callback(null, 'https://stream/' + current.transcodeSession + '/' + Number(options.offset || 0)); }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.root.runNextTimeout();
  assert.strictEqual(h.controller.snapshot().playback.options.delivery, 'direct-stream', 'test setup must settle on Direct Stream');
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  assert.strictEqual(loadCalls.length, 1, 'initial playback must load once');
  assert.strictEqual(h.openings(), 1, 'initial playback must notify the visible player opening lifecycle once');
  assert.strictEqual(h.playbackLoads(), 1, 'initial playback must notify the visible player loaded lifecycle once');
  h.controller.seekAbsolute(150, { immediate: true, source: 'native-seek-control' });
  assert.strictEqual(loadCalls.length, 1, 'a normal native seek must not cold-reopen playback');
  h.video.dispatch('seeked');
  h.controller.changeVersion({ kind: 'settings', videoQuality: '8000', playbackMode: 'direct' });
  h.controller.seekAbsolute(30, { immediate: true, forceRebuild: true, source: 'cold-reopen-regression' });
  assert.strictEqual(loadCalls.length, 2, 'a seek that requires rebuild must cold-reopen playback through loadPlayback');
  assert.strictEqual(h.openings(), 1, 'internal cold reopen must not replay visible player opening UI lifecycle');
  assert.strictEqual(h.playbackLoads(), 1, 'internal cold reopen must not replay visible player loaded UI lifecycle');
  assert.strictEqual(loadCalls[1].preferences.mediaIndex, playback.mediaIndex, 'cold reopen must preserve the selected media version');
  assert.strictEqual(loadCalls[1].preferences.partIndex, playback.partIndex, 'cold reopen must preserve the selected media part');
  assert.strictEqual(loadCalls[1].preferences.audioTrackPreference.id, 'a1', 'cold reopen must preserve the selected audio track preference');
  assert.strictEqual(loadCalls[1].preferences.subtitleMode, 'off', 'cold reopen must preserve subtitles-off state');
  assert.strictEqual(loadCalls[1].preferences.videoQuality, '8000', 'cold reopen must preserve the active quality preference');
  assert.strictEqual(loadCalls[1].preferences.playbackMode, 'direct', 'cold reopen must preserve the active playback-mode preference');
}());


(function subtitleEditorSurvivesSeekColdReopen() {
  var loadCalls = 0;
  var prepareCount = 0;
  var cancelError = null;
  var h;
  function freshPlayback() {
    var current = playbackFixture();
    current.options.subtitleStreamID = 's1';
    return current;
  }
  h = harness({
    playback: freshPlayback(),
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadPlayback: function (config, key, session, preferences, callback) {
      var current = freshPlayback();
      loadCalls += 1;
      current.options.playbackMode = preferences && preferences.playbackMode || 'auto';
      current.options.videoQuality = preferences && preferences.videoQuality || 'original';
      callback(null, current);
      return { abort: function () {} };
    },
    preparePlayback: function (config, current, options, callback) {
      prepareCount += 1;
      if (prepareCount === 1) { callback(new Error('unsupported codec')); }
      else { callback(null, 'https://stream/' + current.transcodeSession + '/' + Number(options.offset || 0)); }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.root.runNextTimeout();
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  assert.strictEqual(h.controller.snapshot().playback.options.delivery, 'direct-stream', 'test setup must settle on Direct Stream');
  assert.strictEqual(h.controller.openSubtitleEditor(), true, 'subtitle editor must open before the cold reopen');
  h.controller.openSubtitleEditor({ action: 'set-size', size: 125 });
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 250 });
  assert.strictEqual(h.controller.snapshot().subtitleEditor.offsetMs, 250, 'test setup must retain the draft offset');
  h.controller.seekAbsolute(30, { immediate: true, forceRebuild: true, source: 'subtitle-editor-cold-reopen' });
  assert.strictEqual(loadCalls, 2, 'editor seek rebuild must still cold-reopen playback');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.open, true, 'cold reopen must keep the subtitle editor open');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.selectedStreamID, 's1', 'cold reopen must preserve the draft subtitle track');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.subtitleSize, 125, 'cold reopen must preserve the draft subtitle size');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.offsetMs, 250, 'cold reopen must preserve the draft subtitle offset');
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  assert.strictEqual(h.controller.openSubtitleEditor({ action: 'toggle-loop' }), true, 'editor actions must remain bound to the reopened playback');
  h.controller.cancelSubtitleEditor(function (error) { cancelError = error || null; });
  assert.ifError(cancelError);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.open, false, 'Cancel must still close the editor after a cold reopen');
  assert.strictEqual(h.controller.snapshot().localSubtitle.offsetMs, 0, 'Cancel must restore the original local subtitle offset after a cold reopen');
  assert.strictEqual(h.controller.snapshot().playback.options.delivery, 'direct-stream', 'Cancel must preserve the Direct Stream transport selected after incompatibility');
}());


(function subtitleEditorRestartsPendingPreviewAfterColdReopen() {
  var subtitleCallbacks = [];
  var aborted = 0;
  var prepareCount = 0;
  var h = harness({
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadPlayback: function (config, key, session, preferences, callback) {
      var current = playbackFixture();
      current.options.subtitleStreamID = '';
      callback(null, current);
      return { abort: function () {} };
    },
    preparePlayback: function (config, current, options, callback) {
      prepareCount += 1;
      if (prepareCount === 1) { callback(new Error('unsupported codec')); }
      else { callback(null, 'https://stream/' + current.transcodeSession + '/' + Number(options.offset || 0)); }
    },
    loadSubtitleText: function (config, current, track, callback) {
      subtitleCallbacks.push(callback);
      return { abort: function () { aborted += 1; } };
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.root.runNextTimeout();
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  assert.strictEqual(h.controller.openSubtitleEditor({ action: 'set-track', streamId: 's1' }), true);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewLoading, true, 'test setup must have an in-flight editor preview');
  assert.strictEqual(subtitleCallbacks.length, 1, 'test setup must issue one subtitle preview request');
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  h.controller.seekAbsolute(30, { immediate: true, forceRebuild: true, source: 'subtitle-editor-loading-cold-reopen' });
  assert.strictEqual(h.controller.snapshot().subtitleEditor.open, true, 'pending preview must not close the editor during cold reopen');
  assert.strictEqual(aborted, 1, 'cold reopen must abort the preview request bound to the old playback');
  assert.strictEqual(subtitleCallbacks.length, 2, 'cold reopen must restart the pending preview against the new playback');
  subtitleCallbacks[1](null, '1\n00:00:00,000 --> 00:00:02,000\nReloaded\n');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewLoading, false, 'restarted preview must complete normally');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewError, false, 'restarted preview must remain usable');
}());


(function subtitleEditorColdReopenKeepsAssWorkerWarm() {
  var assTrack = { id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/1.ass', language: 'Italiano' };
  var creates = 0;
  var loads = 0;
  var disposes = 0;
  var prepareCount = 0;
  var h;
  function freshPlayback() {
    var current = playbackFixture();
    current.options.subtitleStreamID = 'ass';
    current.subtitleTracks = [assTrack];
    current.mediaVersions[0].subtitleTracks = [assTrack];
    return current;
  }
  h = harness({
    playback: freshPlayback(),
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadPlayback: function (config, key, session, preferences, callback) {
      callback(null, freshPlayback());
      return { abort: function () {} };
    },
    preparePlayback: function (config, current, options, callback) {
      prepareCount += 1;
      if (prepareCount === 1) { callback(new Error('unsupported codec')); }
      else { callback(null, 'https://stream/' + current.transcodeSession + '/' + Number(options.offset || 0)); }
    },
    subtitleRendering: function () { return { srt: true, ass: true }; },
    loadSubtitleText: function (config, current, track, callback) {
      callback(null, '[Script Info]\nTitle: Warm editor reopen');
      return { abort: function () {} };
    },
    AssSubtitleRenderer: {
      create: function () {
        creates += 1;
        return {
          load: function (content, callback) { loads += 1; callback(null); },
          setTime: function () {}, discontinuity: function () {}, setSize: function () {},
          show: function () {}, hide: function () {}, dispose: function () { disposes += 1; }
        };
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.root.runNextTimeout();
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  h.controller.seekAbsolute(30, { immediate: true, forceRebuild: true, source: 'subtitle-editor-ass-cold-reopen' });
  assert.strictEqual(h.controller.snapshot().subtitleEditor.open, true, 'ASS editor must survive the cold reopen');
  assert.strictEqual(creates, 1, 'cold reopen with editor open must reuse the ASS renderer');
  assert.strictEqual(loads, 1, 'cold reopen with editor open must keep the same ASS content warm');
  assert.strictEqual(disposes, 0, 'cold reopen with editor open must not dispose the ASS renderer');
}());

(function internalReopenPreservesPausedPlayback() {
  var h = harness();
  var playsBefore;
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.pause();
  playsBefore = h.video.playCalls;
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 30, internalReopen: true, preservePaused: true });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.video.paused, true, 'internal reopen must preserve a paused playback state');
  assert.strictEqual(h.video.playCalls, playsBefore, 'internal reopen must not issue a native play request when preserving pause');
}());

(function internalReopenKeepsLocalAssRendererWarm() {
  var assTrack = { id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/1.ass', language: 'Italiano' };
  var creates = 0;
  var loads = 0;
  var disposes = 0;
  var h;
  function assPlayback() {
    var playback = playbackFixture();
    playback.options.subtitleStreamID = 'ass';
    playback.subtitleTracks = [assTrack];
    playback.mediaVersions[0].subtitleTracks = [assTrack];
    return playback;
  }
  h = harness({
    playback: assPlayback(),
    loadPlayback: function (config, key, session, preferences, callback) {
      var playback = assPlayback();
      playback.options.playbackMode = preferences && preferences.playbackMode || 'auto';
      playback.options.videoQuality = preferences && preferences.videoQuality || 'original';
      callback(null, playback);
      return { abort: function () {} };
    },
    subtitleRendering: function () { return { srt: true, ass: true }; },
    loadSubtitleText: function (config, current, track, callback) {
      callback(null, '[Script Info]\nTitle: Warm reopen');
      return { abort: function () {} };
    },
    AssSubtitleRenderer: {
      create: function () {
        creates += 1;
        return {
          load: function (content, callback) { loads += 1; callback(null); },
          setTime: function () {}, discontinuity: function () {}, setSize: function () {},
          show: function () {}, hide: function () {}, dispose: function () { disposes += 1; }
        };
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  assert.strictEqual(creates, 1, 'initial local ASS playback must create one renderer');
  assert.strictEqual(loads, 1, 'initial local ASS playback must load the track once');
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 30, internalReopen: true });
  assert.strictEqual(creates, 1, 'internal reopen must reuse the existing ASS renderer');
  assert.strictEqual(loads, 1, 'internal reopen of the same ASS content must keep the worker track warm');
  assert.strictEqual(disposes, 0, 'internal reopen must not dispose the warm ASS renderer');
}());


console.log('Playback controller recovery checks passed');
