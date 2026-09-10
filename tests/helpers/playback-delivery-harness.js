'use strict';

var Fixture = require('./playback-controller-harness');
var PlaybackUrls = require('../../app/plex-playback-urls');

// Real player owners; substitute only the native device, Plex and ASS output boundary.
function create(delivery, options) {
  var values = options || {};
  var playback = Fixture.playbackFixture();
  var renderer = { loads: 0, disposals: 0, visible: false, time: null, paused: true, epochs: [], frames: [], clocks: [] };
  var track = { id: 'local-ass', format: 'ass', codec: 'ass', external: true, key: '/subtitles/test.ass', offset: values.subtitleOffset || 0 };
  var h;
  if (values.subtitleKind === 'srt') { track.id = 'local-srt'; track.codec = 'srt'; track.format = 'srt'; track.key = '/subtitles/test.srt'; }
  if (values.subtitleKind === 'embedded-ass') { track.external = false; track.location = 'embedded'; delete track.key; }
  if (values.forcedTranscode) { playback.options.playbackMode = 'transcode'; }
  playback.options.subtitleStreamID = values.noSubtitles || values.subtitleKind === 'off' ? '' : track.id;
  playback.subtitleTracks = [track];
  playback.mediaVersions[0].subtitleTracks = playback.subtitleTracks;
  h = Fixture.harness({
    playback: playback,
    capabilities: { directPlay: delivery === 'direct-play' || delivery === 'direct-stream', codecs: ['h264'], containers: ['mkv'] },
    compatibilityMemory: delivery === 'direct-stream' ? { shouldSkip: function (request) { return request.kind === 'direct-play'; } } : null,
    subtitleRendering: function () { return { ass: values.subtitleKind !== 'burned', srt: true }; },
    loadSubtitleText: function (config, current, selected, callback) {
      callback(null, selected.codec === 'srt' ? '1\n00:00:00,000 --> 00:59:59,999\nSynthetic timing fixture\n' : '[Script Info]\nTitle: synthetic timing fixture');
    },
    preparePlayback: values.preparePlayback || (values.decisions ? function (config, current, options, callback) {
      current.playbackMode = PlaybackUrls.playbackModeFromDecisions(values.decisions.video, values.decisions.audio);
      callback(null, 'https://example.invalid/' + current.transcodeSession);
      return null;
    } : undefined),
    prepare: values.prepare,
    AssSubtitleRenderer: {
      create: function () {
        return {
          load: function (content, callback) { renderer.loads += 1; callback(null); },
          setTime: function (time, paused) {
            renderer.time = time;
            renderer.paused = paused;
            renderer.clocks.push({ time: time, paused: paused });
          },
          discontinuity: function (time) { renderer.epochs.push(time); },
          show: function () { renderer.visible = true; renderer.frames.push(renderer.time); },
          hide: function () { renderer.visible = false; },
          dispose: function () { renderer.disposals += 1; renderer.visible = false; },
          setSize: function () {}
        };
      }
    }
  });
  h.renderer = renderer;
  h.sourceReady = function (nativeTime, play) {
    h.video.currentTime = nativeTime === undefined ? 0 : nativeTime;
    h.video.readyState = 4;
    h.video.dispatch('canplay');
    if (h.controller.snapshot().nativeSeekPending) { h.video.dispatch('seeked'); }
    h.root.runAllTimeouts(20);
    if (play !== false) { h.video.dispatch('playing'); }
  };
  h.start = function (offset) {
    h.controller.open({ detail: { ratingKey: 'episode-1' }, startOffset: offset === undefined ? 100 : offset });
    h.sourceReady();
    if (delivery === 'safe-transcode') {
      h.video.error = { code: 3 };
      h.video.dispatch('error');
      h.root.runAllTimeouts(20);
      h.video.error = null;
      h.sourceReady();
    }
  };
  h.sample = function (nativeTime) { h.video.currentTime = nativeTime; h.video.dispatch('timeupdate'); };
  return h;
}

module.exports = { create: create, ranges: Fixture.ranges };
