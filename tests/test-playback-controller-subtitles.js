'use strict';

var assert = require('assert');
var SubtitleOffsetStore = require('../app/subtitle-offset-store');
var Fixture = require('./helpers/playback-controller-harness');
var harness = Fixture.harness;
var playbackFixture = Fixture.playbackFixture;
var playbackEffectTrace = Fixture.playbackEffectTrace;
var ranges = Fixture.ranges;

(function subtitlePreviewSuppressionAndRestore() {
  var h = harness();
  h.playback.options.subtitleStreamID = 's1';
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('playing');
  var reports = h.timeline.length;
  assert.strictEqual(h.controller.openSubtitleEditor(), true, 'a supported subtitle track must open the synchronization editor');
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 250 });
  h.video.dispatch('pause');
  assert.strictEqual(h.timeline.length, reports, 'subtitle preview must suppress timeline reporting');
  h.root.runAllTimeouts(20);
  h.controller.applySubtitleEditor();
  assert.strictEqual(h.controller.snapshot().subtitleEditor.open, false, 'applying subtitle timing must close the editor');
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 40, 'subtitle apply must rebuild at the captured absolute position');

  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  h.controller.openSubtitleEditor();
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 100 });
  h.root.runAllTimeouts(20);
  h.controller.cancelSubtitleEditor();
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 40, 'subtitle cancel must restore the same captured absolute position');
  assert.ok(h.offsets.some(function (entry) { return entry.offset === 250; }), 'cancel must restore previewed server offsets');
}());

(function chapterStyleAbsoluteSeekRemainsResponsive() {
  var h = harness();
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.controller.seekAbsolute(360, { immediate: true, source: 'chapter' });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  h.controller.seekAbsolute(350, { immediate: true });
  h.video.dispatch('seeked');
  h.controller.seekAbsolute(370, { immediate: true });
  h.video.dispatch('seeked');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 370, 'chapter rebuilds must keep both backward and forward seek input responsive');
}());

(function replacingPlaybackStopsAndClearsPreviousNativeSource() {
  var h = harness();
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('playing');
  h.video.currentTime = 10;
  h.video.dispatch('timeupdate');
  var clears = h.video.sourceClears;
  h.controller.open({ detail: { ratingKey: 'episode-2' }, startOffset: 0 });
  assert.ok(h.video.sourceClears > clears, 'opening a new item must clear the previous native source before preparing the replacement');
  assert.strictEqual(h.video.paused, true, 'opening a replacement item must stop the previous audio immediately');
  assert.ok(h.timeline.some(function (entry) { return entry.state === 'stopped' && entry.seconds === 50; }), 'replacing an item must report the previous absolute position as stopped');
}());

(function closeDoesNotWaitForTimelineNetworkCallback() {
  var finalTimelineCallback = null;
  var closedCallback = null;
  var h = harness({
    sendTimeline: function (config, current, state, milliseconds, callback) {
      if (state === 'stopped') { finalTimelineCallback = callback; }
      else if (callback) { callback(); }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('playing');
  h.controller.close(function (position, reported, ratingKey) {
    closedCallback = { position: position, reported: reported, ratingKey: ratingKey };
  });
  assert.ok(closedCallback, 'closing the player surface must not wait for a Plex network callback');
  assert.strictEqual(closedCallback.position, 40);
  assert.strictEqual(closedCallback.reported, true);
  assert.strictEqual(h.controller.snapshot().active, false);
  assert.strictEqual(h.video.src, '');
  assert.strictEqual(h.closed.length, 0, 'confirmed final-progress callbacks remain asynchronous when Plex has not answered yet');
  finalTimelineCallback();
  assert.deepStrictEqual(h.closed, [{ position: 40, reported: true, ratingKey: 'episode-1' }]);
}());

(function staleAdjacentResolutionCannotReopenAfterClose() {
  var resolver = null;
  var h = harness({ resolveAdjacent: function (direction, callback) { resolver = callback; } });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.controller.startAdjacent(1, function () { throw new Error('a cancelled adjacent request must not complete'); });
  h.controller.close();
  resolver(null, { item: { ratingKey: 'episode-2' }, detail: { ratingKey: 'episode-2' } });
  assert.strictEqual(h.controller.snapshot().active, false, 'a late adjacent resolver must not reopen playback after Back/close');
  assert.strictEqual(h.adjacentStarted.length, 0);
}());

(function externalSubtitleEditorKeepsVerifiedLocalOverlay() {
  var h = harness();
  var preparations;
  var sourceWrites;
  var offsets;
  h.playback.options.subtitleStreamID = 's1';
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  preparations = h.preparations.length;
  sourceWrites = h.video.sourceWrites.length;
  offsets = h.offsets.length;
  assert.strictEqual(h.controller.snapshot().localSubtitle.streamId, 's1', 'the editor must start from the verified local SRT overlay');
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.loop, false, 'Loop 5s must remain opt-in as in the verified editor');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'overlay', 'a verified external SRT must stay on the local preview path');
  assert.strictEqual(h.controller.snapshot().playback.options.localSubtitleOverlay, true, 'opening the editor must not disable the active local overlay');
  assert.strictEqual(h.preparations.length, preparations, 'opening an external subtitle editor must not rebuild the active stream');
  assert.strictEqual(h.video.sourceWrites.length, sourceWrites, 'opening an external subtitle editor must keep the native source untouched');
  h.controller.openSubtitleEditor({ action: 'set-size', size: 125 });
  h.root.tickIntervals();
  assert.strictEqual(h.overlays[h.overlays.length - 1].size, 125, 'the local preview must apply subtitle size changes without rebuilding');
  assert.strictEqual(h.preparations.length, preparations, 'subtitle size changes must not rebuild the active stream');
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 250 });
  h.root.tickIntervals();
  assert.strictEqual(h.overlays[h.overlays.length - 1].offset, 250, 'the local preview must apply the draft offset immediately');
  assert.strictEqual(h.offsets.length, offsets, 'draft offset changes must not write temporary offsets to Plex');
  h.controller.cancelSubtitleEditor(function (error) { assert.ifError(error); });
  assert.strictEqual(h.preparations.length, preparations, 'cancelling a local preview must not rebuild the active stream');
  assert.strictEqual(h.video.sourceWrites.length, sourceWrites, 'cancelling a local preview must keep the native source untouched');
  assert.strictEqual(h.controller.snapshot().localSubtitle.offsetMs, 0, 'cancelling must restore the original local offset');
}());

(function playerSubtitleSizeUpdatesVerifiedLocalOverlayInPlace() {
  var h = harness();
  var preparations;
  h.playback.options.subtitleStreamID = 's1';
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  preparations = h.preparations.length;
  h.controller.changeVersion({ kind: 'settings', subtitleSize: 150 });
  assert.strictEqual(h.controller.snapshot().localSubtitle.size, 150, 'the player size control must update the active local subtitle renderer');
  assert.strictEqual(h.overlays[h.overlays.length - 1].size, 150, 'the resized local subtitle must render immediately');
  assert.strictEqual(h.preparations.length, preparations, 'a local subtitle size change must not rebuild the video stream');
}());

(function externalSubtitleEditorAppliesOffsetWithoutReloading() {
  var h = harness();
  var preparations;
  var sourceWrites;
  h.playback.options.subtitleStreamID = 's1';
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  preparations = h.preparations.length;
  sourceWrites = h.video.sourceWrites.length;
  h.controller.openSubtitleEditor();
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 250 });
  h.controller.applySubtitleEditor({}, function (error) { assert.ifError(error); });
  assert.strictEqual(h.preparations.length, preparations, 'applying an external SRT offset must not rebuild the active stream');
  assert.strictEqual(h.video.sourceWrites.length, sourceWrites, 'applying an external SRT offset must keep the native source untouched');
  assert.ok(h.offsets.some(function (entry) { return entry.id === 's1' && entry.offset === 250; }), 'Apply must persist the final external SRT offset to Plex');
  assert.strictEqual(h.controller.snapshot().localSubtitle.offsetMs, 250, 'Apply must retain the final offset in the active local overlay');
  assert.strictEqual(h.controller.snapshot().playback.options.localSubtitleOverlay, true, 'Apply must retain local subtitle ownership');
}());

(function externalSrtLocalApplyRestoresCapturedPositionAndSettlesDecodedKeyframe() {
  var h = harness({
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  var preparations;
  var sourceWrites;
  h.playback.options.subtitleStreamID = 's1';
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  h.video.currentTime = 40;
  h.video.dispatch('timeupdate');
  assert.strictEqual(h.controller.snapshot().localSubtitle.streamId, 's1', 'the SRT must be owned by the verified local overlay');
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  preparations = h.preparations.length;
  sourceWrites = h.video.sourceWrites.length;
  h.video.currentTime = 75;
  h.video.dispatch('timeupdate');
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 250 });
  h.controller.applySubtitleEditor({}, function (error) { assert.ifError(error); });
  assert.strictEqual(h.preparations.length, preparations, 'Apply must restore the captured editor-open position through the existing in-place Direct Play seek path');
  assert.strictEqual(h.video.sourceWrites.length, sourceWrites, 'Apply must not replace the native source when the verified local SRT stream can stay active');
  assert.strictEqual(h.video.currentTime, 40, 'Apply must seek the existing native stream back to the captured editor-open position');
  h.video.dispatch('seeked');
  h.video.dispatch('waiting');
  h.root.runNextTimeout();
  h.video.dispatch('playing');
  h.video.currentTime = 34;
  h.video.dispatch('timeupdate');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.preparations.length, preparations, 'decoder settlement must not trigger a source rebuild after the in-place Apply seek');
  assert.strictEqual(h.video.sourceWrites.length, sourceWrites, 'decoder settlement must not write a new native source after Apply');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 34, 'Apply restore must adopt the bounded keyframe actually decoded by webOS');
  assert.strictEqual(h.overlays[h.overlays.length - 1].time, 34000, 'the local SRT overlay must converge on the same settled decoder clock');
  assert.deepStrictEqual(playbackEffectTrace(h), {
    sources: ['https://stream/session-1/0'],
    seeks: [40, 75, 40, 34],
    preparations: [
      { offset: 0, delivery: 'direct-play', safeTranscode: false, subtitle: 's1', localSubtitleOverlay: true, session: 'session-1' }
    ],
    timeline: [{ state: 'playing', seconds: 40 }, { state: 'playing', seconds: 40 }],
    overlays: [
      { cues: 1, time: 0, offset: 0, size: 100 },
      { cues: 1, time: 40000, offset: 0, size: 100 },
      { cues: 1, time: 40000, offset: 0, size: 100 },
      { cues: 1, time: 75000, offset: 0, size: 100 },
      { cues: 1, time: 75000, offset: 250, size: 100 },
      { cues: 1, time: 75000, offset: 250, size: 100 },
      { cues: 1, time: 34000, offset: 250, size: 100 }
    ],
    playCalls: 1,
    sourceClears: 1
  }, 'golden local-SRT Apply trace must keep the provisional restore target hidden and render the applied offset only on the settled clock');
}());

