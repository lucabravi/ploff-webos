'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var SubtitleOffsetStore = require('../app/subtitle-offset-store');
var Fixture = require('./helpers/playback-controller-harness');
var harness = Fixture.harness;
var playbackFixture = Fixture.playbackFixture;
var playbackEffectTrace = Fixture.playbackEffectTrace;
var ranges = Fixture.ranges;

(function exclusiveNativePlaybackOwnership() {
  var repositoryRoot = path.join(__dirname, '..');
  var controllerPath = path.join(repositoryRoot, 'app/coordinator/playback-controller.js');
  var driverPath = path.join(repositoryRoot, 'app/native-video-driver.js');
  var repositionPath = path.join(repositoryRoot, 'app/playback-reposition.js');
  var timelinePath = path.join(repositoryRoot, 'app/playback-timeline.js');
  var controllerSource = fs.readFileSync(controllerPath, 'utf8');
  var driverSource = fs.readFileSync(driverPath, 'utf8');
  var repositionSource = fs.readFileSync(repositionPath, 'utf8');
  var timelineSource = fs.readFileSync(timelinePath, 'utf8');
  var legacySource = fs.readdirSync(path.join(repositoryRoot, 'app/coordinator')).filter(function (file) {
    return /\.js$/.test(file) && file !== 'playback-controller.js';
  }).map(function (file) {
    return fs.readFileSync(path.join(repositoryRoot, 'app/coordinator', file), 'utf8');
  }).join('\n');
  assert.ok(/video\.currentTime\s*=/.test(driverSource), 'NativeVideoDriver must own native currentTime assignment');
  assert.ok(/video\.src\s*=/.test(driverSource), 'NativeVideoDriver must own native source assignment');
  assert.ok(/video\.play\(/.test(driverSource), 'NativeVideoDriver must own native play control');
  assert.ok(!/\bvideo\.currentTime\s*=/.test(controllerSource), 'Playback facade must not assign native currentTime directly');
  assert.ok(!/\bvideo\.src\s*=/.test(controllerSource), 'Playback facade must not assign native source directly');
  assert.ok(!/\bvideo\.(?:play|pause|load)\(/.test(controllerSource), 'Playback facade must not control native playback directly');
  assert.ok(!/\bvideo\.removeAttribute\(\s*['"]src['"]/.test(controllerSource), 'Playback facade must not clear native source directly');
  assert.ok(/PlaybackReposition\.create\(/.test(controllerSource), 'Playback facade must construct the explicit reposition capability');
  assert.ok(/reposition\.decide\(/.test(controllerSource) && /reposition\.reached\(/.test(controllerSource), 'Playback seek decisions and verification must delegate to PlaybackReposition');
  assert.ok(/timeline\.settle\(reposition\.settle/.test(controllerSource), 'PlaybackTimeline must adopt decoder settlement while PlaybackReposition retains settlement policy');
  assert.ok(!/PlayerSeekController\.(?:decide|reached|repair|buffered)\(/.test(controllerSource), 'Playback facade must not retain reposition policy calls after extraction');
  assert.ok(!/PlaybackRecovery/.test(repositionSource), 'PlaybackReposition must stay independent from recovery fallback');
  assert.ok(/PlaybackSession\.create\(/.test(controllerSource), 'Playback facade must construct the explicit playback session owner');
  assert.ok(!/var (?:streamSwitching|buffering|nativeSeekPending|nativePlayPending|nativeSourceReady|reopenStartupGuard|nativeSeekTarget|nativeSeekAbsoluteTarget|pendingTerminalPause|terminalPlayback|directPlayDecoderReportPending|destroyed)\s*=/.test(controllerSource), 'lifecycle and transient playback flags must live in PlaybackSession');
  assert.ok(/playbackSession\.shouldRejectPlaying\(\)/.test(controllerSource), 'stale and premature playing rejection must be owned by PlaybackSession');
  assert.ok(/function active\(\)[\s\S]*!playbackSession\.destroyed\(\)/.test(controllerSource), 'controller activity must derive teardown lifecycle from PlaybackSession');
  assert.ok(/SubtitleRuntime\.create\(/.test(controllerSource), 'Playback facade must construct the explicit subtitle runtime owner');
  assert.ok(!/var (?:localSubtitleState|assSubtitleRenderer|assSubtitleRendererStreamId|assSubtitleRendererContent|failedSubtitleStreams)\s*=/.test(controllerSource), 'active subtitle payload, renderer, and failure state must live in SubtitleRuntime');
  assert.ok(!/function (?:subtitleEditorTrackAllowed|subtitleEditorAvailability|localSubtitleRenderingEnabled|ensureAssSubtitleRenderer|disposeAssSubtitleRenderer|loadAssSubtitleRenderer|subtitleOffset)\(/.test(controllerSource), 'subtitle policy, renderer lifecycle, and runtime offsets must be delegated to SubtitleRuntime');
  assert.ok(/subtitleRuntime\.editorAvailability\(/.test(controllerSource) && /subtitleRuntime\.render\(/.test(controllerSource), 'Playback must query and render through SubtitleRuntime');
  assert.ok(/PlaybackTimeline\.create\(/.test(controllerSource), 'Playback facade must construct the explicit timeline owner');
  assert.ok(!/PlaybackClock\.(?:create|anchor|freeze|observe|position)\(/.test(controllerSource), 'Playback facade must not manipulate the playback clock directly after timeline extraction');
  assert.ok(!/PlexClient\.(?:sendTimeline|pingTranscode)\(/.test(controllerSource), 'Playback facade must not write Plex timeline or keepalive traffic directly after timeline extraction');
  assert.ok(/PlexClient\.sendTimeline\(/.test(timelineSource) && /PlexClient\.pingTranscode\(/.test(timelineSource), 'PlaybackTimeline must own Plex timeline reporting and transcode keepalive traffic');
  assert.ok(!/var (?:timelineTimer|estimatedEndTimer|keepaliveTimer|timelineSuppressed)\s*=/.test(controllerSource), 'timeline timers and suppression state must live in PlaybackTimeline');
  assert.ok(/current\.offsetBase\s*=/.test(controllerSource), 'Playback facade must still own stream-offset mutation during this checkpoint');
  assert.ok(!/\bvideo\.currentTime\s*=/.test(legacySource), 'other coordinators must not assign native currentTime');
  assert.ok(!/\bvideo\.src\s*=/.test(legacySource), 'other coordinators must not assign the native video source');
  assert.ok(!/PlexClient\.sendTimeline\(/.test(legacySource), 'other coordinators must not report Plex timelines');
  assert.ok(!/\.offsetBase\s*=/.test(legacySource), 'other coordinators must not mutate stream offsets');
}());

(function apiContract() {
  var h = harness();
  assert.deepStrictEqual(Object.keys(h.controller).sort(), [
    'applySubtitleEditor', 'cancelSubtitleEditor', 'changeTrack', 'changeVersion', 'close', 'destroy',
    'diagnostics', 'open', 'openSubtitleEditor', 'seekAbsolute', 'snapshot', 'startAdjacent', 'startItem',
    'subtitleEditorAvailability', 'toggle'
  ].sort(), 'the playback controller must expose only the planned public API');
  h.controller.destroy();
}());

(function subtitleEditorAvailabilityUsesPlaybackRuntimePolicy() {
  var playback = playbackFixture();
  var h;
  var assTrack = { id: 'ass-1', format: 'ass', codec: 'ass', external: true, key: '/subtitles/1.ass' };
  playback.options.subtitleStreamID = 's1';
  playback.subtitleTracks.push(assTrack);
  playback.mediaVersions[0].subtitleTracks.push(assTrack);
  h = harness({ playback: playback });
  h.controller.open({ detail: { ratingKey: 'episode-1' } });
  assert.deepStrictEqual(h.controller.subtitleEditorAvailability(), { enabled: true, reason: '' },
    'the selected SRT track must remain editor-compatible');
  assert.deepStrictEqual(h.controller.subtitleEditorAvailability('ass-1'), { enabled: true, reason: '' },
    'Automatic playback must allow ASS through the local editor path');
}());

(function subtitleEditorAvailabilityKeepsForcedTranscodeAssSettingsAccessible() {
  var playback = playbackFixture();
  var h;
  var assTrack = { id: 'ass-1', format: 'ass', codec: 'ass', external: true, key: '/subtitles/1.ass' };
  playback.options.playbackMode = 'transcode';
  playback.subtitleTracks.push(assTrack);
  playback.mediaVersions[0].subtitleTracks.push(assTrack);
  h = harness({ playback: playback });
  h.controller.open({ detail: { ratingKey: 'episode-1' } });
  assert.deepStrictEqual(h.controller.subtitleEditorAvailability('ass-1'), { enabled: true, reason: '' },
    'forced transcode must keep Advanced Subtitle Settings accessible while capability gating protects local-only controls');
}());

(function subtitleEditorAvailabilityReportsRuntimeFailedSrt() {
  var playback = playbackFixture();
  var h;
  playback.options.subtitleStreamID = 's1';
  h = harness({
    playback: playback,
    loadSubtitleText: function (config, current, track, callback) {
      callback(new Error('subtitle load failed'));
      return { abort: function () {} };
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' } });
  assert.deepStrictEqual(h.controller.subtitleEditorAvailability('s1'), { enabled: false, reason: 'failed' },
    'a failed SRT conversion/load must remain disabled for the playback session');
}());

(function embeddedAssTransientLocalFailureRemainsRetryableFromAdvancedSettings() {
  var playback = playbackFixture();
  var attempts = 0;
  var applyError = null;
  var h;
  playback.options.subtitleStreamID = 'ass-embedded';
  playback.subtitleTracks = [{ id: 'ass-embedded', format: 'ass', codec: 'ass', external: false, location: 'embedded' }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: true, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadSubtitleText: function (config, current, track, callback) {
      attempts += 1;
      callback(new Error('temporary embedded ASS load failure'));
      return { abort: function () {} };
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(attempts, 1, 'embedded ASS may still use the normal local-rendering path');
  assert.deepStrictEqual(h.controller.subtitleEditorAvailability('ass-embedded'), { enabled: true, reason: '' },
    'embedded ASS must remain available for an explicit Advanced Settings retry after a local-rendering failure');
  assert.strictEqual(h.controller.openSubtitleEditor(), true, 'embedded ASS must be allowed to retry its local preview from Advanced Settings');
  assert.strictEqual(attempts, 2, 'opening the editor must issue one explicit embedded ASS retry');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'server',
    'a failed embedded ASS local retry must fall back to Plex-owned timing instead of leaving a contradictory editable error state');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewError, false);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.capabilities.offset, true,
    'timing remains editable even when the current embedded ASS preview failed');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.capabilities.size, false,
    'size must remain disabled until a local renderer actually owns the pixels');
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: -200 });
  assert.strictEqual(h.controller.applySubtitleEditor({ rendering: { srt: false, ass: true } }, function (error) {
    applyError = error || null;
  }), true);
  assert.ifError(applyError);
  assert.strictEqual(SubtitleOffsetStore.get({
    getItem: function (key) { return h.storageValues[key] || null; }
  }, 'server', 'part-1', 'ass-embedded'), -200,
  'server fallback must still persist embedded ASS timing for future local playback');
}());

(function localTextCapabilitiesWaitForThePreviewPayloadBeforeClaimingPixelOwnership() {
  var playback = playbackFixture();
  var textCallback = null;
  var h;
  playback.options.subtitleStreamID = '';
  playback.subtitleTracks = [{ id: 'srt', format: 'srt', codec: 'srt', external: true, key: '/subtitles/editor-loading.srt' }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: true, ass: false }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadSubtitleText: function (_config, _current, _track, callback) {
      textCallback = callback;
      return { abort: function () {} };
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  assert.strictEqual(h.controller.openSubtitleEditor({ action: 'set-track', streamId: 'srt' }), true);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewMode, 'overlay');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewLoading, true);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.capabilities.size, false,
    'local SRT size must remain disabled until a usable preview payload is loaded');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.capabilities.background, false,
    'local SRT background must not claim pixel ownership during loading');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.capabilities.edge, false,
    'local SRT edge must not claim pixel ownership during loading');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.capabilities.offset, true,
    'timing remains editable while a supported local text payload is loading');
  textCallback(null, '1\n00:00:01,000 --> 00:00:03,000\nLoaded text');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.previewLoading, false);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.capabilities.size, true,
    'size must become available as soon as the local text renderer owns a usable payload');
  assert.strictEqual(h.controller.snapshot().subtitleEditor.capabilities.background, true);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.capabilities.edge, true);
}());

(function foregroundAssPlaybackClaimsPrefetchedTextBeforePlexLoad() {
  var playback = playbackFixture();
  var assTrack = { id: 'ass-cached', format: 'ass', codec: 'ass', external: true, key: '/subtitles/cached.ass' };
  var claims = [];
  var plexLoads = 0;
  var rendererContent = '';
  playback.options.subtitleStreamID = assTrack.id;
  playback.subtitleTracks = [assTrack];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  var h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: true, ass: true }; },
    AssSubtitlePrefetch: {
      claim: function (identity, callback) {
        claims.push(identity);
        callback(null, '[Script Info]\nTitle: cached ASS');
        return { identity: identity, content: '[Script Info]\nTitle: cached ASS' };
      },
      request: function () { throw new Error('cache hit must not request a second ASS transport'); }
    },
    assSubtitlePrefetchIdentity: function (current, track) { return current.ratingKey + '|' + track.id; },
    loadSubtitleText: function () {
      plexLoads += 1;
      throw new Error('cache hit must bypass Plex subtitle loading');
    },
    AssSubtitleRenderer: {
      create: function () {
        return {
          load: function (content, callback) { rendererContent = content; callback(null); },
          setTime: function () {}, show: function () {}, hide: function () {}, dispose: function () {}
        };
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' } });
  assert.deepStrictEqual(claims, ['episode-1|ass-cached'], 'foreground ASS setup must claim the current identity');
  assert.strictEqual(plexLoads, 0, 'a cached ASS text must avoid a duplicate Plex subtitle request');
  assert.strictEqual(rendererContent, '[Script Info]\nTitle: cached ASS', 'the claimed text must be installed into the local renderer');
  assert.strictEqual(h.controller.snapshot().localSubtitle.rendererType, 'ass', 'claimed ASS text must remain local');
}());

(function foregroundAssPlaybackPromotesAClaimMissIntoTheSharedOwner() {
  var playback = playbackFixture();
  var assTrack = { id: 'ass-miss', format: 'ass', codec: 'ass', external: true, key: '/subtitles/miss.ass' };
  var ownerRequests = 0;
  var plexLoads = 0;
  var rendererContent = '';
  playback.options.subtitleStreamID = assTrack.id;
  playback.subtitleTracks = [assTrack];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  var h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: true, ass: true }; },
    AssSubtitlePrefetch: {
      claim: function (_identity, callback) { callback(null, null); return null; },
      request: function (_target, _options, callback) {
        ownerRequests += 1;
        callback(null, '[Script Info]\nTitle: foreground ASS');
        return true;
      }
    },
    assSubtitlePrefetchIdentity: function (current, track) { return current.ratingKey + '|' + track.id; },
    loadSubtitleText: function () {
      plexLoads += 1;
      throw new Error('a claim miss must still use the shared foreground owner');
    },
    AssSubtitleRenderer: {
      create: function () {
        return {
          load: function (content, callback) { rendererContent = content; callback(null); },
          setTime: function () {}, show: function () {}, hide: function () {}, dispose: function () {}
        };
      }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' } });
  assert.strictEqual(ownerRequests, 1, 'a cache miss must promote the same identity through the foreground owner');
  assert.strictEqual(plexLoads, 0, 'the shared foreground owner must avoid a second direct Plex request');
  assert.strictEqual(rendererContent, '[Script Info]\nTitle: foreground ASS');
}());

(function externalAssStartupUsesTheAbsolutePlaybackClock() {
  var playback = playbackFixture();
  var renderer = {
    time: null,
    paused: null,
    visible: false,
    load: function (_content, callback) { callback(null); },
    setTime: function (time, paused) { this.time = time; this.paused = paused; },
    show: function () { this.visible = true; },
    hide: function () { this.visible = false; },
    dispose: function () {}
  };
  var assTrack = { id: 'ass-startup', format: 'ass', codec: 'ass', external: true, key: '/subtitles/startup.ass', offset: 0 };
  playback.options.subtitleStreamID = assTrack.id;
  playback.subtitleTracks = [assTrack];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  var h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: true, ass: true }; },
    loadSubtitleText: function (_config, _current, _track, callback) {
      callback(null, '[Script Info]\nTitle: startup ASS');
      return null;
    },
    AssSubtitleRenderer: { create: function () { return renderer; } }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 47 });
  assert.strictEqual(renderer.time, 47, 'external ASS must receive the absolute resume clock before playback starts');
  assert.strictEqual(renderer.paused, true, 'external ASS startup sync must preserve the paused native state');
  assert.strictEqual(renderer.visible, false, 'external ASS startup sync must keep the canvas hidden until the player renders it');
  h.controller.destroy();
}());


(function externalAssClockTracksNativePlaybackLifecycle() {
  var playback = playbackFixture();
  var calls = [];
  var renderer = {
    load: function (_content, callback) { callback(null); },
    setTime: function (time, paused) { calls.push({ time: time, paused: paused }); },
    show: function () {},
    hide: function () {},
    dispose: function () {}
  };
  var assTrack = { id: 'ass-lifecycle', format: 'ass', codec: 'ass', external: true, key: '/subtitles/lifecycle.ass', offset: 0 };
  playback.resumePosition = 0;
  playback.options.subtitleStreamID = assTrack.id;
  playback.subtitleTracks = [assTrack];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  var h = harness({
    playback: playback,
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    subtitleRendering: function () { return { srt: true, ass: true }; },
    loadSubtitleText: function (_config, _current, _track, callback) {
      callback(null, '[Script Info]\nTitle: lifecycle ASS');
      return null;
    },
    AssSubtitleRenderer: { create: function () { return renderer; } }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  h.video.currentTime = 4.25;
  h.video.dispatch('timeupdate');
  calls.length = 0;
  h.video.dispatch('waiting');
  assert.deepStrictEqual(calls[calls.length - 1], { time: 4.25, paused: true },
    'native waiting must freeze the autonomous ASS worker at the decoded video clock');
  h.video.dispatch('playing');
  assert.deepStrictEqual(calls[calls.length - 1], { time: 4.25, paused: false },
    'native playing must resume ASS from the current decoded video clock');
  h.video.dispatch('pause');
  assert.deepStrictEqual(calls[calls.length - 1], { time: 4.25, paused: true },
    'native pause must freeze ASS even when no timeupdate follows');
  h.video.paused = false;
  h.video.dispatch('seeking');
  assert.deepStrictEqual(calls[calls.length - 1], { time: 4.25, paused: true },
    'native seeking must freeze ASS while the decoded clock is discontinuous');
  h.controller.destroy();
}());


(function externalAssClockRecoversWhenBufferWatchdogSeesNativeAdvance() {
  var playback = playbackFixture();
  var calls = [];
  var renderer = {
    load: function (_content, callback) { callback(null); },
    setTime: function (time, paused) { calls.push({ time: time, paused: paused }); },
    show: function () {},
    hide: function () {},
    dispose: function () {}
  };
  var assTrack = { id: 'ass-watchdog', format: 'ass', codec: 'ass', external: true, key: '/subtitles/watchdog.ass', offset: 0 };
  playback.resumePosition = 0;
  playback.options.subtitleStreamID = assTrack.id;
  playback.subtitleTracks = [assTrack];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  var h = harness({
    playback: playback,
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    subtitleRendering: function () { return { srt: true, ass: true }; },
    loadSubtitleText: function (_config, _current, _track, callback) {
      callback(null, '[Script Info]\nTitle: watchdog ASS');
      return null;
    },
    AssSubtitleRenderer: { create: function () { return renderer; } }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  h.video.currentTime = 4.25;
  h.video.dispatch('timeupdate');
  calls.length = 0;
  h.video.dispatch('waiting');
  h.root.runNextTimeout();
  h.video.currentTime = 4.5;
  h.root.runNextTimeout();
  h.video.currentTime = 4.8;
  h.root.runNextTimeout();
  assert.deepStrictEqual(calls[calls.length - 1], { time: 4.8, paused: false },
    'buffer watchdog recovery must resume ASS from the native clock even if LG omits playing/timeupdate during recovery');
  h.controller.destroy();
}());

(function forcedDirectFailureOffersAutomaticFallback() {
  var directPlayback = playbackFixture();
  var h;
  directPlayback.options.playbackMode = 'direct';
  h = harness({
    playback: directPlayback,
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    preparePlayback: function (config, current, options, callback) {
      callback({ code: 3, message: 'unsupported codec' });
      return null;
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' } });
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.preparations.length, 2, 'forced Direct mode must try Direct Play and Direct Stream before giving up');
  assert.strictEqual(h.directFallbacks.length, 1, 'a terminal forced-Direct failure must offer Automatic mode');
  assert.strictEqual(h.directFallbacks[0].retry instanceof Function, true, 'the error action must keep an explicit retry path');
  assert.strictEqual(h.directFallbacks[0].switchToAutomatic instanceof Function, true, 'the error action must expose an Automatic fallback');
  h.directFallbacks[0].switchToAutomatic();
  assert.strictEqual(h.controller.diagnostics().requestedMode, 'auto', 'the fallback must switch the requested mode to Automatic');
  assert.strictEqual(h.preparations.length, 3, 'switching to Automatic must immediately start a new attempt');
  h.controller.destroy();
}());

(function automaticTrackFailureDoesNotDropSelectedTrack() {
  var playback = playbackFixture();
  var h;
  playback.options.audioStreamID = 'a2';
  h = harness({
    playback: playback,
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    preparePlayback: function (config, current, options, callback) {
      callback({ code: 3, message: 'transcode unavailable' });
      return null;
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' } });
  h.root.runAllTimeouts(20);
  assert.deepStrictEqual(h.preparations.map(function (entry) { return entry.delivery; }), [
    'transcode', 'safe-transcode'
  ], 'Automatic playback must not fall back to native delivery after selected-track transcoding fails');
  h.controller.destroy();
}());

(function slowTranscodeDoesNotFallBackWithoutAnError() {
  var playback = playbackFixture();
  var h;
  playback.options.playbackMode = 'transcode';
  h = harness({ playback: playback });
  h.controller.open({ detail: { ratingKey: 'episode-1' } });
  assert.strictEqual(h.preparations[0].delivery, 'transcode', 'forced transcoding must start with the requested transcode attempt');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.preparations.length, 1, 'a slow transcode must remain active until the native player reports an actual failure');
  h.controller.destroy();
}());

(function playingCancelsTranscodeStartupFallback() {
  var playback = playbackFixture();
  var h;
  playback.options.playbackMode = 'transcode';
  h = harness({ playback: playback });
  h.controller.open({ detail: { ratingKey: 'episode-1' } });
  h.video.dispatch('playing');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.preparations.length, 1, 'a transcode stream that starts normally must not trigger a fallback');
  h.controller.destroy();
}());

(function transcodeNativeErrorFallsBackToSafePlan() {
  var playback = playbackFixture();
  var h;
  playback.options.playbackMode = 'transcode';
  h = harness({ playback: playback });
  h.controller.open({ detail: { ratingKey: 'episode-1' } });
  h.video.dispatch('error');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.preparations[1].delivery, 'safe-transcode', 'a native transcode startup error must use the bounded safe transcode fallback');
  h.controller.destroy();
}());

(function supersededOpeningAbortsTransport() {
  var callbacks = [];
  var requests = [];
  var h = harness({
    loadPlayback: function (config, key, session, preferences, callback) {
      var request = { aborted: false, abort: function () { this.aborted = true; } };
      callbacks.push(callback);
      requests.push(request);
      return request;
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-one' } });
  h.controller.open({ detail: { ratingKey: 'episode-two' } });
  assert.strictEqual(requests[0].aborted, true, 'opening another item must abort the superseded playback transport');
  callbacks[0](null, playbackFixture());
  assert.strictEqual(h.preparations.length, 0, 'a superseded playback response must not reach source preparation');
  callbacks[1](null, playbackFixture());
  assert.strictEqual(h.preparations.length, 1, 'the current playback response must continue normally');
  h.controller.destroy();
}());

(function closingPendingPreparationAbortsTransport() {
  var request = { aborted: false, abort: function () { this.aborted = true; } };
  var h = harness({ preparePlayback: function () { return request; } });
  h.controller.open({ detail: { ratingKey: 'episode-one' } });
  h.controller.close();
  assert.strictEqual(request.aborted, true, 'closing Player must abort a pending playback decision request');
  h.controller.destroy();
}());

(function latestItemSelectionOwnsMetadataLoading() {
  var callbacks = [];
  var requests = [];
  var h = harness({
    loadMetadata: function (config, key, callback) {
      var request = { aborted: false, abort: function () { this.aborted = true; } };
      callbacks.push(callback);
      requests.push(request);
      return request;
    }
  });
  h.controller.startItem({ ratingKey: 'episode-one' }, {});
  h.controller.startItem({ ratingKey: 'episode-two' }, {});
  assert.strictEqual(requests[0].aborted, true, 'a newer item selection must abort the previous metadata request');
  callbacks[0](null, { ratingKey: 'episode-one' });
  assert.strictEqual(h.preparations.length, 0, 'stale metadata must not open the superseded item');
  callbacks[1](null, { ratingKey: 'episode-two' });
  assert.strictEqual(h.preparations.length, 1, 'the latest selected item must continue to playback');
  h.controller.destroy();
}());

(function resumeAndAbsoluteClock() {
  var h = harness();
  h.controller.open({ detail: { ratingKey: 'episode-1' } });
  assert.deepStrictEqual(h.controller.diagnostics().buffered, [{ start: 0, end: 600 }], 'native buffered ranges must be exposed through controller diagnostics instead of read by another domain');
  assert.strictEqual(h.preparations[0].offset, 120, 'resume must request an offset stream at the saved absolute position');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 120, 'the public clock must anchor to the resume position before native playback starts');
  h.video.dispatch('canplay');
  h.root.runAllTimeouts();
  h.video.dispatch('playing');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 120, 'relative native time zero must still display the absolute stream offset');
  assert.strictEqual(h.timeline[h.timeline.length - 1].seconds, 120, 'Plex reports must use the same absolute position as the display');
}());

(function nativeResumeWaitsForSeekCompletionBeforeStarting() {
  var h = harness({
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  assert.strictEqual(h.video.autoplay, false, 'PlaybackController must own the first play request');
  h.video.dispatch('canplay');
  assert.strictEqual(h.video.currentTime, 40, 'resume must seek before playback starts');
  assert.strictEqual(h.video.paused, true, 'canplay must not start a stream before the native seek completes');
  h.video.dispatch('playing');
  assert.strictEqual(h.video.paused, true, 'a premature native playing event must not release the pending seek');
  h.video.dispatch('seeked');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.video.paused, false, 'playback must start after the native seek has been confirmed');
}());

(function reopenedPlaybackIgnoresPlayingBeforeCurrentSourceCanPlay() {
  var h = harness({
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.controller.close();
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('playing');
  assert.strictEqual(h.video.paused, true, 'a late playing event from the previous session must not start the reopened media');
  assert.strictEqual(h.controller.snapshot().streamSwitching, true, 'the reopened session must remain in startup until its own canplay event');
  assert.strictEqual(h.statuses.indexOf('playing'), -1, 'a stale playing event must not publish the new session as playing');
  h.video.dispatch('canplay');
  h.video.dispatch('seeked');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  assert.strictEqual(h.controller.snapshot().streamSwitching, false, 'the current source must still start normally after canplay');
  h.controller.destroy();
}());

(function nativeStartupDoesNotRequestPlayTwiceBeforePlaying() {
  var h = harness();
  var playCalls = 0;
  h.video.play = function () {
    playCalls += 1;
    return { catch: function () {} };
  };
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('canplay');
  h.root.runNextTimeout();
  assert.strictEqual(playCalls, 1, 'startup must issue one native play request');
  h.video.dispatch('canplay');
  assert.strictEqual(playCalls, 1, 'a second canplay before playing must not issue another native play request');
  h.video.dispatch('playing');
}());

(function nativeResumeDoesNotStartBeforePendingSeekCompletes() {
  var h = harness({
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  var playCalls = 0;
  h.video.play = function () {
    playCalls += 1;
    return { catch: function () {} };
  };
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('canplay');
  h.video.dispatch('canplay');
  h.root.runLatestTimeout();
  assert.strictEqual(playCalls, 0, 'a repeated canplay must not start playback while the native resume seek is pending');
  h.video.dispatch('seeked');
  h.root.runLatestTimeout();
  assert.strictEqual(playCalls, 1, 'playback must start once after the native resume seek completes');
  h.video.dispatch('playing');
}());

(function reportingBoundary() {
  var h = harness();
  h.playback.resumePosition = 10;
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 10 });
  h.video.dispatch('playing');
  assert.strictEqual(h.timeline.length, 0, 'the first twenty seconds must not be reported');
  h.video.currentTime = 11;
  h.video.dispatch('pause');
  assert.strictEqual(h.timeline[h.timeline.length - 1].seconds, 21, 'reporting must begin at the absolute twenty-second boundary');
}());

(function seekRestoresIntentAfterDecoderPauses() {
  ['seeked', 'missing-seeked', 'reopen'].forEach(function (mode) {
  [false, true].forEach(function (paused) {
    var h = harness({ capabilities: { directPlay: true } });
    h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
    h.video.dispatch('canplay');
    h.root.runAllTimeouts();
    h.video.dispatch('playing');
    h.video.paused = paused;
    h.controller.seekAbsolute(100, { immediate: true });
    h.video.pause();
    if (mode === 'seeked') { h.video.dispatch('seeked'); }
    if (mode === 'reopen') {
      h.video.currentTime = 0;
      h.video.dispatch('seeked');
      h.video.dispatch('canplay');
      h.video.dispatch('seeked');
    }
    h.root.runAllTimeouts();
    assert.strictEqual(h.video.paused, paused, mode + ' must restore the pre-seek play/pause intent');
    h.controller.destroy();
  });
  });
}());

(function seekDuringInitialStartupPreservesAutoplayIntent() {
  var h = harness({
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  assert.strictEqual(h.video.paused, true, 'the native element is technically paused before initial startup completes');
  h.controller.seekAbsolute(300, { immediate: true, source: 'initial-startup-seek' });
  h.video.dispatch('canplay');
  h.video.dispatch('seeked');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.video.paused, false, 'a startup seek must preserve the default autoplay intent instead of treating native pre-start pause as user intent');
  assert.ok(h.video.playCalls >= 1, 'the replacement startup source must request native play after the seek settles');
}());

(function seekDuringInitialPlayRequestPreservesAutoplayIntent() {
  var h = harness({
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('canplay');
  h.root.runNextTimeout();
  assert.strictEqual(h.video.playCalls, 1,
    'initial startup must already have requested native autoplay before playing is confirmed');
  h.video.paused = true;
  h.controller.seekAbsolute(300, { immediate: true, source: 'initial-play-pending-seek' });
  h.video.dispatch('seeked');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.video.paused, false,
    'a seek while the initial play request is pending must preserve autoplay even if webOS still reports the element as paused');
}());

(function bufferedSeekAndPreOffsetRebuild() {
  var h = harness();
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.controller.seekAbsolute(135, { immediate: true });
  assert.strictEqual(h.video.currentTime, 15, 'a buffered HLS seek must assign target minus stream offset');
  h.video.dispatch('seeked');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 135, 'a confirmed native seek must replace the public clock');
  var sourceCount = h.video.sourceWrites.length;
  h.controller.seekAbsolute(100, { immediate: true });
  assert.ok(h.video.sourceWrites.length > sourceCount, 'a target before the stream offset must rebuild instead of assigning a negative native time');
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 100, 'the rebuilt stream must be anchored at the exact absolute target');
}());

(function directStreamSeekRebuildReentersNormalPlaybackStartup() {
  var prepareCount = 0;
  var h = harness({
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    preparePlayback: function (config, current, options, callback) {
      prepareCount += 1;
      if (prepareCount === 1) { callback(new Error('unsupported codec')); }
      else { callback(null, 'https://stream/' + current.transcodeSession + '/' + Number(options.offset || 0)); }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.root.runNextTimeout();
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-stream', 'the setup must reach Direct Stream before testing its seek rebuild');
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  var clearCount = h.video.sourceClears;
  var preparationCount = h.preparations.length;
  h.controller.seekAbsolute(100, { immediate: true, forceRebuild: true });
  assert.strictEqual(h.video.sourceClears, clearCount + 1, 'cold reopen must clear the previous native source through normal open teardown');
  assert.ok(h.preparations.length > preparationCount, 'cold reopen must immediately re-enter the normal playback preparation plan');
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-stream', 'cold reopen must preserve a delivery already selected after real incompatibility');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 100, 'the fresh playback lifecycle must retain the requested absolute target while the normal strategy is re-evaluated');
}());

(function recoveryKeepsLatestRebuildTarget() {
  var h = harness();
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.controller.seekAbsolute(1440, { immediate: true });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts();
  h.video.dispatch('playing');
  h.controller.seekAbsolute(1036, { immediate: true });
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 1036, 'a backward rebuild must prepare the requested absolute target');
  h.video.dispatch('error');
  h.root.runAllTimeouts();
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 1036, 'recovery after a backward rebuild must not reuse an older near-end stream offset');
}());

(function latestSeekSupersedesUnreadyStreamSwitch() {
  var h = harness();
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.controller.seekAbsolute(1440, { immediate: true });
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 1440, 'the first seek must start its replacement stream');
  h.controller.seekAbsolute(1036, { immediate: true });
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 1036, 'a later backward seek must replace an unready stream instead of waiting for canplay forever');
}());

(function runningDirectPlayCannotBeDemotedByCompatibilityMemoryOnReplan() {
  ['reopen', 'track', 'settings'].forEach(function (action) {
    var skip = false;
    var h = harness({ capabilities: { directPlay: true }, compatibilityMemory: { shouldSkip: function () { return skip; } } });
    h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
    h.video.dispatch('canplay');
    h.video.dispatch('playing');
    skip = true;
    if (action === 'reopen') { h.controller.seekAbsolute(100, { immediate: true, forceRebuild: true }); }
    if (action === 'track') { h.controller.changeTrack('subtitles', 's1'); }
    if (action === 'settings') { h.controller.changeVersion({ kind: 'apply-settings' }); }
    assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-play', action + ' must prefer the current usable delivery over learned hints');
    h.controller.destroy();
  });
}());

(function genericNativeMessagesAreNotCompatibilityEvidence() {
  ['decoder timeout', 'container request failed', 'direct stream unavailable', 'unsupported operation', 'format metadata unavailable'].forEach(function (message) {
    var h = harness({ capabilities: { directPlay: true } });
    h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
    h.video.error = new Error(message);
    h.video.dispatch('error');
    h.root.runAllTimeouts();
    assert.strictEqual(h.preparations.length, 1, message + ' must not advance the delivery plan');
    assert.strictEqual(h.controller.snapshot().playback.options.delivery, 'direct-play');
    h.controller.destroy();
  });
}());

(function incompatibleTrackSelectionMustApplyTheNewPlan() {
  var h = harness({ capabilities: { directPlay: true } });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('canplay');
  h.video.dispatch('playing');
  h.video.currentTime = 145;
  h.video.dispatch('timeupdate');
  h.controller.changeTrack('audio', 'a2');
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'transcode', 'non-native audio selection must install the authorized plan, not old DP options');
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 145);
  assert.ok(/FALLBACK\[selection:tracks\] > TC/.test(h.controller.snapshot().playback.diagnosticRecoveryTrace));
}());

(function repeatedNativeErrorCannotConsumeAnUnattemptedDelivery() {
  var retry;
  var h = harness({ capabilities: { directPlay: true }, showError: function (offline, callback) { retry = callback; } });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.error = { code: 3 };
  h.video.dispatch('error');
  h.video.dispatch('error');
  h.root.runAllTimeouts();
  assert.deepStrictEqual(h.preparations.map(function (p) { return p.delivery; }), ['direct-play', 'direct-stream'], 'duplicate DP errors must not consume the still unattempted DS step');
  h.video.error = { code: 2 };
  h.video.dispatch('error');
  assert.strictEqual(h.preparations.length, 2, 'DS network errors do not silently consume transcode');
  retry();
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-stream', 'manual retry preserves confirmed fallback');
}());

(function terminalDirectStreamSeekUsesAnExactOffsetAfterConfirmedDirectPlayFailure() {
  var prepareCount = 0;
  var h = harness({
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    preparePlayback: function (config, current, options, callback) {
      prepareCount += 1;
      if (prepareCount === 1 && options.delivery === 'direct-play') { callback({ code: 3, message: 'unsupported codec' }); }
      else { callback(null, 'https://stream/' + current.transcodeSession + '/' + Number(options.offset || 0)); }
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.controller.snapshot().playback.options.delivery, 'direct-stream', 'confirmed Direct Play incompatibility must still allow Direct Stream');
  h.video.dispatch('playing');
  h.controller.seekAbsolute(1800, { immediate: true, forceRebuild: true });
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 1789, 'a terminal Direct Stream seek must start eleven seconds before the media end to retain keyframe context');
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-stream', 'a terminal Direct Stream seek must not force transcoding');
  assert.strictEqual(h.playback.terminalEndPause, true, 'a final-five-second seek must request a paused terminal state');
  assert.strictEqual(h.playback.terminalSeekTarget, 1800, 'the terminal target must remain the authoritative absolute Plex position');
  assert.strictEqual(h.playback.terminalNativeSeekTarget, 11, 'the terminal target must be translated to the replacement stream clock');
}());

(function terminalDirectPlaySeekStaysDirectPlay() {
  var h = harness({ capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false } });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.controller.seekAbsolute(1800, { immediate: true, forceRebuild: true });
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 0, 'a terminal Direct Play retry must keep the full-file native source clock');
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-play', 'terminal-window recovery must not consume Direct Stream while Direct Play remains usable');
  assert.strictEqual(h.playback.terminalEndPause, true, 'a final-five-second Direct Play seek must retain the paused terminal state');
  assert.strictEqual(h.playback.terminalSeekTarget, null, 'Direct Play must not manufacture an offset-stream terminal target');
  assert.strictEqual(h.playback.terminalNativeSeekTarget, null, 'Direct Play must keep native full-file timing in the terminal window');
  assert.strictEqual(h.controller.snapshot().playback.diagnosticRecoveryTrace, 'DP > RETRY[seek] > DP',
    'the recovery trace must expose a sticky terminal Direct Play retry without a fallback token');
}());

(function terminalSeekKeepsTranscodingButUsesABoundedTailWindow() {
  var playback = playbackFixture();
  var h;
  playback.options.playbackMode = 'transcode';
  h = harness({ playback: playback });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.controller.seekAbsolute(1800, { immediate: true });
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'transcode');
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 1789);
  assert.strictEqual(h.playback.terminalNativeSeekTarget, 11);
}());

(function terminalDirectPlayWindowUsesTheSameAbsoluteClockBeforeTheFinalFiveSeconds() {
  var h = harness({ capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false } });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.controller.seekAbsolute(1792, { immediate: true, forceRebuild: true });
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 0, 'a Direct Play seek eight seconds before the end must retain its full-file source clock');
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-play', 'the Direct Play terminal window must remain sticky');
  assert.strictEqual(h.playback.directSeekTarget, 1792, 'the eight-second absolute target must remain a native Direct Play seek');
  assert.strictEqual(h.playback.terminalNativeSeekTarget, null, 'Direct Play must not translate the target into an offset stream clock');
  assert.strictEqual(h.playback.terminalEndPause, false, 'a seek more than five seconds before the end must continue normally');
}());

(function finalFiveSecondsJumpToPausedMediaEnd() {
  var h = harness({ capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false } });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.controller.seekAbsolute(1796, { immediate: true });
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 0, 'a Direct Play seek inside the final five seconds must retain the full-file source');
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-play', 'final-five-second recovery must not fall through to Direct Stream');
  assert.strictEqual(h.playback.terminalEndPause, true, 'a final-five-second seek must request a paused terminal state');
  h.video.dispatch('canplay');
  assert.ok(h.video.currentTime > 1799.9, 'the terminal pause must seek to the end of the full Direct Play source');
  h.video.dispatch('seeked');
  h.root.runAllTimeouts();
  assert.strictEqual(h.video.paused, true, 'the final-five-second seek must remain paused');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 1800, 'the paused terminal state must expose the authoritative media duration');
  assert.strictEqual(h.ended(), 1, 'the paused terminal state must hand control to the existing Up Next path once');
}());

(function terminalPauseUsesDirectPlayNativeClockWhenDirectPlayRemainsUsable() {
  var h = harness({ capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false } });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.controller.seekAbsolute(1796, { immediate: true });
  h.video.dispatch('canplay');
  assert.ok(h.video.currentTime > 1799.9 && h.video.currentTime <= 1800);
}());

(function terminalSeekVerificationTimeoutDoesNotLoop() {
  var h = harness({ capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false } });
  var preparations;
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.controller.seekAbsolute(1796, { immediate: true });
  h.video.dispatch('canplay');
  preparations = h.preparations.length;
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.preparations.length, preparations);
  assert.strictEqual(h.ended(), 1);
  assert.strictEqual(h.controller.snapshot().positionSeconds, 1800);
}());

(function lateNativeEventsCannotRestartCompletedTerminalPlayback() {
  var h = harness({ capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false } });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.controller.seekAbsolute(1796, { immediate: true });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.ended(), 1);
  h.video.dispatch('canplay');
  h.video.dispatch('playing');
  h.video.dispatch('waiting');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.video.paused, true);
  assert.strictEqual(h.loading[h.loading.length - 1].value, false);
  assert.strictEqual(h.ended(), 1);
}());

