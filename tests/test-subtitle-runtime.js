'use strict';

var assert = require('assert');
var SubtitleRuntime = require('../app/subtitle-runtime');
var SubtitleSync = require('../app/subtitle-sync');

function createRuntime(overrides) {
  var values = overrides || {};
  var rendered = [];
  var hidden = 0;
  var renderer = values.renderer || null;
  var runtime = SubtitleRuntime.create({
    SubtitleSync: SubtitleSync,
    PlaybackOperation: require('../app/playback-operation'),
    SubtitleOffsetStore: values.SubtitleOffsetStore,
    AssSubtitleRenderer: values.AssSubtitleRenderer || (renderer ? { create: function () { return renderer; } } : null),
    root: values.root || {},
    document: values.document || {},
    videoDimensions: values.videoDimensions || function () { return { width: 1920, height: 1080 }; },
    subtitleRendering: values.subtitleRendering || function () { return { srt: true, ass: true }; },
    subtitlePresentation: values.subtitlePresentation,
    subtitleIdentity: values.subtitleIdentity || function () { return 'server'; },
    storage: values.storage,
    renderText: function (cues, time, offset, size) { rendered.push({ cues: cues, time: time, offset: offset, size: size }); },
    hideText: function () { hidden += 1; }
  });
  return { runtime: runtime, rendered: rendered, hidden: function () { return hidden; } };
}

(function runtimeOwnsClassificationRenderingAndEditorPolicy() {
  var h = createRuntime();
  var playback = {
    requestedPlaybackMode: 'auto',
    options: { playbackMode: 'auto', subtitleStreamID: 's1' },
    subtitleTracks: [
      { id: 's1', codec: 'srt', external: true },
      { id: 'a1', codec: 'ass', external: true }
    ]
  };
  assert.strictEqual(h.runtime.isLocalKind(SubtitleSync.classify(playback.subtitleTracks[0])), true);
  assert.strictEqual(h.runtime.isAssKind(SubtitleSync.classify(playback.subtitleTracks[1])), true);
  assert.strictEqual(h.runtime.renderingEnabled(SubtitleSync.classify(playback.subtitleTracks[0])), true);
  assert.deepStrictEqual(h.runtime.editorAvailability(playback), { enabled: true, reason: '' });
  assert.deepStrictEqual(h.runtime.editorAvailability(playback, 'a1'), { enabled: true, reason: '' });
  playback.requestedPlaybackMode = 'transcode';
  assert.deepStrictEqual(h.runtime.editorAvailability(playback, 'a1'), { enabled: true, reason: '' },
    'forced Transcode must still allow Advanced Subtitle Settings while local-pixel controls remain capability-gated');
  playback.subtitleTracks.push({ id: 'a2', codec: 'ass', external: false, location: 'embedded' });
  assert.deepStrictEqual(h.runtime.editorAvailability(playback, 'a2'), { enabled: true, reason: '' },
    'embedded ASS must remain eligible for timing settings even when Plex currently owns the pixels');
  playback.requestedPlaybackMode = 'auto';
  h.runtime.markFailed('s1');
  assert.strictEqual(h.runtime.failed('s1'), true);
  assert.deepStrictEqual(h.runtime.editorAvailability(playback, 's1'), { enabled: false, reason: 'failed' },
    'failed text streams must be disabled for the playback session');
  h.runtime.markFailed('a1');
  assert.strictEqual(h.runtime.editorTrackAllowed(playback, playback.subtitleTracks[1]), true,
    'ASS failures must remain retryable through the advanced editor');
  h.runtime.clearFailed('s1');
  assert.strictEqual(h.runtime.failed('s1'), false);
  h.runtime.resetFailures();
  assert.strictEqual(h.runtime.failed('a1'), false, 'a new playback session must clear remembered subtitle failures');
}());

(function runtimeOwnsLocalPayloadAndKeepsRawAssPrivate() {
  var h = createRuntime();
  var state = { rendererType: 'ass', content: '[Script Info]\nTitle: private', cues: null, offsetMs: 250, streamId: 'a1', size: 125 };
  h.runtime.setLocal(state);
  state.offsetMs = 999;
  assert.strictEqual(h.runtime.localState().offsetMs, 250, 'local runtime state must not alias caller mutations');
  assert.strictEqual(h.runtime.localState().content, '[Script Info]\nTitle: private');
  assert.deepStrictEqual(h.runtime.localSnapshot(), {
    cues: null,
    rendererType: 'ass',
    offsetMs: 250,
    streamId: 'a1',
    size: 125
  }, 'public snapshots must never expose raw ASS content');
  h.runtime.setLocalSize(90);
  assert.strictEqual(h.runtime.localState().size, 90);
  h.runtime.clearLocal();
  assert.strictEqual(h.runtime.localState(), null);
}());