(function externalSrtServerApplyRestoresCapturedPlaybackPosition() {
  var h = harness({
    subtitleRendering: function () { return { srt: false, ass: false }; }
  });
  var preparations;
  h.playback.options.subtitleStreamID = 's1';
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  assert.strictEqual(h.controller.snapshot().localSubtitle, null, 'the server SRT path must stay under Plex ownership');
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  preparations = h.preparations.length;
  h.video.currentTime = 15;
  h.video.dispatch('timeupdate');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 55, 'the confirmed playback position must advance while the editor is open');
  h.controller.applySubtitleEditor({}, function (error) { assert.ifError(error); });
  assert.strictEqual(h.preparations.length, preparations + 1, 'server-rendered SRT Apply still requires one final stream rebuild');
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 40, 'the final rebuild must restore the editor-open position');
}());

(function externalSrtLocalCancelRestoresCapturedPositionAndSettlesDecodedKeyframe() {
  var h = harness({
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  var preparations;
  var sourceWrites;
  h.playback.options.subtitleStreamID = 's1';
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  h.video.currentTime = 40;
  h.video.dispatch('timeupdate');
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  preparations = h.preparations.length;
  sourceWrites = h.video.sourceWrites.length;
  h.video.currentTime = 75;
  h.video.dispatch('timeupdate');
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 250 });
  h.controller.cancelSubtitleEditor(function (error) { assert.ifError(error); });
  assert.strictEqual(h.preparations.length, preparations, 'Cancel must restore the captured editor-open position through the existing in-place Direct Play seek path');
  assert.strictEqual(h.video.sourceWrites.length, sourceWrites, 'Cancel must not replace the native source when the verified local SRT stream can stay active');
  assert.strictEqual(h.video.currentTime, 40, 'Cancel must seek the existing native stream back to the captured editor-open position');
  h.video.dispatch('seeked');
  h.video.dispatch('waiting');
  h.root.runNextTimeout();
  h.video.dispatch('playing');
  h.video.currentTime = 34;
  h.video.dispatch('timeupdate');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.preparations.length, preparations, 'Cancel decoder settlement must not trigger a rebuild after the in-place seek');
  assert.strictEqual(h.video.sourceWrites.length, sourceWrites, 'Cancel decoder settlement must not replace the native source');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 34, 'Cancel restore must adopt the bounded keyframe actually decoded by webOS');
  assert.strictEqual(h.overlays[h.overlays.length - 1].time, 34000, 'cancelled SRT preview must converge on the settled decoder clock');
  assert.deepStrictEqual(playbackEffectTrace(h), {
    sources: ['https://stream/session-1/0'],
    seeks: [40, 75, 40, 34],
    preparations: [
      { offset: 0, delivery: 'direct-play', safeTranscode: false, subtitle: 's1', localSubtitleOverlay: true, session: 'session-1' }
    ],
    timeline: [{ state: 'playing', seconds: 40 }, { state: 'playing', seconds: 40 }],
    overlays: [
      { cues: 1, time: 0, offset: 0, size: 100 },
      { cues: 1, time: 40000, offset: 0, size: 100 },
      { cues: 1, time: 40000, offset: 0, size: 100 },
      { cues: 1, time: 75000, offset: 0, size: 100 },
      { cues: 1, time: 75000, offset: 250, size: 100 },
      { cues: 1, time: 75000, offset: 0, size: 100 },
      { cues: 1, time: 34000, offset: 0, size: 100 }
    ],
    playCalls: 1,
    sourceClears: 1
  }, 'golden local-SRT Cancel trace must keep the provisional restore target hidden and render only the settled clock without source replacement');
}());