(function terminalDirectPlaySeekCannotFallThroughToDirectStreamEvenWithCurrentEndRange() {
  var h = harness({ capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false } });
  h.video.buffered = ranges([[0, 1800]]);
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.controller.seekAbsolute(1800, { immediate: true, forceRebuild: true });
  assert.strictEqual(h.preparations.length, 2, 'a terminal seek must rebuild even when the current stream reports the end as buffered');
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 0, 'the terminal Direct Play retry must retain the full-file native clock');
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-play', 'the terminal rebuild must keep Direct Play sticky');
}());

(function fractionalDurationKeepsDirectPlayStickyInTheTerminalWindow() {
  var playback = playbackFixture();
  var h;
  playback.duration = 3339083;
  h = harness({ playback: playback, capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false } });
  h.video.buffered = ranges([[0, 3339.083]]);
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.controller.seekAbsolute(3330, { immediate: true, forceRebuild: true });
  assert.strictEqual(h.preparations.length, 2, 'a whole-second TV seek at the terminal guard must rebuild a fractional-duration stream');
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 0, 'the rebuilt Direct Play stream must keep its full-file native clock for fractional durations');
  assert.strictEqual(h.playback.directSeekTarget, 3330, 'fractional durations must preserve the exact absolute native seek');
  assert.strictEqual(h.playback.terminalNativeSeekTarget, null, 'fractional Direct Play must not invent an offset-stream seek target');
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-play', 'fractional Plex durations must remain Direct Play while native playback is usable');
}());

