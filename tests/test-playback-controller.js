'use strict';

var assert = require('assert');
var fs = require('fs');
var path = require('path');
var Controller = require('../app/coordinator/playback-controller');
var PlaybackClock = require('../app/playback-clock');
var PlaybackRecovery = require('../app/playback-recovery');
var PlaybackStrategy = require('../app/playback-strategy');
var PlayerSeekController = require('../app/player-seek-controller');
var PlayerTimelinePolicy = require('../app/player-timeline-policy');
var PlayerBufferingIndicator = require('../app/player-buffering-indicator');
var SubtitleSync = require('../app/subtitle-sync');
var SubtitleOffsetStore = require('../app/subtitle-offset-store');

function timerRoot() {
  var nextId = 1;
  var timeouts = {};
  var intervals = {};
  return {
    navigator: { onLine: true },
    setTimeout: function (callback) { var id = nextId; nextId += 1; timeouts[id] = callback; return id; },
    clearTimeout: function (id) { delete timeouts[id]; },
    setInterval: function (callback) { var id = nextId; nextId += 1; intervals[id] = callback; return id; },
    clearInterval: function (id) { delete intervals[id]; },
    runTimeout: function (id) { var callback = timeouts[id]; delete timeouts[id]; if (callback) { callback(); } },
    runNextTimeout: function () { var ids = Object.keys(timeouts); if (ids.length) { this.runTimeout(Number(ids[0])); } },
    runAllTimeouts: function (limit) {
      var guard = Number(limit || 100);
      while (Object.keys(timeouts).length && guard > 0) {
        this.runTimeout(Number(Object.keys(timeouts)[0]));
        guard -= 1;
      }
      assert.ok(guard > 0, 'timer queue must remain bounded');
    },
    tickIntervals: function () { Object.keys(intervals).forEach(function (id) { if (intervals[id]) { intervals[id](); } }); },
    timeoutCount: function () { return Object.keys(timeouts).length; },
    intervalCount: function () { return Object.keys(intervals).length; }
  };
}

function ranges(values) {
  values = values || [];
  return {
    length: values.length,
    start: function (index) { return values[index][0]; },
    end: function (index) { return values[index][1]; }
  };
}

function fakeVideo() {
  var listeners = {};
  var source = '';
  var nativeTime = 0;
  var sourceWrites = [];
  var sourceClears = 0;
  var seekWrites = [];
  return {
    autoplay: false,
    paused: true,
    readyState: 4,
    duration: 1800,
    buffered: ranges([[0, 600]]),
    seekable: ranges([[0, 1800]]),
    error: null,
    sourceWrites: sourceWrites,
    get sourceClears() { return sourceClears; },
    seekWrites: seekWrites,
    addEventListener: function (name, callback) { (listeners[name] = listeners[name] || []).push(callback); },
    removeEventListener: function (name, callback) {
      listeners[name] = (listeners[name] || []).filter(function (entry) { return entry !== callback; });
    },
    dispatch: function (name) { if (name === 'playing') { this.paused = false; } if (name === 'pause') { this.paused = true; } (listeners[name] || []).slice().forEach(function (callback) { callback(); }); },
    play: function () { this.paused = false; return { catch: function () {} }; },
    pause: function () { this.paused = true; },
    load: function () {},
    removeAttribute: function (name) { if (name === 'src') { source = ''; sourceClears += 1; } },
    get src() { return source; },
    set src(value) { source = String(value || ''); sourceWrites.push(source); },
    get currentTime() { return nativeTime; },
    set currentTime(value) { nativeTime = Number(value); seekWrites.push(nativeTime); }
  };
}