(function externalSrtOverlayCanKeepAutomaticDirectPlaybackAndUseAbsoluteClock() {
  var h = harness({
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  h.playback.options.subtitleStreamID = 's1';
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.controller.snapshot().localSubtitle.streamId, 's1', 'an external SRT must be loaded for the local overlay path');
  assert.strictEqual(h.preparations[0].delivery, 'direct-play', 'a readable external SRT must not force Automatic playback into transcoding');
  h.video.dispatch('playing');
  h.video.currentTime = 42;
  h.video.dispatch('timeupdate');
  assert.strictEqual(h.overlays[h.overlays.length - 1].time, Math.round(h.controller.snapshot().positionSeconds * 1000), 'the overlay must use the same absolute clock as the timeline');
}());

(function externalSrtOverlayIgnoresTransientNativeResetAfterBuffer() {
  var h = harness({
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  h.playback.options.subtitleStreamID = 's1';
  h.playback.subtitleTracks[0].offset = 250;
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  h.video.currentTime = 10;
  h.video.dispatch('timeupdate');
  h.video.dispatch('waiting');
  h.root.runNextTimeout();
  h.video.currentTime = 0;
  h.video.dispatch('timeupdate');
  h.video.dispatch('playing');
  h.video.currentTime = 1;
  h.video.dispatch('timeupdate');
  assert.strictEqual(h.overlays[h.overlays.length - 1].time, 10000, 'a local external subtitle overlay must remain on the confirmed clock during a transient native reset');
  assert.strictEqual(h.overlays[h.overlays.length - 1].offset, 250, 'buffering recovery must not mutate the subtitle offset');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 10, 'the public playback clock must retain its monotonic buffering position');
}());

(function externalSrtOverlayFollowsNativeClockAfterStableBufferRecovery() {
  var h = harness({
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  h.playback.options.subtitleStreamID = 's1';
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  h.video.currentTime = 10;
  h.video.dispatch('timeupdate');
  h.video.dispatch('waiting');
  h.root.runNextTimeout();
  h.video.currentTime = 10;
  h.video.dispatch('playing');
  h.video.currentTime = 11;
  h.video.dispatch('timeupdate');
  assert.strictEqual(h.overlays[h.overlays.length - 1].time, 11000, 'a stable native clock must continue to drive the local external subtitle overlay after buffering');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 11, 'a stable native clock must advance the public position after buffering');
}());

(function optionalAssOverlayUsesAbsoluteClockWithoutNativeOwnership() {
  var rendererInstance;
  var playback = playbackFixture();
  var h;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/1.ass' }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    AssSubtitleRenderer: {
      create: function () {
        rendererInstance = {
          load: function (content, callback) { rendererInstance.content = content; callback(null); },
          setTime: function (time, paused) { rendererInstance.time = time; rendererInstance.paused = paused; },
          discontinuity: function () { rendererInstance.discontinuities = Number(rendererInstance.discontinuities || 0) + 1; },
          show: function () { rendererInstance.visible = true; },
          hide: function () { rendererInstance.visible = false; },
          dispose: function () { rendererInstance.disposed = true; }
        };
        return rendererInstance;
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(h.controller.snapshot().localSubtitle.rendererType, 'ass', 'enabled ASS rendering must use the local renderer');
  assert.strictEqual(h.preparations[0].delivery, 'direct-play', 'local ASS rendering must not force a transcode attempt');
  h.video.dispatch('playing');
  h.video.currentTime = 52;
  h.video.dispatch('timeupdate');
  assert.strictEqual(rendererInstance.time, 52, 'ASS rendering must receive the confirmed absolute clock');
  assert.strictEqual(rendererInstance.visible, true, 'ASS rendering must be visible while the player is active');
  h.controller.seekAbsolute(20, { immediate: true, source: 'remote' });
  assert.strictEqual(rendererInstance.discontinuities, 1,
    'an explicit timeline seek must invalidate ASS monotonic presentation before an earlier clock becomes valid');
  h.controller.close();
  assert.strictEqual(rendererInstance.disposed, true, 'closing playback must dispose the ASS renderer');
}());

(function debouncedSeekInvalidatesAssPresentationOnlyWhenTheSeekCommits() {
  var rendererInstance;
  var playback = playbackFixture();
  var h;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/1.ass' }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    AssSubtitleRenderer: {
      create: function () {
        rendererInstance = {
          load: function (content, callback) { rendererInstance.content = content; callback(null); },
          setTime: function (time, paused) { rendererInstance.time = time; rendererInstance.paused = paused; },
          discontinuity: function (time) {
            rendererInstance.discontinuities = Number(rendererInstance.discontinuities || 0) + 1;
            rendererInstance.discontinuityTime = time;
          },
          show: function () { rendererInstance.visible = true; },
          hide: function () { rendererInstance.visible = false; },
          dispose: function () { rendererInstance.disposed = true; }
        };
        return rendererInstance;
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('playing');
  h.video.currentTime = 52;
  h.video.dispatch('timeupdate');
  h.controller.seekAbsolute(20, { source: 'remote' });
  assert.strictEqual(Number(rendererInstance.discontinuities || 0), 0,
    'a debounced seek must not open the new ASS presentation epoch while the old native timeline can still emit clock samples');
  h.video.currentTime = 53;
  h.video.dispatch('timeupdate');
  assert.strictEqual(Number(rendererInstance.discontinuities || 0), 0,
    'old-position clock samples during the seek debounce must remain in the old ASS presentation epoch');
  h.root.runLatestTimeout();
  assert.strictEqual(rendererInstance.discontinuities, 1,
    'the ASS presentation epoch must be invalidated exactly when the debounced seek commits');
  assert.strictEqual(rendererInstance.discontinuityTime, 20,
    'the committed seek must seed the new ASS epoch with the requested absolute target');
}());

(function pendingAssRendererPublishesLocalLoadingOwnership() {
  var completeRendererLoad;
  var playback = playbackFixture();
  var h;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/1.ass' }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    AssSubtitleRenderer: {
      create: function () {
        return {
          load: function (_content, callback) { completeRendererLoad = callback; },
          setTime: function () {}, show: function () {}, hide: function () {}, dispose: function () {}
        };
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(h.controller.snapshot().subtitleRenderMode, 'local-loading',
    'a selected subtitle waiting for its local renderer must publish Local loading ownership');
  completeRendererLoad(null);
  assert.strictEqual(h.controller.snapshot().subtitleRenderMode, 'local',
    'a ready local renderer must publish Local ownership');
}());

(function lateLocalAssRendererFailureFallsBackToPlexPlayback() {
  var rendererOptions;
  var rendererInstance;
  var playback = playbackFixture();
  var h;
  var preparationsBeforeFailure;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/1.ass' }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    AssSubtitleRenderer: {
      create: function (options) {
        rendererOptions = options;
        rendererInstance = {
          load: function (content, callback) { callback(null); },
          setTime: function () {}, show: function () {}, hide: function () {},
          dispose: function () { rendererInstance.disposed = true; }
        };
        return rendererInstance;
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(h.controller.snapshot().localSubtitle.rendererType, 'ass', 'local ASS must own subtitles before a late renderer failure');
  assert.strictEqual(typeof rendererOptions.onRuntimeError, 'function', 'the local ASS renderer must receive an owned runtime failure callback');
  preparationsBeforeFailure = h.preparations.length;
  rendererOptions.onRuntimeError(new Error('late ASS worker failure'));
  assert.strictEqual(h.controller.snapshot().localSubtitle, null, 'a dead ASS worker must release its local subtitle payload');
  assert.strictEqual(h.controller.snapshot().playback.options.localSubtitleOverlay, false, 'a dead ASS worker must release local subtitle ownership');
  assert.strictEqual(h.preparations.length, preparationsBeforeFailure + 1, 'a dead local ASS worker must immediately re-plan playback through Plex');
  assert.strictEqual(h.preparations[h.preparations.length - 1].localSubtitleOverlay, false, 'the fallback playback plan must not keep the dead local overlay');
  assert.strictEqual(h.preparations[h.preparations.length - 1].subtitle, 'ass', 'Plex fallback must preserve the selected ASS stream');
  assert.strictEqual(h.errors[h.errors.length - 1].message, 'late ASS worker failure', 'late renderer failure must remain visible to diagnostics');
  assert.strictEqual(h.controller.snapshot().playback.diagnosticRecoveryTrace, 'DP > ASSERR[late ASS worker failure] > FALLBACK[selection:tracks] > TC',
    'late ASS runtime failure must be explicit in the TV-visible recovery trace before Plex fallback');
}());

(function assSubtitleEditorOffsetsActiveLocalRendererWithoutReloadingVideo() {
  var rendererInstance;
  var playback = playbackFixture();
  var h;
  var preparations;
  var sourceWrites;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/ass.ass', offset: 0 }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    AssSubtitleRenderer: {
      create: function () {
        rendererInstance = {
          load: function (content, callback) { rendererInstance.content = content; callback(null); },
          setTime: function (time, paused) { rendererInstance.time = time; rendererInstance.paused = paused; },
          show: function () { rendererInstance.visible = true; },
          hide: function () { rendererInstance.visible = false; },
          dispose: function () { rendererInstance.disposed = true; }
        };
        return rendererInstance;
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('playing');
  h.video.currentTime = 52;
  h.video.dispatch('timeupdate');
  preparations = h.preparations.length;
  sourceWrites = h.video.sourceWrites.length;
  assert.strictEqual(h.controller.openSubtitleEditor(), true, 'an active local ASS track must open the advanced timing editor');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'ass', 'ASS timing preview must stay on the JavascriptSubtitlesOctopus path');
  assert.strictEqual(h.preparations.length, preparations, 'opening the editor for an active local ASS track must not rebuild video');
  assert.strictEqual(h.video.sourceWrites.length, sourceWrites, 'opening the editor for an active local ASS track must keep the native source untouched');
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 500 });
  h.root.tickIntervals();
  assert.strictEqual(rendererInstance.time, 51.5, 'positive ASS draft offsets must delay the renderer without changing video.currentTime');
  assert.strictEqual(h.video.currentTime, 52, 'ASS draft offset must never seek the native video');
  h.controller.applySubtitleEditor({}, function (error) { assert.ifError(error); });
  assert.strictEqual(h.controller.snapshot().localSubtitle.rendererType, 'ass', 'Apply must keep local ASS rendering active');
  assert.strictEqual(h.controller.snapshot().localSubtitle.offsetMs, 500, 'Apply must retain the final ASS offset');
  assert.strictEqual(h.preparations.length, preparations, 'applying an active local ASS offset must not rebuild video');
  assert.strictEqual(h.video.sourceWrites.length, sourceWrites, 'applying an active local ASS offset must keep the native source untouched');
  assert.strictEqual(h.controller.openSubtitleEditor(), true, 'the applied ASS renderer state must remain reusable by a later editor session');
  h.controller.cancelSubtitleEditor(function (error) { assert.ifError(error); });
  assert.strictEqual(h.preparations.length, preparations, 'reopening and cancelling an unchanged applied ASS track must not rebuild video');
  assert.strictEqual(h.video.sourceWrites.length, sourceWrites, 'reopening and cancelling an unchanged applied ASS track must keep the native source untouched');
  assert.deepStrictEqual(h.offsets, [{ id: 'ass', offset: 500 }],
    'external ASS offset must persist through Plex while the active renderer stays local');
}());

(function automaticAssEditorCanPreviewLocallyAndCancelBackToPlexRendering() {
  var rendererInstance;
  var playback = playbackFixture();
  var h;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/ass.ass', offset: 0 }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: false }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    AssSubtitleRenderer: {
      create: function () {
        rendererInstance = {
          load: function (content, callback) { rendererInstance.content = content; callback(null); },
          setTime: function (time) { rendererInstance.time = time; },
          show: function () { rendererInstance.visible = true; },
          hide: function () { rendererInstance.visible = false; },
          dispose: function () { rendererInstance.disposed = true; }
        };
        return rendererInstance;
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(h.controller.snapshot().localSubtitle, null, 'disabled ASS local rendering must begin on the normal Plex path');
  assert.strictEqual(h.preparations[0].delivery, 'transcode', 'Automatic mode may initially use Plex transcoding when ASS local rendering is disabled');
  assert.strictEqual(h.controller.openSubtitleEditor(), true, 'Automatic mode must allow ASS timing preview even when local ASS rendering was disabled before opening');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'server', 'advanced ASS preview must respect the disabled global ASS renderer');
  assert.ok(!rendererInstance, 'opening advanced ASS settings must not start libass while global ASS rendering is disabled');
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 300 });
  h.controller.cancelSubtitleEditor(function (error) { assert.ifError(error); });
  assert.strictEqual(h.controller.snapshot().localSubtitle, null, 'Cancel must restore Plex ownership when local ASS rendering was originally disabled');
  assert.strictEqual(h.controller.snapshot().playback.options.subtitleStreamID, 'ass', 'Cancel must restore the original ASS stream selection');
  assert.ok(!rendererInstance, 'Cancel must not need to dispose a renderer that global settings never allowed to start');
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'transcode', 'Cancel must restore the original Automatic/Plex delivery path');
}());

(function automaticExternalAssApplyKeepsTheEstablishedLocalPreviewStream() {
  var playback = playbackFixture();
  var h;
  var preparationsAfterOpen;
  var sourceWritesAfterOpen;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/1.ass', offset: 0 }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadSubtitleText: function (config, current, track, callback) {
      callback(null, '[Script Info]\nTitle: External ASS');
      return { abort: function () {} };
    },
    AssSubtitleRenderer: {
      create: function () {
        return {
          load: function (content, callback) { callback(null); },
          setTime: function () {}, show: function () {}, hide: function () {}, dispose: function () {}
        };
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(h.controller.openSubtitleEditor(), true, 'external ASS must establish its temporary local preview');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'ass');
  assert.strictEqual(h.controller.snapshot().playback.options.localSubtitleOverlay, true,
    'the established external ASS preview must own subtitle rendering locally');
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  preparationsAfterOpen = h.preparations.length;
  sourceWritesAfterOpen = h.video.sourceWrites.length;
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 300 });
  assert.strictEqual(h.preparations.length, preparationsAfterOpen,
    'editing a local ASS offset must update the renderer without preparing another video stream');
  assert.strictEqual(h.video.sourceWrites.length, sourceWritesAfterOpen,
    'editing a local ASS offset must not rewrite the native video source');
  h.controller.applySubtitleEditor({}, function (error) { assert.ifError(error); });
  assert.strictEqual(h.controller.snapshot().localSubtitle.offsetMs, 300, 'Apply must retain the live external ASS offset');
  assert.strictEqual(h.preparations.length, preparationsAfterOpen,
    'Apply must keep the local preview stream that the editor already established');
  assert.strictEqual(h.video.sourceWrites.length, sourceWritesAfterOpen,
    'Apply must not rewrite the native video source after the local ASS preview is active');
}());