(function publicTimelineNeverExceedsPlexDurationAfterTerminalSeek() {
  var h = harness({ capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false } });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.controller.seekAbsolute(1792, { immediate: true, forceRebuild: true });
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 0, 'terminal Direct Play protection must keep the full-file source clock');
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-play', 'terminal Direct Play protection must not fall through to Direct Stream');
  h.video.dispatch('canplay');
  h.root.runAllTimeouts();
  assert.strictEqual(h.video.currentTime, 1792, 'the Direct Play source must seek to the absolute terminal target');
  h.video.dispatch('seeked');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 1792, 'the verified relative seek must restore the absolute terminal target');
  h.video.dispatch('playing');
  h.video.currentTime = 1805;
  h.video.dispatch('timeupdate');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 1800, 'a native Direct Play clock beyond Plex duration must be hidden from the public timeline');
  h.video.dispatch('ended');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 1800, 'ended playback must remain anchored at the authoritative duration');
  assert.strictEqual(h.timeline[h.timeline.length - 1].seconds, 1800, 'terminal Plex reporting must never exceed the media duration');
  var preparationCount = h.preparations.length;
  h.controller.seekAbsolute(1700, { immediate: true });
  assert.strictEqual(h.preparations.length, preparationCount, 'leaving the terminal guard on a seekable Direct Play source must not replace the transport');
  assert.strictEqual(h.controller.snapshot().playback.options.delivery, 'direct-play', 'leaving the terminal guard must keep Direct Play active');
  assert.strictEqual(h.video.currentTime, 1700, 'the existing Direct Play source must seek to the requested absolute backward target');
}());