function playbackFixture() {
  return {
    ratingKey: 'episode-1',
    duration: 1800000,
    resumePosition: 120,
    transcodeSession: 'initial',
    playbackMode: 'direct-stream',
    partId: 'part-1',
    partKey: '/library/parts/1',
    mediaIndex: 0,
    partIndex: 0,
    options: {
      audioStreamID: 'a1',
      subtitleStreamID: '',
      subtitleSize: 100,
      mediaIndex: 0,
      partIndex: 0,
      playbackMode: 'auto',
      videoQuality: 'original'
    },
    mediaVersions: [{
      mediaIndex: 0,
      partIndex: 0,
      partId: 'part-1',
      partKey: '/library/parts/1',
      fileName: 'episode.mkv',
      fileSize: 10,
      container: 'mkv',
      videoCodec: 'h264',
      width: 1920,
      height: 1080,
      audioTracks: [{ id: 'a1', selected: true }, { id: 'a2' }],
      subtitleTracks: [
        { id: 's1', format: 'srt', codec: 'srt', external: true, key: '/subtitles/1.srt', offset: 0 },
        { id: 's2', format: 'srt', codec: 'srt', location: 'embedded' }
      ]
    }],
    audioTracks: [{ id: 'a1', selected: true }, { id: 'a2' }],
    subtitleTracks: [
      { id: 's1', format: 'srt', codec: 'srt', external: true, key: '/subtitles/1.srt', offset: 0 },
      { id: 's2', format: 'srt', codec: 'srt', location: 'embedded' }
    ]
  };
}

function harness(overrides) {
  var root = timerRoot();
  var video = fakeVideo();
  var timeline = [];
  var preparations = [];
  var offsets = [];
  var selections = [];
  var statuses = [];
  var loading = [];
  var overlays = [];
  var errors = [];
  var metadataCalls = [];
  var adjacentStarted = [];
  var closed = [];
  var directFallbacks = [];
  var ended = 0;
  var storageValues = {};
  var loaded = playbackFixture();
  var sessionCounter = 0;
  var capabilities = { directPlay: false, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false };
  overrides = overrides || {};
  if (overrides.playback) { loaded = overrides.playback; }
  if (overrides.capabilities) { capabilities = overrides.capabilities; }
  var PlexClient = {
    loadPlayback: overrides.loadPlayback || function (config, key, session, preferences, callback) { callback(null, loaded); },
    preparePlayback: function (config, current, options, callback) {
      preparations.push({
        offset: Number(options.offset || 0),
        delivery: options.delivery,
        safeTranscode: options.safeTranscode === true,
        session: current.transcodeSession
      });
      current.playbackMode = options.delivery === 'direct-play' ? 'direct-play' : (options.delivery === 'direct-stream' ? 'direct-stream' : 'transcode-video');
      if (overrides.preparePlayback) { return overrides.preparePlayback(config, current, options, callback); }
      callback(null, 'https://stream/' + current.transcodeSession + '/' + Number(options.offset || 0));
      return null;
    },
    rotateTranscodeSession: function (current) { sessionCounter += 1; current.transcodeSession = 'session-' + sessionCounter; },
    sendTimeline: function (config, current, state, milliseconds, callback) {
      timeline.push({ state: state, seconds: milliseconds / 1000 });
      if (overrides.sendTimeline) { overrides.sendTimeline(config, current, state, milliseconds, callback); }
      else if (callback) { callback(); }
    },
    pingTranscode: function () {},
    setStreamSelection: function (config, current, options, callback) {
      selections.push({ audio: options.audioStreamID, subtitle: options.subtitleStreamID });
      callback(null);
    },
    loadSubtitleText: function (config, current, track, callback) {
      callback(null, '1\n00:00:00,000 --> 00:00:02,000\nHello\n');
      return { abort: function () {} };
    },
    setSubtitleOffset: function (config, streamId, offset, callback) {
      offsets.push({ id: streamId, offset: offset });
      if (overrides.setSubtitleOffset) { overrides.setSubtitleOffset(config, streamId, offset, callback); }
      else { callback(null); }
    },
    loadMetadata: overrides.loadMetadata || function (config, key, callback) { metadataCalls.push(key); callback(null, { ratingKey: key }); }
  };
  var controller = Controller.create({
    root: root,
    document: { hidden: false, addEventListener: function () {}, removeEventListener: function () {} },
    video: video,
    config: {},
    storage: {
      getItem: function (key) { return Object.prototype.hasOwnProperty.call(storageValues, key) ? storageValues[key] : null; },
      setItem: function (key, value) { storageValues[key] = String(value); },
      removeItem: function (key) { delete storageValues[key]; }
    },
    PlexClient: PlexClient,
    PlaybackClock: PlaybackClock,
    PlaybackRecovery: PlaybackRecovery,
    PlaybackStrategy: PlaybackStrategy,
    PlayerSeekController: PlayerSeekController,
    PlayerTimelinePolicy: PlayerTimelinePolicy,
    PlayerBufferingIndicator: PlayerBufferingIndicator,
    SubtitleSync: SubtitleSync,
    SubtitleOffsetStore: SubtitleOffsetStore,
    capabilities: function () { return capabilities; },
    isActive: function () { return true; },
    isOffline: function () { return false; },
    setStatus: function (status) { statuses.push(status); },
    setLoading: function (value, preserve) { loading.push({ value: value, preserve: preserve }); },
    renderProgress: function () {},
    renderPlaybackInfo: function () {},
    renderSubtitleOverlay: function (cues, time, offset, size) { overlays.push({ cues: cues.length, time: time, offset: offset, size: size }); },
    hideSubtitleOverlay: function () {},
    onError: function (error) { errors.push(error); },
    showError: function () {},
    onDirectPlaybackFailure: overrides.onDirectPlaybackFailure || function (error, retry, switchToAutomatic) {
      directFallbacks.push({ error: error, retry: retry, switchToAutomatic: switchToAutomatic });
    },
    hideError: function () {},
    playbackPreferences: function () { return {}; },
    resolveVersionTracks: overrides.resolveVersionTracks || function () { return null; },
    subtitleIdentity: function () { return 'server'; },
    translate: function (key) { return 'translated:' + key; },
    resolveAdjacent: overrides.resolveAdjacent,
    onAdjacentStarted: function (target) { adjacentStarted.push(target); },
    onClosed: function (position, reported, ratingKey) { closed.push({ position: position, reported: reported, ratingKey: ratingKey }); },
    onEnded: function () { ended += 1; }
  });
  return {
    root: root,
    video: video,
    controller: controller,
    playback: loaded,
    timeline: timeline,
    preparations: preparations,
    offsets: offsets,
    selections: selections,
    statuses: statuses,
    loading: loading,
    overlays: overlays,
    errors: errors,
    metadataCalls: metadataCalls,
    adjacentStarted: adjacentStarted,
    directFallbacks: directFallbacks,
    ended: function () { return ended; },
    closed: closed,
    storageValues: storageValues
  };
}


