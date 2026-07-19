'use strict';

var assert = require('assert');
var SubtitleSync = require('../app/subtitle-sync');

assert.deepStrictEqual(SubtitleSync.classify({ id: '1', codec: 'srt', key: '/library/streams/1' }), {
  supported: true,
  kind: 'external-text',
  codec: 'srt'
}, 'external SRT must support server-persisted synchronization');
assert.strictEqual(SubtitleSync.classify({ id: '2', codec: 'webvtt', external: false }).kind, 'embedded-text', 'embedded WebVTT must support local synchronization');
assert.strictEqual(SubtitleSync.classify({ id: '3', codec: 'subrip', external: false }).supported, true, 'embedded SubRip text must be convertible');
['ass', 'ssa', 'pgs', 'vobsub', 'dvd_subtitle'].forEach(function (codec) {
  assert.strictEqual(SubtitleSync.classify({ codec: codec }).supported, false, codec + ' must remain unsupported');
});

var tracks = [
  { id: 'srt', codec: 'srt', key: '/library/streams/srt' },
  { id: 'pgs', codec: 'pgs' }
];
assert.strictEqual(SubtitleSync.availability('', tracks, {}).enabled, true, 'Off must still open the editor when a compatible track exists');
assert.strictEqual(SubtitleSync.availability('srt', tracks, {}).enabled, true, 'a selected text track must open the editor');
assert.deepStrictEqual(SubtitleSync.availability('pgs', tracks, {}), { enabled: false, reason: 'unsupported', track: tracks[1] }, 'a selected image track must disable the editor');
assert.strictEqual(SubtitleSync.availability('srt', tracks, { srt: true }).enabled, false, 'a failed runtime conversion must disable that stream for the session');
assert.strictEqual(SubtitleSync.availability('', [{ id: 'pgs', codec: 'pgs' }], {}).enabled, false, 'Off without compatible tracks must disable the editor');

var srt = [
  '1',
  '00:00:01,000 --> 00:00:03,000',
  'Hello',
  'world',
  '',
  '2',
  '00:01:04.250 --> 00:01:05.500',
  'Second cue',
  ''
].join('\n');
var cues = SubtitleSync.parse(srt);
assert.deepStrictEqual(cues, [
  { start: 1000, end: 3000, text: 'Hello\nworld' },
  { start: 64250, end: 65500, text: 'Second cue' }
], 'SRT parsing must preserve multiline text and millisecond timing');

var webvtt = [
  'WEBVTT',
  '',
  'cue-one',
  '00:02.000 --> 00:04.500 align:middle',
  '<i>Styled text</i>',
  '',
  'broken',
  'not a timestamp',
  'ignored',
  ''
].join('\n');
assert.deepStrictEqual(SubtitleSync.parse(webvtt), [
  { start: 2000, end: 4500, text: '<i>Styled text</i>' }
], 'WebVTT parsing must accept identifiers and ignore malformed blocks');

assert.deepStrictEqual(SubtitleSync.shift(cues.slice(0, 1), 500), [
  { start: 1500, end: 3500, text: 'Hello\nworld' }
], 'cue shifting must return adjusted copies');
assert.strictEqual(cues[0].start, 1000, 'cue shifting must not mutate source cues');
assert.strictEqual(SubtitleSync.active(cues, 1500, 500)[0].text, 'Hello\nworld', 'positive offsets must delay display time');
assert.strictEqual(SubtitleSync.active(cues, 1200, 500).length, 0, 'a delayed cue must remain hidden before its shifted start');
assert.strictEqual(SubtitleSync.active(cues, 900, -500)[0].text, 'Hello\nworld', 'negative offsets must advance display time');

assert.deepStrictEqual(SubtitleSync.loopBounds(42, 100), { start: 37, end: 42 }, 'the preview loop must cover the five seconds before entry');
assert.deepStrictEqual(SubtitleSync.loopBounds(3, 100), { start: 0, end: 3 }, 'the preview loop must clamp at media start');
assert.deepStrictEqual(SubtitleSync.loopBounds(120, 100), { start: 95, end: 100 }, 'the preview loop must clamp at media duration');
assert.strictEqual(SubtitleSync.adjust(0, 100), 100, 'offset controls must move in milliseconds');
assert.strictEqual(SubtitleSync.adjust(599950, 100), 600000, 'positive offsets must clamp at ten minutes');
assert.strictEqual(SubtitleSync.adjust(-599950, -100), -600000, 'negative offsets must clamp at ten minutes');

console.log('Subtitle synchronization checks passed');