(function stalePrepareResponseCannotReplaceLatestSeekStream() {
  var callbacks = [];
  var h = harness({
    preparePlayback: function (config, current, options, callback) { callbacks.push(callback); }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.controller.seekAbsolute(1036, { immediate: true });
  assert.strictEqual(callbacks.length, 2, 'a seek during preparation must start a replacement source request');
  callbacks[0](null, 'https://stream/stale/120');
  assert.strictEqual(h.video.sourceWrites.length, 0, 'a stale preparation response must not replace the newer stream');
  callbacks[1](null, 'https://stream/current/1036');
  assert.strictEqual(h.video.sourceWrites[h.video.sourceWrites.length - 1], 'https://stream/current/1036', 'the latest preparation response must own the native source');
}());

(function namespaceRotationAndTrackPosition() {
  var h = harness();
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.video.currentTime = 25;
  h.video.dispatch('timeupdate');
  var before = h.playback.transcodeSession;
  h.controller.changeTrack('audio', 'a2');
  assert.strictEqual(h.selections[h.selections.length - 1].audio, 'a2', 'track changes must update Plex selection');
  assert.notStrictEqual(h.playback.transcodeSession, before, 'track rebuilds must rotate the stream namespace');
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 145, 'track changes must rebuild at the current non-zero absolute position');
}());

(function directPlayTrackChangeKeepsDirectPlaySticky() {
  var h = harness({ capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false } });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('canplay');
  h.video.dispatch('seeked');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  h.video.currentTime = 145;
  h.video.dispatch('timeupdate');
  h.controller.changeTrack('subtitles', 's1');
  assert.strictEqual(h.selections[h.selections.length - 1].subtitle, 's1', 'Direct Play track changes must still update Plex selection');
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-play', 'stream switching must not consume Direct Stream while the selected track remains Direct Play capable');
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 0, 'Direct Play stream switching must retain the full-file native clock');
  assert.strictEqual(h.playback.directSeekTarget, 145, 'the replacement Direct Play source must restore the absolute track-switch position with a native seek');
  assert.strictEqual(h.controller.snapshot().playback.diagnosticRecoveryTrace, 'DP > RETRY[rebuild] > DP',
    'track switching diagnostics must expose a same-delivery retry instead of a fallback');
}());