(function exclusiveNativePlaybackOwnership() {
  var repositoryRoot = path.join(__dirname, '..');
  var controllerPath = path.join(repositoryRoot, 'app/coordinator/playback-controller.js');
  var controllerSource = fs.readFileSync(controllerPath, 'utf8');
  var legacySource = fs.readdirSync(path.join(repositoryRoot, 'app/coordinator')).filter(function (file) {
    return /\.js$/.test(file) && file !== 'playback-controller.js';
  }).map(function (file) {
    return fs.readFileSync(path.join(repositoryRoot, 'app/coordinator', file), 'utf8');
  }).join('\n');
  assert.ok(/video\.currentTime\s*=/.test(controllerSource), 'the playback controller must own native currentTime assignment');
  assert.ok(/video\.src\s*=/.test(controllerSource), 'the playback controller must own native source assignment');
  assert.ok(/PlexClient\.sendTimeline\(/.test(controllerSource), 'the playback controller must own Plex timeline reporting');
  assert.ok(/current\.offsetBase\s*=/.test(controllerSource), 'the playback controller must own stream-offset mutation');
  assert.ok(!/\bvideo\.currentTime\s*=/.test(legacySource), 'legacy coordinators must not assign native currentTime');
  assert.ok(!/\bvideo\.src\s*=/.test(legacySource), 'legacy coordinators must not assign the native video source');
  assert.ok(!/PlexClient\.sendTimeline\(/.test(legacySource), 'legacy coordinators must not report Plex timelines');
  assert.ok(!/\.offsetBase\s*=/.test(legacySource), 'legacy coordinators must not mutate stream offsets');
}());

(function apiContract() {
  var h = harness();
  assert.deepStrictEqual(Object.keys(h.controller).sort(), [
    'applySubtitleEditor', 'cancelSubtitleEditor', 'changeTrack', 'changeVersion', 'close', 'destroy',
    'diagnostics', 'open', 'openSubtitleEditor', 'seekAbsolute', 'snapshot', 'startAdjacent', 'startItem', 'toggle'
  ].sort(), 'the playback controller must expose only the planned public API');
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

(function automaticTrackFailureRetainsNativeFallback() {
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
    'transcode', 'safe-transcode', 'direct-play', 'direct-stream'
  ], 'Automatic playback must retain native attempts after selected-track transcoding fails');
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

(function terminalSeekUsesAnExactOffsetStream() {
  var h = harness({ capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false } });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.controller.seekAbsolute(1800, { immediate: true, forceRebuild: true });
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 1789, 'a terminal Direct Stream seek must start eleven seconds before the media end to retain keyframe context');
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-stream', 'a terminal Direct Stream seek must not force transcoding');
  assert.strictEqual(h.playback.terminalEndPause, true, 'a final-five-second seek must request a paused terminal state');
  assert.strictEqual(h.playback.terminalSeekTarget, 1800, 'the terminal target must remain the authoritative absolute Plex position');
  assert.strictEqual(h.playback.terminalNativeSeekTarget, 11, 'the terminal target must be translated to the replacement stream clock');
}());

(function terminalWindowUsesTheSameAbsoluteClockBeforeTheFinalFiveSeconds() {
  var h = harness({ capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false } });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.controller.seekAbsolute(1792, { immediate: true, forceRebuild: true });
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 1789, 'a seek eight seconds before the end must use the fixed eleven-second Direct Stream window');
  assert.strictEqual(h.playback.terminalNativeSeekTarget, 3, 'the eight-second absolute target must remain three seconds into the replacement stream');
  assert.strictEqual(h.playback.terminalEndPause, false, 'a seek more than five seconds before the end must continue normally');
}());