(function runtimeOwnsSubtitleOffsets() {
  var calls = [];
  var h = createRuntime({
    storage: {},
    subtitlePresentation: function (current, track) {
      if (track.id === 'presented') { return { offsetMs: 345 }; }
      return null;
    },
    SubtitleOffsetStore: {
      get: function (storage, identity, partId, streamId) {
        calls.push([storage, identity, partId, streamId]);
        return 678;
      }
    }
  });
  var playback = { partId: 'part-1' };
  assert.strictEqual(h.runtime.offset(playback, { id: 'presented', codec: 'srt', external: true, offset: 12 }), 345);
  assert.strictEqual(h.runtime.offset(playback, { id: 'external', codec: 'srt', external: true, offset: 12 }), 12);
  assert.strictEqual(h.runtime.offset(playback, { id: 'embedded', codec: 'srt', external: false }), 678);
  assert.deepStrictEqual(calls[0].slice(1), ['server', 'part-1', 'embedded']);
}());

(function runtimeRendersAgainstProvidedConfirmedClockOnly() {
  var loadCount = 0;
  var renderer = {
    load: function (content, callback) { loadCount += 1; this.content = content; callback(null); },
    setSize: function (size) { this.size = size; },
    setTime: function (time, paused) { this.time = time; this.paused = paused; },
    discontinuity: function (time) {
      this.discontinuities = Number(this.discontinuities || 0) + 1;
      this.discontinuityTime = time;
    },
    show: function () { this.visible = true; },
    hide: function () { this.visible = false; },
    dispose: function () { this.disposed = true; }
  };
  var h = createRuntime({ renderer: renderer });
  var track = { id: 'a1', codec: 'ass', external: true };
  var error;
  h.runtime.loadAss(track, '[Script Info]\nTitle: one', function (value) { error = value; });
  assert.strictEqual(error, null);
  h.runtime.loadAss(track, '[Script Info]\nTitle: one', function (value) { error = value; });
  assert.strictEqual(loadCount, 1, 'identical ASS payloads must not reload the worker-backed renderer');
  h.runtime.setLocal({ rendererType: 'ass', content: renderer.content, offsetMs: 500, streamId: 'a1', size: 100 });
  assert.strictEqual(renderer.size, 100, 'local ASS ownership must apply the selected subtitle size to libass');
  h.runtime.setLocalSize(150);
  assert.strictEqual(renderer.size, 150, 'live ASS size changes must be forwarded to libass without rebuilding video');
  h.runtime.syncAssClock(81.25, true);
  assert.strictEqual(renderer.time, 80.75, 'external ASS startup must be primed from the absolute playback clock before its first visible frame');
  assert.strictEqual(renderer.paused, true);
  assert.strictEqual(renderer.visible, undefined, 'priming the ASS clock must not reveal the canvas before playback rendering');
  h.runtime.discontinuity();
  assert.strictEqual(renderer.discontinuities, 1,
    'timeline discontinuities must be forwarded to the active ASS renderer so monotonic presentation can reset safely');
  h.runtime.render(null, 42.5, true);
  assert.strictEqual(renderer.time, 42, 'positive ASS offsets must delay local rendering just like positive SRT offsets');
  assert.strictEqual(renderer.paused, true);
  assert.strictEqual(renderer.visible, true);
  assert.strictEqual(h.hidden() > 0, true, 'DOM text overlay must be hidden while ASS owns presentation');
  h.runtime.clearLocal();
  h.runtime.discontinuity(60, { open: true, rendererType: 'ass', offsetMs: 500 });
  assert.strictEqual(renderer.discontinuities, 2,
    'an active Advanced Subtitle Editor ASS preview must receive timeline discontinuities even after local runtime ownership is cleared');
  assert.strictEqual(renderer.discontinuityTime, 59.5,
    'editor-owned ASS discontinuities must honor the editor draft offset');
  h.runtime.setLocal({ rendererType: 'ass', content: renderer.content, offsetMs: 500, streamId: 'a1', size: 150 });
  h.runtime.render({ open: true, rendererType: 'ass', offsetMs: 1500 }, 42.5, true);
  assert.strictEqual(renderer.discontinuities, 3,
    'changing the effective ASS offset must invalidate the monotonic timeline before rendering the shifted position');
  assert.strictEqual(renderer.discontinuityTime, 41,
    'ASS offset invalidation must re-anchor the renderer at the newly shifted media time');
  assert.strictEqual(renderer.time, 41,
    'ASS offset preview must render against the newly shifted clock after invalidation');
  h.runtime.render(null, 0.25, false);
  assert.strictEqual(renderer.visible, false, 'a positive ASS delay must keep the local canvas hidden until the shifted subtitle clock reaches zero');

  h.runtime.setLocal({ cues: [{ start: 0, end: 1000, text: 'x' }], offsetMs: 250, streamId: 's1', size: 80 });
  h.runtime.render(null, 12.25, false);
  assert.strictEqual(renderer.visible, false, 'ASS canvas must hide when text overlay owns presentation');
  assert.strictEqual(h.rendered.length, 1);
  assert.strictEqual(h.rendered[0].time, 12250);
  assert.strictEqual(h.rendered[0].offset, 250);
  assert.strictEqual(h.rendered[0].size, 80);
  h.runtime.hide();
  h.runtime.disposeAss();
  assert.strictEqual(renderer.disposed, true);
}());

