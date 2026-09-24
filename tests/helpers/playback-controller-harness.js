'use strict';

var assert = require('assert');
var Controller = require('../../app/coordinator/playback-controller');
var PlaybackClock = require('../../app/playback-clock');
var PlaybackRecovery = require('../../app/playback-recovery');
var NativeVideoDriver = require('../../app/native-video-driver');
var PlaybackReposition = require('../../app/playback-reposition');
var PlaybackSession = require('../../app/playback-session');
var PlaybackTimeline = require('../../app/playback-timeline');
var PlaybackStrategy = require('../../app/playback-strategy');
var PlayerSeekController = require('../../app/player-seek-controller');
var PlayerTimelinePolicy = require('../../app/player-timeline-policy');
var PlayerBufferingIndicator = require('../../app/player-buffering-indicator');
var SubtitleSync = require('../../app/subtitle-sync');
var SubtitleRuntime = require('../../app/subtitle-runtime');
var SubtitleEditorSession = require('../../app/subtitle-editor-session');
var SubtitleOffsetStore = require('../../app/subtitle-offset-store');

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
    runLatestTimeout: function () { var ids = Object.keys(timeouts); if (ids.length) { this.runTimeout(Number(ids[ids.length - 1])); } },
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
  var playCalls = 0;
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
    get playCalls() { return playCalls; },
    addEventListener: function (name, callback) { (listeners[name] = listeners[name] || []).push(callback); },
    removeEventListener: function (name, callback) {
      listeners[name] = (listeners[name] || []).filter(function (entry) { return entry !== callback; });
    },
    dispatch: function (name) { if (name === 'playing') { this.paused = false; } if (name === 'pause') { this.paused = true; } (listeners[name] || []).slice().forEach(function (callback) { callback({ type: name }); }); if (this['on' + name]) { this['on' + name](); } },
    play: function () { playCalls += 1; this.paused = false; return { catch: function () {} }; },
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
  var closed = [];
  var directFallbacks = [];
  var openings = 0;
  var playbackLoads = 0;
  var ended = 0;
  var storageValues = {};
  var loaded = playbackFixture();
  var sessionCounter = 0;
  var capabilities = { directPlay: false, codecs: ['h264'], containers: ['mkv'], uhd: false, hdr10: false, dolbyVision: false };
  overrides = overrides || {};
  if (overrides.playback) { loaded = overrides.playback; }
  if (overrides.debugCapture) { root.PloffDebugCapture = overrides.debugCapture; }
  if (overrides.capabilities) { capabilities = overrides.capabilities; }
  var PlexClient = {
    loadPlayback: overrides.loadPlayback || function (config, key, session, preferences, callback) { callback(null, loaded); },
    preparePlayback: function (config, current, options, callback) {
      preparations.push({
        offset: Number(options.offset || 0),
        delivery: options.delivery,
        safeTranscode: options.safeTranscode === true,
        subtitle: String(options.subtitleStreamID || ''),
        localSubtitleOverlay: options.localSubtitleOverlay === true,
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
      if (overrides.loadSubtitleText) { return overrides.loadSubtitleText(config, current, track, callback); }
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
  var controllerOptions = {
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
    NativeVideoDriver: NativeVideoDriver,
    PlaybackReposition: PlaybackReposition,
    PlaybackSession: PlaybackSession,
    PlaybackOperation: require('../../app/playback-operation'),
    PlaybackTimeline: PlaybackTimeline,
    PlaybackStrategy: PlaybackStrategy,
    compatibilityMemory: overrides.compatibilityMemory,
    PlayerSeekController: PlayerSeekController,
    PlayerTimelinePolicy: PlayerTimelinePolicy,
    PlayerBufferingIndicator: PlayerBufferingIndicator,
    SubtitleSync: SubtitleSync,
    SubtitleRuntime: SubtitleRuntime,
    SubtitleEditorSession: SubtitleEditorSession,
    SubtitleOffsetStore: SubtitleOffsetStore,
    AssSubtitleRenderer: overrides.AssSubtitleRenderer,
    AssSubtitlePrefetch: overrides.AssSubtitlePrefetch,
    assSubtitlePrefetchIdentity: overrides.assSubtitlePrefetchIdentity,
    subtitleRendering: overrides.subtitleRendering || function () { return { srt: true, ass: false }; },
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
    showError: overrides.showError || function () {},
    onDirectPlaybackFailure: overrides.onDirectPlaybackFailure || function (error, retry, switchToAutomatic) {
      directFallbacks.push({ error: error, retry: retry, switchToAutomatic: switchToAutomatic });
    },
    hideError: function () {},
    onOpening: function () { openings += 1; },
    onPlaybackLoaded: function () { playbackLoads += 1; },
    playbackPreferences: function () { return {}; },
    resolveVersionTracks: overrides.resolveVersionTracks || function () { return null; },
    subtitleIdentity: function () { return 'server'; },
    translate: function (key) { return 'translated:' + key; },
    onClosed: function (position, reported, ratingKey) { closed.push({ position: position, reported: reported, ratingKey: ratingKey }); },
    onEnded: function () { ended += 1; }
  };
  if (overrides.prepare) { overrides.prepare(controllerOptions); }
  var controller = Controller.create(controllerOptions);
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
    directFallbacks: directFallbacks,
    openings: function () { return openings; },
    playbackLoads: function () { return playbackLoads; },
    ended: function () { return ended; },
    closed: closed,
    storageValues: storageValues
  };
}

function playbackEffectTrace(h) {
  return {
    sources: h.video.sourceWrites.slice(),
    seeks: h.video.seekWrites.slice(),
    preparations: h.preparations.map(function (entry) {
      return {
        offset: entry.offset,
        delivery: entry.delivery,
        safeTranscode: entry.safeTranscode,
        subtitle: entry.subtitle,
        localSubtitleOverlay: entry.localSubtitleOverlay,
        session: entry.session
      };
    }),
    timeline: h.timeline.map(function (entry) { return { state: entry.state, seconds: entry.seconds }; }),
    overlays: h.overlays.map(function (entry) {
      return { cues: entry.cues, time: entry.time, offset: entry.offset, size: entry.size };
    }),
    playCalls: h.video.playCalls,
    sourceClears: h.video.sourceClears
  };
}



module.exports = {
  harness: harness,
  playbackFixture: playbackFixture,
  playbackEffectTrace: playbackEffectTrace,
  ranges: ranges
};