(function versionChangeResolvesTracksForNewPart() {
  var playback = playbackFixture();
  playback.mediaVersions.push({
    mediaIndex: 1, partIndex: 0, partId: 'part-2', partKey: '/library/parts/2',
    fileName: 'episode-alt.mkv', fileSize: 20, container: 'mkv', videoCodec: 'h264', width: 1920, height: 1080,
    audioTracks: [{ id: 'a10', languageCode: 'ita' }],
    subtitleTracks: [{ id: 's10', languageCode: 'ita', format: 'srt', codec: 'srt', external: true, key: '/subtitles/10.srt' }]
  });
  var resolvedAgainstNewTracks = false;
  var h = harness({
    playback: playback,
    resolveVersionTracks: function (current) {
      resolvedAgainstNewTracks = current.audioTracks[0].id === 'a10' && current.subtitleTracks[0].id === 's10';
      return { audioStreamID: 'a10', subtitleStreamID: 's10' };
    }
  });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.controller.changeVersion({ mediaIndex: 1, partIndex: 0, apply: false });
  assert.strictEqual(resolvedAgainstNewTracks, true, 'track policy must run after the selected version replaces its media tracks');
  assert.strictEqual(h.controller.snapshot().playback.options.audioStreamID, 'a10', 'version changes must select a valid audio stream from the new part');
  assert.strictEqual(h.controller.snapshot().playback.options.subtitleStreamID, 's10', 'version changes must select a valid subtitle stream from the new part');
}());

