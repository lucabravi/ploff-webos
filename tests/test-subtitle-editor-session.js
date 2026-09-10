'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var modulePath = path.join(__dirname, '..', 'app', 'subtitle-editor-session.js');

assert.strictEqual(fs.existsSync(modulePath), true, 'subtitle editor session module must exist');

var SubtitleEditorSession = require(modulePath);

assert.strictEqual(typeof SubtitleEditorSession.open, 'function', 'session must expose open');
assert.strictEqual(typeof SubtitleEditorSession.update, 'function', 'session must expose update');
assert.strictEqual(typeof SubtitleEditorSession.snapshot, 'function', 'session must expose snapshot');
assert.strictEqual(typeof SubtitleEditorSession.commit, 'function', 'session must expose commit');
assert.strictEqual(typeof SubtitleEditorSession.cancel, 'function', 'session must expose cancel');

(function openCreatesDefensiveEditorState() {
  var originalOptions = { subtitleStreamID: 'ass-a', subtitleSize: 120, localSubtitleOverlay: true };
  var originalLocal = {
    rendererType: 'ass',
    content: '[Script Info]\nTitle: ASS A',
    cues: null,
    offsetMs: 250,
    streamId: 'ass-a',
    size: 120
  };
  var bounds = { start: 35, end: 40 };
  var playbackRef = { id: 'playback-1' };
  var state = SubtitleEditorSession.open({
    selectedStreamID: 'ass-a',
    subtitleSize: 120,
    position: 40,
    paused: true,
    bounds: bounds,
    playbackRef: playbackRef,
    originalOptions: originalOptions,
    originalLocalSubtitleState: originalLocal,
    keepActiveStream: true
  });

  originalOptions.subtitleStreamID = 'mutated';
  originalLocal.content = 'mutated';
  bounds.start = 0;

  assert.strictEqual(state.open, true);
  assert.strictEqual(state.selectedStreamID, 'ass-a');
  assert.strictEqual(state.subtitleSize, 120);
  assert.strictEqual(state.position, 40);
  assert.strictEqual(state.paused, true);
  assert.deepStrictEqual(state.bounds, { start: 35, end: 40 });
  assert.strictEqual(state.playbackRef, playbackRef, 'playback identity must remain stable for stale-response guards');
  assert.strictEqual(state.originalOptions.subtitleStreamID, 'ass-a', 'original playback options must be copied');
  assert.strictEqual(state.originalLocalSubtitleState.content, '[Script Info]\nTitle: ASS A', 'ASS restore payload must be retained privately');
  assert.strictEqual(state.keepActiveStream, true);
  assert.deepStrictEqual(state.cues, []);
  assert.deepStrictEqual(state.previewServerOffsets, {});
  assert.deepStrictEqual(state.previewOriginalOffsets, {});

  state = SubtitleEditorSession.open({ subtitleSize: 240, originalOptions: {}, originalLocalSubtitleState: null });
  assert.strictEqual(state.subtitleSize, 240, 'opening must preserve the captured playback size exactly; only explicit editor size changes clamp');
}());

(function updateOwnsDraftNormalizationWithoutTouchingTimelinePolicy() {
  var state = SubtitleEditorSession.open({
    selectedStreamID: 'srt-a',
    subtitleSize: 100,
    position: 10,
    paused: false,
    bounds: { start: 5, end: 10 },
    originalOptions: {},
    originalLocalSubtitleState: null
  });

  SubtitleEditorSession.update(state, {
    selectedStreamID: 42,
    subtitleSize: 999,
    offsetMs: -350,
    loop: true,
    bounds: { start: 8, end: 13 },
    content: '[Script Info]\nTitle: ASS B',
    rendererType: 'ass',
    keepActiveStream: false
  });

  assert.strictEqual(state.selectedStreamID, '42');
  assert.strictEqual(state.subtitleSize, 200, 'session must preserve the editor size clamp');
  assert.strictEqual(state.offsetMs, -350, 'offset arithmetic stays outside the session; the draft value is stored unchanged');
  assert.strictEqual(state.loop, true);
  assert.deepStrictEqual(state.bounds, { start: 8, end: 13 });
  assert.strictEqual(state.content, '[Script Info]\nTitle: ASS B');
  assert.strictEqual(state.rendererType, 'ass');
  assert.strictEqual(state.keepActiveStream, false);

  SubtitleEditorSession.update(state, { applying: true, cancelRequested: true, finalizing: true });
  assert.strictEqual(state.applying, true);
  assert.strictEqual(state.cancelRequested, true);
  assert.strictEqual(state.finalizing, true);
}());

(function snapshotIsPublicAndPrivacySafe() {
  var state = SubtitleEditorSession.open({
    selectedStreamID: 'ass-a',
    subtitleSize: 115,
    position: 20,
    paused: false,
    bounds: { start: 15, end: 20 },
    originalOptions: { tokenLikeValue: 'private' },
    originalLocalSubtitleState: { rendererType: 'ass', content: 'raw subtitle payload', streamId: 'ass-a' }
  });
  var snapshot;

  SubtitleEditorSession.update(state, {
    offsetMs: 450,
    previewMode: 'ass',
    previewLoading: false,
    previewError: false,
    rendererType: 'ass',
    content: 'draft raw subtitle payload',
    status: 'loading'
  });
  snapshot = SubtitleEditorSession.snapshot(state);

  assert.deepStrictEqual(snapshot, {
    open: true,
    selectedStreamID: 'ass-a',
    subtitleSize: 115,
    offsetMs: 450,
    position: 20,
    paused: false,
    loop: false,
    bounds: { start: 15, end: 20 },
    applying: false,
    status: 'loading',
    previewMode: 'ass',
    previewLoading: false,
    previewError: false,
    rendererType: 'ass'
  });
  assert.strictEqual(Object.prototype.hasOwnProperty.call(snapshot, 'content'), false, 'raw ASS payload must never escape through the public snapshot');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(snapshot, 'originalOptions'), false, 'restore metadata must stay private');
  snapshot.bounds.start = 0;
  assert.strictEqual(state.bounds.start, 15, 'snapshot bounds must be defensive');
}());

(function commitAndCancelHaveExplicitTransitions() {
  var state = SubtitleEditorSession.open({ originalOptions: {}, originalLocalSubtitleState: null });
  var transition;

  assert.strictEqual(SubtitleEditorSession.commit(state, 'preparing'), true);
  assert.strictEqual(state.applying, true);
  assert.strictEqual(state.finalizing, true);
  assert.strictEqual(state.cancelRequested, false);
  assert.strictEqual(state.status, 'preparing');

  transition = SubtitleEditorSession.cancel(state, 'preparing');
  assert.deepStrictEqual(transition, { accepted: true, deferred: true });
  assert.strictEqual(state.cancelRequested, true, 'Cancel during Apply must defer restoration until the in-flight commit reaches a safe boundary');

  state = SubtitleEditorSession.open({ originalOptions: {}, originalLocalSubtitleState: null });
  transition = SubtitleEditorSession.cancel(state, 'preparing');
  assert.deepStrictEqual(transition, { accepted: true, deferred: false });
  assert.strictEqual(state.applying, true);
  assert.strictEqual(state.finalizing, true);
  assert.strictEqual(state.status, 'preparing');

  assert.deepStrictEqual(SubtitleEditorSession.cancel(null, 'preparing'), { accepted: false, deferred: false });
  assert.strictEqual(SubtitleEditorSession.commit(null, 'preparing'), false);
}());

console.log('Subtitle editor session checks passed');