(function finalFiveSecondsJumpToPausedMediaEnd() {
  var h = harness({ capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false } });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.controller.seekAbsolute(1796, { immediate: true });
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 1789, 'a seek inside the final five seconds must use the Direct Stream tail window');
  assert.strictEqual(h.playback.terminalEndPause, true, 'a final-five-second seek must request a paused terminal state');
  h.video.duration = 11;
  h.video.dispatch('canplay');
  assert.ok(h.video.currentTime > 10.9, 'the terminal pause must seek to the end of the replacement stream');
  h.video.dispatch('seeked');
  h.root.runAllTimeouts();
  assert.strictEqual(h.video.paused, true, 'the final-five-second seek must remain paused');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 1800, 'the paused terminal state must expose the authoritative media duration');
  assert.strictEqual(h.ended(), 1, 'the paused terminal state must hand control to the existing Up Next path once');
}());

(function terminalSeekCannotUseTheCurrentEndRange() {
  var h = harness({ capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false } });
  h.video.buffered = ranges([[0, 1800]]);
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.controller.seekAbsolute(1800, { immediate: true, forceRebuild: true });
  assert.strictEqual(h.preparations.length, 2, 'a terminal seek must rebuild even when the current stream reports the end as buffered');
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 1789, 'the terminal rebuild must retain Direct Stream and request a bounded lookback');
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-stream', 'the terminal rebuild must not request transcoding');
}());