(function directPlayUnsafeSeekColdReopensBeforeFallback() {
  var directPlayback = playbackFixture();
  directPlayback.resumePosition = 0;
  var h = harness({
    playback: directPlayback,
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  h.video.seekable = ranges([[0, 100]]);
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  assert.strictEqual(h.preparations[0].delivery, 'direct-play', 'a compatible initial playback may use Direct Play');
  h.video.dispatch('playing');
  h.controller.seekAbsolute(300, { immediate: true });
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-play', 'an unsafe Direct Play seek must cold-reopen and retry the normal Direct Play strategy before fallback');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 300, 'the cold reopen must preserve the requested absolute position');
}());

(function bufferingFreezesClock() {
  var h = harness();
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.video.currentTime = 10;
  h.video.dispatch('timeupdate');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 130);
  h.video.dispatch('waiting');
  h.root.runNextTimeout();
  h.video.currentTime = 0;
  h.video.dispatch('timeupdate');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 130, 'buffering must freeze a transient native clock reset');
  assert.strictEqual(h.controller.snapshot().buffering, true, 'the buffering spinner state must reconcile with the frozen clock');
  h.video.dispatch('playing');
  assert.strictEqual(h.controller.snapshot().buffering, true, 'playing with an implausible native reset must stay behind the settlement barrier');
  h.video.currentTime = 11;
  h.root.runLatestTimeout();
  assert.strictEqual(h.controller.snapshot().buffering, false, 'a stable native sample must clear buffering after bounded settlement');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 131, 'the stable post-buffer sample must restore the absolute offset clock');
}());

(function boundedClockRepair() {
  var h = harness();
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.video.currentTime = 20;
  h.video.dispatch('timeupdate');
  h.video.currentTime = 0;
  h.video.dispatch('timeupdate');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.controller.snapshot().clockRepairCount, 1, 'an unexpected regression must rebuild exactly once');
  var preparationCount = h.preparations.length;
  h.video.dispatch('playing');
  h.video.currentTime = 0;
  h.video.dispatch('timeupdate');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.preparations.length, preparationCount, 'the same unstable playback must not oscillate through repeated clock repairs');
}());

(function directPlayClockRepairKeepsDirectPlaySticky() {
  var h = harness({ capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false } });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('playing');
  h.video.currentTime = 20;
  h.video.dispatch('timeupdate');
  h.video.currentTime = 0;
  h.video.dispatch('timeupdate');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-play', 'clock repair must cold-reopen Direct Play without consuming Direct Stream');
  assert.strictEqual(h.controller.snapshot().playback.diagnosticRecoveryTrace, 'DP > REOPEN[clock-repair] > DP',
    'clock-repair diagnostics must retain the Direct Play reopen path');
}());

(function directPlayResumeAdoptsFirstDecodedKeyframeWithoutRebuild() {
  var playback = playbackFixture();
  playback.resumePosition = 988;
  var h = harness({
    playback: playback,
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  h.video.seekable = ranges([[0, 1100]]);
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 988 });
  assert.strictEqual(h.preparations[0].delivery, 'direct-play', 'a compatible resume must retain Direct Play');
  h.video.dispatch('canplay');
  h.video.dispatch('seeked');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  assert.strictEqual(h.loading[h.loading.length - 1].value, true, 'the initial frame must remain covered until the decoder publishes a reliable timestamp');
  h.video.currentTime = 981.8;
  h.video.dispatch('timeupdate');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.preparations.length, 1, 'the first bounded keyframe rollback must not replace the Direct Play source');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 981.8, 'the public clock must adopt the keyframe that is actually being decoded');
  assert.strictEqual(h.loading[h.loading.length - 1].value, false, 'the frame must be revealed after the native clock settles');
  assert.strictEqual(h.timeline[h.timeline.length - 1].seconds, 981.8, 'the first playing report must use the decoded keyframe rather than the optimistic seek target');
  h.video.currentTime = 975;
  h.video.dispatch('timeupdate');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.preparations.length, 2, 'a later regression must retain the established rebuild recovery');
  assert.deepStrictEqual(playbackEffectTrace(h), {
    sources: ['https://stream/session-1/0', 'https://stream/session-2/0'],
    seeks: [988, 981.8, 975],
    preparations: [
      { offset: 0, delivery: 'direct-play', safeTranscode: false, subtitle: '', localSubtitleOverlay: false, session: 'session-1' },
      { offset: 0, delivery: 'direct-play', safeTranscode: false, subtitle: '', localSubtitleOverlay: false, session: 'session-2' }
    ],
    timeline: [{ state: 'playing', seconds: 981.8 }, { state: 'stopped', seconds: 981.8 }],
    overlays: [],
    playCalls: 1,
    sourceClears: 2
  }, 'golden Direct Play resume trace must preserve settlement before cold-reopen recovery');
}());

