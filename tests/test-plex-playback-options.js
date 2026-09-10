'use strict';

var assert = require('assert');
var MediaPreferences = require('../app/media-preferences');

assert.strictEqual(typeof MediaPreferences.resolvePlaybackOptions, 'function', 'playback option materialization must be owned by MediaPreferences');

(function characterizesPlaybackOptionResolution() {
  var cases = [
    {
      name: 'explicit per-media track preferences override global selection and materialize transcode settings',
      playback: {
        audioTracks: [
          { id: 'a1', languageTag: 'en', selected: true, external: false },
          { id: 'a2', languageTag: 'ja', title: 'Japanese', codec: 'aac', channels: 2, external: false }
        ],
        subtitleTracks: [
          { id: 's1', languageTag: 'en', selected: true, external: false },
          { id: 's2', languageTag: 'it', title: 'Italian', codec: 'srt', external: true, key: '/stream/s2' }
        ],
        options: { subtitleSize: 90, offset: 120, videoQuality: '12000', playbackMode: 'direct-stream', mediaIndex: 1, partIndex: 2 }
      },
      preferences: {
        audioTrackPreference: { language: 'ja', name: 'japanese', codec: 'aac', channels: 2, external: false },
        subtitleTrackPreference: { language: 'it', name: 'italian', codec: 'srt', channels: 0, external: true },
        subtitleSize: 110,
        videoQuality: 'original',
        playbackMode: 'transcode',
        mediaIndex: 3,
        partIndex: 4
      },
      expected: {
        audioStreamID: 'a2', subtitleStreamID: 's2', subtitleSize: 110, offset: 120,
        videoQuality: 'original', playbackMode: 'transcode', mediaIndex: 3, partIndex: 4
      }
    },
    {
      name: 'off mode and missing streams preserve current direct play fields',
      playback: {
        audioTracks: [], subtitleTracks: [],
        options: { subtitleSize: 125, offset: 9, videoQuality: '8000', playbackMode: 'direct-play' }
      },
      preferences: { subtitleMode: 'off' },
      expected: {
        audioStreamID: '', subtitleStreamID: '', subtitleSize: 125, offset: 9,
        videoQuality: '8000', playbackMode: 'direct-play'
      }
    },
    {
      name: 'forced mode falls back to any forced subtitle after language preferences miss',
      playback: {
        audioTracks: [{ id: 'a1', languageTag: 'fr' }],
        subtitleTracks: [{ id: 's1', languageTag: 'de', forced: true, selected: false }],
        options: {}
      },
      preferences: { subtitleMode: 'forced', subtitleLanguages: ['it'], audioLanguages: ['ja'] },
      expected: {
        audioStreamID: 'a1', subtitleStreamID: 's1', subtitleSize: 100, offset: 0,
        videoQuality: 'original', playbackMode: 'auto'
      }
    },
    {
      name: 'audio mismatch with no preferred subtitle language retains selected subtitles',
      playback: {
        audioTracks: [{ id: 'a1', languageTag: 'it', selected: true }],
        subtitleTracks: [{ id: 's1', languageTag: 'it', selected: true }],
        options: {}
      },
      preferences: { subtitleMode: 'audio-mismatch', subtitleLanguages: [] },
      expected: {
        audioStreamID: 'a1', subtitleStreamID: 's1', subtitleSize: 100, offset: 0,
        videoQuality: 'original', playbackMode: 'auto'
      }
    },
    {
      name: 'current media version indices survive when no override is supplied',
      playback: {
        audioTracks: [], subtitleTracks: [],
        options: { mediaIndex: 2, partIndex: 7, subtitleSize: 80, offset: 44, playbackMode: 'transcode' }
      },
      preferences: {},
      expected: {
        audioStreamID: '', subtitleStreamID: '', subtitleSize: 80, offset: 44,
        videoQuality: 'original', playbackMode: 'transcode', mediaIndex: 2, partIndex: 7
      }
    },
    {
      name: 'audio suppression wins over always-on subtitles',
      playback: {
        audioTracks: [{ id: 'a-ja', languageTag: 'ja' }],
        subtitleTracks: [{ id: 's-it', languageTag: 'it', selected: true }],
        options: {}
      },
      preferences: {
        audioLanguages: ['ja'], subtitleLanguages: ['it'], subtitleMode: 'always',
        subtitleSuppressedForAudio: ['ja']
      },
      expected: {
        audioStreamID: 'a-ja', subtitleStreamID: '', subtitleSize: 100, offset: 0,
        videoQuality: 'original', playbackMode: 'auto'
      }
    }
  ];

  cases.forEach(function (fixture) {
    assert.deepStrictEqual(
      MediaPreferences.resolvePlaybackOptions(fixture.playback, fixture.preferences),
      fixture.expected,
      fixture.name
    );
  });
}());


console.log('Plex playback option characterization passed');