(function resetReleasesRendererPayloadAndSessionFailures() {
  var renderer = {
    load: function (content, callback) { callback(null); },
    hide: function () {},
    dispose: function () { this.disposed = true; }
  };
  var h = createRuntime({ renderer: renderer });
  h.runtime.loadAss({ id: 'a1' }, 'ass', function () {});
  h.runtime.setLocal({ rendererType: 'ass', content: 'ass', streamId: 'a1', offsetMs: 0, size: 100 });
  h.runtime.markFailed('s1');
  h.runtime.reset();
  assert.strictEqual(h.runtime.localState(), null);
  assert.strictEqual(h.runtime.failed('s1'), false);
  assert.strictEqual(renderer.disposed, true);
}());

(function runtimeOwnsSeekPresentationGateState() {
  var h = createRuntime();
  h.runtime.beginSeekPresentation(true, 629);
  assert.strictEqual(h.runtime.seekPresentationPending(), true);
  assert.strictEqual(h.runtime.seekPresentationWaitingForPlaying(), true);
  assert.strictEqual(h.runtime.seekPresentationTarget(), 629);
  h.runtime.markSeekRebuffer();
  assert.strictEqual(h.runtime.seekPresentationWaitingForPlaying(), true);
  h.runtime.markSeekPlaying();
  assert.strictEqual(h.runtime.seekPresentationWaitingForPlaying(), false);
  h.runtime.releaseSeekPresentation();
  assert.strictEqual(h.runtime.seekPresentationPending(), false);
  assert.strictEqual(h.runtime.seekPresentationTarget(), null);
  h.runtime.beginSeekPresentation(false, 0);
  assert.strictEqual(h.runtime.seekPresentationTarget(), 0, 'seek presentation ownership must preserve an absolute target at zero');
  h.runtime.resetSeekPresentation();
  assert.strictEqual(h.runtime.seekPresentationPending(), false);
}());



(function staleAssLoadCannotRepopulateTheDisposedRendererCache() {
  var completions = [];
  var publications = [];
  var h = createRuntime({ renderer: {
    load: function (content, callback) { completions.push(callback); },
    dispose: function () {}
  } });
  h.runtime.loadAss({ id: 'a' }, 'A', function () { publications.push('a'); });
  h.runtime.disposeAss();
  h.runtime.loadAss({ id: 'b' }, 'B', function () { publications.push('b'); });
  completions[1](null);
  completions[0](null);
  h.runtime.loadAss({ id: 'b' }, 'B', function () { publications.push('cached-b'); });
  assert.strictEqual(completions.length, 2, 'stale completion must not invalidate the current renderer cache');
  assert.deepStrictEqual(publications, ['b', 'cached-b']);
}());

console.log('Subtitle runtime checks passed');