(function directPlayBackwardSeekAdoptsDecodedKeyframeAfterBuffering() {
  var playback = playbackFixture();
  playback.resumePosition = 0;
  var h = harness({
    playback: playback,
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  h.video.seekable = ranges([[0, 1100]]);
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('playing');
  h.video.currentTime = 600;
  h.video.dispatch('timeupdate');
  h.controller.seekAbsolute(300, { immediate: true });
  h.video.dispatch('seeked');
  h.video.currentTime = 301;
  h.video.dispatch('timeupdate');
  h.video.dispatch('waiting');
  h.root.runNextTimeout();
  h.video.dispatch('playing');
  h.video.currentTime = 294;
  h.video.dispatch('timeupdate');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.preparations.length, 1, 'a bounded post-seek keyframe rollback must not replace the Direct Play source');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 294, 'the public and subtitle clock must adopt the post-buffer decoded keyframe');
  h.video.currentTime = 280;
  h.video.dispatch('timeupdate');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.preparations.length, 2, 'a second regression after seek settlement must retain bounded rebuild recovery');
  assert.deepStrictEqual(playbackEffectTrace(h), {
    sources: ['https://stream/session-1/0', 'https://stream/session-2/0'],
    seeks: [600, 300, 301, 294, 280],
    preparations: [
      { offset: 0, delivery: 'direct-play', safeTranscode: false, subtitle: '', localSubtitleOverlay: false, session: 'session-1' },
      { offset: 0, delivery: 'direct-play', safeTranscode: false, subtitle: '', localSubtitleOverlay: false, session: 'session-2' }
    ],
    timeline: [{ state: 'playing', seconds: 300 }, { state: 'playing', seconds: 301 }, { state: 'stopped', seconds: 294 }],
    overlays: [],
    playCalls: 0,
    sourceClears: 2
  }, 'golden backward-seek trace must settle in place before cold-reopen recovery');
}());

(function directPlayForwardSeekAdoptsDecodedKeyframeAfterBuffering() {
  var playback = playbackFixture();
  playback.resumePosition = 0;
  var h = harness({
    playback: playback,
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  h.video.seekable = ranges([[0, 1100]]);
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('playing');
  h.video.currentTime = 100;
  h.video.dispatch('timeupdate');
  h.controller.seekAbsolute(500, { immediate: true });
  h.video.dispatch('seeked');
  assert.strictEqual(h.controller.snapshot().decoderSettlementPending, true,
    'a verified Direct Play seek must expose its decoder-settlement phase to presentation owners');
  h.video.currentTime = 501;
  h.video.dispatch('timeupdate');
  h.video.dispatch('waiting');
  h.root.runNextTimeout();
  h.video.dispatch('playing');
  h.video.currentTime = 494;
  h.video.dispatch('timeupdate');
  assert.strictEqual(h.controller.snapshot().decoderSettlementPending, false,
    'decoder settlement must clear once the bounded rollback has been adopted');
  h.root.runAllTimeouts(20);
  assert.strictEqual(h.preparations.length, 1, 'a forward seek keyframe rollback must not replace the Direct Play source');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 494, 'forward seek content, timeline, and subtitles must adopt the decoded keyframe');
  assert.deepStrictEqual(playbackEffectTrace(h), {
    sources: ['https://stream/session-1/0'],
    seeks: [100, 500, 501, 494],
    preparations: [
      { offset: 0, delivery: 'direct-play', safeTranscode: false, subtitle: '', localSubtitleOverlay: false, session: 'session-1' }
    ],
    timeline: [{ state: 'playing', seconds: 500 }, { state: 'playing', seconds: 501 }],
    overlays: [],
    playCalls: 0,
    sourceClears: 1
  }, 'golden forward-seek trace must remain Direct Play and adopt the decoded keyframe');
}());

(function directPlayPostSeekKeyframeRollbackInvalidatesAssAtDecodedTime() {
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
      callback(null, '[Script Info]\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:10:22.00,0:10:24.00,Default,,0,0,0,,Earlier\nDialogue: 0,0:10:27.00,0:10:29.70,Default,,0,0,0,,Requested target');
      return { abort: function () {} };
    },
    AssSubtitleRenderer: {
      create: function () {
        rendererInstance = {
          load: function (_content, callback) { callback(null); },
          discontinuities: [],
          setTime: function (time, paused) { rendererInstance.time = time; rendererInstance.paused = paused; },
          discontinuity: function (time) { rendererInstance.discontinuities.push(time); },
          show: function () {}, hide: function () {}, dispose: function () {}
        };
        return rendererInstance;
      }
    }
  });
  h.video.seekable = ranges([[0, 1100]]);
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('playing');
  h.video.currentTime = 600;
  h.video.dispatch('timeupdate');
  h.controller.seekAbsolute(629, { immediate: true, source: 'chapter' });
  h.video.dispatch('seeking');
  h.video.dispatch('seeked');
  assert.strictEqual(h.controller.snapshot().decoderSettlementPending, true,
    'a seek initially reported at the requested chapter must retain the bounded decoder-settlement window');
  assert.strictEqual(rendererInstance.discontinuities[rendererInstance.discontinuities.length - 1], 629,
    'the committed seek must initially invalidate ASS at the requested chapter target');
  h.video.currentTime = 623;
  h.video.dispatch('timeupdate');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 623,
    'the public clock must adopt the nearby keyframe actually decoded by webOS');
  assert.strictEqual(rendererInstance.discontinuities[rendererInstance.discontinuities.length - 1], 623,
    'a later decoder rollback accepted during timeupdate must invalidate the ASS presentation at the decoded keyframe');
  assert.strictEqual(rendererInstance.time, 623,
    'after invalidation the ASS clock must render from the same decoded keyframe as video and public time');
}());