(function globalAssEnableInOpenEditorStopsTheOldStreamBeforePreparingLocalPreview() {
  var rendering = { srt: false, ass: false };
  var playback = playbackFixture();
  var delayedPreparation = null;
  var preparationCount = 0;
  var h;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/1.ass', offset: 0 }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return rendering; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    preparePlayback: function (config, current, options, callback) {
      preparationCount += 1;
      if (preparationCount === 1) { callback(null, 'https://stream/initial'); return null; }
      delayedPreparation = callback;
      return { abort: function () {} };
    },
    loadSubtitleText: function (config, current, track, callback) {
      callback(null, '[Script Info]\nTitle: External ASS');
      return { abort: function () {} };
    },
    AssSubtitleRenderer: {
      create: function () {
        return {
          load: function (content, callback) { callback(null); },
          setTime: function () {}, show: function () {}, hide: function () {}, dispose: function () {}
        };
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'server', 'disabled global ASS must keep the editor on the Plex path');
  rendering.ass = true;
  assert.strictEqual(h.controller.openSubtitleEditor({ action: 'set-rendering' }), true);
  assert.ok(delayedPreparation, 'confirmed global ASS enable must prepare one clean local-overlay stream');
  assert.strictEqual(h.video.paused, true, 'the old Plex stream must stop before the local-overlay replacement starts buffering');
}());

(function activeLocalAssApplyCanReturnToPlexRendering() {
  var rendererInstance;
  var playback = playbackFixture();
  var h;
  var applyError = null;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/ass.ass', offset: 0 }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    AssSubtitleRenderer: {
      create: function () {
        rendererInstance = {
          load: function (content, callback) { callback(null); },
          setTime: function () {}, show: function () {}, hide: function () {},
          dispose: function () { rendererInstance.disposed = true; }
        };
        return rendererInstance;
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(h.controller.snapshot().localSubtitle.rendererType, 'ass', 'the selected ASS must begin under Local ownership');
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  assert.strictEqual(h.controller.applySubtitleEditor({ rendering: { srt: false, ass: false } }, function (error) { applyError = error || null; }), true,
    'Apply must accept an explicit Local ASS disable');
  assert.ifError(applyError);
  assert.strictEqual(h.controller.snapshot().localSubtitle, null, 'disabling Local ASS must release the active local payload immediately');
  assert.strictEqual(h.controller.snapshot().playback.options.localSubtitleOverlay, false, 'disabling Local ASS must return subtitle ownership to Plex');
  assert.strictEqual(h.preparations[h.preparations.length - 1].localSubtitleOverlay, false, 'the restored playback plan must no longer advertise a local subtitle overlay');
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'transcode', 'returning ASS ownership to Plex must start the new Automatic transcode plan instead of reusing the old Direct source');
  assert.strictEqual(rendererInstance.disposed, true, 'the Local ASS renderer must be disposed when Plex regains subtitle ownership');
}());

(function externalLocalAssApplyPersistsOffsetToPlex() {
  var rendererInstance;
  var playback = playbackFixture();
  var h;
  playback.options.subtitleStreamID = 'ass-external';
  playback.subtitleTracks = [{ id: 'ass-external', format: 'ass', codec: 'ass', external: true, key: '/subtitles/external.ass', offset: 0 }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    AssSubtitleRenderer: {
      create: function () {
        rendererInstance = {
          load: function (content, callback) { rendererInstance.content = content; callback(null); },
          setTime: function () {}, show: function () {}, hide: function () {}, dispose: function () {}
        };
        return rendererInstance;
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(h.controller.snapshot().localSubtitle.rendererType, 'ass', 'external ASS must begin under Local ownership when Local ASS rendering is enabled');
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 500 });
  h.controller.applySubtitleEditor({}, function (error) { assert.ifError(error); });
  assert.deepStrictEqual(h.offsets, [{ id: 'ass-external', offset: 500 }],
    'Apply must persist a Local external ASS offset through Plex so the value survives a later media reload');
  assert.strictEqual(h.controller.snapshot().localSubtitle.offsetMs, 500, 'the active Local ASS overlay must retain the persisted offset');
}());

(function automaticAssEditorApplyReplansForLocalDirectPlayback() {
  var rendererInstance;
  var rendering = { srt: false, ass: false };
  var playback = playbackFixture();
  var h;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/ass.ass', offset: 0 }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return rendering; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    AssSubtitleRenderer: {
      create: function () {
        rendererInstance = {
          load: function (content, callback) { rendererInstance.content = content; callback(null); },
          setTime: function (time) { rendererInstance.time = time; },
          show: function () { rendererInstance.visible = true; },
          hide: function () { rendererInstance.visible = false; },
          dispose: function () { rendererInstance.disposed = true; }
        };
        return rendererInstance;
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(h.preparations[0].delivery, 'transcode', 'ASS on the Plex-owned Automatic path must begin transcoded');
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'server');
  rendering.ass = true;
  h.controller.openSubtitleEditor({ action: 'set-rendering' });
  assert.strictEqual(h.preparations[h.preparations.length - 1].localSubtitleOverlay, true,
    'enabling the global ASS renderer from the editor must re-plan playback with local subtitle ownership');
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 400 });
  h.controller.applySubtitleEditor({}, function (error) { assert.ifError(error); });
  assert.strictEqual(h.controller.snapshot().localSubtitle.rendererType, 'ass', 'Apply must retain JavascriptSubtitlesOctopus ownership');
  assert.strictEqual(h.controller.snapshot().localSubtitle.offsetMs, 400, 'Apply must retain the ASS draft offset');
  assert.strictEqual(h.preparations[h.preparations.length - 1].localSubtitleOverlay, true, 'Apply must retain local ASS ownership in the resulting playback plan');
  assert.strictEqual(h.preparations[h.preparations.length - 1].subtitle, 'ass', 'the direct plan must preserve the selected ASS stream identity');
  assert.strictEqual(h.preparations[h.preparations.length - 1].localSubtitleOverlay, true, 'the direct plan must keep ASS owned by the local renderer');
}());


(function globalAssDisableReplansPreviewAndRestoresBackwardSeek() {
  var rendering = { srt: false, ass: true };
  var playback = playbackFixture();
  var rendererInstance;
  var h;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/ass.ass', offset: 0 }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return rendering; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    AssSubtitleRenderer: {
      create: function () {
        rendererInstance = {
          load: function (content, callback) { callback(null); },
          setTime: function () {}, show: function () {}, hide: function () {},
          dispose: function () { rendererInstance.disposed = true; }
        };
        return rendererInstance;
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 900 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  assert.strictEqual(h.preparations[0].delivery, 'direct-play', 'enabled global ASS must start on the local Direct Play plan');
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  rendering.ass = false;
  assert.strictEqual(h.controller.openSubtitleEditor({ action: 'set-rendering' }), true);
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'transcode',
    'disabling ASS globally inside the editor must derive a fresh Plex-owned transcode plan');
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 900,
    'renderer replanning must preserve the absolute editor position');
  h.controller.cancelSubtitleEditor(function (error) { assert.ifError(error); });
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'transcode',
    'returning from the editor after global ASS disable must keep the fresh transcode plan');
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 900,
    'returning from the editor must restore the captured absolute position');
  assert.strictEqual(h.controller.seekAbsolute(700, { immediate: true }), true);
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 700,
    'after global ASS disable, a backward seek before the current stream offset must rebuild at the requested absolute target');
}());

(function globalSrtDisableReplansPreviewAndRestoresBackwardSeek() {
  var rendering = { srt: true, ass: false };
  var playback = playbackFixture();
  var h;
  playback.options.subtitleStreamID = 's1';
  h = harness({
    playback: playback,
    subtitleRendering: function () { return rendering; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 900 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  assert.strictEqual(h.preparations[0].delivery, 'direct-play', 'enabled global SRT rendering must start on the local Direct Play plan');
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  rendering.srt = false;
  assert.strictEqual(h.controller.openSubtitleEditor({ action: 'set-rendering' }), true);
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'transcode',
    'disabling SRT globally inside the editor must derive a fresh Plex-owned transcode plan');
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 900,
    'SRT renderer replanning must preserve the absolute editor position');
  h.controller.cancelSubtitleEditor(function (error) { assert.ifError(error); });
  assert.strictEqual(h.controller.seekAbsolute(700, { immediate: true }), true);
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 700,
    'after global SRT disable, backward seek must remain available below the previous stream offset');
}());

(function globalAssEnableReplansPreviewBackToDirectPlay() {
  var rendering = { srt: false, ass: false };
  var playback = playbackFixture();
  var h;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/ass.ass', offset: 0 }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return rendering; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    AssSubtitleRenderer: { create: function () { return { load: function (content, callback) { callback(null); }, setTime: function () {}, show: function () {}, hide: function () {}, dispose: function () {} }; } }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 900 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  assert.strictEqual(h.preparations[0].delivery, 'transcode');
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  rendering.ass = true;
  h.controller.openSubtitleEditor({ action: 'set-rendering' });
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-play',
    'enabling ASS globally inside the editor must derive a fresh local Direct Play plan');
  assert.strictEqual(h.preparations[h.preparations.length - 1].localSubtitleOverlay, true);
}());