(function fractionalDurationStillUsesAnExactTerminalStream() {
  var playback = playbackFixture();
  var h;
  playback.duration = 3339083;
  h = harness({ playback: playback, capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false } });
  h.video.buffered = ranges([[0, 3339.083]]);
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.controller.seekAbsolute(3330, { immediate: true, forceRebuild: true });
  assert.strictEqual(h.preparations.length, 2, 'a whole-second TV seek at the terminal guard must rebuild a fractional-duration stream');
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 3328, 'the rebuilt stream must use an eleven-second Direct Stream lookback for fractional durations');
  assert.strictEqual(h.playback.terminalNativeSeekTarget, 2, 'fractional durations must preserve the exact relative terminal seek');
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-stream', 'fractional Plex durations must remain Direct Stream');
}());

(function publicTimelineNeverExceedsPlexDurationAfterTerminalSeek() {
  var h = harness({ capabilities: { directPlay: true, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false } });
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 120 });
  h.video.dispatch('playing');
  h.controller.seekAbsolute(1792, { immediate: true, forceRebuild: true });
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 1789, 'terminal protection must use the Direct Stream lookback');
  h.video.dispatch('canplay');
  h.root.runAllTimeouts();
  assert.strictEqual(h.video.currentTime, 3, 'the replacement stream must seek to the terminal target relative to its offset');
  h.video.dispatch('seeked');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 1792, 'the verified relative seek must restore the absolute terminal target');
  h.video.dispatch('playing');
  h.video.currentTime = 20;
  h.video.dispatch('timeupdate');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 1800, 'a native tail beyond Plex duration must be hidden from the public timeline');
  h.video.dispatch('ended');
  assert.strictEqual(h.controller.snapshot().positionSeconds, 1800, 'ended playback must remain anchored at the authoritative duration');
  assert.strictEqual(h.timeline[h.timeline.length - 1].seconds, 1800, 'terminal Plex reporting must never exceed the media duration');
  h.controller.seekAbsolute(1700, { immediate: true });
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 1700, 'an explicit backward seek must remain available after terminal normalization');
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-stream', 'leaving the terminal guard must restore the ordinary Direct Stream path');
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

(function directPlayFallbackForUnsafeSeek() {
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
  assert.strictEqual(h.preparations[h.preparations.length - 1].delivery, 'direct-stream', 'an unsafe Direct Play seek must advance to an offset-capable Direct Stream');
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 300, 'the Direct Stream fallback must start at the requested absolute position');
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
  assert.strictEqual(h.controller.snapshot().buffering, false, 'playing must clear the buffering state');
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

(function externalSubtitlePreviewKeepsServerRenderingAndTracksCurrentSeekPosition() {
  var h = harness();
  h.playback.options.subtitleStreamID = 's1';
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  var preparations = h.preparations.length;
  assert.strictEqual(h.controller.openSubtitleEditor(), true);
  assert.strictEqual(h.controller.snapshot().subtitleEditor.loop, false, 'Loop 5s must remain opt-in as in the verified editor');
  assert.strictEqual(h.root.intervalCount(), 1, 'external subtitles keep only the transcode keepalive and do not start the local 50ms overlay clock');
  assert.strictEqual(h.preparations.length, preparations, 'opening an external subtitle editor must preserve the already selected server stream');
  h.controller.openSubtitleEditor({ action: 'adjust-offset', delta: 250 });
  h.root.runAllTimeouts(20);
  assert.ok(h.offsets.some(function (entry) { return entry.id === 's1' && entry.offset === 250; }), 'external preview must write the temporary offset to Plex');
  assert.strictEqual(h.preparations[h.preparations.length - 1].offset, 40, 'external preview rebuilds must preserve the absolute playback position');
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  h.video.currentTime = 7;
  h.video.dispatch('timeupdate');
  h.controller.openSubtitleEditor({ action: 'seek', delta: 10 });
  assert.strictEqual(h.controller.snapshot().subtitleEditor.bounds.start, 57, 'editor timeline movement must be relative to the live absolute clock, not the original capture point');
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
  h.playback.options.subtitleStreamID = 's1';
  h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: 40 });
  h.video.dispatch('canplay');
  h.root.runAllTimeouts(20);
  h.video.dispatch('playing');
  h.controller.openSubtitleEditor();
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

console.log('Playback controller checks passed');