(function assSeekRebufferKeepsOverlayHiddenUntilPlaying() {
  var playback = playbackFixture();
  var rendererInstance;
  playback.resumePosition = 0;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/1.ass' }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  var h = harness({
    playback: playback,
    subtitleRendering: function () { return { srt: false, ass: true }; },
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false },
    loadSubtitleText: function (_config, _current, _track, callback) {
      callback(null, '[Script Info]\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:10:27.00,0:10:29.70,Default,,0,0,0,,Requested target');
      return { abort: function () {} };
    },
    AssSubtitleRenderer: {
      create: function () {
        rendererInstance = {
          load: function (_content, callback) { callback(null); },
          setTime: function (time, paused) { rendererInstance.time = time; rendererInstance.paused = paused; },
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
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('playing');
  h.video.currentTime = 600;
  h.video.dispatch('timeupdate');
  assert.strictEqual(rendererInstance.visible, true, 'ASS must be visible during stable playback before the seek');

  h.controller.seekAbsolute(629, { immediate: true, source: 'chapter' });
  assert.strictEqual(rendererInstance.visible, false,
    'a committed seek that may rebuffer must hide the ASS overlay before any target frame can flash');
  h.video.readyState = 2;
  h.video.dispatch('seeking');
  h.video.dispatch('waiting');
  h.video.readyState = 4;
  h.video.dispatch('seeked');
  h.video.currentTime = 623;
  h.video.dispatch('timeupdate');
  assert.strictEqual(rendererInstance.discontinuityTime, 623,
    'decoder settlement must still move the ASS epoch to the real keyframe while the overlay is hidden');
  assert.strictEqual(rendererInstance.visible, false,
    'ASS must remain hidden through seek settlement and rebuffer samples before playback resumes');

  h.video.readyState = 4;
  h.video.dispatch('playing');
  assert.strictEqual(rendererInstance.visible, true,
    'the first stable playing event after the seek must release the ASS overlay');
  assert.strictEqual(rendererInstance.time, 623,
    'the released ASS overlay must use the settled keyframe clock, not the original seek target');
}());

(function assPausedSeekKeepsTargetSubtitleHiddenUntilPlaybackSettles() {
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
      callback(null, '[Script Info]\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:10:27.00,0:10:29.70,Default,,0,0,0,,Requested target');
      return { abort: function () {} };
    },
    AssSubtitleRenderer: {
      create: function () {
        rendererInstance = {
          load: function (_content, callback) { callback(null); },
          setTime: function (time, paused) { rendererInstance.time = time; rendererInstance.paused = paused; },
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
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('playing');
  h.video.currentTime = 600;
  h.video.dispatch('timeupdate');
  h.video.dispatch('pause');
  assert.strictEqual(rendererInstance.visible, true, 'test setup must have a visible ASS overlay before the paused seek');

  h.controller.seekAbsolute(629, { immediate: true, source: 'chapter-paused' });
  assert.strictEqual(rendererInstance.visible, false,
    'a seek committed while paused must hide the subtitle at the requested target before playback proves the decoded position');
  h.video.dispatch('seeking');
  h.video.dispatch('seeked');
  h.video.dispatch('timeupdate');
  assert.strictEqual(rendererInstance.visible, false,
    'the requested 10:29 subtitle must remain hidden while playback is still paused at the provisional seek target');

  h.controller.toggle();
  h.video.dispatch('playing');
  assert.strictEqual(rendererInstance.visible, false,
    'the playing event itself must not expose the provisional target before the decoder settlement sample arrives');
  h.video.currentTime = 623;
  h.video.dispatch('timeupdate');
  assert.strictEqual(rendererInstance.visible, true,
    'the overlay may become visible once playback has adopted the real decoded keyframe');
  assert.strictEqual(rendererInstance.time, 623,
    'the first visible subtitle after a paused seek must use the settled 10:23 clock');
}());

(function assPlayingSeekWithoutRebufferHidesProvisionalTargetUntilDecoderMoves() {
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
      callback(null, '[Script Info]\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:10:27.00,0:10:29.70,Default,,0,0,0,,Requested target');
      return { abort: function () {} };
    },
    AssSubtitleRenderer: {
      create: function () {
        rendererInstance = {
          load: function (_content, callback) { callback(null); },
          setTime: function (time, paused) { rendererInstance.time = time; rendererInstance.paused = paused; },
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
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('playing');
  h.video.currentTime = 600;
  h.video.dispatch('timeupdate');
  assert.strictEqual(rendererInstance.visible, true, 'test setup must have a visible ASS overlay before the playing seek');

  h.controller.seekAbsolute(629, { immediate: true, source: 'chapter-playing' });
  assert.strictEqual(rendererInstance.visible, false, 'the overlay must hide as soon as the playing seek is committed');
  h.video.dispatch('seeking');
  h.video.dispatch('seeked');
  h.video.dispatch('timeupdate');
  assert.strictEqual(rendererInstance.visible, false,
    'a no-rebuffer timeupdate still parked on the provisional 10:29 target must not flash its subtitle');

  h.video.currentTime = 623;
  h.video.dispatch('timeupdate');
  assert.strictEqual(rendererInstance.visible, true,
    'the overlay may return after the decoder exposes the actual post-seek keyframe');
  assert.strictEqual(rendererInstance.time, 623,
    'the no-rebuffer seek must first render from the settled 10:23 clock');
}());

(function assPlayingSeekWithoutRollbackReleasesAfterNativeClockActuallyAdvances() {
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
      callback(null, '[Script Info]\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,48,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:10:27.00,0:10:31.00,Default,,0,0,0,,Requested target');
      return { abort: function () {} };
    },
    AssSubtitleRenderer: {
      create: function () {
        rendererInstance = {
          load: function (_content, callback) { callback(null); },
          setTime: function (time, paused) { rendererInstance.time = time; rendererInstance.paused = paused; },
          discontinuity: function () {},
          show: function () { rendererInstance.visible = true; },
          hide: function () { rendererInstance.visible = false; },
          dispose: function () {}
        };
        return rendererInstance;
      }
    }
  });
  h.video.seekable = ranges([[0, 1100]]);
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('playing');
  h.video.currentTime = 600;
  h.video.dispatch('timeupdate');
  h.controller.seekAbsolute(629, { immediate: true, source: 'chapter-playing-forward' });
  h.video.dispatch('seeking');
  h.video.dispatch('seeked');
  h.video.dispatch('timeupdate');
  assert.strictEqual(rendererInstance.visible, false,
    'the exact provisional target sample must remain hidden until native playback actually advances');
  h.video.currentTime = 629.2;
  h.video.dispatch('timeupdate');
  assert.strictEqual(rendererInstance.visible, true,
    'a seek with no rollback must not suppress subtitles for the full decoder-settlement window once playback is advancing');
  assert.strictEqual(rendererInstance.time, 629.2,
    'the released overlay must follow the advancing native clock when no rollback occurs');
}());

(function directPlaySeekAfterBufferAdoptsRealDecodedKeyframeInsteadOfRebuilding() {
  var playback = playbackFixture();
  var rendererInstance;
  playback.resumePosition = 0;
  playback.options.subtitleStreamID = 'ass';
  playback.subtitleTracks = [{ id: 'ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/1.ass' }];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  var h = harness({
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
          load: function (_content, callback) { callback(null); },
          discontinuities: [],
          setTime: function (time, paused) { rendererInstance.time = time; rendererInstance.paused = paused; },
          discontinuity: function (time) { rendererInstance.discontinuities.push(time); },
          show: function () {}, hide: function () {}, dispose: function () {}
        };
        return rendererInstance;
      }
    }
  });
  h.video.seekable = ranges([[0, 1100]]);
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('playing');
  h.video.currentTime = 862.1;
  h.video.dispatch('timeupdate');

  h.video.dispatch('waiting');
  h.video.dispatch('canplay');
  h.video.dispatch('playing');
  assert.strictEqual(h.controller.snapshot().buffering, false, 'the preceding buffer must be completely settled before the reproducing seek');
  assert.strictEqual(h.preparations.length, 1, 'the preceding accepted buffer must not itself replace the Direct Play source');

  h.controller.seekAbsolute(872.1, { immediate: true });
  h.video.dispatch('seeking');
  h.video.currentTime = 862.502;
  h.video.dispatch('timeupdate');
  h.video.dispatch('seeked');

  assert.strictEqual(h.preparations.length, 1,
    'a 9.598 second Direct Play keyframe rollback after buffering must not force a Direct Stream rebuild');
  assert.strictEqual(h.playback.options.delivery, 'direct-play',
    'the accepted decoded keyframe must preserve Direct Play ownership');
  assert.strictEqual(Number(h.playback.offsetBase || 0), 0,
    'the accepted keyframe must not manufacture a Direct Stream offset domain');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 862.502,
    'timeline and local subtitles must adopt the keyframe actually decoded by webOS');
  assert.strictEqual(h.controller.snapshot().decoderSettlementPending, false,
    'the seeked sample itself must settle the bounded Direct Play rollback');
  assert.strictEqual(rendererInstance.discontinuities[rendererInstance.discontinuities.length - 1], 862.502,
    'accepting the real post-buffer keyframe must reset the ASS epoch at the decoded video position');
  assert.strictEqual(rendererInstance.time, 862.502,
    'the local ASS clock must resume from the same decoded keyframe as the video timeline');
}());

(function directPlaySeekStillRebuildsWhenDecodedRollbackExceedsPolicy() {
  var playback = playbackFixture();
  playback.resumePosition = 0;
  var h = harness({
    playback: playback,
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  h.video.seekable = ranges([[0, 1100]]);
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 0 });
  h.video.dispatch('playing');
  h.video.currentTime = 862.1;
  h.video.dispatch('timeupdate');
  h.controller.seekAbsolute(872.1, { immediate: true });
  h.video.dispatch('seeking');
  h.video.currentTime = 840;
  h.video.dispatch('timeupdate');
  h.video.dispatch('seeked');
  assert.strictEqual(h.preparations.length, 2,
    'a Direct Play rollback beyond the 15 second decoder settlement policy must still rebuild');
  assert.strictEqual(h.preparations[1].delivery, 'direct-play',
    'the first rebuild after an excessive Direct Play rollback must cold-reopen and retry Direct Play before fallback');
}());

(function startupDirectPlayRollbackCannotStrandStreamSwitching() {
  var playback = playbackFixture();
  playback.resumePosition = 988;
  var h = harness({
    playback: playback,
    capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false }
  });
  h.video.seekable = ranges([[0, 1100]]);
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 988 });
  h.video.dispatch('canplay');
  h.video.currentTime = 981.8;
  h.video.dispatch('seeked');
  assert.strictEqual(h.preparations.length, 2,
    'the post-buffer seek rollback helper must not consume a startup mismatch that belongs to source recovery');
  assert.strictEqual(h.controller.snapshot().streamSwitching, true,
    'startup mismatch recovery must remain owned by the existing source-switch path');
}());


console.log('Playback controller core checks passed');