(function globalSrtEnableReplansPreviewBackToDirectPlay() {
  var rendering = { srt: false, ass: false };
  var playback = playbackFixture();
  var h;
  playback.options.subtitleStreamID = 's1';
  h = harness({
    playback: playback,
    subtitleRendering: function () { return rendering; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 900 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  assert.strictEqual(h.preparations[0].delivery, 'transcode');
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  rendering.srt = true;
  h.controller.openSubtitleEditor({ action: 'set-rendering' });
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-play',
    'enabling SRT globally inside the editor must derive a fresh local Direct Play plan');
  assert.strictEqual(h.preparations[h.preparations.length - 1].subtitle, '',
    'local SRT preview must remove the server subtitle stream from the fresh Direct Play plan');
}());

(function globalSrtEnableKeepsForcedTranscodeServerOwned() {
  var rendering = { srt: false, ass: false };
  var playback = playbackFixture();
  var h;
  playback.options.subtitleStreamID = 's1';
  playback.options.playbackMode = 'transcode';
  h = harness({
    playback: playback,
    subtitleRendering: function () { return rendering; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 900 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  assert.strictEqual(h.preparations[0].delivery, 'transcode');
  assert.strictEqual(h.controller.openSubtitleEditor(), true,
    'external SRT timing editor must remain available while Force Transcode owns playback');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'server');
  rendering.srt = true;
  h.controller.openSubtitleEditor({ action: 'set-rendering' });
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'transcode',
    'enabling global SRT rendering must not override an explicit Force Transcode request');
  assert.strictEqual(h.preparations[h.preparations.length - 1].localSubtitleOverlay, false,
    'Force Transcode must keep SRT server-owned even when the global local renderer is enabled');
  assert.strictEqual(h.preparations[h.preparations.length - 1].subtitle, 's1',
    'Force Transcode must preserve the selected server subtitle stream');
}());

(function advancedAssEditorSeekPreviewClockReleasesSettledKeyframeWithoutTimeupdate() {
  var playback = playbackFixture();
  var rendererInstance;
  var h;
  playback.resumePosition = 0;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/ass.ass', offset: 0 }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadSubtitleText: function (_config, _current, _track, callback) {
      callback(null, '[Script Info]\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:30:00.00,Default,,0,0,0,,Hello');
      return { abort: function () {} };
    },
    AssSubtitleRenderer: {
      create: function () {
        rendererInstance = {
          visible: false,
          load: function (_content, callback) { callback(null); },
          setTime: function (time) { rendererInstance.time = time; },
          discontinuity: function (time) { rendererInstance.discontinuityTime = time; },
          show: function () { rendererInstance.visible = true; },
          hide: function () { rendererInstance.visible = false; },
          dispose: function () {}
        };
        return rendererInstance;
      }
    }
  });
  h.video.seekable = ranges([[0, 1100]]);
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 600 });
  h.video.dispatch('playing');
  h.video.currentTime = 600;
  h.video.dispatch('timeupdate');
  assert.strictEqual(h.controller.openSubtitleEditor(), true, 'test setup must open the local ASS editor');
  assert.strictEqual(rendererInstance.visible, true, 'test setup must start with a visible ASS preview');

  assert.strictEqual(h.controller.openSubtitleEditor({ action: 'seek', delta: 10 }), true);
  h.root.runLatestTimeout();
  assert.strictEqual(rendererInstance.discontinuityTime, 610,
    'editor seek must reset the active ASS preview timeline at the requested absolute target');
  assert.strictEqual(rendererInstance.visible, false, 'editor seek must hide the provisional target subtitle');
  h.video.dispatch('seeking');
  h.video.dispatch('seeked');
  h.root.tickIntervals();
  assert.strictEqual(rendererInstance.visible, false,
    'the editor preview clock must not expose the provisional seek target before decoder settlement');
  h.video.currentTime = 604;

  h.root.tickIntervals();
  assert.strictEqual(rendererInstance.discontinuityTime, 604,
    'editor keyframe settlement must reset the active ASS preview timeline to the accepted decoder clock');
  assert.strictEqual(rendererInstance.visible, true,
    'the 50ms editor preview clock must release the subtitle gate once webOS exposes the settled keyframe, even without timeupdate');
  assert.strictEqual(rendererInstance.time, 604,
    'the first visible editor subtitle after seek must use the settled native keyframe clock');
}());

(function assEditorSizeUpdatesTemporaryLocalRendererInPlace() {
  var sizes = [];
  var playback = playbackFixture();
  var h;
  var preparations;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/ass.ass', offset: 0 }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadSubtitleText: function (config, current, track, callback) {
      callback(null, '[Script Info]\nTitle: ASS size');
      return { abort: function () {} };
    },
    AssSubtitleRenderer: {
      create: function () {
        return {
          load: function (content, callback) { callback(null); },
          setSize: function (size) { sizes.push(size); },
          setTime: function () {}, show: function () {}, hide: function () {}, dispose: function () {}
        };
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(h.controller.openSubtitleEditor(), true, 'ASS editor must open a temporary local renderer in Automatic mode');
  preparations = h.preparations.length;
  h.controller.openSubtitleEditor({ action: 'set-size', size: 150 });
  assert.strictEqual(sizes[sizes.length - 1], 150, 'advanced ASS size changes must reach the temporary local renderer immediately');
  assert.strictEqual(h.preparations.length, preparations, 'advanced ASS size changes must not rebuild the active video stream');
}());

(function externalAssEditorFallsBackToPlexWhenRawPreviewLoadFails() {
  var playback = playbackFixture();
  var h;
  var applyError = null;
  var preparationsBeforeOffset;
  var sourceWritesBeforeOffset;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/1.ass', offset: 0 }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadSubtitleText: function (config, current, track, callback) {
      callback(new Error('raw ASS fetch failed'));
      return { abort: function () {} };
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  assert.strictEqual(h.controller.openSubtitleEditor(), true, 'external ASS must still open the advanced subtitle editor when raw preview loading fails');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'server', 'raw external ASS preview failure must fall back to Plex rendering');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.status, '', 'Plex fallback must keep the editor usable instead of publishing preview failure');
  assert.strictEqual(h.controller.snapshot().playback.options.subtitleStreamID, 'ass', 'Plex fallback must restore the selected ASS stream after raw preview failure');
  assert.strictEqual(h.controller.snapshot().playback.options.localSubtitleOverlay, false, 'raw preview fallback must release local ASS ownership');
  preparationsBeforeOffset = h.preparations.length;
  sourceWritesBeforeOffset = h.video.sourceWrites.length;
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 300 });
  h.root.runNextTimeout();
  assert.deepStrictEqual(h.offsets, [{ id: 'ass', offset: 300 }], 'external ASS offset preview must remain available through Plex after raw preview failure');
  assert.strictEqual(h.preparations.length, preparationsBeforeOffset,
    'Plex offset updates must apply to the active session without preparing another stream');
  assert.strictEqual(h.video.sourceWrites.length, sourceWritesBeforeOffset,
    'Plex offset updates must not rewrite the active video source');
  assert.strictEqual(h.controller.applySubtitleEditor({}, function (error) { applyError = error || null; }), true, 'Apply must remain available after raw ASS preview fallback');
  assert.ifError(applyError);
  assert.strictEqual(playback.subtitleTracks[0].offset, 300, 'Apply must retain the final external ASS offset after raw preview fallback');
}());

(function externalAssEditorFallsBackToPlexWhenLocalPreviewRendererFails() {
  var playback = playbackFixture();
  var h;
  var applyError = null;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/1.ass', offset: 0 }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadSubtitleText: function (config, current, track, callback) {
      callback(null, '[Script Info]\nTitle: External ASS');
      return { abort: function () {} };
    },
    AssSubtitleRenderer: {
      create: function () {
        return {
          load: function (content, callback) { callback(new Error('fallback font unavailable')); },
          setTime: function () {}, show: function () {}, hide: function () {}, dispose: function () {}
        };
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  assert.strictEqual(h.controller.openSubtitleEditor(), true, 'external ASS must still open the advanced subtitle editor');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'server', 'a failed local ASS preview must fall back to Plex rendering for an external ASS file');
  assert.strictEqual(h.controller.snapshot().playback.options.subtitleStreamID, 'ass', 'Plex fallback must restore the selected ASS stream instead of leaving subtitles disabled');
  assert.strictEqual(h.controller.snapshot().playback.options.localSubtitleOverlay, false, 'Plex fallback must release local ASS overlay ownership');
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 300 });
  h.root.runNextTimeout();
  assert.deepStrictEqual(h.offsets, [{ id: 'ass', offset: 300 }], 'external ASS draft offset must use the established Plex preview offset path after fallback');
  assert.strictEqual(h.controller.applySubtitleEditor({}, function (error) { applyError = error || null; }), true, 'Apply must remain available after external ASS preview falls back to Plex');
  assert.ifError(applyError);
  assert.strictEqual(playback.subtitleTracks[0].offset, 300, 'Apply must retain the final external ASS offset on the selected Plex stream');
  assert.strictEqual(h.controller.snapshot().playback.options.localSubtitleOverlay, false, 'Apply after fallback must keep external ASS rendering under Plex ownership');
}());

(function externalAssEditorFallsBackToPlexAfterLateLocalRendererFailure() {
  var rendererOptions;
  var playback = playbackFixture();
  var h;
  var preparationsBeforeFailure;
  var applyError = null;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/1.ass', offset: 0 }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadSubtitleText: function (config, current, track, callback) {
      callback(null, '[Script Info]\nTitle: Late external ASS failure');
      return { abort: function () {} };
    },
    AssSubtitleRenderer: {
      create: function (options) {
        rendererOptions = options;
        return {
          load: function (content, callback) { callback(null); },
          setTime: function () {}, show: function () {}, hide: function () {}, dispose: function () {}
        };
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(h.controller.openSubtitleEditor(), true, 'external ASS editor must open with a local preview before a late renderer failure');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'ass', 'successful local ASS startup must own the initial editor preview');
  preparationsBeforeFailure = h.preparations.length;
  rendererOptions.onRuntimeError(new Error('late editor ASS worker failure'));
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'server', 'late external ASS renderer failure must fall back to Plex preview');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.status, '', 'successful Plex fallback must not leave the advanced editor in preview error');
  assert.strictEqual(h.controller.snapshot().playback.options.subtitleStreamID, 'ass', 'late ASS fallback must restore the selected Plex subtitle stream');
  assert.strictEqual(h.controller.snapshot().playback.options.localSubtitleOverlay, false, 'late ASS fallback must release local overlay ownership');
  assert.strictEqual(h.preparations.length, preparationsBeforeFailure + 1, 'late ASS editor fallback must rebuild the preview through Plex once');
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 200 });
  h.root.runNextTimeout();
  assert.deepStrictEqual(h.offsets, [{ id: 'ass', offset: 200 }], 'offset preview must remain usable after a late renderer fallback');
  assert.strictEqual(h.controller.applySubtitleEditor({}, function (error) { applyError = error || null; }), true, 'Apply must remain available after a late external ASS renderer fallback');
  assert.ifError(applyError);
}());

(function lateExternalAssFallbackPersistsExistingLocalDraftOnApply() {
  var rendererOptions;
  var playback = playbackFixture();
  var h;
  var applyError = null;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/1.ass', offset: 0 }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadSubtitleText: function (config, current, track, callback) {
      callback(null, '[Script Info]\nTitle: Local draft before failure');
      return { abort: function () {} };
    },
    AssSubtitleRenderer: {
      create: function (options) {
        rendererOptions = options;
        return {
          load: function (content, callback) { callback(null); },
          setTime: function () {}, show: function () {}, hide: function () {}, dispose: function () {}
        };
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'ass');
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 350 });
  assert.deepStrictEqual(h.offsets, [], 'local ASS draft changes must stay local while the renderer is healthy');
  rendererOptions.onRuntimeError(new Error('late local ASS failure'));
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'server', 'late ASS failure must move the same draft to Plex preview');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.offsetMs, 350, 'fallback must retain the local draft offset');
  assert.strictEqual(h.controller.applySubtitleEditor({}, function (error) { applyError = error || null; }), true,
    'Apply must remain accepted after the local renderer fails');
  assert.ifError(applyError);
  assert.deepStrictEqual(h.offsets, [{ id: 'ass', offset: 350 }],
    'Apply after Local-to-Plex fallback must persist the draft that existed before the renderer failed');
  assert.strictEqual(playback.subtitleTracks[0].offset, 350, 'the selected Plex stream must retain the persisted fallback offset');
}());

(function embeddedAssCanEnterAdvancedEditorAndPersistLocalTiming() {
  var playback = playbackFixture();
  var h;
  var loadCalls = 0;
  var applyError = null;
  playback.options.subtitleStreamID = 'ass-embedded';
  playback.subtitleTracks = [{ id: 'ass-embedded', format: 'ass', codec: 'ass', external: false, location: 'embedded' }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    loadSubtitleText: function (config, current, track, callback) {
      loadCalls += 1;
      callback(null, '[Script Info]\nTitle: embedded editor');
      return { abort: function () {} };
    },
    AssSubtitleRenderer: {
      create: function () {
        return {
          load: function (content, callback) { callback(null); },
          setSize: function () {}, setTime: function () {}, discontinuity: function () {},
          show: function () {}, hide: function () {}, dispose: function () {}
        };
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(loadCalls, 1, 'embedded ASS may still use the normal local-rendering path');
  assert.strictEqual(h.controller.openSubtitleEditor(), true, 'embedded ASS must enter Advanced Subtitle Settings');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'ass');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.capabilities.size, true);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.capabilities.background, false);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.capabilities.edge, false);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.capabilities.offset, true);
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 300 });
  assert.strictEqual(h.controller.snapshot().subtitleEditor.offsetMs, 300);
  assert.strictEqual(h.controller.applySubtitleEditor({ rendering: { srt: false, ass: true } }, function (error) { applyError = error || null; }), true);
  assert.ifError(applyError);
  assert.strictEqual(SubtitleOffsetStore.get({
    getItem: function (key) { return h.storageValues[key] || null; }
  }, 'server', 'part-1', 'ass-embedded'), 300,
  'Apply must persist embedded ASS timing by server, part, and stream identity');
  assert.strictEqual(h.controller.snapshot().localSubtitle.offsetMs, 300,
    'the active local ASS renderer must retain the applied embedded timing offset');
  assert.strictEqual(h.offsets.length, 0, 'local embedded ASS timing must not require a Plex server offset write');
}());

(function staleServerSizeDebounceCannotRebuildAnAssLocalPreview() {
  var playback = playbackFixture();
  var h;
  var preparationsAfterLocalSwitch;
  playback.options.subtitleStreamID = 'ass-external';
  playback.subtitleTracks = [
    { id: 'ass-external', format: 'ass', codec: 'ass', external: true, key: '/subtitles/external.ass', offset: 0 },
    { id: 'ass-local', format: 'ass', codec: 'ass', external: true, key: '/subtitles/local.ass' }
  ];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadSubtitleText: function (config, current, track, callback) {
      callback(null, '[Script Info]\nTitle: ' + track.id);
      return { abort: function () {} };
    },
    AssSubtitleRenderer: {
      create: function () {
        return {
          load: function (content, callback) {
            callback(content.indexOf('ass-external') !== -1 ? new Error('external local renderer failed') : null);
          },
          setTime: function () {}, show: function () {}, hide: function () {}, dispose: function () {}
        };
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'server', 'external ASS failure must first enter Plex fallback');
  h.root.runAllTimeouts(20);
  h.controller.openSubtitleEditor({ action: 'set-size', size: 125 });
  h.controller.openSubtitleEditor({ action: 'set-track', streamId: 'ass-local' });
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'ass', 'switching to another external ASS must establish a local preview');
  preparationsAfterLocalSwitch = h.preparations.length;
  h.root.runNextTimeout();
  assert.strictEqual(h.preparations.length, preparationsAfterLocalSwitch,
    'a stale server size debounce must not rebuild video after ownership moved to the local ASS renderer');
}());

(function staleServerSizeDebounceCannotRebuildAnotherServerAssPreview() {
  var playback = playbackFixture();
  var h;
  var preparationsAfterSwitch;
  playback.options.subtitleStreamID = 'ass-a';
  playback.subtitleTracks = [
    { id: 'ass-a', format: 'ass', codec: 'ass', external: true, key: '/subtitles/a.ass' },
    { id: 'ass-b', format: 'ass', codec: 'ass', external: true, key: '/subtitles/b.ass' }
  ];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadSubtitleText: function (config, current, track, callback) {
      callback(new Error('force Plex ASS preview'));
      return { abort: function () {} };
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'server', 'ASS A must use Plex preview');
  h.root.runAllTimeouts(20);
  h.controller.openSubtitleEditor({ action: 'set-size', size: 125 });
  h.controller.openSubtitleEditor({ action: 'set-track', streamId: 'ass-b' });
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'server', 'ASS B must also use Plex preview');
  preparationsAfterSwitch = h.preparations.length;
  h.root.runNextTimeout();
  assert.strictEqual(h.preparations.length, preparationsAfterSwitch,
    'a size debounce owned by ASS A must not rebuild ASS B after the track switch already rebuilt its preview');
}());

(function forcedTranscodeDisablesLocalAssPixelsButKeepsAdvancedTimingSettings() {
  var created = 0;
  var applyError = null;
  var playback = playbackFixture();
  var h;
  playback.options.subtitleStreamID = 'ass';
  playback.options.playbackMode = 'transcode';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: false }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    AssSubtitleRenderer: { create: function () { created += 1; return {}; } }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(h.controller.snapshot().localSubtitle, null, 'Force Transcode must not use JavascriptSubtitlesOctopus for embedded ASS');
  assert.strictEqual(created, 0, 'Force Transcode must not construct the ASS renderer');
  assert.strictEqual(h.controller.openSubtitleEditor(), true, 'Advanced Subtitle Settings must still open while Force Transcode owns embedded ASS pixels');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'server');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.capabilities.size, false,
    'Force Transcode must disable local ASS size controls');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.capabilities.background, false);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.capabilities.edge, false);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.capabilities.offset, true,
    'embedded ASS timing must remain available through the server preview path');
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 250 });
  assert.strictEqual(h.controller.snapshot().subtitleEditor.offsetMs, 250);
  assert.strictEqual(h.controller.applySubtitleEditor({ rendering: { srt: false, ass: true } }, function (error) {
    applyError = error || null;
  }), true, 'Force Transcode embedded ASS timing must remain applicable');
  assert.ifError(applyError);
  assert.deepStrictEqual(h.offsets[h.offsets.length - 1], { id: 'ass', offset: 250 },
    'server-owned embedded ASS timing must be committed through the Plex offset API');
  assert.strictEqual(SubtitleOffsetStore.get({
    getItem: function (key) { return h.storageValues[key] || null; }
  }, 'server', 'part-1', 'ass'), 250,
  'server-owned embedded ASS timing must also persist for a later local-renderer session');
  assert.strictEqual(h.controller.snapshot().localSubtitle, null,
    'applying timing must not steal embedded ASS pixels from Force Transcode');
  assert.strictEqual(h.preparations[0].delivery, 'transcode');
}());

(function forcedTranscodeEmbeddedAssPreviewsStoredTimingAndRestoresServerOffsetOnCancel() {
  var playback = playbackFixture();
  var h;
  playback.options.subtitleStreamID = 'ass';
  playback.options.playbackMode = 'transcode';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: false, offset: 0 }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  h.storageValues[SubtitleOffsetStore.STORAGE_KEY] = JSON.stringify({ 'server|part-1|ass': 300 });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'server');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.offsetMs, 300,
    'server-owned embedded ASS must load the timing saved by its previous local-renderer session');
  h.root.runAllTimeouts(20);
  assert.deepStrictEqual(h.offsets, [{ id: 'ass', offset: 300 }],
    'opening the editor must preview the persisted embedded ASS timing through Plex when the server owns pixels');
  h.controller.cancelSubtitleEditor(function (error) { assert.ifError(error); });
  assert.deepStrictEqual(h.offsets, [{ id: 'ass', offset: 300 }, { id: 'ass', offset: 0 }],
    'Cancel must restore the Plex stream offset that existed before the editor preview');
  assert.strictEqual(SubtitleOffsetStore.get({
    getItem: function (key) { return h.storageValues[key] || null; }
  }, 'server', 'part-1', 'ass'), 300,
  'Cancel must preserve the previously applied local timing preference');
}());

(function staleAssEditorResponseCannotReplaceTheSelectedTrack() {
  var rendering = { srt: false, ass: false };
  var playback = playbackFixture();
  var callbacks = [];
  var loads = [];
  var h;
  playback.options.subtitleStreamID = 'ass-a';
  playback.subtitleTracks = [
    { id: 'ass-a', format: 'ass', codec: 'ass', external: true, key: '/subtitles/a.ass' },
    { id: 'ass-b', format: 'ssa', codec: 'ssa', external: true, key: '/subtitles/b.ssa' }
  ];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return rendering; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadSubtitleText: function (config, current, track, callback) {
      callbacks.push({ id: track.id, callback: callback, aborted: false });
      return { abort: function () { callbacks[callbacks.length - 1].aborted = true; } };
    },
    AssSubtitleRenderer: {
      create: function () {
        return {
          load: function (content, callback) { loads.push(content); callback(null); },
          setTime: function () {}, show: function () {}, hide: function () {}, dispose: function () {}
        };
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'server');
  rendering.ass = true;
  h.controller.openSubtitleEditor({ action: 'set-rendering' });
  assert.strictEqual(callbacks.length, 1, 'enabling global ASS must request the selected ASS stream once');
  h.controller.openSubtitleEditor({ action: 'set-track', streamId: 'ass-b' });
  assert.strictEqual(callbacks.length, 2, 'changing ASS track must start a new raw subtitle request');
  callbacks[0].callback(null, '[Script Info]\nTitle: stale A');
  assert.deepStrictEqual(loads, [], 'a stale ASS response must not reach JavascriptSubtitlesOctopus');
  callbacks[1].callback(null, '[Script Info]\nTitle: current B');
  assert.deepStrictEqual(loads, ['[Script Info]\nTitle: current B'], 'only the currently selected ASS response may replace renderer content');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.selectedStreamID, 'ass-b');
}());

(function staleExternalAssOffsetFailureCannotPoisonTheNewTrackApply() {
  var playback = playbackFixture();
  var offsetCallbacks = [];
  var applyError = null;
  var h;
  playback.options.subtitleStreamID = 'ass-a';
  playback.subtitleTracks = [
    { id: 'ass-a', format: 'ass', codec: 'ass', external: true, key: '/subtitles/a.ass', offset: 0 },
    { id: 'ass-b', format: 'ass', codec: 'ass', external: true, key: '/subtitles/b.ass', offset: 0 }
  ];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    loadSubtitleText: function (config, current, track, callback) {
      callback(new Error('raw ASS preview unavailable'));
      return { abort: function () {} };
    },
    setSubtitleOffset: function (config, streamId, offset, callback) {
      offsetCallbacks.push({ id: streamId, offset: offset, callback: callback });
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'server', 'ASS A must use the Plex fallback for this race');
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 200 });
  h.root.runNextTimeout();
  assert.strictEqual(offsetCallbacks.length, 1, 'ASS A must have one offset write in flight');
  h.controller.openSubtitleEditor({ action: 'set-track', streamId: 'ass-b' });
  assert.strictEqual(h.controller.snapshot().subtitleEditor.selectedStreamID, 'ass-b');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'server', 'ASS B must become the active Plex preview');
  offsetCallbacks[0].callback(new Error('late ASS A offset failure'));
  assert.strictEqual(h.controller.applySubtitleEditor({}, function (error) { applyError = error || null; }), true,
    'Apply on ASS B must remain accepted after a stale ASS A offset callback');
  assert.ifError(applyError);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.open, false, 'successful ASS B Apply must close the editor normally');
}());

(function pendingExternalAssOffsetIsDroppedWhenTrackChangesBeforeDebounce() {
  var playback = playbackFixture();
  var h;
  playback.options.subtitleStreamID = 'ass-a';
  playback.subtitleTracks = [
    { id: 'ass-a', format: 'ass', codec: 'ass', external: true, key: '/subtitles/a.ass', offset: 0 },
    { id: 'ass-b', format: 'ass', codec: 'ass', external: true, key: '/subtitles/b.ass', offset: 0 }
  ];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    loadSubtitleText: function (config, current, track, callback) {
      callback(new Error('raw ASS preview unavailable'));
      return { abort: function () {} };
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'server');
  h.root.runAllTimeouts(20);
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 200 });
  assert.deepStrictEqual(h.offsets, [], 'ASS A offset must remain debounced before the track changes');
  h.controller.openSubtitleEditor({ action: 'set-track', streamId: 'ass-b' });
  assert.strictEqual(h.controller.snapshot().subtitleEditor.selectedStreamID, 'ass-b');
  h.root.runNextTimeout();
  assert.deepStrictEqual(h.offsets, [], 'changing track before debounce must drop the abandoned ASS A offset instead of writing it to Plex');
}());

(function previousExternalAssOffsetErrorClearsWhenSelectingAnotherTrack() {
  var playback = playbackFixture();
  var offsetCallbacks = [];
  var applyError = null;
  var h;
  playback.options.subtitleStreamID = 'ass-a';
  playback.subtitleTracks = [
    { id: 'ass-a', format: 'ass', codec: 'ass', external: true, key: '/subtitles/a.ass', offset: 0 },
    { id: 'ass-b', format: 'ass', codec: 'ass', external: true, key: '/subtitles/b.ass', offset: 0 }
  ];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    loadSubtitleText: function (config, current, track, callback) {
      callback(new Error('raw ASS preview unavailable'));
      return { abort: function () {} };
    },
    setSubtitleOffset: function (config, streamId, offset, callback) {
      offsetCallbacks.push({ id: streamId, offset: offset, callback: callback });
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 200 });
  h.root.runNextTimeout();
  offsetCallbacks[0].callback(new Error('ASS A offset failed while selected'));
  h.controller.openSubtitleEditor({ action: 'set-track', streamId: 'ass-b' });
  assert.strictEqual(h.controller.snapshot().subtitleEditor.selectedStreamID, 'ass-b');
  assert.strictEqual(h.controller.applySubtitleEditor({}, function (error) { applyError = error || null; }), true,
    'selecting ASS B must make Apply independent from an earlier ASS A preview write error');
  assert.ifError(applyError);
}());

(function disabledLocalSubtitleRenderingKeepsPlexSubtitlePath() {
  var playback = playbackFixture();
  var h;
  playback.options.subtitleStreamID = 's1';
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: false }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(h.controller.snapshot().localSubtitle, null, 'disabled local rendering must not claim subtitle ownership');
  assert.strictEqual(h.preparations[0].delivery, 'transcode', 'automatic playback must use Plex rendering when local subtitles are disabled');
  assert.strictEqual(h.preparations[0].subtitle, 's1', 'automatic playback must preserve the selected subtitle stream');
  assert.strictEqual(h.preparations[0].localSubtitleOverlay, false, 'Plex-rendered subtitles must not use the local overlay');
  assert.strictEqual(h.preparations.length, 1, 'automatic playback must not schedule a native fallback that drops subtitles');
}());

(function forcedTranscodeKeepsPlexSubtitleRendering() {
  var h = harness({
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  h.playback.options.subtitleStreamID = 's1';
  h.playback.options.playbackMode = 'transcode';
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.controller.snapshot().localSubtitle, null, 'forced Transcode must keep ownership of external subtitle rendering');
  assert.strictEqual(h.preparations[0].delivery, 'transcode', 'forced Transcode must not switch to the local overlay path');
}());

(function embeddedSubtitleApplyRestoresExactPausedStateAndLocalOverlay() {
  var h = harness();
  h.playback.options.subtitleStreamID = 's2';
  h.storageValues[SubtitleOffsetStore.STORAGE_KEY] = JSON.stringify({ 'server|part-1|s2': 500 });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  h.video.dispatch('pause');
  assert.strictEqual(h.controller.snapshot().localSubtitle.offsetMs, 500);
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  assert.strictEqual(h.controller.snapshot().timelineSuppressed, true);
  assert.strictEqual(h.root.intervalCount(), 2, 'embedded text preview must add the temporary 50ms overlay clock beside transcode keepalive');
  assert.strictEqual(h.controller.snapshot().playback.options.subtitleStreamID, '', 'embedded preview must disable the server subtitle stream while rendering local cues');
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 35, 'embedded preview must open its verified five-second window before the captured position');
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 100 });
  h.controller.applySubtitleEditor({}, function (error) { assert.ifError(error); });
  assert.strictEqual(h.controller.snapshot().subtitleEditor.open, false);
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 40, 'Apply must restore the exact captured absolute position');
  assert.strictEqual(h.controller.snapshot().localSubtitle.offsetMs, 600);
  assert.strictEqual(h.controller.snapshot().localSubtitle.streamId, 's2');
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.controller.snapshot().paused, true, 'Apply must restore the captured paused state');
  assert.strictEqual(h.controller.snapshot().timelineSuppressed, false, 'timeline reporting resumes only after the paused restore completes');
}());

(function subtitleCancelRestoresOriginalSelectionOffsetSizeAndOverlay() {
  var h = harness();
  h.playback.options.subtitleStreamID = 's2';
  h.playback.options.subtitleSize = 125;
  h.storageValues[SubtitleOffsetStore.STORAGE_KEY] = JSON.stringify({ 'server|part-1|s2': 500 });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  h.controller.openSubtitleEditor();
  h.controller.openSubtitleEditor({ action: 'set-track', streamId: '' });
  h.controller.openSubtitleEditor({ action: 'set-size', size: 75 });
  h.controller.cancelSubtitleEditor(function (error) { assert.ifError(error); });
  var snapshot = h.controller.snapshot();
  assert.strictEqual(snapshot.playback.options.subtitleStreamID, 's2');
  assert.strictEqual(snapshot.playback.options.subtitleSize, 125);
  assert.strictEqual(snapshot.localSubtitle.streamId, 's2');
  assert.strictEqual(snapshot.localSubtitle.offsetMs, 500);
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 40, 'Cancel must restore the original absolute position without retaining preview state');
}());


(function closingSubtitleEditorRestoresPendingExternalOffsets() {
  var offsetCallbacks = [];
  var h = harness({
    setSubtitleOffset: function (config, streamId, offset, callback) { offsetCallbacks.push(callback); }
  });
  h.playback.options.playbackMode = 'transcode';
  h.playback.options.subtitleStreamID = 's1';
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  h.controller.openSubtitleEditor();
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'server', 'forced Transcode must retain the server-rendered editor fallback');
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 250 });
  h.root.runNextTimeout();
  assert.deepStrictEqual(h.offsets, [{ id: 's1', offset: 250 }], 'the debounced external preview write must start before close');
  h.controller.close();
  assert.strictEqual(offsetCallbacks.length, 1, 'close must wait for an in-flight preview write before restoring it');
  offsetCallbacks.shift()(null);
  assert.deepStrictEqual(h.offsets, [{ id: 's1', offset: 250 }, { id: 's1', offset: 0 }], 'close must restore the original Plex subtitle offset after the preview write completes');
  offsetCallbacks.shift()(null);
  assert.strictEqual(h.controller.snapshot().active, false);
}());

(function closingSubtitleEditorMustNotMutateNewPlaybackTracks() {
  var offsetCallbacks = [];
  var loadCount = 0;
  var firstPlayback = playbackFixture();
  var secondPlayback = playbackFixture();
  var h;
  firstPlayback.options.playbackMode = 'transcode';
  firstPlayback.options.subtitleStreamID = 's1';
  secondPlayback.ratingKey = 'episode-2';
  secondPlayback.subtitleTracks[0].offset = 900;
  secondPlayback.mediaVersions[0].subtitleTracks[0].offset = 900;
  h = harness({
    loadPlayback: function (config, key, session, preferences, callback) {
      loadCount += 1;
      callback(null, loadCount === 1 ? firstPlayback : secondPlayback);
    },
    setSubtitleOffset: function (config, streamId, offset, callback) { offsetCallbacks.push(callback); }
  });

  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  h.controller.openSubtitleEditor();
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 250 });
  h.root.runNextTimeout();
  h.controller.close();
  h.controller.open({ detail: { ratingKey: 'episode-2' }, startOffset: 0 });

  offsetCallbacks.shift()(null);
  assert.deepStrictEqual(h.offsets,
    [{ id: 's1', offset: 250 }, { id: 's1', offset: 0 }],
    'the closed editor must still restore its Plex preview offset');
  offsetCallbacks.shift()(null);
  assert.strictEqual(secondPlayback.subtitleTracks[0].offset, 900,
    'late cleanup from the closed editor must not rewrite the active playback track');
}());

(function destroySuppressesLateFinalProgressPresentation() {
  var finalTimelineCallback = null;
  var h = harness({
    sendTimeline: function (config, current, state, milliseconds, callback) {
      if (state === 'stopped') { finalTimelineCallback = callback; }
      else if (callback) { callback(); }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('playing');
  h.controller.close();
  h.controller.destroy();
  finalTimelineCallback();
  assert.deepStrictEqual(h.closed, [], 'destroy must suppress final-progress callbacks that arrive after controller teardown');
}());

(function activeAssSwitchThenCancelRestoresOriginalRendererContent() {
  var rendererInstance;
  var playback = playbackFixture();
  var h;
  playback.options.subtitleStreamID = 'ass-a';
  playback.subtitleTracks = [
    { id: 'ass-a', index: 4, format: 'ass', codec: 'ass', external: true, source: 'external', key: '/subtitles/a.ass' },
    { id: 'ass-b', index: 5, format: 'ass', codec: 'ass', external: true, source: 'external', key: '/subtitles/b.ass' }
  ];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadSubtitleText: function (config, current, track, callback) {
      callback(null, '[Script Info]\nTitle: ' + track.id);
      return { abort: function () {} };
    },
    AssSubtitleRenderer: {
      create: function () {
        rendererInstance = {
          load: function (content, callback) { rendererInstance.content = content; callback(null); },
          setTime: function () {}, show: function () {}, hide: function () {}, dispose: function () {}
        };
        return rendererInstance;
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  assert.strictEqual(rendererInstance.content, '[Script Info]\nTitle: ass-a', 'initial renderer must contain ASS A');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(h.controller.snapshot().localSubtitle, 'content'), false, 'public playback snapshots must not expose raw ASS subtitle content');
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  h.controller.openSubtitleEditor({ action: 'set-track', streamId: 'ass-b' });
  assert.strictEqual(rendererInstance.content, '[Script Info]\nTitle: ass-b', 'draft renderer must contain ASS B after switching');
  h.controller.cancelSubtitleEditor(function (error) { assert.ifError(error); });
  assert.strictEqual(h.controller.snapshot().localSubtitle.streamId, 'ass-a', 'Cancel must restore ASS A ownership');
  assert.strictEqual(rendererInstance.content, '[Script Info]\nTitle: ass-a', 'Cancel must restore ASS A renderer content, not leave ASS B visible');
}());

(function failedEmbeddedAssPlaybackTrackSwitchReleasesPreviousRenderer() {
  var disposeCount = 0;
  var playback = playbackFixture();
  var h;
  var changeError = null;
  playback.options.subtitleStreamID = 'ass-a';
  playback.subtitleTracks = [
    { id: 'ass-a', index: 4, format: 'ass', codec: 'ass', external: false, location: 'embedded' },
    { id: 'ass-b', index: 5, format: 'ass', codec: 'ass', external: false, location: 'embedded' }
  ];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadSubtitleText: function (config, current, track, callback) {
      if (String(track.id) === 'ass-b') { callback(new Error('embedded ASS B fetch failed')); }
      else { callback(null, '[Script Info]\nTitle: ' + track.id); }
      return { abort: function () {} };
    },
    AssSubtitleRenderer: {
      create: function () {
        return {
          load: function (content, callback) { callback(null); },
          setTime: function () {}, show: function () {}, hide: function () {},
          dispose: function () { disposeCount += 1; }
        };
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  assert.strictEqual(h.controller.snapshot().localSubtitle.rendererType, 'ass', 'embedded ASS A must own the normal local renderer before a playback track switch');
  assert.deepStrictEqual(h.controller.subtitleEditorAvailability('ass-a'), { enabled: true, reason: '' },
    'embedded ASS playback tracks must also be selectable from Advanced Subtitle Settings');
  h.controller.changeTrack('subtitles', 'ass-b', function (error) { changeError = error || null; });
  assert.ifError(changeError);
  assert.strictEqual(disposeCount, 1, 'a failed embedded ASS playback switch must release the previous renderer');
  assert.strictEqual(h.controller.snapshot().localSubtitle, null, 'a failed embedded ASS playback switch must not retain stale ASS A content');
}());

(function cancellingEditorAfterGlobalAssEnableKeepsTheNewGlobalRendererState() {
  var rendering = { srt: false, ass: false };
  var playback = playbackFixture();
  var rendererInstances = [];
  var h;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/ass.ass', offset: 0 }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return rendering; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    AssSubtitleRenderer: {
      create: function () {
        var instance = {
          load: function (content, callback) { instance.content = content; callback(null); },
          setTime: function () {},
          show: function () {},
          hide: function () {},
          dispose: function () { instance.disposed = true; }
        };
        rendererInstances.push(instance);
        return instance;
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'server');
  rendering.ass = true;
  assert.strictEqual(h.controller.openSubtitleEditor({ action: 'set-rendering' }), true);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'ass', 'confirmed global ASS enable must switch the open editor to local preview');
  h.controller.cancelSubtitleEditor(function (error) { assert.ifError(error); });
  assert.ok(h.controller.snapshot().localSubtitle && h.controller.snapshot().localSubtitle.rendererType === 'ass',
    'Cancel must preserve the newly enabled global ASS renderer while reverting unrelated editor drafts');
  assert.strictEqual(h.controller.snapshot().playback.options.subtitleStreamID, 'ass',
    'Cancel after a global renderer change must still restore the original track selection');
  assert.ok(rendererInstances.length >= 1, 'global ASS enable must create a local renderer');
}());


console.log('Playback controller subtitle checks passed');
